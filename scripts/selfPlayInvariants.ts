/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * 🆕**自己対戦の不変条件走査**（2026-10-20新設・`npm run selfplay:inv`）＝**人の手でプレイする代わりに、
 * CPU 同士の通し対戦（実オーケストレーション＝`createHeadlessMatch`）をユーザー作の全デッキで回し、
 * 1手（`step()`）ごとに盤面の不変条件を検査する**。
 *
 * 使い方＝`npm run selfplay:inv -- [--seeds 1,2,3] [--jobs 8] [--pairs 0-9] [--out f.jsonl]`
 *   ／1試合だけ＝`--a <山> --b <山> --seeds N [--trace]`（`--trace` は末尾の手の差分とログを `node_modules/.tmp/inv_trace_logs.txt` へ）
 *   入力＝`node scripts/listDecks.mjs --export scratchpad-decks`（`headlessSelfPlay.ts` と同じ）。対の組み方＝山 i 対 山 (7i+3) mod N。
 *
 * 🔑**なぜ要るか（初回実測＝120戦・約6分）**＝golden・smoke・fuzz・traceinv が全部緑のまま、**3系統**を拾った：
 *   ①`fieldTrashCost.ts` が場→トラッシュでインスタンス ID を剥がしていた（同名2枚が同じ文字列＝リフレッシュ後に二重存在）
 *   ②`SOUL_OP{self_to_under_center}` がアーツをルリグトラッシュに残したままルリグデッキへ足していた（二重存在）
 *   ③CPU の1手が「バニッシュされない」パワー0以下シグニを候補に数えて**毎回 return＝CPU のターンが永久に止まった**
 *   ＝**単体の効果ではなく「試合の流れ」の中でしか起きない**形（効果単位の計器は盤面を1枚しか見ない）。
 *
 * ■ 検出の種類
 *   - `DUP`＝同じ ID が2つの置き場に居る ／ `NEW`＝開始時に無い ID が現れた（トークン以外＝複製か ID の書き換え）
 *   - `VANISH`＝開始時の ID がどの置き場にも40手以上居ない（`paths=` に state のどこに名前が残っているか）
 *   - `SHAPE`＝置き場とカード種別の食い違い（手札にアーツ・シグニゾーンの上がスペル 等）／NaN／未知のカード
 *   - `STALL`＝**盤面もログも変わらない手が続く**（空回り＝実機なら CPU が止まる）／`IDLE`＝誰も動けない／`CAP`＝手数の上限／`CRASH`＝例外
 * ⚠**候補出し**＝`VANISH`/`NEW` は置き場の追跡漏れでも出る（`behaviorAudit.ts` の `snapshot` と同じ置き場を見ている）。
 * ⚠**0件は「壊れていない」ではない**＝CPU が踏む手と、その山が持つカードしか見ていない。シードを変えて回す。
 * ゲートではない（exit 0）。
 */
import { spawn } from 'child_process';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { join } from 'path';
import Papa from 'papaparse';
import type { BattleStateRow, CardData, PlayerState } from '../src/types';
import { setRngSeed } from '../src/engine/rng';
import { CPU_PLAYER_ID } from '../src/screens/battle/battleUtils';
import { resolveCpuPolicy } from '../src/screens/battle/cpuPolicy';
import { collectHandLimits } from '../src/engine/effectEngine';
import { powerZeroBanishCandidates } from '../src/screens/battle/controller/resolveSigniBattle';
import { buildBaseEffectsMap } from '../src/screens/battle/controller/battleMaterials';
import { createHeadlessMatch } from '../src/screens/battle/controller/headlessMatch';
import { buildHeadlessRow } from '../src/screens/battle/controller/headlessSetup';
import { resolveSelfPlayDeck, listPlayableDeckNames, type SelfPlayDeck } from './selfPlayDecks';
import { cardCsvRelPaths } from './cardDataFiles.mjs';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = arg('--seeds', '1').split(',').map(Number);
/**
 * 🆕CPU のポリシー（両席・既定＝`default`）。🔑**検査の幅を広げる口**＝`legacy-greedy`（先読みなし・使えるものは使う）は
 *   既定の CPU が「得にならない」と判断して撃たない【起】・アーツも踏む＝**強さを変えずに被覆だけ広げる**。
 */
