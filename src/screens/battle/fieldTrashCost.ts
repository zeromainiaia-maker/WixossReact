import type { CardData, PlayerState } from '../../types';
import type { EffectCost } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';

/**
 * **`fieldTrash` コスト（場の自分シグニを場からトラッシュ／ルリグトラッシュへ）の支払い funnel。**
 *
 * 🆕2026-09-07・§5.3 `O-271` で切り出した。従来は `BattleScreen.tsx` の中に**同じ処理が2本**
 * 手書きされており（【出】経路と【起】経路）、しかも**ルリグ【起】には1本も無かった**＝
 * ルリグの `cost.fieldTrash` は**提示も支払いも誰も見ていない＝踏み倒して撃てる**状態だった。
 *
 * ⚠**付属カードはルールどおりトラッシュへ**（【チャーム】【アクセ】は行き先が `fieldToLrigTrash` でも
 *   ルリグトラッシュへは行かない）。
 * ⚠支払ったカードは `last_cost_trashed_cards` に載せる＝**コストによる離場**なので
 *   中央 diff 側で `byEffectCause=false` として扱われる（`ON_TRASH` の誤発火を防ぐ）。
 * 🆕**`last_cost_field_trash_count`** に**体数**（枚数ではない）を載せる＝
 *   「この方法でトラッシュに置いたシグニ1体につき」を `$ref:'last_cost_field_trash_count'` で読むため。
 *   🔴`{$ref:'last_processed_count'}` では取れない（あれは engine 内部の直前ステップ＝コストは残らない）。
 */
export function payFieldTrashCost(p: {
  state: PlayerState;
  /** 支払いに使うシグニゾーン（プレイヤーが選んだもの）。 */
  zones: Iterable<number>;
  cost: EffectCost | undefined;
  cardMap: Map<string, CardData>;
}): { state: PlayerState; log: string | null; trashedCount: number } {
  const zones = [...p.zones];
  if (zones.length === 0) return { state: p.state, log: null, trashedCount: 0 };
  const st = p.state;
  const newSigni  = [...st.field.signi] as (string[] | null)[];
  const newDown   = [...(st.field.signi_down   ?? [false, false, false])];
  const newFrozen = [...(st.field.signi_frozen ?? [false, false, false])];
  const newCharms = [...(st.field.signi_charms ?? [null, null, null])];
  const newAcce   = [...(st.field.signi_acce   ?? [null, null, null])];
  const toTrash: string[] = [];
  const toLrigTrash: string[] = [];
  const removedIids: string[] = []; // puppet_signi クリーンアップ用（instanceId）
  let trashedSigniLevel: number | undefined;
  let trashedPuppet = false;        // COST_TRASHED_PUPPET（`WDK17-014`）
  let trashedCount = 0;             // 実際に場から取り除いた**体数**
  const puppetSet = new Set(st.field.puppet_signi ?? []);
  for (const zi of zones) {
    const stack = newSigni[zi];
    if (!stack || stack.length === 0) continue;
    trashedCount++;
    // この方法でトラッシュに置いたシグニ（スタック最上段）のレベルを記録（`WX03-001`＝同じレベルのシグニを対象）
    const topSigni = p.cardMap.get(getCardNum(stack.at(-1)!));
    if (topSigni) trashedSigniLevel = parseInt(topSigni.Level ?? '0', 10) || 0;
    if (stack.some(iid => puppetSet.has(iid))) trashedPuppet = true;
    removedIids.push(...stack);
    if (p.cost?.fieldToLrigTrash) {
      toLrigTrash.push(stack.at(-1)!);
      toTrash.push(...stack.slice(0, -1));
    } else {
      toTrash.push(...stack);
    }
    if (newCharms[zi]) { toTrash.push(newCharms[zi]!); newCharms[zi] = null; }
    if (newAcce[zi])   { toTrash.push(...newAcce[zi]!); newAcce[zi] = null; }
    newSigni[zi] = null;
    newDown[zi] = false;
    newFrozen[zi] = false;
  }
  const destination = p.cost?.fieldToLrigTrash ? 'lrig_trash' : 'trash';
  const next: PlayerState = {
    ...st,
    field: { ...st.field, signi: newSigni, signi_down: newDown, signi_frozen: newFrozen,
      signi_charms: newCharms, signi_acce: newAcce,
      puppet_signi: (st.field.puppet_signi ?? []).filter(iid => !removedIids.includes(iid)) },
    trash: [...st.trash, ...toTrash],
    lrig_trash: destination === 'lrig_trash' ? [...st.lrig_trash, ...toLrigTrash] : st.lrig_trash,
    last_field_trash_level: trashedSigniLevel,
    last_cost_trashed_puppet: trashedPuppet,
    // ⚠**置き場へはインスタンス ID のまま**・記録だけカード番号（`effectExecutor` の TRASH コストと同じ形）。
    //   2026-10-20 まで置き場にも `getCardNum` を掛けており、同名2枚が同じ文字列になってリフレッシュ後に二重存在していた。
    last_cost_trashed_cards: [...(st.last_cost_trashed_cards ?? []), ...toTrash.map(getCardNum)],
    last_cost_field_trash_count: trashedCount,
  };
  const log = toTrash.length + toLrigTrash.length > 0
    ? `場のシグニ${trashedCount}体をコストで${destination === 'lrig_trash' ? 'ルリグトラッシュ' : 'トラッシュ'}へ`
    : null;
  return { state: next, log, trashedCount };
}

/**
 * `fieldTrash` コストの選択が**支払いとして成立しているか**（`upToCount` を含む）。
 * ⚠**候補の妥当性は `fieldTrashSelectableZones` が持つ**（ここは枚数の軸だけ）＝軸を2本にしない。
 */
export function fieldTrashCostCountOk(
  cost: { count: number; upToCount?: true } | undefined, selectedCount: number,
): boolean {
  if (!cost) return true;
  return cost.upToCount ? selectedCount <= cost.count : selectedCount === cost.count;
}
