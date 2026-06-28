import fs from 'fs';
import Papa from 'papaparse';

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

// 手動指定（truncation 是正・特殊構造）
const manual = {
  'WXDi-CP02-056': '「手札を２枚捨てる」を行ってもよい',
  'WDK12-015': '《緑》を支払い、あなたの場にある【チャーム】１枚をトラッシュに置いてもよい',
};

// 「使用コストとして追加で…してもよい」（追加コスト・そうした場合なし）を抽出
function extractAddl(text) {
  if (!text) return null;
  const m = text.match(/使用コストとして追加で[^。（）]*?もよい/);
  return m ? m[0] : null;
}

const patched = [];
const stillBare = [];
for (const f of files) {
  const path = 'public/data/' + f;
  const d = JSON.parse(fs.readFileSync(path, 'utf8'));
  let changed = false;
  for (const [id, effs] of Object.entries(d)) {
    for (const e of effs) {
      const isBurst = (e.effectType === 'LIFE_BURST');
      const text = isBurst ? (BT[id] || ET[id]) : ET[id];
      const isManual = !!manual[id];
      const bareNodes = [];
      (function walk(n) {
        if (!n || typeof n !== 'object') return;
        if (Array.isArray(n)) { n.forEach(walk); return; }
        // manual 指定カードは costText 上書き許可（truncation 是正）
        if (n.type === 'STUB' && n.id === 'OPTIONAL_COST' && !n.costColors && !n.coinCost && (isManual || !n.costText)) bareNodes.push(n);
        for (const v of Object.values(n)) walk(v);
      })(e.action);
      if (bareNodes.length === 0) continue;
      let ct = null;
      if (manual[id]) ct = manual[id];
      else if (bareNodes.length === 1) ct = extractAddl(text);
      if (ct && bareNodes.length === 1) {
        bareNodes[0].costText = ct;
        if (e.parseStatus !== 'MANUAL') e.parseStatus = 'MANUAL';
        patched.push(`${id} ${e.effectId}\t${ct}`);
        changed = true;
      } else {
        stillBare.push(`${id} ${e.effectId}`);
      }
    }
  }
  if (changed) fs.writeFileSync(path, JSON.stringify(d) + '\n');
}
console.log('=== PATCHED (' + patched.length + ') ===');
console.log(patched.join('\n'));
console.log('\n=== STILL BARE (' + stillBare.length + ') ===');
console.log(stillBare.join('\n'));
