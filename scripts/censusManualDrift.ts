/**
 * censusManualDrift.ts — `manualEffects.ts` ↔ live JSON の乖離を効果単位で機械分類する計器（§6.3 K・2026-08-08新設）
 *
 * **なぜ要るか**＝`build:effects` は live 側 `parseStatus:MANUAL`/`PARTIAL` を「手修正は不可侵」として温存するが、
 * `mergeManualEffects` の出力も MANUAL なので、**`manualEffects.ts` を後から直しても live には永久に届かない**。
 * この乖離は `_held_fresh.json`（全効果 AUTO のカード）にも `_partial_fresh.json`（混在カードの AUTO 効果）にも
 * 出ない＝**どの計器にも映らない第3の死角**。実例＝夢限-Q-（`WXDi-P11-010A`/`010B`）は stub も collector も golden も
 * 実機シナリオも揃っていたのに live だけが古く、機構が丸ごと死んでいた（続き381 で復旧）。
 *
 * ⚠**ゲートではない**（常に exit 0）＝「掘る場所を指す索引」。**一括同期は不可**＝乖離は双方向で、
 *   `PR-426` のように **live のほうが新しい**ケースがある（後から live へ直接入れた効果）。1件ずつ原文照合して決める。
 *
 * 実行:
 *   npx tsx scripts/censusManualDrift.ts            … 全数分類を docs/_manual_drift.txt へ
 *   npx tsx scripts/censusManualDrift.ts --card <ID> … 1カードの live/fresh 完全 diff を表示
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects, MANUAL_EFFECTS } from '../src/data/manualEffects';
import type { CardData } from '../src/types';
import type { CardEffect } from '../src/types/effects';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];

// ── live JSON ──
const live = new Map<string, CardEffect[]>();
for (const f of EFFECT_FILES) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  for (const [id, effs] of Object.entries(JSON.parse(readFileSync(p, 'utf-8')) as Record<string, CardEffect[]>)) {
    live.set(id, effs);
  }
}

// ── カード CSV（TK 含む＝クラフト/トークンも manualEffects の対象） ──
const cards = new Map<string, Record<string, string>>();
for (const p of [...Array.from({ length: 11 }, (_, i) => `public/data/CardData_Sheet${i + 1}.csv`), 'public/data/CardData_TK.csv']) {
  const full = join(root, p);
  if (!existsSync(full)) continue;
  const { data } = Papa.parse<Record<string, string>>(readFileSync(full, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum) cards.set(r.CardNum, r);
}

/**
 * 値を「リーフパス→値」の平坦マップへ（buildEffectsJson と同じ規約。配列は添字パス）。
 * ⚠**値が `undefined` のキーは存在しないものとして扱う**＝live は JSON 由来なので `undefined` を持ち得ないが、
 *   parser 出力は `{ upToCount: undefined }` のような明示 undefined を持つことがあり、`JSON.stringify` では
 *   消えるのに素朴な leaf 走査では「fresh にだけ在るリーフ」に見える。これを弾かないと **FRESH_GAIN が
 *   実体のない差分で水増しされる**（本計器の初版がこれで 223 件を誤検出した）。
 */
function leafMap(o: unknown, pre = '', out: Map<string, unknown> = new Map()): Map<string, unknown> {
  if (o === undefined) return out;
  if (Array.isArray(o)) o.forEach((v, i) => leafMap(v, `${pre}[${i}]`, out));
  else if (o && typeof o === 'object') for (const k of Object.keys(o)) leafMap((o as Record<string, unknown>)[k], `${pre}.${k}`, out);
  else out.set(pre, o);
  return out;
}
/** parseStatus を除いたリーフ集合（刻印だけの差で乖離扱いしない）。 */
function leaves(o: unknown): Map<string, unknown> {
  const m = leafMap(o);
  for (const k of [...m.keys()]) if (k === '.parseStatus' || k.endsWith('.parseStatus')) m.delete(k);
  return m;
}
function superset(base: Map<string, unknown>, cand: Map<string, unknown>): boolean {
  for (const [k, v] of base) {
    if (!cand.has(k)) return false;
    if (JSON.stringify(cand.get(k)) !== JSON.stringify(v)) return false;
  }
  return cand.size > base.size;
}
const same = (a: Map<string, unknown>, b: Map<string, unknown>) =>
  a.size === b.size && [...a].every(([k, v]) => b.has(k) && JSON.stringify(b.get(k)) === JSON.stringify(v));

