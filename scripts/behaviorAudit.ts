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
import { setAbilityBlockScoping, abilityBlockTextOf } from '../src/data/effectParser';
import { matchesFilter } from '../src/engine/execUtils';
import type { TargetFilter } from '../src/types/effects';
import {
  executeEffect,
  resumeSelectTarget, resumeSearch, resumeChoose,
  resumeLookAndReorder, resumeRevealCards, resumeSelectZone, resumeSelectVirusZone,
  resumeSelectSigniZone, resumeRearrangeSigni,
  type ExecCtx, type ExecResult,
} from '../src/engine/effectExecutor';

const root = process.cwd();
const args = process.argv.slice(2);
const argVal = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const ONLY_ID = argVal('--id');
// カンマ区切りで複数カードを一括トレースする（O-20 の変換前後を2プロセスで比較するため）。
// --ids-file は全カード走査用（コマンドライン長の上限を避ける。区切りはカンマか改行）
const ONLY_IDS = (argVal('--ids-file') ? fs.readFileSync(argVal('--ids-file')!, 'utf8') : argVal('--ids'))
  ?.split(/[,\r\n]+/).map(s => s.trim()).filter(Boolean);
const SET = argVal('--set');
const LIMIT = argVal('--limit') ? parseInt(argVal('--limit')!) : Infinity;
const QUEUE = args.includes('--queue');
// round6 意味照合（原文 × 実行結果）の入力を吐く。--ids と併用。
// 非CONTINUOUS 効果ごとに「初期盤面・受ける／断るの2通りの実行結果」を JSON で書き出す。
const JSON_OUT = argVal('--json-out');
// 🆕R6-0 ②（2026-09-16）＝盤面の変種。汎用盤面は失敗経路（場が満杯・手札0・デッキ切れ）を踏まないので、
//   再現率セットの見逃しの大半がそこだった（`round6/TYPE_LEDGER.md`）。
//   base＝汎用／full＝両者シグニ3体・エナ10／empty＝両者 手札0・デッキ1・トラッシュ0・エナ0（効果元自身は残す）。
type Variant = 'base' | 'full' | 'empty' | 'nofield';
const VARIANTS = ((argVal('--variants') ?? 'base,full,empty,nofield').split(',').map(v => v.trim()).filter(Boolean)) as Variant[];
const VARIANT_LABEL: Record<Variant, string> = {
  base: '基本（汎用盤面）', full: '満杯（両者シグニ3体・エナ10）', empty: '枯渇（両者 手札0・デッキ1・トラッシュ0・エナ0）',
  nofield: '場が空（両者のシグニ0体・効果元自身は残す）',
};
// CHOOSE の既定は「断る」寄り（skip/しない を優先）。accept では利用可能な非 skip 肢を選ぶ。
let CHOICE_MODE: 'decline' | 'accept' = 'decline';
// §6.4 O-20 の変換前後を比較するための計器フラグ。付けると engine が
// 「その効果を生んだ能力ブロック」ではなく**カード全文**を読む旧挙動に戻る。
// 同じ --id を付/無しで2回流して差分を取ると、変換で挙動が変わった効果だけが出る。
if (args.includes('--o20-fulltext')) setAbilityBlockScoping(false);
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
  'powerLteLastProcessed', 'powerLtLastProcessed', 'levelLteLastProcessed', 'levelLtLastProcessed', 'levelEqLastProcessed', 'levelLteDiscardSigni',
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
  !!(f && (f.cardType || f.cardClass || f.story || f.color || f.keyword || f.cardName
    || f.level !== undefined || f.levelRange));
