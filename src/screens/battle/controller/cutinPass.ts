import type {PlayerState, PendingEffect, StackEntry} from '../../../types';
import {calcFieldPowers, collectAllColorSigniForField, collectFieldSigniExtraColors, collectDeckTrashLevel1Nums, applyDeclaredZoneClassOverride, applyContinuousBaseLevelOverride} from '../../../engine/effectEngine';
import {executeEffect, applyRefreshOnDone, evalUseCondition, type ExecCtx} from '../../../engine/effectExecutor';
import {initStack, pushToStack} from '../../../engine/effectStack';
import {generateUUID} from '../battleUtils';
import {spellUseTriggerMatches} from '../../../engine/triggerCollect';
import {parseGrowCost} from '../costs';
import {findGrowFreeAction} from '../growLogic';
import {makeFillDeployCaps} from './execCtxDeps';
import type {PerformCtx} from './performCtx';
import {fieldPlacementOnPlayOpts} from './stackResolve';
import {reduceBattle} from './battleController';
import {finalizeUsedCardPlacement, type UsedCardPlacement} from '../spellPlacement';
import {consumeSpellNegationThisTurn} from '../turnScopedState';
import {grantedStoreWatchers} from '../../../engine/grantedStore';


/** 画面だけが持つもの（カットインの UI・グロウのモーダル・ピースの解決）。 */
export interface CutinPassUi {
  closeCutin: () => void;
  openFreeGrow: (filter: 'same' | 'plus1') => void;
  /** カットイン待ちのピースを解決する（画面の `resolvePendingPiece`）。 */
  resolvePendingPiece: () => Promise<void>;
  /** 画面の操作ロック。 */
  loading: boolean;
}

