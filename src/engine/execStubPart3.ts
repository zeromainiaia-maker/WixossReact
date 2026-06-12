import type { PlayerState, TargetScope, Owner } from '../types';
import { parseCardEffects } from '../data/effectParser';
import type {
  EffectAction,
  StubAction,
  DrawAction,
  BanishAction,
  BounceAction,
  TrashAction,
  AddToFieldAction,
  SequenceAction,
  AddToHandAction,
  TransferToDeckAction,
  TransferToHandAction,
  PowerModifyAction,
  AttachAcceAction,
} from '../types/effects';
import type { ExecCtx, ExecResult } from './execUtils';
import {
  done, addLog, needsInteraction, ownerState, setOwnerState,
  removeFromField, fieldCandidates, selectOrInteract, canPayOptionalCost, banishDestination,
  getCardNum,
} from './execUtils';
import { LRIG_ALL_NAMES_SENTINEL } from './effectEngine';
import { parseChoiceOptionsFromText } from './choiceTextParser';

export function execStubPart3(
  stub: StubAction,
  ctx: ExecCtx,
  exec: (action: EffectAction, ctx: ExecCtx) => ExecResult,
): ExecResult | null {
  if (stub.id === 'INTERNAL_RIDE_ON_APPLY') {
    const rideCandIROA = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (rideCandIROA.length === 0) return done(addLog(ctx, '乗機シグニなし（INTERNAL_RIDE_ON_APPLY）'));
    const contIROA: StubAction = { type: 'STUB', id: 'RIDE_ON' };
    const noopIROA: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(rideCandIROA, 1, false, 'self_field', noopIROA as EffectAction, contIROA as EffectAction, ctx);
  }
  // ライズ/スタック系（engine: ライズシステム未実装）
  if (stub.id === 'RISE_BANISH_SUBSTITUTE' || stub.id === 'RISE_LEAVE_DISCARD_STACK'
      || stub.id === 'BANISH_SUBSTITUTE_RISE_STACK' || stub.id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE'
      || stub.id === 'COOKING_BANISH_SUBSTITUTE' || stub.id === 'BLACK_RISE_PLAY_STACK_FROM_TRASH') {
    return done(addLog(ctx, `[ライズ/スタック: ${stub.id}]`));
  }
  // ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白: CONTINUOUS効果（effectEngine.collectEnergyColorSubsで動的計算）
  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白') {
    return done(addLog(ctx, '[ENERGY_COLOR_SUBSTITUTE: effectEngineで動的処理中]'));
  }
  // エナ代替系（effectEngine.collectEnergyTrashSubstituteInfoで動的計算）
  if (stub.id === 'ENERGY_COLOR_SUBSTITUTE_TRASH' || stub.id === 'ENERGY_SUBSTITUTE_TRASH_SIGNI'
      || stub.id === 'ENERGY_SUBSTITUTE_TRASH_KEY' || stub.id === 'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI') {
    return done(addLog(ctx, `[エナ代替: ${stub.id}（UIで処理済み）]`));
  }
  // CLASS_CHANGE: シグニのクラスを一時変更
  if (stub.id === 'CLASS_CHANGE') {
    const srcCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCC = srcCC ? (srcCC.EffectText ?? '') + ' ' + (srcCC.BurstText ?? '') : '';
    // 変更先クラスを抽出: declared_class → lastProcessedCards → テキスト解析の優先順
    const declaredClassCC = ctx.ownerState.declared_class
      ?? (ctx.lastProcessedCards ?? []).find(s => !s.match(/^WX|^WD|^WXD|^WXK|^SPDi/));
    const newClassMCC = txtCC.match(/＜([^＞]+)＞を得る/);
    const newClass = declaredClassCC ?? (newClassMCC ? newClassMCC[1] : null);
    if (!newClass) return done(addLog(ctx, 'クラス変更先不明'));
    // 「すべての...シグニ」→ 対象選択なし（全員適用）
    if (txtCC.match(/すべて.*シグニ.*クラスを失い|すべての.*シグニは.*クラスを失い/)) {
      const colorPatCC = txtCC.match(/(赤|青|緑|白|黒).*(?:と|か|または).*(赤|青|緑|白|黒)/);
      const colorSingleCC = !colorPatCC && txtCC.match(/(赤|青|緑|白|黒).*シグニ.*クラスを失い/);
      const reqColors: string[] = [];
      if (colorPatCC) { colorPatCC.slice(1).forEach(c => { if (c) reqColors.push(c); }); }
      else if (colorSingleCC) reqColors.push(colorSingleCC[1]);
      const targets = [0, 1, 2]
        .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => {
          if (!cn) return false;
          if (reqColors.length === 0) return true;
          const c = ctx.cardMap.get(cn);
          return reqColors.some(col => (c?.Color ?? '').includes(col));
        });
      if (targets.length === 0) return done(addLog(ctx, 'クラス変更対象なし'));
      const overridesCC = { ...(ctx.ownerState.card_class_overrides ?? {}) };
      for (const cn of targets) overridesCC[cn] = newClass;
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesCC } },
        `${targets.length}体のシグニのクラスを＜${newClass}＞に変更`));
    }
    // lastProcessedCards に対象シグニがある場合（SEQUENCE内のターゲット選択後）
    const targetFromContext = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn) ||
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn)
    );
    if (targetFromContext) {
      const inOwnCC2 = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetFromContext);
      if (inOwnCC2) {
        const ovCC2 = { ...(ctx.ownerState.card_class_overrides ?? {}), [targetFromContext]: newClass };
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: ovCC2 } },
          `${ctx.cardMap.get(targetFromContext)?.CardName ?? targetFromContext}のクラスを＜${newClass}＞に変更`));
      }
      const ovCC2Op = { ...(ctx.otherState.card_class_overrides ?? {}), [targetFromContext]: newClass };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, card_class_overrides: ovCC2Op } },
        `${ctx.cardMap.get(targetFromContext)?.CardName ?? targetFromContext}のクラスを＜${newClass}＞に変更`));
    }
    // 対象選択（1体）
    const allSigniCC = [
      ...[0, 1, 2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
      ...[0, 1, 2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c),
    ];
    if (allSigniCC.length === 0) return done(addLog(ctx, 'クラス変更対象なし'));
    const changeClassStub: StubAction = { type: 'STUB', id: 'INTERNAL_APPLY_CLASS_CHANGE', value: newClass };
    return needsInteraction(addLog(ctx, `クラスを＜${newClass}＞に変更する対象を選択`), {
      type: 'SELECT_TARGET', candidates: allSigniCC, count: 1, optional: false,
      targetScope: 'self_field', thenAction: changeClassStub as EffectAction,
    });
  }
  // INTERNAL_APPLY_CLASS_CHANGE: 選択シグニのクラスを変更
  if (stub.id === 'INTERNAL_APPLY_CLASS_CHANGE') {
    const targetCnIACC = ctx.lastProcessedCards?.[0];
    const newClassIACC = typeof stub.value === 'string' ? stub.value : '';
    if (!targetCnIACC || !newClassIACC) return done(addLog(ctx, 'クラス変更適用失敗'));
    // 自分・相手どちらのフィールドかを判断
    const inOwnIACC = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetCnIACC);
    if (inOwnIACC) {
      const overridesIACC = { ...(ctx.ownerState.card_class_overrides ?? {}), [targetCnIACC]: newClassIACC };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, card_class_overrides: overridesIACC } },
        `${ctx.cardMap.get(targetCnIACC)?.CardName ?? targetCnIACC}のクラスを＜${newClassIACC}＞に変更`));
    }
    const overridesIACCOp = { ...(ctx.otherState.card_class_overrides ?? {}), [targetCnIACC]: newClassIACC };
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, card_class_overrides: overridesIACCOp } },
      `${ctx.cardMap.get(targetCnIACC)?.CardName ?? targetCnIACC}のクラスを＜${newClassIACC}＞に変更`));
  }
  // LOSE_COLOR_ALL_ZONES: CONTINUOUS効果（effectEngine.collectColorlessOverridesで動的計算）
  if (stub.id === 'LOSE_COLOR_ALL_ZONES') {
    return done(addLog(ctx, '[LOSE_COLOR_ALL_ZONES: effectEngineで動的処理中]'));
  }
  // CHANGE_SIGNI_COLOR: 対象シグニの色を指定色に変更（ターン終了時まで）
  if (stub.id === 'CHANGE_SIGNI_COLOR') {
    // value がある場合：SELECT_TARGET の後処理（対象 = lastProcessedCards[0]）
    if (typeof stub.value === 'string' && ctx.lastProcessedCards?.length) {
      const targetCSC2 = ctx.lastProcessedCards[0];
      const newColorCSC2 = stub.value as string;
      const overridesCSC2 = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetCSC2]: newColorCSC2 };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: overridesCSC2 } },
        `${ctx.cardMap.get(targetCSC2)?.CardName ?? targetCSC2}の色を${newColorCSC2}に変更`));
    }
    const srcCSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSC = srcCSC ? (srcCSC.EffectText ?? '') + ' ' + (srcCSC.BurstText ?? '') : '';
    // 変更先の色を抽出（「それを白にする」「赤にする」等）
    const colorMCSC = txtCSC.match(/それを([赤青緑黒白]+)にする/);
    const newColorCSC = colorMCSC ? colorMCSC[1] : null;
    if (!newColorCSC) return done(addLog(ctx, 'CHANGE_SIGNI_COLOR: 変更先色不明'));
    // レベルフィルタ（「レベルN以下のシグニ」）
    const toHWCSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const lvMaxMCSC = txtCSC.match(/レベル([０-９\d]+)以下のシグニ/);
    const lvMaxCSC = lvMaxMCSC ? parseInt(toHWCSC(lvMaxMCSC[1])) : 99;
    // 相手シグニ1体を選択（lastProcessedCardsが既にあれば直接適用）
    const oppSigniCSC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => {
      if (!c) return false;
      const lv = parseInt(ctx.cardMap.get(c)?.Level ?? '99');
      return lv <= lvMaxCSC;
    });
    if (oppSigniCSC.length === 0) return done(addLog(ctx, '相手シグニなし（CHANGE_SIGNI_COLOR）'));
    const targetCSC = ctx.lastProcessedCards?.[0];
    if (targetCSC && oppSigniCSC.includes(targetCSC)) {
      const overridesCSC = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetCSC]: newColorCSC };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: overridesCSC } },
        `${ctx.cardMap.get(targetCSC)?.CardName ?? targetCSC}の色を${newColorCSC}に変更`));
    }
    // 対象選択
    const applyCSC: StubAction = { type: 'STUB', id: 'CHANGE_SIGNI_COLOR', value: newColorCSC };
    return selectOrInteract(oppSigniCSC, 1, false, 'opp_field', applyCSC as EffectAction, undefined, ctx);
  }
  // カード属性変更系（engine: 属性変更システム未実装）
  // SIGNI_LOSE_COLOR: 対戦相手のシグニ1体が色を失う（ターン終了時まで）
  if (stub.id === 'SIGNI_LOSE_COLOR') {
    const targetSLC = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetSLC) {
      const oppOverridesSLC = { ...(ctx.otherState.signi_color_overrides ?? {}), [targetSLC]: '無' };
      return done(addLog({ ...ctx, otherState: { ...ctx.otherState, signi_color_overrides: oppOverridesSLC } },
        `${ctx.cardMap.get(targetSLC)?.CardName ?? targetSLC}が色を失う`));
    }
    const oppCandsSLC = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    if (oppCandsSLC.length === 0) return done(addLog(ctx, '相手シグニなし（SIGNI_LOSE_COLOR）'));
    const applySLC: StubAction = { type: 'STUB', id: 'SIGNI_LOSE_COLOR' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsSLC, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: applySLC as EffectAction,
    });
  }
  // COPY_SIGNI: 自フィールドシグニ1体をトラッシュのシグニと同じカードにする（ターン終了時まで）
  if (stub.id === 'COPY_SIGNI') {
    const fieldSigniCS = [0,1,2]
      .map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn);
    const trashSigniCS = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    // Phase 1: lastProcessedCards にフィールドシグニがなければ選択
    const fieldTargetCS = (ctx.lastProcessedCards ?? []).find(cn => fieldSigniCS.includes(cn));
    if (!fieldTargetCS) {
      if (fieldSigniCS.length === 0) return done(addLog(ctx, 'コピー対象なし（自シグニなし）'));
      const noopCS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contCS: StubAction = { type: 'STUB', id: 'COPY_SIGNI' };
      return needsInteraction(addLog(ctx, 'コピーするシグニを選択（フィールドから）'), {
        type: 'SELECT_TARGET', candidates: fieldSigniCS, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noopCS as EffectAction, continuation: contCS as EffectAction,
      });
    }
    // Phase 2: トラッシュシグニを選択（コピー元）
    if (trashSigniCS.length === 0) return done(addLog(ctx, 'コピー元なし（トラッシュにシグニなし）'));
    const noopCS2: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contCS2: StubAction = { type: 'STUB', id: 'INTERNAL_COPY_SIGNI_APPLY', value: fieldTargetCS };
    return needsInteraction(addLog(ctx, 'コピー元シグニを選択（トラッシュから）'), {
      type: 'SELECT_TARGET', candidates: trashSigniCS, count: 1, optional: false,
      targetScope: 'self_trash', thenAction: noopCS2 as EffectAction, continuation: contCS2 as EffectAction,
    });
  }
  // INTERNAL_COPY_SIGNI_APPLY: card_identity_overrides を設定してコピーを適用
  if (stub.id === 'INTERNAL_COPY_SIGNI_APPLY') {
    const fieldNumICSA = typeof stub.value === 'string' ? stub.value : '';
    const trashNumICSA = (ctx.lastProcessedCards ?? [])[0];
    if (!fieldNumICSA || !trashNumICSA) return done(addLog(ctx, 'コピー適用失敗'));
    const overridesICSA = { ...(ctx.ownerState.card_identity_overrides ?? {}), [fieldNumICSA]: trashNumICSA };
    const newOwnerICSA = { ...ctx.ownerState, card_identity_overrides: overridesICSA };
    const fieldName = ctx.cardMap.get(fieldNumICSA)?.CardName ?? fieldNumICSA;
    const trashName = ctx.cardMap.get(trashNumICSA)?.CardName ?? trashNumICSA;
    return done(addLog({ ...ctx, ownerState: newOwnerICSA },
      `${fieldName}が${trashName}と同じカードになる（ターン終了時まで）`));
  }
  // ALL_CLASS: CONTINUOUS→effectEngine.collectAllClassSigniで動的処理済み
  if (stub.id === 'ALL_CLASS') return done(addLog(ctx, '[ALL_CLASS: effectEngineで処理]'));
  // ALL_COLOR: CONTINUOUS→effectEngine.collectAllColorSigniで動的処理済み
  if (stub.id === 'ALL_COLOR') return done(addLog(ctx, '[ALL_COLOR: effectEngineで処理]'));
  // ALL_ZONE_BLACK: CONTINUOUS→effectEngine.collectAllZoneBlackCardNumsで動的処理済み
  if (stub.id === 'ALL_ZONE_BLACK') return done(addLog(ctx, '[ALL_ZONE_BLACK: effectEngineで処理]'));
  // ALL_CARDS_COLOR_CHANGE_BLACK: CONTINUOUS→effectEngine.hasAllCardsColorBlackで動的処理済み
  if (stub.id === 'ALL_CARDS_COLOR_CHANGE_BLACK') return done(addLog(ctx, '[ALL_CARDS_COLOR_CHANGE_BLACK: effectEngineで処理]'));
  // ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: ゲーム全体ルリグタイプ付与（ログのみ）
  if (stub.id === 'ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE') return done(addLog(ctx, '[ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: ゲーム全体効果ログ]'));
  // CHANGE_BASE_LEVEL: このシグニの基本レベルを1～3にしてもよい（ターン終了まで）
  if (stub.id === 'CHANGE_BASE_LEVEL') {
    const srcCBL = ctx.sourceCardNum;
    if (!srcCBL) return done(addLog(ctx, 'CHANGE_BASE_LEVEL: ソースなし'));
    if (typeof stub.value === 'number') {
      const newOvCBL = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [srcCBL]: stub.value as number };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCBL } },
        `${ctx.cardMap.get(srcCBL)?.CardName ?? srcCBL}の基本レベルを${stub.value}に変更`));
    }
    const optsCBL = [1,2,3].map(lv => ({
      id: `lv_${lv}`, label: `レベル${lv}にする`,
      action: ({ type: 'STUB', id: 'CHANGE_BASE_LEVEL', value: lv } as StubAction) as EffectAction,
      available: true,
    }));
    optsCBL.push({ id: 'skip', label: 'スキップ',
      action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction, available: true });
    return needsInteraction(addLog(ctx, '基本レベルを変更してもよい（1～3）'), {
      type: 'CHOOSE', options: optsCBL, count: 1,
    });
  }
  // CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN: シグニ1体の基本レベルを1にしてもよい（次の自ターン終了まで）
  if (stub.id === 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN') {
    if (ctx.lastProcessedCards?.length) {
      const targetCBLUNT = ctx.lastProcessedCards[0];
      const newOvCBLUNT = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [targetCBLUNT]: 1 };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCBLUNT } },
        `${ctx.cardMap.get(targetCBLUNT)?.CardName ?? targetCBLUNT}の基本レベルを1に変更`));
    }
    const allSigniCBLUNT = [...ctx.ownerState.field.signi, ...ctx.otherState.field.signi]
      .flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (allSigniCBLUNT.length === 0) return done(addLog(ctx, '対象シグニなし（CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN）'));
    const contCBLUNT: StubAction = { type: 'STUB', id: 'CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN' };
    return needsInteraction(addLog(ctx, 'シグニを選択（基本レベルを1にしてもよい）'), {
      type: 'SELECT_TARGET', candidates: allSigniCBLUNT, count: 1, optional: true,
      targetScope: 'self_field', thenAction: contCBLUNT as EffectAction,
    });
  }
  // COPY_CARD: このシグニはlastProcessed[0]のカードとレベル以外同じになる（card_identity_overrides）
  if (stub.id === 'COPY_CARD') {
    const srcCC = ctx.sourceCardNum;
    const targetCC = ctx.lastProcessedCards?.[0];
    if (!srcCC || !targetCC) return done(addLog(ctx, 'COPY_CARD: ソースまたはコピー元なし'));
    const overridesCC2 = { ...(ctx.ownerState.card_identity_overrides ?? {}), [srcCC]: targetCC };
    const newOwnerCC2: PlayerState = { ...ctx.ownerState, card_identity_overrides: overridesCC2 };
    return done(addLog({ ...ctx, ownerState: newOwnerCC2 },
      `${ctx.cardMap.get(srcCC)?.CardName ?? srcCC}が${ctx.cardMap.get(targetCC)?.CardName ?? targetCC}のコピーになる`));
  }
  // DECK_SIGNI_LEVEL_OVERRIDE: デッキ内指定クラスのシグニレベルをN扱い（このターン）
  if (stub.id === 'DECK_SIGNI_LEVEL_OVERRIDE') {
    const srcDSLO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDSLO = srcDSLO ? (srcDSLO.EffectText ?? '') : '';
    const toHWDSLO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchDSLO = txtDSLO.match(/＜([^＞]+)＞のシグニのレベルを参照する場合/);
    const targetClassDSLO = classMatchDSLO?.[1] ?? '宇宙';
    const levelMatchDSLO = txtDSLO.match(/レベル([１-４\d]+)として扱って/);
    const levelDSLO = levelMatchDSLO ? parseInt(toHWDSLO(levelMatchDSLO[1])) : 4;
    const newOwnerDSLO: PlayerState = { ...ctx.ownerState, deck_signi_level_override: { class: targetClassDSLO, level: levelDSLO } };
    return done(addLog({ ...ctx, ownerState: newOwnerDSLO }, `デッキ内＜${targetClassDSLO}＞シグニのレベルをLv${levelDSLO}として扱う`));
  }
  // LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: このカード自身のレベル参照をLv4として扱う（デッキ/手札/トラッシュ在中）
  if (stub.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT') {
    return done(addLog(ctx, '[LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: effectEngineで処理]'));
  }
  if (stub.id === 'DYNAMIC_LEVEL_BY_ENERGY'
      || stub.id === 'LEVEL_REFERENCE_OVERRIDE'
      || stub.id === 'CENTER_LRIG_COLOR_CHANGE_BLACK'
      || stub.id === 'INHERIT_OPP_LRIG_TYPE' || stub.id === 'INHERIT_UNDER_SIGNI_COLOR') {
    return done(addLog(ctx, `[属性変更: ${stub.id}]`));
  }
  // SIGNI_GAIN_ONE_LRIG_COLOR: このシグニがルリグの色を1つ得る（ターン終了時まで）
  if (stub.id === 'SIGNI_GAIN_ONE_LRIG_COLOR') {
    const srcSGOLC = ctx.sourceCardNum;
    if (!srcSGOLC) return done(addLog(ctx, 'SIGNI_GAIN_ONE_LRIG_COLOR: ソースなし'));
    const lrigCnSGOLC = ctx.ownerState.field.lrig.at(-1);
    const lrigColorSGOLC = lrigCnSGOLC ? (ctx.cardMap.get(lrigCnSGOLC)?.Color ?? '').split('')[0] : null;
    if (!lrigColorSGOLC) return done(addLog(ctx, 'SIGNI_GAIN_ONE_LRIG_COLOR: ルリグ色不明'));
    const origCardSGOLC = ctx.cardMap.get(srcSGOLC);
    const origColorSGOLC = origCardSGOLC?.Color ?? '無';
    const newColorSGOLC = origColorSGOLC.includes(lrigColorSGOLC) ? origColorSGOLC : origColorSGOLC + lrigColorSGOLC;
    const overridesSGOLC = { ...(ctx.ownerState.signi_color_overrides ?? {}), [srcSGOLC]: newColorSGOLC };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, signi_color_overrides: overridesSGOLC } },
      `${origCardSGOLC?.CardName ?? srcSGOLC}が${lrigColorSGOLC}を得る`));
  }
  // STACK_ALL_LRIG_UNDER: ルリグトラッシュ全ルリグをこのカードの下に置く
  if (stub.id === 'STACK_ALL_LRIG_UNDER') {
    const lrigTrashSALU = ctx.ownerState.lrig_trash ?? [];
    if (lrigTrashSALU.length === 0) return done(addLog(ctx, 'ルリグトラッシュなし（STACK_ALL_LRIG_UNDER）'));
    const newLrigStack = [...lrigTrashSALU, ...ctx.ownerState.field.lrig];
    const newOwnerSALU: PlayerState = {
      ...ctx.ownerState,
      lrig_trash: [],
      field: { ...ctx.ownerState.field, lrig: newLrigStack },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSALU },
      `ルリグトラッシュ${lrigTrashSALU.length}枚をルリグスタック下に配置`));
  }
  // LRIG_RIDE_SIGNI: センタールリグがすべての乗機シグニに乗る（ドライブ状態）
  if (stub.id === 'LRIG_RIDE_SIGNI') {
    const ridingAllLRS = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (ridingAllLRS.length === 0) return done(addLog(ctx, '乗機シグニなし（LRIG_RIDE_SIGNI）'));
    const newOwnerLRS = { ...ctx.ownerState, lrig_riding_signi: ridingAllLRS };
    return done(addLog({ ...ctx, ownerState: newOwnerLRS },
      `ルリグが${ridingAllLRS.length}体の乗機シグニに乗る（ドライブ状態）`));
  }
  // CENTER_LRIG_RIDES_ON_SIGNI: センタールリグが選択した1体の乗機シグニに乗る（乗り換え可）
  if (stub.id === 'CENTER_LRIG_RIDES_ON_SIGNI') {
    const selectedCLR = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
    if (selectedCLR) {
      const newOwnerCLR = { ...ctx.ownerState, lrig_riding_signi: [selectedCLR] };
      return done(addLog({ ...ctx, ownerState: newOwnerCLR },
        `ルリグが${ctx.cardMap.get(selectedCLR)?.CardName ?? selectedCLR}に乗る（ドライブ状態）`));
    }
    const rideCandCLR = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) return [];
      return ctx.cardMap.get(top)?.CardClass?.includes('乗機') ? [top] : [];
    });
    if (rideCandCLR.length === 0) return done(addLog(ctx, '乗機シグニなし（CENTER_LRIG_RIDES_ON_SIGNI）'));
    const contCLR: StubAction = { type: 'STUB', id: 'CENTER_LRIG_RIDES_ON_SIGNI' };
    const noopCLR: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return selectOrInteract(rideCandCLR, 1, false, 'self_field', noopCLR as EffectAction, contCLR as EffectAction, ctx);
  }
  // CENTER_LRIG_DISMOUNT: センタールリグがすべての乗機シグニから降りる（ドライブ解除・任意）
  if (stub.id === 'CENTER_LRIG_DISMOUNT') {
    if (!ctx.ownerState.lrig_riding_signi?.length) {
      return done(addLog(ctx, 'ドライブ状態ではない（CENTER_LRIG_DISMOUNT スキップ）'));
    }
    const dismountOpt: StubAction = { type: 'STUB', id: 'INTERNAL_DISMOUNT_DO' };
    const skipOpt: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, 'センタールリグが乗機シグニから降りますか？'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'dismount', label: '降りる（ドライブ解除）', action: dismountOpt as EffectAction, available: true },
        { id: 'stay',     label: 'そのまま',              action: skipOpt as EffectAction,     available: true },
      ],
    });
  }
  if (stub.id === 'INTERNAL_DISMOUNT_DO') {
    const newOwnerDM = { ...ctx.ownerState, lrig_riding_signi: [] };
    return done(addLog({ ...ctx, ownerState: newOwnerDM }, 'センタールリグが降りた（ドライブ解除）'));
  }
  // ルリグシステム（未実装残）
  if (stub.id === 'LRIG_GAIN_ABILITY' || stub.id === 'LRIG_ALL_NAMES'
      || stub.id === 'GAIN_ADDITIONAL_LRIG_TYPE' || stub.id === 'GAIN_LRIG_COLOR') {
    return done(addLog(ctx, `[ルリグシステム: ${stub.id}]`));
  }
  // ドロー枚数制限（次のターン）
  if (stub.id === 'LIMIT_OPP_DRAW_COUNT') {
    const srcLODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLODC = srcLODC ? (srcLODC.EffectText ?? '') + ' ' + (srcLODC.BurstText ?? '') : '';
    const toHWLODC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const limitM = txtLODC.match(/合計([０-９\d]+)枚までしか引けない/);
    const limitVal = limitM ? parseInt(toHWLODC(limitM[1])) : 1;
    const newOtherLODC: PlayerState = { ...ctx.otherState, draw_limit: limitVal };
    return done(addLog({ ...ctx, otherState: newOtherLODC }, `対戦相手の次ターンのドロー上限${limitVal}枚に制限`));
  }
  // 手札上限増加（CONTINUOUS：シグニがフィールドにある間）
  // HAND_SIZE_INCREASE: 手札上限を増やす / REDUCE_OPP_HAND_LIMIT: 相手の手札上限を減らす
  if (stub.id === 'HAND_SIZE_INCREASE' || stub.id === 'REDUCE_OPP_HAND_LIMIT') {
    const srcHSI = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHSI = srcHSI ? (srcHSI.EffectText ?? '') + ' ' + (srcHSI.BurstText ?? '') : '';
    const toHWHSI = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「手札をN枚まで」パターン（直接指定）
    const limitM = txtHSI.match(/手札を([０-９\d]+)枚まで/);
    // 「手札の枚数の上限はN増える（6枚からM枚になる）」パターン
    const increaseM = txtHSI.match(/手札の枚数の上限は([０-９\d]+)増える/);
    // 「6枚からN枚になる」パターン（括弧内の上限値）
    const becomeM = txtHSI.match(/[（(].*から([０-９\d]+)枚になる[）)]/);
    const DEFAULT_HAND = 6;
    let newLimit: number | null = null;
    if (limitM) newLimit = parseInt(toHWHSI(limitM[1]));
    else if (becomeM) newLimit = parseInt(toHWHSI(becomeM[1]));
    else if (increaseM) newLimit = DEFAULT_HAND + parseInt(toHWHSI(increaseM[1]));
    if (stub.id === 'HAND_SIZE_INCREASE' && newLimit !== null) {
      const newOwnerHSI = { ...ctx.ownerState, hand_limit: newLimit };
      return done(addLog({ ...ctx, ownerState: newOwnerHSI }, `手札上限を${newLimit}枚に設定`));
    }
    if (stub.id === 'REDUCE_OPP_HAND_LIMIT' && newLimit !== null) {
      const newOtherHSI = { ...ctx.otherState, hand_limit: newLimit };
      return done(addLog({ ...ctx, otherState: newOtherHSI }, `相手手札上限を${newLimit}枚に設定`));
    }
    return done(addLog(ctx, `[手札制限: ${stub.id}]`));
  }
  // ライフバースト特殊（engine: 発動システム改修必要）
  // LIFE_BURST_DOUBLE: このターン、次のライフバーストは2回発動する
  if (stub.id === 'LIFE_BURST_DOUBLE') {
    const newOwnerLBD: PlayerState = { ...ctx.ownerState, life_burst_double_next: true };
    return done(addLog({ ...ctx, ownerState: newOwnerLBD }, 'このターン次のライフバーストは2回発動する'));
  }
  // TRIGGER_LIFE_BURST: lastProcessedCards[0] のLBを発動（field.checkにセット）
  if (stub.id === 'TRIGGER_LIFE_BURST') {
    const cardTLB = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
    if (!cardTLB) return done(addLog(ctx, 'TRIGGER_LIFE_BURST: カードなし'));
    const dataTLB = ctx.cardMap.get(cardTLB);
    if (!dataTLB?.BurstText) return done(addLog(ctx, `${dataTLB?.CardName ?? cardTLB}: LBなし`));
    const newOwnerTLB: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, check: cardTLB } };
    return done(addLog({ ...ctx, ownerState: newOwnerTLB },
      `ライフバースト発動: ${dataTLB.CardName}`));
  }
  // BATTLE_BANISH_LIFE_BURST: バトルバニッシュ後に相手側LBを発動
  if (stub.id === 'BATTLE_BANISH_LIFE_BURST') {
    const cardBBLB = ctx.lastProcessedCards?.[0];
    if (!cardBBLB) return done(addLog(ctx, 'BATTLE_BANISH_LIFE_BURST: カードなし'));
    const dataBBLB = ctx.cardMap.get(cardBBLB);
    if (!dataBBLB?.BurstText) return done(addLog(ctx, `${dataBBLB?.CardName ?? cardBBLB}: LBなし`));
    const newOtherBBLB: PlayerState = { ...ctx.otherState, field: { ...ctx.otherState.field, check: cardBBLB } };
    return done(addLog({ ...ctx, otherState: newOtherBBLB },
      `バトルバニッシュLB: ${dataBBLB.CardName}`));
  }
  // BEAT_ZONE_OP: ビートゾーン操作（「【ビート】にする」または「【ビート】がN枚以下」条件チェック）
  if (stub.id === 'BEAT_ZONE_OP') {
    const srcBZO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtBZO = srcBZO ? (srcBZO.EffectText ?? '') + ' ' + (srcBZO.BurstText ?? '') : '';
    const toHWBZO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 条件チェックパターン: 「【ビート】がN枚以下の場合」
    const condMBZO = txtBZO.match(/【ビート】が([０-９\d]+)枚以下/);
    if (condMBZO) {
      const threshBZO = parseInt(toHWBZO(condMBZO[1]));
      const beatCountBZO = (ctx.ownerState.field.beat_zone ?? []).length;
      if (beatCountBZO > threshBZO) {
        return done(addLog(ctx, `ビート条件不成立（現在${beatCountBZO}枚 > ${threshBZO}）→スキップ`));
      }
      return done(addLog(ctx, `ビート条件成立（現在${beatCountBZO}枚 ≤ ${threshBZO}）`));
    }
    // 「【ビート】にする」: フィールドシグニを選択してビートゾーンへ
    const fieldCandsBZO = ctx.ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    if (fieldCandsBZO.length === 0) return done(addLog(ctx, 'ビートにするシグニなし'));
    return needsInteraction(addLog(ctx, 'ビートにするシグニを選択'), {
      type: 'SELECT_TARGET', candidates: fieldCandsBZO, count: 1, optional: false,
      targetScope: 'self_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_BEAT' } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_MOVE_TO_BEAT: 選択シグニをビートゾーンへ移動
  if (stub.id === 'INTERNAL_MOVE_TO_BEAT') {
    const cardIMTB = ctx.lastProcessedCards?.[0];
    if (!cardIMTB) return done(addLog(ctx, 'INTERNAL_MOVE_TO_BEAT: カードなし'));
    const newSigniIMTB = ctx.ownerState.field.signi.map(s => {
      if (!s?.at(-1)?.includes(cardIMTB)) return s;
      const f = s.filter(c => c !== cardIMTB);
      return f.length > 0 ? f : null;
    }) as (string[] | null)[];
    const newBeatIMTB = [...(ctx.ownerState.field.beat_zone ?? []), cardIMTB];
    const newOwnerIMTB: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigniIMTB, beat_zone: newBeatIMTB } };
    return done(addLog({ ...ctx, ownerState: newOwnerIMTB },
      `${ctx.cardMap.get(cardIMTB)?.CardName ?? cardIMTB}をビートゾーンへ`));
  }
  if (stub.id === 'TRASH_SIGNI_TO_BEAT') {
    const selectedTSTB = ctx.lastProcessedCards ?? [];
    if (selectedTSTB.length > 0) {
      const newBeatTSTB = [...(ctx.ownerState.field.beat_zone ?? []), ...selectedTSTB];
      const newTrashTSTB = ctx.ownerState.trash.filter(cn => !selectedTSTB.includes(cn));
      const newOwnerTSTB: PlayerState = { ...ctx.ownerState, trash: newTrashTSTB, field: { ...ctx.ownerState.field, beat_zone: newBeatTSTB } };
      const namesTSTB = selectedTSTB.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
      return done(addLog({ ...ctx, ownerState: newOwnerTSTB }, `${namesTSTB}をビートゾーンへ`));
    }
    const candsTSTB = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (candsTSTB.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし（TRASH_SIGNI_TO_BEAT）'));
    const noopTSTB: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contTSTB: StubAction = { type: 'STUB', id: 'TRASH_SIGNI_TO_BEAT' };
    return needsInteraction(addLog(ctx, 'ビートにするシグニを最大2枚選択'), {
      type: 'SELECT_TARGET', candidates: candsTSTB, count: Math.min(2, candsTSTB.length), optional: true,
      targetScope: 'self_trash', thenAction: noopTSTB as EffectAction, continuation: contTSTB as EffectAction,
    });
  }
  // SIGNI_UNDER_WEAPON_SIGNI: 自シグニ1体を自＜ウェポン＞シグニの下に置く
  if (stub.id === 'SIGNI_UNDER_WEAPON_SIGNI') {
    const ownFieldSUWS = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1)).filter((cn): cn is string => !!cn);
    const sourceSUWS = (ctx.lastProcessedCards ?? []).find(cn => ownFieldSUWS.includes(cn));
    if (!sourceSUWS) {
      if (ownFieldSUWS.length === 0) return done(addLog(ctx, '自シグニなし（SIGNI_UNDER_WEAPON_SIGNI）'));
      const noop: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const cont: StubAction = { type: 'STUB', id: 'SIGNI_UNDER_WEAPON_SIGNI' };
      return needsInteraction(addLog(ctx, '下に置くシグニを選択'), {
        type: 'SELECT_TARGET', candidates: ownFieldSUWS, count: 1, optional: false,
        targetScope: 'self_field', thenAction: noop as EffectAction, continuation: cont as EffectAction,
      });
    }
    const weaponCandsSUWS = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn && cn !== sourceSUWS &&
        (ctx.cardMap.get(cn)?.CardClass ?? '').includes('ウェポン'));
    if (weaponCandsSUWS.length === 0) return done(addLog(ctx, 'ウェポンシグニなし（SIGNI_UNDER_WEAPON_SIGNI）'));
    const applyStubSUWS: StubAction = { type: 'STUB', id: 'INTERNAL_SIGNI_UNDER_WEAPON', value: sourceSUWS };
    return needsInteraction(addLog(ctx, '下に置く先の＜ウェポン＞シグニを選択'), {
      type: 'SELECT_TARGET', candidates: weaponCandsSUWS, count: 1, optional: false,
      targetScope: 'self_field', thenAction: applyStubSUWS as EffectAction,
    });
  }
  // INTERNAL_SIGNI_UNDER_WEAPON: 選択シグニを＜ウェポン＞の下に配置
  if (stub.id === 'INTERNAL_SIGNI_UNDER_WEAPON') {
    const srcSUWI = typeof stub.value === 'string' ? stub.value : '';
    const weaponSUWI = ctx.lastProcessedCards?.[0];
    if (!srcSUWI || !weaponSUWI) return done(addLog(ctx, '対象なし（INTERNAL_SIGNI_UNDER_WEAPON）'));
    const signiSUWI = [...(ctx.ownerState.field.signi ?? [])] as (string[] | null)[];
    const srcZoneSUWI = signiSUWI.findIndex(s => s?.at(-1) === srcSUWI);
    const weaponZoneSUWI = signiSUWI.findIndex(s => s?.at(-1) === weaponSUWI);
    if (srcZoneSUWI < 0 || weaponZoneSUWI < 0) return done(addLog(ctx, 'ゾーン特定不可（INTERNAL_SIGNI_UNDER_WEAPON）'));
    const srcStackSUWI = [...(signiSUWI[srcZoneSUWI] ?? [])];
    signiSUWI[srcZoneSUWI] = srcStackSUWI.length > 1 ? srcStackSUWI.slice(0, -1) : null;
    signiSUWI[weaponZoneSUWI] = [srcSUWI, ...(signiSUWI[weaponZoneSUWI] ?? [])];
    const newOwnerSUWI = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: signiSUWI } };
    return done(addLog({ ...ctx, ownerState: newOwnerSUWI },
      `${ctx.cardMap.get(srcSUWI)?.CardName ?? srcSUWI}を${ctx.cardMap.get(weaponSUWI)?.CardName ?? weaponSUWI}の下に配置`));
  }
  // PLACE_DECK_TOP_UNDER_WEAPON_SIGNI: ウェポンシグニの下にデッキ上を置く
  if (stub.id === 'PLACE_DECK_TOP_UNDER_WEAPON_SIGNI') {
    if (ctx.ownerState.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const newSigniPDTUW = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const topCardPDTUW = ctx.ownerState.deck[0];
    // ウェポンシグニのゾーンを探す
    let placedPDTUW = false;
    for (let zi = 0; zi < 3; zi++) {
      const stack = newSigniPDTUW[zi];
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      const card = ctx.cardMap.get(topNum);
      if (card?.CardClass?.includes('ウェポン') || card?.CardClass?.includes('武器')) {
        newSigniPDTUW[zi] = [topCardPDTUW, ...stack]; // デッキ上をスタック底に追加
        placedPDTUW = true;
        break;
      }
    }
    if (!placedPDTUW) return done(addLog(ctx, 'ウェポンシグニなし'));
    const newOwnerPDTUW: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(1), field: { ...ctx.ownerState.field, signi: newSigniPDTUW } };
    return done(addLog({ ...ctx, ownerState: newOwnerPDTUW }, `ウェポン下にデッキ上配置: ${ctx.cardMap.get(topCardPDTUW)?.CardName ?? topCardPDTUW}`));
  }
  // PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON: 全ウェポンシグニの下にトラッシュからシグニを1枚ずつ置く
  if (stub.id === 'PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON') {
    const weaponZonesPTSUAW: number[] = [];
    for (let zi = 0; zi < 3; zi++) {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const c = ctx.cardMap.get(top);
      if (c?.CardClass?.includes('ウェポン') || c?.CardClass?.includes('武器')) weaponZonesPTSUAW.push(zi);
    }
    if (weaponZonesPTSUAW.length === 0) return done(addLog(ctx, 'ウェポンシグニなし'));
    const trashSigniPTSUAW = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (trashSigniPTSUAW.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし'));
    // 1つ目のウェポンゾーンに1枚選択して配置
    const tgtZonePTSUAW = weaponZonesPTSUAW[0];
    return needsInteraction(addLog(ctx, `ウェポン（ゾーン${tgtZonePTSUAW + 1}）下にトラッシュシグニを置く`), {
      type: 'SELECT_TARGET',
      candidates: trashSigniPTSUAW,
      count: 1,
      optional: false,
      targetScope: 'self_trash',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_PTSUAW_PLACE', value: tgtZonePTSUAW } as StubAction) as EffectAction,
    });
  }
  // INTERNAL_PTSUAW_PLACE: ウェポン下シグニ配置の実行
  if (stub.id === 'INTERNAL_PTSUAW_PLACE') {
    const zoneIdxIPTSUAW = typeof stub.value === 'number' ? stub.value : 0;
    const cardIPTSUAW = ctx.lastProcessedCards?.[0];
    if (!cardIPTSUAW) return done(addLog(ctx, 'INTERNAL_PTSUAW_PLACE: カードなし'));
    const newSigniIPTSUAW = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const existingStackIPTSUAW = newSigniIPTSUAW[zoneIdxIPTSUAW] ?? [];
    newSigniIPTSUAW[zoneIdxIPTSUAW] = [cardIPTSUAW, ...existingStackIPTSUAW];
    const newTrashIPTSUAW = ctx.ownerState.trash.filter(c => c !== cardIPTSUAW);
    const newOwnerIPTSUAW: PlayerState = { ...ctx.ownerState, trash: newTrashIPTSUAW, field: { ...ctx.ownerState.field, signi: newSigniIPTSUAW } };
    return done(addLog({ ...ctx, ownerState: newOwnerIPTSUAW }, `ウェポン下に配置: ${ctx.cardMap.get(cardIPTSUAW)?.CardName ?? cardIPTSUAW}`));
  }
  // CONDITIONAL_TRASH_UNDER_SIGNI: 相手エナN枚以上の場合、シグニ下カードを任意でトラッシュ
  if (stub.id === 'CONDITIONAL_TRASH_UNDER_SIGNI') {
    const toHWCTUS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcCTUS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCTUS = srcCTUS ? (srcCTUS.EffectText ?? '') + ' ' + (srcCTUS.BurstText ?? '') : '';
    const enaMCTUS = txtCTUS.match(/エナゾーンにカードが([０-９\d]+)枚以上/);
    const enaThreshCTUS = enaMCTUS ? parseInt(toHWCTUS(enaMCTUS[1])) : 3;
    if (ctx.otherState.energy.length < enaThreshCTUS) {
      return done(addLog(ctx, `条件不成立（相手エナ${ctx.otherState.energy.length}枚 < ${enaThreshCTUS}）`));
    }
    // シグニ下カード（スタック深さ>1のもの）を収集
    const underCardsCTUS: string[] = ctx.ownerState.field.signi.flatMap(stack => {
      if (!stack || stack.length <= 1) return [];
      return stack.slice(0, stack.length - 1); // top以外
    });
    if (underCardsCTUS.length === 0) return done(addLog(ctx, 'シグニ下カードなし'));
    const noopCTUS: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, 'シグニ下カードをトラッシュに置きますか？'), {
      type: 'SELECT_TARGET',
      candidates: underCardsCTUS,
      count: 1,
      optional: true,
      targetScope: 'self_field',
      thenAction: ({ type: 'STUB', id: 'INTERNAL_TRASH_UNDER_SIGNI' } as StubAction) as EffectAction,
      continuation: noopCTUS as EffectAction,
    });
  }
  // INTERNAL_TRASH_UNDER_SIGNI: シグニ下カードをトラッシュへ移動
  if (stub.id === 'INTERNAL_TRASH_UNDER_SIGNI') {
    const cardITUS = ctx.lastProcessedCards?.[0];
    if (!cardITUS) return done(addLog(ctx, 'INTERNAL_TRASH_UNDER_SIGNI: カードなし'));
    const newSigniITUS = ctx.ownerState.field.signi.map(stack => {
      if (!stack) return stack;
      const idx = stack.indexOf(cardITUS);
      if (idx < 0) return stack;
      return stack.filter((_, i) => i !== idx);
    }) as (string[] | null)[];
    const newOwnerITUS: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, cardITUS],
      field: { ...ctx.ownerState.field, signi: newSigniITUS },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerITUS },
      `${ctx.cardMap.get(cardITUS)?.CardName ?? cardITUS}をシグニ下からトラッシュへ`));
  }
  // LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限
  if (stub.id === 'LIMIT_OPP_SIGNI_ATTACKS_ONCE' || stub.id === 'OPP_SIGNI_ONE_ATTACK_TOTAL' || stub.id === 'LIMIT_OPP_ATTACK_ONCE') {
    const newOtherOSA: PlayerState = { ...ctx.otherState, signi_attack_once_limit: true };
    return done(addLog({ ...ctx, otherState: newOtherOSA }, '相手シグニは合計1回しかアタックできない'));
  }
  // アタック制限系（engine: アタック制限システム未実装）
  if (stub.id === 'ONE_ATTACK_PER_TURN' || stub.id === 'ODD_LEVEL_SIGNI_CANT_ATTACK'
      || stub.id === 'ATTACK_COUNT_BY_POWER'
      || stub.id === 'ADJACENT_ZONE_ATTACK'
      || stub.id === 'MULTI_ZONE_ATTACK' || stub.id === 'BLOCK_FRONT_SIGNI_ATTACK') {
    return done(addLog(ctx, `[アタック制限: ${stub.id}]`));
  }
  // BLOCK_OPP_ARTS_SPELL_ACT: このターン対戦相手はアーツ・スペル・起動能力を使用できない
  if (stub.id === 'BLOCK_OPP_ARTS_SPELL_ACT') {
    const newBlockedBOASA = [...(ctx.otherState.blocked_actions ?? []), 'USE_ARTS', 'USE_SPELL', 'USE_ACT'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOASA } },
      'このターン、対戦相手はアーツ・スペル・起動能力を使用できない'));
  }
  // BLOCK_COLORLESS_PLAY: 相手の無色プレイを封じる
  if (stub.id === 'BLOCK_COLORLESS_PLAY') {
    const newBlockedBCP = [...(ctx.otherState.blocked_actions ?? []), 'PLAY_COLORLESS'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBCP } },
      '相手は無色カードをプレイできない'));
  }
  // BLOCK_ALL_OPP_ACTIVATE_ABILITY: 全相手起動能力封じ
  if (stub.id === 'BLOCK_ALL_OPP_ACTIVATE_ABILITY') {
    const newBlockedBAAA = [...(ctx.otherState.blocked_actions ?? []), 'USE_ACT'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBAAA } },
      '相手は起動能力を使用できない'));
  }
  // ブロック系（engine: 行動ブロック未実装）
  // BLOCK_OPP_SPELL_ACT_NEXT_TURN: 次の対戦相手のターン中、スペルと起動能力を使用できない
  if (stub.id === 'BLOCK_OPP_SPELL_ACT_NEXT_TURN') {
    const blockedBOSANT = [...(ctx.otherState.blocked_actions ?? []), 'USE_SPELL:NEXT_TURN', 'USE_ACT:NEXT_TURN'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: blockedBOSANT } },
      '次の対戦相手のターン中、相手はスペルと起動能力を使用できない'));
  }
  // BLOCK_OPP_AUTO_ABILITY_EXTENDED: このターンと次のターン、相手シグニの【自】能力は発動しない
  if (stub.id === 'BLOCK_OPP_AUTO_ABILITY_EXTENDED') {
    const newBlocedBOAE = [
      ...(ctx.ownerState.blocked_actions ?? []),
      'BLOCK_OPP_SIGNI_AUTO',
      'BLOCK_OPP_SIGNI_AUTO:NEXT_TURN',
    ];
    const newOwnerBOAE: PlayerState = { ...ctx.ownerState, blocked_actions: newBlocedBOAE };
    return done(addLog({ ...ctx, ownerState: newOwnerBOAE }, 'このターンと次のターン: 相手シグニの【自】能力は発動しない'));
  }
  if (stub.id === 'BLOCK_NON_WHITE_SPELL'
      || stub.id === 'BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT' || stub.id === 'BLOCK_OPP_DECK_TO_ENERGY'
      || stub.id === 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT') {
    return done(addLog(ctx, `[ブロック効果: ${stub.id}]`));
  }
  // OPP_TURN_NO_ENERGY_COST: 対戦相手の次のターン中、対戦相手はエナコストを支払えない
  if (stub.id === 'OPP_TURN_NO_ENERGY_COST') {
    // エナコストを必要とする全アクションをブロック（アーツ/スペル/グロウ/起動能力）
    const newBlockedOTNEC = [
      ...(ctx.otherState.blocked_actions ?? []),
      'USE_ARTS:NEXT_TURN', 'USE_SPELL:NEXT_TURN',
      'GROW:NEXT_TURN', 'USE_ACT:NEXT_TURN',
    ];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedOTNEC } },
      '対戦相手の次のターン中、対戦相手はエナコストを支払えない（アーツ/スペル/グロウ/起動能力すべて）'));
  }
  // OPP_MAIN_PHASE_LIMIT_DOWN: 次の相手メインフェイズの間、センタールリグのリミット-2
  if (stub.id === 'OPP_MAIN_PHASE_LIMIT_DOWN') {
    const newOtherMPLD: PlayerState = { ...ctx.otherState, pending_lrig_limit_mod: (ctx.otherState.pending_lrig_limit_mod ?? 0) - 2 };
    return done(addLog({ ...ctx, otherState: newOtherMPLD }, '次の相手メインフェイズ中、相手リミット-2'));
  }
  // OPP_SIGNI_ATTACK_COST: ターン終了時まで、相手シグニのアタックに《無》×2コスト
  if (stub.id === 'OPP_SIGNI_ATTACK_COST') {
    const newOtherSAC: PlayerState = { ...ctx.otherState, signi_attack_cost: 2 };
    return done(addLog({ ...ctx, otherState: newOtherSAC }, 'ターン終了時まで、対戦相手シグニアタックに《無》×2コスト'));
  }
  // OPP_ZONE_PLACEMENT_RESTRICT: CONTINUOUS効果（effectEngineで動的判定）
  if (stub.id === 'OPP_ZONE_PLACEMENT_RESTRICT') {
    return done(addLog(ctx, '[配置制限: OPP_ZONE_PLACEMENT_RESTRICT（CONTINUOUS）]'));
  }
  // コストアップ系（engine: コスト計算未実装）
  if (stub.id === 'FIRST_SPELL_COST_UP' || stub.id === 'OPP_LRIG_ATTACK_COST'
      || stub.id === 'ARTS_COLORLESS_MUST_PAY_CENTER_COLOR') {
    return done(addLog(ctx, `[コストアップ/制限: ${stub.id}]`));
  }
  // シグニ移動/リダイレクト系（engine: 移動先変更未実装）
  // MOVE_TO_ATTACKER_FRONT: 相手シグニアタック時、正面が空なら自分をその正面に移動（してもよい）
  if (stub.id === 'MOVE_TO_ATTACKER_FRONT') {
    const srcMTAF = ctx.sourceCardNum;
    if (!srcMTAF) return done(addLog(ctx, 'アタッカー前移動：ソースなし'));
    // アタッカーゾーンを特定（stub.value 優先、なければ attacked_signi_ids から動的取得）
    let targetZoneMTAF: number;
    if (typeof stub.value === 'number' && stub.value >= 0) {
      targetZoneMTAF = stub.value;
    } else {
      const attackerIds = ctx.otherState.attacked_signi_ids ?? [];
      const lastAttacker = attackerIds[attackerIds.length - 1];
      if (lastAttacker) {
        targetZoneMTAF = ctx.otherState.field.signi.findIndex(s => s?.at(-1) === lastAttacker);
      } else {
        targetZoneMTAF = (ctx.otherState.field.signi_down ?? []).findIndex(d => d);
      }
    }
    if (targetZoneMTAF < 0) return done(addLog(ctx, 'アタッカー前移動：ゾーン特定不可'));
    // 自分の同ゾーンが空でなければ移動不可
    const frontStack = ctx.ownerState.field.signi[targetZoneMTAF];
    if (frontStack && frontStack.length > 0 && frontStack.at(-1) !== srcMTAF) {
      return done(addLog(ctx, `アタッカー正面ゾーン${targetZoneMTAF + 1}は占有済み（移動不可）`));
    }
    const curZoneMTAF = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMTAF);
    if (curZoneMTAF < 0) return done(addLog(ctx, 'アタッカー前移動：フィールドにいない'));
    if (curZoneMTAF === targetZoneMTAF) return done(addLog(ctx, 'アタッカー前移動：すでに正面ゾーン'));
    // 移動するかどうか選択
    const moveStubMTAF: StubAction = { type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: targetZoneMTAF };
    const skipStubMTAF: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(addLog(ctx, `ゾーン${targetZoneMTAF + 1}（アタッカー正面）に移動してもよい`), {
      type: 'CHOOSE',
      options: [
        { id: 'move', label: `ゾーン${targetZoneMTAF + 1}に移動`, action: moveStubMTAF as EffectAction, available: true },
        { id: 'skip', label: 'スキップ', action: skipStubMTAF as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  // OPP_TRASH_LOSE_COLOR_AND_CLASS: CONT効果（effectEngineで処理）
  if (stub.id === 'OPP_TRASH_LOSE_COLOR_AND_CLASS') {
    return done(addLog(ctx, '[OPP_TRASH_LOSE_COLOR_AND_CLASS: effectEngineで処理]'));
  }
  // FORCE_TARGET_SELF: このシグニしか対象にできない（ログのみ）
  if (stub.id === 'FORCE_TARGET_SELF') {
    return done(addLog(ctx, `[強制自己対象: ${stub.id}]`));
  }
  // BANISH_BY_SELF_GOES_TO_TRASH: このシグニによるバニッシュはエナでなくトラッシュへ
  if (stub.id === 'BANISH_BY_SELF_GOES_TO_TRASH') {
    const srcBBSGTT = ctx.sourceCardNum;
    if (!srcBBSGTT) return done(addLog(ctx, 'BANISH_BY_SELF_GOES_TO_TRASH: ソースなし'));
    const currentBTBS = ctx.ownerState.banish_to_trash_by_self ?? [];
    const newBTBS = [...new Set([...currentBTBS, srcBBSGTT])];
    const newOwnerBBSGTT: PlayerState = { ...ctx.ownerState, banish_to_trash_by_self: newBTBS };
    return done(addLog({ ...ctx, ownerState: newOwnerBBSGTT },
      `${ctx.cardMap.get(srcBBSGTT)?.CardName ?? srcBBSGTT}のバニッシュ→トラッシュへ誘導`));
  }
  // CRASH_TO_TRASH_INSTEAD: このターン相手のライフクロスクラッシュ時、エナではなくトラッシュへ
  if (stub.id === 'CRASH_TO_TRASH_INSTEAD') {
    const newOwner = { ...ctx.ownerState, crash_to_trash_instead: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、クラッシュされたカードはトラッシュに置かれる'));
  }
  // BANISH_REDIRECT_TO_HAND: このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなく手札に戻る
  if (stub.id === 'BANISH_REDIRECT_TO_HAND') {
    const newOwnerBRTH: PlayerState = { ...ctx.ownerState, banish_redirect_to_hand: true };
    return done(addLog({ ...ctx, ownerState: newOwnerBRTH }, 'このターン、対戦相手のシグニバニッシュ先→手札'));
  }
  // OPP_RETURN_HAND_ON_SELF_BANISH: バニッシュされたとき、対戦相手は手札を1枚デッキの一番上に置く
  if (stub.id === 'OPP_RETURN_HAND_ON_SELF_BANISH') {
    const candsORHOSB = ctx.otherState.hand;
    if (candsORHOSB.length === 0) return done(addLog(ctx, '対戦相手の手札なし（OPP_RETURN_HAND_ON_SELF_BANISH）'));
    const ttdActionORHOSB: EffectAction = {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
      shuffle: false,
      position: 'top',
    } as TransferToDeckAction;
    return selectOrInteract(candsORHOSB, 1, false, 'opp_hand', ttdActionORHOSB, undefined, ctx, true);
  }
  // MULTI_DAMAGE_ON_LRIG_ATTACK: このターン、ルリグアタックをN回与える（lrig_attack_remainingフラグでBattleScreen側が管理）
  if (stub.id === 'MULTI_DAMAGE_ON_LRIG_ATTACK') {
    const srcMDALA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMDALA = srcMDALA ? (srcMDALA.EffectText ?? '') + ' ' + (srcMDALA.BurstText ?? '') : '';
    const toHWMDALA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mMDALA = txtMDALA.match(/ダメージを([０-９\d]+)回与える/);
    const totalMDALA = mMDALA ? parseInt(toHWMDALA(mMDALA[1])) : 3;
    // 残り回数 = 合計 - 1（1回目は通常アタック扱い）
    const newOwnerMDALA = { ...ctx.ownerState, lrig_attack_remaining: totalMDALA - 1 };
    return done(addLog({ ...ctx, ownerState: newOwnerMDALA }, `このターン、ルリグが${totalMDALA}回アタックする（残り${totalMDALA - 1}回）`));
  }
  // ダメージ特殊（engine: ダメージ処理拡張必要）
  if (stub.id === 'ATTACK_PHASE_LEVEL_OVERRIDE') {
    return done(addLog(ctx, `[ダメージ/フェイズ特殊: ${stub.id}]`));
  }
  // ウェポン・プロテクション系（engine: 種族保護フラグ未実装）
  // DRIVE_SIGNI_PREVENT_DOWN: ドライブ状態のシグニに対戦相手の効果によるダウン防止を付与
  if (stub.id === 'DRIVE_SIGNI_PREVENT_DOWN') {
    const targetDSPD = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.ownerState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetDSPD) {
      const grantsDSPD = { ...(ctx.ownerState.keyword_grants ?? {}) };
      const prevDSPD = grantsDSPD[targetDSPD] ?? [];
      const protKey = 'PROTECTION:DOWN:opponent';
      if (!prevDSPD.includes(protKey)) grantsDSPD[targetDSPD] = [...prevDSPD, protKey];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsDSPD } },
        `${ctx.cardMap.get(targetDSPD)?.CardName ?? targetDSPD}→ターン終了時まで対戦相手効果によるダウン不可`));
    }
    const driveCandsDSPD = [0,1,2].map(zi => ctx.ownerState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => !!cn);
    if (driveCandsDSPD.length === 0) return done(addLog(ctx, '自フィールドにシグニなし（DRIVE_SIGNI_PREVENT_DOWN）'));
    const applyDSPD: StubAction = { type: 'STUB', id: 'DRIVE_SIGNI_PREVENT_DOWN' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: driveCandsDSPD, count: 1, optional: false,
      targetScope: 'self_field', thenAction: applyDSPD as EffectAction,
    });
  }
  // DRIVE_CONT_BANISH_RESIST: ドライブ常→このシグニはバニッシュされない（effectEngineで処理）
  if (stub.id === 'DRIVE_CONT_BANISH_RESIST') {
    return done(addLog(ctx, '[ドライブ常：バニッシュ耐性（effectEngine動的処理）]'));
  }
  // DRIVE_AUTO_BANISH_ALL_OPP: ドライブ自→アタック時に相手全シグニをバニッシュ（IS_DRIVE_STATEチェック付き）
  if (stub.id === 'DRIVE_AUTO_BANISH_ALL_OPP') {
    if (!(ctx.ownerState.lrig_riding_signi?.includes(ctx.sourceCardNum ?? ''))) {
      return done(addLog(ctx, 'ドライブ状態でない（DRIVE_AUTO_BANISH_ALL_OPP スキップ）'));
    }
    const oppAllDABA = [0, 1, 2].flatMap(zi => {
      const top = ctx.otherState.field.signi[zi]?.at(-1);
      return top ? [top] : [];
    });
    if (oppAllDABA.length === 0) return done(addLog(ctx, '相手シグニなし（DRIVE_AUTO_BANISH_ALL_OPP）'));
    let newOtherDABA = ctx.otherState;
    for (const cn of oppAllDABA) {
      const removed = removeFromField(cn, newOtherDABA);
      newOtherDABA = { ...removed, trash: [...removed.trash, cn] };
    }
    return done(addLog({ ...ctx, otherState: newOtherDABA }, `ドライブ自：相手全シグニ${oppAllDABA.length}体をバニッシュ`));
  }
  if (stub.id === 'WEAPON_SIGNI_PROTECT_DOWN'
      || stub.id === 'WEAPON_SIGNI_PROTECTION' || stub.id === 'ARM_SIGNI_LRIG_PROTECTION'
      || stub.id === 'WHITE_SIGNI_ABILITY_PROTECT' || stub.id === 'WEAPON_SIGNI_PREVENT_DOWN') {
    return done(addLog(ctx, `[種族保護: ${stub.id}]`));
  }
  // === バッチ17: パワー反転・条件分岐・ターゲット系 ===
  // REVERSE_OPP_POWER_MINUS: 相手シグニのパワーマイナス修正を反転（プラスに）
  if (stub.id === 'REVERSE_OPP_POWER_MINUS') {
    const modsRPM = (ctx.otherState.temp_power_mods ?? []).map(m => m.delta < 0 ? { ...m, delta: Math.abs(m.delta) } : m);
    const newOtherRPM: PlayerState = { ...ctx.otherState, temp_power_mods: modsRPM };
    return done(addLog({ ...ctx, otherState: newOtherRPM }, '相手シグニのパワーマイナスを反転（プラスに）'));
  }
  // NEGATE_THAT_ATTACK: 現在のアタックを無効化
  if (stub.id === 'NEGATE_THAT_ATTACK') {
    // lastProcessedCards の1枚目を攻撃中のシグニとして無効化
    const attackerNTA = ctx.lastProcessedCards?.[0];
    if (attackerNTA) {
      const negatedNTA = [...(ctx.ownerState.negated_attacks ?? []), attackerNTA];
      const newSNTA: PlayerState = { ...ctx.ownerState, negated_attacks: negatedNTA };
      return done(addLog({ ...ctx, ownerState: newSNTA }, `${ctx.cardMap.get(attackerNTA)?.CardName ?? attackerNTA}のアタックを無効化`));
    }
    return done(addLog(ctx, 'アタック無効化（対象不明）'));
  }
  // NEGATE_NTH_ATTACK: このターン、相手シグニのアタックをN回目まで自動無効化
  if (stub.id === 'NEGATE_NTH_ATTACK') {
    const toHWNNA = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcNNA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtNNA = srcNNA ? (srcNNA.EffectText ?? '') + ' ' + (srcNNA.BurstText ?? '') : '';
    // 「一度目か二度目」→2, 「一度目」→1, テキスト不明→1
    let nNNA = 1;
    if (txtNNA.match(/[一1１]度目か[二2２]度目/)) nNNA = 2;
    else if (txtNNA.match(/[一1１]度目か[二2２]度目か[三3３]度目/)) nNNA = 3;
    else { const m = txtNNA.match(/([０-９\d一二三四五六七八九十]+)回目/); if (m) nNNA = parseInt(toHWNNA(m[1])) || 1; }
    const cur = ctx.ownerState.negate_opp_signi_attacks_until ?? 0;
    const newOwner = { ...ctx.ownerState, negate_opp_signi_attacks_until: Math.max(cur, nNNA) };
    return done(addLog({ ...ctx, ownerState: newOwner }, `このターン、相手シグニアタックを${nNNA}回目まで自動無効化`));
  }
  // NEGATE_COIN_ABILITY: コイン能力を無効化（ログのみ）
  if (stub.id === 'NEGATE_COIN_ABILITY') {
    const newOtherNCA: PlayerState = { ...ctx.otherState, negate_coin_abilities: true };
    return done(addLog({ ...ctx, otherState: newOtherNCA }, 'このターン、対戦相手のコイン能力（ベット）を発動できない'));
  }
  // NEGATE_ALL_OPP_EFFECTS: 相手のCONTINUOUS効果を全て無効化（all_cont_effects_negatedフラグ）
  if (stub.id === 'NEGATE_ALL_OPP_EFFECTS') {
    const newOtherNAOE: PlayerState = { ...ctx.otherState, all_cont_effects_negated: true };
    return done(addLog({ ...ctx, otherState: newOtherNAOE },
      '相手のCONTINUOUS効果を全て無効化（このターン）'));
  }
  // EFFECT_LIMIT: 連続効果の上限枚数をキャップ（直前のパワー修正を上限値でキャップ）
  if (stub.id === 'EFFECT_LIMIT') {
    const srcEL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtEL = srcEL ? (srcEL.EffectText ?? '') + ' ' + (srcEL.BurstText ?? '') : '';
    const toHWEL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const capMEL = txtEL.match(/この効果は([０-９\d]+)枚(?:まで|までしか)/);
    if (capMEL && ctx.sourceCardNum) {
      const cap = parseInt(toHWEL(capMEL[1]));
      // temp_power_mods の最後のエントリをキャップ（deltaPerUnit * cap が上限）
      const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
      if (mods.length > 0) {
        const last = mods[mods.length - 1];
        // deltaPerUnit を推定（最後のdelta / 現在のカウントから逆算が困難なので単純に cap を使う）
        // 最も単純な実装：delta の絶対値が cap * 1000 を超える場合キャップ
        const capVal = cap * 1000;
        if (Math.abs(last.delta) > capVal) {
          mods[mods.length - 1] = { ...last, delta: last.delta > 0 ? capVal : -capVal };
          return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
            `効果上限: ${cap}枚（パワー修正を${last.delta > 0 ? '+' : '-'}${capVal}にキャップ）`));
        }
      }
      return done(addLog(ctx, `効果上限: ${cap}枚（キャップ内）`));
    }
    return done(addLog(ctx, '効果制限'));
  }
  // DISONA_RESTRICTION: DISONA制限（ログのみ）
  if (stub.id === 'DISONA_RESTRICTION') {
    return done(addLog(ctx, 'DISONA制限'));
  }
  // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック、未達時トラッシュ
  if (stub.id === 'COIN_SPEND_CONDITION') {
    // lastProcessedCards[0] が今ターン場に出たシグニ → ターン終了時チェック対象として登録
    const cnCCSC = ctx.lastProcessedCards?.[0];
    if (!cnCCSC) return done(addLog(ctx, '[COIN_SPEND_CONDITION: 対象シグニなし]'));
    const srcCCSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCSC = srcCCSC ? (srcCCSC.EffectText ?? '') : '';
    const toHWCCSC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const minCoinsM = txtCCSC.match(/《コインアイコン》を合計([０-９\d]+)枚以上支払っていなかった場合/);
    const minCoins = minCoinsM ? parseInt(toHWCCSC(minCoinsM[1])) : 1;
    const newCCSC = [...(ctx.ownerState.coin_condition_signi_instances ?? []), cnCCSC];
    const newOwnerCCSC: PlayerState = { ...ctx.ownerState, coin_condition_signi_instances: newCCSC };
    return done(addLog({ ...ctx, ownerState: newOwnerCCSC }, `コイン消費チェック登録：${ctx.cardMap.get(cnCCSC)?.CardName ?? cnCCSC}（コイン${minCoins}枚以上要）`));
  }
  // COIN_USE_RESTRICTION: コイン使用先をスペルとシグニに限定（ゲーム中永続）
  if (stub.id === 'COIN_USE_RESTRICTION') {
    const newOwnerCUR: PlayerState = { ...ctx.ownerState, coin_use_restriction: 'spell_signi_only' };
    return done(addLog({ ...ctx, ownerState: newOwnerCUR }, 'このゲームの間：コインはスペルとシグニにしか支払えない'));
  }
  // INCREASE_ACT_ABILITY_COST: 起動能力のコストを増加（ログのみ）
  if (stub.id === 'INCREASE_ACT_ABILITY_COST') {
    return done(addLog(ctx, '起動能力コスト増加'));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR: センタールリグの色に応じてキーワード付与
  if (stub.id === 'CONDITIONAL_KEYWORD_BY_CENTER_COLOR') {
    const centerCKBC = ctx.ownerState.field.lrig.at(-1);
    const centerCardCKBC = centerCKBC ? ctx.cardMap.get(centerCKBC) : undefined;
    const centerColorCKBC = centerCardCKBC?.Color ?? '';
    const srcCKBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCKBC = srcCKBC ? (srcCKBC.EffectText ?? '') : '';
    const mKwCKBC = txtCKBC.match(/【([^】]+)】/);
    const kwCKBC = mKwCKBC ? mKwCKBC[1] : 'ランサー';
    const mColorCKBC = txtCKBC.match(/(赤|青|緑|白|黒)/);
    const condColorCKBC = mColorCKBC ? mColorCKBC[1] : '';
    if (condColorCKBC && !centerColorCKBC.includes(condColorCKBC)) {
      return done(addLog(ctx, `センター色${centerColorCKBC}≠${condColorCKBC}（条件不達成）`));
    }
    // 自分のフィールドシグニにキーワード付与
    const kwGrantsCKBC = { ...(ctx.ownerState.keyword_grants ?? {}) };
    (ctx.ownerState.field.signi ?? []).forEach(s => {
      if (s && s.length > 0) {
        const cn = s[s.length - 1];
        const existing = kwGrantsCKBC[cn] ?? [];
        if (!existing.includes(kwCKBC)) kwGrantsCKBC[cn] = [...existing, kwCKBC];
      }
    });
    const newSCKBC: PlayerState = { ...ctx.ownerState, keyword_grants: kwGrantsCKBC };
    return done(addLog({ ...ctx, ownerState: newSCKBC }, `センター色${centerColorCKBC}→全シグニに【${kwCKBC}】付与`));
  }
  // SELECT_OTHER_SIGNI: ソース以外のシグニを選択
  if (stub.id === 'SELECT_OTHER_SIGNI') {
    const srcSOS = ctx.sourceCardNum;
    const candsSOS = (ctx.ownerState.field.signi ?? []).flatMap(s => {
      if (!s || s.length === 0) return [];
      const top = s[s.length - 1];
      return top !== srcSOS ? [top] : [];
    });
    if (candsSOS.length === 0) return done(addLog(ctx, '選択可能な他シグニなし'));
    const noopSOS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsSOS, count: 1, optional: true,
      targetScope: 'self_field', thenAction: noopSOS as EffectAction,
    });
  }
  // ENERGY_LEVEL_CONDITION_CHOOSE: エナにレベルN以上があればCHOOSE提示
  if (stub.id === 'ENERGY_LEVEL_CONDITION_CHOOSE') {
    const toHWELCC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcELCC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtELCC = srcELCC ? (srcELCC.EffectText ?? '') + ' ' + (srcELCC.BurstText ?? '') : '';
    const mLvELCC = txtELCC.match(/レベル([０-９\d]+)以上/);
    const threshELCC = mLvELCC ? parseInt(toHWELCC(mLvELCC[1])) : 4;
    const hasLevelELCC = ctx.ownerState.energy.some(cn => {
      const lv = parseInt(toHWELCC(ctx.cardMap.get(cn)?.Level ?? '0')) || 0;
      return lv >= threshELCC;
    });
    if (!hasLevelELCC) return done(addLog(ctx, `エナにLv${threshELCC}以上なし（条件不達成）`));
    return done(addLog(ctx, `エナにLv${threshELCC}以上あり（条件達成）→選択効果`));
  }
  // LEVEL_BASED_CONDITIONAL: 公開したシグニのレベルN枚だけ手札を捨てる
  if (stub.id === 'LEVEL_BASED_CONDITIONAL') {
    const toHWLBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const revealedLBC = ctx.lastProcessedCards?.[0];
    const revealedCardLBC = revealedLBC ? ctx.cardMap.get(revealedLBC) : undefined;
    const levelLBC = revealedCardLBC ? (parseInt(toHWLBC(revealedCardLBC.Level ?? '0')) || 0) : 0;
    if (levelLBC === 0 || ctx.ownerState.hand.length === 0) {
      return done(addLog(ctx, `レベル条件: Lv${levelLBC}→手札捨てなし`));
    }
    const discardNLBC = Math.min(levelLBC, ctx.ownerState.hand.length);
    const discardActionLBC: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: discardNLBC } };
    return selectOrInteract(ctx.ownerState.hand, discardNLBC, false, 'self_hand', discardActionLBC as EffectAction, undefined,
      addLog(ctx, `レベル${levelLBC}のシグニ → 手札${discardNLBC}枚捨て`));
  }
  // OPP_DECLARE_COLOR: 相手が色を宣言（5色CHOOSE opponentResponds→INTERNAL_SET_OPP_DECLARED_COLOR）
  if (stub.id === 'OPP_DECLARE_COLOR') {
    const colorsODC = ['白', '赤', '青', '緑', '黒'];
    const setColorODC = (c: string): StubAction => ({ type: 'STUB', id: 'INTERNAL_SET_OPP_DECLARED_COLOR', value: c });
    const optsODC = colorsODC.map(c => ({
      id: `opp_color_${c}`, label: `${c}を宣言`, action: setColorODC(c) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '対戦相手が色を宣言する（白/赤/青/緑/黒）'), {
      type: 'CHOOSE', options: optsODC, count: 1, opponentResponds: true,
    });
  }
  if (stub.id === 'INTERNAL_SET_OPP_DECLARED_COLOR') {
    const colorSODC = typeof stub.value === 'string' ? stub.value : String(stub.value ?? '');
    const newOtherSODC = { ...ctx.otherState, declared_color: colorSODC };
    return done(addLog({ ...ctx, otherState: newOtherSODC }, `対戦相手が色「${colorSODC}」を宣言`));
  }
  // COLLAB: コラボ効果
  if (stub.id === 'COLLAB') {
    const srcCL = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    const txtCL = (srcCL?.EffectText ?? '') + ' ' + (srcCL?.BurstText ?? '');
    // 「コラボライバーN人を呼ぶ」= ルリグデッキからアシストルリグをアシストゾーンに配置
    const callM = txtCL.match(/コラボライバー([２2])人を呼ぶ/);
    const callCount = callM ? 2 : txtCL.includes('コラボライバー') && txtCL.includes('呼ぶ') ? 1 : 0;
    if (callCount > 0) {
      const lrigDk = ctx.ownerState.lrig_deck;
      const assistInDk = lrigDk.filter(cn => {
        const c = ctx.cardMap.get(getCardNum(cn));
        return c?.Type === 'アシストルリグ';
      });
      if (assistInDk.length === 0) return done(addLog(ctx, 'コラボライバーなし'));
      let ns: PlayerState = { ...ctx.ownerState };
      let placed = 0;
      const placedIds: string[] = [];
      for (const instanceId of assistInDk) {
        if (placed >= callCount) break;
        const lf = ns.field.assist_lrig_l ?? [];
        const rt = ns.field.assist_lrig_r ?? [];
        const newDk = ns.lrig_deck.filter(x => x !== instanceId);
        if (lf.length === 0) {
          ns = { ...ns, lrig_deck: newDk, field: { ...ns.field, assist_lrig_l: [instanceId] } };
          placedIds.push(instanceId);
          placed++;
        } else if (rt.length === 0) {
          ns = { ...ns, lrig_deck: newDk, field: { ...ns.field, assist_lrig_r: [instanceId] } };
          placedIds.push(instanceId);
          placed++;
        } else {
          break;
        }
      }
      return done(addLog({ ...ctx, ownerState: ns, lastProcessedCards: placedIds }, `コラボライバー${placed}人を呼んだ`));
    }
    // 「コラボしてもよい」: 任意でアシストルリグを1人召喚
    const assistAvailCL = ctx.ownerState.lrig_deck.filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      return c?.Type === 'アシストルリグ';
    });
    const hasAssistSpaceCL = (ctx.ownerState.field.assist_lrig_l?.length ?? 0) === 0 ||
      (ctx.ownerState.field.assist_lrig_r?.length ?? 0) === 0;
    if (assistAvailCL.length === 0 || !hasAssistSpaceCL) {
      return done(addLog(ctx, 'コラボ: アシストルリグまたは空きゾーンなし'));
    }
    const noopCL: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, 'コラボしますか？（コラボライバーを1人呼ぶ）'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'collab_yes', label: 'コラボする', action: ({ type: 'STUB', id: 'INTERNAL_DO_COLLAB', value: 1 } as StubAction) as EffectAction, available: true },
        { id: 'collab_no', label: 'しない', action: noopCL as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_DO_COLLAB: コラボ実行（アシストルリグ1人を配置）
  if (stub.id === 'INTERNAL_DO_COLLAB') {
    const assistInDkIDC = ctx.ownerState.lrig_deck.filter(cn => {
      const c = ctx.cardMap.get(getCardNum(cn));
      return c?.Type === 'アシストルリグ';
    });
    if (assistInDkIDC.length === 0) return done(addLog(ctx, 'コラボライバーなし'));
    const toPlaceIDC = assistInDkIDC[0];
    const newDkIDC = ctx.ownerState.lrig_deck.filter(x => x !== toPlaceIDC);
    let newFieldIDC = ctx.ownerState.field;
    if ((ctx.ownerState.field.assist_lrig_l?.length ?? 0) === 0) {
      newFieldIDC = { ...newFieldIDC, assist_lrig_l: [toPlaceIDC] };
    } else {
      newFieldIDC = { ...newFieldIDC, assist_lrig_r: [toPlaceIDC] };
    }
    const newOwnerIDC: PlayerState = { ...ctx.ownerState, lrig_deck: newDkIDC, field: newFieldIDC };
    return done(addLog({ ...ctx, ownerState: newOwnerIDC },
      `コラボ: ${ctx.cardMap.get(getCardNum(toPlaceIDC))?.CardName ?? toPlaceIDC}を召喚`));
  }
  // GATE: ゲート効果（ログのみ）
  // GATE: 相手のシグニゾーン1つに【ゲート】を設置（次のアタックフェイズに条件付きでアタック不可）
  if (stub.id === 'GATE') {
    const zoneOptsGATE = [0, 1, 2].map(zi => ({
      id: `gate_zone_${zi}`,
      label: `相手ゾーン${zi + 1}に【ゲート】設置`,
      action: ({ type: 'STUB', id: 'INTERNAL_SET_GATE', value: zi } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '【ゲート】を設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsGATE, count: 1,
    });
  }
  if (stub.id === 'INTERNAL_SET_GATE') {
    const gateZoneIdx: number = (typeof stub.value === 'number' ? stub.value : 0) as number;
    const currentGates = [...(ctx.otherState.signi_gate_zones ?? [])];
    if (!currentGates.includes(gateZoneIdx)) currentGates.push(gateZoneIdx);
    // ゲートゾーンの相手シグニを blocked_actions に追加（アタック不可）
    const gateTop = ctx.otherState.field.signi[gateZoneIdx]?.at(-1);
    const blocked = [...(ctx.otherState.blocked_actions ?? [])];
    if (gateTop) blocked.push(`ATTACK:${gateTop}`);
    const newOtherGATE = { ...ctx.otherState, signi_gate_zones: currentGates, blocked_actions: blocked };
    return done(addLog({ ...ctx, otherState: newOtherGATE }, `相手ゾーン${gateZoneIdx + 1}に【ゲート】設置`));
  }
  // PLACE_MAGIC_BOX: lastProcessedCards[0]のカードをMBとして設置（ゾーン選択→INTERNAL_SET_MAGIC_BOX）
  if (stub.id === 'PLACE_MAGIC_BOX') {
    const cardPMB = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardPMB) return done(addLog(ctx, '【マジックボックス】設置：カードなし'));
    const zoneLabelsPMB = [0, 1, 2].map(zi => {
      const existingMB = (ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])[zi];
      const label = existingMB
        ? `ゾーン${zi + 1}（既存MBを上書き）`
        : `ゾーン${zi + 1}に設置`;
      return { id: `zone_${zi}`, label, action: ({ type: 'STUB', id: 'INTERNAL_SET_MAGIC_BOX', value: zi } as StubAction) as EffectAction, available: true };
    });
    return needsInteraction(addLog(ctx, '【マジックボックス】を設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneLabelsPMB, count: 1,
    });
  }
  // INTERNAL_SET_MAGIC_BOX: ゾーン確定後の実設置処理
  if (stub.id === 'INTERNAL_SET_MAGIC_BOX') {
    const zoneIdxSMB: number = (typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'))) as number;
    const cardSMB = ctx.lastProcessedCards?.[0] ?? null;
    if (!cardSMB) return done(addLog(ctx, 'INTERNAL_SET_MAGIC_BOX：カードなし'));
    const currentMBs = [...(ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])] as (string | null)[];
    const newTrashSMB = [...ctx.ownerState.trash];
    if (currentMBs[zoneIdxSMB]) newTrashSMB.push(currentMBs[zoneIdxSMB]!);
    currentMBs[zoneIdxSMB] = cardSMB;
    // カードをデッキ/手札から除去（どちらにあっても対応）
    const newDeckSMB = ctx.ownerState.deck.filter(c => c !== cardSMB);
    const newHandSMB = ctx.ownerState.hand.filter(c => c !== cardSMB);
    const newOwnerSMB: PlayerState = {
      ...ctx.ownerState,
      deck: newDeckSMB,
      hand: newHandSMB,
      trash: newTrashSMB,
      field: { ...ctx.ownerState.field, signi_magic_boxes: currentMBs },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSMB }, `【マジックボックス】設置: ゾーン${zoneIdxSMB + 1}（${ctx.cardMap.get(cardSMB ?? '')?.CardName ?? cardSMB}）`));
  }
  // OPEN_MAGIC_BOX: このシグニと同ゾーンのMBを表向きにしてトラッシュへ（任意）
  if (stub.id === 'OPEN_MAGIC_BOX') {
    const srcOMB = ctx.sourceCardNum;
    const signiFieldOMB = ctx.ownerState.field.signi;
    const zoneIdxOMB = signiFieldOMB.findIndex(stack => stack?.includes(srcOMB ?? ''));
    const mbsOMB = ctx.ownerState.field.signi_magic_boxes ?? [null, null, null];
    const mbCardOMB = zoneIdxOMB >= 0 ? (mbsOMB[zoneIdxOMB] ?? null) : null;
    if (!mbCardOMB) return done(addLog(ctx, `ゾーン${zoneIdxOMB >= 0 ? zoneIdxOMB + 1 : '?'}にMBなし`));
    const mbNameOMB = ctx.cardMap.get(mbCardOMB ?? '')?.CardName ?? (mbCardOMB ?? '');
    const noopOMB: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, `【マジックボックス】（${mbNameOMB}）を表向きにしますか？`), {
      type: 'CHOOSE',
      options: [
        {
          id: 'open', label: '表向きにしてトラッシュへ',
          action: ({ type: 'STUB', id: 'INTERNAL_OPEN_MB_DO', value: zoneIdxOMB } as StubAction) as EffectAction,
          available: true,
        },
        { id: 'skip', label: 'しない', action: noopOMB as EffectAction, available: true },
      ],
      count: 1,
    });
  }
  // INTERNAL_OPEN_MB_DO: MB表向き確定後のトラッシュ移動
  if (stub.id === 'INTERNAL_OPEN_MB_DO') {
    const zoneIdxOD = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
    const mbsOD = [...(ctx.ownerState.field.signi_magic_boxes ?? [null, null, null])] as (string | null)[];
    const mbCardOD = mbsOD[zoneIdxOD];
    if (!mbCardOD) return done(addLog(ctx, 'INTERNAL_OPEN_MB_DO：MBなし'));
    mbsOD[zoneIdxOD] = null;
    const newOwnerOD: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, mbCardOD],
      field: { ...ctx.ownerState.field, signi_magic_boxes: mbsOD },
    };
    return done(addLog(
      { ...ctx, ownerState: newOwnerOD, lastProcessedCards: [mbCardOD] },
      `【マジックボックス】公開: ${ctx.cardMap.get(mbCardOD)?.CardName ?? mbCardOD}→トラッシュ`,
    ));
  }
  // TARGET_OPP_SIGNI_ONLY: 対象修飾子（ログのみ）
  if (stub.id === 'TARGET_OPP_SIGNI_ONLY') {
    return done(addLog(ctx, '相手シグニを対象とする'));
  }
  // TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: 相手シグニ1体を対象とし、バウンスかトラッシュを選ぶ
  // （WXDi-P10-033: デッキ5枚公開後の条件付き選択効果）
  if (stub.id === 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE') {
    const candsTOSFC = ctx.otherState.field.signi
      .flatMap((s: string[] | null) => (s?.length ? [s[s.length - 1]] : []))
      .filter(Boolean) as string[];
    if (candsTOSFC.length === 0) return done(addLog(ctx, '対象シグニなし（TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE）'));
    const internalT: StubAction = { type: 'STUB', id: 'INTERNAL_TOSFC_AFTER_SELECT' };
    return selectOrInteract(candsTOSFC, 1, false, 'opp_field', internalT as EffectAction, undefined, ctx, true);
  }
  // INTERNAL_TOSFC_AFTER_SELECT: 選択後にバウンスかトラッシュを選択
  if (stub.id === 'INTERNAL_TOSFC_AFTER_SELECT') {
    const targetTN = ctx.lastProcessedCards?.[0];
    if (!targetTN) return done(addLog(ctx, '[INTERNAL_TOSFC: 対象なし]'));
    const tNameT = ctx.cardMap.get(targetTN)?.CardName ?? targetTN;
    const optsT = [
      { id: 'bounce', label: `${tNameT}を手札に戻す`, action: ({ type: 'STUB', id: 'INTERNAL_TOSFC_BOUNCE' }) as StubAction as EffectAction, available: true },
      { id: 'trash',  label: `${tNameT}をトラッシュに置く`, action: ({ type: 'STUB', id: 'INTERNAL_TOSFC_TRASH' }) as StubAction as EffectAction, available: true },
    ];
    return needsInteraction(addLog(ctx, `${tNameT}への効果を選択`), { type: 'CHOOSE', options: optsT, count: 1 });
  }
  // INTERNAL_TOSFC_BOUNCE: 選択した相手シグニをバウンス
  if (stub.id === 'INTERNAL_TOSFC_BOUNCE') {
    const tnB = ctx.lastProcessedCards?.[0];
    if (!tnB) return done(addLog(ctx, '[INTERNAL_TOSFC_BOUNCE: 対象なし]'));
    const removedB = removeFromField(tnB, ctx.otherState);
    const newOtherB: PlayerState = { ...removedB, hand: [...removedB.hand, tnB] };
    return done(addLog({ ...ctx, otherState: newOtherB }, `${ctx.cardMap.get(tnB)?.CardName ?? tnB}を手札に戻す`));
  }
  // INTERNAL_TOSFC_TRASH: 選択した相手シグニをトラッシュ
  if (stub.id === 'INTERNAL_TOSFC_TRASH') {
    const tnTr = ctx.lastProcessedCards?.[0];
    if (!tnTr) return done(addLog(ctx, '[INTERNAL_TOSFC_TRASH: 対象なし]'));
    const removedTr = removeFromField(tnTr, ctx.otherState);
    const newOtherTr: PlayerState = { ...removedTr, trash: [...removedTr.trash, tnTr] };
    return done(addLog({ ...ctx, otherState: newOtherTr }, `${ctx.cardMap.get(tnTr)?.CardName ?? tnTr}をトラッシュに置く`));
  }
  // USE_CONDITION_ARTS_USED: このターンにアーツを使用していた場合、このカードは使用不可
  // actions_done に 'USE_ARTS' が含まれるかチェック（BattleScreenがartsUse時に追加）
  if (stub.id === 'USE_CONDITION_ARTS_USED') {
    const usedArtsUCU = ctx.ownerState.actions_done?.includes('USE_ARTS') ?? false;
    if (usedArtsUCU) {
      return done(addLog(ctx, 'このターンすでにアーツを使用済み → 使用不可'));
    }
    return done(addLog(ctx, 'アーツ未使用 → 使用可'));
  }
  // CENTER_ZONE_CONDITION: このシグニが中央ゾーン（zone[1]）にある場合のみ続行
  if (stub.id === 'CENTER_ZONE_CONDITION') {
    const srcCZC = ctx.sourceCardNum;
    if (srcCZC) {
      const centerStack = ctx.ownerState.field.signi[1];
      const inCenter = centerStack?.includes(srcCZC) ?? false;
      if (!inCenter) return done(addLog(ctx, '中央ゾーン条件: 不成立（スキップ）'));
    }
    return done(addLog(ctx, '中央ゾーン条件: 成立'));
  }
  // DEPLOY_RESTRICT: 配置制限（CONTINUOUSは動的処理、AUTOはフラグ設置）
  if (stub.id === 'DEPLOY_RESTRICT') {
    const srcDR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDR = srcDR ? (srcDR.EffectText ?? '') : '';
    const toHWDR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 「パワーN以上のシグニを新たに場に出せない」→ 相手に配置パワー上限を設定
    const powerCapM = txtDR.match(/パワー([０-９\d万]+)以上.*(?:新たに)?場に出せない/);
    if (powerCapM) {
      const cap = parseInt(toHWDR(powerCapM[1]).replace('万', '0000'));
      const newOtherDR = { ...ctx.otherState, signi_deploy_power_limit: cap };
      return done(addLog({ ...ctx, otherState: newOtherDR },
        `対戦相手はパワー${cap}以上のシグニを場に出せない（次ターンまで）`));
    }
    // 「〜の効果によってしか新たに場に出せない」→ 自分シグニへの配置制限（ログのみ）
    if (txtDR.includes('効果によってしか') || txtDR.includes('効果以外')) {
      return done(addLog(ctx, `配置制限（特定効果のみ）：${srcDR?.CardName ?? ''}は特定効果でのみ場に出せる`));
    }
    return done(addLog(ctx, '配置制限（パターン解析不可）'));
  }
  // DEFEAT: 敗北処理 - ライフクロスを0にしてゲーム終了を誘発
  if (stub.id === 'DEFEAT') {
    if (ctx.ownerState.prevent_defeat) {
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, prevent_defeat: undefined } },
        '敗北無効（PREVENT_DEFEAT発動）'));
    }
    const newOwnerDEFEAT: PlayerState = { ...ctx.ownerState, life_cloth: [] };
    return done(addLog({ ...ctx, ownerState: newOwnerDEFEAT }, '敗北（ライフクロス0）'));
  }
  // REPEAT_N_TIMES / REPEAT_EFFECT: 以下をN回繰り返す
  if (stub.id === 'REPEAT_N_TIMES' || stub.id === 'REPEAT_EFFECT') {
    const srcRNT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRNT = srcRNT ? (srcRNT.EffectText ?? '') + ' ' + (srcRNT.BurstText ?? '') : '';
    const toHWRNT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const nM = txtRNT.match(/以下を([２-９\d]+)回行う/);
    const nRNT = nM ? parseInt(toHWRNT(nM[1])) : 1;
    // パワー修正パターン
    const pwMRNT = txtRNT.match(/パワーを([－-][０-９\d]+)する/);
    if (pwMRNT) {
      const delta = parseInt(toHWRNT(pwMRNT[1]).replace('－', '-'));
      const totalDelta = delta * nRNT;
      const modsRNT = [...(ctx.otherState.temp_power_mods ?? [])];
      [0,1,2].forEach(zi => {
        const top = ctx.otherState.field.signi[zi]?.at(-1);
        if (top) modsRNT.push({ cardNum: top, delta: totalDelta });
      });
      return done(addLog({...ctx, otherState: {...ctx.otherState, temp_power_mods: modsRNT}},
        `${nRNT}回繰り返し: 全シグニパワー${totalDelta}（${delta}×${nRNT}）`));
    }
    // デッキトラッシュパターン（相手）
    const millMRNT = txtRNT.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
    if (millMRNT) {
      const millPerRound = parseInt(toHWRNT(millMRNT[1]));
      const totalMill = millPerRound * nRNT;
      const toTrashRNT = ctx.otherState.deck.slice(0, Math.min(totalMill, ctx.otherState.deck.length));
      const newOtherRNT = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashRNT.length), trash: [...ctx.otherState.trash, ...toTrashRNT] };
      return done(addLog({...ctx, otherState: newOtherRNT}, `${nRNT}回繰り返し: デッキ${toTrashRNT.length}枚トラッシュ`));
    }
    // ドローパターン（自分）
    const drawMRNT = txtRNT.match(/カードを([０-９\d]+)枚引く/);
    if (drawMRNT) {
      const drawPerRound = parseInt(toHWRNT(drawMRNT[1]));
      const totalDraw = drawPerRound * nRNT;
      const canDraw = Math.min(totalDraw, ctx.ownerState.deck.length);
      const newOwnerRNTDraw: PlayerState = {
        ...ctx.ownerState,
        hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, canDraw)],
        deck: ctx.ownerState.deck.slice(canDraw),
      };
      return done(addLog({ ...ctx, ownerState: newOwnerRNTDraw }, `${nRNT}回繰り返し: ${canDraw}枚ドロー`));
    }
    // パワーアップパターン（自シグニ・正の値）
    const pwUpMRNT = txtRNT.match(/パワーを[＋+]([０-９\d]+)する/);
    if (pwUpMRNT) {
      const deltaUp = parseInt(toHWRNT(pwUpMRNT[1]));
      const totalDeltaUp = deltaUp * nRNT;
      const targetRNTUp = ctx.lastProcessedCards?.[0] ?? ctx.sourceCardNum;
      if (targetRNTUp) {
        const modsRNTUp = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: targetRNTUp, delta: totalDeltaUp }];
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsRNTUp } },
          `${nRNT}回繰り返し: パワー+${totalDeltaUp}`));
      }
    }
    // バウンスパターン（相手シグニを手札へ）
    if (txtRNT.includes('手札に戻す') && nRNT > 0) {
      const oppCands = ctx.otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      if (oppCands.length > 0) {
        const toBounce = oppCands.slice(0, nRNT);
        let newOtherBounce = ctx.otherState;
        for (const cn of toBounce) {
          const newSigni = [...newOtherBounce.field.signi] as (string[] | null)[];
          const zi = newSigni.findIndex(s => s?.at(-1) === cn);
          if (zi >= 0) { newSigni[zi] = null; }
          newOtherBounce = { ...newOtherBounce, hand: [...newOtherBounce.hand, cn], field: { ...newOtherBounce.field, signi: newSigni } };
        }
        return done(addLog({ ...ctx, otherState: newOtherBounce }, `${nRNT}回繰り返し: バウンス${toBounce.length}体`));
      }
    }
    // パワーダウン＋デッキミル複合パターン（例：銀鏡イオリ「－5000＋デッキ2枚」×N）
    const pwDownMillM = txtRNT.match(/パワーを([－-][０-９\d]+)する.*?デッキの上からカードを([０-９\d]+)枚トラッシュ/);
    if (pwDownMillM) {
      const deltaPDM = parseInt(toHWRNT(pwDownMillM[1]).replace('－', '-'));
      const millPerPDM = parseInt(toHWRNT(pwDownMillM[2]));
      // 相手シグニに1体ずつパワーダウン（nRNT回、ランダムに振り分け）
      const modsRNTPDM = [...(ctx.otherState.temp_power_mods ?? [])];
      const oppSigniListPDM = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).filter(Boolean) as string[];
      for (let i = 0; i < nRNT; i++) {
        const target = oppSigniListPDM[i % Math.max(1, oppSigniListPDM.length)];
        if (target) modsRNTPDM.push({ cardNum: target, delta: deltaPDM });
      }
      const totalMillPDM = millPerPDM * nRNT;
      const toTrashPDM = ctx.otherState.deck.slice(0, Math.min(totalMillPDM, ctx.otherState.deck.length));
      const newOtherPDM = {
        ...ctx.otherState,
        temp_power_mods: modsRNTPDM,
        deck: ctx.otherState.deck.slice(toTrashPDM.length),
        trash: [...ctx.otherState.trash, ...toTrashPDM],
      };
      return done(addLog({ ...ctx, otherState: newOtherPDM },
        `${nRNT}回繰り返し: パワー${deltaPDM}×${nRNT}＋デッキ${toTrashPDM.length}枚トラッシュ`));
    }
    // 両者デッキミルパターン（例：「あなたか対戦相手のデッキの上からN枚トラッシュ」→両者にmill）
    const bothMillM = txtRNT.match(/あなたか対戦相手のデッキの上からカードを([０-９\d]+)枚トラッシュ/);
    if (bothMillM) {
      const millPerBMRNT = parseInt(toHWRNT(bothMillM[1]));
      const totalBMRNT = millPerBMRNT * nRNT;
      const toTrashOwnerBM = ctx.ownerState.deck.slice(0, Math.min(totalBMRNT, ctx.ownerState.deck.length));
      const toTrashOtherBM = ctx.otherState.deck.slice(0, Math.min(totalBMRNT, ctx.otherState.deck.length));
      const newOwnerBM = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(toTrashOwnerBM.length), trash: [...ctx.ownerState.trash, ...toTrashOwnerBM] };
      const newOtherBM = { ...ctx.otherState, deck: ctx.otherState.deck.slice(toTrashOtherBM.length), trash: [...ctx.otherState.trash, ...toTrashOtherBM] };
      return done(addLog({ ...ctx, ownerState: newOwnerBM, otherState: newOtherBM },
        `${nRNT}回繰り返し: 両者デッキ${millPerBMRNT}枚×${nRNT}トラッシュ`));
    }
    return done(addLog(ctx, `${nRNT}回繰り返し効果（後続ステップで処理）`));
  }
  // PLACE_CHOKKIN: sourceCardNumのゾーンに【貯菌】カウンターを+1
  if (stub.id === 'PLACE_CHOKKIN') {
    if (!ctx.sourceCardNum) return done(addLog(ctx, 'チョッキン設置先不明'));
    let ziPC = -1;
    for (let i = 0; i < 3; i++) {
      if (ctx.ownerState.field.signi[i]?.at(-1) === ctx.sourceCardNum) { ziPC = i; break; }
    }
    if (ziPC < 0) return done(addLog(ctx, 'チョッキン設置先シグニなし'));
    const chokkinPC = [...(ctx.ownerState.field.signi_chokkin ?? [0, 0, 0])];
    chokkinPC[ziPC] = (chokkinPC[ziPC] ?? 0) + 1;
    const newOwnerPC: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_chokkin: chokkinPC } };
    return done(addLog({ ...ctx, ownerState: newOwnerPC }, `【貯菌】×${chokkinPC[ziPC]}（ゾーン${ziPC + 1}）`));
  }
  // ADD_RESONANCE_CONDITION: ルリグデッキのレゾナにアタックフェイズタイミングを追加（effectEngineで処理）
  if (stub.id === 'ADD_RESONANCE_CONDITION') {
    return done(addLog(ctx, '[ADD_RESONANCE_CONDITION: effectEngineで処理済み]'));
  }
  // IGNORE_LRIG_RESTRICTION_ARTS: ルリグ制限アーツを無視（ログのみ）
  if (stub.id === 'IGNORE_LRIG_RESTRICTION_ARTS') {
    return done(addLog(ctx, 'ルリグ制限アーツを無視'));
  }
  // COST_COLOR_SELECT: 支払ったエナの色ごとに1色選択し、選択色のシグニをデッキから手札に加える
  if (stub.id === 'COST_COLOR_SELECT') {
    const srcCCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const costCCS = srcCCS ? (Array.isArray((srcCCS as any).Cost) ? (srcCCS as any).Cost : []) : [];
    // コスト色一覧からユニーク色セットを生成（無色は全色選択可）
    const colorsCCS = ['白', '赤', '青', '緑', '黒'];
    const costColorsCCS: string[] = [];
    if (Array.isArray(costCCS)) {
      for (const c of costCCS) {
        if (c.color && c.color !== '無') {
          for (let i = 0; i < (c.count ?? 1); i++) costColorsCCS.push(c.color);
        } else if (c.color === '無') {
          // 無色は全色選択可能を代表して追加
          for (let i = 0; i < (c.count ?? 1); i++) costColorsCCS.push('ANY');
        }
      }
    }
    // 実際に支払ったエナのカードから色を収集（best-effort）
    const paidColorsCCS: string[] = costColorsCCS.length > 0 ? costColorsCCS : colorsCCS.slice(0, 1);
    // 選択肢：各色1つのシグニをデッキから手札に
    const chosenColorsCCS = [...new Set(paidColorsCCS.filter(c => c !== 'ANY'))];
    const anyCount = paidColorsCCS.filter(c => c === 'ANY').length;
    // CHOOSE で選択する色を提示
    const colorOptsCCS = colorsCCS.map(col => ({
      id: `ccs_${col}`, label: `《${col}》のシグニを手札に`,
      action: ({ type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', color: col }, maxCount: 1, then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } } as EffectAction),
      available: true,
    }));
    const totalCountCCS = chosenColorsCCS.length + anyCount || 1;
    if (totalCountCCS >= colorOptsCCS.length) {
      // 全色分：SEARCH を色ごとに順次実行
      return done(addLog(ctx, `コスト色選択：${totalCountCCS}色のシグニをデッキから手札へ`));
    }
    return needsInteraction(addLog(ctx, `コスト色選択（${totalCountCCS}色）`), {
      type: 'CHOOSE', options: colorOptsCCS, count: Math.min(totalCountCCS, colorOptsCCS.length), multiSelect: true,
    });
  }
  // HASTARLIQ: 【ハスターリク】(WXDi-P05-TK01A)を相手シグニゾーンに設置
  if (stub.id === 'HASTARLIQ') {
    const selectedZoneHL = typeof stub.value === 'number' ? stub.value : -1;
    if (selectedZoneHL >= 0) {
      const currentHL = [...(ctx.otherState.hastarliq_zones ?? [])];
      if (!currentHL.includes(selectedZoneHL)) currentHL.push(selectedZoneHL);
      const newOtherHL = { ...ctx.otherState, hastarliq_zones: currentHL };
      return done(addLog({ ...ctx, otherState: newOtherHL }, `相手ゾーン${selectedZoneHL + 1}に【ハスターリク】設置`));
    }
    const setHLZone = (zi: number): StubAction => ({ type: 'STUB', id: 'HASTARLIQ', value: zi });
    const zoneOptsHL = [0, 1, 2].map(zi => ({
      id: `hastarliq_zone_${zi}`,
      label: `相手ゾーン${zi + 1}に設置`,
      action: setHLZone(zi) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '【ハスターリク】を設置するゾーンを選択'), {
      type: 'CHOOSE', options: zoneOptsHL, count: 1,
    });
  }
  // HASTARLIQ_TRIGGER: アタックフェイズ開始時発動（BattleScreenがスタックに積む）
  // 相手に「手札を1枚捨てる」か「《無》を支払う」か「どちらも行わない（→バニッシュ）」を選ばせる
  if (stub.id === 'HASTARLIQ_TRIGGER') {
    const zoneHL = typeof stub.value === 'number' ? stub.value : 0;
    const signiStackHLT = ctx.otherState.field.signi[zoneHL];
    if (!signiStackHLT || signiStackHLT.length === 0) {
      return done(addLog(ctx, `【ハスターリク】ゾーン${zoneHL + 1}: シグニなし（不発）`));
    }
    const canPayHLT    = ctx.otherState.energy.length >= 1;
    const canDiscardHLT = ctx.otherState.hand.length >= 1;
    const optsHLT = [];
    if (canDiscardHLT) {
      optsHLT.push({
        id: 'hl_discard',
        label: '手札を1枚捨てる',
        action: { type: 'STUB', id: 'INTERNAL_HL_SELECT_DISCARD', value: zoneHL } as EffectAction,
        available: true,
      });
    }
    if (canPayHLT) {
      optsHLT.push({
        id: 'hl_pay',
        label: '《無》を1枚支払う',
        action: { type: 'STUB', id: 'INTERNAL_HL_PAY', value: zoneHL } as EffectAction,
        available: true,
      });
    }
    optsHLT.push({
      id: 'hl_neither',
      label: 'どちらも行わない（シグニがバニッシュ）',
      action: { type: 'STUB', id: 'INTERNAL_HL_BANISH', value: zoneHL } as EffectAction,
      available: true,
    });
    const targetNameHLT = ctx.cardMap.get(signiStackHLT.at(-1)!)?.CardName ?? signiStackHLT.at(-1)!;
    return needsInteraction(addLog(ctx, `【ハスターリク】発動：ゾーン${zoneHL + 1}の${targetNameHLT}を守りますか？`), {
      type: 'CHOOSE', options: optsHLT, count: 1, opponentResponds: true,
    });
  }
  // INTERNAL_HL_SELECT_DISCARD: 手札を1枚選んで捨てる（ハスターリク回避）
  if (stub.id === 'INTERNAL_HL_SELECT_DISCARD') {
    if (ctx.otherState.hand.length === 0) {
      return done(addLog(ctx, '【ハスターリク】：手札なし（捨て不可）'));
    }
    const noopHLS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    const contHLS: StubAction = { type: 'STUB', id: 'INTERNAL_HL_DO_DISCARD' };
    return needsInteraction(addLog(ctx, '【ハスターリク】：手札から1枚捨てる'), {
      type: 'SELECT_TARGET',
      candidates: ctx.otherState.hand,
      count: 1,
      optional: false,
      targetScope: 'opp_hand',
      thenAction: noopHLS as EffectAction,
      continuation: contHLS as EffectAction,
      opponentResponds: true,
    });
  }
  // INTERNAL_HL_DO_DISCARD: 選択した手札をトラッシュへ→バニッシュ回避
  if (stub.id === 'INTERNAL_HL_DO_DISCARD') {
    const discardedHLD = ctx.lastProcessedCards?.[0];
    if (!discardedHLD) return done(addLog(ctx, '【ハスターリク】：手札捨て失敗'));
    const newOtherHLD: PlayerState = {
      ...ctx.otherState,
      hand:  ctx.otherState.hand.filter(c => c !== discardedHLD),
      trash: [...ctx.otherState.trash, discardedHLD],
    };
    return done(addLog({ ...ctx, otherState: newOtherHLD },
      `【ハスターリク】：${ctx.cardMap.get(discardedHLD)?.CardName ?? discardedHLD}を捨てた→バニッシュ回避`));
  }
  // INTERNAL_HL_PAY: 《無》1枚支払い→バニッシュ回避
  if (stub.id === 'INTERNAL_HL_PAY') {
    if (ctx.otherState.energy.length < 1) {
      return done(addLog(ctx, '【ハスターリク】：エナ不足（支払い不可）'));
    }
    const newOtherHLP: PlayerState = {
      ...ctx.otherState,
      energy: ctx.otherState.energy.slice(1),
    };
    return done(addLog({ ...ctx, otherState: newOtherHLP }, '【ハスターリク】：《無》1枚支払い→バニッシュ回避'));
  }
  // INTERNAL_HL_BANISH: どちらも行わない→そのゾーンのシグニをバニッシュ（エナへ）
  if (stub.id === 'INTERNAL_HL_BANISH') {
    const zoneHLB = typeof stub.value === 'number' ? stub.value : 0;
    const signiStackHLB = ctx.otherState.field.signi[zoneHLB];
    const topHLB = signiStackHLB?.at(-1);
    if (!topHLB) return done(addLog(ctx, `【ハスターリク】ゾーン${zoneHLB + 1}: シグニなし（バニッシュ不要）`));
    // removeFromField でチャーム・アクセ・ライズ下カード等も正しく処理する
    // （手動でスタックを切ると下のカードが場に残ってしまう）
    const removedHLB = removeFromField(topHLB, ctx.otherState);
    const { state: newOtherHLB, log: logHLB } = banishDestination(removedHLB, ctx.ownerState, topHLB);
    return done(addLog({ ...ctx, otherState: newOtherHLB },
      `【ハスターリク】：${ctx.cardMap.get(topHLB)?.CardName ?? topHLB}${logHLB}`));
  }
  // ACTIVATE_EICHI_ABILITY: コイン能力でこのシグニの【出】効果を再発動
  if (stub.id === 'ACTIVATE_EICHI_ABILITY') {
    const srcAEA = ctx.sourceCardNum ? ctx.cardMap.get(getCardNum(ctx.sourceCardNum)) : undefined;
    if (!srcAEA) return done(addLog(ctx, 'エイチ能力発動：ソースカードなし'));
    const eichiEffs = parseCardEffects(srcAEA);
    const onPlayAEA = eichiEffs.find(e => e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY'));
    if (onPlayAEA) {
      return exec(onPlayAEA.action, addLog(ctx, `エイチ能力発動：${srcAEA.CardName}の【出】効果を再発動`));
    }
    return done(addLog(ctx, `エイチ能力発動（${srcAEA.CardName}）：ON_PLAYなし`));
  }
  // CHANGE_EICHI_SIGNI_BASE_LEVEL: 英知シグニを選択→基本レベルを1～3に変更（ターン終了まで）
  if (stub.id === 'CHANGE_EICHI_SIGNI_BASE_LEVEL') {
    // stub.valueが数値かつlastProcessedCardsあり→適用
    if (typeof stub.value === 'number' && ctx.lastProcessedCards?.length) {
      const targetCESBL = ctx.lastProcessedCards[0];
      const newOvCESBL = { ...(ctx.ownerState.attack_phase_level_overrides ?? {}), [targetCESBL]: stub.value as number };
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, attack_phase_level_overrides: newOvCESBL } },
        `${ctx.cardMap.get(targetCESBL)?.CardName ?? targetCESBL}の基本レベルを${stub.value}に変更`));
    }
    // lastProcessedCardsあり（ターゲット選択済み）→レベル選択
    if (ctx.lastProcessedCards?.length) {
      const targetCESBL2 = ctx.lastProcessedCards[0];
      const optsCESBL = [1,2,3].map(lv => ({
        id: `lv_${lv}`, label: `レベル${lv}`,
        action: ({ type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL', value: lv } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `${ctx.cardMap.get(targetCESBL2)?.CardName ?? targetCESBL2}のレベルを選択`), {
        type: 'CHOOSE', options: optsCESBL, count: 1,
      });
    }
    // SELECT_TARGET: 自フィールドの英知シグニ
    const srcCESBL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCESBL = srcCESBL ? (srcCESBL.EffectText ?? '') + ' ' + (srcCESBL.BurstText ?? '') : '';
    const classNameCESBL = txtCESBL.match(/＜([^＞]+)＞のシグニ/)?.[1] ?? '英知';
    const eichiCandsCESBL = ctx.ownerState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      if (!top || top === ctx.sourceCardNum) return [];
      return (ctx.cardMap.get(top)?.CardClass ?? '').includes(classNameCESBL) ? [top] : [];
    });
    if (eichiCandsCESBL.length === 0) return done(addLog(ctx, `＜${classNameCESBL}＞シグニなし（CHANGE_EICHI_SIGNI_BASE_LEVEL）`));
    const contCESBL: StubAction = { type: 'STUB', id: 'CHANGE_EICHI_SIGNI_BASE_LEVEL' };
    return needsInteraction(addLog(ctx, `＜${classNameCESBL}＞シグニを選択（基本レベル変更）`), {
      type: 'SELECT_TARGET', candidates: eichiCandsCESBL, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contCESBL as EffectAction,
    });
  }
  // TRIGGER_OTHER_SIGNI_EICHI_ABILITY: 他の自シグニを選択し、その英知AUTO能力を発動させる
  if (stub.id === 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY') {
    if (ctx.lastProcessedCards?.length) {
      const targetTOSEA = ctx.lastProcessedCards[0];
      const cardTOSEA = ctx.cardMap.get(targetTOSEA);
      if (!cardTOSEA) return done(addLog(ctx, 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY: カードなし'));
      const effectsTOSEA = parseCardEffects(cardTOSEA);
      // 英知AUTO能力を検索（activeCondition: EICHI_LEVEL_SUM）
      const eichiEffTOSEA = effectsTOSEA.find(e =>
        e.effectType === 'AUTO' && e.activeCondition?.type === 'EICHI_LEVEL_SUM');
      if (!eichiEffTOSEA) return done(addLog(ctx, `${cardTOSEA.CardName}に英知AUTO能力なし`));
      return exec(eichiEffTOSEA.action,
        addLog({ ...ctx, sourceCardNum: targetTOSEA, lastProcessedCards: [] },
          `${cardTOSEA.CardName}の英知AUTO能力を発動`));
    }
    // 他の自シグニを選択
    const otherSigniTOSEA = ctx.ownerState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      return (top && top !== ctx.sourceCardNum) ? [top] : [];
    });
    if (otherSigniTOSEA.length === 0) return done(addLog(ctx, '他のシグニなし（TRIGGER_OTHER_SIGNI_EICHI_ABILITY）'));
    const contTOSEA: StubAction = { type: 'STUB', id: 'TRIGGER_OTHER_SIGNI_EICHI_ABILITY' };
    return needsInteraction(addLog(ctx, '英知能力を発動させるシグニを選択'), {
      type: 'SELECT_TARGET', candidates: otherSigniTOSEA, count: 1, optional: false,
      targetScope: 'self_field', thenAction: contTOSEA as EffectAction,
    });
  }
  // SUPPRESS_CENTER_ON_PLAY: このターン自分のセンタールリグの【出】効果を抑制
  if (stub.id === 'SUPPRESS_CENTER_ON_PLAY') {
    const newOwner = { ...ctx.ownerState, suppress_center_on_play: true };
    return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、センタールリグの【出】能力は発動しない'));
  }
  // SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: このシグニをトラッシュに置く代わりにダメージ無効（任意）
  if (stub.id === 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH') {
    const srcSDWT = ctx.sourceCardNum;
    if (!srcSDWT) return done(addLog(ctx, 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: ソースなし'));
    const inFieldSDWT = ctx.ownerState.field.signi.some(s => s?.includes(srcSDWT));
    if (!inFieldSDWT) return done(addLog(ctx, 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: フィールドにシグニなし'));
    const noopSDWT: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, `${ctx.cardMap.get(srcSDWT)?.CardName ?? srcSDWT}をトラッシュ→ダメージ無効しますか？`), {
      type: 'CHOOSE', count: 1,
      options: [
        {
          id: 'trash_prevent', label: `${ctx.cardMap.get(srcSDWT)?.CardName ?? srcSDWT}をトラッシュしてダメージ無効`,
          action: ({ type: 'STUB', id: 'INTERNAL_SDWT_DO' } as StubAction) as EffectAction, available: true,
        },
        { id: 'skip', label: 'しない（ダメージを受ける）', action: noopSDWT as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_SDWT_DO: シグニトラッシュ+ダメージ無効実行
  if (stub.id === 'INTERNAL_SDWT_DO') {
    const srcISDWT = ctx.sourceCardNum;
    if (!srcISDWT) return done(addLog(ctx, 'INTERNAL_SDWT_DO: ソースなし'));
    const newSigniISDWT = ctx.ownerState.field.signi.map(s => {
      if (!s?.includes(srcISDWT)) return s;
      const f = s.filter(c => c !== srcISDWT);
      return f.length > 0 ? f : null;
    }) as (string[] | null)[];
    const newOwnerISDWT: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, srcISDWT],
      field: { ...ctx.ownerState.field, signi: newSigniISDWT },
      prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1,
    };
    return done(addLog({ ...ctx, ownerState: newOwnerISDWT },
      `${ctx.cardMap.get(srcISDWT)?.CardName ?? srcISDWT}をトラッシュ→ダメージ無効`));
  }
  // SELECT_NO_COMMON_COLOR: 共通色なしを選択（ログのみ）
  // SELECT_NO_COMMON_COLOR: WX22-050 エンジェル・アウェイク
  // LOOK_AND_REORDER後のlastProcessedCards（デッキ上3枚）から天使シグニを選択
  // 「それぞれ共通する色を持たないように」: プレイヤーが手動でルールを守る前提
  // 選択したカードは「手札 or エナ」を1枚ずつ選択、非選択はトラッシュへ
  if (stub.id === 'SELECT_NO_COMMON_COLOR') {
    const revealedSNC = ctx.lastProcessedCards ?? [];

    // Phase 2: 選択後の個別行き先CHOOSE（stub.valueにJSON配列で残カード一覧）
    if (typeof stub.value === 'string' && stub.value.startsWith('SNC_DIST:')) {
      const queueSNC: string[] = JSON.parse(stub.value.slice('SNC_DIST:'.length));
      if (queueSNC.length === 0) return done(addLog(ctx, '選択処理完了'));
      const [firstSNC, ...restSNC] = queueSNC;
      const cardNameSNC = ctx.cardMap.get(firstSNC)?.CardName ?? firstSNC;
      const contNextSNC: StubAction | null = restSNC.length > 0
        ? { type: 'STUB', id: 'SELECT_NO_COMMON_COLOR', value: `SNC_DIST:${JSON.stringify(restSNC)}` }
        : null;
      const toHandContSNC: EffectAction = contNextSNC
        ? { type: 'SEQUENCE', steps: [{ type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_HAND', value: firstSNC } as StubAction, contNextSNC] as EffectAction[] } as import('../types/effects').SequenceAction
        : { type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_HAND', value: firstSNC } as StubAction;
      const toEnaContSNC: EffectAction = contNextSNC
        ? { type: 'SEQUENCE', steps: [{ type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_ENERGY', value: firstSNC } as StubAction, contNextSNC] as EffectAction[] } as import('../types/effects').SequenceAction
        : { type: 'STUB', id: 'INTERNAL_SNC_MOVE_TO_ENERGY', value: firstSNC } as StubAction;
      return needsInteraction(addLog(ctx, `${cardNameSNC}の行き先を選択`), {
        type: 'CHOOSE', count: 1, options: [
          { id: 'hand', label: `手札へ（${cardNameSNC}）`, action: toHandContSNC, available: true },
          { id: 'energy', label: `エナゾーンへ（${cardNameSNC}）`, action: toEnaContSNC, available: true },
        ],
      });
    }

    // Phase 1: 天使シグニを抽出し、非天使は即トラッシュ、天使はSEARCHで選択
    const isAngelSNC = (cn: string) => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && !!(c.CardClass?.includes('天使'));
    };
    const angelSNC   = revealedSNC.filter(isAngelSNC);
    const nonAngelSNC = revealedSNC.filter(cn => !isAngelSNC(cn));

    // 非天使をデッキからトラッシュへ
    let curSNC = ctx;
    for (const cn of nonAngelSNC) {
      const di = curSNC.ownerState.deck.indexOf(cn);
      if (di < 0) continue;
      const newDeck = [...curSNC.ownerState.deck]; newDeck.splice(di, 1);
      curSNC = { ...curSNC, ownerState: { ...curSNC.ownerState, deck: newDeck, trash: [...curSNC.ownerState.trash, cn] } };
    }

    if (angelSNC.length === 0) {
      return done(addLog(curSNC, '天使シグニなし→全カードをトラッシュへ'));
    }

    // ヒント: 選んだカードは互いに共通する色を持たないように（ルール上の制約・表示のみ）
    const colorHintSNC = angelSNC.map(cn => {
      const c = ctx.cardMap.get(cn);
      return `${c?.CardName ?? cn}(${c?.Color ?? '?'})`;
    }).join('、');

    // 天使シグニ選択 → continuation でエナ/手札振り分け
    const contSNC: StubAction = { type: 'STUB', id: 'INTERNAL_SNC_AFTER_SEARCH' };
    return needsInteraction(addLog(curSNC, `天使シグニを選ぶ（共通色を持たないように）: ${colorHintSNC}`), {
      type: 'SEARCH',
      visibleCards: angelSNC,
      maxPick: angelSNC.length,
      thenAction: { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as EffectAction,
      restDest: 'trash',
      continuation: contSNC as EffectAction,
    });
  }
  // INTERNAL_SNC_AFTER_SEARCH: SEARCHで非選択→trash済み、選択カードはまだdeckに残っている
  // SEARCH+restDestがdeck上カードをtrashに移動済み（非選択分）
  // 選択分はdeck内に残っているので、LOOK_AND_REORDER前後のdeckを比較して特定するか
  // SEARCH.visibleCardsの中で今もdeckにあるカードを選択済みとみなす
  // → lastProcessedCards で拾えないのでdeckを走査して特定
  // ここでは: SNC_AFTER_SEARCH stateを受け取って振り分けへ
  if (stub.id === 'INTERNAL_SNC_AFTER_SEARCH') {
    // lastProcessedCardsはSEARCH後に更新されないため、deck内に残っている天使シグニを探す
    // (非選択分はrestDest:'trash'でtrash済み, 選択分はまだdeckにある)
    // ctx.lastProcessedCardsには選択カードが入っているはず（applyDirectAction経由で更新）
    // RULE_REMINDER_TEXT は done(ctx) なので lastProcessedCards は変わらない
    // → SEARCHのvisibleCards情報は失われているが、continuation実行時の ctx.lastProcessedCards は
    //   resumeSearch前の値のままのはず(top3)なのでそこから天使でdeck内のものを抽出
    const deckSNC = ctx.ownerState.deck;
    const revSNC = ctx.lastProcessedCards ?? [];
    const selectedSNC = revSNC.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && c.CardClass?.includes('天使') && deckSNC.includes(cn);
    });
    if (selectedSNC.length === 0) return done(addLog(ctx, '天使シグニ選択なし'));
    // Phase 2 へ: カードを1枚ずつ手札 or エナへ
    const queuePayload = `SNC_DIST:${JSON.stringify(selectedSNC)}`;
    return exec({ type: 'STUB', id: 'SELECT_NO_COMMON_COLOR', value: queuePayload } as StubAction as EffectAction, ctx);
  }
  // INTERNAL_SNC_MOVE_TO_HAND: 指定カードをデッキから手札へ
  if (stub.id === 'INTERNAL_SNC_MOVE_TO_HAND') {
    const cnSMTH = typeof stub.value === 'string' ? stub.value : (ctx.lastProcessedCards?.[0] ?? '');
    if (!cnSMTH) return done(addLog(ctx, '対象カードなし'));
    const diSMTH = ctx.ownerState.deck.indexOf(cnSMTH);
    if (diSMTH < 0) return done(addLog(ctx, `${ctx.cardMap.get(cnSMTH)?.CardName ?? cnSMTH}はデッキにない`));
    const newDeckSMTH = [...ctx.ownerState.deck]; newDeckSMTH.splice(diSMTH, 1);
    const newOwnerSMTH: PlayerState = { ...ctx.ownerState, deck: newDeckSMTH, hand: [...ctx.ownerState.hand, cnSMTH] };
    return done(addLog({ ...ctx, ownerState: newOwnerSMTH },
      `${ctx.cardMap.get(cnSMTH)?.CardName ?? cnSMTH}→手札`));
  }
  // INTERNAL_SNC_MOVE_TO_ENERGY: 指定カードをデッキからエナゾーンへ
  if (stub.id === 'INTERNAL_SNC_MOVE_TO_ENERGY') {
    const cnSMTE = typeof stub.value === 'string' ? stub.value : (ctx.lastProcessedCards?.[0] ?? '');
    if (!cnSMTE) return done(addLog(ctx, '対象カードなし'));
    const diSMTE = ctx.ownerState.deck.indexOf(cnSMTE);
    if (diSMTE < 0) return done(addLog(ctx, `${ctx.cardMap.get(cnSMTE)?.CardName ?? cnSMTE}はデッキにない`));
    const newDeckSMTE = [...ctx.ownerState.deck]; newDeckSMTE.splice(diSMTE, 1);
    const newOwnerSMTE: PlayerState = { ...ctx.ownerState, deck: newDeckSMTE, energy: [...ctx.ownerState.energy, cnSMTE] };
    return done(addLog({ ...ctx, ownerState: newOwnerSMTE },
      `${ctx.cardMap.get(cnSMTE)?.CardName ?? cnSMTE}→エナゾーン`));
  }
  // DISCARD_BY_POWER_MATCH: パワー一致で捨て（ログのみ）
  if (stub.id === 'DISCARD_BY_POWER_MATCH') {
    return done(addLog(ctx, 'パワー一致で捨て（スキップ）'));
  }
  // DECLARE_NUMBER_RANGE: 0〜5の数字宣言（DECLARE_NUMBERと同様だが0を含む）
  if (stub.id === 'DECLARE_NUMBER_RANGE') {
    const setDNR = (n: number): StubAction => ({ type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n });
    const optsDNR = [0, 1, 2, 3, 4, 5].map(n => ({
      id: `dnr_${n}`, label: `${n}を宣言`, action: setDNR(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, '数字を宣言してください（0〜5）'), {
      type: 'CHOOSE', options: optsDNR, count: 1,
    });
  }
  // DECLARE_NUMBER_POWER: パワー値宣言（3000〜15000）→ declared_guard_restrict_level に保存
  if (stub.id === 'DECLARE_NUMBER_POWER') {
    const setDNP = (n: number): StubAction => ({ type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n });
    const optsDNP = [3000, 5000, 7000, 10000, 12000, 15000].map(n => ({
      id: `pwr_${n}`, label: `${n.toLocaleString()}を宣言`, action: setDNP(n) as EffectAction, available: true,
    }));
    return needsInteraction(addLog(ctx, 'パワーを宣言してください'), {
      type: 'CHOOSE', options: optsDNP, count: 1,
    });
  }
  // CONDITIONAL_ALTERNATE_EFFECT: 条件達成時にダウン済みシグニをトラッシュへ（代替効果）
  if (stub.id === 'CONDITIONAL_ALTERNATE_EFFECT') {
    const srcCAE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCAE = srcCAE ? (srcCAE.EffectText ?? '') + ' ' + (srcCAE.BurstText ?? '') : '';
    // 「あなたの場に＜CLASS＞のシグニがある場合、代わりに」パターン
    const classMatchCAE = txtCAE.match(/あなたの場に＜([^＞]+)＞のシグニがある場合[、,]代わりに/);
    const reqClassCAE = classMatchCAE ? classMatchCAE[1] : '';
    const condMetCAE = reqClassCAE
      ? ctx.ownerState.field.signi.some(stack => {
          const cn = stack?.at(-1);
          return cn && (ctx.cardMap.get(cn)?.CardClass ?? '').includes(reqClassCAE);
        })
      : false;
    if (condMetCAE && ctx.lastProcessedCards?.[0]) {
      const targetCAE = ctx.lastProcessedCards[0];
      const removedCAE = removeFromField(targetCAE, ctx.otherState);
      const newOtherCAE: PlayerState = { ...removedCAE, trash: [...removedCAE.trash, targetCAE] };
      return done(addLog({ ...ctx, otherState: newOtherCAE },
        `＜${reqClassCAE}＞あり→${ctx.cardMap.get(targetCAE)?.CardName ?? targetCAE}をトラッシュへ（代替効果）`));
    }
    return done(addLog(ctx, `代替条件未達（${reqClassCAE ? '＜' + reqClassCAE + '＞なし' : '条件解析不可'}）`));
  }
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（ログのみ）
  // TRASH_SPELL_FREE_USE_LIMIT: トラッシュからコスト上限以下のスペルをコストなしで使用
  if (stub.id === 'TRASH_SPELL_FREE_USE_LIMIT') {
    const cnTSFUL = ctx.lastProcessedCards?.[0];
    if (!cnTSFUL) {
      const srcTSFUL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
      const txtTSFUL = srcTSFUL ? (srcTSFUL.EffectText ?? '') + ' ' + (srcTSFUL.BurstText ?? '') : '';
      const toHWTSFUL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      const costLimMTSFUL = txtTSFUL.match(/コストの合計が([０-９\d]+)以下のスペル/);
      const costLimTSFUL = costLimMTSFUL ? parseInt(toHWTSFUL(costLimMTSFUL[1])) : 2;
      const trashSpellsTSFUL = ctx.ownerState.trash.filter(cn => {
        const c = ctx.cardMap.get(cn);
        if (!c || c.Type !== 'スペル') return false;
        const colorCount = (c.Cost ?? '').match(/[赤青緑黒白無]/g)?.length ?? 0;
        return colorCount <= costLimTSFUL;
      });
      if (trashSpellsTSFUL.length === 0) return done(addLog(ctx, `トラッシュにコスト${costLimTSFUL}以下のスペルなし`));
      const contTSFUL: StubAction = { type: 'STUB', id: 'TRASH_SPELL_FREE_USE_LIMIT' };
      return needsInteraction(addLog(ctx, 'トラッシュのスペルを選択（コストなし使用）'), {
        type: 'SELECT_TARGET', candidates: trashSpellsTSFUL, count: 1, optional: false,
        targetScope: 'self_trash', thenAction: contTSFUL as EffectAction,
      });
    }
    const cardTSFUL = ctx.cardMap.get(cnTSFUL);
    if (!cardTSFUL) return done(addLog(ctx, 'TRASH_SPELL_FREE_USE_LIMIT: カードなし'));
    const effectsTSFUL = parseCardEffects(cardTSFUL);
    const mainEffTSFUL = effectsTSFUL.find(e =>
      e.effectType === 'ACTIVATED' || (e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY')));
    if (!mainEffTSFUL) return done(addLog(ctx, `${cardTSFUL.CardName}効果なし`));
    return exec(mainEffTSFUL.action,
      addLog({ ...ctx, sourceCardNum: cnTSFUL, lastProcessedCards: [] },
        `${cardTSFUL.CardName}をトラッシュからコストなしで使用`));
  }
  // UPKEEP_OR_NO_UP: アップキープかアップなし（ログのみ）
  if (stub.id === 'UPKEEP_OR_NO_UP') {
    return done(addLog(ctx, 'アップキープかアップなし'));
  }
  // ACTIVATE_COST_ZERO_BLACK: トラッシュのシグニを選択→次の起動コストを《黒×0》に
  if (stub.id === 'ACTIVATE_COST_ZERO_BLACK') {
    if (!ctx.lastProcessedCards?.length) {
      const trashSigniACZB = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
      if (trashSigniACZB.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし（ACTIVATE_COST_ZERO_BLACK）'));
      const contACZB: StubAction = { type: 'STUB', id: 'ACTIVATE_COST_ZERO_BLACK' };
      return needsInteraction(addLog(ctx, 'コスト0にするシグニを選択（トラッシュから）'), {
        type: 'SELECT_TARGET', candidates: trashSigniACZB, count: 1, optional: false,
        targetScope: 'self_trash', thenAction: contACZB as EffectAction,
      });
    }
    const targetACZB = ctx.lastProcessedCards[0];
    const newOwnerACZB = { ...ctx.ownerState, activate_cost_zero_signi: targetACZB };
    return done(addLog({ ...ctx, ownerState: newOwnerACZB },
      `${ctx.cardMap.get(targetACZB)?.CardName ?? targetACZB}の次の起動コスト→《黒×0》`));
  }
  // BET_CONDITION: ベット条件（ログのみ）
  if (stub.id === 'BET_CONDITION') {
    return done(addLog(ctx, 'ベット条件'));
  }
  // DISABLE_FIRST_ABILITY_ON_ATTACK: アタック時最初の能力を無効化（ログのみ）
  if (stub.id === 'DISABLE_FIRST_ABILITY_ON_ATTACK') {
    return done(addLog(ctx, 'アタック時最初の能力を無効化'));
  }
  // REPLACE_PLUS_N: このターン、相手シグニへの正パワー修正を負に置換
  if (stub.id === 'REPLACE_PLUS_N') {
    const newOwnerRPN: PlayerState = { ...ctx.ownerState, replace_opp_power_plus: true };
    return done(addLog({ ...ctx, ownerState: newOwnerRPN }, 'このターン相手シグニへの+パワー修正を-に置換'));
  }
  // CONDITIONAL_KEYWORD_BY_CENTER_COLOR already handled above
  // === バッチ16: アクセ・公開・汎用選択系 ===
  // GRID_REVEAL_PLUS: このターン、デッキ公開枚数+1フラグを設定
  if (stub.id === 'GRID_REVEAL_PLUS') {
    const newOwnerGRP: PlayerState = { ...ctx.ownerState, grid_reveal_plus_one_this_turn: true };
    return done(addLog({ ...ctx, ownerState: newOwnerGRP }, 'グリッド公開：このターンデッキ公開枚数+1'));
  }
  // MAGIC_BOX_REVEAL: 場のMBを表向きにしてシグニにする（全MBをシグニとして配置）
  if (stub.id === 'MAGIC_BOX_REVEAL') {
    const mbsReveal = ctx.ownerState.field.signi_magic_boxes ?? [null, null, null];
    const newSigniReveal = [...ctx.ownerState.field.signi] as (string[] | null)[];
    const newMBsReveal = [...mbsReveal] as (string | null)[];
    const revealedCards: string[] = [];
    for (let i = 0; i < 3; i++) {
      if (!mbsReveal[i]) continue;
      const mbCard = mbsReveal[i]!;
      const cardData = ctx.cardMap.get(mbCard);
      // 中身がシグニでなければスキップ（例：スペル等は場に出せない）
      if (cardData && cardData.Type !== 'シグニ') continue;
      newSigniReveal[i] = [mbCard];
      newMBsReveal[i] = null;
      revealedCards.push(mbCard);
    }
    if (revealedCards.length === 0) return done(addLog(ctx, 'MBなし（または中身がシグニでない）'));
    const newOwnerReveal: PlayerState = {
      ...ctx.ownerState,
      field: { ...ctx.ownerState.field, signi: newSigniReveal, signi_magic_boxes: newMBsReveal },
    };
    const names = revealedCards.map(c => ctx.cardMap.get(c)?.CardName ?? c).join('、');
    return done(addLog({ ...ctx, ownerState: newOwnerReveal, lastProcessedCards: revealedCards },
      `【マジックボックス】表向き→シグニ：${names}`));
  }
  // ACCE_OP: アクセ操作（汎用ログ）
  if (stub.id === 'ACCE_OP') {
    const acceCountAO = (ctx.ownerState.field.signi_acce ?? []).filter(cn => cn !== null).length;
    return done(addLog(ctx, `アクセ操作（現在${acceCountAO}個のアクセ）`));
  }
  // ACCE_SIGNI_ALL_COLOR: アクセ中のシグニを全色にする
  if (stub.id === 'ACCE_SIGNI_ALL_COLOR') {
    const srcASAC = ctx.sourceCardNum;
    const acceASAC = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const zoneIdxASAC = acceASAC.findIndex(cn => cn === srcASAC);
    if (zoneIdxASAC < 0) return done(addLog(ctx, 'アクセ中のシグニが見つからない'));
    const targetSigniASAC = ctx.ownerState.field.signi[zoneIdxASAC]?.at(-1);
    if (!targetSigniASAC) return done(addLog(ctx, 'アクセ先のシグニがいない'));
    // story_overrides にフラグとして記録（全色付与の意）
    const ovASAC = { ...(ctx.ownerState.story_overrides ?? {}), [targetSigniASAC]: 'ALL_COLOR' };
    const newSASAC: PlayerState = { ...ctx.ownerState, story_overrides: ovASAC };
    return done(addLog({ ...ctx, ownerState: newSASAC },
      `${ctx.cardMap.get(targetSigniASAC)?.CardName ?? targetSigniASAC}が全色を持つ`));
  }
  // TRASH_ACCE_AT_TURN_END: アクセカードをターン終了時にトラッシュ（即座に処理）
  // TRASH_ACCE_AT_TURN_END: このシグニに付いているアクセ1枚をトラッシュへ
  if (stub.id === 'TRASH_ACCE_AT_TURN_END') {
    const srcTATE = ctx.sourceCardNum;
    const zoneIdxTATE = srcTATE
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcTATE)
      : -1;
    const acceTATE = zoneIdxTATE >= 0
      ? (ctx.ownerState.field.signi_acce ?? [null, null, null])[zoneIdxTATE]
      : null;
    if (!acceTATE) return done(addLog(ctx, 'アクセなし（TRASH_ACCE_AT_TURN_END）'));
    const newAcceTATE = [...(ctx.ownerState.field.signi_acce ?? [null, null, null])] as (string | null)[];
    newAcceTATE[zoneIdxTATE] = null;
    const newSTATE: PlayerState = {
      ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, acceTATE],
      field: { ...ctx.ownerState.field, signi_acce: newAcceTATE },
    };
    return done(addLog({ ...ctx, ownerState: newSTATE },
      `${ctx.cardMap.get(acceTATE)?.CardName ?? acceTATE}（アクセ）→トラッシュ`));
  }
  // MULTI_ACCE_LIMIT: アクセを特定枚数に制限（ログのみ）
  if (stub.id === 'MULTI_ACCE_LIMIT') {
    const acceCountMAL = (ctx.ownerState.field.signi_acce ?? []).filter(cn => cn !== null).length;
    return done(addLog(ctx, `マルチアクセ制限（現在${acceCountMAL}個）`));
  }
  // CHOOSE_HAND_CARD: 手札から1枚選択（lastProcessedCardsに設定）
  if (stub.id === 'CHOOSE_HAND_CARD') {
    const handCHC = ctx.ownerState.hand;
    if (handCHC.length === 0) return done(addLog(ctx, '手札なし'));
    const noopCHC: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: handCHC, count: 1, optional: true,
      targetScope: 'self_hand', thenAction: noopCHC as EffectAction,
    });
  }
  // CHOOSE_HAND_OR_ENERGY: デッキ上N枚から任意枚数を手札に加え、残りをエナへ（LOOK_AND_REORDER後）
  if (stub.id === 'CHOOSE_HAND_OR_ENERGY') {
    const srcCHOE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCHOE = srcCHOE ? (srcCHOE.EffectText ?? '') + ' ' + (srcCHOE.BurstText ?? '') : '';
    const toHWCHOE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const countMCHOE = txtCHOE.match(/([０-９\d]+)枚見る/);
    const revealCountCHOE = countMCHOE ? parseInt(toHWCHOE(countMCHOE[1])) : 3;
    const topCardsCHOE = ctx.ownerState.deck.slice(0, revealCountCHOE);
    if (topCardsCHOE.length === 0) return done(addLog(ctx, 'デッキなし（CHOOSE_HAND_OR_ENERGY）'));
    const addToHandCHOE: import('../types/effects').AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(ctx, `デッキ上${topCardsCHOE.length}枚から手札に加えるカードを選択（残りはエナへ）`), {
      type: 'SEARCH', visibleCards: topCardsCHOE, maxPick: topCardsCHOE.length,
      thenAction: addToHandCHOE as EffectAction, restDest: 'energy',
    });
  }
  // INTERNAL_OPP_DECK_TRASH_N: 相手デッキの上からN枚をトラッシュ
  if (stub.id === 'INTERNAL_OPP_DECK_TRASH_N') {
    const cntIODTN = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '4'));
    const trashedIODTN = ctx.otherState.deck.slice(0, cntIODTN);
    const newOtherIODTN: PlayerState = {
      ...ctx.otherState,
      deck: ctx.otherState.deck.slice(cntIODTN),
      trash: [...ctx.otherState.trash, ...trashedIODTN],
    };
    return done(addLog({ ...ctx, otherState: newOtherIODTN }, `相手デッキ上から${trashedIODTN.length}枚トラッシュ`));
  }
  // INTERNAL_ODC_COLOR_CHECK: 色宣言後、lastProcessedCards[0]の色を確認してペナルティ適用
  if (stub.id === 'INTERNAL_ODC_COLOR_CHECK') {
    const declaredColor = typeof stub.value === 'string' ? stub.value : '';
    const targetInstIOCC = ctx.lastProcessedCards?.[0];
    const targetCardIOCC = targetInstIOCC ? ctx.cardMap.get(getCardNum(targetInstIOCC)) : undefined;
    const cardColorIOCC = targetCardIOCC?.Color ?? '';
    const revealName = targetCardIOCC?.CardName ?? targetInstIOCC ?? '?';
    // 宣言色と一致しないか確認（カードの色が宣言を含まない → 対戦相手の全シグニバニッシュ）
    const colorMatchIOCC = cardColorIOCC.includes(declaredColor);
    const logMsg = `公開: ${revealName}（色: ${cardColorIOCC}）/ 宣言: ${declaredColor} → ${colorMatchIOCC ? '一致（ペナルティなし）' : '不一致→相手全シグニバニッシュ'}`;
    if (!colorMatchIOCC) {
      // 相手の全シグニをトラッシュへ
      let newOtherIOCC = ctx.otherState;
      const newSigniIOCC = [...newOtherIOCC.field.signi] as (string[] | null)[];
      const banishedIOCC: string[] = [];
      for (let zi = 0; zi < 3; zi++) {
        const top = newSigniIOCC[zi]?.at(-1);
        if (top) { banishedIOCC.push(top); newSigniIOCC[zi] = null; }
      }
      newOtherIOCC = { ...newOtherIOCC, field: { ...newOtherIOCC.field, signi: newSigniIOCC }, energy: [...newOtherIOCC.energy, ...banishedIOCC] };
      return done(addLog({ ...ctx, otherState: newOtherIOCC }, logMsg));
    }
    return done(addLog(ctx, logMsg));
  }
  // OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 相手が①②から選ぶ
  if (stub.id === 'OPP_DECLARE_CHOICE' || stub.id === 'OPP_CHOOSE_EFFECT' || stub.id === 'OPP_CHOOSES_FOR_YOU') {
    const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
    const toHWODC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 色宣言パターン（ウリス系）: 「対戦相手は《白》《赤》...から１つを宣言する」
    if (txtODC.match(/対戦相手は.*から１つを宣言する/) && txtODC.match(/《白[^》]*》.*《赤[^》]*》/)) {
      const colorList = ['白', '赤', '青', '緑', '黒', '無'];
      const colorOpts = colorList.map(color => ({
        id: `odc_color_${color}`,
        label: `《${color}》を宣言`,
        action: ({ type: 'STUB', id: 'INTERNAL_ODC_COLOR_CHECK', value: color } as StubAction) as EffectAction,
        available: true,
      }));
      return needsInteraction(addLog(ctx, `対戦相手が色を宣言（対象カード: ${ctx.lastProcessedCards?.[0] ? ctx.cardMap.get(getCardNum(ctx.lastProcessedCards[0]))?.CardName ?? '?' : '未選択'}）`), {
        type: 'CHOOSE', options: colorOpts, count: 1, opponentResponds: true,
      });
    }
    // ①②パターンを解析
    const choicePatsODC = [{ m: /①([^②③]+)/, idx: 0 }, { m: /②([^③④]+)/, idx: 1 }];
    const optsODC: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    for (const { m, idx } of choicePatsODC) {
      const mat = txtODC.match(m);
      if (!mat) continue;
      const ctxt = mat[1].replace(/。\s*$/, '').trim();
      let act: EffectAction | null = null;
      // 「対戦相手のデッキの上からN枚トラッシュ」→ 相手（otherState）のデッキをトラッシュ
      if (!act && ctxt.match(/対戦相手のデッキの上からカードを([０-９\d]+)枚トラッシュ/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_OPP_DECK_TRASH_N', value: cnt } as StubAction) as EffectAction;
      }
      // 「デッキの上からN枚トラッシュ」（所有者不明 = 両者）
      if (!act && ctxt.match(/デッキの上からカードを([０-９\d]+)枚トラッシュ/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: cnt } as StubAction) as EffectAction;
      }
      // 「カードをN枚引く」（相手が引く = opponentResponds文脈では自分が引くことが多い）
      if (!act && ctxt.match(/カードを([０-９\d]+)枚引く/)) {
        const cnt = parseInt(toHWODC(ctxt.match(/([０-９\d]+)枚/)![1]));
        act = ({ type: 'DRAW', owner: stub.id === 'OPP_CHOOSE_EFFECT' ? 'opponent' : 'self', count: cnt } as DrawAction) as EffectAction;
      }
      // 「手札からシグニ1枚を場に出す」（対戦相手が出す）
      if (!act && ctxt.match(/手札から.*シグニ.*場に出す/)) {
        act = ({ type: 'ADD_TO_FIELD', owner: 'opponent', source: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as AddToFieldAction) as EffectAction;
      }
      // 「トラッシュからシグニ1枚を手札に加える」
      if (!act && ctxt.match(/トラッシュから.*シグニ.*手札に加える/)) {
        act = ({ type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ' } } } as TransferToHandAction) as EffectAction;
      }
      // 旧フォールバック: 「手札を加える」系
      if (!act && ctxt.match(/手札.+を.+加える/)) act = { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1 } } as TransferToHandAction;
      if (act) optsODC.push({ id: `odc_${idx}`, label: `${'①②'[idx]}${ctxt.slice(0, 20)}...`, action: act, available: true });
    }
    if (optsODC.length > 0) {
      return needsInteraction(addLog(ctx, `対戦相手が選択（${optsODC.length}択）`), {
        type: 'CHOOSE', options: optsODC, count: 1, opponentResponds: true,
      });
    }
    return done(addLog(ctx, `相手選択（解析不可: ${stub.id}）`));
  }
  // DO_THREE_THINGS: 3〜4つの処理を動的解析して実行
  if (stub.id === 'DO_THREE_THINGS') {
    const srcDTT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDTT = srcDTT ? (srcDTT.EffectText ?? '') + ' ' + (srcDTT.BurstText ?? '') : '';
    let ctxDTT = ctx;
    const logsDTT: string[] = [];
    // ①「対戦相手のシグニ1体をトラッシュに置く」
    if (txtDTT.match(/①.*対戦相手のシグニ[１1]体を対象とし.*トラッシュに置く/)) {
      const oppTopSigni = [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).find(cn => !!cn);
      if (oppTopSigni) {
        const removedDTT = removeFromField(oppTopSigni, ctxDTT.otherState);
        ctxDTT = { ...ctxDTT, otherState: { ...removedDTT, trash: [...removedDTT.trash, oppTopSigni] } };
        logsDTT.push(`①${ctx.cardMap.get(oppTopSigni)?.CardName ?? oppTopSigni}をトラッシュへ`);
      }
    }
    // ②「対戦相手のライフクロス1枚をトラッシュに置く」
    if (txtDTT.match(/②.*ライフクロス[１1]枚をトラッシュに置く/)) {
      const life = ctxDTT.otherState.life_cloth;
      if (life.length > 0) {
        const top = life[life.length - 1];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          life_cloth: life.slice(0,-1),
          trash: [...ctxDTT.otherState.trash, top],
        }};
        logsDTT.push(`②ライフクロス(${ctx.cardMap.get(top)?.CardName ?? top})をトラッシュへ`);
      }
    }
    // ③「対戦相手のエナゾーンからカード1枚をトラッシュに置く」
    if (txtDTT.match(/③.*エナゾーンからカード[１1]枚を対象とし.*トラッシュに置く/)) {
      const oppEna = ctxDTT.otherState.energy;
      if (oppEna.length > 0) {
        const picked = oppEna[0];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          energy: oppEna.slice(1),
          trash: [...ctxDTT.otherState.trash, picked],
        }};
        logsDTT.push(`③エナ(${ctx.cardMap.get(picked)?.CardName ?? picked})をトラッシュへ`);
      }
    }
    // ④「対戦相手のセンタールリグの下のカード1枚をルリグトラッシュに置く」
    if (txtDTT.match(/④.*センタールリグの下にあるカード[１1]枚を対象とし.*ルリグトラッシュに置く/)) {
      const oppLrigStack = ctxDTT.otherState.field.lrig;
      if (oppLrigStack.length > 1) {
        const under = oppLrigStack[oppLrigStack.length - 2];
        const newLrigDTT = [...oppLrigStack.slice(0,-1).slice(0,-1), oppLrigStack[oppLrigStack.length - 1]];
        ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
          field: { ...ctxDTT.otherState.field, lrig: newLrigDTT },
          lrig_trash: [...ctxDTT.otherState.lrig_trash, under],
        }};
        logsDTT.push(`④${ctx.cardMap.get(under)?.CardName ?? under}をルリグトラッシュへ`);
      }
    }
    // 「対戦相手の全ルリグとシグニをダウンし凍結する」
    if (txtDTT.match(/①.*(?:すべてのルリグとシグニ|全.*ルリグ.*シグニ)をダウンし凍結する/)) {
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field,
          signi_down: [true, true, true],
          signi_frozen: [true, true, true],
          lrig_down: true,
          lrig_frozen: true,
        },
      }};
      logsDTT.push('①全シグニ・ルリグをダウン+凍結');
    }
    // 「全相手シグニが能力を失う（次ターン終了まで）」
    if (txtDTT.match(/②.*すべてのシグニは能力を失う/)) {
      const oppAllSigniDTT = [0,1,2].map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1)).filter((c): c is string => !!c);
      const abRemovedDTT = [...new Set([...(ctxDTT.otherState.abilities_removed ?? []), ...oppAllSigniDTT])];
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState, abilities_removed: abRemovedDTT } };
      logsDTT.push(`②全${oppAllSigniDTT.length}体の能力を消去`);
    }
    // 「①カードをN枚引く」
    if (!logsDTT.length) {
      const drawDTT = txtDTT.match(/①.*カードを([０-９\d]+)枚引く/);
      if (drawDTT) {
        const toHWD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const n = parseInt(toHWD(drawDTT[1]));
        const canDraw = Math.min(n, ctxDTT.ownerState.deck.length);
        const newOwnerDraw = { ...ctxDTT.ownerState,
          hand: [...ctxDTT.ownerState.hand, ...ctxDTT.ownerState.deck.slice(0, canDraw)],
          deck: ctxDTT.ownerState.deck.slice(canDraw),
        };
        ctxDTT = { ...ctxDTT, ownerState: newOwnerDraw };
        logsDTT.push(`①${n}枚ドロー`);
      }
    }
    // 「①相手センタールリグをダウンする」
    if (!logsDTT.length && txtDTT.match(/①.*(?:センタールリグ|対戦相手のルリグ)[１1]体を対象とし.*ダウン/)) {
      ctxDTT = { ...ctxDTT, otherState: { ...ctxDTT.otherState,
        field: { ...ctxDTT.otherState.field, lrig_down: true },
      }};
      logsDTT.push('①相手ルリグをダウン');
    }
    // 「①対戦相手のシグニ1体にアタック禁止」→ SELECT_TARGET が必要なためインタラクション
    if (!logsDTT.length && txtDTT.match(/①.*対戦相手のシグニ[１1]体を対象.*アタックできない/)) {
      const oppSigniDTT = [0,1,2]
        .map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => !!cn);
      if (oppSigniDTT.length > 0) {
        const blockStub: StubAction = { type: 'STUB', id: 'INTERNAL_BLOCK_ATTACK_THIS_TURN' };
        return needsInteraction(addLog(ctxDTT, 'ターン終了時まで「アタックできない」シグニを選択'), {
          type: 'SELECT_TARGET', candidates: oppSigniDTT, count: 1, optional: false,
          targetScope: 'opp_field', thenAction: blockStub as EffectAction,
        });
      }
    }
    // 「①パワーN以下の相手シグニをバニッシュ」
    if (!logsDTT.length) {
      const banishPwrM = txtDTT.match(/①.*パワー([０-９\d万]+)以下.*バニッシュ/);
      if (banishPwrM) {
        const toHWB = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace('万','0000');
        const maxPwr = parseInt(toHWB(banishPwrM[1]));
        const bCands = [0,1,2]
          .map(zi => ctxDTT.otherState.field.signi[zi]?.at(-1))
          .filter((cn): cn is string => {
            if (!cn) return false;
            // 実効パワー優先・Power「∞」はInfinity扱い（「パワーN以下」の対象にしない）
            const ep = ctx.effectivePowers;
            const raw = ctx.cardMap.get(cn)?.Power;
            const pw = (ep instanceof Map ? ep.get(cn) : (ep as Record<string, number> | undefined)?.[cn])
              ?? (raw === '∞' ? Infinity : parseInt(raw ?? '99999'));
            return pw <= maxPwr;
          });
        if (bCands.length > 0) {
          const banishAct: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
          return selectOrInteract(bCands, 1, false, 'opp_field', banishAct as EffectAction, undefined, ctxDTT);
        }
        return done(addLog(ctxDTT, `①バニッシュ対象なし（パワー${maxPwr}以下の相手シグニ不在）`));
      }
    }
    if (logsDTT.length > 0) return done(addLog(ctxDTT, logsDTT.join(' / ')));
    return done(addLog(ctx, '3つの処理（個別解析不可）'));
  }
  // DRAW_IF_CHARGED_CLASS: 直前のエナチャージで＜クラス＞のシグニが置かれた場合1ドロー（WDK07-E01）
  if (stub.id === 'DRAW_IF_CHARGED_CLASS') {
    const srcDICC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const clsDICC = (srcDICC?.EffectText ?? '').match(/この方法で＜([^＞]+)＞のシグニ/)?.[1];
    const lastEnaDICC = ctx.ownerState.energy.at(-1);
    const cardDICC = lastEnaDICC ? ctx.cardMap.get(getCardNum(lastEnaDICC)) : undefined;
    const hitDICC = !!cardDICC && cardDICC.Type === 'シグニ'
      && (!clsDICC || (cardDICC.CardClass ?? '').includes(clsDICC));
    if (!hitDICC) return done(addLog(ctx, `エナに置かれたのは＜${clsDICC ?? '?'}＞のシグニではない→ドローなし`));
    const deckDICC = ctx.ownerState.deck;
    if (deckDICC.length === 0) return done(ctx);
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState,
      hand: [...ctx.ownerState.hand, deckDICC[0]], deck: deckDICC.slice(1) } },
      `＜${clsDICC}＞のシグニをチャージ→1枚ドロー`));
  }
  // HAND_EXCESS_TO_ENERGY: 手札がN枚（value、既定5）より多い場合、差分を手札からエナゾーンへ（WDK08-Y08）
  if (stub.id === 'HAND_EXCESS_TO_ENERGY') {
    const limitHETE = typeof stub.value === 'number' ? stub.value : 5;
    const excessHETE = ctx.ownerState.hand.length - limitHETE;
    if (excessHETE <= 0) return done(addLog(ctx, `手札${limitHETE}枚以下のため移動なし`));
    const chargeHETE = { type: 'ENERGY_CHARGE',
      target: { type: 'HAND_CARD', owner: 'self', count: excessHETE } } as unknown as EffectAction;
    return exec(chargeHETE, ctx);
  }
  // DRAW_UNTIL_HAND_SIZE: 手札がN枚（value、既定6）になるまで引く
  if (stub.id === 'DRAW_UNTIL_HAND_SIZE') {
    const targetNDUHS = typeof stub.value === 'number' ? stub.value : 6;
    const needDUHS = Math.max(0, targetNDUHS - ctx.ownerState.hand.length);
    if (needDUHS === 0) return done(addLog(ctx, `手札${targetNDUHS}枚以上のためドローなし`));
    const canDrawDUHS = Math.min(needDUHS, ctx.ownerState.deck.length);
    const newOwnerDUHS = { ...ctx.ownerState,
      hand: [...ctx.ownerState.hand, ...ctx.ownerState.deck.slice(0, canDrawDUHS)],
      deck: ctx.ownerState.deck.slice(canDrawDUHS) };
    return done(addLog({ ...ctx, ownerState: newOwnerDUHS }, `${canDrawDUHS}枚ドロー（手札${targetNDUHS}枚まで）`));
  }
  // CONDITIONAL_MULTI_CHOOSE_BY_CENTER: センタールリグによる複数選択
  if (stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER') {
    const srcCMCBC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCMCBC = srcCMCBC ? (srcCMCBC.EffectText ?? '') + ' ' + (srcCMCBC.BurstText ?? '') : '';
    const toHWCMCBC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // ベース選択数「以下のN つから M つ(まで)選ぶ」
    const baseCountM = txtCMCBC.match(/以下の[２-９\d２-９]つから([２-９\d１1])つ(?:まで)?選ぶ/);
    const baseCount = baseCountM ? parseInt(toHWCMCBC(baseCountM[1])) : 1;
    // センタールリグ条件チェック
    const centerCondM = txtCMCBC.match(/センタールリグが(.+?)の場合/);
    let condMetCMCBC = !centerCondM; // 条件なしなら常にtrue
    if (centerCondM) {
      const reqNames = centerCondM[1].trim().split(/か|と/).map(s => s.trim()).filter(Boolean);
      const centerTop = ctx.ownerState.field.lrig.at(-1);
      const centerCard = centerTop ? ctx.cardMap.get(centerTop) : undefined;
      const centerName = centerCard?.CardName ?? '';
      const runtimeAliases = ctx.ownerState.lrig_name_aliases ?? [];
      const hasAllNames = runtimeAliases.includes(LRIG_ALL_NAMES_SENTINEL);
      const aliases = [centerName, ...runtimeAliases.filter(a => a !== LRIG_ALL_NAMES_SENTINEL)];
      condMetCMCBC = hasAllNames || reqNames.some(rn => aliases.some(a => a.includes(rn) || rn.includes(a)));
    }
    // 選択数: 条件達成なら"代わりにNつまで"、未達成はベース数
    const enhCountM = txtCMCBC.match(/代わりに([２-９\d])つまで選ぶ/);
    const maxChooseCount = condMetCMCBC && enhCountM ? parseInt(toHWCMCBC(enhCountM[1])) : baseCount;
    // 各選択肢（①②③④）を解析してCHOOSEオプション生成（choiceTextParserに共通化）
    const optionsCMCBC = parseChoiceOptionsFromText(txtCMCBC, 'choice');
    if (optionsCMCBC.length > 0) {
      const condLogCMCBC = centerCondM
        ? `（${condMetCMCBC ? '条件達成' : 'ベース選択'}：最大${maxChooseCount}択）`
        : `（最大${maxChooseCount}択）`;
      return needsInteraction(addLog(ctx, `効果を最大${maxChooseCount}つ選択してください${condLogCMCBC}`), {
        type: 'CHOOSE', options: optionsCMCBC, count: maxChooseCount,
      });
    }
    const centerCMCBC2 = ctx.ownerState.field.lrig.at(-1);
    const centerCardCMCBC2 = centerCMCBC2 ? ctx.cardMap.get(centerCMCBC2) : undefined;
    return done(addLog(ctx, `センター（${centerCardCMCBC2?.CardName ?? 'なし'}）による複数選択（解析不可）`));
  }
  // INTERNAL_DOWN_AND_FREEZE_OPP: 相手シグニ1体をダウン+全シグニを凍結
  if (stub.id === 'INTERNAL_DOWN_AND_FREEZE_OPP') {
    const downCandsDFO = ctx.otherState.field.signi.flatMap((s, zi) => s?.at(-1) ? [{ cn: s.at(-1)!, zi }] : []);
    if (downCandsDFO.length === 0) return done(addLog(ctx, '相手シグニなし'));
    // 1体ダウン（最初の1体、インタラクティブ選択は省略）
    const targetDFO = downCandsDFO[0];
    const newDownDFO = [...(ctx.otherState.field.signi_down ?? [false, false, false])];
    newDownDFO[targetDFO.zi] = true;
    // 全シグニ凍結
    const newFrozenDFO = [true, true, true];
    const newOtherDFO = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_down: newDownDFO, signi_frozen: newFrozenDFO } };
    return done(addLog({ ...ctx, otherState: newOtherDFO },
      `${ctx.cardMap.get(targetDFO.cn)?.CardName ?? targetDFO.cn}をダウン + 全シグニ凍結`));
  }
  // INTERNAL_BANISH_OPP_POWER_GTE: 相手のパワーN以上のシグニ1体をバニッシュ
  if (stub.id === 'INTERNAL_BANISH_OPP_POWER_GTE') {
    const minPwr = typeof stub.value === 'number' ? stub.value : 0;
    const candsBOPG = ctx.otherState.field.signi.flatMap((s, zi) => {
      const top = s?.at(-1);
      if (!top) return [];
      const ep = ctx.effectivePowers;
      // Power「∞」はInfinity扱い（「パワーN以上」の対象に含める）
      const rawBOPG = ctx.cardMap.get(top)?.Power;
      const pwr = (ep instanceof Map ? ep.get(top) : (ep as Record<string, number> | undefined)?.[top])
        ?? (rawBOPG === '∞' ? Infinity : parseInt(rawBOPG ?? '0'));
      return pwr >= minPwr ? [{ cn: top, zi }] : [];
    });
    if (candsBOPG.length === 0) return done(addLog(ctx, `パワー${minPwr}以上の相手シグニなし`));
    const banishAct: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { powerRange: { min: minPwr } } } };
    return exec(banishAct as EffectAction, ctx);
  }
  // REVEAL_TOP_BANISH_BY_LEVEL_SUM: デッキ上N枚公開→公開シグニのレベル合計×1000以下の相手シグニをバニッシュ→公開カードをトラッシュ（WX17-028）
  if (stub.id === 'REVEAL_TOP_BANISH_BY_LEVEL_SUM') {
    const srcRTBLS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTBLS = srcRTBLS ? (srcRTBLS.EffectText ?? '') : '';
    const cntMRTBLS = txtRTBLS.match(/デッキの上からカードを([１-９1-9])枚公開/);
    const nRTBLS = cntMRTBLS ? parseInt(cntMRTBLS[1].replace(/[１-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))) : 4;
    const revealedRTBLS = ctx.ownerState.deck.slice(0, nRTBLS);
    if (revealedRTBLS.length === 0) return done(addLog(ctx, 'デッキが空（公開不可）'));
    const levelSumRTBLS = revealedRTBLS.reduce((s, cn) => {
      const c = ctx.cardMap.get(cn);
      return s + (c?.Type === 'シグニ' ? (parseInt(c.Level ?? '0') || 0) : 0);
    }, 0);
    const maxPwrRTBLS = levelSumRTBLS * 1000;
    const namesRTBLS = revealedRTBLS.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    const newOwnerRTBLS: PlayerState = {
      ...ctx.ownerState,
      deck: ctx.ownerState.deck.slice(revealedRTBLS.length),
      trash: [...ctx.ownerState.trash, ...revealedRTBLS],
    };
    const curRTBLS = addLog({ ...ctx, ownerState: newOwnerRTBLS },
      `デッキ上${revealedRTBLS.length}枚公開: ${namesRTBLS}（シグニレベル合計${levelSumRTBLS}）→トラッシュ`);
    if (maxPwrRTBLS <= 0) return done(curRTBLS);
    const banishRTBLS: BanishAction = {
      type: 'BANISH',
      target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { powerRange: { max: maxPwrRTBLS } }, upToCount: true },
    };
    return exec(banishRTBLS as EffectAction, curRTBLS);
  }
  // INTERNAL_BANISH_ALL_POWER_GTE: パワーN以上のすべてのシグニ（両プレイヤー）をバニッシュ
  if (stub.id === 'INTERNAL_BANISH_ALL_POWER_GTE') {
    const minPwrBAPG = typeof stub.value === 'number' ? stub.value : 0;
    const banishSeqBAPG: SequenceAction = {
      type: 'SEQUENCE', steps: [
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { powerRange: { min: minPwrBAPG } } } } as BanishAction,
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { powerRange: { min: minPwrBAPG } } } } as BanishAction,
      ],
    };
    return exec(banishSeqBAPG as EffectAction, addLog(ctx, `パワー${minPwrBAPG}以上のすべてのシグニをバニッシュ`));
  }
  // INTERNAL_FREEZE_OPP_LRIG: 相手センタールリグを凍結（ダウン+凍結状態）
  if (stub.id === 'INTERNAL_FREEZE_OPP_LRIG') {
    const newOtherFOL: PlayerState = {
      ...ctx.otherState,
      field: { ...ctx.otherState.field, lrig_down: true, lrig_frozen: true },
    };
    return done(addLog({ ...ctx, otherState: newOtherFOL }, '対戦相手のセンタールリグを凍結'));
  }
  // INTERNAL_TRASH_SIGNI_TO_HAND: トラッシュからシグニ1枚を手札へ（CONDITIONAL_MULTI_CHOOSE系）
  if (stub.id === 'INTERNAL_TRASH_SIGNI_TO_HAND') {
    const signiTrashTSTH = ctx.ownerState.trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
    if (signiTrashTSTH.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし'));
    const addHandTSTH: AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
    return needsInteraction(addLog(ctx, 'トラッシュからシグニを手札に加える'), {
      type: 'SEARCH', visibleCards: signiTrashTSTH, maxPick: 1, thenAction: addHandTSTH as EffectAction,
    });
  }
  // INTERNAL_DRAW_PER_CENTER_LEVEL: センタールリグのレベル1につき1ドロー
  if (stub.id === 'INTERNAL_DRAW_PER_CENTER_LEVEL') {
    const lrigCnDPCL = ctx.ownerState.field.lrig.at(-1);
    const lvDPCL = lrigCnDPCL ? (parseInt(ctx.cardMap.get(lrigCnDPCL)?.Level ?? '0') || 0) : 0;
    if (lvDPCL <= 0) return done(addLog(ctx, 'センタールリグなし'));
    const sDPCL = ctx.ownerState;
    const canDPCL = Math.min(lvDPCL, sDPCL.deck.length);
    const newSDPCL: PlayerState = { ...sDPCL, hand: [...sDPCL.hand, ...sDPCL.deck.slice(0, canDPCL)], deck: sDPCL.deck.slice(canDPCL) };
    return done(addLog({ ...ctx, ownerState: newSDPCL }, `ルリグレベル${lvDPCL}→${canDPCL}枚ドロー`));
  }
  // INTERNAL_CHARGE_PER_CENTER_LEVEL: センタールリグのレベル1につきエナチャージ1
  if (stub.id === 'INTERNAL_CHARGE_PER_CENTER_LEVEL') {
    const lrigCnCPCL = ctx.ownerState.field.lrig.at(-1);
    const lvCPCL = lrigCnCPCL ? (parseInt(ctx.cardMap.get(lrigCnCPCL)?.Level ?? '0') || 0) : 0;
    if (lvCPCL <= 0) return done(addLog(ctx, 'センタールリグなし'));
    const sCPCL = ctx.ownerState;
    const tookCPCL = sCPCL.deck.slice(0, Math.min(lvCPCL, sCPCL.deck.length));
    const newSCPCL: PlayerState = { ...sCPCL, deck: sCPCL.deck.slice(tookCPCL.length), energy: [...sCPCL.energy, ...tookCPCL] };
    return done(addLog({ ...ctx, ownerState: newSCPCL }, `ルリグレベル${lvCPCL}→エナチャージ${tookCPCL.length}`));
  }
  // INTERNAL_DECK_TRASH_BOTH: 両プレイヤーのデッキ上N枚をトラッシュ
  if (stub.id === 'INTERNAL_DECK_TRASH_BOTH') {
    const cntIDTB = typeof stub.value === 'number' ? stub.value : 7;
    const selfDeckIDTB = ctx.ownerState.deck;
    const oppDeckIDTB = ctx.otherState.deck;
    const selfTrashIDTB = selfDeckIDTB.slice(0, Math.min(cntIDTB, selfDeckIDTB.length));
    const oppTrashIDTB = oppDeckIDTB.slice(0, Math.min(cntIDTB, oppDeckIDTB.length));
    const newOwnerIDTB: PlayerState = { ...ctx.ownerState, deck: selfDeckIDTB.slice(selfTrashIDTB.length), trash: [...ctx.ownerState.trash, ...selfTrashIDTB] };
    const newOtherIDTB: PlayerState = { ...ctx.otherState, deck: oppDeckIDTB.slice(oppTrashIDTB.length), trash: [...ctx.otherState.trash, ...oppTrashIDTB] };
    return done(addLog({ ...ctx, ownerState: newOwnerIDTB, otherState: newOtherIDTB },
      `各プレイヤーデッキ上${cntIDTB}枚トラッシュ`));
  }
  // INTERNAL_POWER_MOD_OPP_ONE: 相手の1体にパワー修正
  if (stub.id === 'INTERNAL_POWER_MOD_OPP_ONE') {
    const deltaIPMOO = typeof stub.value === 'number' ? stub.value : -12000;
    const targetIPMOO = ctx.lastProcessedCards?.[0]
      ?? [0,1,2].map(zi => ctx.otherState.field.signi[zi]?.at(-1)).find(c => !!c);
    if (!targetIPMOO) return done(addLog(ctx, '対象なし'));
    const modsIPMOO = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetIPMOO, delta: deltaIPMOO }];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: modsIPMOO } },
      `${ctx.cardMap.get(targetIPMOO)?.CardName ?? targetIPMOO}パワー${deltaIPMOO}`));
  }
  // INTERNAL_BANISH_OPP_POWER_LTE: パワーN以下の相手シグニをバニッシュ（対象選択）
  if (stub.id === 'INTERNAL_BANISH_OPP_POWER_LTE') {
    const maxPwrIBOPL = typeof stub.value === 'number' ? stub.value : 7000;
    const candsIBOPL = [0,1,2]
      .map(zi => ctx.otherState.field.signi[zi]?.at(-1))
      .filter((cn): cn is string => {
        if (!cn) return false;
        // 実効パワー優先・Power「∞」はInfinity扱い（「パワーN以下」の対象にしない）
        const ep = ctx.effectivePowers;
        const raw = ctx.cardMap.get(cn)?.Power;
        const pw = (ep instanceof Map ? ep.get(cn) : (ep as Record<string, number> | undefined)?.[cn])
          ?? (raw === '∞' ? Infinity : parseInt(raw ?? '99999'));
        return pw <= maxPwrIBOPL;
      });
    if (candsIBOPL.length === 0) return done(addLog(ctx, `バニッシュ対象なし（パワー${maxPwrIBOPL}以下）`));
    const banishIBOPL: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
    return selectOrInteract(candsIBOPL, 1, false, 'opp_field', banishIBOPL as EffectAction, undefined, ctx);
  }
  // SUMMON_FROM_ENERGY: エナゾーンからシグニを場に出す（シグニ限定）
  // REVEAL_TOP_LEVEL_ROUTE: デッキの一番上を公開しシグニのレベル別効果を実行（WX12-CB02）
  // Lv1:自パワー+5000 / Lv2:エナチャージ1 / Lv3:ランサー付与 / Lv4:1ドロー / Lv5:相手シグニバニッシュ
  if (stub.id === 'REVEAL_TOP_LEVEL_ROUTE') {
    const topRTLR = ctx.ownerState.deck[0];
    if (!topRTLR) return done(addLog(ctx, 'デッキが空（公開不可）'));
    const cardRTLR = ctx.cardMap.get(topRTLR);
    const isSigniRTLR = cardRTLR?.Type === 'シグニ';
    const lvRTLR = isSigniRTLR ? (parseInt(cardRTLR?.Level ?? '0') || 0) : 0;
    const curRTLR = addLog(ctx, `デッキトップ公開: ${cardRTLR?.CardName ?? topRTLR}（${isSigniRTLR ? `レベル${lvRTLR}` : 'シグニ以外'}）`);
    if (!isSigniRTLR) return done(curRTLR);
    if (lvRTLR === 1 && ctx.sourceCardNum) {
      const modsRTLR = [...(curRTLR.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: 5000 }];
      return done(addLog({ ...curRTLR, ownerState: { ...curRTLR.ownerState, temp_power_mods: modsRTLR } }, 'このシグニのパワー＋5000'));
    }
    if (lvRTLR === 2) return exec({ type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } as EffectAction, curRTLR);
    if (lvRTLR === 3 && ctx.sourceCardNum) {
      const grantsRTLR = { ...(curRTLR.ownerState.keyword_grants ?? {}) };
      grantsRTLR[ctx.sourceCardNum] = [...new Set([...(grantsRTLR[ctx.sourceCardNum] ?? []), 'ランサー'])];
      return done(addLog({ ...curRTLR, ownerState: { ...curRTLR.ownerState, keyword_grants: grantsRTLR } }, 'このシグニは【ランサー】を得る'));
    }
    if (lvRTLR === 4) return exec({ type: 'DRAW', owner: 'self', count: 1 } as EffectAction, curRTLR);
    if (lvRTLR === 5) {
      return exec({ type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } } as BanishAction as EffectAction, curRTLR);
    }
    return done(curRTLR);
  }
  // SUMMON_RESONA_FROM_LRIG_DECK: ルリグデッキからレゾナ1枚を出現条件を無視して場に出す（WX20-069等）
  if (stub.id === 'SUMMON_RESONA_FROM_LRIG_DECK') {
    const srcSRLD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSRLD = srcSRLD ? (srcSRLD.EffectText ?? '') : '';
    const classMSRLD = txtSRLD.match(/ルリグデッキから＜([^＞]+)＞のレゾナ/);
    const clsSRLD = classMSRLD ? classMSRLD[1] : '';
    const candsSRLD = (ctx.ownerState.lrig_deck ?? []).filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== 'レゾナ') return false;
      return !clsSRLD || (c.CardClass ?? '').includes(clsSRLD);
    });
    if (candsSRLD.length === 0) return done(addLog(ctx, 'ルリグデッキにレゾナなし'));
    const ziSRLD = ctx.ownerState.field.signi.findIndex(z => !z || z.length === 0);
    if (ziSRLD < 0) return done(addLog(ctx, '空きシグニゾーンなし（レゾナ配置不可）'));
    const pickSRLD = candsSRLD[0];
    const newSigniSRLD = ctx.ownerState.field.signi.map((z, i) => (i === ziSRLD ? [...(z ?? []), pickSRLD] : z));
    const newOwnerSRLD: PlayerState = {
      ...ctx.ownerState,
      lrig_deck: (ctx.ownerState.lrig_deck ?? []).filter(n => n !== pickSRLD),
      field: { ...ctx.ownerState.field, signi: newSigniSRLD },
    };
    return done(addLog({ ...ctx, ownerState: newOwnerSRLD },
      `${ctx.cardMap.get(pickSRLD)?.CardName ?? pickSRLD}を出現条件を無視して場に出す`));
  }
  // SUMMON_FROM_TRASH: トラッシュからシグニ1枚を場に出す（choiceTextParser選択肢から使用）
  if (stub.id === 'SUMMON_FROM_TRASH') {
    const srcSFT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSFT = srcSFT ? (srcSFT.EffectText ?? '') : '';
    const lvMSFT = txtSFT.match(/トラッシュから.*レベル([０-９\d]+)以下の.*シグニ/);
    const maxLvSFT = lvMSFT ? parseInt(lvMSFT[1].replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))) : 99;
    const signiInTrashSFT = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== 'シグニ') return false;
      return (parseInt(c.Level ?? '0') || 0) <= maxLvSFT;
    });
    if (signiInTrashSFT.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし'));
    const addFieldSFT: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    return selectOrInteract(signiInTrashSFT, 1, false, 'self_trash', addFieldSFT as EffectAction, undefined, ctx);
  }
  if (stub.id === 'SUMMON_FROM_ENERGY') {
    const srcSFE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSFE = srcSFE ? (srcSFE.EffectText ?? '') : '';
    const lvMSFE = txtSFE.match(/レベル([０-９\d]+)以下の/);
    const toHWSFE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const maxLvSFE = lvMSFE ? parseInt(toHWSFE(lvMSFE[1])) : 99;
    const signiInEnaSFE = ctx.ownerState.energy.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (!c || c.Type !== 'シグニ') return false;
      return parseInt(c.Level ?? '0') <= maxLvSFE;
    });
    if (signiInEnaSFE.length === 0) return done(addLog(ctx, 'エナゾーンにシグニなし'));
    const addFieldAct: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
    return selectOrInteract(signiInEnaSFE, 1, false, 'self_energy', addFieldAct as EffectAction, undefined, ctx);
  }
  // INTERNAL_DISCARD_ALL_DRAW_N: 手札をすべて捨てN枚引く
  if (stub.id === 'INTERNAL_DISCARD_ALL_DRAW_N') {
    const drawNIDADN = typeof stub.value === 'number' ? stub.value : 4;
    const newOwnerIDADN = { ...ctx.ownerState,
      trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand],
      hand: [],
    };
    const canDraw = Math.min(drawNIDADN, newOwnerIDADN.deck.length);
    const finalOwner = { ...newOwnerIDADN,
      hand: newOwnerIDADN.deck.slice(0, canDraw),
      deck: newOwnerIDADN.deck.slice(canDraw),
    };
    return done(addLog({ ...ctx, ownerState: finalOwner }, `手札すべて捨て→${drawNIDADN}枚ドロー`));
  }
  // INTERNAL_DECK_BOTTOM_SUMMON: デッキ下1枚トラッシュ→シグニなら場に出す
  if (stub.id === 'INTERNAL_DECK_BOTTOM_SUMMON') {
    const deck = ctx.ownerState.deck;
    if (deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const bottom = deck[deck.length - 1];
    const newDeck = deck.slice(0, -1);
    const card = ctx.cardMap.get(bottom);
    const newOwner = { ...ctx.ownerState, deck: newDeck, trash: [...ctx.ownerState.trash, bottom] };
    const ctxIDBSM = addLog({ ...ctx, ownerState: newOwner }, `デッキ下(${card?.CardName ?? bottom})をトラッシュへ`);
    if (card?.Type === 'シグニ') {
      const addField: AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
      return exec(addField as EffectAction, { ...ctxIDBSM, lastProcessedCards: [bottom] });
    }
    return done(ctxIDBSM);
  }
  // INTERNAL_DECK_BOTTOM_LEVEL_DOWN: デッキ下1枚トラッシュ→シグニなら同レベル相手シグニをダウン
  if (stub.id === 'INTERNAL_DECK_BOTTOM_LEVEL_DOWN') {
    const deckIDBLD = ctx.ownerState.deck;
    if (deckIDBLD.length === 0) return done(addLog(ctx, 'デッキなし'));
    const bottomIDBLD = deckIDBLD[deckIDBLD.length - 1];
    const bottomCard = ctx.cardMap.get(bottomIDBLD);
    const newDeckIDBLD = deckIDBLD.slice(0, -1);
    const newOwnerIDBLD = { ...ctx.ownerState, deck: newDeckIDBLD, trash: [...ctx.ownerState.trash, bottomIDBLD] };
    let ctxIDBLD = addLog({ ...ctx, ownerState: newOwnerIDBLD }, `デッキ下(${bottomCard?.CardName ?? bottomIDBLD})をトラッシュへ`);
    if (bottomCard?.Type === 'シグニ') {
      const lv = parseInt(bottomCard.Level ?? '0');
      const targets = [0,1,2].map(zi => ctxIDBLD.otherState.field.signi[zi]?.at(-1))
        .filter((cn): cn is string => {
          if (!cn) return false;
          return parseInt(ctx.cardMap.get(cn)?.Level ?? '-1') === lv;
        });
      const newDown = [...(ctxIDBLD.otherState.field.signi_down ?? [false,false,false])];
      for (let zi = 0; zi < 3; zi++) {
        if (targets.includes(ctxIDBLD.otherState.field.signi[zi]?.at(-1) ?? '')) newDown[zi] = true;
      }
      ctxIDBLD = addLog({ ...ctxIDBLD, otherState: { ...ctxIDBLD.otherState, field: { ...ctxIDBLD.otherState.field, signi_down: newDown } } },
        `同レベル(${lv})の相手シグニ${targets.length}体をダウン`);
    }
    return done(ctxIDBLD);
  }
  // INTERNAL_BLOCK_ATTACK_THIS_TURN: 対象がアタックできない
  // 発動者（ownerState）の keyword_grants に格納する。相手ターン開始の UPフェイズで
  // otherState.keyword_grants がリセットされても情報が失われないようにするため。
  if (stub.id === 'INTERNAL_BLOCK_ATTACK_THIS_TURN') {
    const targetIBAC = ctx.lastProcessedCards?.[0];
    if (!targetIBAC) return done(addLog(ctx, '対象なし'));
    const grantsIBAC = { ...(ctx.ownerState.keyword_grants ?? {}) };
    grantsIBAC[targetIBAC] = [...new Set([...(grantsIBAC[targetIBAC] ?? []), 'アタックできない'])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, keyword_grants: grantsIBAC } },
      `${ctx.cardMap.get(targetIBAC)?.CardName ?? targetIBAC}はアタックできない`));
  }
  // DOWN_UP_SIGNI_AND_CHOOSE: シグニをダウン/アップして選択
  // DOWN_UP_SIGNI_AND_CHOOSE: アップ状態の特定クラスシグニを好きな数ダウン（コスト軽減素材）
  if (stub.id === 'DOWN_UP_SIGNI_AND_CHOOSE') {
    const srcDUSC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDUSC = srcDUSC ? (srcDUSC.EffectText ?? '') + ' ' + (srcDUSC.BurstText ?? '') : '';
    // 対象クラスを抽出（「アップ状態の＜クラス＞のシグニ」）
    const classM = txtDUSC.match(/アップ状態の＜([^＞]+)＞のシグニ/);
    const targetClass = classM ? classM[1] : null;
    // UP状態の対象クラスシグニを収集
    const upSigniDUSC = [0, 1, 2].flatMap(zi => {
      const top = ctx.ownerState.field.signi[zi]?.at(-1);
      const isDown = ctx.ownerState.field.signi_down?.[zi] ?? false;
      if (!top || isDown) return [];
      const card = ctx.cardMap.get(top);
      if (targetClass && !card?.CardClass?.includes(targetClass)) return [];
      return [{ cn: top, zi }];
    });
    if (upSigniDUSC.length === 0) {
      return done(addLog(ctx, `アップ状態の${targetClass ?? 'シグニ'}なし（DOWN_UP_SIGNI_AND_CHOOSE）`));
    }
    // 選択肢：「N体ダウン」オプション（0 to upSigniDUSC.length）
    const optsDUSC = [
      { id: 'dusc_none', label: 'ダウンしない', action: ({ type: 'SEQUENCE', steps: [] } as SequenceAction) as EffectAction, available: true },
      ...upSigniDUSC.map((s, i) => ({
        id: `dusc_${i}`,
        label: `${ctx.cardMap.get(s.cn)?.CardName ?? s.cn}をダウン`,
        action: ({ type: 'STUB', id: 'INTERNAL_DOWN_SIGNI_BY_ZONE', value: s.zi } as StubAction) as EffectAction,
        available: true,
      })),
    ];
    return needsInteraction(
      addLog(ctx, `アップ${targetClass ?? ''}シグニを選択してダウン（コスト軽減素材）`),
      { type: 'CHOOSE', options: optsDUSC, count: 1 }
    );
  }
  if (stub.id === 'INTERNAL_DOWN_SIGNI_BY_ZONE') {
    const ziIDSBZ = typeof stub.value === 'number' ? stub.value : 0;
    const downArrIDSBZ = [...(ctx.ownerState.field.signi_down ?? [false, false, false])];
    downArrIDSBZ[ziIDSBZ] = true;
    const newOwnerIDSBZ = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_down: downArrIDSBZ } };
    const topIDSBZ = ctx.ownerState.field.signi[ziIDSBZ]?.at(-1);
    return done(addLog({ ...ctx, ownerState: newOwnerIDSBZ, lastProcessedCards: topIDSBZ ? [topIDSBZ] : [] },
      `${topIDSBZ ? ctx.cardMap.get(topIDSBZ)?.CardName : 'シグニ'}をダウン（コスト軽減）`));
  }
  // CHOOSE_N_FROM_LIST: 以下の①②③④からN個選択して実行
  if (stub.id === 'CHOOSE_N_FROM_LIST') {
    const srcCNFL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCNFL = srcCNFL ? (srcCNFL.EffectText ?? '') + ' ' + (srcCNFL.BurstText ?? '') : '';
    const toHWCNFL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    // 選択数を解析（「N つまで選ぶ」「N つ選ぶ」）
    const countM = txtCNFL.match(/([１-４1-4])つ(?:まで)?選ぶ/);
    const maxChoose = countM ? parseInt(toHWCNFL(countM[1])) : 2;
    // ①②③④ を解析してCHOOSEオプション生成（choiceTextParserに共通化）
    const optsCNFL = parseChoiceOptionsFromText(txtCNFL, 'choice');
    if (optsCNFL.length > 0) {
      return needsInteraction(addLog(ctx, `効果を${maxChoose}つ選択（CHOOSE_N_FROM_LIST）`), {
        type: 'CHOOSE', options: optsCNFL, count: Math.min(maxChoose, optsCNFL.length),
      });
    }
    return done(addLog(ctx, `リストからN個選択（解析不可: ${txtCNFL.slice(0,30)}）`));
  }
  // CHOOSE_COLOR_FROM_LIST / CHOOSE_SAME_OPTION_TWICE / CHOOSE_SAME_OPTION_MULTIPLE
  // CHOOSE_COLOR_FROM_LIST: エナゾーンの色から選ぶ（最大N色）→ selectedColors に保存
  if (stub.id === 'CHOOSE_COLOR_FROM_LIST') {
    const colorNames = ['白', '赤', '青', '緑', '黒'];
    // エナゾーンにある色を収集
    const enaColorsCCL = new Set<string>();
    ctx.ownerState.energy.forEach(cn => {
      const c = ctx.cardMap.get(cn);
      (c?.Color ?? '').split(/[・,、]/).forEach(col => { if (colorNames.includes(col.trim())) enaColorsCCL.add(col.trim()); });
    });
    if (enaColorsCCL.size === 0) return done(addLog(ctx, '色選択：エナに色なし'));
    const optsCCL = [...enaColorsCCL].map(col => ({
      id: `color_${col}`,
      label: `《${col}》を選ぶ`,
      action: ({ type: 'STUB', id: 'INTERNAL_SELECT_COLOR', value: col } as StubAction) as EffectAction,
      available: true,
    }));
    const srcCCL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCCL = srcCCL ? srcCCL.EffectText ?? '' : '';
    const maxMCCL = txtCCL.match(/最大([１-５1-5])色/);
    const maxCount = maxMCCL ? parseInt(maxMCCL[1].replace(/[１-５]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0))) : 1;
    return needsInteraction(addLog(ctx, `色を選択（最大${maxCount}色）`), {
      type: 'CHOOSE', options: optsCCL, count: Math.min(maxCount, optsCCL.length),
    });
  }
  if (stub.id === 'INTERNAL_SELECT_COLOR') {
    const colISC = typeof stub.value === 'string' ? stub.value : '';
    const selectedColors = [...(ctx.ownerState.story_overrides?.['__selected_colors__']?.split(',') ?? []), colISC].filter(Boolean);
    const newOv = { ...(ctx.ownerState.story_overrides ?? {}), '__selected_colors__': selectedColors.join(',') };
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, story_overrides: newOv } }, `《${colISC}》を選択`));
  }
  if (stub.id === 'CHOOSE_SAME_OPTION_TWICE' || stub.id === 'CHOOSE_SAME_OPTION_MULTIPLE') {
    const srcCSO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCSO = srcCSO ? (srcCSO.EffectText ?? '') + ' ' + (srcCSO.BurstText ?? '') : '';
    const toHWCSO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const cntMCSO = txtCSO.match(/以下の.*?から([２-９\d])つまで選ぶ/);
    const maxRoundsCSO = cntMCSO ? parseInt(toHWCSO(cntMCSO[1])) : 2;
    const remainingCSO = typeof stub.value === 'number' ? stub.value : maxRoundsCSO;
    if (remainingCSO <= 0) return done(addLog(ctx, '選択完了'));
    const optsCSO: Array<{ id: string; label: string; action: EffectAction; available: boolean }> = [];
    // ①バウンス: 相手シグニを手札に戻す（手札捨てセットも含む）
    if (txtCSO.match(/①.*手札に戻す/)) {
      const hasDiscard = /①[^②]*手札を[１1]枚捨てる/.test(txtCSO);
      const bounceAct: EffectAction = hasDiscard
        ? { type: 'SEQUENCE', steps: [
            { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as BounceAction,
            { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as TrashAction,
          ]} as import('../types/effects').SequenceAction
        : { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as BounceAction;
      optsCSO.push({
        id: 'cso_bounce', label: '①相手シグニを手札に戻す' + (hasDiscard ? '（手札1枚捨て）' : ''),
        action: bounceAct,
        available: ctx.otherState.field.signi.some(s => s && s.length > 0),
      });
    }
    // ②アタックできない付与: センタールリグにアタック禁止を付与
    if (txtCSO.match(/②.*アタックできない/)) {
      optsCSO.push({
        id: 'cso_no_attack', label: '②相手センタールリグにアタック不可を付与',
        action: { type: 'STUB', id: 'INTERNAL_GRANT_NO_ATTACK_LRIG' } as StubAction as EffectAction,
        available: !!ctx.otherState.field.lrig.at(-1),
      });
    }
    // ②サーチ: デッキからシグニを手札に加える
    if (txtCSO.match(/②.*デッキ.*シグニ.*(?:手札|探して)/)) {
      optsCSO.push({
        id: 'cso_search', label: '②デッキからシグニを手札に加える',
        action: { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ' }, maxCount: 1, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } } as EffectAction,
        available: ctx.ownerState.deck.some(cn => ctx.cardMap.get(cn)?.Type === 'シグニ'),
      });
    }
    // ③クラスサーチ: デッキから特定クラスのシグニをN枚手札に加える
    if (txtCSO.match(/③.*デッキから.*＜([^＞]+)＞のシグニ([２-９\d]+)枚を探して/)) {
      const mCS3 = txtCSO.match(/③.*＜([^＞]+)＞のシグニ([２-９\d]+)枚/);
      const className3 = mCS3 ? mCS3[1] : '';
      const cnt3 = mCS3 ? parseInt(toHWCSO(mCS3[2])) : 2;
      optsCSO.push({
        id: 'cso_class_search', label: `③デッキから＜${className3}＞を${cnt3}枚手札へ`,
        action: { type: 'SEQUENCE', steps: [
          { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', story: className3 }, maxCount: cnt3, then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
        ]} as import('../types/effects').SequenceAction as EffectAction,
        available: ctx.ownerState.deck.some(cn => (ctx.cardMap.get(cn)?.CardClass ?? '').includes(className3)),
      });
    }
    if (optsCSO.length === 0) return done(addLog(ctx, `[CHOOSE_SAME_OPTION: 選択肢解析失敗]`));
    const contCSO: StubAction = { type: 'STUB', id: stub.id, value: remainingCSO - 1 };
    return needsInteraction(addLog(ctx, `選択（残り${remainingCSO}回、同一選択肢可）`), {
      type: 'CHOOSE', options: optsCSO, count: 1, continuation: contCSO as EffectAction,
    });
  }
  // === バッチ15: 公開・アクセ応用・条件ドロー系 ===
  // FIELD_COND_DRAW_REVEAL: フィールド条件達成時にデッキ上を公開し同クラスなら手札へ
  if (stub.id === 'FIELD_COND_DRAW_REVEAL') {
    const srcFCDR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtFCDR = srcFCDR ? (srcFCDR.EffectText ?? '') + ' ' + (srcFCDR.BurstText ?? '') : '';
    const mClassFCDR = txtFCDR.match(/＜([^＞]+)＞/);
    const classNameFCDR = mClassFCDR ? mClassFCDR[1] : '';
    const hasClassFCDR = !classNameFCDR || ctx.ownerState.field.signi.some(s => {
      if (!s || s.length === 0) return false;
      return ctx.cardMap.get(s[s.length - 1])?.CardClass?.includes(classNameFCDR);
    });
    if (!hasClassFCDR) return done(addLog(ctx, `フィールドに＜${classNameFCDR}＞なし（条件未達成）`));
    const sFCDR = ctx.ownerState;
    if (sFCDR.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topFCDR = sFCDR.deck[0];
    const topCardFCDR = ctx.cardMap.get(topFCDR);
    const topClassFCDR = topCardFCDR?.CardClass ?? '';
    if (classNameFCDR && topClassFCDR.includes(classNameFCDR)) {
      const newSFCDR: PlayerState = { ...sFCDR, deck: sFCDR.deck.slice(1), hand: [...sFCDR.hand, topFCDR] };
      return done(addLog({ ...ctx, ownerState: newSFCDR }, `公開${topCardFCDR?.CardName ?? topFCDR}(＜${classNameFCDR}＞一致)→手札へ`));
    }
    const newSFCDR2: PlayerState = { ...sFCDR, deck: sFCDR.deck.slice(1), trash: [...sFCDR.trash, topFCDR] };
    return done(addLog({ ...ctx, ownerState: newSFCDR2 }, `公開${topCardFCDR?.CardName ?? topFCDR}(不一致)→トラッシュ`));
  }
  // REVEAL: デッキ上を公開（名前ログ）
  if (stub.id === 'REVEAL') {
    const sREV = ctx.ownerState;
    if (sREV.deck.length === 0) return done(addLog(ctx, 'デッキなし（公開できず）'));
    const topREV = sREV.deck[0];
    const cardREV = ctx.cardMap.get(topREV);
    return done(addLog({ ...ctx, lastProcessedCards: [topREV] }, `公開：${cardREV?.CardName ?? topREV}`));
  }
  // HAND_REVEAL_CLASS_SIGNI: 手札のクラスシグニを選択して公開（SELECT_TARGET）
  if (stub.id === 'HAND_REVEAL_CLASS_SIGNI') {
    const srcHRCS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtHRCS = srcHRCS ? (srcHRCS.EffectText ?? '') + ' ' + (srcHRCS.BurstText ?? '') : '';
    // クラス名を抽出（例: ＜アーム＞、＜水獣＞）
    const classMatchHRCS = txtHRCS.match(/手札から(?:好きな枚数の?)?[＜《]([^＞》]+)[＞》]/);
    const classNameHRCS = classMatchHRCS ? classMatchHRCS[1] : '';
    const isAnyCountHRCS = txtHRCS.includes('好きな枚数');
    // 手札からクラスシグニを絞り込む
    const candsHRCS = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (!classNameHRCS || (c.CardClass ?? '').includes(classNameHRCS));
    });
    if (candsHRCS.length === 0) {
      return done(addLog({ ...ctx, lastProcessedCards: [] },
        `手札に${classNameHRCS ? `＜${classNameHRCS}＞` : ''}シグニなし（公開なし）`));
    }
    const countHRCS = isAnyCountHRCS ? candsHRCS.length : 1;
    const noopHRCS: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
    return needsInteraction(
      addLog(ctx, `手札から${classNameHRCS ? `＜${classNameHRCS}＞` : ''}シグニを${isAnyCountHRCS ? '好きな枚数' : '１枚'}公開する`),
      {
        type: 'SELECT_TARGET',
        candidates: candsHRCS,
        count: countHRCS,
        optional: isAnyCountHRCS,
        targetScope: 'self_hand',
        thenAction: noopHRCS as EffectAction,
      }
    );
  }
  // OPTIONAL_HAND_REVEAL_NAMED: 名称指定で手札カードを任意公開
  if (stub.id === 'OPTIONAL_HAND_REVEAL_NAMED') {
    const srcOHRN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtOHRN = srcOHRN ? (srcOHRN.EffectText ?? '') + ' ' + (srcOHRN.BurstText ?? '') : '';
    const mNameOHRN = txtOHRN.match(/「([^」]+)」/);
    const nameOHRN = mNameOHRN ? mNameOHRN[1] : '';
    const matchingOHRN = ctx.ownerState.hand.filter(cn => nameOHRN && ctx.cardMap.get(cn)?.CardName === nameOHRN);
    if (matchingOHRN.length === 0) return done(addLog(ctx, `手札に「${nameOHRN}」なし（公開なし）`));
    return done(addLog({ ...ctx, lastProcessedCards: matchingOHRN },
      `手札「${nameOHRN}」を公開（${matchingOHRN.length}枚）`));
  }
  // ACCE_SIGNI_GRANT_ABILITY: アクセ中のシグニにキーワード能力を付与
  if (stub.id === 'ACCE_SIGNI_GRANT_ABILITY') {
    const srcAcceAGSA = ctx.sourceCardNum;
    const acceAGSA = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const zoneIdxAGSA = acceAGSA.findIndex(cn => cn === srcAcceAGSA);
    if (zoneIdxAGSA < 0) return done(addLog(ctx, 'アクセ中のシグニが見つからない'));
    const targetSigniAGSA = ctx.ownerState.field.signi[zoneIdxAGSA]?.at(-1);
    if (!targetSigniAGSA) return done(addLog(ctx, 'アクセ先のシグニがいない'));
    const srcCardAGSA = ctx.cardMap.get(srcAcceAGSA ?? '');
    const txtAGSA = srcCardAGSA ? (srcCardAGSA.EffectText ?? '') : '';
    const mKwAGSA = txtAGSA.match(/【([^】]+)】/);
    const kwAGSA = mKwAGSA ? mKwAGSA[1] : 'ランサー';
    const kwGrantsAGSA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingAGSA = kwGrantsAGSA[targetSigniAGSA] ?? [];
    if (!existingAGSA.includes(kwAGSA)) kwGrantsAGSA[targetSigniAGSA] = [...existingAGSA, kwAGSA];
    const newSAGSA: PlayerState = { ...ctx.ownerState, keyword_grants: kwGrantsAGSA };
    return done(addLog({ ...ctx, ownerState: newSAGSA },
      `${ctx.cardMap.get(targetSigniAGSA)?.CardName ?? targetSigniAGSA}に【${kwAGSA}】付与`));
  }
  // MOVE_ACCE_TO_SIGNI: アクセを別のシグニに付け替え
  if (stub.id === 'MOVE_ACCE_TO_SIGNI') {
    const srcAcceMATS = ctx.sourceCardNum;
    const acceMATS = [...(ctx.ownerState.field.signi_acce ?? [null, null, null])];
    const srcZoneMATS = acceMATS.findIndex(cn => cn === srcAcceMATS);
    if (srcZoneMATS < 0) return done(addLog(ctx, 'アクセ中のシグニが見つからない'));
    // アクセがついていないゾーンを探す
    const dstZoneMATS = acceMATS.findIndex((cn, i) => i !== srcZoneMATS && cn === null &&
      ctx.ownerState.field.signi[i] && (ctx.ownerState.field.signi[i]?.length ?? 0) > 0);
    if (dstZoneMATS < 0) return done(addLog(ctx, '移動先のシグニゾーンなし'));
    acceMATS[srcZoneMATS] = null;
    acceMATS[dstZoneMATS] = srcAcceMATS ?? null;
    const newSMATS: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi_acce: acceMATS } };
    const dstSigniName = ctx.cardMap.get(ctx.ownerState.field.signi[dstZoneMATS]?.at(-1) ?? '')?.CardName ?? 'シグニ';
    return done(addLog({ ...ctx, ownerState: newSMATS },
      `${ctx.cardMap.get(srcAcceMATS ?? '')?.CardName ?? 'アクセ'}を${dstSigniName}へ移動`));
  }
  // PEEP_HAND: 相手の手札を覗き見（ログに枚数と名前を表示）
  if (stub.id === 'PEEP_HAND') {
    const oppHandPH = ctx.otherState.hand;
    const namesPH = oppHandPH.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    return done(addLog(ctx, `相手の手札を確認（${oppHandPH.length}枚）：${namesPH || 'なし'}`));
  }
  // REVEAL_OPP_HAND_CARD: 相手の手札のカードを1枚公開
  if (stub.id === 'REVEAL_OPP_HAND_CARD') {
    const oppHandROHC = ctx.otherState.hand;
    if (oppHandROHC.length === 0) return done(addLog(ctx, '相手の手札なし'));
    const randROHC = oppHandROHC[Math.floor(Math.random() * oppHandROHC.length)];
    return done(addLog({ ...ctx, lastProcessedCards: [randROHC] },
      `相手の手札を公開：${ctx.cardMap.get(randROHC)?.CardName ?? randROHC}`));
  }
  // OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND: 公開ログ
  if (stub.id === 'OPP_REVEAL_HAND_AND_LRIG_DECK' || stub.id === 'OPP_REVEAL_LRIG_DECK' || stub.id === 'OPP_REVEAL_TOP_AND_HAND') {
    const handNames = ctx.otherState.hand.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    const lrigNames = ctx.otherState.lrig_deck.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
    if (stub.id === 'OPP_REVEAL_LRIG_DECK') {
      return done(addLog(ctx, `相手のルリグデッキ公開（${ctx.otherState.lrig_deck.length}枚）：${lrigNames || 'なし'}`));
    }
    if (stub.id === 'OPP_REVEAL_TOP_AND_HAND') {
      const topName = ctx.cardMap.get(ctx.otherState.deck[0] ?? '')?.CardName ?? 'なし';
      return done(addLog(ctx, `相手のデッキ上（${topName}）+手札（${handNames || 'なし'}）を公開`));
    }
    return done(addLog(ctx, `相手の手札（${handNames || 'なし'}）+ルリグデッキ（${lrigNames || 'なし'}）を公開`));
  }
  // === バッチ14: シグニ移動・エナ操作・複数対象系 ===
  // OPP_SIGNI_TO_DECK_AND_SHUFFLE / OPP_SIGNI_TO_DECK_BY_GATE / OPP_SIGNI_TO_DECK_NTH は line 2567 の handler で処理済み（dead code 削除）
  // INTERNAL_BOUNCE_TO_DECK: 選択シグニをデッキにランダム挿入
  if (stub.id === 'INTERNAL_BOUNCE_TO_DECK') {
    const cnIBTD = ctx.lastProcessedCards?.[0];
    if (!cnIBTD) return done(addLog(ctx, '対象なし'));
    const inOwnIBTD = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnIBTD);
    const ownerIBTD: Owner = inOwnIBTD ? 'self' : 'opponent';
    const sIBTD = ownerState(ownerIBTD, ctx);
    const removedIBTD = removeFromField(cnIBTD, sIBTD);
    const deckIBTD = [...removedIBTD.deck];
    const insertIBTD = Math.floor(Math.random() * (deckIBTD.length + 1));
    deckIBTD.splice(insertIBTD, 0, cnIBTD);
    const newSIBTD: PlayerState = { ...removedIBTD, deck: deckIBTD };
    return done(addLog(setOwnerState(ownerIBTD, newSIBTD, ctx),
      `${ctx.cardMap.get(cnIBTD)?.CardName ?? cnIBTD}をデッキに混ぜた（シャッフル）`));
  }
  // OPP_SIGNI_LEAVE_TO_TRASH: 相手シグニ退場→トラッシュ（エナではなく）
  if (stub.id === 'OPP_SIGNI_LEAVE_TO_TRASH') {
    const candidatesOSLT = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candidatesOSLT.length === 0) return done(addLog(ctx, '相手シグニなし'));
    const thenOSLT: StubAction = { type: 'STUB', id: 'INTERNAL_LEAVE_TO_TRASH' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesOSLT, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenOSLT as EffectAction,
    });
  }
  // INTERNAL_LEAVE_TO_TRASH: 選択シグニをトラッシュに置く
  if (stub.id === 'INTERNAL_LEAVE_TO_TRASH') {
    const cnILT = ctx.lastProcessedCards?.[0];
    if (!cnILT) return done(addLog(ctx, '対象なし'));
    const inOwnILT = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnILT);
    const ownerILT: Owner = inOwnILT ? 'self' : 'opponent';
    const sILT = ownerState(ownerILT, ctx);
    const removedILT = removeFromField(cnILT, sILT);
    const newSILT: PlayerState = { ...removedILT, trash: [...removedILT.trash, cnILT] };
    return done(addLog(setOwnerState(ownerILT, newSILT, ctx),
      `${ctx.cardMap.get(cnILT)?.CardName ?? cnILT}をトラッシュへ退場`));
  }
  // TRADE_SELF_AND_OPP_TO_ENERGY: 自シグニ+相手シグニ1体→両者エナ
  if (stub.id === 'TRADE_SELF_AND_OPP_TO_ENERGY') {
    const srcTSAOTE = ctx.sourceCardNum;
    let ctxTSAOTE = ctx;
    if (srcTSAOTE && ctx.ownerState.field.signi.some(s => s?.at(-1) === srcTSAOTE)) {
      const removedTSAOTE = removeFromField(srcTSAOTE, ctx.ownerState);
      const newOwnerTSAOTE: PlayerState = { ...removedTSAOTE, energy: [...removedTSAOTE.energy, srcTSAOTE] };
      ctxTSAOTE = { ...ctxTSAOTE, ownerState: newOwnerTSAOTE };
    }
    const candsTSAOTE = (ctxTSAOTE.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsTSAOTE.length === 0) return done(addLog(ctxTSAOTE, '自シグニ→エナ（相手シグニなし）'));
    const banishTSAOTE: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
    return needsInteraction(addLog(ctxTSAOTE, '自シグニ→エナ、相手シグニ1体選択'), {
      type: 'SELECT_TARGET', candidates: candsTSAOTE, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: banishTSAOTE as EffectAction,
    });
  }
  // MULTI_SIGNI_TO_ENERGY: 自分の複数シグニをエナに
  if (stub.id === 'MULTI_SIGNI_TO_ENERGY') {
    const toHWMSTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcMSTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSTE = srcMSTE ? (srcMSTE.EffectText ?? '') + ' ' + (srcMSTE.BurstText ?? '') : '';
    const mMSTE = txtMSTE.match(/([０-９\d]+)体/);
    const countMSTE = mMSTE ? parseInt(toHWMSTE(mMSTE[1])) : 2;
    const candsMSTE = (ctx.ownerState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsMSTE.length === 0) return done(addLog(ctx, 'シグニなし'));
    const banishMSTE: BanishAction = { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsMSTE,
      count: Math.min(countMSTE, candsMSTE.length), optional: false,
      targetScope: 'self_field', thenAction: banishMSTE as EffectAction,
    });
  }
  // MULTI_SIGNI_POWER_UP_5000: 複数シグニに+5000パワー
  if (stub.id === 'MULTI_SIGNI_POWER_UP_5000') {
    const toHWMSPU5 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcMSPU5 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtMSPU5 = srcMSPU5 ? (srcMSPU5.EffectText ?? '') + ' ' + (srcMSPU5.BurstText ?? '') : '';
    const mMSPU5 = txtMSPU5.match(/([０-９\d]+)体/);
    const countMSPU5 = mMSPU5 ? parseInt(toHWMSPU5(mMSPU5[1])) : 2;
    const mDeltaMSPU5 = txtMSPU5.match(/\+([０-９\d]+)/);
    const deltaMSPU5 = mDeltaMSPU5 ? parseInt(toHWMSPU5(mDeltaMSPU5[1])) : 5000;
    const candsMSPU5 = (ctx.ownerState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    if (candsMSPU5.length === 0) return done(addLog(ctx, 'シグニなし'));
    const pmMSPU5: PowerModifyAction = {
      type: 'POWER_MODIFY', delta: deltaMSPU5, target: { type: 'SIGNI', owner: 'self', count: 1 },
    };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candsMSPU5,
      count: Math.min(countMSPU5, candsMSPU5.length), optional: false,
      targetScope: 'self_field', thenAction: pmMSPU5 as EffectAction,
    });
  }
  // TRASHED_CARD_TO_HAND_OR_ENERGY: トラッシュカード→手札かエナ選択
  // OPP_TRASH_FIELD_SIGNI_AND_ENERGY: 相手のシグニとエナをトラッシュ
  if (stub.id === 'OPP_TRASH_FIELD_SIGNI_AND_ENERGY') {
    const candidatesOTFSE = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
    let otherOTFSE = ctx.otherState;
    // 相手フィールドシグニを全てトラッシュ
    for (const cn of candidatesOTFSE) {
      const removed = removeFromField(cn, otherOTFSE);
      otherOTFSE = { ...removed, trash: [...removed.trash, cn] };
    }
    // 相手エナを全てトラッシュ
    otherOTFSE = { ...otherOTFSE, trash: [...otherOTFSE.trash, ...otherOTFSE.energy], energy: [] };
    return done(addLog({ ...ctx, otherState: otherOTFSE },
      `相手シグニ${candidatesOTFSE.length}体+全エナをトラッシュ`));
  }
  // NON_GUARD_DISCARD_TO_ENERGY: 非ガード捨て牌をエナゾーンへ
  if (stub.id === 'NON_GUARD_DISCARD_TO_ENERGY') {
    const cnNGDTE = ctx.lastProcessedCards?.[0];
    if (!cnNGDTE) return done(addLog(ctx, '対象なし'));
    const cardNGDTE = ctx.cardMap.get(cnNGDTE);
    // Guard列は '1'/'0' 形式（'○'判定は常にfalseだった）
    const hasGuardNGDTE = cardNGDTE?.Guard === '1' || (cardNGDTE?.EffectText ?? '').includes('【ガード】');
    if (hasGuardNGDTE) return done(addLog(ctx, 'ガードカードなのでエナ移動なし'));
    const newSNGDTE: PlayerState = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(c => c !== cnNGDTE),
      energy: [...ctx.ownerState.energy, cnNGDTE],
    };
    return done(addLog({ ...ctx, ownerState: newSNGDTE }, `非ガード捨て牌→エナゾーンへ`));
  }
  // === バッチ13: エナ操作・カウント・条件分岐系 ===
  // ENERGY_TO_HAND_ON_DECK: エナゾーンの末尾→手札（デッキ経由を省略）
  if (stub.id === 'ENERGY_TO_HAND_ON_DECK') {
    const sETHOD = ctx.ownerState;
    if (sETHOD.energy.length === 0) return done(addLog(ctx, 'エナゾーンなし'));
    const lastEnaETHOD = sETHOD.energy.at(-1)!;
    const newSETHOD: PlayerState = {
      ...sETHOD,
      energy: sETHOD.energy.slice(0, -1),
      hand: [...sETHOD.hand, lastEnaETHOD],
    };
    return done(addLog({ ...ctx, ownerState: newSETHOD }, `${ctx.cardMap.get(lastEnaETHOD)?.CardName ?? lastEnaETHOD}をエナ→手札`));
  }
  // COUNT_DISTINCT_NAMES: フィールドの異なる名称数を数えてパワー修正
  if (stub.id === 'COUNT_DISTINCT_NAMES') {
    const toHWCDN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcCDN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtCDN = srcCDN ? (srcCDN.EffectText ?? '') + ' ' + (srcCDN.BurstText ?? '') : '';
    const mCDN = txtCDN.match(/([＋+－-][０-９\d]+)/);
    const deltaCDN = mCDN ? parseInt(toHWCDN(mCDN[1]).replace('＋', '+').replace('－', '-')) : 1000;
    const ownSigniNames = new Set<string>();
    (ctx.ownerState.field.signi ?? []).forEach(s => {
      if (s && s.length > 0) {
        const name = ctx.cardMap.get(s[s.length - 1])?.CardName;
        if (name) ownSigniNames.add(name);
      }
    });
    const countCDN = ownSigniNames.size;
    const totalCDN = deltaCDN * countCDN;
    if (ctx.sourceCardNum) {
      const modsOwnCDN = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: ctx.sourceCardNum, delta: totalCDN }];
      return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: modsOwnCDN } },
        `異なる名称${countCDN}種×${deltaCDN}→パワー${totalCDN}`));
    }
    return done(addLog(ctx, `異なる名称${countCDN}種`));
  }
  // DISCARD_OR_PENALTY: 特定カード1枚捨てるかペナルティ（N枚捨て）を選ぶ
  if (stub.id === 'DISCARD_OR_PENALTY') {
    const srcDOP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDOP = srcDOP ? (srcDOP.EffectText ?? '') + ' ' + (srcDOP.BurstText ?? '') : '';
    const toHWDOP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const classMatchDOP = txtDOP.match(/手札から[<＜]([^>＞]+)[>＞]のシグニを１枚捨てないかぎり/);
    const typeMatchDOP = !classMatchDOP ? txtDOP.match(/手札から(スペル|シグニ|アーツ)を１枚捨てないかぎり/) : null;
    const penaltyMDOP = txtDOP.match(/かぎり手札を([２-９\d]+)枚捨てる/);
    const penaltyCount = penaltyMDOP ? parseInt(toHWDOP(penaltyMDOP[1])) : 2;
    const matchingDOP = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (classMatchDOP) return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(classMatchDOP[1]);
      if (typeMatchDOP) return c?.Type === typeMatchDOP[1];
      return false;
    });
    const labelDOP = classMatchDOP ? `＜${classMatchDOP[1]}＞シグニを1枚捨てる` : typeMatchDOP ? `${typeMatchDOP[1]}を1枚捨てる` : '指定カードを1枚捨てる';
    const penaltyActionDOP: StubAction = { type: 'STUB', id: 'INTERNAL_DISCARD_PENALTY', value: penaltyCount };
    if (matchingDOP.length === 0) {
      const toDiscard = ctx.ownerState.hand.slice(0, penaltyCount);
      const newOwner = { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(penaltyCount), trash: [...ctx.ownerState.trash, ...toDiscard] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `指定カードなし→ペナルティ手札${penaltyCount}枚捨て`));
    }
    return needsInteraction(addLog(ctx, `${labelDOP}か手札を${penaltyCount}枚捨てるか選択`), {
      type: 'CHOOSE', count: 1, options: [
        { id: 'specific', label: labelDOP, action: { type: 'STUB', id: 'INTERNAL_DISCARD_MATCHING_HAND_DOP' } as EffectAction, available: true },
        { id: 'penalty',  label: `手札を${penaltyCount}枚捨てる`, action: penaltyActionDOP as EffectAction, available: ctx.ownerState.hand.length >= penaltyCount },
      ],
    });
  }
  if (stub.id === 'INTERNAL_DISCARD_MATCHING_HAND_DOP') {
    const srcIDMD = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtIDMD = srcIDMD ? (srcIDMD.EffectText ?? '') + ' ' + (srcIDMD.BurstText ?? '') : '';
    const classMatchIDMD = txtIDMD.match(/手札から[<＜]([^>＞]+)[>＞]のシグニ/);
    const typeMatchIDMD = !classMatchIDMD ? txtIDMD.match(/手札から(スペル|シグニ|アーツ)/) : null;
    const candsIDMD = ctx.ownerState.hand.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (classMatchIDMD) return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(classMatchIDMD[1]);
      if (typeMatchIDMD) return c?.Type === typeMatchIDMD[1];
      return false;
    });
    if (candsIDMD.length === 0) return done(addLog(ctx, '該当カードなし'));
    const trashOneIDMD: TrashAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };
    return selectOrInteract(candsIDMD, 1, false, 'self_hand', trashOneIDMD as EffectAction, undefined, ctx);
  }
  if (stub.id === 'INTERNAL_DISCARD_PENALTY') {
    const cntIDP = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '2'));
    const toDiscardIDP = ctx.ownerState.hand.slice(0, cntIDP);
    const newOwnerIDP = { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(cntIDP), trash: [...ctx.ownerState.trash, ...toDiscardIDP] };
    return done(addLog({ ...ctx, ownerState: newOwnerIDP }, `ペナルティ：手札${cntIDP}枚捨て`));
  }
  // REVEAL_TOP_CONDITIONAL_ROUTE: デッキ上を公開しレベル条件で分岐
  if (stub.id === 'REVEAL_TOP_CONDITIONAL_ROUTE') {
    const toHWRTCR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const sRTCR = ctx.ownerState;
    if (sRTCR.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topRTCR = sRTCR.deck[0];
    const cardRTCR = ctx.cardMap.get(topRTCR);
    const topLevelRTCR = cardRTCR ? parseInt(toHWRTCR(cardRTCR.Level ?? '0')) || 0 : 0;
    const srcRTCR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtRTCR = srcRTCR ? (srcRTCR.EffectText ?? '') + ' ' + (srcRTCR.BurstText ?? '') : '';
    const mLvRTCR = txtRTCR.match(/レベル([０-９\d]+)以上/);
    const threshRTCR = mLvRTCR ? parseInt(toHWRTCR(mLvRTCR[1])) : 3;
    const condMetRTCR = topLevelRTCR >= threshRTCR;
    const newSRTCR: PlayerState = { ...sRTCR, deck: sRTCR.deck.slice(1), trash: [...sRTCR.trash, topRTCR] };
    return done(addLog({ ...ctx, ownerState: newSRTCR },
      `公開${cardRTCR?.CardName ?? topRTCR}(Lv${topLevelRTCR})：条件${condMetRTCR ? '達成' : '未達成'}→トラッシュ`));
  }
  // === バッチ12: アクセ・シグニ配置・能力付与・無効系 ===
  // ACCE_FROM_HAND: 手札のアクセカードを自分のシグニに付ける
  if (stub.id === 'ACCE_FROM_HAND' || stub.id === 'MULTI_ACCE_FROM_HAND') {
    const srcAFH = ctx.sourceCardNum;
    if (!srcAFH || !ctx.ownerState.hand.includes(srcAFH)) return done(addLog(ctx, 'アクセカードが手札にない'));
    const acceAFH = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const candidatesAFH = (ctx.ownerState.field.signi ?? []).flatMap((stack, i) => {
      if (!stack || stack.length === 0) return [];
      if (acceAFH[i] !== null) return [];
      return [stack[stack.length - 1]];
    });
    if (candidatesAFH.length === 0) return done(addLog(ctx, 'アクセ対象のシグニなし'));
    const attachAFH: AttachAcceAction = { type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candidatesAFH, count: 1, optional: false,
      targetScope: 'self_field', thenAction: attachAFH as EffectAction,
    });
  }
  // ACCE_FROM_TRASH: トラッシュのアクセカードを自分のシグニに付ける
  if (stub.id === 'ACCE_FROM_TRASH' || stub.id === 'NAMED_SIGNI_ACCE_FROM_TRASH') {
    const acceAFTR = ctx.ownerState.field.signi_acce ?? [null, null, null];
    const candidatesAFTR = (ctx.ownerState.field.signi ?? []).flatMap((stack, i) => {
      if (!stack || stack.length === 0) return [];
      if (acceAFTR[i] !== null) return [];
      return [stack[stack.length - 1]];
    });
    if (candidatesAFTR.length === 0) return done(addLog(ctx, 'アクセ対象のシグニなし'));
    // トラッシュのアクセカードをいったん手札に移し、ATTACH_ACCEで処理
    const srcAFTR = ctx.sourceCardNum;
    const trashAcceAFTR = srcAFTR && ctx.ownerState.trash.includes(srcAFTR) ? srcAFTR : null;
    if (!trashAcceAFTR) return done(addLog(ctx, 'アクセカードがトラッシュにない'));
    const newSAFTR: PlayerState = {
      ...ctx.ownerState,
      trash: ctx.ownerState.trash.filter(c => c !== trashAcceAFTR),
      hand: [...ctx.ownerState.hand, trashAcceAFTR],
    };
    const attachAFTR: AttachAcceAction = { type: 'ATTACH_ACCE', targetSigniOwner: 'self', sourceOwner: 'self' };
    return needsInteraction({ ...ctx, ownerState: newSAFTR }, {
      type: 'SELECT_TARGET', candidates: candidatesAFTR, count: 1, optional: false,
      targetScope: 'self_field', thenAction: attachAFTR as EffectAction,
    });
  }
  // SIGNI_REPOSITION: シグニを別のゾーンに移動（自or相手、1体 or 全体）
  if (stub.id === 'SIGNI_REPOSITION' || stub.id === 'SWAP_OPTIONAL') {
    const srcCardSR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtSR = srcCardSR ? (srcCardSR.EffectText ?? '') + ' ' + (srcCardSR.BurstText ?? '') : '';
    const isOppSR = txtSR.includes('対戦相手のシグニ');
    const isAllSR = txtSR.includes('すべてのシグニを') && !isOppSR;
    const targetStateSR = isOppSR ? ctx.otherState : ctx.ownerState;
    const targetScopeSR: TargetScope = isOppSR ? 'opp_field' : 'self_field';
    // 全シグニ配置替え: フィールドのシグニ全体をゾーン選択で入れ替える
    if (isAllSR) {
      const candsSRAll = ctx.ownerState.field.signi.flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
      if (candsSRAll.length < 2) return done(addLog(ctx, '配置替え不可（シグニ1体以下）'));
      // 1体ずつ選択して移動先を決める（任意）
      const selectedSRAll = (ctx.lastProcessedCards ?? []).find(cn =>
        ctx.ownerState.field.signi.some(s => s?.at(-1) === cn));
      if (!selectedSRAll) {
        const noopSRAll: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        const contSRAll: StubAction = { type: 'STUB', id: 'SIGNI_REPOSITION' };
        return needsInteraction(addLog(ctx, '配置替えするシグニを選択（任意）'), {
          type: 'SELECT_TARGET', candidates: candsSRAll, count: 1, optional: true,
          targetScope: 'self_field', thenAction: noopSRAll as EffectAction, continuation: contSRAll as EffectAction,
        });
      }
      const curZoneSRAll = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === selectedSRAll);
      const zoneOptsSRAll = [0,1,2].filter(i => i !== curZoneSRAll).map(zi => ({
        id: `zone_${zi}`, label: `ゾーン${zi+1}へ移動`,
        action: ({ type: 'STUB', id: 'INTERNAL_REPOSITION_TO_ZONE',
          value: `${selectedSRAll}:${zi}:false` } as StubAction) as EffectAction,
        available: true,
      }));
      zoneOptsSRAll.push({ id: 'skip', label: '終了',
        action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction) as EffectAction,
        available: true });
      return needsInteraction(addLog(ctx, '移動先ゾーンを選択'), { type: 'CHOOSE', options: zoneOptsSRAll, count: 1 });
    }
    // 対象シグニ選択
    const selectedSR = (ctx.lastProcessedCards ?? []).find(cn =>
      targetStateSR.field.signi.some(s => s?.at(-1) === cn),
    );
    if (!selectedSR) {
      const candsSR = targetStateSR.field.signi.flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : []);
      if (candsSR.length === 0) return done(addLog(ctx, 'シグニなし（SIGNI_REPOSITION）'));
      const noopSR: StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
      const contSR: StubAction = { type: 'STUB', id: stub.id };
      return needsInteraction(addLog(ctx, '配置替えするシグニを選択'), {
        type: 'SELECT_TARGET', candidates: candsSR, count: 1, optional: stub.id === 'SWAP_OPTIONAL',
        targetScope: targetScopeSR, thenAction: noopSR as EffectAction, continuation: contSR as EffectAction,
      });
    }
    // 移動先ゾーン選択
    const currentZoneSR = targetStateSR.field.signi.findIndex(s => s?.at(-1) === selectedSR);
    const zoneOptsSR = [0,1,2].filter(i => i !== currentZoneSR).map(zi => ({
      id: `zone_${zi}`, label: `ゾーン${zi+1}へ移動`,
      action: ({ type: 'STUB', id: 'INTERNAL_REPOSITION_TO_ZONE',
        value: `${selectedSR}:${zi}:${isOppSR}` } as StubAction) as EffectAction,
      available: true,
    }));
    return needsInteraction(addLog(ctx, '移動先ゾーンを選択'), { type: 'CHOOSE', options: zoneOptsSR, count: 1 });
  }
  // INTERNAL_REPOSITION_MOVE: 選択シグニを空きゾーンへ移動（後方互換）
  if (stub.id === 'INTERNAL_REPOSITION_MOVE') {
    const cnIRM = ctx.lastProcessedCards?.[0];
    if (!cnIRM) return done(addLog(ctx, '対象なし'));
    const signiIRM = [...(ctx.ownerState.field.signi ?? [])] as (string[] | null)[];
    const srcIdxIRM = signiIRM.findIndex(s => s?.at(-1) === cnIRM);
    const dstIdxIRM = signiIRM.findIndex(s => !s || s.length === 0);
    if (srcIdxIRM < 0 || dstIdxIRM < 0) return done(addLog(ctx, 'シグニ移動不可'));
    const stack = signiIRM[srcIdxIRM]!;
    signiIRM[srcIdxIRM] = stack.length > 1 ? stack.slice(0, -1) : null;
    signiIRM[dstIdxIRM] = [cnIRM];
    const newSIRM: PlayerState = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: signiIRM } };
    return done(addLog({ ...ctx, ownerState: newSIRM },
      `${ctx.cardMap.get(cnIRM)?.CardName ?? cnIRM}をゾーン${srcIdxIRM + 1}→${dstIdxIRM + 1}に移動`));
  }
  // INTERNAL_REPOSITION_TO_ZONE: 選択シグニを指定ゾーンへ移動（SIGNI_REPOSITIONの後半）
  if (stub.id === 'INTERNAL_REPOSITION_TO_ZONE') {
    const valIRTZ = typeof stub.value === 'string' ? stub.value : '';
    const [cnIRTZ, dstStrIRTZ, isOppStrIRTZ] = valIRTZ.split(':');
    const dstIdxIRTZ = parseInt(dstStrIRTZ);
    const isOppIRTZ = isOppStrIRTZ === 'true';
    if (!cnIRTZ || isNaN(dstIdxIRTZ)) return done(addLog(ctx, '引数不正（INTERNAL_REPOSITION_TO_ZONE）'));
    const targetStateIRTZ = isOppIRTZ ? ctx.otherState : ctx.ownerState;
    const signiIRTZ = [...targetStateIRTZ.field.signi] as (string[] | null)[];
    const srcIdxIRTZ = signiIRTZ.findIndex(s => s?.at(-1) === cnIRTZ);
    if (srcIdxIRTZ < 0) return done(addLog(ctx, 'ゾーン特定不可（INTERNAL_REPOSITION_TO_ZONE）'));
    // 移動先が空きなら移動、占有なら入れ替え
    const stackSrcIRTZ = signiIRTZ[srcIdxIRTZ]!;
    const stackDstIRTZ = signiIRTZ[dstIdxIRTZ];
    if (!stackDstIRTZ || stackDstIRTZ.length === 0) {
      signiIRTZ[srcIdxIRTZ] = stackSrcIRTZ.length > 1 ? stackSrcIRTZ.slice(0, -1) : null;
      signiIRTZ[dstIdxIRTZ] = [cnIRTZ];
    } else {
      const topDstIRTZ = stackDstIRTZ[stackDstIRTZ.length - 1];
      signiIRTZ[srcIdxIRTZ] = stackSrcIRTZ.length > 1
        ? [...stackSrcIRTZ.slice(0, -1), topDstIRTZ] : [topDstIRTZ];
      signiIRTZ[dstIdxIRTZ] = stackDstIRTZ.length > 1
        ? [...stackDstIRTZ.slice(0, -1), cnIRTZ] : [cnIRTZ];
    }
    const newStateIRTZ = { ...targetStateIRTZ, field: { ...targetStateIRTZ.field, signi: signiIRTZ } };
    const newCtxIRTZ = isOppIRTZ
      ? { ...ctx, otherState: newStateIRTZ }
      : { ...ctx, ownerState: newStateIRTZ };
    return done(addLog(newCtxIRTZ,
      `${ctx.cardMap.get(cnIRTZ)?.CardName ?? cnIRTZ}をゾーン${srcIdxIRTZ+1}→${dstIdxIRTZ+1}に移動`));
  }
  // GRANT_CONDITIONAL_ASSASSIN_ABILITY: 条件付きアサシンをkeyword_grantsに付与
  if (stub.id === 'GRANT_CONDITIONAL_ASSASSIN_ABILITY') {
    const cnGCAA = ctx.sourceCardNum;
    if (!cnGCAA) return done(addLog(ctx, 'ソースカードなし'));
    const kwGCAA = { ...(ctx.ownerState.keyword_grants ?? {}) };
    const existingGCAA = kwGCAA[cnGCAA] ?? [];
    if (!existingGCAA.includes('アサシン')) kwGCAA[cnGCAA] = [...existingGCAA, 'アサシン'];
    const newSGCAA: PlayerState = { ...ctx.ownerState, keyword_grants: kwGCAA };
    return done(addLog({ ...ctx, ownerState: newSGCAA },
      `${ctx.cardMap.get(cnGCAA)?.CardName ?? cnGCAA}にアサシン付与（条件付き）`));
  }
  // POWER_MINUS_PER_OWN_LEVEL: このシグニのレベル×2000だけ対戦相手シグニのパワーを下げる
  // WXK08-078（弩書　エムショ）のGRANT_SIGNI_ABOVE_ABILITYで付与されるACTIVATED効果
  if (stub.id === 'POWER_MINUS_PER_OWN_LEVEL') {
    const srcCardPMPOL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const srcLevelPMPOL = srcCardPMPOL ? (parseInt(srcCardPMPOL.Level ?? '0') || 0) : 0;
    const deltaPMPOL = -2000 * srcLevelPMPOL;
    const targetPMPOL = (ctx.lastProcessedCards ?? []).find(cn =>
      ctx.otherState.field.signi.some(s => s?.at(-1) === cn),
    );
    if (targetPMPOL) {
      const newMods = [...(ctx.otherState.temp_power_mods ?? []), { cardNum: targetPMPOL, delta: deltaPMPOL }];
      const newOtherPMPOL: PlayerState = { ...ctx.otherState, temp_power_mods: newMods };
      return done(addLog({ ...ctx, otherState: newOtherPMPOL },
        `${ctx.cardMap.get(targetPMPOL)?.CardName ?? targetPMPOL} パワー${deltaPMPOL}（レベル${srcLevelPMPOL}×-2000）`));
    }
    const oppCandsPMPOL = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
    if (oppCandsPMPOL.length === 0) return done(addLog(ctx, '対象相手シグニなし（POWER_MINUS_PER_OWN_LEVEL）'));
    const thenPMPOL: StubAction = { type: 'STUB', id: 'POWER_MINUS_PER_OWN_LEVEL' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: oppCandsPMPOL, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenPMPOL as EffectAction,
    });
  }
  // NEGATE_ABILITY: 対象シグニの能力を無効化（abilities_removedに追加）
  if (stub.id === 'NEGATE_ABILITY') {
    const targetNA = ctx.lastProcessedCards?.[0];
    if (targetNA) {
      // 対象がいずれかのフィールドに存在するか確認
      const inOwnNA = ctx.ownerState.field.signi.some(s => s?.at(-1) === targetNA);
      const inOppNA = ctx.otherState.field.signi.some(s => s?.at(-1) === targetNA);
      if (inOwnNA) {
        const newOwnerNA: PlayerState = { ...ctx.ownerState, abilities_removed: [...(ctx.ownerState.abilities_removed ?? []), targetNA] };
        return done(addLog({ ...ctx, ownerState: newOwnerNA }, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}の能力を無効化`));
      }
      if (inOppNA) {
        if ((ctx.otherProtectedSigniNums ?? []).includes(targetNA)) {
          return done(addLog(ctx, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}は保護されているため能力を失わない`));
        }
        const newOtherNA: PlayerState = { ...ctx.otherState, abilities_removed: [...(ctx.otherState.abilities_removed ?? []), targetNA] };
        return done(addLog({ ...ctx, otherState: newOtherNA }, `${ctx.cardMap.get(targetNA)?.CardName ?? targetNA}の能力を無効化`));
      }
    }
    // 対象が不明: 相手フィールドからSELECT（保護済みシグニを除く）
    const candNA = (ctx.otherState.field.signi ?? []).flatMap(s => s && s.length > 0 ? [s[s.length - 1]] : [])
      .filter(n => !(ctx.otherProtectedSigniNums ?? []).includes(n));
    if (candNA.length === 0) return done(addLog(ctx, '無効化対象なし'));
    const thenNA: StubAction = { type: 'STUB', id: 'INTERNAL_NEGATE_ABILITY' };
    return needsInteraction(ctx, {
      type: 'SELECT_TARGET', candidates: candNA, count: 1, optional: false,
      targetScope: 'opp_field', thenAction: thenNA as EffectAction,
    });
  }
  // INTERNAL_NEGATE_ABILITY: 選択シグニの能力を無効化
  if (stub.id === 'INTERNAL_NEGATE_ABILITY') {
    const cnINA = ctx.lastProcessedCards?.[0];
    if (!cnINA) return done(addLog(ctx, '対象なし'));
    const inOwnINA = ctx.ownerState.field.signi.some(s => s?.at(-1) === cnINA);
    if (inOwnINA) {
      const newOwnerINA: PlayerState = { ...ctx.ownerState, abilities_removed: [...(ctx.ownerState.abilities_removed ?? []), cnINA] };
      return done(addLog({ ...ctx, ownerState: newOwnerINA }, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}の能力を無効化`));
    }
    if ((ctx.otherProtectedSigniNums ?? []).includes(cnINA)) {
      return done(addLog(ctx, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}は保護されているため能力を失わない`));
    }
    const newOtherINA: PlayerState = { ...ctx.otherState, abilities_removed: [...(ctx.otherState.abilities_removed ?? []), cnINA] };
    return done(addLog({ ...ctx, otherState: newOtherINA }, `${ctx.cardMap.get(cnINA)?.CardName ?? cnINA}の能力を無効化`));
  }
  // === バッチ11: デッキ/エナ/ドロー系 ===
  // RESONANCE_COST_CARDS_TO_ENERGY: レゾナコストカードをエナゾーンへ
  if (stub.id === 'RESONANCE_COST_CARDS_TO_ENERGY') {
    const cardsRCCTE = ctx.lastProcessedCards ?? [];
    if (cardsRCCTE.length === 0) return done(addLog(ctx, 'レゾナコストカードなし'));
    const newSRCCTE: PlayerState = {
      ...ctx.ownerState,
      energy: [...ctx.ownerState.energy, ...cardsRCCTE],
      trash: ctx.ownerState.trash.filter(c => !cardsRCCTE.includes(c)),
    };
    return done(addLog({ ...ctx, ownerState: newSRCCTE }, `レゾナコスト${cardsRCCTE.length}枚→エナゾーンへ`));
  }
  // ENERGY_TO_TRASH: 自分のエナゾーンの末尾カード→トラッシュ
  if (stub.id === 'ENERGY_TO_TRASH') {
    const sETT = ctx.ownerState;
    if (sETT.energy.length === 0) return done(addLog(ctx, 'エナゾーンなし'));
    const lastEnaETT = sETT.energy.at(-1)!;
    const newSETT: PlayerState = {
      ...sETT,
      energy: sETT.energy.slice(0, -1),
      trash: [...sETT.trash, lastEnaETT],
    };
    return done(addLog({ ...ctx, ownerState: newSETT }, `${ctx.cardMap.get(lastEnaETT)?.CardName ?? lastEnaETT}をエナ→トラッシュ`));
  }
  // EACH_PLAYER_DRAW_DISCARD は上位ハンドラ（line 1031）で処理済み
  // DRAW_DISCARD_COUNT_PLUS_N: N枚引いてM枚捨てる
  if (stub.id === 'DRAW_DISCARD_COUNT_PLUS_N') {
    const toHWDDCPN = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcDDCPN = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtDDCPN = srcDDCPN ? (srcDDCPN.EffectText ?? '') + ' ' + (srcDDCPN.BurstText ?? '') : '';
    const mDrawDDCPN = txtDDCPN.match(/([０-９\d]+)枚引く/);
    const mDiscDDCPN = txtDDCPN.match(/([０-９\d]+)枚捨てる/);
    const drawNDDCPN = mDrawDDCPN ? parseInt(toHWDDCPN(mDrawDDCPN[1] ?? '1')) : 1;
    const discNDDCPN = mDiscDDCPN ? parseInt(toHWDDCPN(mDiscDDCPN[1] ?? '1')) : 1;
    let sDDCPN = ctx.ownerState;
    const canDrawDDCPN = Math.min(drawNDDCPN, sDDCPN.deck.length);
    sDDCPN = { ...sDDCPN, hand: [...sDDCPN.hand, ...sDDCPN.deck.slice(0, canDrawDDCPN)], deck: sDDCPN.deck.slice(canDrawDDCPN) };
    const newCtxDDCPN = { ...ctx, ownerState: sDDCPN };
    if (discNDDCPN > 0 && sDDCPN.hand.length > 0) {
      const thenDDCPN: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
      return needsInteraction(addLog(newCtxDDCPN, `${drawNDDCPN}枚ドロー→${discNDDCPN}枚捨て選択`), {
        type: 'SELECT_TARGET',
        candidates: sDDCPN.hand,
        count: Math.min(discNDDCPN, sDDCPN.hand.length),
        optional: false,
        targetScope: 'self_hand',
        thenAction: thenDDCPN as EffectAction,
      });
    }
    return done(addLog(newCtxDDCPN, `${drawNDDCPN}枚ドロー`));
  }
  // PLACE_LIMIT_UPPER: 【リミットアッパー】トークンをルリグゾーンに置く（1つまで）
  // トークン効果（ルリグ1体かつレベル3以上でリミット+2）はBattleScreenのリミット計算側で適用
  if (stub.id === 'PLACE_LIMIT_UPPER') {
    if (ctx.ownerState.limit_upper_token) {
      return done(addLog(ctx, '【リミットアッパー】は既にルリグゾーンにある（1つまで）'));
    }
    const newSPLU: PlayerState = { ...ctx.ownerState, limit_upper_token: true };
    return done(addLog({ ...ctx, ownerState: newSPLU }, '【リミットアッパー】をルリグゾーンに置く（ルリグ1体かつレベル3以上でリミット+2）'));
  }
  // LOOK_DECK_BOTTOM: デッキ下を1枚確認
  if (stub.id === 'LOOK_DECK_BOTTOM') {
    const sLDB = ctx.ownerState;
    if (sLDB.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const bottomLDB = sLDB.deck.at(-1)!;
    // resumeLookAndReorder がカードをデッキに戻すため、先にデッキから取り除く（戻さないと複製される）
    const newSLDB: PlayerState = { ...sLDB, deck: sLDB.deck.slice(0, -1) };
    return needsInteraction({ ...ctx, ownerState: newSLDB }, {
      type: 'LOOK_AND_REORDER',
      cards: [bottomLDB],
      canTrash: false,
      destLocation: 'deck',
      destOwner: 'self',
      destPosition: 'bottom',
      private: true,
    });
  }
  // LOOK_TOP_BOTTOM: デッキ上1枚とデッキ下1枚を確認
  if (stub.id === 'LOOK_TOP_BOTTOM') {
    const sLTB = ctx.ownerState;
    if (sLTB.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const topLTB = sLTB.deck[0];
    const bottomLTB = sLTB.deck.at(-1)!;
    const cardsLTB = sLTB.deck.length === 1 ? [topLTB] : [topLTB, bottomLTB];
    // resumeLookAndReorder がカードをデッキに戻すため、先にデッキから取り除く（戻さないと複製される）
    const newDeckLTB = sLTB.deck.length === 1 ? [] : sLTB.deck.slice(1, -1);
    const newSLTB: PlayerState = { ...sLTB, deck: newDeckLTB };
    return needsInteraction({ ...ctx, ownerState: newSLTB }, {
      type: 'LOOK_AND_REORDER',
      cards: cardsLTB,
      canTrash: false,
      destLocation: 'deck',
      destOwner: 'self',
      // 1枚目(デッキ上のカード)→トップ、2枚目(デッキ下のカード)→ボトムに戻す
      destPosition: 'first_top_rest_bottom',
      private: true,
    });
  }
  // LOOK_TOP_OPP_CHOOSE_TRASH: デッキ上N枚を公開し相手が1枚選んでトラッシュ
  if (stub.id === 'LOOK_TOP_OPP_CHOOSE_TRASH') {
    const toHWLTOCT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const srcLTOCT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtLTOCT = srcLTOCT ? (srcLTOCT.EffectText ?? '') + ' ' + (srcLTOCT.BurstText ?? '') : '';
    const mLTOCT = txtLTOCT.match(/上から([０-９\d]+)枚/);
    const nLTOCT = mLTOCT ? parseInt(toHWLTOCT(mLTOCT[1])) : 3;
    const sLTOCT = ctx.ownerState;
    if (sLTOCT.deck.length === 0) return done(addLog(ctx, 'デッキなし'));
    const visLTOCT = sLTOCT.deck.slice(0, Math.min(nLTOCT, sLTOCT.deck.length));
    const thenLTOCT: StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_CARD' };
    return needsInteraction(addLog(ctx, `デッキ上${visLTOCT.length}枚公開`), {
      type: 'SELECT_TARGET',
      candidates: visLTOCT,
      count: 1,
      optional: false,
      targetScope: 'self_hand' as TargetScope,
      thenAction: thenLTOCT as EffectAction,
      opponentResponds: true,
    });
  }
  // ALL_PLAYER_MILL: 各プレイヤーがデッキ上N枚をトラッシュ
  if (stub.id === 'ALL_PLAYER_MILL') {
    const srcAPM = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtAPM = srcAPM ? (srcAPM.EffectText ?? '') + ' ' + (srcAPM.BurstText ?? '') : '';
    const toHWAPM = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mAPM = txtAPM.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/) ||
                 txtAPM.match(/デッキの上から([０-９\d]+)枚.*トラッシュ/);
    const cntAPM = mAPM ? parseInt(toHWAPM(mAPM[1])) : 1;
    const selfMillAPM = ctx.ownerState.deck.slice(0, Math.min(cntAPM, ctx.ownerState.deck.length));
    const oppMillAPM  = ctx.otherState.deck.slice(0, Math.min(cntAPM, ctx.otherState.deck.length));
    const newOwnerAPM: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(selfMillAPM.length), trash: [...ctx.ownerState.trash, ...selfMillAPM] };
    const newOtherAPM: PlayerState = { ...ctx.otherState, deck: ctx.otherState.deck.slice(oppMillAPM.length),  trash: [...ctx.otherState.trash,  ...oppMillAPM]  };
    return done(addLog({ ...ctx, ownerState: newOwnerAPM, otherState: newOtherAPM },
      `各プレイヤーデッキ上${cntAPM}枚トラッシュ`));
  }
  // SUPPRESS_OPP_SIGNI_ABILITIES: 相手フィールドの全シグニの能力を消去
  if (stub.id === 'SUPPRESS_OPP_SIGNI_ABILITIES') {
    const oppTopsSOS = ctx.otherState.field.signi
      .map(s => s?.at(-1))
      .filter((n): n is string => !!n && !(ctx.otherProtectedSigniNums ?? []).includes(n));
    const newRemovedSOS = [...new Set([...(ctx.otherState.abilities_removed ?? []), ...oppTopsSOS])];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, abilities_removed: newRemovedSOS } },
      '相手フィールドの全シグニの能力を消去'));
  }
  // END_ATTACK_IF_EXTRA_TURN: 追加ターンならアタックフェイズを終了（ATTACK_SIGNI/LRIG封じ）
  if (stub.id === 'END_ATTACK_IF_EXTRA_TURN') {
    if (!ctx.ownerState.extra_turn) return done(addLog(ctx, '追加ターンでない → スキップ'));
    const newBlockedEAIET = [...new Set([...(ctx.ownerState.blocked_actions ?? []), 'ATTACK_SIGNI', 'ATTACK_LRIG'])];
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, blocked_actions: newBlockedEAIET } },
      '追加ターン中のアタックを全封じ（アタックフェイズ終了）'));
  }
  // BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN: 相手ターン中、相手はシグニを配置できない
  if (stub.id === 'BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN') {
    const newBlockedBOSP = [...(ctx.otherState.blocked_actions ?? []), 'PLACE_SIGNI'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedBOSP } },
      '相手はシグニを配置できない'));
  }
  // PREVENT_OPP_UPKEEP: 相手のアップキープ（アップ）を防ぐ
  if (stub.id === 'PREVENT_OPP_UPKEEP') {
    const newBlockedPOU = [...(ctx.otherState.blocked_actions ?? []), 'UPKEEP'];
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, blocked_actions: newBlockedPOU } },
      '相手はアップキープできない'));
  }
  // DRAW_IF_OPP_DISCARDED_HAND: 相手が手札を捨てたときドロー（トリガー系・ログのみ）
  if (stub.id === 'DRAW_IF_OPP_DISCARDED_HAND') {
    return done(addLog(ctx, '[相手手札捨て時ドロートリガー: BattleScreen側未実装]'));
  }
  // OPTIONAL_DISCARD_GUARD: 手札から任意カードを捨ててガード可能フラグを設定
  if (stub.id === 'OPTIONAL_DISCARD_GUARD') {
    const newOwnerODG: PlayerState = { ...ctx.ownerState, optional_discard_guard_enabled: true };
    return done(addLog({ ...ctx, ownerState: newOwnerODG }, '手札から任意カードを捨ててガード可能（このターン）'));
  }
  // ADJACENT_SIGNI_POWER_MOD: このシグニと隣接するシグニ最大2体のパワーを修正
  if (stub.id === 'ADJACENT_SIGNI_POWER_MOD') {
    const zoneIdxADJ = ctx.sourceCardNum
      ? ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === ctx.sourceCardNum)
      : -1;
    if (zoneIdxADJ === -1) return done(addLog(ctx, 'ADJACENT_SIGNI_POWER_MOD: ゾーンが見つかりません'));
    const adjNumsADJ: string[] = [];
    if (zoneIdxADJ > 0) {
      const adj = ctx.ownerState.field.signi[zoneIdxADJ - 1]?.at(-1);
      if (adj) adjNumsADJ.push(adj);
    }
    if (zoneIdxADJ < 2) {
      const adj = ctx.ownerState.field.signi[zoneIdxADJ + 1]?.at(-1);
      if (adj) adjNumsADJ.push(adj);
    }
    if (adjNumsADJ.length === 0) return done(addLog(ctx, '隣接シグニなし（ADJACENT_SIGNI_POWER_MOD）'));
    // deltaをカードテキストから取得（未記述なら+3000デフォルト）
    const srcADJ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    const txtADJ = srcADJ ? (srcADJ.EffectText ?? '') : '';
    const toHWADJ = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    const mADJ = txtADJ.match(/[＋+]([０-９\d]+)/);
    const deltaADJ = mADJ ? parseInt(toHWADJ(mADJ[1])) : 3000;
    const modsADJ = [
      ...(ctx.ownerState.temp_power_mods ?? []),
      ...adjNumsADJ.map(cn => ({ cardNum: cn, delta: deltaADJ })),
    ];
    const newOwnerADJ = { ...ctx.ownerState, temp_power_mods: modsADJ };
    return done(addLog({ ...ctx, ownerState: newOwnerADJ }, `隣接${adjNumsADJ.length}体パワー+${deltaADJ}`));
  }

  // OPP_DRAW_LIMIT_PER_TURN: ドローフェイズ中の相手ドローを1枚に制限（BattleScreen側処理）
  if (stub.id === 'OPP_DRAW_LIMIT_PER_TURN') {
    return done(addLog(ctx, '対戦相手のドローフェイズのドロー上限：１枚（BattleScreen側処理）'));
  }
  // REDIRECT_ATTACK_TO_SELF_ZONE: 相手シグニの直接アタックをこのシグニゾーンにリダイレクト（BattleScreen側処理）
  if (stub.id === 'REDIRECT_ATTACK_TO_SELF_ZONE') {
    return done(addLog(ctx, '正面アタックをこのシグニゾーンへリダイレクト（BattleScreen側処理）'));
  }
  // BATTLE_LEAVE_REPLACE_WITH_DOWN: バトル・相手効果による場離れをダウンに置換（任意）（BattleScreen側処理）
  if (stub.id === 'BATTLE_LEAVE_REPLACE_WITH_DOWN') {
    return done(addLog(ctx, '場離れ代替ダウン（BattleScreen側処理）'));
  }
  // REMOVE_SELF_SIGNI_FROM_GAME: このシグニをゲームから除外する（クラフトルール適用）
  if (stub.id === 'REMOVE_SELF_SIGNI_FROM_GAME') {
    const srcCnRSG = ctx.sourceCardNum;
    if (!srcCnRSG) return done(addLog(ctx, 'REMOVE_SELF_SIGNI_FROM_GAME: ソースなし'));
    const removedRSG = removeFromField(srcCnRSG, ctx.ownerState);
    const newOwnerRSG: PlayerState = { ...removedRSG, trash: [...removedRSG.trash, srcCnRSG] };
    return done(addLog({ ...ctx, ownerState: newOwnerRSG },
      `${ctx.cardMap.get(srcCnRSG)?.CardName ?? srcCnRSG}をゲームから除外`));
  }

  // MOVE_LRIG_TRASH_UNDER: ルリグトラッシュからルリグをセンタールリグの下に置き、白/黒アーツをルリグデッキへ
  if (stub.id === 'MOVE_LRIG_TRASH_UNDER') {
    const lrigTrash = ctx.ownerState.lrig_trash;
    const lrigsMLTU = lrigTrash.filter(cn => ctx.cardMap.get(cn)?.Type === 'ルリグ');
    const whiteBlackArtsMLTU = lrigTrash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      if (c?.Type !== 'アーツ') return false;
      const color = c.Color ?? '';
      return color.includes('白') || color.includes('黒');
    });
    const remaining = lrigTrash.filter(cn => !lrigsMLTU.includes(cn) && !whiteBlackArtsMLTU.includes(cn));
    // ルリグをlrig_deckの末尾（スタック下）へ、アーツをlrig_deckの先頭へ
    const newLrigDeck = [...whiteBlackArtsMLTU, ...(ctx.ownerState.lrig_deck ?? []), ...lrigsMLTU];
    const newOwnerMLTU: PlayerState = { ...ctx.ownerState, lrig_trash: remaining, lrig_deck: newLrigDeck };
    return done(addLog({ ...ctx, ownerState: newOwnerMLTU, lastProcessedCards: [...lrigsMLTU, ...whiteBlackArtsMLTU] },
      `ルリグ${lrigsMLTU.length}枚をデッキ下に、白/黒アーツ${whiteBlackArtsMLTU.length}枚をルリグデッキに追加`));
  }
  // INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュにあるルリグの起動能力を継承する（BattleScreen側処理）
  if (stub.id === 'INHERIT_LRIG_TRASH_ABILITIES') {
    return done(addLog(ctx, 'ルリグトラッシュにあるルリグの起動能力を継承（BattleScreen側処理）'));
  }
  // FORCE_COLOR_BLACK: エナゾーン以外の領域にあるシグニは黒になる（collectFieldSigniExtraColorsで処理）
  if (stub.id === 'FORCE_COLOR_BLACK') {
    return done(addLog(ctx, 'エナゾーン以外のシグニは黒（effectEngine collectFieldSigniExtraColors処理）'));
  }
  // REORDER_LIFE_CLOTHS: ライフクロスを好きな枚数トラッシュに置き同数デッキ上から補充し並び替え
  if (stub.id === 'REORDER_LIFE_CLOTHS') {
    // INTERNAL_REORDER_LIFE_APPLY で枚数を受け取り処理
    const lifeCount = ctx.ownerState.life_cloth.length;
    if (lifeCount === 0) return done(addLog(ctx, 'ライフクロスが0枚のためスキップ'));
    // 0〜lifeCount枚の選択肢を提示
    const optsRLC = Array.from({ length: lifeCount + 1 }, (_, i) => ({
      id: `count_${i}`,
      label: i === 0 ? '並び替えなし（0枚）' : `${i}枚をデッキ上と入れ替え`,
      action: ({ type: 'STUB', id: 'INTERNAL_REORDER_LIFE_APPLY', value: i } as StubAction) as EffectAction,
      available: i === 0 || ctx.ownerState.deck.length >= i,
    }));
    return needsInteraction(addLog(ctx, `ライフクロスを何枚入れ替えますか？（デッキ${ctx.ownerState.deck.length}枚）`), {
      type: 'CHOOSE', count: 1, options: optsRLC,
    });
  }
  // INTERNAL_REORDER_LIFE_APPLY: N枚のライフをトラッシュに置き、デッキ上からN枚をライフに追加
  if (stub.id === 'INTERNAL_REORDER_LIFE_APPLY') {
    const n = typeof stub.value === 'number' ? stub.value : 0;
    if (n === 0) return done(addLog(ctx, 'ライフクロス入れ替えなし'));
    const actual = Math.min(n, ctx.ownerState.life_cloth.length, ctx.ownerState.deck.length);
    const toTrash = ctx.ownerState.life_cloth.slice(0, actual);
    const newLife = ctx.ownerState.life_cloth.slice(actual);
    const fromDeck = ctx.ownerState.deck.slice(0, actual);
    const newDeck = ctx.ownerState.deck.slice(actual);
    const newOwnerIRL: PlayerState = {
      ...ctx.ownerState,
      life_cloth: [...newLife, ...fromDeck],
      trash: [...ctx.ownerState.trash, ...toTrash],
      deck: newDeck,
    };
    return done(addLog({ ...ctx, ownerState: newOwnerIRL, lastProcessedCards: fromDeck },
      `ライフクロス${actual}枚をトラッシュに置き、デッキ上${actual}枚をライフに追加`));
  }
  // FROZEN_LOSES_ABILITIES: 対戦相手の凍結状態のシグニは能力を失う（effectEngineで処理）
  if (stub.id === 'FROZEN_LOSES_ABILITIES') {
    return done(addLog(ctx, '凍結シグニは能力を失う（effectEngine側処理）'));
  }
  // OPTIONAL_RETURN_TO_LRIG_DECK: 任意コストを支払ってルリグトラッシュからルリグをルリグデッキに戻す
  if (stub.id === 'OPTIONAL_RETURN_TO_LRIG_DECK') {
    const costColorsORL = stub.costColors ?? ['青'];
    const lrigInTrashORL = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'ルリグ');
    if (lrigInTrashORL.length === 0) {
      return done(addLog(ctx, 'ルリグトラッシュにルリグなし→スキップ'));
    }
    const canAffordORL = canPayOptionalCost(costColorsORL, ctx.ownerState, ctx.cardMap);
    const payLabelORL = `発動する（${costColorsORL.map(c => `《${c}》`).join('')}）`;
    const payActionORL: StubAction = { type: 'STUB', id: 'INTERNAL_RETURN_LRIG_TO_DECK' };
    const noopORL: import('../types/effects').SequenceAction = { type: 'SEQUENCE', steps: [] };
    return needsInteraction(addLog(ctx, 'ルリグをルリグデッキに戻しますか？'), {
      type: 'CHOOSE', count: 1,
      options: [
        { id: 'pay',  label: payLabelORL, action: payActionORL as EffectAction, available: canAffordORL, costColors: costColorsORL },
        { id: 'skip', label: 'スキップ', action: noopORL as EffectAction, available: true },
      ],
    });
  }
  // INTERNAL_RETURN_LRIG_TO_DECK: ルリグトラッシュの最初のルリグをlrig_deckへ移動
  if (stub.id === 'INTERNAL_RETURN_LRIG_TO_DECK') {
    const lrigInTrashIRL = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'ルリグ');
    if (lrigInTrashIRL.length === 0) {
      return done(addLog(ctx, 'ルリグトラッシュにルリグなし'));
    }
    const targetIRL = lrigInTrashIRL[0];
    const newLrigTrash = ctx.ownerState.lrig_trash.filter(cn => cn !== targetIRL);
    const newLrigDeck = [...(ctx.ownerState.lrig_deck ?? []), targetIRL];
    const newOwner = { ...ctx.ownerState, lrig_trash: newLrigTrash, lrig_deck: newLrigDeck };
    const cardName = ctx.cardMap.get(targetIRL)?.CardName ?? targetIRL;
    return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: [targetIRL] },
      `${cardName}をルリグデッキに戻した`));
  }
  // TRASH_AT_TURN_END: ターン終了時にlastProcessedCardsのシグニをフィールドからトラッシュに置く（WX02-005 ホワイト・ホープ）
  if (stub.id === 'TRASH_AT_TURN_END') {
    const targets = ctx.lastProcessedCards ?? [];
    if (targets.length === 0) return done(addLog(ctx, 'ターン終了時トラッシュ対象なし'));
    const existing = ctx.ownerState.turn_end_field_trash_targets ?? [];
    const newTargets = [...new Set([...existing, ...targets])];
    const newOwnerTATTE = { ...ctx.ownerState, turn_end_field_trash_targets: newTargets };
    return done(addLog({ ...ctx, ownerState: newOwnerTATTE },
      `ターン終了時にトラッシュ予定: ${targets.map(n => ctx.cardMap.get(n)?.CardName ?? n).join(', ')}`));
  }

  // DECLARE_AND_MILL: effects.jsonではDECLARE_NUMBER+MILL(useDeclaredCount)に移行済み
  if (stub.id === 'DECLARE_AND_MILL') {
    return done(addLog(ctx, '宣言枚数ミル（effects.json側でDECLARE_NUMBER+MILLに移行済み）'));
  }

  // RETURN_ANGEL_SIGNI_TO_DECK: トラッシュから天使シグニ7枚をデッキ下に置く（WX06-001 タウィル＝フィーラ E2）
  if (stub.id === 'RETURN_ANGEL_SIGNI_TO_DECK') {
    const angelCards = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (c?.CardClass?.includes('天使') || c?.Story?.includes('天使'));
    });
    if (angelCards.length < 7) {
      return done(addLog(ctx, `トラッシュの天使シグニが${angelCards.length}枚（7枚必要）→スキップ`));
    }
    const toReturn = angelCards.slice(0, 7);
    const newTrash = ctx.ownerState.trash.filter(cn => !toReturn.includes(cn));
    const newDeck = [...ctx.ownerState.deck, ...toReturn];
    const newOwner = { ...ctx.ownerState, trash: newTrash, deck: newDeck };
    return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: toReturn }, `天使シグニ${toReturn.length}枚をデッキ下に配置`));
  }

  // RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK: トラッシュから名前の異なる天使シグニ7枚をデッキ下に置く（WX06-001 E3）
  if (stub.id === 'RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK') {
    const angelCardsUA = ctx.ownerState.trash.filter(cn => {
      const c = ctx.cardMap.get(cn);
      return c?.Type === 'シグニ' && (c?.CardClass?.includes('天使') || c?.Story?.includes('天使'));
    });
    const seenNamesUA = new Set<string>();
    const uniqueUA = angelCardsUA.filter(cn => {
      const name = ctx.cardMap.get(cn)?.CardName ?? cn;
      if (seenNamesUA.has(name)) return false;
      seenNamesUA.add(name);
      return true;
    });
    if (uniqueUA.length < 7) {
      return done(addLog(ctx, `名前の異なる天使シグニが${uniqueUA.length}枚（7枚必要）→スキップ`));
    }
    const toReturnUA = uniqueUA.slice(0, 7);
    const newTrashUA = ctx.ownerState.trash.filter(cn => !toReturnUA.includes(cn));
    const newDeckUA = [...ctx.ownerState.deck, ...toReturnUA];
    const newOwnerUA = { ...ctx.ownerState, trash: newTrashUA, deck: newDeckUA };
    return done(addLog({ ...ctx, ownerState: newOwnerUA, lastProcessedCards: toReturnUA }, `名前の異なる天使シグニ${toReturnUA.length}枚をデッキ下に配置`));
  }

  // NEGATE_SPELL: コスト合計5以下のスペルを打ち消す（WX11-017 ブルー・パニッシュ）
  if (stub.id === 'NEGATE_SPELL') {
    return done(addLog({ ...ctx, otherState: { ...ctx.otherState, spell_negated_this_turn: true } },
      'スペル打ち消し（BattleScreen側でアーツ使用を無効化）'));
  }

  // GRANT_TURN_TRIGGER_3RD_DOWN: このターン植物シグニ3回目ダウン時トリガー付与（WX05-042 増武）
  if (stub.id === 'GRANT_TURN_TRIGGER_3RD_DOWN') {
    return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, turn_trigger_3rd_plant_down: true } },
      'このターン、植物シグニが3回目ダウンになったときの効果を付与'));
  }

  // RETURN_ANGEL_SIGNI_TO_DECK: トラッシュの天使シグニ7枚をデッキ下へ（WX06-001）
  // 条件達成時に lastProcessedCards を設定 → 後続の conditional:true BANISH が発動
  if (stub.id === 'RETURN_ANGEL_SIGNI_TO_DECK') {
    const angelNums = ctx.ownerState.trash.filter(cn =>
      ctx.cardMap.get(cn)?.CardClass?.includes('天使'),
    );
    if (angelNums.length < 7) {
      return done(addLog({ ...ctx, lastProcessedCards: [] },
        `天使シグニが${angelNums.length}枚（7枚必要）→ 効果なし`));
    }
    const toBottom = angelNums.slice(0, 7);
    const newTrash = ctx.ownerState.trash.filter(cn => !toBottom.includes(cn));
    const newDeck = [...ctx.ownerState.deck, ...toBottom];
    const newOwner = { ...ctx.ownerState, trash: newTrash, deck: newDeck };
    return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: toBottom },
      `トラッシュの天使シグニ${toBottom.length}枚をデッキ下へ`));
  }

  // RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK: 名前の異なる天使シグニ7枚をデッキ下へ（WX06-001）
  if (stub.id === 'RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK') {
    const angelByName = new Map<string, string>(); // name → first instance ID
    for (const cn of ctx.ownerState.trash) {
      const card = ctx.cardMap.get(cn);
      if (!card?.CardClass?.includes('天使')) continue;
      const name = card.CardName;
      if (!angelByName.has(name)) angelByName.set(name, cn);
    }
    if (angelByName.size < 7) {
      return done(addLog({ ...ctx, lastProcessedCards: [] },
        `名前の異なる天使シグニが${angelByName.size}種（7種必要）→ 効果なし`));
    }
    const toBottom = [...angelByName.values()].slice(0, 7);
    const newTrash = ctx.ownerState.trash.filter(cn => !toBottom.includes(cn));
    const newDeck = [...ctx.ownerState.deck, ...toBottom];
    const newOwner = { ...ctx.ownerState, trash: newTrash, deck: newDeck };
    return done(addLog({ ...ctx, ownerState: newOwner, lastProcessedCards: toBottom },
      `名前の異なる天使シグニ${toBottom.length}枚をデッキ下へ`));
  }

  // FROZEN_LOSES_ABILITIES: 対戦相手の凍結状態シグニは能力を失う（WX09-Re01 CONTINUOUS）
  // applyEffects(effectEngine)でCONTINUOUSパワー修正をスキップ済み。execStub経由では no-op。
  if (stub.id === 'FROZEN_LOSES_ABILITIES') {
    return done(addLog(ctx, '対戦相手の凍結シグニは能力を失う（常在効果・effectEngineで適用）'));
  }

  // DECLARE_NUMBER: 数字を宣言する（DECLARE_AND_MILLの分離STUBとして使用）
  // → execStub.tsではDECLARE_NUMBERが既に実装済み（STUBS.md ✅）のため不要

  return null;
}
