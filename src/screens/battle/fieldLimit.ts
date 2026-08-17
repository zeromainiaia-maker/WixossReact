// 場のシグニ上限（LIMIT_ALL_FIELD_N）と fieldTrashGroups コストの判定。BattleScreen.tsx から Stage 0 で抽出。
import type { PlayerState, CardData } from '../../types';
import { getCardNum, matchesFilter } from '../../engine/effectExecutor';
import { matchesStateFilter } from '../../engine/effectEngine';
import { cloneAcceSlots } from '../../utils/acce';

export function fieldTrashSelectableZones(
  cost: { count: number; filter?: import('../../types/effects').TargetFilter; excludeSelf?: boolean } | undefined,
  state: PlayerState,
  cardMap: Map<string, CardData>,
  sourceZone?: number,
): number[] {
  if (!cost) return [];
  return [0, 1, 2].filter(zi => {
    const top = state.field.signi[zi]?.at(-1);
    if (!top || (cost.excludeSelf && zi === sourceZone)) return false;
    return matchesStateFilter(state, zi, cost.filter)
      && (!cost.filter || matchesFilter(cardMap.get(getCardNum(top)), cost.filter));
  });
}

export function fieldTrashGroupsSelectableZones(
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[] | undefined,
  state: PlayerState,
  cardMap: Map<string, CardData>,
): number[] {
  if (!groups?.length) return [];
  return [0, 1, 2].filter(zi => {
    const top = state.field.signi[zi]?.at(-1);
    if (!top) return false;
    return groups.some(g => matchesStateFilter(state, zi, g.filter)
      && (!g.filter || matchesFilter(cardMap.get(getCardNum(top)), g.filter)));
  });
}

export function fieldTrashSelectionSatisfied(
  cost: { count: number; filter?: import('../../types/effects').TargetFilter; excludeSelf?: boolean } | undefined,
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[] | undefined,
  selectedZones: number[],
  state: PlayerState,
  cardMap: Map<string, CardData>,
  sourceZone?: number,
): boolean {
  if (groups?.length) return fieldTrashGroupsSatisfied(groups, selectedZones, state.field.signi, cardMap);
  if (!cost) return selectedZones.length === 0;
  const selectable = new Set(fieldTrashSelectableZones(cost, state, cardMap, sourceZone));
  return selectedZones.length === cost.count && selectedZones.every(zi => selectable.has(zi));
}

