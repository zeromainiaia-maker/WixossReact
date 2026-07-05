// WXDi-P15-003 ひらけ！ゲート！: GRANT_LRIG_ABILITY の引用能力(abilities空)を実体化。
// センタールリグに『【起】エクシード４：【シグニバリア】1つを得る』『【起】エクシード４：カードを4枚引く』
// を付与する。abilities を埋めると lrig_granted_auto_effects 経由で【起】能力として起動可能になる。
import fs from 'fs';

const file = 'public/data/effects_WXDi.json';
const data = JSON.parse(fs.readFileSync(file, 'utf8'));

const e1 = data['WXDi-P15-003'].find(e => e.effectId === 'WXDi-P15-003-E1');

e1.action.abilities = [
  {
    effectId: 'WXDi-P15-003-G1', effectType: 'ACTIVATED', timing: ['MAIN'],
    cost: { exceed: 4 },
    action: { type: 'STUB', id: 'GAIN_SIGNI_BARRIER' },
    duration: 'INSTANT', mandatory: false, parseStatus: 'AUTO',
  },
  {
    effectId: 'WXDi-P15-003-G2', effectType: 'ACTIVATED', timing: ['MAIN'],
    cost: { exceed: 4 },
    action: { type: 'DRAW', owner: 'self', count: 4 },
    duration: 'INSTANT', mandatory: false, parseStatus: 'AUTO',
  },
];

fs.writeFileSync(file, JSON.stringify(data), 'utf8');
console.log('done: WXDi-P15-003 ひらけ！ゲート！ 付与能力を実体化');
