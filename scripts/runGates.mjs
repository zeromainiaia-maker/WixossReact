// 全ゲート一括実行（npm run gates の実体・2026-07-07並列化）
// typecheck を先行（型が壊れていたら以降は無意味＝fail fast）→
// golden / smoke / fuzz / census / lint は互いに独立なので並列実行し、出力はバッファして順に表示する。
// どれか1つでも失敗すれば exit 1（CI と同じ判定）。
import { spawn } from 'node:child_process';

function run(name, script) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn('npm', ['run', script], { shell: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (code) => resolve({ name, code, out, sec: ((Date.now() - started) / 1000).toFixed(1) }));
  });
}

function show(r) {
  const mark = r.code === 0 ? 'PASS' : 'FAIL';
  console.log(`\n===== [${mark}] ${r.name} (${r.sec}s) =====`);
  // PASS はテール要約のみ・FAIL は全文（原因調査に必要）
  if (r.code === 0) {
    const lines = r.out.trimEnd().split(/\r?\n/);
    console.log(lines.slice(-6).join('\n'));
  } else {
    console.log(r.out);
  }
}

const t = await run('typecheck', 'typecheck');
show(t);
if (t.code !== 0) {
  console.error('\ntypecheck FAIL — 以降のゲートはスキップ');
  process.exit(1);
}

const results = await Promise.all([
  run('golden', 'golden'),
  run('smoke', 'smoke'),
  run('fuzz', 'fuzz'),
  run('census', 'census'),
  run('lint', 'lint'),
]);
for (const r of results) show(r);

const failed = results.filter((r) => r.code !== 0);
console.log(`\n===== gates 結果: ${failed.length === 0 ? '全緑 ✅' : `FAIL ${failed.length}件（${failed.map(r => r.name).join(', ')}）`} =====`);
process.exit(failed.length === 0 ? 0 : 1);
