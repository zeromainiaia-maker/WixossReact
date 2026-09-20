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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tallyPlayMechanisms, unvisitedMechanisms } from '../src/screens/battle/playCensus';

const args = process.argv.slice(2);
const arg = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
// 🆕§5.7 `S-23`（2026-09-20）＝**自己対戦のログをまとめて読む**（`headlessSelfPlay.ts --logs-out <dir>` の出力）。
//   ⚠`--grep` はファイル名（`<山A>_vs_<山B>_s<seed>_a.json`）への部分一致＝**山ごとの踏破**を出すのに使う。
const dir = arg('--dir');
const grep = arg('--grep');
const files = [
  ...args.flatMap((a, i) => (a === '--file' && args[i + 1] ? [args[i + 1]] : [])),
  ...(dir ? readdirSync(dir).filter(f => f.endsWith('.json') && (!grep || f.includes(grep))).map(f => join(dir, f)) : []),
];
if (files.length === 0) {
  console.error('使い方: npm run census:play -- --file scratchpad-verify/playlogs-cpu.json [--file …]');
  console.error('        npm run census:play -- --dir <自己対戦の --logs-out で書いた dir> [--grep <山の名前>]');
  console.error('  入力は `node scripts/verifyFullMatch.mjs cpu`（実機）か `headlessSelfPlay.ts --logs-out`（自己対戦）が書き出す。');
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
// ⚠**戦数が多いときは明細を畳む**（自己対戦は1組で十数戦になる）。
if (matches.length <= 8) for (const m of matches) console.log(`  ${m}`);
else console.log(`  ${matches.length}ファイル・計 ${lines.length}行（明細は省略）`);
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
