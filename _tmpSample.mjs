// 一時調査: 「それが＜C＞のシグニの場合」テンプレのサンプル原文＋現JSON
import fs from 'fs';
import Papa from 'papaparse';

const IDS = process.argv.slice(2);
const sheets = fs.readdirSync('public/data').filter(f => /^CardData_Sheet\d+\.csv$/.test(f));
const cards = {};
for (const s of sheets) {
  const txt = fs.readFileSync(`public/data/${s}`, 'utf8');
  const { data } = Papa.parse(txt, { header: true });
  for (const row of data) {
    const id = row['カードNo.'] ?? row['CardNum'] ?? row['カード番号'];
    if (id && IDS.includes(id.trim())) cards[id.trim()] = row;
  }
}
const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const effs = {};
for (const f of effFiles) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [k, v] of Object.entries(j)) {
    const base = k.replace(/-E\d+.*$|-BURST.*$/, '');
    if (IDS.some(id => k === id || k.startsWith(id + '-') || base === id)) {
      (effs[base] ??= {})[k] = v;
    }
  }
}
for (const id of IDS) {
  console.log('='.repeat(70));
  console.log('###', id);
  const c = cards[id];
  if (c) {
    for (const [k, v] of Object.entries(c)) {
      if (v && /テキスト|効果|バースト|Text/i.test(k)) console.log(`--- ${k}:\n${v}`);
    }
  } else console.log('(CSV row not found)');
  const e = effs[id];
  if (e) console.log('--- JSON:\n' + JSON.stringify(e, null, 1).slice(0, 4000));
  else console.log('(no JSON effects found)');
}
