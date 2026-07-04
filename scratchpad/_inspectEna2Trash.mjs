import fs from 'fs';
const IDS = 'WX01-027 WX05-018 WX09-022 WX19-078 WX21-005 WX24-P4-042 WXDi-CP02-066 WXDi-CP02-071 WXDi-CP02-102 WXDi-D04-016 WXDi-P14-053 WXDi-P15-044 WXDi-P16-063 WXEX2-75 WXK06-048 WXK11-032'.split(' ');
const csvFiles = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
const texts = new Map();
for (const f of csvFiles) for (const line of fs.readFileSync('public/data/' + f, 'utf8').split('\n')) {
  const c = line.split(','); if (IDS.includes(c[0])) texts.set(c[0], c.slice(18).join(',').replace(/（[^）]*）/g, ''));
}
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of effFiles) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));
for (const id of IDS) {
  const t = texts.get(id) || '';
  const s = t.split('。').find(x => /エナゾーンに置かれる代わりにトラッシュに置かれる/.test(x)) || '';
  const j = JSON.stringify(all[id] || {});
  const hasBR = j.includes('BANISH_REDIRECT');
  // 判定: 単純形（対戦相手のシグニがバニッシュされる場合）か、フィルタ付きか
  const simple = /(対戦相手の|この)?シグニがバニッシュされる場合、エナゾーンに置かれる代わりにトラッシュに置かれる/.test(s.replace(/^[^：]*：/, ''));
  const filtered = /(感染状態|このシグニによって|カード名|＜)/.test(s.slice(0, s.indexOf('がバニッシュ')));
  const thisTurn = /このターン/.test(s);
  const whileX = /あるかぎり|いるかぎり/.test(s);
  console.log(`${id} [BR:${hasBR?'○':'×'}] simple=${simple} filt=${filtered} turn=${thisTurn} while=${whileX}`);
  console.log(`   節: ${s.replace(/^[^：]*：/, '').slice(0, 100)}`);
}
