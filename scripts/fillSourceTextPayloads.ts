/**
 * §5.3 `O-356`（2026-09-13）＝`src/data/sourceTextPayloads.ts` の payload を **live（public/data）へ刻む**後段ステップ。
 *
 * 🔑`buildEffectsJson.ts` も fresh へ同じ関数を当てるが、**収穫マージが温存した live 側の MANUAL/PARTIAL 効果**には届かない
 *   ＝ここで live を直接書く（`fixLrigColorFilters.mjs` と同じ形・冪等）。
 * ⚠`manualEffects.ts` の定義は `mergeManualEffects` が実行時に live を上書きするので、**manual 側にも同じ payload が要る**
 *   ＝`--manual` で `src/data/manualEffects.ts` の該当行へ刻む（新しい manual 効果にこの STUB を書いたら1回回す）。
 *
 * 実行: `tsx scripts/fillSourceTextPayloads.ts`（build:effects が自動で呼ぶ）／`--manual` で manual 側も書く。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { fillSourceTextPayloads, sourceTextPayloadFor, SOURCE_TEXT_PAYLOAD_KEYS } from '../src/data/sourceTextPayloads';
import type { CardData } from '../src/types';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const EFFECT_FILES = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];

// ── カード原文（build:effects と同じ読み方・先勝ち）──
const cards = new Map<string, CardData>();
const csvPaths: string[] = [];
for (let i = 1; i <= 11; i++) {
  const p = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(p)) break;
  csvPaths.push(p);
}
const tkPath = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tkPath)) csvPaths.push(tkPath);
for (const p of csvPaths) {
  const { data } = Papa.parse<Record<string, string>>(readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) {
    if (!r.CardNum || cards.has(r.CardNum)) continue;
    cards.set(r.CardNum, { ...(r as unknown as CardData), effects: [] });
  }
}

const stats: Record<string, number> = {};
let missingCards = 0;
for (const f of EFFECT_FILES) {
  const p = join(root, 'public/data', f);
  if (!existsSync(p)) continue;
  const db = JSON.parse(readFileSync(p, 'utf-8')) as Record<string, { effectId: string }[]>;
  for (const [cardNum, effs] of Object.entries(db)) {
    const card = cards.get(cardNum);
    if (!card) { missingCards++; continue; }
    fillSourceTextPayloads(card, effs, stats);
  }
  writeFileSync(p, JSON.stringify(db), 'utf-8');
}
console.log(`[fillSourceTextPayloads] live: ${Object.entries(stats).map(([k, v]) => `${k}=${v}`).join(' / ') || '0'}（CSV に無いカード ${missingCards}）`);

// ── manual 側（`--manual`）──
if (process.argv.includes('--manual')) {
  const manualPath = join(root, 'src/data/manualEffects.ts');
  const lines = readFileSync(manualPath, 'utf-8').split('\n');
  let currentCard = '';
  // ⚠効果定義は複数行に割れていることがある＝STUB の行に effectId が無い（`WX25-P1-103-E1` ほか）。直近の effectId を持ち回る。
  let currentEffectId = '';
  let touched = 0;
  const ids = Object.keys(SOURCE_TEXT_PAYLOAD_KEYS);
  for (let i = 0; i < lines.length; i++) {
    const keyM = lines[i].match(/^\s*["']([A-Za-z0-9-]+)["']\s*:\s*\[/);
    if (keyM) currentCard = keyM[1];
    const effM = lines[i].match(/"effectId":"([^"]+)"/);
    if (effM) currentEffectId = effM[1];
    if (!ids.some(id => lines[i].includes(`"id":"${id}"`))) continue;
    const card = cards.get(currentCard);
    if (!currentEffectId || !card) { console.log(`  ⚠manual ${i + 1}: effectId/カードを特定できない（${currentCard}）`); continue; }
    for (const id of ids) {
      const payload = JSON.stringify(sourceTextPayloadFor(id, card, currentEffectId)).slice(1, -1);
      if (!payload) continue;
      const before = lines[i];
      lines[i] = lines[i].replace(new RegExp(`"id":"${id}"(?!,"(?:${SOURCE_TEXT_PAYLOAD_KEYS[id].join('|')})")`, 'g'), `"id":"${id}",${payload}`);
      if (lines[i] !== before) { touched++; console.log(`  manual ${currentEffectId}: ${id} ← {${payload}}`); }
    }
  }
  writeFileSync(manualPath, lines.join('\n'), 'utf-8');
  console.log(`[fillSourceTextPayloads] manual: ${touched} 行`);
}
