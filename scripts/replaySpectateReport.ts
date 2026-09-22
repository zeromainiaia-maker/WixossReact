/**
 * replaySpectateReport.ts — **CPU観戦から届いたバグ報告の試合を、seed から計算し直す**（2026-09-22新設）。
 *
 *   npx tsx scripts/replaySpectateReport.ts <scratchpad-reports/….json> [--around N] [--out <frames.json>]
 *   npm run replay:spectate -- <report.json>
 *
 * ■ なぜ要るか＝観戦の報告は**表示していた1手の盤面**しか持たない。CPU の判断が変かどうかは
 *   **その手の前後**（何が見えていて、何を選んだか）を見ないと言えない。観戦は乱数を seed 固定で回している
 *   （`SpectateScreen.tsx`）ので、**同じ seed ・同じ山・同じ版**なら同じ試合がそのまま再現できる。
 *   実績＝報告 `aa903772`／`4d79fdf9`／`c8b44086`（同じ1試合・196手）を手数まで一致させて再現し、2件を直した。
 * ■ 出すもの＝報告の手の前後 `--around`（既定 4）手のログ（観戦と同じ [A]/[B] 表記）と、両者の場のシグニ。
 *
 * 🔴**版が違うと別の試合になる**＝CPU の判断を1つ変えれば、以降の手はすべて変わる。報告の `app_version`
 *   （`v0.555+0c44650` の `+` の後ろがコミット）と今の HEAD が違えば警告を出す。そのときは
 *   `git worktree add <dir> <commit>` で報告の版を取り出し、そこでこのスクリプトを回す（node_modules はジャンクションで足りる）。
 * ⚠**山は `scratchpad-decks/` の書き出し**（`node scripts/listDecks.mjs --export scratchpad-decks`）＝報告のあとに
 *   デッキを編集していると再現しない（手数が報告の `totalFrames` と合うかで確かめる）。
 * ⚠**カード効果は `effects_*.json` を読む**（ブラウザと同じ）＝原文から parse し直す自己対戦とは効果表が違うことがある。
 * ⚠「1手」の数え方は観戦画面と同じ（ログが1行以上増えた `step()`）＝ここを変えると手の番号がずれる。
 */
import fs from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import Papa from 'papaparse';
import type { BattleStateRow, CardData } from '../src/types';
import { mulberry32, random, setRng } from '../src/engine/rng';
import { CPU_PLAYER_ID } from '../src/screens/battle/battleUtils';
import { createHeadlessMatch } from '../src/screens/battle/controller/headlessMatch';
import { buildHeadlessRow } from '../src/screens/battle/controller/headlessSetup';
import { spectateLogLabel } from '../src/screens/battle/spectateLog';
import { resolveSelfPlayDeck } from './selfPlayDecks';

const argv = process.argv.slice(2);
const file = argv.find(a => !a.startsWith('--') && a.endsWith('.json'));
const argOf = (k: string) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined; };
if (!file) { console.error('使い方: npx tsx scripts/replaySpectateReport.ts <report.json> [--around N] [--out <frames.json>]'); process.exit(1); }
const AROUND = Number(argOf('--around') ?? 4);
const OUT = argOf('--out');

const report = JSON.parse(fs.readFileSync(file, 'utf8'));
const sp = report.snapshot?.spectate as { deckA: string; deckB: string; frame: number; totalFrames: number; seed: number; firstMode?: 'random' | 'A' | 'B' } | undefined;
if (!sp) { console.error('この報告は CPU観戦からのものではありません（snapshot.spectate が無い）。対戦の報告は scripts/replayReport.mjs へ。'); process.exit(1); }

const reportCommit = String(report.app_version ?? '').split('+')[1];
let head = '';
try { head = execSync('git rev-parse --short=7 HEAD', { encoding: 'utf8' }).trim(); } catch { /* git が無ければ比べない */ }
if (reportCommit && head && !head.startsWith(reportCommit.slice(0, 7))) {
  console.log(`⚠報告の版（${report.app_version}）と今の HEAD（${head}）が違う＝CPU の判断が変わっていれば別の試合になる。`);
  console.log(`  報告の版で再現するなら: git worktree add <dir> ${reportCommit} → <dir> でこのスクリプトを回す\n`);
}

