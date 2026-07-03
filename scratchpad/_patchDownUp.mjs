import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser.ts';
import { mergeManualEffects } from '../src/data/manualEffects.ts';
const censusIds=new Set(`PR-K064 WX09-016 WX14-055 WX15-055 WX15-056 WX18-052 WX24-D1-20 WX24-D1-25 WX24-D5-20 WX24-D5-25 WX24-P1-050 WX24-P1-057 WX24-P2-065 WX24-P2-069 WX24-P2-087 WX24-P2-094 WX24-P3-065 WX24-P4-049 WX24-P4-061 WX24-P4-089 WX25-CP1-047 WX25-CP1-071 WX25-P1-111 WX25-P1-112 WX25-P2-048 WX25-P2-057 WX25-P2-071 WX25-P2-109 WX25-P3-073 WX25-P3-113 WX26-CP1-059 WXDi-CP01-045 WXDi-D08-022 WXDi-D08-023 WXDi-P00-065 WXDi-P01-052 WXDi-P02-038 WXDi-P03-013 WXDi-P03-036 WXDi-P04-036 WXDi-P04-052 WXDi-P05-033 WXDi-P05-052 WXDi-P05-068 WXDi-P08-037 WXDi-P09-035 WXDi-P09-055 WXDi-P11-056 WXDi-P12-049 WXDi-P12-062 WXDi-P13-053 WXDi-P13-061 WXDi-P13-088 WXDi-P14-043 WXDi-P14-044 WXDi-P14-045 WXDi-P14-047 WXDi-P14-049 WXDi-P14-053 WXDi-P15-079 WXDi-P15-083 WXDi-P16-045 WXK08-034 WXK10-023 WXK10-037 WXK11-056`.split(/\s+/));
// 1. parser: effectId -> state keys (from target/source filter)
const rows=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const stateMap=new Map(); // effectId -> {isUp,isDown,isFrozen}
function walk(node,cb){ if(!node||typeof node!=='object')return; if(Array.isArray(node)){node.forEach(n=>walk(n,cb));return;} cb(node); for(const k of Object.keys(node))walk(node[k],cb); }
for(const r of rows){
  if(!r.CardNum||!censusIds.has(r.CardNum))continue;
  const effs=mergeManualEffects(r.CardNum,parseCardEffects({...r,effects:[]}));
  for(const e of effs){
    walk(e,(n)=>{
      if(n.effectId) return;
    });
    // collect state per effect from any target/source filter
    let st={};
    walk(e,(n)=>{ const t=n.target||n.source; if(t&&t.filter){for(const k of['isUp','isDown','isFrozen'])if(t.filter[k])st[k]=true;} });
    if(Object.keys(st).length) stateMap.set(e.effectId, st);
  }
}
console.log('parser produced state for', stateMap.size, 'effects');
// 2. apply to curated: find effect by effectId, walk to first opponent-signi removal target lacking state, add
const files=['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const REMOVE=new Set(['BOUNCE','TRANSFER_TO_DECK','BANISH','TRASH','POWER_MODIFY','REMOVE_ABILITIES','TRANSFER_TO_HAND','SEND_TO_ENERGY']);
let applied=0, skipped=[];
for(const f of files){
  const raw=readFileSync('public/data/'+f,'utf8'); const hadNL=raw.endsWith('\n');
  const j=JSON.parse(raw); let changed=false;
  for(const [cid,effs] of Object.entries(j)){
    for(const e of effs){
      const st=stateMap.get(e.effectId); if(!st)continue;
      // find target nodes in curated effect
      let done=false;
      walk(e,(n)=>{
        if(done)return;
        if(REMOVE.has(n.type)){
          const t=n.target||n.source;
          if(t&&(t.owner==='opponent'||t.owner==='any')&&(!t.filter||t.filter.cardType==='シグニ'||!t.filter.cardType)){
            if(!t.filter)t.filter={};
            let added=false;
            for(const k of Object.keys(st)) if(!t.filter[k]){t.filter[k]=true;added=true;}
            if(added){applied++;changed=true;done=true;console.log('  +',e.effectId,n.type,JSON.stringify(st));}
          }
        }
      });
      if(!done) skipped.push(e.effectId+'('+JSON.stringify(st)+')');
    }
  }
  if(changed) writeFileSync('public/data/'+f, JSON.stringify(j)+(hadNL?'\n':''),'utf8');
}
console.log('applied:',applied);
console.log('SKIPPED (parser had state but no matching curated opponent-signi removal target):');
console.log(skipped.join('\n'));
