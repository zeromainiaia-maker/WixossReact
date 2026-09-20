/**
 * replayReportEngine.ts — **バグ報告の盤面を engine に通して、ログ通りに撃ち直す**
 * （§5.6 `C-0`・2026-09-20 ユーザー提案「バグ報告の盤面を再現しログ通りに実行すれば、バグの修正が遅くなることが少なくなる」）。
 *
 * 🔴**なぜ要るか（実測）**＝報告 `c32a37ce` は**推論で2往復ムダにした**。
 *   ①私は `boardDiffTriggers.ts` を読んで「トリガーは発火しない」と答えた（結論は正しかったが**測っていなかった**）。
 *   ②本命のバグ（《黒×0》がトラッシュ【起】に効いていない）は**ログにも盤面にも見えない**形で、
 *     ユーザーの指摘で初めて見つかった。
 *   ⇒ **ログに出てくる効果を1つずつ engine で撃ち直し、「提示できるか・いくら請求されるか・盤面がどう動くか」を並べる。**
 *      この3つを並べれば①も②も**最初の1回で**見える（②は「【出】が《黒×0》を宣言した直後にエナ3枚請求」として出る）。
 *
 * 使い方:
 *   node scripts/replayReport.mjs <report.json> --replay      # ← こちらが入口（内部でこれを呼ぶ）
 *   npx tsx scripts/replayReportEngine.ts <report.json> [--logs N]
 *
 * ⚠🔴**盤面は「報告を送った時点」の1枚しか無い**（`bug_reports.snapshot.row`）＝**ログ各行の時点の盤面ではない**。
 *   だからこれは「そのカードの効果を**いまの盤面で**撃つとどうなるか」を出す道具で、対戦の完全な巻き戻しではない。
 *   ⇒ **「置けない／請求額が違う／候補がおかしい」型は出る。「数ターン前の状態に依存する」型は出ない。**
 * ⚠**engine だけを回す**（React も Supabase も通らない）＝決定論・無料・数秒。
 */
import fs from 'fs';
import { join } from 'path';
import Papa from 'papaparse';
import type { CardData, PlayerState } from '../src/types';
import type { CardEffect } from '../src/types/effects';
import { mergeManualEffects } from '../src/data/manualEffects';
import { abilityBlockTextOf } from '../src/data/effectParser';
import { setRngSeed } from '../src/engine/rng';
import {
  executeEffect, resumeSelectTarget, resumeSearch, resumeChoose, resumeLookAndReorder,
  resumeRevealCards, resumeSelectZone, resumeSelectVirusZone, resumeSelectSigniZone,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';
import { InstanceMap } from '../src/screens/battle/battleUtils';
import { canActivateLrigEffect } from '../src/screens/battle/lrigActivateGate';
import { listActivatableSigniEffects } from '../src/screens/battle/signiActivateGate';
import { listOffFieldActivatableEffects } from '../src/screens/battle/offFieldActivateGate';
import { applyActivateCostZero } from '../src/screens/battle/activateCostZero';

setRngSeed(20260920);   // ⚠決定論（`behaviorAudit.ts` と同じ理由＝シャッフルする効果が毎回変わる）
const root = process.cwd();
const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const file = args.find(a => !a.startsWith('--'));
const LOG_N = argVal('--logs') ? parseInt(argVal('--logs')!, 10) : 30;
if (!file) { console.error('使い方: npx tsx scripts/replayReportEngine.ts <report.json> [--logs N]'); process.exit(1); }

// ── データ読み込み（`behaviorAudit.ts` と同じ）──
const cardMap = new Map<string, CardData>();
for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
  const p = join(root, 'public/data', f);
  if (!fs.existsSync(p)) continue;
  const { data } = Papa.parse<Record<string, string>>(fs.readFileSync(p, 'utf-8').replace(/^﻿/, ''), { header: true, skipEmptyLines: true });
  for (const r of data) { const id = r.CardNum?.trim(); if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData); }
}
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json']) {
  const j = JSON.parse(fs.readFileSync(join(root, 'public/data', f), 'utf-8'));
  for (const [id, effs] of Object.entries(j)) effectsMap.set(id, effs as CardEffect[]);
}
for (const [id] of cardMap) {
  const merged = mergeManualEffects(id, (effectsMap.get(id) ?? []) as never[]);
  if (merged.length > 0) effectsMap.set(id, merged as CardEffect[]);
}
// ⚠**実機と同じ `InstanceMap` を通す**＝`WX22-Re17#g1` のような instance id で引けないと
//   提示ゲートが何も返さず、**壊れていないのに壊れて見える**（この道具を書くとき実際に踏んだ）。
const iCards = new InstanceMap<CardData>(cardMap);
const iEffects = new InstanceMap<CardEffect[]>(effectsMap);
const baseNum = (n: string) => n.split('#')[0];
const nameOf = (n: string) => cardMap.get(baseNum(n))?.CardName ?? n;

