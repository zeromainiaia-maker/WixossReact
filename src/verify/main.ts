// ブラウザ実行の engine 検証ハーネス（verify.html のエントリ）。
// golden の盤面ビルダー/オートパイロットを踏襲しつつ、結果を DOM に可視化する。
// 認証・Supabase 不要。対象＝今セッション実装の3カード。
import Papa from 'papaparse';
import type { CardData, PlayerState, StackEntry } from '../types';
import type { CardEffect, EffectAction } from '../types/effects';
import type { ExecCtx, ExecResult } from '../engine/execUtils';
import {
  executeEffect, resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectSigniZone, resumeSelectVirusZone,
} from '../engine/effectExecutor';
import { collectFieldTriggers, type TrigCtx } from '../engine/triggerCollect';
import { mergeManualEffects } from '../data/manualEffects';

const cardMap = new Map<string, CardData>();

async function loadCards(): Promise<void> {
  const sheets = await Promise.all(
    Array.from({ length: 10 }, (_, i) => fetch(`/data/CardData_Sheet${i + 1}.csv`).then(r => (r.ok ? r.text() : null))),
  );
  const tk = await fetch('/data/CardData_TK.csv').then(r => (r.ok ? r.text() : null));
  const effectFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
  const parts = await Promise.all(effectFiles.map(f => fetch(`/data/${f}`).then(r => r.json() as Promise<Record<string, CardEffect[]>>)));
  const effectsJson: Record<string, CardEffect[]> = Object.assign({}, ...parts);
  const parseRows = (csv: string | null) => (csv ? (Papa.parse<Record<string, string>>(csv, { header: true, skipEmptyLines: true }).data) : []);
  for (const csv of [...sheets, tk]) {
    for (const r of parseRows(csv)) {
      const id = r.CardNum?.trim();
      if (id && !cardMap.has(id)) cardMap.set(id, r as unknown as CardData);
    }
  }
  for (const [id, card] of cardMap) {
    const merged = mergeManualEffects(id, (effectsJson[id] ?? []) as never[]);
    (card as { effects?: CardEffect[] }).effects = merged as CardEffect[];
  }
}

// ── 盤面ビルダー ──
const POOL: string[] = [];
let cursor = 0;
const fresh = () => POOL[cursor++ % POOL.length];
const fill = (n: number) => Array.from({ length: n }, () => fresh());
interface StateOpts { signi?: (string | null)[]; lrig?: string[]; lrigDeck?: string[]; energy?: number; hand?: number; }
function mkState(o: StateOpts = {}): PlayerState {
  return {
    deck: fill(20), lrig_deck: o.lrigDeck ?? [], hand: fill(o.hand ?? 5), life_cloth: fill(7),
    trash: fill(3), lrig_trash: [], energy: fill(o.energy ?? 5), coins: 3, bonds: [],
    field: {
      lrig: o.lrig ?? [], signi: o.signi ? o.signi.map(s => (s ? [s] : null)) : [null, null, null],
      signi_down: [false, false, false], signi_frozen: [false, false, false],
      assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [], signi_traps: [null, null, null],
    },
  } as unknown as PlayerState;
}
function mkCtx(owner: PlayerState, other: PlayerState, sourceInst?: string, eff?: Map<string, number>): ExecCtx {
  return {
    ownerState: owner, otherState: other, cardMap, logs: [],
    sourceCardNum: sourceInst, triggeringCardNum: sourceInst, currentPhase: 'MAIN',
    effectivePowers: eff,
  } as unknown as ExecCtx;
}

