import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { canAddEnergyTrashIndex, canAddHandDiscardSigniIndex, canAddTrashExileIndex, energyCostToString, energyTrashCostSatisfied, handDiscardSigniCostSatisfied, parseGrowCost, trashExileCostSatisfied, type WholeEnergyCostSubstituteOption } from './costs';
import { fieldTrashGroupsSatisfied, fieldTrashGroupsSelectableZones, fieldTrashSelectableZones } from './fieldLimit';
import { trashArtsFromLrigDeckCandidates } from './artsTrashCost';
import { isImmovableArtsFromLrigDeck } from '../../engine/execUtils';
import { payUnderAnySigniTrash, payUnderSelfTrash, underAnySigniCostCandidates, underSelfCostCandidates, type UnderAnySigniCandidate } from './underAnySigniCost';
import { cardStrength } from './cpuCardStrength';
import { reserveKeptAfterPaying } from './cpuGrowReserve';
import { canSatisfyDiscardGroups, getCardNum, matchesFilter } from '../../engine/execUtils';
import { cpuHandDiscardOrder } from './cpuHandLimit';
import type { CpuPolicy } from './cpuPolicy';
import { listActivatableSigniEffects } from './signiActivateGate';
import { activateCostZeroApplies, applyActivateCostZero } from './activateCostZero';
import { cpuUseWindowOf, planAllowsUseIn, type CpuDeckPlan } from './cpuDeckPlan';

/**
 * CPU が場のシグニの【起】を能動使用するための選択ロジック（§8／§6.4 `O-1`）。
 * 窓は**メインフェイズ**と**自分のアタックフェイズ（アーツステップ）**の2つ。
 *
 * ■ 設計
 *   - **「撃てるか」の判定は `signiActivateGate`（人間のボタン生成と同じ関数）**。ここは
 *     「撃てるもののうち **CPU が支払い内訳を自動で決められる**ものを1つ選ぶ」だけを担う。
 *   - 実行は `performSigniActivated`（人間の【起】実行と同じ関数）。**CPU 専用の実行経路は作らない**
 *     （DESIGN §4「CPU は対人戦と同じ処理を使う」）。
 *
 * ■ v1 の意図的な限界（honest defer・広げるときは §7 の実機検証とセットで）
 *   - **支払い内訳を人間が選ぶコストは撃たない**（下の allowlist）。手札の何を捨てるか・場の
 *     どのシグニをトラッシュするかは**盤面評価が要る判断**で、雑に先頭から取ると
 *     「CPU が自分の場を壊す」型の悪手になる。撃たない＝現状（何もしない）と同じで安全側。
 *   - **同じ効果はCPUターンに1回まで**（`cpu_activated_effect_ids_this_turn`・2窓で共通の台帳）。コストの
 *     表現が落ちている効果（`cost` が空になっている parse 事故）を撃つと**無限ループ**になるため、
 *     `usageLimit` に頼らず選択側で必ず止める。⚠この上限を外すときは先にループ試験をすること。
 *   - 優先度は**ゾーン順→効果定義順の決定論**（盤面評価はしない）。CPU の対象選択が
 *     ランダムなのと同じ近似で、「強い順に撃つ」は別バッチ（§8）。
 *   - **`pickCpuMainPhaseActivated` から改名**（2026-08-18 続き552c）＝窓が2つになったため。
 */

/**
 * CPU が**支払い内訳を自動で決められる**コストキー。
 *
 * ⚠**allowlist（載っていないキーがあれば撃たない）**にすること。denylist にすると
 * 新しいコストキーが増えたときに **CPU が黙って踏み倒す**側に倒れる。
 * ここに載っているのは「`performSigniActivated` が自動で支払う」か「エナのように
 * `selectEnergyIndicesForCost` が内訳を決められる」もののみ。
 */
