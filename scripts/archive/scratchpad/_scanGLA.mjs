// GRANT_LRIG_ABILITY で abilities が空 or 無し＋rawText が実質あるノードを全JSON走査
import fs from 'fs';
const files = ['effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json','effects_misc.json'];
let hits = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [cardNum, effects] of Object.entries(j)) {
    for (const eff of effects) {
      const walk = (a, path) => {
        if (!a || typeof a !== 'object') return;
        if (Array.isArray(a)) { a.forEach((x,i)=>walk(x, `${path}[${i}]`)); return; }
        if (a.type === 'GRANT_LRIG_ABILITY') {
          const empty = !a.abilities || a.abilities.length === 0;
          const raw = (a.rawText ?? '').trim();
          const punctOnly = /^[。、\s]*$/.test(raw);
          if (empty && !punctOnly) hits.push({ f, cardNum, effectId: eff.effectId, effectType: eff.effectType, parseStatus: eff.parseStatus, path, raw: raw.slice(0,60) });
        }
        for (const [k,v] of Object.entries(a)) if (typeof v === 'object') walk(v, `${path}.${k}`);
      };
      walk(eff.action, 'action');
    }
  }
}
console.log(`計 ${hits.length} ノード`);
for (const h of hits) console.log(`${h.f}\t${h.effectId}\t${h.effectType}/${h.parseStatus}\t${h.path}\t${h.raw}`);
