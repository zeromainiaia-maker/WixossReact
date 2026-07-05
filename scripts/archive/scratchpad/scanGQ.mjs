import { readFileSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = 'C:/Users/zerom/WixossReact';

// 原文テキスト読み込み
const textByNum = {};
for (let i = 1; i <= 10; i++) {
  const p = join(root, 'public/data', `CardData_Sheet${i}.csv`);
  let text;
  try { text = readFileSync(p, 'utf-8').replace(/^﻿/, ''); } catch { continue; }
  const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
  for (const row of parsed.data) {
    const num = row.CardNum?.trim();
    if (!num) continue;
    textByNum[num] = ((row.EffectText || '') + '\n' + (row.BurstText || '')).trim();
  }
}

// effects JSON 全読み
const files = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const all = {};
for (const f of files) {
  const j = JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8'));
  Object.assign(all, j);
}

// GRANT_QUOTED_AUTO_ABILITY を含むカード抽出
const hits = [];
for (const [num, effs] of Object.entries(all)) {
  const s = JSON.stringify(effs);
  if (s.includes('GRANT_QUOTED_AUTO_ABILITY')) {
    const txt = textByNum[num] || '(原文なし)';
    const hasQuote = /[『「]/.test(txt);
    hits.push({ num, hasQuote, txt });
  }
}

console.log('=== GRANT_QUOTED_AUTO_ABILITY を持つカード:', hits.length, '枚 ===\n');
console.log('--- 原文に引用記号 無し（誤パース疑い） ---');
for (const h of hits.filter(x => !x.hasQuote)) {
  console.log(`\n■ ${h.num}`);
  console.log(h.txt);
}
console.log('\n\n--- 原文に引用記号 あり（正当な可能性） ---');
for (const h of hits.filter(x => x.hasQuote)) {
  console.log(`  ${h.num}`);
}
