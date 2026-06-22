import type { PlayerState, CardData } from '../types';
import type {
  CardEffect,
  ActiveCondition,
  EffectAction,
  PowerModifyAction,
  PowerModifyPerStackAction,
  PowerModifyPerLevelSumAction,
  PowerModifyPerLrigLevelAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyPerVirusCountAction,
  PowerModifyPerCharmAction,
  PowerSetAction,
  CostIncreaseAction,
  CostReductionAction,
  BlockActionAction,
  TargetFilter,
  EnergyCost,
  GrantLrigAbilityAction,
  GrantSigniAboveAbilityAction,
  ConditionalAction,
  Condition,
  GrantProtectionAction,
  BanishAction,
  FreezeAction,
  DownAction,
  PowerFlipAction,
} from '../types/effects';

// ===== activeCondition 判定 =====

export function checkActiveCondition(
  cond: ActiveCondition | undefined,
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
  sourceCardNum?: string,
  effectivePowers?: Map<string, number>,
  oppTrashColorLoss?: boolean,
): boolean {
  if (!cond) return true;
  switch (cond.type) {
    case 'TURN_OWNER':
      return cond.owner === 'self' ? isOwnerTurn : !isOwnerTurn;

    case 'HAS_CARD_IN_FIELD': {
      const state = cond.owner === 'self' ? ownerState : otherState;
      const fieldNums = state.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
      const targets = (cond.excludeSelf && sourceCardNum)
        ? fieldNums.filter(n => n !== sourceCardNum)
        : fieldNums;
      const matched = targets.filter(num => matchesFilter(cardMap.get(num), cond.filter)).length;
      return matched >= (cond.minCount ?? 1);
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

    case 'FIELD_SIGNI_POWER_COUNT': {
      // 場のシグニのうち実効パワーが minPower 以上のものの数を operator/value で判定
      const state = cond.owner === 'self' ? ownerState : otherState;
      const cnt = state.field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        const pw = effectivePowers?.get(top) ?? parseInt(cardMap.get(top)?.Power ?? '0', 10);
        return pw >= cond.minPower ? n + 1 : n;
      }, 0);
      switch (cond.operator) {
        case 'gte': return cnt >= cond.value;
        case 'lte': return cnt <= cond.value;
        case 'gt':  return cnt >  cond.value;
        case 'lt':  return cnt <  cond.value;
        case 'eq':  return cnt === cond.value;
        case 'neq': return cnt !== cond.value;
      }
      return false;
    }

    case 'SELF_POWER_THRESHOLD': {
      // effectivePowers がある場合はそちらを参照、なければカードの基本パワーを使用
      const selfPower = sourceCardNum
        ? (effectivePowers?.get(sourceCardNum) ?? parseInt(cardMap.get(sourceCardNum)?.Power ?? '0'))
        : 0;
      switch (cond.operator) {
        case 'gte': return selfPower >= cond.value;
        case 'lte': return selfPower <= cond.value;
        case 'gt':  return selfPower >  cond.value;
        case 'lt':  return selfPower <  cond.value;
        case 'eq':  return selfPower === cond.value;
        case 'neq': return selfPower !== cond.value;
      }
      return true;
    }

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

    case 'ENA_DIFF': {
      const enaDiff = ownerState.energy.length - otherState.energy.length;
      switch (cond.operator) {
        case 'gte': return enaDiff >= cond.value;
        case 'lte': return enaDiff <= cond.value;
        case 'gt':  return enaDiff >  cond.value;
        case 'lt':  return enaDiff <  cond.value;
        case 'eq':  return enaDiff === cond.value;
        case 'neq': return enaDiff !== cond.value;
      }
      break;
    }

    case 'LRIG_LEVEL': {
      const lrigState = cond.owner === 'self' ? ownerState : otherState;
      const lrig = lrigState.field.lrig;
      const top = lrig[lrig.length - 1];
      if (!top) return false;
      const lv = parseInt(cardMap.get(top)?.Level ?? '-1', 10);
      switch (cond.operator) {
        case 'gte': return lv >= cond.value;
        case 'lte': return lv <= cond.value;
        case 'gt':  return lv >  cond.value;
        case 'lt':  return lv <  cond.value;
        case 'eq':  return lv === cond.value;
        case 'neq': return lv !== cond.value;
      }
      break;
    }

    case 'EICHI_LEVEL_SUM': {
      // 英知=N: 自分のフィールドの＜英知＞シグニのレベル合計
      const eichiLevelOverrides = ownerState.attack_phase_level_overrides ?? {};
      const eichiSum = ownerState.field.signi.reduce((sum, stack) => {
        const top = stack?.at(-1);
        if (!top) return sum;
        const card = cardMap.get(top);
        if (!card?.CardClass?.includes('英知')) return sum;
        const level = eichiLevelOverrides[top] ?? (parseInt(card.Level ?? '0') || 0);
        return sum + level;
      }, 0);
      switch (cond.operator) {
        case 'gte': return eichiSum >= cond.value;
        case 'lte': return eichiSum <= cond.value;
        case 'gt':  return eichiSum >  cond.value;
        case 'lt':  return eichiSum <  cond.value;
        case 'eq':  return eichiSum === cond.value;
        case 'neq': return eichiSum !== cond.value;
      }
      return false;
    }

    case 'IS_SELF_ARMORED': {
      if (!sourceCardNum) return false;
      const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      if (zoneIdx < 0) return false;
      return ownerState.field.signi_armor?.[zoneIdx] ?? false;
    }

    case 'IS_SELF_ACCED': {
      // このシグニにアクセが付いているかぎり（フィールドのシグニに signi_acce が設定されている）
      if (!sourceCardNum) return false;
      const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      if (zoneIdx < 0) return false;
      return (ownerState.field.signi_acce?.[zoneIdx] ?? null) !== null;
    }

    case 'IS_SELF_ACCE_CARD': {
      // このカードがアクセスロットに装着されているかぎり
      if (!sourceCardNum) return false;
      return (ownerState.field.signi_acce ?? []).includes(sourceCardNum);
    }

    case 'IS_DRIVE_STATE':
      // このシグニがドライブ状態（LRIGが乗っている）であるかぎり
      if (!sourceCardNum) return false;
      return ownerState.lrig_riding_signi?.includes(sourceCardNum) ?? false;

    case 'IS_SELF_AWAKENED':
      // このシグニが覚醒状態であるかぎり
      if (!sourceCardNum) return false;
      return ownerState.awakened_signi?.includes(sourceCardNum) ?? false;

    case 'IS_SELF_IN_CENTER_ZONE':
      // このシグニが中央のシグニゾーン（index 1）にあるかぎり
      if (!sourceCardNum) return false;
      return ownerState.field.signi[1]?.includes(sourceCardNum) ?? false;

    case 'TURN_HAND_DISCARD_GTE':
      // このターンにあなたが手札をN枚以上捨てている場合
      return (ownerState.turn_hand_discarded_count ?? 0) >= cond.value;

    case 'THIS_CARD_HAS_UNDER': {
      // このシグニの下にカードがあるかぎり
      if (!sourceCardNum) return false;
      const stack = ownerState.field.signi.find(s => s?.at(-1) === sourceCardNum);
      return !!stack && stack.length > 1;
    }

    case 'HAS_BOND': {
      const name = cond.cardName ?? (sourceCardNum ? cardMap.get(sourceCardNum)?.CardName : undefined);
      if (!name) return false;
      return ownerState.bonds?.includes(name) ?? false;
    }

    case 'SUBSCRIBER_COUNT': {
      const cnt = ownerState.subscriber_count ?? 0;
      switch (cond.operator) {
        case 'gte': return cnt >= cond.value;
        case 'lte': return cnt <= cond.value;
        case 'eq':  return cnt === cond.value;
        case 'gt':  return cnt > cond.value;
        case 'lt':  return cnt < cond.value;
        default:    return false;
      }
    }

    case 'VIRUS_COUNT': {
      const state = cond.owner === 'self' ? ownerState : otherState;
      const virusCnt = (state.field.signi_virus ?? []).reduce((s, v) => s + v, 0);
      switch (cond.operator) {
        case 'gte': return virusCnt >= cond.value;
        case 'lte': return virusCnt <= cond.value;
        case 'eq':  return virusCnt === cond.value;
        case 'neq': return virusCnt !== cond.value;
        case 'gt':  return virusCnt > cond.value;
        case 'lt':  return virusCnt < cond.value;
        default:    return false;
      }
    }

    case 'LRIG_COLOR': {
      const lrigState = cond.owner === 'self' ? ownerState : otherState;
      const top = lrigState.field.lrig.at(-1);
      if (!top) return false;
      return cardMap.get(top)?.Color?.includes(cond.color) ?? false;
    }

    case 'SAME_ZONE_HAS_GATE': {
      // このシグニ（sourceCardNum）と同じシグニゾーンに THE DOOR【ゲート】があるかぎり
      if (!sourceCardNum) return false;
      const zi = ownerState.field.signi.findIndex(z => z?.at(-1) === sourceCardNum);
      if (zi < 0) return false;
      return (ownerState.own_gate_zones ?? []).includes(zi);
    }

    case 'FIELD_HAS_GATE': {
      const gateState = cond.owner === 'self' ? ownerState : otherState;
      return (gateState.own_gate_zones ?? []).length > 0;
    }

    case 'AND':
      return cond.conditions.every(c => checkActiveCondition(c, ownerState, otherState, isOwnerTurn, cardMap, sourceCardNum, effectivePowers, oppTrashColorLoss));
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
    case 'lrig_deck': return (state.lrig_deck ?? []).length;
    case 'lrig_trash': return (state.lrig_trash ?? []).length;
    default:         return 0;
  }
}

// ===== フィルタ判定 =====

function matchesFilter(cardData: CardData | undefined, filter: TargetFilter | undefined): boolean {
  if (!filter || !cardData) return true;
  if (filter.cardName && !cardData.CardName?.includes(filter.cardName)) return false;
  if (filter.cardNames && !filter.cardNames.includes(cardData.CardName ?? '')) return false;
  if (filter.cardNum  && cardData.CardNum  !== filter.cardNum)  return false;
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
    // Power「∞」はInfinity扱い（parseIntだとNaNになり「パワーX以下」フィルタを誤って通過してしまう）
    const pw = cardData.Power === '∞' ? Infinity : parseInt(cardData.Power ?? '', 10);
    if (isNaN(pw)) return false; // Power「-」等の非数値はパワー条件を満たさない
    if (filter.powerRange.min !== undefined && pw < filter.powerRange.min) return false;
    if (filter.powerRange.max !== undefined && pw > filter.powerRange.max) return false;
  }
  if (filter.levelRange) {
    const lv = parseInt(cardData.Level ?? '', 10);
    if (filter.levelRange.min !== undefined && lv < filter.levelRange.min) return false;
    if (filter.levelRange.max !== undefined && lv > filter.levelRange.max) return false;
  }
  if (filter.hasGuard !== undefined) {
    // Guard列は '1'/'0' 形式（空文字判定だと全カードがガード持ち扱いになる）
    const hasGuard = cardData.Guard === '1';
    if (filter.hasGuard !== hasGuard) return false;
  }
  if (filter.story) {
    const stories = Array.isArray(filter.story) ? filter.story : [filter.story];
    if (!stories.some(s => cardData.CardClass?.includes(s))) return false;
  }
  // cardClass / cardClassExclude（execUtils 版 matchesFilter と挙動を揃える。CONTINUOUS power 計算等で使用）
  if (filter.cardClass) {
    const classes = Array.isArray(filter.cardClass) ? filter.cardClass : [filter.cardClass];
    if (!classes.some(c => cardData.CardClass?.includes(c))) return false;
  }
  if (filter.cardClassExclude) {
    const exClasses = Array.isArray(filter.cardClassExclude) ? filter.cardClassExclude : [filter.cardClassExclude];
    if (exClasses.some(c => cardData.CardClass?.includes(c))) return false;
  }
  if (filter.excludeCardName && cardData.CardName === filter.excludeCardName) return false;
  if (filter.levelParity !== undefined) {
    const lv = parseInt(cardData.Level ?? '', 10);
    if (filter.levelParity === 'even' && lv % 2 !== 0) return false;
    if (filter.levelParity === 'odd'  && lv % 2 !== 1) return false;
  }
  return true;
}

// ===== ゾーン状態フィルタ判定（zoneIdx ベース） =====

export function matchesStateFilter(state: PlayerState, zoneIdx: number, filter: TargetFilter | undefined): boolean {
  if (!filter) return true;
  if (filter.isArmored !== undefined) {
    const v = state.field.signi_armor?.[zoneIdx] ?? false;
    if (filter.isArmored !== v) return false;
  }
  if (filter.hasCharm !== undefined) {
    const v = (state.field.signi_charms?.[zoneIdx] ?? null) !== null;
    if (filter.hasCharm !== v) return false;
  }
  if (filter.hasAcce !== undefined) {
    const v = (state.field.signi_acce?.[zoneIdx] ?? null) !== null;
    if (filter.hasAcce !== v) return false;
  }
  if (filter.infected !== undefined) {
    const v = (state.field.signi_virus?.[zoneIdx] ?? 0) > 0;
    if (filter.infected !== v) return false;
  }
  if (filter.isDown !== undefined) {
    const v = state.field.signi_down?.[zoneIdx] ?? false;
    if (filter.isDown !== v) return false;
  }
  if (filter.isFrozen !== undefined) {
    const v = state.field.signi_frozen?.[zoneIdx] ?? false;
    if (filter.isFrozen !== v) return false;
  }
  if (filter.isUp !== undefined) {
    const v = !(state.field.signi_down?.[zoneIdx] ?? false);
    if (filter.isUp !== v) return false;
  }
  if (filter.inGateZone !== undefined) {
    const v = (state.own_gate_zones ?? []).includes(zoneIdx);
    if (filter.inGateZone !== v) return false;
  }
  if (filter.centerZoneOnly !== undefined) {
    if (filter.centerZoneOnly !== (zoneIdx === 1)) return false;
  }
  return true;
}

// ===== CONTINUOUS BANISH / FREEZE / DOWN 状態変更計算 =====

export interface ContSigniMutation {
  effectId: string;
  type: 'BANISH' | 'FREEZE' | 'DOWN';
  targetIsHost: boolean;
  targetNums: string[];
}

/**
 * フィールド上の CONTINUOUS BANISH/FREEZE/DOWN 効果（mandatory のみ）を評価し、
 * 適用すべきシグニ変更のリストを返す。
 * BattleScreen が useEffect 内で呼び出し、返値をゲーム状態に反映する。
 */
export function calcContinuousSigniMutations(
  hostState: PlayerState,
  guestState: PlayerState,
  hostIsActive: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): ContSigniMutation[] {
  const result: ContSigniMutation[] = [];

  const scanOwner = (
    ownerState: PlayerState,
    otherState: PlayerState,
    isOwnerTurn: boolean,
    ownerIsHost: boolean,
  ) => {
    if (ownerState.all_cont_effects_negated) return;
    for (const sourceStack of ownerState.field.signi) {
      if (!sourceStack?.length) continue;
      const sourceNum = sourceStack[sourceStack.length - 1];
      for (const eff of (effectsMap.get(sourceNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (!eff.mandatory) continue;
        if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, sourceNum)) continue;
        const act = eff.action as BanishAction | FreezeAction | DownAction;
        if (act.type !== 'BANISH' && act.type !== 'FREEZE' && act.type !== 'DOWN') continue;
        // 身代わりバニッシュ等の任意（してもよい）効果は自動適用しない（WX20-055/WX25-P1-056等）
        if ((act as BanishAction).optional) continue;
        const target = act.target;
        if (target.type !== 'SIGNI') continue;
        const tgtState = target.owner === 'opponent' ? otherState : ownerState;
        const targetIsHost = target.owner === 'opponent' ? !ownerIsHost : ownerIsHost;
        const candidates: string[] = [];
        for (let zi = 0; zi < tgtState.field.signi.length; zi++) {
          const stack = tgtState.field.signi[zi];
          if (!stack?.length) continue;
          const num = stack[stack.length - 1];
          if (!matchesFilter(cardMap.get(num), target.filter)) continue;
          if (!matchesStateFilter(tgtState, zi, target.filter)) continue;
          if (act.type === 'FREEZE' && (tgtState.field.signi_frozen?.[zi] ?? false)) continue;
          if (act.type === 'DOWN'   && (tgtState.field.signi_down?.[zi] ?? false)) continue;
          candidates.push(num);
        }
        if (candidates.length === 0) continue;
        const targetNums = target.count === 'ALL' ? candidates : candidates.slice(0, 1);
        result.push({ effectId: eff.effectId, type: act.type, targetIsHost, targetNums });
      }
    }
  };

  scanOwner(hostState, guestState, hostIsActive, true);
  scanOwner(guestState, hostState, !hostIsActive, false);
  return result;
}

// ===== POWER_MODIFY アクション抽出 =====

function extractPowerModifies(action: EffectAction): PowerModifyAction[] {
  if (action.type === 'POWER_MODIFY') return [action];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifies(s));
  }
  // CONDITIONAL は evalConditionForContinuous で別途条件評価するため再帰しない
  return [];
}

// CONTINUOUS効果向け条件評価（ExecCtx 不要、PlayerState + cardMap のみ使用）
function evalConditionForContinuous(
  cond: Condition,
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum?: string,
  oppTrashColorLoss?: boolean,
): boolean {
  function st(owner: 'self' | 'opponent' | 'any') { return owner === 'opponent' ? otherState : ownerState; }
  function cmp(a: number, op: string, b: number) {
    switch (op) {
      case 'gte': return a >= b; case 'lte': return a <= b;
      case 'gt':  return a > b;  case 'lt':  return a < b;
      case 'eq':  return a === b; case 'neq': return a !== b;
      default: return true;
    }
  }
  switch (cond.type) {
    case 'FIELD_COUNT': {
      const count = st(cond.owner).field.signi.filter(s => s && s.length > 0).length;
      return cmp(count, cond.operator, typeof cond.value === 'number' ? cond.value : 0);
    }
    case 'HAND_COUNT': {
      const count = st(cond.owner).hand.length;
      return cmp(count, cond.operator, typeof cond.value === 'number' ? cond.value : 0);
    }
    case 'LIFE_COUNT': {
      const count = st(cond.owner).life_cloth.length;
      return cmp(count, cond.operator, typeof cond.value === 'number' ? cond.value : 0);
    }
    case 'ENERGY_COUNT': {
      const count = st(cond.owner).energy.length;
      return cmp(count, cond.operator, typeof cond.value === 'number' ? cond.value : 0);
    }
    case 'ENERGY_HAS_COLOR': {
      const ez = st(cond.owner).energy;
      return cond.colors.every(color => ez.some(n => cardMap.get(n)?.Color?.includes(color)));
    }
    case 'HAS_CARD_IN_FIELD': {
      return st(cond.owner).field.signi.some(stack => {
        if (!stack?.length) return false;
        const top = stack[stack.length - 1];
        if (cond.excludeSelf && sourceCardNum && top === sourceCardNum) return false;
        return matchesFilter(cardMap.get(top), cond.filter);
      });
    }
    case 'TRASH_HAS_CARD': {
      const stripCC = oppTrashColorLoss && cond.owner === 'self';
      return st(cond.owner).trash.some(n => {
        const c = cardMap.get(n);
        if (!c) return false;
        return matchesFilter(stripCC ? { ...c, Color: '', CardClass: '' } : c, cond.filter);
      });
    }
    case 'LRIG_LEVEL': {
      const lrig = st(cond.owner).field.lrig;
      const top = lrig[lrig.length - 1];
      if (!top) return false;
      const lv = parseInt(cardMap.get(top)?.Level ?? '-1', 10);
      return cmp(lv, cond.operator, cond.value);
    }
    case 'LRIG_STORY': {
      const lrig = st(cond.owner).field.lrig;
      const top = lrig[lrig.length - 1];
      if (!top) return false;
      return cardMap.get(top)?.CardClass?.includes(cond.story) ?? false;
    }
    case 'HAS_BOND': {
      const name = cond.cardName ?? (sourceCardNum ? cardMap.get(sourceCardNum)?.CardName : undefined);
      if (!name) return false;
      return ownerState.bonds?.includes(name) ?? false;
    }
    case 'AND':
      return cond.conditions.every(c => evalConditionForContinuous(c, ownerState, otherState, cardMap, sourceCardNum, oppTrashColorLoss));
    default:
      return true;
  }
}

function extractPowerSets(action: EffectAction): PowerSetAction[] {
  if (action.type === 'POWER_SET') return [action as PowerSetAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerSets(s));
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

function extractPowerModifiesPerLrigLevel(action: EffectAction): PowerModifyPerLrigLevelAction[] {
  if (action.type === 'POWER_MODIFY_PER_LRIG_LEVEL') return [action as PowerModifyPerLrigLevelAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerLrigLevel(s));
  }
  return [];
}

function extractPowerModifiesPerTrashCount(action: EffectAction): PowerModifyPerTrashCountAction[] {
  if (action.type === 'POWER_MODIFY_PER_TRASH_COUNT') {
    const a = action as PowerModifyPerTrashCountAction;
    if (!a.until) return [a]; // until あり = ACTIVATED（executor処理）、なし = CONTINUOUS
  }
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerTrashCount(s));
  }
  return [];
}

function extractPowerModifiesPerLifeCount(action: EffectAction): PowerModifyPerLifeCountAction[] {
  if (action.type === 'POWER_MODIFY_PER_LIFE_COUNT') return [action as PowerModifyPerLifeCountAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerLifeCount(s));
  }
  return [];
}

function extractPowerModifiesPerVirusCount(action: EffectAction): PowerModifyPerVirusCountAction[] {
  if (action.type === 'POWER_MODIFY_PER_VIRUS_COUNT') return [action as PowerModifyPerVirusCountAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerVirusCount(s));
  }
  return [];
}

function extractPowerModifiesPerCharm(action: EffectAction): PowerModifyPerCharmAction[] {
  if (action.type === 'POWER_MODIFY_PER_CHARM') {
    const a = action as PowerModifyPerCharmAction;
    if (!a.until) return [a]; // until なし = CONTINUOUS（until あり = ACTIVATED は executor 処理）
  }
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerCharm(s));
  }
  return [];
}

/**
 * ACTIVATED 効果の POWER_MODIFY_PER_LRIG_LEVEL を解決して temp_power_mods 相当の delta を計算する。
 * @returns [cardNum, delta] ペア配列（BattleScreenで temp_power_mods に追加する）
 */
