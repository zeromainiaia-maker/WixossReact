// build:effects 収穫マージの「温存（要レビュー）」を系統別に一括レビュー/採用するツール（2026-07-04 続き23）
//
// 収穫マージは「証明可能に無損失（純粋上位集合）」だけを自動採用する。CONDITIONAL ラップ等の
// 構造変更（＝census 条件節バッチの主産物）は必ず held に落ちるため、ここで
// 「diff署名（追加/削除された type 集合）」でグループ化 → 署名単位で数枚 spot-check → ID一括採用する。
// これにより census 消化の作業単位を「カード」から「文型（署名）」へ圧縮する（PLAN.md §5c）。
//
// 使い方:
//   node scripts/heldReview.mjs                     … レビュー表を docs/_held_review.txt へ出力
//   node scripts/heldReview.mjs --adopt ID1,ID2,…   … 指定カードの fresh を effects_*.json に採用
//   node scripts/heldReview.mjs --adopt-sig "署名"  … その署名グループ全カードを一括採用
// 採用後は必ず npm run gates（typecheck/golden/smoke/fuzz/census/lint 一括）を回す（§3ワークフロー）。
// 前提: 直前に npm run build:effects を実行済み（docs/_held_fresh.json が最新であること）。
//   → 2026-07-07 から mtime で自動検査する（parser ソース/CSV が _held_fresh.json より新しければ
//     エラーで停止＝続き31の stale-held 誤読の再発防止。意図的に無視する場合のみ --stale-ok）。
//   → fresh == curated（採用済み）のエントリは自動的にレビュー対象から除外して件数を表示する。
import { readFileSync, writeFileSync, readdirSync, existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(root, 'public', 'data');
const HELD_PATH = join(root, 'docs', '_held_fresh.json');
const OUT_PATH = join(root, 'docs', '_held_review.txt');

if (!existsSync(HELD_PATH)) {
  console.error('docs/_held_fresh.json が無い。先に npm run build:effects を実行する。');
  process.exit(1);
}

// ── staleness ガード（続き31の罠対策）──
// _held_fresh.json は parser ソース・CSV から build:effects で生成される。生成後に
// parser/CSV が変わると diff 表示も採用内容も古いまま＝誤採用の原因。mtime で検出する。
// 意図的に古い held を使う場合のみ --stale-ok で無視できる。
if (!process.argv.includes('--stale-ok')) {
  const heldM = statSync(HELD_PATH).mtimeMs;
  const stale = [];
  const check = (dir, re) => {
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir)) {
      if (re.test(f) && statSync(join(dir, f)).mtimeMs > heldM) stale.push(join(dir, f));
    }
  };
  check(join(root, 'src', 'data'), /\.ts$/);          // effectParser*.ts ほか parser ソース
  check(DATA_DIR, /^CardData_.*\.csv$/);              // 原文 CSV
  if (statSync(join(root, 'scripts', 'buildEffectsJson.ts')).mtimeMs > heldM) stale.push('scripts/buildEffectsJson.ts');
  if (stale.length) {
    console.error('⚠ docs/_held_fresh.json が古い（生成後に以下が更新されている）。先に npm run build:effects を実行する。無視する場合は --stale-ok。');
    for (const f of stale.slice(0, 10)) console.error('  - ' + f);
    process.exit(1);
  }
}

const heldFresh = JSON.parse(readFileSync(HELD_PATH, 'utf-8'));

