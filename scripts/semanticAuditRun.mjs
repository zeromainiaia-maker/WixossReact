/**
 * 意味照合監査（semantic audit）: 実行ランナー
 *
 * semanticAuditExtract.mjs が生成した prompts/batch_NN.txt を claude -p（headless）に流し、
 * findings を <out>/findings.jsonl に集約する。処理済みバッチ（raw/ に出力あり）はスキップ＝再開可能。
 *
 * 使い方:
 *   node scripts/semanticAuditRun.mjs --out <抽出時と同じdir> [--model sonnet] [--batches 1,2,3]
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
const model = argOf('--model', 'sonnet');
const only = argOf('--batches', null)?.split(',').map(Number) ?? null;

const promptDir = join(outDir, 'prompts');
const rawDir = join(outDir, 'raw');
mkdirSync(rawDir, { recursive: true });

const batchFiles = readdirSync(promptDir).filter((f) => f.endsWith('.txt')).sort();
const findingsPath = join(outDir, 'findings.jsonl');

// 出力テキストから JSON を取り出す（コードフェンス・前置きに耐性）
function extractJson(text) {
  const stripped = text.replace(/```json\s*|```\s*/g, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('JSONが見つからない');
  return JSON.parse(stripped.slice(start, end + 1));
}

let totalFindings = 0;
let totalCards = 0;
for (const f of batchFiles) {
  const nn = f.match(/batch_(\d+)/)?.[1];
  if (only && !only.includes(Number(nn))) continue;
  const rawPath = join(rawDir, `batch_${nn}.json`);
  if (existsSync(rawPath)) { console.log(`batch_${nn}: 済み（スキップ）`); continue; }

  const prompt = readFileSync(join(promptDir, f), 'utf8');
  console.log(`batch_${nn}: 実行中（model=${model}, prompt=${(prompt.length / 1024).toFixed(0)}KB）...`);
  const t0 = Date.now();
  const res = spawnSync('claude', ['-p', '--model', model, '--output-format', 'json'], {
    input: prompt, encoding: 'utf8', shell: true, timeout: 600000, maxBuffer: 64 * 1024 * 1024,
  });
  const sec = ((Date.now() - t0) / 1000).toFixed(0);
  if (res.status !== 0 || !res.stdout) {
    console.error(`batch_${nn}: 失敗 (exit=${res.status}, ${sec}s)\n${(res.stderr || '').slice(0, 800)}\n${(res.stdout || '').slice(0, 800)}`);
    if ((res.stdout || '').includes('session limit') || (res.stdout || '').includes('429')) {
      console.error('セッション上限（429）を検出＝以降のバッチを中断。上限リセット後に同コマンドで再開可（済みバッチはスキップされる）。');
      break;
    }
    continue;
  }
  writeFileSync(rawPath, res.stdout);

  try {
    const outer = JSON.parse(res.stdout);
    const inner = extractJson(outer.result ?? '');
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
console.log(`\n合計: ${totalCards}枚 / findings ${totalFindings}件 → ${findingsPath}`);
