// scripts/fixMissingEffects4.mjs
// 残り8件の「STUB代替?」を正確なアクション構造に修正
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

// ===== WX04-047 羅原Ｈｅ: DISCARD_OR_PENALTYをCONDITIONAL+DISCARDに修正 =====
// テキスト: 引く2枚。手札から<原子>1枚捨てないかぎり手札2枚捨てる
replaceEffect('WX04-047', 'WX04-047-E1', {
  effectId: 'WX04-047-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { down_self: true },
  action: {
    type: 'SEQUENCE',
    steps: [
      { type: 'DRAW', owner: 'self', count: 2 },
      {
        type: 'CONDITIONAL',
        condition: { type: 'PLAYER_CHOICE', prompt: '手札から<原子>のシグニを1枚捨てる' },
        then: { type: 'DISCARD', owner: 'self', count: 1, filter: { story: '原子' } },
        else: { type: 'DISCARD', owner: 'self', count: 2 },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX06-014 ウムル＝フェム: E1をDECLARE_AND_MILLからMILLを含む構造に修正 =====
// テキスト: 数字を宣言し、デッキ上からその枚数トラッシュに置く
replaceEffect('WX06-014', 'WX06-014-E1', {
  effectId: 'WX06-014-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'DECLARE_NUMBER',
        description: '数字1つを宣言する',
      },
      {
        type: 'MILL',
        owner: 'self',
        count: 0,
        useDeclaredCount: true,
        description: '宣言した数だけデッキ上からトラッシュに置く',
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX08-003 アン＝フォース: E1のCONDITIONALをSEARCHを含む構造に修正 =====
// テキスト: クロスシグニが場に出たとき《緑》払ってもよい→デッキから1枚探してエナゾーンに置き、シャッフル
replaceEffect('WX08-003', 'WX08-003-E1', {
  effectId: 'WX08-003-E1',
  effectType: 'AUTO',
  timing: ['ON_SIGNI_ENTERS'],
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'OPTIONAL_COST',
        costColors: ['緑'],
        description: '緑を支払ってもよい',
      },
      {
        type: 'CONDITIONAL',
        condition: { type: 'OPTIONAL_COST_PAID' },
        then: {
          type: 'SEARCH',
          from: { location: 'deck', owner: 'self' },
          maxCount: 1,
          then: { type: 'ENERGY_CHARGE', owner: 'self' },
          afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
        },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX11-017 ブルー・パニッシュ: CHOOSE_N構造にDRAWを含むように修正 =====
// テキスト: 4択から2つ（ピルルクで3つ）: ①スペル打ち消し②ダウン③手札捨てさせ④DRAW
replaceEffect('WX11-017', 'WX11-017-E1', {
  effectId: 'WX11-017-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK', 'SPELL_CUTIN'],
  cost: { energy: [{ color: '青', count: 2 }] },
  action: {
    type: 'CONDITIONAL',
    condition: { type: 'CENTER_LRIG_SERIES', series: 'ピルルク' },
    then: {
      type: 'CHOOSE_N_FROM_LIST',
      chooseCount: 3,
      choices: [
        { choiceId: 'c0', label: '①スペル打ち消し', action: { type: 'STUB', id: 'NEGATE_SPELL', description: 'コスト5以下のスペル1つを対象とし効果を打ち消す' } },
        { choiceId: 'c1', label: '②シグニ1体ダウン', action: { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } },
        { choiceId: 'c2', label: '③手札1枚見ないで捨てさせ', action: { type: 'DISCARD', owner: 'opponent', count: 1, random: true } },
        { choiceId: 'c3', label: '④カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
      ],
    },
    else: {
      type: 'CHOOSE_N_FROM_LIST',
      chooseCount: 2,
      choices: [
        { choiceId: 'c0', label: '①スペル打ち消し', action: { type: 'STUB', id: 'NEGATE_SPELL', description: 'コスト5以下のスペル1つを対象とし効果を打ち消す' } },
        { choiceId: 'c1', label: '②シグニ1体ダウン', action: { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } },
        { choiceId: 'c2', label: '③手札1枚見ないで捨てさせ', action: { type: 'DISCARD', owner: 'opponent', count: 1, random: true } },
        { choiceId: 'c3', label: '④カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
      ],
    },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX11-023 フォーカラー・マイアズマ: CHOOSE_N構造にMILLを含むように修正 =====
// テキスト: 4択から2つ（ウリスで3つ）: ①パワー-12000②場出し③手札に加える④各プレイヤーデッキ上7枚トラッシュ
const maiazmachocies = [
  {
    choiceId: 'c0',
    label: '①シグニのパワーを-12000（ターン終了時まで）',
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, delta: -12000, duration: 'UNTIL_END_OF_TURN' },
  },
  {
    choiceId: 'c1',
    label: '②トラッシュからレベル3以下シグニを場に出す',
    action: {
      type: 'ADD_TO_FIELD', owner: 'self',
      source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', maxLevel: 3 } },
    },
  },
  {
    choiceId: 'c2',
    label: '③トラッシュからシグニ1枚を手札に加える',
    action: { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } },
  },
  {
    choiceId: 'c3',
    label: '④各プレイヤーのデッキ上から7枚トラッシュに置く',
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'MILL', owner: 'self', count: 7 },
        { type: 'MILL', owner: 'opponent', count: 7 },
      ],
    },
  },
];
replaceEffect('WX11-023', 'WX11-023-E1', {
  effectId: 'WX11-023-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK'],
  cost: { energy: [{ color: '黒', count: 2 }, { color: '無', count: 2 }] },
  action: {
    type: 'CONDITIONAL',
    condition: { type: 'CENTER_LRIG_SERIES', series: 'ウリス' },
    then: { type: 'CHOOSE_N_FROM_LIST', chooseCount: 3, choices: maiazmachocies },
    else: { type: 'CHOOSE_N_FROM_LIST', chooseCount: 2, choices: maiazmachocies },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});

// ===== WX11-073 参ノ遊ハゴイタ: E1のCONDITIONALをSEARCHを含む構造に修正 =====
// テキスト: アタック時《緑》払ってもよい→デッキからシグニ1枚探してエナゾーンに置き、シャッフル
replaceEffect('WX11-073', 'WX11-073-E1', {
  effectId: 'WX11-073-E1',
  effectType: 'AUTO',
  timing: ['ON_ATTACK_SIGNI'],
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'OPTIONAL_COST',
        costColors: ['緑'],
        description: '緑を支払ってもよい',
      },
      {
        type: 'CONDITIONAL',
        condition: { type: 'OPTIONAL_COST_PAID' },
        then: {
          type: 'SEARCH',
          from: { location: 'deck', owner: 'self' },
          filter: { cardType: 'シグニ' },
          maxCount: 1,
          then: { type: 'ENERGY_CHARGE', owner: 'self' },
          afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
        },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX11-074 羅植スズビラ: REVEAL_AND_PICKのthenをCHOOSEに修正 =====
// テキスト: 色を2つ選ぶ。デッキ上2枚公開。選んだ色シグニ1枚を手札かエナに（×2）。残りをデッキ上に
replaceEffect('WX11-074', 'WX11-074-E1', {
  effectId: 'WX11-074-E1',
  effectType: 'AUTO',
  timing: ['ON_PLAY'],
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'CHOOSE_COLOR_FROM_LIST',
        chooseCount: 2,
        description: '白・赤・青・黒から2色を選ぶ',
      },
      {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount: 2,
        pickCount: 2,
        filter: { matchesChosenColors: true },
        then: {
          type: 'CHOOSE',
          choose_count: 1,
          from_count: 2,
          choices: [
            { choiceId: 'c0', label: '手札に加える', action: { type: 'ADD_TO_HAND', owner: 'self' } },
            { choiceId: 'c1', label: 'エナゾーンに置く', action: { type: 'ENERGY_CHARGE', owner: 'self' } },
          ],
        },
        remainder: { location: 'deck', position: 'top', reorder: true },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});

// ===== WX11-080 羅植シクラメン: REVEAL_AND_PICKのthenをENERGY_CHARGEに修正 =====
// テキスト: 色を1つ選ぶ。デッキ一番上公開。選んだ色のシグニならエナゾーンに置く
replaceEffect('WX11-080', 'WX11-080-E1', {
  effectId: 'WX11-080-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { down_self: true },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'STUB',
        id: 'CHOOSE_COLOR_FROM_LIST',
        chooseCount: 1,
        description: '白・赤・青・黒から1色を選ぶ',
      },
      {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount: 1,
        pickCount: 1,
        filter: { matchesChosenColor: true, cardType: 'シグニ' },
        then: { type: 'ENERGY_CHARGE', owner: 'self' },
        remainder: { location: 'deck', position: 'top' },
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
