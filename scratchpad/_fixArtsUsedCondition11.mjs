// 2026-07-03 「このターンにあなたがアーツを使用していた場合」条件の無言脱落 系統11枚を是正
// （ARTS_USED_THIS_TURN 条件機構の新設に伴い、curated の該当11効果に condition を付与。effectId アンカー・外科的）
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
const targets = new Set([
  'WXK01-092-E1', 'WXK01-097-E1',
  'WX25-P1-062-E1', 'WX25-P1-082-E1', 'WX25-P1-095-E1', 'WX25-P1-101-E2',
  'WX25-P1-105-E1', 'WX25-P1-106-E1', 'WX25-P1-109-E1', 'WX25-P2-062-E1', 'WX25-P3-112-E1',
]);
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const done = [];
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = readFileSync(p, 'utf8');
  const eol = (raw.match(/(\r?\n)$/) || [, ''])[1];
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body);
  if (JSON.stringify(data) !== body) { console.error(`⚠ ${f} 往復不安定 中断`); process.exit(1); }
  let changed = false;
  for (const effs of Object.values(data)) for (const e of effs) {
    if (!targets.has(e.effectId)) continue;
    if (e.condition) { console.error(`⚠ ${e.effectId} は既に condition あり＝手動確認要`, JSON.stringify(e.condition)); process.exit(1); }
    e.condition = { type: 'ARTS_USED_THIS_TURN', owner: 'self' };
    done.push(e.effectId); changed = true;
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
  console.log(`${f}: ${changed ? '更新' : '-'}`);
}
console.log(`適用 ${done.length}/11:`, done.join(' '), DRY ? '[DRY]' : '[書込完了]');
const miss = [...targets].filter(t => !done.includes(t));
if (miss.length) console.log('⚠未適用:', miss.join(' '));
