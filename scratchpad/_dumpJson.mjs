import fs from 'fs';
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
for (const id of process.argv.slice(2)) {
  for (const f of FILES) {
    const j = JSON.parse(fs.readFileSync('public/data/'+f,'utf8'));
    if (j[id]) console.log('==', id, '('+f+'):', j[id].map(e=>`${e.effectId.replace(id+'-','')}:${e.effectType}${e.timing?'['+e.timing+']':''}:${e.action?.type}${e.action?.id?':'+e.action.id:''}(${e.parseStatus})`).join(' '));
  }
}
