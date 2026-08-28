/**
 * censusOrphanManual.ts — **live 限定 MANUAL スタンプの計器**（§5.3 `O-133`・2026-08-28 続き704 新設）
 *
 * ## 何を測る計器か
 * 「**`public/data/effects_*.json` の `parseStatus` が `MANUAL`／`PARTIAL` なのに、
 * `manualEffects.ts` にその effectId の定義が無い**」効果を全数列挙する。
 *
 * ## なぜ要るか（第4の死角）
 * 収穫マージ（`buildEffectsJson.ts`）は live の `parseStatus:MANUAL/PARTIAL` を**効果単位で不可侵**にする
 * （`:264` / `:274`）。**JSON を直接手修正した効果を守る**ための仕様だが、その結果：
 *   - `manualEffects.ts` に出所が無い MANUAL 効果は **parser の改善を永久に受け取れない**
 *   - しかも `_held_fresh` / `_partial_fresh` / `_idset_fresh` の**どのバケツにも出ない**
 *     （`:274` が `PRESERVE_STATUSES` の効果をレビュー判定から除外するため）
 * ⇒ **どの計器にも映らないまま凍る。** 続き703 では実際に `OPTIONAL_TRASH_SELF` の parser 修正が
 *   `WXK10-033-E1` / `WX17-077-E2` に届かず、これを踏んで本項目が分離された。
 *
 * ⚠**`censusManualDrift.ts` とは向きが逆**＝あちらは「`manualEffects.ts` にあるのに live へ届かない」側。
 *   こちらは「live にあるのに `manualEffects.ts` に無い」側で、母集団が重ならない。
 *
 * ## 3分類（この順に処理する）
 * - **A 解凍候補（SAME）** … live と fresh が**実体同一**（`parseStatus` を無視したリーフ集合が一致）。
 *   ⇒ スタンプを外して parser に任せてよい。**機械的に処理できる本体。**
 * - **B 要レビュー（DIFF）** … 実体が違う。live のほうが正しい／fresh のほうが正しい／別設計、が混ざる。
 *   ⇒ **一括で AUTO へ落とさない**（意図的な curation を潰す）。1件ずつ原文と突き合わせる。
 * - **C fresh 無し（NO_FRESH）** … parser がその effectId を出さない（live 固有の id）。
 *   ⇒ 解凍すると**効果ごと消える**ので触らない。`manualEffects.ts` へ移すのが筋（`O-39` と同型）。
 *
 * ## 使い方
 *   npx tsx scripts/censusOrphanManual.ts              … サマリ＋明細（docs/_census_orphan_manual.txt）
 *   npx tsx scripts/censusOrphanManual.ts --list A     … その分類の effectId だけを列挙（採用の入力）
 *   npx tsx scripts/censusOrphanManual.ts --id <効果ID> … 1件の live/fresh 完全 diff
 *   npx tsx scripts/censusOrphanManual.ts --unfreeze A          … A を機械的に解凍（分類は実行時に測り直す）
 *   npx tsx scripts/censusOrphanManual.ts --unfreeze <id>,<id>  … **B を1件ずつ**解凍（原文照合で fresh を採った分）
 *
 * ⚠ゲートではない（exit 0）。件数はベースラインを置かない＝**減らすこと自体が目的の worklist** なので、
 *   進捗は PLAN §6 の3計器と一緒に「A/B/C の内訳」で報告する。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { MANUAL_EFFECTS } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
import type { CardEffect } from '../src/types/effects';

const root = process.cwd();
const argv = process.argv.slice(2);
const listArg = argv.includes('--list') ? argv[argv.indexOf('--list') + 1] : null;
const idArg = argv.includes('--id') ? argv[argv.indexOf('--id') + 1] : null;

// ── live ──
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const live = new Map<string, CardEffect[]>();
const fileOf = new Map<string, string>();
for (const f of EFFECT_FILES) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, CardEffect[]>;
  for (const [id, effs] of Object.entries(j)) { live.set(id, effs); fileOf.set(id, f); }
}

// ── manualEffects.ts が定義している effectId（トップレベルのみ＝不可侵判定と同じ粒度）──
const declared = new Set<string>();
for (const effs of Object.values(MANUAL_EFFECTS)) for (const e of effs) declared.add(e.effectId);

// ── build 後の修正スクリプトが**毎回生成し直す** effectId（＝孤児ではない）──
// 🔑`npm run build:effects` は `tsx buildEffectsJson.ts && node fixLrigColorFilters.mjs` の2段で、
//   後段が live へ効果を**足す**ことがある（`[FIX] … → trashKeyCost` 等）。これらは
//   `manualEffects.ts` に無くても**生成元がある**ので凍っていない＝C（fresh 無し）と混ぜてはいけない。
// ⚠判定は**スクリプト本文に effectId リテラルが出るか**＝生成をやめれば自動的に C へ落ちる（自己保守）。
const generated = new Set<string>();
try {
  const fixerSrc = readFileSync(join(root, 'scripts', 'fixLrigColorFilters.mjs'), 'utf-8');
  for (const m of fixerSrc.matchAll(/['"`]([A-Za-z0-9-]+-(?:E\d+\w*|BURST\w*|ACT|TRAP|SONG))['"`]/g)) generated.add(m[1]);
} catch { /* 無ければ生成元なしとして扱う */ }

