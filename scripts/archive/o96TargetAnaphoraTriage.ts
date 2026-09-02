/**
 * §5.3 `O-96` / `O-220` / `O-221` の**欠陥署名の仕分け器**（2026-09-02 に `scripts/archive/` へ保存）。
 *
 * 「〈対象〉を**対象とし**、〈任意コスト〉して**もよい**。**そうした場合、それを**〜」で
 * **対象の照応が JSON に残っていない**効果を数え、`applyO96OptionalCostTargetFirst`
 * （`src/data/effectParser.ts`）のガードを1本ずつ写して**どのガードで降りているか**で分類する。
 *
 * ## 使い方
 *   npx tsx scripts/archive/o96TargetAnaphoraTriage.ts                 # 集計だけ
 *   npx tsx scripts/archive/o96TargetAnaphoraTriage.ts --all-ids       # 全 effectId を1行ずつ
 *   npx tsx scripts/archive/o96TargetAnaphoraTriage.ts --bucket <名> [--json]   # 1バケツの明細（原文つき）
 *   npx tsx scripts/archive/o96TargetAnaphoraTriage.ts --dir tmp_baseline       # 別ディレクトリの live を測る
 *
 * ## 🔴 使う前に必ず読む
 * - **この計器は parser のガードの写しなので、parser を直したら必ずここも同期する。**
 *   ズレたまま測ると「直したのに減らない／直していないのに減った」の両方が起きる
 *   （`O96_STORABLE_OUTCOMES` / `allowedCostKeys` / `declaredTarget` の3箇所）。
 * - **原文は効果単位で取る**（`enableSourceTextLog`）＝カードの `EffectText` 全文で regex を当てると
 *   **同じカードの別効果**が母集団に混ざる（2026-09-02 実測＝46 → 36 に落ちた）。
 * - **バケツは「未修正」ではなく「どのガードで降りたか」**＝据置が正しいもの（対象が一意）も
 *   偽陽性（署名が引用能力の中にあるだけ）も同じバケツに出る。**必ず原文を1件ずつ読む。**
 *
 * ## 実測の推移
 *   2026-09-01 続き763 の登録時 91 → `O-96` クローズ時 23 → `O-220` クローズ時 **13**。
 *   残 13 ＝ `O-221`(5) ／ 据置契約(5) ／ 偽陽性(1) ／ `O-222`(1) ／ `O-223`(1)。
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import Papa from 'papaparse';
import { parseCardEffects, enableSourceTextLog, getSourceTextLog } from '../../src/data/effectParser';
import type { CardData } from '../../src/types';

const root = join(import.meta.dirname, '..', '..');
const dataDir = join(root, 'public', 'data');
const csvFiles = [
  ...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`),
  'CardData_TK.csv',
].filter(f => existsSync(join(dataDir, f)));
const effectFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const dirArg = process.argv.includes('--dir') ? process.argv[process.argv.indexOf('--dir') + 1] : undefined;
const effDir = dirArg ? join(root, dirArg) : dataDir;

const cards = new Map<string, Record<string, string>>();
for (const file of csvFiles) {
  const raw = readFileSync(join(dataDir, file), 'utf8').replace(/^﻿/, '');
  for (const row of Papa.parse<Record<string, string>>(raw, { header: true, skipEmptyLines: true }).data) {
    if (row.CardNum && !cards.has(row.CardNum)) cards.set(row.CardNum, row);
  }
}

type Eff = { effectId: string; action: any; parseStatus?: string };
const live: Eff[] = [];
for (const file of effectFiles) {
  const json = JSON.parse(readFileSync(join(effDir, file), 'utf8')) as Record<string, Eff[]>;
  for (const effects of Object.values(json)) live.push(...effects);
}

const RE = /を対象とし[、,][^。]*?てもよい。そうした場合[、,]/;

// 🔑**効果単位の原文**を parser から取る（`enableSourceTextLog`）＝カードの `EffectText` 全文で
//   regex を当てると、**同じカードの別効果**が母集団に混ざる（実測＝この切り替えでノイズが落ちる）。
enableSourceTextLog();
for (const row of cards.values()) {
  try { parseCardEffects({ ...row, effects: [] } as unknown as CardData); } catch { /* 原文ログ収集のみ */ }
}
const srcLog = new Map(getSourceTextLog());

