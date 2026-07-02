/**
 * behaviorAudit.ts — 挙動トレース監査（Behavior Audit）基盤
 *
 * 方針（docs/BEHAVIOR_AUDIT.md）: JSON を読むのをやめ、engine で効果を実際に実行し
 *   「実行前→後の盤面差分＋engineログ」を原文と並べて人間が目視照合する。LLM不使用・決定論・無料。
 *
 * 中核:
 *   ① シナリオビルダー: ラベル付きトークン（実CardNumをグローバル一意に払い出し）で盤面を組む。
 *      engine は cardMap.get(instanceId) で照合するため instanceId は実在CardNum必須（smokeTest 同様）。
 *      各トークンにラベル（相手シグニ甲/自分手札1…）を割り当て、差分を自然文で読めるようにする。
 *   ② 盤面差分器: 両プレイヤー全ゾーンを instanceId で追跡し、移動/増減/パワー修正を自然文化。
 *      owner取り違え（相手デッキ→自分トラッシュ 等）は差分にそのまま現れる。
 *   ③ トレース出力: 原文 | 逆翻訳 | 盤面差分 | ログ を並べる。
 *   ④ 要レビュー・キュー: 非CONTINUOUS なのに無変化＆低情報ログの効果を抽出。
 *
 * 使い方:
 *   npx tsx scripts/behaviorAudit.ts --id WX25-P2-030        # 1カードのトレースを表示
 *   npx tsx scripts/behaviorAudit.ts --set WXDi-P02 --limit 20
 *   npx tsx scripts/behaviorAudit.ts --queue > docs/_behavior_queue.txt   # 要レビュー・キュー抽出
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData, PlayerState } from '../src/types';
import type { CardEffect } from '../src/types/effects';
import { mergeManualEffects } from '../src/data/manualEffects';
import {
  executeEffect,
  resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectVirusZone,
  resumeSelectSigniZone, resumeRearrangeSigni,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';

const root = process.cwd();
const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ONLY_ID = argVal('--id');
const SET = argVal('--set');
const LIMIT = argVal('--limit') ? parseInt(argVal('--limit')!) : Infinity;
const QUEUE = args.includes('--queue');
const STEP_CAP = 200;

// ── データ読み込み（smokeTest と同じ）──
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const text = fs.readFileSync(p, 'utf-8').replace(/^﻿/, '');
  const { data } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as CardEffect[]);
}
for (const [id, card] of cardMap) {
  const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
  if (merged.length > 0) { effectsMap.set(id, merged as CardEffect[]); (card as { effects?: CardEffect[] }).effects = merged as CardEffect[]; }
}

// ── ① シナリオビルダー（ラベル付きトークン払い出し）──
// signiPool: パワー>0 の実シグニ。fill でグローバル一意に払い出し、label を割り当てる。
const signiPool = [...cardMap.values()].filter(c => c.Type === 'シグニ' && +(c.Power || '0') > 0).map(c => c.CardNum);
const lrigCard = [...cardMap.values()].find(c => c.Type === 'ルリグ')?.CardNum ?? null;

/** ラベル付き盤面と instanceId→label マップを返す。source は必ず field.signi[0] に置く。 */
function buildScenario(sourceNum: string): { ctx: ExecCtx; labels: Map<string, string> } {
  const labels = new Map<string, string>();
  let cursor = 0;
  // source と重複しない distinct な実CardNum を払い出す
  const take = (label: string): string => {
    let n = signiPool[cursor++ % signiPool.length];
    let guard = 0;
    while ((n === sourceNum || labels.has(n)) && guard++ < signiPool.length) n = signiPool[cursor++ % signiPool.length];
    labels.set(n, label);
    return n;
  };
  const takeN = (n: number, mk: (i: number) => string) => Array.from({ length: n }, (_, i) => take(mk(i)));

  const mkState = (side: '自' | '相', isSource: boolean): PlayerState => {
    const s0 = isSource ? sourceNum : take(`${side}S甲`);
    if (isSource) labels.set(sourceNum, `${side}S源`);
    return {
      deck: takeN(12, i => `${side}デッキ上${i + 1}`),
      lrig_deck: [],
      hand: takeN(5, i => `${side}手札${i + 1}`),
      life_cloth: takeN(7, i => `${side}ライフ${i + 1}`),
      trash: takeN(3, i => `${side}トラッシュ${i + 1}`),
      lrig_trash: takeN(2, i => `${side}ルリグトラッシュ${i + 1}`),
      energy: takeN(5, i => `${side}エナ${i + 1}`),
      coins: 3,
      bonds: [],
      field: {
        lrig: lrigCard ? [lrigCard] : [],
        signi: [[s0], [take(`${side}S乙`)], [take(`${side}S丙`)]],
        signi_down: [false, false, false],
        signi_frozen: [false, false, false],
        assist_lrig_l: [], assist_lrig_r: [],
        check: null, key_piece: null, free_zone: [],
        signi_traps: [null, null, null],
        signi_charms: [null, null, null],
        signi_acce: [null, null, null],
      },
    } as unknown as PlayerState;
  };

  const ownerState = mkState('自', true);
  const otherState = mkState('相', false);
  const ctx = {
    ownerState, otherState,
    cardMap: cardMap as Map<string, CardData>,
    logs: [] as string[],
    sourceCardNum: sourceNum,
    triggeringCardNum: sourceNum,
    currentPhase: 'MAIN',
  } as unknown as ExecCtx;
  return { ctx, labels };
}