export function resolvePowerModifyPerLrigLevel(
  action: PowerModifyPerLrigLevelAction,
  _targetCardNum: string,
  ownerState: PlayerState,
  opState: PlayerState,
  cardMap: Map<string, CardData>,
): number {
  const lrigState = action.lrigOwner === 'self' ? ownerState : opState;
  const lrigNum = lrigState.field.lrig.at(-1);
  const lv = parseInt(cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
  return isNaN(lv) ? 0 : action.deltaPerLevel * lv;
}

function extractCostIncreases(action: EffectAction): CostIncreaseAction[] {
  if (action.type === 'COST_INCREASE') return [action as CostIncreaseAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractCostIncreases(s));
  }
  return [];
}

function extractCostReductions(action: EffectAction): CostReductionAction[] {
  if (action.type === 'COST_REDUCTION') return [action as CostReductionAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractCostReductions(s));
  }
  return [];
}

/** SEQUENCE ステップ内を再帰的に探索し BANISH_REDIRECT が含まれるか判定する。 */
export function hasBanishRedirectInAction(action: EffectAction): boolean {
  if (action.type === 'BANISH_REDIRECT') return true;
  if (action.type === 'SEQUENCE') return (action as import('../types/effects').SequenceAction).steps.some(s => hasBanishRedirectInAction(s));
  return false;
}

// ===== フィールドシグニの有効パワー計算 =====

/**
/**
 * LEVEL_MOD_PER_COUNT CONTINUOUS効果によるシグニのレベル修正マップを構築する。
 * ownerState のシグニが対象。otherState の盤面状況（チャーム数等）を参照する。
 */
function buildLevelMods(
  ownerState: PlayerState,
  otherState: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, number> {
  const levelMods = new Map<string, number>();
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  for (const stack of ownerState.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      const card = cardMap.get(topNum);
      const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
      const baseLv = parseInt(card?.Level ?? '', 10);
      if (isNaN(baseLv)) continue;
      if (act.id === 'LEVEL_MOD_PER_COUNT') {
        // "対戦相手の場にある【チャーム】N枚につきN減る"
        const m = txt.match(/対戦相手の場にある【チャーム】([０-９\d]*)枚?につき([０-９\d]+)減る/);
        if (m) {
          const divisor = parseInt(toHW(m[1] || '1')) || 1;
          const delta = parseInt(toHW(m[2])) || 1;
          const charmCount = (otherState.field.signi_charms ?? []).filter(c => c !== null).length;
          levelMods.set(topNum, Math.max(0, baseLv - Math.floor(charmCount / divisor) * delta));
        }
      } else if (act.id === 'DYNAMIC_LEVEL_BY_ENERGY') {
        // "エナゾーンにある(カード|シグニ|スペル)N枚につき＋M"（N枚=除数。省略時1）
        const m = txt.match(/エナゾーンにある(カード|シグニ|スペル)([０-９\d]*)枚?につき[＋+]([０-９\d]+)/);
        const typeStr = m?.[1] ?? 'カード';
        const divisor = m ? (parseInt(toHW(m[2] || '1')) || 1) : 1;
        const delta = m ? (parseInt(toHW(m[3])) || 1) : 1;
        const energyCount = ownerState.energy.filter(cn => {
          if (typeStr === 'カード') return true;
          return cardMap.get(cn)?.Type === typeStr;
        }).length;
        levelMods.set(topNum, baseLv + Math.floor(energyCount / divisor) * delta);
      }
    }
  }
  return levelMods;
}

/**
 * フィールド上シグニの実効レベルを計算して返す（LEVEL_MOD_PER_COUNT等を適用済み）。
 * BattleScreen でのレベル表示や条件チェックに使用する。
 */
export function calcSigniLevels(
  myState: PlayerState,
  opState: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, number> {
  const levels = new Map<string, number>();
  for (const state of [myState, opState]) {
    for (const stack of state.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      const baseLv = parseInt(cardMap.get(topNum)?.Level ?? '', 10);
      if (!isNaN(baseLv)) levels.set(topNum, baseLv);
    }
  }
  const modsMe = buildLevelMods(myState, opState, effectsMap, cardMap);
  const modsOp = buildLevelMods(opState, myState, effectsMap, cardMap);
  for (const [k, v] of modsMe) levels.set(k, v);
  for (const [k, v] of modsOp) levels.set(k, v);
  return levels;
}

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

  // LEVEL_MOD_PER_COUNT 実効レベルマップ（POWER_MODIFY_PER_LEVEL_SUM等で使用）
  const levelMods = new Map<string, number>();
  for (const [k, v] of buildLevelMods(myState, opState, effectsMap, cardMap)) levelMods.set(k, v);
  for (const [k, v] of buildLevelMods(opState, myState, effectsMap, cardMap)) levelMods.set(k, v);

  const collectBase = (state: PlayerState) => {
    const identityOverrides = state.card_identity_overrides ?? {};
    for (const stack of state.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      // COPY_SIGNI: card_identity_overrides でコピー元カードのパワーを使用
      const resolvedNum = identityOverrides[topNum] ?? topNum;
      const card = cardMap.get(resolvedNum);
      // Power「∞」はInfinityとして集計（パワー0バニッシュ判定やpowerRangeフィルタが自然に成立する）
      const base = card?.Power === '∞' ? Infinity : parseInt(card?.Power ?? '', 10);
      if (!isNaN(base)) powers.set(topNum, base);
    }
  };
  collectBase(myState);
  collectBase(opState);

  // フィールド上のすべてのカードの CONTINUOUS POWER_MODIFY を適用
  const applyEffects = (ownerState: PlayerState, otherState: PlayerState, isOwnerTurn: boolean) => {
    // NEGATE_ALL_OPP_EFFECTS: all_cont_effects_negated フラグがあれば全CONT効果をスキップ
    if (ownerState.all_cont_effects_negated) return;
    // OPP_TRASH_LOSE_COLOR_AND_CLASS: 相手が自ターン中にこの効果を持つ場合、ownerState のトラッシュが色/クラスを失う
    const oppTrashColorLoss = collectOppTrashLoseColorClass(otherState, ownerState, effectsMap, cardMap, !isOwnerTurn);

    // PREVENT_POWER_MINUS_BY_OPP / PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 相手効果による負のパワー修正を無効化するシグニ
    const otherPowerProtected = new Set<string>();
    let allOtherSigniProtected = false;
    for (const stack of otherState.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap, topNum)) continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type === 'STUB' && act.id === 'PREVENT_POWER_MINUS_BY_OPP') otherPowerProtected.add(topNum);
        if (act.type === 'STUB' && act.id === 'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP') allOtherSigniProtected = true;
      }
    }
    // PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: フィールド全シグニをprotectedセットに追加
    if (allOtherSigniProtected) {
      for (const stack of otherState.field.signi) {
        const top = stack?.at(-1); if (top) otherPowerProtected.add(top);
      }
    }

    // PREVENT_OPP_POWER_PLUS: 相手（ownerState）のCONT効果による正パワー修正を、otherState側がブロック
    // otherStateのシグニがPREVENT_OPP_POWER_PLUSを持つ場合、ownerState由来の正デルタをブロック
    let blockOwnerPosDelta = false;
    for (const stack of otherState.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      for (const eff of (effectsMap.get(top) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap, top)) continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type === 'STUB' && act.id === 'PREVENT_OPP_POWER_PLUS') { blockOwnerPosDelta = true; break; }
      }
      if (blockOwnerPosDelta) break;
    }

    // POWER_FLIP: otherState のシグニが POWER_FLIP CONT を持ち、ownerState（対戦相手）の自己バフを反転
    // 「対戦相手のシグニのパワーが対戦相手の効果によって＋される場合、代わりに－される」
    let flipOwnerPosDelta = false;
    for (const stack of otherState.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      for (const eff of (effectsMap.get(top) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap, top)) continue;
        if (eff.action.type !== 'POWER_FLIP') continue;
        const flipAct = eff.action as PowerFlipAction;
        if (flipAct.target.owner === 'opponent' || flipAct.target.owner === 'any') {
          flipOwnerPosDelta = true;
        }
      }
      if (flipOwnerPosDelta) break;
    }

    // DRIVE_SIGNI_POWER_DOUBLE_CRASH: ルリグがこのCONTを持つ場合、ドライブ状態シグニに+3000
    // ダブルクラッシュ付与はBattleScreen側で処理
    const lrigTop = ownerState.field.lrig.at(-1);
    if (lrigTop) {
      const hasDrivePowerBonus = (effectsMap.get(lrigTop) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, lrigTop) &&
        (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
        (eff.action as import('../types/effects').StubAction).id === 'DRIVE_SIGNI_POWER_DOUBLE_CRASH',
      );
      if (hasDrivePowerBonus) {
        const driveNums = ownerState.lrig_riding_signi ?? [];
        for (const driveNum of driveNums) {
          if (powers.has(driveNum)) {
            powers.set(driveNum, (powers.get(driveNum) ?? 0) + 3000);
          }
        }
      }
    }

    // SELF_BUFF_BY_UNDER_CARDS: 下にLv4シグニが3枚あれば+2000（WXK05-035 CONT）
    for (const stack of ownerState.field.signi) {
      const topNum = stack?.at(-1);
      if (!topNum || !stack || stack.length <= 1) continue;
      const hasSBUC = (effectsMap.get(topNum) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topNum) &&
        (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
        (eff.action as import('../types/effects').StubAction).id === 'SELF_BUFF_BY_UNDER_CARDS',
      );
      if (hasSBUC && powers.has(topNum)) {
        const underCards = stack.slice(0, -1);
        const lv4Count = underCards.filter(cn => {
          const level = parseInt(cardMap.get(cn)?.Level ?? '0', 10);
          return level === 4;
        }).length;
        if (lv4Count >= 3) powers.set(topNum, (powers.get(topNum) ?? 0) + 2000);
      }
    }

    // DOUBLE_POWER_MINUS: 自分のフィールドにこの効果があれば相手シグニへの負デルタを2倍にする
    // （WX04-038-E1 のスペル版はフィールドに残らないため double_power_minus_this_turn フラグでも判定）
    const hasDoublePowerMinus = ownerState.double_power_minus_this_turn === true || ownerState.field.signi.some(stack => {
      const top = stack?.at(-1);
      if (!top) return false;
      return (effectsMap.get(top) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, top) &&
        (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
        (eff.action as import('../types/effects').StubAction).id === 'DOUBLE_POWER_MINUS',
      );
    });

    // 効果を持ちうるフィールド上カードを列挙
    const candidates: string[] = [];
    // シグニ（各ゾーン最前面）
    for (const stack of ownerState.field.signi) {
      if (stack && stack.length > 0) candidates.push(stack[stack.length - 1]);
    }
    // センタールリグ（最前面）※lrig_abilities_disabledがある場合はCONT効果をスキップ
    if (ownerState.field.lrig.length > 0 && !ownerState.lrig_abilities_disabled) {
      candidates.push(ownerState.field.lrig[ownerState.field.lrig.length - 1]);
    }
    // アシストルリグ（左右それぞれ最前面）
    const al = ownerState.field.assist_lrig_l ?? [];
    if (al.length > 0) candidates.push(al[al.length - 1]);
    const ar = ownerState.field.assist_lrig_r ?? [];
    if (ar.length > 0) candidates.push(ar[ar.length - 1]);
    // キーピース
    if (ownerState.field.key_piece) candidates.push(ownerState.field.key_piece);

    // アクセカードのCONTINUOUS効果（パワー修正のみ）をホストシグニに適用
    // 例: 「これにアクセされているシグニはパワー+3000を得る」
    // キーワード付与（ランサー等）はBattleScreen側で collectAcceCardKeywords で処理
    for (let zi = 0; zi < 3; zi++) {
      const acceNum = (ownerState.field.signi_acce ?? [])[zi] ?? null;
      if (!acceNum) continue;
      const hostStack = ownerState.field.signi[zi];
      if (!hostStack || hostStack.length === 0) continue;
      const hostNum = hostStack[hostStack.length - 1];
      if (!powers.has(hostNum)) continue;
      for (const eff of (effectsMap.get(acceNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (eff.activeCondition && eff.activeCondition.type !== 'IS_SELF_ACCE_CARD') continue;
        const act = eff.action;
        if (act.type === 'POWER_MODIFY') {
          const pmAct = act as import('../types/effects').PowerModifyAction;
          if (typeof pmAct.delta === 'number') {
            powers.set(hostNum, (powers.get(hostNum) ?? 0) + pmAct.delta);
          }
        }
      }
    }

    // FROZEN_LOSES_ABILITIES: otherState の LRIG にこの CONT があれば ownerState の凍結シグニをスキップ
    const frozenLosesAbilities = otherState.field.lrig.some(lrigNum => {
      return (effectsMap.get(lrigNum) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
        (eff.action as import('../types/effects').StubAction).id === 'FROZEN_LOSES_ABILITIES' &&
        checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
      );
    });

    // 同一CardNumが複数ゾーンに存在する場合、効果元として重複処理しない
    const seenSources = new Set<string>();
    for (const topNum of candidates) {
      if (seenSources.has(topNum)) continue;
      seenSources.add(topNum);
      // FROZEN_LOSES_ABILITIES: 凍結中の自シグニのCONTINUOUS効果をスキップ
      if (frozenLosesAbilities) {
        const zi = ownerState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (zi >= 0 && (ownerState.field.signi_frozen?.[zi] ?? false)) continue;
      }
      const effects = effectsMap.get(topNum);
      if (!effects) continue;
      // DOUBLE_POWER_MINUS「あなたのシグニの効果で」: 発生元（topNum）がシグニ（レゾナ含む）のときのみ相手への負デルタを2倍化
      const srcTypeDbl = cardMap.get(topNum)?.Type ?? '';
      const srcIsSigniDbl = srcTypeDbl.includes('シグニ') || srcTypeDbl.includes('レゾナ');
      const dblOtherMult = (hasDoublePowerMinus && srcIsSigniDbl) ? 2 : 1;

      // クロス状態を一度だけ計算（crossOnly効果の判定用）
      let crossStatesCache: boolean[] | null = null;
      const getCrossStates = () => {
        if (!crossStatesCache) crossStatesCache = collectCrossStates(ownerState, cardMap);
        return crossStatesCache;
      };

      for (const effect of effects) {
        if (effect.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topNum, powers, oppTrashColorLoss)) continue;
        // クロスのみ有効な効果: このシグニのゾーンがクロス状態でなければスキップ
        if (effect.crossOnly) {
          const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === topNum || s?.includes(topNum));
          if (zoneIdx === -1 || !getCrossStates()[zoneIdx]) continue;
        }
        // 絆アイコン効果: このカード名との絆を獲得していなければスキップ
        if (effect.kizunaIcon) {
          const cardName = cardMap.get(topNum)?.CardName;
          if (!cardName || !(ownerState.bonds?.includes(cardName))) continue;
        }

        // POWER_SET: 基本パワーを指定値に変更（POWER_MODIFYより先に適用）
        const sets = extractPowerSets(effect.action);
        for (const s of sets) {
          const value = typeof s.value === 'number' ? s.value : 0;
          if (s.target.count !== 'ALL') {
            // count !== 'ALL' = このシグニのみ
            const card = cardMap.get(topNum);
            if ((s.target.owner === 'self' || s.target.owner === 'any') &&
                matchesFilter(card, s.target.filter) &&
                powers.has(topNum)) {
              powers.set(topNum, value);
            }
          } else {
            if (s.target.owner === 'self' || s.target.owner === 'any') {
              for (let zi = 0; zi < ownerState.field.signi.length; zi++) {
                const stack = ownerState.field.signi[zi];
                if (!stack || stack.length === 0) continue;
                const num = stack[stack.length - 1];
                if (!powers.has(num)) continue;
                if (!matchesFilter(cardMap.get(num), s.target.filter)) continue;
                if (!matchesStateFilter(ownerState, zi, s.target.filter)) continue;
                powers.set(num, value);
              }
            }
            if (s.target.owner === 'opponent' || s.target.owner === 'any') {
              for (let zi = 0; zi < otherState.field.signi.length; zi++) {
                const stack = otherState.field.signi[zi];
                if (!stack || stack.length === 0) continue;
                const num = stack[stack.length - 1];
                if (!powers.has(num)) continue;
                if (!matchesFilter(cardMap.get(num), s.target.filter)) continue;
                if (!matchesStateFilter(otherState, zi, s.target.filter)) continue;
                powers.set(num, value);
              }
            }
          }
        }

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
              // POWER_FLIP: ownerState の自己バフを反転（正デルタ → 負デルタ）
              const selfDelta = flipOwnerPosDelta && delta > 0 ? -delta : delta;
              powers.set(topNum, (powers.get(topNum) ?? 0) + selfDelta);
            }
            continue;
          }

          // count === 'ALL': 対象オーナーのシグニ全体に適用
          const targetIsOwner = target.owner === 'self' || target.owner === 'any';
          const targetIsOther  = target.owner === 'opponent' || target.owner === 'any';

          // PREVENT_OPP_POWER_PLUS: otherState（相手）のCONTによる正デルタをブロック
          const effectiveDelta = (blockOwnerPosDelta && delta > 0) ? 0 : delta;
          if (effectiveDelta === 0 && delta !== 0) { /* ブロックされた正デルタ */ }
          else {
            if (targetIsOwner) {
              // POWER_FLIP: ownerState の自己バフを反転（正デルタ → 負デルタ）
              const ownerDelta = flipOwnerPosDelta && effectiveDelta > 0 ? -effectiveDelta : effectiveDelta;
              applyDeltaToState(ownerState, ownerDelta, target.filter, cardMap, powers,
                undefined, undefined, mod.excludeSelf ? topNum : undefined);
            }
            if (targetIsOther) {
              applyDeltaToState(otherState, effectiveDelta, target.filter, cardMap, powers, otherPowerProtected, dblOtherMult);
            }
          }
        }

        // CONDITIONAL + POWER_MODIFY: 条件付きパワー修正（条件を評価して適用）
        if (effect.action.type === 'CONDITIONAL') {
          const condAct = effect.action as ConditionalAction;
          const condMet = evalConditionForContinuous(condAct.condition, ownerState, otherState, cardMap, topNum, oppTrashColorLoss);
          const branch = condMet ? condAct.then : condAct.else;
          if (branch) {
            for (const mod of extractPowerModifies(branch)) {
              const delta = typeof mod.delta === 'number' ? mod.delta : 0;
              if (delta === 0) continue;
              const target = mod.target;
              if (target.count !== 'ALL') {
                if ((target.owner === 'self' || target.owner === 'any') && powers.has(topNum)) {
                  powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
                }
              } else {
                if (target.owner === 'self' || target.owner === 'any')
                  applyDeltaToState(ownerState, delta, target.filter, cardMap, powers);
                if (target.owner === 'opponent' || target.owner === 'any')
                  applyDeltaToState(otherState, delta, target.filter, cardMap, powers, otherPowerProtected, dblOtherMult);
              }
            }
          }
        }

        // POWER_MODIFY_PER_STACK: このカードのスタック枚数に比例したパワー増減
        const perStackMods = extractPowerModifiesPerStack(effect.action);
        for (const mod of perStackMods) {
          const stack = ownerState.field.signi.find(s => s?.at(-1) === topNum);
          const stackBelow = stack ? stack.length - 1 : 0;
          if (stackBelow <= 0) continue;
          const stackDelta = mod.deltaPerCard * stackBelow;
          applyDeltaToState(ownerState, stackDelta, mod.target.filter, cardMap, powers);
        }

        // POWER_MODIFY_PER_LEVEL_SUM: 場の他シグニのレベル合計に比例したパワー増減
        const perLevelSumMods = extractPowerModifiesPerLevelSum(effect.action);
        for (const mod of perLevelSumMods) {
          const countState = mod.countOwner === 'self' ? ownerState : otherState;
          let levelSum = 0;
          for (const s of countState.field.signi) {
            if (!s || s.length === 0) continue;
            const sNum = s[s.length - 1];
            if (mod.excludeSelf && sNum === topNum) continue;
            const sCard = cardMap.get(sNum);
            if (!matchesFilter(sCard, mod.countFilter)) continue;
            // 実効レベルを使用（LEVEL_MOD_PER_COUNT適用済み）
            const lv = levelMods.has(sNum) ? levelMods.get(sNum)! : parseInt(sCard?.Level ?? '', 10);
            if (!isNaN(lv)) levelSum += lv;
          }
          const delta = mod.deltaPerLevel * levelSum;
          if (delta !== 0 && powers.has(topNum)) {
            powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
          }
        }

        // POWER_MODIFY_PER_LRIG_LEVEL: センタールリグのレベルに比例したパワー増減（常時）
        const perLrigLevelMods = extractPowerModifiesPerLrigLevel(effect.action);
        for (const mod of perLrigLevelMods) {
          const lrigState = mod.lrigOwner === 'self' ? ownerState : otherState;
          const lrigNum = lrigState.field.lrig.at(-1);
          const lv = parseInt(cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
          if (isNaN(lv) || lv === 0) continue;
          const delta = mod.deltaPerLevel * lv;
          if (mod.target.count === 'ALL') {
            const tgtState = mod.target.owner === 'self' ? ownerState
              : mod.target.owner === 'opponent' ? otherState : ownerState;
            const prot = tgtState === otherState ? otherPowerProtected : undefined;
            const mult = tgtState === otherState ? dblOtherMult : 1;
            applyDeltaToState(tgtState, delta, mod.target.filter, cardMap, powers, prot, mult);
          } else if (powers.has(topNum)) {
            powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
          }
        }

        // POWER_MODIFY_PER_TRASH_COUNT: トラッシュ枚数に比例したパワー増減（常時）
        const perTrashMods = extractPowerModifiesPerTrashCount(effect.action);
        for (const mod of perTrashMods) {
          const countTrash = (st: PlayerState, stripCC: boolean) => {
            const cards = st.trash;
            const getCard = (n: string) => {
              const c = cardMap.get(n);
              return (c && stripCC) ? { ...c, Color: '', CardClass: '' } : c;
            };
            if (mod.countByVariety) {
              // 「N種類につき」= カード名の異なる枚数（CardClassは空のカードがあり種類判定に使えない）
              const names = new Set(cards
                .filter(n => !mod.countFilter || matchesFilter(getCard(n), mod.countFilter))
                .map(n => getCard(n)?.CardName ?? n));
              return names.size;
            }
            return cards.filter(n => !mod.countFilter || matchesFilter(getCard(n), mod.countFilter)).length;
          };
          const count = mod.trashOwner === 'both'
            ? countTrash(ownerState, oppTrashColorLoss) + countTrash(otherState, false)
            : countTrash(
                mod.trashOwner === 'self' ? ownerState : otherState,
                mod.trashOwner === 'self' ? oppTrashColorLoss : false,
              );
          const delta = Math.floor(count / mod.unitSize) * mod.deltaPerUnit;
          if (delta !== 0 && powers.has(topNum)) {
            powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
          }
        }

        // POWER_MODIFY_PER_LIFE_COUNT: ライフクロス枚数に比例したパワー増減（常時）
        const perLifeMods = extractPowerModifiesPerLifeCount(effect.action);
        for (const mod of perLifeMods) {
          const lifeState = mod.lifeOwner === 'self' ? ownerState : otherState;
          const count = lifeState.life_cloth.length;
          const delta = mod.deltaPerLife * count;
          if (delta !== 0 && powers.has(topNum)) {
            powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
          }
        }

        // POWER_MODIFY_PER_VIRUS_COUNT: 場のウィルス数に比例したパワー増減（常時）
        const perVirusMods = extractPowerModifiesPerVirusCount(effect.action);
        for (const mod of perVirusMods) {
          const vState = mod.virusOwner === 'self' ? ownerState : otherState;
          const virusCount = (vState.field.signi_virus ?? []).reduce((s, v) => s + (v ?? 0), 0);
          const delta = mod.deltaPerVirus * virusCount;
          if (delta !== 0 && powers.has(topNum)) {
            powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
          }
        }

        // POWER_MODIFY_PER_CHARM: フィールドのチャーム枚数に比例したパワー増減（常時）
        const perCharmMods = extractPowerModifiesPerCharm(effect.action);
        for (const mod of perCharmMods) {
          const countCharms = (st: PlayerState) => (st.field.signi_charms ?? []).filter(c => c !== null).length;
          const charmCount = mod.sourceOwner === 'self' ? countCharms(ownerState)
            : mod.sourceOwner === 'opponent' ? countCharms(otherState)
            : countCharms(ownerState) + countCharms(otherState);
          const delta = mod.deltaPerCharm * charmCount;
          if (delta !== 0) {
            if (mod.target.count !== 'ALL') {
              if ((mod.target.owner === 'self' || mod.target.owner === 'any') && powers.has(topNum)) {
                powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
              }
            } else {
              const tgtIsOwner = mod.target.owner === 'self' || mod.target.owner === 'any';
              const tgtIsOther = mod.target.owner === 'opponent' || mod.target.owner === 'any';
              if (tgtIsOwner) applyDeltaToState(ownerState, delta, mod.target.filter, cardMap, powers);
              if (tgtIsOther) applyDeltaToState(otherState, delta, mod.target.filter, cardMap, powers, otherPowerProtected, dblOtherMult);
            }
          }
        }

        // STUBベースの CONT パワー修正
        if (effect.action.type === 'STUB') {
          const stub = effect.action as import('../types/effects').StubAction;
          const card = cardMap.get(topNum);
          const txt = card?.EffectText ?? '';
          const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
          const parseN = (s: string) => parseInt(toHW(s), 10);

          // POWER_BY_ACCE_COUNT: 場のアクセ枚数×値だけパワーアップ
          if (stub.id === 'POWER_BY_ACCE_COUNT') {
            const acceCount = (ownerState.field.signi_acce ?? []).filter(a => a !== null).length;
            const m = txt.match(/【アクセ】１枚につき[＋+]([０-９\d]+)/);
            if (m && acceCount > 0 && powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + acceCount * parseN(m[1]));
            }
          }

          // DYNAMIC_LEVEL_BY_ENERGY: 「パワーはこのシグニのレベル１につき＋N」= 実効レベル×N
          if (stub.id === 'DYNAMIC_LEVEL_BY_ENERGY') {
            const m = txt.match(/パワーは.*?レベル１につき[＋+]([０-９\d]+)/);
            if (m && powers.has(topNum)) {
              const effLv = levelMods.get(topNum) ?? (parseInt(card?.Level ?? '0', 10) || 0);
              powers.set(topNum, (powers.get(topNum) ?? 0) + effLv * parseN(m[1]));
            }
          }

          // POWER_BY_RISE_SIGNI_COUNT: ライズ状態のシグニ（スタック2枚以上）数×値
          if (stub.id === 'POWER_BY_RISE_SIGNI_COUNT') {
            const riseCount = ownerState.field.signi.filter(s => (s?.length ?? 0) >= 2).length;
            const m = txt.match(/《ライズアイコン》.*シグニ１体につき[＋+]([０-９\d]+)/);
            if (m && riseCount > 0 && powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + riseCount * parseN(m[1]));
            }
          }

          // POWER_BY_CHARM_COUNT: 場のチャーム枚数×値（自分の場のみ）
          if (stub.id === 'POWER_BY_CHARM_COUNT') {
            const charmCount = (ownerState.field.signi_charms ?? []).filter(c => c !== null).length;
            const m = txt.match(/【チャーム】１枚につき[＋+]([０-９\d]+)/);
            if (m && charmCount > 0 && powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + charmCount * parseN(m[1]));
            }
          }

          // POWER_BY_ENERGY_COLOR_VARIETY: エナの色種類数（白赤緑黒）×値
          if (stub.id === 'POWER_BY_ENERGY_COLOR_VARIETY') {
            const TARGET_COLORS = ['白', '赤', '緑', '黒'];
            const colorSet = new Set<string>();
            for (const instId of ownerState.energy) {
              const baseNum = instId.includes('#') ? instId.slice(0, instId.indexOf('#')) : instId;
              for (const col of TARGET_COLORS) {
                if (cardMap.get(baseNum)?.Color?.includes(col)) colorSet.add(col);
              }
            }
            const m = txt.match(/色１種類につき[＋+]([０-９\d]+)/);
            if (m && colorSet.size > 0 && powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + colorSet.size * parseN(m[1]));
            }
          }

          // POWER_BY_CENTER_LRIG_TYPE_COUNT: センタールリグのルリグタイプ数×値
          if (stub.id === 'POWER_BY_CENTER_LRIG_TYPE_COUNT') {
            const lrigTop = ownerState.field.lrig.at(-1);
            const lrigCard = lrigTop ? cardMap.get(lrigTop) : undefined;
            const typeCount = lrigCard?.CardClass
              ? lrigCard.CardClass.split(/[/／]/).filter(Boolean).length
              : 0;
            const m = txt.match(/ルリグタイプ１つにつき[＋+]([０-９\d]+)/);
            if (m && typeCount > 0 && powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + typeCount * parseN(m[1]));
            }
          }

          // POWER_MOD_PER_COUNT (CONT): 各種カウント×値だけパワー修正（自シグニに適用）
          if (stub.id === 'POWER_MOD_PER_COUNT') {
            const toHWPMPC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
            const parseNPMPC = (s: string) => parseInt(toHWPMPC(s), 10);
            let countPMPC = 0;
            let deltaPMPC = 0;
            // 手札N枚につき
            const handM = txt.match(/手札([０-９\d]*)枚につき([＋+]?[－-][０-９\d]+|[＋+][０-９\d]+)/);
            if (handM) {
              const divisorH = parseInt(toHWPMPC(handM[1] || '1')) || 1;
              countPMPC = Math.floor(ownerState.hand.length / divisorH);
              deltaPMPC = parseNPMPC(handM[2].replace('＋', '+').replace('－', '-'));
            }
            // エナゾーンのカードN枚につき
            if (!handM) {
              const enaM = txt.match(/エナゾーン(?:のカード)?([０-９\d]*)枚につき([＋+]?[－-][０-９\d]+|[＋+][０-９\d]+)/);
              if (enaM) {
                const divisorE = parseInt(toHWPMPC(enaM[1] || '1')) || 1;
                countPMPC = Math.floor(ownerState.energy.length / divisorE);
                deltaPMPC = parseNPMPC(enaM[2].replace('＋', '+').replace('－', '-'));
              }
            }
            // 登録者数N万人につき
            if (!deltaPMPC) {
              const subM = txt.match(/登録者数([０-９\d]*)万人につき([＋+]?[－-][０-９\d]+|[＋+][０-９\d]+)/);
              if (subM) {
                const divisorS = parseInt(toHWPMPC(subM[1] || '1')) || 1;
                const subCount = ownerState.subscriber_count ?? 0;
                countPMPC = Math.floor(subCount / divisorS);
                deltaPMPC = parseNPMPC(subM[2].replace('＋', '+').replace('－', '-'));
              }
            }
            const totalPMPC = countPMPC * deltaPMPC;
            if (totalPMPC !== 0 && powers.has(topNum)) {
              powers.set(topNum, (powers.get(topNum) ?? 0) + totalPMPC);
            }
          }

          // POWER_MOD_BY_FRONT_LEVEL: 正面の相手シグニのレベル×値だけその相手シグニのパワーを下げる
          if (stub.id === 'POWER_MOD_BY_FRONT_LEVEL') {
            const myZoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === topNum);
            if (myZoneIdx !== -1) {
              const oppFrontNum = otherState.field.signi[myZoneIdx]?.at(-1);
              if (oppFrontNum && powers.has(oppFrontNum)) {
                const oppLevel = parseInt(cardMap.get(oppFrontNum)?.Level ?? '0', 10);
                const m = txt.match(/レベル１につき[－-]([０-９\d]+)/);
                if (m && oppLevel > 0) {
                  powers.set(oppFrontNum, (powers.get(oppFrontNum) ?? 0) - oppLevel * parseN(m[1]));
                }
              }
            }
          }
        }
      }
    }
  };

  applyEffects(myState, opState, isMyTurn);
  applyEffects(opState, myState, !isMyTurn);

  // temp_power_mods（起動・自動効果によるターン内一時パワー修正）を適用
  // negatePositiveFor: このセットにあるシグニへの正デルタを負に置換（REPLACE_PLUS_N）
  // doubleNeg: このstateのシグニへの負デルタを2倍にする（対戦相手が double_power_minus_this_turn を持つ場合。WX04-038-E1）
  const applyTempMods = (state: PlayerState, negatePositiveFor?: Set<string>, doubleNeg = false) => {
    const doublers = state.double_power_minus_targets ?? [];
    for (const mod of [...(state.temp_power_mods ?? []), ...(state.power_mods_until_opp_turn ?? [])]) {
      if (powers.has(mod.cardNum)) {
        // DOUBLE_OWN_POWER_MINUS（特定シグニ）/ DOUBLE_POWER_MINUS（このターン・相手フラグ。シグニ発生元のみ）: 負デルタを2倍に
        // srcType 未設定はシグニ発生元として扱う（STUB系シグニ効果が大多数）。レゾナもシグニ。
        const fromSigni = mod.srcType === undefined || mod.srcType.includes('シグニ') || mod.srcType.includes('レゾナ');
        let delta = mod.delta < 0 && (doublers.includes(mod.cardNum) || (doubleNeg && fromSigni)) ? mod.delta * 2 : mod.delta;
        // REPLACE_PLUS_N: 対象シグニへの正デルタを負に置換
        if (negatePositiveFor?.has(mod.cardNum) && delta > 0) delta = -delta;
        powers.set(mod.cardNum, (powers.get(mod.cardNum) ?? 0) + delta);
      }
    }
  };
  // myState.replace_opp_power_plus が true の場合、相手シグニへの正デルタを負に置換
  const opSigniNums = new Set<string>();
  for (const stack of opState.field.signi) { const top = stack?.at(-1); if (top) opSigniNums.add(top); }
  const negateForOp = myState.replace_opp_power_plus ? opSigniNums : undefined;
  // 各プレイヤーのシグニへの負デルタは、その対戦相手が「このターン2倍－」を持つ場合に倍化する
  applyTempMods(myState, negateForOp, opState.double_power_minus_this_turn === true);
  applyTempMods(opState, myState.replace_opp_power_plus ? opSigniNums : undefined, myState.double_power_minus_this_turn === true);

  // POWER_CAP: パワー上限の適用（全パワー修正後に上限を適用）
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const applyCaps = (state: PlayerState) => {
    for (const stack of state.field.signi) {
      const topNum = stack?.at(-1);
      if (!topNum || !powers.has(topNum)) continue;
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type !== 'STUB' || act.id !== 'POWER_CAP') continue;
        const txt = cardMap.get(topNum)?.EffectText ?? '';
        const m = txt.match(/パワーは([０-９\d]+)より大きくならない/);
        if (m) {
          const cap = parseInt(toHW(m[1]), 10);
          if (!isNaN(cap) && (powers.get(topNum) ?? 0) > cap) powers.set(topNum, cap);
        }
      }
    }
  };
  applyCaps(myState);
  applyCaps(opState);

  return powers;
}

