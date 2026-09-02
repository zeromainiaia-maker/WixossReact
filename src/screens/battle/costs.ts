// コスト文字列の解析・軽減適用・支払可否判定（グロウ/アーツ/スペル共通）。BattleScreen.tsx から Stage 0 で抽出。
import type { PlayerState, CardData } from '../../types';
import type {
  BetCostSpec, CardEffect, CostReplacementTerm, CostReplacementWhen, CostScalingCount, CostScalingTerm,
  EncoreCostSpec, TargetFilter,
} from '../../types/effects';
import { LRIG_ALL_NAMES_SENTINEL, checkActiveCondition } from '../../engine/effectEngine';
import { getCardNum } from '../../engine/effectExecutor';
import { fieldCandidates, matchesFilter, satisfiesSelectionConstraint, canAddToSelection, splitColors } from '../../engine/execUtils';
import { toHalfWidth } from './battleUtils';

/** WX15-067: 使用宣言中に選んだ相手ウィルス数を、このスペルだけのコストへ適用する。 */
export function applyMeltFactPreUseCost(cardNum: string, cost: string, virusRemovalByZone?: number[]): string {
  if (cardNum !== 'WX15-067') return cost;
  const removed = (virusRemovalByZone ?? []).reduce((sum, n) => sum + n, 0);
  return removed >= 1 ? removeNColorFromCost(cost, '黒', 2) : cost;
}

/** 【起】UIで実際に捨てた各コストを、動的効果が読む1つの枚数へ集約する。 */
export function activatedDiscardPaidCount(
  fixedDiscardCount: number,
  discardAllCount: number,
  energyTrashAllCount: number,
  variableDiscardCount: number,
): number {
  return fixedDiscardCount + discardAllCount + energyTrashAllCount + variableDiscardCount;
}

/**
 * 「このターンに**手札から**捨てた」台帳を積む唯一の入口（`V-101`② / 2026-08-31）。
 *
 * 🔴**2つのフィールドは必ず同時に書く**＝`turn_hand_discarded_count`（枚数）と
 *   `turn_hand_discarded_cards`（実体）。条件側は用途で読み分けており、
 *   `HAND_DISCARDED_THIS_TURN{filter}`（`effectEngine.ts` / `execUtils.ts`）は**実体を絞って数える**ので、
 *   枚数だけ書いて実体を落とすと**その捨て経路からは条件が永久に false**になる（無言 no-op）。
 *   実際、スペルを**手札から**使ったときの支払いだけ枚数しか書いておらず、
 *   ルリグデッキから使った枝とで挙動が食い違っていた。
 *
 * ⚠**「捨てる」以外を渡さない**＝`handToEnergy`（エナへ）／`handToUnder`（このシグニの下へ）／
 *   `energyTrash`（エナから）は**手札を捨てていない**ので台帳に載せてはいけない。
 * ⚠ターン終了時のルール処理（手札上限超過）はここを通していない＝あの捨ては
 *   `turn_*` がリセットされる境界と同じ地点で起きるので、載せると寿命が1ティックの値になる。
 */
export function handDiscardHistoryRecord(
  prev: Pick<PlayerState, 'turn_hand_discarded_count' | 'turn_hand_discarded_cards'>,
  discarded: readonly string[],
): Pick<PlayerState, 'turn_hand_discarded_count' | 'turn_hand_discarded_cards'> {
  if (discarded.length === 0) {
    return {
      turn_hand_discarded_count: prev.turn_hand_discarded_count,
      turn_hand_discarded_cards: prev.turn_hand_discarded_cards,
    };
  }
  return {
    turn_hand_discarded_count: (prev.turn_hand_discarded_count ?? 0) + discarded.length,
    turn_hand_discarded_cards: [...(prev.turn_hand_discarded_cards ?? []), ...discarded],
  };
}

/** BattleScreen の起動コスト支払いが条件評価へ渡す枚数記録。 */
export function activatedDiscardCostRecord(
  fixedDiscardCount: number,
  discardAllCount: number,
  energyTrashAllCount: number,
  variableDiscardCount: number,
): Pick<PlayerState, 'last_activated_discard_count'> {
  return {
    last_activated_discard_count: activatedDiscardPaidCount(
      fixedDiscardCount, discardAllCount, energyTrashAllCount, variableDiscardCount,
    ),
  };
}

/** 指定 energyTrash コストで選んだ枚数（通常の色エナコストは含めない）。 */
export function activatedEnergyTrashPaidCount(selected: Set<number>): number {
  return selected.size;
}

// ===== `cost.energyTrash` の集合制約（「それぞれレベルの異なる」等）＝2026-08-18 §5d-0 (ii) =====
// ⚠**型（`EffectCost.energyTrash.selectionConstraint`）は前からあったが、支払いUIは `size >= count` しか
//   見ておらず完全な死フラグだった**（BUGFIXES 続き16245 の「コスト側の集合制約は運搬契約が未整備」がそのまま残存）。
//   parser 側の regex も5つの言い回しを**捕捉しておきながら2つしか写していなかった**ので、
//   「エナゾーンからそれぞれレベルの異なるシグニ３枚をトラッシュに置く」は**同じレベル3枚でも払えた**。
// ⚠**支払いモーダルは3つある**（`SigniActivatedModal`／`LrigGrantedModal`／`SigniOnPlayCostModal`）＝
//   1つ落とすと「その入口からだけ制約なしで払える」ことになる（続き546 の教訓「支払い地点と提示地点は別々に数える」）。
//   写経を防ぐためにここを**唯一の判定**にする。

/** エナゾーンの index 集合 → カード番号列（`satisfiesSelectionConstraint` は番号で判定する）。 */
export function energyTrashSelectedNums(energy: string[], selected: Set<number>): string[] {
  return [...selected].filter(i => i >= 0 && i < energy.length).map(i => energy[i]);
}

/**
 * `cost.energyTrash` の選択が**枚数と集合制約の両方**を満たすか（支払いボタンの可否）。
 * `atLeast` のときは枚数の上限が無いだけで、集合制約は同じく効く。
 */
export function energyTrashCostSatisfied(
  energy: string[],
  selected: Set<number>,
  spec: { count: number; atLeast?: boolean; selectionConstraint?: import('../../types/effects').SelectionConstraint } | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec) return true;
  if (selected.size < spec.count) return false;
  return satisfiesSelectionConstraint(energyTrashSelectedNums(energy, selected), spec.selectionConstraint, cardMap);
}

/**
 * エナゾーンの index を1枚**追加できるか**（カードをタップした瞬間のガード）。
 * ⚠枚数上限だけでなく集合制約も見る＝**制約を壊す組み合わせは選べない**（選んでから赤くするのではなく弾く。
 *   `EffectInteractionModal` の効果解決側 `canAddToSelection` と同じ作法）。
 */
export function canAddEnergyTrashIndex(
  energy: string[],
  selected: Set<number>,
  index: number,
  spec: { count: number; atLeast?: boolean; selectionConstraint?: import('../../types/effects').SelectionConstraint } | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec) return false;
  if (selected.has(index)) return true;                       // 解除は常に可
  if (!spec.atLeast && selected.size >= spec.count) return false;
  const num = energy[index];
  if (num === undefined) return false;
  return canAddToSelection(energyTrashSelectedNums(energy, selected), num, spec.selectionConstraint, cardMap);
}

/**
 * `cost.energyTrashGroups` の選択が**全グループを充足するか**
 * （「エナゾーンから《A》1枚と《B》1枚と《C》1枚をトラッシュに置く」＝`WXK03-070-E1`）。
 *
 * 🔴**先着順の貪欲割り当てでは足りない**＝フィルタが重なるグループがあると、
 *   先に緩いグループへ吸われて厳しいグループが埋まらず**払えるのに払えないと判定する**。
 *   ⇒ グループ数は実データで最大3なので**総当たりの割り当て**で判定する
 *     （`fieldTrashGroupsSatisfied` の貪欲版とは別に、こちらは重なりを許す）。
 * ⚠**判定はこの1本に集約する**＝可否ゲートと支払いUIで写経すると片肺になる（`energyTrash` 側と同じ規律）。
 */
export function energyTrashGroupsSatisfied(
  energy: string[],
  selected: Set<number>,
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[] | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!groups?.length) return true;
  const need = groups.reduce((n, g) => n + g.count, 0);
  const nums = energyTrashSelectedNums(energy, selected);
  if (nums.length !== need) return false;
  // 各グループを「あと何枚必要か」で持ち、選択カードを1枚ずつ総当たりで割り当てる。
  const remaining = groups.map(g => g.count);
  const assign = (i: number): boolean => {
    if (i >= nums.length) return remaining.every(r => r === 0);
    const card = cardMap.get(getCardNum(nums[i]));
    for (let gi = 0; gi < groups.length; gi++) {
      if (remaining[gi] <= 0) continue;
      if (groups[gi].filter && !matchesFilter(card, groups[gi].filter)) continue;
      remaining[gi]--;
      if (assign(i + 1)) return true;
      remaining[gi]++;
    }
    return false;
  };
  return assign(0);
}

/**
 * `cost.energyTrashGroups` でエナ index を1枚**追加できるか**（タップ時のガード）。
 * ⚠**「どれかのグループに入りうる」だけでは足りない**＝残りの選択で全グループを埋められる見込みが要るので、
 *   仮に足した集合が**まだ充足可能か**（＝部分割り当てが成立するか）で判定する。
 */
export function canAddEnergyTrashGroupIndex(
  energy: string[],
  selected: Set<number>,
  index: number,
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[] | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!groups?.length) return false;
  if (selected.has(index)) return true;                       // 解除は常に可
  const need = groups.reduce((n, g) => n + g.count, 0);
  if (selected.size >= need) return false;
  if (energy[index] === undefined) return false;
  const nums = [...energyTrashSelectedNums(energy, selected), energy[index]];
  const remaining = groups.map(g => g.count);
  const assign = (i: number): boolean => {
    if (i >= nums.length) return true;                        // 途中経過なので「残り0」までは求めない
    const card = cardMap.get(getCardNum(nums[i]));
    for (let gi = 0; gi < groups.length; gi++) {
      if (remaining[gi] <= 0) continue;
      if (groups[gi].filter && !matchesFilter(card, groups[gi].filter)) continue;
      remaining[gi]--;
      if (assign(i + 1)) return true;
      remaining[gi]++;
    }
    return false;
  };
  return assign(0);
}

