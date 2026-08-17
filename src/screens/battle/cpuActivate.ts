import type { CardData, PlayerState } from '../../types';
import type { CardEffect, EffectCost } from '../../types/effects';
import { listActivatableSigniEffects } from './signiActivateGate';

/**
 * CPU がメインフェイズにシグニの【起】を能動使用するための選択ロジック（§8／§6.4 `O-1`）。
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
 *   - **同じ効果はCPUターンに1回まで**（`cpu_activated_effect_ids_this_turn`）。コストの
 *     表現が落ちている効果（`cost` が空になっている parse 事故）を撃つと**無限ループ**になるため、
 *     `usageLimit` に頼らず選択側で必ず止める。⚠この上限を外すときは先にループ試験をすること。
 *   - 優先度は**ゾーン順→効果定義順の決定論**（盤面評価はしない）。CPU の対象選択が
 *     ランダムなのと同じ近似で、「強い順に撃つ」は別バッチ（§8）。
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
  'trash_key',     // キーをルリグトラッシュ（自動）
  'fieldDown',     // 該当ゾーンを順にダウン（自動）
  'lrigDown',      // payLrigDownCost（センター→アシストの順・自動）
  'charmTrash',    // 先頭ゾーンから自動
  'acceTrash',     // 先頭ゾーンから自動
  'discardAll',    // 手札をすべて（選択不要）
  'energyTrashAll',// エナをすべて（選択不要）
  'removeOppVirus',// 相手のウィルスを順に除去（自動）
]);

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
  const coinCost = actor.activate_cost_zero_signi === cardNum ? 0 : (cost.coin ?? 0);
  if (coinCost > 0 && (actor.coins ?? 0) < coinCost) return false;
  // removeOppVirus は相手盤面が要るので、ここでは「宣言があれば実行側が検算する」に委ねる
  // （足りなければ `performSigniActivated` が支払い不能で return する＝無害）。
  return true;
}

/** 【起】の `cost.energy` を、支払いモーダルと同じコスト文字列表現へ直す。 */
export function activatedEnergyCostStr(effect: CardEffect): string {
  return (effect.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('');
}

/**
 * エナコストを払う pool index の組を1つ決める（決定論）。払えないときは `null`。
 *
 * ⚠**可否の権威は呼び出し元が渡す `isAffordable`（＝人間UIと同じ `canAffordGrowCost`）**。
 * ここは候補の**並べ方**だけを決め、最後に必ず権威関数で検算する＝
 * マルチエナ・色代替・追加色といった例外はすべて権威側の実装1本に集約される
 * （2つ目の支払い判定を書かない＝続き546 教訓 (b) と同じ理由）。
 */
export function selectEnergyIndicesForCost(p: {
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  poolNums: string[];
  cards: CardData[];
  costStr: string;
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
}): Set<number> | null {
  const { poolNums, cards, costStr, isAffordable } = p;
  if (costStr === '') return new Set();
  const colorOf = (num: string) => {
    const base = num.indexOf('#') > 0 ? num.slice(0, num.indexOf('#')) : num;
    return cards.find(c => c.CardNum === base)?.Color ?? '無';
  };
  const selected = new Set<number>();
  const isSat = () => isAffordable([...selected].map(i => poolNums[i]), costStr);
  // ①コストに出てくる色を先に充当する（色指定を無色エナで潰さない）。
  const needColors = [...costStr.matchAll(/([白赤青緑黒無])(\d+)/g)]
    .filter(m => m[1] !== '無')
    .map(m => m[1]);
  for (const color of needColors) {
    if (isSat()) break;
    const idx = poolNums.findIndex((num, i) => !selected.has(i) && colorOf(num).includes(color));
    if (idx >= 0) selected.add(idx);
  }
  // ②残りは先頭から足していく（《無》スロット・マルチエナでの充当はここで埋まる）。
  for (let i = 0; i < poolNums.length && !isSat(); i++) selected.add(i);
  return isSat() ? selected : null;
}

export interface CpuActivatedChoice {
  zoneIndex: number;
  cardNum: string;
  effect: CardEffect;
  /** `performSigniActivated` に渡すエナ pool index。 */
  costIndices: Set<number>;
}

/**
 * CPU がいま撃つ【起】を1つ選ぶ（無ければ `null`）。**1回の呼び出しで1つだけ**＝
 * 実行後はスタック解決を待って CPU ループが再入する（`cpuTurnAction` は
 * `effect_stack` があると走らないので、これで解決順が人間と同じになる）。
 */
export function pickCpuMainPhaseActivated(p: {
  actor: PlayerState;
  opponent: PlayerState;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  cards: CardData[];
  /** `buildEnergyPayPool(actor, ...)` の各エントリの cardNum（pool index 順）。 */
  energyPoolNums: string[];
  /** このターン CPU が既に撃った effectId（同じ効果を撃ち直さない）。 */
  alreadyActivated: readonly string[];
  isAffordable: (selectedNums: string[], costStr: string) => boolean;
  effectivePowers?: Map<string, number>;
  contBlockedSelf?: Set<string>;
}): CpuActivatedChoice | null {
  const { actor, opponent, effectsMap, cardMap, cards } = p;
  for (let zoneIndex = 0; zoneIndex < actor.field.signi.length; zoneIndex++) {
    const cardNum = actor.field.signi[zoneIndex]?.at(-1);
    if (!cardNum) continue;
    const usable = listActivatableSigniEffects({
      my: actor, op: opponent, zoneIndex, phase: 'MAIN', isMyTurn: true,
      effectsMap, cardMap, effectivePowers: p.effectivePowers, contBlockedSelf: p.contBlockedSelf,
    });
    for (const effect of usable) {
      if (p.alreadyActivated.includes(effect.effectId)) continue;
      if (!cpuCanAutoPayActivatedCost(effect, actor, cardNum)) continue;
      const costIndices = selectEnergyIndicesForCost({
        poolNums: p.energyPoolNums, cards, costStr: activatedEnergyCostStr(effect),
        isAffordable: p.isAffordable,
      });
      if (!costIndices) continue;
      return { zoneIndex, cardNum, effect, costIndices };
    }
  }
  return null;
}
