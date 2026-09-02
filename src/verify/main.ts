// ブラウザ実行の engine 検証ハーネス（verify.html のエントリ）。
// golden の盤面ビルダー/オートパイロットを踏襲しつつ、結果を DOM に可視化する。
// 認証・Supabase 不要。対象＝今セッション実装の3カード。
import Papa from 'papaparse';
import type { CardData, PlayerState } from '../types';
import type { CardEffect, EffectAction } from '../types/effects';
import type { ExecCtx, ExecResult } from '../engine/execUtils';
import {
  executeAction, resumeSelectTarget,
  resumeRearrangeSigni, applyEffectBanishSubstituteChoice,
} from '../engine/effectExecutor';
import {
  collectAttackEndTriggers, collectAttackEndDelayedTriggers, collectSigniAttackDelayedTriggers, type TrigCtx,
} from '../engine/triggerCollect';
import { collectBanishSubstitutes } from '../engine/effectEngine';
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

// ⚠オートパイロット（`run`）はこの巡のシナリオでは使わないので撤去した。
//   collector と pending を直接見る形なので、resume は各シナリオが明示的に呼ぶ。

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

// ═══ 2026-09-02（索引B 第1巡）＝この巡で実装した3項目のシナリオ ═══
// ⚠**机上（golden）で緑でも実機で嘘が出る**のが第9巡の教訓なので、collector と funnel を
//   「live のカードデータ・live の effects JSON」で通す形にしてある。

const effectOf = (cardNum: string, effectId: string): CardEffect | undefined =>
  ((cardMap.get(cardNum) as { effects?: CardEffect[] })?.effects ?? []).find(e => e.effectId === effectId);
const liveEffectsMap = (): Map<string, CardEffect[]> => {
  const m = new Map<string, CardEffect[]>();
  for (const [id, c] of cardMap) m.set(id, (c as { effects?: CardEffect[] }).effects ?? []);
  return m;
};
const mkTrig = (eff: Map<string, CardEffect[]>): TrigCtx => {
  let g = 0;
  return { hostId: 'A', guestId: 'D', activeUserId: 'A', meId: 'A', turnPhase: 'ATTACK',
    effectsMap: eff, cardMap, genId: () => 'e' + (g++) } as unknown as TrigCtx;
};

