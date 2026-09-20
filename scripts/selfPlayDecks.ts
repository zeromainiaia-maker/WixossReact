import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import type { CardData } from '../src/types';
import { deckLrigSetupProblem, DECK_LRIG_SETUP_PROBLEM_JA, lrigRolesOfRow, type DeckLrigRoles } from '../src/utils/deckLrigSetup';
import { normalizeCpuDeckPlan, pruneCpuDeckPlan, EMPTY_CPU_DECK_PLAN, type CpuDeckPlan } from '../src/screens/battle/cpuDeckPlan';

/**
 * 🆕**自己対戦の「山」を差し替える**（§5.7 `S-23`／`S-20` ①③・2026-09-20）＝
 * `scripts/headlessSelfPlay.ts` が**合成デッキ以外**でも回れるようにする。
 *
 * 🔴**なぜ要るか（実測）**＝A/B の既定の山（`VERIFY_DECK_MECH`）は**機構を広く踏む**目的で選んだ28枚種で、
 *   **`POWER_MODIFY` を持つカードが1枚も無い**（`S-10` はその型を直したのに、A/B は1ノードも踏まずに
 *   「勝率は下がらない」と出していた）。ユーザー作の26デッキで測り直すと**型の和集合は 85種**（既定の山は 23種）＝
 *   **64種が既定の山に一度も出てこない**。⇒ **A/B が「測りたいもの」を測っていない。**
 *
 * ■ 山の出どころ＝`node scripts/listDecks.mjs --export scratchpad-decks`（ユーザーのアカウントから書き出す）。
 *   ⚠**この JSON は gitignore 圏内**＝クローンし直した環境には無い（書き出しからやり直す）。
 *   ⚠**対戦中に DB は引かない**（自己対戦は決定論・オフラインが前提）＝**書き出した JSON だけを読む**。
 *
 * ■ 型の被覆（`deckActionTypes`）＝**その山が「どの効果の型を踏みうるか」**を live JSON から数える。
 *   ⚠**「踏みうる」であって「踏んだ」ではない**（実際に何回踏んだかは `npm run census:play`）。
 */

export interface SelfPlayDeck {
  /** 表示名（`--deck` に渡す名前）。 */
  name: string;
  lrigDeck: string[];
  mainDeck: string[];
  roles: DeckLrigRoles;
  /** §5.7 `S-2` の作戦データ（無ければ空）。 */
  plan: CpuDeckPlan;
}

/** 書き出した JSON の1行（`scripts/listDecks.mjs --export` の形）。 */
interface DeckRow {
  name?: string;
  deck_kind?: string | null;
  main_deck?: string[];
  lrig_deck?: string[];
  center_lrig?: string | null;
  assist_lrig_l?: string | null;
  assist_lrig_r?: string | null;
  cpu_plan?: unknown;
}

export const DECK_EXPORT_DIR = 'scratchpad-decks';

/**
 * 合成デッキ（既定）＝`VERIFY_DECK_MECH`（`scripts/verifySetupDeck.mjs` と同じ構成）。
 * 🔴**ここを変えると過去の勝率と比べられなくなる**＝変えるときは理由を BUGFIXES に書く（`S-9` の但し書き）。
 */
export const MECH_DECK: SelfPlayDeck = {
  name: 'VERIFY_DECK_MECH',
  lrigDeck: ['WD03-005', 'WD03-004', 'WD03-003', 'WD03-002', 'WDK09-005', 'WXDi-D01-009', 'WDK14-005', 'WXDi-D01-006', 'WX21-011', 'WX12-017',
    'WDK02-001', 'WXK02-020', 'WXDi-P00-006'],
  mainDeck: [
    ...Array(4).fill('WD01-017'),
    ...Array(2).fill('WX03-043'), ...Array(2).fill('WX01-085'),
    ...Array(2).fill('WX01-083'), ...Array(2).fill('WX02-036'),
    ...Array(2).fill('WXDi-P05-038'),
    ...Array(3).fill('WX05-062'), ...Array(2).fill('WX05-060'),
    ...Array(4).fill('WD03-013'), ...Array(4).fill('WD03-012'), ...Array(3).fill('WD03-010'),
    ...Array(4).fill('WX12-055'), ...Array(2).fill('WX12-054'),
    ...Array(2).fill('WX04-080'), ...Array(2).fill('WX04-077'),
  ],
  roles: { centerLrig: 'WD03-005', assistLrigL: 'WDK09-005', assistLrigR: 'WDK14-005' },
  plan: EMPTY_CPU_DECK_PLAN,
};

/** 書き出した全デッキ（`decks_*.json` を全部読む）。無ければ空配列。 */
export function loadExportedDeckRows(dir = DECK_EXPORT_DIR): DeckRow[] {
  if (!existsSync(dir)) return [];
  const out: DeckRow[] = [];
  for (const f of readdirSync(dir).filter(x => /^decks_.*\.json$/.test(x))) {
    out.push(...(JSON.parse(readFileSync(join(dir, f), 'utf-8')) as DeckRow[]));
  }
  return out;
}

