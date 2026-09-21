import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { canAddHandDiscardSigniIndex, energyCostToString, handDiscardSigniCostSatisfied, parseGrowCost, type WholeEnergyCostSubstituteOption } from './costs';
import { getCardNum, matchesFilter } from '../../engine/execUtils';
import { cpuHandDiscardOrder } from './cpuHandLimit';
import type { CpuPolicy } from './cpuPolicy';
import { listActivatableSigniEffects } from './signiActivateGate';
import { activateCostZeroApplies, applyActivateCostZero } from './activateCostZero';

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
]);

/**
 * ⚠**`charmTrash` / `removeOppVirus` は載せない**（自動支払いではあるが `signiActivateGate` が
 * 数を検算していない）＝提示は通るのに `performSigniActivated` が支払い不能で**何も書かずに return** し、
 * CPU が同じ効果を選び直して**無限ループ**になる。載せるなら先に gate 側へ検算を足すこと。
 * （下の `pickCpuSigniActivated` を使う側にも、実行前に履歴を確定させる安全弁を置いてある。）
 */

/** この【起】のコストを CPU が自動で払いきれるか（払えないキーが1つでもあれば false）。 */
export function cpuCanAutoPayActivatedCost(effect: CardEffect, actor: PlayerState, cardNum: string): boolean {
  const cost = effect.cost;
  if (!cost) return true;
  for (const key of Object.keys(cost) as (keyof EffectCost)[]) {
    if (cost[key] === undefined) continue;
    // `trashExile.self`（トラッシュの自分自身を除外）は自動。相手を選ぶ形は選択が要る。
    if (key === 'trashExile') {
      if (cost.trashExile?.self) continue;
      return false;
    }
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
}): Set<number> | null {
  const { poolNums, cards, costStr, isAffordable } = p;
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
        const idx = poolNums.findIndex((num, i) => !selected.has(i) && colorOf(num).includes(color));
        if (idx >= 0) selected.add(idx); else break;
      }
    }
    // ②残りは先頭から足していく（《無》スロット・マルチエナでの充当はここで埋まる）。
    //   🆕予約があれば、予約に要る色のエナを後回しにする（グロウに要る色を《無》で潰さない）。
    const avoid = p.reserve?.avoidColors ?? [];
    const fillOrder = poolNums.map((_, i) => i)
      .sort((a, b) => Number(avoid.some(c => colorOf(poolNums[a]).includes(c))) - Number(avoid.some(c => colorOf(poolNums[b]).includes(c))) || a - b);
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
      if (tried.has(index) || !option.eligibleEnergyInstIds.has(poolNums[index])) continue;
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
  const plain = p.cost?.discard ?? 0;
  const picked = new Set<number>();
  if (!spec && plain <= 0) return picked;
  const order = cpuHandDiscardOrder(p.hand, p.cardMap, p.effectsOf, p.keepBonus, p.policy);
  if (spec) {
    for (const i of order) {
      if (picked.size >= spec.count) break;
      if (canAddHandDiscardSigniIndex(p.hand, picked, i, spec, p.cardMap)) picked.add(i);
    }
    if (!handDiscardSigniCostSatisfied(p.hand, picked, spec, p.cardMap)) return null;
  }
  if (plain > 0) {
    const filter = p.cost?.discardFilter;
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
 * 🆕§5.7 `S-15`＝CPU が**いま撃てる**場のシグニ【起】を**全部**、ゾーン順→効果定義順で列挙する（遅延評価）。
 * `pickCpuSigniActivated` はこの先頭を取るだけ＝「列挙」と「選ぶ」を割った（探索 `S-16` が全候補を要る）。
 */
export function* iterCpuSigniActivated(p: CpuSigniActivatedPickInput): Generator<CpuActivatedChoice> {
  const { actor, opponent, effectsMap, cardMap, cards } = p;
  for (let zoneIndex = 0; zoneIndex < actor.field.signi.length; zoneIndex++) {
    const cardNum = actor.field.signi[zoneIndex]?.at(-1);
    if (!cardNum) continue;
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
      yield { zoneIndex, cardNum, effect, costIndices, discardIndices };
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