function sourceTextOf(effectId: string): string {
  const logged = srcLog.get(effectId);
  if (logged !== undefined) return logged;
  const cardNum = effectId.replace(/-(?:E\d+(?:-G\d+)?|BURST|TRAP|CB-E\d+)$/, '');
  const row = cards.get(cardNum);
  if (!row) return '';
  if (/-(?:BURST|CB-E[0-9]+)$/.test(effectId)) return row.BurstText ?? String();
  return row.EffectText ?? String();
}

function hasStoredTargetBinding(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasStoredTargetBinding);
  const obj = node as Record<string, unknown>;
  if (obj.type === 'STUB' && (obj.id === 'SELECT_TARGET_ONLY' || obj.id === 'STORE_LAST_PROCESSED_TARGETS')) return true;
  if (obj.targetsStored || obj.targetsLastProcessed || obj.targetsTriggerSource || obj.thisCardOnly) return true;
  return Object.values(obj).some(hasStoredTargetBinding);
}
function hasOptionalCostStub(node: unknown): boolean {
  if (!node || typeof node !== 'object') return false;
  if (Array.isArray(node)) return node.some(hasOptionalCostStub);
  const obj = node as Record<string, unknown>;
  if (obj.type === 'STUB' && obj.id === 'OPTIONAL_COST') return true;
  return Object.values(obj).some(hasOptionalCostStub);
}
const isDidItGate = (a: any) => a?.type === 'CONDITIONAL' && ['IS_MY_TURN', 'PAID_ADDITIONAL_COST'].includes(a.condition?.type);

const O96_STORABLE_OUTCOMES = ['BOUNCE', 'POWER_MODIFY', 'BANISH', 'TRASH', 'TRANSFER_TO_DECK', 'TRANSFER_TO_HAND',
  'SEND_TO_ENERGY', 'EXILE', 'FREEZE', 'DOWN', 'UP', 'GRANT_KEYWORD', 'ADD_TO_FIELD', 'GRANT_EFFECT'];
const allowedCostKeys = ['type', 'id', 'costText', 'costColors', 'handDiscard', 'handReveal',
  'fieldTrash', 'fieldDown', 'selfTrash', 'energyTrash', 'underAnySigniTrash', 'charmTrash', 'fieldToDeckBottom',
  'selfToEnergy', 'coinCost'];
const COST_AXIS_EXCLUDED = ['type', 'id', 'costText'];

