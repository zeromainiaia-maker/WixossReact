import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
// 対戦相手限定の5件（原文「対戦相手は…エナが…になるように」）
const oppOnly = new Set(['WX10-005-E1','WX12-021-BURST','WX14-054-E1','WXK11-008-E1','WXK11-058-E1']);
const files = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
function* walk(o){if(!o||typeof o!=='object')return;yield o;for(const v of Object.values(o))if(v&&typeof v==='object')yield* walk(v);}
let n=0;const hit=new Set();
for(const f of files){
  const p=join(root,'public/data',f);const raw=readFileSync(p,'utf8');
  const eol=(raw.match(/(\r?\n)$/)||[,''])[1];const body=eol?raw.slice(0,-eol.length):raw;
  const data=JSON.parse(body);
  if(JSON.stringify(data)!==body){console.error('⚠',f,'往復不安定');process.exit(1);}
  let changed=false;
  for(const effs of Object.values(data))for(const e of effs){
    if(!oppOnly.has(e.effectId))continue;
    for(const node of walk(e))if(node.type==='EQUALIZE_ENERGY'&&node.owner===undefined){node.owner='opponent';n++;hit.add(e.effectId);changed=true;}
  }
  if(changed&&!DRY)writeFileSync(p,JSON.stringify(data)+eol,'utf8');
  console.log(`${f}: ${changed?'更新':'-'}`);
}
console.log(`\nowner追加 ${n} / ${oppOnly.size}`);
const miss=[...oppOnly].filter(i=>!hit.has(i));if(miss.length)console.log('⚠未適用:',miss.join(' '));
console.log(DRY?'[DRY]':'[書込完了]');
