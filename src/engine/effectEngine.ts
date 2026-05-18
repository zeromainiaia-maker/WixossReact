import type { PlayerState, CardData } from '../types';
import type {
  CardEffect,
  ActiveCondition,
  EffectAction,
  PowerModifyAction,
  PowerModifyPerStackAction,
  PowerModifyPerLevelSumAction,
  CostIncreaseAction,
  BlockActionAction,
  TargetFilter,
  EnergyCost,
} from '../types/effects';

// ===== activeCondition 判定 =====

function checkActiveCondition(
  cond: ActiveCondition | undefined,
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
): boolean {
  if (!cond) return true;
  switch (cond.type) {
    case 'TURN_OWNER':
      return cond.owner === 'self' ? isOwnerTurn : !isOwnerTurn;

    case 'HAS_CARD_IN_FIELD': {
      const state = cond.owner === 'self' ? ownerState : otherState;
      const fieldNums = state.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      return fieldNums.some(num => {
        if (cond.filter.cardNum)  return num === cond.filter.cardNum;
        if (cond.filter.cardName) return cardMap.get(num)?.CardName?.includes(cond.filter.cardName) ?? false;
        return true;
      });
    }

    case 'COUNT_THRESHOLD': {
      const state = cond.owner === 'self' ? ownerState : otherState;
      const count = getLocationCount(state, cond.location);
      switch (cond.operator) {
        case 'gte': return count >= cond.value;
        case 'lte': return count <= cond.value;
        case 'gt':  return count >  cond.value;
        case 'lt':  return count <  cond.value;
        case 'eq':  return count === cond.value;
        case 'neq': return count !== cond.value;
      }
      break;
    }

    case 'SELF_POWER_THRESHOLD':
      return true;

    case 'HAND_DIFF': {
      const diff = ownerState.hand.length - otherState.hand.length;
      switch (cond.operator) {
        case 'gte': return diff >= cond.value;
        case 'lte': return diff <= cond.value;
        case 'gt':  return diff >  cond.value;
        case 'lt':  return diff <  cond.value;
        case 'eq':  return diff === cond.value;
        case 'neq': return diff !== cond.value;
      }
      break;
    }

    case 'AND':
      return cond.conditions.every(c => checkActiveCondition(c, ownerState, otherState, isOwnerTurn, cardMap));
  }
  return true;
}

function getLocationCount(state: PlayerState, location: string): number {
  switch (location) {
    case 'hand':     return state.hand.length;
    case 'trash':    return state.trash.length;
    case 'energy':   return state.energy.length;
    case 'deck':     return state.deck.length;
    case 'life_cloth': return state.life_cloth.length;
    default:         return 0;
  }
}

// ===== フィルタ判定 =====

function matchesFilter(cardData: CardData | undefined, filter: TargetFilter | undefined): boolean {
  if (!filter || !cardData) return true;
  if (filter.cardType) {
    const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
    if (!types.includes(cardData.Type as typeof types[number])) return false;
  }
  if (filter.color) {
    const colors = Array.isArray(filter.color) ? filter.color : [filter.color];
    if (!colors.some(c => cardData.Color?.includes(c))) return false;
  }
  if (filter.level !== undefined) {
    const lvNum = parseInt(cardData.Level ?? '', 10);
    if (typeof filter.level === 'number') {
      if (lvNum !== filter.level) return false;
    } else {
      if (filter.level.min !== undefined && lvNum < filter.level.min) return false;
      if (filter.level.max !== undefined && lvNum > filter.level.max) return false;
    }
  }
  if (filter.powerRange) {
    const pw = parseInt(cardData.Power ?? '', 10);
    if (filter.powerRange.min !== undefined && pw < filter.powerRange.min) return false;
    if (filter.powerRange.max !== undefined && pw > filter.powerRange.max) return false;
  }
  return true;
}

// ===== POWER_MODIFY アクション抽出 =====

function extractPowerModifies(action: EffectAction): PowerModifyAction[] {
  if (action.type === 'POWER_MODIFY') return [action];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifies(s));
  }
  if (action.type === 'CONDITIONAL') {
    return [...extractPowerModifies(action.then), ...(action.else ? extractPowerModifies(action.else) : [])];
  }
  return [];
}

function extractPowerModifiesPerStack(action: EffectAction): PowerModifyPerStackAction[] {
  if (action.type === 'POWER_MODIFY_PER_STACK') return [action as PowerModifyPerStackAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerStack(s));
  }
  return [];
}

function extractPowerModifiesPerLevelSum(action: EffectAction): PowerModifyPerLevelSumAction[] {
  if (action.type === 'POWER_MODIFY_PER_LEVEL_SUM') return [action as PowerModifyPerLevelSumAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerLevelSum(s));
  }
  return [];
}

