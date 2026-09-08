import { SRC, LIVE, raw, scan, walkNodes } from './tmp_s2_lib.mjs';

const COLORS = '白黒赤青緑無';
const trials = {
  ownerStrict: new RegExp(`(?:あなた|対戦相手)の([${COLORS}])の[^。、]{0,16}(?:ルリグ|シグニ)[^。、]{0,8}を(?:対象とし|対象に)`),
  directColor: new RegExp(`([${COLORS}])(?:色)?の[^。、]{0,16}(?:ルリグ|シグニ)[^。、]{0,8}を(?:対象とし|対象に)`),
  directColorWide: new RegExp(`([${COLORS}])(?:色)?の[^。]{0,16}(?:ルリグ|シグニ)[^。]{0,8}を(?:対象とし|対象に)`),
  withUnder: new RegExp(`([${COLORS}])(?:色)?の[^。、]{0,16}(?:ルリグ|シグニ)[^。、]{0,16}を(?:対象とし|対象に)|[^。、]{0,20}(?:にある|から)([${COLORS}])(?:色)?の[^。、]{0,12}(?:ルリグ|シグニ)[^。、]{0,8}を(?:対象とし|対象に)`),
  adopted: new RegExp(`([${COLORS}](?:か[${COLORS}])*)(?:色)?の(?:(?!ルリグ|シグニ|[。、：]).){0,16}(?:ルリグ|シグニ)[^。、：]{0,8}を(?:対象とし|対象に)`),
};

function compact(s = '') { return s.replace(/\s+/g, ' '); }
function colorInSource(src) {
  const m = src.match(trials.adopted);
  return m?.[1];
}
function receipt(json, id, src) {
  const expected = [...(colorInSource(src) || '').matchAll(/[白黒赤青緑無]/g)].map(m => m[0]);
  if (!expected.length) return false;
  const receipts = new Set();
  const addFilter = f => {
    if (!f || typeof f !== 'object') return;
    const c = f.color ?? f.colors ?? f.colorIn ?? f.cardColor;
    for (const v of (Array.isArray(c) ? c : c ? [c] : [])) receipts.add(v);
    if (f.colorMatchesLrig) receipts.add('__dynamic__');
  };
  walkNodes(json?.action, n => {
    addFilter(n.target); addFilter(n.target?.filter);
    addFilter(n.source); addFilter(n.source?.filter);
    addFilter(n.selectTarget); addFilter(n.selectTarget?.filter);
    addFilter(n.triggerFilter);
    if (!['CONDITIONAL', 'AND', 'OR'].includes(n.type)) addFilter(n.filter);
  });
  // Some typed payloads live below keys outside tmp_s2_lib's structural allow-list
  // (anyOf / powerPlusBanishedPower / extraCostChoose).  Inspect only action JSON,
  // never the top-level cost, so printed payment colors cannot become a false HIT.
  const actionRaw = raw(json?.action);
  const nestedPayloadHasAll = expected.every(c => actionRaw.includes(`\"color\":\"${c}\"`)
    || actionRaw.includes(`\"color\":[`) && actionRaw.includes(`\"${c}\"`));
  return receipts.has('__dynamic__') || expected.every(c => receipts.has(c)) || nestedPayloadHasAll;
}

for (const [name, re] of Object.entries(trials)) {
  const ids = Object.entries(SRC).filter(([, src]) => re.test(src)).map(([id]) => id);
  console.log(`TRIAL ${name} ${re} count=${ids.length}`);
  if (name !== 'adopted') continue;
  const r = scan(re, receipt);
  for (const kind of (process.argv.includes('--miss-only') ? ['miss', 'nojson'] : ['hit', 'miss', 'nojson'])) {
    console.log(`\n${kind.toUpperCase()} ${r[kind].length}`);
    for (const id of r[kind]) {
      console.log(`${id}\t${LIVE[id]?.parseStatus || '-'}\tcolor=${colorInSource(SRC[id])}\t${compact(SRC[id])}`);
      if (kind === 'miss') console.log(raw(LIVE[id]));
    }
  }
}

console.log('\nREFERENCE IDS');
for (const id of ['WXDi-P03-035-E1', 'WXDi-P06-059-E1', 'PR-457-E2']) {
  console.log(`${id}\tadopted=${trials.withUnder.test(SRC[id] || '')}\t${compact(SRC[id])}\n${raw(LIVE[id])}`);
}