export const CPU_AUTO_PAYABLE_COST_KEYS: ReadonlySet<keyof EffectCost> = new Set<keyof EffectCost>([
  'energy',        // selectEnergyIndicesForCost が index を決める
  'coin',          // 所持枚数の比較だけ
  'none',          // コストなしの任意効果
  'down_self',     // 効果元をダウン（自動）
  'trash_self',    // 効果元を場からトラッシュ（自動）
  'fieldExileSelf',// 効果元を場からゲームから除外（自動）
  'bounceSelf',    // 効果元を場から手札へ（自動・§5.3 `O-167`）
  'trash_key',     // キーをルリグトラッシュ（自動）
  'fieldDown',     // 該当ゾーンを順にダウン（自動）
  'lrigDown',      // payLrigDownCost（センター→アシストの順・自動）
  'acceTrash',     // 先頭ゾーンから自動（`signiActivateGate` が枚数を検算している）
  'discardAll',    // 手札をすべて（選択不要）
  'energyTrashAll',// エナをすべて（選択不要）
  // 🆕§5.7 `S-31` ②（2026-09-21）＝**手札を捨てるコスト**（`pickCpuDiscardCostIndices` が index を決める）。
  //   🔴**載せてよい理由**＝`signiActivateGate` が**枚数も中身も検算している**
  //   （`discard` は手札枚数／`handDiscardSigni` は `handDiscardSigniAffordable`）＝下の
  //   「gate が数を検算していないキーは載せない」規律を満たす。
  //   📏実測＝`handDiscardSigni` 63効果/60枚・`discard` 62効果/62枚（live の ACTIVATED 2,632効果中）。
  'discard',
  'discardFilter',
  'handDiscardSigni',
  // 🆕§5.7 `S-31` ② 第2段（2026-09-21）＝**エナ・場から払うコスト**（`pickCpuEnergyTrashIndices` /
  //   `pickCpuFieldTrashZones` が index を決める）。🔴**どちらも `signiActivateGate` が枚数と中身を検算済み**
  //   （`energyTrashCostSatisfied` ／ `fieldTrashSelectableZones`）。
  //   📏実測＝場のシグニの【起】738効果のうち `energyTrash` 37／`fieldTrash` 23。
  'energyTrash',
  'fieldTrash',
  // 🆕§5.7 `S-31` ② 第3段（2026-09-21）＝**自分の盤面から払うコスト**。
  //   🔴**載せてよい理由は1つずつ違う**（allowlist の規律＝「gate が検算し、perform が実際に払う」）＝
  //     `underSelfTrash`＝gate が `canPayUnderSelfTrash`／index は `pickCpuUnderSelfTrashKeys` が決める。
  //     `fieldBanish`／`fieldToDeckTop`＝gate が `fieldTrashSelectableZones`／ゾーンは `pickCpuFieldTrashZones`。
  //     `charmTrash`／`removeOppVirus`＝**この回に `signiActivateGate` へ検算を足した**（`costs.ts` の2本）。
  //     `selfPowerDown`＝自傷なので常に払える（`perform` が `temp_power_mods` に積む）。
  //     `deckTrash`＝**この回に支払い（`payDeckTrashCost`）を新設した**（旧は誰も払っていなかった）。
  //   📏実測＝場のシグニの【起】697効果のうち `underSelfTrash` 13／`charmTrash` 5／`selfPowerDown` 3／
  //     `removeOppVirus` 3／`deckTrash` 4／`fieldBanish` 1／`fieldToDeckTop` 1。
  'underSelfTrash',
  'fieldBanish',
  'fieldToDeckTop',
  'charmTrash',
  'removeOppVirus',
  'selfPowerDown',
  'deckTrash',
  // 🆕§5.7 `S-31` ② 第4段（2026-09-21）＝**この回に支払いを新設したキー**。
  //   `selfToDeckBottom`＝効果元を場からデッキの一番下へ（自動／`trash_self` の兄弟）。
  //   `chargeCounterRemove`＝効果元の上の【貯菌】をN個取り除く（自動／**この回に提示の検算も足した**）。
  'selfToDeckBottom',
  'chargeCounterRemove',
  // 🆕§5.7 `S-31` ② 第5段（2026-09-22）＝**この回に支払いを新設したキー**。
  //   `underAnySigniTrash`＝全シグニの下から（キーは `pickCpuUnderSelfTrashKeys` が決める）。
  //   `exceed`＝ルリグの下から自動（gate が `canPayExceed` で色まで検算）。
  //   `multiZoneExile`＝手札・エナ・トラッシュから1枚ずつ（**自動選択**＝`filter` は cardName 一意）。
  //   `fieldDown`＝支払い funnel（`fieldDownCost.ts`）を新設して両経路で共用した。
  //   `costSubstitute`＝**支払いの代替手段の宣言**（「《青》の代わりに手札を捨ててもよい」）＝
  //     🔑CPU は**代替を使わず素のコストを払う**ので、載せてよい（踏み倒しにならない）。
  'underAnySigniTrash',
  'exceed',
  'multiZoneExile',
  'costSubstitute',
  // 🆕§5.7 `S-31` ② 第6段（2026-09-22）＝**残りは「CPU に選ばせる判断」だけだった**キー群。
  //   `discardGroups`／`discardVariable`／`discardUpTo`／`handBottomDeck`＝手札から選ぶ（`pickCpuDiscardCostIndices` が1本で決める）。
  //   `trashExile`＝トラッシュから選ぶ（`pickCpuTrashExileIndices`）。
  //   `fieldTrashGroups`＝場から組で選ぶ（`pickCpuFieldTrashZones`）。
  //   `beat_signi`＝**支払い側が自動で選ぶ**（`payBeatSigniCost` のレベル昇順）＝この回に gate を同じ解析へ揃えた。
  //   `charmTrashVariable`＝可変枚数は**最低枚数だけ**払う（`charmTrashVarCount` は CPU 経路では 0 なので下で渡す）。
  'discardGroups',
  'discardVariable',
  'discardUpTo',
  'handBottomDeck',
  'trashExile',
  'fieldTrashGroups',
  'beat_signi',
  'charmTrashVariable',
]);

/**
 * 🆕**`charmTrash` / `removeOppVirus` は 2026-09-21（§5.7 `S-31` ② 第3段）に載せた**＝
 * それまで載せられなかったのは **`signiActivateGate` が数を検算していなかった**ためで、提示だけ通ると
 * `performSigniActivated` が支払い不能で**何も書かずに return** し、CPU が同じ効果を選び直して
 * **無限ループ**になる形だった。⇒ **gate 側へ検算（`charmTrashAffordable` / `removeOppVirusAffordable`）を
 * 足してから**載せている。**新しいキーを載せるときも順番は同じ**（先に検算、あとで allowlist）。
 * （下の `pickCpuSigniActivated` を使う側にも、実行前に履歴を確定させる安全弁を置いてある。）
 */

