import type { PlayerState, CardData, PendingInteractionDef, TargetScope, TurnPhase } from '../types';
import { hasShadowLrig, getShadowScopes, getFieldGrantedShadowScopes, evaluateShadowScope, decodeShadowKeyword, textHasKeyword } from '../utils/keywords';
import { activeFieldGrantKeywordsForSigni, checkBeatCondition, checkActiveCondition, fieldEffectBanishRedirectToTrash, computeBanishedAttrs, matchesStateFilter, calcSigniLevels, type BanishedCardAttrs } from './effectEngine';
import type {
  CardEffect,
  EffectAction,
  StubAction,
  TargetFilter,
  Owner,
  NumberOrRef,
  CountFromZone,
  Condition,
  ActiveCondition,
  SelectionConstraint,
  BeatSigniCost,
} from '../types/effects';
import { payLrigDownCost } from '../screens/battle/lrigDownCost';
import { computeEffectiveLrigLimit } from '../screens/battle/lrigLimit';
import { matchesTrashArtsFromLrigDeckCost } from '../screens/battle/artsTrashCost';
import { fieldTrashGroupsAffordable } from '../screens/battle/fieldLimit';
import { underAnySigniCostCandidates } from '../screens/battle/underAnySigniCost';
import { acceCardsAt, cloneAcceSlots, hasAcceAt } from '../utils/acce';
import { abilityBlockTextOf } from '../data/effectParser';

// ===== 実行コンテキスト & 結果型 =====

export interface ExecCtx {
  ownerState: PlayerState;   // "self"：効果オーナー
  otherState: PlayerState;   // "opponent"：相手
  cardMap: Map<string, CardData>;
  effectsMap?: Map<string, CardEffect[]>;
  logs: string[];
  effectivePowers?: Map<string, number>; // CONTINUOUS+temp_power_mods 適用済みパワー（powerRangeフィルタ用）
  sourceCardNum?: string;    // 効果発動元カード番号（「このシグニ」参照用）
  sourceEffectId?: string;   // 解決中の効果ID（カード内の別効果を区別する）
  sourcePlacementPending?: boolean; // 使用中スペルが未配置。自己除外を解決後配置の置換として扱う
  triggeringCardNum?: string; // 効果を引き起こしたカード番号（any_ally scope の「それ」参照用）
  triggeringKeyword?: string; // ON_KEYWORD_GAINED で得られたキーワード（COPY_ABILITY の「その能力」参照用・WXDi-P04-035）
  battleAttackerCardNum?: string; // ON_SIGNI_BANISH_OPPONENT/_BATTLE のバトルアタッカー自身（triggeringCardNum は被バニッシュ相手用に既に使用中のため別軸。「そのアタックしているシグニ」参照用・WX17-032）
  banishedSigniPower?: number; // ON_SIGNI_BANISH_BATTLE の被バニッシュシグニのバニッシュ直前実効パワー
  forceEndTurn?: boolean;    // FORCE_END_TURN でセット → BattleScreen がターン終了処理を行う
  currentPhase?: string;     // 現在のターンフェイズ（DURING_PHASE条件チェック用）
  isOwnerTurn?: boolean;     // 効果オーナーのターンか。未設定なら TURN_OWNER は後方互換で成立扱い
  lastProcessedCards?: string[]; // 直前ステップで処理されたカード番号（POWER_MOD_PER_COUNT等で参照）
  /** カードでない処理個数（ウィルス等）。lastProcessedCards を偽カードで水増しせず後段へ渡す。 */
  lastProcessedCount?: number;
  lastLookTrashedCards?: string[]; // 直前の LOOK_AND_REORDER で実際にトラッシュへ置いたカード
  storedTargetCards?: string[]; // 任意コスト支払い前に固定した対象（支払いTRASHでlastProcessedCardsが上書きされても保持）
  leftFieldUnderCards?: string[]; // ON_LEAVE_FIELD 発火元の離場直前の下カード
  autoTargetedCards?: string[]; // 選択UIを経ずに自動対象化したシグニ（targetsTriggerSource/targetsLastProcessed）＝ON_TARGETED 収集用（続き137・タスク12(xx)）
  fieldTrashCostCards?: string[]; // この解決ラウンドでコストとして場→トラッシュへ置いたinstanceId（ON_TRASH byEffect 原因弁別用）
  trapActivated?: boolean; // この解決中に《トラップアイコン》が実際に発動した（BattleScreen が完了解決後に watcher を収集）
  trapSetOwners?: Owner[]; // この解決中に【トラップ】を設置した側（効果主から見た owner。設置1回につき1要素）
  // CONTINUOUS保護効果（effectEngine動的計算）: 相手の効果でトラッシュに移動できないゾーン
  // ownerProtected = 効果オーナーの保護, otherProtected = 相手の保護
  otherProtectedZones?: ('hand' | 'energy')[];
  // PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 相手の効果で能力を失えないシグニ（otherState のカード番号）
  otherProtectedSigniNums?: string[];
  // PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_BOUNCE_AND_DOWN_BY_OPP
  otherDownProtectedNums?: string[];
  // SIGNI_CANT_BOUNCE_FROM_FIELD: 相手シグニのバウンス保護（場→手札に戻せないシグニ）
  otherBounceProtectedNums?: string[];
  // GRANT_PROTECTION from=['BANISH'/'any']: 相手効果でバニッシュされないシグニ
  otherBanishProtectedNums?: Set<string>;
  // sourceOwner:any のバニッシュ耐性。効果主自身のシグニを効果でバニッシュする経路だけで使う。
  ownBanishProtectedNums?: Set<string>;
  // CHARM_PROTECTION（WX04-052-E1）: バニッシュされる際にチャーム1枚をトラッシュして場に残るシグニ（両プレイヤー分）
  charmShieldNums?: Set<string>;
  // GRANT_PROTECTION from=['ルリグ'/'シグニ'…] 完全効果耐性（「対戦相手の、ルリグとシグニの効果を受けない」）:
  // 解決中効果のソース種別が耐性対象に該当する相手(otherState)シグニ。FREEZE/POWER_MODIFY等の対象から除外する。
  // （バニッシュ/バウンス/ダウン/トラッシュ/能力消失/能力付与は各専用保護セットへ別途 union 済み）
  otherEffectImmuneNums?: Set<string>;
  // BLOCK_OPP_DECK_TO_ENERGY: 相手CONTにより自分のデッキ→エナ効果がブロックされている
  deckToEnergyBlocked?: boolean;
  // BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: 相手CONTにより自分はシグニ効果でシグニを出せない
  signiFieldPlaceByEffectBlocked?: boolean;
  // DEPLOY_RESTRICT（CONTINUOUS 版・WX07-006 レゾナ等）の配置数上限を**事前計算して**渡す。
  // ⚠`ctx.effectsMap` は BattleScreen の一部経路（スタック解決の1箇所）でしか代入されないため、
  //   effectsMap 依存だけにすると「engine は正しいのに実UIでは丸ごと効かない」dead flag になる（続き296 と同じ罠）。
  //   AUTO フラグ版（`PlayerState.signi_deploy_count_limit`）は state に載るのでこの経路は不要。
  deployCountCapSelf?: number;      // ownerState が場に出すときの上限
  deployCountCapOpponent?: number;  // otherState が場に出すときの上限
  // LIFE_CRASH_PREVENTION（§5.3 O-66）＝「ライフクロスは〜クラッシュされない／N枚までしか
  // クラッシュされない」の宣言を、**クラッシュされる側ごとに**事前計算して渡す。
  // ⚠**上の `deployCountCap*` と同じ理由でここへ置く**＝`ctx.effectsMap` は BattleScreen の一部経路でしか
  //   代入されないので、盤面走査を engine 側で直接やると「engine は正しいのに実UIでは丸ごと効かない」
  //   dead flag になる。合成は `engine/lifeCrashGate.ts` の `collectLifeCrashPreventions`。
  lifeCrashPreventionsSelf?: import('../types').LifeCrashPreventionSpec[];
  lifeCrashPreventionsOpponent?: import('../types').LifeCrashPreventionSpec[];
  // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_NON_FIELD_MOVE_BY_OPP / SIGNI_PROTECT_MOVE_EXCEPT_ENERGY:
  // 相手効果でフィールドから移動（バウンス/トラッシュ）できないシグニ番号
  otherTrashFieldProtectedNums?: string[];
  // SELF_TRASH_PREVENT（WX07-033）: 効果オーナー自身の効果/コストで場からトラッシュに置けない自シグニ番号
  ownSelfTrashPreventNums?: Set<string>;
  // PREVENT_OPP_SIGNI_ABILITY_GAIN / PREVENT_ABILITY_CHANGE_BY_OPP:
  // 相手効果でキーワード能力を付与できないシグニ番号
  otherAbilityGainProtectedNums?: string[];
  // ALL_COLOR / ALL_ZONE_BLACK / ACCE_SIGNI_ALL_COLOR など: すべての色を持つシグニ番号
  allColorSigniNums?: Set<string>;
  // ALL_ZONE_BLACK / GAIN_LRIG_COLOR / INHERIT_UNDER_SIGNI_COLOR など: 追加色を持つシグニ番号→色配列
  fieldSigniExtraColors?: Map<string, string[]>;
  // OPP_TRASH_LOSE_COLOR_AND_CLASS: 自分（ownerState）のトラッシュのカードが色/クラスを失う
  oppTrashColorLoss?: boolean;
  // TREAT_AS_CLASS_ALL_ZONES: カードNum→クラス名のマップ（全ゾーンでクラスとして扱う）
  treatAsClassAllZones?: Record<string, string>;
  // TREAT_AS_LEVEL1_IN_DECK_TRASH: デッキ/トラッシュでレベル1シグニとして扱うカードのSet
  deckTrashLevel1Nums?: Set<string>;
  // COST_COLOR_SELECT（WX04-063）: スペル使用コストとして実際に支払われたエナ1枚ごとの色配列。
  // マルチエナは全5色、無色エナは空配列。これを基に「支払った色の種類」分のシグニを探す。
  paidEnergyColorSets?: string[][];
  /** 使用前処理でこのスペル自身が実際に取り除いたウィルス数。 */
  preUseVirusRemoved?: number;
  // SEQUENCE内で動的に決まる値（ステップ間の受け渡し用、最上位効果呼び出し単位でリセット）
  seqVars?: { lastDownedLrigLevel?: number; lastDownedLrigLevelSum?: number; declaredNumber?: number };
}

export type ExecResult =
  | { done: true;  ownerState: PlayerState; otherState: PlayerState; logs: string[]; forceEndTurn?: boolean; lastProcessedCards?: string[]; lastProcessedCount?: number; lastLookTrashedCards?: string[]; storedTargetCards?: string[]; autoTargetedCards?: string[]; fieldTrashCostCards?: string[]; trapActivated?: boolean; trapSetOwners?: Owner[] }
  | { done: false; ownerState: PlayerState; otherState: PlayerState; logs: string[]; pending: PendingInteractionDef; lastProcessedCards?: string[]; lastProcessedCount?: number; lastLookTrashedCards?: string[]; storedTargetCards?: string[]; fieldTrashCostCards?: string[]; trapActivated?: boolean; trapSetOwners?: Owner[] };

// ===== ユーティリティ =====

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resolveNum(n: NumberOrRef): number {
  return typeof n === 'number' ? n : 0;
}

/**
 * 解決中の効果を生んだ**能力ブロックの原文**を返す（§6.4 O-20 の source 配線）。
 *
 * ハンドラが `cardMap.get(sourceCardNum).EffectText` の**カード全文**を regex で読むと、
 * 同じカードの**別の能力の文**に一致して枚数・対象・行き先が決まってしまう
 * （例＝`WXDi-P10-006-E3` が E2 の「２枚引く」を拾って余分にドローする）。
 * この層の事故は golden も census も緑のまま素通りするので、**全文ではなくブロックを読む**。
 *
 * ブロックを特定できない場合（合成 effectId・付与展開・`sourceEffectId` 未設定の経路）は
 * 従来どおりカード全文を返す＝**フォールバックは現行動作そのまま**で退化しない。
 */
export function sourceAbilityText(ctx: ExecCtx): string {
  const card = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
  if (!card) return '';
  return abilityBlockTextOf(card, ctx.sourceEffectId);
}

export function resolveCountRef(n: NumberOrRef, ctx: ExecCtx, fromZone?: CountFromZone): number {
  if (fromZone) {
    return countFromZone(fromZone, ctx.ownerState, ctx.otherState, ctx.cardMap, ctx.sourceCardNum);
  }
  if (typeof n === 'number') return n;
  if (n.$ref === 'seven_minus_self_life_count') return Math.max(0, 7 - ctx.ownerState.life_cloth.length);
  // 「あなたの手札が５枚より多い場合、**その差の分だけ**手札からカードをエナゾーンに置く」（`WDK08-Y08-E1`・§6.4 O-11）。
  // 原文の括弧書きが「７枚になった場合は２枚」と明示している＝手札枚数−5（下限0）。
  if (n.$ref === 'self_hand_over_five') return Math.max(0, ctx.ownerState.hand.length - 5);
  // 「あなたがベットする《コインアイコン》**１枚につき**」（`WX22-016`・§6.4 O-11）。
  // ⚠**ベットしなかった場合は 0**＝`countChoose` 側が 0 のとき選ばせずに次のステップへ進む
  //   （ベットは任意なので、選ばなくても本体は走るのが原文どおり）。
  if (n.$ref === 'bet_coins_paid') return Math.max(0, ctx.ownerState.bet_coins_paid ?? 0);
  // 「対戦相手のセンタールリグの**ルリグタイプ１つにつき**」（`PR-471`・§6.4 O-11）。
  // ルリグタイプは `CardClass` の `/` 区切り（例＝`タマ/イオナ` は2種）。ルリグ不在は0。
  // 🆕**2026-08-31 続き752**＝対戦相手のセンタールリグの**レベル**（`WXDi-P00-012-E1`
  //   「レベルの合計が対戦相手のセンタールリグのレベル以下になるように好きな数対象とし」）。
  // ⚠**fail-closed**＝センタールリグが引けない／`Level` が数値でないときは **0**（＝1体も選べない）。
  //   上限が消えて盤面全部をバニッシュできる fail-open のほうが原文より強いので、0 側へ倒す。
  // 🆕`assist_lrig_level_sum`＝「あなたの場にいる**アシストルリグのレベルの合計**」
  //   （2026-08-31・`WXDi-P05-008-E1`「レベルの合計１につき【エナチャージ１】をする」）。
  //   🔴旧 live は比例が落ちて**常に1枚**だった。⚠センタールリグは数えない。
  if (n.$ref === 'assist_lrig_level_sum') {
    const lvOf = (arr: string[] | undefined): number => {
      const top = arr?.at(-1);
      const lv = top ? parseInt(ctx.cardMap.get(getCardNum(top))?.Level ?? '', 10) : NaN;
      return Number.isFinite(lv) ? lv : 0;
    };
    return lvOf(ctx.ownerState.field.assist_lrig_l) + lvOf(ctx.ownerState.field.assist_lrig_r);
  }
  if (n.$ref === 'opp_lrig_level') {
    const oppCenter = ctx.otherState.field.lrig.at(-1);
    if (!oppCenter) return 0;
    const lv = Number.parseInt(ctx.cardMap.get(getCardNum(oppCenter))?.Level ?? '', 10);
    return Number.isFinite(lv) ? lv : 0;
  }
  if (n.$ref === 'opp_center_lrig_type_count' || n.$ref === 'self_center_lrig_type_count') {
    const st = n.$ref === 'opp_center_lrig_type_count' ? ctx.otherState : ctx.ownerState;
    const center = st.field.lrig.at(-1);
    if (!center) return 0;
    return (ctx.cardMap.get(getCardNum(center))?.CardClass ?? '')
      .split('/').map(s => s.trim()).filter(Boolean).length;
  }
  if (n.$ref === 'last_processed_count') {
    const cards = ctx.lastProcessedCards ?? [];
    if (!n.filter && ctx.lastProcessedCount !== undefined) return ctx.lastProcessedCount;
    return n.filter
      ? cards.filter(cardNum => matchesFilter(ctx.cardMap.get(getCardNum(cardNum)), n.filter)).length
      : cards.length;
  }
  if (n.$ref === 'last_processed_level_sum') {
    return (ctx.lastProcessedCards ?? []).reduce((sum, cardNum) => {
      const level = Number.parseInt(ctx.cardMap.get(getCardNum(cardNum))?.Level ?? '', 10);
      return sum + (Number.isFinite(level) ? level : 0);
    }, 0);
  }
  if (n.$ref === 'cards_drawn_this_attack_phase') {
    return Math.max(0, ctx.ownerState.cards_drawn_this_attack_phase ?? 0);
  }
  // 🆕「このターンに**あなたの〈filter〉のシグニが**クラッシュした対戦相手のライフクロス1枚につき」
  //   （2026-08-31 続き748・`WX25-CP1-042-E2`）。実体は `life_crashed_by_signi_this_turn`
  //   （**クラッシュした側＝攻撃側の state** に「どのシグニが何枚」で載る既存フィールド）。
  //   ⚠`filter` 省略時は全シグニぶんの合計＝`life_crashed_this_turn`（被クラッシュ側）とは**別の軸**。
  if (n.$ref === 'life_crashed_by_signi_this_turn') {
    const ledger = ctx.ownerState.life_crashed_by_signi_this_turn ?? {};
    return Object.entries(ledger).reduce((sum, [cardNum, cnt]) =>
      (!n.filter || matchesFilter(ctx.cardMap.get(getCardNum(cardNum)), n.filter)) ? sum + (cnt ?? 0) : sum, 0);
  }
  // 🆕「**このシグニの下にあったカード**1枚につき」（2026-08-31 続き748・`WXDi-P11-042-E2`）。
  //   実体は `ctx.leftFieldUnderCards`＝collector が**離場/バニッシュ直前**に撮ったスナップショット
  //   （場を離れたあとの盤面には下カードが残っていないので、これ以外に数える術が無い）。
  if (n.$ref === 'left_field_under_count') {
    const under = ctx.leftFieldUnderCards ?? [];
    return n.filter
      ? under.filter(cardNum => matchesFilter(ctx.cardMap.get(getCardNum(cardNum)), n.filter)).length
      : under.length;
  }
  if (n.$ref === 'last_processed_level') return maxCardLevel(ctx.lastProcessedCards, ctx);
  if (n.$ref === 'stored_target_level') return maxCardLevel(ctx.storedTargetCards, ctx);
  if (n.$ref === 'center_lrig_level') {
    const center = ctx.ownerState.field.lrig.at(-1);
    return center ? (Number.parseInt(ctx.cardMap.get(getCardNum(center))?.Level ?? '0', 10) || 0) : 0;
  }
  // 🆕`source_effective_power`＝**効果元シグニの実効パワー**（§5.3 `O-212`・2026-09-01
  //   `WXEX2-52-E3`「パワーの合計が**このシグニのパワー**以下になるように」）。
  // ⚠効果元が特定できない／盤面に居ない経路は**印刷パワー**へ落ち、それも読めなければ 0（fail-closed
  //   ＝1体も選べない）。旧 live は制約ごと落ちていた（どの2体でも蘇生できた）ので退化はしない。
  if (n.$ref === 'source_effective_power') {
    const src = ctx.sourceCardNum;
    if (!src) return 0;
    const effective = ctx.effectivePowers?.get(src);
    if (effective !== undefined) return effective;
    return parseInt(ctx.cardMap.get(getCardNum(src))?.Power ?? '', 10) || 0;
  }
  console.warn(`[effectExecutor] unknown numeric ref: ${n.$ref}`);
  return 0;
}

/**
 * `CountFromZone` が指すゾーンのカード（filter 適用前）。
 * 🆕§5.3 `O-214` で `countFromZone` から切り出した＝**複数ゾーンを合流させてから distinct する**
 * `ZONE_SUM_COUNT{distinctAcrossZones}` が同じゾーン定義を再利用するため。
 */
export function zoneCardsOf(
  fromZone: CountFromZone,
  ownerSt: PlayerState,
  otherSt: PlayerState,
  sourceCardNum?: string,
): string[] {
  const state = fromZone.owner === 'self' ? ownerSt : otherSt;
  return fromZone.zone === 'under'
    ? underCardsOfSource(ownerSt, sourceCardNum)
    : fromZone.zone === 'field'
    ? [
        ...state.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
        ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
      ]
    : fromZone.zone === 'hand' ? state.hand
    : fromZone.zone === 'energy' ? state.energy
    : fromZone.zone === 'trash' ? state.trash
    : fromZone.zone === 'lrig_trash' ? state.lrig_trash ?? []
    : fromZone.zone === 'deck' ? state.deck
    : fromZone.zone === 'acce' ? (state.field.signi_acce ?? []).flatMap(slot => slot ?? [])
    : fromZone.zone === 'charm' ? (state.field.signi_charms ?? []).filter((n): n is string => !!n)
    : fromZone.zone === 'check' ? checkZoneCards(state)
    : (state.field.signi_traps ?? []).filter((n): n is string => !!n);
}

/** CountFromZone の唯一の解決器。動的対象上限と動的 action 枚数の双方が同じ盤面定義を使う。 */
export function countFromZone(
  fromZone: CountFromZone,
  ownerSt: PlayerState,
  otherSt: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum?: string,
): number {
  const state = fromZone.owner === 'self' ? ownerSt : otherSt;
  void state;
  // 🆕`under`＝効果元シグニのスタックのうち**その位置より下**（§5.3 `O-141`）。
  // ⚠`owner` は見ない（効果元は常にその効果を出したプレイヤーの場にいる）＝`ownerSt` を使う。
  // ⚠効果元が特定できない／場にいない経路は **0**（fail-closed）。旧 `STUB{POWER_MOD_PER_COUNT}` も
  //   `ctx.sourceCardNum` が無ければ何もしなかったので退化しない。
  const cards = zoneCardsOf(fromZone, ownerSt, otherSt, sourceCardNum);
  const matchedCards = cards.filter(cardNum => !fromZone.filter || matchesFilter(cardMap.get(getCardNum(cardNum)), fromZone.filter));
  const rawMatched = fromZone.sumBy === 'power'
    // 「パワーの合計と同じだけ」＝枚数ではなく Power の総和を単位量にする（§5.3 `O-141`）。
    // スタック下段のカードは場に出ていない＝実効パワー（`effectivePowers`）を持たないので印刷値で数える。
    ? matchedCards.reduce((sum, cardNum) =>
        sum + (Number.parseInt(cardMap.get(getCardNum(cardNum))?.Power ?? '', 10) || 0), 0)
    : fromZone.distinctBy === 'level'
    ? new Set(matchedCards.map(cardNum => cardMap.get(getCardNum(cardNum))?.Level ?? '')
      .filter(level => level !== '')).size
    // 🆕`'name'`＝**カード名の種類数**（「＜X＞のシグニが合計N種類ある場合」`WXDi-CP01-031-E1`）。
    : fromZone.distinctBy === 'name'
    ? new Set(matchedCards.map(cardNum => cardMap.get(getCardNum(cardNum))?.CardName ?? '')
      .filter(name => name !== '')).size
    : matchedCards.length;
  const matched = fromZone.maxCount === undefined ? rawMatched : Math.min(rawMatched, Math.max(0, fromZone.maxCount));
  // unitSize<=0 は無制限・既定1へ倒さず fail-closed。既存 per は乗数のまま維持する。
  if (fromZone.unitSize !== undefined && (!Number.isFinite(fromZone.unitSize) || fromZone.unitSize <= 0)) return 0;
  const units = fromZone.unitSize === undefined ? matched : Math.floor(matched / fromZone.unitSize);
  // units（枚数）は常に非負。per は POWER_MODIFY.deltaFromZone の単価にも使うため負符号を潰さない。
  return units * (fromZone.per ?? 1);
}

/**
 * 🆕**チェックゾーンにあるカード**（§5.3 `O-143`・2026-08-29）＝`field.check`（ライフバースト確認中の1枚）と
 * `field.check_rest`（効果で置かれてターン終了まで留まる分）の**合計**。
 * 🔴**片方だけを見ない**＝原文「チェックゾーンにあるカード１枚につき」「４枚以下の場合」はゾーン全体を数える。
 */
export function checkZoneCards(state: PlayerState): string[] {
  return [...(state.field.check ? [state.field.check] : []), ...(state.field.check_rest ?? [])];
}

/**
 * 効果元シグニの**下にあるカード**（`CountFromZone.zone:'under'`・§5.3 `O-141`）。
 * ⚠**「最上面を除く」ではなく「効果元の位置より下」**＝効果元がライズの下段に潜っている盤面でも
 *   原文（「このシグニの下にあるカード」）どおりに数える。
 * ⚠instanceId（`CardNum#N`）で持つ経路があるので、完全一致→素の番号一致の順で探す。
 */
function underCardsOfSource(ownerSt: PlayerState, sourceCardNum?: string): string[] {
  if (!sourceCardNum) return [];
  const bare = getCardNum(sourceCardNum);
  for (const stack of ownerSt.field.signi) {
    if (!stack || stack.length === 0) continue;
    const exact = stack.indexOf(sourceCardNum);
    const idx = exact >= 0 ? exact : stack.findIndex(cardNum => getCardNum(cardNum) === bare);
    if (idx < 0) continue;
    return stack.slice(0, idx);
  }
  return [];
}

// 「それのレベル１につき」族（タスク12(liii)）の倍率。対象は常に単数なので最大値＝そのカードのレベル。
// instanceId（`CardNum#N`）で来ることがあるため getCardNum で素の番号に戻してから引く。
export function maxCardLevel(cardNums: string[] | undefined, ctx: ExecCtx): number {
  if (!cardNums || cardNums.length === 0) return 0;
  return Math.max(0, ...cardNums.map(n =>
    Number.parseInt(ctx.cardMap.get(getCardNum(n))?.Level ?? '0', 10) || 0));
}

/** 「それらのレベルの合計」族。0／欠損レベルは呼び出し側の levelUnavailable で fail-closed にする。 */
export function sumCardLevels(cardNums: string[] | undefined, ctx: ExecCtx): { sum: number; unavailable: boolean } {
  if (!cardNums || cardNums.length === 0) return { sum: 0, unavailable: true };
  const levels = cardNums.map(n => Number.parseInt(ctx.cardMap.get(getCardNum(n))?.Level ?? '0', 10) || 0);
  return { sum: levels.reduce((total, level) => total + level, 0), unavailable: levels.some(level => level <= 0) };
}

// ===== OPTIONAL_COST の支払い仕様 =====