type Row = {
  card: string; effectId: string; kind: string; fromManual: boolean; signals: string[];
  liveJson: string; freshJson: string;
};

const rows: Row[] = [];
const noCard: string[] = [];
const notInLive: string[] = [];

for (const cardNum of Object.keys(MANUAL_EFFECTS)) {
  const card = cards.get(cardNum);
  if (!card) { noCard.push(cardNum); continue; }
  const fresh = mergeManualEffects(cardNum, parseCardEffects({ ...(card as unknown as CardData), effects: [] } as CardData));
  const cur = live.get(cardNum);
  if (!cur) { notInLive.push(cardNum); continue; }
  const manualIds = new Set((MANUAL_EFFECTS[cardNum] ?? []).map(e => e.effectId));
  const liveById = new Map(cur.map(e => [e.effectId, e]));
  const freshById = new Map(fresh.map(e => [e.effectId, e]));
  for (const id of new Set([...liveById.keys(), ...freshById.keys()])) {
    const l = liveById.get(id), f = freshById.get(id);
    const lj = l ? JSON.stringify(l) : '', fj = f ? JSON.stringify(f) : '';
    const signals: string[] = [];
    let kind: string;
    if (!l) kind = 'FRESH_ONLY';                       // live に届いていない効果
    else if (!f) kind = 'LIVE_ONLY';                   // live にだけ在る＝後から直接入れた可能性（live が新しい）
    else {
      const ll = leaves(l), fl = leaves(f);
      if (same(ll, fl)) continue;                      // 実体同一（刻印/キー順のみ）
      kind = superset(ll, fl) ? 'FRESH_GAIN' : superset(fl, ll) ? 'LIVE_RICHER' : 'CHANGED';
    }
    // ── 方向の強シグナル（原文照合の優先順位づけに使う。判定そのものではない）──
    if (lj.includes('"UNKNOWN"') && !fj.includes('"UNKNOWN"')) signals.push('live_UNKNOWN解消');
    if (!lj.includes('"UNKNOWN"') && fj.includes('"UNKNOWN"')) signals.push('fresh_UNKNOWN退化');
    if (/"timing":\[\]/.test(lj) && f && !/"timing":\[\]/.test(fj)) signals.push('live_timing空を解消');
    if (f && /"timing":\[\]/.test(fj) && !/"timing":\[\]/.test(lj)) signals.push('fresh_timing空へ退化');
    const stubCount = (s: string) => (s.match(/"type":"STUB"/g) ?? []).length;
    if (l && f && stubCount(fj) < stubCount(lj)) signals.push('STUB減');
    if (l && f && stubCount(fj) > stubCount(lj)) signals.push('STUB増');
    rows.push({ card: cardNum, effectId: id, kind, fromManual: manualIds.has(id), signals, liveJson: lj, freshJson: fj });
  }
}

