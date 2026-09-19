import { calcFieldPowers, calcContinuousSigniMutations, collectBanishEffectProtectedSigni, banishRedirectAppliesFrom, banishRedirectFrontMatches, checkActiveCondition } from '../../../engine/effectEngine';
import { getCardNum, removeFromField, refreshPlayersIfDeckEmpty } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectSigniDownUpTriggers as pureCollectSigniDownUpTriggers, recordSigniDownedThisTurn, collectBanishTriggers as pureCollectBanishTriggers, collectPowerZeroTriggers as pureCollectPowerZeroTriggers, collectRefreshTriggers as pureCollectRefreshTriggers, collectTrashTriggers as pureCollectTrashTriggers } from '../../../engine/triggerCollect';
import type { EffectStack, PlayerState, StackEntry } from '../../../types';
import { detectNewlyDowned } from '../../../engine/boardDiff';
import { recordEnergyPlacements } from '../../../engine/energyPlacement';
import { resonaLeaveDestination } from '../../../engine/resonaZone';
import { hasBanishResist, hasKeyword } from '../../../utils/keywords';
import { consumeOnceDelayedTriggers } from '../delayedTrigger';
import { refreshForcesTurnEnd } from '../refreshTurnEnd';
import { applyForcedTurnEnd } from '../turnScopedState';
import { isSelectedPowerZeroBanishRedirect } from '../battleUtils';
import { applyLimitExcessTrash, planLimitExcess, pickLimitExcessZone } from '../limitExcess';
import { resolveLrigAttackContinuation } from '../attackNegation';
import { CPU_PLAYER_ID } from '../battleUtils';
import { reduceBattle, type PlayerStateKey } from './battleController';
import type { PerformCtx } from './performCtx';

/**
 * 🆕**盤面が動くたびに回る「ルール処理」8本**（§5.7 `S-5d` 第3段・2026-09-19）。
 *
 * ■ **なぜここへ出すか**＝この8本は `BattleScreen` の `useEffect` から回っており、
 *   **人間も CPU も区別せず盤面全体にかかる**（パワー0以下のバニッシュ・リミット超過・リフレッシュ …）。
 *   ヘッドレスの対戦ループ（`headlessMatch.ts`）は**この8本を回さないと盤面が止まる**ので、
 *   画面の `useEffect` に残したままでは CPU 同士の自己対戦が1ターンも回らない。
 * ■ **中身は逐語移設**＝読み替えているのは**材料の取り出し方だけ**で、
 *   `bs` / `my` / `op` / `persist` / `appendBattleLogs` … は**画面と同じ名前**に束ね直してある。
 *
 * ⚠**二重処理を止める指紋（`last*KeyRef`）は呼び出し側が持つ**＝画面は `useRef`、
 *   ヘッドレスはただのオブジェクト（`createRuleCheckMemo()`）。
 *   🔴**毎回新しく作らない**＝指紋が毎回空になると同じルール処理を何度も書き込む（盤面が壊れる）。
 */

/** 二重処理防止の指紋置き場（画面の `useRef` 群と同じ形）。 */
export interface RuleCheckMemo {
  lastBanishedKeyRef: { current: string };
  lastContMutationKeyRef: { current: string };
  lastRefreshTurnEndKeyRef: { current: string };
  lastDeferredRefreshKeyRef: { current: string };
  lastLimitExcessKeyRef: { current: string };
}

export function createRuleCheckMemo(): RuleCheckMemo {
  return {
    lastBanishedKeyRef: { current: '' }, lastContMutationKeyRef: { current: '' },
    lastRefreshTurnEndKeyRef: { current: '' }, lastDeferredRefreshKeyRef: { current: '' },
    lastLimitExcessKeyRef: { current: '' },
  };
}

/** 画面だけが持つもの（ヘッドレスは `loading:false` と自分の memo を渡す）。 */
export interface RuleChecksUi {
  /** 画面の操作ロック（多重クリック防止）。ヘッドレスは `false`。 */
  loading: boolean;
  /** CPU 対戦か（ログの主語と、CPU の盤面を自動で解くかの分岐）。 */
  isCpuBattle: boolean;
  memo: RuleCheckMemo;
}

