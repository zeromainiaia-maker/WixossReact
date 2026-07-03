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
import { matchesFilter } from '../src/engine/execUtils';
import type { TargetFilter } from '../src/types/effects';
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
const HTML = args.includes('--html');
const HTML_OUT = argVal('--html-out') ?? 'docs/behavior_audit';
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
const lrigColor = (cardMap.get(lrigCard ?? '')?.Color ?? '白');
// 色別プール（エナを5色揃えて色フィルタ/色条件の空振りを消す）
const COLORS = ['白', '青', '赤', '緑', '黒'] as const;
const colorPool: Record<string, string[]> = Object.fromEntries(COLORS.map(c => [c, signiPool.filter(cn => cardMap.get(cn)?.Color?.includes(c))]));
// 全カードプール（ルリグ除く）＝ゾーン対象がスペル/アーツ等シグニ以外でも配置できるようにする
const anyPool = [...cardMap.values()].filter(c => c.CardNum && c.Type !== 'ルリグ').map(c => c.CardNum);

// ── 段階2: 効果対応のシナリオ組み立て補助 ──
// 状態/相対系フィルタキー（CardData だけでは選別できない＝盤面フラグで別途表現）
const STATE_KEYS = new Set([
  'isFrozen', 'isDown', 'isUp', 'crossState', 'hasCharm', 'hasAcce', 'infected', 'isArmored',
  'powerLteSelf', 'powerLtSelf', 'frontOfSelf', 'frontOfGateZone', 'inGateZone', 'thisCardOnly',
  'excludeSelf', 'isTriggerSource', 'centerZoneOnly', 'acceHost', 'hasIcon',
  'levelBelowLeftCard', 'powerBelowLeftCard', 'underLeftCard', 'levelLteFieldVirusCount',
  'powerLteLastProcessed', 'levelLteLastProcessed', 'levelEqLastProcessed', 'levelLteDiscardSigni',
  'powerLteRevealedSigniLevelSum', 'levelEqDiscardLevelSum', 'levelEqualsVar',
  'colorMatchesLrig', 'colorNotMatchesLrig',
]);
const staticPart = (f: TargetFilter | undefined): TargetFilter => {
  const o: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f ?? {})) if (!STATE_KEYS.has(k)) o[k] = v;
  return o as TargetFilter;
};
const pwOf = (cn: string): number => { const p = cardMap.get(cn)?.Power; return p === '∞' ? Infinity : parseInt(p ?? '', 10); };
// フィルタに合致する実シグニを選ぶ（未使用のもの・powerLtSelf 等は低パワー優先）
function pickSigni(f: TargetFilter | undefined, used: Set<string>, lowPower: boolean, pool: string[] = signiPool): string | null {
  const stat = staticPart(f);
  if (f?.colorMatchesLrig && !stat.color) stat.color = [...lrigColor][0]; // lrig と共通色を持つカードを選ぶ
  let best: string | null = null, bestPw = Infinity, scanned = 0;
  for (const cn of pool) {
    if (used.has(cn)) continue;
    const pw = pwOf(cn);
    if (!matchesFilter(cardMap.get(cn), stat, isNaN(pw) ? undefined : pw)) continue;
    if (lowPower) { if (pw < bestPw) { best = cn; bestPw = pw; if (pw <= 1000) break; } }
    else return cn;
    if (++scanned > 800) break;
  }
  return best;
}
// 効果ツリーから対象(SIGNI/LRIG)と source を収集
type Tgt = { owner: string; filter: TargetFilter; ttype: string };
type Src = { owner: string; stype: string; filter: TargetFilter };
type ZoneNeed = { owner: string; zone: 'trash' | 'deck' | 'hand' | 'energy'; filter: TargetFilter; count?: number };
type UnderNeed = { filter: TargetFilter; fromThis: boolean; count: number };
const ZTYPE: Record<string, ZoneNeed['zone']> = { TRASH_CARD: 'trash', DECK_CARD: 'deck', HAND_CARD: 'hand', ENERGY_CARD: 'energy' };
const LOC2ZONE: Record<string, ZoneNeed['zone']> = { deck: 'deck', trash: 'trash', hand: 'hand', energy: 'energy' };
const hasFilterKey = (f: TargetFilter | undefined): boolean =>
  !!(f && (f.cardType || f.cardClass || f.story || f.color || f.keyword || f.cardName));
