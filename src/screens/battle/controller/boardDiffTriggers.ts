import { countAcceToTrash, countCharmsToTrash, countCoinsGained, countEnergyLeftZone, countEnergyToTrash, countLrigUnderMoved, countMagicBoxesFlipped, countMilledFromDeck, countMovedToDeck, countMovedToDeckFromField, countRefresh, detectBanishedSigni, detectBloomedSigni, detectCardAttached, detectDeckShuffled, detectDeckTrashed, detectEnergyAdded, detectEnergyAddedWithSource, detectEnergyFromTrash, detectEnergyTrashed, detectFacedownFlipped, detectHandAdded, detectHandTrashed, detectKeywordGained, detectLeftFieldSigni, detectLeftFieldSigniToTrash, detectLifeClothAdded, detectLifeClothMoved, detectMilledFromDeck, detectNewlyArmored, detectNewlyDowned, detectNewlyFrozen, detectNewlyUpped, detectPlacedFromEnergy, detectPlacedFromZone, detectPlacedSigni, detectPowerDecrease, detectPowerDecreaseSources, detectSoulAttached, detectTrashAdded, detectTrashedSigni, detectUnderSigniTrashed } from '../../../engine/boardDiff';
import { sweepFacedownAttached } from '../../../engine/execUtils';
import { type TrigCtx, collectAcceToTrashTriggers as pureCollectAcceToTrashTriggers, collectAllyPlayOrOppDiscardTriggers as pureCollectAllyPlayOrOppDiscardTriggers, collectArmorTriggers as pureCollectArmorTriggers, collectAttachedTriggers as pureCollectAttachedTriggers, collectBanishTriggers as pureCollectBanishTriggers, collectBloomTriggers as pureCollectBloomTriggers, collectCharmToTrashTriggers as pureCollectCharmToTrashTriggers, collectCoinGainedTriggers as pureCollectCoinGainedTriggers, collectDrawTriggers as pureCollectDrawTriggers, collectEnergyAddedSelfTriggers as pureCollectEnergyAddedSelfTriggers, collectEnergyToFieldTriggers as pureCollectEnergyToFieldTriggers, collectEnergyToTrashTriggers as pureCollectEnergyToTrashTriggers, collectFieldTriggers as pureCollectFieldTriggers, collectHandAddedTriggers as pureCollectHandAddedTriggers, collectLeaveFieldTriggers as pureCollectLeaveFieldTriggers, collectLifeClothAddedTriggers as pureCollectLifeClothAddedTriggers, collectLifeClothMovedTriggers as pureCollectLifeClothMovedTriggers, collectMagicBoxFlippedTriggers as pureCollectMagicBoxFlippedTriggers, collectMaterialUsedOnSigniTriggers as pureCollectMaterialUsedOnSigniTriggers, collectMillTriggers as pureCollectMillTriggers, collectMoveToDeckTriggers as pureCollectMoveToDeckTriggers, collectOppDrawTriggers as pureCollectOppDrawTriggers, collectOppEnergyAddedTriggers as pureCollectOppEnergyAddedTriggers, collectOppResourceLossTriggers as pureCollectOppResourceLossTriggers, collectPlacedSelfOnPlayTriggers as pureCollectPlacedSelfOnPlayTriggers, collectPowerDecreaseTriggers as pureCollectPowerDecreaseTriggers, collectRefreshTriggers as pureCollectRefreshTriggers, collectSigniCrashTotalTriggers as pureCollectSigniCrashTotalTriggers, collectSigniDownUpTriggers as pureCollectSigniDownUpTriggers, collectTrashAddedTriggers as pureCollectTrashAddedTriggers, collectTrashTriggers as pureCollectTrashTriggers, collectZoneMovedTriggers as pureCollectZoneMovedTriggers, recordSigniDownedThisTurn, collectAnyZoneTrashSelfTriggers as pureCollectAnyZoneTrashSelfTriggers, collectDeckShuffledTriggers as pureCollectDeckShuffledTriggers, collectLrigFlipTriggers as pureCollectLrigFlipTriggers, collectBanishOppByEffectTriggers as pureCollectBanishOppByEffectTriggers, collectDeckTrashSelfTriggers as pureCollectDeckTrashSelfTriggers, collectFreezeTriggers as pureCollectFreezeTriggers, collectKeywordGainedTriggers as pureCollectKeywordGainedTriggers, collectLrigUnderMovedTriggers as pureCollectLrigUnderMovedTriggers } from '../../../engine/triggerCollect';
import { type BattleStateRow, type CardData, type PlayerState, type StackEntry } from '../../../types';
import { type CardEffect, type TriggerOriginZone } from '../../../types/effects';
import { generateUUID } from '../battleUtils';
import { consumeOnceDelayedTriggers } from '../delayedTrigger';

/**
 * 🆕**盤面差分トリガーの収集を画面から出した1本**（§5.7 `S-5b`・2026-09-18）。
 *
 * ■ 何が入っているか＝`BattleScreen` にあった `collectBoardDiffTriggers`（579行）と、
 *   そこからしか呼ばれていなかった収集ラッパ17本、そして本体が使う共有ラッパ9本（`triggerCollect` の pure 収集の1行ラッパ）。
 * ■ なぜ要るか＝`S-5`（対戦丸ごとのシミュレータ）の第2段。スタック解決（`stackResolve.ts`）は既に純関数化したが、
 *   その `deps` に**画面のクロージャ**が残っていた。その最大の塊がここ（実測 579行＋26ラッパ）。
 *   ここが出たことで、ヘッドレス側は `makeBoardDiffCollector({ bs, cardMap, effectsMap, isHost, trigCtx })` で
 *   同じ収集器を自前で作れる。
 *
 * ⚠**中身は逐語で移設した**（識別子も引数も1つも変えていない）＝人間の対戦経路もこの関数を通る。
 *   だから `bs` / `battleCardMap` / `effectsMap` / `isHost` / `mkTrigCtx` という**画面側の名前をそのまま**
 *   factory の中で束ねている（書き換えると 800行の diff が「移設」でなくなり、レビューできなくなる）。
 * ⚠**`bs` は「差分の before」**＝収集は「`bs.host_state`/`bs.guest_state`（前）と、渡された after」を比べる。
 *   呼び出し側は**必ずその手番の最新の `bs`** を渡すこと（古い `bs` を渡すと差分が二重に出る）。
 */

/** 収集器を作るのに要る材料（＝画面が持っていたもの）。 */
export interface BoardDiffDeps {
  /** 差分の **before**（＋プレイヤーID・フェイズ）。 */
  bs: BattleStateRow;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  /** この client が host 側か。 */
  isHost: boolean;
  /** この client のプレイヤーID（`collectFieldTriggers` の既定の持ち主）。 */
  userId: string;
  /** `triggerCollect` へ渡す文脈（`BattleScreen.mkTrigCtx` と同じもの）。 */
  trigCtx: () => TrigCtx;
}

/** 盤面差分から誘発を集める関数（`after` の2つと、原因のメタ情報を受ける）。 */
export type BoardDiffCollector = (
  afterHost: PlayerState,
  afterGuest: PlayerState,
  meta: {
    causeOwnerId: string;
    causeSourceCardNum: string;
    fieldTrashCostCards?: string[];
    resonaConditionCardNum?: string;
    collectPlacedSelfOnPlay?: boolean;
    suppressOnPlay?: boolean;
  },
) => { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState };

/**
 * 盤面差分トリガーの収集器を作る。
 * ⚠**呼ぶたびに作ってよい**（中身は小さなクロージャの束＝状態を持たない）。
 */
