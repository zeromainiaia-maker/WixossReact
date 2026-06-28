import fs from 'fs';
const path = 'public/data/effects_WX24_26.json';
const d = JSON.parse(fs.readFileSync(path, 'utf8'));

d['WX25-CP1-069'] = [
  {
    effectId: 'WX25-CP1-069-E1',
    effectType: 'AUTO',
    timing: ['ON_ATTACK_PHASE_START'],
    triggerScope: 'self',
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } },
        {
          type: 'CONDITIONAL',
          condition: { type: 'IS_MY_TURN' },
          then: {
            type: 'INSTALL_DELAYED_TRIGGER',
            duration: 'THIS_TURN',
            trigger: {
              timing: 'ON_OPP_LIFE_CRASHED',
              crasherFilter: { cardType: 'シグニ', color: '青', story: 'ブルアカ' },
            },
            effect: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
          },
        },
      ],
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
  {
    effectId: 'WX25-CP1-069-E2',
    effectType: 'CONTINUOUS',
    kizunaIcon: true,
    action: {
      type: 'POWER_MODIFY',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      delta: 4000,
    },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
];

fs.writeFileSync(path, JSON.stringify(d) + '\n');
console.log(JSON.stringify(d['WX25-CP1-069'], null, 1));
