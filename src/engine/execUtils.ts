import type { PlayerState, CardData, PendingInteractionDef, TargetScope, TurnPhase } from '../types';
import { hasShadowLrig, getShadowScopes, getFieldGrantedShadowScopes, evaluateShadowScope, decodeShadowKeyword } from '../utils/keywords';
import { checkBeatCondition, checkActiveCondition, fieldEffectBanishRedirectToTrash, computeBanishedAttrs, matchesStateFilter, type BanishedCardAttrs } from './effectEngine';
import type {
  CardEffect,
  EffectAction,
  StubAction,
  TargetFilter,
  Owner,
  NumberOrRef,
  CountFromZone,
  Condition,
  SelectionConstraint,
} from '../types/effects';
import { payLrigDownCost } from '../screens/battle/lrigDownCost';
import { computeEffectiveLrigLimit } from '../screens/battle/lrigLimit';
import { matchesTrashArtsFromLrigDeckCost } from '../screens/battle/artsTrashCost';
import { fieldTrashGroupsAffordable } from '../screens/battle/fieldLimit';
import { canPayUnderAnySigniTrash } from '../screens/battle/underAnySigniCost';

// ===== 実行コンテキスト & 結果型 =====

export interface ExecCtx {
  ownerState: PlayerState;   // "self"：効果オーナー
  otherState: PlayerState;   // "opponent"：相手
  cardMap: Map<string, CardData>;
  effectsMap?: Map<string, CardEffect[]>;
  logs: string[];
  effectivePowers?: Map<string, number>; // CONTINUOUS+temp_power_mods 適用済みパワー（powerRangeフィルタ用）
  sourceCardNum?: string;    // 効果発動元カード番号（「このシグニ」参照用）
  sourceEffectId?: string;   // 解決中の効果ID（カード内の別効果を区別する）
  sourcePlacementPending?: boolean; // 使用中スペルが未配置。自己除外を解決後配置の置換として扱う
  triggeringCardNum?: string; // 効果を引き起こしたカード番号（any_ally scope の「それ」参照用）
  triggeringKeyword?: string; // ON_KEYWORD_GAINED で得られたキーワード（COPY_ABILITY の「その能力」参照用・WXDi-P04-035）
  battleAttackerCardNum?: string; // ON_SIGNI_BANISH_OPPONENT/_BATTLE のバトルアタッカー自身（triggeringCardNum は被バニッシュ相手用に既に使用中のため別軸。「そのアタックしているシグニ」参照用・WX17-032）
  banishedSigniPower?: number; // ON_SIGNI_BANISH_BATTLE の被バニッシュシグニのバニッシュ直前実効パワー
  forceEndTurn?: boolean;    // FORCE_END_TURN でセット → BattleScreen がターン終了処理を行う
  currentPhase?: string;     // 現在のターンフェイズ（DURING_PHASE条件チェック用）
  isOwnerTurn?: boolean;     // 効果オーナーのターンか。未設定なら TURN_OWNER は後方互換で成立扱い
  lastProcessedCards?: string[]; // 直前ステップで処理されたカード番号（POWER_MOD_PER_COUNT等で参照）
  lastLookTrashedCards?: string[]; // 直前の LOOK_AND_REORDER で実際にトラッシュへ置いたカード
  storedTargetCards?: string[]; // 任意コスト支払い前に固定した対象（支払いTRASHでlastProcessedCardsが上書きされても保持）
  leftFieldUnderCards?: string[]; // ON_LEAVE_FIELD 発火元の離場直前の下カード
  autoTargetedCards?: string[]; // 選択UIを経ずに自動対象化したシグニ（targetsTriggerSource/targetsLastProcessed）＝ON_TARGETED 収集用（続き137・タスク12(xx)）
  fieldTrashCostCards?: string[]; // この解決ラウンドでコストとして場→トラッシュへ置いたinstanceId（ON_TRASH byEffect 原因弁別用）
  trapActivated?: boolean; // この解決中に《トラップアイコン》が実際に発動した（BattleScreen が完了解決後に watcher を収集）
  trapSetOwners?: Owner[]; // この解決中に【トラップ】を設置した側（効果主から見た owner。設置1回につき1要素）
  // CONTINUOUS保護効果（effectEngine動的計算）: 相手の効果でトラッシュに移動できないゾーン
  // ownerProtected = 効果オーナーの保護, otherProtected = 相手の保護
  otherProtectedZones?: ('hand' | 'energy')[];
  // PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 相手の効果で能力を失えないシグニ（otherState のカード番号）
  otherProtectedSigniNums?: string[];
  // PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_BOUNCE_AND_DOWN_BY_OPP
  otherDownProtectedNums?: string[];
  // SIGNI_CANT_BOUNCE_FROM_FIELD: 相手シグニのバウンス保護（場→手札に戻せないシグニ）
  otherBounceProtectedNums?: string[];
  // GRANT_PROTECTION from=['BANISH'/'any']: 相手効果でバニッシュされないシグニ
  otherBanishProtectedNums?: Set<string>;
  // CHARM_PROTECTION（WX04-052-E1）: バニッシュされる際にチャーム1枚をトラッシュして場に残るシグニ（両プレイヤー分）
  charmShieldNums?: Set<string>;
  // GRANT_PROTECTION from=['ルリグ'/'シグニ'…] 完全効果耐性（「対戦相手の、ルリグとシグニの効果を受けない」）:
  // 解決中効果のソース種別が耐性対象に該当する相手(otherState)シグニ。FREEZE/POWER_MODIFY等の対象から除外する。
  // （バニッシュ/バウンス/ダウン/トラッシュ/能力消失/能力付与は各専用保護セットへ別途 union 済み）
  otherEffectImmuneNums?: Set<string>;
  // BLOCK_OPP_DECK_TO_ENERGY: 相手CONTにより自分のデッキ→エナ効果がブロックされている
  deckToEnergyBlocked?: boolean;
  // BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: 相手CONTにより自分はシグニ効果でシグニを出せない
  signiFieldPlaceByEffectBlocked?: boolean;
  // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_NON_FIELD_MOVE_BY_OPP / SIGNI_PROTECT_MOVE_EXCEPT_ENERGY:
  // 相手効果でフィールドから移動（バウンス/トラッシュ）できないシグニ番号
  otherTrashFieldProtectedNums?: string[];
  // SELF_TRASH_PREVENT（WX07-033）: 効果オーナー自身の効果/コストで場からトラッシュに置けない自シグニ番号
  ownSelfTrashPreventNums?: Set<string>;
  // PREVENT_OPP_SIGNI_ABILITY_GAIN / PREVENT_ABILITY_CHANGE_BY_OPP:
  // 相手効果でキーワード能力を付与できないシグニ番号
  otherAbilityGainProtectedNums?: string[];
  // ALL_COLOR / ALL_ZONE_BLACK / ACCE_SIGNI_ALL_COLOR など: すべての色を持つシグニ番号
  allColorSigniNums?: Set<string>;
  // ALL_ZONE_BLACK / GAIN_LRIG_COLOR / INHERIT_UNDER_SIGNI_COLOR など: 追加色を持つシグニ番号→色配列
  fieldSigniExtraColors?: Map<string, string[]>;
  // OPP_TRASH_LOSE_COLOR_AND_CLASS: 自分（ownerState）のトラッシュのカードが色/クラスを失う
  oppTrashColorLoss?: boolean;
  // TREAT_AS_CLASS_ALL_ZONES: カードNum→クラス名のマップ（全ゾーンでクラスとして扱う）
  treatAsClassAllZones?: Record<string, string>;
  // TREAT_AS_LEVEL1_IN_DECK_TRASH: デッキ/トラッシュでレベル1シグニとして扱うカードのSet
  deckTrashLevel1Nums?: Set<string>;
  // COST_COLOR_SELECT（WX04-063）: スペル使用コストとして実際に支払われたエナ1枚ごとの色配列。
  // マルチエナは全5色、無色エナは空配列。これを基に「支払った色の種類」分のシグニを探す。
  paidEnergyColorSets?: string[][];
  /** 使用前処理でこのスペル自身が実際に取り除いたウィルス数。 */
  preUseVirusRemoved?: number;
  // SEQUENCE内で動的に決まる値（ステップ間の受け渡し用、最上位効果呼び出し単位でリセット）
  seqVars?: { lastDownedLrigLevel?: number; lastDownedLrigLevelSum?: number; declaredNumber?: number };
}

export type ExecResult =
  | { done: true;  ownerState: PlayerState; otherState: PlayerState; logs: string[]; forceEndTurn?: boolean; lastProcessedCards?: string[]; lastLookTrashedCards?: string[]; storedTargetCards?: string[]; autoTargetedCards?: string[]; fieldTrashCostCards?: string[]; trapActivated?: boolean; trapSetOwners?: Owner[] }
  | { done: false; ownerState: PlayerState; otherState: PlayerState; logs: string[]; pending: PendingInteractionDef; lastLookTrashedCards?: string[]; storedTargetCards?: string[]; fieldTrashCostCards?: string[]; trapActivated?: boolean; trapSetOwners?: Owner[] };

// ===== ユーティリティ =====

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function resolveNum(n: NumberOrRef): number {
  return typeof n === 'number' ? n : 0;
}

export function resolveCountRef(n: NumberOrRef, ctx: ExecCtx, fromZone?: CountFromZone): number {
  if (fromZone) {
    const state = ownerState(fromZone.owner, ctx);
    const cards = fromZone.zone === 'field'
      ? [
          ...state.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
          ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
        ]
      : fromZone.zone === 'energy' ? state.energy
      : fromZone.zone === 'trash' ? state.trash
      : state.lrig_trash ?? [];
    return cards.filter(cardNum => !fromZone.filter || matchesFilter(ctx.cardMap.get(cardNum), fromZone.filter)).length
      * (fromZone.per ?? 1);
  }
  if (typeof n === 'number') return n;
  if (n.$ref === 'seven_minus_self_life_count') return Math.max(0, 7 - ctx.ownerState.life_cloth.length);
  if (n.$ref === 'last_processed_count') return ctx.lastProcessedCards?.length ?? 0;
  if (n.$ref === 'last_processed_level') return maxCardLevel(ctx.lastProcessedCards, ctx);
  if (n.$ref === 'stored_target_level') return maxCardLevel(ctx.storedTargetCards, ctx);
  console.warn(`[effectExecutor] unknown numeric ref: ${n.$ref}`);
  return 0;
}

// 「それのレベル１につき」族（タスク12(liii)）の倍率。対象は常に単数なので最大値＝そのカードのレベル。
// instanceId（`CardNum#N`）で来ることがあるため getCardNum で素の番号に戻してから引く。
export function maxCardLevel(cardNums: string[] | undefined, ctx: ExecCtx): number {
  if (!cardNums || cardNums.length === 0) return 0;
  return Math.max(0, ...cardNums.map(n =>
    Number.parseInt(ctx.cardMap.get(getCardNum(n))?.Level ?? '0', 10) || 0));
}

// ===== OPTIONAL_COST の支払い仕様 =====

// OPTIONAL_COST の「何をいくつ払うか」を1本にまとめて解決する。Pattern ③/④/⑤ の3サイトで
// 同じ算出が写経されていたため（handDiscardCountFromTargetLevel だけで既に3重）ここへ集約した。
//
// タスク12(liii)「それのレベル１につき〈コスト単位〉を支払ってもよい」族＝支払い量が
// **対象シグニのレベル** で決まる。対象は SELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS で
// storedTargetCards に固定済みなので、そのレベルを単位コストに掛ける。
// 対象が取れなかった（level=0）ときは「0個払って発動」ではなく **支払い不可** に倒す。
export interface OptionalCostSpec {
  costColors: string[];
  handDiscard?: { count: number; filter?: TargetFilter };
  handToEnergy?: { count: number; filter?: TargetFilter };
  handToUnderSelf?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  underAnySigniTrash?: { count: number };
  energyTrash?: { count: number; filter?: TargetFilter; selectionConstraint?: SelectionConstraint };
  fieldTrash?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  fieldToDeckBottom?: { count: number; filter?: TargetFilter; excludeSelf?: boolean };
  fieldTrashGroups?: { count: number; filter?: TargetFilter }[];
  fieldToLrigTrash?: { count: number; filter?: TargetFilter };
  lrigDown?: { count: number; centerOnly?: boolean; level?: number };
  down_self?: boolean;
  beat_signi?: number;
  beat_signi_from_trash?: { count: number; filter?: TargetFilter };
  life_crash?: number;
  lifeTrash?: number;
  lifeToHand?: number;
  deckTrash?: number;
  charmTrash?: number;
  trashArtsFromLrigDeck?: { color?: string; count: number };
  removeOppVirus?: number;
  /** レベル倍率が要るのに対象レベルが 0＝支払い自体が成立しない */
  levelUnavailable: boolean;
}

export function resolveOptionalCostSpec(a: StubAction, ctx: ExecCtx): OptionalCostSpec {
  const level = maxCardLevel(ctx.storedTargetCards, ctx);
  const perLevel = !!(a.costColorsPerTargetLevel || a.handDiscardCountFromTargetLevel || a.energyTrashCountFromTargetLevel);
  const costColors = a.costColorsPerTargetLevel
    ? Array.from({ length: level }, () => a.costColorsPerTargetLevel!).flat()
    : (a.costColors ?? []);
  const handDiscard = a.handDiscardCountFromTargetLevel
    ? { count: level, filter: a.handDiscardFilter }
    : a.handDiscard;
  const energyTrash = a.energyTrash
    ? {
        count: a.energyTrashCountFromTargetLevel ? level : a.energyTrash.count,
        // 「それと同じレベルの緑のシグニ」＝候補側にも対象のレベルを課す（翠英　マキトミ）
        filter: a.energyTrashSameLevelAsTarget ? { ...a.energyTrash.filter, level } : a.energyTrash.filter,
        selectionConstraint: a.energyTrash.selectionConstraint,
      }
    : undefined;
  return {
    costColors, handDiscard, handToEnergy: a.handToEnergy, handToUnderSelf: a.handToUnderSelf,
    underAnySigniTrash: a.underAnySigniTrash,
    energyTrash, fieldTrash: a.fieldTrash, fieldToDeckBottom: a.fieldToDeckBottom, fieldTrashGroups: a.fieldTrashGroups,
    fieldToLrigTrash: a.fieldToLrigTrash, lrigDown: a.lrigDown, down_self: a.down_self,
    beat_signi: a.beat_signi, beat_signi_from_trash: a.beat_signi_from_trash,
    life_crash: a.life_crash, lifeTrash: a.lifeTrash, lifeToHand: a.lifeToHand,
    deckTrash: a.deckTrash, charmTrash: a.charmTrash,
    trashArtsFromLrigDeck: a.trashArtsFromLrigDeck, removeOppVirus: a.removeOppVirus,
    levelUnavailable: perLevel && level <= 0,
  };
}

function hasValidConstrainedSelection(
  candidates: string[],
  count: number,
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!constraint) return candidates.length >= count;
  const pick = (start: number, selected: string[]): boolean => {
    if (selected.length === count) return true;
    for (let i = start; i < candidates.length; i++) {
      if (canAddToSelection(selected, candidates[i], constraint, cardMap)
        && pick(i + 1, [...selected, candidates[i]])) return true;
    }
    return false;
  };
  return pick(0, []);
}

