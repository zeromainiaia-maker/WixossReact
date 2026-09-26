import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { activatedEnergyCostStr, pickCpuDiscardCostIndices, pickCpuEnergyTrashIndices, pickCpuFieldTrashZones, pickCpuTrashArtsNums, pickCpuTrashExileIndices, selectEnergyIndicesForCost, type CpuEnergyReserve } from './cpuActivate';
import { getCardNum } from '../../engine/execUtils';
import type { CpuPolicy } from './cpuPolicy';
import { applyNextLrigActCostReduction, type WholeEnergyCostSubstituteOption } from './costs';
import {
  collectGrantedLrigEffects, listActivatableGrantedLrigEffects,
  listActivatableInheritedLrigEffects, listActivatableLrigEffects,
} from './lrigActivateGate';
import { cpuUseWindowOf, planAllowsUseIn, type CpuDeckPlan } from './cpuDeckPlan';

/**
 * CPU がセンタールリグの【起】を能動使用するための選択ロジック（§8／§6.4 `O-1` (c)）。
 *
 * ■ 設計（`cpuActivate.ts` と同じ規律）
 *   - **「撃てるか」の判定は `lrigActivateGate`（人間のボタン生成と同じ関数）**。ここは
 *     「撃てるもののうち **CPU が支払い内訳を自動で決められる**ものを1つ選ぶ」だけを担う。
 *   - 実行は `performLrigActivated`（人間の【起】実行と同じ関数）。**CPU 専用の実行経路は作らない**。
 *
 * ■ 収集源は3つ（🆕2026-08-18・§6.4 O-1 (f) で②③を追加）
 *   ①センタールリグ本来の【起】 ②付与された【起】（`GRANT_LRIG_ABILITY` ほか）
 *   ③ルリグトラッシュからの継承（`INHERIT_LRIG_TRASH_ABILITIES`）。
 *   **どれも `lrigActivateGate` の list 関数を通す**＝可否判定は人間のボタン生成と同じ1本。
 *   ⚠優先度は①→②→③の固定順（盤面評価はしない）。
 *
 * ■ v1 の意図的な限界（honest defer）
 *   - **支払い内訳を人間が選ぶコストは撃たない**（下の allowlist）。
 *   - **同じ効果はCPUターンに1回まで**（`cpu_activated_effect_ids_this_turn`＝シグニ【起】と共通の台帳）。
 *   - 優先度は**効果定義順の決定論**（盤面評価はしない）。
 */

/**
 * CPU が**支払い内訳を自動で決められる**ルリグ【起】のコストキー。
 *
 * ⚠**allowlist（載っていないキーがあれば撃たない）**にすること。
 * ⚠ここに載せてよいのは **`performLrigActivated` が実際に払うキーだけ**＝
 *   宣言だけして踏み倒す側へ倒さない（`performArts` の allowlist と同じ理由）。
 *   `handDiscardSigni`／`discardGroups`／`trashExile` は**人間がモーダルで index を選ぶ**ので載せない。
 */
