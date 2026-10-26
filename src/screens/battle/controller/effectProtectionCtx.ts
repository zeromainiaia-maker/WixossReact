import { applyContinuousBaseLevelOverride, applyDeclaredZoneClassOverride, calcContinuousBlockedActions, calcFieldPowers, collectAbilityGainProtectedSigni, collectAbilityProtectedSigni, collectAttackNegationProtectedSigni, collectAttackPhaseLevelOverrides, collectAllColorSigniForField, collectBanishBySourceProtectedSigni, collectBanishEffectProtectedSigni, collectBounceProtectedSigni, collectCharmShieldSigni, collectDeckTrashLevel1Nums, collectDownProtectedSigni, collectEffectImmuneSigni, collectFieldSigniExtraColors, collectOppTrashLoseColorClass, collectProtectedZoneRules, collectProtectedZones, collectSelfTrashPreventNums, collectTrashFieldProtectedSigni, collectTreatAsClassAllZones } from '../../../engine/effectEngine';
import { type ExecCtx } from '../../../engine/effectExecutor';
import { type BattleStateRow, type CardData, type PlayerState } from '../../../types';
import { type CardEffect } from '../../../types/effects';

/**
 * 🆕2026-10-26＝**効果を解決するときの保護・常時効果の材料**（「対戦相手の効果を受けない」・バニッシュ耐性・配置先の保護…）。
 * `resolveStackStep`（人間と CPU の実戦のスタック解決）から**逐語で移設**した＝CPU の先読み（`cpuLookahead.simulateEffect`）も同じ関数で組む。
 * 🔴**なぜ要るか**（`scripts/cpuSimDrift.ts`）＝先読みはこれを渡しておらず、《不可解な誇超　コンテンポラ》のような
 *   「対戦相手の効果を受けない」シグニも対象にできる前提で手を選んでいた（実戦では何も起きない【起】を撃つ）。
 */
export interface EffectProtectionInput {
  ownerState: PlayerState;
  otherState: PlayerState;
  isOwnerTurn: boolean;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  turnPhase: BattleStateRow['turn_phase'];
  /** 解決中の効果の発生源（耐性の「ルリグの効果／シグニの効果」の判定に使う）。 */
  sourceCardNum: string;
  effectType: CardEffect['effectType'];
}

