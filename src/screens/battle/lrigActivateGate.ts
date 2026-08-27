import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { collectLrigGrantedEffects, isKizunaActive } from '../../engine/effectEngine';
import { evalUseCondition, getCardNum } from '../../engine/effectExecutor';
import { isTrashImmuneByOpponent } from '../../engine/execUtils';
import { collectCenterLrigActivatedEffects, keyActivatedTimingMatchesPhase } from './battleUtils';
import { fieldTrashSelectableZones } from './fieldLimit';
import { exceedColorsSatisfied, exceedPoolOf } from './costs';
import { payLrigDownCost, payLrigDownSelfCost } from './lrigDownCost';

/**
 * センタールリグの【起】が**いま撃てるか**（提示の可否）を1か所で判定する純関数（§8／§6.4 `O-1` (c)）。
 *
 * ⚠**必ず人間のボタン生成と CPU の候補フィルタの両方から同じ関数を呼ぶこと**
 * （`signiActivateGate.ts` / `artsUseGate.ts` と同じ規律）。
 *
 * ⚠**収集源は3つある**（＝「撃てるか」の軸は共通だが「どこから集めるか」が違う）。
 * それぞれ専用の list 関数を用意してあり、**可否判定はどれも `canActivateLrigEffect` 1本**を通る：
 *   ①センタールリグ本来の【起】＝`listActivatableLrigEffects`
 *   ②付与された【起】（`GRANT_LRIG_ABILITY`）＝`listActivatableGrantedLrigEffects`
 *   ③ルリグトラッシュからの継承（`INHERIT_LRIG_TRASH_ABILITIES`）＝`listActivatableInheritedLrigEffects`
 * 🆕**②③も 2026-08-18（§6.4 O-1 (f)）でこの funnel へ寄せた**＝従来は BattleScreen 側に
 * **手書きの部分再実装**が2本あり、①と軸が食い違っていた（②はコイン／エクシード／`lrigDown`／
 * 【絆起】／【歌のカケラ】を見ておらず、③は**何も見ていなかった**＝コスト踏み倒しで撃てた）。
 *
 * 🔴**統合で塞いだ穴（続き552c）**＝従来 MAIN 窓と ATTACK_ARTS 窓でゲートの軸が食い違っていた。
 *   ①**MAIN 窓は `condition`（使用条件）を1度も見ていなかった**（付与【起】側だけが見ていた）
 *   ②**ATTACK_ARTS 窓は【絆起】・【歌のカケラ】・`lrigDown` の支払い可否を見ていなかった**
 *   ③**どちらの窓も《コインアイコン》の所持枚数を見ていなかった**（実行側もコインを減らしていなかった＝
 *     `performLrigActivated` 側で是正済み）。
 */
export interface LrigActivateGateInput {
  /** 【起】を撃つ側。 */
  my: PlayerState;
  /** その対戦相手。 */
  op: PlayerState;
  /** `'MAIN'`＝メインフェイズの【起】／`'ATTACK_ARTS'`＝《アタックフェイズアイコン》付き【起】。 */
  phase: 'MAIN' | 'ATTACK_ARTS';
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  /** `calcContinuousBlockedActions(my, ...).forSelf`。 */
  blockedSelf: Set<string>;
  effectivePowers?: Map<string, number>;
}

/** ルリグデッキ除外コスト（`exileLrigFromLrigDeck`）を払えるか（§6.4 O-11・`PR-469`）。 */
function canPayExileLrigFromLrigDeck(eff: CardEffect, my: PlayerState, cardMap: Map<string, CardData>): boolean {
  const c = eff.cost?.exileLrigFromLrigDeck;
  if (!c) return true;
  const n = my.lrig_deck.filter(num => {
    const card = cardMap.get(getCardNum(num));
    if (!card) return false;
    if (!c.story) return true;
    return (card.CardClass ?? '').split(/[/／]/).map(x => x.trim()).includes(c.story);
  }).length;
  return n >= c.count;
}

/**
 * エクシードコストとして**ルリグトラッシュへ送れる枚数**（センター＋アシストの「一番上を残した」下札）。
 *
 * ⚠**提示側にこの検算が無いと、足りないのに撃てて実質コストが軽くなる**＝
 * `performLrigActivated` の支払いは `Math.min(remaining, stack.length - 1)` で**払える分だけ**払うので、
 * 不足を検出せずに素通りする（続き552c に発見）。
 */
export function exceedPayableCount(my: PlayerState): number {
  const under = (stack: readonly string[] | undefined) => Math.max(0, (stack?.length ?? 0) - 1);
  return under(my.field.lrig) + under(my.field.assist_lrig_l) + under(my.field.assist_lrig_r);
}