export const CPU_LRIG_AUTO_PAYABLE_COST_KEYS: ReadonlySet<keyof EffectCost> = new Set<keyof EffectCost>([
  'energy',              // selectEnergyIndicesForCost が index を決める
  'none',                // コストなしの任意効果
  'exceed',              // センター→アシストの順で自動（gate が枚数を検算している）
  'coin',                // 所持枚数の比較だけ（gate が検算・実行側が deduct）
  'down_self',           // このルリグをダウン（自動）
  'lrigDown',            // payLrigDownCost（自動）
  'discardAll',          // 手札をすべて（選択不要）
  'energyTrashAll',      // エナをすべて（選択不要）
  'energyTrashColorAll', // 指定色をすべて（選択不要）
  'charmTrash',          // 自分の場のチャームを先頭から自動
  'exileLrigFromLrigDeck', // ルリグデッキから自動（gate が枚数を検算している）
  'collab',              // ライバートークンN個（gate が所持数を検算・実行側が deduct）＝§5.3 `O-292`
  // 🆕§5.7 `S-31` ② 第2段（2026-09-21）＝**手札を捨てる／エナから落とす**（index は下で決める）。
  //   📏実測＝ルリグの【起】571効果のうち `handDiscardSigni` 20／`discard` 8／`energyTrash` 15。
  //   ⚠**`performLrigActivated` が受け取る口がある**ものだけ
  //     （⚠第2段の時点では「`fieldTrash` は口が無い」と書いたが**誤り**＝口は `sel.fieldBanishZones` に在った。
  //      第3段で下の allowlist へ移した）。
  'discard',
  'discardFilter',
  'handDiscardSigni',
  'energyTrash',
  // 🆕§5.7 `S-31` ② 第3段（2026-09-21）＝**場から払う／相手の印を外す／デッキを削るコスト**。
  //   🔴**載せてよい理由は1つずつ違う**（規律＝「gate が検算し、`performLrigActivated` が実際に払う」）＝
  //     `fieldTrash`／`fieldBanish`＝gate が `fieldTrashSelectableZones`／ゾーンは `pickCpuFieldTrashZones`
  //       （**第2段では「実行側に口が無い」と書いたが、口は `sel.fieldBanishZones` に在った**＝
  //        欠けていたのは CPU 側の選択だけだった）。
  //     `removeOppVirus`＝**この回に `lrigActivateGate` へ検算を足した**（`charmTrash` も同じ）。
  //     `exceedColors`＝gate が `exceedColorsSatisfied`／**支払いは `exceedIndices` 省略＝自動**（色を貪欲に満たす）。
  //     `deckTrash`＝**この回に支払い（`payDeckTrashCost`）を新設した**。
  //   📏実測＝ルリグの【起】567効果のうち `fieldTrash` 8／`exceedColors` 3／`deckTrash` 3／
  //     `fieldBanish` 1／`removeOppVirus` 1。
  'fieldTrash',
  'fieldBanish',
  'removeOppVirus',
  'exceedColors',
  'deckTrash',
  // 🆕§5.7 `S-31` ② 第4段（2026-09-21）＝**この回に支払いを新設したキー**（どちらも旧は踏み倒せた）。
  //   `fieldToLrigTrash`＝場のレゾナ等をルリグトラッシュへ（ゾーンは `pickCpuFieldTrashZones`）。
  //   `trashArtsFromLrigDeck`＝ルリグデッキのアーツを徴収（どれを捨てるかは `pickCpuTrashArtsNums`）。
  'fieldToLrigTrash',
  'trashArtsFromLrigDeck',
  // 🆕§5.7 `S-31` ② 第5段（2026-09-22）＝**この回に支払いを新設したキー**（どちらも旧は踏み倒せた）。
  //   `fieldDown`＝アップ状態の該当シグニをN体ダウン（自動・`fieldDownCost.ts` の funnel）。
  //   `life_crash`＝自分のライフクロスをNクラッシュ（自動・`payLifeOnPlayCost`／gate が枚数を検算）。
  'fieldDown',
  'life_crash',
  // 🆕§5.7 `S-31` ② 第6段（2026-09-22）＝**残りは「CPU に選ばせる判断」だけだった**キー群。
  //   `discardGroups`＝手札から組で捨てる（`pickCpuDiscardCostIndices`）。
  //   `trashExile`＝トラッシュから除外（`pickCpuTrashExileIndices`）。
  //   `beat_signi`＝**支払い側が自動で選ぶ**（この回に支払いと gate を足した）。
  //   `trapToHand`＝【トラップ】を手札へ（**左のゾーンから自動**＝裏向きなので選択UIが無い）。
  'discardGroups',
  'trashExile',
  'beat_signi',
  'trapToHand',
]);

