// ブラウザ実行の engine 検証ハーネス（verify.html のエントリ）。
// golden の盤面ビルダー/オートパイロットを踏襲しつつ、結果を DOM に可視化する。
// 認証・Supabase 不要。対象＝今セッション実装の3カード。
import Papa from 'papaparse';
import type { CardData, PlayerState } from '../types';
import type { CardEffect, EffectAction } from '../types/effects';
import type { ExecCtx, ExecResult } from '../engine/execUtils';
import {
  executeEffect, executeAction, resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeSelectZone, resumeSelectSigniZone, resumeSelectVirusZone,
} from '../engine/effectExecutor';
import { collectOppArtsUseTriggers, type TrigCtx } from '../engine/triggerCollect';
import { deployLimitBlockReason } from '../engine/deployLimit';
import { grantedEffectsOf } from '../engine/grantedStore';
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

// ═══ 2026-09-02（索引C 第10巡）＝この巡で実装した7項目のシナリオ ═══
// ⚠**机上（golden）で緑でも実機で嘘が出る**のが第9巡の教訓なので、engine の funnel と
//   pending を「live のカードデータ・live の effects JSON」で通す形にしてある。

const effectOf = (cardNum: string, effectId: string): CardEffect | undefined =>
  ((cardMap.get(cardNum) as { effects?: CardEffect[] })?.effects ?? []).find(e => e.effectId === effectId);
const liveEffectsMap = (): Map<string, CardEffect[]> => {
  const m = new Map<string, CardEffect[]>();
  for (const [id, c] of cardMap) m.set(id, (c as { effects?: CardEffect[] }).effects ?? []);
  return m;
};

