import { readFileSync, writeFileSync } from 'fs';

function patch(file, id, effId, fn) {
  const path = `public/data/${file}`;
  const j = JSON.parse(readFileSync(path, 'utf-8'));
  const arr = j[id];
  if (!arr) throw new Error(`no card ${id}`);
  const e = arr.find(x => x.effectId === effId);
  if (!e) throw new Error(`no effect ${effId}`);
  fn(e);
  writeFileSync(path, JSON.stringify(j));
  console.log(`patched ${effId}`);
}

// WXK10-025-E1: 効果ドローで相手シグニ-4000（ON_DRAW・self・twice_per_turn）
patch('effects_WXK.json', 'WXK10-025', 'WXK10-025-E1', e => {
  e.timing = ['ON_DRAW'];
  e.triggerScope = 'self';
  e.parseStatus = 'MANUAL';
});

// WXK10-040-E1: あなたのターン中の効果ドローでこのシグニ+1000（ON_DRAW・self・turnOwner self・thisCardOnly）
patch('effects_WXK.json', 'WXK10-040', 'WXK10-040-E1', e => {
  e.timing = ['ON_DRAW'];
  e.triggerScope = 'self';
  e.triggerCondition = { ...(e.triggerCondition ?? {}), turnOwner: 'self' };
  e.action.target.filter = { ...(e.action.target.filter ?? {}), thisCardOnly: true };
  e.parseStatus = 'MANUAL';
});

// WXDi-P12-048-E1: ディソナ手札捨てで相手シグニ-3000（ON_HAND_DISCARDED・self・isDisona filter）
patch('effects_WXDi.json', 'WXDi-P12-048', 'WXDi-P12-048-E1', e => {
  e.timing = ['ON_HAND_DISCARDED'];
  e.triggerScope = 'self';
  e.triggerFilter = { isDisona: true };
  e.parseStatus = 'MANUAL';
});
