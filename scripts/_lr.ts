import { readFileSync } from 'fs';
import Papa from 'papaparse';
const FILES=['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const data:Record<string,any>={};
for(const f of FILES){const j=JSON.parse(readFileSync(`public/data/${f}`,'utf-8'));for(const k of Object.keys(j)){data[k]=j[k];}}
const rows:Record<string,string>[]=[];
for(let i=1;i<=11;i++){try{rows.push(...Papa.parse<Record<string,string>>(readFileSync(`public/data/CardData_Sheet${i}.csv`,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);}catch{/* シート欠番はスキップ */}}
try{rows.push(...Papa.parse<Record<string,string>>(readFileSync('public/data/CardData_TK.csv','utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);}catch{/* TK 無しはスキップ */}
const textOf:Record<string,string>={}; for(const r of rows){if(r.CardNum)textOf[r.CardNum]=[r.EffectText,r.BurstText].filter(x=>x&&x!=='-').join(' ║ ');}
function walk(o:any,cb:(o:any)=>void){if(Array.isArray(o))o.forEach(x=>walk(x,cb));else if(o&&typeof o==='object'){cb(o);for(const k of Object.keys(o))walk(o[k],cb);}}
let rap=0,lar=0,lpc=0; const larTake:string[]=[],larReorder:string[]=[];
for(const[id,effs]of Object.entries(data)){
  let hasRap=false,hasLar=false,hasLpc=false;
  walk(effs,o=>{if(o.type==='REVEAL_AND_PICK')hasRap=true;if(o.type==='LOOK_AND_REORDER')hasLar=true;if(o.type==='LOOK_PICK_CHAIN')hasLpc=true;});
  if(hasRap)rap++; if(hasLpc)lpc++;
  if(hasLar){lar++;
    const t=textOf[id]||'';
    if(/その中から.*(手札に加え|場に出|エナゾーンに置)/.test(t)) larTake.push(id); else larReorder.push(id);
  }
}
console.log('REVEAL_AND_PICK を含むカード:',rap);
console.log('LOOK_PICK_CHAIN を含むカード:',lpc);
console.log('LOOK_AND_REORDER を含むカード:',lar);
console.log('  └ うちテキストが「その中から…手札/場/エナに加える」(take系=本来REVEAL_AND_PICK):',larTake.length);
console.log('  └ うち並べ替えのみ系:',larReorder.length);
console.log('\n[take系なのにLOOK_AND_REORDER curateの例 (最大15)]');
for(const id of larTake.slice(0,15))console.log(' ',id,':',(textOf[id]||'').slice(0,55));
console.log('\n[並べ替えのみ系の例 (最大10)]');
for(const id of larReorder.slice(0,10))console.log(' ',id,':',(textOf[id]||'').slice(0,55));