/** `cost.energyTrashGroups` を**そもそも払えるか**（エナゾーンに必要な構成が存在するか）。 */
export function energyTrashGroupsAffordable(
  energy: string[],
  groups: { count: number; filter?: import('../../types/effects').TargetFilter }[] | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!groups?.length) return true;
  const used = new Set<number>();
  // 候補の少ないグループから確保する（`fieldTrashGroupsAffordable` と同じ規約）。
  const order = groups
    .map((g, gi) => ({ gi, g, cands: energy.map((_, i) => i).filter(i => !g.filter || matchesFilter(cardMap.get(getCardNum(energy[i])), g.filter)) }))
    .sort((a, b) => a.cands.length - b.cands.length);
  for (const { g, cands } of order) {
    let take = g.count;
    for (const i of cands) {
      if (take <= 0) break;
      if (used.has(i)) continue;
      used.add(i); take--;
    }
    if (take > 0) return false;
  }
  return true;
}

/**
 * §5.3 `O-108`：`handDiscardSigni` コストの選択が**集合制約**（「それぞれ名前の異なる」）まで満たすか。
 * ⚠**可否ゲート（`signiActivateGate`）と支払いUI（各モーダル）が同じ関数を通る**ようにしてある。
 *   写経すると「提示は絞られるのに支払いは通る」片肺になる（`energyTrash` 側と同じ規律）。
 */
export function handDiscardSigniCostSatisfied(
  hand: string[],
  selected: Set<number>,
  spec: NonNullable<import('../../types/effects').EffectCost['handDiscardSigni']> | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec) return true;
  if (selected.size < spec.count) return false;
  const nums = [...selected].map(i => hand[i]).filter((n): n is string => n !== undefined);
  return satisfiesSelectionConstraint(nums, spec.selectionConstraint, cardMap);
}

/** 手札の index を1枚**追加できるか**（タップした瞬間のガード）。制約を壊す組み合わせは選ばせない。 */
export function canAddHandDiscardSigniIndex(
  hand: string[],
  selected: Set<number>,
  index: number,
  spec: NonNullable<import('../../types/effects').EffectCost['handDiscardSigni']> | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec) return false;
  if (selected.has(index)) return true;                    // 解除は常に可
  if (selected.size >= spec.count) return false;
  const num = hand[index];
  if (num === undefined) return false;
  if (!matchesHandDiscardSigni(cardMap.get(getCardNum(num)), spec)) return false;
  const nums = [...selected].map(i => hand[i]).filter((n): n is string => n !== undefined);
  return canAddToSelection(nums, num, spec.selectionConstraint, cardMap);
}

/**
 * 可否ゲート用＝手札に**制約を満たす組み合わせ**が存在するか。
 * 「それぞれ名前の異なる」は**異なる名前の枚数**で数える（同名を重複して数えない＝fail-closed）。
 */
export function handDiscardSigniAffordable(
  hand: string[],
  spec: NonNullable<import('../../types/effects').EffectCost['handDiscardSigni']> | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec) return true;
  const cands = hand.filter(n => matchesHandDiscardSigni(cardMap.get(getCardNum(n)), spec));
  if (spec.selectionConstraint?.distinct === 'name') {
    const names = new Set(cands.map(n => cardMap.get(getCardNum(n))?.CardName).filter(Boolean));
    return names.size >= spec.count;
  }
  return cands.length >= spec.count;
}

/**
 * §5.3 `O-206`：`cost.trashExile` の選択が**集合制約**（「それぞれ名前の異なるスペル3枚」）まで満たすか。
 *
 * 🔴**型（`EffectCost.trashExile.selectionConstraint`）は 2026-08-31 続き748 から在ったのに、
 *   支払いUIは `size >= count` しか見ておらず完全な死フラグだった**＝`WXK09-029-E2` は
 *   **同名のスペル3枚でも払えた**（原文より軽い踏み倒し）。`energyTrash` 側とまったく同じ穴。
 * ⚠**支払いモーダルは2つある**（`SigniActivatedModal`／`LrigGrantedModal`）＝
 *   1つ落とすと「その入口からだけ制約なしで払える」ことになる。**判定はここ1本に集約する。**
 */
export function trashExileSelectedNums(trash: string[], selected: Set<number>): string[] {
  return [...selected].filter(i => i >= 0 && i < trash.length).map(i => trash[i]);
}

/** `cost.trashExile` の選択が**枚数と集合制約の両方**を満たすか（支払いボタンの可否）。 */
export function trashExileCostSatisfied(
  trash: string[],
  selected: Set<number>,
  spec: import('../../types/effects').EffectCost['trashExile'] | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec || spec.self) return true;
  if (selected.size < (spec.count ?? 1)) return false;
  return satisfiesSelectionConstraint(trashExileSelectedNums(trash, selected), spec.selectionConstraint, cardMap);
}

/**
 * トラッシュの index を1枚**追加できるか**（カードをタップした瞬間のガード）。
 * ⚠枚数上限だけでなく集合制約も見る＝**制約を壊す組み合わせは選べない**（`energyTrash` 側と同じ作法）。
 */
export function canAddTrashExileIndex(
  trash: string[],
  selected: Set<number>,
  index: number,
  spec: import('../../types/effects').EffectCost['trashExile'] | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec || spec.self) return false;
  if (selected.has(index)) return true;                       // 解除は常に可
  if (selected.size >= (spec.count ?? 1)) return false;
  const num = trash[index];
  if (num === undefined) return false;
  if (spec.filter && !matchesFilter(cardMap.get(getCardNum(num)), spec.filter)) return false;
  return canAddToSelection(trashExileSelectedNums(trash, selected), num, spec.selectionConstraint, cardMap);
}

/**
 * 可否ゲート用＝トラッシュに**制約を満たす組み合わせ**が存在するか。
 * 「それぞれ名前の異なる」は**異なる名前の枚数**で数える（`handDiscardSigniAffordable` と同じ規約）。
 */
export function trashExileAffordable(
  trash: string[],
  spec: import('../../types/effects').EffectCost['trashExile'] | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!spec || spec.self) return true;
  const cands = trash.filter(n => !spec.filter || matchesFilter(cardMap.get(getCardNum(n)), spec.filter));
  if (spec.selectionConstraint?.distinct === 'name') {
    const names = new Set(cands.map(n => cardMap.get(getCardNum(n))?.CardName).filter(Boolean));
    return names.size >= (spec.count ?? 1);
  }
  return cands.length >= (spec.count ?? 1);
}

/** エクシードで選べる「各ルリグの一番上を除いたカード」。placedState 基準で呼ぶ。 */
export function exceedPoolOf(state: PlayerState): string[] {
  return [
    ...state.field.lrig.slice(0, -1),
    ...(state.field.assist_lrig_l?.slice(0, -1) ?? []),
    ...(state.field.assist_lrig_r?.slice(0, -1) ?? []),
  ];
}

/**
 * エクシードの**色指定**（`cost.exceedColors`）を満たす組み合わせが `cards` の中に在るか。
 * `['白','赤']` は「白1枚＋赤1枚」＝**各色をそれぞれ別のカードで**満たす。
 * ⚠**`cardMap` が引けないときは満たさない扱い**（fail-closed）＝色を確かめられないまま払わせない。
 * ⚠多色カードが絡む割り当ては貪欲法で見る（実データは単色指定が最大2色なので十分）。
 */
export function exceedColorsSatisfied(
  cards: string[], colors: string[] | undefined, cardMap?: Map<string, CardData>,
): boolean {
  if (!colors || colors.length === 0) return true;
  if (!cardMap) return false;
  const used = new Set<number>();
  return colors.every(col => {
    const idx = cards.findIndex((cn, i) => !used.has(i) && (cardMap.get(cn)?.Color ?? '').includes(col));
    if (idx < 0) return false;
    used.add(idx);
    return true;
  });
}

export function canPayExceed(
  state: PlayerState, count: number, colors?: string[], cardMap?: Map<string, CardData>,
): boolean {
  if (count <= 0) return true;
  const pool = exceedPoolOf(state);
  if (pool.length < count) return false;
  // 色指定があるなら、プールの中にその色を別々のカードで満たせる組があること。
  return exceedColorsSatisfied(pool, colors, cardMap);
}

/** UI で選んだプール index のカードをルリグトラッシュへ移す。選択不正時は null。 */
export function paySelectedExceed(
  state: PlayerState, count: number, selectedIndices: Set<number>,
  colors?: string[], cardMap?: Map<string, CardData>,
): PlayerState | null {
  if (count <= 0) return state;
  const pool = exceedPoolOf(state);
  if (selectedIndices.size !== count || [...selectedIndices].some(i => i < 0 || i >= pool.length)) return null;
  const selected = new Set([...selectedIndices].map(i => pool[i]));
  // 🆕色指定（`WX10-001`「エクシード１（白のカード）」）＝**支払い実行地点でも必ず見る**。
  //   ゲートだけに置くと UI を迂回した経路で踏み倒せる（§4.2「3地点を grep」）。
  if (!exceedColorsSatisfied([...selected], colors, cardMap)) return null;
  return {
    ...state,
    lrig_trash: [...state.lrig_trash, ...selected],
    field: {
      ...state.field,
      lrig: state.field.lrig.filter(id => !selected.has(id)),
      assist_lrig_l: state.field.assist_lrig_l?.filter(id => !selected.has(id)),
      assist_lrig_r: state.field.assist_lrig_r?.filter(id => !selected.has(id)),
    },
  };
}

