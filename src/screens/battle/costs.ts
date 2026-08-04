// コスト文字列の解析・軽減適用・支払可否判定（グロウ/アーツ/スペル共通）。BattleScreen.tsx から Stage 0 で抽出。
import type { PlayerState, CardData } from '../../types';
import { LRIG_ALL_NAMES_SENTINEL } from '../../engine/effectEngine';
import { getCardNum } from '../../engine/effectExecutor';
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

/** 指定 energyTrash コストで選んだ枚数（通常の色エナコストは含めない）。 */
export function activatedEnergyTrashPaidCount(selected: Set<number>): number {
  return selected.size;
}

/** エクシードで選べる「各ルリグの一番上を除いたカード」。placedState 基準で呼ぶ。 */
export function exceedPoolOf(state: PlayerState): string[] {
  return [
    ...state.field.lrig.slice(0, -1),
    ...(state.field.assist_lrig_l?.slice(0, -1) ?? []),
    ...(state.field.assist_lrig_r?.slice(0, -1) ?? []),
  ];
}

export function canPayExceed(state: PlayerState, count: number): boolean {
  return count <= 0 || exceedPoolOf(state).length >= count;
}

/** UI で選んだプール index のカードをルリグトラッシュへ移す。選択不正時は null。 */
export function paySelectedExceed(state: PlayerState, count: number, selectedIndices: Set<number>): PlayerState | null {
  if (count <= 0) return state;
  const pool = exceedPoolOf(state);
  if (selectedIndices.size !== count || [...selectedIndices].some(i => i < 0 || i >= pool.length)) return null;
  const selected = new Set([...selectedIndices].map(i => pool[i]));
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
export function fmtHandDiscardSigniLabel(hd: { color?: string | string[]; story?: string | string[] }): string {
  const colors = hd.color ? (Array.isArray(hd.color) ? hd.color : [hd.color]) : [];
  const stories = hd.story ? (Array.isArray(hd.story) ? hd.story : [hd.story]) : [];
  return `${colors.join('か')}${stories.map(s => `＜${s}＞`).join('か')}`;
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
  };
  // 他カードの `SET_CARD_COST_REPLACEMENT` でゲーム間セットされたカード名指定の置換（`WXK03-002-E3`）。
  // 使用側カードの原文には何も書かれていないので、**EffectText 由来の規則より先**に見る。
  cardCostReplacements?: { cardName: string; cost: { color: string; count: number }[] }[];
  // 「使用する際、…捨ててもよい。そうした場合、使用コストは《X》になる」の任意支払いを済ませたか
  // （`WX21-035`／`WX21-071`＝支払いUIは `SpellCastModal`）。
  paidOptionalDiscard?: boolean;
}

/** 使用時の任意支払いで要求される手札の組（色×クラス×枚数）。全グループを満たしてはじめて置換が成立する。 */
export interface OptionalDiscardGroup {
  color: string;
  story: string;
  count: number;
}

/**
 * 「この{スペル|アーツ}を使用する際、手札から(色A)と(色B)の＜C＞のシグニを１枚ずつ捨ててもよい。
 *  そうした場合、この{スペル|アーツ}の使用コストは《X》に**なる**」＝**任意支払いでコストを置換**する形を読む
 * （`WX21-035`／`WX21-071` の2枚。タスク12(lxxxi) 残テール）。
 * 戻り値 `null`＝この形ではない。
 *
 * ⚠**隣接する「減る」形（22枚）は対象外**＝あちらは「捨てたシグニ1枚につき《黒×2》減る」のような
 *   枚数比例や「2枚まで」の可変枚数があり、支払いの粒度が違う（PLAN §3 タスク12 (lxxxv)）。
 */