function classify(e: Eff): { bucket: string; detail: string } {
  const action = e.action;
  if (action?.type !== 'SEQUENCE') return { bucket: 'B_root_not_sequence', detail: action?.type ?? '?' };
  const steps: any[] = action.steps ?? [];
  const gateIdx = steps.findIndex(isDidItGate);
  if (gateIdx < 1) return { bucket: 'C_no_didit_gate', detail: steps.map(s => s.type + (s.id ? `{${s.id}}` : '')).join('>') };
  const carrier = steps[gateIdx - 1];
  const wrapped = carrier.type === 'CONDITIONAL' && !carrier.else ? carrier : undefined;
  const cost = wrapped?.then ?? carrier;
  if (cost?.type !== 'STUB' || cost.id !== 'OPTIONAL_COST') {
    return { bucket: 'D_cost_not_optional_cost', detail: `${cost?.type}${cost?.id ? `{${cost.id}}` : ''}` };
  }
  const badKeys = Object.keys(cost).filter(k => !allowedCostKeys.includes(k));
  if (badKeys.length) return { bucket: 'E_cost_key_not_allowed', detail: badKeys.join(',') };
  if (!Object.keys(cost).some(k => !COST_AXIS_EXCLUDED.includes(k))) return { bucket: 'F_no_cost_axis', detail: Object.keys(cost).join(',') };
  const gate = steps[gateIdx];
  const outcome = gate.then;
  if (!O96_STORABLE_OUTCOMES.includes(outcome?.type)) {
    return { bucket: 'G_outcome_not_storable', detail: `${outcome?.type}${outcome?.id ? `{${outcome.id}}` : ''}` };
  }
  const transferTarget = outcome.type === 'TRANSFER_TO_HAND'
      && (outcome.source?.type === 'TRASH_CARD' || outcome.source?.type === 'ENERGY_CARD')
      && outcome.source?.owner === 'self' && !outcome.transferGroups?.length ? outcome.source : undefined;
  const deckTarget = outcome.type === 'TRANSFER_TO_DECK' && outcome.source?.type === 'SIGNI' ? outcome.source : undefined;
  const placeTarget = outcome.type === 'ADD_TO_FIELD'
      && (outcome.source?.type === 'TRASH_CARD' || outcome.source?.type === 'ENERGY_CARD') ? outcome.source : undefined;
  const declaredTarget = outcome.type === 'TRANSFER_TO_HAND' ? transferTarget
    : outcome.type === 'TRANSFER_TO_DECK' ? deckTarget
      : outcome.type === 'ADD_TO_FIELD' ? placeTarget : outcome.target;
  if (!declaredTarget) return { bucket: 'I_outcome_no_target', detail: `${outcome.type}/src=${outcome.source?.type ?? '-'}` };
  const zoneOutcomeOk = outcome.type === 'TRASH' && declaredTarget.type === 'ENERGY_CARD';
  if (outcome.type !== 'TRANSFER_TO_HAND' && outcome.type !== 'ADD_TO_FIELD' && !zoneOutcomeOk
      && declaredTarget.type !== 'SIGNI') return { bucket: 'J_outcome_target_not_signi', detail: `${outcome.type}/${declaredTarget.type}` };
  return { bucket: 'Z_should_have_been_fixed', detail: outcome.type };
}

const hits: { e: Eff; bucket: string; detail: string }[] = [];
for (const e of live) {
  const text = sourceTextOf(e.effectId);
  if (!RE.test(text)) continue;
  if (hasStoredTargetBinding(e.action)) continue;
  if (!hasOptionalCostStub(e.action)) continue;
  const c = classify(e);
  const isManual = e.parseStatus === 'MANUAL' || e.parseStatus === 'PARTIAL';
  hits.push({ e, bucket: isManual ? `A_MANUAL/${c.bucket}` : c.bucket, detail: c.detail });
}

const only = process.argv.includes('--bucket') ? process.argv[process.argv.indexOf('--bucket') + 1] : undefined;
if (process.argv.includes('--all-ids')) {
  for (const h of hits) console.log(`${h.bucket}	${h.e.effectId}	${h.detail}`);
}
const byBucket = new Map<string, typeof hits>();
for (const h of hits) { if (!byBucket.has(h.bucket)) byBucket.set(h.bucket, []); byBucket.get(h.bucket)!.push(h); }
console.log(`欠陥署名 合計: ${hits.length} 効果 / ${new Set(hits.map(h => h.e.effectId.replace(/-(?:E\d+.*|BURST|TRAP)$/, ''))).size} カード\n`);
for (const [b, list] of [...byBucket.entries()].sort((a, b2) => b2[1].length - a[1].length)) {
  console.log(`${b}\t${list.length}`);
  const sub = new Map<string, number>();
  for (const h of list) sub.set(h.detail, (sub.get(h.detail) ?? 0) + 1);
  for (const [d, n] of [...sub.entries()].sort((a, b2) => b2[1] - a[1])) console.log(`    ${n}\t${d}`);
}
if (only) {
  console.log(`\n=== ${only} の明細 ===`);
  for (const h of byBucket.get(only) ?? []) {
    console.log(`\n--- ${h.e.effectId}  [${h.detail}] status=${h.e.parseStatus}`);
    const t = sourceTextOf(h.e.effectId).split('\n').filter(x => RE.test(x)).join(' / ');
    console.log(`原文: ${t}`);
    if (process.argv.includes('--json')) console.log(JSON.stringify(h.e.action, null, 1));
  }
}