// OPTIONAL_COST の「何をいくつ払うか」を1本にまとめて解決する。Pattern ③/④/⑤ の3サイトで
// 同じ算出が写経されていたため（handDiscardCountFromTargetLevel だけで既に3重）ここへ集約した。
//
// タスク12(liii)「それのレベル１につき〈コスト単位〉を支払ってもよい」族＝支払い量が
// **対象シグニのレベル** で決まる。対象は SELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS で
// storedTargetCards に固定済みなので、そのレベルを単位コストに掛ける。
// 対象が取れなかった（level=0）ときは「0個払って発動」ではなく **支払い不可** に倒す。
export interface OptionalCostSpec {
  costColors: string[];
  handDiscard?: { count: number | 'ALL'; upToCount?: boolean; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  handReveal?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  handToEnergy?: { count: number; filter?: TargetFilter };
  handToUnderSelf?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  // ⚠これは**解決後**の runtime 型＝`src/types/effects.ts` の JSON payload 型とは**別物**。
  //   片方にキーを足しただけでは `resolveOptionalCostSpec` が落として黙って無視される（続き422 で実際に踏んだ）。
  underAnySigniTrash?: { count: number; fromThis?: boolean; filter?: TargetFilter };
  /** トラッシュから条件一致カードを除外する。owner:'any' は両プレイヤーを単一候補プールにする。 */
  trashExile?: { count: number; owner: Owner; filter?: TargetFilter };
  energyTrash?: { count: number | 'ALL'; upToCount?: boolean; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  /** 異なるフィルタの組でエナから置く（「《A》1枚と《B》1枚と…」）。支払いはグループごとに1ステップへ分解する。 */
  energyTrashGroups?: { count: number; filter?: TargetFilter }[];
  fieldTrash?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  /** field.signi_traps はシグニゾーンと別領域なので fieldTrash と分ける。 */
  fieldTrapTrash?: { count: number; excludeSource?: boolean };
  fieldToDeckBottom?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  fieldTrashGroups?: { count: number; filter?: TargetFilter }[];
  fieldToLrigTrash?: { count: number; filter?: TargetFilter };
  /**
   * 「このキーを場からルリグトラッシュに置く」（§6.4 O-3・`WDK06-R09-E1`）。
   * ⚠**キーゾーンはシグニゾーンと別**なので `fieldToLrigTrash`（シグニ／レゾナ用）では払えない。
   */
  trashOwnKey?: boolean;
  fieldDown?: { count: number; filter?: TargetFilter };
  lrigDown?: { count: number; centerOnly?: boolean; level?: number };
  down_self?: boolean;
  /** 効果元シグニ自身を場からエナゾーンへ置く任意コスト（§6.4 O-7）。 */
  selfToEnergy?: boolean;
  /** 効果元シグニ自身を場からトラッシュへ置く任意コスト（§6.4 O-11）。`selfToEnergy` の行き先違い。 */
  selfTrash?: boolean;
  /**
   * 効果元カード自身を**エナゾーンから**デッキの一番下へ置く任意コスト（§5.3 `O-55`）。
   * ⚠払う場所が**場ではなくエナゾーン**＝`selfToEnergy`／`selfTrash` と成立条件が違う
   *   （バニッシュで既にエナへ行った自分自身が対価なので、場に居たら**払えない**）。
   */
  selfEnergyToDeckBottom?: boolean;
  beat_signi?: BeatSigniCost;
  beat_signi_from_trash?: { count: number; filter?: TargetFilter };
  life_crash?: number;
  lifeTrash?: number;
  lifeToHand?: number;
  deckTrash?: number;
  charmTrash?: number;
  trashArtsFromLrigDeck?: { color?: string; count: number };
  removeOppVirus?: number;
  /**
   * 🔴「（使用コストとして）追加でエクシードNを支払ってもよい」（§6.4 O-11・2026-08-16）。
   * ⚠**`StubAction.exceed` は前からあり live に9効果いたのに、この runtime spec に無かった**＝
   *   `resolveOptionalCostSpec` が黙って落とし、pay を選んでも**エクシードがタダ**になっていた
   *   （上の「片方にキーを足しただけでは無視される」注記＝続き422 の罠を実際にもう一度踏んでいた）。
   */
  exceed?: number;
  /** レベル倍率が要るのに対象レベルが 0＝支払い自体が成立しない */
  levelUnavailable: boolean;
}

export function resolveOptionalCostSpec(a: StubAction, ctx: ExecCtx): OptionalCostSpec {
  const level = maxCardLevel(ctx.storedTargetCards, ctx);
  const levelSum = sumCardLevels(ctx.storedTargetCards, ctx);
  const perLevel = !!(a.costColorsPerTargetLevel || a.costColorsPerTargetLevelSum
    || a.handDiscardCountFromTargetLevel || a.energyTrashCountFromTargetLevel);
  const costColors = a.costColorsPerTargetLevelSum
    ? Array.from({ length: levelSum.sum }, () => a.costColorsPerTargetLevelSum!).flat()
    : a.costColorsPerTargetLevel
      ? Array.from({ length: level }, () => a.costColorsPerTargetLevel!).flat()
    : (a.costColors ?? []);
  const handDiscard = a.handDiscardCountFromTargetLevel
    ? { count: level, filter: a.handDiscardFilter }
    : a.handDiscard;
  const energyTrash = a.energyTrash
    ? {
        count: a.energyTrashCountFromTargetLevel ? level : a.energyTrash.count,
        upToCount: a.energyTrash.upToCount,
        // 「それと同じレベルの緑のシグニ」＝候補側にも対象のレベルを課す（翠英　マキトミ）
        filter: a.energyTrashSameLevelAsTarget ? { ...a.energyTrash.filter, level } : a.energyTrash.filter,
        selectionConstraint: a.energyTrash.selectionConstraint,
      }
    : undefined;
  return {
    costColors, handDiscard, handReveal: a.handReveal, handToEnergy: a.handToEnergy, handToUnderSelf: a.handToUnderSelf,
    underAnySigniTrash: a.underAnySigniTrash, trashExile: a.trashExile,
    energyTrash, energyTrashGroups: a.energyTrashGroups,
    fieldTrash: a.fieldTrash, fieldTrapTrash: a.fieldTrapTrash,
    fieldToDeckBottom: a.fieldToDeckBottom, fieldTrashGroups: a.fieldTrashGroups,
    fieldToLrigTrash: a.fieldToLrigTrash, trashOwnKey: a.trashOwnKey, fieldDown: a.fieldDown, lrigDown: a.lrigDown, down_self: a.down_self, selfToEnergy: a.selfToEnergy, selfTrash: a.selfTrash,
    selfEnergyToDeckBottom: a.selfEnergyToDeckBottom,
    beat_signi: a.beat_signi, beat_signi_from_trash: a.beat_signi_from_trash,
    life_crash: a.life_crash, lifeTrash: a.lifeTrash, lifeToHand: a.lifeToHand,
    deckTrash: a.deckTrash, charmTrash: a.charmTrash, exceed: a.exceed,
    trashArtsFromLrigDeck: a.trashArtsFromLrigDeck, removeOppVirus: a.removeOppVirus,
    levelUnavailable: perLevel && (a.costColorsPerTargetLevelSum ? levelSum.unavailable : level <= 0),
  };
}

function hasValidConstrainedSelection(
  candidates: string[],
  count: number | 'ALL',
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  const minCount = count === 'ALL' ? 0 : count;
  const maxCount = count === 'ALL' ? candidates.length : count;
  if (!constraint) return candidates.length >= minCount;
  return findValidConstrainedSelection(candidates, minCount, maxCount, constraint, cardMap) !== null;
}

/** 選択集合制約を満たす組み合わせを探す。候補提示前 fail-closed と CPU 選択で共用する。 */
export function findValidConstrainedSelection(
  candidates: string[],
  minCount: number,
  maxCount: number,
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): string[] | null {
  if (!constraint) return candidates.length >= minCount ? candidates.slice(0, Math.min(maxCount, candidates.length)) : null;
  const selected: string[] = [];
  const find = (start: number): boolean => {
    if (selected.length >= minCount && satisfiesSelectionConstraint(selected, constraint, cardMap)) return true;
    if (selected.length >= maxCount) return false;
    for (let i = start; i < candidates.length; i++) {
      if (!canAddToSelection(selected, candidates[i], constraint, cardMap)) continue;
      selected.push(candidates[i]);
      if (find(i + 1)) return true;
      selected.pop();
    }
    return false;
  };
  return find(0) ? [...selected] : null;
}

// 支払い可能か（エナ色・手札・エナゾーンの在庫）。handDiscardGroups は呼び出し側の既存判定に残す。
export function canAffordOptionalCostSpec(spec: OptionalCostSpec, ctx: ExecCtx): boolean {
  if (spec.levelUnavailable) return false;
  if (spec.costColors.length > 0 && !canPayOptionalCost(spec.costColors, ctx.ownerState, ctx.cardMap)) return false;
  if (spec.exceed !== undefined) {
    // エクシード＝**ルリグの下**のカード（センター＋アシスト左右。各ゾーンの最上段＝ルリグ本体は除く）。
    const underCount = [ctx.ownerState.field.lrig, ctx.ownerState.field.assist_lrig_l, ctx.ownerState.field.assist_lrig_r]
      .reduce((n, zone) => n + Math.max(0, (zone?.length ?? 0) - 1), 0);
    if (underCount < spec.exceed) return false;
  }
  if (spec.handDiscard) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handDiscard!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handDiscard!.filter));
    if (spec.handDiscard.count !== 'ALL' && matching.length < spec.handDiscard.count) return false;
    if (!hasValidConstrainedSelection(matching, spec.handDiscard.count, spec.handDiscard.selectionConstraint, ctx.cardMap)) return false;
  }
  if (spec.handReveal) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handReveal!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handReveal!.filter));
    if (matching.length < spec.handReveal.count) return false;
    if (!hasValidConstrainedSelection(matching, spec.handReveal.count, spec.handReveal.selectionConstraint, ctx.cardMap)) return false;
  }
  if (spec.energyTrash) {
    const matching = ctx.ownerState.energy.filter(n =>
      !spec.energyTrash!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.energyTrash!.filter));
    if (spec.energyTrash.count !== 'ALL' && matching.length < spec.energyTrash.count) return false;
    if (!hasValidConstrainedSelection(matching, spec.energyTrash.count, spec.energyTrash.selectionConstraint, ctx.cardMap)) return false;
  }
  if (spec.energyTrashGroups?.length) {
    // 🔴**グループごとに別カードが要る**＝合計枚数だけを見ると同名3枚でも払えてしまう。
    //   候補の少ないグループから確保する（`fieldTrashGroupsAffordable` と同じ規約）。
    const usedETG = new Set<number>();
    const orderETG = spec.energyTrashGroups
      .map(g => ({ g, cands: ctx.ownerState.energy
        .map((_, i) => i)
        .filter(i => !g.filter || matchesFilter(ctx.cardMap.get(getCardNum(ctx.ownerState.energy[i])), g.filter)) }))
      .sort((x, y) => x.cands.length - y.cands.length);
    for (const { g, cands } of orderETG) {
      let take = g.count;
      for (const i of cands) {
        if (take <= 0) break;
        if (usedETG.has(i)) continue;
        usedETG.add(i); take--;
      }
      if (take > 0) return false;
    }
  }
  if (spec.handToEnergy) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handToEnergy!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handToEnergy!.filter));
    if (matching.length < spec.handToEnergy.count) return false;
  }
  if (spec.handToUnderSelf) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handToUnderSelf!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handToUnderSelf!.filter));
    if (matching.length < spec.handToUnderSelf.count) return false;
    if (!hasValidConstrainedSelection(matching, spec.handToUnderSelf.count, spec.handToUnderSelf.selectionConstraint, ctx.cardMap)) return false;
    if (!ctx.sourceCardNum || !ctx.ownerState.field.signi.some(stack => stack?.includes(ctx.sourceCardNum!))) return false;
  }
  if (spec.underAnySigniTrash) {
    // fromThis＝「このシグニの下から」＝効果元スタックの下だけを数える（全シグニで数えると
    // **他のシグニの下のカードで払えてしまう**＝原文より緩い）。
    // ⚠filter 指定時は**一致する下カードだけ**を数える（数えないと払えない盤面で「支払う」が出る）
    const uFil = spec.underAnySigniTrash.filter;
    const uMatch = (cn: string) => !uFil || matchesFilter(ctx.cardMap.get(getCardNum(cn)), uFil);
    const underCount = spec.underAnySigniTrash.fromThis
      ? ((ctx.ownerState.field.signi.find(st => st?.includes(ctx.sourceCardNum ?? '')) ?? []).slice(0, -1).filter(uMatch).length)
      : underAnySigniCostCandidates(ctx.ownerState).filter(c => uMatch(c.cardNum)).length;
    if (underCount < spec.underAnySigniTrash.count) return false;
  }
  if (spec.trashExile) {
    const owners: Owner[] = spec.trashExile.owner === 'any'
      ? ['self', 'opponent'] : [spec.trashExile.owner];
    const matching = owners.flatMap(owner => movableTrashCandidates(
      owner, ownerState(owner, ctx), spec.trashExile!.filter, ctx.cardMap, ctx, ctx.treatAsClassAllZones,
    ));
    if (matching.length < spec.trashExile.count) return false;
  }
  if (spec.fieldTrash) {
    const filter = {
      ...(spec.fieldTrash.filter ?? {}),
      ...(spec.fieldTrash.excludeSelf ? { excludeSelf: true } : {}),
    };
    const matching = fieldCandidates(ctx.ownerState, filter, ctx.cardMap)
      .filter(n => !spec.fieldTrash!.excludeSelf || !ctx.sourceCardNum || n !== ctx.sourceCardNum);
    if (matching.length < spec.fieldTrash.count) return false;
  }
  if (spec.fieldTrapTrash) {
    const matching = (ctx.ownerState.field.signi_traps ?? [])
      .filter((n): n is string => !!n)
      .filter(n => !spec.fieldTrapTrash!.excludeSource || !ctx.sourceCardNum || n !== ctx.sourceCardNum);
    if (matching.length < spec.fieldTrapTrash.count) return false;
  }
  if (spec.fieldToDeckBottom) {
    const matching = fieldCandidates(ctx.ownerState, spec.fieldToDeckBottom.filter, ctx.cardMap)
      .filter(n => !spec.fieldToDeckBottom!.excludeSelf || !ctx.sourceCardNum || n !== ctx.sourceCardNum);
    if (matching.length < spec.fieldToDeckBottom.count) return false;
  }
  if (spec.fieldTrashGroups
    && !fieldTrashGroupsAffordable(spec.fieldTrashGroups, ctx.ownerState.field.signi, ctx.cardMap)) return false;
  if (spec.fieldToLrigTrash) {
    const matching = fieldCandidates(ctx.ownerState, spec.fieldToLrigTrash.filter, ctx.cardMap);
    if (matching.length < spec.fieldToLrigTrash.count) return false;
  }
  // キーを場に持っていなければ払えない（＝「そうした場合」の帰結も起きない）
  if (spec.trashOwnKey && !ctx.ownerState.field.key_piece) return false;
  if (spec.fieldDown) {
    // アップ状態の自分シグニがN体そろっているか（`isUp` はフィルタ側で判定される）
    const matching = fieldCandidates(ctx.ownerState, { ...(spec.fieldDown.filter ?? {}), isUp: true }, ctx.cardMap);
    if (matching.length < spec.fieldDown.count) return false;
  }
  if (spec.lrigDown) {
    if (!payLrigDownCost(ctx.ownerState, spec.lrigDown, ctx.cardMap)) return false;
  }
  if (spec.down_self) {
    if (!ctx.sourceCardNum) return false;
    const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === ctx.sourceCardNum);
    if (zoneIdx < 0 || (ctx.ownerState.field.signi_down?.[zoneIdx] ?? false)) return false;
  }
  if (spec.selfToEnergy || spec.selfTrash) {
    // 場を離れることが対価＝効果元シグニが場に居ないと払えない（アタック後に既に落ちている等）。
    if (!ctx.sourceCardNum) return false;
    if (!ctx.ownerState.field.signi.some(stack => stack?.at(-1) === ctx.sourceCardNum)) return false;
  }
  if (spec.selfEnergyToDeckBottom) {
    // ⚠**エナゾーンに居ることが条件**（場ではない）＝上の selfToEnergy 系と成立条件が逆。
    if (!ctx.sourceCardNum) return false;
    if (!ctx.ownerState.energy.includes(ctx.sourceCardNum)) return false;
  }
  if (spec.beat_signi) {
    if (!ctx.sourceCardNum) return false;
    const analysis = analyzeBeatSigniCost(
      ctx.ownerState, ctx.sourceCardNum, ctx.cardMap, spec.beat_signi,
    );
    if ((analysis.includeSelf && analysis.selfZone < 0)
      || analysis.eligibleOtherZones.length < analysis.otherPart) return false;
  }
  if (spec.beat_signi_from_trash) {
    const paid = payBeatSigniFromTrashCost(
      ctx.ownerState, ctx.cardMap,
      spec.beat_signi_from_trash.count, spec.beat_signi_from_trash.filter,
    );
    if (!paid.ok) return false;
  }
  const lifeCount = (spec.life_crash ?? 0) + (spec.lifeTrash ?? 0) + (spec.lifeToHand ?? 0);
  if (ctx.ownerState.life_cloth.length < lifeCount) return false;
  if (spec.deckTrash && ctx.ownerState.deck.length < spec.deckTrash) return false;
  if (spec.charmTrash
    && (ctx.ownerState.field.signi_charms ?? []).filter(Boolean).length < spec.charmTrash) return false;
  if (spec.trashArtsFromLrigDeck) {
    const matching = ctx.ownerState.lrig_deck.filter(n =>
      matchesTrashArtsFromLrigDeckCost(ctx.cardMap.get(getCardNum(n)), spec.trashArtsFromLrigDeck!));
    if (matching.length < spec.trashArtsFromLrigDeck.count) return false;
  }
  if (spec.removeOppVirus
    && (ctx.otherState.field.signi_virus ?? []).reduce((sum, n) => sum + n, 0) < spec.removeOppVirus) return false;
  return true;
}

/**
 * 支払いボタンのラベルに**エナ色以外で足すべき対価**（§6.4 O-26・続き535）。
 *
 * 🔴任意コストのラベルは長らく `costColors` だけを並べており、**「このシグニ自身を失う」対価が
 *   一言も出ないまま pay/skip を選ばせていた**（＝「《無》を1つ払うだけ」に見える）。支払い自体は
 *   `optionalCostPaySteps` が行うので挙動バグではないが、実機で判断できない表示だった。
 * ⚠ラベル生成は pay 枝が4サイトに分かれている（Pattern ③/④/⑤ ＋ `execStubPart1` のエッジ）ので
 *   **ここに集約する**＝1サイトだけ直すと他が古いままになる。
 * ⚠**エナ色・コイン・エクシードは含めない**（サイトごとに書式が違うため呼び出し側の領分）。
 */
export function optionalCostExtraLabels(spec: OptionalCostSpec): string[] {
  return [
    ...(spec.selfTrash ? ['このシグニをトラッシュ'] : []),
    ...(spec.selfToEnergy ? ['このシグニをエナゾーンへ'] : []),
    ...(spec.selfEnergyToDeckBottom ? ['このシグニをエナゾーンからデッキの一番下へ'] : []),
    ...(spec.trashExile ? [`${spec.trashExile.owner === 'any' ? 'いずれかの' : '自分の'}トラッシュから${spec.trashExile.count}枚を除外`] : []),
    ...(spec.fieldTrapTrash ? [`${spec.fieldTrapTrash.excludeSource ? '他の' : ''}【トラップ】${spec.fieldTrapTrash.count}枚をトラッシュ`] : []),
  ];
}

// 支払いそのものを表す前置ステップ（エナ色は pending の costColors で UI が徴収するためここには含めない）。
export function optionalCostPaySteps(spec: OptionalCostSpec): EffectAction[] {
  return [
    ...(spec.handDiscard ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'HAND_CARD', owner: 'self', count: spec.handDiscard.count,
        ...(spec.handDiscard.upToCount ? { upToCount: true } : {}),
        filter: spec.handDiscard.filter, selectionConstraint: spec.handDiscard.selectionConstraint },
    } as EffectAction] : []),
    ...(spec.handReveal ? [{
      type: 'REVEAL',
      source: {
        type: 'HAND_CARD', owner: 'self', count: spec.handReveal.count,
        filter: spec.handReveal.filter, selectionConstraint: spec.handReveal.selectionConstraint,
      },
    } as EffectAction] : []),
    ...(spec.energyTrash ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'ENERGY_CARD', owner: 'self', count: spec.energyTrash.count,
        ...(spec.energyTrash.upToCount ? { upToCount: true } : {}),
        filter: spec.energyTrash.filter, selectionConstraint: spec.energyTrash.selectionConstraint },
    } as EffectAction] : []),
    // 🔑`energyTrashGroups` は**グループごとに1ステップ**へ分解する＝
    //   1本の TRASH に潰すと「《A》1枚と《B》1枚と…」の「各1枚ずつ」が消えて同名3枚でも払えてしまう。
    ...((spec.energyTrashGroups ?? []).map(g => ({
      type: 'TRASH', asCost: true,
      target: { type: 'ENERGY_CARD', owner: 'self', count: g.count, filter: g.filter },
    } as EffectAction))),
    ...(spec.handToEnergy ? [{
      type: 'ENERGY_CHARGE', asCost: true,
      target: { type: 'HAND_CARD', owner: 'self', count: spec.handToEnergy.count, filter: spec.handToEnergy.filter },
    } as EffectAction] : []),
    // エクシードは既存の `INTERNAL_PAY_EXCEED`（ルリグの下→ルリグトラッシュ）で払う＝新機構は要らない。
    ...(spec.exceed !== undefined ? [{
      type: 'STUB', id: 'INTERNAL_PAY_EXCEED', value: spec.exceed,
    } as EffectAction] : []),
    ...(spec.handToUnderSelf ? [{
      type: 'PLACE_UNDER_SIGNI', source: 'hand', count: spec.handToUnderSelf.count, filter: spec.handToUnderSelf.filter,
      selectionConstraint: spec.handToUnderSelf.selectionConstraint,
    } as EffectAction] : []),
    ...(spec.underAnySigniTrash ? [{
      type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash',
      count: spec.underAnySigniTrash.count, upToCount: false,
      ...(spec.underAnySigniTrash.fromThis ? { fromThis: true } : {}),
      // ⚠filter を渡さないと `execTakeFromUnderSigni` が**下のどのカードでも払える**（原文より緩い）。
      //   続き421 で「赤のシグニ1枚」等の絞り込みを parser が載せ始めたので、ここで受ける（続き422）。
      ...(spec.underAnySigniTrash.filter ? { filter: spec.underAnySigniTrash.filter } : {}),
    } as EffectAction] : []),
    ...(spec.trashExile ? [{
      type: 'EXILE',
      target: {
        type: 'TRASH_CARD', owner: spec.trashExile.owner, count: spec.trashExile.count,
        filter: spec.trashExile.filter,
      },
    } as EffectAction] : []),
    ...(spec.fieldTrash ? [{
      type: 'TRASH', asCost: true,
      target: {
        type: 'SIGNI', owner: 'self', count: spec.fieldTrash.count,
        filter: {
          ...(spec.fieldTrash.filter ?? {}),
          ...(spec.fieldTrash.excludeSelf ? { excludeSelf: true } : {}),
        },
      },
    } as EffectAction] : []),
    ...(spec.fieldTrapTrash ? [{
      type: 'STUB', id: 'INTERNAL_TRASH_FIELD_TRAP_COST', fieldTrapTrash: spec.fieldTrapTrash,
    } as EffectAction] : []),
    ...(spec.fieldToDeckBottom ? [{
      type: 'TRANSFER_TO_DECK', shuffle: false, position: 'bottom',
      source: {
        type: 'SIGNI', owner: 'self', count: spec.fieldToDeckBottom.count,
        filter: {
          ...(spec.fieldToDeckBottom.filter ?? {}),
          ...(spec.fieldToDeckBottom.excludeSelf ? { excludeSelf: true } : {}),
        },
      },
    } as EffectAction] : []),
    ...(spec.fieldTrashGroups ?? []).map(group => ({
      type: 'TRASH', asCost: true,
      target: { type: 'SIGNI', owner: 'self', count: group.count, filter: group.filter },
    } as EffectAction)),
    ...(spec.fieldToLrigTrash ? [{
      type: 'TRASH', asCost: true, destination: 'lrig_trash',
      target: { type: 'SIGNI', owner: 'self', count: spec.fieldToLrigTrash.count, filter: spec.fieldToLrigTrash.filter },
    } as EffectAction] : []),
    // キーは既存の内部ハンドラ（`INTERNAL_TRASH_OWN_KEY`）で場→ルリグトラッシュへ移す。
    ...(spec.trashOwnKey ? [{ type: 'STUB', id: 'INTERNAL_TRASH_OWN_KEY' } as EffectAction] : []),
    ...(spec.fieldDown ? [{
      type: 'DOWN',
      target: { type: 'SIGNI', owner: 'self', count: spec.fieldDown.count, upToCount: false,
        filter: { ...(spec.fieldDown.filter ?? {}), isUp: true } },
    } as EffectAction] : []),
    ...(spec.lrigDown ? [{
      type: 'STUB', id: 'INTERNAL_PAY_LRIG_DOWN', lrigDown: spec.lrigDown,
    } as EffectAction] : []),
    ...(spec.down_self ? [{
      type: 'DOWN',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
    } as EffectAction] : []),
    ...(spec.selfToEnergy ? [{
      type: 'SEND_TO_ENERGY',
      target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', thisCardOnly: true } },
    } as EffectAction] : []),
    ...(spec.selfTrash ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', thisCardOnly: true } },
    } as EffectAction] : []),
    ...(spec.selfEnergyToDeckBottom ? [{
      type: 'TRANSFER_TO_DECK',
      source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: false, filter: { thisCardOnly: true } },
      shuffle: false, position: 'bottom',
    } as EffectAction] : []),
    ...((spec.beat_signi || spec.beat_signi_from_trash) ? [{
      type: 'STUB', id: 'INTERNAL_PAY_BEAT_SIGNI',
      beat_signi: spec.beat_signi,
      beat_signi_from_trash: spec.beat_signi_from_trash,
    } as EffectAction] : []),
    ...(spec.life_crash ? [{
      type: 'LIFE_CRASH', owner: 'self', count: spec.life_crash, triggerBurst: true,
    } as EffectAction] : []),
    ...(spec.lifeTrash ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: spec.lifeTrash },
    } as EffectAction] : []),
    ...(spec.lifeToHand ? [{
      type: 'TRANSFER_TO_HAND',
      source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: spec.lifeToHand },
    } as EffectAction] : []),
    ...(spec.deckTrash ? [{
      type: 'MILL', owner: 'self', count: spec.deckTrash,
    } as EffectAction] : []),
    ...(spec.charmTrash ? [{
      type: 'STUB', id: 'INTERNAL_PAY_CHARM_TRASH', charmTrash: spec.charmTrash,
    } as EffectAction] : []),
    ...(spec.trashArtsFromLrigDeck ? [{
      type: 'STUB', id: 'INTERNAL_PAY_TRASH_ARTS_FROM_LRIG_DECK',
      trashArtsFromLrigDeck: spec.trashArtsFromLrigDeck,
    } as EffectAction] : []),
    ...(spec.removeOppVirus ? [{
      type: 'STUB', id: 'INTERNAL_PAY_REMOVE_OPP_VIRUS', removeOppVirus: spec.removeOppVirus,
    } as EffectAction] : []),
  ];
}

// バニッシュされたシグニの行き先を決定する（BattleScreenのバトルバニッシュと同一の優先順）。
// - 相手側の banish_redirect: エナの代わりにトラッシュへ
// - 相手側の banish_redirect_to_hand: エナの代わりに手札へ
// - 自身の opp_signi_energy_to_deck_bottom (WX25-CP1-003): エナの代わりにデッキの一番下へ
//
// opts（タスク12(xliv)(a2)）＝効果経路の 【常】 BANISH_REDIRECT 走査用。cardMap を渡すと、ターン内フラグが
// 立っていなくても opponent（＝置換能力の持ち主）の場にある CONTINUOUS BANISH_REDIRECT を on-the-fly で
// 評価してトラッシュ送りにする（バトル/パワー0経路が既に行っている走査の効果経路版）。省略＝従来どおりフラグのみ。
export function banishDestination(
  removed: PlayerState,   // バニッシュされた側の状態（removeFromField適用済み）
  opponent: PlayerState,  // バニッシュされた側から見た対戦相手の状態（＝置換能力の持ち主候補）
  num: string,
  opts?: {
    cardMap?: Map<string, CardData>;
    banished?: BanishedCardAttrs;       // 除去前盤面から取った被バニッシュ属性（computeBanishedAttrs）
    turnPhase?: TurnPhase;
    effectivePowers?: Map<string, number>;
    effectSourceNum?: string;
  },
): { state: PlayerState; log: string } {
  if (opponent.banish_redirect_target_nums?.includes(num)) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (opponent.banish_redirect === true) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (opponent.banish_redirect_to_hand === true) {
    return { state: { ...removed, hand: [...removed.hand, num] }, log: 'をバニッシュ（手札へ）' };
  }
  // BANISH_REDIRECT redirectTo:'exile'（SPDi47-05）: エナの代わりにゲームから除外＝どのゾーンにも置かない
  if (opponent.banish_redirect_to_exile === true) {
    return { state: removed, log: 'をバニッシュ（ゲームから除外）' };
  }
  // 効果経路の 【常】 BANISH_REDIRECT（redirectTo:'trash'）走査（タスク12(xliv)(a2)）。
  // ターン内フラグに載らない常在置換をここで拾う。redirectBanish はデッキ下より優先（バトル経路と同順）。
  if (opts?.cardMap && fieldEffectBanishRedirectToTrash(opponent, removed, opts.cardMap, opts.banished, opts.turnPhase, opts.effectivePowers, opts.effectSourceNum)) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (removed.opp_signi_energy_to_deck_bottom === true) {
    return { state: { ...removed, deck: [...removed.deck, num] }, log: '→デッキ下' };
  }
  return { state: { ...removed, energy: [...removed.energy, num] }, log: 'をバニッシュ' };
}

/**
 * banishDestination の効果経路 opts を ExecCtx から組み立てるヘルパー（タスク12(xliv)(a2)）。
 * `victimState` は removeFromField 適用**前**の被バニッシュ側の状態を渡すこと（属性取得のため）。
 */
export function banishRedirectOpts(ctx: ExecCtx, victimState: PlayerState, num: string) {
  return {
    cardMap: ctx.cardMap,
    banished: computeBanishedAttrs(victimState, num, ctx.cardMap),
    turnPhase: ctx.currentPhase as TurnPhase | undefined,
    effectivePowers: ctx.effectivePowers,
    effectSourceNum: ctx.sourceCardNum,
  };
}