/** `O-74`/`O-79`＝「《X》の効果以外によっては／によってしか新たに場に出せない」。 */
function scenarioOnlyByNamedEffect(): ScenarioResult {
  const orig = '【常】：このシグニは《現実からの逃避　タマ》の効果以外によっては新たに場に出すことができない。'
    + ' ／ 【常】：このシグニは《融合の儀　タウィル//メモリア》か《融合の儀　ウムル//メモリア》の効果によってしか新たに場に出せない。';
  const r: ScenarioResult = { title: 'O-74/O-79 配置元をカード名で限定する自身出撃制限', cardId: 'PR-470B 進化する筋肉　紗倉ひびき / WXDi-P11-050 融合せし極門　ウトゥルス//メモリア', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    let tama = '';
    for (const [num, c] of cardMap) if (c.CardName === '現実からの逃避　タマ') { tama = num; break; }
    const reason = (src?: 'normal_summon' | 'signi_or_spell_effect' | 'other_effect', srcNum?: string) =>
      deployLimitBlockReason({
        placingState: mkState({}), opponentState: mkState({}), cardNum: 'PR-470B',
        cardMap, effectsMap: eff, placementSource: src, placementSourceCardNum: srcNum,
      });
    r.before = '《現実からの逃避　タマ》= ' + (tama || '(見つからず)') + '\n場は空・PR-470B を場に出そうとする';
    const rows: [string, string | null][] = [
      ['通常召喚', reason('normal_summon')],
      ['タマの効果', reason('other_effect', tama)],
      ['別カードの効果', reason('other_effect', 'PR-470B')],
      ['出自不明', reason(undefined, tama)],
    ];
    r.after = rows.map(([k, v]) => '  ' + k + ': ' + (v ?? '配置できる')).join('\n');
    r.logs = rows.map(([k, v]) => k + ' → ' + (v ?? 'null（配置可）'));
    r.asserts.push({ ok: tama !== '', msg: '《現実からの逃避　タマ》が live に居る' });
    r.asserts.push({ ok: reason('other_effect', tama) === null, msg: 'タマの効果でなら場に出せる' });
    r.asserts.push({ ok: reason('other_effect', 'PR-470B') === 'ONLY_BY_NAMED_EFFECT', msg: '別カードの効果では出せない（旧はどの効果でも出せた）' });
    r.asserts.push({ ok: reason('normal_summon') === 'ONLY_BY_NAMED_EFFECT', msg: '通常召喚では出せない' });
    r.asserts.push({ ok: reason(undefined, tama) === null, msg: '出自不明なら掛けない（funnel の既存規約＝過少側）' });
    const a2 = effectOf('WXDi-P11-050', 'WXDi-P11-050-E1')?.action as { exceptSourceCardNames?: string[] } | undefined;
    r.asserts.push({ ok: (a2?.exceptSourceCardNames ?? []).length === 2, msg: 'WXDi-P11-050 は2枚の名前を配置元として持つ（旧は engine ログのみの STUB）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-94`②＝「対戦相手は中央のシグニゾーンにレベル3以上のシグニを新たに配置できない」。 */
function scenarioZoneLevelRestrict(): ScenarioResult {
  const orig = '【常】：対戦相手は中央のシグニゾーンにレベル３以上のシグニを新たに配置できない。';
  const r: ScenarioResult = { title: 'O-94② ゾーン＋レベルの配置禁止が funnel に載る', cardId: 'WXDi-P14-068 幻蟲　ミュウ//フェゾーネ', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    const lvOf = (n: string) => parseInt(cardMap.get(n)?.Level ?? '', 10) || 0;
    let hi = '', lo = '';
    for (const [num, c] of cardMap) {
      if (c.Type !== 'シグニ') continue;
      if (!hi && lvOf(num) >= 3) hi = num;
      if (!lo && lvOf(num) > 0 && lvOf(num) <= 2) lo = num;
      if (hi && lo) break;
    }
    const holder = mkState({ signi: ['WXDi-P14-068', null, null] });
    const reason = (cardNum: string, zoneIndex?: number) => deployLimitBlockReason({
      placingState: mkState({}), opponentState: holder, cardNum, cardMap, effectsMap: eff,
      placementSource: 'normal_summon', zoneIndex,
    });
    r.before = renderBoard('制限を持つ側（相手）', holder)
      + '\n置こうとするシグニ: Lv3+=' + nm(hi) + ' / Lv2-=' + nm(lo);
    const rows: [string, string | null][] = [
      ['Lv' + lvOf(hi) + ' → 中央(Z1)', reason(hi, 1)],
      ['Lv' + lvOf(hi) + ' → 左(Z0)', reason(hi, 0)],
      ['Lv' + lvOf(lo) + ' → 中央(Z1)', reason(lo, 1)],
      ['Lv' + lvOf(hi) + ' → ゾーン未確定', reason(hi)],
    ];
    r.after = rows.map(([k, v]) => '  ' + k + ': ' + (v ?? '配置できる')).join('\n');
    r.logs = rows.map(([k, v]) => k + ' → ' + (v ?? 'null（配置可）'));
    r.asserts.push({ ok: reason(hi, 1) === 'ZONE_LEVEL_RESTRICT', msg: '中央にレベル3以上は置けない' });
    r.asserts.push({ ok: reason(hi, 0) === null && reason(hi, 2) === null, msg: '左右のゾーンには置ける（ゾーン限定が効いている）' });
    r.asserts.push({ ok: reason(lo, 1) === null, msg: 'レベル2以下なら中央にも置ける（レベル限定が効いている）' });
    r.asserts.push({ ok: reason(hi) === null, msg: 'ゾーン未確定なら掛けない（funnel の既存規約）' });
    const tk = effectOf('WXDi-P11-TK01', 'WXDi-P11-TK01-E1')?.action as { id?: string; deployRestrict?: { cap?: number } } | undefined;
    r.asserts.push({ ok: tk?.id === 'DEPLOY_RESTRICT' && tk?.deployRestrict?.cap === 2, msg: '同じ STUB を誤流用していた WXDi-P11-TK01 が体数制限（2体まで）へ戻った' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-130`＝相手アーツの効果を受けた「そのシグニ」をアップ＋効果で得た能力だけ喪失。 */
function scenarioOppArtsAffected(): ScenarioResult {
  const orig = '【自】《ターン１回》：あなたのシグニ１体が対戦相手のアーツの効果を受けたとき、そのシグニをアップし、ターン終了時まで、そのシグニは効果によって得ている能力を失う。';
  const r: ScenarioResult = { title: 'O-130 「そのシグニ」＝効果を受けた自分のシグニ（アップ＋付与能力だけ喪失）', cardId: 'WXK11-019 羅祝石　ダイヤブライド', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const eff = liveEffectsMap();
    const VICTIM = [...cardMap.values()].find(c => c.Type === 'シグニ' && c.CardNum !== 'WXK11-019' && (parseInt(c.Power || '0', 10) > 0))!.CardNum;
    // 相手アーツで「アタックできない」を押し付けられた自分のシグニ（＝効果を受けたシグニ）。
    const gained = [{ effectId: 'X-G', effectType: 'CONTINUOUS',
      action: { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ATTACK_SIGNI', until: 'END_OF_TURN' },
      duration: 'PERMANENT', mandatory: true }] as unknown as CardEffect[];
    const base = mkState({ signi: ['WXK11-019', VICTIM, null] });
    const owner = { ...base, granted_effects: { [VICTIM]: gained },
      field: { ...base.field, signi_down: [false, true, false] } } as unknown as PlayerState;
    const other = mkState({});
    let gid = 0;
    const tctx = { hostId: 'A', guestId: 'D', activeUserId: 'D', meId: 'A', turnPhase: 'ATTACK', effectsMap: eff, cardMap, genId: () => 'e' + (gid++) } as unknown as TrigCtx;
    r.before = renderBoard('自分（Z1 が相手アーツの効果を受けた＝ダウン＋能力を付与された）', owner)
      + '\n  ダウン: [' + (owner.field.signi_down ?? []).join(', ') + ']';
    // ① 収集＝「効果を受けたシグニ」を渡した回だけ発火し、そのシグニが triggeringCardNum に載る
    const fired = collectOppArtsUseTriggers(tctx, owner, other, false, [VICTIM]).entries;
    const entry = fired.find(e => e.effectId === 'WXK11-019-E2');
    const notFired = collectOppArtsUseTriggers(tctx, owner, other, false).entries
      .some(e => e.effectId === 'WXK11-019-E2');
    r.asserts.push({ ok: !!entry, msg: '効果を受けたシグニがあるとき発火する' });
    r.asserts.push({ ok: !notFired, msg: '判定材料が無い回は発火しない（fail-closed・旧は無条件発火）' });
    r.asserts.push({ ok: entry?.triggeringCardNum === VICTIM, msg: 'トリガー元＝効果を受けたそのシグニ' });
    // ② 実行＝そのシグニがアップし、付与ぶんだけ失う（印刷能力は残る）
    const ctx = mkCtx(owner, other, 'WXK11-019');
    (ctx as { triggeringCardNum?: string }).triggeringCardNum = VICTIM;
    const res = run((entry?.effect.action ?? effectOf('WXK11-019', 'WXK11-019-E2')!.action) as EffectAction, ctx);
    r.logs = res.logs;
    const lost = (res.ownerState as { granted_abilities_removed?: string[] }).granted_abilities_removed ?? [];
    r.after = renderBoard('自分（実行後）', res.ownerState)
      + '\n  ダウン: [' + (res.ownerState.field.signi_down ?? []).join(', ') + ']'
      + '\n  granted_abilities_removed: [' + (lost.map(nm).join(', ') || 'なし') + ']'
      + '\n  abilities_removed: [' + ((res.ownerState.abilities_removed ?? []).map(nm).join(', ') || 'なし') + ']';
    r.asserts.push({ ok: res.ownerState.field.signi_down?.[1] === false, msg: '「そのシグニをアップし」が効いた（旧は丸ごと落ちていた）' });
    r.asserts.push({ ok: lost.includes(VICTIM), msg: '能力を失うのは自分の受けたシグニ（旧は相手のシグニ＝向きが逆）' });
    r.asserts.push({ ok: !(res.ownerState.abilities_removed ?? []).includes(VICTIM), msg: '印刷能力は消さない（旧は abilities_removed＝全能力喪失の過剰）' });
    r.asserts.push({ ok: grantedEffectsOf(res.ownerState, VICTIM).length === 0, msg: '効果で得ていた能力は funnel から消えた' });
    r.asserts.push({ ok: grantedEffectsOf(owner, VICTIM).length === 1, msg: '（反転）実行前は付与能力が生きている' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-150`＝`reorder:false` の LOOK_AND_REORDER は並べ替えを受け付けない。 */
function scenarioLookReorderFlag(): ScenarioResult {
  const orig = '（例）あなたのデッキの一番上のカード３枚を見る。＝並べ替えの指示が無い効果でも、UI が ↑↓ を出しデッキを組み替えられていた。';
  const r: ScenarioResult = { title: 'O-150 LOOK_AND_REORDER の reorder が pending まで届く（engine が並びの権威）', cardId: 'live 151効果中 105効果が reorder:false', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const deckTop = [POOL[0], POOL[1], POOL[2]];
    const mk = (reorder: boolean) => ({
      type: 'LOOK_AND_REORDER' as const, source: { location: 'deck' as const, owner: 'self' as const },
      count: 3, private: true, reorder,
      destination: { location: 'deck' as const, owner: 'self' as const, position: 'top' as const },
    });
    const runOne = (reorder: boolean, order: string[], trash: string[] = []) => {
      const st = mkState({});
      const c = mkCtx({ ...st, deck: [...deckTop, ...st.deck.slice(3)] } as PlayerState, mkState({}));
      const res0 = executeAction(mk(reorder) as unknown as EffectAction, c);
      if (res0.done) throw new Error('pending が立たなかった');
      const pend = (res0 as { pending: { type: string; reorder?: boolean } }).pending;
      const after = resumeLookAndReorder(order, trash, pend as never,
        { ...c, ownerState: res0.ownerState, otherState: res0.otherState, logs: res0.logs });
      return { pend, after };
    };
    const rev = [deckTop[2], deckTop[1], deckTop[0]];
    const no = runOne(false, rev);
    const yes = runOne(true, rev);
    const noTrash = runOne(false, rev, [deckTop[1]]);
    r.before = 'デッキトップ: ' + deckTop.map(nm).join(' → ')
      + '\nクライアントが返す並び（逆順）: ' + rev.map(nm).join(' → ');
    r.after = 'reorder:false の結果: ' + no.after.ownerState.deck.slice(0, 3).map(nm).join(' → ')
      + '\nreorder:true  の結果: ' + yes.after.ownerState.deck.slice(0, 3).map(nm).join(' → ')
      + '\nreorder:false ＋トラッシュ選択: ' + noTrash.after.ownerState.deck.slice(0, 2).map(nm).join(' → ');
    r.logs = [...no.after.logs, ...yes.after.logs];
    r.asserts.push({ ok: no.pend.reorder === false, msg: 'reorder:false が pending まで届く（UI が ↑↓ を隠す根拠）' });
    r.asserts.push({ ok: yes.pend.reorder === undefined, msg: 'reorder:true は既定（省略）＝並べ替え可' });
    r.asserts.push({ ok: no.after.ownerState.deck.slice(0, 3).join(',') === deckTop.join(','), msg: 'reorder:false では返された並びを採らない（元の順で戻る）' });
    r.asserts.push({ ok: yes.after.ownerState.deck.slice(0, 3).join(',') === rev.join(','), msg: 'reorder:true では返された並びで戻る' });
    r.asserts.push({ ok: noTrash.after.ownerState.deck.slice(0, 2).join(',') === [deckTop[0], deckTop[2]].join(','), msg: 'reorder:false でもトラッシュ選択（別軸）は通る' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-83`＝条件つきグロウ（コストは払う）＋この方法でグロウしたルリグの【出】抑制。 */
function scenarioConditionalGrow(): ScenarioResult {
  const orig = '【アーツ】あなたのセンタールリグのレベルが対戦相手より低い場合、あなたのセンタールリグをグロウしてもよい。この方法でグロウしたルリグの【出】能力は発動しない。';
  const r: ScenarioResult = { title: 'O-83 条件つきグロウの予約（engine）＋【出】抑制', cardId: 'SP38-001 クロス・テンスグロウ！', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const lrigByLv = (lv: string) => [...cardMap.values()].find(c => c.Type === 'ルリグ' && c.Level === lv)!.CardNum;
    const LOW = lrigByLv('2'), HIGH = lrigByLv('4');
    const act = effectOf('SP38-001', 'SP38-001-E1')!.action as { steps: EffectAction[] };
    const head = { type: 'SEQUENCE', steps: act.steps.slice(0, 2) } as unknown as EffectAction;
    // ① 自分が低い＝グロウ予約が積まれる
    const resLow = run(head, mkCtx(mkState({ lrig: [LOW] }), mkState({ lrig: [HIGH] }), 'SP38-001'));
    // ② 自分が高い＝予約は積まれない（条件が効いている）
    const resHigh = run(head, mkCtx(mkState({ lrig: [HIGH] }), mkState({ lrig: [LOW] }), 'SP38-001'));
    const req = (resLow.ownerState as { pending_effect_grow?: { suppressOnPlay?: boolean } }).pending_effect_grow;
    const reqHigh = (resHigh.ownerState as { pending_effect_grow?: unknown }).pending_effect_grow;
    r.before = '自センター: ' + nm(LOW) + '(Lv2) ／ 相手センター: ' + nm(HIGH) + '(Lv4)';
    r.logs = [...resLow.logs, '--- 自分が高い場合 ---', ...resHigh.logs];
    r.after = '自Lv2 < 相手Lv4 → pending_effect_grow = ' + JSON.stringify(req ?? null)
      + '\n自Lv4 > 相手Lv2 → pending_effect_grow = ' + JSON.stringify(reqHigh ?? null);
    r.asserts.push({ ok: !!req, msg: '自分のセンターが低いときだけグロウ予約が積まれる' });
    r.asserts.push({ ok: req?.suppressOnPlay === true, msg: '「この方法でグロウしたルリグの【出】能力は発動しない」が予約に載る（旧は RULE_REMINDER_TEXT＝完全な no-op）' });
    r.asserts.push({ ok: reqHigh === undefined, msg: '（反転）自分が高ければグロウしない' });
    const grow = (act.steps[0] as { then?: { type?: string; id?: string } }).then;
    r.asserts.push({ ok: grow?.id === 'GROW_BY_EFFECT' && grow?.type !== 'GROW_FREE', msg: 'GROW_FREE ではない＝グロウコストを払う（原文に「支払わずに」が無い）' });
  } catch (e) { r.error = (e as Error).message; }
  return r;
}

/** `O-103`＝「手札に加えるかエナゾーンに置くか場に出し」の3択。 */
function scenarioThreeWaySearch(): ScenarioResult {
  const orig = '【LB】：あなたのデッキから＜美巧＞のシグニ１枚を探して公開し手札に加えるかエナゾーンに置くか場に出し、デッキをシャッフルする。';
  const r: ScenarioResult = { title: 'O-103 行き先が3つある探索（手札／エナ／場）', cardId: 'WX14-024 真実の聖盾　*マウス*', orig, before: '', after: '', logs: [], asserts: [] };
  try {
    const act = effectOf('WX14-024', 'WX14-024-BURST')!.action as { type: string; from_count?: number; choices?: { choiceId: string; action: EffectAction }[] };
    const choices = act.choices ?? [];
    const BIKO = [...cardMap.values()].find(c => c.Type === 'シグニ' && (c.CardClass ?? '').includes('美巧'))!.CardNum;
    const lines: string[] = [];
    const landedBy: Record<string, boolean> = {};
    for (const ch of choices) {
      const st = mkState({});
      const owner = { ...st, deck: [BIKO, ...st.deck], energy: [], hand: [] } as unknown as PlayerState;
      const res = run(ch.action, mkCtx(owner, mkState({}), 'WX14-024'));
      const s = res.ownerState;
      const landed = ch.choiceId === 'hand' ? s.hand.includes(BIKO)
        : ch.choiceId === 'energy' ? s.energy.includes(BIKO)
        : s.field.signi.some(z => (z ?? []).includes(BIKO));
      landedBy[ch.choiceId] = landed;
      lines.push('  ' + ch.choiceId + '（' + ((ch.action as { then?: { type?: string } }).then?.type ?? '?') + '）→ ' + (landed ? '着地した' : '着地しなかった'));
    }
    r.before = 'デッキトップに ' + nm(BIKO) + '（＜美巧＞のシグニ）を仕込み、3つの枝をそれぞれ実行';
    r.after = lines.join('\n');
    r.logs = choices.map(c => c.choiceId + ': ' + c.action.type + ' → then=' + ((c.action as { then?: { type?: string } }).then?.type ?? '?'));
    r.asserts.push({ ok: act.type === 'CHOOSE' && act.from_count === 3, msg: '3択として表せている（旧は2択の受け皿でエナの枝が丸ごと落ちていた）' });
    r.asserts.push({ ok: landedBy.hand === true, msg: '「手札に加える」が実際に手札へ入る' });
    r.asserts.push({ ok: landedBy.energy === true, msg: '「エナゾーンに置く」が実際にエナへ入る' });
    r.asserts.push({ ok: landedBy.field === true, msg: '「場に出す」が実際に場へ出る' });
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
    scenarioOnlyByNamedEffect(), scenarioZoneLevelRestrict(), scenarioOppArtsAffected(),
    scenarioLookReorderFlag(), scenarioConditionalGrow(), scenarioThreeWaySearch(),
  ];
  render(results);
  (window as unknown as { __verifyResults: unknown }).__verifyResults = results.map(r => ({ title: r.title, pass: !r.error && r.asserts.every(a => a.ok), asserts: r.asserts, error: r.error }));
}
main();
