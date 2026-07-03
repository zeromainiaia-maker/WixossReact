import fs from 'fs';
import path from 'path';
const DATA='public/data';
const ids=`PR-K064 WX09-016 WX14-055 WX15-055 WX15-056 WX18-052 WX24-D1-20 WX24-D1-25 WX24-D5-20 WX24-D5-25 WX24-P1-050 WX24-P1-057 WX24-P2-065 WX24-P2-069 WX24-P2-087 WX24-P2-094 WX24-P3-065 WX24-P4-049 WX24-P4-061 WX24-P4-089 WX25-CP1-047 WX25-CP1-071 WX25-P1-111 WX25-P1-112 WX25-P2-048 WX25-P2-057 WX25-P2-071 WX25-P2-109 WX25-P3-073 WX25-P3-113 WX26-CP1-059 WXDi-CP01-045 WXDi-D08-022 WXDi-D08-023 WXDi-P00-065 WXDi-P01-052 WXDi-P02-038 WXDi-P03-013 WXDi-P03-036 WXDi-P04-036 WXDi-P04-052 WXDi-P05-033 WXDi-P05-052 WXDi-P05-068 WXDi-P08-037 WXDi-P09-035 WXDi-P09-055 WXDi-P11-056 WXDi-P12-049 WXDi-P12-062 WXDi-P13-053 WXDi-P13-061 WXDi-P13-088 WXDi-P14-043 WXDi-P14-044 WXDi-P14-045 WXDi-P14-047 WXDi-P14-049 WXDi-P14-053 WXDi-P15-079 WXDi-P15-083 WXDi-P16-045 WXK08-034 WXK10-023 WXK10-037 WXK11-056`.split(/\s+/);
const texts=new Map();
for(const f of fs.readdirSync(DATA).filter(f=>f.startsWith('CardData_')&&f.endsWith('.csv')).sort()){
  for(const line of fs.readFileSync(path.join(DATA,f),'utf8').split('\n')){
    const cols=line.split(',');const id=cols[0];
    if(!id||!/^[A-Z]/.test(id)||id==='CardNum')continue;
    texts.set(id,(texts.get(id)??'')+cols.slice(18).join(','));
  }
}
const json=new Map();
for(const f of fs.readdirSync(DATA).filter(f=>f.startsWith('effects_')&&f.endsWith('.json')).sort()){
  const j=JSON.parse(fs.readFileSync(path.join(DATA,f),'utf8'));
  for(const [id,e] of Object.entries(j)) json.set(id,e);
}
for(const id of ids){
  const raw=texts.get(id)||'';
  const st=raw.split(/。/).filter(s=>/ダウン状態の|アップ状態の/.test(s)).map(s=>s.replace(/（[^）]*）/g,'')).join(' ／ ');
  const effs=json.get(id)||[];
  const acts=effs.map(e=>{const t=e.action?.target||e.action?.source;return `${e.action?.type||e.effectType}[${t?JSON.stringify(t.filter||{}):''}]`;}).join(',');
  console.log(id+'\t'+st.slice(0,90)+'\t'+acts.slice(0,120));
}