// ── fresh（parser 出力。⚠`mergeManualEffects` は通さない＝「parser だけなら何を出すか」を見る）──
const rows: Record<string, string>[] = [];
for (const f of ['CardData_Sheet1.csv', 'CardData_Sheet2.csv', 'CardData_Sheet3.csv', 'CardData_Sheet4.csv',
  'CardData_Sheet5.csv', 'CardData_Sheet6.csv', 'CardData_Sheet7.csv', 'CardData_Sheet8.csv',
  'CardData_Sheet9.csv', 'CardData_Sheet10.csv', 'CardData_Sheet11.csv', 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  rows.push(...Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''),
    { header: true, skipEmptyLines: true }).data);
}
const fresh = new Map<string, CardEffect[]>();
for (const r of rows) {
  const num = r.CardNum ?? '';
  if (!num || fresh.has(num)) continue;          // 先勝ち（decompile/build と同じ規約）
  fresh.set(num, parseCardEffects({ ...r, effects: [] } as unknown as CardData));
}

// ── 比較：`buildEffectsJson.ts` の canonLeaves と**同じ規約**（キー順非依存・parseStatus 無視・undefined 無視）──
type Leaf = [string, unknown];
function leafMap(o: unknown, pre = '', out: Leaf[] = []): Leaf[] {
  if (o === undefined) return out;
  if (Array.isArray(o)) { o.forEach((v, i) => leafMap(v, `${pre}[${i}]`, out)); return out; }
  if (o && typeof o === 'object') { for (const k of Object.keys(o)) leafMap((o as Record<string, unknown>)[k], `${pre}.${k}`, out); return out; }
  out.push([pre, o]);
  return out;
}
const canonLeaves = (o: unknown): string => leafMap(o)
  .filter(([path]) => !path.endsWith('.parseStatus'))
  .map(([path, val]) => `${path}=${JSON.stringify(val)}`).sort().join('\n');
const same = (a: unknown, b: unknown) => canonLeaves(a) === canonLeaves(b);

// ── 分類 ──
type Row = { effectId: string; cardNum: string; cls: 'A' | 'B' | 'C' | 'D'; liveEff: CardEffect; freshEff?: CardEffect };
const rowsOut: Row[] = [];
let totalManual = 0;
for (const [cardNum, effs] of live) {
  const fr = fresh.get(cardNum);
  for (const e of effs) {
    if (e.parseStatus !== 'MANUAL' && e.parseStatus !== 'PARTIAL') continue;
    totalManual++;
    if (declared.has(e.effectId)) continue;                     // manualEffects.ts に出所がある＝対象外
    const f = fr?.find(x => x.effectId === e.effectId);
    // 🔴**`PARTIAL` は解凍候補にしない**（2026-08-28 続き704 に golden で実測して分離）＝
    //   `PARTIAL` は「parser 出力を採ったが**別軸がまだ忠実でない**」という**意図的なレビュー印**で、
    //   実体が fresh と一致していても**印を落とすと未忠実の記録が消える**
    //   （`SP38-006-E1`＝「対戦相手の場にあるキーとシグニは能力を失い、新たに得られない」が
    //     `REMOVE_ABILITIES{count:1, PERMANENT}` で未忠実。golden がこの印を assert している）。
    //   ⇒ `MANUAL` の孤児（＝古い手スタンプ）だけを A にし、`PARTIAL` は実体同一でも **B**（要レビュー）へ送る。
    const cls: Row['cls'] = generated.has(e.effectId) ? 'D'
      : !f ? 'C' : (same(e, f) && e.parseStatus === 'MANUAL') ? 'A' : 'B';
    rowsOut.push({ effectId: e.effectId, cardNum, cls, liveEff: e, freshEff: f });
  }
}