export function parseOptionalDiscardForCost(
  effectText: string,
): { groups: OptionalDiscardGroup[]; replacement: string } | null {
  const m = effectText.match(
    /この(?:スペル|アーツ|カード)を使用する際[、,]手札から([白赤青緑黒])と([白赤青緑黒])の＜([^＞]+)＞のシグニを[１1]枚ずつ捨ててもよい。そうした場合[、,][^。]*?使用コストは((?:《[^》]+》)+)になる/,
  );
  if (!m) return null;
  const parts = parseGrowCost(normalizeCostText(m[4]));
  return {
    groups: [
      { color: m[1], story: m[3], count: 1 },
      { color: m[2], story: m[3], count: 1 },
    ],
    replacement: parts.map(p => `《${p.color}》×${p.count}`).join('') || 'なし',
  };
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
  card: { CardName?: string; Cost: string; EffectText?: string },
  myState: { field?: PlayerState['field']; trash?: string[] },
  cardMap?: Map<string, CardData>,
  ctx?: CostReplaceCtx,
): string | null {
  // 《X×0》は「コストなし」＝count 0 を落として 'なし' に畳む
  const toCostStr = (raw: string): string => {
    const parts = parseGrowCost(normalizeCostText(raw));
    return parts.map(p => `《${p.color}》×${p.count}`).join('') || 'なし';
  };

  // ⓪ 状態由来＝他カードの効果でカード名を指定して置換された分（`WXK03-002-E3`）。
  //    使用側の原文には手掛かりが無いので、EffectText 規則の前（＝ガードの前）に見る。
  const byName = card.CardName
    ? ctx?.cardCostReplacements?.find(r => r.cardName === card.CardName)
    : undefined;
  if (byName) return toCostStr(byName.cost.map(c => `《${c.color}×${c.count}》`).join(''));

  const text = card.EffectText ?? '';
  if (!/使用コストは[^。]*になる/.test(text)) return null;
  // 《白×1》《無×4》のような連結表記をまとめて拾う
  const COST = '((?:《[^》]+》)+)';
  let m: RegExpMatchArray | null;

  // ① ベット形（WD17-006 / WDK01-007 ほか計9枚）
  m = text.match(new RegExp(`あなたがベットする場合[、,][^。]*?使用コストは${COST}になる`));
  if (m) return ctx?.isBetting ? toCostStr(m[1]) : null;

  // ①' 使用時の任意支払い形（WX21-035 / WX21-071）＝ベット形と同じく**宣言してはじめて成立する**。
  const optDiscard = parseOptionalDiscardForCost(text);
  if (optDiscard) return ctx?.paidOptionalDiscard ? optDiscard.replacement : null;

  // ② 対戦相手のこのターンのアーツ／スペル使用（WX09-Re02）。
  //    「両方」のほうが強い条件＝先に見る（両方成立時は後段の《白×0》が正）。
  const oppArts = ctx?.oppState?.turn_arts_used === true;
  const oppSpell = (ctx?.oppState?.actions_done ?? []).includes('USE_SPELL');
  m = text.match(new RegExp(`両方を使用していた場合[、,][^。]*?使用コストは${COST}になる`));
  if (m && oppArts && oppSpell) return toCostStr(m[1]);
  m = text.match(new RegExp(`このターンに対戦相手がアーツかスペルを使用していた場合[、,][^。]*?使用コストは${COST}になる`));
  if (m && (oppArts || oppSpell)) return toCostStr(m[1]);

  // ③ 場に特定カード名がある場合（WX05-038）
  m = text.match(new RegExp(`あなたの場に《([^》]+)》がある場合[、,][^。]*?使用コストは${COST}になる`));
  if (m && myState.field && cardMap) {
    const name = m[1];
    const onField = [
      ...(myState.field.signi ?? []).map(stack => stack?.at(-1)),
      myState.field.lrig?.at(-1),
    ].some(n => !!n && cardMap.get(n)?.CardName === name);
    if (onField) return toCostStr(m[2]);
  }

  // ④ トラッシュ枚数条件（WD22-041-UG）
  m = text.match(new RegExp(`あなたのトラッシュにカードが([０-９\\d]+)枚以上ある場合[、,][^。]*?使用コストは${COST}になる`));
  if (m && (myState.trash?.length ?? 0) >= parseInt(toHalfWidth(m[1]))) return toCostStr(m[2]);

  return null;
}

