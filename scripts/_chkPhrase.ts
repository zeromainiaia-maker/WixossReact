import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
const rows:any[]=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data as any[]);}
const ids=['WXDi-D09-H14','WXDi-D09-P13','WXDi-P02-043','WXDi-P03-067','WXDi-P11-058','WXDi-P12-074','WXDi-P13-054','WX24-P1-045','WX24-P3-051','WX24-P4-102','WX26-CP1-050'];
const re=/対戦相手の[、,]?\s*能力か効果の対象になったとき/;
for(const id of ids){const r=rows.find(r=>r.CardNum===id);const has=re.test(r?.EffectText??'');console.log(`${has?'MATCH':'  no '} ${id}: ${(r?.EffectText??'').slice(0,90)}`);}
