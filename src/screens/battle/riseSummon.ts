// 【ライズ】の支払い＝§5.3 `O-147`。2つの軸がある。
//   ■**下位family B（材料）**＝トラッシュ／エナのカードを**下に重ねる**（4枚）。
//   ■**下位family A（多ゾーン消費）**＝場のシグニを**2〜3体消費して1ゾーンへ積む**（9枚）。
//
// 🔴**なぜ要るか**＝`getRiseRequirement` がこれらを表せるようになるまで、該当13枚は **`null`＝
//   ライズ条件ごと消えていた**＝**下敷きも材料も払わずに空きシグニゾーンへ普通に召喚できる過剰実行**だった。
//
// ⚠**判定はこのファイル1本に集約する**（召喚ゾーンモーダルの活性化・手札の「召喚」ゲート・
//   `handleSummonSigni` の確定処理が別々に書くと、押せるのに配置できない／押せないのに配置される、
//   という片肺になる）。
import type { PlayerState, CardData } from '../../types';
import type { RiseFieldGroup, RiseMaterialSpec, RiseRequirement } from '../../engine/execUtils';
import { getCardNum, matchesFilter, matchesRiseFilter, riseFieldTotal } from '../../engine/execUtils';

/** 選んだ材料1枚（`group` は `RiseRequirement.materials` の添字）。 */
export interface RiseMaterialItem { zone: 'trash' | 'energy'; index: number; group: number }

/** 消費する場のシグニ1体（`group` は `base.groups` の添字）。 */
export interface RiseFieldItem { zoneIndex: number; group: number }

/** モーダルが持ち回す選択の一式。⚠**この型で1つにまとめる**（引数を増やすと呼び出し側で取り違える）。 */
export interface RiseSelection { materials: RiseMaterialItem[]; fieldZones: RiseFieldItem[] }

export const EMPTY_RISE_SELECTION: RiseSelection = { materials: [], fieldZones: [] };

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

// ── 下位family A＝場のシグニを N体消費して1ゾーンへ積む（`WX16-027` ほか9枚） ──

const topOfZone = (my: PlayerState, zi: number): string | undefined => {
  const top = (my.field.signi[zi] ?? []).at(-1);
  return top ? getCardNum(top) : undefined;
};

/** そのシグニの色集合（多色は「赤黒」のように連結されている）。 */
const colorsOf = (cardNum: string, cardMap: Map<string, CardData>): string[] =>
  [...(cardMap.get(cardNum)?.Color ?? '')].filter(c => '白赤青緑黒'.includes(c));

/** その枠に選べるシグニゾーン（トップが条件を満たすゾーン）。 */
export function riseFieldOptions(
  my: PlayerState, group: RiseFieldGroup, cardMap: Map<string, CardData>,
): number[] {
  return [0, 1, 2].filter(zi => {
    const top = topOfZone(my, zi);
    // ⚠**`matchesRiseFilter` を通す**（《ライズアイコン》は `matchesFilter` では判定できない＝
    //   `WX17-026` の第1枠がここで落ちる）。
    return !!top && matchesRiseFilter(top, group.filter, cardMap);
  });
}

/** 選んだシグニどうしの制約（レベル相異／色を共有しない）を満たすか。 */
function satisfiesRiseFieldConstraints(
  my: PlayerState, req: RiseRequirement, zones: number[], cardMap: Map<string, CardData>,
): boolean {
  if (req.base.kind !== 'field') return true;
  const nums = zones.map(zi => topOfZone(my, zi)).filter((n): n is string => !!n);
  if (nums.length !== zones.length) return false;
  if (req.base.distinctLevel) {
    const levels = nums.map(n => levelOf(n, cardMap));
    if (new Set(levels).size !== levels.length) return false;
  }
  if (req.base.distinctColor) {
    // 「共通する色を持たない」＝どの2体も色を1つも共有しない（多色シグニがあるので集合で見る）。
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const a = colorsOf(nums[i], cardMap), b = colorsOf(nums[j], cardMap);
        if (a.some(c => b.includes(c))) return false;
      }
    }
  }
  return true;
}

/**
 * 配置先の枠を**そもそも満たせるか**（手札の「召喚」ゲートとゾーン提示の前提）。
 * ⚠**枠ごとの枚数だけでは足りない**＝同じゾーンが複数の枠の候補になるので、
 *   **枠へのゾーンの割り当て（二部マッチング）**が成立するかを見る。ゾーンは3つなので総当たりでよい。
 */
export function canPayRiseField(
  my: PlayerState, req: RiseRequirement, cardMap: Map<string, CardData>,
): boolean {
  if (req.base.kind !== 'field') return true;
  return !!findRiseFieldAssignment(my, req, cardMap);
}

/** 枠を満たす割り当てを1つ探す（見つからなければ null）。制約も同時に見る。 */
export function findRiseFieldAssignment(
  my: PlayerState, req: RiseRequirement, cardMap: Map<string, CardData>,
): RiseFieldItem[] | null {
  if (req.base.kind !== 'field') return null;
  const groups = req.base.groups;
  const need: number[] = [];
  groups.forEach((g, gi) => { for (let k = 0; k < g.count; k++) need.push(gi); });
  const options = groups.map(g => riseFieldOptions(my, g, cardMap));
  const chosen: RiseFieldItem[] = [];
  const used = new Set<number>();
  const walk = (i: number): boolean => {
    if (i === need.length) {
      return satisfiesRiseFieldConstraints(my, req, chosen.map(c => c.zoneIndex), cardMap);
    }
    const gi = need[i];
    for (const zi of options[gi]) {
      if (used.has(zi)) continue;
      used.add(zi); chosen.push({ zoneIndex: zi, group: gi });
      if (walk(i + 1)) return true;
      used.delete(zi); chosen.pop();
    }
    return false;
  };
  return walk(0) ? [...chosen] : null;
}

/** 選択が要求どおりか（枠ごとの体数・重複なし・条件一致・制約）。 */
export function validateRiseField(
  my: PlayerState, req: RiseRequirement, items: RiseFieldItem[], cardMap: Map<string, CardData>,
): boolean {
  if (req.base.kind !== 'field') return items.length === 0;
  if (items.length !== riseFieldTotal(req.base)) return false;
  if (new Set(items.map(i => i.zoneIndex)).size !== items.length) return false;
  const ok = req.base.groups.every((g, gi) => {
    const inGroup = items.filter(i => i.group === gi);
    if (inGroup.length !== g.count) return false;
    const opts = new Set(riseFieldOptions(my, g, cardMap));
    return inGroup.every(i => opts.has(i.zoneIndex));
  });
  if (!ok) return false;
  return satisfiesRiseFieldConstraints(my, req, items.map(i => i.zoneIndex), cardMap);
}

/**
 * 消費するゾーンの一覧（単体ライズ＝配置先1ゾーンだけ／多ゾーン＝選んだ全ゾーン）。
 * 🔑**配置先は必ずこの中の1つ**＝原文の「どちらかのシグニがあるシグニゾーンに出す」。
 */
export function riseConsumedZones(
  req: RiseRequirement | null, selection: RiseSelection, destinationZone: number,
): number[] {
  if (req?.base.kind !== 'field') return [];
  if (riseFieldTotal(req.base) <= 1) return [destinationZone];
  return selection.fieldZones.map(f => f.zoneIndex);
}
