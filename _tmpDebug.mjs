import fs from 'fs';
import Papa from 'papaparse';
for (const s of fs.readdirSync('public/data').filter(f => /^CardData_Sheet\d+\.csv$/.test(f))) {
  const { data } = Papa.parse(fs.readFileSync(`public/data/${s}`, 'utf8'), { header: true });
  const row = data.find(r => Object.values(r).some(v => typeof v === 'string' && v.trim() === 'WX02-030'));
  if (row) {
    console.log(s, '| keys:', Object.keys(row).join(' / '));
    for (const [k, v] of Object.entries(row)) if ((v ?? '').includes('WX02-030')) console.log('id column =', JSON.stringify(k));
    break;
  }
}
