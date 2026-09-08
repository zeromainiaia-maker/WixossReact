import { SRC, LIVE_BY_CARD, raw } from './tmp_s2_lib.mjs';

const rows = [];
for (const [cardNum, effects] of Object.entries(LIVE_BY_CARD)) {
  const rideOn = effects.filter(e => raw(e).includes('"id":"RIDE_ON"'));
  const centerRide = effects.filter(e => raw(e).includes('"id":"CENTER_LRIG_RIDES_ON_SIGNI"'));
  if (!rideOn.length || !centerRide.length) continue;
  const sourceEffects = Object.entries(SRC).filter(([id]) => id.startsWith(`${cardNum}-`));
  const rideMarkCount = sourceEffects.reduce((n, [, src]) => n + (src.match(/【ライド】/g) || []).length, 0);
  rows.push({ cardNum, rideOn, centerRide, sourceEffects, rideMarkCount });
}

console.log(`cards=${rows.length} duplicateEffects=${rows.reduce((n, x) => n + x.centerRide.length, 0)}`);
for (const row of rows) {
  console.log(`${row.cardNum}\tRIDE_ON=${row.rideOn.map(e => e.effectId).join(',')}\tCENTER=${row.centerRide.map(e => e.effectId).join(',')}\tSRC_【ライド】=${row.rideMarkCount}`);
  for (const [id, src] of row.sourceEffects) console.log(`${id}\t${src.replace(/\s+/g, ' ')}`);
}