const POLICY = arg('--policy', 'default');
const OUT = arg('--out', '');
/** 🆕生成デッキ（`scripts/synthDecks.ts`）を読むとき＝既定はユーザーのデッキ。 */
const DECK_DIR = arg('--deck-dir', 'scratchpad-decks');
/** 🆕発動した効果・場に出たカードの記録（1戦1行の JSON）＝`scripts/synthDecks.ts --covered` の入力。 */
const COV_OUT = arg('--cov-out', '');
const MAX_STEPS = Number(arg('--steps', '4000'));
const JOBS = Number(arg('--jobs', '1'));
/** 盤面もログも変わらない手がこれだけ続いたら空回り（STALL）。 */
const STALL_STEPS = 30;

const allCards: CardData[] = [];
for (const f of cardCsvRelPaths()) {
  const p = join(process.cwd(), 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) if (r.CardNum?.trim()) allCards.push(r as unknown as CardData);
}
const allCardMap = new Map(allCards.map(c => [c.CardNum, c]));
const names = listPlayableDeckNames(allCardMap, false, DECK_DIR);
// 対の並び：i 番目の山 vs (i+k) 番目
const pairs: [string, string][] = [];
for (let k = 0; k < names.length; k++) pairs.push([names[k], names[(k * 7 + 3) % names.length]]);
if (argv.includes('--a')) { pairs.length = 0; pairs.push([arg('--a',''), arg('--b','')]); }
const [p0, p1] = arg('--pairs', `0-${pairs.length - 1}`).split('-').map(Number);
const TRACE = argv.includes('--trace');

const numOf = (id: string) => id.split('#')[0];
const LRIG_TYPES = new Set(['ルリグ', 'アシストルリグ', 'アーツ', 'ピース', 'リレーピース', 'キー', 'レゾナ', 'クラフト']);

function locate(r: BattleStateRow) {
  const loc = new Map<string, string>();
  const dup = new Map<string, string>();
  const put = (id: string | null | undefined, where: string) => {
    if (!id || typeof id !== 'string') return;
    const prev = loc.get(id);
    const base = (w: string) => w.replace(/\[\d+\]/, '').replace(/\((上|下)\)$/, '');
    if (prev !== undefined && base(prev) !== base(where)) dup.set(id, `${dup.get(id) ?? prev} / ${where}`);
    loc.set(id, where);
  };
  for (const [side, s] of [['H', r.host_state], ['G', r.guest_state]] as [string, PlayerState][]) {
    s.deck.forEach(id => put(id, `${side}デッキ`));
    s.hand.forEach(id => put(id, `${side}手札`));
    s.life_cloth.forEach(id => put(id, `${side}ライフ`));
    s.trash.forEach(id => put(id, `${side}トラッシュ`));
    s.lrig_trash.forEach(id => put(id, `${side}ルリグトラッシュ`));
    s.energy.forEach(id => put(id, `${side}エナ`));
    // ⚠`bonds`（絆）は**カード名の一覧**で置き場ではない＝数えない（数えると NEW の誤検出になる）
    s.field.lrig.forEach(id => put(id, `${side}ルリグ`));
    s.field.signi.forEach((st, z) => (st ?? []).forEach((id, d) => put(id, `${side}シグニ${z}${d === st!.length - 1 ? '(上)' : '(下)'}`)));
    (s.field.assist_lrig_l ?? []).forEach(id => put(id, `${side}アシストL`));
    (s.field.assist_lrig_r ?? []).forEach(id => put(id, `${side}アシストR`));
    put(s.field.check, `${side}チェック`);
    (s.field.check_rest ?? []).forEach(id => put(id, `${side}チェック`));
    put(s.field.key_piece, `${side}キー`);
    (s.field.key_piece_extra ?? []).forEach(id => put(id, `${side}キー`));
    (s.field.free_zone ?? []).forEach(id => put(id, `${side}フリー`));
    put(s.field.cheer, `${side}チア`);
    (s.field.cheer_under ?? []).forEach(id => put(id, `${side}チア下`));
    (s.field.beat_zone ?? []).forEach(id => put(id, `${side}ビート`));
    (s.field.signi_traps ?? []).forEach((id, z) => put(id, `${side}トラップ${z}`));
    (s.field.signi_soul ?? []).forEach((id, z) => put(id, `${side}ソウル${z}`));
    (s.field.signi_charms ?? []).forEach((id, z) => put(id, `${side}チャーム${z}`));
    (s.field.signi_acce ?? []).forEach((ids, z) => (ids ?? []).forEach(id => put(id, `${side}アクセ${z}`)));
    (s.field.signi_facedown_attached ?? []).forEach((ids, z) => (ids ?? []).forEach(id => put(id, `${side}裏向き付け${z}`)));
    (s.field.signi_magic_boxes ?? []).forEach((id, z) => put(id, `${side}マジックボックス${z}`));
    (s.field.signi_seeds ?? []).forEach((id, z) => put(id, `${side}シード${z}`));
    (s.field.facedown_signi ?? []).forEach((id, z) => put(id, `${side}裏向きシグニ${z}`));
    (s.excluded ?? []).forEach(id => put(id, `${side}除外`));
    (s.lrig_deck ?? []).forEach(id => put(id, `${side}ルリグデッキ`));
    (s.facedown_lrig_zone_cards ?? []).forEach(id => put(id, `${side}ルリグゾーン裏向き`));
    (s.pending_crashed_cards ?? []).forEach(id => { if (!loc.has(id)) put(id, `${side}クラッシュ待ち`); });
  }
  return { loc, dup };
}

