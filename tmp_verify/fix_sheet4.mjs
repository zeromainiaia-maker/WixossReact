// Sheet4タイミング不一致の実欠落・パース誤り2件の修正（他3件はチェッカー誤検出で対応済み）
import fs from 'fs';
import path from 'path';

const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const data = {};
for (const f of FILES) data[f] = JSON.parse(fs.readFileSync(path.resolve('public/data', f), 'utf8'));

function findFile(cardNum) {
  for (const f of FILES) if (data[f][cardNum]) return f;
  throw new Error(`${cardNum} not found`);
}
function effs(cardNum) { return data[findFile(cardNum)][cardNum]; }

// ── WXK10-039 羅原CH4: E1(CONTINUOUS TRASH self)は【出】の誤パース。
//    【常】：【アサシン】と【出】：自壊ペナルティに分離
{
  const e = effs('WXK10-039');
  const e1 = e.find(x => x.effectId === 'WXK10-039-E1');
  e1.action = { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'アサシン', duration: 'PERMANENT' };
  e1.parseStatus = 'MANUAL';
  e.push({
    effectId: 'WXK10-039-E2', effectType: 'AUTO', timing: ['ON_PLAY'],
    action: { type: 'STUB', id: 'SELF_TRASH_UNLESS_TRASH_OTHERS' },
    duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WD17-009 ゴクウ: 【自】欠落（アタック時パワー15000以上なら正面バニッシュ）→ STUB
effs('WD17-009').unshift({
  effectId: 'WD17-009-E1', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
  action: { type: 'STUB', id: 'BANISH_FACING_IF_SELF_POWER_GE_15000' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet4 fixes applied');
