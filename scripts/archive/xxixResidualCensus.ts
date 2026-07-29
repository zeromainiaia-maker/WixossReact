// タスク12(xxix)(1) の残在庫を実測する計測スクリプト（2026-07-30 にクローズしたので保管）。
import fs from 'fs';
import { optionalOnPlayCostStub, wrapOptionalOnPlay } from '../../src/engine/triggerCollect';
import type { CardEffect } from '../../src/types/effects';

const FILES = ['effects_misc', 'effects_WX', 'effects_WX24_26', 'effects_WXDi', 'effects_WXK'];
const src: Record<string, string> = JSON.parse(fs.readFileSync('docs/_effect_srctext.json', 'utf8'));

const all: { cn: string; f: string; e: CardEffect }[] = [];
for (const f of FILES) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}.json`, 'utf8'));
  for (const [cn, effs] of Object.entries(j as Record<string, CardEffect[]>)) for (const e of effs) all.push({ cn, f, e });
}
console.log('total effects:', all.length);

const onPlayOpt = all.filter(({ e }) => e.effectType === 'AUTO' && (e.timing || []).includes('ON_PLAY')
  && e.mandatory === false && ['self', 'any', undefined].includes(e.triggerScope as string));
console.log('\n=== 任意【出】母集団:', onPlayOpt.length);

const unsup: typeof all = [], unparsed: typeof all = [], noCost: typeof all = [], sup: typeof all = [];
for (const r of onPlayOpt) {
  const e = r.e;
  if (e.costUnparsed) { unparsed.push(r); continue; }
  if (!e.cost) { noCost.push(r); continue; }
  if (optionalOnPlayCostStub(e.cost, e.effectId)) sup.push(r); else unsup.push(r);
}
console.log(` 包める: ${sup.length} / 無コスト: ${noCost.length} / 包めない: ${unsup.length} / costUnparsed: ${unparsed.length}`);

// wrapOptionalOnPlay が最終的に null を返す＝本当に収集されない効果
const dropped = onPlayOpt.filter(r => wrapOptionalOnPlay(r.e) === null);
console.log(`\n=== wrapOptionalOnPlay が null＝実際に収集されない: ${dropped.length}`);
const byKey: Record<string, string[]> = {};
for (const r of dropped) {
  const keys = r.e.costUnparsed ? ['costUnparsed']
    : Object.keys(r.e.cost ?? {}).filter(k => (r.e.cost as Record<string, unknown>)[k] !== undefined);
  const label = keys.length ? keys.join('+') : '(none)';
  (byKey[label] ??= []).push(r.e.effectId);
}
for (const [k, v] of Object.entries(byKey).sort((a, b) => b[1].length - a[1].length)) console.log(`  ${k}: ${v.length}  ${v.join(' ')}`);

console.log('\n--- 収集されない効果の全件明細（原文つき） ---');
for (const r of dropped) {
  const t = (src[r.e.effectId] || '(原文なし)').replace(/\s+/g, ' ');
  console.log(`\n${r.e.effectId}  [${r.f}]`);
  console.log(`  cost=${JSON.stringify(r.e.cost)} costUnparsed=${JSON.stringify(r.e.costUnparsed)}`);
  console.log(`  action=${JSON.stringify(r.e.action).slice(0, 300)}`);
  console.log(`  原文: ${t}`);
}

// --- costUnparsed 全体 ---
const allUnparsed = all.filter(({ e }) => e.costUnparsed);
console.log(`\n=== costUnparsed 全体: ${allUnparsed.length}`);
const byType: Record<string, typeof all> = {};
for (const r of allUnparsed) (byType[r.e.effectType] ??= []).push(r);
for (const [k, v] of Object.entries(byType)) console.log(`  ${k}: ${v.length}`);
console.log('\n--- costUnparsed 全件明細 ---');
for (const r of allUnparsed) {
  const t = (src[r.e.effectId] || '(原文なし)').replace(/\s+/g, ' ');
  console.log(`\n${r.e.effectId} [${r.e.effectType}/${(r.e.timing || []).join(',')}/mand=${r.e.mandatory}] ${JSON.stringify(r.e.costUnparsed)}`);
  console.log(`  原文: ${t}`);
}