function applyDeltaToState(
  state: PlayerState,
  delta: number,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  powers: Map<string, number>,
  powerProtectedNums?: Set<string>,
  negMultiplier?: number,
  excludeNum?: string, // excludeSelf: 効果元カード自身を除外
) {
  const effectiveDelta = (negMultiplier !== undefined && delta < 0) ? delta * negMultiplier : delta;
  // 同一CardNumが複数ゾーンにある場合、同じpowersエントリに重複適用しない
  const seen = new Set<string>();
  for (let zoneIdx = 0; zoneIdx < state.field.signi.length; zoneIdx++) {
    const stack = state.field.signi[zoneIdx];
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    if (seen.has(topNum)) continue;
    seen.add(topNum);
    if (topNum === excludeNum) continue;
    if (!powers.has(topNum)) continue;
    // PREVENT_POWER_MINUS_BY_OPP: 相手効果による負のパワー修正を無効化
    if (effectiveDelta < 0 && powerProtectedNums?.has(topNum)) continue;
    // ゾーン状態フィルタ（isArmored / hasCharm / hasAcce / infected / isDown / isFrozen / isUp）
    if (!matchesStateFilter(state, zoneIdx, filter)) continue;
    const card = cardMap.get(topNum);
    if (!matchesFilter(card, filter)) continue;
    powers.set(topNum, (powers.get(topNum) ?? 0) + effectiveDelta);
  }
}

// ===== アクティブなコスト修正を計算 =====

export interface ActiveCostMod {
  direction: 'increase' | 'decrease';
  targetCardType: string;
  amount: EnergyCost[];
  cardColor?: string; // decrease用: 対象カードの色制限（「青のスペル」等。複数色は「青と黒」のように含む）
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
        if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, _cardMap, topNum)) continue;
        // CostIncrease: targetOwner が 'opponent' なら相手のコストを増やす
        const increases = extractCostIncreases(effect.action);
        for (const inc of increases) {
          const target = inc.targetOwner === 'opponent' ? forOp : forMy;
          target.push({ direction: 'increase', targetCardType: inc.targetCardType, amount: inc.amount });
        }
        // CostReduction: 「あなたが使用する〜のコストは…減る」（常に効果オーナー自身のコストを減らす）
        const ownBucket = ownerState === myState ? forMy : forOp;
        const reductions = extractCostReductions(effect.action);
        for (const red of reductions) {
          if (red.isGrowCost) continue; // グロウコスト軽減は別経路（GROW_COST_REDUCTION）
          ownBucket.push({ direction: 'decrease', targetCardType: red.targetCardType, amount: red.reduction, cardColor: red.color });
        }
      }
    }
  };

  const myIsOwner = true;
  scanOwner(myState, opState, isMyTurn && myIsOwner);
  scanOwner(opState, myState, !isMyTurn);

  return { forMy, forOp };
}

// ===== GRANT_LRIG_ABILITY 収集 =====

/**
 * フィールド上のシグニ・キーピースが持つ CONTINUOUS GRANT_LRIG_ABILITY 効果を収集し、
 * センタールリグが付与された CardEffect[] を返す。
 */
export function collectLrigGrantedEffects(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): CardEffect[] {
  const granted: CardEffect[] = [];

  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    if (stack && stack.length > 0) candidates.push(stack[stack.length - 1]);
  }
  if (ownerState.field.key_piece) candidates.push(ownerState.field.key_piece);

  for (const cardNum of candidates) {
    const effects = effectsMap.get(cardNum) ?? [];
    for (const effect of effects) {
      if (effect.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, cardNum)) continue;
      if (effect.action.type === 'GRANT_LRIG_ABILITY') {
        const gla = effect.action as GrantLrigAbilityAction;
        granted.push(...gla.abilities);
      }
    }
  }

  // GRANT_UNDER_LRIG_ACTIVATE_ABILITY / GRANT_UNDER_LRIG_AUTO_ABILITY:
  // センタールリグのスタック下カードの能力をトップルリグに付与する
  const lrigStack = ownerState.field.lrig;
  if (lrigStack.length >= 2) {
    const topLrigNum = lrigStack[lrigStack.length - 1];
    const underLrigs = lrigStack.slice(0, -1);
    for (const eff of (effectsMap.get(topLrigNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topLrigNum)) continue;
      if (eff.action.type !== 'STUB') continue;
      const stub = eff.action as import('../types/effects').StubAction;
      if (stub.id === 'GRANT_UNDER_LRIG_ACTIVATE_ABILITY') {
        for (const un of underLrigs) {
          granted.push(...(effectsMap.get(un) ?? []).filter(e => e.effectType === 'ACTIVATED'));
        }
      }
      if (stub.id === 'GRANT_UNDER_LRIG_AUTO_ABILITY') {
        for (const un of underLrigs) {
          granted.push(...(effectsMap.get(un) ?? []).filter(e => e.effectType === 'AUTO'));
        }
      }
    }
  }

  // GRANT_LRIG_TRASH_ACTIVATE_ABILITY:
  // ルリグトラッシュにある名前一致ルリグのACTIVATED能力をトップルリグに付与する
  const topLrig = lrigStack.at(-1);
  if (topLrig) {
    for (const eff of (effectsMap.get(topLrig) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topLrig)) continue;
      if (eff.action.type !== 'STUB') continue;
      const stub2 = eff.action as import('../types/effects').StubAction;
      if (stub2.id === 'GRANT_LRIG_TRASH_ACTIVATE_ABILITY') {
        const topCard = cardMap.get(topLrig);
        const txt = topCard?.EffectText ?? '';
        const nameM = txt.match(/カード名に《([^》]+)》を含む/);
        const reqName = nameM?.[1];
        for (const trashNum of (ownerState.lrig_trash ?? [])) {
          const trashCard = cardMap.get(trashNum);
          if (!trashCard) continue;
          if (reqName && !(trashCard.CardName ?? '').includes(reqName)) continue;
          granted.push(...(effectsMap.get(trashNum) ?? []).filter(e => e.effectType === 'ACTIVATED'));
        }
      }
    }
  }

  return granted;
}

