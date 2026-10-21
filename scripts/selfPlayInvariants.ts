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
 *   - 🆕`TURNLEAK`＝ターン限定の値がターンを越えて残る／`LIMIT`＝リミット超過が残る／`RESUME`（`--resume-every`）＝盤面データから作り直した試合と食い違う／`MIRROR`（`--mirror`）＝席を入れ替えた試合と食い違う
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
import { setRng } from '../src/engine/rng';
import { createRuleCheckMemo, type RuleCheckMemo } from '../src/screens/battle/controller/ruleChecks';
import { CPU_PLAYER_ID } from '../src/screens/battle/battleUtils';
import { resolveCpuPolicy, patchCpuPolicy } from '../src/screens/battle/cpuPolicy';
import { collectHandLimits } from '../src/engine/effectEngine';
import { TURN_SCOPED_STATE_FIELDS, clearEndingPlayerTurnState } from '../src/screens/battle/turnScopedState';
/** ターンを終える側だけが消す「このターン」のキー（共有関数から取り出す）。 */
const ENDING_KEYS = Object.keys(clearEndingPlayerTurnState({} as PlayerState));
import { planLimitExcess } from '../src/screens/battle/limitExcess';
import { powerZeroBanishCandidates } from '../src/screens/battle/controller/resolveSigniBattle';
import { buildBaseEffectsMap, buildBattleMaterials } from '../src/screens/battle/controller/battleMaterials';
import { createHeadlessMatch, mirrorSeats } from '../src/screens/battle/controller/headlessMatch';
import { buildHeadlessRow } from '../src/screens/battle/controller/headlessSetup';
import { resolveSelfPlayDeck, listPlayableDeckNames, type SelfPlayDeck } from './selfPlayDecks';
import { cardCsvRelPaths } from './cardDataFiles.mjs';
import { cardsForMatch } from '../src/screens/battle/matchCards';

const argv = process.argv.slice(2);
const arg = (n: string, d: string) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const SEEDS = arg('--seeds', '1').split(',').map(Number);
/**
 * 🆕CPU のポリシー（両席・既定＝`default`）。🔑**検査の幅を広げる口**＝`legacy-greedy`（先読みなし・使えるものは使う）は
 *   既定の CPU が「得にならない」と判断して撃たない【起】・アーツも踏む＝**強さを変えずに被覆だけ広げる**。
 */
const POLICY = arg('--policy', 'default');
/** 🆕`--policy-set "key=値,…"`＝ポリシーの値を差し替える（`patchCpuPolicy`＝`selfplay:scan` と同じ書式）。例＝`spellGainMin=-1000000`（解決できるスペルをほぼ全部使う）。 */
const POLICY_SET = arg('--policy-set', '');
const policyOf = () => POLICY_SET ? patchCpuPolicy(resolveCpuPolicy(POLICY), POLICY_SET) : resolveCpuPolicy(POLICY);
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
/**
 * 🆕`--resume-every N`＝**N 手ごとに「その時点の盤面データだけから作り直した試合」を1手進め、元の試合の1手と突き合わせる**（`RESUME`）。
 * 🔑**拾う形**＝盤面データ（DB の行）の外に置いた状態に頼る処理＝実機では**再読み込み・対人戦の相手側で結果が割れる**。
 *   乱数の位置と二重処理防止の指紋（`RuleCheckMemo`）は複製して渡す＝それ以外の隠れた状態（モジュール変数・クロージャ）だけが差になる。
 *   `--resume-fresh-memo` で指紋も空にする（＝再読み込みそのもの。⚠指紋は設計上 DB に無いので、差は候補として読む）。
 */
const RESUME_EVERY = Number(arg('--resume-every', '0'));
const RESUME_FRESH_MEMO = argv.includes('--resume-fresh-memo');
/**
 * 🆕`--mirror`＝**同じ開始盤面を席だけ入れ替えて（`mirrorSeats`）もう1戦回し、ターンが変わるたびの盤面を突き合わせる**（`MIRROR`）。
 * 🔑**拾う形**＝ホスト席とゲスト席で処理が割れる（`isHost`・`host_state` 決め打ち・`userId` の取り違え）。
 *   エンジンの効果処理は「自分／相手」の相対なので、席の差が出るのは進行役（controller）の層だけ。
 * ⚠**ヘッドレスの進行役そのものが非対称**（ルール処理は host 席＝実機の人間のクライアント視点）＝差は候補として読む。
 */
const MIRROR = argv.includes('--mirror');
/**
 * 🆕`--answer-fuzz P`＝**CPU の対話の答えを確率 P で乱数の（合法な）答えに差し替える**（`HeadlessMatchDeps.reviseAnswer`）。
 * 🔑CPU はいつも「得な答え」を選ぶ＝断る・変わった対象・少なく選ぶ分岐を踏まない。差し替えるのは3形だけ＝
 *   `CHOOSE`（単一選択・宣言なし）＝押せる肢のうち支払いの無い肢から／`SELECT_TARGET`＝候補から（任意なら0〜count体）／
 *   `SEARCH`（制約なし）＝見えている札から（任意なら0〜maxPick枚）。⚠支払いのある肢・合計制約つきは CPU の答えのまま。
 * ⚠乱数は試合の乱数とは別の列（seed 由来）＝試合の乱数位置は変えるが再現はできる。
 */
