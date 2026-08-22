import { readFileSync, writeFileSync } from 'fs';
const files = ['effects_misc','effects_WX','effects_WX24_26','effects_WXDi','effects_WXK'];
const src = JSON.parse(readFileSync('docs/_effect_srctext.json','utf8'));
const OPT = new Set(['OPTIONAL_COST','TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST','OPTIONAL_TRASH_ENERGY_CLASS']);
const DIDIT = new Set(['BANISH','BOUNCE','DOWN','FREEZE','TRANSFER_TO_DECK','TRANSFER_TO_HAND','SEND_TO_ENERGY','LIFE_CRASH','EXILE','TRASH']);
const NOOP_MARKERS = new Set(['ARTS_COST_REDUCTION_BY_EFFECT','SELF_ABILITY_COST_REDUCTION']);
const isOpt = n => n && n.type==='STUB' && OPT.has(n.id);
const isWrapOpt = n => n && n.type==='CONDITIONAL' && isOpt(n.then) && !n.else;
const unwrap = n => (n && n.type==='CONDITIONAL' && !n.else) ? n.then : n;
const live={};
for(const f of files){const j=JSON.parse(readFileSync(`public/data/${f}.json`,'utf8'));for(const[c,es]of Object.entries(j))for(const e of es)live[e.effectId]={c,e};}
const out=[]; const excl={optcost:0,didit:0,stubprev:0,marker:0};
for(const [id,{c,e}] of Object.entries(live)){
  const t=src[id]||'';
  if(!/そうした場合|そうしなかった場合|そうしない場合/.test(t)) continue;
  if(!/"condition":\{"type":"IS_MY_TURN"\}/.test(JSON.stringify(e))) continue;
  const naked=[];
  const rec=(v)=>{
    if(Array.isArray(v)){
      v.forEach((n,i)=>{
        if(n&&typeof n==='object'&&n.type==='CONDITIONAL'&&n.condition?.type==='IS_MY_TURN'){
          if(n.then?.type==='STUB'&&NOOP_MARKERS.has(n.then.id)){excl.marker++;return;} // 使用時コスト軽減マーカー
          const raw = i>0? v[i-1] : null;
          if(raw && raw.type==='STUB'){excl.stubprev++;return;}
          const before=v.slice(0,i);
          if(before.some(x=>isOpt(x)||isWrapOpt(x))){excl.optcost++;return;}
          const p=unwrap(raw);
          if(p&&DIDIT.has(p.type)){excl.didit++;return;}
          naked.push({idx:i, prev: p? (p.type==='STUB'?'STUB:'+p.id:p.type) : 'FIRST'});
        }
      });
      v.forEach(rec);
    } else if(v&&typeof v==='object'){
      for(const [k,x] of Object.entries(v)){
        if(!Array.isArray(x)&&x&&typeof x==='object'&&x.type==='CONDITIONAL'&&x.condition?.type==='IS_MY_TURN'){
          if(x.then?.type==='STUB'&&NOOP_MARKERS.has(x.then.id)) excl.marker++;
          else naked.push({idx:-1, prev:'NESTED:'+v.type+'.'+k});
        }
        rec(x);
      }
    }
  };
  rec(e.action);
  if(naked.length) out.push({id,card:c,status:e.parseStatus,text:t,prevs:[...new Set(naked.map(n=>n.prev))],eff:e});
}
console.log('除外内訳', excl);
console.log('最終候補:', out.length, JSON.stringify(out.reduce((a,o)=>(a[o.status]=(a[o.status]||0)+1,a),{})));
const g={}; for(const o of out){const k=o.prevs.sort().join('+'); (g[k]||=[]).push(o);}
Object.entries(g).sort((a,b)=>b[1].length-a[1].length).forEach(([k,v])=>console.log(String(v.length).padStart(3),k,'|',v.map(x=>x.id+'('+x.status+')').join(' ')));
writeFileSync('tmp_b11_cand.json',JSON.stringify(out,null,1),'utf8');
