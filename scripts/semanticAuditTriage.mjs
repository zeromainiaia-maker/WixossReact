/**
 * 意味照合監査（semantic audit）: findings 精査ビューア
 *
 * semanticAuditRun.mjs が集約した findings.jsonl を、カードごとに
 * 「原文＋指摘＋effects JSON」の形で並べて表示する（人手/LLM の裏取り用）。
 *
 * 使い方:
 *   node scripts/semanticAuditTriage.mjs <outDir>                 # 全件
 *   node scripts/semanticAuditTriage.mjs <outDir> WX01-001 ...    # 指定カードのみ
 *
 * 精査の判定基準（パイロット 2026-07 で確立）:
 *   - STUB+CONDITIONAL(IS_MY_TURN) は任意コストイディオム（effectExecutor がインターセプト）→偽陽性
 *   - LIFE_BURST の mandatory:false はルール上正しい（LB発動は任意）→偽陽性
 *   - アンコール/ベット注記は engine 別処理 →偽陽性
 *   - それ以外の対象取り違え/条件欠落/数値違いは真バグの可能性大 → engine の該当実装を必ず確認
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const outDir = process.argv[2];
if (!outDir) { console.error('使い方: node scripts/semanticAuditTriage.mjs <outDir> [cardNum...]'); process.exit(1); }
const onlyCards = process.argv.slice(3);
const root = process.cwd();

const lines = readFileSync(join(outDir, 'findings.jsonl'), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const manifest = JSON.parse(readFileSync(join(outDir, 'manifest.json'), 'utf8'));
const groupOf = new Map(manifest.picked.map((p) => [p.num, p.group]));

const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const effectsMap = new Map();
for (const f of effFiles) for (const [k, v] of Object.entries(JSON.parse(readFileSync(join(root, 'public/data', f), 'utf8')))) effectsMap.set(k, v);
const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  for (const r of Papa.parse(readFileSync(p, 'utf8'), { header: true }).data) if (r.CardNum) cards.set(r.CardNum, r);
}

const byCard = new Map();
for (const f of lines) {
  if (onlyCards.length && !onlyCards.includes(f.cardNum)) continue;
  if (!byCard.has(f.cardNum)) byCard.set(f.cardNum, []);
  byCard.get(f.cardNum).push(f);
}

// サマリ
const sev = { HIGH: 0, MED: 0, LOW: 0 };
for (const f of lines) sev[f.severity] = (sev[f.severity] ?? 0) + 1;
const cardsWith = new Set(lines.map((f) => f.cardNum));
const stubCards = [...cardsWith].filter((c) => groupOf.get(c) === 'stub').length;
console.log(`findings ${lines.length}件（HIGH ${sev.HIGH}/MED ${sev.MED}/LOW ${sev.LOW}）・指摘ありカード ${cardsWith.size}枚（stub群 ${stubCards}/clean群 ${cardsWith.size - stubCards}）\n`);

for (const [num, fs] of byCard) {
  const c = cards.get(num);
  console.log('='.repeat(80));
  console.log(`■ ${num} ${c?.CardName}（group=${groupOf.get(num)}）`);
  console.log(`【原文】${(c?.EffectText ?? '').replace(/。/g, '。\n        ')}`);
  if (c?.BurstText && c.BurstText !== '-') console.log(`【LB】${c.BurstText}`);
  for (const f of fs) console.log(`  ▶ [${f.severity}/${f.type}] ${f.effectId ?? ''} 「${f.quote}」 ${f.claim}`);
  console.log(`【JSON】${JSON.stringify(effectsMap.get(num), null, 1)}`);
}