const ANSWER_FUZZ = Number(arg('--answer-fuzz', '0'));
/**
 * 🆕`--start <変種,…>`＝**開始盤面を極端にする**（カードは置き場を移すだけ＝保存則の検査はそのまま効く）。
 *   `lowdeck`＝両者のデッキを8枚まで減らしてトラッシュへ（リフレッシュ・デッキ切れを早く踏む）／
 *   `bigena`＝デッキの上から8枚ずつエナへ（重いアーツ・【起】を最初から撃てる）／`lowlife`＝ライフを2枚まで減らしてトラッシュへ（終盤の処理）。
 */
const START = arg('--start', '').split(',').filter(Boolean);
/** 🆕`--logs-out <dir>`＝1戦ごとの対戦ログ（テキスト）を書く（ログの文言を実測する用）。 */
const LOGS_OUT = arg('--logs-out', '');
/**
 * 🆕`--use-all-arts`＝両席の作戦データで**ルリグデッキのアーツを全部「攻めと守り」に指名する**（検査専用）。
 * 🔑CPU が自分のターンに使うアーツは「除去（正面が塞がれているとき）」と作戦データの指名だけ＝ドロー・手札破壊・強化などの
 *   アーツは**どの検査でも一度も実行されていなかった**（被覆のアーツ 484 / 706）。強さは変えずに被覆だけ広げる口。
 */
