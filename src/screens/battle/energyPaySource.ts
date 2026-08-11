import type { CardData, PlayerState, TurnPhase } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';

/**
 * 「エナコストの支払い元」を1本にまとめる funnel（§6.4「エナ支払い元の一本化」）。
 *
 * ■ なぜ要るか
 *   支払いモーダル17本が `my.energy` を直接読み、候補生成（`my.energy.map(...)`）も
 *   控除（選んだ index を `my.energy` から除去）も各所に散っていた。
 *   「エナゾーン以外を支払い元にする」語彙（`UNDER_CARD_AS_ENERGY_COST`＝`WXDi-P10-041`）は
 *   **どのコスト支払い経路にも等しく効く**ので、半分だけ配線すると
 *   「アーツには使えるが【起】には使えない」という無言の不整合になる（census にも census:stubs にも出ない）。
 *
 * ■ 設計（後方互換の index 空間）
 *   `buildEnergyPayPool` が返す配列は **先頭 `my.energy.length` 件がエナゾーンそのもの・同じ順**。
 *   よって既存の `costIndices:Set<number>`（＝`my.energy` への index）はそのまま pool への index として通る。
 *   追加の支払い元は末尾に並ぶだけなので、**追加元が0件のとき pool は `my.energy` と完全に等価**。
 *
 * ■ 安全弁（PLAN §4 教訓 (m)「安全弁はコメントの規律ではなく関数の戻り値にする」）
 *   控除は `planEnergyPayment(...).applyTo(state)` で**サイトが state を組み立てた「あと」に**当てる。
 *   - サイトが `field` を自前で組み直しても、あとから当てるので**シグニの下からの支払いを取りこぼさない**。
 *   - `applyTo` を呼び忘れると**エナが1枚も減らない**＝「ただでアーツが撃てる」という
 *     即座に露見する壊れ方になる（＝無言の不整合にならない）。
 *   `scripts/goldenTest.ts` に「BattleScreen に `energy.filter((_, i) =>` 直控除が残っていない」
 *   ソース走査トリップワイヤを置いてある。
 */

/** エナコスト1枚ぶんの支払い元。`origin:'energy'` は従来どおりエナゾーン。 */
export type EnergyPayEntry =
  | { origin: 'energy'; cardNum: string; energyIndex: number }
  | {
      origin: 'under';
      cardNum: string;
      /** 支払い元シグニのゾーン番号（`field.signi` の index）。 */
      zone: number;
      /** そのスタック内の index（最上段＝シグニ本体は含まない）。 */
      underIndex: number;
      /** 支払い元シグニ（UI ラベル用）。 */
      hostCardNum: string;
    };

/** `UNDER_CARD_AS_ENERGY_COST` の宣言（live JSON に載せる。engine で原文を再パースしない）。 */
export const UNDER_CARD_AS_ENERGY_STUB_ID = 'UNDER_CARD_AS_ENERGY_COST';

const ATTACK_PHASES: TurnPhase[] = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'];

export interface EnergyPoolContext {
  turnPhase: TurnPhase;
  isMyTurn: boolean;
  effectsMap: Map<string, CardEffect[]>;
}

function getCardNum(instanceId: string): string {
  const hash = instanceId.indexOf('#');
  return hash > 0 ? instanceId.slice(0, hash) : instanceId;
}

/**
 * 「このシグニの下のカードをエナゾーンにあるかのように支払える」宣言を、
 * **印字＋付与2ストアの3軸**で走査する（`signiDamageGate.ts` と同じ走査軸）。
 * 印字だけを見る実装にすると、同じ文を付与するカードが増えた瞬間に無言で落ちる。
 */