// ── 報告の読み込み ──
const report = JSON.parse(fs.readFileSync(file, 'utf-8'));
const row = report.snapshot?.row ?? {};
const reporterIsHost = report.user_id === row.host_id;
const sideState = (mine: boolean): PlayerState =>
  JSON.parse(JSON.stringify((mine === reporterIsHost ? row.host_state : row.guest_state) ?? {}));
const logs: { action?: string }[] = row.game_logs ?? [];

// ── 盤面差分（ゾーンごとの増減を自然文で）──
const ZONE_KEYS: { key: string; label: string }[] = [
  { key: 'hand', label: '手札' }, { key: 'deck', label: 'デッキ' }, { key: 'trash', label: 'トラッシュ' },
  { key: 'energy', label: 'エナ' }, { key: 'life_cloth', label: 'ライフ' }, { key: 'lrig_trash', label: 'ルリグトラッシュ' },
  { key: 'field.signi', label: '場' }, { key: 'field.lrig', label: 'ルリグ' },
];
const zoneCards = (s: PlayerState, key: string): string[] => {
  if (key === 'field.signi') return (s.field?.signi ?? []).flatMap(z => z ?? []);
  if (key === 'field.lrig') return [...(s.field?.lrig ?? [])];
  return [...((s as unknown as Record<string, string[]>)[key] ?? [])];
};
function diffSide(before: PlayerState, after: PlayerState, who: string): string[] {
  const out: string[] = [];
  for (const z of ZONE_KEYS) {
    const b = zoneCards(before, z.key), a = zoneCards(after, z.key);
    const gone = b.filter(n => !a.includes(n)), came = a.filter(n => !b.includes(n));
    if (gone.length) out.push(`${who}${z.label} -${gone.map(nameOf).join('・')}`);
    if (came.length) out.push(`${who}${z.label} +${came.map(nameOf).join('・')}`);
  }
  const bd = JSON.stringify(before.field?.signi_down ?? []), ad = JSON.stringify(after.field?.signi_down ?? []);
  if (bd !== ad) out.push(`${who}シグニのダウン ${bd} → ${ad}`);
  if ((before.field?.lrig_down ?? false) !== (after.field?.lrig_down ?? false)) out.push(`${who}ルリグ ${after.field?.lrig_down ? 'ダウン' : 'アップ'}`);
  const bp = JSON.stringify(before.temp_power_mods ?? []), ap = JSON.stringify(after.temp_power_mods ?? []);
  if (bp !== ap) out.push(`${who}パワー修正 ${ap}`);
  return out;
}

