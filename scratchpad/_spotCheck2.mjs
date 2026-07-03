import fs from 'fs';
const targets = {
  'WX08-036': /パワー(が)?[０-９\d]+以[上下]/,
  'WX01-004': /レベル[０-９\d]以[上下]/,
  'WX09-016': /(ダウン状態の|アップ状態の)/,
  'WX13-039': /凍結状態の/,
  'WX03-001': /と同じ(色|レベル|カード名|名前|クラス)/,
  'WX07-006': /(パワー|レベル|コスト)の合計が[０-９\d]+以[上下]?/,
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
  const sent = (texts.get(id) || '').split('。').filter(s => re.test(s));
  console.log('====== ' + id + ' ======');
  console.log('該当文: ' + sent.join('。').slice(0, 150));
  console.log('JSON: ' + JSON.stringify(all[id]).slice(0, 600));
  console.log();
}
