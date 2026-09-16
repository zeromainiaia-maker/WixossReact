// 実行結果の不変条件センサス（§5.2 round6 R6-1・2026-09-16新設）
//   実行: npm run census:traceinv                       （トレース生成 → 集計。明細 docs/_census_trace_invariants.txt）
//         node scripts/censusTraceInvariants.mjs --traces <traces.json>          （生成済みのトレースを使う）
//         node scripts/censusTraceInvariants.mjs --traces <…> --show I3 20 [--offset N]   （標本を原文つきで出す）
//
// 🔴**ねらい**＝`behaviorAudit.ts --json-out` の実行結果（全カード × 盤面の変種 × 断る/受ける）を読み、
//   **原文を解釈しなくても機械で言える食い違い**を全数で出す。LLM は使わない。
//   round6 の再現率の回で「場が満杯だとカードが消える」（`O-524`・132効果）を LLM より先にトレースの走査だけで全数取れたことが出発点。
//
// 5本の不変条件（効果単位で数える。1効果が複数の変種・run で当たっても1件）
//   I1 カード保存則＝盤面差分に「(消滅)」か「⚠二重存在」がある。**0 が正**（ラチェット＝増えたら exit 1）。
//   I2 任意の不履行＝能力ブロックに「てもよい」があるのに、断る／受けるの結果が同じ（run が both）で盤面差分が非空。
//   I3 失敗・辞退後の後続＝能力ブロックに「そうした場合」があり、「しない」を選んだ run か失敗ログのある run で盤面差分が非空。
//   I4 ログと差分の枚数不一致＝「N枚ドロー」「エナチャージN」「デッキ上からN枚をトラッシュ」のログの合計と、対応する移動の件数が違う。
//   I5 側跨ぎ＝能力ブロックに「対戦相手」が無いのに、相手側の領域・状態が動いた。
//
// ⚠🔴**I2〜I5 は候補出しであって判定ではない**＝精度は標本を判定して `round6/TYPE_LEDGER.md` に書く。件数をバグ数と読まない。
// ⚠**トレースはハーネスの盤面**（汎用盤面と4変種）＝「その盤面で踏んだ経路」しか映らない。0件は「壊れていない」ではない。
import fs from 'fs';
import { execFileSync } from 'child_process';
import { join } from 'path';

const args = process.argv.slice(2);
const argOf = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const showId = argOf('--show');
const showN = showId ? Number(args[args.indexOf('--show') + 2] ?? 20) || 20 : 0;
const offset = Number(argOf('--offset') ?? 0);

// 🔑ラチェット＝I1 だけ（精度 100%＝盤面から消える/増えるのは原文を問わず壊れている）。
//   I2〜I5 は精度を測ってから足す。
const BASELINE = { I1: 0 };

let tracesPath = argOf('--traces');
if (!tracesPath) {
  // 全カードのトレースを生成（約2分）。置き場は gitignore 圏内。
  const dir = join('node_modules', '.tmp');
  fs.mkdirSync(dir, { recursive: true });
  const idsFile = join(dir, 'traceinv_ids.txt');
  const ids = new Set();
  for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
    for (const k of Object.keys(JSON.parse(fs.readFileSync(join('public/data', f), 'utf8')))) ids.add(k);
  }
  fs.writeFileSync(idsFile, [...ids].join('\n'));
  tracesPath = join(dir, 'traceinv_traces.json');
  execFileSync(process.execPath, ['--max-old-space-size=8192', 'node_modules/tsx/dist/cli.mjs', 'scripts/behaviorAudit.ts',
    '--ids-file', idsFile, '--json-out', tracesPath], { stdio: ['ignore', 'ignore', 'inherit'] });
}
const traces = JSON.parse(fs.readFileSync(tracesPath, 'utf8'));

