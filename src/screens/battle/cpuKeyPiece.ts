import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import type { ArtsPayerCtx } from './artsUseGate';
import { hasCpuUnsupportedAction } from './cpuArts';
import { selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { energyPoolCardNums } from './energyPaySource';
import { type KeyPieceUseCheck, listUsableKeyPieces } from './keyPieceUseGate';
import { MAYU_ENCOUNTER_A } from './mayuEncounter';

/**
 * CPU が**キーを場に出す／ピースを使う**ための選択ロジック（§5.6 `C-7`・2026-09-17）。
 *
 * ■ 設計（`cpuArts.ts` と同じ規律＝§5.6.3）
 *   - **「使えるか」は `keyPieceUseGate.checkKeyPieceUse`**（人間のルリグデッキのカードアクションと同じ関数）。
 *     【使用条件】【チーム】・「ルリグが3体いる」・キーの枠・`SELF_PLAY_RESTRICT`・コインの使用制限はすべてそこ。
 *   - 実行は `performKeyPiece`（人間の `KeyUseModal` と同じ関数）。**CPU 専用の実行経路は作らない。**
 *   - ここが担うのは「通った候補から1枚選ぶ」＋「CPU が支払い内訳を自動で決められない札を外す」だけ。
 *
 * ■ v1 の意図的な限界（honest defer）
 *   - **使える札は使う**（盤面評価はしない）＝目的は発見（§5.6.4「CPU が強くなったら」を止め時にしない）。
 *     順は**キー → ピース**（キーは場に残り、以後の【常】【起】も踏まれる）、同種はルリグデッキ順＝決定論。
 *   - **効果側のコストは allowlist**（`CPU_KEY_PIECE_PAYABLE_COST_KEYS`）＝`queueCardEffects` はピースの `ACTIVATED` の
 *     `cost` を**徴収しない**（印刷 Cost の1回払いだけ）ので、`energy` 以外のキー（手札を捨てる等）が付いた札は
 *     人間の UI 経路でも払われない＝CPU が選ぶと**宣言だけして踏み倒す**側へ倒れる。
 *   - **コストつきの【出】を持つキーは使わない**（`WXK01-028`「【出】《緑》《無》：」）＝任意の支払いを
 *     CPU が決める経路が無い（§5.6.3 規律5＝半分だけ実装しない）。
 *   - **マユのエンカウント（`WXDi-P13-003A`）は使わない**＝解決がグロウ経路（`executeGrow`）で、人間の盤面が前提。
 */

/** CPU が扱える効果側コストのキー（allowlist・denylist にしない＝新しいキーが増えたとき使わない側へ倒れる）。 */
export const CPU_KEY_PIECE_PAYABLE_COST_KEYS: ReadonlySet<string> = new Set(['energy']);

/** CPU がこの札を使ってよいか（可否ではなく「CPU が扱いきれるか」だけ）。 */
export function cpuCanHandleKeyPiece(card: CardData, effects: readonly CardEffect[]): boolean {
  if (card.CardNum === MAYU_ENCOUNTER_A) return false;
  for (const e of effects) {
    if (hasCpuUnsupportedAction(e.action)) return false;
    const costKeys = Object.entries(e.cost ?? {}).filter(([, v]) => v !== undefined).map(([k]) => k);
    if (e.effectType === 'ACTIVATED' && !costKeys.every(k => CPU_KEY_PIECE_PAYABLE_COST_KEYS.has(k))) {
      // ⚠キーの【起】（場に出た後に起動する能力）は置く時点では払わない＝ピースの本体だけを絞る。
      if (card.Type !== 'キー') return false;
    }
    if (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY') && costKeys.length > 0) return false;
  }
  return true;
}

export interface CpuKeyPieceChoice {
  card: CardData;
  check: KeyPieceUseCheck;
  /** `performKeyPiece` に渡すエナ pool index。 */
  costIndices: Set<number>;
}

export interface CpuKeyPiecePickInput {
  actor: PlayerState;
  opponent: PlayerState;
  cards: CardData[];
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  payer: ArtsPayerCtx;
  /** 自ターンの窓（`'MAIN'` か `'ATTACK_ARTS'`）。 */
  turnPhase: TurnPhase;
  /** このターン CPU が既に使った札（同じ札を選び直さない安全弁）。 */
  alreadyUsedNums: readonly string[];
  /** 可否の権威＝人間の `KeyUseModal` と同じ `isEnergyPaymentSelectionValid`。 */
  isAffordable: (selectedNums: string[], costStr: string, card: CardData) => boolean;
  effectivePowers?: Map<string, number>;
  /** 🆕グロウ用エナの予約（`cpuGrowReserve.ts`）。 */
  energyReserve?: CpuEnergyReserve;
}

/** 🆕§5.7 `S-15`＝CPU がいま使えるキー／ピースを全部（ルリグデッキ順）。`pickCpuKeyPiece` はこれに順序を当てるだけ。 */
export function listCpuKeyPieces(p: CpuKeyPiecePickInput): CpuKeyPieceChoice[] {
  const poolNums = energyPoolCardNums(p.payer.energyPayPool);
  const candidates: CpuKeyPieceChoice[] = [];
  for (const { card, check } of listUsableKeyPieces({
    my: p.actor, op: p.opponent, isMyTurn: true, turnPhase: p.turnPhase,
    cards: p.cards, cardMap: p.cardMap, effectsMap: p.effectsMap, payer: p.payer, effectivePowers: p.effectivePowers,
  })) {
    if (p.alreadyUsedNums.includes(card.CardNum)) continue;
    if (!cpuCanHandleKeyPiece(card, p.effectsMap.get(card.CardNum) ?? [])) continue;
    const costIndices = selectEnergyIndicesForCost({
      poolNums, cards: p.cards, costStr: check.effectiveCost,
      isAffordable: (selectedNums, costStr) => p.isAffordable(selectedNums, costStr, card),
      wholeSubstitutes: p.payer.wholeEnergySubstitutes,
      reserve: p.energyReserve,
    });
    if (!costIndices) continue;
    candidates.push({ card, check, costIndices });
  }
  return candidates;
}

/** CPU がいま使うキー／ピースを1枚選ぶ（無ければ `null`）。1回の呼び出しで1枚だけ。 */
export function pickCpuKeyPiece(p: CpuKeyPiecePickInput): CpuKeyPieceChoice | null {
  const candidates = listCpuKeyPieces(p);
  // キー → ピース（`listUsableKeyPieces` はルリグデッキ順＝同種内の順はそのまま＝安定ソート）。
  candidates.sort((a, b) => Number(a.check.isPiece) - Number(b.check.isPiece));
  return candidates[0] ?? null;
}