/**
 * ルリグの【起】が**いま撃てるか**（1効果ぶん）。センター本来／付与／継承のどれでも同じ軸で見る。
 * `sourceCardNum` は使用条件の評価に渡す発生源（＝センタールリグ）。
 */
export function canActivateLrigEffect(
  eff: CardEffect, p: LrigActivateGateInput, sourceCardNum: string,
): boolean {
  const { my, op, phase, cardMap } = p;
  const isActionBlocked = (id: string) =>
    (my.blocked_actions?.some(a => a === id) ?? false) || p.blockedSelf.has(id);
  // 「対戦相手はルリグの【起】能力を使用できない」（`USE_LRIG_ACT`）＋全【起】封じ（`USE_ACT`）。
  if (isActionBlocked('USE_ACT') || isActionBlocked('USE_LRIG_ACT')) return false;
  // 【絆起】は発生源カード名との絆を獲得していなければ発動できない。
  if (eff.kizunaIcon && !isKizunaActive(my, sourceCardNum, cardMap)) return false;
  // 🔴`costUnparsed`＝原文のコストを表現できなかった印。提示すると踏み倒しになる（§6.4 O-11）。
  if (eff.costUnparsed) return false;
  if (!canPayExileLrigFromLrigDeck(eff, my, cardMap)) return false;
  if (eff.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(eff.effectId)) return false;
  if (eff.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === eff.effectId).length >= 2) return false;
  if (eff.usageLimit === 'once_per_game' && my.game_actions_done?.includes(eff.effectId)) return false;
  if (my.blocked_actions?.includes(eff.effectId)) return false;
  // 《コインアイコン》＝所持枚数が足りないと払えない（実行側もここと対で deduct する）。
  if ((eff.cost?.coin ?? 0) > (my.coins ?? 0)) return false;
  // エクシード＝ルリグトラッシュへ送れる下札が足りないと払えない。
  if ((eff.cost?.exceed ?? 0) > exceedPayableCount(my)) return false;
  // 🆕**色指定**（`WX10-001`「エクシード１（白のカード）」）＝その色の下札が無ければ提示しない。
  //   ⚠ラベル・可否ゲート・支払い実行の3地点セット（§4.2）。ここだけだと UI 迂回で踏み倒せる。
  if (eff.cost?.exceedColors && !exceedColorsSatisfied(exceedPoolOf(my), eff.cost.exceedColors, cardMap)) return false;
  // lrigDown: アップ状態のルリグ（level 条件つき）が必要数いないと払えない（タスク12(cviii)）。
  if (eff.cost?.lrigDown && payLrigDownCost(my, eff.cost.lrigDown, cardMap) === null) return false;
  // 【起】《ダウン》＝このルリグが既にダウンしていると払えない（タスク12(cxxxi)）。
  if (eff.cost?.down_self && payLrigDownSelfCost(my) === null) return false;
  // fieldBanish: コストでバニッシュできる自分のシグニが必要数いないと払えない（§5.3 `O-67`）。
  // ⚠発生源はルリグなので `excludeSelf`（＝効果元シグニを除く）は効かない＝sourceZone は渡さない。
  if (eff.cost?.fieldBanish
    && fieldTrashSelectableZones(eff.cost.fieldBanish, my, cardMap).length < eff.cost.fieldBanish.count) return false;
  // SONG_FRAGMENT: エナゾーンに【歌のカケラ】がある場合のみ撃てる。
  const act = eff.action as StubAction;
  if (act?.type === 'STUB' && act.id === 'SONG_FRAGMENT'
    && !my.energy.some(cn => cardMap.get(getCardNum(cn))?.EffectText?.includes('【歌のカケラ】'))) return false;
  if (eff.condition && !evalUseCondition(eff.condition, my, op, cardMap, sourceCardNum, phase, p.effectivePowers)) return false;
  return true;
}

/**
 * 自分のセンタールリグへ**付与されている**効果を全部集める（§6.4 O-1 (f)）。
 *
 * 🔑**収集源が3つある**＝①場のシグニ／キーピースの `GRANT_LRIG_ABILITY`（`collectLrigGrantedEffects`）
 * ②`lrig_granted_auto_effects`（恒久）③`lrig_granted_auto_effects_until_opp_turn`（相手ターンまで）。
 * ⚠**人間（`grantedMyLrigEffects` の useMemo）と CPU（`tryCpuLrigActivated`）が同じ関数を呼ぶ**＝
 *   ②③を片方だけに足すと「人間には出るが CPU は撃てない」型の無言のズレになる。
 */
export function collectGrantedLrigEffects(
  my: PlayerState, op: PlayerState, isMyTurn: boolean,
  effectsMap: Map<string, CardEffect[]>, cardMap: Map<string, CardData>,
): CardEffect[] {
  return [
    ...collectLrigGrantedEffects(my, op, isMyTurn, effectsMap, cardMap),
    ...(my.lrig_granted_auto_effects ?? []),
    ...(my.lrig_granted_auto_effects_until_opp_turn ?? []),
  ];
}