const USE_ALL_ARTS = argv.includes('--use-all-arts');
function withAllArts(d: SelfPlayDeck, cardMap: Map<string, CardData>): SelfPlayDeck {
  if (!USE_ALL_ARTS) return d;
  const arts = [...new Set(d.lrigDeck.map(n => String(n).split('#')[0]))].filter(n => ['アーツ', 'アシストルリグ', 'ルリグ'].includes(cardMap.get(n)?.Type ?? ''));
  return { ...d, plan: { ...d.plan, cardUse: { ...(d.plan?.cardUse ?? {}), ...Object.fromEntries(arts.map(n => [n, 'both' as const])) } } };
}
function applyStart(row: BattleStateRow): BattleStateRow {
  if (START.length === 0) return row;
  const tweak = (st: PlayerState): PlayerState => {
    let s = { ...st };
    if (START.includes('bigena')) s = { ...s, energy: [...s.energy, ...s.deck.slice(0, 8)], deck: s.deck.slice(8) };
    if (START.includes('lowdeck')) s = { ...s, trash: [...s.trash, ...s.deck.slice(8)], deck: s.deck.slice(0, 8) };
    if (START.includes('lowlife')) s = { ...s, trash: [...s.trash, ...s.life_cloth.slice(2)], life_cloth: s.life_cloth.slice(0, 2) };
    return s;
  };
  return { ...row, host_state: tweak(row.host_state), guest_state: tweak(row.guest_state) };
}
function makeAnswerFuzz(seed: number) {
  let a = (seed * 7919 + 17) | 0;
  const r = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shuffle = <T,>(xs: T[]) => { const o = [...xs]; for (let i = o.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]]; } return o; };
  const counts: Record<string, number> = {};
  const revise = (pe: any, res: any) => {
    if (ANSWER_FUZZ <= 0 || res.kind !== 'effect' || r() >= ANSWER_FUZZ) return res;
    const it = pe.interaction;
    let sel: string[] | null = null;
    if (it.type === 'CHOOSE' && !it.multiSelect && !it.namePool) {
      const opts = it.options.filter((o: any) => o.available && !(o.costColors?.length));
      if (opts.length > 1) sel = [opts[Math.floor(r() * opts.length)].id];
    } else if (it.type === 'CHOOSE' && it.multiSelect && !it.namePool) {
      // 複数選択＝支払いの無い押せる肢から（「まで」なら0〜count 個・重複可なら重複も）
      const opts = it.options.filter((o: any) => o.available && !(o.costColors?.length));
      if (opts.length > 0) {
        const n = it.upTo ? Math.floor(r() * (it.count + 1)) : it.count;
        sel = it.allowRepeat ? Array.from({ length: n }, () => opts[Math.floor(r() * opts.length)].id) : shuffle(opts).slice(0, Math.min(n, opts.length)).map((o: any) => o.id);
      }
    } else if (it.type === 'LOOK_AND_REORDER') {
      sel = shuffle(it.cards);
    } else if (it.type === 'SELECT_TARGET' && it.totalPowerMax === undefined && it.totalLevelMax === undefined && !it.selectionConstraint) {
      const cand = it.candidates.filter((n: string) => !(it.unplaceableCards ?? []).includes(n));
      const cnt = typeof it.count === 'number' ? it.count : 1;
      const n = it.optional ? Math.floor(r() * (Math.min(cnt, cand.length) + 1)) : Math.min(cnt, cand.length);
      if (cand.length > 0) sel = shuffle(cand).slice(0, n);
    } else if (it.type === 'SEARCH' && !it.selectionConstraint) {
      const vis = it.visibleCards.filter((n: string) => !(it.unplaceableCards ?? []).includes(n));
      const max = Math.min(it.maxPick ?? 0, vis.length);
      const n = it.optional ? Math.floor(r() * (max + 1)) : max;
      sel = shuffle(vis).slice(0, n);
    }
    if (!sel) return res;
    counts[it.type] = (counts[it.type] ?? 0) + 1;
    return { ...res, selected: sel };
  };
  return { revise, counts };
}
/** 乱数（mulberry32）の状態を外から読み書きできる形＝分岐させた試合に同じ乱数位置を渡すため。 */
const rngState = { a: 0 };
const rngNext = () => {
  rngState.a = (rngState.a + 0x6D2B79F5) | 0;
  let t = Math.imul(rngState.a ^ (rngState.a >>> 15), 1 | rngState.a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const cloneMemo = (m: RuleCheckMemo): RuleCheckMemo => ({
  lastBanishedKeyRef: { current: m.lastBanishedKeyRef.current }, lastContMutationKeyRef: { current: m.lastContMutationKeyRef.current },
  lastRefreshTurnEndKeyRef: { current: m.lastRefreshTurnEndKeyRef.current }, lastDeferredRefreshKeyRef: { current: m.lastDeferredRefreshKeyRef.current },
  lastLimitExcessKeyRef: { current: m.lastLimitExcessKeyRef.current },
  restrictionMatchedRef: { current: Object.fromEntries(Object.entries(m.restrictionMatchedRef.current).map(([k, v]) => [k, new Map(v)])) },
});
/** 識別子の揺れ（`crypto.randomUUID`・`Date.now()` を埋めた effectId）を潰して比べる。 */
const normIds = (s: string) => s.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '<uuid>').replace(/\d{13}/g, '<now>');
/** 2つの行の差のあるキーを列挙（`host_state.x` 粒度）。 */
function rowDiffKeys(a: any, b: any): string[] {
  const out: string[] = [];
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (/_state$/.test(k) && a[k] && b[k]) {
      for (const k2 of new Set([...Object.keys(a[k]), ...Object.keys(b[k])]))
        if (normIds(JSON.stringify(a[k][k2]) ?? '') !== normIds(JSON.stringify(b[k][k2]) ?? '')) out.push(`${k}.${k2}`);
    } else if (normIds(JSON.stringify(a[k]) ?? '') !== normIds(JSON.stringify(b[k]) ?? '')) out.push(k);
  }
  return out;
}

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
    // ⚠裏返し・コピー（`card_identity_overrides`＝個体を別のカードとして扱う）を当てて種別を見る（REV＝スペルの個体が裏面のシグニになる）
    const ov = { ...(r.host_state.card_identity_overrides ?? {}), ...(r.guest_state.card_identity_overrides ?? {}) } as Record<string, string>;
    const ty = (id: string) => cardMap.get(numOf(ov[id] ?? id))?.Type ?? '?';
    for (const [z, arr] of [['手札', s.hand], ['デッキ', s.deck], ['エナ', s.energy], ['ライフ', s.life_cloth], ['トラッシュ', s.trash]] as [string, string[]][])
      for (const id of arr) if (LRIG_TYPES.has(ty(id)) && ty(id) !== 'レゾナ' && ty(id) !== 'クラフト') out.push(`${side}${z}にルリグデッキ系 ${id}(${ty(id)})`);
    for (const id of s.lrig_trash) if (['シグニ', 'スペル'].includes(ty(id))) out.push(`${side}ルリグトラッシュにメイン系 ${id}(${ty(id)})`);
    s.field.signi.forEach((st, z) => { const top = st?.at(-1); if (top && !/^(シグニ|レゾナ)/.test(ty(top))) out.push(`${side}シグニ${z}の上が ${top}(${ty(top)})`); });
    const lt = s.field.lrig.at(-1); if (lt && !['ルリグ'].includes(ty(lt))) out.push(`${side}ルリグゾーンの上が ${lt}(${ty(lt)})`);
    // 🆕付いている札が浮いている＝シグニのいないゾーンに【チャーム】【アクセ】【ソウル】が残る（場を離れる処理が後始末をしていない）
    for (let z = 0; z < 3; z++) {
      if (s.field.signi[z]?.length) continue;
      if (s.field.signi_charms?.[z]) out.push(`${side}ゾーン${z}にシグニがいないのに【チャーム】 ${s.field.signi_charms[z]}`);
      const ac = s.field.signi_acce?.[z]; if (Array.isArray(ac) ? ac.length : ac) out.push(`${side}ゾーン${z}にシグニがいないのに【アクセ】 ${ac}`);
      if (s.field.signi_soul?.[z]) out.push(`${side}ゾーン${z}にシグニがいないのに【ソウル】 ${s.field.signi_soul[z]}`);
    }
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

