import { readFileSync } from 'fs';
import Papa from 'papaparse';
const cards = new Map();
for (const f of [...Array.from({length:11},(_,i)=>`CardData_Sheet${i+1}.csv`),'CardData_TK.csv']) {
  try { for (const r of Papa.parse(readFileSync('public/data/'+f,'utf8'),{header:true}).data) if(r.CardNum) cards.set(r.CardNum,r);}catch{}
}
const pool=[...cards.values()].filter(c=>c.Type==='シグニ'&&+(c.Power||'0')>0);
const denki=pool.filter(c=>c.CardClass?.includes('電機'));
const suisou=pool.filter(c=>c.CardClass?.includes('水獣'));
console.log('電機シグニ数',denki.length, denki[0]?.CardNum, denki[0]?.CardClass);
console.log('水獣シグニ数',suisou.length, suisou[0]?.CardNum);