const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const fileOf = new Map();   // cardNum -> file name
const existing = new Map(); // cardNum -> effects
for (const f of EFFECT_FILES) {
  const j = JSON.parse(readFileSync(join(DATA_DIR, f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) { fileOf.set(id, f); existing.set(id, effs); }
}

// 原文（効果+LB・（…）注釈除去）＝レビュー時の照合用
const texts = new Map();
for (const f of readdirSync(DATA_DIR).filter(f => f.startsWith('CardData_') && f.endsWith('.csv')).sort()) {
  for (const line of readFileSync(join(DATA_DIR, f), 'utf-8').split('\n')) {
    const cols = line.split(',');
    const id = cols[0];
    if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
    const t = cols.slice(18).join(',').replace(/（[^）]*）/g, '');
    texts.set(id, (texts.get(id) ?? '') + t);
  }
}

// ---- diff署名: 新旧 JSON の "type":"X" トークン数の増減 ＝ 系統グルーピングのキー ----
const typeCounts = s => {
  const m = new Map();
  for (const t of s.matchAll(/"type":"([A-Z_]+)"/g)) m.set(t[1], (m.get(t[1]) ?? 0) + 1);
  return m;
};
const signature = (oldS, newS) => {
  const a = typeCounts(oldS), b = typeCounts(newS);
  const parts = [];
  for (const k of new Set([...a.keys(), ...b.keys()])) {
    const d = (b.get(k) ?? 0) - (a.get(k) ?? 0);
    if (d > 0) parts.push(`+${k}${d > 1 ? '×' + d : ''}`);
    else if (d < 0) parts.push(`-${k}${d < -1 ? '×' + -d : ''}`);
  }
  return parts.sort().join(' ') || '（type増減なし＝値/構造変更）';
};

// ---- leaf diff（spot-check 表示用）----
const leafMap = (o, pre = '', out = new Map()) => {
  if (Array.isArray(o)) o.forEach((v, i) => leafMap(v, `${pre}[${i}]`, out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) leafMap(o[k], `${pre}.${k}`, out);
  else out.set(pre, o);
  return out;
};
const leafDiff = (oldE, newE, limit = 12) => {
  const a = leafMap(oldE), b = leafMap(newE);
  const lines = [];
  for (const [p, v] of a) if (!b.has(p)) lines.push(`  - ${p} = ${JSON.stringify(v)}`);
  for (const [p, v] of b) {
    if (!a.has(p)) lines.push(`  + ${p} = ${JSON.stringify(v)}`);
    else if (JSON.stringify(a.get(p)) !== JSON.stringify(v)) lines.push(`  ~ ${p} : ${JSON.stringify(a.get(p))} → ${JSON.stringify(v)}`);
  }
  return lines.length > limit ? [...lines.slice(0, limit), `  …（他 ${lines.length - limit} 行）`] : lines;
};

// ---- グループ構築 ----
const groups = new Map(); // sig -> ids[]
let alreadyAdopted = 0;   // fresh == curated ＝採用済み（stale held の残骸）はレビュー対象から外す
for (const id of Object.keys(heldFresh)) {
  const ex = existing.get(id);
  if (!ex) continue;
  const exS = JSON.stringify(ex), frS = JSON.stringify(heldFresh[id]);
  if (exS === frS) { alreadyAdopted++; continue; }
  const sig = signature(exS, frS);
  if (!groups.has(sig)) groups.set(sig, []);
  groups.get(sig).push(id);
}
if (alreadyAdopted) console.log(`（curated と一致＝採用済み ${alreadyAdopted}枚をレビュー対象から除外）`);
const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);

// ---- --adopt / --adopt-sig ----
const argIdx = process.argv.findIndex(a => a === '--adopt' || a === '--adopt-sig');
if (argIdx >= 0) {
  const mode = process.argv[argIdx];
  const arg = process.argv[argIdx + 1];
  if (!arg) { console.error(`${mode} の引数が無い。`); process.exit(1); }
  const ids = mode === '--adopt'
    ? arg.split(',').map(s => s.trim()).filter(Boolean)
    : (groups.get(arg) ?? []);
  if (!ids.length) { console.error('対象カードが無い（署名の綴りは docs/_held_review.txt からコピーする）。'); process.exit(1); }
  const missing = ids.filter(id => !heldFresh[id]);
  if (missing.length) { console.error(`held に無いID: ${missing.join(', ')}（build:effects 後に held から外れた可能性）`); process.exit(1); }
  const byFile = new Map();
  for (const id of ids) {
    const f = fileOf.get(id);
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(id);
  }
  for (const [f, fids] of byFile) {
    const p = join(DATA_DIR, f);
    const j = JSON.parse(readFileSync(p, 'utf-8'));
    for (const id of fids) j[id] = heldFresh[id];
    writeFileSync(p, JSON.stringify(j), 'utf-8');
    console.log(`${f}: ${fids.length}枚 採用（${fids.join(', ')}）`);
  }
  console.log(`\n計 ${ids.length}枚 採用。ゲートを回す: npm run typecheck && npm run golden && npm run smoke && npm run fuzz && npm run census`);
  process.exit(0);
}

// ---- レビュー表出力 ----
const out = [
  '# held（温存＝要レビュー）一括レビュー表（diff署名グループ・枚数順）',
  '# 生成: node scripts/heldReview.mjs（前提: 直前に npm run build:effects）',
  '# 採用: node scripts/heldReview.mjs --adopt ID1,ID2,… ／ グループごと: --adopt-sig "署名"',
  '# 各グループ先頭3枚に 原文＋leaf diff を表示＝spot-check してから署名単位で採用する',
  '',
];
for (const [sig, ids] of sorted) {
  ids.sort();
  out.push(`## ${sig} ［${ids.length}枚］`);
  out.push(ids.join(' '));
  for (const id of ids.slice(0, 3)) {
    out.push(`--- ${id}`);
    out.push(`  原文: ${(texts.get(id) ?? '').slice(0, 180)}`);
    out.push(...leafDiff(existing.get(id), heldFresh[id]));
  }
  out.push('');
}
writeFileSync(OUT_PATH, out.join('\n') + '\n', 'utf-8');
console.log(`held ${Object.keys(heldFresh).length}枚 → 署名グループ ${sorted.length}件`);
for (const [sig, ids] of sorted.slice(0, 20)) console.log(String(ids.length).padStart(4), sig);
console.log(`\nレビュー表: docs/_held_review.txt`);