// ── オートパイロット（golden と同じ）──
function run(eff: EffectAction, ctx: ExecCtx): ExecResult {
  let result = executeEffect({ effectId: 't', effectType: 'AUTO', action: eff, duration: 'INSTANT', mandatory: true } as CardEffect, ctx);
  let steps = 0;
  while (!result.done) {
    if (++steps > 40) throw new Error('autopilot hang');
    const pending = (result as { pending: { type: string; [k: string]: unknown } }).pending;
    const p = pending as Record<string, unknown>;
    const c: ExecCtx = { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
    switch (pending.type) {
      case 'SELECT_TARGET': { const cands = (p.candidates as string[]) ?? []; result = resumeSelectTarget(cands.slice(0, Math.min((p.count as number) ?? 1, cands.length)), pending as never, c); break; }
      case 'SEARCH': { const vis = (p.visibleCards as string[]) ?? []; result = resumeSearch(vis.slice(0, Math.min((p.maxPick as number) ?? 0, vis.length)), pending as never, c); break; }
      case 'CHOOSE': { const opts = (p.options as { id: string; available?: boolean }[]) ?? []; const pick = opts.find(o => o.available !== false) ?? opts[0]; result = resumeChoose(pick.id, pending as never, c); break; }
      case 'LOOK_AND_REORDER': result = resumeLookAndReorder((p.cards as string[]) ?? [], [], pending as never, c); break;
      case 'SELECT_ZONE': result = resumeSelectZone(steps % 3, pending as never, c); break;
      case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(steps % 3, pending as never, c); break;
      case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(steps % 3, pending as never, c); break;
      default: throw new Error(`unhandled pending ${pending.type}`);
    }
  }
  return result;
}

// ── 描画ヘルパー ──
const nm = (cn: string | null | undefined) => (cn ? (cardMap.get(cn)?.CardName ?? cn) : '空');
const pw = (cn: string) => parseInt(cardMap.get(cn)?.Power ?? '0', 10) || 0;
function renderBoard(label: string, st: PlayerState): string {
  const tops = st.field.signi.map(s => s?.at(-1) ?? null);
  const signi = tops.map((cn, i) => `  [Z${i}] ${cn ? `${nm(cn)}(P${pw(cn)})` : '─'}`).join('\n');
  const lrig = st.field.lrig.length ? `${nm(st.field.lrig.at(-1))}(Lv${cardMap.get(st.field.lrig.at(-1)!)?.Level ?? '?'})` : 'なし';
  const granted = (st as { granted_effects?: Record<string, CardEffect[]> }).granted_effects;
  const grantedStr = granted && Object.keys(granted).length
    ? '\n  granted: ' + Object.entries(granted).map(([k, v]) => `${nm(k)}←${v.map(e => (e.action as { type: string; from?: string[] }).from?.join('/') ?? (e.action as { type: string }).type).join(',')}`).join(' / ')
    : '';
  const keyFlag = (st as { keys_abilities_disabled?: boolean }).keys_abilities_disabled ? '\n  キー能力: 喪失中' : '';
  return `${label}\n  ルリグ: ${lrig}\n${signi}  エナ:${st.energy.length}${grantedStr}${keyFlag}`;
}

interface Assert { ok: boolean; msg: string; }
interface ScenarioResult { title: string; cardId: string; orig: string; before: string; after: string; logs: string[]; asserts: Assert[]; error?: string; }

function scenarioGrantChosen(): ScenarioResult {
  const orig = '【出】以下の２つから１つを選ぶ。表記より高いパワーのあなたの＜電機＞シグニ１体を対象とし、ターン終了時まで、それは選んだ能力を得る。①ダウンしない ②手札に戻らない';
  const r: ScenarioResult = { title: 'SIGNI_GRANT_CHOSEN_ABILITY', cardId: 'WXK09-050 コードアート Ｒ・Ｌ・Ｃ', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const DENKI = [...cardMap.values()].find(c => c.Type === 'シグニ' && (c.CardClass ?? '').includes('電機') && (parseInt(c.Power || '0', 10) > 0))!.CardNum;
    const printed = pw(DENKI);
    const owner = mkState({ signi: [DENKI, null, null] });
    const other = mkState({});
    const ctx = mkCtx(owner, other, 'WXK09-050', new Map([[DENKI, printed + 2000]]));
    r.before = renderBoard('自分（実行前・電機シグニはパワー' + printed + '→' + (printed + 2000) + 'にバフ済み）', owner);
    const res = run({ type: 'STUB', id: 'SIGNI_GRANT_CHOSEN_ABILITY' } as unknown as EffectAction, ctx);
    r.logs = res.logs;
    r.after = renderBoard('自分（実行後）', res.ownerState);
    const granted = (res.ownerState as { granted_effects?: Record<string, CardEffect[]> }).granted_effects?.[DENKI] ?? [];
    r.asserts.push({ ok: granted.length >= 1, msg: '＜電機＞シグニに能力が付与された' });
    const from = (granted[0]?.action as { from?: string[] })?.from ?? [];
    r.asserts.push({ ok: from.includes('DOWN'), msg: '付与された能力＝ダウン保護（from:["DOWN"]）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

function scenarioBanishAttacker(): ScenarioResult {
  const orig = '【自】対戦相手のシグニがアタックしたとき、そのシグニのパワーがそのシグニの正面のシグニのパワーより低い場合、アタックしたそのシグニをバニッシュする';
  const r: ScenarioResult = { title: 'BANISH_ATTACKER_IF_WEAKER_THAN_FRONT（収集配線込み）', cardId: 'WD07-012 コードアンチ ヴィマナ', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const WEAK = [...cardMap.values()].find(c => c.Type === 'シグニ' && c.Power === '3000')!.CardNum;
    // 防御側 D：WD07-012（P12000）を zone0（＝アタッカー zone2 の正面）に。攻撃側 A：弱いシグニを zone2 に。
    const defender = mkState({ signi: ['WD07-012', null, null] });
    const attacker = mkState({ signi: [null, null, WEAK] });
    const effectsMap = new Map<string, CardEffect[]>();
    for (const [id, c] of cardMap) effectsMap.set(id, (c as { effects?: CardEffect[] }).effects ?? []);
    let gid = 0;
    const tctx: TrigCtx = { hostId: 'A', guestId: 'D', activeUserId: 'A', turnPhase: 'ATTACK_SIGNI', effectsMap, cardMap, genId: () => `e${gid++}` };
    r.before = renderBoard('防御側D（WD07-012 P12000）', defender) + '\n\n' + renderBoard('攻撃側A（アタッカー P3000・zone2）', attacker);
    // 収集配線：A の zone2 シグニがアタック → D の WD07-012（any_opp）が拾われるはず
    const entries: StackEntry[] = collectFieldTriggers(tctx, 'ON_ATTACK_SIGNI', WEAK, attacker, defender, 'A');
    const wd = entries.find(e => e.cardNum === 'WD07-012');
    r.asserts.push({ ok: !!wd, msg: `収集配線：アタックで WD07-012 の【自】が ${entries.length} 件中に収集された` });
    // 収集された effect を実行（ownerState=D・otherState=A・triggeringCardNum=アタッカー）
    const ctx = mkCtx(defender, attacker, 'WD07-012', new Map([['WD07-012', 12000], [WEAK, 3000]]));
    (ctx as { triggeringCardNum?: string }).triggeringCardNum = WEAK;
    const res = run((wd?.effect.action ?? { type: 'STUB', id: 'BANISH_ATTACKER_IF_WEAKER_THAN_FRONT' }) as unknown as EffectAction, ctx);
    r.logs = res.logs;
    r.after = renderBoard('攻撃側A（実行後）', res.otherState);
    r.asserts.push({ ok: res.otherState.field.signi[2] == null, msg: 'アタッカー（P3000<正面P12000）がバニッシュされた' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

function scenarioCondGrow(): ScenarioResult {
  const orig = '【アーツ】①あなたのセンタールリグが対戦相手のセンタールリグのレベル以下の場合、あなたのセンタールリグはグロウする。ターン終了時まで、あなたのすべてのキーは能力を失う。（グロウコストは支払う）';
  const r: ScenarioResult = { title: 'CONDITIONAL_GROW_AND_KEY_DISABLE', cardId: 'WXK02-029 ビカム・ユー', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const lrigByLv = (lv: string) => [...cardMap.values()].find(c => c.Type === 'ルリグ' && c.Level === lv)!.CardNum;
    const MYL = lrigByLv('1'), OPPL = lrigByLv('3'), NEXT = lrigByLv('2');
    const owner = mkState({ lrig: [MYL], lrigDeck: [NEXT] });
    const other = mkState({ lrig: [OPPL] });
    const ctx = mkCtx(owner, other, 'WXK02-029');
    r.before = renderBoard('自分（センターLv1）', owner) + '\n相手センター: ' + nm(OPPL) + '(Lv3)';
    const res = run({ type: 'STUB', id: 'CONDITIONAL_GROW_AND_KEY_DISABLE' } as unknown as EffectAction, ctx);
    r.logs = res.logs;
    r.after = renderBoard('自分（実行後）', res.ownerState);
    r.asserts.push({ ok: res.ownerState.field.lrig.at(-1) === NEXT, msg: '自Lv1≤相手Lv3 → 次ルリグ(Lv2)へグロウした' });
    r.asserts.push({ ok: (res.ownerState as { keys_abilities_disabled?: boolean }).keys_abilities_disabled === true, msg: 'すべてのキーが能力を失う（keys_abilities_disabled=true）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

function render(results: ScenarioResult[]): void {
  const allOk = results.every(r => !r.error && r.asserts.every(a => a.ok));
  const summary = document.getElementById('summary')!;
  summary.className = 'verdict ' + (allOk ? 'pass' : 'fail');
  summary.textContent = allOk ? 'ALL PASS' : 'FAIL';
  const app = document.getElementById('app')!;
  app.innerHTML = results.map(r => {
    const ok = !r.error && r.asserts.every(a => a.ok);
    return `<div class="scenario">
      <div class="title">${r.title} <span class="verdict ${ok ? 'pass' : 'fail'}">${ok ? 'PASS' : 'FAIL'}</span></div>
      <div class="card-id">${r.cardId}</div>
      <div class="orig">原文: ${r.orig}</div>
      ${r.error ? `<div class="err">ERROR: ${r.error}</div>` : `
      <div class="row">
        <div class="panel"><h4>実行前</h4><div class="board">${r.before}</div></div>
        <div class="panel"><h4>実行後</h4><div class="board">${r.after}</div></div>
      </div>
      <div class="assert">${r.asserts.map(a => `<div class="${a.ok ? 'ok' : 'ng'}">${a.msg}</div>`).join('')}</div>
      <h4 style="margin-top:10px">engine ログ</h4><div class="logs">${r.logs.map(l => '• ' + l).join('\n') || '(なし)'}</div>`}
    </div>`;
  }).join('');
}

async function main() {
  await loadCards();
  for (const c of cardMap.values()) if (c.Type === 'シグニ' && (parseInt(c.Power || '0', 10) > 0)) POOL.push(c.CardNum);
  const results = [scenarioGrantChosen(), scenarioBanishAttacker(), scenarioCondGrow()];
  render(results);
  (window as unknown as { __verifyResults: unknown }).__verifyResults = results.map(r => ({ title: r.title, pass: !r.error && r.asserts.every(a => a.ok), asserts: r.asserts, error: r.error }));
}
main();
