import type { PlayerState } from '../../types';
import { getCardNum } from '../../engine/execUtils';
import { DEFAULT_CPU_POLICY, type CpuPolicy, type PlanWeights } from './cpuPolicy';

/**
 * 🆕**CPU デッキの作戦データ**（§5.7 `S-2`・2026-09-17）＝デッキごとに「どの札が大事か・何を先に出すか・どのコンボを狙うか」を持たせる。
 *
 * ■ なぜ要るか（ユーザー指摘）＝「CPU の使うデッキによって強い行動が変わる」「複数のカードのコンボが強い」。
 *   `S-1` の強さ表はカード1枚ずつの採点なので、**デッキ固有の役割とカード同士の組み合わせ**は表せない。探索（`S-3`）なしで決まる部分をデータで持つ。
 *
 * ■ 中身（`decks.cpu_plan`・CPU デッキだけ）
 *   - `keyCards`＝キーカード：エナに置かない・捨てない・マリガンで戻さない・サーチで優先する。
 *   - `priorityCards`＝優先して出す札。
 *   - `combos`＝**順番に打つ手の列**（🆕§5.7 `S-14`）：1手ごとに**出す／【起】で使う／アーツで撃つ／スペルで使う**を持つ。
 *     後の手の札が手元にあれば前の手を先に打ち、前の手が済むまで後の手は温存し、前が済んだら後を最優先にする。
 *
 * ■ 使い方＝`S-1` の強さ（パワー換算）に**足し引きする点数**を返すだけ。可否の判定・実行には関わらない（§5.6.3）。
 *   カードはカード番号（instance の `#…` を外した番号）で持つ。
 */
/**
 * 🆕**コンボの1手の「使い方」**（§5.7 `S-14`・2026-09-21）。
 * 🔴**なぜ要るか（実測）**＝21デッキの作戦データを下書きしたら、**3件のコンボが「出す」では書けなかった**
 *   （`WD06` リュウグウの【起】でライフを入れ替える／`WD08` ウムル＝フィーラの【出】→ネビュラを**トラッシュから【起】**／
 *   `WD16` Ｆ・Ｍ・Ｓ の【起】でハンデス→Ｇ・Ｌ・Ｋ が出せる）。
 * ⚠**`activate` は「場・手札・トラッシュ・エナのどこから撃つか」を区別しない**＝どの窓でも「その札の【起】を使った」で1つ。
 */
export type CpuComboUse = 'deploy' | 'activate' | 'arts' | 'spell';

/** 選べる使い方（UI の並び順＝この順）。 */
export const CPU_COMBO_USES: readonly CpuComboUse[] = ['deploy', 'activate', 'arts', 'spell'];

/** 画面と逆引きの表示名。 */
export const CPU_COMBO_USE_LABELS: Readonly<Record<CpuComboUse, string>> = {
  deploy: '出す', activate: '【起】で使う', arts: 'アーツで撃つ', spell: 'スペルで使う',
};

/** コンボの1手。 */
export interface CpuComboStep {
  num: string;
  use: CpuComboUse;
}

/**
 * コンボ＝**手の列**（2手に限らない）。
 * 🔴**旧形 `{ first, then }` も読める**（`normalizeCpuDeckPlan` が「出す → 出す」の2手へ変換する）＝
 *   既に入力済みの `decks.cpu_plan` を壊さない。
 */
export interface CpuDeckCombo {
  steps: CpuComboStep[];
}

export interface CpuDeckPlan {
  keyCards: string[];
  priorityCards: string[];
  combos: CpuDeckCombo[];
}

export const EMPTY_CPU_DECK_PLAN: CpuDeckPlan = { keyCards: [], priorityCards: [], combos: [] };

/**
 * 足し引きする点数（パワー換算）。`S-6` の自己対戦で調整する対象。
 * 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.planWeights`**（§5.7 `S-6` 第2段）＝**値をここに書かない**。
 */
export const PLAN_WEIGHTS: PlanWeights = DEFAULT_CPU_POLICY.planWeights;

/**
 * DB の1件をコンボへ（🆕新形 `{steps}` ／🔴旧形 `{first, then}` の両対応）。
 * ⚠**同じ手の重複と空の番号は落とす**（UI から壊れた値が来ても効かないだけにする）。
 */