function findPaths(o: unknown, id: string): string[] {
  const hits: string[] = [];
  (function walk(v: unknown, path: string) {
    if (hits.length > 4) return;
    if (v === id) { hits.push(path); return; }
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) walk(x, Array.isArray(v) ? path : `${path}.${k}`);
  })(o, '');
  return hits;
}

function shapeIssues(r: BattleStateRow, cardMap: Map<string, CardData>): string[] {
  const out: string[] = [];
  for (const [side, s] of [['H', r.host_state], ['G', r.guest_state]] as [string, PlayerState][]) {
    if (s.field.signi.length !== 3) out.push(`${side} signi長さ${s.field.signi.length}`);
    const ty = (id: string) => cardMap.get(numOf(id))?.Type ?? '?';
    for (const [z, arr] of [['手札', s.hand], ['デッキ', s.deck], ['エナ', s.energy], ['ライフ', s.life_cloth], ['トラッシュ', s.trash]] as [string, string[]][])
      for (const id of arr) if (LRIG_TYPES.has(ty(id)) && ty(id) !== 'レゾナ' && ty(id) !== 'クラフト') out.push(`${side}${z}にルリグデッキ系 ${id}(${ty(id)})`);
    for (const id of s.lrig_trash) if (['シグニ', 'スペル'].includes(ty(id))) out.push(`${side}ルリグトラッシュにメイン系 ${id}(${ty(id)})`);
    s.field.signi.forEach((st, z) => { const top = st?.at(-1); if (top && !/^(シグニ|レゾナ)/.test(ty(top))) out.push(`${side}シグニ${z}の上が ${top}(${ty(top)})`); });
    const lt = s.field.lrig.at(-1); if (lt && !['ルリグ'].includes(ty(lt))) out.push(`${side}ルリグゾーンの上が ${lt}(${ty(lt)})`);
    if (!Number.isFinite(s.coins ?? 0) || (s.coins ?? 0) < 0) out.push(`${side} coins=${s.coins}`);
    for (const id of [...s.hand, ...s.deck, ...s.trash, ...s.energy]) if (!cardMap.has(numOf(id))) out.push(`${side} 未知のカード ${id}`);
  }
  // NaN をどこかに持っていないか
  (function walk(v: unknown, path: string) {
    if (typeof v === 'number' && !Number.isFinite(v)) out.push(`NaN/Inf at ${path}`);
    if (!v || typeof v !== 'object') return;
    for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  })({ h: r.host_state, g: r.guest_state }, '');
  return out;
}

const HOST_ID = 'headless-host';
const findings: any[] = [];
const emit = (f: any) => { findings.push(f); if (OUT) fs.appendFileSync(OUT, JSON.stringify(f) + '\n'); console.log(`  🔴 ${f.kind} ${f.detail}`); };

