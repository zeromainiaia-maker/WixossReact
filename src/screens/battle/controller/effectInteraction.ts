/**
 * 🆕**対話の解決（`pending_effect` の resume）**（§5.7 `S-5d` 第1段・2026-09-19）。
 *
 * ■ **なぜここへ出すか**＝`createHeadlessBattle` は「対話が立ったら止まる＝**答えるのは呼び出し側の仕事**」と
 *   決めてあるのに、**その「答える」7本（`handleEffectInteraction` ほか・計566行）が画面にしか無かった**＝
 *   ヘッドレスでは**どちら側の対話にも答えられない**（`S-5d` の「人間側ターンの駆動」も CPU 同士の自己対戦も、
 *   ここを通らないと1歩も進まない）。
 * ■ **中身は逐語移設**（画面からそのまま移した＝機械 diff が空）。読み替えているのは**材料の取り出し方だけ**で、
 *   `bs` / `loading` / `persist` / `appendBattleLogs` … は**画面と同じ名前**に束ね直してある。
 *
 * ⚠**UI の状態は4つだけ受ける**（`loading` ／ `lookReorderTrash` ／ `lookReorderBottom` ／
 *   `setEffectSelectedNums`・`setRearrangeSlots`）。🔴**これ以上 UI を持ち込まない**＝
 *   モーダルの開閉・ref・React の state はここの仕事ではない。
 * ⚠**`loading` は引数で受ける**（画面の多重クリック防止）。ヘッドレスは常に `false`
 *   ＝同期ループなので「前の操作が飛んでいる最中」が無い。
 * ⚠**`finalizePendingSpellPlacement` / `nextRespondPatch` も一緒に移した**＝
 *   画面のモジュール直下に置いてあったが、**呼び出しはこの7本の中だけ**（実測）。
 */
import { calcFieldPowers, collectAllColorSigniForField, collectFieldSigniExtraColors, collectTreatAsClassAllZones, collectDeckTrashLevel1Nums, applyDeclaredZoneClassOverride, applyContinuousBaseLevelOverride } from '../../../engine/effectEngine';
import { applyRefreshOnDone, resumeSelectTarget, resumeSearch, resumeChoose, resumeOptionalCost, resumeOpponentPayOptional, resumeLookAndReorder, resumeSelectZone, resumeSelectSigniZone, resumeSelectVirusZone, resumeRevealCards, resumeRearrangeSigni, resumeAllocatePower, getCardNum, type ExecCtx, type ExecResult } from '../../../engine/effectExecutor';
import { resolvePendingExiles, pendingRespondsOpponent } from '../../../engine/execUtils';
import { initStack, pushToStack, confirmTurnOrder, confirmOppOrder, isStackDone } from '../../../engine/effectStack';
import { collectTargetedTriggers as pureCollectTargetedTriggers, type TargetedOrigin } from '../../../engine/triggerCollect';
import { collectTrapActivateTriggers as pureCollectTrapActivateTriggers, collectTrapSetTriggers as pureCollectTrapSetTriggers } from '../../../engine/triggerCollect';
import type { EffectStack, PendingEffect, PendingInteractionDef, PlayerState, StackEntry } from '../../../types';
import { buildRearrangeSigniArrangement } from '../rearrangeSigniUi';
import { finalizeUsedCardPlacement } from '../spellPlacement';
import { resolveTargetDodgeFlip } from '../targetDodgeFlip';
import { collectArtsUseForResolution as bdCollectArtsUse, collectOppArtsUseForResolution as bdCollectOppArtsUse } from './artsUseTriggers';
import { reduceBattle } from './battleController';
import { makeFillDeployCaps } from './execCtxDeps';
import type { PerformCtx } from './performCtx';
import { fieldPlacementOnPlayOpts } from './stackResolve';

// 🆕§5.7 `S-5d` 第1段＝画面のモジュール直下から逐語で移設（呼び出しは下の7本の中だけ）。
function finalizePendingSpellPlacement(result: ExecResult, pe: PendingEffect): ExecResult {
  if (!result.done || !pe.spellPlacement) return result;
  return {
    ...result,
    ownerState: finalizeUsedCardPlacement(result.ownerState, pe.sourceCardNum, pe.spellPlacement),
  };
}