/** この【起】のコストを CPU が自動で払いきれるか（払えないキーが1つでもあれば false）。 */
export function cpuCanAutoPayActivatedCost(effect: CardEffect, actor: PlayerState, cardNum: string): boolean {
  const cost = effect.cost;
  if (!cost) return true;
  for (const key of Object.keys(cost) as (keyof EffectCost)[]) {
    if (cost[key] === undefined) continue;
    // 🆕§5.7 `S-31` ② 第6段＝`trashExile` は**どちらの形も払える**（`.self` は自動／
    //   それ以外は `pickCpuTrashExileIndices` が index を決める＝gate が集合制約まで検算済み）。
    // `discardFilter` は `discard` の付随情報＝`discard` 側で弾かれる。
    if (key === 'discardFilter' && cost.discard === undefined) continue;
    if (!CPU_AUTO_PAYABLE_COST_KEYS.has(key)) return false;
  }
  // 《コインアイコン》は所持枚数で判定（`signiActivateGate` は提示の判定だけでコインを見ない）。
  const coinCost = activateCostZeroApplies(actor, cardNum) ? 0 : (cost.coin ?? 0);
  if (coinCost > 0 && (actor.coins ?? 0) < coinCost) return false;
  // removeOppVirus は相手盤面が要るので、ここでは「宣言があれば実行側が検算する」に委ねる
  // （足りなければ `performSigniActivated` が支払い不能で return する＝無害）。
  return true;
}

/** 【起】の `cost.energy` を、支払いモーダルと同じコスト文字列表現へ直す。 */
export function activatedEnergyCostStr(effect: CardEffect): string {
  return energyCostToString(effect.cost?.energy ?? []);
}

/**
 * エナコストを払う pool index の組を1つ決める（決定論）。払えないときは `null`。
 *
 * ⚠**可否の権威は呼び出し元が渡す `isAffordable`（＝人間UIと同じ `canAffordGrowCost`）**。
 * ここは候補の**並べ方**だけを決め、最後に必ず権威関数で検算する＝
 * マルチエナ・色代替・追加色といった例外はすべて権威側の実装1本に集約される
 * （2つ目の支払い判定を書かない＝続き546 教訓 (b) と同じ理由）。
 */
/**
 * 🆕**CPU がエナを払ったあとに残しておくべきもの**（2026-09-17・ユーザー指示「アーツなどでエナを使って、グロウ用のエナが無くなってグロウできなくなることは必ず避ける」）。
 * `selectEnergyIndicesForCost` に渡すと、選んだ支払いの**残り**で `keepsAfter` が成り立たない選び方を返さない（null＝その支払いはしない）。
 * 組み立ては `cpuGrowReserve.ts` の `buildCpuGrowReserve`（次のグロウ先の候補のどれかを残りで払えるか）。
 */
export interface CpuEnergyReserve {
  /** 払ったあとに残る pool の cardNum（pool index 順）で、予約を満たせるか。 */
  keepsAfter: (remainingNums: string[]) => boolean;
  /** 《無》の枠を埋めるときに**後回しにする色**（予約に要る色を先に使わない）。 */
  avoidColors: readonly string[];
  /**
   * 🆕2026-09-26＝**作戦データの「エナゾーンにある札の扱い」**（`cpuDeckPlan.planEnaPayRank`）＝小さいほど先に払う。
   * ⚠**並べ方だけ**（可否は変えない）。組み立ては `cpuGrowReserve.withEnaPayRank`。
   */
  payRank?: (num: string) => number;
}

