// 純・相手のみ58枚：TRASH DECK_CARD owner:'self' → 'opponent' に flip
// 安全策：①往復安定性チェック（stringify(parse(raw))===raw）②対象58枚のみ ③flip件数を報告
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const DRY = process.argv.includes('--dry');
const root = process.cwd();
const pure = 'WXDi-D06-011 WXDi-P02-046 WXDi-P04-004 WXDi-P04-016 WXDi-P05-030 WXDi-P06-040 WXDi-P06-041 WXDi-P07-048 WXDi-P09-081 WXDi-P10-028 WXDi-P11-008 WXDi-P11-077 WXDi-P13-010 WXDi-P13-053 WXDi-P13-055 WXDi-P13-086 WXDi-P14-066 WXDi-P15-038 WXDi-P15-073 WXDi-P16-053 WXDi-P16-093 WXDi-CP01-002 WXDi-CP01-032 WXDi-CP01-044 WXDi-CP01-048 WXDi-CP02-004 WXDi-CP02-047 WXDi-CP02-062 WXDi-CP02-093 WXDi-CP02-096 WXDi-CP02-100 WXDi-CP02-102 WX24-P1-009 WX24-P2-046 WX24-P3-039 WX24-P4-085 WX25-P1-009 WX25-P1-062 WX25-P2-030 WX25-P2-061 WX25-P2-105 WX25-P3-050 WX25-CP1-047 WX25-CP1-086 WX25-CP1-088 WX25-CP1-091 WX25-CP1-092 WX26-CP1-009 WX26-CP1-094 WX24-D5-05 WX24-D5-15 WX24-D5-20 WXK09-060 WDK10-013 SPDi43-02 SPDi43-07 SPDi43-10 PR-Di035'.split(' ');
const pureSet = new Set(pure);
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];

function* walk(o) {
  if (!o || typeof o !== 'object') return;
  yield o;
  for (const v of Object.values(o)) if (v && typeof v === 'object') yield* walk(v);
}

let totalFlips = 0, cardsHit = new Set();
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = readFileSync(p, 'utf8');
  const eolMatch = raw.match(/(\r?\n)$/);
  const eol = eolMatch ? eolMatch[1] : '';
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body);
  // 往復安定性チェック（末尾EOLを除いた本体が完全一致すること）
  if (JSON.stringify(data) !== body) {
    console.error(`⚠ ${f}: 往復不安定（整形差）＝安全のため中断。`);
    console.error(`  body.len=${body.length} restr.len=${JSON.stringify(data).length}`);
    process.exit(1);
  }
  let flips = 0;
  for (const [num, effs] of Object.entries(data)) {
    if (!pureSet.has(num)) continue;
    for (const node of walk(effs)) {
      if (node.type === 'TRASH' && node.target?.type === 'DECK_CARD' && node.target?.owner === 'self') {
        node.target.owner = 'opponent';
        flips++; cardsHit.add(num);
      }
    }
  }
  totalFlips += flips;
  if (flips && !DRY) writeFileSync(p, JSON.stringify(data), 'utf8');
  console.log(`${f}: ${flips} flips${flips && !DRY ? ' (written)' : ''}`);
}
console.log(`\n合計 flip=${totalFlips} / card=${cardsHit.size} (期待 card=58)`);
const missed = pure.filter(n => !cardsHit.has(n));
if (missed.length) console.log('⚠ flipされなかったカード:', missed.join(' '));
console.log(DRY ? '\n[DRY RUN — 書き込みなし]' : '\n[書き込み完了]');
