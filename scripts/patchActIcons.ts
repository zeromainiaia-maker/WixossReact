/**
 * 【起】にフェイズアイコン（《アタックフェイズアイコン》/《スペルカットインアイコン》/《メインフェイズアイコン》）を
 * 持つカードを再パースし、ACTIVATED 効果の timing のみを effectId 単位で上書きする一時スクリプト。
 * 蓄積パーサードリフトを巻き込まないよう、timing フィールド以外は一切変更しない。
 */
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const allRows: Record<string, string>[] = [];
for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}
const tkPath = join(root, 'public/data/CardData_TK.csv');
if (existsSync(tkPath)) {
  const tkText = readFileSync(tkPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(tkText, { header: true, skipEmptyLines: true });
  allRows.push(...data);
}

const fileMap: Record<string, string> = {
  WX: 'effects_WX.json', WXDi: 'effects_WXDi.json', WX24_26: 'effects_WX24_26.json',
  WXK: 'effects_WXK.json', misc: 'effects_misc.json',
};
function groupOf(cardNum: string): keyof typeof fileMap {
  if (/^WXDi/i.test(cardNum)) return 'WXDi';
  if (/^WX2[4-6]/.test(cardNum)) return 'WX24_26';
  if (/^WXK/.test(cardNum)) return 'WXK';
  if (/^WX(0[0-9]|1[0-9]|2[0-3]|EX)/.test(cardNum)) return 'WX';
  return 'misc';
}
const jsonCache: Record<string, Record<string, any>> = {};
function loadJson(fname: string) {
  if (!jsonCache[fname]) jsonCache[fname] = JSON.parse(readFileSync(join(root, 'public/data', fname), 'utf-8'));
  return jsonCache[fname];
}

const ICON = /【起】[^：]*《(?:アタックフェイズ|スペルカットイン|メインフェイズ)アイコン》/;
const changes: string[] = [];

for (const r of allRows) {
  const et = r.EffectText ?? '';
  if (!ICON.test(et)) continue;
  const card = {
    CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: r.ImgURL ?? '',
    Type: r.Type ?? '', CardClass: r.CardClass ?? '', Color: r.Color ?? '',
    Level: r.Level ?? '', GrowCost: r.GrowCost ?? '', Cost: r.Cost ?? '',
    Limit: r.Limit ?? '', Power: r.Power ?? '', Restriction: r.Restriction ?? '',
    Team: r.Team ?? '', Timing: r.Timing ?? '', Guard: r.Guard ?? '', Coin: r.Coin ?? '',
    Story: r.Story ?? '', LifeBurst: r.LifeBurst ?? '', EffectText: r.EffectText ?? '',
    BurstText: r.BurstText ?? '', effects: [],
  } as CardData;
  const reparsed = mergeManualEffects(card.CardNum, parseCardEffects(card));
  const timingById = new Map<string, string[] | undefined>();
  for (const e of reparsed) if (e.effectType === 'ACTIVATED') timingById.set(e.effectId, e.timing);

  const fname = fileMap[groupOf(card.CardNum)];
  const json = loadJson(fname);
  const stored = json[card.CardNum];
  if (!Array.isArray(stored)) continue;

  for (const e of stored) {
    if (e.effectType !== 'ACTIVATED') continue;
    if (!timingById.has(e.effectId)) continue;
    const newT = timingById.get(e.effectId);
    const oldStr = JSON.stringify(e.timing ?? null);
    const newStr = JSON.stringify(newT ?? null);
    if (oldStr !== newStr) {
      e.timing = newT;
      changes.push(`${card.CardNum} ${e.effectId}: ${oldStr} -> ${newStr}`);
    }
  }
}

for (const [fname, json] of Object.entries(jsonCache)) {
  writeFileSync(join(root, 'public/data', fname), JSON.stringify(json), 'utf-8');
}
console.log(`timing changes: ${changes.length}`);
console.log(changes.join('\n'));
