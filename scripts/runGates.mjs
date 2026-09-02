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
  // A群（実装の穴）の🔴側＝「engine に消費が無く DEFERRED_ でもない STUB」が 0 になった（続き427）ので
  // ゲートに載せる。新しい STUB を足して消費地点を書き忘れたらここで止まる。
  run('census-stubs', 'census:stubs'),
  run('manual-fields', 'check:manual-fields'),
  // 🆕§5.3 `O-60`（2026-08-26）＝engine が「効果元のカード全文」を regex で読む箇所の ratchet。
  // 増えたら exit 1（新しいハンドラで全文 regex を書いた）／減っても exit 1（基準の下げ忘れ）。
  run('census-enginetext', 'census:enginetext'),
  // 🆕§5.3 `O-86`（2026-09-02）＝**UI コスト層**が「カード原文」を regex で読んで実効コストを決める箇所の ratchet。
  // ⚠`census:enginetext` は `src/engine/` しか走査しないので**この層は1行も映らない**（別計器が要る理由）。
  // 増えたら exit 1（UI 層で新しく原文 regex を書いた＝payload 化と逆）／減っても exit 1（基準の下げ忘れ）。
  run('census-costtext', 'census:costtext'),
  run('lint', 'lint'),
]);
for (const r of results) show(r);

const failed = results.filter((r) => r.code !== 0);
console.log(`\n===== gates 結果: ${failed.length === 0 ? '全緑 ✅' : `FAIL ${failed.length}件（${failed.map(r => r.name).join(', ')}）`} =====`);
process.exit(failed.length === 0 ? 0 : 1);
