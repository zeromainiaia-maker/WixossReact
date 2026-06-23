import type { Owner, EffectTarget, TargetFilter, StubAction, EnergyCost } from '../types/effects';

// costColors から実際の色名だけを抽出（カード名を除外、《赤×2》→["赤","赤"]に展開）
export function extractCostColors(text: string): string[] {
  const result: string[] = [];
  for (const m of text.matchAll(/《([^》]+)》/g)) {
    const s = m[1];
    const countM = s.match(/^([赤青緑黒白無])[×x×](\d+)$/);
    if (countM) {
      const count = parseInt(countM[2], 10);
      for (let i = 0; i < count; i++) result.push(countM[1]);
    } else if (/^[赤青緑黒白無]$/.test(s)) {
      result.push(s);
    }
    // カード名・その他は無視
  }
  return result;
}

// REVEAL_PICK_HAND_SHUFFLE_BOTTOM STUBのメタデータを抽出して返す
export function makeRevealPickStub(t: string): StubAction {
  let pickCount: number | 'ALL' = 1;
  // パターン1: "その中からN枚" (直接)
  const countM = t.match(/その中から([０-９\d]+|好きな枚数|すべて)/);
  if (countM) {
    const v = countM[1];
    if (v === '好きな枚数' || v === 'すべて') pickCount = 'ALL';
    else pickCount = parseNum(v);
  } else {
    // パターン2: "カードをN枚まで" or "N枚まで手札に加え" (数字が中間にある場合)
    const countM2 = t.match(/([０-９\d]+)枚(?:まで)?(?:を)?手札に加え/);
    if (countM2) pickCount = parseNum(countM2[1]);
  }
  let restDest: 'deck_bottom' | 'trash' | 'energy' = 'deck_bottom';
  if (t.match(/残り.*トラッシュ|トラッシュに置く$|トラッシュに置いてもよい$/)) restDest = 'trash';
  else if (t.match(/残り.*エナゾーン|エナゾーンに置く$/)) restDest = 'energy';
  const then: 'hand' | 'energy' =
    (t.match(/エナゾーンに置く/) && !t.match(/手札に加え/)) ? 'energy' : 'hand';
  return { type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM', revealPickParams: { pickCount, restDest, then } } as StubAction;
}


const FW_DIGIT: Record<string, string> = {
  '０':'0','１':'1','２':'2','３':'3','４':'4',
  '５':'5','６':'6','７':'7','８':'8','９':'9',
};
export function toHalf(s: string): string {
  return s.replace(/[０-９]/g, c => FW_DIGIT[c] ?? c);
}
// ルール補足テキスト（全角括弧）を除去（入れ子対応：内側から順に除去）
export function stripRuleParens(s: string): string {
  let result = s;
  let prev: string;
  do {
    prev = result;
    result = result.replace(/（[^（）]*）/g, '');
  } while (result !== prev);
  return result.trim();
}
export function parseNum(s: string): number {
  return parseInt(toHalf(s), 10);
}

export function parseSignedNum(s: string): number {
  const h = toHalf(s);
  if (h.startsWith('-') || h.startsWith('－')) return -parseInt(h.replace(/[＋－+-]/, ''), 10);
  return parseInt(h.replace(/[＋＋+]/, ''), 10);
}

export function parsePowerFilter(text: string): Partial<TargetFilter> {
  const above = text.match(/パワー([０-９\d]+)以上/);
  const below = text.match(/パワー([０-９\d]+)以下/);
  if (above || below) {
    return { powerRange: { min: above ? parseNum(above[1]) : undefined, max: below ? parseNum(below[1]) : undefined } };
  }
  return {};
}

export function parseLevelFilter(text: string): Partial<TargetFilter> {
  const above = text.match(/レベル([０-９\d]+)以上/);
  const below = text.match(/レベル([０-９\d]+)以下/);
  const exact = text.match(/レベル([０-９\d]+)の/);
  if (above || below) {
    return { level: { min: above ? parseNum(above[1]) : undefined, max: below ? parseNum(below[1]) : undefined } };
  }
  if (exact) return { level: parseNum(exact[1]) };
  return {};
}

export function parseColorFilter(text: string): Partial<TargetFilter> {
  for (const c of ['白', '赤', '青', '緑', '黒']) {
    if (text.includes(`${c}の`)) return { color: c };
  }
  return {};
}

export function parseCardTypeFilter(text: string): Partial<TargetFilter> {
  if (text.includes('シグニ')) return { cardType: 'シグニ' };
  if (text.includes('スペル')) return { cardType: 'スペル' };
  if (text.includes('アーツ')) return { cardType: 'アーツ' };
  if (text.includes('ルリグ')) return { cardType: 'ルリグ' };
  return {};
}

// ＜クラス名＞ を配列で抽出（例: ＜鉱石＞か＜宝石＞ → ['鉱石','宝石']）
export function parseStoryFilter(text: string): Partial<TargetFilter> {
  // 同一クラス名が複数回出る場合（条件文＋フィルタ文で＜X＞が2回など）は重複除去
  const matches = [...new Set([...text.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]))];
  if (matches.length === 0) return {};
  return { story: matches.length === 1 ? matches[0] : matches };
}

