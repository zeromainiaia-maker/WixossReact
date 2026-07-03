import fs from 'fs';
const ids = ['WXDi-P08-009','WX08-024','WXDi-CP01-026','WXDi-CP02-070','WX25-CP1-051','WX16-016','WX03-030'];
// 原文
const files = fs.readdirSync('public/data').filter(f => f.startsWith('CardData_') && f.endsWith('.csv'));
for (const f of files) {
  const lines = fs.readFileSync('public/data/' + f, 'utf8').split('\n');
  for (const line of lines) {
    const cols = line.split(',');
    if (ids.includes(cols[0])) {
      const text = cols.slice(18).join(',');
      const rel = text.split(/[。]/).filter(s => s.includes('最も'));
      console.log('【' + cols[0] + '】原文(該当文): ' + rel.join('。'));
    }
  }
}
// SEQUENCE 中身
const effFiles = fs.readdirSync('public/data').filter(f => f.startsWith('effects_') && f.endsWith('.json'));
const all = {};
for (const f of effFiles) Object.assign(all, JSON.parse(fs.readFileSync('public/data/' + f, 'utf8')));
for (const id of ['WXDi-CP01-026','WXDi-CP02-070','WX25-CP1-051','WX08-024']) {
  console.log('=== ' + id + ' JSON全文(該当effectのみ) ===');
  for (const e of all[id] || []) {
    const s = JSON.stringify(e);
    if (s.includes('BOUNCE') || s.includes('BANISH') || s.includes('POWER') || s.includes('LOWEST') || s.includes('powerRange')) {
      console.log(JSON.stringify(e).slice(0, 900));
      console.log('---');
    }
  }
}