function collectTargetsSources(eff: CardEffect): { targets: Tgt[]; sources: Src[]; zoneNeeds: ZoneNeed[]; fieldNeeds: Tgt[]; underNeeds: UnderNeed[]; energyNeeds: { owner: string; count: number }[] } {
  const targets: Tgt[] = []; const sources: Src[] = []; const zoneNeeds: ZoneNeed[] = []; const fieldNeeds: Tgt[] = []; const underNeeds: UnderNeed[] = [];
  const energyNeeds: { owner: string; count: number }[] = [];
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
    // 「エナゾーンのカードがN枚になるように」系＝owner のエナを N+1 枚に増量（EQUALIZE_ENERGY）
    if (r.type === 'EQUALIZE_ENERGY' && typeof r.targetCount === 'number') {
      const eo = String(r.owner ?? '');
      for (const o2 of eo ? [eo] : ['self', 'opponent']) energyNeeds.push({ owner: o2, count: (r.targetCount as number) + 1 });
    }
    // 「トラッシュにあるクラスX N枚につき」系＝trashOwner のトラッシュに countFilter 合致カードを unitSize 枚仕込む
    if (r.type === 'POWER_MODIFY_PER_TRASH_COUNT') {
      const to = String(r.trashOwner ?? 'self');
      const unit = typeof r.unitSize === 'number' ? r.unitSize : 1;
      for (const o2 of to === 'both' ? ['self', 'opponent'] : [to])
        zoneNeeds.push({ owner: o2, zone: 'trash', filter: (r.countFilter as TargetFilter) ?? { cardType: 'シグニ' }, count: Math.min(unit, 6) });
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
  return { targets, sources, zoneNeeds, fieldNeeds, underNeeds, energyNeeds };
}

/** 効果対応のラベル付き盤面。対象フィルタに合う実シグニを対象側に配置し、source を要求ゾーンに置く。 */
function buildScenario(sourceNum: string, eff: CardEffect, variant: Variant = 'base'): { ctx: ExecCtx; labels: Map<string, string> } {
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
  const { targets, sources, zoneNeeds, fieldNeeds, underNeeds, energyNeeds } = collectTargetsSources(eff);
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
    // シグニ以外（ルリグ／アシストルリグ／スペル／アーツ）を効果元にするとき、シグニゾーンに置かない。
    // 置くとパワー「-」が NaN として「自分のシグニのパワー」の集計に混ざり、フィルターが外れる（round6 試行の偽陽性）。
    const srcType = cardMap.get(sourceNum)?.Type ?? '';
    const srcNonSigni = isSource && sourceZone === 'signi' && !srcType.includes('シグニ');
    if (isSource) {
      labels.set(sourceNum, `${side}S源`);
      if (srcNonSigni) { /* 下の field で置き場を決める */ }
      else if (sourceZone === 'signi') signi[0] = [sourceNum];
      else if (sourceZone === 'trash') trash.unshift(sourceNum);
      else hand.unshift(sourceNum);
    }
    return {
      deck, lrig_deck: [], hand, life_cloth: takeN(7, i => `${side}ライフ${i + 1}`),
      trash, lrig_trash: takeN(2, i => `${side}ルリグトラッシュ${i + 1}`),
      energy: COLORS.map(c => takeColor(`${side}エナ${c}`, c)), coins: 3, bonds: [],
      field: {
        lrig: srcNonSigni && srcType === 'ルリグ' ? [sourceNum] : lrigCard ? [lrigCard] : [], signi,
        signi_down: [false, false, false], signi_frozen: [false, false, false],
        signi_charms: [null, null, null], signi_acce: [null, null, null],
        signi_virus: [0, 0, 0], signi_armor: [false, false, false], cross_state: [false, false, false],
        assist_lrig_l: srcNonSigni && srcType === 'アシストルリグ' ? [sourceNum] : [], assist_lrig_r: [],
        // ⚠スペル／アーツ等の効果元は**どのゾーンにも置かない**＝実画面は `bs.pending_spell` に保持して解決後にトラッシュへ送る。
        //   旧実装は `check` に置いていたが、そこはライフバースト確認用の1枚スロットで、効果内のクラッシュが
        //   効果元を上書きして「(消滅)」に化けていた（R6-0・`WDK14-007-E1` ほか7効果）。
        check: null, key_piece: null, free_zone: [],
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
    const need = Math.min(Math.max(zn.count ?? 1, 1), 6);
    for (let i = 0; i < need; i++) {
      const cn = pickSigni(zn.filter, used, false, wantsNonSigni ? anyPool : signiPool);
      if (!cn) break;
      used.add(cn); labels.set(cn, `${side}${zlabel}対象${need > 1 ? i + 1 : ''}`);
      (st[zn.zone] as string[]).unshift(cn); // デッキは上(先頭)、他も先頭に置けば候補に入る
    }
  }

  // EQUALIZE_ENERGY 系: owner のエナを targetCount+1 枚に増量（「N枚になるように置く」を観測可能にする）
  for (const en of energyNeeds) {
    const st = en.owner === 'self' ? ownerState : otherState;
    const side = en.owner === 'self' ? '自' : '相';
    while (st.energy.length < en.count) st.energy.push(take(`${side}エナ増${st.energy.length + 1}`));
  }

  // ── 変種（効果対応の配置を済ませた後で盤面を削る／埋める）──
  for (const [side, st] of [['自', ownerState], ['相', otherState]] as const) {
    if (variant === 'full') {
      st.field.signi = st.field.signi.map((z, i) => (z && z.length ? z : [take(`${side}S満${i}`)]));
      while (st.energy.length < 10) st.energy.push(take(`${side}エナ満${st.energy.length + 1}`));
    } else if (variant === 'empty') {
      const keep = (arr: string[]) => arr.filter(n => n === sourceNum);
      st.hand = keep(st.hand);
      st.trash = keep(st.trash);
      st.energy = [];
      st.deck = st.deck.slice(0, 1);
    } else if (variant === 'nofield') {
      // 🆕R6-1（2026-09-16）＝「自分の〈X〉をトラッシュに置く。そうした場合」の**失敗経路**を踏ませる（`O-398` 型）。
      //   基本・満杯・枯渇は、効果が対象にするシグニを必ず場に置くので、できなかった場合の後続が一度も観測されなかった。
      st.field.signi = st.field.signi.map(z => (z && z.includes(sourceNum) ? z : null));
    }
  }

  const ctx = {
    ownerState, otherState, cardMap: cardMap as Map<string, CardData>,
    logs: [] as string[], sourceCardNum: sourceNum, triggeringCardNum: sourceNum, currentPhase: 'MAIN',
    // 実アプリ（BattleScreen）は AUTO 収集も pending 再開も effectId を ctx に載せる。
    // ここで落とすと resume 経路だけ「どの能力ブロックから来たか」を見失い、
    // §6.4 O-20 のブロック限定読みがカード全文へフォールバックする＝ハーネスだけ旧挙動になる。
    sourceEffectId: eff.effectId,
  } as unknown as ExecCtx;
  return { ctx, labels };
}

// ── ② 盤面スナップショット & 差分器 ──
type Snapshot = {
  loc: Map<string, string>;              // instanceId → 位置ラベル（"自hand" 等）
  dup: Map<string, string>;              // 🆕R6-1 I1＝2か所以上に居る instanceId → 「位置A / 位置B」
  power: Map<string, number>;            // instanceId → temp_power_mods 合計
  level: Map<string, number>;            // instanceId → temp_level_mods 合計（LEVEL_MODIFY）
  flags: Map<string, string>;            // instanceId → 状態フラグ（凍結/ダウン/ウィルス/血晶/クロス/チャーム/アクセ）
  kw: Map<string, string>;               // instanceId → 付与キーワード
  blocked: { 自: string; 相: string };   // player-level 行動制限（blocked_actions + blocked_card_names + 付与）
  coins: { 自: number; 相: number };
  // 上で個別に扱わない PlayerState キー（予約・置換・状態フラグ）＝キー → JSON
  misc: { 自: Map<string, string>; 相: Map<string, string> };
  decks: { 自: string[]; 相: string[] };
  // 🆕R6-0 ①＝(消滅) の行に「state のどのキーにまだ名前が残っているか」を添えるための生の state
  raw: { 自: unknown; 相: unknown };
};

// snapshot が個別に読むキー（これ以外は misc として丸ごと比較する）
const SNAP_HANDLED_KEYS = new Set([
  'deck', 'hand', 'life_cloth', 'trash', 'lrig_trash', 'energy', 'bonds', 'field', 'lrig_deck', 'coins',
  'temp_power_mods', 'power_mods_until_opp_turn', 'temp_level_mods', 'keyword_grants', 'keyword_grants_until_opp_turn',
  'blocked_actions', 'blocked_card_names', 'blocked_card_names_game', 'field_keyword_grants_active',
  'lrig_granted_auto_effects', 'granted_effects', 'lrig_abilities_disabled',
  // 位置として上で追跡する（misc にも出すと同じ移動が2行になる）
  'excluded', 'facedown_lrig_zone_cards', 'pending_crashed_cards',
]);

function snapshot(ctx: ExecCtx): Snapshot {
  const loc = new Map<string, string>();
  const power = new Map<string, number>();
  const level = new Map<string, number>();
  const flags = new Map<string, string>();
  const kw = new Map<string, string>();
  const blocked: Record<'自' | '相', string> = { 自: '', 相: '' };
  const misc = { 自: new Map<string, string>(), 相: new Map<string, string>() };
  const dup = new Map<string, string>();
  const put =(id: string | null | undefined, where: string) => {
    if (!id) return;
    const prev = loc.get(id);
    // 同じ置き場（スタックの上下・デッキ添字違い）は二重存在ではない
    const base = (w: string) => w.replace(/\[\d+\]/, '').replace(/\((上|下)\)$/, '');
    if (prev !== undefined && base(prev) !== base(where)) dup.set(id, `${dup.get(id) ?? prev} / ${where}`);
    loc.set(id, where);
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
    (s.field.check_rest ?? []).forEach(id => put(id, `${side}チェック`));
    put(s.field.key_piece, `${side}キー`);
    (s.field.key_piece_extra ?? []).forEach(id => put(id, `${side}キー`));
    (s.field.free_zone ?? []).forEach(id => put(id, `${side}フリー`));
    (s.field.beat_zone ?? []).forEach(id => put(id, `${side}ビート`));
    (s.field.signi_traps ?? []).forEach((id, z) => put(id, `${side}トラップ${z}`));
    (s.field.signi_soul ?? []).forEach((id, z) => put(id, `${side}ソウル${z}`));
    // ⚠`puppet_signi` は置き場ではなく「場に居るシグニが傀儡状態」という印（本体は `field.signi` に居る）＝位置として数えない（R6-1 I1 の偽陽性12件）。
    // 🆕R6-0 ①（2026-09-16）＝位置の死角をふさぐ。ここに無い置き場へ動いたカードは差分に「(消滅)」と出て、
    //   ハーネスの死角と実バグ（`O-524`）が区別できなかった（`round6/vanish_all_cards.txt` の108行）。
    (s.field.signi_charms ?? []).forEach((id, z) => put(id, `${side}チャーム${z}`));
    (s.field.signi_acce ?? []).forEach((ids, z) => (ids ?? []).forEach(id => put(id, `${side}アクセ${z}`)));
    (s.field.signi_facedown_attached ?? []).forEach((ids, z) => (ids ?? []).forEach(id => put(id, `${side}裏向き付け${z}`)));
    (s.field.signi_magic_boxes ?? []).forEach((id, z) => put(id, `${side}マジックボックス${z}`));
    (s.field.signi_seeds ?? []).forEach((id, z) => put(id, `${side}シード${z}`));
    (s.field.facedown_signi ?? []).forEach((id, z) => put(id, `${side}裏向きシグニ${z}`));
    (s.excluded ?? []).forEach(id => put(id, `${side}除外`));
    (s.lrig_deck ?? []).forEach(id => put(id, `${side}ルリグデッキ`));
    (s.facedown_lrig_zone_cards ?? []).forEach(id => put(id, `${side}ルリグゾーン裏向き`));
    // ライフクロスのクラッシュはバースト処理待ちの控え（`BattleScreen` が手札へ送る）＝ハーネスでは最終位置として扱う。
    (s.pending_crashed_cards ?? []).forEach(id => { if (!loc.has(id)) put(id, `${side}クラッシュ待ち`); });
    for (const m of (s.temp_power_mods ?? [])) power.set(m.cardNum, (power.get(m.cardNum) ?? 0) + m.delta);
    for (const m of (s.power_mods_until_opp_turn ?? [])) power.set(m.cardNum, (power.get(m.cardNum) ?? 0) + m.delta);
    for (const m of ((s as unknown as { temp_level_mods?: { cardNum: string; delta: number }[] }).temp_level_mods ?? [])) level.set(m.cardNum, (level.get(m.cardNum) ?? 0) + m.delta);
    for (const [id, kws] of Object.entries(s.keyword_grants ?? {})) if (kws.length) kw.set(id, [...kws].sort().join(','));
    for (const [id, kws] of Object.entries(s.keyword_grants_until_opp_turn ?? {})) if (kws.length) kw.set(id, [...(kw.get(id)?.split(',') ?? []), ...kws].sort().join(','));
    const sx = s as unknown as Record<string, unknown>;
    const lrigGrants = (sx.lrig_granted_auto_effects as unknown[] | undefined)?.length ?? 0;
    const signiGrants = (sx.granted_effects as unknown[] | undefined)?.length ?? 0;
    blocked[side] = [
      ...(s.blocked_actions ?? []), ...(s.blocked_card_names ?? []), ...(s.blocked_card_names_game ?? []),
      ...(s.field_keyword_grants_active ?? []).map(k => `全付与:${k}`),
      lrigGrants ? `ルリグ付与能力x${lrigGrants}` : '',
      signiGrants ? `シグニ付与能力x${signiGrants}` : '',
      sx.lrig_abilities_disabled ? 'ルリグ能力無効' : '',
    ].filter(Boolean).sort().join('|');
    for (const [k, v] of Object.entries(sx)) {
      // 履歴の記録係（ドロー枚数・直前の移動など）は効果の意味ではないので出さない
      if (SNAP_HANDLED_KEYS.has(k) || /^(last_|cards_drawn_)|_just$/.test(k) || v === undefined || v === null || v === false) continue;
      if (Array.isArray(v) && v.length === 0) continue;
      if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
      misc[side].set(k, JSON.stringify(v));
    }
  }
  return {
    loc, dup, power, level, flags, kw, blocked, misc,
    coins: { 自: ctx.ownerState.coins, 相: ctx.otherState.coins },
    decks: { 自: [...ctx.ownerState.deck], 相: [...ctx.otherState.deck] },
    raw: { 自: ctx.ownerState, 相: ctx.otherState },
  };
}

/** 位置ラベルの側（自/相）を判定して owner違いを強調するための小道具 */
const sideOf = (where: string) => where.startsWith('自') ? '自' : where.startsWith('相') ? '相' : '?';

/**
 * (消滅) の補足＝位置として追跡していない state のキーに id が残っていれば `［残存: 自.key］` を返す。
 * ⚠残っているのが**参照**（予約・記録）なのか**置き場**なのかはキー名で読む＝置き場なら snapshot へ足す。
 */
function ghostKeys(snap: Snapshot, id: string): string {
  const hits: string[] = [];
  for (const side of ['自', '相'] as const) {
    (function walk(o: unknown, path: string) {
      if (hits.length > 3) return;
      if (typeof o === 'string') { if (o === id) hits.push(`${side}.${path}`); return; }
      if (!o || typeof o !== 'object') return;
      for (const [k, v] of Object.entries(o)) walk(v, path ? (Array.isArray(o) ? path : `${path}.${k}`) : k);
    })(snap.raw[side], '');
  }
  return hits.length ? `［残存: ${[...new Set(hits)].join(', ')}］` : '';
}

function diffBoard(before: Snapshot, after: Snapshot, labels: Map<string, string>): string[] {
  const lines: string[] = [];
  const lbl = (id: string) => labels.get(id) ?? id;
  // 0) 二重存在（解決後に新しく2か所へ居るようになったカード）
  for (const [id, where] of after.dup) if (before.dup.get(id) !== where) lines.push(`  ⚠二重存在 ${lbl(id)}: ${where}`);
  // 1) カード移動
  const allIds = new Set([...before.loc.keys(), ...after.loc.keys()]);
  const moves: { id: string; from: string; to: string }[] = [];
  for (const id of allIds) {
    const from = before.loc.get(id) ?? '(不在)';
    const to = after.loc.get(id) ?? `(消滅)${ghostKeys(after, id)}`;
    // ゾーン内の並び替え（デッキ index 変化）はノイズなので基底ゾーン名で比較
    const base = (w: string) => w.replace(/\[\d+\]/, '').replace(/\((上|下)\)$/, '');
    if (base(from) !== base(to)) moves.push({ id, from, to });
  }
  // デッキに残ったカードの**相対順**の変化（上から抜けた分の添字ずれは変化と数えない）。
  // 1枚を一番上／一番下へ動かしただけならそう書き、それ以外は「並びが変わった」に畳む。
  for (const side of ['自', '相'] as const) {
    const bothIn = new Set(after.decks[side].filter(id => before.decks[side].includes(id)));
    const b = before.decks[side].filter(id => bothIn.has(id));
    const a = after.decks[side].filter(id => bothIn.has(id));
    if (b.join() === a.join()) continue;
    const moved = b.find(id => { const rest = b.filter(x => x !== id); return [id, ...rest].join() === a.join() || [...rest, id].join() === a.join(); });
    if (moved) lines.push(`  ${lbl(moved)}: ${side}デッキ[${before.decks[side].indexOf(moved)}] → ${side}デッキの一番${a[0] === moved ? '上' : '下'}`);
    else lines.push(`  ${side}デッキの並びが変わった（残り${a.length}枚）`);
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
  // 7) その他の状態キー（予約・置換・フラグ）。カード番号はラベルに読み替える。
  const relabel = (s: string) => s.replace(/"([A-Za-z0-9]+-[A-Za-z0-9-]+)"/g, (m, id) => labels.has(id) ? `"${labels.get(id)}"` : m);
  const clip = (s: string) => s.length > 240 ? s.slice(0, 240) + '…' : s;
  for (const side of ['自', '相'] as const) {
    const keys = new Set([...before.misc[side].keys(), ...after.misc[side].keys()]);
    for (const k of [...keys].sort()) {
      const b = before.misc[side].get(k), a = after.misc[side].get(k);
      if (b !== a) lines.push(`  ${side}状態 ${k}: ${b ? clip(relabel(b)) : 'なし'} → ${a ? clip(relabel(a)) : 'なし'}`);
    }
  }
  return lines;
}

// ── オートパイロット（smokeTest から流用）──
function autopilot(first: ExecResult, baseCtx: ExecCtx, choices: string[] = []): { status: string; detail?: string; result: ExecResult } {
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
          choices.push(`対象選択 候補${cands.length}件[${cands.map(choiceLabel).join(', ')}]から${cnt}件: ${cands.slice(0, cnt).map(choiceLabel).join(', ')}`);
          result = resumeSelectTarget(cands.slice(0, cnt), pending as never, ctx); break;
        }
        case 'SEARCH': {
          const vis = (p.visibleCards as string[]) ?? [];
          const cnt = Math.min((p.maxPick as number) ?? 0, vis.length);
          choices.push(`探索 見える${vis.length}枚[${vis.map(choiceLabel).join(', ')}]から${cnt}枚: ${vis.slice(0, cnt).map(choiceLabel).join(', ')}`);
          result = resumeSearch(vis.slice(0, cnt), pending as never, ctx); break;
        }
        case 'CHOOSE': {
          const opts = (p.options as { id: string; label?: string; available?: boolean }[]) ?? [];
          const isSkip = (o: { id: string; label?: string }) => /skip|スキップ|しない|代わりに/i.test(o.label ?? '') || o.id === 'skip';
          const skip = opts.find(isSkip);
          const pick = CHOICE_MODE === 'accept'
            ? (opts.find(o => o.available !== false && !isSkip(o)) ?? skip ?? opts[0])
            : (skip ?? opts.find(o => o.available !== false) ?? opts[0]);
          if (!pick) return { status: 'SKIP', detail: 'CHOOSE no options', result };
          choices.push(`選択肢[${opts.map(o => `${o.label ?? o.id}${o.available === false ? '(不可)' : ''}`).join(' / ')}] → 「${pick.label ?? pick.id}」`);
          result = resumeChoose(pick.id, pending as never, ctx); break;
        }
        case 'LOOK_AND_REORDER': {
          const cards = (p.cards as string[]) ?? [];
          result = resumeLookAndReorder(cards, [], pending as never, ctx); break;
        }
        case 'REVEAL_CARDS': result = resumeRevealCards(pending as never, ctx); break;
        case 'SELECT_ZONE': result = resumeSelectZone(zone, pending as never, ctx); break;
        case 'SELECT_SIGNI_ZONE': result = resumeSelectSigniZone(zone, pending as never, ctx); break;
        case 'SELECT_VIRUS_ZONE': result = resumeSelectVirusZone(sameN >= 3 ? null : zone, pending as never, ctx); break;
        case 'REARRANGE_SIGNI': {
          // engine の pending は候補を `signiNums` に積む（`signi`/`cards` だけを見ていたため swap が常に「行わなかった」になっていた）
          const arr = (p.signi as string[]) ?? (p.cards as string[]) ?? (p.signiNums as string[]) ?? [];
          choices.push(`シグニ配置（${(p.mode as string) ?? 'rearrange'}） 候補: ${arr.map(choiceLabel).join(', ')}`);
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
type Trace = { card: string; name: string; effectId: string; type: string; status: string; detail?: string; diff: string[]; logs: string[]; choices: string[]; board: string[] };

// autopilot の選択ログでカード番号をラベルに読み替えるための現在シナリオのラベル表
let choiceLabels = new Map<string, string>();
// 🆕R6-0 ③＝候補は**全部**ラベルつきで出す（先頭から取った分だけでは「候補に原文の条件を満たさないカードが混ざる」が読めない）。
//   盤面に置いていないカード（ラベル無し）はカード名で出す。
const choiceLabel = (id: string): string => choiceLabels.get(id) ?? `《${cardMap.get(id)?.CardName ?? id}》`;

// 初期盤面を「ラベル=カード名(属性)」でゾーンごとに1行へ（round6 監査員が条件成立や対象の妥当性を判定するため）
function describeBoard(ctx: ExecCtx, labels: Map<string, string>): string[] {
  const desc = (id: string) => {
    const c = cardMap.get(id);
    if (!c) return labels.get(id) ?? id;
    const r = c as unknown as Record<string, string>;
    const icons = [
      r.Guard === '1' && 'ガードアイコン', r.LifeBurst === '1' && 'ライフバースト有',
      /【ライズ】/.test(c.EffectText ?? '') && 'ライズアイコン', r.Story && r.Story !== '-' && `ストーリー:${r.Story}`,
    ].filter(Boolean);
    const attrs = [c.Type, c.Level ? `Lv${c.Level}` : '', c.Power ? `パワー${c.Power}` : '', c.Color, c.CardClass, ...icons].filter(Boolean).join(' ');
    return `${labels.get(id) ?? '?'}=《${c.CardName}》(${attrs})`;
  };
  const out: string[] = [];
  for (const [side, st] of [['自分', ctx.ownerState], ['相手', ctx.otherState]] as const) {
    const s = st as PlayerState;
    s.field.signi.forEach((stack, z) => {
      if (!stack?.length) { out.push(`${side}シグニゾーン${z}: 空`); return; }
      const fl = [s.field.signi_frozen?.[z] && '凍結', s.field.signi_down?.[z] ? 'ダウン' : 'アップ', s.field.signi_virus?.[z] && 'ウィルス', s.field.signi_charms?.[z] && 'チャーム有', s.field.signi_acce?.[z] && 'アクセ有'].filter(Boolean).join(',');
      out.push(`${side}シグニゾーン${z}: ${desc(stack.at(-1)!)} [${fl}]${stack.length > 1 ? ` 下: ${stack.slice(0, -1).map(desc).join(', ')}` : ''}`);
    });
    out.push(`${side}ルリグ: ${s.field.lrig.map(desc).join(', ') || '空'}`);
    out.push(`${side}手札(${s.hand.length}): ${s.hand.map(desc).join(', ')}`);
    out.push(`${side}デッキ(${s.deck.length}・上から): ${s.deck.slice(0, 5).map(desc).join(', ')}${s.deck.length > 5 ? ' …' : ''}`);
    out.push(`${side}トラッシュ(${s.trash.length}): ${s.trash.map(desc).join(', ')}`);
    out.push(`${side}エナ(${s.energy.length}): ${s.energy.map(desc).join(', ')}`);
    out.push(`${side}ライフクロス: ${s.life_cloth.length}枚／ルリグトラッシュ: ${s.lrig_trash.length}枚／コイン: ${s.coins}`);
  }
  return out;
}

function traceEffect(num: string, eff: CardEffect, variant: Variant = 'base'): Trace {
  const name = cardMap.get(num)?.CardName ?? '';
  const type = (eff.effectType as string) ?? '?';
  const { ctx, labels } = buildScenario(num, eff, variant);
  choiceLabels = labels;
  const board = describeBoard(ctx, labels);
  const before = snapshot(ctx);
  if (!before.loc.has(num)) {
    const c = cardMap.get(num);
    board.unshift(`効果元: 自S源=《${c?.CardName ?? num}》(${c?.Type ?? '?'})＝使用中（どのゾーンにも置いていない）`);
  }
  const choices: string[] = [];
  const out: { status: string; detail?: string; diff: string[]; logs: string[] } = { status: 'OK', diff: [], logs: [] };
  try {
    const first = executeEffect(eff, ctx);
    const ap = autopilot(first, ctx, choices);
    out.status = ap.status;
    out.detail = ap.detail;
    const afterCtx = { ...ctx, ownerState: ap.result.ownerState, otherState: ap.result.otherState } as ExecCtx;
    const after = snapshot(afterCtx);
    out.diff = diffBoard(before, after, labels);
    out.logs = ap.result.logs.slice();
    // 敗北は engine が「ライフクロスを0にする」で表す（`STUB{DEFEAT}`）＝消えたライフを1行に畳む。
    //   畳まないと不変条件「カードが消えない」（R6-1 I1）が敗北のたびに鳴る。
    if (out.logs.some(l => /敗北（ライフクロス0）/.test(l))) {
      const lifeGone = out.diff.filter(l => /ライフ\d*: .+ライフ → \(消滅\)$/.test(l.trim()));
      if (lifeGone.length) out.diff = [...out.diff.filter(l => !lifeGone.includes(l)), `  ライフクロス${lifeGone.length}枚を除去（敗北の表現）`];
    }
  } catch (e) {
    out.status = 'CRASH'; out.logs = [(e as Error).message];
  }
  return { card: num, name, effectId: (eff.effectId as string) ?? '?', type, status: out.status, detail: out.detail, diff: out.diff, logs: out.logs, choices, board };
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
  console.log(`実行  : ${t.status}${t.detail ? `（${t.detail}）` : ''}`);
  console.log(`差分  :${t.diff.length ? '\n' + t.diff.join('\n') : ' (盤面変化なし)'}`);
  console.log(`ログ  :${t.logs.length ? '\n  ' + t.logs.join('\n  ') : ' (なし)'}`);
}

// 低情報ログ判定（要レビュー・キュー用）: STUB no-op マーカーや空だけなら「意味なし」
const lowInfoLog = (logs: string[]) => logs.every(l => /^\[STUB:|未実装|no-op|^\s*$/.test(l)) || logs.length === 0;

const isSuspect = (t: Trace) => t.type !== 'CONTINUOUS' && t.status === 'OK' && t.diff.length === 0 && lowInfoLog(t.logs);
const isCross = (t: Trace) => t.diff.some(l => l.includes('側跨ぎ'));
const escHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

if (JSON_OUT) {
  // round6 意味照合の入力。CONTINUOUS は executeEffect で観測できないので除く。
  const cards: unknown[] = [];
  for (const num of ONLY_IDS ?? (ONLY_ID ? [ONLY_ID] : [])) {
    const card = cardMap.get(num);
    const effs = (effectsMap.get(num) ?? []).filter(e => e.effectType !== 'CONTINUOUS');
    const view = (t: Trace) => ({ status: t.status, detail: t.detail, choices: t.choices, diff: t.diff.map(l => l.trim()), logs: t.logs });
    const runVariant = (eff: CardEffect, v: Variant) => {
      CHOICE_MODE = 'decline';
      const d = traceEffect(num, eff, v);
      CHOICE_MODE = 'accept';
      const a = traceEffect(num, eff, v);
      const same = JSON.stringify(view(d)) === JSON.stringify(view(a));
      return { board: d.board, runs: same ? { both: view(d) } : { decline: view(d), accept: view(a) } };
    };
    const traces = effs.map(eff => {
      const base = runVariant(eff, 'base');
      // 変種は**実行結果が基本と違うときだけ**載せる（同じなら監査員に読ませる情報が無い）。
      //   ⚠盤面が違うので choices/diff のラベル表記は揃う（同じラベル体系）＝runs の JSON 比較で足りる。
      const variants: Record<string, unknown> = {};
      for (const v of VARIANTS) {
        if (v === 'base') continue;
        const r = runVariant(eff, v);
        if (JSON.stringify(r.runs) !== JSON.stringify(base.runs)) variants[v] = { label: VARIANT_LABEL[v], ...r };
      }
      return {
        effectId: eff.effectId, effectType: eff.effectType,
        abilityText: abilityBlockTextOf(card, eff.effectId as string).trim(),
        board: base.board,
        runs: base.runs,
        ...(Object.keys(variants).length ? { variants } : {}),
      };
    });
    cards.push({ cardNum: num, traces });
  }
  fs.mkdirSync(join(JSON_OUT, '..'), { recursive: true });
  fs.writeFileSync(JSON_OUT, JSON.stringify(cards, null, 1), 'utf8');
  console.log(`JSON出力: ${cards.length}枚 → ${JSON_OUT}`);
} else if (HTML) {
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
  if (ONLY_IDS) targets = ONLY_IDS;
  else if (ONLY_ID) targets = [ONLY_ID];
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