// handDiscardSigniコストの色/クラス部ラベル（配列はOR=「か」結合）
export function fmtHandDiscardSigniLabel(hd: { color?: string | string[]; story?: string | string[]; level?: number }): string {
  const colors = hd.color ? (Array.isArray(hd.color) ? hd.color : [hd.color]) : [];
  const stories = hd.story ? (Array.isArray(hd.story) ? hd.story : [hd.story]) : [];
  return `${hd.level !== undefined ? `レベル${hd.level}の` : ''}${colors.join('か')}${stories.map(s => `＜${s}＞`).join('か')}`;
}

/**
 * handDiscardSigni コスト（色／＜クラス＞／レベルのOR条件）に手札の1枚が合致するか。
 * ⚠ 支払いUI（ルリグ付与【起】・トラッシュ自己起動【起】）で共有する唯一の判定。
 *   個別モーダルに写経すると `level` 指定（WXK03-047 等6効果）だけ片方で落ちる。
 */
export function matchesHandDiscardSigni(
  card: CardData | undefined,
  hd: NonNullable<import('../../types/effects').EffectCost['handDiscardSigni']>,
): boolean {
  if (card?.Type !== 'シグニ') return false;
  const colors = hd.color ? (Array.isArray(hd.color) ? hd.color : [hd.color]) : null;
  const stories = hd.story ? (Array.isArray(hd.story) ? hd.story : [hd.story]) : null;
  if (colors && !colors.some(col => card.Color?.includes(col))) return false;
  if (stories && !stories.some(st => (card.CardClass ?? '').includes(st))) return false;
  if (hd.level !== undefined && Number(card.Level) !== hd.level) return false;
  return true;
}

// discardFilter/discardGroupsのフィルタ内容ラベル（「青の＜電機＞のシグニ」等）
export function fmtDiscardFilterLabel(f: import('../../types/effects').TargetFilter | undefined): string {
  if (!f) return '';
  const parts: string[] = [];
  if (f.story) parts.push((Array.isArray(f.story) ? f.story : [f.story]).map(s => `＜${s}＞`).join('か'));
  if (f.color) parts.push((Array.isArray(f.color) ? f.color : [f.color]).join('か'));
  if (f.cardName) parts.push(`《${f.cardName}》`);
  if (typeof f.level === 'number') parts.push(`レベル${f.level}`);
  if (f.hasIcon) parts.push(`《${f.hasIcon}アイコン》を持つ`);
  if (f.hasGuard) parts.push('《ガードアイコン》を持つ');
  if (f.cardType === 'シグニ' || (Array.isArray(f.cardType) && f.cardType.includes('シグニ'))) parts.push('シグニ');
  if (f.cardType === 'スペル' || (Array.isArray(f.cardType) && f.cardType.includes('スペル'))) parts.push('スペル');
  return parts.join('の');
}

// グロウコストのパース: "《白》×１《赤》×２" → [{color:'白',count:1},{color:'赤',count:2}]
export function parseGrowCost(raw: string): { color: string; count: number }[] {
  if (!raw || raw === 'なし' || raw === '-') return [];
  const result: { color: string; count: number }[] = [];
  for (const m of raw.matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
    if (m[1] === 'コイン') continue; // コインはエナではない。parseCoinCostで別処理
    const count = parseInt(toHalfWidth(m[2]));
    if (count > 0) result.push({ color: m[1], count });
  }
  return result;
}

// コスト文字列から指定色をN個減らす
export function removeNColorFromCost(cost: string, color: string, n: number): string {
  const parts = parseGrowCost(cost);
  const idx = parts.findIndex(p => p.color === color);
  if (idx < 0) return cost;
  const newParts = [...parts];
  newParts[idx] = { color: newParts[idx].color, count: Math.max(0, newParts[idx].count - n) };
  const result = newParts.filter(p => p.count > 0).map(p => `《${p.color}》×${p.count}`).join('');
  return result || 'なし';
}

/**
 * コスト文字列に指定色を N 個**足す**（`removeNColorFromCost` の逆。タスク12(xciv)）。
 * 「使用コストは…《赤×1》**増え**、…《赤×1》減る」（`WX08-026`）のように**増と減が同一文**にある形で要る。
 * 既存の増加機構（`ActiveCostMod{direction:'increase'}` → `extraArtsCosts`）は**場の CONTINUOUS 由来**で、
 * カード自身の原文に書かれた増加は表せなかった。
 */
export function addNColorToCost(cost: string, color: string, n: number): string {
  if (n <= 0) return cost;
  const parts = parseGrowCost(cost);
  const idx = parts.findIndex(p => p.color === color);
  const newParts = idx >= 0
    ? parts.map((p, i) => (i === idx ? { color: p.color, count: p.count + n } : p))
    : [...parts, { color, count: n }];
  return newParts.filter(p => p.count > 0).map(p => `《${p.color}》×${p.count}`).join('') || 'なし';
}

/** カードの全効果から、カード自身の使用コスト比例増減 payload を1本で取り出す。 */
export function costScalingOf(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): CostScalingTerm[] | undefined {
  const terms = (effectsMap.get(getCardNum(cardNum)) ?? []).flatMap(effect => effect.cost?.costScaling ?? []);
  return terms.length > 0 ? terms : undefined;
}

type CostScalingState = {
  life_cloth?: string[];
  hand?: string[];
  field?: PlayerState['field'];
  trash?: string[];
  lrig_trash?: string[];
  energy?: string[];
  coins?: number;
};

function scalingOwnerState(
  owner: CostScalingCount['owner'],
  myState: CostScalingState,
  oppState: CostScalingState | undefined,
): CostScalingState | null {
  if (owner === 'self') return myState;
  if (owner === 'opponent') return oppState ?? null;
  // 今回の語彙は所有者を必ず明記する。「any」を片側へ潰すと安くなるため未評価に倒す。
  return null;
}

/** 1つの count 記述を現在盤面の整数へ解決する。参照不能は 0 ではなく null（fail-closed）。 */
function resolveCostScalingCount(
  count: CostScalingCount,
  myState: CostScalingState,
  oppState: CostScalingState | undefined,
  cardMap: Map<string, CardData> | undefined,
): number | null {
  // 手札の**差**だけは両者の state を要る＝所有者1人ぶんへ潰せない（`WD16-006`）。
  if (count.kind === 'handDiff') {
    const mine = scalingOwnerState(count.owner, myState, oppState);
    const theirs = scalingOwnerState(count.owner === 'self' ? 'opponent' : 'self', myState, oppState);
    if (!mine || !theirs || !Array.isArray(mine.hand) || !Array.isArray(theirs.hand)) return null;
    return Math.max(0, mine.hand.length - theirs.hand.length);
  }

  const state = scalingOwnerState(count.owner, myState, oppState);
  if (!state) return null;

  if (count.kind === 'lrigLevel') {
    const center = state.field?.lrig?.at(-1);
    if (!center || !cardMap) return null;
    const level = parseInt(cardMap.get(center)?.Level ?? '', 10);
    return Number.isFinite(level) ? level : null;
  }
  if (count.kind === 'coins') return typeof state.coins === 'number' ? state.coins : null;
  if (count.kind === 'charm') {
    if (!state.field) return null;
    return (state.field.signi_charms ?? []).filter(Boolean).length;
  }
  if (count.kind === 'virus') {
    if (!state.field) return null;
    return (state.field.signi_virus ?? []).reduce((sum, n) => sum + (n || 0), 0);
  }
  if (count.kind === 'fieldLrig') {
    if (!state.field || !cardMap) return null;
    const tops = [state.field.lrig?.at(-1), state.field.assist_lrig_l?.at(-1), state.field.assist_lrig_r?.at(-1)]
      .filter((n): n is string => !!n);
    return tops.filter(cardNum => matchesFilter(cardMap.get(cardNum), count.filter)).length;
  }
  if (count.kind !== 'zone') return null;
  if (count.zone === 'field') {
    if (!state.field || !cardMap) return null;
    // hasAcce / isFrozen / noAbilities 等の盤面状態 filter も既存の唯一の候補評価器へ委ねる。
    return fieldCandidates(state as PlayerState, count.filter, cardMap).length;
  }
  const cards = state[count.zone];
  if (!Array.isArray(cards)) return null;
  if (!count.filter) return cards.length;
  if (!cardMap) return null;
  return cards.filter(cardNum => matchesFilter(cardMap.get(cardNum), count.filter as TargetFilter)).length;
}

/** payload 経路の比例増減。必要な owner/state を読めなければ null を返し、呼び出し側を従来経路へ落とす。 */
export function applyCostScalingTerms(
  base: string,
  terms: CostScalingTerm[],
  myState: CostScalingState,
  oppState: CostScalingState | undefined,
  cardMap: Map<string, CardData> | undefined,
): string | null {
  let out = base;
  for (const term of terms) {
    if (!Number.isFinite(term.per) || term.per <= 0 || term.counts.length === 0 || term.amount.length === 0) return null;
    const counts = term.counts.map(count => resolveCostScalingCount(count, myState, oppState, cardMap));
    if (counts.some(count => count === null)) return null;
    const total = (counts as number[]).reduce((sum, count) => sum + count, 0);
    if (term.minCount !== undefined && total < term.minCount) continue;
    const times = Math.floor(total / term.per);
    if (times <= 0) continue;
    for (const amount of term.amount) {
      out = term.direction === 'increase'
        ? addNColorToCost(out, amount.color, amount.count * times)
        : removeNColorFromCost(out, amount.color, amount.count * times);
    }
  }
  return out;
}

// 場のCONTINUOUS COST_REDUCTION（コードハートVAC「青のスペルのコストは《無×1》減る」等）をコスト文字列に適用する。
// 《無》軽減はコストの無色部分のみ減る（無色部分がなければ軽減なし＝removeNColorFromCostの挙動）
export function applyContinuousCostDecreases(
  cost: string,
  cardType: 'スペル' | 'アーツ',
  cardColor: string | undefined,
  mods: import('../../engine/effectEngine').ActiveCostMod[],
): string {
  let result = cost;
  for (const m of mods) {
    if (m.direction !== 'decrease' || m.targetCardType !== cardType) continue;
    if (m.cardColor) {
      const colors = m.cardColor.match(/[白青赤緑黒無]/g) ?? [];
      if (colors.length > 0 && !colors.some(c => cardColor?.includes(c))) continue;
    }
    for (const r of m.amount) result = removeNColorFromCost(result, r.color, r.count);
  }
  return result;
}

