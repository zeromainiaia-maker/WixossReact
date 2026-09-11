import type { CardData, PlayerState } from '../types';

/**
 * §5.3 `O-306`（2026-09-11）＝「宣言されたカード名のカードは《X》になる」の**規則**を実効の差し替えへ合成する funnel。
 *
 * 🔴なぜ規則か＝旧実装は発動時点で一致した instance を `card_identity_overrides` へ**永続で**書いていた。
 *   原文（`WXEX2-10-E2`「このターン、対戦相手の**すべての領域にある**宣言されたカード名のカードは《サーバント　ＺＥＲＯ》になる」／
 *   `WXK03-002-E2`「このゲームの間、対戦相手の**場にある**…」）は**継続する状態**なので、
 *   ①期限（このターン）で戻らない ②発動後にその領域へ来たカード（引いた札・場に出た札）が変身しない、の2点で外れていた。
 * ⇒ 規則は変身する側の `PlayerState.name_identity_rules(_this_turn)` に置き、**読むたびに**ここで instance 単位の差し替えへ展開する。
 *
 * ⚠**読み手はこの funnel を通す**＝`BattleScreen` の `battleCardMap`／augmented `effectsMap`、`effectEngine` のパワー基準値、
 *   名前で一掃する `TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY`。片方だけ通すと「見た目は ZERO なのに能力・パワーは元のまま」になる。
 * ⚠`card_identity_overrides` を直接読む残りの地点（ルリグの裏返り検出・リミット・場を離れたときの掃除）はルリグ／場の instance 用で、
 *   シグニ名の規則とは交わらない。
 */

type NameIdentityRule = NonNullable<PlayerState['name_identity_rules']>[number];
type CardLookup = Pick<Map<string, CardData>, 'get'>;

/** `execUtils.getCardNum` と同じ意味（`effectEngine` からの import 循環を避けるため局所に持つ）。 */
const baseNum = (id: string): string => {
  const h = id.indexOf('#');
  return h > 0 ? id.slice(0, h) : id;
};

/** 規則が見る領域の instance 一覧。'field'＝シグニゾーンの全カード（下に重なった札を含む）。 */
export function nameRuleScopeCards(state: PlayerState, zones: NameIdentityRule['zones']): string[] {
  const field = state.field.signi.flatMap(stack => stack ?? []);
  if (zones === 'field') return field;
  return [
    ...field,
    ...(state.hand ?? []),
    ...(state.deck ?? []),
    ...(state.energy ?? []),
    ...(state.trash ?? []),
    ...(state.life_cloth ?? []),
    ...(state.field.check ? [state.field.check] : []),
    ...(state.field.check_rest ?? []),
  ];
}

/**
 * instance → 扱うカード番号。**明示の差し替え（`card_identity_overrides`）の上に規則由来を重ねる**
 * （規則は「いまの名前」で当てる＝コピー等で名前が変わっていればその名前で判定する）。
 * 規則が無ければ明示の差し替えをそのまま返す（従来と同一のオブジェクト）。
 */
export function effectiveIdentityOverrides(state: PlayerState, cardMap: CardLookup): Record<string, string> {
  const explicit = state.card_identity_overrides ?? {};
  const rules = [...(state.name_identity_rules ?? []), ...(state.name_identity_rules_this_turn ?? [])];
  if (rules.length === 0) return explicit;
  const out: Record<string, string> = { ...explicit };
  for (const rule of rules) {
    for (const inst of nameRuleScopeCards(state, rule.zones)) {
      const currentNum = explicit[inst] ?? baseNum(inst);
      if (cardMap.get(currentNum)?.CardName === rule.cardName) out[inst] = rule.toCardNum;
    }
  }
  return out;
}

/** instance の実効カード（差し替えと規則を通したもの）。 */
export function effectiveCardOf(instanceId: string, state: PlayerState, cardMap: CardLookup): CardData | undefined {
  const num = effectiveIdentityOverrides(state, cardMap)[instanceId] ?? baseNum(instanceId);
  return cardMap.get(num);
}
