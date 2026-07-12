import { readFileSync } from 'fs';
import Papa from 'papaparse';
const files = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const map = new Map();
for (const f of files) for (const [k,v] of Object.entries(JSON.parse(readFileSync('public/data/'+f,'utf8')))) map.set(k, {v, f});
const cards = new Map();
for (let i=1;i<=11;i++){
  try {
    const {data} = Papa.parse(readFileSync('public/data/CardData_Sheet'+i+'.csv','utf8').replace(/^﻿/,''),{header:true});
    for (const r of data) if (r.CardNum) cards.set(r.CardNum, r);
  } catch(e) {}
}
for (const f of ['CardData_Variants.csv']) {
  try {
    const {data} = Papa.parse(readFileSync('public/data/'+f,'utf8').replace(/^﻿/,''),{header:true});
    for (const r of data) if (r.CardNum) cards.set(r.CardNum, r);
  } catch(e) {}
}
for (const num of process.argv.slice(2)) {
  const e = map.get(num);
  const c = cards.get(num);
  console.log('=====', num, c?.CardName, '=====');
  console.log('TEXT:', c?.EffectText);
  if (!e) { console.log('NOT FOUND IN JSON'); continue; }
  console.log(JSON.stringify(e.v));
  console.log();
}