// GROW_COST_REDUCTION（場のCONTINUOUS「あなたのグロウコストは《色×N》減る」）をグロウコスト文字列へ適用する。
// reductions は collectGrowCostReductions の色別集計。各色を removeNColorFromCost で減算（0未満はクランプ）。
export function applyGrowCostReduction(cost: string, reductions: { color: string; count: number }[]): string {
  let result = cost;
  for (const r of reductions) result = removeNColorFromCost(result, r.color, r.count);
  return result;
}

// コスト文字列から指定色を1つ減らす（《X》×Nが1→削除、2+→-1）
export function removeOneCostColor(cost: string, color: string): string {
  const parts = parseGrowCost(cost);
  const idx = parts.findIndex(p => p.color === color);
  if (idx < 0) return cost;
  const newParts = [...parts];
  newParts[idx] = { color: newParts[idx].color, count: newParts[idx].count - 1 };
  const result = newParts.filter(p => p.count > 0).map(p => `《${p.color}》×${p.count}`).join('');
  return result || 'なし';
}

// "《白×2》《赤》" 形式のEffectText内コスト表記をparseGrowCost互換文字列に変換
export function normalizeCostText(s: string): string {
  const result: { color: string; count: number }[] = [];
  for (const m of s.matchAll(/《([^×》]+?)(?:×([０-９\d]+))?》/g)) {
    const color = m[1].trim();
    if (['コイン', 'ターン1回', 'アタックフェイズ', 'ダウン'].includes(color)) continue;
    const count = m[2] ? parseInt(toHalfWidth(m[2])) : 1;
    result.push({ color, count });
  }
  return result.map(p => `《${p.color}》×${p.count}`).join('') || 'なし';
}

/**
 * 🔴**数量0の色を落とさずに文字列化する**（`《赤×0》` → `《赤》×0`）。
 * 旧 `computeArtsEffectiveCost` の「対戦相手のセンタールリグが〜の場合、基本コストは〜になる」だけが
 * `normalizeCostText` の生出力を返しており、他の置換（`parseGrowCost` 経由＝0を落とす）と**表示が違った**。
 * ⚠移設で勝手に `なし` へ畳むと**ユーザーに見える文字列が変わる**ので、その差を保存するために分けてある。
 */
function costPartsToStrKeepZero(parts: { color: string; count: number }[]): string {
  return parts.map(p => `《${p.color}》×${p.count}`).join('') || 'なし';
}

/** コストの色別数量を表示・計算用の文字列へ。⚠**count 0 は落とす**（《X×0》＝「コストなし」＝'なし'）。 */
function costPartsToStr(parts: { color: string; count: number }[]): string {
  return parts.filter(p => p.count > 0).map(p => `《${p.color}》×${p.count}`).join('') || 'なし';
}

// 条件つき使用コスト**置換**（タスク12(lxxxi)）の評価コンテキスト。
// - isBetting: ベット宣言中か（ベット形の置換はこれが真のときだけ成立する）
// - oppState : 対戦相手の状態。
//     ①「このターンにアーツ／スペルを使用したか」の判定源（engine の
//        ARTS_USED_THIS_TURN / SPELL_USED_THIS_TURN と同じフィールドを見る）
//     ②🆕**相手の盤面を数える軽減**（タスク12(xcii)＝凍結シグニ/【チャーム】/【ウィルス】/能力なしシグニ/
//        コイン/ライフ枚数）の参照元。⚠従来ここが `turn_arts_used`／`actions_done` だけだったため、
//        `computeArtsEffectiveCost` は相手の場・ライフ・コインを**一切見られなかった**（8枚が印刷コスト請求）。
//        呼び出し4経路（`ArtsModal`／`SpellCastModal`／`CutinModal`／`BattleScreen.getCardActions`）は
//        いずれも既に `op`（相手 `PlayerState`）を丸ごと渡していたので、**受け口の型を広げるだけ**で届く。
export interface CostReplaceCtx {
  isBetting?: boolean;
  oppState?: {
    turn_arts_used?: boolean;
    actions_done?: string[];
    field?: PlayerState['field'];
    life_cloth?: string[];
    coins?: number;
    abilities_removed?: string[];
    // 「〔ゾーン〕の枚数が対戦相手より多いかぎり」「手札の枚数の差1につき」の相手側（タスク12(xciv)）。
    // ⚠未指定なら軽減を**成立させない**（安いほうへ倒さない）＝I-5 と同じ安全側の扱い。
    hand?: string[];
    energy?: string[];
    trash?: string[];
    lrig_trash?: string[];
    // 「このターンに対戦相手のシグニがバニッシュされている場合」（`WX13-026`・タスク12(xciv)）。
    signi_banished_this_turn?: number;
  };
  // 他カードの `SET_CARD_COST_REPLACEMENT` でゲーム間セットされたカード名指定の置換（`WXK03-002-E3`）。
  // 使用側カードの原文には何も書かれていないので、**EffectText 由来の規則より先**に見る。
  cardCostReplacements?: { cardName: string; cost: { color: string; count: number }[] }[];
  // 「使用する際、…捨ててもよい。そうした場合、使用コストは《X》になる」の任意支払いを済ませたか
  // （`WX21-035`／`WX21-071`＝支払いUIは `SpellCastModal`）。
  paidOptionalDiscard?: boolean;
  /**
   * 🆕**センタールリグ条件（§5.3 `O-86` 第8バッチ）の参照元**＝
   * 「あなたのセンタールリグが＜X＞の場合」（14枚）／「対戦相手のセンタールリグが〔色〕の場合」（12枚）／
   * 「あなたのセンタールリグがレベルN以上の場合」（1枚）。
   * ⚠**`computeArtsEffectiveCost` が自分の引数から詰めて渡す**ので、あちら経由の呼び出し4経路は
   *   何も変えなくてよい。`computeCostReplacement` を**直接**呼ぶベット判定3経路は渡さない＝
   *   ベット形の札はルリグ条件を持たないので影響しない（渡さなければ「成立しない」に倒れる＝安全側）。
   */
  lrig?: {
    selfName?: string;
    selfNameAliases?: string[];
    selfLevel?: number;
    oppColor?: string;
  };
}

/** 使用時の任意支払いで要求される手札の組（色×クラス×枚数）。全グループを満たしてはじめて置換が成立する。 */
export interface OptionalDiscardGroup {
  color: string;
  story: string;
  count: number;
}

/**
 * 使用時の任意支払いによるコスト置換＝**JSON payload だけを読む**（`EffectCost.optionalDiscardCost`）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第6バッチ）＝ここに在った `parseOptionalDiscardForCost(effectText)` を撤去した**
 *   （`WX21-035` / `WX21-071` の2枚）。読み取りは `src/data/keywordCosts.ts` の `parseOptionalDiscardCostText`。
 * ⚠**隣接する「減る」形は対象外**＝あちらは枚数比例／可変枚数で支払いの粒度が違う（`resolveUseTimeCost` の側）。
 */
export function optionalDiscardCostOf(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): { groups: OptionalDiscardGroup[]; replacement: string } | null {
  for (const effect of effectsMap.get(getCardNum(cardNum)) ?? []) {
    const spec = effect.cost?.optionalDiscardCost;
    if (spec) return { groups: spec.groups, replacement: costPartsToStr(spec.cost) };
  }
  return null;
}

/** カード1枚が任意支払いグループの1つを満たしうるか（UI の候補ハイライト用）。 */
export function matchesOptionalDiscardGroup(
  cardNum: string,
  group: OptionalDiscardGroup,
  cardMap: Map<string, CardData>,
): boolean {
  const c = cardMap.get(cardNum) ?? cardMap.get(getCardNum(cardNum));
  if (!c || c.Type !== 'シグニ') return false;
  return (c.Color ?? '').includes(group.color) && (c.CardClass ?? '').includes(group.story);
}

/**
 * 選んだ手札が全グループをちょうど満たすか。
 * ⚠**貪欲では足りない**＝多色シグニ（例「青黒」）はどちらのグループにも当たるので、
 *   割り当て次第で成立/不成立が変わる。グループ数が高々2なので**全割り当てを試す**（バックトラック）。
 */
export function optionalDiscardSatisfied(
  groups: OptionalDiscardGroup[],
  selectedNums: string[],
  cardMap: Map<string, CardData>,
): boolean {
  const need = groups.flatMap(g => Array(g.count).fill(g) as OptionalDiscardGroup[]);
  if (selectedNums.length !== need.length) return false;
  const used = new Set<number>();
  const assign = (i: number): boolean => {
    if (i >= need.length) return true;
    for (let j = 0; j < selectedNums.length; j++) {
      if (used.has(j) || !matchesOptionalDiscardGroup(selectedNums[j], need[i], cardMap)) continue;
      used.add(j);
      if (assign(i + 1)) return true;
      used.delete(j);
    }
    return false;
  };
  return assign(0);
}

/**
 * 「〜の場合、この{アーツ|スペル|カード}の使用コストは《X》に**なる**」＝条件つきコスト置換を解決する。
 * 既存の軽減系（`removeNColorFromCost` / `applyContinuousCostDecreases`）は「印刷コストから引く」ので
 * 流用できない＝置換は色構成ごと差し替わる（《赤》×4 → 《赤×0》＝ゼロコスト）。
 * 戻り値 `null` ＝置換なし（呼び出し側は印刷コスト／既存の軽減結果をそのまま使う）。
 *
 * ⚠ベット形は**宣言がモーダル内**なので、一覧表示（宣言前）では `isBetting` を渡さず null を受け取り、
 *   「ベットすれば払えるか」の使用可否判定だけ `isBetting:true` で別途問い合わせる。
 */