function collectUnderCardEnergySources(
  my: PlayerState,
  ctx: EnergyPoolContext,
): { zone: number; hostCardNum: string; perTurnLimit: number }[] {
  const out: { zone: number; hostCardNum: string; perTurnLimit: number }[] = [];
  my.field.signi.forEach((stack, zone) => {
    const top = stack?.at(-1);
    if (!top) return;
    const num = getCardNum(top);
    const effects: CardEffect[] = [
      ...(ctx.effectsMap.get(num) ?? []),
      ...(my.granted_effects?.[num] ?? []),
      ...(my.granted_effects_until_opp_turn?.[num] ?? []),
    ];
    for (const eff of effects) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as StubAction | undefined;
      if (act?.type !== 'STUB' || act.id !== UNDER_CARD_AS_ENERGY_STUB_ID) continue;
      const spec = act.underCardAsEnergyCost;
      // 「あなたのアタックフェイズの間」＝自分のターンのアタックフェイズに限る。
      if (spec?.duringMyAttackPhase && !(ctx.isMyTurn && ATTACK_PHASES.includes(ctx.turnPhase))) continue;
      out.push({ zone, hostCardNum: num, perTurnLimit: spec?.perTurnLimit ?? Infinity });
      break;
    }
  });
  return out;
}

/** このターンに「エナゾーン外」から支払える残り枚数（上限宣言が無ければ Infinity）。 */
export function remainingOffZonePayments(my: PlayerState, perTurnLimit: number): number {
  if (!Number.isFinite(perTurnLimit)) return Infinity;
  return Math.max(0, perTurnLimit - (my.turn_off_zone_energy_paid_count ?? 0));
}

/**
 * 支払い元プール。**先頭 `my.energy.length` 件はエナゾーンそのもの**（index 空間の後方互換）。
 * 追加元が無ければエナゾーンだけの pool を返す＝従来と完全に同じ挙動。
 */
export function buildEnergyPayPool(my: PlayerState, ctx: EnergyPoolContext): EnergyPayEntry[] {
  const pool: EnergyPayEntry[] = my.energy.map((cardNum, energyIndex) => ({
    origin: 'energy' as const, cardNum, energyIndex,
  }));
  for (const src of collectUnderCardEnergySources(my, ctx)) {
    const remaining = remainingOffZonePayments(my, src.perTurnLimit);
    if (remaining <= 0) continue;
    const stack = my.field.signi[src.zone] ?? [];
    // 最上段（シグニ本体）は支払い元にならない。
    // ⚠**このターンの残り上限ぶんしか pool に載せない**＝1回の支払いで上限超過を選べない
    //   （「1ターンに3つまで」の enforcement を候補生成の1点に閉じ込める＝13本のモーダルの
    //     トグルに検算を撒かない）。副作用として残り2枚のとき下カード3枚のうち上2枚しか
    //     選べない（どれを払うかは選べない）＝過払いにはならない安全側の近似。
    stack.slice(0, -1).slice(0, Number.isFinite(remaining) ? remaining : undefined)
      .forEach((cardNum, underIndex) => {
        pool.push({ origin: 'under', cardNum, zone: src.zone, underIndex, hostCardNum: src.hostCardNum });
      });
  }
  return pool;
}

/** `canAffordGrowCost` / `canAffordWithExtraCost` に渡す「支払い元カード番号の列」。 */
export function energyPoolCardNums(pool: readonly EnergyPayEntry[]): string[] {
  return pool.map(e => e.cardNum);
}

/**
 * この pool から「エナゾーン外」を何枚まで払えるか（1ターン上限）。
 * UI 側の選択バリデーションはこれを見る（上限超過の選択を成立させない）。
 */
export function offZonePayLimit(my: PlayerState, ctx: EnergyPoolContext): number {
  const sources = collectUnderCardEnergySources(my, ctx);
  if (sources.length === 0) return 0;
  const limit = Math.min(...sources.map(s => s.perTurnLimit));
  return remainingOffZonePayments(my, limit);
}

/** 選択がエナゾーン外の1ターン上限に収まっているか。 */
export function energySelectionWithinOffZoneLimit(
  my: PlayerState,
  pool: readonly EnergyPayEntry[],
  selected: ReadonlySet<number>,
  ctx: EnergyPoolContext,
): boolean {
  const offZone = [...selected].filter(i => pool[i]?.origin === 'under').length;
  return offZone === 0 || offZone <= offZonePayLimit(my, ctx);
}