export function effectProtectionMaterials({ ownerState, otherState, isOwnerTurn, cardMap, effectsMap, turnPhase, sourceCardNum, effectType }: EffectProtectionInput) {
  // 【英知】条件のレベル読み替えを収集（位相限定かどうかは収集側が原文から判定する）。
  // 値は**取りうるレベル群**なので `eichi_level_options` に入れる（単一値の
  // `attack_phase_level_overrides` は SET_BASE_LEVEL 等が使う別物）。
  const ownerLevelOverrides = collectAttackPhaseLevelOverrides(ownerState, effectsMap, cardMap, turnPhase ?? undefined);
  const ownerStateForCtx = Object.keys(ownerLevelOverrides).length > 0
    ? { ...ownerState, eichi_level_options: ownerLevelOverrides } : ownerState;
  const ctxPowers = calcFieldPowers(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, cardMap, turnPhase);
  // PREVENT_ZONE_MOVE_BY_OPP: 相手（otherState）の保護ゾーンを動的計算してctxに渡す
  const otherProtectedZoneRules = collectProtectedZoneRules(otherState, cardMap, effectsMap, turnPhase ?? undefined);
  const otherProtectedZones = collectProtectedZones(otherState, cardMap, effectsMap, turnPhase ?? undefined);
  // PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 相手フィールドの能力保護シグニを動的計算してctxに渡す
  const otherProtectedSigniNums = collectAbilityProtectedSigni(otherState, ownerStateForCtx, cardMap, effectsMap, !isOwnerTurn);
  const otherAttackNegationProtectedNums = collectAttackNegationProtectedSigni(otherState, ownerStateForCtx, cardMap, effectsMap, !isOwnerTurn);
  // PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL: 相手フィールドのダウン保護シグニ
  // !isOwnerTurn: 相手(otherState)視点での isOwnerTurn を渡す（collectAbilityProtectedSigni と同じ慣例）
  const otherDownProtectedNums = collectDownProtectedSigni(otherState, cardMap, effectsMap, ownerStateForCtx, !isOwnerTurn);
  // SIGNI_CANT_BOUNCE_FROM_FIELD: 相手フィールドのバウンス保護シグニ
  const otherBounceProtectedNums = collectBounceProtectedSigni(otherState, cardMap, effectsMap, ownerStateForCtx, !isOwnerTurn, turnPhase);
  // GRANT_PROTECTION from=['BANISH'/'any']: 相手フィールドのバニッシュ保護シグニ
  const otherBanishProtectedNums = collectBanishEffectProtectedSigni(otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, cardMap, undefined, 'opponent', turnPhase);
  // 発生源無限定（sourceOwner:any）の耐性は、自分の効果で自場をバニッシュする場合にも有効。
  // opponent 指定はこの集合へ入らないため、既存の相手限定耐性は広がらない。
  const ownBanishProtectedNums0 = collectBanishEffectProtectedSigni(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, cardMap, ctxPowers, 'self', turnPhase);
  // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_NON_FIELD_MOVE_BY_OPP / SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: 相手フィールドのトラッシュ保護シグニ
  const otherTrashFieldProtectedNums = collectTrashFieldProtectedSigni(otherState, cardMap, effectsMap, ownerStateForCtx, !isOwnerTurn);
  // SELF_TRASH_PREVENT（WX07-033）: 効果オーナー自身が自シグニをトラッシュに置けない制限（§6.1）
  const ownSelfTrashPreventNums = collectSelfTrashPreventNums(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, cardMap);
  // PREVENT_OPP_SIGNI_ABILITY_GAIN / PREVENT_ABILITY_CHANGE_BY_OPP: 能力付与保護シグニ
  // !isOwnerTurn: 第1引数 otherState（相手）視点でのisOwnerTurnを渡す
  const otherAbilityGainProtectedNums0 = collectAbilityGainProtectedSigni(otherState, ownerStateForCtx, cardMap, effectsMap, !isOwnerTurn);
  // GRANT_PROTECTION from=['ルリグ'/'シグニ'…] 完全効果耐性（「対戦相手の、ルリグとシグニの効果を受けない」WX04-035-E1等）:
  // 解決中効果のソースカード種別が耐性対象に該当する場合、その美巧シグニを全保護パスへ反映する。
  const immuneSourceType = cardMap.get(sourceCardNum)?.Type ?? '';
  const otherEffectImmuneNums = collectEffectImmuneSigni(otherState, ownerStateForCtx, cardMap, effectsMap, !isOwnerTurn, immuneSourceType, sourceCardNum, effectType);
  // 🆕**§5.3 `O-284`（2026-09-08）＝自分側の完全効果耐性も対で計算する。**
  //   🔴上の1本だけだと「**対戦相手の効果が自分側を侵すか**」しか判定されず、
  //     `sourceOwner:'any'`（`WX17-001-E1`「自身以外の効果を受けない」）は**自分の効果に対して素通り**だった。
  //   🔑先例＝`collectBanishEffectProtectedSigni` の `otherBanishProtectedNums` / `ownBanishProtectedNums` の対。
  //   ⚠`sourceOwner:'opponent'` の耐性はこの集合に入らない（collector が弾く）＝既存の相手限定耐性は広がらない。
  const ownEffectImmuneNums = collectEffectImmuneSigni(ownerStateForCtx, otherState, cardMap, effectsMap, isOwnerTurn, immuneSourceType, sourceCardNum, effectType, ctxPowers);
  // 「対戦相手の【シグニ】の効果によってバニッシュされない」: ソース種別一致時のみバニッシュ保護（バニッシュ軸限定）
  const otherBanishBySourceNums = collectBanishBySourceProtectedSigni(
    otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, cardMap, immuneSourceType, sourceCardNum,
  );
  const otherDownProtectedNumsM   = [...otherDownProtectedNums, ...otherEffectImmuneNums];
  const otherBounceProtectedNumsM = [...otherBounceProtectedNums, ...otherEffectImmuneNums];
  const otherBanishProtectedNumsM = new Set<string>([...otherBanishProtectedNums, ...otherEffectImmuneNums, ...otherBanishBySourceNums]);
  const otherTrashFieldProtectedNumsM = [...otherTrashFieldProtectedNums, ...otherEffectImmuneNums];
  const otherProtectedSigniNumsM  = [...otherProtectedSigniNums, ...otherEffectImmuneNums];
  // 🆕§5.3 `O-284`＝自分側の完全効果耐性はバニッシュ保護へも union する（相手側と同じ扱い）。
  const ownBanishProtectedNumsM = new Set<string>([...ownBanishProtectedNums0, ...ownEffectImmuneNums]);
  const otherAbilityGainProtectedNums = [...otherAbilityGainProtectedNums0, ...otherEffectImmuneNums];
  // BLOCK_OPP_DECK_TO_ENERGY / BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT
  const contBlockedCtx = calcContinuousBlockedActions(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, cardMap);
  const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerStateForCtx, cardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, cardMap, effectsMap, ownerStateForCtx, !isOwnerTurn)]);
  const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerStateForCtx, cardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, cardMap, effectsMap, ownerStateForCtx, !isOwnerTurn)]);
  // OPP_TRASH_LOSE_COLOR_AND_CLASS: otherState が自ターン中にこの効果を持つとき ownerState のトラッシュが色/クラスを失う
  const oppTrashColorLoss = collectOppTrashLoseColorClass(otherState, ownerStateForCtx, effectsMap, cardMap, !isOwnerTurn);
  const treatAsClassAllZones = collectTreatAsClassAllZones(ownerStateForCtx, otherState, effectsMap, cardMap);
  const deckTrashLevel1Nums = collectDeckTrashLevel1Nums(ownerStateForCtx, otherState, effectsMap, cardMap);
  const declaredCardMap1 = applyContinuousBaseLevelOverride(applyDeclaredZoneClassOverride(cardMap, ownerStateForCtx, otherState), ownerStateForCtx, otherState, effectsMap, isOwnerTurn);
  // CHARM_PROTECTION（WX04-052-E1）: 両プレイヤーのチャーム盾シグニ
  const charmShieldNums = new Set<string>([
    ...collectCharmShieldSigni(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, cardMap),
    ...collectCharmShieldSigni(otherState, ownerStateForCtx, !isOwnerTurn, effectsMap, cardMap),
  ]);
  return { ownerStateForCtx, ctxPowers, declaredCardMap1, otherProtectedZones, otherProtectedZoneRules, otherProtectedSigniNumsM, otherAttackNegationProtectedNums, otherDownProtectedNumsM, otherBounceProtectedNumsM, otherBanishProtectedNumsM, ownBanishProtectedNumsM, otherTrashFieldProtectedNumsM, ownSelfTrashPreventNums, otherAbilityGainProtectedNums, otherEffectImmuneNums, ownEffectImmuneNums, charmShieldNums, contBlockedCtx, allColorSigniNums, fieldSigniExtraColors, oppTrashColorLoss, treatAsClassAllZones, deckTrashLevel1Nums };
}

