import fs from 'fs';
// 抜き取り検査: 該当文と JSON を並べて出す
const targets = {
  'WD04-013': /パワー(が)?[０-９\d]+以[上下]/,
  'WX09-014': /より[^。]{0,6}(高い|低い|大きい|小さい)/,
  'WX03-024': /と同じ(色|レベル|カード名|名前|クラス)/,
  'WX02-027': /(１|1)(枚|体|つ)につき/,
  'WX07-024': /(ダウン状態の|アップ状態の)/,
  'WX04-034': /それぞれ(色|レベル|カード名|名前)?の?異なる/,
};
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) {
  for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
    const cols = line.split(',');
    if (targets[cols[0]]) texts.set(cols[0], cols.slice(18).join(',').replace(/（[^）]*）/g, ''));
  }
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of effFiles) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));
for (const [id, re] of Object.entries(targets)) {
  const t = texts.get(id) || '';
  const sent = t.split('。').filter(s => re.test(s));
  console.log('====== ' + id + ' ======');
  console.log('該当文: ' + sent.join('。').slice(0, 160));
  console.log('JSON: ' + JSON.stringify(all[id]).slice(0, 700));
  console.log();
}