// 傀儡（puppet）の離場回収: fieldOwner の場の puppet_signi のうち、もう場にないものを
// fieldOwner の各ゾーン（エナ/トラッシュ/手札/デッキ）から取り除き、持ち主（trueOwner）のトラッシュへ移す。
// 「傀儡状態のシグニが場を離れる場合、代わりに持ち主のトラッシュに置かれる」（WDK17-007）の近似（移動後に回収）。
function relocateLeftPuppets(fieldOwner: PlayerState, trueOwner: PlayerState): { fieldOwner: PlayerState; trueOwner: PlayerState } {
  const puppets = fieldOwner.field.puppet_signi ?? [];
  if (puppets.length === 0) return { fieldOwner, trueOwner };
  const onField = new Set<string>();
  for (const z of fieldOwner.field.signi) for (const id of (z ?? [])) onField.add(id);
  const left = puppets.filter(p => !onField.has(p));
  if (left.length === 0) return { fieldOwner, trueOwner };
  const leftSet = new Set(left);
  const fo: PlayerState = {
    ...fieldOwner,
    energy: fieldOwner.energy.filter(n => !leftSet.has(n)),
    trash: fieldOwner.trash.filter(n => !leftSet.has(n)),
    hand: fieldOwner.hand.filter(n => !leftSet.has(n)),
    deck: fieldOwner.deck.filter(n => !leftSet.has(n)),
    field: { ...fieldOwner.field, puppet_signi: puppets.filter(p => !leftSet.has(p)) },
  };
  const to: PlayerState = { ...trueOwner, trash: [...trueOwner.trash, ...left] };
  return { fieldOwner: fo, trueOwner: to };
}

/**
 * §5.3 `O-81`＝**裏向きで付けられたカード**（`field.signi_facedown_attached`）のうち、
 * ホストが場からいなくなったものを**公開して持ち主の手札へ戻す**（`WX16-003-E2` の
 * 「そのシグニが場を離れる場合、追加でこれによって付けたカードを公開し手札に戻す」）。
 *
 * 🔴**`removeFromField` だけでは足りない**（2026-08-26 の実機検証で判明）＝
 *   **バトル解決は funnel を通らず `field` を手で組み直す**ので、そこを通ると付いたカードが
 *   場からも手札からも消えて**行方不明になる**（実測）。⇒ `sweepPuppets` と同じ
 *   「**盤面から導出する掃除**」にして、funnel を通らない経路もまとめて拾う。
 *
 * ⚠**何も公開しないときは `facedown_revealed_just` に触らない**＝
 *   `removeFromField` が同じ解決内で立てたマーカーを消してしまうため（消すのは funnel の役目）。
 */
export function sweepFacedownAttached(state: PlayerState): PlayerState {
  const slots = state.field.signi_facedown_attached;
  if (!slots?.some(v => v?.length)) return state;
  const next = [...slots] as (string[] | null)[];
  const revealed: string[] = [];
  slots.forEach((cards, zi) => {
    if (!cards?.length) return;
    if ((state.field.signi[zi] ?? []).length > 0) return;   // ホストが健在＝まだ付いている
    revealed.push(...cards);
    next[zi] = null;
  });
  if (revealed.length === 0) return state;
  return {
    ...state,
    hand: [...state.hand, ...revealed],
    facedown_revealed_just: revealed,
    field: { ...state.field, signi_facedown_attached: next },
  };
}

// 両プレイヤーの場から離れた傀儡を持ち主のトラッシュへ回収する（効果/バトル解決後に呼ぶ）。
export function sweepPuppets(a: PlayerState, b: PlayerState): { a: PlayerState; b: PlayerState } {
  if ((a.field.puppet_signi?.length ?? 0) === 0 && (b.field.puppet_signi?.length ?? 0) === 0) return { a, b };
  const r1 = relocateLeftPuppets(a, b); // a の場の傀儡（持ち主=b）が離場 → b.trash
  let aS = r1.fieldOwner, bS = r1.trueOwner;
  const r2 = relocateLeftPuppets(bS, aS); // b の場の傀儡（持ち主=a）が離場 → a.trash
  bS = r2.fieldOwner; aS = r2.trueOwner;
  return { a: aS, b: bS };
}

// Color列は「黒青」のような連結形式（'/'区切りではない）。単色文字に分解する（「無」は色を持たないため含まない）
export function splitColors(col: string | undefined): string[] {
  if (!col) return [];
  return [...col].filter(c => '白赤青緑黒'.includes(c));
}

// 規則解釈：「精武：アーム」は上位・下位の両クラスを持つものとして2 tokenに数える。
// 公式解釈が異なると判明した場合は、この1箇所を直せば全ゾーンのクラス種類数判定が変わる。
export function splitClasses(col: string | undefined): string[] {
  if (!col) return [];
  return col.split('：').map(s => s.trim()).filter(Boolean);
}

// センタールリグ＋左右アシストルリグの各グロウスタック頂点（現在のルリグ）を返す。
// HAS_CARD_IN_FIELD の「場に《X》がいる」でルリグ名を照合するために使う。
export function lrigZoneTops(field: PlayerState['field']): (string | undefined)[] {
  return [field.lrig?.at(-1), field.assist_lrig_l?.at(-1), field.assist_lrig_r?.at(-1)];
}

/**
 * `DESIGNATE_SIGNI_ZONE` で指定されたゾーン番号（§6.4 O-16）。
 * **読みはこの1本に集約する**＝複数対応の `designated_zones` と、進行中セーブに残る旧 `designated_zone`
 * （単一）の両方をここで吸収する。片方だけ見る読み手を作ると、2ゾーン指定の札で片方が無言で落ちる。
 */
export function designatedZones(state: PlayerState): number[] {
  if (state.designated_zones?.length) return state.designated_zones;
  return state.designated_zone === undefined ? [] : [state.designated_zone];
}

export function ownerState(owner: Owner, ctx: ExecCtx): PlayerState {
  return owner === 'self' ? ctx.ownerState : ctx.otherState;
}

export function setOwnerState(owner: Owner, s: PlayerState, ctx: ExecCtx): ExecCtx {
  return owner === 'self'
    ? { ...ctx, ownerState: s }
    : { ...ctx, otherState: s };
}

export function addLog(ctx: ExecCtx, msg: string): ExecCtx {
  return { ...ctx, logs: [...ctx.logs, msg] };
}

// 任意コストが支払えるかチェック（色の一致を検証）
// コストスロットは「青」「無」のほか、選択肢を表す「青|黒」（青か黒のいずれか1エナ）形式を許容する。
export const costSlotIsAny = (slot: string): boolean => slot.split('|').some(c => c === '無');
export const energyMatchesCostSlot = (color: string, slot: string): boolean =>
  slot.split('|').some(c => color.includes(c));
/** コストスロットを表示用に整形（"青|黒" → "《青》か《黒》"） */
export const formatCostSlot = (slot: string): string => slot.split('|').map(c => `《${c}》`).join('か');

/**
 * 任意コストを満たすエナカード（instanceId）を実際に選び出す。支払えなければ null。
 * ⚠**「支払えるか」と「何で払うか」は必ずこの1本から出すこと**（タスク12(cii)）。
 *   判定と選出を別々に書くと「available なのに払えない／払えるのに available でない」がすれ違う。
 *   CPU 自動応答はこの戻り値をそのまま `resumeOpponentPayOptional`／`resumeOptionalCost` へ渡す。
 */
export function selectOptionalCostEnergy(
  costColors: string[], state: PlayerState, cardMap: Map<string, CardData>,
): string[] | null {
  const pool = [...state.energy];
  const picked: string[] = [];
  // 無色（任意エナ可）スロットは色指定スロットを先に消費してから割り当てる
  const ordered = [...costColors].sort((a, b) => (costSlotIsAny(a) ? 1 : 0) - (costSlotIsAny(b) ? 1 : 0));
  for (const slot of ordered) {
    if (costSlotIsAny(slot)) {
      if (pool.length === 0) return null;
      picked.push(...pool.splice(0, 1));
    } else {
      const idx = pool.findIndex(n => energyMatchesCostSlot(cardMap.get(n)?.Color ?? '', slot));
      if (idx === -1) return null;
      picked.push(...pool.splice(idx, 1));
    }
  }
  return picked;
}

export function canPayOptionalCost(costColors: string[], state: PlayerState, cardMap: Map<string, CardData>): boolean {
  return selectOptionalCostEnergy(costColors, state, cardMap) !== null;
}

export function done(ctx: ExecCtx): ExecResult {
  return { done: true, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, forceEndTurn: ctx.forceEndTurn, lastProcessedCards: ctx.lastProcessedCards, lastProcessedCount: ctx.lastProcessedCount, lastLookTrashedCards: ctx.lastLookTrashedCards, storedTargetCards: ctx.storedTargetCards, autoTargetedCards: ctx.autoTargetedCards, fieldTrashCostCards: ctx.fieldTrashCostCards, trapActivated: ctx.trapActivated, trapSetOwners: ctx.trapSetOwners };
}

export function needsInteraction(ctx: ExecCtx, pending: PendingInteractionDef): ExecResult {
  return { done: false, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, pending, lastProcessedCards: ctx.lastProcessedCards, lastProcessedCount: ctx.lastProcessedCount, lastLookTrashedCards: ctx.lastLookTrashedCards, storedTargetCards: ctx.storedTargetCards, fieldTrashCostCards: ctx.fieldTrashCostCards, trapActivated: ctx.trapActivated, trapSetOwners: ctx.trapSetOwners };
}

export function matchesFilter(
  card: CardData | undefined,
  filter: TargetFilter | undefined,
  effectivePower?: number,  // 実効パワー（未指定時はcard.Powerを使用）
  classOverride?: string,   // card_class_overridesによるクラス上書き
  allZoneClassOverrides?: Record<string, string>, // TREAT_AS_CLASS_ALL_ZONES: 全ゾーン適用
  effectiveLevel?: number,  // 実効レベル（temp_level_mods 適用済み。未指定時は card.Level を使用。LEVEL_MODIFY用）
): boolean {
  if (!card) return false;
  if (!filter) return true;
  // anyOf: 下位フィルタのいずれかに一致（OR）。他キーとは AND。空配列は「候補なし」＝false。
  if (filter.anyOf) {
    if (!filter.anyOf.some(sub => matchesFilter(card, sub, effectivePower, classOverride, allZoneClassOverrides, effectiveLevel))) return false;
  }
  if (filter.cardType) {
    const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
    // レゾナは「シグニの一種」＝場のレゾナは cardType:'シグニ' フィルタの対象に含む
    // （「あなたの＜宇宙＞のシグニ」等がレゾナも選べる。WX25-P2-068/070「それがレゾナの場合、代わりに」）。
    // 逆（cardType:'レゾナ' フィルタ）はレゾナのみ＝非対称。この向きだけ緩める。
    const typeMatch = types.includes(card.Type as (typeof types)[number])
      || (card.Type === 'レゾナ' && types.includes('シグニ' as (typeof types)[number]));
    if (!typeMatch) return false;
  }
  if (filter.excludeResona && card.Type?.includes('レゾナ')) return false;
  if (filter.color) {
    const colors = Array.isArray(filter.color) ? filter.color : [filter.color];
    if (!colors.some(c => card.Color?.includes(c))) return false;
  }
  if (filter.colorExclude) {
    const excl = Array.isArray(filter.colorExclude) ? filter.colorExclude : [filter.colorExclude];
    if (excl.some(c => card.Color?.includes(c))) return false;
  }
  if (filter.level !== undefined) {
    const lv = effectiveLevel ?? parseInt(card.Level ?? '', 10);
    if (typeof filter.level === 'number') {
      if (lv !== filter.level) return false;
    } else {
      if (filter.level.min !== undefined && lv < filter.level.min) return false;
      if (filter.level.max !== undefined && lv > filter.level.max) return false;
    }
  }
  if (filter.levelParity !== undefined) {
    const lv = effectiveLevel ?? parseInt(card.Level ?? '', 10);
    if (isNaN(lv)) return false;
    if (filter.levelParity === 'even' && lv % 2 !== 0) return false;
    if (filter.levelParity === 'odd'  && lv % 2 !== 1) return false;
  }
  // 《クロスアイコン》を持つ（EffectText が《クロスアイコン》で始まる。cardHasCrossIcon と同基準・循環import回避のため inline）
  if (filter.hasCrossIcon && !(card.EffectText?.startsWith('《クロスアイコン》'))) return false;
  // 《ライズアイコン》を持つ（EffectText に【ライズ】を含む）
  if (filter.hasRiseIcon && !(card.EffectText?.includes('【ライズ】'))) return false;
  // 《ライズアイコン》を持たない（hasRiseIcon の否定）
  if (filter.noRiseIcon && (card.EffectText?.includes('【ライズ】'))) return false;
  // 🆕《リコレクトアイコン》を持たない（`noRiseIcon` と同じ印字判定の近似）。
  if (filter.noRecollectIcon && (card.EffectText?.includes('《リコレクトアイコン》'))) return false;
  // 出現条件アイコンを持たない（`WXDi-P07-041-E2`）＝【ライズ】／【ハーモニー】／【出現条件】のいずれも無い。
  if (filter.noDeployConditionIcon && /【(?:ライズ|ハーモニー|出現条件)】/.test(card.EffectText ?? '')) return false;
  if (filter.story) {
    const stories = Array.isArray(filter.story) ? filter.story : [filter.story];
    // card_class_overridesによるクラス上書き、次にTREAT_AS_CLASS_ALL_ZONESオーバーライドを考慮
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (!stories.some(s => effectiveClass.includes(s))) return false;
  }
  if (filter.cardClass) {
    const classes = Array.isArray(filter.cardClass) ? filter.cardClass : [filter.cardClass];
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (!classes.some(c => effectiveClass.includes(c))) return false;
  }
  if (filter.cardClassExclude) {
    const exClasses = Array.isArray(filter.cardClassExclude) ? filter.cardClassExclude : [filter.cardClassExclude];
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (exClasses.some(c => effectiveClass.includes(c))) return false;
  }
  if (filter.cardName && !card.CardName?.includes(filter.cardName)) return false;
  if (filter.cardNames && !filter.cardNames.includes(card.CardName ?? '')) return false;
  if (filter.excludeCardName && card.CardName === filter.excludeCardName) return false;
  if (filter.cardNum && card.CardNum !== filter.cardNum) return false;
  if (filter.powerRange) {
    // CONTINUOUS効果・temp_power_mods適用済みの実効パワーを優先して使用する
    // Power「∞」はInfinity扱い（parseIntだとNaNになり「パワーX以下」フィルタを誤って通過してしまう）
    const basePw = card.Power === '∞' ? Infinity : parseInt(card.Power ?? '', 10);
    const pw = effectivePower !== undefined ? Math.max(0, effectivePower) : basePw;
    if (isNaN(pw)) return false; // Power「-」等の非数値はパワー条件を満たさない
    if (filter.powerRange.min !== undefined && pw < filter.powerRange.min) return false;
    if (filter.powerRange.max !== undefined && pw > filter.powerRange.max) return false;
  }
  if (filter.levelRange) {
    const lv = effectiveLevel ?? parseInt(card.Level ?? '', 10);
    if (filter.levelRange.min !== undefined && lv < filter.levelRange.min) return false;
    if (filter.levelRange.max !== undefined && lv > filter.levelRange.max) return false;
  }
  if (filter.hasGuard !== undefined) {
    // Guard列は '1'/'0' 形式（空文字判定だと全カードがガード持ち扱いになる）
    const hasGuard = card.Guard === '1';
    if (filter.hasGuard !== hasGuard) return false;
  }
  if (filter.noGuard && card.Guard === '1') return false;
  // 「能力を持たないシグニ」（§5d パターンA・14効果）。判定は hasNoAbility と同基準＝
  //   ①解析済み効果が1件でもあれば能力あり ②0件は根拠にならないので原文で判定（CSV は素のシグニを `-` で持つ）。
  // ⚠場のシグニの `abilities_removed`（効果で能力を失った）は state が要るので fieldCandidates 側で加算する。
  if (filter.noAbilities !== undefined) {
    const blankTxt = (s?: string) => { const t = (s ?? '').trim(); return t === '' || t === '-'; };
    const noAb = (card.effects?.length ?? 0) === 0 && blankTxt(card.EffectText) && blankTxt(card.BurstText);
    if (filter.noAbilities !== noAb) return false;
  }
  if (filter.nonColorless) {
    const col = card.Color ?? '';
    // 無色のColorはデータ上「無」（36枚）。空/「無色」表記も保険で除外する。
    if (col === '' || col === '無' || col === '無色') return false;
  }
  if (filter.isDisona && (card.Story ?? '') !== 'Dissona') return false;
  if (filter.levelParity) {
    const lvP = parseInt(card.Level ?? '', 10);
    if (isNaN(lvP)) return false;
    if (filter.levelParity === 'odd' && lvP % 2 !== 1) return false;
    if (filter.levelParity === 'even' && lvP % 2 !== 0) return false;
  }
  if (filter.hasIcon !== undefined) {
    // 《Xアイコン》持ちの判定: カード自身のテキストにキーワード能力があるかの近似
    const txt = card.EffectText ?? '';
    const iconOk =
      filter.hasIcon === 'クロス'   ? txt.includes('【クロス') :
      filter.hasIcon === 'ライズ'   ? txt.includes('【ライズ】') :
      filter.hasIcon === 'トラップ' ? txt.includes('《トラップアイコン》：') :
      filter.hasIcon === 'アクセ'   ? txt.includes('【アクセ】') :
      filter.hasIcon === 'レイヤー' ? txt.includes('【レイヤー】') :
      false;
    if (!iconOk) return false;
  }
  if (filter.hasLifeBurst !== undefined) {
    const hasLB = !!card.BurstText && card.BurstText !== '-';
    if (filter.hasLifeBurst !== hasLB) return false;
  }
  // 🆕限定条件（`Restriction` 列＝「ユヅキ限定」等）にこの語を含むか（`SP15-001-E1`）。
  // ⚠**`restrictionMatchesCenterLrig` は動的形**＝`resolveDynamicFilter` がここへ解決してから来る。
  if (filter.restrictionContains !== undefined) {
    if (!(card.Restriction ?? '').includes(filter.restrictionContains)) return false;
  }
  if (filter.costMax !== undefined || filter.costMin !== undefined) {
    // 使用コストの合計（《色×N》の合計、コインは除く）
    let total = 0;
    for (const m of (card.Cost ?? '').matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
      if (m[1] === 'コイン') continue;
      const n = parseInt(m[2].replace(/[０-９]/g, d => String('０１２３４５６７８９'.indexOf(d))), 10);
      if (!isNaN(n)) total += n;
    }
    if (filter.costMax !== undefined && total > filter.costMax) return false;
    if (filter.costMin !== undefined && total < filter.costMin) return false;
  }
  if (filter.keyword) {
    // 【キーワード能力】を持つカードの判定（フィールド全体の付与効果は考慮しない印字ベース近似）
    if (filter.keyword === 'マルチエナ') {
      // 「【常】：【マルチエナ】」（サーバント等の印字）または自身のみへの CONTINUOUS 付与
      const printed = card.EffectText?.includes('：【マルチエナ】') ?? false;
      const selfGrant = card.effects?.some(e =>
        e.effectType === 'CONTINUOUS' &&
        e.action.type === 'GRANT_KEYWORD' &&
        (e.action as { keyword?: string }).keyword === 'マルチエナ' &&
        (e.action as { target?: { count?: unknown } }).target?.count !== 'ALL'
      ) ?? false;
      if (!printed && !selfGrant) return false;
    } else {
      const txt = card.EffectText ?? '';
      const kws = Array.isArray(filter.keyword) ? filter.keyword : [filter.keyword];
      // いずれかのキーワードを持てばマッチ（OR）。【ランサー（条件）】等の括弧付き変種も含める（公式ルール）。
      // ⚠**綴りズレ（全角Ｓ／半角S）を吸収する**（§6.4 O-28）＝ここは**原文照合**なので
      //   原文の全角【Ｓランサー】が正、`GRANT_KEYWORD.keyword`（state 照合）は半角が正、と**軸ごとに正が逆**。
      //   どちらの綴りで書かれていても当たるように `textHasKeyword` を通す。
      const hasAny = kws.some(kw =>
        textHasKeyword(txt, `【${kw}】`) || textHasKeyword(txt, `《${kw}》`) || textHasKeyword(txt, `【${kw}（`));
      if (!hasAny) return false;
    }
  }
  return true;
}



/**
 * 混合手札捨てコスト（discardGroups）の充足判定:
 * 選択されたカードを全グループの必要枚数に過不足なく割当できるか（バックトラック。コストは数枚規模が前提）。
 */
