import { readFileSync } from 'fs';
import { join } from 'path';

const root = 'C:/Users/zerom/WixossReact';
const files = ['effects_misc.json','effects_WX.json','effects_WX24_26.json','effects_WXDi.json','effects_WXK.json'];
const all = {};
for (const f of files) Object.assign(all, JSON.parse(readFileSync(join(root, 'public/data', f), 'utf-8')));

for (const [num, effs] of Object.entries(all)) {
  for (const e of effs) {
    const a = e.action;
    if (a?.type === 'STUB' && /^GRANT_UNDER_/.test(a.id)) {
      const ac = e.activeCondition ? (e.activeCondition.type + (e.activeCondition.owner ? `:${e.activeCondition.owner}` : '')) : '(なし)';
      console.log(`${a.id}\t${num}/${e.effectId}\teffType=${e.effectType}\tactiveCond=${ac}\tduration=${e.duration}`);
    }
  }
}
