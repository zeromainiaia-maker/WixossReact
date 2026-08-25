// コストとして自分の場のシグニをバニッシュする（`EffectCost.fieldBanish`・PLAN §5.3 `O-67`）。
//
// 🔴**`fieldTrash`（場→トラッシュ）を流用してはいけない＝行き先が違う**。バニッシュの行き先は
//   **エナゾーン**なので、支払うと自分のエナが1枚増える（トラッシュ送りにすると資源をまるごと失う
//   ＝§4.4 罠8f と同じ取り違え）。だから支払いキーも支払い関数もこの1本に分けてある。
// ⚠支払ったカードを `last_cost_trashed_cards` / `fieldTrashCostCards` に**載せない**
//   （`ON_TRASH` の原因弁別が「コストでトラッシュに置いた」と誤観測する）。
// 🔑**シグニ【起】（`performSigniActivated`）とルリグ【起】（`performLrigActivated`）の両方がこの関数を呼ぶ**
//   ＝支払い経路を増やさない（片方だけ実装すると「シグニでは払うがルリグでは踏み倒せる」無言のズレになる）。
import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { EffectCost } from '../../types/effects';
import { computeBanishedAttrs } from '../../engine/effectEngine';
import { banishDestination, removeFromField } from '../../engine/execUtils';

export type FieldBanishCost = NonNullable<EffectCost['fieldBanish']>;

/**
 * 選んだゾーンのシグニをバニッシュしてコストを支払う。**払えなければ `null`**（＝発動を中止する）。
 *
 * ⚠ゾーン index は**支払い前の盤面**のものなので、`removeFromField` を掛ける前に
 *   全ゾーンの最上段カードを控えてから1枚ずつ処理する（先に消すと index がずれる）。
 */
export function payFieldBanishCost(p: {
  my: PlayerState;
  /** 置換能力（`banish_redirect` 等）の持ち主候補＝バニッシュされる側から見た対戦相手。 */
  op: PlayerState;
  zones: Iterable<number>;
  cost: FieldBanishCost;
  cardMap: Map<string, CardData>;
  turnPhase?: TurnPhase;
}): { state: PlayerState; logs: string[] } | null {
  const zones = [...p.zones];
  if (zones.length !== p.cost.count) return null;
  const tops = zones.map(zi => p.my.field.signi[zi]?.at(-1) ?? null);
  if (tops.some(t => !t)) return null;
  let state = p.my;
  const logs: string[] = [];
  const removedIids: string[] = [];
  for (const top of tops as string[]) {
    // 除去**前**の盤面から被バニッシュ属性を取る（置換の target.filter がレベル/凍結/感染を見る）。
    const banished = computeBanishedAttrs(state, top, p.cardMap);
    const zi = state.field.signi.findIndex(s => s?.at(-1) === top);
    if (zi < 0) return null;
    removedIids.push(...(state.field.signi[zi] ?? []));
    const removed = removeFromField(top, state);
    const dest = banishDestination(removed, p.op, top, {
      cardMap: p.cardMap, banished, turnPhase: p.turnPhase,
    });
    state = dest.state;
    logs.push(`コストで自分のシグニ${dest.log}`);
  }
  // 傀儡（`puppet_signi`）の台帳から離場したインスタンスを外す（`fieldTrash` の支払いと同じ後始末）。
  if ((state.field.puppet_signi ?? []).some(iid => removedIids.includes(iid))) {
    state = {
      ...state,
      field: { ...state.field, puppet_signi: (state.field.puppet_signi ?? []).filter(iid => !removedIids.includes(iid)) },
    };
  }
  return { state, logs };
}