export interface EnergyPaymentPlan {
  /** 色エナコストとして支払ったカード（＝トラッシュ行き。従来の `paidNums` と同じ並び）。 */
  paidNums: string[];
  /**
   * `alsoRemoveEnergyIndices` で追加控除したエナゾーンのカード（`energyTrash` コスト等）。
   * ⚠色コストで既に払った index は**除いてある**＝トラッシュへ二重に積まれない
   * （UI 上は別セレクタなので通常は素通り。重なったときだけ効く安全側の規則）。
   */
  extraEnergyNums: string[];
  /** 控除後のエナゾーン（`energyTrashAll` の対象算出など**読み取り専用**の用途に使う）。 */
  energyAfter: string[];
  /** エナゾーン**外**から支払った枚数（1ターン上限の記録用）。 */
  offZonePaidCount: number;
  /**
   * サイトが組み立てた state に控除を当てる（エナゾーン／シグニの下／ターン計数）。
   * ⚠**必ずサイトの state 組み立ての「あと」に呼ぶ**＝`field` を自前で組み直しても取りこぼさない。
   * 呼び忘れるとエナが1枚も減らない＝即座に露見する。
   */
  applyTo(state: PlayerState): PlayerState;
}

/**
 * 支払い計画を作る。`costIndices` は **pool への index**（＝従来どおりエナゾーン index の上位互換）。
 * `alsoRemoveEnergyIndices` は同じ支払いで一緒に控除する**エナゾーン専用**の index
 * （`energyTrash` コスト等。エナゾーン外は対象にならないので pool ではなく `my.energy` の index）。
 */
export function planEnergyPayment(
  my: PlayerState,
  pool: readonly EnergyPayEntry[],
  costIndices: ReadonlySet<number>,
  alsoRemoveEnergyIndices: ReadonlySet<number> = new Set(),
): EnergyPaymentPlan {
  const picked = [...costIndices].map(i => pool[i]).filter((e): e is EnergyPayEntry => e != null);
  const paidNums = picked.map(e => e.cardNum);
  const energyIdxFromCost = new Set(
    picked.filter((e): e is Extract<EnergyPayEntry, { origin: 'energy' }> => e.origin === 'energy')
      .map(e => e.energyIndex));
  const removedEnergyIdx = new Set([...energyIdxFromCost, ...alsoRemoveEnergyIndices]);
  const extraEnergyNums = [...alsoRemoveEnergyIndices]
    .filter(i => !energyIdxFromCost.has(i)).map(i => my.energy[i]).filter(Boolean);
  const energyAfter = my.energy.filter((_, i) => !removedEnergyIdx.has(i));
  const underPicked = picked.filter((e): e is Extract<EnergyPayEntry, { origin: 'under' }> => e.origin === 'under');
  const underKeys = new Set(underPicked.map(e => `${e.zone}:${e.underIndex}`));

  return {
    paidNums,
    extraEnergyNums,
    energyAfter,
    offZonePaidCount: underPicked.length,
    applyTo(state: PlayerState): PlayerState {
      const energy = state.energy.filter((_, i) => !removedEnergyIdx.has(i));
      if (underKeys.size === 0) return { ...state, energy };
      const signi = state.field.signi.map((stack, zone) => {
        if (!stack) return stack;
        // 最上段（シグニ本体）は絶対に落とさない。
        return stack.filter((_, index) => index === stack.length - 1 || !underKeys.has(`${zone}:${index}`));
      }) as (string[] | null)[];
      return {
        ...state,
        energy,
        field: { ...state.field, signi },
        turn_off_zone_energy_paid_count: (state.turn_off_zone_energy_paid_count ?? 0) + underPicked.length,
      };
    },
  };
}

/** UI の候補表示ラベル（エナゾーン以外は「〈シグニ名〉の下」と出す）。 */
export function energyPayEntryLabel(
  entry: EnergyPayEntry,
  cardMap: Map<string, CardData>,
): string | null {
  if (entry.origin === 'energy') return null;
  const host = cardMap.get(entry.hostCardNum);
  return `${host?.CardName ?? entry.hostCardNum}の下`;
}