export function canSatisfyDiscardGroups(
  cards: (CardData | undefined)[],
  groups: { count: number; filter?: TargetFilter }[],
): boolean {
  const slots: (TargetFilter | undefined)[] = [];
  for (const g of groups) for (let i = 0; i < g.count; i++) slots.push(g.filter);
  if (cards.length !== slots.length) return false;
  const used = new Array<boolean>(cards.length).fill(false);
  const assign = (slot: number): boolean => {
    if (slot === slots.length) return true;
    for (let i = 0; i < cards.length; i++) {
      if (used[i] || !matchesFilter(cards[i], slots[slot])) continue;
      used[i] = true;
      if (assign(slot + 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return assign(0);
}

/**
 * インスタンスID（CardNum#N）からCardNumを取り出す。
 * #N がない場合はそのまま返す（後方互換）。
 */
export function getCardNum(id: string): string {
  const h = id.indexOf('#');
  return h > 0 ? id.slice(0, h) : id;
}

/**
 * 原文語彙「能力を持たない（シグニ）」の**唯一の判定**（タスク12(xcv)）。
 *
 * ⚠🔴**CSV は素のシグニ（能力なし）を空文字ではなく `-` で持つ**（実測158枚・空文字は0枚）。
 *   したがって `!!card.EffectText` / `!!card.EffectText?.trim()` 系の判定は**1枚も「能力なし」に当たらない**＝
 *   その分岐は永久に不発になる。判定を増やすときは必ずこの関数を使うこと（`costs.ts` も同じ関数を参照している）。
 *
 * `holder` を渡すと `abilities_removed`（効果でこのターン能力を消されたシグニ）も「能力を持たない」に数える。
 * ⚠CONTINUOUS の `REMOVE_ABILITIES`（「凍結状態のシグニは能力を失う」等）は `effectsMap` と両プレイヤー状態が
 *   要る（`collectRemovedAbilities`）ため**ここでは見ない**＝数え漏らす側＝「能力あり」に倒れる（安全側）。
 *
 * ⚠**「JSON の effects が0件＝能力なし」と読んではいけない**（旧 `LAST_PROCESSED_HAS_NO_ABILITIES` の実装）。
 *   実測すると原文判定159枚に対し effects 判定は211枚で、差の**52枚はすべてマルチエナ持ち**
 *   （原文が「（エナコストを支払う際、このカードは青か緑１つとして支払える）」だけ＝parser が効果を作らない）。
 *   マルチエナは常時能力なので**能力あり**が正＝0件を根拠にすると過剰発火する。
 *   **1件以上あれば能力あり**（＝片側だけが根拠になる非対称な判定）という向きでだけ使う。
 */
export function hasNoAbility(
  cardNum: string,
  cardMap: Map<string, CardData>,
  holder?: { abilities_removed?: string[] },
  effects?: CardEffect[],
): boolean {
  if (holder?.abilities_removed?.includes(cardNum)) return true;
  const card = cardMap.get(getCardNum(cardNum));
  if (!card) return false;
  // ① 解析済み効果が1件でもあれば**明確に能力あり**（呼び出し側が effectsMap を持つならそれを優先）
  const effs = effects ?? card.effects;
  if (effs && effs.length > 0) return false;
  // ② 効果0件は「能力なし」の**根拠にならない**（下のコメント参照）＝原文で判定する
  const blank = (s?: string) => { const t = (s ?? '').trim(); return t === '' || t === '-'; };
  return blank(card.EffectText) && blank(card.BurstText);
}

// カード（instanceId/cardNum）を両プレイヤーの場から探し、所属 state とゾーン index を返す。
// LAST_PROCESSED_MATCHES のゾーン状態フィルタ（hasCharm 等）が直前対象のゾーンを引くのに使う。
function findFieldZoneState(cn: string, ctx: ExecCtx): { state: PlayerState; zoneIdx: number } | null {
  for (const s of [ctx.ownerState, ctx.otherState]) {
    const zoneIdx = s.field.signi.findIndex(stack => stack && stack.length > 0 && stack[stack.length - 1] === cn);
    if (zoneIdx >= 0) return { state: s, zoneIdx };
  }
  return null;
}

// ─── 【ビート】化の共通ヘルパ（MAKE_BEAT 正規化）──────────────────────────
// カードを beat_zone へ加え、beat_became_just に積む（ON_BECOME_BEAT 発火用）。**配置のみ**を担い、
// 元の場所（場/トラッシュ/デッキ等）からの除去は呼び出し側が行う。従来は5箇所で
// `beat_zone:[...], beat_became_just:[...]` をコピペしていたのを集約（payBeatSigniCost/
// payBeatSigniFromTrashCost/INTERNAL_MOVE_TO_BEAT/TRASH_SIGNI_TO_BEAT/ADD_TO_BEAT）。
export function addToBeatZone(state: PlayerState, cards: string[]): PlayerState {
  if (cards.length === 0) return state;
  return {
    ...state,
    field: { ...state.field, beat_zone: [...(state.field.beat_zone ?? []), ...cards] },
    beat_became_just: [...(state.beat_became_just ?? []), ...cards],
  };
}

// ─── 【ビート】コスト支払い（cost.beat_signi）───────────────────────────────
// 「シグニを【ビート】にする」コストを支払う＝対象シグニを場から beat_zone へ移し beat_became_just に積む
//（ON_BECOME_BEAT 発火用）。数値形の対象の意味（このシグニ/他の/任意）は後方互換のため
// 効果元の EffectText から導出する。構造化形の除外条件は JSON payload だけを読む。
// **近似：「他の」シグニはレベルが低い順に自動選択**（プレイヤー選択は未実装）。
// 【ビート】コストの構造を解析（UIのプレイヤー選択／payBeatSigniCost の自動近似の双方が参照）。
// includeSelf=自身も【ビート】に／otherPart=「他の/任意」で選ぶ枚数／eligibleOtherZones=その選択候補ゾーン。
export function beatSigniCostCount(cost: BeatSigniCost | undefined): number {
  return typeof cost === 'number' ? cost : (cost?.count ?? 0);
}

export function analyzeBeatSigniCost(
  state: PlayerState,
  sourceCardNum: string,
  cardMap: Map<string, CardData>,
  cost: BeatSigniCost,
): { includeSelf: boolean; selfZone: number; otherPart: number; eligibleOtherZones: number[] } {
  const srcNum = getCardNum(sourceCardNum);
  const sourceCard = cardMap.get(srcNum);
  const text = sourceCard?.EffectText ?? '';
  const count = beatSigniCostCount(cost);
  const includeSelf = /このシグニ(を|と他のシグニ[０-９0-9]*体)[^。：]*【ビート】に/.test(text);
  const selfOtherM = text.match(/このシグニと他のシグニ([０-９0-9]+)体/);
  // `excludeSelf` はインスタンス1体ではなく「効果元と同じカード名」を除外する。
  // 原文が効果元自身のカード名を《〜》以外と印字する文型なので、同名の別コピーも支払えない。
  const excludedName = typeof cost === 'object' && cost.excludeSelf ? sourceCard?.CardName : undefined;
  const toN = (s: string) => parseInt(s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30)), 10);
  const otherPart = includeSelf ? (selfOtherM ? toN(selfOtherM[1]) : 0) : Math.max(1, count);
  const signi = state.field.signi;
  const selfZone = signi.findIndex(s => getCardNum(s?.at(-1) ?? '') === srcNum && (s?.length ?? 0) > 0);
  const eligibleOtherZones = signi
    .map((s, zi) => ({ zi, cn: s?.at(-1) }))
    .filter(z => z.cn && z.zi !== selfZone
      && (!excludedName || cardMap.get(getCardNum(z.cn))?.CardName !== excludedName))
    .map(z => z.zi);
  return { includeSelf, selfZone, otherPart, eligibleOtherZones };
}

// 返り値 ok=false は対象不足で支払い不能（呼び出し側で発動を無効化する）。
// selectedOtherZones を渡すとプレイヤー選択（ゾーン番号）でそのシグニを beat に。省略時はレベル低い順の自動近似。
export function payBeatSigniCost(
  state: PlayerState,
  sourceCardNum: string,
  cardMap: Map<string, CardData>,
  cost: BeatSigniCost,
  selectedOtherZones?: number[],
): { state: PlayerState; moved: string[]; ok: boolean; log: string } {
  const { includeSelf, selfZone, otherPart, eligibleOtherZones } =
    analyzeBeatSigniCost(state, sourceCardNum, cardMap, cost);

  const signi = [...state.field.signi] as (string[] | null)[];
  const moved: string[] = [];
  const movedZones = new Set<number>();

  // 自身を含む
  if (includeSelf && selfZone >= 0) { moved.push(signi[selfZone]!.at(-1)!); movedZones.add(selfZone); }

  // 「他の」候補＝場のシグニ（自身ゾーンは除外）。プレイヤー選択（selectedOtherZones）があればそれを、
  // なければレベル低い順の自動近似で otherPart 枚選ぶ。
  const otherCandZones = signi
    .map((s, zi) => ({ zi, cn: s?.at(-1) }))
    .filter(z => z.cn && !movedZones.has(z.zi) && eligibleOtherZones.includes(z.zi));
  const chosenZones: number[] = (selectedOtherZones && selectedOtherZones.length > 0)
    ? selectedOtherZones.filter(zi => otherCandZones.some(z => z.zi === zi)).slice(0, otherPart)
    : otherCandZones
        .slice()
        .sort((a, b) => (parseInt(cardMap.get(getCardNum(a.cn!))?.Level ?? '0', 10) || 0) - (parseInt(cardMap.get(getCardNum(b.cn!))?.Level ?? '0', 10) || 0))
        .slice(0, otherPart)
        .map(z => z.zi);
  for (const zi of chosenZones) { moved.push(signi[zi]!.at(-1)!); movedZones.add(zi); }

  // 支払い不能判定：自身を含むのに自身が場にいない／「他の」が必要数に満たない
  const gotOthers = [...movedZones].filter(zi => zi !== selfZone).length;
  if ((includeSelf && selfZone < 0) || gotOthers < otherPart) {
    return { state, moved: [], ok: false, log: '【ビート】コスト支払い不能（対象シグニ不足）' };
  }

  // 場から除去（down/frozen リセット）→ addToBeatZone で beat_zone へ（beat_became_just＝ON_BECOME_BEAT 用）
  const newSigni = signi.map((s, zi) => (movedZones.has(zi) ? null : s));
  const down = [...(state.field.signi_down ?? [false, false, false])];
  const frozen = [...(state.field.signi_frozen ?? [false, false, false])];
  movedZones.forEach(zi => { down[zi] = false; frozen[zi] = false; });
  const removed: PlayerState = {
    ...state,
    field: { ...state.field, signi: newSigni, signi_down: down, signi_frozen: frozen },
  };
  const newState = addToBeatZone(removed, moved);
  const names = moved.map(cn => cardMap.get(getCardNum(cn))?.CardName ?? cn).join('・');
  return { state: newState, moved, ok: true, log: `${names}を【ビート】にする（コスト）` };
}

// cost.beat_signi_from_trash の支払い：トラッシュから filter 一致のシグニ count 枚を beat_zone へ移す
// （WDK14-013「トラッシュから＜悪魔＞のシグニ1枚を【ビート】にする」）。beat_became_just に積み ON_BECOME_BEAT 連鎖を発火。
export function beatSigniFromTrashCandidates(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  filter?: import('../types/effects').TargetFilter,
): number[] {
  const eff = filter ?? { cardType: 'シグニ' };
  return state.trash.flatMap((n, i) => {
    const c = cardMap.get(getCardNum(n));
    return c && c.Type === 'シグニ' && matchesFilter(c, eff) ? [i] : [];
  });
}

// 候補超過時は selectedIndices をUIから受け取る。省略時は従来どおり先頭から自動選択。
export function payBeatSigniFromTrashCost(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  count: number,
  filter?: import('../types/effects').TargetFilter,
  selectedIndices?: number[],
): { state: PlayerState; moved: string[]; ok: boolean; log: string } {
  const matchIdx = beatSigniFromTrashCandidates(state, cardMap, filter);
  if (matchIdx.length < count) {
    return { state, moved: [], ok: false, log: '【ビート】コスト支払い不能（トラッシュにシグニ不足）' };
  }
  const selected = selectedIndices && selectedIndices.length > 0 ? selectedIndices : matchIdx.slice(0, count);
  if (selected.length !== count || selected.some(i => !matchIdx.includes(i)) || new Set(selected).size !== count) {
    return { state, moved: [], ok: false, log: '【ビート】コスト支払い不能（選択不正）' };
  }
  const take = new Set(selected);
  const moved = [...take].map(i => state.trash[i]);
  const newTrash = state.trash.filter((_, i) => !take.has(i));
  const newState = addToBeatZone({ ...state, trash: newTrash }, moved);
  const names = moved.map(cn => cardMap.get(getCardNum(cn))?.CardName ?? cn).join('・');
  return { state: newState, moved, ok: true, log: `${names}をトラッシュから【ビート】にする（コスト）` };
}

// ─── ゲーム外トークン生成ヘルパー ───────────────────────────────
// クラフト/レゾナ/トークンは盤外から生成される。CardName を CardNum に解決し、
// 既存インスタンスと衝突しない新規 instanceId（CardNum#N）を返す。
// cardMap にトークンの CardData が載っている必要がある（BattleScreen の battleCardNums で常時ロード）。
const normTokenName = (s: string) =>
  (s ?? '').replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');

export function resolveTokenBase(cardMap: Map<string, CardData>, cardName: string): string | undefined {
  const want = normTokenName(cardName);
  // クラフト/レゾナ/トークン型を優先解決（同名の通常カードより先に）
  for (const [num, cd] of cardMap) {
    if (normTokenName(cd.CardName ?? '') === want && /クラフト|レゾナ|トークン/.test(cd.Type ?? '')) return getCardNum(num);
  }
  for (const [num, cd] of cardMap) {
    if (normTokenName(cd.CardName ?? '') === want) return getCardNum(num);
  }
  return undefined;
}

export function freshTokenInstanceId(base: string, ...states: PlayerState[]): string {
  let maxIdx = 0;
  const scan = (arr?: (string | null)[] | null) => arr?.forEach(n => {
    if (n && getCardNum(n) === base) { const i = parseInt(n.slice(base.length + 1), 10) || 0; if (i > maxIdx) maxIdx = i; }
  });
  for (const s of states) {
    scan(s.deck); scan(s.hand); scan(s.trash); scan(s.energy); scan(s.lrig_deck); scan(s.lrig_trash);
    s.field.signi.forEach(z => scan(z)); scan(s.field.lrig); scan(s.field.free_zone);
  }
  return `${base}#${maxIdx + 1}`;
}

// CardName から新規トークンインスタンスIDを生成（解決不可なら undefined）
export function createTokenInstanceId(
  cardMap: Map<string, CardData>, cardName: string, ...states: PlayerState[]
): string | undefined {
  const base = resolveTokenBase(cardMap, cardName);
  return base ? freshTokenInstanceId(base, ...states) : undefined;
}

// ─── バリアトークン（フリーゾーンにカードとして設置する） ───────────────
// 【ルリグバリア】【シグニバリア】はトークンカード。数値カウンタではなく
// field.free_zone にトークンカードのインスタンス（CardNum#N）として置く。
export const LRIG_BARRIER_CARD = 'WX24-P1-TK2A';   // 【ルリグバリア】
export const SIGNI_BARRIER_CARD = 'WX26-CP1-TK01'; // 【シグニバリア】

export function countBarrierTokens(freeZone: string[] | undefined, base: string): number {
  return (freeZone ?? []).filter(n => getCardNum(n) === base).length;
}

// フリーゾーンにバリアトークンを count 個追加する（既存の最大連番+1から採番）。
export function addBarrierTokens(freeZone: string[] | undefined, base: string, count = 1): string[] {
  const fz = [...(freeZone ?? [])];
  let maxIdx = 0;
  for (const n of fz) {
    if (getCardNum(n) === base) {
      const i = parseInt(n.slice(base.length + 1), 10) || 0;
      if (i > maxIdx) maxIdx = i;
    }
  }
  for (let k = 0; k < count; k++) fz.push(`${base}#${maxIdx + 1 + k}`);
  return fz;
}

/**
 * `deck_signi_level_override`（「このターン、あなたのデッキにある〈クラス〉のシグニのレベルは N になる」）を
 * 適用した**デッキ内シグニの実効レベル**。該当しなければ `undefined`（＝素の `card.Level` を使う）。
 *
 * 🔴**この関数が入るまで `deck_signi_level_override` は setter しか無い死フィールドだった**（§6.4 O-34(c)）＝
 *   3枚のカードが書き込むのに読み手が1つも無く、デッキ探索/公開のレベルフィルタが一切見ていなかった。
 *   `WXK07-034-E1` は①でレベルを4にしてから②で「レベル4のシグニが2枚めくれるまで公開」する**自己完結の
 *   コンボ**なので、読み手が無いと②が本来の当たり札を素通りする（＝過少）。
 * ⚠**クラス `'*'` は全シグニ**（`WXK07-034-E1`＝クラス指定なし）。それ以外は `CardClass` の部分一致で、
 *   `card_class_overrides`（場のカード向け）はデッキ内カードには効かないので見ない。
 * ⚠適用先は**そのプレイヤーのデッキにあるシグニだけ**＝場・手札・トラッシュのレベル参照には効かない
 *   （原文が「デッキにある」と限定しているため）。呼び出し側は必ず deck 由来のカードで呼ぶこと。
 */
export function deckSigniOverrideLevel(state: PlayerState, card: CardData | undefined): number | undefined {
  const ov = state.deck_signi_level_override;
  if (!ov || !card || card.Type !== 'シグニ') return undefined;
  if (ov.class !== '*' && !(card.CardClass ?? '').includes(ov.class)) return undefined;
  return ov.level;
}

// フリーゾーンからバリアトークンを1個取り除く（先頭の該当インスタンス）。
export function removeOneBarrierToken(freeZone: string[] | undefined, base: string): string[] {
  const fz = [...(freeZone ?? [])];
  const idx = fz.findIndex(n => getCardNum(n) === base);
  if (idx >= 0) fz.splice(idx, 1);
  return fz;
}

// owner:'any'（修飾語なし「シグニ1体を対象とし」＝どちらのプレイヤーのシグニでもよい）を含む
// 場シグニの候補集合とスコープを一括で解決する（タスク12(lii)）。
//
// 'any' は engine の多くの経路で `ownerState(owner)` に素通しされ、**片側だけ**（多くは相手側）に
// 潰れていた＝原文が「どちらでもよい」と言っている対象が半分しか選べない。候補を両フィールドから
// 集めて scope='both_field' を返す。適用側は選ばれたカードがどちらの場にあるかで所属を決める
// （execPowerModify が先行実装していた規約を共通化したもの）。
//
// 🔴**`filter.excludeSelf`（「（あなたの）**他の**シグニ」）はここで落とす**（§5.2 Sheet3 バッチ6・2026-08-29）。
//   `matchesFilter` は `card` 単体しか見ないので `sourceCardNum` を知らず、`fieldCandidates` にも渡っていない。
//   そのため各 executor が**自前で1行書く**規約になっていたが、実際に書いていたのは
//   `execBanish` / `execPowerModify` / `execGrantKeyword` / `execGrantProtection` だけで、
//   **`UP` 5・`DOWN` 2・`BOUNCE` 2・`FREEZE` 1・`POWER_SET` 1（live 実測）は黙って自分自身も選べていた**。
//   ⇒ **ctx を持つこの合流点1箇所に集約する**（executor 側の既存1行は冪等なのでそのまま残る）。
//   ⚠**ゾーン外の候補（トラッシュ／エナ／手札）はここを通らない**＝`execTrash` 等が別途扱う。
export function fieldCandidatesByOwner(
  owner: Owner,
  filter: TargetFilter | undefined,
  ctx: ExecCtx,
): { cands: string[]; scope: TargetScope; isAny: boolean } {
  const dropSelf = (cands: string[]): string[] =>
    filter?.excludeSelf && ctx.sourceCardNum ? cands.filter(n => n !== ctx.sourceCardNum) : cands;
  if (owner !== 'any') {
    const state = ownerState(owner, ctx);
    return {
      cands: dropSelf(fieldCandidates(state, filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors)),
      scope: owner === 'self' ? 'self_field' : 'opp_field',
      isAny: false,
    };
  }
  const self = fieldCandidates(ctx.ownerState, filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const opp = fieldCandidates(ctx.otherState, filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  return { cands: dropSelf([...self, ...opp]), scope: 'both_field', isAny: true };
}

// owner:'any' で選ばれた1枚が「どちらの場のシグニか」を判定する。どちらにも無ければ opponent 扱い
// （従来の素通し挙動と同じ側へ倒す＝呼び出し側の zoneIdx 探索が空振りして no-op になる）。
export function sideOfFieldCard(cardNum: string, ctx: ExecCtx): Owner {
  return ctx.ownerState.field.signi.some(st => st?.at(-1) === cardNum) ? 'self' : 'opponent';
}

export function fieldCandidates(
  state: PlayerState,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  effectivePowers?: Map<string, number>,
  allColorSigniNums?: Set<string>,
  fieldSigniExtraColors?: Map<string, string[]>,
): string[] {
  const baseCands = state.field.signi.flatMap((stack, zoneIdx) => {
    if (!stack || stack.length === 0) return [];
    const cardNum = stack[stack.length - 1];
    // 「能力を持たない」＝場では **abilities_removed（効果で能力を失った）も含む**（§5d パターンA）。
    // matchesFilter は card 単体しか見られないので、state を持つここで hasNoAbility に委ねて判定し、
    // 下の matchesFilter へは noAbilities を**外した filter** を渡す（二重判定で食い違わせない）。
    if (filter?.noAbilities !== undefined) {
      if (filter.noAbilities !== hasNoAbility(cardNum, cardMap, state)) return [];
    }
    // 対象の「【K】を持つ」は印字だけでなく、解決済みの一時付与ストアも現在の所持として扱う。
    const wantedKeywords = filter?.keyword
      ? (Array.isArray(filter.keyword) ? filter.keyword : [filter.keyword])
      : [];
    const dynamicKeywords = [
      ...(state.keyword_grants?.[cardNum] ?? []),
      ...(state.keyword_grants_until_opp_turn?.[cardNum] ?? []),
    ];
    const dynamicKeywordMatch = wantedKeywords.length > 0 && wantedKeywords.some(keyword => dynamicKeywords.includes(keyword));
    const filterForCard = filter?.noAbilities !== undefined || dynamicKeywordMatch
      ? { ...filter, ...(filter?.noAbilities !== undefined ? { noAbilities: undefined } : {}),
          ...(dynamicKeywordMatch ? { keyword: undefined } : {}) }
      : filter;
    // ゾーン状態に依存するフィルター（infected / hasAcce / hasCharm）
    if (filter?.infected !== undefined) {
      const infected = (state.field.signi_virus?.[zoneIdx] ?? 0) > 0;
      if (filter.infected !== infected) return [];
    }
    if (filter?.hasAcce !== undefined) {
      const acceExists = hasAcceAt(state.field, zoneIdx);
      if (filter.hasAcce !== acceExists) return [];
    }
    if (filter?.hasCharm !== undefined) {
      const hasCharm = (state.field.signi_charms?.[zoneIdx] ?? null) !== null;
      if (filter.hasCharm !== hasCharm) return [];
    }
    if (filter?.hasSoul !== undefined) {
      const soulExists = (state.field.signi_soul?.[zoneIdx] ?? null) !== null;
      if (filter.hasSoul !== soulExists) return [];
    }
    // 🆕下にカードがある（2026-08-31 §5.2）＝スタックの高さで判定。⚠charm/acce/soul は別配列。
    if (filter?.hasUnderCards !== undefined) {
      const underExists = (state.field.signi?.[zoneIdx]?.length ?? 0) > 1;
      if (filter.hasUnderCards !== underExists) return [];
    }
    // 🆕「カードが付いているか下にカードがある」＝charm/acce/soul/下カードの OR（2026-08-31 §5.2）。
    if (filter?.hasAttachedOrUnder !== undefined) {
      const attachedOrUnder = (state.field.signi_charms?.[zoneIdx] ?? null) !== null
        || hasAcceAt(state.field, zoneIdx)
        || (state.field.signi_soul?.[zoneIdx] ?? null) !== null
        || (state.field.signi?.[zoneIdx]?.length ?? 0) > 1;
      if (filter.hasAttachedOrUnder !== attachedOrUnder) return [];
    }
    if (filter?.isDown !== undefined) {
      const isDown = state.field.signi_down?.[zoneIdx] ?? false;
      if (filter.isDown !== isDown) return [];
    }
    if (filter?.isUp !== undefined) {
      const isDown = state.field.signi_down?.[zoneIdx] ?? false;
      if (filter.isUp !== !isDown) return [];
    }
    if (filter?.isFrozen !== undefined) {
      const isFrozen = state.field.signi_frozen?.[zoneIdx] ?? false;
      if (filter.isFrozen !== isFrozen) return [];
    }
    if (filter?.isPuppet !== undefined) {
      const isPuppet = (state.field.puppet_signi ?? []).includes(cardNum);
      if (filter.isPuppet !== isPuppet) return [];
    }
    if (filter?.isDrive !== undefined) {
      const isDrive = (state.lrig_riding_signi ?? []).includes(cardNum);
      if (filter.isDrive !== isDrive) return [];
    }
    // 「このターンにアタックしたシグニ」（§6.4 O-3・`WDK06-R09-E1`）。
    // ⚠`attacked_signi_ids` は**アタックした側の state** に積まれる＝候補を作る `state` と同じ側なので
    //   ここで判定できる（`matchesFilter` は card 単体しか見られないので state を持つこの層で扱う）。
    if (filter?.attackedThisTurn !== undefined) {
      const attacked = (state.attacked_signi_ids ?? []).includes(cardNum);
      if (filter.attackedThisTurn !== attacked) return [];
    }
    // 🆕「**アタックしている**シグニ」＝いま宣言中のアタッカー1体（`pending_signi_battle` のゾーン）。
    if (filter?.isAttacking !== undefined) {
      const attacking = state.pending_signi_battle?.zoneIndex === zoneIdx;
      if (filter.isAttacking !== attacking) return [];
    }
    if (filter?.crossState !== undefined) {
      const isCross = state.field.cross_state?.[zoneIdx] ?? false;
      if (filter.crossState !== isCross) return [];
    }
    if (filter?.isArmored !== undefined) {
      const isArmored = state.field.signi_armor?.[zoneIdx] ?? false;
      if (filter.isArmored !== isArmored) return [];
    }
    if (filter?.inGateZone !== undefined) {
      const inGate = (state.own_gate_zones ?? []).includes(zoneIdx);
      if (filter.inGateZone !== inGate) return [];
    }
    if (filter?.centerZoneOnly !== undefined) {
      if (filter.centerZoneOnly !== (zoneIdx === 1)) return [];
    }
    // 左／右のシグニゾーン限定（所有者から見た表示順＝left=0 / right=2）
    if (filter?.zoneSide !== undefined) {
      if (zoneIdx !== (filter.zoneSide === 'left' ? 0 : 2)) return [];
    }
    // 表記パワー比較（per-candidate）: 実効パワー vs 自身の表記パワー。低い=低下中／高い=増強中。
    // 表記が数値でない（∞等）シグニは比較不能＝対象外。
    if (filter?.powerLtPrinted || filter?.powerGtPrinted || filter?.powerDiffersFromPrinted) {
      const printed = parseInt(cardMap.get(cardNum)?.Power ?? '', 10);
      if (Number.isNaN(printed)) return [];
      const eff = effectivePowers?.get(cardNum) ?? printed;
      if (filter.powerLtPrinted && !(eff < printed)) return [];
      if (filter.powerGtPrinted && !(eff > printed)) return [];
      // 🆕「表記されているパワーと**異なる**パワーの」＝増強中でも低下中でもよい（上2本の OR）。
      if (filter.powerDiffersFromPrinted && eff === printed) return [];
    }
    // card_class_overridesによるクラス上書きを考慮してフィルター適用
    const classOverride = state.card_class_overrides?.[cardNum];
    // ACCE_SIGNI_ALL_COLOR / ALL_COLOR / ALL_ZONE_BLACK: 全色を持つシグニは色フィルターをバイパス
    const isAllColor = state.story_overrides?.[cardNum] === 'ALL_COLOR' || allColorSigniNums?.has(cardNum);
    const extraColors = fieldSigniExtraColors?.get(cardNum);
    // 実効レベル（temp_level_mods 適用済み）＝LEVEL_MODIFY 効果。mod が無ければ undefined（従来挙動）。
    const lvMods = state.temp_level_mods;
    const effLevel = lvMods && lvMods.length
      ? Math.max(0, parseInt(cardMap.get(cardNum)?.Level ?? '', 10) + lvMods.filter(m => m.cardNum === cardNum).reduce((s, m) => s + m.delta, 0))
      : undefined;
    if (!isAllColor && !matchesFilter(cardMap.get(cardNum), filterForCard, effectivePowers?.get(cardNum), classOverride, undefined, effLevel)) {
      // 追加色がある場合: 色フィルターだけ追加色でも再チェック
      if (!extraColors || !filter?.color) return [];
      const filterColors = Array.isArray(filter.color) ? filter.color : [filter.color];
      if (!filterColors.some(c => extraColors.includes(c))) return [];
      // 色フィルター以外のフィルターを通常チェック
      const filterNoColor = { ...filterForCard, color: undefined };
      if (!matchesFilter(cardMap.get(cardNum), filterNoColor, effectivePowers?.get(cardNum), classOverride, undefined, effLevel)) return [];
    }
    if (isAllColor) {
      // 色フィルター以外のフィルターは通常通りチェック
      const filterNoColor = filter ? { ...filter, color: undefined } : undefined;
      if (!matchesFilter(cardMap.get(cardNum), filterNoColor, effectivePowers?.get(cardNum), classOverride, undefined, effLevel)) return [];
    }
    return [cardNum];
  });
  // superlative: 候補集合のうち最大/最小のパワー/レベルを持つもののみ残す（同値は全て＝「すべて」対応）。
  //   パワーは実効値（effectivePowers）優先→表記値。レベルは temp_level_mods 適用済み実効レベル。
  if (!filter?.superlative || baseCands.length <= 1) return baseCands;
  const { key, dir } = filter.superlative;
  const metric = (num: string): number => {
    if (key === 'power') {
      const ep = effectivePowers?.get(num);
      if (ep !== undefined) return ep;
      const p = parseInt(cardMap.get(num)?.Power ?? '', 10);
      return Number.isNaN(p) ? 0 : p;
    }
    const base = parseInt(cardMap.get(num)?.Level ?? '', 10);
    const lvBase = Number.isNaN(base) ? 0 : base;
    const mods = (state.temp_level_mods ?? []).filter(m => m.cardNum === num).reduce((s, m) => s + m.delta, 0);
    return Math.max(0, lvBase + mods);
  };
  const vals = baseCands.map(metric);
  const ext = dir === 'max' ? Math.max(...vals) : Math.min(...vals);
  return baseCands.filter((_, i) => vals[i] === ext);
}

export function handCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.hand.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

/**
 * LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）＝「（次の）対戦相手のメインフェイズとアタックフェイズの間、
 * 対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない」。
 *
 * 判定は2条件の AND：
 *  ① 動かそうとしているのが**効果のコントローラー自身**のトラッシュであること（`owner === 'self'`。
 *     ctx.ownerState がコントローラーという engine 共通規約。相手の効果でそのトラッシュを動かすのは
 *     原文が禁じていないので通す＝`STEAL_OPP_TRASH_PUPPET` 等は素通り）。
 *  ② そのコントローラーにロックが立っていて、いまがメイン／アタックフェイズであること。
 *     `currentPhase` 不明時は**ロックしない**（permissive＝機構導入で既存挙動を変えない側に倒す）。
 *
 * ⚠**この述語がロックの唯一の真実**。トラッシュを発生源にする経路（`trashCandidates` の7地点＋
 *   `PLACE_UNDER_SIGNI`／`ATTACH_CHARM`／トラッシュ直操作 STUB 5種）はすべてここを通すこと。
 *   母集団は `scripts/` の走査で「自分のトラッシュからカードが出る効果 330件」→ 本述語適用で 0件を実測。
 */
const TRASH_LOCK_PHASES = ['MAIN', 'ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'];
export function isOwnTrashMoveLocked(owner: Owner, ctx: ExecCtx): boolean {
  if (owner !== 'self') return false;
  if (!ctx.ownerState?.lock_trash_move_this_turn) return false;
  return TRASH_LOCK_PHASES.includes(ctx.currentPhase ?? '');
}

/**
 * `TRASH_ABILITY_LOSS_AND_IMMUNITY`（§6.4 O-10・続き514・`WX12-023`）＝
 * 「【常】：対戦相手のトラッシュとルリグトラッシュにあるカードは能力を失い、効果を受けない。」
 *
 * `holderState` の**トラッシュが免疫を受けているか**＝`declarerState`（対面）の場に宣言があるか。
 * 🔑**「効果を受けない」は主語を問わない**＝原文は「効果を受けない」としか書いていないので、
 *   宣言者の効果でも持ち主自身の効果でも、そのトラッシュのカードは対象にできない（ロック札）。
 * ⚠`effectsMap` は engine の一部経路でしか代入されない（続き296 の罠）＝
 *   `cardMap.get(...).effects`（実アプリの live JSON）へフォールバックする。
 */
export function isTrashImmuneByOpponent(
  declarerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap?: Map<string, CardEffect[]>,
): boolean {
  const sources = [
    ...declarerState.field.signi.flatMap(st => (st?.at(-1) ? [st.at(-1)!] : [])),
    ...(declarerState.field.lrig.at(-1) ? [declarerState.field.lrig.at(-1)!] : []),
  ];
  for (const num of sources) {
    const base = getCardNum(num);
    const effs = effectsMap?.get(num) ?? effectsMap?.get(base) ?? cardMap.get(base)?.effects ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as { type?: string; id?: string };
      if (act.type === 'STUB' && act.id === 'TRASH_ABILITY_LOSS_AND_IMMUNITY') return true;
    }
  }
  return false;
}

export function trashCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  // 🆕`discardedFromHandThisTurn`＝「**このターンに捨てた**シグニ」（2026-08-31 続き759・`WXK05-016-E2`）。
  // ⚠**カード属性ではなくインスタンス履歴**なので `matchesFilter` では表せない＝トラッシュ候補の
  //   唯一の funnel であるここで絞る（executor ごとに1行書くと必ず片側だけ穴が空く）。
  const historyGate = filter?.discardedFromHandThisTurn
    ? new Set(state.turn_hand_discarded_cards ?? [])
    : undefined;
  return state.trash.filter(n =>
    (!historyGate || historyGate.has(n))
    && matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

/**
 * トラッシュを発生源にする候補列。`trashCandidates` にロック判定（`isOwnTrashMoveLocked`）を被せたもの。
 * ロック中は候補0＝アクションは「対象がない」で自然に no-op する（盤面を巻き戻す必要がない）。
 */
export function movableTrashCandidates(
  owner: Owner, state: PlayerState, filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>, ctx: ExecCtx, allZoneClassOverrides?: Record<string, string>,
): string[] {
  if (isOwnTrashMoveLocked(owner, ctx)) return [];
  // §6.4 O-10（続き514）＝「対戦相手のトラッシュ…にあるカードは…効果を受けない」（`WX12-023`）。
  // 🔑**宣言者は `owner` の対面**＝`owner==='self'` なら相手の場、`'opponent'` なら効果主の場を見る。
  // ⚠ロックと同じく候補0で表す＝アクションは「対象がない」で自然に no-op する（盤面を巻き戻さない）。
  const declarerState = owner === 'self' ? ctx.otherState : ctx.ownerState;
  if (declarerState && isTrashImmuneByOpponent(declarerState, cardMap, ctx.effectsMap)) return [];
  return trashCandidates(state, filter, cardMap, allZoneClassOverrides);
}

export function energyCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.energy.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

/**
 * 引用付与の内側にある「〜であるかぎり／〜の間、【KW】を得る」の**ゲート条件**を読み、
 * **条件つきの** CONTINUOUS `GRANT_KEYWORD` を1本組み立てて返す（Opusタスク12(cxiv)＋§6.4 O-25(d)）。
 *
 * なぜ必要か＝`keyword_grants`（`Record<cardNum, string[]>`）は**条件を持てない**ので、
 * 引用付与の STUB ハンドラ（`GRANT_QUOTED_ABILITY` / `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY`）が
 * 原文からキーワードだけ抜いてそこへ入れると、**ゲート条件が丸ごと落ちて常時発動**になる（＝過剰実行）。
 * `granted_effects` は `BattleScreen` の augmented effectsMap 経由で **付与先シグニ自身を発生源として**
 * CONTINUOUS 収集に載る（`collectContinuousGrantedKeywords` が `activeCondition` を毎回評価し、
 * その結果が `getSigniAttackKeywordState` の `continuousKeywords` としてアタック解決まで届く）ので、
 * 条件つき付与はそちらへ回す。
 *
 * 🆕**2026-08-17（§6.4 O-25(d)）＝読めるゲートを1形から5形へ広げた**。従来は「正面のシグニのパワーが」
 * 1形しか読めず、他の綴りは `null` を返して**無条件 `keyword_grants` へフォールバック**していた＝実測で
 * `WXDi-P12-078-E2`（正面がレベル1）／`WXDi-P13-079-E1`（正面がレベル2以下）／`WXDi-P13-069-E2`
 * （正面が凍結かつパワー5000以下）／`WX24-P1-042-E2`（自分の手札2枚以下）／`WXDi-P06-032-E2`・
 * `WXDi-P13-044-E2`（対戦相手のターンの間）の**6効果が常時【ランサー】【アサシン】【ダブルクラッシュ】
 * 【シャドウ】を持っていた**。
 *
 * ⚠**パワーは `FRONT_SIGNI_POWER`（実効パワー）／レベル・状態は `FRONT_SIGNI{filter}`（表記＋盤面状態）**と
 *   評価器が別なので、「凍結状態でパワーがN以下」は **`AND` で2本に割る**（`FRONT_SIGNI{powerRange}` に
 *   まとめると `matchesFilter` が**表記パワー**で判定してバフ／デバフを無視する）。
 * ⚠`FRONT_SIGNI` 系は**正面が空なら不成立**（`checkActiveCondition`）＝原文どおり。
 * ⚠条件節が見つからなければ `null`＝呼び出し元は従来の無条件 `keyword_grants` を続ける（退化させない）。
 */
export function buildGatedKeywordGrant(
  quotedText: string,
  keyword: string,
  duration: 'UNTIL_END_OF_TURN' | 'PERMANENT' = 'UNTIL_END_OF_TURN',
): CardEffect | null {
  const hw = quotedText.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const mk = (tag: string, activeCondition: ActiveCondition): CardEffect => ({
    effectId: `granted-gated-${keyword}-${tag}`,
    effectType: 'CONTINUOUS',
    duration,
    mandatory: true,
    activeCondition,
    // count:1 かつ filter:thisCardOnly ＝ collectContinuousGrantedKeywords は発生源自身にだけ付ける。
    // ここでの「発生源」は granted_effects のキー＝**付与された側のシグニ**なので原文どおり。
    action: {
      type: 'GRANT_KEYWORD',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      keyword,
      duration,
    },
  } as CardEffect);

  // ①「正面のシグニが、凍結状態でパワーがN以下であるかぎり」（`WXDi-P13-069-E2`）。
  //   ⚠**②より先に置く**＝②の regex は「パワーが…」だけを見るので、凍結の条件を落として先取りしてしまう。
  {
    const m = hw.match(/正面のシグニが[、,]?\s*凍結状態でパワーが([\d,]+)(以上|以下)であるかぎり/);
    if (m) {
      return mk(`frontFrozenPower-${m[1]}-${m[2]}`, {
        type: 'AND',
        conditions: [
          { type: 'FRONT_SIGNI', filter: { cardType: 'シグニ', isFrozen: true } },
          { type: 'FRONT_SIGNI_POWER', operator: m[2] === '以上' ? 'gte' : 'lte', value: parseInt(m[1].replace(/,/g, ''), 10) },
        ],
      } as ActiveCondition);
    }
  }
  // ②「正面のシグニのパワーがN{以上|以下}であるかぎり」（従来からの1形）。
  {
    const m = hw.match(/正面のシグニのパワーが([\d,]+)(以上|以下)であるかぎり/);
    if (m) {
      return mk(`frontPower-${m[1]}-${m[2]}`, {
        type: 'FRONT_SIGNI_POWER',
        operator: m[2] === '以上' ? 'gte' : 'lte',
        value: parseInt(m[1].replace(/,/g, ''), 10),
      });
    }
  }
  // ③「正面のシグニがレベルN{以上|以下}であるかぎり」（`WXDi-P12-078-E2`＝丁度／`WXDi-P13-079-E1`＝以下）。
  //   ⚠比較語が無ければ**丁度N**（原文「レベル１であるかぎり」）＝`{max:N}` に倒すと過剰になる。
  {
    const m = hw.match(/正面のシグニがレベル(\d+)(以上|以下)?であるかぎり/);
    if (m) {
      const level = m[2] === '以上' ? { min: parseInt(m[1], 10) }
        : m[2] === '以下' ? { max: parseInt(m[1], 10) }
        : parseInt(m[1], 10);
      return mk(`frontLevel-${m[1]}-${m[2] ?? 'eq'}`, {
        type: 'FRONT_SIGNI', filter: { cardType: 'シグニ', level },
      });
    }
  }
  // ④「あなたの手札がN枚{以上|以下}であるかぎり」（`WX24-P1-042-E2`）。
  {
    const m = hw.match(/あなたの手札が(\d+)枚(以上|以下)であるかぎり/);
    if (m) {
      return mk(`selfHand-${m[1]}-${m[2]}`, {
        type: 'COUNT_THRESHOLD', location: 'hand', owner: 'self',
        operator: m[2] === '以上' ? 'gte' : 'lte', value: parseInt(m[1], 10),
      });
    }
  }
  // ⑤「{対戦相手|あなた}のターンの間、〜を得る」（`WXDi-P06-032-E2`／`WXDi-P13-044-E2`）。
  //   ⚠「かぎり」ではなく期間句だが、**得ている間ずっと評価される条件**という点では同じ形。
  {
    const m = hw.match(/(対戦相手|あなた)のターンの間/);
    if (m) return mk(`turnOwner-${m[1]}`, { type: 'TURN_OWNER', owner: m[1] === 'あなた' ? 'self' : 'opponent' });
  }
  return null;
}

export function evalCondition(cond: Condition, ctx: ExecCtx): boolean {
  const s = ctx.ownerState;
  const o = ctx.otherState;
  function st(owner: Owner) { return owner === 'self' ? s : o; }
  function cmp(a: number, op: string, b: number): boolean {
    switch (op) {
      case 'gte': return a >= b; case 'lte': return a <= b;
      case 'gt':  return a > b;  case 'lt':  return a < b;
      case 'eq':  return a === b; case 'neq': return a !== b;
      default: return true;
    }
  }
  switch (cond.type) {
    case 'CENTER_LRIG_NOT_GROWN_THIS_TURN':
      return !(st(cond.owner).actions_done ?? []).includes('GROW');
    case 'FIELD_LRIGS_SHARE_COLOR': {
      const f = st(cond.owner).field;
      const nums = [f.lrig.at(-1), f.assist_lrig_l?.at(-1), f.assist_lrig_r?.at(-1)].filter((n): n is string => !!n);
      const sets = nums.map(n => new Set(splitColors(ctx.cardMap.get(getCardNum(n))?.Color)));
      const choose = (start: number, picked: Set<string>[]): boolean => {
        if (picked.length === cond.minCount) {
          const common = new Set(picked[0] ?? []);
          for (const colors of picked.slice(1)) for (const c of common) if (!colors.has(c)) common.delete(c);
          return common.size > 0;
        }
        for (let i = start; i < sets.length; i++) if (choose(i + 1, [...picked, sets[i]])) return true;
        return false;
      };
      return cond.minCount > 0 && sets.length >= cond.minCount && choose(0, []);
    }
    case 'FIELD_LRIGS_HAVE_COLORS': {
      const f = st(cond.owner).field;
      const nums = [f.lrig.at(-1), f.assist_lrig_l?.at(-1), f.assist_lrig_r?.at(-1)]
        .filter((n): n is string => !!n);
      return cond.colors.every(color =>
        nums.some(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color).includes(color)));
    }
    case 'FIELD_LRIG_COLOR_COUNT': {
      const f = st(cond.owner).field;
      const nums = [f.lrig.at(-1), f.assist_lrig_l?.at(-1), f.assist_lrig_r?.at(-1)]
        .filter((n): n is string => !!n);
      if (nums.length < (cond.minLrigs ?? 0)) return false;
      const colors = new Set(nums.flatMap(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color)));
      return cmp(colors.size, cond.operator, cond.value);
    }
    case 'FIELD_COUNT': {
      const fieldStates = cond.owner === 'any' ? [s, o] : [st(cond.owner)];
      const filter = { ...(cond.cardType ? { cardType: cond.cardType } : {}), ...(cond.filter ?? {}) };
      const count = fieldStates.reduce((total, fst) => total + fst.field.signi.reduce((n, stack, zoneIdx) => {
        const top = stack?.at(-1);
        if (!top) return n;
        if (filter.isDown !== undefined && (fst.field.signi_down?.[zoneIdx] ?? false) !== filter.isDown) return n;
        return n + (matchesFilter(ctx.cardMap.get(getCardNum(top)), filter, ctx.effectivePowers?.get(top)) ? 1 : 0);
      }, 0), 0);
      return cmp(count, cond.operator, resolveNum(cond.value));
    }
    case 'DECK_COUNT':
      return cmp(st(cond.owner).deck.length, cond.operator, resolveNum(cond.value));
    case 'DECK_COUNT_FILTER': {
      const matched = st(cond.owner).deck.filter(cn =>
        matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter));
      return cmp(matched.length, cond.operator, resolveNum(cond.value));
    }
    case 'HAND_COUNT':
      if (cond.owner === 'any') {
        return cmp(s.hand.length, cond.operator, resolveNum(cond.value)) ||
          cmp(o.hand.length, cond.operator, resolveNum(cond.value));
      }
      return cmp(st(cond.owner).hand.length, cond.operator, resolveNum(cond.value));
    case 'HAND_COUNT_FILTER': {
      const matched = handCandidates(st(cond.owner), cond.filter, ctx.cardMap);
      const n = cond.distinctName
        ? new Set(matched.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn)).size
        : matched.length;
      return cmp(n, cond.operator, resolveNum(cond.value));
    }
    case 'HAND_DIFF':
      return cmp(s.hand.length - o.hand.length, cond.operator, cond.value);
    case 'LIFE_COUNT':
      return cmp(st(cond.owner).life_cloth.length, cond.operator, resolveNum(cond.value));
    case 'TURN_OWNER':
      return ctx.isOwnerTurn == null || (cond.owner === 'self' ? ctx.isOwnerTurn : !ctx.isOwnerTurn);
    case 'LIFE_CRASHED_THIS_TURN':
      return cmp(st(cond.owner).life_crashed_this_turn ?? 0, cond.operator, resolveNum(cond.value));
    case 'LIFE_CRASHED_LAST_TURN':
      return cmp(st(cond.owner).life_crashed_last_turn ?? 0, cond.operator, resolveNum(cond.value));
    case 'ENERGY_COUNT':
      return cmp(st(cond.owner).energy.length, cond.operator, resolveNum(cond.value));
    case 'ENERGY_COUNT_FILTER': {
      // 「〈そのプレイヤーの〉センタールリグと共通する色を(持つ|持たない)カード」＝**条件の owner のルリグ基準**で
      // 解決する（§5d パターンA・続き375）。`matchesFilter` はこの2キーを知らないので、解決せずに渡すと
      // **黙って無視され「エナに何かあるか」だけの過剰な条件**になる（`WD15-018-E1`）。
      // 解決先は `resolveDynamicFilter`（effectExecutor）と同じ＝色一致→`color` ／色不一致→`colorExclude`。
      let condFilter = cond.filter;
      if (condFilter?.colorMatchesLrig || condFilter?.colorNotMatchesLrig) {
        const lrigTop = st(cond.owner).field.lrig.at(-1);
        const lrigColor = lrigTop ? ctx.cardMap.get(getCardNum(lrigTop))?.Color : undefined;
        const { colorMatchesLrig: _m, colorNotMatchesLrig: _n, ...rest } = condFilter;
        condFilter = !lrigColor ? rest
          : condFilter.colorMatchesLrig ? { ...rest, color: lrigColor }
          : { ...rest, colorExclude: lrigColor };
      }
      const matched = energyCandidates(st(cond.owner), condFilter, ctx.cardMap, ctx.treatAsClassAllZones);
      const n = cond.distinctClasses
        ? new Set(matched.flatMap(cn => splitClasses(ctx.cardMap.get(cn)?.CardClass)).filter(c => !(cond.excludeClasses ?? []).includes(c))).size
        : cond.distinctColor
        ? new Set(matched.flatMap(cn => splitColors(ctx.cardMap.get(cn)?.Color))).size
        : cond.distinctName
        ? new Set(matched.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn)).size
        : matched.length;
      return cmp(n, cond.operator, resolveNum(cond.value));
    }
    case 'ENERGY_EACH_LEVEL_FILTER_GTE': {
      const matched = energyCandidates(st(cond.owner), cond.filter, ctx.cardMap, ctx.treatAsClassAllZones);
      return cond.levels.every(level =>
        matched.filter(cn => Number(ctx.cardMap.get(getCardNum(cn))?.Level) === level).length >= cond.minEach);
    }
    case 'LAST_PROCESSED_HAS_NO_ABILITIES': {
      const last = ctx.lastProcessedCards?.[0];
      if (!last) return false;
      // ⚠🔴**旧実装は「JSON の effects が0件なら能力なし」**としており、**マルチエナ持ちシグニ52枚**
      //   （原文が「（エナコストを支払う際、このカードは青か緑１つとして支払える）」だけのカード）を
      //   「能力を持たない」と誤判定していた＝マルチエナは常時能力なので**能力あり**が正。
      //   判定は `hasNoAbility` 1本に統一する（タスク12(xcv)）。
      // ⚠🔴**`abilities_removed` は「能力を消されたカードの持ち主」側の PlayerState に載る**
      //   （`applyAbilitiesRemoval` は target owner の state へ書く）。この条件の対象は
      //   **対戦相手のシグニ**なので、`ownerState('self')` 固定で引くと相手側の能力喪失を
      //   一度も見られない＝「代わりにトラッシュ」枝が永久に外れる。`LAST_PROCESSED_MATCHES`
      //   の `noAbilities` と同じく **カードが実際に居る場から holder を引く**（§6.4 O-6）。
      const holder = findFieldZoneState(last, ctx)?.state ?? ownerState('self', ctx);
      return hasNoAbility(last, ctx.cardMap, holder, ctx.effectsMap?.get(getCardNum(last)));
    }
    case 'ENERGY_HAS_COLOR': {
      const ez = st(cond.owner).energy;
      return cond.colors.every(color => ez.some(n => ctx.cardMap.get(n)?.Color?.includes(color)));
    }
    case 'CARDS_DRAWN_BY_EFFECT':
      return cmp(st(cond.owner).cards_drawn_by_effect_this_turn ?? 0, cond.operator, cond.value);
    // このターンに支払った《コイン》の累計（支払いのみ・獲得は数えない）。Opusタスク12(cxvi)
    case 'COINS_PAID_THIS_TURN':
      return cmp(st(cond.owner).coins_paid_this_turn ?? 0, cond.operator, cond.value);
    case 'SIGNI_DOWNED_COUNT_THIS_TURN': {
      // 台帳（`signi_downed_this_turn`）を filter で絞って数える。記録は `recordSigniDownedThisTurn` の1本。
      const downed = st(cond.owner).signi_downed_this_turn ?? [];
      const n = cond.filter
        ? downed.filter(num => matchesFilter(ctx.cardMap.get(getCardNum(num)), cond.filter!)).length
        : downed.length;
      return cmp(n, cond.operator, cond.value);
    }
    case 'OPP_SIGNI_BANISHED_COUNT_THIS_TURN': {
      // §5.3 O-121: 台帳（`opp_signi_banished_this_turn`）を「バニッシュした側のカード」で絞って数える。
      // ⚠`filter` は**被バニッシュ側ではなくバニッシュを行った側**に当てる（原文の主語がそちら）。
      const led = st(cond.owner).opp_signi_banished_this_turn ?? [];
      const n = led.filter(r => {
        if (cond.byEffect && !r.byEffect) return false;
        if (!cond.filter) return true;
        return !!r.by && matchesFilter(ctx.cardMap.get(getCardNum(r.by)), cond.filter);
      }).length;
      return cmp(n, cond.operator, cond.value);
    }
    // §5.3 O-117: この効果の使用コストで、指定色が**すべて**支払われているか。
    // 🔴**1枚のエナは1色にしか数えない**＝色集合の二部マッチング（`COST_COLOR_SELECT` と同じ考え方）。
    //   単純な「union に全色が含まれる」判定だと、**マルチエナ1枚で5色すべて成立**してしまう。
    // 🔴**記録が無いときは false（fail-closed）**＝推定で倒すと過剰実行になる（`COST_COLOR_SELECT` の
    //   フォールバック推定はここでは使わない）。
    case 'PAID_COLORS_INCLUDE_ALL': {
      const need = cond.colors;
      const sets = (ctx.ownerState.last_paid_energy_colors ?? []).map(cs => cs.filter(c => need.includes(c)));
      if (sets.length === 0) return false;
      const matchByColor: Record<string, number> = {};
      const tryAssign = (ei: number, seen: Set<string>): boolean => {
        for (const col of sets[ei]) {
          if (seen.has(col)) continue;
          seen.add(col);
          if (matchByColor[col] === undefined || tryAssign(matchByColor[col], seen)) { matchByColor[col] = ei; return true; }
        }
        return false;
      };
      for (let ei = 0; ei < sets.length; ei++) tryAssign(ei, new Set());
      return need.every(c => matchByColor[c] !== undefined);
    }
    case 'APPEARANCE_COST_SAME_NAME': {
      // §5.3 O-122: 直近のレゾナ出現条件の支払いに**同名がN枚以上**あるか。
      // ⚠名前が引けないカードは数えない（fail-closed）＝`cardMap` に載っていない番号で成立させない。
      const paid = ctx.ownerState.last_appearance_cost_cards ?? [];
      const tally = new Map<string, number>();
      for (const num of paid) {
        const nm = ctx.cardMap.get(getCardNum(num))?.CardName;
        if (!nm) continue;
        tally.set(nm, (tally.get(nm) ?? 0) + 1);
      }
      return [...tally.values()].some(n => n >= cond.count);
    }
    case 'HAND_TRASHED_BY_OPP':
      return cmp(st(cond.owner).hand_trashed_by_opp_this_turn ?? 0, cond.operator, cond.value);
    case 'ENERGY_TRASHED_BY_OPP':
      return cmp(st(cond.owner).energy_trashed_by_opp_this_turn ?? 0, cond.operator, cond.value);
    case 'ARTS_USED_THIS_TURN': {
      const artsSt = st(cond.owner);
      // exactCount＝「それがこのターンにあなたが使用したN枚目のアーツだった場合」（WXK01-042）。
      // ⚠minCount（N以上）で近似すると **N+1枚目以降でも発火する過剰実行**になるので別軸にしてある。
      if (cond.exactCount !== undefined) return (artsSt.turn_arts_used_names ?? []).length === cond.exactCount;
      if (cond.minCount !== undefined) return (artsSt.turn_arts_used_names ?? []).length >= cond.minCount;
      // color 指定時は当該色のアーツを使用していた場合のみ（turn_arts_used_colors）
      if (cond.color) return (artsSt.turn_arts_used_colors ?? []).includes(cond.color);
      return artsSt.turn_arts_used === true;
    }
    case 'NO_OTHER_ARTS_USED_THIS_TURN':
      return (ctx.ownerState.turn_arts_used_names ?? []).filter(name => name !== cond.exceptCardName).length === 0;
    case 'SPELL_USED_THIS_TURN': {
      // handleUseSpell が actions_done に積む 'USE_SPELL' マーカー（ターン開始時リセット）＝
      // firstSpellExtra 等の既存機能と同じ判定源を参照する
      const spellUsed = (st(cond.owner).actions_done ?? []).filter(a => a === 'USE_SPELL').length;
      // exactCount＝「それがこのターンにあなたが使用したN枚目のスペルだった場合」（WXDi-P09-038）。
      // ⚠minCount（N以上）で近似すると **N+1枚目以降でも発火する過剰実行**になるので別軸にしてある。
      if (cond.exactCount !== undefined) return spellUsed === cond.exactCount;
      return spellUsed >= (cond.minCount ?? 1);
    }
    case 'HAS_CARD_IN_FIELD': {
      const srcNum = ctx.sourceCardNum;
      // 🆕`colorNotMatchesSource`（2026-08-31 続き748・`WX21-032-E1`「このシグニと共通する色を持たない他の
      //   ＜天使＞のシグニ」）は**動的フィルタ**なので `matchesFilter` は解けない＝ここで `colorExclude` へ潰す。
      //   🔴潰さないと未知キーとして**黙って素通り＝無条件成立**する（PLAN §4.2 の穴）。
      //   ⚠効果元が特定できないときは**到達不能名**で空ヒットへ倒す（過剰実行を作らない）。
      let hcifFilter = cond.filter;
      if (hcifFilter?.colorNotMatchesSource) {
        const { colorNotMatchesSource: _cnms, ...restCNMS } = hcifFilter;
        const srcColorStr = srcNum ? (ctx.cardMap.get(getCardNum(srcNum))?.Color ?? '') : '';
        hcifFilter = [...srcColorStr].some(c => '白赤青緑黒'.includes(c))
          ? { ...restCNMS, colorExclude: srcColorStr }
          : { ...restCNMS, cardNames: ['__NO_SUCH_CARD__'] };
      }
      const fieldStates = cond.owner === 'any' ? [ctx.ownerState, ctx.otherState] : [st(cond.owner)];
      // distinctNames:true は「N種類以上」＝カード名の異なる数を数える（「＜ブルアカ＞のシグニが３種類以上
      // ある場合」WX25-CP1-041/045・「それぞれ名前の異なる＜原子＞のシグニが３体あるかぎり」WX12-Re01）。
      // 一致したカード番号を集めてから数える（従来は件数だけ数えて distinctNames を黙って無視していた＝
      // 同名3体でも成立する過剰効果になっていた）。effectEngine の CONTINUOUS 収集と同じく CardName で寄せ、
      // CardData が引けない場合はカード番号にフォールバックする。
      const matchedNums = fieldStates.flatMap(fst => fst.field.signi.filter((stack, zoneIdx) => {
          if (!stack || stack.length === 0) return false;
          const top = stack[stack.length - 1];
          if (cond.excludeSelf && srcNum && top === srcNum) return false;
          // ゾーン状態（クロス/凍結）はCardDataに無いのでmatchesFilterと別に判定する
          if (cond.filter?.crossState !== undefined) {
            const isCross = fst.field.cross_state?.[zoneIdx] ?? false;
            if (cond.filter.crossState !== isCross) return false;
          }
          if (cond.filter?.isFrozen !== undefined) {
            const isFrozen = (fst.field.signi_frozen?.[zoneIdx] ?? false);
            if (cond.filter.isFrozen !== isFrozen) return false;
          }
          if (cond.filter?.isAwakened !== undefined) {
            const isAwk = (fst.awakened_signi ?? []).includes(top);
            if (cond.filter.isAwakened !== isAwk) return false;
          }
          if (cond.filter?.isPuppet !== undefined) {
            const isPuppet = (fst.field.puppet_signi ?? []).includes(top);
            if (cond.filter.isPuppet !== isPuppet) return false;
          }
          if (cond.filter?.hasCharm !== undefined) {
            const hasCharm = (fst.field.signi_charms?.[zoneIdx] ?? null) !== null;
            if (cond.filter.hasCharm !== hasCharm) return false;
          }
          // 「場にパワーN以上のシグニ」＝印字値ではなく CONTINUOUS/一時修整込みの実効パワーで判定する。
          return matchesFilter(ctx.cardMap.get(top), hcifFilter, ctx.effectivePowers?.get(top));
        }).map(stack => stack![stack!.length - 1]));
      // ルリグゾーン走査：「あなたの場に《X》がいる場合」で X がルリグ名の場合（census文型バッチ・
      // センタールリグ＋アシスト2枚の各グロウスタック頂点を見る）。crossState/isFrozen はシグニゾーン
      // 専用状態フィルタのため、それらが指定された条件ではルリグを走査しない（偽陽性防止）。
      if (!cond.filter?.crossState && !cond.filter?.isFrozen && !cond.filter?.isAwakened && !cond.filter?.isPuppet) {
        for (const fst of fieldStates) {
          for (const ln of lrigZoneTops(fst.field)) {
            if (ln && matchesFilter(ctx.cardMap.get(ln), hcifFilter)) matchedNums.push(ln);
          }
          // キーゾーン走査：「対戦相手の場にキーがある場合」。cardType:'キー' を
          // matchesFilter で照合するため、既存のシグニ／ルリグ条件には影響しない。
          const key = fst.field.key_piece;
          if (key && !(cond.excludeSelf && srcNum && key === srcNum)
              && matchesFilter(ctx.cardMap.get(key), hcifFilter)) matchedNums.push(key);
        }
      }
      const matched = cond.distinctClasses
        ? new Set(matchedNums.flatMap(n => splitClasses(ctx.cardMap.get(n)?.CardClass)).filter(c => !(cond.excludeClasses ?? []).includes(c))).size
        : cond.distinctColors
        ? new Set(matchedNums.flatMap(n => splitColors(ctx.cardMap.get(n)?.Color))).size
        : cond.distinctLevels ? new Set(matchedNums.map(n => ctx.cardMap.get(n)?.Level ?? '')).size
        : cond.distinctNames ? new Set(matchedNums.map(n => ctx.cardMap.get(n)?.CardName ?? n)).size : matchedNums.length;
      // negate: 「あなたの場に〈X〉が**ない**場合」（§6.4 O-11・`CONDITIONAL_POWER_BONUS` の解体）。
      // ⚠この条件には NOT ラッパが無いので否定はここで表す。minCount と併用すると「N枚以上ではない」。
      const hasEnough = matched >= (cond.minCount ?? 1);
      return cond.negate ? !hasEnough : hasEnough;
    }
    case 'HAS_TRAP_IN_FIELD': {
      // 🆕minCount＝「【トラップ】がN枚以上ある場合」（2026-08-31・`WX20-040-E2`）。省略=1＝従来の存在判定。
      //   ⚠`any` のときは**両者の合計**ではなく「どちらかが N 枚以上」（従来の some と同じ向き）。
      const trapStates = cond.owner === 'any' ? [s, o] : [st(cond.owner)];
      const need = cond.minCount ?? 1;
      const hasTrap = trapStates.some(state => (state.field.signi_traps ?? []).filter(Boolean).length >= need);
      return cond.negate ? !hasTrap : hasTrap;
    }
    case 'HAS_KEY_IN_FIELD': {
      const f = st(cond.owner).field;
      return f.key_piece != null || (f.key_piece_extra?.length ?? 0) > 0;
    }
    case 'ALL_FIELD_SIGNI_MATCH': {
      // 「あなたの場にあるすべてのシグニが＜C＞/《X》の場合」＝場の全シグニ（各スタック頂点）が filter 一致。
      // 空盤面は false（1体以上を要求＝軍勢が居ないのに空振り発火しない）。ルリグは対象外（シグニのみ）。
      const fst2 = st(cond.owner);
      const tops = fst2.field.signi
        .map((stack, zoneIdx) => stack && stack.length ? { cardNum: stack[stack.length - 1], zoneIdx } : null)
        .filter((n): n is { cardNum: string; zoneIdx: number } => n !== null);
      if (tops.length === 0) return false;
      return tops.every(({ cardNum, zoneIdx }) => {
        if (cond.filter.isFrozen !== undefined && cond.filter.isFrozen !== (fst2.field.signi_frozen?.[zoneIdx] ?? false)) return false;
        if (cond.filter.isAwakened !== undefined && cond.filter.isAwakened !== (fst2.awakened_signi ?? []).includes(cardNum)) return false;
        if (cond.filter.isPuppet !== undefined && cond.filter.isPuppet !== (fst2.field.puppet_signi ?? []).includes(cardNum)) return false;
        return matchesFilter(ctx.cardMap.get(cardNum), cond.filter);
      });
    }
    case 'ALL_SELF_SIGNI_DOWN': {
      const occupied = ctx.ownerState.field.signi
        .map((stack, zoneIdx) => ({ stack, zoneIdx }))
        .filter(({ stack }) => !!stack?.at(-1));
      return occupied.length > 0 && occupied.every(({ zoneIdx }) => ctx.ownerState.field.signi_down?.[zoneIdx] === true);
    }
    case 'TRASH_HAS_CARD': {
      const stripCC = ctx.oppTrashColorLoss && cond.owner === 'self';
      // minCount: フィルタ一致カードがN枚以上（省略=1。「トラッシュに＜武勇＞のシグニが10枚以上ある場合」等）
      const matchedCards = st(cond.owner).trash.filter(n => {
        const c = ctx.cardMap.get(n);
        if (!c) return false;
        return matchesFilter(stripCC ? { ...c, Color: '', CardClass: '' } : c, cond.filter);
      });
      const matched = cond.distinctClasses
        ? new Set(matchedCards.flatMap(n => splitClasses(ctx.cardMap.get(n)?.CardClass)).filter(c => !(cond.excludeClasses ?? []).includes(c))).size
        : cond.distinctName
        ? new Set(matchedCards.map(n => ctx.cardMap.get(n)?.CardName ?? getCardNum(n))).size
        : matchedCards.length;
      return matched >= (cond.minCount ?? 1);
    }
    case 'DECK_TOP_MATCHES': {
      const topNum = st(cond.owner).deck[0];
      if (!topNum) return false;
      const topCard = ctx.cardMap.get(topNum);
      if (matchesFilter(topCard, cond.filter)) return true;
      // LEVEL_REFERENCE_OVERRIDE: カードテキストで許容レベルが指定されている場合も考慮
      if (cond.filter && cond.filter.level !== undefined) {
        const targetLvDTM = typeof cond.filter.level === 'number' ? cond.filter.level : null;
        if (targetLvDTM !== null) {
          const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const txt = topCard?.EffectText ?? '';
          const single = txt.match(/レベルを参照する場合、レベル([０-９\d]+)として扱ってもよい/);
          if (single && parseInt(toHW(single[1])) === targetLvDTM) {
            return matchesFilter(topCard, { ...cond.filter, level: undefined });
          }
          const range = txt.match(/レベルを参照する場合、([０-９\d]+)～([０-９\d]+)いずれかのレベル/);
          if (range) {
            const minLv = parseInt(toHW(range[1])); const maxLv = parseInt(toHW(range[2]));
            if (targetLvDTM >= minLv && targetLvDTM <= maxLv) {
              return matchesFilter(topCard, { ...cond.filter, level: undefined });
            }
          }
        }
      }
      return false;
    }
    case 'LRIG_LEVEL': {
      const lrig = st(cond.owner).field.lrig;
      const topLrig = lrig[lrig.length - 1];
      if (!topLrig) return false;
      const lv = parseInt(ctx.cardMap.get(topLrig)?.Level ?? '-1', 10);
      return cmp(lv, cond.operator, cond.value);
    }
    case 'LRIG_STORY': {
      const lrig = st(cond.owner).field.lrig;
      const topLrig = lrig[lrig.length - 1];
      // ⚠ルリグ不在は「＜X＞である」も「＜X＞でない」も false（`negate` を掛けると不在で真になり、
      //   盤面が無いのに発火する）。両評価器で同じ扱いにそろえる。
      if (!topLrig) return false;
      const card = ctx.cardMap.get(topLrig);
      const isStory = card?.CardClass?.includes(cond.story) ?? false;
      return cond.negate ? !isStory : isStory;
    }
    case 'LRIG_TEAM_COUNT': {
      // 場のルリグ（センター＋アシストL/R）のうち Team が一致する数（「＜うちゅうのはじまり＞のルリグが3体」。WXDi-D05-021）
      const fLTC = st(cond.owner).field;
      const lrigNumsLTC = [fLTC.lrig.at(-1), fLTC.assist_lrig_l?.at(-1), fLTC.assist_lrig_r?.at(-1)].filter((n): n is string => !!n);
      const cntLTC = lrigNumsLTC.filter(n => (ctx.cardMap.get(getCardNum(n))?.Team ?? '').includes(cond.team)).length;
      return cmp(cntLTC, cond.operator, cond.value);
    }
    case 'FIELD_LEVEL_SUM': {
      const sum = (state: PlayerState): number => {
        const nums = cond.target === 'signi'
          ? state.field.signi.map(stack => stack?.at(-1)).filter((n): n is string => !!n)
          : cond.lrigRole === 'assist'
            ? [state.field.assist_lrig_l?.at(-1), state.field.assist_lrig_r?.at(-1)].filter((n): n is string => !!n)
            : cond.lrigRole === 'center'
              ? [state.field.lrig.at(-1)].filter((n): n is string => !!n)
              : lrigZoneTops(state.field).filter((n): n is string => !!n);
        if (cond.metric === 'power') {
          return nums.reduce((total, n) => total + (ctx.effectivePowers?.get(n)
            ?? (parseInt((ctx.cardMap.get(getCardNum(n))?.Power ?? '').replace(/[^0-9]/g, ''), 10) || 0)), 0);
        }
        return nums.reduce((total, n) => total + (parseInt(ctx.cardMap.get(getCardNum(n))?.Level ?? '0', 10) || 0), 0);
      };
      const lhsState = st(cond.owner);
      const lhs = sum(lhsState);
      if (cond.parity) return Math.abs(lhs % 2) === (cond.parity === 'odd' ? 1 : 0);
      const rhs = cond.compareTo === 'opponent'
        ? (cond.owner === 'self' ? sum(ctx.otherState) : sum(ctx.ownerState))
        : cond.value;
      return cond.operator !== undefined && rhs !== undefined && cmp(lhs, cond.operator, rhs);
    }
    case 'LRIG_ANY_TEAM_COUNT': {
      // 【使用条件】【チーム】いずれかのチーム＝場のルリグ（センター＋アシストL/R）のうち
      // **同じ1つのチーム**に属する体数が value 以上。⚠`Team` は「A・B」のような複数所属表記が
      // あるため、チーム名ごとに数えて最大値を見る（`LRIG_TEAM_COUNT` の名指し版と同じ照合基準）。
      const fLATC = st(cond.owner).field;
      const teamsLATC = [fLATC.lrig.at(-1), fLATC.assist_lrig_l?.at(-1), fLATC.assist_lrig_r?.at(-1)]
        .filter((n): n is string => !!n)
        .map(n => (ctx.cardMap.get(getCardNum(n))?.Team ?? '').split(/[・･]/).map(s => s.trim()).filter(Boolean));
      const tallyLATC = new Map<string, number>();
      for (const ts of teamsLATC) for (const t of new Set(ts)) tallyLATC.set(t, (tallyLATC.get(t) ?? 0) + 1);
      return Math.max(0, ...tallyLATC.values()) >= cond.value;
    }
    case 'THIS_CARD_IN_LOCATION': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const loc = cond.location;
      if (loc === 'trash') return ctx.ownerState.trash.includes(src);
      if (loc === 'energy') return ctx.ownerState.energy.includes(src);
      if (loc === 'lrig_trash') return ctx.ownerState.lrig_trash.includes(src);
      return false;
    }
    case 'THIS_CARD_IN_CENTER_ZONE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      return ctx.ownerState.field.signi[1]?.includes(src) ?? false;
    }
    case 'THIS_CARD_IS_DOWN': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.includes(src));
      if (zoneIdx < 0) return false;
      return ctx.ownerState.field.signi_down?.[zoneIdx] ?? false;
    }
    case 'THIS_CARD_IS_UP': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.includes(src));
      if (zoneIdx < 0) return false;
      return !(ctx.ownerState.field.signi_down?.[zoneIdx] ?? false);
    }
    case 'CENTER_LRIG_IS_UP':
      return !(ctx.ownerState.field.lrig_down ?? false);
    case 'THIS_CARD_IS_ARMORED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === src);
      if (zoneIdx < 0) return false;
      return ctx.ownerState.field.signi_armor?.[zoneIdx] ?? false;
    }
    case 'THIS_CARD_IS_AWAKENED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      return ctx.ownerState.awakened_signi?.includes(src) ?? false;
    }
    case 'THIS_CARD_IS_ACCED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === src);
      if (zoneIdx < 0) return false;
      return acceCardsAt(ctx.ownerState.field, zoneIdx).length >= (cond.minCount ?? 1);
    }
    // 「このシグニに【チャーム】が付いている場合」（§6.4 O-25(d)）。
    // ⚠`ActiveCondition` の `IS_SELF_CHARMED`（`effectEngine.checkActiveCondition`）と同実装＝両方揃えること。
    case 'THIS_CARD_IS_CHARMED': {
      const srcCh = ctx.sourceCardNum;
      if (!srcCh) return false;
      const zoneCh = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === srcCh);
      if (zoneCh < 0) return false;
      return (ctx.ownerState.field.signi_charms?.[zoneCh] ?? null) !== null;
    }
    // 「そのアタックがこのターンN度目の場合」（§6.4 O-25(d)）。
    // 🔑序数は**アタックしたプレイヤーのターン内通算**（シグニ1体あたりではない）＝
    //   `attacked_signi_ids` の件数＋ルリグアタック済み分。**解決中のアタック自身を含む**
    //   （`BattleScreen` は追記後の state で ON_ATTACK_SIGNI を収集する）。
    // ⚠アタックフェイズを追加するカードがあるので上限は決め打ちしない。
    case 'ATTACK_ORDINAL_THIS_TURN': {
      const stAO = st(cond.owner);
      const nAO = (stAO.attacked_signi_ids ?? []).length + (cond.signiOnly ? 0 : stAO.lrig_has_attacked ? 1 : 0);
      return cmp(nAO, cond.operator, cond.value);
    }
    case 'SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE': {
      // 「そのアタックフェイズの間に〈owner〉のシグニ（filter一致）が場を離れていた場合」（§6.3 J-4・WX24-P2-075-E1）。
      // 記録は instanceId なので cardMap 照合には getCardNum を通す。⚠行き先は問わない。
      const st = cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState;
      const left = st.signi_left_field_this_attack_phase ?? [];
      const n = left.filter(id => !cond.filter || matchesFilter(ctx.cardMap.get(getCardNum(id)), cond.filter)).length;
      return n >= (cond.minCount ?? 1);
    }
    case 'THIS_CARD_HAS_SOUL': {
      // 「このシグニに【ソウル】が付いている場合」（2026-08-27 Sheet1 B5・WXDi-P16-089-E1）。
      // ⚠`THIS_CARD_HAS_ATTACHED`（チャーム/アクセ/ソウルの合計）とは別物＝ソウル限定。
      const srcSoul = ctx.sourceCardNum;
      if (!srcSoul) return false;
      const zoneSoul = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === srcSoul);
      if (zoneSoul < 0) return false;
      return (ctx.ownerState.field.signi_soul?.[zoneSoul] ?? null) !== null;
    }
    case 'THIS_CARD_HAS_ATTACHED': {
      // 「このシグニにカードが付いている場合」＝【チャーム】/【アクセ】/【ソウル】の合計枚数（WXK10-049-E2）。
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === src);
      if (zoneIdx < 0) return false;
      const f = ctx.ownerState.field;
      const n = (f.signi_charms?.[zoneIdx] ? 1 : 0)
        + acceCardsAt(f, zoneIdx).length
        + (f.signi_soul?.[zoneIdx] ? 1 : 0);
      return n >= (cond.minCount ?? 1);
    }
    case 'IS_DRIVE_STATE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      return ctx.ownerState.lrig_riding_signi?.includes(src) ?? false;
    }
    case 'TURN_HAND_DISCARD_GTE':
      // owner 省略＝self（従来挙動）。'opponent' は「このターンに対戦相手が手札を捨てていた場合」（WD16-016）。
      return ((cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState).turn_hand_discarded_count ?? 0) >= cond.value;
    case 'SIGNI_BANISHED_THIS_TURN':
      // このターンに owner のシグニがN体以上バニッシュされていた場合（WXDi-P15-088 / WXK04-029）。
      // ⚠`signi_banished_this_turn` は **バニッシュされた側**の state に積まれる（BattleScreen の中央 diff）
      //   ＝「対戦相手のシグニがバニッシュされていた」は otherState を見る。
      return ((cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState).signi_banished_this_turn ?? 0) >= (cond.minCount ?? 1);
    case 'SELF_DECK_TO_TRASH_THIS_TURN': {
      // このターンに owner のデッキからカードがN枚以上トラッシュに置かれていた場合（WXDi-P03-065）。
      // 🆕`filter` 指定時は実体（`deck_to_trash_cards_this_turn`）を絞って数える（2026-08-31 続き748）。
      const stDT = cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState;
      const nDT = cond.filter
        ? (stDT.deck_to_trash_cards_this_turn ?? []).filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter)).length
        : (stDT.deck_to_trash_count_this_turn ?? 0);
      return nDT >= (cond.minCount ?? 1);
    }
      case 'HAND_DISCARDED_THIS_TURN': {
      // 🆕「このターンに owner が手札から〈filter〉のカードをN枚以上捨てていた場合」（2026-08-31 続き748）。
      //   ⚠実体（`turn_hand_discarded_cards`）を絞って数える＝**枚数カウンタでは filter を表せない**。
      //   filter 省略時も実体側だけを見て一本化する（両者は同じ地点で更新される）。
        const discardedHD = (cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState).turn_hand_discarded_cards ?? [];
        const nHD = cond.filter
          ? discardedHD.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter)).length
          : discardedHD.length;
        return nHD >= (cond.minCount ?? 1);
      }
    case 'SIGNI_RETURNED_TO_HAND_THIS_TURN': {
      // このターンにシグニがN体以上場から手札に戻っていた場合（WXK02-040/042/065）。
      // ⚠原文が「シグニが」と持ち主を言わない形は owner:'any'＝**両者の合算**で数える。
      // ⚠minCount 省略（＝1体以上）は**既存の boolean フラグも見る**＝カウンタ導入前に立った
      //   フラグだけの state でも従来どおり成立させる（過小実行への裏返りを避ける）。
      const rthStates = cond.owner === 'any' ? [ctx.ownerState, ctx.otherState]
        : [cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState];
      const rthMin = cond.minCount ?? 1;
      const rthCount = rthStates.reduce((n, st) => n + (st.signi_returned_to_hand_count_this_turn ?? 0), 0);
      if (rthMin <= 1) return rthStates.some(st => st.turn_signi_returned_to_hand === true) || rthCount >= 1;
      return rthCount >= rthMin;
    }
    case 'SAME_ZONE_HAS_GATE': {
      // このシグニ（sourceCardNum）と同じシグニゾーンに THE DOOR【ゲート】がある場合
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zi = s.field.signi.findIndex(z => z?.at(-1) === src);
      if (zi < 0) return false;
      return (s.own_gate_zones ?? []).includes(zi);
    }
    case 'SAME_ZONE_HAS_SEED': {
      // このシグニ（sourceCardNum）と同じシグニゾーンに【シード】がある場合。
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zi = s.field.signi.findIndex(z => z?.at(-1) === src);
      if (zi < 0) return false;
      return (s.field.signi_seeds?.[zi] ?? null) !== null;
    }
    case 'FIELD_HAS_GATE':
      return (st(cond.owner).own_gate_zones ?? []).length > 0;
    case 'THIS_CARD_HAS_UNDER': {
      // filter 指定時は下カードのいずれかがフィルタ一致（「下にレベルNのシグニがあるかぎり」等。WX24-P1-043）
      // subject:'lrig'＝**このルリグの下**＝グロウで積んだ `field.lrig` スタック（センター＋アシスト）。
      // ⚠既定（signi）は `field.signi` しか見ないので、ルリグ札で使うと常に false になる。
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const stack = cond.subject === 'lrig'
        ? [ctx.ownerState.field.lrig, ctx.ownerState.field.assist_lrig_l, ctx.ownerState.field.assist_lrig_r]
            .find(z => z?.at(-1) === src)
        : ctx.ownerState.field.signi.find(s => s?.at(-1) === src);
      // minCount は「下にカードがN枚以上ある場合」（省略=1）。filter 併用時は filter 一致だけを数える。
      const unders = (stack ?? []).slice(0, -1).filter(cn => {
        if (!cond.filter) return true;
        const base = cn.includes('#') ? cn.slice(0, cn.indexOf('#')) : cn;
        return matchesFilter(ctx.cardMap.get(base), cond.filter);
      });
      const hasMatch = unders.length >= (cond.minCount ?? 1);
      return cond.negate ? !hasMatch : hasMatch;
    }
    case 'LRIG_LEVEL_EQ_OPP': {
      const myLrig = s.field.lrig.at(-1);
      const opLrig = o.field.lrig.at(-1);
      if (!myLrig || !opLrig) return false;
      const myLv = parseInt(ctx.cardMap.get(myLrig)?.Level ?? '-1', 10);
      const opLv = parseInt(ctx.cardMap.get(opLrig)?.Level ?? '-2', 10);
      return myLv === opLv;
    }
    case 'LRIG_LEVEL_CMP_OPP': {
      // 自分のセンタールリグのレベルが対戦相手のセンタールリグ より低い/以下/より高い/以上 の場合
      const myLrig = s.field.lrig.at(-1);
      const opLrig = o.field.lrig.at(-1);
      if (!myLrig || !opLrig) return false;
      const myLv = parseInt(ctx.cardMap.get(myLrig)?.Level ?? '', 10);
      const opLv = parseInt(ctx.cardMap.get(opLrig)?.Level ?? '', 10);
      if (isNaN(myLv) || isNaN(opLv)) return false;
      return cond.operator === 'lt' ? myLv < opLv
        : cond.operator === 'lte' ? myLv <= opLv
        : cond.operator === 'gt' ? myLv > opLv
        : myLv >= opLv;
    }
    case 'LRIG_NAME_CONTAINS': {
      const lrig = st(cond.owner).field.lrig.at(-1);
      if (!lrig) return false;
      return ctx.cardMap.get(lrig)?.CardName?.includes(cond.name) ?? false;
    }
    case 'LRIG_COLOR': {
      const lrig = st(cond.owner).field.lrig.at(-1);
      if (!lrig) return false;
      return ctx.cardMap.get(lrig)?.Color?.includes(cond.color) ?? false;
    }
    case 'LRIG_DECK_COUNT':
      return cmp(st(cond.owner).lrig_deck.length, cond.operator, cond.value);
    case 'LRIG_TRASH_COUNT': {
      const types = cond.cardType
        ? (Array.isArray(cond.cardType) ? cond.cardType : [cond.cardType])
        : null;
      const cnt = ctx.ownerState.lrig_trash.filter(n => {
        // excludeSource: 使用中のカード自身（sourceCardNum）はまだルリグトラッシュに置かれていない扱い＝リコレクト判定
        if (cond.excludeSource && n === ctx.sourceCardNum) return false;
        const c = ctx.cardMap.get(n);
        if (!c) return false;
        if (types && !types.includes(c.Type as typeof types[number])) return false;
        return !cond.filter || matchesFilter(c, cond.filter);
      }).length;
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'FIELD_CLASS_COUNT': {
      const cnt = st(cond.owner).field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        return ctx.cardMap.get(top)?.CardClass?.includes(cond.story) ? n + 1 : n;
      }, 0);
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'SUBSCRIBER_COUNT':
      return cmp(ctx.ownerState.subscriber_count ?? 0, cond.operator, cond.value);
    // 場に付いている【チャーム】の枚数（signi_charms は「ゾーンごとに1枚 or null」）。
    case 'CHARM_COUNT':
      return cmp((st(cond.owner).field.signi_charms ?? []).filter(Boolean).length, cond.operator, cond.value);
    case 'ZONE_SUM_COUNT': {
      // 「〈ゾーンA〉と〈ゾーンB〉に〈filter〉のカードが合計N枚以上ある場合」。
      // ⚠数え方は `countFromZone` に一本化（filter/unitSize/per/distinctBy を共有）＝AND 近似では表せない軸。
      // 🆕§5.3 `O-214`＝`distinctAcrossZones` は**全ゾーンを合流させてから1度だけ distinct する**。
      //   🔴既定（ゾーンごとの `distinctBy` を足す形）は**同名が場とエナに1枚ずつあると 2 と数える**＝
      //   原文「場とエナに合計N**種類**」に対して過剰成立だった（`WXDi-CP01-031-E1`）。
      if (cond.distinctAcrossZones) {
        const key = cond.distinctAcrossZones;
        const keys = new Set<string>();
        for (const z of cond.zones) {
          for (const cardNum of zoneCardsOf(z, s, o, ctx.sourceCardNum)) {
            const card = ctx.cardMap.get(getCardNum(cardNum));
            if (!card || (z.filter && !matchesFilter(card, z.filter))) continue;
            const value = key === 'name' ? (card.CardName ?? '') : (card.Level ?? '');
            if (value !== '') keys.add(value);
          }
        }
        return cmp(keys.size, cond.operator, cond.value);
      }
      const total = cond.zones.reduce(
        (n, z) => n + countFromZone(z, s, o, ctx.cardMap, ctx.sourceCardNum), 0);
      return cmp(total, cond.operator, cond.value);
    }
    case 'CENTER_LRIG_ATTACKED_THIS_TURN': {
      // このターンに owner のセンタールリグがアタックしていたか（`lrig_has_attacked` はターン開始時リセット）。
      const attacked = st(cond.owner).lrig_has_attacked ?? false;
      return cond.negate ? !attacked : attacked;
    }
    case 'FIELD_ATTACHED_COUNT': {
      // 「場のシグニに付いているカード／下に置かれているカード」の枚数（owner:'any' は両者を合算）。
      // ⚠付いているカード＝【チャーム】/【アクセ】/【ソウル】/裏向き付け（`THIS_CARD_HAS_ATTACHED` と同じ集合）。
      // include: 'attached'＝付いているカード／'under'＝下のカード／'both'＝合計／
      //          'soul'＝【ソウル】だけ／'zone'＝シグニゾーンにあるカード全部（場のシグニ本体も数える）
      const kind = cond.include ?? 'both';
      const countIn = (ps: typeof s): number => {
        const f = ps.field;
        let n = 0;
        for (let zi = 0; zi < 3; zi++) {
          if (kind === 'soul') { n += f.signi_soul?.[zi] ? 1 : 0; continue; }
          // 🆕'acce'＝【アクセ】だけ（2026-08-31 続き747・`WX18-075-E1`「【アクセ】が合計2枚以上ある場合」）。
          if (kind === 'acce') { n += acceCardsAt(f, zi).length; continue; }
          if (kind !== 'under') {
            n += (f.signi_charms?.[zi] ? 1 : 0)
              + acceCardsAt(f, zi).length
              + (f.signi_soul?.[zi] ? 1 : 0)
              + (f.signi_facedown_attached?.[zi]?.length ?? 0);
          }
          if (kind !== 'attached') n += Math.max(0, (f.signi[zi]?.length ?? 0) - (kind === 'zone' ? 0 : 1));
        }
        return n;
      };
      const total = cond.owner === 'any' ? countIn(s) + countIn(o) : countIn(st(cond.owner));
      return cmp(total, cond.operator, cond.value);
    }
    case 'VIRUS_COUNT':
      return cmp((st(cond.owner).field.signi_virus ?? []).reduce((sum, count) => sum + count, 0), cond.operator, cond.value);
    // 「この方法で（シグニを）公開したとき」（§5.3 `O-81`・`WX16-003-E3`）。
    // ⚠**効果オーナー自身の**使い捨てマーカーを読む（裏向き付けは自分のシグニにしか行われない）。
    case 'FACEDOWN_REVEALED_JUST':
      return (ctx.ownerState.facedown_revealed_just ?? [])
        .some(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter));
    case 'SELF_POWER_GTE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const pw = ctx.effectivePowers?.get(src) ?? parseInt(ctx.cardMap.get(src)?.Power ?? '0', 10);
      return cmp(pw, cond.operator ?? 'gte', cond.value);
    }
    // タスク12(cxvii)：このシグニ自身の**実効レベル**。`ctx.effectivePowers` に相当するレベルの箱は
    // ExecCtx に無いので、`effectsMap` があれば `calcSigniLevels` でその場で計算する
    // （`DYNAMIC_LEVEL_BY_ENERGY` 等の動的レベルを拾う唯一の経路。表記レベルへ落とすと
    //  `WX20-Re18`＝表記2・閾値4/5 が一生 false になる）。
    case 'SELF_LEVEL_THRESHOLD': {
      const srcLv = ctx.sourceCardNum;
      if (!srcLv) return false;
      const lv = (ctx.effectsMap
        ? calcSigniLevels(ctx.ownerState, ctx.otherState, ctx.effectsMap, ctx.cardMap).get(getCardNum(srcLv))
        : undefined) ?? parseInt(ctx.cardMap.get(getCardNum(srcLv))?.Level ?? '', 10);
      if (isNaN(lv)) return false;
      return cmp(lv, cond.operator, cond.value);
    }
    case 'IS_SELF_IN_SIDE_ZONE': {
      // このシグニが左（index 0）／右（index 2）／左か右（中央以外）のシグニゾーンにある場合。
      // ActiveCondition 版（effectEngine の checkActiveCondition）と同じ判定＝両方揃えて更新すること。
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zi = ctx.ownerState.field.signi.findIndex(s => s?.includes(src));
      if (zi < 0) return false;
      return cond.side === 'either' ? zi !== 1 : zi === (cond.side === 'left' ? 0 : 2);
    }
    case 'THIS_CARD_FROM_TRASH':
      // このシグニがトラッシュから場に出た場合（execAddToField で signi_played_from_trash に記録）
      return !!ctx.sourceCardNum && (ctx.ownerState.signi_played_from_trash?.includes(ctx.sourceCardNum) ?? false);
    case 'THIS_CARD_FROM_NON_HAND_THIS_TURN':
      return !!ctx.sourceCardNum && (ctx.ownerState.signi_played_from_non_hand_this_turn?.includes(ctx.sourceCardNum) ?? false);
    // 🆕「このターンにこのシグニが〈zone〉から場に出ていた場合」（2026-08-31 続き748・`WXDi-P06-070-E1`）。
    case 'THIS_CARD_FROM_ZONE_THIS_TURN': {
      if (!ctx.sourceCardNum) return false;
      const origins = ctx.ownerState.signi_placed_origin_this_turn ?? [];
      return cond.zones.some(z => origins.includes(`${ctx.sourceCardNum}:${z}`));
    }
    // 🆕トリガー元カードの属性で分岐する（2026-08-31 続き748・`WXK05-065-E1`）。
    case 'TRIGGER_SOURCE_MATCHES': {
      const trg = ctx.triggeringCardNum;
      if (!trg) return false;                      // 参照不能は不成立（fail-closed）
      return matchesFilter(ctx.cardMap.get(getCardNum(trg)), cond.filter);
    }
    // 🆕**公開領域**の集合条件（2026-08-31 続き748）。場（シグニ頂点＋ルリグ）／エナ／トラッシュ／
    //   ルリグトラッシュ／チェックゾーン。⚠デッキ・手札・ライフクロス（裏向き）は数えない。
    case 'PUBLIC_ZONE_MATCH': {
      const stPZ = cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState;
      const cardsPZ = [
        ...stPZ.field.signi.map(stack => stack?.at(-1)).filter((n): n is string => !!n),
        ...[stPZ.field.lrig?.at(-1), stPZ.field.assist_lrig_l?.at(-1), stPZ.field.assist_lrig_r?.at(-1)]
          .filter((n): n is string => !!n),
        ...stPZ.energy, ...stPZ.trash, ...stPZ.lrig_trash, ...checkZoneCards(stPZ),
      ];
      const subjectsPZ = cardsPZ.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.subjectFilter));
      if (cond.mode === 'all') {
        // ⚠subject が0枚なら**不成立**（空集合を真にすると「盤面が空なら常に発動」へ裏返る）。
        return subjectsPZ.length >= (cond.minCount ?? 1)
          && subjectsPZ.every(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter));
      }
      return subjectsPZ.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter)).length >= (cond.minCount ?? 1);
    }
    case 'THIS_CARD_FROM_DECK':
      return !!ctx.sourceCardNum && (ctx.ownerState.signi_played_from_deck?.includes(ctx.sourceCardNum) ?? false);
    case 'THIS_CARD_PLACED_BY_CLASS': {
      // このシグニが＜X＞のシグニの効果によって場に出ていた場合（出自条件・WX26-CP1-048）。
      // signi_placed_by_source に記録された発生源カードの Type / CardClass を照合する。
      // 🔑cardClass 指定時だけ従来どおりシグニ限定。Type 指定だけの条件でスペル／アーツ／ルリグを
      //   早期 return すると、条件が永久に成立しない。
      if (!ctx.sourceCardNum) return false;
      const srcPBC = ctx.ownerState.signi_placed_by_source?.[ctx.sourceCardNum];
      if (!srcPBC) return false;
      if (!cond.cardClass && !cond.sourceCardTypes) return true;
      const srcCardPBC = ctx.cardMap.get(getCardNum(srcPBC));
      if (!srcCardPBC) return false;
      if (cond.sourceCardTypes && !cond.sourceCardTypes.includes(srcCardPBC.Type)) return false;
      if (!cond.cardClass) return true;
      if (srcCardPBC.Type !== 'シグニ') return false;
      const wantedClass = cond.cardClass;
      return (srcCardPBC.CardClass ?? '').split(/[/／]/).map(s => s.trim()).some(c => c.includes(wantedClass));
    }
    case 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG': {
      // 直前に処理したカード（lastProcessed）が指定プレイヤーのセンタールリグと共通する色を持つ場合（WX26-CP1-048）。
      const lpSC = ctx.lastProcessedCards?.[0];
      if (!lpSC) return false;
      const lpColors = (ctx.cardMap.get(getCardNum(lpSC))?.Color ?? '').split(/[/／、,]/).map(c => c.trim()).filter(Boolean);
      if (lpColors.length === 0) return false;
      const lrigTopSC = st(cond.owner).field.lrig.at(-1);
      if (!lrigTopSC) return false;
      const lrigColorSC = ctx.cardMap.get(getCardNum(lrigTopSC))?.Color ?? '';
      return lpColors.some(c => lrigColorSC.includes(c));
    }
    case 'FIELD_SIGNI_POWER_COUNT': {
      const cnt = st(cond.owner).field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        const pw = ctx.effectivePowers?.get(top) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0', 10);
        return pw >= cond.minPower ? n + 1 : n;
      }, 0);
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'LIFE_COMPARE_OPP':
      return cmp(s.life_cloth.length - o.life_cloth.length, cond.operator, cond.value ?? 0);
    // 手札/エナの両プレイヤー比較（LIFE_COMPARE_OPP と同じ向き＝cmp(自分, op, 相手)）。タスク12(lxiii)
    case 'HAND_COMPARE_OPP':
      return cmp(s.hand.length, cond.operator, o.hand.length);
    case 'ENERGY_COMPARE_OPP':
      return cmp(s.energy.length, cond.operator, o.energy.length);
    // 🆕**同一プレイヤーの2ゾーンの枚数比較**（2026-08-30 §5.2 カード単位バッチ第3回・`WX24-P4-053-E1`）。
    // ⚠上の2本（HAND/ENERGY_COMPARE_OPP）は「同じゾーンを両プレイヤーで」比較する別軸＝代用にならない。
    // ⚠**`HAND_COUNT{value:{$ref:…}}` では書けない**＝条件側の `value` は `resolveNum` が `$ref` を
    //   黙って 0 にするので「手札0枚以下」に化ける。ゾーン数え上げは `countFromZone` 1本へ寄せる。
    case 'ZONE_COUNT_COMPARE':
      // 🆕`offset`＝右辺に足す下駄（「対戦相手より2体以上少ない」＝ left <= right - 2）。
      return cmp(
        countFromZone(cond.left, s, o, ctx.cardMap, ctx.sourceCardNum),
        cond.operator,
        countFromZone(cond.right, s, o, ctx.cardMap, ctx.sourceCardNum) + (cond.offset ?? 0),
      );
    case 'EFFECTIVE_LRIG_LIMIT_GTE':
      return !!ctx.effectsMap && computeEffectiveLrigLimit(
        s, o, ctx.cardMap, ctx.effectsMap, ctx.isOwnerTurn ?? true,
      ) >= cond.value;
    case 'DURING_PHASE':
      return cond.phases.includes(ctx.currentPhase ?? '');
    // 対戦相手のシグニがアタックしている最中か（アタック宣言済み・バトル未解決＝pending_signi_battle）。
    // turn_phase は所有者を持たない単一値なので「相手のアタックステップ」はフェイズ名では表せない（Opusタスク12(cx)）。
    case 'OPP_SIGNI_ATTACKING':
      return !!ctx.otherState.pending_signi_battle;
    case 'AND':
      return cond.conditions.every(c => evalCondition(c, ctx));
    case 'OR':
      return cond.conditions.some(c => evalCondition(c, ctx));
    // IS_MY_TURN / IS_OPPONENT_TURN は実行時には判定できない（executor は常にオーナー視点）ため、
    // どちらもプレースホルダとして true を返す。実際のターン判定は収集側（BattleScreen）が condHas で行う。
    case 'IS_MY_TURN':            return true;
    case 'IS_OPPONENT_TURN':      return true;
    // IS_BETTING: このアーツ/スペルでベットを宣言していたか（is_betting_this_effect）。
    // 「あなたがベットしていた場合、代わりに」の択一に使う（CONDITIONAL then=強化 / else=基本）。
    case 'IS_BETTING': {
      // negate=true は「ベットしていなかった場合」（`WD20-006-E1` の「次のあなたのターンをスキップする」）。
      const betting = !!ctx.ownerState.is_betting_this_effect &&
        (cond.minCoins == null || (ctx.ownerState.bet_coins_paid ?? 0) >= cond.minCoins);
      return cond.negate ? !betting : betting;
    }
    case 'IS_BOOSTING':           return !!ctx.ownerState.is_boosting_this_effect;
    // 🆕このターンの owner のリフレッシュ回数（`PR-205-E1`「このターンであなたの最初のリフレッシュである場合」）。
    // ⚠`refresh.ts` が**リフレッシュ処理の中で先に加算**するので、ON_REFRESH 収集時点で 1回目＝1。
    case 'REFRESH_COUNT_THIS_TURN':
      return cmp(st(cond.owner).refresh_count_this_turn ?? 0, cond.operator, cond.value);
    case 'ANY_PLAYER_REFRESHED_THIS_TURN':
      return (ctx.ownerState.refresh_count_this_turn ?? 0) > 0
        || (ctx.otherState.refresh_count_this_turn ?? 0) > 0;
    case 'BEAT_CONDITION': {
      const beatZone = ctx.ownerState.field.beat_zone ?? [];
      return checkBeatCondition(beatZone, cond.condText, ctx.cardMap);
    }
    case 'LAST_PROCESSED_SHARE_COLOR': {
      // lastProcessedCards 全てに共通する色が1つ以上あるか（「それらがそれぞれ共通する色を持つ場合」。WDK10-008）
      const lst = ctx.lastProcessedCards ?? [];
      if (lst.length === 0) return false;
      const colorSets = lst.map(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color));
      const common = colorSets.reduce((acc, cols) => acc.filter(c => cols.includes(c)), colorSets[0]);
      return common.length > 0;
    }
    case 'PAID_ADDITIONAL_COST':  return false; // execSequence の look-ahead で処理済みのため通常到達しない
    case 'COND_STUB':             return true;
    case 'OPPONENT_NOT_PAID':            return ctx.ownerState.opponent_paid_optional_cost !== true;
    case 'SELF_OPTIONAL_EFFECT_TAKEN':  return ctx.ownerState.self_optional_effect_taken === true;
    case 'HAS_BOND': {
      const name = cond.cardName ?? (ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum)?.CardName : undefined);
      if (!name) return false;
      return ctx.ownerState.bonds?.includes(name) ?? false;
    }
    case 'ACTIVATED_DISCARD_COUNT_GTE':
      return (ctx.ownerState.last_activated_discard_count ?? 0) >= cond.value;
    // ── §3 タスク6「代わりに」B1残（per-target 値すり替えの置換ゲート）
    case 'OPP_CARDS_MOVED_TO_DECK_THIS_TURN':
      return cmp(ctx.ownerState.opp_cards_moved_to_deck_this_turn ?? 0, cond.operator, cond.value);
    case 'SELF_DECK_TO_ENERGY_THIS_TURN':
      return cmp(ctx.ownerState.self_deck_to_energy_this_turn ?? 0, cond.operator, cond.value);
    case 'SELECTED_COLOR':
      return (ctx.ownerState.story_overrides?.['__selected_colors__']?.split(',') ?? []).includes(cond.color);
    case 'BEAT_ZONE_COUNT':
      return cmp(ctx.ownerState.field.beat_zone?.length ?? 0, cond.operator, cond.value);
    // 🆕「あなたのチェックゾーンにあるカードがN枚以下の場合」（§5.3 `O-143`）。
    //   ⚠**`check` と `check_rest` の両方**を数える（`checkZoneCards`）＝片方だけだと原文と合わない。
    case 'CHECK_ZONE_COUNT': {
      // 🆕`filter` 指定時は**一致するカードだけ**を数える（`WX13-005B-E1`＝「チェックゾーンにスペルがある場合」）。
      const czCards = checkZoneCards(cond.owner === 'opponent' ? ctx.otherState : ctx.ownerState);
      const czCount = cond.filter
        ? czCards.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), cond.filter)).length
        : czCards.length;
      return cmp(czCount, cond.operator, cond.value);
    }
    case 'THIS_CARD_UPPED_FROM_DOWN_THIS_TURN':
      return !!ctx.sourceCardNum && (ctx.ownerState.upped_from_down_this_turn ?? []).includes(ctx.sourceCardNum);
    case 'COST_TRASHED_PUPPET':
      return ctx.ownerState.last_cost_trashed_puppet === true;
    case 'COST_DISCARDED_SIGNI_LEVEL':
      return (ctx.ownerState.last_discarded_signi_level ?? -1) === cond.level;
    case 'COST_TRASHED_MATCHES': {
      // 直前のコスト支払いでトラッシュへ送ったカードに filter 一致が1枚以上あるか（§3タスク6 C）。
      // minCount 指定時は**枚数閾値**（§6.4 O-35・続き530）＝「この方法でカードをN枚以上トラッシュに置いた場合」。
      const costMatched = (ctx.ownerState.last_cost_trashed_cards ?? [])
        .filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), cond.filter));
      const count = cond.distinctColors
        ? new Set(costMatched.flatMap(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color))).size
        : costMatched.length;
      return count >= (cond.minCount ?? 1);
    }
    case 'ENERGY_TRASH_COLOR_COUNT_GTE':
      return (ctx.ownerState.last_energy_trash_color_count ?? 0) >= cond.value;
    case 'NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN':
      return !ctx.ownerState.non_dissona_spell_played_this_turn;
    case 'DECK_TOP_SHARES_COLOR_WITH_LRIG': {
      // デッキの一番上のカードと共通する色を持つルリグ（センター＋アシスト）が場にいるか（G157）
      const ps = st(cond.owner);
      const topNum = ps.deck[0];
      if (!topNum) return false;
      const topColors = (ctx.cardMap.get(topNum)?.Color ?? '').split(/[/／、,]/).map(c => c.trim()).filter(Boolean);
      if (topColors.length === 0) return false;
      const lrigNums = [ps.field.lrig.at(-1), ps.field.assist_lrig_l?.at(-1), ps.field.assist_lrig_r?.at(-1)].filter((n): n is string => !!n);
      return lrigNums.some(ln => {
        const lc = ctx.cardMap.get(ln)?.Color ?? '';
        return topColors.some(c => lc.includes(c));
      });
    }
    case 'FIELD_SIGNI_ALL_DISTINCT_CLASS': {
      // 場のシグニが互いに共通するクラス（CardClass）を持たない場合（プライマル系。G158）
      const ps = st(cond.owner);
      const classSets = ps.field.signi
        .map(stack => stack?.at(-1))
        .filter((n): n is string => !!n)
        .map(n => new Set((ctx.cardMap.get(n)?.CardClass ?? '').split('／').map(s => s.trim()).filter(Boolean)));
      for (let i = 0; i < classSets.length; i++) {
        for (let j = i + 1; j < classSets.length; j++) {
          for (const cl of classSets[i]) if (classSets[j].has(cl)) return false;
        }
      }
      return true;
    }
    case 'FIELD_SIGNI_SHARE_CLASS': {
      // 「あなたの場に〈色〉のシグニが N 体あり、**それらが共通するクラスを持つ**場合」（`WX09` の5色サイクル）。
      // 🔑**クラスの刻み方は `splitClasses` に一本化**（「精武：アーム」＝上位「精武」＋下位「アーム」の2トークン）。
      //   公式解釈が変わってもあの1箇所を直せば全ゾーンの判定が揃う、というのがこのコードベースの規約。
      // ⚠**上の `FIELD_SIGNI_ALL_DISTINCT_CLASS` の否定ではない**＝あちらは「場の**全**シグニが互いに異クラス」。
      //   こちらは「**色で絞った**シグニが**全員で1つ以上のクラスを共有**」＝別物（§5-5e＝似た語彙を流用しない）。
      // ⚠**色が一致するシグニが `count` 未満なら false**（fail-closed）。原文は3体＝盤面全埋まりが前提で、
      //   ここを緩めると「2体しかいないのに成立」＝過剰実行に倒れる。
      const psSC = st(cond.owner);
      const nums = psSC.field.signi
        .map(stack => stack?.at(-1))
        .filter((n): n is string => !!n);
      const matched = cond.color
        ? nums.filter(n => splitColors(ctx.cardMap.get(n)?.Color).includes(cond.color!))
        : nums;
      if (matched.length < cond.count) return false;
      const classSets = matched.map(n => new Set(splitClasses(ctx.cardMap.get(n)?.CardClass)));
      if (classSets.some(set => set.size === 0)) return false;   // クラスを持たないカードが混ざれば共有できない
      const [head, ...rest] = classSets;
      for (const cl of head) if (rest.every(set => set.has(cl))) return true;
      return false;
    }
    case 'LAST_PROCESSED_COUNT_GTE': {
      const matched = (ctx.lastProcessedCards?.length ?? 0) >= cond.value;
      return cond.negate ? !matched : matched;
    }
    case 'LAST_PROCESSED_SIGNI_LEVEL_PARITY_DIFFERS_FROM_DECLARED': {
      const signi = (ctx.lastProcessedCards ?? [])
        .map(cn => ctx.cardMap.get(cn))
        .find(card => card?.Type === 'シグニ');
      const declared = ctx.ownerState.declared_number;
      if (!signi || (declared !== 0 && declared !== 1)) return false;
      const level = parseInt(signi.Level ?? '', 10);
      return Number.isFinite(level) && Math.abs(level % 2) !== declared;
    }
    case 'LAST_PROCESSED_LEVEL_SUM': {
      // 多段分岐は前枝の処理で lastProcessedCards が上書きされるため、明示退避した対象も参照できる。
      const processed = cond.source === 'stored_targets'
        ? (ctx.storedTargetCards ?? [])
        : (ctx.lastProcessedCards ?? []);
      const sum = processed.reduce((acc, cn) => {
        const c = ctx.cardMap.get(getCardNum(cn));
        if (c?.Type !== 'シグニ') return acc;
        return acc + (parseInt(c.Level ?? '0', 10) || 0);
      }, 0);
      return cmp(sum, cond.operator, cond.value);
    }
    case 'TRASHED_DISTINCT_LEVELS_GTE': {
      // この方法でトラッシュしたシグニ(lastProcessedCards)のうち、相異なるレベルが cond.count 種以上か（WX03-015）
      const processedTDL = ctx.lastProcessedCards ?? [];
      const levels = new Set<number>();
      for (const cn of processedTDL) {
        const c = ctx.cardMap.get(cn);
        if (c?.Type !== 'シグニ') continue;
        levels.add(parseInt(c.Level ?? '0', 10) || 0);
      }
      if (cond.allSameLevel) {
        const signiCount = processedTDL.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ').length;
        return signiCount > 0 && levels.size === 1;
      }
      if (cond.allSigniDistinct) {
        const signiCount = processedTDL.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ').length;
        return levels.size === signiCount;
      }
      return levels.size >= cond.count;
    }
    case 'TRASHED_STORY_COUNT_GTE': {
      // この方法でトラッシュしたシグニ(lastProcessedCards)のうち、＜story＞クラスが cond.count 体以上か（WX03-021）
      const processedTS = ctx.lastProcessedCards ?? [];
      let nTS = 0;
      for (const cn of processedTS) {
        const c = ctx.cardMap.get(cn);
        if (c?.Type !== 'シグニ') continue;
        if (c.CardClass?.includes(cond.story)) nTS++;
      }
      return nTS >= cond.count;
    }
    case 'TRASH_COUNT':
      return cmp(st(cond.owner).trash.length, cond.operator, cond.value);
    case 'LAST_PROCESSED_HAS_BURST': {
      const proc = ctx.lastProcessedCards ?? [];
      if (proc.length === 0) return false;
      const c = ctx.cardMap.get(proc[0]);
      const hasBurst = !!c?.LifeBurst
        && c.LifeBurst !== '-'
        && c.LifeBurst !== ''
        && c.LifeBurst !== '0';
      return cond.negate ? !hasBurst : hasBurst;
    }
    case 'LAST_PROCESSED_HAS_TYPE': {
      // この方法で直前に処理した（トラッシュ等）カードの中に指定Type（'スペル'等）が含まれるか（G164）
      const proc = ctx.lastProcessedCards ?? [];
      return proc.some(cn => ctx.cardMap.get(cn)?.Type === cond.cardType);
    }
    case 'LAST_PROCESSED_LEVEL_EQ_FRONT_SIGNI': {
      const processed = ctx.lastProcessedCards?.[0];
      const source = ctx.sourceCardNum;
      if (!processed || !source) return false;
      // 正面の解決は effectExecutor の resolveFrontOfSelfCardNum と同規約（発生源はスタックのトップに限る）。
      // ⚠execUtils → effectExecutor は循環 import になるため、ここでは同じ式を保つ形で揃える。
      const sourceZi = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === source);
      if (sourceZi < 0) return false;
      const front = ctx.otherState.field.signi[2 - sourceZi]?.at(-1);
      if (!front) return false;
      const processedLevel = parseInt(ctx.cardMap.get(getCardNum(processed))?.Level ?? '', 10);
      const frontLevel = parseInt(ctx.cardMap.get(getCardNum(front))?.Level ?? '', 10);
      return Number.isFinite(processedLevel) && processedLevel === frontLevel;
    }
    case 'LAST_PROCESSED_MATCHES': {
      // 直前に処理/公開/選択したカード(lastProcessedCards)のフィルタ付き件数・種類数・集合条件。
      // 旧 minCount は gte のまま互換維持し、operator/value で eq/lte 等も表す。
      const procM = ctx.lastProcessedCards ?? [];
      const centerLevel = cond.levelLteCenterLrig
        ? (() => {
            const lrig = st(cond.levelLteCenterLrig!).field.lrig.at(-1);
            if (!lrig) return undefined;
            const n = parseInt(ctx.cardMap.get(getCardNum(lrig))?.Level ?? '', 10);
            return Number.isFinite(n) ? n : undefined;
          })()
        : undefined;
      // ゾーン状態フィルタ（hasCharm/isFrozen/infected 等）が指定された場合は、直前に処理したカードを
      // 場から探してゾーン状態も照合する（「それに【チャーム】が付いている場合」WX25-P2-102/107/109。
      // matchesFilter は CardData のみで hasCharm 等を黙って無視するため、この補助照合が要る）。
      const ZONE_STATE_KEYS = ['hasCharm', 'hasAcce', 'hasSoul', 'hasUnderCards', 'hasAttachedOrUnder', 'infected', 'isDown', 'isFrozen', 'isAwakened', 'isUp', 'isArmored', 'inGateZone', 'centerZoneOnly', 'zoneSide', 'noAbilities'] as const;
      const needsZoneState = !!cond.filter && ZONE_STATE_KEYS.some(k => (cond.filter as Record<string, unknown>)[k] !== undefined);
      const matchedCards = procM.filter(cn => {
        const card = ctx.cardMap.get(getCardNum(cn));
        // noAbilities は CardData 単体ではなく場の `abilities_removed` も見るため、静的判定から外す。
        // ZONE_STATE_KEYS が findFieldZoneState を起動し、唯一の判定 hasNoAbility へ渡す。
        const cardFilter = cond.filter?.noAbilities !== undefined
          ? { ...cond.filter, noAbilities: undefined }
          : cond.filter;
        if (!matchesFilter(card, cardFilter)) return false;
        if (cond.levelLteCenterLrig) {
          if (centerLevel === undefined || card?.Type !== 'シグニ') return false;
          const level = parseInt(card.Level ?? '', 10);
          if (!Number.isFinite(level) || level > centerLevel) return false;
        }
        if (needsZoneState) {
          const loc = findFieldZoneState(cn, ctx);
          if (!loc) return false;
          if (cond.filter?.noAbilities !== undefined
              && cond.filter.noAbilities !== hasNoAbility(cn, ctx.cardMap, loc.state,
                ctx.effectsMap?.get(getCardNum(cn)))) return false;
          if (!matchesStateFilter(loc.state, loc.zoneIdx, cardFilter)) return false;
        }
        return true;
      });
      if (cond.requiredCardNames && !cond.requiredCardNames.every(name =>
        matchedCards.some(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === name))) return false;
      if (cond.requiredDistinctColors) {
        // 「1枚が青で、もう1枚が黒」などは、各色を別カードへ割り当てる必要がある。
        // 単純な色条件のANDだと青黒の多色1枚が両方を満たすため、少数集合の完全マッチングで判定する。
        const assign = (colorIndex: number, used: Set<string>): boolean => {
          if (colorIndex >= cond.requiredDistinctColors!.length) return true;
          const colorSlot = cond.requiredDistinctColors![colorIndex];
          const acceptedColors = Array.isArray(colorSlot) ? colorSlot : [colorSlot];
          for (const cn of matchedCards) {
            if (used.has(cn)) continue;
            const colors = [...(ctx.cardMap.get(getCardNum(cn))?.Color ?? '')].filter(c => '白赤青緑黒'.includes(c));
            if (!acceptedColors.some(color => colors.includes(color))) continue;
            used.add(cn);
            if (assign(colorIndex + 1, used)) return true;
            used.delete(cn);
          }
          return false;
        };
        if (!assign(0, new Set<string>())) return false;
      }
      let sharedCount: number | undefined;
      if (cond.shareClass) {
        const counts = new Map<string, number>();
        for (const cn of matchedCards) {
          const classes = new Set((ctx.cardMap.get(getCardNum(cn))?.CardClass ?? '').split(/[／/]/)
            .map(seg => seg.split(/[:：]/).pop()?.trim() ?? '').filter(cl => !!cl && cl !== '-'));
          for (const cl of classes) counts.set(cl, (counts.get(cl) ?? 0) + 1);
        }
        sharedCount = Math.max(0, ...counts.values());
      }
      if (cond.shareLevel) {
        const counts = new Map<number, number>();
        for (const cn of matchedCards) {
          const level = parseInt(ctx.cardMap.get(getCardNum(cn))?.Level ?? '', 10);
          if (Number.isFinite(level)) counts.set(level, (counts.get(level) ?? 0) + 1);
        }
        sharedCount = Math.max(0, ...counts.values());
      }
      const count = sharedCount ?? (cond.distinctName
        ? new Set(matchedCards.map(cn => ctx.cardMap.get(getCardNum(cn))?.CardName ?? getCardNum(cn))).size
        : matchedCards.length);
      return cmp(count, cond.operator ?? 'gte', cond.value ?? cond.minCount ?? 1);
    }
    case 'LAST_LOOK_TRASHED_MATCHES': {
      const count = (ctx.lastLookTrashedCards ?? [])
        .filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter)).length;
      return count >= (cond.minCount ?? 1);
    }
    case 'LAST_PROCESSED_ALL_MATCH': {
      // 直前に処理した（トラッシュ/公開）カード(lastProcessedCards)が **すべて** filter 一致か
      //（「この方法でトラッシュに置かれたカードがすべて黒の場合」WXK09-097／「すべてのカードがレベル１のシグニの場合」
      //  WXDi-P05-042）。空集合は false（1枚も処理していなければ条件不成立）。minCount 系（≥N一致）とは別意味。
      const procA = ctx.lastProcessedCards ?? [];
      if (procA.length === 0) return false;
      return procA.every(cn => matchesFilter(ctx.cardMap.get(cn), cond.filter));
    }
    case 'LAST_PROCESSED_POWER_GTE': {
      // 直前に選択/処理したシグニ(lastProcessedCards[0])のパワー判定（WX03-046「それのパワーが15000以上」）。
      // effectivePowers は直前の POWER_MODIFY 適用前のスナップショットのため、addDelta でその+パワーを加味する。
      const lp = ctx.lastProcessedCards?.[0];
      if (!lp) return false;
      const base = ctx.effectivePowers?.get(lp) ?? parseInt(ctx.cardMap.get(lp)?.Power ?? '0', 10);
      return base + (cond.addDelta ?? 0) >= cond.value;
    }
    case 'LAST_PROCESSED_POWER_LTE': {
      // 「この効果によってそれのパワーが０以下になった場合」＝**パワー減少の did-it ゲート**（§5.3 `O-166`）。
      // 🔴上の GTE と基準が違う＝あちらは `effectivePowers`（POWER_MODIFY 適用**前**）＋ `addDelta` で
      //   「これから乗る分」を手で足すが、こちらは **`temp_power_mods` に実際に積まれた分**を読む（適用**後**）。
      //   この効果自身が乗せた修整を数えたいので、後者でないと常に不成立になる。
      // ⚠`effectivePowers` は `temp_power_mods` を含まない（`BattleScreen.tsx:1020` で確認）＝二重加算しない。
      // ⚠対象が自分側か相手側かは効果によるので**両方の `temp_power_mods` を見る**（cardNum で引くので混ざらない）。
      // ⚠参照不能なら **false（fail-closed）**＝「0以下になっていない」に倒す方が過剰効果にならない。
      const lpL = ctx.lastProcessedCards?.[0];
      if (!lpL) return false;
      const baseL = ctx.effectivePowers?.get(lpL) ?? (parseInt(ctx.cardMap.get(lpL)?.Power ?? '0', 10) || 0);
      const tempL = [...(ctx.ownerState.temp_power_mods ?? []), ...(ctx.otherState.temp_power_mods ?? [])]
        .filter(m => m.cardNum === lpL)
        .reduce((sum, m) => sum + m.delta, 0);
      return baseL + tempL <= cond.value;
    }
    // ActiveCondition 側（`checkActiveCondition`）にだけ実装があり、こちらには case が無く
    // **無条件 true へフォールスルー**していた（live 使用0件の潜在穴・タスク12(cxv)）。
    case 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI': {
      // count 省略＝現在場にいる全シグニ。指定時は従来どおりの体数条件。
      // filter 指定時は「〈filter〉のシグニが count 体以上あり、その全員に共通する色が無い」（§6.4 O-11）。
      // ⚠シグニゾーンは3つなので「＜X＞が3体」は実質「ちょうど3体」＝両解釈は一致する。
      const nccAll = st(cond.owner).field.signi
        .map(stack => stack?.at(-1))
        .filter((n): n is string => !!n);
      const nccSigni = cond.filter
        ? nccAll.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), cond.filter))
        : nccAll;
      if (nccSigni.length === 0) return false;
      if (cond.count !== undefined
          && (cond.filter ? nccSigni.length < cond.count : nccSigni.length !== cond.count)) return false;
      const nccSets = nccSigni.map(n => new Set(splitColors(ctx.cardMap.get(getCardNum(n))?.Color)));
      const nccCommon = new Set(nccSets[0]);
      for (const colors of nccSets.slice(1)) for (const c of nccCommon) if (!colors.has(c)) nccCommon.delete(c);
      return nccCommon.size === 0;
    }
    // ⚠**汎用評価では素通りさせる（設計どおり）**＝「同時に何枚クラッシュされたイベントか」は
    // ExecCtx に無い情報で、実ゲートは収集時のインライン評価（`BattleScreen.tsx` の `oppCrashEventSize`）。
    // 網羅性ガードのために case を明示しておく（従来の `default: return true` と同じ挙動）。
    case 'OPP_LIFE_CRASH_EVENT_GTE': return true;
    // §6.4 O-10（続き517）＝「対戦相手が【チーム】ピースを使用する際、カットインして使用できる」。
    // ⚠**ピース使用への応答窓が engine/UI に無い**ので常に false＝この札は使えない（宣言済みの過少）。
    //   窓（`pending_piece`）が出来たらここでその state を読む。**false に倒す判断が本体**＝
    //   条件を落とすと「いつでも無条件に使えるピース」になる（続き517 以前は実際そうだった）。
    // 窓（`pending_spell.kind==='piece'`）が開いている間だけ true。窓を開くのは
    // `executeArts` のピース枝で、**応答側に使える打ち消しピースが実在するとき**に限る。
    case 'OPP_USING_TEAM_PIECE': return ctx.ownerState.team_piece_cutin_window === true;
  }
  // ⚠**網羅性ガード（タスク12(cxv)）**＝この switch を抜ける＝未実装の Condition 型がある、ということ。
  // 抜けた先は `return true`（＝無条件成立）なので、**未実装型を JSON に書くと過剰実行になるのに
  // 全ゲート緑のまま素通りする**。`Condition` に型を足したら**必ずここに case を足す**
  // ＝足し忘れは下の `never` 代入が typecheck を落として教える。
  const _condExhaustive: never = cond;
  void _condExhaustive;
  return true;
}

