/**
 * CPU デッキの山登り（2026-10-22・ユーザー要望「レガシーの CPU デッキを、ナナシテスト用に10戦4勝できる強さに作り直す」）。
 *
 * ルリグごとに今のデッキを1か所だけ入れ替えた変異を作り、基準デッキ（`--ref`・既定 ナナシテスト用）と
 * `--seeds` × 両席で戦わせ、勝数が落ちなければ採用する。状態は `<dir>/state.json`（1巡ごとに保存＝止めても続きから再開できる）。
 *   入れ替え＝メインの4枚1組（同じレベル帯・ガード以外）70%／アーツ20%／キー10%。
 *   入れ替え先＝`--pool` の各ラウンド（`buildCpuDecks.ts` の出力＋`selfplay:inv --games-out`）にある同じルリグ・同じルリグ系統のデッキの札。
 *
 *   npx tsx scripts/climbCpuDecks.ts --dir <state dir> --seeds 1,…,10 --iters N [--target 12] [--pass 8]
 *   npx tsx scripts/climbCpuDecks.ts --dir <state dir> --validate --seeds 11,12,13,14,15   （未使用シードで測り直す）
 *
 * 🔴**学習に使ったシードの勝数で採用を言わない**＝同じ試合で比べ続けるので過適合する
 *   （実測＝10戦判定12巡で 4勝以上 15/30 → 別シードの検証では 9/30）。採用は必ず `--validate` の数字で決める。
 * ⚠初回（state.json が無い）は `--pool` の中でルリグごとに一番勝った候補から始め、その勝数を学習シードで測り直す（選別は別シード）。
 *   `--only 甲,乙`＝そのルリグタイプだけ登る／`--mutants N`＝1巡でルリグごとに作る変異の数／`--rebase`＝学習シードを変えたら全ルリグを測り直す。
 *   ⚠`--validate` は state.json にあるルリグだけを測る（プールの残りを混ぜない）。
 */
import fs from 'fs'; import { join } from 'path'; import Papa from 'papaparse'; import { spawnSync } from 'child_process';
import { cardCsvRelPaths } from './cardDataFiles.mjs';
const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const ITERS = Number(arg('--iters', '5')); const TARGET = Number(arg('--target', '7'));
const BASE = 'scratchpad-cpudecks-legacy';
const ROUNDS = arg('--pool', ['r5', 'r6', 'r7', 'r8'].map(r => `${BASE}/pool/${r}`).join(',')).split(',');
const REF = arg('--ref', `${BASE}/decks_ref.json`);
const REF_NAME = JSON.parse(fs.readFileSync(REF, 'utf8'))[0].name as string;
const DIR = arg('--dir', `${BASE}/climb20`); const SEEDS = arg('--seeds', '1,2,3,4,5');
/** 同時に走らせる対戦プロセス数（1つ数百MB＝メモリが厳しいときは下げる）。 */
const JOBS = arg('--jobs', '15');
const card = new Map<string, any>();
for (const f of cardCsvRelPaths()) { const p = join('public/data', f); if (!fs.existsSync(p) || /_TK|_Var/.test(f)) continue;
  for (const r of Papa.parse<any>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true }).data) if (r.CardNum) card.set(r.CardNum, r); }
const C = (n: string) => card.get(n) ?? {};
const isLB = (n: string) => C(n).LifeBurst === '1';
const isGuard = (n: string) => C(n).Guard === '1';
const bucket = (n: string) => C(n).Type === 'スペル' ? -1 : Math.min(Number(C(n).Level) || 0, 4);
const colors = (n: string) => new Set([...(C(n).Color ?? '')].filter(ch => '白赤青緑黒'.includes(ch)));
const rnd = (k: number) => Math.floor(Math.random() * k);