// ── --date：git 履歴で「どちらが後に変更されたか」を機械判定する ──
//   型の増減だけでは方向が決まらない（`CHANGED` は双方向）ため、**両側の最終変更時刻**で決める。
//   ・manual 側＝`git blame` でそのカードのブロック行範囲の最大 commit 時刻（entry がいつ最後に書き換わったか）
//   ・live 側＝`git log -S<現在の効果JSONそのもの>` ＝**現在の値がいつ live に入ったか**（JSON はミニファイ1行なので
//     効果まるごとの文字列が一意な needle になる。`-G` は1行ファイルでは全 commit に当たるので使えない）
//   ⚠これは**着手順を決めるための機械判定**であって原文照合の代わりではない。採用前に必ず原文と engine 実装を見る。
function dateMode(): void {
  const blame = execFileSync('git', ['blame', '--line-porcelain', '--', 'src/data/manualEffects.ts'],
    { encoding: 'utf-8', maxBuffer: 1 << 30, cwd: root });
  const lineTimes: number[] = [];      // 1-indexed
  const lineText: string[] = [];
  let pendingTime = 0;
  for (const ln of blame.split('\n')) {
    if (/^author-time /.test(ln)) pendingTime = Number(ln.slice(12));
    else if (ln.startsWith('\t')) { lineTimes.push(pendingTime); lineText.push(ln.slice(1)); }
  }
  /** そのカードの manual ブロック（`"CARDNUM": [` 〜 対応する `],`）の最終変更時刻。 */
  const manualTime = (cardNum: string): number | null => {
    const start = lineText.findIndex(t => t.trimStart().startsWith(`"${cardNum}": [`));
    if (start < 0) return null;
    let depth = 0, end = start;
    for (let i = start; i < lineText.length; i++) {
      for (const ch of lineText[i]) { if (ch === '[') depth++; else if (ch === ']') depth--; }
      if (depth <= 0 && i > start) { end = i; break; }
      end = i;
    }
    let max = 0;
    for (let i = start; i <= end; i++) max = Math.max(max, lineTimes[i] ?? 0);
    return max || null;
  };
  const fileOf = (cardNum: string): string => {
    for (const f of EFFECT_FILES) {
      const p = join(root, 'public/data', f);
      if (existsSync(p) && JSON.parse(readFileSync(p, 'utf-8'))[cardNum]) return `public/data/${f}`;
    }
    return '';
  };
  const liveTime = (cardNum: string, effJson: string): number | null => {
    const file = fileOf(cardNum);
    if (!file || !effJson) return null;
    try {
      const out = execFileSync('git', ['log', '-1', '--format=%ct', `-S${effJson}`, '--', file],
        { encoding: 'utf-8', maxBuffer: 1 << 28, cwd: root }).trim();
      return out ? Number(out) : null;
    } catch { return null; }
  };
  const iso = (t: number | null) => (t ? new Date(t * 1000).toISOString().slice(0, 10) : '?');
  const verdicts: { r: Row; mt: number | null; lt: number | null; verdict: string }[] = [];
  const manualTimeCache = new Map<string, number | null>();
  for (const r of rows) {
    if (!manualTimeCache.has(r.card)) manualTimeCache.set(r.card, manualTime(r.card));
    const mt = manualTimeCache.get(r.card) ?? null;
    const lt = liveTime(r.card, r.liveJson);
    // ⚠**日付判定は `manualEffects.ts` が定義している効果にしか意味が無い**。parser 由来の効果に対する
    //   「manual 側の日付」は*そのカードのブロックがいつ触られたか*でしかなく、その効果の新旧を表さない。
    //   実測（続き382）＝parser 由来を日付で MANUAL_NEWER と判定した5件は、原文照合すると**全件 live のほうが
    //   正しかった**（`WX22-013-E2` は fresh が2択を DRAW 1本に平坦化＝退化）。parser 由来は held/partial と
    //   同じ「fresh が良いか」の目視レビュー案件なので、日付では決めずに別枠へ出す。
    const verdict = r.kind === 'LIVE_ONLY' || r.kind === 'LIVE_RICHER' ? 'LIVE_NEWER'
      : !r.fromManual ? 'PARSER_REVIEW'
      : mt === null || lt === null ? 'UNDATED'
      : mt > lt ? 'MANUAL_NEWER' : lt > mt ? 'LIVE_NEWER' : 'SAME_TIME';
    verdicts.push({ r, mt, lt, verdict });
  }
  const out: string[] = [];
  out.push('# manualEffects.ts ↔ live JSON 乖離：git 履歴による方向判定（§6.3 K）', '');
  out.push(`生成: ${new Date().toISOString()}`, '');
  out.push('⚠**機械判定は着手順を決めるためのもの**＝採用前に必ず原文と engine 実装を照合する。');
  out.push('⚠manual 側＝`git blame` のカードブロック最終変更時刻／live 側＝現在の効果JSONが live に入った commit 時刻。', '');
  const byVerdict = new Map<string, typeof verdicts>();
  for (const v of verdicts) byVerdict.set(v.verdict, [...(byVerdict.get(v.verdict) ?? []), v]);
  out.push('## 判定ごとの件数');
  for (const [k, v] of [...byVerdict].sort((a, b) => b[1].length - a[1].length)) out.push(`  ${k.padEnd(14)} ${String(v.length).padStart(4)} 効果`);
  out.push('');
  for (const [k, v] of [...byVerdict].sort((a, b) => b[1].length - a[1].length)) {
    out.push(`## ${k}（${v.length} 効果）`);
    for (const x of v) {
      out.push(`  ${x.r.effectId.padEnd(24)} ${x.r.kind.padEnd(11)} manual=${iso(x.mt)} live=${iso(x.lt)}${x.r.fromManual ? ' (manual定義)' : ''}${x.r.signals.length ? ' ⚠' + x.r.signals.join('/') : ''}`);
    }
    out.push('');
  }
  writeFileSync(join(root, 'docs/_manual_drift_dates.txt'), out.join('\n'), 'utf-8');
  console.log('git 履歴による方向判定:');
  for (const [k, v] of [...byVerdict].sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k.padEnd(14)} ${String(v.length).padStart(4)} 効果`);
  console.log('明細: docs/_manual_drift_dates.txt');
}
if (process.argv.includes('--date')) { dateMode(); process.exit(0); }

// ── --adopt <effectId,…>：指定した**効果だけ**を fresh（manualEffects.ts/parser）から live へ同期する ──
//   ⚠**カード丸ごとではなく効果単位**＝同じカードに「live のほうが新しい」兄弟効果（`PR-426-E3` 型）が同居するため。
//   ⚠fresh に無い effectId（`LIVE_ONLY`）は触らない＝live 側の後付け効果を消さない。
const adoptIdx = process.argv.indexOf('--adopt');
if (adoptIdx >= 0) {
  const targets = new Set((process.argv[adoptIdx + 1] ?? '').split(',').map(s => s.trim()).filter(Boolean));
  if (targets.size === 0) { console.log('--adopt <effectId,…> を指定する'); process.exit(0); }
  const freshCache = new Map<string, CardEffect[]>();
  let applied = 0;
  for (const f of EFFECT_FILES) {
    const p = join(root, 'public/data', f);
    if (!existsSync(p)) continue;
    const j = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, CardEffect[]>;
    let touched = false;
    for (const [cardNum, effs] of Object.entries(j)) {
      if (!effs.some(e => targets.has(e.effectId)) && !(MANUAL_EFFECTS[cardNum] ?? []).some(e => targets.has(e.effectId))) continue;
      const card = cards.get(cardNum);
      if (!card) continue;
      if (!freshCache.has(cardNum)) {
        freshCache.set(cardNum, mergeManualEffects(cardNum, parseCardEffects({ ...(card as unknown as CardData), effects: [] } as CardData)));
      }
      const freshById = new Map(freshCache.get(cardNum)!.map(e => [e.effectId, e]));
      // ⚠**timing が変わる採用は既定で止める**（続き382 の実例＝`WX16-023-E1`/`WXK10-008-E1` は manualEffects.ts 側が
      //   action は新しいのに **timing を落として** `["ATTACK"]` に狭めており、CSV の `Timing` 列（アーツの使用
      //   タイミング）と食い違っていた＝採用すると「使えない側」へ退化する。**同じ効果でも項目ごとに新旧が違う**。
      //   直すべきは live ではなく `manualEffects.ts` 側。意図して変える場合だけ --allow-timing-change を付ける。
      const allowTiming = process.argv.includes('--allow-timing-change');
      for (const e of effs) {
        const f = freshById.get(e.effectId);
        if (!targets.has(e.effectId) || !f) continue;
        const lt = JSON.stringify(e.timing ?? []), ft = JSON.stringify(f.timing ?? []);
        if (lt !== ft && !allowTiming) {
          console.log(`⚠ ${e.effectId}: timing が変わるので採用を中止 ${lt} → ${ft}（CSV の Timing 列と照合し、必要なら manualEffects.ts 側を直す。意図的なら --allow-timing-change）`);
          targets.delete(e.effectId);
        }
      }
      const next: CardEffect[] = effs.map(e => (targets.has(e.effectId) && freshById.has(e.effectId))
        ? (applied++, touched = true, freshById.get(e.effectId)!) : e);
      // live に無い効果（FRESH_ONLY）を明示指定された場合は末尾へ追加する。
      for (const id of targets) {
        if (freshById.has(id) && !next.some(e => e.effectId === id) && id.startsWith(cardNum)) {
          next.push(freshById.get(id)!); applied++; touched = true;
        }
      }
      if (touched) { j[cardNum] = next; console.log(`${f}: ${cardNum} → ${effs.filter(e => targets.has(e.effectId)).map(e => e.effectId).join(', ') || '(追加)'}`); }
    }
    if (touched) writeFileSync(p, JSON.stringify(j), 'utf-8');
  }
  console.log(`計 ${applied} 効果を live へ同期。ゲートを回すこと: npm run gates`);
  process.exit(0);
}

// ── --card <ID>：1カードの完全 diff ──
const cardArgIdx = process.argv.indexOf('--card');
if (cardArgIdx >= 0) {
  const target = process.argv[cardArgIdx + 1];
  const card = cards.get(target);
  if (!card) { console.log(`${target}: CSV に無い`); process.exit(0); }
  console.log(`=== ${target}  ${card.CardName ?? ''}`);
  console.log(`原文: ${(card.EffectText ?? '').replace(/\n/g, ' ')}`);
  if (card.BurstText) console.log(`Burst: ${card.BurstText.replace(/\n/g, ' ')}`);
  console.log(`manualEffects.ts のエントリ: ${(MANUAL_EFFECTS[target] ?? []).map(e => e.effectId).join(', ') || '（なし）'}`);
  for (const r of rows.filter(x => x.card === target)) {
    console.log(`\n--- ${r.effectId}  [${r.kind}]${r.fromManual ? ' (manual定義)' : ' (parser由来)'}${r.signals.length ? ' ⚠' + r.signals.join('/') : ''}`);
    console.log(`  live : ${r.liveJson || '（無し）'}`);
    console.log(`  fresh: ${r.freshJson || '（無し）'}`);
  }
  process.exit(0);
}

// ── レポート ──
const byKind = new Map<string, Row[]>();
for (const r of rows) byKind.set(r.kind, [...(byKind.get(r.kind) ?? []), r]);
const cardsAffected = new Set(rows.map(r => r.card));

const out: string[] = [];
out.push('# manualEffects.ts ↔ live JSON 乖離センサス（§6.3 K）', '');
out.push(`生成: ${new Date().toISOString()}`);
out.push(`manualEffects エントリ ${Object.keys(MANUAL_EFFECTS).length} カード / 乖離 ${cardsAffected.size} カード・${rows.length} 効果`, '');
out.push('⚠一括同期は不可＝乖離は双方向。LIVE_ONLY / LIVE_RICHER / fresh_*退化 は **live のほうが新しい**候補。');
out.push('⚠判定は原文照合が必須。signals は優先順位づけのヒントであって判定ではない。', '');
out.push('## 区分ごとの件数');
for (const [k, v] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  out.push(`  ${k.padEnd(12)} ${String(v.length).padStart(4)} 効果  （manual定義 ${v.filter(r => r.fromManual).length} / parser由来 ${v.filter(r => !r.fromManual).length}）`);
}
out.push('');
out.push('## 強シグナル別（原文照合の着手順）');
const sigCount = new Map<string, Row[]>();
for (const r of rows) for (const s of r.signals) sigCount.set(s, [...(sigCount.get(s) ?? []), r]);
for (const [s, v] of [...sigCount].sort((a, b) => b[1].length - a[1].length)) {
  out.push(`  ${s.padEnd(22)} ${String(v.length).padStart(4)} 効果 : ${v.slice(0, 20).map(r => r.effectId).join(' ')}${v.length > 20 ? ' …' : ''}`);
}
out.push('');
for (const [k, v] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  out.push(`## ${k}（${v.length} 効果）`);
  for (const r of v) {
    out.push(`--- ${r.effectId}${r.fromManual ? ' (manual定義)' : ' (parser由来)'}${r.signals.length ? ' ⚠' + r.signals.join('/') : ''}`);
    out.push(`  live : ${r.liveJson.slice(0, 420) || '（無し）'}`);
    out.push(`  fresh: ${r.freshJson.slice(0, 420) || '（無し）'}`);
  }
  out.push('');
}
if (noCard.length) out.push(`## CSV に無い manual エントリ（${noCard.length}）: ${noCard.join(' ')}`, '');
if (notInLive.length) out.push(`## live JSON に無いカード（${notInLive.length}）: ${notInLive.join(' ')}`, '');

writeFileSync(join(root, 'docs/_manual_drift.txt'), out.join('\n'), 'utf-8');
console.log(`manualEffects ${Object.keys(MANUAL_EFFECTS).length} カード / 乖離 ${cardsAffected.size} カード・${rows.length} 効果`);
for (const [k, v] of [...byKind].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(12)} ${String(v.length).padStart(4)} 効果（manual定義 ${v.filter(r => r.fromManual).length} / parser由来 ${v.filter(r => !r.fromManual).length}）`);
}
console.log('明細: docs/_manual_drift.txt');
