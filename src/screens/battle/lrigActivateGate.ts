import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { isKizunaActive } from '../../engine/effectEngine';
import { evalUseCondition, getCardNum } from '../../engine/effectExecutor';
import { collectCenterLrigActivatedEffects } from './battleUtils';
import { payLrigDownCost, payLrigDownSelfCost } from './lrigDownCost';

/**
 * センタールリグの【起】が**いま撃てるか**（提示の可否）を1か所で判定する純関数（§8／§6.4 `O-1` (c)）。
 *
 * ⚠**必ず人間のボタン生成と CPU の候補フィルタの両方から同じ関数を呼ぶこと**
 * （`signiActivateGate.ts` / `artsUseGate.ts` と同じ規律）。
 *
 * ⚠**対象はセンタールリグ本来の【起】だけ**＝付与（`GRANT_LRIG_ABILITY`）／ルリグトラッシュからの継承
 * （`INHERIT_LRIG_TRASH_ABILITIES`）は**別の収集源**なので、呼び出し元がそれぞれ足す
 * （CPU は v1 では使わない）。
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
  const { my, op, phase, effectsMap, cardMap } = p;
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
  // lrigDown: アップ状態のルリグ（level 条件つき）が必要数いないと払えない（タスク12(cviii)）。
  if (eff.cost?.lrigDown && payLrigDownCost(my, eff.cost.lrigDown, cardMap) === null) return false;
  // 【起】《ダウン》＝このルリグが既にダウンしていると払えない（タスク12(cxxxi)）。
  if (eff.cost?.down_self && payLrigDownSelfCost(my) === null) return false;
  // SONG_FRAGMENT: エナゾーンに【歌のカケラ】がある場合のみ撃てる。
  const act = eff.action as StubAction;
  if (act?.type === 'STUB' && act.id === 'SONG_FRAGMENT'
    && !my.energy.some(cn => cardMap.get(getCardNum(cn))?.EffectText?.includes('【歌のカケラ】'))) return false;
  if (eff.condition && !evalUseCondition(eff.condition, my, op, cardMap, sourceCardNum, phase, p.effectivePowers)) return false;
  return true;
}

/** センタールリグ本来の【起】のうち、**いま撃てる**もの（効果の並びは定義順）。 */
export function listActivatableLrigEffects(p: LrigActivateGateInput): CardEffect[] {
  const lrigTop = p.my.field.lrig.at(-1);
  if (!lrigTop) return [];
  return collectCenterLrigActivatedEffects(p.my, p.effectsMap, p.phase)
    .filter(eff => canActivateLrigEffect(eff, p, lrigTop));
}
