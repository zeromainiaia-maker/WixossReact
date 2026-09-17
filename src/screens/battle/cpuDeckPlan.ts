import { getCardNum } from '../../engine/execUtils';

/**
 * 🆕**CPU デッキの作戦データ**（§5.7 `S-2`・2026-09-17）＝デッキごとに「どの札が大事か・何を先に出すか・どのコンボを狙うか」を持たせる。
 *
 * ■ なぜ要るか（ユーザー指摘）＝「CPU の使うデッキによって強い行動が変わる」「複数のカードのコンボが強い」。
 *   `S-1` の強さ表はカード1枚ずつの採点なので、**デッキ固有の役割とカード同士の組み合わせ**は表せない。探索（`S-3`）なしで決まる部分をデータで持つ。
 *
 * ■ 中身（`decks.cpu_plan`・CPU デッキだけ）
 *   - `keyCards`＝キーカード：エナに置かない・捨てない・マリガンで戻さない・サーチで優先する。
 *   - `priorityCards`＝優先して出す札。
 *   - `combos`＝「`first` の後に `then`」：`then` が手札にあれば `first` を先に出し、`first` が場にいないあいだ `then` は温存し、
 *     `first` が場に出たら `then` を最優先にする。
 *
 * ■ 使い方＝`S-1` の強さ（パワー換算）に**足し引きする点数**を返すだけ。可否の判定・実行には関わらない（§5.6.3）。
 *   カードはカード番号（instance の `#…` を外した番号）で持つ。
 */
export interface CpuDeckCombo {
  first: string;
  then: string;
}

export interface CpuDeckPlan {
  keyCards: string[];
  priorityCards: string[];
  combos: CpuDeckCombo[];
}

export const EMPTY_CPU_DECK_PLAN: CpuDeckPlan = { keyCards: [], priorityCards: [], combos: [] };

/** 足し引きする点数（パワー換算）。`S-4` の自己対戦で調整する対象。 */
export const PLAN_WEIGHTS = {
  /** キーカードをエナ・捨て札にしない */
  keyKeep: 20000,
  /** コンボのパーツを手元に残す */
  comboKeep: 4000,
  /** 優先して出す */
  priorityDeploy: 4000,
  /** コンボの始動札（相方が手札にある） */
  comboFirst: 5000,
  /** コンボの仕上げ札（始動札が場にある） */
  comboThenReady: 8000,
  /** コンボの仕上げ札を温存（始動札が手札にあって、まだ場にいない） */
  comboThenHold: -8000,
} as const;

const strList = (v: unknown): string[] =>
  Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === 'string' && x.length > 0))] : [];

/** DB の値（形が崩れていても）を作戦データへ。 */
export function normalizeCpuDeckPlan(raw: unknown): CpuDeckPlan {
  if (!raw || typeof raw !== 'object') return EMPTY_CPU_DECK_PLAN;
  const r = raw as Record<string, unknown>;
  const combos = Array.isArray(r.combos)
    ? r.combos
      .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object')
      .map(c => ({ first: String(c.first ?? ''), then: String(c.then ?? '') }))
      .filter(c => c.first && c.then && c.first !== c.then)
    : [];
  return { keyCards: strList(r.keyCards), priorityCards: strList(r.priorityCards), combos };
}

/** デッキに無いカードを作戦から外す（編集で抜いたカードが残らないように）。 */
export function pruneCpuDeckPlan(plan: CpuDeckPlan, deckCardNums: readonly string[]): CpuDeckPlan {
  const inDeck = new Set(deckCardNums.map(getCardNum));
  return {
    keyCards: plan.keyCards.filter(n => inDeck.has(n)),
    priorityCards: plan.priorityCards.filter(n => inDeck.has(n)),
    combos: plan.combos.filter(c => inDeck.has(c.first) && inDeck.has(c.then)),
  };
}

export const isEmptyCpuDeckPlan = (plan: CpuDeckPlan): boolean =>
  plan.keyCards.length === 0 && plan.priorityCards.length === 0 && plan.combos.length === 0;

/** 手元に残す価値の加点（エナチャージ・手札上限の捨て札・サーチで使う）。 */
export function planKeepBonus(plan: CpuDeckPlan, id: string): number {
  const num = getCardNum(id);
  let bonus = 0;
  if (plan.keyCards.includes(num)) bonus += PLAN_WEIGHTS.keyKeep;
  if (plan.combos.some(c => c.first === num || c.then === num)) bonus += PLAN_WEIGHTS.comboKeep;
  return bonus;
}

/** マリガンで戻さない札（キーカードとコンボのパーツ）。 */
export function planKeepsInMulligan(plan: CpuDeckPlan, id: string): boolean {
  const num = getCardNum(id);
  return plan.keyCards.includes(num) || plan.combos.some(c => c.first === num || c.then === num);
}

/**
 * 場に出す（召喚する）ときの加点。
 * @param handIds いまの手札（instance ID）／@param fieldIds いまの自分の場（シグニのトップ・ルリグ）
 */
export function planDeployBonus(plan: CpuDeckPlan, id: string, handIds: readonly string[], fieldIds: readonly string[]): number {
  const num = getCardNum(id);
  const inHand = new Set(handIds.map(getCardNum));
  const onField = new Set(fieldIds.map(getCardNum));
  let bonus = plan.priorityCards.includes(num) ? PLAN_WEIGHTS.priorityDeploy : 0;
  for (const c of plan.combos) {
    if (c.first === num && inHand.has(c.then) && !onField.has(c.first)) bonus += PLAN_WEIGHTS.comboFirst;
    if (c.then === num) {
      if (onField.has(c.first)) bonus += PLAN_WEIGHTS.comboThenReady;
      else if (inHand.has(c.first)) bonus += PLAN_WEIGHTS.comboThenHold;
    }
  }
  return bonus;
}
