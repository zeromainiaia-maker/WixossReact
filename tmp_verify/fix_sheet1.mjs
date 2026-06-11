// Sheet1タイミング不一致11件の修正
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

// ── WX05-001 創世の巫女 マユ: 【出】欠落（ルリグ回収+アーツ戻し）→ STUB
effs('WX05-001').unshift({
  effectId: 'WX05-001-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX05-008 遊月・伍: 【出】欠落（相手エナ3枚までトラッシュ）
effs('WX05-008').unshift({
  effectId: 'WX05-008-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 3, upToCount: true } },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX05-010 エルドラ＝マークⅤ: 【出】欠落（ライフ入替）→ STUB
effs('WX05-010').unshift({
  effectId: 'WX05-010-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'LIFE_CLOTH_LOOK_TRASH_REFILL' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX05-013 アン・フィフス: 【出】欠落（トラッシュから美巧3枚まで回収）
effs('WX05-013').unshift({
  effectId: 'WX05-013-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 3, upToCount: true, filter: { cardType: 'シグニ', story: '美巧' } } },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX06-014 ウムル＝フェム: 【出】欠落（数字宣言→その枚数ミル）
effs('WX06-014').unshift({
  effectId: 'WX06-014-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'SEQUENCE', steps: [
    { type: 'STUB', id: 'DECLARE_NUMBER' },
    { type: 'MILL', owner: 'self', useDeclaredCount: true },
  ] },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX09-001 ウトゥルス: 【出】欠落（トラッシュから白か黒のシグニ2枚まで回収）
effs('WX09-001').unshift({
  effectId: 'WX09-001-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true, filter: { cardType: 'シグニ', color: ['白', '黒'] } } },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WX10-015 フラッシュ・バック: 【自】欠落（LB発動時に青払いで自己回収）→ STUB
effs('WX10-015').push({
  effectId: 'WX10-015-E2', effectType: 'AUTO', timing: ['ON_LIFE_BURST'],
  action: { type: 'STUB', id: 'ARTS_SELF_RECYCLE_ON_TRIGGER', costColors: ['青'] },
  duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
});

// ── WX10-027 リング・ドロー: E1から誤マージされた【自】を分離
{
  const e = effs('WX10-027');
  e[0].action = { type: 'DRAW', owner: 'self', count: 1 };
  e.push({
    effectId: 'WX10-027-E2', effectType: 'AUTO', timing: ['ON_PLAY'],
    action: { type: 'STUB', id: 'ARTS_SELF_RECYCLE_ON_TRIGGER', costColors: ['無'] },
    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WX10-029 極剣 ロクケイ: E2(常)に誤マージされた【出】《赤》サーチを分離
{
  const e = effs('WX10-029');
  const e2 = e.find(x => x.effectId === 'WX10-029-E2');
  e2.action = e2.action.steps[0]; // BOUNCEのみ残す
  e.push({
    effectId: 'WX10-029-E3', effectType: 'AUTO', timing: ['ON_PLAY'],
    cost: { energy: [{ color: '赤', count: 1 }] },
    action: { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', story: 'ウェポン' }, maxCount: 1, then: { type: 'ADD_TO_FIELD', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WX10-052 サーバント Ｙ: E1はCONTINUOUSではなく【出】(AUTO/ON_PLAY)
{
  const e1 = effs('WX10-052').find(x => x.effectId === 'WX10-052-E1');
  e1.effectType = 'AUTO';
  e1.timing = ['ON_PLAY'];
  e1.duration = 'INSTANT';
  e1.action.source.filter = { cardType: 'シグニ', hasGuard: true };
  e1.parseStatus = 'MANUAL';
}

// ── WX11-052 サーバント Ｚ: E1はCONTINUOUSではなく【出】《無》×3 サーチXY
{
  const e1 = effs('WX11-052').find(x => x.effectId === 'WX11-052-E1');
  e1.effectType = 'AUTO';
  e1.timing = ['ON_PLAY'];
  e1.duration = 'INSTANT';
  e1.cost = { energy: [{ color: '無', count: 3 }] };
  e1.action = { type: 'SEQUENCE', steps: [
    { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardName: 'サーバント　Ｘ' }, maxCount: 1, then: { type: 'ADD_TO_FIELD', owner: 'self' } },
    { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardName: 'サーバント　Ｙ' }, maxCount: 1, then: { type: 'ADD_TO_FIELD', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
  ] };
  e1.parseStatus = 'MANUAL';
}

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet1 fixes applied');