// 支払い可能か（エナ色・手札・エナゾーンの在庫）。exceed/handDiscardGroups は呼び出し側の既存判定に残す。
export function canAffordOptionalCostSpec(spec: OptionalCostSpec, ctx: ExecCtx): boolean {
  if (spec.levelUnavailable) return false;
  if (spec.costColors.length > 0 && !canPayOptionalCost(spec.costColors, ctx.ownerState, ctx.cardMap)) return false;
  if (spec.handDiscard) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handDiscard!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handDiscard!.filter));
    if (matching.length < spec.handDiscard.count) return false;
  }
  if (spec.energyTrash) {
    const matching = ctx.ownerState.energy.filter(n =>
      !spec.energyTrash!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.energyTrash!.filter));
    if (matching.length < spec.energyTrash.count) return false;
    if (!hasValidConstrainedSelection(matching, spec.energyTrash.count, spec.energyTrash.selectionConstraint, ctx.cardMap)) return false;
  }
  if (spec.handToEnergy) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handToEnergy!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handToEnergy!.filter));
    if (matching.length < spec.handToEnergy.count) return false;
  }
  if (spec.handToUnderSelf) {
    const matching = ctx.ownerState.hand.filter(n =>
      !spec.handToUnderSelf!.filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), spec.handToUnderSelf!.filter));
    if (matching.length < spec.handToUnderSelf.count) return false;
    if (!hasValidConstrainedSelection(matching, spec.handToUnderSelf.count, spec.handToUnderSelf.selectionConstraint, ctx.cardMap)) return false;
    if (!ctx.sourceCardNum || !ctx.ownerState.field.signi.some(stack => stack?.includes(ctx.sourceCardNum!))) return false;
  }
  if (spec.underAnySigniTrash
    && !canPayUnderAnySigniTrash(ctx.ownerState, spec.underAnySigniTrash.count)) return false;
  if (spec.fieldTrash) {
    const filter = {
      ...(spec.fieldTrash.filter ?? {}),
      ...(spec.fieldTrash.excludeSelf ? { excludeSelf: true } : {}),
    };
    const matching = fieldCandidates(ctx.ownerState, filter, ctx.cardMap)
      .filter(n => !spec.fieldTrash!.excludeSelf || !ctx.sourceCardNum || n !== ctx.sourceCardNum);
    if (matching.length < spec.fieldTrash.count) return false;
  }
  if (spec.fieldToDeckBottom) {
    const matching = fieldCandidates(ctx.ownerState, spec.fieldToDeckBottom.filter, ctx.cardMap)
      .filter(n => !spec.fieldToDeckBottom!.excludeSelf || !ctx.sourceCardNum || n !== ctx.sourceCardNum);
    if (matching.length < spec.fieldToDeckBottom.count) return false;
  }
  if (spec.fieldTrashGroups
    && !fieldTrashGroupsAffordable(spec.fieldTrashGroups, ctx.ownerState.field.signi, ctx.cardMap)) return false;
  if (spec.fieldToLrigTrash) {
    const matching = fieldCandidates(ctx.ownerState, spec.fieldToLrigTrash.filter, ctx.cardMap);
    if (matching.length < spec.fieldToLrigTrash.count) return false;
  }
  if (spec.lrigDown) {
    if (!payLrigDownCost(ctx.ownerState, spec.lrigDown, ctx.cardMap)) return false;
  }
  if (spec.down_self) {
    if (!ctx.sourceCardNum) return false;
    const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === ctx.sourceCardNum);
    if (zoneIdx < 0 || (ctx.ownerState.field.signi_down?.[zoneIdx] ?? false)) return false;
  }
  if (spec.beat_signi) {
    if (!ctx.sourceCardNum) return false;
    const analysis = analyzeBeatSigniCost(
      ctx.ownerState, ctx.sourceCardNum, ctx.cardMap, spec.beat_signi,
    );
    if ((analysis.includeSelf && analysis.selfZone < 0)
      || analysis.eligibleOtherZones.length < analysis.otherPart) return false;
  }
  if (spec.beat_signi_from_trash) {
    const paid = payBeatSigniFromTrashCost(
      ctx.ownerState, ctx.cardMap,
      spec.beat_signi_from_trash.count, spec.beat_signi_from_trash.filter,
    );
    if (!paid.ok) return false;
  }
  const lifeCount = (spec.life_crash ?? 0) + (spec.lifeTrash ?? 0) + (spec.lifeToHand ?? 0);
  if (ctx.ownerState.life_cloth.length < lifeCount) return false;
  if (spec.deckTrash && ctx.ownerState.deck.length < spec.deckTrash) return false;
  if (spec.charmTrash
    && (ctx.ownerState.field.signi_charms ?? []).filter(Boolean).length < spec.charmTrash) return false;
  if (spec.trashArtsFromLrigDeck) {
    const matching = ctx.ownerState.lrig_deck.filter(n =>
      matchesTrashArtsFromLrigDeckCost(ctx.cardMap.get(getCardNum(n)), spec.trashArtsFromLrigDeck!));
    if (matching.length < spec.trashArtsFromLrigDeck.count) return false;
  }
  if (spec.removeOppVirus
    && (ctx.otherState.field.signi_virus ?? []).reduce((sum, n) => sum + n, 0) < spec.removeOppVirus) return false;
  return true;
}

// 支払いそのものを表す前置ステップ（エナ色は pending の costColors で UI が徴収するためここには含めない）。
export function optionalCostPaySteps(spec: OptionalCostSpec): EffectAction[] {
  return [
    ...(spec.handDiscard ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'HAND_CARD', owner: 'self', count: spec.handDiscard.count, filter: spec.handDiscard.filter },
    } as EffectAction] : []),
    ...(spec.energyTrash ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'ENERGY_CARD', owner: 'self', count: spec.energyTrash.count, filter: spec.energyTrash.filter, selectionConstraint: spec.energyTrash.selectionConstraint },
    } as EffectAction] : []),
    ...(spec.handToEnergy ? [{
      type: 'ENERGY_CHARGE', asCost: true,
      target: { type: 'HAND_CARD', owner: 'self', count: spec.handToEnergy.count, filter: spec.handToEnergy.filter },
    } as EffectAction] : []),
    ...(spec.handToUnderSelf ? [{
      type: 'PLACE_UNDER_SIGNI', source: 'hand', count: spec.handToUnderSelf.count, filter: spec.handToUnderSelf.filter,
      selectionConstraint: spec.handToUnderSelf.selectionConstraint,
    } as EffectAction] : []),
    ...(spec.underAnySigniTrash ? [{
      type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash',
      count: spec.underAnySigniTrash.count, upToCount: false,
    } as EffectAction] : []),
    ...(spec.fieldTrash ? [{
      type: 'TRASH', asCost: true,
      target: {
        type: 'SIGNI', owner: 'self', count: spec.fieldTrash.count,
        filter: {
          ...(spec.fieldTrash.filter ?? {}),
          ...(spec.fieldTrash.excludeSelf ? { excludeSelf: true } : {}),
        },
      },
    } as EffectAction] : []),
    ...(spec.fieldToDeckBottom ? [{
      type: 'TRANSFER_TO_DECK', shuffle: false, position: 'bottom',
      source: {
        type: 'SIGNI', owner: 'self', count: spec.fieldToDeckBottom.count,
        filter: {
          ...(spec.fieldToDeckBottom.filter ?? {}),
          ...(spec.fieldToDeckBottom.excludeSelf ? { excludeSelf: true } : {}),
        },
      },
    } as EffectAction] : []),
    ...(spec.fieldTrashGroups ?? []).map(group => ({
      type: 'TRASH', asCost: true,
      target: { type: 'SIGNI', owner: 'self', count: group.count, filter: group.filter },
    } as EffectAction)),
    ...(spec.fieldToLrigTrash ? [{
      type: 'TRASH', asCost: true, destination: 'lrig_trash',
      target: { type: 'SIGNI', owner: 'self', count: spec.fieldToLrigTrash.count, filter: spec.fieldToLrigTrash.filter },
    } as EffectAction] : []),
    ...(spec.lrigDown ? [{
      type: 'STUB', id: 'INTERNAL_PAY_LRIG_DOWN', lrigDown: spec.lrigDown,
    } as EffectAction] : []),
    ...(spec.down_self ? [{
      type: 'DOWN',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
    } as EffectAction] : []),
    ...((spec.beat_signi || spec.beat_signi_from_trash) ? [{
      type: 'STUB', id: 'INTERNAL_PAY_BEAT_SIGNI',
      beat_signi: spec.beat_signi,
      beat_signi_from_trash: spec.beat_signi_from_trash,
    } as EffectAction] : []),
    ...(spec.life_crash ? [{
      type: 'LIFE_CRASH', owner: 'self', count: spec.life_crash, triggerBurst: true,
    } as EffectAction] : []),
    ...(spec.lifeTrash ? [{
      type: 'TRASH', asCost: true,
      target: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: spec.lifeTrash },
    } as EffectAction] : []),
    ...(spec.lifeToHand ? [{
      type: 'TRANSFER_TO_HAND',
      source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: spec.lifeToHand },
    } as EffectAction] : []),
    ...(spec.deckTrash ? [{
      type: 'MILL', owner: 'self', count: spec.deckTrash,
    } as EffectAction] : []),
    ...(spec.charmTrash ? [{
      type: 'STUB', id: 'INTERNAL_PAY_CHARM_TRASH', charmTrash: spec.charmTrash,
    } as EffectAction] : []),
    ...(spec.trashArtsFromLrigDeck ? [{
      type: 'STUB', id: 'INTERNAL_PAY_TRASH_ARTS_FROM_LRIG_DECK',
      trashArtsFromLrigDeck: spec.trashArtsFromLrigDeck,
    } as EffectAction] : []),
    ...(spec.removeOppVirus ? [{
      type: 'STUB', id: 'INTERNAL_PAY_REMOVE_OPP_VIRUS', removeOppVirus: spec.removeOppVirus,
    } as EffectAction] : []),
  ];
}

// バニッシュされたシグニの行き先を決定する（BattleScreenのバトルバニッシュと同一の優先順）。
// - 相手側の banish_redirect: エナの代わりにトラッシュへ
// - 相手側の banish_redirect_to_hand: エナの代わりに手札へ
// - 自身の opp_signi_energy_to_deck_bottom (WX25-CP1-003): エナの代わりにデッキの一番下へ
//
// opts（タスク12(xliv)(a2)）＝効果経路の 【常】 BANISH_REDIRECT 走査用。cardMap を渡すと、ターン内フラグが
// 立っていなくても opponent（＝置換能力の持ち主）の場にある CONTINUOUS BANISH_REDIRECT を on-the-fly で
// 評価してトラッシュ送りにする（バトル/パワー0経路が既に行っている走査の効果経路版）。省略＝従来どおりフラグのみ。
export function banishDestination(
  removed: PlayerState,   // バニッシュされた側の状態（removeFromField適用済み）
  opponent: PlayerState,  // バニッシュされた側から見た対戦相手の状態（＝置換能力の持ち主候補）
  num: string,
  opts?: {
    cardMap?: Map<string, CardData>;
    banished?: BanishedCardAttrs;       // 除去前盤面から取った被バニッシュ属性（computeBanishedAttrs）
    turnPhase?: TurnPhase;
    effectivePowers?: Map<string, number>;
    effectSourceNum?: string;
  },
): { state: PlayerState; log: string } {
  if (opponent.banish_redirect_target_nums?.includes(num)) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (opponent.banish_redirect === true) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (opponent.banish_redirect_to_hand === true) {
    return { state: { ...removed, hand: [...removed.hand, num] }, log: 'をバニッシュ（手札へ）' };
  }
  // BANISH_REDIRECT redirectTo:'exile'（SPDi47-05）: エナの代わりにゲームから除外＝どのゾーンにも置かない
  if (opponent.banish_redirect_to_exile === true) {
    return { state: removed, log: 'をバニッシュ（ゲームから除外）' };
  }
  // 効果経路の 【常】 BANISH_REDIRECT（redirectTo:'trash'）走査（タスク12(xliv)(a2)）。
  // ターン内フラグに載らない常在置換をここで拾う。redirectBanish はデッキ下より優先（バトル経路と同順）。
  if (opts?.cardMap && fieldEffectBanishRedirectToTrash(opponent, removed, opts.cardMap, opts.banished, opts.turnPhase, opts.effectivePowers, opts.effectSourceNum)) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (removed.opp_signi_energy_to_deck_bottom === true) {
    return { state: { ...removed, deck: [...removed.deck, num] }, log: '→デッキ下' };
  }
  return { state: { ...removed, energy: [...removed.energy, num] }, log: 'をバニッシュ' };
}

/**
 * banishDestination の効果経路 opts を ExecCtx から組み立てるヘルパー（タスク12(xliv)(a2)）。
 * `victimState` は removeFromField 適用**前**の被バニッシュ側の状態を渡すこと（属性取得のため）。
 */
export function banishRedirectOpts(ctx: ExecCtx, victimState: PlayerState, num: string) {
  return {
    cardMap: ctx.cardMap,
    banished: computeBanishedAttrs(victimState, num, ctx.cardMap),
    turnPhase: ctx.currentPhase as TurnPhase | undefined,
    effectivePowers: ctx.effectivePowers,
    effectSourceNum: ctx.sourceCardNum,
  };
}

// 傀儡（puppet）の離場回収: fieldOwner の場の puppet_signi のうち、もう場にないものを
// fieldOwner の各ゾーン（エナ/トラッシュ/手札/デッキ）から取り除き、持ち主（trueOwner）のトラッシュへ移す。
// 「傀儡状態のシグニが場を離れる場合、代わりに持ち主のトラッシュに置かれる」（WDK17-007）の近似（移動後に回収）。
function relocateLeftPuppets(fieldOwner: PlayerState, trueOwner: PlayerState): { fieldOwner: PlayerState; trueOwner: PlayerState } {
  const puppets = fieldOwner.field.puppet_signi ?? [];
  if (puppets.length === 0) return { fieldOwner, trueOwner };
  const onField = new Set<string>();
  for (const z of fieldOwner.field.signi) for (const id of (z ?? [])) onField.add(id);
  const left = puppets.filter(p => !onField.has(p));
  if (left.length === 0) return { fieldOwner, trueOwner };
  const leftSet = new Set(left);
  const fo: PlayerState = {
    ...fieldOwner,
    energy: fieldOwner.energy.filter(n => !leftSet.has(n)),
    trash: fieldOwner.trash.filter(n => !leftSet.has(n)),
    hand: fieldOwner.hand.filter(n => !leftSet.has(n)),
    deck: fieldOwner.deck.filter(n => !leftSet.has(n)),
    field: { ...fieldOwner.field, puppet_signi: puppets.filter(p => !leftSet.has(p)) },
  };
  const to: PlayerState = { ...trueOwner, trash: [...trueOwner.trash, ...left] };
  return { fieldOwner: fo, trueOwner: to };
}

// 両プレイヤーの場から離れた傀儡を持ち主のトラッシュへ回収する（効果/バトル解決後に呼ぶ）。
export function sweepPuppets(a: PlayerState, b: PlayerState): { a: PlayerState; b: PlayerState } {
  if ((a.field.puppet_signi?.length ?? 0) === 0 && (b.field.puppet_signi?.length ?? 0) === 0) return { a, b };
  const r1 = relocateLeftPuppets(a, b); // a の場の傀儡（持ち主=b）が離場 → b.trash
  let aS = r1.fieldOwner, bS = r1.trueOwner;
  const r2 = relocateLeftPuppets(bS, aS); // b の場の傀儡（持ち主=a）が離場 → a.trash
  bS = r2.fieldOwner; aS = r2.trueOwner;
  return { a: aS, b: bS };
}

// Color列は「黒青」のような連結形式（'/'区切りではない）。単色文字に分解する（「無」は色を持たないため含まない）
export function splitColors(col: string | undefined): string[] {
  if (!col) return [];
  return [...col].filter(c => '白赤青緑黒'.includes(c));
}

// 規則解釈：「精武：アーム」は上位・下位の両クラスを持つものとして2 tokenに数える。
// 公式解釈が異なると判明した場合は、この1箇所を直せば全ゾーンのクラス種類数判定が変わる。
export function splitClasses(col: string | undefined): string[] {
  if (!col) return [];
  return col.split('：').map(s => s.trim()).filter(Boolean);
}

