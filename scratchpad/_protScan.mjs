import { readFileSync } from 'fs';
import Papa from 'papaparse';
const cards = new Map();
for (const f of [...Array.from({ length: 11 }, (_, i) => 'CardData_Sheet' + (i + 1) + '.csv'), 'CardData_TK.csv']) {
  try { for (const r of Papa.parse(readFileSync('public/data/' + f, 'utf8'), { header: true }).data) if (r.CardNum) cards.set(r.CardNum, r); } catch {}
}
const m = new Map();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'])
  for (const [k, v] of Object.entries(JSON.parse(readFileSync('public/data/' + f, 'utf8')))) m.set(k, v);
function* walk(o) { if (!o || typeof o !== 'object') return; yield o; for (const v of Object.values(o)) if (v && typeof v === 'object') yield* walk(v); }
const cat = {}; const lists = { thisOnly: [], allOwn: [], other: [] };
for (const [k, effs] of m) {
  const c = cards.get(k); const t = (c?.EffectText || '') + (c?.BurstText || '');
  for (const e of effs) for (const node of walk(e)) {
    if (node.type === 'GRANT_PROTECTION' && node.target?.count === 'ALL' && !node.subjectFilter) {
      const thisOnly = /このシグニは[^。]{0,50}受けない/.test(t);
      const allOwn = /あなたの(すべての|全ての|全)シグニ[^。]{0,40}受けない|すべてのあなたのシグニ/.test(t);
      const key = thisOnly ? 'thisOnly' : allOwn ? 'allOwn' : 'other';
      cat[key] = (cat[key] || 0) + 1;
      lists[key].push(`${k} ${e.effectId}`);
      if (key === 'other') console.log('その他:', k, e.effectId, '|', t.slice(0, 55).replace(/\s+/g, ' '));
    }
  }
}
console.log('\n分類:', JSON.stringify(cat));
console.log('\nthisOnly(単体保護→count:1に是正):', lists.thisOnly.length);
console.log(lists.thisOnly.join(' | '));