const byClsIds = (c: Row['cls']): string[] => rowsOut.filter(r => r.cls === c).map(r => r.effectId);

// 由来の原文ブロック（`build:effects` が出す effectId → 原文）。無ければ空で続行する。
const srcText = new Map<string, string>();
try {
  const j = JSON.parse(readFileSync(join(root, 'docs', '_effect_srctext.json'), 'utf-8')) as Record<string, string>;
  for (const [k, v] of Object.entries(j)) srcText.set(k, v);
} catch { /* 無ければ原文列は空 */ }

// ── --id：完全 diff（**カンマ区切りで複数指定できる**）──
// ⚠1回の起動で全カードを parse する（約40秒）ので、**1件ずつ起動し直さない**。
//   `--id A,B,C` / `--id C群` のようにまとめて渡すこと（分類名を渡すとその分類を全部出す）。
if (idArg) {
  const spec = idArg.trim().toUpperCase();
  const targets = (spec === 'A' || spec === 'B' || spec === 'C' || spec === 'D')
    ? rowsOut.filter(r => r.cls === spec)
    : idArg.split(',').map(x => x.trim()).filter(Boolean)
        .map(id => rowsOut.find(x => x.effectId === id) ?? { effectId: id, missing: true } as unknown as Row & { missing?: true });
  for (const r of targets) {
    if ((r as Row & { missing?: true }).missing) {
      console.log(`## ${r.effectId}  → 「live 限定 MANUAL スタンプ」ではない（manualEffects.ts に定義があるか、AUTO か、存在しない）
`);
      continue;
    }
    console.log(`## ${r.effectId}  [${r.cls}]  ${fileOf.get(r.cardNum)}`);
    console.log('原文: ' + (srcText.get(r.effectId) ?? '(由来ブロックなし)'));
    console.log('live : ' + JSON.stringify(r.liveEff));
    console.log('fresh: ' + (r.freshEff ? JSON.stringify(r.freshEff) : '(parser は この effectId を出さない)'));
    if (r.freshEff) {
      const L = new Map(leafMap(r.liveEff)), F = new Map(leafMap(r.freshEff));
      for (const [p, v] of L) if (!p.endsWith('.parseStatus') && JSON.stringify(F.get(p)) !== JSON.stringify(v)) console.log(`  - ${p} = ${JSON.stringify(v)}`);
      for (const [p, v] of F) if (!p.endsWith('.parseStatus') && !L.has(p)) console.log(`  + ${p} = ${JSON.stringify(v)}`);
    }
    console.log('');
  }
  process.exit(0);
}

