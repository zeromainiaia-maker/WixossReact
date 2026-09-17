import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { calcSigniLevels } from '../../engine/effectEngine';
import { resonaLeaveDestination } from '../../engine/resonaZone';
import { computeEffectiveLrigLimit } from './lrigLimit';
import { declaredSigniOverride } from './growLogic';
import { clearZoneOnSigniLeave } from './leaveFieldZone';

const baseNum = (id: string): string => { const h = id.indexOf('#'); return h > 0 ? id.slice(0, h) : id; };

export interface LimitExcessPlan {
  /**
   * センタールリグのレベルを**超える**シグニのゾーン（`R-48` の前半）。
   * 🔴**2026-09-17 時点では報告するだけで落とさない**＝理由は `planLimitExcess` の ⚠ を読むこと。
   */
  levelOverZones: number[];
  /** 持ち主が**1体ずつ**選ぶ候補ゾーン（リミットを超えているときだけ）。 */
  candidateZones: number[];
  /** 実効リミット（`∞` は `Infinity`）。 */
  limit: number;
  /** 場のシグニのレベル合計。 */
  total: number;
  /** `max(0, total - limit)`＝まだ落とさなければならないレベル。 */
  excess: number;
  /** ゾーン → 実効レベル（判定に使った値。UI とテストが同じ数字を見る）。 */
  levels: Map<number, number>;
}

const EMPTY_PLAN: LimitExcessPlan = {
  levelOverZones: [], candidateZones: [], limit: Infinity, total: 0, excess: 0, levels: new Map(),
};

/**
 * **レベル超過／リミット超過のルール処理**（§5.3 `O-532`・台帳 [RULES.md](../../../docs/RULES.md) `R-44`／`R-48`）。
 *
 * 公式ルール（EN Level・Limit／Rule-based action 2）＝**シグニのレベルはセンタールリグのレベル以下**、
 * **場のシグニのレベル合計はリミット以下**。超えたら **A（レベル超過）→ B（直前に変化したもの）→ C（持ち主が選ぶ）**
 * の順に1体ずつトラッシュに置く。
 *
 * 🔴**2026-09-17 の棚卸しで見つけた穴**＝リミットもレベルも**配置時のゲートでしか見ていなかった**
 *   （`SigniSummonZoneModal` の `overLimit` ／ 手札召喚の `levelOk`）。**置いたあとにリミットやレベルが変わっても
 *   場は減らない**＝リミット超過の盤面がそのまま維持される。`fieldLimit.reduceFieldSigniToLimit` は
 *   別物（`LIMIT_ALL_FIELD_N`＝体数上限用）で、しかもどこからも呼ばれていなかった。
 *
 * ⚠**B（直前に変化したもの）は追跡していない**＝「どのシグニのレベルが直前に変わったか」「リミットを変えたのは
 *   どの効果か」を持つ state が無い。⇒ **持ち主に選ばせる**（推測で自動に落とすより安全側）。
 *   B を実装するなら「レベル変更・リミット変更の時刻印」を state に足すのが先。
 *
 * 🔴🔑**「レベル超過」は測るが落とさない**（2026-09-17 の判断・RULES.md `R-48` に ❓ で残した）＝
 *   ①原文コーパスで**ルリグのレベルを下げる効果は0枚**（実測）＝**配置ゲート**（`levelOk`／
 *     `SigniSummonZoneModal`）を通った盤面が後からレベル超過になる live の道が無い。
 *   ②そのため自動トラッシュは**盤面を注入する実機シナリオ（27本）にしか当たらない**＝
 *     テストの盤面を食うだけで、ゲーム中には一度も効かない。
 *   ③「レベル以下」が**配置制限**なのか**ルール処理（state-based）**なのかは一次資料で確定できていない。
 *   ⇒ `levelOverZones` は**計測して返すだけ**にし、落とすのは**リミット超過**（`R-44`・live 9カードが変える）に限る。
 *   ⚠読みが決まったらここを1行変えるだけで有効化できる（呼び出し側の funnel に分岐を足す）。
 *
 * ⚠**fail-closed**＝センタールリグが読めない／リミットが `∞` のときは**何も落とさない**（盤面からカードを消す側なので）。
 */