// ── ② 盤面スナップショット & 差分器 ──
type Snapshot = {
  loc: Map<string, string>;              // instanceId → 位置ラベル（"自hand" 等）
  power: Map<string, number>;            // instanceId → temp_power_mods 合計
  coins: { 自: number; 相: number };
  zoneCount: Map<string, number>;        // 位置ラベル → 枚数
};

function snapshot(ctx: ExecCtx): Snapshot {
  const loc = new Map<string, string>();
  const power = new Map<string, number>();
  const zoneCount = new Map<string, number>();
  const put = (id: string | null | undefined, where: string) => {
    if (!id) return;
    loc.set(id, where);
    zoneCount.set(where, (zoneCount.get(where) ?? 0) + 1);
  };
  for (const [side, st] of [['自', ctx.ownerState], ['相', ctx.otherState]] as const) {
    const s = st as PlayerState;
    s.deck.forEach((id, i) => put(id, `${side}デッキ[${i}]`));
    s.hand.forEach(id => put(id, `${side}手札`));
    s.life_cloth.forEach(id => put(id, `${side}ライフ`));
    s.trash.forEach(id => put(id, `${side}トラッシュ`));
    s.lrig_trash.forEach(id => put(id, `${side}ルリグトラッシュ`));
    s.energy.forEach(id => put(id, `${side}エナ`));
    (s.bonds ?? []).forEach(id => put(id, `${side}ボンド`));
    s.field.lrig.forEach(id => put(id, `${side}ルリグ`));
    s.field.signi.forEach((stack, z) => (stack ?? []).forEach((id, d) => put(id, `${side}シグニ${z}${d === (stack!.length - 1) ? '(上)' : '(下)'}`)));
    (s.field.assist_lrig_l ?? []).forEach(id => put(id, `${side}アシストL`));
    (s.field.assist_lrig_r ?? []).forEach(id => put(id, `${side}アシストR`));
    put(s.field.check, `${side}チェック`);
    put(s.field.key_piece, `${side}キー`);
    (s.field.free_zone ?? []).forEach(id => put(id, `${side}フリー`));
    (s.field.beat_zone ?? []).forEach(id => put(id, `${side}ビート`));
    (s.field.signi_charms ?? []).forEach((id, z) => put(id, `${side}チャーム${z}`));
    (s.field.signi_acce ?? []).forEach((id, z) => put(id, `${side}アクセ${z}`));
    (s.field.signi_traps ?? []).forEach((id, z) => put(id, `${side}トラップ${z}`));
    (s.field.signi_soul ?? []).forEach((id, z) => put(id, `${side}ソウル${z}`));
    (s.field.puppet_signi ?? []).forEach(id => put(id, `${side}傀儡`));
    for (const m of (s.temp_power_mods ?? [])) power.set(m.cardNum, (power.get(m.cardNum) ?? 0) + m.delta);
  }
  return { loc, power, coins: { 自: ctx.ownerState.coins, 相: ctx.otherState.coins }, zoneCount };
}

/** 位置ラベルの側（自/相）を判定して owner違いを強調するための小道具 */
const sideOf = (where: string) => where.startsWith('自') ? '自' : where.startsWith('相') ? '相' : '?';

