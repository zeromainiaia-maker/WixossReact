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

/* ══════════════════════════════════════════════════════════════════════════════
 * 色で限定された「アーツとスペルを使用できない」（§5.3 `O-349`・2026-09-13）
 *
 * 原文2形（live 実測 2効果＝`npm run census:population` で確認）：
 *   ①「（次の対戦相手のターンの間、）対戦相手は**無色ではない**、アーツとスペルを使用できない」
 *     （`PR-471-E1`②）＝**無色だけが使える。**
 *   ②「対戦相手は**このシグニの【出】能力で宣言された色を持たず無色ではない**、アーツとスペルを
 *     使用できない」（`WXK09-037-E2`＝【常】）＝**宣言された色 か 無色 なら使える。**
 *
 * 🔴**旧は `STUB{DEFERRED_COLOR_QUALIFIED_USE_BLOCK}`＝明示 defer の no-op**だった。
 *   理由は「`BLOCK_ACTION` は `actionId` しか持たずカードの色で絞れない」ことだったが、
 *   **既に同じ形の先例が2つある**＝`PLAY_COLORLESS`（無色のスペル封じ）と `BLOCK_NON_WHITE_SPELL`
 *   （白以外のスペル封じ）は `isSpellUseBlockedFor` が**カードを受け取って**判定している。
 *   ⇒ 新機構は要らず、**actionId を増やして同じ経路へ載せる**だけで足りる。
 *
 * ⚠**②は宣言前なら制限を課さない**（fail-closed）＝`declared_color` は相手（＝使用する側）自身の
 *   state に入る（`INTERNAL_SET_OPP_DECLARED_COLOR` が `ctx.otherState` へ刻む）。
 *   同じ読み方の先例＝`collectOppEnergyColorRestriction`（`E3` 側・宣言前は `null`）。
 * ⚠**①と②を1つの actionId にまとめない**＝まとめると「未宣言のとき①に化けて無色以外を全部封じる」
 *   （＝原文にない過剰実行）か「①が宣言待ちで効かない」（＝過小）のどちらかになる。
 * ══════════════════════════════════════════════════════════════════════════════ */

/** ①「無色ではない、アーツとスペルを使用できない」＝無色だけが使える。 */
export const USE_BLOCK_UNLESS_COLORLESS = {
  arts: 'USE_ARTS_UNLESS_COLORLESS',
  spell: 'USE_SPELL_UNLESS_COLORLESS',
} as const;
/** ②「宣言された色を持たず無色ではない、アーツとスペルを使用できない」＝宣言色 か 無色 なら使える。 */
export const USE_BLOCK_UNLESS_DECLARED_COLOR = {
  arts: 'USE_ARTS_UNLESS_COLOR_DECLARED',
  spell: 'USE_SPELL_UNLESS_COLOR_DECLARED',
} as const;

/** 無色か（`matchesFilter` の `nonColorless` と**同じ判定**＝データ上の「無」／空／「無色」）。 */
function isColorlessCard(color: string | undefined): boolean {
  const col = color ?? '';
  return col === '' || col === '無' || col === '無色';
}

/**
 * 色限定つきの使用封じに該当するか（`true` なら**そのカードは使えない**）。
 *
 * @param kind      アーツかスペルか（actionId が別＝原文は「アーツとスペル」で2本に割る規約）
 * @param user      使用しようとしているプレイヤー（`declared_color` はこちらに入る）
 * @param isBlocked `blocked_actions`（`:NEXT_TURN` 解除済み）＋ CONTINUOUS 収集ぶんの合併判定
 * @param card      使おうとしているカード（`Color` だけ見る）
 */
export function isColorQualifiedUseBlocked(
  kind: 'arts' | 'spell',
  user: PlayerState,
  isBlocked: (actionId: string) => boolean,
  card: { Color?: string } | undefined,
): boolean {
  const colorless = isColorlessCard(card?.Color);
  if (isBlocked(USE_BLOCK_UNLESS_COLORLESS[kind]) && !colorless) return true;
  if (isBlocked(USE_BLOCK_UNLESS_DECLARED_COLOR[kind])) {
    const declared = user.declared_color;
    // ⚠未宣言＝制限なし（fail-closed）。宣言済みなら「宣言色を持つ」か「無色」だけが通る。
    if (declared && !colorless && !(card?.Color ?? '').includes(declared)) return true;
  }
  return false;
}
