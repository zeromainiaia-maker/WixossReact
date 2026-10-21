import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import { evalUseCondition, getCardNum } from '../../engine/effectExecutor';
import { keyActivatedTimingMatchesPhase } from './battleUtils';
import { matchesTrashArtsFromLrigDeckCost } from './artsTrashCost';
import { canPayAttachedOrUnderTrash } from './attachedOrUnderCost';
import { effectiveCoinCost } from './lrigActivateGate';

/**
 * 🆕2026-10-21＝**キーの【起】がいま撃てるか**（提示の可否）を1か所で判定する純関数。
 *
 * ⚠**人間のボタン生成（`BattleScreen` の `getKeyPieceActions`）と CPU の候補（`cpuTurn` の `tryCpuKeyActivated`）の
 *   両方から同じ関数を呼ぶ**（`lrigActivateGate.ts` / `signiActivateGate.ts` と同じ規律）。
 * 🔴**旧＝判定は `BattleScreen` に手書きで、CPU にはキーの【起】を撃つ経路そのものが無かった**
 *   （自己対戦の被覆でキーの【起】69効果が1度も発動していなかった）。しかも画面側の判定は
 *   **《コインアイコン》の所持枚数を見ておらず、実行側も払っていなかった**＝コイン0枚でも何度でも撃てた
 *   （`WXK10-006-E2`「《コインアイコン》：対戦相手のシグニ１体を…デッキに加えてシャッフルする」は回数制限も無い）。
 */
export interface KeyActivateGateInput {
  my: PlayerState;
  op: PlayerState;
  /** いまのフェイズ（人間は MAIN／アタックフェイズの各ステップ）。 */
  phase: TurnPhase;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  /** `calcContinuousBlockedActions(my, ...).forSelf`。 */
  blockedSelf: Set<string>;
  effectivePowers?: Map<string, number>;
}

/** 場のキー（主の枠＋追加の枠）。 */
export function fieldKeyNums(my: PlayerState): string[] {
  return [my.field.key_piece, ...(my.field.key_piece_extra ?? [])].filter((n): n is string => !!n);
}

const ACTIVATABLE_PHASES: readonly string[] = ['MAIN', 'ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'];

/** キーの【起】1効果がいま撃てるか。 */
export function canActivateKeyEffect(eff: CardEffect, p: KeyActivateGateInput, keyNum: string): boolean {
  const { my, op, phase, cardMap } = p;
  if (eff.effectType !== 'ACTIVATED') return false;
  // 🔴`costUnparsed`＝原文のコストを表現できなかった印（§6.4 O-11）。提示すると踏み倒しになる。
  if (eff.costUnparsed) return false;
  if (!ACTIVATABLE_PHASES.includes(phase)) return false;
  // timing↔phase 照合（(li)）＝MAIN専用はメインのみ／《アタックフェイズアイコン》専用はアタックフェイズのみ。
  if (!keyActivatedTimingMatchesPhase(eff.timing, phase)) return false;
  const isActionBlocked = (id: string) => (my.blocked_actions?.some(a => a === id) ?? false) || p.blockedSelf.has(id);
  if (isActionBlocked('USE_ACT')) return false;
  if (my.blocked_actions?.includes(eff.effectId)) return false;
  if (eff.usageLimit === 'once_per_turn' && (my.actions_done ?? []).includes(eff.effectId)) return false;
  if (eff.usageLimit === 'twice_per_turn' && (my.actions_done ?? []).filter(id => id === eff.effectId).length >= 2) return false;
  if (eff.usageLimit === 'once_per_game' && (my.game_actions_done ?? []).includes(eff.effectId)) return false;
  const cost = eff.cost;
  // 《コインアイコン》＝所持枚数が足りないと払えない（`performKeyActivated` が同じ関数で deduct する）。
  if (effectiveCoinCost(eff, my) > (my.coins ?? 0)) return false;
  // ルリグデッキ除外（`exileLrigFromLrigDeck`・§6.4 O-11）。
  const exile = cost?.exileLrigFromLrigDeck;
  if (exile) {
    const n = my.lrig_deck.filter(num => {
      const card = cardMap.get(getCardNum(num));
      if (!card) return false;
      if (!exile.story) return true;
      return (card.CardClass ?? '').split(/[/／]/).map(x => x.trim()).includes(exile.story);
    }).length;
    if (n < exile.count) return false;
  }
  // ルリグデッキのアーツ徴収（§5.3 `O-68`②）。
  const arts = cost?.trashArtsFromLrigDeck;
  if (arts && my.lrig_deck.filter(num => matchesTrashArtsFromLrigDeckCost(cardMap.get(getCardNum(num)), arts)).length < arts.count) return false;
  // 手札を捨てる。
  if ((cost?.discard ?? 0) > my.hand.length) return false;
  // 「シグニに付いているカード1枚か下にあるカード1枚をトラッシュに置く」（§5.3 `O-313`・`WXK10-018-E2`）。
  if (cost?.attachedOrUnderTrash && !canPayAttachedOrUnderTrash(my, cost.attachedOrUnderTrash.count)) return false;
  if (eff.condition && !evalUseCondition(eff.condition, my, op, cardMap, keyNum, phase, p.effectivePowers)) return false;
  return true;
}

/** いま撃てるキーの【起】を全部（キーの並び順 → 効果定義順）。 */
export function listActivatableKeyEffects(p: KeyActivateGateInput): { keyNum: string; effect: CardEffect }[] {
  return fieldKeyNums(p.my).flatMap(keyNum =>
    (p.effectsMap.get(keyNum) ?? [])
      .filter(eff => canActivateKeyEffect(eff, p, keyNum))
      .map(effect => ({ keyNum, effect })));
}