async function play(a0: SelfPlayDeck, b0: SelfPlayDeck, seed: number) {
  const a = withAllArts(a0, allCardMap), b = withAllArts(b0, allCardMap);
  const used = new Set([...a.mainDeck, ...a.lrigDeck, ...b.mainDeck, ...b.lrigDeck].map(n => String(n).split('#')[0]));
  const cards = cardsForMatch(allCards, used);
  const cardMap = new Map(cards.map(c => [c.CardNum, c]));
  rngState.a = seed | 0; setRng(rngNext);
  const setup = buildHeadlessRow({ seats: { host: a, guest: b }, hostId: HOST_ID, firstPlayerId: seed % 2 ? HOST_ID : CPU_PLAYER_ID, cardMap, policy: { host: policyOf(), guest: policyOf() } });
  const pol = policyOf();
  const rngAfterSetup = rngState.a;
  /** ターンが変わった時点の盤面（席の鏡を比べる用）。 */
  const turnSnaps: { turn: number; row: BattleStateRow; logs: string[] }[] = [];
  const memo = createRuleCheckMemo();
  const deps = { cards, cpuPlans: { host: a.plan, guest: b.plan }, policy: { host: pol, guest: pol } };
  const fuzz = makeAnswerFuzz(seed);
  setup.row = applyStart(setup.row);
  const m = createHeadlessMatch(setup.row, { ...deps, initialLogs: setup.logs, memo, ...(ANSWER_FUZZ > 0 ? { reviseAnswer: fuzz.revise } : {}) });
  const tag = `${a.name} vs ${b.name} s${seed}`;
  const initial = new Set(locate(m.row()).loc.keys());
  const missingSince = new Map<string, number>();
  const reported = new Set<string>();
  const once = (key: string, f: any) => { if (reported.has(key)) return; reported.add(key); emit({ game: tag, ...f }); };
  let step = 0; let reason = 'cap';
  let lastLog = 0;
  // 🆕ルール処理の取りこぼし（HANDLIMIT／POWERZERO）を見るための静的な効果表（`createHeadlessMatch` と同じ組み方）。
  const uniqCards = [...new Map(cards.map(c => [c.CardNum, c] as const)).values()];
  const effectsMap = buildBaseEffectsMap(uniqCards);
  let pzSince = -1;
  let limSince = -1;
  /** REPEAT＝このターンにスタックへ載った効果（スタック項目の id で数える）。 */
  let repTurn = -1; const repSeen = new Set<string>(); const repCount = new Map<string, number>();
  // ⚠個体 ID（`WX01-001#3`）でも引けるカード表（実機の `InstanceMap` と同じ扱い）＝素の表だとパワーが読めず 0 と誤判定する
  class InstMap extends Map<string, CardData> { get(k: string) { return super.get(k) ?? super.get(numOf(k)); } has(k: string) { return super.has(k) || super.has(numOf(k)); } }
  const instMap = new InstMap(cardMap);
  const covEffects = new Set<string>(), covField = new Set<string>();
  let sameN = 0;
  /** 2手前の盤面（ログ行の遅れを吸収する）。 */
  let prev2Row: BattleStateRow | null = null;
  const ctxLogs = () => m.logs.slice(Math.max(0, m.logs.length - 6));
  for (; step < MAX_STEPS; step++) {
    let k;
    const prevRow = m.row();
    const prevJson = JSON.stringify(prevRow);
    const logLenBefore = m.logs.length;
    // 🆕RESUME＝同じ盤面データ・同じ乱数位置から作り直した試合を先に1手進めておく（元の試合の1手と比べる）
    let fork: { row: BattleStateRow; logs: string[]; kind: string } | null = null;
    if (RESUME_EVERY > 0 && step % RESUME_EVERY === 0 && !prevRow.winner_id) {
      const rng0 = rngState.a;
      try {
        const f = createHeadlessMatch(JSON.parse(prevJson), { ...deps, memo: RESUME_FRESH_MEMO ? createRuleCheckMemo() : cloneMemo(memo) });
        const fk = await f.step();
        fork = { row: f.row(), logs: f.logs.slice(), kind: fk };
      } catch (e: any) { fork = { row: prevRow, logs: [`CRASH ${String(e?.message ?? e)}`], kind: 'crash' }; }
      rngState.a = rng0;
    }
    try { k = await m.step(); } catch (e: any) {
      once('CRASH', { kind: 'CRASH', step, turn: m.row().turn_count, detail: String(e?.stack ?? e).split('\n').slice(0, 6).join(' | '), logs: ctxLogs() });
      reason = 'crash'; break;
    }
    if (fork) {
      const keys = rowDiffKeys(m.row(), fork.row);
      const newLogs = m.logs.slice(logLenBefore);
      const logDiff = normIds(newLogs.join(String.fromCharCode(10))) !== normIds(fork.logs.join(String.fromCharCode(10)));
      if (keys.length > 0 || logDiff || fork.kind !== k) once(`RESUME:${keys.join(',')}:${k}`, { kind: 'RESUME', step, turn: prevRow.turn_count, detail: `作り直した試合と食い違い（元=${k}／作り直し=${fork.kind}）差=${keys.join(',') || '(盤面同じ)'}${logDiff ? ` ログ差 元[${newLogs.slice(-2).join(' / ')}] 作り直し[${fork.logs.slice(-2).join(' / ')}]` : ''}`, logs: m.logs.slice(-8) });
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
    if (MIRROR && r.turn_count !== prevRow.turn_count) turnSnaps.push({ turn: r.turn_count, row: r, logs: m.logs.slice(-8) });
    // 🆕LRIGJUMP＝センタールリグが重なった（枚数が増えた）のに、レベルが2以上跳ねた（グロウはレベル+1まで）
    //   ⚠候補出し＝「【グロウ】を無視して上に置く」効果は跳ねうる（ログで判定する）
    for (const [side, a0, a1] of [['H', prevRow.host_state, r.host_state], ['G', prevRow.guest_state, r.guest_state]] as [string, PlayerState, PlayerState][]) {
      if (a1.field.lrig.length <= a0.field.lrig.length) continue;
      const lv = (id?: string) => parseInt(cardMap.get(numOf(id ?? ''))?.Level ?? '', 10);
      const before = lv(a0.field.lrig.at(-1)), after = lv(a1.field.lrig.at(-1));
      if (Number.isFinite(before) && Number.isFinite(after) && after > before + 1) once(`LRIGJUMP:${numOf(a1.field.lrig.at(-1)!)}`, { kind: 'LRIGJUMP', step, turn: r.turn_count, detail: `${side} センタールリグ Lv${before}→Lv${after}（${a1.field.lrig.at(-1)}）`, logs: m.logs.slice(-8) });
    }
    // 🆕REPEAT＝同じ効果（effectId）が1ターンに12回以上スタックに載る（自分自身を使い続ける等の暴走）
    if (r.turn_count !== repTurn) { repTurn = r.turn_count; repSeen.clear(); repCount.clear(); }
    for (const e of [...(r.effect_stack?.pendingTurn ?? []), ...(r.effect_stack?.pendingOpp ?? []), ...(r.effect_stack?.queue ?? [])]) {
      if (!e.effectId || repSeen.has(e.id)) continue;
      repSeen.add(e.id);
      const n = (repCount.get(e.effectId) ?? 0) + 1; repCount.set(e.effectId, n);
      if (n >= 12) once(`REPEAT:${e.effectId}`, { kind: 'REPEAT', step, turn: r.turn_count, detail: `${e.effectId} が1ターンに${n}回スタックに載った`, logs: m.logs.slice(-8) });
    }
    // 🆕DRAWLOG／CHARGELOG／BANISHLOG＝**ログに書いたことが盤面で起きたか**（同じ手のログに置換「代わりに」があれば数えない）
    {
      const stepLogs = m.logs.slice(logLenBefore);
      const toAscii = (x: string) => x.replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
      if (!stepLogs.some(l => /代わりに|置換/.test(l))) {
        const sides = [[prevRow.host_state, r.host_state], [prevRow.guest_state, r.guest_state]] as [PlayerState, PlayerState][];
        const moved = (from: (s: PlayerState) => string[], to: (s: PlayerState) => string[]) =>
          sides.reduce((n, [a0, a1]) => { const f = new Set(from(a0)); return n + to(a1).filter(id => f.has(id) && !to(a0).includes(id)).length; }, 0);
        const deckMin = Math.min(prevRow.host_state.deck.length, prevRow.guest_state.deck.length);
        const drawN = stepLogs.reduce((n, l) => n + Number(toAscii(l).match(/^(?:\[CPU\] )?(\d+)枚ドロー$/)?.[1] ?? 0), 0);
        // ⚠同じ手で手札からデッキへ戻したカードを引く形（「デッキの一番上へ」→「1枚ドロー」）は前の盤面のデッキに無い＝数えない
        if (drawN > 0 && drawN <= deckMin && !stepLogs.some(l => /デッキの一番上へ|デッキに戻/.test(l))) {
          const got = moved(st => st.deck, st => st.hand);
          if (got < drawN) once(`DRAWLOG:${stepLogs.find(l => /ドロー$/.test(l))}`, { kind: 'DRAWLOG', step, turn: r.turn_count, detail: `ログはドロー${drawN}枚・デッキ→手札は${got}枚`, logs: m.logs.slice(-8) });
        }
        const chargeN = stepLogs.reduce((n, l) => n + Number(toAscii(l).match(/^エナチャージ(\d+)$/)?.[1] ?? 0), 0);
        if (chargeN > 0 && chargeN <= deckMin) {
          const got = moved(st => st.deck, st => st.energy);
          if (got < chargeN) once(`CHARGELOG:${stepLogs.find(l => /^エナチャージ/.test(l))}`, { kind: 'CHARGELOG', step, turn: r.turn_count, detail: `ログはエナチャージ${chargeN}・デッキ→エナは${got}枚`, logs: m.logs.slice(-8) });
        }
        for (const l of stepLogs) {
          const nm = l.match(/^(?:.+?が)?(.+)をバニッシュ$/)?.[1];
          if (!nm) continue;
          const onField = (st: PlayerState) => st.field.signi.filter(z => z?.length && cardMap.get(numOf(z.at(-1)!))?.CardName === nm).length;
          // ⚠ログ行は盤面の変化より1手遅れて届くことがある（実測＝バトルのバニッシュ）＝2手前の盤面と比べる
          const before = Math.max(onField(prevRow.host_state) + onField(prevRow.guest_state), prev2Row ? onField(prev2Row.host_state) + onField(prev2Row.guest_state) : 0), after = onField(r.host_state) + onField(r.guest_state);
          // ⚠「同じカードになる」等でカード名が上書きされた札は、印刷名では数えられない＝実機と同じ材料（上書きを当てた表）で数え直す
          const recount = () => {
            const cnt = (row: BattleStateRow) => { const mt = buildBattleMaterials({ bs: row, cards: uniqCards, userId: row.host_id, baseEffectsMap: effectsMap });
              return [row.host_state, row.guest_state].reduce((n, st) => n + st.field.signi.filter(z => z?.length && mt.cardMap.get(z.at(-1)!)?.CardName === nm).length, 0); };
            return { b: Math.max(cnt(prevRow), prev2Row ? cnt(prev2Row) : 0), a: cnt(r) };
          };
          if (before > 0 && after >= before && (() => { const x = recount(); return x.b > 0 && x.a >= x.b; })()) once(`BANISHLOG:${nm}`, { kind: 'BANISHLOG', step, turn: r.turn_count, detail: `ログは《${nm}》をバニッシュ・場の《${nm}》は ${before}→${after}`, logs: m.logs.slice(-8) });
        }
      }
    }
    // 🆕TURNLEAK＝ターンが移ったのに「ターン終了時に失効する」値（`TURN_SCOPED_STATE_FIELDS` の turn-end）が**前の手と同じ中身のまま**残っている
    //   ⚠中身が変わっていれば数えない（ターン開始時の予約の昇格で同じキーに新しい値が入るため）
    if (r.turn_count !== prevRow.turn_count) {
      const empty = (v: unknown) => v === undefined || v === null || v === 0 || v === false || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && v !== null && Object.keys(v).length === 0);
      for (const [side, before, after] of [['H', prevRow.host_state, r.host_state], ['G', prevRow.guest_state, r.guest_state]] as [string, any, any][])
        for (const [f, spec] of [
          ...Object.entries(TURN_SCOPED_STATE_FIELDS) as [string, { boundaries: readonly string[] }][],
          // 🆕ターンを終えた側だけ＝`clearEndingPlayerTurnState` の一覧（相手の state の同じキーは「相手の次のターンまで」でありうる）
          ...(((side === 'H') === (prevRow.active_user_id === r.host_id)) ? ENDING_KEYS.filter(k => !['actions_done', 'pending_crashed_cards', 'pending_crash_source_card_nums', 'pending_crash_causes'].includes(k)).map(k => [k, { boundaries: ['turn-end'] }] as [string, { boundaries: readonly string[] }]) : []),
        ]) {
          if (!spec.boundaries.includes('turn-end')) continue;
          const b = before[f], a = after[f];
          // ⚠「次のターン」の予約（`<キー>_next_turn`／`<キー>_until_next_own_turn`）から昇格した分は正しい持ち越し（「次の対戦相手のターン終了時まで」＝2ターン）
          const reserved = [`${f}_next_turn`, `${f}_until_next_own_turn`].some(k => !empty(before[k]));
          if (!reserved && !empty(b) && JSON.stringify(b) === JSON.stringify(a)) once(`TURNLEAK:${f}`, { kind: 'TURNLEAK', step, turn: r.turn_count, detail: `${side}.${f} がターンを越えて残った ${JSON.stringify(a).slice(0, 160)}`, logs: m.logs.slice(-10) });
        }
    }
    // POWERZERO＝落ち着いた盤面（スタック・対話・スペル待ちなし）でバニッシュされるはずのシグニが残り続ける
    if (!r.effect_stack && !r.pending_effect && !r.pending_spell) {
      const pz = powerZeroBanishCandidates(r, r.host_state, r.guest_state, effectsMap, instMap);
      if (pz.length > 0) { if (pzSince < 0) pzSince = step; else if (step - pzSince >= 15) once(`POWERZERO:${pz.join(',')}`, { kind: 'POWERZERO', step, turn: r.turn_count, detail: `${pz.join(',')} が${step - pzSince}手 残っている`, logs: m.logs.slice(-10) }); }
      else pzSince = -1;
    }
    // 🆕LIMIT＝落ち着いた盤面でリミット超過（レベル合計がリミットを超える）が3手以上続く（ルール処理の取りこぼし・ルール処理は毎手回るので3手で十分）
    if (!r.effect_stack && !r.pending_effect && !r.pending_spell && !r.host_state.field.check && !r.guest_state.field.check) {
      // ⚠素の表で超過したときだけ、実機と同じ材料（期間つきのレベル修正・付与された効果を当てた表）で測り直す＝素の表だけだと「相手ターン中だけレベル－」を見落として誤検出する
      const sides = [['H', r.host_state, r.guest_state], ['G', r.guest_state, r.host_state]] as [string, PlayerState, PlayerState][];
      const ownTurn = (side: string) => r.active_user_id === (side === 'H' ? r.host_id : r.guest_id);
      let over = sides.filter(([side, o, op]) => planLimitExcess({ owner: o, opponent: op, cardMap: instMap, effectsMap, isOwnerTurn: ownTurn(side) }).excess > 0);
      if (over.length > 0) {
        const mat = buildBattleMaterials({ bs: r, cards: uniqCards, userId: r.host_id, baseEffectsMap: effectsMap });
        over = over.filter(([side, o, op]) => planLimitExcess({ owner: o, opponent: op, cardMap: mat.cardMap, effectsMap: mat.effectsMap, isOwnerTurn: ownTurn(side) }).excess > 0);
      }
      const overSides = over.map(([side]) => side);
      if (overSides.length > 0) { if (limSince < 0) limSince = step; else if (step - limSince >= 3) once(`LIMIT:${overSides.join('')}`, { kind: 'LIMIT', step, turn: r.turn_count, detail: `${overSides.join(',')} がリミット超過のまま${step - limSince}手`, logs: m.logs.slice(-10) }); }
      else limSince = -1;
    }
    for (const s of shapeIssues(r, cardMap)) once(`SHAPE:${s.replace(/#\d+/g, '')}`, { kind: 'SHAPE', step, turn: r.turn_count, detail: s, logs: m.logs.slice(-8) });
    lastLog = Math.max(0, m.logs.length - 8);
    prev2Row = prevRow;
  }
  if (TRACE) { const r9 = m.row(); for (const [k, st] of [['HOST', r9.host_state], ['GUEST', r9.guest_state]] as const) console.log(k, JSON.stringify(st.field).slice(0, 300), 'crashed=', JSON.stringify(st.pending_crashed_cards), 'check=', st.field.check, 'burst=', JSON.stringify((st as any).pending_life_burst ?? null), 'psb=', JSON.stringify(st.pending_signi_battle ?? null), 'mods=', JSON.stringify(st.temp_power_mods ?? []).slice(0, 400)); const es = r9.effect_stack; if (es) console.log('STACK', JSON.stringify({ turn: es.turnPlayerId, pT: es.pendingTurn.map(e => e.effectId), pO: es.pendingOpp.map(e => e.effectId), q: es.queue.map(e => e.effectId), oT: es.orderTurnDone, oO: es.orderOppDone })); }
  if (TRACE) fs.writeFileSync('node_modules/.tmp/inv_trace_pending.json', JSON.stringify(m.row().pending_effect, null, 1), 'utf-8');
  if (TRACE) fs.writeFileSync('node_modules/.tmp/inv_trace_logs.txt', m.logs.join('\n'), 'utf-8');
  if (MIRROR && reason === 'finished') await mirrorCompare(setup.row, setup.logs, deps, rngAfterSetup, turnSnaps, m.row(), (key, f) => once(key, { game: tag, ...f }));
  if (LOGS_OUT) { fs.mkdirSync(LOGS_OUT, { recursive: true }); fs.writeFileSync(join(LOGS_OUT, `${tag.replace(/[^\w.-]+/g, '_')}.txt`), m.logs.join(String.fromCharCode(10)), 'utf-8'); }
  if (reason === 'cap') once('CAP', { kind: 'CAP', step, turn: m.row().turn_count, detail: 'step 上限', logs: ctxLogs() });
  const r = m.row();
  if (COV_OUT) fs.appendFileSync(COV_OUT, JSON.stringify({ game: tag, reason, effects: [...covEffects], field: [...covField] }) + String.fromCharCode(10));
  console.log(`${tag}: ${reason}${ANSWER_FUZZ > 0 ? ` fuzz=${JSON.stringify(fuzz.counts)}` : ''} steps=${step} turns=${r.turn_count} life H${r.host_state.life_cloth.length}/G${r.guest_state.life_cloth.length} winner=${r.winner_id ?? '-'}`);
}

