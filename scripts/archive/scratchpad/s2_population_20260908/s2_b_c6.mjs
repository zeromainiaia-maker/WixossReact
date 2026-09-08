import { SRC, LIVE, raw, scan } from './tmp_s2_lib.mjs';

const patterns = {
  exactPast: /公開した場合/,
  optionalThen: /公開してもよい。?そうした場合/,
  byThisMethod: /この方法で[^。]{0,20}公開/,
  broad: /公開した場合|公開してもよい。?そうした場合|この方法で[^。]{0,20}公開/,
  grow: /(?=[\s\S]*(?:このカードにグロウする際|グロウするためのコスト))(?=[\s\S]*(?:公開した場合|公開してもよい。?そうした場合|この方法で[^。]{0,20}公開))/,
};

function receipt(json) {
  const s = raw(json);
  return /__lastRevealed__|LAST_REVEALED|lastRevealed|lastProcessedCards|LAST_PROCESSED_(?:MATCHES|COUNT_GTE)|PAID_ADDITIONAL_COST|REVEAL_AND_PICK|REVEAL_DECK_TOP|\"type\":\"REVEAL\"|nameEqLastProcessed|levelLteLastProcessed/.test(s);
}

for (const [name, re] of Object.entries(patterns)) {
  const r = scan(re, receipt);
  console.log(`${name}\t${re}\ttotal=${r.total}\thit=${r.hit.length}\tmiss=${r.miss.length}\tnojson=${r.nojson.length}`);
  if (name === 'broad' || name === 'grow') {
    for (const kind of ['miss', 'nojson']) {
      for (const id of r[kind]) console.log(`${name}\t${kind}\t${id}\t${LIVE[id]?.parseStatus || '-'}\t${(SRC[id] || '').replace(/\s+/g, ' ')}`);
    }
  }
}

for (const id of ['WD13-002-E1', 'WD13-003-E1']) {
  console.log(`KNOWN\t${id}\tbroad=${patterns.broad.test(SRC[id] || '')}\tgrow=${patterns.grow.test(SRC[id] || '')}\t${raw(LIVE[id])}`);
}
