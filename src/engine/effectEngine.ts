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
  PowerSetAction,
  CostIncreaseAction,
  BlockActionAction,
  TargetFilter,
  EnergyCost,
  GrantLrigAbilityAction,
  ConditionalAction,
  Condition,
  GrantProtectionAction,
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
      return targets.some(num => matchesFilter(cardMap.get(num), cond.filter));
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

    case 'AND':
      return cond.conditions.every(c => checkActiveCondition(c, ownerState, otherState, isOwnerTurn, cardMap, sourceCardNum, effectivePowers));
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
    const pw = parseInt(cardData.Power ?? '', 10);
    if (filter.powerRange.min !== undefined && pw < filter.powerRange.min) return false;
    if (filter.powerRange.max !== undefined && pw > filter.powerRange.max) return false;
  }
  if (filter.story) {
    const stories = Array.isArray(filter.story) ? filter.story : [filter.story];
    if (!stories.some(s => cardData.CardClass?.includes(s))) return false;
  }
  return true;
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
    case 'HAS_CARD_IN_FIELD': {
      return st(cond.owner).field.signi.some(stack => {
        if (!stack?.length) return false;
        const top = stack[stack.length - 1];
        if (cond.excludeSelf && sourceCardNum && top === sourceCardNum) return false;
        return matchesFilter(cardMap.get(top), cond.filter);
      });
    }
    case 'TRASH_HAS_CARD': {
      return st(cond.owner).trash.some(n => matchesFilter(cardMap.get(n), cond.filter));
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
    case 'AND':
      return cond.conditions.every(c => evalConditionForContinuous(c, ownerState, otherState, cardMap, sourceCardNum));
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
        // "エナゾーンにあるシグニ/スペルNにつき+Y"
        const mDelta = txt.match(/につき.*?＋([１-９\d]+)/);
        const delta = mDelta ? parseInt(toHW(mDelta[1])) : 1;
        const mType = txt.match(/エナゾーンにある(シグニ|スペル)/);
        const energyCount = ownerState.energy.filter(cn => {
          if (!mType) return true;
          return cardMap.get(cn)?.Type === (mType[1] === 'シグニ' ? 'シグニ' : 'スペル');
        }).length;
        levelMods.set(topNum, baseLv + energyCount * delta);
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
      const base = parseInt(card?.Power ?? '', 10);
      if (!isNaN(base)) powers.set(topNum, base);
    }
  };
  collectBase(myState);
  collectBase(opState);

  // フィールド上のすべてのカードの CONTINUOUS POWER_MODIFY を適用
  const applyEffects = (ownerState: PlayerState, otherState: PlayerState, isOwnerTurn: boolean) => {
    // PREVENT_POWER_MINUS_BY_OPP: 相手効果による負のパワー修正を無効化するシグニ
    const otherPowerProtected = new Set<string>();
    for (const stack of otherState.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap, topNum)) continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type === 'STUB' && act.id === 'PREVENT_POWER_MINUS_BY_OPP') otherPowerProtected.add(topNum);
      }
    }

    // DOUBLE_POWER_MINUS: 自分のフィールドにこの効果があれば相手シグニへの負デルタを2倍にする
    const hasDoublePowerMinus = ownerState.field.signi.some(stack => {
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

      // クロス状態を一度だけ計算（crossOnly効果の判定用）
      let crossStatesCache: boolean[] | null = null;
      const getCrossStates = () => {
        if (!crossStatesCache) crossStatesCache = collectCrossStates(ownerState, cardMap);
        return crossStatesCache;
      };

      for (const effect of effects) {
        if (effect.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topNum, powers)) continue;
        // クロスのみ有効な効果: このシグニのゾーンがクロス状態でなければスキップ
        if (effect.crossOnly) {
          const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === topNum || s?.includes(topNum));
          if (zoneIdx === -1 || !getCrossStates()[zoneIdx]) continue;
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
              for (const stack of ownerState.field.signi) {
                if (!stack || stack.length === 0) continue;
                const num = stack[stack.length - 1];
                if (!powers.has(num)) continue;
                if (!matchesFilter(cardMap.get(num), s.target.filter)) continue;
                powers.set(num, value);
              }
            }
            if (s.target.owner === 'opponent' || s.target.owner === 'any') {
              for (const stack of otherState.field.signi) {
                if (!stack || stack.length === 0) continue;
                const num = stack[stack.length - 1];
                if (!powers.has(num)) continue;
                if (!matchesFilter(cardMap.get(num), s.target.filter)) continue;
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
            applyDeltaToState(otherState, delta, target.filter, cardMap, powers, otherPowerProtected, hasDoublePowerMinus ? 2 : 1);
          }
        }

        // CONDITIONAL + POWER_MODIFY: 条件付きパワー修正（条件を評価して適用）
        if (effect.action.type === 'CONDITIONAL') {
          const condAct = effect.action as ConditionalAction;
          const condMet = evalConditionForContinuous(condAct.condition, ownerState, otherState, cardMap, topNum);
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
                  applyDeltaToState(otherState, delta, target.filter, cardMap, powers, otherPowerProtected, hasDoublePowerMinus ? 2 : 1);
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
            const mult = tgtState === otherState && hasDoublePowerMinus ? 2 : 1;
            applyDeltaToState(tgtState, delta, mod.target.filter, cardMap, powers, prot, mult);
          } else if (powers.has(topNum)) {
            powers.set(topNum, (powers.get(topNum) ?? 0) + delta);
          }
        }

        // POWER_MODIFY_PER_TRASH_COUNT: トラッシュ枚数に比例したパワー増減（常時）
        const perTrashMods = extractPowerModifiesPerTrashCount(effect.action);
        for (const mod of perTrashMods) {
          const countTrash = (st: PlayerState) => {
            const cards = st.trash;
            if (mod.countByVariety) {
              const names = new Set(cards.map(n => cardMap.get(n)?.CardClass ?? n)
                .filter((_, i) => !mod.countFilter || matchesFilter(cardMap.get(cards[i]), mod.countFilter)));
              return names.size;
            }
            return cards.filter(n => !mod.countFilter || matchesFilter(cardMap.get(n), mod.countFilter)).length;
          };
          const count = mod.trashOwner === 'both'
            ? countTrash(ownerState) + countTrash(otherState)
            : countTrash(mod.trashOwner === 'self' ? ownerState : otherState);
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
  const applyTempMods = (state: PlayerState) => {
    const doublers = state.double_power_minus_targets ?? [];
    for (const mod of state.temp_power_mods ?? []) {
      if (powers.has(mod.cardNum)) {
        // DOUBLE_OWN_POWER_MINUS: 特定シグニへの負デルタを2倍に
        const delta = mod.delta < 0 && doublers.includes(mod.cardNum) ? mod.delta * 2 : mod.delta;
        powers.set(mod.cardNum, (powers.get(mod.cardNum) ?? 0) + delta);
      }
    }
  };
  applyTempMods(myState);
  applyTempMods(opState);

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
    if (!powers.has(topNum)) continue;
    // PREVENT_POWER_MINUS_BY_OPP: 相手効果による負のパワー修正を無効化
    if (effectiveDelta < 0 && powerProtectedNums?.has(topNum)) continue;
    // isArmored フィルタのゾーン状態チェック
    if (filter?.isArmored !== undefined) {
      const isArmored = state.field.signi_armor?.[zoneIdx] ?? false;
      if (filter.isArmored !== isArmored) continue;
    }
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

  return granted;
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
      if (act.type !== 'STUB' || act.id !== 'LIMIT_OPP_DRAW_COUNT') continue;
      // activeCondition チェック (レベル≥3 等)
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, opponentState, opponentState, isMyTurn, cardMap, cn)) continue;
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
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'PREVENT_ZONE_MOVE_BY_OPP') continue;
      const card = cardMap.get(cn);
      const txt = (card?.EffectText ?? '') + ' ' + (card?.BurstText ?? '');
      if (txt.includes('エナゾーン') && txt.includes('トラッシュに移動しない')) result.add('energy');
      if (txt.includes('手札') && txt.includes('トラッシュに移動しない')) result.add('hand');
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
 * FORCE_TARGET_SELF: フィールドのシグニが「相手ターンに可能ならば自分を対象にさせる」CONTINUOUS効果を持つ場合、
 * そのシグニのCardNumセットを返す（相手ターン中にアクティブなもの）。
 */