function diffBoard(before: Snapshot, after: Snapshot, labels: Map<string, string>): string[] {
  const lines: string[] = [];
  const lbl = (id: string) => labels.get(id) ?? id;
  // 1) カード移動
  const allIds = new Set([...before.loc.keys(), ...after.loc.keys()]);
  const moves: { id: string; from: string; to: string }[] = [];
  for (const id of allIds) {
    const from = before.loc.get(id) ?? '(不在)';
    const to = after.loc.get(id) ?? '(消滅)';
    // ゾーン内の並び替え（デッキ index 変化）はノイズなので基底ゾーン名で比較
    const base = (w: string) => w.replace(/\[\d+\]/, '').replace(/\((上|下)\)$/, '');
    if (base(from) !== base(to)) moves.push({ id, from, to });
  }
  for (const m of moves.sort((a, b) => lbl(a.id).localeCompare(lbl(b.id)))) {
    const cross = sideOf(m.from) !== sideOf(m.to) && sideOf(m.from) !== '?' && sideOf(m.to) !== '?';
    lines.push(`  ${cross ? '⚠側跨ぎ ' : ''}${lbl(m.id)}: ${m.from} → ${m.to}`);
  }
  // 2) パワー修正
  const pIds = new Set([...before.power.keys(), ...after.power.keys()]);
  for (const id of pIds) {
    const d = (after.power.get(id) ?? 0) - (before.power.get(id) ?? 0);
    if (d !== 0) lines.push(`  ${lbl(id)}: パワー${d > 0 ? '+' : ''}${d}`);
  }
  // 3) コイン
  for (const side of ['自', '相'] as const) {
    const d = after.coins[side] - before.coins[side];
    if (d !== 0) lines.push(`  ${side}コイン: ${d > 0 ? '+' : ''}${d}`);
  }
  return lines;
}

