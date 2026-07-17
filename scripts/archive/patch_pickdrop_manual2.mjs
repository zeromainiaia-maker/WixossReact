// SPDi43-28-E2 / WX25-P3-001-E1: MANUAL兄弟温存カードのため heldReview 採用対象外。
// pick脱落（LOOK_AND_REORDER縮退）の該当アクションだけを effectId アンカーで外科的にパッチする。
import fs from 'fs';

const rap = (revealCount, pickCount) => ({
  type: 'REVEAL_AND_PICK', owner: 'self', revealCount, pickCount, pickUpTo: true,
  then: { type: 'ADD_TO_HAND', owner: 'self' },
  remainder: { location: 'deck', position: 'bottom' },
});

const patch = (file, id, effectId, apply) => {
  const p = 'public/data/' + file;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const eff = (j[id] ?? []).find(e => e.effectId === effectId);
  if (!eff) { console.error('NOT FOUND', effectId); process.exit(1); }
  apply(eff);
  fs.writeFileSync(p, JSON.stringify(j), 'utf-8');
  console.log('patched', effectId);
};

// SPDi43-28-E2: 「デッキの上からカードを５枚見る。その中からカードを１枚まで手札に加え、残りを好きな順番でデッキの一番下に置く。」
patch('effects_misc.json', 'SPDi43-28', 'SPDi43-28-E2', eff => {
  if (eff.action?.type !== 'LOOK_AND_REORDER') { console.error('unexpected shape SPDi43-28-E2', eff.action?.type); process.exit(1); }
  eff.action = rap(5, 1);
});

// WX25-P3-001-E1: steps[0] が同縮退（後続の RECOLLECT_GATE 等は温存）
patch('effects_WX24_26.json', 'WX25-P3-001', 'WX25-P3-001-E1', eff => {
  const s0 = eff.action?.steps?.[0];
  if (s0?.type !== 'LOOK_AND_REORDER' || s0.count !== 5) { console.error('unexpected shape WX25-P3-001-E1', s0?.type); process.exit(1); }
  eff.action.steps[0] = rap(5, 1);
});
