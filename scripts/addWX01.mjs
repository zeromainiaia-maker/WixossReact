import { readFileSync, writeFileSync } from 'fs';

const json = JSON.parse(readFileSync('./public/data/wel/Sheet1.json', 'utf8'));
const csv = readFileSync('./public/data/CardData_Sheet1.csv', 'utf8');

const newEntries = {
  // アーツ: デッキ上1枚→エナ
  'WX01-026': [{ effectType: 'ARTS', action: { energy: { from: 'deck', count: 1 } } }],

  // 【常】エナ全カード→マルチエナ / 【出】白: self signi1アップ / 【起】白白: 置換効果(stub) / BURST: 白カードサーチ→手札
  'WX01-027': [
    { effectType: 'CONTINUOUS', action: { grant_keyword: { target: 'self_energy_all', word: 'multi_energy', duration: 'perm' } } },
    { effectType: 'AUTO', trigger: ['on_play'], cost: { energy: ['白'] }, action: { up: { owner: 'self', count: 1 } } },
    { effectType: 'ACTIVATED', cost: { energy: ['白', '白'] }, action: { stub: 'REPLACEMENT: このターン、opp signiバニッシュ時→エナ代わりにトラッシュへ' } },
    { effectType: 'LIFE_BURST', action: { search: { filter: { color: '白' }, dest: 'hand', count: 1, reveal: true } } },
  ],

  // SPELL: ルリグ能力付与(stub) / BURST: oppルリグ+全シグニダウン
  'WX01-028': [
    { effectType: 'SPELL', action: { stub: 'GRANT_ABILITY: センタールリグにアタック時シグニトラッシュ→アップ能力付与(ターン終了時)' } },
    { effectType: 'LIFE_BURST', action: { seq: [{ down: { owner: 'opp', count: 1, filter: { type: 'lrig' } } }, { down: { owner: 'opp', count: 'all' } }] } },
  ],

  // 【自】赤シグニアタック時+2000 / 【出】赤: banish opp power7000以下 / 【起】赤赤: self→ダブルクラッシュ / BURST: banish opp power10000以下
  'WX01-029': [
    { effectType: 'AUTO', trigger: ['on_attack'], triggerFilter: { owner: 'self', color: '赤' }, action: { power: { target: 'trigger_signi', delta: 2000, duration: 'turn' } } },
    { effectType: 'AUTO', trigger: ['on_play'], cost: { energy: ['赤'] }, action: { banish: { owner: 'opp', count: 1, filter: { power_lte: 7000 } } } },
    { effectType: 'ACTIVATED', cost: { energy: ['赤', '赤'] }, action: { grant_keyword: { target: 'self', word: 'double_crush', duration: 'turn' } } },
    { effectType: 'LIFE_BURST', action: { banish: { owner: 'opp', count: 1, filter: { power_lte: 10000 } } } },
  ],

  // SPELL: banish opp power12000以下+selfルリグ→ダブルクラッシュ / BURST: 自ライフ→トラッシュ+oppライフクラッシュ(stub)
  'WX01-030': [
    { effectType: 'SPELL', action: { seq: [{ banish: { owner: 'opp', count: 1, filter: { power_lte: 12000 } } }, { grant_keyword: { target: 'self_lrig', word: 'double_crush', duration: 'turn' } }] } },
    { effectType: 'LIFE_BURST', action: { stub: 'CRASH: 自ライフ1枚トラッシュ→oppライフ1枚クラッシュ' } },
  ],

  // 【常】青スペルコスト-1 / 【出】青: opp手札1捨て / 【起】青青: トラッシュからスペル→手札 / BURST: opp手札1捨て
  'WX01-031': [
    { effectType: 'CONTINUOUS', action: { cost_reduce: { flat: 1, filter: { type: 'spell', color: '青' } } } },
    { effectType: 'AUTO', trigger: ['on_play'], cost: { energy: ['青'] }, action: { discard: { owner: 'opp', count: 1 } } },
    { effectType: 'ACTIVATED', cost: { energy: ['青', '青'] }, action: { add_hand: { from: 'trash', count: 1, filter: { type: 'spell' } } } },
    { effectType: 'LIFE_BURST', action: { discard: { owner: 'opp', count: 1 } } },
  ],

  // SPELL: opp手札2捨て→cond(opp手札0枚→draw1) / BURST: opp手札1枚ランダム捨て
  'WX01-032': [
    { effectType: 'SPELL', action: { seq: [{ discard: { owner: 'opp', count: 2 } }, { cond: { if: { hand_lte: { owner: 'opp', val: 0 } }, then: { draw: 1 } } }] } },
    { effectType: 'LIFE_BURST', action: { discard: { owner: 'opp', count: 1, random: true } } },
  ],

  // 【自】緑スペル使用時→エナチャージ1 / 【出】緑: エナ→手札 / 【起】緑緑: 緑全カードトラッシュ→デッキ / BURST: エナチャージ2
  'WX01-033': [
    { effectType: 'AUTO', trigger: ['on_spell_cast'], triggerFilter: { color: '緑' }, action: { energy: { from: 'deck', count: 1 } } },
    { effectType: 'AUTO', trigger: ['on_play'], cost: { energy: ['緑'] }, action: { add_hand: { from: 'energy', count: 1 } } },
    { effectType: 'ACTIVATED', cost: { energy: ['緑', '緑'] }, action: { move: { from: 'trash', to: 'deck', count: 'all', filter: { color: '緑' } } } },
    { effectType: 'LIFE_BURST', action: { energy: { from: 'deck', count: 2 } } },
  ],

  // SPELL: デッキ上→ライフ+cond(エナ10枚以上→もう1枚) / BURST: デッキ上→ライフ
  'WX01-034': [
    { effectType: 'SPELL', action: { seq: [{ move: { from: 'deck', to: 'life', count: 1 } }, { cond: { if: { energy_gte: { owner: 'self', val: 10 } }, then: { move: { from: 'deck', to: 'life', count: 1 } } } }] } },
    { effectType: 'LIFE_BURST', action: { move: { from: 'deck', to: 'life', count: 1 } } },
  ],

  // 【起】白+ダウン: opp bounce1
  'WX01-035': [
    { effectType: 'ACTIVATED', cost: { energy: ['白'], down_self: true }, action: { bounce: { owner: 'opp', count: 1 } } },
  ],

  // 【出】デッキトップ確認→条件付きプレイ(stub) / BURST: lv4白signiサーチ→手札
  'WX01-036': [
    { effectType: 'AUTO', trigger: ['on_play'], action: { stub: 'DECK_TOP_PLAY: デッキ上確認、lv2以下signiかつ自場他シグニなし→場に出してもよい' } },
    { effectType: 'LIFE_BURST', action: { search: { filter: { level_lte: 4, level_gte: 4, color: '白', type: 'signi' }, dest: 'hand', count: 1, reveal: true } } },
  ],

  // 【起】ダウン: lv3以下signi(自身除く)サーチ→手札
  'WX01-037': [
    { effectType: 'ACTIVATED', cost: { down_self: true }, action: { search: { filter: { type: 'signi', level_lte: 3, name_not: '忘得ぬ幻想　ヴァルキリー' }, dest: 'hand', count: 1, reveal: true } } },
  ],

  // SPELL: 白signi1+赤signi1サーチ→手札
  'WX01-038': [
    { effectType: 'SPELL', action: { seq: [
      { search: { filter: { type: 'signi', color: '白' }, dest: 'hand', count: 1, reveal: true } },
      { search: { filter: { type: 'signi', color: '赤' }, dest: 'hand', count: 1, reveal: true } },
    ] } },
  ],

  // 【起】赤+ダウン: banish opp power10000以下
  'WX01-039': [
    { effectType: 'ACTIVATED', cost: { energy: ['赤'], down_self: true }, action: { banish: { owner: 'opp', count: 1, filter: { power_lte: 10000 } } } },
  ],

  // 【出】banish opp power3000以下 / BURST: banish opp power5000以下
  'WX01-040': [
    { effectType: 'AUTO', trigger: ['on_play'], action: { banish: { owner: 'opp', count: 1, filter: { power_lte: 3000 } } } },
    { effectType: 'LIFE_BURST', action: { banish: { owner: 'opp', count: 1, filter: { power_lte: 5000 } } } },
  ],

  // SPELL: draw2 / BURST: エナチャージ1
  'WX01-052': [
    { effectType: 'SPELL', action: { draw: 2 } },
    { effectType: 'LIFE_BURST', action: { energy: { from: 'deck', count: 1 } } },
  ],

  // 【常】oppターン中→power18000/12000/8000/5000
  'WX01-054': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'opp' }, action: { power: { target: 'self', set: 18000, duration: 'perm' } } }],
  'WX01-055': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'opp' }, action: { power: { target: 'self', set: 12000, duration: 'perm' } } }],
  'WX01-056': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'opp' }, action: { power: { target: 'self', set: 8000, duration: 'perm' } } }],

  // 【出】デッキトップ確認(stub) / BURST: draw1
  'WX01-057': [
    { effectType: 'AUTO', trigger: ['on_play'], action: { stub: 'DECK_TOP_PLAY: デッキ上確認、lv2以下signiかつ自場他シグニなし→場に出してもよい' } },
    { effectType: 'LIFE_BURST', action: { draw: 1 } },
  ],

  // 【起】ダウン+手札1捨: lv3以下白signiサーチ→手札
  'WX01-058': [
    { effectType: 'ACTIVATED', cost: { down_self: true, discard: 1 }, action: { search: { filter: { level_lte: 3, color: '白', type: 'signi' }, dest: 'hand', count: 1, reveal: true } } },
  ],

  // 【出】デッキトップ確認(stub) / BURST: draw1
  'WX01-059': [
    { effectType: 'AUTO', trigger: ['on_play'], action: { stub: 'DECK_TOP_PLAY: デッキ上確認、lv1signiかつ自場他シグニなし→場に出してもよい' } },
    { effectType: 'LIFE_BURST', action: { draw: 1 } },
  ],

  // 【常】oppターン中→power5000
  'WX01-060': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'opp' }, action: { power: { target: 'self', set: 5000, duration: 'perm' } } }],

  // 【起】ダウン+手札1捨: lv2以下白signiサーチ→手札
  'WX01-061': [
    { effectType: 'ACTIVATED', cost: { down_self: true, discard: 1 }, action: { search: { filter: { level_lte: 2, color: '白', type: 'signi' }, dest: 'hand', count: 1, reveal: true } } },
  ],

  // SPELL: デッキ上5枚確認→任意トラッシュ+残りデッキトップ(stub)
  'WX01-062': [
    { effectType: 'SPELL', action: { stub: 'DECK_FILTER: デッキ上5枚確認、任意枚数トラッシュ、残りを好きな順でデッキトップへ' } },
  ],

  // SPELL: self全signiアップ / BURST: signiサーチ→手札
  'WX01-063': [
    { effectType: 'SPELL', action: { up: { owner: 'self', count: 'all' } } },
    { effectType: 'LIFE_BURST', action: { search: { filter: { type: 'signi' }, dest: 'hand', count: 1, reveal: true } } },
  ],

  // 【常】自ターン中→power18000/12000
  'WX01-065': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'self' }, action: { power: { target: 'self', set: 18000, duration: 'perm' } } }],
  'WX01-066': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'self' }, action: { power: { target: 'self', set: 12000, duration: 'perm' } } }],

  // 【出】: 自手札1捨て / BURST: draw1
  'WX01-067': [
    { effectType: 'AUTO', trigger: ['on_play'], action: { discard: { owner: 'self', count: 1 } } },
    { effectType: 'LIFE_BURST', action: { draw: 1 } },
  ],

  // 【常】自ターン中→power8000
  'WX01-068': [{ effectType: 'CONTINUOUS', activeCondition: { during_turn: 'self' }, action: { power: { target: 'self', set: 8000, duration: 'perm' } } }],
};

const dupes = Object.keys(newEntries).filter(k => json[k]);
if (dupes.length) console.log('WARNING duplicates:', dupes);

Object.assign(json, newEntries);

const csvOrder = csv.split('\n').slice(1).map(l => l.split(',')[0]).filter(Boolean);
const sorted = {};
for (const key of csvOrder) { if (json[key] !== undefined) sorted[key] = json[key]; }
for (const key of Object.keys(json)) { if (sorted[key] === undefined) sorted[key] = json[key]; }

writeFileSync('./public/data/wel/Sheet1.json', JSON.stringify(sorted, null, 2), 'utf8');
console.log('完了: ' + Object.keys(newEntries).length + '枚追加');
console.log('合計キー数:', Object.keys(sorted).filter(k => k !== '_parseError').length);