function extractCostIncreases(action: EffectAction): CostIncreaseAction[] {
  if (action.type === 'COST_INCREASE') return [action as CostIncreaseAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractCostIncreases(s));
  }
  return [];
}

// ===== フィールドシグニの有効パワー計算 =====

/**
 * フィールド上のシグニ全体の有効パワーを計算する。
 * @param myState  - ローカルプレイヤーの状態
 * @param opState  - 相手プレイヤーの状態
 * @param isMyTurn - ローカルプレイヤーのターンかどうか
 * @param effectsMap - CardNum → CardEffect[] のマップ
 * @param cardMap    - CardNum → CardData のマップ
 * @returns CardNum → 有効パワー（数値）のマップ。フィールドにいないカードは含まれない
 */
export function calcFieldPowers(
  myState: PlayerState,
  opState: PlayerState,
  isMyTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, number> {
  // ベースパワーを収集（フィールドの最前面シグニ）
  const powers = new Map<string, number>();

  const collectBase = (state: PlayerState) => {
    for (const stack of state.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      const card = cardMap.get(topNum);
      const base = parseInt(card?.Power ?? '', 10);
      if (!isNaN(base)) powers.set(topNum, base);
    }
  };
  collectBase(myState);
  collectBase(opState);

  // フィールド上のすべてのカードの CONTINUOUS POWER_MODIFY を適用
  const applyEffects = (ownerState: PlayerState, otherState: PlayerState, isOwnerTurn: boolean) => {
    // 効果を持ちうるフィールド上カードを列挙
    const candidates: string[] = [];
    // シグニ（各ゾーン最前面）
    for (const stack of ownerState.field.signi) {
      if (stack && stack.length > 0) candidates.push(stack[stack.length - 1]);
    }
    // センタールリグ（最前面）
    if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig[ownerState.field.lrig.length - 1]);
    // アシストルリグ（左右それぞれ最前面）
    const al = ownerState.field.assist_lrig_l ?? [];
    if (al.length > 0) candidates.push(al[al.length - 1]);
    const ar = ownerState.field.assist_lrig_r ?? [];
    if (ar.length > 0) candidates.push(ar[ar.length - 1]);
    // キーピース
    if (ownerState.field.key_piece) candidates.push(ownerState.field.key_piece);

    // 同一CardNumが複数ゾーンに存在する場合、効果元として重複処理しない
    const seenSources = new Set<string>();
    for (const topNum of candidates) {
      if (seenSources.has(topNum)) continue;
      seenSources.add(topNum);
      const effects = effectsMap.get(topNum);
      if (!effects) continue;

      for (const effect of effects) {
        if (effect.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, cardMap)) continue;

        const mods = extractPowerModifies(effect.action);
        for (const mod of mods) {
          const delta = typeof mod.delta === 'number' ? mod.delta : 0;
          const target = mod.target;
          const isSelfOnly = target.count !== 'ALL';

          // count !== 'ALL' はCONTINUOUSにおける「このシグニ」= 効果元カードのみ対象
          if (isSelfOnly) {
            const card = cardMap.get(topNum);
            if ((target.owner === 'self' || target.owner === 'any') &&
                matchesFilter(card, target.filter) &&
                powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
            }
            continue;
          }

          // count === 'ALL': 対象オーナーのシグニ全体に適用
          const targetIsOwner = target.owner === 'self' || target.owner === 'any';
          const targetIsOther  = target.owner === 'opponent' || target.owner === 'any';

          if (targetIsOwner) {
            applyDeltaToState(ownerState, delta, target.filter, cardMap, powers);
          }
          if (targetIsOther) {
            applyDeltaToState(otherState, delta, target.filter, cardMap, powers);
          }
        }

        // POWER_MODIFY_PER_STACK: このカードのスタック枚数に比例したパワー増減
        const perStackMods = extractPowerModifiesPerStack(effect.action);
        for (const mod of perStackMods) {
          // topNum のスタック（スタック最上面を除く下のカード数）を取得
          const stack = ownerState.field.signi.find(s => s?.at(-1) === topNum);
          const stackBelow = stack ? stack.length - 1 : 0;
          if (stackBelow <= 0) continue;
          const stackDelta = mod.deltaPerCard * stackBelow;
          applyDeltaToState(ownerState, stackDelta, mod.target.filter, cardMap, powers);
        }
      }
    }
  };

  applyEffects(myState, opState, isMyTurn);
  applyEffects(opState, myState, !isMyTurn);

  // temp_power_mods（起動・自動効果によるターン内一時パワー修正）を適用
  const applyTempMods = (state: PlayerState) => {
    for (const mod of state.temp_power_mods ?? []) {
      if (powers.has(mod.cardNum)) {
        powers.set(mod.cardNum, (powers.get(mod.cardNum) ?? 0) + mod.delta);
      }
    }
  };
  applyTempMods(myState);
  applyTempMods(opState);

  return powers;
}

