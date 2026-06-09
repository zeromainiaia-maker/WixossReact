/**
 * fixRound3.mjs
 * checkAllEffects.mjs Round3 修正:
 *  1. MANDATORY_SUSPICIOUS 84件 → mandatory:false 一括設定
 *  2. POWER_VALUE_MISMATCH 7件 → delta修正
 *  3. EFFECT_TYPE_MISSING_CONTINUOUS 16件 → CONTINUOUS追加
 *  4. LIFE_BURST_MISSING 2件 → STUB LIFE_BURST追加
 *  5. 絆常構造修正 2件
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

function load(f) { return JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8')); }
function save(f, d) { fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(d, null, 4), 'utf8'); }

let total = 0;
function fix(id, desc) { console.log(`[FIX] ${id}: ${desc}`); total++; }

// ─── 1. MANDATORY_SUSPICIOUS: mandatory:false 一括 ────────────────────────
// カードID→ファイルのマップ
const MANDATORY_CARDS = {
  'effects_misc.json': ['WDK05-T13','WDK05-T15','WDK16-13'],
  'effects_WX.json': [
    'WX01-036','WX01-057','WX01-059','WX02-073',
    'WX04-003','WX04-041','WX04-052','WX04-058','WX04-096','WX04-102',
    'WX05-011','WX08-046','WX08-078','WX08-080','WX09-012',
    'WX10-007','WX10-021','WX10-034','WX10-048','WX10-092',
    'WX11-026','WX11-035','WX12-010','WX12-031','WX13-044',
    'WX14-009','WX14-026','WX14-033','WX14-CB02',
    'WX15-036','WX15-039','WX16-038','WX16-070','WX17-075','WX18-002',
    'WX20-034-CB','WX20-039-CB','WX20-050','WX20-055','WX20-066','WX20-067','WX20-082',
    'WX21-065','WX21-Re06',
  ],
  'effects_WX24_26.json': [
    'WX24-P1-069','WX24-P2-077','WX24-P2-078','WX24-P3-077',
    'WX24-P4-040','WX24-P4-052','WX24-P4-070','WX24-P4-104',
    'WX25-P1-055','WX25-P1-056','WX25-P1-069','WX25-P1-083','WX25-P1-099','WX25-P1-104',
    'WX25-P2-057','WX25-P2-085','WX25-P2-112',
    'WX25-P3-074','WX25-P3-078','WX25-P3-089',
    'WX25-CP1-062','WX25-CP1-082','WX26-CP1-048',
  ],
  'effects_WXDi.json': [
    'WXDi-P02-037','WXDi-P03-071','WXDi-P04-059','WXDi-P05-032',
    'WXDi-P06-011','WXDi-P06-034','WXDi-P06-049',
  ],
  'effects_WXK.json': [
    'WXK08-033','WXK08-059','WXK08-063','WXK10-057','WXK10-061','WXK11-030','WXK11-066',
  ],
};

const datas = {};
for (const fname of Object.keys(MANDATORY_CARDS)) {
  datas[fname] = load(fname);
}

for (const [fname, ids] of Object.entries(MANDATORY_CARDS)) {
  const data = datas[fname];
  for (const id of ids) {
    if (!data[id]) { console.log(`[WARN] ${id} not found in ${fname}`); continue; }
    let changed = false;
    for (const ef of data[id]) {
      if ((ef.effectType === 'AUTO' || ef.effectType === 'CONTINUOUS') && ef.mandatory === true) {
        ef.mandatory = false;
        changed = true;
      }
    }
    if (changed) fix(id, 'mandatory:false 設定');
  }
}

// ─── 2. POWER_VALUE_MISMATCH ──────────────────────────────────────────────
const wx = datas['effects_WX.json'] || load('effects_WX.json');
const wx24 = datas['effects_WX24_26.json'] || load('effects_WX24_26.json');
const wxdi = datas['effects_WXDi.json'] || load('effects_WXDi.json');

// WX06-006: E1 step2 (conditional replacement -15000) → STUB
{
  const e = wx['WX06-006']?.[0];
  if (e?.action?.steps?.[1]) {
    e.action.steps[1] = { type: 'STUB', stubId: 'CONDITIONAL_IF_BLACK_AND_LIFE_2_OR_LESS_POWER_MINUS_TARGET_2_SIGNI' };
    fix('WX06-006', 'E1 step2 STUB化（条件付き代替効果）');
  }
}

// WX24-P1-050: BURST choice 0 delta -15000 → -2000
{
  const burst = wx24['WX24-P1-050']?.find(e => e.effectType === 'LIFE_BURST');
  const c0 = burst?.action?.choices?.[0]?.action;
  if (c0?.type === 'POWER_MODIFY' && c0.delta === -15000) {
    c0.delta = -2000;
    fix('WX24-P1-050', 'BURST choice0 delta: -15000 → -2000');
  }
}

// WX24-P2-094: BURST delta -15000 → -3000
{
  const burst = wx24['WX24-P2-094']?.find(e => e.effectType === 'LIFE_BURST');
  if (burst?.action?.type === 'POWER_MODIFY' && burst.action.delta === -15000) {
    burst.action.delta = -3000;
    fix('WX24-P2-094', 'BURST delta: -15000 → -3000');
  }
}

// WX24-P4-089: E1 step2 → STUB; BURST delta -15000 → -7000
{
  const e1 = wx24['WX24-P4-089']?.find(e => e.effectId === 'WX24-P4-089-E1');
  if (e1?.action?.steps?.[1]) {
    e1.action.steps[1] = { type: 'STUB', stubId: 'CONDITIONAL_IF_LV4_LRIG_EXTRA_POWER_MINUS_20000_OPP_SIGNI' };
    fix('WX24-P4-089', 'E1 step2 STUB化（レベル4ルリグ条件追加）');
  }
  const burst = wx24['WX24-P4-089']?.find(e => e.effectType === 'LIFE_BURST');
  if (burst?.action?.type === 'POWER_MODIFY' && burst.action.delta === -15000) {
    burst.action.delta = -7000;
    fix('WX24-P4-089', 'BURST delta: -15000 → -7000');
  }
}

// WX25-P1-111: BURST delta -15000 → -8000
{
  const burst = wx24['WX25-P1-111']?.find(e => e.effectType === 'LIFE_BURST');
  if (burst?.action?.type === 'POWER_MODIFY' && burst.action.delta === -15000) {
    burst.action.delta = -8000;
    fix('WX25-P1-111', 'BURST delta: -15000 → -8000');
  }
}

// WX25-P2-109: BURST delta -15000 → -10000
{
  const burst = wx24['WX25-P2-109']?.find(e => e.effectType === 'LIFE_BURST');
  if (burst?.action?.type === 'POWER_MODIFY' && burst.action.delta === -15000) {
    burst.action.delta = -10000;
    fix('WX25-P2-109', 'BURST delta: -15000 → -10000');
  }
}

// WXDi-D06-021: BURST delta -15000 → -6000
{
  const burst = wxdi['WXDi-D06-021']?.find(e => e.effectType === 'LIFE_BURST');
  if (burst?.action?.type === 'POWER_MODIFY' && burst.action.delta === -15000) {
    burst.action.delta = -6000;
    fix('WXDi-D06-021', 'BURST delta: -15000 → -6000');
  }
}

// ─── 3. 絆常構造修正 ──────────────────────────────────────────────────────
// WX25-CP1-073: E1 step2(+4000 self) を切り離してE2=CONTINUOUSへ
{
  const e1 = wx24['WX25-CP1-073']?.find(e => e.effectId === 'WX25-CP1-073-E1');
  if (e1?.action?.steps?.length === 2 && e1.action.steps[1]?.type === 'POWER_MODIFY' && e1.action.steps[1].delta === 4000) {
    e1.action.steps.splice(1, 1);
    // E1が1ステップになるので steps 不要なら直接アクションに
    if (e1.action.steps.length === 1) {
      e1.action = e1.action.steps[0];
    }
    wx24['WX25-CP1-073'].splice(
      wx24['WX25-CP1-073'].findIndex(e => e.effectType === 'LIFE_BURST'), 0,
      {
        effectId: 'WX25-CP1-073-E2',
        effectType: 'CONTINUOUS',
        action: {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: 1, isSelf: true },
          delta: 4000,
        },
        duration: 'PERMANENT',
        mandatory: true,
        activeCondition: { type: 'KIZUNA_ACTIVE' },
        parseStatus: 'MANUAL',
      },
    );
    fix('WX25-CP1-073', '絆常 E2=CONTINUOUS(+4000 self) 追加 + E1 step2 除去');
  }
}

// WX25-CP1-087: E1 step3(+4000 self) を切り離してE2=CONTINUOUSへ
{
  const e1 = wx24['WX25-CP1-087']?.find(e => e.effectId === 'WX25-CP1-087-E1');
  if (e1?.action?.steps) {
    const idx = e1.action.steps.findIndex(s => s.type === 'POWER_MODIFY' && s.delta === 4000);
    if (idx >= 0) {
      e1.action.steps.splice(idx, 1);
      wx24['WX25-CP1-087'].push({
        effectId: 'WX25-CP1-087-E2',
        effectType: 'CONTINUOUS',
        action: {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: 1, isSelf: true },
          delta: 4000,
        },
        duration: 'PERMANENT',
        mandatory: true,
        activeCondition: { type: 'KIZUNA_ACTIVE' },
        parseStatus: 'MANUAL',
      });
      fix('WX25-CP1-087', '絆常 E2=CONTINUOUS(+4000 self) 追加 + E1 step3 除去');
    }
  }
}

// ─── 4. EFFECT_TYPE_MISSING_CONTINUOUS ───────────────────────────────────
function insertBeforeBurst(arr, ef) {
  const i = arr.findIndex(e => e.effectType === 'LIFE_BURST');
  if (i >= 0) arr.splice(i, 0, ef); else arr.push(ef);
}

const misc = datas['effects_misc.json'] || load('effects_misc.json');
const wxk = datas['effects_WXK.json'] || load('effects_WXK.json');

// PR-461: 【グロウ】条件付き【常】:【ダブルクラッシュ】
misc['PR-461'].push({
  effectId: 'PR-461-E2',
  effectType: 'CONTINUOUS',
  action: { type: 'GRANT_KEYWORD', keyword: 'DOUBLE_CRUSH', target: { type: 'LRIG', owner: 'self', isSelf: true } },
  duration: 'PERMANENT',
  mandatory: true,
  activeCondition: { type: 'GROW_CONDITION_MET' },
  parseStatus: 'MANUAL',
});
fix('PR-461', 'E2 CONTINUOUS(ダブルクラッシュ) 追加');

// WX12-025, WX12-034, WX12-036: 【ガード】+条件付きガード喪失
for (const [id, lrig] of [['WX12-025','サシェ'],['WX12-034','アイヤイ'],['WX12-036','ミュウ']]) {
  insertBeforeBurst(wx[id], {
    effectId: `${id}-E1`,
    effectType: 'CONTINUOUS',
    action: { type: 'STUB', stubId: `IF_CENTER_LRIG_NOT_${lrig.toUpperCase()}_LOSE_GUARD` },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  });
  fix(id, `E1 CONTINUOUS(STUB - センタールリグ${lrig}条件 ガード喪失) 追加`);
}

// WX15-031: 【レイヤー】CONTINUOUS
insertBeforeBurst(wx['WX15-031'], {
  effectId: 'WX15-031-E1',
  effectType: 'CONTINUOUS',
  action: { type: 'STUB', stubId: 'LAYER_GRANT_PROTECTION_FROM_COST5_ARTS_SPELLS_TO_KAIKI' },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WX15-031', 'E1 CONTINUOUS(STUB LAYER ability) 追加');

// WX15-032: 【常】中央のシグニゾーンにあるかぎりトリプルクラッシュ
{
  const i = wx['WX15-032'].findIndex(e => e.effectType === 'AUTO');
  wx['WX15-032'].splice(i, 0, {
    effectId: 'WX15-032-E1',
    effectType: 'CONTINUOUS',
    action: { type: 'GRANT_KEYWORD', keyword: 'TRIPLE_CRUSH', target: { type: 'SIGNI', owner: 'self', isSelf: true } },
    duration: 'PERMANENT',
    mandatory: true,
    activeCondition: { type: 'IN_CENTER_ZONE' },
    parseStatus: 'MANUAL',
  });
  fix('WX15-032', 'E1 CONTINUOUS(中央=トリプルクラッシュ) 追加');
}

// WX16-034, WX16-051, WX16-053: LAYER CONTINUOUS
const LAYER_STUBS = {
  'WX16-034': 'LAYER_GRANT_PROTECTION_FROM_COST1_ARTS_TO_KAIKI',
  'WX16-051': 'LAYER_GRANT_LANCER_WHEN_POWER_GE_8000_TO_KAIKI',
  'WX16-053': 'LAYER_GRANT_PROTECTION_FROM_LV2_SIGNI_EFFECT_TO_KAIKI',
};
for (const [id, stubId] of Object.entries(LAYER_STUBS)) {
  insertBeforeBurst(wx[id], {
    effectId: `${id}-E1`,
    effectType: 'CONTINUOUS',
    action: { type: 'STUB', stubId },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  });
  fix(id, 'E1 CONTINUOUS(STUB LAYER ability) 追加');
}

// WX17-025: E1=CONTINUOUS +3000 during opponent turn (via LAYER)
{
  wx['WX17-025'].unshift({
    effectId: 'WX17-025-E1',
    effectType: 'CONTINUOUS',
    action: {
      type: 'POWER_MODIFY',
      target: { type: 'SIGNI', owner: 'self', count: 1, isSelf: true },
      delta: 3000,
    },
    duration: 'PERMANENT',
    mandatory: true,
    activeCondition: { type: 'OPPONENT_TURN' },
    parseStatus: 'MANUAL',
  });
  fix('WX17-025', 'E1 CONTINUOUS(相手ターン+3000) 追加');
}

// WX17-026: E1=CONTINUOUS パワー+1000 per under-card
{
  wx['WX17-026'].unshift({
    effectId: 'WX17-026-E1',
    effectType: 'CONTINUOUS',
    action: { type: 'STUB', stubId: 'CONTINUOUS_POWER_PLUS_1000_PER_UNDER_CARD' },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  });
  fix('WX17-026', 'E1 CONTINUOUS(STUB 下カード数×+1000) 追加');
}

// WX20-038: E1=CONTINUOUS【アサシン】【ダブルクラッシュ】+バニッシュされない
{
  const i = wx['WX20-038'].findIndex(e => e.effectType === 'AUTO');
  wx['WX20-038'].splice(i, 0, {
    effectId: 'WX20-038-E1',
    effectType: 'CONTINUOUS',
    action: {
      type: 'GRANT_KEYWORD',
      keywords: ['ASSASSIN', 'DOUBLE_CRUSH', 'CANT_BANISH_BY_OPP_EFFECT'],
      target: { type: 'SIGNI', owner: 'self', isSelf: true },
    },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  });
  fix('WX20-038', 'E1 CONTINUOUS(アサシン+ダブルクラッシュ+バニッシュ不可) 追加');
}

// WX24-P1-043: E1=STUB CONTINUOUS (RISE 複合条件)
insertBeforeBurst(wx24['WX24-P1-043'], {
  effectId: 'WX24-P1-043-E1',
  effectType: 'CONTINUOUS',
  action: { type: 'STUB', stubId: 'RISE_CONDITIONAL_ABILITIES_BY_UNDER_CARD_LEVEL' },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WX24-P1-043', 'E1 CONTINUOUS(STUB RISE条件別能力) 追加');

// WXDi-P04-036: E2=CONTINUOUS パワー+3000 when ルリグデッキ≤1
wxdi['WXDi-P04-036'].push({
  effectId: 'WXDi-P04-036-E2',
  effectType: 'CONTINUOUS',
  action: {
    type: 'POWER_MODIFY',
    target: { type: 'SIGNI', owner: 'self', count: 1, isSelf: true },
    delta: 3000,
  },
  duration: 'PERMANENT',
  mandatory: true,
  activeCondition: { type: 'LRIG_DECK_LE_1' },
  parseStatus: 'MANUAL',
});
fix('WXDi-P04-036', 'E2 CONTINUOUS(ルリグデッキ≤1ならパワー+3000) 追加');

// WXDi-P05-033: E1=CONTINUOUS SHADOW during opponent turn
{
  const i = wxdi['WXDi-P05-033'].findIndex(e => e.effectType === 'AUTO');
  wxdi['WXDi-P05-033'].splice(i, 0, {
    effectId: 'WXDi-P05-033-E1',
    effectType: 'CONTINUOUS',
    action: { type: 'GRANT_KEYWORD', keyword: 'SHADOW', target: { type: 'SIGNI', owner: 'self', isSelf: true } },
    duration: 'PERMANENT',
    mandatory: true,
    activeCondition: { type: 'OPPONENT_TURN' },
    parseStatus: 'MANUAL',
  });
  fix('WXDi-P05-033', 'E1 CONTINUOUS(相手ターン シャドウ) 追加');
}

// WXDi-P05-038: E1=STUB CONTINUOUS (RISE 置換効果 相手ターン)
{
  const i = wxdi['WXDi-P05-038'].findIndex(e => e.effectType === 'AUTO');
  wxdi['WXDi-P05-038'].splice(i, 0, {
    effectId: 'WXDi-P05-038-E1',
    effectType: 'CONTINUOUS',
    action: { type: 'STUB', stubId: 'OPP_TURN_REPLACEMENT_TRASH_UNDER_INSTEAD_OF_LEAVE_FIELD' },
    duration: 'PERMANENT',
    mandatory: true,
    activeCondition: { type: 'OPPONENT_TURN' },
    parseStatus: 'MANUAL',
  });
  fix('WXDi-P05-038', 'E1 CONTINUOUS(STUB 相手ターン置換効果) 追加');
}

// WXDi-P06-057: E1=CONTINUOUS 効果によって新たに能力を得られない
{
  const i = wxdi['WXDi-P06-057'].findIndex(e => e.effectType === 'AUTO');
  wxdi['WXDi-P06-057'].splice(i, 0, {
    effectId: 'WXDi-P06-057-E1',
    effectType: 'CONTINUOUS',
    action: { type: 'STUB', stubId: 'CANT_GAIN_NEW_ABILITIES_BY_EFFECT' },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  });
  fix('WXDi-P06-057', 'E1 CONTINUOUS(効果による能力付与を受けない) 追加');
}

// WXK11-053: E1=CONTINUOUS【アサシン】【ダブルクラッシュ】
insertBeforeBurst(wxk['WXK11-053'], {
  effectId: 'WXK11-053-E1',
  effectType: 'CONTINUOUS',
  action: {
    type: 'GRANT_KEYWORD',
    keywords: ['ASSASSIN', 'DOUBLE_CRUSH'],
    target: { type: 'SIGNI', owner: 'self', isSelf: true },
  },
  duration: 'PERMANENT',
  mandatory: true,
  parseStatus: 'MANUAL',
});
fix('WXK11-053', 'E1 CONTINUOUS(アサシン+ダブルクラッシュ) 追加');

// ─── 5. LIFE_BURST_MISSING ────────────────────────────────────────────────
// WX16-062, WX16-064: TRAP cards with LifeBurst=1
for (const id of ['WX16-062','WX16-064']) {
  if (!wx[id].find(e => e.effectType === 'LIFE_BURST')) {
    wx[id].push({
      effectId: `${id}-BURST`,
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'STUB', stubId: `LIFE_BURST_${id.replace(/-/g, '_')}` },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    });
    fix(id, 'LIFE_BURST STUB 追加（LifeBurst=1）');
  }
}

// ─── save ──────────────────────────────────────────────────────────────────
save('effects_misc.json', misc);
save('effects_WX.json', wx);
save('effects_WX24_26.json', wx24);
save('effects_WXDi.json', wxdi);
save('effects_WXK.json', wxk);

console.log(`\n合計 ${total} 件修正完了`);
