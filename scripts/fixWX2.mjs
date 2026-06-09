import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const filePath = path.join(__dirname, '../public/data/effects_WX.json');
const effects = JSON.parse(fs.readFileSync(filePath, 'utf8'));

let fixCount = 0;
function fix(cardId, desc, fn) {
  fn(effects[cardId]);
  console.log(`[FIX] ${cardId}: ${desc}`);
  fixCount++;
}

// ===== 1. WX17-Re14: CHOOSE 3択 =====
fix('WX17-Re14', 'E1 を CHOOSE(3択) に変換（電機シグニを捨て3択）', (e) => {
  e[0] = {
    effectId: 'WX17-Re14-E1',
    effectType: 'AUTO',
    timing: ['ON_PLAY'],
    cost: { discard: { count: 1, filter: { story: '電機' } } },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 3,
      choices: [
        {
          choiceId: 'c0',
          label: '①対戦相手のシグニ2体のパワーを-2000（ターン終了時まで）',
          action: {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'opponent', count: 2 },
            delta: -2000,
            duration: 'UNTIL_END_OF_TURN',
          },
        },
        {
          choiceId: 'c1',
          label: '②デッキ上2枚トラッシュ→センタールリグと共通色のシグニを手札に',
          action: {
            type: 'SEQUENCE',
            steps: [
              { type: 'MILL', owner: 'self', count: 2 },
              {
                type: 'TRANSFER_TO_HAND',
                source: {
                  type: 'TRASH_CARD',
                  owner: 'self',
                  count: 1,
                  upToCount: false,
                  filter: { cardType: 'シグニ', sameColorAsLrig: true },
                },
              },
            ],
          },
        },
        {
          choiceId: 'c2',
          label: '③デッキ上3枚トラッシュ→トラッシュから黒スペルを手札に',
          action: {
            type: 'SEQUENCE',
            steps: [
              { type: 'MILL', owner: 'self', count: 3 },
              {
                type: 'TRANSFER_TO_HAND',
                source: {
                  type: 'TRASH_CARD',
                  owner: 'self',
                  count: 1,
                  upToCount: false,
                  filter: { cardType: 'スペル', color: '黒' },
                },
              },
            ],
          },
        },
      ],
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  };
});

// ===== 2. WX18-004: BETシステム → STUB =====
fix('WX18-004', 'E1 を STUB(BET_DOWN_OPP_SIGNI_AND_DRAW) に変換', (e) => {
  e[0] = {
    effectId: 'WX18-004-E1',
    effectType: 'ACTIVATED',
    timing: ['ATTACK'],
    cost: { energy: [{ color: '青', count: 2 }] },
    action: { type: 'STUB', stubId: 'BET_DOWN_OPP_SIGNI_AND_DRAW' },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  };
});

