import fs from 'fs';
const IDS = ['PR-387','WD18-007','WD18-008','WD23-017-EA','WDK07-Y08','WX15-006','WX15-021','WX17-010','WXK07-105'];
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map(), names = new Map();
for (const f of csvFiles) for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
  const cols = line.split(','); if (IDS.includes(cols[0])) { texts.set(cols[0], cols.slice(18).join(',').replace(/（[^）]*）/g, '')); names.set(cols[0], cols[1]); }
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of effFiles) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));
for (const id of IDS) {
  const t = texts.get(id) || '';
  const j = JSON.stringify(all[id] || {});
  const sents = t.split('。').filter(s => /ベットしていた場合/.test(s));
  console.log('====== ' + id + '  [' + names.get(id) + '] ======');
  console.log('  該当文: ' + sents.join('。').slice(0, 200));
  console.log('  IS_BETTING在:' + j.includes('IS_BETTING') + ' / ベット語在JSON:' + (j.includes('ベット')||j.includes('BET')));
  console.log('  JSON: ' + j.slice(0, 500));
  console.log();
}