/**
 * **付与された**【起】のうち、いま撃てるもの（§6.4 O-1 (f)）。
 *
 * `granted` は BattleScreen の `grantedMyLrigEffects`（`collectGrantedFromLayer` の結果）を渡す＝
 * **収集そのものは呼び出し元の責務**（付与ストアは effectsMap の外にあり、ここからは見えない）。
 *
 * ⚠timing 照合は**窓ごとに綴りが違う**（既存挙動をそのまま funnel へ移した）＝
 *   MAIN 窓は `keyActivatedTimingMatchesPhase`（timing 未設定＝許容・`SPELL_CUTIN` は常に許容）、
 *   ATTACK_ARTS 窓は `timing.includes('ATTACK_ARTS')` の厳密一致。
 */
export function listActivatableGrantedLrigEffects(
  p: LrigActivateGateInput, granted: readonly CardEffect[],
): CardEffect[] {
  const lrigTop = p.my.field.lrig.at(-1);
  if (!lrigTop) return [];
  return granted.filter(eff =>
    eff.effectType === 'ACTIVATED'
    && (p.phase === 'MAIN'
      ? keyActivatedTimingMatchesPhase(eff.timing, 'MAIN')
      : !!eff.timing?.includes('ATTACK_ARTS'))
    && canActivateLrigEffect(eff, p, lrigTop));
}

/**
 * **ルリグトラッシュから継承した**【起】のうち、いま撃てるもの（§6.4 O-1 (f)）。
 *
 * 戻り値は**継承用に id を書き換えた複製**（`inherited_<継承元カード番号>_<元 effectId>`）＝
 * 人間の実行（`openLrigGranted`）も CPU の実行（`performLrigActivated`）も**この複製をそのまま渡す**。
 * `performLrigActivated` が `effect.effectId` を `actions_done` へ書くので、
 * この id が**そのまま「もう使った」印**になる。
 *
 * ⚠**継承は「同じ継承元の同じ能力を1ターンに1回」まで**（`usageLimit` の有無に依らない既存の近似）。
 *   センター本来の【起】は `usageLimit` が無ければ何度でも撃てるので、そこだけ軸が違う。
 * ⚠**継承元が能力を失っていれば継承自体が成立しない**（§6.4 O-10・`WX12-023`
 *   「対戦相手の…ルリグトラッシュにあるカードは能力を失い」）。
 */
export function listActivatableInheritedLrigEffects(p: LrigActivateGateInput): CardEffect[] {
  const lrigTop = p.my.field.lrig.at(-1);
  if (!lrigTop) return [];
  if (isTrashImmuneByOpponent(p.op, p.cardMap, p.effectsMap)) return [];
  const hasInherit = (p.effectsMap.get(lrigTop) ?? []).some(eff =>
    eff.effectType === 'CONTINUOUS'
    && ((eff.action as StubAction)?.id === 'INHERIT_LRIG_TRASH_ABILITIES'
      || (eff.action as StubAction)?.id === 'COPY_LRIG_TRASH_ACTIVATED'));
  if (!hasInherit) return [];
  const out: CardEffect[] = [];
  for (const trashLrigCn of p.my.lrig_trash) {
    if ((p.cardMap.get(trashLrigCn)?.Type ?? '') !== 'ルリグ') continue;
    for (const eff of (p.effectsMap.get(trashLrigCn) ?? [])) {
      if (eff.effectType !== 'ACTIVATED') continue;
      if (!eff.timing?.includes(p.phase)) continue;
      // ⚠旧実装は複製に `sourceCardNum` も足していたが、`CardEffect` に**そのキーは無い**（型外＝誰も読まない
      //   死にフィールドだった）。発生源は `openLrigGranted({ sourceCardNum, effect })` の外側で渡す。
      const inherited: CardEffect = { ...eff, effectId: `inherited_${trashLrigCn}_${eff.effectId}` };
      if ((p.my.actions_done ?? []).includes(inherited.effectId)) continue;
      if (!canActivateLrigEffect(inherited, p, lrigTop)) continue;
      out.push(inherited);
    }
  }
  return out;
}

/** センタールリグ本来の【起】のうち、**いま撃てる**もの（効果の並びは定義順）。 */
export function listActivatableLrigEffects(p: LrigActivateGateInput): CardEffect[] {
  const lrigTop = p.my.field.lrig.at(-1);
  if (!lrigTop) return [];
  return collectCenterLrigActivatedEffects(p.my, p.effectsMap, p.phase)
    .filter(eff => canActivateLrigEffect(eff, p, lrigTop));
}
