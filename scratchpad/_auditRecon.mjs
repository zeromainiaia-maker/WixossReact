// 意味照合パイロットの事前調査: STUB/MANUAL含有カード数とJSONサイズ分布
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import Papa from 'papaparse';

const root = process.cwd();
const effFiles = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const effectsMap = new Map();
for (const f of effFiles) {
  const j = JSON.parse(readFileSync(join(root,'public/data',f),'utf8'));
  for (const [k,v] of Object.entries(j)) effectsMap.set(k, v);
}

const cards = new Map();
for (let n=1;n<=11;n++){
  const p = join(root,'public/data',`CardData_Sheet${n}.csv`);
  if (!existsSync(p)) continue;
  const rows = Papa.parse(readFileSync(p,'utf8'),{header:true}).data;
  for (const r of rows) if (r.CardNum) cards.set(r.CardNum, r);
}
const pTK = join(root,'public/data','CardData_TK.csv');
if (existsSync(pTK)) for (const r of Papa.parse(readFileSync(pTK,'utf8'),{header:true}).data) if (r.CardNum) cards.set(r.CardNum, r);

function hasStubDeep(o){
  if (!o || typeof o !== 'object') return false;
  if (o.type === 'STUB') return true;
  return Object.values(o).some(hasStubDeep);
}

let total=0, withText=0, inJson=0, stubOrManual=0, cleanAuto=0, textNoJson=0;
const sizes=[];
for (const [num, card] of cards) {
  total++;
  const text = (card.EffectText??'').trim();
  const burst = (card.BurstText??'').trim();
  const hasText = (text && text!=='-') || (burst && burst!=='-');
  if (!hasText) continue;
  withText++;
  const effs = effectsMap.get(num);
  if (!effs) { textNoJson++; continue; }
  inJson++;
  const isStub = effs.some(e => hasStubDeep(e) || e.parseStatus==='MANUAL');
  if (isStub) stubOrManual++; else cleanAuto++;
  sizes.push(JSON.stringify(effs).length);
}
sizes.sort((a,b)=>a-b);
const pct = q => sizes[Math.floor(sizes.length*q)];
console.log({total, withText, inJson, textNoJson, stubOrManual, cleanAuto});
console.log('JSON bytes p50/p90/p99/max:', pct(.5), pct(.9), pct(.99), sizes[sizes.length-1]);
