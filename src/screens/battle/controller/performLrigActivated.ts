import { coinLedger } from '../../../engine/coinAbilityNegation';
import { getCardNum } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers } from '../../../engine/triggerCollect';
import { type PlayerState } from '../../../types';
import { generateUUID } from '../battleUtils';
import { type PlayerStateKey, reduceBattle } from '../controller/battleController';
import { activatedEnergyTrashPaidCount, exceedColorsSatisfied, exceedPoolOf, activatedDiscardCostRecord, handDiscardHistoryRecord } from '../costs';
import { type EnergyPayEntry, planEnergyPayment } from '../energyPaySource';
import { payDeckTrashCost } from '../deckTrashCost';
import { payFieldBanishCost } from '../fieldBanishCost';
import { payFieldTrashCost } from '../fieldTrashCost';
import { effectiveCoinCost } from '../lrigActivateGate';
import { payLrigDownCost, payLrigDownSelfCost } from '../lrigDownCost';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O（`commit`／`appendLogs`／`setLoading`）と
 *   材料（`PerformCtx`）を注入にした。⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

// ルリグ付与能力（GRANT_LRIG_ABILITY）の発動：エクシードコスト＋エナコスト支払い
/**
 * ルリグの【起】（センタールリグ本来／付与／継承）の実行（人間・CPU 共通）。
 * DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝`performArts` / `performSigniActivated` と
 * 同じく **owner をパラメータ化**し、人間用 `executeLrigGranted` は薄いラッパーにする（§8 `O-1` (c)）。
 *
 * ⚠**「いま撃てるか」の判定はここではなく `lrigActivateGate.listActivatableLrigEffects`**
 * （提示と支払いは別の地点）。
 */
