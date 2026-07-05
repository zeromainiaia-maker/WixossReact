import fs from 'fs';
// 最上級フィルタ該当カードの JSON 表現を確認
const ids = ['SP07-010','WXDi-P08-009','WX08-024','WXDi-CP01-026','WXDi-CP02-070','WX25-CP1-051','WX16-016','WX03-030'];
const files = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of files) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));
for (const id of ids) {
  const effs = all[id];
  console.log('=== ' + id + ' ===');
  if (!effs) { console.log('  (JSONなし)'); continue; }
  const s = JSON.stringify(effs);
  const hit = s.match(/LOWEST|HIGHEST|MIN_|MAX_|STUB[^"]*/g);
  console.log('  最上級らしき語彙:', hit ? [...new Set(hit)].join(' ') : 'なし');
  for (const e of effs) {
    // action ツリーの type と target を要約
    const acts = [];
    (function walk(n){ if(!n||typeof n!=='object')return; if(Array.isArray(n)){n.forEach(walk);return;}
      if(n.type && (n.target||n.filter||n.type.match(/^[A-Z_]+$/))) acts.push(n.type + (n.target?`(owner:${n.target.owner},count:${n.target.count},filter:${JSON.stringify(n.target.filter||{})})`:'') );
      for(const k of ['action','actions','then','else','thenAction','choices']) walk(n[k]); })(e.action||e.actions||e);
    console.log('  ' + e.effectId + ' [' + e.parseStatus + ']: ' + acts.slice(0,5).join(' → '));
  }
}
