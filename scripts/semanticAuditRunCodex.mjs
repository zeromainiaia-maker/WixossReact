/**
 * 意味照合監査（semantic audit）: 実行ランナー（Codex CLI版）
 *
 * semanticAuditExtract.mjs が生成した prompts/batch_NN.txt を
 * `codex exec`（ChatGPT無料プラン・OpenAI Codex CLI）に流し、
 * findings を <out>/findings.jsonl に集約する。
 *
 * raw/batch_NN.json の存在チェックで処理済みバッチをスキップする規約は
 * semanticAuditRun.mjs（claude -p 版）と共有＝同一 --out ディレクトリを
 * 両ランナーで安全に分担できる。
 *
 * 使い方:
 *   node scripts/semanticAuditRunCodex.mjs --out <抽出時と同じdir> [--batches 1,2,3]
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, appendFileSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);
function argOf(name, dflt) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dflt;
}
const outDir = argOf('--out', null);
if (!outDir) { console.error('--out <dir> は必須'); process.exit(1); }
const only = argOf('--batches', null)?.split(',').map(Number) ?? null;

const promptDir = join(outDir, 'prompts');
const rawDir = join(outDir, 'raw');
mkdirSync(rawDir, { recursive: true });

const batchFiles = readdirSync(promptDir).filter((f) => f.endsWith('.txt')).sort();
const findingsPath = join(outDir, 'findings.jsonl');

function extractJson(text) {
  const stripped = text.replace(/```json\s*|```\s*/g, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSONが見つからない');
  return JSON.parse(stripped.slice(start, end + 1));
}

const MAX_CONSECUTIVE_FAILURES = Number(argOf('--max-consecutive-failures', '5'));
let totalFindings = 0;
let totalCards = 0;
let failed = 0;
let consecutiveFailures = 0;
for (const f of batchFiles) {
  const nn = f.match(/batch_(\d+)/)?.[1];
  if (only && !only.includes(Number(nn))) continue;
  const rawPath = join(rawDir, `batch_${nn}.json`);
  if (existsSync(rawPath)) { console.log(`batch_${nn}: 済み（スキップ）`); continue; }

  const prompt = readFileSync(join(promptDir, f), 'utf8');
  const lastMsgPath = join(rawDir, `batch_${nn}_last.txt`);
  console.log(`batch_${nn}: 実行中（codex exec, prompt=${(prompt.length / 1024).toFixed(0)}KB）...`);
  const t0 = Date.now();
  const res = spawnSync('codex', ['exec', '--json', '--skip-git-repo-check', '-o', lastMsgPath], {
    input: prompt, encoding: 'utf8', shell: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024,
  });
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  if (res.status !== 0 || !existsSync(lastMsgPath)) {
    console.error(`batch_${nn}: 失敗 (exit=${res.status}, ${sec}s)\n${(res.stderr || '').slice(0, 800)}`);
    failed++;
    consecutiveFailures++;
    // 単発の失敗は継続するが、N連続失敗＝無料枠の使用量上限やログイン切れ等の恒久的なブロックとみなし早期停止する
    // （skip規約により、未生成の raw/batch_NN.json は次回同コマンドで自動的に再試行される＝再開は安全）
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.error(`\n⚠${MAX_CONSECUTIVE_FAILURES}連続失敗を検知＝使用量上限またはログイン切れの可能性が高いため停止します。上限リセット後に同じコマンドで再開してください（済みバッチは自動スキップ）。`);
      break;
    }
    continue;
  }
  consecutiveFailures = 0;

  const lastMsg = readFileSync(lastMsgPath, 'utf8');
  writeFileSync(rawPath, JSON.stringify({ result: lastMsg }));

  try {
    const inner = extractJson(lastMsg);
    const results = inner.results ?? [];
    totalCards += results.length;
    let n = 0;
    for (const r of results) {
      for (const fd of r.findings ?? []) {
        appendFileSync(findingsPath, JSON.stringify({ batch: nn, cardNum: r.cardNum, ...fd }) + '\n');
        n++;
      }
    }
    totalFindings += n;
    console.log(`batch_${nn}: 完了 ${sec}s — ${results.length}枚中 findings ${n}件`);
  } catch (e) {
    console.error(`batch_${nn}: 出力パース失敗（raw は保存済み）: ${e.message}`);
  }
}
console.log(`\n合計: ${totalCards}枚 / findings ${totalFindings}件 / 失敗 ${failed}バッチ → ${findingsPath}`);
