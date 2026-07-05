// TRASH{TRASH_CARD}（トラッシュ→トラッシュ＝no-op）ノードの全数走査＋原文に「ゲームから除外」があるか
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
const root = process.cwd();
const cardMap = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }
}
for (const f of ['effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json','effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [cardNum, effects] of Object.entries(j)) {
    for (const eff of effects) {
      const walk = (a, path) => {
        if (!a || typeof a !== 'object') return;
        if (Array.isArray(a)) { a.forEach((x,i)=>walk(x, `${path}[${i}]`)); return; }
        if (a.type === 'TRASH' && a.target?.type === 'TRASH_CARD') {
          const c = cardMap.get(cardNum);
          const txt = (c?.EffectText ?? '') + '|' + (c?.BurstText ?? '');
          const exile = txt.includes('ゲームから除外');
          console.log(`${f}\t${eff.effectId}\t${eff.parseStatus}\t${path}\t除外原文:${exile}\t${JSON.stringify(a).slice(0,120)}`);
        }
        for (const [k,v] of Object.entries(a)) if (typeof v === 'object') walk(v, `${path}.${k}`);
      };
      walk(eff.action, 'action');
    }
  }
}