export function computeCostReplacement(
  card: { CardName?: string; Cost: string },
  myState: { field?: PlayerState['field']; trash?: string[] },
  cardMap?: Map<string, CardData>,
  ctx?: CostReplaceCtx,
  /** カードの `EffectCost.costReplacement`（`costReplacementOf` で引く）。無ければ原文由来の置換は無い。 */
  terms?: CostReplacementTerm[],
): string | null {
  // ⓪ 状態由来＝他カードの効果でカード名を指定して置換された分（`WXK03-002-E3`）。
  //    使用側の原文には手掛かりが無いので、payload 由来の項より先に見る。
  const byName = card.CardName
    ? ctx?.cardCostReplacements?.find(r => r.cardName === card.CardName)
    : undefined;
  if (byName) return costPartsToStr(byName.cost);

  if (!terms?.length) return null;
  const oppArts = ctx?.oppState?.turn_arts_used === true;
  const oppSpell = (ctx?.oppState?.actions_done ?? []).includes('USE_SPELL');
  // 「あなたのセンタールリグが＜X＞」＝名前の部分一致＋エイリアス（`LRIG_ALL_NAMES_SENTINEL` は全一致）。
  const lrigNameMatches = (keyword: string): boolean => {
    const l = ctx?.lrig;
    return !!l && (l.selfNameAliases?.includes(LRIG_ALL_NAMES_SENTINEL)
      || l.selfName?.includes(keyword) === true
      || l.selfNameAliases?.some(a => a.includes(keyword)) === true);
  };
  const met = (when: CostReplacementWhen): boolean => {
    switch (when.kind) {
      case 'betting': return ctx?.isBetting === true;
      case 'paidOptionalDiscard': return ctx?.paidOptionalDiscard === true;
      case 'selfCenterLrigName': return lrigNameMatches(when.keyword);
      // ⚠**相手のセンタールリグ色が未知なら成立させない**（安いほうへ倒さない）＝旧実装と同じ扱い。
      case 'oppCenterLrigColor': {
        const c = ctx?.lrig?.oppColor;
        return !!c && when.colors.some(x => c.includes(x));
      }
      case 'selfCenterLrigLevelGte': {
        const lv = ctx?.lrig?.selfLevel;
        return lv !== undefined && lv >= when.value;
      }
      case 'oppUsedThisTurn': {
        const flags = [when.arts && oppArts, when.spell && oppSpell];
        const wanted = [when.arts, when.spell];
        return when.mode === 'all'
          ? wanted.every((w, i) => !w || flags[i])
          : wanted.some((w, i) => w && flags[i]);
      }
      case 'selfFieldHasCardName': {
        // ⚠参照できないときは**成立させない**（安いほうへ倒さない）＝旧実装と同じ扱い。
        if (!myState.field || !cardMap) return false;
        return [
          ...(myState.field.signi ?? []).map(stack => stack?.at(-1)),
          myState.field.lrig?.at(-1),
        ].some(n => !!n && cardMap.get(n)?.CardName === when.cardName);
      }
      case 'selfTrashCountGte': return (myState.trash?.length ?? 0) >= when.value;
    }
  };
  // 🆕`accumulate` の項だけは**確定せずに結果を持ち越す**（原文「〜減り、〜減る」＝2条件の重ね）。
  let acc: string | null = null;
  for (const term of terms) {
    if (met(term.when)) {
      const applied: string = term.mode === 'replace'
        ? (term.keepZeroAmounts ? costPartsToStrKeepZero(term.cost) : costPartsToStr(term.cost))
        : term.cost.reduce((out: string, r) => removeNColorFromCost(out, r.color, r.count), acc ?? card.Cost);
      if (!term.accumulate) return applied;
      acc = applied;
      continue;
    }
    // 🔴**宣言しなければ「置換なし」で確定**（ベット形／任意支払い形）＝後段の項へ落とさない。
    if (term.stopIfUnmet) return null;
  }
  // 重ねた結果が印刷コストから動いていなければ「置換なし」＝呼び出し側の後続規則へ落とす。
  return acc !== null && acc !== card.Cost ? acc : null;
}

/** カードの条件つきコスト置換 payload を1本で取り出す（`costScalingOf` と同じ形）。 */
export function costReplacementOf(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): CostReplacementTerm[] | undefined {
  for (const effect of effectsMap.get(getCardNum(cardNum)) ?? []) {
    if (effect.cost?.costReplacement?.length) return effect.cost.costReplacement;
  }
  return undefined;
}