// ── 候補プール（各ラウンドの同じルリグのデッキ）と勝数 ──
const pool: Record<string, any[]> = {};
for (const r of ROUNDS) {
  const decks = JSON.parse(fs.readFileSync(`${r}/decks_cpu.json`, 'utf8'));
  const wins: Record<string, number> = {};
  for (const line of fs.readFileSync(`${r}/games.txt`, 'utf8').split('\n')) {
    const m = line.match(/^(.*) vs (.*) s\d+: \w+ .*winner=(\S+)/); if (!m) continue;
    const refA = m[1] === REF_NAME; const cand = refA ? m[2] : m[1];
    wins[cand] = (wins[cand] ?? 0) + ((refA ? m[3].startsWith('0000') : m[3] === 'headless-host') ? 1 : 0);
  }
  for (const d of decks) (pool[d._lrigType] ??= []).push({ ...d, _wins: wins[d.name] ?? 0 });
}
fs.mkdirSync(DIR, { recursive: true });
const SF = `${DIR}/state.json`;
const state: Record<string, { deck: any; wins: number; tried: number; accepted: number }> = fs.existsSync(SF) ? JSON.parse(fs.readFileSync(SF, 'utf8')) : {};
// `--only 甲,乙`＝そのルリグタイプだけ登る（登録済みのルリグで時間を使わない）
const ONLY = arg('--only', '') ? new Set(arg('--only', '').split(',')) : null;
const fresh: string[] = [];
const VALIDATE = argv.includes('--validate');
for (const [t, ds] of Object.entries(pool)) if (!state[t] && (!ONLY || ONLY.has(t)) && !(VALIDATE && Object.keys(state).length)) {
  const best = [...ds].sort((a, b) => b._wins - a._wins)[0];
  state[t] = { deck: best, wins: best._wins, tried: 0, accepted: 0 }; fresh.push(t);
}
const deckColors = (d: any) => { const s = new Set<string>(); for (const n of d.main_deck) for (const c of colors(n)) s.add(c); return s; };
const lrigLine = (d: any) => d.lrig_deck.filter((n: string) => C(n).Type === 'ルリグ').sort().join();

function mutate(t: string): any | null {
  const cur = state[t].deck; const cols = deckColors(cur);
  const same = pool[t].filter(d => lrigLine(d) === lrigLine(cur));
  const okColor = (n: string) => [...colors(n)].every(c => cols.has(c));
  const r = Math.random();
  if (r < 0.7) {
    const names = [...new Set<string>(cur.main_deck)].filter(n => !isGuard(n));
    const old = names[rnd(names.length)]; const k = cur.main_deck.filter((n: string) => n === old).length;
    const curNames = new Set(cur.main_deck.map((n: string) => C(n).CardName));
    const cand = [...new Set<string>(same.flatMap(d => d.main_deck))].filter(n => !isGuard(n) && bucket(n) === bucket(old) && !curNames.has(C(n).CardName) && okColor(n));
    if (!cand.length) return null;
    const nw = cand[rnd(cand.length)];
    const lb = cur.main_deck.filter(isLB).length - (isLB(old) ? k : 0) + (isLB(nw) ? k : 0);
    if (lb > 20) return null;
    return { ...cur, main_deck: cur.main_deck.map((n: string) => n === old ? nw : n), _mut: `${C(old).CardName}→${C(nw).CardName}` };
  }
  const typ = r < 0.9 ? 'アーツ' : 'キー';
  const olds = cur.lrig_deck.filter((n: string) => C(n).Type === typ);
  const curNames = new Set(cur.lrig_deck.map((n: string) => C(n).CardName));
  const cand = [...new Set<string>(same.flatMap(d => d.lrig_deck))].filter(n => C(n).Type === typ && !curNames.has(C(n).CardName));
  if (!olds.length || !cand.length) return null;
  const old = olds[rnd(olds.length)]; const nw = cand[rnd(cand.length)];
  return { ...cur, lrig_deck: cur.lrig_deck.map((n: string) => n === old ? nw : n), _mut: `${C(old).CardName}→${C(nw).CardName}` };
}

/** `selfplay:inv` を回して、候補ごとの勝数（基準デッキに勝った数）を返す。 */
function runGames(dir: string, decks: any[]): Record<string, number> {
  fs.writeFileSync(`${dir}/decks_cpu.json`, JSON.stringify(decks));
  fs.copyFileSync(REF, `${dir}/decks_ref.json`);
  fs.writeFileSync(`${dir}/pairs.json`, JSON.stringify(decks.flatMap(d => [[d.name, REF_NAME], [REF_NAME, d.name]])));
  spawnSync(process.execPath, ['--import', 'tsx', 'scripts/selfPlayInvariants.ts', '--deck-dir', dir, '--pairs-file', `${dir}/pairs.json`, '--seeds', SEEDS, '--jobs', JOBS, '--games-out', `${dir}/games.txt`], { stdio: 'ignore' });
  const wins: Record<string, number> = {};
  for (const line of fs.readFileSync(`${dir}/games.txt`, 'utf8').split('\n')) {
    const m = line.match(/^(.*) vs (.*) s\d+: \w+ .*winner=(\S+)/); if (!m) continue;
    const refA = m[1] === REF_NAME; const cand = refA ? m[2] : m[1];
    wins[cand] = (wins[cand] ?? 0) + ((refA ? m[3].startsWith('0000') : m[3] === 'headless-host') ? 1 : 0);
  }
  return wins;
}

