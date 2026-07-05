import fs from 'fs';
import path from 'path';
const DATA='public/data';
const PATCH = {
  'WDK05-R09-E1': { isFrozen: true },
  'WX13-039-E1': { isFrozen: true },
  'WXEX1-02-E3': { isFrozen: true },
  'WXEX1-54-E1': { isFrozen: true },
  'WXEX2-56-E2': { isFrozen: true },
  'WXDi-P16-075-E1': { isFrozen: true, powerRange: { max: 3000 } },
  'WXDi-P02-065-E1': { isFrozen: true },
};
const files=['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
let touched=0;
for(const f of files){
  const p=path.join(DATA,f);
  const raw=fs.readFileSync(p,'utf8');
  const hadNL=raw.endsWith('\n');
  const j=JSON.parse(raw);
  let changed=false;
  for(const [id,effs] of Object.entries(j)){
    for(const e of effs){
      const patch=PATCH[e.effectId];
      if(!patch)continue;
      const tgt=e.action?.target||e.action?.source;
      if(!tgt.filter)tgt.filter={};
      for(const [k,v] of Object.entries(patch)) tgt.filter[k]=v;
      console.log('patched',e.effectId,'->',JSON.stringify(tgt.filter));
      changed=true;touched++;
    }
  }
  if(changed) fs.writeFileSync(p, JSON.stringify(j)+(hadNL?'\n':''),'utf8');
}
console.log('total patched:',touched,'/',Object.keys(PATCH).length);
