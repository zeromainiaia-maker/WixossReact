// タスク12(lxxxi) 残テール：MANUAL/PRESERVE 保護で build:effects が届かない2効果の外科パッチ。
// 先頭の STUB OPTIONAL_COST（＝使用時の任意支払いを解決中にもう一度聞く形）だけを落とす。
import { readFileSync, writeFileSync } from 'fs';
const path = 'public/data/effects_WX.json';
const data = JSON.parse(readFileSync(path, 'utf-8'));
let changed = 0;
for (const num of ['WX21-035', 'WX21-071']) {
  const eff = data[num]?.[0];
  const steps = eff?.action?.steps;
  if (!Array.isArray(steps)) { console.log(`${num}: SEQUENCE でない → skip`); continue; }
  if (!(steps[0]?.type === 'STUB' && steps[0]?.id === 'OPTIONAL_COST')) { console.log(`${num}: 先頭が OPTIONAL_COST でない → skip`); continue; }
  eff.action = { ...eff.action, steps: steps.slice(1) };
  changed++;
  console.log(`${num}: OPTIONAL_COST を除去 → ${JSON.stringify(eff.action.steps.map(s => s.id ?? s.type))}`);
}
if (changed > 0) writeFileSync(path, JSON.stringify(data), 'utf-8');
console.log(`計 ${changed} 効果`);