/** 席を入れ替えた試合を回し、ターンが変わるたびに元の試合（の鏡）と突き合わせる。最初の食い違いだけ報告する。 */
async function mirrorCompare(row0: BattleStateRow, logs0: string[], deps: any, rng0: number, snaps: { turn: number; row: BattleStateRow; logs: string[] }[], finalRow: BattleStateRow, report: (key: string, f: any) => void) {
  const mir = (r: BattleStateRow) => mirrorSeats(r, HOST_ID, CPU_PLAYER_ID);
  rngState.a = rng0;
  const y = createHeadlessMatch(mir(row0), { ...deps, cpuPlans: { host: deps.cpuPlans.guest, guest: deps.cpuPlans.host }, policy: { host: deps.policy.guest, guest: deps.policy.host }, initialLogs: logs0, memo: createRuleCheckMemo() });
  const ySnaps: { turn: number; row: BattleStateRow; logs: string[] }[] = [];
  let k = '';
  for (let i = 0; i < MAX_STEPS; i++) {
    const prev = y.row();
    try { k = await y.step(); } catch (e: any) { k = 'crash'; ySnaps.push({ turn: -1, row: prev, logs: [String(e?.message ?? e)] }); break; }
    if (k === 'finished' || k === 'idle') break;
    if (y.row().turn_count !== prev.turn_count) ySnaps.push({ turn: y.row().turn_count, row: y.row(), logs: y.logs.slice(-8) });
  }
  const pick = (r: BattleStateRow) => ({ active: r.active_user_id, phase: r.turn_phase, winner: r.winner_id ?? null, host_state: r.host_state, guest_state: r.guest_state });
  for (let i = 0; i < Math.max(snaps.length, ySnaps.length); i++) {
    const a = snaps[i], b = ySnaps[i];
    if (!a || !b) { report('MIRROR:len', { kind: 'MIRROR', step: i, turn: (a ?? b)?.turn, detail: `ターン数が違う（元 ${snaps.length}／入れ替え ${ySnaps.length}・入れ替え側の終わり=${k}）`, logs: (a ?? b)!.logs }); return; }
    const keys = rowDiffKeys(pick(b.row), pick(mir(a.row)));
    if (keys.length > 0) { report(`MIRROR:${keys.join(',')}`, { kind: 'MIRROR', step: i, turn: a.turn, detail: `T${a.turn} で席を入れ替えた試合と食い違い 差=${keys.join(',')}（入れ替え側は host/guest が逆）`, logs: [...a.logs.map(l => `元| ${l}`), ...b.logs.map(l => `替| ${l}`)] }); return; }
  }
  const yw = y.row().winner_id, xw = finalRow.winner_id;
  if ((xw === HOST_ID ? CPU_PLAYER_ID : xw === CPU_PLAYER_ID ? HOST_ID : xw) !== yw) report('MIRROR:winner', { kind: 'MIRROR', step: 0, turn: y.row().turn_count, detail: `勝者が鏡にならない（元=${xw}／入れ替え=${yw}）`, logs: y.logs.slice(-8) });
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
      const ch = spawn(process.execPath, ['--import', 'tsx', self, '--worker', '--pairs', `${a}-${b}`, '--seeds', SEEDS.join(','), '--steps', String(MAX_STEPS), '--deck-dir', DECK_DIR, '--policy', POLICY, ...(POLICY_SET ? ['--policy-set', POLICY_SET] : []), '--resume-every', String(RESUME_EVERY), ...(RESUME_FRESH_MEMO ? ['--resume-fresh-memo'] : []), ...(MIRROR ? ['--mirror'] : []), '--answer-fuzz', String(ANSWER_FUZZ), ...(START.length ? ['--start', START.join(',')] : []), ...(LOGS_OUT ? ['--logs-out', LOGS_OUT] : []), ...(USE_ALL_ARTS ? ['--use-all-arts'] : []), ...(OUT ? ['--out', OUT] : []), ...(COV_OUT ? ['--cov-out', COV_OUT] : [])], { stdio: ['ignore', 'pipe', 'inherit'] });
      let buf = '';
      ch.stdout.on('data', d => { buf += d; });
      ch.on('close', () => res(buf));
    });
  }));
  const all = outs.join('').split(/\r?\n/).filter(Boolean);
  const games = all.filter(l => / steps=/.test(l));
  const bad = all.filter(l => l.startsWith('  🔴'));
  for (const l of games.filter(l => !/: finished /.test(l))) console.log(l);
  if (ANSWER_FUZZ > 0) {
    const tot: Record<string, number> = {};
    for (const l of games) { const mm = l.match(/ fuzz=(\{[^}]*\})/); if (mm) for (const [k, v] of Object.entries(JSON.parse(mm[1]) as Record<string, number>)) tot[k] = (tot[k] ?? 0) + v; }
    console.log(`差し替えた答え ${JSON.stringify(tot)}`);
  }
  for (const l of bad) console.log(l);
  console.log(`${games.length}戦（決着 ${games.filter(l => /: finished /.test(l)).length}）｜所見 ${bad.length}｜${((Date.now() - t0) / 1000).toFixed(0)}秒${OUT ? `｜明細 → ${OUT}` : ''}`);
})();
