import type { LifeCrashReplacement, PlayerState } from '../../types';

/**
 * 「あなたのライフクロスがクラッシュされる場合、**代わりに**〜する」＝**ライフクラッシュの置換**（§6.4）。
 *
 * ■ なぜ funnel が要るか
 *   宣言（アーツ／【出】／ルリグ付与の【常】）と消費（シグニアタックのダメージ／ルリグアタックのダメージ）が
 *   別々の場所にあり、**限定（誰のどんな攻撃か）を消費側が見ていなかった**。実測した壊れ方は3種類：
 *   - `WX24-P4-009-E1` は「クラッシュされる場合、代わりにデッキ上10枚トラッシュ」なのに
 *     **その場で無条件に自分のデッキを10枚削っていた**（置換ではなく即時実行＝自傷）。
 *   - `WX25-P3-004-E1` は「代わりに対戦相手のライフクロス1枚をクラッシュ」なのに
 *     **使った瞬間にタダで相手のライフを1枚割っていた**（置換ではなく即時実行＝過剰効果）。
 *   - `WXDi-CP01-023-E1` は CONTINUOUS の中身が素の `TRASH{DECK_CARD}` ＝**CONTINUOUS は
 *     `executeAction` を通らない**ので恒久 no-op（続き424 の `FORCE_SIGNI_ATTACK` と同型）。
 *   さらに既存の `REPLACE_NEXT_DAMAGE_WITH_MILL`（8カード）は `damageSource` を**宣言はしていたのに
 *   捨てていた**＝`WX25-P1-010`「次にあなたが**シグニによって**ダメージを受ける場合」が
 *   **ルリグアタックのダメージまで置換**していた。
 *
 * ■ 規約
 *   - **宣言も消費もこの1本を通す**。消費地点は2つ（シグニアタックの `crashOneLife` ／ ルリグアタック）で、
 *     片方だけ限定を見ると「シグニには効くがルリグには効かない」型の無言の不整合になる。
 *   - **「デッキがN-1枚以下の場合は置き換えられない」は原文の注記**（`WX24-P4-009`／`WX25-P1-106` 等）＝
 *     枚数が足りないエントリは選ばない＝ダメージがそのまま通る。**デッキアウトの自傷が構造的に起きない。**
 *   - ⚠**「〜してもよい」（`optional`）は現状**自動適用**の近似**。上の「置き換えられない」注記のおかげで
 *     自滅にはならないが、**本来は被害側が選ぶ**。対話化は離場置換（§6.4 M2）と同じ枠組みで別バッチ。
 */

/** legacy `damage_replace_mill: number[]`（続行中の対戦の state）も含めて正規化する。 */
export function lifeCrashReplacements(state: PlayerState): LifeCrashReplacement[] {
  const legacy = (state.damage_replace_mill ?? []).map((count): LifeCrashReplacement =>
    ({ kind: 'mill', count, once: true }));
  return [...(state.life_crash_replacements ?? []), ...legacy];
}

export interface LifeCrashReplaceContext {
  /** ダメージ源。**未指定＝効果によるクラッシュ**（アタックではない）＝`byAttack` 限定は成立しない。 */
  damageSource?: 'lrig' | 'signi';
}

/**
 * このクラッシュに使える置換を1つ選ぶ（**適用はしない**）。
 * 宣言順（先に宣言したものが先）で最初に成立したものを返す。
 */
export function pickLifeCrashReplacement(
  state: PlayerState,
  ctx: LifeCrashReplaceContext,
): { index: number; repl: LifeCrashReplacement } | null {
  const all = lifeCrashReplacements(state);
  for (let i = 0; i < all.length; i++) {
    const r = all[i];
    // 「対戦相手の〈シグニ／ルリグ〉によって」限定
    if (r.damageSource && r.damageSource !== ctx.damageSource) continue;
    // 「〈シグニ〉の**アタック**によって」限定＝効果によるクラッシュには乗らない
    if (r.byAttack && ctx.damageSource === undefined) continue;
    // 「デッキがN-1枚以下の場合は置き換えられない」（原文の注記）
    if (r.kind === 'mill' && state.deck.length < r.count) continue;
    return { index: i, repl: r };
  }
  return null;
}

/** 使った置換を state から消費する（`once` でないものはそのまま残る＝ターン中は何度でも）。 */
export function consumeLifeCrashReplacement(state: PlayerState, index: number): PlayerState {
  const all = lifeCrashReplacements(state);
  const target = all[index];
  if (!target?.once) return state;
  // legacy と新形式を1本に畳んでから消す（以後 legacy 側は書かない）。
  const next = all.filter((_, i) => i !== index);
  return {
    ...state,
    life_crash_replacements: next.length > 0 ? next : undefined,
    damage_replace_mill: undefined,
  };
}

/** `kind:'mill'` の置換を適用する（デッキ上 N 枚をトラッシュへ）。 */
export function applyMillReplacement(
  state: PlayerState,
  index: number,
  count: number,
): { state: PlayerState; milled: string[] } {
  const milled = state.deck.slice(0, count);
  return {
    state: consumeLifeCrashReplacement(
      { ...state, deck: state.deck.slice(count), trash: [...state.trash, ...milled] }, index),
    milled,
  };
}

/** 置換のログ文（消費地点2つで同じ文言を出すため funnel 側に置く）。 */
export function lifeCrashReplaceLog(repl: LifeCrashReplacement): string {
  return repl.kind === 'mill'
    ? `ライフクラッシュ置換：代わりにデッキの上から${repl.count}枚をトラッシュに置く`
    : `ライフクラッシュ置換：代わりに対戦相手のライフクロス${repl.count}枚をクラッシュする`;
}
