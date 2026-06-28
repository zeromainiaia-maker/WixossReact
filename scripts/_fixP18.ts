import { readFileSync, writeFileSync } from 'fs';
const fn='public/data/effects_WXDi.json';
const data=JSON.parse(readFileSync(fn,'utf-8'));
const e1=data['WXDi-D09-P18'].find((e:any)=>e.effectId==='WXDi-D09-P18-E1');
e1.activeCondition={type:'IS_SELF_AWAKENED'};
e1.action.target.filter={thisCardOnly:true};
e1.parseStatus='MANUAL';
const out=JSON.stringify(data); JSON.parse(out); writeFileSync(fn,out);
console.log('fixed E1:', JSON.stringify(e1));