export const performLrigActivated = async (
  effect: import('../../../types/effects').CardEffect,
  sel: {
    costIndices: Set<number>;
    handDiscardIndices?: Set<number>;
    energyTrashIndices?: Set<number>;
    trashExileIndices?: Set<number>;
    /** `fieldBanish`（コストで自分の場のシグニをバニッシュ）で選んだシグニゾーン（§5.3 `O-67`）。 */
    fieldBanishZones?: Set<number>;
    /** 🆕§5.7 `S-31` ② 第4段＝`trashArtsFromLrigDeck` で捨てるアーツ（ルリグデッキの cardNum）。 */
    trashArtsNums?: string[];
    /**
     * 🆕エクシードで置くカード（`exceedPoolOf(my)` の添字・§5.3 `O-118`）。
     * ⚠**省略＝従来どおり自動**（色指定を貪欲に満たしてから下から補う）＝CPU 経路はこちら。
     */
    exceedIndices?: Set<number>;
  },
  p: {
    actor: PlayerState; opponent: PlayerState;
    actorId: string;
    actorKey: 'host_state' | 'guest_state';
    /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
    energyPayPool: EnergyPayEntry[];
  },
  ctx: PerformCtx,
) => {
  const my = p.actor;
  const op = p.opponent;
  const costIndices = sel.costIndices;
  const handDiscardIndices = sel.handDiscardIndices ?? new Set<number>();
  const energyTrashIndices = sel.energyTrashIndices ?? new Set<number>();
  const trashExileIndices = sel.trashExileIndices ?? new Set<number>();
  const fieldBanishZones = sel.fieldBanishZones ?? new Set<number>();
  ctx.io.setLoading(true);
  try {
    // エクシードコスト：センター → 左アシスト → 右アシストの順で下からN枚をルリグトラッシュへ
    const exceedCost = effect.cost?.exceed ?? 0;
    const newLrig     = [...my.field.lrig];
    const newAssistL  = [...(my.field.assist_lrig_l ?? [])];
    const newAssistR  = [...(my.field.assist_lrig_r ?? [])];
    let newLrigTrash = [...my.lrig_trash];
    const exceedPaidCards: string[] = []; // ON_EXCEED_COSTトリガー用（ルリグトラッシュに置かれたカード）
    // 🆕**色指定つきエクシード**（`WX10-001`「エクシード１（白のカード）」＝§5.3 2026-08-27 Sheet1 B13）。
    //   この経路は**下から機械的に**払う（選択UIが無い）ので、色指定があるときだけ
    //   「その色を満たすカード」を先に選ぶ。⚠満たせないときは従来どおり下から払う
    //   （ここに来る前に `canActivateLrigEffect` が提示を止めているので通常は到達しない）。
    const exceedColorsLA = effect.cost?.exceedColors;
    // 🆕**2026-09-02（索引 B 第2巡・§5.3 `O-118`）＝プレイヤーが「どのカードを置くか」を選べるようにした。**
    //   🔴旧＝この経路には選択UIが無く、色指定があるときだけ**貪欲に**満たして残りは下から払っていた＝
    //   原文（「エクシード２（白と赤のカード）」）は**満たす組が複数あるとき選べる**のに選択権が無かった。
    //   ⚠選択は `LrigGrantedModal` から `exceedIndices`（`exceedPoolOf` の添字）で届く。
    //   ⚠**不正な選択は採用しない**（枚数不足・色不成立）＝下の従来経路へ落ちる＝踏み倒しにはならない。
    //   ⚠CPU（`performLrigActivated` を `exceedIndices` 無しで呼ぶ）は従来どおり貪欲＋下から。
    const exceedIndicesLA = sel.exceedIndices;
    if (exceedCost > 0 && exceedIndicesLA && exceedIndicesLA.size === exceedCost) {
      const poolSel = exceedPoolOf(my);
      const pickedSel = [...exceedIndicesLA].map(i => poolSel[i]).filter((cn): cn is string => !!cn);
      if (pickedSel.length === exceedCost && exceedColorsSatisfied(pickedSel, exceedColorsLA, ctx.cardMap)) {
        const pickedSetSel = new Set(pickedSel);
        exceedPaidCards.push(...pickedSel);
        newLrigTrash = [...newLrigTrash, ...pickedSel];
        for (const arr of [newLrig, newAssistL, newAssistR]) {
          for (let i = arr.length - 1; i >= 0; i--) if (pickedSetSel.has(arr[i])) arr.splice(i, 1);
        }
      }
    }
    if (exceedCost > 0 && exceedPaidCards.length === 0 && exceedColorsLA?.length) {
      const poolLA = [...newLrig.slice(0, -1), ...newAssistL.slice(0, -1), ...newAssistR.slice(0, -1)];
      const pickedLA: string[] = [];
      const usedLA = new Set<number>();
      for (const col of exceedColorsLA) {
        const idx = poolLA.findIndex((cn, i) => !usedLA.has(i) && (ctx.cardMap.get(cn)?.Color ?? '').includes(col));
        if (idx < 0) break;
        usedLA.add(idx); pickedLA.push(poolLA[idx]);
      }
      // 色指定より枚数が多い場合は残りを下から補う。
      for (let i = 0; i < poolLA.length && pickedLA.length < exceedCost; i++) {
        if (!usedLA.has(i)) { usedLA.add(i); pickedLA.push(poolLA[i]); }
      }
      if (pickedLA.length === exceedCost) {
        const pickedSetLA = new Set(pickedLA);
        exceedPaidCards.push(...pickedLA);
        newLrigTrash = [...newLrigTrash, ...pickedLA];
        for (const arr of [newLrig, newAssistL, newAssistR]) {
          for (let i = arr.length - 1; i >= 0; i--) if (pickedSetLA.has(arr[i])) arr.splice(i, 1);
        }
      }
    }
    if (exceedCost > 0 && exceedPaidCards.length === 0) {
      let remaining = exceedCost;
      const fromCenter = Math.min(remaining, newLrig.length - 1);
      if (fromCenter > 0) { const movedC = newLrig.splice(0, fromCenter); exceedPaidCards.push(...movedC); newLrigTrash = [...newLrigTrash, ...movedC]; remaining -= fromCenter; }
      if (remaining > 0 && newAssistL.length > 1) {
        const fromL = Math.min(remaining, newAssistL.length - 1);
        const movedL = newAssistL.splice(0, fromL); exceedPaidCards.push(...movedL);
        newLrigTrash = [...newLrigTrash, ...movedL]; remaining -= fromL;
      }
      if (remaining > 0 && newAssistR.length > 1) {
        const fromR = Math.min(remaining, newAssistR.length - 1);
        const movedR = newAssistR.splice(0, fromR); exceedPaidCards.push(...movedR);
        newLrigTrash = [...newLrigTrash, ...movedR];
      }
    }
    // エナコスト支払い（色コスト + energyTrash指定コスト）＝支払い元は funnel 1本（§6.4）
    const lgPay = planEnergyPayment(my, p.energyPayPool, costIndices, energyTrashIndices);
    const paidNums = lgPay.paidNums;
    const lgEnergyTrashCards = lgPay.extraEnergyNums;
    // energyTrashAll: エナゾーンのカードをすべてトラッシュ（自動）
    const lgEnergyTrashAllCards = effect.cost?.energyTrashAll ? [...lgPay.energyAfter] : [];
    const afterAllLGEnergy = effect.cost?.energyTrashAll ? [] : lgPay.energyAfter;
    // energyTrashColorAll: エナゾーンからすべての[色]のカードをトラッシュ（自動）。トラッシュした枚数を記録（WX04-002-E2）
    const lgEnergyTrashColor = effect.cost?.energyTrashColorAll;
    const lgEnergyTrashColorCards = lgEnergyTrashColor
      ? afterAllLGEnergy.filter(cn => ctx.cardMap.get(cn)?.Color?.includes(lgEnergyTrashColor))
      : [];
    // funnel の index 控除で作れない「全捨て／色全捨て」は控除後の state に当てる（下の overrideEnergy）
    const lgOverrideEnergy = (effect.cost?.energyTrashAll || lgEnergyTrashColor)
      ? (lgEnergyTrashColor
          ? afterAllLGEnergy.filter(cn => !lgEnergyTrashColorCards.includes(cn))
          : afterAllLGEnergy)
      : null;
    // 手札シグニ捨てコスト支払い
    const discardedHandNums = [...handDiscardIndices].map(i => my.hand[i]);
    const baseLGHand = my.hand.filter((_, i) => !handDiscardIndices.has(i));
    // discardAll: 手札をすべて捨てる（自動）
    const lgDiscardAllCards = effect.cost?.discardAll ? [...baseLGHand] : [];
    const newHand = effect.cost?.discardAll ? [] : baseLGHand;
    const lgIsGameOnce = effect.usageLimit === 'once_per_game';
    // 🔴《コインアイコン》コスト（`cost.coin`・live 82効果）＝**この経路には支払いが1行も無かった**
    //   （§8 `O-1` (c)・続き552c に発見）。シグニ【起】（`performSigniActivated`）は同じキーを
    //   deduct しているのに、ルリグ【起】だけコインが減らず、提示側も所持枚数を見ていなかった＝
    //   **宣言だけして踏み倒す**状態だった。⚠可否判定は `lrigActivateGate` 側と対にすること。
    // 🆕§5.3 `O-259` 第10バッチ＝「次に使用するコイン技の使用コストは《コイン×1》減る」（`SPK06-01-E1`）。
    //   ⚠**提示ゲートと同じ関数**（`effectiveCoinCost`）＝写経すると請求だけ満額になる。
    const coinCostLg = effectiveCoinCost(effect, my);
    if (coinCostLg > 0 && (my.coins ?? 0) < coinCostLg) { ctx.io.setLoading(false); return; }
    // 🆕§5.3 `O-292`＝「コラボライバーN人とコラボする」＝ライバートークンN個を取り除く。
    //   ⚠提示ゲート（`canActivateLrigEffect`）・モーダル（`LrigGrantedModal`）と対＝足りなければ発動を中止する。
    const collabCostLg = effect.cost?.collab ?? 0;
    if (collabCostLg > 0 && (my.liver_tokens ?? 0) < collabCostLg) { ctx.io.setLoading(false); return; }
    let paid: import('../../../types').PlayerState = lgPay.applyTo({
      ...my,
      hand: newHand,
      coins: coinCostLg > 0 ? Math.max(0, (my.coins ?? 0) - coinCostLg) : my.coins,
      coins_paid_this_turn: coinCostLg > 0 ? (my.coins_paid_this_turn ?? 0) + coinCostLg : my.coins_paid_this_turn,
      // 🆕§5.3 `O-317`/`O-333`＝ルリグ【起】のコイン技も同じ台帳へ。
      coin_abilities_used_this_turn: coinCostLg > 0
        ? [...(my.coin_abilities_used_this_turn ?? []), ...coinLedger(effect)]
        : my.coin_abilities_used_this_turn,
      ...(collabCostLg > 0 ? { liver_tokens: (my.liver_tokens ?? 0) - collabCostLg } : {}),
      trash: [...my.trash, ...paidNums, ...lgEnergyTrashCards, ...discardedHandNums, ...lgDiscardAllCards, ...lgEnergyTrashAllCards, ...lgEnergyTrashColorCards],
      // ⚠エナ由来（`lgEnergyTrash*`）は台帳に載せない（手札から捨てた分だけ）。
      ...handDiscardHistoryRecord(my, [...discardedHandNums, ...lgDiscardAllCards]),
      field: { ...my.field, lrig: newLrig, assist_lrig_l: newAssistL, assist_lrig_r: newAssistR },
      lrig_trash: newLrigTrash,
      actions_done: [...(my.actions_done ?? []), effect.effectId, ...(coinCostLg > 0 ? ['COIN_SPENT'] : [])],
      // 🆕§5.3 `O-259` 第7バッチ＝「**次に**使用するルリグの【起】能力の使用コストは《無》減る」を消費する。
      //   ⚠消さないと**このターン中は何度でも安くなる**（原文は「次に」＝1回だけ）。
      //   ⚠この【起】自身が新しい予約を積む場合は効果解決（`COST_REDUCTION`）が後で走るので消えない。
      next_lrig_act_cost_reduction: undefined,
      // 🆕§5.3 `O-259` 第10バッチ＝「次に使用するコイン技」の軽減は**コイン技を使ったときだけ**消費する
      //   （コインを払わない【起】で消すと、原文にない「1回で失効」になる）。
      ...((effect.cost?.coin ?? 0) > 0 ? { next_coin_ability_cost_reduction: undefined } : {}),
      game_actions_done: lgIsGameOnce ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
      ...activatedDiscardCostRecord(
        discardedHandNums.length, lgDiscardAllCards.length, lgEnergyTrashAllCards.length, 0,
      ),
      last_cost_energy_trash_count: activatedEnergyTrashPaidCount(energyTrashIndices),
      last_energy_trash_color_count: lgEnergyTrashColor ? lgEnergyTrashColorCards.length : my.last_energy_trash_color_count,
      // 直前の能力コストでトラッシュへ送ったカード（`COST_TRASHED_MATCHES`）。§6.4 O-35・続き530。
      // 🔴**この経路（ルリグ本来の【起】＋付与/継承の【起】）にだけ記録が無かった**＝
      //   「この方法でカードをN枚以上トラッシュに置いた場合」（`WX25-CP1-020-E2` 3/7枚・
      //   `WXDi-P16-012-E3` 5枚。どちらもルリグ）の条件が恒久 false になる。
      // ⚠**この支払い分で上書き**する（シグニ 11825／召喚 12427 と同じ規約＝前の能力の支払いを持ち越さない）。
      last_cost_trashed_cards: [
        ...paidNums, ...lgEnergyTrashCards, ...discardedHandNums,
        ...lgDiscardAllCards, ...lgEnergyTrashAllCards, ...lgEnergyTrashColorCards,
      ],
    });
    if (lgOverrideEnergy) paid = { ...paid, energy: lgOverrideEnergy };
    // trashExile: トラッシュからカードをゲームから除外（lrig_trashへ）
    if (trashExileIndices.size > 0) {
      const lgExiledNums = [...trashExileIndices].map(i => my.trash[i]);
      paid = { ...paid, trash: paid.trash.filter((_, i) => !trashExileIndices.has(i)), lrig_trash: [...paid.lrig_trash, ...lgExiledNums] };
    }
    // exileLrigFromLrigDeck: ルリグデッキの＜X＞のルリグN枚をゲームから除外（ルリグ起動コスト・PR-469）。
    // ⚠**行先は `excluded`**＝ルリグトラッシュではない（`trashArtsFromLrigDeck` と混ぜない）。
    // ⚠支払えないときは**発動そのものを中止**する（コスト踏み倒しを作らない）。
    const exileLrigCost = effect.cost?.exileLrigFromLrigDeck;
    if (exileLrigCost) {
      const matchExLrig = (n: string): boolean => {
        const c = ctx.cardMap.get(getCardNum(n));
        if (!c) return false;
        if (!exileLrigCost.story) return true;
        return (c.CardClass ?? '').split(/[/／]/).map(x => x.trim()).includes(exileLrigCost.story);
      };
      const pickedExLrig: string[] = [];
      for (const n of paid.lrig_deck) {
        if (pickedExLrig.length >= exileLrigCost.count) break;
        if (matchExLrig(n)) pickedExLrig.push(n);
      }
      if (pickedExLrig.length < exileLrigCost.count) { ctx.io.setLoading(false); return; }
      const exSet = new Set(pickedExLrig);
      paid = {
        ...paid,
        lrig_deck: paid.lrig_deck.filter(n => !exSet.has(n)),
        excluded: [...(paid.excluded ?? []), ...pickedExLrig],
      };
      ctx.io.appendLogs([`ルリグデッキの${exileLrigCost.story ? `＜${exileLrigCost.story}＞の` : ''}ルリグ${pickedExLrig.length}枚をゲームから除外（コスト）`]);
    }
    // charmTrash: 自分の場のチャームN枚をトラッシュ（ルリグ起動コスト）
    const charmTrashNLrig = effect.cost?.charmTrash ?? 0;
    if (charmTrashNLrig > 0) {
      const newCharmsLrig = [...(paid.field.signi_charms ?? [null, null, null])];
      const movedCL: string[] = [];
      for (let zi = 0; zi < newCharmsLrig.length && movedCL.length < charmTrashNLrig; zi++) {
        if (newCharmsLrig[zi]) { movedCL.push(newCharmsLrig[zi]!); newCharmsLrig[zi] = null; }
      }
      if (movedCL.length < charmTrashNLrig) { ctx.io.setLoading(false); return; }
      paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsLrig }, trash: [...paid.trash, ...movedCL] };
    }
    // 🆕**trashArtsFromLrigDeck**（§5.7 `S-31` ② 第4段・live 5効果＝`WDK14-001-E3` ほか）＝
    //   「ルリグデッキから赤のアーツ1枚をルリグトラッシュに置く：」。
    //   🔴**この経路に支払いが1行も無かった**＝**アーツを1枚も失わずに撃てた**（キー【起】側には在る）。
    //   ⚠**どれを捨てるかは人間が選ぶ**（`sel.trashArtsNums`）＝候補が1つでも選ばれていなければ払わない。
    //     CPU は `pickCpuTrashArtsNums` が決める（どちらも候補は `trashArtsFromLrigDeckCandidates` の1本）。
    if (effect.cost?.trashArtsFromLrigDeck) {
      const artsNums = (sel.trashArtsNums ?? []).filter(n => paid.lrig_deck.includes(n));
      if (artsNums.length < effect.cost.trashArtsFromLrigDeck.count) { ctx.io.setLoading(false); return; }
      paid = {
        ...paid,
        lrig_deck: paid.lrig_deck.filter(n => !artsNums.includes(n)),
        lrig_trash: [...paid.lrig_trash, ...artsNums],
      };
      ctx.io.appendLogs([`ルリグデッキのアーツ${artsNums.length}枚をルリグトラッシュに置いた（コスト）`]);
    }
    // 🆕**deckTrash**（§5.7 `S-31` ② 第3段）＝**この経路にも支払いが1行も無かった**。
    //   ⚠支払いは `payDeckTrashCost` 1本（場のシグニ【起】と同じ関数＝写経しない）。
    if (effect.cost?.deckTrash) {
      const dtPaidLg = payDeckTrashCost(paid, effect.cost.deckTrash);
      paid = dtPaidLg.state;
      if (dtPaidLg.log) ctx.io.appendLogs([dtPaidLg.log]);
    }
    // removeOppVirus: 相手の場のウィルスN個を取り除く（ルリグ起動コスト）
    const removeVirusNLrig = effect.cost?.removeOppVirus ?? 0;
    let newOpVirusStateLrig: typeof op | null = null;
    if (removeVirusNLrig > 0) {
      const newOppVirusLrig = [...(op.field.signi_virus ?? [0, 0, 0])];
      let removedVL = 0;
      for (let zi = 0; zi < newOppVirusLrig.length && removedVL < removeVirusNLrig; zi++) {
        while (newOppVirusLrig[zi] > 0 && removedVL < removeVirusNLrig) { newOppVirusLrig[zi]--; removedVL++; }
      }
      if (removedVL < removeVirusNLrig) { ctx.io.setLoading(false); return; }
      newOpVirusStateLrig = { ...op, field: { ...op.field, signi_virus: newOppVirusLrig } };
      paid = { ...paid, opp_virus_removed_just: true };
    }
    // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）。
    // ルリグ本来の【起】もこの経路を通る（WXDi-P02-009-E3／WXDi-P03-009-E3＝レベル2のルリグ2体）。タスク12(cviii)
    const lrigDownCostLg = effect.cost?.lrigDown;
    if (lrigDownCostLg) {
      const lrigPaidLg = payLrigDownCost(paid, lrigDownCostLg, ctx.cardMap);
      if (!lrigPaidLg) { ctx.io.setLoading(false); return; } // 支払い不能（UI側でも無効化済み）
      paid = lrigPaidLg.state;
    }
    // 🔴down_self（【起】《ダウン》）＝**この能力を使ったカード自身**をダウンする。タスク12(cxxxi)。
    // ⚠従来この経路には支払いが1行も無かった＝`executeSigniActivated` の実装が `field.signi` しか
    //   探さないので、ルリグの【起】では `findIndex` が常に -1 ＝**誰もダウンせず実質無コスト**
    //   （live 27効果。`usageLimit` を持たない効果は同一ターンに何度でも撃てていた）。
    // ⚠可否判定は下の `isLrigDownSelfUnpayable`（UI側ゲート）と対になる＝両方揃えること。
    if (effect.cost?.down_self) {
      const downSelfPaid = payLrigDownSelfCost(paid);
      if (!downSelfPaid) { ctx.io.setLoading(false); return; }   // 既にダウン＝払えない（UI側でも非提示）
      paid = downSelfPaid;
    }
    // 🔴fieldBanish（「レベル２以下の＜原子＞のシグニ１体をバニッシュする：」＝`WX25-P1-022-E1`）。
    //   §5.3 `O-67`。⚠**この経路には場シグニ系コストの支払いが1行も無かった**＝提示だけして踏み倒せた。
    //   ⚠行き先は**エナゾーン**＝`fieldTrash`（トラッシュ）と混ぜない。可否判定は `lrigActivateGate` と対。
    const lgFieldBanishCost = effect.cost?.fieldBanish;
    if (lgFieldBanishCost) {
      const fbPaidLg = payFieldBanishCost({
        my: paid, op, zones: fieldBanishZones, cost: lgFieldBanishCost,
        cardMap: ctx.cardMap, turnPhase: ctx.bs.turn_phase as import('../../../types').TurnPhase,
      });
      if (!fbPaidLg) { ctx.io.setLoading(false); return; }
      paid = fbPaidLg.state;
    }
    // 🆕**fieldTrash**（§5.3 `O-271`・`SPDi44-16-E2`「シグニを３体まで場からトラッシュに置く：」）。
    //   🔴**この経路にも支払いが1行も無かった**＝提示ゲートも見ていないので**踏み倒して撃てた**うえ、
    //     帰結が「この方法でトラッシュに置いたシグニ1体につき」の札は**0体扱いで本体も空振り**していた。
    //   ⚠ゾーン選択 state は `fieldBanishZones` を共用する（parser は両キーを同時に立てない＝型の注記どおり）。
    // 🆕**fieldToLrigTrash**（§5.7 `S-31` ② 第4段・`WX07-001-E2`／`WX08-004-E2`）＝
    //   「レゾナ1体を場から**ルリグトラッシュ**に置く：」。🔴**ここにも支払いが無く踏み倒せた**。
    //   ⚠**行き先の分岐は `payFieldTrashCost` が既に持っている**（`cost.fieldToLrigTrash` を見て `lrig_trash` へ）＝
    //     条件に足すだけでよい（別の支払い関数を書かない）。
    if (!effect.cost?.fieldBanish && (effect.cost?.fieldTrash || effect.cost?.fieldToLrigTrash) && fieldBanishZones.size > 0) {
      const ftPaidLg = payFieldTrashCost({
        state: paid, zones: fieldBanishZones, cost: effect.cost, cardMap: ctx.cardMap,
      });
      paid = ftPaidLg.state;
      if (ftPaidLg.log) ctx.io.appendLogs([ftPaidLg.log]);
    }
    const lrigTop = my.field.lrig.at(-1);
    const cardName = ctx.cardMap.get(lrigTop ?? '')?.CardName ?? 'ルリグ';
    // ルリグ自身の【起】効果か、付与/継承された【起】効果かでラベルを分ける
    const isOwnLrigEffect = (ctx.effectsMap.get(lrigTop ?? '') ?? []).some(e => e.effectId === effect.effectId);
    const entry: import('../../../types').StackEntry = {
      id: generateUUID(),
      playerId: p.actorId,
      cardNum: lrigTop ?? '',
      effectId: effect.effectId,
      label: isOwnLrigEffect ? `${cardName} の【起】効果` : `${cardName} の【起】付与効果`,
      effect,
    };
    // ON_EXCEED_COST: エクシードのコストとしてルリグトラッシュに置かれたカードのトリガー（WXK03-005）
    const entriesLG: import('../../../types').StackEntry[] = [entry];
    for (const cn of exceedPaidCards) {
      for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_EXCEED_COST')) continue;
        if (eff.triggerCondition?.exceedCostPaidByPlayer) continue; // 「あなたが支払ったとき」変種は下の場シグニ走査で処理
        entriesLG.push({
          id: generateUUID(),
          playerId: p.actorId,
          cardNum: cn,
          effectId: eff.effectId,
          label: `${ctx.cardMap.get(cn)?.CardName ?? cn}【自】エクシードコスト時`,
          effect: eff,
        });
      }
    }
    // ON_EXCEED_COST（場のシグニ）: 「あなたがエクシードのコストを支払ったとき」変種（exceedCostPaidByPlayer）。
    // エクシードコストを支払った場合のみ、自分の場のシグニ/ルリグの該当【自】を発火（WXDi-P06-078）。
    if (exceedCost > 0) {
      const myTurnEC = p.actorId === ctx.bs.active_user_id;
      const exceedUsedIds: string[] = [];
      const ecSources: string[] = [
        ...paid.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : [])),
        ...(paid.field.lrig.at(-1) ? [paid.field.lrig.at(-1)!] : []),
      ];
      for (const topEC of ecSources) {
        for (const eff of (ctx.effectsMap.get(topEC) ?? [])) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_EXCEED_COST')) continue;
          if (!eff.triggerCondition?.exceedCostPaidByPlayer) continue;
          const toEC = eff.triggerCondition?.turnOwner;
          if (toEC === 'self' && !myTurnEC) continue;
          if (toEC === 'opponent' && myTurnEC) continue;
          if (eff.usageLimit === 'once_per_turn' &&
              ((paid.actions_done?.includes(eff.effectId)) || exceedUsedIds.includes(eff.effectId))) continue;
          if (eff.usageLimit === 'once_per_turn') exceedUsedIds.push(eff.effectId);
          entriesLG.push({
            id: generateUUID(),
            playerId: p.actorId,
            cardNum: topEC,
            effectId: eff.effectId,
            label: `${ctx.cardMap.get(topEC)?.CardName ?? topEC}【自】エクシードコスト支払い時`,
            effect: eff,
          });
        }
      }
      if (exceedUsedIds.length > 0) paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...exceedUsedIds] };
    }
    // ON_COIN_PAID（C1 配線）＝シグニ【起】と同じく、コインを支払ったら反応【自】を積む。
    if (coinCostLg > 0) {
      const lgCoin = pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, paid, op);
      entriesLG.push(...lgCoin.entries);
      paid = applyCoinPaidUsed(paid, lgCoin); // 《ターン1回/2回》消化を永続化
    }
    const turnPlayerId = ctx.bs.active_user_id ?? p.actorId;
    const existingStack = ctx.bs?.effect_stack ?? null;
    const newStack = existingStack
      ? pushToStack(existingStack, entriesLG)
      : initStack(turnPlayerId, entriesLG);
    const stateKey = p.actorKey;
    const oppStateKeyLrig: PlayerStateKey = p.actorKey === 'host_state' ? 'guest_state' : 'host_state';
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
      opp: newOpVirusStateLrig ? { key: oppStateKeyLrig, state: newOpVirusStateLrig } : undefined,
    }));
  } finally {
    ctx.io.setLoading(false);
  }
};
