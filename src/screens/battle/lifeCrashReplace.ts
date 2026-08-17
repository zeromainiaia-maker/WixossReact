import type { CardData, LifeCrashReplacement, PlayerState } from '../../types';
import type { StubAction } from '../../types/effects';
import { selectOptionalCostEnergy } from '../../engine/execUtils';

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

/** ルリグ付与ストア2本（通常付与／次の相手ターン終了時まで）。合成と消費で同じ順に見る。 */
const LRIG_GRANT_STORES = [
  'lrig_granted_auto_effects',
  'lrig_granted_auto_effects_until_opp_turn',
] as const;

/**
 * ルリグ付与ストアの `STUB{DAMAGE_REPLACE_BY_COST}`（§6.4 O-37(a)）を置換宣言へ合成する。
 *
 * ⚠**`life_crash_replacements` へコピーしない**＝「そうした場合、このルリグはこの能力を失う」の
 *   在庫は付与ストアだけにしておく。コピーすると能力を失ったのに置換だけ残る（無限に払える）。
 * ⚠`lrig_abilities_disabled`（ルリグの能力を失う効果）で丸ごと落ちるのは他の付与走査と同じ。
 */
function grantedPayCostReplacements(state: PlayerState): LifeCrashReplacement[] {
  if (state.lrig_abilities_disabled) return [];
  const out: LifeCrashReplacement[] = [];
  for (const key of LRIG_GRANT_STORES) {
    for (const effect of state[key] ?? []) {
      const action = effect.action as StubAction;
      if (effect.effectType !== 'CONTINUOUS' || action?.type !== 'STUB') continue;
      if (action.id !== 'DAMAGE_REPLACE_BY_COST') continue;
      const spec = action.damageReplaceByCost;
      if (!spec || spec.options.length === 0) continue;
      out.push({
        kind: 'pay_cost', count: 1, optional: true, payOptions: spec.options,
        ...(spec.loseAbility ? { loseGrantedEffectId: effect.effectId } : {}),
      });
    }
  }
  return out;
}

/** legacy `damage_replace_mill: number[]`（続行中の対戦の state）も含めて正規化する。 */
export function lifeCrashReplacements(state: PlayerState): LifeCrashReplacement[] {
  const legacy = (state.damage_replace_mill ?? []).map((count): LifeCrashReplacement =>
    ({ kind: 'mill', count, once: true }));
  // 付与ストア由来（コスト支払い型）は**必ず末尾**＝タダで済む宣言を先に使い切る。
  return [...(state.life_crash_replacements ?? []), ...legacy, ...grantedPayCostReplacements(state)];
}

/** `pay_cost` の支払い方を1つ選ぶ（**原文の並び順**で最初に払えるもの）。払えなければ null。 */
function pickPayOption(
  repl: LifeCrashReplacement, state: PlayerState, cardMap: Map<string, CardData>,
): { option: NonNullable<LifeCrashReplacement['payOptions']>[number]; energyPicked: string[] } | null {
  for (const option of repl.payOptions ?? []) {
    if (option.costColors && option.costColors.length > 0) {
      const picked = selectOptionalCostEnergy(option.costColors, state, cardMap);
      if (picked) return { option, energyPicked: picked };
      continue;
    }
    if (option.handDiscard && state.hand.length >= option.handDiscard) return { option, energyPicked: [] };
    if (option.energyTrash && state.energy.length >= option.energyTrash) return { option, energyPicked: [] };
  }
  return null;
}

export interface LifeCrashReplaceContext {
  /** ダメージ源。**未指定＝効果によるクラッシュ**（アタックではない）＝`byAttack` 限定は成立しない。 */
  damageSource?: 'lrig' | 'signi';
  /**
   * `kind:'pay_cost'` の支払い可否（色つきエナコスト）を見るために要る。
   * 未指定のときはコスト支払い型の置換を**選ばない**（＝ダメージがそのまま通る＝過剰にならない側）。
   */
  cardMap?: Map<string, CardData>;
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