function applyDeltaToState(
  state: PlayerState,
  delta: number,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  powers: Map<string, number>,
) {
  // 同一CardNumが複数ゾーンにある場合、同じpowersエントリに重複適用しない
  const seen = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    if (seen.has(topNum)) continue;
    seen.add(topNum);
    if (!powers.has(topNum)) continue;
    const card = cardMap.get(topNum);
    if (!matchesFilter(card, filter)) continue;
    powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
  }
}

// ===== アクティブなコスト修正を計算 =====

export interface ActiveCostMod {
  direction: 'increase' | 'decrease';
  targetCardType: string;
  amount: EnergyCost[];
}

/**
 * フィールドの CONTINUOUS CostIncrease/CostReduction 効果を収集する。
 * - self側の修正 = 自分のフィールドカードによるもの（自分のコストへ影響する場合と相手へ影響する場合）
 * - BattleScreen でスペル/アーツ使用コスト計算時に呼び出す
 */
export function calcActiveCostMods(
  myState: PlayerState,
  opState: PlayerState,
  isMyTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  _cardMap: Map<string, CardData>,
): { forMy: ActiveCostMod[]; forOp: ActiveCostMod[] } {
  const forMy: ActiveCostMod[] = [];
  const forOp: ActiveCostMod[] = [];

  const scanOwner = (ownerState: PlayerState, otherState: PlayerState, isOwnerTurn: boolean) => {
    const candidates: string[] = [];
    for (const stack of ownerState.field.signi) {
      if (stack && stack.length > 0) candidates.push(stack[stack.length - 1]);
    }
    if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig[ownerState.field.lrig.length - 1]);

    for (const topNum of candidates) {
      const effects = effectsMap.get(topNum);
      if (!effects) continue;
      for (const effect of effects) {
        if (effect.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, _cardMap)) continue;
        // CostIncrease: targetOwner が 'opponent' なら相手のコストを増やす
        const increases = extractCostIncreases(effect.action);
        for (const inc of increases) {
          const target = inc.targetOwner === 'opponent' ? forOp : forMy;
          target.push({ direction: 'increase', targetCardType: inc.targetCardType, amount: inc.amount });
        }
      }
    }
  };

  const myIsOwner = true;
  scanOwner(myState, opState, isMyTurn && myIsOwner);
  scanOwner(opState, myState, !isMyTurn);

  return { forMy, forOp };
}

export function getEffectivePower(
  cardNum: string,
  powers: Map<string, number>,
  cardMap: Map<string, CardData>,
): number {
  if (powers.has(cardNum)) return powers.get(cardNum)!;
  const card = cardMap.get(cardNum);
  return parseInt(card?.Power ?? '', 10) || 0;
}

// ===== CONTINUOUS BLOCK_ACTION 計算 =====

export interface ContinuousBlockResult {
  forSelf: Set<string>;           // ownerState に対してブロックされるアクションID
  forOther: Set<string>;          // otherState に対してブロックされるアクションID
  cannotAttackSigni: Set<string>; // ownerState のフィールド上で攻撃不可のCardNum
}

function extractBlockActions(action: EffectAction): BlockActionAction[] {
  if (action.type === 'BLOCK_ACTION') return [action as BlockActionAction];
  if (action.type === 'SEQUENCE') {
    return (action as import('../types/effects').SequenceAction).steps.flatMap(s => extractBlockActions(s));
  }
  return [];
}

/**
 * フィールド上の CONTINUOUS BLOCK_ACTION 効果を収集する。
 * ownerState 視点：forSelf = 自分がブロックされるアクション、forOther = 相手がブロックされるアクション。
 */
export function calcContinuousBlockedActions(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): ContinuousBlockResult {
  const forSelf = new Set<string>();
  const forOther = new Set<string>();
  const cannotAttackSigni = new Set<string>();

  function scanField(fieldOwner: PlayerState, fieldOther: PlayerState, isFieldOwnerTurn: boolean, isMe: boolean) {
    for (const stack of fieldOwner.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      const effects = effectsMap.get(topNum) ?? [];
      for (const effect of effects) {
        if (effect.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(effect.activeCondition, fieldOwner, fieldOther, isFieldOwnerTurn, cardMap)) continue;
        for (const b of extractBlockActions(effect.action)) {
          if (b.actionId === 'ATTACK_SIGNI_SELF' && isMe) {
            cannotAttackSigni.add(topNum);
          } else if (b.target.owner === 'opponent') {
            // この効果が ME のフィールドカードなら相手(forOther)を、相手フィールドなら自分(forSelf)をブロック
            if (isMe) forOther.add(b.actionId);
            else forSelf.add(b.actionId);
          }
        }
      }
    }
  }

  scanField(ownerState, otherState, isOwnerTurn, true);
  scanField(otherState, ownerState, !isOwnerTurn, false);

  return { forSelf, forOther, cannotAttackSigni };
}
