// Sheet2タイミング不一致の実欠落・パース誤り6件の修正
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

// ── WX14-032 サーバント∞: 【出】欠落（領域1つ指定）→ STUB
effs('WX14-032').splice(1, 0, {
  effectId: 'WX14-032-E1B', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'DECLARE_ZONE_FOR_CLASS_CHANGE' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX16-002 リル: 【出】／【起】の【起】側（オーネスト）が欠落
{
  const e = effs('WX16-002');
  e.push({
    effectId: 'WX16-002-E5', effectType: 'ACTIVATED', timing: ['MAIN', 'ATTACK'],
    action: { type: 'STUB', id: 'NEGATE_COIN_ABILITY' },
    duration: 'UNTIL_END_OF_TURN', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WX16-027 サナユキ: 【出】欠落（デッキ上2枚見て1枚手札・残り下）
effs('WX16-027').unshift({
  effectId: 'WX16-027-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM', revealPickParams: { pickCount: 1, restDest: 'deck_bottom', then: 'hand' } },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX17-002 アロス・ピルルク Ｎ: E1に誤マージされた【常】グロウ制限と【出】ドロー2を分離
{
  const e = effs('WX17-002');
  const e1 = e.find(x => x.effectId === 'WX17-002-E1');
  e1.action = { type: 'STUB', id: 'LRIG_GROW_RESTRICT' };
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WX17-002-E1B', effectType: 'AUTO', timing: ['ON_PLAY'],
    action: { type: 'DRAW', owner: 'self', count: 2 },
    duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WX17-028 ソラフレア: 【出】《赤×0》欠落（デッキ上4枚公開→レベル合計×1000以下バニッシュ）→ STUB
effs('WX17-028').splice(1, 0, {
  effectId: 'WX17-028-E2', effectType: 'AUTO', timing: ['ON_PLAY'],
  cost: { energy: [{ color: '赤', count: 0 }] },
  action: { type: 'STUB', id: 'REVEAL_TOP_BANISH_BY_LEVEL_SUM' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX20-037 トウタク: 【出】欠落（デッキ上3枚見て赤シグニ2枚まで場に出し残りトラッシュ）
effs('WX20-037').unshift({
  effectId: 'WX20-037-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'REVEAL_PICK_PLAY' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet2 fixes applied');
