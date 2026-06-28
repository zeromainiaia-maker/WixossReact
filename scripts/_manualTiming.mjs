import { readFileSync, writeFileSync } from 'fs';
// VALUE timing：EXIST が具体トリガーを持ち parser が ON_PLAY に退化した13枚を MANUAL-lock。
// 各 (cardId, EXIST timing) で該当 effect を探して parseStatus=MANUAL。runtime 不変。
const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const data = {}; const fileOf = new Map();
for (const fn of FILES){ const j = JSON.parse(readFileSync(`public/data/${fn}`,'utf-8')); data[fn]=j; for(const k of Object.keys(j)) fileOf.set(k,fn); }
const targets = [
  ['WXK03-024','ON_HAND_DISCARDED'],['WXK03-064','ON_HAND_DISCARDED'],['WXK03-065','ON_HAND_DISCARDED'],
  ['WXK10-070','ON_HAND_DISCARDED'],['WDK10-011','ON_HAND_DISCARDED'],
  ['WXK04-091','ON_SELF_REVEAL_FROM_HAND'],['WDK08-Y15','ON_SELF_REVEAL_FROM_HAND'],
  ['WXK08-074','ON_BECOME_BEAT'],['WXK08-077','ON_BECOME_BEAT'],['WDK14-015','ON_BECOME_BEAT'],['WDK14-017','ON_BECOME_BEAT'],
  ['WDK01-014','ON_SIGNI_BECOMES_DRIVE'],['WDK01-017','ON_SIGNI_BECOMES_DRIVE'],
];
const dirty = new Set();
for (const [id, tm] of targets){
  const fn = fileOf.get(id); if(!fn){console.log(`MISS ${id}`);continue;}
  const e = data[fn][id].find(x => (x.timing||[]).includes(tm));
  if(!e){console.log(`NO-EFF ${id} ${tm}`);continue;}
  e.parseStatus = 'MANUAL'; dirty.add(fn);
  console.log(`MANUAL ${id}/${e.effectId} (${tm})`);
}
for(const fn of dirty){ const out=JSON.stringify(data[fn]); JSON.parse(out); writeFileSync(`public/data/${fn}`,out); }
console.log('done');