// ===== 3. WX21-006 E1: STUB =====
fix('WX21-006', 'E1 を STUB に変換（全異色天使3体で対戦相手シグニバニッシュ+エナ+ドロー）', (e) => {
  e[0] = {
    effectId: 'WX21-006-E1',
    effectType: 'AUTO',
    timing: ['ATTACK'],
    action: {
      type: 'STUB',
      stubId: 'ON_ATTACK_PHASE_START_CONDITIONAL_ALL_DIFF_COLOR_ANGEL3_BANISH_OPP_SIGNI',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 4. WX21-046 E1: STUB =====
fix('WX21-046', 'E1 を STUB に変換（対戦相手シグニ対象→スペル3枚デッキ戻し→ドロー+パワー-8000）', (e) => {
  e[0] = {
    effectId: 'WX21-046-E1',
    effectType: 'AUTO',
    timing: ['ON_ATTACK_SIGNI'],
    action: {
      type: 'STUB',
      stubId: 'ON_ATTACK_SELECT_OPP_SIGNI_TRASH3_DISTINCT_COST_SPELLS_TO_DECK_DRAW_POWER_MINUS',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 5. WX17-028: E1 STUB化 + E2追加 =====
fix('WX17-028', 'E1 STUB化（IS_MY_TURN→正しい条件）、E2（出）追加', (e) => {
  e[0] = {
    effectId: 'WX17-028-E1',
    effectType: 'AUTO',
    timing: ['ON_ATTACK_SIGNI'],
    action: {
      type: 'STUB',
      stubId: 'OPTIONAL_TRASH_4_DISTINCT_LEVEL_UNIVERSE_SIGNI_TO_DECK_GRANT_DUALCRASH',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
  // BURSTエントリの前に E2 を挿入
  const burstIdx = e.findIndex(ef => ef.effectType === 'LIFE_BURST');
  const newE2 = {
    effectId: 'WX17-028-E2',
    effectType: 'AUTO',
    timing: ['ON_PLAY'],
    action: {
      type: 'STUB',
      stubId: 'REVEAL_4_FROM_DECK_BANISH_OPP_SIGNI_BY_LEVEL_SUM_THEN_TRASH',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
  if (burstIdx >= 0) {
    e.splice(burstIdx, 0, newE2);
  } else {
    e.push(newE2);
  }
});

// ===== 6. WX03-046: STUB（+5000後パワー15000以上でランサー） =====
fix('WX03-046', 'E1 を STUB に変換（+5000後パワー15000以上でランサー付与）', (e) => {
  e[0] = {
    effectId: 'WX03-046-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: { energy: [{ color: '緑', count: 1 }] },
    action: { type: 'STUB', stubId: 'POWER_PLUS_5000_THEN_IF_15000_OR_MORE_GRANT_LANCER' },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  };
});

// ===== 7. WX12-CB02 E1: STUB（レベル別多段分岐） =====
fix('WX12-CB02', 'E1 を STUB に変換（デッキ上公開→レベル別5分岐）', (e) => {
  e[0] = {
    effectId: 'WX12-CB02-E1',
    effectType: 'AUTO',
    timing: ['ATTACK'],
    action: {
      type: 'STUB',
      stubId: 'REVEAL_TOP_SIGNI_MULTI_LEVEL_BRANCH_POWER_ENERGY_LANCER_DRAW_BANISH',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 8. WX14-006A E2: STUB（遊具シグニ全体に能力付与） =====
fix('WX14-006A', 'E2 を STUB に変換（遊具シグニ全体にバニッシュ時アップ付与）', (e) => {
  const e2 = e.find(ef => ef.effectId === 'WX14-006A-E2');
  if (e2) {
    e2.action = { type: 'STUB', stubId: 'GRANT_ON_OPP_SIGNI_BANISH_SELF_UP_TO_ALL_YOINGU' };
    e2.parseStatus = 'MANUAL';
  }
});

// ===== 9. WX15-047 E1: CHOOSE（ドローかトラップ設置） =====
fix('WX15-047', 'E1 を CHOOSE に変換（ドロー or トラップ設置）', (e) => {
  e[0] = {
    effectId: 'WX15-047-E1',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    cost: { down_self: true },
    action: {
      type: 'CHOOSE',
      choose_count: 1,
      from_count: 2,
      choices: [
        {
          choiceId: 'c0',
          label: 'カードを1枚引く',
          action: { type: 'DRAW', owner: 'self', count: 1 },
        },
        {
          choiceId: 'c1',
          label: '手札1枚をトラップとして設置する',
          action: { type: 'STUB', stubId: 'SET_HAND_CARD_AS_TRAP' },
        },
      ],
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  };
});

// ===== 10. WX16-062: LIFE_BURST誤り → TRAP起動効果 =====
fix('WX16-062', 'LIFE_BURST誤りをTRAP起動効果に変換（相手L3シグニバウンス）', () => {
  effects['WX16-062'] = [
    {
      effectId: 'WX16-062-E1',
      effectType: 'ACTIVATED',
      timing: ['TRAP'],
      action: {
        type: 'BOUNCE',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { level: 3 } },
        destination: 'hand',
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ];
});

// ===== 11. WX16-064: LIFE_BURST誤り → TRAP起動効果 =====
fix('WX16-064', 'LIFE_BURST誤りをTRAP起動効果に変換（相手パワー2000以下全バニッシュ）', () => {
  effects['WX16-064'] = [
    {
      effectId: 'WX16-064-E1',
      effectType: 'ACTIVATED',
      timing: ['TRAP'],
      action: { type: 'STUB', stubId: 'TRAP_BANISH_ALL_OPP_SIGNI_POWER_2000_OR_LESS' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ];
});

// ===== 12. WX13-006A: E1 owner+charm修正、E2 タイミング+filter修正、E3 STUB化 =====
fix('WX13-006A', 'E1 owner→opponent+charm filter、E2 タイミング→ON_LEAVE_FIELD+凶蟲 filter、E3 STUB', (e) => {
  const e1 = e.find(ef => ef.effectId === 'WX13-006A-E1');
  if (e1) {
    e1.action.target.owner = 'opponent';
    delete e1.action.target.count;
    e1.action.target.filter = { charm: true };
    e1.parseStatus = 'MANUAL';
  }
  const e2 = e.find(ef => ef.effectId === 'WX13-006A-E2');
  if (e2) {
    e2.timing = ['ON_LEAVE_FIELD'];
    e2.action.source.filter = { cardType: 'シグニ', story: '凶蟲' };
    e2.parseStatus = 'MANUAL';
  }
  const e3 = e.find(ef => ef.effectId === 'WX13-006A-E3');
  if (e3) {
    e3.action = { type: 'STUB', stubId: 'ON_PLAY_POWER_MINUS_10000_ALL_CHARM_OPP_SIGNI_UNTIL_EOT' };
    e3.parseStatus = 'MANUAL';
  }
});

// ===== 13. WX15-094/095/096: activeCondition.count:3 追加 =====
for (const id of ['WX15-094', 'WX15-095', 'WX15-096']) {
  fix(id, 'activeCondition に count:3 追加（英知シグニ3体条件）', (e) => {
    const e1 = e.find(ef => ef.effectType === 'CONTINUOUS');
    if (e1 && e1.activeCondition) {
      e1.activeCondition.count = 3;
      e1.parseStatus = 'MANUAL';
    }
  });
}

// ===== 14. WX05-040 E2: STUB（自シグニが効果でダウンされたとき） =====
fix('WX05-040', 'E2 タイミング・アクション修正 → STUB(ON_OWN_SIGNI_EFFECT_DOWN_ENERGY_CHARGE)', (e) => {
  const e2 = e.find(ef => ef.effectId === 'WX05-040-E2');
  if (e2) {
    e2.timing = ['ON_SIGNI_DOWN'];
    e2.action = { type: 'STUB', stubId: 'ON_OWN_SIGNI_EFFECT_DOWN_ENERGY_CHARGE' };
    e2.parseStatus = 'MANUAL';
  }
});

// ===== 15. WX07-036 E1: STUB（武器シグニが対戦相手シグニをバニッシュしたとき） =====
fix('WX07-036', 'E1 タイミング・アクション修正 → STUB', (e) => {
  e[0] = {
    effectId: 'WX07-036-E1',
    effectType: 'AUTO',
    timing: ['ON_SIGNI_BANISH_OPPONENT'],
    action: {
      type: 'STUB',
      stubId: 'ON_OWN_WEAPON_SIGNI_EFFECT_BANISH_OPP_GRANT_DUALCRASH_THIS',
    },
    duration: 'UNTIL_END_OF_TURN',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 16. WX11-031 E1: STUB（バニッシュ3体目でアップ）＋BURSTを保持 =====
fix('WX11-031', 'E1 タイミング・アクション修正 → STUB（3体目バニッシュでアップ）', (e) => {
  const burstEntry = e.find(ef => ef.effectType === 'LIFE_BURST');
  e[0] = {
    effectId: 'WX11-031-E1',
    effectType: 'AUTO',
    timing: ['ON_SIGNI_BANISH_OPPONENT'],
    action: {
      type: 'STUB',
      stubId: 'ON_THIS_BANISH_3RD_SKY_EARTH_BEAST_OPP_CUMUL_UP_SELF',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
  if (burstEntry) {
    // BURSTが2番目に来るように調整
    if (e.length < 2) e.push(burstEntry);
  }
});

// ===== 17. WX13-051 E2: STUB（対戦相手効果でトラッシュ時） =====
fix('WX13-051', 'E2 タイミング・アクション修正 → STUB(ON_OPP_EFFECT_DISCARD_FROM_HAND_ENERGY_CHARGE_2)', (e) => {
  const e2 = e.find(ef => ef.effectId === 'WX13-051-E2');
  if (e2) {
    e2.timing = ['ON_OPP_EFFECT_TRASH_FROM_HAND'];
    e2.action = { type: 'STUB', stubId: 'ON_OPP_EFFECT_DISCARD_FROM_HAND_ENERGY_CHARGE_2' };
    e2.parseStatus = 'MANUAL';
  }
});

// ===== 18. WX13-052 E1: STUB（バニッシュ→デッキ公開→遊具なら場出し） =====
fix('WX13-052', 'E1 タイミング・アクション修正 → STUB', (e) => {
  e[0] = {
    effectId: 'WX13-052-E1',
    effectType: 'AUTO',
    timing: ['ON_SIGNI_BANISH_OPPONENT'],
    action: {
      type: 'STUB',
      stubId: 'ON_THIS_BANISH_OPP_REVEAL_TOP_YOINGU_OPTIONAL_BANISH_SELF_FIELD_ADD',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 19. WX20-Re03 E1: STUB（対戦相手シグニのパワーが0以下） =====
fix('WX20-Re03', 'E1 タイミング・アクション修正 → STUB(ON_OPP_SIGNI_POWER_ZERO_ENERGY_CHARGE_ONCE_PER_TURN)', (e) => {
  e[0] = {
    effectId: 'WX20-Re03-E1',
    effectType: 'AUTO',
    timing: ['ON_SIGNI_POWER_ZERO_OR_LESS'],
    action: { type: 'STUB', stubId: 'ON_OPP_SIGNI_POWER_ZERO_ENERGY_CHARGE_ONCE_PER_TURN' },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 20. WX21-067 E1: STUB（対戦相手シグニのパワーが0以下でドロー） =====
fix('WX21-067', 'E1 タイミング・アクション修正 → STUB(ON_OPP_SIGNI_POWER_ZERO_DRAW_ONCE_PER_TURN)', (e) => {
  e[0] = {
    effectId: 'WX21-067-E1',
    effectType: 'AUTO',
    timing: ['ON_SIGNI_POWER_ZERO_OR_LESS'],
    action: { type: 'STUB', stubId: 'ON_OPP_SIGNI_POWER_ZERO_DRAW_ONCE_PER_TURN' },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
});

// ===== 保存 =====
fs.writeFileSync(filePath, JSON.stringify(effects, null, 4), 'utf8');
console.log(`\n合計 ${fixCount} 件修正完了 → ${filePath}`);