export function selectEnergyIndicesForCost(p: {
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  poolNums: string[];
  cards: CardData[];
  costStr: string;
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  /** 一括代替候補を先に試す。可否そのものは `isAffordable` が決める。 */
  wholeSubstitutes?: readonly WholeEnergyCostSubstituteOption[];
  /** 一括代替後にも残る追加コストを、色優先の自動選択へ含める。 */
  extraCosts?: readonly { color: string; count: number }[];
  /** 🆕払ったあとに残すもの（グロウ用エナ）。満たせない支払いは null。 */
  reserve?: CpuEnergyReserve;
  /** 🆕支払いに使わない pool index（2026-09-22＝エナゾーンから【アクセ】にする札そのもの）。 */
  exclude?: ReadonlySet<number>;
  /** 🆕2026-09-26＝払う順位（小さいほど先）。省略時は `reserve.payRank`。どちらも無ければ pool の並び順。 */
  payRank?: (num: string) => number;
}): Set<number> | null {
  const { poolNums, cards, costStr, isAffordable } = p;
  const payRank = p.payRank ?? p.reserve?.payRank;
  const rankOf = (i: number) => (payRank ? payRank(poolNums[i]) : 0);
  /** 🆕pool index を払う順に（順位 → pool の並び）。順位が無ければ pool の並びそのもの＝旧挙動。 */
  const payOrder = poolNums.map((_, i) => i).sort((a, b) => rankOf(a) - rankOf(b) || a - b);
  if (costStr === '') return new Set();
  const colorOf = (num: string) => {
    const base = num.indexOf('#') > 0 ? num.slice(0, num.indexOf('#')) : num;
    return cards.find(c => c.CardNum === base)?.Color ?? '無';
  };
  const trySelection = (seed?: { index: number; option: WholeEnergyCostSubstituteOption }): Set<number> | null => {
    const selected = new Set<number>();
    if (seed) selected.add(seed.index);
    const isSat = () => isAffordable([...selected].map(i => poolNums[i]), costStr);
    if (isSat()) return selected;
    // ①コストに出てくる色を先に充当する（色指定を無色エナで潰さない）。
    // ⚠色の取り出しも `parseGrowCost`（人間の支払い判定と同じ解析器）を通す＝
    //   自前の regex を書くと《色》×N 以外の綴りで黙って空になる（続き551 に golden が検出した壊れ方）。
    const baseItems = parseGrowCost(costStr);
    const remainingBaseItems = baseItems.filter(item => {
      if (!seed || item.color !== seed.option.spec.color) return true;
      const replaceCount = baseItems
        .filter(base => base.color === seed.option.spec.color)
        .reduce((sum, base) => sum + base.count, 0);
      return !seed.option.spec.counts.includes(replaceCount);
    });
    // 一括代替が置き換えるのは `baseCost` の指定色だけ。使用時追加コストは必ず残す。
    const wanted = [...remainingBaseItems, ...(p.extraCosts ?? [])];
    for (const { color, count } of wanted) {
      if (color === '無') continue;
      for (let n = 0; n < count && !isSat(); n++) {
        const idx = payOrder.find(i => !selected.has(i) && !p.exclude?.has(i) && colorOf(poolNums[i]).includes(color));
        if (idx !== undefined) selected.add(idx); else break;
      }
    }
    // ②残りは先頭から足していく（《無》スロット・マルチエナでの充当はここで埋まる）。
    //   🆕予約があれば、予約に要る色のエナを後回しにする（グロウに要る色を《無》で潰さない）。
    const avoid = p.reserve?.avoidColors ?? [];
    //   🆕作戦データの「エナの扱い」は予約の次に効く（グロウできなくなるのは必ず避ける＝予約が先）。
    const fillOrder = poolNums.map((_, i) => i)
      .filter(i => !p.exclude?.has(i))
      .sort((a, b) => Number(avoid.some(c => colorOf(poolNums[a]).includes(c))) - Number(avoid.some(c => colorOf(poolNums[b]).includes(c)))
        || rankOf(a) - rankOf(b) || a - b);
    for (const i of fillOrder) { if (isSat()) break; selected.add(i); }
    if (!isSat()) return null;
    if (p.reserve && !p.reserve.keepsAfter(poolNums.filter((_, i) => !selected.has(i)))) return null;
    return selected;
  };

  // `O-342`＝通常の色優先より先に、適用可能な一括代替札を1枚選んだ経路を試す。
  // これが無いとエナの並び順によって CPU がオサキを選べず、提示だけ通って実行候補から消える。
  const baseItems = parseGrowCost(costStr);
  const tried = new Set<number>();
  for (const option of p.wholeSubstitutes ?? []) {
    const replaceCount = baseItems
      .filter(item => item.color === option.spec.color)
      .reduce((sum, item) => sum + item.count, 0);
    if (!option.spec.counts.includes(replaceCount)) continue;
    for (let index = 0; index < poolNums.length; index++) {
      if (tried.has(index) || p.exclude?.has(index) || !option.eligibleEnergyInstIds.has(poolNums[index])) continue;
      tried.add(index);
      const selected = trySelection({ index, option });
      if (selected) return selected;
    }
  }
  return trySelection();
}

export interface CpuActivatedChoice {
  zoneIndex: number;
  cardNum: string;
  effect: CardEffect;
  /** `performSigniActivated` に渡すエナ pool index。 */
  costIndices: Set<number>;
  /**
   * 🆕§5.7 `S-31` ②＝`performSigniActivated` に渡す**手札を捨てるコストの index**
   * （`discard` / `handDiscardSigni`）。コストが無ければ空。
   */
  discardIndices: Set<number>;
  /** 🆕§5.7 `S-31` ② 第2段＝エナから落とす index（`energyTrash`）。 */
  energyTrashIndices: Set<number>;
  /**
   * 🆕§5.7 `S-31` ② 第2段＝場から払うコストで選んだゾーン。
   * ⚠**`fieldTrash`／`fieldBanish`／`fieldToDeckTop` の3キー共用**（行き先は `performSigniActivated` が決める）。
   */
  fieldTrashZones: Set<number>;
  /** 🆕§5.7 `S-31` ② 第3段＝効果元の下から落とすカード（`underSelfTrash`・`"<ゾーン>:<添字>"`）。 */
  underTrashKeys: Set<string>;
  /** 🆕§5.7 `S-31` ② 第6段＝トラッシュから除外する index（`trashExile`。`.self` は空）。 */
  trashExileIndices: Set<number>;
}

/**
 * CPU がいま撃つ場のシグニ【起】を1つ選ぶ（無ければ `null`）。**1回の呼び出しで1つだけ**＝
 * 実行後はスタック解決を待って CPU ループが再入する（`cpuTurnAction` は
 * `effect_stack` があると走らないので、これで解決順が人間と同じになる）。
 *
 * ⚠**窓は2つ**＝`'MAIN'`（無印【起】）と `'ATTACK_ARTS'`（《アタックフェイズアイコン》付き【起】）。
 * 判定は同じ `signiActivateGate` の1本で、違うのは渡す `phase` だけ（§8 `O-1` (c)）。
 */
export interface CpuSigniActivatedPickInput {
  actor: PlayerState;
  opponent: PlayerState;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  cards: CardData[];
  /** `'MAIN'`＝無印【起】／`'ATTACK_ARTS'`＝《アタックフェイズアイコン》付き【起】。 */
  phase: 'MAIN' | 'ATTACK_ARTS';
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  energyPoolNums: string[];
  /** このターン CPU が既に撃った effectId（同じ効果を撃ち直さない）。 */
  alreadyActivated: readonly string[];
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  wholeSubstitutes?: readonly WholeEnergyCostSubstituteOption[];
  effectivePowers?: Map<string, number>;
  contBlockedSelf?: Set<string>;
  /** 🆕グロウ用エナの予約（`cpuGrowReserve.ts`）。 */
  energyReserve?: CpuEnergyReserve;
  /** 🆕§5.7 `S-31` ②＝手札を捨てるコストで「手元に残す価値」を見る（作戦データ＝`planKeepBonus`）。 */
  planKeepBonus?: (id: string) => number;
  /** 🆕§5.7 `S-31` ②＝捨てる順の重み（席ごとのポリシー）。 */
  policy?: CpuPolicy;
  /**
   * 🆕§5.7 `S-31` ③＝デッキの作戦データ。使うのは **「使わない」の指定（`never`）だけ**。省略可。
   */
  plan?: CpuDeckPlan;
}