// ── カード（ブラウザと同じく effects_*.json を持たせる）──
const effects: Record<string, unknown[]> = {};
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  Object.assign(effects, JSON.parse(fs.readFileSync(join('public/data', f), 'utf8')));
}
const all: CardData[] = [];
for (const f of [...Array.from({ length: 10 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join('public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum?.trim()) all.push({ ...(r as unknown as CardData), effects: (effects[r.CardNum] ?? []) as CardData['effects'] });
}
const allMap = new Map(all.map(c => [c.CardNum, c]));
const a = resolveSelfPlayDeck(sp.deckA, allMap), b = resolveSelfPlayDeck(sp.deckB, allMap);

// ── 観戦画面の `start()` と同じ順で乱数を消費する（seed → 先攻の抽選 → 山のシャッフル）──
setRng(mulberry32(sp.seed));
const used = new Set([...a.mainDeck, ...a.lrigDeck, ...b.mainDeck, ...b.lrigDeck]);
const cards = all.filter(c => used.has(c.CardNum) || /-TK/.test(c.CardNum));
const cardMap = new Map(cards.map(c => [c.CardNum, c]));
const firstMode = sp.firstMode ?? 'random';
const firstIsA = firstMode === 'random' ? random() < 0.5 : firstMode === 'A';
const HOST = 'spectate-host';
const setup = buildHeadlessRow({ seats: { host: a, guest: b }, hostId: HOST, firstPlayerId: firstIsA ? HOST : CPU_PLAYER_ID, cardMap, roomId: 'spectate' });
const m = createHeadlessMatch(setup.row, { cards, initialLogs: setup.logs, cpuPlans: { host: a.plan, guest: b.plan } });

interface Frame { newLogs: string[]; row: BattleStateRow }
const logs = [...setup.seatLogs.host.map(l => spectateLogLabel(l, 'host')), ...setup.seatLogs.guest.map(l => spectateLogLabel(l, 'guest'))];
const frames: Frame[] = [{ newLogs: [...logs], row: m.row() }];
for (let i = 0; i < 4000; i++) {
  const kind = await m.step();
  const added = m.logs.slice(logs.length).map(l => spectateLogLabel(l, m.lastActor()));
  logs.push(...added);
  if (added.length > 0 || kind === 'finished') frames.push({ newLogs: added, row: m.row() });
  else frames[frames.length - 1] = { ...frames[frames.length - 1], row: m.row() };
  if (kind === 'finished' || kind === 'idle') break;
}

const total = frames.length - 1;
console.log(`報告: [${report.tag}] ${report.comment ?? ''}`);
console.log(`山: A「${sp.deckA}」 vs B「${sp.deckB}」／seed ${sp.seed}／先攻 ${firstIsA ? 'A' : 'B'}（${firstMode}）`);
console.log(`再計算の手数 ${total}／報告の手数 ${sp.totalFrames}${total === sp.totalFrames ? '＝一致' : '＝🔴不一致（版か山が違う＝以下は別の試合）'}`);
const nm = (id: string | undefined) => {
  if (!id) return '-';
  const c = allMap.get(id.split('#')[0]);
  return c ? `${c.CardName}(Lv${c.Level} ${c.Power})` : id;
};
const board = (r: BattleStateRow) => ([['A', r.host_state], ['B', r.guest_state]] as const)
  .map(([s, st]) => `${s}: ${st.field.signi.map(z => nm(z?.at?.(-1))).join(' | ')}（ライフ${st.life_cloth.length} 手札${st.hand.length} エナ${st.energy.length}）`).join('\n     ');
const from = Math.max(0, sp.frame - AROUND), to = Math.min(total, sp.frame + AROUND);
console.log(`\n前: ${board(frames[from].row)}\n`);
for (let i = from; i <= to; i++) {
  const f = frames[i];
  console.log(`${i === sp.frame ? '▶' : ' '}${String(i).padStart(4)} T${f.row.turn_count} ${f.row.turn_phase} 手番${f.row.active_user_id === HOST ? 'A' : 'B'} :: ${f.newLogs.join(' / ')}`);
}
console.log(`\n後: ${board(frames[to].row)}`);
if (OUT) { fs.writeFileSync(OUT, JSON.stringify(frames)); console.log(`\n全手の盤面 → ${OUT}`); }
