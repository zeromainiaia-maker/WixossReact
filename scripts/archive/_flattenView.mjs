import { readFileSync } from 'fs';
import Papa from 'papaparse';
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const data={}; const fileOf=new Map();
for(const fn of FILES){const j=JSON.parse(readFileSync(`public/data/${fn}`,'utf-8'));data[fn]=j;for(const k of Object.keys(j))fileOf.set(k,fn);}
const rows=[];for(let i=1;i<=11;i++){try{rows.push(...Papa.parse(readFileSync(`public/data/CardData_Sheet${i}.csv`,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);}catch{}}
try{rows.push(...Papa.parse(readFileSync('public/data/CardData_TK.csv','utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data);}catch{}
const m=new Map(rows.filter(r=>r.CardNum).map(r=>[r.CardNum,r]));
const ids=readFileSync('C:/Users/ymsty/AppData/Local/Temp/flatten_ids.txt','utf-8').split(/\r?\n/).filter(Boolean);
const filter=process.argv[2];
for(const id of ids){
  const fn=fileOf.get(id); if(!fn)continue;
  const effs=data[fn][id]||[];
  const r=m.get(id); const tx=r?.EffectText||'';
  // 【自】文を順に列挙
  const autoSents=tx.split(/(?=【自】|【クロス自】)/).filter(s=>/^【(クロス)?自】/.test(s)).map(s=>s.split(/(?=【常】|【出】|【起】)/)[0]);
  // AUTO effect を順に列挙し、i番目 ON_TURN_END を i番目【自】文に対応
  const autoEffs=effs.filter(e=>e.effectType==='AUTO');
  autoEffs.forEach((e,i)=>{
    if(!(e.timing||[]).includes('ON_TURN_END'))return;
    const sent=autoSents[i]||autoSents[autoSents.length-1]||'(?)';
    if(filter && !new RegExp(filter).test(sent))return;
    console.log(`### ${id} (${fn}/${e.effectId}) [auto#${i}]`);
    console.log(`  TRIG: ${sent.replace(/\s+/g,'').slice(0,100)}`);
    console.log(`  ACT: ${e.action.type}${e.action.steps?'['+e.action.steps.map(s=>s.type).join(',')+']':''}`);
  });
}