// センタールリグ＋左右アシストルリグの各グロウスタック頂点（現在のルリグ）を返す。
// HAS_CARD_IN_FIELD の「場に《X》がいる」でルリグ名を照合するために使う。
export function lrigZoneTops(field: PlayerState['field']): (string | undefined)[] {
  return [field.lrig?.at(-1), field.assist_lrig_l?.at(-1), field.assist_lrig_r?.at(-1)];
}

export function ownerState(owner: Owner, ctx: ExecCtx): PlayerState {
  return owner === 'self' ? ctx.ownerState : ctx.otherState;
}

export function setOwnerState(owner: Owner, s: PlayerState, ctx: ExecCtx): ExecCtx {
  return owner === 'self'
    ? { ...ctx, ownerState: s }
    : { ...ctx, otherState: s };
}

export function addLog(ctx: ExecCtx, msg: string): ExecCtx {
  return { ...ctx, logs: [...ctx.logs, msg] };
}

// 任意コストが支払えるかチェック（色の一致を検証）
// コストスロットは「青」「無」のほか、選択肢を表す「青|黒」（青か黒のいずれか1エナ）形式を許容する。
export const costSlotIsAny = (slot: string): boolean => slot.split('|').some(c => c === '無');
export const energyMatchesCostSlot = (color: string, slot: string): boolean =>
  slot.split('|').some(c => color.includes(c));
/** コストスロットを表示用に整形（"青|黒" → "《青》か《黒》"） */
export const formatCostSlot = (slot: string): string => slot.split('|').map(c => `《${c}》`).join('か');

export function canPayOptionalCost(costColors: string[], state: PlayerState, cardMap: Map<string, CardData>): boolean {
  const pool = [...state.energy];
  // 無色（任意エナ可）スロットは色指定スロットを先に消費してから割り当てる
  const ordered = [...costColors].sort((a, b) => (costSlotIsAny(a) ? 1 : 0) - (costSlotIsAny(b) ? 1 : 0));
  for (const slot of ordered) {
    if (costSlotIsAny(slot)) {
      if (pool.length === 0) return false;
      pool.splice(0, 1);
    } else {
      const idx = pool.findIndex(n => energyMatchesCostSlot(cardMap.get(n)?.Color ?? '', slot));
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
  }
  return true;
}

export function done(ctx: ExecCtx): ExecResult {
  return { done: true, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, forceEndTurn: ctx.forceEndTurn, lastProcessedCards: ctx.lastProcessedCards, lastLookTrashedCards: ctx.lastLookTrashedCards, storedTargetCards: ctx.storedTargetCards, autoTargetedCards: ctx.autoTargetedCards, fieldTrashCostCards: ctx.fieldTrashCostCards, trapActivated: ctx.trapActivated, trapSetOwners: ctx.trapSetOwners };
}

export function needsInteraction(ctx: ExecCtx, pending: PendingInteractionDef): ExecResult {
  return { done: false, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, pending, lastLookTrashedCards: ctx.lastLookTrashedCards, storedTargetCards: ctx.storedTargetCards, fieldTrashCostCards: ctx.fieldTrashCostCards, trapActivated: ctx.trapActivated, trapSetOwners: ctx.trapSetOwners };
}

export function matchesFilter(
  card: CardData | undefined,
  filter: TargetFilter | undefined,
  effectivePower?: number,  // 実効パワー（未指定時はcard.Powerを使用）
  classOverride?: string,   // card_class_overridesによるクラス上書き
  allZoneClassOverrides?: Record<string, string>, // TREAT_AS_CLASS_ALL_ZONES: 全ゾーン適用
  effectiveLevel?: number,  // 実効レベル（temp_level_mods 適用済み。未指定時は card.Level を使用。LEVEL_MODIFY用）
): boolean {
  if (!card) return false;
  if (!filter) return true;
  // anyOf: 下位フィルタのいずれかに一致（OR）。他キーとは AND。空配列は「候補なし」＝false。
  if (filter.anyOf) {
    if (!filter.anyOf.some(sub => matchesFilter(card, sub, effectivePower, classOverride, allZoneClassOverrides, effectiveLevel))) return false;
  }
  if (filter.cardType) {
    const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
    // レゾナは「シグニの一種」＝場のレゾナは cardType:'シグニ' フィルタの対象に含む
    // （「あなたの＜宇宙＞のシグニ」等がレゾナも選べる。WX25-P2-068/070「それがレゾナの場合、代わりに」）。
    // 逆（cardType:'レゾナ' フィルタ）はレゾナのみ＝非対称。この向きだけ緩める。
    const typeMatch = types.includes(card.Type as (typeof types)[number])
      || (card.Type === 'レゾナ' && types.includes('シグニ' as (typeof types)[number]));
    if (!typeMatch) return false;
  }
  if (filter.excludeResona && card.Type?.includes('レゾナ')) return false;
  if (filter.color) {
    const colors = Array.isArray(filter.color) ? filter.color : [filter.color];
    if (!colors.some(c => card.Color?.includes(c))) return false;
  }
  if (filter.colorExclude) {
    const excl = Array.isArray(filter.colorExclude) ? filter.colorExclude : [filter.colorExclude];
    if (excl.some(c => card.Color?.includes(c))) return false;
  }
  if (filter.level !== undefined) {
    const lv = effectiveLevel ?? parseInt(card.Level ?? '', 10);
    if (typeof filter.level === 'number') {
      if (lv !== filter.level) return false;
    } else {
      if (filter.level.min !== undefined && lv < filter.level.min) return false;
      if (filter.level.max !== undefined && lv > filter.level.max) return false;
    }
  }
  if (filter.levelParity !== undefined) {
    const lv = effectiveLevel ?? parseInt(card.Level ?? '', 10);
    if (isNaN(lv)) return false;
    if (filter.levelParity === 'even' && lv % 2 !== 0) return false;
    if (filter.levelParity === 'odd'  && lv % 2 !== 1) return false;
  }
  // 《クロスアイコン》を持つ（EffectText が《クロスアイコン》で始まる。cardHasCrossIcon と同基準・循環import回避のため inline）
  if (filter.hasCrossIcon && !(card.EffectText?.startsWith('《クロスアイコン》'))) return false;
  // 《ライズアイコン》を持つ（EffectText に【ライズ】を含む）
  if (filter.hasRiseIcon && !(card.EffectText?.includes('【ライズ】'))) return false;
  // 《ライズアイコン》を持たない（hasRiseIcon の否定）
  if (filter.noRiseIcon && (card.EffectText?.includes('【ライズ】'))) return false;
  if (filter.story) {
    const stories = Array.isArray(filter.story) ? filter.story : [filter.story];
    // card_class_overridesによるクラス上書き、次にTREAT_AS_CLASS_ALL_ZONESオーバーライドを考慮
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (!stories.some(s => effectiveClass.includes(s))) return false;
  }
  if (filter.cardClass) {
    const classes = Array.isArray(filter.cardClass) ? filter.cardClass : [filter.cardClass];
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (!classes.some(c => effectiveClass.includes(c))) return false;
  }
  if (filter.cardClassExclude) {
    const exClasses = Array.isArray(filter.cardClassExclude) ? filter.cardClassExclude : [filter.cardClassExclude];
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (exClasses.some(c => effectiveClass.includes(c))) return false;
  }
  if (filter.cardName && !card.CardName?.includes(filter.cardName)) return false;
  if (filter.cardNames && !filter.cardNames.includes(card.CardName ?? '')) return false;
  if (filter.excludeCardName && card.CardName === filter.excludeCardName) return false;
  if (filter.cardNum && card.CardNum !== filter.cardNum) return false;
  if (filter.powerRange) {
    // CONTINUOUS効果・temp_power_mods適用済みの実効パワーを優先して使用する
    // Power「∞」はInfinity扱い（parseIntだとNaNになり「パワーX以下」フィルタを誤って通過してしまう）
    const basePw = card.Power === '∞' ? Infinity : parseInt(card.Power ?? '', 10);
    const pw = effectivePower !== undefined ? Math.max(0, effectivePower) : basePw;
    if (isNaN(pw)) return false; // Power「-」等の非数値はパワー条件を満たさない
    if (filter.powerRange.min !== undefined && pw < filter.powerRange.min) return false;
    if (filter.powerRange.max !== undefined && pw > filter.powerRange.max) return false;
  }
  if (filter.levelRange) {
    const lv = effectiveLevel ?? parseInt(card.Level ?? '', 10);
    if (filter.levelRange.min !== undefined && lv < filter.levelRange.min) return false;
    if (filter.levelRange.max !== undefined && lv > filter.levelRange.max) return false;
  }
  if (filter.hasGuard !== undefined) {
    // Guard列は '1'/'0' 形式（空文字判定だと全カードがガード持ち扱いになる）
    const hasGuard = card.Guard === '1';
    if (filter.hasGuard !== hasGuard) return false;
  }
  if (filter.noGuard && card.Guard === '1') return false;
  if (filter.nonColorless) {
    const col = card.Color ?? '';
    // 無色のColorはデータ上「無」（36枚）。空/「無色」表記も保険で除外する。
    if (col === '' || col === '無' || col === '無色') return false;
  }
  if (filter.isDisona && (card.Story ?? '') !== 'Dissona') return false;
  if (filter.levelParity) {
    const lvP = parseInt(card.Level ?? '', 10);
    if (isNaN(lvP)) return false;
    if (filter.levelParity === 'odd' && lvP % 2 !== 1) return false;
    if (filter.levelParity === 'even' && lvP % 2 !== 0) return false;
  }
  if (filter.hasIcon !== undefined) {
    // 《Xアイコン》持ちの判定: カード自身のテキストにキーワード能力があるかの近似
    const txt = card.EffectText ?? '';
    const iconOk =
      filter.hasIcon === 'クロス'   ? txt.includes('【クロス') :
      filter.hasIcon === 'ライズ'   ? txt.includes('【ライズ】') :
      filter.hasIcon === 'トラップ' ? txt.includes('《トラップアイコン》：') :
      filter.hasIcon === 'アクセ'   ? txt.includes('【アクセ】') :
      false;
    if (!iconOk) return false;
  }
  if (filter.hasLifeBurst !== undefined) {
    const hasLB = !!card.BurstText && card.BurstText !== '-';
    if (filter.hasLifeBurst !== hasLB) return false;
  }
  if (filter.costMax !== undefined || filter.costMin !== undefined) {
    // 使用コストの合計（《色×N》の合計、コインは除く）
    let total = 0;
    for (const m of (card.Cost ?? '').matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
      if (m[1] === 'コイン') continue;
      const n = parseInt(m[2].replace(/[０-９]/g, d => String('０１２３４５６７８９'.indexOf(d))), 10);
      if (!isNaN(n)) total += n;
    }
    if (filter.costMax !== undefined && total > filter.costMax) return false;
    if (filter.costMin !== undefined && total < filter.costMin) return false;
  }
  if (filter.keyword) {
    // 【キーワード能力】を持つカードの判定（フィールド全体の付与効果は考慮しない印字ベース近似）
    if (filter.keyword === 'マルチエナ') {
      // 「【常】：【マルチエナ】」（サーバント等の印字）または自身のみへの CONTINUOUS 付与
      const printed = card.EffectText?.includes('：【マルチエナ】') ?? false;
      const selfGrant = card.effects?.some(e =>
        e.effectType === 'CONTINUOUS' &&
        e.action.type === 'GRANT_KEYWORD' &&
        (e.action as { keyword?: string }).keyword === 'マルチエナ' &&
        (e.action as { target?: { count?: unknown } }).target?.count !== 'ALL'
      ) ?? false;
      if (!printed && !selfGrant) return false;
    } else {
      const txt = card.EffectText ?? '';
      const kws = Array.isArray(filter.keyword) ? filter.keyword : [filter.keyword];
      // いずれかのキーワードを持てばマッチ（OR）。【ランサー（条件）】等の括弧付き変種も含める（公式ルール）。
      const hasAny = kws.some(kw =>
        txt.includes(`【${kw}】`) || txt.includes(`《${kw}》`) || txt.includes(`【${kw}（`));
      if (!hasAny) return false;
    }
  }
  return true;
}



/**
 * 混合手札捨てコスト（discardGroups）の充足判定:
 * 選択されたカードを全グループの必要枚数に過不足なく割当できるか（バックトラック。コストは数枚規模が前提）。
 */
export function canSatisfyDiscardGroups(
  cards: (CardData | undefined)[],
  groups: { count: number; filter?: TargetFilter }[],
): boolean {
  const slots: (TargetFilter | undefined)[] = [];
  for (const g of groups) for (let i = 0; i < g.count; i++) slots.push(g.filter);
  if (cards.length !== slots.length) return false;
  const used = new Array<boolean>(cards.length).fill(false);
  const assign = (slot: number): boolean => {
    if (slot === slots.length) return true;
    for (let i = 0; i < cards.length; i++) {
      if (used[i] || !matchesFilter(cards[i], slots[slot])) continue;
      used[i] = true;
      if (assign(slot + 1)) return true;
      used[i] = false;
    }
    return false;
  };
  return assign(0);
}

/**
 * インスタンスID（CardNum#N）からCardNumを取り出す。
 * #N がない場合はそのまま返す（後方互換）。
 */
export function getCardNum(id: string): string {
  const h = id.indexOf('#');
  return h > 0 ? id.slice(0, h) : id;
}

/**
 * 原文語彙「能力を持たない（シグニ）」の**唯一の判定**（タスク12(xcv)）。
 *
 * ⚠🔴**CSV は素のシグニ（能力なし）を空文字ではなく `-` で持つ**（実測158枚・空文字は0枚）。
 *   したがって `!!card.EffectText` / `!!card.EffectText?.trim()` 系の判定は**1枚も「能力なし」に当たらない**＝
 *   その分岐は永久に不発になる。判定を増やすときは必ずこの関数を使うこと（`costs.ts` も同じ関数を参照している）。
 *
 * `holder` を渡すと `abilities_removed`（効果でこのターン能力を消されたシグニ）も「能力を持たない」に数える。
 * ⚠CONTINUOUS の `REMOVE_ABILITIES`（「凍結状態のシグニは能力を失う」等）は `effectsMap` と両プレイヤー状態が
 *   要る（`collectRemovedAbilities`）ため**ここでは見ない**＝数え漏らす側＝「能力あり」に倒れる（安全側）。
 */
export function hasNoAbility(
  cardNum: string,
  cardMap: Map<string, CardData>,
  holder?: { abilities_removed?: string[] },
): boolean {
  if (holder?.abilities_removed?.includes(cardNum)) return true;
  const card = cardMap.get(getCardNum(cardNum));
  if (!card) return false;
  const blank = (s?: string) => { const t = (s ?? '').trim(); return t === '' || t === '-'; };
  return blank(card.EffectText) && blank(card.BurstText);
}

// カード（instanceId/cardNum）を両プレイヤーの場から探し、所属 state とゾーン index を返す。
// LAST_PROCESSED_MATCHES のゾーン状態フィルタ（hasCharm 等）が直前対象のゾーンを引くのに使う。
function findFieldZoneState(cn: string, ctx: ExecCtx): { state: PlayerState; zoneIdx: number } | null {
  for (const s of [ctx.ownerState, ctx.otherState]) {
    const zoneIdx = s.field.signi.findIndex(stack => stack && stack.length > 0 && stack[stack.length - 1] === cn);
    if (zoneIdx >= 0) return { state: s, zoneIdx };
  }
  return null;
}

// ─── 【ビート】化の共通ヘルパ（MAKE_BEAT 正規化）──────────────────────────
// カードを beat_zone へ加え、beat_became_just に積む（ON_BECOME_BEAT 発火用）。**配置のみ**を担い、
// 元の場所（場/トラッシュ/デッキ等）からの除去は呼び出し側が行う。従来は5箇所で
// `beat_zone:[...], beat_became_just:[...]` をコピペしていたのを集約（payBeatSigniCost/
// payBeatSigniFromTrashCost/INTERNAL_MOVE_TO_BEAT/TRASH_SIGNI_TO_BEAT/ADD_TO_BEAT）。
export function addToBeatZone(state: PlayerState, cards: string[]): PlayerState {
  if (cards.length === 0) return state;
  return {
    ...state,
    field: { ...state.field, beat_zone: [...(state.field.beat_zone ?? []), ...cards] },
    beat_became_just: [...(state.beat_became_just ?? []), ...cards],
  };
}

// ─── 【ビート】コスト支払い（cost.beat_signi）───────────────────────────────
// 「シグニを【ビート】にする」コストを支払う＝対象シグニを場から beat_zone へ移し beat_became_just に積む
//（ON_BECOME_BEAT 発火用）。beat_signi は count のみ保持するため、対象の意味（このシグニ/他の/以外/任意）は
// 効果元の EffectText から導出する。**近似：「他の」シグニはレベルが低い順に自動選択**（プレイヤー選択は未実装）。
// 【ビート】コストの構造を解析（UIのプレイヤー選択／payBeatSigniCost の自動近似の双方が参照）。
// includeSelf=自身も【ビート】に／otherPart=「他の/任意」で選ぶ枚数／eligibleOtherZones=その選択候補ゾーン。
export function analyzeBeatSigniCost(
  state: PlayerState,
  sourceCardNum: string,
  cardMap: Map<string, CardData>,
  count: number,
): { includeSelf: boolean; selfZone: number; otherPart: number; eligibleOtherZones: number[] } {
  const srcNum = getCardNum(sourceCardNum);
  const text = cardMap.get(srcNum)?.EffectText ?? '';
  const includeSelf = /このシグニ(を|と他のシグニ[０-９0-9]*体)[^。：]*【ビート】に/.test(text);
  const selfOtherM = text.match(/このシグニと他のシグニ([０-９0-9]+)体/);
  const excludedName = text.match(/《([^》]+)》以外のシグニ/)?.[1];
  const toN = (s: string) => parseInt(s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30)), 10);
  const otherPart = includeSelf ? (selfOtherM ? toN(selfOtherM[1]) : 0) : Math.max(1, count);
  const signi = state.field.signi;
  const selfZone = signi.findIndex(s => getCardNum(s?.at(-1) ?? '') === srcNum && (s?.length ?? 0) > 0);
  const eligibleOtherZones = signi
    .map((s, zi) => ({ zi, cn: s?.at(-1) }))
    .filter(z => z.cn && z.zi !== selfZone
      && (!excludedName || cardMap.get(getCardNum(z.cn))?.CardName !== excludedName))
    .map(z => z.zi);
  return { includeSelf, selfZone, otherPart, eligibleOtherZones };
}

