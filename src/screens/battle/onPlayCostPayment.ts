// シグニの【出】コストの支払いを計算する（払った後の盤面・ログ）＝BattleScreen の `executeSigniOnPlayCost` から切り出した（2026-10-24）。
//   🔑**React にも DB にも触らない純関数**＝書き込み（相手の盤面を含む）・ログの出力・トリガーの収集・次のコストへの連鎖は画面が行う。
//   ⇒ 「捨てた札の台帳」「この方法で捨てたシグニのレベル・クラス」などの記録を golden で直接確かめられる。
//   ⚠本文は画面にあったものをそのまま移した（中断の `return` を `return null` にしただけ）。
import type { CardData, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum, payBeatSigniCost, payBeatSigniFromTrashCost, beatSigniCostCount } from '../../engine/effectExecutor';
import { canSatisfyDiscardGroups } from '../../engine/execUtils';
import { coinLedger } from '../../engine/coinAbilityNegation';
import { recordEnergyPlacements } from '../../engine/energyPlacement';
import { buildEnergyPayPool, planEnergyPayment, type EnergyPayEntry } from './energyPaySource';
import { handDiscardHistoryRecord, payRemoveOppVirus, payCharmTrash, paySelectedExceed } from './costs';
import { payUnderAnySigniTrash } from './underAnySigniCost';
import { payFieldToDeckTopCost } from './fieldToDeckTopCost';
import { payFieldTrashCost } from './fieldTrashCost';
import { payMultiZoneExileCost } from './multiZoneExileCost';
import { payLrigDownCost } from './lrigDownCost';
import { payLifeOnPlayCost } from './lifeCost';

/** 支払いモーダルで選んだもの。 */
export interface OnPlayCostSelections {
  costIndices: Set<number>;
  discardIndices: Set<number>;
  energyTrashIndices: Set<number>;
  fieldTrashZones: Set<number>;
  beatZones: Set<number>;
  exceedIndices: Set<number>;
  underTrashKeys: Set<string>;
  virusZones: number[];
  charmPicks: string[];
  /** 可変枚数（チャームのトラッシュ／ルリグのダウン）で選んだ数。 */
  signiOnPlayCharmTrashVar: number;
  selectedSigniOnPlayTrashToDeck: Set<number>;
  selectedSigniOnPlayArtsTrash: string | null;
}

export interface OnPlayCostPayment {
  /** 払った後の自分の盤面。 */
  paid: PlayerState;
  payLogs: string[];
  /** コストで手札から捨てた札（手札→エナ／手札→下に置く は含まない）。 */
  discardNums: string[];
  coinCostOPC: number;
  /** 相手の盤面が変わったとき（【ウィルス】の除去）だけ。 */
  opState: PlayerState | null;
}

