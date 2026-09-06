// 意味照合 findings プールの残数計器（2026-09-06新設・PLAN §5.0 の Opus レーンの唯一のカウンタ）
//
// なぜ要るか＝PLAN の worklist は「残り件数」を手で書くと必ず腐る（このリポジトリの最頻の事故）。
// Opus レーン（＝判定が要る作業）の残量は「まだ triage していない finding の数」なので、それを機械で数える。
//
//   node scripts/archive/semanticAuditPool.mjs           … 残数サマリ
//   node scripts/archive/semanticAuditPool.mjs --list    … 未 triage の finding を1行ずつ
//   node scripts/archive/semanticAuditPool.mjs --grep    … grep 句を持つ finding（＝型候補）だけ
//
// triage 済みの記録＝各ラウンドdirの triaged.txt に「<effectId または cardNum> :: <BUG|FP> :: 一言」を1行ずつ。
// ⚠この計器は「判定」ではなく「残量」しか出さない。真バグかどうかは engine の受け皿を読んで決める。
import fs from 'fs';

const SCRATCH = 'scripts/archive/scratchpad';
const wantList = process.argv.includes('--list');
const grepOnly = process.argv.includes('--grep');

// 🔴旧4ラウンドは段0/段1/段2 の台帳（semanticAuditLedger.mjs）が所有しており、残 OPEN はそちらが正（2026-09-06 実測 24件）。
// この計器が数えるのは【台帳が見ていないラウンド＝round4 以降】だけ。両方を足すと二重計上になる。
const LEDGER_ROUNDS = ['semantic_audit_101', 'semantic_audit_clean_round1', 'semantic_audit_stub_round2', 'semantic_audit_stub_round3'];
const includeAll = process.argv.includes('--all');
const rounds = fs.readdirSync(SCRATCH)
  .filter(d => d.startsWith('semantic_audit') && fs.existsSync(`${SCRATCH}/${d}/findings.jsonl`))
  .filter(d => includeAll || !LEDGER_ROUNDS.includes(d));

let total = 0, open = 0, sev = { HIGH: 0, MED: 0, LOW: 0 }, withGrep = 0;
const rows = [];
for (const d of rounds) {
  const base = `${SCRATCH}/${d}`;
  const done = new Set();
  if (fs.existsSync(`${base}/triaged.txt`)) {
    for (const l of fs.readFileSync(`${base}/triaged.txt`, 'utf8').split('\n')) {
      const k = l.split('::')[0].trim();
      if (k && !k.startsWith('#')) done.add(k);
    }
  }
  for (const l of fs.readFileSync(`${base}/findings.jsonl`, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    let f; try { f = JSON.parse(l); } catch { continue; }
    total++;
    const key = f.effectId || f.cardNum;
    if (done.has(key) || done.has(f.cardNum)) continue;
    if (grepOnly && !f.grep) continue;
    open++;
    sev[f.severity] = (sev[f.severity] ?? 0) + 1;
    if (f.grep) withGrep++;
    rows.push(`${d}\t${key}\t${f.severity}\t${f.grep ? `grep=${f.grep}` : '-'}\t${(f.claim || '').slice(0, 60)}`);
  }
}

if (wantList || grepOnly) rows.forEach(r => console.log(r));
console.log(`[pool] ラウンド ${rounds.length}／findings 総数 ${total}／🔥未 triage ${open}（HIGH ${sev.HIGH ?? 0} / MED ${sev.MED ?? 0} / LOW ${sev.LOW ?? 0}）`);
console.log(`[pool] うち grep 句あり（＝型候補＝1件が系統に化ける可能性）: ${withGrep}`);
console.log(`[pool] triage したら各ラウンドdirの triaged.txt へ「<effectId> :: BUG|FP :: 一言」を追記する（PLAN §5.0）`);
