import type { PlayerState, TargetScope, SigniZoneBlock, CardData } from '../types';
import { addSigniZoneBlock } from '../screens/battle/signiZoneBlock';
import { parseCardEffects } from '../data/effectParser';
import type {
  EffectAction, StubAction, TrashAction, AddToFieldAction, SequenceAction, PlaceUnderSourceSigniAction, TransferToHandAction, EnergyChargeAction, Owner, } from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import { textHasKeyword } from '../utils/keywords';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState,
  removeFromField, fieldCandidates, selectOrInteract, splitColors, banishDestination, banishRedirectOpts,
  getCardNum,
  createTokenInstanceId,
  resolveTokenBase,
  isOwnTrashMoveLocked,
  matchesFilter,
  canPayOptionalCost,
  hasNoAbility,
  designatedZones,
  buildGatedKeywordGrant,
  sourceAbilityText,
  resolveHandCardPick,
} from './execUtils';
import { allAcceCards } from '../utils/acce';
import { consumeDeclaredGuardRestrictLevel } from '../screens/battle/turnScopedState';
import {
  markTurnEndFacedownTrashIfOccupied,
  moveFieldSigniFacedown,
  resolveOpponentAttackFacedownReturns,
  flipFacedownSigniFaceUp,
  scheduleTurnEndFacedownReturns,
} from './facedownSigni';

/**
 * `TRAP_TO_HAND` の適用（§5.3 `O-87` で選択枝と自動枝を1点に集約）。
 * 選ばれたカードを**【トラップ】ならトラップ枠から／シグニなら場から**抜いて手札へ移す。
 *
 * 🔑**戻り値の `lastProcessedCards` は【トラップ】だけ**＝後続が数えるのは
 *   「この方法で手札に加えた**【トラップ】**１つにつき」（`WX16-017-E1`）であって、
 *   同時に戻した＜トリック＞のシグニは数に入らない。**ここを全部にすると設置回数が増える過剰実行になる。**
 */
function applyTrapToHand(selected: string[], ctx: ExecCtx): ExecCtx & { lastProcessedCards: string[] } {
  const traps = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
  const takenTraps: string[] = [];
  const takenSigni: string[] = [];
  // 🆕§5.3 `O-59`（2026-09-02）＝**抜いたトラップが居たゾーン**を覚える。
  //   「それがあった**シグニゾーンに**手札からカード1枚を【トラップ】として設置する」（`WX16-028-E2`）は
  //   この記憶が無いと行き先が決まらず、旧実装は `[トラップ設置保留: previous]` の no-op に倒していた。
  const takenZones: number[] = [];
  for (const cn of selected) {
    const zi = traps.indexOf(cn);
    if (zi >= 0) { traps[zi] = null; takenTraps.push(cn); takenZones.push(zi); continue; }
    if (ctx.ownerState.field.signi.some(stack => stack?.at(-1) === cn)) takenSigni.push(cn);
  }
  let state: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_traps: traps },
    // ⚠**同じ解決の中でしか使わない**（`trap_removed_zones` は turn-end で失効する）。
    ...(takenZones.length > 0 ? { trap_removed_zones: takenZones } : {}) };
  for (const cn of takenSigni) state = removeFromField(cn, state);
  const moved = [...takenTraps, ...takenSigni];
  state = { ...state, hand: [...state.hand, ...moved] };
  const parts = [
    takenTraps.length ? `【トラップ】${takenTraps.length}枚` : '',
    takenSigni.length ? `シグニ${takenSigni.length}体` : '',
  ].filter(Boolean).join('と');
  return { ...addLog({ ...ctx, ownerState: state }, `${parts || '0枚'}を手札へ`), lastProcessedCards: takenTraps };
}