/**
 * 次の pending の応答者パッチ（§6.4 O-2）。
 *
 * ⚠resume 系ハンドラは一律に `respondPlayerId` を捨てて次の pending を作る（＝効果オーナーへ戻す）。
 *   これは「相手が1回だけ応答する」型には正しいが、**次の pending 自身が相手応答型**のときは
 *   相手が選ぶべき対話を効果オーナーが代わりに操作してしまう。1枚ずつゾーンを選ぶ配置チェーン
 *   （「対戦相手はその中からシグニをN枚まで場に出し」）は2枚目以降がこれに当たる。
 *   `pendingRespondsOpponent` が false のときは空オブジェクト＝**従来挙動と厳密に同じ**。
 */
function nextRespondPatch(
  pending: PendingInteractionDef, sourcePlayerId: string, hostId: string, guestId: string,
): { respondPlayerId?: string } {
  return pendingRespondsOpponent(pending)
    ? { respondPlayerId: sourcePlayerId === hostId ? guestId : hostId }
    : {};
}

/** 画面だけが持つもの（ヘッドレスは `loading:false` だけ渡す）。 */
export interface EffectInteractionUi {
  /** 画面の操作ロック（多重クリック防止）。ヘッドレスは `false`。 */
  loading: boolean;
  /** `LOOK_AND_REORDER` でトラッシュへ送る印（画面のモーダルの選択）。 */
  lookReorderTrash?: Set<string>;
  /** `LOOK_AND_REORDER` でデッキの一番下へ送る印（同上）。 */
  lookReorderBottom?: Set<string>;
  /** 効果の対象選択で選んでいた札の印を消す（画面のみ）。 */
  setEffectSelectedNums?: (v: string[]) => void;
  /** シグニ配置し直しモーダルのスロットを消す（画面のみ）。 */
  setRearrangeSlots?: (v: (string | null)[]) => void;
}

/**
 * 画面と同じ材料で、対話解決の7本を作る。
 * 🔑**7本まとめて1つの factory にしてあるのは、本体を1行も書き換えずに移すため**
 *   （個別 export にすると全部の関数へ材料を配り直すことになり、逐語でなくなる）。
 */
