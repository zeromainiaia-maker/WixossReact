import type { CardData, PlayerState } from '../types';
import type { CardEffect, ConditionalAction, SequenceAction, StubAction } from '../types/effects';

const PLAY_SIGNI_POWER_BLOCK_RE = /^PLAY_SIGNI_POWER_(\d+)_OR_MORE$/;

/** 手札から場に出そうとしているシグニが、一時的なパワー下限ブロックに該当するか。 */
export function isHandSigniPlayBlockedByPower(state: PlayerState, printedPower: number): boolean {
  if (!Number.isFinite(printedPower)) return false;
  return (state.blocked_actions ?? []).some(actionId => {
    const match = actionId.match(PLAY_SIGNI_POWER_BLOCK_RE);
    return match ? printedPower >= Number(match[1]) : false;
  });
}

/* ══════════════════════════════════════════════════════════════════════════════
 * シグニ【自】能力の「支払えば通る」ゲート（§6.4 O-38・続き544）
 *
 * 原文＝「対戦相手のシグニの【自】能力が発動する場合、対戦相手が《無》を支払わないかぎり、
 *        その能力は何もしない。」（`SPDi43-01-E2` が次の対戦相手のターン終了時まで付与する【常】）
 *
 * 🔴**旧実装は `BLOCK_OPP_SIGNI_AUTO` ／ `BLOCK_OWN_SIGNI_AUTO:NEXT_TURN` で丸ごと止めていた**＝
 *   相手に支払いの機会が一度も来ない**原文より強い近似**だった。
 *
 * 🔑**「収集を止める」のではなく「解決を包む」**のがこの機構の要点：
 *   - `BLOCK_OWN_SIGNI_AUTO` は `triggerCollect.ts` の**42箇所に散った収集時フィルタ**なので、
 *     そこへ支払い分岐を差し込むことはできない（散在＝choke point が無い）。
 *   - 代わりに**スタック解決の1点**（`BattleScreen.resolveStackNext` の `executeEffect` 直前）で
 *     `SEQUENCE[OPTIONAL_COST, CONDITIONAL{PAID_ADDITIONAL_COST}]` に包む。
 *   - 副次的に**原文へ近づく**＝能力は「発動はする」ので `ON_ABILITY_ACTIVATED` の監視は素通りし、
 *     《ターン1回》も消費される（止めていた頃はどちらも起きなかった）。
 *
 * ⚠**2スロット（当ターン／`:NEXT_TURN` 予約）の持ち方は旧マーカーとまったく同じ**にしてある
 *   ＝`clearTurnEndScopedState`／`activateTurnStartScopedState` の寿命機構をそのまま借りる。
 *   変えたのは「止める」→「支払わせる」の一点だけ。
 * ══════════════════════════════════════════════════════════════════════════════ */

/** 宣言者の側に積む＝「**対戦相手の**シグニ【自】」を対象にするゲート。 */
const PAY_GATE_OPP = 'PAY_GATE_OPP_SIGNI_AUTO';
/** 能力の持ち主の側に積む＝「**自分の**シグニ【自】」が対象になるゲート（`:NEXT_TURN` 予約用）。 */
const PAY_GATE_OWN = 'PAY_GATE_OWN_SIGNI_AUTO';
const NEXT_TURN_SUFFIX = ':NEXT_TURN';

/**
 * ゲート宣言の `blocked_actions` エントリを作る。
 * ⚠**旧 `BLOCK_OPP_SIGNI_AUTO` ペアと同じ置き方**（宣言者に当ターンぶん／相手に次ターン予約）＝
 *   「次の対戦相手のターン終了時まで」の寿命はこの2スロットで表す。
 */
export function signiAutoPayGateMarkers(costColors: string[]): { declarer: string; opponentNextTurn: string } {
  const cost = costColors.join(',');
  return {
    declarer: `${PAY_GATE_OPP}:${cost}`,
    opponentNextTurn: `${PAY_GATE_OWN}:${cost}${NEXT_TURN_SUFFIX}`,
  };
}

/** `blocked_actions` から**有効な**（＝`:NEXT_TURN` 予約ではない）ゲートのコスト色を1つ取る。 */
function activeGateCost(state: PlayerState, prefix: string): string[] | null {
  for (const actionId of state.blocked_actions ?? []) {
    if (actionId.endsWith(NEXT_TURN_SUFFIX)) continue;   // 予約はまだ効かない
    if (!actionId.startsWith(`${prefix}:`)) continue;
    const cost = actionId.slice(prefix.length + 1).split(',').filter(Boolean);
    if (cost.length > 0) return cost;
  }
  return null;
}

/**
 * いま解決しようとしている【自】能力にゲートが掛かっているかを判定し、支払うべきコスト色を返す。
 *
 * @param abilityOwner その【自】能力の持ち主（＝コストを払う側）の state
 * @param declarer     その相手（ゲートを宣言した可能性がある側）の state
 * ⚠**宣言者自身のシグニには掛からない**＝原文は「**対戦相手の**シグニの【自】能力」。
 *   （宣言者側の `PAY_GATE_OPP` は「相手の能力を解決するとき」にだけ読む＝この引数の向きで担保する。）
 */
export function findSigniAutoPayGate(abilityOwner: PlayerState, declarer: PlayerState): string[] | null {
  return activeGateCost(abilityOwner, PAY_GATE_OWN) ?? activeGateCost(declarer, PAY_GATE_OPP);
}

/** ゲートの対象になる能力か＝**場のシグニ（レゾナ含む）が持つ【自】**だけ。 */
export function isSigniAutoAbility(
  effect: CardEffect, hostCardNum: string, cardMap: Map<string, CardData>,
): boolean {
  if (effect.effectType !== 'AUTO') return false;
  // ⚠instanceId のまま先に引く＝`InstanceMap` は `card_identity_overrides`（カード差し替え）を
  //   解決するので、先に `#` を落とすと差し替え前のカードを見てしまう。素の Map 用に base も試す。
  const base = hostCardNum.includes('#') ? hostCardNum.slice(0, hostCardNum.indexOf('#')) : hostCardNum;
  const type = (cardMap.get(hostCardNum) ?? cardMap.get(base))?.Type;
  return type === 'シグニ' || type === 'レゾナ';
}

/**
 * 【自】能力を「〈コスト〉を支払えば通る」ゲートで包む。
 * 払えば本体（`effect.action`）が走り、払わなければ**何もしない**（原文「その能力は何もしない」）。
 *
 * ⚠`unlessPay` は**文言だけ**を「支払う／支払わない」に反転させる（§6.4 O-30 の規約）＝
 *   機構は既存の `OPTIONAL_COST` → `CONDITIONAL{PAID_ADDITIONAL_COST}` そのまま。
 * ⚠払うのは**能力の持ち主**（`ctx.ownerState`）＝`OPPONENT_PAY_OPTIONAL` ではない
 *   （あちらは `ctx.otherState` が払う別軸）。
 */
export function wrapSigniAutoPayGate(effect: CardEffect, costColors: string[]): CardEffect {
  const gate: SequenceAction = {
    type: 'SEQUENCE',
    steps: [
      { type: 'STUB', id: 'OPTIONAL_COST', costColors, unlessPay: true } as StubAction,
      { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: effect.action } as ConditionalAction,
    ],
  };
  return { ...effect, action: gate };
}