// 返り値 ok=false は対象不足で支払い不能（呼び出し側で発動を無効化する）。
// selectedOtherZones を渡すとプレイヤー選択（ゾーン番号）でそのシグニを beat に。省略時はレベル低い順の自動近似。
export function payBeatSigniCost(
  state: PlayerState,
  sourceCardNum: string,
  cardMap: Map<string, CardData>,
  count: number,
  selectedOtherZones?: number[],
): { state: PlayerState; moved: string[]; ok: boolean; log: string } {
  const { includeSelf, selfZone, otherPart, eligibleOtherZones } =
    analyzeBeatSigniCost(state, sourceCardNum, cardMap, count);

  const signi = [...state.field.signi] as (string[] | null)[];
  const moved: string[] = [];
  const movedZones = new Set<number>();

  // 自身を含む
  if (includeSelf && selfZone >= 0) { moved.push(signi[selfZone]!.at(-1)!); movedZones.add(selfZone); }

  // 「他の」候補＝場のシグニ（自身ゾーンは除外）。プレイヤー選択（selectedOtherZones）があればそれを、
  // なければレベル低い順の自動近似で otherPart 枚選ぶ。
  const otherCandZones = signi
    .map((s, zi) => ({ zi, cn: s?.at(-1) }))
    .filter(z => z.cn && !movedZones.has(z.zi) && eligibleOtherZones.includes(z.zi));
  const chosenZones: number[] = (selectedOtherZones && selectedOtherZones.length > 0)
    ? selectedOtherZones.filter(zi => otherCandZones.some(z => z.zi === zi)).slice(0, otherPart)
    : otherCandZones
        .slice()
        .sort((a, b) => (parseInt(cardMap.get(getCardNum(a.cn!))?.Level ?? '0', 10) || 0) - (parseInt(cardMap.get(getCardNum(b.cn!))?.Level ?? '0', 10) || 0))
        .slice(0, otherPart)
        .map(z => z.zi);
  for (const zi of chosenZones) { moved.push(signi[zi]!.at(-1)!); movedZones.add(zi); }

  // 支払い不能判定：自身を含むのに自身が場にいない／「他の」が必要数に満たない
  const gotOthers = [...movedZones].filter(zi => zi !== selfZone).length;
  if ((includeSelf && selfZone < 0) || gotOthers < otherPart) {
    return { state, moved: [], ok: false, log: '【ビート】コスト支払い不能（対象シグニ不足）' };
  }

  // 場から除去（down/frozen リセット）→ addToBeatZone で beat_zone へ（beat_became_just＝ON_BECOME_BEAT 用）
  const newSigni = signi.map((s, zi) => (movedZones.has(zi) ? null : s));
  const down = [...(state.field.signi_down ?? [false, false, false])];
  const frozen = [...(state.field.signi_frozen ?? [false, false, false])];
  movedZones.forEach(zi => { down[zi] = false; frozen[zi] = false; });
  const removed: PlayerState = {
    ...state,
    field: { ...state.field, signi: newSigni, signi_down: down, signi_frozen: frozen },
  };
  const newState = addToBeatZone(removed, moved);
  const names = moved.map(cn => cardMap.get(getCardNum(cn))?.CardName ?? cn).join('・');
  return { state: newState, moved, ok: true, log: `${names}を【ビート】にする（コスト）` };
}

// cost.beat_signi_from_trash の支払い：トラッシュから filter 一致のシグニ count 枚を beat_zone へ移す
// （WDK14-013「トラッシュから＜悪魔＞のシグニ1枚を【ビート】にする」）。beat_became_just に積み ON_BECOME_BEAT 連鎖を発火。
export function beatSigniFromTrashCandidates(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  filter?: import('../types/effects').TargetFilter,
): number[] {
  const eff = filter ?? { cardType: 'シグニ' };
  return state.trash.flatMap((n, i) => {
    const c = cardMap.get(getCardNum(n));
    return c && c.Type === 'シグニ' && matchesFilter(c, eff) ? [i] : [];
  });
}

// 候補超過時は selectedIndices をUIから受け取る。省略時は従来どおり先頭から自動選択。
export function payBeatSigniFromTrashCost(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  count: number,
  filter?: import('../types/effects').TargetFilter,
  selectedIndices?: number[],
): { state: PlayerState; moved: string[]; ok: boolean; log: string } {
  const matchIdx = beatSigniFromTrashCandidates(state, cardMap, filter);
  if (matchIdx.length < count) {
    return { state, moved: [], ok: false, log: '【ビート】コスト支払い不能（トラッシュにシグニ不足）' };
  }
  const selected = selectedIndices && selectedIndices.length > 0 ? selectedIndices : matchIdx.slice(0, count);
  if (selected.length !== count || selected.some(i => !matchIdx.includes(i)) || new Set(selected).size !== count) {
    return { state, moved: [], ok: false, log: '【ビート】コスト支払い不能（選択不正）' };
  }
  const take = new Set(selected);
  const moved = [...take].map(i => state.trash[i]);
  const newTrash = state.trash.filter((_, i) => !take.has(i));
  const newState = addToBeatZone({ ...state, trash: newTrash }, moved);
  const names = moved.map(cn => cardMap.get(getCardNum(cn))?.CardName ?? cn).join('・');
  return { state: newState, moved, ok: true, log: `${names}をトラッシュから【ビート】にする（コスト）` };
}

// ─── ゲーム外トークン生成ヘルパー ───────────────────────────────
// クラフト/レゾナ/トークンは盤外から生成される。CardName を CardNum に解決し、
// 既存インスタンスと衝突しない新規 instanceId（CardNum#N）を返す。
// cardMap にトークンの CardData が載っている必要がある（BattleScreen の battleCardNums で常時ロード）。
const normTokenName = (s: string) =>
  (s ?? '').replace(/[！-～]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/　/g, ' ');

export function resolveTokenBase(cardMap: Map<string, CardData>, cardName: string): string | undefined {
  const want = normTokenName(cardName);
  // クラフト/レゾナ/トークン型を優先解決（同名の通常カードより先に）
  for (const [num, cd] of cardMap) {
    if (normTokenName(cd.CardName ?? '') === want && /クラフト|レゾナ|トークン/.test(cd.Type ?? '')) return getCardNum(num);
  }
  for (const [num, cd] of cardMap) {
    if (normTokenName(cd.CardName ?? '') === want) return getCardNum(num);
  }
  return undefined;
}

export function freshTokenInstanceId(base: string, ...states: PlayerState[]): string {
  let maxIdx = 0;
  const scan = (arr?: (string | null)[] | null) => arr?.forEach(n => {
    if (n && getCardNum(n) === base) { const i = parseInt(n.slice(base.length + 1), 10) || 0; if (i > maxIdx) maxIdx = i; }
  });
  for (const s of states) {
    scan(s.deck); scan(s.hand); scan(s.trash); scan(s.energy); scan(s.lrig_deck); scan(s.lrig_trash);
    s.field.signi.forEach(z => scan(z)); scan(s.field.lrig); scan(s.field.free_zone);
  }
  return `${base}#${maxIdx + 1}`;
}

// CardName から新規トークンインスタンスIDを生成（解決不可なら undefined）
export function createTokenInstanceId(
  cardMap: Map<string, CardData>, cardName: string, ...states: PlayerState[]
): string | undefined {
  const base = resolveTokenBase(cardMap, cardName);
  return base ? freshTokenInstanceId(base, ...states) : undefined;
}

// ─── バリアトークン（フリーゾーンにカードとして設置する） ───────────────
// 【ルリグバリア】【シグニバリア】はトークンカード。数値カウンタではなく
// field.free_zone にトークンカードのインスタンス（CardNum#N）として置く。
export const LRIG_BARRIER_CARD = 'WX24-P1-TK2A';   // 【ルリグバリア】
export const SIGNI_BARRIER_CARD = 'WX26-CP1-TK01'; // 【シグニバリア】

export function countBarrierTokens(freeZone: string[] | undefined, base: string): number {
  return (freeZone ?? []).filter(n => getCardNum(n) === base).length;
}

// フリーゾーンにバリアトークンを count 個追加する（既存の最大連番+1から採番）。
export function addBarrierTokens(freeZone: string[] | undefined, base: string, count = 1): string[] {
  const fz = [...(freeZone ?? [])];
  let maxIdx = 0;
  for (const n of fz) {
    if (getCardNum(n) === base) {
      const i = parseInt(n.slice(base.length + 1), 10) || 0;
      if (i > maxIdx) maxIdx = i;
    }
  }
  for (let k = 0; k < count; k++) fz.push(`${base}#${maxIdx + 1 + k}`);
  return fz;
}

// フリーゾーンからバリアトークンを1個取り除く（先頭の該当インスタンス）。
export function removeOneBarrierToken(freeZone: string[] | undefined, base: string): string[] {
  const fz = [...(freeZone ?? [])];
  const idx = fz.findIndex(n => getCardNum(n) === base);
  if (idx >= 0) fz.splice(idx, 1);
  return fz;
}

