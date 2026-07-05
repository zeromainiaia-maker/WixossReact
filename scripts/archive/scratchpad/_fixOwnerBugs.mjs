import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
// exposed by IS_MY_TURN batch (parser修正→乖離収穫): curated の then owner が原文「対戦相手のデッキ」に反する self
// ＋ WXDi-P11-082-BURST の noGuard フィルタ脱落
const done = [];
function patch(effs) {
  let ch = false;
  for (const e of effs) {
    if (e.effectId === 'WX24-P3-088-E1' || e.effectId === 'WXDi-P11-082-E2') {
      // SEQUENCE step[1].then.target.owner self→opponent
      const steps = e.action?.steps ?? [];
      for (const s of steps) {
        if (s.type === 'CONDITIONAL' && s.then?.type === 'TRASH' && s.then.target?.type === 'DECK_CARD' && s.then.target.owner === 'self') {
          s.then.target.owner = 'opponent'; ch = true; done.push(e.effectId + ':then owner→opponent');
        }
      }
    }
    if (e.effectId === 'WXDi-P11-082-BURST') {
      const f = e.action?.source?.filter;
      if (f && !f.noGuard) { f.noGuard = true; ch = true; done.push(e.effectId + ':filter noGuard'); }
    }
  }
  return ch;
}
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = readFileSync(p, 'utf8');
  const eol = (raw.match(/(\r?\n)$/) ?? ['', ''])[1];
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body);
  if (JSON.stringify(data) !== body) { console.error(`⚠ ${f} 往復不安定 中断`); process.exit(1); }
  let changed = false;
  for (const [id, effs] of Object.entries(data)) {
    if (!['WX24-P3-088', 'WXDi-P11-082'].includes(id)) continue;
    if (patch(effs)) changed = true;
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
}
console.log('patched:', done.join(' | '));
