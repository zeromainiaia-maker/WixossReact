// WX12-025/034/036「センタールリグが＜X＞でないかぎり手札の【ガード】を失う」（【常】丸ごと欠落）
// parser 規則（GUARD_LOSS_UNLESS_LRIG クリーンSTUB）を追加済み → fresh を curated に注入（続き20）
import { readFileSync, writeFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import { mergeManualEffects } from '../src/data/manualEffects';
import type { CardData } from '../src/types';

const TARGETS = ['WX12-025', 'WX12-034', 'WX12-036'];
const rows: Record<string,string>[] = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!existsSync(p))break; const {data}=Papa.parse<Record<string,string>>(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const j = JSON.parse(readFileSync('public/data/effects_WX.json','utf-8'));
for (const id of TARGETS) {
  const r = rows.find(x => x.CardNum === id);
  if (!r) throw new Error(`row not found: ${id}`);
  const fresh = mergeManualEffects(id, parseCardEffects({...r, effects: []} as unknown as CardData));
  if (!JSON.stringify(fresh).includes('GUARD_LOSS_UNLESS_LRIG')) throw new Error(`fresh lacks stub: ${id}`);
  const cur = JSON.stringify(j[id] ?? []);
  console.log(id, 'cur effects:', (j[id]??[]).length, '→ fresh:', fresh.length, cur.includes('GUARD_LOSS') ? '(already)' : '');
  j[id] = fresh;
}
writeFileSync('public/data/effects_WX.json', JSON.stringify(j));
console.log('injected');
