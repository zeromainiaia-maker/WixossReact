// コスト文字列の解析・軽減適用・支払可否判定（グロウ/アーツ/スペル共通）。BattleScreen.tsx から Stage 0 で抽出。
import type { PlayerState, CardData } from '../../types';
import { LRIG_ALL_NAMES_SENTINEL } from '../../engine/effectEngine';
import { getCardNum } from '../../engine/effectExecutor';
import { toHalfWidth } from './battleUtils';

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

// EffectText を参照してアーツの実効コストを算出（条件付きコスト軽減の近似）
export function computeArtsEffectiveCost(
  card: { Cost: string; EffectText?: string },
  myState: { life_cloth: string[]; hand: string[]; field?: PlayerState['field']; trash?: string[] },
  lrigName?: string,
  oppLrigColor?: string,
  myLrigLevel?: number,
  cardMap?: Map<string, CardData>,
  lrigNameAliases?: string[],
  artsThresholdReductions?: { minTotalCost: number; color: string; reduction: number }[],
): string {
  const text = card.EffectText ?? '';
  const base = card.Cost;
  let m: RegExpMatchArray | null;

  // lrigName判定：エイリアスも含めた名前一致チェック
  // LRIG_ALL_NAMES_SENTINEL がある場合はどのキーワードにも一致
  const lrigNameMatches = (keyword: string) =>
    lrigNameAliases?.includes(LRIG_ALL_NAMES_SENTINEL) ||
    lrigName?.includes(keyword) || lrigNameAliases?.some(a => a.includes(keyword));

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
    m = text.match(/あなたの場にパワー([０-９\d]+)以上のシグニがある場合[^、]*使用コストは《([^》]+)》×([０-９\d]+)減る/);
    if (m) {
      const reqPower = parseInt(toHalfWidth(m[1]));
      const color = m[2];
      const cnt = parseInt(toHalfWidth(m[3]));
      const hasStrongSigni = (myState.field.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        if (!top) return false;
        const pow = parseInt(cardMap.get(top)?.Power ?? '0');
        return pow >= reqPower;
      });
      if (hasStrongSigni) return removeNColorFromCost(base, color, cnt);
    }
    // フィールドに特定クラスのシグニがある場合コスト減
    m = text.match(/あなたの場に＜([^＞]+)＞のシグニがある場合[^、]*使用コストは《([^》]+)》×([０-９\d]+)減る/);
    if (m) {
      const reqClass = m[1];
      const color = m[2];
      const cnt = parseInt(toHalfWidth(m[3]));
      const hasClassSigni = (myState.field.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        return top && (cardMap.get(top)?.CardClass ?? '').includes(reqClass);
      });
      if (hasClassSigni) return removeNColorFromCost(base, color, cnt);
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
