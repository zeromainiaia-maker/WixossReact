import fs from 'fs';
// 「あなたの場に《X》がいる場合」13枚の全数機械分類
// 目的: JSON に既にその名前を参照する条件があるか（偽陽性）／条件丸ごと脱落か（実バグ）を判別
const IDS = ['SPDi43-07','SPDi43-09','WX24-P1-044','WX24-P1-048','WX25-P2-052','WX25-P2-054','WX25-P2-056','WX25-P2-060','WXDi-P12-045','WXDi-P12-050','WXDi-P13-055','WXDi-P15-050','WXDi-P15-054'];

const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
const cardName = new Map(); // id -> 名前 (col1?) 実際の列は下で確認
for (const f of csvFiles) {
  for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
    const cols = line.split(',');
    if (IDS.includes(cols[0])) {
      texts.set(cols[0], cols.slice(18).join(',').replace(/（[^）]*）/g, ''));
      cardName.set(cols[0], cols[1]);
    }
  }
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of effFiles) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));

for (const id of IDS) {
  const t = texts.get(id) || '';
  // 「あなたの場に《…》がいる場合」節を抽出
  const m = t.match(/あなたの場に《([^》]+)》がいる場合/);
  const name = m ? m[1] : '(?)';
  const j = JSON.stringify(all[id] || {});
  const hasCondType = j.includes('HAS_CARD_IN_FIELD');
  const nameInJson = name !== '(?)' && j.includes(name);
  const hasCardName = j.includes('cardName');
  console.log('====== ' + id + '  [' + cardName.get(id) + ']  《' + name + '》 ======');
  const sents = t.split('。').filter(s => /場に《[^》]+》がいる場合/.test(s));
  console.log('該当文: ' + sents.join('。').slice(0, 220));
  console.log('  HAS_CARD_IN_FIELD在:' + hasCondType + ' / 名前"' + name + '"在JSON:' + nameInJson + ' / cardName在:' + hasCardName);
  console.log('  JSON: ' + j.slice(0, 600));
  console.log();
}
