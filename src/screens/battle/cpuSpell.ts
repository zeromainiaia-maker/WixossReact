import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import type { ArtsPayerCtx } from './artsUseGate';
import { selectEnergyIndicesForCost } from './cpuActivate';
import { defensiveKindOf, hasBlockedAttacker, hasCpuUnsupportedAction } from './cpuArts';
import { energyPoolCardNums } from './energyPaySource';
import { type SpellUseCheck, listCastableSpells } from './spellUseGate';

/**
 * CPU が**メインフェイズに手札のスペルを使う**ための選択ロジック（§8／§6.4 `O-1` (b)）。
 *
 * ■ 設計（`cpuArts.ts` と同じ規律）
 *   - **「発動できるか」の判定は `spellUseGate.checkSpellUse`（人間のボタン生成と同じ関数）**。
 *     ここは「発動できるもののうち **CPU が使うべき1枚**を選ぶ」だけを担う。
 *   - 実行は `performSpell`（人間のスペル使用と同じ関数）。**CPU 専用の実行経路は作らない**。
 *
 * ■ v1 の意図的な限界（honest defer）
 *   - **除去スペルだけ**（`cpuArts.defensiveKindOf` の `'removal'`）＝目的は「アタックを通す」の1点。
 *     ドロー・エナチャージ・サーチ・強化は**盤面評価が要る**ので使わない（撃たない＝現状と同じ安全側）。
 *   - **正面が塞がれているときだけ**（`hasBlockedAttacker`）＝相手の場が空なら除去は無価値。
 *   - **任意支払い（手札を捨ててのコスト置換・使用時の任意支払い）は宣言しない**＝
 *     `checkSpellUse.effectiveCost`（基本コスト）がそのまま請求額になる。⚠だから CPU 側は
 *     `usable` だけでなく **`affordable` も見る**（`listCastableSpells` が両方で絞っている）。
 *   - **ベットも宣言しない**。
 */

export interface CpuSpellChoice {
  card: CardData;
  /** `performSpell` に渡す手札 index。 */
  handIndex: number;
  check: SpellUseCheck;
  /** `performSpell` に渡すエナ pool index。 */
  costIndices: Set<number>;
}

/**
 * CPU がいま使うスペルを1枚選ぶ（無ければ `null`）。**1回の呼び出しで1枚だけ**＝
 * 実行後は `pending_spell`（人間のカットイン応答）の解決を待って CPU ループが再入する。
 */
export function pickCpuMainSpell(p: {
  actor: PlayerState;
  opponent: PlayerState;
  cards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  turnPhase: TurnPhase;
  /** スペル解決待ちの窓が開いていないか（開いていれば新しいスペルは使えない）。 */
  pendingSpell: boolean;
  /** このターン CPU が既に使ったアーツ／スペルの CardNum（同じ札を選び直さない安全弁）。 */
  alreadyUsedNums: readonly string[];
  /** 可否の権威＝人間の支払いUIと同じ `canAffordWithExtraCost`。 */
  isAffordable: (selectedNums: string[], costStr: string, extraCosts: { color: string; count: number }[]) => boolean;
  effectivePowers?: Map<string, number>;
}): CpuSpellChoice | null {
  const { actor, opponent, cards, cardMap, effectsMap, payer } = p;
  if (!hasBlockedAttacker(actor, opponent)) return null;
  const poolNums = energyPoolCardNums(payer.energyPayPool);
  const candidates: CpuSpellChoice[] = [];
  for (const { card, handIndex, check } of listCastableSpells({
    my: actor, op: opponent, isMyTurn: true, turnPhase: p.turnPhase, pendingSpell: p.pendingSpell,
    cards, cardMap, effectsMap, payer, effectivePowers: p.effectivePowers,
  })) {
    if (p.alreadyUsedNums.includes(card.CardNum)) continue;
    const acts = (effectsMap.get(card.CardNum) ?? []).filter(e => e.effectType === 'ACTIVATED');
    if (acts.some(e => hasCpuUnsupportedAction(e.action))) continue;
    if (!acts.some(e => defensiveKindOf(e.action) === 'removal')) continue;
    const costIndices = selectEnergyIndicesForCost({
      poolNums, cards, costStr: check.effectiveCost,
      isAffordable: (selectedNums, costStr) => p.isAffordable(selectedNums, costStr, check.extraCosts),
    });
    if (!costIndices) continue;
    candidates.push({ card, handIndex, check, costIndices });
  }
  if (candidates.length === 0) return null;
  // 手札順の決定論（盤面評価はしない）。⚠`handIndex` は `performSpell` の手札 index と同じ空間。
  candidates.sort((a, b) => a.handIndex - b.handIndex);
  return candidates[0];
}

/** テスト・計測から使う（`listCastableSpells` が返す card の CardNum を数えるとき）。 */
export function spellCardNums(hand: readonly string[]): string[] {
  return hand.map(getCardNum);
}
