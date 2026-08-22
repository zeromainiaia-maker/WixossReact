import { readFileSync, writeFileSync } from 'fs';
const files=['effects_misc','effects_WX','effects_WX24_26','effects_WXDi','effects_WXK'];
const live={};
for(const f of files){const j=JSON.parse(readFileSync(`public/data/${f}.json`,'utf8'));for(const es of Object.values(j))for(const e of es)live[e.effectId]=e;}
const src=JSON.parse(readFileSync('docs/_effect_srctext.json','utf8'));
const rows=[];
for(const [id,e] of Object.entries(live)){
  let t=src[id]||''; if(!t) continue;
  const body=t.replace(/（[^（）]*）/g,'');
  if(!/(場合|かぎり)、代わりに/.test(body)) continue;
  // SEQUENCE 内で「基本形 → CONDITIONAL{cond, then:同じ型}（else 無し）」＝二重実行の形
  const hits=[];
  const rec=(v)=>{
    if(Array.isArray(v)){
      for(let i=0;i<v.length-1;i++){
        const a=v[i], b=v[i+1];
        if(!a||!b||typeof a!=='object'||typeof b!=='object') continue;
        if(b.type!=='CONDITIONAL'||b.else) continue;
        const th=b.then;
        if(th&&th.type===a.type) hits.push({base:a.type, cond:b.condition?.type});
      }
      v.forEach(rec);
    } else if(v&&typeof v==='object'){ for(const x of Object.values(v)) rec(x); }
  };
  rec(e.action);
  // 条件すら無い「同型2連発」も拾う
  const rec2=(v)=>{
    if(Array.isArray(v)){
      for(let i=0;i<v.length-1;i++){
        const a=v[i],b=v[i+1];
        if(a&&b&&a.type===b.type&&/^(ENERGY_CHARGE_FROM_DECK|DRAW|POWER_MODIFY|LIFE_CRASH)$/.test(a.type))
          hits.push({base:a.type, cond:'(条件なし・素の2連発)'});
      }
      v.forEach(rec2);
    } else if(v&&typeof v==='object'){ for(const x of Object.values(v)) rec2(x); }
  };
  rec2(e.action);
  if(hits.length) rows.push({id,status:e.parseStatus,hits,text:body});
}
console.log('「場合/かぎり、代わりに」＋ live が「基本形→同型の追加実行」になっている効果:', rows.length);
const by={}; rows.forEach(r=>by[r.status]=(by[r.status]||0)+1); console.log(by);
const g={};
for(const r of rows){ const k=[...new Set(r.hits.map(h=>h.base))].sort().join('+'); (g[k]||=[]).push(r); }
Object.entries(g).sort((a,b)=>b[1].length-a[1].length).forEach(([k,v])=>console.log(String(v.length).padStart(3),k,'|',v.map(x=>x.id).slice(0,8).join(' ')));
writeFileSync('tmp_b16_rows.json',JSON.stringify(rows,null,1),'utf8');