// 《カード名》 を抽出してカード名フィルターを返す
// コスト色（赤青緑黒白無）やアイコン系は除外する
const COST_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);
export function parseNameFilter(text: string): Partial<TargetFilter> {
  const names = [...text.matchAll(/《([^》]+)》/g)]
    .map(m => m[1])
    .filter(s =>
      !COST_COLORS.has(s) &&
      !s.includes('×') &&
      !s.includes('アイコン') &&
      !s.match(/^[白赤青緑黒無][×x×]\d+$/)
    );
  if (names.length === 0) return {};
  return names.length === 1 ? { cardName: names[0] } : { cardNames: names };
}

// ===== シグニターゲットパース =====

export function parseSigniTarget(text: string, owner: Owner): EffectTarget {
  const all = text.includes('すべてのシグニ') || text.includes('全てのシグニ') ||
              text.includes('シグニすべて') ||
              (!text.includes('このシグニ') && !!text.match(/シグニのパワーを/) && !text.match(/シグニ([０-９\d]+)体/));
  const upToM = text.match(/シグニを?([０-９\d]+)体まで/);
  const countM = text.match(/シグニを?([０-９\d]+)体/);
  const count = all ? 'ALL' : (upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1));
  const filter: TargetFilter = {
    cardType: 'シグニ',
    ...parsePowerFilter(text),
    ...parseLevelFilter(text),
    ...parseColorFilter(text),
    ...parseStoryFilter(text),
  };
  if (text.includes('感染状態')) filter.infected = true;
  if (text.includes('アクセされている') || text.match(/アクセされて(?:いる|いた)/)) filter.hasAcce = true;
  if (text.includes('アップ状態')) filter.isUp = true;
  if (text.includes('ダウン状態') && !text.includes('ダウン状態で場に出')) filter.isDown = true;
  if (text.includes('凍結状態')) filter.isFrozen = true;
  // 「あなたの他の（＜X＞の）シグニ」= 効果元シグニ自身を対象から除外（execTrash等が filter.excludeSelf を尊重）
  if (/他の[^。、]*シグニ/.test(text)) filter.excludeSelf = true;
  return { type: 'SIGNI', owner, count, filter, upToCount: !!upToM };
}


const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);

export function parseEnergyCosts(str: string): EnergyCost[] {
  const costs: EnergyCost[] = [];
  // 《色》×数字 形式（起動能力コスト等）
  const re = /《([^》]+)》(?:×([０-９\d]+))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(str)) !== null) {
    if (ENERGY_COLORS.has(m[1])) {
      costs.push({
        color: m[1] as EnergyCost['color'],
        count: m[2] ? parseNum(m[2]) : 1,
      });
    } else {
      // 《色×数字》 形式（説明文中のコスト表記）
      const inner = m[1].match(/^([白赤青緑黒無])×([０-９\d]+)$/);
      if (inner && ENERGY_COLORS.has(inner[1])) {
        costs.push({ color: inner[1] as EnergyCost['color'], count: parseNum(inner[2]) });
      } else {
        // 《色1/色2》×N 形式（混色コスト、無色N枚で近似）
        const bicolorInner = m[1].match(/^([白赤青緑黒])\/([白赤青緑黒])$/);
        if (bicolorInner) {
          const cnt = m[2] ? parseNum(m[2]) : 1;
          costs.push({ color: '無', count: cnt });
        } else {
          // 《色1/色2×N》 形式
          const bicolorNum = m[1].match(/^([白赤青緑黒])\/([白赤青緑黒])×([０-９\d]+)$/);
          if (bicolorNum) {
            costs.push({ color: '無', count: parseNum(bicolorNum[3]) });
          }
        }
      }
    }
  }
  return costs;
}