// EffectText を参照してアーツの実効コストを算出（条件付きコスト軽減の近似）
export function computeArtsEffectiveCost(
  // CardName は `card_cost_replacements`（カード名指定の置換）の照合に要る＝落とすと静かに効かなくなる
  card: { CardName?: string; Cost: string; EffectText?: string },
  myState: { life_cloth: string[]; hand: string[]; field?: PlayerState['field']; trash?: string[]; lrig_trash?: string[]; energy?: string[] },
  lrigName?: string,
  oppLrigColor?: string,
  myLrigLevel?: number,
  cardMap?: Map<string, CardData>,
  lrigNameAliases?: string[],
  artsThresholdReductions?: { minTotalCost: number; color: string; reduction: number }[],
  replaceCtx?: CostReplaceCtx,
  costScaling?: CostScalingTerm[],
  /** カードの `EffectCost.costReplacement`（§5.3 `O-86`）。`costReplacementOf` で引いて渡す。 */
  costReplacement?: CostReplacementTerm[],
): string {
  const text = card.EffectText ?? '';
  const base = card.Cost;
  let m: RegExpMatchArray | null;

  // 条件つきコスト置換／軽減（`EffectCost.costReplacement`）＝比例増減より先に見る。
  // 🆕**センタールリグ条件（§5.3 `O-86` 第8バッチ）の参照元をここで詰める**＝
  //   `computeCostReplacement` は `CostReplaceCtx.lrig` しか見ないので、この関数の引数
  //   （`lrigName` / `lrigNameAliases` / `myLrigLevel` / `oppLrigColor`）を1箇所で束ねて渡す。
  //   ⚠**呼び出し4経路（`artsUseGate`／`CutinModal`／`KeyUseModal`／`BattleScreen`）は何も変えなくてよい。**
  const replaceCtxWithLrig: CostReplaceCtx = {
    ...(replaceCtx ?? {}),
    lrig: { selfName: lrigName, selfNameAliases: lrigNameAliases, selfLevel: myLrigLevel, oppColor: oppLrigColor },
  };
  const replaced = computeCostReplacement(card, myState, cardMap, replaceCtxWithLrig, costReplacement);
  if (replaced !== null) return replaced;

  // カード自身の比例増減は JSON payload が正。必要な owner/state が揃わない場合だけ従来 regex へ落ちる。
  // payload が評価できたときは、下の全文 regex 群を通さない（二重適用を構造的に防ぐ）。
  if (costScaling?.length) {
    const scaled = applyCostScalingTerms(base, costScaling, myState, replaceCtx?.oppState, cardMap);
    if (scaled !== null) return scaled;
  }

  // 🗑**2026-09-02（§5.3 `O-86` 第1バッチ）＝「《X》を〈N〉つ少なくする」形の規則5本を撤去した。**
  //   新設した `npm run census:costtext` が **5本とも live 0件**（＝1枚も当たらない死に規則）と測った。
  //   🔑実データの言い回しは**「減る」だけ**＝`つ少` を含むカードは **0枚**（全 CSV を実測）。
  //   撤去したのは①センタールリグのレベル条件 ②ライフクロスN枚以下 ③手札N枚以下
  //   ④⑤センタールリグ名条件（2綴り）＝いずれも**下の「減る」系の規則が同じ意味を担っている**。
  //   ⚠**挙動は1バイトも変わらない**（到達不能な枝の削除）。新しい綴りのカードが来たら計器が
  //   「当たらない規則が増えた」ではなく **A群の本数が増えない**まま静かに素通りするので、
  //   その時は `census:costtext` の上位に出ない＝**原文側から探す**こと（§5.3 `O-86`）。

  // フィールドにパワーN以上のシグニがある場合コスト減（CONDITIONAL_COST_REDUCTION_BY_FIELD）
  if (myState.field && cardMap) {
    // ⚠従来 `[^、]*` ＋ `《色》×N`（括弧外表記）限定で**二重に取りこぼしていた**（タスク12(xc)）：
    //   ①「がある場合**、この**スペルの使用コストは」の読点を跨げない
    //   ②実データの多数派は `《赤×2》`（括弧**内**表記）＝この regex に当たらない
    //   ⇒ `[^。]*?` ＋ 減少量は括弧内外を吸収する `parseGrowCost(normalizeCostText())` へ寄せる。
    m = text.match(/あなたの場にパワー([０-９\d]+)以上のシグニがある場合[^。]*?使用コストは((?:《[^》]+》)+)減る/);
    if (m) {
      const reqPower = parseInt(toHalfWidth(m[1]));
      const redList = parseGrowCost(normalizeCostText(m[2]));
      const hasStrongSigni = (myState.field.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        if (!top) return false;
        const pow = parseInt(cardMap.get(top)?.Power ?? '0');
        return pow >= reqPower;
      });
      if (hasStrongSigni) {
        let out = base;
        for (const r of redList) out = removeNColorFromCost(out, r.color, r.count);
        return out;
      }
    }
    // フィールドに特定クラスのシグニがある場合コスト減
    m = text.match(/あなたの場に＜([^＞]+)＞のシグニがある場合[^。]*?使用コストは((?:《[^》]+》)+)減る/);
    if (m) {
      const reqClass = m[1];
      const redListC = parseGrowCost(normalizeCostText(m[2]));
      const hasClassSigni = (myState.field.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        return top && (cardMap.get(top)?.CardClass ?? '').includes(reqClass);
      });
      if (hasClassSigni) {
        let out = base;
        for (const r of redListC) out = removeNColorFromCost(out, r.color, r.count);
        return out;
      }
    }
  }

  // SPELL_COST_REDUCTION_BY_TRASH_COUNT: トラッシュのクラスシグニN枚につき色コスト×1軽減
  if (myState.trash && cardMap) {
    m = text.match(/トラッシュにある＜([^＞]+)＞のシグニ([０-９\d]+)枚につき《([^》]+)》×?([０-９\d]*)減る/);
    if (m) {
      const cls = m[1]; const perN = parseInt(toHalfWidth(m[2]));
      // 🔴色指定は《黒×1》（括弧**内**表記）と《黒》×1（括弧外）の両方がある。
      //   内側を割らないと色名が `黒×1` になり `removeNColorFromCost` が**一度も当たらない**
      //   ＝軽減が永久に不発（`WXK06-055` は黒×3+無×1 のまま／2026-08-27 Sheet1 B13 で実測）。
      //   ⚠**すぐ上の「場の＜クラス＞シグニN体につき」分岐は最初から割っていた**＝
      //     同じファイル内で同じ表記ゆれの扱いが2つに割れていたのが根因（§5-8′ の再実証）。
      const innerT = m[3].match(/([^×x]+)[×x]?([０-９\d]*)/);
      const col = (innerT?.[1] ?? m[3]).trim();
      const perRed = parseInt(toHalfWidth(innerT?.[2] || m[4] || '1')) || 1;
      const cnt = myState.trash.filter(cn => (cardMap.get(cn)?.CardClass ?? '').includes(cls) && cardMap.get(cn)?.Type === 'シグニ').length;
      const reduction = Math.floor(cnt / perN) * perRed;
      if (reduction > 0) return removeNColorFromCost(base, col, reduction);
    }
  }

  // 🗑**2026-09-02（§5.3 `O-86` 第7バッチ）＝`costScaling` payload に取って代わられた比例軽減 regex 13本を撤去した。**
  //   撤去したのは①場の＜クラス＞シグニN体につき ②ルリグトラッシュのアーツ1枚につき
  //   ③場の〔色/カード名〕シグニN体につき ④〜⑦相手盤面参照の I-1〜I-4（凍結/能力なし/チャーム/ウィルス/コイン）
  //   ⑧場のルリグN体以上のピース比例 ⑨場＋エナの二重比例 ⑩トラッシュのカード名比例
  //   ⑪アクセ済みシグニ比例 ⑫ライフ増＋クラス減 ⑬手札枚数差比例。
  //   🔑**どれも parser が `EffectCost.costScaling` を刻んでおり、上の payload 分岐が先に return する**＝
  //     `census:costtext` の「payload無」列が **13本とも 0** だった（＝当たるカードは全部 payload 済み）。
  //   ⚠**「payload無 0」だけを根拠に消さない**＝payload の解決が null に落ちたときは regex へ落ちる作りなので、
  //     **撤去の前後で `computeArtsEffectiveCost` の出力を全カード × 盤面マトリクスでダンプして突き合わせた**
  //     （**323,298 通りで不一致 0**＝到達不能を実測で証明した。手順は PLAN_DETAIL.md の `O-86`）。
  // ===== タスク12(xc)：既存規則集に無かった条件つきコスト軽減（全数計測で 37枚ぶん） =====
  // 「《色×N》…減る」の並びを {color,count}[] へ（複数色を同時に減らす形がある）。
  const parseReduceList = (raw: string) => parseGrowCost(normalizeCostText(raw));
  const applyReduce = (cost: string, list: { color: string; count: number }[], times = 1): string => {
    let out = cost;
    for (const r of list) out = removeNColorFromCost(out, r.color, r.count * times);
    return out;
  };
  const RED = '((?:《[^》]+》)+)';

  // D. 「あなたのセンタールリグのレベル１につき《色×N》減る」（5枚）＝レベル比例。
  m = text.match(new RegExp(`あなたのセンタールリグのレベル[１1]につき${RED}減る`));
  if (m && myLrigLevel !== undefined && myLrigLevel > 0) {
    return applyReduce(base, parseReduceList(m[1]), myLrigLevel);
  }

  // E. 「あなたの場に＜X＞と＜Y＞のシグニがある場合、…《色×N》減る」（1枚）＝両クラスが同時に要る。
  m = text.match(new RegExp(`あなたの場に＜([^＞]+)＞と＜([^＞]+)＞のシグニがある場合[、,][^。]*?使用コストは${RED}減る`));
  if (m && myState.field && cardMap) {
    const has = (cls: string) => (myState.field!.signi ?? []).some(stack => {
      const top = stack?.at(-1);
      return top && (cardMap.get(getCardNum(top))?.CardClass ?? '').includes(cls);
    });
    if (has(m[1]) && has(m[2])) return applyReduce(base, parseReduceList(m[3]));
  }

  // SP36-001（炎のタマ）＝相手のこのターンの使用実績で**2文が累積**する唯一の形。
  // 他の規則と違い早期 return できない（スペル枚数比例＋アーツ使用の固定減が重なる）。
  if (/このターンに対戦相手がスペルを使用していた場合/.test(text) || /このターンに対戦相手がアーツを使用していた場合/.test(text)) {
    const done = replaceCtx?.oppState?.actions_done ?? [];
    const spellCount = done.filter(a => a === 'USE_SPELL').length;
    let out = base;
    const perSpell = text.match(new RegExp(`使用されたスペル[１1]枚につき${RED}減る`));
    if (perSpell && spellCount > 0) out = applyReduce(out, parseReduceList(perSpell[1]), spellCount);
    const byArts = text.match(new RegExp(`このターンに対戦相手がアーツを使用していた場合[、,][^。]*?使用コストは${RED}減る`));
    if (byArts && replaceCtx?.oppState?.turn_arts_used) out = applyReduce(out, parseReduceList(byArts[1]));
    if (out !== base) return out;
  }

  // ===== タスク12(xcii)：**相手の盤面**を参照する条件つきコスト軽減（8枚） =====
  // ⚠**必ず「この{スペル|アーツ}の使用コストは…」の文だけを見る**＝カード全文に regex を当てると、
  //   他カードのコストを下げる文（`WXDi-CP01-027`「《フレン・スラッシュ》の使用コストは…」）や
  //   無関係の「1体につき」文まで巻き込む。文単位で切ってから当てる。
  const oppSt = replaceCtx?.oppState;
  const costSentence = text.split('。').find(s => /この(?:スペル|アーツ|カード)の使用コストは/.test(s)) ?? '';
  if (costSentence) {
    // I-5. 「あなたのライフクロスが対戦相手より多い場合、…《無×3》減る」（`SP38-002`）＝枚数比較。
    //      ⚠相手ライフが未知（`life_cloth` 未指定）のときは**成立させない**＝安いほうへ倒さない。
    m = costSentence.match(new RegExp(`あなたのライフクロスが対戦相手より多い場合[、,][^。]*?使用コストは${RED}減る`));
    if (m && oppSt?.life_cloth && myState.life_cloth.length > oppSt.life_cloth.length) {
      return applyReduce(base, parseReduceList(m[1]));
    }
  }

  // ===== タスク12(xciv)：コスト軽減の残テール（未カバー23枚を全数分類して実装）=====
  // ⚠在庫の見立ては「1枚ずつ形が違う＝クラスタ化できない」だったが、**規則 regex に原文が当たるか**で
  //   数え直すと **α ピース5枚／β 相手比較5枚／γ 2条件の重ね4枚** の明確なクラスタがあった。
  {
    const oppSt2 = replaceCtx?.oppState;
    // β. アーツ5枚（`WX25-P3-002`/`004`/`006`/`008`/`010`）＝「〔ゾーン〕の枚数が対戦相手より〔N枚以上〕
    //    多いかぎり、このアーツの使用コストは《色×2》減る」。⚠相手側が未知なら**成立させない**（I-5 と同じ安全側）。
    m = text.match(new RegExp(
      `あなたの(ライフクロス|ルリグトラッシュにあるアーツ|手札|エナゾーンにあるカード|トラッシュにあるカード)の枚数が対戦相手より(?:([０-９\\d]+)枚以上)?多いかぎり[、,][^。]*?使用コストは${RED}減る`));
    if (m && oppSt2) {
      const need = m[2] ? (parseInt(toHalfWidth(m[2])) || 1) : 1;
      const zone = m[1];
      const countZone = (st: { life_cloth?: string[]; hand?: string[]; energy?: string[]; trash?: string[]; lrig_trash?: string[] } | undefined): number | null => {
        if (!st) return null;
        if (zone === 'ライフクロス') return st.life_cloth?.length ?? null;
        if (zone === '手札') return st.hand?.length ?? null;
        if (zone === 'エナゾーンにあるカード') return st.energy?.length ?? null;
        if (zone === 'トラッシュにあるカード') return st.trash?.length ?? null;
        // ルリグトラッシュは**アーツだけ**を数える（原文「あるアーツの枚数」）
        if (!cardMap) return null;
        return (st.lrig_trash ?? []).filter(cn => cardMap.get(getCardNum(cn))?.Type === 'アーツ').length;
      };
      const mine = countZone(myState);
      const theirs = countZone(oppSt2);
      if (mine !== null && theirs !== null && mine - theirs >= need) return applyReduce(base, parseReduceList(m[3]), 1);
    }
    // γ-1. `WX12-013`＝「ルリグトラッシュに〔色〕のアーツがある場合《無×1》減り、〔色〕のアーツがある場合《無×1》減る」
    //       ＝2条件が**重なる**（早期 return できない）。
    m = text.match(new RegExp(
      `ルリグトラッシュに([白赤青緑黒])のアーツがある場合${RED}減り[、,]?([白赤青緑黒])のアーツがある場合${RED}減る`));
    if (m && myState.lrig_trash && cardMap) {
      const hasArts = (col: string) => myState.lrig_trash!.some(cn => {
        const c = cardMap.get(getCardNum(cn));
        return c?.Type === 'アーツ' && (c.Color ?? '').includes(col);
      });
      let out = base;
      if (hasArts(m[1])) out = applyReduce(out, parseReduceList(m[2]));
      if (hasArts(m[3])) out = applyReduce(out, parseReduceList(m[4]));
      if (out !== base) return out;
    }
    // γ-2. `WX12-049`＝「場に〔色〕の＜X＞のシグニがある場合、…《色×1》減り、〔色〕の＜X＞のシグニがある場合、《色×1》減る」
    m = text.match(new RegExp(
      `あなたの場に([白赤青緑黒])の＜([^＞]+)＞のシグニがある場合[、,][^。]*?使用コストは${RED}減り[、,]([白赤青緑黒])の＜?([^＞]*)＞?のシグニがある場合[、,]${RED}減る`));
    if (m && myState.field && cardMap) {
      const hasSigni = (col: string, cls: string) => (myState.field!.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        if (!top) return false;
        const c = cardMap.get(getCardNum(top));
        return !!c && (c.Color ?? '').includes(col) && (!cls || (c.CardClass ?? '').includes(cls));
      });
      let out = base;
      if (hasSigni(m[1], m[2])) out = applyReduce(out, parseReduceList(m[3]));
      if (hasSigni(m[4], m[5] || m[2])) out = applyReduce(out, parseReduceList(m[6]));
      if (out !== base) return out;
    }
    // δ-6. `WX13-026`＝「このターンに対戦相手のシグニがバニッシュされている場合、《黒×3》減る」。
    //       ⚠ターン履歴なので盤面からは判定できない＝`collectBoardDiffTriggers`（バニッシュ認識の
    //       唯一の funnel）が積む `signi_banished_this_turn` を読む。相手側が未知なら成立させない。
    m = text.match(new RegExp(`このターンに対戦相手のシグニがバニッシュされている場合[、,][^。]*?使用コストは${RED}減る`));
    if (m && (oppSt2?.signi_banished_this_turn ?? 0) >= 1) return applyReduce(base, parseReduceList(m[1]));
  }

  // ARTS_COST_REDUCTION_BY_COST_THRESHOLD: コスト合計がN以上なら色コスト軽減。
  // §6.4 O-10（続き510）で「対戦相手のターンにアーツを使用する場合の軽減」（`minTotalCost:0`）も
  // ここへ合流させた＝**このリストは複数エントリを取りうる**。
  // 🔴従来は**最初に一致した1件で `return`** していたので、宣言が2つあると片方が黙って消えていた
  //   （軽減は本来すべて累積する）。閾値は**元のコスト合計**で判定する（順に引くと後段の閾値がズレる）。
  if (artsThresholdReductions && artsThresholdReductions.length > 0) {
    const totalCost = parseGrowCost(base).reduce((s, c) => s + c.count, 0);
    let reduced = base;
    for (const { minTotalCost, color, reduction } of artsThresholdReductions) {
      if (totalCost >= minTotalCost) reduced = removeNColorFromCost(reduced, color, reduction);
    }
    if (reduced !== base) return reduced;
  }

  return base;
}


