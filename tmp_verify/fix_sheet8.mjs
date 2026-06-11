// Sheet8タイミング不一致5件の修正
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

// ── WXDi-P10-040 エルドラ//メモリア: E1(常シャドウ)に誤マージされた【自】を分離
{
  const e = effs('WXDi-P10-040');
  const e1 = e.find(x => x.effectId === 'WXDi-P10-040-E1');
  e1.action = { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'シャドウ', duration: 'PERMANENT' };
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WXDi-P10-040-E1B', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
    action: { type: 'STUB', id: 'TRASH_UNDER_SPELLS_POWER_MINUS' },
    duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WXDi-P11-063 無心の豪圧: E1から誤マージのPOWER_MODIFYを除去し【自】を分離
{
  const e = effs('WXDi-P11-063');
  const e1 = e.find(x => x.effectId === 'WXDi-P11-063-E1');
  e1.action.steps = e1.action.steps.filter(s => s.type !== 'POWER_MODIFY');
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WXDi-P11-063-E2', effectType: 'AUTO', timing: ['ON_PLACED_UNDER_SIGNI'],
    action: { type: 'STUB', id: 'BUFF_HOST_WHEN_PLACED_UNDER' },
    duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WXDi-P13-050 セイヴ//ディソナ: E1のc1を正しい【エナチャージ1】に修正し【出】を追加
{
  const e = effs('WXDi-P13-050');
  const e1 = e.find(x => x.effectId === 'WXDi-P13-050-E1');
  e1.action.choices[1].action = { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 };
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WXDi-P13-050-E2', effectType: 'AUTO', timing: ['ON_PLAY'],
    condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: 'コード・ピルルク・極' } },
    action: { type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM', revealPickParams: { pickCount: 1, restDest: 'deck_bottom', then: 'hand' } },
    duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WXDi-P15-048 シモン・バール: 【出】《赤》×2欠落（解放者リル条件のバニッシュ）
effs('WXDi-P15-048').unshift({
  effectId: 'WXDi-P15-048-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: '自由の記憶　解放者リル' } },
  cost: { energy: [{ color: '赤', count: 2 }] },
  action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 12000 } }, upToCount: false } },
  duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
});

// ── WXDi-CP02-103 物語の起動: 【常】（全領域ブルアカ扱い）→ STUB
effs('WXDi-CP02-103').splice(1, 0, {
  effectId: 'WXDi-CP02-103-E2', effectType: 'CONTINUOUS',
  action: { type: 'STUB', id: 'TREAT_AS_CLASS_ALL_ZONES' },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet8 fixes applied');
