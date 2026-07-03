import { readFileSync, existsSync, readdirSync } from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { parseCardEffects } from '../src/data/effectParser.ts';
import { mergeManualEffects } from '../src/data/manualEffects.ts';
const ids=new Set(`PR-K064 WX09-016 WX14-055 WX15-055 WX15-056 WX18-052 WX24-D1-20 WX24-D1-25 WX24-D5-20 WX24-D5-25 WX24-P1-050 WX24-P1-057 WX24-P2-065 WX24-P2-069 WX24-P2-087 WX24-P2-094 WX24-P3-065 WX24-P4-049 WX24-P4-061 WX24-P4-089 WX25-CP1-047 WX25-CP1-071 WX25-P1-111 WX25-P1-112 WX25-P2-048 WX25-P2-057 WX25-P2-071 WX25-P2-109 WX25-P3-073 WX25-P3-113 WX26-CP1-059 WXDi-CP01-045 WXDi-D08-022 WXDi-D08-023 WXDi-P00-065 WXDi-P01-052 WXDi-P02-038 WXDi-P03-013 WXDi-P03-036 WXDi-P04-036 WXDi-P04-052 WXDi-P05-033 WXDi-P05-052 WXDi-P05-068 WXDi-P08-037 WXDi-P09-035 WXDi-P09-055 WXDi-P11-056 WXDi-P12-049 WXDi-P12-062 WXDi-P13-053 WXDi-P13-061 WXDi-P13-088 WXDi-P14-043 WXDi-P14-044 WXDi-P14-045 WXDi-P14-047 WXDi-P14-049 WXDi-P14-053 WXDi-P15-079 WXDi-P15-083 WXDi-P16-045 WXK08-034 WXK10-023 WXK10-037 WXK11-056`.split(/\s+/));
// curated
const cur=new Map();
for(const f of readdirSync('public/data').filter(f=>f.startsWith('effects_')&&f.endsWith('.json'))){
  const j=JSON.parse(readFileSync('public/data/'+f,'utf8'));
  for(const [id,e] of Object.entries(j)) cur.set(id,e);
}
// parse
const rows=[];
for(let i=1;i<=11;i++){const p=`public/data/CardData_Sheet${i}.csv`;if(!existsSync(p))break;const {data}=Papa.parse(readFileSync(p,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const tk='public/data/CardData_TK.csv';if(existsSync(tk)){const {data}=Papa.parse(readFileSync(tk,'utf-8').replace(/^﻿/,''),{header:true,skipEmptyLines:true});rows.push(...data);}
const fresh=new Map();
for(const r of rows){if(!r.CardNum||!ids.has(r.CardNum))continue;fresh.set(r.CardNum,mergeManualEffects(r.CardNum,parseCardEffects({...r,effects:[]})));}
function stateOf(e){const t=e.action?.target||e.action?.source;const f=t?.filter||{};return [f.isUp?'U':'',f.isDown?'D':'',f.isFrozen?'F':''].join('');}
function hasStateAnywhere(effs){return JSON.stringify(effs).match(/isUp|isDown/);}
for(const id of ids){
  const c=cur.get(id)||[], p=fresh.get(id)||[];
  const cState=(c.some(e=>hasStateAnywhere([e])))?'curHAS':'curNONE';
  // per effect parser state
  const pStates=p.map(e=>`${e.effectId||e.action?.type}:${stateOf(e)||'-'}`).join(' ');
  const parserHas=p.some(e=>/isUp|isDown/.test(JSON.stringify(e)));
  console.log(`${id}\t${cState}\tparserHas=${parserHas}\t${pStates}`.slice(0,150));
}
