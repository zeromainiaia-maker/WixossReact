// コストとして自分の場のシグニをデッキの一番上に置く（`EffectCost.fieldToDeckTop`・PLAN §5.3 `O-256`）。
//
// 🔴**`fieldTrash`（場→トラッシュ）を流用してはいけない＝行き先が違う**。デッキの一番上に置いたカードは
//   次のドローで引き直せる＝**資源を失わない**ので、トラッシュ送りにすると原文より高いコストになる
//   （逆に払わない旧実装は原文より安い＝過剰実行だった）。
// ⚠支払ったカードを `last_cost_trashed_cards` / `fieldTrashCostCards` に**載せない**
//   （`ON_TRASH` の原因弁別が「コストでトラッシュに置いた」と誤観測する＝`fieldBanish` と同じ規約）。
// 🔑スタックの下（クラフト等）と付属カード（チャーム／アクセ）は**ルールどおりトラッシュへ**
//   ＝デッキへ戻るのは最上段の1枚だけ。
import type { CardData, PlayerState } from '../../types';
import type { EffectCost } from '../../types/effects';
import { getCardNum } from '../../engine/execUtils';

export type FieldToDeckTopCost = NonNullable<EffectCost['fieldToDeckTop']>;

/**
 * 選んだゾーンのシグニをデッキの一番上に置いてコストを支払う。**払えなければ `null`**（＝発動を中止する）。
 *
 * ⚠ゾーン index は**支払い前の盤面**のもの。ゾーンを空にするだけなので index はずれないが、
 *   枚数が合わない選択（UI をすり抜けた外部入力）は `null` で弾く。
 */
export function payFieldToDeckTopCost(p: {
  my: PlayerState;
  zones: Iterable<number>;
  cost: FieldToDeckTopCost;
  cardMap: Map<string, CardData>;
}): { state: PlayerState; logs: string[] } | null {
  const zones = [...p.zones];
  if (zones.length !== p.cost.count) return null;
  const signi = [...p.my.field.signi] as (string[] | null)[];
  const down = [...(p.my.field.signi_down ?? [false, false, false])];
  const frozen = [...(p.my.field.signi_frozen ?? [false, false, false])];
  const charms = [...(p.my.field.signi_charms ?? [null, null, null])];
  const acce = [...(p.my.field.signi_acce ?? [null, null, null])];
  const toDeckTop: string[] = [];
  const toTrash: string[] = [];
  const removedIids: string[] = [];
  for (const zi of zones) {
    const stack = signi[zi];
    if (!stack || stack.length === 0) return null;
    removedIids.push(...stack);
    toDeckTop.push(getCardNum(stack.at(-1)!));
    // 最上段以外（下に敷かれたカード）はデッキへ戻らずトラッシュへ。
    toTrash.push(...stack.slice(0, -1).map(getCardNum));
    if (charms[zi]) { toTrash.push(charms[zi]!); charms[zi] = null; }
    if (acce[zi]) { toTrash.push(...acce[zi]!); acce[zi] = null; }
    signi[zi] = null;
    down[zi] = false;
    frozen[zi] = false;
  }
  const state: PlayerState = {
    ...p.my,
    // ⚠**一番「上」**＝配列の先頭（`deck[0]` が次に引かれる。`TRANSFER_TO_DECK{top}` と同じ規約）。
    deck: [...toDeckTop, ...p.my.deck],
    trash: [...p.my.trash, ...toTrash],
    field: {
      ...p.my.field,
      signi, signi_down: down, signi_frozen: frozen, signi_charms: charms, signi_acce: acce,
      puppet_signi: (p.my.field.puppet_signi ?? []).filter(iid => !removedIids.includes(iid)),
    },
  };
  return { state, logs: [`コストで自分のシグニ${toDeckTop.length}体をデッキの一番上に置いた`] };
}
