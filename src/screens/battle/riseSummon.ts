// 【ライズ】の材料払い（トラッシュ／エナゾーンのカードを下に重ねる）＝§5.3 `O-147` 下位family B。
//
// 🔴**なぜ要るか**＝`getRiseRequirement` が材料つきライズ4枚（`WXEX1-35` `WXK05-035`
//   `WXDi-P06-034` `WXDi-P15-048`）を表せるようになるまで、この4枚は **`null`＝ライズ条件ごと消えていた**＝
//   **材料を1枚も払わずに空きシグニゾーンへ普通に召喚できる過剰実行**だった。
//
// ⚠**判定はこのファイル1本に集約する**（召喚ゾーンモーダルの活性化・`handleSummonSigni` の確定処理が
//   別々に書くと、押せるのに配置できない／押せないのに配置される、という片肺になる）。
import type { PlayerState, CardData } from '../../types';
import type { RiseMaterialSpec, RiseRequirement } from '../../engine/execUtils';
import { getCardNum, matchesFilter } from '../../engine/execUtils';

/** 選んだ材料1枚（`group` は `RiseRequirement.materials` の添字）。 */
export interface RiseMaterialItem { zone: 'trash' | 'energy'; index: number; group: number }

const zoneCards = (my: PlayerState, from: RiseMaterialSpec['from']): string[] =>
  (from === 'trash' ? my.trash : my.energy) ?? [];

const levelOf = (cardNum: string, cardMap: Map<string, CardData>): number =>
  parseInt(cardMap.get(cardNum)?.Level ?? '', 10) || 0;

/** その材料枠に選べる領域内の添字（フィルタ一致）。 */
export function riseMaterialOptions(
  my: PlayerState, spec: RiseMaterialSpec, cardMap: Map<string, CardData>,
): number[] {
  return zoneCards(my, spec.from)
    .map((c, i) => ({ num: getCardNum(c), i }))
    .filter(({ num }) => matchesFilter(cardMap.get(num), spec.filter))
    .map(({ i }) => i);
}

/**
 * 材料が**そもそも足りるか**（召喚先ゾーンを提示してよいかのゲート）。
 * ⚠「それぞれレベルの異なる」は**枚数ではなく相異なるレベルの数**で判定する
 *   （同レベルが5枚あっても `distinctLevel` の3枚は作れない）。
 */
export function canPayRiseMaterials(
  my: PlayerState, req: RiseRequirement, cardMap: Map<string, CardData>,
): boolean {
  return req.materials.every(spec => {
    const opts = riseMaterialOptions(my, spec, cardMap);
    if (spec.distinctLevel) {
      const levels = new Set(opts.map(i => levelOf(getCardNum(zoneCards(my, spec.from)[i]), cardMap)));
      return levels.size >= spec.count;
    }
    return opts.length >= spec.count;
  });
}

/** 選択が要求どおりか（枚数・領域・重複・レベル相異）。 */
export function validateRiseMaterials(
  my: PlayerState, req: RiseRequirement, items: RiseMaterialItem[], cardMap: Map<string, CardData>,
): boolean {
  if (items.length !== req.materials.reduce((s, m) => s + m.count, 0)) return false;
  return req.materials.every((spec, group) => {
    const inGroup = items.filter(i => i.group === group);
    if (inGroup.length !== spec.count) return false;
    if (new Set(inGroup.map(i => i.index)).size !== inGroup.length) return false;
    const opts = new Set(riseMaterialOptions(my, spec, cardMap));
    if (!inGroup.every(i => i.zone === spec.from && opts.has(i.index))) return false;
    if (spec.distinctLevel) {
      const levels = inGroup.map(i => levelOf(getCardNum(zoneCards(my, spec.from)[i.index] ?? ''), cardMap));
      if (new Set(levels).size !== levels.length) return false;
    }
    return true;
  });
}

/**
 * 選んだ材料を領域から取り除き、**下に重ねる順**（`materials` の並び＝原文の並び）で返す。
 * ⚠**添字は降順に削る**（昇順に削ると後続の添字がズレて別のカードが消える）。
 */
export function payRiseMaterials(
  my: PlayerState, req: RiseRequirement, items: RiseMaterialItem[],
): { trash: string[]; energy: string[]; stacked: string[] } {
  const trash = [...(my.trash ?? [])];
  const energy = [...(my.energy ?? [])];
  const stacked: string[] = [];
  for (let group = 0; group < req.materials.length; group++) {
    const spec = req.materials[group];
    const src = spec.from === 'trash' ? trash : energy;
    for (const i of items.filter(it => it.group === group).map(it => it.index).sort((a, b) => a - b)) {
      stacked.push(src[i]);
    }
  }
  for (const group of [...req.materials.keys()]) {
    const spec = req.materials[group];
    const src = spec.from === 'trash' ? trash : energy;
    for (const i of items.filter(it => it.group === group).map(it => it.index).sort((a, b) => b - a)) {
      src.splice(i, 1);
    }
  }
  return { trash, energy, stacked };
}
