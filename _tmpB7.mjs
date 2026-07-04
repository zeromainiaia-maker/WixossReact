// B群7枚（PND無し＝置換行動形）の原文と現JSONを確認
import fs from 'fs';
import Papa from 'papaparse';
const IDS = process.argv.slice(2);
const cards = {};
for (const s of fs.readdirSync('public/data').filter(f => /^CardData_Sheet\d+\.csv$/.test(f))) {
  const { data } = Papa.parse(fs.readFileSync(`public/data/${s}`, 'utf8'), { header: true });
  for (const row of data) {
    const id = (row['CardNum'] ?? '').trim();
    if (IDS.includes(id)) cards[id] = row;
  }
}
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const id of IDS) {
    if (!j[id]) continue;
    console.log('='.repeat(60));
    console.log('###', id, `(${f})`);
    console.log('原文:', (cards[id]?.EffectText ?? '').slice(0, 300));
    console.log('LB:', (cards[id]?.BurstText ?? '').slice(0, 150));
    console.log(JSON.stringify(j[id], null, 1).slice(0, 2500));
  }
}
