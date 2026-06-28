import fs from 'fs';
const path = 'public/data/effects_WX.json';
const d = JSON.parse(fs.readFileSync(path, 'utf8'));

const burst = d['WX17-028'].find(e => e.effectId === 'WX17-028-BURST');

d['WX17-028'] = [
  // 【自】このシグニがアタックしたとき、トラッシュからそれぞれレベルの異なる＜宇宙＞のシグニ4枚をデッキに戻してシャッフルしてもよい。
  // そうした場合、ターン終了時まで、このシグニは【ダブルクラッシュ】を得る。
  {
    effectId: 'WX17-028-E1',
    effectType: 'AUTO',
    timing: ['ON_ATTACK_SIGNI'],
    triggerScope: 'self',
    action: {
      type: 'SEQUENCE',
      steps: [
        {
          type: 'TRANSFER_TO_DECK',
          source: { type: 'TRASH_CARD', owner: 'self', count: 4, filter: { cardType: 'シグニ', story: '宇宙', eachDistinctLevel: true } },
          shuffle: true,
        },
        {
          type: 'CONDITIONAL',
          condition: { type: 'IS_MY_TURN' },
          then: {
            type: 'GRANT_KEYWORD',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            keyword: 'ダブルクラッシュ',
            duration: 'UNTIL_END_OF_TURN',
          },
        },
      ],
    },
    duration: 'UNTIL_END_OF_TURN',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
  // 【出】《赤×0》：デッキの上から4枚公開する。その後、パワーが「公開したシグニのレベルの合計×1000」以下の
  // 対戦相手のシグニ1体を対象とし、それをバニッシュする。公開したカードをトラッシュに置く。
  {
    effectId: 'WX17-028-E2',
    effectType: 'ACTIVATED',
    timing: ['ON_PLAY'],
    cost: { energy: [{ color: '赤', count: 0 }] },
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'REVEAL_DECK_TOP', owner: 'self', count: 4 },
        {
          type: 'BANISH',
          target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerLteRevealedSigniLevelSum: 1000 } },
        },
        { type: 'TRASH_REVEALED', owner: 'self' },
      ],
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
  burst,
];

fs.writeFileSync(path, JSON.stringify(d) + '\n');
console.log(JSON.stringify(d['WX17-028'], null, 1));