export function getEffectivePower(
  cardNum: string,
  powers: Map<string, number>,
  cardMap: Map<string, CardData>,
): number {
  if (powers.has(cardNum)) return powers.get(cardNum)!;
  const card = cardMap.get(cardNum);
  // Power「∞」はInfinity扱い（parseIntだとNaN→0になり∞シグニがパワー0として扱われてしまう）
  return card?.Power === '∞' ? Infinity : (parseInt(card?.Power ?? '', 10) || 0);
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

  // センタールリグの self 対象 CONTINUOUS BLOCK_ACTION（グロウフェイズスキップ等）を拾う。
  // scanField はシグニゾーンの opponent 対象ブロックのみ対象にするため、ルリグが自分自身へ
  // 課す制約（「あなたのグロウフェイズをスキップする」= GROW など）はここで補完する。
  const scanLrigSelfBlocks = (fieldOwner: PlayerState, fieldOther: PlayerState, isFieldOwnerTurn: boolean, isMe: boolean) => {
    if (fieldOwner.lrig_abilities_disabled) return;
    const lrigTop = fieldOwner.field.lrig.at(-1);
    if (!lrigTop) return;
    for (const effect of (effectsMap.get(lrigTop) ?? [])) {
      if (effect.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(effect.activeCondition, fieldOwner, fieldOther, isFieldOwnerTurn, cardMap, lrigTop)) continue;
      for (const b of extractBlockActions(effect.action)) {
        if (b.target.owner === 'self') (isMe ? forSelf : forOther).add(b.actionId);
      }
    }
  };
  scanLrigSelfBlocks(ownerState, otherState, isOwnerTurn, true);
  scanLrigSelfBlocks(otherState, ownerState, !isOwnerTurn, false);

  // ONE_ATTACK_PER_TURN: このシグニ自身にこの常在効果があり、すでにアタック済みならアタック不可
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasOneAtk = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'ONE_ATTACK_PER_TURN' &&
      checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap),
    );
    if (hasOneAtk && (ownerState.attacked_signi_ids ?? []).includes(topNum)) {
      cannotAttackSigni.add(topNum);
    }
  }

  // ODD_LEVEL_SIGNI_CANT_ATTACK: 相手フィールドにこの効果があれば自分の奇数レベルシグニはアタック不可
  // 実効レベルを事前計算（LEVEL_MOD_PER_COUNT適用済み）
  const ownerEffectiveLevels = buildLevelMods(ownerState, otherState, effectsMap, cardMap);
  for (const stack of otherState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasEffect = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'ODD_LEVEL_SIGNI_CANT_ATTACK' &&
      checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
    );
    if (!hasEffect) continue;
    for (const myStack of ownerState.field.signi) {
      if (!myStack?.length) continue;
      const myTop = myStack[myStack.length - 1];
      const level = ownerEffectiveLevels.has(myTop) ? ownerEffectiveLevels.get(myTop)! : parseInt(cardMap.get(myTop)?.Level ?? '', 10);
      if (!isNaN(level) && level % 2 === 1) cannotAttackSigni.add(myTop);
    }
  }

  // BLOCK_FRONT_SIGNI_ATTACK: 相手フィールドにこの効果があれば、正面の自分のシグニはアタック不可
  for (let zi = 0; zi < otherState.field.signi.length; zi++) {
    const oppStack = otherState.field.signi[zi];
    if (!oppStack?.length) continue;
    const oppTop = oppStack[oppStack.length - 1];
    const hasEffect = (effectsMap.get(oppTop) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_FRONT_SIGNI_ATTACK' &&
      checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
    );
    if (!hasEffect) continue;
    const myFrontTop = ownerState.field.signi[zi]?.at(-1);
    if (myFrontTop) cannotAttackSigni.add(myFrontTop);
  }

  // BLOCK_OPP_ENCORE_AND_BET: 自フィールドにあれば相手のアンコール/ベットを封じる
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasBlock = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_OPP_ENCORE_AND_BET' &&
      checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap),
    );
    if (hasBlock) { forOther.add('ENCORE'); forOther.add('BET'); }
  }
  // 相手フィールドにあれば自分のアンコール/ベットを封じる
  for (const stack of otherState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasBlock = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_OPP_ENCORE_AND_BET' &&
      checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
    );
    if (hasBlock) { forSelf.add('ENCORE'); forSelf.add('BET'); }
  }

  // BLOCK_OPP_DECK_TO_ENERGY: 自フィールドにあれば相手のデッキ→エナ効果を封じる
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasBlock = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_OPP_DECK_TO_ENERGY' &&
      checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap),
    );
    if (hasBlock) forOther.add('DECK_TO_ENERGY');
  }
  for (const stack of otherState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasBlock = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_OPP_DECK_TO_ENERGY' &&
      checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
    );
    if (hasBlock) forSelf.add('DECK_TO_ENERGY');
  }

  // BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: 自フィールドにあれば相手はシグニ効果でシグニを出せない
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasBlock = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT' &&
      checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap),
    );
    if (hasBlock) forOther.add('SIGNI_FIELD_PLACE_BY_EFFECT');
  }
  for (const stack of otherState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasBlock = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT' &&
      checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
    );
    if (hasBlock) forSelf.add('SIGNI_FIELD_PLACE_BY_EFFECT');
  }

  // ATTACK_COUNT_BY_POWER: 自シグニのパワー10000につき1回アタック制限
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const hasATK = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'ATTACK_COUNT_BY_POWER' &&
      checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap),
    );
    if (!hasATK) continue;
    const power = parseInt(cardMap.get(topNum)?.Power ?? '0') || 0;
    const maxAttacks = Math.floor(power / 10000);
    const attackCount = (ownerState.attacked_signi_ids ?? []).filter(id => id === topNum).length;
    if (attackCount >= maxAttacks) cannotAttackSigni.add(topNum);
  }

  // BLOCK_ALL_OPP_ACTIVATE_ABILITY: 相手フィールドにありアクティブ条件(自ターン)が満たされていれば自分のUSE_ACTをブロック
  for (const stack of otherState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const has = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_ALL_OPP_ACTIVATE_ABILITY' &&
      checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap),
    );
    if (has) forSelf.add('USE_ACT');
  }

  // BLOCK_COLORLESS_PLAY: 自フィールドにあれば自分が無色シグニ/スペルをプレイ不可
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const has = (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_COLORLESS_PLAY' &&
      checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap),
    );
    if (has) forSelf.add('PLAY_COLORLESS');
  }

  // keyword_grants で付与された「アタックできない」のシグニをアタック不可に追加
  // ownerState（自分）と otherState（相手）の両方を確認する。
  // 相手が付与した「アタックできない」は相手側の keyword_grants に格納されるため。
  for (const stack of ownerState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    if ((ownerState.keyword_grants?.[topNum] ?? []).includes('アタックできない') ||
        (ownerState.keyword_grants_until_opp_turn?.[topNum] ?? []).includes('アタックできない') ||
        (otherState.keyword_grants?.[topNum] ?? []).includes('アタックできない') ||
        (otherState.keyword_grants_until_opp_turn?.[topNum] ?? []).includes('アタックできない')) {
      cannotAttackSigni.add(topNum);
    }
  }

  // BLOCK_NON_WHITE_SPELL: どちらかのフィールドにあれば両者の白以外スペル使用を封じる
  const hasNonWhiteSpellBlock = [...ownerState.field.signi, ...otherState.field.signi].some(stack => {
    if (!stack?.length) return false;
    const topNum = stack[stack.length - 1];
    return (effectsMap.get(topNum) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'BLOCK_NON_WHITE_SPELL',
    );
  });
  if (hasNonWhiteSpellBlock) { forSelf.add('BLOCK_NON_WHITE_SPELL'); forOther.add('BLOCK_NON_WHITE_SPELL'); }

  return { forSelf, forOther, cannotAttackSigni };
}

/**
 * BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: ownerState のフィールドに
 * 「対戦相手はコストの合計が【チャーム】数以下のスペルを使用できない」CONTINUOUS効果があれば
 * チャーム数（= ブロックされるコスト上限）を返す。0 なら制限なし。
 */
export function collectBlockLowCostSpellCount(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): number {
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT') continue;
      const charmCount = (ownerState.field.signi_charms ?? []).filter(c => c !== null).length;
      if (charmCount > 0) return charmCount;
    }
  }
  void cardMap;
  return 0;
}

/**
 * LOSE_COLOR_ALL_ZONES: フィールドのシグニが「チームルリグ3体未満→全ゾーンで色喪失」条件を満たすか判定し、
 * 色を失うカードのCardNumセットを返す。
 * ownerState/otherState 両方のフィールドを走査して、それぞれのプレイヤー視点で返す。
 */
export function collectColorlessOverrides(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
): { ownerColorless: string[]; otherColorless: string[] } {
  function getColorlessForPlayer(ps: PlayerState): string[] {
    const result: string[] = [];
    for (const stack of ps.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      const card = cardMap.get(topNum);
      if (!card) continue;
      // カードのEffectTextに「すべての領域で色を失う」が含まれているか確認
      const txt = (card.EffectText ?? '') + ' ' + (card.BurstText ?? '');
      if (!txt.includes('すべての領域で色を失う')) continue;
      // 「あなたの場に＜チーム名＞のルリグが３体いないかぎり」条件チェック
      const teamM = txt.match(/あなたの場に＜([^＞]+)＞のルリグが３体いない/);
      if (!teamM) { result.push(topNum); continue; }
      const teamName = teamM[1];
      // フィールドのルリグ（センター + アシスト左右）でチーム名一致カードを数える
      const lrigNums = [
        ps.field.lrig.at(-1),
        ps.field.assist_lrig_l?.at(-1),
        ps.field.assist_lrig_r?.at(-1),
      ].filter((n): n is string => !!n);
      const teamCount = lrigNums.filter(n => {
        const lc = cardMap.get(n);
        return lc && (
          (lc.Team ?? '').includes(teamName) ||
          (lc.Story ?? '').includes(teamName) ||
          (lc.CardClass ?? '').includes(teamName) ||
          (lc.CardName ?? '').includes(teamName)
        );
      }).length;
      if (teamCount < 3) result.push(topNum);
    }
    return result;
  }
  return {
    ownerColorless: getColorlessForPlayer(ownerState),
    otherColorless: getColorlessForPlayer(otherState),
  };
}

/**
 * 英知CONTINUOUS STUB効果を収集する。英知=N条件を満たすシグニのSTUB IDリストを返す。
 * 主に SUPPRESS_LIFE_BURST_ON_CRASH, ADJACENT_ZONE_ATTACK などを BattleScreen で動的チェックするために使用。
 */
export function collectEichiStubEffects(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const result: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!eff.activeCondition || eff.activeCondition.type !== 'EICHI_LEVEL_SUM') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, top)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB') result.push(act.id);
    }
  }
  return result;
}

/**
 * LIMIT_OPP_DRAW_COUNT (CONTINUOUS): 相手がドローフェイズに引けるカードを合計1枚に制限。
 * センタールリグレベル≥3などの条件付きCONT効果を動的検査して返す。
 */
export function collectDrawLimits(
  opponentState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  isMyTurn: boolean,
  myState?: PlayerState,
): number | undefined {
  // opponentState のフィールドシグニ・ルリグを走査してCONT LIMIT_OPP_DRAW_COUNT を検出
  const candidates: string[] = [
    ...opponentState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []),
    ...opponentState.field.lrig.slice(-1),
  ];
  if (opponentState.field.key_piece) candidates.push(opponentState.field.key_piece);
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || (act.id !== 'LIMIT_OPP_DRAW_COUNT' && act.id !== 'OPP_DRAW_LIMIT_PER_TURN')) continue;
      // activeCondition チェック (レベル≥3 等)
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, opponentState, myState ?? opponentState, isMyTurn, cardMap, cn)) continue;
      // 引けるカード上限をテキストから解析
      const txt = (cardMap.get(cn)?.EffectText ?? '') + ' ' + (cardMap.get(cn)?.BurstText ?? '');
      const m = txt.match(/合計([０-９\d]+)枚まで/);
      const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
      return m ? parseInt(toHW(m[1])) : 1;
    }
  }
  return undefined;
}

/**
 * PREVENT_ZONE_MOVE_BY_OPP: フィールドのシグニがCONTINUOUS保護効果を持つ場合、
 * 保護されているゾーン（'hand' | 'energy'）を動的に返す。
 * state のフィールド上シグニとキーピースを走査する。
 */
export function collectProtectedZones(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): ('hand' | 'energy')[] {
  const result = new Set<'hand' | 'energy'>();
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (state.field.key_piece) candidates.push(state.field.key_piece);
  // ルリグフィールドも対象（WXEX2-22等のルリグ常時効果）
  if (state.field.lrig.length) candidates.push(state.field.lrig[state.field.lrig.length - 1]);
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      if (act.id === 'PREVENT_ZONE_MOVE_BY_OPP') {
        const card = cardMap.get(cn);
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        if (txt.includes('エナゾーン') && txt.includes('トラッシュに移動しない')) result.add('energy');
        if (txt.includes('手札') && txt.includes('トラッシュに移動しない')) result.add('hand');
      }
      // PREVENT_NON_FIELD_MOVE_BY_OPP: 場以外の全領域（手札・エナ等）を保護
      if (act.id === 'PREVENT_NON_FIELD_MOVE_BY_OPP') {
        result.add('hand');
        result.add('energy');
      }
    }
  }
  return [...result];
}

/**
 * ATTACK_PHASE_LEVEL_OVERRIDE: アタックフェイズ中に英知レベルをオーバーライドするシグニを収集。
 * CardNum → 使用するレベル（範囲の最大値）のマップを返す。
 */
export function collectAttackPhaseLevelOverrides(
  state: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Record<string, number> {
  const overrides: Record<string, number> = {};
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    const effs = effectsMap.get(top) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'ATTACK_PHASE_LEVEL_OVERRIDE') continue;
      const txt = (cardMap.get(top)?.EffectText ?? '') + ' ' + (cardMap.get(top)?.BurstText ?? '');
      const m = txt.match(/レベルは([０-９\d]+)～([０-９\d]+)であるとして扱う/);
      if (m) {
        overrides[top] = parseInt(toHW(m[2]));
      }
    }
  }
  return overrides;
}

/**
 * ENERGY_COLOR_SUBSTITUTE: フィールドのキーピース等がCONTINUOUSで色代替を持つ場合、
 * その代替ルール { from: string[], to: string }[] を動的に返す。
 */
export function collectEnergyColorSubs(
  state: PlayerState,
  _cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { from: string[]; to: string }[] {
  const result: { from: string[]; to: string }[] = [];
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (state.field.key_piece) candidates.push(state.field.key_piece);
  if (state.field.lrig.length > 0) candidates.push(state.field.lrig.at(-1)!);
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      if (act.id === 'ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白') {
        result.push({ from: ['赤', '青'], to: '白' });
      }
    }
  }
  return result;
}

/**
 * エナ代替トラッシュ系CONTINUOUS効果（ENERGY_*_TRASH_*）を収集する。
 * - ENERGY_COLOR_SUBSTITUTE_TRASH: ルリグ効果→黒エナ→任意色ワイルド
 * - ENERGY_SUBSTITUTE_TRASH_SIGNI: エナゾーンの当該シグニ→センタールリグ色
 * - ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI: フィールドシグニ効果→美巧エナ→白
 * - ENERGY_SUBSTITUTE_TRASH_KEY: キーピース→エナ2枚任意色代替
 */
export function collectEnergyTrashSubstituteInfo(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): {
  wildcardInstIds: Set<string>;          // 任意色として使えるエナinstId
  colorOverrideMap: Map<string, string>; // 特定色として使えるエナinstId→色
  keySubInstId: string | null;           // キーピースinstId（エナ2任意色）
} {
  const wildcardInstIds = new Set<string>();
  const colorOverrideMap = new Map<string, string>();
  let keySubInstId: string | null = null;

  function baseNum(id: string): string {
    const h = id.indexOf('#');
    return h > 0 ? id.slice(0, h) : id;
  }

  // センタールリグのCONTINUOUS効果チェック（ENERGY_COLOR_SUBSTITUTE_TRASH）
  let hasColorSubTrash = false;
  let centerLrigColor = '';
  const centerLrigInstId = state.field.lrig.at(-1);
  if (centerLrigInstId) {
    const lrigCard = cardMap.get(baseNum(centerLrigInstId));
    centerLrigColor = lrigCard?.Color ?? '';
    const effs = effectsMap.get(centerLrigInstId) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ENERGY_COLOR_SUBSTITUTE_TRASH') {
        hasColorSubTrash = true;
      }
    }
  }

  // フィールドシグニのCONTINUOUS効果チェック（ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI）
  let hasWhiteSubTrashSigni = false;
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    const effs = effectsMap.get(top) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI') {
        hasWhiteSubTrashSigni = true;
      }
    }
  }

  // キーピースのCONTINUOUS効果チェック（ENERGY_SUBSTITUTE_TRASH_KEY）
  const keyPiece = state.field.key_piece;
  if (keyPiece) {
    const effs = effectsMap.get(keyPiece) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ENERGY_SUBSTITUTE_TRASH_KEY') {
        keySubInstId = keyPiece;
        break;
      }
    }
  }

  // エナゾーンの各カードを判定
  for (const instId of state.energy) {
    const bn = baseNum(instId);
    const card = cardMap.get(bn);
    if (!card) continue;

    // ENERGY_COLOR_SUBSTITUTE_TRASH: 黒エナ→ワイルド
    if (hasColorSubTrash && (card.Color ?? '').includes('黒')) {
      wildcardInstIds.add(instId);
      continue;
    }

    // ENERGY_SUBSTITUTE_TRASH_SIGNI: このシグニ自身がエナにある→センタールリグ色
    const selfEffs = effectsMap.get(instId) ?? [];
    const hasSelfEffect = selfEffs.some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'ENERGY_SUBSTITUTE_TRASH_SIGNI',
    );
    if (hasSelfEffect && centerLrigColor) {
      colorOverrideMap.set(instId, centerLrigColor);
      continue;
    }

    // ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI: 美巧シグニ→白
    if (hasWhiteSubTrashSigni && card.Type === 'シグニ' && (card.CardClass ?? '').includes('美巧')) {
      colorOverrideMap.set(instId, '白');
    }
  }

  // ENERGY_NON_COLORLESS_ALL_COLORS: 自フィールドシグニにこのSTUBが有効なら非無色エナをワイルド化
  const hasNonColorlessAllColors = [...state.field.signi, ...(state.field.key_piece ? [[state.field.key_piece]] : [])]
    .some(stack => {
      const top = Array.isArray(stack) ? stack.at(-1) : stack;
      if (!top) return false;
      return (effectsMap.get(top) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
        (eff.action as import('../types/effects').StubAction).id === 'ENERGY_NON_COLORLESS_ALL_COLORS',
      );
    });
  if (hasNonColorlessAllColors) {
    for (const instId of state.energy) {
      const bn = baseNum(instId);
      const c = cardMap.get(bn);
      if (c && (c.Color ?? '無') !== '無') wildcardInstIds.add(instId);
    }
  }

  return { wildcardInstIds, colorOverrideMap, keySubInstId };
}

/**
 * FORCE_TARGET_SELF: フィールドのシグニが「相手ターンに可能ならば自分を対象にさせる」CONTINUOUS効果を持つ場合、
 * そのシグニのCardNumセットを返す（相手ターン中にアクティブなもの）。
 * isOwnerTurn = state（カード所有者）のターンかどうか。呼び出し元は !executor_isOwnerTurn を渡す。
 */
export function collectForcedTargets(
  state: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): string[] {
  const result: string[] = [];
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'FORCE_TARGET_SELF') {
        result.push(topNum);
        break;
      }
    }
  }
  return result;
}

/**
 * OPP_GUARD_COST_COLORLESS: 自分のフィールド（ルリグ含む）に
 * 「対戦相手は追加で《無》を支払わないかぎりガードができない」CONTINUOUS効果が
 * アクティブかどうかを返す。アクティブであれば相手はガード時に追加エナ1枚(無色)が必要。
 */
export function collectOppGuardExtraColorlessCost(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): boolean {
  // シグニゾーン走査
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  // ルリグゾーン（センタールリグ）
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);

  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || (act.id !== 'OPP_GUARD_COST_COLORLESS' && act.id !== 'GUARD_EXTRA_COST_BY_OPP')) continue;
      // activeConditionがある場合はチェック
      if (eff.activeCondition) {
        if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, cn)) continue;
      } else {
        // activeConditionなし = テキスト解析で条件チェック
        const card = cardMap.get(cn);
        const txt = card?.EffectText ?? '';
        // 「レベル３の覚醒状態のシグニがあるかぎり」
        if (txt.includes('覚醒状態のシグニがあるかぎり')) {
          const lv3AwakNum = txt.match(/レベル([１-９\d]+)の覚醒状態/)?.[1];
          const lv3 = lv3AwakNum ? parseInt(lv3AwakNum.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))) : 3;
          const hasAwakened = ownerState.field.signi.some(stack => {
            const top = stack?.at(-1);
            if (!top) return false;
            if (!(ownerState.awakened_signi ?? []).includes(top)) return false;
            return (cardMap.get(top)?.Level ?? 0) === lv3;
          });
          if (!hasAwakened) continue;
        }
        // 「すべてのシグニが《ディソナアイコン》」などの未パース条件はスキップ（不確か）
        else if (txt.includes('すべてのシグニが《ディソナアイコン》')) {
          continue; // 複雑条件のため安全のためスキップ
        }
      }
      return true;
    }
  }
  // game_opp_guard_extra_colorless: GAIN_ABILITY_THIS_GAME で付与された永続コスト（WX25-P2-001）
  if (ownerState.game_opp_guard_extra_colorless) return true;
  return false;
}

/**
 * OPP_ENERGY_COLOR_CONDITION_TRASH: ownerState のフィールドに
 * 「対戦相手のエナゾーンに[色]を持たず置かれる場合トラッシュ」CONTINUOUS効果があれば
 * その必要色を返す（その色を持たないカードを相手がエナチャージしようとした場合トラッシュへ）。
 */
export function collectOppEnergyColorRestriction(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): string | null {
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'OPP_ENERGY_COLOR_CONDITION_TRASH') continue;
      const card = cardMap.get(cn);
      const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
      const m = txt.match(/(赤|青|緑|白|黒)/);
      if (m) return m[1];
    }
  }
  return null;
}

/**
 * EXTRA_GUARD_COST_FROM_HAND: ownerState のフィールドに
 * 「手札からガードアイコンカードを追加で捨てないとガードできない」CONTINUOUS効果があれば true を返す。
 */
export function collectOppExtraGuardFromHand(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): boolean {
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'EXTRA_GUARD_COST_FROM_HAND') return true;
    }
  }
  void cardMap;
  return false;
}

/**
 * HAND_SIZE_INCREASE / REDUCE_OPP_HAND_LIMIT:
 * ownerState のターン終了時に適用される実効手札上限を返す。
 * - ownerState のフィールドにある HAND_SIZE_INCREASE 効果で上限を増加
 * - opponentState のフィールドにある REDUCE_OPP_HAND_LIMIT 効果で上限を減少
 */
export function collectHandLimits(
  ownerState: PlayerState,
  opponentState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): number {
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  let limit = 6;

  const scanForStub = (state: PlayerState, stubId: string, callback: (txt: string) => void) => {
    const candidates: string[] = [];
    for (const stack of state.field.signi) {
      const top = stack?.at(-1);
      if (top) candidates.push(top);
    }
    if (state.field.lrig.length > 0) candidates.push(state.field.lrig.at(-1)!);
    for (const cn of candidates) {
      for (const eff of (effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type !== 'STUB' || act.id !== stubId) continue;
        const card = cardMap.get(cn);
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        callback(txt);
      }
    }
  };

  scanForStub(ownerState, 'HAND_SIZE_INCREASE', (txt) => {
    const becomeM   = txt.match(/[（(].*から([０-９\d]+)枚になる[）)]/);
    const increaseM = txt.match(/手札の枚数の上限は([０-９\d]+)増える/);
    const directM   = txt.match(/手札を([０-９\d]+)枚まで/);
    if (becomeM)    limit = parseInt(toHW(becomeM[1]));
    else if (increaseM) limit += parseInt(toHW(increaseM[1]));
    else if (directM)   limit = parseInt(toHW(directM[1]));
  });

  scanForStub(opponentState, 'REDUCE_OPP_HAND_LIMIT', (txt) => {
    const reduceM = txt.match(/手札の上限は([０-９\d]+)減る/);
    limit -= reduceM ? parseInt(toHW(reduceM[1])) : 1;
  });

  // game_hand_size_bonus: GAIN_ABILITY_THIS_GAME で付与された手札上限増加
  limit += ownerState.game_hand_size_bonus ?? 0;

  return Math.max(0, limit);
}

/**
 * PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 対戦相手の効果による能力消失を防ぐシグニを返す。
 * state のフィールド上に PREVENT_SIGNI_ABILITY_LOSS_BY_OPP CONT 効果があれば、
 * 保護対象の他シグニ（同色）の CardNum セットを返す。
 */
