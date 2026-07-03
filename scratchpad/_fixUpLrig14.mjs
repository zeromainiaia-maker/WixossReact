// 「このルリグをアップする」系の curated 誤エンコード（UP{SIGNI}）を UP{LRIG} に是正する系統パッチ。
// parser 同修正済み（parseSentencePart1 の UP LRIG ルール）＝パリティ維持。--write で書き込み。
import { readFileSync, writeFileSync } from 'fs';
const WRITE = process.argv.includes('--write');
const UP_LRIG = { type: 'UP', target: { type: 'LRIG', owner: 'self', count: 1 } };

// effectId → 修正関数（eff を in-place 変更し説明文字列を返す。失敗時 null）
const fixes = {
  'WX08-001-E2': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
  'WX10-009-E2': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
  'WX22-010-E3': e => { e.action.steps[2] = { ...UP_LRIG }; return 'steps[2]→UP LRIG'; },
  'WXEX2-01-E1': e => {
    e.action = { type: 'SEQUENCE', steps: [
      { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardClass: ['アーム', 'ウェポン'] } } },
      { ...UP_LRIG },
    ] };
    return 'action→SEQUENCE[UP SIGNI(アーム/ウェポン), UP LRIG]';
  },
  'WX24-P3-001-E1': e => { e.action.steps[1] = { ...UP_LRIG }; return 'steps[1]→UP LRIG'; },
  'WX24-P4-011-E2': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
  'WX25-P2-048-E1': e => {
    e.action.steps[0] = { type: 'CONDITIONAL', condition: { type: 'CENTER_LRIG_IS_UP' }, then: { type: 'DRAW', owner: 'self', count: 2 } };
    e.action.steps[1] = { ...UP_LRIG };
    return 'steps[0]→CONDITIONAL{CENTER_LRIG_IS_UP,DRAW2} / steps[1]→UP LRIG';
  },
  'WXK11-052-E1': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
  'PR-461-E1': e => { e.action.steps[1].then = { ...UP_LRIG }; return 'steps[1].then→UP LRIG'; },
  'SPDi43-03-E2': e => { e.action.steps[1] = { ...UP_LRIG }; return 'steps[1]→UP LRIG'; },
  'SPDi43-11-E2': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
  'SPDi43-12-E2': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
  'SPDi43-13-E2': e => { e.action = { ...UP_LRIG }; return 'action→UP LRIG'; },
};

const fileOf = {
  'WX08-001-E2': 'effects_WX.json', 'WX10-009-E2': 'effects_WX.json', 'WX22-010-E3': 'effects_WX.json', 'WXEX2-01-E1': 'effects_WX.json',
  'WX24-P3-001-E1': 'effects_WX24_26.json', 'WX24-P4-011-E2': 'effects_WX24_26.json', 'WX25-P2-048-E1': 'effects_WX24_26.json',
  'WXK11-052-E1': 'effects_WXK.json',
  'PR-461-E1': 'effects_misc.json', 'SPDi43-03-E2': 'effects_misc.json', 'SPDi43-11-E2': 'effects_misc.json',
  'SPDi43-12-E2': 'effects_misc.json', 'SPDi43-13-E2': 'effects_misc.json',
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
    try {
      const desc = fixes[id](eff);
      console.log(`✔ ${id}: ${desc}`);
      changed++;
    } catch (err) { console.log(`✗ ${id}: ${err.message}`); }
  }
  if (WRITE && changed) { writeFileSync(p, JSON.stringify(data) + eol, 'utf8'); console.log(`→ ${f} 書き込み（${changed}件）`); }
}
if (!WRITE) console.log('\n(dry-run。--write で書き込み)');
