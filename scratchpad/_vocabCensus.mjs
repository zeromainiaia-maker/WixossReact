import fs from 'fs';
// 原文の修飾句パターン × カードJSONの対応語彙 全数センサス
// カード単位の粗い判定（同カード別効果に語彙があれば合格＝過小評価側に倒す）

const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map(); // id -> 効果テキスト（注釈（…）除去済み）
for (const f of csvFiles) {
  for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
    const cols = line.split(',');
    const id = cols[0];
    if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
    let t = cols.slice(18).join(',');
    t = t.replace(/（[^）]*）/g, ''); // 注釈・キーワード説明を除去
    texts.set(id, (texts.get(id) || '') + t);
  }
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const jsonStr = new Map(); // id -> JSON文字列
for (const f of effFiles) {
  const j = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  for (const [id, effs] of Object.entries(j)) jsonStr.set(id, JSON.stringify(effs));
}

// パターン表: 原文regex → JSONにあるべき語彙（いずれか1つで合格）
const patterns = [
  ['最上級(最も/一番×パワー・レベル)', /(最も|一番)[^。]{0,10}(パワー|レベル)|(パワー|レベル)[^。]{0,6}(最も|一番)(高|低|大き|小さ)/, ['superlative','HIGHEST','LOWEST']],
  ['動的比較(〜より高い/低い)', /より[^。]{0,6}(高い|低い|大きい|小さい)/, ['powerLtSelf','powerLteSelf','powerBelowLeftCard','levelBelowLeftCard','powerLteLastProcessed','levelLteLastProcessed','levelLteDiscardSigni','levelBelow','powerBelow']],
  ['パワー閾値(NN以上/以下)', /パワー(が)?[０-９\d]+以[上下]|パワーが?[０-９\d]+(以上|以下)/, ['powerRange','powerLte','powerMax']],
  ['レベル閾値(N以上/以下)', /レベル[０-９\d]以[上下]/, ['"level"','levelRange','level":']],
  ['同一性(〜と同じ色/レベル/名前)', /と同じ(色|レベル|カード名|名前|クラス)/, ['levelEqLastProcessed','colorMatchesLrig','sameAs','levelEquals','levelEqDiscardLevelSum','levelEqualsVar']],
  ['共通する色', /共通する色/, ['colorMatchesLrig','colorNotMatchesLrig','eachDistinctColor','sharedColor']],
  ['凍結状態フィルタ', /凍結状態の/, ['isFrozen']],
  ['ダウン/アップ状態フィルタ', /(ダウン状態の|アップ状態の)/, ['isDown','isUp']],
  ['名前包含(カード名に《X》を含む)', /カード名に《[^》]+》を含む/, ['cardName']],
  ['否定フィルタ(〜ではないシグニ等)', /では?ない(シグニ|カード|スペル|ルリグ)/, ['Exclude','exclude','nonColorless','notCardType']],
  ['LB有無(ライフバーストを持つ/持たない)', /ライフバースト(アイコン)?》?を持(つ|たない)/, ['hasLifeBurst','noLifeBurst','hasBurst']],
  ['数量比例(〜1枚/1体につき)', /(１|1)(枚|体|つ)につき/, ['deltaPer','PER_','perCount','countFilter','PerCard','PerLevel','PerCharm']],
  ['合計制約(パワー/レベルの合計がN以下)', /(パワー|レベル|コスト)の合計が[０-９\d]+以[上下]?/, ['costMax','costMin','totalPower','totalLevel','LevelSum','levelSum','powerSum']],
  ['それぞれ異なる(色/レベル/名前)', /それぞれ(色|レベル|カード名|名前)?の?異なる/, ['eachDistinct']],
  ['奇数/偶数', /(奇数|偶数)/, ['levelParity','odd','even']],
];

const rows = [];
for (const [name, re, keys] of patterns) {
  let hitCards = [], missCards = [];
  for (const [id, t] of texts) {
    if (!re.test(t)) continue;
    hitCards.push(id);
    const js = jsonStr.get(id);
    if (!js) continue;
    if (!keys.some(k => js.includes(k))) missCards.push(id);
  }
  rows.push([name, hitCards.length, missCards.length, missCards]);
}
rows.sort((a, b) => b[2] - a[2]);
console.log('パターン名 | 原文該当カード | JSON語彙欠落(取りこぼし候補) | 例');
for (const [name, hits, miss, ids] of rows) {
  console.log(`${name} | ${hits} | ${miss} | ${ids.slice(0, 6).join(' ')}`);
}