// ===== 使用条件チェック（BattleScreen から呼び出す） =====
export function evalUseCondition(
  condition: import('../types/effects').Condition,
  ownerState: PlayerState,
  oppState: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum: string,
  currentPhase: string,
  effectivePowers?: Map<string, number>,
  effectsMap?: Map<string, CardEffect[]>,
): boolean {
  const ctx: ExecCtx = {
    ownerState, otherState: oppState, cardMap,
    effectsMap, effectivePowers, sourceCardNum, currentPhase, logs: [],
  };
  return evalCondition(condition, ctx);
}

// ===== フィールドからカードを除去する（バニッシュ/バウンス共通） =====

export function removeFromField(cardNum: string, state: PlayerState): PlayerState {
  const zoneIdx = state.field.signi.findIndex(s => s?.at(-1) === cardNum);
  const newSigni = state.field.signi.map((stack, i) => {
    if (!stack) return null;
    if (stack[stack.length - 1] !== cardNum) return stack;
    // 血晶武装状態: 下に置かれたカードはルール処理でトラッシュへ（このゾーンを空にする）
    // 血晶武装でなくても複数枚あれば下カードをトラッシュへ（PLACE_UNDER_SIGNI等）
    if (i === zoneIdx) return null;
    return stack.length > 1 ? stack.slice(0, -1) : null;
  }) as (string[] | null)[];
  const newDown   = [...(state.field.signi_down   ?? [false, false, false])];
  const newFrozen = [...(state.field.signi_frozen  ?? [false, false, false])];
  const newCharms = [...(state.field.signi_charms  ?? [null, null, null])];
  const newAcce   = cloneAcceSlots(state.field);
  const newSoul   = [...(state.field.signi_soul    ?? [null, null, null])];
  const newArmor  = [...(state.field.signi_armor   ?? [false, false, false])];
  // §5.3 `O-81`＝**裏向きで付けられたカード**（【チャーム】ではない）。ホストが場を離れると
  // 「公開し**手札に戻す**」＝トラッシュ行きの charm/acce とは行き先が違うので別配列で持つ。
  const newFacedown = state.field.signi_facedown_attached
    ? [...state.field.signi_facedown_attached] : undefined;
  const revealedFacedown: string[] = [];
  const extraTrash: string[] = [];
  const extraLrigTrash: string[] = [];
  if (zoneIdx >= 0) {
    newDown[zoneIdx]   = false;
    newFrozen[zoneIdx] = false;
    newArmor[zoneIdx]  = false;
    if (newCharms[zoneIdx]) { extraTrash.push(newCharms[zoneIdx]!); newCharms[zoneIdx] = null; }
    if (newAcce[zoneIdx])   { extraTrash.push(...newAcce[zoneIdx]!); newAcce[zoneIdx] = null; }
    // ソウルはシグニが場を離れるとルリグトラッシュへ
    if (newSoul[zoneIdx])   { extraLrigTrash.push(newSoul[zoneIdx]!); newSoul[zoneIdx] = null; }
    // 裏向き付けカードは**公開して持ち主の手札へ**（`WX16-003-E2`「追加でこれによって付けたカードを
    // 公開し手札に戻す」）。⚠この funnel は全離脱経路（効果バニッシュ／バトル／バウンス／ルール処理）が通る。
    if (newFacedown?.[zoneIdx]?.length) { revealedFacedown.push(...newFacedown[zoneIdx]!); newFacedown[zoneIdx] = null; }
    // 血晶武装の下カード（スタックの先頭からシグニ直前まで）をトラッシュへ
    const oldStack = state.field.signi[zoneIdx] ?? [];
    if (oldStack.length > 1) {
      extraTrash.push(...oldStack.slice(0, -1));
    }
    // ウィルスはゾーンに属するため、シグニが離れても除去しない
  }
  // 場を離れたカードの card_identity_overrides エントリをクリア
  let newIdentityOverrides = state.card_identity_overrides;
  if (zoneIdx >= 0 && state.card_identity_overrides) {
    const removedCards = (state.field.signi[zoneIdx] ?? []);
    const hasEntry = removedCards.some(cn => state.card_identity_overrides![cn]);
    if (hasEntry) {
      newIdentityOverrides = { ...state.card_identity_overrides };
      for (const cn of removedCards) delete newIdentityOverrides[cn];
    }
  }
  // ドライブ状態クリーンアップ：乗られていたシグニが場を離れた場合
  let newLrigRiding = state.lrig_riding_signi;
  if (newLrigRiding?.includes(cardNum)) {
    const filtered = newLrigRiding.filter(cn => cn !== cardNum);
    newLrigRiding = filtered.length > 0 ? filtered : undefined;
  }
  return {
    ...state,
    card_identity_overrides: newIdentityOverrides,
    lrig_riding_signi: newLrigRiding,
    // 「**それがあった**シグニゾーン」の解決用マーカー（タスク12(lxxvi)・`WX08-032-E1`）。
    // 場を離れた直後にしか読まれない使い捨て（`hand_discarded_just` 等と同種）。⚠**上書き**なので
    // 複数体を続けて場から離すと最後の1ゾーンだけが残る（原文側の母集団は単体対象のみ）。
    signi_zone_vacated_just: zoneIdx >= 0 ? [zoneIdx] : state.signi_zone_vacated_just,
    // §5.3 `O-81`＝「いま起きた離脱で公開されたもの」だけを指す使い捨てマーカー。⚠**毎回 set/クリアする**
    // （残すと次の無関係な離脱で `FACEDOWN_REVEALED_JUST` watcher が再発火する）。
    facedown_revealed_just: revealedFacedown.length > 0 ? revealedFacedown : undefined,
    hand: revealedFacedown.length > 0 ? [...state.hand, ...revealedFacedown] : state.hand,
    trash: extraTrash.length > 0 ? [...state.trash, ...extraTrash] : state.trash,
    lrig_trash: extraLrigTrash.length > 0 ? [...state.lrig_trash, ...extraLrigTrash] : state.lrig_trash,
    field: {
      ...state.field,
      signi: newSigni,
      signi_down:   newDown   as boolean[],
      signi_frozen: newFrozen as boolean[],
      signi_charms: newCharms,
      signi_acce:   newAcce,
      signi_soul:   newSoul   as (string | null)[],
      signi_armor:  newArmor  as boolean[],
      ...(newFacedown ? { signi_facedown_attached: newFacedown } : {}),
    },
  };
}

