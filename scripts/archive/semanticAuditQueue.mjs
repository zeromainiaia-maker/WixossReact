// 実装キュー（PLAN §5.0）から Codex 委譲バッチの候補を組む（2026-09-10 新設・第246〜）
//
// 🔴**なぜ要るか**＝第238〜245 の8バッチは、候補の組み立てを**セッションのスクラッチにしか置いていなかった**。
//   その結果 ①セッションが変わるたびに書き直し ②除外の記憶が消えて**同じ候補が復活**した
//   （第243 の候補生成で、第233〜237 に除外した12効果がまるごと戻ってきた実績）。
//   ⇒ 候補の作り方そのものをリポジトリへ置く。
//
// 使い方:
//   node scripts/archive/semanticAuditQueue.mjs                    … 残数と優先度内訳だけ出す
//   node scripts/archive/semanticAuditQueue.mjs --take 30          … 先頭30件を出力（`--out` 省略時は標準出力へ id のみ）
//   node scripts/archive/semanticAuditQueue.mjs --take 30 --out <dir>
//        … <dir>/batch.json（原文・live JSON つき）と <dir>/batch_table.md（指示書に貼る表）を書く
//   node scripts/archive/semanticAuditQueue.mjs --id <effectId>    … 1件の内訳（判定文・原文・live JSON）
//
// 母集団の作り方（3つのファイルの引き算だけ。**scratchpad の外部状態に依存しない**）:
//   ① `scripts/archive/scratchpad/semantic_audit_*_round4/triaged.txt` の `:: BUG ::` 行 ＝ 確定433効果
//   ② − `semantic_bug_fixed.txt`    ＝ 直した分（在庫カウンタからも引く）
//   ③ − `semantic_bug_deferred.txt` ＝ **直さないと判定した分**（在庫からは引かない・候補からだけ外す）
//
// 🔴**除外条件①「triage が `.ts:行番号` を引用しているものは機構待ち」は 2026-09-09 に撤回した。**
//   その条件で **83効果が第238〜243 の6バッチすべてから除外され続けていた**。中身を読むと、
//   引用の多くは「**受け皿がここに在る**」という意味で、第238 で自力実装したのと同じ
//   「受け皿は実在・限定が落ちている」型だった（撤回後の第244 は density 70%）。
//   ⇒ **引用の有無で機械的に落とさない。** 優先度づけ（下の score）に使うだけにする。
//
// 優先度（`pri`）＝**取る順**であって除外ではない:
//   0 … 判定文が「受け皿は実在／実装済み／〜に在る」と明言（いちばん安い）
//   1 … どちらとも書いていない（大半。第244〜245 の採用はここが主体）
//   2 … 判定文が「受け皿が無い／新設／機構」と明言（最後に見る）
import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRATCH = join(root, 'scripts', 'archive', 'scratchpad');
const argv = process.argv.slice(2);
const argOf = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? (argv[i + 1] ?? '') : '';
};

const idsFrom = (file, pick) => {
  const path = join(SCRATCH, file);
  if (!existsSync(path)) return new Set();
  return new Set(
    readFileSync(path, 'utf8').split('\n')
      .filter(l => l && !l.startsWith('#') && l.includes(' :: '))
      .map(pick)
      .filter(Boolean),
  );
};
const fixed = idsFrom('semantic_bug_fixed.txt', l => l.split(' :: ')[0].trim());
const deferred = idsFrom('semantic_bug_deferred.txt', l => l.split(' :: ')[0].trim());

// ── ① triaged.txt の `:: BUG ::` 行（＝確定バグ）──
const triaged = [];
for (const dir of readdirSync(SCRATCH).filter(d => d.startsWith('semantic_audit_') && d.endsWith('_round4'))) {
  const file = join(SCRATCH, dir, 'triaged.txt');
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^(\S+) :: BUG :: (.*)$/);
    if (m) triaged.push({ id: m[1], desc: m[2].trim(), src: dir });
  }
}

// ── ②③ 引き算 ──
const remaining = triaged.filter(e => !fixed.has(e.id));            // 在庫（PLAN §5.0 の残数と一致する）
const pool = remaining.filter(e => !deferred.has(e.id));            // 候補プール