// LIMIT_ALL_FIELD_N: すべてのプレイヤーのシグニ場出し数上限を継続STUBから算出（WX04-005-E3）。
// 自分／相手いずれかのセンタールリグが当該STUBを持てば両者に適用。最小値を採用。無ければ3。
export function computeFieldSigniLimit(
  myState: PlayerState,
  opState: PlayerState,
  effMap: Map<string, import('../../types/effects').CardEffect[]>,
  getCardNumFn: (id: string) => string,
): number {
  const fromLrig = (state: PlayerState): number | null => {
    const top = state.field.lrig.at(-1);
    if (!top) return null;
    let lim: number | null = null;
    for (const e of (effMap.get(top) ?? effMap.get(getCardNumFn(top)) ?? [])) {
      if (e.effectType !== 'CONTINUOUS') continue;
      const act = e.action as import('../../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      const mm = act.id.match(/^LIMIT_ALL_FIELD_(\d+)$/);
      if (mm) { const v = parseInt(mm[1], 10); lim = lim === null ? v : Math.min(lim, v); }
    }
    return lim;
  };
  const vals = [fromLrig(myState), fromLrig(opState)].filter((x): x is number => x !== null);
  return vals.length > 0 ? Math.min(...vals) : 3;
}

// fieldTrashGroups: 選択ゾーン集合が各グループ（異なるフィルタの組。例「＜アーム＞1体＋＜ウェポン＞1体」）を満たすか。
// 各選択ゾーンを、まだ枠の残るグループへ貪欲に割り当て、全グループが充足し、かつ余分な選択がないことを確認する。
export function fieldTrashGroupsSatisfied(
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[],
  selectedZones: number[],
  fieldSigni: (string[] | null)[],
  cardMap: Map<string, CardData>,
): boolean {
  const remaining = groups.map(g => g.count);
  for (const zi of selectedZones) {
    const top = fieldSigni[zi]?.at(-1);
    if (!top) return false;
    const card = cardMap.get(getCardNum(top));
    let assigned = false;
    for (let gi = 0; gi < groups.length; gi++) {
      if (remaining[gi] <= 0) continue;
      if (!groups[gi].filter || matchesFilter(card, groups[gi].filter)) { remaining[gi]--; assigned = true; break; }
    }
    if (!assigned) return false;
  }
  return remaining.every(r => r === 0);
}

// 場に fieldTrashGroups を充足するシグニ構成が存在するか（支払可否）。候補の少ないグループから貪欲に確保する。
export function fieldTrashGroupsAffordable(
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[],
  fieldSigni: (string[] | null)[],
  cardMap: Map<string, CardData>,
): boolean {
  const zoneCards = [0, 1, 2].map(zi => { const t = fieldSigni[zi]?.at(-1); return t ? cardMap.get(getCardNum(t)) : undefined; });
  const matchCount = (g: { filter?: import('../../types/effects').TargetFilter }) =>
    [0, 1, 2].filter(zi => zoneCards[zi] && (!g.filter || matchesFilter(zoneCards[zi], g.filter))).length;
  const order = groups.map((_, i) => i).sort((a, b) => matchCount(groups[a]) - matchCount(groups[b]));
  const used = new Set<number>();
  for (const gi of order) {
    let need = groups[gi].count;
    for (let zi = 0; zi < 3 && need > 0; zi++) {
      if (used.has(zi) || !zoneCards[zi]) continue;
      if (!groups[gi].filter || matchesFilter(zoneCards[zi], groups[gi].filter)) { used.add(zi); need--; }
    }
    if (need > 0) return false;
  }
  return true;
}

// LIMIT_ALL_FIELD_N 補足: 場のシグニを上限 limit 体まで減らす（既に超過なら、レベルの高い順に limit 体を残し
// 残りはスタックごとトラッシュへ）。WX04-005-E3「（すでに場に２体以上ある場合は１体になるようにシグニをトラッシュに置く）」。
// 注: ここでは選択UIなしの自動（レベル高優先・同レベルはゾーン順）。ON_LEAVE/ON_TRASH トリガーは未収集（要フォロー）。
export function reduceFieldSigniToLimit(
  state: PlayerState,
  limit: number,
  cardMap: Map<string, CardData>,
): { state: PlayerState; trashed: string[] } {
  const zones = state.field.signi
    .map((stk, zi) => ({ zi, stk: stk ?? [], top: (stk ?? []).at(-1) }))
    .filter(z => z.stk.length > 0);
  if (zones.length <= limit) return { state, trashed: [] };
  const sorted = [...zones].sort((a, b) => {
    const la = parseInt(cardMap.get(a.top!)?.Level ?? '0') || 0;
    const lb = parseInt(cardMap.get(b.top!)?.Level ?? '0') || 0;
    return lb - la; // レベル高い順に残す
  });
  const keep = new Set(sorted.slice(0, limit).map(z => z.zi));
  const newSigni = [...state.field.signi] as (string[] | null)[];
  const newDown = [...(state.field.signi_down ?? [false, false, false])] as boolean[];
  const newFrozen = [...(state.field.signi_frozen ?? [false, false, false])] as boolean[];
  const newCharms = state.field.signi_charms ? [...state.field.signi_charms] as (string | null)[] : undefined;
  // ⚠旧形式（素の string）を `[...cards]` で複製すると**1文字ずつの配列**に化けるので必ず正規化を通す（タスク12(cxxxiv)）。
  const newAcce = state.field.signi_acce ? cloneAcceSlots(state.field) : undefined;
  let trash = [...state.trash];
  const trashed: string[] = [];
  for (const z of zones) {
    if (keep.has(z.zi)) continue;
    trash = [...trash, ...z.stk];
    if (newCharms?.[z.zi]) trash.push(newCharms[z.zi]!);
    if (newAcce?.[z.zi]) trash.push(...newAcce[z.zi]!);
    if (z.top) trashed.push(z.top);
    newSigni[z.zi] = null;
    newDown[z.zi] = false;
    newFrozen[z.zi] = false;
    if (newCharms) newCharms[z.zi] = null;
    if (newAcce) newAcce[z.zi] = null;
  }
  return {
    state: {
      ...state,
      field: {
        ...state.field, signi: newSigni, signi_down: newDown, signi_frozen: newFrozen,
        ...(newCharms ? { signi_charms: newCharms } : {}),
        ...(newAcce ? { signi_acce: newAcce } : {}),
      },
      trash,
    },
    trashed,
  };
}