// ── --unfreeze：A（実体同一）の刻印を外して parser に任せる ──
// ⚠**A だけを対象にする**（B は curation を潰しうる／C は効果ごと消える）。分類は**実行時に測り直す**＝
//   古い一覧を渡されても A でないものは触らない（stale なリストによる事故を構造的に防ぐ）。
// ⚠live の値は**1バイトも変えない**＝変えるのは `parseStatus` だけ。次の `build:effects` で
//   parser 出力（実体同一）に置き換わるので、**その時点でも live は変化しない**のが正しい。
if (argv.includes('--unfreeze')) {
  const spec = (argv[argv.indexOf('--unfreeze') + 1] ?? '').trim();
  if (!spec) { console.error('--unfreeze には A か effectId のカンマ区切りを渡す'); process.exit(1); }
  // 🔑**分類名は `A` だけ**（B を一括で落とすと curation を潰す）。**明示 id なら B も許す**＝
  //   PLAN §5.3 O-133 が定める B の処理経路（「fresh が正しい → `--unfreeze <id>`」）そのもの。
  //   ⚠**C／D は明示 id でも拒む**＝C は効果ごと消え、D は生成元があるので触る意味が無い。
  const explicit = spec.toUpperCase() !== 'A';
  const wanted = explicit
    ? new Set(spec.split(',').map(x => x.trim()).filter(Boolean))
    : new Set(byClsIds('A'));
  const skipped: string[] = [];
  const touchedByFile = new Map<string, number>();
  for (const f of EFFECT_FILES) {
    const p = join(root, 'public/data', f);
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, CardEffect[]>;
    let n = 0;
    for (const effs of Object.values(j)) {
      for (const e of effs) {
        if (!wanted.has(e.effectId)) continue;
        const r = rowsOut.find(x => x.effectId === e.effectId);
        const ok = r && (r.cls === 'A' || (explicit && r.cls === 'B'));
        if (!ok) { skipped.push(`${e.effectId}(${r ? r.cls : '対象外'})`); continue; }
        e.parseStatus = 'AUTO';
        n++;
      }
    }
    if (n > 0) { writeFileSync(p, JSON.stringify(j), 'utf-8'); touchedByFile.set(f, n); }
  }
  for (const [f, n] of touchedByFile) console.log(`${f}: ${n}効果 解凍（MANUAL/PARTIAL → AUTO）`);
  if (skipped.length) console.log(`⚠ 解凍できる分類ではないので触らなかった: ${skipped.join(' ')}`);
  console.log(`計 ${[...touchedByFile.values()].reduce((a, b) => a + b, 0)}効果。⚠必ず npm run build:effects → A/B → npm run gates`);
  process.exit(0);
}

// ── --list：分類ごとの effectId ──
if (listArg) {
  const ids = rowsOut.filter(r => r.cls === listArg.toUpperCase()).map(r => r.effectId);
  console.log(ids.join(','));
  process.exit(0);
}

// ── サマリ＋明細 ──
const byCls = (c: Row['cls']) => rowsOut.filter(r => r.cls === c);
const out: string[] = [];
out.push('# live 限定 MANUAL スタンプ（§5.3 O-133）＝ manualEffects.ts に定義が無いのに live が MANUAL/PARTIAL');
out.push('# 生成: npx tsx scripts/censusOrphanManual.ts');
out.push('# A=解凍候補（live と fresh が実体同一） / B=要レビュー（実体が違う） / C=fresh 無し（parser が出さない id）');
out.push('');
for (const c of ['A', 'B', 'C', 'D'] as const) {
  const rs = byCls(c);
  const label = c === 'A' ? '解凍候補（SAME）' : c === 'B' ? '要レビュー（DIFF）'
    : c === 'C' ? 'fresh 無し（NO_FRESH）' : '生成元あり（build 後の修正スクリプト）';
  out.push(`## ${c} ${label} ［${rs.length}件］`);
  for (const r of rs) out.push(`  ${r.effectId}`);
  out.push('');
}
writeFileSync(join(root, 'docs', '_census_orphan_manual.txt'), out.join('\n'), 'utf-8');

console.log('===== live 限定 MANUAL スタンプ（§5.3 O-133）=====');
console.log(`  live の MANUAL/PARTIAL 効果          : ${totalManual}`);
console.log(`  うち manualEffects.ts に定義が無い   : ${rowsOut.length}`);
console.log(`    A 解凍候補（live == fresh）        : ${byCls('A').length}   ← 機械的に処理できる本体`);
console.log(`    B 要レビュー（実体が違う）          : ${byCls('B').length}   ⚠一括で AUTO へ落とさない`);
console.log(`    C fresh 無し（parser が出さない）   : ${byCls('C').length}   ⚠解凍すると効果ごと消える`);
console.log(`    D 生成元あり（build 後の fixer）    : ${byCls('D').length}   ＝凍っていない（毎回生成し直される）`);
console.log('明細: docs/_census_orphan_manual.txt');
console.log('⚠ゲートではない。1件の内訳は --id <効果ID>、採用の入力は --list A。');
