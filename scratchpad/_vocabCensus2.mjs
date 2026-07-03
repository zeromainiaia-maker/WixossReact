import fs from 'fs';
// 較正版センサス: キー表拡充 + STUB格納を別枠に分離
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) {
  for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
    const cols = line.split(',');
    const id = cols[0];
    if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
    texts.set(id, (texts.get(id) || '') + cols.slice(18).join(',').replace(/（[^）]*）/g, ''));
  }
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const jsonStr = new Map();
for (const f of effFiles) {
  const j = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  for (const [id, effs] of Object.entries(j)) jsonStr.set(id, JSON.stringify(effs));
}
const patterns = [
  ['最上級(最も×パワー/レベル)', /(最も|一番)[^。]{0,10}(パワー|レベル)|(パワー|レベル)[^。]{0,6}(最も|一番)(高|低|大き|小さ)/,
    ['superlative','HIGHEST','LOWEST']],
  ['動的比較(〜より高い/低い)', /より[^。]{0,6}(高い|低い|大きい|小さい)/,
    ['powerLtSelf','powerLteSelf','powerBelowLeftCard','levelBelowLeftCard','powerLteLastProcessed','levelLteLastProcessed','levelLteDiscardSigni','levelBelow','powerBelow','LowerLevel','LOWER','HIGHER']],
  ['パワー閾値(NN以上/以下)', /パワー(が)?[０-９\d]+以[上下]/,
    ['powerRange','SELF_POWER','POWER_GTE','POWER_LTE','powerGte','powerLte','powerMin','powerMax']],
  ['レベル閾値(N以上/以下)', /レベル[０-９\d]以[上下]/,
    ['"level"','levelRange','levelFilter','LEVEL_GTE','LEVEL_LTE','levelMax','levelMin','requiredLevel']],
  ['同一性(〜と同じ色/レベル/名前)', /と同じ(色|レベル|カード名|名前|クラス)/,
    ['levelEq','colorMatchesLrig','sameAs','"same"','sameLevel','sameName','sameColor','levelEqualsVar','SAME_']],
  ['共通する色', /共通する色/,
    ['MatchesLrig','eachDistinctColor','commonColor','sharedColor','SAME_COLOR','COMMON_COLOR']],
  ['凍結状態フィルタ', /凍結状態の/, ['isFrozen']],
  ['ダウン/アップ状態フィルタ', /(ダウン状態の|アップ状態の)/, ['isDown','isUp']],
  ['名前包含(カード名に《X》を含む)', /カード名に《[^》]+》を含む/, ['cardName','cardNames','nameContains']],
  ['否定フィルタ(〜ではない○○)', /では?ない(シグニ|カード|スペル|ルリグ)/,
    ['Exclude','exclude','nonColorless','noGuard','notResona','isResona']],
  ['数量比例(1枚/1体につき)', /(１|1)(枚|体|つ)につき/,
    ['deltaPer','PER_','perCount','countFilter','PerCard','PerLevel','PerCharm','$ref','last_processed','lastProcessed','addLast']],
  ['合計制約(合計がN以上/以下)', /(パワー|レベル|コスト)の合計が[０-９\d]+以[上下]?/,
    ['costMax','costMin','Sum','sum','totalPower','totalLevel']],
  ['それぞれ異なる', /それぞれ(色|レベル|カード名|名前)?の?異なる/, ['eachDistinct','distinctName']],
  ['奇数/偶数', /(奇数|偶数)/, ['levelParity','odd','even']],
];
const highAll = new Set();
console.log('パターン | 原文該当 | 高シグナル欠落 | STUB格納(要確認) | 高シグナル例');
for (const [name, re, keys] of patterns) {
  let hits = 0; const missHigh = [], missStub = [];
  for (const [id, t] of texts) {
    if (!re.test(t)) continue;
    hits++;
    const js = jsonStr.get(id);
    if (!js) continue;
    if (keys.some(k => js.includes(k))) continue;
    if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
    else { missHigh.push(id); highAll.add(id); }
  }
  console.log(`${name} | ${hits} | ${missHigh.length} | ${missStub.length} | ${missHigh.slice(0, 8).join(' ')}`);
}
console.log('\n高シグナル欠落カード総数(重複除外): ' + highAll.size);
fs.writeFileSync('scratchpad/_census_high.txt', [...highAll].join('\n'));