// ⚠**判定文は数週間前のスナップショット**＝この score は「読む順」を決めるだけで、
//   着手時に必ず現在の live と原文で確かめること（stale が常に混ざる）。
const score = (desc) => {
  if (/受け皿(は)?(実在|在る|ある)|実装済み|稼働中|使用中|に在る|名指し/.test(desc)) return 0;
  if (/受け皿が無い|存在しない|未実装|機構|新設|carrier|pool/.test(desc)) return 2;
  return 1;
};
pool.forEach(e => { e.pri = score(e.desc); });
pool.sort((a, b) => a.pri - b.pri);

// ── live JSON と原文を添える（指示書の表に必要）──
const srctext = JSON.parse(readFileSync(join(root, 'docs', '_effect_srctext.json'), 'utf8'));
const live = new Map();
for (const f of readdirSync(join(root, 'public', 'data')).filter(x => /^effects_.*\.json$/.test(x))) {
  const data = JSON.parse(readFileSync(join(root, 'public', 'data', f), 'utf8'));
  for (const cardNum of Object.keys(data)) {
    for (const eff of data[cardNum] ?? []) live.set(eff.effectId, { cardNum, file: f, effect: eff });
  }
}
const enrich = (e) => {
  const hit = live.get(e.id);
  return {
    id: e.id, desc: e.desc, pri: e.pri, src: e.src,
    cardNum: hit?.cardNum ?? null,
    file: hit?.file ?? null,
    parseStatus: hit?.effect?.parseStatus ?? null,
    srctext: srctext[e.id] ?? null,
    json: hit ? JSON.stringify(hit.effect) : null,   // null＝`GRANT_*` の abilities[] に入れ子の可能性
  };
};

// ── --id：1件の内訳 ──
const single = argOf('--id');
if (single) {
  const hit = triaged.find(e => e.id === single);
  if (!hit) { console.error(`${single}: triaged.txt に BUG 行が無い`); process.exit(1); }
  const st = fixed.has(single) ? '消化済み' : deferred.has(single) ? '除外リスト入り' : '候補';
  const e = enrich({ ...hit, pri: score(hit.desc) });
  console.log(`## ${single}  [${st}]  pri=${e.pri}  ${e.file ?? '(live に無し)'}`);
  console.log(`原文  : ${e.srctext ?? '(なし)'}`);
  console.log(`判定  : ${e.desc}`);
  console.log(`live  : ${e.json ?? '(live に無し＝GRANT_* の入れ子を grep で探す)'}`);
  process.exit(0);
}

const byPri = pool.reduce((acc, e) => { acc[e.pri] = (acc[e.pri] ?? 0) + 1; return acc; }, {});
console.log(`[queue] 確定 ${triaged.length} ／ 消化済み ${fixed.size} ／ 🔥残 ${remaining.length}`);
console.log(`[queue] 除外リスト ${deferred.size}（機構待ち・既修正・偽陽性＝在庫からは引かない）`);
console.log(`[queue] 🔥候補プール ${pool.length}　優先度: ${JSON.stringify(byPri)}（0=受け皿明記 / 1=中間 / 2=機構の疑い）`);

const take = Number.parseInt(argOf('--take') || '0', 10);
if (!take) {
  console.log('[queue] --take <N> で先頭N件、--out <dir> で batch.json と batch_table.md を書く');
  process.exit(0);
}
// 🔑pri=2（機構の疑い）は既定で外す＝入れると Codex が「見送り」を書くだけでトークンを使う。
const batch = pool.filter(e => e.pri < 2).slice(0, take).map(enrich);
const outDir = argOf('--out');
if (!outDir) { batch.forEach(e => console.log(`  ${e.id}  ${e.desc.slice(0, 80)}`)); process.exit(0); }

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'batch.json'), JSON.stringify(batch, null, 1));
const esc = (s) => (s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
let table = '| effectId | 原文 | 現在の live JSON | triage 判定（engine の行番号は**受け皿の在処**を指していることが多い） |\n|---|---|---|---|\n';
for (const e of batch) {
  const json = e.json
    ? `\`${esc(e.json)}\``
    : `**live に無し**（\`grep -rn "${e.id}" public/data/*.json\` で親効果を探すこと）`;
  table += `| \`${e.id}\` | ${esc(e.srctext)} | ${json} | ${esc(e.desc)} |\n`;
}
writeFileSync(join(outDir, 'batch_table.md'), table);
console.log(`[queue] ${batch.length}件 → ${join(outDir, 'batch.json')} / batch_table.md`);