function collectTargetsSources(eff: CardEffect): { targets: Tgt[]; sources: Src[]; zoneNeeds: ZoneNeed[]; fieldNeeds: Tgt[]; underNeeds: UnderNeed[] } {
  const targets: Tgt[] = []; const sources: Src[] = []; const zoneNeeds: ZoneNeed[] = []; const fieldNeeds: Tgt[] = []; const underNeeds: UnderNeed[] = [];
  (function walk(o: unknown) {
    if (!o || typeof o !== 'object') return;
    const r = o as Record<string, unknown>;
    // 「自/相の場のクラスXシグニ1体につき」系（DRAW_PER_FIELD_COUNT 等）＝countFilterに合う実シグニを owner の場に置く
    const cf = r.countFilter as TargetFilter | undefined;
    if (cf && hasFilterKey(cf)) {
      const owner = (r.countOwner as string) ?? 'self';
      for (const o2 of owner === 'any' ? ['self', 'opponent'] : [owner]) fieldNeeds.push({ owner: o2, filter: cf, ttype: 'SIGNI' });
    }
    // 「シグニの下にある〈X〉を手札に加える」系＝自シグニの下に合致カードを仕込む（TAKE_FROM_UNDER_SIGNI）
    if (r.type === 'TAKE_FROM_UNDER_SIGNI') {
      underNeeds.push({ filter: (r.filter as TargetFilter) ?? {}, fromThis: !!r.fromThis, count: typeof r.count === 'number' ? r.count : 1 });
    }
    for (const key of ['target', 'source'] as const) {
      const t = r[key] as Record<string, unknown> | undefined;
      if (!t || typeof t.type !== 'string') continue;
      const owner = (t.owner as string) ?? (key === 'source' ? 'self' : 'opponent');
      const filter = (t.filter as TargetFilter) ?? {};
      if (t.type === 'SIGNI' || t.type === 'LRIG') targets.push({ owner, filter, ttype: t.type });
      if (key === 'source') sources.push({ owner, stype: t.type, filter });
      if (ZTYPE[t.type] && hasFilterKey(filter))
        zoneNeeds.push({ owner, zone: ZTYPE[t.type], filter, count: typeof t.count === 'number' ? t.count : undefined });
    }
    // SEARCH/サルベージ系: action直下の from.location + 兄弟の filter（例: デッキからスペルを探す）
    const from = r.from as Record<string, unknown> | undefined;
    const fromZone = LOC2ZONE[String(from?.location ?? '')];
    if (from && fromZone) {
      const owner = (from.owner as string) ?? 'self';
      const filter = (r.filter as TargetFilter) ?? {};
      if (hasFilterKey(filter)) zoneNeeds.push({ owner, zone: fromZone, filter, count: typeof r.count === 'number' ? r.count : typeof r.maxCount === 'number' ? r.maxCount : undefined });
    }
    // PLACE_UNDER_SIGNI 等: source が文字列ゾーン名 + action直下 filter（例: トラッシュから英知を2枚下に置く）
    const strZone = LOC2ZONE[String(r.source ?? '')];
    if (strZone && r.filter) {
      const filter = r.filter as TargetFilter;
      if (hasFilterKey(filter)) zoneNeeds.push({ owner: (r.owner as string) ?? 'self', zone: strZone, filter, count: typeof r.count === 'number' ? r.count : undefined });
    }
    for (const v of Object.values(r)) if (v && typeof v === 'object') walk(v);
  })(eff);
  return { targets, sources, zoneNeeds, fieldNeeds, underNeeds };
}