/**
 * 🆕**手札を捨てるコストで、どれを捨てるか**（§5.7 `S-31` ②・2026-09-21）。
 *
 * 🔴**なぜ要るか（実測）**＝live の【起】2,632効果のうち **648（24.6%）/ 603枚**が
 *   「CPU が自動で払えないコスト」を含み、**そのうち手札を捨てる形が 125効果**（`handDiscardSigni` 63／`discard` 62）。
 *   ⚠**撃てないので `S-14` のコンボにも書けない**（`WD16` の `WX09-048` Ｆ・Ｍ・Ｓ がその実例）。
 * 🔑**順番は手札上限の捨て札と同じ1本**（`cpuHandDiscardOrder`＝弱い札から・【ガード】は最後・作戦データの加点つき）。
 * 🔑**1枚ずつの可否は人間のモーダルと同じ関数**＝`canAddHandDiscardSigniIndex`（集合制約「それぞれ名前の異なる」まで見る）／
 *   `discardFilter` は engine の `matchesFilter`。**写経すると「CPU だけ払えないはずの札で払える」片肺になる。**
 * @returns 払う index の集合。**払えないなら `null`**（＝その【起】は候補から外す）。
 */
export function pickCpuDiscardCostIndices(p: {
  hand: string[];
  cost: CardEffect['cost'];
  cardMap: Map<string, CardData>;
  effectsOf?: (id: string) => readonly CardEffect[];
  keepBonus?: (id: string) => number;
  policy?: CpuPolicy;
}): Set<number> | null {
  const spec = p.cost?.handDiscardSigni;
  // 🆕§5.7 `S-31` ② 第6段＝**手札から払う残り4キー**も同じ並び（弱い札から）で決める。
  //   `handBottomDeck`＝行き先がデッキの一番下（支払いは別 funnel・**選択 state は `discard` と共用**）。
  //   `discardVariable`／`discardUpTo`＝**枚数を決める判断**＝🔑**最低枚数だけ払う**
  //     （`discardUpTo` は0枚でも成立するので**0枚**＝手札を失わない。帰結が「捨てた枚数ぶん」の形は
  //      その帰結を評価できるようになってから増やす＝いまは過剰に払わない側へ倒す）。
  //   `discardGroups`＝**組を満たす割り当て**を探す（下で別に組む）。
  const plain = (p.cost?.discard ?? 0) + (p.cost?.handBottomDeck ?? 0)
    + (p.cost?.discardVariable?.min ?? 0);
  const groups = p.cost?.discardGroups;
  const picked = new Set<number>();
  if (!spec && plain <= 0 && !groups) return picked;
  const order = cpuHandDiscardOrder(p.hand, p.cardMap, p.effectsOf, p.keepBonus, p.policy);
  // 🆕**グループ指定**＝各グループの枠を、弱い札から順に埋める（`canSatisfyDiscardGroups` で最後に検算）。
  if (groups) {
    for (const g of groups) {
      let need = g.count;
      for (const i of order) {
        if (need <= 0) break;
        if (picked.has(i)) continue;
        if (g.filter && !matchesFilter(p.cardMap.get(getCardNum(p.hand[i])), g.filter)) continue;
        picked.add(i); need--;
      }
      if (need > 0) return null;
    }
    if (!canSatisfyDiscardGroups([...picked].map(i => p.cardMap.get(getCardNum(p.hand[i]))), groups)) return null;
  }
  // 🆕**可変枚数の絞り込み**＝`discardVariable` はフィルタに合う札からしか払えない。
  const variableFilter = p.cost?.discardVariable?.filter;
  if (spec) {
    for (const i of order) {
      if (picked.size >= spec.count) break;
      if (canAddHandDiscardSigniIndex(p.hand, picked, i, spec, p.cardMap)) picked.add(i);
    }
    if (!handDiscardSigniCostSatisfied(p.hand, picked, spec, p.cardMap)) return null;
  }
  if (plain > 0) {
    const filter = p.cost?.discardFilter ?? variableFilter;
    const need = picked.size + plain;
    for (const i of order) {
      if (picked.size >= need) break;
      if (picked.has(i)) continue;
      if (filter && !matchesFilter(p.cardMap.get(getCardNum(p.hand[i])), filter)) continue;
      picked.add(i);
    }
    if (picked.size < need) return null;
  }
  return picked;
}

/**
 * 🆕**トラッシュから除外するコストで、どれを除外するか**（`trashExile`・§5.7 `S-31` ② 第6段）。
 *
 * 🔑**1枚ずつの可否は人間の支払いUIと同じ関数**＝`canAddTrashExileIndex`（集合制約「それぞれ名前の異なる」まで）
 *   ＋最後に `trashExileCostSatisfied` で検算する。
 * ⚠**`.self`（効果元自身を除外）は選択が要らない**＝空集合を返す（支払い側が自分で動かす）。
 * ⚠**弱い札から**＝トラッシュは再利用の資源なので、強い札を残す（並びは盤面の札と同じ強さ表）。
 * @returns 除外するトラッシュの index。**払えないなら `null`**。
 */
