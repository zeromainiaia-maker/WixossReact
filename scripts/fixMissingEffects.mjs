// scripts/fixMissingEffects.mjs
// verifyEffectsで検出された真の不一致を修正する
import { readFileSync, writeFileSync } from 'fs';

const EFFECTS_PATH = 'public/data/effects.json';
const data = JSON.parse(readFileSync(EFFECTS_PATH, 'utf8'));

let changed = 0;

function addEffect(cardId, effect) {
  if (!data[cardId]) data[cardId] = [];
  const existing = data[cardId].find(e => e.effectId === effect.effectId);
  if (existing) {
    console.log(`SKIP (既存): ${cardId} ${effect.effectId}`);
    return;
  }
  data[cardId].unshift(effect); // 先頭に挿入（ON_PLAYが最初に評価されるように）
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

// ===== WX04-054 サーバントX: E2をCONTINUOUS→ACTIVATED/MAIN に修正 =====
replaceEffect('WX04-054', 'WX04-054-E2', {
  effectId: 'WX04-054-E2',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: {
    energy: [
      { color: '無', count: 1 },
      { color: '無', count: 1 },
      { color: '無', count: 1 },
    ],
  },
  action: {
    type: 'SEARCH',
    from: { location: 'deck', owner: 'self' },
    filter: { cardType: 'シグニ', cardName: 'サーバント' },
    maxCount: 1,
    then: {
      type: 'SEQUENCE',
      steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }],
    },
    afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX05-001 創世の巫女マユ: 【出】追加 =====
addEffect('WX05-001', {
  effectId: 'WX05-001-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'STUB',
    id: 'MOVE_LRIG_TRASH_UNDER',
    description: 'ルリグトラッシュからすべてのルリグをこのカードの下に置き、すべての白と黒のアーツをルリグデッキに戻す',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-003 コードピルルクACRO: 【常】追加 =====
addEffect('WX05-003', {
  effectId: 'WX05-003-E1',
  effectType: 'CONTINUOUS',
  action: {
    type: 'STUB',
    id: 'INHERIT_LRIG_TRASH_ABILITIES',
    description: 'このルリグはルリグトラッシュにあるルリグの起動能力を持つ',
  },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-004 五型緑姫: 【常】追加 =====
addEffect('WX05-004', {
  effectId: 'WX05-004-E1',
  effectType: 'CONTINUOUS',
  action: {
    type: 'STUB',
    id: 'INHERIT_LRIG_TRASH_ABILITIES',
    description: 'このルリグはルリグトラッシュにあるルリグの起動能力を持つ',
  },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-005 黒点の巫女タマヨリヒメ: 【常】追加 =====
addEffect('WX05-005', {
  effectId: 'WX05-005-E1',
  effectType: 'CONTINUOUS',
  action: {
    type: 'STUB',
    id: 'FORCE_COLOR_BLACK',
    description: 'エナゾーン以外の領域にあるシグニは黒になる',
  },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-008 遊月・伍: 【出】追加 =====
addEffect('WX05-008', {
  effectId: 'WX05-008-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'TRASH',
    target: {
      type: 'ENERGY_CARD',
      owner: 'opponent',
      count: 3,
      upToCount: true,
    },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-010 エルドラ＝マークⅤ: 【出】追加 =====
addEffect('WX05-010', {
  effectId: 'WX05-010-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'STUB',
    id: 'REORDER_LIFE_CLOTHS',
    description: 'ライフクロスを好きな枚数トラッシュに置き同枚数デッキ上からライフに加え、好きな順番で並び替える',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-011 ミルルン・ティコ: 【常】追加 =====
addEffect('WX05-011', {
  effectId: 'WX05-011-E1',
  effectType: 'CONTINUOUS',
  action: {
    type: 'BLOCK_ACTION',
    target: { type: 'PLAYER', owner: 'opponent', count: 1 },
    actionId: 'USE_SPELL',
  },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX05-013 侵犯されし神判アン・フィフス: 【出】追加 =====
addEffect('WX05-013', {
  effectId: 'WX05-013-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'ADD_TO_HAND',
    source: {
      type: 'TRASH_CARD',
      owner: 'self',
      count: 3,
      upToCount: true,
      filter: { cardType: 'シグニ', story: '美巧' },
    },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX06-014 創造の鍵主ウムル＝フェム: 【出】追加 =====
addEffect('WX06-014', {
  effectId: 'WX06-014-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'STUB',
    id: 'DECLARE_AND_MILL',
    description: '数字を宣言してデッキ上からその枚数をトラッシュに置く',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX09-001 開かれし極門ウトゥルス: 【出】追加 =====
addEffect('WX09-001', {
  effectId: 'WX09-001-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'ADD_TO_HAND',
    source: {
      type: 'TRASH_CARD',
      owner: 'self',
      count: 2,
      upToCount: true,
      filter: { cardType: 'シグニ', color: ['白', '黒'] },
    },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX09-Re01 星占の巫女リメンバ・デッドナイト: 【常】追加 =====
addEffect('WX09-Re01', {
  effectId: 'WX09-Re01-E1',
  effectType: 'CONTINUOUS',
  action: {
    type: 'STUB',
    id: 'FROZEN_LOSES_ABILITIES',
    description: '対戦相手の凍結状態のシグニは能力を失う',
  },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX10-015 フラッシュ・バック: 【自】追加 =====
addEffect('WX10-015', {
  effectId: 'WX10-015-E2',
  effectType: 'AUTO',
  timing: ['ON_LIFE_BURST'],
  action: {
    type: 'STUB',
    id: 'OPTIONAL_RETURN_TO_LRIG_DECK',
    costColors: ['青'],
    description: 'ライフバースト発動時に青を支払うとルリグトラッシュからルリグデッキに戻す',
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX10-027 リング・ドロー: 【自】追加 =====
addEffect('WX10-027', {
  effectId: 'WX10-027-E2',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  trigger: { type: 'RESONA_ENTERS_FIELD', owner: 'self' },
  action: {
    type: 'STUB',
    id: 'OPTIONAL_RETURN_TO_LRIG_DECK',
    costColors: ['無'],
    description: 'レゾナが場に出たとき無を支払うとルリグトラッシュからルリグデッキに戻す',
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX10-029 極剣ロクケイ: 【出】追加 =====
addEffect('WX10-029', {
  effectId: 'WX10-029-E3',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  cost: {
    energy: [{ color: '赤', count: 1 }],
  },
  action: {
    type: 'SEARCH',
    from: { location: 'deck', owner: 'self' },
    filter: { cardType: 'シグニ', story: 'ウェポン' },
    maxCount: 1,
    then: { type: 'ADD_TO_FIELD', owner: 'self' },
    afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX10-052 サーバントY: E1をCONTINUOUS→AUTO/ON_PLAY に修正 =====
replaceEffect('WX10-052', 'WX10-052-E1', {
  effectId: 'WX10-052-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'ADD_TO_HAND',
    source: {
      type: 'TRASH_CARD',
      owner: 'self',
      count: 1,
      upToCount: false,
      filter: { cardType: 'シグニ', hasKeyword: 'ガードアイコン' },
    },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX11-052 サーバントZ: E1をCONTINUOUS→AUTO/ON_PLAY に修正 =====
replaceEffect('WX11-052', 'WX11-052-E1', {
  effectId: 'WX11-052-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  cost: {
    energy: [
      { color: '無', count: 1 },
      { color: '無', count: 1 },
      { color: '無', count: 1 },
    ],
  },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'SEARCH',
        from: { location: 'deck', owner: 'self' },
        filter: { cardName: 'サーバント　Ｘ' },
        maxCount: 1,
        then: { type: 'ADD_TO_FIELD', owner: 'self' },
        afterSearch: null,
      },
      {
        type: 'SEARCH',
        from: { location: 'deck', owner: 'self' },
        filter: { cardName: 'サーバント　Ｙ' },
        maxCount: 1,
        then: { type: 'ADD_TO_FIELD', owner: 'self' },
        afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== サーバントカードのマルチエナ: BattleScreen.tsxでフォールバック処理済みのため追加不要 =====
// WD01-016, WD01-017, WX01-051, WX01-100, WX10-097/098/099/100, WX11-052

console.log(`\n合計 ${changed} 件の変更`);

writeFileSync(EFFECTS_PATH, JSON.stringify(data, null, 2), 'utf8');
console.log('effects.json を更新しました');
