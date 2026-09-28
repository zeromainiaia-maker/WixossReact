import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import {
  defensiveKindOf, hasBlockedAttacker, hasIncomingThreat, offensiveArtsAllowedKinds, PICK_PRIORITY,
  removalTargetExists, responseArtsAllowedKinds, type CpuArtsPickKind, type CpuDefensiveKind,
} from './cpuArts';
import { planArtsMarkedFor } from './cpuDeckPlan';
import { evaluateBoard } from './cpuLookahead';
import { DEFAULT_CPU_POLICY } from './cpuPolicy';
import { listCpuAssistGrows, simAssistGrow, type CpuMove, type CpuMoveCtx } from './cpuMoves';

/**
 * 🆕2026-09-28＝**CPU がアシストグロウを「するか」を決める**（ユーザー指示「アシストグロウはルリグと名のついているが
 * 実質アーツである。扱いをアーツと同じにする」）。
 *
 * 🔴**旧＝候補の先頭を必ず使っていた**（`cpuTurn.ts` の `listCpuAssistGrows(...)[0]`）＝「何を」だけで「するか」を
 *   判断していなかった（第482バッチのエナチャージと同じ形）。アシストルリグ188枚のうち184枚は【出】を持ち、
 *   **その【出】を使う札＝アーツと同じ**（除去・ドロー・ダウン …）。
 *
 * ■ 規則は `cpuArts.pickCpuArtsBy` と**同じ線**（窓・分類・指名・先読み）
 *   - **攻め**（自分の `MAIN`／`ATTACK_ARTS`）＝正面が塞がれていれば**除去**（`hasBlockedAttacker`）、
 *     そうでなければ**作戦データの指名だけ**。
 *   - **守り**（相手の `ATTACK_ARTS_OP`）＝**実害が出る見込みがあるときだけ**（`hasIncomingThreat`）・
 *     分類は `responseArtsAllowedKinds`（軽減はライフ2枚以下まで温存）。
 *   - **自分のターンは先読み**＝【出】まで解いた盤面が使う前より良い札だけ（指名は増分0でも残す）。
 * ⚠**メインフェイズで探索が有効なときはここを通らない**＝探索が `simAssistGrow` で他の手と並べて比べる（アーツと同じ）。
 */

type AssistGrowMove = Extract<CpuMove, { kind: 'assistGrow' }>;

export interface CpuAssistGrowChoice {
  move: AssistGrowMove;
  kind: CpuArtsPickKind;
  gain?: number;
}

/** その札の【出】が持つ守りの分類（除去は対象が相手の場に居るときだけ）。`defensiveKindOf` の順。 */
export function assistGrowKindsOf(ctx: CpuMoveCtx, cardNum: string): CpuDefensiveKind[] {
  const onPlay: CardEffect[] = (ctx.effectsMap.get(getCardNum(cardNum)) ?? [])
    .filter(e => e.effectType === 'AUTO' && (e.timing?.includes('ON_PLAY') ?? false));
  const kinds = new Set<CpuDefensiveKind>();
  for (const e of onPlay) {
    const k = defensiveKindOf(e.action);
    if (k === null) continue;
    if (k === 'removal' && !removalTargetExists(e.action, ctx.opponent, ctx.cardMap)) continue;
    kinds.add(k);
  }
  return [...kinds].sort((a, b) => PICK_PRIORITY[a] - PICK_PRIORITY[b]);
}

function pickBy(
  ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP',
  opts: { allowKinds: ReadonlySet<CpuDefensiveKind>; window: 'defense' | 'offense' },
): CpuAssistGrowChoice | null {
  const isMyTurn = phase !== 'ATTACK_ARTS_OP';
  const candidates: CpuAssistGrowChoice[] = [];
  for (const move of listCpuAssistGrows(ctx, phase)) {
    if (planArtsMarkedFor(ctx.plan, move.card.CardNum, opts.window)) { candidates.push({ move, kind: 'plan' }); continue; }
    const kind = assistGrowKindsOf(ctx, move.card.CardNum).find(k => opts.allowKinds.has(k));
    if (kind) candidates.push({ move, kind });
  }
  if (candidates.length === 0) return null;
  if (isMyTurn) {
    const lctx = { ...ctx.lookahead, turnPhase: phase };
    const before = evaluateBoard(ctx.actor, ctx.opponent, lctx);
    const scored = candidates
      .map(c => {
        const after = simAssistGrow({ ...ctx, lookahead: lctx }, c.move, phase);
        return { ...c, gain: after ? evaluateBoard(after.cpu, after.opp, lctx) - before : undefined };
      })
      // 🔴解けなかった札は指名でも落とす（アーツと同じ）／指名は増分0でも残す。
      .filter(c => c.gain !== undefined && (c.gain > 0 || c.kind === 'plan'))
      .sort((a, b) => (PICK_PRIORITY[a.kind] - PICK_PRIORITY[b.kind]) || (b.gain! - a.gain!));
    return scored[0] ?? null;
  }
  // 相手のターン＝分類（指名→無効化→除去→軽減）が第一、同点は列挙順（左→右・ルリグデッキ順）。
  return candidates
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (PICK_PRIORITY[a.c.kind] - PICK_PRIORITY[b.c.kind]) || (a.i - b.i))[0].c;
}

/** 旧挙動（`legacy-assistgrow`＝A/B の口）か。 */
const legacyOf = (ctx: CpuMoveCtx) => (ctx.policy ?? ctx.lookahead.policy ?? DEFAULT_CPU_POLICY).assistGrowAsArts <= 0;
/** 旧挙動＝候補の先頭を必ず使う（⚠列挙の作戦データの読み方は新しいほう）。 */
const legacyPick = (ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS' | 'ATTACK_ARTS_OP'): CpuAssistGrowChoice | null => {
  const move = listCpuAssistGrows(ctx, phase)[0];
  return move ? { move, kind: 'plan' } : null;
};

/** 自分のターン（`MAIN`／`ATTACK_ARTS`）＝攻めのアーツと同じ線（`pickCpuOffensiveArts`）。 */
export function pickCpuOffensiveAssistGrow(ctx: CpuMoveCtx, phase: 'MAIN' | 'ATTACK_ARTS'): CpuAssistGrowChoice | null {
  if (legacyOf(ctx)) return legacyPick(ctx, phase);
  const blocked = hasBlockedAttacker(ctx.actor, ctx.opponent);
  return pickBy(ctx, phase, { allowKinds: offensiveArtsAllowedKinds(blocked), window: 'offense' });
}

/** 相手のアーツステップ（`ATTACK_ARTS_OP`）＝守りのアーツと同じ線（`pickCpuResponseArts`）。 */
export function pickCpuResponseAssistGrow(ctx: CpuMoveCtx): CpuAssistGrowChoice | null {
  // 🔴実害の見込みは指名された札にも効かせる（アーツと同じ非対称）。
  if (!hasIncomingThreat(ctx.actor, ctx.opponent)) return null;
  if (legacyOf(ctx)) return legacyPick(ctx, 'ATTACK_ARTS_OP');
  return pickBy(ctx, 'ATTACK_ARTS_OP', { allowKinds: responseArtsAllowedKinds(ctx.actor), window: 'defense' });
}