/**
 * SPECIFIC_CARD_COST_REDUCE（「《カード名》の使用コストは《無×N》減る」＝`WXDi-CP01-027`／`WXDi-CP01-048`）を
 * コスト文字列へ適用する（タスク12(xci)）。
 *
 * ⚠**実測すると対象はスペル2枚**（《フレン・スラッシュ》`WXDi-P00-048`／《ダークネス・イーター》`WXDi-P00-080`）で、
 *   従来これを適用していたのは `CutinModal`（＝ルリグデッキ由来アーツ）と `BattleScreen.getCardActions` のアーツ枝だけ＝
 *   **本来効くはずのスペル使用モーダルに無かった**（印刷コストで請求されていた）。
 *   アーツ側にも同じ形で通しておく（発生源はカード名で対象を指すので、将来アーツが対象になっても静かに落ちない）。
 */
/**
 * 【チェイン】が積んだ「このターン、次に使用するアーツのコストは《色×N》減る」
 * （`PlayerState.next_arts_cost_reduction`）をアーツの使用コスト文字列へ適用する。
 * スペル版（`SpellCastModal` の `next_spell_cost_reduction`）と同じ形＝色ごとに `removeNColorFromCost`。
 */
export function applyNextArtsCostReduction(
  cost: string,
  reductions: { color: string; count: number }[] | undefined,
): string {
  let result = cost;
  for (const r of reductions ?? []) result = removeNColorFromCost(result, r.color, r.count);
  return result;
}

export function applySpecificCardCostReduction(
  cost: string,
  cardName: string | undefined,
  reductions: { targetCardName: string; colorlessReduction: number }[],
): string {
  if (!cardName) return cost;
  const r = reductions.find(rr => rr.targetCardName === cardName);
  return r ? removeNColorFromCost(cost, '無', r.colorlessReduction) : cost;
}

// マルチエナ判定:
// 1. allMulti（WX01-027/WX05-006のような「全エナにマルチエナ付与」効果がフィールドにある）
// 2. カード自身の CONTINUOUS GRANT_KEYWORD マルチエナ（count!='ALL' = 自身のみ）
// 3. EffectText に「：【マルチエナ】」パターン（effects.json 未登録カードへのフォールバック）
// 4. keyword_grants で動的付与された場合
/**
 * 相手の CONTINUOUS（`STRIP_OPP_ENA_MULTI_ENA`）で、`payer` のエナの【マルチエナ】が剥がされているか。
 *
 * ⚠**支払い判定を行う経路すべてで同じ関数を使うこと**（人間の各モーダル／CPU グロウ／CPU の【起】）。
 * 写経すると「人間には剥がれているのに CPU では効かない」型の無言のズレになる。
 */
export function isEnaMultiStripped(
  payer: PlayerState,
  opponent: PlayerState,
  /** `opponent` 側がターンプレイヤーか（`activeCondition` の評価に渡す）。 */
  isOpponentTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): boolean {
  const hasStripEffect = (cardNum: string) => (effectsMap.get(getCardNum(cardNum)) ?? []).some(e =>
    e.effectType === 'CONTINUOUS' && e.action?.type === 'STUB' &&
    (e.action as { id?: string }).id === 'STRIP_OPP_ENA_MULTI_ENA' &&
    (!e.activeCondition || checkActiveCondition(e.activeCondition, opponent, payer, isOpponentTurn, cardMap, cardNum)));
  return opponent.field.signi.some(stack => { const top = stack?.at(-1); return !!top && hasStripEffect(top); })
    || (!!opponent.field.lrig.at(-1) && hasStripEffect(opponent.field.lrig.at(-1)!));
}

/**
 * §5.3 `O-117`＝**支払ったエナ1枚ごとの色集合**（`PlayerState.last_paid_energy_colors` の唯一の作り手）。
 * マルチエナは全5色・無色エナは空配列として記録する（`PAID_COLORS_INCLUDE_ALL` と `COST_COLOR_SELECT`
 * が同じ表現を読む）。
 * 🔴**スペル経路とアーツ経路で式を割らない**ためにここへ寄せた＝旧実装は
 *   `BattleScreen` のスペル側1箇所にだけ同じ式が書かれており、**アーツ経路は色を1つも記録していなかった**
 *   （`WX05-016` の「使用コストで5色すべてが支払われている場合」が判定材料ごと存在しなかった）。
 */
export function paidEnergyColorsOf(
  paidNums: string[],
  cards: CardData[],
  keywordGrants?: Record<string, string[]>,
  allMulti?: boolean,
  stripped?: boolean,
): string[][] {
  return paidNums.map(num =>
    isMultiEna(num, cards, keywordGrants, allMulti, stripped)
      ? ['白', '赤', '青', '緑', '黒']
      : splitColors(cards.find(c => c.CardNum === getCardNum(num))?.Color));
}

export function isMultiEna(cardNum: string, cards: CardData[], keywordGrants?: Record<string, string[]>, allMulti?: boolean, stripped?: boolean): boolean {
  if (stripped) return false;
  if (allMulti) return true;
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));
  if (card) {
    if (card.effects?.some(e =>
      e.effectType === 'CONTINUOUS' &&
      e.action.type === 'GRANT_KEYWORD' &&
      (e.action as { keyword: string }).keyword === 'マルチエナ' &&
      (e.action as { target: { count: unknown } }).target?.count !== 'ALL'
    )) return true;
    // effects.json 未登録カード用フォールバック：
    // 「【常】：【マルチエナ】」形式（サーバント系）を EffectText から直接検出
    // WX01-027のような「【常】：あなたの〜は【マルチエナ】を持つ」は「：あ」で始まるため非一致
    if (card.EffectText?.includes('：【マルチエナ】')) return true;
  }
  return keywordGrants?.[cardNum]?.includes('マルチエナ') ?? false;
}

/**
 * コストの色スロット1つを、支払いに出したカードの色で満たせるか。
 *
 * 🔴**「《赤/緑》×１」はスラッシュ＝どちらか1枚**（`WX14-010` 断罪 遊月・弐 など **24枚**＝
 * ルリグ13／アーツ9／キー2）。2026-08-19 続き567 まで `cardColor.includes('赤/緑')` で照合しており
 * **どの色を出しても不一致＝恒久に払えない**（そのルリグにグロウできない／そのアーツ・キーが使えない）だった。
 *
 * ⚠**色照合はこの1関数に集約する**（`canAffordGrowCost` と `canAffordWithExtraCost` で綴りが割れると、
 * 「一覧では払えるのに実行で弾かれる」形の食い違いになる）。
 */
export function costColorMatches(
  cardColor: string,
  costColor: string,
  opts?: { extraColor?: string; colorSubs?: { from: string[]; to: string }[] },
): boolean {
  if (costColor === '無') return true;
  const wants = costColor.split('/').map(w => w.trim()).filter(Boolean);
  return wants.some(w =>
    w === '無' ||
    cardColor.includes(w) ||
    opts?.extraColor === w ||
    (opts?.colorSubs?.some(sub => sub.to === cardColor && sub.from.includes(w)) ?? false));
}