function toCombo(c: Record<string, unknown>): CpuDeckCombo | null {
  if (Array.isArray(c.steps)) {
    const seen = new Set<string>();
    const steps: CpuComboStep[] = [];
    for (const raw of c.steps) {
      if (!raw || typeof raw !== 'object') continue;
      const r = raw as Record<string, unknown>;
      const num = String(r.num ?? '');
      const use = CPU_COMBO_USES.includes(r.use as CpuComboUse) ? (r.use as CpuComboUse) : 'deploy';
      const key = `${num}/${use}`;
      if (!num || seen.has(key)) continue;
      seen.add(key);
      steps.push({ num, use });
    }
    return steps.length > 0 ? { steps } : null;
  }
  // 🔴旧形＝「A を出す → B を出す」。
  const first = String(c.first ?? ''), then = String(c.then ?? '');
  if (!first || !then || first === then) return null;
  return { steps: [{ num: first, use: 'deploy' }, { num: then, use: 'deploy' }] };
}

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];

/** DB の値（形が崩れていても）を作戦データへ。 */
export function normalizeCpuDeckPlan(raw: unknown): CpuDeckPlan {
  if (!raw || typeof raw !== 'object') return EMPTY_CPU_DECK_PLAN;
  const r = raw as Record<string, unknown>;
  const combos = Array.isArray(r.combos)
    ? r.combos
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(toCombo)
      .filter((c): c is CpuDeckCombo => !!c)
    : [];
  return { keyCards: strList(r.keyCards), priorityCards: strList(r.priorityCards), combos };
}

/** デッキに無いカードを作戦から外す（編集で抜いたカードが残らないように）。 */
export function pruneCpuDeckPlan(plan: CpuDeckPlan, deckCardNums: readonly string[]): CpuDeckPlan {
  const inDeck = new Set(deckCardNums.map(getCardNum));
  return {
    keyCards: plan.keyCards.filter(n => inDeck.has(n)),
    priorityCards: plan.priorityCards.filter(n => inDeck.has(n)),
    combos: plan.combos.filter(c => c.steps.every(st => inDeck.has(st.num))),
  };
}

export const isEmptyCpuDeckPlan = (plan: CpuDeckPlan): boolean =>
  plan.keyCards.length === 0 && plan.priorityCards.length === 0 && plan.combos.length === 0;

/** 手元に残す価値の加点（エナチャージ・手札上限の捨て札・サーチで使う）。 */
export function planKeepBonus(plan: CpuDeckPlan, id: string, policy?: CpuPolicy): number {
  const num = getCardNum(id);
  const W = policy?.planWeights ?? PLAN_WEIGHTS;
  let bonus = 0;
  if (plan.keyCards.includes(num)) bonus += W.keyKeep;
  if (plan.combos.some(c => c.steps.some(st => st.num === num))) bonus += W.comboKeep;
  return bonus;
}

/** マリガンで戻さない札（キーカードとコンボのパーツ）。 */
export function planKeepsInMulligan(plan: CpuDeckPlan, id: string): boolean {
  const num = getCardNum(id);
  return plan.keyCards.includes(num) || plan.combos.some(c => c.steps.some(st => st.num === num));
}

/**
 * 🆕**加点を測るための盤面**（§5.7 `S-14`）＝「その手がもう済んだか」「その札がまだ手元にあるか」を見るのに要る。
 * ⚠**instance ID（`#…`）でもカード番号でもよい**（`getCardNum` で剥がす）。
 */
export interface CpuPlanBoardCtx {
  /** いまの手札。 */
  hand: readonly string[];
  /** いまの自分の場（シグニのトップ・ルリグ）。 */
  field: readonly string[];
  /**
   * 🆕**コンボがまだ動かせるか**の判定に使う置き場（手札・場・トラッシュ・エナ）。省略時は手札＋場。
   * 🔑**トラッシュを含めないとトラッシュ【起】のコンボが動かない**（`WD08` のネビュラ）。
   */
  available?: readonly string[];
  /** 🆕このターンに CPU が使った【起】の `effectId`（`cpu_activated_effect_ids_this_turn`）。 */
  activatedEffectIds?: readonly string[];
  /**
   * 🆕カード番号 → その札の効果の `effectId` 一覧。
   * 🔴**`effectId` からカード番号を正規表現で削り出さない**＝接尾辞は `-E1` だけでなく `-BURST` / `-TRAP` /
   *   `-RIDE` / `-DECORE` … と開いた集合で、**実測で 95件が外れた**（2026-09-21）。**引くのは効果表から。**
   */
  effectIdsOf?: (num: string) => readonly string[];
  /** 🆕使用済みのアーツ（ルリグトラッシュ）。 */
  lrigTrash?: readonly string[];
  /** 🆕使用済みのスペル（トラッシュ）。 */
  trash?: readonly string[];
}