/** 1効果の全 run を [変種/run名, run] で平らにする */
function runsOf(tr) {
  const out = [];
  const sets = [['base', tr.runs], ...Object.entries(tr.variants ?? {}).map(([k, v]) => [k, v.runs])];
  for (const [v, runs] of sets) for (const [k, r] of Object.entries(runs)) out.push([`${v}/${k}`, r]);
  return out;
}
const isMove = (l) => / → /.test(l) && !/^[自相](状態|制限)/.test(l) && !/: 状態\[|: 付与\[|: パワー|: レベル/.test(l);
// ⚠「」の中（付与した能力の文面）と「不可解」（カード名）は失敗ではない＝標本20件で4件がこれだった。
const FAIL_WORDS = /なし|できない|不可|スキップ|足りない|未達/;
const isFailLog = (l) => FAIL_WORDS.test(l.replace(/「[^」]*」/g, '').replace(/不可解/g, ''));
const SKIP_PICK = /→ 「(しない|スキップ|skip)[^」]*」/i;

const hits = { I1: [], I2: [], I3: [], I4: [], I5: [] };
let effects = 0;
for (const card of traces) for (const tr of card.traces) {
  effects++;
  const text = tr.abilityText ?? '';
  const runs = runsOf(tr);
  const add = (id, where, evidence) => { if (!hits[id].some(h => h.effectId === tr.effectId)) hits[id].push({ effectId: tr.effectId, where, evidence, text }); };

  for (const [where, r] of runs) {
    // I1
    const i1 = r.diff.filter(l => l.includes('(消滅)') || l.includes('⚠二重存在'));
    if (i1.length) add('I1', where, i1.join(' ; '));

    // I2
    if (/てもよい/.test(text) && where.endsWith('/both') && r.diff.length && !r.choices.some(c => c.startsWith('選択肢['))) {
      add('I2', where, `選択肢なし・差分: ${r.diff.slice(0, 3).join(' ; ')}`);
    }

    // I3
    if (/そうした場合/.test(text) && r.diff.length) {
      const declined = where.endsWith('/decline') && r.choices.some(c => SKIP_PICK.test(c));
      const failed = r.logs.some(isFailLog);
      if (declined || failed) add('I3', where, `${declined ? '辞退' : '失敗ログ「' + r.logs.find(isFailLog) + '」'}・差分: ${r.diff.slice(0, 3).join(' ; ')}`);
    }

    // I4
    const logged = (re) => r.logs.reduce((a, l) => { const m = re.exec(l); return a + (m ? Number(m[1]) : 0); }, 0);
    const moved = (re) => r.diff.filter(l => isMove(l) && re.test(l)).length;
    const checks = [
      ['ドロー', logged(/^(\d+)枚ドロー/), moved(/デッキ\[\d+\] → [自相]手札/)],
      ['エナチャージ', logged(/^エナチャージ(\d+)/), moved(/デッキ\[\d+\] → [自相]エナ/)],
      ['ミル', logged(/^デッキ(?:上|の一番下)から(\d+)枚をトラッシュに置いた/), moved(/デッキ\[\d+\] → [自相]トラッシュ/)],
    ];
    for (const [name, l, m] of checks) {
      if (l > 0 && l !== m && r.status === 'OK') add('I4', where, `${name}: ログ${l}枚／移動${m}件`);
    }

    // I5
    if (!/対戦相手|各プレイヤー|すべてのプレイヤー|両プレイヤー/.test(text)) {
      const opp = r.diff.filter(l => (isMove(l) && / → 相/.test(l)) || (isMove(l) && /: 相/.test(l)) || /^相(状態|制限|コイン)/.test(l) || /^相S[^:]*: (パワー|レベル|状態|付与)/.test(l));
      if (opp.length) add('I5', where, opp.slice(0, 3).join(' ; '));
    }
  }
}

const src = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));
const lines = [`# 実行結果の不変条件センサス（R6-1）`, `# トレース: ${tracesPath}（効果 ${effects}件）`, ''];
for (const id of Object.keys(hits)) {
  lines.push(`## ${id}（${hits[id].length}効果）`);
  for (const h of hits[id]) lines.push(`${h.effectId}\t${h.where}\t${h.evidence}`);
  lines.push('');
}
fs.writeFileSync('docs/_census_trace_invariants.txt', lines.join('\n'));

console.log(`実行結果の不変条件センサス（効果 ${effects}件）`);
for (const id of Object.keys(hits)) console.log(`  ${id}: ${hits[id].length}効果${BASELINE[id] !== undefined ? `（BASELINE ${BASELINE[id]}）` : '（候補出し）'}`);
console.log('明細 → docs/_census_trace_invariants.txt');
console.log('⚠I2〜I5 は候補出しであって判定ではない（精度は round6/TYPE_LEDGER.md）。');

if (showId) {
  for (const h of hits[showId].slice(offset, offset + showN)) {
    console.log(`\n── ${h.effectId}  [${h.where}]`);
    console.log(`原文: ${src[h.effectId] ?? h.text}`);
    console.log(`根拠: ${h.evidence}`);
  }
}

let bad = false;
for (const [id, base] of Object.entries(BASELINE)) {
  if (hits[id].length !== base) {
    console.log(`🔴${id} が BASELINE ${base} と違う（${hits[id].length}）＝${hits[id].length > base ? '退化' : '払い戻し＝BASELINE を下げる'}`);
    bad = true;
  }
}
process.exit(bad ? 1 : 0);