/** この【起】のコストを CPU が自動で払いきれるか（払えないキーが1つでもあれば false）。 */
export function cpuCanAutoPayLrigCost(effect: CardEffect): boolean {
  const cost = effect.cost;
  if (!cost) return true;
  for (const key of Object.keys(cost) as (keyof EffectCost)[]) {
    if (cost[key] === undefined) continue;
    // `discardFilter` は `discard` の付随情報＝`discard` 側で弾かれる。
    if (key === 'discardFilter' && cost.discard === undefined) continue;
    if (!CPU_LRIG_AUTO_PAYABLE_COST_KEYS.has(key)) return false;
  }
  return true;
}

export interface CpuLrigActivatedChoice {
  effect: CardEffect;
  /** `performLrigActivated` に渡すエナ pool index。 */
  costIndices: Set<number>;
  /** 🆕§5.7 `S-31` ② 第2段＝手札を捨てるコストの index（`discard` / `handDiscardSigni`）。 */
  handDiscardIndices: Set<number>;
  /** 🆕§5.7 `S-31` ② 第2段＝エナから落とす index（`energyTrash`）。 */
  energyTrashIndices: Set<number>;
  /**
   * 🆕§5.7 `S-31` ② 第3段＝場から払うコストで選んだゾーン（`performLrigActivated` の `fieldBanishZones`）。
   * ⚠**`fieldTrash` と `fieldBanish` の共用**＝行き先（トラッシュ／エナ）は実行側が決める。
   */
  fieldBanishZones: Set<number>;
  /** 🆕§5.7 `S-31` ② 第4段＝`trashArtsFromLrigDeck` で捨てるアーツ（ルリグデッキの cardNum）。 */
  trashArtsNums: string[];
  /** 🆕§5.7 `S-31` ② 第6段＝トラッシュから除外する index（`trashExile`）。 */
  trashExileIndices: Set<number>;
}

/**
 * CPU がいま撃つルリグ【起】を1つ選ぶ（無ければ `null`）。**1回の呼び出しで1つだけ**＝
 * 実行後はスタック解決を待って CPU ループが再入する。
 */
export interface CpuLrigActivatedPickInput {
  actor: PlayerState;
  opponent: PlayerState;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  cards: CardData[];
  phase: 'MAIN' | 'ATTACK_ARTS';
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  energyPoolNums: string[];
  /** `calcContinuousBlockedActions(actor, ...).forSelf`。 */
  blockedSelf: Set<string>;
  /** このターン CPU が既に撃った effectId（シグニ【起】と共通の台帳）。 */
  alreadyActivated: readonly string[];
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  wholeSubstitutes?: readonly WholeEnergyCostSubstituteOption[];
  effectivePowers?: Map<string, number>;
  /** 🆕グロウ用エナの予約（`cpuGrowReserve.ts`）。 */
  energyReserve?: CpuEnergyReserve;
  /** 🆕§5.7 `S-31` ② 第2段＝手札を捨てるコストで「手元に残す価値」を見る（作戦データ）。 */
  planKeepBonus?: (id: string) => number;
  /** 🆕§5.7 `S-31` ② 第2段＝捨てる／落とす順の重み（席ごとのポリシー）。 */
  policy?: CpuPolicy;
  /**
   * 🆕§5.7 `S-31` ③＝デッキの作戦データ。使うのは **「使わない」の指定（`never`）だけ**。省略可。
   */
  plan?: CpuDeckPlan;
}