// owner:'any'（修飾語なし「シグニ1体を対象とし」＝どちらのプレイヤーのシグニでもよい）を含む
// 場シグニの候補集合とスコープを一括で解決する（タスク12(lii)）。
//
// 'any' は engine の多くの経路で `ownerState(owner)` に素通しされ、**片側だけ**（多くは相手側）に
// 潰れていた＝原文が「どちらでもよい」と言っている対象が半分しか選べない。候補を両フィールドから
// 集めて scope='both_field' を返す。適用側は選ばれたカードがどちらの場にあるかで所属を決める
// （execPowerModify が先行実装していた規約を共通化したもの）。
export function fieldCandidatesByOwner(
  owner: Owner,
  filter: TargetFilter | undefined,
  ctx: ExecCtx,
): { cands: string[]; scope: TargetScope; isAny: boolean } {
  if (owner !== 'any') {
    const state = ownerState(owner, ctx);
    return {
      cands: fieldCandidates(state, filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors),
      scope: owner === 'self' ? 'self_field' : 'opp_field',
      isAny: false,
    };
  }
  const self = fieldCandidates(ctx.ownerState, filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  const opp = fieldCandidates(ctx.otherState, filter, ctx.cardMap, ctx.effectivePowers, ctx.allColorSigniNums, ctx.fieldSigniExtraColors);
  return { cands: [...self, ...opp], scope: 'both_field', isAny: true };
}

// owner:'any' で選ばれた1枚が「どちらの場のシグニか」を判定する。どちらにも無ければ opponent 扱い
// （従来の素通し挙動と同じ側へ倒す＝呼び出し側の zoneIdx 探索が空振りして no-op になる）。
export function sideOfFieldCard(cardNum: string, ctx: ExecCtx): Owner {
  return ctx.ownerState.field.signi.some(st => st?.at(-1) === cardNum) ? 'self' : 'opponent';
}

export function fieldCandidates(
  state: PlayerState,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  effectivePowers?: Map<string, number>,
  allColorSigniNums?: Set<string>,
  fieldSigniExtraColors?: Map<string, string[]>,
): string[] {
  const baseCands = state.field.signi.flatMap((stack, zoneIdx) => {
    if (!stack || stack.length === 0) return [];
    const cardNum = stack[stack.length - 1];
    // ゾーン状態に依存するフィルター（infected / hasAcce / hasCharm）
    if (filter?.infected !== undefined) {
      const infected = (state.field.signi_virus?.[zoneIdx] ?? 0) > 0;
      if (filter.infected !== infected) return [];
    }
    if (filter?.hasAcce !== undefined) {
      const acceExists = (state.field.signi_acce?.[zoneIdx] ?? null) !== null;
      if (filter.hasAcce !== acceExists) return [];
    }
    if (filter?.hasCharm !== undefined) {
      const hasCharm = (state.field.signi_charms?.[zoneIdx] ?? null) !== null;
      if (filter.hasCharm !== hasCharm) return [];
    }
    if (filter?.isDown !== undefined) {
      const isDown = state.field.signi_down?.[zoneIdx] ?? false;
      if (filter.isDown !== isDown) return [];
    }
    if (filter?.isUp !== undefined) {
      const isDown = state.field.signi_down?.[zoneIdx] ?? false;
      if (filter.isUp !== !isDown) return [];
    }
    if (filter?.isFrozen !== undefined) {
      const isFrozen = state.field.signi_frozen?.[zoneIdx] ?? false;
      if (filter.isFrozen !== isFrozen) return [];
    }
    if (filter?.isPuppet !== undefined) {
      const isPuppet = (state.field.puppet_signi ?? []).includes(cardNum);
      if (filter.isPuppet !== isPuppet) return [];
    }
    if (filter?.crossState !== undefined) {
      const isCross = state.field.cross_state?.[zoneIdx] ?? false;
      if (filter.crossState !== isCross) return [];
    }
    if (filter?.isArmored !== undefined) {
      const isArmored = state.field.signi_armor?.[zoneIdx] ?? false;
      if (filter.isArmored !== isArmored) return [];
    }
    if (filter?.inGateZone !== undefined) {
      const inGate = (state.own_gate_zones ?? []).includes(zoneIdx);
      if (filter.inGateZone !== inGate) return [];
    }
    if (filter?.centerZoneOnly !== undefined) {
      if (filter.centerZoneOnly !== (zoneIdx === 1)) return [];
    }
    // 表記パワー比較（per-candidate）: 実効パワー vs 自身の表記パワー。低い=低下中／高い=増強中。
    // 表記が数値でない（∞等）シグニは比較不能＝対象外。
    if (filter?.powerLtPrinted || filter?.powerGtPrinted) {
      const printed = parseInt(cardMap.get(cardNum)?.Power ?? '', 10);
      if (Number.isNaN(printed)) return [];
      const eff = effectivePowers?.get(cardNum) ?? printed;
      if (filter.powerLtPrinted && !(eff < printed)) return [];
      if (filter.powerGtPrinted && !(eff > printed)) return [];
    }
    // card_class_overridesによるクラス上書きを考慮してフィルター適用
    const classOverride = state.card_class_overrides?.[cardNum];
    // ACCE_SIGNI_ALL_COLOR / ALL_COLOR / ALL_ZONE_BLACK: 全色を持つシグニは色フィルターをバイパス
    const isAllColor = state.story_overrides?.[cardNum] === 'ALL_COLOR' || allColorSigniNums?.has(cardNum);
    const extraColors = fieldSigniExtraColors?.get(cardNum);
    // 実効レベル（temp_level_mods 適用済み）＝LEVEL_MODIFY 効果。mod が無ければ undefined（従来挙動）。
    const lvMods = state.temp_level_mods;
    const effLevel = lvMods && lvMods.length
      ? Math.max(0, parseInt(cardMap.get(cardNum)?.Level ?? '', 10) + lvMods.filter(m => m.cardNum === cardNum).reduce((s, m) => s + m.delta, 0))
      : undefined;
    if (!isAllColor && !matchesFilter(cardMap.get(cardNum), filter, effectivePowers?.get(cardNum), classOverride, undefined, effLevel)) {
      // 追加色がある場合: 色フィルターだけ追加色でも再チェック
      if (!extraColors || !filter?.color) return [];
      const filterColors = Array.isArray(filter.color) ? filter.color : [filter.color];
      if (!filterColors.some(c => extraColors.includes(c))) return [];
      // 色フィルター以外のフィルターを通常チェック
      const filterNoColor = { ...filter, color: undefined };
      if (!matchesFilter(cardMap.get(cardNum), filterNoColor, effectivePowers?.get(cardNum), classOverride, undefined, effLevel)) return [];
    }
    if (isAllColor) {
      // 色フィルター以外のフィルターは通常通りチェック
      const filterNoColor = filter ? { ...filter, color: undefined } : undefined;
      if (!matchesFilter(cardMap.get(cardNum), filterNoColor, effectivePowers?.get(cardNum), classOverride, undefined, effLevel)) return [];
    }
    return [cardNum];
  });
  // superlative: 候補集合のうち最大/最小のパワー/レベルを持つもののみ残す（同値は全て＝「すべて」対応）。
  //   パワーは実効値（effectivePowers）優先→表記値。レベルは temp_level_mods 適用済み実効レベル。
  if (!filter?.superlative || baseCands.length <= 1) return baseCands;
  const { key, dir } = filter.superlative;
  const metric = (num: string): number => {
    if (key === 'power') {
      const ep = effectivePowers?.get(num);
      if (ep !== undefined) return ep;
      const p = parseInt(cardMap.get(num)?.Power ?? '', 10);
      return Number.isNaN(p) ? 0 : p;
    }
    const base = parseInt(cardMap.get(num)?.Level ?? '', 10);
    const lvBase = Number.isNaN(base) ? 0 : base;
    const mods = (state.temp_level_mods ?? []).filter(m => m.cardNum === num).reduce((s, m) => s + m.delta, 0);
    return Math.max(0, lvBase + mods);
  };
  const vals = baseCands.map(metric);
  const ext = dir === 'max' ? Math.max(...vals) : Math.min(...vals);
  return baseCands.filter((_, i) => vals[i] === ext);
}

export function handCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.hand.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

/**
 * LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）＝「（次の）対戦相手のメインフェイズとアタックフェイズの間、
 * 対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない」。
 *
 * 判定は2条件の AND：
 *  ① 動かそうとしているのが**効果のコントローラー自身**のトラッシュであること（`owner === 'self'`。
 *     ctx.ownerState がコントローラーという engine 共通規約。相手の効果でそのトラッシュを動かすのは
 *     原文が禁じていないので通す＝`STEAL_OPP_TRASH_PUPPET` 等は素通り）。
 *  ② そのコントローラーにロックが立っていて、いまがメイン／アタックフェイズであること。
 *     `currentPhase` 不明時は**ロックしない**（permissive＝機構導入で既存挙動を変えない側に倒す）。
 *
 * ⚠**この述語がロックの唯一の真実**。トラッシュを発生源にする経路（`trashCandidates` の7地点＋
 *   `PLACE_UNDER_SIGNI`／`ATTACH_CHARM`／トラッシュ直操作 STUB 5種）はすべてここを通すこと。
 *   母集団は `scripts/` の走査で「自分のトラッシュからカードが出る効果 330件」→ 本述語適用で 0件を実測。
 */
const TRASH_LOCK_PHASES = ['MAIN', 'ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'];
export function isOwnTrashMoveLocked(owner: Owner, ctx: ExecCtx): boolean {
  if (owner !== 'self') return false;
  if (!ctx.ownerState?.lock_trash_move_this_turn) return false;
  return TRASH_LOCK_PHASES.includes(ctx.currentPhase ?? '');
}

export function trashCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.trash.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

/**
 * トラッシュを発生源にする候補列。`trashCandidates` にロック判定（`isOwnTrashMoveLocked`）を被せたもの。
 * ロック中は候補0＝アクションは「対象がない」で自然に no-op する（盤面を巻き戻す必要がない）。
 */
export function movableTrashCandidates(
  owner: Owner, state: PlayerState, filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>, ctx: ExecCtx, allZoneClassOverrides?: Record<string, string>,
): string[] {
  if (isOwnTrashMoveLocked(owner, ctx)) return [];
  return trashCandidates(state, filter, cardMap, allZoneClassOverrides);
}

export function energyCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.energy.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

export function evalCondition(cond: Condition, ctx: ExecCtx): boolean {
  const s = ctx.ownerState;
  const o = ctx.otherState;
  function st(owner: Owner) { return owner === 'self' ? s : o; }
  function cmp(a: number, op: string, b: number): boolean {
    switch (op) {
      case 'gte': return a >= b; case 'lte': return a <= b;
      case 'gt':  return a > b;  case 'lt':  return a < b;
      case 'eq':  return a === b; case 'neq': return a !== b;
      default: return true;
    }
  }
  switch (cond.type) {
    case 'CENTER_LRIG_NOT_GROWN_THIS_TURN':
      return !(st(cond.owner).actions_done ?? []).includes('GROW');
    case 'FIELD_LRIGS_SHARE_COLOR': {
      const f = st(cond.owner).field;
      const nums = [f.lrig.at(-1), f.assist_lrig_l?.at(-1), f.assist_lrig_r?.at(-1)].filter((n): n is string => !!n);
      const sets = nums.map(n => new Set(splitColors(ctx.cardMap.get(getCardNum(n))?.Color)));
      const choose = (start: number, picked: Set<string>[]): boolean => {
        if (picked.length === cond.minCount) {
          const common = new Set(picked[0] ?? []);
          for (const colors of picked.slice(1)) for (const c of common) if (!colors.has(c)) common.delete(c);
          return common.size > 0;
        }
        for (let i = start; i < sets.length; i++) if (choose(i + 1, [...picked, sets[i]])) return true;
        return false;
      };
      return cond.minCount > 0 && sets.length >= cond.minCount && choose(0, []);
    }
    case 'FIELD_LRIGS_HAVE_COLORS': {
      const f = st(cond.owner).field;
      const nums = [f.lrig.at(-1), f.assist_lrig_l?.at(-1), f.assist_lrig_r?.at(-1)]
        .filter((n): n is string => !!n);
      return cond.colors.every(color =>
        nums.some(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color).includes(color)));
    }
    case 'FIELD_LRIG_COLOR_COUNT': {
      const f = st(cond.owner).field;
      const nums = [f.lrig.at(-1), f.assist_lrig_l?.at(-1), f.assist_lrig_r?.at(-1)]
        .filter((n): n is string => !!n);
      if (nums.length < (cond.minLrigs ?? 0)) return false;
      const colors = new Set(nums.flatMap(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color)));
      return cmp(colors.size, cond.operator, cond.value);
    }
    case 'FIELD_COUNT':
      return cmp(st(cond.owner).field.signi.filter(s => s && s.length > 0).length,
        cond.operator, resolveNum(cond.value));
    case 'DECK_COUNT':
      return cmp(st(cond.owner).deck.length, cond.operator, resolveNum(cond.value));
    case 'DECK_COUNT_FILTER': {
      const matched = st(cond.owner).deck.filter(cn =>
        matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter));
      return cmp(matched.length, cond.operator, resolveNum(cond.value));
    }
    case 'HAND_COUNT':
      if (cond.owner === 'any') {
        return cmp(s.hand.length, cond.operator, resolveNum(cond.value)) ||
          cmp(o.hand.length, cond.operator, resolveNum(cond.value));
      }
      return cmp(st(cond.owner).hand.length, cond.operator, resolveNum(cond.value));
    case 'HAND_COUNT_FILTER': {
      const matched = handCandidates(st(cond.owner), cond.filter, ctx.cardMap);
      const n = cond.distinctName
        ? new Set(matched.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn)).size
        : matched.length;
      return cmp(n, cond.operator, resolveNum(cond.value));
    }
    case 'HAND_DIFF':
      return cmp(s.hand.length - o.hand.length, cond.operator, cond.value);
    case 'LIFE_COUNT':
      return cmp(st(cond.owner).life_cloth.length, cond.operator, resolveNum(cond.value));
    case 'TURN_OWNER':
      return ctx.isOwnerTurn == null || (cond.owner === 'self' ? ctx.isOwnerTurn : !ctx.isOwnerTurn);
    case 'LIFE_CRASHED_THIS_TURN':
      return cmp(st(cond.owner).life_crashed_this_turn ?? 0, cond.operator, resolveNum(cond.value));
    case 'LIFE_CRASHED_LAST_TURN':
      return cmp(st(cond.owner).life_crashed_last_turn ?? 0, cond.operator, resolveNum(cond.value));
    case 'ENERGY_COUNT':
      return cmp(st(cond.owner).energy.length, cond.operator, resolveNum(cond.value));
    case 'ENERGY_COUNT_FILTER': {
      const matched = energyCandidates(st(cond.owner), cond.filter, ctx.cardMap, ctx.treatAsClassAllZones);
      const n = cond.distinctClasses
        ? new Set(matched.flatMap(cn => splitClasses(ctx.cardMap.get(cn)?.CardClass)).filter(c => !(cond.excludeClasses ?? []).includes(c))).size
        : cond.distinctColor
        ? new Set(matched.flatMap(cn => splitColors(ctx.cardMap.get(cn)?.Color))).size
        : cond.distinctName
        ? new Set(matched.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn)).size
        : matched.length;
      return cmp(n, cond.operator, resolveNum(cond.value));
    }
    case 'ENERGY_EACH_LEVEL_FILTER_GTE': {
      const matched = energyCandidates(st(cond.owner), cond.filter, ctx.cardMap, ctx.treatAsClassAllZones);
      return cond.levels.every(level =>
        matched.filter(cn => Number(ctx.cardMap.get(getCardNum(cn))?.Level) === level).length >= cond.minEach);
    }
    case 'LAST_PROCESSED_HAS_NO_ABILITIES': {
      const last = ctx.lastProcessedCards?.[0];
      if (!last) return false;
      const mapped = ctx.effectsMap?.get(getCardNum(last));
      if (mapped) return mapped.length === 0;
      const text = ctx.cardMap.get(getCardNum(last))?.EffectText ?? '';
      return !/(?:【|\[)(?:常|自|起|出)(?:】|])/.test(text);
    }
    case 'ENERGY_HAS_COLOR': {
      const ez = st(cond.owner).energy;
      return cond.colors.every(color => ez.some(n => ctx.cardMap.get(n)?.Color?.includes(color)));
    }
    case 'CARDS_DRAWN_BY_EFFECT':
      return cmp(st(cond.owner).cards_drawn_by_effect_this_turn ?? 0, cond.operator, cond.value);
    case 'HAND_TRASHED_BY_OPP':
      return cmp(st(cond.owner).hand_trashed_by_opp_this_turn ?? 0, cond.operator, cond.value);
    case 'ENERGY_TRASHED_BY_OPP':
      return cmp(st(cond.owner).energy_trashed_by_opp_this_turn ?? 0, cond.operator, cond.value);
    case 'ARTS_USED_THIS_TURN': {
      const artsSt = st(cond.owner);
      // color 指定時は当該色のアーツを使用していた場合のみ（turn_arts_used_colors）
      if (cond.color) return (artsSt.turn_arts_used_colors ?? []).includes(cond.color);
      return artsSt.turn_arts_used === true;
    }
    case 'NO_OTHER_ARTS_USED_THIS_TURN':
      return (ctx.ownerState.turn_arts_used_names ?? []).filter(name => name !== cond.exceptCardName).length === 0;
    case 'SPELL_USED_THIS_TURN':
      // handleUseSpell が actions_done に積む 'USE_SPELL' マーカー（ターン開始時リセット）＝
      // firstSpellExtra 等の既存機能と同じ判定源を参照する
      return (st(cond.owner).actions_done ?? []).filter(a => a === 'USE_SPELL').length >= (cond.minCount ?? 1);
    case 'HAS_CARD_IN_FIELD': {
      const srcNum = ctx.sourceCardNum;
      const fst = st(cond.owner);
      // distinctNames:true は「N種類以上」＝カード名の異なる数を数える（「＜ブルアカ＞のシグニが３種類以上
      // ある場合」WX25-CP1-041/045・「それぞれ名前の異なる＜原子＞のシグニが３体あるかぎり」WX12-Re01）。
      // 一致したカード番号を集めてから数える（従来は件数だけ数えて distinctNames を黙って無視していた＝
      // 同名3体でも成立する過剰効果になっていた）。effectEngine の CONTINUOUS 収集と同じく CardName で寄せ、
      // CardData が引けない場合はカード番号にフォールバックする。
      const matchedNums = fst.field.signi.filter((stack, zoneIdx) => {
        if (!stack || stack.length === 0) return false;
        const top = stack[stack.length - 1];
        if (cond.excludeSelf && srcNum && top === srcNum) return false;
        // ゾーン状態（クロス/凍結）はCardDataに無いのでmatchesFilterと別に判定する
        if (cond.filter?.crossState !== undefined) {
          const isCross = fst.field.cross_state?.[zoneIdx] ?? false;
          if (cond.filter.crossState !== isCross) return false;
        }
        if (cond.filter?.isFrozen !== undefined) {
          const isFrozen = (fst.field.signi_frozen?.[zoneIdx] ?? false);
          if (cond.filter.isFrozen !== isFrozen) return false;
        }
        if (cond.filter?.isAwakened !== undefined) {
          const isAwk = (fst.awakened_signi ?? []).includes(top);
          if (cond.filter.isAwakened !== isAwk) return false;
        }
        if (cond.filter?.isPuppet !== undefined) {
          const isPuppet = (fst.field.puppet_signi ?? []).includes(top);
          if (cond.filter.isPuppet !== isPuppet) return false;
        }
        if (cond.filter?.hasCharm !== undefined) {
          const hasCharm = (fst.field.signi_charms?.[zoneIdx] ?? null) !== null;
          if (cond.filter.hasCharm !== hasCharm) return false;
        }
        return matchesFilter(ctx.cardMap.get(top), cond.filter);
      }).map(stack => stack![stack!.length - 1]);
      // ルリグゾーン走査：「あなたの場に《X》がいる場合」で X がルリグ名の場合（census文型バッチ・
      // センタールリグ＋アシスト2枚の各グロウスタック頂点を見る）。crossState/isFrozen はシグニゾーン
      // 専用状態フィルタのため、それらが指定された条件ではルリグを走査しない（偽陽性防止）。
      if (!cond.filter?.crossState && !cond.filter?.isFrozen && !cond.filter?.isAwakened && !cond.filter?.isPuppet) {
        for (const ln of lrigZoneTops(fst.field)) {
          if (ln && matchesFilter(ctx.cardMap.get(ln), cond.filter)) matchedNums.push(ln);
        }
        // キーゾーン走査：「対戦相手の場にキーがある場合」。cardType:'キー' を
        // matchesFilter で照合するため、既存のシグニ／ルリグ条件には影響しない。
        const key = fst.field.key_piece;
        if (key && !(cond.excludeSelf && srcNum && key === srcNum)
            && matchesFilter(ctx.cardMap.get(key), cond.filter)) matchedNums.push(key);
      }
      const matched = cond.distinctClasses
        ? new Set(matchedNums.flatMap(n => splitClasses(ctx.cardMap.get(n)?.CardClass)).filter(c => !(cond.excludeClasses ?? []).includes(c))).size
        : cond.distinctColors
        ? new Set(matchedNums.flatMap(n => splitColors(ctx.cardMap.get(n)?.Color))).size
        : cond.distinctLevels ? new Set(matchedNums.map(n => ctx.cardMap.get(n)?.Level ?? '')).size
        : cond.distinctNames ? new Set(matchedNums.map(n => ctx.cardMap.get(n)?.CardName ?? n)).size : matchedNums.length;
      return matched >= (cond.minCount ?? 1);
    }
    case 'HAS_KEY_IN_FIELD': {
      const f = st(cond.owner).field;
      return f.key_piece != null || (f.key_piece_extra?.length ?? 0) > 0;
    }
    case 'ALL_FIELD_SIGNI_MATCH': {
      // 「あなたの場にあるすべてのシグニが＜C＞/《X》の場合」＝場の全シグニ（各スタック頂点）が filter 一致。
      // 空盤面は false（1体以上を要求＝軍勢が居ないのに空振り発火しない）。ルリグは対象外（シグニのみ）。
      const fst2 = st(cond.owner);
      const tops = fst2.field.signi
        .map((stack, zoneIdx) => stack && stack.length ? { cardNum: stack[stack.length - 1], zoneIdx } : null)
        .filter((n): n is { cardNum: string; zoneIdx: number } => n !== null);
      if (tops.length === 0) return false;
      return tops.every(({ cardNum, zoneIdx }) => {
        if (cond.filter.isFrozen !== undefined && cond.filter.isFrozen !== (fst2.field.signi_frozen?.[zoneIdx] ?? false)) return false;
        if (cond.filter.isAwakened !== undefined && cond.filter.isAwakened !== (fst2.awakened_signi ?? []).includes(cardNum)) return false;
        if (cond.filter.isPuppet !== undefined && cond.filter.isPuppet !== (fst2.field.puppet_signi ?? []).includes(cardNum)) return false;
        return matchesFilter(ctx.cardMap.get(cardNum), cond.filter);
      });
    }
    case 'ALL_SELF_SIGNI_DOWN': {
      const occupied = ctx.ownerState.field.signi
        .map((stack, zoneIdx) => ({ stack, zoneIdx }))
        .filter(({ stack }) => !!stack?.at(-1));
      return occupied.length > 0 && occupied.every(({ zoneIdx }) => ctx.ownerState.field.signi_down?.[zoneIdx] === true);
    }
    case 'TRASH_HAS_CARD': {
      const stripCC = ctx.oppTrashColorLoss && cond.owner === 'self';
      // minCount: フィルタ一致カードがN枚以上（省略=1。「トラッシュに＜武勇＞のシグニが10枚以上ある場合」等）
      const matchedCards = st(cond.owner).trash.filter(n => {
        const c = ctx.cardMap.get(n);
        if (!c) return false;
        return matchesFilter(stripCC ? { ...c, Color: '', CardClass: '' } : c, cond.filter);
      });
      const matched = cond.distinctClasses
        ? new Set(matchedCards.flatMap(n => splitClasses(ctx.cardMap.get(n)?.CardClass)).filter(c => !(cond.excludeClasses ?? []).includes(c))).size
        : cond.distinctName
        ? new Set(matchedCards.map(n => ctx.cardMap.get(n)?.CardName ?? getCardNum(n))).size
        : matchedCards.length;
      return matched >= (cond.minCount ?? 1);
    }
    case 'DECK_TOP_MATCHES': {
      const topNum = st(cond.owner).deck[0];
      if (!topNum) return false;
      const topCard = ctx.cardMap.get(topNum);
      if (matchesFilter(topCard, cond.filter)) return true;
      // LEVEL_REFERENCE_OVERRIDE: カードテキストで許容レベルが指定されている場合も考慮
      if (cond.filter && cond.filter.level !== undefined) {
        const targetLvDTM = typeof cond.filter.level === 'number' ? cond.filter.level : null;
        if (targetLvDTM !== null) {
          const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const txt = topCard?.EffectText ?? '';
          const single = txt.match(/レベルを参照する場合、レベル([０-９\d]+)として扱ってもよい/);
          if (single && parseInt(toHW(single[1])) === targetLvDTM) {
            return matchesFilter(topCard, { ...cond.filter, level: undefined });
          }
          const range = txt.match(/レベルを参照する場合、([０-９\d]+)～([０-９\d]+)いずれかのレベル/);
          if (range) {
            const minLv = parseInt(toHW(range[1])); const maxLv = parseInt(toHW(range[2]));
            if (targetLvDTM >= minLv && targetLvDTM <= maxLv) {
              return matchesFilter(topCard, { ...cond.filter, level: undefined });
            }
          }
        }
      }
      return false;
    }
    case 'LRIG_LEVEL': {
      const lrig = st(cond.owner).field.lrig;
      const topLrig = lrig[lrig.length - 1];
      if (!topLrig) return false;
      const lv = parseInt(ctx.cardMap.get(topLrig)?.Level ?? '-1', 10);
      return cmp(lv, cond.operator, cond.value);
    }
    case 'LRIG_STORY': {
      const lrig = st(cond.owner).field.lrig;
      const topLrig = lrig[lrig.length - 1];
      if (!topLrig) return false;
      const card = ctx.cardMap.get(topLrig);
      return card?.CardClass?.includes(cond.story) ?? false;
    }
    case 'LRIG_TEAM_COUNT': {
      // 場のルリグ（センター＋アシストL/R）のうち Team が一致する数（「＜うちゅうのはじまり＞のルリグが3体」。WXDi-D05-021）
      const fLTC = st(cond.owner).field;
      const lrigNumsLTC = [fLTC.lrig.at(-1), fLTC.assist_lrig_l?.at(-1), fLTC.assist_lrig_r?.at(-1)].filter((n): n is string => !!n);
      const cntLTC = lrigNumsLTC.filter(n => (ctx.cardMap.get(getCardNum(n))?.Team ?? '').includes(cond.team)).length;
      return cmp(cntLTC, cond.operator, cond.value);
    }
    case 'THIS_CARD_IN_LOCATION': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const loc = cond.location;
      if (loc === 'trash') return ctx.ownerState.trash.includes(src);
      if (loc === 'energy') return ctx.ownerState.energy.includes(src);
      if (loc === 'lrig_trash') return ctx.ownerState.lrig_trash.includes(src);
      return false;
    }
    case 'THIS_CARD_IN_CENTER_ZONE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      return ctx.ownerState.field.signi[1]?.includes(src) ?? false;
    }
    case 'THIS_CARD_IS_DOWN': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.includes(src));
      if (zoneIdx < 0) return false;
      return ctx.ownerState.field.signi_down?.[zoneIdx] ?? false;
    }
    case 'THIS_CARD_IS_UP': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.includes(src));
      if (zoneIdx < 0) return false;
      return !(ctx.ownerState.field.signi_down?.[zoneIdx] ?? false);
    }
    case 'CENTER_LRIG_IS_UP':
      return !(ctx.ownerState.field.lrig_down ?? false);
    case 'THIS_CARD_IS_ARMORED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === src);
      if (zoneIdx < 0) return false;
      return ctx.ownerState.field.signi_armor?.[zoneIdx] ?? false;
    }
    case 'THIS_CARD_IS_AWAKENED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      return ctx.ownerState.awakened_signi?.includes(src) ?? false;
    }
    case 'THIS_CARD_IS_ACCED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === src);
      if (zoneIdx < 0) return false;
      return (ctx.ownerState.field.signi_acce?.[zoneIdx] ?? null) !== null;
    }
    case 'IS_DRIVE_STATE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      return ctx.ownerState.lrig_riding_signi?.includes(src) ?? false;
    }
    case 'TURN_HAND_DISCARD_GTE':
      return (ctx.ownerState.turn_hand_discarded_count ?? 0) >= cond.value;
    case 'SAME_ZONE_HAS_GATE': {
      // このシグニ（sourceCardNum）と同じシグニゾーンに THE DOOR【ゲート】がある場合
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zi = s.field.signi.findIndex(z => z?.at(-1) === src);
      if (zi < 0) return false;
      return (s.own_gate_zones ?? []).includes(zi);
    }
    case 'FIELD_HAS_GATE':
      return (st(cond.owner).own_gate_zones ?? []).length > 0;
    case 'THIS_CARD_HAS_UNDER': {
      // filter 指定時は下カードのいずれかがフィルタ一致（「下にレベルNのシグニがあるかぎり」等。WX24-P1-043）
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const stack = ctx.ownerState.field.signi.find(s => s?.at(-1) === src);
      const hasMatch = !!stack && stack.length > 1 && (!cond.filter || stack.slice(0, -1).some(cn => {
        const base = cn.includes('#') ? cn.slice(0, cn.indexOf('#')) : cn;
        return matchesFilter(ctx.cardMap.get(base), cond.filter);
      }));
      return cond.negate ? !hasMatch : hasMatch;
    }
    case 'LRIG_LEVEL_EQ_OPP': {
      const myLrig = s.field.lrig.at(-1);
      const opLrig = o.field.lrig.at(-1);
      if (!myLrig || !opLrig) return false;
      const myLv = parseInt(ctx.cardMap.get(myLrig)?.Level ?? '-1', 10);
      const opLv = parseInt(ctx.cardMap.get(opLrig)?.Level ?? '-2', 10);
      return myLv === opLv;
    }
    case 'LRIG_LEVEL_CMP_OPP': {
      // 自分のセンタールリグのレベルが対戦相手のセンタールリグ より低い/以下/より高い/以上 の場合
      const myLrig = s.field.lrig.at(-1);
      const opLrig = o.field.lrig.at(-1);
      if (!myLrig || !opLrig) return false;
      const myLv = parseInt(ctx.cardMap.get(myLrig)?.Level ?? '', 10);
      const opLv = parseInt(ctx.cardMap.get(opLrig)?.Level ?? '', 10);
      if (isNaN(myLv) || isNaN(opLv)) return false;
      return cond.operator === 'lt' ? myLv < opLv
        : cond.operator === 'lte' ? myLv <= opLv
        : cond.operator === 'gt' ? myLv > opLv
        : myLv >= opLv;
    }
    case 'LRIG_NAME_CONTAINS': {
      const lrig = st(cond.owner).field.lrig.at(-1);
      if (!lrig) return false;
      return ctx.cardMap.get(lrig)?.CardName?.includes(cond.name) ?? false;
    }
    case 'LRIG_COLOR': {
      const lrig = st(cond.owner).field.lrig.at(-1);
      if (!lrig) return false;
      return ctx.cardMap.get(lrig)?.Color?.includes(cond.color) ?? false;
    }
    case 'LRIG_DECK_COUNT':
      return cmp(st(cond.owner).lrig_deck.length, cond.operator, cond.value);
    case 'LRIG_TRASH_COUNT': {
      const types = cond.cardType
        ? (Array.isArray(cond.cardType) ? cond.cardType : [cond.cardType])
        : null;
      const cnt = ctx.ownerState.lrig_trash.filter(n => {
        // excludeSource: 使用中のカード自身（sourceCardNum）はまだルリグトラッシュに置かれていない扱い＝リコレクト判定
        if (cond.excludeSource && n === ctx.sourceCardNum) return false;
        const c = ctx.cardMap.get(n);
        if (!c) return false;
        return types ? types.includes(c.Type as typeof types[number]) : true;
      }).length;
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'FIELD_CLASS_COUNT': {
      const cnt = st(cond.owner).field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        return ctx.cardMap.get(top)?.CardClass?.includes(cond.story) ? n + 1 : n;
      }, 0);
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'SUBSCRIBER_COUNT':
      return cmp(ctx.ownerState.subscriber_count ?? 0, cond.operator, cond.value);
    case 'SELF_POWER_GTE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const pw = ctx.effectivePowers?.get(src) ?? parseInt(ctx.cardMap.get(src)?.Power ?? '0', 10);
      return cmp(pw, cond.operator ?? 'gte', cond.value);
    }
    case 'THIS_CARD_FROM_TRASH':
      // このシグニがトラッシュから場に出た場合（execAddToField で signi_played_from_trash に記録）
      return !!ctx.sourceCardNum && (ctx.ownerState.signi_played_from_trash?.includes(ctx.sourceCardNum) ?? false);
    case 'THIS_CARD_FROM_NON_HAND_THIS_TURN':
      return !!ctx.sourceCardNum && (ctx.ownerState.signi_played_from_non_hand_this_turn?.includes(ctx.sourceCardNum) ?? false);
    case 'THIS_CARD_FROM_DECK':
      return !!ctx.sourceCardNum && (ctx.ownerState.signi_played_from_deck?.includes(ctx.sourceCardNum) ?? false);
    case 'THIS_CARD_PLACED_BY_CLASS': {
      // このシグニが＜X＞のシグニの効果によって場に出ていた場合（出自条件・WX26-CP1-048）。
      // signi_placed_by_source に記録された発生源カードの CardClass に cardClass が含まれ、かつシグニであること。
      if (!ctx.sourceCardNum) return false;
      const srcPBC = ctx.ownerState.signi_placed_by_source?.[ctx.sourceCardNum];
      if (!srcPBC) return false;
      if (!cond.cardClass) return true;
      const wantedClass = cond.cardClass;
      const srcCardPBC = ctx.cardMap.get(getCardNum(srcPBC));
      if (!srcCardPBC || srcCardPBC.Type !== 'シグニ') return false;
      return (srcCardPBC.CardClass ?? '').split(/[/／]/).map(s => s.trim()).some(c => c.includes(wantedClass));
    }
    case 'LAST_PROCESSED_SHARES_COLOR_WITH_LRIG': {
      // 直前に処理したカード（lastProcessed）が指定プレイヤーのセンタールリグと共通する色を持つ場合（WX26-CP1-048）。
      const lpSC = ctx.lastProcessedCards?.[0];
      if (!lpSC) return false;
      const lpColors = (ctx.cardMap.get(getCardNum(lpSC))?.Color ?? '').split(/[/／、,]/).map(c => c.trim()).filter(Boolean);
      if (lpColors.length === 0) return false;
      const lrigTopSC = st(cond.owner).field.lrig.at(-1);
      if (!lrigTopSC) return false;
      const lrigColorSC = ctx.cardMap.get(getCardNum(lrigTopSC))?.Color ?? '';
      return lpColors.some(c => lrigColorSC.includes(c));
    }
    case 'FIELD_SIGNI_POWER_COUNT': {
      const cnt = st(cond.owner).field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        const pw = ctx.effectivePowers?.get(top) ?? parseInt(ctx.cardMap.get(top)?.Power ?? '0', 10);
        return pw >= cond.minPower ? n + 1 : n;
      }, 0);
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'LIFE_COMPARE_OPP':
      return cmp(s.life_cloth.length, cond.operator, o.life_cloth.length);
    // 手札/エナの両プレイヤー比較（LIFE_COMPARE_OPP と同じ向き＝cmp(自分, op, 相手)）。タスク12(lxiii)
    case 'HAND_COMPARE_OPP':
      return cmp(s.hand.length, cond.operator, o.hand.length);
    case 'ENERGY_COMPARE_OPP':
      return cmp(s.energy.length, cond.operator, o.energy.length);
    case 'EFFECTIVE_LRIG_LIMIT_GTE':
      return !!ctx.effectsMap && computeEffectiveLrigLimit(
        s, o, ctx.cardMap, ctx.effectsMap, ctx.isOwnerTurn ?? true,
      ) >= cond.value;
    case 'DURING_PHASE':
      return cond.phases.includes(ctx.currentPhase ?? '');
    case 'AND':
      return cond.conditions.every(c => evalCondition(c, ctx));
    case 'OR':
      return cond.conditions.some(c => evalCondition(c, ctx));
    // IS_MY_TURN / IS_OPPONENT_TURN は実行時には判定できない（executor は常にオーナー視点）ため、
    // どちらもプレースホルダとして true を返す。実際のターン判定は収集側（BattleScreen）が condHas で行う。
    case 'IS_MY_TURN':            return true;
    case 'IS_OPPONENT_TURN':      return true;
    // IS_BETTING: このアーツ/スペルでベットを宣言していたか（is_betting_this_effect）。
    // 「あなたがベットしていた場合、代わりに」の択一に使う（CONDITIONAL then=強化 / else=基本）。
    case 'IS_BETTING':            return !!ctx.ownerState.is_betting_this_effect &&
      (cond.minCoins == null || (ctx.ownerState.bet_coins_paid ?? 0) >= cond.minCoins);
    case 'IS_BOOSTING':           return !!ctx.ownerState.is_boosting_this_effect;
    case 'ANY_PLAYER_REFRESHED_THIS_TURN':
      return (ctx.ownerState.refresh_count_this_turn ?? 0) > 0
        || (ctx.otherState.refresh_count_this_turn ?? 0) > 0;
    case 'BEAT_CONDITION': {
      const beatZone = ctx.ownerState.field.beat_zone ?? [];
      return checkBeatCondition(beatZone, cond.condText, ctx.cardMap);
    }
    case 'LAST_PROCESSED_SHARE_COLOR': {
      // lastProcessedCards 全てに共通する色が1つ以上あるか（「それらがそれぞれ共通する色を持つ場合」。WDK10-008）
      const lst = ctx.lastProcessedCards ?? [];
      if (lst.length === 0) return false;
      const colorSets = lst.map(n => splitColors(ctx.cardMap.get(getCardNum(n))?.Color));
      const common = colorSets.reduce((acc, cols) => acc.filter(c => cols.includes(c)), colorSets[0]);
      return common.length > 0;
    }
    case 'PAID_ADDITIONAL_COST':  return false; // execSequence の look-ahead で処理済みのため通常到達しない
    case 'COND_STUB':             return true;
    case 'OPPONENT_NOT_PAID':            return ctx.ownerState.opponent_paid_optional_cost !== true;
    case 'SELF_OPTIONAL_EFFECT_TAKEN':  return ctx.ownerState.self_optional_effect_taken === true;
    case 'HAS_BOND': {
      const name = cond.cardName ?? (ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum)?.CardName : undefined);
      if (!name) return false;
      return ctx.ownerState.bonds?.includes(name) ?? false;
    }
    case 'ACTIVATED_DISCARD_COUNT_GTE':
      return (ctx.ownerState.last_activated_discard_count ?? 0) >= cond.value;
    // ── §3 タスク6「代わりに」B1残（per-target 値すり替えの置換ゲート）
    case 'OPP_CARDS_MOVED_TO_DECK_THIS_TURN':
      return cmp(ctx.ownerState.opp_cards_moved_to_deck_this_turn ?? 0, cond.operator, cond.value);
    case 'SELF_DECK_TO_ENERGY_THIS_TURN':
      return cmp(ctx.ownerState.self_deck_to_energy_this_turn ?? 0, cond.operator, cond.value);
    case 'SELECTED_COLOR':
      return (ctx.ownerState.story_overrides?.['__selected_colors__']?.split(',') ?? []).includes(cond.color);
    case 'BEAT_ZONE_COUNT':
      return cmp(ctx.ownerState.field.beat_zone?.length ?? 0, cond.operator, cond.value);
    case 'THIS_CARD_UPPED_FROM_DOWN_THIS_TURN':
      return !!ctx.sourceCardNum && (ctx.ownerState.upped_from_down_this_turn ?? []).includes(ctx.sourceCardNum);
    case 'COST_TRASHED_PUPPET':
      return ctx.ownerState.last_cost_trashed_puppet === true;
    case 'COST_DISCARDED_SIGNI_LEVEL':
      return (ctx.ownerState.last_discarded_signi_level ?? -1) === cond.level;
    case 'COST_TRASHED_MATCHES':
      // 直前のコスト支払いでトラッシュへ送ったカードに filter 一致が1枚以上あるか（§3タスク6 C）。
      return (ctx.ownerState.last_cost_trashed_cards ?? [])
        .some(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), cond.filter));
    case 'ENERGY_TRASH_COLOR_COUNT_GTE':
      return (ctx.ownerState.last_energy_trash_color_count ?? 0) >= cond.value;
    case 'NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURN':
      return !ctx.ownerState.non_dissona_spell_played_this_turn;
    case 'DECK_TOP_SHARES_COLOR_WITH_LRIG': {
      // デッキの一番上のカードと共通する色を持つルリグ（センター＋アシスト）が場にいるか（G157）
      const ps = st(cond.owner);
      const topNum = ps.deck[0];
      if (!topNum) return false;
      const topColors = (ctx.cardMap.get(topNum)?.Color ?? '').split(/[/／、,]/).map(c => c.trim()).filter(Boolean);
      if (topColors.length === 0) return false;
      const lrigNums = [ps.field.lrig.at(-1), ps.field.assist_lrig_l?.at(-1), ps.field.assist_lrig_r?.at(-1)].filter((n): n is string => !!n);
      return lrigNums.some(ln => {
        const lc = ctx.cardMap.get(ln)?.Color ?? '';
        return topColors.some(c => lc.includes(c));
      });
    }
    case 'FIELD_SIGNI_ALL_DISTINCT_CLASS': {
      // 場のシグニが互いに共通するクラス（CardClass）を持たない場合（プライマル系。G158）
      const ps = st(cond.owner);
      const classSets = ps.field.signi
        .map(stack => stack?.at(-1))
        .filter((n): n is string => !!n)
        .map(n => new Set((ctx.cardMap.get(n)?.CardClass ?? '').split('／').map(s => s.trim()).filter(Boolean)));
      for (let i = 0; i < classSets.length; i++) {
        for (let j = i + 1; j < classSets.length; j++) {
          for (const cl of classSets[i]) if (classSets[j].has(cl)) return false;
        }
      }
      return true;
    }
    case 'LAST_PROCESSED_COUNT_GTE': {
      const matched = (ctx.lastProcessedCards?.length ?? 0) >= cond.value;
      return cond.negate ? !matched : matched;
    }
    case 'LAST_PROCESSED_SIGNI_LEVEL_PARITY_DIFFERS_FROM_DECLARED': {
      const signi = (ctx.lastProcessedCards ?? [])
        .map(cn => ctx.cardMap.get(cn))
        .find(card => card?.Type === 'シグニ');
      const declared = ctx.ownerState.declared_number;
      if (!signi || (declared !== 0 && declared !== 1)) return false;
      const level = parseInt(signi.Level ?? '', 10);
      return Number.isFinite(level) && Math.abs(level % 2) !== declared;
    }
    case 'LAST_PROCESSED_LEVEL_SUM': {
      // lastProcessedCardsのシグニのレベル合計と value を operator で比較（合計がN／N以上／N以下。WD21-012等）
      const processed = ctx.lastProcessedCards ?? [];
      const sum = processed.reduce((acc, cn) => {
        const c = ctx.cardMap.get(cn);
        if (c?.Type !== 'シグニ') return acc;
        return acc + (parseInt(c.Level ?? '0', 10) || 0);
      }, 0);
      return cmp(sum, cond.operator, cond.value);
    }
    case 'TRASHED_DISTINCT_LEVELS_GTE': {
      // この方法でトラッシュしたシグニ(lastProcessedCards)のうち、相異なるレベルが cond.count 種以上か（WX03-015）
      const processedTDL = ctx.lastProcessedCards ?? [];
      const levels = new Set<number>();
      for (const cn of processedTDL) {
        const c = ctx.cardMap.get(cn);
        if (c?.Type !== 'シグニ') continue;
        levels.add(parseInt(c.Level ?? '0', 10) || 0);
      }
      if (cond.allSigniDistinct) {
        const signiCount = processedTDL.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ').length;
        return levels.size === signiCount;
      }
      return levels.size >= cond.count;
    }
    case 'TRASHED_STORY_COUNT_GTE': {
      // この方法でトラッシュしたシグニ(lastProcessedCards)のうち、＜story＞クラスが cond.count 体以上か（WX03-021）
      const processedTS = ctx.lastProcessedCards ?? [];
      let nTS = 0;
      for (const cn of processedTS) {
        const c = ctx.cardMap.get(cn);
        if (c?.Type !== 'シグニ') continue;
        if (c.CardClass?.includes(cond.story)) nTS++;
      }
      return nTS >= cond.count;
    }
    case 'TRASH_COUNT':
      return cmp(st(cond.owner).trash.length, cond.operator, cond.value);
    case 'LAST_PROCESSED_HAS_BURST': {
      const proc = ctx.lastProcessedCards ?? [];
      if (proc.length === 0) return false;
      const c = ctx.cardMap.get(proc[0]);
      const hasBurst = !!c?.LifeBurst && c.LifeBurst !== '-' && c.LifeBurst !== '';
      return cond.negate ? !hasBurst : hasBurst;
    }
    case 'LAST_PROCESSED_HAS_TYPE': {
      // この方法で直前に処理した（トラッシュ等）カードの中に指定Type（'スペル'等）が含まれるか（G164）
      const proc = ctx.lastProcessedCards ?? [];
      return proc.some(cn => ctx.cardMap.get(cn)?.Type === cond.cardType);
    }
    case 'LAST_PROCESSED_LEVEL_EQ_FRONT_SIGNI': {
      const processed = ctx.lastProcessedCards?.[0];
      const source = ctx.sourceCardNum;
      if (!processed || !source) return false;
      // 正面の解決は effectExecutor の resolveFrontOfSelfCardNum と同規約（発生源はスタックのトップに限る）。
      // ⚠execUtils → effectExecutor は循環 import になるため、ここでは同じ式を保つ形で揃える。
      const sourceZi = ctx.ownerState.field.signi.findIndex(stack => stack?.at(-1) === source);
      if (sourceZi < 0) return false;
      const front = ctx.otherState.field.signi[2 - sourceZi]?.at(-1);
      if (!front) return false;
      const processedLevel = parseInt(ctx.cardMap.get(getCardNum(processed))?.Level ?? '', 10);
      const frontLevel = parseInt(ctx.cardMap.get(getCardNum(front))?.Level ?? '', 10);
      return Number.isFinite(processedLevel) && processedLevel === frontLevel;
    }
    case 'LAST_PROCESSED_MATCHES': {
      // 直前に処理/公開/選択したカード(lastProcessedCards)のフィルタ付き件数・種類数・集合条件。
      // 旧 minCount は gte のまま互換維持し、operator/value で eq/lte 等も表す。
      const procM = ctx.lastProcessedCards ?? [];
      const centerLevel = cond.levelLteCenterLrig
        ? (() => {
            const lrig = st(cond.levelLteCenterLrig!).field.lrig.at(-1);
            if (!lrig) return undefined;
            const n = parseInt(ctx.cardMap.get(getCardNum(lrig))?.Level ?? '', 10);
            return Number.isFinite(n) ? n : undefined;
          })()
        : undefined;
      // ゾーン状態フィルタ（hasCharm/isFrozen/infected 等）が指定された場合は、直前に処理したカードを
      // 場から探してゾーン状態も照合する（「それに【チャーム】が付いている場合」WX25-P2-102/107/109。
      // matchesFilter は CardData のみで hasCharm 等を黙って無視するため、この補助照合が要る）。
      const ZONE_STATE_KEYS = ['hasCharm', 'hasAcce', 'infected', 'isDown', 'isFrozen', 'isAwakened', 'isUp', 'isArmored', 'inGateZone', 'centerZoneOnly'] as const;
      const needsZoneState = !!cond.filter && ZONE_STATE_KEYS.some(k => (cond.filter as Record<string, unknown>)[k] !== undefined);
      const matchedCards = procM.filter(cn => {
        const card = ctx.cardMap.get(getCardNum(cn));
        if (!matchesFilter(card, cond.filter)) return false;
        if (cond.levelLteCenterLrig) {
          if (centerLevel === undefined || card?.Type !== 'シグニ') return false;
          const level = parseInt(card.Level ?? '', 10);
          if (!Number.isFinite(level) || level > centerLevel) return false;
        }
        if (needsZoneState) {
          const loc = findFieldZoneState(cn, ctx);
          if (!loc || !matchesStateFilter(loc.state, loc.zoneIdx, cond.filter)) return false;
        }
        return true;
      });
      if (cond.requiredCardNames && !cond.requiredCardNames.every(name =>
        matchedCards.some(cn => ctx.cardMap.get(getCardNum(cn))?.CardName === name))) return false;
      if (cond.shareClass) {
        if (matchedCards.length === 0) return false;
        const classSets = matchedCards.map(cn => new Set(
          (ctx.cardMap.get(getCardNum(cn))?.CardClass ?? '').split(/[／/]/)
            .map(seg => seg.split(/[:：]/).pop()?.trim() ?? '').filter(Boolean),
        ));
        if (classSets[0].size === 0 || ![...classSets[0]].some(cl => classSets.every(set => set.has(cl)))) return false;
      }
      const count = cond.distinctName
        ? new Set(matchedCards.map(cn => ctx.cardMap.get(getCardNum(cn))?.CardName ?? getCardNum(cn))).size
        : matchedCards.length;
      return cmp(count, cond.operator ?? 'gte', cond.value ?? cond.minCount ?? 1);
    }
    case 'LAST_LOOK_TRASHED_MATCHES': {
      const count = (ctx.lastLookTrashedCards ?? [])
        .filter(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), cond.filter)).length;
      return count >= (cond.minCount ?? 1);
    }
    case 'LAST_PROCESSED_ALL_MATCH': {
      // 直前に処理した（トラッシュ/公開）カード(lastProcessedCards)が **すべて** filter 一致か
      //（「この方法でトラッシュに置かれたカードがすべて黒の場合」WXK09-097／「すべてのカードがレベル１のシグニの場合」
      //  WXDi-P05-042）。空集合は false（1枚も処理していなければ条件不成立）。minCount 系（≥N一致）とは別意味。
      const procA = ctx.lastProcessedCards ?? [];
      if (procA.length === 0) return false;
      return procA.every(cn => matchesFilter(ctx.cardMap.get(cn), cond.filter));
    }
    case 'LAST_PROCESSED_POWER_GTE': {
      // 直前に選択/処理したシグニ(lastProcessedCards[0])のパワー判定（WX03-046「それのパワーが15000以上」）。
      // effectivePowers は直前の POWER_MODIFY 適用前のスナップショットのため、addDelta でその+パワーを加味する。
      const lp = ctx.lastProcessedCards?.[0];
      if (!lp) return false;
      const base = ctx.effectivePowers?.get(lp) ?? parseInt(ctx.cardMap.get(lp)?.Power ?? '0', 10);
      return base + (cond.addDelta ?? 0) >= cond.value;
    }
    default: return true;
  }
}

