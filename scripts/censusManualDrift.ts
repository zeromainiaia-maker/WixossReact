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

/** 値を「リーフパス→値」の平坦マップへ（buildEffectsJson と同じ規約。配列は添字パス）。 */
function leafMap(o: unknown, pre = '', out: Map<string, unknown> = new Map()): Map<string, unknown> {
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

// ── --card <ID>：1カードの完全 diff ──
const cardArgIdx = process.argv.indexOf('--card');
if (cardArgIdx >= 0) {
  const target = process.argv[cardArgIdx + 1];
  const card = cards.get(target);
  if (!card) { console.log(`${target}: CSV に無い`); process.exit(0); }
  const fresh = mergeManualEffects(target, parseCardEffects({ ...(card as unknown as CardData), effects: [] } as CardData));
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
