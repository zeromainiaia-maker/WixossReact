// 英語ID漏れSTUB → 対象カード → 原文 の対応表を出す
import { readFileSync, existsSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import Papa from 'papaparse';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = 'C:/Users/zerom/source/WixossReact';

// CardData 読み込み
const cardMap = new Map();
for (const f of readdirSync(join(root, 'public/data')).filter(f => /^CardData_.*\.csv$/.test(f))) {
  const text = readFileSync(join(root, 'public/data', f), 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r); }
}

// 対象idを引数から（複数可）。無ければ全漏れidを集計。
const wantIds = process.argv.slice(2);

const idRe = /[A-Z][A-Z0-9_]{4,}/g;
const skip = /^(STUB|COUNT|AUTO|WX|WD|WDK|TK|CONTINUOUS|SELECT_TARGET|BET_MECHANIC|BET_CONDITION|BET_ALTERNATIVE|INTERNAL|UNKNOWN_NESTED|ACTIVATED|HASTARLIQ)/;

// decompileシート走査
const sheets = readdirSync(join(root, 'docs')).filter(f => /^decompile_sheet\d+\.txt$/.test(f));
const rows = []; // {effectId, cardNum, rendered, ids:[]}
for (const s of sheets) {
  for (const line of readFileSync(join(root, 'docs', s), 'utf-8').split('\n')) {
    const m = line.match(/^\s+(\S+?-E\d+):\s*(.*)$/);
    if (!m) continue;
    const [, effectId, rendered] = m;
    const stubParts = rendered.match(/\[STUB:[^\]]*\]/g) || [];
    const ids = new Set();
    for (const p of stubParts) for (const id of (p.match(idRe) || [])) if (!skip.test(id)) ids.add(id);
    if (ids.size === 0) continue;
    const cardNum = effectId.replace(/-E\d+$/, '');
    rows.push({ effectId, cardNum, rendered, ids: [...ids] });
  }
}

if (wantIds.length === 0) {
  // 集計のみ
  const cnt = new Map();
  for (const r of rows) for (const id of r.ids) cnt.set(id, (cnt.get(id)||0)+1);
  for (const [id,c] of [...cnt].sort((a,b)=>b[1]-a[1])) console.log(`${String(c).padStart(3)} ${id}`);
  process.exit(0);
}

// 指定idの詳細
const seen = new Set();
for (const r of rows) {
  if (!r.ids.some(id => wantIds.includes(id))) continue;
  if (seen.has(r.effectId)) continue;
  seen.add(r.effectId);
  const card = cardMap.get(r.cardNum);
  console.log('='.repeat(80));
  console.log(`${r.effectId}  [${r.ids.filter(id=>wantIds.includes(id)).join(', ')}]`);
  console.log('  逆訳: ' + r.rendered);
  console.log('  原文E: ' + (card?.EffectText ?? '(なし)'));
  if (card?.BurstText && card.BurstText !== '-') console.log('  原文B: ' + card.BurstText);
}