export function execStubPart2(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
): ExecResult | null {
  // 手札のシグニを〈条件〉のシグニの下に置く
  // 🆕**手札側の絞り込み・枚数（`handCardPick`）と置き先（`handToUnderSigni.hostFilter`）は payload**
  //   （§5.3 `O-60` 第51バッチ・2026-09-03）。
  // 🔴旧実装は**2つとも壊れていた**＝①絞り込みと枚数をカード全文 regex で読み直していた
  //   ②置き先が `PLACE_UNDER_SOURCE_SIGNI`＝**効果元シグニの下**に固定だったので、live の唯一のカード
  //   `WXDi-P15-067`（**スペル**）では効果元が場に無く `zoneIdx === -1` で**恒久 無言 no-op** だった
  //   （原文「あなたの＜解放派＞のシグニ１体の下に置いてもよい」が丸ごと死んでいた）。
  // 🔑置き先の選択を先に済ませ、選んだシグニを `hostCardNum` へ焼き込んでから手札を選ばせる（2段）。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'HAND_SIGNI_UNDER_SIGNI') {
    const pickHSU = resolveHandCardPick(stub.handCardPick, ctx);
    const specHSU = stub.handToUnderSigni;
    if (!pickHSU || !specHSU) return done(addLog(ctx, '[HAND_SIGNI_UNDER_SIGNI: 置く対象／置き先なし（未指定）]'));
    if (pickHSU.cands.length === 0) return done(addLog(ctx, '手札にシグニなし（シグニ下配置スキップ）'));
    const hostsHSU = ctx.ownerState.field.signi.flatMap(stack => {
      const top = stack?.at(-1);
      if (!top || top === ctx.sourceCardNum) return [];
      return (!specHSU.hostFilter || matchesFilter(ctx.cardMap.get(getCardNum(top)), specHSU.hostFilter)) ? [top] : [];
    });
    if (hostsHSU.length === 0) return done(addLog(ctx, '置き先のシグニなし（シグニ下配置スキップ）'));
    const optsHSU = hostsHSU.map((host, i) => ({
      id: `host${i}`,
      label: `${ctx.cardMap.get(getCardNum(host))?.CardName ?? host}の下に置く`,
      action: { type: 'STUB', id: 'INTERNAL_HSUS_PICK_HAND', value: host, handCardPick: stub.handCardPick } as EffectAction,
      available: true,
    }));
    if (pickHSU.optional) {
      optsHSU.push({ id: 'skip', label: '置かない', action: { type: 'STUB', id: 'INTERNAL_NOOP' } as EffectAction, available: true });
    }
    return needsInteraction(addLog(ctx, 'どのシグニの下に置きますか？'), { type: 'CHOOSE', options: optsHSU, count: 1 });
  }
  // INTERNAL_HSUS_PICK_HAND: `HAND_SIGNI_UNDER_SIGNI` の2段目＝置き先（`stub.value`）を焼き込んで手札を選ばせる。
  if (stub.id === 'INTERNAL_HSUS_PICK_HAND') {
    const pickHSU2 = resolveHandCardPick(stub.handCardPick, ctx);
    const hostHSU2 = typeof stub.value === 'string' ? stub.value : undefined;
    if (!pickHSU2 || !hostHSU2) return done(ctx);
    if (pickHSU2.cands.length === 0) return done(addLog(ctx, '手札にシグニなし（シグニ下配置スキップ）'));
    const placeAction: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand', hostCardNum: hostHSU2 };
    return selectOrInteract(pickHSU2.cands, pickHSU2.count, pickHSU2.optional, 'self_hand', placeAction as EffectAction, undefined, ctx);
  }
  // 🏁**`HAND_CARDS_UNDER_SIGNI` / `PLACE_SIGNI_UNDER_SELF_OPT` は撤去した**（2026-09-02 §5.3 `O-60` 第16バッチ）。
  //   旧実装は `card.EffectText` から**枚数・任意・レベル・置き元の4軸**を実行時 regex で読んでいた＝
  //   効果元が `cardMap` から引けない経路では4軸とも既定値へ崩れる形だった。
  //   いまは parser が `PLACE_UNDER_SIGNI{source:'hand'|'field', count, upToCount, filter}` を出し、
  //   `execPlaceUnderSigni`（`effectExecutor.ts`）が payload だけで解く。
  // UNDER_SIGNI_TO_ENERGY: シグニの下のカードをエナゾーンに置く
  // ⚠（id ラベルを付けているのは、直前に第16バッチの撤去メモが並んでいるため＝
  //   `genStubsMd.mjs` は直前の連続コメントを全部つなぐので、ラベルが無いと**撤去メモが説明欄に出る**）。
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY') {
    // SELECT_TARGET後の処理：lastProcessedCardsにカードがある場合
    if (ctx.lastProcessedCards?.length) {
      const movedUTE = ctx.lastProcessedCards[0];
      const newSigniUTE2 = ctx.ownerState.field.signi.map(stack => {
        if (!stack?.includes(movedUTE)) return stack;
        const filtered = stack.filter(c => c !== movedUTE);
        return filtered.length > 0 ? filtered : null;
      }) as (string[] | null)[];
      const newOwnerUTE2 = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniUTE2 }, energy: [...ctx.ownerState.energy, movedUTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerUTE2 },
        `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}をエナゾーンへ（シグニ下から）`));
    }
    // ソースゾーンのシグニ下カードを収集
    const srcZoneUTE = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : ctx.ownerState.field.signi.findIndex(s => s && s.length > 1);
    if (srcZoneUTE < 0) return done(addLog(ctx, 'シグニの下にカードなし（UNDER_SIGNI_TO_ENERGY）'));
    const stackUTE = ctx.ownerState.field.signi[srcZoneUTE] ?? [];
    const underCardsUTE = stackUTE.slice(0, -1); // 最前面以外（下のカード群）
    if (underCardsUTE.length === 0) return done(addLog(ctx, 'シグニの下にカードなし'));
    if (underCardsUTE.length === 1) {
      // 1枚のみ→直接エナへ
      const movedUTE = underCardsUTE[0];
      const newStackUTE = stackUTE.filter(c => c !== movedUTE);
      const newSigniUTE = [...ctx.ownerState.field.signi] as (string[] | null)[];
      newSigniUTE[srcZoneUTE] = newStackUTE.length > 0 ? newStackUTE : null;
      const newOwnerUTE = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniUTE }, energy: [...ctx.ownerState.energy, movedUTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerUTE },
        `${ctx.cardMap.get(movedUTE)?.CardName ?? movedUTE}をエナゾーンへ（シグニ下から）`));
    }
    // 複数枚→SELECT_TARGET
    const contUTE: StubAction = { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY' };
    return needsInteraction(addLog(ctx, 'シグニ下のカードを選択（エナゾーンへ）'), {
      type: 'SELECT_TARGET', candidates: underCardsUTE, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contUTE as EffectAction,
    });
  }
  // デッキトップを公開してレベル一致なら手札に加える
  if (stub.id === 'DECK_TOP_CHECK_LEVEL_HAND') {
    const declaredLv = ctx.ownerState.declared_number ?? ctx.ownerState.declared_guard_restrict_level;
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCard = ctx.ownerState.deck[0];
    const topData = ctx.cardMap.get(topCard);
    const topLv = parseInt(topData?.Level ?? '-1');
    if (declaredLv !== undefined && topData?.Type === 'シグニ' && topLv === declaredLv) {
      const newDeck = ctx.ownerState.deck.slice(1);
      // 宣言数字はこのデッキトップ判定で消費する。⚠**§6.4 O-41 で宣言値の保存先は `declared_number` へ分離済み**
      //   ＝この consume は旧保存先（`declared_guard_restrict_level`）に残った値を掃除する後方互換の1本。
      const newOwner = consumeDeclaredGuardRestrictLevel({ ...ctx.ownerState, deck: newDeck, hand: [...ctx.ownerState.hand, topCard] });
      return done(addLog({ ...ctx, ownerState: newOwner },
        `デッキトップ公開：${topData?.CardName ?? topCard}（Lv${topLv}）→手札`));
    }
    const name = topData?.CardName ?? topCard;
    const lv = topData?.Level ?? '?';
    // 一致しない場合もデッキトップに戻す（移動なし）。宣言数字は消費済みのためクリア。
    const newOwnerNM = consumeDeclaredGuardRestrictLevel(ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: newOwnerNM }, `デッキトップ公開：${name}（Lv${lv}）→不一致、デッキトップに戻す`));
  }
  // 相手の手札のシグニを見て捨てさせる（宣言数字フィルタ or 有色フィルタ）
  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const declaredLvLOD = ctx.ownerState.declared_number ?? ctx.ownerState.declared_guard_restrict_level;
    const oppHandLOD = ctx.otherState.hand;
    const candsLOD = oppHandLOD.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (declaredLvLOD !== undefined) {
        return parseInt(c.Level ?? '-1') === declaredLvLOD;
      }
      const color = c?.Color ?? '';
      return color.length > 0 && color !== '無';
    });
    if (candsLOD.length === 0) return done(addLog(ctx, '相手手札に対象シグニなし（LOOK_OPP_HAND_DISCARD_SIGNI）'));
    const discardLOD: TrashAction = {
      type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
    };
    return selectOrInteract(candsLOD, 1, false, 'opp_hand', discardLOD as EffectAction, undefined, ctx);
  }
  // デッキ上を公開し、宣言したレベルのシグニならエナゾーンへ
  if (stub.id === 'DECK_TOP_CHECK_LEVEL_ENERGY') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし（DECK_TOP_CHECK_LEVEL_ENERGY）'));
    const declaredLvDTE = ctx.ownerState.declared_number ?? ctx.ownerState.declared_guard_restrict_level;
    const topCardDTE = ctx.ownerState.deck[0];
    const topDataDTE = ctx.cardMap.get(topCardDTE);
    const topLvDTE = parseInt(topDataDTE?.Level ?? '-1');
    const topNameDTE = topDataDTE?.CardName ?? topCardDTE;
    if (topDataDTE?.Type === 'シグニ' && declaredLvDTE !== undefined && topLvDTE === declaredLvDTE) {
      const newDeckDTE = ctx.ownerState.deck.slice(1);
      const newOwnerDTE = { ...ctx.ownerState, deck: newDeckDTE, energy: [...ctx.ownerState.energy, topCardDTE] };
      return done(addLog({ ...ctx, ownerState: newOwnerDTE },
        `デッキトップ公開：${topNameDTE}（Lv${topLvDTE}）→エナゾーンへ`));
    }
    return done(addLog(ctx, `デッキトップ公開：${topNameDTE}（Lv${topDataDTE?.Level ?? '?'}）→条件不一致`));
  }
  // ルリグレベル合計に基づくパワー修正（自分のルリグ全体のレベル合計を参照）
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    // §6.4 O-20: 全文だと別能力の「レベルの合計〜につき＋N」を拾いうるのでブロックだけを読む。
    const txtPMLS = sourceAbilityText(ctx);
    const toHWPMLS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lrigLvSum = (ctx.ownerState.field.lrig ?? []).reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    const perMPMLS = txtPMLS.match(/レベルの合計([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMLS) {
      const divisorPMLS = parseInt(toHWPMLS(perMPMLS[1] || '1')) || 1;
      const deltaPMLS = parseInt(toHWPMLS(perMPMLS[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMLS = Math.floor(lrigLvSum / divisorPMLS) * deltaPMLS;
      if (totalDeltaPMLS !== 0) {
        // 自シグニ（sourceCardNum）に適用、なければ全自シグニ
        const selfTargetPMLS = ctx.sourceCardNum;
        const modsPMLS = [...(ctx.ownerState.temp_power_mods ?? [])];
        if (selfTargetPMLS && ctx.ownerState.field.signi.some(s => s?.at(-1) === selfTargetPMLS)) {
          modsPMLS.push({ cardNum: selfTargetPMLS, delta: totalDeltaPMLS });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.ownerState.field.signi[zi]?.at(-1);
            if (top) modsPMLS.push({ cardNum: top, delta: totalDeltaPMLS });
          }
        }
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMLS } },
          `パワー${totalDeltaPMLS > 0 ? '+' : ''}${totalDeltaPMLS}（ルリグレベル合計${lrigLvSum}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ルリグレベル合計${lrigLvSum}）`));
  }
  // 自場シグニの色の種類数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰）
  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const toHWPMCV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorSetPMCV = new Set<string>();
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (top) {
        const colors = splitColors(ctx.cardMap.get(top)?.Color);
        for (const c of colors) colorSetPMCV.add(c);
      }
    }
    const varietyPMCV = colorSetPMCV.size;
    // §6.4 O-20: 全文だと別能力の「〜につき－N」を拾いうるのでブロックだけを読む。
    const txtPMCV = sourceAbilityText(ctx);
    const mPMCV = txtPMCV.match(/色の種類([０-９\d]*)つにつき([－＋][０-９\d]+)/);
    const divisorPMCV = mPMCV ? parseInt(toHWPMCV(mPMCV[1] || '1')) || 1 : 1;
    const deltaPMCV = mPMCV ? parseInt(toHWPMCV(mPMCV[2]).replace('－', '-').replace('＋', '+')) : -3000;
    const totalDeltaPMCV = Math.floor(varietyPMCV / divisorPMCV) * deltaPMCV;
    // 既にターゲット選択済みなら適用
    const existPMCV = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPMCV) {
      const modsPMCV = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPMCV, delta: totalDeltaPMCV }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMCV } },
        `${ctx.cardMap.get(existPMCV)?.CardName ?? existPMCV}のパワー${totalDeltaPMCV}（色${varietyPMCV}種）`));
    }
    const oppCandsPMCV = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMCV.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_MOD_BY_COLOR_VARIETY）'));
    const contPMCV: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_COLOR_VARIETY' };
    const noopPMCV: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPMCV, 1, false, 'opp_field', noopPMCV as EffectAction, contPMCV as EffectAction, ctx);
  }
  // アタックしたシグニのレベルに基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_ATTACKER_LEVEL') {
    // §6.4 O-20: `WXK10-084` は奇偶2能力が同居し、全文だと E2（奇数対象）も先頭 E1 の「偶数」を拾って**対象が反転**する。
    const txtPMAL = sourceAbilityText(ctx);
    const toHWPMAL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // §6.4 O-23: 原文は「**アタックしたその**シグニのレベル１につき」＝倍率はアタッカーのレベル。
    // `WXK10-084-E1/E2` は `triggerScope:'any_ally'` なので**能力の持ち主（sourceCardNum）と
    // アタッカーは別物になりうる**（別の＜トリック＞シグニがアタックしても発火する）。
    // ⚠自身がアタックした場合は両コレクタとも `triggeringCardNum === attacker === source` を積むので挙動不変
    //   （`collectAttackerSelfTriggers`＝`triggerCollect.ts:3534`／`collectFieldTriggers` の any_ally＝`:3649`）。
    const attackerNumPMAL = ctx.triggeringCardNum ?? ctx.sourceCardNum;
    const attackerLvPMAL = parseInt(toHWPMAL(ctx.cardMap.get(getCardNum(attackerNumPMAL ?? ''))?.Level ?? '0')) || 0;
    const perMPMAL = txtPMAL.match(/レベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (!perMPMAL || attackerLvPMAL === 0) return done(addLog(ctx, `パワー修正（アタッカーLv${attackerLvPMAL}）`));
    const divisorPMAL = parseInt(toHWPMAL(perMPMAL[1] || '1')) || 1;
    const deltaPMAL = parseInt(toHWPMAL(perMPMAL[2]).replace('－', '-').replace('＋', '+'));
    const totalDeltaPMAL = Math.floor(attackerLvPMAL / divisorPMAL) * deltaPMAL;
    // 対象シグニが未選択なら SELECT_TARGET で相手シグニを選ぶ（レベル奇数/偶数でフィルタ）
    if (!ctx.lastProcessedCards?.length) {
      const parityMPMAL = txtPMAL.match(/レベルが(奇数|偶数)の対戦相手/);
      const parityPMAL = parityMPMAL?.[1];
      const oppCandsPMAL = ctx.otherState.field.signi.flatMap(s => {
        const top = s?.at(-1);
        if (!top) return [];
        if (parityPMAL) {
          const lv = parseInt(toHWPMAL(ctx.cardMap.get(top)?.Level ?? '0')) || 0;
          if (parityPMAL === '奇数' && lv % 2 === 0) return [];
          if (parityPMAL === '偶数' && lv % 2 === 1) return [];
        }
        return [top];
      });
      if (oppCandsPMAL.length === 0) return done(addLog(ctx, '対象相手シグニなし（POWER_MOD_BY_ATTACKER_LEVEL）'));
      const contPMAL: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_ATTACKER_LEVEL' };
      return needsInteraction(addLog(ctx, '対象シグニを選択（アタッカーレベルによるパワー修正）'), {
        type: 'SELECT_TARGET', candidates: oppCandsPMAL, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: contPMAL as EffectAction,
      });
    }
    const modsPMAL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of ctx.lastProcessedCards) modsPMAL.push({ cardNum: cn, delta: totalDeltaPMAL });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMAL } },
      `パワー${totalDeltaPMAL > 0 ? '+' : ''}${totalDeltaPMAL}（アタッカーLv${attackerLvPMAL}）`));
  }
  // トラッシュしたシグニのレベル×-2000 → 1体相手シグニパワー修正（SELECT→INTERNAL）
  if (stub.id === 'POWER_MOD_BY_TRASHED_SIGNI_LEVEL') {
    const lastTrashedPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvPMTSL = parseInt(ctx.cardMap.get(lastTrashedPMTSL)?.Level ?? '0') || 0;
    if (lvPMTSL === 0) return done(addLog(ctx, 'パワー修正（トラッシュシグニLv0）'));
    const oppCandsPMTSL = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMTSL.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_MOD_BY_TRASHED_SIGNI_LEVEL）'));
    const noopPMTSL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMTSL: StubAction = { type: 'STUB', id: 'INTERNAL_PMBTSL_APPLY' };
    return selectOrInteract(oppCandsPMTSL, 1, false, 'opp_field', noopPMTSL as EffectAction, contPMTSL as EffectAction, ctx);
  }
  if (stub.id === 'INTERNAL_PMBTSL_APPLY') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '対象なし（INTERNAL_PMBTSL_APPLY）'));
    const lastTrIPMTSL = ctx.ownerState.trash.at(-1) ?? '';
    const lvIPMTSL = parseInt(ctx.cardMap.get(lastTrIPMTSL)?.Level ?? '0') || 0;
    const deltaIPMTSL = -(lvIPMTSL * 2000);
    const modsIPMTSL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of selected) modsIPMTSL.push({ cardNum: cn, delta: deltaIPMTSL });
    const nameIPMTSL = ctx.cardMap.get(lastTrIPMTSL)?.CardName ?? lastTrIPMTSL;
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMTSL } },
      `${selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}のパワー${deltaIPMTSL}（${nameIPMTSL} Lv${lvIPMTSL}）`));
  }
  // 自シグニのパワーの半分だけ全相手シグニをパワーマイナス
  if (stub.id === 'ALL_OPP_SIGNI_POWER_DOWN_HALF') {
    const selfPowerAOSPDH = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const halfPowerAOSPDH = Math.floor(selfPowerAOSPDH / 2);
    if (halfPowerAOSPDH > 0) {
      const modsAOSPDH = [...(ctx.otherState.temp_power_mods ?? [])];
      for (let zi = 0; zi < 3; zi++) {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsAOSPDH.push({ cardNum: top, delta: -halfPowerAOSPDH });
      }
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsAOSPDH } },
        `全相手シグニパワー-${halfPowerAOSPDH}（自パワー${selfPowerAOSPDH}の半分）`));
    }
    return done(addLog(ctx, '全相手シグニパワー半減（自パワー0）'));
  }
  // エナゾーンからカード1枚選んでトラッシュ（SELECT→INTERNAL）
  if (stub.id === 'ENERGY_TO_TRASH') {
    const selfEnergyETT = ctx.ownerState.energy;
    if (selfEnergyETT.length === 0) return done(addLog(ctx, 'エナゾーンにカードなし（ENERGY_TO_TRASH）'));
    const noopETT: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contETT: StubAction = { type: 'STUB', id: 'INTERNAL_ENERGY_TO_TRASH' };
    return needsInteraction(addLog(ctx, 'エナゾーンからカードを選択（トラッシュへ）'), {
      type: 'SELECT_TARGET', candidates: selfEnergyETT, count: 1, optional: false,
      targetScope: 'self_energy', thenAction: noopETT as EffectAction, continuation: contETT as EffectAction,
    });
  }
  // ENERGY_TO_TRASH の後処理：選択したエナカードをトラッシュへ
  if (stub.id === 'INTERNAL_ENERGY_TO_TRASH') {
    const selectedETT = ctx.lastProcessedCards ?? [];
    if (selectedETT.length === 0) return done(addLog(ctx, 'なし（INTERNAL_ENERGY_TO_TRASH）'));
    const newEnergyETT = ctx.ownerState.energy.filter(cn => !selectedETT.includes(cn));
    const newTrashETT = [...ctx.ownerState.trash, ...selectedETT];
    const newOwnerETT = { ...ctx.ownerState, energy: newEnergyETT, trash: newTrashETT };
    const nameETT = selectedETT.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerETT }, `エナゾーン：${nameETT}→トラッシュ`));
  }
  // 🏁**`POWER_BY_CHARM_COUNT` は撤去した**（2026-09-03 §5.3 `O-60` 第29バッチ）。
  //   旧実装は `EffectText + BurstText` に `/チャーム(\d*)(?:個|枚)?につき([－＋]\d+)/` を当てて単価を読み、
  //   🔴**自分の場のチャームしか数えず**（原文「**場にある**」＝両者）、しかも修正先を
  //   **対戦相手のシグニ**へ積んでいた（原文は「**この**シグニのパワーは」＝真逆）。
  //   いまは parser が typed `POWER_MODIFY_PER_CHARM{sourceOwner:'any', sourceLocation:'field'}` を出し、
  //   `calcFieldPowers` の CONTINUOUS 経路が解く（受け皿は live 3効果で先に稼働していた）。

  // 🏁**`POWER_BY_ENERGY_COLOR_VARIETY` は撤去した**（2026-09-03 §5.3 `O-60` 第30バッチ）。
  //   旧実装は `EffectText + BurstText` の regex で単価を読み、**色の限定は一切見ずに5色すべて**を数えていた
  //   （`WXK11-063` の原文は「**白、赤、緑、黒**の色１種類につき」＝**青を数えない**＝1色ぶん過剰）。
  //   いまは parser が typed `POWER_MODIFY_PER_ENERGY_COLOR{colors:[…]}` を出し、
  //   `calcFieldPowers` の CONTINUOUS 経路が解く（受け皿は同型5効果で先に稼働していた）。

  // 🏁**`POWER_BY_RISE_SIGNI_COUNT` は撤去した**（2026-09-03 §5.3 `O-60` 第31バッチ）。
  //   旧実装は ①`EffectText` に「ライズシグニ…体につき」（**実在しない綴り**）を当てて単価を読み
  //   ②数える対象を「**スタックが2枚以上のゾーン**」で近似（《ライズアイコン》の有無を見ていない）
  //   ③修正先を**対戦相手のシグニ**に積んでいた（原文は「**この**シグニのパワーは」＝真逆）。
  //   いまは parser が typed `POWER_MODIFY_PER_FIELD{countFilter:{hasRiseIcon:true}}` を出す。

  // 🏁**`POWER_MOD_BY_FRONT_LEVEL` は撤去した**（2026-09-03 §5.3 `O-60` 第32バッチ）。
  //   旧実装は `EffectText` の regex で単価を読むだけでなく、**2つとも裏返して**いた＝
  //   ①正面ゾーンを `otherState.field.signi[zi]`（**同じ添字**）で引いていた（正面は `2 - zi`）
  //   ②修正先を**効果元自身**に積んでいた（原文は「この**シグニの正面のシグニ**のパワーを」）。
  //   いまは parser が `POWER_MODIFY{filter:{frontOfSelf:true}, deltaPerTargetLevel:true}` を出し、
  //   `calcFieldPowers` の `frontOfSelf` 分岐が**正面シグニ自身のレベル**を掛ける。

  // 🏁**`INFECTED_SIGNI_POWER_DOWN_BY_LEVEL` は撤去した**（2026-09-03 §5.3 `O-60` 第25バッチ）。
  //   旧実装は `EffectText + BurstText` に `/ウイルス.*?シグニのレベル(\d*)につき([－＋]\d+)/` を当てていたが、
  //   原文は「**感染状態**のシグニ」なので**1本も当たらず**、当たった場合でも
  //   **感染シグニのレベルの合計**を**相手の全シグニ**（非感染も含む）へ掛ける別物だった。
  //   いまは parser が `POWER_MODIFY{filter:{infected:true}, deltaPerTargetLevel:true}` を出し、
  //   `calcFieldPowers` の CONTINUOUS 経路が**各シグニ自身のレベル**を掛ける。

  // 自シグニパワーの2倍を全相手シグニにマイナス
  // DOUBLE_OWN_POWER_MINUS: 対象シグニへの自分効果パワー-を2倍にする（SELECT_TARGET + フラグ設置）
  if (stub.id === 'DOUBLE_OWN_POWER_MINUS') {
    // ⚠**対象は `storedTargetCards` も見る**（§6.4 O-28）＝`SELECT_TARGET_ONLY → STORE` の正準形から来る
    //   経路では `lastProcessedCards` が後続で上書きされうる。
    const targetDOPM = [...(ctx.storedTargetCards ?? []), ...(ctx.lastProcessedCards ?? [])].find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetDOPM) {
      const oppSigniDOPM = [0,1,2]
        .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniDOPM.length === 0) return done(addLog(ctx, '2倍パワー-：相手シグニなし'));
      const noopDOPM: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contDOPM: StubAction = { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' };
      return needsInteraction(addLog(ctx, 'このターン自分効果でパワー-を2倍にするシグニを選択'), {
        type: 'SELECT_TARGET', candidates: oppSigniDOPM, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: noopDOPM as EffectAction,
        continuation: contDOPM as EffectAction,
      });
    }
    // 🔴**フラグは「そのシグニを持つ側」の state に積む**（§6.4 O-28）＝`calcFieldPowers` の
    //   `applyTempMods(state, …)` は **`state.double_power_minus_targets`** を読み、`state.temp_power_mods`
    //   （＝そのプレイヤーのシグニに掛かる修正）にだけ適用する。従来は相手シグニを選んでおきながら
    //   **自分の state** へ積んでいたので、倍化が一度も効かなかった。
    const existingDOPM = ctx.otherState.double_power_minus_targets ?? [];
    const newOtherDOPM = { ...ctx.otherState, double_power_minus_targets: [...new Set([...existingDOPM, targetDOPM])] };
    return done(addLog({ ...ctx, otherState: newOtherDOPM },
      `${ctx.cardMap.get(targetDOPM)?.CardName ?? targetDOPM}へのパワー-を2倍に設定`));
  }
  // CHARM_POWER_MINUS_MULTIPLIER（§6.4 O-10・続き507）＝`WX25-P2-103-E1` の選択肢②
  // 「それに【チャーム】が付いている場合、このターン、あなたの効果によってそれのパワーが－される場合、
  //  代わりに３倍－される」。上の 2倍版（`DOUBLE_OWN_POWER_MINUS`）の**倍率つき＋チャーム条件**版。
  // 🔑倍率は `power_minus_multipliers_this_turn`（相手 state ＝**修正を受ける側**に積む）。
  //   ⚠2倍版と同じで、自分の state に積むと `calcFieldPowers` が一度も読まない（続き503 で踏んだ罠）。
  if (stub.id === 'CHARM_POWER_MINUS_MULTIPLIER') {
    const targetCPM = [...(ctx.storedTargetCards ?? []), ...(ctx.lastProcessedCards ?? [])].find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetCPM) {
      const oppSigniCPM = [0, 1, 2]
        .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniCPM.length === 0) return done(addLog(ctx, '3倍パワー-：相手シグニなし'));
      return needsInteraction(addLog(ctx, 'このターン自分効果でパワー-を3倍にするシグニを選択'), {
        type: 'SELECT_TARGET', candidates: oppSigniCPM, count: 1, optional: false,
        targetScope: 'opp_field',
        thenAction: { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as unknown as EffectAction,
        continuation: { type: 'STUB', id: 'CHARM_POWER_MINUS_MULTIPLIER' } as unknown as EffectAction,
      });
    }
    // ⚠**「【チャーム】が付いている場合」は条件**＝付いていなければ何も起きない（倍率も積まない）。
    const zoneCPM = ctx.otherState.field.signi.findIndex(s => s?.at(-1) === targetCPM);
    const hasCharmCPM = (ctx.otherState.field.signi_charms?.[zoneCPM] ?? null) !== null;
    const nameCPM = ctx.cardMap.get(getCardNum(targetCPM))?.CardName ?? targetCPM;
    if (!hasCharmCPM) return done(addLog(ctx, `${nameCPM}に【チャーム】が付いていないため何も起きない`));
    const multiplier = typeof stub.value === 'number' ? stub.value : 3;
    const existingCPM = ctx.otherState.power_minus_multipliers_this_turn ?? {};
    return done(addLog({
      ...ctx,
      otherState: {
        ...ctx.otherState,
        power_minus_multipliers_this_turn: {
          ...existingCPM,
          [targetCPM]: Math.max(existingCPM[targetCPM] ?? 1, multiplier),
        },
      },
    }, `${nameCPM}へのパワー-を${multiplier}倍に設定`));
  }
  // 全自シグニのパワーを2倍にする（現在値と同量をデルタ追加）
  if (stub.id === 'POWER_DOUBLE_ALL') {
    const modsPDA = [...(ctx.ownerState.temp_power_mods ?? [])];
    let boostedPDA = 0;
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const curPw = ctx.effectivePowers?.get(top) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0', 10);
      modsPDA.push({ cardNum: top, delta: curPw });
      boostedPDA++;
    }
    if (boostedPDA > 0)
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPDA } },
        `全自シグニのパワー×2（${boostedPDA}体）`));
    return done(addLog(ctx, '自場にシグニなし（POWER_DOUBLE_ALL）'));
  }
  // COPY_TARGET_POWER: 対象シグニのパワーを自シグニの基本パワーにする
  if (stub.id === 'COPY_TARGET_POWER') {
    const selfCnCTP = ctx.sourceCardNum;
    const targetCnCTP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn) ||
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!selfCnCTP) return done(addLog(ctx, 'パワーコピー不可（自シグニなし）'));
    if (!targetCnCTP) {
      // ターゲット未選択 → SELECT_TARGET してからCOPY_TARGET_POWERを再実行
      const allFieldCTP = [
        ...[0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
        ...[0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ].filter(cn => cn !== selfCnCTP);
      if (allFieldCTP.length === 0) return done(addLog(ctx, 'コピー対象シグニなし'));
      const contCTP: StubAction = { type: 'STUB', id: 'COPY_TARGET_POWER' };
      const noopCTP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      return needsInteraction(addLog(ctx, 'パワーをコピーするシグニを選択'), {
        type: 'SELECT_TARGET', candidates: allFieldCTP, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopCTP as EffectAction,
        continuation: contCTP as EffectAction,
      });
    }
    const targetPwCTP = ctx.effectivePowers?.get(targetCnCTP) ?? parseInt(ctx.cardMap.get(targetCnCTP)?.Power ?? '0', 10);
    const selfPwCTP = ctx.effectivePowers?.get(selfCnCTP) ?? parseInt(ctx.cardMap.get(selfCnCTP)?.Power ?? '0', 10);
    const deltaCTP = targetPwCTP - selfPwCTP;
    const modsCTP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: selfCnCTP, delta: deltaCTP }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCTP } },
      `${ctx.cardMap.get(selfCnCTP)?.CardName ?? selfCnCTP}のパワーを${targetPwCTP}にコピー（${ctx.cardMap.get(targetCnCTP)?.CardName ?? targetCnCTP}から）`));
  }
  // 自パワーに合わせて相手シグニのパワーを設定
  if (stub.id === 'SET_OPP_SIGNI_POWER_BY_SELF_POWER') {
    // 対戦相手のシグニ1体のパワーを自シグニのパワーと同じだけ－する
    const selfPwSOSP = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const targetSOSP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSOSP) {
      const modsSOSP = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetSOSP, delta: -selfPwSOSP }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsSOSP } },
        `${ctx.cardMap.get(targetSOSP)?.CardName ?? targetSOSP}のパワーを${selfPwSOSP}だけ減少`));
    }
    const oppCandsSOSP = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (oppCandsSOSP.length === 0) return done(addLog(ctx, '相手シグニなし（SET_OPP_SIGNI_POWER_BY_SELF_POWER）'));
    const applySOSP: StubAction = { type: 'STUB', id: 'SET_OPP_SIGNI_POWER_BY_SELF_POWER' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsSOSP, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: applySOSP as EffectAction,
    });
  }
  // 宣言した数だけデッキ上からトラッシュへ
  if (stub.id === 'DECK_TOP_DECLARED_NUM_TRASH') {
    const declaredNumDTDT = ctx.ownerState.declared_number ?? ctx.ownerState.declared_guard_restrict_level ?? 1;
    const topCardsDTDT = ctx.ownerState.deck.slice(0, declaredNumDTDT);
    if (topCardsDTDT.length === 0) return done(addLog(ctx, 'デッキなし（DECK_TOP_DECLARED_NUM_TRASH）'));
    const newOwnerDTDT = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(declaredNumDTDT),
      trash: [...ctx.ownerState.trash, ...topCardsDTDT],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDTDT },
      `デッキ上${topCardsDTDT.length}枚→トラッシュ（宣言数${declaredNumDTDT}）`));
  }
  // 自場シグニのレベル合計枚数をデッキ上からトラッシュ
  if (stub.id === 'TRASH_FROM_DECK_PER_SIGNI_LEVEL') {
    const lvSumTFDPSL = [0, 1, 2].reduce((acc, zi) => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return acc + (parseInt(ctx.cardMap.get(top ?? '')?.Level ?? '0') || 0);
    }, 0);
    if (lvSumTFDPSL === 0 || ctx.ownerState.deck.length === 0)
      return done(addLog(ctx, `デッキトップトラッシュ不可（Lv合計${lvSumTFDPSL}）`));
    const trashCountTFDPSL = Math.min(lvSumTFDPSL, ctx.ownerState.deck.length);
    const newOwnerTFDPSL = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(trashCountTFDPSL),
      trash: [...ctx.ownerState.trash, ...ctx.ownerState.deck.slice(0, trashCountTFDPSL)],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerTFDPSL },
      `デッキ上${trashCountTFDPSL}枚→トラッシュ（シグニLv合計${lvSumTFDPSL}）`));
  }
  // チャーム数だけドロー
  if (stub.id === 'DRAW_BY_CHARM_COUNT') {
    const charmCountDBCC = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null && c !== undefined).length;
    if (charmCountDBCC === 0) return done(addLog(ctx, 'チャームなし（DRAW_BY_CHARM_COUNT）'));
    const drawCountDBCC = Math.min(charmCountDBCC, ctx.ownerState.deck.length);
    if (drawCountDBCC === 0) return done(addLog(ctx, 'デッキなし（DRAW_BY_CHARM_COUNT）'));
    const newOwnerDBCC = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(drawCountDBCC),
      hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, drawCountDBCC)],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerDBCC }, `${drawCountDBCC}枚ドロー（チャーム${charmCountDBCC}個）`));
  }
  // 🗑§5.3 `O-188` 第6バッチ（2026-09-01）＝`BANISH_MULTI_COLOR_SIGNI` のハンドラを削除した。
  //   唯一の利用元 `WXK05-030-E1` の原文は「対戦相手の白、赤、青、緑、黒のシグニを**それぞれ１体**対象とし、
  //   それらを**トラッシュに置く**」で、ここの実装（**2色以上を持つ相手シグニを選択させずに全部バニッシュ**）は
  //   選択・配分・destination のどれも原文と違っていた。⇒ parser と `manualEffects.ts` の両方を
  //   `TRASH{SIGNI, selectionConstraint.groups}`（色ごと1体）へ typed 化した。
  // §6.4 O-24：`OPP_TRASH_FIELD_SIGNI_AND_ENERGY` は**削除した**（相手の場のシグニ全部＋エナ全部を流す
  // 過剰実行だった）。原文どおり「シグニ1体＋エナ1枚を**対戦相手が**選ぶ」は parser が
  // `SEQUENCE[TRASH{SIGNI opponent,opponentSelects}, TRASH{ENERGY_CARD opponent,opponentSelects}]` を組む
  // （`parseSentencePart2.ts` の「対戦相手がシグニとエナゾーンのカードをトラッシュ」規則）。

  // LEAVE_FIELD_TO_DECK_BOTTOM: このシグニが場を離れる場合、代わりにこれをデッキの一番下に置く
  // ⚠**直前に空行を置くこと**＝`genStubsMd.mjs` は `if` の直上の連続コメント行を説明として拾うので、
  //   上の「削除した id の記録」まで巻き込むと、**逆翻訳の `[STUB:…]` に他 id の削除メモが出る**
  //   （2026-09-01 に実際そうなっていた＝`WXDi-P08-046-E1` の逆翻訳）。
  if (stub.id === 'LEAVE_FIELD_TO_DECK_BOTTOM') {
    const srcCnLFDB = ctx.sourceCardNum;
    if (!srcCnLFDB || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcCnLFDB))
      return done(addLog(ctx, '対象がフィールドにいない（LEAVE_FIELD_TO_DECK_BOTTOM）'));
    const removedLFDB = removeFromField(srcCnLFDB, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedLFDB, deck: [...removedLFDB.deck, srcCnLFDB] } },
      `${ctx.cardMap.get(srcCnLFDB)?.CardName ?? srcCnLFDB}をデッキ下へ`));
  }
  // 「あなたはルリグによってダメージを受けない」の**宣言型**（§6.4 O-3 続き492）。
  // ⚠🔴これは【常】＝場にあるかぎり有効なので、**state に1回きりのフラグを書いてはいけない**
  //   （書くと1回防いだ時点で消え、以後は素通りする）。判定は `isLrigDamagePrevented` が
  //   effectsMap から宣言を読む（シグニ／ルリグ／アシスト／キーを走査する）。
  if (stub.id === 'PREVENT_LRIG_DAMAGE') {
    return done(addLog(ctx, 'ルリグダメージ無効（【常】宣言・判定は isLrigDamagePrevented）'));
  }
  // 期間つき版は `PREVENT_DAMAGE{scope:'LRIG'}` へ移行済み（続き492）。旧 id は手パッチ JSON 互換で残す。
  if (stub.id === 'PREVENT_DAMAGE_UNTIL_OPP_TURN_END' || stub.id === 'PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_lrig_damage: true } },
      'このターンルリグダメージ無効'));
  }
  // 色条件によるライフバースト抑制（相手に suppress_life_burst フラグ）。
  // 🆕**boolean ではなく条件（`TargetFilter`）を載せる**（2026-09-02・§5.3 `O-177`）＝
  //   原文は「**対戦相手のセンタールリグと共通する色を持たない**対戦相手のカードの」なので、
  //   旧の `true` は**そのターンの相手のバーストを全部止める**過剰実行だった。
  // ⚠フラグは**クラッシュされる側（`otherState`）**に立つので、`colorNotMatchesLrig` の基準ルリグも
  //   その側のセンタールリグ＝`lifeBurstSuppressedByTurnFlag` がフラグの持ち主基準で解決する。
  if (stub.id === 'SUPPRESS_LIFEBURST_COLOR_CONDITION') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, suppress_life_burst: { colorNotMatchesLrig: true } } },
      'ライフバースト発動抑制（センタールリグと共通する色を持たないカードのみ）'));
  }
  // エナゾーンからカードを手札へ（SELECT→INTERNAL）
  if (stub.id === 'ENERGY_TO_HAND_ON_DECK') {
    const selfEnaETHOD = ctx.ownerState.energy;
    if (selfEnaETHOD.length === 0) return done(addLog(ctx, 'エナゾーンにカードなし（ENERGY_TO_HAND_ON_DECK）'));
    const noopETHOD: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contETHOD: StubAction = { type: 'STUB', id: 'INTERNAL_ENERGY_TO_HAND' };
    return needsInteraction(addLog(ctx, 'エナゾーンからカードを選択（手札へ）'), {
      type: 'SELECT_TARGET', candidates: selfEnaETHOD, count: 1, optional: false,
      targetScope: 'self_energy', thenAction: noopETHOD as EffectAction, continuation: contETHOD as EffectAction,
    });
  }
  // ENERGY_TO_HAND_ON_DECK 後処理：選択エナを手札へ
  if (stub.id === 'INTERNAL_ENERGY_TO_HAND') {
    const selectedETH = ctx.lastProcessedCards ?? [];
    if (selectedETH.length === 0) return done(addLog(ctx, 'なし（INTERNAL_ENERGY_TO_HAND）'));
    const newOwnerETH = {
      ...ctx.ownerState,
      energy: ctx.ownerState.energy.filter(cn => !selectedETH.includes(cn)),
      hand: [...ctx.ownerState.hand, ...selectedETH],
    };
    const nameETH = selectedETH.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: newOwnerETH }, `エナゾーン：${nameETH}→手札`));
  }
  // コイン獲得+手札から捨て（先頭N枚を自動捨て）
  if (stub.id === 'GAIN_COIN_AND_DISCARD') {
    const srcGCAD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCAD = srcGCAD ? (srcGCAD.EffectText ?? '') + ' ' + (srcGCAD.BurstText ?? '') : '';
    const toHWGCAD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const coinMGCAD = txtGCAD.match(/コイン([０-９\d]*)(?:枚?|個?)を得る/);
    const coinCountGCAD = coinMGCAD ? (parseInt(toHWGCAD(coinMGCAD[1] || '1')) || 1) : 1;
    const discardMGCAD = txtGCAD.match(/手札を([０-９\d]*)枚?(?:捨て|トラッシュ)/);
    const discardCountGCAD = discardMGCAD ? (parseInt(toHWGCAD(discardMGCAD[1] || '1')) || 1) : 1;
    // コイン付与
    const ctxCoinGCAD = addLog({ ...ctx, ownerState: { ...ctx.ownerState, coins: (ctx.ownerState.coins ?? 0) + coinCountGCAD } }, `コイン+${coinCountGCAD}`);
    // 手札がなければそのまま終了
    if (ctxCoinGCAD.ownerState.hand.length === 0) return done(ctxCoinGCAD);
    // インタラクティブ捨て（SELECT_TARGET）
    const actualDiscardGCAD = Math.min(discardCountGCAD, ctxCoinGCAD.ownerState.hand.length);
    const discardActionGCAD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: actualDiscardGCAD } };
    return selectOrInteract(ctxCoinGCAD.ownerState.hand, actualDiscardGCAD, false, 'self_hand', discardActionGCAD as EffectAction, undefined, ctxCoinGCAD);
  }
  // 自シグニのパワーに等しく相手シグニのパワーを設定
  if (stub.id === 'POWER_EQUAL_TO_SELF_POWER') {
    const selfPwPETS = ctx.effectivePowers?.get(ctx.sourceCardNum ?? '')
      ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Power ?? '0', 10);
    const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards
      : [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    const modsPETS = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of targets) {
      const oppPwPETS = ctx.effectivePowers?.get(cn) ?? parseInt(ctx.cardMap.get(cn)?.Power ?? '0', 10);
      if (selfPwPETS !== oppPwPETS) modsPETS.push({ cardNum: cn, delta: selfPwPETS - oppPwPETS });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPETS } },
      `相手シグニのパワーを${selfPwPETS}に設定`));
  }
  // 前のシグニのパワーと等しく設定（自シグニを前シグニのパワーに）
  if (stub.id === 'POWER_EQUALS_FRONT_SIGNI') {
    const srcZonePEFS = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnPEFS = srcZonePEFS >= 0 ? ctx.otherState.field.signi[srcZonePEFS]?.at(-1) : undefined;
    if (!frontCnPEFS || !ctx.sourceCardNum) return done(addLog(ctx, '前シグニなし（POWER_EQUALS_FRONT_SIGNI）'));
    const frontPwPEFS = ctx.effectivePowers?.get(frontCnPEFS) ?? parseInt(ctx.cardMap.get(frontCnPEFS)?.Power ?? '0', 10);
    const selfPwPEFS = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? parseInt(ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0', 10);
    const deltaPEFS = frontPwPEFS - selfPwPEFS;
    if (deltaPEFS !== 0) {
      const modsPEFS = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPEFS }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPEFS } },
        `パワーを前シグニの${frontPwPEFS}に設定`));
    }
    return done(addLog(ctx, `パワー既に${frontPwPEFS}（前シグニと同値）`));
  }
  // 捨てたシグニのパワーだけ自場シグニ1体をパワーアップ（SELECT自場→自己再帰）
  if (stub.id === 'POWER_UP_BY_DISCARDED_SIGNI_POWER') {
    const trashedCnPUBDP = ctx.ownerState.trash.at(-1) ?? '';
    const trashedPwPUBDP = parseInt(ctx.cardMap.get(trashedCnPUBDP)?.Power ?? '0') || 0;
    if (trashedPwPUBDP <= 0) return done(addLog(ctx, `パワーアップ不可（トラッシュシグニパワー${trashedPwPUBDP}）`));
    // 自場シグニが選択済みなら適用
    const fieldTargetPUBDP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (fieldTargetPUBDP) {
      const modsPUBDP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: fieldTargetPUBDP, delta: trashedPwPUBDP }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPUBDP } },
        `${ctx.cardMap.get(fieldTargetPUBDP)?.CardName ?? fieldTargetPUBDP}のパワー+${trashedPwPUBDP}（捨てたシグニのパワー）`));
    }
    // SELECT 1 own field signi
    const ownCandsPUBDP = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (ownCandsPUBDP.length === 0) return done(addLog(ctx, '自場にシグニなし（POWER_UP_BY_DISCARDED_SIGNI_POWER）'));
    const contPUBDP: StubAction = { type: 'STUB', id: 'POWER_UP_BY_DISCARDED_SIGNI_POWER' };
    const noopPUBDP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(ownCandsPUBDP, 1, false, 'self_field', noopPUBDP as EffectAction, contPUBDP as EffectAction, ctx);
  }
  // シャッフル後に全シグニのパワーを半減
  if (stub.id === 'SHUFFLE_DECK_POWER_HALF') {
    const shuffledSDP = [...ctx.ownerState.deck].sort(() => Math.random() - 0.5);
    const modsSDHP = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const curPw = ctx.effectivePowers?.get(top) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0', 10);
      modsSDHP.push({ cardNum: top, delta: -Math.floor(curPw / 2) });
    }
    return done(addLog(
      { ...ctx, ownerState: { ...ctx.ownerState, deck: shuffledSDP }, otherState: { ...ctx.otherState, temp_power_mods: modsSDHP } },
      `デッキシャッフル→全相手シグニパワー半減`));
  }
  // 公開したシグニをフィールドに出し、残りをトラッシュ
  if (stub.id === 'REVEALED_SIGNI_TO_FIELD_REST_TRASH') {
    const revealedRSTF = ctx.lastProcessedCards ?? [];
    if (revealedRSTF.length === 0) return done(addLog(ctx, '公開カードなし（REVEALED_SIGNI_TO_FIELD_REST_TRASH）'));
    const signiRSTF = revealedRSTF.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    const nonSigniRSTF = revealedRSTF.filter(cn => ctx.cardMap.get(cn)?.Type !== 'シグニ');
    let newOwnerRSTF = ctx.ownerState;
    // シグニをフィールドへ（空きゾーンへ順番に配置）
    const fieldRSTF = [...newOwnerRSTF.field.signi] as (string[] | null)[];
    for (const cn of signiRSTF) {
      const emptyZoneRSTF = fieldRSTF.findIndex(z => !z || z.length === 0);
      if (emptyZoneRSTF >= 0) {
        fieldRSTF[emptyZoneRSTF] = [cn];
        const di = newOwnerRSTF.deck.indexOf(cn);
        if (di >= 0) {
          const newDeckRSTF = [...newOwnerRSTF.deck];
          newDeckRSTF.splice(di, 1);
          newOwnerRSTF = { ...newOwnerRSTF, deck: newDeckRSTF };
        }
      } else {
        nonSigniRSTF.push(cn);
      }
    }
    newOwnerRSTF = { ...newOwnerRSTF, field: { ...newOwnerRSTF.field, signi: fieldRSTF } };
    // 残りをトラッシュへ
    for (const cn of nonSigniRSTF) {
      const di = newOwnerRSTF.deck.indexOf(cn);
      if (di >= 0) {
        const newDeckRSTF = [...newOwnerRSTF.deck];
        newDeckRSTF.splice(di, 1);
        newOwnerRSTF = { ...newOwnerRSTF, deck: newDeckRSTF, trash: [...newOwnerRSTF.trash, cn] };
      }
    }
    return done(addLog({ ...ctx, ownerState: newOwnerRSTF },
      `公開シグニ${signiRSTF.length}体→フィールド、非シグニ${nonSigniRSTF.length}枚→トラッシュ`));
  }
  // 相手シグニをデッキのN番目に挿入
  if (stub.id === 'OPP_SIGNI_TO_DECK_NTH') {
    const targetOSTDN = (ctx.lastProcessedCards ?? [])[0];
    if (!targetOSTDN) return done(addLog(ctx, '対象なし（OPP_SIGNI_TO_DECK_NTH）'));
    // 🆕**§5.3 `O-60` 第36バッチ（2026-09-03）＝位置は payload（`oppSigniToDeckNth.position`）で受け取る。**
    // 🔴旧実装は `EffectText + BurstText` に `/デッキの上から([０-９\d]*)番目/` を当てていたが、
    //   原文は「**三**番目」＝**漢数字**なので当たらず、`nth` が **0（＝一番上）** に落ちていた
    //   （＝「デッキの奥へ送る」意図と真逆に、次のドローで戻ってくる位置に置いていた）。
    // ⚠**payload が無ければ何もしない**（fail-closed）。
    const posOSTDN = stub.oppSigniToDeckNth?.position;
    if (posOSTDN === undefined) return done(addLog(ctx, 'デッキN番目に置く：位置が無いため何もしない'));
    const nthOSTDN = posOSTDN - 1;
    const removedOSTDN = removeFromField(targetOSTDN, ctx.otherState);
    const newOtherDeckOSTDN = [...removedOSTDN.deck];
    newOtherDeckOSTDN.splice(Math.max(0, nthOSTDN), 0, targetOSTDN);
    return done(addLog({ ...ctx, otherState: { ...removedOSTDN, deck: newOtherDeckOSTDN } },
      `${ctx.cardMap.get(targetOSTDN)?.CardName ?? targetOSTDN}→相手デッキ上から${nthOSTDN + 1}番目`));
  }
  // 相手シグニが退場時にエナではなくトラッシュへ（フラグ設定）
  if (stub.id === 'OPP_SIGNI_LEAVE_TO_TRASH') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, banish_redirect: true } },
      '相手シグニのバニッシュ先→トラッシュに変更'));
  }
  // 相手より手札が少ない場合、相手の手札をデッキ下へ
  if (stub.id === 'OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND') {
    const selfHandCntOHTDB = ctx.ownerState.hand.length;
    const oppHandCntOHTDB = ctx.otherState.hand.length;
    const excessOHTDB = oppHandCntOHTDB - selfHandCntOHTDB;
    if (excessOHTDB <= 0) return done(addLog(ctx, `相手手札${oppHandCntOHTDB}枚≤自手札${selfHandCntOHTDB}枚（条件未達）`));
    // 相手は超過枚数分を選択してデッキ下へ（1枚なら自動）
    if (excessOHTDB >= oppHandCntOHTDB) {
      // 全手札→デッキ下（超過が手札枚数以上の場合）
      const newOtherOHTDB = { ...ctx.otherState, hand: [], deck: [...ctx.otherState.deck, ...ctx.otherState.hand] };
      return done(addLog({ ...ctx, otherState: newOtherOHTDB }, `相手手札全${oppHandCntOHTDB}枚→デッキ下`));
    }
    return needsInteraction(addLog(ctx, `相手は手札を${excessOHTDB}枚選んでデッキ下に置く`), {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.hand,
      count: excessOHTDB,
      optional: false,
      targetScope: 'opp_hand',
      opponentResponds: true,
      thenAction: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
      continuation: ({ type: 'STUB', id: 'INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N: 選択した相手手札をデッキ下へ
  if (stub.id === 'INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N') {
    const selectedIOHTDBN = ctx.lastProcessedCards ?? [];
    if (selectedIOHTDBN.length === 0) return done(addLog(ctx, 'スキップ'));
    const newHandIOHTDBN = ctx.otherState.hand.filter(c => !selectedIOHTDBN.includes(c));
    const newOtherIOHTDBN = { ...ctx.otherState, hand: newHandIOHTDBN, deck: [...ctx.otherState.deck, ...selectedIOHTDBN] };
    return done(addLog({ ...ctx, otherState: newOtherIOHTDBN }, `相手手札${selectedIOHTDBN.length}枚→デッキ下`));
  }
  // トラッシュから3ゾーンへ分配（lastProcessedCards→各ゾーンへ）
  // TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH: トラッシュから3枚選んでエナ/手札/デッキ下に分配
  if (stub.id === 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH') {
    if (isOwnTrashMoveLocked('self', ctx)) return done(addLog(ctx, 'トラッシュのカードは自分の効果で移動できない'));
    if ((ctx.lastProcessedCards?.length ?? 0) >= 3) {
      const [toEna, toHand, toDeck] = ctx.lastProcessedCards!;
      let sTZDFT = ctx.ownerState;
      sTZDFT = { ...sTZDFT, trash: sTZDFT.trash.filter(c => c !== toEna && c !== toHand && c !== toDeck) };
      sTZDFT = { ...sTZDFT, energy: [...sTZDFT.energy, toEna], hand: [...sTZDFT.hand, toHand], deck: [...sTZDFT.deck, toDeck] };
      const nameTZDFT = [toEna, toHand, toDeck].map(c => ctx.cardMap.get(c)?.CardName ?? c).join('・');
      return done(addLog({ ...ctx, ownerState: sTZDFT },
        `${nameTZDFT}→エナ/手札/デッキ下`));
    }
    if (ctx.ownerState.trash.length < 3) {
      return done(addLog(ctx, 'トラッシュが3枚未満（TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH）'));
    }
    // 自己再帰 thenAction は resumeSelectTarget の個別適用ループと非互換（lastProcessedCards が1枚ずつになり
    // 「3枚一括」の前提が崩れて同一 SELECT_TARGET を再発行し続ける）＝thenAction は no-op にし
    // continuation で3枚一括受け取り（INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N と同型・タスク12(xii)）
    const contTZDFT: StubAction = { type: 'STUB', id: 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH' };
    const noopTZDFT: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'トラッシュから3枚選択（1枚目→エナ・2枚目→手札・3枚目→デッキ下）'), {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.trash, count: 3, optional: false,
      targetScope: 'self_trash', thenAction: noopTZDFT as EffectAction,
      continuation: contTZDFT as EffectAction,
    });
  }
  // 自・相手を両方エナへ（ゾーン交換系）
  if (stub.id === 'TRADE_SELF_AND_OPP_TO_ENERGY') {
    const selfCnTSAOTE = ctx.sourceCardNum;
    const oppTargetTSAOTE = (ctx.lastProcessedCards ?? [])[0];
    if (!selfCnTSAOTE) return done(addLog(ctx, '対象なし（TRADE_SELF_AND_OPP_TO_ENERGY）'));
    let newOwnerTSAOTE = ctx.ownerState;
    if (ctx.ownerState.field.signi.some(s => s?.at(-1) === selfCnTSAOTE)) {
      const removedTSAOTE = removeFromField(selfCnTSAOTE, newOwnerTSAOTE);
      newOwnerTSAOTE = { ...removedTSAOTE, energy: [...removedTSAOTE.energy, selfCnTSAOTE] };
    }
    let newOtherTSAOTE = ctx.otherState;
    if (oppTargetTSAOTE && ctx.otherState.field.signi.some(s => s?.at(-1) === oppTargetTSAOTE)) {
      const removedOppTSAOTE = removeFromField(oppTargetTSAOTE, newOtherTSAOTE);
      newOtherTSAOTE = { ...removedOppTSAOTE, energy: [...removedOppTSAOTE.energy, oppTargetTSAOTE] };
    }
    return done(addLog({ ...ctx, ownerState: newOwnerTSAOTE, otherState: newOtherTSAOTE },
      `自・相手シグニをエナゾーンへ`));
  }
  // 自シグニをデッキトップへ（フィールドから退場）
  if (stub.id === 'SELF_TO_DECK_TOP') {
    const selfCnSTDT = ctx.sourceCardNum;
    if (!selfCnSTDT || !ctx.ownerState.field.signi.some(s => s?.at(-1) === selfCnSTDT))
      return done(addLog(ctx, '対象がフィールドにいない（SELF_TO_DECK_TOP）'));
    const removedSTDT = removeFromField(selfCnSTDT, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedSTDT, deck: [selfCnSTDT, ...removedSTDT.deck] } },
      `${ctx.cardMap.get(selfCnSTDT)?.CardName ?? selfCnSTDT}をデッキトップへ`));
  }
  // 相手シグニをゲートを通じてデッキへ（バウンス）
  if (stub.id === 'OPP_SIGNI_TO_DECK_BY_GATE') {
    const targetOSTDBG = (ctx.lastProcessedCards ?? [])[0];
    if (!targetOSTDBG) return done(addLog(ctx, '対象なし（OPP_SIGNI_TO_DECK_BY_GATE）'));
    const removedOSTDBG = removeFromField(targetOSTDBG, ctx.otherState);
    const newDeckOSTDBG = [...removedOSTDBG.deck, targetOSTDBG];
    return done(addLog({ ...ctx, otherState: { ...removedOSTDBG, deck: newDeckOSTDBG } },
      `${ctx.cardMap.get(targetOSTDBG)?.CardName ?? targetOSTDBG}→相手デッキ下`));
  }
  // デッキ上のシグニをフィールドへ（最初のシグニを配置）
  if (stub.id === 'LOOK_TOP_SIGNI_TO_FIELD') {
    const topNLTSTF = 3;
    const topCardsLTSTF = ctx.ownerState.deck.slice(0, topNLTSTF);
    const firstSigniLTSTF = topCardsLTSTF.find(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (!firstSigniLTSTF) return done(addLog(ctx, `デッキ上${topNLTSTF}枚にシグニなし`));
    const emptyZoneLTSTF = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (emptyZoneLTSTF < 0) return done(addLog(ctx, '空きシグニゾーンなし'));
    const newDeckLTSTF = ctx.ownerState.deck.filter(cn => cn !== firstSigniLTSTF);
    const newFieldLTSTF = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newFieldLTSTF[emptyZoneLTSTF] = [firstSigniLTSTF];
    // 残りはデッキ下へ（トラッシュへのバリアント）
    const restLTSTF = topCardsLTSTF.filter(cn => cn !== firstSigniLTSTF);
    const restDeckLTSTF = newDeckLTSTF.filter(cn => !restLTSTF.includes(cn));
    const finalTrashLTSTF = [...ctx.ownerState.trash, ...restLTSTF];
    return done(addLog({ ...ctx, ownerState: {
      ...ctx.ownerState, deck: restDeckLTSTF, trash: finalTrashLTSTF,
      field: { ...ctx.ownerState.field, signi: newFieldLTSTF },
    }}, `デッキ上から${ctx.cardMap.get(firstSigniLTSTF)?.CardName ?? firstSigniLTSTF}→フィールド`));
  }
  // 追加ターンを獲得（ログのみ、ゲームエンジン実装が必要）
  // GAIN_EXTRA_TURN: 追加ターンフラグをセット（BattleScreen側でターン終了時に追加ターンを付与）
  if (stub.id === 'GAIN_EXTRA_TURN') {
    // 🆕**誰が得るかは payload**（§5.3 `O-60` 第10バッチ・2026-08-29）。
    // 🔴旧実装は**カード全文**を `/対戦相手は…追加の…ターンを得る/` で読んでいた＝
    //   同じカードの別能力にその一文があれば `あなたは…` の追加ターンまで相手へ渡る形だった。
    // ⚠省略＝`self`（live 5効果中4が自分側）。
    if (stub.extraTurnOwner === 'opponent') {
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, extra_turn: true } }, '対戦相手が追加ターンを獲得'));
    }
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, extra_turn: true } }, '追加ターンを獲得'));
  }
  // SKIP_NEXT_TURN: 次の自分のターンを丸ごと飛ばす（`WD20-006-E1`・§6.4 O-3 続き491）。
  // ⚠`GAIN_EXTRA_TURN` の裏返し＝消費は `resolveTurnHandover` の1点だけ。
  //   原文の母集団は「次のあなたのターンをスキップする」1件なので owner は self 固定でよい。
  if (stub.id === 'SKIP_NEXT_TURN') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, skip_next_turn: true } }, '次の自分のターンをスキップする'));
  }
  // ガードアイコン付与（手札のシグニに付与: フラグ設定）
  if (stub.id === 'HAND_SIGNI_HAS_GUARD_ICON') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, hand_signi_guard_enabled: true } },
      '手札のシグニすべてにガードアイコン付与'));
  }
  // FIELD_ENERGY_SIGNI_GAIN_COLOR: CONTINUOUS効果はeffectEngineで処理済み（no-op）
  if (stub.id === 'FIELD_ENERGY_SIGNI_GAIN_COLOR') {
    return done(ctx);
  }
  // 相手が宣言した色に応じてエナをトラッシュ（相手の宣言が必要→スキップ）
  // DECLARE_COLOR_COND_ENERGY_TRASH: 色を宣言し、エナから宣言色のカードを任意でトラッシュ
  if (stub.id === 'DECLARE_COLOR_COND_ENERGY_TRASH' || stub.id === 'OPP_DECLARE_COLOR_COND_ENERGY_TRASH') {
    if (ctx.ownerState.energy.length === 0) return done(addLog(ctx, 'エナなし'));
    const noopDCCET: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    const setColorDCCET = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_DCCE_TRASH_COLOR', value: c });
    const colorOptsDCCET = ['白', '赤', '青', '緑', '黒'].map(c => ({
      id: `dcce_${c}`, label: `${c}を宣言してエナトラッシュ`, action: setColorDCCET(c) as EffectAction, available: true,
    }));
    colorOptsDCCET.push({ id: 'dcce_skip', label: 'しない', action: noopDCCET as EffectAction, available: true });
    return needsInteraction(addLog(ctx, '色を宣言してエナトラッシュしますか？'), {
      type: 'CHOOSE', options: colorOptsDCCET, count: 1,
    });
  }
  // INTERNAL_DCCE_TRASH_COLOR: 宣言色のエナ1枚をトラッシュ
  if (stub.id === 'INTERNAL_DCCE_TRASH_COLOR') {
    const colorDCCE = typeof stub.value === 'string' ? stub.value : '';
    const matchingDCCE = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Color?.includes(colorDCCE) ?? false;
    });
    if (matchingDCCE.length === 0) return done(addLog(ctx, `${colorDCCE}エナなし`));
    if (matchingDCCE.length === 1) {
      const cn = matchingDCCE[0];
      const newOwnerDCCE: PlayerState = { ...ctx.ownerState, energy: ctx.ownerState.energy.filter(c => c !== cn), trash: [...ctx.ownerState.trash, cn] };
      return done(addLog({ ...ctx, ownerState: newOwnerDCCE }, `${colorDCCE}エナ→トラッシュ`));
    }
    return selectOrInteract(matchingDCCE, 1, false, 'self_energy',
      ({ type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 1 } } as TrashAction) as EffectAction,
      undefined, addLog(ctx, `${colorDCCE}エナを1枚選んでトラッシュ`));
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY → 手札選択後処理
  if (stub.id === 'INTERNAL_TRASH_TO_HAND') {
    const targetITTH = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetITTH) return done(ctx);
    const ti = ctx.ownerState.trash.indexOf(targetITTH);
    if (ti < 0) return done(ctx);
    const newTrashITTH = [...ctx.ownerState.trash]; newTrashITTH.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashITTH, hand: [...ctx.ownerState.hand, targetITTH] } },
      `トラッシュ：${ctx.cardMap.get(targetITTH)?.CardName ?? targetITTH}→手札`));
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY → エナ選択後処理
  if (stub.id === 'INTERNAL_TRASH_TO_ENERGY') {
    const targetITTE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetITTE) return done(ctx);
    const ti = ctx.ownerState.trash.indexOf(targetITTE);
    if (ti < 0) return done(ctx);
    const newTrashITTE = [...ctx.ownerState.trash]; newTrashITTE.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashITTE, energy: [...ctx.ownerState.energy, targetITTE] } },
      `トラッシュ：${ctx.cardMap.get(targetITTE)?.CardName ?? targetITTE}→エナゾーン`));
  }
  // この方法で裏向きにしたカードの元ゾーンがターン終了時に埋まっていればトラッシュ
  if (stub.id === 'TRASH_IF_ZONE_OCCUPIED') {
    const targetsTIZO = ctx.lastProcessedCards ?? [];
    const ownerTIZO = markTurnEndFacedownTrashIfOccupied(ctx.ownerState, targetsTIZO);
    const otherTIZO = markTurnEndFacedownTrashIfOccupied(ctx.otherState, targetsTIZO);
    return done(addLog({ ...ctx, ownerState: ownerTIZO, otherState: otherTIZO },
      targetsTIZO.length > 0 ? 'ターン終了時：元ゾーン占有時トラッシュを予約' : '占有時トラッシュ対象なし'));
  }
  // 条件付きトラッシュ→エナ（センタールリグ名条件付き）
  if (stub.id === 'CONDITIONAL_TRASH_TO_ENERGY') {
    const srcCTTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCTTE = srcCTTE ? (srcCTTE.EffectText ?? '') + ' ' + (srcCTTE.BurstText ?? '') : '';
    // 「センタールリグが＜X＞の場合」条件チェック
    const lrigCondM = txtCTTE.match(/あなたのセンタールリグが＜([^＞]+)＞の場合/);
    if (lrigCondM) {
      const reqLrigClass = lrigCondM[1];
      const centerLrig = ctx.ownerState.field.lrig.at(-1);
      const lrigCard = centerLrig ? ctx.cardMap.get(centerLrig) : undefined;
      const lrigOk = lrigCard && ((lrigCard.Story ?? '').includes(reqLrigClass) || (lrigCard.CardClass ?? '').includes(reqLrigClass) || (lrigCard.CardName ?? '').includes(reqLrigClass));
      if (!lrigOk) return done(addLog(ctx, `センタールリグが＜${reqLrigClass}＞でない（条件未達）`));
    }
    const targetCTTE = ctx.sourceCardNum && ctx.ownerState.trash.includes(ctx.sourceCardNum)
      ? ctx.sourceCardNum
      : (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1);
    if (!targetCTTE) return done(addLog(ctx, 'トラッシュにカードなし（CONDITIONAL_TRASH_TO_ENERGY）'));
    const ti = ctx.ownerState.trash.indexOf(targetCTTE);
    if (ti < 0) return done(addLog(ctx, '対象がトラッシュにない'));
    const newTrashCTTE = [...ctx.ownerState.trash]; newTrashCTTE.splice(ti, 1);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashCTTE, energy: [...ctx.ownerState.energy, targetCTTE] } },
      `トラッシュ：${ctx.cardMap.get(targetCTTE)?.CardName ?? targetCTTE}→エナゾーン`));
  }
  // トラッシュからクラスシグニを手札かエナへ選択
  if (stub.id === 'TRASH_CLASS_TO_HAND_OR_ENERGY') {
    // トラッシュからクラスカードを複数選択 → 1枚まで手札、残りエナゾーンへ
    const srcTCTHOE2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTCTHOE2 = srcTCTHOE2 ? (srcTCTHOE2.EffectText ?? '') + ' ' + (srcTCTHOE2.BurstText ?? '') : '';
    const toHWTCTHOE2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMTCTHOE2 = txtTCTHOE2.match(/＜([^＞]+)＞/);
    const targetClassTCTHOE2 = classMTCTHOE2?.[1];
    const countMTCTHOE2 = txtTCTHOE2.match(/([０-９\d]+)枚まで対象/);
    const maxCountTCTHOE2 = countMTCTHOE2 ? parseInt(toHWTCTHOE2(countMTCTHOE2[1])) : 1;
    const candsTCTHOE2 = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return (!targetClassTCTHOE2 || (c?.CardClass ?? '').includes(targetClassTCTHOE2));
    });
    if (candsTCTHOE2.length === 0) return done(addLog(ctx, 'トラッシュに対象なし（TRASH_CLASS_TO_HAND_OR_ENERGY）'));
    const contTCTHOE2: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CLASS_SPLIT' };
    return needsInteraction(addLog(ctx, `トラッシュから${targetClassTCTHOE2 ?? 'カード'}を${maxCountTCTHOE2}枚まで選択`), {
      type: 'SELECT_TARGET', candidates: candsTCTHOE2, count: maxCountTCTHOE2, optional: false,
      targetScope: 'self_trash', thenAction: contTCTHOE2 as EffectAction,
    });
  }
  // INTERNAL_TRASH_CLASS_SPLIT: 選択カードを手札（1枚）＋エナ（残り）に振り分け
  if (stub.id === 'INTERNAL_TRASH_CLASS_SPLIT') {
    const selectedITCS = ctx.lastProcessedCards ?? [];
    if (selectedITCS.length === 0) return done(ctx);
    let newOwnerITCS = ctx.ownerState;
    const remaining = [...newOwnerITCS.trash];
    const toProcess: string[] = [];
    for (const cn of selectedITCS) {
      const idx = remaining.indexOf(cn);
      if (idx >= 0) { remaining.splice(idx, 1); toProcess.push(cn); }
    }
    newOwnerITCS = { ...newOwnerITCS, trash: remaining };
    if (toProcess.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerITCS }, '対象カードなし'));
    // 1枚目→手札、残り→エナゾーン
    const [handCard, ...enaCards] = toProcess;
    newOwnerITCS = {
      ...newOwnerITCS,
      hand: [...newOwnerITCS.hand, handCard],
      energy: [...newOwnerITCS.energy, ...enaCards],
    };
    const names = [
      `${ctx.cardMap.get(handCard)?.CardName ?? handCard}→手札`,
      ...enaCards.map(cn => `${ctx.cardMap.get(cn)?.CardName ?? cn}→エナ`),
    ].join('、');
    return done(addLog({ ...ctx, ownerState: newOwnerITCS }, names));
  }
  // 「対戦相手のルリグデッキからカードを１枚**見ないで選び**公開する。
  //   それがルリグでない場合、それをルリグトラッシュに置く。」（`PR-469`③・§6.4 O-11）
  // ⚠既存の `OPP_LRIG_DECK_TO_LRIG_TRASH` は**相手が自分で選ぶ**（`opponentResponds`）別文型＝流用できない。
  //   こちらは「見ないで選び」＝ランダム。公開したうえで**ルリグでないときだけ**ルリグトラッシュへ送る。
  // ⚠行先は相手の `lrig_trash`（ルリグデッキのカードはルリグトラッシュへ行く）。
  if (stub.id === 'OPP_LRIG_DECK_BLIND_REVEAL') {
    const deckOBR = ctx.otherState.lrig_deck ?? [];
    if (deckOBR.length === 0) return done(addLog({ ...ctx, lastProcessedCards: [] }, '対戦相手のルリグデッキにカードがない'));
    const pickedOBR = deckOBR[Math.floor(Math.random() * deckOBR.length)];
    const cardOBR = ctx.cardMap.get(getCardNum(pickedOBR));
    const nameOBR = cardOBR?.CardName ?? pickedOBR;
    const isLrigOBR = (cardOBR?.Type ?? '').startsWith('ルリグ');
    if (isLrigOBR) {
      return done(addLog({ ...ctx, lastProcessedCards: [pickedOBR] },
        `対戦相手のルリグデッキから${nameOBR}を見ないで選び公開した（ルリグなのでそのまま戻る）`));
    }
    return done(addLog({
      ...ctx,
      otherState: {
        ...ctx.otherState,
        lrig_deck: deckOBR.filter(n => n !== pickedOBR),
        lrig_trash: [...ctx.otherState.lrig_trash, pickedOBR],
      },
      lastProcessedCards: [pickedOBR],
    }, `対戦相手のルリグデッキから${nameOBR}を見ないで選び公開し、ルリグではないのでルリグトラッシュに置いた`));
  }
  // ルリグデッキにカードを追加（非ルリグをルリグトラッシュへ）
  if (stub.id === 'NON_LRIG_TO_LRIG_TRASH') {
    const target = (ctx.lastProcessedCards ?? [])[0];
    if (!target) return done(addLog(ctx, '対象なし（NON_LRIG_TO_LRIG_TRASH）'));
    // フィールドまたはトラッシュから除去してルリグトラッシュへ
    let newOwnerNLTLT = ctx.ownerState;
    if (newOwnerNLTLT.field.signi.some(s => s?.at(-1) === target)) {
      newOwnerNLTLT = removeFromField(target, newOwnerNLTLT);
    } else {
      const ti = newOwnerNLTLT.trash.indexOf(target);
      if (ti >= 0) { const t = [...newOwnerNLTLT.trash]; t.splice(ti, 1); newOwnerNLTLT = { ...newOwnerNLTLT, trash: t }; }
    }
    newOwnerNLTLT = { ...newOwnerNLTLT, lrig_trash: [...newOwnerNLTLT.lrig_trash, target] };
    return done(addLog({ ...ctx, ownerState: newOwnerNLTLT },
      `${ctx.cardMap.get(target)?.CardName ?? target}→ルリグトラッシュ`));
  }
  // TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY: 対戦相手の場／エナから「カード名に《X》を含む」カードを一掃
  // 🆕**§5.3 `O-60` 第34バッチ（2026-09-03）＝カード名とゾーンは payload で受け取る。**
  // 🔴旧実装は `/「([^」]+)」/`（**かぎ括弧**）で名前を取ろうとしていたが、原文の綴りは《》なので
  //   **1本も当たらず恒久 no-op** だった。さらに照合が**完全一致**で、原文の「**含む**」（部分一致）と別物。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY') {
    const specTABN = stub.trashAllByName;
    if (!specTABN) return done(addLog(ctx, '名前一致の一掃：対象の指定が無いため何もしない'));
    const hitTABN = (cn: string) => (ctx.cardMap.get(getCardNum(cn))?.CardName ?? '').includes(specTABN.nameContains);
    let newOtherTABN = ctx.otherState;
    let countTABN = 0;
    if (specTABN.zones.includes('field')) {
      for (let zi = 0; zi < 3; zi++) {
        const top = newOtherTABN.field.signi[zi]?.at(-1);
        if (!top || !hitTABN(top)) continue;
        const removedTABN = removeFromField(top, newOtherTABN);
        newOtherTABN = { ...removedTABN, trash: [...removedTABN.trash, top] };
        countTABN++;
      }
    }
    if (specTABN.zones.includes('energy')) {
      const enaToTrashTABN = newOtherTABN.energy.filter(hitTABN);
      countTABN += enaToTrashTABN.length;
      newOtherTABN = {
        ...newOtherTABN,
        energy: newOtherTABN.energy.filter(cn => !hitTABN(cn)),
        trash: [...newOtherTABN.trash, ...enaToTrashTABN],
      };
    }
    return done(addLog({ ...ctx, otherState: newOtherTABN },
      `カード名に《${specTABN.nameContains}》を含むカード${countTABN}枚を対戦相手の${specTABN.zones.join('・')}からトラッシュ`));
  }
  // === バッチ4: デッキ/手札/エナ操作 ===
  // DRAW: N枚ドロー
  if (stub.id === 'DRAW') {
    // §6.4 O-20: カード全文だと別能力の「カードを２枚引く」を拾う（`WXDi-P10-006` は E2 の枚数が E3 に載っていた）。
    const txtDRW = sourceAbilityText(ctx);
    const toHWDRW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDRW = txtDRW.match(/カードを([０-９\d]+)枚引く/);
    const drawCountDRW = mDRW ? parseInt(toHWDRW(mDRW[1])) : 1;
    const sDRW = ctx.ownerState;
    const canDrawDRW = Math.min(drawCountDRW, sDRW.deck.length);
    const newSDRW: PlayerState = { ...sDRW, hand: [...sDRW.hand, ...sDRW.deck.slice(0, canDrawDRW)], deck: sDRW.deck.slice(canDrawDRW) };
    return done(addLog({ ...ctx, ownerState: newSDRW }, `${drawCountDRW}枚ドロー`));
  }
  // DRAW_DISCARD_COUNT_PLUS_N: 捨てた枚数+Nドロー
  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDDCPN = txtDDCPN.match(/枚数に([０-９\d]+)を加えた/);
    const plusN = mDDCPN ? parseInt(toHWDDCPN(mDDCPN[1])) : 1;
    const discardCount = ctx.lastProcessedCards?.length ?? 0;
    const drawCount = discardCount + plusN;
    const sDDCPN = ctx.ownerState;
    const canDraw = Math.min(drawCount, sDDCPN.deck.length);
    const newSDDCPN: PlayerState = { ...sDDCPN, hand: [...sDDCPN.hand, ...sDDCPN.deck.slice(0, canDraw)], deck: sDDCPN.deck.slice(canDraw) };
    return done(addLog({ ...ctx, ownerState: newSDDCPN }, `捨て${discardCount}枚+${plusN}→${canDraw}枚ドロー`));
  }
  // LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: デッキ上N枚を確認して並べ替え
  if (stub.id === 'LOOK_TOP_N' || stub.id === 'LOOK_TOP_SORT' || stub.id === 'LOOK_TOP_COLOR_SORT' || stub.id === 'LOOK_TOP_BY_LIFE_COUNT') {
    const srcLTN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTN = srcLTN ? (srcLTN.EffectText ?? '') + ' ' + (srcLTN.BurstText ?? '') : '';
    const toHWLTN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    let countLTN = 3;
    if (stub.id === 'LOOK_TOP_BY_LIFE_COUNT') {
      countLTN = ctx.ownerState.life_cloth.length;
    } else {
      const mLTN = txtLTN.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
      if (mLTN) countLTN = parseInt(toHWLTN(mLTN[1]));
    }
    const visLTN = ctx.ownerState.deck.slice(0, Math.min(countLTN, ctx.ownerState.deck.length));
    if (visLTN.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSLTN: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTN.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTN }, `デッキ上${visLTN.length}枚を確認`),
      { type: 'LOOK_AND_REORDER', cards: visLTN, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top', private: true },
    );
  }
  // LOOK_TOP_ONE_RETURN_REST_BOTTOM: デッキ上N枚を確認し1枚をトップ・残りをデッキ下に
  // LOOK_TOP_ONE_RETURN_REST_BOTTOM: デッキ上N枚を見て1枚をトップへ・残りを好きな順番でデッキ下へ
  // 🆕**§5.3 `O-60` 第27バッチ（2026-09-03）＝見る枚数は payload で受け取る。**
  // 🔴旧実装は `EffectText + BurstText` に `/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/` を当てていたが、
  //   原文は「デッキの上から**カードを**２枚見る」なので当たらず**既定 2** に落ちていた。
  //   しかもこの効果は `CHOOSE` の片方の枝なので、**カード全文には別の枝の数字も並ぶ**（先頭一致で拾う）。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'LOOK_TOP_ONE_RETURN_REST_BOTTOM') {
    const specLTORB = stub.lookTopReturnRestBottom;
    if (!specLTORB) return done(addLog(ctx, 'デッキ上の確認：枚数が無いため何もしない'));
    const visLTORB = ctx.ownerState.deck.slice(0, Math.min(specLTORB.lookCount, ctx.ownerState.deck.length));
    if (visLTORB.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSLTORB: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTORB.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTORB }, `デッキ上${visLTORB.length}枚を確認（1枚をトップへ・残りはデッキ下へ）`),
      { type: 'LOOK_AND_REORDER', cards: visLTORB, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'first_top_rest_bottom', private: true },
    );
  }
  // 🏁**`LOOK_TOP_SPELLS_TO_HAND` は撤去した**（2026-09-03 §5.3 `O-60` 第27バッチ）＝**live 0件の死んだ枝**。
  //   唯一の該当カード（`WX10-033-BURST`）は parser の手前で typed な `REVEAL_AND_PICK{filter:{cardType:'スペル'},
  //   pickCount:'ALL'}` に解けており、この STUB へは1件も来ていなかった。
  //   （第5バッチの教訓＝**死んだ枝は catch-all の温床**。同じ壊れた regex を抱えたまま残さない。）
  // LIFE_TO_HAND_OPTIONAL: ライフクロス1枚を手札に加える
  if (stub.id === 'LIFE_TO_HAND_OPTIONAL') {
    const sLTH = ctx.ownerState;
    if (sLTH.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし'));
    const doLTH: StubAction = { type: 'STUB', id: 'INTERNAL_LIFE_TO_HAND_DO' };
    const skipLTH: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'ライフクロス1枚を手札に加えてもよい'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'do',   label: 'ライフクロスを手札に加える', action: doLTH   as EffectAction, available: true },
        { id: 'skip', label: 'そうしない',                 action: skipLTH as EffectAction, available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_LIFE_TO_HAND_DO') {
    const sLTH = ctx.ownerState;
    if (sLTH.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし'));
    const topLife = sLTH.life_cloth.at(-1)!;
    const newSLTH: PlayerState = { ...sLTH, life_cloth: sLTH.life_cloth.slice(0, -1), hand: [...sLTH.hand, topLife] };
    return done(addLog({ ...ctx, ownerState: newSLTH }, 'ライフクロス1枚を手札に加えた'));
  }
  // OPP_TRASH_TO_DECK_TOP は line 1211 の handler で処理済み（dead code 削除）
  // REMOVE_OPP_MULTI_ENA / REMOVE_OPP_MULTI_ENA_ONLY: 相手の複数色エナをトラッシュへ
  if (stub.id === 'REMOVE_OPP_MULTI_ENA' || stub.id === 'REMOVE_OPP_MULTI_ENA_ONLY') {
    const sROME = ctx.otherState;
    const multiColorROME = sROME.energy.filter(cn => (ctx.cardMap.get(cn)?.Color ?? '').includes('/'));
    if (multiColorROME.length === 0) return done(addLog(ctx, '相手の複数色エナなし'));
    const newSROME: PlayerState = {
      ...sROME,
      energy: sROME.energy.filter(cn => !(ctx.cardMap.get(cn)?.Color ?? '').includes('/')),
      trash: [...sROME.trash, ...multiColorROME],
    };
    return done(addLog({ ...ctx, otherState: newSROME }, `相手の複数色エナ${multiColorROME.length}枚をトラッシュへ`));
  }
  // BOTH_DISCARD_BY_CENTER_LEVEL: 両者センタールリグのレベル分捨て
  if (stub.id === 'BOTH_DISCARD_BY_CENTER_LEVEL') {
    const toHWBDCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const getLevel = (state: PlayerState) => {
      const cn = state.field.lrig.at(-1);
      return cn ? parseInt(toHWBDCL(ctx.cardMap.get(cn)?.Level ?? '0')) || 0 : 0;
    };
    // 「場にある最も高いレベルを持つセンタールリグのレベル」= 両者のルリグレベルの最大値
    const centerLevelBDCL = Math.max(getLevel(ctx.ownerState), getLevel(ctx.otherState));
    const selfDiscardBDCL = Math.min(centerLevelBDCL, ctx.ownerState.hand.length);
    const otherDiscardBDCL = Math.min(centerLevelBDCL, ctx.otherState.hand.length);
    const newCtxBDCL: ExecCtx = {
      ...ctx,
      ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(selfDiscardBDCL), trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand.slice(0, selfDiscardBDCL)] },
      otherState: { ...ctx.otherState, hand: ctx.otherState.hand.slice(otherDiscardBDCL), trash: [...ctx.otherState.trash, ...ctx.otherState.hand.slice(0, otherDiscardBDCL)] },
    };
    return done(addLog(newCtxBDCL, `両者センターレベル${centerLevelBDCL}枚ずつ捨て`));
  }
  // TRASH_SIGNI_UNDER_FIELD_SIGNI: 自分フィールドシグニ下のカードをトラッシュへ
  if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
    let sTSUFS = ctx.ownerState;
    const underCardsTSUFS = sTSUFS.field.signi.flatMap(stack => stack && stack.length > 1 ? stack.slice(0, -1) : []);
    const newSigniTSUFS = sTSUFS.field.signi.map(stack => !stack || stack.length <= 1 ? stack : [stack.at(-1)!]) as (string[] | null)[];
    sTSUFS = { ...sTSUFS, field: { ...sTSUFS.field, signi: newSigniTSUFS }, trash: [...sTSUFS.trash, ...underCardsTSUFS] };
    return done(addLog({ ...ctx, ownerState: sTSUFS }, `シグニ下${underCardsTSUFS.length}枚をトラッシュへ`));
  }
  // UNDER_SIGNI_TO_ENERGY: シグニ下カードをエナゾーンへ
  // UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ソースシグニの下のカードを対象とし、エナに同クラスがなければエナへ
  if (stub.id === 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS') {
    const srcUSTENC = ctx.sourceCardNum;
    if (!srcUSTENC) return done(addLog(ctx, 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ソースなし'));
    const srcZoneUSTENC = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcUSTENC);
    if (srcZoneUSTENC < 0) return done(addLog(ctx, 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ゾーン不明'));
    const stackUSTENC = ctx.ownerState.field.signi[srcZoneUSTENC] ?? [];
    const underUSTENC = stackUSTENC.slice(0, -1);
    if (underUSTENC.length === 0) return done(addLog(ctx, 'シグニの下にカードなし（UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS）'));
    // 各underカードについて、エナゾーンに同クラスを持つシグニがない場合エナへ
    const targetCnUSTENC = underUSTENC.find(cn => {
      const cnClass = ctx.cardMap.get(cn)?.CardClass ?? '';
      if (!cnClass) return false;
      const cnClasses = cnClass.split(/[/／]/).map(s => s.trim()).filter(Boolean);
      return !ctx.ownerState.energy.some(enaCn => {
        const enaClass = ctx.cardMap.get(enaCn)?.CardClass ?? '';
        return cnClasses.some(cls => enaClass.includes(cls));
      });
    });
    if (!targetCnUSTENC) return done(addLog(ctx, 'エナゾーンに同クラスあり（UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS）'));
    const newStackUSTENC = stackUSTENC.filter(c => c !== targetCnUSTENC);
    const newSigniUSTENC = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniUSTENC[srcZoneUSTENC] = newStackUSTENC.length > 0 ? newStackUSTENC : null;
    const newOwnerUSTENC = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniUSTENC },
      energy: [...ctx.ownerState.energy, targetCnUSTENC],
    };
    return done(addLog({ ...ctx, ownerState: newOwnerUSTENC },
      `${ctx.cardMap.get(targetCnUSTENC)?.CardName ?? targetCnUSTENC}→エナゾーン（同クラスなし）`));
  }
  // ADD_CARD_TO_LRIG_DECK / ADD_CARD_TO_LRIG_DECK_HIDDEN: lastProcessedCards をルリグデッキに加える
  if (stub.id === 'ADD_CARD_TO_LRIG_DECK' || stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN') {
    const cardsACLD = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards : [];
    if (cardsACLD.length > 0) {
      let sACLD = ctx.ownerState;
      for (const cn of cardsACLD) {
        sACLD = {
          ...sACLD,
          hand: sACLD.hand.filter(c => c !== cn),
          trash: sACLD.trash.filter(c => c !== cn),
          lrig_deck: [...sACLD.lrig_deck, cn],
        };
      }
      return done(addLog({ ...ctx, ownerState: sACLD }, `${cardsACLD.length}枚をルリグデッキに加えた`));
    }
    // lastProcessedCards なし：テキストから《カード名》を解析して候補を収集
    const srcACLD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtACLD = srcACLD ? (srcACLD.EffectText ?? '') + ' ' + (srcACLD.BurstText ?? '') : '';
    const nameMatchesACLD = [...txtACLD.matchAll(/《([^》]+)》/g)].map(m => m[1]);
    if (nameMatchesACLD.length === 0) return done(addLog(ctx, '[ADD_CARD_TO_LRIG_DECK: カード名解析不可]'));
    // 各カード名に対応するインスタンスを lrig_deck → deck → hand → lrig_trash の順で探す
    const findInstance = (s: PlayerState, name: string): string | undefined => {
      const fromLrigDeck = s.lrig_deck.find(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === name);
      if (fromLrigDeck) return fromLrigDeck;
      const fromDeck = s.deck.find(cn => ctx.cardMap.get(cn)?.CardName === name);
      if (fromDeck) return fromDeck;
      const fromHand = s.hand.find(cn => ctx.cardMap.get(cn)?.CardName === name);
      if (fromHand) return fromHand;
      return s.lrig_trash.find(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === name);
    };
    const moveToLrigDeck = (s: PlayerState, inst: string): PlayerState => ({
      ...s,
      deck: s.deck.filter(c => c !== inst),
      hand: s.hand.filter(c => c !== inst),
      trash: s.trash.filter(c => c !== inst),
      lrig_trash: s.lrig_trash.filter(c => c !== inst),
      lrig_deck: s.lrig_deck.includes(inst) ? s.lrig_deck : [...s.lrig_deck, inst],
    });
    // 既存インスタンスが無ければゲーム外からトークン（レゾナクラフト等）を生成して instanceId を返す。
    // レゾナクラフトの候補（《白羅星姫 サタン》等）やアクセクラフト（《コードイート ケチャチャ》等）は
    // デッキに無いため、CardName→CardNum を解決して新規IDを作る。
    const resolveOrCreate = (name: string): string | undefined =>
      findInstance(ctx.ownerState, name) ?? createTokenInstanceId(ctx.cardMap, name, ctx.ownerState, ctx.otherState);
    // HIDDEN かつ 2候補ある場合：CHOOSE を提示
    if (stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN' && nameMatchesACLD.length >= 2) {
      const instA = resolveOrCreate(nameMatchesACLD[0]);
      const instB = resolveOrCreate(nameMatchesACLD[1]);
      const opts = [
        ...(instA ? [{ id: 'acldh_a', label: nameMatchesACLD[0], action: ({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: instA } as StubAction) as EffectAction, available: true }] : []),
        ...(instB ? [{ id: 'acldh_b', label: nameMatchesACLD[1], action: ({ type: 'STUB', id: 'INTERNAL_ACLDH_APPLY', value: instB } as StubAction) as EffectAction, available: true }] : []),
      ];
      if (opts.length === 0) return done(addLog(ctx, `[ADD_CARD_TO_LRIG_DECK_HIDDEN: 対象なし]`));
      if (opts.length === 1) {
        const inst = (opts[0].action as StubAction).value as string;
        return done(addLog({ ...ctx, ownerState: moveToLrigDeck(ctx.ownerState, inst) }, `裏向きルリグデッキへ: ${opts[0].label}`));
      }
      return needsInteraction(addLog(ctx, `どちらを裏向きでルリグデッキに加えますか？`), {
        type: 'CHOOSE', count: 1, options: opts,
      });
    }
    // ADD_CARD_TO_LRIG_DECK（非HIDDEN）または1候補：全て追加
    // 既存インスタンスが無い名前はゲーム外トークン（アクセクラフト等）として生成する。
    let sACLD2 = ctx.ownerState;
    let addedACLD = 0;
    for (const name of nameMatchesACLD) {
      const inst = findInstance(sACLD2, name) ?? createTokenInstanceId(ctx.cardMap, name, sACLD2, ctx.otherState);
      if (inst) {
        sACLD2 = moveToLrigDeck(sACLD2, inst);
        addedACLD++;
      }
    }
    return done(addLog({ ...ctx, ownerState: sACLD2 },
      `ルリグデッキに${addedACLD}枚加えた（${nameMatchesACLD.join('・')}）`));
  }
  // INTERNAL_ACLDH_APPLY: ADD_CARD_TO_LRIG_DECK_HIDDEN の選択後処理
  if (stub.id === 'INTERNAL_ACLDH_APPLY') {
    const inst = typeof stub.value === 'string' ? stub.value : '';
    if (!inst) return done(addLog(ctx, '[INTERNAL_ACLDH_APPLY: インスタンスなし]'));
    const moveToLD = (s: PlayerState, id: string): PlayerState => ({
      ...s,
      deck: s.deck.filter(c => c !== id),
      hand: s.hand.filter(c => c !== id),
      trash: s.trash.filter(c => c !== id),
      lrig_trash: s.lrig_trash.filter(c => c !== id),
      lrig_deck: s.lrig_deck.includes(id) ? s.lrig_deck : [...s.lrig_deck, id],
    });
    const name = ctx.cardMap.get(getCardNum(inst))?.CardName ?? inst;
    return done(addLog({ ...ctx, ownerState: moveToLD(ctx.ownerState, inst) }, `裏向きルリグデッキへ: ${name}`));
  }
  // INTERNAL_GEN_TOKEN_TO_LRIG_DECK: 指定 base CardNum のトークンをゲーム外生成しルリグデッキへ（フェゾーネ等）
  if (stub.id === 'INTERNAL_GEN_TOKEN_TO_LRIG_DECK') {
    const baseIGT = typeof stub.value === 'string' ? stub.value : '';
    if (!baseIGT) return done(addLog(ctx, '[INTERNAL_GEN_TOKEN_TO_LRIG_DECK: CardNumなし]'));
    const instIGT = createTokenInstanceId(ctx.cardMap, ctx.cardMap.get(baseIGT)?.CardName ?? baseIGT, ctx.ownerState, ctx.otherState);
    if (!instIGT) return done(addLog(ctx, `[INTERNAL_GEN_TOKEN_TO_LRIG_DECK: 生成不可 ${baseIGT}]`));
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, lrig_deck: [...ctx.ownerState.lrig_deck, instIGT] } },
      `ルリグデッキに加えた: ${ctx.cardMap.get(baseIGT)?.CardName ?? baseIGT}`));
  }
  // 「あなたは対戦相手のレベルN以下のルリグによってダメージを受けない」の**宣言型**（§6.4 O-3 続き492）。
  // ⚠上の `PREVENT_LRIG_DAMAGE` と同じ理由でフラグを書かない＝**レベル限定を state では表せない**
  //   （書くとレベル無制限の1回無効に化ける）。判定は `isLrigDamagePrevented` が `value` を読む。
  if (stub.id === 'PREVENT_LOW_LEVEL_LRIG_DAMAGE') {
    return done(addLog(ctx, `ルリグダメージ無効（レベル${stub.value ?? '?'}以下・【常】宣言）`));
  }
  // PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: ルリグダメージ無効フラグ
  if (stub.id === 'PREVENT_DAMAGE_FROM_OPP_EFFECTS' || stub.id === 'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP') {
    const newSPLLD: PlayerState = { ...ctx.ownerState, prevent_lrig_damage: true };
    return done(addLog({ ...ctx, ownerState: newSPLLD }, 'ルリグダメージ無効'));
  }
  // PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: 相手の次ターン最初のダメージを無効
  if (stub.id === 'PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN') {
    const newSPFDNOT: PlayerState = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSPFDNOT }, '次の相手ターン最初のダメージを無効'));
  }
  // === バッチ5: アクセ・デッキ・パワー補足 ===
  // ACCE_TO_ENERGY / PLACE_ACCE_SIGNI_TO_ENERGY: アクセカードをエナゾーンへ
  if (stub.id === 'ACCE_TO_ENERGY' || stub.id === 'PLACE_ACCE_SIGNI_TO_ENERGY') {
    const sATE = ctx.ownerState;
    const acceCardsATE = allAcceCards(sATE.field);
    if (acceCardsATE.length === 0) return done({ ...addLog(ctx, 'アクセなし'), lastProcessedCards: [] });
    const newSATE: PlayerState = {
      ...sATE,
      field: { ...sATE.field, signi_acce: [null, null, null] },
      energy: [...sATE.energy, ...acceCardsATE],
    };
    return done(addLog({
      ...ctx,
      ownerState: newSATE,
      lastProcessedCards: acceCardsATE,
    }, `アクセ${acceCardsATE.length}枚をエナゾーンへ`));
  }
  // ACCE_BANISH_SELF_TRASH: アクセを自分のトラッシュへ
  if (stub.id === 'ACCE_BANISH_SELF_TRASH') {
    const sABST = ctx.ownerState;
    const acceCardsABST = allAcceCards(sABST.field);
    if (acceCardsABST.length === 0) return done(addLog(ctx, 'アクセなし'));
    const newSABST: PlayerState = {
      ...sABST,
      field: { ...sABST.field, signi_acce: [null, null, null] },
      trash: [...sABST.trash, ...acceCardsABST],
    };
    return done(addLog({ ...ctx, ownerState: newSABST }, `アクセ${acceCardsABST.length}枚をトラッシュへ`));
  }
  // FROM_TRASH_TO_CENTER_ZONE: トラッシュからカードを中央シグニゾーン（zone[1]）に出す
  if (stub.id === 'FROM_TRASH_TO_CENTER_ZONE') {
    const cnFTCZ = ctx.sourceCardNum
      ? ctx.ownerState.trash.find(cn => cn === ctx.sourceCardNum)
      : (ctx.lastProcessedCards?.[0] ?? ctx.ownerState.trash.at(-1));
    if (!cnFTCZ) return done(addLog(ctx, 'トラッシュにカードなし（FROM_TRASH_TO_CENTER_ZONE）'));
    const sFTCZ = ctx.ownerState;
    const newTrashFTCZ = sFTCZ.trash.filter(c => c !== cnFTCZ);
    const newSigniFTCZ = [...sFTCZ.field.signi] as (string[] | null)[];
    // 中央ゾーン(index=1)に配置。既存シグニはバニッシュしてエナへ
    const existingFTCZ = newSigniFTCZ[1]?.at(-1);
    const newEnergyFTCZ = existingFTCZ ? [...sFTCZ.energy, existingFTCZ] : sFTCZ.energy;
    newSigniFTCZ[1] = [cnFTCZ];
    const newOwnerFTCZ: PlayerState = {
      ...sFTCZ,
      trash: newTrashFTCZ,
      energy: newEnergyFTCZ,
      field: { ...sFTCZ.field, signi: newSigniFTCZ },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerFTCZ },
      `${ctx.cardMap.get(cnFTCZ)?.CardName ?? cnFTCZ}をトラッシュから中央ゾーン（zone2）に出す`));
  }
  // VIEW_AND_DISCARD_SPELL: 手札からスペルを選んでトラッシュへ
  if (stub.id === 'INTERNAL_TRASH_CARD') {
    const cnITC = ctx.lastProcessedCards?.[0];
    if (!cnITC) return done(ctx);
    const sITC = ctx.ownerState;
    const newSITC: PlayerState = { ...sITC, hand: sITC.hand.filter(c => c !== cnITC), trash: [...sITC.trash, cnITC] };
    return done(addLog({ ...ctx, ownerState: newSITC }, `${ctx.cardMap.get(cnITC)?.CardName ?? cnITC}をトラッシュへ`));
  }
  // LRIG_LIMIT_MODIFY (STUB版): ルリグリミット修正
  if (stub.id === 'LRIG_LIMIT_MODIFY') {
    const srcLLM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLLM = srcLLM ? (srcLLM.EffectText ?? '') + ' ' + (srcLLM.BurstText ?? '') : '';
    const toHWLLM = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLLM = txtLLM.match(/リミットを?([＋+－-]?[０-９\d]+)/);
    if (!mLLM) return done(addLog(ctx, 'ルリグリミット修正値解析失敗'));
    const deltaLLM = parseInt(toHWLLM(mLLM[1]).replace('＋', '+').replace('－', '-'));
    const newSLLM: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + deltaLLM };
    return done(addLog({ ...ctx, ownerState: newSLLM }, `ルリグリミット${deltaLLM > 0 ? '+' : ''}${deltaLLM}`));
  }
  // LRIG_TRASH_KEY_TO_CENTER_UNDER: ルリグトラッシュのキーをセンタールリグの下に
  if (stub.id === 'LRIG_TRASH_KEY_TO_CENTER_UNDER') {
    const sLTKCU = ctx.ownerState;
    const keyCardLTKCU = sLTKCU.lrig_trash.find(cn => ctx.cardMap.get(cn)?.Type === 'キー');
    if (!keyCardLTKCU) return done(addLog(ctx, 'ルリグトラッシュにキーなし'));
    const newLrigDeckLTKCU = [...sLTKCU.field.lrig];
    if (newLrigDeckLTKCU.length > 0) {
      newLrigDeckLTKCU.splice(newLrigDeckLTKCU.length - 1, 0, keyCardLTKCU);
    } else {
      newLrigDeckLTKCU.push(keyCardLTKCU);
    }
    const newSLTKCU: PlayerState = {
      ...sLTKCU,
      lrig_trash: sLTKCU.lrig_trash.filter(c => c !== keyCardLTKCU),
      field: { ...sLTKCU.field, lrig: newLrigDeckLTKCU },
    };
    return done(addLog({ ...ctx, ownerState: newSLTKCU },
      `${ctx.cardMap.get(keyCardLTKCU)?.CardName ?? keyCardLTKCU}をセンタールリグの下に`));
  }
  // === バッチ6: パワー補足・ウィルス・条件移動 ===
  // 🏁**`POWER_CAP` のここのハンドラは撤去した**（2026-09-03 §5.3 `O-60` 第33バッチ）。
  //   これは**【常】の宣言型**で、実際に効くのは `effectEngine.calcFieldPowers` の `applyCaps`（payload を読む）。
  // 🔴旧実装は `EffectText + BurstText` に `/パワーが?(\d+)以下/` を当てていたが、原文は
  //   「パワーは30000**より大きくならない**」なので**1本も当たらず**、当たった場合でも
  //   `temp_power_mods` に差分を焼き込む＝**【常】の上限が一度きりの補正に化ける**形だった。

  // POWER_COPY_FROM_DOWNED: ダウンしたシグニのパワーを自シグニに加算
  if (stub.id === 'POWER_COPY_FROM_DOWNED') {
    if (!ctx.sourceCardNum) return done(ctx);
    let targetPowerPCFD = 0;
    // 優先: lastProcessedCards[0] (起動コストでダウンした自シグニ)
    const costDownedPCFD = ctx.lastProcessedCards?.[0];
    if (costDownedPCFD) {
      targetPowerPCFD = ctx.effectivePowers?.get(costDownedPCFD) ?? (parseInt(ctx.cardMap.get(getCardNum(costDownedPCFD))?.Power ?? '0') || 0);
    }
    // フォールバック: 自フィールドのダウンシグニ
    if (!targetPowerPCFD) {
      for (let zi = 0; zi < 3; zi++) {
        if (ctx.ownerState.field.signi_down?.[zi]) {
          const dn = ctx.ownerState.field.signi[zi]?.at(-1);
          if (dn && dn !== ctx.sourceCardNum) { targetPowerPCFD = ctx.effectivePowers?.get(dn) ?? (parseInt(ctx.cardMap.get(getCardNum(dn))?.Power ?? '0') || 0); break; }
        }
      }
    }
    if (!targetPowerPCFD) return done(addLog(ctx, 'ダウンシグニなし（POWER_COPY_FROM_DOWNED）'));
    const modsPCFD = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: targetPowerPCFD }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPCFD } },
      `ダウンシグニパワー+${targetPowerPCFD}`));
  }
  // POWER_MOD_MIRROR: 捨てたシグニのパワーを±として対象に適用
  // ・WXEX1-23文脈（lastProcessedCardsに相手シグニ）: -(捨てたパワー)を相手シグニへ
  // ・WXK06-049文脈（自場シグニが発動源）: +(捨てたパワー)を自シグニへ
  if (stub.id === 'POWER_MOD_MIRROR') {
    const lastDiscardedPMM = ctx.ownerState.trash.at(-1);
    const discardedPwPMM = lastDiscardedPMM ? (parseInt(ctx.cardMap.get(lastDiscardedPMM)?.Power ?? '0') || 0) : 0;
    const oppTargetPMM = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (oppTargetPMM && discardedPwPMM > 0) {
      const modsPMM = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: oppTargetPMM, delta: -discardedPwPMM }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMM } },
        `${ctx.cardMap.get(oppTargetPMM)?.CardName ?? oppTargetPMM}のパワー-${discardedPwPMM}（捨てたシグニのパワー）`));
    }
    if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum) && discardedPwPMM > 0) {
      const modsSelfPMM = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: discardedPwPMM }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsSelfPMM } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}のパワー+${discardedPwPMM}（捨てたシグニのパワー）`));
    }
    return done(addLog(ctx, `パワーミラー（対象なし / 捨てパワー${discardedPwPMM}）`));
  }
  // PLACE_VIRUS_CENTER: 相手の中央のシグニゾーンにウィルスを設置
  if (stub.id === 'PLACE_VIRUS_CENTER') {
    const sOtherPVC = ctx.otherState;
    const virusPVC = [...(sOtherPVC.field.signi_virus ?? [0, 0, 0])];
    if ((virusPVC[1] ?? 0) > 0) return done(addLog(ctx, '中央シグニゾーンには既に【ウィルス】がある'));
    virusPVC[1] = 1;
    const newSOtherPVC: PlayerState = { ...sOtherPVC, field: { ...sOtherPVC.field, signi_virus: virusPVC } };
    // ON_OPP_VIRUS_CHANGED検出用フラグ（置いた側=効果オーナーが監視者）
    const newOwnerPVC: PlayerState = { ...ctx.ownerState, opp_virus_placed_just: true };
    return done(addLog({ ...ctx, ownerState: newOwnerPVC, otherState: newSOtherPVC }, '相手の中央シグニゾーンに【ウィルス】を設置'));
  }
  // PLACE_VIRUS_TO_2: 相手の場のウィルス合計が2になるようにウィルスを置く（WX19-045）
  if (stub.id === 'PLACE_VIRUS_TO_2') {
    const virusPV2 = [...(ctx.otherState.field.signi_virus ?? [0, 0, 0])];
    const totalPV2 = virusPV2.reduce((s, v) => s + v, 0);
    const neededPV2 = Math.max(0, 2 - totalPV2);
    if (neededPV2 === 0) return done(addLog(ctx, '相手のウィルスは既に2個以上'));
    let placedPV2 = 0;
    for (let i = 0; i < 3 && placedPV2 < neededPV2; i++) {
      if ((virusPV2[i] ?? 0) === 0) { virusPV2[i] = 1; placedPV2++; }
    }
    const newOtherPV2: PlayerState = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: virusPV2 } };
    const newOwnerPV2: PlayerState = { ...ctx.ownerState, opp_virus_placed_just: true };
    return done(addLog({ ...ctx, ownerState: newOwnerPV2, otherState: newOtherPV2 }, `相手シグニゾーンにウィルスを${placedPV2}個置く（合計2個に）`));
  }
  // SELF_TRASH_IF_NO_OPP_VIRUS: 相手にウィルスがなければ自トラッシュ
  if (stub.id === 'SELF_TRASH_IF_NO_OPP_VIRUS') {
    const hasVirusSTINOV = (ctx.otherState.field.signi_virus ?? []).some(v => (v ?? 0) > 0);
    if (hasVirusSTINOV) return done(addLog(ctx, '相手ウィルスあり（トラッシュなし）'));
    if (!ctx.sourceCardNum) return done(ctx);
    if (!ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      return done(addLog(ctx, 'フィールドにいない（SELF_TRASH_IF_NO_OPP_VIRUS）'));
    const removedSTINOV = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSSTINOV: PlayerState = { ...removedSTINOV, trash: [...removedSTINOV.trash, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSSTINOV }, '相手ウィルスなし→自トラッシュ'));
  }
  // SELF_TRASH_IF_NO_OPP_CHARM: 相手の場に【チャーム】がなければ自トラッシュ（WX13-086等）
  if (stub.id === 'SELF_TRASH_IF_NO_OPP_CHARM') {
    const hasCharmSTINOC = (ctx.otherState.field.signi_charms ?? []).some(c => c != null);
    if (hasCharmSTINOC) return done(addLog(ctx, '相手チャームあり（トラッシュなし）'));
    if (!ctx.sourceCardNum) return done(ctx);
    if (!ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum))
      return done(addLog(ctx, 'フィールドにいない（SELF_TRASH_IF_NO_OPP_CHARM）'));
    const removedSTINOC = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSSTINOC: PlayerState = { ...removedSTINOC, trash: [...removedSTINOC.trash, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSSTINOC }, '相手チャームなし→自トラッシュ'));
  }
  // NO_ABILITY_SIGNI_TO_DECK_BOTTOM（`WXEX2-30`）＝【常】「アタックフェイズの間、能力を持たない対戦相手の
  // シグニが場を離れる場合、代わりにデッキの一番下に置かれる」＝**宣言だけ**。
  // 実体は場離れ置換チェーンの `applyEffectLeaveNoAbilityDeckBottomSubstitute`（`effectExecutor.ts`）が担う
  // （`EFFECT_LEAVE_REPLACE_BANISH` と同じ「CONTINUOUS は宣言・置換は離場側で読む」構造）。
  //
  // ⚠🔴**旧実装は「対戦相手のシグニ」を効果元シグニと取り違えて、自分の場のこのカード自身を自分のデッキ下へ
  //   送っていた**（しかも `!!EffectText` 判定は CSV の `-` を「能力あり」と読むので常に no-op ＝表に出なかった）。
  if (stub.id === 'NO_ABILITY_SIGNI_TO_DECK_BOTTOM') return done(ctx);
  // FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 凍結状態のシグニが退場するとトラッシュへ
  if (stub.id === 'FROZEN_SIGNI_TO_TRASH_ON_LEAVE') {
    // 凍結シグニをフィールドからトラッシュへ移動
    let sFSTTOL = ctx.ownerState;
    const frozenSigni: string[] = [];
    for (let zi = 0; zi < 3; zi++) {
      if (sFSTTOL.field.signi_frozen?.[zi]) {
        const top = sFSTTOL.field.signi[zi]?.at(-1);
        if (top) frozenSigni.push(top);
      }
    }
    for (const cn of frozenSigni) {
      const removed = removeFromField(cn, sFSTTOL);
      sFSTTOL = { ...removed, trash: [...removed.trash, cn] };
    }
    return done(addLog({ ...ctx, ownerState: sFSTTOL }, `凍結シグニ${frozenSigni.length}枚をトラッシュへ`));
  }
  // FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: 凍結シグニのバニッシュをデッキ下へ
  if (stub.id === 'FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM') {
    let sFSBTDB = ctx.ownerState;
    const frozenSigniFSBTDB: string[] = [];
    for (let zi = 0; zi < 3; zi++) {
      if (sFSBTDB.field.signi_frozen?.[zi]) {
        const top = sFSBTDB.field.signi[zi]?.at(-1);
        if (top) frozenSigniFSBTDB.push(top);
      }
    }
    for (const cn of frozenSigniFSBTDB) {
      const removed = removeFromField(cn, sFSBTDB);
      sFSBTDB = { ...removed, deck: [...removed.deck, cn] };
    }
    return done(addLog({ ...ctx, ownerState: sFSBTDB }, `凍結シグニ${frozenSigniFSBTDB.length}枚をデッキ下へ`));
  }
  // ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO:
  // 対象シグニをサーバントZERO（WXDi-P07-TK01-A: Lv1 精元 無色 1000 能力なし）に変換
  if (stub.id === 'ALL_OPP_SIGNI_SERVANT_ZERO' || stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'MAKE_MULTI_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') {
    const SERVANT_ZERO_NUM = 'WXDi-P07-TK01-A';
    // MAKE_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 相手シグニ1体を選択
    if ((stub.id === 'MAKE_SERVANT_ZERO' || stub.id === 'SIGNI_SERVANT_ZERO') && !ctx.lastProcessedCards?.length) {
      const oppSigniMSZ = [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      if (oppSigniMSZ.length === 0) return done(addLog(ctx, '相手フィールドにシグニなし（SERVANT_ZERO）'));
      const applyMSZ: StubAction = { type: 'STUB', id: stub.id };
      return selectOrInteract(oppSigniMSZ, 1, false, 'opp_field', applyMSZ as EffectAction, undefined, ctx);
    }
    const targets = ctx.lastProcessedCards?.length ? ctx.lastProcessedCards :
      [0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
    if (targets.length === 0) return done(addLog(ctx, '対象なし（SERVANT_ZERO）'));
    // card_identity_overrides: instanceId → 'WXDi-P07-TK01-A' に設定
    // battleCardMapがこれを解決し、power=1000/class=精元/color=無/abilities=なし が適用される
    const identOverSZ = { ...(ctx.otherState.card_identity_overrides ?? {}) };
    for (const cn of targets) identOverSZ[cn] = SERVANT_ZERO_NUM;
    const newSOtherSZ: PlayerState = { ...ctx.otherState, card_identity_overrides: identOverSZ };
    return done(addLog({ ...ctx, otherState: newSOtherSZ }, `${targets.length}体をサーバントZERO（WXDi-P07-TK01-A）に`));
  }
  // REMOVE_MIKO_KEYWORD: みこみこ親衛隊キーワードをsourceCardNumのシグニのkeyword_grantsから取り除く（WX25-P3-TK03）
  if (stub.id === 'REMOVE_MIKO_KEYWORD') {
    // 🆕**プレイヤーが得たぶん**（`player_keywords`）を先に消す（2026-09-01 続き760・`WXDi-P12-050-E1`）。
    //   ⚠シグニ側の `keyword_grants` と**同じ地点で消す**＝片方だけ残すと「取り除いたのに毎ターン発火」する。
    if ((ctx.ownerState.player_keywords ?? []).includes('みこみこ親衛隊')) {
      const restPK = (ctx.ownerState.player_keywords ?? []).filter(kw => kw !== 'みこみこ親衛隊');
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, player_keywords: restPK.length ? restPK : undefined } },
        'みこみこ親衛隊をあなたから取り除く'));
    }
    const mikoNum = ctx.sourceCardNum;
    if (!mikoNum) return done(addLog(ctx, 'シグニ番号不明（REMOVE_MIKO_KEYWORD）'));
    const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const newGrants = (grants[mikoNum] ?? []).filter(kw => kw !== 'みこみこ親衛隊');
    if (newGrants.length === 0) {
      delete grants[mikoNum];
    } else {
      grants[mikoNum] = newGrants;
    }
    const newSMiko = { ...ctx.ownerState, keyword_grants: grants };
    return done(addLog({ ...ctx, ownerState: newSMiko }, `みこみこ親衛隊を${ctx.cardMap.get(mikoNum)?.CardName ?? mikoNum}から取り除く`));
  }
  // DECLARED_NAME_TO_SERVANT_ZERO: declared_card_name と一致する相手のカードをサーバントZEROに（WXEX2-10）
  // value:'field' 指定時は相手の「場」のみを対象にする（WXK03-002 カーニバル †MAIS† は場限定）。
  if (stub.id === 'DECLARED_NAME_TO_SERVANT_ZERO') {
    const SERVANT_ZERO_DN = 'WXDi-P07-TK01-A';
    const declaredDN = ctx.ownerState.declared_card_name ?? '';
    if (!declaredDN) return done(addLog(ctx, '宣言されたカード名がない（DECLARED_NAME_TO_SERVANT_ZERO）'));
    const fieldOnlyDN = stub.value === 'field';
    // 相手の対象領域で名前が一致するカードを収集（既定: 全領域 / value:'field': 場のみ）
    const allOppCardsDN: string[] = fieldOnlyDN
      ? ctx.otherState.field.signi.flatMap(z => z ?? [])
      : [
        ...(ctx.otherState.hand ?? []),
        ...(ctx.otherState.energy ?? []),
        ...(ctx.otherState.trash ?? []),
        ...(ctx.otherState.deck ?? []),
        ...ctx.otherState.field.signi.flatMap(z => z ?? []),
      ];
    const matchedDN = allOppCardsDN.filter(cn => {
      const overrideId = ctx.otherState.card_identity_overrides?.[cn] ?? ctx.cardMap.get(cn)?.CardNum;
      const name = ctx.cardMap.get(overrideId ?? cn)?.CardName ?? ctx.cardMap.get(cn)?.CardName ?? '';
      return name === declaredDN;
    });
    if (matchedDN.length === 0) return done(addLog(ctx, `「${declaredDN}」一致カードなし（DECLARED_NAME_TO_SERVANT_ZERO）`));
    const identOverDN = { ...(ctx.otherState.card_identity_overrides ?? {}) };
    for (const cn of matchedDN) identOverDN[cn] = SERVANT_ZERO_DN;
    const newSOtherDN: PlayerState = { ...ctx.otherState, card_identity_overrides: identOverDN };
    return done(addLog({ ...ctx, otherState: newSOtherDN },
      `「${declaredDN}」${matchedDN.length}枚をサーバントZERO（WXDi-P07-TK01-A）に`));
  }
  // === バッチ7: バニッシュ・トラッシュ・条件効果 ===
  // BANISH (STUB版): lastProcessedCards[0] か sourceCardNum をバニッシュ
  if (stub.id === 'BANISH') {
    const cnBAN = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBAN) return done(addLog(ctx, 'バニッシュ対象なし'));
    // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下）を適用
    const foundOppBAN = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundOppBAN) {
      const { state: newSOtherBAN, log: logOppBAN } = banishDestination(removeFromField(cnBAN, ctx.otherState), ctx.ownerState, cnBAN, banishRedirectOpts(ctx, ctx.otherState, cnBAN));
      return done(addLog({ ...ctx, otherState: newSOtherBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}${logOppBAN}`));
    }
    const foundSelfBAN = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundSelfBAN) {
      const { state: newSBAN, log: logSelfBAN } = banishDestination(removeFromField(cnBAN, ctx.ownerState), ctx.otherState, cnBAN, banishRedirectOpts(ctx, ctx.ownerState, cnBAN));
      return done(addLog({ ...ctx, ownerState: newSBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}${logSelfBAN}`));
    }
    return done(addLog(ctx, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}はフィールドにない`));
  }
  // TRASH (STUB版): lastProcessedCards[0] か sourceCardNum をトラッシュへ
  if (stub.id === 'TRASH') {
    const cnTRS = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnTRS) return done(addLog(ctx, 'トラッシュ対象なし'));
    // 自フィールド
    if (ctx.ownerState.field.signi.some(s => s?.includes(cnTRS))) {
      const removedTRS = removeFromField(cnTRS, ctx.ownerState);
      return done(addLog({ ...ctx, ownerState: { ...removedTRS, trash: [...removedTRS.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}をトラッシュへ`));
    }
    // 自手札
    if (ctx.ownerState.hand.includes(cnTRS)) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.filter(c => c !== cnTRS), trash: [...ctx.ownerState.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}をトラッシュへ`));
    }
    // 相手フィールド
    if (ctx.otherState.field.signi.some(s => s?.includes(cnTRS))) {
      const removedTRS = removeFromField(cnTRS, ctx.otherState);
      return done(addLog({ ...ctx, otherState: { ...removedTRS, trash: [...removedTRS.trash, cnTRS] } },
        `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}をトラッシュへ`));
    }
    return done(addLog(ctx, `${ctx.cardMap.get(cnTRS)?.CardName ?? cnTRS}（TRASH STUB）`));
  }
  // BANISH_FROM_GAME: ゲームから除外（ルリグトラッシュへ）
  if (stub.id === 'BANISH_FROM_GAME') {
    const cnBFG = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBFG) return done(addLog(ctx, '除外対象なし'));
    const foundOppBFG = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBFG);
    const ownerBFG: 'self' | 'opponent' = foundOppBFG ? 'opponent' : 'self';
    const stBFG = ownerState(ownerBFG, ctx);
    const removedBFG = removeFromField(cnBFG, stBFG);
    const newSBFG: PlayerState = { ...removedBFG, lrig_trash: [...removedBFG.lrig_trash, cnBFG] };
    return done(addLog(setOwnerState(ownerBFG, newSBFG, ctx), `${ctx.cardMap.get(cnBFG)?.CardName ?? cnBFG}をゲームから除外`));
  }
  // TRASH_ALL_OPP_CARDS: 対戦相手の指定ゾーンにあるカードをすべてトラッシュへ
  // 🆕**§5.3 `O-60` 第34バッチ（2026-09-03）＝対象ゾーンは payload（`trashAllOppZones`）で受け取る。**
  // 🔴旧実装は `EffectText + BurstText` に `/《X》を含むすべてのカードをトラッシュに置く/` を当てて
  //   **カード名一致のエナ限定トラッシュ**へ分岐し、外れると「場＋手札」だけの fallback へ落ちていた
  //   ＝原文（`WXK11-047`）にある**エナゾーンが丸ごと落ちる**過少実行だった。
  // ⚠**payload が無ければ何もしない**（fail-closed）。
  if (stub.id === 'TRASH_ALL_OPP_CARDS') {
    const zonesTAOC = stub.trashAllOppZones;
    if (!zonesTAOC?.length) return done(addLog(ctx, '相手カードの一掃：対象ゾーンが無いため何もしない'));
    let sOppTAOC = ctx.otherState;
    const toTrashTAOC: string[] = [];
    if (zonesTAOC.includes('field')) {
      const newSigniTAOC = sOppTAOC.field.signi.map(stack => {
        if (stack && stack.length > 0) { toTrashTAOC.push(...stack); return null; }
        return stack;
      }) as (string[] | null)[];
      sOppTAOC = { ...sOppTAOC, field: { ...sOppTAOC.field, signi: newSigniTAOC } };
    }
    if (zonesTAOC.includes('hand')) { toTrashTAOC.push(...sOppTAOC.hand); sOppTAOC = { ...sOppTAOC, hand: [] }; }
    if (zonesTAOC.includes('energy')) { toTrashTAOC.push(...sOppTAOC.energy); sOppTAOC = { ...sOppTAOC, energy: [] }; }
    sOppTAOC = { ...sOppTAOC, trash: [...sOppTAOC.trash, ...toTrashTAOC] };
    return done(addLog({ ...ctx, otherState: sOppTAOC },
      `対戦相手の${zonesTAOC.join('・')}から${toTrashTAOC.length}枚をトラッシュへ`));
  }
  // ABILITY_CHECK_ELSE_TRASH: 「それを手札に戻す。**それ**が能力を持たない場合、代わりにそれをトラッシュに置く」
  // （`WX25-P3-038`／`WX25-P3-069`／`WX25-P3-072`／`WX25-P3-073` の4カード＝いずれも直前ステップが BOUNCE）。
  //
  // ⚠🔴**旧実装は「それ」を効果元シグニだと取り違えていた**＝`ctx.sourceCardNum` の原文を見て、
  //   あまつさえ**自分の場のシグニを自分のトラッシュへ落として**いた（原文は相手シグニの行き先の話）。
  //   さらに `!!EffectText.trim()` 判定は CSV の `-`（素のシグニ158枚）を「能力あり」と読むため、
  //   実際には**常に no-op**で表に出ていなかった＝直したときに初めて誤動作が現れる形だった。
  // ⚠「代わりに」＝手札に戻さずトラッシュへ置く、だが JSON の構造は [BOUNCE, このSTUB] なので
  //   **戻したあとに手札→トラッシュへ移し替える事後補正**で等価な最終盤面を作る。
  //   ⚠その副作用として、BOUNCE 側が立てる `turn_signi_returned_to_hand`（G087 参照）は立ったままになる
  //   ＝「実際には手札を経由していない」ぶんだけ過剰に成立しうる近似（対象4カードは常に1体なので影響は限定的）。
  if (stub.id === 'ABILITY_CHECK_ELSE_TRASH') {
    const bouncedACET = ctx.lastProcessedCards ?? [];
    if (bouncedACET.length === 0) return done(ctx);
    let curACET = ctx;
    for (const numACET of bouncedACET) {
      // 戻した先は「そのシグニの持ち主の手札」＝相手側を先に見る（自分の場のシグニを戻す札もあるため両方見る）
      for (const ownACET of ['opponent', 'self'] as Owner[]) {
        const sACET = ownerState(ownACET, curACET);
        const idxACET = sACET.hand.lastIndexOf(numACET);
        if (idxACET < 0) continue;
        if (!hasNoAbility(numACET, curACET.cardMap, sACET, curACET.effectsMap?.get(getCardNum(numACET)))) {
          curACET = addLog(curACET, `${curACET.cardMap.get(getCardNum(numACET))?.CardName ?? numACET}は能力を持つため手札のまま`);
          break;
        }
        const handACET = [...sACET.hand];
        handACET.splice(idxACET, 1);
        curACET = addLog(setOwnerState(ownACET, { ...sACET, hand: handACET, trash: [...sACET.trash, numACET] }, curACET),
          `${curACET.cardMap.get(getCardNum(numACET))?.CardName ?? numACET}は能力を持たないため代わりにトラッシュへ`);
        break;
      }
    }
    return done(curACET);
  }
  // PICK_FROM_TRASHED_CARDS: 「この方法でトラッシュに置いたカードの中から」N枚（まで）選び、行き先へ送る。
  // 🔑候補は `ctx.lastProcessedCards` ∩ トラッシュ＝**直前のミル／トラッシュで実際に置かれた札だけ**。
  // 🔴従来はペイロードが無く、候補が**トラッシュ全体**・枚数1固定・行き先は手札固定だった
  //   （＝「この方法で」の限定も「N枚まで」も「エナゾーンに置く」も丸ごと落ちていた）。§6.4 O-11。
  // ⚠直前が「〜してもよい」で辞退されたときは lastProcessedCards が空＝候補0＝no-op が正しい挙動。
  //   ここでトラッシュ全体へフォールバックすると、置いていない札まで拾える過剰実行に戻る。
  if (stub.id === 'PICK_FROM_TRASHED_CARDS') {
    if (isOwnTrashMoveLocked('self', ctx)) return done(addLog(ctx, 'トラッシュのカードは自分の効果で移動できない'));
    const pkPFTC = stub.trashedPick;
    if (!pkPFTC) {
      // ペイロード無し（旧 live レコード）＝従来どおりトラッシュ全体から1枚を手札へ。
      const trashPFTC = ctx.ownerState.trash;
      if (trashPFTC.length === 0) return done(addLog(ctx, 'トラッシュなし'));
      const thenPFTC: TransferToHandAction = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } };
      return needsInteraction(ctx, {
        type: 'SELECT_TARGET', candidates: trashPFTC, count: 1, optional: true,
        targetScope: 'self_trash', thenAction: thenPFTC,
      });
    }
    const candsPFTC = (ctx.lastProcessedCards ?? [])
      .filter(n => ctx.ownerState.trash.includes(n))
      .filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), pkPFTC.filter));
    if (candsPFTC.length === 0) return done(addLog(ctx, 'この方法でトラッシュに置いたカードに該当なし'));
    // 🆕`dest:'field'`＝選んだ札を**必ず場に出す**（`applyDirectAction` の ADD_TO_FIELD が
    //   選択された1枚を所在を問わず除去して配置する＝`hand_or_field` の場側と同じ受け皿）。
    // 🆕`dest:'declare'`＝**対象宣言だけ**（§5.3 `O-220` 第7バッチ）＝カードは動かさず選択結果だけを
    //   `lastProcessedCards` に残す（`SELECT_TARGET_ONLY` と同じ規約＝`INTERNAL_NOOP` を then に置く）。
    const thenByDest: EffectAction = pkPFTC.dest === 'declare'
      ? ({ type: 'STUB', id: 'INTERNAL_NOOP' } as StubAction as EffectAction)
      : pkPFTC.dest === 'energy'
      ? ({ type: 'ENERGY_CHARGE', target: { type: 'TRASH_CARD', owner: 'self', count: 1 } } as EffectAction)
      : pkPFTC.dest === 'field'
        ? ({ type: 'ADD_TO_FIELD', owner: 'self' } as EffectAction)
        : ({ type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } } as TransferToHandAction as EffectAction);
    // dest:'hand_or_field'＝選んだ札ごとに「手札に加える／場に出す」を問う（既存 CHOOSE 部品を再利用）。
    const contPFTC: EffectAction | undefined = pkPFTC.dest === 'hand_or_field'
      ? ({ type: 'STUB', id: 'INTERNAL_TRASHED_PICK_HAND_OR_FIELD' } as StubAction as EffectAction)
      : undefined;
    return needsInteraction(addLog(ctx, `この方法でトラッシュに置いたカードから${pkPFTC.count}枚${pkPFTC.upTo ? 'まで' : ''}選択`), {
      type: 'SELECT_TARGET',
      candidates: candsPFTC,
      count: Math.min(pkPFTC.count, candsPFTC.length),
      optional: pkPFTC.upTo ?? false,
      targetScope: 'self_trash',
      // hand_or_field は移動を continuation 側で行うので、選択だけして thenAction は何もしない。
      thenAction: (contPFTC ? ({ type: 'SEQUENCE', steps: [] } as SequenceAction as EffectAction) : thenByDest),
      ...(contPFTC ? { continuation: contPFTC } : {}),
    });
  }
  // INTERNAL_TRASHED_PICK_HAND_OR_FIELD: 上の選択結果（lastProcessedCards）を1枚ずつ手札／場へ振り分ける。
  if (stub.id === 'INTERNAL_TRASHED_PICK_HAND_OR_FIELD') {
    const queueITPHF = (ctx.lastProcessedCards ?? []).filter(n => ctx.ownerState.trash.includes(n));
    const headITPHF = queueITPHF[0];
    if (!headITPHF) return done(ctx);
    const restITPHF = queueITPHF.slice(1);
    // 残りは同じ STUB を自己チェーンする（lastProcessedCards を残り分で差し替えて再入）。
    const restStep: EffectAction | undefined = restITPHF.length === 0 ? undefined
      : ({ type: 'STUB', id: 'INTERNAL_TRASHED_PICK_HAND_OR_FIELD_REST', value: JSON.stringify(restITPHF) } as StubAction as EffectAction);
    const nameITPHF = ctx.cardMap.get(getCardNum(headITPHF))?.CardName ?? headITPHF;
    // ⚠場出しはゾーン選択で中断しうる＝SEQUENCE の後続は落ちる（resumeSelectTarget の ADD_TO_FIELD 特例と
    //   同じ理由）。残りの振り分けは `PLACE_SIGNI_ON_FIELD.afterAction` に載せて配置後に実行する。
    const handBranch: EffectAction = restStep
      ? ({ type: 'SEQUENCE', steps: [{ type: 'STUB', id: 'INTERNAL_TRASHED_TO_HAND' } as StubAction, restStep] } as SequenceAction as EffectAction)
      : ({ type: 'STUB', id: 'INTERNAL_TRASHED_TO_HAND' } as StubAction as EffectAction);
    const fieldBranch: EffectAction = ({
      type: 'PLACE_SIGNI_ON_FIELD', owner: 'self', cardNums: [headITPHF],
      ...(restStep ? { afterAction: restStep } : {}),
    } as import('../types/effects').PlaceSigniOnFieldAction) as EffectAction;
    return needsInteraction(addLog(ctx, `${nameITPHF}を手札に加えるか場に出す`), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'hand', label: '手札に加える', available: true, action: handBranch },
        { id: 'field', label: '場に出す', available: true, action: fieldBranch },
      ],
    });
  }
  if (stub.id === 'INTERNAL_TRASHED_PICK_HAND_OR_FIELD_REST') {
    const restIR: string[] = typeof stub.value === 'string' ? JSON.parse(stub.value) : [];
    return exec({ type: 'STUB', id: 'INTERNAL_TRASHED_PICK_HAND_OR_FIELD' } as StubAction as EffectAction,
      { ...ctx, lastProcessedCards: restIR });
  }
  // CONDITIONAL_ADD_HAND: フィールドにシグニがあれば手札に1枚追加
  if (stub.id === 'CONDITIONAL_ADD_HAND') {
    const hasSigniCAH = ctx.ownerState.field.signi.some(s => s && s.length > 0);
    if (!hasSigniCAH) return done(addLog(ctx, 'フィールドにシグニなし（手札追加なし）'));
    const sCAH = ctx.ownerState;
    if (sCAH.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const drawnCAH = sCAH.deck[0];
    const newSCAH: PlayerState = { ...sCAH, deck: sCAH.deck.slice(1), hand: [...sCAH.hand, drawnCAH] };
    return done(addLog({ ...ctx, ownerState: newSCAH }, '条件達成→手札に1枚追加'));
  }
  // CONDITIONAL_DISCARD は退役（タスク12(lxii)・2026-07-31）。「条件付き手札捨て」と称して**条件を一切見ず
  // `ctx.ownerState.hand`＝自分の手札を1枚捨てる**だけの別物で、唯一の使用者 `WD16-016-BURST`
  // （対戦相手が捨てる側）では owner が反転していた。parser 側で `CONDITIONAL{HAND_COUNT}` の
  // 昇格置換へ組み替え、id ごと（アクション型 `ConditionalDiscardAction` も）退役させた。
  // ⚠この下の空行は必須＝genStubsMd の説明抽出（直前のコメント塊を拾う）に本コメントが混ざるのを防ぐ。

  // PICK_FROM_TRASHED_CARDS の後半 / CONDITIONAL_ALTERNATE_EFFECT: 代替効果（スキップ）
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（log）
  // OPP_DECLARE_COLOR: 相手が色を宣言（log）
  // DISCARD_BY_POWER_MATCH: 手札の青シグニを捨て→相手手札の同パワーシグニを捨てさせる
  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    const toHWDBPM = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const discardedDBPM = (ctx.lastProcessedCards ?? []).find(cn => ctx.ownerState.hand.includes(cn));
    if (!discardedDBPM) {
      // Phase 1: SELECT_TARGET 手札の青シグニ（コスト）
      const blueHandDBPM = ctx.ownerState.hand.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === 'シグニ' && (c.Color ?? '').includes('青');
      });
      if (blueHandDBPM.length === 0) return done(addLog(ctx, '手札に青シグニなし（DISCARD_BY_POWER_MATCH）'));
      const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const cont: StubAction = { type: 'STUB', id: 'DISCARD_BY_POWER_MATCH' };
      return needsInteraction(addLog(ctx, '手札から青シグニを選択（捨てる）'), {
        type: 'SELECT_TARGET', candidates: blueHandDBPM, count: 1, optional: false,
        targetScope: 'self_hand', thenAction: noop as EffectAction, continuation: cont as EffectAction,
      });
    }
    // Phase 2: 選択シグニを捨て、同パワーの相手手札シグニを捨てさせる
    const discardedPwDBPM = parseInt(toHWDBPM(ctx.cardMap.get(discardedDBPM)?.Power ?? '0')) || 0;
    const newOwnerDBPM: PlayerState = {
      ...ctx.ownerState,
      hand: ctx.ownerState.hand.filter(cn => cn !== discardedDBPM),
      trash: [...ctx.ownerState.trash, discardedDBPM],
    };
    const matchingOppDBPM = ctx.otherState.hand.find(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (parseInt(toHWDBPM(c.Power ?? '0')) || 0) === discardedPwDBPM;
    });
    if (matchingOppDBPM) {
      const newOtherDBPM: PlayerState = {
        ...ctx.otherState,
        hand: ctx.otherState.hand.filter(cn => cn !== matchingOppDBPM),
        trash: [...ctx.otherState.trash, matchingOppDBPM],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerDBPM, otherState: newOtherDBPM },
        `${ctx.cardMap.get(discardedDBPM)?.CardName ?? discardedDBPM}を捨て、相手の${ctx.cardMap.get(matchingOppDBPM)?.CardName ?? matchingOppDBPM}（パワー${discardedPwDBPM}）を捨てさせる`));
    }
    return done(addLog({ ...ctx, ownerState: newOwnerDBPM },
      `${ctx.cardMap.get(discardedDBPM)?.CardName ?? discardedDBPM}を捨て（相手手札にパワー${discardedPwDBPM}のシグニなし）`));
  }
  // === バッチ9: ルリグ・条件サーチ・選択系 ===
  // CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK: クラフトをルリグデッキへ
  // 原文の《クラフト名》を解決し、既存インスタンスが無ければゲーム外から生成して加える。
  // （旧実装は sourceCardNum＝本体カード自身を加える誤りだった。WXK01-042/WXK09-015/WXDi-P16-009）
  if (stub.id === 'CRAFT_TO_LRIG_DECK' || stub.id === 'ADD_CRAFT_TO_LRIG_DECK') {
    // §6.4 O-20: 全文だと別能力が名指すクラフトを拾う（`WX25-P1-034-E2` は E1 の《幻怪　ヤミノザンシ》＝
    // 本来は**場に出す**クラフトをルリグデッキへ加えていた）のでブロックだけを読む。
    const txtCTLD2 = sourceAbilityText(ctx);
    // 固定トークンセットから「N種類を選んでルリグデッキに加える」型（フェゾーネマジック/ダークアーツ）。
    // これらは原文に個別クラフト名を持たず「○○のクラフトからN種類を…加える(○○は5種類から)」と書かれる。
    const TOKEN_SETS: { keyword: string; nums: string[] }[] = [
      { keyword: 'フェゾーネマジック', nums: ['WXDi-P14-TK01', 'WXDi-P14-TK02', 'WXDi-P14-TK03', 'WXDi-P14-TK04', 'WXDi-P14-TK05'] },
      // 🆕§6.4 O-22(c) 是正＝キーワードは **'ヤミノアーツ'**。'ダークアーツ' は**全 CSV に1件も出ない**綴りで、
      //   `WX25-P1-034-E2`「**ヤミノアーツ**のクラフトから２種類を１枚ずつ…」に一致せず恒久 no-op だった。
      //   ⚠在庫の「クラフト5種が CSV に無い＝データ側の欠落」は **stale**＝実測では `WX25-P1-TK1`〜`TK5`
      //   （ダーク・バウンダリー／背闇之陣／ダーク・アナライズ／闇気揚々／ダーク・アウト＝いずれも
      //   Type『アーツ/クラフト』）が実在する。**カード名だけ見て綴りを決めない**（名前は「ダーク・○○」だが
      //   束の呼称は「ヤミノアーツ」）。
      { keyword: 'ヤミノアーツ',       nums: ['WX25-P1-TK1', 'WX25-P1-TK2', 'WX25-P1-TK3', 'WX25-P1-TK4', 'WX25-P1-TK5'] },
    ];
    const setCTLD = TOKEN_SETS.find(s => txtCTLD2.includes(s.keyword));
    if (setCTLD) {
      const pickRawCTLD = txtCTLD2.match(/([０-９\d]+)種類/);
      const pickWantCTLD = pickRawCTLD ? (parseInt(pickRawCTLD[1].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))) || 1) : 1;
      const optsTS = setCTLD.nums
        .filter(num => !ctx.ownerState.lrig_deck.some(cn => getCardNum(cn) === num)) // 既にあるものは除外
        .map(num => ({
          id: `tokenset_${num}`,
          label: ctx.cardMap.get(num)?.CardName ?? num,
          action: ({ type: 'STUB', id: 'INTERNAL_GEN_TOKEN_TO_LRIG_DECK', value: num } as StubAction) as EffectAction,
          available: true,
        }));
      if (optsTS.length === 0) return done(addLog(ctx, `${setCTLD.keyword}：追加できるクラフトなし`));
      const pickTS = Math.min(pickWantCTLD, optsTS.length);
      return needsInteraction(addLog(ctx, `${setCTLD.keyword}のクラフトから${pickTS}種類を選んでルリグデッキに加える`), {
        type: 'CHOOSE', options: optsTS, count: pickTS, multiSelect: pickTS > 1,
      });
    }
    // テキスト中の《名前》のうち、クラフト/トークンとして解決できる最初のものを採用
    const craftNameCTLD2 = [...txtCTLD2.matchAll(/《([^》]+)》/g)]
      .map(m => m[1])
      .find(nm => resolveTokenBase(ctx.cardMap, nm) !== undefined);
    let cnCTLD: string | undefined;
    if (craftNameCTLD2) {
      // 既存インスタンス（lrig_trash→field→lrig_deck）を優先、無ければゲーム外生成
      cnCTLD = ctx.ownerState.lrig_trash.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2)
        ?? ctx.ownerState.field.lrig.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2)
        ?? ctx.ownerState.lrig_deck.find(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === craftNameCTLD2)
        ?? createTokenInstanceId(ctx.cardMap, craftNameCTLD2, ctx.ownerState, ctx.otherState);
    }
    cnCTLD = cnCTLD ?? ctx.lastProcessedCards?.[0];
    if (!cnCTLD) return done(addLog(ctx, `クラフトカードなし${craftNameCTLD2 ? `（${craftNameCTLD2}）` : ''}`));
    if (ctx.ownerState.lrig_deck.includes(cnCTLD)) {
      return done(addLog(ctx, `${ctx.cardMap.get(getCardNum(cnCTLD))?.CardName ?? cnCTLD}は既にルリグデッキにある`));
    }
    let sCTLD = ctx.ownerState;
    sCTLD = {
      ...sCTLD,
      hand: sCTLD.hand.filter(c => c !== cnCTLD),
      trash: sCTLD.trash.filter(c => c !== cnCTLD),
      lrig_trash: sCTLD.lrig_trash.filter(c => c !== cnCTLD),
      field: { ...sCTLD.field, lrig: sCTLD.field.lrig.filter(c => c !== cnCTLD) },
      lrig_deck: [...sCTLD.lrig_deck, cnCTLD],
    };
    return done(addLog({ ...ctx, ownerState: sCTLD }, `${ctx.cardMap.get(cnCTLD)?.CardName ?? cnCTLD}をルリグデッキに追加`));
  }
  // PLACE_LRIG_FROM_DECK_ON_TOP: ルリグデッキからルリグをフィールドへ
  if (stub.id === 'PLACE_LRIG_FROM_DECK_ON_TOP') {
    const sPLFDOT = ctx.ownerState;
    const topLrigPLFDOT = sPLFDOT.lrig_deck[0];
    if (!topLrigPLFDOT) return done(addLog(ctx, 'ルリグデッキなし'));
    const newSPLFDOT: PlayerState = {
      ...sPLFDOT,
      lrig_deck: sPLFDOT.lrig_deck.slice(1),
      field: { ...sPLFDOT.field, lrig: [...sPLFDOT.field.lrig, topLrigPLFDOT] },
    };
    return done(addLog({ ...ctx, ownerState: newSPLFDOT }, `${ctx.cardMap.get(topLrigPLFDOT)?.CardName ?? topLrigPLFDOT}をフィールドへ`));
  }
  // LRIG_LIMIT_UP_AND_COLOR_GAIN: ルリグリミット増加（+1）と色獲得（log）
  if (stub.id === 'LRIG_LIMIT_UP_AND_COLOR_GAIN') {
    const newSLLUACG: PlayerState = { ...ctx.ownerState, lrig_limit_mod: (ctx.ownerState.lrig_limit_mod ?? 0) + 1 };
    return done(addLog({ ...ctx, ownerState: newSLLUACG }, 'ルリグリミット+1（色獲得はエンジン処理）'));
  }
  // CONDITIONAL_SEARCH_IF_FIELD: フィールドにシグニがある場合サーチ
  if (stub.id === 'CONDITIONAL_SEARCH_IF_FIELD') {
    const hasSigniCSIF = ctx.ownerState.field.signi.some(s => s && s.length > 0);
    if (!hasSigniCSIF) return done(addLog(ctx, 'フィールドにシグニなし（サーチなし）'));
    // デッキ上3枚からシグニを選択
    const deckCSIF = ctx.ownerState.deck;
    if (deckCSIF.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCSIF = deckCSIF.slice(0, Math.min(3, deckCSIF.length));
    const signiTopCSIF = topCSIF.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiTopCSIF.length === 0) return done(addLog(ctx, 'デッキ上3枚にシグニなし'));
    const newSCSIF: PlayerState = { ...ctx.ownerState, deck: deckCSIF.slice(topCSIF.length), hand: [...ctx.ownerState.hand, signiTopCSIF[0]] };
    return done(addLog({ ...ctx, ownerState: newSCSIF }, `フィールドあり→${ctx.cardMap.get(signiTopCSIF[0])?.CardName ?? signiTopCSIF[0]}を手札へ`));
  }
  // CONDITIONAL_SEARCH_IF_RESONA: フィールドにレゾナがある場合サーチ
  if (stub.id === 'CONDITIONAL_SEARCH_IF_RESONA') {
    const hasResonaCSIR = ctx.ownerState.field.signi.some(s => s && s.some(cn => ctx.cardMap.get(cn)?.Type === 'レゾナ'));
    if (!hasResonaCSIR) return done(addLog(ctx, 'レゾナなし（サーチなし）'));
    const deckCSIR = ctx.ownerState.deck;
    if (deckCSIR.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCSIR = deckCSIR.slice(0, Math.min(5, deckCSIR.length));
    const signiCSIR = topCSIR.find(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (!signiCSIR) return done(addLog(ctx, 'デッキ上5枚にシグニなし'));
    const restCSIR = topCSIR.filter(cn => cn !== signiCSIR);
    const newSCSIR: PlayerState = { ...ctx.ownerState, deck: [...restCSIR, ...deckCSIR.slice(topCSIR.length)], hand: [...ctx.ownerState.hand, signiCSIR] };
    return done(addLog({ ...ctx, ownerState: newSCSIR }, `レゾナあり→${ctx.cardMap.get(signiCSIR)?.CardName ?? signiCSIR}を手札へ`));
  }
  // CHOSEN_TO_ENERGY_OR_HAND: 選んだカードをエナか手札か選択して追加
  if (stub.id === 'CHOSEN_TO_ENERGY_OR_HAND') {
    const cnCTEOH = ctx.lastProcessedCards?.[0];
    if (!cnCTEOH) return done(addLog(ctx, '対象カードなし'));
    const toHandCTEOH: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_HAND' };
    const toEnaCTEOH: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_TO_ENERGY' };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'to_hand', label: '手札に加える', action: toHandCTEOH, available: true },
        { id: 'to_energy', label: 'エナゾーンへ', action: toEnaCTEOH, available: true },
      ],
    });
  }
  // OPP_ENERGY_OR_DISCARD_CONDITION: 相手はエナゾーンかトラッシュか選択
  // ⚠2026-07-30（タスク12(lxi) 第2波）で**live 使用0**になった。唯一の使用元だった WDK10-001-E2 は
  //   標準ペア STUB{OPPONENT_PAY_OPTIONAL, opponentHandDiscard}＋CONDITIONAL へ移行済み。
  //   ⚠この実装は非回避枝が `ENERGY_CHARGE`（相手に**エナを与える**）になっており原文（相手のエナを
  //   トラッシュに置く）と符号が逆。新しいカードをここへ流さないこと＝回避クローズ形は
  //   OPPONENT_PAY_OPTIONAL を使う。
  if (stub.id === 'OPP_ENERGY_OR_DISCARD_CONDITION') {
    const toEnaOEODC: EnergyChargeAction = { type: 'ENERGY_CHARGE', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } };
    const toTrashOEODC: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return needsInteraction(ctx, {
      type: 'CHOOSE', count: 1, opponentResponds: true,
      options: [
        { id: 'energy', label: 'エナからカードを置く', action: toEnaOEODC, available: ctx.otherState.energy.length > 0 },
        { id: 'discard', label: '手札を1枚捨てる', action: toTrashOEODC, available: ctx.otherState.hand.length > 0 },
      ],
    });
  }
  // PLACE_SIGNI_UNDER_SIGNI: シグニをシグニ下に設置（lastProcessed→sourceCardNumのゾーン下）
  if (stub.id === 'PLACE_SIGNI_UNDER_SIGNI') {
    const cardToPlacePSUS = ctx.lastProcessedCards?.[0];
    if (!cardToPlacePSUS || !ctx.sourceCardNum) return done(addLog(ctx, '対象なし（PLACE_SIGNI_UNDER_SIGNI）'));
    let selfZonePSUS = -1;
    for (let zi = 0; zi < 3; zi++) { if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePSUS = zi; break; } }
    if (selfZonePSUS < 0) return done(addLog(ctx, 'ゾーン不明（PLACE_SIGNI_UNDER_SIGNI）'));
    let sPSUS = ctx.ownerState;
    sPSUS = { ...sPSUS, hand: sPSUS.hand.filter(c => c !== cardToPlacePSUS), trash: sPSUS.trash.filter(c => c !== cardToPlacePSUS) };
    const newSigniPSUS = sPSUS.field.signi.map((stack, i) => {
      if (i !== selfZonePSUS) return stack;
      return [cardToPlacePSUS, ...(stack ?? [])];
    }) as (string[] | null)[];
    sPSUS = { ...sPSUS, field: { ...sPSUS.field, signi: newSigniPSUS } };
    return done(addLog({ ...ctx, ownerState: sPSUS }, `${ctx.cardMap.get(cardToPlacePSUS)?.CardName ?? cardToPlacePSUS}をシグニ下に設置`));
  }
  // CONDITIONAL_PER_TRASH: トラッシュ枚数による条件（N枚以上でX）
  if (stub.id === 'CONDITIONAL_PER_TRASH') {
    // §6.4 O-20: 全文だと別能力の閾値（`WX12-037` は E1 の「25枚以上」）を拾うのでブロックだけを読む。
    const txtCPT = sourceAbilityText(ctx);
    const toHWCPT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCPT = txtCPT.match(/トラッシュに(?:カードが)?([０-９\d]+)枚以上/);
    // ⚠既定値を発明しない。自分のブロックに閾値が無いなら「この効果はトラッシュ枚数条件ではない」
    //   （`WX12-037-E2` は本当は「《メツム》を落としたら効果を繰り返す」＝別機構）。
    //   ここで 5 を仮置きすると**無害な空振りが余分な1ドローに化ける**ので黙って何もしない。
    if (!mCPT) return done(addLog(ctx, '[CONDITIONAL_PER_TRASH: この能力にトラッシュ枚数条件なし＝未実装]'));
    const threshold = parseInt(toHWCPT(mCPT[1]));
    const trashCountCPT = ctx.ownerState.trash.length;
    if (trashCountCPT < threshold) return done(addLog(ctx, `トラッシュ${trashCountCPT}枚（閾値${threshold}枚に未達）`));
    // 条件達成→1枚ドロー
    const sCPT = ctx.ownerState;
    if (sCPT.deck.length === 0) return done(addLog(ctx, `トラッシュ条件達成だがデッキなし`));
    const drawnCPT = sCPT.deck[0];
    return done(addLog({ ...ctx, ownerState: { ...sCPT, deck: sCPT.deck.slice(1), hand: [...sCPT.hand, drawnCPT] } },
      `トラッシュ${trashCountCPT}枚条件達成→1枚ドロー`));
  }
  // 🆕§6.4 O-22(b) MILL_EACH_REPEAT_ON_NAME（`WX12-037-E2`）＝「各プレイヤーは自分のデッキの上から
  // カードをN枚トラッシュに置く。この方法でトラッシュに置いたカードの中にカード名に《X》を含む
  // カードがある場合、あなたはこの効果を繰り返してもよい。（リフレッシュはこの効果をすべて処理してから行う）」
  // ⚠**ミルもここで行う**（parser が前段の TRASH{DECK_CARD} ごと畳み込む）＝条件が見るのは
  //   「この方法で」置いた**両プレイヤー分**で、SEQUENCE の step ごとに上書きされる
  //   `lastProcessedCards` には相手の分しか残らない（＝分けると過少発火する）。
  // ⚠リフレッシュはこの効果の**処理中には起こさない**（原文の但し書き）＝デッキが尽きたら取れる分だけ取り、
  //   リフレッシュは BattleScreen の通常経路に任せる。デッキが尽きれば繰り返しも自然に止まる。
  if (stub.id === 'MILL_EACH_REPEAT_ON_NAME') {
    const specMER = stub.millEachRepeatOnName;
    if (!specMER) return done(addLog(ctx, '[MILL_EACH_REPEAT_ON_NAME: パラメータなし＝未実装]'));
    const millMER = (state: typeof ctx.ownerState) => {
      const took = state.deck.slice(0, specMER.count);
      return { state: { ...state, deck: state.deck.slice(took.length), trash: [...state.trash, ...took] }, took };
    };
    const selfMER = millMER(ctx.ownerState);
    const oppMER = millMER(ctx.otherState);
    const milledMER = [...selfMER.took, ...oppMER.took];
    let curMER = addLog({ ...ctx, ownerState: selfMER.state, otherState: oppMER.state },
      `各プレイヤーがデッキの上から${specMER.count}枚トラッシュへ（自分${selfMER.took.length}／相手${oppMER.took.length}）`);
    // 「カード名に《X》を含む」＝部分一致（《メツム》は《堕落の砲娘 メツミ》には含まれない＝名前そのものを見る）。
    const hitMER = milledMER.some(cn => (curMER.cardMap.get(getCardNum(cn))?.CardName ?? '').includes(specMER.name));
    if (!hitMER || milledMER.length === 0) {
      return done(addLog(curMER, `《${specMER.name}》を含むカードなし（繰り返さない）`));
    }
    // 両者ともデッキが尽きていたら、繰り返しても何も起きないので問わない（無限ループ防止も兼ねる）。
    if (curMER.ownerState.deck.length === 0 && curMER.otherState.deck.length === 0) {
      return done(addLog(curMER, `《${specMER.name}》あり（両者のデッキが尽きたので繰り返さない）`));
    }
    curMER = addLog(curMER, `《${specMER.name}》を含むカードをトラッシュに置いた＝この効果を繰り返せる`);
    return needsInteraction(curMER, {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'repeat', label: 'この効果を繰り返す', action: stub as EffectAction, available: true },
        { id: 'stop', label: '繰り返さない', action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction, available: true },
      ],
    });
  }
  // REVEALED_CARD_COLOR_DISCARD: 公開カードの色と同じ色の手札カードを捨てる
  if (stub.id === 'REVEALED_CARD_COLOR_DISCARD') {
    const revCardRCCD = ctx.lastProcessedCards?.[0];
    if (!revCardRCCD) return done(addLog(ctx, '公開カードなし'));
    const revColorRCCD = ctx.cardMap.get(revCardRCCD)?.Color ?? '';
    if (!revColorRCCD) return done(addLog(ctx, '公開カードの色不明'));
    // Color列は「白黒」のような連結形式（'/'区切りではない）。多色は1色ずつに分解して照合する
    const revColorsRCCD = splitColors(revColorRCCD);
    const matchingRCCD = ctx.ownerState.hand.filter(cn => {
      const col = ctx.cardMap.get(cn)?.Color ?? '';
      // 無色など色を持たない公開カードは Color 値そのものの一致で照合
      return revColorsRCCD.length > 0 ? revColorsRCCD.some(rc => col.includes(rc)) : col === revColorRCCD;
    });
    if (matchingRCCD.length === 0) return done(addLog(ctx, `手札に${revColorRCCD}カードなし`));
    const thenRCCD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: matchingRCCD, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenRCCD,
    });
  }
  // VIEW_AND_DISCARD_SPELL (STUB版): 手札か場のカードを見てスペルを捨てる → 手札からスペルを1枚捨てる
  // (already implemented by batch 5 VIEW_AND_DISCARD_SPELL)
  // OPP_TRASH_TO_OPP_SIGNI_UNDER: 相手トラッシュ最上段を相手シグニ下にカードを置く
  if (stub.id === 'OPP_TRASH_TO_OPP_SIGNI_UNDER') {
    const sOTTOSU = ctx.otherState;
    if (sOTTOSU.trash.length === 0) return done(addLog(ctx, '相手トラッシュなし'));
    const topTrashOTTOSU = sOTTOSU.trash.at(-1)!;
    // トラッシュからカードを取り出し、lastProcessedCardsに保持
    const newTrashOTTOSU = sOTTOSU.trash.slice(0, -1);
    const ctx1OTTBSU = { ...ctx, otherState: { ...sOTTOSU, trash: newTrashOTTOSU }, lastProcessedCards: [topTrashOTTOSU] };
    const oppZonesOTTOSU = [0, 1, 2].filter(zi => sOTTOSU.field.signi[zi]?.at(-1));
    // シグニ不在の場合はトラッシュ除去前の ctx を返す（ctx1OTTBSU を返すとカードが消失する）
    if (oppZonesOTTOSU.length === 0) return done(addLog(ctx, '相手フィールドにシグニなし'));
    if (oppZonesOTTOSU.length === 1) {
      // 1体のみ → 自動決定
      return exec({ type: 'STUB', id: 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE', value: oppZonesOTTOSU[0] } as StubAction as EffectAction, ctx1OTTBSU);
    }
    // 複数シグニ → ゾーン選択（オーナー側が選ぶ）
    const zoneOptsOTTOSU = oppZonesOTTOSU.map(zi => ({
      id: `ottbsu_zone_${zi}`,
      label: `ゾーン${zi + 1}のシグニの下に置く`,
      action: ({ type: 'STUB', id: 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx1OTTBSU, `${ctx.cardMap.get(topTrashOTTOSU)?.CardName ?? topTrashOTTOSU}：どのシグニの下に置く？`), {
      type: 'CHOOSE', options: zoneOptsOTTOSU, count: 1,
    });
  }
  // INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: stub.value=ゾーン番号、lastProcessedCards[0]=置くカード
  if (stub.id === 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE') {
    const zoneIdxOTUSZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const cardToPlaceOTUSZ = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardToPlaceOTUSZ) return done(addLog(ctx, 'INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: カードなし'));
    const newSigniOTUSZ = ctx.otherState.field.signi.map((stack, i) => {
      if (i !== zoneIdxOTUSZ) return stack;
      return [cardToPlaceOTUSZ, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newOtherOTUSZ = { ...ctx.otherState, field: { ...ctx.otherState.field, signi: newSigniOTUSZ } };
    return done(addLog({ ...ctx, otherState: newOtherOTUSZ },
      `${ctx.cardMap.get(cardToPlaceOTUSZ)?.CardName ?? cardToPlaceOTUSZ}→相手ゾーン${zoneIdxOTUSZ + 1}のシグニ下へ`));
  }
  // === バッチ18: エンジン必須系 ===
  // トラップ系 ─────────────────────────────────────────────────────────

  // PLACE_TRAP_OPTIONAL / SET_HAND_CARD_AS_TRAP: 【トラップ】設置
  // 🔴`trapSource` を見る前は**手札固定**で、原文が「そのカードを」（直前に見たデッキの札）や
  //   「このシグニをエナゾーンから」と書いていても手札から設置していた＝**別のカードが場に置かれる**
  //   （§5.3 `O-55`・`LOOK_AND_REORDER` の2値フォールバック＝`O-53` と同型の固定フォールバック）。
  // ⚠設置の実体は出所非依存の `INTERNAL_ASK_TRAP_ZONE`→`INTERNAL_PICK_TO_TRAP` に寄せる
  //   （deck / hand / energy のどこからでも抜く）。⚠旧 `INTERNAL_SET_TRAP` は `hand.filter` しかしないので
  //   デッキ／エナ由来に使うと**元ゾーンに残ったままトラップにも現れる複製バグ**になる。
  if (stub.id === 'PLACE_TRAP_OPTIONAL' && stub.trapSource && stub.trapSource !== 'hand') {
    const srcTS = stub.trapSource;
    // 'looked'／'looked_or_hand'＝直前に見たカード（`resumeLookAndReorder` が lastProcessedCards に記録）。
    // ⚠**まだデッキに在るものだけ**を候補にする（見ただけで戻したカードが対象＝既に動いた札は除く）。
    const lookedTS = srcTS === 'energy_self' ? []
      : (ctx.lastProcessedCards ?? []).filter(c => ctx.ownerState.deck.includes(c));
    const candsTS = srcTS === 'energy_self'
      ? ((ctx.sourceCardNum && ctx.ownerState.energy.includes(ctx.sourceCardNum)) ? [ctx.sourceCardNum] : [])
      : srcTS === 'looked_or_hand' ? [...lookedTS, ...ctx.ownerState.hand]
      : lookedTS;
    if (candsTS.length === 0) return done({ ...addLog(ctx, 'トラップ設置：候補なし'), lastProcessedCards: [] });
    // 「設置してもよい」＝任意。⚠`energy_self` は選ぶ余地が無いので**枚数選択ではなく設置する/しないの2択**
    //   （`ADD_TO_FIELD` の thisCardOnly 経路と同規約）。
    if (srcTS === 'energy_self') {
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(getCardNum(candsTS[0]))?.CardName ?? candsTS[0]}を【トラップ】として設置しますか？`), {
        type: 'CHOOSE', count: 1, options: [
          { id: 'set', label: '【トラップ】として設置する', available: true,
            action: ({ type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE', value: candsTS[0] } as StubAction) as EffectAction },
          { id: 'skip', label: '設置しない', available: true,
            action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction },
        ],
      });
    }
    // §5.3 `O-87`＝任意かどうかは **payload** で決める（既定は任意＝原文の大多数が「してもよい」）。
    const optTS = stub.trapPlaceOptional !== false;
    return needsInteraction(addLog(ctx, `トラップにするカードを選択${optTS ? '（任意）' : ''}`), {
      type: 'SELECT_TARGET',
      candidates: candsTS,
      count: 1,
      optional: optTS,
      targetScope: 'self_hand',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE' } as StubAction) as EffectAction,
    });
  }
  if (stub.id === 'PLACE_TRAP_OPTIONAL' || stub.id === 'SET_HAND_CARD_AS_TRAP') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, 'トラップ設置：手札なし'));
    // 🔴§5.3 `O-87`（2026-08-26・実機で判明）＝ここは `CHOOSE_TRAP_ZONE` → `INTERNAL_SET_TRAP{value:zone}` と
    //   繋いでおり、**設置するカードを `lastProcessedCards` に置いたまま対話を跨いでいた**。
    //   `PendingEffect` は `lastProcessedCards` を持たないので、**実アプリでは resume 時に必ず失われ**
    //   「トラップ設置：対象カードなし」で無言 no-op になる（golden は `finish()` が ctx を持ち回るので通ってしまう）。
    //   ⇒ **非手札枝と同じ `INTERNAL_ASK_TRAP_ZONE`（＝カードを stub の value に焼き込む）へ寄せる。**
    // 🔴同時に、ここは**無条件に `optional:false`（強制）**でもあった＝原文「設置しても**よい**」の
    //   `WX19-059-BURST`／`WX21-057-E1` から**設置しない選択を奪う過剰実行**。payload で分ける。
    const optPTO = stub.trapPlaceOptional !== false;
    return needsInteraction(addLog(ctx, `トラップにするカードを選択${optPTO ? '（任意）' : ''}`), {
      type: 'SELECT_TARGET',
      candidates: ctx.ownerState.hand,
      count: 1,
      optional: optPTO,
      targetScope: 'self_hand',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_SPLIT_REVEALED（タスク12(lix)）: 公開してピックしなかった残りを「好きな枚数をデッキの一番下・
  // 残りを一番上」へ振り分けさせる。カードは resumeSearch が既にデッキから抜いてあるので、
  // G168 の分割UI（LOOK_AND_REORDER + destPosition:'split_top_bottom'）へそのまま載せるだけ。
  if (stub.id === 'INTERNAL_SPLIT_REVEALED') {
    const cardsSR = stub.revealed ?? [];
    if (cardsSR.length === 0) return done(ctx);
    return needsInteraction(ctx, {
      type: 'LOOK_AND_REORDER',
      cards: cardsSR,
      canTrash: false,
      destLocation: 'deck',
      // §6.4 O-2: 戻し先は**公開元デッキの持ち主**（resumeSearch が deckOwner を渡す）。省略時 self＝従来挙動。
      destOwner: stub.owner === 'opponent' ? 'opponent' : 'self',
      destPosition: 'split_top_bottom',
      private: true,
    });
  }
  // INTERNAL_REORDER_REMAINDER（§5.3 `O-51`・2026-08-29）: 公開してピックしなかった残りを
  //   「**好きな順番で**デッキの一番下（上）に置く」。行き先の位置は確定していて、**並び順だけ**を問う。
  //   ⚠`INTERNAL_SPLIT_REVEALED` との違いは destPosition だけ＝あちらは「上か下か」も選ばせる。
  //   カードは呼び出し側（resumeSearch / execRevealAndPick / execLookPickChain）が既にデッキから
  //   抜いてあるので、`LOOK_AND_REORDER` の並べ替えUI へそのまま載せる。
  //   🔴**1枚以下なら対話を出さない**＝順序に選択肢が無いのにモーダルを出すと、288効果すべてで
  //     「OK を押すだけの窓」が増える（`O-51` のブラスト半径はここで決まる）。呼び出し側でも弾くが、
  //     ここでも弾いて二重に守る（fail-safe）。
  if (stub.id === 'INTERNAL_REORDER_REMAINDER') {
    const cardsRR = stub.revealed ?? [];
    const posRR = stub.value === 'top' ? 'top' : 'bottom';
    const ownerRR = stub.owner === 'opponent' ? 'opponent' : 'self';
    if (cardsRR.length === 0) return done(ctx);
    if (cardsRR.length === 1) {
      // 並べ替える余地が無い＝そのまま置く（呼び出し側は既にデッキから抜いている）。
      const sRR = ownerState(ownerRR, ctx);
      const deckRR = posRR === 'bottom' ? [...sRR.deck, ...cardsRR] : [...cardsRR, ...sRR.deck];
      return done(addLog(setOwnerState(ownerRR, { ...sRR, deck: deckRR }, ctx),
        `残り1枚をデッキの${posRR === 'bottom' ? '一番下' : '一番上'}へ`));
    }
    return needsInteraction(ctx, {
      type: 'LOOK_AND_REORDER',
      cards: cardsRR,
      canTrash: false,
      destLocation: 'deck',
      // ⚠owner を渡さないと**効果オーナーのデッキ**へ戻す（deckOwner:'opponent' で複製バグ）＝
      //   `INTERNAL_SPLIT_REVEALED` が §6.4 O-2 で踏んだ穴と同じ。
      destOwner: ownerRR,
      destPosition: posRR,
      private: true,
      // 🔴**残りを片付けるだけの並べ替えで `lastProcessedCards` を潰さない**＝後段の
      //   `{$ref:'last_processed_count'}`（「この方法で手札に加えたカード1枚につき〜」）が
      //   ピック数ではなく残り枚数を読む（実測 `WXDi-P03-061-E2` が 2→3 に化けた）。
      keepLastProcessed: true,
    });
  }
  // INTERNAL_ASK_TRAP_ZONE / INTERNAL_PICK_TO_TRAP（LOOK_PICK_CHAIN の then:'trap'・タスク12(xlvi)(g)）。
  // ⚠既存の INTERNAL_SET_TRAP は **手札からの設置専用**（`hand.filter` でしか元ゾーンから抜かない）ため、
  //   デッキ公開札には使えない（デッキに残ったままトラップゾーンにも現れる＝複製バグになる）。
  //   LOOK_PICK_CHAIN はデッキをスライスしない設計なので、ここで明示的にデッキから抜く。
  if (stub.id === 'INTERNAL_ASK_TRAP_ZONE') {
    const cardAT = typeof stub.value === 'string' ? stub.value : (ctx.lastProcessedCards?.[0] ?? null);
    if (!cardAT) return done(addLog(ctx, 'トラップ設置：対象カードなし'));
    const trapsAT = ctx.ownerState.field.signi_traps ?? [null, null, null];
    const nameAT = ctx.cardMap.get(getCardNum(cardAT))?.CardName ?? cardAT;
    const optsAT = [0, 1, 2].map(zi => ({
      id: `lpc_trap_zone_${zi}`,
      // 既に【トラップ】があるゾーンを選ぶと元のカードはトラッシュへ行く＝ラベルで明示する
      label: trapsAT[zi] ? `ゾーン${zi + 1}に設置（既存の【トラップ】をトラッシュ）` : `ゾーン${zi + 1}に設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_PICK_TO_TRAP', value: cardAT, count: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, `${nameAT}を【トラップ】として設置するゾーンを選択`), {
      type: 'CHOOSE', options: optsAT, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_PICK_TO_TRAP') {
    const cardPT = typeof stub.value === 'string' ? stub.value : (ctx.lastProcessedCards?.[0] ?? null);
    const zonePT = typeof stub.count === 'number' ? stub.count : 0;
    if (!cardPT) return done(addLog(ctx, 'トラップ設置：対象カードなし'));
    const trapsPT = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const trashPT = [...ctx.ownerState.trash];
    if (trapsPT[zonePT]) trashPT.push(trapsPT[zonePT]!);
    trapsPT[zonePT] = cardPT;
    const newOwnerPT: PlayerState = {
      ...ctx.ownerState,
      // 元ゾーン（デッキ／手札／エナ）から抜く。どこにも無ければ何も抜かない（冪等）。
      // ⚠**エナを足さないと「このシグニをエナゾーンから【トラップ】として設置」でカードが複製される**
      //   （エナに残ったままトラップゾーンにも現れる＝§5.3 `O-55`）。
      deck: ctx.ownerState.deck.filter(c => c !== cardPT),
      hand: ctx.ownerState.hand.filter(c => c !== cardPT),
      energy: ctx.ownerState.energy.filter(c => c !== cardPT),
      trash: trashPT,
      field: { ...ctx.ownerState.field, signi_traps: trapsPT },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerPT, lastProcessedCards: [cardPT], trapSetOwners: [...(ctx.trapSetOwners ?? []), 'self'] },
      `${ctx.cardMap.get(getCardNum(cardPT))?.CardName ?? cardPT}を【トラップ】としてゾーン${zonePT + 1}に設置`));
  }
  // INTERNAL_SET_TRAP: ゾーン番号をstub.valueで受け取りトラップ設置
  // INTERNAL_SET_TRAP: 手札の1枚を指定ゾーンへ【トラップ】として置く（`lastProcessedCards[0]` を使う）。
  // ⚠§5.3 `O-87` 以降、**対話を跨ぐ経路からは呼ばない**（`PendingEffect` が `lastProcessedCards` を運ばず
  //   resume で必ず失われる）。跨ぐ場合は `INTERNAL_ASK_TRAP_ZONE`→`INTERNAL_PICK_TO_TRAP`（カードを value に焼く）。
  if (stub.id === 'INTERNAL_SET_TRAP') {
    const zoneIdxIST = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const trapCardIST = ctx.lastProcessedCards?.[0] ?? null;
    if (!trapCardIST) return done(addLog(ctx, 'トラップ設置：対象カードなし'));
    const currentTrapsIST = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const newTrashIST = [...ctx.ownerState.trash];
    if (currentTrapsIST[zoneIdxIST]) newTrashIST.push(currentTrapsIST[zoneIdxIST]!);
    currentTrapsIST[zoneIdxIST] = trapCardIST;
    const newHandIST = ctx.ownerState.hand.filter(c => c !== trapCardIST);
    const newOwnerIST = { ...ctx.ownerState, hand: newHandIST, trash: newTrashIST, field: { ...ctx.ownerState.field, signi_traps: currentTrapsIST } };
    return done(addLog({ ...ctx, ownerState: newOwnerIST, trapSetOwners: [...(ctx.trapSetOwners ?? []), 'self'] }, `トラップ設置: ゾーン${zoneIdxIST + 1}`));
  }
  // TRAP_TO_HAND: signi_trapsのカードを手札へ（全枚または選択）
  if (stub.id === 'RETURN_TRAP_TO_HAND_ONE') {
    const traps = (ctx.ownerState.field.signi_traps ?? []).filter(Boolean) as string[];
    if (traps.length === 0) return done({ ...addLog(ctx, '戻せるトラップがない'), lastProcessedCards: [] });
    const action: StubAction = { type: 'STUB', id: 'INTERNAL_RETURN_SELECTED_TRAP' };
    return selectOrInteract(traps, 1, false, 'self_field', action as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_RETURN_SELECTED_TRAP') {
    const selected = ctx.lastProcessedCards?.[0];
    if (!selected) return done({ ...ctx, lastProcessedCards: [] });
    const traps = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])];
    const zi = traps.indexOf(selected);
    if (zi < 0) return done({ ...ctx, lastProcessedCards: [] });
    traps[zi] = null;
    return done({ ...ctx, ownerState: { ...ctx.ownerState, hand: [...ctx.ownerState.hand, selected], field: { ...ctx.ownerState.field, signi_traps: traps } }, lastProcessedCards: [selected] });
  }
  // TRAP_TO_HAND: 自分の【トラップ】を `trapToHand.count` 枚だけ手札に加える。
  //
  // 🔴**2026-08-26（§5.3 `O-60` 第7バッチ）＝ここはカード全文を
  //   `【トラップ】をN**枚**まで手札に加える` で読んでいた**が、実データの助数詞は「**つ**」なので
  //   **live 5効果すべてが1本も当たらず、既定の「場の【トラップ】を全部」へ落ちていた**＝
  //   「【トラップ】**１つ**を対象とし、それを手札に加える」が**3つ全部の回収**に化けていた。
  //   ⇒ parser が `trapToHand{count,upTo}` を刻み、engine は payload だけを読む。
  // ⚠**payload が無ければ何もしない**（fail-closed）。旧既定は過剰側だったので、落ちる向きを逆にした。
  if (stub.id === 'TRAP_TO_HAND') {
    const allTrapsTTH = (ctx.ownerState.field.signi_traps ?? [null, null, null]);
    const trapsToHandTTH = allTrapsTTH.filter(Boolean) as string[];
    const specTTH = stub.trapToHand;
    if (!specTTH) return done(addLog(ctx, `[未実装] 手札に加える【トラップ】の枚数が未指定（TRAP_TO_HAND・${ctx.sourceCardNum ?? '?'}）`));
    // 🆕§5.3 `O-87`＝**同じ選択プールに場のシグニも混ぜる**（`WX16-017`「あなたの【トラップ】**と
    //   ＜トリック＞のシグニ**を好きな数対象とし、それらを場から手札に加える」）。
    //   ⚠混ぜるのは**候補**だけで、`lastProcessedCards` に載せるのは【トラップ】だけ（下の APPLY 参照）。
    const signiCandsTTH = specTTH.alsoSigniFilter
      ? fieldCandidates(ctx.ownerState, specTTH.alsoSigniFilter, ctx.cardMap, ctx.effectivePowers)
      : [];
    const poolTTH = [...trapsToHandTTH, ...signiCandsTTH];
    if (poolTTH.length === 0) return done(addLog(ctx, 'トラップなし'));
    const maxCountTTH = specTTH.count === 'ALL' ? poolTTH.length : specTTH.count;
    // 🆕**`upTo` が立っていたら枚数が足りていても必ず選ばせる**（§5.3 `O-87`）＝
    //   `count:'ALL'` は原文「**好きな数**」＝0枚も選べるプレイヤーの選択であって「全部」ではない。
    //   ⚠旧実装は `maxCount < 候補数` のときしか UI を出さず、「好きな数」を**問答無用の全回収**にしていた。
    if (specTTH.upTo === true || (maxCountTTH < poolTTH.length && poolTTH.length > 1)) {
      return needsInteraction(addLog(ctx, `手札に加えるカードを${maxCountTTH}枚${specTTH.upTo ? 'まで' : ''}選択`), {
        type: 'SELECT_TARGET',
        candidates: poolTTH,
        count: maxCountTTH,
        optional: specTTH.upTo === true,
        targetScope: 'self_field',
        thenAction: ({ type: 'STUB', id: 'INTERNAL_TTH_APPLY' } as StubAction) as EffectAction,
      });
    }
    const takeTTH = poolTTH.slice(0, maxCountTTH);
    return done(applyTrapToHand(takeTTH, ctx));
  }
  // INTERNAL_TTH_APPLY: TRAP_TO_HAND選択完了後の適用
  if (stub.id === 'INTERNAL_TTH_APPLY') {
    const selectedTTH = ctx.lastProcessedCards ?? [];
    if (selectedTTH.length === 0) return done({ ...addLog(ctx, 'トラップ未選択'), lastProcessedCards: [] });
    return done(applyTrapToHand(selectedTTH, ctx));
  }
  // ACTIVATE_TRAP / ACTIVATE_TRAP_IN_FIELD: トラップを表向きにしてTRAP_ICON効果を発動
  if (stub.id === 'ACTIVATE_TRAP' || stub.id === 'ACTIVATE_TRAP_IN_FIELD') {
    const trapsAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
    // lastProcessedCardsに指定があればそのトラップを優先、なければ最初のトラップ
    const selectedAT = ctx.lastProcessedCards?.[0];
    let firstTrapIdxAT = selectedAT ? trapsAT.findIndex(t => t === selectedAT) : -1;
    if (firstTrapIdxAT < 0) firstTrapIdxAT = trapsAT.findIndex((t: string | null) => t !== null);
    if (firstTrapIdxAT < 0) return done(addLog(ctx, 'トラップなし'));
    const trapCardAT = trapsAT[firstTrapIdxAT]!;
    const newTrapsAT = [...trapsAT] as (string | null)[];
    newTrapsAT[firstTrapIdxAT] = null;
    // トラップカードをトラッシュへ移動した状態を基点に
    const newOwnerAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsAT } };
    const loggedCtxAT = addLog({ ...ctx, ownerState: newOwnerAT, sourceCardNum: trapCardAT }, `トラップ発動: ゾーン${firstTrapIdxAT + 1}（${ctx.cardMap.get(trapCardAT)?.CardName ?? trapCardAT}）`);
    // TRAP_ICON効果を解析して実行
    const trapDataAT = ctx.cardMap.get(trapCardAT);
    if (trapDataAT) {
      const trapEffsAT = parseCardEffects(trapDataAT);
      const trapIconEffAT = trapEffsAT.find(e => e.effectType === 'TRAP_ICON');
      if (trapIconEffAT) return exec(trapIconEffAT.action, { ...loggedCtxAT, trapActivated: true });
    }
    return done({ ...loggedCtxAT, trapActivated: true });
  }
  // SET_OPP_SIGNI_AS_TRAP: 相手のシグニ1体をトラップとして設置
  if (stub.id === 'SET_OPP_SIGNI_AS_TRAP') {
    let oppSigniCandsSSOSAT = (ctx.otherState.field.signi.map((s, zi) => s?.at(-1) ? { instId: s.at(-1)!, zi } : null).filter(Boolean)) as Array<{ instId: string; zi: number }>;
    // 🆕**§5.3 `O-220` 第8バッチ（2026-09-02）＝任意コストの前に宣言した対象だけへ絞る。**
    //   「対戦相手のシグニ１体を**対象とし**、〈OR 任意コスト〉を払って**もよい**。**そうした場合、それを**
    //   【トラップ】として設置する」（`WX21-025-TRAP`）＝従来は支払いのあとで**もう一度選ばされて**いた。
    const fixedSSOSAT = stub.fixedCardNums ?? (stub.targetsStored ? ctx.storedTargetCards : undefined);
    if (fixedSSOSAT) oppSigniCandsSSOSAT = oppSigniCandsSSOSAT.filter(x => fixedSSOSAT.includes(x.instId));
    if (oppSigniCandsSSOSAT.length === 0) return done(addLog(ctx, 'SET_OPP_SIGNI_AS_TRAP: 相手シグニなし'));
    // 🔴**3点契約の③後半＝選択UIを開かずに即設置する**（実機 `V-130` と同型の罠）。
    if (fixedSSOSAT && oppSigniCandsSSOSAT.length === 1) {
      return exec({ type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_TRAP' } as StubAction as EffectAction,
        { ...ctx, lastProcessedCards: [oppSigniCandsSSOSAT[0].instId] });
    }
    return needsInteraction(addLog(ctx, '相手のシグニを選択（トラップ化）'), {
      type: 'SELECT_TARGET',
      candidates: oppSigniCandsSSOSAT.map(x => x.instId),
      count: 1,
      optional: false,
      targetScope: 'opp_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_OPP_SIGNI_TO_TRAP' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_OPP_SIGNI_TO_TRAP: 選択した相手シグニをトラップゾーンへ
  if (stub.id === 'INTERNAL_OPP_SIGNI_TO_TRAP') {
    const targetIOSTT = ctx.lastProcessedCards?.[0] ?? null;
    if (!targetIOSTT) return done(addLog(ctx, 'INTERNAL_OPP_SIGNI_TO_TRAP: 対象なし'));
    let zoneIdxIOSTT = -1;
    for (let zi = 0; zi < 3; zi++) {
      if ((ctx.otherState.field.signi[zi] ?? []).includes(targetIOSTT)) { zoneIdxIOSTT = zi; break; }
    }
    if (zoneIdxIOSTT < 0) return done(addLog(ctx, 'INTERNAL_OPP_SIGNI_TO_TRAP: ゾーン特定失敗'));
    const newOppSigniIOSTT = [...ctx.otherState.field.signi] as (string[] | null)[];
    newOppSigniIOSTT[zoneIdxIOSTT] = null;
    const newOppTrapsIOSTT = [...(ctx.otherState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    const newOppTrashIOSTT = [...ctx.otherState.trash];
    if (newOppTrapsIOSTT[zoneIdxIOSTT]) newOppTrashIOSTT.push(newOppTrapsIOSTT[zoneIdxIOSTT]!);
    newOppTrapsIOSTT[zoneIdxIOSTT] = targetIOSTT;
    const newOtherIOSTT = { ...ctx.otherState, trash: newOppTrashIOSTT, field: { ...ctx.otherState.field, signi: newOppSigniIOSTT, signi_traps: newOppTrapsIOSTT } };
    return done(addLog({ ...ctx, otherState: newOtherIOSTT, trapSetOwners: [...(ctx.trapSetOwners ?? []), 'opponent'] }, `相手シグニ→トラップ: ゾーン${zoneIdxIOSTT + 1}`));
  }
  // TRAP_TO_SIGNI_IF_ZONE_EMPTY: このカードのゾーンにシグニがない場合、signi_traps[zone]→signi[zone]
  if (stub.id === 'TRAP_TO_SIGNI_IF_ZONE_EMPTY') {
    const srcCardTTSIZE = ctx.sourceCardNum ?? null;
    if (!srcCardTTSIZE) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: sourceCardNumなし'));
    let zoneIdxTTSIZE = -1;
    for (let zi = 0; zi < 3; zi++) {
      const trapsArr = ctx.ownerState.field.signi_traps ?? [null, null, null];
      if (trapsArr[zi] === srcCardTTSIZE || (ctx.ownerState.field.signi[zi] ?? []).includes(srcCardTTSIZE)) {
        zoneIdxTTSIZE = zi; break;
      }
    }
    if (zoneIdxTTSIZE < 0) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: ゾーン特定失敗'));
    if (ctx.ownerState.field.signi[zoneIdxTTSIZE]?.length) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: ゾーンにシグニあり'));
    const trapCardTTSIZE = (ctx.ownerState.field.signi_traps ?? [])[zoneIdxTTSIZE];
    if (!trapCardTTSIZE) return done(addLog(ctx, 'TRAP_TO_SIGNI_IF_ZONE_EMPTY: トラップなし'));
    const newSigniTTSIZE = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniTTSIZE[zoneIdxTTSIZE] = [trapCardTTSIZE];
    const newTrapsTTSIZE = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
    newTrapsTTSIZE[zoneIdxTTSIZE] = null;
    const newOwnerTTSIZE = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniTTSIZE, signi_traps: newTrapsTTSIZE } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTSIZE }, `トラップ→シグニ: ゾーン${zoneIdxTTSIZE + 1}`));
  }
  // PLACE_TRAP_FROM_REVEALED: 前のLOOK_AND_REORDERで公開されたデッキ上N枚からトラップ設置
  if (stub.id === 'PLACE_TRAP_FROM_REVEALED') {
    const srcPTFR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPTFR = srcPTFR ? (srcPTFR.EffectText ?? '') + ' ' + (srcPTFR.BurstText ?? '') : '';
    const toHWPTFR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 公開枚数をテキストから解析（デフォルト2枚）
    // ⚠**「N枚見**て**」の連用形も同義**（`WX16-061`＝3枚／`WX17-029`＝4枚）。`見る` 固定だと既定の2枚に落ちて
    //   **原文より少なく公開する過小実行**になる（§5.3 `O-55` の regex 緩和でこの経路へ入るようになった）。
    const cntMPTFR = txtPTFR.match(/カードを([０-９\d]+)枚見(?:る|て)/);
    const revealCountPTFR = cntMPTFR ? parseInt(toHWPTFR(cntMPTFR[1])) : 2;
    // デッキ上から公開カードを取得
    const topCardsPTFR = ctx.ownerState.deck.slice(0, revealCountPTFR);
    if (topCardsPTFR.length === 0) return done(addLog(ctx, 'PLACE_TRAP_FROM_REVEALED: デッキなし'));
    // 公開カードをデッキから除去した状態でSEARCHを提示
    const deckWithoutPTFR = ctx.ownerState.deck.slice(revealCountPTFR);
    const ctxPTFR = { ...ctx, ownerState: { ...ctx.ownerState, deck: deckWithoutPTFR } };
    const noopPTFR: SequenceAction = { type: 'SEQUENCE', steps: [] };
    const contPTFR: StubAction = { type: 'STUB', id: 'INTERNAL_PTFR_CHOOSE_ZONE' };
    return needsInteraction(
      addLog(ctxPTFR, `デッキ公開${topCardsPTFR.length}枚からトラップを選択（任意）`),
      {
        type: 'SEARCH', visibleCards: topCardsPTFR, maxPick: 1,
        thenAction: noopPTFR as EffectAction,
        continuation: contPTFR as EffectAction,
        restDest: 'deck_bottom',  // 未選択カードはデッキ下へ
      },
    );
  }
  // INTERNAL_PTFR_CHOOSE_ZONE: PLACE_TRAP_FROM_REVEALED用のゾーン選択
  if (stub.id === 'INTERNAL_PTFR_CHOOSE_ZONE') {
    const selectedPTFR = ctx.lastProcessedCards?.[0];
    if (!selectedPTFR) return done(addLog(ctx, 'トラップ設置スキップ（選択なし）'));
    const zoneOptsPTFR = [0, 1, 2].map(zi => ({
      id: `ptfr_zone_${zi}`,
      label: `ゾーン${zi + 1}にトラップ設置`,
      // 公開札由来なので手札専用 INTERNAL_SET_TRAP へは流さない。
      action: ({ type: 'STUB', id: 'INTERNAL_PICK_TO_TRAP', value: selectedPTFR, count: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(
      addLog({ ...ctx, lastProcessedCards: [selectedPTFR] },
        `${ctx.cardMap.get(selectedPTFR)?.CardName ?? selectedPTFR}をトラップとしてゾーン選択`),
      { type: 'CHOOSE', options: zoneOptsPTFR, count: 1 },
    );
  }
  // O-56: TRAP_OP / TRAP_OPERATION の文単位ペイロード。
  // parser がどの文に一致したかを渡すので、executor はカード全文を読み直さない。
  // live 18効果・再帰21ノードすべてへの搭載を機械確認後、旧全文フォールバックは撤去済み。
  if ((stub.id === 'TRAP_OP' || stub.id === 'TRAP_OPERATION') && stub.trapOp) {
    if (stub.trapOp === 'set') {
      // 🆕§5.3 `O-59`（2026-09-02）＝`trapFixedZone:'previous'`＝「**それがあったシグニゾーンに**手札から
      //   カード1枚を【トラップ】として設置する」（`WX16-028-E2`）。行き先ゾーンは直前に抜いた
      //   `trap_removed_zones` から復元する（`applyTrapToHand` が書く）。
      // ⚠**ゾーンを選ばせない**＝原文がゾーンを決めているので `INTERNAL_ASK_TRAP_ZONE` は通さず、
      //   `INTERNAL_PICK_TO_TRAP{count:zone}` へ直接渡す。
      // ⚠**記憶が無ければ何もしない**（fail-closed）＝自由ゾーンへ誤設置すると原文と別の効果になる。
      if (stub.trapFixedZone === 'previous') {
        const zonePrev = ctx.ownerState.trap_removed_zones?.[0];
        if (zonePrev === undefined) return done(addLog(ctx, 'トラップ設置：直前のゾーンが分からない'));
        const handPrev = ctx.ownerState.hand;
        if (handPrev.length === 0) return done(addLog(ctx, 'トラップ設置：手札なし'));
        return needsInteraction(addLog(ctx, `ゾーン${zonePrev + 1}に【トラップ】として設置するカードを手札から選択`), {
          type: 'SELECT_TARGET', candidates: handPrev, count: 1,
          optional: stub.upToCount === true, targetScope: 'self_hand',
          thenAction: ({ type: 'STUB', id: 'INTERNAL_PICK_TO_TRAP', count: zonePrev } as StubAction) as EffectAction,
        });
      }
      // 相手の場のシグニ由来は、既存funnelに出所除去の口が無い。
      // 自由ゾーンへ誤設置するより安全なno-opに倒し、O-59候補として分離する。
      if (stub.trapFixedZone || stub.trapSource === 'field_signi') {
        return done(addLog(ctx, `[トラップ設置保留: ${stub.trapFixedZone ?? stub.trapSource}]`));
      }
      const maxSet = Math.max(1, stub.count ?? 1);
      if (stub.trapSource === 'deck_top') {
        const remainder = stub.trapRemainder === 'trash'
          ? { location: 'trash' as const, position: 'bottom' as const }
          : stub.trapRemainder === 'hand'
            ? { location: 'hand' as const, position: 'any' as const }
            : stub.trapRemainder === 'deck_bottom'
              ? { location: 'deck' as const, position: 'bottom' as const }
              : { location: 'deck' as const, position: 'top' as const };
        return exec({
          type: 'LOOK_PICK_CHAIN', owner: 'self', revealCount: maxSet,
          stages: [{ pickCount: maxSet, ...(stub.upToCount ? { pickUpTo: true } : {}), then: 'trap', pickNoun: 'カード' }],
          remainder,
        } as EffectAction, ctx);
      }
      const candidates = stub.trapSource === 'hand'
        ? ctx.ownerState.hand
        : (ctx.lastProcessedCards ?? []).filter(cardNum =>
          ctx.ownerState.deck.includes(cardNum) || ctx.ownerState.hand.includes(cardNum) || ctx.ownerState.energy.includes(cardNum));
      if (candidates.length === 0) return done(addLog(ctx, 'トラップ設置：候補なし'));
      return needsInteraction(addLog(ctx, 'トラップにするカードを選択'), {
        type: 'SELECT_TARGET', candidates,
        count: Math.min(maxSet, candidates.length), optional: stub.upToCount === true,
        targetScope: stub.trapSource === 'hand' ? 'self_hand' : 'self_field',
        thenAction: ({ type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE' } as StubAction) as EffectAction,
      });
    }
    if (stub.trapOp === 'trash') {
      const maxTrash = Math.max(1, stub.count ?? 1);
      const traps = [...(ctx.ownerState.field.signi_traps ?? [null, null, null])] as (string | null)[];
      // 🆕§5.3 `O-59`（2026-09-02）＝「**その**【トラップ】」＝トリガー元シグニと同じゾーンの1枚だけ。
      // 🔴無指定の経路は**先頭から N 枚**なので、別ゾーンのトラップを巻き込む（`WX21-025-E1`）。
      if (stub.trapZoneOfTriggerSource) {
        const trigTZ = ctx.triggeringCardNum;
        // ⚠トリガー元は**相手のシグニ**（`otherState` 側）。トラップは自分の場にある。
        const zoneTZ = trigTZ
          ? ctx.otherState.field.signi.findIndex(stack => stack?.at(-1) === trigTZ)
          : -1;
        const cardTZ = zoneTZ >= 0 ? traps[zoneTZ] : null;
        if (!cardTZ) return done(addLog(ctx, 'そのシグニゾーンに【トラップ】がない'));
        const nextTZ = traps.map((c, i) => (i === zoneTZ ? null : c)) as (string | null)[];
        return done(addLog({
          ...ctx,
          ownerState: { ...ctx.ownerState, trash: [...ctx.ownerState.trash, cardTZ],
            field: { ...ctx.ownerState.field, signi_traps: nextTZ } },
          lastProcessedCards: [cardTZ],
        }, `そのシグニゾーンの【トラップ】をトラッシュへ`));
      }
      const trashed = traps.filter((card): card is string => !!card).slice(0, maxTrash);
      if (trashed.length === 0) return done(addLog(ctx, 'トラップなし'));
      const nextTraps = traps.map(card => card && trashed.includes(card) ? null : card) as (string | null)[];
      return done(addLog({
        ...ctx,
        ownerState: { ...ctx.ownerState, trash: [...ctx.ownerState.trash, ...trashed], field: { ...ctx.ownerState.field, signi_traps: nextTraps } },
        lastProcessedCards: trashed,
      }, `トラップ${trashed.length}枚をトラッシュへ`));
    }
    if (stub.trapOp === 'activate') {
      if (stub.trapSource !== 'field_signi') {
        return exec({ type: 'STUB', id: 'ACTIVATE_TRAP' } as StubAction, ctx);
      }
      const fieldCandidatesAT = ctx.ownerState.field.signi
        .map(stack => stack?.at(-1)).filter((card): card is string => !!card)
        .filter(card => !stub.trapFilter || matchesFilter(ctx.cardMap.get(getCardNum(card)), stub.trapFilter));
      const selectedAT = ctx.lastProcessedCards?.find(card => fieldCandidatesAT.includes(card));
      if (!selectedAT) {
        if (fieldCandidatesAT.length === 0) return done(addLog(ctx, 'トラップアイコンを持つ対象シグニなし'));
        return needsInteraction(addLog(ctx, '《トラップアイコン》を発動するシグニを選択'), {
          type: 'SELECT_TARGET', candidates: fieldCandidatesAT, count: 1, optional: false, targetScope: 'self_field',
          thenAction: ({ ...stub } as StubAction) as EffectAction,
        });
      }
      const targetDataAT = ctx.cardMap.get(getCardNum(selectedAT));
      const targetEffectsAT = targetDataAT?.effects?.length ? targetDataAT.effects : targetDataAT ? parseCardEffects(targetDataAT) : [];
      const trapIconAT = targetEffectsAT.find(effect => effect.effectType === 'TRAP_ICON');
      if (!trapIconAT) return done(addLog(ctx, `${targetDataAT?.CardName ?? selectedAT}: トラップアイコン能力なし`));
      return exec(trapIconAT.action, addLog({ ...ctx, sourceCardNum: selectedAT, trapActivated: true },
        `場の${targetDataAT?.CardName ?? selectedAT}のトラップアイコンを発動`));
    }
    if (stub.trapOp === 'rearrange') {
      // 🆕§5.3 `O-59`（2026-09-02）＝「あなたのすべての【トラップ】を好きなように配置し直す」（`WX17-062-E1`）。
      // 🔑**新しい対話は作らない**＝シグニの並べ替え（`REARRANGE_SIGNI`）と器だけが違うので `mode:'traps'` で共有する。
      const trapsRA = (ctx.ownerState.field.signi_traps ?? []).filter((c): c is string => !!c);
      if (trapsRA.length === 0) return done(addLog(ctx, '配置し直す【トラップ】がない'));
      if (trapsRA.length === 1) return done(addLog(ctx, '【トラップ】が1つだけなので配置は変わらない'));
      return needsInteraction(addLog(ctx, '【トラップ】を好きなように配置し直す'), {
        type: 'REARRANGE_SIGNI', owner: 'self', signiNums: trapsRA, optional: false, mode: 'traps',
      });
    }
    if (stub.trapOp === 'to_check') {
      const pendingLooked = stub.trapSource === 'looked' && stub.value == null && (ctx.lastProcessedCards?.length ?? 0) > 1;
      const pendingOptional = stub.upToCount === true && stub.value == null;
      if (pendingLooked || pendingOptional) {
        const candidates = stub.trapSource === 'trash'
          ? (ctx.lastProcessedCards ?? []).filter(card => ctx.ownerState.trash.includes(card))
          : (ctx.lastProcessedCards ?? []);
        if (candidates.length === 0) return done(addLog(ctx, 'チェックゾーン：候補なし'));
        return needsInteraction(addLog(ctx, 'チェックゾーンに置くカードを選択'), {
          type: 'SELECT_TARGET', candidates, count: 1, optional: stub.upToCount === true,
          targetScope: stub.trapSource === 'trash' ? 'self_trash' : 'self_field',
          thenAction: ({ ...stub, value: pendingLooked ? JSON.stringify(candidates) : 'selected' } as StubAction) as EffectAction,
        });
      }
      const cardToCheck = ctx.lastProcessedCards?.[0]
        ?? (stub.trapSource === 'check' ? ctx.ownerState.field.check : null)
        ?? (stub.trapSource === 'deck_top' ? ctx.ownerState.deck[0] : null)
        // 🆕§5.3 `O-60` 第43バッチ＝デッキの**一番下**（`WXK02-035-E2`）。
        ?? (stub.trapSource === 'deck_bottom' ? (ctx.ownerState.deck.at(-1) ?? null) : null);
      if (!cardToCheck) return done(addLog(ctx, '[チェックゾーン：対象カードなし]'));
      let remainderCards: string[] = [];
      if (stub.trapRemainder === 'hand' && typeof stub.value === 'string' && stub.value.startsWith('[')) {
        try { remainderCards = (JSON.parse(stub.value) as string[]).filter(card => card !== cardToCheck); } catch { remainderCards = []; }
      }
      const remove = new Set([cardToCheck, ...remainderCards]);
      // 🆕`trapCheckRest`＝**バースト確認を伴わずチェックゾーンに留める**（§5.3 `O-143`）。
      //   🔴既定の `field.check` はライフバースト確認中の1枚のスロット＝そこへ置くと確認モーダルが開き、
      //     `BattleScreen` のブロック条件に引っかかって盤面が固まる。原文が「置いてもよい
      //     （チェックゾーンにあるカードはターン終了時にトラッシュに置かれる）」の形は `check_rest` へ。
      const checkField = stub.trapCheckRest
        ? { ...ctx.ownerState.field, check_rest: [...(ctx.ownerState.field.check_rest ?? []), cardToCheck] }
        : { ...ctx.ownerState.field, check: cardToCheck };
      const newOwner = {
        ...ctx.ownerState,
        deck: ctx.ownerState.deck.filter(card => !remove.has(card)),
        hand: [...ctx.ownerState.hand.filter(card => card !== cardToCheck), ...remainderCards.filter(card => !ctx.ownerState.hand.includes(card))],
        trash: ctx.ownerState.trash.filter(card => card !== cardToCheck),
        field: checkField,
      };
      return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: [cardToCheck] },
        `${ctx.cardMap.get(getCardNum(cardToCheck))?.CardName ?? cardToCheck}をチェックゾーンへ`));
    }
    if (stub.trapOp === 'from_check') {
      const checked = ctx.ownerState.field.check;
      if (!checked) return done(addLog(ctx, 'チェックゾーン：カードなし'));
      return done(addLog({
        ...ctx,
        ownerState: { ...ctx.ownerState, trash: [...ctx.ownerState.trash, checked], field: { ...ctx.ownerState.field, check: null } },
        lastProcessedCards: [checked],
      }, `${ctx.cardMap.get(getCardNum(checked))?.CardName ?? checked}をチェックゾーンからトラッシュへ`));
    }
    if (stub.trapOp === 'under_signi') {
      const spellNum = ctx.sourceCardNum;
      if (!spellNum) return done(addLog(ctx, 'シグニの下へ：効果元なし'));
      const topSigni = ctx.ownerState.field.signi.map(stack => stack?.at(-1)).filter((card): card is string => !!card);
      const namedHosts = stub.trapHostNames?.length
        ? topSigni.filter(card => stub.trapHostNames!.includes(ctx.cardMap.get(getCardNum(card))?.CardName ?? ''))
        : topSigni;
      const validHosts = namedHosts.length > 0 ? namedHosts : topSigni;
      const options = validHosts.map(card => ({
        id: `under_${card}`, label: `${ctx.cardMap.get(getCardNum(card))?.CardName ?? card}の下に置く`,
        action: ({ type: 'STUB', id: 'INTERNAL_PLACE_SELF_UNDER_SIGNI', value: card } as StubAction) as EffectAction,
        available: true,
      }));
      options.push({ id: 'skip', label: 'スキップ（トラッシュへ）', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true });
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(getCardNum(spellNum))?.CardName ?? spellNum}をシグニの下に置きますか？`), {
        type: 'CHOOSE', count: 1, options,
      });
    }
    if (stub.trapOp === 'activate_check_burst' || stub.trapOp === 'burst_as_check') {
      // 🔴**対象カードは CHOOSE を出す「前」に確定させる**（続き646 の実機で発見）＝
      //   `lastProcessedCards`（＝直前にトラッシュへ送ったカード）は CHOOSE を1往復すると ctx から消えるため、
      //   再開後に読むと undefined になり**無言で done する**（`WXK11-036-E2` がライフバーストを1度も発動しなかった）。
      //   ⇒ 確定した値を `trapBurstCard` で option の action へ載せて運ぶ。
      const burstCard = stub.trapBurstCard
        ?? (stub.trapOp === 'activate_check_burst'
          ? (ctx.ownerState.field.check ?? ctx.lastProcessedCards?.[0])
          : ctx.lastProcessedCards?.[0]);
      if (!burstCard) return done(addLog(ctx, 'ライフバースト：対象カードなし'));
      if (stub.upToCount && stub.value !== 'activate') {
        return needsInteraction(addLog(ctx, 'ライフバーストを発動しますか？'), {
          type: 'CHOOSE', count: 1, options: [
            { id: 'activate', label: '発動する', available: true, action: ({ ...stub, value: 'activate', trapBurstCard: burstCard } as StubAction) as EffectAction },
            { id: 'skip', label: '発動しない', available: true, action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction },
          ],
        });
      }
      const burstData = ctx.cardMap.get(getCardNum(burstCard));
      const burstEffects = burstData?.effects?.length ? burstData.effects : burstData ? parseCardEffects(burstData) : [];
      const burstEffect = burstEffects.find(effect => effect.effectType === 'LIFE_BURST');
      if (!burstEffect) return done(addLog(ctx, `${burstData?.CardName ?? burstCard}: ライフバーストなし`));
      return exec(burstEffect.action, addLog({ ...ctx, sourceCardNum: burstCard },
        `ライフバーストをチェックゾーンにあるかのように発動: ${burstData?.CardName ?? burstCard}`));
    }
    if (stub.trapOp === 'gain_trap_ability') {
      // 🆕§5.3 `O-59`（2026-09-02）＝「このカードは**それのトラップ能力を得て**、その能力を発動する」
      //   （`WX17-029-TRAP`＝「あなたのトラッシュからカード1枚を対象とし、《無》を支払ってもよい。そうした場合…」）。
      // 🔑**新しいコピー機構は要らなかった**＝`trapOp:'activate'` と同じく「対象の `TRAP_ICON` 効果を exec する」だけ。
      // 🔴**ただし `sourceCardNum` は差し替えない**＝原文は「**このカードが**得て発動する」なので、
      //   コピー元（トラッシュのカード）を効果元にすると能力中の「このシグニ」が**場に居ないカード**を指す。
      //   （`trapOp:'activate'` は「**場のシグニの**トラップアイコンを発動」なので差し替えるのが正しい＝向きが逆。）
      const poolGTA = stub.trapSource === 'trash' ? ctx.ownerState.trash
        : stub.trapSource === 'hand' ? ctx.ownerState.hand
        : (ctx.ownerState.field.signi_traps ?? []).filter((c): c is string => !!c);
      const hasTrapIcon = (cn: string): boolean => {
        const cd = ctx.cardMap.get(getCardNum(cn));
        const effs = cd?.effects?.length ? cd.effects : cd ? parseCardEffects(cd) : [];
        return effs.some(e => e.effectType === 'TRAP_ICON');
      };
      // ⚠**トラップ能力を持つカードだけを候補にする**（持たないカードを選ばせると必ず空振りになる）。
      const candsGTA = poolGTA.filter(hasTrapIcon);
      if (candsGTA.length === 0) return done(addLog(ctx, 'トラップ能力を持つカードが対象領域にない'));
      // 🆕**§5.3 `O-220` 第6バッチ（2026-09-02）＝任意コストの前に宣言した対象を先に読む。**
      // 🔴`lastProcessedCards` は**支払いで上書きされる**ので、
      //   「あなたのトラッシュからカード１枚を**対象とし**、《無》を支払って**もよい**」（`WX17-029-TRAP`）は
      //   支払いのあとで**もう一度選ばされて**いた（対象宣言が支払いより後ろに落ちていた）。
      const storedGTA = stub.fixedCardNums ?? (stub.targetsStored ? ctx.storedTargetCards : undefined);
      const pickedGTA = (storedGTA ?? ctx.lastProcessedCards)?.find(cn => candsGTA.includes(cn));
      if (!pickedGTA) {
        return needsInteraction(addLog(ctx, 'トラップ能力を得るカードを選択'), {
          type: 'SELECT_TARGET', candidates: candsGTA, count: 1, optional: false,
          targetScope: stub.trapSource === 'hand' ? 'self_hand' : 'self_trash',
          thenAction: ({ ...stub } as StubAction) as EffectAction,
        });
      }
      const cdGTA = ctx.cardMap.get(getCardNum(pickedGTA));
      const effsGTA = cdGTA?.effects?.length ? cdGTA.effects : cdGTA ? parseCardEffects(cdGTA) : [];
      const iconGTA = effsGTA.find(e => e.effectType === 'TRAP_ICON');
      if (!iconGTA) return done(addLog(ctx, `${cdGTA?.CardName ?? pickedGTA}: トラップアイコン能力なし`));
      return exec(iconGTA.action, addLog({ ...ctx, trapActivated: true },
        `${cdGTA?.CardName ?? pickedGTA}のトラップ能力を得て発動`));
    }
  }

  // O-56: live の TRAP_OP / TRAP_OPERATION 全21ノードは trapOp ペイロードへ移行済み。
  // カード全文を読む旧フォールバックは、別能力・LBによる誤分岐を再発させるため置かない。
  // INTERNAL_PLACE_SELF_UNDER_SIGNI: sourceCardNum（スペル）をstub.valueのシグニの下に配置しON_PLACED_UNDER_SIGNIを発火
  if (stub.id === 'INTERNAL_PLACE_SELF_UNDER_SIGNI') {
    const hostSigniNumIPSUS = String(stub.value ?? '');
    const spellNumIPSUS = ctx.sourceCardNum;
    if (!hostSigniNumIPSUS || !spellNumIPSUS) return done(addLog(ctx, 'INTERNAL_PLACE_SELF_UNDER_SIGNI: パラメータ不足'));
    const zoneIdxIPSUS = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === hostSigniNumIPSUS);
    if (zoneIdxIPSUS < 0) return done(addLog(ctx, `INTERNAL_PLACE_SELF_UNDER_SIGNI: ホスト${hostSigniNumIPSUS}が見つからない`));
    const newTrashIPSUS = ctx.ownerState.trash.filter(n => n !== spellNumIPSUS);
    const newSigniIPSUS = ctx.ownerState.field.signi.map((stack, i) => {
      if (i !== zoneIdxIPSUS || !stack) return stack;
      return [spellNumIPSUS, ...stack];
    }) as (string[] | null)[];
    const newOwnerIPSUS: PlayerState = { ...ctx.ownerState, trash: newTrashIPSUS, field: { ...ctx.ownerState.field, signi: newSigniIPSUS } };
    const placedCtxIPSUS = addLog({ ...ctx, ownerState: newOwnerIPSUS, sourceCardNum: spellNumIPSUS },
      `${ctx.cardMap.get(spellNumIPSUS)?.CardName ?? spellNumIPSUS}を${ctx.cardMap.get(hostSigniNumIPSUS)?.CardName ?? hostSigniNumIPSUS}の下に配置`);
    // ON_PLACED_UNDER_SIGNI効果を発火（プリパースJSON優先、なければテキストパーサーフォールバック）
    const spellDataIPSUS = ctx.cardMap.get(spellNumIPSUS);
    if (spellDataIPSUS) {
      const spellEffsIPSUS = (spellDataIPSUS.effects && spellDataIPSUS.effects.length > 0)
        ? spellDataIPSUS.effects
        : parseCardEffects(spellDataIPSUS);
      const placedEffIPSUS = spellEffsIPSUS.find(e => e.effectType === 'AUTO' && e.timing?.includes('ON_PLACED_UNDER_SIGNI'));
      if (placedEffIPSUS) return exec(placedEffIPSUS.action, placedCtxIPSUS);
    }
    return done(placedCtxIPSUS);
  }
  // ─── シード系 ────────────────────────────────────────────────────────────
  // PLACE_SEED_FROM_REVEALED: デッキ上4枚を見て1枚を【シード】として設置
  if (stub.id === 'PLACE_SEED_FROM_REVEALED') {
    const topCardsPSFR = ctx.ownerState.deck.slice(0, 4);
    if (topCardsPSFR.length === 0) return done(addLog(ctx, 'PLACE_SEED_FROM_REVEALED: デッキなし'));
    return needsInteraction(addLog(ctx, '【シード】として設置するカードを選択（任意）'), {
      type: 'SEARCH',
      visibleCards: topCardsPSFR,
      maxPick: 1,
      thenAction: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
      continuation: ({ type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_SEED_FROM_DECK: SEARCHで選択したカードをデッキから取り出してゾーン選択
  if (stub.id === 'INTERNAL_SEED_FROM_DECK') {
    const pickedISD = ctx.lastProcessedCards?.[0];
    if (!pickedISD) return done(addLog(ctx, 'シード設置：未選択'));
    const newDeckISD = ctx.ownerState.deck.filter(c => c !== pickedISD);
    const newOwnerISD = { ...ctx.ownerState, deck: newDeckISD };
    // 設置カードは option の seedCards に埋め込む（lastProcessedCards はインタラクション跨ぎで保持されないため）。
    const zoneOptsISD = [0, 1, 2].map(zi => ({
      id: `seed_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi, seedCards: [pickedISD] } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISD }, 'シード設置ゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsISD, count: 1,
    });
  }
  // INTERNAL_SET_SEED: 指定ゾーンにシード設置。設置カードは stub.seedCards[0]（複数枚設置の順次配置）優先、なければ lastProcessedCards[0]。
  if (stub.id === 'INTERNAL_SET_SEED') {
    const zoneIdxISS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardISS = stub.seedCards?.[0] ?? ctx.lastProcessedCards?.[0] ?? null;
    if (!seedCardISS) return done(addLog(ctx, 'シード設置：対象カードなし'));
    const currentSeedsISS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const newTrashISS = [...ctx.ownerState.trash];
    if (currentSeedsISS[zoneIdxISS]) newTrashISS.push(currentSeedsISS[zoneIdxISS]!);
    currentSeedsISS[zoneIdxISS] = seedCardISS;
    // 手札／デッキにあれば取り除く（手札から設置・デッキから設置の両ケース）
    const newHandISS = ctx.ownerState.hand.filter(c => c !== seedCardISS);
    const newDeckISS = ctx.ownerState.deck.filter(c => c !== seedCardISS);
    const newOwnerISS = { ...ctx.ownerState, hand: newHandISS, deck: newDeckISS, trash: newTrashISS, field: { ...ctx.ownerState.field, signi_seeds: currentSeedsISS } };
    return done(addLog({ ...ctx, ownerState: newOwnerISS }, `シード設置: ゾーン${zoneIdxISS + 1}`));
  }
  // PLACE_SEEDS_FROM_REVEALED: デッキ上4枚を見て stub.value 枚まで【シード】設置（WXK04-010 アンコール・シード）。
  // SEARCH で最大N枚選び、continuation の INTERNAL_SEEDS_PLACE_LOOP が1枚ずつゾーン選択して順次設置する。
  if (stub.id === 'PLACE_SEEDS_FROM_REVEALED') {
    const maxNPSDR = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '1'));
    const topCardsPSDR = ctx.ownerState.deck.slice(0, 4);
    if (topCardsPSDR.length === 0) return done(addLog(ctx, 'PLACE_SEEDS_FROM_REVEALED: デッキなし'));
    return needsInteraction(addLog(ctx, `【シード】として設置するカードを最大${maxNPSDR}枚選択（任意）`), {
      type: 'SEARCH',
      visibleCards: topCardsPSDR,
      maxPick: maxNPSDR,
      thenAction: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
      continuation: ({ type: 'STUB', id: 'INTERNAL_SEEDS_PLACE_LOOP' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_SEEDS_PLACE_LOOP: 選択した【シード】候補を1枚ずつ順次設置する。残りは CHOOSE の continuation に積んで
  // インタラクション跨ぎで保持する（execPlaceSigniOnField と同じ連鎖方式。lastProcessedCards に依存しない）。
  if (stub.id === 'INTERNAL_SEEDS_PLACE_LOOP') {
    const seedsISPL = stub.seedCards ?? ctx.lastProcessedCards ?? [];
    if (seedsISPL.length === 0) return done(addLog(ctx, 'シード設置：完了'));
    const [headISPL, ...restISPL] = seedsISPL;
    // head をデッキから取り出してからゾーン選択（設置確定は INTERNAL_SET_SEED）
    const newDeckISPL = ctx.ownerState.deck.filter(c => c !== headISPL);
    const newCtxISPL = { ...ctx, ownerState: { ...ctx.ownerState, deck: newDeckISPL } };
    const zoneOptsISPL = [0, 1, 2].map(zi => ({
      id: `seeds_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi, seedCards: [headISPL] } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(newCtxISPL, `${ctx.cardMap.get(headISPL)?.CardName ?? headISPL}をシード設置`), {
      type: 'CHOOSE',
      options: zoneOptsISPL,
      count: 1,
      continuation: ({ type: 'STUB', id: 'INTERNAL_SEEDS_PLACE_LOOP', seedCards: restISPL } as StubAction) as EffectAction,
    });
  }
  // SEED_BLOOM: シード1枚（または好きな枚数）を開花する
  // SEED_BLOOM_OPTIONAL: 任意でシード1枚を開花する
  if (stub.id === 'SEED_BLOOM' || stub.id === 'SEED_BLOOM_OPTIONAL') {
    const seedsSB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availableZonesSB = [0, 1, 2].filter(zi => seedsSB[zi] !== null);
    if (availableZonesSB.length === 0) return done(addLog(ctx, 'シード開花：シードなし'));
    // 🆕**枚数・対象は payload で決める**（§5.3 `O-60` 第9バッチ・2026-08-29）。
    // 🔴**旧実装は `(EffectText + BurstText).includes('好きな枚数')`** ＝**カード全文**に1度でも出れば
    //   `１枚を対象とし`の開花まで全開花に化ける形だった（A群でいちばん粗い「リテラル1本」）。
    //   しかも全開花は**過剰実行**でもあった＝レベル超過・リミット超過・シグニ以外のシードを
    //   **問答無用でトラッシュへ送る**ので、プレイヤーは「開花しない」を選べなかった。
    // ⚠**payload が無いときは1枚**（fail-closed＝旧既定の「全開花」の逆側）。

    // 「この【シード】を開花する」＝効果元自身がシード（`WXK04-060-E2`）。選ばせずに直接開花する。
    // ⚠**効果元がシードゾーンに居なければ何もしない**（旧実装はここで「どれでも選べる」に落ちていて、
    //   **別のシードを開花できてしまった**）。
    if (stub.seedTargetSelf) {
      const selfNumSB = ctx.sourceCardNum ? getCardNum(ctx.sourceCardNum) : '';
      const selfZoneSB = [0, 1, 2].find(zi => {
        const sd = seedsSB[zi];
        return !!sd && (sd === ctx.sourceCardNum || getCardNum(sd) === selfNumSB);
      });
      if (selfZoneSB === undefined) return done(addLog(ctx, '開花：この【シード】が見つからない'));
      return exec(({ ...stub, id: 'INTERNAL_BLOOM_SEED', value: selfZoneSB } as StubAction) as EffectAction, ctx);
    }

    // 「好きな枚数」＝**1枚ずつ選んで好きなところで止める**ループ（全開花の強制ではない）。
    // ⚠`continuation` ではなく**選択肢の action を SEQUENCE にして自分を呼び直す**＝
    //   `continuation` は選択肢によらず必ず走るので「やめる」で抜けられない。
    if (stub.seedCount === 'any') {
      const anyOptsSB = availableZonesSB.map(zi => {
        const seedName = ctx.cardMap.get(seedsSB[zi]!)?.CardName ?? seedsSB[zi]!;
        return {
          id: `bloom_any_${zi}`,
          label: `ゾーン${zi + 1}（${seedName}）を開花`,
          action: ({ type: 'SEQUENCE', steps: [
            ({ type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi,
              ...(stub.bounceOccupant ? { bounceOccupant: true } : {}) } as StubAction) as EffectAction,
            ({ type: 'STUB', id: stub.id, seedCount: 'any',
              ...(stub.bounceOccupant ? { bounceOccupant: true } : {}) } as StubAction) as EffectAction,
          ] } as SequenceAction) as EffectAction,
          available: true,
        };
      });
      anyOptsSB.push({ id: 'bloom_any_stop', label: 'これで開花を終える', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true });
      return needsInteraction(addLog(ctx, '開花するシードを選択（好きな枚数・終えるまで繰り返す）'), {
        type: 'CHOOSE', options: anyOptsSB, count: 1,
      });
    }
    const optional = stub.id === 'SEED_BLOOM_OPTIONAL';
    const zoneOptsSB = availableZonesSB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSB[zi]!)?.CardName ?? seedsSB[zi]!;
      return {
        id: `bloom_zone_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を開花`,
        // ⚠「代わりにそのシグニを手札に戻してから開花する」の置換フラグを**選択の向こう側まで運ぶ**
        //   （落とすと選んだ瞬間に素の「シグニあり＝開花不可」へ戻る＝§6.4 O-3）。
        action: ({ type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi,
          ...(stub.bounceOccupant ? { bounceOccupant: true } : {}) } as StubAction) as EffectAction,
        available: true,
      };
    });
    if (optional) {
      zoneOptsSB.push({ id: 'bloom_skip', label: 'スキップ', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true });
    }
    return needsInteraction(addLog(ctx, '開花するシードを選択'), {
      type: 'CHOOSE', options: zoneOptsSB, count: 1,
    });
  }
  // INTERNAL_BLOOM_SEED: 指定ゾーンのシードを開花する
  if (stub.id === 'INTERNAL_BLOOM_SEED') {
    const zoneIdxIBS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardIBS = (ctx.ownerState.field.signi_seeds ?? [null, null, null])[zoneIdxIBS];
    if (!seedCardIBS) return done(addLog(ctx, `開花：ゾーン${zoneIdxIBS + 1}にシードなし`));
    const newSeedsIBS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    newSeedsIBS[zoneIdxIBS] = null;
    // 同ゾーンにシグニがある場合は開花しない
    // 🆕`bounceOccupant`＝「代わりにそのシグニを手札に戻してから開花する」（§6.4 O-3・`WDK07-Y07-E1`）。
    //   ⚠戻すのは**スタックの最上段だけ**ではなくそのゾーンのシグニ全体（下のカードも場を離れる）。
    let ctxIBS = ctx;
    const signiStackIBS = ctxIBS.ownerState.field.signi[zoneIdxIBS];
    if (signiStackIBS?.length && stub.bounceOccupant) {
      const newSigniBO = [...ctxIBS.ownerState.field.signi] as (string[] | null)[];
      newSigniBO[zoneIdxIBS] = null;
      ctxIBS = addLog({
        ...ctxIBS,
        ownerState: {
          ...ctxIBS.ownerState,
          hand: [...ctxIBS.ownerState.hand, ...signiStackIBS],
          field: { ...ctxIBS.ownerState.field, signi: newSigniBO },
        },
      }, `${signiStackIBS.map(n => ctxIBS.cardMap.get(getCardNum(n))?.CardName ?? n).join('・')}を手札に戻してから開花`);
    } else if (signiStackIBS?.length) {
      const newOwnerSkip = { ...ctxIBS.ownerState, field: { ...ctxIBS.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctxIBS, ownerState: newOwnerSkip }, `開花：ゾーン${zoneIdxIBS + 1}にシグニあり（開花不可）`));
    }
    const seedCardDataIBS = ctxIBS.cardMap.get(seedCardIBS);
    // シグニ以外はトラッシュへ
    if (!seedCardDataIBS || seedCardDataIBS.Type !== 'シグニ') {
      const newOwnerIBS = { ...ctxIBS.ownerState, trash: [...ctxIBS.ownerState.trash, seedCardIBS], field: { ...ctxIBS.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctxIBS, ownerState: newOwnerIBS }, `開花：シグニでないためトラッシュへ`));
    }
    // ルリグレベルチェック
    const lrigInstIBS = ctxIBS.ownerState.field.lrig.at(-1);
    const lrigCardIBS = lrigInstIBS ? ctxIBS.cardMap.get(lrigInstIBS) : null;
    const lrigLevelIBS = parseInt(lrigCardIBS?.Level ?? '0', 10);
    const signiLevelIBS = parseInt(seedCardDataIBS.Level ?? '0', 10);
    if (signiLevelIBS > lrigLevelIBS) {
      const newOwnerIBS = { ...ctxIBS.ownerState, trash: [...ctxIBS.ownerState.trash, seedCardIBS], field: { ...ctxIBS.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctxIBS, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}レベル${signiLevelIBS}超過でトラッシュへ`));
    }
    // リミットチェック（他ゾーンのシグニレベル合計 + このシグニのレベル > ルリグのリミット）
    const lrigLimitIBS = lrigCardIBS?.Limit === '∞' ? Infinity : (parseInt(lrigCardIBS?.Limit ?? '0', 10) || 0);
    let usedLimitIBS = 0;
    for (let zi = 0; zi < 3; zi++) {
      if (zi === zoneIdxIBS) continue;
      const topInstZI = ctxIBS.ownerState.field.signi[zi]?.at(-1);
      if (topInstZI) usedLimitIBS += parseInt(ctxIBS.cardMap.get(topInstZI)?.Level ?? '0', 10);
    }
    if (usedLimitIBS + signiLevelIBS > lrigLimitIBS) {
      const newOwnerIBS = { ...ctxIBS.ownerState, trash: [...ctxIBS.ownerState.trash, seedCardIBS], field: { ...ctxIBS.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctxIBS, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}リミット超過でトラッシュへ`));
    }
    // 場に出す。lastProcessedCards にセットし BattleScreen が ON_PLAY 効果を積む
    const newSigniIBS = [...ctxIBS.ownerState.field.signi] as (string[] | null)[];
    newSigniIBS[zoneIdxIBS] = [seedCardIBS];
    const newOwnerIBS = { ...ctxIBS.ownerState, field: { ...ctxIBS.ownerState.field, signi: newSigniIBS, signi_seeds: newSeedsIBS } };
    const doneCtxIBS = addLog({ ...ctxIBS, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}がゾーン${zoneIdxIBS + 1}に出た`);
    return { ...(done(doneCtxIBS) as { done: true; ownerState: PlayerState; otherState: PlayerState; logs: string[] }), lastProcessedCards: [seedCardIBS] };
  }
  // SEED_HAND_AND_BLOOM_FROM_DECK_TOP: シード1枚を手札に加え、デッキ上をシード設置
  if (stub.id === 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP') {
    const seedsSHAB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availSHAB = [0, 1, 2].filter(zi => seedsSHAB[zi] !== null);
    if (availSHAB.length === 0) return done(addLog(ctx, 'SEED_HAND_AND_BLOOM_FROM_DECK_TOP: シードなし'));
    const optsSHAB = availSHAB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSHAB[zi]!)?.CardName ?? seedsSHAB[zi]!;
      return {
        id: `shabfdt_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を手札に`,
        action: ({ type: 'STUB', id: 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP', value: zi } as StubAction) as EffectAction,
        available: true,
      };
    });
    return needsInteraction(addLog(ctx, '手札に加えるシードを選択'), {
      type: 'CHOOSE', options: optsSHAB, count: 1,
    });
  }
  // INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: 指定ゾーンのシードを手札に加えてデッキ上をシード設置
  if (stub.id === 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP') {
    const zoneIdxISTH = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedsISTH = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const seedCardISTH = seedsISTH[zoneIdxISTH];
    if (!seedCardISTH) return done(addLog(ctx, 'INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: シードなし'));
    seedsISTH[zoneIdxISTH] = null;
    const newHandISTH = [...ctx.ownerState.hand, seedCardISTH];
    let newOwnerISTH = { ...ctx.ownerState, hand: newHandISTH, field: { ...ctx.ownerState.field, signi_seeds: seedsISTH } };
    if (newOwnerISTH.deck.length === 0) return done(addLog({ ...ctx, ownerState: newOwnerISTH }, `${ctx.cardMap.get(seedCardISTH)?.CardName}を手札へ・デッキなし`));
    const topCardISTH = newOwnerISTH.deck[0];
    const newDeckISTH = newOwnerISTH.deck.slice(1);
    newOwnerISTH = { ...newOwnerISTH, deck: newDeckISTH };
    const zoneOptsISTH = [0, 1, 2].map(zi => ({
      id: `isth_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi, seedCards: [topCardISTH] } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISTH, lastProcessedCards: [topCardISTH] }, `デッキ上${ctx.cardMap.get(topCardISTH)?.CardName ?? topCardISTH}をシード設置`), {
      type: 'CHOOSE', options: zoneOptsISTH, count: 1,
    });
  }
  // SEED_FLOWER_OP: 別シード1枚を開花してデッキ上をシード設置（ヤマレンゲ系）
  if (stub.id === 'SEED_FLOWER_OP') {
    const seedsSFO = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availSFO = [0, 1, 2].filter(zi => seedsSFO[zi] !== null);
    if (availSFO.length === 0) return done(addLog(ctx, 'SEED_FLOWER_OP: シードなし'));
    const optsSFO = availSFO.map(zi => {
      const seedName = ctx.cardMap.get(seedsSFO[zi]!)?.CardName ?? seedsSFO[zi]!;
      return {
        id: `sfo_zone_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を開花`,
        // 開花してからデッキ上をシード設置
        action: ({ type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi } as StubAction,
          { type: 'STUB', id: 'INTERNAL_SEED_FROM_DECK_TOP_PLACE' } as StubAction,
        ] } as SequenceAction) as EffectAction,
        available: true,
      };
    });
    return needsInteraction(addLog(ctx, '開花するシードを選択（ヤマレンゲ効果）'), {
      type: 'CHOOSE', options: optsSFO, count: 1,
    });
  }
  // INTERNAL_SEED_FROM_DECK_TOP_PLACE: デッキ上1枚をシードとして設置
  if (stub.id === 'INTERNAL_SEED_FROM_DECK_TOP_PLACE') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'INTERNAL_SEED_FROM_DECK_TOP_PLACE: デッキなし'));
    const topCardSFDTP = ctx.ownerState.deck[0];
    const newDeckSFDTP = ctx.ownerState.deck.slice(1);
    const newOwnerSFDTP = { ...ctx.ownerState, deck: newDeckSFDTP };
    const zoneOptsSFDTP = [0, 1, 2].map(zi => ({
      id: `sfdtp_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi, seedCards: [topCardSFDTP] } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerSFDTP, lastProcessedCards: [topCardSFDTP] }, `デッキ上${ctx.cardMap.get(topCardSFDTP)?.CardName ?? topCardSFDTP}をシード設置`), {
      type: 'CHOOSE', options: zoneOptsSFDTP, count: 1,
    });
  }
  // BLOOM_CHOOSE: 開花したとき選択効果（個別効果テキスト依存）
  if (stub.id === 'BLOOM_CHOOSE') {
    return done(addLog(ctx, `[開花時選択効果: ${ctx.sourceCardNum}]`));
  }

  // ─── WXDi-P10-034（羅植姫 ユキ//メモリア）：デッキ上を裏向き設置→次の自メインフェイズ開始時に表向き分岐 ───
  // LOOK_PLACE_FACEDOWN_DELAYED (E1本体): デッキ上 count 枚を見て、1枚を裏向きでシグニゾーンに置き（PLACE_FACEDOWN_SIGNI）、
  //   残りを好きな順番でデッキの一番下へ（SEARCH restDest:deck_bottom）。裏向きカードは pending_facedown_flip に記録され、
  //   次の自メインフェイズ開始時に collectTurnTriggers が RESOLVE_FACEDOWN_FLIP を発火する。
  if (stub.id === 'LOOK_PLACE_FACEDOWN_DELAYED') {
    const countLPF = typeof stub.count === 'number' ? stub.count : 4;
    const bonusLPF = typeof stub.value === 'number' ? stub.value : (parseInt(String(stub.value ?? '5000'), 10) || 5000);
    const visibleLPF = ctx.ownerState.deck.slice(0, countLPF);
    if (visibleLPF.length === 0) return done(addLog(ctx, 'デッキが空（裏向き設置スキップ）'));
    const fdArrLPF = ctx.ownerState.field.facedown_signi ?? [];
    const seedArrLPF = ctx.ownerState.field.signi_seeds ?? [];
    const hasEmptyLPF = ctx.ownerState.field.signi.some((z, i) => (!z || z.length === 0) && !fdArrLPF[i] && !seedArrLPF[i]);
    if (!hasEmptyLPF) {
      // 空きシグニゾーンが無く裏向きで置けない → 見た全カードをデッキの一番下へ
      const newDeckLPF = [...ctx.ownerState.deck.slice(visibleLPF.length), ...visibleLPF];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, deck: newDeckLPF } }, `空きシグニゾーンなし：見た${visibleLPF.length}枚をデッキの一番下へ`));
    }
    return needsInteraction(addLog(ctx, `デッキの上から${visibleLPF.length}枚を見る`), {
      type: 'SEARCH',
      visibleCards: visibleLPF,
      maxPick: 1,
      thenAction: ({ type: 'STUB', id: 'PLACE_FACEDOWN_SIGNI', value: bonusLPF } as StubAction) as EffectAction,
      restDest: 'deck_bottom',
    });
  }
  // PLACE_FACEDOWN_SIGNI: SEARCH で選んだ1枚（lastProcessedCards[0]）を裏向きでシグニゾーンに置く。restDest が残りをデッキ下へ運ぶ。
  if (stub.id === 'PLACE_FACEDOWN_SIGNI') {
    const pickedPFS = ctx.lastProcessedCards?.[0];
    if (!pickedPFS) return done(addLog(ctx, '裏向き設置：対象なし'));
    const bonusPFS = typeof stub.value === 'number' ? stub.value : (parseInt(String(stub.value ?? '5000'), 10) || 5000);
    let sPFS: PlayerState = { ...ctx.ownerState };
    const diPFS = sPFS.deck.indexOf(pickedPFS);
    if (diPFS >= 0) { const dk = [...sPFS.deck]; dk.splice(diPFS, 1); sPFS = { ...sPFS, deck: dk }; }
    const fdPFS = [...(sPFS.field.facedown_signi ?? [null, null, null])] as (string | null)[];
    const seedPFS = sPFS.field.signi_seeds ?? [];
    const zoneIdxPFS = sPFS.field.signi.findIndex((z, i) => (!z || z.length === 0) && !fdPFS[i] && !seedPFS[i]);
    if (zoneIdxPFS < 0) {
      return done(addLog({ ...ctx, ownerState: { ...sPFS, deck: [...sPFS.deck, pickedPFS] } }, '裏向き設置：空きゾーンなし→デッキの一番下'));
    }
    fdPFS[zoneIdxPFS] = pickedPFS;
    sPFS = {
      ...sPFS,
      field: { ...sPFS.field, facedown_signi: fdPFS },
      pending_facedown_flip: { cardNum: pickedPFS, zoneIndex: zoneIdxPFS, powerBonus: bonusPFS, sourceCardNum: ctx.sourceCardNum ?? pickedPFS },
    };
    return done(addLog({ ...ctx, ownerState: sPFS },
      `${ctx.cardMap.get(getCardNum(pickedPFS))?.CardName ?? pickedPFS}を裏向きでシグニゾーン${zoneIdxPFS + 1}に置く`));
  }
  // RESOLVE_FACEDOWN_FLIP: 次の自メインフェイズ開始時、裏向きカードを表向きにするか選ぶ（合成トリガーから発火）。
  if (stub.id === 'RESOLVE_FACEDOWN_FLIP') {
    const pfRFF = ctx.ownerState.pending_facedown_flip;
    if (!pfRFF) return done(ctx);
    const fdRFF = (ctx.ownerState.field.facedown_signi ?? [])[pfRFF.zoneIndex];
    if (fdRFF !== pfRFF.cardNum) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, pending_facedown_flip: undefined } }, '裏向きカード消失：表向き分岐スキップ'));
    }
    const nameRFF = ctx.cardMap.get(getCardNum(pfRFF.cardNum))?.CardName ?? pfRFF.cardNum;
    return needsInteraction(addLog(ctx, `${nameRFF}を表向きにするか選択`), {
      type: 'CHOOSE',
      count: 1,
      options: [
        { id: 'flip', label: `表向きにする（パワー＋${pfRFF.powerBonus}）`, available: true, action: ({ type: 'STUB', id: 'FACEDOWN_FLIP_UP' } as StubAction) as EffectAction },
        { id: 'hand', label: '表向きにせず手札に加える', available: true, action: ({ type: 'STUB', id: 'FACEDOWN_FLIP_TO_HAND' } as StubAction) as EffectAction },
      ],
    });
  }
  // FACEDOWN_FLIP_UP: 裏向きカードを表向きにしてシグニゾーンへ（場にあるかぎり field_power_mods で +powerBonus）。
  if (stub.id === 'FACEDOWN_FLIP_UP') {
    const pfFU = ctx.ownerState.pending_facedown_flip;
    if (!pfFU) return done(ctx);
    const fdFU = [...(ctx.ownerState.field.facedown_signi ?? [null, null, null])] as (string | null)[];
    if (fdFU[pfFU.zoneIndex] !== pfFU.cardNum) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, pending_facedown_flip: undefined } }, '表向き：対象消失'));
    }
    fdFU[pfFU.zoneIndex] = null;
    const signiFU = [...ctx.ownerState.field.signi] as (string[] | null)[];
    signiFU[pfFU.zoneIndex] = [pfFU.cardNum];
    const fmodsFU = [...(ctx.ownerState.field_power_mods ?? []), { cardNum: pfFU.cardNum, delta: pfFU.powerBonus, srcCardNum: pfFU.sourceCardNum }];
    const newSFU: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: signiFU, facedown_signi: fdFU },
      field_power_mods: fmodsFU,
      pending_facedown_flip: undefined,
    };
    return done(addLog({ ...ctx, ownerState: newSFU },
      `${ctx.cardMap.get(getCardNum(pfFU.cardNum))?.CardName ?? pfFU.cardNum}を表向きにする（パワー＋${pfFU.powerBonus}）`));
  }
  // FACEDOWN_FLIP_TO_HAND: 表向きにせず、そのカードを手札に加える。
  if (stub.id === 'FACEDOWN_FLIP_TO_HAND') {
    const pfTH = ctx.ownerState.pending_facedown_flip;
    if (!pfTH) return done(ctx);
    const fdTH = [...(ctx.ownerState.field.facedown_signi ?? [null, null, null])] as (string | null)[];
    if (fdTH[pfTH.zoneIndex] === pfTH.cardNum) fdTH[pfTH.zoneIndex] = null;
    const newSTH: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, facedown_signi: fdTH },
      hand: [...ctx.ownerState.hand, pfTH.cardNum],
      pending_facedown_flip: undefined,
    };
    return done(addLog({ ...ctx, ownerState: newSTH },
      `${ctx.cardMap.get(getCardNum(pfTH.cardNum))?.CardName ?? pfTH.cardNum}を手札に加える`));
  }

  // 裏向き系（field.facedown_signi へ移し、場のシグニとして扱わない）
  // REMOVE_SIGNI_ZONE: 対戦相手のシグニゾーンを1つ削除
  if (stub.id === 'REMOVE_SIGNI_ZONE') {
    // 対戦相手のゾーン選択（CHOOSEインタラクション）
    const oppZoneOptionsRSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `相手ゾーン${zi + 1}を削除`,
      action: ({ type: 'STUB', id: 'INTERNAL_REMOVE_SIGNI_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '削除する対戦相手のシグニゾーンを選択'), {
      type: 'CHOOSE', options: oppZoneOptionsRSZ, count: 1,
    });
  }
  // INTERNAL_REMOVE_SIGNI_ZONE: 選択したゾーンを削除してシグニをトラッシュへ
  if (stub.id === 'INTERNAL_REMOVE_SIGNI_ZONE') {
    const zoneIdxIRSZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const oppStackIRSZ = ctx.otherState.field.signi[zoneIdxIRSZ] ?? [];
    // そのゾーンのシグニをすべてトラッシュへ
    let newOtherIRSZ = ctx.otherState;
    for (const cn of oppStackIRSZ) {
      const removed = removeFromField(cn, newOtherIRSZ);
      newOtherIRSZ = { ...removed, trash: [...removed.trash, cn] };
    }
    // ゾーンを無効化＝そのターン中は新たに配置できない（タスク12(lxi) 第10波で死にフィールドから実働化）
    newOtherIRSZ = {
      ...newOtherIRSZ,
      signi_zone_blocks: addSigniZoneBlock(newOtherIRSZ.signi_zone_blocks, { zone: zoneIdxIRSZ }),
    };
    return done(addLog({ ...ctx, otherState: newOtherIRSZ },
      `相手ゾーン${zoneIdxIRSZ + 1}を削除（${oppStackIRSZ.length}体トラッシュ）`));
  }
  // DESIGNATE_SIGNI_ZONE: シグニゾーンを1つ指定する。
  // ⚠`owner` 省略時は従来どおり**相手のゾーン**（原文の大半が「対戦相手のシグニゾーン１つを指定する」）。
  //   `owner:'self'` は「シグニゾーン１つを指定する。…そこにあるシグニのパワーを＋N」型（§6.4 O-16）＝
  //   自分のゾーンを指定する。**保存先を間違えると読み手（target.owner 側の state）と食い違って空振りする。**
  if (stub.id === 'DESIGNATE_SIGNI_ZONE') {
    const ownerDSZ: Owner = stub.owner === 'self' ? 'self' : 'opponent';
    // 「シグニゾーンを**２つまで**指定し」（`WX25-P3-014-E2`）＝複数選択。既定は1つ。
    const countDSZ = Math.max(1, Math.min(3, stub.count ?? 1));
    const zoneOptsDSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}を指定`,
      action: ({ type: 'STUB', id: 'INTERNAL_DESIGNATE_ZONE', value: zi, owner: ownerDSZ } as StubAction) as EffectAction,
      available: true,
    }));
    // ⚠**前回の指定を持ち越さない**＝同じカードを再使用したときに古いゾーンが混ざると、
    //   指定していないゾーンにまで効果が乗る（`designated_zones` は追記式なので必ずここで空にする）。
    const clearedDSZ = ownerDSZ === 'self'
      ? { ...ctx, ownerState: { ...ctx.ownerState, designated_zones: [], designated_zone: undefined } }
      : { ...ctx, otherState: { ...ctx.otherState, designated_zones: [], designated_zone: undefined } };
    return needsInteraction(addLog(clearedDSZ, `指定する${ownerDSZ === 'self' ? '自分の' : '相手'}シグニゾーンを選択`), {
      type: 'CHOOSE', options: zoneOptsDSZ, count: countDSZ,
      ...(countDSZ > 1 ? { multiSelect: true, upTo: true } : {}),
    });
  }
  // INTERNAL_DESIGNATE_ZONE: 選択したゾーンを対象側の State へ**追記**する（複数指定に対応・§6.4 O-16）
  if (stub.id === 'INTERNAL_DESIGNATE_ZONE') {
    const zoneIdxIDZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const ownerIDZ: Owner = stub.owner === 'self' ? 'self' : 'opponent';
    const stIDZ = ownerIDZ === 'self' ? ctx.ownerState : ctx.otherState;
    const zonesIDZ = [...new Set([...(stIDZ.designated_zones ?? []), zoneIdxIDZ])];
    const nextIDZ = { ...stIDZ, designated_zones: zonesIDZ, designated_zone: undefined };
    const ctxIDZ = ownerIDZ === 'self' ? { ...ctx, ownerState: nextIDZ } : { ...ctx, otherState: nextIDZ };
    return done(addLog(ctxIDZ, `${ownerIDZ === 'self' ? '自分の' : '相手'}ゾーン${zoneIdxIDZ + 1}を指定`));
  }
  // BLOCK_OPP_ZONE_PLACEMENT: 対戦相手のシグニゾーンへの新規配置を禁止する。禁止するゾーンの供給源は
  // parser が `zoneBlockSource` で渡す3種類＝指定ゾーン（DESIGNATE_SIGNI_ZONE）／直前に空いたゾーン／
  // 【ウィルス】のあるゾーン（複数）。
  // 期間は parser が渡す（zoneBlockThisTurn/zoneBlockNextTurn）＝原文3枚とも「次のターンの間」を含み、
  // WXDi-P11-009-E3 だけが「このターンと次のターンの間」＋《無》×5 の支払い回避を持つ。
  // ⚠従来は disabled_signi_zones を書くだけで読み手がおらず完全 no-op だった（タスク12(lxi) 第10波で実働化）。
  // ⚠ゾーンの供給源は3種類（`zoneBlockSource`・タスク12(lxxvi)）＝指定ゾーン／直前に空いたゾーン／
  //   【ウィルス】のあるゾーン（複数）。供給源が0ゾーンなら何も禁止しない（空振り）。
  if (stub.id === 'BLOCK_OPP_ZONE_PLACEMENT') {
    const zonesBOZP: number[] =
      stub.zoneBlockSource === 'vacated'
        ? (ctx.otherState.signi_zone_vacated_just ?? [])
        : stub.zoneBlockSource === 'virus'
          ? [0, 1, 2].filter(zi => (ctx.otherState.field.signi_virus?.[zi] ?? 0) > 0)
          // §6.4 O-16: 指定ゾーンの読みは `designatedZones` へ一本化（複数指定＋旧セーブの単一値を吸収）。
          // ⚠旧実装の `?? 0` は**未指定のときゾーン1を問答無用で禁止する**過剰実行だった。
          //   空配列なら直後の早期 return で「禁止するゾーンがない」に落ちる。
          : designatedZones(ctx.otherState);
    if (zonesBOZP.length === 0) return done(addLog(ctx, '配置を禁止するシグニゾーンがない'));
    // 期間指定が一切ない（旧データ互換）ときは従来どおり「次のターンの間」として扱う。
    const nextTurnBOZP = stub.zoneBlockNextTurn ?? !stub.zoneBlockThisTurn;
    let newOtherBOZP = ctx.otherState;
    for (const zBOZP of zonesBOZP) {
      const blockBOZP: SigniZoneBlock = stub.zoneBlockColorless !== undefined
        ? { zone: zBOZP, colorless: stub.zoneBlockColorless }
        : { zone: zBOZP };
      if (stub.zoneBlockThisTurn) {
        newOtherBOZP = { ...newOtherBOZP, signi_zone_blocks: addSigniZoneBlock(newOtherBOZP.signi_zone_blocks, blockBOZP) };
      }
      if (nextTurnBOZP) {
        newOtherBOZP = { ...newOtherBOZP, signi_zone_blocks_next_turn: addSigniZoneBlock(newOtherBOZP.signi_zone_blocks_next_turn, blockBOZP) };
      }
    }
    const spanBOZP = stub.zoneBlockThisTurn && nextTurnBOZP ? 'このターンと次のターン' : nextTurnBOZP ? '次のターン' : 'このターン';
    const costBOZP = stub.zoneBlockColorless ? `（《無》×${stub.zoneBlockColorless}を支払えば配置可）` : '';
    return done(addLog({ ...ctx, otherState: newOtherBOZP },
      `${spanBOZP}の間、相手ゾーン${zonesBOZP.map(z => z + 1).join('・')}へのシグニ配置を禁止${costBOZP}`));
  }
  // ARTS_EXTRA_COST_CONDITION: 追加コスト支払い済みなら選択肢を増やす
  if (stub.id === 'ARTS_EXTRA_COST_CONDITION') {
    const srcAECC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAECC = srcAECC ? (srcAECC.EffectText ?? '') : '';
    const extraPaidAECC = ctx.ownerState.self_optional_effect_taken === true;
    // ①②テキストから選択肢を生成
    const toHWAECC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const choicePatsAECC = [/①([^②③]{1,80})/, /②([^③④]{1,80})/];
    const optsAECC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (let i = 0; i < choicePatsAECC.length; i++) {
      const mat = txtAECC.match(choicePatsAECC[i]);
      if (!mat) continue;
      const ctxtAECC = mat[1].replace(/。\s*$/, '').trim();
      // ①パワー+SHADOW付与
      if (i === 0 && ctxtAECC.match(/パワーを＋([０-９\d]+)/)) {
        const deltaMat = ctxtAECC.match(/パワーを＋([０-９\d]+)/);
        const delta = deltaMat ? parseInt(toHWAECC(deltaMat[1])) : 10000;
        const pmAct: import('../types/effects').PowerModifyAction = {
          type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta,
        };
        optsAECC.push({ id: 'aecc_1', label: `①${ctxtAECC.slice(0, 25)}...`, action: pmAct as EffectAction, available: true });
      }
      // ②ダウン
      if (i === 1 && ctxtAECC.match(/ダウン/)) {
        const downAct: import('../types/effects').DownAction = {
          type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: {} },
        };
        optsAECC.push({ id: 'aecc_2', label: `②${ctxtAECC.slice(0, 25)}...`, action: downAct as EffectAction, available: true });
      }
    }
    if (optsAECC.length === 0) return done(addLog(ctx, '[ARTS_EXTRA_COST_CONDITION: 選択肢解析不可]'));
    const countAECC = extraPaidAECC ? Math.min(2, optsAECC.length) : 1;
    const consumedAECC = { ...ctx, ownerState: { ...ctx.ownerState, self_optional_effect_taken: false } };
    return needsInteraction(addLog(consumedAECC, `追加コスト${extraPaidAECC ? '支払済（2つ選択）' : '未払（1つ選択）'}`), {
      type: 'CHOOSE', options: optsAECC, count: countAECC, multiSelect: countAECC > 1,
    });
  }
  // アーツ条件系（engine: アーツ使用条件未実装）
  if (stub.id === 'ARTS_IMMOVABLE' || stub.id === 'ACCE_COST_REDUCTION') {
    return done(addLog(ctx, `[アーツ/アクセコスト: ${stub.id}]`));
  }
  // PLAY_SPELL_FREE_IGNORE_RESTRICTION: 〈場所〉のスペルをコストなし・限定条件無視で使用
  // 🆕**§5.3 `O-60` 第20バッチ（2026-09-03）＝候補の場所とコスト上限は payload（`playSpellFree`）で受け取る。**
  // 🔴旧実装は**候補ゾーンを持たず常に自分の手札**から選んでいた＝live 3効果のうち
  //   `WX14-014-E1`（対戦相手のトラッシュから）と `WXEX2-14-E3`（いずれかのプレイヤーの
  //   トラッシュから）は**原文と違う場所のカードを使っていた**。
  // 🔴コスト上限も `EffectText + BurstText` の `/コストの合計が(\d+)以下/` を**カード全文**から
  //   拾っており、さらに合計の計算が `parseInt('《青》×２')`＝NaN→0 だったので
  //   **上限フィルタが常に素通り**していた（＝`WXEX2-14` は5コストのスペルも使えた）。
  // ⚠**payload が無ければ使わせない**（fail-closed）＝旧既定へ倒すと過剰実行に戻る。
  if (stub.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION') {
    const specPSFIR = stub.playSpellFree;
    if (!specPSFIR) return done(addLog(ctx, '[スペル無償使用: 場所が無いため何もしない]'));
    const cnPSFIR = ctx.lastProcessedCards?.[0];
    if (!cnPSFIR) {
      // 印刷コストの合計（`Cost` は「《青》×２《無》×１」形式の文字列）。
      const costTotalOf = (c?: CardData): number =>
        (c?.Cost ?? '').match(/×([０-９\d]+)/g)
          ?.reduce((sum, mm) => sum + (parseInt(mm.replace(/[×０-９]/g,
            ch => (ch === '×' ? '' : String.fromCharCode(ch.charCodeAt(0) - 0xFEE0))), 10) || 0), 0) ?? 0;
      const zonePSFIR = specPSFIR.source === 'self_hand' ? ctx.ownerState.hand
        : specPSFIR.source === 'opp_trash' ? ctx.otherState.trash
        : [...ctx.ownerState.trash, ...ctx.otherState.trash];
      const scopePSFIR: TargetScope = specPSFIR.source === 'self_hand' ? 'self_hand'
        : specPSFIR.source === 'opp_trash' ? 'opp_trash' : 'self_trash';
      const spellCandsPSFIR = zonePSFIR.filter(cn => {
        const c = ctx.cardMap.get(getCardNum(cn));
        if (!c || c.Type !== 'スペル') return false;
        if (specPSFIR.maxCostTotal !== undefined && costTotalOf(c) > specPSFIR.maxCostTotal) return false;
        return true;
      });
      if (spellCandsPSFIR.length === 0) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: 対象スペルなし]'));
      const contPSFIR: StubAction = { type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION', playSpellFree: specPSFIR };
      return needsInteraction(addLog(ctx, 'スペルを選択（コストなし・限定条件無視）'), {
        type: 'SELECT_TARGET', candidates: spellCandsPSFIR, count: 1, optional: false,
        targetScope: scopePSFIR, thenAction: contPSFIR as EffectAction,
      });
    }
    // 選択済み：選んだスペルの効果を実行する。
    // ⚠**手札から使ったときだけ自分のトラッシュへ移す**＝トラッシュから使う形（`opp_trash`/`any_trash`）は
    //   カードが既に持ち主のトラッシュに在るので、移動させると**持ち主が入れ替わる**。
    const cardPSFIR = ctx.cardMap.get(getCardNum(cnPSFIR));
    if (!cardPSFIR) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: カードデータなし]'));
    const effectsPSFIR = parseCardEffects(cardPSFIR);
    const mainEffPSFIR = effectsPSFIR.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    if (!mainEffPSFIR) return done(addLog(ctx, `[PLAY_SPELL_FREE_IGNORE_RESTRICTION: ${cardPSFIR.CardName}効果なし]`));
    const ctxPSFIR = specPSFIR.source === 'self_hand'
      ? {
          ...ctx,
          ownerState: {
            ...ctx.ownerState,
            trash: [...ctx.ownerState.trash, cnPSFIR],
            hand: ctx.ownerState.hand.filter(c => c !== cnPSFIR),
          },
        }
      : ctx;
    return exec(mainEffPSFIR.action,
      addLog({ ...ctxPSFIR, sourceCardNum: cnPSFIR, lastProcessedCards: [] },
        `${cardPSFIR.CardName}をコストなし・限定条件無視で使用`));
  }
  // ── USE_SPELL_FROM_TRASH_PAYING_COST（§6.4 O-35・続き530）──
  // 「あなたのトラッシュから〈修飾〉スペル1枚を対象とし、それを**使用**してもよい」（`WXDi-P13-008-E1`）。
  // 🔴既存 `USE_SPELL_FROM_TRASH` は**コストを支払わずに**使うので流用すると過剰実行になる。
  //   原文の「使用」は印刷コストを払う＝ここで払わせてから本体（=USE_SPELL_FROM_TRASH）へ委譲する。
  // 🔑段階は `value` で見分ける（`lastProcessedCards` の有無で見分けると、前段が何か処理していた場合に
  //   選択フェイズを飛ばして無関係なカードを使ってしまう）。
  // ⚠選択を跨ぐと `lastProcessedCards` は失われるので、確定したスペルは `carriedCardNum` で運ぶ。
  if (stub.id === 'USE_SPELL_FROM_TRASH_PAYING_COST') {
    if (stub.value !== 'picked') {
      const filtUS = stub.selectTarget?.filter;
      const candsUS = ctx.ownerState.trash.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), filtUS));
      if (candsUS.length === 0) return done(addLog(ctx, '[トラッシュから使用: 対象のスペルなし]'));
      return needsInteraction(addLog(ctx, 'トラッシュから使用するスペルを選ぶ'), {
        type: 'SELECT_TARGET', candidates: candsUS, count: 1, optional: true,
        targetScope: 'self_trash',
        thenAction: ({ ...stub, value: 'picked' } as StubAction) as EffectAction,
      });
    }
    const cnUS = stub.carriedCardNum ?? ctx.lastProcessedCards?.[0];
    if (!cnUS) return done(addLog(ctx, '[トラッシュから使用: スペル未選択]'));
    const cardUS = ctx.cardMap.get(getCardNum(cnUS));
    if (!cardUS) return done(addLog(ctx, '[トラッシュから使用: カードデータなし]'));
    // 印刷コスト「《白》×１《赤》×２」を色の配列へ展開する（×N は 《》の**外**にある表記）。
    const colorsUS: string[] = [];
    for (const m of (cardUS.Cost ?? '').matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
      if (m[1] === 'コイン') continue;                       // コインはエナではない
      const nUS = parseInt(m[2].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)), 10);
      for (let i = 0; i < nUS; i++) colorsUS.push(m[1]);
    }
    const bodyUS: StubAction = { type: 'STUB', id: 'USE_SPELL_FROM_TRASH', carriedCardNum: cnUS };
    if (colorsUS.length === 0) return exec(bodyUS as EffectAction, ctx);   // 《無》×０ 等＝支払い不要
    const payUS: EffectAction = { type: 'SEQUENCE', steps: [
      { type: 'STUB', id: 'INTERNAL_CMCLG_DEDUCT', value: JSON.stringify(colorsUS) } as StubAction,
      bodyUS,
    ] } as SequenceAction;
    // ⚠**枚数ではなく色で**可否を見る（`canPayOptionalCost`）＝枚数だけ見ると、色が足りないまま
    //   「支払う」を選べてしまい、`INTERNAL_CMCLG_DEDUCT` は該当色が無いとき黙って何も引かない
    //   ＝**タダで使用**になる。
    const canAffordUS = canPayOptionalCost(colorsUS, ctx.ownerState, ctx.cardMap);
    return needsInteraction(addLog(ctx, `${cardUS.CardName}のコストを支払いますか？`), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'pay', label: `使用する（${colorsUS.map(c => `《${c}》`).join('')}）`, action: payUS, available: canAffordUS, costColors: colorsUS },
        { id: 'skip', label: '使用しない', action: ({ type: 'STUB', id: 'INTERNAL_NOOP' } as StubAction) as EffectAction, available: true },
      ],
    });
  }
  // CAST_FROM_OPP_TRASH AUTO: lastProcessedCards未設定時は相手トラッシュからスペル選択
  if (stub.id === 'CAST_FROM_OPP_TRASH' && !(ctx.lastProcessedCards?.length)) {
    const spellsInOppTrash = ctx.otherState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'スペル');
    if (spellsInOppTrash.length === 0) return done(addLog(ctx, '[CAST_FROM_OPP_TRASH: 相手トラッシュにスペルなし]'));
    const contCFOT: StubAction = { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' };
    return needsInteraction(addLog(ctx, '相手トラッシュからスペルを選択して使用'), {
      type: 'SELECT_TARGET', candidates: spellsInOppTrash, count: 1, optional: false,
      targetScope: 'opp_trash', thenAction: contCFOT as EffectAction,
    });
  }
  // フリープレイ系：lastProcessedCards[0] のカードをコストなしでプレイ
  if (stub.id === 'PLAY_FREE' || stub.id === 'CAST_FROM_OPP_TRASH'
      || stub.id === 'PLAY_SPELL_FROM_HAND' || stub.id === 'PLAY_SPELL_FROM_HAND_FREE'
      || stub.id === 'USE_SPELL_FROM_TRASH' || stub.id === 'PLAY_EFFECT_TARGET_CLASS_CHANGE') {
    // ⚠`carriedCardNum` 優先＝支払い CHOOSE を跨ぐと `lastProcessedCards` が消えるため
    //   （`USE_SPELL_FROM_TRASH_PAYING_COST` が確定済みスペルを焼き込んで渡す。§6.4 O-35）。
    const cnPF = stub.carriedCardNum ?? ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnPF) return done(addLog(ctx, '[フリープレイ: 対象カードなし]'));
    const cardPF = ctx.cardMap.get(cnPF);
    if (!cardPF) return done(addLog(ctx, '[フリープレイ: カードデータなし]'));
    const effectsPF = parseCardEffects(cardPF);
    // スペル・アーツは主効果（ACTIVATED/AUTO）を実行
    const mainEffPF = effectsPF.find(e =>
      e.effectType === 'ACTIVATED' ||
      (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    const _containsStub = (a: any, sid: string): boolean => {
      if (!a) return false;
      if (a.type === 'STUB' && a.id === sid) return true;
      if (a.type === 'SEQUENCE') return a.steps?.some((s: any) => _containsStub(s, sid));
      return false;
    };
    if (mainEffPF && !_containsStub(mainEffPF.action, stub.id)) {
      const newCtxPF = { ...ctx, sourceCardNum: cnPF };
      // カードをトラッシュ/使用済みへ移動してから効果実行
      let stateAfterPF = ctx.ownerState;
      let stateOtherAfterPF = ctx.otherState;
      if (stub.id === 'CAST_FROM_OPP_TRASH') {
        // 相手トラッシュから削除（手札にあるかのように使用するため自トラッシュには加えない）
        stateOtherAfterPF = { ...stateOtherAfterPF, trash: stateOtherAfterPF.trash.filter(c => c !== cnPF) };
      } else if (cardPF.Type === 'スペル') {
        // カードの現在位置で移動先を判定（自手札→自トラッシュ / 相手手札から借用→持ち主＝相手のトラッシュ）
        if (stateOtherAfterPF.hand.includes(cnPF)) {
          stateOtherAfterPF = { ...stateOtherAfterPF, hand: stateOtherAfterPF.hand.filter(c => c !== cnPF), trash: [...stateOtherAfterPF.trash, cnPF] };
        } else {
          // USE_SPELL_FROM_TRASH（トラッシュ発の使用）は既にトラッシュにあるため二重積みしない
          stateAfterPF = {
            ...stateAfterPF,
            trash: stateAfterPF.trash.includes(cnPF) ? stateAfterPF.trash : [...stateAfterPF.trash, cnPF],
            hand: stateAfterPF.hand.filter(c => c !== cnPF),
          };
        }
      }
      const execCtxPF = { ...newCtxPF, ownerState: stateAfterPF, otherState: stateOtherAfterPF };
      const resPF = exec(mainEffPF.action, addLog(execCtxPF, `${cardPF.CardName}をコストなしで使用`));
      return resPF;
    }
    // シグニは場に出す
    if (cardPF.Type === 'シグニ') {
      const addPF: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
      return exec(addPF, { ...ctx, lastProcessedCards: [cnPF] });
    }
    return done(addLog(ctx, `[フリープレイ: ${cardPF.CardName} (効果実行不可)]`));
  }
  // REACTIVE_POWER_UP: あなたの効果で相手シグニのパワーが減ったとき、その分だけ自シグニのパワーを上げる
  if (stub.id === 'REACTIVE_POWER_UP') {
    const srcRPU = ctx.sourceCardNum;
    if (!srcRPU) return done(addLog(ctx, '[REACTIVE_POWER_UP: ソースなし]'));
    // 相手シグニの temp_power_mods のマイナス分を合計（このターンに加えられた全マイナス）
    const oppMods = ctx.otherState.temp_power_mods ?? [];
    const totalMinus = oppMods.reduce((acc, m) => acc + (m.delta < 0 ? -m.delta : 0), 0);
    if (totalMinus <= 0) return done(addLog(ctx, 'リアクティブパワーアップ：相手パワーマイナスなし'));
    const selfMods = [...(ctx.ownerState.temp_power_mods ?? [])];
    selfMods.push({ cardNum: srcRPU, delta: totalMinus });
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: selfMods } },
      `リアクティブパワーアップ：+${totalMinus}（相手マイナス合計分）`));
  }
  // ⚠**`POWER_MOD_DISTRIBUTE` は撤去した**（§5.3 `O-140`・2026-08-29）＝
  //   ①総量を**カード全文 regex**（`合わせて＋N`）から読み ②配分は**均等割りの近似**（プレイヤーが選べない）
  //   ③自分の場のシグニ限定（原文 `WX17-021` は修飾語が無く両方選べる）――の3点で原文と食い違っていた。
  //   ⇒ `POWER_MODIFY{splitTotal}` ＋ `ALLOCATE_POWER` 対話に統合した（parser が payload を刻む）。
  // POWER_MOD_ON_FRONT_PLACE: 正面に配置された相手シグニに任意で-3000
  if (stub.id === 'POWER_MOD_ON_FRONT_PLACE') {
    const srcZonePMOP = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnPMOP = srcZonePMOP >= 0 ? ctx.otherState.field.signi[srcZonePMOP]?.at(-1) : undefined;
    if (!frontCnPMOP) return done(addLog(ctx, '正面シグニなし（POWER_MOD_ON_FRONT_PLACE）'));
    const applyPMOP: StubAction = { type: 'STUB', id: 'INTERNAL_PMOP_APPLY' };
    const skipPMOP: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(frontCnPMOP)?.CardName ?? frontCnPMOP}のパワーを－3000してもよい`), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'do',   label: '－3000する',  action: applyPMOP as EffectAction, available: true },
        { id: 'skip', label: 'しない',       action: skipPMOP as EffectAction,  available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_PMOP_APPLY') {
    const srcZoneIPMOP = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnIPMOP = srcZoneIPMOP >= 0 ? ctx.otherState.field.signi[srcZoneIPMOP]?.at(-1) : undefined;
    if (!frontCnIPMOP) return done(addLog(ctx, '正面シグニなし（INTERNAL_PMOP_APPLY）'));
    const modsIPMOP = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: frontCnIPMOP, delta: -3000 }];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMOP } },
      `${ctx.cardMap.get(frontCnIPMOP)?.CardName ?? frontCnIPMOP}のパワー-3000`));
  }
  // POWER_MOD_DOUBLE_DIFF: 対象シグニの基本パワーと自分の基本パワーとの差の2倍でマイナス
  if (stub.id === 'POWER_MOD_DOUBLE_DIFF') {
    const targetNum = ctx.lastProcessedCards?.[0];
    if (!targetNum) return done(addLog(ctx, 'POWER_MOD_DOUBLE_DIFF: 対象なし'));
    const pSelf = parseInt(String(ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum)?.Power ?? '0' : '0')) || 0;
    const pTarget = parseInt(String(ctx.cardMap.get(targetNum)?.Power ?? '0')) || 0;
    if (pTarget <= pSelf) return done(addLog(ctx, `POWER_MOD_DOUBLE_DIFF: 対象パワー${pTarget}≦自パワー${pSelf}、効果なし`));
    const delta = -(pTarget - pSelf) * 2;
    const mods = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetNum, delta }];
    const newOther = { ...ctx.otherState, temp_power_mods: mods };
    return done(addLog({ ...ctx, otherState: newOther }, `${ctx.cardMap.get(targetNum)?.CardName ?? targetNum}パワー${delta}`));
  }
  // レベル修正（engine: ベースレベル変更システム未実装）
  if (stub.id === 'LEVEL_MOD_PER_COUNT') {
    return done(addLog(ctx, '[LEVEL_MOD_PER_COUNT: effectEngineで処理]'));
  }
  // SET_LEVEL_RANGE: 自シグニ1体を選んでレベル1～4に変更（ターン終了時まで）
  if (stub.id === 'SET_LEVEL_RANGE') {
    const targetSLR = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSLR) {
      // Phase 2: レベル選択
      const optsSLR = [1,2,3,4].map(lv => ({
        id: `lv_${lv}`, label: `レベル${lv}にする`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_LEVEL_RANGE', value: `${targetSLR}:${lv}` } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, 'レベルを選択（1～4）'), { type: 'CHOOSE', options: optsSLR, count: 1 });
    }
    // Phase 1: 対象シグニ選択
    const ownSigniSLR = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (ownSigniSLR.length === 0) return done(addLog(ctx, '対象シグニなし（SET_LEVEL_RANGE）'));
    const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const cont: StubAction = { type: 'STUB', id: 'SET_LEVEL_RANGE' };
    return needsInteraction(addLog(ctx, 'レベルを変更するシグニを選択'), {
      type: 'SELECT_TARGET', candidates: ownSigniSLR, count: 1, optional: false,
      targetScope: 'self_field', thenAction: noop as EffectAction, continuation: cont as EffectAction,
    });
  }
  if (stub.id === 'INTERNAL_SET_LEVEL_RANGE') {
    const valISLR = typeof stub.value === 'string' ? stub.value : '';
    const [tgtISLR, lvStrISLR] = valISLR.split(':');
    const lvISLR = parseInt(lvStrISLR);
    if (!tgtISLR || isNaN(lvISLR)) return done(addLog(ctx, '引数不正（INTERNAL_SET_LEVEL_RANGE）'));
    const overridesISLR = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [tgtISLR]: lvISLR };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: overridesISLR } },
      `${ctx.cardMap.get(tgtISLR)?.CardName ?? tgtISLR}の基本レベルを${lvISLR}に変更`));
  }
  // LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）: 「**次の**対戦相手のメインフェイズとアタックフェイズの間、
  // 対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない」（`WX24-P4-007-E1` の③／
  // `WXDi-P14-005-E1` の c2＝全CSVでこの2枚だけ）。
  // 「次の」＝相手の次のターン用の予約として置き、ターン開始時に this_turn へ昇格する
  // （`signi_zone_blocks_next_turn` と同じ作法）。フェイズ限定は実行時に `isOwnTrashMoveLocked` が見る。
  if (stub.id === 'LOCK_OPP_TRASH_MOVE') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, lock_trash_move_next_turn: true } },
      '次の対戦相手のメイン／アタックフェイズの間、対戦相手は自分のトラッシュのカードを動かせない'));
  }
  // PREVENT_ZONE_MOVE_BY_OPP / PREVENT_NON_FIELD_MOVE_BY_OPP: **【常】の宣言型**（§6.4 O-3 続き493）。
  // ⚠🔴期間つきの札は `ZONE_MOVE_IMMUNITY`（typed action）へ移行済み＝ここで state を書かない。
  //   旧実装は `prevent_opp_trash_from` を立てるだけで**失効地点が1つも無く永続していた**
  //   （`WXK10-083-E1` の原文は「このターンと次のターンの間」なのにゲーム終了まで効いていた）。
  // 判定は `collectProtectedZones`（effectsMap から【常】宣言を読む）＋
  //   `activeOppMoveImmunityZones`（期間つき予約）の合成。
  if (stub.id === 'PREVENT_ZONE_MOVE_BY_OPP' || stub.id === 'PREVENT_NON_FIELD_MOVE_BY_OPP') {
    return done(addLog(ctx, '相手効果による移動禁止（【常】宣言・判定は collectProtectedZones）'));
  }
  // PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止
  if (stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP_ALL' || stub.id === 'PREVENT_SELF_DOWN_BY_OPP'
      || stub.id === 'PREVENT_BOUNCE_AND_DOWN_BY_OPP') {
    const newOwnerPSD: PlayerState = { ...ctx.ownerState, prevent_signi_down_by_opp: true };
    return done(addLog({ ...ctx, ownerState: newOwnerPSD }, '相手は自シグニをダウンできない'));
  }
  // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手シグニアタック時パワー制限
  // 🆕**§5.3 `O-60` 第17バッチ（2026-09-03）＝上限値は payload（`oppSigniAttackPowerCap`）で受け取る。**
  // 🔴旧実装は `EffectText + BurstText` に `/パワーが(\d+)以下のシグニは/` を当てていたが、
  //   原文は「シグニ**で**アタックできない」（助詞違い）なので live 2効果とも 1本も当たらず、
  //   既定値 12000 へ落ちていた＝原文 10000 より**広く禁止する過剰実行**だった。
  // ⚠**payload が無ければ ban を張らない**（fail-closed）＝旧既定のように任意の数字へ倒すと
  //   「全シグニアタック不可」に化ける。
  if (stub.id === 'OPP_SIGNI_ATTACK_POWER_RESTRICT') {
    const capOSAPR = stub.oppSigniAttackPowerCap;
    if (capOSAPR === undefined) return done(addLog(ctx, '相手シグニアタックパワー制限：上限値が無いため何もしない'));
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, opp_signi_attack_power_cap: capOSAPR } },
      `相手シグニアタック時パワー上限: ${capOSAPR}`));
  }
  // SIGNI_FLIP_FACEDOWN: 自シグニ（または相手lastProcessed）を裏向きにする
  if (stub.id === 'SIGNI_FLIP_FACEDOWN') {
    if (stub.faceDownTarget) {
      const specSFD = stub.faceDownTarget;
      if (specSFD.delayUntilTurnEnd) {
        if (specSFD.owner !== 'self' || specSFD.count !== 'ALL' || specSFD.returnTiming !== 'NEXT_OPP_ATTACK_PHASE_START') {
          return done(addLog({ ...ctx, lastProcessedCards: [] }, '未対応の遅延裏向き対象'));
        }
        const requestSFD = {
          sourceCardNum: ctx.sourceCardNum ?? '',
          returnTiming: specSFD.returnTiming,
        } as const;
        if (!requestSFD.sourceCardNum) return done(addLog({ ...ctx, lastProcessedCards: [] }, '遅延裏向き：効果元なし'));
        const requestsSFD = [...(ctx.ownerState.turn_end_facedown_all ?? []), requestSFD];
        return done(addLog({
          ...ctx,
          ownerState: { ...ctx.ownerState, turn_end_facedown_all: requestsSFD },
          lastProcessedCards: [],
        }, 'ターン終了時：自分のすべてのシグニを裏向きにする予約'));
      }
      const targetStateSFD = specSFD.owner === 'self' ? ctx.ownerState : ctx.otherState;
      let candsSFD = targetStateSFD.field.signi
        .map(stack => stack?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (specSFD.frontOfSelf) {
        const sourceZoneSFD = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === ctx.sourceCardNum);
        const frontSFD = sourceZoneSFD >= 0 ? ctx.otherState.field.signi[2 - sourceZoneSFD]?.at(-1) : undefined;
        candsSFD = frontSFD ? [frontSFD] : [];
      }
      const selectedSFD = (ctx.lastProcessedCards ?? []).filter(cn => candsSFD.includes(cn));
      const autoSFD = specSFD.frontOfSelf || specSFD.count === 'ALL';
      if (!autoSFD && selectedSFD.length === 0) {
        const maxSFD = typeof specSFD.count === 'number' ? specSFD.count : candsSFD.length;
        if (candsSFD.length === 0) return done(addLog({ ...ctx, lastProcessedCards: [] }, '裏向きにできる対象なし'));
        return selectOrInteract(
          candsSFD,
          maxSFD,
          specSFD.upToCount === true,
          specSFD.owner === 'self' ? 'self_field' : 'opp_field',
          stub as EffectAction,
          undefined,
          { ...ctx, lastProcessedCards: [] },
        );
      }
      const targetsSFD = autoSFD ? candsSFD : selectedSFD;
      let nextStateSFD = targetStateSFD;
      const movedSFD: string[] = [];
      for (const targetSFD of targetsSFD) {
        const moved = moveFieldSigniFacedown(nextStateSFD, targetSFD);
        nextStateSFD = moved.state;
        if (moved.target) movedSFD.push(targetSFD);
      }
      const nextCtxSFD = specSFD.owner === 'self'
        ? { ...ctx, ownerState: nextStateSFD, lastProcessedCards: movedSFD }
        : { ...ctx, otherState: nextStateSFD, lastProcessedCards: movedSFD };
      return done(addLog(nextCtxSFD, movedSFD.length > 0
        ? `${movedSFD.length}体のシグニを裏向きに`
        : '裏向きにできる対象なし'));
    }
    const srcSFD = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcSFD) return done(addLog(ctx, '裏向き: ソースなし'));
    // 自フィールドにいれば ownerState、相手フィールドにいれば otherState を移動
    const inOwnerSFD = ctx.ownerState.field.signi.some(s => s?.includes(srcSFD));
    if (inOwnerSFD) {
      const movedSFD = moveFieldSigniFacedown(ctx.ownerState, srcSFD);
      return done(addLog({ ...ctx, ownerState: movedSFD.state }, movedSFD.target
        ? `${ctx.cardMap.get(getCardNum(srcSFD))?.CardName ?? srcSFD}を裏向きに`
        : '裏向きにできる対象なし'));
    }
    const movedOppSFD = moveFieldSigniFacedown(ctx.otherState, srcSFD);
    return done(addLog({ ...ctx, otherState: movedOppSFD.state }, movedOppSFD.target
      ? `${ctx.cardMap.get(getCardNum(srcSFD))?.CardName ?? srcSFD}を裏向きに`
      : '裏向きにできる対象なし'));
  }
  // ═══ §6.4 O-9(b)＝**繰り返す**遅延ゲート（`WXDi-P07-010-E2`）═══
  // 「各アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、
  //   対戦相手は《無》《無》を支払うか手札を２枚捨ててもよい。そうした場合、それを表向きにする。」
  // ⚠**予約は裏向きカードの持ち主（＝支払う側）に載せる**＝効果を使った側に置くと支払い主体が反転する。
  // ⚠一度きりの `pending_*` と違い**支払われるまで毎アタックフェイズ残す**（解決しても消さない）。
  if (stub.id === 'FACEDOWN_RELEASE_BY_OPP_PAYMENT') {
    const targetFRP = ctx.lastProcessedCards?.[0];
    const fdFRP = ctx.otherState.field.facedown_signi ?? [null, null, null];
    const zoneFRP = targetFRP ? fdFRP.findIndex(n => n === targetFRP) : -1;
    if (!targetFRP || zoneFRP < 0) return done(addLog(ctx, '裏向きの解除条件を予約できる対象がない'));
    const entryFRP = {
      cardNum: targetFRP, zoneIndex: zoneFRP, sourceCardNum: ctx.sourceCardNum ?? '',
      colorlessCost: typeof stub.value === 'number' ? stub.value : 2,
      handDiscard: typeof stub.handDiscard?.count === 'number' ? stub.handDiscard.count : 2,
    };
    return done(addLog({
      ...ctx,
      otherState: {
        ...ctx.otherState,
        facedown_release_by_payment: [...(ctx.otherState.facedown_release_by_payment ?? []), entryFRP],
      },
    }, '各アタックフェイズ開始時の表向き解除（対戦相手の支払い）を予約'));
  }
  // RESOLVE_FACEDOWN_RELEASE_PAYMENT: 上の予約を各アタックフェイズ開始時に問う合成トリガー。
  // ⚠`ctx.ownerState` は**裏向きカードの持ち主**（合成エントリの playerId をその側にしてある）＝
  //   ここで `opponentResponds` を付けると相手側に問うことになり支払い主体が二重反転する。
  if (stub.id === 'RESOLVE_FACEDOWN_RELEASE_PAYMENT') {
    const pendFRP = ctx.ownerState.facedown_release_by_payment ?? [];
    const fdRFP = ctx.ownerState.field.facedown_signi ?? [null, null, null];
    // 「同じ場所にシグニがない場合」＝ゾーンが空いているものだけが解除の候補。
    const liveFRP = pendFRP.find(t => fdRFP[t.zoneIndex] === t.cardNum
      && !(ctx.ownerState.field.signi[t.zoneIndex]?.length));
    if (!liveFRP) return done(addLog(ctx, '表向きにできる裏向きシグニがない（同じ場所にシグニがある）'));
    const canEnergyFRP = ctx.ownerState.energy.length >= liveFRP.colorlessCost;
    const canHandFRP = ctx.ownerState.hand.length >= liveFRP.handDiscard;
    if (!canEnergyFRP && !canHandFRP) return done(addLog(ctx, '表向きにするコストを支払えない'));
    const flipFRP: StubAction = { type: 'STUB', id: 'INTERNAL_FACEDOWN_RELEASE_FLIP', value: liveFRP.cardNum };
    const nameFRP = ctx.cardMap.get(getCardNum(liveFRP.cardNum))?.CardName ?? liveFRP.cardNum;
    return needsInteraction(addLog(ctx, `裏向きの${nameFRP}を表向きにしますか？`), {
      type: 'CHOOSE', count: 1,
      options: [
        {
          id: 'energy', label: `${'《無》'.repeat(liveFRP.colorlessCost)}を支払う`,
          action: flipFRP as EffectAction, available: canEnergyFRP,
          costColors: Array.from({ length: liveFRP.colorlessCost }, () => '無'),
        },
        {
          id: 'hand', label: `手札を${liveFRP.handDiscard}枚捨てる`,
          action: { type: 'SEQUENCE', steps: [
            { type: 'TRASH', asCost: true, target: { type: 'HAND_CARD', owner: 'self', count: liveFRP.handDiscard } },
            flipFRP,
          ] } as EffectAction,
          available: canHandFRP,
        },
        { id: 'skip', label: '支払わない', action: { type: 'SEQUENCE', steps: [] } as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_FACEDOWN_RELEASE_FLIP: 支払い後に裏向きカードを同じゾーンへ表向きで戻し、予約を解除する。
  if (stub.id === 'INTERNAL_FACEDOWN_RELEASE_FLIP') {
    const numIFR = typeof stub.value === 'string' ? stub.value : '';
    const flippedIFR = flipFacedownSigniFaceUp(ctx.ownerState, numIFR);
    if (!flippedIFR.flipped) return done(addLog(ctx, '表向きに戻せなかった（同じ場所にシグニがある）'));
    const remainIFR = (flippedIFR.state.facedown_release_by_payment ?? []).filter(t => t.cardNum !== numIFR);
    return done(addLog({
      ...ctx,
      ownerState: {
        ...flippedIFR.state,
        facedown_release_by_payment: remainIFR.length > 0 ? remainIFR : undefined,
      },
    }, `${ctx.cardMap.get(getCardNum(numIFR))?.CardName ?? numIFR}を表向きにした`));
  }
  // RESOLVE_OPP_ATTACK_FACEDOWN_FLIPS: 次の対戦相手アタックフェイズ開始時の合成トリガー。
  if (stub.id === 'RESOLVE_OPP_ATTACK_FACEDOWN_FLIPS') {
    const resolvedOAF = resolveOpponentAttackFacedownReturns(ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: resolvedOAF.state }, resolvedOAF.flipped.length > 0
      ? `裏向きシグニ${resolvedOAF.flipped.length}体を表向きに`
      : '表向きにできる裏向きシグニなし'));
  }
  // FLIP_FACE_DOWN_SIGNI: この方法で裏向きにした対象だけをターン終了時の表向き復帰へ予約
  if (stub.id === 'FLIP_FACE_DOWN_SIGNI') {
    const targetsFBSFD = ctx.lastProcessedCards ?? [];
    const newOwnerFBSFD = scheduleTurnEndFacedownReturns(ctx.ownerState, targetsFBSFD);
    const newOtherFBSFD = scheduleTurnEndFacedownReturns(ctx.otherState, targetsFBSFD);
    return done(addLog({ ...ctx, ownerState: newOwnerFBSFD, otherState: newOtherFBSFD },
      targetsFBSFD.length > 0 ? `裏向きシグニ${targetsFBSFD.length}体のターン終了時復帰を予約` : '裏向き復帰対象なし'));
  }
  // FACE_DOWN_OPP_SIGNI: 相手シグニを対象選択→裏向きにする
  if (stub.id === 'FACE_DOWN_OPP_SIGNI') {
    // lastProcessedCardsが既にある場合はそれを使用（他STUBから連鎖）
    const preselectedFDOS = ctx.lastProcessedCards?.[0];
    if (preselectedFDOS && ctx.otherState.field.signi.some(s => s?.at(-1) === preselectedFDOS)) {
      const movedFDOS = moveFieldSigniFacedown(ctx.otherState, preselectedFDOS);
      return done(addLog({ ...ctx, otherState: movedFDOS.state }, movedFDOS.target
        ? `${ctx.cardMap.get(getCardNum(preselectedFDOS))?.CardName ?? preselectedFDOS}を裏向きに`
        : '裏向きにできる対象なし'));
    }
    // 相手シグニを選択
    const candsFDOS = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (candsFDOS.length === 0) return done(addLog(ctx, '裏向き対象なし（相手フィールド空）'));
    const applyFDOS: StubAction = { type: 'STUB', id: 'FACE_DOWN_OPP_SIGNI' };
    return selectOrInteract(candsFDOS, 1, false, 'opp_field', applyFDOS as EffectAction, undefined, ctx);
  }
  // 保護・移動防止系（engine: 各防止フラグシステム未実装）
  if (stub.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH'
      || stub.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || stub.id === 'PREVENT_NON_FIELD_MOVE_BY_OPP'
      || stub.id === 'PREVENT_OPP_SIGNI_ABILITY_GAIN'
      || stub.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP' || stub.id === 'PREVENT_POWER_MINUS_BY_OPP'
      || stub.id === 'PREVENT_OPP_POWER_PLUS' || stub.id === 'PREVENT_ABILITY_CHANGE_BY_OPP'
      || stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP'
      || stub.id === 'PREVENT_INFECTED_SIGNI_ACTIVATE'
      || stub.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD'
      || stub.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
    return done(addLog(ctx, `[保護効果: ${stub.id}]`));
  }
  // 🆕SUPPRESS_GAIN_ABILITY:「このターン、あなたのシグニは新たに能力を得られない」（§5.3 `O-159`・2026-08-30）。
  // 🔴**旧実装は上の共通枝で `[保護効果: …]` とログを出すだけの真 no-op**だった（engine のどこにも消費が無く、
  //   `WX13-029-E1` の選択肢③は**選んでも何も起きなかった**）。⇒ 状態フラグを立て、
  //   `effectEngine.ts` の能力付与 `protected_` 収集がこれを読む（ターン終了時リセットは `turnScopedState.ts` に登録済み）。
  // ⚠**対象は「あなたのシグニ」＝効果を使った側**なので `ownerState` に立てる。
  if (stub.id === 'SUPPRESS_GAIN_ABILITY') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, ability_gain_blocked_this_turn: true } },
      'このターン、あなたのシグニは新たに能力を得られない'));
  }
  // PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 次の相手ATKフェイズ開始時、このシグニはアタック不可
  if (stub.id === 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE') {
    const srcPAUOAP = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcPAUOAP) return done(addLog(ctx, 'PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 対象なし'));
    // 対象シグニのオーナー側のblocked_actionsにATTACK:{cardId}を追加
    const inOwnerPAUOAP = ctx.ownerState.field.signi.some(s => s?.includes(srcPAUOAP));
    if (inOwnerPAUOAP) {
      const newBlockedPAUOAP = [...(ctx.ownerState.blocked_actions ?? []), `ATTACK:${srcPAUOAP}`];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedPAUOAP } },
        `${ctx.cardMap.get(srcPAUOAP)?.CardName ?? srcPAUOAP}は次の相手ATKフェイズ中アタック不可`));
    }
    const newBlockedOtherPAUOAP = [...(ctx.otherState.blocked_actions ?? []), `ATTACK:${srcPAUOAP}`];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOtherPAUOAP } },
      `${ctx.cardMap.get(srcPAUOAP)?.CardName ?? srcPAUOAP}は次の相手ATKフェイズ中アタック不可`));
  }
  // PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: このターン対象ルリグのアタックを防ぐ
  if (stub.id === 'PREVENT_TARGET_LRIG_ATTACK_THIS_TURN') {
    const tgtPTLAT = ctx.lastProcessedCards?.[0]
      ?? ctx.otherState.field.lrig.at(-1);
    if (!tgtPTLAT) return done(addLog(ctx, 'ルリグアタック防止: 対象なし'));
    const newNegatedPTLAT = [...new Set([...(ctx.otherState.negated_attacks ?? []), tgtPTLAT])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, negated_attacks: newNegatedPTLAT } },
      `${ctx.cardMap.get(tgtPTLAT)?.CardName ?? tgtPTLAT}はこのターンアタックできない`));
  }
  // INTERNAL_GRANT_NO_ATTACK_LRIG: CHOOSE_SAME_OPTION_TWICEから呼ばれる内部ハンドラ
  // 相手センタールリグにアタック不可（negated_attacks）を付与
  if (stub.id === 'INTERNAL_GRANT_NO_ATTACK_LRIG') {
    const lrigIGNAL = ctx.otherState.field.lrig.at(-1);
    if (!lrigIGNAL) return done(addLog(ctx, 'INTERNAL_GRANT_NO_ATTACK_LRIG: ルリグなし'));
    const newNegIGNAL = [...new Set([...(ctx.otherState.negated_attacks ?? []), lrigIGNAL])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, negated_attacks: newNegIGNAL } },
      `${ctx.cardMap.get(lrigIGNAL)?.CardName ?? lrigIGNAL}はこのターンアタックできない`));
  }
  // BLOCK_OPP_ENCORE_AND_BET: 相手のアンコール/ベット封じ
  if (stub.id === 'BLOCK_OPP_ENCORE_AND_BET') {
    const newBlockedBOEB = [...(ctx.otherState.blocked_actions ?? []), 'ENCORE', 'BET'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOEB } },
      '相手はアンコール・ベットできない'));
  }
  // PREVENT_OWN_ARTS_USE: 自分のアーツ使用封じ
  if (stub.id === 'PREVENT_OWN_ARTS_USE') {
    const newBlockedPOAU = [...(ctx.ownerState.blocked_actions ?? []), 'USE_ARTS'];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedPOAU } },
      '自分はアーツを使用できない'));
  }
  // PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 全シグニの相手パワーマイナス防止（effectEngineで動的処理）
  if (stub.id === 'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP') {
    return done(addLog(ctx, '[全シグニパワーマイナス防止: effectEngineで動的処理]'));
  }
  // グロウコスト変更（engine: グロウコスト処理未実装）
  if (stub.id === 'GROW_COST_ZERO' || stub.id === 'CONDITIONAL_FREE_GROW') {
    const newOwnerGCZ: PlayerState = { ...ctx.ownerState, free_grow_this_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerGCZ }, 'グロウコスト0（次のグロウは無料）'));
  }
  // FREE_GROW_NEXT_TURN: 次の自分ターンのグロウコストを0にする予約（WX03-024-BURST）
  if (stub.id === 'FREE_GROW_NEXT_TURN') {
    const newOwnerGNT: PlayerState = { ...ctx.ownerState, free_grow_next_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerGNT }, '次の自分ターンのグロウは無料'));
  }
  if (stub.id === 'GROW_COST_SUBSTITUTE_TRASH_SIGNI') {
    return done(addLog(ctx, '[グロウコスト代替: GROW_COST_SUBSTITUTE_TRASH_SIGNI]'));
  }
  // コスト軽減系（engine: コスト計算システム未実装）
  // CONDITIONAL_COST_REDUCTION_BY_FIELD: フィールド条件（クラス/枚数）でコスト軽減チェック
  if (stub.id === 'CONDITIONAL_COST_REDUCTION_BY_FIELD') {
    const srcCCRF = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCRF = srcCCRF ? (srcCCRF.EffectText ?? '') + ' ' + (srcCCRF.BurstText ?? '') : '';
    // クラス条件（「＜クラス1＞と＜クラス2＞のシグニがある場合」）
    const classMatchesCCRF = [...txtCCRF.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]).slice(0, 3);
    if (classMatchesCCRF.length > 0) {
      const allPresentCCRF = classMatchesCCRF.every(cls =>
        ctx.ownerState.field.signi.some(s => {
          const top = s?.at(-1); return top && ctx.cardMap.get(top)?.CardClass?.includes(cls);
        })
      );
      return done(addLog(ctx, `コスト軽減条件[${classMatchesCCRF.join('+')}]: ${allPresentCCRF ? '条件達成（コスト軽減適用）' : '条件未達（通常コスト）'}`));
    }
    return done(addLog(ctx, 'コスト軽減条件（条件解析不可）'));
  }
  // CONDITIONAL_CARD_COST_BY_OPP_LRIG: 対戦相手のセンタールリグ色による基本コスト置換の**宣言**。
  // 🆕**§5.3 `O-60` 第48バッチ（2026-09-03）＝カード全文 regex を撤去した。**
  // 🔴このハンドラは**ログを出すだけ**（盤面を1ビットも変えない）なのに、実コストを決める側と
  //   **同じ意味をもう一度カード全文から読み直して**いた＝食い違っても誰も気づけない二重実装だった。
  // ⚠実コストの置換は `src/data/keywordCosts.ts` の `parseCostReplacementTerms`（原文を読む唯一の場所）が
  //   `EffectCost.costReplacement` に刻み、UI 層はその payload だけを読む（§5.3 `O-86` でそう決めた）。
  if (stub.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
    return done(addLog(ctx, '基本コストの置換条件（実コストは使用時に costReplacement payload で適用済み）'));
  }
  if (stub.id === 'SPELL_COST_REDUCTION_BY_TRASH_COUNT' || stub.id === 'SPECIFIC_CARD_COST_REDUCE'
      || stub.id === 'ARTS_COST_REDUCTION_BY_COST_THRESHOLD') {
    return done(addLog(ctx, `[コスト軽減: ${stub.id}]`));
  }
  // REDUCE_PLAY_ABILITY_COST: 次の【出】能力コストを軽減
  if (stub.id === 'REDUCE_PLAY_ABILITY_COST') {
    const srcRPAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRPAC = srcRPAC ? (srcRPAC.EffectText ?? '') : '';
    const toHWRPAC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorMatchRPAC = txtRPAC.match(/発動コストは《([白赤青緑黒無])/);
    const colorRPAC = colorMatchRPAC?.[1] ?? '赤';
    const countMatchRPAC = txtRPAC.match(/《[白赤青緑黒無]×([０-９\d]+)》減る/);
    const countRPAC = countMatchRPAC ? parseInt(toHWRPAC(countMatchRPAC[1])) : 1;
    const newOwnerRPAC: PlayerState = { ...ctx.ownerState, reduce_next_on_play_cost: { color: colorRPAC, count: countRPAC } };
    return done(addLog({ ...ctx, ownerState: newOwnerRPAC }, `次の【出】能力コスト軽減（${colorRPAC}×${countRPAC}）`));
  }
  // ガード系（engine: ガードコスト処理未実装）
  if (stub.id === 'GUARD_ALTERNATIVE_COST' || stub.id === 'EXTRA_GUARD_COST_FROM_HAND' || stub.id === 'OPTIONAL_TRADE_GUARD_SIGNI') {
    return done(addLog(ctx, `[ガードコスト: ${stub.id}]`));
  }
  // 選んだキーワード/保護能力付与（シグニ対象・SELECT_TARGET→CHOOSEインタラクション）
  // ※ SIGNI_GRANT_CHOSEN_ABILITY（WXK09-050＝表記パワー比較＋DOWN/BOUNCE 保護）は execStubPart1 の
  //   カード固有ハンドラが先取りするためここには到達しない（generic は power 比較/保護を扱えない・タスク12(iii)）。
  if (stub.id === 'GRANT_CHOSEN_ABILITY' || stub.id === 'GRANT_CHOSEN_ABILITY_SELF') {
    // §6.4 O-20: 全文だと別能力のクラス限定を拾う（`WXK04-002-E3` は E2 の＜紅蓮＞を拾い、
    // **クラス無指定の対象が＜紅蓮＞へ限定**されていた）のでブロックだけを読む。
    const txtGCA = sourceAbilityText(ctx);
    const toHWGCA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // _SELF は「このシグニは選んだ能力を得る」＝対象選択なしで効果元自身（WXK08-026。
    // 従来は自シグニ全体から SELECT_TARGET していた＝対象の過剰許容・続き77 Opusタスク12(e)）
    const selfTargetGCA = stub.id === 'GRANT_CHOSEN_ABILITY_SELF' && ctx.sourceCardNum
      && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)
      ? ctx.sourceCardNum : undefined;
    // 自フィールドシグニが対象（lastProcessedCardsに対象シグニを設定）
    const targetFromLP = selfTargetGCA ?? (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetFromLP) {
      // SELECT_TARGET: 自フィールドシグニを選択してから能力付与へ。
      // 原文に「あなたの＜X＞のシグニ１体を対象とし」のクラス限定があれば候補に適用する
      // （フィルタ無視の過剰許容を防ぐ＝続き77 Opusタスク12(e)。パワー比較条件等の複雑形は
      //  カード固有ハンドラ（execStubPart1 の SIGNI_GRANT_CHOSEN_ABILITY＝WXK09-050）の管轄）
      const tgtClassGCA = txtGCA.match(/あなたの＜([^＞]+)＞のシグニ[０-９\d]+体を対象とし/)?.[1];
      const fieldCandsGCA = [0,1,2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn)
        .filter(cn => !tgtClassGCA || (ctx.cardMap.get(cn.includes('#') ? cn.slice(0, cn.indexOf('#')) : cn)?.CardClass ?? '').includes(tgtClassGCA));
      if (fieldCandsGCA.length === 0) return done(addLog(ctx, '能力付与対象なし（自シグニなし）'));
      const noopGCA: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contGCA: StubAction = { type: 'STUB', id: stub.id };
      return needsInteraction(addLog(ctx, '能力を付与するシグニを選択'), {
        type: 'SELECT_TARGET', candidates: fieldCandsGCA, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopGCA as EffectAction, continuation: contGCA as EffectAction,
      });
    }
    // 選択数（"N つ選ぶ" or デフォルト1）
    const chooseCountGCA = (() => {
      const m = txtGCA.match(/([２-９2-9\d])つを選ぶ/);
      return m ? parseInt(toHWGCA(m[1])) : 1;
    })();
    // テキストから選択肢を抽出（①②③④⑤）
    const abilitiesGCA: Array<{ label: string; kw: string }> = [];
    const abilityPatterns: Array<[RegExp, string]> = [
      [/【アサシン】/, 'アサシン'],
      [/【ランサー】/, 'ランサー'],
      [/【ダブルクラッシュ】/, 'ダブルクラッシュ'],
      [/【シャドウ】/, 'シャドウ'],
      [/【マルチエナ】/, 'マルチエナ'],
      [/バニッシュされない/, 'バニッシュ不可'],
      [/ダウンしない/, 'ダウン不可'],
      [/手札に戻らない/, 'バウンス不可'],
    ];
    for (const [pat, kw] of abilityPatterns) {
      if (pat.test(txtGCA)) abilitiesGCA.push({ label: `【${kw}】を付与`, kw });
    }
    if (abilitiesGCA.length === 0) return done(addLog(ctx, `[能力付与: ${stub.id}]（能力解析不可）`));
    const optionsGCA = abilitiesGCA.map(({ label, kw }) => ({
      id: kw,
      label,
      action: ({ type: 'STUB', id: 'INTERNAL_GRANT_KEYWORD_TO_TARGET', value: `${targetFromLP}:${kw}` } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '付与する能力を選択'), { type: 'CHOOSE', options: optionsGCA, count: chooseCountGCA });
  }
  // INTERNAL_GRANT_KEYWORD_TO_TARGET: 選択されたキーワード/保護能力を対象シグニに付与
  if (stub.id === 'INTERNAL_GRANT_KEYWORD_TO_TARGET') {
    const valIGKTT = typeof stub.value === 'string' ? stub.value : '';
    const [targetCnIGKTT, kwIGKTT] = valIGKTT.split(':');
    if (!targetCnIGKTT || !kwIGKTT) return done(addLog(ctx, 'キーワード付与失敗（引数不正）'));
    // keyword_grants に追加（保護系も含む）
    let newOwnerIGKTT = ctx.ownerState;
    const grantsIGKTT = { ...(newOwnerIGKTT.keyword_grants ?? {}) };
    grantsIGKTT[targetCnIGKTT] = [...new Set([...(grantsIGKTT[targetCnIGKTT] ?? []), kwIGKTT])];
    newOwnerIGKTT = { ...newOwnerIGKTT, keyword_grants: grantsIGKTT };
    // 保護系は専用フラグも設定
    if (kwIGKTT === 'バニッシュ不可') {
      // otherState.abilities_removed から除外 + banish_redirect 相当フラグなし → keyword_grantsで管理
    }
    return done(addLog({ ...ctx, ownerState: newOwnerIGKTT },
      `${ctx.cardMap.get(targetCnIGKTT)?.CardName ?? targetCnIGKTT}に【${kwIGKTT}】付与`));
  }
  // GRANT_CHOSEN_ABILITY_FROM_PLAY: 【出】で選んだ能力（keyword_grants記録済み）を常在で参照
  // このCONTINUOUS効果はexecStubではなくeffectEngine側でkeyword_grantsを参照するため、ここでは何もしない
  if (stub.id === 'GRANT_CHOSEN_ABILITY_FROM_PLAY') {
    // keyword_grants に同カードの付与済みキーワードがあれば継続（effectEngineで動的参照）
    return done(ctx);
  }
  // SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: 引用常在能力を自シグニに付与（SELECT_TARGET→keyword_grants）
  if (stub.id === 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY') {
    const srcSGQCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSGQCA = srcSGQCA ? (srcSGQCA.EffectText ?? '') + ' ' + (srcSGQCA.BurstText ?? '') : '';
    const toHWSGQCA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 付与するキーワードを引用文から解析
    // 注意: keyword_grantsはhasGrantedKeyword/hasKeyword（utils/keywords.ts）が日本語の正式名でしか
    // 照合しないため、英語短縮コード（'assassin'等）を入れると常時非発火になる（2026-06-17発見・修正）
    let kwSGQCA: string | null = null;
    if (txtSGQCA.includes('アサシン')) kwSGQCA = 'アサシン';
    else if (txtSGQCA.includes('シャドウ')) kwSGQCA = 'シャドウ';
    else if (textHasKeyword(txtSGQCA, 'Sランサー')) kwSGQCA = 'Sランサー';  // ⚠全角【Ｓランサー】を吸収（§6.4 O-28）
    else if (txtSGQCA.includes('ランサー')) kwSGQCA = 'ランサー';
    else if (txtSGQCA.includes('ダブルクラッシュ')) kwSGQCA = 'ダブルクラッシュ';
    // 対象シグニ数
    const countMSGQCA = txtSGQCA.match(/シグニを([０-９\d]+)体まで/);
    const maxCntSGQCA = countMSGQCA ? parseInt(toHWSGQCA(countMSGQCA[1])) : 1;
    // 対象選択済みならキーワードを付与
    if (ctx.lastProcessedCards?.length) {
      if (!kwSGQCA) return done(addLog(ctx, '[SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: キーワード解析不可]'));
      // ⚠引用の内側が「正面のシグニのパワーがN以上であるかぎり」型なら条件つき CONTINUOUS として
      //   `granted_effects` へ（`keyword_grants` は条件を持てず**常時発動**になる。タスク12(cxiv)）。
      const gatedSGQCA = buildGatedKeywordGrant(txtSGQCA, kwSGQCA);
      if (gatedSGQCA) {
        const grantedMapSG = { ...(ctx.ownerState.granted_effects ?? {}) };
        for (const cn of ctx.lastProcessedCards) grantedMapSG[cn] = [...(grantedMapSG[cn] ?? []), gatedSGQCA];
        const namesSG = ctx.lastProcessedCards.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, granted_effects: grantedMapSG } },
          `${namesSG}→【${kwSGQCA}】を条件つきで付与（正面のパワー条件つき）`));
      }
      const newGrants = { ...(ctx.ownerState.keyword_grants ?? {}) };
      for (const cn of ctx.lastProcessedCards) {
        const prev = newGrants[cn] ?? [];
        if (!prev.includes(kwSGQCA)) newGrants[cn] = [...prev, kwSGQCA];
      }
      const names = ctx.lastProcessedCards.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: newGrants } },
        `${names}→【${kwSGQCA}】付与`));
    }
    // 自フィールドからSELECT_TARGET
    const fieldCandsSGQCA = ctx.ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (fieldCandsSGQCA.length === 0) return done(addLog(ctx, '自フィールドにシグニなし'));
    const contSGQCA: StubAction = { type: 'STUB', id: 'SIGNI_GRANT_QUOTED_CONSTANT_ABILITY' };
    return needsInteraction(addLog(ctx, `シグニを選択（引用常在能力付与: ${kwSGQCA ?? '?'}）`), {
      type: 'SELECT_TARGET', candidates: fieldCandsSGQCA, count: maxCntSGQCA, optional: true,
      targetScope: 'self_field', thenAction: contSGQCA as EffectAction,
    });
  }
  // 能力付与系（CONTINUOUS効果はeffectEngineで処理、AUTO/ACTIVATEDでも来た場合のフォールバック）
  // GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRASH_ACTIVATE_ABILITY
  // → collectGrantedFromUnderSigni / collectLrigGrantedEffectsで処理済み
  if (stub.id === 'GRANT_LRIG_ABILITY' || stub.id === 'GRANT_LRIG_TRASH_ACTIVATE_ABILITY'
      || stub.id === 'GRANT_UNDER_LRIG_ACTIVATE_ABILITY' || stub.id === 'GRANT_UNDER_LRIG_AUTO_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_ALL_ABILITIES' || stub.id === 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY'
      || stub.id === 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE'
      || stub.id === 'GRANT_LRIG_TYPE_GAME_WIDE') {
    return done(addLog(ctx, `[能力付与: ${stub.id}]`));
  }
  // COPY_ABILITY: このシグニはその能力を得る
  if (stub.id === 'COPY_ABILITY') {
    const targetCA = ctx.sourceCardNum;
    // ON_KEYWORD_GAINED 経路（WXDi-P04-035）: 「その能力」＝トリガーで得られたキーワード（triggeringKeyword）を
    // watcher 自身（sourceCardNum）へターン終了時まで付与する。keyword_grants は日本語正式名で照合される（短縮コード不可）。
    if (ctx.triggeringKeyword && targetCA) {
      const grantsCA = { ...(ctx.ownerState.keyword_grants ?? {}) };
      grantsCA[targetCA] = [...new Set([...(grantsCA[targetCA] ?? []), ctx.triggeringKeyword])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsCA } },
        `${ctx.cardMap.get(targetCA)?.CardName ?? targetCA}が【${ctx.triggeringKeyword}】を得る（ターン終了時まで）`));
    }
    const copiedCA = ctx.lastProcessedCards?.[0];
    if (!targetCA || !copiedCA) return done(addLog(ctx, 'COPY_ABILITY: 対象またはコピー元なし'));
    const copiedCardCA = ctx.cardMap.get(copiedCA);
    if (!copiedCardCA) return done(addLog(ctx, 'COPY_ABILITY: コピー元カードデータなし'));
    const copiedEffsCA = parseCardEffects(copiedCardCA);
    const grantedCA = { ...(ctx.ownerState.granted_effects ?? {}) };
    grantedCA[targetCA] = [...(grantedCA[targetCA] ?? []), ...copiedEffsCA];
    const newOwnerCA: PlayerState = { ...ctx.ownerState, granted_effects: grantedCA };
    return done(addLog({ ...ctx, ownerState: newOwnerCA },
      `${ctx.cardMap.get(targetCA)?.CardName ?? targetCA}が${copiedCardCA.CardName}の能力をコピー`));
  }
  // GRANT_ABILITY_UNTIL_OPP_TURN: 次の対戦相手のターン終了時まで①の能力を付与
  // 付与先: 直前のTARGET_ONLY等でlastProcessedCardsが設定済みならそれを使う（「あなたのシグニ1体を対象とし」型）。
  // 未設定ならsourceCardNum自身に付与（自己対象型）。テキスト解析は常にsourceCardNum（効果の発生源）から行う。
  if (stub.id === 'GRANT_ABILITY_UNTIL_OPP_TURN') {
    const srcGAUOT = ctx.sourceCardNum;
    if (!srcGAUOT) return done(addLog(ctx, 'GRANT_ABILITY_UNTIL_OPP_TURN: ソースなし'));
    const tgtGAUOT = ctx.lastProcessedCards?.[0] ?? srcGAUOT;
    const srcCardGAUOT = ctx.cardMap.get(srcGAUOT);
    const txtGAUOT = srcCardGAUOT ? (srcCardGAUOT.EffectText ?? '') + ' ' + (srcCardGAUOT.BurstText ?? '') : '';
    // 注意: keyword_grantsはhasGrantedKeyword/hasKeyword（utils/keywords.ts）が日本語の正式名でしか
    // 照合しないため、英語短縮コード（'lancer'等）を入れると常時非発火になる（2026-06-17発見・修正）
    let kwGAUOT: string | null = null;
    if (textHasKeyword(txtGAUOT, 'Sランサー')) kwGAUOT = 'Sランサー';  // ⚠全角【Ｓランサー】を吸収（§6.4 O-28）
    else if (txtGAUOT.includes('ランサー')) kwGAUOT = 'ランサー';
    else if (txtGAUOT.includes('アサシン')) kwGAUOT = 'アサシン';
    else if (txtGAUOT.includes('ダブルクラッシュ')) kwGAUOT = 'ダブルクラッシュ';
    else if (txtGAUOT.includes('シャドウ')) kwGAUOT = 'シャドウ';
    if (!kwGAUOT) return done(addLog(ctx, `GRANT_ABILITY_UNTIL_OPP_TURN: キーワード解析不可`));
    const grantsGAUOT = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsGAUOT[tgtGAUOT] = [...new Set([...(grantsGAUOT[tgtGAUOT] ?? []), kwGAUOT])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsGAUOT } },
      `${ctx.cardMap.get(tgtGAUOT)?.CardName ?? tgtGAUOT}に${kwGAUOT}（次の相手ターン終了まで）`));
  }
  // GRANT_SIGNI_CLASS: このシグニに＜X＞クラスを付与
  if (stub.id === 'GRANT_SIGNI_CLASS') {
    const srcGSC = ctx.sourceCardNum;
    if (!srcGSC) return done(addLog(ctx, 'GRANT_SIGNI_CLASS: ソースなし'));
    const srcCardGSC = ctx.cardMap.get(srcGSC);
    const txtGSC = srcCardGSC ? (srcCardGSC.EffectText ?? '') : '';
    const classMatchGSC = txtGSC.match(/このシグニは＜([^＞]+)＞を持つ/);
    const classNameGSC = classMatchGSC ? classMatchGSC[1] : '';
    if (!classNameGSC) return done(addLog(ctx, 'GRANT_SIGNI_CLASS: クラス解析不可'));
    const existingGSC = srcCardGSC?.CardClass ?? '';
    const newClassGSC = existingGSC.includes(classNameGSC) ? existingGSC : `${existingGSC}:${classNameGSC}`;
    const overridesGSC = { ...(ctx.ownerState.card_class_overrides ?? {}), [srcGSC]: newClassGSC };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesGSC } },
      `${ctx.cardMap.get(srcGSC)?.CardName ?? srcGSC}が＜${classNameGSC}＞を得る`));
  }
  // LAYER_ABILITY_COPY: 対象シグニの《レイヤーアイコン》能力を自シグニにコピー
  // 🆕**§5.3 `O-60` 第22バッチ（2026-09-03）＝候補の場所は payload（`layerCopy.source`）で受け取る。**
  // 🔴旧実装は `card.EffectText.includes('トラッシュから')` を**カード全文**に当てており、
  //   同じカードの別の能力に「トラッシュから」があると**場所が裏返る**形だった。
  // 🔴さらに絞り込みが **`'怪異'` のハードコード**で、`selectTarget.filter`（parser は既に
  //   `story:'怪異'` / `excludeSelf:true` まで出している）を**トラッシュ分岐では丸ごと無視**していた。
  // ⚠**payload と `selectTarget` が揃わなければ何もしない**（fail-closed）。
  if (stub.id === 'LAYER_ABILITY_COPY') {
    const specLAC = stub.layerCopy;
    const filterLAC = stub.selectTarget?.filter;
    if (!specLAC || !filterLAC) return done(addLog(ctx, 'レイヤー能力コピー：対象の指定が無いため何もしない'));
    const srcLAC = ctx.sourceCardNum;
    const candsLAC = specLAC.source === 'trash'
      ? ctx.ownerState.trash.filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), filterLAC))
      : [0, 1, 2]
          .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
          .filter((cn): cn is string => !!cn
            && (!filterLAC.excludeSelf || cn !== srcLAC)
            && matchesFilter(ctx.cardMap.get(cn), filterLAC));
    const scopeLAC: TargetScope = specLAC.source === 'trash' ? 'self_trash' : 'self_field';
    if (candsLAC.length === 0) {
      return done(addLog(ctx, `レイヤー能力コピー：対象なし（${specLAC.source === 'trash' ? 'トラッシュ' : 'フィールド'}）`));
    }
    const noopLAC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contLAC: StubAction = { type: 'STUB', id: 'INTERNAL_LAYER_COPY_APPLY' };
    return needsInteraction(addLog(ctx, 'レイヤー能力をコピーするシグニを選択'), {
      type: 'SELECT_TARGET', candidates: candsLAC, count: 1, optional: false,
      targetScope: scopeLAC, thenAction: noopLAC as EffectAction, continuation: contLAC as EffectAction,
    });
  }
  // INTERNAL_LAYER_COPY_APPLY: 選択シグニのレイヤー能力を自シグニに付与
  if (stub.id === 'INTERNAL_LAYER_COPY_APPLY') {
    const srcILCA = ctx.sourceCardNum;
    const targetILCA = (ctx.lastProcessedCards ?? [])[0];
    if (!srcILCA || !targetILCA) return done(addLog(ctx, 'レイヤーコピー失敗'));
    const targetCardILCA = ctx.cardMap.get(targetILCA);
    const targetTxtILCA = (targetCardILCA?.EffectText ?? '') + ' ' + (targetCardILCA?.BurstText ?? '');
    // レイヤー能力部分を抽出（《レイヤーアイコン》以降）
    const layerMatchILCA = targetTxtILCA.match(/《レイヤーアイコン》(.+)/);
    const layerTxtILCA = layerMatchILCA?.[1] ?? '';
    const knownKwsILCA = ['Sランサー', 'ランサー', 'ダブルクラッシュ', 'アサシン', 'シャドウ', 'マルチエナ'];
    const copiedKwsILCA = knownKwsILCA.filter(kw => textHasKeyword(layerTxtILCA, kw));  // ⚠全角【Ｓランサー】を吸収（§6.4 O-28）
    // Sランサー（パワー条件付き）
    if (layerTxtILCA.match(/12000以上.*Sランサー|Sランサー.*12000以上/)) {
      const srcPow = ctx.effectivePowers?.get(srcILCA) ?? parseInt(ctx.cardMap.get(srcILCA)?.Power ?? '0');
      if (srcPow >= 12000) copiedKwsILCA.push('Sランサー');
    }
    if (copiedKwsILCA.length > 0) {
      const grantsILCA = { ...(ctx.ownerState.keyword_grants ?? {}) };
      grantsILCA[srcILCA] = [...new Set([...(grantsILCA[srcILCA] ?? []), ...copiedKwsILCA])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsILCA } },
        `${targetCardILCA?.CardName ?? targetILCA}のレイヤー【${copiedKwsILCA.join('・')}】をコピー`));
    }
    // パワー保護など非キーワード系
    if (layerTxtILCA.includes('パワーは増減しない')) {
      return done(addLog(ctx, `${targetCardILCA?.CardName ?? targetILCA}のレイヤー（パワー保護）をコピー`));
    }
    return done(addLog(ctx, `${targetCardILCA?.CardName ?? targetILCA}のレイヤー能力をコピー（ログのみ）`));
  }
  // RIDE_ON: ルリグが乗機シグニ1体に任意でライド（ドライブ状態でない場合のみ可）
  if (stub.id === 'RIDE_ON') {
    if ((ctx.ownerState.lrig_riding_signi?.length ?? 0) > 0) {
      return done(addLog(ctx, 'ルリグ既にドライブ状態（RIDE_ON スキップ）'));
    }
    const selectedRO = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (selectedRO) {
      const newOwnerRO = { ...ctx.ownerState, lrig_riding_signi: [selectedRO],
        drive_became_just: [...(ctx.ownerState.drive_became_just ?? []), selectedRO] };
      const namRO = ctx.cardMap.get(selectedRO)?.CardName ?? selectedRO;
      return done(addLog({ ...ctx, ownerState: newOwnerRO }, `ルリグが${namRO}に乗る（ドライブ状態）`));
    }
    const rideCandRO = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (rideCandRO.length === 0) return done(addLog(ctx, '乗機シグニなし（RIDE_ON）'));
    const applyRO: StubAction = { type: 'STUB', id: 'INTERNAL_RIDE_ON_APPLY' };
    const skipRO:  StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'ルリグを乗機シグニに乗せてもよい'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'ride', label: '乗る', action: applyRO as EffectAction, available: true },
        { id: 'skip', label: 'しない', action: skipRO as EffectAction, available: true },
      ],
    });
  }
  return null;
}