export function pickCpuTrashExileIndices(p: {
  trash: string[];
  cost: CardEffect['cost'];
  cardMap: Map<string, CardData>;
  effectsOf?: (id: string) => readonly CardEffect[];
  policy?: CpuPolicy;
}): Set<number> | null {
  const spec = p.cost?.trashExile;
  if (!spec || spec.self) return new Set();
  const strength = (id: string) =>
    cardStrength(p.cardMap.get(getCardNum(id)), p.effectsOf?.(id) ?? [], 'deploy', undefined, p.policy);
  const order = p.trash.map((_, i) => i).sort((a, b) => strength(p.trash[a]) - strength(p.trash[b]) || a - b);
  const chosen = new Set<number>();
  for (const i of order) {
    if (chosen.size >= (spec.count ?? 1)) break;
    if (canAddTrashExileIndex(p.trash, chosen, i, spec, p.cardMap)) chosen.add(i);
  }
  return trashExileCostSatisfied(p.trash, chosen, spec, p.cardMap) ? chosen : null;
}

/**
 * 🆕**エナから払うコストで、どのエナを落とすか**（§5.7 `S-31` ② 第2段・2026-09-21）。
 * 🔑**1枚ずつの可否は人間の支払いUIと同じ関数**＝`canAddEnergyTrashIndex`（集合制約つき）＋`matchesFilter`（`spec.filter`）。
 * 🔴**次のグロウで払えなくなるエナは最後に回す**（`cpuGrowReserve`）＝エナを削って
 *   グロウできなくなるのは `S-26` で直した失敗そのもの。
 * ⚠**それ以外は弱い札から**（エナは色さえ合えば何でもよいので、強い札はトラッシュに残さない）。
 * @returns 落とすエナの index。**払えないなら `null`**。
 */
export function pickCpuEnergyTrashIndices(p: {
  energy: string[];
  cost: CardEffect['cost'];
  cardMap: Map<string, CardData>;
  effectsOf?: (id: string) => readonly CardEffect[];
  policy?: CpuPolicy;
  reserve?: CpuEnergyReserve;
}): Set<number> | null {
  const spec = p.cost?.energyTrash;
  if (!spec) return new Set();
  const strength = (id: string) =>
    cardStrength(p.cardMap.get(getCardNum(id)), p.effectsOf?.(id) ?? [], 'deploy', undefined, p.policy);
  const order = p.energy.map((_, i) => i)
    .filter(i => !spec.filter || matchesFilter(p.cardMap.get(getCardNum(p.energy[i])), spec.filter))
    // 🆕2026-09-26＝作戦データの「エナの扱い」が先（温存する札は最後に落とす）。
    .sort((a, b) => (p.reserve?.payRank?.(p.energy[a]) ?? 0) - (p.reserve?.payRank?.(p.energy[b]) ?? 0)
      || strength(p.energy[a]) - strength(p.energy[b]) || a - b);
  const pickFrom = (idx: readonly number[]) => {
    const chosen = new Set<number>();
    for (const i of idx) {
      if (!spec.atLeast && chosen.size >= spec.count) break;
      if (canAddEnergyTrashIndex(p.energy, chosen, i, spec, p.cardMap)) chosen.add(i);
    }
    return energyTrashCostSatisfied(p.energy, chosen, spec, p.cardMap) ? chosen : null;
  };
  // 🔴まず**グロウの予約を壊さない**エナだけで組む。組めなければ予約を諦めて全体から組む。
  const keepable = order.filter(i => reserveKeptAfterPaying(p.reserve, p.energy, [p.energy[i]]));
  return pickFrom(keepable) ?? pickFrom(order);
}

/**
 * 🆕**ルリグデッキからアーツを徴収するコストで、どれを捨てるか**（`trashArtsFromLrigDeck`・§5.7 `S-31` ② 第4段）。
 *
 * 🔑**候補は engine・人間のUI・提示ゲートと同じ funnel**（`trashArtsFromLrigDeckCandidates`＝色／クラフト除外／
 *   「ルリグデッキから移動しない」アーツを除く）。
 * ⚠**弱いアーツから捨てる**＝`cardStrength` の昇順（同点はルリグデッキの並び順で決定論）。
 *   🔴アーツの強さは盤面の札とは軸が違う（使う窓・防御力）が、**別の評価軸をここで発明しない**＝
 *   強さ表を1本に保つ（`S-6` が学習で動かせるのもこの1本だけ）。
 * @returns 捨てるアーツの cardNum。**足りなければ `null`**（＝その【起】は候補から外す）。
 */
export function pickCpuTrashArtsNums(p: {
  effect: CardEffect;
  actor: PlayerState;
  cardMap: Map<string, CardData>;
  effectsOf?: (id: string) => readonly CardEffect[];
  policy?: CpuPolicy;
}): string[] | null {
  const cost = p.effect.cost?.trashArtsFromLrigDeck;
  if (!cost) return [];
  const cands = trashArtsFromLrigDeckCandidates(p.actor, cost, p.cardMap, isImmovableArtsFromLrigDeck);
  if (cands.length < cost.count) return null;
  const strength = (num: string) =>
    cardStrength(p.cardMap.get(getCardNum(num)), p.effectsOf?.(num) ?? [], 'deploy', undefined, p.policy);
  return [...cands].sort((a, b) => strength(a) - strength(b)).slice(0, cost.count);
}