// ── 検証（未使用シードで今のデッキを測り直す）──
//   出力＝`<dir>/validate.txt`（表）と `<dir>/decks_adopted.json`（`--pass` 勝以上・名前は「レガシー／<ルリグ>」）
//   ⇒ `node scripts/importDecks.mjs --from <dir>/decks_adopted.json --kinds cpu --to claude1 --apply`
if (VALIDATE) {
  const vDir = `${DIR}/validate`; fs.rmSync(vDir, { recursive: true, force: true }); fs.mkdirSync(vDir, { recursive: true });
  const decks = Object.entries(state).map(([t, s]) => ({ ...s.deck, name: `レガシー／${t}`, _lrigType: t }));
  const wins = runGames(vDir, decks);
  const games = SEEDS.split(',').length * 2; const pass = Number(arg('--pass', String(Math.ceil(games * 0.4))));
  const rows = decks.map(d => ({ d, w: wins[d.name] ?? 0, train: state[d._lrigType].wins })).sort((a, b) => b.w - a.w);
  const text = rows.map(r => `${r.w >= pass ? '✅' : '  '} ${r.d._lrigType} 学習 ${r.train} → 検証 ${r.w}/${games}`).join('\n')
    + `\n検証 seed ${SEEDS}：${pass}勝以上 ${rows.filter(r => r.w >= pass).length} / ${rows.length}\n`;
  fs.writeFileSync(`${DIR}/validate.txt`, text); console.log(text);
  fs.writeFileSync(`${DIR}/decks_adopted.json`, JSON.stringify(rows.filter(r => r.w >= pass).map(r => r.d), null, 1));
  process.exit(0);
}

// 出発点の勝数は選別のシード（別シード）の数字＝学習シードで測り直す（測り直さないと変異が永久に追いつけない／追い越しやすい）
// `--rebase`＝学習シードを変えたとき、state の全ルリグを新しいシードで測り直す
if (argv.includes('--rebase')) for (const t of Object.keys(state)) if (!fresh.includes(t)) fresh.push(t);
if (fresh.length) {
  const rDir = `${DIR}/rebase`; fs.rmSync(rDir, { recursive: true, force: true }); fs.mkdirSync(rDir, { recursive: true });
  const wins = runGames(rDir, fresh.map(t => ({ ...state[t].deck, name: `${t}～出発` })));
  for (const t of fresh) state[t].wins = wins[`${t}～出発`] ?? 0;
  fs.writeFileSync(SF, JSON.stringify(state));
  console.log(`[出発点] ${fresh.map(t => `${t}${state[t].wins}`).join(' ')}`);
}
// `--mutants N`＝1巡でルリグごとに作る変異の数（既定＝弱いルリグ2・それ以外1）
const MUTANTS = Number(arg('--mutants', '0'));
for (let it = 0; it < ITERS; it++) {
  const itDir = `${DIR}/it`; fs.rmSync(itDir, { recursive: true, force: true }); fs.mkdirSync(itDir);
  const mutants: { t: string; d: any }[] = [];
  for (const t of Object.keys(state)) {
    if (state[t].wins >= TARGET) continue;
    const n = MUTANTS || (state[t].wins < TARGET * 0.57 ? 2 : 1);
    for (let j = 0; j < n; j++) { let m = null; for (let tries = 0; tries < 20 && !m; tries++) m = mutate(t);
      if (m) mutants.push({ t, d: { ...m, name: `${t}～変異${j}` } }); }
  }
  if (!mutants.length) break;
  const t0 = Date.now();
  const wins = runGames(itDir, mutants.map(m => m.d));
  const best: Record<string, { d: any; w: number }> = {};
  for (const m of mutants) { const w = wins[m.d.name] ?? 0; if (!best[m.t] || w > best[m.t].w) best[m.t] = { d: m.d, w }; }
  const log: string[] = [];
  for (const [t, b] of Object.entries(best)) {
    state[t].tried++;
    if (b.w >= state[t].wins) { log.push(`${t} ${state[t].wins}→${b.w} 採用 ${b.d._mut}`); state[t].deck = { ...b.d, name: state[t].deck.name }; state[t].wins = b.w; state[t].accepted++; }
  }
  fs.writeFileSync(SF, JSON.stringify(state));
  const sum = Object.entries(state).map(([t, s]) => `${t}${s.wins}`).join(' ');
  const line = `[it ${it}] ${Math.round((Date.now() - t0) / 1000)}s ${mutants.length}変異 ｜ ${log.join(' ／ ')}\n  ${sum}\n  合格 ${Object.values(state).filter(s => s.wins >= Number(arg('--pass', '4'))).length}/${Object.keys(state).length}\n`;
  fs.appendFileSync(`${DIR}/log.txt`, line); console.log(line);
}