/** 効果対応のラベル付き盤面。対象フィルタに合う実シグニを対象側に配置し、source を要求ゾーンに置く。 */
function buildScenario(sourceNum: string, eff: CardEffect): { ctx: ExecCtx; labels: Map<string, string> } {
  const labels = new Map<string, string>();
  const used = new Set<string>([sourceNum]);
  let cursor = 0;
  const take = (label: string): string => {
    let n = signiPool[cursor++ % signiPool.length];
    let guard = 0;
    while (used.has(n) && guard++ < signiPool.length) n = signiPool[cursor++ % signiPool.length];
    used.add(n); labels.set(n, label);
    return n;
  };
  const takeN = (n: number, mk: (i: number) => string) => Array.from({ length: n }, (_, i) => take(mk(i)));
  // 指定色の未使用カードを払い出す（無ければ汎用 take）
  const takeColor = (label: string, color: string): string => {
    const cand = (colorPool[color] ?? []).find(cn => !used.has(cn));
    if (!cand) return take(label);
    used.add(cand); labels.set(cand, label);
    return cand;
  };

  // source をどのゾーンに置くか（トラッシュ発動/手発動/自身thisCardOnly source）
  const e = eff as unknown as Record<string, unknown>;
  const { targets, sources, zoneNeeds, fieldNeeds, underNeeds } = collectTargetsSources(eff);
  const selfSrcThis = sources.find(s => s.owner === 'self' && (s.filter.thisCardOnly || s.stype === 'TRASH_CARD' || s.stype === 'HAND_CARD'));
  let sourceZone: 'signi' | 'trash' | 'hand' = 'signi';
  if (e.trashActivated || (selfSrcThis && selfSrcThis.stype === 'TRASH_CARD')) sourceZone = 'trash';
  else if (e.handActivated || (e.cost as { discardSelfFromHand?: boolean })?.discardSelfFromHand || (selfSrcThis && selfSrcThis.stype === 'HAND_CARD')) sourceZone = 'hand';

  const mkState = (side: '自' | '相', isSource: boolean): PlayerState => {
    const deck = takeN(12, i => `${side}デッキ上${i + 1}`);
    const hand = takeN(5, i => `${side}手札${i + 1}`);
    const trash = takeN(3, i => `${side}トラッシュ${i + 1}`);
    // source が signi 以外に居る場合、owner の zone0 を空けて「場に出す」着地先を確保する
    const emptyZone0 = isSource && sourceZone !== 'signi';
    const signi: (string[] | null)[] = [
      emptyZone0 ? null : [take(`${side}S甲`)], [take(`${side}S乙`)], [take(`${side}S丙`)],
    ];
    if (isSource) {
      labels.set(sourceNum, `${side}S源`);
      if (sourceZone === 'signi') signi[0] = [sourceNum];
      else if (sourceZone === 'trash') trash.unshift(sourceNum);
      else hand.unshift(sourceNum);
    }
    return {
      deck, lrig_deck: [], hand, life_cloth: takeN(7, i => `${side}ライフ${i + 1}`),
      trash, lrig_trash: takeN(2, i => `${side}ルリグトラッシュ${i + 1}`),
      energy: COLORS.map(c => takeColor(`${side}エナ${c}`, c)), coins: 3, bonds: [],
      field: {
        lrig: lrigCard ? [lrigCard] : [], signi,
        signi_down: [false, false, false], signi_frozen: [false, false, false],
        signi_charms: [null, null, null], signi_acce: [null, null, null],
        signi_virus: [0, 0, 0], signi_armor: [false, false, false], cross_state: [false, false, false],
        assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [],
        signi_traps: [null, null, null],
      },
    } as unknown as PlayerState;
  };

  const ownerState = mkState('自', true);
  const otherState = mkState('相', false);

  // 対象フィルタに合う実シグニを対象側ゾーンに配置（zone0 が source のときは 0 を避ける）
  const nextZone: Record<'自' | '相', number> = { 自: sourceZone === 'signi' ? 1 : 0, 相: 0 };
  for (const tg of targets) {
    if (tg.ttype !== 'SIGNI') continue;
    const side: '自' | '相' = (tg.owner === 'self') ? '自' : '相';
    const st = side === '自' ? ownerState : otherState;
    const z = nextZone[side];
    if (z > 2) continue;
    const low = !!(tg.filter.powerLtSelf || tg.filter.powerLteSelf || tg.filter.powerBelowLeftCard);
    const cn = pickSigni(tg.filter, used, low);
    if (cn) {
      used.add(cn); labels.set(cn, `${side}S対象${z}`);
      st.field.signi[z] = [cn];
      const f = tg.filter;
      if (f.isFrozen) st.field.signi_frozen![z] = true;
      if (f.isDown) st.field.signi_down![z] = true;
      if (f.hasCharm) st.field.signi_charms![z] = take(`${side}チャーム${z}`);
      if (f.hasAcce || f.acceHost) st.field.signi_acce![z] = take(`${side}アクセ${z}`);
      if (f.infected) st.field.signi_virus![z] = 1;
      if (f.isArmored) st.field.signi_armor![z] = true;
      if (f.crossState) st.field.cross_state![z] = true;
    }
    nextZone[side] = z + 1;
  }

  // 「場のクラスXシグニ1体につき」系: countFilter に合う実シグニで owner の未対象ゾーンの汎用シグニを上書き（数え上げを非0にする）
  // 汎用シグニ（自S乙/丙等）は countFilter に合致しないので、nextZone 以降の未対象ゾーンを差し替える
  for (const fn of fieldNeeds) {
    const side: '自' | '相' = (fn.owner === 'self') ? '自' : '相';
    const st = side === '自' ? ownerState : otherState;
    let placed = 0;
    for (let z = nextZone[side]; z <= 2 && placed < 2; z++) {
      const cn = pickSigni(fn.filter, used, false);
      if (!cn) break;
      const prev = st.field.signi[z]?.[0];
      if (prev) { used.delete(prev); labels.delete(prev); } // 汎用シグニを解放して差し替え
      used.add(cn); labels.set(cn, `${side}S数${z}`);
      st.field.signi[z] = [cn];
      placed++;
    }
  }

  // 「シグニの下にある〈X〉を手札に加える」系: 自シグニのスタック下に合致カードを仕込む（TAKE_FROM_UNDER_SIGNI）
  for (const un of underNeeds) {
    // fromThis はソースシグニ限定＝ソースゾーンへ。それ以外は最初の自シグニへ（無ければ zone0）。
    const hostZ = un.fromThis
      ? ownerState.field.signi.findIndex(s => s?.at(-1) === sourceNum)
      : ownerState.field.signi.findIndex(s => s && s.length > 0);
    const z = hostZ >= 0 ? hostZ : 0;
    const host = ownerState.field.signi[z];
    if (!host || host.length === 0) continue; // 下に置くホストが必要
    for (let i = 0; i < Math.min(Math.max(un.count, 1), 2); i++) {
      const cn = pickSigni(un.filter, used, false);
      if (!cn) break;
      used.add(cn); labels.set(cn, `自S下${z}${i > 0 ? i + 1 : ''}`);
      host.unshift(cn); // スタック先頭＝下（engine は slice(0,-1) を「下」とみなす）
    }
  }

  // 段階2b: トラッシュ/デッキ/手札の対象・source フィルタに合う実カードを該当ゾーン先頭へ配置（サルベージ/サーチ系）
  for (const zn of zoneNeeds) {
    const st = zn.owner === 'self' ? ownerState : otherState;
    const side = zn.owner === 'self' ? '自' : '相';
    // cardType がシグニ以外（スペル/アーツ等）を要求する対象は全カードプールから拾う
    const ct = zn.filter.cardType;
    const wantsNonSigni = ct && (Array.isArray(ct) ? !ct.includes('シグニ') : ct !== 'シグニ');
    const zlabel = zn.zone === 'trash' ? 'トラッシュ' : zn.zone === 'deck' ? 'デッキ上' : zn.zone === 'energy' ? 'エナ' : '手札';
    // count 枚（複数枚対象＝英知2枚を下に置く等）を配置。未指定は1枚。
    const need = Math.min(Math.max(zn.count ?? 1, 1), 3);
    for (let i = 0; i < need; i++) {
      const cn = pickSigni(zn.filter, used, false, wantsNonSigni ? anyPool : signiPool);
      if (!cn) break;
      used.add(cn); labels.set(cn, `${side}${zlabel}対象${need > 1 ? i + 1 : ''}`);
      (st[zn.zone] as string[]).unshift(cn); // デッキは上(先頭)、他も先頭に置けば候補に入る
    }
  }

  const ctx = {
    ownerState, otherState, cardMap: cardMap as Map<string, CardData>,
    logs: [] as string[], sourceCardNum: sourceNum, triggeringCardNum: sourceNum, currentPhase: 'MAIN',
  } as unknown as ExecCtx;
  return { ctx, labels };
}

