import fs from 'fs';
import Papa from 'papaparse';
const ids = process.argv.slice(2);
const rows = [];
for (let i=1;i<=11;i++){ const p=`public/data/CardData_Sheet${i}.csv`; if(!fs.existsSync(p))break; const {data}=Papa.parse(fs.readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}); rows.push(...data); }
const tk='public/data/CardData_TK.csv'; if(fs.existsSync(tk)){const {data}=Papa.parse(fs.readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
for (const id of ids) {
  const r = rows.find(x=>x.CardNum===id);
  console.log('==', id, r? r.CardName+' ['+r.Type+']':'NOT FOUND');
  if (r) console.log('  ', (r.EffectText??'').slice(0,300));
}