// EffectText を参照してアーツの実効コストを算出（条件付きコスト軽減の近似）
export function computeArtsEffectiveCost(
  // CardName は `card_cost_replacements`（カード名指定の置換）の照合に要る＝落とすと静かに効かなくなる
  card: { CardName?: string; Cost: string; EffectText?: string },
  myState: { life_cloth: string[]; hand: string[]; field?: PlayerState['field']; trash?: string[]; lrig_trash?: string[] },
  lrigName?: string,
  oppLrigColor?: string,
  myLrigLevel?: number,
  cardMap?: Map<string, CardData>,
  lrigNameAliases?: string[],
  artsThresholdReductions?: { minTotalCost: number; color: string; reduction: number }[],
  replaceCtx?: CostReplaceCtx,
): string {
  const text = card.EffectText ?? '';
  const base = card.Cost;
  let m: RegExpMatchArray | null;

  // lrigName判定：エイリアスも含めた名前一致チェック
  // LRIG_ALL_NAMES_SENTINEL がある場合はどのキーワードにも一致
  const lrigNameMatches = (keyword: string) =>
    lrigNameAliases?.includes(LRIG_ALL_NAMES_SENTINEL) ||
    lrigName?.includes(keyword) || lrigNameAliases?.some(a => a.includes(keyword));

  // 条件つきコスト置換（「〜の場合、使用コストは《X》になる」）＝軽減より先に見る＝印刷コストを丸ごと差し替える
  const replaced = computeCostReplacement(card, myState, cardMap, replaceCtx);
  if (replaced !== null) return replaced;

  // 対戦相手のルリグ色条件：コスト上書き
  m = text.match(/対戦相手のセンタールリグが(.+?)の場合[、,](?:このアーツの|このカードの)?(?:使用|基本)コストは(.+?)になる/s);
  if (m && oppLrigColor) {
    const colors = m[1].split(/か|と/).map(c => c.trim()).filter(Boolean);
    if (colors.some(c => oppLrigColor.includes(c))) {
      return normalizeCostText(m[2]);
    }
  }

  // 自分のセンタールリグのレベル条件：コスト減
  m = text.match(/センタールリグのレベルが([０-９\d]+)(以上|以下)[^、]*(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && myLrigLevel !== undefined) {
    const threshold = parseInt(toHalfWidth(m[1]));
    const op = m[2];
    const condMet = op === '以上' ? myLrigLevel >= threshold : myLrigLevel <= threshold;
    if (condMet) return removeOneCostColor(base, m[3]);
  }

  // ライフクロスがN枚以下の場合コスト減
  m = text.match(/ライフクロスが([０-９\d]+)枚以下.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && myState.life_cloth.length <= parseInt(toHalfWidth(m[1]))) {
    return removeOneCostColor(base, m[2]);
  }

  // 手札がN枚以下の場合コスト減
  m = text.match(/手札が([０-９\d]+)枚以下.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && myState.hand.length <= parseInt(toHalfWidth(m[1]))) {
    return removeOneCostColor(base, m[2]);
  }

  // センタールリグ名条件（エイリアスも考慮）
  m = text.match(/センタールリグのカード名に《([^》]+)》を含む.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && lrigNameMatches(m[1])) {
    return removeOneCostColor(base, m[2]);
  }
  m = text.match(/センタールリグが.*?カード名に《([^》]+)》.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && lrigNameMatches(m[1])) {
    return removeOneCostColor(base, m[2]);
  }

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
    // 場の特定クラスのシグニ1体につき色コスト軽減（枚数比例。WX04-030「場の＜迷宮＞シグニ1体につき《白×1》減る」）
    // 色指定は《白×1》（括弧内）/《白》×1（括弧外）の両表記に対応。
    m = text.match(/(?:あなたの)?場に(?:ある)?＜([^＞]+)＞のシグニ([０-９一]+)体につき[^、。]*?《([^》]+)》(?:×?([０-９\d]+))?減る/);
    if (m) {
      const cls = m[1];
      const perN = parseInt(toHalfWidth(m[2].replace('一', '1'))) || 1;
      const inner = m[3].match(/([^×x]+)[×x]?([０-９\d]*)/);
      const color = (inner?.[1] ?? m[3]).trim();
      const perRed = parseInt(toHalfWidth(inner?.[2] || m[4] || '1')) || 1;
      const cnt = (myState.field.signi ?? []).filter(stack => {
        const top = stack?.at(-1);
        return top && (cardMap.get(top)?.CardClass ?? '').includes(cls);
      }).length;
      const reduction = Math.floor(cnt / perN) * perRed;
      if (reduction > 0) return removeNColorFromCost(base, color, reduction);
    }
  }

  // SPELL_COST_REDUCTION_BY_TRASH_COUNT: トラッシュのクラスシグニN枚につき色コスト×1軽減
  if (myState.trash && cardMap) {
    m = text.match(/トラッシュにある＜([^＞]+)＞のシグニ([０-９\d]+)枚につき《([^》]+)》×?([０-９\d]*)減る/);
    if (m) {
      const cls = m[1]; const perN = parseInt(toHalfWidth(m[2])); const col = m[3]; const perRed = parseInt(toHalfWidth(m[4] || '1')) || 1;
      const cnt = myState.trash.filter(cn => (cardMap.get(cn)?.CardClass ?? '').includes(cls) && cardMap.get(cn)?.Type === 'シグニ').length;
      const reduction = Math.floor(cnt / perN) * perRed;
      if (reduction > 0) return removeNColorFromCost(base, col, reduction);
    }
  }

  // ===== タスク12(xc)：既存規則集に無かった条件つきコスト軽減（全数計測で 37枚ぶん） =====
  // 「《色×N》…減る」の並びを {color,count}[] へ（複数色を同時に減らす形がある）。
  const parseReduceList = (raw: string) => parseGrowCost(normalizeCostText(raw));
  const applyReduce = (cost: string, list: { color: string; count: number }[], times = 1): string => {
    let out = cost;
    for (const r of list) out = removeNColorFromCost(out, r.color, r.count * times);
    return out;
  };
  const RED = '((?:《[^》]+》)+)';

  // A. 「あなたのセンタールリグが＜X＞の場合、この{アーツ|スペル}の使用コストは《色×N》減る」（14枚）。
  //    既存の lrigName 規則は「カード名に《X》を含む」＋「《色》1つ少なく」形しか読まない。
  m = text.match(new RegExp(`あなたのセンタールリグが＜([^＞]+)＞の場合[、,][^。]*?使用コストは${RED}減る`));
  if (m && lrigNameMatches(m[1])) return applyReduce(base, parseReduceList(m[2]));

  // D. 「あなたのセンタールリグのレベル１につき《色×N》減る」（5枚）＝レベル比例。
  m = text.match(new RegExp(`あなたのセンタールリグのレベル[１1]につき${RED}減る`));
  if (m && myLrigLevel !== undefined && myLrigLevel > 0) {
    return applyReduce(base, parseReduceList(m[1]), myLrigLevel);
  }

  // C. 「あなたのルリグトラッシュにあるアーツ１枚につき《色×N》減る」（2枚）＝枚数比例。
  m = text.match(new RegExp(`あなたのルリグトラッシュにあるアーツ[１1]枚につき${RED}減る`));
  if (m && myState.lrig_trash && cardMap) {
    const artsCount = myState.lrig_trash.filter(cn => cardMap.get(getCardNum(cn))?.Type === 'アーツ').length;
    if (artsCount > 0) return applyReduce(base, parseReduceList(m[1]), artsCount);
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

  // H. 「あなたの場にある〔色/カード名条件〕シグニ１体につき《色×N》減る」（11枚）。
  //    ⚠既存の ＜クラス＞ 版（fieldClassPer）とは**別の形**＝クラス指定が無い／色指定／カード名部分一致。
  //    ＜＞ を含む文はこの regex に当たらない（`場にある` の直後が `シグニ` でないため）＝取り違えない。
  m = text.match(new RegExp(
    `あなたの場にある(?:カード名に《([^》]+)》を含む|([白赤青緑黒])の)?シグニ([０-９一]+)体につき${RED}減る`));
  if (m && myState.field && cardMap) {
    const nameKeyword = m[1];
    const color = m[2];
    const perN = parseInt(toHalfWidth(m[3].replace('一', '1'))) || 1;
    const cnt = (myState.field.signi ?? []).filter(stack => {
      const top = stack?.at(-1);
      if (!top) return false;
      const c = cardMap.get(getCardNum(top));
      if (!c) return false;
      if (nameKeyword && !c.CardName.includes(nameKeyword)) return false;
      if (color && !(c.Color ?? '').includes(color)) return false;
      return true;
    }).length;
    const times = Math.floor(cnt / perN);
    if (times > 0) return applyReduce(base, parseReduceList(m[4]), times);
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
    // 「対戦相手の場にある〜」で数える語＝実測4種。コインだけは場ではないので別規則（I-4）。
    const OPP_TERM = '(凍結状態のシグニ|能力を持たないシグニ|【チャーム】|【ウィルス】)';
    const countOppTerm = (term: string): number => {
      const f = oppSt?.field;
      if (!f) return 0;
      if (term === '【チャーム】') return (f.signi_charms ?? []).filter(Boolean).length;
      if (term === '【ウィルス】') return (f.signi_virus ?? []).reduce((s, n) => s + (n || 0), 0);
      return (f.signi ?? []).filter((stack, i) => {
        const top = stack?.at(-1);
        if (!top) return false;
        if (term === '凍結状態のシグニ') return (f.signi_frozen ?? [])[i] === true;
        // 「能力を持たないシグニ」＝①原文が空＝**素のシグニ158枚**（⚠CSV は空文字ではなく `-` で持つので、
        //   `!!EffectText` 判定だと1枚も当たらない）②`abilities_removed` でこのターン能力を消された分。
        // ⚠CONTINUOUS の `REMOVE_ABILITIES`（「凍結状態のシグニは能力を失う」等）は effectsMap が要るので
        //   ここでは見られない＝その分だけ**安く見積もらない**側に倒れる（PLAN §3 タスク12 へ登録）。
        // cardMap が無いと「全員が能力なし」に化けて**過剰に安くなる**ので、引けないときは数えない。
        if (!cardMap) return false;
        if (oppSt?.abilities_removed?.includes(top)) return true;
        const c = cardMap.get(getCardNum(top));
        const blank = (s?: string) => { const t = (s ?? '').trim(); return t === '' || t === '-'; };
        return !!c && blank(c.EffectText) && blank(c.BurstText);
      }).length;
    };
    const countMyClassSigni = (cls: string): number =>
      (myState.field?.signi ?? []).filter(stack => {
        const top = stack?.at(-1);
        return !!top && (cardMap?.get(getCardNum(top))?.CardClass ?? '').includes(cls);
      }).length;

    // I-1. 合算形「あなたの場にある＜X＞のシグニ1体**か**対戦相手の場にある〔語〕1つにつき《色×N》減る」
    //      （`WX08-028`／`WX08-032`）＝「か」は択一ではなく**両方の合計**に比例する。
    //      ⚠I-3 より先に見る（この原文は I-3 の regex も部分一致するため）。
    m = costSentence.match(new RegExp(
      `あなたの場にある＜([^＞]+)＞のシグニ[１1]体か対戦相手の場にある${OPP_TERM}[１1](?:体|枚|つ)につき${RED}減る`));
    if (m) {
      const times = countMyClassSigni(m[1]) + countOppTerm(m[2]);
      if (times > 0) return applyReduce(base, parseReduceList(m[3]), times);
    }

    // I-2. 累積形「…＜X＞のシグニ1体につき《色×N》減**り**、対戦相手の場にある〔語〕1つにつき《色×M》減る」
    //      （`WX16-033`）＝2つの軽減が**重なる**ので早期 return できない。
    m = costSentence.match(new RegExp(
      `あなたの場にある＜([^＞]+)＞のシグニ[１1]体につき${RED}減り[、,]対戦相手の場にある${OPP_TERM}[１1](?:体|枚|つ)につき${RED}減る`));
    if (m) {
      let out = base;
      const myCnt = countMyClassSigni(m[1]);
      if (myCnt > 0) out = applyReduce(out, parseReduceList(m[2]), myCnt);
      const oppCnt = countOppTerm(m[3]);
      if (oppCnt > 0) out = applyReduce(out, parseReduceList(m[4]), oppCnt);
      if (out !== base) return out;
    }

    // I-3. 相手のみ「対戦相手の場にある〔語〕1つにつき《色×N》減る」
    //      （`WX07-065` 凍結／`WX21-Re01` 能力なし／`SP26-003` ウィルス）。
    m = costSentence.match(new RegExp(`対戦相手の場にある${OPP_TERM}[１1](?:体|枚|つ)につき${RED}減る`));
    if (m) {
      const cnt = countOppTerm(m[1]);
      if (cnt > 0) return applyReduce(base, parseReduceList(m[2]), cnt);
    }

    // I-4. 「対戦相手のコイン1枚につき《赤×1》減る」（`SPK01-14`）＝場ではなくコイン枚数。
    m = costSentence.match(new RegExp(`対戦相手のコイン[１1]枚につき${RED}減る`));
    if (m && (oppSt?.coins ?? 0) > 0) return applyReduce(base, parseReduceList(m[1]), oppSt!.coins!);

    // I-5. 「あなたのライフクロスが対戦相手より多い場合、…《無×3》減る」（`SP38-002`）＝枚数比較。
    //      ⚠相手ライフが未知（`life_cloth` 未指定）のときは**成立させない**＝安いほうへ倒さない。
    m = costSentence.match(new RegExp(`あなたのライフクロスが対戦相手より多い場合[、,][^。]*?使用コストは${RED}減る`));
    if (m && oppSt?.life_cloth && myState.life_cloth.length > oppSt.life_cloth.length) {
      return applyReduce(base, parseReduceList(m[1]));
    }
  }

  // ARTS_COST_REDUCTION_BY_COST_THRESHOLD: コスト合計がN以上なら色コスト軽減
  if (artsThresholdReductions && artsThresholdReductions.length > 0) {
    const totalCost = parseGrowCost(base).reduce((s, c) => s + c.count, 0);
    for (const { minTotalCost, color, reduction } of artsThresholdReductions) {
      if (totalCost >= minTotalCost) {
        return removeNColorFromCost(base, color, reduction);
      }
    }
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
        const colorMatches = color === '無' || p.color.includes(color) || p.extraColor === color ||
          (colorSubs?.some(s => s.to === p.color && s.from.includes(color)));
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

// ベットで支払えるコイン枚数の選択肢を返す。
//  - 固定（「ベット―《コイン》《コイン》」）→ { options:[2], variable:false }
//  - 段階（「ベット―《コイン》or《コイン》《コイン》」）→ { options:[1,2], variable:false }
//  - 可変（「ベット―好きな枚数の《コイン》」）→ { options:[], variable:true }（UIで1..所持枚数を提示）
export function parseBetOptions(effectText: string): { options: number[]; variable: boolean } {
  if (!effectText) return { options: [], variable: false };
  const m = effectText.match(/ベット[―─]\s*([\s\S]*)/);
  if (!m) return { options: [], variable: false };
  const seg = m[1];
  if (/^好きな枚数/.test(seg)) return { options: [], variable: true };
  // 先頭の《コインアイコン》/or の連続部分だけを取り出して段階を数える
  const prefix = (seg.match(/^(?:《コインアイコン》|or)+/) ?? [''])[0];
  const tiers = prefix.split('or').map(s => (s.match(/《コインアイコン》/g) ?? []).length).filter(n => n > 0);
  return { options: tiers, variable: false };
}

// アンコールコストをパース（エナコスト＋コイン枚数）
export function parseEncoreCost(effectText: string): { energy: { color: string; count: number }[]; coins: number } | null {
  if (!effectText.startsWith('アンコール－')) return null;
  const afterDash = effectText.slice('アンコール－'.length);
  // 「（」か漢字テキストの直前まで（アイコン部分のみ）
  const beforeContent = afterDash.split(/[（。【]/)[0];
  const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);
  const energy: { color: string; count: number }[] = [];
  let coins = 0;
  const re = /《([^》]+)》/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(beforeContent)) !== null) {
    if (m[1] === 'コインアイコン') { coins++; continue; }
    if (ENERGY_COLORS.has(m[1])) { energy.push({ color: m[1], count: 1 }); continue; }
    const inner = m[1].match(/^([白赤青緑黒無])×([０-９0-9]+)$/);
    if (inner) {
      const cnt = parseInt(inner[2].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0x30 - 0xFEE0)));
      energy.push({ color: inner[1], count: isNaN(cnt) ? parseInt(inner[2]) : cnt });
    }
  }
  return (energy.length > 0 || coins > 0) ? { energy, coins } : null;
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
): boolean {
  if (extraCosts.length === 0) return canAffordGrowCost(energyNums, cards, baseCost, keywordGrants, allMulti, stripped, colorlessOverrides, colorSubs, extraColorMap, trashSubWilds, trashSubColors, extraWildCount);
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
        const extraColor = extraColorMap?.get(n) ?? trashSubColors?.get(n);
        const colorMatches = color === '無' || isTrashWild || cardColor.includes(color) || extraColor === color ||
          (colorSubs?.some(s => s.to === cardColor && s.from.includes(color)));
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
  return canAffordGrowCost(pool, cards, baseCost, keywordGrants, allMulti, stripped, colorlessOverrides, colorSubs, extraColorMap, trashSubWilds, trashSubColors, extraWildCount);
}

// ブーストの任意追加エナコスト（先頭の「ブースト―《色》…」）を返す。
// アーツ本体 cost とは分離し、宣言時だけ ArtsModal の支払い検証へ加える。
export function parseBoostCost(effectText: string): { color: string; count: number }[] {
  const m = effectText.match(/^ブースト[―─]((?:《[白赤青緑黒無]》)+)/);
  if (!m) return [];
  const counts = new Map<string, number>();
  for (const icon of m[1].matchAll(/《([白赤青緑黒無])》/g)) {
    counts.set(icon[1], (counts.get(icon[1]) ?? 0) + 1);
  }
  return [...counts].map(([color, count]) => ({ color, count }));
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
