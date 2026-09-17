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
   * **効果でレベルが上がってセンタールリグのレベルを超えた**シグニのゾーン（`R-48`）＝**選択の余地なく**トラッシュ。
   * ⚠印字レベルのまま超過している盤面は含めない（＝配置制限が止める状態）。詳細は `planLimitExcess` の 🔑。
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
 * 🔑**「シグニのレベル ≦ センタールリグのレベル」の読み（2026-09-17 ユーザー裁定・RULES.md `R-48`）**＝
 *   **①基本は「配置制限」**（＝置くときのゲート。`levelOk`／`SigniSummonZoneModal`）
 *   **②レベルが「変動」して超過したら、そのシグニはトラッシュに置かれる**（ルール処理）。
 *   ⇒ `levelOverZones` は **`実効レベル > センターのレベル` かつ `実効レベル > 印字レベル`** のゾーンだけ＝
 *     「効果でレベルが上がって超えた」ものに限る（例＝`WX20-Re18`「このシグニのレベルはあなたのエナゾーンに
 *     あるカード５枚につき＋１される」）。
 *   🔴**印字レベルのまま超過している盤面は落とさない**＝それは①の配置制限が止める状態であって、
 *     ルール処理で掃除する対象ではない（実機シナリオが注入する illegal な盤面もここに入る）。
 *   ⚠**未対応＝ルリグ側のレベル低下**（`SP38-005`＝「対戦相手のルリグ1体…それのレベルを－1する」）で生じる超過。
 *     いまの実効レベル読みが `attack_phase_level_overrides`（相手 state に載る）を見ないため。RULES.md `R-48` の残件。
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
  /** 印字レベル（＝配置ゲートが見た値）。実効レベルとの差が「レベルが変動した」の判定材料。 */
  const printedLevels = new Map<number, number>();
  for (const [zi, stack] of owner.field.signi.entries()) {
    const top = stack?.at(-1);
    if (!top) continue;
    const card = cardMap.get(top) ?? cardMap.get(baseNum(top));
    // 🔑**配置ゲートと同じ式で数える**＝ズレると「置けたのにルール処理が落とす」形の理不尽になる。
    //   宣言名のレベル0上書き（§5.3 `O-226`）は `calcSigniLevels` が知らないのでここで重ねる。
    if (declaredSigniOverride(owner, card?.CardName).levelZero) { levels.set(zi, 0); printedLevels.set(zi, 0); continue; }
    const printed = parseInt(card?.Level ?? '', 10);
    const printedLv = Number.isFinite(printed) ? printed : 0;
    printedLevels.set(zi, printedLv);
    levels.set(zi, signiLevels.get(top) ?? printedLv);
  }
  const levelOverZones = [...levels.entries()]
    .filter(([zi, lv]) => lv > centerLevel && lv > (printedLevels.get(zi) ?? lv))
    .map(([zi]) => zi);
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
  let excluded = [...(state.excluded ?? [])];
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
    else if (resonaDest === 'exile') excluded = [...excluded, top];   // `R-45b`＝クラフトは除外
    else trash = [...trash, top];
    trash = [...trash, ...stack.slice(0, -1)];
    signi[zi] = null;
    const cleaned = clearZoneOnSigniLeave(field, zi);
    field = cleaned.field;
    trash = [...trash, ...cleaned.trash];
    lrigTrash = [...lrigTrash, ...cleaned.lrigTrash];
  }
  return {
    state: { ...state, field: { ...field, signi }, trash, lrig_trash: lrigTrash, lrig_deck: lrigDeck, excluded },
    trashedTops,
  };
}
