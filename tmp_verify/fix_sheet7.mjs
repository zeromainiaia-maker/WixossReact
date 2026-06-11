// Sheet7タイミング不一致残り7件の修正 + 既追加分のmandatory慣例統一
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

// ── WXDi-D09-H13 ノブナガ: 【出】《赤》欠落（パワー8000以下バニッシュ）
effs('WXDi-D09-H13').unshift({
  effectId: 'WXDi-D09-H13-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  cost: { energy: [{ color: '赤', count: 1 }] },
  action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 8000 } }, upToCount: false } },
  duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
});

// ── WXDi-P03-016 VJ.WOLF: 【出】欠落（引用能力付与）+【チーム起】《ダウン》エナチャージ2も欠落
{
  const e = effs('WXDi-P03-016');
  e.unshift(
    {
      effectId: 'WXDi-P03-016-E0', effectType: 'ACTIVATED', timing: ['MAIN'],
      cost: { down_self: true },
      action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 },
      duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P03-016-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' },
      duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL',
    },
  );
}

// ── WXDi-P03-044 サーベルタイガー: 【常】欠落（他のシグニ+3000、excludeSelf新設）
effs('WXDi-P03-044').unshift({
  effectId: 'WXDi-P03-044-E1', effectType: 'CONTINUOUS',
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } }, delta: 3000, excludeSelf: true },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXDi-P05-060 世紀末の爆走: E1の誤マージ除去 + 【常】×2はカード下からの常時付与 → STUB
{
  const e = effs('WXDi-P05-060');
  const e1 = e.find(x => x.effectId === 'WXDi-P05-060-E1');
  e1.action = e1.action.steps[0]; // PLACE_SIGNI_UNDER_SIGNIのみ（エナチャージ/パワーは下にある間の常時効果）
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WXDi-P05-060-E2', effectType: 'CONTINUOUS',
    action: { type: 'STUB', id: 'UNDER_CARD_HOST_BUFF' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WXDi-P05-086 ムーン・バイツ: 【常】はレベル1扱いのルール変更 → CONTINUOUS追加
effs('WXDi-P05-086').splice(1, 0, {
  effectId: 'WXDi-P05-086-E2', effectType: 'CONTINUOUS',
  action: { type: 'STUB', id: 'TREAT_AS_LEVEL1_IN_DECK_TRASH' },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXDi-P06-010 サンガ: 【出】欠落（エナチャージ2）
{
  const e = effs('WXDi-P06-010');
  e.splice(1, 0, {
    effectId: 'WXDi-P06-010-E2', effectType: 'AUTO', timing: ['ON_PLAY'],
    action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 },
    duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WXDi-P07-067 ギルガメジ: 【出】《赤》×3欠落（ダブルクラッシュ付与）
effs('WXDi-P07-067').unshift({
  effectId: 'WXDi-P07-067-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  cost: { energy: [{ color: '赤', count: 3 }] },
  action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN' },
  duration: 'UNTIL_END_OF_TURN', mandatory: false, parseStatus: 'MANUAL',
});

// ── mandatory慣例統一: コスト付き【出】は mandatory:false（支払いは任意）
for (const [num, eid] of [['WDK01-001', 'WDK01-001-E1'], ['WXDi-D06-017', 'WXDi-D06-017-E1'], ['WX11-052', 'WX11-052-E1'], ['WX17-028', 'WX17-028-E2']]) {
  const e = effs(num).find(x => x.effectId === eid);
  if (e) e.mandatory = false;
}

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet7 fixes applied');