/** 払えなければ null（モーダル側でも無効化済みの形）。 */
export function payOnPlayCost(p: {
  cardNum: string; costEffect: CardEffect; placedState: PlayerState; placedZone?: number;
  /** 画面の自分の盤面（`placedState` と同じなら `myEnergyPayPool` をそのまま使う）。 */
  my: PlayerState; myEnergyPayPool: EnergyPayEntry[]; energyPayCtx: Parameters<typeof buildEnergyPayPool>[1];
  op: PlayerState; battleCardMap: Map<string, CardData>;
  sel: OnPlayCostSelections;
}): OnPlayCostPayment | null {
  const { cardNum, costEffect, placedState, placedZone, my, myEnergyPayPool, energyPayCtx, op, battleCardMap } = p;
  const {
    costIndices, discardIndices, energyTrashIndices, fieldTrashZones, beatZones, exceedIndices, underTrashKeys,
    virusZones, charmPicks, signiOnPlayCharmTrashVar, selectedSigniOnPlayTrashToDeck, selectedSigniOnPlayArtsTrash,
  } = p.sel;
  let opState: PlayerState | null = null;
  const cost = costEffect.cost;
  const selectedDiscardCards = [...discardIndices].map(i => battleCardMap.get(getCardNum(placedState.hand[i])));
  if (cost?.discardGroups && !canSatisfyDiscardGroups(selectedDiscardCards, cost.discardGroups)) return null;
  // エナ消費はplacedState基準（チェーン2回目以降は前回の支払い結果を引き継ぐ）＝支払い元は funnel 1本（§6.4）
  const opcPool = placedState === my ? myEnergyPayPool : buildEnergyPayPool(placedState, energyPayCtx);
  const opcPay = planEnergyPayment(placedState, opcPool, costIndices, energyTrashIndices);
  const paidNums = [...opcPay.paidNums, ...opcPay.extraEnergyNums];
  // 手札コスト: discard（トラッシュ）/ handToEnergy（エナへ）/ handToUnderSelf（このシグニの下へ）で行き先が異なる
  const handPickedNums = [...discardIndices].map(i => placedState.hand[i]);
  const newHand = placedState.hand.filter((_, i) => !discardIndices.has(i));
  const isHandToEnergy = (cost?.handToEnergy?.count ?? 0) > 0;
  const isHandToUnder  = (cost?.handToUnderSelf?.count ?? 0) > 0;
  const discardNums = (isHandToEnergy || isHandToUnder) ? [] : handPickedNums;
  // 《コインアイコン》コスト（【出】《コイン》等）
  const coinCostOPC = cost?.coin ?? 0;
  if (coinCostOPC > 0 && (placedState.coins ?? 0) < coinCostOPC) return null; // 支払い不能（UI側でも無効化済み）
  let paid: PlayerState = opcPay.applyTo({
    ...placedState,
    hand: newHand,
    // 🆕§5.3 `O-245`（2026-09-04）＝「**次に**【出】能力を発動する場合」の軽減は**1回で消費する**
    //   （`reduce_next_on_play_cost`・`WXK04-075-E1`）。⚠ここで消さないと**このターン中ずっと**
    //   軽減され続ける（原文より安い＝過剰実行）。減額そのものは `SigniOnPlayCostModal` が
    //   `applyNextOnPlayCostReduction` で行っている。
    reduce_next_on_play_cost: undefined,
    coins: Math.max(0, (placedState.coins ?? 0) - coinCostOPC),
    coins_paid_this_turn: (placedState.coins_paid_this_turn ?? 0) + coinCostOPC, // COINS_PAID_THIS_TURN
    // 🆕§5.3 `O-317`/`O-333`＝コイン技の発動台帳（【出】コストの《コイン》も能力の発動）。
    coin_abilities_used_this_turn: coinCostOPC > 0
      ? [...(placedState.coin_abilities_used_this_turn ?? []), ...coinLedger(costEffect)]
      : placedState.coin_abilities_used_this_turn,
    trash: [...placedState.trash, ...paidNums, ...discardNums],
    // 🔴**旧実装はこの経路だけ台帳を1つも書いていなかった**（`V-101`②で実機再現）＝
    //   `WXDi-CP02-055` は同じカードの【出】コストで＜ブルアカ＞を捨てて【自】が読むのに、
    //   `HAND_DISCARDED_THIS_TURN` が永久に false で無言 no-op だった。
    //   ⚠`discardNums` は `handToEnergy`/`handToUnder` のとき `[]` になる（＝捨てていない）ので、そのまま渡してよい。
    ...handDiscardHistoryRecord(placedState, discardNums),
    // handDiscardSigni コストで捨てたシグニのレベルを記録（COST_DISCARDED_SIGNI_LEVEL。WX25-P2-101「レベル１→代わりに－5000」）
    last_discarded_signi_level: discardNums.length > 0
      ? (() => { const lv = parseInt(battleCardMap.get(getCardNum(discardNums[0]))?.Level ?? '', 10); return isNaN(lv) ? placedState.last_discarded_signi_level : lv; })()
      : placedState.last_discarded_signi_level,
    // 🆕🔴**§5.3 `O-328`（2026-09-11）＝ここが `last_discarded_signi_class` を一度も書いていなかった。**
    //   `classMatchesDiscardSigni`（「この方法で捨てたシグニと共通するクラスを持つ」）を持つ live 5効果は
    //   **全部が【出】＝この支払い地点だけを通る**（`WXK10-023-E1`/`-029-E2`/`-033-E2`/`-038-E1`/`-056-E2`）。
    //   書かれないまま `resolveDiscardLevelFilter` が「参照不能＝制限なし」へ倒れていたので、
    //   **クラス制限が黙って消えた候補集合**（原文より広い＝過剰実行）になっていた。JSON も逆翻訳も正しく見える。
    //   ⚠レベル側と同じ規約＝**この支払いで捨てていれば1枚目で上書き、捨てていなければ据置**。
    last_discarded_signi_class: discardNums.length > 0
      ? (battleCardMap.get(getCardNum(discardNums[0]))?.CardClass ?? placedState.last_discarded_signi_class)
      : placedState.last_discarded_signi_class,
    // 「直前の能力コスト」の記録なので**この支払い分で上書き**する（ACTIVATED 経路 9626 と同じ規約）。
    // 従来は支払い前 state へ追記していたため前の能力のコストが残り、COST_TRASHED_MATCHES／
    // colorMatchesCostTrashed が古い支払いで誤成立しうる状態だった（§3タスク6 C で顕在化）。
    last_cost_trashed_cards: [...paidNums, ...discardNums],
    // 本体が「この方法で〜したカード」を参照する任意【出】（levelEqualsVar）の記録。
    // engine 経路（効果配置＝OPTIONAL_COST 支払い）は execEnergyCharge / execTrash が同じ値を書くが、
    // **通常召喚はここが唯一の支払い地点**なので同じ契約をこちらにも置く。書かないと本体の
    // 動的 filter が noMatch へ倒れて**効果が丸ごと no-op になる**（タスク12(xxix)(1) 第12波の検証で実測）。
    // 上と同じく**この支払い分で上書き**する（前の召喚の値を持ち越さない）。
    last_cost_hand_to_energy_level: isHandToEnergy && handPickedNums.length > 0
      ? (() => { const lv = parseInt(battleCardMap.get(getCardNum(handPickedNums.at(-1)!))?.Level ?? '', 10); return Number.isFinite(lv) ? lv : undefined; })()
      : undefined,
    // 色コスト（costIndices）は「トラッシュに置いたシグニ」ではないので energyTrashIndices だけを数える
    last_cost_energy_trash_level_sum: energyTrashIndices.size > 0
      ? [...energyTrashIndices].reduce((sum, i) => {
          const lv = parseInt(battleCardMap.get(getCardNum(placedState.energy[i]))?.Level ?? '', 10);
          return sum + (Number.isFinite(lv) ? lv : 0);
        }, 0)
      : undefined,
  });
  // handToEnergy コスト（手札→エナ）は funnel の控除**後**のエナに積む
  // 🆕§5.3 `O-321` 第275＝**コストとして**置かれた分（`cause:'cost'`）＝原文「コストか効果によって」の「コスト」側。
  if (isHandToEnergy) paid = recordEnergyPlacements({ ...paid, energy: [...paid.energy, ...handPickedNums] }, handPickedNums, 'cost');
  const payLogs: string[] = [];
  const underAnyCost = cost?.underAnySigniTrash;
  if (underAnyCost) {
    const underPaid = payUnderAnySigniTrash(paid, underTrashKeys, underAnyCost.count);
    if (!underPaid) return null;
    paid = underPaid.state;
    paid = { ...paid, last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...underPaid.moved] };
    payLogs.push(`シグニの下から${underPaid.moved.length}枚をコストでトラッシュ`);
  }
  const exceedCostOP = cost?.exceed ?? 0;
  if (exceedCostOP > 0) {
    const exceedPaid = paySelectedExceed(paid, exceedCostOP, exceedIndices);
    if (!exceedPaid) return null;
    paid = exceedPaid;
    payLogs.push(`エクシード${exceedCostOP}を支払った`);
  }
  // handToUnderSelf: 出たシグニの下に置く
  if (isHandToUnder && handPickedNums.length > 0) {
    const selfZone = placedZone ?? paid.field.signi.findIndex(s => s?.at(-1) === cardNum);
    if (selfZone >= 0 && paid.field.signi[selfZone]) {
      const newSigniU = [...paid.field.signi] as (string[] | null)[];
      newSigniU[selfZone] = [...handPickedNums, ...(newSigniU[selfZone] ?? [])];
      paid = { ...paid, field: { ...paid.field, signi: newSigniU } };
      payLogs.push(`手札${handPickedNums.length}枚をシグニの下に置いた`);
    } else {
      // 行き先が見つからない場合はトラッシュへ（消失防止）
      paid = { ...paid, trash: [...paid.trash, ...handPickedNums] };
    }
  }
  // 🆕fieldToDeckTop: 場のシグニをコストで**デッキの一番上**へ（§5.3 `O-256`・`WDK05-T12-E1`）。
  // 🔴行き先が違うので下の `fieldTrash` ブロックへ落とさない（あちらはトラッシュ送り＝資源を失う）。
  const fieldToDeckTopCost = cost?.fieldToDeckTop;
  if (fieldToDeckTopCost) {
    const ftdPaid = payFieldToDeckTopCost({
      my: paid, zones: fieldTrashZones, cost: fieldToDeckTopCost, cardMap: battleCardMap,
    });
    if (!ftdPaid) return null; // 支払い不能（UI側でも無効化済み）
    paid = ftdPaid.state;
    payLogs.push(...ftdPaid.logs);
  }
  // fieldTrash / fieldToLrigTrash: 場のシグニを指定先へ（付属カードはルールどおりトラッシュへ）
  // ⚠支払いは `payFieldTrashCost` 1本（§5.3 `O-271` で funnel 化）。
  if (!fieldToDeckTopCost && fieldTrashZones.size > 0) {
    const ftPay = payFieldTrashCost({ state: paid, zones: fieldTrashZones, cost, cardMap: battleCardMap });
    paid = ftPay.state;
    if (ftPay.log) payLogs.push(ftPay.log);
  }
  // beat_signi: シグニを【ビート】にするコスト（beatZones=プレイヤー選択。空なら自動近似）
  if (beatSigniCostCount(cost?.beat_signi) > 0) {
    const beatPay = payBeatSigniCost(paid, cardNum, battleCardMap, cost!.beat_signi!, [...beatZones]);
    if (!beatPay.ok) return null; // 支払い不能（対象不足）
    paid = beatPay.state;
    payLogs.push(beatPay.log);
  }
  // 🆕`multiZoneExile`（意味照合 段2・`WXDi-P13-089-E3`）＝「手札とエナゾーンとトラッシュにある
  //   《X》を1枚**ずつ**ゲームから除外する」。⚠**自動支払い**（`filter` が `cardName` で一意なので
  //   どれを除外しても等価）＝選択UIは作らない。可否は `signiActivateGate` と**同じ関数**。
  if (cost?.multiZoneExile) {
    const mzPay = payMultiZoneExileCost(paid, cost.multiZoneExile, battleCardMap);
    if (!mzPay) return null; // 支払い不能（UI側でも非提示）
    paid = mzPay.state;
    payLogs.push(`${cost.multiZoneExile.zones.map(z => (z === 'hand' ? '手札' : z === 'energy' ? 'エナゾーン' : 'トラッシュ')).join('と')}から${mzPay.exiled.length}枚をゲームから除外（コスト）`);
  }
  // beat_signi_from_trash: トラッシュからシグニを【ビート】にするコスト（WDK14-013・自動選択近似）
  if ((cost?.beat_signi_from_trash?.count ?? 0) > 0) {
    const btPay = payBeatSigniFromTrashCost(
      paid, battleCardMap, cost!.beat_signi_from_trash!.count,
      cost!.beat_signi_from_trash!.filter, [...beatZones],
    );
    if (!btPay.ok) return null; // 支払い不能（トラッシュにシグニ不足）
    paid = btPay.state;
    payLogs.push(btPay.log);
  }
  // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）
  const lrigDownCost = cost?.lrigDown;
  if (lrigDownCost) {
    const lrigPaid = payLrigDownCost(paid, lrigDownCost, battleCardMap);
    if (!lrigPaid) return null; // 支払い不能（UI側でも無効化済み）
    paid = lrigPaid.state;
    payLogs.push(`ルリグ${lrigDownCost.count}体をコストでダウン`);
  }
  // lrigDownVariable: モーダルで選んだ0..N体を既存の共通支払い関数でダウンし、レベル合計を記録。
  const lrigDownVariable = cost?.lrigDownVariable;
  if (lrigDownVariable) {
    const count = signiOnPlayCharmTrashVar;
    if (count < lrigDownVariable.min) return null;
    const lrigPaid = payLrigDownCost(paid, { count }, battleCardMap);
    if (!lrigPaid) return null;
    // レベル合計・ダウンしたルリグの記録は payLrigDownCost が state に書く（呼び出し側で再計算しない
    // ＝支払い経路ごとに式がずれる事故を無くす。タスク12(cix)）。
    paid = lrigPaid.state;
    payLogs.push(`ルリグ${count}体（レベル合計${lrigPaid.levelSum}）をコストでダウン`);
  }
  // ライフコスト: クラッシュだけは check/pending に載せ、既存ライフバースト処理へ接続する。
  if ((cost?.lifeTrash ?? 0) + (cost?.life_crash ?? 0) + (cost?.lifeToHand ?? 0) > 0) {
    const lifePaid = payLifeOnPlayCost(paid, cost!);
    if (!lifePaid) return null;
    paid = lifePaid.state;
    payLogs.push(...lifePaid.logs);
  }
  // deckTrash: デッキ上からN枚トラッシュ
  const deckTrashN = cost?.deckTrash ?? 0;
  if (deckTrashN > 0) {
    const movedD = paid.deck.slice(0, deckTrashN);
    paid = { ...paid, deck: paid.deck.slice(movedD.length), trash: [...paid.trash, ...movedD] };
    payLogs.push(`デッキ上${movedD.length}枚をコストでトラッシュ`);
  }
  // charmTrash: 自分の場のチャームN枚をトラッシュ（🆕2026-09-29 どれを置くかはプレイヤーの選択＝`charmPicks`）
  const charmTrashN = cost?.charmTrash ?? 0;
  if (charmTrashN > 0) {
    const charmPaidOP = payCharmTrash(paid, charmTrashN, charmPicks);
    if (!charmPaidOP) return null;
    paid = charmPaidOP.state;
    payLogs.push(`チャーム${charmPaidOP.moved.length}枚をコストでトラッシュ`);
  }
  // charmTrashVariable: チャームを可変枚数トラッシュ（プレイヤーが選択した枚数）
  const charmVarOPCost = cost?.charmTrashVariable;
  if (charmVarOPCost) {
    const n = signiOnPlayCharmTrashVar;
    if (n < charmVarOPCost.min) return null;
    if (n > 0) {
      // 🆕2026-09-29＝どれを置くかはプレイヤーの選択（`charmPicks`・枚数が合わなければ左から）
      const charmPaidOPV = payCharmTrash(paid, n, charmPicks);
      if (!charmPaidOPV) return null;
      paid = { ...charmPaidOPV.state, last_charm_trash_count: n };
      payLogs.push(`チャーム${n}枚をコストでトラッシュ`);
    } else {
      paid = { ...paid, last_charm_trash_count: 0 };
    }
  }
  // trashArtsFromLrigDeck: ルリグデッキからアーツをトラッシュ
  // 🆕trashToDeckBottom: トラッシュから条件一致カードをデッキの一番下へ（§5.3 `O-201`・`WXDi-CP02-100-E1`）。
  // ⚠**除外（`trashExile`）ではない**＝デッキへ戻るので後で引ける。行き先を間違えると別のカードになる。
  const t2dCostPay = cost?.trashToDeckBottom;
  if (t2dCostPay) {
    if (selectedSigniOnPlayTrashToDeck.size !== t2dCostPay.count) return null;
    const movedT2D = [...selectedSigniOnPlayTrashToDeck].map(i => placedState.trash[i]).filter(Boolean);
    if (movedT2D.length !== t2dCostPay.count) return null;
    paid = {
      ...paid,
      trash: paid.trash.filter(n => !movedT2D.includes(n)),
      deck: [...paid.deck, ...movedT2D],
    };
    payLogs.push(`トラッシュから${movedT2D.length}枚をデッキの一番下に置いた`);
  }
  const artsTrashOPCost = cost?.trashArtsFromLrigDeck;
  if (artsTrashOPCost) {
    if (!selectedSigniOnPlayArtsTrash) return null;
    paid = {
      ...paid,
      lrig_deck: paid.lrig_deck.filter(c => c !== selectedSigniOnPlayArtsTrash),
      lrig_trash: [...paid.lrig_trash, selectedSigniOnPlayArtsTrash],
    };
    payLogs.push(`ルリグデッキからアーツをトラッシュ`);
  }
  // removeOppVirus: 相手の場のウィルスN個を取り除く（🆕2026-09-29 どのゾーンからかはプレイヤーの選択＝`virusZones`）
  const removeVirusN = cost?.removeOppVirus ?? 0;
  if (removeVirusN > 0) {
    const newOpState = payRemoveOppVirus(op, removeVirusN, virusZones);
    if (!newOpState) return null;
    const removedV = removeVirusN;
    // 相手の盤面は呼び出し側が書く（画面＝この時点で commit していた＝順序は呼び出し側が守る）。
    opState = newOpState;
    // ON_OPP_VIRUS_REMOVED/CHANGED検出用フラグ（コストによる除去も発火対象）
    paid = { ...paid, opp_virus_removed_just: true };
    payLogs.push(`相手の【ウィルス】${removedV}個をコストで取り除いた`);
  }
  return { paid, payLogs, discardNums, coinCostOPC, opState };
}