export function makeEffectInteractionHandlers(c: PerformCtx, p: EffectInteractionUi) {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const bs = c.bs;
  const loading = p.loading;
  const setLoading = c.io.setLoading;
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;
  const flushBattleLogs = c.io.flushLogs;
  const user = { id: c.userId };
  const isHost = c.isHost;
  const effectsMap = c.effectsMap;
  const battleCardMap = c.cardMap;
  const mkTrigCtx = c.trigCtx;
  const collectBoardDiffTriggers = c.collectBoardDiff;
  const fillDeployCaps = makeFillDeployCaps({ cardMap: battleCardMap, effectsMap });
  const artsUseDeps = () => ({ bs, cardMap: battleCardMap, userId: user.id, isHost, trigCtx: mkTrigCtx });
  const collectArtsUseForResolution = (a: Parameters<typeof bdCollectArtsUse>[1]) => bdCollectArtsUse(artsUseDeps(), a);
  const collectOppArtsUseForResolution = (a: Parameters<typeof bdCollectOppArtsUse>[1]) => bdCollectOppArtsUse(artsUseDeps(), a);
  // ── 画面にあった薄いラッパ（逐語）──
  const collectTargetedTriggers = (targetedNums: string[], targetedOwnerId: string, afterHostState: PlayerState, afterGuestState: PlayerState, origin?: TargetedOrigin, beforeHostState: PlayerState = afterHostState, beforeGuestState: PlayerState = afterGuestState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectTargetedTriggers(mkTrigCtx(), targetedNums, targetedOwnerId, afterHostState, afterGuestState, origin, beforeHostState, beforeGuestState);
  const collectTrapActivateTriggers = (
    ownerId: string,
    hostState: PlayerState,
    guestState: PlayerState,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } => {
    const ownerState = ownerId === bs.host_id ? hostState : guestState;
    const otherState = ownerId === bs.host_id ? guestState : hostState;
    return pureCollectTrapActivateTriggers(mkTrigCtx(), ownerId, ownerState, otherState);
  };
  const lookReorderTrash = p.lookReorderTrash ?? new Set<string>();
  const lookReorderBottom = p.lookReorderBottom ?? new Set<string>();
  const setEffectSelectedNums = (v: string[]) => p.setEffectSelectedNums?.(v);
  const setRearrangeSlots = (v: (string | null)[]) => p.setRearrangeSlots?.(v);

  /** 自分の未整列効果のID配列を引数として順序を確定する */
  const handleConfirmStackOrder = async (orderedIds: string[]) => {
    if (!bs?.effect_stack || loading) return;
    setLoading(true);
    try {
      const isTurnPlayer = bs.active_user_id === user.id;
      const stack = isTurnPlayer
        ? confirmTurnOrder(bs.effect_stack, orderedIds)
        : confirmOppOrder(bs.effect_stack, orderedIds);
      await persist.commit(reduceBattle(bs, { type: 'SET_STACK', stack: stack, settle: true }));
    } finally {
      setLoading(false);
    }
  };

  // --- pending_effect インタラクション解決 ---

  const handleEffectInteraction = async (selectedOrChoiceId: string[]) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap, battleCardMap);
      const declaredCardMap2 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap2, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourceEffectId: pe.effectId, sourcePlacementPending: !!pe.spellPlacement, triggeringCardNum: pe.triggeringCardNum, leftFieldUnderCards: pe.leftFieldUnderCards, sourceLeftZoneIdx: pe.sourceLeftZoneIdx, triggeringKeyword: pe.triggeringKeyword, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, storedTargetCards: pe.storedTargetCards, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const inter = pe.interaction;

      let result: ExecResult;
      // §6.4 O-10（続き516）＝「このシグニが対戦相手の、能力か効果の対象になったとき、このシグニを
      // 裏向きにし、表向きにする」（`WX25-CP1-060-E2`）＝**新しいオブジェクトになってその効果の対象から外れる**。
      // 🔑`ON_TARGETED` トリガーは `resumeSelectTarget` が効果を適用し**終えた後**に積まれる（下の収集）ので、
      //   トリガーとしては表現できない＝**対象宣言の直後・適用の前**であるこの1点でしか解決できない。
      // ⚠該当宣言が対象に1体も居なければ `dodged` は空＝**従来とまったく同じ経路**を通る（ホットパスの安全条件）。
      let selectedForResume = selectedOrChoiceId;
      if (inter.type === 'SELECT_TARGET') {
        const dodgeOwnerIsHost = pe.sourcePlayerId !== bs.host_id;   // 対象の持ち主＝効果主の対戦相手
        const dodgeOwnerState = dodgeOwnerIsHost ? bs.host_state : bs.guest_state;
        const flip = resolveTargetDodgeFlip({
          targeted: selectedOrChoiceId,
          targetOwnerState: dodgeOwnerState,
          sourceState: dodgeOwnerIsHost ? bs.guest_state : bs.host_state,
          isTargetOwnerTurn: bs.active_user_id === (dodgeOwnerIsHost ? bs.host_id : bs.guest_id),
          cardMap: battleCardMap, effectsMap, turnPhase: bs.turn_phase ?? undefined,
        });
        if (flip.dodged.length > 0) {
          selectedForResume = selectedOrChoiceId.filter(n => !flip.dodged.includes(n));
          // ⚠ctx 側にも反映しないと、以降の解決が**失効前の state** を見てもう一度回避できてしまう。
          if (dodgeOwnerIsHost === ownerIsHost) ctx.ownerState = flip.state; else ctx.otherState = flip.state;
          appendBattleLogs([`${flip.dodged.map(n => battleCardMap.get(getCardNum(n))?.CardName ?? n).join('・')}は裏向きになり表向きになった（対象から外れる）`], { defer: true });
        }
      }
      if (inter.type === 'SELECT_TARGET') {
        result = resumeSelectTarget(selectedForResume, inter, ctx);
      } else if (inter.type === 'SEARCH') {
        result = resumeSearch(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'CHOOSE') {
        const choiceId = selectedOrChoiceId[0] ?? '';
        const opt = inter.options.find(o => o.id === choiceId);
        if (inter.leaveSubstituteAsk || inter.costlessOpponentChoice) {
          // §6.4 離場置換の可否／カード名の宣言（どちらもコスト無し）＝素の resumeChoose。
          //   ⚠下の opponentResponds 分岐へ落とすと `resumeOpponentPayOptional` が「エナ不足」で
          //   即終了し**無言で潰れる**。
          result = resumeChoose(choiceId, inter, ctx);
        } else if (inter.opponentResponds) {
          // 対戦相手払い選択: resumeOpponentPayOptional で otherState のエナを消費
          const energyNums = selectedOrChoiceId.slice(1);
          result = resumeOpponentPayOptional(choiceId, energyNums, inter, ctx);
        } else if (opt?.costColors?.length || opt?.coinCost) {
          // 任意コスト付き選択: resumeOptionalCost でエナ／コイン消費処理
          const energyNums = selectedOrChoiceId.slice(1);
          result = resumeOptionalCost(choiceId, energyNums, inter, ctx);
        } else if (inter.multiSelect) {
          // 複数選択UI: selectedOrChoiceId が選択された全choiceId配列
          result = resumeChoose(selectedOrChoiceId, inter, ctx);
        } else {
          result = resumeChoose(choiceId, inter, ctx);
        }
      } else if (inter.type === 'LOOK_AND_REORDER') {
        const trashList = inter.canTrash ? selectedOrChoiceId.filter(n => lookReorderTrash.has(n)) : [];
        const bottomList = inter.destPosition === 'split_top_bottom'
          ? selectedOrChoiceId.filter(n => lookReorderBottom.has(n)) : [];
        result = resumeLookAndReorder(selectedOrChoiceId, trashList, inter, ctx, bottomList);
      } else if (inter.type === 'REVEAL_CARDS') {
        // 閲覧専用モーダルの確認（OK）→ continuation を実行
        result = resumeRevealCards(inter, ctx);
      } else {
        return;
      }
      if (result.done && (pe.effectId === 'WX15-002-sub-E1' || pe.effectId === 'WXEX2-15-E2')) {
        result = { ...result, ownerState: { ...result.ownerState, is_holograph_this_effect: undefined } };
      }
      // デッキ0枚→リフレッシュ（インタラクション解決後）。
      result = applyRefreshOnDone(result, battleCardMap);
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = resolvePendingExiles(ownerIsHost ? result.ownerState : result.otherState);
      const guestState = resolvePendingExiles(ownerIsHost ? result.otherState : result.ownerState);
      // パッチ（両者の盤面／pending_effect／effect_stack）は**型付きローカルへ**積み、commit 直前に
      // `RESOLVE_EFFECT_STEP` の payload として1回だけ渡す。旧実装は `Record<string, unknown>` の
      // `update` を直接積み増し、`'host_state' in update ? … : hostState` で読み戻していた
      // （`host_state`/`guest_state` は初期化済みなので **`in` は常に true**＝読み戻し先は常に累積値）。
      // ⚠ `effect_stack` だけは初期化されない＝**未書き込み（undefined）なら土台は `bs.effect_stack`**。
      let hostAcc = hostState;
      let guestAcc = guestState;
      let stackAcc: EffectStack | null | undefined;
      let pendingAcc: PendingEffect | null;

      // ON_TARGETED（C1 配線）: SELECT_TARGET で「対戦相手のシグニ」を対象に取った瞬間に発火する。
      // 対象＝効果発生源の対戦相手側に置かれていたシグニ（対象選択前の盤面で所有者を判定）。
      // CPU所有効果のSELECT_TARGETも本関数を通る（自動応答経由）ため、人間/CPU双方をここでカバー。
      let targetedEntries: StackEntry[] = [];
      let targetedUsedHostIds: string[] = [];
      let targetedUsedGuestIds: string[] = [];
      if (inter.type === 'SELECT_TARGET') {
        const sourceIsHost = pe.sourcePlayerId === bs.host_id;
        const oppOfSourceId = sourceIsHost ? bs.guest_id : bs.host_id;
        const beforeOppOfSource = sourceIsHost ? bs.guest_state : bs.host_state;
        const targetedNums = selectedOrChoiceId.filter(n =>
          beforeOppOfSource.field.signi.some(s => s?.at(-1) === n));
        if (targetedNums.length > 0) {
          const originEffect = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
            .find(e => e.effectId === pe.effectId);
          const tt = collectTargetedTriggers(
            targetedNums, oppOfSourceId, hostState, guestState,
            originEffect ? { cardNum: pe.sourceCardNum, effect: originEffect } : undefined,
            bs.host_state, bs.guest_state,
          );
          targetedEntries = tt.entries;
          targetedUsedHostIds = tt.usedHostIds;
          targetedUsedGuestIds = tt.usedGuestIds;
        }
      }

      if (!result.done) {
        // continuationが発生した場合、次のインタラクションは効果オーナーが応答する（respondPlayerIdをリセット）。
        // ⚠次の pending 自身が「相手が応答する」型なら、**効果オーナーの対戦相手**を再計算して割り当てる。
        //   `pe.respondPlayerId` の引き継ぎでは、相手応答でない対話（例 SEARCH）から相手応答の対話へ
        //   移った1手目で undefined のままになり、効果オーナーが相手の代わりに選んでしまう（§6.4 O-2）。
        const nextRespondPlayerId = pendingRespondsOpponent(result.pending)
          ? (ownerIsHost ? bs.guest_id : bs.host_id)
          : undefined;
        const { respondPlayerId: _drop, ...peBase } = pe;
        pendingAcc = {
          ...peBase,
          ...(nextRespondPlayerId ? { respondPlayerId: nextRespondPlayerId } : {}),
          interaction: result.pending,
          ...(result.trapSetOwners ? { trapSetOwners: result.trapSetOwners } : {}),
          ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}),
        } satisfies PendingEffect;
        // === 途中ラウンドの盤面差分トリガー（続き75・Opus）===
        // 複数ラウンドのインタラクションを要する SEQUENCE（例 WXEX2-50＝①相手トラッシュ→相手の場に出す→
        // ②自トラッシュ→自分の場に出す）では、step1 で確定した盤面変化がここ（!result.done）で DB へコミットされる。
        // 従来はこの分岐で ON_BANISH だけを特例収集しており、それ以外のトリガー（ON_PLAY any_opp 等）は
        // 一度も diff 評価されないまま bs.host_state/bs.guest_state に取り込まれ、次ラウンドが done で完了した時点の
        // collectBoardDiffTriggers では before に step1 の変化が既に含まれる＝**差分ゼロで永久に見逃されていた**
        // （続き70で R30/WXK10-022-E1 が実機FAIL）。done 分岐と同じ統合収集をここでも行う。
        // ⚠ pending_effect が残ったままスタックに積むが、これは従来の ON_BANISH 特例と同じ扱い（pending 解決後に
        //    スタックが処理される）＝新しい実行順序を持ち込むものではない。
        const midBd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          fieldTrashCostCards: result.fieldTrashCostCards,
          ...fieldPlacementOnPlayOpts(
            (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
              .find(e => e.effectId === pe.effectId),
          ),
        });
        hostAcc = midBd.hostState;
        guestAcc = midBd.guestState;
        if (midBd.entries.length > 0) {
          const existingMidStack = bs.effect_stack ?? null;
          stackAcc = existingMidStack
            ? pushToStack(existingMidStack, midBd.entries)
            : initStack(bs.active_user_id ?? user.id, midBd.entries);
        }
      } else {
        pendingAcc = null;

        // === 盤面差分トリガーの統合収集（続き61・Opus）===
        // resolveStackNext の中央 diff と同一の collectBoardDiffTriggers を呼び、resume 経路（対象選択/CHOOSE を挟んで
        // 完了した効果）でも全トリガー種別を取りこぼさず収集する（従来は banish/bloom/armor/leave/ds/bn/lu/kg/fz の 9 種のみで、
        // ON_OPP_POWER_DECREASED/ON_ENERGY_TO_TRASH/ON_DRAW〔SEQUENCE内対話〕/ON_TRASH self 等を取りこぼしていた・§6.3 続き58/60）。
        const bd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          fieldTrashCostCards: result.fieldTrashCostCards,
          ...fieldPlacementOnPlayOpts(
            (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
              .find(e => e.effectId === pe.effectId),
          ),
        });
        hostAcc = bd.hostState;
        guestAcc = bd.guestState;
        const pendingEntries = bd.entries;
        // 🔴§5.3 `O-131`＝**この経路にも `ON_OPP_ARTS_USE` の収集が要る**。
        //   `selectOrInteract` は**候補が1件でも必ず中断する**ので、対象を取る相手のアーツは
        //   `resolveStackNext` ではなく**ここで完了する**。抽出前は収集が向こうにしか無く、
        //   `ON_OPP_ARTS_USE` を持つ live 6効果は**実機で一度も発火していなかった**。
        // ⚠差分の基準（`beforeMine`）は**この resume 段の直前**＝中断より前に確定した影響は数えない
        //   （過小side。`O-113` の「盤面に出る影響だけを見る」方針と同じ向き）。
        const artsTrigRe = collectOppArtsUseForResolution({
          artsOwnerId: pe.sourcePlayerId, artsCardNum: pe.sourceCardNum, effectId: pe.effectId,
          beforeMine: isHost ? bs.host_state : bs.guest_state,
          afterHost: hostAcc, afterGuest: guestAcc,
          autoTargetedCards: result.autoTargetedCards,
        });
        if (artsTrigRe) {
          if (artsTrigRe.entries.length > 0) pendingEntries.push(...artsTrigRe.entries);
          if (artsTrigRe.usedIds.length > 0) {
            const baseRe = artsTrigRe.iAmHost ? hostAcc : guestAcc;
            const withUsedRe = { ...baseRe, actions_done: [...(baseRe.actions_done ?? []), ...artsTrigRe.usedIds] };
            if (artsTrigRe.iAmHost) hostAcc = withUsedRe; else guestAcc = withUsedRe;
          }
        }
        // §5.3 `O-131`＝裏返し（自分がアーツを使用したとき）も同じ理由でこちらに要る。
        const auRe = collectArtsUseForResolution({
          artsOwnerId: pe.sourcePlayerId, artsCardNum: pe.sourceCardNum, effectId: pe.effectId,
          afterHost: hostAcc, afterGuest: guestAcc,
        });
        if (auRe) {
          if (auRe.entries.length > 0) pendingEntries.push(...auRe.entries);
          if (auRe.usedIds.length > 0) {
            const baseAuRe = isHost ? hostAcc : guestAcc;
            const withUsedAu = { ...baseAuRe, actions_done: [...(baseAuRe.actions_done ?? []), ...auRe.usedIds] };
            if (isHost) hostAcc = withUsedAu; else guestAcc = withUsedAu;
          }
        }
        if (pendingEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          stackAcc = existingStack
            ? pushToStack(existingStack, pendingEntries)
            : initStack(turnPlayerId, pendingEntries);
        } else {
          // インタラクション解決後にキューが空になったスタックをクリア
          const existingStack = bs.effect_stack ?? null;
          if (existingStack && isStackDone(existingStack)) {
            stackAcc = null;
          }
        }

        // 🏁§5.3 `O-292`（2026-09-12）＝「任意COLLAB の resume で配置したアシストルリグの【出】を集める」分岐は撤去した
        //   （コラボはライバートークンの増減だけで、カードは場に出ない＝公式 FAQ）。

        if (result.trapActivated) {
          const ta = collectTrapActivateTriggers(pe.sourcePlayerId, hostState, guestState);
          if (ta.entries.length > 0) {
            const turnPlayerId = bs.active_user_id ?? user.id;
            const baseStackTA = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
            stackAcc = baseStackTA
              ? pushToStack(baseStackTA, ta.entries)
              : initStack(turnPlayerId, ta.entries);
          }
          if (ta.usedHostIds.length > 0) {
            hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...ta.usedHostIds] };
          }
          if (ta.usedGuestIds.length > 0) {
            guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...ta.usedGuestIds] };
          }
        }
        if ((result.trapSetOwners?.length ?? 0) > 0) {
          const ts = pureCollectTrapSetTriggers(mkTrigCtx(), pe.sourcePlayerId, result.trapSetOwners!, hostState, guestState);
          if (ts.entries.length > 0) {
            const turnPlayerId = bs.active_user_id ?? user.id;
            const baseStackTS = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
            stackAcc = baseStackTS
              ? pushToStack(baseStackTS, ts.entries)
              : initStack(turnPlayerId, ts.entries);
          }
          if (ts.usedHostIds.length > 0) {
            hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...ts.usedHostIds] };
          }
          if (ts.usedGuestIds.length > 0) {
            guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...ts.usedGuestIds] };
          }
        }
      }

      // ON_TARGETED トリガーを（done/not-done どちらの分岐で確定したスタックにも）後乗せで積む。
      if (targetedEntries.length > 0) {
        const turnPlayerId = bs.active_user_id ?? user.id;
        const baseStack = (stackAcc !== undefined ? stackAcc : bs.effect_stack) ?? null;
        stackAcc = baseStack
          ? pushToStack(baseStack, targetedEntries)
          : initStack(turnPlayerId, targetedEntries);
      }
      // 《ターン1回》の消費を watcher 側の actions_done へ書き戻す（他コレクターと同型・続き75）。
      // done 分岐では collectBoardDiffTriggers が両盤面を差し替えているため、累積側の最新 state に後乗せする。
      if (targetedUsedHostIds.length > 0) {
        hostAcc = { ...hostAcc, actions_done: [...(hostAcc.actions_done ?? []), ...targetedUsedHostIds] };
      }
      if (targetedUsedGuestIds.length > 0) {
        guestAcc = { ...guestAcc, actions_done: [...(guestAcc.actions_done ?? []), ...targetedUsedGuestIds] };
      }

      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: hostAcc, guestState: guestAcc,
        pending: pendingAcc, effectStack: stackAcc,
      }));
      await flushBattleLogs();
      setEffectSelectedNums([]);
    } finally {
      setLoading(false);
    }
  };

  // SELECT_ZONE: 効果でデッキトップを場に出す際のゾーン選択
  const handleSelectZoneForEffect = async (zoneIndex: number) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap, battleCardMap);
      const declaredCardMap3 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap3, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ

      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result = resumeSelectZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（効果1つの解決後）
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const existingStack = bs.effect_stack ?? null;
      const { respondPlayerId: _dropZ, ...peBaseZ } = pe;
      const srcEff = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
        .find(e => e.effectId === pe.effectId);
      // 盤面差分トリガーを先に確定させてから1回書く（旧：update に書いてから host/guest を差し替えていた）
      const bd = collectBoardDiffTriggers(hostState, guestState, {
        causeOwnerId: pe.sourcePlayerId,
        causeSourceCardNum: pe.sourceCardNum,
        fieldTrashCostCards: result.fieldTrashCostCards,
        ...fieldPlacementOnPlayOpts(srcEff),
      });
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: bd.hostState, guestState: bd.guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseZ, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        effectStack: bd.entries.length > 0
          ? (existingStack && !isStackDone(existingStack)
              ? pushToStack(existingStack, bd.entries)
              : initStack(bs.active_user_id ?? user.id, bd.entries))
          : undefined,
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // SELECT_SIGNI_ZONE: トラッシュ/エナ/手札などから場に出す際のゾーン選択
  const handleSelectSigniZoneForEffect = async (zoneIndex: number) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_SIGNI_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap, battleCardMap);
      const declaredCardMap5 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap5, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ

      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result = resumeSelectSigniZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（効果1つの解決後）
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const existingStack = bs.effect_stack ?? null;
      const { respondPlayerId: _dropS, ...peBaseS } = pe;
      const srcEff = (effectsMap.get(pe.sourceCardNum) ?? effectsMap.get(getCardNum(pe.sourceCardNum)) ?? [])
        .find(e => e.effectId === pe.effectId);
      // 盤面差分トリガーを先に確定させてから1回書く（旧：update に書いてから host/guest を差し替えていた）
      const bd = collectBoardDiffTriggers(hostState, guestState, {
        causeOwnerId: pe.sourcePlayerId,
        causeSourceCardNum: pe.sourceCardNum,
        fieldTrashCostCards: result.fieldTrashCostCards,
        ...fieldPlacementOnPlayOpts(srcEff),
      });
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState: bd.hostState, guestState: bd.guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseS, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        effectStack: bd.entries.length > 0
          ? (existingStack && !isStackDone(existingStack)
              ? pushToStack(existingStack, bd.entries)
              : initStack(bs.active_user_id ?? user.id, bd.entries))
          : undefined,
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /**
   * `ALLOCATE_POWER` の確定（§5.3 `O-140`・2026-08-29）＝「それらのパワーを合わせて－N する」の配分。
   * ⚠**検算は `resumeAllocatePower` に集約する**（UI・CPU・ここの3者で同じ計算を書かない）。
   */
  const handleAllocatePowerConfirm = async (alloc: Record<string, number>) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'ALLOCATE_POWER') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState = ownerIsHost ? bs.guest_state : bs.host_state;
      const declaredCardMapAP = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, bs.active_user_id === pe.sourcePlayerId);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMapAP, logs: [], currentPhase: bs.turn_phase ?? undefined, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners };
      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result: ExecResult = resumeAllocatePower(alloc, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap);
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });
      let hostState = ownerIsHost ? result.ownerState : result.otherState;
      let guestState = ownerIsHost ? result.otherState : result.ownerState;
      // 割り振りはパワー修正だけなので中央 diff（`ON_OPP_POWER_DECREASED` 等）を通す。
      const bdAP = collectBoardDiffTriggers(hostState, guestState, {
        causeOwnerId: pe.sourcePlayerId,
        causeSourceCardNum: pe.sourceCardNum,
      });
      hostState = bdAP.hostState; guestState = bdAP.guestState;
      const existingStackAP = bs.effect_stack ?? null;
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState,
        pending: result.done ? null : ({ ...pe, interaction: result.pending } satisfies PendingEffect),
        effectStack: bdAP.entries.length > 0
          ? (existingStackAP ? pushToStack(existingStackAP, bdAP.entries) : initStack(bs.active_user_id ?? user.id, bdAP.entries))
          : undefined,
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // REARRANGE_SIGNI: シグニ配置し直しの確定。newArrangement[newZone]=instance id / ''=空き。
  // skip=null のときは現状維持（恒等配置）で解決し、continuation があれば実行する。
  const handleRearrangeSigniConfirm = async (newArrangement: string[] | null) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'REARRANGE_SIGNI') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const declaredCardMapR = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, bs.active_user_id === pe.sourcePlayerId);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMapR, logs: [], currentPhase: bs.turn_phase ?? undefined, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
      const targetState = inter.owner === 'opponent' ? otherState : ownerState;
      // rearrange の skip は恒等配置、swap の skip は候補なし（空配列）として解決する。
      const arrangement = buildRearrangeSigniArrangement(newArrangement, inter.mode, targetState.field.signi, targetState.field.signi_traps);
      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result: ExecResult = resumeRearrangeSigni(arrangement, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap);
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });
      let hostState  = ownerIsHost ? result.ownerState : result.otherState;
      let guestState = ownerIsHost ? result.otherState : result.ownerState;
      const { respondPlayerId: _dropR, ...peBaseR } = pe;
      const existingStack = bs.effect_stack ?? null;
      let rearrangeEntries: StackEntry[] = [];
      // エナ／トラッシュとの交換は「場外から場へ出る」実配置。配置制限は executor、
      // 【出】と盤面差分トリガーは他の効果配置と同じ中央 funnel を通す。
      if (inter.swapSourceLocation === 'energy' || inter.swapSourceLocation === 'trash') {
        const bd = collectBoardDiffTriggers(hostState, guestState, {
          causeOwnerId: pe.sourcePlayerId,
          causeSourceCardNum: pe.sourceCardNum,
          collectPlacedSelfOnPlay: true,
          suppressOnPlay: inter.suppressOnPlay ?? false,
        });
        hostState = bd.hostState;
        guestState = bd.guestState;
        rearrangeEntries = bd.entries;
      }
      setRearrangeSlots([null, null, null]);
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseR, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
        effectStack: rearrangeEntries.length > 0
          ? (existingStack && !isStackDone(existingStack)
              ? pushToStack(existingStack, rearrangeEntries)
              : initStack(bs.active_user_id ?? user.id, rearrangeEntries))
          : undefined,
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  // SELECT_VIRUS_ZONE: 【ウィルス】を置くシグニゾーンの選択（zoneIndex=nullで配置打ち切り）
  const handleSelectVirusZoneForEffect = async (zoneIndex: number | null) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_VIRUS_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap, bs.turn_phase);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const treatAsClassAllZones = collectTreatAsClassAllZones(ownerState, otherState, effectsMap, battleCardMap);
      const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerState, otherState, effectsMap, battleCardMap);
      const declaredCardMap4 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, ownerState, otherState), ownerState, otherState, effectsMap, isOwnerTurn);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: declaredCardMap4, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, sourcePlacementPending: !!pe.spellPlacement, trapActivated: pe.trapActivated, trapSetOwners: pe.trapSetOwners, allColorSigniNums, fieldSigniExtraColors, treatAsClassAllZones, deckTrashLevel1Nums };
      fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ

      ctx.isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      let result = resumeSelectVirusZone(zoneIndex, inter, ctx);
      result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（効果1つの解決後）
      result = finalizePendingSpellPlacement(result, pe);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const { respondPlayerId: _dropV, ...peBaseV } = pe;
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP', hostState, guestState, settleStackOnDone: true,
        pending: result.done ? null : ({ ...peBaseV, interaction: result.pending, ...nextRespondPatch(result.pending, pe.sourcePlayerId, bs.host_id, bs.guest_id), ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  return {
    handleConfirmStackOrder, handleEffectInteraction,
    handleSelectZoneForEffect, handleSelectSigniZoneForEffect,
    handleAllocatePowerConfirm, handleRearrangeSigniConfirm, handleSelectVirusZoneForEffect,
  };
}
