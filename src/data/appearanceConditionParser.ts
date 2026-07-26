import type {
  AppearanceCondition,
  AppearanceSourceZone,
  EffectCost,
  TargetFilter,
} from '../types/effects';

const FW: Record<string, number> = {
  '０': 0, '１': 1, '２': 2, '３': 3, '４': 4,
  '５': 5, '６': 6, '７': 7, '８': 8, '９': 9,
};
const num = (text: string): number => /^\d+$/.test(text)
  ? Number(text)
  : [...text].reduce((n, c) => n * 10 + (FW[c] ?? 0), 0);

function parseTimings(raw: string): AppearanceCondition['timings'] {
  const result: AppearanceCondition['timings'] = [];
  if (raw.includes('《メインフェイズアイコン》')) result.push('MAIN');
  if (raw.includes('《アタックフェイズアイコン》')) result.push('ATTACK');
  if (raw.includes('《スペルカットインアイコン》')) result.push('SPELL_CUTIN');
  return result;
}

function parseFilter(text: string): TargetFilter {
  const filter: TargetFilter = { cardType: 'シグニ' };
  const stories = [...text.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
  if (stories.length) filter.story = stories.length === 1 ? stories[0] : stories;
  const colors = [...text.matchAll(/(?:^|と|ない)(白|赤|青|緑|黒)の/g)].map(m => m[1]);
  if (colors.length) filter.color = colors.length === 1 ? colors[0] : colors;
  const levelMax = text.match(/レベル([０-９\d]+)以下/);
  const levelMin = text.match(/レベル([０-９\d]+)以上/);
  if (levelMax) filter.level = { max: num(levelMax[1]) };
  if (levelMin) filter.level = { min: num(levelMin[1]) };
  const containsName = text.match(/カード名に《([^》]+)》を含む/);
  if (containsName) filter.cardName = containsName[1];
  if (text.includes('レゾナではない')) filter.excludeResona = true;
  return filter;
}

function parseZones(text: string): AppearanceSourceZone[] {
  const zones: AppearanceSourceZone[] = [];
  if (text.includes('手札')) zones.push('hand');
  if (text.includes('エナゾーン')) zones.push('energy');
  if (text.includes('場から') || text.includes('手札と場') || text.includes('エナゾーンと場')) zones.push('field');
  return zones;
}

function singleZoneCost(zone: AppearanceSourceZone, count: number, filter: TargetFilter): EffectCost {
  if (zone === 'hand') return { discard: count, discardFilter: filter };
  if (zone === 'energy') return { energyTrash: { count, filter } };
  return { fieldTrash: { count, filter } };
}

export function parseAppearanceCondition(raw: string): AppearanceCondition {
  const timings = parseTimings(raw);
  const body = raw.replace(/《(?:メインフェイズ|アタックフェイズ|スペルカットイン)アイコン》/g, '').trim();

  if (body.startsWith('以下の３つから２つを選ぶ')) {
    return {
      rawText: raw, timings, cost: {},
      choice: {
        choose: 2,
        options: [
          { discard: 1, discardFilter: { cardType: 'シグニ', story: '凶蟲' } },
          { energyTrash: { count: 2, filter: { cardType: 'シグニ', story: '凶蟲' } } },
          { fieldTrash: { count: 1, filter: { cardType: 'シグニ', story: '凶蟲', excludeResona: true } } },
        ],
      },
      paymentShape: 'REQUIRES_NEW_FLOW',
    };
  }

  if (body.includes('レゾナ１体をあなたの場からルリグトラッシュに置き')) {
    return {
      rawText: raw, timings,
      cost: {
        fieldToLrigTrash: { count: 1, filter: { cardType: 'レゾナ' } },
        fieldTrash: { count: 1, filter: { cardType: 'シグニ', level: { min: 3 }, excludeResona: true } },
      },
      paymentShape: 'REQUIRES_NEW_FLOW',
    };
  }

  // 場の複数グループ。「《固有名》1体と《固有名》1体」だけでなく、
  // 「《固有名》1体とレゾナではない＜クラス＞1体」の混在も各グループを独立に保つ。
  const fieldGroups = [...body.matchAll(/(?:《([^》]+)》|(レゾナではない)?(?:(白|赤|青|緑|黒)の)?(?:＜([^＞]+)＞の)?シグニ)([０-９\d]+)体/g)];
  if (fieldGroups.length >= 2 && parseZones(body).includes('field')) {
    return {
      rawText: raw, timings,
      cost: { fieldTrashGroups: fieldGroups.map(m => ({
        count: num(m[5]),
        filter: {
          cardType: 'シグニ',
          ...(m[1] ? { cardNames: [m[1]] } : {}),
          ...(m[3] ? { color: m[3] } : {}),
          ...(m[4] ? { story: m[4] } : {}),
          ...(m[2] ? { excludeResona: true } : {}),
        },
      })) },
      paymentShape: 'REQUIRES_NEW_FLOW',
    };
  }

  const coloredGroups = [...body.matchAll(/(白|赤|青|緑|黒)の(?:＜([^＞]+)＞の)?シグニ([０-９\d]+)枚/g)];
  if (coloredGroups.length >= 2) {
    const groups = coloredGroups.map(m => ({
      count: num(m[3]),
      filter: { cardType: 'シグニ' as const, color: m[1], ...(m[2] ? { story: m[2] } : {}) },
    }));
    const zone = parseZones(body)[0];
    return {
      rawText: raw, timings,
      cost: zone === 'hand' ? { discardGroups: groups } : { energyTrashGroups: groups },
      paymentShape: 'REQUIRES_NEW_FLOW',
    };
  }

  const filter = parseFilter(body);
  const zones = parseZones(body);
  const countMatch = body.match(/(?:合計)?([０-９\d]+)(?:枚|体)/);
  const count = countMatch ? num(countMatch[1]) : undefined;
  const totalLevel = body.match(/レベルの合計が([０-９\d]+)以上/);
  const totalPower = body.match(/パワーの合計が([０-９\d]+)以上/);

  if (zones.length > 1 || totalLevel || totalPower || body.includes('好きな数')) {
    return {
      rawText: raw, timings, cost: {},
      combinedTrash: {
        zones,
        ...(count !== undefined ? { count } : {}),
        ...(body.includes('好きな数') ? { variable: true } : {}),
        filter,
        ...(totalLevel ? { totalLevelMin: num(totalLevel[1]) } : {}),
        ...(totalPower ? { totalPowerMin: num(totalPower[1]) } : {}),
      },
      paymentShape: 'REQUIRES_NEW_FLOW',
    };
  }

  if (zones.length === 1 && count !== undefined) {
    const mainOnly = timings.length === 1 && timings[0] === 'MAIN';
    return {
      rawText: raw, timings,
      cost: singleZoneCost(zones[0], count, filter),
      paymentShape: mainOnly ? 'SINGLE_ZONE' : 'REQUIRES_NEW_FLOW',
    };
  }

  return {
    rawText: raw, timings, cost: {},
    paymentShape: 'REQUIRES_NEW_FLOW',
    deferReason: 'コスト文型を安全に支払える構造へ変換できない',
  };
}
