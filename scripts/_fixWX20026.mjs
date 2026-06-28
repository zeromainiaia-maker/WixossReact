import { readFileSync, writeFileSync } from 'fs';
const fn = 'public/data/effects_WX.json';
const data = JSON.parse(readFileSync(fn, 'utf-8'));
const arr = data['WX20-026'];
const i = arr.findIndex((e) => e.effectId === 'WX20-026-E3');
arr[i] = {
  effectId: 'WX20-026-E3',
  effectType: 'AUTO',
  timing: ['ON_DRAW'],
  triggerCondition: { drawBySourceStory: '凶蟲' },
  action: {
    type: 'POWER_MODIFY',
    target: { type: 'SIGNI', owner: 'opponent', count: 1 },
    delta: -4000,
  },
  duration: 'UNTIL_END_OF_TURN',
  mandatory: true,
  parseStatus: 'MANUAL',
};
const out = JSON.stringify(data);
JSON.parse(out);
writeFileSync(fn, out);
console.log('fixed E3:', JSON.stringify(arr[i]));