/**
 * 🆕**効果元の下から払うコストで、どのカードを落とすか**（`underSelfTrash`・§5.7 `S-31` ② 第3段・2026-09-21）。
 *
 * 🔑**可否の権威は人間の支払いUIと同じ関数**＝`canPayUnderSelfTrash`（`selectionConstraint`＝
 *   「それぞれ名前の異なる」「同じレベル」まで見る）／最後に `payUnderSelfTrash` で**実際に払える組か検算**する。
 * ⚠**下のカードに強さの序列は無い**（どれも既に場から退いた札）＝**上から順**の決定論で選び、
 *   制約つきの形だけ**組み合わせを探索**する（候補はスタック1本ぶん＝高々数枚）。
 * @returns `payUnderSelfTrash` に渡すキー（`"<ゾーン>:<添字>"`）。**払えないなら `null`**。
 */
export function pickCpuUnderSelfTrashKeys(p: {
  effect: CardEffect;
  actor: PlayerState;
  sourceZone: number;
  cardMap: Map<string, CardData>;
}): Set<string> | null {
  // 🆕§5.7 `S-31` ② 第5段＝「**あなたのシグニの下から**」（全ゾーン版）＝**キーの形が同じ**なので
  //   候補の出どころだけ差し替える（払えるかの検算は `payUnderAnySigniTrash` の1本）。
  const anySpec = p.effect.cost?.underAnySigniTrash;
  if (anySpec) {
    const anyCands = underAnySigniCostCandidates(p.actor);
    if (anyCands.length < anySpec.count) return null;
    const keys = new Set(anyCands.slice(0, anySpec.count).map(c => `${c.zone}:${c.index}`));
    return payUnderAnySigniTrash(p.actor, keys, anySpec.count) ? keys : null;
  }
  const spec = p.effect.cost?.underSelfTrash;
  if (!spec) return new Set();
  const candidates = underSelfCostCandidates(p.actor, p.sourceZone, p.cardMap, spec.filter);
  const pick = (start: number, chosen: UnderAnySigniCandidate[]): UnderAnySigniCandidate[] | null => {
    if (chosen.length === spec.count) return chosen;
    for (let i = start; i < candidates.length; i++) {
      const next = [...chosen, candidates[i]];
      // ⚠**途中で切らない**＝集合制約は「選び終えた組」で見るので、`payUnderSelfTrash` と同じ検算を最後に当てる。
      const got = pick(i + 1, next);
      if (got && payUnderSelfTrash(p.actor, p.sourceZone, new Set(got.map(c => `${c.zone}:${c.index}`)),
        spec.count, p.cardMap, spec.filter, spec.selectionConstraint)) return got;
    }
    return null;
  };
  const picked = pick(0, []);
  return picked ? new Set(picked.map(c => `${c.zone}:${c.index}`)) : null;
}

/**
 * 🆕**場から払うコストで、どのシグニをトラッシュするか**（§5.7 `S-31` ② 第2段）。
 * 🔑**候補のゾーンは `fieldTrashSelectableZones` の1本**（`excludeSelf`・フィルタは可否ゲートと同じ関数）。
 * ⚠**弱いシグニから**（レベル→強さの昇順）＝盤面をできるだけ削らない。
 */
export function pickCpuFieldTrashZones(p: {
  effect: CardEffect;
  actor: PlayerState;
  /** 場のシグニの【起】ならそのゾーン（`excludeSelf` 用）。ルリグの【起】は `null`＝自分を除く指定が効かない。 */
  sourceZone: number | null;
  cardMap: Map<string, CardData>;
  effectsOf?: (id: string) => readonly CardEffect[];
  policy?: CpuPolicy;
}): Set<number> | null {
  // 🆕§5.7 `S-31` ② 第3段＝**行き先違いの3キーは同じゾーン選択 state を使う**
  //   （`performSigniActivated` / `performLrigActivated` が `fieldTrashZones` / `fieldBanishZones` の1つで受ける。
  //    parser は3キーを同時に立てない＝型の注記どおり）。
  //   ⚠**選ぶ軸は同じでも行き先は違う**＝`fieldBanish` はエナゾーン・`fieldToDeckTop` はデッキの上・
  //     `fieldToLrigTrash` はルリグトラッシュ（🆕§5.7 `S-31` ② 第4段）。
  const ft = p.effect.cost?.fieldTrash ?? p.effect.cost?.fieldBanish ?? p.effect.cost?.fieldToDeckTop ?? p.effect.cost?.fieldToLrigTrash;
  // 🆕§5.7 `S-31` ② 第6段＝**グループ指定**（「＜アーム＞1体と＜ウェポン＞1体を場からトラッシュ」＝`WX04-040-E1`）。
  //   ⚠**枠ごとに別の条件**なので単一フィルタの経路では表せない＝ここで組を作り、
  //     人間の支払いUIと同じ `fieldTrashGroupsSatisfied` で検算する。
  const groups = p.effect.cost?.fieldTrashGroups;
  if (groups) {
    const zones = new Set<number>();
    for (const g of groups) {
      let need = g.count;
      for (const zi of fieldTrashGroupsSelectableZones([g], p.actor, p.cardMap)) {
        if (need <= 0) break;
        if (zones.has(zi)) continue;
        zones.add(zi); need--;
      }
      if (need > 0) return null;
    }
    return fieldTrashGroupsSatisfied(groups, [...zones], p.actor.field.signi, p.cardMap) ? zones : null;
  }
  if (!ft) return new Set();
  const strength = (zi: number) => {
    const top = p.actor.field.signi[zi]?.at(-1) ?? '';
    const card = p.cardMap.get(getCardNum(top));
    return [parseInt(card?.Level ?? '0', 10) || 0,
      cardStrength(card, p.effectsOf?.(top) ?? [], 'field', undefined, p.policy)] as const;
  };
  const zones = fieldTrashSelectableZones(ft, p.actor, p.cardMap, p.sourceZone ?? undefined)
    .sort((a, b) => strength(a)[0] - strength(b)[0] || strength(a)[1] - strength(b)[1] || a - b);
  // ⚠**「N体まで」（`upToCount`）は `fieldTrash` にしかない**＝他の2キーは必ず N 体払う。
  const upTo = p.effect.cost?.fieldTrash?.upToCount ?? false;
  if (zones.length < ft.count && !upTo) return null;
  return new Set(zones.slice(0, ft.count));
}

