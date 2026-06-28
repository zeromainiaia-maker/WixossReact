import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten・「場に出たとき」クロス/ライズアイコン（matchesFilter に hasCrossIcon/hasRiseIcon 追加済み）。
const d = JSON.parse(readFileSync('public/data/effects_WX.json', 'utf-8'));
const find = effId => d[effId.replace(/-E\d+.*$/, '')].find(e => e.effectId === effId);
const ops = [
  ['WX07-002-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={hasCrossIcon:true};}],
  ['WX07-004-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={hasCrossIcon:true};}],
  ['WX07-005-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={hasCrossIcon:true};}],
  ['WX08-001-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={hasCrossIcon:true};}],
  ['WX16-026-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={hasRiseIcon:true};}],
  ['WX22-Re01-E1', e=>{e.timing=['ON_PLAY'];e.triggerScope='any_ally';e.triggerFilter={hasRiseIcon:true};e.action.target={type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}};}],
];
for (const [effId, fn] of ops) { const e = find(effId); if(!e){console.log(`MISS ${effId}`);continue;} fn(e); e.parseStatus='MANUAL'; console.log(`FIXED ${effId}`); }
const out = JSON.stringify(d); JSON.parse(out); writeFileSync('public/data/effects_WX.json', out);
console.log('done');
