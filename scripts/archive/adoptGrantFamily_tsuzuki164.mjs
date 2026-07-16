// §3 Opusタスク1: 2文型引用付与家族＋「支払わないかぎり」ゲートの fresh 採用（14効果）
// dump_after.json（新 parser の全カード出力）から対象 effectId のみを curated へ移植する。
import fs from 'node:fs';

const after = JSON.parse(fs.readFileSync(process.env.TEMP + '/dump_after.json', 'utf8'));

// file -> { cardNum -> [effectIds to adopt] }
const plan = {
  'public/data/effects_WXK.json': {
    'WXK10-080': ['WXK10-080-E2'],
  },
  'public/data/effects_WXDi.json': {
    'WXDi-P09-052': ['WXDi-P09-052-E1'],
    'WXDi-P12-047': ['WXDi-P12-047-E2'],
    'WXDi-P15-084': ['WXDi-P15-084-E1'],
    'WXDi-CP02-079': ['WXDi-CP02-079-E1'],
  },
  'public/data/effects_WX24_26.json': {
    'WX24-P2-018': ['WX24-P2-018-E1'],
    'WX24-P2-079': ['WX24-P2-079-E1'],
    'WX25-P1-057': ['WX25-P1-057-E1'],
    'WX25-P2-053': ['WX25-P2-053-E2'],
    'WX25-P2-115': ['WX25-P2-115-E1'],
    'WX25-P3-089': ['WX25-P3-089-E1'],
    'WX25-CP1-001': ['WX25-CP1-001-E1'],
    'WX25-CP1-032': ['WX25-CP1-032-E1'],
    'WX26-CP1-077': ['WX26-CP1-077-SONG'],
  },
};

let total = 0;
for (const [file, cards] of Object.entries(plan)) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [cardNum, effIds] of Object.entries(cards)) {
    const cur = j[cardNum];
    const fresh = after[cardNum];
    if (!cur || !fresh) { console.error('MISSING', cardNum); process.exitCode = 1; continue; }
    for (const eid of effIds) {
      const ci = cur.findIndex(e => e.effectId === eid);
      const fi = fresh.findIndex(e => e.effectId === eid);
      if (ci < 0 || fi < 0) { console.error('EFFECT NOT FOUND', eid, ci, fi); process.exitCode = 1; continue; }
      cur[ci] = fresh[fi];
      total++;
      console.log('adopted', eid);
    }
  }
  fs.writeFileSync(file, JSON.stringify(j), 'utf8');
  console.log('written', file);
}
console.log('total adopted:', total);
