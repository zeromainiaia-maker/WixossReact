/**
 * 🆕**CPU デッキの候補を戦わせて、ある程度強いものを採用する**（2026-10-21・ユーザー要望）。
 *
 * 使い方：
 *   ① `npx tsx scripts/buildCpuDecks.ts --candidates 2`                         → scratchpad-cpudecks/decks_cpu.json
 *   ② `npx tsx scripts/pickCpuDecks.ts --plan --games 8`                         → 対戦表（同じフォーマットの候補どうし・席は交互）
 *   ③ `npm run selfplay:inv -- --deck-dir scratchpad-cpudecks --pairs-file scratchpad-cpudecks/pairs.json --seeds 1 --jobs 8 --games-out scratchpad-cpudecks/games.txt`
 *   ④ `npx tsx scripts/pickCpuDecks.ts --score [--min 0.4]`                      → 勝率表と scratchpad-cpudecks/decks_adopted.json
 *   ⑤ `node scripts/importDecks.mjs --from scratchpad-cpudecks/decks_adopted.json --kinds cpu --to claude1 --apply`
 *
 * 🆕**基準のデッキと戦わせる**（2026-10-21・ユーザー指定「カルカドールの《ナナシテスト用》に10回戦って4回は勝てる」）＝
 *   対戦表を自分で書いて（候補 × 基準・席を入れ替えて・シード5つ）`--score --dir <dir> --min-wins 4` で採点する。
 *   🔑`--min-wins N`＝**勝ち数で判定する**（止まった試合は勝ちに数えない＝勝率の分母から外さない）。
 *
 * ■ 採用の規則＝**ルリグ（フォーマット × ルリグタイプ）ごとに勝率が一番高い候補**を1つ。その勝率が `--min`（既定 0.4）未満なら採用しない。
 * ⚠対戦は**既定の CPU ポリシー**（実機の CPU と同じ）・対話の乱数なし。⚠1候補あたりの試合数が少ない＝勝率は粗い目安（区間を表に出す）。
 * ⚠止まった試合（決着しない）は勝敗に数えず、表に件数を出す（止まる山は採用しない）。
 */
import fs from 'fs';
import { join } from 'path';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const DIR = arg('--dir', 'scratchpad-cpudecks');
const GAMES = Number(arg('--games', '8'));
const MIN = Number(arg('--min', '0.4'));
const MIN_WINS = argv.includes('--min-wins') ? Number(arg('--min-wins', '0')) : null;
const CPU_ID = '00000000-0000-0000-0000-000000000001';

interface Row { name: string; deck_format: string; _lrigType: string; [k: string]: unknown }
const decks = JSON.parse(fs.readFileSync(join(DIR, 'decks_cpu.json'), 'utf-8')) as Row[];

// 決定論の乱数（対戦表を作り直しても同じになる）
let seed = 20261021;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

if (argv.includes('--plan')) {
  const pairs: [string, string][] = [];
  for (const fmt of ['diva', 'legacy']) {
    const pool = decks.filter(d => d.deck_format === fmt);
    for (const d of pool) {
      // 相手＝同じフォーマットの別ルリグの候補（同じルリグどうしは当てない）
      const opps = pool.filter(o => o._lrigType !== d._lrigType);
      for (let g = 0; g < GAMES; g++) {
        const o = opps[Math.floor(rnd() * opps.length)];
        pairs.push(g % 2 === 0 ? [d.name, o.name] : [o.name, d.name]);
      }
    }
  }
  fs.writeFileSync(join(DIR, 'pairs.json'), JSON.stringify(pairs), 'utf-8');
  console.log(`対戦表 ${pairs.length} 試合（候補 ${decks.length}・1候補あたり ${GAMES} 試合を自分から組む＝相手としても出る）→ ${join(DIR, 'pairs.json')}`);
  process.exit(0);
}

