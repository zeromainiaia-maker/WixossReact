// 原文に「この/あなたの(センター)ルリグをアップ」があるのに curated が UP{SIGNI} のカードを全数走査
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
const root = process.cwd();
const cardMap = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }
}
const files = ['effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json','effects_misc.json'];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [cardNum, effects] of Object.entries(j)) {
    const c = cardMap.get(cardNum);
    const txt = ((c?.EffectText ?? '') + '|' + (c?.BurstText ?? ''));
    if (!/(この|あなたの(?:センター)?)ルリグ[をが]?アップ/.test(txt)) continue;
    for (const eff of effects) {
      const hits = [];
      const walk = (a, path) => {
        if (!a || typeof a !== 'object') return;
        if (Array.isArray(a)) { a.forEach((x,i)=>walk(x, `${path}[${i}]`)); return; }
        if (a.type === 'UP' && a.target?.type === 'SIGNI') hits.push({ path, node: JSON.stringify(a) });
        for (const [k,v] of Object.entries(a)) if (typeof v === 'object') walk(v, `${path}.${k}`);
      };
      walk(eff.action, 'action');
      // abilities 内も走査（GLA付与能力）
      if (hits.length) {
        const around = txt.match(/.{0,50}(この|あなたの(?:センター)?)ルリグ[をが]?アップ.{0,10}/);
        console.log(`\n== ${f} ${eff.effectId} (${eff.parseStatus})`);
        console.log(`  原文…${around?.[0] ?? ''}`);
        for (const h of hits) console.log(`  ${h.path}: ${h.node.slice(0,160)}`);
      }
    }
  }
}