/** 対戦に出せる形か（メイン40枚・ルリグ配置が成立する）。 */
function deckProblem(row: DeckRow, cardMap: Map<string, CardData>): string | null {
  if ((row.main_deck?.length ?? 0) !== 40) return `メインデッキが ${row.main_deck?.length ?? 0}枚（40枚が要る）`;
  if ((row.lrig_deck?.length ?? 0) === 0) return 'ルリグデッキが空';
  const p = deckLrigSetupProblem({ ...lrigRolesOfRow(row), lrigDeck: row.lrig_deck ?? [] }, cardMap);
  return p ? DECK_LRIG_SETUP_PROBLEM_JA[p] : null;
}

/**
 * 名前（部分一致）から山を1つ解決する。`name` が空なら合成デッキ（既定）。
 * 🔴**一意に決まらなければ例外**＝「なんとなく先頭」を選ぶと**どの山で測ったか分からない数字**が出る。
 */
export function resolveSelfPlayDeck(name: string | null | undefined, cardMap: Map<string, CardData>): SelfPlayDeck {
  if (!name) return MECH_DECK;
  const rows = loadExportedDeckRows();
  if (rows.length === 0) {
    throw new Error(`書き出したデッキがありません（${DECK_EXPORT_DIR}/decks_*.json）。`
      + `\n  先に: node scripts/listDecks.mjs --export ${DECK_EXPORT_DIR}`);
  }
  const hit = rows.filter(r => (r.name ?? '').includes(name));
  const exact = rows.filter(r => r.name === name);
  const picked = exact.length === 1 ? exact : hit;
  if (picked.length === 0) {
    throw new Error(`デッキ「${name}」がありません。\n  候補: ${rows.map(r => r.name).join(' / ')}`);
  }
  if (picked.length > 1) {
    throw new Error(`デッキ「${name}」が ${picked.length}件に当たります＝一意に指定してください。\n  候補: ${picked.map(r => r.name).join(' / ')}`);
  }
  const row = picked[0];
  const problem = deckProblem(row, cardMap);
  if (problem) throw new Error(`デッキ「${row.name}」は対戦に使えません＝${problem}`);
  const nums = [...(row.main_deck ?? []), ...(row.lrig_deck ?? [])];
  return {
    name: row.name ?? '(無名)',
    lrigDeck: row.lrig_deck ?? [],
    mainDeck: row.main_deck ?? [],
    roles: lrigRolesOfRow(row),
    plan: pruneCpuDeckPlan(normalizeCpuDeckPlan(row.cpu_plan), nums),
  };
}

/** 対戦に出せる山の名前（`--decks` の既定＝総当たりの母集団）。 */
export function listPlayableDeckNames(cardMap: Map<string, CardData>, cpuOnly = false): string[] {
  return loadExportedDeckRows()
    .filter(r => (!cpuOnly || r.deck_kind === 'cpu') && deckProblem(r, cardMap) === null)
    .map(r => r.name ?? '(無名)');
}

// ── 型の被覆（§5.7 `S-20` ③）───────────────────────────────────────────────
let EFFECT_JSON: Record<string, unknown> | null = null;

function effectJson(): Record<string, unknown> {
  if (EFFECT_JSON) return EFFECT_JSON;
  const all: Record<string, unknown> = {};
  for (const f of readdirSync('public/data').filter(x => /^effects_.*\.json$/.test(x))) {
    Object.assign(all, JSON.parse(readFileSync(join('public/data', f), 'utf-8')) as Record<string, unknown>);
  }
  EFFECT_JSON = all;
  return all;
}

/**
 * この山のカードが持つ**効果のノード型**の集合（`EffectAction` の `type`・条件型も含む）。
 * ⚠**「踏みうる」であって「踏んだ」ではない**＝実際の回数は `npm run census:play`。
 */
export function deckActionTypes(deck: SelfPlayDeck): Set<string> {
  const data = effectJson();
  const out = new Set<string>();
  const walk = (n: unknown): void => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const rec = n as Record<string, unknown>;
    if (typeof rec.type === 'string') out.add(rec.type);
    for (const v of Object.values(rec)) walk(v);
  };
  for (const num of new Set([...deck.mainDeck, ...deck.lrigDeck].map(n => String(n).split('#')[0]))) {
    const raw = data[num];
    const effects = (Array.isArray(raw) ? raw : ((raw as { effects?: unknown[] } | undefined)?.effects ?? [])) as unknown[];
    effects.forEach(walk);
  }
  return out;
}

/**
 * 山ごとの型の被覆を1行で出す（`S-20` ③＝「その山が対象の型を何ノード踏むか」）。
 * 🔑**A/B の出力にこれを必ず載せる**＝勝率だけを見て「安全」と誤読しないため。
 */
export function formatDeckCoverage(decks: SelfPlayDeck[]): string {
  const lines: string[] = [];
  const union = new Set<string>();
  for (const d of decks) {
    const t = deckActionTypes(d);
    for (const x of t) union.add(x);
    lines.push(`  山「${d.name}」＝踏みうる型 ${t.size}種／作戦データ ${d.plan.keyCards.length + d.plan.priorityCards.length + d.plan.combos.length > 0 ? 'あり' : 'なし'}`);
  }
  if (decks.length > 1) lines.push(`  合算＝${union.size}種`);
  return lines.join('\n');
}
