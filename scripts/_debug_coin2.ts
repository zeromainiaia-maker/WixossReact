import { readFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser';
import type { CardData } from '../src/types';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const targets = new Set(['WXEX1-24', 'WD18-001']);

for (let i = 1; i <= 11; i++) {
  const csvPath = join(root, `public/data/CardData_Sheet${i}.csv`);
  if (!existsSync(csvPath)) break;
  const csvText = readFileSync(csvPath, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(csvText, { header: true, skipEmptyLines: true });

  for (const r of data) {
    if (!targets.has(r.CardNum?.trim())) continue;
    const card: CardData = {
      CardNum: r.CardNum ?? '', CardName: r.CardName ?? '', ImgURL: '',
      Type: r.Type ?? '', CardClass: '', Color: '', Level: r.Level ?? '',
      GrowCost: '', Cost: '', Limit: '', Power: '', Restriction: '',
      Team: '', Timing: '', Guard: '', Coin: r.Coin ?? '', Story: '',
      LifeBurst: r.LifeBurst ?? '', EffectText: r.EffectText ?? '',
      BurstText: r.BurstText ?? '', effects: [],
    };

    console.log(`\n=== ${card.CardNum} (${card.CardName}) Lv${card.Level} ===`);
    const activated = card.EffectText.match(/【起】[^【]*/g) ?? [];
    activated.forEach((a, i) => {
      const colonIdx = a.indexOf('：');
      const costPart = colonIdx >= 0 ? a.slice(a.indexOf('】') + 1, colonIdx) : '(no colon)';
      console.log(`  起${i+1} costStr="${costPart}"`);
    });

    const effects = parseCardEffects(card);
    const actEffects = effects.filter(e => e.effectType === 'ACTIVATED');
    actEffects.forEach(e => {
      console.log(`  → ${e.effectId}: cost=${JSON.stringify(e.cost)}`);
    });
  }
}
