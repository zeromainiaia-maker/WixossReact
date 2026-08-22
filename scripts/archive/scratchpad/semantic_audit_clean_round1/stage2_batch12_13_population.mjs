import { readFileSync, writeFileSync } from 'fs';
import Papa from 'papaparse';
const files=['effects_misc','effects_WX','effects_WX24_26','effects_WXDi','effects_WXK'];
const live={};
for(const f of files){const j=JSON.parse(readFileSync(`public/data/${f}.json`,'utf8'));for(const[c,es]of Object.entries(j))live[c]=es;}
const re=/【(Ｓランサー|Sランサー|ランサー|アサシン)[（(]([^）)]+)[）)]】/g;
const out=[];
for(let i=1;i<=11;i++){
  let txt; try{txt=readFileSync(`public/data/CardData_Sheet${i}.csv`,'utf8')}catch{break}
  for(const r of Papa.parse(txt.replace(/^﻿/,''),{header:true,skipEmptyLines:true}).data){
    const all=`${r.EffectText??''}\n${r.BurstText??''}`;
    const body=all.replace(/（[^（）]*【[^】]*】[^（）]*）/g,'');
    let m; re.lastIndex=0; const qs=[];
    while((m=re.exec(body))) qs.push({kw:m[1],q:m[2]});
    if(!qs.length) continue;
    const effs=(live[r.CardNum]??[]).filter(e=>/"keyword":"(Ｓランサー|Sランサー|ランサー|アサシン)"/.test(JSON.stringify(e)));
    out.push({card:r.CardNum, qs, body:body.replace(/\s+/g,' ').slice(0,220),
      effs:effs.map(e=>({id:e.effectId,st:e.parseStatus,kw:(JSON.stringify(e).match(/"keyword":"[^"]+"/g)||[]).join(',')}))});
  }
}
const as=out.filter(o=>o.qs.some(q=>q.kw==='アサシン'));
const la=out.filter(o=>o.qs.some(q=>q.kw!=='アサシン'));
console.log('=== アサシン群', as.length, 'カード / 該当効果', as.reduce((s,o)=>s+o.effs.length,0), '===');
for(const o of as) console.log(o.card, '|', o.qs.filter(q=>q.kw==='アサシン').map(q=>q.q).join(' / '), '|', o.effs.map(e=>e.id+'('+e.st+')'+e.kw).join(' '));
console.log('\n=== ランサー群', la.length, 'カード / 該当効果', la.reduce((s,o)=>s+o.effs.length,0), '===');
for(const o of la) console.log(o.card, '|', o.qs.filter(q=>q.kw!=='アサシン').map(q=>q.kw+'/'+q.q).join(' , '), '|', o.effs.map(e=>e.id+'('+e.st+')'+e.kw).join(' '));
writeFileSync('tmp_b12_scope.json',JSON.stringify({as,la},null,1),'utf8');