// 🆕§5.7 `S-5c` 第3段（2026-09-18）＝相手のスペル／ピースへのカットインを見送る（`handleCutinPass`・194行）を `BattleScreen` から**逐語で移設**。
export async function handleCutinPass(c: PerformCtx, ui: CutinPassUi): Promise<void> {
  // ── 注入された材料を**画面と同じ名前**で取り出す（下の本体は画面から逐語で移設＝名前を変えない）──
  const { bs, cardMap: battleCardMap, effectsMap } = c;
  const user = { id: c.userId };
  const persist = { commit: c.io.commit };
  const appendBattleLogs = c.io.appendLogs;
  const setLoading = c.io.setLoading;
  const collectBoardDiffTriggers = c.collectBoardDiff;
  const fillDeployCaps = makeFillDeployCaps({ cardMap: battleCardMap, effectsMap });
  const { closeCutin, openFreeGrow, resolvePendingPiece, loading } = ui;

  if (!bs.pending_spell || loading) return;
  setLoading(true);
  closeCutin();
  try {
    // §6.4 O-10（続き518）＝ピース応答窓のパス＝**使われたピースをそのまま解決する**
    // （スペルの解決経路 `executeEffect`＋`FINISH_SPELL` とは別物なので先に分岐する）。
    if (bs.pending_spell.kind === 'piece') { await resolvePendingPiece(); return; }
    const { caster_id, card_num, from_lrig_deck } = bs.pending_spell;
    const casterIsHost = caster_id === bs.host_id;
    const casterState = casterIsHost ? bs.host_state : bs.guest_state;
    const nonCasterState = casterIsHost ? bs.guest_state : bs.host_state;
    // 使用後の置き場所: フェゾーネマジック等（ルリグデッキ由来）はゲームから除外＝lrig_trashへ近似、通常スペルはトラッシュへ
    const placeUsedSpell = (s: PlayerState): PlayerState => from_lrig_deck
      ? { ...s, lrig_trash: [...s.lrig_trash, card_num] }
      : { ...s, trash: [...s.trash, card_num] };
    const spellPlacement: UsedCardPlacement = from_lrig_deck ? 'lrig_trash' : 'trash';
    // NEGATE_SPELL: casterStateにspell_negated_this_turnがあればコスト合計5以下のスペルを打ち消す
    // ただし next_spell_uncounterable（WX04-008）があれば打ち消されない
    if (casterState.spell_negated_this_turn && !casterState.next_spell_uncounterable) {
      const spellCard = battleCardMap.get(card_num);
      const spellTotalCostNS = parseGrowCost(spellCard?.Cost ?? '').reduce((s, c) => s + c.count, 0);
      if (spellTotalCostNS <= 5) {
        const spellNameNS = spellCard?.CardName ?? card_num;
        const negatedCasterState = consumeSpellNegationThisTurn(placeUsedSpell(casterState));
        appendBattleLogs([`[スペル打ち消し] ${spellNameNS}（コスト${spellTotalCostNS}）が打ち消された`]);
        await persist.commit(reduceBattle(bs, {
          type: 'FINISH_SPELL',
          casterKey: casterIsHost ? 'host_state' : 'guest_state',
          casterState: negatedCasterState,
          other: { key: casterIsHost ? 'guest_state' : 'host_state', state: nonCasterState },
        }));
        return;
      }
    }

    // 保護スペル（next_spell_uncounterable）はこの解決で消費＝フラグをクリア
    const resolved: PlayerState = { ...casterState, next_spell_uncounterable: undefined };

    // スペル効果を発火（casterがowner）
    const effects = effectsMap.get(card_num) ?? [];
    const spellEff = effects.find(e => e.effectType === 'ACTIVATED');
    if (!spellEff) {
      await persist.commit(reduceBattle(bs, {
        type: 'FINISH_SPELL',
        casterKey: casterIsHost ? 'host_state' : 'guest_state',
        casterState: finalizeUsedCardPlacement(resolved, card_num, spellPlacement),
      }));
      return;
    }

    const spellWho = caster_id === user.id ? '自分' : '相手';
    const spellName = battleCardMap.get(card_num)?.CardName ?? card_num;
    appendBattleLogs([`[${spellWho}] ${spellName}を使用`]);
    const spellPowers = calcFieldPowers(resolved, nonCasterState, bs.active_user_id === caster_id, effectsMap, battleCardMap, bs.turn_phase);
    const spellIsOwnerTurn = bs.active_user_id === caster_id;
    const spellAllColorSigniNums = new Set([...collectAllColorSigniForField(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn), ...collectAllColorSigniForField(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn)]);
    const spellExtraColors = new Map([...collectFieldSigniExtraColors(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn), ...collectFieldSigniExtraColors(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn)]);
    const spellDeckTrashLevel1Nums = collectDeckTrashLevel1Nums(resolved, nonCasterState, effectsMap, battleCardMap);
    const spellDeclaredCardMap = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(battleCardMap, resolved, nonCasterState), resolved, nonCasterState, effectsMap, spellIsOwnerTurn);
    const ctx: ExecCtx = { ownerState: resolved, otherState: nonCasterState, cardMap: spellDeclaredCardMap, logs: [], currentPhase: bs.turn_phase ?? undefined, effectivePowers: spellPowers, sourceCardNum: card_num, sourcePlacementPending: true, allColorSigniNums: spellAllColorSigniNums, fieldSigniExtraColors: spellExtraColors, deckTrashLevel1Nums: spellDeckTrashLevel1Nums, paidEnergyColorSets: bs.pending_spell.paid_energy_colors, preUseVirusRemoved: bs.pending_spell.pre_use_virus_removed };
    fillDeployCaps(ctx); // 配置数制限（CONT版）をctxへ
    ctx.isOwnerTurn = spellIsOwnerTurn;
    let result = executeEffect(spellEff, ctx);
    result = applyRefreshOnDone(result, battleCardMap); // デッキ0枚→リフレッシュ（効果1つの解決後）
    if (result.logs.length > 0) appendBattleLogs(result.logs);
    // ON_SPELL_USE: スペル使用時トリガー（自分ターンのみ）。
    // ルリグ（WX25-P2-034 APEX2「あなたがスペルを使用したとき」）に加え、場のシグニ（WX01-033 幻獣神オサキ
    // 「あなたが緑のスペルを使用したとき」）も走査する。triggerFilter.color があれば使用スペルの色で絞る。
    let casterAfter = result.ownerState;
    if (result.done) casterAfter = finalizeUsedCardPlacement(casterAfter, card_num, spellPlacement);
    const spellUseEntries: StackEntry[] = [];
    if (spellIsOwnerTurn) {
      const usedSpell = battleCardMap.get(card_num);
      // 収集元: センタールリグ + 場のシグニ各ゾーンのトップ
      const spellUseSources = [
        casterAfter.field.lrig.at(-1),
        ...casterAfter.field.signi.map(stack => stack?.at(-1)),
      ].filter((n): n is string => !!n);
      const usedIdsSU: string[] = [];
      const spellUseLrigTop = casterAfter.field.lrig.at(-1);
      for (const srcNum of spellUseSources) {
        // センタールリグには付与ストア（effectsMap 非搭載）を合流させる（WXDi-P13-008-E3＝エクシード4で
        // 「【自】あなたが《ディソナアイコン》のスペルを使用したとき…」を得る）。scope は self（主語＝プレイヤー）。
        const srcEffsSU = srcNum === spellUseLrigTop
          ? [...(effectsMap.get(srcNum) ?? []), ...grantedStoreWatchers(casterAfter, 'ON_SPELL_USE', ['self']).map(w => w.effect)]
          : (effectsMap.get(srcNum) ?? []);
        for (const eff of srcEffsSU) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SPELL_USE')) continue;
          if (!spellUseTriggerMatches(eff, usedSpell)) continue;
          if (eff.usageLimit === 'once_per_turn' &&
              ((casterAfter.actions_done?.includes(eff.effectId)) || usedIdsSU.includes(eff.effectId))) continue;
          if (eff.condition && !evalUseCondition(eff.condition, casterAfter, result.otherState, battleCardMap, srcNum, bs.turn_phase, spellPowers)) continue;
          if (eff.usageLimit === 'once_per_turn') usedIdsSU.push(eff.effectId);
          spellUseEntries.push({
            id: generateUUID(),
            playerId: caster_id,
            cardNum: srcNum,
            effectId: eff.effectId,
            triggeringCardNum: card_num,
            label: `${battleCardMap.get(srcNum)?.CardName ?? srcNum}【自】スペル使用時`,
            effect: eff,
          });
        }
      }
      if (usedIdsSU.length > 0) casterAfter = { ...casterAfter, actions_done: [...(casterAfter.actions_done ?? []), ...usedIdsSU] };
    }
    // ON_SPELL_USE（相手側 watcher）＝「対戦相手がスペルを使用したとき」（triggerScope:any_opp）／
    // 「いずれかのプレイヤーがスペルを使用したとき」（any）。従来は使用者(caster)の場しか走査しておらず、
    // **使用者の対戦相手の場にある watcher が一度も発火しなかった**（続き75で parser が語彙を出すのに合わせて配線）。
    {
      const oppOfCasterId = caster_id === bs.host_id ? bs.guest_id : bs.host_id;
      const usedSpellOpp = battleCardMap.get(card_num);
      const oppWatchSources = [
        result.otherState.field.lrig.at(-1),
        ...result.otherState.field.signi.map(stack => stack?.at(-1)),
      ].filter((n): n is string => !!n);
      const usedIdsSUOpp: string[] = [];
      const oppWatchLrigTop = result.otherState.field.lrig.at(-1);
      for (const srcNum of oppWatchSources) {
        const srcEffsSUOpp = srcNum === oppWatchLrigTop
          ? [...(effectsMap.get(srcNum) ?? []),
             ...grantedStoreWatchers(result.otherState, 'ON_SPELL_USE', ['any_opp', 'any']).map(w => w.effect)]
          : (effectsMap.get(srcNum) ?? []);
        for (const eff of srcEffsSUOpp) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SPELL_USE')) continue;
          const scopeSU = eff.triggerScope ?? 'self';
          if (scopeSU !== 'any_opp' && scopeSU !== 'any') continue; // self は使用者側でのみ発火（上のブロック）
          if (!spellUseTriggerMatches(eff, usedSpellOpp)) continue;
          if (eff.usageLimit === 'once_per_turn' &&
              ((result.otherState.actions_done?.includes(eff.effectId)) || usedIdsSUOpp.includes(eff.effectId))) continue;
          if (eff.condition && !evalUseCondition(eff.condition, result.otherState, casterAfter, battleCardMap, srcNum, bs.turn_phase, spellPowers)) continue;
          if (eff.usageLimit === 'once_per_turn') usedIdsSUOpp.push(eff.effectId);
          spellUseEntries.push({
            id: generateUUID(),
            playerId: oppOfCasterId,
            cardNum: srcNum,
            effectId: eff.effectId,
            triggeringCardNum: card_num,
            label: `${battleCardMap.get(srcNum)?.CardName ?? srcNum}【自】スペル使用時（対戦相手の使用）`,
            effect: eff,
          });
        }
      }
      if (usedIdsSUOpp.length > 0) {
        result = { ...result, otherState: { ...result.otherState, actions_done: [...(result.otherState.actions_done ?? []), ...usedIdsSUOpp] } };
      }
    }
    let hostState  = casterIsHost ? casterAfter : result.otherState;
    let guestState = casterIsHost ? result.otherState : casterAfter;
    // === 盤面差分トリガーの統合収集（§5.3 `O-135`・2026-08-29）===
    // 🔴**旧実装はここで ON_PLAY／ON_BLOOM／ON_DECK_SHUFFLED／ON_REFRESH の4族だけを手書きで収集していた。**
    //   スペル解決経路は `resolveStackNext` の中央 diff を1度も通らないので、**それ以外の全族**
    //   （ON_BANISH 166効果／ON_TRASH 105／ON_LEAVE_FIELD 71／ON_ZONE_MOVED 21／ミル 17／ドロー 13／
    //   ON_ENERGY_CHARGE 12／ON_HAND_ADDED 9／ダウン・凍結・エナ・ライフ・パワー減少…）は
    //   **スペルがその変化を起こしても watcher が1件も誘発しなかった**（golden も census も緑のまま）。
    //   実測＝スペル391カードのうち BANISH 130／TRASH 105／DRAW 72／BOUNCE 29 が該当する。
    // 🔑**中央 diff へ一本化できたのは、手書きの4族が中央 diff の同名ブロックと同一コードだったから**＝
    //   ON_PLAY 自身分は `collectPlacedSelfOnPlay`／`suppressOnPlay` の opt-in で同じく制御され、
    //   `placeSourceIsSigni` も `causeSourceCardNum`（＝`card_num`）から同じ式で決まる。
    //   ⇒ **二重 collection は起きない**（登録票が懸念していた点は、実装を読むと既に解けていた）。
    // ⚠**`result.done` で分岐しない**＝`!done`（対話待ち）でこの段が確定させた盤面変化も収集する。
    //   resume 経路が同じ理由で `midBd` を持っているのと同型で、こちらだけ落としていた
    //   （resume 側の before は**ここで commit した state**なので、拾い直す機会は二度と来ない）。
    {
      const bdSpell = collectBoardDiffTriggers(hostState, guestState, {
        causeOwnerId: caster_id,
        causeSourceCardNum: card_num,
        fieldTrashCostCards: result.fieldTrashCostCards,
        ...fieldPlacementOnPlayOpts(spellEff),
      });
      spellUseEntries.push(...bdSpell.entries);
      hostState = bdSpell.hostState;
      guestState = bdSpell.guestState;
    }
    const existingStackSU = bs.effect_stack ?? null;
    await persist.commit(reduceBattle(bs, {
      type: 'RESOLVE_EFFECT_STEP', hostState, guestState, clearPendingSpell: true,
      effectStack: spellUseEntries.length > 0
        ? (existingStackSU ? pushToStack(existingStackSU, spellUseEntries) : initStack(bs.active_user_id ?? user.id, spellUseEntries))
        : undefined,
      pending: result.done ? null : ({ sourcePlayerId: caster_id, sourceCardNum: card_num, effectId: spellEff.effectId, interaction: result.pending, spellPlacement, ...(result.storedTargetCards ? { storedTargetCards: result.storedTargetCards } : {}) } satisfies PendingEffect),
    }));
    // GROW_FREE（ゲット・グロウ等）: スペル解決後、グロウ先選択モーダルを開いて実際にグロウまで行う
    if (result.done && spellIsOwnerTurn) {
      const growFree = findGrowFreeAction(spellEff.action);
      if (growFree) {
        openFreeGrow(growFree.levelFilter === 'same' ? 'same' : 'plus1');
      }
    }
  } finally {
    setLoading(false);
  }
}
