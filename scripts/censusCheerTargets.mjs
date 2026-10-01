// チアゾーンの対象センサス（§5.3 `O-538` 段階5・2026-10-01新設）
//   実行: npm run census:cheer                                  （トレース生成 → 集計。明細 docs/_census_cheer_targets.txt）
//         node scripts/censusCheerTargets.mjs --traces <traces.json>      （生成済みのトレースを使う）
//         node scripts/censusCheerTargets.mjs --traces <…> --show <アクション型> [N]   （標本の差分を並べる）
//
// 🔑**ねらい**＝公式ルールでチアゾーンは「場」に含まれる＝**「場のシグニ」を対象にする効果で選べる**。
//   ところが対象を処理する側（バニッシュ・ダウン・バウンス …）が `field.signi.findIndex` でゾーンを探す書き方だと、
//   チアゾーンのカードは見つからず**黙って何も起きない**。この形は golden・smoke・逆翻訳のどれにも映らない
//   （例外も出ず、盤面も壊れない）＝**engine で実際に解決して比べるしかない**。
// 🔑**比べ方**＝`behaviorAudit.ts` の変種 `cheer`（最初の「場のシグニ」対象をチアゾーンへ移し、その側の他のシグニゾーンを空にする）
//   と基本盤面を同じ効果で解決し、**基本では対象（`S対象` ラベル）に変化が出るのに、チアゾーンでは出ない**効果を
//   「場のシグニ」対象のアクション型ごとに数える。
// ⚠**候補出しであって判定ではない**＝「シグニゾーンの」と書いてある効果（チアゾーンを選べないのが正しい）も同じく出る。
//   原文が「シグニゾーン」を指すかは `--show` の原文で確かめる。
// ⚠**カード保存則**（`(消滅)`／`⚠二重存在`）はチアゾーン盤面だけの違反を別に数える＝0 が正。
import fs from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const args = process.argv.slice(2);
const argOf = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };

let tracesPath = argOf('--traces');
if (!tracesPath) {
  const dir = join('node_modules', '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const idsFile = join(dir, 'cheer_ids.txt');
  const ids = new Set();
  for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
    for (const k of Object.keys(JSON.parse(fs.readFileSync(join('public/data', f), 'utf8')))) ids.add(k);
  }
  fs.writeFileSync(idsFile, [...ids].join('\n'));
  tracesPath = join(dir, 'cheer_traces.json');
  execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/tsx/dist/cli.mjs', 'scripts/behaviorAudit.ts',
    '--ids-file', idsFile, '--variants', 'base,cheer', '--json-out', tracesPath], { stdio: ['ignore', 'ignore', 'inherit'] });
}
const traces = JSON.parse(fs.readFileSync(tracesPath, 'utf8'));

// 効果ごとの「場のシグニを対象に取るアクション型」（入れ子も見る）。
const effectById = new Map();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  for (const effs of Object.values(JSON.parse(fs.readFileSync(join('public/data', f), 'utf8')))) for (const e of effs) effectById.set(e.effectId, e);
}
function signiTargetTypes(node, out = new Set()) {
  if (!node || typeof node !== 'object') return out;
  if (Array.isArray(node)) { node.forEach(n => signiTargetTypes(n, out)); return out; }
  if (typeof node.type === 'string' && node.target && node.target.type === 'SIGNI') out.add(node.type);
  for (const v of Object.values(node)) if (v && typeof v === 'object') signiTargetTypes(v, out);
  return out;
}

const runsOf = (r) => Object.values(r ?? {});
const hitsTarget = (runs) => runs.some(run => (run.diff ?? []).some(l => l.includes('S対象')));
/** 差分で変化が出た対象ラベル（`相S対象0` 等）。 */
const hitLabels = (runs) => new Set(runs.flatMap(run => (run.diff ?? []).flatMap(l => l.match(/[自相]S対象\d/g) ?? [])));
/** チアゾーン盤面でチアゾーンへ移したカードのラベル（盤面の説明から読む）。 */
const movedLabel = (board) => (board ?? []).map(b => b.match(/チアゾーン: ([自相]S対象\d)=/)?.[1]).find(Boolean) ?? null;
const violation = (runs) => runs.flatMap(run => (run.diff ?? []).filter(l => /\(消滅\)|二重存在/.test(l)));

