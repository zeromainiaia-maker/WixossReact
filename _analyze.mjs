import fs from 'fs';
import Papa from 'papaparse';
// カードテキスト読み込み
const cardText={};
for (const f of fs.readdirSync('public/data')) {
  if(!/^CardData_Sheet.*\.csv$/.test(f))continue;
  const rows=Papa.parse(fs.readFileSync('public/data/'+f,'utf8'),{header:true}).data;
  for(const r of rows){ if(r.CardNum) cardText[r.CardNum]=(r.EffectText||'')+' '+(r.BurstText||''); }
}
// decompileシートから leaking STUB を含む効果行を収集
const re=/^\s+([A-Za-z0-9-]+-E\d+): (.*\[STUB:[^\]]*[A-Z][A-Z0-9_]{4,}[^\]]*\].*)$/;
const idRe=/\[STUB:([^\]]*)\]/g;
const byId={};
for(let n=1;n<=10;n++){ let txt; try{txt=fs.readFileSync(`docs/decompile_sheet${n}.txt`,'utf8');}catch{continue;}
  for(const line of txt.split('\n')){ const m=line.match(re); if(!m)continue;
    const eff=m[1]; const cn=eff.replace(/-E\d+$/,'');
    let im; while((im=idRe.exec(line))){ const label=im[1];
      const ids=label.match(/[A-Z][A-Z0-9_]{4,}/g)||[];
      for(const id of ids){ if(/^(STUB|COUNT|AUTO|CONTINUOUS|SELECT_TARGET|INTERNAL)$/.test(id))continue; if(/^WX/.test(id))continue;
        (byId[id]=byId[id]||[]).push({eff,cn}); } }
  }
}
// idごとに件数・カード・原文サンプルを出力（引数でid指定 or 全件件数のみ）
const arg=process.argv[2];
if(arg){ const list=byId[arg]||[]; const seen=new Set();
  for(const {eff,cn} of list){ if(seen.has(eff))continue; seen.add(eff);
    console.log(eff, '|', (cardText[cn]||'').slice(0,180)); }
} else {
  const entries=Object.entries(byId).map(([id,l])=>[id,new Set(l.map(x=>x.eff)).size]).sort((a,b)=>b[1]-a[1]);
  for(const [id,c] of entries) console.log(String(c).padStart(3), id);
}
