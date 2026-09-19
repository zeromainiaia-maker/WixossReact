import { buildEffectsMap } from '../../../data/effectParser';
import { calcFieldPowers, collectGrantedFromUnderSigni, collectGrantedFromLayer, collectGrantedFromAcce, collectGrantedFromSoul, collectCopiedLrigContinuousEffects, applyTimedBaseLevelOverrides } from '../../../engine/effectEngine';
import { getCardNum } from '../../../engine/effectExecutor';
import { effectiveIdentityOverrides } from '../../../engine/nameIdentityRules';
import type { BattleStateRow, CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { allAcceCards } from '../../../utils/acce';
import { InstanceMap } from '../battleUtils';

/**
 * 🆕**盤面の「材料」を画面なしで作る3本**（§5.7 `S-5d` 第3段・2026-09-19）。
 *
 * ■ **なぜ要るか**＝`PerformCtx` の `cardMap` / `effectsMap` / `effectivePowers` は
 *   **`BattleScreen` の `useMemo` の中にしか無かった**＝実行関数も対話の解決も `controller/` へ出たのに、
 *   **材料だけは画面を描かないと作れない**という逆転が残っていた（ヘッドレスの対戦ループはここで止まる）。
 * ■ **中身は逐語移設**（画面の3つの `useMemo` の本体をそのまま）＝読み替えているのは**材料の取り出し方だけ**で、
 *   `bs` / `user.id` / `battleCardMap` … は**画面と同じ名前**に束ね直してある。
 *
 * ⚠**`userId` は「見ている人」だけを決める**＝3本とも両側の盤面を見て合成するので、席を入れ替えても結果は変わらない
 *   （`myS`/`opS` のラベル付けだけ）。画面は自分の ID、ヘッドレスは駆動している側の ID を渡す。
 */

/** 画面の `battleCardMap`（instance 単位の差し替え＋期間つきの基本レベル上書き）を作る。 */
export function buildBattleCardMap(p: { bs: BattleStateRow | null; baseCards: CardData[]; userId: string }): Map<string, CardData> {
  const { bs, baseCards } = p;
  const user = { id: p.userId };
    const base = new InstanceMap(baseCards.map(c => [c.CardNum, c] as [string, CardData]));
    if (!bs) return base;
    const localIsHost = user.id === bs.host_id;
    const myState = localIsHost ? bs.host_state : bs.guest_state;
    const opState = localIsHost ? bs.guest_state : bs.host_state;
    // 🆕§5.3 `O-306`＝instance 単位の差し替えに**宣言名の変身規則**を合成する（後から領域へ来たカードにも効く）。
    const allOverrides = { ...effectiveIdentityOverrides(myState, base), ...effectiveIdentityOverrides(opState, base) };
    // 🆕§5.3 `O-375`＝**期間つきの基本レベル上書き**（`attack_phase_level_overrides` ほか）を UI の写しにも載せる。
    //   🔴旧＝engine の解決 ctx（declaredCardMap）でしか通らず、この map を直接読むグロウ候補・シグニ配置のレベル上限・
    //     アーツ使用条件などには**一時レベル変更が1つも届いていなかった**（`SP38-005-E1`／`SET_BASE_LEVEL{until}`）。
    //   ⚠差し替え（ZERO 化等）の**後**に当てる＝engine の funnel と同じ順（差し替え後のカードのレベルを上書き）。
    //   ⚠【常】の宣言は載せない（盤面から毎回評価する側＝焼くと解決中に戻らない）。値は「設定」なので下流で重ねても冪等。
    if (Object.keys(allOverrides).length === 0) return applyTimedBaseLevelOverrides(base, myState, opState);
    // card_identity_overrides: instanceId → 差し替えCardNumのカードデータに解決
    const resolved = new Map<string, CardData>(base as Map<string, CardData>);
    for (const [instanceId, overrideNum] of Object.entries(allOverrides)) {
      const overrideCard = base.get(overrideNum);
      if (overrideCard) resolved.set(instanceId, overrideCard);
    }
    return applyTimedBaseLevelOverrides(new InstanceMap(resolved), myState, opState);
}

/** 画面の `baseEffectsMap`（カードデータだけの静的な効果表）。 */
export function buildBaseEffectsMap(battleCards: CardData[]): InstanceMap<CardEffect[]> {
  return new InstanceMap(buildEffectsMap(battleCards));
}

/** 画面の `effectsMap`（granted_effects ＋ 下カード付与 ＋ card_identity_overrides を加味した augmented 効果表）。 */
export function buildAugmentedEffectsMap(p: {
  bs: BattleStateRow | null; baseEffectsMap: InstanceMap<CardEffect[]>;
  cardMap: Map<string, CardData>; userId: string;
}): InstanceMap<CardEffect[]> {
  const { bs, baseEffectsMap, cardMap: battleCardMap } = p;
  const user = { id: p.userId };
    if (!bs) return baseEffectsMap;
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;

    // granted_effects（ターン終了まで）と granted_effects_until_opp_turn（次の相手ターン終了まで）を
    // instanceId 単位で配列結合してマージ（同一キーで一方が欠落しないように）。
    const mergeGranted = (
      a: Record<string, import('../../../types/effects').CardEffect[]>,
      b: Record<string, import('../../../types/effects').CardEffect[]>,
    ): Record<string, import('../../../types/effects').CardEffect[]> => {
      const out: Record<string, import('../../../types/effects').CardEffect[]> = { ...a };
      for (const [k, v] of Object.entries(b)) out[k] = [...(out[k] ?? []), ...v];
      return out;
    };
    // 🔴「ターン終了時まで、〜は**効果によって得ている能力**を失う」（§5.3 `O-130`）＝
    //   `granted_abilities_removed` に載ったカードは付与ぶんを**この合成の時点で**空にする
    //   （augmented effectsMap が engine 全体の読み口なので、ここを通せば消費地点が1つで済む）。
    //   ⚠印刷能力は消さない＝`abilities_removed`（全能力喪失）とは別軸。
    const dropLost = (
      m: Record<string, import('../../../types/effects').CardEffect[]>, st: typeof myS,
    ): Record<string, import('../../../types/effects').CardEffect[]> => {
      const lost = st.granted_abilities_removed;
      if (!lost?.length) return m;
      const out: Record<string, import('../../../types/effects').CardEffect[]> = {};
      for (const [k, v] of Object.entries(m)) {
        if (lost.includes(k) || lost.includes(getCardNum(k))) continue;
        out[k] = v;
      }
      return out;
    };
    const myGranted = dropLost(mergeGranted(myS.granted_effects ?? {}, myS.granted_effects_until_opp_turn ?? {}), myS);
    const opGranted = dropLost(mergeGranted(opS.granted_effects ?? {}, opS.granted_effects_until_opp_turn ?? {}), opS);
    const hasGranted = Object.keys(myGranted).length > 0 || Object.keys(opGranted).length > 0;

    // スタックあり（ライズ）ゾーンの有無チェック
    const hasStack = [...myS.field.signi, ...opS.field.signi].some(s => s && s.length >= 2);

    // card_identity_overrides（サーバントZERO等）
    // ⚠`battleCardMap` と**同じ funnel** を通す＝片方だけ規則を見ると「見た目は ZERO なのに能力は元のまま」になる。
    const myOverrides = effectiveIdentityOverrides(myS, battleCardMap);
    const opOverrides = effectiveIdentityOverrides(opS, battleCardMap);
    const hasOverrides = Object.keys(myOverrides).length > 0 || Object.keys(opOverrides).length > 0;

    // レイヤー等のフィールド付与（GRANT_FIELD_SIGNI_ABILITY）持ちシグニの有無チェック
    const hasFieldGrant = [...myS.field.signi, ...opS.field.signi].some(s => {
      const top = s?.at(-1);
      if (!top) return false;
      return (baseEffectsMap.get(top) ?? []).some(e =>
        // 🔴**SEQUENCE の中も見る**（2026-08-28・Sheet1 残8枚バッチ・実機で発見）＝
        //   「このシグニのパワーは＋Nされ／基本パワーはNになり、このシグニは「【自】…」を得る」の連用中止形は
        //   `SEQUENCE[POWER_MODIFY|POWER_SET, GRANT_FIELD_SIGNI_ABILITY]` になる。
        //   `collectContinuousGrantedAbilities`（`effectEngine.ts:6535`）は**この形を明示的に走査している**のに、
        //   ここのゲートが action 直下しか見ていなかったので **effectsMap が付与つきで組み直されず、
        //   付与された【自】が1度も収集されなかった**（実測 live 11効果）。
        //   ⚠すぐ下の `hasPlayerFieldGrant`（プレイヤー付与）は最初から SEQUENCE を見ており、**片側だけの穴**だった。
        e.effectType === 'CONTINUOUS' && (e.action.type === 'GRANT_FIELD_SIGNI_ABILITY'
          || (e.action.type === 'SEQUENCE' && e.action.steps.some(a => a.type === 'GRANT_FIELD_SIGNI_ABILITY'))));
    });
    const hasPlayerFieldGrant = [myS, opS].some(st => (st.game_granted_effects ?? []).some(e =>
      e.effectType === 'CONTINUOUS' && (e.action.type === 'GRANT_FIELD_SIGNI_ABILITY'
        || (e.action.type === 'SEQUENCE' && e.action.steps.some(a => a.type === 'GRANT_FIELD_SIGNI_ABILITY'))),
    ));

    // アクセ付与（GRANT_ACCE_HOST_ABILITY）持ちアクセカードの有無チェック
    const hasAcceGrant = [...allAcceCards(myS.field), ...allAcceCards(opS.field)].some(acceNum => {
      return (baseEffectsMap.get(acceNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'GRANT_ACCE_HOST_ABILITY');
    });

    // ソウル付与（GRANT_SOUL_HOST_ABILITY）持ちソウルカードの有無チェック
    const hasSoulGrant = [...(myS.field.signi_soul ?? []), ...(opS.field.signi_soul ?? [])].some(soulNum => {
      if (!soulNum) return false;
      return (baseEffectsMap.get(soulNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'GRANT_SOUL_HOST_ABILITY');
    });

    // COPY_LRIG_NAME_ABILITY で「そのルリグの【常】能力を得る」センタールリグの有無チェック
    const hasCopyLrigCont = [myS, opS].some(st => {
      const top = st.field.lrig.at(-1);
      if (!top) return false;
      const txt = battleCardMap.get(top)?.EffectText ?? '';
      if (!/そのルリグの【常】能力を得る/.test(txt)) return false;
      return (baseEffectsMap.get(top) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' &&
        (e.action as import('../../../types/effects').StubAction).id === 'COPY_LRIG_NAME_ABILITY');
    });

    if (!hasGranted && !hasStack && !hasOverrides && !hasFieldGrant && !hasPlayerFieldGrant && !hasAcceGrant && !hasSoulGrant && !hasCopyLrigCont) return baseEffectsMap;

    // 🔴**`InstanceMap` で組む**（2026-08-28・Sheet1 残8枚バッチ・実機で発見）＝
    //   下の付与コレクタ（`collectGrantedFromLayer` / `…FromAcce` / `…FromSoul` / `…FromUnderSigni`）へ
    //   **この map をそのまま渡している**のに、素の `Map` は `'WX11-053#1'` のような **instanceId を解決できない**
    //   （`new Map(baseEffectsMap)` は InstanceMap の**実エントリ＝CardNum キー**だけを複製する）。
    //   コレクタは場のシグニを `field.signi[zi].at(-1)`＝**instanceId** で引くので、
    //   `effectsMap.get(top)` が常に `undefined` になり **付与宣言が1件も収集されなかった**
    //   （実機で `myLayer=[]` を実測。live で `GRANT_FIELD_SIGNI_ABILITY` を持つ 71 効果が該当）。
    //   ⚠`return new InstanceMap(augMap)` は最後に包み直しているので**外から見た型は変わらない**＝
    //     ここを InstanceMap にしても呼び出し側の挙動は変わらず、内部の付与収集だけが直る。
    const augMap = new InstanceMap<import('../../../types/effects').CardEffect[]>(baseEffectsMap);

    // COPY_LRIG_NAME_ABILITY 【常】能力コピー：ルリグトラッシュの該当ルリグの CONTINUOUS 効果を
    // センタールリグ（instanceId）に注入する。これにより各 CONTINUOUS 収集関数が自動的に拾う。
    if (hasCopyLrigCont) {
      for (const [st, otherSt, isTurn] of [[myS, opS, myTurn], [opS, myS, !myTurn]] as const) {
        const copiedCont = collectCopiedLrigContinuousEffects(st, battleCardMap, baseEffectsMap, otherSt, isTurn);
        if (copiedCont.length === 0) continue;
        const top = st.field.lrig.at(-1)!;
        const base = augMap.get(top) ?? baseEffectsMap.get(top) ?? [];
        augMap.set(top, [...base, ...copiedCont]);
      }
    }

    // card_identity_overrides: ZERO化されたシグニの効果を差し替えカードの効果に設定（通常は空）
    for (const [instanceId, overrideNum] of [...Object.entries(myOverrides), ...Object.entries(opOverrides)]) {
      const overrideEffects = baseEffectsMap.get(overrideNum) ?? [];
      augMap.set(instanceId, overrideEffects);
    }

    // granted_effects の適用
    for (const [instanceId, granted] of [...Object.entries(myGranted), ...Object.entries(opGranted)]) {
      const base = augMap.get(getCardNum(instanceId)) ?? [];
      augMap.set(instanceId, [...base, ...granted]);
    }

    // under-signi → top-signi 効果付与（collectGrantedFromUnderSigni）
    if (hasStack) {
      const myUnder = collectGrantedFromUnderSigni(myS, opS, myTurn, augMap, battleCardMap, bs.turn_phase);
      const opUnder = collectGrantedFromUnderSigni(opS, myS, !myTurn, augMap, battleCardMap, bs.turn_phase);
      for (const [num, extra] of [...myUnder, ...opUnder]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // レイヤー等のフィールド付与（collectGrantedFromLayer）
    if (hasFieldGrant || hasPlayerFieldGrant) {
      const myLayer = collectGrantedFromLayer(myS, opS, myTurn, augMap, battleCardMap);
      const opLayer = collectGrantedFromLayer(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...myLayer, ...opLayer]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // アクセ→ホストシグニ付与（collectGrantedFromAcce）
    if (hasAcceGrant) {
      const myAcce = collectGrantedFromAcce(myS, opS, myTurn, augMap, battleCardMap);
      const opAcce = collectGrantedFromAcce(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...myAcce, ...opAcce]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    // ソウル→ホストシグニ付与（collectGrantedFromSoul）
    if (hasSoulGrant) {
      const mySoul = collectGrantedFromSoul(myS, opS, myTurn, augMap, battleCardMap);
      const opSoul = collectGrantedFromSoul(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...mySoul, ...opSoul]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    return new InstanceMap(augMap);
}

/** 画面の `effectivePowers`（場のシグニの有効パワー＝CONTINUOUS 適用済み）。 */
export function buildEffectivePowers(p: {
  bs: BattleStateRow | null; effectsMap: InstanceMap<CardEffect[]>;
  cardMap: Map<string, CardData>; userId: string;
}): Map<string, number> {
  const { bs, effectsMap, cardMap: battleCardMap } = p;
  const user = { id: p.userId };
    if (!bs) return new Map<string, number>();
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    const base = calcFieldPowers(myS, opS, myTurn, effectsMap, battleCardMap, bs.turn_phase);
    // lrig_attack_phase_power_down_per_signi: アタックフェイズ中に相手シグニのパワーを自シグニ数×N下げる
    const isAttackPhase = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase);
    const lrigAttackPhasePowerDown = (myS.lrig_attack_phase_power_down_per_signi ?? 0)
      + (myS.lrig_attack_phase_power_down_per_signi_until_opp_turn ?? 0);
    if (isAttackPhase && lrigAttackPhasePowerDown > 0) {
      const friendlyCount = myS.field.signi.filter(s => s?.length).length;
      const penalty = -(lrigAttackPhasePowerDown * friendlyCount);
      const result = new Map(base);
      for (const stack of opS.field.signi) {
        const top = stack?.at(-1);
        if (top) result.set(top, (result.get(top) ?? 0) + penalty);
      }
      return result;
    }
    return base;
}

/**
 * **1行の盤面から材料一式を作る**（ヘッドレス用のまとめ口）。
 * ⚠画面はこれを使わない＝`useMemo` の分割（カード表の読み込みのタイミング）が違うので3本を個別に呼ぶ。
 */
export function buildBattleMaterials(p: {
  bs: BattleStateRow; cards: CardData[]; userId: string;
  /**
   * 静的な効果表（`buildBaseEffectsMap` の結果）を使い回す口。
   * 🔴**省略すると毎回 全カードを parse する**（ヘッドレスの1手で ctx を何度も作るので、これを渡さないと桁で遅くなる）。
   */
  baseEffectsMap?: InstanceMap<CardEffect[]>;
}): {
  cardMap: Map<string, CardData>; baseEffectsMap: InstanceMap<CardEffect[]>;
  effectsMap: InstanceMap<CardEffect[]>; effectivePowers: Map<string, number>;
} {
  const cardMap = buildBattleCardMap({ bs: p.bs, baseCards: p.cards, userId: p.userId });
  const baseEffectsMap = p.baseEffectsMap ?? buildBaseEffectsMap([...new Map(p.cards.map(c => [c.CardNum, c])).values()]);
  const effectsMap = buildAugmentedEffectsMap({ bs: p.bs, baseEffectsMap, cardMap, userId: p.userId });
  const effectivePowers = buildEffectivePowers({ bs: p.bs, effectsMap, cardMap, userId: p.userId });
  return { cardMap, baseEffectsMap, effectsMap, effectivePowers };
}
