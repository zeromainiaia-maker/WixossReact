// 一時調査: WX12-051 の parser 出力を直接確認
import fs from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from './src/data/effectParser';
import type { CardData } from './src/types';

const ids = process.argv.slice(2);
for (const f of fs.readdirSync('public/data').filter(x => /^CardData_Sheet\d+\.csv$/.test(x))) {
  const { data } = Papa.parse<CardData>(fs.readFileSync(`public/data/${f}`, 'utf8'), { header: true });
  for (const row of data) {
    if (ids.includes((row.CardNum ?? '').trim())) {
      console.log('###', row.CardNum, '|', row.EffectText);
      console.log(JSON.stringify(parseCardEffects(row), null, 1).slice(0, 3000));
    }
  }
}