// ── ② 盤面スナップショット & 差分器 ──
type Snapshot = {
  loc: Map<string, string>;              // instanceId → 位置ラベル（"自hand" 等）
  power: Map<string, number>;            // instanceId → temp_power_mods 合計
  level: Map<string, number>;            // instanceId → temp_level_mods 合計（LEVEL_MODIFY）
  flags: Map<string, string>;            // instanceId → 状態フラグ（凍結/ダウン/ウィルス/血晶/クロス/チャーム/アクセ）
  kw: Map<string, string>;               // instanceId → 付与キーワード
  blocked: { 自: string; 相: string };   // player-level 行動制限（blocked_actions + blocked_card_names + 付与）
  coins: { 自: number; 相: number };
};

function snapshot(ctx: ExecCtx): Snapshot {
  const loc = new Map<string, string>();
  const power = new Map<string, number>();
  const level = new Map<string, number>();
  const flags = new Map<string, string>();
  const kw = new Map<string, string>();
  const blocked: Record<'自' | '相', string> = { 自: '', 相: '' };
  const put = (id: string | null | undefined, where: string) => { if (id) loc.set(id, where); };
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
    s.field.signi.forEach((stack, z) => {
      (stack ?? []).forEach((id, d) => put(id, `${side}シグニ${z}${d === (stack!.length - 1) ? '(上)' : '(下)'}`));
      const top = stack?.at(-1); if (!top) return;
      const fl: string[] = [];
      if (s.field.signi_frozen?.[z]) fl.push('凍結');
      if (s.field.signi_down?.[z]) fl.push('ダウン');
      if (s.field.signi_virus?.[z]) fl.push('ウィルス');
      if (s.field.signi_armor?.[z]) fl.push('血晶');
      if (s.field.cross_state?.[z]) fl.push('クロス');
      if (s.field.signi_charms?.[z]) fl.push('チャーム有');
      if (s.field.signi_acce?.[z]) fl.push('アクセ有');
      if (fl.length) flags.set(top, fl.join(','));
    });
    (s.field.assist_lrig_l ?? []).forEach(id => put(id, `${side}アシストL`));
    (s.field.assist_lrig_r ?? []).forEach(id => put(id, `${side}アシストR`));
    put(s.field.check, `${side}チェック`);
    put(s.field.key_piece, `${side}キー`);
    (s.field.free_zone ?? []).forEach(id => put(id, `${side}フリー`));
    (s.field.beat_zone ?? []).forEach(id => put(id, `${side}ビート`));
    (s.field.signi_traps ?? []).forEach((id, z) => put(id, `${side}トラップ${z}`));
    (s.field.signi_soul ?? []).forEach((id, z) => put(id, `${side}ソウル${z}`));
    (s.field.puppet_signi ?? []).forEach(id => put(id, `${side}傀儡`));
    for (const m of (s.temp_power_mods ?? [])) power.set(m.cardNum, (power.get(m.cardNum) ?? 0) + m.delta);
    for (const m of (s.power_mods_until_opp_turn ?? [])) power.set(m.cardNum, (power.get(m.cardNum) ?? 0) + m.delta);
    for (const m of ((s as unknown as { temp_level_mods?: { cardNum: string; delta: number }[] }).temp_level_mods ?? [])) level.set(m.cardNum, (level.get(m.cardNum) ?? 0) + m.delta);
    for (const [id, kws] of Object.entries(s.keyword_grants ?? {})) if (kws.length) kw.set(id, [...kws].sort().join(','));
    for (const [id, kws] of Object.entries(s.keyword_grants_until_opp_turn ?? {})) if (kws.length) kw.set(id, [...(kw.get(id)?.split(',') ?? []), ...kws].sort().join(','));
    const sx = s as unknown as Record<string, unknown>;
    const lrigGrants = (sx.lrig_granted_auto_effects as unknown[] | undefined)?.length ?? 0;
    const signiGrants = (sx.granted_effects as unknown[] | undefined)?.length ?? 0;
    blocked[side] = [
      ...(s.blocked_actions ?? []), ...(s.blocked_card_names ?? []),
      ...(s.field_keyword_grants_active ?? []).map(k => `全付与:${k}`),
      lrigGrants ? `ルリグ付与能力x${lrigGrants}` : '',
      signiGrants ? `シグニ付与能力x${signiGrants}` : '',
      sx.lrig_abilities_disabled ? 'ルリグ能力無効' : '',
    ].filter(Boolean).sort().join('|');
  }
  return { loc, power, level, flags, kw, blocked, coins: { 自: ctx.ownerState.coins, 相: ctx.otherState.coins } };
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
  // 2.5) レベル修正（LEVEL_MODIFY）
  const lIds = new Set([...before.level.keys(), ...after.level.keys()]);
  for (const id of lIds) {
    const d = (after.level.get(id) ?? 0) - (before.level.get(id) ?? 0);
    if (d !== 0) lines.push(`  ${lbl(id)}: レベル${d > 0 ? '+' : ''}${d}`);
  }
  // 3) 状態フラグ（凍結/ダウン/ウィルス等）
  const fIds = new Set([...before.flags.keys(), ...after.flags.keys()]);
  for (const id of fIds) {
    const b = before.flags.get(id) ?? '', a = after.flags.get(id) ?? '';
    if (b !== a) lines.push(`  ${lbl(id)}: 状態[${b || 'なし'}]→[${a || 'なし'}]`);
  }
  // 4) 付与キーワード
  const kIds = new Set([...before.kw.keys(), ...after.kw.keys()]);
  for (const id of kIds) {
    const b = before.kw.get(id) ?? '', a = after.kw.get(id) ?? '';
    if (b !== a) lines.push(`  ${lbl(id)}: 付与[${b || 'なし'}]→[${a || 'なし'}]`);
  }
  // 5) 行動制限（player-level）
  for (const side of ['自', '相'] as const) {
    if (before.blocked[side] !== after.blocked[side]) lines.push(`  ${side}制限: [${before.blocked[side] || 'なし'}]→[${after.blocked[side] || 'なし'}]`);
  }
  // 6) コイン
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
  const { ctx, labels } = buildScenario(num, eff);
  const before = snapshot(ctx);
  const out: { status: string; diff: string[]; logs: string[] } = { status: 'OK', diff: [], logs: [] };
  try {
    const first = executeEffect(eff, ctx);
    const ap = autopilot(first, ctx);
    out.status = ap.status;
    const afterCtx = { ...ctx, ownerState: ap.result.ownerState, otherState: ap.result.otherState } as ExecCtx;
    const after = snapshot(afterCtx);
    out.diff = diffBoard(before, after, labels);
    out.logs = ap.result.logs.slice();
  } catch (e) {
    out.status = 'CRASH'; out.logs = [(e as Error).message];
  }
  return { card: num, name, effectId: (eff.effectId as string) ?? '?', type, status: out.status, diff: out.diff, logs: out.logs };
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

