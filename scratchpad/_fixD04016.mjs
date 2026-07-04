import fs from 'fs';
// WXDi-D04-016-E2: 「トラッシュにスペルがあるかぎり、+3000され、このシグニによってバニッシュされた
// シグニはエナ→トラッシュ」＝条件付き CONTINUOUS SEQUENCE（+3000＋BANISH_REDIRECT）に是正。
// 現状は無条件 +3000 のみ（条件脱落＋BANISH_REDIRECT 脱落）。兄弟 WXDi-CP02-071 に倣う。
// BANISH_REDIRECT はブラント（相手全バニッシュ→トラッシュ）＝「このシグニによって」の絞りは近似
// （兄弟 WX09-022/WXK11-032 も同じ近似）。手パッチのため MANUAL 刻印。
const path = 'public/data/effects_WXDi.json';
const o = JSON.parse(fs.readFileSync(path, 'utf8'));
const arr = o['WXDi-D04-016'];
const e2 = arr.find(e => e.effectId === 'WXDi-D04-016-E2');
if (!e2) throw new Error('E2 not found');
e2.activeCondition = { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardType: 'スペル' } };
e2.action = {
  type: 'SEQUENCE',
  steps: [
    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 3000 },
    { type: 'BANISH_REDIRECT', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, redirectTo: 'trash', until: 'PERMANENT' },
  ],
};
e2.parseStatus = 'MANUAL';
fs.writeFileSync(path, JSON.stringify(o));
console.log('patched WXDi-D04-016-E2');
console.log(JSON.stringify(e2));