/** 遅延除外マークを、場を離れた直後またはターン終了時に専用ゾーンへ移す。 */
export function resolvePendingExiles(state: PlayerState, forceTurnEnd = false): PlayerState {
  const pending = state.pending_exile_nums ?? [];
  if (pending.length === 0) return state;
  let next = state;
  const remaining: string[] = [];
  for (const num of pending) {
    const onField = next.field.signi.some(stack => stack?.includes(num));
    if (onField && !forceTurnEnd) { remaining.push(num); continue; }
    if (onField) {
      next = removeFromField(num, next);
    } else {
      // 同名カードの別コピー（エナ・デッキ等）を巻き込まないよう、最初の1枚だけ取り除く
      for (const zone of ['deck', 'hand', 'trash', 'energy', 'life_cloth', 'lrig_deck', 'lrig_trash'] as const) {
        const idx = next[zone].indexOf(num);
        if (idx >= 0) {
          const arr = [...next[zone]]; arr.splice(idx, 1);
          next = { ...next, [zone]: arr };
          break;
        }
      }
    }
    next = { ...next, excluded: [...(next.excluded ?? []), num] };
  }
  return { ...next, pending_exile_nums: remaining.length ? remaining : undefined };
}

// SELECT_TARGET ヘルパー：候補数によって自動実行か要インタラクションかを決める
export function selectOrInteract(
  candidates: string[],
  count: number,
  optional: boolean,
  scope: TargetScope,
  thenAction: EffectAction,
  continuation: EffectAction | undefined,
  ctx: ExecCtx,
  opponentResponds = false,
  extra?: { totalPowerMax?: number; candidatePowers?: Record<string, number>; totalLevelMax?: number; candidateLevels?: Record<string, number>; selectionConstraint?: SelectionConstraint },
): ExecResult {
  // 動的な合計制約は pending を作る前に固定値へ解決する。これにより field/trash/hand の
  // どの選択経路でも UI・CPU・resume が同じ SelectionConstraint を検証する。
  const rawConstraint = extra?.selectionConstraint;
  let resolvedExtra = extra;
  // 🆕`levelMultisetFromLastProcessed`＝「この方法で捨てたシグニ1枚につき**そのシグニと同じレベルの**〜」。
  //   pending を作る前に**具体的なレベルの並び**へ焼き込む（UI・CPU・resume が同じ制約を検証できる）。
  if (rawConstraint?.levelMultisetFromLastProcessed) {
    const { levelMultisetFromLastProcessed: _lm, ...staticLM } = rawConstraint;
    const levels = (ctx.lastProcessedCards ?? [])
      .map(cn => parseInt(ctx.cardMap.get(getCardNum(cn))?.Level ?? '', 10))
      .filter(n => Number.isFinite(n));
    resolvedExtra = { ...extra, selectionConstraint: { ...staticLM, levelMultiset: levels } };
  }
  const rawConstraint2 = resolvedExtra?.selectionConstraint;
  if (rawConstraint2?.totalLevelExactRef !== undefined || rawConstraint2?.totalLevelMaxRef !== undefined
      || rawConstraint2?.totalPowerMaxRef !== undefined) {
    const { totalLevelExactRef, totalLevelMaxRef, totalPowerMaxRef, ...staticConstraint } = rawConstraint2;
    const selectionConstraint: SelectionConstraint = {
      ...staticConstraint,
      ...(totalLevelExactRef !== undefined ? { totalLevelExact: resolveCountRef(totalLevelExactRef, ctx) } : {}),
      ...(totalLevelMaxRef !== undefined ? { totalLevelMax: resolveCountRef(totalLevelMaxRef, ctx) } : {}),
      // 🆕§5.3 `O-212`＝「パワーの合計が**このシグニのパワー**以下になるように」。
      ...(totalPowerMaxRef !== undefined ? { totalPowerMax: resolveCountRef(totalPowerMaxRef, ctx) } : {}),
    };
    resolvedExtra = { ...resolvedExtra, selectionConstraint };
  }
  // シャドウ：相手フィールドを対象とする効果からシャドウ持ちシグニを除外
  // both_field（owner:'any'）でも相手側の候補にはシャドウを適用する（自分側候補は対象外）
  let filteredCands = candidates;
  if (scope === 'opp_field' || scope === 'both_field') {
    // sourceCardNumがルリグの場合はシャドウ(ルリグ)も除外
    const sourceIsLrig = ctx.sourceCardNum
      ? ctx.cardMap.get(ctx.sourceCardNum)?.Type === 'ルリグ'
      : false;
    const sourceCardForShadow = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    filteredCands = candidates.filter(n => {
      // both_field: 相手フィールドにあるシグニのみシャドウ判定（自分のシグニは常に選択可）
      if (scope === 'both_field' && !ctx.otherState.field.signi.some(s => s?.at(-1) === n)) return true;
      if (sourceIsLrig && hasShadowLrig(n, ctx.cardMap, ctx.otherState.keyword_grants, ctx.otherState.keyword_grants_until_opp_turn)) return false;
      // シャドウ（スコープなし＝無条件、スコープ付き＝発生源カードの属性で判定。activeCondition無しのもの）
      const scopes = getShadowScopes(
        n, ctx.cardMap, ctx.otherState.keyword_grants, ctx.otherState.bonds,
        ctx.otherState.keyword_grants_until_opp_turn,
        activeFieldGrantKeywordsForSigni(ctx.otherState, ctx.ownerState, n, ctx.cardMap),
      );
      if (scopes.some(scope => evaluateShadowScope(scope, sourceCardForShadow, n, ctx.otherState, ctx.cardMap))) return false;
      // 場全体への継続シャドウ付与（GRANT_FIELD_SHADOW・同ゾーンゲート等）も評価
      const fieldScopes = getFieldGrantedShadowScopes(n, ctx.otherState, ctx.cardMap);
      if (fieldScopes.some(scope => evaluateShadowScope(scope, sourceCardForShadow, n, ctx.otherState, ctx.cardMap))) return false;
      // activeCondition 付きシャドウ（TURN_OWNER等）を評価:
      // n は ctx.otherState のシグニ。ownerState=otherState, isOwnerTurn=false（ctx.ownerState のターン中に効果実行）
      // 🆕**付与ストア（`granted_effects*`）も走査軸に入れる**（§6.4 O-25(d)・2026-08-17）＝
      //   引用付与「【常】：対戦相手のターンの間、【シャドウ】を得る」（`WXDi-P06-032-E2`／`WXDi-P13-044-E2`）は
      //   条件を持つため `keyword_grants`（条件を持てない）ではなく `granted_effects` へ入る。
      //   ⚠**この行を足さないと「常時シャドウ（過剰）」が「シャドウが一切効かない（過少）」へ裏返る**
      //     ＝条件を付けた瞬間に走査軸から外れる。印字能力とまったく同じ規則で評価する。
      const condShadowSources = [
        ...(ctx.cardMap.get(n)?.effects ?? []),
        ...(ctx.otherState.granted_effects?.[n] ?? []),
        ...(ctx.otherState.granted_effects_until_opp_turn?.[n] ?? []),
      ];
      const hasCondShadow = condShadowSources.some(eff => {
        if (eff.effectType !== 'CONTINUOUS' || !eff.activeCondition) return false;
        if (eff.action.type !== 'GRANT_KEYWORD') return false;
        const scope = decodeShadowKeyword((eff.action as { keyword: string }).keyword);
        if (scope === null) return false;
        if (!checkActiveCondition(eff.activeCondition, ctx.otherState, ctx.ownerState, false, ctx.cardMap, n, ctx.effectivePowers)) return false;
        return evaluateShadowScope(scope, sourceCardForShadow, n, ctx.otherState, ctx.cardMap);
      });
      if (hasCondShadow) return false;
      return true;
    });
  }
  // 候補0件＝このステップは何も処理しなかった。lastProcessedCards を空に倒して「空振り」を記録する
  // （従来は done(ctx) で**直前ステップの残留値をそのまま持ち越して**いたため、後続の
  //  CONDITIONAL{IS_MY_TURN}＝「そうした場合」ゲートがすり抜けて過剰発火していた＝タスク12(xxix)③）。
  if (filteredCands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
  // exact 合計制約は、成立する組み合わせが無い盤面で選択UIを出すと決定不能になる。
  // optional（「まで／好きな枚数」）でも exact>0 は0枚を成立扱いにせず、空処理へ fail-closed。
  if (resolvedExtra?.selectionConstraint?.totalLevelExact !== undefined
      && findValidConstrainedSelection(filteredCands, optional ? 0 : count, count,
        resolvedExtra.selectionConstraint, ctx.cardMap) === null) {
    return done({ ...ctx, lastProcessedCards: [] });
  }
  return needsInteraction(ctx, {
    type: 'SELECT_TARGET',
    candidates: filteredCands,
    count,
    optional,
    targetScope: scope,
    thenAction,
    continuation,
    ...(opponentResponds ? { opponentResponds: true } : {}),
    ...(resolvedExtra?.totalPowerMax !== undefined ? { totalPowerMax: resolvedExtra.totalPowerMax } : {}),
    ...(resolvedExtra?.candidatePowers ? { candidatePowers: resolvedExtra.candidatePowers } : {}),
    ...(resolvedExtra?.totalLevelMax !== undefined ? { totalLevelMax: resolvedExtra.totalLevelMax } : {}),
    ...(resolvedExtra?.candidateLevels ? { candidateLevels: resolvedExtra.candidateLevels } : {}),
    ...(resolvedExtra?.selectionConstraint ? { selectionConstraint: resolvedExtra.selectionConstraint } : {}),
  });
}

/**
 * カードの「コストの合計」＝`Cost` 列の `《色×N》`（`×N` 省略時は1）の総和。
 * 原文の注記どおり「カードの左上のエナコストの数字の合計」。読めなければ null（fail-closed の材料）。
 */
function costSumOf(cost: string | undefined): number | null {
  const raw = `${cost ?? ''}`.trim();
  if (!raw || raw === '-') return null;
  let sum = 0;
  let seen = false;
  for (const m of raw.matchAll(/《([^》]+)》(?:×([０-９\d]+))?/g)) {
    if (!'白赤青緑黒無'.includes(m[1])) continue;
    seen = true;
    sum += m[2] ? parseInt(m[2].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10) : 1;
  }
  return seen ? sum : null;
}

function cardClasses(card: CardData | undefined): Set<string> {
  return new Set((card?.CardClass ?? '').split(/[：:／/・,\s]+/).map((s: string) => s.trim()).filter(Boolean));
}

function cardColors(card: CardData | undefined): Set<string> {
  const raw = `${card?.Color ?? ''}`;
  return new Set(raw.split(/[・／/,\s]+/).map(s => s.trim()).filter(s => s && s !== '無' && s !== '無色'));
}

/**
 * 選択カードを groups の容量へ1枚ずつ割り当てられるか。
 * 1枚が複数 filter に一致する場合があるため、先頭一致の貪欲法ではなく小規模バックトラックで判定する。
 */
function canAssignSelectionGroups(
  nums: string[],
  groups: NonNullable<SelectionConstraint['groups']>,
  cardMap: Map<string, CardData>,
): boolean {
  if (nums.length === 0) return true;
  if (groups.length === 0 || nums.length > groups.reduce((sum, group) => sum + group.count, 0)) return false;
  const remaining = groups.map(group => group.count);
  const candidates = nums.map(num => groups
    .map((group, index) => ({ group, index }))
    .filter(({ group }) => matchesFilter(cardMap.get(getCardNum(num)), group.filter))
    .map(({ index }) => index));
  if (candidates.some(indices => indices.length === 0)) return false;
  // 制約の強いカードから割り当てると分岐数を抑えられる。
  candidates.sort((a, b) => a.length - b.length);
  const assign = (cardIndex: number): boolean => {
    if (cardIndex >= candidates.length) return true;
    for (const groupIndex of candidates[cardIndex]) {
      if (remaining[groupIndex] <= 0) continue;
      remaining[groupIndex]--;
      if (assign(cardIndex + 1)) return true;
      remaining[groupIndex]++;
    }
    return false;
  };
  return assign(0);
}

export function satisfiesSelectionConstraint(
  nums: string[],
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!constraint) return true;
  const cards = nums.map(n => cardMap.get(getCardNum(n)));
  const levelSum = (): number => cards.reduce((sum, card) => {
    const level = parseInt(card?.Level ?? '', 10);
    return sum + (Number.isFinite(level) ? level : 0);
  }, 0);
  if (constraint.totalLevelExact !== undefined && levelSum() !== constraint.totalLevelExact) return false;
  if (constraint.totalLevelMax !== undefined && levelSum() > constraint.totalLevelMax) return false;
  // 🆕§5.3 `O-212`＝パワー合計の上限／一致。⚠印刷パワーで数え、**パワー不明は不成立**（fail-closed）。
  if (constraint.totalPowerMax !== undefined || constraint.totalPowerExact !== undefined) {
    let powerSum = 0;
    for (const card of cards) {
      const power = parseInt(card?.Power ?? '', 10);
      if (!Number.isFinite(power)) return false;
      powerSum += power;
    }
    if (constraint.totalPowerMax !== undefined && powerSum > constraint.totalPowerMax) return false;
    if (constraint.totalPowerExact !== undefined && powerSum !== constraint.totalPowerExact) return false;
  }
  if (constraint.groups && !canAssignSelectionGroups(nums, constraint.groups, cardMap)) return false;
  // 🆕`levelMultiset`＝選んだ集合のレベルを**1対1で**参照リストへ割り当てられること（2026-08-31 続き749）。
  //   ⚠「どれかに一致」ではない＝同じレベルを重複して取れないので、まとめてN体の過剰実行にならない。
  //   ⚠レベル不明は不成立（fail-closed）。空選択は常に成立（0体は原文どおり許す形がある）。
  if (constraint.levelMultiset !== undefined) {
    const pool = [...constraint.levelMultiset];
    for (const card of cards) {
      const lv = parseInt(card?.Level ?? '', 10);
      if (!Number.isFinite(lv)) return false;
      const at = pool.indexOf(lv);
      if (at < 0) return false;
      pool.splice(at, 1);
    }
  }
  if (nums.length < 2) return true;
  if (constraint.same === 'name') {
    const values = cards.map(c => `${c?.CardName ?? ''}`);
    if (new Set(values).size !== 1) return false;
  }
  // 🆕`same:'level'`＝「それぞれ**同じ**レベルの」（2026-08-27・Sheet1 B11）。
  // ⚠**レベル不明（`Level` が数値でない）は不成立**にする＝fail-closed（曖昧なまま通すと
  //   「同じレベル」条件が実質消えて過剰実行に倒れる）。
  if (constraint.same === 'level') {
    const values = cards.map(c => `${c?.Level ?? ''}`);
    if (values.some(v => !/^\d+$/.test(v))) return false;
    if (new Set(values).size !== 1) return false;
  }
  // 🆕`same:'power'`＝「同じパワーを持つシグニN体」。⚠印刷パワーで比較する近似（型定義のコメント参照）＝
  //   パワー不明（`Power` が数値でない）は**不成立**へ倒す（fail-closed）。
  if (constraint.same === 'power') {
    const values = cards.map(c => `${c?.Power ?? ''}`);
    if (values.some(v => !/^\d+$/.test(v))) return false;
    if (new Set(values).size !== 1) return false;
  }
  if (constraint.distinct === 'level') {
    const values = cards.map(c => `${c?.Level ?? ''}`);
    if (new Set(values).size !== values.length) return false;
  } else if (constraint.distinct === 'name') {
    const values = cards.map(c => `${c?.CardName ?? ''}`);
    if (new Set(values).size !== values.length) return false;
  } else if (constraint.distinct === 'costSum') {
    // 🆕「それぞれ**コストの合計が異なる**スペルN枚」（`WX21-046-E1`）。
    //   コストの合計＝`Cost` 列の `《色×N》`（`×N` 省略時は1）の総和。
    //   🔴読めない札（`Cost` が空/`-`）は**不成立**へ倒す（fail-closed）＝制約を素通りさせない。
    const sums = cards.map(c => costSumOf(c?.Cost));
    if (sums.some(v => v === null)) return false;
    if (new Set(sums).size !== sums.length) return false;
  } else if (constraint.distinct === 'class') {
    const sets = cards.map(cardClasses);
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
      if ([...sets[i]].some(v => sets[j].has(v))) return false;
    }
  }
  const colors = cards.map(cardColors);
  if (constraint.sharedColor === 'all') {
    if (colors.length > 0 && ![...colors[0]].some(v => colors.every(s => s.has(v)))) return false;
  } else if (constraint.sharedColor === 'none') {
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
      if ([...colors[i]].some(v => colors[j].has(v))) return false;
    }
  }
  return true;
}

