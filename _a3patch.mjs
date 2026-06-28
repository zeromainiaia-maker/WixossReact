import fs from 'fs';
import Papa from 'papaparse';

// load card text (EffectText + BurstText)
const ET = {}, BT = {};
for (let i = 1; i <= 11; i++) {
  const p = `public/data/CardData_Sheet${i}.csv`;
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse(fs.readFileSync(p, 'utf8'), { header: true, skipEmptyLines: true });
  for (const r of data) {
    const id = r['CardNumber'] || Object.values(r)[0];
    if (!id) continue;
    ET[id] = r['EffectText'] || '';
    BT[id] = r['BurstText'] || '';
  }
}

const files = ['effects_WXDi.json', 'effects_WX.json', 'effects_WXK.json', 'effects_WX24_26.json', 'effects_misc.json'];

// て-形動詞で終わる「…してもよい」コスト句を、後続「そうした場合」を手掛かりに抽出。
// 句の先頭は直前の境界（。：】、（ または 行頭・effectType マーカー）から。
function extractCost(text) {
  if (!text) return null;
  // 「そうした場合」直前の「…もよい」句を全部拾う
  const re = /(?:^|。|：|】|、|（|」)([^。：】、（）」]*?(?:支払って|捨てて|置いて|公開して|取り除いて|行って|ダウンして|消費して|戻して)もよい)。?そうした場合/g;
  const hits = [];
  let m;
  while ((m = re.exec(text)) !== null) hits.push(m[1].trim());
  return hits;
}

const patched = [];
const skipped = [];
for (const f of files) {
  const path = 'public/data/' + f;
  const d = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [id, effs] of Object.entries(d)) {
    // collect bare OPTIONAL_COST nodes (with parent context = which effect/burst)
    for (const e of effs) {
      const isBurst = (e.effectType === 'LIFE_BURST');
      const text = isBurst ? (BT[id] || ET[id]) : ET[id];
      // walk this effect's action tree
      const bareNodes = [];
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        if (n.type === 'STUB' && n.id === 'OPTIONAL_COST' && !n.costColors && !n.coinCost && !n.costText) bareNodes.push(n);
        for (const v of Object.values(n)) walk(v);
      })(e.action);
      if (bareNodes.length === 0) continue;
      const hits = extractCost(text);
      // 一意に決まる場合のみ適用（bareNode 1個 かつ hit 1個）
      if (bareNodes.length === 1 && hits && hits.length === 1) {
        bareNodes[0].costText = hits[0];
        if (e.parseStatus !== 'MANUAL') e.parseStatus = 'MANUAL';
        patched.push(`${id} ${e.effectId}\t${hits[0]}`);
        changed = true;
      } else {
        skipped.push(`${id} ${e.effectId}\tbareNodes=${bareNodes.length} hits=${JSON.stringify(hits)}`);
      }
    }
  }
  if (changed) fs.writeFileSync(path, JSON.stringify(d) + '\n');
}

console.log('=== PATCHED (' + patched.length + ') ===');
console.log(patched.join('\n'));
console.log('\n=== SKIPPED (' + skipped.length + ') ===');
console.log(skipped.join('\n'));
