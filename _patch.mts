import { readFileSync, writeFileSync } from 'fs';
import { MANUAL_EFFECTS } from './src/data/manualEffects.ts';

const FILES = ['effects_WX', 'effects_WXDi', 'effects_WX24_26', 'effects_WXK', 'effects_misc'];
const dir = './public/data/';

// 形式を検出して保持するシリアライズ
function serializeLike(raw: string, db: unknown): string {
  const pretty = /\{\r?\n\s+"/.test(raw);
  const crlf = raw.includes('\r\n');
  let out = pretty ? JSON.stringify(db, null, 2) : JSON.stringify(db);
  if (crlf) out = out.replace(/\n/g, '\r\n');
  if (raw.endsWith('\n') && !out.endsWith('\n')) out += crlf ? '\r\n' : '\n';
  return out;
}

const SCOPE_ONLY = ['WX11-025', 'WX12-001', 'WX12-035', 'WX14-003', 'WX14-050', 'WX14-052', 'WX14-053', 'WXK06-076', 'WXDi-D06-012', 'WXDi-P02-052', 'WXDi-P08-007'];
const MANUAL_CARDS = ['WX04-029', 'WX12-010', 'WD07-012'];

const report: string[] = [];

for (const f of FILES) {
  const path = dir + f + '.json';
  const raw = readFileSync(path, 'utf-8');
  const db = JSON.parse(raw) as Record<string, any[]>;
  let touched = false;

  for (const card of SCOPE_ONLY) {
    if (!db[card]) continue;
    for (const e of db[card]) {
      if ((e.timing ?? []).includes('ON_ATTACK_SIGNI') && e.triggerScope === undefined) {
        e.triggerScope = 'any_opp';
        touched = true;
        report.push(`[scope] ${card} ${e.effectId} (${f})`);
      }
    }
  }
  for (const card of MANUAL_CARDS) {
    if (!db[card]) continue;
    db[card] = MANUAL_EFFECTS[card];
    touched = true;
    report.push(`[manual] ${card} (${f})`);
  }

  if (touched) writeFileSync(path, serializeLike(raw, db), 'utf-8');
}

console.log(report.join('\n'));
console.log('\n合計:', report.length, '件パッチ');
