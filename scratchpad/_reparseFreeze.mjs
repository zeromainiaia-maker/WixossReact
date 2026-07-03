import { readFileSync, existsSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser.ts';
import { mergeManualEffects } from '../src/data/manualEffects.ts';
const ids=new Set(['WDK05-R09','WX13-039','WXEX1-54','WXEX2-56','WXEX1-02','WXDi-P16-075','WXDi-P02-065','WXDi-P01-003']);
const rows=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
for(const r of rows){
  if(!ids.has(r.CardNum))continue;
  const eff=mergeManualEffects(r.CardNum, parseCardEffects({...r,effects:[]}));
  console.log('===== '+r.CardNum+' =====');
  for(const e of eff){
    const tgt=e.action?.target||e.action?.source;
    console.log(e.effectId, e.action?.type, 'filter=', JSON.stringify(tgt?.filter), 'count=', tgt?.count);
  }
}
