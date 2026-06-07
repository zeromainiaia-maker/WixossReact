// scripts/fixMissingEffects2.mjs
// verifyEffectsの「アクション要確認」残り7件（真の不一致）を修正する
import { readFileSync, writeFileSync } from 'fs';

const EFFECTS_PATH = 'public/data/effects.json';
const data = JSON.parse(readFileSync(EFFECTS_PATH, 'utf8'));
let changed = 0;

function addEffect(cardId, effect) {
  if (!data[cardId]) data[cardId] = [];
  const existing = data[cardId].find(e => e.effectId === effect.effectId);
  if (existing) { console.log(`SKIP (既存): ${cardId} ${effect.effectId}`); return; }
  data[cardId].unshift(effect);
  console.log(`ADD: ${cardId} ${effect.effectId}`);
  changed++;
}

function replaceEffect(cardId, effectId, newEffect) {
  if (!data[cardId]) { console.log(`SKIP (カードなし): ${cardId}`); return; }
  const idx = data[cardId].findIndex(e => e.effectId === effectId);
  if (idx === -1) { console.log(`SKIP (効果なし): ${cardId} ${effectId}`); return; }
  data[cardId][idx] = newEffect;
  console.log(`REPLACE: ${cardId} ${effectId}`);
  changed++;
}

// ===== WX05-081 リバイブ・フレア: MILL+場出し の2択2選に修正 =====
replaceEffect('WX05-081', 'WX05-081-E1', {
  effectId: 'WX05-081-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { energy: [{ color: '黒', count: 1 }] },
  action: {
    type: 'CHOOSE_N_FROM_LIST',
    chooseCount: 2,
    choices: [
      {
        choiceId: 'c0',
        label: '①デッキ上3枚トラッシュ→黒L2以下場出し',
        action: {
          type: 'SEQUENCE',
          steps: [
            { type: 'MILL', owner: 'self', count: 3 },
            {
              type: 'ADD_TO_FIELD', owner: 'self',
              source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
                filter: { cardType: 'シグニ', maxLevel: 2, color: '黒' } },
            },
          ],
        },
      },
      {
        choiceId: 'c1',
        label: '②黒シグニをセンターL4以上黒条件で場出し',
        action: {
          type: 'CONDITIONAL',
          condition: { type: 'LRIG_COLOR_AND_LEVEL', color: '黒', minLevel: 4 },
          then: {
            type: 'ADD_TO_FIELD', owner: 'self',
            source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
              filter: { cardType: 'シグニ', color: '黒' } },
          },
        },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX06-001 タウィル＝フィーラ: E2/E3にBANISHを追加 =====
replaceEffect('WX06-001', 'WX06-001-E2', {
  effectId: 'WX06-001-E2',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { energy: [{ color: '白', count: 0 }] },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'RETURN_ANGEL_SIGNI_TO_DECK',
        description: 'トラッシュから天使シグニ7枚をデッキの一番下に置く',
      },
      {
        type: 'BANISH',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        conditional: true,
      },
      { type: 'SHUFFLE_DECK', owner: 'self' },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});
replaceEffect('WX06-001', 'WX06-001-E3', {
  effectId: 'WX06-001-E3',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { energy: [{ color: '白', count: 0 }] },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK',
        description: 'トラッシュから名前の異なる天使シグニ7枚をデッキの一番下に置く',
      },
      {
        type: 'BANISH',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        conditional: true,
      },
      { type: 'SHUFFLE_DECK', owner: 'self' },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX08-043 ヘオン: エナかハンドの選択（CHOOSE）に修正 =====
replaceEffect('WX08-043', 'WX08-043-E1', {
  effectId: 'WX08-043-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'REVEAL_AND_PICK',
    owner: 'self',
    revealCount: 2,
    pickCount: 1,
    filter: { cardType: 'シグニ', story: '美巧' },
    then: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        { choiceId: 'c0', label: 'エナゾーンに置く', action: { type: 'ENERGY_CHARGE', owner: 'self' } },
        { choiceId: 'c1', label: '手札に加える', action: { type: 'ADD_TO_HAND', owner: 'self' } },
      ],
    },
    remainder: { location: 'deck', position: 'bottom', reorder: true },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX10-001 炎・タマヨリヒメ・伍: E1（エクシード1白→BOUNCE）を追加 =====
addEffect('WX10-001', {
  effectId: 'WX10-001-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { exceed: 1 },
  action: {
    type: 'BOUNCE',
    target: { type: 'SIGNI', owner: 'opponent', count: 1 },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX10-017 アイヤイ★レイズ: SEARCHとMOVE_TO_ENERGYに修正 =====
replaceEffect('WX10-017', 'WX10-017-E1', {
  effectId: 'WX10-017-E1',
  effectType: 'AUTO',
  timing: ['ON_SIGNI_ENTERS'],
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

// ===== WX11-047 冒険: SEARCHしてエナに置くに修正 =====
replaceEffect('WX11-047', 'WX11-047-E1', {
  effectId: 'WX11-047-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: {
    energy: [
      { color: '緑', count: 1 },
      { color: '無', count: 3 },
    ],
  },
  action: {
    type: 'SEARCH',
    from: { location: 'deck', owner: 'self' },
    maxCount: 5,
    upToCount: true,
    then: { type: 'ENERGY_CHARGE', owner: 'self' },
    afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX11-051 レベル・ダウン: E1にBANISHを追加（SEQUENCE） =====
replaceEffect('WX11-051', 'WX11-051-E1', {
  effectId: 'WX11-051-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { energy: [{ color: '黒', count: 2 }] },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'BANISH',
        target: {
          type: 'SIGNI',
          owner: 'opponent',
          count: 1,
          filter: { cardType: 'シグニ', maxLevel: 3 },
          upToCount: false,
        },
      },
      {
        type: 'BLOCK_ACTION',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        actionId: 'SET_LEVEL_1',
        until: 'END_OF_TURN',
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

console.log(`\n合計 ${changed} 件の変更`);
writeFileSync(EFFECTS_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log('effects.json を更新しました');
