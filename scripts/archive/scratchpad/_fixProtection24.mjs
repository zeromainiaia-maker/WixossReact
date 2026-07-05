// GRANT_PROTECTION 単体保護24件：count:'ALL'→1（保護コレクタの count===1 分岐を発火させ source を保護）
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
const ids = new Set('WX07-023-E2 WX08-005-E2 WX08-017-E1 WX09-017-E2 WX09-018-E1 WX11-032-E2 WX11-036-E1 WX12-018-E1 WX13-034-E1 WX13-053-E2 WX15-031-LAYER WX16-024-LAYER WX16-034-LAYER WX16-053-LAYER WX16-Re09-E1 WX17-025-E3 WX18-034-E1 WX18-035-E1 WX19-046-E1 WX20-024-E1 WX20-052-E2 WXEX1-35-E1 WXK03-042-E2 WXK08-038-E1'.split(' '));
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
function* walk(o) { if (!o || typeof o !== 'object') return; yield o; for (const v of Object.values(o)) if (v && typeof v === 'object') yield* walk(v); }
let flips = 0; const hit = new Set();
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = readFileSync(p, 'utf8');
  const eol = (raw.match(/(\r?\n)$/) || [, ''])[1];
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body);
  if (JSON.stringify(data) !== body) { console.error(`⚠ ${f} 往復不安定 中断`); process.exit(1); }
  let changed = false;
  for (const effs of Object.values(data)) for (const e of effs) {
    if (!ids.has(e.effectId)) continue;
    for (const n of walk(e)) if (n.type === 'GRANT_PROTECTION' && n.target?.count === 'ALL' && !n.subjectFilter && n.target.owner === 'self') {
      n.target.count = 1; flips++; hit.add(e.effectId); changed = true;
    }
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
  console.log(`${f}: ${changed ? '更新' : '-'}`);
}
console.log(`\nflip ${flips} / effectId ${hit.size} (期待24)`);
const miss = [...ids].filter(i => !hit.has(i)); if (miss.length) console.log('⚠未適用:', miss.join(' '));
console.log(DRY ? '[DRY]' : '[書込完了]');