// ── オートパイロット（`behaviorAudit.ts` と同じ規約＝候補の先頭から取る）──
function autopilot(first: ExecResult, base: ExecCtx): { status: string; result: ExecResult; choices: string[] } {
  let result = first; let steps = 0; const choices: string[] = [];
  while (!result.done) {
    if (++steps > 40) return { status: 'HANG', result, choices };
    const pending = (result as { pending: { type: string; [k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const ctx: ExecCtx = { ...base, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    try {
      switch (pending.type) {
        case 'SELECT_TARGET': {
          const c = (p.candidates as string[]) ?? []; const n = Math.min((p.count as number) ?? 1, c.length);
          choices.push(`対象選択 候補[${c.map(nameOf).join('・') || 'なし'}] → ${c.slice(0, n).map(nameOf).join('・') || '選べない'}`);
          result = resumeSelectTarget(c.slice(0, n), pending as never, ctx); break;
        }
        case 'SEARCH': {
          const v = (p.visibleCards as string[]) ?? []; const n = Math.min((p.maxPick as number) ?? 0, v.length);
          choices.push(`探索 見える[${v.map(nameOf).join('・')}] → ${v.slice(0, n).map(nameOf).join('・')}`);
          result = resumeSearch(v.slice(0, n), pending as never, ctx); break;
        }
        case 'CHOOSE': {
          const o = (p.options as { id: string; label?: string; available?: boolean }[]) ?? [];
          const pick = o.find(x => x.available !== false) ?? o[0];
          if (!pick) return { status: 'SKIP', result, choices };
          choices.push(`選択肢[${o.map(x => x.label ?? x.id).join(' / ')}] → 「${pick.label ?? pick.id}」`);
          result = resumeChoose(pick.id, pending as never, ctx); break;
        }
        case 'LOOK_AND_REORDER': result = resumeLookAndReorder((p.cards as string[]) ?? [], [], pending as never, ctx); break;
        case 'REVEAL_CARDS': result = resumeRevealCards(pending as never, ctx); break;
        case 'SELECT_ZONE': result = resumeSelectZone(steps % 3, pending as never, ctx); break;
        case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(steps % 3, pending as never, ctx); break;
        case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(steps % 3, pending as never, ctx); break;
        default: return { status: `SKIP(${pending.type})`, result, choices };
      }
    } catch (e) { return { status: `CRASH ${(e as Error).message}`, result, choices }; }
  }
  return { status: 'OK', result, choices };
}

// ── ログ行 → 撃ち直す効果 ──
type Hit = { line: string; mine: boolean; kind: 'OnPlay' | 'Act' | 'Auto' | 'Burst'; name: string; fromTrash: boolean; lrig: boolean };
function parseLine(line: string): Hit | null {
  const mine = line.startsWith('[あなた]');
  const body = line.replace(/^\[(あなた|相手|CPU)\]\s*/, '');
  let m: RegExpMatchArray | null;
  if ((m = body.match(/^ルリグの【起】を発動:\s*(.+)$/))) return { line, mine, kind: 'Act', name: m[1].trim(), fromTrash: false, lrig: true };
  if ((m = body.match(/^トラッシュの【起】を発動:\s*(.+)$/))) return { line, mine, kind: 'Act', name: m[1].trim(), fromTrash: true, lrig: false };
  if ((m = body.match(/^(.+?)【起】（トラッシュから発動）$/))) return { line, mine, kind: 'Act', name: m[1].trim(), fromTrash: true, lrig: false };
  if ((m = body.match(/^(.+?) の【出】効果$/))) return { line, mine, kind: 'OnPlay', name: m[1].trim(), fromTrash: false, lrig: false };
  if ((m = body.match(/^(.+?) の【起】効果$/))) return { line, mine, kind: 'Act', name: m[1].trim(), fromTrash: false, lrig: false };
  if ((m = body.match(/^(.+?) の【自】効果/))) return { line, mine, kind: 'Auto', name: m[1].trim(), fromTrash: false, lrig: false };
  if ((m = body.match(/^(.+?) の【ライフバースト】効果$/))) return { line, mine, kind: 'Burst', name: m[1].trim(), fromTrash: false, lrig: false };
  return null;
}
/**
 * そのカード名の instance を盤面のどこかから探す（見つからなければ素のカード番号）。
 * ⚠🔴**`fromTrash`（トラッシュ【起】）はトラッシュを最優先で探す**＝同名が場にも居ると
 *   **場のインスタンスを拾ってしまい、トラッシュ用の提示ゲートも《黒×0》判定も効かなくなる**
 *   （この道具の初版で実際に踏んだ＝`WX22-Re17` が「在処=場」と出た）。
 */
function findInstance(s: PlayerState, other: PlayerState, name: string, fromTrash = false): { inst: string; where: string } | null {
  const all: [string, string[]][] = fromTrash ? [
    ['トラッシュ', s.trash ?? []], ['場', zoneCards(s, 'field.signi')], ['デッキ', s.deck ?? []],
    ['手札', s.hand ?? []], ['エナ', s.energy ?? []], ['ライフ', s.life_cloth ?? []],
  ] : [
    ['場', zoneCards(s, 'field.signi')], ['ルリグ', zoneCards(s, 'field.lrig')],
    ['トラッシュ', s.trash ?? []], ['手札', s.hand ?? []], ['エナ', s.energy ?? []],
    ['デッキ', s.deck ?? []], ['ルリグトラッシュ', s.lrig_trash ?? []], ['ライフ', s.life_cloth ?? []],
    ['相手の場', zoneCards(other, 'field.signi')],
  ];
  for (const [where, nums] of all) { const hit = nums.find(n => nameOf(n) === name); if (hit) return { inst: hit, where }; }
  const byName = [...cardMap.values()].find(c => c.CardName === name);
  return byName ? { inst: byName.CardNum, where: '（盤面に無い＝カード番号で代用）' } : null;
}
const pickEffects = (inst: string, kind: Hit['kind'], fromTrash: boolean): CardEffect[] => {
  const effs = effectsMap.get(baseNum(inst)) ?? [];
  if (kind === 'Burst') return effs.filter(e => e.effectType === 'LIFE_BURST');
  if (kind === 'Act') return effs.filter(e => e.effectType === 'ACTIVATED' && (!fromTrash || !!e.trashActivated));
  if (kind === 'OnPlay') return effs.filter(e => e.effectType === 'AUTO' && (e.timing ?? []).includes('ON_PLAY'));
  return effs.filter(e => e.effectType === 'AUTO');
};

/**
 * 提示ゲートが false のときの**分かる範囲の理由**（複数ありうるので全部出す）。
 * 🔑**boolean だけだと「直したから撃てない」のか「別の理由」のか読めない**＝診断の往復が増える。
 * ⚠**網羅ではない**（ゲートの軸は20本以上ある）＝ここに出ない理由もある。
 */
function gateReasons(eff: CardEffect, my: PlayerState, inst: string, fromTrash: boolean): string[] {
  const r: string[] = [];
  const done = my.actions_done ?? [];
  if (eff.usageLimit === 'once_per_turn' && done.includes(eff.effectId)) r.push('《ターン１回》消化済み');
  if (eff.usageLimit === 'twice_per_turn' && done.filter(id => id === eff.effectId).length >= 2) r.push('《ターン２回》消化済み');
  if (eff.usageLimit === 'once_per_game' && (my.game_actions_done ?? []).includes(eff.effectId)) r.push('《ゲーム１回》消化済み');
  if (eff.cost?.down_self && my.field?.lrig_down) r.push('《ダウン》：もうダウンしている');
  if (eff.costUnparsed) r.push('costUnparsed（原文のコストを表現できていない＝提示しない）');
  const act = eff.action as { type?: string } | undefined;
  if (act?.type === 'ADD_TO_FIELD' && !(my.field?.signi ?? []).some(z => !z || z.length === 0)) r.push('空きシグニゾーンが無い（§5.6 `C-0`）');
  const need = (applyActivateCostZero(eff, my, inst).cost?.energy ?? []).reduce((n, c) => n + c.count, 0);
  if (need > (my.energy ?? []).length) r.push(`エナ不足（要 ${need} / 在 ${(my.energy ?? []).length}）`);
  if (fromTrash && !(my.trash ?? []).includes(inst)) r.push('🔴このカードがトラッシュに無い（報告時点では既に移動している）');
  return r;
}

// ── 出力 ──
const at = report.snapshot?.at ?? {};
console.log(`\n══════════ 報告の盤面で撃ち直す（engine のみ・決定論） ══════════`);
console.log(`報告    : [${report.tag}] ${report.comment ?? '（コメントなし）'}`);
console.log(`局面    : T${at.turn_count} ${at.global_phase}/${at.turn_phase}  報告者=${reporterIsHost ? 'host' : 'guest'}`);
console.log(`🔴盤面は**報告を送った時点の1枚**＝ログ各行の時点ではない。`);
console.log(`   ⇒「置けない／請求額が違う／候補がおかしい」型は出る。「数ターン前に依存」型は出ない。`);

const recent = logs.slice(-LOG_N).map(l => l.action ?? '').filter(Boolean);
const hits: Hit[] = [];
for (const line of recent) {
  const h = parseLine(line);
  if (h && !hits.some(x => x.name === h.name && x.kind === h.kind && x.fromTrash === h.fromTrash)) hits.push(h);
}
if (hits.length === 0) {
  console.log(`\nログ末尾${LOG_N}件に「効果の発動」行が見つかりませんでした（--logs を増やしてください）。`);
  process.exit(0);
}

for (const h of hits) {
  const my = sideState(h.mine), op = sideState(!h.mine);
  const found = findInstance(my, op, h.name, h.fromTrash);
  console.log(`──────────────────────────────`);
  console.log(`● ${h.line}`);
  if (!found) { console.log(`   ⚠カード「${h.name}」を特定できませんでした`); continue; }
  const { inst, where } = found;
  const src = h.lrig ? (my.field?.lrig?.at(-1) ?? inst) : inst;
  const effs = pickEffects(src, h.kind, h.fromTrash);
  console.log(`   ${nameOf(src)}（${src}）  在処=${where}`);
  if (effs.length === 0) { console.log(`   ⚠該当する効果が live に無い`); continue; }
  for (const eff of effs) {
    const card = cardMap.get(baseNum(src));
    console.log(`\n   ── ${eff.effectId} ──`);
    console.log(`   原文    : ${abilityBlockTextOf(card, eff.effectId).trim().replace(/\s+/g, ' ')}`);
    // ① 提示ゲート＝「いま撃てるか」。🔑報告①（満杯なのに撃てた）はここに出る。
    if (eff.effectType === 'ACTIVATED') {
      let gate = '（この入口の判定は未対応）';
      if (h.lrig) {
        gate = canActivateLrigEffect(eff, {
          my, op, phase: 'MAIN', effectsMap: iEffects, cardMap: iCards, blockedSelf: new Set<string>(),
        }, src) ? '撃てる' : '🔴撃てない（提示されない）';
      } else if (h.fromTrash) {
        const pool = (my.energy ?? []).map((cardNum, energyIndex) => ({ origin: 'energy' as const, cardNum, energyIndex }));
        const list = listOffFieldActivatableEffects({
          zone: 'trash', cardNum: inst, my, op, turnPhase: 'MAIN', isMyTurn: true,
          cardMap: iCards, effectsMap: iEffects, energyPool: pool,
        }).map(e => e.effectId);
        gate = list.includes(eff.effectId) ? '撃てる' : '🔴撃てない（提示されない）';
      } else {
        const zi = (my.field?.signi ?? []).findIndex(z => (z ?? []).includes(inst));
        if (zi >= 0) {
          const list = listActivatableSigniEffects({
            my, op, zoneIndex: zi, phase: 'MAIN', isMyTurn: true, effectsMap: iEffects, cardMap: iCards,
          }).map(e => e.effectId);
          gate = list.includes(eff.effectId) ? '撃てる' : '🔴撃てない（提示されない）';
        }
      }
      // ② 請求コスト＝**軽減を適用したあと**。🔑報告②（《黒×0》が効かない）はここに出る。
      const raw = JSON.stringify(eff.cost ?? {});
      const paid = JSON.stringify(applyActivateCostZero(eff, my, inst).cost ?? {});
      const why = gate.startsWith('🔴') ? gateReasons(eff, my, inst, h.fromTrash) : [];
      console.log(`   提示    : ${gate}${why.length ? `   理由＝${why.join(' / ')}` : ''}`);
      console.log(`   請求    : ${paid}${raw !== paid ? `   （印字は ${raw}）` : ''}`);
    }
    // ③ 実行＝盤面差分と engine ログ。
    const ctx = {
      ownerState: my, otherState: op, cardMap: iCards, effectsMap: iEffects, logs: [] as string[],
      sourceCardNum: src, triggeringCardNum: src, currentPhase: 'MAIN',
    } as unknown as ExecCtx;
    let ap: { status: string; result: ExecResult; choices: string[] };
    try { ap = autopilot(executeEffect(eff, ctx), ctx); }
    catch (e) { console.log(`   🔴実行で例外: ${(e as Error).message}`); continue; }
    const after = ap.result.ownerState ?? my, afterOp = ap.result.otherState ?? op;
    const d = [...diffSide(my, after, '自.'), ...diffSide(op, afterOp, '相.')];
    for (const c of ap.choices) console.log(`   選択    : ${c}`);
    console.log(`   盤面差分: ${d.length ? d.join(' / ') : '🔴なし（何も起きていない）'}`);
    console.log(`   engineログ: ${(ap.result.logs ?? []).join(' / ') || 'なし'}`);
    if (ap.status !== 'OK') console.log(`   ⚠status=${ap.status}`);
  }
}
console.log(`──────────────────────────────`);
console.log(`読み方＝**原文 × 提示 × 請求 × 盤面差分**の4つを並べて食い違いを探す。`);
console.log(`  ・原文が「場に出す」なのに盤面差分が「なし」   → 置き場・候補・配置制限を疑う`);
console.log(`  ・原文が「コストは《黒×0》」なのに請求が満額   → 軽減の配線漏れ（提示ゲート／支払いUI／CPU のどれか）`);
console.log(`  ・撃てないはずの状況で「撃てる」               → 提示ゲートの抜け`);
