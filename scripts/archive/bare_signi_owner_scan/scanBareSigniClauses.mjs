import fs from 'fs';
function parseCSV(text){const rows=[];let row=[];let cur='';let q=false;
 for(let i=0;i<text.length;i++){const c=text[i];
  if(q){ if(c==='"'){ if(text[i+1]==='"'){cur+='"';i++;} else q=false; } else cur+=c; }
  else { if(c==='"')q=true; else if(c===','){row.push(cur);cur='';} else if(c==='\n'){row.push(cur);cur='';rows.push(row);row=[];} else if(c==='\r'){} else cur+=c; }}
 if(cur||row.length){row.push(cur);rows.push(row);} return rows;}

const CLAUSE = /シグニ(?:を)?[０-９\d]*体(?:まで)?を?対象とし/g;
const SEG_BREAK = /[。、「」『』（）：]/;
const SELF_RE = /あなた|自分/;

const out = [];
for (const f of fs.readdirSync('public/data').filter(x=>x.startsWith('CardData_')&&x.endsWith('.csv'))) {
  const rows = parseCSV(fs.readFileSync('public/data/'+f,'utf8'));
  const hdr = rows[0].map(h=>h.replace(/^﻿/,''));
  for (const r of rows.slice(1)) {
    const card = {}; hdr.forEach((h,i)=>card[h]=r[i]??'');
    for (const [field, txt] of [['EffectText', card.EffectText||''], ['BurstText', card.BurstText||'']]) {
      let m; CLAUSE.lastIndex = 0;
      while ((m = CLAUSE.exec(txt)) !== null) {
        const before = txt.slice(0, m.index);
        let start = 0;
        for (let i = before.length - 1; i >= 0; i--) if (SEG_BREAK.test(before[i])) { start = i + 1; break; }
        const seg = before.slice(start);
        if (/対戦相手/.test(seg) || SELF_RE.test(seg)) continue;       // 修飾語あり＝対象外
        // 同一文の直前セグメントも見る（「あなたの場にある…のうち、」形の分断を拾う）
        let sentStart = 0;
        for (let i = before.length - 1; i >= 0; i--) if (before[i] === '。') { sentStart = i + 1; break; }
        const sentence = txt.slice(sentStart).split('。')[0];
        out.push({ num: card.CardNum, name: card.CardName, field, seg, sentence,
          sentHasSelf: SELF_RE.test(txt.slice(sentStart, start)),
          sentHasOpp: /対戦相手/.test(txt.slice(sentStart, start)) });
      }
    }
  }
}
fs.writeFileSync('tmp_lii_bare.json', JSON.stringify(out), 'utf8');
console.log('BARE句', out.length, '/ カード', new Set(out.map(r=>r.num)).size);
console.log('うち同文前方に self 語:', out.filter(r=>r.sentHasSelf).length, ' opp 語:', out.filter(r=>r.sentHasOpp).length);
