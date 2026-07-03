import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData } from '../src/types';
import type { EffectAction, GrantLrigAbilityAction } from '../src/types/effects';
import { parseCardEffects } from '../src/data/effectParser';

const root = process.cwd();
const ids = process.argv.slice(2);
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const cid = r.CardNum?.trim(); if (cid && !cardMap.has(cid)) cardMap.set(cid, r as unknown as CardData); }
}
const collectGLA = (a: EffectAction | undefined, out: GrantLrigAbilityAction[]) => {
  if (!a || typeof a !== 'object') return;
  if (a.type === 'GRANT_LRIG_ABILITY') out.push(a as GrantLrigAbilityAction);
  for (const v of Object.values(a)) {
    if (Array.isArray(v)) v.forEach(x => collectGLA(x as EffectAction, out));
    else if (v && typeof v === 'object') collectGLA(v as EffectAction, out);
  }
};
for (const id of ids) {
  const card = cardMap.get(id)!;
  console.log(`\n════ ${id} ════`);
  console.log('原文:', (card.EffectText ?? '').slice(0, 400));
  const parsed = parseCardEffects({ ...card });
  const glas: GrantLrigAbilityAction[] = [];
  for (const pe of parsed) collectGLA(pe.action, glas);
  for (const g of glas) {
    console.log('rawText:', (g.rawText ?? '').slice(0, 300));
    console.log('abilities:', JSON.stringify(g.abilities, null, 1).slice(0, 2500));
  }
}