/**
 * この対話に応答する（＝UIをクリックする）のは**効果オーナーの対戦相手**か。§6.4 O-2。
 *
 * ⚠従来 `BattleScreen` は `SELECT_TARGET` と `CHOOSE` の2つだけを直接見ており、
 *   **`SEARCH` を相手へ回す経路が無かった**（「対戦相手はデッキの上からN枚公開し、その中から選ぶ」が
 *   defer されていた根本原因）。判定を1箇所に集約して、対応 pending 型を増やしたときに
 *   **配線し忘れ（＝黙って効果オーナーが相手の代わりに選ぶ）**が起きないようにする。
 * ⚠これは「誰がクリックするか」だけを決める＝engine の ExecCtx 視点は反転しない（続き411 の教訓）。
 *   誰のデッキ／誰の場かは各 pending の `deckOwner` / `owner` が持つ。
 */
export function pendingRespondsOpponent(p: PendingInteractionDef | null | undefined): boolean {
  if (!p) return false;
  switch (p.type) {
    case 'SELECT_TARGET':
    case 'CHOOSE':
    case 'SEARCH':
    case 'SELECT_SIGNI_ZONE':
      return p.opponentResponds === true;
    default:
      return false;
  }
}

export function canAddToSelection(
  selected: string[],
  candidate: string,
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!constraint) return true;
  const next = [...selected, candidate];
  // 🆕`totalPowerExact` も「積み上げの途中」は超過だけを弾く（一致は確定時に
  //    `satisfiesSelectionConstraint` が要求する）＝`totalLevelExact` と同じ規約（§5.3 `O-212`）。
  const { totalLevelExact, totalLevelMax, totalPowerExact, totalPowerMax, ...setConstraint } = constraint;
  if (!satisfiesSelectionConstraint(next, setConstraint, cardMap)) return false;
  const sum = next.reduce((total, n) => {
    const level = parseInt(cardMap.get(getCardNum(n))?.Level ?? '', 10);
    return total + (Number.isFinite(level) ? level : 0);
  }, 0);
  if (totalLevelExact !== undefined && sum > totalLevelExact) return false;
  if (totalLevelMax !== undefined && sum > totalLevelMax) return false;
  if (totalPowerExact !== undefined || totalPowerMax !== undefined) {
    let powerSum = 0;
    for (const n of next) {
      const power = parseInt(cardMap.get(getCardNum(n))?.Power ?? '', 10);
      if (!Number.isFinite(power)) return false;
      powerSum += power;
    }
    if (totalPowerExact !== undefined && powerSum > totalPowerExact) return false;
    if (totalPowerMax !== undefined && powerSum > totalPowerMax) return false;
  }
  return true;
}