export function makeBoardDiffCollector(deps: BoardDiffDeps): BoardDiffCollector {
  const { bs, cardMap: battleCardMap, effectsMap } = deps;
  const user = { id: deps.userId };
  const mkTrigCtx = deps.trigCtx;

    const collectTrashTriggers = (
      trashedCardNum: string,
      trashedPlayerId: string,
      afterHostState: PlayerState,
      afterGuestState: PlayerState,
      causeByOpponent = false,
      byCostOrEffect = true,
      byEffectCause = true,
      resonaConditionCardNum?: string,
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectTrashTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, afterHostState, afterGuestState, causeByOpponent, byCostOrEffect, byEffectCause, resonaConditionCardNum);
    /**
     * バニッシュされたシグニの ON_BANISH 効果 + フィールド上の全シグニのトリガーを収集する。
     * banishedPlayerId: バニッシュされたシグニのオーナーの userId (host_id or guest_id)。
     */
    // ON_BANISH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    // usageLimit（《ターン1回/2回》）消費 effectId を usedHostIds/usedGuestIds で返す（呼び出し元が actions_done へ
    // 書き戻す＝他コレクタと同型。続き100で発見した「読むだけで書き戻さない」ノーガード状態を続き135で解消）。
    const collectBanishTriggers = (
      banishedCardNum: string,
      banishedPlayerId: string,
      afterHostState: PlayerState,
      afterGuestState: PlayerState,
      prevOwnerState?: PlayerState, // バニッシュされたカードのオーナーのバニッシュ前状態（アクセ付与ON_BANISH復元用）
      cause?: { ownerId: string; sourceCardNum?: string },
      battleAttackerNum?: string,
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectBanishTriggers(mkTrigCtx(), banishedCardNum, banishedPlayerId, afterHostState, afterGuestState, prevOwnerState, cause, battleAttackerNum);
    // ドロー時（ON_DRAW）トリガー収集。引いたプレイヤー（drawerId）の場のシグニ/ルリグの ON_DRAW【自】を集める（G089）。
    // ターンドロー・効果ドローの双方から呼ばれるため playerId を引数で受け取る。
    // usageLimit（《ターン1回》《ターン2回》）は actions_done(effectId) の出現回数で制御。
    // usedOncePerTurnIds を呼び出し側で drawer の actions_done に追加して永続化すること。
    // ON_DRAW / 対戦相手ドロー / ミル トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectDrawTriggers = (
      drawerId: string,
      drawerState: PlayerState,
      otherState: PlayerState,
      isDrawPhaseDraw = false,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectDrawTriggers(mkTrigCtx(), drawerId, drawerState, otherState, isDrawPhaseDraw);
    /**
     * フィールド上の全シグニから、指定イベントに反応する AUTO 効果を収集して StackEntry[] を返す。
     * 召喚されたカード自身（triggerScope='self'）はここでは除き、queueCardEffects で別途処理する。
     */
    // ON_PLAY/ON_BANISH/ON_ATTACK_SIGNI/ON_BLOOM の場トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    // usageLimit（《ターン1回/2回》）消費 effectId を usedHostIds/usedGuestIds で返す（呼び出し元が actions_done へ
    // 書き戻す）。従来この関数にはガード自体が無く「味方のシグニが場に出るたびに◯◯（ターンに1回）」型が
    // 同一ターンの複数召喚で毎回発火していた（続き104・実カード32枚・続き135で解消）。
    const collectFieldTriggers = (
      event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI' | 'ON_BLOOM',
      triggeringCardNum: string,
      myState: PlayerState,
      opState: PlayerState,
      ownerId: string = user.id, // myState の持ち主（CPU効果収集時はCPU_PLAYER_ID）
      opts?: { placedByEffect?: boolean; placeSourceIsSigni?: boolean; placedFromZone?: TriggerOriginZone; placedFromTrash?: boolean; sideAttack?: boolean },
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectFieldTriggers(mkTrigCtx(), event, triggeringCardNum, myState, opState, ownerId, opts);
    // ON_LEAVE_FIELD トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    // causeOwnerId＝離脱を引き起こした効果のオーナー（バトル/ルール処理＝undefined）。
    const collectLeaveFieldTriggers = (
      leftCardNum: string,
      leftUnder: string[],
      leftPlayerId: string,
      afterHostState: PlayerState,
      afterGuestState: PlayerState,
      causeOwnerId?: string,
      leftBeforeState?: PlayerState,
      leftZoneIdx?: number,
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectLeaveFieldTriggers(mkTrigCtx(), leftCardNum, leftUnder, leftPlayerId, afterHostState, afterGuestState, causeOwnerId, leftBeforeState, leftZoneIdx);
    // ON_COIN_GAINED トリガー収集（§6.3 J-5。triggerCollect.ts の薄いラッパ）。
    // ⚠獲得枚数は**呼び出し側が実増加を渡す**（グロウは支払いと獲得が同じ差分に同居するため before/after 差では取りこぼす）。
    const collectCoinGainedTriggers = (
      watcherId: string,
      watcherState: PlayerState,
      otherState: PlayerState,
      gainedBySelf: number,
      gainedByOpp: number,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectCoinGainedTriggers(mkTrigCtx(), watcherId, watcherState, otherState, gainedBySelf, gainedByOpp);
    // ON_ACCE_TO_TRASH トリガー収集（§6.3 J-2。triggerCollect.ts の薄いラッパ）。
    const collectAcceToTrashTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      acceFromControllerField: number,
      acceFromOppField: number,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectAcceToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, acceFromControllerField, acceFromOppField);
    // ON_CHARM_TO_TRASH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectCharmToTrashTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      charmsFromControllerField: number,
      charmsFromOppField: number,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectCharmToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, charmsFromControllerField, charmsFromOppField);
    // ON_REFRESH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectRefreshTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      refreshedByController: number,
      refreshedByOpp: number,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[]; firedOnceDelayed: boolean } =>
      pureCollectRefreshTriggers(mkTrigCtx(), controllerId, controllerState, otherState, refreshedByController, refreshedByOpp);
    // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
    const collectAllyPlayOrOppDiscardTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      allyPlacedNums: string[],
      oppDiscardCount: number,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectAllyPlayOrOppDiscardTriggers(mkTrigCtx(), controllerId, controllerState, allyPlacedNums, oppDiscardCount);
    // ON_BLOOD_CRYSTAL_ARMOR トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    // usageLimit（《ターン1回/2回》）消費 effectId を usedHostIds/usedGuestIds で返す（呼び出し元が actions_done へ
    // 書き戻す＝ON_BANISH と同型。Opusタスク12(xxxii)で any_ally が発火するようになり書き戻しが必要になった）。
    const collectArmorTriggers = (
      armoredCardNum: string,
      armoredPlayerId: string,
      afterHostState: PlayerState,
      afterGuestState: PlayerState,
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectArmorTriggers(mkTrigCtx(), armoredCardNum, armoredPlayerId, afterHostState, afterGuestState);
    // ON_SOUL_ATTACHED / ON_CARD_ATTACHED トリガー収集（§6.3 J-2。triggerCollect.ts の薄いラッパ）。
    const collectAttachedTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      timing: 'ON_SOUL_ATTACHED' | 'ON_CARD_ATTACHED',
      attachedHosts: { hostNum: string; count: number }[],
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectAttachedTriggers(mkTrigCtx(), controllerId, controllerState, otherState, timing, attachedHosts);
    // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT をスタックを経由しないインライン解決（pending効果 resume＝handleEffectInteraction）
    // で検出する共有ヘルパー。resolveStackNext の中央 diff（4760）はスタック解決のみを通るため、対象選択を伴う効果が
    // resume 経路で解決される場合（[出]バニッシュ等）はこれを呼んで発火させる。source=効果発生源（pe.sourceCardNum）。
    const collectBanishOppByEffectInline = (
      sourceCardNum: string,
      sourcePlayerId: string,
      afterHost: PlayerState,
      afterGuest: PlayerState,
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      let h = afterHost, g = afterGuest;
      const sourceIsHost = sourcePlayerId === bs.host_id;
      const sourceState = sourceIsHost ? afterHost : afterGuest;
      const oppBefore = sourceIsHost ? bs.guest_state : bs.host_state;
      const oppAfter = sourceIsHost ? afterGuest : afterHost;
      const banisherOnField = sourceState.field.signi.some(s => s?.at(-1) === sourceCardNum);
      if (detectBanishedSigni(oppBefore, oppAfter).length === 0 || !banisherOnField) return { entries: [], hostState: h, guestState: g };
      const bn = collectBanishOppByEffectTriggers(sourceCardNum, sourcePlayerId, sourceState);
      if (bn.usedOncePerTurnIds.length > 0) {
        if (sourceIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...bn.usedOncePerTurnIds] };
        else g = { ...g, actions_done: [...(g.actions_done ?? []), ...bn.usedOncePerTurnIds] };
      }
      return { entries: bn.entries, hostState: h, guestState: g };
    };
    // 【シード】が開花したときの ON_BLOOM トリガーを収集する。
    //  ・開花したシグニ自身の「このシグニが開花したとき」（triggerScope: self）
    //  ・場の他シグニの「あなたの他のシグニが開花したとき」（triggerScope: any_ally/any）
    // 開花は「場に出た」扱いではないため、ON_PLAY（出現時）は発火させない（公式ルール）。
    // ON_BLOOM 収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectBloomTriggers = (
      bloomedInstanceId: string,
      myState: PlayerState,
      opState: PlayerState,
      ownerId: string,
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectBloomTriggers(mkTrigCtx(), bloomedInstanceId, myState, opState, ownerId);
    // ON_DECK_SHUFFLED を検出する共有ヘルパー（deck_shuffled_count の before/after 差分）。
    // before は bs.host_state/guest_state。entries（スタックへ積む）と once_per_turn の actions_done を反映した
    // host/guest を返す（呼び出し側で update.host_state/guest_state に反映する）。
    // ⚠**呼び出し元は中央 diff（`collectBoardDiffTriggers`）1箇所だけ**＝2026-08-29 の §5.3 `O-135` で
    //   スペル解決経路（`handleCutinPass`）を中央 diff へ一本化したため、こちらの直呼びは無くなった。
    const collectDeckShuffleInline = (
      afterHost: PlayerState,
      afterGuest: PlayerState,
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      const entries: StackEntry[] = [];
      let h = afterHost, g = afterGuest;
      for (const dsIsHost of [true, false]) {
        const dsOwnerId = dsIsHost ? bs.host_id : bs.guest_id;
        const before = dsIsHost ? bs.host_state : bs.guest_state;
        const after = dsIsHost ? afterHost : afterGuest;
        if (!detectDeckShuffled(before, after)) continue;
        const ds = collectDeckShuffledTriggers(dsOwnerId, after);
        entries.push(...ds.entries);
        if (ds.usedOncePerTurnIds.length > 0) {
          if (dsIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...ds.usedOncePerTurnIds] };
          else g = { ...g, actions_done: [...(g.actions_done ?? []), ...ds.usedOncePerTurnIds] };
        }
      }
      return { entries, hostState: h, guestState: g };
    };
    // ON_ENERGY_TO_TRASH トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectEnergyToTrashTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      fromControllerEnergy: number,
      fromOppEnergy: number,
      fromControllerEnergyAny?: number,
      fromOppEnergyAny?: number,
      causeOwnerId?: string,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectEnergyToTrashTriggers(mkTrigCtx(), controllerId, controllerState, otherState, fromControllerEnergy, fromOppEnergy, fromControllerEnergyAny, fromOppEnergyAny, causeOwnerId);
    // ON_SIGNI_FROZEN をスタックを経由しないインライン解決（対象選択を伴う効果が resume 経路＝handleEffectInteraction
    // で完結する場合）で検出する共有ヘルパー。resolveStackNext の中央 diff（3798）はスタック解決のみを通るため、
    // FREEZE 付与の大半（SELECT_TARGET で単体対象を凍結）はここを呼んで ON_SIGNI_FROZEN を拾う（続き40 R38 実機FAIL修正）。
    // before は bs.host_state/guest_state。entries と once_per_turn の actions_done を反映した host/guest を返す。
    const collectFreezeInline = (
      afterHost: PlayerState,
      afterGuest: PlayerState,
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      let h = afterHost, g = afterGuest;
      const frozenHost = detectNewlyFrozen(bs.host_state, afterHost);
      const frozenGuest = detectNewlyFrozen(bs.guest_state, afterGuest);
      if (frozenHost.length === 0 && frozenGuest.length === 0) return { entries: [], hostState: h, guestState: g };
      const fz = collectFreezeTriggers(
        [{ ownerId: bs.host_id, nums: frozenHost }, { ownerId: bs.guest_id, nums: frozenGuest }],
        afterHost, afterGuest,
      );
      if (fz.usedHostIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...fz.usedHostIds] };
      if (fz.usedGuestIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...fz.usedGuestIds] };
      return { entries: fz.entries, hostState: h, guestState: g };
    };
    // ON_KEYWORD_GAINED をスタック解決(resolveStackNext)/resume(handleEffectInteraction) 双方で拾う共有ヘルパー。
    // キーワード付与（GRANT_KEYWORD）は対象選択を伴い resume 経路で完了することが多いため、両経路で検出する。
    const collectKeywordGainedInline = (
      afterHost: PlayerState,
      afterGuest: PlayerState,
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      const entries: StackEntry[] = [];
      let h = afterHost, g = afterGuest;
      for (const kgIsHost of [true, false]) {
        const ownerId = kgIsHost ? bs.host_id : bs.guest_id;
        const before = kgIsHost ? bs.host_state : bs.guest_state;
        const after = kgIsHost ? afterHost : afterGuest;
        const gains = detectKeywordGained(before, after);
        if (gains.length === 0) continue;
        const kg = collectKeywordGainedTriggers(gains, ownerId, after);
        entries.push(...kg.entries);
        if (kg.usedOncePerTurnIds.length > 0) {
          if (kgIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...kg.usedOncePerTurnIds] };
          else g = { ...g, actions_done: [...(g.actions_done ?? []), ...kg.usedOncePerTurnIds] };
        }
      }
      return { entries, hostState: h, guestState: g };
    };
    // ON_LRIG_UNDER_MOVED をスタックを経由しないインライン解決（resume＝handleEffectInteraction）で検出する共有ヘルパー。
    // resolveStackNext の中央 diff（4782）はスタック解決のみを通るため、対象選択を伴う効果がここを通る場合に発火させる。
    const collectLrigUnderMovedInline = (
      afterHost: PlayerState,
      afterGuest: PlayerState,
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      const entries: StackEntry[] = [];
      let h = afterHost, g = afterGuest;
      for (const luIsHost of [true, false]) {
        const luOwnerId = luIsHost ? bs.host_id : bs.guest_id;
        const before = luIsHost ? bs.host_state : bs.guest_state;
        const after = luIsHost ? afterHost : afterGuest;
        if (countLrigUnderMoved(before, after) <= 0) continue;
        const lu = collectLrigUnderMovedTriggers(luOwnerId, after);
        entries.push(...lu.entries);
        if (lu.usedOncePerTurnIds.length > 0) {
          if (luIsHost) h = { ...h, actions_done: [...(h.actions_done ?? []), ...lu.usedOncePerTurnIds] };
          else g = { ...g, actions_done: [...(g.actions_done ?? []), ...lu.usedOncePerTurnIds] };
        }
      }
      return { entries, hostState: h, guestState: g };
    };
    // ON_MAGIC_BOX_FLIPPED トリガー収集（§6.4 A群・WX24-P4-016。triggerCollect.ts の薄いラッパ）。
    // ⚠実カードの watcher は**付与ストア**から来る＝pure 側が印字＋付与の両方を走査している。
    const collectMagicBoxFlippedTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      flippedOnControllerField: number,
      flippedOnOppField: number,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectMagicBoxFlippedTriggers(mkTrigCtx(), controllerId, controllerState, otherState, flippedOnControllerField, flippedOnOppField);
    // ON_MATERIAL_USED（self/any_ally 変種）収集（改造素材機構 Step3b・triggerCollect.ts。ここは薄いラッパ）。
    const collectMaterialUsedOnSigniTriggers = (
      targetNums: string[],
      ownerId: string,
      ownerState: PlayerState,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectMaterialUsedOnSigniTriggers(mkTrigCtx(), targetNums, ownerId, ownerState);
    const collectMillTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      milledFromControllerDeck: number,
      milledFromOppDeck: number,
      milledControllerCards?: string[],
      milledOppCards?: string[],
      causeOwnerId?: string,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectMillTriggers(mkTrigCtx(), controllerId, controllerState, otherState, milledFromControllerDeck, milledFromOppDeck, milledControllerCards, milledOppCards, causeOwnerId);
    // ON_CARD_MOVED_TO_DECK トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectMoveToDeckTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      movedToControllerDeck: number,
      movedToControllerDeckFromTrash: number,
      movedToOppDeck: number,
      causeOwnerId?: string,
      movedToControllerDeckFromField = 0,
      movedToOppDeckFromField = 0,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectMoveToDeckTriggers(mkTrigCtx(), controllerId, controllerState, otherState, movedToControllerDeck, movedToControllerDeckFromTrash, movedToOppDeck, causeOwnerId, movedToControllerDeckFromField, movedToOppDeckFromField);
    const collectOppDrawTriggers = (
      reactorId: string,
      reactorState: PlayerState,
      drawerState: PlayerState,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectOppDrawTriggers(mkTrigCtx(), reactorId, reactorState, drawerState);
    // ON_OPP_POWER_DECREASED トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectPowerDecreaseTriggers = (
      controllerId: string,
      controllerState: PlayerState,
      otherState: PlayerState,
      decreaseOnOpp: number,
      decreaseSources: string[] = [],
      causeOwnerId?: string,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectPowerDecreaseTriggers(mkTrigCtx(), controllerId, controllerState, otherState, decreaseOnOpp, decreaseSources, causeOwnerId);
    // ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP のインライン収集（タスク16[C]機構①・collectFreezeInline と同型）。
    // before は bs.host_state/guest_state。byEffect＝効果起因か（中央diff＝true／アタックダウンは
    // performSigniAttack 側で byEffect:false のまま直接 pure collector を呼ぶ）。
    const collectSigniDownUpInline = (
      afterHost: PlayerState,
      afterGuest: PlayerState,
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      let h = afterHost, g = afterGuest;
      const entries: StackEntry[] = [];
      const downHost = detectNewlyDowned(bs.host_state, afterHost);
      const downGuest = detectNewlyDowned(bs.guest_state, afterGuest);
      if (downHost.length > 0 || downGuest.length > 0) {
        // 🔴「このターンでN回目」台帳（§6.4 O-11）は**収集の前に**積む＝
        //   `fireCondition` は収集時に評価されるので、今回のダウンを含めないと「3回目」が永久に来ない。
        h = recordSigniDownedThisTurn(h, downHost);
        g = recordSigniDownedThisTurn(g, downGuest);
        const dn = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_DOWN',
          [{ ownerId: bs.host_id, nums: downHost, byEffect: true }, { ownerId: bs.guest_id, nums: downGuest, byEffect: true }], h, g);
        entries.push(...dn.entries);
        if (dn.usedHostIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...dn.usedHostIds] };
        if (dn.usedGuestIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...dn.usedGuestIds] };
      }
      const upHost = detectNewlyUpped(bs.host_state, afterHost);
      const upGuest = detectNewlyUpped(bs.guest_state, afterGuest);
      if (upHost.nums.length > 0 || upGuest.nums.length > 0 || upHost.lrigUpNum || upGuest.lrigUpNum) {
        const up = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_BECOMES_UP',
          [{ ownerId: bs.host_id, nums: upHost.nums, lrigNum: upHost.lrigUpNum, byEffect: true },
           { ownerId: bs.guest_id, nums: upGuest.nums, lrigNum: upGuest.lrigUpNum, byEffect: true }], h, g);
        entries.push(...up.entries);
        if (up.usedHostIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...up.usedHostIds] };
        if (up.usedGuestIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...up.usedGuestIds] };
      }
      return { entries, hostState: h, guestState: g };
    };

    // === 盤面差分トリガーの統合収集（続き61・Opus）===
    // resolveStackNext の中央 diff（result.done===true 分岐）と handleEffectInteraction の resume 完了分岐の
    // 双方から呼べる「盤面 before/after を比べてトリガーを収集する」共通関数。
    // 【背景】従来、この収集は resolveStackNext の else 節（result.done===true）にのみ全種そろっており、
    // 対象選択(SELECT_TARGET/CHOOSE)を挟んで resume 経路で完了する効果では大半のトリガーが取りこぼされていた
    // （§6.3・続き58/60 で ON_OPP_POWER_DECREASED/ON_ENERGY_TO_TRASH/ON_DRAW〔SEQUENCE内対話〕/ON_TRASH self を実機FAILで確認）。
    // resume 側には collectFreezeInline 等 5 種の場当たり的 inline 版しかなく、SEQUENCE 構造次第で同 collector が
    // 再度 FAIL する対症療法だった。本関数に全 collector を集約し両経路から呼ぶことで解決経路に依らず一貫させる。
    // before は bs.host_state/guest_state。afterHost/afterGuest（result 状態）を受け取り、entries（積むトリガー）と
    // once_per_turn の actions_done を反映した host/guest を返す（呼び出し側で update.host_state/guest_state と effect_stack へ反映）。
    // meta.causeOwnerId＝この効果のオーナー（entry.playerId/pe.sourcePlayerId・「対戦相手の効果によって」判定と
    // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT の発生源側判定に使用）。meta.causeSourceCardNum＝発生源カード
    // （entry.cardNum/pe.sourceCardNum・banisher 照合と ON_PLAY の placeSourceIsSigni 判定に使用）。
    // ⚠この関数は「盤面差分だけで判定できる」トリガーのみを含む。action 型固有のもの（COLLAB/REVEAL_UNTIL_TO_FIELD の
    // 【出】積み・ON_ARTS_USE/ON_OPP_ARTS_USE・FORCE_END_TURN）は entry.effect / entryCardType に依存するため
    // resolveStackNext 側に inline 据置（resume 経路では pending_effect に元 action 型が無いため再現不能・従来同様）。
    const collectAnyZoneTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' | 'under_signi' = 'hand', causeSourceCardNum?: string, byEffectCause = true, ownerState?: PlayerState, otherState?: PlayerState): StackEntry[] =>
      pureCollectAnyZoneTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, origin, causeSourceCardNum, byEffectCause, ownerState, otherState);
    // ON_DECK_SHUFFLED 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
    const collectDeckShuffledTriggers = (
      shufflerId: string,
      shufflerState: PlayerState,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectDeckShuffledTriggers(mkTrigCtx(), shufflerId, shufflerState);
    // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
    const collectBanishOppByEffectTriggers = (
      banisherCardNum: string,
      banisherOwnerId: string,
      banisherOwnerState: PlayerState,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectBanishOppByEffectTriggers(mkTrigCtx(), banisherCardNum, banisherOwnerId, banisherOwnerState);
    // ON_TRASH ファミリ（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectDeckTrashSelfTriggers = (trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, causeSourceCardNum?: string, byEffectCause = true): StackEntry[] =>
      pureCollectDeckTrashSelfTriggers(mkTrigCtx(), trashedCardNum, trashedPlayerId, causeByOpponent, causeSourceCardNum, byEffectCause);
    // ON_SIGNI_FROZEN トリガー収集（Stage2 で pure 化＝triggerCollect.ts。ここは薄いラッパ）。
    const collectFreezeTriggers = (
      frozenByOwner: { ownerId: string; nums: string[] }[],
      hostState: PlayerState,
      guestState: PlayerState,
    ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
      pureCollectFreezeTriggers(mkTrigCtx(), frozenByOwner, hostState, guestState);
    // ON_KEYWORD_GAINED 収集（C1・WXDi-P04-035。ここは薄いラッパ）。
    const collectKeywordGainedTriggers = (
      gains: { cardNum: string; keyword: string }[],
      gainOwnerId: string,
      ownerState: PlayerState,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectKeywordGainedTriggers(mkTrigCtx(), gains, gainOwnerId, ownerState);
    // ON_LRIG_UNDER_MOVED 収集（C1・triggerCollect.ts。ここは薄いラッパ）。
    const collectLrigUnderMovedTriggers = (
      controllerId: string,
      controllerState: PlayerState,
    ): { entries: StackEntry[]; usedOncePerTurnIds: string[] } =>
      pureCollectLrigUnderMovedTriggers(mkTrigCtx(), controllerId, controllerState);
    const collectBoardDiffTriggers = (
      afterHost: PlayerState,
      afterGuest: PlayerState,
      meta: {
        causeOwnerId: string;
        causeSourceCardNum: string;
        fieldTrashCostCards?: string[];
        resonaConditionCardNum?: string;
        collectPlacedSelfOnPlay?: boolean;
        suppressOnPlay?: boolean;
      },
    ): { entries: StackEntry[]; hostState: PlayerState; guestState: PlayerState } => {
      const { causeOwnerId, causeSourceCardNum } = meta;
      const fieldTrashCostCards = new Set(meta.fieldTrashCostCards ?? []);
      const beforeHost = bs.host_state, beforeGuest = bs.guest_state;
      let h = afterHost, g = afterGuest;
      const entries: StackEntry[] = [];
      const useHost  = (used: string[]) => { if (used.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...used] }; };
      const useGuest = (used: string[]) => { if (used.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...used] }; };

      // 効果解決で生じた手札捨ての原因 owner を React watcher まで運ぶ。
      // executor は userId を持たないため、entry/pending 由来の causeOwnerId を知る中央 diff で刻む。
      // 🆕**原因カード**も同時に刻む（意味照合 段2・`WX25-CP1-016-E1`＝「シグニかスペルの、
      //   コストか効果によって」）＝`causeSourceCardNum` を知っているのはこの中央 diff だけ。
      if (detectHandTrashed(beforeHost, h).length > 0 && h.hand_discarded_just?.length) {
        h = { ...h, hand_discarded_just_cause_owner_id: causeOwnerId, hand_discarded_just_cause_card_num: causeSourceCardNum };
      }
      if (detectHandTrashed(beforeGuest, g).length > 0 && g.hand_discarded_just?.length) {
        g = { ...g, hand_discarded_just_cause_owner_id: causeOwnerId, hand_discarded_just_cause_card_num: causeSourceCardNum };
      }

      entries.push(...pureCollectLrigFlipTriggers(mkTrigCtx(), beforeHost, h, bs.host_id));
      entries.push(...pureCollectLrigFlipTriggers(mkTrigCtx(), beforeGuest, g, bs.guest_id));

      // ON_BANISH: バニッシュされたシグニ（usageLimit 消費は useHost/useGuest で actions_done へ永続化）
      // ⚠ここは**盤面差分でバニッシュを認識する唯一の funnel**なので、「このターンにシグニがバニッシュ
      //   されている」の履歴（タスク12(xciv) の `WX13-026`＝コスト軽減の条件）も同じ場所で記録する。
      //   ⚠**バニッシュされた側**の state に積む（アーツ使用側から見た「対戦相手のシグニが…」は
      //   相手 state を読む）。同じ差分が複数回評価されても条件は `>= 1` でしか使わないので二重計上は無害。
      const hostBanished = detectBanishedSigni(beforeHost, h);
      for (const cardNum of hostBanished) {
        const bt = collectBanishTriggers(cardNum, bs.host_id, h, g, beforeHost, { ownerId: causeOwnerId, sourceCardNum: causeSourceCardNum });
        entries.push(...bt.entries); useHost(bt.usedHostIds); useGuest(bt.usedGuestIds);
      }
      if (hostBanished.length > 0) h = { ...h, signi_banished_this_turn: (h.signi_banished_this_turn ?? 0) + hostBanished.length };
      // §5.3 O-121: 「このターンに**あなたが**対戦相手のシグニをバニッシュしていた場合」の台帳。
      //   ⚠**バニッシュした側**（causeOwnerId）の state へ積む＝上の `signi_banished_this_turn`（被バニッシュ側の件数）とは別軸。
      //   この funnel は効果解決経路なので `byEffect: true`。バトルバニッシュは別地点（アタック解決）で積む。
      if (hostBanished.length > 0 && causeOwnerId === bs.guest_id) {
        g = { ...g, opp_signi_banished_this_turn: [
          ...(g.opp_signi_banished_this_turn ?? []),
          ...hostBanished.map(() => ({ by: causeSourceCardNum ?? null, byEffect: true })),
        ] };
      }
      const guestBanished = detectBanishedSigni(beforeGuest, g);
      for (const cardNum of guestBanished) {
        const bt = collectBanishTriggers(cardNum, bs.guest_id, h, g, beforeGuest, { ownerId: causeOwnerId, sourceCardNum: causeSourceCardNum });
        entries.push(...bt.entries); useHost(bt.usedHostIds); useGuest(bt.usedGuestIds);
      }
      if (guestBanished.length > 0) g = { ...g, signi_banished_this_turn: (g.signi_banished_this_turn ?? 0) + guestBanished.length };
      // §5.3 O-121: host 側が原因のときは host の台帳へ（上と対称）。
      if (guestBanished.length > 0 && causeOwnerId === bs.host_id) {
        h = { ...h, opp_signi_banished_this_turn: [
          ...(h.opp_signi_banished_this_turn ?? []),
          ...guestBanished.map(() => ({ by: causeSourceCardNum ?? null, byEffect: true })),
        ] };
      }

      // ON_TRASH: スタック/pending 解決内でも fieldTrashCostCards に記録された支払いは byEffectCause=false、
      // それ以外の場→トラッシュは effect 起因。原因owner と所有者が異なれば「対戦相手の効果によって」。
      const hostTrashedByOpp  = causeOwnerId === bs.guest_id;
      const guestTrashedByOpp = causeOwnerId === bs.host_id;
      for (const cardNum of detectTrashedSigni(beforeHost, h)) {
        const tt = collectTrashTriggers(cardNum, bs.host_id, h, g, hostTrashedByOpp, true, !fieldTrashCostCards.has(cardNum), meta.resonaConditionCardNum);
        entries.push(...tt.entries); useHost(tt.usedHostIds); useGuest(tt.usedGuestIds);
      }
      for (const cardNum of detectTrashedSigni(beforeGuest, g)) {
        const tt = collectTrashTriggers(cardNum, bs.guest_id, h, g, guestTrashedByOpp, true, !fieldTrashCostCards.has(cardNum), meta.resonaConditionCardNum);
        entries.push(...tt.entries); useHost(tt.usedHostIds); useGuest(tt.usedGuestIds);
      }
      // デッキ→トラッシュ（ミル）の ON_TRASH（カード自身・triggerScope:self）
      for (const cardNum of detectDeckTrashed(beforeHost, h)) {
        entries.push(...collectDeckTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, causeSourceCardNum, !!causeOwnerId));
      }
      for (const cardNum of detectDeckTrashed(beforeGuest, g)) {
        entries.push(...collectDeckTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, causeSourceCardNum, !!causeOwnerId));
      }
      // 手札→トラッシュ／エナ→トラッシュの ON_TRASH（self・fromZones 指定）。
      // causeSourceCardNum＝原因効果の発生源カード（「あなたの＜X＞のシグニの効果によって捨てられたとき」の判定用）。
      for (const cardNum of detectHandTrashed(beforeHost, h)) {
        entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'hand', causeSourceCardNum, !!causeOwnerId, h, g));
      }
      for (const cardNum of detectHandTrashed(beforeGuest, g)) {
        entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'hand', causeSourceCardNum, !!causeOwnerId, g, h));
      }
      for (const cardNum of detectEnergyTrashed(beforeHost, h)) {
        entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'energy', causeSourceCardNum, !!causeOwnerId, h, g));
      }
      for (const cardNum of detectEnergyTrashed(beforeGuest, g)) {
        entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'energy', causeSourceCardNum, !!causeOwnerId, g, h));
      }
      for (const cardNum of detectUnderSigniTrashed(beforeHost, h)) {
        entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.host_id, hostTrashedByOpp, 'under_signi', causeSourceCardNum, !!causeOwnerId, h, g));
      }
      for (const cardNum of detectUnderSigniTrashed(beforeGuest, g)) {
        entries.push(...collectAnyZoneTrashSelfTriggers(cardNum, bs.guest_id, guestTrashedByOpp, 'under_signi', causeSourceCardNum, !!causeOwnerId, g, h));
      }

      // §5.3 `O-81`＝裏向きで付けられたカードの回収（公開して持ち主の手札へ）。
      // ⚠**ON_LEAVE_FIELD 収集より前**＝`FACEDOWN_REVEALED_JUST`／`levelEqFacedownRevealed` は収集時に読む。
      // `removeFromField` を通らずに `field` を組み直す経路（コスト支払い等）の取りこぼしをここで拾う。
      h = sweepFacedownAttached(h);
      g = sweepFacedownAttached(g);

      // ON_LEAVE_FIELD: 場を離れたシグニ（行き先を問わない）。causeOwnerId＝この効果のオーナー
      // （「あなたの効果によって対戦相手の…」any_opp／「対戦相手の効果によって」byOpponentEffect の判定に使用）。
      // 🆕§5.3 `O-233`（2026-09-04）＝**このターンに「対戦相手の効果によって」場を離れたシグニ**の累計。
      //   `SIGNI_LEFT_BY_OPP_EFFECT`（`SPK16-13E-E1`①）が読む。`hand_trashed_by_opp_this_turn` /
      //   `energy_trashed_by_opp_this_turn` と同じ規約＝**離脱の原因が効果で、その効果のオーナーが
      //   持ち主ではない**ときだけ数える（バトルのバニッシュやルール処理では `causeOwnerId` が無い＝数えない）。
      const leftHostSigni = detectLeftFieldSigni(beforeHost, h);
      const leftGuestSigni = detectLeftFieldSigni(beforeGuest, g);
      if (causeOwnerId && causeOwnerId !== bs.host_id && leftHostSigni.length > 0) {
        h = { ...h, signi_left_by_opp_effect_this_turn: (h.signi_left_by_opp_effect_this_turn ?? 0) + leftHostSigni.length };
      }
      if (causeOwnerId && causeOwnerId !== bs.guest_id && leftGuestSigni.length > 0) {
        g = { ...g, signi_left_by_opp_effect_this_turn: (g.signi_left_by_opp_effect_this_turn ?? 0) + leftGuestSigni.length };
      }
      for (const { cardNum, under, zoneIdx } of leftHostSigni) {
        const lf = collectLeaveFieldTriggers(cardNum, under, bs.host_id, h, g, causeOwnerId, beforeHost, zoneIdx);
        entries.push(...lf.entries); useHost(lf.usedHostIds); useGuest(lf.usedGuestIds);
      }
      for (const { cardNum, under, zoneIdx } of leftGuestSigni) {
        const lf = collectLeaveFieldTriggers(cardNum, under, bs.guest_id, h, g, causeOwnerId, beforeGuest, zoneIdx);
        entries.push(...lf.entries); useHost(lf.usedHostIds); useGuest(lf.usedGuestIds);
      }
      // §6.3 J-4: アタックフェイズ中に場を離れたシグニを記録する（`SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE`・WX24-P2-075-E1）。
      // ⚠アタックフェイズ以外では記録しない（フェイズ開始時のリセットと合わせて「そのアタックフェイズの間」を表す）。
      if (['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase)) {
        const leftHost  = detectLeftFieldSigni(beforeHost, h).map(x => x.cardNum);
        const leftGuest = detectLeftFieldSigni(beforeGuest, g).map(x => x.cardNum);
        if (leftHost.length > 0)  h = { ...h, signi_left_field_this_attack_phase: [...(h.signi_left_field_this_attack_phase ?? []), ...leftHost] };
        if (leftGuest.length > 0) g = { ...g, signi_left_field_this_attack_phase: [...(g.signi_left_field_this_attack_phase ?? []), ...leftGuest] };
        // 🆕**行き先つきの射影も同時に記録する**（§5.4 (b)・2026-09-06 第189バッチ）＝原文が
        //   「場から**トラッシュに置かれて**いた場合」と行き先を名指しする効果（`WX18-056-E1`）用。
        //   ⚠**上の無印版と必ず同じ位置で書く**（片方だけ書くと2つの履歴が黙ってずれる）。
        const leftHostTr  = detectLeftFieldSigniToTrash(beforeHost, h);
        const leftGuestTr = detectLeftFieldSigniToTrash(beforeGuest, g);
        if (leftHostTr.length > 0)  h = { ...h, signi_left_field_to_trash_this_attack_phase: [...(h.signi_left_field_to_trash_this_attack_phase ?? []), ...leftHostTr] };
        if (leftGuestTr.length > 0) g = { ...g, signi_left_field_to_trash_this_attack_phase: [...(g.signi_left_field_to_trash_this_attack_phase ?? []), ...leftGuestTr] };
      }

      // ON_DRAW: 効果でカードを引いた場合（cards_drawn_by_effect_this_turn 増加を検出）
      if ((h.cards_drawn_by_effect_this_turn ?? 0) > (beforeHost.cards_drawn_by_effect_this_turn ?? 0)) {
        const dt = collectDrawTriggers(bs.host_id, h, g);
        entries.push(...dt.entries); useHost(dt.usedOncePerTurnIds);
        const odt = collectOppDrawTriggers(bs.guest_id, g, h);
        entries.push(...odt.entries); useGuest(odt.usedOncePerTurnIds);
      }
      if ((g.cards_drawn_by_effect_this_turn ?? 0) > (beforeGuest.cards_drawn_by_effect_this_turn ?? 0)) {
        const dt = collectDrawTriggers(bs.guest_id, g, h);
        entries.push(...dt.entries); useGuest(dt.usedOncePerTurnIds);
        const odt = collectOppDrawTriggers(bs.host_id, h, g);
        entries.push(...odt.entries); useHost(odt.usedOncePerTurnIds);
      }

      // ON_CARD_MILLED_FROM_DECK: デッキ→トラッシュ（ミル）が起きた場合
      const milledHost  = countMilledFromDeck(beforeHost, h);
      const milledGuest = countMilledFromDeck(beforeGuest, g);
      const milledHostCards = detectMilledFromDeck(beforeHost, h);
      const milledGuestCards = detectMilledFromDeck(beforeGuest, g);
      if (milledHost > 0 || milledGuest > 0) {
        const mtH = collectMillTriggers(bs.host_id, h, g, milledHost, milledGuest, milledHostCards, milledGuestCards, causeOwnerId);
        entries.push(...mtH.entries); useHost(mtH.usedOncePerTurnIds);
        const mtG = collectMillTriggers(bs.guest_id, g, h, milledGuest, milledHost, milledGuestCards, milledHostCards, causeOwnerId);
        entries.push(...mtG.entries); useGuest(mtG.usedOncePerTurnIds);
        // SELF_DECK_TO_TRASH_THIS_TURN（「このターンにあなたのデッキからカードがN枚以上トラッシュに置かれていた場合」
        // WXDi-P03-065）用のターン累計。⚠**持ち主基準**＝自分のデッキから落ちた枚数を自分の state へ積む
        // （相手効果で落とされた場合も自分のデッキが減っているので数える＝原文に原因限定が無い）。
        // 🆕**実体側も同じ地点で積む**（絞り込み付きの履歴参照＝`SELF_DECK_TO_TRASH_THIS_TURN{filter}` 用）。
        if (milledHost > 0)  h = { ...h, deck_to_trash_count_this_turn: (h.deck_to_trash_count_this_turn ?? 0) + milledHost, deck_to_trash_cards_this_turn: [...(h.deck_to_trash_cards_this_turn ?? []), ...milledHostCards] };
        if (milledGuest > 0) g = { ...g, deck_to_trash_count_this_turn: (g.deck_to_trash_count_this_turn ?? 0) + milledGuest, deck_to_trash_cards_this_turn: [...(g.deck_to_trash_cards_this_turn ?? []), ...milledGuestCards] };
      }

      // ON_CHARM_TO_TRASH: 【チャーム】が場→トラッシュに置かれた場合
      const charmHost  = countCharmsToTrash(beforeHost, h);
      const charmGuest = countCharmsToTrash(beforeGuest, g);
      if (charmHost > 0 || charmGuest > 0) {
        const chH = collectCharmToTrashTriggers(bs.host_id, h, g, charmHost, charmGuest);
        entries.push(...chH.entries); useHost(chH.usedOncePerTurnIds);
        const chG = collectCharmToTrashTriggers(bs.guest_id, g, h, charmGuest, charmHost);
        entries.push(...chG.entries); useGuest(chG.usedOncePerTurnIds);
      }

      // ON_MAGIC_BOX_FLIPPED: 効果で【マジックボックス】が表向きになった場合（§6.4 A群・WX24-P4-016-E3）
      const mbFlipHost  = countMagicBoxesFlipped(beforeHost, h);
      const mbFlipGuest = countMagicBoxesFlipped(beforeGuest, g);
      if (mbFlipHost > 0 || mbFlipGuest > 0) {
        const mbH = collectMagicBoxFlippedTriggers(bs.host_id, h, g, mbFlipHost, mbFlipGuest);
        entries.push(...mbH.entries); useHost(mbH.usedOncePerTurnIds);
        const mbG = collectMagicBoxFlippedTriggers(bs.guest_id, g, h, mbFlipGuest, mbFlipHost);
        entries.push(...mbG.entries); useGuest(mbG.usedOncePerTurnIds);
      }

      // ON_COIN_GAINED: 効果解決で《コインアイコン》が増えた場合（§6.3 J-5・SP27-007-E1）。
      // ⚠グロウ／アシストグロウ／CPU グロウの獲得はこの funnel を通らないので各サイトで別途収集する
      //   （既存 ON_COIN_PAID がコスト支払いの全サイトを個別に押さえているのと同じ形）。
      const coinGainHost  = countCoinsGained(beforeHost, h);
      const coinGainGuest = countCoinsGained(beforeGuest, g);
      if (coinGainHost > 0 || coinGainGuest > 0) {
        const cgH = collectCoinGainedTriggers(bs.host_id, h, g, coinGainHost, coinGainGuest);
        entries.push(...cgH.entries); useHost(cgH.usedOncePerTurnIds);
        const cgG = collectCoinGainedTriggers(bs.guest_id, g, h, coinGainGuest, coinGainHost);
        entries.push(...cgG.entries); useGuest(cgG.usedOncePerTurnIds);
      }

      // ON_ACCE_TO_TRASH: 【アクセ】が場→トラッシュに置かれた場合（§6.3 J-2・WXEX2-19-E1）
      const acceHost  = countAcceToTrash(beforeHost, h);
      const acceGuest = countAcceToTrash(beforeGuest, g);
      if (acceHost > 0 || acceGuest > 0) {
        const acH = collectAcceToTrashTriggers(bs.host_id, h, g, acceHost, acceGuest);
        entries.push(...acH.entries); useHost(acH.usedOncePerTurnIds);
        const acG = collectAcceToTrashTriggers(bs.guest_id, g, h, acceGuest, acceHost);
        entries.push(...acG.entries); useGuest(acG.usedOncePerTurnIds);
      }

      // ON_SOUL_ATTACHED / ON_CARD_ATTACHED: 自分の場のシグニに【ソウル】/カードが付いた場合（§6.3 J-2）。
      // 付与先ホストは各プレイヤーの盤面ごとに検出する＝そのプレイヤーの場の【自】だけが反応する。
      for (const [pid, before, after, otherAfter] of [
        [bs.host_id, beforeHost, h, g] as const,
        [bs.guest_id, beforeGuest, g, h] as const,
      ]) {
        const use = pid === bs.host_id ? useHost : useGuest;
        const souls = detectSoulAttached(before, after).map(x => ({ hostNum: x.hostNum, count: 1 }));
        if (souls.length > 0) {
          const r = collectAttachedTriggers(pid, after, otherAfter, 'ON_SOUL_ATTACHED', souls);
          entries.push(...r.entries); use(r.usedOncePerTurnIds);
        }
        const attached = detectCardAttached(before, after).map(x => ({ hostNum: x.hostNum, count: x.count }));
        if (attached.length > 0) {
          const r = collectAttachedTriggers(pid, after, otherAfter, 'ON_CARD_ATTACHED', attached);
          entries.push(...r.entries); use(r.usedOncePerTurnIds);
        }
      }

      // ON_ENERGY_TO_TRASH: エナゾーン→トラッシュが起きた場合。
      // ⚠あわせて「エナゾーンから出て行った枚数（行き先を問わない）」も渡す＝`energyLeftToAnyZone` を持つ効果
      //   （WXDi-P06-038-E1「他の領域に移動したとき」）は手札/場/デッキ行きでも発火する。ここは効果解決の
      //   中央 diff なので「効果によって」の限定は構造的に満たされる（コスト支払いはこの関数を通らない）。
      const energyTrashHost  = countEnergyToTrash(beforeHost, h);
      const energyTrashGuest = countEnergyToTrash(beforeGuest, g);
      const energyLeftHost   = countEnergyLeftZone(beforeHost, h);
      const energyLeftGuest  = countEnergyLeftZone(beforeGuest, g);
      if (energyTrashHost > 0 || energyTrashGuest > 0 || energyLeftHost > 0 || energyLeftGuest > 0) {
        const etH = collectEnergyToTrashTriggers(bs.host_id, h, g, energyTrashHost, energyTrashGuest, energyLeftHost, energyLeftGuest, causeOwnerId);
        entries.push(...etH.entries); useHost(etH.usedOncePerTurnIds);
        const etG = collectEnergyToTrashTriggers(bs.guest_id, g, h, energyTrashGuest, energyTrashHost, energyLeftGuest, energyLeftHost, causeOwnerId);
        entries.push(...etG.entries); useGuest(etG.usedOncePerTurnIds);
      }

      // ON_HAND_OR_ENERGY_LOST_BY_OPP: 「対戦相手の効果1つによって、あなたの手札が捨てられるか
      // あなたのエナゾーンからカードがトラッシュに置かれたとき」（WXDi-P13-051-E3）。
      // ⚠**2経路を1回の走査でまとめて見る**のが要点＝原文の「効果1つによって」は、1解決で両方起きても
      //   発火は1度だけ、という意味。手札捨てだけ React watcher（ON_HAND_DISCARDED）に任せると、
      //   同じ解決で2回積まれる（両方やる相手効果は実在＝WXK02-004／WXDi-P10-003／WXDi-P13-003A）。
      // 原因（対戦相手の効果か）は causeOwnerId で判定する。コスト支払いはこの関数を通らない。
      {
        const handLostHost = detectHandTrashed(beforeHost, h).length;
        const handLostGuest = detectHandTrashed(beforeGuest, g).length;
        if (handLostHost > 0 || handLostGuest > 0 || energyTrashHost > 0 || energyTrashGuest > 0) {
          const rlH = pureCollectOppResourceLossTriggers(
            mkTrigCtx(), bs.host_id, h, g, handLostHost, energyTrashHost, causeOwnerId === bs.guest_id);
          entries.push(...rlH.entries); useHost(rlH.usedOncePerTurnIds);
          const rlG = pureCollectOppResourceLossTriggers(
            mkTrigCtx(), bs.guest_id, g, h, handLostGuest, energyTrashGuest, causeOwnerId === bs.host_id);
          entries.push(...rlG.entries); useGuest(rlG.usedOncePerTurnIds);
        }
      }

      // ON_SIGNI_CRASHED_LIFE_TOTAL: 効果によるライフクラッシュ（execLifeCrash が主体別カウンタへ加算）で
      // 合計が閾値に達したシグニを収集する。攻撃によるクラッシュは攻撃解決側で同じ collector を呼ぶ
      // （経路が別＝アタックはこの中央 diff を通らない）。増えたキーだけを見るので既存効果に波及しない。
      for (const side of ['host', 'guest'] as const) {
        const isHostSide = side === 'host';
        const before = isHostSide ? beforeHost : beforeGuest;
        const beforeMap = before.life_crashed_by_signi_this_turn ?? {};
        // 走査のたびに最新の h/g を読む（useHost/useGuest が actions_done を積むため）。
        for (const [signiNum, total] of Object.entries((isHostSide ? h : g).life_crashed_by_signi_this_turn ?? {})) {
          if (total <= (beforeMap[signiNum] ?? 0)) continue;
          const ct = pureCollectSigniCrashTotalTriggers(
            mkTrigCtx(), isHostSide ? bs.host_id : bs.guest_id,
            isHostSide ? h : g, isHostSide ? g : h, signiNum, total,
          );
          entries.push(...ct.entries);
          if (isHostSide) useHost(ct.usedOncePerTurnIds); else useGuest(ct.usedOncePerTurnIds);
        }
      }

      // ON_REFRESH: いずれかのプレイヤーがリフレッシュした場合
      const refreshHost  = countRefresh(beforeHost, h);
      const refreshGuest = countRefresh(beforeGuest, g);
      if (refreshHost > 0 || refreshGuest > 0) {
        const rfH = collectRefreshTriggers(bs.host_id, h, g, refreshHost, refreshGuest);
        entries.push(...rfH.entries); useHost(rfH.usedOncePerTurnIds);
        const rfG = collectRefreshTriggers(bs.guest_id, g, h, refreshGuest, refreshHost);
        entries.push(...rfG.entries); useGuest(rfG.usedOncePerTurnIds);
        // 🆕`once` 遅延 watcher（「このターン**最初の**リフレッシュ」）は発火した側だけ設置を消費する
        //   （§5.3 2026-08-27 Sheet1 B11・`WX09-Re06`）。消費しないと同ターン2回目以降も発火する。
        if (rfH.firedOnceDelayed) h = consumeOnceDelayedTriggers(h, 'ON_REFRESH');
        if (rfG.firedOnceDelayed) g = consumeOnceDelayedTriggers(g, 'ON_REFRESH');
      }

      // ON_OPP_POWER_DECREASED（毒牙）: シグニのパワーが減った場合、減らした側（controller）が反応
      const decOnHost  = detectPowerDecrease(beforeHost, h);
      const decOnGuest = detectPowerDecrease(beforeGuest, g);
      if (decOnHost > 0 || decOnGuest > 0) {
        // 発生源限定（「あなたの＜X＞のシグニの効果によって」）判定用に、減少を起こした効果元カードも渡す。
        // 🆕§6.4 O-44＝**srcCardNum が刻まれない経路（POWER_MODIFY_PER_* / STUB 系）は
        //   `causeSourceCardNum`（いま解決中の効果の発生源カード）へ寄せる**。減少はその効果の解決中に
        //   起きているので発生源はそのカード。コレクタ側は fail-closed（不明なら発火しない）。
        const decSrcOnHost  = detectPowerDecreaseSources(beforeHost, h, causeSourceCardNum);
        const decSrcOnGuest = detectPowerDecreaseSources(beforeGuest, g, causeSourceCardNum);
        const dpH = collectPowerDecreaseTriggers(bs.host_id, h, g, decOnGuest, decSrcOnGuest, causeOwnerId);
        entries.push(...dpH.entries); useHost(dpH.usedOncePerTurnIds);
        const dpG = collectPowerDecreaseTriggers(bs.guest_id, g, h, decOnHost, decSrcOnHost, causeOwnerId);
        entries.push(...dpG.entries); useGuest(dpG.usedOncePerTurnIds);
      }

      // ON_CARD_MOVED_TO_DECK: 他領域→デッキ移動が起きた場合
      const movedHost = countMovedToDeck(beforeHost, h, false);
      const movedGuest = countMovedToDeck(beforeGuest, g, false);
      const movedHostFromTrash = countMovedToDeck(beforeHost, h, true);
      const movedGuestFromTrash = countMovedToDeck(beforeGuest, g, true);
      // §5.3 `O-116`＝**場から**デッキへ戻った枚数（`WX05-019-E3` の由来限定）。
      const movedHostFromField = countMovedToDeckFromField(beforeHost, h);
      const movedGuestFromField = countMovedToDeckFromField(beforeGuest, g);
      if (movedHost > 0 || movedGuest > 0) {
        const mvH = collectMoveToDeckTriggers(bs.host_id, h, g, movedHost, movedHostFromTrash, movedGuest, causeOwnerId, movedHostFromField, movedGuestFromField);
        entries.push(...mvH.entries); useHost(mvH.usedOncePerTurnIds);
        const mvG = collectMoveToDeckTriggers(bs.guest_id, g, h, movedGuest, movedGuestFromTrash, movedHost, causeOwnerId, movedGuestFromField, movedHostFromField);
        entries.push(...mvG.entries); useGuest(mvG.usedOncePerTurnIds);
        // OPP_CARDS_MOVED_TO_DECK_THIS_TURN: 「対戦相手のカードがあなたの効果によってデッキに移動」の累計（WXK06-071）。
        // 効果オーナー（causeOwnerId）＝アクティブプレイヤーの counter に、相手のカードが移動した枚数を積む。
        // ルール処理/バトル（causeOwnerId=undefined）は「あなたの効果」ではないので数えない。
        if (causeOwnerId === bs.host_id && movedGuest > 0) {
          h = { ...h, opp_cards_moved_to_deck_this_turn: (h.opp_cards_moved_to_deck_this_turn ?? 0) + movedGuest };
        } else if (causeOwnerId === bs.guest_id && movedHost > 0) {
          g = { ...g, opp_cards_moved_to_deck_this_turn: (g.opp_cards_moved_to_deck_this_turn ?? 0) + movedHost };
        }
      }

      // ON_ZONE_MOVED の原因主体限定付き watcher は、この解決の causeOwnerId が残っている中央 diff で収集する。
      // 後段の zone_moved_just watcher は原因限定なしだけを処理してフラグをクリアする。
      for (const movedNum of (h.zone_moved_just ?? []).filter(n => !(beforeHost.zone_moved_just ?? []).includes(n))) {
        const zm = pureCollectZoneMovedTriggers(mkTrigCtx(), movedNum, h, g, bs.host_id, bs.guest_id, causeOwnerId, true);
        entries.push(...zm.entries);
        if (zm.moverUsedIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...zm.moverUsedIds] };
        if (zm.otherUsedIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...zm.otherUsedIds] };
      }
      for (const movedNum of (g.zone_moved_just ?? []).filter(n => !(beforeGuest.zone_moved_just ?? []).includes(n))) {
        const zm = pureCollectZoneMovedTriggers(mkTrigCtx(), movedNum, g, h, bs.guest_id, bs.host_id, causeOwnerId, true);
        entries.push(...zm.entries);
        if (zm.moverUsedIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...zm.moverUsedIds] };
        if (zm.otherUsedIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...zm.otherUsedIds] };
      }

      // ON_HAND_ADDED: 効果によってカードが手札に移動した場合（続き207・WX25-P2-063/WXDi-P11-007/WX14-029/WD12-009）
      const handAddedHost = detectHandAdded(beforeHost, h);
      const handAddedGuest = detectHandAdded(beforeGuest, g);
      if (handAddedHost.length > 0 || handAddedGuest.length > 0) {
        const ha = pureCollectHandAddedTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, moved: handAddedHost },
          { ownerId: bs.guest_id, moved: handAddedGuest },
        ], causeOwnerId, h, g);
        entries.push(...ha.entries); useHost(ha.usedHostIds); useGuest(ha.usedGuestIds);
      }
      // ON_TRASH_CARD_ADDED: 効果によってトラッシュにカードが置かれた場合（§6.4 O-37(c)・WX24-P3-007 の付与【自】）。
      // ⚠**移動元を問わない**＝ON_CARD_MILLED_FROM_DECK（デッキ限定）とは別軸で、同じ解決で両方発火しうる。
      //   「対戦相手の効果1つによって」は causeOwnerId で判定する（コスト支払いはこの中央 diff を通らない）。
      const trashAddedHost = detectTrashAdded(beforeHost, h);
      const trashAddedGuest = detectTrashAdded(beforeGuest, g);
      if (trashAddedHost.length > 0 || trashAddedGuest.length > 0) {
        const ta = pureCollectTrashAddedTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, nums: trashAddedHost },
          { ownerId: bs.guest_id, nums: trashAddedGuest },
        ], causeOwnerId, h, g);
        entries.push(...ta.entries); useHost(ta.usedHostIds); useGuest(ta.usedGuestIds);
      }
      // ON_ENERGY_CHARGE movedSelf: エナへ移動したカード自身の AUTO。場 watcher とは movedSelf で排他的。
      const energyAddedSelfHost = detectEnergyAddedWithSource(beforeHost, h);
      const energyAddedSelfGuest = detectEnergyAddedWithSource(beforeGuest, g);
      if (energyAddedSelfHost.length > 0 || energyAddedSelfGuest.length > 0) {
        const eaSelf = pureCollectEnergyAddedSelfTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, moved: energyAddedSelfHost },
          { ownerId: bs.guest_id, moved: energyAddedSelfGuest },
        ], causeOwnerId, causeSourceCardNum, h, g);
        entries.push(...eaSelf.entries); useHost(eaSelf.usedHostIds); useGuest(eaSelf.usedGuestIds);
      }
      // ON_ENERGY_TO_FIELD: エナゾーンからシグニが場に出た場合（続き207・WXDi-P11-007-E1「か場に出たとき」枝。
      // 手札枝と同一効果の usageLimit を共有するため ON_HAND_ADDED の usedIds 反映（useHost/useGuest）後に呼ぶ）
      const evfHost = detectPlacedFromEnergy(beforeHost, h);
      const evfGuest = detectPlacedFromEnergy(beforeGuest, g);
      if (evfHost.length > 0 || evfGuest.length > 0) {
        const ev = pureCollectEnergyToFieldTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, nums: evfHost },
          { ownerId: bs.guest_id, nums: evfGuest },
        ], h, g);
        entries.push(...ev.entries); useHost(ev.usedHostIds); useGuest(ev.usedGuestIds);
      }

      // ON_LIFE_CLOTH_ADDED: ライフクロスの増加分だけを検出（減少側の ON_LIFE_CRASHED と混線しない）。
      const lifeAddedHost = detectLifeClothAdded(beforeHost, h);
      const lifeAddedGuest = detectLifeClothAdded(beforeGuest, g);
      if (lifeAddedHost.length > 0 || lifeAddedGuest.length > 0) {
        const la = pureCollectLifeClothAddedTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, nums: lifeAddedHost },
          { ownerId: bs.guest_id, nums: lifeAddedGuest },
        ], h, g);
        entries.push(...la.entries); useHost(la.usedHostIds); useGuest(la.usedGuestIds);
      }

      // ON_LIFE_CLOTH_MOVED: 宛先付き離脱。クラッシュ直後は life→field.check のため to:'other'。
      // check→energy/trash の解決時は life 差分が無く、クラッシュ専用枝は ON_LIFE_CRASHED が収集する。
      const lifeMovedHost = detectLifeClothMoved(beforeHost, h);
      const lifeMovedGuest = detectLifeClothMoved(beforeGuest, g);
      if (lifeMovedHost.length > 0 || lifeMovedGuest.length > 0) {
        const lm = pureCollectLifeClothMovedTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, moved: lifeMovedHost, beforeCount: beforeHost.life_cloth.length, afterCount: h.life_cloth.length },
          { ownerId: bs.guest_id, moved: lifeMovedGuest, beforeCount: beforeGuest.life_cloth.length, afterCount: g.life_cloth.length },
        ], h, g);
        entries.push(...lm.entries); useHost(lm.usedHostIds); useGuest(lm.usedGuestIds);
      }

      // ON_OPP_ENERGY_ADDED: 相手エナの増加を逆 scope で監視し、置かれたカード自身を triggeringCardNum に渡す。
      const energyAddedHost = detectEnergyAdded(beforeHost, h);
      const energyAddedGuest = detectEnergyAdded(beforeGuest, g);
      if (energyAddedHost.length > 0 || energyAddedGuest.length > 0) {
        const ea = pureCollectOppEnergyAddedTriggers(mkTrigCtx(), [
          { ownerId: bs.host_id, nums: energyAddedHost },
          { ownerId: bs.guest_id, nums: energyAddedGuest },
        ], h, g);
        entries.push(...ea.entries); useHost(ea.usedHostIds); useGuest(ea.usedGuestIds);
      }

      // ON_SIGNI_FROZEN: 新たに凍結状態になったシグニ
      { const fz = collectFreezeInline(h, g); entries.push(...fz.entries); h = fz.hostState; g = fz.guestState; }

      // ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP: 効果でダウン/アップ状態が変わったシグニ（タスク16[C]機構①・byEffect=true）
      { const du = collectSigniDownUpInline(h, g); entries.push(...du.entries); h = du.hostState; g = du.guestState; }

      // ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（OR複合・WXDi-P11-064）: 「あなたのターンの間」＝ターンプレイヤーを controller として、
      // 味方シグニが場に出た（play枝）か相手手札がトラッシュに置かれた（discard枝・⚠自効果限定は近似）場合に発火。
      {
        const turnIsHost = (bs.active_user_id ?? bs.host_id) === bs.host_id;
        const apTurnBefore = turnIsHost ? beforeHost : beforeGuest;
        const apTurnAfter = turnIsHost ? h : g;
        const apOppBefore = turnIsHost ? beforeGuest : beforeHost;
        const apOppAfter = turnIsHost ? g : h;
        // 裏向き→表向き（WXDi-P10-034）は「場に出た」扱いではないため「あなたのシグニが場に出たとき」から除外。
        const facedownFlippedAP = new Set<string>(detectFacedownFlipped(apTurnBefore, apTurnAfter));
        const allyPlaced = detectPlacedSigni(apTurnBefore, apTurnAfter).filter(n => !facedownFlippedAP.has(n));
        const oppDiscarded = detectHandTrashed(apOppBefore, apOppAfter).length;
        if (allyPlaced.length > 0 || oppDiscarded > 0) {
          const turnPlayerId = turnIsHost ? bs.host_id : bs.guest_id;
          const ap = collectAllyPlayOrOppDiscardTriggers(turnPlayerId, apTurnAfter, allyPlaced, oppDiscarded);
          entries.push(...ap.entries);
          if (turnIsHost) useHost(ap.usedOncePerTurnIds); else useGuest(ap.usedOncePerTurnIds);
        }
      }

      // ON_MATERIAL_USED（self/any_ally・改造素材機構）: MARK_MATERIAL_TARGET が material_used_targets を積んだ場合、
      // 対象シグニ所有者の「このシグニに/他の味方に使用されたとき」を発火し、処理後に material_used_targets をクリア。
      for (const muIsHost of [true, false]) {
        const muOwnerId = muIsHost ? bs.host_id : bs.guest_id;
        const muBefore = (muIsHost ? beforeHost : beforeGuest)?.material_used_targets ?? [];
        const muAfterState = muIsHost ? h : g;
        const muAfter = muAfterState.material_used_targets ?? [];
        const beforeSetMU = new Set(muBefore);
        const newTargets = muAfter.filter(n => !beforeSetMU.has(n));
        if (newTargets.length > 0) {
          const mu = collectMaterialUsedOnSigniTriggers(newTargets, muOwnerId, muAfterState);
          const cleared = { ...muAfterState, material_used_targets: [],
            actions_done: [...(muAfterState.actions_done ?? []), ...mu.usedOncePerTurnIds] };
          if (muIsHost) h = cleared; else g = cleared;
          entries.push(...mu.entries);
        }
      }

      // ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（C1・WX07-036）: 対戦相手シグニがバニッシュされ、かつ発生源
      // （causeSourceCardNum）が発生源側プレイヤーの場シグニの場合、その側の any_ally【自】を発火。
      { const bn = collectBanishOppByEffectInline(causeSourceCardNum, causeOwnerId, h, g); entries.push(...bn.entries); h = bn.hostState; g = bn.guestState; }

      // ON_LRIG_UNDER_MOVED（C1・WXDi-P04-042）
      { const lu = collectLrigUnderMovedInline(h, g); entries.push(...lu.entries); h = lu.hostState; g = lu.guestState; }

      // ON_DECK_SHUFFLED（C1・PR-470A）
      { const ds = collectDeckShuffleInline(h, g); entries.push(...ds.entries); h = ds.hostState; g = ds.guestState; }

      // ON_KEYWORD_GAINED（C1・WXDi-P04-035）
      { const kg = collectKeywordGainedInline(h, g); entries.push(...kg.entries); h = kg.hostState; g = kg.guestState; }

      // ON_PLAY（自身＋any_ally/any・効果配置）＋ON_BLOOM。自身【出】は呼び出し側の明示 opt-in 時だけ収集するため、
      // 同じ diff を通る通常召喚の支払い差分では二重発火しない。
      // 場出しした効果元（causeSourceCardNum）がシグニかで bySigniEffect 発火可否を判定。開花は「場に出た」扱いでないため ON_PLAY 除外。
      const placeSourceIsSigni = battleCardMap.get(causeSourceCardNum)?.Type === 'シグニ';
      const hostBloomedSE  = detectBloomedSigni(beforeHost, h);
      const guestBloomedSE = detectBloomedSigni(beforeGuest, g);
      // 裏向き→表向き（WXDi-P10-034）も開花と同じく「場に出た」扱いではないため ON_PLAY から除外する。
      const bloomedSetSE = new Set<string>([...hostBloomedSE, ...guestBloomedSE,
        ...detectFacedownFlipped(beforeHost, h), ...detectFacedownFlipped(beforeGuest, g)]);
      for (const placedNum of detectPlacedSigni(beforeHost, h)) {
        if (bloomedSetSE.has(placedNum)) continue;
        const placedFromZone = detectPlacedFromZone(beforeHost, placedNum, h);
        if (meta.collectPlacedSelfOnPlay) {
          const self = pureCollectPlacedSelfOnPlayTriggers(mkTrigCtx(), placedNum, h, g, bs.host_id, {
            placedByEffect: true,
            sourceIsSigni: placeSourceIsSigni,
            suppressOnPlay: meta.suppressOnPlay,
            placedFromZone,
          });
          entries.push(...self.entries); useHost(self.usedHostIds); useGuest(self.usedGuestIds);
        }
        const ft = collectFieldTriggers('ON_PLAY', placedNum, h, g, bs.host_id, { placedByEffect: true, placeSourceIsSigni, placedFromZone });
        entries.push(...ft.entries); useHost(ft.usedHostIds); useGuest(ft.usedGuestIds);
      }
      for (const placedNum of detectPlacedSigni(beforeGuest, g)) {
        if (bloomedSetSE.has(placedNum)) continue;
        const placedFromZone = detectPlacedFromZone(beforeGuest, placedNum, g);
        if (meta.collectPlacedSelfOnPlay) {
          const self = pureCollectPlacedSelfOnPlayTriggers(mkTrigCtx(), placedNum, g, h, bs.guest_id, {
            placedByEffect: true,
            sourceIsSigni: placeSourceIsSigni,
            suppressOnPlay: meta.suppressOnPlay,
            placedFromZone,
          });
          entries.push(...self.entries); useHost(self.usedHostIds); useGuest(self.usedGuestIds);
        }
        const ft = collectFieldTriggers('ON_PLAY', placedNum, g, h, bs.guest_id, { placedByEffect: true, placeSourceIsSigni, placedFromZone });
        entries.push(...ft.entries); useHost(ft.usedHostIds); useGuest(ft.usedGuestIds);
      }
      for (const bloomedNum of hostBloomedSE) {
        const bl = collectBloomTriggers(bloomedNum, h, g, bs.host_id);
        entries.push(...bl.entries); useHost(bl.usedHostIds); useGuest(bl.usedGuestIds);
      }
      for (const bloomedNum of guestBloomedSE) {
        const bl = collectBloomTriggers(bloomedNum, g, h, bs.guest_id);
        entries.push(...bl.entries); useHost(bl.usedHostIds); useGuest(bl.usedGuestIds);
      }

      // ON_ENERGY_FROM_TRASH: トラッシュからエナゾーンに移動したカード
      for (const [ownerId, before, after] of [[bs.host_id, beforeHost, h], [bs.guest_id, beforeGuest, g]] as const) {
        for (const cardNum of detectEnergyFromTrash(before, after)) {
          for (const eff of (effectsMap.get(cardNum) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_FROM_TRASH')) continue;
            entries.push({
              id: generateUUID(),
              playerId: ownerId,
              cardNum,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（トラッシュからエナ時）`,
              effect: eff,
            });
          }
        }
      }

      // ON_BLOOD_CRYSTAL_ARMOR: 血晶武装状態になったシグニ
      for (const cardNum of detectNewlyArmored(beforeHost, h)) {
        const at = collectArmorTriggers(cardNum, bs.host_id, h, g);
        entries.push(...at.entries); useHost(at.usedHostIds); useGuest(at.usedGuestIds);
      }
      for (const cardNum of detectNewlyArmored(beforeGuest, g)) {
        const at = collectArmorTriggers(cardNum, bs.guest_id, h, g);
        entries.push(...at.entries); useHost(at.usedHostIds); useGuest(at.usedGuestIds);
      }

      return { entries, hostState: h, guestState: g };
    };

  return collectBoardDiffTriggers;
}