export function collectAbilityProtectedSigni(
  state: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): string[] {
  const protectedNums = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;

      // GRANT_PROTECTION アクション: from に 'シグニ' を含み sourceOwner='opponent' → このシグニを保護
      if (eff.action.type === 'GRANT_PROTECTION') {
        const gp = eff.action as GrantProtectionAction;
        if (gp.sourceOwner === 'opponent' && (gp.from?.includes('シグニ') || gp.from?.includes('any'))) {
          // subjectFilter: フィルタ一致シグニを保護
          if (gp.subjectFilter) {
            for (const s2 of state.field.signi) {
              const top2 = s2?.at(-1);
              if (top2 && matchesFilter(cardMap.get(top2), gp.subjectFilter)) protectedNums.add(top2);
            }
          } else {
            // target/subjectFilter なし = このシグニ自身を保護（granted_effects 経由の場合）
            protectedNums.add(topNum);
          }
        }
        continue;
      }

      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;

      if (act.id === 'PREVENT_SIGNI_ABILITY_LOSS_BY_OPP') {
        const card = cardMap.get(topNum);
        const txt = card?.EffectText ?? '';
        const colorM = txt.match(/あなたの他の([^の]+?)のシグニは対戦相手の効果によって能力を失わない/);
        const protectedColor = colorM?.[1];
        for (const otherStack of state.field.signi) {
          if (!otherStack || otherStack.length === 0) continue;
          const otherTop = otherStack[otherStack.length - 1];
          if (otherTop === topNum) continue;
          if (!protectedColor) {
            protectedNums.add(otherTop);
          } else {
            const otherCard = cardMap.get(otherTop);
            if (otherCard?.Color?.includes(protectedColor)) protectedNums.add(otherTop);
          }
        }
      }

      // WHITE_SIGNI_ABILITY_PROTECT: 対戦相手ターン中に白シグニを保護
      if (act.id === 'WHITE_SIGNI_ABILITY_PROTECT') {
        if (isOwnerTurn === true) continue; // 自ターン中は不活性
        for (const otherStack of state.field.signi) {
          if (!otherStack || otherStack.length === 0) continue;
          const otherTop = otherStack[otherStack.length - 1];
          if (cardMap.get(otherTop)?.Color?.includes('白')) protectedNums.add(otherTop);
        }
      }
    }
  }
  return [...protectedNums];
}

/**
 * SPECIFIC_CARD_COST_REDUCE: 特定カード名のコストを《無×N》減らすCONT効果を収集する。
 * state のフィールド上のシグニ・ルリグを走査して、{targetCardName, colorlessReduction} のリストを返す。
 */
export function collectSpecificCardCostReductions(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { targetCardName: string; colorlessReduction: number }[] {
  const reductions: { targetCardName: string; colorlessReduction: number }[] = [];
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (state.field.lrig.length > 0) candidates.push(state.field.lrig.at(-1)!);
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'SPECIFIC_CARD_COST_REDUCE') continue;
      const card = cardMap.get(cn);
      const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
      // 《カード名》の使用コストは《無×N》減る
      const m = txt.match(/《([^》]+)》の使用コストは《無×([０-９\d]+)》減る/);
      if (m) {
        const colorlessReduction = parseInt(toHW(m[2]));
        if (!isNaN(colorlessReduction) && colorlessReduction > 0) {
          reductions.push({ targetCardName: m[1], colorlessReduction });
        }
      }
    }
  }
  return reductions;
}

// ===== ビート条件評価 =====

export function checkBeatCondition(beatZone: string[], condText: string, cardMap: Map<string, CardData>): boolean {
  const n = (s: string) => parseInt(s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30)), 10);

  // 枚数条件: N枚以下 / N枚以上
  let m = condText.match(/^([０-９\d]+)枚以下$/);
  if (m) return beatZone.length <= n(m[1]);
  m = condText.match(/^([０-９\d]+)枚以上$/);
  if (m) return beatZone.length >= n(m[1]);
  m = condText.match(/^([０-９\d]+)枚$/);
  if (m) return beatZone.length === n(m[1]);

  // レベルN以上がN枚以上: "レベル3以上が4枚以上"
  m = condText.match(/レベル([０-９\d]+)以上が([０-９\d]+)枚以上/);
  if (m) {
    const minLv = n(m[1]), minCount = n(m[2]);
    const count = beatZone.filter(num => {
      const lv = parseInt(cardMap.get(num)?.Level ?? '0', 10);
      return !isNaN(lv) && lv >= minLv;
    }).length;
    return count >= minCount;
  }

  // レベルN～Mが各1枚以上: "レベル1～4が各1枚以上"
  m = condText.match(/レベル([０-９\d]+)～([０-９\d]+)が各([０-９\d]+)枚以上/);
  if (m) {
    const from = n(m[1]), to = n(m[2]), each = n(m[3]);
    for (let lv = from; lv <= to; lv++) {
      const cnt = beatZone.filter(num => parseInt(cardMap.get(num)?.Level ?? '-1', 10) === lv).length;
      if (cnt < each) return false;
    }
    return true;
  }

  // レベルN、Mが各1枚以上: "レベル1、2が各1枚以上"
  m = condText.match(/レベル((?:[０-９\d]+[、,]?)+)が各([０-９\d]+)枚以上/);
  if (m) {
    const levels = m[1].split(/[、,]/).map(s => n(s.trim())).filter(v => !isNaN(v));
    const each = n(m[2]);
    return levels.every(lv => beatZone.filter(num => parseInt(cardMap.get(num)?.Level ?? '-1', 10) === lv).length >= each);
  }

  return false;
}

// ===== クロスシグニ状態計算 =====

function getZoneTopCardName(state: PlayerState, zoneIndex: number, cardMap: Map<string, CardData>): string | null {
  const stack = state.field.signi[zoneIndex];
  if (!stack || stack.length === 0) return null;
  return cardMap.get(stack[stack.length - 1])?.CardName ?? null;
}

function evaluateSingleCross(state: PlayerState, zoneIndex: number, text: string, cardMap: Map<string, CardData>): boolean {
  const m = text.match(/《([^》]+)》の([左右])/);
  if (!m) return false;
  // "の左" = このシグニはcardNameの左にいる → cardNameはzoneIndex+1にいる
  // "の右" = このシグニはcardNameの右にいる → cardNameはzoneIndex-1にいる
  const targetZone = m[2] === '左' ? zoneIndex + 1 : zoneIndex - 1;
  if (targetZone < 0 || targetZone > 2) return false;
  return getZoneTopCardName(state, targetZone, cardMap) === m[1];
}

function evaluateCrossCondition(state: PlayerState, zoneIndex: number, condText: string, cardMap: Map<string, CardData>): boolean {
  const text = condText.replace(/（[^）]*）/g, '').trim();

  if (text.includes('かつ')) {
    return text.split(/\s*かつ\s*/).every(part => evaluateSingleCross(state, zoneIndex, part.trim(), cardMap));
  }

  if (text.includes('か')) {
    // 形式1: 《X》の右か《Y》の左 - 各部分が独立した方向を持つ
    const explicitParts = text.match(/《[^》]+》の[左右]/g);
    if (explicitParts && explicitParts.length >= 2) {
      return explicitParts.some(part => evaluateSingleCross(state, zoneIndex, part, cardMap));
    }
    // 形式2: 《X》か《Y》の左 - 共通の方向
    const sharedM = text.match(/^((?:《[^》]+》か?)+)の([左右])$/);
    if (sharedM) {
      const names = [...sharedM[1].matchAll(/《([^》]+)》/g)].map(m => m[1]);
      const dir = sharedM[2];
      const targetZone = dir === '左' ? zoneIndex + 1 : zoneIndex - 1;
      if (targetZone < 0 || targetZone > 2) return false;
      const targetName = getZoneTopCardName(state, targetZone, cardMap);
      return names.some(n => targetName === n);
    }
  }

  return evaluateSingleCross(state, zoneIndex, text, cardMap);
}

export function collectCrossStates(playerState: PlayerState, cardMap: Map<string, CardData>): boolean[] {
  const result = [false, false, false];
  for (let z = 0; z < 3; z++) {
    const stack = playerState.field.signi[z];
    if (!stack || stack.length === 0) continue;
    const card = cardMap.get(stack[stack.length - 1]);
    if (!card?.hasCrossIcon || !card.crossConditionText) continue;
    result[z] = evaluateCrossCondition(playerState, z, card.crossConditionText, cardMap);
  }
  return result;
}

/**
 * 動的キーワード付与の収集（バッジ表示用）。
 * CONTINUOUS GRANT_KEYWORD で activeCondition が現在満たされている付与を、各シグニ instanceId 単位で集める。
 * - 「このシグニは【ランサー】を得る」型（count:1, owner:self, source=シグニ自身）＝ WD04-010 等の動的キーワード
 * - 「あなたの＜X＞のシグニはランサーを得る」型（count:ALL, owner:self/any/all, filter一致）＝ 場全体付与
 * keyword_grants（解決済み付与）とは別に、毎フレーム条件評価で変動する付与を表示するためのもの。
 * 戻り値: { [signiInstanceId]: keyword[] }。
 */
export function collectContinuousGrantedKeywords(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  effectivePowers?: Map<string, number>,
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const add = (num: string, kw: string) => {
    (result[num] ??= []);
    if (!result[num].includes(kw)) result[num].push(kw);
  };
  const signiTops: string[] = ownerState.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : []));
  const signiSet = new Set(signiTops);
  // 発生源: 自分の場のシグニ＋センタールリグ
  const sources: string[] = [...signiTops];
  const lrigTop = ownerState.field.lrig.at(-1);
  if (lrigTop) sources.push(lrigTop);
  for (const srcNum of sources) {
    for (const eff of effectsMap.get(srcNum) ?? []) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_KEYWORD') continue;
      const gk = eff.action as import('../types/effects').GrantKeywordAction;
      // 自分のシグニへの付与のみ（owner:opponent のデバフ系キーワードはバッジ対象外）。
      // 場全体付与は target.count === 'ALL' で表現されるため owner は self/any のみ対象（Owner型に 'all' は無い）。
      if (gk.target.owner !== 'self' && gk.target.owner !== 'any') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, srcNum, effectivePowers)) continue;
      const targetsAll = gk.target.count === 'ALL';
      for (const num of signiTops) {
        if (gk.target.filter && !matchesFilter(cardMap.get(num), gk.target.filter)) continue;
        // count:1（「このシグニ」想定）は発生源シグニ自身のみ。count:ALL は条件一致の全シグニ。
        if (!targetsAll && !(signiSet.has(srcNum) && num === srcNum)) continue;
        add(num, gk.keyword);
      }
    }
  }
  return result;
}

/**
 * COPY_LRIG_NAME_ABILITY (CONT): センタールリグに「ルリグトラッシュのルリグと同じカード名として扱う」
 * CONTINUOUS効果があれば、そのエイリアスカード名のリストを返す。
 * NOTE: 同ルリグの【自】能力コピーは未実装（名前エイリアスのみ対応）。
 */
/** すべてのルリグ名を持つことを示すセンチネル（LRIG_ALL_NAMES CONTINUOUS効果） */
export const LRIG_ALL_NAMES_SENTINEL = '__ALL_LRIG_NAMES__';

export function collectLrigNameAliases(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState?: PlayerState,
): string[] {
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const aliases: string[] = [];
  const lrigTop = ownerState.field.lrig.at(-1);
  if (!lrigTop) return aliases;

  const lrigCard = cardMap.get(lrigTop);

  for (const eff of (effectsMap.get(lrigTop) ?? [])) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const act = eff.action as import('../types/effects').StubAction;
    if (act.type !== 'STUB') continue;

    // LRIG_ALL_NAMES: 場にあるこのルリグはすべてのルリグのカード名を得る
    if (act.id === 'LRIG_ALL_NAMES') {
      if (!aliases.includes(LRIG_ALL_NAMES_SENTINEL)) aliases.push(LRIG_ALL_NAMES_SENTINEL);
      continue;
    }

    // INHERIT_OPP_LRIG_TYPE: 対戦相手のセンタールリグのタイプを追加で得る
    if (act.id === 'INHERIT_OPP_LRIG_TYPE' && otherState) {
      const oppLrigTop = otherState.field.lrig.at(-1);
      if (oppLrigTop) {
        const oppClass = cardMap.get(oppLrigTop)?.CardClass ?? '';
        for (const cls of oppClass.split(/[/／]/).map(c => c.trim()).filter(Boolean)) {
          if (!aliases.includes(cls)) aliases.push(cls);
        }
        // CardName にも追加（名前条件チェック用）
        const oppName = cardMap.get(oppLrigTop)?.CardName ?? '';
        if (oppName && !aliases.includes(oppName)) aliases.push(oppName);
      }
      continue;
    }

    // LRIG_LIMIT_UP_AND_COLOR_GAIN: ルリグが追加でタイプを得る（例：＜タウィル＞）
    if (act.id === 'LRIG_LIMIT_UP_AND_COLOR_GAIN') {
      const txt = lrigCard?.EffectText ?? '';
      const typeMatches = [...txt.matchAll(/追加で(?:[白赤青緑黒]と)?＜([^＞]+)＞を得る/g)];
      for (const m of typeMatches) {
        const t = m[1];
        if (t && !aliases.includes(t)) aliases.push(t);
      }
      continue;
    }

    if (act.id !== 'COPY_LRIG_NAME_ABILITY') continue;

    const txt = lrigCard?.EffectText ?? '';
    // "ルリグトラッシュにある(レベルNの)?＜ストーリー名＞と同じカード名"
    const m = txt.match(/ルリグトラッシュにある(?:レベル([０-９\d]+)の)?＜([^＞]+)＞(?:のルリグ)?と同じカード名/);
    if (!m) continue;

    const targetLevel = m[1] !== undefined ? parseInt(toHW(m[1])) : undefined;
    const storyName = m[2];

    const targetLrig = ownerState.lrig_trash.find(cn => {
      const c = cardMap.get(cn);
      if (!c) return false;
      if (targetLevel !== undefined && parseInt(c.Level ?? '0') !== targetLevel) return false;
      return c.CardClass?.includes(storyName) || c.Story?.includes(storyName) || c.CardName?.includes(storyName);
    });

    if (targetLrig) {
      const aliasName = cardMap.get(targetLrig)?.CardName;
      if (aliasName && !aliases.includes(aliasName)) aliases.push(aliasName);
    }
  }

  // key_piece の GAIN_ADDITIONAL_LRIG_TYPE: キー効果でルリグがタイプを得る
  const keyPiece = ownerState.field.key_piece;
  if (keyPiece) {
    for (const eff of (effectsMap.get(keyPiece) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'GAIN_ADDITIONAL_LRIG_TYPE') continue;
      const keyCard = cardMap.get(keyPiece);
      const txt = keyCard?.EffectText ?? '';
      // "センタールリグが＜タウィル＞か＜ウムル＞であるかぎり、それは追加で＜タウィル/ウムル＞を得る"
      const condM = [...txt.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]);
      // 条件クラス（最初のN個）と得るタイプ（最後の1個）を分離
      const gainM = txt.match(/追加で＜([^＞]+)＞を得る/);
      if (gainM) {
        const gainType = gainM[1];
        const condClasses = condM.filter(c => c !== gainType);
        const lrigClass = lrigCard?.CardClass ?? '';
        const lrigName = lrigCard?.CardName ?? '';
        const condMet = condClasses.length === 0 ||
          condClasses.some(c => lrigClass.includes(c) || lrigName.includes(c) || aliases.includes(c));
        if (condMet && !aliases.includes(gainType)) aliases.push(gainType);
      }
    }
  }

  // シグニフィールドのキー/ピース（key_piece 以外の場所に置かれている場合）
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'GAIN_ADDITIONAL_LRIG_TYPE') continue;
      const txt = cardMap.get(top)?.EffectText ?? '';
      const gainM = txt.match(/追加で＜([^＞]+)＞を得る/);
      if (gainM && !aliases.includes(gainM[1])) aliases.push(gainM[1]);
    }
  }

  // ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: ゲーム中全センタールリグが得たタイプ（PR-471等）
  for (const t of (ownerState.lrig_gained_types ?? [])) {
    if (!aliases.includes(t)) aliases.push(t);
  }

  return aliases;
}

/**
 * COPY_LRIG_NAME_ABILITY (CONT) 【自】能力コピー:
 * センタールリグの COPY_LRIG_NAME_ABILITY 効果が有効なとき、
 * ルリグトラッシュの該当ルリグの AUTO 効果を返す（ON_ATTACK_LRIG 等のトリガーに使用）。
 * effectId に "{centerTop}-COPY-" プレフィックスを付けて重複を防ぐ。
 */
export function collectCopiedLrigAutoEffects(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): import('../types/effects').CardEffect[] {
  const result: import('../types/effects').CardEffect[] = [];
  const centerTop = ownerState.field.lrig.at(-1);
  if (!centerTop) return result;
  const toHW2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  for (const eff of (effectsMap.get(centerTop) ?? [])) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const act = eff.action as import('../types/effects').StubAction;
    if (act.type !== 'STUB' || act.id !== 'COPY_LRIG_NAME_ABILITY') continue;
    if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, centerTop)) continue;

    const card = cardMap.get(centerTop);
    const txt = card?.EffectText ?? '';
    const m = txt.match(/ルリグトラッシュにある(?:レベル([０-９\d]+)の)?＜([^＞]+)＞(?:のルリグ)?と同じカード名/);
    if (!m) continue;

    const targetLevel = m[1] !== undefined ? parseInt(toHW2(m[1])) : undefined;
    const storyName = m[2];

    const targetLrig = ownerState.lrig_trash.find(cn => {
      const c = cardMap.get(cn);
      if (!c) return false;
      if (targetLevel !== undefined && parseInt(c.Level ?? '0') !== targetLevel) return false;
      return c.CardClass?.includes(storyName) || c.Story?.includes(storyName) || c.CardName?.includes(storyName);
    });
    if (!targetLrig) continue;

    for (const trashEff of (effectsMap.get(targetLrig) ?? [])) {
      if (trashEff.effectType !== 'AUTO') continue;
      result.push({ ...trashEff, effectId: `${centerTop}-COPY-${trashEff.effectId}` });
    }
  }
  return result;
}

/**
 * FIELD_ENERGY_SIGNI_GAIN_COLOR: フィールド上に「場とエナゾーンにあるシグニが追加で色を得る」
 * CONTINUOUS効果があれば、その色を得るシグニのインスタンスIDセットと得る色を返す。
 * フィルター付き（《ディソナアイコン》等）は識別子なしのためスキップ。
 */
export function collectFieldEnergySigniColorGains(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { gainColor: string; instIds: string[] }[] {
  const results: { gainColor: string; instIds: string[] }[] = [];
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);

  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'FIELD_ENERGY_SIGNI_GAIN_COLOR') continue;

      const card = cardMap.get(cn);
      const txt = card?.EffectText ?? '';
      // 得る色を解析: "追加で黒を得る"
      const colorM = txt.match(/追加で([白赤青緑黒])を得る/);
      if (!colorM) continue;
      const gainColor = colorM[1];

      // フィルター判定: 《ディソナアイコン》のシグニ → Story='Dissona' のシグニのみ対象
      const isDisonaFilter = /《ディソナアイコン》のシグニ/.test(txt);
      // その他の特殊アイコンフィルターは未対応のためスキップ
      if (/《[^》]+》のシグニ/.test(txt) && !isDisonaFilter) continue;

      const instIds: string[] = [];
      for (const stack of ownerState.field.signi) {
        const top = stack?.at(-1);
        if (!top) continue;
        if (isDisonaFilter && (cardMap.get(top)?.Story ?? '') !== 'Dissona') continue;
        instIds.push(top);
      }
      for (const instId of ownerState.energy) {
        const baseNum = instId.includes('#') ? instId.slice(0, instId.indexOf('#')) : instId;
        const signiCard = cardMap.get(baseNum);
        if (signiCard?.Type !== 'シグニ') continue;
        if (isDisonaFilter && (signiCard.Story ?? '') !== 'Dissona') continue;
        instIds.push(instId);
      }
      results.push({ gainColor, instIds });
    }
  }
  return results;
}

/**
 * HAND_SIGNI_HAS_GUARD_ICON: フィールドに「手札の特定シグニが【ガードアイコン】を持つ」
 * CONTINUOUS効果があれば、ガードに使えるシグニのクラスフィルター（nullは全シグニ）を返す。
 */
export function collectHandGuardIconClasses(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const classes: string[] = [];
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (state.field.key_piece) candidates.push(state.field.key_piece);

  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'HAND_SIGNI_HAS_GUARD_ICON') continue;
      const txt = cardMap.get(cn)?.EffectText ?? '';
      // "手札にある＜クラス＞のシグニは《ガードアイコン》を持つ"
      const m = txt.match(/手札にある＜([^＞]+)＞のシグニは《ガードアイコン》を持つ/);
      if (m) classes.push(m[1]);
    }
  }
  return classes;
}

/**
 * ALL_CLASS: フィールド上の「すべてのクラスを持つ」CONT効果を持つシグニのCardNumを返す。
 * matchesFilter で story フィルターにヒットさせるために利用する。
 * (条件付きのものは activeCondition で既にチェック済み)
 */
export function collectAllClassSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const result: string[] = [];
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ALL_CLASS') result.push(topNum);
    }
  }
  return result;
}

/**
 * ARTS_COST_REDUCTION_BY_COST_THRESHOLD: フィールドに「コストの合計がN以上のアーツを使用する場合
 * 使用コストが《色×M》減る」CONTINUOUS効果があれば、その条件と軽減量を返す。
 */
export function collectArtsThresholdCostReductions(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { minTotalCost: number; color: string; reduction: number }[] {
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const results: { minTotalCost: number; color: string; reduction: number }[] = [];
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (state.field.lrig.length > 0) candidates.push(state.field.lrig.at(-1)!);
  if (state.field.key_piece) candidates.push(state.field.key_piece);

  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'ARTS_COST_REDUCTION_BY_COST_THRESHOLD') continue;
      const txt = cardMap.get(cn)?.EffectText ?? '';
      // "コストの合計がN以上のアーツを使用する場合、使用コストは《色×M》減る"
      const m = txt.match(/コストの合計が([０-９\d]+)以上のアーツ.*?使用コストは《([白赤青緑黒無])×?([０-９\d]*)》?[１-９一]?つ?減る/);
      if (m) {
        const minTotal = parseInt(toHW(m[1]));
        const color = m[2];
        const reduction = m[3] ? parseInt(toHW(m[3])) : 1;
        if (!isNaN(minTotal) && !isNaN(reduction)) results.push({ minTotalCost: minTotal, color, reduction });
      }
    }
  }
  return results;
}

/**
 * OPP_LRIG_ATTACK_COST: フィールドに「相手ターン中、条件を満たす場合、対戦相手は《無》を支払わないかぎりルリグでアタックできない」
 * CONTINUOUS効果があれば、追加エナ枚数を返す。
 */
