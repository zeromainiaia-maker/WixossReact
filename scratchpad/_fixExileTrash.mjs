// TRASH{TRASH_CARD}＝トラッシュ→トラッシュの完全no-opを EXILE に是正する系統パッチ（続き6の場シグニ除外の残り＝ゾーン除外編）
// parser 同修正済み（parseSentencePart1「ゲームから除外」の TRASH_CARD→EXILE 化）。--write で書き込み。
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const EX = (owner, count, filter, upTo) => ({ type: 'EXILE', target: { type: 'TRASH_CARD', owner, count, ...(filter ? { filter } : {}), ...(upTo ? { upToCount: true } : {}) } });

const fixes = {
  // 相手トラッシュから対象除外（フィルタ/枚数は原文どおり）
  'WX07-022-E1':  e => { e.action = EX('opponent', 3, undefined, true); return 'EXILE 相トラ カード3まで'; },
  'WX08-023-E2':  e => { e.action = EX('opponent', 1, undefined, false); return 'EXILE 相トラ カード1'; },
  'WX13-005B-E1': e => { e.action.choices[0].action = EX('opponent', 2, { cardType: 'シグニ' }, true); return 'choices[0]→EXILE 相トラ シグニ2まで'; },
  'WX13-006B-E1': e => { e.action.choices[0].action = EX('opponent', 2, { cardType: 'スペル' }, true); return 'choices[0]→EXILE 相トラ スペル2まで'; },
  'WX14-006B-E1': e => {
    e.action.choices[1].action = { type: 'SEQUENCE', steps: [
      EX('opponent', 1, { cardType: 'シグニ' }, true),
      EX('opponent', 1, { cardType: 'スペル' }, true),
    ] };
    return 'choices[1]→SEQUENCE[EXILE シグニ1まで, EXILE スペル1まで]';
  },
  'WX14-021-E1':  e => { e.action.steps[0] = EX('opponent', 'ALL', { cardType: 'スペル' }, false); return 'steps[0]→EXILE 相トラ 全スペル'; },
  'WXDi-P11-008-E3': e => { e.action.steps[1] = EX('opponent', 3, { hasGuard: false }, true); return 'steps[1]→EXILE 相トラ ガード無し3まで'; },
  'WXDi-P13-040-E2': e => {
    e.action.steps[0] = EX('opponent', 1, { cardType: 'スペル' }, true);
    e.action.steps[1].targetSelf = false;
    return 'steps[0]→EXILE 相トラ スペル1まで / steps[1] NAME_BAN targetSelf→false';
  },
  'WDK13-001-E2': e => { e.action.choices[1].action = EX('opponent', 1, undefined, false); return 'choices[1]→EXILE 相トラ カード1'; },
  'PR-K046-E2':   e => { e.action.steps[1] = EX('opponent', 1, undefined, false); return 'steps[1]→EXILE 相トラ カード1'; },
  // 場にあるこのシグニ自身の除外（TRASH_CARD self は誤ゾーン）
  'WX25-P1-TK6-E2': e => {
    e.action.steps[0] = { type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } };
    return 'steps[0]→EXILE 場のこのシグニ（thisCardOnly）';
  },
  // WX10-023: CHOOSE 2択の構造ごと崩壊（現 curated＝NAME_BAN 単独）を正エンコード
  'WX10-023-E1': e => {
    e.action = { type: 'CHOOSE', choose_count: 1, from_count: 2, choices: [
      { choiceId: 'c0', label: '選択肢1', action: { type: 'ADD_TO_HAND',
        source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', colorMatchesLrig: true } } } },
      { choiceId: 'c1', label: '選択肢2', action: { type: 'SEQUENCE', steps: [
        EX('opponent', 1, { cardType: 'スペル' }, false),
        { type: 'NAME_BAN', targetSelf: false, duration: 'GAME' },
      ] } },
    ] };
    e.parseStatus = 'MANUAL';
    return 'CHOOSE 2択を正エンコード（①色一致シグニ回収／②スペル除外＋同名禁止）・MANUAL化';
  },
};

const fileOf = {
  'WX07-022-E1': 'effects_WX.json', 'WX08-023-E2': 'effects_WX.json', 'WX13-005B-E1': 'effects_WX.json',
  'WX13-006B-E1': 'effects_WX.json', 'WX14-006B-E1': 'effects_WX.json', 'WX14-021-E1': 'effects_WX.json', 'WX10-023-E1': 'effects_WX.json',
  'WX25-P1-TK6-E2': 'effects_WX24_26.json',
  'WXDi-P11-008-E3': 'effects_WXDi.json', 'WXDi-P13-040-E2': 'effects_WXDi.json',
  'WDK13-001-E2': 'effects_misc.json', 'PR-K046-E2': 'effects_misc.json',
};

const byFile = {};
for (const [id, f] of Object.entries(fileOf)) (byFile[f] ??= []).push(id);
for (const [f, ids] of Object.entries(byFile)) {
  const p = `public/data/${f}`;
  const raw = readFileSync(p, 'utf8');
  const eol = raw.endsWith('\n') ? '\n' : '';
  const data = JSON.parse(raw);
  let changed = 0;
  for (const id of ids) {
    const cardNum = id.replace(/-E\d+$/, '');
    const eff = (data[cardNum] ?? []).find(e => e.effectId === id);
    if (!eff) { console.log(`✗ ${id}: not found`); continue; }
    try { console.log(`✔ ${id}: ${fixes[id](eff)}`); changed++; }
    catch (err) { console.log(`✗ ${id}: ${err.message}`); }
  }
  if (WRITE && changed) { writeFileSync(p, JSON.stringify(data) + eol, 'utf8'); console.log(`→ ${f} 書き込み（${changed}件）`); }
}
if (!WRITE) console.log('\n(dry-run。--write で書き込み)');