// ── オートパイロット（smokeTest から流用）──
function autopilot(first: ExecResult, baseCtx: ExecCtx): { status: string; detail?: string; result: ExecResult } {
  let result = first;
  let steps = 0;
  let lastSig = ''; let sameN = 0;
  while (!result.done) {
    if (++steps > STEP_CAP) return { status: 'HANG', detail: `step>${STEP_CAP}`, result };
    const pending = (result as { pending: { type: string; [k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const sig = `${pending.type}:${JSON.stringify(p.candidates ?? (p.options as { id: string }[] | undefined)?.map(o => o.id) ?? p.cards ?? '')}`;
    if (sig === lastSig) { if (++sameN > 4) return { status: 'SKIP', detail: `autopilot loop: ${pending.type}`, result }; }
    else { lastSig = sig; sameN = 0; }
    const ctx: ExecCtx = { ...baseCtx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    const zone = steps % 3;
    try {
      switch (pending.type) {
        case 'SELECT_TARGET': {
          const cands = (p.candidates as string[]) ?? [];
          const cnt = Math.min((p.count as number) ?? 1, cands.length);
          result = resumeSelectTarget(cands.slice(0, cnt), pending as never, ctx); break;
        }
        case 'SEARCH': {
          const vis = (p.visibleCards as string[]) ?? [];
          const cnt = Math.min((p.maxPick as number) ?? 0, vis.length);
          result = resumeSearch(vis.slice(0, cnt), pending as never, ctx); break;
        }
        case 'CHOOSE': {
          const opts = (p.options as { id: string; label?: string; available?: boolean }[]) ?? [];
          const skip = opts.find(o => /skip|スキップ|しない|代わりに/i.test(o.label ?? '') || o.id === 'skip');
          const pick = skip ?? opts.find(o => o.available !== false) ?? opts[0];
          if (!pick) return { status: 'SKIP', detail: 'CHOOSE no options', result };
          result = resumeChoose(pick.id, pending as never, ctx); break;
        }
        case 'LOOK_AND_REORDER': {
          const cards = (p.cards as string[]) ?? [];
          result = resumeLookAndReorder(cards, [], pending as never, ctx); break;
        }
        case 'SELECT_ZONE': result = resumeSelectZone(zone, pending as never, ctx); break;
        case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(zone, pending as never, ctx); break;
        case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(sameN >= 3 ? null : zone, pending as never, ctx); break;
        case 'REARRANGE_SIGNI': {
          const arr = (p.signi as string[]) ?? (p.cards as string[]) ?? [];
          result = resumeRearrangeSigni(arr, pending as never, ctx); break;
        }
        default: return { status: 'SKIP', detail: `unhandled pending: ${pending.type}`, result };
      }
    } catch (e) {
      return { status: 'CRASH', detail: `[resume ${pending.type}] ${(e as Error).message}`, result };
    }
  }
  return { status: 'OK', result };
}

// ── トレース実行 ──
type Trace = { card: string; name: string; effectId: string; type: string; status: string; diff: string[]; logs: string[] };

function traceEffect(num: string, eff: CardEffect): Trace {
  const name = cardMap.get(num)?.CardName ?? '';
  const type = (eff.effectType as string) ?? '?';
  const { ctx, labels } = buildScenario(num);
  const before = snapshot(ctx);
  let status = 'OK'; let diff: string[] = []; let logs: string[] = [];
  try {
    const first = executeEffect(eff, ctx);
    const ap = autopilot(first, ctx);
    status = ap.status;
    const afterCtx = { ...ctx, ownerState: ap.result.ownerState, otherState: ap.result.otherState } as ExecCtx;
    const after = snapshot(afterCtx);
    diff = diffBoard(before, after, labels);
    logs = ap.result.logs.slice();
  } catch (e) {
    status = 'CRASH'; logs = [(e as Error).message];
  }
  return { card: num, name, effectId: (eff.effectId as string) ?? '?', type, status, diff, logs };
}

// 逆翻訳シート（既存 docs/decompile_sheet*.txt）から該当行を引く
const decompLines = new Map<string, string>();
for (let s = 1; s <= 10; s++) {
  const p = join(root, `docs/decompile_sheet${s}.txt`);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s{2,}([A-Za-z0-9-]+-(?:E\d+|BURST|SONG|G|[A-Z]+)):\s*(.*)$/);
    if (m) decompLines.set(m[1], m[2]);
  }
}

function printTrace(t: Trace) {
  const card = cardMap.get(t.card);
  const orig = ((card?.EffectText ?? '') + (card?.BurstText ? ' / BURST: ' + card.BurstText : '')).trim();
  console.log(`\n══ ${t.card} ${t.name} [${t.effectId}] (${t.type}) ══`);
  console.log(`原文  : ${orig || '(なし)'}`);
  console.log(`逆翻訳: ${decompLines.get(t.effectId) ?? '(該当なし)'}`);
  console.log(`実行  : ${t.status}`);
  console.log(`差分  :${t.diff.length ? '\n' + t.diff.join('\n') : ' (盤面変化なし)'}`);
  console.log(`ログ  :${t.logs.length ? '\n  ' + t.logs.join('\n  ') : ' (なし)'}`);
}

// 低情報ログ判定（要レビュー・キュー用）: STUB no-op マーカーや空だけなら「意味なし」
const lowInfoLog = (logs: string[]) => logs.every(l => /^\[STUB:|未実装|no-op|^\s*$/.test(l)) || logs.length === 0;

if (QUEUE) {
  // ④ 要レビュー・キュー: 非CONTINUOUS × OK完走 × 盤面無変化 × 低情報ログ
  const suspects: Trace[] = [];
  let scanned = 0;
  for (const [num, effs] of effectsMap) {
    for (const eff of effs) {
      if (eff.effectType === 'CONTINUOUS') continue;
      const t = traceEffect(num, eff);
      scanned++;
      if (t.status === 'OK' && t.diff.length === 0 && lowInfoLog(t.logs)) suspects.push(t);
    }
  }
  console.log(`# 要レビュー・キュー（非CONTINUOUS・無変化・低情報ログ）: ${suspects.length} / ${scanned} 効果`);
  console.log(`# 「対象不在の空振り」も含む＝シナリオビルダー拡充で減る。owner系/欠落no-opバグの母集団。\n`);
  for (const t of suspects) {
    console.log(`${t.card}\t${t.effectId}\t${t.type}\t${(cardMap.get(t.card)?.EffectText ?? '').slice(0, 60).replace(/\s+/g, ' ')}`);
  }
} else {
  // トレース表示（--id / --set / デフォルトはサンプル）
  let targets: string[];
  if (ONLY_ID) targets = [ONLY_ID];
  else if (SET) targets = [...effectsMap.keys()].filter(n => n.startsWith(SET));
  else targets = ['WX25-P2-030', 'WXDi-D06-011', 'WX01-001']; // 試作サンプル
  let shown = 0;
  for (const num of targets) {
    if (shown >= LIMIT) break;
    const effs = effectsMap.get(num);
    if (!effs) { console.log(`(no effects: ${num})`); continue; }
    for (const eff of effs) { printTrace(traceEffect(num, eff)); shown++; if (shown >= LIMIT) break; }
  }
}
