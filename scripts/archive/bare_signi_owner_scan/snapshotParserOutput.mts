import { readFileSync, readdirSync, writeFileSync } from 'fs';
import { parseCardEffects } from './src/data/effectParser';
function parseCSV(text: string){const rows:string[][]=[];let row:string[]=[];let cur='';let q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
  else { if(c==='"')q=true; else if(c===','){row.push(cur);cur='';} else if(c==='\n'){row.push(cur);cur='';rows.push(row);row=[];} else if(c==='\r'){} else cur+=c; }}
 if(cur||row.length){row.push(cur);rows.push(row);} return rows;}
const out: Record<string, unknown> = {};
for (const f of readdirSync('public/data').filter(x=>x.startsWith('CardData_')&&x.endsWith('.csv'))) {
  const rows = parseCSV(readFileSync('public/data/'+f,'utf8'));
  const hdr = rows[0].map(h=>h.replace(/^﻿/,''));
  for (const r of rows.slice(1)) {
    const c: Record<string,string> = {}; hdr.forEach((h,i)=>c[h]=r[i]??'');
    if (!c.CardNum) continue;
    try { out[c.CardNum] = parseCardEffects(c as never); } catch { out[c.CardNum] = 'ERR'; }
  }
}
writeFileSync(process.argv[2], JSON.stringify(out), 'utf8');
console.log('cards', Object.keys(out).length);