export function collectOppLrigAttackExtraCost(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): number {
  let extraCost = 0;
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);

  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'OPP_LRIG_ATTACK_COST') continue;
      const txt = cardMap.get(cn)?.EffectText ?? '';
      // "《無》《無》を支払わないかぎりルリグでアタックできない" → 2枚
      // "《無》を支払わないかぎりルリグでアタックできない" → 1枚
      const costM = (txt.match(/《無》/g) ?? []).length;
      if (costM > 0) extraCost = Math.max(extraCost, costM);
    }
  }
  return extraCost;
}

/**
 * CENTER_LRIG_COLOR_CHANGE_BLACK / LRIG_LIMIT_UP_AND_COLOR_GAIN / GAIN_LRIG_COLOR / LRIG_LIMIT_MODIFY:
 * フィールドにある常在効果によるルリグ色・リミット変更を収集する。
 * 返値: { extraColors: string[]; limitDelta: number }
 */
export function collectLrigColorAndLimitMods(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): { extraColors: string[]; limitDelta: number } {
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const extraColors = new Set<string>();
  let limitDelta = 0;
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  if (state.field.key_piece) candidates.push(state.field.key_piece);

  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, cn)) continue;

      // 直接型: LRIG_LIMIT_MODIFY で自分のリミットを変更
      if (eff.action.type === 'LRIG_LIMIT_MODIFY') {
        const lma = eff.action as import('../types/effects').LrigLimitModifyAction;
        if (lma.owner === 'self') limitDelta += lma.delta;
        continue;
      }

      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      const txt = cardMap.get(cn)?.EffectText ?? '';

      if (act.id === 'CENTER_LRIG_COLOR_CHANGE_BLACK') {
        extraColors.add('黒');
      }

      if (act.id === 'LRIG_LIMIT_UP_AND_COLOR_GAIN') {
        // "リミットはN増え、追加でXと＜ストーリー＞を得る"
        const limitM = txt.match(/リミットは([０-９\d]+)増え/);
        if (limitM) limitDelta += parseInt(toHW(limitM[1]));
        // 色の部分: "追加で白と" → 白
        const colorM = txt.match(/追加で([白赤青緑黒]+)と/);
        if (colorM) {
          for (const col of ['白','赤','青','緑','黒'].filter(c => colorM[1].includes(c))) {
            extraColors.add(col);
          }
        }
      }
    }
  }

  // 相手フィールドに CONTINUOUS LRIG_LIMIT_MODIFY owner:'opponent' があれば自分のリミットを修正
  const otherCandidates: string[] = [];
  for (const stack of otherState.field.signi) {
    const top = stack?.at(-1);
    if (top) otherCandidates.push(top);
  }
  for (const cn of otherCandidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'LRIG_LIMIT_MODIFY') continue;
      const lma = eff.action as import('../types/effects').LrigLimitModifyAction;
      if (lma.owner !== 'opponent') continue;
      if (!checkActiveCondition(eff.activeCondition, otherState, state, !isOwnerTurn, cardMap, cn)) continue;
      limitDelta += lma.delta;
    }
  }

  return { extraColors: [...extraColors], limitDelta };
}

/**
 * GAIN_LRIG_COLOR: フィールド上の「ルリグが持つ色を得る」CONT効果のシグニCardNumを返す。
 */
export function collectLrigColorInheritSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const result: string[] = [];
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'GAIN_LRIG_COLOR') result.push(topNum);
    }
  }
  return result;
}

/**
 * MULTI_ACCE_LIMIT: フィールド上の「このシグニには2枚まで【アクセ】を付けられる」CONT効果のシグニを返す。
 */
export function collectMultiAcceSigni(
  state: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const result: string[] = [];
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'MULTI_ACCE_LIMIT') result.push(topNum);
    }
  }
  return result;
}

/**
 * PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_BOUNCE_AND_DOWN_BY_OPP:
 * 対戦相手の効果によるダウンから保護されているシグニのCardNum一覧を返す。
 */
export function collectDownProtectedSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const protected_ = new Set<string>();

  // ソース候補: フィールド上のシグニ + センタールリグ
  const sourceCandidates: string[] = [];
  for (const stack of state.field.signi) {
    if (stack?.length) sourceCandidates.push(stack[stack.length - 1]);
  }
  if (state.field.lrig.length) sourceCandidates.push(state.field.lrig[state.field.lrig.length - 1]);

  for (const sourceNum of sourceCandidates) {
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum)) continue;

      // 実アクション: GRANT_PROTECTION with from: ['DOWN'] or ['any']
      if (eff.action.type === 'GRANT_PROTECTION') {
        const gp = eff.action as GrantProtectionAction;
        if (!gp.from?.includes('DOWN') && !gp.from?.includes('any')) continue;
        if (gp.subjectFilter) {
          // subjectFilter に一致する全シグニを保護
          for (const stack of state.field.signi) {
            if (!stack?.length) continue;
            const top = stack[stack.length - 1];
            if (matchesFilter(cardMap.get(top), gp.subjectFilter)) protected_.add(top);
          }
        } else if (gp.target) {
          // target: self count:1 → ソースシグニ自身を保護
          if ((gp.target.owner === 'self' || gp.target.owner === 'any') && gp.target.count === 1) {
            protected_.add(sourceNum);
          }
        }
        continue;
      }

      // 従来 STUB ベースの保護
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;

      if (act.id === 'PREVENT_SELF_DOWN_BY_OPP') {
        protected_.add(sourceNum);
      }

      if (act.id === 'PREVENT_SIGNI_DOWN_BY_OPP_ALL') {
        for (const stack of state.field.signi) {
          if (!stack || stack.length === 0) continue;
          const top = stack[stack.length - 1];
          if (top !== sourceNum) protected_.add(top);
        }
      }

      // WEAPON_SIGNI_PREVENT_DOWN: ウェポンシグニはダウンしない（全ウェポンを保護）
      if (act.id === 'WEAPON_SIGNI_PREVENT_DOWN') {
        for (const stack of state.field.signi) {
          if (!stack?.length) continue;
          const top = stack[stack.length - 1];
          if ((cardMap.get(top)?.CardClass ?? '').includes('ウェポン')) protected_.add(top);
        }
      }

      if (act.id === 'PREVENT_BOUNCE_AND_DOWN_BY_OPP') {
        const card = cardMap.get(sourceNum);
        const txt = card?.EffectText ?? '';
        const storyM = txt.match(/場に他の＜([^＞]+)＞のシグニがあるかぎり/);
        if (storyM) {
          const requiredStory = storyM[1];
          const hasOther = state.field.signi.some(s => {
            const top = s?.at(-1);
            if (!top || top === sourceNum) return false;
            return cardMap.get(top)?.CardClass?.includes(requiredStory);
          });
          if (hasOther) protected_.add(sourceNum);
        } else {
          protected_.add(sourceNum);
        }
      }
      // CONTINUOUS GRANT_ABILITY_INNER_TEXT: 「対戦相手の効果によってダウンしない」テキスト検出
      if (act.id === 'GRANT_ABILITY_INNER_TEXT') {
        const card = cardMap.get(sourceNum);
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        const qm = txt.match(/「([^」]+)」(?:の能力)?(?:を得る|として扱う)/);
        if (qm?.[1]?.match(/対戦相手の効果によってダウンしない/)) protected_.add(sourceNum);
      }
    }
  }
  // keyword_grants 経由のダウン保護（AUTO/ACTIVATED で付与）
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const top = stack[stack.length - 1];
    if (state.keyword_grants?.[top]?.includes('__down_protect__')) protected_.add(top);
  }
  return [...protected_];
}

/**
 * CONTINUOUS CHARM_PROTECTION（「あなたの＜悪魔＞のシグニがバニッシュされる場合、代わりにそのシグニの【チャーム】1枚をトラッシュに置いてもよい」WX04-052-E1）:
 * state（保護される側）のシグニのうち、(1) signiFilter に一致し、(2) チャームが付いている ものを「チャーム盾」対象として返す。
 * 呼び出し側（バニッシュ各経路）は、これらのシグニがバニッシュされる際にチャーム1枚をトラッシュして場に残す。
 */
export function collectCharmShieldSigni(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Set<string> {
  // この state にチャーム盾の CONTINUOUS 効果があるか（signiFilter を集める）
  const filters: (import('../types/effects').TargetFilter | undefined)[] = [];
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action?.type !== 'CHARM_PROTECTION') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, top)) continue;
      filters.push((eff.action as import('../types/effects').CharmProtectionAction).signiFilter);
    }
  }
  const shielded = new Set<string>();
  if (filters.length === 0) return shielded;
  state.field.signi.forEach((stack, zi) => {
    const top = stack?.at(-1);
    if (!top) return;
    const hasCharm = (state.field.signi_charms?.[zi] ?? null) !== null;
    if (!hasCharm) return; // チャームがなければ盾にできない
    if (filters.some(f => matchesFilter(cardMap.get(top), f))) shielded.add(top);
  });
  return shielded;
}

/**
 * CONTINUOUS GRANT_PROTECTION from=['BANISH'|'any'|'シグニ'|'ルリグ']: 対戦相手の効果バニッシュから保護されているシグニ番号を返す。
 * hasBanishResist の EffectText フォールバックは activeCondition を無視するため、effects.json 登録済みカードはここで評価する。
 */
export function collectBanishEffectProtectedSigni(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Set<string> {
  const protected_ = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const sourceNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum)) continue;
      if (eff.action.type !== 'GRANT_PROTECTION') continue;
      const gp = eff.action as import('../types/effects').GrantProtectionAction;
      if (gp.sourceOwner !== 'opponent') continue;
      if (!gp.from?.includes('BANISH') && !gp.from?.includes('any')) continue;
      if (gp.subjectFilter) {
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2 && matchesFilter(cardMap.get(top2), gp.subjectFilter)) protected_.add(top2);
        }
      } else if (gp.target?.owner === 'self' && gp.target?.count === 1) {
        protected_.add(sourceNum);
      } else if (gp.target?.owner === 'self' && gp.target?.count === 'ALL') {
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2) protected_.add(top2);
        }
      }
    }
  }
  // PREVENT_SELF_MOVE_BY_OPP: バニッシュも含む場移動禁止（STUB）
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const sn = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sn)) continue;
      const a = eff.action as import('../types/effects').StubAction;
      if (a.type === 'STUB' && a.id === 'PREVENT_SELF_MOVE_BY_OPP') protected_.add(sn);
    }
  }
  return protected_;
}

/**
 * collectEffectImmuneSigni: 「対戦相手の、ルリグ／シグニ（等）の効果を受けない」完全効果耐性を持つシグニを返す。
 * GRANT_PROTECTION の from に source-type トークン（ルリグ/シグニ/スペル/アーツ）または 'any'、もしくは
 * fromAll(+exceptSource) を持つCONT効果を対象とし、いま解決中の効果のソースカード種別 `sourceCardType` が
 * 耐性対象に該当する場合のみ、保護シグニを返す。
 *
 * 返り値は呼び出し側で各保護セット（バニッシュ/バウンス/ダウン/トラッシュ/能力消失/能力付与）に union する。
 * これにより「効果を受けない」を既存の個別保護パスへ一括反映し、対象種別（ルリグ/シグニ）のみを遮断する。
 *
 * - state:          保護対象プレイヤー（耐性シグニを持つ側）
 * - opponentState:  効果ソース側（= state の対戦相手）
 * - isOwnerTurn:    state 視点での自ターンか（activeCondition 評価用）
 * - sourceCardType: 解決中効果のソースカードの CardType（'シグニ'/'ルリグ'/'スペル'/'アーツ'/'アシストルリグ' 等）
 */
export function collectEffectImmuneSigni(
  state: PlayerState,
  opponentState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
  sourceCardType: string,
): Set<string> {
  const immune = new Set<string>();
  const srcType = sourceCardType ?? '';
  // アシストルリグも「ルリグ」の効果。レゾナはシグニ扱い。
  const srcIsLrig = srcType.includes('ルリグ');
  const srcIsSigni = srcType.includes('シグニ') || srcType.includes('レゾナ');
  const srcIsSpell = srcType.includes('スペル');
  const srcIsArts = srcType.includes('アーツ') || srcType.includes('ピース') || srcType.includes('キー');

  const sourceMatches = (from: string[] | undefined): boolean => {
    if (!from) return false;
    if (from.includes('any')) return true;
    if (srcIsLrig && from.includes('ルリグ')) return true;
    if (srcIsSigni && from.includes('シグニ')) return true;
    if (srcIsSpell && from.includes('スペル')) return true;
    if (srcIsArts && from.includes('アーツ')) return true;
    return false;
  };
  const exceptMatches = (ex: { sourceType: string } | undefined): boolean => {
    if (!ex) return false;
    return (ex.sourceType === 'ルリグ' && srcIsLrig)
      || (ex.sourceType === 'シグニ' && srcIsSigni)
      || (ex.sourceType === 'スペル' && srcIsSpell)
      || (ex.sourceType === 'アーツ' && srcIsArts);
  };

  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const sourceNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_PROTECTION') continue;
      if (!checkActiveCondition(eff.activeCondition, state, opponentState, isOwnerTurn, cardMap, sourceNum)) continue;
      const gp = eff.action as GrantProtectionAction;
      if (gp.sourceOwner && gp.sourceOwner !== 'opponent') continue;

      // この解決中のソース種別が耐性対象に含まれるか判定
      const blocked = gp.fromAll
        ? !exceptMatches(gp.exceptSource)
        : sourceMatches(gp.from);
      if (!blocked) continue;

      // 保護対象シグニを収集
      if (gp.subjectFilter) {
        const subjState = gp.subjectOwner === 'opponent' ? opponentState : state;
        for (const s2 of subjState.field.signi) {
          const top2 = s2?.at(-1);
          if (top2 && matchesFilter(cardMap.get(top2), gp.subjectFilter)) immune.add(top2);
        }
      } else if (gp.target) {
        // target ベース（一時付与でない CONT は稀）: self/any count:1 → このシグニ自身
        if ((gp.target.owner === 'self' || gp.target.owner === 'any')) immune.add(sourceNum);
      } else {
        immune.add(sourceNum);
      }
    }
  }

  // 一時付与（AUTO/ACTIVATED/スペル）の効果耐性: keyword_grants / keyword_grants_until_opp_turn の
  // 'PROTECTION:<種別>:<owner>' を読み、解決中ソース種別が該当する場の自シグニ／センタールリグを免疫に加える。
  // （WX04-064「あなたのセンタールリグとあなたのシグニはアーツの効果を受けない」UNTIL_OPP_TURN_END 等）
  const protMatches = (kw: string): boolean => {
    if (!kw.startsWith('PROTECTION:')) return false;
    const parts = kw.split(':');
    const ownerStr = parts[2] ?? '';
    if (ownerStr && ownerStr !== 'opponent') return false; // 相手効果からの保護のみ対象
    const fromList = (parts[1] ?? '').split(',').filter(Boolean);
    return fromList.includes('any') || sourceMatches(fromList);
  };
  for (const store of [state.keyword_grants, state.keyword_grants_until_opp_turn]) {
    if (!store) continue;
    for (const stack of state.field.signi) {
      const top = stack?.at(-1);
      if (top && (store[top] ?? []).some(protMatches)) immune.add(top);
    }
    const lrigTop = state.field.lrig?.at(-1);
    if (lrigTop && (store[lrigTop] ?? []).some(protMatches)) immune.add(lrigTop);
  }
  return immune;
}

/**
 * PREVENT_POWER_MINUS_BY_OPP: 対戦相手の効果によるパワーマイナスから保護されているシグニを返す。
 */
export function collectPowerProtectedSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const protected_ = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'PREVENT_POWER_MINUS_BY_OPP') {
        protected_.add(topNum);
      }
      // CONTINUOUS GRANT_ABILITY_INNER_TEXT: 「〜パワーは－されない」テキスト検出
      if (act.type === 'STUB' && act.id === 'GRANT_ABILITY_INNER_TEXT') {
        const card = cardMap.get(topNum);
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        const qm = txt.match(/「([^」]+)」(?:の能力)?(?:を得る|として扱う)/);
        if (qm?.[1]?.match(/対戦相手の効果によって.{0,15}パワーは?[－-]/)) protected_.add(topNum);
      }
    }
    // keyword_grants 経由のパワー弱体保護（AUTO/ACTIVATED で付与）
    if (state.keyword_grants?.[topNum]?.includes('__power_minus_protect__')) protected_.add(topNum);
  }
  return [...protected_];
}

/**
 * SIGNI_CANT_BOUNCE_FROM_FIELD: フィールドのシグニがバウンス（場→手札）から保護されているシグニを返す。
 * stateのフィールドに SIGNI_CANT_BOUNCE_FROM_FIELD STUB がある場合、
 * カードテキストのクラス（例：＜悪魔＞）に一致する全シグニを保護対象として返す。
 */
export function collectBounceProtectedSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const protected_ = new Set<string>();

  // ルリグ含む全候補
  const candidates: string[] = [];
  for (const stack of state.field.signi) {
    if (stack?.length) candidates.push(stack[stack.length - 1]);
  }
  if (state.field.lrig.length) candidates.push(state.field.lrig[state.field.lrig.length - 1]);

  for (const topNum of candidates) {
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;

      // GRANT_PROTECTION from=['BOUNCE'|'any']
      if (eff.action.type === 'GRANT_PROTECTION') {
        const gp = eff.action as GrantProtectionAction;
        if (gp.from?.includes('BOUNCE') || gp.from?.includes('any')) {
          if (gp.target?.count === 'ALL') {
            for (const s of state.field.signi) {
              if (!s?.length) continue;
              protected_.add(s[s.length - 1]);
            }
          } else if (gp.target?.count === 1) {
            if (gp.target.filter) {
              for (const s of state.field.signi) {
                if (!s?.length) continue;
                const sTop = s[s.length - 1];
                if (matchesFilter(cardMap.get(sTop), gp.target.filter)) protected_.add(sTop);
              }
            } else {
              protected_.add(topNum);
            }
          }
        }
        continue;
      }

      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;

      if (act.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD') {
        const card = cardMap.get(topNum);
        const txt = card?.EffectText ?? '';
        const classM = txt.match(/あなたの＜([^＞]+)＞のシグニは場から手札に戻らない/);
        const protectedClass = classM?.[1];
        for (const s of state.field.signi) {
          if (!s?.length) continue;
          const sTop = s[s.length - 1];
          if (!protectedClass || cardMap.get(sTop)?.CardClass?.includes(protectedClass)) {
            protected_.add(sTop);
          }
        }
      }

      // PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_SELF_MOVE_BY_OPP: このシグニ自身がバウンス不可
      if (act.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || act.id === 'PREVENT_SELF_MOVE_BY_OPP') {
        const inSigniField = state.field.signi.some(s => s?.at(-1) === topNum);
        if (inSigniField) protected_.add(topNum);
      }

      // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH: 同クラスの全シグニがバウンス不可
      if (act.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH') {
        const card = cardMap.get(topNum);
        const cls = card?.CardClass ?? '';
        // テキストから保護クラスを抽出（"あなたの＜宇宙＞のシグニを場から移動させない"）
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        const classM = txt.match(/あなたの＜([^＞]+)＞のシグニを場から移動させない/) ?? txt.match(/あなたの＜([^＞]+)＞/);
        const protectedClass = classM?.[1] ?? cls;
        for (const s of state.field.signi) {
          if (!s?.length) continue;
          const sTop = s[s.length - 1];
          if (cardMap.get(sTop)?.CardClass?.includes(protectedClass)) {
            protected_.add(sTop);
          }
        }
      }

      // SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: このシグニ自身がバウンス不可（エナへは移動可）
      if (act.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
        const inSigniField = state.field.signi.some(s => s?.at(-1) === topNum);
        if (inSigniField) protected_.add(topNum);
      }
    }
  }
  return [...protected_];
}

/**
 * PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH /
 * SIGNI_PROTECT_MOVE_EXCEPT_ENERGY:
 * 相手効果によってフィールドからトラッシュへ移動できないシグニを返す。
 */
export function collectTrashFieldProtectedSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const protected_ = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;

      if (act.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || act.id === 'PREVENT_SELF_MOVE_BY_OPP') {
        protected_.add(topNum);
      }

      if (act.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH') {
        const card = cardMap.get(topNum);
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        const classM = txt.match(/あなたの＜([^＞]+)＞のシグニを場から移動させない/) ?? txt.match(/あなたの＜([^＞]+)＞/);
        const protectedClass = classM?.[1] ?? (card?.CardClass ?? '');
        for (const s of state.field.signi) {
          if (!s?.length) continue;
          const sTop = s[s.length - 1];
          if (cardMap.get(sTop)?.CardClass?.includes(protectedClass)) protected_.add(sTop);
        }
      }

      // SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: エナ以外への移動不可（トラッシュも不可）
      if (act.id === 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY') {
        protected_.add(topNum);
      }
    }
  }
  return [...protected_];
}

/**
 * CONTINUOUS REMOVE_ABILITIES: stateのシグニのうち、能力を失っているシグニのCardNum集合を返す。
 * 自シグニのCONT(owner:'self')と相手シグニのCONT(owner:'opponent')の両方をスキャンする。
 * owner:'opponent', count:1 → 相手フィールド上の同ゾーンインデックスのシグニ（対面シグニ）を対象とする。
 */
export function collectContinuousAbilitiesRemovedSigni(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Set<string> {
  const removed = new Set<string>();
  const RemoveAbilitiesType = 'REMOVE_ABILITIES';

  // 自フィールドの CONTINUOUS REMOVE_ABILITIES(owner:'self') — 自分自身が能力を失う
  for (let zi = 0; zi < state.field.signi.length; zi++) {
    const stack = state.field.signi[zi];
    if (!stack?.length) continue;
    const sourceNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if ((eff.action as { type: string }).type !== RemoveAbilitiesType) continue;
      const act = eff.action as import('../types/effects').RemoveAbilitiesAction;
      if (act.target.owner !== 'self') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum)) continue;
      if (act.target.count === 1 || act.target.count === 'ALL') removed.add(sourceNum);
    }
  }

  // 相手フィールドの CONTINUOUS REMOVE_ABILITIES(owner:'opponent') — 対面シグニが能力を失う
  for (let zi = 0; zi < otherState.field.signi.length; zi++) {
    const stack = otherState.field.signi[zi];
    if (!stack?.length) continue;
    const sourceNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if ((eff.action as { type: string }).type !== RemoveAbilitiesType) continue;
      const act = eff.action as import('../types/effects').RemoveAbilitiesAction;
      if (act.target.owner !== 'opponent') continue;
      if (!checkActiveCondition(eff.activeCondition, otherState, state, !isOwnerTurn, cardMap, sourceNum)) continue;
      // count:1 は同ゾーン（対面）のシグニを対象とする
      if (act.target.count === 1) {
        const facing = state.field.signi[zi]?.at(-1);
        if (facing) removed.add(facing);
      } else if (act.target.count === 'ALL') {
        for (const s of state.field.signi) {
          const top = s?.at(-1);
          if (top) removed.add(top);
        }
      }
    }
  }

  return removed;
}