/** 🆕2026-10-26＝上の材料を `ExecCtx` の欄へ詰めたもの（`resolveStackStep` と同じ詰め方）。`ownerState`／`cardMap` も差し替える。 */
export function effectProtectionCtxFields(m: ReturnType<typeof effectProtectionMaterials>): Partial<ExecCtx> {
  return {
    ownerState: m.ownerStateForCtx, cardMap: m.declaredCardMap1, effectivePowers: m.ctxPowers,
    otherProtectedZones: m.otherProtectedZones, otherProtectedZoneRules: m.otherProtectedZoneRules, otherProtectedSigniNums: m.otherProtectedSigniNumsM,
    otherAttackNegationProtectedNums: m.otherAttackNegationProtectedNums, otherDownProtectedNums: m.otherDownProtectedNumsM,
    otherBounceProtectedNums: m.otherBounceProtectedNumsM, otherBanishProtectedNums: m.otherBanishProtectedNumsM, ownBanishProtectedNums: m.ownBanishProtectedNumsM,
    otherTrashFieldProtectedNums: m.otherTrashFieldProtectedNumsM, ownSelfTrashPreventNums: m.ownSelfTrashPreventNums,
    otherAbilityGainProtectedNums: m.otherAbilityGainProtectedNums, otherEffectImmuneNums: m.otherEffectImmuneNums, ownEffectImmuneNums: m.ownEffectImmuneNums,
    charmShieldNums: m.charmShieldNums, deckToEnergyBlocked: m.contBlockedCtx.forSelf.has('DECK_TO_ENERGY'),
    signiFieldPlaceByEffectBlocked: m.contBlockedCtx.forSelf.has('SIGNI_FIELD_PLACE_BY_EFFECT'), allColorSigniNums: m.allColorSigniNums,
    fieldSigniExtraColors: m.fieldSigniExtraColors, oppTrashColorLoss: m.oppTrashColorLoss, treatAsClassAllZones: m.treatAsClassAllZones,
    deckTrashLevel1Nums: m.deckTrashLevel1Nums,
  };
}
