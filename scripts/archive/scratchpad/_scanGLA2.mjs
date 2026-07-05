// GLA ノードの abilities/rawText 充足状況の全数分布
import fs from 'fs';
const files = ['effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json','effects_misc.json'];
let both = 0, abOnly = 0, rawOnly = 0, neither = 0;
const bothIds = [];
for (const f of files) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [cardNum, effects] of Object.entries(j)) {
    for (const eff of effects) {
      const walk = (a) => {
        if (!a || typeof a !== 'object') return;
        if (Array.isArray(a)) { a.forEach(walk); return; }
        if (a.type === 'GRANT_LRIG_ABILITY') {
          const hasAb = a.abilities && a.abilities.length > 0;
          const raw = (a.rawText ?? '').trim();
          const hasRaw = raw && !/^[。、\s]*$/.test(raw);
          if (hasAb && hasRaw) { both++; bothIds.push(eff.effectId); }
          else if (hasAb) abOnly++;
          else if (hasRaw) rawOnly++;
          else neither++;
        }
        for (const v of Object.values(a)) if (typeof v === 'object') walk(v);
      };
      walk(eff.action);
    }
  }
}
console.log({ both, abOnly, rawOnly, neither });
console.log('both ids:', bothIds.slice(0, 40).join(', '));