/** 🆕§5.7 `S-15`＝いま撃てるルリグ【起】を全部（①本来→②付与→③継承の順・遅延評価）。`pickCpuLrigActivated` は先頭を取るだけ。 */
export function* iterCpuLrigActivated(p: CpuLrigActivatedPickInput): Generator<CpuLrigActivatedChoice> {
  const gateInput = {
    my: p.actor, op: p.opponent, phase: p.phase,
    effectsMap: p.effectsMap, cardMap: p.cardMap,
    blockedSelf: p.blockedSelf, effectivePowers: p.effectivePowers,
  };
  // ⚠CPU の【起】は**自分のターン**でしか撃たない（呼び出し元が MAIN/ATTACK_ARTS 窓でだけ呼ぶ）＝
  //   付与の収集に渡す `isMyTurn` は常に true。
  const granted = collectGrantedLrigEffects(p.actor, p.opponent, true, p.effectsMap, p.cardMap);
  const usable = [
    ...listActivatableLrigEffects(gateInput),
    ...listActivatableGrantedLrigEffects(gateInput, granted),
    ...listActivatableInheritedLrigEffects(gateInput),
  ];
  // 🆕§5.7 `S-31` ③＝作戦データが「使わない」と書いたルリグの【起】は撃たない
  //   （⚠**判定はセンタールリグの札**＝付与・継承の効果もその札の【起】として出る）。
  const centerLrig = p.actor.field.lrig.at(-1);
  if (centerLrig && !planAllowsUseIn(p.plan, centerLrig, cpuUseWindowOf(p.phase))) return;
  for (const effect of usable) {
    if (p.alreadyActivated.includes(effect.effectId)) continue;
    if (!cpuCanAutoPayLrigCost(effect)) continue;
    const costIndices = selectEnergyIndicesForCost({
      poolNums: p.energyPoolNums, cards: p.cards,
      // 🆕§5.3 `O-259` 第7バッチ＝人間（`LrigGrantedModal`）と**同じ関数**で軽減を掛ける
      //   （写経すると「人間だけ安い」片肺になる）。
      costStr: applyNextLrigActCostReduction(activatedEnergyCostStr(effect), p.actor.next_lrig_act_cost_reduction),
      isAffordable: p.isAffordable,
      wholeSubstitutes: p.wholeSubstitutes,
      reserve: p.energyReserve,
    });
    if (!costIndices) continue;
    // 🆕§5.7 `S-31` ② 第2段＝手札を捨てる／エナから落とすコスト（**選び方は場のシグニ【起】と同じ関数**）。
    const handDiscardIndices = pickCpuDiscardCostIndices({
      hand: p.actor.hand, cost: effect.cost, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], keepBonus: p.planKeepBonus, policy: p.policy,
    });
    if (!handDiscardIndices) continue;
    const energyTrashIndices = pickCpuEnergyTrashIndices({
      energy: p.actor.energy, cost: effect.cost, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], policy: p.policy, reserve: p.energyReserve,
    });
    if (!energyTrashIndices) continue;
    // 🆕§5.7 `S-31` ② 第3段＝場から払うコスト（**選び方は場のシグニ【起】と同じ関数**）。
    //   ⚠発生源はルリグなので `excludeSelf`（効果元シグニを除く）は効かない＝`sourceZone` は渡さない。
    const fieldBanishZones = pickCpuFieldTrashZones({
      effect, actor: p.actor, sourceZone: null, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
    });
    if (!fieldBanishZones) continue;
    // 🆕§5.7 `S-31` ② 第4段＝ルリグデッキのアーツ徴収（払えないなら候補から外す）。
    const trashArtsNums = pickCpuTrashArtsNums({
      effect, actor: p.actor, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
    });
    if (!trashArtsNums) continue;
    // 🆕§5.7 `S-31` ② 第6段＝トラッシュから除外するコスト（**選び方は場のシグニ【起】と同じ関数**）。
    const trashExileIndices = pickCpuTrashExileIndices({
      trash: p.actor.trash, cost: effect.cost, cardMap: p.cardMap,
      effectsOf: id => p.effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
    });
    if (!trashExileIndices) continue;
    yield { effect, costIndices, handDiscardIndices, energyTrashIndices, fieldBanishZones, trashArtsNums, trashExileIndices };
  }
}

export function listCpuLrigActivated(p: CpuLrigActivatedPickInput): CpuLrigActivatedChoice[] {
  return [...iterCpuLrigActivated(p)];
}

export function pickCpuLrigActivated(p: CpuLrigActivatedPickInput): CpuLrigActivatedChoice | null {
  return iterCpuLrigActivated(p).next().value ?? null;
}