// ===== 使用条件チェック（BattleScreen から呼び出す） =====
export function evalUseCondition(
  condition: import('../types/effects').Condition,
  ownerState: PlayerState,
  oppState: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum: string,
  currentPhase: string,
  effectivePowers?: Map<string, number>,
): boolean {
  const ctx: ExecCtx = {
    ownerState, otherState: oppState, cardMap,
    effectivePowers, sourceCardNum, currentPhase, logs: [],
  };
  return evalCondition(condition, ctx);
}

// ===== フィールドからカードを除去する（バニッシュ/バウンス共通） =====

export function removeFromField(cardNum: string, state: PlayerState): PlayerState {
  const zoneIdx = state.field.signi.findIndex(s => s?.at(-1) === cardNum);
  const newSigni = state.field.signi.map((stack, i) => {
    if (!stack) return null;
    if (stack[stack.length - 1] !== cardNum) return stack;
    // 血晶武装状態: 下に置かれたカードはルール処理でトラッシュへ（このゾーンを空にする）
    // 血晶武装でなくても複数枚あれば下カードをトラッシュへ（PLACE_UNDER_SIGNI等）
    if (i === zoneIdx) return null;
    return stack.length > 1 ? stack.slice(0, -1) : null;
  }) as (string[] | null)[];
  const newDown   = [...(state.field.signi_down   ?? [false, false, false])];
  const newFrozen = [...(state.field.signi_frozen  ?? [false, false, false])];
  const newCharms = [...(state.field.signi_charms  ?? [null, null, null])];
  const newAcce   = [...(state.field.signi_acce    ?? [null, null, null])];
  const newSoul   = [...(state.field.signi_soul    ?? [null, null, null])];
  const newArmor  = [...(state.field.signi_armor   ?? [false, false, false])];
  const extraTrash: string[] = [];
  const extraLrigTrash: string[] = [];
  if (zoneIdx >= 0) {
    newDown[zoneIdx]   = false;
    newFrozen[zoneIdx] = false;
    newArmor[zoneIdx]  = false;
    if (newCharms[zoneIdx]) { extraTrash.push(newCharms[zoneIdx]!); newCharms[zoneIdx] = null; }
    if (newAcce[zoneIdx])   { extraTrash.push(newAcce[zoneIdx]!);   newAcce[zoneIdx]   = null; }
    // ソウルはシグニが場を離れるとルリグトラッシュへ
    if (newSoul[zoneIdx])   { extraLrigTrash.push(newSoul[zoneIdx]!); newSoul[zoneIdx] = null; }
    // 血晶武装の下カード（スタックの先頭からシグニ直前まで）をトラッシュへ
    const oldStack = state.field.signi[zoneIdx] ?? [];
    if (oldStack.length > 1) {
      extraTrash.push(...oldStack.slice(0, -1));
    }
    // ウィルスはゾーンに属するため、シグニが離れても除去しない
  }
  // 場を離れたカードの card_identity_overrides エントリをクリア
  let newIdentityOverrides = state.card_identity_overrides;
  if (zoneIdx >= 0 && state.card_identity_overrides) {
    const removedCards = (state.field.signi[zoneIdx] ?? []);
    const hasEntry = removedCards.some(cn => state.card_identity_overrides![cn]);
    if (hasEntry) {
      newIdentityOverrides = { ...state.card_identity_overrides };
      for (const cn of removedCards) delete newIdentityOverrides[cn];
    }
  }
  // ドライブ状態クリーンアップ：乗られていたシグニが場を離れた場合
  let newLrigRiding = state.lrig_riding_signi;
  if (newLrigRiding?.includes(cardNum)) {
    const filtered = newLrigRiding.filter(cn => cn !== cardNum);
    newLrigRiding = filtered.length > 0 ? filtered : undefined;
  }
  return {
    ...state,
    card_identity_overrides: newIdentityOverrides,
    lrig_riding_signi: newLrigRiding,
    // 「**それがあった**シグニゾーン」の解決用マーカー（タスク12(lxxvi)・`WX08-032-E1`）。
    // 場を離れた直後にしか読まれない使い捨て（`hand_discarded_just` 等と同種）。⚠**上書き**なので
    // 複数体を続けて場から離すと最後の1ゾーンだけが残る（原文側の母集団は単体対象のみ）。
    signi_zone_vacated_just: zoneIdx >= 0 ? [zoneIdx] : state.signi_zone_vacated_just,
    trash: extraTrash.length > 0 ? [...state.trash, ...extraTrash] : state.trash,
    lrig_trash: extraLrigTrash.length > 0 ? [...state.lrig_trash, ...extraLrigTrash] : state.lrig_trash,
    field: {
      ...state.field,
      signi: newSigni,
      signi_down:   newDown   as boolean[],
      signi_frozen: newFrozen as boolean[],
      signi_charms: newCharms,
      signi_acce:   newAcce,
      signi_soul:   newSoul   as (string | null)[],
      signi_armor:  newArmor  as boolean[],
    },
  };
}

