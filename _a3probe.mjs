import fs from 'fs';
import Papa from 'papaparse';

// load card text
const text = {};
for (let i = 1; i <= 11; i++) {
  const p = `public/data/CardData_Sheet${i}.csv`;
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse(fs.readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true });
  for (const r of data) {
    const id = r['CardNumber'] || r['カード番号'] || r['cardNumber'] || Object.values(r)[0];
    const et = r['EffectText'] || r['効果テキスト'] || '';
    const bt = r['BurstText'] || r['バーストテキスト'] || '';
    if (id) text[id] = (et + ' ' + bt).trim();
  }
}

const files = ['effects_WXDi.json', 'effects_WX.json', 'effects_WXK.json', 'effects_WX24_26.json', 'effects_misc.json'];
function walk(node, cb) { if (!node || typeof node !== 'object') return; if (Array.isArray(node)) { node.forEach(x => walk(x, cb)); return; } cb(node); for (const v of Object.values(node)) walk(v, cb); }

const out = [];
for (const f of files) {
  const d = JSON.parse(fs.readFileSync('public/data/' + f, 'utf8'));
  for (const [id, effs] of Object.entries(d)) {
    let bare = false;
    walk(effs, n => { if (n.type === 'STUB' && n.id === 'OPTIONAL_COST' && !n.costColors && !n.coinCost) bare = true; });
    if (!bare) continue;
    const t = text[id] || '(no text)';
    // extract phrases ending with してもよい
    const phrases = [...t.matchAll(/([^。、]{0,40}?)(を?支払って|して|を捨てて|を置いて|をトラッシュに置いて|を消費して)?もよい/g)].map(m => m[0]);
    out.push(`${id}\t${phrases.join(' || ') || '???'}`);
  }
}
console.log(out.join('\n'));
