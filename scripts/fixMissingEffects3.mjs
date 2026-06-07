// scripts/fixMissingEffects3.mjs
// STUB代替カードのeffects.jsonを正確なアクション構造に修正
import { readFileSync, writeFileSync } from 'fs';

const EFFECTS_PATH = 'public/data/effects.json';
const data = JSON.parse(readFileSync(EFFECTS_PATH, 'utf8'));
let changed = 0;

function replaceEffect(cardId, effectId, newEffect) {
  if (!data[cardId]) { console.log(`SKIP (カードなし): ${cardId}`); return; }
  const idx = data[cardId].findIndex(e => e.effectId === effectId);
  if (idx === -1) { console.log(`SKIP (効果なし): ${cardId} ${effectId}`); return; }
  data[cardId][idx] = newEffect;
  console.log(`REPLACE: ${cardId} ${effectId}`);
  changed++;
}

// ===== WX05-042 増武: E1をBANISH+TRANSFER_TO_HAND+DRAWを含む構造に修正 =====
// テキスト: このターン、植物シグニが3回目ダウン状態になったとき、シグニをバニッシュし、エナから手札に加え、引く
replaceEffect('WX05-042', 'WX05-042-E1', {
  effectId: 'WX05-042-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { energy: [{ color: '緑', count: 2 }] },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'GRANT_TURN_TRIGGER_3RD_DOWN',
        description: 'このターン、植物シグニ1体がダウン状態になったとき（3回目）発動するトリガーを付与',
      },
      {
        type: 'CONDITIONAL',
        condition: { type: 'TURN_TRIGGER_FIRED' },
        then: {
          type: 'SEQUENCE',
          steps: [
            {
              type: 'BANISH',
              target: { type: 'SIGNI', owner: 'opponent', count: 1 },
            },
            {
              type: 'TRANSFER_TO_HAND',
              source: { type: 'ENERGY_CARD', owner: 'self', count: 1 },
            },
            { type: 'DRAW', owner: 'self', count: 1 },
          ],
        },
      },
    ],
  },
  duration: 'UNTIL_END_OF_TURN',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX09-Re03 ゼノ・マルチプル: CHOOSE_N_FROM_LIST(4択2選)に修正 =====
// テキスト: 4択から2つ: ①ルリグアタック不可 ②全シグニ凍結 ③BOUNCE ④DRAW×2
replaceEffect('WX09-Re03', 'WX09-Re03-E1', {
  effectId: 'WX09-Re03-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK'],
  cost: {
    energy: [
      { color: '白', count: 2 },
      { color: '青', count: 2 },
    ],
  },
  action: {
    type: 'CHOOSE_N_FROM_LIST',
    chooseCount: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①対戦相手のルリグアタック不可（このターン）',
        action: {
          type: 'STUB',
          id: 'PREVENT_TARGET_LRIG_ATTACK_THIS_TURN',
          description: 'このターン、対象ルリグ1体でアタックできない',
        },
      },
      {
        choiceId: 'c1',
        label: '②対戦相手のすべてのシグニを凍結',
        action: {
          type: 'FREEZE',
          target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' },
        },
      },
      {
        choiceId: 'c2',
        label: '③対戦相手のシグニ1体を手札に戻す',
        action: {
          type: 'BOUNCE',
          target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        },
      },
      {
        choiceId: 'c3',
        label: '④カードを2枚引く',
        action: { type: 'DRAW', owner: 'self', count: 2 },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX10-003 アイヤイ★ＪＯＫＥＲ: E2をSEARCH+ENERGY_CHARGEに修正 =====
// テキスト: 【出】デッキから遊具シグニ1枚を探してエナゾーンに置き、シャッフル
replaceEffect('WX10-003', 'WX10-003-E2', {
  effectId: 'WX10-003-E2',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'SEARCH',
    from: { location: 'deck', owner: 'self' },
    filter: { cardType: 'シグニ', story: '遊具' },
    maxCount: 1,
    then: { type: 'ENERGY_CHARGE', owner: 'self' },
    afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

console.log(`\n合計 ${changed} 件の変更`);
writeFileSync(EFFECTS_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log('effects.json を更新しました');