/** 遅延除外マークを、場を離れた直後またはターン終了時に専用ゾーンへ移す。 */
export function resolvePendingExiles(state: PlayerState, forceTurnEnd = false): PlayerState {
  const pending = state.pending_exile_nums ?? [];
  if (pending.length === 0) return state;
  let next = state;
  const remaining: string[] = [];
  for (const num of pending) {
    const onField = next.field.signi.some(stack => stack?.includes(num));
    if (onField && !forceTurnEnd) { remaining.push(num); continue; }
    if (onField) {
      next = removeFromField(num, next);
    } else {
      // 同名カードの別コピー（エナ・デッキ等）を巻き込まないよう、最初の1枚だけ取り除く
      for (const zone of ['deck', 'hand', 'trash', 'energy', 'life_cloth', 'lrig_deck', 'lrig_trash'] as const) {
        const idx = next[zone].indexOf(num);
        if (idx >= 0) {
          const arr = [...next[zone]]; arr.splice(idx, 1);
          next = { ...next, [zone]: arr };
          break;
        }
      }
    }
    next = { ...next, excluded: [...(next.excluded ?? []), num] };
  }
  return { ...next, pending_exile_nums: remaining.length ? remaining : undefined };
}

// SELECT_TARGET ヘルパー：候補数によって自動実行か要インタラクションかを決める
export function selectOrInteract(
  candidates: string[],
  count: number,
  optional: boolean,
  scope: TargetScope,
  thenAction: EffectAction,
  continuation: EffectAction | undefined,
  ctx: ExecCtx,
  opponentResponds = false,
  extra?: { totalPowerMax?: number; candidatePowers?: Record<string, number>; totalLevelMax?: number; candidateLevels?: Record<string, number>; selectionConstraint?: SelectionConstraint },
): ExecResult {
  // シャドウ：相手フィールドを対象とする効果からシャドウ持ちシグニを除外
  // both_field（owner:'any'）でも相手側の候補にはシャドウを適用する（自分側候補は対象外）
  let filteredCands = candidates;
  if (scope === 'opp_field' || scope === 'both_field') {
    // sourceCardNumがルリグの場合はシャドウ(ルリグ)も除外
    const sourceIsLrig = ctx.sourceCardNum
      ? ctx.cardMap.get(ctx.sourceCardNum)?.Type === 'ルリグ'
      : false;
    const sourceCardForShadow = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
    filteredCands = candidates.filter(n => {
      // both_field: 相手フィールドにあるシグニのみシャドウ判定（自分のシグニは常に選択可）
      if (scope === 'both_field' && !ctx.otherState.field.signi.some(s => s?.at(-1) === n)) return true;
      if (sourceIsLrig && hasShadowLrig(n, ctx.cardMap, ctx.otherState.keyword_grants, ctx.otherState.keyword_grants_until_opp_turn)) return false;
      // シャドウ（スコープなし＝無条件、スコープ付き＝発生源カードの属性で判定。activeCondition無しのもの）
      const scopes = getShadowScopes(n, ctx.cardMap, ctx.otherState.keyword_grants, ctx.otherState.bonds, ctx.otherState.keyword_grants_until_opp_turn);
      if (scopes.some(scope => evaluateShadowScope(scope, sourceCardForShadow, n, ctx.otherState, ctx.cardMap))) return false;
      // 場全体への継続シャドウ付与（GRANT_FIELD_SHADOW・同ゾーンゲート等）も評価
      const fieldScopes = getFieldGrantedShadowScopes(n, ctx.otherState, ctx.cardMap);
      if (fieldScopes.some(scope => evaluateShadowScope(scope, sourceCardForShadow, n, ctx.otherState, ctx.cardMap))) return false;
      // activeCondition 付きシャドウ（TURN_OWNER等）を評価:
      // n は ctx.otherState のシグニ。ownerState=otherState, isOwnerTurn=false（ctx.ownerState のターン中に効果実行）
      const hasCondShadow = ctx.cardMap.get(n)?.effects?.some(eff => {
        if (eff.effectType !== 'CONTINUOUS' || !eff.activeCondition) return false;
        if (eff.action.type !== 'GRANT_KEYWORD') return false;
        const scope = decodeShadowKeyword((eff.action as { keyword: string }).keyword);
        if (scope === null) return false;
        if (!checkActiveCondition(eff.activeCondition, ctx.otherState, ctx.ownerState, false, ctx.cardMap, n, ctx.effectivePowers)) return false;
        return evaluateShadowScope(scope, sourceCardForShadow, n, ctx.otherState, ctx.cardMap);
      }) ?? false;
      if (hasCondShadow) return false;
      return true;
    });
  }
  // 候補0件＝このステップは何も処理しなかった。lastProcessedCards を空に倒して「空振り」を記録する
  // （従来は done(ctx) で**直前ステップの残留値をそのまま持ち越して**いたため、後続の
  //  CONDITIONAL{IS_MY_TURN}＝「そうした場合」ゲートがすり抜けて過剰発火していた＝タスク12(xxix)③）。
  if (filteredCands.length === 0) return done({ ...ctx, lastProcessedCards: [] });
  return needsInteraction(ctx, {
    type: 'SELECT_TARGET',
    candidates: filteredCands,
    count,
    optional,
    targetScope: scope,
    thenAction,
    continuation,
    ...(opponentResponds ? { opponentResponds: true } : {}),
    ...(extra?.totalPowerMax !== undefined ? { totalPowerMax: extra.totalPowerMax } : {}),
    ...(extra?.candidatePowers ? { candidatePowers: extra.candidatePowers } : {}),
    ...(extra?.totalLevelMax !== undefined ? { totalLevelMax: extra.totalLevelMax } : {}),
    ...(extra?.candidateLevels ? { candidateLevels: extra.candidateLevels } : {}),
    ...(extra?.selectionConstraint ? { selectionConstraint: extra.selectionConstraint } : {}),
  });
}

