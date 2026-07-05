import { readFileSync, writeFileSync } from 'fs';
const fn='public/data/effects_misc.json';
const data=JSON.parse(readFileSync(fn,'utf-8'));
const e1=data['SP27-016'].find((e:any)=>e.effectId==='SP27-016-E1');
const c0=e1.action.choices.find((c:any)=>c.choiceId==='c0');
// 「デッキからセンタールリグと共通する色を持つカードを2枚まで探してエナに置き、デッキをシャッフル」
c0.action={type:'SEARCH',from:{location:'deck',owner:'self'},filter:{colorMatchesLrig:true},maxCount:2,upToTarget:true,then:{type:'ADD_TO_ENERGY',owner:'self'},afterSearch:{type:'SHUFFLE_DECK',owner:'self'}};
e1.parseStatus='MANUAL';
const out=JSON.stringify(data); JSON.parse(out); writeFileSync(fn,out);
console.log('fixed c0:', JSON.stringify(c0.action));