/**
 * 🆕**その札をその使い方で「いま」使うことへの加点**（§5.7 `S-14`・2026-09-21）。
 *
 * - **優先して出す札**＝`deploy` のときだけ `priorityDeploy`。
 * - **コンボ**＝その手がコンボの何手目かで決まる：
 *   - **前の手が全部済んでいる** → 1手目なら `comboFirst`（⚠**後ろの手の札が手元にあるときだけ**）／2手目以降は `comboThenReady`。
 *   - **前の手が済んでいない** → `comboThenHold`（負＝温存する。⚠**その前の札が手元にあるときだけ**）。
 *   - **もう済んだ手**は加点しない。
 * 🔑**「済んだ」の判定は使い方ごと**＝`deploy`＝場にいる／`activate`＝このターンその札の【起】を使った／
 *   `arts`＝ルリグトラッシュにある／`spell`＝トラッシュにある。
 *   ⚠**`arts`／`spell` は「このターン使った」ではなく「使用済みの置き場にある」の近似**（ターンを跨いでも済み扱い）。
 */
export function planUseBonus(
  plan: CpuDeckPlan, cardNum: string, use: CpuComboUse, ctx: CpuPlanBoardCtx, policy?: CpuPolicy,
): number {
  const num = getCardNum(cardNum);
  const W = policy?.planWeights ?? PLAN_WEIGHTS;
  const nums = (xs: readonly string[] | undefined) => new Set((xs ?? []).map(getCardNum));
  const onField = nums(ctx.field);
  const avail = ctx.available ? nums(ctx.available) : new Set([...nums(ctx.hand), ...onField]);
  const lrigTrash = nums(ctx.lrigTrash), trash = nums(ctx.trash);
  const activated = new Set(ctx.activatedEffectIds ?? []);
  const done = (st: CpuComboStep): boolean => {
    switch (st.use) {
      case 'deploy': return onField.has(st.num);
      case 'activate': return (ctx.effectIdsOf?.(st.num) ?? []).some(eid => activated.has(eid));
      case 'arts': return lrigTrash.has(st.num);
      case 'spell': return trash.has(st.num);
    }
  };
  let bonus = use === 'deploy' && plan.priorityCards.includes(num) ? W.priorityDeploy : 0;
  for (const c of plan.combos) {
    const i = c.steps.findIndex(st => st.num === num && st.use === use);
    if (i < 0 || done(c.steps[i])) continue;
    const prior = c.steps.slice(0, i);
    if (!prior.every(done)) {
      // まだ前の手が残っている＝温存する（⚠その前の札が手元にあるときだけ＝引けていないなら待たない）。
      if (prior.some(st => !done(st) && avail.has(st.num))) bonus += W.comboThenHold;
      continue;
    }
    if (i > 0) { bonus += W.comboThenReady; continue; }
    const later = c.steps.slice(1);
    if (later.length === 0 || later.some(st => avail.has(st.num))) bonus += W.comboFirst;
  }
  return bonus;
}

/**
 * 🆕**盤面から加点用の文脈を作る**（§5.7 `S-14`）＝呼び出し側で組み立て方を写経しない。
 * 🔑**`available` にトラッシュとエナを入れる**＝トラッシュ【起】・エナから出す札のコンボが「動かせる」と判定できる。
 * @param effectIdsOf カード番号 → `effectId` 一覧（`activate` の「済んだ」判定に要る。省略すると `activate` は常に未了）
 */
export function cpuPlanBoardCtx(
  st: PlayerState, effectIdsOf?: (num: string) => readonly string[],
): CpuPlanBoardCtx {
  const field = [...st.field.signi.map(stk => stk?.at(-1) ?? ''), ...st.field.lrig].filter(Boolean);
  return {
    hand: st.hand,
    field,
    available: [...st.hand, ...field, ...st.trash, ...st.energy],
    activatedEffectIds: st.cpu_activated_effect_ids_this_turn,
    effectIdsOf,
    lrigTrash: st.lrig_trash,
    trash: st.trash,
  };
}

/**
 * 場に出す（召喚する）ときの加点＝`planUseBonus` の `deploy` の口（**式は1本**）。
 * @param handIds いまの手札（instance ID）／@param fieldIds いまの自分の場（シグニのトップ・ルリグ）
 */
export function planDeployBonus(
  plan: CpuDeckPlan, id: string, handIds: readonly string[], fieldIds: readonly string[], policy?: CpuPolicy,
): number {
  return planUseBonus(plan, id, 'deploy', { hand: handIds, field: fieldIds }, policy);
}