if (argv.includes('--score')) {
  const lines = fs.readFileSync(join(DIR, 'games.txt'), 'utf-8').split(/\r?\n/).filter(l => / steps=/.test(l));
  const st = new Map<string, { w: number; l: number; stall: number }>();
  const get = (n: string) => st.get(n) ?? st.set(n, { w: 0, l: 0, stall: 0 }).get(n)!;
  for (const l of lines) {
    const m = /^(.*) vs (.*) s\d+: (\w+).* winner=(\S+)/.exec(l);
    if (!m) continue;
    const [, a, b, reason, winner] = m;
    if (reason !== 'finished' || winner === '-') { get(a).stall++; get(b).stall++; continue; }
    const bWon = winner === CPU_ID;   // guest 席＝B
    get(bWon ? b : a).w++; get(bWon ? a : b).l++;
  }
  /** Wilson 95% 区間（試合数が少ないので正規近似より安全）。 */
  const wilson = (w: number, n: number) => {
    if (n === 0) return [0, 1];
    const z = 1.96, p = w / n, den = 1 + z * z / n;
    const c = (p + z * z / (2 * n)) / den, h = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den;
    return [Math.max(0, c - h), Math.min(1, c + h)];
  };
  const rate = (n: string) => { const s = get(n); const t = s.w + s.l; return t ? s.w / t : 0; };
  const adopted: Row[] = [];
  const out: string[] = [];
  for (const fmt of ['diva', 'legacy']) {
    if (!decks.some(x => x.deck_format === fmt)) continue;
    out.push(`\n=== ${fmt === 'diva' ? 'ディーバ' : 'レガシー'} ===`);
    const byLrig = new Map<string, Row[]>();
    for (const d of decks.filter(x => x.deck_format === fmt)) (byLrig.get(d._lrigType) ?? byLrig.set(d._lrigType, []).get(d._lrigType)!).push(d);
    const rows = [...byLrig].map(([t, cands]) => {
      const best = [...cands].sort((x, y) => MIN_WINS !== null ? get(y.name).w - get(x.name).w || get(x.name).stall - get(y.name).stall
        : Number(get(x.name).stall > 0) - Number(get(y.name).stall > 0) || rate(y.name) - rate(x.name))[0];
      return { t, best, cands };
    }).sort((x, y) => rate(y.best.name) - rate(x.best.name));
    for (const { best, cands } of rows) {
      const s = get(best.name); const n = s.w + s.l; const [lo, hi] = wilson(s.w, n);
      const ok = MIN_WINS !== null ? s.w >= MIN_WINS : rate(best.name) >= MIN && s.stall === 0 && n > 0;
      if (ok) adopted.push(best);
      out.push(`${ok ? '✅' : '  '} ${(rate(best.name) * 100).toFixed(0).padStart(3)}% [${(lo * 100).toFixed(0)}-${(hi * 100).toFixed(0)}] ${s.w}-${s.l}${s.stall ? ` 止まり${s.stall}` : ''}  ${best.name}`
        + (cands.length > 1 ? `   （他の候補: ${cands.filter(c => c !== best).map(c => MIN_WINS !== null ? `${get(c.name).w}勝` : `${(rate(c.name) * 100).toFixed(0)}%`).join(' ')}）` : ''));
    }
  }
  console.log(out.join('\n'));
  // 採用した山は内部の印（`_` で始まるキー）を落として書く
  const clean = adopted.map(d => Object.fromEntries(Object.entries(d).filter(([k]) => !k.startsWith('_'))));
  fs.writeFileSync(join(DIR, 'decks_adopted.json'), JSON.stringify(clean, null, 1), 'utf-8');
  console.log(`\n採用 ${adopted.length} / ${new Set(decks.map(d => `${d.deck_format}|${d._lrigType}`)).size} ルリグ（${MIN_WINS !== null ? `${MIN_WINS}勝以上` : `勝率 ${Math.round(MIN * 100)}% 以上・止まり0`}）→ ${join(DIR, 'decks_adopted.json')}`);
}
