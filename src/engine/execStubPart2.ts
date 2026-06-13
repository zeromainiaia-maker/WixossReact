import type { PlayerState, TargetScope } from '../types';
import { parseCardEffects } from '../data/effectParser';
import type {
  EffectAction,
  StubAction,
  TrashAction,
  AddToFieldAction,
  SequenceAction,
  PlaceUnderSourceSigniAction,
  AddToEnergyAction,
  TransferToHandAction,
  EnergyChargeAction,
  ChooseAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState,
  removeFromField, fieldCandidates, selectOrInteract, splitColors, banishDestination,
  getCardNum,
} from './execUtils';

export function execStubPart2(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
): ExecResult | null {
  // 手札のシグニをこのシグニの下に置く
  if (stub.id === 'HAND_SIGNI_UNDER_SIGNI') {
    const srcHSU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHSU = srcHSU ? (srcHSU.EffectText ?? '') + ' ' + (srcHSU.BurstText ?? '') : '';
    const toHWHSU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHSU = txtHSU.match(/手札から.*シグニ([０-９\d]+)枚/);
    const maxHSU = maxMHSU ? parseInt(toHWHSU(maxMHSU[1])) : 1;
    const classMatchHSU = txtHSU.match(/手札から[<＜]([^>＞]+)[>＞]のシグニ/);
    const targetClassHSU = classMatchHSU?.[1];
    const handSigHSU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (targetClassHSU && !c.CardClass?.includes(targetClassHSU)) return false;
      return true;
    });
    if (handSigHSU.length === 0) return done(addLog(ctx, '手札にシグニなし（シグニ下配置スキップ）'));
    const placeAction: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handSigHSU, maxHSU, false, 'self_hand', placeAction as EffectAction, undefined, ctx);
  }
  // 手札からカードをこのシグニの下に置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT）
  if (stub.id === 'HAND_CARDS_UNDER_SIGNI' || stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT') {
    const srcHCU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHCU = srcHCU ? (srcHCU.EffectText ?? '') + ' ' + (srcHCU.BurstText ?? '') : '';
    const toHWHCU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMHCU = txtHCU.match(/(?:手札から)?カード(?:を)?([０-９\d]+)枚まで/);
    const maxHCU = maxMHCU ? parseInt(toHWHCU(maxMHCU[1])) : 1;
    const optHCU = stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT' || txtHCU.includes('もよい');
    // レベル以上フィルタ（"レベルN以上"）または完全一致フィルタ（"レベルN"）
    const lvMinMHCU = txtHCU.match(/レベル([０-９\d]+)以上/);
    const lvExactMHCU = !lvMinMHCU && txtHCU.match(/レベル([０-９\d]+)(?![以上以下\d])/);
    const minLvHCU = lvMinMHCU ? parseInt(toHWHCU(lvMinMHCU[1])) : 0;
    const exactLvHCU = lvExactMHCU ? parseInt(toHWHCU(lvExactMHCU[1])) : -1;
    const levelOkHCU = (lv: number) => {
      if (exactLvHCU >= 0) return lv === exactLvHCU;
      if (minLvHCU > 0) return lv >= minLvHCU;
      return true;
    };
    // PLACE_SIGNI_UNDER_SELF_OPT で "手札から" の明示がない場合はフィールドから
    const useFieldHCU = stub.id === 'PLACE_SIGNI_UNDER_SELF_OPT' && !txtHCU.includes('手札');
    if (useFieldHCU) {
      const fieldCandsHCU = ctx.ownerState.field.signi.flatMap(stack => {
        const top = stack?.at(-1);
        if (!top || top === ctx.sourceCardNum) return [];
        const c = ctx.cardMap.get(top);
        if (!c) return [];
        return levelOkHCU(parseInt(c.Level ?? '0')) ? [top] : [];
      });
      if (fieldCandsHCU.length === 0) return done(addLog(ctx, '対象シグニなし（PLACE_SIGNI_UNDER_SELF_OPT）'));
      const placeFieldHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'field' };
      return selectOrInteract(fieldCandsHCU, maxHCU, optHCU, 'self_field', placeFieldHCU as EffectAction, undefined, ctx);
    }
    const handCandsHCU = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c) return false;
      return levelOkHCU(parseInt(c.Level ?? '0'));
    });
    if (handCandsHCU.length === 0) return done(addLog(ctx, '手札なし（シグニ下配置スキップ）'));
    const placeActionHCU: PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
    return selectOrInteract(handCandsHCU, maxHCU, optHCU, 'self_hand', placeActionHCU as EffectAction, undefined, ctx);
  }
  // シグニの下のカードをエナゾーンに置く
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
    const declaredLv = ctx.ownerState.declared_guard_restrict_level;
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topCard = ctx.ownerState.deck[0];
    const topData = ctx.cardMap.get(topCard);
    const topLv = parseInt(topData?.Level ?? '-1');
    if (declaredLv !== undefined && topData?.Type === 'シグニ' && topLv === declaredLv) {
      const newDeck = ctx.ownerState.deck.slice(1);
      const newOwner = { ...ctx.ownerState, deck: newDeck, hand: [...ctx.ownerState.hand, topCard] };
      return done(addLog({ ...ctx, ownerState: newOwner },
        `デッキトップ公開：${topData?.CardName ?? topCard}（Lv${topLv}）→手札`));
    }
    const name = topData?.CardName ?? topCard;
    const lv = topData?.Level ?? '?';
    // 一致しない場合はデッキトップに戻す（移動なし）
    return done(addLog(ctx, `デッキトップ公開：${name}（Lv${lv}）→不一致、デッキトップに戻す`));
  }
  // 相手の手札のシグニを見て捨てさせる（宣言数字フィルタ or 有色フィルタ）
  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const declaredLvLOD = ctx.ownerState.declared_guard_restrict_level;
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
    const declaredLvDTE = ctx.ownerState.declared_guard_restrict_level;
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
  // ルリグトラッシュのアーツ枚数に基づくパワー修正（対象1体を先にSELECT_TARGETで選ぶ）
  if (stub.id === 'POWER_MOD_BY_LRIG_TRASH_ARTS') {
    const srcPMLTA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLTA = srcPMLTA ? (srcPMLTA.EffectText ?? '') + ' ' + (srcPMLTA.BurstText ?? '') : '';
    const toHWPMLTA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const artsCountPMLTA = (ctx.ownerState.lrig_trash ?? []).filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ').length;
    const perMPMLTA = txtPMLTA.match(/アーツ([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (!perMPMLTA) return done(addLog(ctx, `パワー修正（ルリグトラッシュアーツ${artsCountPMLTA}枚）`));
    const divisorPMLTA = parseInt(toHWPMLTA(perMPMLTA[1] || '1')) || 1;
    const deltaPMLTA = parseInt(toHWPMLTA(perMPMLTA[2]).replace('－', '-').replace('＋', '+'));
    const totalDeltaPMLTA = Math.floor(artsCountPMLTA / divisorPMLTA) * deltaPMLTA;
    // 対象シグニが未選択なら SELECT_TARGET で相手シグニを選ぶ
    if (!ctx.lastProcessedCards?.length) {
      const oppCandsPMLTA = ctx.otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      if (oppCandsPMLTA.length === 0) return done(addLog(ctx, '対象相手シグニなし（POWER_MOD_BY_LRIG_TRASH_ARTS）'));
      const contPMLTA: StubAction = { type: 'STUB', id: 'POWER_MOD_BY_LRIG_TRASH_ARTS' };
      return needsInteraction(addLog(ctx, '対象シグニを選択（ルリグトラッシュアーツによるパワー修正）'), {
        type: 'SELECT_TARGET', candidates: oppCandsPMLTA, count: 1, optional: false,
        targetScope: 'opp_field', thenAction: contPMLTA as EffectAction,
      });
    }
    const modsPMLTA = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of ctx.lastProcessedCards) modsPMLTA.push({ cardNum: cn, delta: totalDeltaPMLTA });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMLTA } },
      `パワー${totalDeltaPMLTA > 0 ? '+' : ''}${totalDeltaPMLTA}（ルリグトラッシュアーツ${artsCountPMLTA}枚）`));
  }
  // ルリグレベルに基づくパワー修正（相手センタールリグのレベルを参照）
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL') {
    const srcPMLV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLV = srcPMLV ? (srcPMLV.EffectText ?? '') + ' ' + (srcPMLV.BurstText ?? '') : '';
    const toHWPMLV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const oppLrigTop = ctx.otherState.field.lrig.at(-1);
    const oppLrigLv = parseInt(ctx.cardMap.get(oppLrigTop ?? '')?.Level ?? '0');
    const perMPMLV = txtPMLV.match(/レベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMLV) {
      const divisorPMLV = parseInt(toHWPMLV(perMPMLV[1] || '1')) || 1;
      const deltaPMLV = parseInt(toHWPMLV(perMPMLV[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMLV = Math.floor(oppLrigLv / divisorPMLV) * deltaPMLV;
      if (totalDeltaPMLV !== 0) {
        const targetsPMLV = ctx.lastProcessedCards ?? [];
        const modsPMLV = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMLV.length > 0) {
          for (const cn of targetsPMLV) modsPMLV.push({ cardNum: cn, delta: totalDeltaPMLV });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMLV.push({ cardNum: top, delta: totalDeltaPMLV });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMLV } },
          `パワー${totalDeltaPMLV > 0 ? '+' : ''}${totalDeltaPMLV}（相手ルリグLv${oppLrigLv}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（相手ルリグLv${oppLrigLv}）`));
  }
  // ルリグレベル合計に基づくパワー修正（自分のルリグ全体のレベル合計を参照）
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    const srcPMLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMLS = srcPMLS ? (srcPMLS.EffectText ?? '') + ' ' + (srcPMLS.BurstText ?? '') : '';
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
  // トラッシュの特定クラスカード枚数に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_TRASH_CLASS_COUNT') {
    const srcPMTCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTCC = srcPMTCC ? (srcPMTCC.EffectText ?? '') + ' ' + (srcPMTCC.BurstText ?? '') : '';
    const toHWPMTCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchPMTCC = txtPMTCC.match(/トラッシュにある[<＜《]([^>＞》]+)[>＞»]のカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (classMatchPMTCC) {
      const targetClass = classMatchPMTCC[1];
      const divisorPMTCC = parseInt(toHWPMTCC(classMatchPMTCC[2] || '1')) || 1;
      const deltaPMTCC = parseInt(toHWPMTCC(classMatchPMTCC[3]).replace('－', '-').replace('＋', '+'));
      const countPMTCC = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.CardClass?.includes(targetClass);
      }).length;
      const totalDeltaPMTCC = Math.floor(countPMTCC / divisorPMTCC) * deltaPMTCC;
      if (totalDeltaPMTCC !== 0) {
        const targetsPMTCC = ctx.lastProcessedCards ?? [];
        const modsPMTCC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPMTCC.length > 0) {
          for (const cn of targetsPMTCC) modsPMTCC.push({ cardNum: cn, delta: totalDeltaPMTCC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPMTCC.push({ cardNum: top, delta: totalDeltaPMTCC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMTCC } },
          `パワー${totalDeltaPMTCC > 0 ? '+' : ''}${totalDeltaPMTCC}（トラッシュ${targetClass}×${countPMTCC}枚）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（トラッシュクラス数）'));
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
    const srcPMCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMCV = srcPMCV ? (srcPMCV.EffectText ?? '') + ' ' + (srcPMCV.BurstText ?? '') : '';
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
  // 自場の特定クラスシグニのレベル合計に基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL') {
    const srcPMFCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMFCL = srcPMFCL ? (srcPMFCL.EffectText ?? '') + ' ' + (srcPMFCL.BurstText ?? '') : '';
    const toHWPMFCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchFCL = txtPMFCL.match(/[<＜《]([^>＞》]+)[>＞»]のシグニのレベルを合計した数だけ([－＋][０-９\d]+)/);
    if (classMatchFCL) {
      const targetClassFCL = classMatchFCL[1];
      const deltaPerLvFCL = parseInt(toHWPMFCL(classMatchFCL[2]).replace('－', '-').replace('＋', '+'));
      const lvSumFCL = [0, 1, 2].reduce((acc, zi) => {
        const top = ctx.ownerState.field.signi[zi]?.at(-1);
        if (!top) return acc;
        const c = ctx.cardMap.get(top);
        if (!c?.CardClass?.includes(targetClassFCL)) return acc;
        return acc + (parseInt(c.Level ?? '0') || 0);
      }, 0);
      const totalDeltaFCL = lvSumFCL * deltaPerLvFCL;
      if (totalDeltaFCL !== 0) {
        const targetsFCL = ctx.lastProcessedCards ?? [];
        const modsFCL = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsFCL.length > 0) {
          for (const cn of targetsFCL) modsFCL.push({ cardNum: cn, delta: totalDeltaFCL });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsFCL.push({ cardNum: top, delta: totalDeltaFCL });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsFCL } },
          `パワー${totalDeltaFCL > 0 ? '+' : ''}${totalDeltaFCL}（${targetClassFCL}レベル合計${lvSumFCL}）`));
      }
    }
    return done(addLog(ctx, 'パワー修正（フィールドクラスレベル）'));
  }
  // シグニ下のカード枚数×delta → 2体まで相手シグニパワー修正（SELECT→INTERNAL）
  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const toHWPMUC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMUC = srcPMUC ? (srcPMUC.EffectText ?? '') + ' ' + (srcPMUC.BurstText ?? '') : '';
    const mPMUC = txtPMUC.match(/下にあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (!mPMUC) return done(addLog(ctx, '解析失敗（POWER_MOD_BY_UNDER_COUNT）'));
    const maxMPMUC = txtPMUC.match(/シグニ([０-９\d]*)体まで/);
    const maxTargetsPMUC = maxMPMUC ? parseInt(toHWPMUC(maxMPMUC[1])) : 2;
    const oppCandsPMUC = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMUC.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_MOD_BY_UNDER_COUNT）'));
    const noopPMUC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contPMUC: StubAction = { type: 'STUB', id: 'INTERNAL_PMBUC_APPLY' };
    return selectOrInteract(oppCandsPMUC, Math.min(maxTargetsPMUC, oppCandsPMUC.length), false, 'opp_field', noopPMUC as EffectAction, contPMUC as EffectAction, ctx);
  }
  if (stub.id === 'INTERNAL_PMBUC_APPLY') {
    const selected = ctx.lastProcessedCards ?? [];
    if (selected.length === 0) return done(addLog(ctx, '対象なし（INTERNAL_PMBUC_APPLY）'));
    const toHWUC2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const src2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txt2 = src2 ? (src2.EffectText ?? '') + ' ' + (src2.BurstText ?? '') : '';
    const m2 = txt2.match(/下にあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    const divisorUC2 = m2 ? parseInt(toHWUC2(m2[1] || '1')) || 1 : 1;
    const deltaUC2 = m2 ? parseInt(toHWUC2(m2[2]).replace('－', '-').replace('＋', '+')) : -3000;
    const srcZoneUC2 = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const underCntUC2 = srcZoneUC2 >= 0 ? Math.max(0, (ctx.ownerState.field.signi[srcZoneUC2]?.length ?? 1) - 1) : 0;
    const totalDeltaUC2 = Math.floor(underCntUC2 / divisorUC2) * deltaUC2;
    const modsUC2 = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of selected) modsUC2.push({ cardNum: cn, delta: totalDeltaUC2 });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsUC2 } },
      `${selected.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・')}のパワー${totalDeltaUC2}（下${underCntUC2}枚）`));
  }
  // シグニゾーンのカード総数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰）
  if (stub.id === 'POWER_DOWN_BY_ZONE_CARD_COUNT') {
    const toHWPDZCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPDZCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDZCC = srcPDZCC ? (srcPDZCC.EffectText ?? '') + ' ' + (srcPDZCC.BurstText ?? '') : '';
    const mPDZCC = txtPDZCC.match(/シグニゾーンにあるカード([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    const divisorPDZCC = mPDZCC ? parseInt(toHWPDZCC(mPDZCC[1] || '1')) || 1 : 1;
    const deltaPDZCC = mPDZCC ? parseInt(toHWPDZCC(mPDZCC[2]).replace('－', '-').replace('＋', '+')) : -2000;
    const totalCardsPDZCC = ctx.ownerState.field.signi.reduce((acc, stack) => acc + (stack?.length ?? 0), 0);
    const totalDeltaPDZCC = Math.floor(totalCardsPDZCC / divisorPDZCC) * deltaPDZCC;
    const existPDZCC = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPDZCC) {
      const modsPDZCC = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPDZCC, delta: totalDeltaPDZCC }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDZCC } },
        `${ctx.cardMap.get(existPDZCC)?.CardName ?? existPDZCC}のパワー${totalDeltaPDZCC}（ゾーン${totalCardsPDZCC}枚）`));
    }
    const oppCandsPDZCC = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPDZCC.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_DOWN_BY_ZONE_CARD_COUNT）'));
    const contPDZCC: StubAction = { type: 'STUB', id: 'POWER_DOWN_BY_ZONE_CARD_COUNT' };
    const noopPDZCC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPDZCC, 1, false, 'opp_field', noopPDZCC as EffectAction, contPDZCC as EffectAction, ctx);
  }
  // トラッシュに置かれたシグニのレベルに基づくパワー修正（1体対象 or 全体）
  if (stub.id === 'OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL') {
    const srcPDTL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPDTL = srcPDTL ? (srcPDTL.EffectText ?? '') + ' ' + (srcPDTL.BurstText ?? '') : '';
    const toHWPDTL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const perMPDTL = txtPDTL.match(/トラッシュに置かれた.*?シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    const trashedCards = ctx.lastProcessedCards ?? [];
    const lvSumTrashedPDTL = trashedCards.reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    if (perMPDTL && lvSumTrashedPDTL > 0) {
      const divisorPDTL = parseInt(toHWPDTL(perMPDTL[1] || '1')) || 1;
      const deltaPDTL = parseInt(toHWPDTL(perMPDTL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPDTL = Math.floor(lvSumTrashedPDTL / divisorPDTL) * deltaPDTL;
      if (totalDeltaPDTL !== 0) {
        // 「対戦相手のシグニ１体を対象とし」の場合 SELECT_TARGET で1体選択
        const isSingleTarget = txtPDTL.includes('対戦相手のシグニ１体を対象とし');
        const oppCandsPDTL = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
        if (isSingleTarget && oppCandsPDTL.length > 0) {
          // pre-calculated delta を continuation stub の value に埋め込む（thenAction=STUB は applyDirectAction で無視されるため continuation を使用）
          const noopPDTL: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
          const applyPDTL: StubAction = { type: 'STUB', id: 'INTERNAL_APPLY_POWER_DELTA_OPP', value: totalDeltaPDTL };
          return selectOrInteract(oppCandsPDTL, 1, false, 'opp_field', noopPDTL as EffectAction, applyPDTL as EffectAction, ctx);
        }
        // 全体対象: 全シグニに適用
        const modsPDTL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (const cn of oppCandsPDTL) modsPDTL.push({ cardNum: cn, delta: totalDeltaPDTL });
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPDTL } },
          `パワー${totalDeltaPDTL > 0 ? '+' : ''}${totalDeltaPDTL}（トラッシュ済みLv合計${lvSumTrashedPDTL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（トラッシュシグニLv合計${lvSumTrashedPDTL}）`));
  }
  // INTERNAL_APPLY_POWER_DELTA_OPP: SELECT_TARGET後に対象シグニへparent deltaを適用
  if (stub.id === 'INTERNAL_APPLY_POWER_DELTA_OPP') {
    const deltaIAPDO = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const targetIAPDO = ctx.lastProcessedCards ?? [];
    if (targetIAPDO.length === 0 || deltaIAPDO === 0) return done(addLog(ctx, 'パワー修正: 対象なし'));
    const modsIAPDO = [...(ctx.otherState.temp_power_mods ?? [])];
    for (const cn of targetIAPDO) modsIAPDO.push({ cardNum: cn, delta: deltaIAPDO });
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIAPDO } },
      `パワー${deltaIAPDO > 0 ? '+' : ''}${deltaIAPDO}`));
  }
  // アタックしたシグニのレベルに基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_ATTACKER_LEVEL') {
    const srcPMAL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMAL = srcPMAL ? (srcPMAL.EffectText ?? '') + ' ' + (srcPMAL.BurstText ?? '') : '';
    const toHWPMAL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const attackerLvPMAL = parseInt(toHWPMAL(ctx.cardMap.get(ctx.sourceCardNum ?? '')?.Level ?? '0')) || 0;
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
  // 公開したシグニのレベルに基づくパワー修正（lastProcessedCards使用）
  if (stub.id === 'POWER_MOD_PER_REVEALED_LEVEL') {
    const srcPMRL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMRL = srcPMRL ? (srcPMRL.EffectText ?? '') + ' ' + (srcPMRL.BurstText ?? '') : '';
    const toHWPMRL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedPMRL = ctx.lastProcessedCards ?? [];
    const lvSumPMRL = revealedPMRL.reduce((acc, cn) => {
      const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
      return acc + (isNaN(lv) ? 0 : lv);
    }, 0);
    const perMPMRL = txtPMRL.match(/シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMRL) {
      const divisorPMRL = parseInt(toHWPMRL(perMPMRL[1] || '1')) || 1;
      const deltaPMRL = parseInt(toHWPMRL(perMPMRL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMRL = Math.floor(lvSumPMRL / divisorPMRL) * deltaPMRL;
      if (totalDeltaPMRL !== 0) {
        const modsPMRL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsPMRL.push({ cardNum: top, delta: totalDeltaPMRL });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMRL } },
          `パワー${totalDeltaPMRL > 0 ? '+' : ''}${totalDeltaPMRL}（公開シグニLv${lvSumPMRL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（公開シグニレベル${lvSumPMRL}）`));
  }
  // 複数の自シグニにパワー+5000（SELECT_TARGET→INTERNAL_POWER_UP_SELECTED）
  if (stub.id === 'MULTI_SIGNI_POWER_UP_5000') {
    const srcMSPU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSPU = srcMSPU ? (srcMSPU.EffectText ?? '') + ' ' + (srcMSPU.BurstText ?? '') : '';
    const toHWMSPU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchMSPU = txtMSPU.match(/あなたの[<＜《]([^>＞»]+)[>＞»]のシグニを([０-９\d]*)体まで/);
    const targetClassMSPU = classMatchMSPU?.[1];
    const maxCountMSPU = parseInt(toHWMSPU(classMatchMSPU?.[2] || '2')) || 2;
    const selfCandsMSPU = ctx.ownerState.field.signi
      .map(s => s?.at(-1))
      .filter((cn): cn is string => !!cn && (!targetClassMSPU || (ctx.cardMap.get(cn)?.CardClass ?? '').includes(targetClassMSPU)));
    if (selfCandsMSPU.length === 0) return done(addLog(ctx, '自場に対象シグニなし（MULTI_SIGNI_POWER_UP_5000）'));
    const noopMSPU: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contMSPU: StubAction = { type: 'STUB', id: 'INTERNAL_POWER_UP_SELECTED' };
    return needsInteraction(addLog(ctx, `シグニを${maxCountMSPU}体まで選択（パワー+5000）`), {
      type: 'SELECT_TARGET', candidates: selfCandsMSPU, count: maxCountMSPU, optional: true,
      targetScope: 'self_field', thenAction: noopMSPU as EffectAction, continuation: contMSPU as EffectAction,
    });
  }
  // MULTI_SIGNI_POWER_UP_5000 の後処理：選択した自シグニにパワー+5000
  if (stub.id === 'INTERNAL_POWER_UP_SELECTED') {
    const selectedIPU = ctx.lastProcessedCards ?? [];
    if (selectedIPU.length === 0) return done(addLog(ctx, 'なし（INTERNAL_POWER_UP_SELECTED）'));
    const srcIPU = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtIPU = srcIPU ? (srcIPU.EffectText ?? '') + ' ' + (srcIPU.BurstText ?? '') : '';
    const toHWIPU = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const deltaIPU = (() => {
      const m = txtIPU.match(/それらのパワーをそれぞれ([＋－][０-９\d]+)/);
      return m ? parseInt(toHWIPU(m[1]).replace('＋', '+').replace('－', '-')) : 5000;
    })();
    const modsIPU = [...(ctx.ownerState.temp_power_mods ?? [])];
    for (const cn of selectedIPU) modsIPU.push({ cardNum: cn, delta: deltaIPU });
    const namesIPU = selectedIPU.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsIPU } },
      `${namesIPU}のパワー${deltaIPU > 0 ? '+' : ''}${deltaIPU}`));
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
  // デッキ上のクラスシグニを最大2枚選んでエナゾーンへ（LOOK_AND_REORDER後）
  if (stub.id === 'CLASS_SIGNI_TO_ENERGY') {
    const srcCSTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSTE = srcCSTE ? (srcCSTE.EffectText ?? '') + ' ' + (srcCSTE.BurstText ?? '') : '';
    const toHWCSTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchCSTE = txtCSTE.match(/[<＜《]([^>＞》]+)[>＞»]のシグニ(?:を([０-９\d]*)枚まで|を([０-９\d]*)体まで)/);
    const targetClassCSTE = classMatchCSTE?.[1];
    const maxPickCSTE = parseInt(toHWCSTE(classMatchCSTE?.[2] ?? classMatchCSTE?.[3] ?? '2')) || 2;
    const topCardsCSTE = ctx.ownerState.deck.slice(0, 4);
    const filteredCSTE = topCardsCSTE.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'シグニ') return false;
      if (targetClassCSTE && !c.CardClass?.includes(targetClassCSTE)) return false;
      return true;
    });
    if (filteredCSTE.length === 0) return done(addLog(ctx, 'デッキ上にクラスシグニなし（CLASS_SIGNI_TO_ENERGY）'));
    const addToEnergyCSTE: AddToEnergyAction = { type: 'ADD_TO_ENERGY', owner: 'self' };
    return needsInteraction(addLog(ctx, `デッキ上4枚からシグニを${maxPickCSTE}枚まで選択（エナゾーンへ）`), {
      type: 'SEARCH', visibleCards: filteredCSTE, maxPick: maxPickCSTE,
      thenAction: addToEnergyCSTE as EffectAction,
    });
  }
  // 公開枚数（lastProcessedCards）に基づくパワー修正
  if (stub.id === 'POWER_MOD_PER_REVEALED') {
    const srcPMPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMPR = srcPMPR ? (srcPMPR.EffectText ?? '') + ' ' + (srcPMPR.BurstText ?? '') : '';
    const toHWPMPR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedCountPMPR = (ctx.lastProcessedCards ?? []).length;
    const perMPMPR = txtPMPR.match(/([０-９\d]*)枚?につき([－＋][０-９\d]+)/);
    if (perMPMPR && revealedCountPMPR > 0) {
      const divisorPMPR = parseInt(toHWPMPR(perMPMPR[1] || '1')) || 1;
      const deltaPMPR = parseInt(toHWPMPR(perMPMPR[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMPR = Math.floor(revealedCountPMPR / divisorPMPR) * deltaPMPR;
      if (totalDeltaPMPR !== 0) {
        const modsPMPR = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsPMPR.push({ cardNum: top, delta: totalDeltaPMPR });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMPR } },
          `パワー${totalDeltaPMPR > 0 ? '+' : ''}${totalDeltaPMPR}（公開${revealedCountPMPR}枚）`));
      }
    }
    return done(addLog(ctx, `パワー修正（公開${revealedCountPMPR}枚）`));
  }
  // 自場チャーム数に基づくパワー修正
  if (stub.id === 'POWER_BY_CHARM_COUNT') {
    const srcPBCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBCC = srcPBCC ? (srcPBCC.EffectText ?? '') + ' ' + (srcPBCC.BurstText ?? '') : '';
    const toHWPBCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const charmCountPBCC = (ctx.ownerState.field.signi_charms ?? []).filter(c => c !== null && c !== undefined).length;
    const perMPBCC = txtPBCC.match(/チャーム([０-９\d]*)(?:個|枚)?につき([－＋][０-９\d]+)/);
    if (perMPBCC && charmCountPBCC > 0) {
      const divisorPBCC = parseInt(toHWPBCC(perMPBCC[1] || '1')) || 1;
      const deltaPBCC = parseInt(toHWPBCC(perMPBCC[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPBCC = Math.floor(charmCountPBCC / divisorPBCC) * deltaPBCC;
      if (totalDeltaPBCC !== 0) {
        const targetsPBCC = ctx.lastProcessedCards ?? [];
        const modsPBCC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPBCC.length > 0) {
          for (const cn of targetsPBCC) modsPBCC.push({ cardNum: cn, delta: totalDeltaPBCC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPBCC.push({ cardNum: top, delta: totalDeltaPBCC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBCC } },
          `パワー${totalDeltaPBCC > 0 ? '+' : ''}${totalDeltaPBCC}（チャーム${charmCountPBCC}個）`));
      }
    }
    return done(addLog(ctx, `パワー修正（チャーム${charmCountPBCC}個）`));
  }
  // エナゾーンの色の種類数に基づくパワー修正
  if (stub.id === 'POWER_BY_ENERGY_COLOR_VARIETY') {
    const srcPBECV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBECV = srcPBECV ? (srcPBECV.EffectText ?? '') + ' ' + (srcPBECV.BurstText ?? '') : '';
    const toHWPBECV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const energyColorSetPBECV = new Set<string>();
    for (const cn of ctx.ownerState.energy) {
      const colors = splitColors(ctx.cardMap.get(cn)?.Color);
      for (const col of colors) energyColorSetPBECV.add(col);
    }
    const varietyPBECV = energyColorSetPBECV.size;
    const perMPBECV = txtPBECV.match(/エナゾーン.*?色の種類([０-９\d]*)(?:色|つ)?につき([－＋][０-９\d]+)/);
    if (perMPBECV && varietyPBECV > 0) {
      const divisorPBECV = parseInt(toHWPBECV(perMPBECV[1] || '1')) || 1;
      const deltaPBECV = parseInt(toHWPBECV(perMPBECV[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPBECV = Math.floor(varietyPBECV / divisorPBECV) * deltaPBECV;
      if (totalDeltaPBECV !== 0) {
        const targetsPBECV = ctx.lastProcessedCards ?? [];
        const modsPBECV = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPBECV.length > 0) {
          for (const cn of targetsPBECV) modsPBECV.push({ cardNum: cn, delta: totalDeltaPBECV });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPBECV.push({ cardNum: top, delta: totalDeltaPBECV });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBECV } },
          `パワー${totalDeltaPBECV > 0 ? '+' : ''}${totalDeltaPBECV}（エナ色種類${varietyPBECV}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（エナ色種類${varietyPBECV}）`));
  }
  // 自場ライズシグニ数に基づくパワー修正（スタック2枚以上のシグニ）
  if (stub.id === 'POWER_BY_RISE_SIGNI_COUNT') {
    const srcPBRSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBRSC = srcPBRSC ? (srcPBRSC.EffectText ?? '') + ' ' + (srcPBRSC.BurstText ?? '') : '';
    const toHWPBRSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const riseCountPBRSC = ctx.ownerState.field.signi.filter(s => (s?.length ?? 0) >= 2).length;
    const perMPBRSC = txtPBRSC.match(/ライズシグニ([０-９\d]*)体?につき([－＋][０-９\d]+)/);
    if (perMPBRSC && riseCountPBRSC > 0) {
      const divisorPBRSC = parseInt(toHWPBRSC(perMPBRSC[1] || '1')) || 1;
      const deltaPBRSC = parseInt(toHWPBRSC(perMPBRSC[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPBRSC = Math.floor(riseCountPBRSC / divisorPBRSC) * deltaPBRSC;
      if (totalDeltaPBRSC !== 0) {
        const targetsPBRSC = ctx.lastProcessedCards ?? [];
        const modsPBRSC = [...(ctx.otherState.temp_power_mods ?? [])];
        if (targetsPBRSC.length > 0) {
          for (const cn of targetsPBRSC) modsPBRSC.push({ cardNum: cn, delta: totalDeltaPBRSC });
        } else {
          for (let zi = 0; zi < 3; zi++) {
            const top = ctx.otherState.field.signi[zi]?.at(-1);
            if (top) modsPBRSC.push({ cardNum: top, delta: totalDeltaPBRSC });
          }
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBRSC } },
          `パワー${totalDeltaPBRSC > 0 ? '+' : ''}${totalDeltaPBRSC}（ライズシグニ${riseCountPBRSC}体）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ライズシグニ${riseCountPBRSC}体）`));
  }
  // 相手同ゾーン（前）シグニのレベルに基づくパワー修正
  if (stub.id === 'POWER_MOD_BY_FRONT_LEVEL') {
    const srcPMFLL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMFLL = srcPMFLL ? (srcPMFLL.EffectText ?? '') + ' ' + (srcPMFLL.BurstText ?? '') : '';
    const toHWPMFLL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcZoneFLL = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    const frontCnFLL = srcZoneFLL >= 0 ? ctx.otherState.field.signi[srcZoneFLL]?.at(-1) : undefined;
    const frontLvFLL = parseInt(ctx.cardMap.get(frontCnFLL ?? '')?.Level ?? '0') || 0;
    const perMPMFLL = txtPMFLL.match(/前.*?シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMPMFLL && frontLvFLL > 0) {
      const divisorPMFLL = parseInt(toHWPMFLL(perMPMFLL[1] || '1')) || 1;
      const deltaPMFLL = parseInt(toHWPMFLL(perMPMFLL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaPMFLL = Math.floor(frontLvFLL / divisorPMFLL) * deltaPMFLL;
      if (totalDeltaPMFLL !== 0 && ctx.sourceCardNum) {
        const modsFLL = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMFLL }];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsFLL } },
          `パワー${totalDeltaPMFLL > 0 ? '+' : ''}${totalDeltaPMFLL}（前シグニLv${frontLvFLL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（前シグニLv${frontLvFLL}）`));
  }
  // 相手フィールドのウイルスシグニのレベル合計に基づくパワー修正
  if (stub.id === 'INFECTED_SIGNI_POWER_DOWN_BY_LEVEL') {
    const srcISPDL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtISPDL = srcISPDL ? (srcISPDL.EffectText ?? '') + ' ' + (srcISPDL.BurstText ?? '') : '';
    const toHWISPDL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const virusLvSumISPDL = [0, 1, 2].reduce((acc, zi) => {
      if ((ctx.otherState.field.signi_virus?.[zi] ?? 0) === 0) return acc;
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      return acc + (parseInt(ctx.cardMap.get(top ?? '')?.Level ?? '0') || 0);
    }, 0);
    const perMISPDL = txtISPDL.match(/ウイルス.*?シグニのレベル([０-９\d]*)につき([－＋][０-９\d]+)/);
    if (perMISPDL && virusLvSumISPDL > 0) {
      const divisorISPDL = parseInt(toHWISPDL(perMISPDL[1] || '1')) || 1;
      const deltaISPDL = parseInt(toHWISPDL(perMISPDL[2]).replace('－', '-').replace('＋', '+'));
      const totalDeltaISPDL = Math.floor(virusLvSumISPDL / divisorISPDL) * deltaISPDL;
      if (totalDeltaISPDL !== 0) {
        const modsISPDL = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) modsISPDL.push({ cardNum: top, delta: totalDeltaISPDL });
        }
        return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsISPDL } },
          `パワー${totalDeltaISPDL > 0 ? '+' : ''}${totalDeltaISPDL}（ウイルスLv合計${virusLvSumISPDL}）`));
      }
    }
    return done(addLog(ctx, `パワー修正（ウイルスシグニLv合計${virusLvSumISPDL}）`));
  }
  // 自シグニパワーの2倍を全相手シグニにマイナス
  // DOUBLE_OWN_POWER_MINUS: 対象シグニへの自分効果パワー-を2倍にする（SELECT_TARGET + フラグ設置）
  if (stub.id === 'DOUBLE_OWN_POWER_MINUS') {
    const targetDOPM = (ctx.lastProcessedCards ?? []).find(cn =>
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
    const existingDOPM = ctx.ownerState.double_power_minus_targets ?? [];
    const newOwnerDOPM = { ...ctx.ownerState, double_power_minus_targets: [...new Set([...existingDOPM, targetDOPM])] };
    return done(addLog({ ...ctx, ownerState: newOwnerDOPM },
      `${ctx.cardMap.get(targetDOPM)?.CardName ?? targetDOPM}へのパワー-を2倍に設定`));
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
  // クラスが出るまでデッキ上からトラッシュに置く
  if (stub.id === 'DECK_MILL_UNTIL_CLASS') {
    const srcDMUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDMUC = srcDMUC ? (srcDMUC.EffectText ?? '') + ' ' + (srcDMUC.BurstText ?? '') : '';
    const classMatchDMUC = txtDMUC.match(/[<＜《]([^>＞》]+)[>＞»].*?(?:が出る|が出現|のシグニが現れる)まで/);
    const targetClassDMUC = classMatchDMUC?.[1];
    let curDMUC = ctx;
    let milledDMUC = 0;
    while (curDMUC.ownerState.deck.length > 0) {
      const topDMUC = curDMUC.ownerState.deck[0];
      const topDataDMUC = curDMUC.cardMap.get(topDMUC);
      const newDeckDMUC = curDMUC.ownerState.deck.slice(1);
      const newTrashDMUC = [...curDMUC.ownerState.trash, topDMUC];
      curDMUC = { ...curDMUC, ownerState: { ...curDMUC.ownerState, deck: newDeckDMUC, trash: newTrashDMUC } };
      milledDMUC++;
      if (!targetClassDMUC || (topDataDMUC?.Type === 'シグニ' && topDataDMUC.CardClass?.includes(targetClassDMUC))) break;
    }
    return done(addLog(curDMUC, `デッキ上${milledDMUC}枚をトラッシュ（${targetClassDMUC ?? 'クラス'}まで削り）`));
  }
  // 宣言した数だけデッキ上からトラッシュへ
  if (stub.id === 'DECK_TOP_DECLARED_NUM_TRASH') {
    const declaredNumDTDT = ctx.ownerState.declared_guard_restrict_level ?? 1;
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
  // 複数色（2色以上）の相手シグニをバニッシュ
  if (stub.id === 'BANISH_MULTI_COLOR_SIGNI') {
    let curBMCS = ctx;
    let banishedBMCS = 0;
    for (let zi = 0; zi < 3; zi++) {
      const top = curBMCS.otherState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const colorsBMCS = splitColors(curBMCS.cardMap.get(top)?.Color);
      if (colorsBMCS.length < 2) continue;
      const removedBMCS = removeFromField(top, curBMCS.otherState);
      // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下）を適用
      const { state: destBMCS } = banishDestination(removedBMCS, curBMCS.ownerState, top);
      curBMCS = { ...curBMCS, otherState: destBMCS };
      banishedBMCS++;
    }
    return done(addLog(curBMCS, banishedBMCS > 0
      ? `複数色シグニ${banishedBMCS}体をバニッシュ`
      : '複数色シグニなし（BANISH_MULTI_COLOR_SIGNI）'));
  }
  // 相手フィールドシグニとエナゾーンをすべてトラッシュ
  if (stub.id === 'OPP_TRASH_FIELD_SIGNI_AND_ENERGY') {
    let newOtherOTFSAE = { ...ctx.otherState };
    for (let zi = 0; zi < 3; zi++) {
      const top = newOtherOTFSAE.field.signi[zi]?.at(-1);
      if (!top) continue;
      const removedOTFSAE = removeFromField(top, newOtherOTFSAE);
      newOtherOTFSAE = { ...removedOTFSAE, trash: [...removedOTFSAE.trash, top] };
    }
    const extraTrashOTFSAE = [...newOtherOTFSAE.energy];
    newOtherOTFSAE = { ...newOtherOTFSAE, energy: [], trash: [...newOtherOTFSAE.trash, ...extraTrashOTFSAE] };
    return done(addLog({ ...ctx, otherState: newOtherOTFSAE }, '相手フィールドシグニとエナゾーンをすべてトラッシュ'));
  }
  // 自シグニをフィールドから退場させてデッキ下へ
  if (stub.id === 'LEAVE_FIELD_TO_DECK_BOTTOM') {
    const srcCnLFDB = ctx.sourceCardNum;
    if (!srcCnLFDB || !ctx.ownerState.field.signi.some(s => s?.at(-1) === srcCnLFDB))
      return done(addLog(ctx, '対象がフィールドにいない（LEAVE_FIELD_TO_DECK_BOTTOM）'));
    const removedLFDB = removeFromField(srcCnLFDB, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedLFDB, deck: [...removedLFDB.deck, srcCnLFDB] } },
      `${ctx.cardMap.get(srcCnLFDB)?.CardName ?? srcCnLFDB}をデッキ下へ`));
  }
  // ルリグダメージ無効フラグを設定
  if (stub.id === 'PREVENT_LRIG_DAMAGE' || stub.id === 'PREVENT_DAMAGE_UNTIL_OPP_TURN_END'
      || stub.id === 'PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_lrig_damage: true } },
      'このターンルリグダメージ無効'));
  }
  // 色条件によるライフバースト抑制（相手に suppress_life_burst フラグ）
  if (stub.id === 'SUPPRESS_LIFEBURST_COLOR_CONDITION') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, suppress_life_burst: true } },
      'ライフバースト発動抑制（色条件）'));
  }
  // 相手エナが指定数以上のとき超過分をトラッシュ
  if (stub.id === 'OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL') {
    const srcOEOTC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOEOTC = srcOEOTC ? (srcOEOTC.EffectText ?? '') + ' ' + (srcOEOTC.BurstText ?? '') : '';
    const toHWOEOTC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxMOEOTC = txtOEOTC.match(/エナゾーンにカードが([０-９\d]*)枚?以上/);
    const maxEnaOEOTC = maxMOEOTC ? (parseInt(toHWOEOTC(maxMOEOTC[1])) || 5) : 5;
    const oppEnaCountOEOTC = ctx.otherState.energy.length;
    if (oppEnaCountOEOTC >= maxEnaOEOTC) {
      // 条件達成時は常に1枚（最後=直近に置かれたカード）をトラッシュ
      const trashedOEOTC = ctx.otherState.energy.slice(-1);
      const newOtherOEOTC = {
        ...ctx.otherState,
        energy: ctx.otherState.energy.slice(0, -1),
        trash: [...ctx.otherState.trash, ...trashedOEOTC],
      };
      return done(addLog({ ...ctx, otherState: newOtherOEOTC },
        `相手エナ1枚→トラッシュ（${oppEnaCountOEOTC}枚≥${maxEnaOEOTC}）`));
    }
    return done(addLog(ctx, `相手エナ${oppEnaCountOEOTC}枚（条件${maxEnaOEOTC}枚以上：未達）`));
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
  // 対象シグニと自シグニの両方にパワー修正（自場シグニを対象とする）
  if (stub.id === 'POWER_MOD_TARGET_AND_SELF') {
    const srcPMTS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMTS = srcPMTS ? (srcPMTS.EffectText ?? '') + ' ' + (srcPMTS.BurstText ?? '') : '';
    const toHWPMTS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const paramDeltaPMTS = typeof (stub as StubAction & { delta?: number }).delta === 'number'
      ? (stub as StubAction & { delta?: number }).delta!
      : undefined;
    const deltaMPMTS = !paramDeltaPMTS ? txtPMTS.match(/([－＋][０-９\d]+)/) : null;
    if (paramDeltaPMTS === undefined && !deltaMPMTS) return done(addLog(ctx, 'パワー修正（対象+自）'));
    const deltaPMTS = paramDeltaPMTS !== undefined
      ? paramDeltaPMTS
      : parseInt(toHWPMTS(deltaMPMTS![1]).replace('－', '-').replace('＋', '+'));
    // lastProcessedCards が自場シグニ（trigger signi: 場に出たとき）→ 自場に適用
    const ownTargetsPMTS = (ctx.lastProcessedCards ?? []).filter(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    let newCtxPMTS = ctx;
    if (ownTargetsPMTS.length > 0) {
      const modsOwn = [...(newCtxPMTS.ownerState.temp_power_mods ?? [])];
      for (const cn of ownTargetsPMTS) modsOwn.push({ cardNum: cn, delta: deltaPMTS });
      newCtxPMTS = { ...newCtxPMTS, ownerState: { ...newCtxPMTS.ownerState, temp_power_mods: modsOwn } };
    }
    // 自シグニ（sourceCardNum）にも同デルタ
    if (ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
      const modsSelf = [...(newCtxPMTS.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPMTS }];
      newCtxPMTS = { ...newCtxPMTS, ownerState: { ...newCtxPMTS.ownerState, temp_power_mods: modsSelf } };
    }
    return done(addLog(newCtxPMTS, `対象+自シグニパワー${deltaPMTS > 0 ? '+' : ''}${deltaPMTS}`));
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
  // 自・相手のシグニレベル合計比較（自≦相手の場合）× levelSum → 1体相手シグニパワー修正
  if (stub.id === 'POWER_BY_LEVEL_SUM_COMPARE') {
    const toHWPBLSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const selfLvSumPBLSC = [0, 1, 2].reduce((acc, zi) =>
      acc + (parseInt(ctx.cardMap.get(ctx.ownerState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0), 0);
    const oppLvSumPBLSC = [0, 1, 2].reduce((acc, zi) =>
      acc + (parseInt(ctx.cardMap.get(ctx.otherState.field.signi[zi]?.at(-1) ?? '')?.Level ?? '0') || 0), 0);
    // 条件：自Lv合計 ≦ 相手Lv合計（以下）
    if (selfLvSumPBLSC > oppLvSumPBLSC) {
      return done(addLog(ctx, `パワー修正なし（Lv合計：自${selfLvSumPBLSC}＞相手${oppLvSumPBLSC}）`));
    }
    const srcPBLSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBLSC = srcPBLSC ? (srcPBLSC.EffectText ?? '') + ' ' + (srcPBLSC.BurstText ?? '') : '';
    const mPBLSC = txtPBLSC.match(/([０-９\d]+)につき([－＋][０-９\d]+)/);
    const divisorPBLSC = mPBLSC ? parseInt(toHWPBLSC(mPBLSC[1])) || 1 : 1;
    const deltaPerPBLSC = mPBLSC ? parseInt(toHWPBLSC(mPBLSC[2]).replace('－', '-').replace('＋', '+')) : -1000;
    const totalDeltaPBLSC = Math.floor(selfLvSumPBLSC / divisorPBLSC) * deltaPerPBLSC;
    const existPBLSC = (ctx.lastProcessedCards ?? []).find(cn => ctx.otherState.field.signi.some(s => s?.at(-1) === cn));
    if (existPBLSC) {
      const modsPBLSC = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: existPBLSC, delta: totalDeltaPBLSC }];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBLSC } },
        `${ctx.cardMap.get(existPBLSC)?.CardName ?? existPBLSC}のパワー${totalDeltaPBLSC}（Lv合計${selfLvSumPBLSC}≦${oppLvSumPBLSC}）`));
    }
    const oppCandsPBLSC = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPBLSC.length === 0) return done(addLog(ctx, '相手シグニなし（POWER_BY_LEVEL_SUM_COMPARE）'));
    const contPBLSC: StubAction = { type: 'STUB', id: 'POWER_BY_LEVEL_SUM_COMPARE' };
    const noopPBLSC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(oppCandsPBLSC, 1, false, 'opp_field', noopPBLSC as EffectAction, contPBLSC as EffectAction, ctx);
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
    const srcOSTDN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOSTDN = srcOSTDN ? (srcOSTDN.EffectText ?? '') + ' ' + (srcOSTDN.BurstText ?? '') : '';
    const toHWOSTDN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const nthMOSTDN = txtOSTDN.match(/デッキの上から([０-９\d]*)番目/);
    const nthOSTDN = nthMOSTDN ? (parseInt(toHWOSTDN(nthMOSTDN[1])) - 1) : 0;
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
    const contTZDFT: StubAction = { type: 'STUB', id: 'TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH' };
    return needsInteraction(addLog(ctx, 'トラッシュから3枚選択（1枚目→エナ・2枚目→手札・3枚目→デッキ下）'), {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.trash, count: 3, optional: false,
      targetScope: 'self_trash', thenAction: contTZDFT as EffectAction,
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
    const srcET = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtET = srcET ? (srcET.EffectText ?? '') + ' ' + (srcET.BurstText ?? '') : '';
    // SP26-006: 「対戦相手はこのターンの次に、追加の１ターンを得る」→ otherState に付与
    if (txtET.match(/対戦相手は.*追加の[１-９\d０-９]*ターンを得る/)) {
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, extra_turn: true } }, '対戦相手が追加ターンを獲得'));
    }
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, extra_turn: true } }, '追加ターンを獲得'));
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
  // エナのカードが指定レベル合計を超えたらトラッシュ
  if (stub.id === 'ENERGY_BY_LEVEL_SUM_LIMIT') {
    const srcEBLSL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEBLSL = srcEBLSL ? (srcEBLSL.EffectText ?? '') + ' ' + (srcEBLSL.BurstText ?? '') : '';
    const toHWEBLSL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxLvMEBLSL = txtEBLSL.match(/レベルの合計が([０-９\d]*)を超え/);
    const maxLvEBLSL = maxLvMEBLSL ? (parseInt(toHWEBLSL(maxLvMEBLSL[1])) || 10) : 10;
    const enaLvSumEBLSL = ctx.ownerState.energy.reduce((acc, cn) => {
      return acc + (parseInt(ctx.cardMap.get(cn)?.Level ?? '0') || 0);
    }, 0);
    if (enaLvSumEBLSL > maxLvEBLSL) {
      const excessEBLSL = enaLvSumEBLSL - maxLvEBLSL;
      // 末尾から excess 分をトラッシュ（簡易実装）
      const trashCountEBLSL = ctx.ownerState.energy.slice().reverse().reduce((acc, cn) => {
        if (acc.total <= 0) return acc;
        const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0') || 0;
        return { total: acc.total - lv, cns: [...acc.cns, cn] };
      }, { total: excessEBLSL, cns: [] as string[] }).cns;
      const newOwnerEBLSL = {
        ...ctx.ownerState,
        energy: ctx.ownerState.energy.filter(cn => !trashCountEBLSL.includes(cn)),
        trash: [...ctx.ownerState.trash, ...trashCountEBLSL],
      };
      return done(addLog({ ...ctx, ownerState: newOwnerEBLSL },
        `エナLv合計${enaLvSumEBLSL}→上限${maxLvEBLSL}超え、${trashCountEBLSL.length}枚トラッシュ`));
    }
    return done(addLog(ctx, `エナLv合計${enaLvSumEBLSL}（上限${maxLvEBLSL}以内）`));
  }
  // 相手エナのカード1枚を色条件でトラッシュ（相手が選択→スキップ）
  if (stub.id === 'OPP_ENERGY_COLOR_CONDITION_TRASH') {
    // 相手エナから色条件に合うカードを1枚自動トラッシュ（最後の1枚）
    const srcOECCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOECCT = srcOECCT ? (srcOECCT.EffectText ?? '') + ' ' + (srcOECCT.BurstText ?? '') : '';
    const colorMOECCT = txtOECCT.match(/([赤青緑黒白無])のカード/);
    const targetColorOECCT = colorMOECCT?.[1];
    const targetCardOECCT = targetColorOECCT
      ? ctx.otherState.energy.find(cn => (ctx.cardMap.get(cn)?.Color ?? '').includes(targetColorOECCT))
      : ctx.otherState.energy.at(-1);
    if (!targetCardOECCT) return done(addLog(ctx, '対象エナカードなし（OPP_ENERGY_COLOR_CONDITION_TRASH）'));
    const newOtherOECCT = {
      ...ctx.otherState,
      energy: ctx.otherState.energy.filter(cn => cn !== targetCardOECCT),
      trash: [...ctx.otherState.trash, targetCardOECCT],
    };
    return done(addLog({ ...ctx, otherState: newOtherOECCT },
      `相手エナ：${ctx.cardMap.get(targetCardOECCT)?.CardName ?? targetCardOECCT}→トラッシュ`));
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
  // 複数シグニをエナへ（lastProcessedCards or 全自フィールドシグニ）
  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const targetsMSTE = ctx.lastProcessedCards?.length
      ? ctx.lastProcessedCards
      : [0, 1, 2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    let newOwnerMSTE = ctx.ownerState;
    let countMSTE = 0;
    for (const cn of targetsMSTE) {
      if (!newOwnerMSTE.field.signi.some(s => s?.at(-1) === cn)) continue;
      const removedMSTE = removeFromField(cn, newOwnerMSTE);
      newOwnerMSTE = { ...removedMSTE, energy: [...removedMSTE.energy, cn] };
      countMSTE++;
    }
    return done(addLog({ ...ctx, ownerState: newOwnerMSTE },
      countMSTE > 0 ? `${countMSTE}体のシグニをエナゾーンへ` : 'シグニをエナへ（対象なし）'));
  }
  // 非ガードの手札捨てをエナゾーンへ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const lastDiscardedNGDE = (ctx.lastProcessedCards ?? [])[0] ?? ctx.ownerState.trash.at(-1) ?? '';
    if (!lastDiscardedNGDE) return done(addLog(ctx, 'カードなし（NON_GUARD_DISCARD_TO_ENERGY）'));
    // Guard列は '1'/'0' 形式（空文字判定だと全カードがガード持ち扱いになる）
    const isGuardNGDE = ctx.cardMap.get(lastDiscardedNGDE)?.Guard === '1';
    if (!isGuardNGDE) {
      // トラッシュからエナへ移動
      const ti = ctx.ownerState.trash.indexOf(lastDiscardedNGDE);
      if (ti >= 0) {
        const newTrashNGDE = [...ctx.ownerState.trash]; newTrashNGDE.splice(ti, 1);
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, trash: newTrashNGDE, energy: [...ctx.ownerState.energy, lastDiscardedNGDE] } },
          `${ctx.cardMap.get(lastDiscardedNGDE)?.CardName ?? lastDiscardedNGDE}（非ガード）→エナゾーン`));
      }
    }
    return done(addLog(ctx, 'ガードカード（NON_GUARD_DISCARD_TO_ENERGY）'));
  }
  // ゾーンが空いているときトラッシュ（条件付き）
  if (stub.id === 'TRASH_IF_ZONE_OCCUPIED') {
    const emptyZoneTIZO = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (emptyZoneTIZO < 0 && ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)) {
      const removedTIZO = removeFromField(ctx.sourceCardNum, ctx.ownerState);
      return done(addLog({ ...ctx, ownerState: { ...removedTIZO, trash: [...removedTIZO.trash, ctx.sourceCardNum] } },
        `${ctx.cardMap.get(ctx.sourceCardNum)?.CardName ?? ctx.sourceCardNum}→トラッシュ（ゾーン満杯）`));
    }
    return done(addLog(ctx, 'ゾーン空きあり（TRASH_IF_ZONE_OCCUPIED）'));
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
  // フィールドの全シグニの名前が一致するカードをエナ・フィールドからトラッシュ
  if (stub.id === 'TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY') {
    const srcTABN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTABN = srcTABN ? (srcTABN.EffectText ?? '') + ' ' + (srcTABN.BurstText ?? '') : '';
    const nameMTABN = txtTABN.match(/「([^」]+)」/);
    const targetNameTABN = nameMTABN?.[1];
    if (!targetNameTABN) return done(addLog(ctx, '対象名称なし（TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY）'));
    let newOtherTABN = ctx.otherState;
    // 相手フィールドから
    for (let zi = 0; zi < 3; zi++) {
      const top = newOtherTABN.field.signi[zi]?.at(-1);
      if (!top || (ctx.cardMap.get(top)?.CardName ?? '') !== targetNameTABN) continue;
      const removedTABN = removeFromField(top, newOtherTABN);
      newOtherTABN = { ...removedTABN, trash: [...removedTABN.trash, top] };
    }
    // 相手エナから
    const enaToTrashTABN = newOtherTABN.energy.filter(cn => (ctx.cardMap.get(cn)?.CardName ?? '') === targetNameTABN);
    newOtherTABN = {
      ...newOtherTABN,
      energy: newOtherTABN.energy.filter(cn => (ctx.cardMap.get(cn)?.CardName ?? '') !== targetNameTABN),
      trash: [...newOtherTABN.trash, ...enaToTrashTABN],
    };
    return done(addLog({ ...ctx, otherState: newOtherTABN },
      `「${targetNameTABN}」を相手フィールド・エナからトラッシュ`));
  }
  // === バッチ4: デッキ/手札/エナ操作 ===
  // DRAW: N枚ドロー
  if (stub.id === 'DRAW') {
    const srcDRW = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDRW = srcDRW ? (srcDRW.EffectText ?? '') + ' ' + (srcDRW.BurstText ?? '') : '';
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
  if (stub.id === 'LOOK_TOP_ONE_RETURN_REST_BOTTOM') {
    const srcLTORB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTORB = srcLTORB ? (srcLTORB.EffectText ?? '') + ' ' + (srcLTORB.BurstText ?? '') : '';
    const toHWLTORB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTORB = txtLTORB.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
    const countLTORB = mLTORB ? parseInt(toHWLTORB(mLTORB[1])) : 2;
    const visLTORB = ctx.ownerState.deck.slice(0, Math.min(countLTORB, ctx.ownerState.deck.length));
    if (visLTORB.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSLTORB: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visLTORB.length) };
    return needsInteraction(
      addLog({ ...ctx, ownerState: newSLTORB }, `デッキ上${visLTORB.length}枚を確認（1枚をトップへ・残りはデッキ下へ）`),
      { type: 'LOOK_AND_REORDER', cards: visLTORB, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'first_top_rest_bottom', private: true },
    );
  }
  // LOOK_TOP_SPELLS_TO_HAND: デッキ上N枚を確認してスペルを手札へ・残りをデッキへ
  if (stub.id === 'LOOK_TOP_SPELLS_TO_HAND') {
    const srcLTSH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTSH = srcLTSH ? (srcLTSH.EffectText ?? '') + ' ' + (srcLTSH.BurstText ?? '') : '';
    const toHWLTSH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mLTSH = txtLTSH.match(/デッキ(?:の上)?(?:から)?([０-９\d]+)枚/);
    const countLTSH = mLTSH ? parseInt(toHWLTSH(mLTSH[1])) : 3;
    const sLTSH = ctx.ownerState;
    const revealedLTSH = sLTSH.deck.slice(0, Math.min(countLTSH, sLTSH.deck.length));
    const spellsLTSH = revealedLTSH.filter(cn => ctx.cardMap.get(cn)?.Type === 'スペル');
    const restLTSH = revealedLTSH.filter(cn => ctx.cardMap.get(cn)?.Type !== 'スペル');
    const newSLTSH: PlayerState = {
      ...sLTSH,
      deck: [...restLTSH, ...sLTSH.deck.slice(revealedLTSH.length)],
      hand: [...sLTSH.hand, ...spellsLTSH],
    };
    return done(addLog({ ...ctx, ownerState: newSLTSH },
      `デッキ上${revealedLTSH.length}枚確認、スペル${spellsLTSH.length}枚を手札に`));
  }
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
  // HAND_NONCOLORLESS_TO_ENERGY: 手札の無色以外カードをエナゾーンへ
  if (stub.id === 'HAND_NONCOLORLESS_TO_ENERGY') {
    const sHNCE = ctx.ownerState;
    const nonColorlessHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c !== '' && c !== '無色'; });
    const remainHNCE = sHNCE.hand.filter(cn => { const c = ctx.cardMap.get(cn)?.Color ?? ''; return c === '' || c === '無色'; });
    const newSHNCE: PlayerState = { ...sHNCE, hand: remainHNCE, energy: [...sHNCE.energy, ...nonColorlessHNCE] };
    return done(addLog({ ...ctx, ownerState: newSHNCE }, `手札の無色以外${nonColorlessHNCE.length}枚をエナゾーンへ`));
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
    // HIDDEN かつ 2候補ある場合：CHOOSE を提示
    if (stub.id === 'ADD_CARD_TO_LRIG_DECK_HIDDEN' && nameMatchesACLD.length >= 2) {
      const instA = findInstance(ctx.ownerState, nameMatchesACLD[0]);
      const instB = findInstance(ctx.ownerState, nameMatchesACLD[1]);
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
    let sACLD2 = ctx.ownerState;
    let addedACLD = 0;
    for (const name of nameMatchesACLD) {
      const inst = findInstance(sACLD2, name);
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
  // PREVENT_LOW_LEVEL_LRIG_DAMAGE / PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: ルリグダメージ無効フラグ
  if (stub.id === 'PREVENT_LOW_LEVEL_LRIG_DAMAGE' || stub.id === 'PREVENT_DAMAGE_FROM_OPP_EFFECTS' || stub.id === 'PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP') {
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
    const acceCardsATE = (sATE.field.signi_acce ?? []).filter((c): c is string => c !== null);
    if (acceCardsATE.length === 0) return done(addLog(ctx, 'アクセなし'));
    const newSATE: PlayerState = {
      ...sATE,
      field: { ...sATE.field, signi_acce: [null, null, null] },
      energy: [...sATE.energy, ...acceCardsATE],
    };
    return done(addLog({ ...ctx, ownerState: newSATE }, `アクセ${acceCardsATE.length}枚をエナゾーンへ`));
  }
  // ACCE_BANISH_SELF_TRASH: アクセを自分のトラッシュへ
  if (stub.id === 'ACCE_BANISH_SELF_TRASH') {
    const sABST = ctx.ownerState;
    const acceCardsABST = (sABST.field.signi_acce ?? []).filter((c): c is string => c !== null);
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
  // POWER_BY_ACCE_COUNT: アクセ数×deltaをパワー修正
  if (stub.id === 'POWER_BY_ACCE_COUNT') {
    const srcPBAC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBAC = srcPBAC ? (srcPBAC.EffectText ?? '') + ' ' + (srcPBAC.BurstText ?? '') : '';
    const toHWPBAC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPBAC = txtPBAC.match(/([＋+－-][０-９\d]+)/);
    if (!mPBAC) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_BY_ACCE_COUNT）'));
    const singleDeltaPBAC = parseInt(toHWPBAC(mPBAC[1]).replace('＋', '+').replace('－', '-'));
    const acceCountPBAC = (ctx.ownerState.field.signi_acce ?? []).filter(c => c !== null).length;
    const totalDeltaPBAC = singleDeltaPBAC * acceCountPBAC;
    if (totalDeltaPBAC === 0) return done(addLog(ctx, 'アクセなし（POWER_BY_ACCE_COUNT）'));
    const modsPBAC = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsPBAC.push({ cardNum: top, delta: totalDeltaPBAC });
    }
    const newSOPBAC: PlayerState = { ...ctx.otherState, temp_power_mods: modsPBAC };
    return done(addLog({ ...ctx, otherState: newSOPBAC },
      `アクセ${acceCountPBAC}枚×${singleDeltaPBAC}→相手シグニパワー${totalDeltaPBAC}`));
  }
  // POWER_BY_CENTER_LRIG_TYPE_COUNT: センタールリグのタイプ数×deltaをパワー修正
  if (stub.id === 'POWER_BY_CENTER_LRIG_TYPE_COUNT') {
    const srcPCLTC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPCLTC = srcPCLTC ? (srcPCLTC.EffectText ?? '') + ' ' + (srcPCLTC.BurstText ?? '') : '';
    const toHWPCLTC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPCLTC = txtPCLTC.match(/([＋+－-][０-９\d]+)/);
    if (!mPCLTC) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_BY_CENTER_LRIG_TYPE_COUNT）'));
    const singleDeltaPCLTC = parseInt(toHWPCLTC(mPCLTC[1]).replace('＋', '+').replace('－', '-'));
    const centerNumPCLTC = ctx.ownerState.field.lrig.at(-1);
    const centerCardPCLTC = centerNumPCLTC ? ctx.cardMap.get(centerNumPCLTC) : undefined;
    // ルリグタイプは CardClass 列（「タマ/イオナ」のような'/'区切り）。Team列はチーム名でありタイプではない
    // （effectEngine.ts の CONTINUOUS 版 POWER_BY_CENTER_LRIG_TYPE_COUNT と同一ロジック）
    const typesCountPCLTC = centerCardPCLTC ? (centerCardPCLTC.CardClass ?? '').split(/[/／]/).filter(s => s && s !== '-').length : 0;
    const totalDeltaPCLTC = singleDeltaPCLTC * typesCountPCLTC;
    if (totalDeltaPCLTC === 0) return done(addLog(ctx, 'タイプなし（POWER_BY_CENTER_LRIG_TYPE_COUNT）'));
    // 自分のシグニに適用
    if (ctx.sourceCardNum) {
      const modsPCLTC = [...(ctx.ownerState.temp_power_mods ?? [])];
      modsPCLTC.push({ cardNum: ctx.sourceCardNum, delta: totalDeltaPCLTC });
      const newSOPCLTC: PlayerState = { ...ctx.ownerState, temp_power_mods: modsPCLTC };
      return done(addLog({ ...ctx, ownerState: newSOPCLTC },
        `センタールリグタイプ${typesCountPCLTC}種×${singleDeltaPCLTC}→パワー${totalDeltaPCLTC}`));
    }
    return done(addLog(ctx, `センタールリグタイプ${typesCountPCLTC}種×${singleDeltaPCLTC}（対象なし）`));
  }
  // DRAW_AND_PUT_HAND_TO_DECK_BOTTOM: ドローして手札1枚をデッキ下に
  if (stub.id === 'DRAW_AND_PUT_HAND_TO_DECK_BOTTOM') {
    const srcDAPHTDB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDAPHTDB = srcDAPHTDB ? (srcDAPHTDB.EffectText ?? '') + ' ' + (srcDAPHTDB.BurstText ?? '') : '';
    const toHWDAPHTDB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDAPHTDB = txtDAPHTDB.match(/([０-９\d]+)枚引き/);
    const drawCntDAPHTDB = mDAPHTDB ? parseInt(toHWDAPHTDB(mDAPHTDB[1])) : 1;
    let sDAPHTDB = ctx.ownerState;
    const canDrawDAPHTDB = Math.min(drawCntDAPHTDB, sDAPHTDB.deck.length);
    sDAPHTDB = { ...sDAPHTDB, hand: [...sDAPHTDB.hand, ...sDAPHTDB.deck.slice(0, canDrawDAPHTDB)], deck: sDAPHTDB.deck.slice(canDrawDAPHTDB) };
    // 手札からデッキ下に置くカードを選択
    if (sDAPHTDB.hand.length > 0) {
      const putCard = sDAPHTDB.hand[0]; // 先頭を自動選択
      sDAPHTDB = { ...sDAPHTDB, hand: sDAPHTDB.hand.slice(1), deck: [...sDAPHTDB.deck, putCard] };
    }
    return done(addLog({ ...ctx, ownerState: sDAPHTDB }, `${canDrawDAPHTDB}枚ドロー、手札1枚をデッキ下へ`));
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
  // POWER_CAP: シグニのパワーをN以下に制限
  if (stub.id === 'POWER_CAP') {
    const srcPC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPC = srcPC ? (srcPC.EffectText ?? '') + ' ' + (srcPC.BurstText ?? '') : '';
    const toHWPC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPC = txtPC.match(/パワーが?([０-９\d,，]+)以下/);
    if (!mPC || !ctx.sourceCardNum) return done(addLog(ctx, 'パワー上限解析失敗'));
    const capPC = parseInt(toHWPC(mPC[1]).replace(/[,，]/g, ''));
    const currentPowerPC = ctx.effectivePowers?.get(ctx.sourceCardNum) ?? 0;
    if (currentPowerPC <= capPC) return done(addLog(ctx, `パワー上限${capPC}以下のため修正なし`));
    const deltaPC = capPC - currentPowerPC;
    const modsPC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaPC }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPC } },
      `パワー上限${capPC}に制限（${deltaPC}）`));
  }
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
  // CHARM_CONDITIONAL_POWER: チャームがある場合パワー修正
  if (stub.id === 'CHARM_CONDITIONAL_POWER') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcCCP = ctx.cardMap.get(ctx.sourceCardNum);
    const txtCCP = srcCCP ? (srcCCP.EffectText ?? '') + ' ' + (srcCCP.BurstText ?? '') : '';
    const toHWCCP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCCP = txtCCP.match(/([＋+－-][０-９\d]+)/);
    if (!mCCP) return done(addLog(ctx, 'パワー値解析失敗（CHARM_CONDITIONAL_POWER）'));
    const deltaCCP = parseInt(toHWCCP(mCCP[1]).replace('＋', '+').replace('－', '-'));
    let selfZoneCCP = -1;
    for (let zi = 0; zi < 3; zi++) {
      if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZoneCCP = zi; break; }
    }
    const hasCharmCCP = selfZoneCCP >= 0 && (ctx.ownerState.field.signi_charms?.[selfZoneCCP] ?? null) !== null;
    if (!hasCharmCCP) return done(addLog(ctx, 'チャームなし（CHARM_CONDITIONAL_POWER）'));
    const modsCCP = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaCCP }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCCP } },
      `チャームあり→パワー${deltaCCP > 0 ? '+' : ''}${deltaCCP}`));
  }
  // POWER_BOOST_PER_SIGNI_WITH_ICON: キーワード持ちシグニ1体につきパワー修正
  if (stub.id === 'POWER_BOOST_PER_SIGNI_WITH_ICON') {
    const srcPBPSWI = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPBPSWI = srcPBPSWI ? (srcPBPSWI.EffectText ?? '') + ' ' + (srcPBPSWI.BurstText ?? '') : '';
    const toHWPBPSWI = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mDeltaPBPSWI = txtPBPSWI.match(/([＋+－-][０-９\d]+)/);
    if (!mDeltaPBPSWI) return done(addLog(ctx, 'パワー値解析失敗（POWER_BOOST_PER_SIGNI_WITH_ICON）'));
    const singleDeltaPBPSWI = parseInt(toHWPBPSWI(mDeltaPBPSWI[1]).replace('＋', '+').replace('－', '-'));
    // キーワード能力持ちシグニをカウント（keyword_grants または effectText に【〇】パターン）
    let countPBPSWI = 0;
    const kwGrants = ctx.ownerState.keyword_grants ?? {};
    for (let zi = 0; zi < 3; zi++) {
      const cn = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!cn) continue;
      if (kwGrants[cn]?.length) countPBPSWI++;
      else if ((ctx.cardMap.get(cn)?.EffectText ?? '').includes('【')) countPBPSWI++;
    }
    const totalDeltaPBPSWI = singleDeltaPBPSWI * countPBPSWI;
    if (totalDeltaPBPSWI === 0) return done(addLog(ctx, 'キーワード持ちシグニなし'));
    const modsPBPSWI = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      if (top) modsPBPSWI.push({ cardNum: top, delta: totalDeltaPBPSWI });
    }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPBPSWI } },
      `キーワード持ちシグニ${countPBPSWI}体×${singleDeltaPBPSWI}→相手パワー${totalDeltaPBPSWI}`));
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
  // NO_ABILITY_SIGNI_TO_DECK_BOTTOM: 能力なしシグニをデッキ下に
  if (stub.id === 'NO_ABILITY_SIGNI_TO_DECK_BOTTOM') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcDataNASDB = ctx.cardMap.get(ctx.sourceCardNum);
    const hasAbility = !!(srcDataNASDB?.EffectText ?? srcDataNASDB?.BurstText);
    if (hasAbility) return done(addLog(ctx, '能力ありのためデッキ下移動なし'));
    const removedNASDB = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    const newSNASDB: PlayerState = { ...removedNASDB, deck: [...removedNASDB.deck, ctx.sourceCardNum] };
    return done(addLog({ ...ctx, ownerState: newSNASDB }, '能力なし→デッキ下'));
  }
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
  // === バッチ7: バニッシュ・トラッシュ・条件効果 ===
  // BANISH (STUB版): lastProcessedCards[0] か sourceCardNum をバニッシュ
  if (stub.id === 'BANISH') {
    const cnBAN = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cnBAN) return done(addLog(ctx, 'バニッシュ対象なし'));
    // バニッシュ先リダイレクト（トラッシュ/手札/デッキ下）を適用
    const foundOppBAN = ctx.otherState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundOppBAN) {
      const { state: newSOtherBAN, log: logOppBAN } = banishDestination(removeFromField(cnBAN, ctx.otherState), ctx.ownerState, cnBAN);
      return done(addLog({ ...ctx, otherState: newSOtherBAN }, `${ctx.cardMap.get(cnBAN)?.CardName ?? cnBAN}${logOppBAN}`));
    }
    const foundSelfBAN = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnBAN);
    if (foundSelfBAN) {
      const { state: newSBAN, log: logSelfBAN } = banishDestination(removeFromField(cnBAN, ctx.ownerState), ctx.otherState, cnBAN);
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
  // TRASH_ALL_OPP_CARDS: 相手エナから名前一致カードをすべてトラッシュへ
  if (stub.id === 'TRASH_ALL_OPP_CARDS') {
    const srcTAOC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTAOC = srcTAOC ? (srcTAOC.EffectText ?? '') + ' ' + (srcTAOC.BurstText ?? '') : '';
    const nameMatchTAOC = txtTAOC.match(/《([^》]+)》を含むすべてのカードをトラッシュに置く/);
    const targetNameTAOC = nameMatchTAOC?.[1];
    if (targetNameTAOC) {
      const toTrashTAOC = ctx.otherState.energy.filter(cn =>
        (ctx.cardMap.get(cn)?.CardName ?? '').includes(targetNameTAOC),
      );
      if (toTrashTAOC.length === 0) return done(addLog(ctx, `相手エナに「${targetNameTAOC}」なし`));
      const newOtherTAOC: PlayerState = {
        ...ctx.otherState,
        energy: ctx.otherState.energy.filter(cn => !(ctx.cardMap.get(cn)?.CardName ?? '').includes(targetNameTAOC)),
        trash: [...ctx.otherState.trash, ...toTrashTAOC],
      };
      return done(addLog({ ...ctx, otherState: newOtherTAOC },
        `相手エナから「${targetNameTAOC}」${toTrashTAOC.length}枚→トラッシュ`));
    }
    // フォールバック: 相手の全フィールド+手札をトラッシュへ
    let sOppTAOC = ctx.otherState;
    const toTrashFbTAOC: string[] = [];
    const newSigniTAOC = sOppTAOC.field.signi.map(stack => {
      if (stack && stack.length > 0) { toTrashFbTAOC.push(...stack); return null; }
      return stack;
    }) as (string[] | null)[];
    toTrashFbTAOC.push(...sOppTAOC.hand);
    sOppTAOC = { ...sOppTAOC, field: { ...sOppTAOC.field, signi: newSigniTAOC }, hand: [], trash: [...sOppTAOC.trash, ...toTrashFbTAOC] };
    return done(addLog({ ...ctx, otherState: sOppTAOC }, `相手の${toTrashFbTAOC.length}枚をトラッシュへ`));
  }
  // ABILITY_CHECK_ELSE_TRASH: 能力なしなら自トラッシュ
  if (stub.id === 'ABILITY_CHECK_ELSE_TRASH') {
    if (!ctx.sourceCardNum) return done(ctx);
    const srcDataACET = ctx.cardMap.get(ctx.sourceCardNum);
    const hasAbilityACET = !!(srcDataACET?.EffectText?.trim() || srcDataACET?.BurstText?.trim());
    if (hasAbilityACET) return done(addLog(ctx, '能力ありのためトラッシュなし'));
    const removedACET = removeFromField(ctx.sourceCardNum, ctx.ownerState);
    return done(addLog({ ...ctx, ownerState: { ...removedACET, trash: [...removedACET.trash, ctx.sourceCardNum] } }, '能力なし→トラッシュ'));
  }
  // OPTIONAL_DISCARD_CLASS_SIGNI: クラスシグニを任意で捨てる
  if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
    const srcODCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODCS = srcODCS ? (srcODCS.EffectText ?? '') + ' ' + (srcODCS.BurstText ?? '') : '';
    const classMatchODCS = txtODCS.match(/【([^】]+)】/);
    const classFilterODCS = classMatchODCS?.[1];
    const candsODCS = ctx.ownerState.hand.filter(cn => {
      const card = ctx.cardMap.get(cn);
      if (card?.Type !== 'シグニ') return false;
      return !classFilterODCS || (card.CardClass ?? '').includes(classFilterODCS);
    });
    if (candsODCS.length === 0) return done(addLog(ctx, '対象クラスシグニなし（任意捨て）'));
    const thenODCS: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsODCS, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: thenODCS,
    });
  }
  // PICK_FROM_TRASHED_CARDS: トラッシュカードからピックして手札へ
  if (stub.id === 'PICK_FROM_TRASHED_CARDS') {
    const trashPFTC = ctx.ownerState.trash;
    if (trashPFTC.length === 0) return done(addLog(ctx, 'トラッシュなし'));
    const thenPFTC: TransferToHandAction = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: trashPFTC, count: 1, optional: true,
      targetScope: 'self_trash', thenAction: thenPFTC,
    });
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
  // CONDITIONAL_DISCARD: 条件付き手札捨て
  if (stub.id === 'CONDITIONAL_DISCARD') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし（条件捨てなし）'));
    const thenCD: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: ctx.ownerState.hand, count: 1, optional: false,
      targetScope: 'self_hand', thenAction: thenCD,
    });
  }
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
  // SELECT_NO_COMMON_COLOR / DISCARD_OR_PENALTY: log
  // === バッチ8: パワー修正（ルリグ・カウント系） ===
  // POWER_MOD_BY_LRIG_LEVEL: ルリグレベル×deltaを相手シグニに適用
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL') {
    const toHWPMBLL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const centerNumPMBLL = ctx.ownerState.field.lrig.at(-1);
    const centerCardPMBLL = centerNumPMBLL ? ctx.cardMap.get(centerNumPMBLL) : undefined;
    const lrigLevelPMBLL = centerCardPMBLL ? parseInt(toHWPMBLL(centerCardPMBLL.Level ?? '0')) || 0 : 0;
    const srcPMBLL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLL = srcPMBLL ? (srcPMBLL.EffectText ?? '') + ' ' + (srcPMBLL.BurstText ?? '') : '';
    const mPMBLL = txtPMBLL.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBLL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_LRIG_LEVEL）'));
    const singleDeltaPMBLL = parseInt(toHWPMBLL(mPMBLL[1]).replace('＋', '+').replace('－', '-'));
    const totalDeltaPMBLL = singleDeltaPMBLL * lrigLevelPMBLL;
    const modsPMBLL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLL.push({ cardNum: top, delta: totalDeltaPMBLL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLL } },
      `ルリグLv${lrigLevelPMBLL}×${singleDeltaPMBLL}→相手シグニパワー${totalDeltaPMBLL}`));
  }
  // POWER_MOD_BY_LRIG_LEVEL_SUM: 全ルリグレベル合計×deltaを相手シグニに
  if (stub.id === 'POWER_MOD_BY_LRIG_LEVEL_SUM') {
    const toHWPMBLLS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lrigLevelSumPMBLLS = ctx.ownerState.field.lrig.reduce((sum, cn) => {
      return sum + (parseInt(toHWPMBLLS(ctx.cardMap.get(cn)?.Level ?? '0')) || 0);
    }, 0);
    const srcPMBLLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBLLS = srcPMBLLS ? (srcPMBLLS.EffectText ?? '') + ' ' + (srcPMBLLS.BurstText ?? '') : '';
    const mPMBLLS = txtPMBLLS.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBLLS) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_LRIG_LEVEL_SUM）'));
    const singleDeltaPMBLLS = parseInt(toHWPMBLLS(mPMBLLS[1]).replace('＋', '+').replace('－', '-'));
    const totalDeltaPMBLLS = singleDeltaPMBLLS * lrigLevelSumPMBLLS;
    const modsPMBLLS = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBLLS.push({ cardNum: top, delta: totalDeltaPMBLLS }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBLLS } },
      `全ルリグLv合計${lrigLevelSumPMBLLS}×${singleDeltaPMBLLS}→相手シグニパワー${totalDeltaPMBLLS}`));
  }
  // POWER_MOD_BY_TRASH_CLASS_COUNT: トラッシュの特定クラス枚数×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_TRASH_CLASS_COUNT') {
    const toHWPMBTCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBTCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBTCC = srcPMBTCC ? (srcPMBTCC.EffectText ?? '') + ' ' + (srcPMBTCC.BurstText ?? '') : '';
    const classMatchPMBTCC = txtPMBTCC.match(/【([^】]+)】.*?(?:の)?(?:シグニ|カード).*?([＋+－-][０-９\d]+)/);
    if (!classMatchPMBTCC) return done(addLog(ctx, 'クラス/パワー値解析失敗（POWER_MOD_BY_TRASH_CLASS_COUNT）'));
    const classNamePMBTCC = classMatchPMBTCC[1];
    const singleDeltaPMBTCC = parseInt(toHWPMBTCC(classMatchPMBTCC[2]).replace('＋', '+').replace('－', '-'));
    const trashClassCountPMBTCC = ctx.ownerState.trash.filter(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(classNamePMBTCC)).length;
    const totalDeltaPMBTCC = singleDeltaPMBTCC * trashClassCountPMBTCC;
    if (ctx.sourceCardNum) {
      const modsOwnPMBTCC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBTCC }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBTCC } },
        `トラッシュ【${classNamePMBTCC}】${trashClassCountPMBTCC}枚×${singleDeltaPMBTCC}→パワー${totalDeltaPMBTCC}`));
    }
    const modsOppPMBTCC = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBTCC.push({ cardNum: top, delta: totalDeltaPMBTCC }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBTCC } },
      `トラッシュ【${classNamePMBTCC}】${trashClassCountPMBTCC}枚→相手パワー${totalDeltaPMBTCC}`));
  }
  // POWER_MOD_BY_UNDER_COUNT: シグニ下のカード枚数×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_UNDER_COUNT') {
    const toHWPMBUC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBUC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBUC = srcPMBUC ? (srcPMBUC.EffectText ?? '') + ' ' + (srcPMBUC.BurstText ?? '') : '';
    const mPMBUC = txtPMBUC.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBUC || !ctx.sourceCardNum) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_UNDER_COUNT）'));
    const singleDeltaPMBUC = parseInt(toHWPMBUC(mPMBUC[1]).replace('＋', '+').replace('－', '-'));
    let selfZonePMBUC = -1;
    for (let zi = 0; zi < 3; zi++) { if (ctx.ownerState.field.signi[zi]?.at(-1) === ctx.sourceCardNum) { selfZonePMBUC = zi; break; } }
    const underCountPMBUC = selfZonePMBUC >= 0 ? Math.max(0, (ctx.ownerState.field.signi[selfZonePMBUC]?.length ?? 1) - 1) : 0;
    const totalDeltaPMBUC = singleDeltaPMBUC * underCountPMBUC;
    const modsPMBUC = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBUC }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMBUC } },
      `シグニ下${underCountPMBUC}枚×${singleDeltaPMBUC}→パワー${totalDeltaPMBUC}`));
  }
  // POWER_MOD_BY_COLOR_VARIETY: 色の種類数×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_COLOR_VARIETY') {
    const toHWPMBCV = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBCV = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBCV = srcPMBCV ? (srcPMBCV.EffectText ?? '') + ' ' + (srcPMBCV.BurstText ?? '') : '';
    const mPMBCV = txtPMBCV.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBCV) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_COLOR_VARIETY）'));
    const singleDeltaPMBCV = parseInt(toHWPMBCV(mPMBCV[1]).replace('＋', '+').replace('－', '-'));
    // 自分のエナゾーンの色の種類（"無色"以外）
    const colorsInEna = new Set<string>();
    for (const cn of ctx.ownerState.energy) {
      for (const c of splitColors(ctx.cardMap.get(cn)?.Color)) colorsInEna.add(c);
    }
    const colorCountPMBCV = colorsInEna.size;
    const totalDeltaPMBCV = singleDeltaPMBCV * colorCountPMBCV;
    if (ctx.sourceCardNum) {
      const modsOwnPMBCV = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBCV }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBCV } },
        `エナ色${colorCountPMBCV}種×${singleDeltaPMBCV}→パワー${totalDeltaPMBCV}`));
    }
    const modsOppPMBCV = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBCV.push({ cardNum: top, delta: totalDeltaPMBCV }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBCV } },
      `エナ色${colorCountPMBCV}種→相手シグニパワー${totalDeltaPMBCV}`));
  }
  // POWER_MOD_BY_DISCARD_COUNT_HIGH: 捨てた枚数の高い方×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_DISCARD_COUNT_HIGH') {
    const toHWPMBDCH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBDCH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBDCH = srcPMBDCH ? (srcPMBDCH.EffectText ?? '') + ' ' + (srcPMBDCH.BurstText ?? '') : '';
    const mPMBDCH = txtPMBDCH.match(/([＋+－-][０-９\d]+)/);
    if (!mPMBDCH) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_DISCARD_COUNT_HIGH）'));
    const singleDeltaPMBDCH = parseInt(toHWPMBDCH(mPMBDCH[1]).replace('＋', '+').replace('－', '-'));
    const discardCountPMBDCH = ctx.lastProcessedCards?.length ?? 0;
    const totalDeltaPMBDCH = singleDeltaPMBDCH * discardCountPMBDCH;
    const modsPMBDCH = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMBDCH.push({ cardNum: top, delta: totalDeltaPMBDCH }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMBDCH } },
      `捨て${discardCountPMBDCH}枚×${singleDeltaPMBDCH}→相手パワー${totalDeltaPMBDCH}`));
  }
  // === バッチ9: ルリグ・条件サーチ・選択系 ===
  // CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK: クラフトをルリグデッキへ
  if (stub.id === 'CRAFT_TO_LRIG_DECK' || stub.id === 'ADD_CRAFT_TO_LRIG_DECK') {
    let cnCTLD = ctx.sourceCardNum ?? ctx.lastProcessedCards?.[0];
    if (!cnCTLD) {
      // テキストから《カード名》を解析してlrig_trash→field→deck から検索
      const srcCTLD2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtCTLD2 = srcCTLD2 ? (srcCTLD2.EffectText ?? '') : '';
      const nameMCTLD2 = txtCTLD2.match(/クラフトの《([^》]+)》/);
      const craftNameCTLD2 = nameMCTLD2 ? nameMCTLD2[1] : '';
      if (craftNameCTLD2) {
        const fromLrigTrash = ctx.ownerState.lrig_trash.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2);
        const fromField = ctx.ownerState.field.lrig.find(cn => ctx.cardMap.get(cn)?.CardName === craftNameCTLD2);
        cnCTLD = fromLrigTrash ?? fromField;
      }
      if (!cnCTLD) return done(addLog(ctx, `クラフトカードなし${craftNameCTLD2 ? `（${craftNameCTLD2}）` : ''}`));
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
    const srcCPT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCPT = srcCPT ? (srcCPT.EffectText ?? '') + ' ' + (srcCPT.BurstText ?? '') : '';
    const toHWCPT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mCPT = txtCPT.match(/トラッシュに(?:カードが)?([０-９\d]+)枚以上/);
    const threshold = mCPT ? parseInt(toHWCPT(mCPT[1])) : 5;
    const trashCountCPT = ctx.ownerState.trash.length;
    if (trashCountCPT < threshold) return done(addLog(ctx, `トラッシュ${trashCountCPT}枚（閾値${threshold}枚に未達）`));
    // 条件達成→1枚ドロー
    const sCPT = ctx.ownerState;
    if (sCPT.deck.length === 0) return done(addLog(ctx, `トラッシュ条件達成だがデッキなし`));
    const drawnCPT = sCPT.deck[0];
    return done(addLog({ ...ctx, ownerState: { ...sCPT, deck: sCPT.deck.slice(1), hand: [...sCPT.hand, drawnCPT] } },
      `トラッシュ${trashCountCPT}枚条件達成→1枚ドロー`));
  }
  // === バッチ10: 公開・手札・相手手札操作 ===
  // LOOK_OPP_HAND_DISCARD_SIGNI: 相手の手札を見てシグニ1枚を捨てさせる
  if (stub.id === 'LOOK_OPP_HAND_DISCARD_SIGNI') {
    const signiInOppLOHDS = ctx.otherState.hand.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiInOppLOHDS.length === 0) return done(addLog(ctx, '相手手札にシグニなし'));
    const thenLOHDS: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: signiInOppLOHDS, count: 1, optional: false,
      targetScope: 'opp_hand', thenAction: thenLOHDS,
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
  // POWER_MOD_BY_FIELD_CLASS_LEVEL: フィールドのクラスシグニレベル合計×deltaをパワー修正
  if (stub.id === 'POWER_MOD_BY_FIELD_CLASS_LEVEL') {
    const toHWPMBFCL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMBFCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMBFCL = srcPMBFCL ? (srcPMBFCL.EffectText ?? '') + ' ' + (srcPMBFCL.BurstText ?? '') : '';
    const classMatchPMBFCL = txtPMBFCL.match(/【([^】]+)】/);
    const classNamePMBFCL = classMatchPMBFCL?.[1] ?? '';
    const mDeltaPMBFCL = txtPMBFCL.match(/([＋+－-][０-９\d]+)/);
    if (!mDeltaPMBFCL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_BY_FIELD_CLASS_LEVEL）'));
    const singleDeltaPMBFCL = parseInt(toHWPMBFCL(mDeltaPMBFCL[1]).replace('＋', '+').replace('－', '-'));
    let levelSumPMBFCL = 0;
    for (let zi = 0; zi < 3; zi++) {
      const cn = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!cn) continue;
      const card = ctx.cardMap.get(cn);
      if (!classNamePMBFCL || (card?.CardClass ?? '').includes(classNamePMBFCL)) {
        levelSumPMBFCL += parseInt(toHWPMBFCL(card?.Level ?? '0')) || 0;
      }
    }
    const totalDeltaPMBFCL = singleDeltaPMBFCL * levelSumPMBFCL;
    if (ctx.sourceCardNum) {
      const modsOwnPMBFCL = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalDeltaPMBFCL }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnPMBFCL } },
        `フィールド【${classNamePMBFCL}】レベル合計${levelSumPMBFCL}×${singleDeltaPMBFCL}→パワー${totalDeltaPMBFCL}`));
    }
    const modsOppPMBFCL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsOppPMBFCL.push({ cardNum: top, delta: totalDeltaPMBFCL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsOppPMBFCL } },
      `フィールドクラスレベル${levelSumPMBFCL}→相手パワー${totalDeltaPMBFCL}`));
  }
  // POWER_MOD_PER_REVEALED_LEVEL: 公開カードのレベル合計×deltaをパワー修正
  if (stub.id === 'POWER_MOD_PER_REVEALED_LEVEL') {
    const toHWPMPRL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMPRL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMPRL = srcPMPRL ? (srcPMPRL.EffectText ?? '') + ' ' + (srcPMPRL.BurstText ?? '') : '';
    const mPMPRL = txtPMPRL.match(/([＋+－-][０-９\d]+)/);
    if (!mPMPRL) return done(addLog(ctx, 'パワー修正値解析失敗（POWER_MOD_PER_REVEALED_LEVEL）'));
    const singleDeltaPMPRL = parseInt(toHWPMPRL(mPMPRL[1]).replace('＋', '+').replace('－', '-'));
    const levelSumPMPRL = (ctx.lastProcessedCards ?? []).reduce((sum, cn) => {
      return sum + (parseInt(toHWPMPRL(ctx.cardMap.get(cn)?.Level ?? '0')) || 0);
    }, 0);
    const totalDeltaPMPRL = singleDeltaPMPRL * levelSumPMPRL;
    const modsPMPRL = [...(ctx.otherState.temp_power_mods ?? [])];
    for (let zi = 0; zi < 3; zi++) { const top = ctx.otherState.field.signi[zi]?.at(-1); if (top) modsPMPRL.push({ cardNum: top, delta: totalDeltaPMPRL }); }
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsPMPRL } },
      `公開レベル合計${levelSumPMPRL}×${singleDeltaPMPRL}→相手シグニパワー${totalDeltaPMPRL}`));
  }
  // === バッチ18: エンジン必須系 ===
  // トラップ系 ─────────────────────────────────────────────────────────

  // PLACE_TRAP_OPTIONAL / SET_HAND_CARD_AS_TRAP: 手札からトラップ設置
  if (stub.id === 'PLACE_TRAP_OPTIONAL' || stub.id === 'SET_HAND_CARD_AS_TRAP') {
    if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, 'トラップ設置：手札なし'));
    const zoneOptsPTO = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}に設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, 'トラップにするカードを選択'), {
      type: 'SELECT_TARGET',
      candidates: ctx.ownerState.hand,
      count: 1,
      optional: false,
      targetScope: 'self_hand',
      thenAction: ({ type: 'STUB', id: 'CHOOSE_TRAP_ZONE' } as StubAction) as EffectAction,
      continuation: ({ type: 'CHOOSE', choose_count: 1, from_count: 3, choices: zoneOptsPTO.map(o => ({ choiceId: o.id, label: o.label, action: o.action })) } as ChooseAction) as EffectAction,
    });
  }
  // CHOOSE_TRAP_ZONE: 選択済みカードのゾーン選択
  if (stub.id === 'CHOOSE_TRAP_ZONE') {
    const zoneOptsCTZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}に設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsCTZ, count: 1,
    });
  }
  // INTERNAL_SET_TRAP: ゾーン番号をstub.valueで受け取りトラップ設置
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
    return done(addLog({ ...ctx, ownerState: newOwnerIST }, `トラップ設置: ゾーン${zoneIdxIST + 1}`));
  }
  // TRAP_TO_HAND: signi_trapsのカードを手札へ（全枚または選択）
  if (stub.id === 'TRAP_TO_HAND') {
    const allTrapsTTH = (ctx.ownerState.field.signi_traps ?? [null, null, null]);
    const trapsToHandTTH = allTrapsTTH.filter(Boolean) as string[];
    if (trapsToHandTTH.length === 0) return done(addLog(ctx, 'トラップなし'));
    // テキストで枚数制限を確認
    const srcTTH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTTH = srcTTH ? (srcTTH.EffectText ?? '') + ' ' + (srcTTH.BurstText ?? '') : '';
    const toHWTTH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const cntMTTH = txtTTH.match(/【トラップ】を([０-９\d]+)枚まで手札に加える/);
    const maxCountTTH = cntMTTH ? parseInt(toHWTTH(cntMTTH[1])) : trapsToHandTTH.length;
    // 「N枚まで」指定があり複数トラップがある場合は選択UI
    if (maxCountTTH < trapsToHandTTH.length && trapsToHandTTH.length > 1) {
      return needsInteraction(addLog(ctx, `手札に加えるトラップを${maxCountTTH}枚まで選択`), {
        type: 'SELECT_TARGET',
        candidates: trapsToHandTTH,
        count: maxCountTTH,
        optional: true,
        targetScope: 'self_field',
        thenAction: ({ type: 'STUB', id: 'INTERNAL_TTH_APPLY' } as StubAction) as EffectAction,
      });
    }
    const takeTTH = trapsToHandTTH.slice(0, maxCountTTH);
    const newTrapsTTH = allTrapsTTH.map(t => (t && takeTTH.includes(t) ? null : t)) as (string | null)[];
    const newOwnerTTH = { ...ctx.ownerState, hand: [...ctx.ownerState.hand, ...takeTTH], field: { ...ctx.ownerState.field, signi_traps: newTrapsTTH } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTH }, `トラップ${takeTTH.length}枚を手札へ`));
  }
  // INTERNAL_TTH_APPLY: TRAP_TO_HAND選択完了後の適用
  if (stub.id === 'INTERNAL_TTH_APPLY') {
    const selectedTTH = ctx.lastProcessedCards ?? [];
    if (selectedTTH.length === 0) return done(addLog(ctx, 'トラップ未選択'));
    const currentTrapsTTH = ctx.ownerState.field.signi_traps ?? [null, null, null];
    const newTrapsTTH2 = currentTrapsTTH.map(t => (t && selectedTTH.includes(t) ? null : t)) as (string | null)[];
    const newOwnerTTH2 = { ...ctx.ownerState, hand: [...ctx.ownerState.hand, ...selectedTTH], field: { ...ctx.ownerState.field, signi_traps: newTrapsTTH2 } };
    return done(addLog({ ...ctx, ownerState: newOwnerTTH2 }, `トラップ${selectedTTH.length}枚を手札へ`));
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
      if (trapIconEffAT) return exec(trapIconEffAT.action, loggedCtxAT);
    }
    return done(loggedCtxAT);
  }
  // SET_OPP_SIGNI_AS_TRAP: 相手のシグニ1体をトラップとして設置
  if (stub.id === 'SET_OPP_SIGNI_AS_TRAP') {
    const oppSigniCandsSSOSAT = (ctx.otherState.field.signi.map((s, zi) => s?.at(-1) ? { instId: s.at(-1)!, zi } : null).filter(Boolean)) as Array<{ instId: string; zi: number }>;
    if (oppSigniCandsSSOSAT.length === 0) return done(addLog(ctx, 'SET_OPP_SIGNI_AS_TRAP: 相手シグニなし'));
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
    return done(addLog({ ...ctx, otherState: newOtherIOSTT }, `相手シグニ→トラップ: ゾーン${zoneIdxIOSTT + 1}`));
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
    const cntMPTFR = txtPTFR.match(/カードを([０-９\d]+)枚見る/);
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
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(
      addLog({ ...ctx, lastProcessedCards: [selectedPTFR] },
        `${ctx.cardMap.get(selectedPTFR)?.CardName ?? selectedPTFR}をトラップとしてゾーン選択`),
      { type: 'CHOOSE', options: zoneOptsPTFR, count: 1 },
    );
  }
  // TRAP_OP: ソースカードのテキストに応じて操作判定
  if (stub.id === 'TRAP_OP') {
    const srcTRAPOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOP = srcTRAPOP ? (srcTRAPOP.EffectText ?? '') + ' ' + (srcTRAPOP.BurstText ?? '') : '';
    // トラップアイコン発動：ACTIVATE_TRAPと同一ロジック（parseCardEffects経由でTRAP_ICON実行）
    if (txtTRAPOP.includes('トラップアイコン') && (txtTRAPOP.includes('発動') || txtTRAPOP.includes('発動させる'))) {
      const trapsIconAT: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
      const firstIdxIconAT = trapsIconAT.findIndex((t: string | null) => t !== null);
      if (firstIdxIconAT < 0) return done(addLog(ctx, 'トラップなし（トラップアイコン発動）'));
      const trapCardIconAT = trapsIconAT[firstIdxIconAT]!;
      const newTrapsIconAT = [...trapsIconAT] as (string | null)[];
      newTrapsIconAT[firstIdxIconAT] = null;
      const newOwnerIconAT = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardIconAT], field: { ...ctx.ownerState.field, signi_traps: newTrapsIconAT } };
      const loggedIconAT = addLog({ ...ctx, ownerState: newOwnerIconAT, sourceCardNum: trapCardIconAT }, `トラップアイコン発動: ${ctx.cardMap.get(trapCardIconAT)?.CardName ?? trapCardIconAT}`);
      const trapDataIconAT = ctx.cardMap.get(trapCardIconAT);
      if (trapDataIconAT) {
        const trapEffsIconAT = parseCardEffects(trapDataIconAT);
        const trapIconEffAT = trapEffsIconAT.find(e => e.effectType === 'TRAP_ICON');
        if (trapIconEffAT) return exec(trapIconEffAT.action, loggedIconAT);
      }
      return done(loggedIconAT);
    }
    if (txtTRAPOP.includes('トラッシュに置く') || txtTRAPOP.includes('トラッシュへ置く')) {
      const trapsTO: (string | null)[] = ctx.ownerState.field.signi_traps ?? [null, null, null];
      const firstIdxTO = trapsTO.findIndex((t: string | null) => t !== null);
      if (firstIdxTO < 0) return done(addLog(ctx, 'トラップなし'));
      const trapCardTO = trapsTO[firstIdxTO]!;
      const newTrapsTO = [...trapsTO] as (string | null)[];
      newTrapsTO[firstIdxTO] = null;
      const newOwnerTO = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, trapCardTO], field: { ...ctx.ownerState.field, signi_traps: newTrapsTO } };
      return done(addLog({ ...ctx, ownerState: newOwnerTO }, `トラップをトラッシュへ`));
    }
    if (txtTRAPOP.includes('手札から') && (txtTRAPOP.includes('設置') || txtTRAPOP.includes('トラップ'))) {
      if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, 'トラップ設置：手札なし'));
      const zoneOptsTRAPOP = [0, 1, 2].map(zi => ({
        id: `zone_${zi}`,
        label: `ゾーン${zi + 1}に設置`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, 'トラップにするカードを選択'), {
        type: 'SELECT_TARGET',
        candidates: ctx.ownerState.hand,
        count: 1,
        optional: false,
        targetScope: 'self_hand',
        thenAction: ({ type: 'STUB', id: 'CHOOSE_TRAP_ZONE' } as StubAction) as EffectAction,
        continuation: ({ type: 'CHOOSE', choose_count: 1, from_count: 3, choices: zoneOptsTRAPOP.map(o => ({ choiceId: o.id, label: o.label, action: o.action })) } as ChooseAction) as EffectAction,
      });
    }
    // 「その中から」パターン: lastProcessedCardsのカードをトラップとして設置
    if (ctx.lastProcessedCards?.length) {
      const zoneOptsTRAPOP3 = [0, 1, 2].map(zi => ({
        id: `trapop3_zone_${zi}`,
        label: `ゾーン${zi + 1}にトラップ設置`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(ctx.lastProcessedCards[0])?.CardName ?? ctx.lastProcessedCards[0]}をトラップとして設置するゾーンを選択`), {
        type: 'CHOOSE', options: zoneOptsTRAPOP3, count: 1,
      });
    }
    return done(addLog(ctx, '[トラップ操作]'));
  }
  // TRAP_OPERATION: トラップ/チェックゾーン操作の統合ハンドラ
  if (stub.id === 'TRAP_OPERATION') {
    const srcTRAPOPER = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtTRAPOPER = srcTRAPOPER ? (srcTRAPOPER.EffectText ?? '') + ' ' + (srcTRAPOPER.BurstText ?? '') : '';
    // チェックゾーンに置く: lastProcessedCards[0] を field.check に設置
    if (txtTRAPOPER.includes('チェックゾーンに置') || txtTRAPOPER.includes('チェックゾーンへ')) {
      const cardToCheckTO = ctx.lastProcessedCards?.[0] ?? (ctx.ownerState.deck.length > 0 ? ctx.ownerState.deck[0] : null);
      if (!cardToCheckTO) return done(addLog(ctx, '[チェックゾーン：対象カードなし]'));
      const newDeckCKTO = ctx.ownerState.deck[0] === cardToCheckTO ? ctx.ownerState.deck.slice(1) : ctx.ownerState.deck;
      const newHandCKTO = ctx.ownerState.hand.filter(c => c !== cardToCheckTO);
      const newOwnerCKTO = { ...ctx.ownerState, deck: newDeckCKTO, hand: newHandCKTO, field: { ...ctx.ownerState.field, check: cardToCheckTO } };
      return done(addLog({ ...ctx, ownerState: newOwnerCKTO }, `${ctx.cardMap.get(cardToCheckTO)?.CardName ?? cardToCheckTO}をチェックゾーンへ`));
    }
    // このスペル自身をシグニの下に置いてもよい（WXDi-P11-063等）
    if (txtTRAPOPER.includes('の下に置いてもよい')) {
      const spellNumTO = ctx.sourceCardNum;
      if (spellNumTO) {
        const selfTopSigniTO = ctx.ownerState.field.signi.map(s => s?.at(-1)).filter((c): c is string => !!c);
        const memoriaMatchTO = [...txtTRAPOPER.matchAll(/《([^》]+メモリア[^》]*)》/g)].map(m => m[1]);
        const hostCandsTO = memoriaMatchTO.length > 0
          ? selfTopSigniTO.filter(cn => memoriaMatchTO.some(name => ctx.cardMap.get(cn)?.CardName === name))
          : selfTopSigniTO;
        const validHostsTO = hostCandsTO.length > 0 ? hostCandsTO : selfTopSigniTO;
        const spellNameTO = ctx.cardMap.get(spellNumTO)?.CardName ?? spellNumTO;
        const placeOptsTO = validHostsTO.map(cn => ({
          id: `under_${cn}`,
          label: `${ctx.cardMap.get(cn)?.CardName ?? cn}の下に置く`,
          action: ({ type: 'STUB', id: 'INTERNAL_PLACE_SELF_UNDER_SIGNI', value: cn } as StubAction) as EffectAction,
          available: true,
        }));
        placeOptsTO.push({
          id: 'skip', label: 'スキップ（トラッシュへ）',
          action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction,
          available: true,
        });
        return needsInteraction(addLog(ctx, `${spellNameTO}をシグニの下に置きますか？`), {
          type: 'CHOOSE', count: 1, options: placeOptsTO,
        });
      }
    }
    const cardToTrapTO = ctx.lastProcessedCards?.[0];
    if (cardToTrapTO) {
      // lastProcessedCards[0] をトラップとして設置（ゾーン選択）
      const zoneOptsTRAPOP = [0, 1, 2].map(zi => ({
        id: `trapop_zone_${zi}`,
        label: `ゾーン${zi + 1}にトラップ設置`,
        action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(
        addLog({ ...ctx, lastProcessedCards: [cardToTrapTO] }, `${ctx.cardMap.get(cardToTrapTO)?.CardName ?? cardToTrapTO}をトラップとして設置`),
        { type: 'CHOOSE', options: zoneOptsTRAPOP, count: 1 }
      );
    }
    // lastProcessedCardsなし：デッキ上1枚を手札に加える（デッキ上確認後のトラップ設置が多い）
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, '[トラップ操作：デッキなし]'));
    const topCardTO = ctx.ownerState.deck[0];
    const newDeckTO = ctx.ownerState.deck.slice(1);
    const newOwnerTO = { ...ctx.ownerState, deck: newDeckTO };
    const zoneOptsTRAPOP2 = [0, 1, 2].map(zi => ({
      id: `trapop2_zone_${zi}`,
      label: `ゾーン${zi + 1}にトラップ設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_TRAP', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    zoneOptsTRAPOP2.push({
      id: 'trapop2_skip', label: 'スキップ（手札に加える）',
      action: ({ type: 'ADD_TO_HAND', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as unknown) as EffectAction,
      available: true,
    });
    return needsInteraction(
      addLog({ ...ctx, ownerState: newOwnerTO, lastProcessedCards: [topCardTO] },
        `デッキ上${ctx.cardMap.get(topCardTO)?.CardName ?? topCardTO}：トラップ設置？`),
      { type: 'CHOOSE', options: zoneOptsTRAPOP2, count: 1 }
    );
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
    const zoneOptsISD = [0, 1, 2].map(zi => ({
      id: `seed_zone_${zi}`,
      label: `ゾーン${zi + 1}にシード設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog({ ...ctx, ownerState: newOwnerISD }, 'シード設置ゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsISD, count: 1,
    });
  }
  // INTERNAL_SET_SEED: lastProcessedCards[0]を指定ゾーンにシード設置
  if (stub.id === 'INTERNAL_SET_SEED') {
    const zoneIdxISS = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const seedCardISS = ctx.lastProcessedCards?.[0] ?? null;
    if (!seedCardISS) return done(addLog(ctx, 'シード設置：対象カードなし'));
    const currentSeedsISS = [...(ctx.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
    const newTrashISS = [...ctx.ownerState.trash];
    if (currentSeedsISS[zoneIdxISS]) newTrashISS.push(currentSeedsISS[zoneIdxISS]!);
    currentSeedsISS[zoneIdxISS] = seedCardISS;
    // 手札にあれば手札からも除去（手札から設置するケース）
    const newHandISS = ctx.ownerState.hand.filter(c => c !== seedCardISS);
    const newOwnerISS = { ...ctx.ownerState, hand: newHandISS, trash: newTrashISS, field: { ...ctx.ownerState.field, signi_seeds: currentSeedsISS } };
    return done(addLog({ ...ctx, ownerState: newOwnerISS }, `シード設置: ゾーン${zoneIdxISS + 1}`));
  }
  // SEED_BLOOM: シード1枚（または好きな枚数）を開花する
  // SEED_BLOOM_OPTIONAL: 任意でシード1枚を開花する
  if (stub.id === 'SEED_BLOOM' || stub.id === 'SEED_BLOOM_OPTIONAL') {
    const seedsSB = ctx.ownerState.field.signi_seeds ?? [null, null, null];
    const availableZonesSB = [0, 1, 2].filter(zi => seedsSB[zi] !== null);
    if (availableZonesSB.length === 0) return done(addLog(ctx, 'シード開花：シードなし'));
    // 「好きな枚数」全開花パターン
    const srcSB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSB = srcSB ? (srcSB.EffectText ?? '') + ' ' + (srcSB.BurstText ?? '') : '';
    if (txtSB.includes('好きな枚数')) {
      let curSB = ctx;
      const bloomedCardsSB: string[] = [];
      for (const zi of [0, 1, 2]) {
        const s = (curSB.ownerState.field.signi_seeds ?? [null, null, null])[zi];
        if (!s) continue;
        if (curSB.ownerState.field.signi[zi]?.length) { curSB = addLog(curSB, `開花：ゾーン${zi + 1}シグニあり`); continue; }
        const sd = curSB.cardMap.get(s);
        const newSeeds2 = [...(curSB.ownerState.field.signi_seeds ?? [null, null, null])] as (string | null)[];
        newSeeds2[zi] = null;
        if (!sd || sd.Type !== 'シグニ') {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `開花：シグニ以外→トラッシュ`);
          continue;
        }
        const lrigInst2 = curSB.ownerState.field.lrig.at(-1);
        const lrigCard2 = lrigInst2 ? curSB.cardMap.get(lrigInst2) : null;
        const lrigLv2 = parseInt(lrigCard2?.Level ?? '0', 10);
        const signiLv2 = parseInt(sd.Level ?? '0', 10);
        if (signiLv2 > lrigLv2) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `開花：${sd.CardName}レベル超過→トラッシュ`);
          continue;
        }
        const lrigLim2 = lrigCard2?.Limit === '∞' ? Infinity : (parseInt(lrigCard2?.Limit ?? '0', 10) || 0);
        let usedLim2 = 0;
        for (let zj = 0; zj < 3; zj++) { if (zj !== zi) { const top2 = curSB.ownerState.field.signi[zj]?.at(-1); if (top2) usedLim2 += parseInt(curSB.cardMap.get(top2)?.Level ?? '0', 10); } }
        if (usedLim2 + signiLv2 > lrigLim2) {
          curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, trash: [...curSB.ownerState.trash, s], field: { ...curSB.ownerState.field, signi_seeds: newSeeds2 } } }, `開花：${sd.CardName}リミット超過→トラッシュ`);
          continue;
        }
        const newSig2 = [...curSB.ownerState.field.signi] as (string[] | null)[];
        newSig2[zi] = [s];
        bloomedCardsSB.push(s);
        curSB = addLog({ ...curSB, ownerState: { ...curSB.ownerState, field: { ...curSB.ownerState.field, signi: newSig2, signi_seeds: newSeeds2 } } }, `開花：${sd.CardName}がゾーン${zi + 1}に出た`);
      }
      const doneAllSB = done(curSB) as { done: true; ownerState: PlayerState; otherState: PlayerState; logs: string[] };
      return bloomedCardsSB.length > 0 ? { ...doneAllSB, lastProcessedCards: bloomedCardsSB } : doneAllSB;
    }
    const optional = stub.id === 'SEED_BLOOM_OPTIONAL';
    const zoneOptsSB = availableZonesSB.map(zi => {
      const seedName = ctx.cardMap.get(seedsSB[zi]!)?.CardName ?? seedsSB[zi]!;
      return {
        id: `bloom_zone_${zi}`,
        label: `ゾーン${zi + 1}（${seedName}）を開花`,
        action: ({ type: 'STUB', id: 'INTERNAL_BLOOM_SEED', value: zi } as StubAction) as EffectAction,
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
    const signiStackIBS = ctx.ownerState.field.signi[zoneIdxIBS];
    if (signiStackIBS?.length) {
      const newOwnerSkip = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerSkip }, `開花：ゾーン${zoneIdxIBS + 1}にシグニあり（開花不可）`));
    }
    const seedCardDataIBS = ctx.cardMap.get(seedCardIBS);
    // シグニ以外はトラッシュへ
    if (!seedCardDataIBS || seedCardDataIBS.Type !== 'シグニ') {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：シグニでないためトラッシュへ`));
    }
    // ルリグレベルチェック
    const lrigInstIBS = ctx.ownerState.field.lrig.at(-1);
    const lrigCardIBS = lrigInstIBS ? ctx.cardMap.get(lrigInstIBS) : null;
    const lrigLevelIBS = parseInt(lrigCardIBS?.Level ?? '0', 10);
    const signiLevelIBS = parseInt(seedCardDataIBS.Level ?? '0', 10);
    if (signiLevelIBS > lrigLevelIBS) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}レベル${signiLevelIBS}超過でトラッシュへ`));
    }
    // リミットチェック（他ゾーンのシグニレベル合計 + このシグニのレベル > ルリグのリミット）
    const lrigLimitIBS = lrigCardIBS?.Limit === '∞' ? Infinity : (parseInt(lrigCardIBS?.Limit ?? '0', 10) || 0);
    let usedLimitIBS = 0;
    for (let zi = 0; zi < 3; zi++) {
      if (zi === zoneIdxIBS) continue;
      const topInstZI = ctx.ownerState.field.signi[zi]?.at(-1);
      if (topInstZI) usedLimitIBS += parseInt(ctx.cardMap.get(topInstZI)?.Level ?? '0', 10);
    }
    if (usedLimitIBS + signiLevelIBS > lrigLimitIBS) {
      const newOwnerIBS = { ...ctx.ownerState, trash: [...ctx.ownerState.trash, seedCardIBS], field: { ...ctx.ownerState.field, signi_seeds: newSeedsIBS } };
      return done(addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}リミット超過でトラッシュへ`));
    }
    // 場に出す。lastProcessedCards にセットし BattleScreen が ON_PLAY 効果を積む
    const newSigniIBS = [...ctx.ownerState.field.signi] as (string[] | null)[];
    newSigniIBS[zoneIdxIBS] = [seedCardIBS];
    const newOwnerIBS = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIBS, signi_seeds: newSeedsIBS } };
    const doneCtxIBS = addLog({ ...ctx, ownerState: newOwnerIBS }, `開花：${seedCardDataIBS.CardName}がゾーン${zoneIdxIBS + 1}に出た`);
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
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
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
      action: ({ type: 'STUB', id: 'INTERNAL_SET_SEED', value: zi } as StubAction) as EffectAction,
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
  // 裏向き系（face_down_signi + abilities_removed で近似実装済み）
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
    // ゾーンを無効化
    const newDisabledIRSZ = [...(newOtherIRSZ.disabled_signi_zones ?? [])];
    if (!newDisabledIRSZ.includes(zoneIdxIRSZ)) newDisabledIRSZ.push(zoneIdxIRSZ);
    newOtherIRSZ = { ...newOtherIRSZ, disabled_signi_zones: newDisabledIRSZ };
    return done(addLog({ ...ctx, otherState: newOtherIRSZ },
      `相手ゾーン${zoneIdxIRSZ + 1}を削除（${oppStackIRSZ.length}体トラッシュ）`));
  }
  // DESIGNATE_SIGNI_ZONE: 相手シグニゾーンを1つ指定する
  if (stub.id === 'DESIGNATE_SIGNI_ZONE') {
    const zoneOptsDSZ = [0, 1, 2].map(zi => ({
      id: `zone_${zi}`,
      label: `ゾーン${zi + 1}を指定`,
      action: ({ type: 'STUB', id: 'INTERNAL_DESIGNATE_ZONE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '指定する相手シグニゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsDSZ, count: 1,
    });
  }
  // INTERNAL_DESIGNATE_ZONE: 選択したゾーンを相手Stateに保存
  if (stub.id === 'INTERNAL_DESIGNATE_ZONE') {
    const zoneIdxIDZ = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const newOtherIDZ = { ...ctx.otherState, designated_zone: zoneIdxIDZ };
    return done(addLog({ ...ctx, otherState: newOtherIDZ }, `相手ゾーン${zoneIdxIDZ + 1}を指定`));
  }
  // BLOCK_OPP_ZONE_PLACEMENT: 指定ゾーンへの配置を禁止（disabled_signi_zones に追加）
  if (stub.id === 'BLOCK_OPP_ZONE_PLACEMENT') {
    const zoneIdxBOZP = ctx.otherState.designated_zone ?? 0;
    const currentDisabledBOZP = [...(ctx.otherState.disabled_signi_zones ?? [])];
    if (!currentDisabledBOZP.includes(zoneIdxBOZP)) currentDisabledBOZP.push(zoneIdxBOZP);
    const newOtherBOZP = { ...ctx.otherState, disabled_signi_zones: currentDisabledBOZP };
    return done(addLog({ ...ctx, otherState: newOtherBOZP }, `相手ゾーン${zoneIdxBOZP + 1}へのシグニ配置を禁止`));
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
    return needsInteraction(addLog(ctx, `追加コスト${extraPaidAECC ? '支払済（2つ選択）' : '未払（1つ選択）'}`), {
      type: 'CHOOSE', options: optsAECC, count: countAECC,
    });
  }
  // アーツ条件系（engine: アーツ使用条件未実装）
  if (stub.id === 'ARTS_IMMOVABLE' || stub.id === 'ACCE_COST_REDUCTION') {
    return done(addLog(ctx, `[アーツ/アクセコスト: ${stub.id}]`));
  }
  // ARTS_USE_DISCARD_COLOR_HAND: 手札から特定色のカードを任意N枚まで捨て、コスト軽減（OPTIONAL_DISCARD_CLASS_SIGNI の色版）
  if (stub.id === 'ARTS_USE_DISCARD_COLOR_HAND') {
    const srcAUDCH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAUDCH = srcAUDCH ? (srcAUDCH.EffectText ?? '') + ' ' + (srcAUDCH.BurstText ?? '') : '';
    const toHWAUDCH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const colorMatchAUDCH = txtAUDCH.match(/手札から(白|赤|青|緑|黒)のカードを/);
    const targetColor = colorMatchAUDCH?.[1];
    const maxMAUDCH = txtAUDCH.match(/カードを([０-９\d]+)枚まで捨てる/);
    const maxAUDCH = maxMAUDCH ? parseInt(toHWAUDCH(maxMAUDCH[1])) : 3;
    const candsAUDCH = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return !targetColor || (c?.Color ?? '').includes(targetColor);
    });
    if (candsAUDCH.length === 0) return done(addLog(ctx, `手札に${targetColor ?? ''}カードなし（ARTS_USE_DISCARD_COLOR_HAND）`));
    const discardAction: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return selectOrInteract(candsAUDCH, maxAUDCH, true, 'self_hand', discardAction as EffectAction, undefined, ctx);
  }
  // PLAY_SPELL_FREE_IGNORE_RESTRICTION: 手札のスペルをコストなし・限定条件無視で使用
  if (stub.id === 'PLAY_SPELL_FREE_IGNORE_RESTRICTION') {
    const cnPSFIR = ctx.lastProcessedCards?.[0];
    if (!cnPSFIR) {
      // 未選択：手札のスペルを SELECT_TARGET で選ぶ
      const srcPSFIR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtPSFIR = srcPSFIR ? (srcPSFIR.EffectText ?? '') + ' ' + (srcPSFIR.BurstText ?? '') : '';
      const toHWPSFIR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const costLimitMPSFIR = txtPSFIR.match(/コストの合計が([０-９\d]+)以下/);
      const costLimitPSFIR = costLimitMPSFIR ? parseInt(toHWPSFIR(costLimitMPSFIR[1])) : Infinity;
      const spellCandsPSFIR = ctx.ownerState.hand.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c || c.Type !== 'スペル') return false;
        if (costLimitPSFIR < Infinity) {
          const costArr = Array.isArray(c.Cost) ? c.Cost : [];
          const totalCost = typeof c.Cost === 'string' ? parseInt(c.Cost) || 0 : costArr.length;
          if (totalCost > costLimitPSFIR) return false;
        }
        return true;
      });
      if (spellCandsPSFIR.length === 0) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: 手札に対象スペルなし]'));
      const contPSFIR: StubAction = { type: 'STUB', id: 'PLAY_SPELL_FREE_IGNORE_RESTRICTION' };
      return needsInteraction(addLog(ctx, '手札のスペルを選択（コストなし・限定条件無視）'), {
        type: 'SELECT_TARGET', candidates: spellCandsPSFIR, count: 1, optional: false,
        targetScope: 'self_hand', thenAction: contPSFIR as EffectAction,
      });
    }
    // 選択済み：選んだスペルをトラッシュへ移動して効果実行
    const cardPSFIR = ctx.cardMap.get(cnPSFIR);
    if (!cardPSFIR) return done(addLog(ctx, '[PLAY_SPELL_FREE_IGNORE_RESTRICTION: カードデータなし]'));
    const effectsPSFIR = parseCardEffects(cardPSFIR);
    const mainEffPSFIR = effectsPSFIR.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'))
    );
    if (!mainEffPSFIR) return done(addLog(ctx, `[PLAY_SPELL_FREE_IGNORE_RESTRICTION: ${cardPSFIR.CardName}効果なし]`));
    const statePSFIR = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, cnPSFIR],
      hand: ctx.ownerState.hand.filter(c => c !== cnPSFIR),
    };
    return exec(mainEffPSFIR.action,
      addLog({ ...ctx, ownerState: statePSFIR, sourceCardNum: cnPSFIR, lastProcessedCards: [] },
        `${cardPSFIR.CardName}をコストなし・限定条件無視で使用`));
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
    const cnPF = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
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
        stateAfterPF = { ...stateAfterPF, trash: [...stateAfterPF.trash, cnPF], hand: stateAfterPF.hand.filter(c => c !== cnPF) };
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
  // POWER_MOD_DISTRIBUTE: 合計パワーを選択シグニに均等配分（自場シグニ最大3体）
  if (stub.id === 'POWER_MOD_DISTRIBUTE') {
    const toHWPMD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcPMD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPMD = srcPMD ? (srcPMD.EffectText ?? '') + ' ' + (srcPMD.BurstText ?? '') : '';
    const mPMD = txtPMD.match(/合わせて[＋+]([０-９\d]+)/);
    const totalBoostPMD = mPMD ? parseInt(toHWPMD(mPMD[1])) : 20000;
    const existOwnPMD = (ctx.lastProcessedCards ?? []).filter(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (existOwnPMD.length > 0) {
      const perSigniPMD = Math.floor(totalBoostPMD / existOwnPMD.length / 1000) * 1000;
      const modsPMD = [...(ctx.ownerState.temp_power_mods ?? [])];
      for (const cn of existOwnPMD) modsPMD.push({ cardNum: cn, delta: perSigniPMD });
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsPMD } },
        `${existOwnPMD.length}体に+${perSigniPMD}ずつ（合計+${totalBoostPMD}配分）`));
    }
    const ownCandsPMD = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (ownCandsPMD.length === 0) return done(addLog(ctx, '自場にシグニなし（POWER_MOD_DISTRIBUTE）'));
    const contPMD: StubAction = { type: 'STUB', id: 'POWER_MOD_DISTRIBUTE' };
    const noopPMD: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(ownCandsPMD, Math.min(ownCandsPMD.length, 3), false, 'self_field', noopPMD as EffectAction, contPMD as EffectAction, ctx);
  }
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
  // 複雑パワー修正（engine: コンテキスト/配置情報必要）
  // CONDITIONAL_ALT_POWER_BOOST: 条件成立時に代わりにパワー修正（AUTO/ACTIVATED: temp_power_mods）
  if (stub.id === 'CONDITIONAL_ALT_POWER_BOOST') {
    if (!ctx.sourceCardNum) return done(addLog(ctx, 'CONDITIONAL_ALT_POWER_BOOST: sourceCardNum不明'));
    const srcCAPB = ctx.cardMap.get(ctx.sourceCardNum);
    const txtCAPB = srcCAPB ? (srcCAPB.EffectText ?? '') + ' ' + (srcCAPB.BurstText ?? '') : '';
    const toHWCAPB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mPosCAPB = txtCAPB.match(/代わりに[＋+]([０-９\d]+)/);
    const mNegCAPB = !mPosCAPB && txtCAPB.match(/代わりに[－-]([０-９\d]+)/);
    const deltaCAPB = mPosCAPB ? parseInt(toHWCAPB(mPosCAPB[1]))
      : mNegCAPB ? -parseInt(toHWCAPB(mNegCAPB[1])) : 0;
    if (deltaCAPB === 0) return done(addLog(ctx, 'CONDITIONAL_ALT_POWER_BOOST: 値不明'));
    const modsCAPB = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: deltaCAPB }];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsCAPB } },
      `代替パワー修正: ${deltaCAPB > 0 ? '+' : ''}${deltaCAPB}`));
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
  // PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUS→collectProtectedZones動的計算 / AUTO→prevent_opp_trash_fromフラグ設置
  if (stub.id === 'PREVENT_ZONE_MOVE_BY_OPP') {
    const srcPZM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtPZM = srcPZM ? (srcPZM.EffectText ?? '') : '';
    const zones: ('hand' | 'energy')[] = [];
    if (txtPZM.includes('エナゾーン') && txtPZM.includes('トラッシュに移動しない')) zones.push('energy');
    if (txtPZM.includes('手札') && txtPZM.includes('トラッシュに移動しない')) zones.push('hand');
    if (zones.length === 0) return done(addLog(ctx, '[PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUSで動的処理中]'));
    const existing = ctx.ownerState.prevent_opp_trash_from ?? [];
    const merged = [...new Set([...existing, ...zones])] as ('hand' | 'energy')[];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_opp_trash_from: merged } },
      `相手効果によるトラッシュ移動禁止設置: ${zones.join(',')}`));
  }
  // PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止
  if (stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP_ALL' || stub.id === 'PREVENT_SELF_DOWN_BY_OPP'
      || stub.id === 'PREVENT_BOUNCE_AND_DOWN_BY_OPP') {
    const newOwnerPSD: PlayerState = { ...ctx.ownerState, prevent_signi_down_by_opp: true };
    return done(addLog({ ...ctx, ownerState: newOwnerPSD }, '相手は自シグニをダウンできない'));
  }
  // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手シグニアタック時パワー制限
  if (stub.id === 'OPP_SIGNI_ATTACK_POWER_RESTRICT') {
    const srcOSAPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOSAPR = srcOSAPR ? (srcOSAPR.EffectText ?? '') + ' ' + (srcOSAPR.BurstText ?? '') : '';
    const toHWOSAPR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const capM = txtOSAPR.match(/パワーが([０-９\d]+)以下のシグニは/);
    const cap = capM ? parseInt(toHWOSAPR(capM[1])) : 12000;
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, opp_signi_attack_power_cap: cap } },
      `相手シグニアタック時パワー上限: ${cap}`));
  }
  // SIGNI_FLIP_FACEDOWN: 自シグニ（または相手lastProcessed）を裏向きにする
  if (stub.id === 'SIGNI_FLIP_FACEDOWN') {
    const srcSFD = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!srcSFD) return done(addLog(ctx, '裏向き: ソースなし'));
    // 自フィールドにいれば ownerState、相手フィールドにいれば otherState に追加
    const inOwnerSFD = ctx.ownerState.field.signi.some(s => s?.includes(srcSFD));
    if (inOwnerSFD) {
      const newFaceSFD = [...new Set([...(ctx.ownerState.face_down_signi ?? []), srcSFD])];
      const newAbilSFD = [...new Set([...(ctx.ownerState.abilities_removed ?? []), srcSFD])];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, face_down_signi: newFaceSFD, abilities_removed: newAbilSFD } },
        `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}を裏向きに`));
    }
    const newFaceOppSFD = [...new Set([...(ctx.otherState.face_down_signi ?? []), srcSFD])];
    const newAbilOppSFD = [...new Set([...(ctx.otherState.abilities_removed ?? []), srcSFD])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceOppSFD, abilities_removed: newAbilOppSFD } },
      `${ctx.cardMap.get(srcSFD)?.CardName ?? srcSFD}を裏向きに`));
  }
  // FLIP_FACE_DOWN_SIGNI: 裏向きシグニを表向きに戻す（"この方法で裏向きにしたシグニを表向きにする"）
  if (stub.id === 'FLIP_FACE_DOWN_SIGNI') {
    const faceDownFBSFD = ctx.ownerState.face_down_signi ?? [];
    const oppFaceDownFBSFD = ctx.otherState.face_down_signi ?? [];
    if (faceDownFBSFD.length === 0 && oppFaceDownFBSFD.length === 0) {
      return done(addLog(ctx, '裏向きシグニなし（flip-back不要）'));
    }
    let newOwnerFBSFD = ctx.ownerState;
    let newOtherFBSFD = ctx.otherState;
    if (faceDownFBSFD.length > 0) {
      newOwnerFBSFD = {
        ...newOwnerFBSFD,
        face_down_signi: [],
        abilities_removed: (newOwnerFBSFD.abilities_removed ?? []).filter(cn => !faceDownFBSFD.includes(cn)),
      };
    }
    if (oppFaceDownFBSFD.length > 0) {
      newOtherFBSFD = {
        ...newOtherFBSFD,
        face_down_signi: [],
        abilities_removed: (newOtherFBSFD.abilities_removed ?? []).filter(cn => !oppFaceDownFBSFD.includes(cn)),
      };
    }
    return done(addLog({ ...ctx, ownerState: newOwnerFBSFD, otherState: newOtherFBSFD },
      `裏向きシグニ${faceDownFBSFD.length + oppFaceDownFBSFD.length}体を表向きに`));
  }
  // FACE_DOWN_OPP_SIGNI: 相手シグニを対象選択→裏向きにする
  if (stub.id === 'FACE_DOWN_OPP_SIGNI') {
    // lastProcessedCardsが既にある場合はそれを使用（他STUBから連鎖）
    const preselectedFDOS = ctx.lastProcessedCards?.[0];
    if (preselectedFDOS && ctx.otherState.field.signi.some(s => s?.at(-1) === preselectedFDOS)) {
      const newFaceFDOS = [...new Set([...(ctx.otherState.face_down_signi ?? []), preselectedFDOS])];
      const newAbilFDOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), preselectedFDOS])];
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, face_down_signi: newFaceFDOS, abilities_removed: newAbilFDOS } },
        `${ctx.cardMap.get(preselectedFDOS)?.CardName ?? preselectedFDOS}を裏向きに`));
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
      || stub.id === 'PREVENT_SIGNI_DOWN_BY_OPP' || stub.id === 'SUPPRESS_GAIN_ABILITY'
      || stub.id === 'PREVENT_INFECTED_SIGNI_ACTIVATE'
      || stub.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD'
      || stub.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
    return done(addLog(ctx, `[保護効果: ${stub.id}]`));
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
  // CONDITIONAL_CARD_COST_BY_OPP_LRIG: 対戦相手のルリグ属性によるコスト変更チェック
  if (stub.id === 'CONDITIONAL_CARD_COST_BY_OPP_LRIG') {
    const srcCCOL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCOL = srcCCOL ? (srcCCOL.EffectText ?? '') + ' ' + (srcCCOL.BurstText ?? '') : '';
    const condM = txtCCOL.match(/対戦相手のセンタールリグが([赤青緑黒白]+)の場合/);
    if (condM) {
      const condColor = condM[1];
      const oppLrigCn = ctx.otherState.field.lrig.at(-1);
      const oppColor = oppLrigCn ? (ctx.cardMap.get(oppLrigCn)?.Color ?? '') : '';
      const met = oppColor.includes(condColor);
      return done(addLog(ctx, `コスト変更条件（相手${condColor}）: ${met ? '条件達成' : '条件未達'}`));
    }
    return done(addLog(ctx, 'コスト変更条件（ルリグ属性解析不可）'));
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
  if (stub.id === 'GRANT_CHOSEN_ABILITY' || stub.id === 'GRANT_CHOSEN_ABILITY_SELF'
      || stub.id === 'SIGNI_GRANT_CHOSEN_ABILITY') {
    const srcGCA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtGCA = srcGCA ? (srcGCA.EffectText ?? '') + ' ' + (srcGCA.BurstText ?? '') : '';
    const toHWGCA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 自フィールドシグニが対象（lastProcessedCardsに対象シグニを設定）
    const targetFromLP = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (!targetFromLP) {
      // SELECT_TARGET: 自フィールドシグニを選択してから能力付与へ
      const fieldCandsGCA = [0,1,2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
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
    let kwSGQCA: string | null = null;
    if (txtSGQCA.includes('アサシン')) kwSGQCA = 'assassin';
    else if (txtSGQCA.includes('シャドウ')) kwSGQCA = 'shadow';
    else if (txtSGQCA.includes('ランサー')) kwSGQCA = 'lancer';
    else if (txtSGQCA.includes('ダブルクラッシュ')) kwSGQCA = 'double_crush';
    else if (txtSGQCA.includes('ガード')) kwSGQCA = 'guard';
    // 対象シグニ数
    const countMSGQCA = txtSGQCA.match(/シグニを([０-９\d]+)体まで/);
    const maxCntSGQCA = countMSGQCA ? parseInt(toHWSGQCA(countMSGQCA[1])) : 1;
    // 対象選択済みならキーワードを付与
    if (ctx.lastProcessedCards?.length) {
      if (!kwSGQCA) return done(addLog(ctx, '[SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: キーワード解析不可]'));
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
  // COPY_ABILITY: このシグニはその（lastProcessed[0]の）能力を得る
  if (stub.id === 'COPY_ABILITY') {
    const targetCA = ctx.sourceCardNum;
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
  if (stub.id === 'GRANT_ABILITY_UNTIL_OPP_TURN') {
    const srcGAUOT = ctx.sourceCardNum;
    if (!srcGAUOT) return done(addLog(ctx, 'GRANT_ABILITY_UNTIL_OPP_TURN: ソースなし'));
    const srcCardGAUOT = ctx.cardMap.get(srcGAUOT);
    const txtGAUOT = srcCardGAUOT ? (srcCardGAUOT.EffectText ?? '') + ' ' + (srcCardGAUOT.BurstText ?? '') : '';
    let kwGAUOT: string | null = null;
    if (txtGAUOT.includes('Sランサー')) kwGAUOT = 'Sランサー';
    else if (txtGAUOT.includes('ランサー')) kwGAUOT = 'lancer';
    else if (txtGAUOT.includes('アサシン')) kwGAUOT = 'assassin';
    else if (txtGAUOT.includes('ダブルクラッシュ')) kwGAUOT = 'double_crush';
    else if (txtGAUOT.includes('シャドウ')) kwGAUOT = 'shadow';
    else if (txtGAUOT.includes('バニッシュ不可')) kwGAUOT = 'バニッシュ不可';
    else if (txtGAUOT.includes('ダウン不可')) kwGAUOT = 'ダウン不可';
    if (!kwGAUOT) return done(addLog(ctx, `GRANT_ABILITY_UNTIL_OPP_TURN: キーワード解析不可`));
    const grantsGAUOT = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsGAUOT[srcGAUOT] = [...new Set([...(grantsGAUOT[srcGAUOT] ?? []), kwGAUOT])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsGAUOT } },
      `${ctx.cardMap.get(srcGAUOT)?.CardName ?? srcGAUOT}に${kwGAUOT}（次の相手ターン終了まで）`));
  }
  // RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: ライズ対象シグニに引用常在能力を付与
  if (stub.id === 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY') {
    const targetRTSGA = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!targetRTSGA) return done(addLog(ctx, 'RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: 対象なし'));
    const riseCardRTSGA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTSGA = riseCardRTSGA ? (riseCardRTSGA.EffectText ?? '') : '';
    let kwRTSGA: string | null = null;
    if (txtRTSGA.includes('アサシン')) kwRTSGA = 'assassin';
    else if (txtRTSGA.includes('Sランサー')) kwRTSGA = 'Sランサー';
    else if (txtRTSGA.includes('ランサー')) kwRTSGA = 'lancer';
    else if (txtRTSGA.includes('ダブルクラッシュ')) kwRTSGA = 'double_crush';
    else if (txtRTSGA.includes('シャドウ')) kwRTSGA = 'shadow';
    else if (txtRTSGA.includes('バニッシュ不可')) kwRTSGA = 'バニッシュ不可';
    if (!kwRTSGA) return done(addLog(ctx, `RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: キーワード解析不可`));
    const grantsRTSGA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsRTSGA[targetRTSGA] = [...new Set([...(grantsRTSGA[targetRTSGA] ?? []), kwRTSGA])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsRTSGA } },
      `${ctx.cardMap.get(targetRTSGA)?.CardName ?? targetRTSGA}が${kwRTSGA}を得る`));
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
  // LAYER_ABILITY_COPY: ＜怪異＞シグニのレイヤー能力を自シグニにコピー
  if (stub.id === 'LAYER_ABILITY_COPY') {
    const srcLAC = ctx.sourceCardNum;
    const srcCardLAC = srcLAC ? ctx.cardMap.get(srcLAC) : undefined;
    const txtLAC = srcCardLAC ? (srcCardLAC.EffectText ?? '') : '';
    const fromTrash = txtLAC.includes('トラッシュから');
    const kaiClass = '怪異';
    let candsLAC: string[];
    let scopeLAC: TargetScope;
    if (fromTrash) {
      candsLAC = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(kaiClass);
      });
      scopeLAC = 'self_trash';
    } else {
      candsLAC = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn && cn !== srcLAC && (ctx.cardMap.get(cn)?.CardClass ?? '').includes(kaiClass));
      scopeLAC = 'self_field';
    }
    if (candsLAC.length === 0) return done(addLog(ctx, `＜${kaiClass}＞シグニなし（${fromTrash ? 'トラッシュ' : 'フィールド'}）`));
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
    const copiedKwsILCA = knownKwsILCA.filter(kw => layerTxtILCA.includes(kw));
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
      const newOwnerRO = { ...ctx.ownerState, lrig_riding_signi: [selectedRO] };
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
