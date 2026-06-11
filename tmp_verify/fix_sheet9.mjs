// Sheet9タイミング不一致の修正
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

// ── WX24-P3-093 デビル・ホール: E1に誤マージされた【自】（デッキ→トラッシュ時の回収）を分離
{
  const e = effs('WX24-P3-093');
  const e1 = e.find(x => x.effectId === 'WX24-P3-093-E1');
  const moved = e1.action.steps.slice(1); // OPTIONAL_TRASH_ENERGY_CLASS + CONDITIONAL回収
  e1.action = e1.action.steps[0];
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WX24-P3-093-E2', effectType: 'AUTO', timing: ['ON_TRASH'],
    action: { type: 'SEQUENCE', steps: moved },
    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WX25-P2-034 APEX2: 【自】欠落（スペル使用時、電機がいれば-8000）
effs('WX25-P2-034').unshift({
  effectId: 'WX25-P2-034-E1', effectType: 'AUTO', timing: ['ON_SPELL_USE'],
  condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: '電機' } },
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -8000 },
  duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX25-P3-028 ウリス: 【起】ディスペア欠落（リコレクト4＋悪魔3枚回収）
effs('WX25-P3-028').push({
  effectId: 'WX25-P3-028-E3', effectType: 'ACTIVATED', timing: ['MAIN'],
  usageLimit: 'once_per_game',
  cost: { energy: [{ color: '黒', count: 0 }] },
  action: { type: 'SEQUENCE', steps: [
    { type: 'RECOLLECT_GATE', minArts: 4 },
    { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 3, upToCount: true, filter: { cardType: 'シグニ', story: '悪魔' } } },
  ] },
  duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
});

// ── WX25-P3-085 ユーグレナ: E1が誤実装（ターン終了時ドロー→正:コスト捨て時に引用能力付与）
{
  const e1 = effs('WX25-P3-085').find(x => x.effectId === 'WX25-P3-085-E1');
  e1.timing = ['ON_DISCARDED_AS_COST'];
  e1.action = { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' };
  e1.duration = 'UNTIL_END_OF_TURN';
  e1.parseStatus = 'MANUAL';
}

// ── WX26-CP1-100/101: 【常】（全領域＜プリオケ＞扱い）→ STUB
for (const num of ['WX26-CP1-100', 'WX26-CP1-101']) {
  effs(num).splice(1, 0, {
    effectId: `${num}-E2`, effectType: 'CONTINUOUS',
    action: { type: 'STUB', id: 'TREAT_AS_CLASS_ALL_ZONES' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
  });
}

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet9 fixes applied');