export function planLimitExcess(p: {
  owner: PlayerState;
  opponent: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  isOwnerTurn: boolean;
}): LimitExcessPlan {
  const { owner, opponent, cardMap, effectsMap } = p;
  const centerInstance = owner.field.lrig.at(-1);
  if (!centerInstance) return EMPTY_PLAN;
  const centerCard = cardMap.get(centerInstance) ?? cardMap.get(baseNum(centerInstance));
  const centerLevel = parseInt(centerCard?.Level ?? '', 10);
  if (!Number.isFinite(centerLevel)) return EMPTY_PLAN;
  const limit = computeEffectiveLrigLimit(owner, opponent, cardMap, effectsMap, p.isOwnerTurn);
  const signiLevels = calcSigniLevels(owner, opponent, effectsMap, cardMap);
  const levels = new Map<number, number>();
  for (const [zi, stack] of owner.field.signi.entries()) {
    const top = stack?.at(-1);
    if (!top) continue;
    const card = cardMap.get(top) ?? cardMap.get(baseNum(top));
    // 🔑**配置ゲートと同じ式で数える**＝ズレると「置けたのにルール処理が落とす」形の理不尽になる。
    //   宣言名のレベル0上書き（§5.3 `O-226`）は `calcSigniLevels` が知らないのでここで重ねる。
    if (declaredSigniOverride(owner, card?.CardName).levelZero) { levels.set(zi, 0); continue; }
    const printed = parseInt(card?.Level ?? '', 10);
    levels.set(zi, signiLevels.get(top) ?? (Number.isFinite(printed) ? printed : 0));
  }
  const levelOverZones = [...levels.entries()].filter(([, lv]) => lv > centerLevel).map(([zi]) => zi);
  const total = [...levels.values()].reduce((sum, lv) => sum + lv, 0);
  const excess = Number.isFinite(limit) ? Math.max(0, total - limit) : 0;
  return {
    levelOverZones,
    candidateZones: excess > 0 ? [...levels.keys()] : [],
    limit, total, excess, levels,
  };
}

/**
 * 持ち主に選ばせられないとき（CPU の盤面）に、**落とす1体**を自動で決める。
 *
 * 🔑**方針＝失うカードを最小にする**＝実効レベルが**一番高い**ゾーンを落とす（同値はゾーン順）。
 *   ⚠レベル0のシグニしか残っていないのに超過が消えないなら `null`（＝これ以上減らせない）を返す
 *   ＝**無限ループを作らない**ための fail-closed。
 */
export function pickLimitExcessZone(plan: LimitExcessPlan): number | null {
  if (plan.excess <= 0) return null;
  const usable = plan.candidateZones.filter(zi => (plan.levels.get(zi) ?? 0) > 0);
  if (usable.length === 0) return null;
  return usable.reduce((best, zi) =>
    (plan.levels.get(zi) ?? 0) > (plan.levels.get(best) ?? 0) ? zi : best, usable[0]);
}

/**
 * ルール処理でシグニを場からトラッシュへ置く（複数ゾーンをまとめて）。
 *
 * ⚠**行き先はレゾナ規則（`R-45`）を通す**＝レゾナは**ルリグデッキ**（宣言があればルリグトラッシュ）へ戻る。
 *   下に敷かれていたカードは通常どおりトラッシュ。
 * ⚠**ゾーンの後始末は `clearZoneOnSigniLeave`（`R-41`）**＝【チャーム】【アクセ】はトラッシュ、【ソウル】はルリグトラッシュ。
 */
export function applyLimitExcessTrash(
  state: PlayerState,
  zones: Iterable<number>,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): { state: PlayerState; trashedTops: string[] } {
  let field = state.field;
  let trash = [...state.trash];
  let lrigTrash = [...state.lrig_trash];
  let lrigDeck = [...state.lrig_deck];
  const signi = [...state.field.signi] as (string[] | null)[];
  const trashedTops: string[] = [];
  for (const zi of zones) {
    const stack = state.field.signi[zi] ?? [];
    if (stack.length === 0) continue;
    const top = stack[stack.length - 1];
    trashedTops.push(top);
    const resonaDest = resonaLeaveDestination(top, cardMap, effectsMap);
    if (resonaDest === 'lrig_deck') lrigDeck = [...lrigDeck, top];
    else if (resonaDest === 'lrig_trash') lrigTrash = [...lrigTrash, top];
    else trash = [...trash, top];
    trash = [...trash, ...stack.slice(0, -1)];
    signi[zi] = null;
    const cleaned = clearZoneOnSigniLeave(field, zi);
    field = cleaned.field;
    trash = [...trash, ...cleaned.trash];
    lrigTrash = [...lrigTrash, ...cleaned.lrigTrash];
  }
  return {
    state: { ...state, field: { ...field, signi }, trash, lrig_trash: lrigTrash, lrig_deck: lrigDeck },
    trashedTops,
  };
}