/**
 * カードの EffectText から【ライズ】条件フィルターを取得する。
 * ライズカードでない場合は null を返す。
 */
export function getRiseFilter(effectText: string): TargetFilter | null {
  // 🔴**終端は「（この条件」だけではない**（2026-08-29・§5.1 `V-89` の切り分けで発見）。
  //   旧実装は `/【ライズ】(.+?)（この条件/` ＝**「（この条件を満たさない場合…）」を書いている新しめのカードにしか
  //   当たらず、41枚中31枚で null を返していた**＝**ライズ条件がまったく効かず、空きシグニゾーンへ
  //   普通に召喚できていた**（下にカードが1枚も無いので「このシグニの下から〜」のコスト・パワー参照も死ぬ）。
  //   ⇒ 終端を「（この条件」か**次の能力マーカー `【`** か**文末**にした。
  const m = effectText.match(/【ライズ】(.+?)(?=（この条件|【|$)/s);
  if (!m) return null;
  const cond = m[1];

  // 🔴**複数体ライズ（2体以上／トラッシュ・エナから重ねる）はここでは受けない**＝
  //   「赤のシグニ**２体**の上に置く（どちらかのシグニがあるシグニゾーンに出す）」は
  //   **2体を消費して1ゾーンへ積む**機構で、`matchesRiseFilter`（1ゾーンのトップ1枚を見る）では表せない。
  //   1体ぶんだけ通すと**「半分だけ実装した嘘」**になるので null のまま（＝現状維持）にして、
  //   機構は §5.3 `O-147` に登録した。⚠**該当13枚は依然ライズ条件が効かない**（既知の穴）。
  if (/[２-９2-9]体|[２-９2-9]枚|重ね/.test(cond)) return null;
  // 「《A》１体と《B》１体と《C》１体の上に置く」（`WX20-038`）も複数体ライズ＝「体」が2回以上出たら除外。
  if ((cond.match(/体/g) ?? []).length >= 2) return null;

  const filter: TargetFilter = { cardType: 'シグニ' };

  // ＜クラス＞フィルター
  const classM = cond.match(/＜([^＞]+)＞/);
  if (classM) filter.story = classM[1];

  // 《ディソナアイコン》→ CSVの Story==='Dissona'（filter.story は CardClass 照合なのでここでは使えない）
  if (cond.includes('《ディソナアイコン》')) filter.isDisona = true;

  // 色フィルター（「赤の」「青の」等）。
  // ⚠**「あなたの」直後に限定しない**＝「あなたの**レベル２以下の**赤のシグニ１体の上に置く」（`WX15-041` ほか）で
  //   色が落ちて**どの色のシグニにも乗れる**過剰許可になっていた（2026-08-29・`V-89` の切り分けで発見）。
  const colorM = cond.match(/(白|赤|青|緑|黒)の(?:シグニ|＜)/);
  if (colorM) filter.color = colorM[1];

  // レベルフィルター（「レベルN以上の」／🆕「レベルN以下の」／🆕「レベルNの」）。
  // ⚠旧実装は**「以上」だけ**だった＝実データの主流である「レベル２以下の」「レベル１の」が全部落ちて
  //   **レベル無制限**になっていた（`WX15-041`/`WX15-073`/`WX16-038`/`WX16-059`/`WX17-055`/`WX18-061`/
  //   `WX21-Re05`/`WXEX2-61` の8枚）。
  const toHW = (v: string) => v.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const lvGe = cond.match(/レベル([０-９\d])以上/);
  const lvLe = cond.match(/レベル([０-９\d])以下/);
  const lvEq = cond.match(/レベル([０-９\d])の/);
  if (lvGe) filter.level = { min: parseInt(toHW(lvGe[1])) };
  else if (lvLe) filter.level = { max: parseInt(toHW(lvLe[1])) };
  else if (lvEq) { const n = parseInt(toHW(lvEq[1])); filter.level = { min: n, max: n }; }

  // カード名指定（`WXK09-060`＝「あなたの《楽隊の童話　ロバン》１体の上に置く」）。
  // ⚠**《…アイコン》はカード名ではない**（《ライズアイコン》《ディソナアイコン》＝上で別扱い）ので除外する。
  const nameM = cond.match(/《([^》]{3,})》/);
  if (nameM && !nameM[1].endsWith('アイコン')) filter.cardName = nameM[1];

  // 《ライズアイコン》を持つ → hasRiseIcon フラグ（matchesFilter拡張なしでは使えないので特殊扱い）
  if (cond.includes('《ライズアイコン》')) {
    // 特別フラグ: matchesFilter では処理不可→呼び出し側でカードテキストを直接確認する必要あり
    // filter.__hasRiseIcon = true; ← 拡張不可なのでstoryに特殊値を入れる
    (filter as Record<string, unknown>).__requiresRiseIcon = true;
  }

  return filter;
}

/**
 * ライズ条件フィルターに対して既存シグニがRISE配置先として有効かチェック。
 */
export function matchesRiseFilter(
  existingCardNum: string,
  filter: TargetFilter,
  cardMap: Map<string, CardData>,
): boolean {
  const card = cardMap.get(existingCardNum);
  if (!card) return false;
  // 《ライズアイコン》 → EffectText に【ライズ】があるか確認
  if ((filter as Record<string, unknown>).__requiresRiseIcon) {
    return !!(card.EffectText?.includes('【ライズ】'));
  }
  return matchesFilter(card, filter);
}