const miss = new Map();   // アクション型 → [effectId]
const ok = new Map();
const broken = [];
let considered = 0;
for (const card of traces) {
  for (const tr of card.traces ?? []) {
    const types = [...signiTargetTypes(effectById.get(tr.effectId)?.action)];
    if (types.length === 0) continue;
    const base = runsOf(tr.runs);
    if (!hitsTarget(base)) continue;            // 基本盤面で対象に何も起きない効果は比べられない
    // ⚠**チアゾーンへ移したカードが、基本盤面で効果を受けたカードと同じときだけ比べる**＝変種は最初に見つかった対象を移すので、
    //   自分側にも対象ラベルがある効果（「このシグニとそれをバニッシュ」）では相手側の対象が動かない（初版の誤り）。
    //   変種の結果が基本と同じ（`variants.cheer` が無い）＝移した対象に何も起きなかった、と読む（盤面は違うのに結果が同じ）。
    const moved = tr.variants?.cheer ? movedLabel(tr.variants.cheer.board) : null;
    if (tr.variants?.cheer && (!moved || !hitLabels(base).has(moved))) continue;
    considered++;
    const cheer = tr.variants?.cheer ? runsOf(tr.variants.cheer.runs) : base;
    const v = tr.variants?.cheer ? violation(cheer) : [];
    if (v.length) broken.push(`${tr.effectId} :: ${v[0]}`);
    // ⚠**変種の結果が基本と同じ（`variants.cheer` が無い）＝対象にも同じことが起きた**＝OK。
    //   パワー修正・キーワード付与の差分は位置を書かないので、チアゾーンへ移しても結果の文字列は同じになる（初版はこれを取り違えた）。
    const bucket = !tr.variants?.cheer || hitsTarget(cheer) ? ok : miss;
    for (const t of types) { if (!bucket.has(t)) bucket.set(t, []); bucket.get(t).push(tr.effectId); }
  }
}

const SHOW = argOf('--show');
if (SHOW) {
  const n = parseInt(args[args.indexOf('--show') + 2] ?? '10', 10) || 10;
  for (const id of (miss.get(SHOW) ?? []).slice(0, n)) {
    const card = traces.find(c => (c.traces ?? []).some(t => t.effectId === id));
    const tr = card.traces.find(t => t.effectId === id);
    console.log(`\n■ ${id}  ${tr.abilityText ?? ''}`);
    for (const run of runsOf(tr.runs)) console.log('  基本:', (run.diff ?? []).join(' / '));
    for (const run of runsOf(tr.variants?.cheer?.runs ?? tr.runs)) console.log('  チア:', (run.diff ?? []).join(' / '), '| log:', (run.logs ?? []).slice(-2).join(' / '));
  }
  process.exit(0);
}

const sortDesc = (m) => [...m.entries()].sort((a, b) => b[1].length - a[1].length);
const lines = [];
lines.push(`# チアゾーンの対象センサス（§5.3 O-538 段階5）`);
lines.push(`比べた効果（場のシグニを対象に取り、基本盤面で対象に変化が出るもの）: ${considered}`);
lines.push(`チアゾーンでは対象に何も起きない（効果数・型の重複あり）: ${new Set([...miss.values()].flat()).size}`);
lines.push(`カード保存則の違反（チアゾーン盤面だけ）: ${broken.length}`);
lines.push('');
lines.push('## 型ごと（何も起きない / 起きた）');
const allTypes = new Set([...miss.keys(), ...ok.keys()]);
for (const t of [...allTypes].sort((a, b) => (miss.get(b)?.length ?? 0) - (miss.get(a)?.length ?? 0))) {
  lines.push(`${t}\t${miss.get(t)?.length ?? 0} / ${ok.get(t)?.length ?? 0}\t${(miss.get(t) ?? []).slice(0, 4).join(' ')}`);
}
if (broken.length) { lines.push(''); lines.push('## カード保存則の違反'); lines.push(...broken); }
fs.writeFileSync('docs/_census_cheer_targets.txt', lines.join('\n'));
console.log(lines.slice(0, 5).join('\n'));
console.log('上位の型:'); for (const [t, ids] of sortDesc(miss).slice(0, 12)) console.log(`  ${t}\t${ids.length}`);
console.log('明細 → docs/_census_cheer_targets.txt');