const isSuspect = (t: Trace) => t.type !== 'CONTINUOUS' && t.status === 'OK' && t.diff.length === 0 && lowInfoLog(t.logs);
const isCross = (t: Trace) => t.diff.some(l => l.includes('側跨ぎ'));
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

if (HTML) {
  // ③ HTML表レンダラ: セット単位で 原文｜逆翻訳｜盤面差分｜ログ を並べたレビュー表を吐く
  const setOf = (n: string) => n.replace(/-[^-]+$/, '') || n;
  const bySet = new Map<string, Trace[]>();
  for (const [num, effs] of effectsMap) {
    for (const eff of effs) {
      const t = traceEffect(num, eff);
      const s = setOf(num);
      let arr = bySet.get(s); if (!arr) { arr = []; bySet.set(s, arr); }
      arr.push(t);
    }
  }
  const outDir = join(root, HTML_OUT);
  fs.mkdirSync(outDir, { recursive: true });
  const fname = (s: string) => s.replace(/[^A-Za-z0-9_-]/g, '_') + '.html';
  const css = `
    :root{color-scheme:light dark}
    *{box-sizing:border-box}
    body{margin:0;font:13px/1.5 system-ui,'Segoe UI',sans-serif;color:#1a1a1a;background:#fafafa}
    header{position:sticky;top:0;z-index:5;background:#fff;border-bottom:1px solid #ddd;padding:8px 14px;display:flex;flex-wrap:wrap;gap:10px;align-items:center}
    header h1{font-size:17px;margin:0}
    .counts{color:#666;font-size:12px}
    .bar{display:flex;gap:12px;align-items:center;margin-left:auto}
    .bar input[type=text],#q{padding:4px 8px;border:1px solid #ccc;border-radius:5px;min-width:200px}
    label{font-size:12px;user-select:none}
    a{color:#0563c1;text-decoration:none}a:hover{text-decoration:underline}
    .wrap{overflow-x:auto}
    table{border-collapse:collapse;width:100%;background:#fff}
    thead th{position:sticky;top:49px;background:#f0f2f5;border-bottom:2px solid #ccc;padding:6px 8px;text-align:left;font-size:12px;white-space:nowrap}
    td{border-bottom:1px solid #eee;padding:6px 8px;vertical-align:top}
    tbody tr:hover{background:#f6f9ff}
    td.c{white-space:nowrap;font-size:12px}
    td.c small{color:#888}
    td.mono{font-family:ui-monospace,Consolas,monospace;font-size:12px;white-space:pre-wrap}
    td.mono .x{color:#c00;font-weight:600}
    td:nth-child(3),td:nth-child(4){max-width:32ch;min-width:20ch}
    td.st{font-weight:600;font-size:11px;text-align:center}
    td.st.b{color:#c00}
    tr.suspect{background:#fff7e6}
    tr.suspect:hover{background:#ffefcf}
    tr.cross{box-shadow:inset 4px 0 #c00}
    tr.crash{background:#fdecea}
    i{color:#aaa}
    @media(prefers-color-scheme:dark){body{background:#161616;color:#ddd}header,table{background:#1e1e1e}thead th{background:#252525;border-color:#444}td{border-color:#333}tbody tr:hover{background:#232a35}tr.suspect{background:#3a3320}tr.crash{background:#3a2220}.counts{color:#aaa}td.c small,i{color:#888}}
  `;
  const script = `
    var q=document.getElementById('q'),fs=document.getElementById('fs'),fx=document.getElementById('fx');
    var rows=Array.prototype.slice.call(document.querySelectorAll('tbody tr'));
    function apply(){var t=(q.value||'').toLowerCase();for(var i=0;i<rows.length;i++){var r=rows[i];var show=!t||r.textContent.toLowerCase().indexOf(t)>=0;var tg=r.getAttribute('data-tags')||'';if(fs.checked&&tg.indexOf('要review')<0)show=false;if(fx.checked&&tg.indexOf('側跨ぎ')<0)show=false;r.style.display=show?'':'none';}}
    q.addEventListener('input',apply);fs.addEventListener('change',apply);fx.addEventListener('change',apply);
  `;
  const setStats: { set: string; file: string; n: number; suspect: number; cross: number; crash: number }[] = [];
  for (const [s, traces] of [...bySet].sort((a, b) => a[0].localeCompare(b[0]))) {
    let suspect = 0, cross = 0, crash = 0;
    const rows = traces.map(t => {
      const cd = cardMap.get(t.card);
      const orig = ((cd?.EffectText ?? '') + (cd?.BurstText && cd.BurstText !== '-' ? ' ／BURST: ' + cd.BurstText : '')).trim();
      const dec = decompLines.get(t.effectId) ?? '';
      const sus = isSuspect(t), cr = isCross(t), bad = /CRASH|HANG|INVARIANT/.test(t.status);
      if (sus) suspect++; if (cr) cross++; if (bad) crash++;
      const cls = [sus ? 'suspect' : '', cr ? 'cross' : '', bad ? 'crash' : ''].filter(Boolean).join(' ');
      const tags = [sus ? '要review' : '', cr ? '側跨ぎ' : '', bad ? t.status : ''].filter(Boolean).join(' ');
      const diffHtml = t.diff.length
        ? t.diff.map(l => (l.includes('側跨ぎ') ? '<span class="x">' : '<span>') + escHtml(l.trim()) + '</span>').join('<br>')
        : '<i>盤面変化なし</i>';
      const logHtml = t.logs.length ? t.logs.map(l => escHtml(l)).join('<br>') : '<i>なし</i>';
      const eff = t.effectId.startsWith(t.card + '-') ? t.effectId.slice(t.card.length + 1) : t.effectId;
      return `<tr class="${cls}" data-tags="${tags}"><td class="c">${escHtml(t.card)}<br><small>${escHtml(t.name)}</small></td>`
        + `<td class="c">${escHtml(eff)}<br><small>${t.type}</small></td>`
        + `<td>${orig ? escHtml(orig) : '<i>なし</i>'}</td><td>${dec ? escHtml(dec) : '<i>—</i>'}</td>`
        + `<td class="mono">${diffHtml}</td><td class="mono">${logHtml}</td>`
        + `<td class="st${bad ? ' b' : ''}">${t.status}${sus ? '<br>要review' : ''}${cr ? '<br>側跨ぎ' : ''}</td></tr>`;
    }).join('\n');
    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>挙動監査 ${escHtml(s)}</title><style>${css}</style></head><body>`
      + `<header><a href="index.html">← 索引</a><h1>${escHtml(s)}</h1><span class="counts">効果 ${traces.length}／要review ${suspect}／側跨ぎ ${cross}／crash ${crash}</span>`
      + `<div class="bar"><input type="text" id="q" placeholder="検索(カード名/原文/差分…)"><label><input type="checkbox" id="fs"> 要reviewのみ</label><label><input type="checkbox" id="fx"> 側跨ぎのみ</label></div></header>`
      + `<div class="wrap"><table><thead><tr><th>カード</th><th>効果</th><th>原文</th><th>逆翻訳</th><th>盤面差分</th><th>engineログ</th><th>判定</th></tr></thead><tbody>${rows}</tbody></table></div>`
      + `<script>${script}</script></body></html>`;
    const file = fname(s);
    fs.writeFileSync(join(outDir, file), html, 'utf8');
    setStats.push({ set: s, file, n: traces.length, suspect, cross, crash });
  }
  const idxRows = setStats.map(x =>
    `<tr><td><a href="${x.file}">${escHtml(x.set)}</a></td><td class="c">${x.n}</td><td class="c">${x.suspect}</td><td class="c">${x.cross}</td><td class="c">${x.crash}</td></tr>`).join('\n');
  const tot = setStats.reduce((a, x) => ({ n: a.n + x.n, s: a.s + x.suspect, c: a.c + x.cross, cr: a.cr + x.crash }), { n: 0, s: 0, c: 0, cr: 0 });
  const idx = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>挙動トレース監査 索引</title><style>${css}</style></head><body>`
    + `<header><h1>挙動トレース監査（Behavior Audit）索引</h1><span class="counts">${setStats.length} セット／効果 ${tot.n}／要review ${tot.s}／側跨ぎ ${tot.c}／crash ${tot.cr}</span></header>`
    + `<div class="wrap"><table><thead><tr><th>セット</th><th>効果</th><th>要review</th><th>側跨ぎ</th><th>crash</th></tr></thead><tbody>${idxRows}</tbody></table></div></body></html>`;
  fs.writeFileSync(join(outDir, 'index.html'), idx, 'utf8');
  console.log(`HTML生成: ${HTML_OUT}/ に ${setStats.length} セット + index.html（効果 ${tot.n}／要review ${tot.s}／側跨ぎ ${tot.c}／crash ${tot.cr}）`);
} else if (QUEUE) {
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