export function makeRuleChecks(c: PerformCtx, p: RuleChecksUi) {
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
  const battleCards = c.cards;
  const mkTrigCtx = c.trigCtx;
  const isCpuBattle = p.isCpuBattle;
  const my = isHost ? bs.host_state : bs.guest_state;
  const op = isHost ? bs.guest_state : bs.host_state;
  const isMyTurn = bs.active_user_id === user.id;
  const { lastBanishedKeyRef, lastContMutationKeyRef, lastRefreshTurnEndKeyRef,
    lastDeferredRefreshKeyRef, lastLimitExcessKeyRef } = p.memo;
  // ── 画面にあった薄いラッパ（逐語）──
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
  const collectBanishTriggers = (
    banishedCardNum: string,
    banishedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
    prevOwnerState?: PlayerState,
    cause?: { ownerId: string; sourceCardNum?: string },
    battleAttackerNum?: string,
  ): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectBanishTriggers(mkTrigCtx(), banishedCardNum, banishedPlayerId, afterHostState, afterGuestState, prevOwnerState, cause, battleAttackerNum);
  const collectPowerZeroTriggers = (zeroedCardNum: string, zeroedOwnerId: string, afterHostState: PlayerState, afterGuestState: PlayerState): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } =>
    pureCollectPowerZeroTriggers(mkTrigCtx(), zeroedCardNum, zeroedOwnerId, afterHostState, afterGuestState);
  const collectRefreshTriggers = (
    controllerId: string,
    controllerState: PlayerState,
    otherState: PlayerState,
    refreshedByController: number,
    refreshedByOpp: number,
  ): { entries: StackEntry[]; usedOncePerTurnIds: string[]; firedOnceDelayed: boolean } =>
    pureCollectRefreshTriggers(mkTrigCtx(), controllerId, controllerState, otherState, refreshedByController, refreshedByOpp);

  // ON_ATTACK_LRIG解決後にガード応答をセット（pending_lrig_attackフラグをクリアしてlrig_attackedをセット）
  const resolvePendingLrigAttack = async () => {
    if (!my.pending_lrig_attack) return;
    if (loading) return;
    const myKey = isHost ? 'host_state' : 'guest_state';
    const opKey = isHost ? 'guest_state' : 'host_state';
    setLoading(true);
    try {
      // 🆕**進行中のルリグアタックの無効化**（意味照合 段2・`WXDi-P09-036-E1`）＝
      //   `ON_ATTACK_LRIG` で立った `cancel_current_lrig_attack` はここが唯一の消費地点。
      const contLA = resolveLrigAttackContinuation(my, op);
      if (contLA.cancelled) {
        appendBattleLogs([`${battleCardMap.get(getCardNum(my.pending_lrig_attack_num ?? my.field.lrig.at(-1) ?? ''))?.CardName ?? 'ルリグ'}のアタックは無効化された`]);
      }
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: myKey, myState: contLA.attacker, opp: { key: opKey, state: contLA.defender } }));
    } finally {
      setLoading(false);
    }
  };
  // ダブルクラッシュ等による追加ライフクラッシュ（バースト後に自動発動）
  // 同時クラッシュで先にライフから取り出したカードを check にセットして処理する
  const triggerPendingCrash = async () => {
    const pendingCards = my.pending_crashed_cards ?? [];
    if (!pendingCards.length || my.field.check || loading) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const [nextCard, ...remaining] = pendingCards;
      const [nextSource, ...remainingSources] = my.pending_crash_source_card_nums ?? [];
      const newMyState: PlayerState = {
        ...my,
        pending_crashed_cards: remaining,
        pending_crash_source_card_nums: remainingSources,
        crash_source_card_num: nextSource ?? undefined,
        field: { ...my.field, check: nextCard },
      };
      const crashedName = battleCardMap.get(nextCard)?.CardName ?? nextCard;
      appendBattleLogs([`ダブルクラッシュ：ライフクロスをクラッシュ（${crashedName}）`]);
      await persist.commit(reduceBattle(bs, { type: 'WRITE_STATE', myKey: stateKey, myState: newMyState }));
    } finally {
      setLoading(false);
    }
  };

  // パワー0以下シグニの自動バニッシュ処理
  const checkAndBanishPowerZero = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    // カードマスタ（cards）が未ロードだと battleCardMap が空になり、全シグニのパワーが
    // 取得できず parseInt('0')=0 と誤判定され、盤面全体を誤バニッシュしてDBに書き込んでしまう。
    // リロード直後にカードデータfetchが未完了のまま battle_state を購読すると発生するため、
    // カードデータが揃うまでルール処理（破壊的書き込み）を一切行わない。
    if (battleCardMap.size === 0) return;
    if (bs.effect_stack || bs.pending_effect) return;

    const isMyTurnLocal = bs.active_user_id === bs.host_id;
    const powers = calcFieldPowers(bs.host_state, bs.guest_state, isMyTurnLocal, effectsMap, battleCardMap, bs.turn_phase);

    // バニッシュ候補を先に収集してフィンガープリントで二重処理を防ぐ
    const candidates: string[] = [];
    for (const ownerIsHost of [true, false]) {
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const opStateP0 = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurnP0 = ownerIsHost ? isMyTurnLocal : !isMyTurnLocal;
      const grants = ownerState.keyword_grants;
      const grantsOppTurn = ownerState.keyword_grants_until_opp_turn;
      // CONTINUOUS GRANT_PROTECTION from=['BANISH'] による保護（activeCondition 評価込み）
      const banishProtected = collectBanishEffectProtectedSigni(ownerState, opStateP0, isOwnerTurnP0, effectsMap, battleCardMap, undefined, 'rule', bs.turn_phase);
      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const rawPower = battleCardMap.get(topNum)?.Power;
        const power = powers.get(topNum) ?? (rawPower === '∞' ? Infinity : parseInt(rawPower ?? '0', 10));
        // NaN（Power「-」等の非数値）はバニッシュ対象にしない
        if (isNaN(power) || power > 0) continue;
        if (banishProtected.has(topNum)) continue;
        if (hasBanishResist(topNum, battleCardMap, grants, grantsOppTurn)) continue;
        candidates.push(topNum);
      }
    }
    if (candidates.length === 0) return;

    const candidateKey = [...candidates].sort().join(',');
    if (candidateKey === lastBanishedKeyRef.current) return; // DB伝播待ち中の二重処理をスキップ
    lastBanishedKeyRef.current = candidateKey;

    let hostState  = bs.host_state;
    let guestState = bs.guest_state;
    const allTriggers: StackEntry[] = [];

    for (const ownerIsHost of [true, false]) {
      const ownerId = ownerIsHost ? bs.host_id : bs.guest_id;
      const ownerState = ownerIsHost ? hostState : guestState;
      const opStateP02 = ownerIsHost ? guestState : hostState;
      const isOwnerTurnP02 = ownerIsHost ? isMyTurnLocal : !isMyTurnLocal;
      const grants = ownerState.keyword_grants;
      const grantsOppTurn2 = ownerState.keyword_grants_until_opp_turn;
      const banishProtected2 = collectBanishEffectProtectedSigni(ownerState, opStateP02, isOwnerTurnP02, effectsMap, battleCardMap, undefined, 'rule', bs.turn_phase);

      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const rawPower = battleCardMap.get(topNum)?.Power;
        const power = powers.get(topNum) ?? (rawPower === '∞' ? Infinity : parseInt(rawPower ?? '0', 10));
        // NaN（Power「-」等の非数値）はバニッシュ対象にしない
        if (isNaN(power) || power > 0) continue;
        if (banishProtected2.has(topNum)) continue;
        if (hasBanishResist(topNum, battleCardMap, grants, grantsOppTurn2)) continue;

        const currentOwner = ownerIsHost ? hostState : guestState;
        const removed = removeFromField(topNum, currentOwner);
        const opState = ownerIsHost ? guestState : hostState;
        const opIsOwnerTurnP0 = ownerIsHost ? !isMyTurnLocal : isMyTurnLocal;
        // パワー0バニッシュ: 相手の同ゾーンシグニがシュートを持つ場合もトラッシュへ
        const dieZoneP0 = currentOwner.field.signi.findIndex(s => s?.at(-1) === topNum);
        const opZoneSigniP0 = dieZoneP0 >= 0 ? opState.field.signi[dieZoneP0]?.at(-1) ?? null : null;
        const opShootP0 = opZoneSigniP0 != null &&
          hasKeyword(opZoneSigniP0, 'シュート', battleCardMap, opState.keyword_grants, undefined, opState.keyword_grants_until_opp_turn, undefined, opState.abilities_removed);
        const redirectBanishP0 =
          opShootP0 ||
          opState.banish_redirect === true ||
          // パワー0以下のシグニ→トラッシュ（所有者問わず。WX04-038-E1。どちらかのプレイヤーが設定）
          hostState.power0_banish_to_trash === true ||
          guestState.power0_banish_to_trash === true ||
          // 「対戦相手の」限定版（BANISH_REDIRECT whenPowerZero・続き218）＝設定した側の対戦相手のシグニだけ。
          // opState は消滅するシグニの持ち主から見た対戦相手＝そこに立っていれば消滅側が「対戦相手」に当たる。
          opState.power0_banish_to_trash_opp_only === true ||
          // 単体選択×パワー0限定版（WX25-P3-104-E1）。通常のバトル／効果バニッシュ経路には配線しない。
          isSelectedPowerZeroBanishRedirect(opState, topNum) ||
          opState.field.signi.some((s, zi) => {
            const n = s?.at(-1);
            // パワー0以下による消滅はバトル経路ではない＝bySource 付き（このシグニとの/による）は適用しない。
            // 被バニッシュ＝topNum（currentOwner の dieZoneP0）。target.filter で絞る（タスク12(xliv)(a)）。
            const base = parseInt(battleCardMap.get(topNum)?.Level ?? '', 10);
            const p0Attrs = {
              zoneIdx: dieZoneP0 >= 0 ? dieZoneP0 : undefined,
              level: isNaN(base) ? undefined
                : base + (currentOwner.temp_level_mods ?? []).filter(m => m.cardNum === topNum).reduce((sum, m) => sum + m.delta, 0),
              frozen: (currentOwner.field.signi_frozen?.[dieZoneP0] ?? false),
              hasCharm: (currentOwner.field.signi_charms?.[dieZoneP0] ?? null) !== null,
              infected: (currentOwner.field.signi_virus?.[dieZoneP0] ?? 0) > 0,
            };
            return n && (effectsMap.get(n) ?? []).some(e =>
              e.effectType === 'CONTINUOUS' &&
              banishRedirectAppliesFrom(e.action, n, null, p0Attrs) &&
              banishRedirectFrontMatches(e.action, zi, p0Attrs) &&
              checkActiveCondition(e.activeCondition, opState, currentOwner, opIsOwnerTurnP0, battleCardMap, n),
            );
          });
        const redirectBanishToHandP0 = opState.banish_redirect_to_hand === true;
        // BANISH_REDIRECT redirectTo:'exile'（SPDi47-05）: エナの代わりにゲームから除外（どのゾーンにも置かない）
        const redirectBanishToExileP0 = !redirectBanishP0 && !redirectBanishToHandP0 && opState.banish_redirect_to_exile === true;
        // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM (WX25-CP1-003): エナの代わりにデッキの一番下へ
        const energyToBottomP0 = !redirectBanishP0 && !redirectBanishToHandP0 && !redirectBanishToExileP0 && removed.opp_signi_energy_to_deck_bottom === true;
        // 🔴**§5.6 `C-9` `R-45`＝レゾナの行き先はルール処理**（ここはパワー0以下のルール処理経路＝3つ目の写経）。
        //   規則は**他のどの置換よりも優先する**ので ladder の先頭に置く。
        const resonaDestP0 = resonaLeaveDestination(topNum, battleCardMap, effectsMap);
        const withBanished: PlayerState = resonaDestP0 === 'lrig_deck'
          ? { ...removed, lrig_deck: [...removed.lrig_deck, topNum] }
          : resonaDestP0 === 'exile'
          ? { ...removed, excluded: [...(removed.excluded ?? []), topNum] }   // `R-45b`＝クラフトは除外
          : resonaDestP0 === 'lrig_trash'
          ? { ...removed, lrig_trash: [...removed.lrig_trash, topNum] }
          : redirectBanishP0
          ? { ...removed, trash: [...removed.trash, topNum] }
          : redirectBanishToHandP0
            ? { ...removed, hand: [...removed.hand, topNum] }
            : redirectBanishToExileP0
              ? removed
              : energyToBottomP0
                ? { ...removed, deck: [...removed.deck, topNum] }
                // 🆕§5.3 `O-321` 第275＝エナへ行った分だけ台帳へ（`cause:'rule'`＝ルール処理のバニッシュ）。
                //   ⚠**置き換え先が別ゾーンの分岐（トラッシュ／手札／除外／デッキ下）では記録しない**。
                : recordEnergyPlacements({ ...removed, energy: [...removed.energy, topNum] }, [topNum], 'rule');
        if (ownerIsHost) hostState = withBanished; else guestState = withBanished;
        const banishedName = battleCardMap.get(topNum)?.CardName ?? topNum;
        appendBattleLogs([`${banishedName}はパワー0以下のためバニッシュ${resonaDestP0 === 'lrig_deck' ? '（レゾナ→ルリグデッキへ）' : resonaDestP0 === 'exile' ? '（クラフト→ゲームから除外）' : resonaDestP0 === 'lrig_trash' ? '（ルリグトラッシュへ）' : redirectBanishP0 ? '（トラッシュへ）' : redirectBanishToHandP0 ? '（手札へ）' : redirectBanishToExileP0 ? '（ゲームから除外）' : energyToBottomP0 ? '（エナ代替→デッキ下）' : ''}`]);

        // usageLimit 消費は収集ごとに actions_done へ畳み込む（同一パスで複数シグニが0化しても《ターン1回》は1度だけ）。
        const usePZ = (r: { usedHostIds: string[]; usedGuestIds: string[] }) => {
          if (r.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...r.usedHostIds] };
          if (r.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...r.usedGuestIds] };
        };
        const bt = collectBanishTriggers(topNum, ownerId, hostState, guestState, currentOwner);
        allTriggers.push(...bt.entries); usePZ(bt);
        // パワー0以下になったとき（ON_SIGNI_POWER_ZERO_OR_LESS）を監視するシグニのトリガーも収集。
        // 同パスで複数シグニが同時に0化した場合の once_per_turn 重複発火を避けるため effectId で dedup。
        const pz = collectPowerZeroTriggers(topNum, ownerId, hostState, guestState);
        allTriggers.push(...pz.entries.filter(e => !allTriggers.some(a => a.effectId === e.effectId))); usePZ(pz);
      }
    }

    const changed = candidates.length > 0;
    if (!changed) return;
    setLoading(true);
    try {
      let newStack = bs.effect_stack as EffectStack | null;
      if (allTriggers.length > 0) {
        newStack = initStack(bs.active_user_id!, allTriggers);
      }
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: 'host_state', myState: hostState,
        opp: { key: 'guest_state', state: guestState },
        // 変化が無ければ effect_stack キー自体を書かない（旧 spread と同一パッチ）
        effectStack: newStack !== bs.effect_stack ? newStack : undefined,
      }));
    } finally {
      setLoading(false);
    }
  };

  // CONTINUOUS BANISH / FREEZE / DOWN の自動適用（mandatory 効果のみ）
  const checkAndApplyContMutations = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    const hostIsActive = bs.active_user_id === bs.host_id;
    const mutations = calcContinuousSigniMutations(
      bs.host_state, bs.guest_state, hostIsActive, effectsMap, battleCardMap,
    );
    if (mutations.length === 0) return;
    const mutKey = mutations.map(m => `${m.effectId}:${m.targetNums.sort().join(',')}`).sort().join('|');
    if (mutKey === lastContMutationKeyRef.current) return;
    lastContMutationKeyRef.current = mutKey;

    let hostState  = bs.host_state;
    let guestState = bs.guest_state;
    const allTriggers: import('../../../types').StackEntry[] = [];

    for (const mut of mutations) {
      for (const num of mut.targetNums) {
        const targetState = mut.targetIsHost ? hostState : guestState;
        const cardName = battleCardMap.get(num)?.CardName ?? num;

        if (mut.type === 'BANISH') {
          const removed = removeFromField(num, targetState);
          // OPP_SIGNI_ENERGY_TO_DECK_BOTTOM (WX25-CP1-003): エナの代わりにデッキの一番下へ
          // 🆕§5.3 `O-321` 第275＝【常】効果によるバニッシュ＝`cause:'effect'`。
          const withBanished: import('../../../types').PlayerState = removed.opp_signi_energy_to_deck_bottom === true
            ? { ...removed, deck: [...removed.deck, num] }
            : recordEnergyPlacements({ ...removed, energy: [...removed.energy, num] }, [num], 'effect');
          if (mut.targetIsHost) hostState = withBanished; else guestState = withBanished;
          appendBattleLogs([`${cardName}をバニッシュ（常時効果）`]);
          const ownerId = mut.targetIsHost ? bs.host_id : bs.guest_id;
          // cause＝CONT効果の発生源（「あなたの効果によって…バニッシュされたとき」banishedByOwnEffect/banishedSourceStory の CONT 経路。G072群C の保守的非発火を解消）
          const bt = collectBanishTriggers(num, ownerId, hostState, guestState, targetState,
            { ownerId: mut.sourceIsHost ? bs.host_id : bs.guest_id, sourceCardNum: mut.sourceCardNum });
          allTriggers.push(...bt.entries);
          // usageLimit 消費を actions_done へ畳み込む（同一パスで複数体バニッシュしても《ターン1回》は1度だけ）
          if (bt.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...bt.usedHostIds] };
          if (bt.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...bt.usedGuestIds] };
        } else if (mut.type === 'FREEZE') {
          const zoneIdx = targetState.field.signi.findIndex(s => s?.at(-1) === num);
          if (zoneIdx < 0) continue;
          const newFrozen = [...(targetState.field.signi_frozen ?? [false, false, false])] as boolean[];
          const newDown   = [...(targetState.field.signi_down   ?? [false, false, false])] as boolean[];
          newFrozen[zoneIdx] = true;
          newDown[zoneIdx]   = true;
          const updated: import('../../../types').PlayerState = { ...targetState, field: { ...targetState.field, signi_frozen: newFrozen, signi_down: newDown } };
          if (mut.targetIsHost) hostState = updated; else guestState = updated;
          appendBattleLogs([`${cardName}をフリーズ（常時効果）`]);
        } else if (mut.type === 'DOWN') {
          const zoneIdx = targetState.field.signi.findIndex(s => s?.at(-1) === num);
          if (zoneIdx < 0) continue;
          const newDown = [...(targetState.field.signi_down ?? [false, false, false])] as boolean[];
          newDown[zoneIdx] = true;
          const updated: import('../../../types').PlayerState = { ...targetState, field: { ...targetState.field, signi_down: newDown } };
          if (mut.targetIsHost) hostState = updated; else guestState = updated;
          appendBattleLogs([`${cardName}をダウン（常時効果）`]);
        }
      }
    }

    // ON_SIGNI_DOWN（常時効果によるダウン/フリーズ＝byEffect:true・タスク16[C]機構①）
    {
      const downHost  = detectNewlyDowned(bs.host_state, hostState);
      const downGuest = detectNewlyDowned(bs.guest_state, guestState);
      if (downHost.length > 0 || downGuest.length > 0) {
        // 🔴台帳は**収集の前に**積む（`fireCondition` が今回のダウンを含めて数えるため）。
        hostState = recordSigniDownedThisTurn(hostState, downHost);
        guestState = recordSigniDownedThisTurn(guestState, downGuest);
        const dn = pureCollectSigniDownUpTriggers(mkTrigCtx(), 'ON_SIGNI_DOWN',
          [{ ownerId: bs.host_id, nums: downHost, byEffect: true }, { ownerId: bs.guest_id, nums: downGuest, byEffect: true }], hostState, guestState);
        allTriggers.push(...dn.entries);
        if (dn.usedHostIds.length > 0) hostState = { ...hostState, actions_done: [...(hostState.actions_done ?? []), ...dn.usedHostIds] };
        if (dn.usedGuestIds.length > 0) guestState = { ...guestState, actions_done: [...(guestState.actions_done ?? []), ...dn.usedGuestIds] };
      }
    }

    setLoading(true);
    try {
      let newStack = bs.effect_stack as import('../../../types').EffectStack | null;
      if (allTriggers.length > 0) {
        newStack = initStack(bs.active_user_id!, allTriggers);
      }
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: 'host_state', myState: hostState,
        opp: { key: 'guest_state', state: guestState },
        // 変化が無ければ effect_stack キー自体を書かない（旧 spread と同一パッチ）
        effectStack: newStack !== bs.effect_stack ? newStack : undefined,
      }));
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🆕**保留になっていたリフレッシュのルール処理**（2026-09-18・公式ルール「トラッシュにカードが無い場合はリフレッシュは
   *   行われない。その場合、トラッシュにカードが置かれたら（効果の解決中であればその効果の解決後に）リフレッシュが行われる」）。
   * 効果スタック・対話・スペル・クラッシュ解決がすべて空のときに、デッキ0枚（トラッシュあり）のプレイヤーをリフレッシュし、
   * `ON_REFRESH` を積む。2回目のリフレッシュでのターン終了は `checkRefreshForcedTurnEnd` が見る。
   */
  const checkDeferredRefreshRule = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase === 'UP') return;
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    if (bs.host_state.field?.check || bs.guest_state.field?.check) return;
    if ((bs.host_state.pending_crashed_cards?.length ?? 0) > 0) return;
    if ((bs.guest_state.pending_crashed_cards?.length ?? 0) > 0) return;
    const needs = (st: PlayerState) => st.deck.length === 0 && st.trash.length > 0;
    if (!needs(bs.host_state) && !needs(bs.guest_state)) return;
    const r = refreshPlayersIfDeckEmpty(bs.host_state, bs.guest_state, battleCardMap);
    if (!r.aRefreshed && !r.bRefreshed) return;
    const fingerprint = `${bs.turn_count}:${bs.host_state.trash.length}/${bs.host_state.refresh_count_this_turn ?? 0}:${bs.guest_state.trash.length}/${bs.guest_state.refresh_count_this_turn ?? 0}`;
    if (lastDeferredRefreshKeyRef.current === fingerprint) return;
    lastDeferredRefreshKeyRef.current = fingerprint;
    setLoading(true);
    try {
      const who = (id: string) => isCpuBattle && id === CPU_PLAYER_ID ? '[CPU] ' : id === user.id ? '' : '相手';
      appendBattleLogs([
        ...(r.aRefreshed ? [`${who(bs.host_id)}リフレッシュ（デッキを再構築）`] : []),
        ...(r.bRefreshed ? [`${who(bs.guest_id as string)}リフレッシュ（デッキを再構築）`] : []),
      ]);
      let h = r.a, g = r.b;
      const refreshHost = r.aRefreshed ? 1 : 0, refreshGuest = r.bRefreshed ? 1 : 0;
      const rfH = collectRefreshTriggers(bs.host_id, h, g, refreshHost, refreshGuest);
      const rfG = collectRefreshTriggers(bs.guest_id as string, g, h, refreshGuest, refreshHost);
      if (rfH.usedOncePerTurnIds.length > 0) h = { ...h, actions_done: [...(h.actions_done ?? []), ...rfH.usedOncePerTurnIds] };
      if (rfG.usedOncePerTurnIds.length > 0) g = { ...g, actions_done: [...(g.actions_done ?? []), ...rfG.usedOncePerTurnIds] };
      if (rfH.firedOnceDelayed) h = consumeOnceDelayedTriggers(h, 'ON_REFRESH');
      if (rfG.firedOnceDelayed) g = consumeOnceDelayedTriggers(g, 'ON_REFRESH');
      const entries = [...rfH.entries, ...rfG.entries];
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: 'host_state', myState: h,
        opp: { key: 'guest_state', state: g },
        effectStack: entries.length > 0 ? initStack(bs.active_user_id ?? bs.host_id, entries) : undefined,
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🆕**§5.6 `C-9` `R-28`（2026-09-17）＝ターンプレイヤーのこのターン2回目のリフレッシュでターンを終了する。**
   *
   * 🔴**規則は `refreshTurnEnd.ts` の述語1本**（効果スタック解決経路と同じ判定）。ここは**残り全経路の受け皿**＝
   *   `applyRefreshOnDone` の8経路（選択の再開・スペル解決・スペルカットイン解決）とドローフェイズの
   *   リフレッシュは `result.forceEndTurn` を読まないので、規則がそこだけ効かなかった。
   * ⚠**盤面処理はスタック解決経路と同じ `applyForcedTurnEnd`**（`O-117` の規約＝判定も盤面処理も割らない）。
   * ⚠**同じターンで2回撃たない**＝`turn_count:ターンプレイヤー` を指紋にする（DB 伝播待ちの二重処理防止）。
   */
  const checkRefreshForcedTurnEnd = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase === 'UP') return;
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    // ⚠クラッシュ解決（チェックゾーン）の途中では終わらせない＝ライフバーストの応答が消える。
    if (bs.host_state.field?.check || bs.guest_state.field?.check) return;
    if ((bs.host_state.pending_crashed_cards?.length ?? 0) > 0) return;
    if ((bs.guest_state.pending_crashed_cards?.length ?? 0) > 0) return;
    const activeIsHost = bs.active_user_id === bs.host_id;
    const activeState = activeIsHost ? bs.host_state : bs.guest_state;
    if (!refreshForcesTurnEnd(activeState)) return;
    const fingerprint = `${bs.turn_count}:${bs.active_user_id}`;
    if (lastRefreshTurnEndKeyRef.current === fingerprint) return;
    lastRefreshTurnEndKeyRef.current = fingerprint;
    setLoading(true);
    try {
      const forced = applyForcedTurnEnd(activeState, activeIsHost ? bs.guest_state : bs.host_state);
      appendBattleLogs([
        `このターン${activeState.refresh_count_this_turn}回目のリフレッシュ（ターンプレイヤー）→ ターンを終了`,
        ...(forced.log ? [forced.log] : []),
      ]);
      await persist.commit(reduceBattle(bs, {
        type: 'RESOLVE_EFFECT_STEP',
        hostState: activeIsHost ? forced.activeAfter : forced.nextAfter,
        guestState: activeIsHost ? forced.nextAfter : forced.activeAfter,
        pending: null, effectStack: null,
        // 🆕`R-27`＝追加ターンの予約は強制終了でも効く（交代判定は `applyForcedTurnEnd` の1本）。
        beginNextTurn: {
          activeUserId: (forced.keepTurn ? bs.active_user_id : (activeIsHost ? bs.guest_id : bs.host_id)) as string,
        },
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /**
   * 🆕**§5.3 `O-532`（2026-09-17）＝レベル超過／リミット超過のルール処理**（RULES.md `R-44`／`R-48`）。
   *
   * 規則の判定は `limitExcess.ts` の純関数1本（`planLimitExcess`）。ここは**盤面が動くたび回す受け皿**で、
   * ①**A＝センタールリグのレベルを超えるシグニ**は選択の余地が無いので自動でトラッシュ
   * ②**B/C＝リミット超過**は持ち主が1体ずつ選ぶ＝人間は `LimitExcessModal`、**CPU は選ばせられないので**
   *   `pickLimitExcessZone`（失うカードが最小＝実効レベルが一番高いゾーン）で自動。
   * ⚠**行き先は `applyLimitExcessTrash` 1本**＝レゾナはルリグデッキへ（`R-45`）、
   *   【チャーム】【アクセ】【ソウル】の後始末は `clearZoneOnSigniLeave`（`R-41`）。
   * ⚠**ルール処理なので「バニッシュされたとき」は誘発しない**（リムーブと同じ＝`byCostOrEffect`/`byEffectCause` は false）。
   */
  const applyLimitExcessRule = async (
    owner: PlayerState, ownerKey: PlayerStateKey, ownerId: string, zones: number[], reason: string,
  ) => {
    const fingerprint = `${ownerKey}:${zones.join(',')}:${owner.field.signi.map(z => z?.at(-1) ?? '-').join('|')}`;
    if (lastLimitExcessKeyRef.current === fingerprint) return;
    lastLimitExcessKeyRef.current = fingerprint;
    setLoading(true);
    try {
      const { state: after, trashedTops } = applyLimitExcessTrash(owner, zones, battleCardMap, effectsMap);
      appendBattleLogs(trashedTops.map(n =>
        `${reason}：${battleCardMap.get(n)?.CardName ?? n}をトラッシュに置く（ルール処理）`));
      const ownerIsHost = ownerKey === 'host_state';
      let hostAfter = ownerIsHost ? after : bs.host_state;
      let guestAfter = ownerIsHost ? bs.guest_state : after;
      const entries: StackEntry[] = [];
      for (const cn of trashedTops) {
        // ⚠引数は host/guest 順（`handleRemove` と同じ規約）。ルール処理なのでコスト/効果起因では発火させない。
        const tt = collectTrashTriggers(cn, ownerId, hostAfter, guestAfter, false, false, false);
        entries.push(...tt.entries);
        if (tt.usedHostIds.length > 0) hostAfter = { ...hostAfter, actions_done: [...(hostAfter.actions_done ?? []), ...tt.usedHostIds] };
        if (tt.usedGuestIds.length > 0) guestAfter = { ...guestAfter, actions_done: [...(guestAfter.actions_done ?? []), ...tt.usedGuestIds] };
      }
      const existing = bs.effect_stack ?? null;
      const stack = entries.length > 0
        ? (existing ? pushToStack(existing, entries) : initStack(bs.active_user_id ?? ownerId, entries))
        : undefined;
      await persist.commit(reduceBattle(bs, {
        type: 'WRITE_STATE', myKey: 'host_state', myState: hostAfter,
        opp: { key: 'guest_state', state: guestAfter },
        effectStack: stack,
      }));
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /** ルール処理 funnel の本体（`checkAndBanishPowerZero` と同じ形）。 */
  const checkLimitExcessRule = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect || bs.pending_spell) return;
    if (bs.host_state.field?.check || bs.guest_state.field?.check) return;
    // ⚠**カードマスタ未ロードで判定しない**＝全シグニのレベルが0に見えて盤面を誤って減らす（power0 と同じ規約）。
    if (battleCards.length === 0) return;
    // ① **レベルが変動して超過したシグニ**は選択の余地なくトラッシュ（`R-48`・2026-09-17 ユーザー裁定）。
    //   ⚠印字レベルのまま超過している盤面は対象外＝そこは**配置制限**が止める（`planLimitExcess` の 🔑）。
    const myKey: PlayerStateKey = isHost ? 'host_state' : 'guest_state';
    const myPlan = planLimitExcess({ owner: my, opponent: op, cardMap: battleCardMap, effectsMap, isOwnerTurn: isMyTurn });
    if (myPlan.levelOverZones.length > 0) {
      await applyLimitExcessRule(my, myKey, user.id, myPlan.levelOverZones, 'レベル超過');
      return;
    }
    // ② **リミット超過**は持ち主が1体ずつ選ぶ＝自分の盤面は `LimitExcessModal` が受ける（ここでは何もしない）。
    // ③ CPU の盤面＝問う相手が居ないので①②とも自動で解く（ホスト側のクライアントが回す）。
    if (isCpuBattle && isHost) {
      const cpuSt = bs.guest_state;
      const cpuPlan = planLimitExcess({
        owner: cpuSt, opponent: bs.host_state, cardMap: battleCardMap, effectsMap,
        isOwnerTurn: bs.active_user_id === CPU_PLAYER_ID,
      });
      if (cpuPlan.levelOverZones.length > 0) {
        await applyLimitExcessRule(cpuSt, 'guest_state', CPU_PLAYER_ID, cpuPlan.levelOverZones, '[CPU] レベル超過');
        return;
      }
      const pick = pickLimitExcessZone(cpuPlan);
      if (pick !== null) {
        await applyLimitExcessRule(cpuSt, 'guest_state', CPU_PLAYER_ID, [pick], '[CPU] リミット超過');
      }
    }
  };

  return {
    resolvePendingLrigAttack, triggerPendingCrash, checkAndBanishPowerZero, checkAndApplyContMutations,
    checkDeferredRefreshRule, checkRefreshForcedTurnEnd, applyLimitExcessRule, checkLimitExcessRule,
  };
}