/**
 * 🆕§5.7 `S-15`＝CPU が**いま撃てる**場のシグニ【起】を**全部**、ゾーン順→効果定義順で列挙する（遅延評価）。
 * `pickCpuSigniActivated` はこの先頭を取るだけ＝「列挙」と「選ぶ」を割った（探索 `S-16` が全候補を要る）。
 */
export function* iterCpuSigniActivated(p: CpuSigniActivatedPickInput): Generator<CpuActivatedChoice> {
  const { actor, opponent, effectsMap, cardMap, cards } = p;
  for (let zoneIndex = 0; zoneIndex < actor.field.signi.length; zoneIndex++) {
    const cardNum = actor.field.signi[zoneIndex]?.at(-1);
    if (!cardNum) continue;
    // 🆕§5.7 `S-31` ③＝作戦データが「使わない」と書いた札の【起】は撃たない。
    //   🆕2026-09-26 `S-37`＝「攻め」＝自分のアタックフェイズだけ（メインでは撃たない）。
    if (!planAllowsUseIn(p.plan, cardNum, cpuUseWindowOf(p.phase))) continue;
    const usable = listActivatableSigniEffects({
      my: actor, op: opponent, zoneIndex, phase: p.phase, isMyTurn: true,
      effectsMap, cardMap, effectivePowers: p.effectivePowers, contBlockedSelf: p.contBlockedSelf,
    });
    for (const effect of usable) {
      if (p.alreadyActivated.includes(effect.effectId)) continue;
      if (!cpuCanAutoPayActivatedCost(effect, actor, cardNum)) continue;
      const costIndices = selectEnergyIndicesForCost({
        // 🆕§5.6 `C-0`＝《黒×0》（`ACTIVATE_COST_ZERO_BLACK`）をエナにも効かせる。
        //   🔴旧はここが満額で、人間の `SigniActivatedModal` だけがエナを 0 にしていた（片肺）。
        poolNums: p.energyPoolNums, cards, costStr: activatedEnergyCostStr(applyActivateCostZero(effect, actor, cardNum)),
        isAffordable: p.isAffordable,
        wholeSubstitutes: p.wholeSubstitutes,
        reserve: p.energyReserve,
      });
      if (!costIndices) continue;
      // 🆕§5.7 `S-31` ②＝手札を捨てるコストの index（払えないなら候補から外す）。
      const discardIndices = pickCpuDiscardCostIndices({
        hand: actor.hand, cost: effect.cost, cardMap,
        effectsOf: id => effectsMap.get(getCardNum(id)) ?? [], keepBonus: p.planKeepBonus, policy: p.policy,
      });
      if (!discardIndices) continue;
      // 🆕§5.7 `S-31` ② 第2段＝エナ・場から払うコスト（払えないなら候補から外す）。
      const energyTrashIndices = pickCpuEnergyTrashIndices({
        energy: actor.energy, cost: effect.cost, cardMap,
        effectsOf: id => effectsMap.get(getCardNum(id)) ?? [], policy: p.policy, reserve: p.energyReserve,
      });
      if (!energyTrashIndices) continue;
      const fieldTrashZones = pickCpuFieldTrashZones({
        effect, actor, sourceZone: zoneIndex, cardMap,
        effectsOf: id => effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
      });
      if (!fieldTrashZones) continue;
      // 🆕§5.7 `S-31` ② 第3段＝効果元の下から落とすコスト（払えないなら候補から外す）。
      const underTrashKeys = pickCpuUnderSelfTrashKeys({ effect, actor, sourceZone: zoneIndex, cardMap });
      if (!underTrashKeys) continue;
      // 🆕§5.7 `S-31` ② 第6段＝トラッシュから除外するコスト（払えないなら候補から外す）。
      const trashExileIndices = pickCpuTrashExileIndices({
        trash: actor.trash, cost: effect.cost, cardMap,
        effectsOf: id => effectsMap.get(getCardNum(id)) ?? [], policy: p.policy,
      });
      if (!trashExileIndices) continue;
      yield { zoneIndex, cardNum, effect, costIndices, discardIndices, energyTrashIndices, fieldTrashZones, underTrashKeys, trashExileIndices };
    }
  }
}

export function listCpuSigniActivated(p: CpuSigniActivatedPickInput): CpuActivatedChoice[] {
  return [...iterCpuSigniActivated(p)];
}

/** いま撃つ1つ＝列挙の先頭（ゾーン順→効果定義順・盤面評価はしない）。 */
export function pickCpuSigniActivated(p: CpuSigniActivatedPickInput): CpuActivatedChoice | null {
  return iterCpuSigniActivated(p).next().value ?? null;
}
