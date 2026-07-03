// 2026-07-03 parserWorklist 精査で発見した curated 実バグ4件の是正（effectId アンカー・外科的）
// 1) WX25-P1-106-E1  : 相手ミルの owner 取り違え（owner58 バッチの取り漏らし）self→opponent
// 2) WXDi-P15-055-E3 : 引用【自】付与（相手デッキ6ミル）を「自分デッキ即時6ミル」に平坦化していた誤エンコード
//                      → B4 機構 GRANT_QUOTED_AUTO_ABILITY（引用【自】実発火）へ再エンコード・MANUAL化
// 3) WXEX1-27       : 「シグニ1体を対象とし…効果を受けない…を得る」の GRANT_PROTECTION count:'ALL'→1（protection24 の取り漏らし）
// 4) WXK09-047      : 「このシグニは…を得る」の GRANT_PROTECTION count:'ALL'→1（同上）
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const DRY = process.argv.includes('--dry');
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
function* walk(o) { if (!o || typeof o !== 'object') return; yield o; for (const v of Object.values(o)) if (v && typeof v === 'object') yield* walk(v); }
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
    if (e.effectId === 'WX25-P1-106-E1' && e.action?.type === 'TRASH' && e.action.target?.owner === 'self') {
      e.action.target.owner = 'opponent'; done.push(e.effectId); changed = true;
    }
    if (e.effectId === 'WXDi-P15-055-E3' && e.action?.type === 'TRASH' && e.action.target?.owner === 'self') {
      e.action = { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' };
      e.parseStatus = 'MANUAL'; done.push(e.effectId); changed = true;
    }
    if ((e.effectId?.startsWith('WXEX1-27-') || e.effectId?.startsWith('WXK09-047-'))) {
      for (const n of walk(e)) if (n.type === 'GRANT_PROTECTION' && n.target?.count === 'ALL' && !n.subjectFilter && n.target.owner === 'self') {
        n.target.count = 1; done.push(e.effectId + ':count'); changed = true;
      }
    }
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
  console.log(`${f}: ${changed ? '更新' : '-'}`);
}
console.log('適用:', done.join(' '), DRY ? '[DRY]' : '[書込完了]');