/**
 * PREVENT_OPP_SIGNI_ABILITY_GAIN / PREVENT_ABILITY_CHANGE_BY_OPP:
 * 相手効果によって能力を得られないシグニ番号を返す。
 * ownerState = 保護される側（自分）、otherState = 保護する効果を持つ側 or 効果を使う側
 * perspective: 'protect_opp' (相手シグニを保護, WX14-023) or 'protect_self' (自シグニを保護, WXEX2-49)
 */
export function collectAbilityGainProtectedSigni(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): string[] {
  const protected_ = new Set<string>();

  // otherState（相手）がPREVENT_OPP_SIGNI_ABILITY_GAIN CONTを持つ場合、ownerState（自分）の全シグニが対象
  const otherCands: string[] = [];
  for (const stack of otherState.field.signi) { if (stack?.length) otherCands.push(stack[stack.length - 1]); }
  if (otherState.field.lrig.length) otherCands.push(otherState.field.lrig[otherState.field.lrig.length - 1]);
  for (const cn of otherCands) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'PREVENT_OPP_SIGNI_ABILITY_GAIN') {
        for (const s of ownerState.field.signi) {
          const top = s?.at(-1); if (top) protected_.add(top);
        }
      }
    }
  }

  // ownerState（自分）がPREVENT_ABILITY_CHANGE_BY_OPP CONTを持つ場合、自分の対象クラスシグニが保護
  const selfCands: string[] = [];
  for (const stack of ownerState.field.signi) { if (stack?.length) selfCands.push(stack[stack.length - 1]); }
  for (const cn of selfCands) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'PREVENT_ABILITY_CHANGE_BY_OPP') {
        // テキストからクラスを抽出（"あなたの＜古代兵器＞のシグニは"）
        const txt = (cardMap.get(cn)?.EffectText ?? '');
        const classM = txt.match(/あなたの＜([^＞]+)＞のシグニは/);
        const protectedClass = classM?.[1] ?? '';
        for (const s of ownerState.field.signi) {
          const top = s?.at(-1);
          if (top && (!protectedClass || cardMap.get(top)?.CardClass?.includes(protectedClass))) {
            protected_.add(top);
          }
        }
      }
      // PREVENT_ABILITY_GAIN_BY_OPP: このシグニ自身が相手効果による能力付与を受けない
      if (act.type === 'STUB' && act.id === 'PREVENT_ABILITY_GAIN_BY_OPP') {
        protected_.add(cn);
      }
      // CONTINUOUS GRANT_ABILITY_INNER_TEXT: 「対戦相手の効果によって新たに能力を得られない」テキスト検出（シグニ自身）
      if (act.type === 'STUB' && act.id === 'GRANT_ABILITY_INNER_TEXT') {
        const card = cardMap.get(cn);
        const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
        const qm = txt.match(/「([^」]+)」(?:の能力)?(?:を得る|として扱う)/);
        if (qm?.[1]?.match(/対戦相手の効果によって新たに能力を得られない/)) protected_.add(cn);
      }
    }
  }
  // keyword_grants 経由の能力取得禁止（AUTO/ACTIVATED で付与）
  for (const s of ownerState.field.signi) {
    const top = s?.at(-1);
    if (top && ownerState.keyword_grants?.[top]?.includes('__ability_gain_block__')) protected_.add(top);
  }
  return [...protected_];
}

/**
 * PREVENT_INFECTED_SIGNI_ACTIVATE:
 * 感染状態（ウィルス数 > 0）のシグニのうち、相手の CONT 効果でアクティブ能力を使えないシグニを返す。
 */
export function collectInfectedActivateBlockedSigni(
  infectedState: PlayerState,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): string[] {
  // ownerState（相手）がPREVENT_INFECTED_SIGNI_ACTIVATEを持つかチェック
  let hasBlock = false;
  const ownerCands: string[] = [];
  for (const stack of ownerState.field.signi) { if (stack?.length) ownerCands.push(stack[stack.length - 1]); }
  for (const cn of ownerCands) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, infectedState, isOwnerTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'PREVENT_INFECTED_SIGNI_ACTIVATE') { hasBlock = true; break; }
    }
    if (hasBlock) break;
  }
  if (!hasBlock) return [];

  // 感染状態（virusCount > 0）のシグニを返す
  const virusCounts = infectedState.field.signi_virus ?? [0, 0, 0];
  const result: string[] = [];
  for (let zi = 0; zi < 3; zi++) {
    if ((virusCounts[zi] ?? 0) > 0) {
      const top = infectedState.field.signi[zi]?.at(-1);
      if (top) result.push(top);
    }
  }
  return result;
}

/**
 * PREVENT_OPP_POWER_PLUS:
 * 相手の CONT 効果によるシグニへの正パワー修正がブロックされているかを返す。
 * 返り値 true の場合、applyEffects で相手 CONT の正デルタをスキップ。
 * protectedState = 保護される側、opponentState = 保護効果を持つ側
 */
export function hasPowerPlusBlocked(
  protectedState: PlayerState,
  opponentState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isProtectedTurn: boolean,
): boolean {
  const cands: string[] = [];
  for (const stack of opponentState.field.signi) { if (stack?.length) cands.push(stack[stack.length - 1]); }
  for (const cn of cands) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, opponentState, protectedState, !isProtectedTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'PREVENT_OPP_POWER_PLUS') return true;
    }
  }
  return false;
}

/**
 * RISE_BANISH_SUBSTITUTE / BANISH_SUBSTITUTE_RISE_STACK:
 * このシグニがライズスタック（複数枚スタック）かつ、バニッシュ代替 CONT が有効かチェックする。
 * 有効であれば、バニッシュ時に下2枚をトラッシュしてバニッシュを回避できる。
 * stateがこのシグニのオーナー側（保護される側）。
 */
export function collectRiseBanishSubstituteSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  const result: string[] = [];
  for (let zi = 0; zi < state.field.signi.length; zi++) {
    const stack = state.field.signi[zi];
    if (!stack || stack.length < 2) continue; // ライズスタックのみ対象
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' &&
          (act.id === 'RISE_BANISH_SUBSTITUTE' || act.id === 'BANISH_SUBSTITUTE_RISE_STACK')) {
        result.push(topNum);
        break;
      }
    }
  }
  return result;
}

/**
 * バトルバニッシュの任意身代わり置換オプション（F-3）。defender がバトルでバニッシュされる victim を守る選択肢。
 *   - kind:'sacrifice' … 代わりに sacrificeNum をバニッシュ（victim は残る）
 *   - kind:'pay_cost'  … コスト（スペル捨て/下スペルトラッシュ）を払って victim を場に残す（誰もバニッシュしない）
 */
export type BanishSubstituteOption =
  | { kind: 'sacrifice'; sourceNum: string; sacrificeNum: string }
  | { kind: 'pay_cost'; sourceNum: string; costType: 'discardSpell' | 'trashStackSpell'; amount: number };

/**
 * BANISH_SUBSTITUTE (F-3): 防御側 state のシグニ victimNum がバニッシュされる場合に使える
 * 任意の身代わり置換オプションを列挙する純関数。バトルバニッシュ経路で対話適用する。
 *   STUB BANISH_SUBSTITUTE（犠牲型）:
 *     - self_sacrifice_other: victim 自身が持ち、別クラスの他シグニを犠牲にできる（WX12-024/WXEX2-60）
 *     - protect_other_sacrifice_self: 別シグニ(source)が持ち、victim が条件を満たすとき source 自身を犠牲（WX20-055/CP01-032/P10-052近似）
 *   action.type BANISH_SUBSTITUTE（コスト払い型）:
 *     - discardSpell N: source が持ち、手札からスペルN枚を捨てて victim を残す（WX10-033=自身限定／trigger.filter.thisCardOnly）
 *     - trashStackSpell N: source の下からスペルN枚をトラッシュして victim を残す（WX11-029=任意の自シグニ）
 * isOwnerTurn=victim オーナーのターンか（バトルでは常に false=相手ターン）。
 */
export function collectBanishSubstitutes(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  victimNum: string,
): BanishSubstituteOption[] {
  const result: BanishSubstituteOption[] = [];
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  const isSpell = (n: string) => cardMap.get(baseNum(n))?.Type === 'スペル';
  const tops: string[] = [];
  const stackOf = new Map<string, string[]>();
  for (const stack of state.field.signi) {
    const t = stack?.at(-1);
    if (t) { tops.push(t); stackOf.set(t, stack!); }
  }
  const victimCard = cardMap.get(baseNum(victimNum));
  const hasRiseIcon = (n: string) => (cardMap.get(baseNum(n))?.EffectText ?? '').includes('【ライズ】');

  for (const sourceNum of tops) {
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as any; // STUB（犠牲型）or BanishSubstituteAction（コスト型）

      // ── 犠牲型（STUB BANISH_SUBSTITUTE + banishSubstitute）──
      if (act.type === 'STUB' && act.id === 'BANISH_SUBSTITUTE' && act.banishSubstitute) {
        const bs = act.banishSubstitute;
        if (bs.oppTurnOnly && isOwnerTurn) continue;
        if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum)) continue;
        if (bs.pattern === 'self_sacrifice_other') {
          if (sourceNum !== victimNum) continue;
          for (const n of tops) {
            if (n === victimNum) continue; // 「他の」シグニ
            if (bs.sacrificeClass && !(cardMap.get(baseNum(n))?.CardClass ?? '').includes(bs.sacrificeClass)) continue;
            result.push({ kind: 'sacrifice', sourceNum, sacrificeNum: n });
          }
        } else if (bs.pattern === 'protect_other_sacrifice_self') {
          if (sourceNum === victimNum) continue;
          if (bs.victimFilter === 'riseIcon' && !hasRiseIcon(victimNum)) continue;
          if (!victimCard) continue;
          result.push({ kind: 'sacrifice', sourceNum, sacrificeNum: sourceNum });
        }
        continue;
      }

      // ── コスト払い型（action.type BANISH_SUBSTITUTE）──
      if (act.type === 'BANISH_SUBSTITUTE' && act.substituteCost) {
        if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum)) continue;
        // trigger フィルタ: thisCardOnly なら victim=source のみ。それ以外は自分の任意シグニ。
        const tf = act.trigger?.filter ?? {};
        if (tf.thisCardOnly && sourceNum !== victimNum) continue;
        if (tf.story && !(victimCard?.CardClass ?? '').includes(tf.story)) continue;
        if (tf.excludeSelf && victimNum === sourceNum) continue;
        const cost = act.substituteCost;
        if (cost.discardSpell) {
          const spellsInHand = state.hand.filter(isSpell).length;
          if (spellsInHand >= cost.discardSpell) result.push({ kind: 'pay_cost', sourceNum, costType: 'discardSpell', amount: cost.discardSpell });
        } else if (cost.trashStackSpell) {
          const under = (stackOf.get(sourceNum) ?? []).slice(0, -1); // 下のカード（トップ以外）
          if (under.filter(isSpell).length >= cost.trashStackSpell) result.push({ kind: 'pay_cost', sourceNum, costType: 'trashStackSpell', amount: cost.trashStackSpell });
        }
        // powerReduction（WX06-019）は「効果による場離れ」トリガーでバトル外のため未対応
        continue;
      }
    }
  }
  return result;
}

/**
 * ALL_ZONE_BLACK: effectsMap 中のすべてのカードを走査し、
 * CONTINUOUS STUB 'ALL_ZONE_BLACK' を持つカードの CardNum 集合を返す。
 * これらのカードはすべての領域（手札・エナ・トラッシュ等）で黒でもある。
 */
export function collectAllZoneBlackCardNums(
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): Set<string> {
  const result = new Set<string>();
  for (const [cardNum, effs] of effectsMap) {
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ALL_ZONE_BLACK') { result.add(cardNum); break; }
    }
  }
  return result;
}

/**
 * ALL_COLOR: フィールド上のシグニが ALL_COLOR CONTINUOUS 効果を持ち、かつ条件（トラッシュ内の種類数）を満たすなら
 * そのシグニ CardNum のセットを返す。これらのシグニはすべての色を持つ。
 */
export function collectAllColorSigni(
  ownerState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Set<string> {
  const result = new Set<string>();
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    const effs = effectsMap.get(top) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'ALL_COLOR') continue;
      const txt = (cardMap.get(top)?.EffectText ?? '') + ' ' + (cardMap.get(top)?.BurstText ?? '');
      const reqM = txt.match(/([０-９\d]+)種類以上/);
      const required = reqM ? parseInt(toHW(reqM[1])) : 10;
      const nameFilterM = txt.match(/カード名に《([^》]+)》を含む/);
      const nameFilter = nameFilterM?.[1] ?? '';
      const distinctNames = new Set(ownerState.trash.filter(cn => {
        const c = cardMap.get(cn);
        if (!c || c.Type !== 'シグニ') return false;
        return !nameFilter || (c.CardName ?? '').includes(nameFilter);
      }).map(cn => cardMap.get(cn)?.CardName ?? cn));
      if (distinctNames.size >= required) result.add(top);
    }
  }
  return result;
}

/**
 * GRANT_FIELD_SIGNI_ABILITY（【レイヤー】の《レイヤーアイコン》能力付与等）:
 * 場のシグニが持つ CONTINUOUS の GRANT_FIELD_SIGNI_ABILITY 宣言を読み、
 * フィルタに合う自分の場のシグニ全員（付与元自身を含む）へ abilities を付与する。
 * 同型の付与元が複数あればそれぞれ別ソースとして重複付与される（ルール通り）。
 * Returns: signiInstanceId → 追加 CardEffect[] のマップ
 */
export function collectGrantedFromLayer(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, CardEffect[]> {
  const result = new Map<string, CardEffect[]>();
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  type GrantAction = import('../types/effects').GrantFieldSigniAbilityAction;

  // 1) 場のシグニから付与宣言を収集（付与先オーナーごとに分ける）
  const selfGrants: GrantAction[] = [];   // targetOwner 省略/self: 自分の場へ付与
  const oppGrants: GrantAction[] = [];    // targetOwner:'opponent': 対戦相手の場へ付与
  for (let zi = 0; zi < 3; zi++) {
    const top = ownerState.field.signi[zi]?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_FIELD_SIGNI_ABILITY') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, top)) continue;
      const g = eff.action as GrantAction;
      (g.targetOwner === 'opponent' ? oppGrants : selfGrants).push(g);
    }
  }
  if (selfGrants.length === 0 && oppGrants.length === 0) return result;

  // 2) フィルタに合う付与先の場のシグニへ付与
  const apply = (grants: GrantAction[], tgtState: PlayerState) => {
    if (grants.length === 0) return;
    for (let zi = 0; zi < 3; zi++) {
      const top = tgtState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const card = cardMap.get(baseNum(top));
      for (const g of grants) {
        if (g.filter && !matchesFilter(card, g.filter)) continue;
        result.set(top, [...(result.get(top) ?? []), ...g.abilities]);
      }
    }
  };
  apply(selfGrants, ownerState);
  apply(oppGrants, otherState);
  return result;
}

/**
 * GRANT_ACCE_HOST_ABILITY:
 * 【アクセ】として付いているカードが持つ CONTINUOUS の GRANT_ACCE_HOST_ABILITY 宣言を読み、
 * フィルタに合うホストシグニ（アクセが付いているシグニ）へ abilities を付与する。
 * Returns: hostSigniInstanceId → 追加 CardEffect[] のマップ
 */
export function collectGrantedFromAcce(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, CardEffect[]> {
  const result = new Map<string, CardEffect[]>();
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  type GrantAcce = import('../types/effects').GrantAcceHostAbilityAction;
  for (let zi = 0; zi < 3; zi++) {
    const acceNum = (ownerState.field.signi_acce ?? [])[zi] ?? null;
    if (!acceNum) continue;
    const hostTop = ownerState.field.signi[zi]?.at(-1);
    if (!hostTop) continue;
    const hostCard = cardMap.get(baseNum(hostTop));
    for (const eff of (effectsMap.get(acceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_ACCE_HOST_ABILITY') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, acceNum)) continue;
      const g = eff.action as GrantAcce;
      if (g.filter && !matchesFilter(hostCard, g.filter)) continue;
      result.set(hostTop, [...(result.get(hostTop) ?? []), ...g.abilities]);
    }
  }
  return result;
}

/**
 * GRANT_SOUL_HOST_ABILITY:
 * 【ソウル】として付いているカードが持つ CONTINUOUS の GRANT_SOUL_HOST_ABILITY 宣言を読み、
 * フィルタに合うホストシグニ（ソウルが付いているシグニ）へ abilities を付与する。
 * Returns: hostSigniInstanceId → 追加 CardEffect[] のマップ
 */
export function collectGrantedFromSoul(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, CardEffect[]> {
  const result = new Map<string, CardEffect[]>();
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  type GrantSoul = import('../types/effects').GrantSoulHostAbilityAction;
  for (let zi = 0; zi < 3; zi++) {
    const soulNum = (ownerState.field.signi_soul ?? [])[zi] ?? null;
    if (!soulNum) continue;
    const hostTop = ownerState.field.signi[zi]?.at(-1);
    if (!hostTop) continue;
    const hostCard = cardMap.get(baseNum(hostTop));
    for (const eff of (effectsMap.get(soulNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_SOUL_HOST_ABILITY') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, soulNum)) continue;
      const g = eff.action as GrantSoul;
      if (g.filter && !matchesFilter(hostCard, g.filter)) continue;
      result.set(hostTop, [...(result.get(hostTop) ?? []), ...g.abilities]);
    }
  }
  return result;
}

/**
 * GRANT_UNDER_SIGNI_* / GRANT_SIGNI_ABOVE_ABILITY:
 * スタック（ライズ状態）シグニ間の CONTINUOUS 能力付与を収集する。
 * - トップシグニが GRANT_UNDER_SIGNI_* スタブを持つ → 下のカードの効果をトップに付与
 * - 下のカードが GRANT_SIGNI_ABOVE_ABILITY アクションを持つ → 指定効果をトップに付与
 * Returns: topSigniInstanceId → 追加 CardEffect[] のマップ
 */
export function collectGrantedFromUnderSigni(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): Map<string, CardEffect[]> {
  const result = new Map<string, CardEffect[]>();
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  for (let zi = 0; zi < 3; zi++) {
    const stack = ownerState.field.signi[zi];
    if (!stack || stack.length < 2) continue;

    const topNum = stack[stack.length - 1];
    const underNums = stack.slice(0, -1);
    const topBaseNum = topNum.includes('#') ? topNum.slice(0, topNum.indexOf('#')) : topNum;
    const topCard = cardMap.get(topBaseNum);
    const txt = (topCard?.EffectText ?? '') + ' ' + (topCard?.BurstText ?? '');

    // Pattern A: トップシグニの CONTINUOUS スタブ → 下のカードから効果を収集
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topNum)) continue;
      if (eff.action.type !== 'STUB') continue;
      const stub = eff.action as import('../types/effects').StubAction;

      // GRANT_UNDER_SIGNI_ALL_ABILITIES: 下シグニの全効果（常/自/起）を付与
      if (stub.id === 'GRANT_UNDER_SIGNI_ALL_ABILITIES') {
        const excludeM = txt.match(/《([^》]+)》以外の/);
        const excludeName = excludeM?.[1];
        const classM = txt.match(/＜([^＞]+)＞のシグニの/);
        const reqClass = classM?.[1];
        const grantCont = txt.includes('【常】');
        const grantAuto = txt.includes('【自】');
        const grantAct  = txt.includes('【起】');
        for (const un of underNums) {
          const unBase = un.includes('#') ? un.slice(0, un.indexOf('#')) : un;
          const unCard = cardMap.get(unBase);
          if (!unCard) continue;
          if (excludeName && unCard.CardName === excludeName) continue;
          if (reqClass && !(unCard.CardClass ?? '').includes(reqClass)) continue;
          const extra = (effectsMap.get(un) ?? []).filter(e => {
            if (grantCont && e.effectType === 'CONTINUOUS') return true;
            if (grantAuto && e.effectType === 'AUTO') return true;
            if (grantAct  && e.effectType === 'ACTIVATED') return true;
            return false;
          });
          const existing = result.get(topNum) ?? [];
          result.set(topNum, [...existing, ...extra]);
        }
      }

      // GRANT_UNDER_SIGNI_CONSTANT_ABILITY: 下シグニの CONTINUOUS 効果を付与
      if (stub.id === 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY') {
        const eichiOnly = txt.includes('【英知】');
        for (const un of underNums) {
          const unBase = un.includes('#') ? un.slice(0, un.indexOf('#')) : un;
          const extra = (effectsMap.get(unBase) ?? []).filter(e => {
            if (e.effectType !== 'CONTINUOUS') return false;
            if (eichiOnly && e.activeCondition?.type !== 'EICHI_LEVEL_SUM') return false;
            return true;
          });
          const existing = result.get(topNum) ?? [];
          result.set(topNum, [...existing, ...extra]);
        }
      }

      // GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE: 下シグニの AUTO 効果を付与（フィルタあり）
      if (stub.id === 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE') {
        const lvM = txt.match(/レベル([０-９\d]+)以下/);
        const maxLv = lvM ? parseInt(toHW(lvM[1])) : undefined;
        const colorM = txt.match(/(黒|赤|青|緑|白)の＜/);
        const reqColor = colorM?.[1];
        const classM2 = txt.match(/(?:黒|赤|青|緑|白)の＜([^＞]+)＞/);
        const reqClass2 = classM2?.[1];
        for (const un of underNums) {
          const unBase = un.includes('#') ? un.slice(0, un.indexOf('#')) : un;
          const unCard = cardMap.get(unBase);
          if (!unCard) continue;
          if (maxLv !== undefined && parseInt(unCard.Level ?? '0') > maxLv) continue;
          if (reqColor && !unCard.Color?.includes(reqColor)) continue;
          if (reqClass2 && !(unCard.CardClass ?? '').includes(reqClass2)) continue;
          const extra = (effectsMap.get(unBase) ?? []).filter(e => e.effectType === 'AUTO');
          const existing = result.get(topNum) ?? [];
          result.set(topNum, [...existing, ...extra]);
        }
      }
    }

    // Pattern B: 下のカードが GRANT_SIGNI_ABOVE_ABILITY → トップに指定効果を付与
    for (const un of underNums) {
      const unBase = un.includes('#') ? un.slice(0, un.indexOf('#')) : un;
      for (const eff of (effectsMap.get(unBase) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (eff.action.type !== 'GRANT_SIGNI_ABOVE_ABILITY') continue;
        const gsa = eff.action as GrantSigniAboveAbilityAction;
        if (gsa.filter && !matchesFilter(topCard, gsa.filter)) continue;
        const existing = result.get(topNum) ?? [];
        result.set(topNum, [...existing, ...gsa.abilities]);
      }
    }
  }

  return result;
}

/**
 * ALL_CARDS_COLOR_CHANGE_BLACK: フィールド上のシグニが ALL_CARDS_COLOR_CHANGE_BLACK CONTINUOUS 効果を
 * 持ちアクティブであれば true を返す。そのプレイヤーのすべてのカードは黒でもある。
 */
export function hasAllCardsColorBlack(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): boolean {
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'ALL_CARDS_COLOR_CHANGE_BLACK') continue;
      if (checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, top)) return true;
    }
  }
  return false;
}

