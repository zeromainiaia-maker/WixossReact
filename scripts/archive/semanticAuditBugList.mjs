// 意味照合 triage の「BUG 確定」一覧（2026-09-08新設・PLAN §5.0 実装キューの列挙器）
//
// なぜ要るか＝O-A の triage が終わった時点で `semanticAuditPool.mjs` は**残0**になり、
// 在庫（＝直していない真バグ 433効果）をどの計器も映さなくなった。追跡先は各ラウンド dir の
// `triaged.txt` の `:: BUG ::` 行だが、🔴**`triaged.txt` には severity も type も入っていない**ので、
// `findings.jsonl` と突き合わせないと「HIGH から取る」ができない（そこで詰まる）。
//
//   node scripts/archive/semanticAuditBugList.mjs                  … サマリ（型別・深刻度別・シート別）
//   node scripts/archive/semanticAuditBugList.mjs --list            … 1行ずつ（severity / type / 一言）
//   node scripts/archive/semanticAuditBugList.mjs --list --sev HIGH … 深刻度で絞る
//   node scripts/archive/semanticAuditBugList.mjs --list --grep asDown … 判定の一言で絞る（系統の抽出）
//   node scripts/archive/semanticAuditBugList.mjs --list --fixed        … 消化済みだけを見る
//
// ⚠**これは在庫カウンタであって判定ではない**＝「BUG」は triage 時点の確定で、
//   実装時には §2.1 ② で母集団を測り直す（LESSONS §4.7）。
// 🔴**直したら `scripts/archive/scratchpad/semantic_bug_fixed.txt` へ1行足す**＝
//   `triaged.txt` の行は「何を直したか」の履歴なので消さない。消さないと在庫が減らないので、
//   消化側をこのファイルで引き算する（**これをやらないとカウンタが永久に 433 のまま**になる）。
import fs from 'fs';

const SCRATCH = 'scripts/archive/scratchpad';
// 旧4ラウンドは段2 台帳（semanticAuditLedger.mjs）が所有＝pool と同じ除外規約
const LEDGER_ROUNDS = ['semantic_audit_101', 'semantic_audit_clean_round1', 'semantic_audit_stub_round2', 'semantic_audit_stub_round3'];
const args = process.argv.slice(2);
const wantList = args.includes('--list');
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const sevFilter = argOf('--sev');
const grepFilter = argOf('--grep');

const dirs = fs.readdirSync(SCRATCH)
  .filter(d => d.startsWith('semantic_audit') && fs.existsSync(`${SCRATCH}/${d}/triaged.txt`))
  .filter(d => !LEDGER_ROUNDS.includes(d));

/** effectId → 判定の一言（triaged.txt の第3列） */
const bug = new Map();
for (const d of dirs) {
  for (const l of fs.readFileSync(`${SCRATCH}/${d}/triaged.txt`, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [k, v, ...rest] = l.split('::');
    if ((v ?? '').trim() !== 'BUG') continue;
    bug.set(k.trim(), { note: rest.join('::').trim(), dir: d });
  }
}

/** effectId → findings.jsonl 側の severity / type（triaged.txt には入っていない） */
for (const d of dirs) {
  const p = `${SCRATCH}/${d}/findings.jsonl`;
  if (!fs.existsSync(p)) continue;
  for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    let f; try { f = JSON.parse(l); } catch { continue; }
    const k = f.effectId || f.cardNum;
    const hit = bug.get(k);
    if (hit && !hit.sev) { hit.sev = f.severity; hit.type = f.type; hit.card = f.cardNum; }
  }
}

/** 消化済み（PLAN §5.0 の表から行を消したもの）＝triaged.txt は履歴なので消さず、ここで引き算する */
const FIXED_PATH = `${SCRATCH}/semantic_bug_fixed.txt`;
const fixed = new Map();
if (fs.existsSync(FIXED_PATH)) {
  for (const l of fs.readFileSync(FIXED_PATH, 'utf8').split(/\r?\n/)) {
    if (!l.trim() || l.startsWith('#')) continue;
    const [k, , ...rest] = l.split('::');
    fixed.set(k.trim(), rest.join('::').trim());
  }
}
const showFixed = args.includes('--fixed');

const rows = [...bug.entries()]
  .filter(([id]) => showFixed ? fixed.has(id) : !fixed.has(id))
  .filter(([, m]) => !sevFilter || m.sev === sevFilter)
  .filter(([, m]) => !grepFilter || (m.note ?? '').includes(grepFilter));

if (wantList) {
  for (const [id, m] of rows) {
    console.log(`${(m.sev ?? '-').padEnd(4)}\t${(m.type ?? '-').padEnd(13)}\t${id}\t${(m.note ?? '').slice(0, 110)}`);
  }
}

const tally = (fn) => {
  const o = {};
  for (const [, m] of rows) { const k = fn(m) ?? '(不明)'; o[k] = (o[k] ?? 0) + 1; }
  return Object.entries(o).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ');
};
console.log(`[buglist] 🔥残 ${rows.length} 効果 ／ 🏁消化済み ${fixed.size} 効果 ／ BUG 確定 ${bug.size} 効果${sevFilter ? `（--sev ${sevFilter}）` : ''}${grepFilter ? `（--grep ${grepFilter}）` : ''}`);
console.log(`[buglist] 壊れ方: ${tally(m => m.type)}`);
console.log(`[buglist] 深刻度: ${tally(m => m.sev)}`);
console.log(`[buglist] シート: ${tally(m => (m.dir ?? '').replace('semantic_audit_', '').replace('_round4', ''))}`);
console.log('[buglist] ⚠これは在庫カウンタであって判定ではない＝実装時に §2.1 ② で母集団を測り直す');
