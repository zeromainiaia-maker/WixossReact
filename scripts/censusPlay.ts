// 機構踏破計器（§5.6 `C-3`・2026-09-17）＝**CPU が1戦でどの機構を何回踏んだか**。
//
// 使い方:
//   node scripts/verifyFullMatch.mjs cpu                              # CPU 通し対戦 → scratchpad-verify/playlogs-cpu.json
//   npm run census:play -- --file scratchpad-verify/playlogs-cpu.json # 表を出す
//   npm run census:play -- --file a.json --file b.json                # 複数戦を合算
//
// 🔑**§5.6 の唯一の進捗指標**。止め時①＝「未踏 0」（`pending` の機構＝CPU がまだ踏めないものは数えない）。
// ⚠規則（どのログ行をどの機構と数えるか）は `src/screens/battle/playCensus.ts` だけに置く＝golden がソースの文言と突き合わせる。
// ⚠ゲートではない（exit 0）。1戦の結果は乱数で揺れる＝**0回を即バグと読まない**（数戦を合算してから判断する）。
import { readFileSync } from 'node:fs';
import { tallyPlayMechanisms, unvisitedMechanisms } from '../src/screens/battle/playCensus';

const args = process.argv.slice(2);
const files = args.flatMap((a, i) => (a === '--file' && args[i + 1] ? [args[i + 1]] : []));
if (files.length === 0) {
  console.error('使い方: npm run census:play -- --file scratchpad-verify/playlogs-cpu.json [--file …]');
  console.error('  入力は `node scripts/verifyFullMatch.mjs cpu` が書き出す（部屋を閉じるとログは消えるため）。');
  process.exit(2);
}

const lines: string[] = [];
const matches: string[] = [];
for (const f of files) {
  const j = JSON.parse(readFileSync(f, 'utf-8')) as { logs?: string[]; turnCount?: number; globalPhase?: string } | string[];
  const logs = Array.isArray(j) ? j : (j.logs ?? []);
  lines.push(...logs);
  matches.push(Array.isArray(j) ? `${f}（${logs.length}行）` : `${f}（${j.turnCount ?? '?'}ターン・${j.globalPhase ?? '?'}・${logs.length}行）`);
}

const rows = tallyPlayMechanisms(lines);
console.log(`\n=== 機構踏破表（CPU 側・${files.length}戦）===`);
for (const m of matches) console.log(`  ${m}`);
console.log('');
const w = Math.max(...rows.map(r => r.mechanism.label.length));
for (const r of rows) {
  const mark = r.mechanism.pending ? `（未実装＝${r.mechanism.pending}）` : r.count === 0 ? '  ← 未踏' : '';
  console.log(`  ${r.mechanism.label.padEnd(w, '　')}  ${String(r.count).padStart(4)}${mark}`);
}
const unvisited = unvisitedMechanisms(rows);
const implemented = rows.filter(r => !r.mechanism.pending).length;
console.log(`\n踏破 ${implemented - unvisited.length} / ${implemented} 機構（未実装 ${rows.length - implemented}）`);
if (unvisited.length > 0) {
  console.log(`未踏: ${unvisited.map(m => m.label).join('／')}`);
  console.log('  ⚠1戦の0回は乱数で起きる＝数戦を合算してから「CPU が踏めない」と判断する。');
}
