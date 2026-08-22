import { readFileSync, writeFileSync } from 'fs';
const files=['effects_misc','effects_WX','effects_WX24_26','effects_WXDi','effects_WXK'];
const live={};
for(const f of files){const j=JSON.parse(readFileSync(`public/data/${f}.json`,'utf8'));for(const es of Object.values(j))for(const e of es)live[e.effectId]=e;}
const src=JSON.parse(readFileSync('docs/_effect_srctext.json','utf8'));
// 「場に〈X〉がある(かぎり|場合)」を表しうる語彙を全部（§3-3‴＝1表現で数えない）
const FIELD_COND=/HAS_CARD_IN_FIELD|FIELD_CLASS_COUNT|ALL_FIELD_SIGNI_MATCH|HAS_KEY_IN_FIELD|FIELD_SIGNI_COUNT|FIELD_SIGNI_POWER_COUNT|COUNT_THRESHOLD|NO_COMMON_COLOR_AMONG_FIELD_SIGNI|FIELD_LRIGS_SHARE_COLOR|FIELD_LRIGS_HAVE_COLORS|FIELD_HAS_GATE|SAME_ZONE_HAS_GATE|LRIG_STORY|HAS_BOND/;
const re=/(あなた|対戦相手)の場に(?:ある)?([^、。]{0,30}?)(?:シグニ|ルリグ|カード)が?[^、。]{0,12}?(ある|いる)(かぎり|場合)/;
const rows=[];
for(const [id,e] of Object.entries(live)){
  const t=src[id]||''; const m=t.match(re); if(!m) continue;
  if(!/＜[^＞]+＞/.test(m[2])) continue;                 // クラス修飾つきに限定
  const s=JSON.stringify(e);
  if(FIELD_COND.test(s)) continue;                       // どれかの語彙で表現済み
  rows.push({id,status:e.parseStatus,type:e.effectType,phrase:m[0],text:t,
    actionTypes:[...new Set((s.match(/"type":"[A-Z_]+"/g)||[]).map(x=>x.slice(8,-1)))].slice(0,6)});
}
console.log('クラス修飾つき「場に〜がある」で場条件が live に一切無い効果:', rows.length);
const by={}; rows.forEach(r=>by[r.status]=(by[r.status]||0)+1); console.log(by);
rows.forEach(r=>console.log(' ',r.id.padEnd(20),r.status.padEnd(8),r.phrase));
writeFileSync('tmp_b14e.json',JSON.stringify(rows,null,1),'utf8');
