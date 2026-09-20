import { coinLedger } from '../../../engine/coinAbilityNegation';
import { beatSigniCostCount, getCardNum, matchesFilter, payBeatSigniCost, removeFromField } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectCoinPaidTriggers as pureCollectCoinPaidTriggers, collectHandDiscardTriggers as pureCollectHandDiscardTriggers } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import { cloneAcceSlots } from '../../../utils/acce';
import { payAttachedOrUnderTrash } from '../attachedOrUnderCost';
import { activateCostZeroApplies } from '../activateCostZero';
import { consumeActivateCostZero } from '../turnScopedState';
import { generateUUID } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { activatedEnergyTrashPaidCount, activatedDiscardCostRecord, handDiscardHistoryRecord } from '../costs';
import { type EnergyPayEntry, planEnergyPayment } from '../energyPaySource';
import { payFieldBanishCost } from '../fieldBanishCost';
import { payFieldToDeckTopCost } from '../fieldToDeckTopCost';
import { payFieldTrashCost } from '../fieldTrashCost';
import { removeKeyToLrigTrash } from '../keyZone';
import { payLrigDownCost } from '../lrigDownCost';
import { payUnderSelfTrash } from '../underAnySigniCost';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
/** ON_COIN_PAID の usedIds（《ターン1回/2回》消化）を payer 状態の actions_done へ書き戻す（旧 `BattleScreen` の1行ヘルパ）。 */
const applyCoinPaidUsed = (st: PlayerState, coin: { usedIds: string[] }): PlayerState =>
  coin.usedIds.length > 0 ? { ...st, actions_done: [...(st.actions_done ?? []), ...coin.usedIds] } : st;

// シグニ起動効果を実行（コスト支払い後）
/**
 * 場のシグニ【起】の実行（人間・CPU 共通）。DESIGN §4「CPU は対人戦と同じ処理を使う」の抽出形＝
 * `performSigniAttack` / `performGuardResponse` と同じく **owner をパラメータ化**し、
 * 人間用 `executeSigniActivated` は薄いラッパーにする。
 *
 * ⚠**「いま撃てるか」の判定はここではなく `signiActivateGate`**（提示と支払いは別の地点＝続き546 教訓 (d)）。
 * ⚠`sel` は**UIで選んだ支払い内訳**＝CPU から呼ぶときは自動選択した index を入れる（空 Set＝選択なし）。
 */