async function play(a: SelfPlayDeck, b: SelfPlayDeck, seed: number) {
  const used = new Set([...a.mainDeck, ...a.lrigDeck, ...b.mainDeck, ...b.lrigDeck].map(n => String(n).split('#')[0]));
  const cards = allCards.filter(c => used.has(c.CardNum) || /-TK/.test(c.CardNum));
  const cardMap = new Map(cards.map(c => [c.CardNum, c]));
  setRngSeed(seed);
  const setup = buildHeadlessRow({ seats: { host: a, guest: b }, hostId: HOST_ID, firstPlayerId: seed % 2 ? HOST_ID : CPU_PLAYER_ID, cardMap, policy: { host: resolveCpuPolicy(POLICY), guest: resolveCpuPolicy(POLICY) } });
  const pol = resolveCpuPolicy(POLICY);
  const m = createHeadlessMatch(setup.row, { cards, initialLogs: setup.logs, cpuPlans: { host: a.plan, guest: b.plan }, policy: { host: pol, guest: pol } });
  const tag = `${a.name} vs ${b.name} s${seed}`;
  const initial = new Set(locate(m.row()).loc.keys());
  const missingSince = new Map<string, number>();
  const reported = new Set<string>();
  const once = (key: string, f: any) => { if (reported.has(key)) return; reported.add(key); emit({ game: tag, ...f }); };
  let step = 0; let reason = 'cap';
  let lastLog = 0;
  // 🆕ルール処理の取りこぼし（HANDLIMIT／POWERZERO）を見るための静的な効果表（`createHeadlessMatch` と同じ組み方）。
  const effectsMap = buildBaseEffectsMap([...new Map(cards.map(c => [c.CardNum, c] as const)).values()]);
  let pzSince = -1;
  // ⚠個体 ID（`WX01-001#3`）でも引けるカード表（実機の `InstanceMap` と同じ扱い）＝素の表だとパワーが読めず 0 と誤判定する
  class InstMap extends Map<string, CardData> { get(k: string) { return super.get(k) ?? super.get(numOf(k)); } has(k: string) { return super.has(k) || super.has(numOf(k)); } }
  const instMap = new InstMap(cardMap);
  const covEffects = new Set<string>(), covField = new Set<string>();
  let sameN = 0;
  const ctxLogs = () => m.logs.slice(Math.max(0, m.logs.length - 6));
  for (; step < MAX_STEPS; step++) {
    let k;
    const prevRow = m.row();
    const prevJson = JSON.stringify(prevRow);
    const logLenBefore = m.logs.length;
    try { k = await m.step(); } catch (e: any) {
      once('CRASH', { kind: 'CRASH', step, turn: m.row().turn_count, detail: String(e?.stack ?? e).split('\n').slice(0, 6).join(' | '), logs: ctxLogs() });
      reason = 'crash'; break;
    }
    if (TRACE && step > MAX_STEPS - 6) { const r0 = m.row(); for (const side of ['host_state','guest_state'] as const) for (const k of new Set([...Object.keys((prevRow as any)[side]), ...Object.keys((r0 as any)[side])])) { const a = JSON.stringify((prevRow as any)[side][k]), b = JSON.stringify((r0 as any)[side][k]); if (a !== b) console.log(`   Δ ${side}.${k}: ${a?.slice(0,200)} -> ${b?.slice(0,200)}`); } for (const k of Object.keys(r0)) if (!/_state$/.test(k) && JSON.stringify((prevRow as any)[k]) !== JSON.stringify((r0 as any)[k])) console.log(`   Δ row.${k}`); }
    if (TRACE && step > MAX_STEPS - 40) { const r0 = m.row(); console.log(`step${step} ${k} actor=${m.lastActor()} phase=${r0.turn_phase} active=${r0.active_user_id===HOST_ID?'H':'G'} pend=${JSON.stringify(r0.pending_effect)?.slice(0,300)} stack=${JSON.stringify(r0.effect_stack)?.slice(0,300)} | ${m.logs.slice(-2).join(' / ')}`); }
    if (k === 'finished') { reason = 'finished'; break; }
    if (k === 'idle') { reason = 'idle'; once('IDLE', { kind: 'IDLE', step, turn: m.row().turn_count, detail: `phase=${m.row().turn_phase} pend=${!!m.row().pending_effect} stack=${!!m.row().effect_stack}`, logs: ctxLogs() }); break; }
    const r = m.row();
    // 空回り＝盤面（行オブジェクト）もログも動かない手
    if (m.logs.length === logLenBefore && JSON.stringify(r) === prevJson) {
      if (++sameN >= STALL_STEPS) { once('STALL', { kind: 'STALL', step, turn: r.turn_count, detail: `${STALL_STEPS}手 盤面もログも不変（${k}・phase=${r.turn_phase}・手番=${r.active_user_id === HOST_ID ? 'host' : 'guest'}・actor=${m.lastActor()}）`, logs: ctxLogs() }); reason = 'stall'; break; }
    } else sameN = 0;
    const { loc, dup } = locate(r);
    for (const [id, w] of dup) once(`DUP:${id}:${w}`, { kind: 'DUP', step, turn: r.turn_count, detail: `${id} @ ${w}`, logs: m.logs.slice(lastLog).slice(-8) });
    for (const id of loc.keys()) if (!initial.has(id) && !/-TK/.test(numOf(id))) {
      // 新しい instance（複製の疑い）。トークン以外
      once(`NEW:${id}`, { kind: 'NEW', step, turn: r.turn_count, detail: `${id} @ ${loc.get(id)}`, logs: m.logs.slice(lastLog).slice(-8) });
      initial.add(id);
    }
    for (const id of initial) {
      if (loc.has(id)) { missingSince.delete(id); continue; }
      if (/-TK/.test(numOf(id))) continue;
      if (!missingSince.has(id)) missingSince.set(id, step);
      else if (step - missingSince.get(id)! >= 40) once(`VANISH:${id}`, { kind: 'VANISH', step, turn: r.turn_count, detail: `${id} 不明 since step ${missingSince.get(id)} paths=${findPaths(r, id).join(',') || 'なし'}`, logs: m.logs.slice(-10) });
    }
    // 被覆＝スタックに載った効果（アーツ・スペル・【起】・【自】・【出】・バーストはここを通る）／対話中の効果／場に出たカード
    if (COV_OUT) {
      const st = r.effect_stack;
      for (const e of [...(st?.pendingTurn ?? []), ...(st?.pendingOpp ?? []), ...(st?.queue ?? [])]) if (e.effectId) covEffects.add(e.effectId);
      if (r.pending_effect?.effectId) covEffects.add(r.pending_effect.effectId);
      if (r.pending_spell?.card_num) covField.add(numOf(r.pending_spell.card_num));
      for (const side of [r.host_state, r.guest_state]) {
        for (const stk of side.field.signi) { const top = stk?.at(-1); if (top) covField.add(numOf(top)); }
        for (const z of [side.field.lrig, side.field.assist_lrig_l ?? [], side.field.assist_lrig_r ?? []]) { const top = z.at(-1); if (top) covField.add(numOf(top)); }
        if (side.field.key_piece) covField.add(numOf(side.field.key_piece));
      }
    }
    // HANDLIMIT＝ターンが移った直後、直前のターンプレイヤーの手札が上限を超えている（ターン終了時の手札調整の取りこぼし）
    if (prevRow.active_user_id && r.active_user_id !== prevRow.active_user_id && r.turn_count !== prevRow.turn_count) {
      const prevIsHost = prevRow.active_user_id === r.host_id;
      const ps = prevIsHost ? r.host_state : r.guest_state, os = prevIsHost ? r.guest_state : r.host_state;
      const lim = collectHandLimits(ps, os, instMap, effectsMap);
      if (ps.hand.length > lim) once(`HANDLIMIT:${r.turn_count}`, { kind: 'HANDLIMIT', step, turn: r.turn_count, detail: `${prevIsHost ? 'H' : 'G'} 手札${ps.hand.length} > 上限${lim}`, logs: m.logs.slice(-10) });
    }
    // POWERZERO＝落ち着いた盤面（スタック・対話・スペル待ちなし）でバニッシュされるはずのシグニが残り続ける
    if (!r.effect_stack && !r.pending_effect && !r.pending_spell) {
      const pz = powerZeroBanishCandidates(r, r.host_state, r.guest_state, effectsMap, instMap);
      if (pz.length > 0) { if (pzSince < 0) pzSince = step; else if (step - pzSince >= 15) once(`POWERZERO:${pz.join(',')}`, { kind: 'POWERZERO', step, turn: r.turn_count, detail: `${pz.join(',')} が${step - pzSince}手 残っている`, logs: m.logs.slice(-10) }); }
      else pzSince = -1;
    }
    for (const s of shapeIssues(r, cardMap)) once(`SHAPE:${s.replace(/#\d+/g, '')}`, { kind: 'SHAPE', step, turn: r.turn_count, detail: s, logs: m.logs.slice(-8) });
    lastLog = Math.max(0, m.logs.length - 8);
  }
  if (TRACE) { const r9 = m.row(); for (const [k, st] of [['HOST', r9.host_state], ['GUEST', r9.guest_state]] as const) console.log(k, JSON.stringify(st.field).slice(0, 300), 'crashed=', JSON.stringify(st.pending_crashed_cards), 'check=', st.field.check, 'burst=', JSON.stringify((st as any).pending_life_burst ?? null), 'psb=', JSON.stringify(st.pending_signi_battle ?? null), 'mods=', JSON.stringify(st.temp_power_mods ?? []).slice(0, 400)); const es = r9.effect_stack; if (es) console.log('STACK', JSON.stringify({ turn: es.turnPlayerId, pT: es.pendingTurn.map(e => e.effectId), pO: es.pendingOpp.map(e => e.effectId), q: es.queue.map(e => e.effectId), oT: es.orderTurnDone, oO: es.orderOppDone })); }
  if (TRACE) fs.writeFileSync('node_modules/.tmp/inv_trace_pending.json', JSON.stringify(m.row().pending_effect, null, 1), 'utf-8');
  if (TRACE) fs.writeFileSync('node_modules/.tmp/inv_trace_logs.txt', m.logs.join('\n'), 'utf-8');
  if (reason === 'cap') once('CAP', { kind: 'CAP', step, turn: m.row().turn_count, detail: 'step 上限', logs: ctxLogs() });
  const r = m.row();
  if (COV_OUT) fs.appendFileSync(COV_OUT, JSON.stringify({ game: tag, reason, effects: [...covEffects], field: [...covField] }) + String.fromCharCode(10));
  console.log(`${tag}: ${reason} steps=${step} turns=${r.turn_count} life H${r.host_state.life_cloth.length}/G${r.guest_state.life_cloth.length} winner=${r.winner_id ?? '-'}`);
}