/** `O-181` 軸(b)＝シグニアタックでも watcher≠アタッカーを収集する（`WX25-CP1-012-E1`）。 */
function scenarioAttackEndWatcher(): ScenarioResult {
  const orig = '【自】：あなたのルリグかシグニが**アタックによって**対戦相手のライフクロスを１枚以上クラッシュしたとき、'
    + '**そのアタック終了時**、対戦相手が《無》を支払わないかぎり、対戦相手にダメージを与える。';
  const r: ScenarioResult = { title: 'O-181 軸(b) アタック終了時の watcher≠アタッカー', cardId: 'WX25-CP1-012 錠前サオリ', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    const ATK = [...cardMap.values()].find(c => c.Type === 'シグニ' && c.CardNum !== 'WX25-CP1-012')!.CardNum;
    const own = mkState({ lrig: ['WX25-CP1-012'], signi: [ATK, null, null] });
    const e1 = effectOf('WX25-CP1-012', 'WX25-CP1-012-E1');
    r.before = renderBoard('自分（ルリグが watcher・アタッカーは Z0 のシグニ）', own)
      + '\n  timing=' + JSON.stringify(e1?.timing) + ' scope=' + String(e1?.triggerScope)
      + ' attackCrashedLife=' + String(e1?.triggerCondition?.attackCrashedLife);
    const run = (o: { crashedLife?: boolean }) => collectAttackEndTriggers(
      mkTrig(eff), 'A', ATK, own, mkState({}), true, { attackerKind: 'signi', ...o });
    const yes = run({ crashedLife: true }).entries.map(e => e.effectId);
    const no = run({ crashedLife: false }).entries.map(e => e.effectId);
    const unk = run({}).entries.map(e => e.effectId);
    r.after = '  crashedLife=true  → ' + (yes.join(', ') || '(なし)')
      + '\n  crashedLife=false → ' + (no.join(', ') || '(なし)')
      + '\n  crashedLife=未提供 → ' + (unk.join(', ') || '(なし)');
    r.logs = ['旧 live は timing:ON_OPP_LIFE_CRASHED＝クラッシュした瞬間に即時発火し、効果によるクラッシュでも撃てた'];
    r.asserts.push({ ok: JSON.stringify(e1?.timing) === JSON.stringify(['ON_ATTACK_END']), msg: 'アタック終了時に発火する（旧はクラッシュ即時）' });
    r.asserts.push({ ok: e1?.triggerScope === 'any_ally', msg: 'watcher≠アタッカーの明示 opt-in が載る' });
    r.asserts.push({ ok: yes.includes('WX25-CP1-012-E1'), msg: 'シグニのアタックでもルリグ側の watcher が発火する（旧はアタッカー自身しか見ていなかった）' });
    r.asserts.push({ ok: !no.includes('WX25-CP1-012-E1'), msg: '（反転）ライフをクラッシュしていなければ発火しない' });
    r.asserts.push({ ok: !unk.includes('WX25-CP1-012-E1'), msg: '（反転）判定材料が無ければ発火しない（fail-closed）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-181`＝「そのアタック終了時に」の遅延はアタック宣言時に発火しない（`WX14-018-E4`）。 */
function scenarioAttackEndDelayed(): ScenarioResult {
  const orig = '【起】エクシード２：次のターンの間、対戦相手のシグニ１体がアタックしたとき、**そのアタック終了時に**そのシグニをバニッシュする。';
  const r: ScenarioResult = { title: 'O-181 「そのアタック終了時に」の遅延トリガー', cardId: 'WX14-018 アンシエント/メイデン　イオナ', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    const ATK = [...cardMap.values()].find(c => c.Type === 'シグニ')!.CardNum;
    const inst = effectOf('WX14-018', 'WX14-018-E4')?.action as { trigger?: Record<string, unknown>; duration?: string };
    const dt = { ...inst, sourceCardNum: 'WX14-018' };
    const base = mkState({ lrig: ['WX14-018'] });
    const defender = { ...base, delayed_triggers: [dt] } as unknown as PlayerState;
    r.before = '設置＝' + JSON.stringify(inst?.trigger) + ' / duration=' + String(inst?.duration)
      + '\n相手の ' + nm(ATK) + ' がアタックする';
    const decl = collectSigniAttackDelayedTriggers(mkTrig(eff), 'D', defender, ATK);
    const end = collectAttackEndDelayedTriggers(mkTrig(eff), 'D', defender, ATK, false);
    const endSelf = collectAttackEndDelayedTriggers(mkTrig(eff), 'D', defender, ATK, true);
    r.after = '  アタック宣言時 → ' + (decl.length ? decl.map(e => e.label).join(', ') : '(発火しない)')
      + '\n  アタック終了時 → ' + (end.length ? end.map(e => e.label).join(', ') : '(発火しない)')
      + '\n  終了時（自分のアタック）→ ' + (endSelf.length ? endSelf.map(e => e.label).join(', ') : '(発火しない)');
    r.logs = ['旧はアタック宣言時に発火＝バニッシュした時点でそのアタック自体が起きず、バトルもライフクラッシュも発生しなかった'];
    r.asserts.push({ ok: inst?.trigger?.attackEnd === true, msg: '「そのアタック終了時に」が payload に載る' });
    r.asserts.push({ ok: decl.length === 0, msg: 'アタック宣言時には発火しない（旧はここで発火してアタックを消していた）' });
    r.asserts.push({ ok: end.length === 1, msg: 'アタック終了時に1回だけ発火する' });
    r.asserts.push({ ok: endSelf.length === 0, msg: '（反転）自分のアタックでは発火しない（attackerOwner:opponent）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-59`＝【トラップ】の並べ替え／直前ゾーンの記憶／そのゾーンのトラップ／能力コピー。 */
function scenarioTrapOps(): ScenarioResult {
  const orig = '【起】あなたのすべての【トラップ】を好きなように配置し直す（WX17-062）／それがあったシグニゾーンに手札から'
    + 'カード１枚を【トラップ】として設置する（WX16-028）／そのシグニとその【トラップ】をトラッシュに置く（WX21-025）／'
    + 'このカードはそれのトラップ能力を得て、その能力を発動する（WX17-029）。';
  const r: ScenarioResult = { title: 'O-59 【トラップ】4機構（並べ替え／直前ゾーン／そのゾーン／能力コピー）', cardId: 'WX17-062 / WX16-028 / WX21-025 / WX17-029', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    const T0 = POOL[0], T1 = POOL[1], T2 = POOL[2], H = POOL[3];
    const withTraps = (traps: (string | null)[], o: { hand?: string[]; trash?: string[]; signi?: (string | null)[] } = {}) => {
      const st = mkState({ signi: o.signi });
      return { ...st, hand: o.hand ?? [], trash: o.trash ?? [],
        field: { ...st.field, signi_traps: traps } } as unknown as PlayerState;
    };
    const ctxOf = (own: PlayerState, oth: PlayerState, src: string, trig?: string): ExecCtx => {
      const c = mkCtx(own, oth, src);
      (c as { triggeringCardNum?: string }).triggeringCardNum = trig;
      (c as { effectsMap?: Map<string, CardEffect[]> }).effectsMap = eff;
      return c;
    };
    const lines: string[] = [];
    // ① 並べ替え
    const c1 = ctxOf(withTraps([T0, T1, T2]), mkState({}), 'WX17-062');
    const r1 = executeAction({ type: 'STUB', id: 'TRAP_OP', trapOp: 'rearrange' } as unknown as EffectAction, c1);
    const p1 = (r1 as Extract<ExecResult, { done: false }>).pending as { type: string; mode?: string; signiNums?: string[] };
    const after1 = resumeRearrangeSigni([T2, T0, T1], p1 as never, { ...c1, ownerState: r1.ownerState });
    lines.push('① 並べ替え: ' + [T0, T1, T2].map(nm).join(' / ') + ' → ' + (after1.ownerState.field.signi_traps ?? []).map(x => (x ? nm(x) : '空')).join(' / '));
    r.asserts.push({ ok: p1.type === 'REARRANGE_SIGNI' && p1.mode === 'traps', msg: '① 並べ替え対話が立つ（旧は「未実装」ログだけの no-op）' });
    r.asserts.push({ ok: (after1.ownerState.field.signi_traps ?? []).join(',') === [T2, T0, T1].join(','), msg: '① 指定どおりに並び替わる' });
    // ② 直前ゾーンの記憶
    const own2 = { ...withTraps([null, T1, null], { hand: [H] }), trap_removed_zones: [1] } as PlayerState;
    const c2 = ctxOf(own2, mkState({}), 'WX16-028');
    const setAct = { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'set', trapSource: 'hand', count: 1, trapFixedZone: 'previous' } as unknown as EffectAction;
    const r2 = executeAction(setAct, c2);
    const p2 = (r2 as Extract<ExecResult, { done: false }>).pending as { type: string; thenAction?: { count?: number } };
    const after2 = resumeSelectTarget([H], p2 as never, { ...c2, ownerState: r2.ownerState });
    lines.push('② 直前ゾーン設置: zone=' + String(p2.thenAction?.count) + ' → ' + (after2.ownerState.field.signi_traps ?? []).map(x => (x ? nm(x) : '空')).join(' / '));
    const noMemo = executeAction(setAct, ctxOf({ ...mkState({}), hand: [H] } as PlayerState, mkState({}), 'WX16-028'));
    lines.push('②（反転）記憶なし: ' + String(noMemo.logs.at(-1)));
    r.asserts.push({ ok: after2.ownerState.field.signi_traps?.[1] === H, msg: '② 直前にトラップが居たゾーンへ設置される（旧は「設置保留」の no-op）' });
    r.asserts.push({ ok: !after2.ownerState.hand.includes(H), msg: '② 手札からは抜ける（複製しない）' });
    r.asserts.push({ ok: noMemo.done && String(noMemo.logs.at(-1)).includes('分からない'), msg: '②（反転）記憶が無ければ自由ゾーンへ誤設置しない' });
    // ③ そのゾーンのトラップ
    const c3 = ctxOf(withTraps([T0, T1, null]), mkState({ signi: [null, 'X-TRIG', null] }), 'WX21-025', 'X-TRIG');
    const r3 = executeAction({ type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'trash', trapZoneOfTriggerSource: true } as unknown as EffectAction, c3);
    lines.push('③ そのゾーンのトラップ: → ' + (r3.ownerState.field.signi_traps ?? []).map(x => (x ? nm(x) : '空')).join(' / '));
    r.asserts.push({ ok: r3.ownerState.field.signi_traps?.[1] == null && r3.ownerState.field.signi_traps?.[0] === T0,
      msg: '③ トリガー元と同じゾーンのトラップだけ落ちる（旧は先頭から落としていた）' });
    // ④ 能力コピー
    let withIcon = '';
    for (const [num, cd] of cardMap) {
      if (num === 'WX17-029') continue;
      if (((cd as { effects?: CardEffect[] }).effects ?? []).some(e => e.effectType === 'TRAP_ICON')) { withIcon = num; break; }
    }
    const c4 = ctxOf(withTraps([null, null, null], { trash: [withIcon, T0] }), mkState({}), 'WX17-029');
    const r4 = executeAction({ type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'gain_trap_ability', trapSource: 'trash' } as unknown as EffectAction, c4);
    const p4 = (r4 as Extract<ExecResult, { done: false }>).pending as { type: string; candidates?: string[] };
    lines.push('④ 能力コピー候補: ' + (p4.candidates ?? []).map(nm).join(', ') + '（トラップ能力を持つ札だけ）');
    r.before = 'トラップ枠 / 手札 / トラッシュ を場面ごとに組んで4機構を実行';
    r.after = lines.join('\n');
    r.logs = ['旧はいずれも「未実装」「設置保留」のログだけで盤面が1バイトも動かなかった'];
    r.asserts.push({ ok: p4.type === 'SELECT_TARGET' && JSON.stringify(p4.candidates) === JSON.stringify([withIcon]),
      msg: '④ トラップ能力を持つカードだけが候補（旧は「未実装」ログだけ）' });
    // 構造整理（WX21-025 の3能力が別々に立つ）
    const ids = ((cardMap.get('WX21-025') as { effects?: CardEffect[] })?.effects ?? []).map(e => e.effectId);
    r.asserts.push({ ok: ids.includes('WX21-025-TRAP'), msg: '【トラップアイコン】が独立した効果として立つ（旧は【出】に流れ込んで混線）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-58` 段2＝victim に付いている札を対価にする任意置換（チャーム／アクセ除外）。 */
function scenarioAttachedBanishSubstitute(): ScenarioResult {
  const orig = '【常】：あなたの＜悪魔＞のシグニ１体がバニッシュされる場合、代わりにそのシグニに付いている【チャーム】１枚を'
    + 'トラッシュに置いて**もよい**（WX04-052）／これにアクセされているシグニが場を離れる場合、代わりに**これをゲームから除外**'
    + 'してもよい。そうした場合、そのシグニをダウンする（WXDi-P09-TK03A）。';
  const r: ScenarioResult = { title: 'O-58 段2 付いている札を対価にする任意置換（アタッカー側にもミラー）', cardId: 'WX04-052 堕落の虚無　パイモン / WXDi-P09-TK03A コードイート　オンタマ', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    const DEMON = [...cardMap.values()].find(c => c.Type === 'シグニ' && (c.CardClass ?? '').includes('悪魔'))!.CardNum;
    const CHARM = POOL[5], ACCE = 'WXDi-P09-TK03A';
    const build = (o: { charm?: boolean; acce?: boolean }) => {
      const st = mkState({ signi: [DEMON, 'WX04-052', null] });
      return { ...st, field: { ...st.field,
        signi_charms: [o.charm ? CHARM : null, null, null],
        signi_acce: [o.acce ? [ACCE] : null, null, null] } } as unknown as PlayerState;
    };
    const opp = mkState({});
    const optsOf = (st: PlayerState, isOwnerTurn: boolean) =>
      collectBanishSubstitutes(st, opp, isOwnerTurn, cardMap, eff, DEMON);
    const charmDef = optsOf(build({ charm: true }), false);
    const charmAtk = optsOf(build({ charm: true }), true);
    const acceAtk = optsOf(build({ acce: true }), true);
    const none = optsOf(build({}), true);
    r.before = renderBoard('自分（Z0＝＜悪魔＞の victim・Z1＝WX04-052）', build({ charm: true }))
      + '\n  Z0 のチャーム: ' + nm(CHARM) + ' / アクセ: ' + nm(ACCE);
    r.after = '  防御側（相手ターン）の選択肢: ' + charmDef.map(o => o.kind).join(', ')
      + '\n  アタッカー側（自分ターン）の選択肢: ' + charmAtk.map(o => o.kind).join(', ')
      + '\n  アクセ付き（自分ターン）: ' + acceAtk.map(o => o.kind).join(', ')
      + '\n  何も付いていない: ' + (none.map(o => o.kind).join(', ') || '(なし)');
    r.asserts.push({ ok: charmDef.some(o => o.kind === 'trash_charm'), msg: 'チャーム盾が「選択肢」として出る（旧は無条件で自動適用＝選択が奪われていた）' });
    r.asserts.push({ ok: charmAtk.some(o => o.kind === 'trash_charm'), msg: '🔑アタッカー側でも同じ選択肢が出る（旧は防御側だけ＝O-58 の非対称）' });
    r.asserts.push({ ok: acceAtk.some(o => o.kind === 'exile_acce'), msg: 'アクセ除外もアタッカー側で出る' });
    r.asserts.push({ ok: !none.some(o => o.kind === 'trash_charm' || o.kind === 'exile_acce'), msg: '（反転）何も付いていなければ出ない' });
    // 適用＝行き先とダウンを確かめる（障害③の再発防止）。
    const charmPick = charmAtk.find(o => o.kind === 'trash_charm')!;
    const accePick = acceAtk.find(o => o.kind === 'exile_acce')!;
    const afterCharm = applyEffectBanishSubstituteChoice(DEMON, 'self', charmPick, mkCtx(build({ charm: true }), opp, 'WX04-052'));
    const afterAcce = applyEffectBanishSubstituteChoice(DEMON, 'self', accePick, mkCtx(build({ acce: true }), opp, 'WXDi-P09-TK03A'));
    const gone = applyEffectBanishSubstituteChoice(DEMON, 'self', charmPick, mkCtx(build({}), opp, 'WX04-052'));
    r.logs = [...afterCharm.logs, ...afterAcce.logs, ...gone.logs];
    r.asserts.push({ ok: afterCharm.ownerState.trash.includes(CHARM) && (afterCharm.ownerState.field.signi[0] ?? []).includes(DEMON),
      msg: 'チャームを払って victim は場に残る' });
    r.asserts.push({ ok: (afterAcce.ownerState.excluded ?? []).includes(ACCE) && !afterAcce.ownerState.trash.includes(ACCE),
      msg: '🔴アクセは**ゲームから除外**（旧はログだけ除外・実装はトラッシュ＝障害③）' });
    r.asserts.push({ ok: afterAcce.ownerState.field.signi_down?.[0] === true, msg: '「そうした場合、そのシグニをダウンする」が効く' });
    r.asserts.push({ ok: !gone.ownerState.trash.includes(CHARM) && gone.logs.some(l => l.includes('回避できない')),
      msg: '（反転）対価が無ければ回避は成立しない（コスト0の身代わりを作らない）' });
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
  const results = [
    scenarioAttackEndWatcher(), scenarioAttackEndDelayed(),
    scenarioTrapOps(), scenarioAttachedBanishSubstitute(),
  ];
  render(results);
  (window as unknown as { __verifyResults: unknown }).__verifyResults = results.map(r => ({ title: r.title, pass: !r.error && r.asserts.every(a => a.ok), asserts: r.asserts, error: r.error }));
}
main();