/**
 * OPP_ZONE_PLACEMENT_RESTRICT (CONTINUOUS): 相手が中央ゾーンに配置できないシグニの最低レベルを返す。
 * opponentState = このCONTINUOUSを持つプレイヤーの状態（制限を受ける側の「相手」）
 * 戻り値: 制限レベル下限（このレベル以上を中央ゾーンに配置不可）または undefined
 */
export function collectCenterZoneDeployRestrict(
  opponentState: PlayerState,
  myState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOpponentTurn: boolean,
): number | undefined {
  const candidates: string[] = [
    ...opponentState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []),
    ...(opponentState.field.lrig?.at(-1) ? [opponentState.field.lrig.at(-1)!] : []),
  ];
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, opponentState, myState, isOpponentTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'OPP_ZONE_PLACEMENT_RESTRICT') continue;
      return 3;
    }
  }
  return undefined;
}

/**
 * FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM / FROZEN_SIGNI_TO_TRASH_ON_LEAVE:
 * フィールド上のCONT効果を検査し、凍結シグニバニッシュの置換先を返す。
 * - frozenBanishToDeckBottom: 凍結シグニのバニッシュ先をデッキ下に変更（state自身のCONT）
 * - frozenLeaveToTrash: 相手の凍結シグニが場を離れる場合トラッシュへ（stateが持つ攻撃側CONT）
 */
export function collectFrozenBanishOverrides(
  state: PlayerState,
  _cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { frozenBanishToDeckBottom: boolean; frozenLeaveToTrash: boolean } {
  let frozenBanishToDeckBottom = false;
  let frozenLeaveToTrash = false;
  const candidates: string[] = [
    ...state.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []),
    ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
    ...(state.field.key_piece ? [state.field.key_piece] : []),
  ];
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      if (act.id === 'FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM') frozenBanishToDeckBottom = true;
      if (act.id === 'FROZEN_SIGNI_TO_TRASH_ON_LEAVE') frozenLeaveToTrash = true;
    }
  }
  return { frozenBanishToDeckBottom, frozenLeaveToTrash };
}

/**
 * ACCE_COST_REDUCTION: フィールド上にACCE_COST_REDUCTION効果を持つシグニがある場合、
 * アクセ取り付けコストの緑エナを1枚減らす。
 * ownerState のフィールドを走査して軽減量（緑色N枚分）を返す。
 */
export function collectAcceCostReduction(
  ownerState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): number {
  let reduction = 0;
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ACCE_COST_REDUCTION') reduction += 1;
    }
  }
  return reduction;
}

/**
 * FIRST_SPELL_COST_UP: 各ターン、対戦相手が最初に使用するスペルの使用コストを《無×N》増加。
 * opponentState のフィールドを走査して合計増加量を返す。
 * 呼び出し側で ownerState.actions_done に 'USE_SPELL' がなければ適用する。
 */
export function collectFirstSpellCostUp(
  opponentState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): number {
  const candidates: string[] = [
    ...opponentState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []),
    ...(opponentState.field.lrig.at(-1) ? [opponentState.field.lrig.at(-1)!] : []),
    ...(opponentState.field.key_piece ? [opponentState.field.key_piece] : []),
  ];
  let extra = 0;
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'FIRST_SPELL_COST_UP') extra += 1;
    }
  }
  return extra;
}

/**
 * INCREASE_ACT_ABILITY_COST: 相手ターン中（= 自分のターン中）、
 * 対戦相手（= 自分）のセンタールリグとシグニの【起】能力の使用コストを《無×N》増加。
 * opponentState（カード所有者 = 相手）のフィールドを走査して合計増加量を返す。
 * isMyTurn=true（自分のターン中）のときのみ適用。
 */
export function collectIncreaseActCost(
  opponentState: PlayerState,
  isMyTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): number {
  if (!isMyTurn) return 0; // カードの「相手ターン」条件 = 自分のターン中のみ
  const candidates: string[] = [
    ...opponentState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []),
    ...(opponentState.field.lrig.at(-1) ? [opponentState.field.lrig.at(-1)!] : []),
    ...(opponentState.field.key_piece ? [opponentState.field.key_piece] : []),
  ];
  // lrig_opp_act_cost_plus: GRANT_ABILITY_INNER_TEXT で付与されたコスト増加
  let extra = opponentState.lrig_opp_act_cost_plus ?? 0;
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'INCREASE_ACT_ABILITY_COST') extra += 1;
    }
  }
  return extra;
}

/**
 * ALL_COLOR / ALL_ZONE_BLACK / ACCE_SIGNI_ALL_COLOR / INHERIT_UNDER_SIGNI_COLOR:
 * フィールド上のシグニで「すべての色を持つ（色フィルターをバイパスできる）」シグニのCardNum集合を返す。
 * BattleScreenがExecCtxのallColorSigniNumsに渡すことで、effectExecutor/execStubのfieldCandidatesに反映。
 */
export function collectAllColorSigniForField(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  _otherState: PlayerState,
  _isOwnerTurn: boolean,
): Set<string> {
  const result = new Set<string>();

  // ALL_COLOR CONT: 条件付き全色（collectAllColorSigniと同ロジック）
  const allColorSigni = collectAllColorSigni(state, effectsMap, cardMap);
  for (const cn of allColorSigni) result.add(cn);

  // ALL_ZONE_BLACK CONT: このシグニはすべての領域で黒でもある（フィールドでも黒として扱う）
  // → 黒シグニ候補扱いだが「すべての色」ではない。フィールドフィルターでは黒として扱えばよい
  // （完全全色ではなく黒追加なので別扱い。ここでは all-color バイパスには含めない）

  // story_overrides 'ALL_COLOR': ACCE_SIGNI_ALL_COLOR で既にセット済み
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top && state.story_overrides?.[top] === 'ALL_COLOR') result.add(top);
  }

  // INHERIT_UNDER_SIGNI_COLOR: スタック下の天使シグニの色を得る（色は固定ではないので全色バイパスではない）
  // → 特定色継承のため here では all-color バイパスに含めない（色条件に応じた別処理が必要）

  return result;
}

/**
 * collectAllZoneBlackSigniColors:
 * ALL_ZONE_BLACK CONTを持つカードのCardNumと黒マッピングを返す（フィールド上）。
 * シグニの色として'黒'を追加すべき対象を返す。
 */
export function collectFieldSigniExtraColors(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): Map<string, string[]> {
  const result = new Map<string, string[]>();

  for (let zi = 0; zi < state.field.signi.length; zi++) {
    const stack = state.field.signi[zi];
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    const extraColors: string[] = [];

    // ALL_ZONE_BLACK: すべての領域で黒でもある
    const allZoneBlack = [...(effectsMap.get(topNum) ?? [])].some(eff => {
      if (eff.effectType !== 'CONTINUOUS') return false;
      const act = eff.action as import('../types/effects').StubAction;
      return act.type === 'STUB' && act.id === 'ALL_ZONE_BLACK';
    });
    if (allZoneBlack) extraColors.push('黒');

    // GAIN_LRIG_COLOR: ルリグの色を得る
    const hasGainLrigColor = [...(effectsMap.get(topNum) ?? [])].some(eff => {
      if (eff.effectType !== 'CONTINUOUS') return false;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) return false;
      const act = eff.action as import('../types/effects').StubAction;
      return act.type === 'STUB' && act.id === 'GAIN_LRIG_COLOR';
    });
    if (hasGainLrigColor) {
      const lrigTop = state.field.lrig.at(-1);
      if (lrigTop) {
        const lrigColor = cardMap.get(lrigTop)?.Color ?? '';
        // ルリグの色をすべて追加（Color列は「黒青」のような連結形式のため1文字ずつ分解）
        for (const c of [...lrigColor].filter(s => '白赤青緑黒'.includes(s))) {
          // lrig_extra_colors も含める
          if (!extraColors.includes(c)) extraColors.push(c);
        }
        for (const c of (state.lrig_extra_colors ?? [])) {
          if (!extraColors.includes(c)) extraColors.push(c);
        }
      }
    }

    // INHERIT_UNDER_SIGNI_COLOR: スタック下の天使シグニの色を得る
    const hasInheritUnder = [...(effectsMap.get(topNum) ?? [])].some(eff => {
      if (eff.effectType !== 'CONTINUOUS') return false;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) return false;
      const act = eff.action as import('../types/effects').StubAction;
      return act.type === 'STUB' && act.id === 'INHERIT_UNDER_SIGNI_COLOR';
    });
    if (hasInheritUnder && stack.length > 1) {
      // スタック下のカード（天使）の色を得る
      const card = cardMap.get(topNum);
      const txt = card?.EffectText ?? '';
      const classM = txt.match(/この下にある＜([^＞]+)＞のシグニが持つ色を得る/);
      const targetClass = classM?.[1] ?? '';
      for (const underCn of stack.slice(0, -1)) {
        const underCard = cardMap.get(underCn);
        if (!targetClass || (underCard?.CardClass ?? '').includes(targetClass)) {
          const underColor = underCard?.Color ?? '';
          // Color列は連結形式のため1文字ずつ分解
          for (const c of [...underColor].filter(s => '白赤青緑黒'.includes(s))) {
            if (!extraColors.includes(c)) extraColors.push(c);
          }
        }
      }
    }

    if (extraColors.length > 0) result.set(topNum, extraColors);
  }

  // FORCE_COLOR_BLACK: いずれかのプレイヤーのルリグがこの効果を持つ場合、フィールド全シグニに黒を追加
  const hasForcedBlack = [...(state.field.lrig ?? []), ...(otherState.field.lrig ?? [])].some(lrigCn => {
    return (effectsMap.get(lrigCn) ?? []).some(eff => {
      if (eff.effectType !== 'CONTINUOUS') return false;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || (act.id !== 'FORCE_COLOR_BLACK' && act.id !== 'CHANGE_ALL_SIGNI_COLOR_TO_BLACK')) return false;
      return checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, lrigCn);
    });
  });
  if (hasForcedBlack) {
    for (const stack of state.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      const existing = result.get(top) ?? [];
      if (!existing.includes('黒')) { existing.push('黒'); result.set(top, existing); }
    }
  }

  // CARDS_OUTSIDE_ENERGY_BECOME_WHITE: フィールド上のシグニに白色を追加（エナゾーン以外→白の全ゾーン実装）
  const hasOutsideEnergyWhite = state.field.signi.some(stack => {
    const top = stack?.at(-1);
    return top && (effectsMap.get(top) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'CARDS_OUTSIDE_ENERGY_BECOME_WHITE',
    );
  });
  if (hasOutsideEnergyWhite) {
    for (const stack of state.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      const existing = result.get(top) ?? [];
      if (!existing.includes('白')) { existing.push('白'); result.set(top, existing); }
    }
    // 手札・トラッシュのカードにも白色を付与（CARDS_OUTSIDE_ENERGY_BECOME_WHITE完全実装）
    for (const cn of [...state.hand, ...state.trash]) {
      const existing = result.get(cn) ?? [];
      if (!existing.includes('白')) { existing.push('白'); result.set(cn, existing); }
    }
  }

  // FIELD_ENERGY_SIGNI_GAIN_COLOR: フィールド上のシグニが「場とエナゾーンにあるシグニは追加でX色を得る」を持つ場合
  // fieldSigniExtraColors に対象フィールドシグニ分を追加する
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'FIELD_ENERGY_SIGNI_GAIN_COLOR') continue;
      const card = cardMap.get(top);
      const txt = card?.EffectText ?? '';
      const colorM = txt.match(/追加で([白赤青緑黒])を得る/);
      if (!colorM) continue;
      const gainColor = colorM[1];
      const isDisonaFilter = /《ディソナアイコン》のシグニ/.test(txt);
      // フィールドの全シグニに追加色を付与（フィルタ付きは条件チェック）
      for (const targetStack of state.field.signi) {
        const t = targetStack?.at(-1);
        if (!t) continue;
        if (isDisonaFilter && (cardMap.get(t)?.Story ?? '') !== 'Dissona') continue;
        const existing = result.get(t) ?? [];
        if (!existing.includes(gainColor)) { existing.push(gainColor); result.set(t, existing); }
      }
    }
  }

  return result;
}

/**
 * collectAltAttackFlipSigni: WXDi-P05-069 翠将　リトルジョン
 * フィールドに「特定シグニがアタックする場合、代わりにシグニを裏向きにしてアタック」
 * CONTINUOUS GRANT_ABILITY_INNER_TEXT があれば、対象シグニ名と最大フリ��プ数を返す。
 */
export function collectAltAttackFlipSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { targetSigniName: string; maxFlip: number } | null {
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'GRANT_ABILITY_INNER_TEXT') continue;
      const card = cardMap.get(top);
      const txt = card?.EffectText ?? '';
      // 「あなたの《X》は「...シグニをN体まで裏向きにしてアタック...」を得る」
      const targetM = txt.match(/あなたの《([^》]+)》は「.*あなたのシグニを([０-９\d]+)体まで裏向きにしてアタック/);
      if (targetM) {
        const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        return { targetSigniName: targetM[1], maxFlip: parseInt(toHW(targetM[2])) || 2 };
      }
    }
  }
  return null;
}

/**
 * GROW_COST_SUBSTITUTE_TRASH_SIGNI: グロウコストの特定色を、エナゾーンから指定クラスのシグニをトラッシュする代替コストで支払える。
 * ownerState のフィールドを走査して代替情報を返す。
 * @returns { substituteColor: string; signiClass: string } | null
 */
export function collectGrowCostSubstitute(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { substituteColor: string; signiClass: string; sourceCardNum: string } | null {
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'GROW_COST_SUBSTITUTE_TRASH_SIGNI') continue;
      const card = cardMap.get(top);
      if (!card) continue;
      const txt = card.EffectText ?? '';
      // 「《白》を支払う際、代わりにあなたのエナゾーンから＜美巧＞のシグニ１枚をトラッシュに置いてもよい」
      const colorM = txt.match(/《([白赤青緑黒無])》を支払う際、代わりに.*エナゾーンから＜([^＞]+)＞のシグニ/);
      if (colorM) {
        return { substituteColor: colorM[1], signiClass: colorM[2], sourceCardNum: top };
      }
    }
  }
  return null;
}

/**
 * GUARD_ALTERNATIVE_COST: ガード時に《ガードアイコン》を持つカードを捨てる代わりに
 * エナゾーンから指定クラスのシグニ1枚をトラッシュに置いてもよい。
 * @returns { signiClass: string; sourceCardNum: string } | null
 */
export function collectGuardAlternativeCost(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { signiClass: string; sourceCardNum: string } | null {
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'GUARD_ALTERNATIVE_COST') continue;
      const card = cardMap.get(top);
      if (!card) continue;
      const txt = card.EffectText ?? '';
      // 「《ガードアイコン》を持つカードを１枚捨てる代わりにあなたのエナゾーンから＜植物＞のシグニ１枚をトラッシュ」
      const classM = txt.match(/代わりにあなたのエナゾーンから＜([^＞]+)＞のシグニ/);
      if (classM) {
        return { signiClass: classM[1], sourceCardNum: top };
      }
    }
  }
  return null;
}

/**
 * ADD_RESONANCE_CONDITION: ルリグデッキのレゾナに追加でアタックフェイズタイミング要件を付与。
 * ownerState のフィールドを走査してフラグを返す。
 */
export function collectResonanceExtraAttackPhaseCondition(
  ownerState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): boolean {
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ADD_RESONANCE_CONDITION') return true;
    }
  }
  return false;
}

/**
 * OPP_TRASH_LOSE_COLOR_AND_CLASS: 自ターン中、相手トラッシュのカードは色とクラスを失う。
 * ownerState のフィールドを走査してフラグを返す（isOwnerTurn チェックは呼び出し側で行う）。
 */
export function collectOppTrashLoseColorClass(
  ownerState: PlayerState,
  otherState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  isOwnerTurn: boolean,
): boolean {
  if (!isOwnerTurn) return false;
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, top)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'OPP_TRASH_LOSE_COLOR_AND_CLASS') return true;
    }
  }
  return false;
}

/**
 * LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: デッキ/手札/トラッシュにあるカードがLv4として扱われるかチェック。
 * @returns Set of CardNum values that are treated as level 4
 */
export function collectLevelRefOverridesFromNonField(
  ownerState: PlayerState,
  _cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): Set<string> {
  const result = new Set<string>();
  const allNonField = [...ownerState.hand, ...ownerState.deck, ...ownerState.trash];
  for (const cn of allNonField) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT') {
        result.add(cn);
      }
    }
  }
  return result;
}

// TREAT_AS_LEVEL1_IN_DECK_TRASH: デッキ/トラッシュでレベル1シグニとして扱うカードのSetを収集
export function collectDeckTrashLevel1Nums(
  ownerState: PlayerState,
  otherState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): Set<string> {
  const result = new Set<string>();
  for (const state of [ownerState, otherState]) {
    for (const cn of [...state.deck, ...state.trash]) {
      if (result.has(cn)) continue;
      for (const eff of (effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type === 'STUB' && act.id === 'TREAT_AS_LEVEL1_IN_DECK_TRASH') {
          result.add(cn);
          break;
        }
      }
    }
  }
  return result;
}

// TREAT_AS_CLASS_ALL_ZONES: 全ゾーンで特定クラスとして扱うカードのマップを収集
export function collectTreatAsClassAllZones(
  ownerState: PlayerState,
  otherState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const classRe = /すべての領域で＜(.+?)＞として扱う/;
  for (const state of [ownerState, otherState]) {
    const allZones = [
      ...state.field.signi.flatMap(s => s ?? []),
      ...state.field.lrig,
      ...state.hand,
      ...state.trash,
      ...state.energy,
      ...state.deck,
      ...(state.lrig_trash ?? []),
      ...(state.lrig_deck ?? []),
      ...state.life_cloth,
    ];
    for (const cn of allZones) {
      if (result[cn]) continue;
      for (const eff of (effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type !== 'STUB' || act.id !== 'TREAT_AS_CLASS_ALL_ZONES') continue;
        const card = cardMap.get(cn);
        const text = card?.EffectText ?? '';
        const m = classRe.exec(text);
        if (m) { result[cn] = m[1]; break; }
      }
    }
  }
  return result;
}

// DECLARE_ZONE_FOR_CLASS_CHANGE: 指定領域にある相手シグニをクラス/色なし＋精元として扱うcardMapを生成
// ownerState=効果を受ける側(カード検索を行う側), otherState=WX14-032を持つ側
export function applyDeclaredZoneClassOverride(
  cardMap: Map<string, CardData>,
  ownerState: PlayerState,
  otherState: PlayerState,
): Map<string, CardData> {
  const decls = otherState.declared_class_zones ?? [];
  if (decls.length === 0) return cardMap;
  const affectedNums = new Set<string>();
  for (const decl of decls) {
    const onField = otherState.field.signi.some(s => s?.includes(decl.sourceCardNum));
    if (!onField) continue;
    let pool: string[];
    switch (decl.zone) {
      case 'deck':  pool = ownerState.deck; break;
      case 'hand':  pool = ownerState.hand; break;
      case 'signi': pool = ownerState.field.signi.flatMap(s => s ?? []); break;
      case 'trash': pool = ownerState.trash; break;
      default: pool = [];
    }
    for (const cn of pool) {
      if (cardMap.get(cn)?.Type === 'シグニ') affectedNums.add(cn);
    }
  }
  if (affectedNums.size === 0) return cardMap;
  const newMap = new Map(cardMap);
  for (const cn of affectedNums) {
    const card = cardMap.get(cn);
    if (card) newMap.set(cn, { ...card, CardClass: '精元', Color: '' });
  }
  return newMap;
}

/**
 * CONTINUOUS SET_BASE_LEVEL（「このシグニの基本レベルはNになる」WX04-049-E1）を cardMap に反映する。
 * 両プレイヤーの場のシグニを走査し、条件を満たす効果元シグニの Level を上書きした cardMap を返す。
 * cardMap の Level を直接上書きするため、matchesFilter のレベルフィルタ等すべてのレベル参照に反映される。
 */
export function applyContinuousBaseLevelOverride(
  cardMap: Map<string, CardData>,
  ownerState: PlayerState,
  otherState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): Map<string, CardData> {
  const overrides: { cn: string; level: number }[] = [];
  const scan = (state: PlayerState, opp: PlayerState, myTurn: boolean) => {
    for (const stack of state.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      for (const eff of (effectsMap.get(top) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (eff.action?.type !== 'SET_BASE_LEVEL') continue;
        if (!checkActiveCondition(eff.activeCondition, state, opp, myTurn, cardMap, top)) continue;
        overrides.push({ cn: top, level: (eff.action as import('../types/effects').SetBaseLevelAction).value });
      }
    }
  };
  scan(ownerState, otherState, isOwnerTurn);
  scan(otherState, ownerState, !isOwnerTurn);
  if (overrides.length === 0) return cardMap;
  const newMap = new Map(cardMap);
  for (const { cn, level } of overrides) {
    const card = newMap.get(cn);
    if (card) newMap.set(cn, { ...card, Level: String(level) });
  }
  return newMap;
}