export function collectForcedTargets(
  state: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): string[] {
  if (isOwnerTurn) return []; // 自分のターン中はFORCE_TARGET_SELFは無効
  const result: string[] = [];
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
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
      if (act.type !== 'STUB' || act.id !== 'OPP_GUARD_COST_COLORLESS') continue;
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

  return Math.max(0, limit);
}

/**
 * PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 対戦相手の効果による能力消失を防ぐシグニを返す。
 * state のフィールド上に PREVENT_SIGNI_ABILITY_LOSS_BY_OPP CONT 効果があれば、
 * 保護対象の他シグニ（同色）の CardNum セットを返す。
 */
export function collectAbilityProtectedSigni(
  state: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn?: boolean,
): string[] {
  const protectedNums = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
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
): string[] {
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const aliases: string[] = [];
  const lrigTop = ownerState.field.lrig.at(-1);
  if (!lrigTop) return aliases;

  for (const eff of (effectsMap.get(lrigTop) ?? [])) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const act = eff.action as import('../types/effects').StubAction;
    if (act.type !== 'STUB') continue;

    // LRIG_ALL_NAMES: 場にあるこのルリグはすべてのルリグのカード名を得る
    if (act.id === 'LRIG_ALL_NAMES') {
      if (!aliases.includes(LRIG_ALL_NAMES_SENTINEL)) aliases.push(LRIG_ALL_NAMES_SENTINEL);
      continue;
    }

    if (act.id !== 'COPY_LRIG_NAME_ABILITY') continue;

    const card = cardMap.get(lrigTop);
    const txt = card?.EffectText ?? '';
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
      // 《ディソナアイコン》など識別不可なフィルターはスキップ
      if (/《[^》]+》のシグニ/.test(txt)) continue;
      // 得る色を解析: "追加で黒を得る"
      const colorM = txt.match(/追加で([白赤青緑黒])を得る/);
      if (!colorM) continue;
      const gainColor = colorM[1];

      const instIds: string[] = [];
      for (const stack of ownerState.field.signi) {
        const top = stack?.at(-1);
        if (top) instIds.push(top);
      }
      for (const instId of ownerState.energy) {
        const baseNum = instId.includes('#') ? instId.slice(0, instId.indexOf('#')) : instId;
        if (cardMap.get(baseNum)?.Type === 'シグニ') instIds.push(instId);
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
 * CENTER_LRIG_COLOR_CHANGE_BLACK / LRIG_LIMIT_UP_AND_COLOR_GAIN / GAIN_LRIG_COLOR:
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

      // 実アクション: GRANT_PROTECTION with from: ['DOWN']
      if (eff.action.type === 'GRANT_PROTECTION') {
        const gp = eff.action as GrantProtectionAction;
        if (!gp.from.includes('DOWN')) continue;
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
    }
  }
  return [...protected_];
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
    }
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
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'SIGNI_CANT_BOUNCE_FROM_FIELD') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
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
  }
  return [...protected_];
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