export const performSigniActivated = async (
  cardNum: string,
  effect: import('../../../types/effects').CardEffect,
  sel: {
    costIndices: Set<number>;
    discardCostIndices: Set<number>;
    useKeySub?: boolean;
    discardVarIndices?: Set<number>;
    energyTrashIndices?: Set<number>;
    trashExileIndices?: Set<number>;
    fieldTrashZones?: Set<number>;
    beatZones?: Set<number>;
    underTrashKeys?: Set<string>;
    /** `charmTrashVariable` で選んだ枚数（人間はUIの state、CPU は 0）。 */
    charmTrashVarCount?: number;
  },
  p: {
    actor: PlayerState; opponent: PlayerState;
    actorId: string; opponentId: string;
    actorKey: 'host_state' | 'guest_state';
    /** `buildEnergyPayPool(actor, ...)` の結果（エナ支払い元 funnel）。 */
    energyPayPool: EnergyPayEntry[];
    /** `collectEnergyTrashSubstituteInfo(actor, ...)` の結果（キー代替払い）。 */
    energyTrashSubInfo: { wildcardInstIds: Set<string>; colorOverrideMap: Map<string, string>; keySubInstId: string | null };
  },
  ctx: PerformCtx,
) => {
  const my = p.actor;
  const op = p.opponent;
  const { costIndices, discardCostIndices, discardVarIndices } = sel;
  const underTrashKeys = sel.underTrashKeys ?? new Set<string>();
  const useKeySub = sel.useKeySub ?? false;
  const energyTrashIndices = sel.energyTrashIndices ?? new Set<number>();
  const trashExileIndices = sel.trashExileIndices ?? new Set<number>();
  const fieldTrashZones = sel.fieldTrashZones ?? new Set<number>();
  const beatZones = sel.beatZones ?? new Set<number>();
  const charmTrashVarCount = sel.charmTrashVarCount ?? 0;
  // down_self コストは、対象シグニが既にダウンしていると支払えない（多重発動防止）
  if (effect.cost?.down_self) {
    const dzi = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
    if (dzi >= 0 && (my.field.signi_down?.[dzi] ?? false)) return;
  }
  ctx.io.setLoading(true);
  try {
    // エナコストを支払う（色コスト + energyTrash指定コスト）＝支払い元は funnel 1本（§6.4）。
    // ⚠energyTrash 系は**エナゾーン専用**のコストなので pool ではなく my.energy の index を渡す。
    const signiActPay = planEnergyPayment(my, p.energyPayPool, costIndices, energyTrashIndices);
    const paidNums = signiActPay.paidNums;
    const energyTrashCards = signiActPay.extraEnergyNums;
    // energyTrashAll: エナゾーンのカードをすべてトラッシュ（選択不要、自動）
    const energyTrashAllCards = effect.cost?.energyTrashAll ? [...signiActPay.energyAfter] : [];
    // 手札捨てコストを支払う
    const discardedCards = [...discardCostIndices].map(i => my.hand[i]);
    const discardVarCards = discardVarIndices ? [...discardVarIndices].map(i => my.hand[i]) : [];
    const discardVarLevelSum = discardVarCards.reduce((s, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0', 10) || 0;
      return s + lv;
    }, 0);
    const fixedDiscardLevelSum = discardedCards.reduce((s, cn) => {
      const lv = parseInt((ctx.cardMap.get(cn) ?? ctx.cardMap.get(getCardNum(cn)))?.Level ?? '0', 10) || 0;
      return s + lv;
    }, 0);
    const baseNewHand = my.hand.filter((_, i) => !discardCostIndices.has(i) && !(discardVarIndices?.has(i)));
    // discardAll: 手札をすべて捨てる（選択不要、自動）
    const discardAllCards = effect.cost?.discardAll ? [...baseNewHand] : [];
    const newHand = effect.cost?.discardAll ? [] : baseNewHand;
    // down_self コストの場合はそのゾーンをダウン
    const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
    if (effect.cost?.down_self) {
      const zoneIdx = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (zoneIdx >= 0) newSigniDown[zoneIdx] = true;
    }
    // fieldDown コスト: アップ状態の該当シグニN体をダウン（自動支払い：該当ゾーンを順にダウン）
    if (effect.cost?.fieldDown) {
      const { isUp: _iuFD, isDown: _idFD, ...fdCardFilter } = effect.cost.fieldDown.filter ?? {};
      let remainingFD = effect.cost.fieldDown.count;
      for (let zi = 0; zi < my.field.signi.length && remainingFD > 0; zi++) {
        const fdTop = my.field.signi[zi]?.at(-1);
        if (!fdTop || newSigniDown[zi]) continue;
        if (effect.cost.fieldDown.excludeSelf && fdTop === cardNum) continue;
        if (!matchesFilter(ctx.cardMap.get(getCardNum(fdTop)), fdCardFilter)) continue;
        newSigniDown[zi] = true;
        remainingFD--;
      }
    }
    // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）: キーをルリグトラッシュへ
    // 🔴§5.6 `C-9` `R-46`＝旧実装は **`key_piece_extra: []` と全消し**しており、増設枠のキーが
    //   ルリグトラッシュにも行かずに**消滅**していた（枠を見分ける1本＝`keyZone.ts` へ）。
    const keySub = useKeySub && p.energyTrashSubInfo.keySubInstId;
    const keySubRemovalAct = keySub
      ? removeKeyToLrigTrash(my.field, my.lrig_trash, p.energyTrashSubInfo.keySubInstId!) : null;
    const newField = keySubRemovalAct
      ? { ...keySubRemovalAct.field, signi_down: newSigniDown }
      : { ...my.field, signi_down: newSigniDown };
    const newLrigTrash = keySubRemovalAct ? keySubRemovalAct.lrigTrash : my.lrig_trash;
    // 《コインアイコン》コスト（【起】コイン。activate_cost_zero時は免除）
    const coinCostAct = activateCostZeroApplies(my, cardNum) ? 0 : (effect.cost?.coin ?? 0);
    if (coinCostAct > 0 && (my.coins ?? 0) < coinCostAct) return; // 支払い不能（UI側でも無効化済み）
    // removeOppVirus: 相手の場のウィルスN個を取り除く
    const removeVirusNAct = effect.cost?.removeOppVirus ?? 0;
    let newOpVirusState: typeof op | null = null;
    if (removeVirusNAct > 0) {
      const newOppVirus = [...(op.field.signi_virus ?? [0, 0, 0])];
      let removedV = 0;
      for (let zi = 0; zi < newOppVirus.length && removedV < removeVirusNAct; zi++) {
        while (newOppVirus[zi] > 0 && removedV < removeVirusNAct) { newOppVirus[zi]--; removedV++; }
      }
      if (removedV < removeVirusNAct) return; // 支払い不能
      newOpVirusState = { ...op, field: { ...op.field, signi_virus: newOppVirus } };
    }
    const isGameOnceAct = effect.usageLimit === 'once_per_game';
    // 🆕§5.6 `C-0`＝《黒×0》は「**次に**それの【起】能力を使用する場合」＝一発なので、
    //   **基底の state に対して**消費する（下の各キーを上書きしないよう必ずここで畳む）。
    let paid: PlayerState = signiActPay.applyTo({
      ...consumeActivateCostZero(my, cardNum),
      hand: newHand,
      coins: coinCostAct > 0 ? Math.max(0, (my.coins ?? 0) - coinCostAct) : my.coins,
      coins_paid_this_turn: coinCostAct > 0 ? (my.coins_paid_this_turn ?? 0) + coinCostAct : my.coins_paid_this_turn, // COINS_PAID_THIS_TURN
      // 🆕§5.3 `O-317`/`O-333`＝コイン技（《コイン》を払う能力）の発動台帳。ベット／アンコール／グロウは含めない。
      //   ⚠**`effectId` を積む**＝無効化する側が宣言を引き直して引き算するため（boolean では足りない）。
      coin_abilities_used_this_turn: coinCostAct > 0
        ? [...(my.coin_abilities_used_this_turn ?? []), ...coinLedger(effect)]
        : my.coin_abilities_used_this_turn,
      trash: [...my.trash, ...paidNums, ...energyTrashCards, ...discardedCards, ...discardAllCards, ...energyTrashAllCards, ...discardVarCards],
      // ⚠エナ由来（`energyTrash*`）は台帳に載せない（手札から捨てた分だけ）。
      ...handDiscardHistoryRecord(my, [...discardedCards, ...discardAllCards, ...discardVarCards]),
      lrig_trash: newLrigTrash,
      field: newField,
      actions_done: (effect.usageLimit === 'once_per_turn' || effect.usageLimit === 'twice_per_turn')
        ? [...(my.actions_done ?? []), effect.effectId] : (my.actions_done ?? []),
      game_actions_done: isGameOnceAct ? [...(my.game_actions_done ?? []), effect.effectId] : my.game_actions_done,
      ...activatedDiscardCostRecord(
        discardedCards.length, discardAllCards.length, energyTrashAllCards.length, discardVarCards.length,
      ),
      last_activated_discard_level_sum: discardVarCards.length > 0
        ? discardVarLevelSum
        : discardedCards.length > 0 ? fixedDiscardLevelSum : my.last_activated_discard_level_sum,
      last_cost_trashed_cards: [
        ...paidNums,
        ...discardedCards, ...discardAllCards, ...discardVarCards,
        ...energyTrashCards, ...energyTrashAllCards,
      ],
      last_cost_energy_trash_count: activatedEnergyTrashPaidCount(energyTrashIndices),
      // DISCARD_BY_POWER_MATCH: handDiscardSigniコストで捨てたシグニのパワーを記録
      last_discarded_signi_power: discardedCards.length > 0
        ? (parseInt(ctx.cardMap.get(discardedCards[0])?.Power ?? '0', 10) || undefined)
        : my.last_discarded_signi_power,
      // levelLteDiscardSigni: handDiscardSigniコストで捨てたシグニのレベルを記録
      last_discarded_signi_level: discardedCards.length > 0
        ? (() => { const lv = parseInt(ctx.cardMap.get(discardedCards[0])?.Level ?? '', 10); return isNaN(lv) ? my.last_discarded_signi_level : lv; })()
        : my.last_discarded_signi_level,
      // classMatchesDiscardSigni: 捨てたシグニのCardClassを記録（「それと共通するクラスを持つ」WXK10-033）
      last_discarded_signi_class: discardedCards.length > 0
        ? (ctx.cardMap.get(discardedCards[0])?.CardClass ?? my.last_discarded_signi_class)
        : my.last_discarded_signi_class,
      // 🆕**`selfPowerDown`＝「ターン終了時まで、このシグニのパワーを－N する」コスト**
      //   （2026-09-05・§5.3 `O-255`・live 3効果）。
      // 🔴**parser も逆翻訳も対応済みなのに engine/UI のどこにも消費が無く、自傷ぶんが
      //   一度も起きていなかった**＝コストが原文より安い（過剰実行）。
      // ⚠**期間はターン終了時まで**なので `temp_power_mods`（ターン境界でクリア）へ積む
      //   ＝`field_power_mods`（クリアしない）に積むと永久に下がる。
      ...(effect.cost?.selfPowerDown
        ? { temp_power_mods: [...(my.temp_power_mods ?? []),
            { cardNum, delta: -effect.cost.selfPowerDown, srcCardNum: cardNum }] }
        : {}),
    });
    // energyTrashAll: エナゾーンを空にする（funnel の index 控除のあとに当てる）
    if (effect.cost?.energyTrashAll) paid = { ...paid, energy: [] };
    // underSelfTrash: 効果元シグニの下から、UIで選んだカードだけをトラッシュへ置く。
    if (effect.cost?.underSelfTrash) {
      const zoneIdx = paid.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
      if (zoneIdx < 0) return;
      const underPaid = payUnderSelfTrash(
        paid, zoneIdx, underTrashKeys, effect.cost.underSelfTrash.count, ctx.cardMap,
        effect.cost.underSelfTrash.filter, effect.cost.underSelfTrash.selectionConstraint,
      );
      if (!underPaid) return;
      paid = {
        ...underPaid.state,
        last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...underPaid.moved],
      };
    }
    // 🆕§5.3 `O-313`（2026-09-12・`WXK10-018-E2`）＝「シグニに**付いている**カード1枚か
    //   **下にある**カード1枚をトラッシュに置く」。
    // ⚠**提示ゲート（`signiActivateGate`）と支払いUI（`SigniActivatedModal`）と同じ関数**を通す。
    // ⚠選択 state は `underTrashKeys` を共用するが、**中身はカードの instanceId**
    //   （`underSelfTrash` の `"<zone>:<index>"` キーとは別物）。
    if (effect.cost?.attachedOrUnderTrash) {
      const attachedPaid = payAttachedOrUnderTrash(paid, underTrashKeys, effect.cost.attachedOrUnderTrash.count);
      if (!attachedPaid) return;
      paid = {
        ...attachedPaid.state,
        last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), ...attachedPaid.moved],
      };
    }
    // trashExile: トラッシュからカードをゲームから除外（lrig_trashへ）
    if (effect.cost?.trashExile?.self) {
      paid = { ...paid, trash: paid.trash.filter(cn => cn !== cardNum), lrig_trash: [...paid.lrig_trash, cardNum] };
    } else if (trashExileIndices.size > 0) {
      const exiledNums = [...trashExileIndices].map(i => my.trash[i]);
      paid = { ...paid, trash: paid.trash.filter((_, i) => !trashExileIndices.has(i)), lrig_trash: [...paid.lrig_trash, ...exiledNums] };
    }
    // trash_self: このシグニを場からトラッシュに置く（起動コスト）
    if (effect.cost?.trash_self) {
      const selfLevel = parseInt((ctx.cardMap.get(cardNum) ?? ctx.cardMap.get(getCardNum(cardNum)))?.Level ?? '', 10);
      const afterRemove = removeFromField(cardNum, paid);
      paid = {
        ...afterRemove,
        trash: [...afterRemove.trash, cardNum],
        last_field_trash_level: isNaN(selfLevel) ? paid.last_field_trash_level : selfLevel,
        last_cost_trashed_cards: [...(paid.last_cost_trashed_cards ?? []), cardNum],
      };
    }
    // 🆕bounceSelf: このシグニを場から手札に戻す起動コスト（§5.3 `O-167`）。
    // ⚠**`trash_self` と行き先だけが違う**＝離場処理は同じ `removeFromField` を通し、
    //   行き先だけ `hand` にする（写経すると下敷き・チャームの後始末が片方だけ落ちる）。
    if (effect.cost?.bounceSelf) {
      const afterRemoveB = removeFromField(cardNum, paid);
      paid = { ...afterRemoveB, hand: [...afterRemoveB.hand, cardNum] };
    }
    // fieldExileSelf: このシグニ自身を場からゲームから除外する起動コスト。
    // removeFromField で下敷き・チャーム・アクセの離場処理を共通化し、効果元本体だけ excluded へ置く。
    if (effect.cost?.fieldExileSelf) {
      const afterRemove = removeFromField(cardNum, paid);
      paid = {
        ...afterRemove,
        excluded: [...(afterRemove.excluded ?? []), cardNum],
      };
    }
    // charmTrash: 自分の場のチャームN枚をトラッシュ（固定枚数・自動選択）
    const charmTrashNAct2 = effect.cost?.charmTrash ?? 0;
    if (charmTrashNAct2 > 0) {
      const newCharmsAct = [...(paid.field.signi_charms ?? [null, null, null])];
      const movedCA: string[] = [];
      for (let zi = 0; zi < newCharmsAct.length && movedCA.length < charmTrashNAct2; zi++) {
        if (newCharmsAct[zi]) { movedCA.push(newCharmsAct[zi]!); newCharmsAct[zi] = null; }
      }
      if (movedCA.length < charmTrashNAct2) return; // 支払い不能
      paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsAct }, trash: [...paid.trash, ...movedCA] };
    }
    // charmTrashVariable: チャームを可変枚数トラッシュ（プレイヤーが選択した枚数）
    const charmVarActCost = effect.cost?.charmTrashVariable;
    if (charmVarActCost) {
      const n = charmTrashVarCount;
      if (n < charmVarActCost.min) return;
      if (n > 0) {
        const newCharmsActV = [...(paid.field.signi_charms ?? [null, null, null])];
        const movedActV: string[] = [];
        for (let zi = 0; zi < newCharmsActV.length && movedActV.length < n; zi++) {
          if (newCharmsActV[zi]) { movedActV.push(newCharmsActV[zi]!); newCharmsActV[zi] = null; }
        }
        if (movedActV.length < n) return;
        paid = { ...paid, field: { ...paid.field, signi_charms: newCharmsActV }, trash: [...paid.trash, ...movedActV], last_charm_trash_count: n };
      } else {
        paid = { ...paid, last_charm_trash_count: 0 };
      }
    }
    // acceTrash: あなたの【アクセ】N枚をトラッシュ（自動選択。先頭のゾーンから）
    const acceTrashNAct = effect.cost?.acceTrash ?? 0;
    if (acceTrashNAct > 0) {
      const newAcceAct = cloneAcceSlots(paid.field);
      const movedAcceAct: string[] = [];
      for (let zi = 0; zi < newAcceAct.length && movedAcceAct.length < acceTrashNAct; zi++) {
        while (newAcceAct[zi]?.length && movedAcceAct.length < acceTrashNAct) {
          movedAcceAct.push(newAcceAct[zi]!.shift()!);
        }
        if (newAcceAct[zi]?.length === 0) newAcceAct[zi] = null;
      }
      if (movedAcceAct.length < acceTrashNAct) return; // 支払い不能
      paid = { ...paid, field: { ...paid.field, signi_acce: newAcceAct }, trash: [...paid.trash, ...movedAcceAct] };
    }
    // fieldBanish: 場のシグニをコストで**バニッシュ**（§5.3 `O-67`・`WX05-044-E1`）。
    // 🔴**行き先はエナゾーン**＝下の `fieldTrash` ブロック（トラッシュ送り）へ落とすと資源を失う。
    // ⚠ゾーン選択 state は `fieldTrashZones` を共用する（parser は両キーを同時に立てない）。
    // ⚠支払ったカードは `last_cost_trashed_cards` に載せない（トラッシュ由来として観測されるため）。
    const fieldBanishCostAct = effect.cost?.fieldBanish;
    if (fieldBanishCostAct) {
      const fbPaidAct = payFieldBanishCost({
        my: paid, op, zones: fieldTrashZones, cost: fieldBanishCostAct,
        cardMap: ctx.cardMap, turnPhase: ctx.bs.turn_phase as import('../../../types').TurnPhase,
      });
      if (!fbPaidAct) { ctx.io.setLoading(false); return; } // 支払い不能（UI側でも無効化済み）
      paid = fbPaidAct.state;
    }
    // 🆕fieldToDeckTop: 場のシグニをコストで**デッキの一番上**へ（§5.3 `O-256`・`WXK10-057-E2`）。
    // 🔴**行き先が違う**＝下の `fieldTrash` ブロック（トラッシュ送り）へ落とすと資源を失う。
    // ⚠ゾーン選択 state は `fieldTrashZones` を共用する（parser は3キーを同時に立てない）。
    const fieldToDeckTopCostAct = effect.cost?.fieldToDeckTop;
    if (fieldToDeckTopCostAct) {
      const ftdPaidAct = payFieldToDeckTopCost({
        my: paid, zones: fieldTrashZones, cost: fieldToDeckTopCostAct, cardMap: ctx.cardMap,
      });
      if (!ftdPaidAct) { ctx.io.setLoading(false); return; } // 支払い不能（UI側でも無効化済み）
      paid = ftdPaidAct.state;
      ctx.io.appendLogs(ftdPaidAct.logs);
    }
    // fieldTrash: 場のシグニをコストでトラッシュ（チャーム/アクセも一緒に。WX03-035「他の＜古代兵器＞のシグニ1体を場からトラッシュ」等）
    // ⚠支払いは `payFieldTrashCost` 1本（§5.3 `O-271` で funnel 化）＝写経すると軸が割れる。
    if (!fieldBanishCostAct && !fieldToDeckTopCostAct && fieldTrashZones.size > 0) {
      paid = payFieldTrashCost({ state: paid, zones: fieldTrashZones, cost: effect.cost, cardMap: ctx.cardMap }).state;
    }
    // beat_signi: シグニを【ビート】にするコスト（自動選択・近似。beat_zone へ移し ON_BECOME_BEAT 用フラグを積む）
    if (beatSigniCostCount(effect.cost?.beat_signi) > 0) {
      const beatPayA = payBeatSigniCost(paid, cardNum, ctx.cardMap, effect.cost!.beat_signi!, [...beatZones]);
      if (!beatPayA.ok) { ctx.io.setLoading(false); return; } // 支払い不能（対象不足）
      paid = beatPayA.state;
    }
    // lrigDown: アップ状態のルリグをダウン（センター→アシストL→Rの順で自動支払い）。
    // 【出】経路（executeSigniOnPlayCost:11298）と同型。⚠ここが無いと【起】の
    // 《アップ状態の〜ルリグN体をダウンする》コストが丸ごと素通りする（タスク12(cviii)）。
    const lrigDownCostAct = effect.cost?.lrigDown;
    if (lrigDownCostAct) {
      const lrigPaidAct = payLrigDownCost(paid, lrigDownCostAct, ctx.cardMap);
      if (!lrigPaidAct) return; // 支払い不能（UI側でも無効化済み）
      paid = lrigPaidAct.state;
    }
    // GRANT_TURN_TRIGGER_3RD_DOWN: 植物シグニがdown_selfコストでダウンした回数を追跡
    let plant3rdDownTriggerEntry: StackEntry | null = null;
    if (effect.cost?.down_self && my.turn_trigger_3rd_plant_down) {
      const signiCard3D = ctx.cardMap.get(cardNum);
      if (signiCard3D?.CardClass?.includes('植物')) {
        const newPlantDownCount = (my.turn_plant_down_count ?? 0) + 1;
        paid = { ...paid, turn_plant_down_count: newPlantDownCount };
        if (newPlantDownCount === 3) {
          const banishEff3D: import('../../../types/effects').CardEffect = {
            effectId: `plant_3rd_down_${generateUUID()}`,
            effectType: 'ACTIVATED',
            duration: 'INSTANT',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as import('../../../types/effects').BanishAction,
                { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1 } } as import('../../../types/effects').TransferToHandAction,
                { type: 'DRAW', owner: 'self', count: 1 } as import('../../../types/effects').DrawAction,
              ],
            } as import('../../../types/effects').SequenceAction,
          };
          plant3rdDownTriggerEntry = {
            id: generateUUID(),
            playerId: p.actorId,
            cardNum,
            effectId: banishEff3D.effectId,
            label: `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum} 植物3回目ダウン：相手シグニ1体バニッシュ`,
            effect: banishEff3D,
          };
        }
      }
    }
    // 効果をスタックに積む
    const cardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
    const entry: StackEntry = {
      id: generateUUID(),
      playerId: p.actorId,
      cardNum,
      effectId: effect.effectId,
      label: `${cardName} の【起】効果`,
      effect,
    };
    const stackEntries: StackEntry[] = plant3rdDownTriggerEntry
      ? [entry, plant3rdDownTriggerEntry]
      : [entry];
    // ON_DISCARDED_AS_COST / ON_HAND_DISCARDED: 【起】コストで手札を捨てた場合のトリガー
    const allDiscardedForTrigger = [...discardedCards, ...discardAllCards, ...discardVarCards];
    if (allDiscardedForTrigger.length > 0) {
      const { entries: hdEntries, usedLimitIds } = pureCollectHandDiscardTriggers(ctx.trigCtx(), 
        allDiscardedForTrigger, paid, p.actorId, true,
        op, p.opponentId, cardNum, undefined, undefined);
      stackEntries.push(...hdEntries);
      if (usedLimitIds.length > 0) {
        paid = { ...paid, actions_done: [...(paid.actions_done ?? []), ...usedLimitIds] };
      }
    }
    // ON_COIN_PAID（C1 配線・シグニ【起】《コイン》）: コインを支払った場合に反応【自】を積む。
    if (coinCostAct > 0) {
      const actCoin = pureCollectCoinPaidTriggers(ctx.trigCtx(), p.actorId, paid, op);
      stackEntries.push(...actCoin.entries);
      paid = applyCoinPaidUsed(paid, actCoin); // 《ターン1回/2回》消化を永続化（続き106）
    }
    const turnPlayerId = ctx.bs.active_user_id ?? p.actorId;
    const existingStack = ctx.bs?.effect_stack ?? null;
    const newStack = existingStack
      ? pushToStack(existingStack, stackEntries)
      : initStack(turnPlayerId, stackEntries);
    const stateKey = p.actorKey;
    const oppStateKey: 'host_state' | 'guest_state' = p.actorKey === 'host_state' ? 'guest_state' : 'host_state';
    // ウィルス除去が起きた場合のみ自状態にマーカーを立てる（旧：payload を後から差し替えていた）
    if (newOpVirusState) paid = { ...paid, opp_virus_removed_just: true };
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey: stateKey, myState: paid, effectStack: newStack, clearPending: true,
      opp: newOpVirusState ? { key: oppStateKey, state: newOpVirusState } : undefined,
    }));
  } finally {
    ctx.io.setLoading(false);
  }
};
