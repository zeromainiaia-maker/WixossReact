// Sheet5タイミング不一致の実欠落3件の修正
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

// ── WDK06-R09 メル＝マドラー: 【起】《緑×0》欠落（シグニ1体+2000）
effs('WDK06-R09').push({
  effectId: 'WDK06-R09-E3', effectType: 'ACTIVATED', timing: ['ATTACK'],
  cost: { energy: [{ color: '緑', count: 0 }] },
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'any', count: 1, filter: { cardType: 'シグニ' } }, delta: 2000 },
  duration: 'UNTIL_END_OF_TURN', mandatory: false, parseStatus: 'MANUAL',
});

// ── WDK07-E01 エルドラ TYPE×Ⅳ: 【出】欠落（エナチャージ1→調理なら1ドロー）
effs('WDK07-E01').unshift({
  effectId: 'WDK07-E01-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'SEQUENCE', steps: [
    { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
    { type: 'STUB', id: 'DRAW_IF_CHARGED_CLASS' },
  ] },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── SPK01-11 ラズベリー: 【常】はE1の選択能力付与の参照（リマインダー扱い）+ E1のtimingバグ修正
{
  const e = effs('SPK01-11');
  const e1 = e.find(x => x.effectId === 'SPK01-11-E1');
  e1.timing = ['ON_ACCE_ATTACH']; // 「アクセとして付いたとき」: ON_ATTACK_SIGNIは誤り
  e1.parseStatus = 'MANUAL';
  e.push({
    effectId: 'SPK01-11-E2', effectType: 'CONTINUOUS',
    action: { type: 'STUB', id: 'RULE_REMINDER_TEXT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
  });
}

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet5 fixes applied');