function cardClasses(card: CardData | undefined): Set<string> {
  return new Set((card?.CardClass ?? '').split(/[：:／/・,\s]+/).map((s: string) => s.trim()).filter(Boolean));
}

function cardColors(card: CardData | undefined): Set<string> {
  const raw = `${card?.Color ?? ''}`;
  return new Set(raw.split(/[・／/,\s]+/).map(s => s.trim()).filter(s => s && s !== '無' && s !== '無色'));
}

export function satisfiesSelectionConstraint(
  nums: string[],
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!constraint || nums.length < 2) return true;
  const cards = nums.map(n => cardMap.get(getCardNum(n)));
  if (constraint.same === 'name') {
    const values = cards.map(c => `${c?.CardName ?? ''}`);
    if (new Set(values).size !== 1) return false;
  }
  if (constraint.distinct === 'level') {
    const values = cards.map(c => `${c?.Level ?? ''}`);
    if (new Set(values).size !== values.length) return false;
  } else if (constraint.distinct === 'name') {
    const values = cards.map(c => `${c?.CardName ?? ''}`);
    if (new Set(values).size !== values.length) return false;
  } else if (constraint.distinct === 'class') {
    const sets = cards.map(cardClasses);
    for (let i = 0; i < sets.length; i++) for (let j = i + 1; j < sets.length; j++) {
      if ([...sets[i]].some(v => sets[j].has(v))) return false;
    }
  }
  const colors = cards.map(cardColors);
  if (constraint.sharedColor === 'all') {
    if (colors.length > 0 && ![...colors[0]].some(v => colors.every(s => s.has(v)))) return false;
  } else if (constraint.sharedColor === 'none') {
    for (let i = 0; i < colors.length; i++) for (let j = i + 1; j < colors.length; j++) {
      if ([...colors[i]].some(v => colors[j].has(v))) return false;
    }
  }
  return true;
}

export function canAddToSelection(
  selected: string[],
  candidate: string,
  constraint: SelectionConstraint | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  return satisfiesSelectionConstraint([...selected, candidate], constraint, cardMap);
}

/**
 * カードの EffectText から【ライズ】条件フィルターを取得する。
 * ライズカードでない場合は null を返す。
 */
export function getRiseFilter(effectText: string): TargetFilter | null {
  const m = effectText.match(/【ライズ】(.+?)（この条件/s);
  if (!m) return null;
  const cond = m[1];
  const filter: TargetFilter = { cardType: 'シグニ' };

  // ＜クラス＞フィルター
  const classM = cond.match(/＜([^＞]+)＞/);
  if (classM) filter.story = classM[1];

  // 《ディソナアイコン》→ CSVの Story==='Dissona'（filter.story は CardClass 照合なのでここでは使えない）
  if (cond.includes('《ディソナアイコン》')) filter.isDisona = true;

  // 色フィルター（「赤の」「青の」等）
  const colorM = cond.match(/^あなたの(白|赤|青|緑|黒)の/);
  if (colorM) filter.color = colorM[1];

  // レベルフィルター（「レベルN以上の」）
  const lvM = cond.match(/レベル([０-９\d])以上/);
  if (lvM) {
    const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
    filter.level = { min: parseInt(toHW(lvM[1])) };
  }

  // 《ライズアイコン》を持つ → hasRiseIcon フラグ（matchesFilter拡張なしでは使えないので特殊扱い）
  if (cond.includes('《ライズアイコン》')) {
    // 特別フラグ: matchesFilter では処理不可→呼び出し側でカードテキストを直接確認する必要あり
    // filter.__hasRiseIcon = true; ← 拡張不可なのでstoryに特殊値を入れる
    (filter as Record<string, unknown>).__requiresRiseIcon = true;
  }

  return filter;
}

/**
 * ライズ条件フィルターに対して既存シグニがRISE配置先として有効かチェック。
 */
export function matchesRiseFilter(
  existingCardNum: string,
  filter: TargetFilter,
  cardMap: Map<string, CardData>,
): boolean {
  const card = cardMap.get(existingCardNum);
  if (!card) return false;
  // 《ライズアイコン》 → EffectText に【ライズ】があるか確認
  if ((filter as Record<string, unknown>).__requiresRiseIcon) {
    return !!(card.EffectText?.includes('【ライズ】'));
  }
  return matchesFilter(card, filter);
}

