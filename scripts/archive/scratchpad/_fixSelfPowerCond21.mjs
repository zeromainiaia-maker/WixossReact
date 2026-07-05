// 2026-07-03 「このシグニのパワーがN以上の場合」条件の無言脱落 系統21枚を是正
// （parser の条件昇格を同時追加済み。effectId アンカーで condition SELF_POWER_GTE を付与）
// ⚠除外＝「代わりに」昇格型(WXDi-P01-054/WXDi-P12-067)・多段閾値型(PR-470A/WXDi-D01-016)・【起】型(WXDi-P03-062)＝PLAN §6.3 登録
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
const spec = {
  'WX09-034-E3': 20000, 'WX13-085-E2': 20000, 'WX16-031-E3': 15000, 'WX22-Re02-E1': 10000,
  'WXK01-046-E1': 10000, 'WXK01-058-E1': 10000, 'WXK01-061-E1': 3000, 'WXK02-058-E1': 12000,
  'WXK05-042-E2': 12000, 'WXK05-073-E1': 7000, 'WXK09-053-E1': 5000, 'WXK10-046-E2': 7000,
  'WXK11-055-E1': 10000, 'WXDi-P01-072-E1': 5000, 'WXDi-P02-061-E1': 8000, 'WXDi-P06-058-E1': 8000,
  'WXDi-P14-077-E2': 15000, 'WX24-P1-075-E1': 10000, 'WX24-P1-081-E1': 5000, 'WX24-P4-076-E1': 5000,
  'WX25-P2-113-E2': 10000,
};
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
    if (!(e.effectId in spec)) continue;
    if (e.condition) { console.error(`⚠ ${e.effectId} は既に condition あり`, JSON.stringify(e.condition)); process.exit(1); }
    e.condition = { type: 'SELF_POWER_GTE', value: spec[e.effectId] };
    done.push(e.effectId); changed = true;
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
  console.log(`${f}: ${changed ? '更新' : '-'}`);
}
console.log(`適用 ${done.length}/21:`, done.join(' '));
const miss = Object.keys(spec).filter(k => !done.includes(k));
if (miss.length) console.log('⚠未適用:', miss.join(' '));
console.log(DRY ? '[DRY]' : '[書込完了]');