export function canAffordGrowCost(
  energyNums: string[],
  cards: CardData[],
  growCost: string,
  keywordGrants?: Record<string, string[]>,
  allMulti?: boolean,
  stripped?: boolean,                 // 相手効果によるマルチエナ喪失（印字・付与とも無効）
  colorlessOverrides?: string[],
  colorSubs?: { from: string[]; to: string }[],
  extraColorMap?: Map<string, string>,
  trashSubWilds?: Set<string>,       // エナ代替ワイルド（任意色）
  trashSubColors?: Map<string, string>, // エナ代替色指定（instId→色）
  extraWildCount?: number,            // キー代替による追加ワイルド枚数
  /**
   * 「無色のカードでエナコストを支払えない」（§6.4 O-10 続き512・`WXK07-001-E1`）。
   * ⚠**プールから落とす**＝色照合を通す前に除く（無色カードは《無》スロットの充当にも使えない）。
   */
  banColorlessPay?: boolean,
): boolean {
  const costs = parseGrowCost(growCost);
  if (costs.length === 0) return true;
  // 色指定コストを先に処理し、マルチエナをワイルドカードとして温存する
  const sorted = [...costs].sort((a, b) => (a.color === '無' ? 1 : 0) - (b.color === '無' ? 1 : 0));
  type P = { color: string; isWild: boolean; extraColor?: string };
  let pool: P[] = energyNums.map(n => {
    const c = cards.find(cd => cd.CardNum === getCardNum(n));
    // colorless_card_overrides に含まれるカードは全ゾーンで無色扱い
    const isColorless = colorlessOverrides?.includes(getCardNum(n)) || colorlessOverrides?.includes(n);
    const isTrashWild = trashSubWilds?.has(n) === true;
    const extraColor = extraColorMap?.get(n) ?? trashSubColors?.get(n);
    return {
      color: isColorless ? '無' : (c?.Color ?? '無'),
      isWild: (!isColorless && isMultiEna(n, cards, keywordGrants, allMulti, stripped)) || isTrashWild,
      extraColor,
    };
  });
  // §6.4 O-10（続き512）＝無色のカードは支払いに使えない。⚠**マルチエナ扱いでも落とす**
  //   （無色カードがワイルドとして通ると制限が骨抜きになる）。
  if (banColorlessPay) pool = pool.filter(p => p.color !== '無' && !(p.color === '' || p.color == null));
  // キーピース代替による追加ワイルド（エナ選択不要分）
  if (extraWildCount) {
    for (let i = 0; i < extraWildCount; i++) pool.push({ color: '無', isWild: true });
  }
  for (const { color, count } of sorted) {
    let needed = count;
    // まず通常カードで充当（energy_color_substitutes・追加色も考慮）
    const rem: P[] = [];
    for (const p of pool) {
      if (needed > 0 && !p.isWild) {
        const colorMatches = costColorMatches(p.color, color, { extraColor: p.extraColor, colorSubs });
        if (colorMatches) { needed--; continue; }
      }
      rem.push(p);
    }
    pool = rem;
    // 不足分をマルチエナで補う
    if (needed > 0) {
      const rem2: P[] = [];
      for (const p of pool) {
        if (needed > 0 && p.isWild) needed--;
        else rem2.push(p);
      }
      pool = rem2;
    }
    if (needed > 0) return false;
  }
  return true;
}

export function parseCoinCost(costStr: string): number {
  if (!costStr) return 0;
  const toHalf = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
  for (const m of costStr.matchAll(/《コイン》×([０-９\d]+)/g)) return parseInt(toHalf(m[1])) || 0;
  return 0;
}

/**
 * 【ベット】で支払えるコイン枚数の選択肢＝**JSON payload だけを読む**（`EffectCost.betOptions`）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第3バッチ）＝ここに在った `parseBetOptions(effectText)` を撤去した**（68カード）。
 * 🔴従来は **4入口**（`artsUseGate` / `ArtsModal` / `CutinModal` / `SpellCastModal`）が
 *   それぞれ `card.EffectText` を `ベット―…` から読み直していた＝規則を1本直すと4箇所ぶん挙動が動く形。
 * 読み取りは `src/data/keywordCosts.ts` の `parseBetOptionsText` へ移し、
 * `buildEffectsJson.ts` が**マージの後から**カードの先頭効果へ重ねる（先頭効果が MANUAL/PARTIAL の21枚でも届く）。
 * ⚠**ベットではないカードは従来どおり `{ options: [], variable: false }`**（呼び出し側の分岐を変えない）。
 */
export function betOptionsOf(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): BetCostSpec {
  for (const effect of effectsMap.get(getCardNum(cardNum)) ?? []) {
    if (effect.cost?.betOptions) return effect.cost.betOptions;
  }
  return { options: [], variable: false };
}

/**
 * 【アンコール】の支払い＝**JSON payload だけを読む**（`EffectCost.encoreCost`）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第2バッチ）＝ここに在った `parseEncoreCost(effectText)` を撤去した。**
 * 🔴従来は `ArtsModal` と `BattleScreen` の2入口が**支払いのたびに `card.EffectText` を
 *   `アンコール－…` から読み直して**いた（`census:costtext` A群の32カード）。読み取りは
 *   `src/data/keywordCosts.ts` の `parseEncoreCostText` へ移し、`buildEffectsJson.ts` が
 *   **マージの後から**カードの先頭効果へ重ねる（＝`manualEffects.ts` が本文を手書きした9枚でも失われない）。
 * ⚠**カードの全効果を走査する**＝重ねる先は先頭効果1つだが、`manualEffects.ts` が先頭に
 *   手書き効果を差し込む形（`adopted_manual_add`）でも拾えるようにしておく。
 */
export function encoreCostOf(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): EncoreCostSpec | null {
  for (const effect of effectsMap.get(getCardNum(cardNum)) ?? []) {
    if (effect.cost?.encoreCost) return effect.cost.encoreCost;
  }
  return null;
}

// コスト増加修正を考慮してエナを追加消費できるか確認
export function canAffordWithExtraCost(
  energyNums: string[],
  cards: CardData[],
  baseCost: string,
  extraCosts: { color: string; count: number }[],
  keywordGrants?: Record<string, string[]>,
  allMulti?: boolean,
  stripped?: boolean,
  colorlessOverrides?: string[],
  colorSubs?: { from: string[]; to: string }[],
  extraColorMap?: Map<string, string>,
  trashSubWilds?: Set<string>,
  trashSubColors?: Map<string, string>,
  extraWildCount?: number,
  /** 「無色のカードでエナコストを支払えない」（§6.4 O-10 続き512）。 */
  banColorlessPay?: boolean,
): boolean {
  if (extraCosts.length === 0) return canAffordGrowCost(energyNums, cards, baseCost, keywordGrants, allMulti, stripped, colorlessOverrides, colorSubs, extraColorMap, trashSubWilds, trashSubColors, extraWildCount, banColorlessPay);
  // 追加コスト分をプールから引いてから基本コストをチェック
  let pool = [...energyNums];
  for (const { color, count } of extraCosts) {
    let needed = count;
    const rem: string[] = [];
    for (const n of pool) {
      if (needed > 0) {
        const cd = cards.find(c => c.CardNum === getCardNum(n));
        const isColorless = colorlessOverrides?.includes(getCardNum(n)) || colorlessOverrides?.includes(n);
        const isTrashWild = trashSubWilds?.has(n) === true;
        const cardColor = isColorless ? '無' : (cd?.Color ?? '無');
        // §6.4 O-10（続き512）＝無色のカードは支払いに使えない（追加コスト側も同じ規則）。
        if (banColorlessPay && cardColor === '無') { rem.push(n); continue; }
        const extraColor = extraColorMap?.get(n) ?? trashSubColors?.get(n);
        const colorMatches = isTrashWild || costColorMatches(cardColor, color, { extraColor, colorSubs });
        if (colorMatches) { needed--; continue; }
      }
      rem.push(n);
    }
    pool = rem;
    if (needed > 0) {
      // extraWildCountで残りを補えるか
      if (extraWildCount && extraWildCount >= needed) break;
      return false;
    }
  }
  return canAffordGrowCost(pool, cards, baseCost, keywordGrants, allMulti, stripped, colorlessOverrides, colorSubs, extraColorMap, trashSubWilds, trashSubColors, extraWildCount, banColorlessPay);
}

/**
 * 【ブースト】の任意追加エナコスト＝**JSON payload だけを読む**（`EffectCost.boostCost`）。
 *
 * 🆕**2026-09-02（§5.3 `O-86` 第4バッチ）＝ここに在った `parseBoostCost(effectText)` を撤去した**（5枚）。
 * 読み取りは `src/data/keywordCosts.ts` の `parseBoostCostText`。
 * ⚠**アーツ本体 `cost.energy` とは別枠のまま**＝宣言したときだけ `ArtsModal` の支払い検証へ加える
 *   （本体へ混ぜるとブーストしなくても払わされる＝過剰の側）。
 */
export function boostCostOf(
  cardNum: string,
  effectsMap: Map<string, CardEffect[]>,
): { color: string; count: number }[] {
  for (const effect of effectsMap.get(getCardNum(cardNum)) ?? []) {
    if (effect.cost?.boostCost) return effect.cost.boostCost;
  }
  return [];
}

// EnergyCost[] を growCost 文字列に変換（altCostOppTurn 用）
export function energyCostToString(costs: { color: string; count: number }[]): string {
  return costs.map(e => `《${e.color}》×${e.count}`).join('');
}
export function findCounterSpellMaxCost(action: import('../../types/effects').EffectAction): number | undefined {
  if (action.type === 'COUNTER_SPELL') return (action as import('../../types/effects').CounterSpellAction).maxCost;
  if (action.type === 'SEQUENCE') {
    for (const step of (action as import('../../types/effects').SequenceAction).steps) {
      const r = findCounterSpellMaxCost(step);
      if (r !== undefined) return r;
    }
  }
  if (action.type === 'CHOOSE') {
    for (const choice of (action as import('../../types/effects').ChooseAction).choices) {
      const r = findCounterSpellMaxCost(choice.action);
      if (r !== undefined) return r;
    }
  }
  return undefined;
}

export function effectEnergyCostStr(energy: { color: string; count: number }[] | undefined): string {
  const items = energy?.filter(e => e.count > 0) ?? [];
  if (!items.length) return 'なし';
  return items.map(e => `《${e.color}》×${e.count}`).join('');
}
