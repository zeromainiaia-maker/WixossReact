/**
 * fixMissingEffects.mjs
 * checkAllEffects.mjs で検出した「エフェクト欠落」15件を修正
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function load(filename) {
  return JSON.parse(fs.readFileSync(path.join(root, 'public/data', filename), 'utf8'));
}
function save(filename, data) {
  fs.writeFileSync(path.join(root, 'public/data', filename), JSON.stringify(data, null, 4), 'utf8');
}

// 配列の先頭（LIFE_BURSTの手前）にエフェクトを挿入
function insertBefore(arr, newEf) {
  const burstIdx = arr.findIndex(e => e.effectType === 'LIFE_BURST');
  if (burstIdx >= 0) arr.splice(burstIdx, 0, newEf);
  else arr.push(newEf);
}

let fixCount = 0;
function fix(id, desc) {
  console.log(`[FIX] ${id}: ${desc}`);
  fixCount++;
}

// ─── effects_misc.json ──────────────────────────────────────────
const misc = load('effects_misc.json');

// WDK06-R11: AUTO(E1)欠落 → アタック時、このターン手札2枚捨てていた場合に相手シグニバニッシュ
insertBefore(misc['WDK06-R11'], {
  effectId: 'WDK06-R11-E1',
  effectType: 'AUTO',
  timing: ['ON_ATTACK_SIGNI'],
  action: { type: 'STUB', stubId: 'ON_ATTACK_IF_DISCARDED_2_THIS_TURN_BANISH_OPP_SIGNI' },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WDK06-R11', 'E1(AUTO ON_ATTACK_SIGNI) 追加 - 手札2枚捨て条件バニッシュ');

// WDK06-C01: ACTIVATED(E2)欠落 → ターン1回、デッキ上3枚トラッシュ→相手シグニ-5000
misc['WDK06-C01'].push({
  effectId: 'WDK06-C01-E2',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK'],
  cost: {},
  action: {
    type: 'SEQUENCE',
    steps: [
      { type: 'MILL', owner: 'self', count: 3 },
      {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        delta: -5000,
        duration: 'UNTIL_END_OF_TURN',
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});
fix('WDK06-C01', 'E2(ACTIVATED) 追加 - ターン1回、デッキ3枚→相手シグニ-5000');

save('effects_misc.json', misc);

// ─── effects_WX.json ──────────────────────────────────────────
const wx = load('effects_WX.json');

// WX15-041: AUTO(E1)欠落 + 【起】もない（ライズシグニ）
// CSVは【ライズ】+【自】アタック時パワー7000以下バニッシュのみ
insertBefore(wx['WX15-041'], {
  effectId: 'WX15-041-E1',
  effectType: 'AUTO',
  timing: ['ON_ATTACK_SIGNI'],
  action: {
    type: 'BANISH',
    target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { powerMax: 7000 } },
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WX15-041', 'E1(AUTO ON_ATTACK_SIGNI) 追加 - パワー7000以下バニッシュ');

// WX16-024: CONTINUOUS(E1) + AUTO(E2)欠落
// 【常】対戦相手のパワー15000以上のシグニの効果を受けない
// 【自】対戦相手の効果によって場を離れたとき、ドロー2
wx['WX16-024'].unshift(
  {
    effectId: 'WX16-024-E1',
    effectType: 'CONTINUOUS',
    action: {
      type: 'GRANT_PROTECTION',
      target: { type: 'SIGNI', owner: 'self', count: 1, isSelf: true },
      sourceOwner: 'opponent',
      sourceFilter: { powerMin: 15000 },
    },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
  {
    effectId: 'WX16-024-E2',
    effectType: 'AUTO',
    timing: ['ON_LEAVE_FIELD'],
    action: {
      type: 'STUB',
      stubId: 'ON_OPP_EFFECT_LEAVE_FIELD_DRAW_2',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
);
fix('WX16-024', 'E1(CONTINUOUS, 保護) + E2(AUTO, 場離れドロー2) 追加');

// WX17-045: AUTO(E2)欠落 → このカードが手札からトラッシュに置かれたとき、相手シグニをダウン
wx['WX17-045'].push({
  effectId: 'WX17-045-E2',
  effectType: 'AUTO',
  timing: ['ON_HAND_DISCARDED'],
  action: {
    type: 'STUB',
    stubId: 'ON_HAND_DISCARDED_DOWN_OPP_SIGNI',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WX17-045', 'E2(AUTO ON_HAND_DISCARDED) 追加 - 手札からトラッシュ時に相手シグニダウン');

// WX17-051: ACTIVATED(E1)欠落 → レイヤー:起動:白+自をトラッシュ→同レベル相手シグニバウンス
insertBefore(wx['WX17-051'], {
  effectId: 'WX17-051-E1',
  effectType: 'ACTIVATED',
  timing: ['MAIN'],
  cost: { energy: [{ color: '白', count: 1 }], trash_self: true },
  action: {
    type: 'BOUNCE',
    target: {
      type: 'SIGNI',
      owner: 'opponent',
      count: 1,
      filter: { sameLevelAsSelf: true },
    },
    destination: 'hand',
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});
fix('WX17-051', 'E1(ACTIVATED) 追加 - 白+自トラッシュ→同レベル相手シグニバウンス');

// WX21-Re05: AUTO(E1)欠落 → 各アタックフェイズ開始時、他の赤シグニ1体にバニッシュされない付与
insertBefore(wx['WX21-Re05'], {
  effectId: 'WX21-Re05-E1',
  effectType: 'AUTO',
  timing: ['ATTACK'],
  action: {
    type: 'STUB',
    stubId: 'ON_ATTACK_PHASE_START_GRANT_CANT_BANISH_TO_OTHER_RED_SIGNI',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WX21-Re05', 'E1(AUTO ATTACK) 追加 - 各ATKフェイズ開始時、赤シグニにバニッシュされない付与');

save('effects_WX.json', wx);

// ─── effects_WX24_26.json ──────────────────────────────────────
const wx24 = load('effects_WX24_26.json');

// WX24-P4-058: AUTO(E2)欠落 → バトルでシグニをバニッシュしたとき、このシグニのパワー+5000（次の相手ターン終了時まで）
wx24['WX24-P4-058'].push({
  effectId: 'WX24-P4-058-E2',
  effectType: 'AUTO',
  timing: ['ON_SIGNI_BANISH_BATTLE'],
  action: {
    type: 'STUB',
    stubId: 'ON_BATTLE_BANISH_POWER_PLUS_5000_UNTIL_NEXT_OPP_TURN_END',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WX24-P4-058', 'E2(AUTO ON_SIGNI_BANISH_BATTLE) 追加 - バトルバニッシュ後パワー+5000');

// WX25-CP1-040: ACTIVATED(E2) + AUTO絆自(E3) 欠落
// 【起】ターン1回、エナから3枚→同レベル相手シグニバウンス
// 【絆自】バトルでバニッシュしたとき、エナチャージ1
wx24['WX25-CP1-040'].push(
  {
    effectId: 'WX25-CP1-040-E2',
    effectType: 'ACTIVATED',
    timing: ['MAIN', 'ATTACK'],
    cost: {},
    action: {
      type: 'STUB',
      stubId: 'ACTIVATED_TRASH_UP_TO_3_BLUEAKA_ENERGY_BOUNCE_SAME_LEVEL_OPP_SIGNI',
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  },
  {
    effectId: 'WX25-CP1-040-E3',
    effectType: 'AUTO',
    timing: ['ON_SIGNI_BANISH_BATTLE'],
    action: {
      type: 'STUB',
      stubId: 'KIZUNA_AUTO_ON_BATTLE_BANISH_ENERGY_CHARGE_1',
    },
    duration: 'INSTANT',
    mandatory: true,
    parseStatus: 'MANUAL',
  },
);
fix('WX25-CP1-040', 'E2(ACTIVATED)+E3(AUTO 絆自) 追加');

save('effects_WX24_26.json', wx24);

// ─── effects_WXDi.json ──────────────────────────────────────────
const wxdi = load('effects_WXDi.json');

// WXDi-P04-040: AUTO(E2)欠落 → アタックフェイズ開始時、無無無を支払わなければトラッシュ
wxdi['WXDi-P04-040'].push({
  effectId: 'WXDi-P04-040-E2',
  effectType: 'AUTO',
  timing: ['ATTACK'],
  action: {
    type: 'STUB',
    stubId: 'ON_ATTACK_PHASE_MUST_PAY_COLORLESS_3_OR_TRASH_SELF',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WXDi-P04-040', 'E2(AUTO ATTACK) 追加 - ATKフェイズ開始時、無×3支払わなければトラッシュ');

// WXDi-P03-030: ACTIVATED(E3)欠落 → ゲーム1回、DIAGRAM Lv1ルリグをルリグデッキに戻す
wxdi['WXDi-P03-030'].push({
  effectId: 'WXDi-P03-030-E3',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK'],
  cost: { limitPerGame: 1 },
  action: {
    type: 'STUB',
    stubId: 'GAME_ONCE_RETURN_DIAGRAM_LV1_LRIG_TO_DECK',
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});
fix('WXDi-P03-030', 'E3(ACTIVATED ゲーム1回) 追加 - DIAGRAMルリグをデッキに戻す');

// WXDi-P06-010: ACTIVATED(E2)欠落 → ゲーム1回、相手パワー12000以上バニッシュ+エナを手札に
wxdi['WXDi-P06-010'].push({
  effectId: 'WXDi-P06-010-E2',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK'],
  cost: { limitPerGame: 1 },
  action: {
    type: 'SEQUENCE',
    steps: [
      {
        type: 'BANISH',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { powerMin: 12000 } },
      },
      {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1 },
      },
    ],
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});
fix('WXDi-P06-010', 'E2(ACTIVATED ゲーム1回) 追加 - 相手パワー12000以上バニッシュ+エナ手札');

// WXDi-P07-081: ACTIVATED(E2)欠落 → 緑×2+自トラッシュ→相手Lv3以上シグニバニッシュ
wxdi['WXDi-P07-081'].push({
  effectId: 'WXDi-P07-081-E2',
  effectType: 'ACTIVATED',
  timing: ['MAIN', 'ATTACK'],
  cost: { energy: [{ color: '緑', count: 2 }], trash_self: true },
  action: {
    type: 'BANISH',
    target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { minLevel: 3 } },
  },
  duration: 'INSTANT',
  mandatory: false,
  parseStatus: 'MANUAL',
});
fix('WXDi-P07-081', 'E2(ACTIVATED) 追加 - 緑×2+自トラッシュ→相手Lv3以上バニッシュ');

save('effects_WXDi.json', wxdi);

// ─── effects_WXK.json ──────────────────────────────────────────
const wxk = load('effects_WXK.json');

// WXK10-054: AUTO(E1)欠落 → バニッシュされたとき、下にあったウェポンシグニを手札に
insertBefore(wxk['WXK10-054'], {
  effectId: 'WXK10-054-E1',
  effectType: 'AUTO',
  timing: ['ON_BANISH'],
  action: {
    type: 'STUB',
    stubId: 'ON_BANISH_RECOVER_RISE_UNDER_WEAPON_SIGNI_TO_HAND',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WXK10-054', 'E1(AUTO ON_BANISH) 追加 - バニッシュ時、下のウェポンシグニを手札に');

// WXK11-038: AUTO(E1)欠落 → アタック時、下カードと同色の相手シグニをデッキ上に
insertBefore(wxk['WXK11-038'], {
  effectId: 'WXK11-038-E1',
  effectType: 'AUTO',
  timing: ['ON_ATTACK_SIGNI'],
  action: {
    type: 'STUB',
    stubId: 'ON_ATTACK_SAME_COLOR_AS_UNDER_CARD_BOUNCE_OPP_SIGNI_TO_DECK_TOP',
  },
  duration: 'INSTANT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WXK11-038', 'E1(AUTO ON_ATTACK_SIGNI) 追加 - 下カードと同色の相手シグニをデッキ上に');

save('effects_WXK.json', wxk);

console.log(`\n合計 ${fixCount} 件修正完了`);