async function runPairs(from: number, to: number) {
  for (let i = from; i <= to && i < pairs.length; i++) {
    const [an, bn] = pairs[i];
    let a: SelfPlayDeck, b: SelfPlayDeck;
    try { a = resolveSelfPlayDeck(an, allCardMap, DECK_DIR); b = resolveSelfPlayDeck(bn, allCardMap, DECK_DIR); } catch (e) { console.log(`skip ${an}/${bn}: ${e}`); continue; }
    for (const s of SEEDS) await play(a, b, s);
  }
}

(async () => {
  if (JOBS <= 1 || argv.includes('--worker')) {
    await runPairs(p0, p1);
    console.log(`findings=${findings.length}`);
    return;
  }
  // 子プロセス並列（1戦 ≒ 10〜40秒）。⚠日本語の山名はコマンドラインに載せない＝対の番号だけ渡す。
  const n = Math.min(p1, pairs.length - 1) - p0 + 1;
  const per = Math.ceil(n / JOBS);
  const self = fileURLToPath(import.meta.url);
  const t0 = Date.now();
  const outs = await Promise.all(Array.from({ length: JOBS }, (_, j) => {
    const a = p0 + j * per, b = Math.min(p0 + (j + 1) * per - 1, p1);
    if (a > b) return Promise.resolve('');
    return new Promise<string>(res => {
      const ch = spawn(process.execPath, ['--import', 'tsx', self, '--worker', '--pairs', `${a}-${b}`, '--seeds', SEEDS.join(','), '--steps', String(MAX_STEPS), '--deck-dir', DECK_DIR, '--policy', POLICY, ...(OUT ? ['--out', OUT] : []), ...(COV_OUT ? ['--cov-out', COV_OUT] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      ch.stdout.on('data', d => { buf += d; });
      ch.on('close', () => res(buf));
    });
  }));
  const all = outs.join('').split(/\r?\n/).filter(Boolean);
  const games = all.filter(l => / steps=/.test(l));
  const bad = all.filter(l => l.startsWith('  🔴'));
  for (const l of games.filter(l => !/: finished /.test(l))) console.log(l);
  for (const l of bad) console.log(l);
  console.log(`${games.length}戦（決着 ${games.filter(l => /: finished /.test(l)).length}）｜所見 ${bad.length}｜${((Date.now() - t0) / 1000).toFixed(0)}秒${OUT ? `｜明細 → ${OUT}` : ''}`);
})();
