import type { PlayerState, CardData, TurnPhase, FieldGrant } from '../types';
import type {
  CardEffect,
  ActiveCondition,
  CompareOp,
  EffectAction,
  PowerModifyAction,
  PowerModifyPerStackAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLevelSumAction,
  PowerModifyPerLrigLevelAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyPerDeckCountAction,
  PowerModifyPerVirusCountAction,
  PowerModifyPerEnergyColorAction,
  PowerModifyPerOwnColorAction,
  PowerModifyPerEnergyAction,
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
import { hasKeyword, isKeywordAbilityRemoved } from '../utils/keywords';
import { acceCardsAt, allAcceCards, hasAcceAt } from '../utils/acce';
import { normalizeFieldGrants } from '../utils/fieldGrants';
import { abilityBlockTextOf, parseCardEffects } from '../data/effectParser';
// ルリグタイプの「印刷＋追加で得た分」は growLogic 側に funnel がある（グロウ互換／使用制限と同じ1本）。
import { activeGainedLrigTypes } from '../screens/battle/growLogic';

const splitFieldColors = (color: string | undefined): string[] => color ? [...color].filter(c => '白赤青緑黒'.includes(c)) : [];
const splitFieldClasses = (cardClass: string | undefined): string[] =>
  (cardClass ?? '').split(/[・/]/).map(c => c.trim()).filter(Boolean);
function fieldLrigsShareColor(state: PlayerState, minCount: number, cardMap: Map<string, CardData>): boolean {
  const nums = [state.field.lrig.at(-1), state.field.assist_lrig_l?.at(-1), state.field.assist_lrig_r?.at(-1)]
    .filter((n): n is string => !!n);
  const sets = nums.map(n => new Set(splitFieldColors(cardMap.get(n)?.Color)));
  const choose = (start: number, picked: Set<string>[]): boolean => {
    if (picked.length === minCount) {
      const common = new Set(picked[0] ?? []);
      for (const colors of picked.slice(1)) for (const c of common) if (!colors.has(c)) common.delete(c);
      return common.size > 0;
    }
    for (let i = start; i < sets.length; i++) if (choose(i + 1, [...picked, sets[i]])) return true;
    return false;
  };
  return minCount > 0 && sets.length >= minCount && choose(0, []);
}

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
  turnPhase?: TurnPhase,
  // 実効レベル（`calcSigniLevels`）。`effectivePowers` と同じ扱いで、**渡さないと表記レベルへ
  // フォールバック**する（動的レベル札は一生 false＝過小実行。タスク12(cxii) と同じ罠）。
  effectiveLevels?: Map<string, number>,
): boolean {
  if (!cond) return true;
  const compare = (a: number, op: CompareOp, b: number): boolean => {
    switch (op) {
      case 'gte': return a >= b; case 'lte': return a <= b;
      case 'gt': return a > b; case 'lt': return a < b;
      case 'eq': return a === b; case 'neq': return a !== b;
    }
    return false;
  };
  switch (cond.type) {
    case 'OR':
      return cond.conditions.some(c => checkActiveCondition(c, ownerState, otherState, isOwnerTurn, cardMap, sourceCardNum, effectivePowers, oppTrashColorLoss, turnPhase, effectiveLevels));
    case 'TURN_OWNER':
      return cond.owner === 'self' ? isOwnerTurn : !isOwnerTurn;

    // §6.3「正面」サブ機構(d): 効果元シグニの正面（相手ゾーン 2-zi）を条件にする。
    // ⚠facing は engine 共通規約の **2 - zi**（`resolveFrontOfSelfCardNum`／バトルの `opZone = 2 - attackZone` と同じ）。
    case 'FRONT_SIGNI': {
      if (!sourceCardNum) return false;
      const ziF = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      if (ziF < 0) return false;
      const frontZi = 2 - ziF;
      const frontNum = otherState.field.signi[frontZi]?.at(-1);
      if (!frontNum) return false; // 正面が空＝条件不成立（no-op）
      const baseF = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
      const frontCard = cardMap.get(baseF(frontNum));
      if (cond.filter && (!matchesFilter(frontCard, cond.filter) || !matchesStateFilter(otherState, frontZi, cond.filter))) return false;
      if (cond.compareToSelf) {
        const selfCard = cardMap.get(baseF(sourceCardNum));
        const valOf = (num: string, card: CardData | undefined): number => cond.compareToSelf!.key === 'level'
          ? (parseInt(card?.Level ?? '', 10) || 0)
          : (effectivePowers?.get(num) ?? (parseInt((card?.Power ?? '').replace(/[^0-9]/g, ''), 10) || 0));
        const lhs = valOf(frontNum, frontCard);   // 正面シグニ側
        const rhs = valOf(sourceCardNum, selfCard); // 効果元（このシグニ）側
        const op = cond.compareToSelf.operator;
        if (!(op === 'gt' ? lhs > rhs : op === 'gte' ? lhs >= rhs
          : op === 'lt' ? lhs < rhs : op === 'lte' ? lhs <= rhs : lhs === rhs)) return false;
      }
      return true;
    }
    case 'NO_COMMON_COLOR_AMONG_FIELD_SIGNI': {
      const signi = ownerState.field.signi
        .map(stack => stack?.at(-1))
        .filter((cardNum): cardNum is string => !!cardNum);
      if (signi.length === 0) return false;
      if (cond.count !== undefined && signi.length !== cond.count) return false;
      const colorSets = signi.map(cardNum => new Set(splitFieldColors(cardMap.get(cardNum)?.Color)));
      const common = new Set(colorSets[0]);
      for (const colors of colorSets.slice(1)) {
        for (const color of common) if (!colors.has(color)) common.delete(color);
      }
      return common.size === 0;
    }
    case 'FIELD_LRIGS_SHARE_COLOR':
      return fieldLrigsShareColor(cond.owner === 'opponent' ? otherState : ownerState, cond.minCount, cardMap);

    // Condition 側（`evalCondition`）と同形。ActiveCondition の union には昔からあったが
    // ここに case が無く**無条件 true へフォールスルー**していた（live 使用0件の潜在穴・タスク12(cxv)）。
    case 'FIELD_LRIGS_HAVE_COLORS': {
      const flf = (cond.owner === 'opponent' ? otherState : ownerState).field;
      const flNums = [flf.lrig.at(-1), flf.assist_lrig_l?.at(-1), flf.assist_lrig_r?.at(-1)]
        .filter((n): n is string => !!n);
      return cond.colors.every(color =>
        flNums.some(n => splitFieldColors(cardMap.get(n)?.Color).includes(color)));
    }

    case 'DURING_ATTACK_PHASE': {
      // 「[あなたの/対戦相手の]アタックフェイズの間、」有効な常在効果。turnPhase を渡さない呼び出し元では
      // 従来どおり true（過小実行を避ける＝主用途 calcFieldPowers 以外は phase を持たない）。
      if (turnPhase === undefined) return true;
      const inAttack = turnPhase === 'ATTACK_ARTS' || turnPhase === 'ATTACK_ARTS_OP'
        || turnPhase === 'ATTACK_SIGNI' || turnPhase === 'ATTACK_LRIG';
      if (!inAttack) return false;
      if (cond.owner === 'self') return isOwnerTurn;      // あなたのアタックフェイズ＝効果所有者のターン
      if (cond.owner === 'opponent') return !isOwnerTurn; // 対戦相手のアタックフェイズ
      return true;                                        // owner 省略＝どちらのアタックフェイズでも
    }

    case 'DURING_MAIN_PHASE': {
      // 🆕**§5.3 `O-65`＝「[あなたの/対戦相手の]メインフェイズの間、」有効な常在効果。**
      // `DURING_ATTACK_PHASE` の対。⚠**`turnPhase` を渡さない呼び出し元では true**（過小実行を避ける）＝
      //   受け皿を足すだけでは効かないので、消費地点が `turnPhase` を渡していることを必ず確認する
      //   （`O-64` で踏んだ「委ね先がそのフィールドを読んでいない」型と同じ）。
      if (turnPhase === undefined) return true;
      if (turnPhase !== 'MAIN') return false;
      if (cond.owner === 'self') return isOwnerTurn;       // あなたのメインフェイズ＝効果所有者のターン
      if (cond.owner === 'opponent') return !isOwnerTurn;  // 対戦相手のメインフェイズ
      return true;                                          // owner 省略＝どちらのメインフェイズでも
    }

    case 'BEAT_CONDITION':
      // 《ビートアイコン》[条件]：自分の【ビート】が条件を満たすかぎり有効（CONTINUOUS常時能力のゲート）
      return checkBeatCondition(ownerState.field.beat_zone ?? [], cond.condText, cardMap);

    case 'HAS_CARD_IN_FIELD': {
      const states = cond.owner === 'any'
        ? [ownerState, otherState]
        : [cond.owner === 'self' ? ownerState : otherState];
      // 状態フィルタ（isFrozen / isDown 等）も評価するためゾーンindex付きで走査する
      let matched = 0;
      const distinctNameSet = cond.distinctNames ? new Set<string>() : null;
      const distinctColorSet = cond.distinctColors ? new Set<string>() : null;
      const distinctLevelSet = cond.distinctLevels ? new Set<string>() : null;
      const distinctClassSet = cond.distinctClasses ? new Set<string>() : null;
      const record = (num: string, c: CardData | undefined) => {
        if (distinctColorSet) splitFieldColors(c?.Color).forEach(color => distinctColorSet.add(color));
        else if (distinctNameSet) distinctNameSet.add(c?.CardName ?? num);
        else if (distinctLevelSet) distinctLevelSet.add(c?.Level ?? '');
        else if (distinctClassSet) splitFieldClasses(c?.CardClass)
          .filter(cls => !(cond.excludeClasses ?? []).includes(cls))
          .forEach(cls => distinctClassSet.add(cls));
        else matched++;
      };
      for (const state of states) {
        state.field.signi.forEach((stack, zi) => {
          const top = stack?.at(-1);
          if (!top) return;
          if (cond.excludeSelf && sourceCardNum && top === sourceCardNum) return;
          const c = cardMap.get(top);
          if (!matchesFilter(c, cond.filter)) return;
          if (!matchesStateFilter(state, zi, cond.filter)) return;
          record(top, c);
        });
      // ルリグゾーン走査：「場に《X》がいる」で X がルリグ名の場合（crossState/isFrozen/isAwakened/isPuppet はシグニ専用）
      // ⚠**isPuppet が抜けていた**（2026-08-18 実測）＝execUtils.evalCondition（:1752）は4つとも除外しているのに
      //   こちらは3つで、matchesFilter は isPuppet を見ないため**ルリグが「傀儡状態のシグニ」として数えられる**。
      //   判定器が2つある語彙は片方だけ穴が空く（続き378 の教訓）＝両方を必ず揃える。
        if (!cond.filter?.crossState && !cond.filter?.isFrozen && !cond.filter?.isAwakened && !cond.filter?.isPuppet) {
          for (const ln of lrigZoneTops(state.field)) {
            const c = ln ? cardMap.get(ln) : undefined;
            if (ln && matchesFilter(c, cond.filter)) record(ln, c);
          }
        }
      }
      const count = distinctColorSet?.size ?? distinctNameSet?.size ?? distinctLevelSet?.size ?? distinctClassSet?.size ?? matched;
      return count >= (cond.minCount ?? 1);
    }
    case 'HAS_KEY_IN_FIELD': {
      const f = (cond.owner === 'self' ? ownerState : otherState).field;
      const count = (f.key_piece != null ? 1 : 0) + (f.key_piece_extra?.length ?? 0);
      return cond.operator && cond.value !== undefined ? compare(count, cond.operator, cond.value) : count > 0;
    }
    case 'FIELD_LEVEL_SUM': {
      const sum = (state: PlayerState): number => {
        const nums = cond.target === 'signi'
          ? state.field.signi.map(stack => stack?.at(-1)).filter((n): n is string => !!n)
          : cond.lrigRole === 'assist'
            ? [state.field.assist_lrig_l?.at(-1), state.field.assist_lrig_r?.at(-1)].filter((n): n is string => !!n)
            : cond.lrigRole === 'center'
              ? [state.field.lrig.at(-1)].filter((n): n is string => !!n)
              : lrigZoneTops(state.field).filter((n): n is string => !!n);
        if (cond.metric === 'power') {
          return nums.reduce((total, n) => total + (effectivePowers?.get(n)
            ?? (parseInt((cardMap.get(n)?.Power ?? '').replace(/[^0-9]/g, ''), 10) || 0)), 0);
        }
        return nums.reduce((total, n) => total + (cond.target === 'signi' && effectiveLevels?.has(n)
          ? effectiveLevels.get(n)!
          : (parseInt(cardMap.get(n)?.Level ?? '0', 10) || 0)), 0);
      };
      const lhsState = cond.owner === 'self' ? ownerState : otherState;
      const lhs = sum(lhsState);
      if (cond.parity) return Math.abs(lhs % 2) === (cond.parity === 'odd' ? 1 : 0);
      const rhs = cond.compareTo === 'opponent'
        ? sum(cond.owner === 'self' ? otherState : ownerState)
        : cond.value;
      return cond.operator !== undefined && rhs !== undefined && compare(lhs, cond.operator, rhs);
    }
    case 'LRIG_TEAM_COUNT': {
      const field = (cond.owner === 'self' ? ownerState : otherState).field;
      const count = lrigZoneTops(field).filter((n): n is string => !!n)
        .filter(n => (cardMap.get(n)?.Team ?? '').replace(/･/g, '・').split('・').includes(cond.team)).length;
      return compare(count, cond.operator, cond.value);
    }
    // 「あなたの場にあるすべてのシグニが〈色〉/＜C＞/《X》であるかぎり、」（§6.4 O-35）。
    // `Condition` 側（evalConditionForContinuous:998／execUtils:1672）と**同じ式**＝各スタック頂点が
    // 全て filter 一致・空盤面 false（1体以上必須＝軍勢が居ないのに空振りで効かない）。
    case 'ALL_FIELD_SIGNI_MATCH': {
      const tops = (cond.owner === 'self' ? ownerState : otherState).field.signi
        .map(stack => (stack && stack.length ? stack[stack.length - 1] : null))
        .filter((n): n is string => n !== null);
      return tops.length > 0 && tops.every(top => matchesFilter(cardMap.get(top), cond.filter));
    }

    case 'COUNT_THRESHOLD': {
      const state = cond.owner === 'self' ? ownerState : otherState;
      const count = cond.color
        ? getLocationCards(state, cond.location).filter(cn => cardMap.get(cn)?.Color?.includes(cond.color!)).length
        : getLocationCount(state, cond.location);
      switch (cond.operator) {
        case 'gte': return count >= cond.value;
        case 'lte': return count <= cond.value;
        case 'gt':  return count >  cond.value;
        case 'lt':  return count <  cond.value;
        case 'eq':  return count === cond.value;
        case 'neq': return count !== cond.value;
      }
      // 内側の operator switch は CompareOp を網羅済み（到達しない）。`break` だと外側 switch を抜けて
      // 末尾の `return true`＝無条件成立に落ちるので、**保守側（不成立）で閉じる**（タスク12(cxv) の網羅性ガード）。
      return false;
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

    // タスク12(cxvii)：このシグニ自身の**実効レベル**（`DYNAMIC_LEVEL_BY_ENERGY` 等の動的修正込み）。
    // `WX20-Re18`＝表記レベル2／エナ5枚につき＋1＝レベル4・5の閾値は**動的にしか届かない**ので、
    // 呼び出し元が `effectiveLevels`（`calcSigniLevels`）を渡さないと一生 false になる。
    case 'SELF_LEVEL_THRESHOLD': {
      if (!sourceCardNum) return false;
      const selfLevel = effectiveLevels?.get(sourceCardNum)
        ?? parseInt(cardMap.get(sourceCardNum)?.Level ?? '', 10);
      if (isNaN(selfLevel)) return false;   // レベルを持たないカード（ルリグ等）＝不成立
      switch (cond.operator) {
        case 'gte': return selfLevel >= cond.value;
        case 'lte': return selfLevel <= cond.value;
        case 'gt':  return selfLevel >  cond.value;
        case 'lt':  return selfLevel <  cond.value;
        case 'eq':  return selfLevel === cond.value;
        case 'neq': return selfLevel !== cond.value;
      }
      return false;
    }

    case 'FRONT_SIGNI_POWER': {
      // このシグニの正面（相手ゾーン 2-zi）のシグニの実効パワーを判定。正面が空なら不成立。
      if (!sourceCardNum) return false;
      const zi = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      if (zi < 0) return false; // 効果元がシグニでない（ルリグ等）＝正面なし
      const frontNum = otherState.field.signi[2 - zi]?.at(-1);
      if (!frontNum) return false;
      const frontPower = effectivePowers?.get(frontNum) ?? parseInt(cardMap.get(frontNum)?.Power ?? '0', 10);
      switch (cond.operator) {
        case 'gte': return frontPower >= cond.value;
        case 'lte': return frontPower <= cond.value;
        case 'gt':  return frontPower >  cond.value;
        case 'lt':  return frontPower <  cond.value;
        case 'eq':  return frontPower === cond.value;
        case 'neq': return frontPower !== cond.value;
      }
      return false;
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
      // 内側の operator switch は CompareOp を網羅済み（到達しない）。`break` だと外側 switch を抜けて
      // 末尾の `return true`＝無条件成立に落ちるので、**保守側（不成立）で閉じる**（タスク12(cxv) の網羅性ガード）。
      return false;
    }

    case 'LIFE_COMPARE_OPP': {
      const diff = ownerState.life_cloth.length - otherState.life_cloth.length;
      const value = cond.value ?? 0;
      switch (cond.operator) {
        case 'gte': return diff >= value;
        case 'lte': return diff <= value;
        case 'gt':  return diff >  value;
        case 'lt':  return diff <  value;
        case 'eq':  return diff === value;
        case 'neq': return diff !== value;
      }
      return false;
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
      // 内側の operator switch は CompareOp を網羅済み（到達しない）。`break` だと外側 switch を抜けて
      // 末尾の `return true`＝無条件成立に落ちるので、**保守側（不成立）で閉じる**（タスク12(cxv) の網羅性ガード）。
      return false;
    }

    case 'ENERGY_COLOR_TYPES': {
      // エナゾーンのカードが持つ色の種類数（マルチエナ等の複数色カードは各色を別々に数える。無色はカウントしない）
      const enaState = cond.owner === 'self' ? ownerState : otherState;
      const colorSet = new Set<string>();
      for (const cn of enaState.energy) {
        const colorStr = cardMap.get(cn)?.Color ?? '';
        for (const col of ['白', '赤', '青', '緑', '黒']) {
          if (colorStr.includes(col)) colorSet.add(col);
        }
      }
      const typeCount = colorSet.size;
      switch (cond.operator) {
        case 'gte': return typeCount >= cond.value;
        case 'lte': return typeCount <= cond.value;
        case 'gt':  return typeCount >  cond.value;
        case 'lt':  return typeCount <  cond.value;
        case 'eq':  return typeCount === cond.value;
        case 'neq': return typeCount !== cond.value;
      }
      // 内側の operator switch は CompareOp を網羅済み（到達しない）。`break` だと外側 switch を抜けて
      // 末尾の `return true`＝無条件成立に落ちるので、**保守側（不成立）で閉じる**（タスク12(cxv) の網羅性ガード）。
      return false;
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
      // 内側の operator switch は CompareOp を網羅済み（到達しない）。`break` だと外側 switch を抜けて
      // 末尾の `return true`＝無条件成立に落ちるので、**保守側（不成立）で閉じる**（タスク12(cxv) の網羅性ガード）。
      return false;
    }

    case 'EICHI_LEVEL_SUM': {
      // 英知=N: 自分のフィールドの＜英知＞シグニのレベル合計が**ちょうど N**（カードのルール補足
      // 「レベルの合計がちょうどNであるかぎり有効になる」）。
      // ⚠ 合計は単一値ではなく**取りうる値の集合**になりうる＝「このシグニのレベルは１であり２であり
      //   ３であるとして扱う」札があると、1体で3通りの合計が同時に成立する（WX20-044-CB のルール補足
      //   「【英知＝６】と【英知＝７】と【英知＝８】はすべてその条件を満たす」）。
      const eichiLevelOverrides = ownerState.attack_phase_level_overrides ?? {};
      const eichiOptions = ownerState.eichi_level_options ?? {};
      let eichiSums = new Set<number>([0]);
      for (const stack of ownerState.field.signi) {
        const top = stack?.at(-1);
        if (!top) continue;
        const card = cardMap.get(top);
        if (!card?.CardClass?.includes('英知')) continue;
        const opts = eichiOptions[top] ?? [eichiLevelOverrides[top] ?? (parseInt(card.Level ?? '0') || 0)];
        const next = new Set<number>();
        for (const base of eichiSums) for (const o of opts) next.add(base + o);
        eichiSums = next;
      }
      const eichiSum = Math.max(...eichiSums);
      const eichiMin = Math.min(...eichiSums);
      switch (cond.operator) {
        // eq は集合への所属。それ以外は「満たしうるか」＝集合の最大/最小で判定する
        // （現データの英知条件はすべて eq。他の演算子は将来用の素直な拡張）。
        case 'eq':  return eichiSums.has(cond.value);
        case 'neq': return eichiSums.size > 1 || !eichiSums.has(cond.value);
        case 'gte': return eichiSum >= cond.value;
        case 'gt':  return eichiSum >  cond.value;
        case 'lte': return eichiMin <= cond.value;
        case 'lt':  return eichiMin <  cond.value;
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
      if (!cond.cardName) return hasAcceAt(ownerState.field, zoneIdx);
      return acceCardsAt(ownerState.field, zoneIdx).some(num => {
        const bare = num.includes('#') ? num.slice(0, num.indexOf('#')) : num;
        return cardMap.get(num)?.CardName === cond.cardName || cardMap.get(bare)?.CardName === cond.cardName;
      });
    }

    case 'IS_SELF_SOUL_ATTACHED': {
      if (!sourceCardNum) return false;
      const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      return zoneIdx >= 0 && (ownerState.field.signi_soul?.[zoneIdx] ?? null) !== null;
    }

    case 'IS_SELF_ACCE_CARD': {
      // このカードがアクセスロットに装着されているかぎり
      if (!sourceCardNum) return false;
      return allAcceCards(ownerState.field).includes(sourceCardNum);
    }

    case 'IS_SELF_CHARMED': {
      // このシグニに【チャーム】が付いているかぎり（フィールドのシグニに signi_charms が設定されている）
      if (!sourceCardNum) return false;
      const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      if (zoneIdx < 0) return false;
      return (ownerState.field.signi_charms?.[zoneIdx] ?? null) !== null;
    }

    case 'IS_DRIVE_STATE':
      // このシグニがドライブ状態（LRIGが乗っている）であるかぎり
      if (!sourceCardNum) return false;
      return ownerState.lrig_riding_signi?.includes(sourceCardNum) ?? false;

    case 'LRIG_IS_DRIVE_STATE':
      // このルリグがドライブ状態であるかぎり（＝自分のルリグが乗機シグニに乗っている）。
      // ⚠`IS_DRIVE_STATE`（シグニ側）は sourceCardNum が `lrig_riding_signi` に載っているかを見るので
      //   ルリグ本体では常に false になる＝ルリグ用はこちら（`WXEX2-11-E2`・§3 (cxxxv) と同時に新設）。
      return (ownerState.lrig_riding_signi?.length ?? 0) > 0;

    case 'IS_SELF_AWAKENED':
      // このシグニが覚醒状態であるかぎり
      if (!sourceCardNum) return false;
      return ownerState.awakened_signi?.includes(sourceCardNum) ?? false;

    case 'IS_SELF_DOWN': {
      if (!sourceCardNum) return false;
      const zoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      return zoneIdx >= 0 && (ownerState.field.signi_down?.[zoneIdx] ?? false);
    }

    // 「このシグニがアップ状態であるかぎり」（`WXDi-P04-050-E1/E2`・2026-08-18）。
    // ⚠**場に居ないときは false**（`IS_SELF_DOWN` と同じ＝「ダウンしていない」を素直に反転すると
    //   場を離れた効果元まで真になる）。ゾーンが見つかったうえで `signi_down` が false のときだけ真。
    case 'IS_SELF_UP': {
      if (!sourceCardNum) return false;
      const upZoneIdx = ownerState.field.signi.findIndex(s => s?.at(-1) === sourceCardNum);
      return upZoneIdx >= 0 && !(ownerState.field.signi_down?.[upZoneIdx] ?? false);
    }

    case 'IS_SELF_IN_CENTER_ZONE':
      // このシグニが中央のシグニゾーン（index 1）にあるかぎり
      if (!sourceCardNum) return false;
      return ownerState.field.signi[1]?.includes(sourceCardNum) ?? false;

    case 'IS_SELF_IN_SIDE_ZONE': {
      // このシグニが左（index 0）／右（index 2）／左か右（中央以外）のシグニゾーンにあるかぎり
      if (!sourceCardNum) return false;
      const zi = ownerState.field.signi.findIndex(s => s?.includes(sourceCardNum));
      if (zi < 0) return false;
      return cond.side === 'either' ? zi !== 1 : zi === (cond.side === 'left' ? 0 : 2);
    }

    case 'TURN_HAND_DISCARD_GTE':
      // このターンに owner（省略=self）が手札をN枚以上捨てている場合。
      // `Condition` 側（execUtils の evalCondition）と**同じ式**＝両方揃えて更新すること。
      return ((cond.owner === 'opponent' ? otherState : ownerState).turn_hand_discarded_count ?? 0) >= cond.value;

    case 'THIS_CARD_HAS_UNDER': {
      // このシグニの下にカードがあるかぎり（filter 指定時は下カードのいずれかがフィルタ一致
      // ＝「下にレベルNのシグニがあるかぎり」等。WX24-P1-043）
      if (!sourceCardNum) return false;
      const stack = ownerState.field.signi.find(s => s?.at(-1) === sourceCardNum);
      if (!stack || stack.length <= 1) return false;
      const under = stack.slice(0, -1);
      const matched = !cond.filter ? under : under.filter(cn => {
        const base = cn.includes('#') ? cn.slice(0, cn.indexOf('#')) : cn;
        return matchesFilter(cardMap.get(base), cond.filter);
      });
      return matched.length >= (cond.minCount ?? 1);
    }

    case 'SELF_HAS_KEYWORD': {
      // 自身またはセンタールリグが【keyword】を持っているかぎり（印字・解決済み付与の両方）。
      const subjectNum = cond.subject === 'center_lrig' ? ownerState.field.lrig.at(-1) : sourceCardNum;
      if (!subjectNum) return false;
      return hasKeyword(subjectNum, cond.keyword, cardMap,
        ownerState.keyword_grants, undefined,
        ownerState.keyword_grants_until_opp_turn,
        cond.subject === 'center_lrig' ? undefined : activeFieldGrantKeywordsForSigni(ownerState, otherState, subjectNum, cardMap),
        ownerState.abilities_removed, ownerState.keyword_abilities_removed);
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

    // 「あなたの場にカード名に《X》を含むセンタールリグがいるかぎり」（段2 第45バッチ）。
    // ⚠`Condition` 側（`execUtils` / `evalConditionForContinuous`）と**同じ読み**にする
    //   ＝センター（`field.lrig` の最前面）だけを見る。ルリグ不在は false（過剰実行しない側）。
    case 'LRIG_NAME_CONTAINS': {
      const nameState = cond.owner === 'self' ? ownerState : otherState;
      const nameTop = nameState.field.lrig.at(-1);
      if (!nameTop) return false;
      return cardMap.get(nameTop)?.CardName?.includes(cond.name) ?? false;
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

    case 'ENERGY_HAS_CARD': {
      const enaState = cond.owner === 'self' ? ownerState : otherState;
      const matched = enaState.energy.filter(cn => matchesFilter(cardMap.get(cn), cond.filter)).length;
      return matched >= (cond.minCount ?? 1);
    }

    case 'ENERGY_EACH_LEVEL_FILTER_GTE': {
      const enaState = cond.owner === 'self' ? ownerState : otherState;
      const matched = enaState.energy.filter(cn => {
        const bare = cn.includes('#') ? cn.slice(0, cn.indexOf('#')) : cn;
        return matchesFilter(cardMap.get(cn) ?? cardMap.get(bare), cond.filter);
      });
      return cond.levels.every(level => matched.filter(cn => {
        const bare = cn.includes('#') ? cn.slice(0, cn.indexOf('#')) : cn;
        return Number((cardMap.get(cn) ?? cardMap.get(bare))?.Level) === level;
      }).length >= cond.minEach);
    }

    case 'ENERGY_COUNT_FILTER': {
      const states = cond.owner === 'any'
        ? [ownerState, otherState]
        : [cond.owner === 'self' ? ownerState : otherState];
      const cards = states.flatMap(state => state.energy)
        .map(cn => cardMap.get(cn) ?? cardMap.get(cn.split('#')[0]))
        .filter((c): c is CardData => !!c && matchesFilter(c, cond.filter));
      const count = cond.distinctName ? new Set(cards.map(c => c.CardName)).size
        : cond.distinctColor ? new Set(cards.flatMap(c => splitFieldColors(c.Color))).size
        : cond.distinctClasses ? new Set(cards.flatMap(c => splitFieldClasses(c.CardClass)
          .filter(cls => !(cond.excludeClasses ?? []).includes(cls)))).size
        : cards.length;
      return compare(count, cond.operator, cond.value);
    }

    case 'TRASH_HAS_CARD': {
      const states = cond.owner === 'any'
        ? [ownerState, otherState]
        : [cond.owner === 'self' ? ownerState : otherState];
      const cards = states.flatMap(state => state.trash)
        .map(cn => cardMap.get(cn) ?? cardMap.get(cn.split('#')[0]))
        .filter((c): c is CardData => !!c && matchesFilter(c, cond.filter));
      const count = cond.distinctName ? new Set(cards.map(c => c.CardName)).size
        : cond.distinctClasses ? new Set(cards.flatMap(c => splitFieldClasses(c.CardClass)
          .filter(cls => !(cond.excludeClasses ?? []).includes(cls)))).size
        : cards.length;
      return count >= (cond.minCount ?? 1);
    }

    case 'LRIG_TRASH_COUNT': {
      // ルリグトラッシュの（cardType/filter一致）枚数（「ルリグトラッシュにアーツがあるかぎり」。G185）。
      // evalConditionForContinuous の同名ケースと同実装。
      const types = cond.cardType
        ? (Array.isArray(cond.cardType) ? cond.cardType : [cond.cardType])
        : null;
      const cnt = ownerState.lrig_trash.filter(n => {
        if (cond.excludeSource && n === sourceCardNum) return false;
        const c = cardMap.get(n);
        if (!c) return false;
        if (types && !types.includes(c.Type as typeof types[number])) return false;
        return !cond.filter || matchesFilter(c, cond.filter);
      }).length;
      switch (cond.operator) {
        case 'gte': return cnt >= cond.value;
        case 'lte': return cnt <= cond.value;
        case 'gt':  return cnt >  cond.value;
        case 'lt':  return cnt <  cond.value;
        case 'eq':  return cnt === cond.value;
        case 'neq': return cnt !== cond.value;
        default:    return false;
      }
    }

    case 'LRIG_DECK_COUNT': {
      const state = cond.owner === 'self' ? ownerState : otherState;
      const count = state.lrig_deck.length;
      switch (cond.operator) {
        case 'gte': return count >= cond.value;
        case 'lte': return count <= cond.value;
        case 'gt': return count > cond.value;
        case 'lt': return count < cond.value;
        case 'eq': return count === cond.value;
        case 'neq': return count !== cond.value;
      }
      return false;
    }

    case 'SIGNI_RETURNED_TO_HAND_THIS_TURN': {
      // `Condition` 側（execUtils の evalCondition）と**同じ式**＝両方揃えて更新すること。
      // owner:'any'＝両者合算。minCount 省略（1体以上）は既存 boolean フラグも見る。
      const rthStates = cond.owner === 'any' ? [ownerState, otherState]
        : [cond.owner === 'opponent' ? otherState : ownerState];
      const rthMin = cond.minCount ?? 1;
      const rthCount = rthStates.reduce((n, st) => n + (st.signi_returned_to_hand_count_this_turn ?? 0), 0);
      if (rthMin <= 1) return rthStates.some(st => st.turn_signi_returned_to_hand === true) || rthCount >= 1;
      return rthCount >= rthMin;
    }

    case 'SIGNI_BANISHED_THIS_TURN':
      // `Condition` 側と同じ式。⚠`signi_banished_this_turn` は**バニッシュされた側**の state に積まれる。
      return ((cond.owner === 'opponent' ? otherState : ownerState).signi_banished_this_turn ?? 0) >= (cond.minCount ?? 1);

    // §5.3 O-121: `Condition` 側（`execUtils`）と**同じ式**。
    // ⚠台帳 `opp_signi_banished_this_turn` は**バニッシュした側**に積まれる（上の別軸と取り違えない）。
    case 'OPP_SIGNI_BANISHED_COUNT_THIS_TURN': {
      const obLedA = (cond.owner === 'opponent' ? otherState : ownerState).opp_signi_banished_this_turn ?? [];
      const obNA = obLedA.filter(r => {
        if (cond.byEffect && !r.byEffect) return false;
        if (!cond.filter) return true;
        // ⚠ローカル縮小版 `matchesFilter`（`:804`）＝未対応フィルタは黙って素通りする。語彙を増やすときは両方見る。
        return !!r.by && matchesFilter(cardMap.get(r.by.split('#')[0]), cond.filter);
      }).length;
      return compare(obNA, cond.operator, cond.value);
    }


    // §5.3 O-122: `Condition` 側（`execUtils`）と同じ式。
    case 'APPEARANCE_COST_SAME_NAME': {
      const paidA = ownerState.last_appearance_cost_cards ?? [];
      const tallyA = new Map<string, number>();
      for (const num of paidA) {
        const nm = cardMap.get(num.split('#')[0])?.CardName;
        if (!nm) continue;
        tallyA.set(nm, (tallyA.get(nm) ?? 0) + 1);
      }
      return [...tallyA.values()].some(n => n >= cond.count);
    }
    // §5.3 O-117: この効果の使用コストで、指定色が**すべて**支払われているか。
    // 🔴**1枚のエナは1色にしか数えない**＝色集合の二部マッチング（`COST_COLOR_SELECT` と同じ考え方）。
    //   単純な「union に全色が含まれる」判定だと、**マルチエナ1枚で5色すべて成立**してしまう。
    // 🔴**記録が無いときは false（fail-closed）**＝推定で倒すと過剰実行になる（`COST_COLOR_SELECT` の
    //   フォールバック推定はここでは使わない）。
    case 'PAID_COLORS_INCLUDE_ALL': {
      const need = cond.colors;
      const sets = (ownerState.last_paid_energy_colors ?? []).map(cs => cs.filter(c => need.includes(c)));
      if (sets.length === 0) return false;
      const matchByColor: Record<string, number> = {};
      const tryAssign = (ei: number, seen: Set<string>): boolean => {
        for (const col of sets[ei]) {
          if (seen.has(col)) continue;
          seen.add(col);
          if (matchByColor[col] === undefined || tryAssign(matchByColor[col], seen)) { matchByColor[col] = ei; return true; }
        }
        return false;
      };
      for (let ei = 0; ei < sets.length; ei++) tryAssign(ei, new Set());
      return need.every(c => matchByColor[c] !== undefined);
    }
    case 'SELF_DECK_TO_TRASH_THIS_TURN':
      // `Condition` 側と同じ式。
      return ((cond.owner === 'opponent' ? otherState : ownerState).deck_to_trash_count_this_turn ?? 0) >= (cond.minCount ?? 1);

    case 'ARTS_USED_THIS_TURN': {
      const artsState = cond.owner === 'self' ? ownerState : otherState;
      // exactCount＝ちょうどN枚目（`Condition` 側と同じ式＝両方揃えて更新すること）。
      if (cond.exactCount !== undefined) return (artsState.turn_arts_used_names ?? []).length === cond.exactCount;
      if (cond.minCount !== undefined) return (artsState.turn_arts_used_names ?? []).length >= cond.minCount;
      if (cond.color) return (artsState.turn_arts_used_colors ?? []).includes(cond.color);
      return artsState.turn_arts_used === true;
    }

    case 'AND':
      return cond.conditions.every(c => checkActiveCondition(c, ownerState, otherState, isOwnerTurn, cardMap, sourceCardNum, effectivePowers, oppTrashColorLoss, turnPhase, effectiveLevels));
  }
  // ⚠**網羅性ガード（タスク12(cxv)）**＝この switch を抜ける＝未実装の ActiveCondition 型がある、ということ。
  // 抜けた先は `return true`（＝無条件成立）なので、**未実装型を JSON に書くと過剰実行になるのに
  // 全ゲート緑のまま素通りする**（`activeCondition` に Condition 型を流用した3効果が実際にそうなっていた：
  // `WX05-021-E4`／`WXDi-P07-060-E3`／`PR-426-E3`）。`ActiveCondition` に型を足したら**必ずここに case を足す**
  // ＝足し忘れは下の `never` 代入が typecheck を落として教える。
  const _acExhaustive: never = cond;
  void _acExhaustive;
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

// 指定ロケーションのカード番号一覧（色フィルタ付きCOUNT_THRESHOLD等で使用）
function getLocationCards(state: PlayerState, location: string): string[] {
  switch (location) {
    case 'hand':       return state.hand;
    case 'trash':      return state.trash;
    case 'energy':     return state.energy;
    case 'deck':       return state.deck;
    case 'life_cloth': return state.life_cloth;
    case 'lrig_deck':  return state.lrig_deck ?? [];
    case 'lrig_trash': return state.lrig_trash ?? [];
    default:           return [];
  }
}

// ===== フィルタ判定 =====

function matchesFilter(cardData: CardData | undefined, filter: TargetFilter | undefined): boolean {
  if (!filter || !cardData) return true;
  // OR filter: 下位フィルタのいずれかに一致し、同階層の他条件とはAND。
  // execUtils.matchesFilter と同じ意味に揃え、CONTINUOUS 計算でも和集合を扱う。
  if (filter.anyOf && !filter.anyOf.some(sub => matchesFilter(cardData, sub))) return false;
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
  if (filter.noGuard && cardData.Guard === '1') return false;
  if (filter.nonColorless) {
    const col = cardData.Color ?? '';
    if (col === '' || col === '無' || col === '無色') return false;
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
  // ⚠**execUtils 版とのパリティ欠落**（§5d パターンA・続き372 で発見）。この3つは execUtils の matchesFilter に
  //   あるのにこちらに無く、CONTINUOUS のパワー計算・activeCondition・HAS_CARD_IN_FIELD の評価では
  //   **黙って無視されていた**（＝絞り込みが効かない過剰判定）。live JSON の使用数は
  //   colorExclude 3／excludeResona 33／noAbilities 11。いずれも cardData だけで判定でき state を要さない。
  if (filter.colorExclude) {
    const excl = Array.isArray(filter.colorExclude) ? filter.colorExclude : [filter.colorExclude];
    if (excl.some(c => cardData.Color?.includes(c))) return false;
  }
  if (filter.excludeResona && cardData.Type?.includes('レゾナ')) return false;
  if (filter.isDisona && (cardData.Story ?? '') !== 'Dissona') return false;
  if (filter.noAbilities !== undefined) {
    // execUtils 版と同基準＝①解析済み効果が1件でもあれば能力あり ②0件は根拠にならず原文で判定
    //（CSV は素のシグニを `-` で持つ）。場の `abilities_removed` は state が要るので fieldCandidates 側の担当。
    const blankTxt = (s?: string) => { const t = (s ?? '').trim(); return t === '' || t === '-'; };
    const noAb = (cardData.effects?.length ?? 0) === 0 && blankTxt(cardData.EffectText) && blankTxt(cardData.BurstText);
    if (filter.noAbilities !== noAb) return false;
  }
  if (filter.levelParity !== undefined) {
    const lv = parseInt(cardData.Level ?? '', 10);
    if (filter.levelParity === 'even' && lv % 2 !== 0) return false;
    if (filter.levelParity === 'odd'  && lv % 2 !== 1) return false;
  }
  // 《クロスアイコン》/《ライズアイコン》の有無（execUtils 版と同基準・GRANT_PROTECTION subjectFilter 等で使用）
  if (filter.hasCrossIcon && !(cardData.EffectText?.startsWith('《クロスアイコン》'))) return false;
  if (filter.hasRiseIcon && !(cardData.EffectText?.includes('【ライズ】'))) return false;
  if (filter.noRiseIcon && (cardData.EffectText?.includes('【ライズ】'))) return false;
  if (filter.hasLifeBurst !== undefined) {
    const hasLB = cardData.LifeBurst === '1';
    if (filter.hasLifeBurst !== hasLB) return false;
  }
  // 使用コストの合計（《色×N》の合計、コインは除く。「対戦相手のコストの合計が５以上の…効果を受けない」WX15-031）
  if (filter.costMax !== undefined || filter.costMin !== undefined) {
    let total = 0;
    for (const m of (cardData.Cost ?? '').matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
      if (m[1] === 'コイン') continue;
      const n = parseInt(m[2].replace(/[０-９]/g, d => String('０１２３４５６７８９'.indexOf(d))), 10);
      if (!isNaN(n)) total += n;
    }
    if (filter.costMax !== undefined && total > filter.costMax) return false;
    if (filter.costMin !== undefined && total < filter.costMin) return false;
  }
  return true;
}

// センタールリグ＋左右アシストルリグの各グロウスタック頂点（execUtils.lrigZoneTops と同義）
function lrigZoneTops(field: PlayerState['field']): (string | undefined)[] {
  return [field.lrig?.at(-1), field.assist_lrig_l?.at(-1), field.assist_lrig_r?.at(-1)];
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
    const v = hasAcceAt(state.field, zoneIdx);
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
  if (filter.isAwakened !== undefined) {
    const top = state.field.signi[zoneIdx]?.at(-1);
    const v = top ? (state.awakened_signi ?? []).includes(top) : false;
    if (filter.isAwakened !== v) return false;
  }
  if (filter.isPuppet !== undefined) {
    const top = state.field.signi[zoneIdx]?.at(-1);
    const v = top ? (state.field.puppet_signi ?? []).includes(top) : false;
    if (filter.isPuppet !== v) return false;
  }
  if (filter.isUp !== undefined) {
    const v = !(state.field.signi_down?.[zoneIdx] ?? false);
    if (filter.isUp !== v) return false;
  }
  if (filter.isDrive !== undefined) {
    // ドライブ状態＝ルリグに乗られている乗機シグニ（lrig_riding_signi）
    const top = state.field.signi[zoneIdx]?.at(-1);
    const v = top ? (state.lrig_riding_signi ?? []).includes(top) : false;
    if (filter.isDrive !== v) return false;
  }
  if (filter.inGateZone !== undefined) {
    const v = (state.own_gate_zones ?? []).includes(zoneIdx);
    if (filter.inGateZone !== v) return false;
  }
  if (filter.centerZoneOnly !== undefined) {
    if (filter.centerZoneOnly !== (zoneIdx === 1)) return false;
  }
  // 左／右のシグニゾーン限定（所有者から見た表示順＝left=0 / right=2）
  if (filter.zoneSide !== undefined) {
    if (zoneIdx !== (filter.zoneSide === 'left' ? 0 : 2)) return false;
  }
  return true;
}

/** active な場レベル grant のうち、現在そのシグニへ適用されるものを返す。filter/zone/condition は毎回評価する。 */
export function activeFieldGrantsForSigni(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardNum: string,
  cardMap: Map<string, CardData>,
): FieldGrant[] {
  const zoneIdx = ownerState.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
  if (zoneIdx < 0) return [];
  const baseNum = cardNum.includes('#') ? cardNum.slice(0, cardNum.indexOf('#')) : cardNum;
  const card = cardMap.get(baseNum);
  return normalizeFieldGrants(ownerState.field_grants_active, ownerState.field_keyword_grants_active)
    .filter(grant => {
      if (grant.zone !== undefined && grant.zone !== zoneIdx) return false;
      if (!matchesFilter(card, grant.filter) || !matchesStateFilter(ownerState, zoneIdx, grant.filter)) return false;
      if (grant.condition?.type === 'FRONT_SIGNI_HAS_CHARM') {
        const frontZone = 2 - zoneIdx;
        if (!otherState.field.signi[frontZone]?.at(-1)) return false;
        if ((otherState.field.signi_charms?.[frontZone] ?? null) === null) return false;
      }
      return true;
    });
}

export function activeFieldGrantKeywordsForSigni(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardNum: string,
  cardMap: Map<string, CardData>,
): string[] {
  return activeFieldGrantsForSigni(ownerState, otherState, cardNum, cardMap)
    .flatMap(grant => grant.kind === 'keyword' ? [grant.keyword] : []);
}

/**
 * そのシグニが**場レベルの能力喪失**（`FieldGrant{kind:'abilityLoss'}`）の下にあるか（§6.4 O-16）。
 * ⚠per-card の `abilities_removed` と違い、**ゾーンに紐づく**ので後からそこへ出たシグニにも効く
 *   （「（指定した）シグニゾーンにあるシグニは能力を失い、新たに得られない」の忠実表現）。
 */
export function fieldGrantRemovesAbilities(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardNum: string,
  cardMap: Map<string, CardData>,
): boolean {
  return activeFieldGrantsForSigni(ownerState, otherState, cardNum, cardMap)
    .some(grant => grant.kind === 'abilityLoss');
}

/**
 * キーを**能力の発生源として**列挙する唯一の funnel（§6.4 O-16(b)）。
 *
 * `keys_abilities_disabled`（「（この）ターン、そのプレイヤーのすべてのキーは能力を失い、新たに得られない」）が
 * 立っているあいだは空を返す＝CONT 収集・AUTO トリガー収集・【起】候補のどこから見てもキーの能力が消える。
 * ⚠従来このフラグは `effectEngine` の CONT 収集8箇所でしか見られておらず、**`triggerCollect` の AUTO と
 *   `key_piece_extra` は素通り**していた（＝「すべてのキーが能力を失う」が半分しか効いていない）。
 * ⚠**「キーが場にあるか」の判定には使わない**＝色・枚数・配置可否・トラッシュ移動は能力喪失と無関係。
 */
export function activeKeyAbilitySources(state: PlayerState): string[] {
  if (state.keys_abilities_disabled) return [];
  // 1枚単位の喪失（「対戦相手の**キー１枚**を対象とし、ターン終了時まで、それは能力を失う」＝§6.4 O-17）は
  // シグニと同じ `abilities_removed`（cardNum のリスト）に載る。全キーのフラグとは別軸なので両方見る。
  const removed = new Set(state.abilities_removed ?? []);
  return keySlotCardNums(state).filter(n => !removed.has(n));
}

/** 場のキー枠（`key_piece` ＋ `key_piece_extra`）の実体。**能力喪失を考慮しない**＝選択候補の母集団。 */
export function keySlotCardNums(state: PlayerState): string[] {
  return [state.field.key_piece, ...(state.field.key_piece_extra ?? [])]
    .filter((n): n is string => !!n);
}

// ===== CONTINUOUS BANISH / FREEZE / DOWN 状態変更計算 =====

export interface ContSigniMutation {
  effectId: string;
  type: 'BANISH' | 'FREEZE' | 'DOWN';
  targetIsHost: boolean;
  targetNums: string[];
  sourceCardNum: string;  // CONT効果の発生源シグニ（「あなたの効果によって…バニッシュされたとき」の cause 判定用＝G072群C の CONT 経路解消）
  sourceIsHost: boolean;  // 発生源の所有者（cause.ownerId の解決用）
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
        result.push({ effectId: eff.effectId, type: act.type, targetIsHost, targetNums, sourceCardNum: sourceNum, sourceIsHost: ownerIsHost });
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
    // ⚠この評価器の `default` は **true（permissive）** ＝未対応の条件は「制限なし」に倒れる。
    //   出撃制限（SELF_PLAY_RESTRICT）の条件をここへ足し忘れると**恒久 no-op** になり、
    //   census も golden も緑のまま素通りする（§5-2‴）。他2評価器と同じ式を必ず並べること。
    case 'TURN_HAND_DISCARD_GTE':
      return (st(cond.owner ?? 'self').turn_hand_discarded_count ?? 0) >= cond.value;
    case 'VIRUS_COUNT':
      return cmp((st(cond.owner).field.signi_virus ?? []).reduce((sum, count) => sum + count, 0), cond.operator, cond.value);
    case 'SIGNI_BANISHED_THIS_TURN':
      return (st(cond.owner).signi_banished_this_turn ?? 0) >= (cond.minCount ?? 1);
    // §5.3 O-121: Condition 側（`execUtils`）と**同じ式**を並べる。
    // 🔴片側だけだと `checkActiveCondition` が case 無しで `return true`＝**無条件成立**へ落ちる（§5-2‴）。
    case 'OPP_SIGNI_BANISHED_COUNT_THIS_TURN': {
      const obLed = st(cond.owner).opp_signi_banished_this_turn ?? [];
      const obN = obLed.filter(r => {
        if (cond.byEffect && !r.byEffect) return false;
        if (!cond.filter) return true;
        // ⚠このファイルの `matchesFilter` は **execUtils とは別のローカル縮小版**（`:804`）＝未対応フィルタは
        //   黙って素通りする。ここで使うのは cardClass / color 程度なので実害は無いが、語彙を増やすときは両方見る。
        // ⚠`getCardNum` はこのファイルに import が無いので、インスタンス ID の `#N` はここで落とす。
        return !!r.by && matchesFilter(cardMap.get(r.by.split('#')[0]), cond.filter);
      }).length;
      return cmp(obN, cond.operator, cond.value);
    }
    case 'SELF_DECK_TO_TRASH_THIS_TURN':
      return (st(cond.owner).deck_to_trash_count_this_turn ?? 0) >= (cond.minCount ?? 1);
    case 'SIGNI_RETURNED_TO_HAND_THIS_TURN': {
      const rthStates = cond.owner === 'any' ? [ownerState, otherState] : [st(cond.owner)];
      const rthMin = cond.minCount ?? 1;
      const rthCount = rthStates.reduce((n, s2) => n + (s2.signi_returned_to_hand_count_this_turn ?? 0), 0);
      if (rthMin <= 1) return rthStates.some(s2 => s2.turn_signi_returned_to_hand === true) || rthCount >= 1;
      return rthCount >= rthMin;
    }
    case 'FIELD_LRIGS_SHARE_COLOR':
      return fieldLrigsShareColor(st(cond.owner), cond.minCount, cardMap);
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
    case 'LIFE_COMPARE_OPP':
      return cmp(ownerState.life_cloth.length - otherState.life_cloth.length, cond.operator, cond.value ?? 0);
    case 'ENERGY_COUNT': {
      const count = st(cond.owner).energy.length;
      return cmp(count, cond.operator, typeof cond.value === 'number' ? cond.value : 0);
    }
    case 'ENERGY_COUNT_FILTER': {
      const states = cond.owner === 'any' ? [ownerState, otherState] : [st(cond.owner)];
      const cards = states.flatMap(state => state.energy)
        .map(n => cardMap.get(n) ?? cardMap.get(n.split('#')[0]))
        .filter((c): c is CardData => !!c && matchesFilter(c, cond.filter));
      const count = cond.distinctName ? new Set(cards.map(c => c.CardName)).size
        : cond.distinctColor ? new Set(cards.flatMap(c => splitFieldColors(c.Color))).size
        : cond.distinctClasses ? new Set(cards.flatMap(c => splitFieldClasses(c.CardClass)
          .filter(cls => !(cond.excludeClasses ?? []).includes(cls)))).size
        : cards.length;
      return cmp(count, cond.operator, typeof cond.value === 'number' ? cond.value : 0);
    }
    case 'ENERGY_HAS_COLOR': {
      const ez = st(cond.owner).energy;
      return cond.colors.every(color => ez.some(n => cardMap.get(n)?.Color?.includes(color)));
    }
    case 'HAS_CARD_IN_FIELD': {
      const hcifStates = cond.owner === 'any' ? [ownerState, otherState] : [st(cond.owner)];
      const matchedNums: string[] = [];
      // 状態フィルタ（isFrozen / isDown 等）も評価するためゾーンindex付きで走査する
      for (const hcifState of hcifStates) {
        hcifState.field.signi.forEach((stack, zi) => {
          if (!stack?.length) return false;
          const top = stack[stack.length - 1];
          if (cond.excludeSelf && sourceCardNum && top === sourceCardNum) return false;
          if (matchesFilter(cardMap.get(top), cond.filter) && matchesStateFilter(hcifState, zi, cond.filter)) matchedNums.push(top);
        });
      }
      if (cond.distinctColors) return new Set(matchedNums.flatMap(n => splitFieldColors(cardMap.get(n)?.Color))).size >= (cond.minCount ?? 1);
      if (cond.distinctNames) return new Set(matchedNums.map(n => cardMap.get(n)?.CardName ?? n)).size >= (cond.minCount ?? 1);
      if (cond.distinctLevels) return new Set(matchedNums.map(n => cardMap.get(n)?.Level ?? '')).size >= (cond.minCount ?? 1);
      if (cond.distinctClasses) return new Set(matchedNums.flatMap(n => splitFieldClasses(cardMap.get(n)?.CardClass)
        .filter(cls => !(cond.excludeClasses ?? []).includes(cls)))).size >= (cond.minCount ?? 1);
      if (matchedNums.length >= (cond.minCount ?? 1)) return true;
      // ルリグゾーン走査：「場に《X》がいる」で X がルリグ名の場合（crossState/isFrozen/isAwakened/isPuppet はシグニ専用）
      // ⚠**isPuppet が抜けていた**（2026-08-18 実測）＝execUtils.evalCondition（:1752）は4つとも除外しているのに
      //   こちらは3つで、matchesFilter は isPuppet を見ないため**ルリグが「傀儡状態のシグニ」として数えられる**。
      //   判定器が2つある語彙は片方だけ穴が空く（続き378 の教訓）＝両方を必ず揃える。
      if (!cond.filter?.crossState && !cond.filter?.isFrozen && !cond.filter?.isAwakened && !cond.filter?.isPuppet) {
        return hcifStates.some(state => lrigZoneTops(state.field).some(ln => ln && matchesFilter(cardMap.get(ln), cond.filter)));
      }
      return false;
    }
    case 'HAS_KEY_IN_FIELD': {
      const f = st(cond.owner).field;
      return f.key_piece != null || (f.key_piece_extra?.length ?? 0) > 0;
    }
    case 'ALL_FIELD_SIGNI_MATCH': {
      // 「場のすべてのシグニが＜C＞/《X》」＝各スタック頂点が全て filter 一致（1体以上必須）。CONT ゲート用（execUtils と同実装）。
      const afTops = st(cond.owner).field.signi
        .map(stack => (stack && stack.length ? stack[stack.length - 1] : null))
        .filter((n): n is string => n !== null);
      return afTops.length > 0 && afTops.every(top => matchesFilter(cardMap.get(top), cond.filter));
    }
    case 'TRASH_HAS_CARD': {
      const stripCC = oppTrashColorLoss && cond.owner === 'self';
      const states = cond.owner === 'any' ? [ownerState, otherState] : [st(cond.owner)];
      const cards = states.flatMap(state => state.trash).map(n => cardMap.get(n) ?? cardMap.get(n.split('#')[0]))
        .filter((c): c is CardData => !!c)
        .map(c => stripCC ? { ...c, Color: '', CardClass: '' } : c)
        .filter(c => matchesFilter(c, cond.filter));
      const count = cond.distinctName ? new Set(cards.map(c => c.CardName)).size
        : cond.distinctClasses ? new Set(cards.flatMap(c => splitFieldClasses(c.CardClass)
          .filter(cls => !(cond.excludeClasses ?? []).includes(cls)))).size
        : cards.length;
      return count >= (cond.minCount ?? 1);
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
      if (!top) return false;   // ⚠ルリグ不在は negate でも false（execUtils と同扱い）
      const isStory = cardMap.get(top)?.CardClass?.includes(cond.story) ?? false;
      return cond.negate ? !isStory : isStory;
    }
    case 'HAS_BOND': {
      const name = cond.cardName ?? (sourceCardNum ? cardMap.get(sourceCardNum)?.CardName : undefined);
      if (!name) return false;
      return ownerState.bonds?.includes(name) ?? false;
    }
    case 'LRIG_TRASH_COUNT': {
      const types = cond.cardType
        ? (Array.isArray(cond.cardType) ? cond.cardType : [cond.cardType])
        : null;
      const cnt = ownerState.lrig_trash.filter(n => {
        if (cond.excludeSource && n === sourceCardNum) return false;
        const c = cardMap.get(n);
        if (!c) return false;
        if (types && !types.includes(c.Type as typeof types[number])) return false;
        return !cond.filter || matchesFilter(c, cond.filter);
      }).length;
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'FIELD_CLASS_COUNT': {
      // 場のシグニのうち CardClass が story を含むものの数（execUtils.evalCondition と同実装）
      const cnt = st(cond.owner).field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        return cardMap.get(top)?.CardClass?.includes(cond.story) ? n + 1 : n;
      }, 0);
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'FIELD_SIGNI_POWER_COUNT': {
      // 場のシグニのうちパワーが minPower 以上のものの数。CONTINUOUS 評価では effectivePowers を持たないため
      // ベースパワー（cardMap の Power）で近似する（出撃制限ゲート用途では十分な保守的近似）。
      const cnt = st(cond.owner).field.signi.reduce((n, stack) => {
        const top = stack?.at(-1);
        if (!top) return n;
        const pw = parseInt(cardMap.get(top)?.Power ?? '0', 10) || 0;
        return pw >= cond.minPower ? n + 1 : n;
      }, 0);
      return cmp(cnt, cond.operator, cond.value);
    }
    case 'LRIG_NAME_CONTAINS': {
      const lrig = st(cond.owner).field.lrig;
      const top = lrig[lrig.length - 1];
      if (!top) return false;
      return cardMap.get(top)?.CardName?.includes(cond.name) ?? false;
    }
    case 'AND':
      return cond.conditions.every(c => evalConditionForContinuous(c, ownerState, otherState, cardMap, sourceCardNum, oppTrashColorLoss));
    case 'OR':
      return cond.conditions.some(c => evalConditionForContinuous(c, ownerState, otherState, cardMap, sourceCardNum, oppTrashColorLoss));
    default:
      return true;
  }
}

/**
 * 自身出撃制限（SELF_PLAY_RESTRICT・Opusタスク12(xlix)）：cardNum を **通常召喚**（handleSummonSigni）で
 * 場に出せるかを評価する。制限が無ければ true。
 *  - never=true：常に false（効果でのみ配置可能）。
 *  - condition あり：evalConditionForContinuous で評価し、満たさないとき false（配置不可）。
 *    ownerState＝召喚するプレイヤー（この時点で当該カードはまだ手札にあり場に含まれない）／otherState＝相手。
 *  - 未対応語彙で condition を付けられなかったカードは condition 省略＝permissive（true・従来の inert no-op と同値）。
 * evalConditionForContinuous の default は true（＝評価不能な条件は許可）なので、過剰制限（正当な召喚を弾く退化）を避ける。
 */
export function canSelfPlay(
  effects: CardEffect[] | undefined,
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum?: string,
): boolean {
  if (!effects) return true;
  for (const eff of effects) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const a = eff.action;
    if (!a || a.type !== 'SELF_PLAY_RESTRICT') continue;
    if (a.never) return false;
    if (a.condition && !evalConditionForContinuous(a.condition, ownerState, otherState, cardMap, sourceCardNum)) return false;
  }
  return true;
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

function extractPowerModifiesPerField(action: EffectAction): PowerModifyPerFieldAction[] {
  if (action.type === 'POWER_MODIFY_PER_FIELD') return [action as PowerModifyPerFieldAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerField(s));
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

// デッキ枚数 N 枚につきパワー±M（PR-442「デッキの枚数10枚につき＋4000」）。この型だけ CONTINUOUS 計算層に
// 実装が無く、effectExecutor 側の「（effectEngine処理）」というコメントが虚偽で常に無効化されていた（続き84・タスク12(vi)）。
function extractPowerModifiesPerDeckCount(action: EffectAction): PowerModifyPerDeckCountAction[] {
  if (action.type === 'POWER_MODIFY_PER_DECK_COUNT') return [action as PowerModifyPerDeckCountAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerDeckCount(s));
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

function extractPowerModifiesPerEnergyColor(action: EffectAction): PowerModifyPerEnergyColorAction[] {
  if (action.type === 'POWER_MODIFY_PER_ENERGY_COLOR') return [action as PowerModifyPerEnergyColorAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerEnergyColor(s));
  }
  return [];
}

/** 自身の色の種類比例（`POWER_MODIFY_PER_OWN_COLOR`）を SEQUENCE の中まで拾う。 */
function extractPowerModifiesPerOwnColor(action: EffectAction): PowerModifyPerOwnColorAction[] {
  if (action.type === 'POWER_MODIFY_PER_OWN_COLOR') return [action as PowerModifyPerOwnColorAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerOwnColor(s));
  }
  return [];
}

function extractPowerModifiesPerEnergy(action: EffectAction): PowerModifyPerEnergyAction[] {
  if (action.type === 'POWER_MODIFY_PER_ENERGY') return [action as PowerModifyPerEnergyAction];
  if (action.type === 'SEQUENCE') {
    return action.steps.flatMap(s => extractPowerModifiesPerEnergy(s));
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

/** SEQUENCE ステップ内を再帰的に探索し BANISH_REDIRECT アクションを収集する。 */
export function collectBanishRedirectActions(action: EffectAction): import('../types/effects').BanishRedirectAction[] {
  if (action.type === 'BANISH_REDIRECT') return [action as import('../types/effects').BanishRedirectAction];
  if (action.type === 'SEQUENCE') {
    return (action as import('../types/effects').SequenceAction).steps.flatMap(s => collectBanishRedirectActions(s));
  }
  return [];
}

/** SEQUENCE ステップ内を再帰的に探索し BANISH_REDIRECT が含まれるか判定する。 */
export function hasBanishRedirectInAction(action: EffectAction): boolean {
  return collectBanishRedirectActions(action).length > 0;
}

/**
 * CONTINUOUS BANISH_REDIRECT を持つシグニ `holderNum` が、いま起きているバニッシュに対して
 * 置換を適用できるか（2026-07-19 続き217）。
 * @param battlingNum バトル中のそのプレイヤー側のシグニ。バトル以外の経路（パワー0以下での消滅等）は null。
 *
 * `bySource` 無し＝無条件（従来どおり場にあるだけで適用）。
 * `bySource` 有り＝「このシグニとの/による」バニッシュに限るので、能力の持ち主自身がバトル当事者の
 * ときだけ適用する。バトル経路でない（battlingNum=null）なら適用しない。
 *
 * `banished`（タスク12(xliv)(a)）＝被バニッシュシグニの属性。渡すと target.filter の属性限定
 * （レベル/凍結/感染/チャーム）を評価して一致しないバニッシュには適用しない。未指定＝限定を評価しない
 * （後方互換。効果経路など属性が取れない呼び出しは従来どおり）。
 */
export interface BanishedCardAttrs {
  zoneIdx?: number; // 除去前の signi ゾーン位置。場外/不明は undefined
  level?: number;    // 実効レベル（printed + temp_level_mods）。未取得は undefined
  frozen: boolean;   // 凍結中（signi_frozen[zone]）
  hasCharm: boolean; // 【チャーム】が付いている（signi_charms[zone]）
  infected: boolean; // 感染状態（signi_virus[zone] > 0）
}

/** BANISH_REDIRECT の target.filter の属性限定が被バニッシュシグニに一致するか。
 *  制限フィールド（level/isFrozen/hasCharm/infected）が無ければ true（無条件）。
 *  cardType 等の非制限フィールドは無視（対象は常にシグニ）。 */
function banishRedirectFilterMatches(a: import('../types/effects').BanishRedirectAction, b: BanishedCardAttrs): boolean {
  const f = a.target?.filter;
  if (!f) return true;
  if (f.level !== undefined) {
    if (b.level === undefined) return false;
    if (typeof f.level === 'number') { if (b.level !== f.level) return false; }
    else {
      if (f.level.min !== undefined && b.level < f.level.min) return false;
      if (f.level.max !== undefined && b.level > f.level.max) return false;
    }
  }
  if (f.isFrozen === true && !b.frozen) return false;
  if (f.hasCharm === true && !b.hasCharm) return false;
  if (f.infected === true && !b.infected) return false;
  return true;
}

export function banishRedirectAppliesFrom(
  action: EffectAction,
  holderNum: string,
  battlingNum: string | null,
  banished?: BanishedCardAttrs,
  opts?: { excludeWhenPowerZero?: boolean; effectSourceNum?: string },
): boolean {
  const acts = collectBanishRedirectActions(action);
  if (acts.length === 0) return false;
  return acts.some(a => {
    if (a.bySource === 'battle_with_this' && !(battlingNum !== null && holderNum === battlingNum)) return false;
    if (a.bySource === 'by_this'
        && !((battlingNum !== null && holderNum === battlingNum)
          || (opts?.effectSourceNum !== undefined && holderNum === opts.effectSourceNum))) return false;
    if (a.bySource !== undefined && a.bySource !== 'battle_with_this' && a.bySource !== 'by_this'
        && !(battlingNum !== null && holderNum === battlingNum)) return false;
    // 効果経路（バトルでもパワー0消滅でもない）は whenPowerZero 限定を弾く（パワー0経路専用の置換を効果バニッシュに掛けない）
    if (opts?.excludeWhenPowerZero && a.whenPowerZero === true) return false;
    if (banished !== undefined && !banishRedirectFilterMatches(a, banished)) return false;
    return true;
  });
}

/** frontOnly の位置限定を、能力保持側 zi と除去前の被バニッシュ側 zoneIdx で評価する。 */
export function banishRedirectFrontMatches(
  action: EffectAction,
  holderZoneIdx: number,
  banished?: BanishedCardAttrs,
): boolean {
  const acts = collectBanishRedirectActions(action);
  return acts.some(a => a.frontOnly !== true || banished?.zoneIdx === 2 - holderZoneIdx);
}

/**
 * 場のシグニ1体の**実効レベル**（表記レベル＋`temp_level_mods`）。レベル不明・場に居ないは 0。
 * ⚠`calcSigniLevels` は【常】の動的レベル（`LEVEL_MOD_PER_COUNT` 等）まで見る重い版で、
 *   `calcFieldPowers` の中から呼ぶと計算順が絡む。パワー計算中の倍率にはこちらの軽い版を使う
 *   （`computeBanishedAttrs` の level と同じ取り方＝engine 内で同一の意味になる）。
 */
export function effectiveSigniLevel(
  state: PlayerState,
  num: string,
  cardMap: Map<string, CardData>,
): number {
  const baseNum = num.includes('#') ? num.slice(0, num.indexOf('#')) : num;
  const base = parseInt(cardMap.get(baseNum)?.Level ?? '', 10);
  if (isNaN(base)) return 0;
  return base + (state.temp_level_mods ?? []).filter(m => m.cardNum === num).reduce((s, m) => s + m.delta, 0);
}

/**
 * 被バニッシュシグニの属性（レベル/凍結/チャーム/感染）を除去前の盤面から取得する（タスク12(xliv)）。
 * `banishRedirectFilterMatches` の target.filter 属性限定を評価するのに使う。
 * removeFromField 前の state と対象 num を渡すこと（除去後はゾーン添字状態が失われる）。
 * 対象が場に居ない/レベル不明なら level は undefined（level フィルタは不成立扱い）。
 */
export function computeBanishedAttrs(
  state: PlayerState,
  num: string,
  cardMap: Map<string, CardData>,
): BanishedCardAttrs | undefined {
  const zi = state.field.signi.findIndex(s => s?.at(-1) === num);
  if (zi < 0) return undefined;
  const base = parseInt(cardMap.get(num)?.Level ?? '', 10);
  const level = isNaN(base)
    ? undefined
    : base + (state.temp_level_mods ?? []).filter(m => m.cardNum === num).reduce((s, m) => s + m.delta, 0);
  return {
    zoneIdx: zi,
    level,
    frozen: (state.field.signi_frozen?.[zi] ?? false),
    hasCharm: (state.field.signi_charms?.[zi] ?? null) !== null,
    infected: (state.field.signi_virus?.[zi] ?? 0) > 0,
  };
}

/**
 * 効果経路（バトル/パワー0以外）のバニッシュに対し、置換能力の持ち主 `holder` の場にある
 * 【常】 BANISH_REDIRECT（redirectTo:'trash'）が適用されるかを、on-the-fly で走査する（タスク12(xliv)(a2)）。
 *
 * BattleScreen のバトル・パワー0経路と同じく `banishRedirectAppliesFrom` で判定するが、効果経路なので
 * `battlingNum=null`（`bySource:'battle_with_this'`＝「このシグニとのバトルによる」は不適用。
 * `bySource:'by_this'`＝「このシグニによる」は `effectSourceNum` が holder 自身のときだけ適用＝タスク12(xliv)(a3)）
 * ＋`excludeWhenPowerZero`
 * （パワー0専用の置換は不適用）で絞る。`banished` 属性で target.filter（レベル/凍結/感染/チャーム）も評価する。
 *
 * activeCondition は holder 視点で評価する。`DURING_ATTACK_PHASE` 限定の置換は turnPhase が判らない効果経路
 * では発火経路（アタックフェイズか）を確定できないため保守的にスキップする（過剰発火を避ける＝軽微な過小実行）。
 * turnPhase が渡されればそれで正しく評価する。
 */
export function fieldEffectBanishRedirectToTrash(
  holder: PlayerState,
  victim: PlayerState,
  cardMap: Map<string, CardData>,
  banished?: BanishedCardAttrs,
  turnPhase?: TurnPhase,
  effectivePowers?: Map<string, number>,
  effectSourceNum?: string,
): boolean {
  for (const [zi, stack] of holder.field.signi.entries()) {
    const n = stack?.at(-1);
    if (!n) continue;
    for (const e of (cardMap.get(n)?.effects ?? [])) {
      if (e.effectType !== 'CONTINUOUS') continue;
      if (!banishRedirectAppliesFrom(e.action, n, null, banished, { excludeWhenPowerZero: true, effectSourceNum })) continue;
      // frontOnly は能力保持側の zi が必要なので、この場効果走査でだけ位置を突き合わせる。
      // 被バニッシュ位置が不明なら過剰 redirect を避けて不適用。
      if (!banishRedirectFrontMatches(e.action, zi, banished)) continue;
      // フェイズ限定の置換は効果経路で phase が不明なら保守的にスキップ（過剰発火を避ける）
      if (e.activeCondition?.type === 'DURING_ATTACK_PHASE' && turnPhase === undefined) continue;
      // isOwnerTurn は turnPhase 未指定時の DURING_ATTACK_PHASE では使われず、他の condition（HAS_CARD_IN_FIELD 等）は
      // ターン非依存なので true 固定でよい
      if (!checkActiveCondition(e.activeCondition, holder, victim, true, cardMap, n, effectivePowers, undefined, turnPhase)) continue;
      return true;
    }
  }
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
  turnPhase?: TurnPhase,
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

    // 相手効果によるパワー修正を無効化するシグニ。保護能力は otherState 側から見て
    // subjectOwner:self=otherState、opponent=ownerState。裸の「シグニ」は any で両盤面を守る。
    const ownerPowerProtection: PowerDeltaProtection = { minus: new Set(), plus: new Set() };
    const otherPowerProtection: PowerDeltaProtection = { minus: new Set(), plus: new Set() };
    const otherPowerProtected = otherPowerProtection.minus!; // 既存 minus STUB 用の別名
    const allOtherSigniProtectionSources = new Set<string>();
    const protectionHosts = otherState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []);
    const lrig = otherState.field.lrig.at(-1); if (lrig) protectionHosts.push(lrig);
    const assistL = otherState.field.assist_lrig_l?.at(-1); if (assistL) protectionHosts.push(assistL);
    const assistR = otherState.field.assist_lrig_r?.at(-1); if (assistR) protectionHosts.push(assistR);
    protectionHosts.push(...activeKeyAbilitySources(otherState));
    const addMatching = (state: PlayerState, set: Set<string>, filter?: TargetFilter, only?: string) => {
      for (let zi = 0; zi < state.field.signi.length; zi++) {
        const top = state.field.signi[zi]?.at(-1);
        if (!top || (only && top !== only)) continue;
        if (!matchesStateFilter(state, zi, filter)) continue;
        if (!matchesFilter(cardMap.get(top.includes('#') ? top.slice(0, top.indexOf('#')) : top), filter)) continue;
        set.add(top);
      }
    };
    for (const topNum of protectionHosts) {
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(eff.activeCondition, otherState, ownerState, !isOwnerTurn, cardMap, topNum)) continue;
        const act = eff.action as import('../types/effects').StubAction;
        if (act.type === 'STUB' && act.id === 'PREVENT_POWER_MINUS_BY_OPP') otherPowerProtected.add(topNum);
        if (act.type === 'STUB' && act.id === 'PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP') allOtherSigniProtectionSources.add(topNum);
        const p = act.type === 'STUB' ? act.powerModifyProtection : undefined;
        if (p) {
          const targets: Array<[PlayerState, PowerDeltaProtection]> = [];
          if (p.subjectOwner === 'self' || p.subjectOwner === 'any') targets.push([otherState, otherPowerProtection]);
          if (p.subjectOwner === 'opponent' || p.subjectOwner === 'any') targets.push([ownerState, ownerPowerProtection]);
          for (const [state, protection] of targets) {
            const only = p.thisCardOnly && state === otherState ? topNum : undefined;
            if (p.thisCardOnly && state !== otherState) continue;
            for (const direction of p.directions) addMatching(state, protection[direction]!, p.subjectFilter, only);
          }
        }
      }
    }
    // PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: フィールド全シグニをprotectedセットに追加
    // ⚠発生源ごとに「自分以外」を足す（兄弟実装 PREVENT_SIGNI_DOWN_BY_OPP_ALL と同じ形）。
    // 発生源をまとめて除外すると、同じ能力を持つシグニが2体並んだとき互いに保護し合えなくなる。
    for (const protectionSource of allOtherSigniProtectionSources) {
      for (const stack of otherState.field.signi) {
        const top = stack?.at(-1);
        if (top && top !== protectionSource) otherPowerProtected.add(top);
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
    if (blockOwnerPosDelta) {
      // PREVENT_OPP_POWER_PLUS（WXDi-P14-048「対戦相手の【常】能力の効果によって、シグニのパワーは＋されない」）は
      // 「シグニ」＝両盤面の全シグニを対象とする。owner の正 CONT デルタを owner 側だけでなく other 側シグニにも
      // ブロックする（旧 blockOwnerPosDelta の effectiveDelta=0 が両ターゲット経路に効いていた挙動を厳密に保つ）。
      ownerPowerProtection.plus = allFieldSigniNums(ownerState);
      for (const n of allFieldSigniNums(otherState)) otherPowerProtection.plus!.add(n);
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
            applyDeltaToCard(driveNum, 3000, powers, ownerPowerProtection);
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
        if (lv4Count >= 3) applyDeltaToCard(topNum, 2000, powers, ownerPowerProtection);
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
    candidates.push(...activeKeyAbilitySources(ownerState));

    // アクセカードのCONTINUOUS効果（パワー修正のみ）をホストシグニに適用
    // 例: 「これにアクセされているシグニはパワー+3000を得る」
    // キーワード付与（ランサー等）はBattleScreen側で collectAcceCardKeywords で処理
    for (let zi = 0; zi < 3; zi++) {
      const acceNums = acceCardsAt(ownerState.field, zi);
      if (acceNums.length === 0) continue;
      const hostStack = ownerState.field.signi[zi];
      if (!hostStack || hostStack.length === 0) continue;
      const hostNum = hostStack[hostStack.length - 1];
      if (!powers.has(hostNum)) continue;
      for (const acceNum of acceNums) for (const eff of (effectsMap.get(acceNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        if (eff.activeCondition && eff.activeCondition.type !== 'IS_SELF_ACCE_CARD') continue;
        const act = eff.action;
        if (act.type === 'POWER_MODIFY') {
          const pmAct = act as import('../types/effects').PowerModifyAction;
          if (typeof pmAct.delta === 'number') {
            // ＜クラス＞／《カード名》限定のホスト宛バフは、ホストが条件を満たすときのみ加算する。
            // acceHost は「装着先ホスト」を表す関係フィルタなので、判定からは除外する（WD18-013 ケチャ
            // ＝＜調理＞限定、WX20-072 チョコプレート＝《コードオーダーウェディング》限定 等）。
            const f = pmAct.target?.filter;
            if (f) {
              const rest = { ...f }; delete rest.acceHost;
              if (Object.keys(rest).length > 0) {
                const hostBase = hostNum.includes('#') ? hostNum.slice(0, hostNum.indexOf('#')) : hostNum;
                if (!matchesFilter(cardMap.get(hostBase), rest)) continue;
              }
            }
            applyDeltaToCard(hostNum, pmAct.delta, powers, ownerPowerProtection);
          }
        }
      }
    }

    // スタック下カードの CONTINUOUS「このカードの上にあるシグニのパワーを＋N」をホストへ適用（aboveSelf）。
    // 上の candidates は各ゾーンの**最前面だけ**を効果元として走査するため、下に置かれたカードの能力は
    // 一切拾われない。ここは aboveSelf を持つ POWER_MODIFY に限って下カードを見に行く（signi_acce ループの
    // スタック版。＜クラス＞/《名前》/色 限定はホスト側を matchesFilter で判定）。
    // ⚠activeCondition 付きは評価器を通していないので適用しない（過剰実行を作らない側へ倒す）。
    for (const stack of ownerState.field.signi) {
      if (!stack || stack.length < 2) continue;
      const hostNumAS = stack[stack.length - 1];
      if (!powers.has(hostNumAS)) continue;
      for (const underNum of stack.slice(0, -1)) {
        for (const eff of (effectsMap.get(underNum) ?? [])) {
          if (eff.effectType !== 'CONTINUOUS' || eff.activeCondition) continue;
          const actAS = eff.action;
          if (actAS.type !== 'POWER_MODIFY') continue;
          const pmAS = actAS as import('../types/effects').PowerModifyAction;
          if (!pmAS.target?.filter?.aboveSelf || typeof pmAS.delta !== 'number') continue;
          const restAS = { ...pmAS.target.filter }; delete restAS.aboveSelf;
          if (Object.keys(restAS).length > 0) {
            const hostBaseAS = hostNumAS.includes('#') ? hostNumAS.slice(0, hostNumAS.indexOf('#')) : hostNumAS;
            if (!matchesFilter(cardMap.get(hostBaseAS), restAS)) continue;
          }
          applyDeltaToCard(hostNumAS, pmAS.delta, powers, ownerPowerProtection);
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

    // REMOVE_ABILITIES: 能力を失っているシグニ（CONTINUOUS REMOVE_ABILITIES＋一過性 abilities_removed）の
    // CONTINUOUS効果（自己パワー増減・キーワード付与等）は発生させない。
    const abilitiesRemovedCont = collectContinuousAbilitiesRemovedSigni(ownerState, otherState, isOwnerTurn, effectsMap, cardMap, '常');

    // 🆕`POWER_MODIFY_PER_OWN_COLOR`（`WX11-032`）用＝**そのシグニの実効色**（印刷色＋追加色）。
    //   `collectFieldSigniExtraColors` は `COLOR_INHERIT` / 下カードの色継承 / 強制色付与を全部たたむ
    //   唯一の実装なので、ここで数え直さずそれを引く（§4.2「同義の別キーを探す」）。
    //   ⚠**遅延評価**＝この型を持つ効果が1つも無い盤面では走らせない（全盤面で毎回呼ぶと重い）。
    let _ownerExtraColors: Map<string, string[]> | undefined;
    const ownerExtraColors = {
      get: (num: string): string[] =>
        (_ownerExtraColors ??= collectFieldSigniExtraColors(ownerState, cardMap, effectsMap, otherState, isOwnerTurn)).get(num) ?? [],
    };

    // 同一CardNumが複数ゾーンに存在する場合、効果元として重複処理しない
    const seenSources = new Set<string>();
    for (const topNum of candidates) {
      if (seenSources.has(topNum)) continue;
      seenSources.add(topNum);
      // REMOVE_ABILITIES: 能力喪失シグニのCONTINUOUS効果をスキップ
      if (abilitiesRemovedCont.has(topNum)) continue;
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
        if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topNum, powers, oppTrashColorLoss, turnPhase)) continue;
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
            if (target.filter?.frontOfSelf) {
              const ziHost = ownerState.field.signi.findIndex(s => s?.at(-1) === topNum);
              const frontNum = ziHost >= 0 ? otherState.field.signi[2 - ziHost]?.at(-1) : undefined;
              if (frontNum && powers.has(frontNum)) {
                const { frontOfSelf: _f, ...restFilter } = target.filter;
                const frontBase = frontNum.includes('#') ? frontNum.slice(0, frontNum.indexOf('#')) : frontNum;
                if (matchesFilter(cardMap.get(frontBase), restFilter)) {
                  applyDeltaToCard(frontNum, delta, powers, otherPowerProtection);
                }
              }
              continue;
            }
            // acceHost:「これにアクセされているシグニ」＝このカードのアクセ装着先ホスト宛。
            // 効果元（このカード）が場のシグニのときは自己適用しない。実際のホスト加算は
            // 下の signi_acce ループ（このカードがアクセとして付いている場合）が行う。
            if (target.filter?.acceHost) continue;
            // aboveSelf:「このカードの上にあるシグニ」＝このカードがスタック下に置かれているときのホスト宛。
            // 効果元（このカード）が最前面にいる間は「上にあるシグニ」が存在しない＝自己適用しない。
            // 実際のホスト加算は下のスタック下カードループが行う。
            if (target.filter?.aboveSelf) continue;
            const card = cardMap.get(topNum);
            if ((target.owner === 'self' || target.owner === 'any') &&
                matchesFilter(card, target.filter) &&
                powers.has(topNum)) {
              // POWER_FLIP: ownerState の自己バフを反転（正デルタ → 負デルタ）
              const selfDelta = flipOwnerPosDelta && delta > 0 ? -delta : delta;
              applyDeltaToCard(topNum, selfDelta, powers, ownerPowerProtection);
            }
            continue;
          }

          // count === 'ALL': 対象オーナーのシグニ全体に適用
          const targetIsOwner = target.owner === 'self' || target.owner === 'any';
          const targetIsOther  = target.owner === 'opponent' || target.owner === 'any';

          // 🆕`adjacentToSelf`＝「このシグニの**隣にある**あなたのシグニ」（`WXDi-P04-050-E2`／`WXDi-P00-053-E1`）。
          // 🔴2026-08-19 続き570 まで機構が無く、`owner:'self'/count:'ALL'` へ潰れて**自分の全シグニ（自分自身を含む）**
          //   に効いていた（§3 (cxxxvii)・`V-73` 実機検証で発見＝単独配置でも自分に＋3000 が乗る）。
          // ⚠**効果元自身は「隣」ではない**＝`ziHost` は含めない。効果元が場のシグニでなければ候補ゼロ＝no-op。
          // ⚠「あなたのシグニ」限定の語彙なので**相手側には適用しない**（`targetIsOther` 側は素通し禁止）。
          let adjacentZones: Set<number> | undefined;
          if (target.filter?.adjacentToSelf) {
            const ziHost = ownerState.field.signi.findIndex(st => st?.at(-1) === topNum);
            if (ziHost < 0) continue;
            adjacentZones = new Set([ziHost - 1, ziHost + 1]
              .filter(z => z >= 0 && z < ownerState.field.signi.length));
          }

          // PREVENT_OPP_POWER_PLUS: otherState（相手）のCONTによる正デルタをブロック
          const effectiveDelta = delta;
          // levelLtSelf/levelGtSelf（このシグニ/このルリグより低い/高いレベル）を効果元(topNum)基準で解決
          const contFilter = resolveContSelfLevel(target.filter, topNum, cardMap);
          if (effectiveDelta === 0 && delta !== 0) { /* ブロックされた正デルタ */ }
          else {
            if (targetIsOwner) {
              // POWER_FLIP: ownerState の自己バフを反転（正デルタ → 負デルタ）
              const ownerDelta = flipOwnerPosDelta && effectiveDelta > 0 ? -effectiveDelta : effectiveDelta;
              applyDeltaToState(ownerState, ownerDelta, contFilter, cardMap, powers,
                ownerPowerProtection, undefined, (mod.excludeSelf || target.filter?.excludeSelf) ? topNum : undefined,
                adjacentZones);
            }
            if (targetIsOther && !adjacentZones) {
              applyDeltaToState(otherState, effectiveDelta, contFilter, cardMap, powers, otherPowerProtection, dblOtherMult);
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
                  applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
                }
              } else {
                if (target.owner === 'self' || target.owner === 'any')
                  applyDeltaToState(ownerState, delta, target.filter, cardMap, powers, ownerPowerProtection);
                if (target.owner === 'opponent' || target.owner === 'any')
                  applyDeltaToState(otherState, delta, target.filter, cardMap, powers, otherPowerProtection, dblOtherMult);
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
          applyDeltaToState(ownerState, stackDelta, mod.target.filter, cardMap, powers, ownerPowerProtection);
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
            applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
          }
        }

        // POWER_MODIFY_PER_FIELD: 場のフィルタ一致カード数に比例したパワー増減
        const perFieldMods = extractPowerModifiesPerField(effect.action);
        for (const mod of perFieldMods) {
          const countStates = mod.countOwner === 'self' ? [ownerState]
            : mod.countOwner === 'opponent' ? [otherState]
            : [ownerState, otherState];
          const countTypes = mod.countFilter.cardType === undefined ? []
            : Array.isArray(mod.countFilter.cardType) ? mod.countFilter.cardType
            : [mod.countFilter.cardType];
          const countsLrig = countTypes.includes('ルリグ') || countTypes.includes('アシストルリグ');
          let count = 0;
          for (const countState of countStates) {
            for (const stack of countState.field.signi) {
              const countNum = stack?.at(-1);
              if (!countNum || (mod.excludeSelf && countNum === topNum)) continue;
              if (matchesFilter(cardMap.get(countNum), mod.countFilter)) count++;
            }
            if (countsLrig) {
              for (const countNum of lrigZoneTops(countState.field)) {
                if (!countNum || (mod.excludeSelf && countNum === topNum)) continue;
                if (matchesFilter(cardMap.get(countNum), mod.countFilter)) count++;
              }
            }
          }
          const delta = mod.deltaPerUnit * count;
          if (delta === 0) continue;
          if (mod.target.count !== 'ALL') {
            if ((mod.target.owner === 'self' || mod.target.owner === 'any') && powers.has(topNum)) {
              applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
            }
          } else {
            if (mod.target.owner === 'self' || mod.target.owner === 'any') {
              applyDeltaToState(ownerState, delta, mod.target.filter, cardMap, powers, ownerPowerProtection);
            }
            if (mod.target.owner === 'opponent' || mod.target.owner === 'any') {
              applyDeltaToState(otherState, delta, mod.target.filter, cardMap, powers, otherPowerProtection, dblOtherMult);
            }
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
            const prot = tgtState === otherState ? otherPowerProtection : ownerPowerProtection;
            const mult = tgtState === otherState ? dblOtherMult : 1;
            applyDeltaToState(tgtState, delta, mod.target.filter, cardMap, powers, prot, mult);
          } else if (powers.has(topNum)) {
            applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
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
            applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
          }
        }

        // POWER_MODIFY_PER_LIFE_COUNT: ライフクロス枚数に比例したパワー増減（常時）
        const perLifeMods = extractPowerModifiesPerLifeCount(effect.action);
        for (const mod of perLifeMods) {
          const lifeState = mod.lifeOwner === 'self' ? ownerState : otherState;
          const count = lifeState.life_cloth.length;
          const delta = mod.deltaPerLife * count;
          if (delta !== 0 && powers.has(topNum)) {
            applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
          }
        }

        // POWER_MODIFY_PER_DECK_COUNT: デッキ枚数 unitSize 枚ごとにパワー増減（常時・PR-442「10枚につき＋4000」）
        const perDeckMods = extractPowerModifiesPerDeckCount(effect.action);
        for (const mod of perDeckMods) {
          const deckState = mod.deckOwner === 'self' ? ownerState : otherState;
          const unit = mod.unitSize > 0 ? mod.unitSize : 1;
          const delta = mod.deltaPerUnit * Math.floor(deckState.deck.length / unit);
          if (delta !== 0 && powers.has(topNum)) {
            applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
          }
        }

        // POWER_MODIFY_PER_VIRUS_COUNT: 場のウィルス数に比例したパワー増減（常時）
        const perVirusMods = extractPowerModifiesPerVirusCount(effect.action);
        for (const mod of perVirusMods) {
          const vState = mod.virusOwner === 'self' ? ownerState : otherState;
          const virusCount = (vState.field.signi_virus ?? []).reduce((s, v) => s + (v ?? 0), 0);
          const delta = mod.deltaPerVirus * virusCount;
          if (delta !== 0 && powers.has(topNum)) {
            applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
          }
        }

        // POWER_MODIFY_PER_ENERGY_COLOR: エナゾーンのカードが持つ色の種類数に比例したパワー増減（常時）
        // 「このシグニのパワーはあなたのエナゾーンにあるカードが持つ色の種類1つにつき＋N」(G074=WX14-063等)。
        // 色種類=白赤青緑黒の個別カウント（マルチエナは各色別／無色は不算入）。target.count!=='ALL'=このシグニ自身。
        const perEnergyColorMods = extractPowerModifiesPerEnergyColor(effect.action);
        for (const mod of perEnergyColorMods) {
          const enaState = mod.energyOwner === 'self' ? ownerState : otherState;
          const colorSet = new Set<string>();
          for (const cn of enaState.energy) {
            const colorStr = cardMap.get(cn)?.Color ?? '';
            for (const col of ['白', '赤', '青', '緑', '黒']) {
              if (colorStr.includes(col)) colorSet.add(col);
            }
          }
          const delta = mod.deltaPerColor * colorSet.size;
          if (delta !== 0) {
            if (mod.target.count !== 'ALL') {
              if ((mod.target.owner === 'self' || mod.target.owner === 'any') && powers.has(topNum)) {
                applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
              }
            } else {
              const tgtIsOwner = mod.target.owner === 'self' || mod.target.owner === 'any';
              const tgtIsOther = mod.target.owner === 'opponent' || mod.target.owner === 'any';
              if (tgtIsOwner) applyDeltaToState(ownerState, delta, mod.target.filter, cardMap, powers, ownerPowerProtection);
              if (tgtIsOther) applyDeltaToState(otherState, delta, mod.target.filter, cardMap, powers, otherPowerProtection, dblOtherMult);
            }
          }
        }

        // POWER_MODIFY_PER_OWN_COLOR: **そのシグニ自身が持つ色の種類**に比例したパワー増減（常時）。
        // 「このシグニのパワーは自身が持つ色の種類１つにつき＋4000される」（`WX11-032`）。
        // ⚠**実効色**で数える＝印刷色 ＋ `collectFieldSigniExtraColors`（`COLOR_INHERIT` 等）の追加色。
        //   印刷色だけで数えると `WX11-032`（緑・表記パワー0）は常に 1色＝＋4000 に固定され、
        //   エナから色を継ぐという**カードの本体**が消える。
        const perOwnColorMods = extractPowerModifiesPerOwnColor(effect.action);
        if (perOwnColorMods.length > 0) {
          const colorSet = new Set<string>();
          const printed = cardMap.get(topNum)?.Color ?? '';
          for (const col of ['白', '赤', '青', '緑', '黒']) if (printed.includes(col)) colorSet.add(col);
          for (const col of (ownerExtraColors.get(topNum) ?? [])) colorSet.add(col);
          for (const mod of perOwnColorMods) {
            const delta = mod.deltaPerColor * colorSet.size;
            if (delta !== 0 && powers.has(topNum)) {
              applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
            }
          }
        }

        // POWER_MODIFY_PER_ENERGY: エナゾーンのカード枚数に比例したパワー増減（常時）
        // 「このシグニのパワーはあなたのエナゾーンにあるカード1枚につき＋N」(WX09-019)。target.count!=='ALL'=このシグニ自身。
        const perEnergyMods = extractPowerModifiesPerEnergy(effect.action);
        for (const mod of perEnergyMods) {
          const enaState = mod.energyOwner === 'self' ? ownerState : otherState;
          const delta = mod.deltaPerCard * enaState.energy.length;
          if (delta !== 0) {
            if (mod.target.count !== 'ALL') {
              if ((mod.target.owner === 'self' || mod.target.owner === 'any') && powers.has(topNum)) {
                applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
              }
            } else {
              const tgtIsOwner = mod.target.owner === 'self' || mod.target.owner === 'any';
              const tgtIsOther = mod.target.owner === 'opponent' || mod.target.owner === 'any';
              if (tgtIsOwner) applyDeltaToState(ownerState, delta, mod.target.filter, cardMap, powers, ownerPowerProtection);
              if (tgtIsOther) applyDeltaToState(otherState, delta, mod.target.filter, cardMap, powers, otherPowerProtection, dblOtherMult);
            }
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
                applyDeltaToCard(topNum, delta, powers, ownerPowerProtection);
              }
            } else {
              const tgtIsOwner = mod.target.owner === 'self' || mod.target.owner === 'any';
              const tgtIsOther = mod.target.owner === 'opponent' || mod.target.owner === 'any';
              if (tgtIsOwner) applyDeltaToState(ownerState, delta, mod.target.filter, cardMap, powers, ownerPowerProtection);
              if (tgtIsOther) applyDeltaToState(otherState, delta, mod.target.filter, cardMap, powers, otherPowerProtection, dblOtherMult);
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
            const acceCount = allAcceCards(ownerState.field).length;
            const m = txt.match(/【アクセ】１枚につき[＋+]([０-９\d]+)/);
            if (m && acceCount > 0 && powers.has(topNum)) {
              applyDeltaToCard(topNum, acceCount * parseN(m[1]), powers, ownerPowerProtection);
            }
          }

          // DYNAMIC_LEVEL_BY_ENERGY: 「パワーはこのシグニのレベル１につき＋N」= 実効レベル×N
          if (stub.id === 'DYNAMIC_LEVEL_BY_ENERGY') {
            const m = txt.match(/パワーは.*?レベル１につき[＋+]([０-９\d]+)/);
            if (m && powers.has(topNum)) {
              const effLv = levelMods.get(topNum) ?? (parseInt(card?.Level ?? '0', 10) || 0);
              applyDeltaToCard(topNum, effLv * parseN(m[1]), powers, ownerPowerProtection);
            }
          }

          // POWER_BY_RISE_SIGNI_COUNT: ライズ状態のシグニ（スタック2枚以上）数×値
          if (stub.id === 'POWER_BY_RISE_SIGNI_COUNT') {
            const riseCount = ownerState.field.signi.filter(s => (s?.length ?? 0) >= 2).length;
            const m = txt.match(/《ライズアイコン》.*シグニ１体につき[＋+]([０-９\d]+)/);
            if (m && riseCount > 0 && powers.has(topNum)) {
              applyDeltaToCard(topNum, riseCount * parseN(m[1]), powers, ownerPowerProtection);
            }
          }

          // POWER_BY_CHARM_COUNT: 場のチャーム枚数×値（自分の場のみ）
          if (stub.id === 'POWER_BY_CHARM_COUNT') {
            const charmCount = (ownerState.field.signi_charms ?? []).filter(c => c !== null).length;
            const m = txt.match(/【チャーム】１枚につき[＋+]([０-９\d]+)/);
            if (m && charmCount > 0 && powers.has(topNum)) {
              applyDeltaToCard(topNum, charmCount * parseN(m[1]), powers, ownerPowerProtection);
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
              applyDeltaToCard(topNum, colorSet.size * parseN(m[1]), powers, ownerPowerProtection);
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
              applyDeltaToCard(topNum, typeCount * parseN(m[1]), powers, ownerPowerProtection);
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
              applyDeltaToCard(topNum, totalPMPC, powers, ownerPowerProtection);
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

    // プレイヤー自身がゲーム中得たCONTINUOUS能力。場のカードを効果元に持たないため、
    // count:'ALL' の対象指定だけをプレイヤー視点で適用する。
    for (const effect of (ownerState.game_granted_effects ?? [])) {
      if (effect.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(effect.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, '', powers, oppTrashColorLoss, turnPhase)) continue;
      for (const mod of extractPowerModifies(effect.action)) {
        if (mod.target.count !== 'ALL') continue;
        const delta = typeof mod.delta === 'number' ? mod.delta : 0;
        if (mod.target.owner === 'self' || mod.target.owner === 'any') {
          applyDeltaToState(ownerState, delta, mod.target.filter, cardMap, powers, ownerPowerProtection);
        }
        if (mod.target.owner === 'opponent' || mod.target.owner === 'any') {
          applyDeltaToState(otherState, delta, mod.target.filter, cardMap, powers, otherPowerProtection);
        }
      }
    }
  };

  applyEffects(myState, opState, isMyTurn);
  applyEffects(opState, myState, !isMyTurn);

  // temp_power_mods（起動・自動効果によるターン内一時パワー修正）を適用
  // negatePositiveFor: このセットにあるシグニへの正デルタを負に置換（REPLACE_PLUS_N）
  // doubleNeg: このstateのシグニへの負デルタを2倍にする（対戦相手が double_power_minus_this_turn を持つ場合。WX04-038-E1）
  const applyTempMods = (state: PlayerState, negatePositiveFor?: Set<string>, doubleNeg = false, sourceDoublers: string[] = []) => {
    const doublers = state.double_power_minus_targets ?? [];
    const multipliers = state.power_minus_multipliers_this_turn ?? {};
    for (const mod of [...(state.temp_power_mods ?? []), ...(state.power_mods_until_opp_turn ?? [])] as Array<{ cardNum: string; delta: number; srcType?: string; srcCardNum?: string }>) {
      if (powers.has(mod.cardNum)) {
        // DOUBLE_OWN_POWER_MINUS（特定シグニ）/ DOUBLE_POWER_MINUS（このターン・相手フラグ。シグニ発生元のみ）: 負デルタを2倍に
        // srcType 未設定はシグニ発生元として扱う（STUB系シグニ効果が大多数）。レゾナもシグニ。
        const fromSigni = mod.srcType === undefined || mod.srcType.includes('シグニ') || mod.srcType.includes('レゾナ');
        // §6.4 O-10: 倍率つき（「代わりに３倍－される」）は 2倍軸と**大きい方**を採る（二重掛けしない）。
        const mult = Math.max(
          doublers.includes(mod.cardNum) || (mod.srcCardNum != null && sourceDoublers.includes(mod.srcCardNum)) || (doubleNeg && fromSigni) ? 2 : 1,
          multipliers[mod.cardNum] ?? 1,
        );
        let delta = mod.delta < 0 && mult > 1 ? mod.delta * mult : mod.delta;
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
  applyTempMods(myState, negateForOp, opState.double_power_minus_this_turn === true, opState.double_power_minus_sources);
  applyTempMods(opState, myState.replace_opp_power_plus ? opSigniNums : undefined, myState.double_power_minus_this_turn === true, myState.double_power_minus_sources);

  // 場レベル power grant は active 中の盤面へ毎回適用する。cardNum スナップショットではないため、
  // 予約後に場へ出たシグニも filter/zone/condition が一致すれば対象になる。
  const applyActiveFieldPowerGrants = (state: PlayerState, otherState: PlayerState, negatePositive = false) => {
    const targetDoublers = state.double_power_minus_targets ?? [];
    const sourceDoublers = otherState.double_power_minus_sources ?? [];
    for (const stack of state.field.signi) {
      const cardNum = stack?.at(-1);
      if (!cardNum || !powers.has(cardNum)) continue;
      for (const grant of activeFieldGrantsForSigni(state, otherState, cardNum, cardMap)) {
        if (grant.kind !== 'power') continue;
        // 動的 delta（§6.4 O-16(a)）＝「そのシグニのレベル１につき±N」。倍率は**今そのゾーンにいる
        // シグニ自身**の実効レベルなので、grant を積んだ時点ではなく**適用のたびに**掛ける。
        // レベルの取り方は `computeBanishedAttrs` と同じ（表記レベル＋temp_level_mods）。
        const scaledDelta = grant.perTargetLevel
          ? grant.delta * effectiveSigniLevel(state, cardNum, cardMap)
          : grant.delta;
        if (scaledDelta === 0) continue;
        const fromSigni = grant.srcType === undefined || grant.srcType.includes('シグニ') || grant.srcType.includes('レゾナ');
        const doubled = targetDoublers.includes(cardNum)
          || (grant.srcCardNum != null && sourceDoublers.includes(grant.srcCardNum))
          || (otherState.double_power_minus_this_turn === true && fromSigni);
        // §6.4 O-10: 倍率つき（「代わりに３倍－される」）＝2倍軸と大きい方を採る。
        const mult = scaledDelta < 0
          ? Math.max(doubled ? 2 : 1, (state.power_minus_multipliers_this_turn ?? {})[cardNum] ?? 1)
          : 1;
        const rawDelta = mult > 1 ? scaledDelta * mult : scaledDelta;
        const delta = negatePositive && rawDelta > 0 ? -rawDelta : rawDelta;
        powers.set(cardNum, (powers.get(cardNum) ?? 0) + delta);
      }
    }
  };
  applyActiveFieldPowerGrants(myState, opState, opState.replace_opp_power_plus === true);
  applyActiveFieldPowerGrants(opState, myState, myState.replace_opp_power_plus === true);

  // field_power_mods（「そのシグニが場にあるかぎり＋N」の永続パワー修正・WXDi-P10-034 表向き +5000）。
  //   temp_power_mods と異なりターン境界でクリアしない。場に居る cardNum にのみ適用（powers.has で守る＝場を離れれば失効）。
  const applyFieldMods = (state: PlayerState) => {
    for (const mod of state.field_power_mods ?? []) {
      if (powers.has(mod.cardNum)) powers.set(mod.cardNum, (powers.get(mod.cardNum) ?? 0) + mod.delta);
    }
  };
  applyFieldMods(myState);
  applyFieldMods(opState);

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

// CONT POWER_MODIFY の「このシグニ/このルリグより低い/高いレベル」（levelLtSelf/levelGtSelf）を
// 効果元カード（hostNum＝CONT を持つシグニ/ルリグ）のレベル基準で level 制約へ解決する。
// applyDeltaToState は matchesFilter に生フィルタを渡し動的マーカーを無視するため、ここで解決しておく。
// 参照不能（レベル非数値）ならレベル制限なしへフォールバック（動的フィルタの既存慣例）。WXEX2-25-E3。
function resolveContSelfLevel(
  filter: TargetFilter | undefined,
  hostNum: string,
  cardMap: Map<string, CardData>,
): TargetFilter | undefined {
  if (!filter || (!filter.levelLtSelf && !filter.levelGtSelf)) return filter;
  const { levelLtSelf, levelGtSelf, ...rest } = filter;
  const hostLv = parseInt(cardMap.get(hostNum)?.Level ?? '', 10);
  if (isNaN(hostLv)) return rest;
  if (levelLtSelf) return { ...rest, level: { max: hostLv - 1 } };
  if (levelGtSelf) return { ...rest, level: { min: hostLv + 1 } };
  return rest;
}

interface PowerDeltaProtection {
  minus?: Set<string>;
  plus?: Set<string>;
}

function allFieldSigniNums(state: PlayerState): Set<string> {
  return new Set(state.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []));
}

function applyDeltaToCard(
  cardNum: string,
  delta: number,
  powers: Map<string, number>,
  protection?: PowerDeltaProtection | Set<string>,
) {
  const p = protection instanceof Set ? { minus: protection } : protection;
  if (delta < 0 && p?.minus?.has(cardNum)) return;
  if (delta > 0 && p?.plus?.has(cardNum)) return;
  powers.set(cardNum, (powers.get(cardNum) ?? 0) + delta);
}

function applyDeltaToState(
  state: PlayerState,
  delta: number,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  powers: Map<string, number>,
  powerProtection?: PowerDeltaProtection | Set<string>,
  negMultiplier?: number,
  excludeNum?: string, // excludeSelf: 効果元カード自身を除外
  /**
   * 適用先のシグニゾーンを限定する（省略＝全ゾーン）。`adjacentToSelf`（「このシグニの隣にある」）専用。
   * ⚠**ゾーン集合はここでしか作れない**（`matchesStateFilter` は効果元のゾーンを知らない）。
   */
  onlyZones?: ReadonlySet<number>,
) {
  const effectiveDelta = (negMultiplier !== undefined && delta < 0) ? delta * negMultiplier : delta;
  // 同一CardNumが複数ゾーンにある場合、同じpowersエントリに重複適用しない
  const seen = new Set<string>();
  for (let zoneIdx = 0; zoneIdx < state.field.signi.length; zoneIdx++) {
    const stack = state.field.signi[zoneIdx];
    if (!stack || stack.length === 0) continue;
    if (onlyZones && !onlyZones.has(zoneIdx)) continue;
    const topNum = stack[stack.length - 1];
    if (seen.has(topNum)) continue;
    seen.add(topNum);
    if (topNum === excludeNum) continue;
    if (!powers.has(topNum)) continue;
    const protection = powerProtection instanceof Set ? { minus: powerProtection } : powerProtection;
    if (effectiveDelta < 0 && protection?.minus?.has(topNum)) continue;
    if (effectiveDelta > 0 && protection?.plus?.has(topNum)) continue;
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

  // 🔴**ストア済みのコスト修正**（`execCostIncrease` が `PlayerState.cost_modifiers` へ積む
  // ACTIVATED/AUTO 由来の増加）。**ここに足すまで書かれるだけで誰も読まない死にストアだった**
  // （§5.3 `O-126`・実測 `WX09-Re05`「このターン、対戦相手のスペルの使用コストは《無×3》増える」と
  //  `WXK11-003` の2枚が**完全な no-op**）。CONTINUOUS 由来（上の scanOwner）は盤面から毎回読むので
  // ストアに載らない＝この2経路は排他。
  // ⚠**収集をこの関数1本に寄せる**のが要点＝人間UI（`BattleScreen` の `activeCostMods` useMemo）と
  //   CPU（`artsUseGate.buildArtsPayerCtx`）が**同じ式**を見る（両方に写経すると片方だけ直る）。
  // ⚠`cost_modifiers` は「**その PlayerState 自身のコスト**への修正」＝`execCostIncrease` は
  //   `targetOwner` 側の state へ積む。よって myState 側は forMy、opState 側は forOp。
  const storedMods = (s: PlayerState): ActiveCostMod[] =>
    (s.cost_modifiers ?? []).map(m => ({
      direction: m.direction, targetCardType: m.targetCardType, amount: m.amount as EnergyCost[],
    }));
  forMy.push(...storedMods(myState));
  forOp.push(...storedMods(opState));

  return { forMy, forOp };
}

/**
 * collectGrowCostReductions: 自分の場のシグニ／センタールリグが持つ CONTINUOUS な
 * GROW_COST_REDUCTION（および COST_REDUCTION isGrowCost）を集め、色ごとの減少量を返す。
 * calcActiveCostMods が `isGrowCost` をスキップして残した「別経路」（effectEngine.ts:1655 の想定）を埋める。
 */
export function collectGrowCostReductions(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): { color: string; count: number }[] {
  const totals = new Map<string, number>();
  const add = (color: string, count: number) => { if (count > 0) totals.set(color, (totals.get(color) ?? 0) + count); };
  const baseNumG = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  const scan = (action: EffectAction) => {
    if (action.type === 'GROW_COST_REDUCTION') {
      const gcr = action as import('../types/effects').GrowCostReductionAction;
      // per-count scaling:「トラッシュの<filter>N枚につき」＝一致枚数を数えて floor(match/N) 倍する
      // （一致 N 未満なら 0＝減額なし）。perCount 無しは従来どおり固定減額。
      let mult = 1;
      if (gcr.perCount) {
        const matchCount = state.trash.filter(n => matchesFilter(cardMap.get(baseNumG(n)), gcr.perCount!.filter)).length;
        mult = Math.floor(matchCount / gcr.perCount.count);
      }
      if (mult > 0) for (const r of gcr.reduction) add(r.color, r.count * mult);
    } else if (action.type === 'COST_REDUCTION' && (action as CostReductionAction).isGrowCost) {
      for (const r of (action as CostReductionAction).reduction) add(r.color, r.count);
    } else if (action.type === 'SEQUENCE') {
      for (const s of (action as import('../types/effects').SequenceAction).steps) scan(s);
    }
  };
  const candidates: string[] = [];
  for (const stack of state.field.signi) if (stack?.length) candidates.push(stack[stack.length - 1]);
  if (state.field.lrig.length) candidates.push(state.field.lrig[state.field.lrig.length - 1]);
  for (const num of candidates) {
    for (const eff of (effectsMap.get(num) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, num)) continue;
      scan(eff.action);
    }
  }
  return [...totals.entries()].map(([color, count]) => ({ color, count }));
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
  candidates.push(...activeKeyAbilitySources(ownerState));

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
  /**
   * 「〈コスト〉を**支払わないかぎり**アタックできない」＝**払えば通る**シグニ（CardNum → 《無》の枚数）。
   * ⚠`cannotAttackSigni`（無条件禁止）とは**別の集合**にする（§6.4 O-31）。同じ集合に入れると
   *   「払えば通る」が「絶対に通らない」に化ける＝過剰実行。判定と引き落としは
   *   `signiAttackBanCost`／`signiAttackBlockReason` の1本にまとめて合算する。
   */
  cannotAttackSigniUnlessPayColorless: Map<string, number>;
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
  /**
   * `ATTACK_COUNT_BY_POWER`（「自身のパワー10000につき一度までしかアタックできない」）の**実効**パワー。
   * 省略すると印刷パワーへフォールバックする（§6.4 O-10・続き507）。
   * ⚠**呼び出し元で渡し忘れると回数が過少になる**＝`WX22-022` は印刷15000で「1回」に固定され、
   *   パワー＋5000 を受けても2回目が撃てない（＝同居する「ダウン状態でもアタックできる」が死ぬ）。
   */
  effectivePowers?: Map<string, number>,
): ContinuousBlockResult {
  const forSelf = new Set<string>();
  const forOther = new Set<string>();
  const cannotAttackSigni = new Set<string>();
  const cannotAttackSigniUnlessPayColorless = new Map<string, number>();

  function scanField(fieldOwner: PlayerState, fieldOther: PlayerState, isFieldOwnerTurn: boolean, isMe: boolean) {
    for (const stack of fieldOwner.field.signi) {
      if (!stack || stack.length === 0) continue;
      const topNum = stack[stack.length - 1];
      const effects = effectsMap.get(topNum) ?? [];
      for (const effect of effects) {
        if (effect.effectType !== 'CONTINUOUS') continue;
        if (!checkActiveCondition(effect.activeCondition, fieldOwner, fieldOther, isFieldOwnerTurn, cardMap)) continue;
        for (const b of extractBlockActions(effect.action)) {
          // 「このシグニはアタックできない」＝自己アタック封じ。parser が2形（ATTACK_SIGNI_SELF(PLAYER) と
          // ATTACK(SIGNI,owner:self)）を出し、実データは後者だが従来ここで拾われず無効化されていた（続き106・
          // WX05-023/WX13-043/WXK05-047/WX17-034/PR-402）。両形を受けて能力保持シグニ自身をアタック不可にする。
          if ((b.actionId === 'ATTACK_SIGNI_SELF'
               || (b.actionId === 'ATTACK' && b.target.type === 'SIGNI' && b.target.owner === 'self')) && isMe) {
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

  // センタールリグの CONTINUOUS BLOCK_ACTION を拾う。scanField はシグニゾーンしか見ないので、
  // ルリグ本体が課す制約はここで補完する。**self / opponent の両向きを見る**：
  //  - `self`     ＝ルリグが自分自身へ課す制約（「あなたのグロウフェイズをスキップする」= GROW など）
  //  - `opponent` ＝ルリグが**対戦相手へ**課す制約（「対戦相手は各ターンに一度しかアーツを使用できない」など）
  // 🔴**opponent 側は 2026-08-19 続き567 まで経路が無く恒久 no-op だった**（§3 (cxxxv)・`V-75`(C)-2 で発見）＝
  //   シグニなら scanField の `else` 分岐で拾えるのに、ルリグにはその対の分岐が無かった。live 母集団5枚
  //   （`WX04-005` DRAW_LIMIT_1／`WX05-011` USE_SPELL／`WX13-007` ARTS_LIMIT_1／`WXEX2-11`・`WD14-001` GUARD）。
  // ⚠向きは**カードの持ち主から見て**決める＝ME のルリグが `opponent` を指すなら forOther、相手のルリグなら forSelf。
  const scanLrigBlocks = (fieldOwner: PlayerState, fieldOther: PlayerState, isFieldOwnerTurn: boolean, isMe: boolean) => {
    if (fieldOwner.lrig_abilities_disabled) return;
    const lrigTop = fieldOwner.field.lrig.at(-1);
    if (!lrigTop) return;
    for (const effect of (effectsMap.get(lrigTop) ?? [])) {
      if (effect.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(effect.activeCondition, fieldOwner, fieldOther, isFieldOwnerTurn, cardMap, lrigTop)) continue;
      for (const b of extractBlockActions(effect.action)) {
        if (b.target.owner === 'self') (isMe ? forSelf : forOther).add(b.actionId);
        else if (b.target.owner === 'opponent') (isMe ? forOther : forSelf).add(b.actionId);
      }
    }
  };
  scanLrigBlocks(ownerState, otherState, isOwnerTurn, true);
  scanLrigBlocks(otherState, ownerState, !isOwnerTurn, false);

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
    if (!myFrontTop) continue;
    // 「《無》×Nを支払わないかぎり」形は**払えば通る**＝別の集合へ（§6.4 O-31）。
    // 枚数は parser が焼き込んだ `value` から読む（カード全文 regex を実行時に読まない）。
    const payFSA = (effectsMap.get(oppTop) ?? []).reduce((acc, eff) => {
      const act = eff.action as import('../types/effects').StubAction;
      if (eff.effectType !== 'CONTINUOUS' || act.type !== 'STUB' || act.id !== 'BLOCK_FRONT_SIGNI_ATTACK') return acc;
      return Math.max(acc, typeof act.value === 'number' ? act.value : 0);
    }, 0);
    if (payFSA > 0) {
      cannotAttackSigniUnlessPayColorless.set(myFrontTop,
        Math.max(cannotAttackSigniUnlessPayColorless.get(myFrontTop) ?? 0, payFSA));
    } else {
      cannotAttackSigni.add(myFrontTop);
    }
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
    // ⚠原文は「**自身のパワー**10000につき」＝いまのパワー（修正込み）。印刷パワーで数えると
    //   バフを受けても回数が増えない（§6.4 O-10・続き507）。
    const power = effectivePowers?.get(topNum) ?? (parseInt(cardMap.get(topNum)?.Power ?? '0') || 0);
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
    // 場／ゾーンレベルのアタック禁止（§6.4 O-16）。**ゾーンに紐づく**ので、そのゾーンへ後から
    // 出たシグニも毎回ここで拾われる（per-signi 付与では表せない部分）。
    if (activeFieldGrantsForSigni(ownerState, otherState, topNum, cardMap)
      .some(grant => grant.kind === 'blockAction' && grant.actionId === 'ATTACK')) {
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

  return { forSelf, forOther, cannotAttackSigni, cannotAttackSigniUnlessPayColorless };
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
    const result: string[] = ps.energy_colorless_ability_loss_this_turn ? [...ps.energy] : [];
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
 * センタールリグへ実行時付与されたCONTINUOUSのドローフェイズ置換を適用する。
 * 「1枚引く場合、代わりに2枚」なので、通常2枚のターンには影響しない。
 */
export function applyLrigDrawPhaseReplacement(state: PlayerState, drawCount: number): number {
  let result = drawCount;
  // 「あなたが次のあなたのドローフェイズにカードを N 枚引く場合、代わりに M 枚引く」（`WXK01-002-E2`）＝
  // 付与された【常】能力ではなく**自己予約**の形（§6.4 O-3 続き492）。読みはこの1関数に集約する。
  const reserved = state.draw_phase_replacement;
  if (reserved && result === reserved.fromCount) result = reserved.toCount;
  for (const eff of [
    ...(state.lrig_granted_auto_effects ?? []),
    ...(state.lrig_granted_auto_effects_until_opp_turn ?? []),
  ]) {
    if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'DRAW_PHASE_REPLACEMENT') continue;
    const rep = eff.action as import('../types/effects').DrawPhaseReplacementAction;
    if (result === rep.fromCount) result = rep.toCount;
  }
  return result;
}

/**
 * CONTINUOUS `BLOCK_ACTION{DRAW_LIMIT_<n>}` が課すドローフェイズの上限枚数（無ければ `undefined`）。
 *
 * 🔴**2026-08-19 続き567 まで消費地点が無く恒久 no-op だった**（§3 (cxxxv) と同じクラス＝
 * parser は `DRAW_LIMIT_1` を生成するのに engine/UI の誰も読んでいなかった）。live 母集団は
 * `WX04-005-E2`（「すべてのプレイヤーはドローフェイズにカードを１枚しか引くことができない」＝
 * self と opponent の2本を SEQUENCE で出す）だけ。
 *
 * ⚠**人間と CPU の両方のドロー地点で使う**（片方だけだと「CPU だけ2枚引く」非対称になる）。
 */
export function drawPhaseLimitFromBlocked(blocked: Set<string> | undefined): number | undefined {
  if (!blocked) return undefined;
  let limit: number | undefined;
  for (const id of blocked) {
    const m = /^DRAW_LIMIT_(\d+)$/.exec(id);
    if (!m) continue;
    const n = parseInt(m[1], 10);
    if (!Number.isNaN(n)) limit = limit === undefined ? n : Math.min(limit, n);
  }
  return limit;
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
  candidates.push(...activeKeyAbilitySources(opponentState));
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
  candidates.push(...activeKeyAbilitySources(state));
  // ルリグフィールドも対象（WXEX2-22等のルリグ常時効果）
  if (state.field.lrig.length) candidates.push(state.field.lrig[state.field.lrig.length - 1]);
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      if (act.id === 'PREVENT_ZONE_MOVE_BY_OPP') {
        // §6.4 O-20: カード全文だと**別能力**の保護ゾーンまで拾う
        // （`WXK10-083-E1` はエナ限定なのに E2 の「手札」を拾って手札まで保護していた）。
        // ここは ctx を持たない走査側なので、効果ごとにその効果を生んだブロックだけを読む。
        const card = cardMap.get(cn);
        const txt = card ? abilityBlockTextOf(card, eff.effectId) : '';
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
  // 期間つき予約（`ZONE_MOVE_IMMUNITY`＝アーツ/【出】で張るぶん）も同じ集合に合流させる。
  for (const zone of activeOppMoveImmunityZones(state)) result.add(zone);
  return [...result];
}

/**
 * 期間つき「対戦相手の効果によって〈ゾーン〉のカードは移動しない」（`opp_move_immunity`）の
 * **いま有効なゾーン**（§6.4 O-3 続き493）。
 *
 * 🔑**`ExecCtx.otherProtectedZones` が未設定の経路でも効くように、state だけで読めるようにする**＝
 * 消費側は「ctx 側の集合 ∪ この関数」で判定する（ctx を組み立てない経路が実在するため）。
 */
export function activeOppMoveImmunityZones(state: PlayerState): ('hand' | 'energy')[] {
  const out = new Set<'hand' | 'energy'>();
  for (const entry of state.opp_move_immunity ?? []) {
    if (entry.turnsRemaining <= 0) continue;
    for (const z of entry.zones) out.add(z);
  }
  return [...out];
}

/**
 * ATTACK_PHASE_LEVEL_OVERRIDE: 【英知】条件の判定でだけレベルを読み替えるシグニを収集する。
 * CardNum → **取りうるレベル群**（`number[]`）を返す。
 *
 * ⚠ 原文は「このシグニのレベルは１～９であるとして扱う」＝**そのどれでもよい**（合計は集合になる）。
 *   旧実装は範囲の**最大値1つ**へ潰しており、`WX21-029` 自身の【出】英知＝８が
 *   （単独設置時の合計が常に9になるため）**永久に成立しない**状態だった。
 * ⚠ 位相（アタックフェイズ限定かどうか）も原文から読む＝「アタックフェイズの間」を書いていない
 *   `WX20-044-CB` は常時有効。呼び出し側は位相を渡すだけでよい。
 */
export function collectAttackPhaseLevelOverrides(
  state: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  turnPhase?: string,
): Record<string, number[]> {
  const overrides: Record<string, number[]> = {};
  const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
  const inAttackPhase = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(turnPhase ?? '');
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of effectsMap.get(top) ?? []) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'ATTACK_PHASE_LEVEL_OVERRIDE') continue;
      const txt = (cardMap.get(top)?.EffectText ?? '') + ' ' + (cardMap.get(top)?.BurstText ?? '');
      // 「アタックフェイズの間」を明記している札はその位相でだけ有効
      if (/アタックフェイズの間/.test(txt) && !inAttackPhase) continue;
      // 形1: 「レベルはN～Mであるとして扱う」＝N..M のどれでも
      const range = txt.match(/レベルは([０-９\d]+)～([０-９\d]+)であるとして扱う/);
      if (range) {
        const lo = parseInt(toHW(range[1])), hi = parseInt(toHW(range[2]));
        if (!isNaN(lo) && !isNaN(hi) && hi >= lo) {
          overrides[top] = Array.from({ length: hi - lo + 1 }, (_v, i) => lo + i);
        }
        continue;
      }
      // 形2: 「レベルはAでありBでありCであるとして扱う」＝列挙（WX20-044-CB）
      const enumM = txt.match(/レベルは((?:[０-９\d]+であり)+[０-９\d]+)であるとして扱う/);
      if (enumM) {
        const vals = [...enumM[1].matchAll(/[０-９\d]+/g)].map(x => parseInt(toHW(x[0]))).filter(n => !isNaN(n));
        if (vals.length > 0) overrides[top] = [...new Set(vals)];
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
  candidates.push(...activeKeyAbilitySources(state));
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
  for (const keyPiece of activeKeyAbilitySources(state)) {
    const effs = effectsMap.get(keyPiece) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ENERGY_SUBSTITUTE_TRASH_KEY') {
        keySubInstId = keyPiece;
        break;
      }
    }
    if (keySubInstId) break;
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

    // COST_SUBSTITUTE（substituteCost.banish_self）: 「あなたが《X》を支払う際、代わりにあなたのエナゾーンから
    // このシグニをトラッシュに置いてもよい」＝エナゾーンにあるこのカード1枚が色Xとして支払える、と等価。
    // （エナコストの支払い自体がエナゾーンからのトラッシュなので、色オーバーライドで完全に表現できる）
    // count>1（1枚で複数コストを賄う）は色オーバーライドでは表せないため対象外にする。
    const costSubEff = selfEffs.find(eff => {
      if (eff.effectType !== 'CONTINUOUS') return false;
      const act = eff.action as import('../types/effects').CostSubstituteAction;
      return act.type === 'COST_SUBSTITUTE' && !!(act.substituteCost as { banish_self?: boolean })?.banish_self;
    });
    if (costSubEff) {
      const origCS = (costSubEff.action as import('../types/effects').CostSubstituteAction).originalCost ?? [];
      if (origCS.length === 1 && (origCS[0].count ?? 1) <= 1 && origCS[0].color) {
        colorOverrideMap.set(instId, origCS[0].color);
        continue;
      }
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
 * アクティブな追加《無》の合計枚数を返す。STUB の count 省略時は従来どおり1枚。
 */
export function collectOppGuardExtraColorlessCost(
  ownerState: PlayerState,
  otherState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOwnerTurn: boolean,
): number {
  const guardCostInAction = (action: import('../types/effects').EffectAction): number => {
    if (action.type === 'STUB') {
      return action.id === 'OPP_GUARD_COST_COLORLESS' || action.id === 'GUARD_EXTRA_COST_BY_OPP'
        ? (action.count ?? 1)
        : 0;
    }
    if (action.type === 'SEQUENCE') return action.steps.reduce((sum, step) => sum + guardCostInAction(step), 0);
    return 0;
  };
  // シグニゾーン走査
  const candidates: string[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (top) candidates.push(top);
  }
  // ルリグゾーン（センタールリグ）
  if (ownerState.field.lrig.length > 0) candidates.push(ownerState.field.lrig.at(-1)!);

  let total = 0;
  for (const cn of candidates) {
    const effs = effectsMap.get(cn) ?? [];
    for (const eff of effs) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const count = guardCostInAction(eff.action);
      if (count === 0) continue;
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
      total += count;
    }
  }
  for (const eff of [
    ...(ownerState.lrig_granted_auto_effects ?? []),
    ...(ownerState.lrig_granted_auto_effects_until_opp_turn ?? []),
  ]) {
    if (eff.effectType === 'CONTINUOUS') total += guardCostInAction(eff.action);
  }
  // AUTO/ACTIVATED の実行で設定された「このターン」の追加コスト。
  total += ownerState.opp_guard_extra_colorless_this_turn ?? 0;
  // game_opp_guard_extra_colorless: GAIN_ABILITY_THIS_GAME で付与された永続コスト（WX25-P2-001）
  if (ownerState.game_opp_guard_extra_colorless) total += 1;
  return total;
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
        if ((gp.sourceOwner === 'opponent' || gp.sourceOwner === 'any') && (gp.from?.includes('シグニ') || gp.from?.includes('any'))) {
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

  // 同じレベルがN枚以上: "同じレベルが4枚以上"（あるレベル値の枚数が閾値に達するか）
  m = condText.match(/同じレベルが([０-９\d]+)枚以上/);
  if (m) {
    const need = n(m[1]);
    const byLevel = new Map<number, number>();
    for (const num of beatZone) {
      const lv = parseInt(cardMap.get(num)?.Level ?? '-1', 10);
      if (isNaN(lv) || lv < 0) continue;
      byLevel.set(lv, (byLevel.get(lv) ?? 0) + 1);
    }
    return [...byLevel.values()].some(c => c >= need);
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

/**
 * カードが《クロスアイコン》を持つクロスシグニか（EffectText 先頭で判定）。
 * 実行時の CardData は parseCardEffects を通らず card.hasCrossIcon が未設定のため、
 * フラグに依存せず EffectText から直接導出する（App.tsx は effects を JSON から付与する）。
 */
export function cardHasCrossIcon(card: CardData | undefined): boolean {
  return !!card?.EffectText?.startsWith('《クロスアイコン》');
}

/** 《クロスアイコン》直後のクロス条件文（「《X》の左」等）。クロスシグニでなければ null。 */
export function getCrossConditionText(card: CardData | undefined): string | null {
  const m = card?.EffectText?.match(/^《クロスアイコン》([^【]+)/);
  return m ? m[1].trim() : null;
}

export function collectCrossStates(playerState: PlayerState, cardMap: Map<string, CardData>): boolean[] {
  const result = [false, false, false];
  for (let z = 0; z < 3; z++) {
    const stack = playerState.field.signi[z];
    if (!stack || stack.length === 0) continue;
    const card = cardMap.get(stack[stack.length - 1]);
    const crossCond = getCrossConditionText(card);
    if (!crossCond) continue;
    result[z] = evaluateCrossCondition(playerState, z, crossCond, cardMap);
  }
  return result;
}

/**
 * crossOnly 効果（【クロス出】【クロス自】等）のゲート判定。
 * cardNum のシグニが現在クロス状態のゾーンにあるかを返す。場にいなければ false。
 * 【クロス常】は effectEngine 内の CONTINUOUS ループで別途判定済み。本関数は
 * BattleScreen の ON_PLAY / ON_ATTACK_SIGNI 等のトリガー収集側で使う。
 */
export function isCrossZoneActive(playerState: PlayerState, cardNum: string, cardMap: Map<string, CardData>): boolean {
  const zoneIdx = playerState.field.signi.findIndex(s => s?.at(-1) === cardNum || s?.includes(cardNum));
  if (zoneIdx < 0) return false;
  return collectCrossStates(playerState, cardMap)[zoneIdx] ?? false;
}

/**
 * kizunaIcon 効果（【絆出】【絆自】【絆起】）のゲート判定。
 * 発生源カード名との絆を、その効果を持つ側のプレイヤーが獲得しているかを返す。
 * 【絆常】は effectEngine 内の CONTINUOUS ループ（および keywords.ts の hasKeyword /
 * getShadowScopes）で別途判定済み。本関数は AUTO/ACTIVATED を扱うトリガー収集・起動可否側で使う。
 */
export function isKizunaActive(playerState: PlayerState, cardNum: string, cardMap: Map<string, CardData>): boolean {
  const h = cardNum.indexOf('#'); // instanceId（"CardNum#n"）を素の CardNum へ落とす
  const bare = h > 0 ? cardNum.slice(0, h) : cardNum;
  const name = cardMap.get(cardNum)?.CardName ?? cardMap.get(bare)?.CardName;
  return !!name && !!playerState.bonds?.includes(name);
}

/** 効果配列から「絆未獲得で無効な kizunaIcon 効果」を落とす（crossOnly ゲートと同型のヘルパー）。 */
export function filterKizunaGated(
  effects: CardEffect[],
  playerState: PlayerState,
  cardNum: string,
  cardMap: Map<string, CardData>,
): CardEffect[] {
  if (!effects.some(e => e.kizunaIcon)) return effects;
  const ok = isKizunaActive(playerState, cardNum, cardMap);
  return effects.filter(e => !e.kizunaIcon || ok);
}

/**
 * 動的キーワード付与の収集（バッジ表示用）。
 * CONTINUOUS GRANT_KEYWORD で activeCondition が現在満たされている付与を、各シグニ／センタールリグ instanceId 単位で集める。
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
  // effectivePowers 未指定なら**渡された state から計算**する（タスク12(cxii)）。
  // 省略すると SELF_POWER_THRESHOLD 等が表記パワーへフォールバックし「バフしてもキーワードが付かない」過小実行になる。
  let _powers = effectivePowers;
  const powersOf = (): Map<string, number> =>
    (_powers ??= calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, cardMap));
  // パワーと同じ理由で実効レベルも渡す（`SELF_LEVEL_THRESHOLD` つきキーワード付与が
  // 表記レベルへ落ちないように。タスク12(cxvii)。live 実データは今は無いが同じ穴を残さない）。
  let _levels: Map<string, number> | undefined;
  const levelsOf = (): Map<string, number> =>
    (_levels ??= calcSigniLevels(ownerState, otherState, effectsMap, cardMap));
  const add = (num: string, kw: string) => {
    if (isKeywordAbilityRemoved(num, kw, ownerState.keyword_abilities_removed)) return;
    (result[num] ??= []);
    if (!result[num].includes(kw)) result[num].push(kw);
  };
  const signiTops: string[] = ownerState.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : []));
  const signiSet = new Set(signiTops);
  // REMOVE_ABILITIES: 能力を失っているシグニは付与を発生させず（発生源）、新たに得もしない（対象）。
  const abilitiesRemoved = collectContinuousAbilitiesRemovedSigni(ownerState, otherState, isOwnerTurn, effectsMap, cardMap, '常');
  // 発生源: 自分の場のシグニ＋センタールリグ
  const sources: string[] = [...signiTops];
  // 予約から昇格した場レベル付与。UI・アタック判定が共用する result へ合流させる。
  for (const num of signiTops) {
    for (const keyword of activeFieldGrantKeywordsForSigni(ownerState, otherState, num, cardMap)) add(num, keyword);
  }
  const lrigTop = ownerState.field.lrig.at(-1);
  if (lrigTop) sources.push(lrigTop);
  for (const srcNum of sources) {
    if (abilitiesRemoved.has(srcNum)) continue; // 能力喪失シグニはキーワードを付与しない
    // 実行時 GRANT_EFFECT の CONTINUOUS も同じ収集器で読む。短期／次の相手ターン終了時までの
    // ストアを落とすと、JSON に能力を積んでも activeCondition を評価する経路がなく恒久 no-op になる。
    const sourceEffects = [
      ...(effectsMap.get(srcNum) ?? []),
      ...(ownerState.granted_effects?.[srcNum] ?? []),
      ...(ownerState.granted_effects_until_opp_turn?.[srcNum] ?? []),
    ];
    for (const eff of sourceEffects) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      // 「パワーを＋Nし、それらは【K】を得る」の CONTINUOUS は SEQUENCE 直下に両 leaf を置く。
      // calcFieldPowers と同じく、分岐評価を要しない SEQUENCE だけを展開する。
      const actions = eff.action.type === 'SEQUENCE' ? eff.action.steps : [eff.action];
      for (const action of actions) {
        if (action.type !== 'GRANT_KEYWORD') continue;
        const gk = action as import('../types/effects').GrantKeywordAction;
        // 自分のシグニへの付与のみ（owner:opponent のデバフ系キーワードはバッジ対象外）。
        // 場全体付与は target.count === 'ALL' で表現されるため owner は self/any のみ対象（Owner型に 'all' は無い）。
        if (gk.target.owner !== 'self' && gk.target.owner !== 'any') continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, srcNum, powersOf(), undefined, undefined, levelsOf())) continue;
        // 「このルリグは【X】を得る」型。発生源自身＝自分のセンタールリグへ動的付与する。
        if (gk.target.type === 'LRIG') {
          if (lrigTop && srcNum === lrigTop) add(lrigTop, gk.keyword);
          continue;
        }
        const targetsAll = gk.target.count === 'ALL';
        for (let zoneIdx = 0; zoneIdx < ownerState.field.signi.length; zoneIdx++) {
          const num = ownerState.field.signi[zoneIdx]?.at(-1);
          if (!num) continue;
          if (abilitiesRemoved.has(num)) continue; // 能力喪失シグニは新たにキーワードを得ない
          if (gk.target.filter && !matchesFilter(cardMap.get(num), gk.target.filter)) continue;
          // isDrive 等のゾーン状態語は cardData だけでは判定できないため、POWER_MODIFY と同じ funnel を通す。
          if (!matchesStateFilter(ownerState, zoneIdx, gk.target.filter)) continue;
          // count:1（「このシグニ」想定）は発生源シグニ自身のみ。count:ALL は条件一致の全シグニ。
          if (!targetsAll && !(signiSet.has(srcNum) && num === srcNum)) continue;
          add(num, gk.keyword);
        }
      }
    }
  }
  return result;
}

/**
 * COPY_LRIG_NAME_ABILITY (CONT): センタールリグに「ルリグトラッシュのルリグと同じカード名として扱う」
 * CONTINUOUS効果があれば、そのエイリアスカード名のリストを返す。
 * NOTE: 同ルリグの【自】能力コピーは collectCopiedLrigAutoEffects、【常】能力コピーは
 * collectCopiedLrigContinuousEffects で対応（本関数は名前エイリアスのみ担当）。
 */
/** すべてのルリグ名を持つことを示すセンチネル（LRIG_ALL_NAMES CONTINUOUS効果） */
export const LRIG_ALL_NAMES_SENTINEL = '__ALL_LRIG_NAMES__';

/**
 * `COPY_LRIG_NAME_ABILITY` の payload（§5.3 `O-60` 第3バッチ）からルリグトラッシュの対象を1枚探す。
 *
 * 🔴**従来は消費地点4つがそれぞれ `EffectText` を regex で読んでいた**（同じ正規表現の4重コピー）。
 *   payload に一本化したので、**parser を直せば4地点すべてに届く**。
 * ⚠**payload が無ければ `null`**（fail-closed）＝名前も能力も得ない。落ちても「効かない」で済む。
 */
function findLrigNameCopyTarget(
  spec: NonNullable<import('../types/effects').StubAction['lrigNameCopy']> | undefined,
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
): string | null {
  if (!spec) return null;
  return ownerState.lrig_trash.find(cn => {
    const c = cardMap.get(cn);
    if (!c) return false;
    if (spec.level !== undefined && parseInt(c.Level ?? '0') !== spec.level) return false;
    return c.CardClass?.includes(spec.story) || c.Story?.includes(spec.story) || c.CardName?.includes(spec.story);
  }) ?? null;
}

export function collectLrigNameAliases(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState?: PlayerState,
): string[] {
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

    // §5.3 `O-60` 第3バッチ＝**payload だけを読む**（旧実装はここで `EffectText` を regex で読んでいた）。
    const targetLrig = findLrigNameCopyTarget(act.lrigNameCopy, ownerState, cardMap);

    if (targetLrig) {
      const aliasName = cardMap.get(targetLrig)?.CardName;
      if (aliasName && !aliases.includes(aliasName)) aliases.push(aliasName);
    }
  }

  // key_piece の GAIN_ADDITIONAL_LRIG_TYPE: キー効果でルリグがタイプを得る
  for (const keyPiece of activeKeyAbilitySources(ownerState)) {
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

  // ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE（恒久）／GAIN_LRIG_TYPE（期間つき・§6.4 O-3）で得たタイプ。
  // ⚠2軸を別々に読まない＝`activeGainedLrigTypes` の1本にまとめてある。
  for (const t of activeGainedLrigTypes(ownerState)) {
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

  for (const eff of (effectsMap.get(centerTop) ?? [])) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const act = eff.action as import('../types/effects').StubAction;
    if (act.type !== 'STUB' || act.id !== 'COPY_LRIG_NAME_ABILITY') continue;
    if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, centerTop)) continue;

    // 🔴§5.3 `O-60` 第3バッチ＝**得る能力の種別を payload から見る**。
    //   旧実装は種別を1文字も見ておらず、「そのルリグの**【常】**能力を得る」としか書いていない
    //   `WX24-P4-021-E1` でも **AUTO 能力まで得ていた**（過剰実行）。
    if (!(act.lrigNameCopy?.kinds ?? []).includes('AUTO')) continue;
    const targetLrig = findLrigNameCopyTarget(act.lrigNameCopy, ownerState, cardMap);
    if (!targetLrig) continue;

    for (const trashEff of (effectsMap.get(targetLrig) ?? [])) {
      if (trashEff.effectType !== 'AUTO') continue;
      result.push({ ...trashEff, effectId: `${centerTop}-COPY-${trashEff.effectId}`, copiedFromCardNum: cardMap.get(targetLrig)?.CardNum ?? targetLrig });
    }
  }
  return result;
}

/**
 * COPY_LRIG_NAME_ABILITY (CONT) 【常】能力コピー:
 * センタールリグが「…と同じカード名としても扱い、そのルリグの【常】能力を得る」場合、
 * ルリグトラッシュの該当ルリグの CONTINUOUS 効果をセンタールリグの効果として返す。
 * effectId に "{centerTop}-COPYC-" プレフィックスを付けて重複を防ぐ。
 * 「【自】能力を得る」カードは collectCopiedLrigAutoEffects 側で扱うため、ここでは【常】指定のみ対象。
 */
export function collectCopiedLrigContinuousEffects(
  ownerState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): import('../types/effects').CardEffect[] {
  const result: import('../types/effects').CardEffect[] = [];
  const centerTop = ownerState.field.lrig.at(-1);
  if (!centerTop) return result;

  for (const eff of (effectsMap.get(centerTop) ?? [])) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const act = eff.action as import('../types/effects').StubAction;
    if (act.type !== 'STUB' || act.id !== 'COPY_LRIG_NAME_ABILITY') continue;
    if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, centerTop)) continue;

    // 「そのルリグの【常】能力を得る」のみ対象（【自】は AUTO コピー側で処理）＝payload から見る。
    if (!(act.lrigNameCopy?.kinds ?? []).includes('CONTINUOUS')) continue;
    const targetLrig = findLrigNameCopyTarget(act.lrigNameCopy, ownerState, cardMap);
    if (!targetLrig) continue;

    for (const trashEff of (effectsMap.get(targetLrig) ?? [])) {
      if (trashEff.effectType !== 'CONTINUOUS') continue;
      result.push({ ...trashEff, effectId: `${centerTop}-COPYC-${trashEff.effectId}`, copiedFromCardNum: cardMap.get(targetLrig)?.CardNum ?? targetLrig });
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
 * 【コンバート《色》】（`CONVERT_ENERGY_COLOR`・§6.4 O-10・続き508）＝
 * 「エナコストを支払う際、**このカードは**《色》として支払える」。
 *
 * 🔑**カード自身の宣言**（`FIELD_ENERGY_SIGNI_GAIN_COLOR` が「場のシグニが**他のカードに**色を足す」のと逆）
 * なので、走査するのは**エナゾーンだけ**＝場に出ていても意味は無い。
 * ⚠色は原文を再パースせず**ペイロード（`value`）から読む**（parser が落としていたら足さない＝過少側）。
 * ⚠戻り値は `extraColorMap`（instId → 追加色）＝支払い判定の唯一の funnel（`canAffordGrowCost` /
 *   `canAffordWithExtraCost` の `extraColorMap` 引数）。**判定サイトへ渡し忘れるとその経路だけ効かない。**
 */
export function collectConvertEnergyColors(
  ownerState: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): Map<string, string> {
  const out = new Map<string, string>();
  for (const instId of ownerState.energy) {
    const baseNum = instId.includes('#') ? instId.slice(0, instId.indexOf('#')) : instId;
    for (const eff of (effectsMap.get(instId) ?? effectsMap.get(baseNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'CONVERT_ENERGY_COLOR') continue;
      if (typeof act.value !== 'string' || !act.value) continue;
      out.set(instId, act.value);
      break;
    }
  }
  return out;
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
  candidates.push(...activeKeyAbilitySources(state));

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
  candidates.push(...activeKeyAbilitySources(state));

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
 * `OPP_TURN_ARTS_COST_REDUCTION_ONCE`（§6.4 O-10・続き510・`WXK03-071-E1`）＝
 * 「【常】：このシグニが中央のシグニゾーンにあるかぎり、あなたが**対戦相手のターンに**アーツを使用する場合、
 * そのアーツの使用コストは《無×2》減り、ターン終了時まで、この能力を失う。」
 *
 * 🔑**軽減の funnel は `computeArtsEffectiveCost` の `artsThresholdReductions`**（3入口＝ArtsModal／
 * CutinModal／BattleScreen が同じ関数を通る）なので、`minTotalCost:0`＝無条件の項として合流させる。
 * ⚠**1回使ったら「この能力を失う」**＝`lost_ability_effect_ids_this_turn`（§6.4 O-10 続き507）で落とす。
 *   落とし忘れると同じターンに何度でも軽減される。返す `effectId` はアーツ使用の確定地点で刻むためのもの。
 * ⚠`isOwnerTurn` が true（自分のターン）のときは**空**＝原文の「対戦相手のターンに」を落とすと常時軽減になる。
 */
export function collectOppTurnArtsCostReductions(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
): { effectId: string; color: string; reduction: number }[] {
  if (isOwnerTurn) return [];
  const lost = ownerState.lost_ability_effect_ids_this_turn ?? [];
  const out: { effectId: string; color: string; reduction: number }[] = [];
  for (const stack of ownerState.field.signi) {
    const top = stack?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'OPP_TURN_ARTS_COST_REDUCTION_ONCE') continue;
      if (lost.includes(eff.effectId)) continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, top)) continue;
      const color = typeof act.value === 'string' ? act.value : '無';
      const reduction = typeof act.count === 'number' ? act.count : 1;
      out.push({ effectId: eff.effectId, color, reduction });
    }
  }
  return out;
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
  candidates.push(...activeKeyAbilitySources(state));

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

/** MULTI_ACCE_LIMIT のホスト別上限。value:'ALL' は Infinity、旧liveの値なしは印刷本文どおり2。 */
export function collectMultiAcceLimits(
  state: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): Map<string, number> {
  const result = new Map<string, number>();
  for (const stack of state.field.signi) {
    if (!stack || stack.length === 0) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'MULTI_ACCE_LIMIT') {
        const limit = act.value === 'ALL' ? Infinity : (typeof act.value === 'number' ? act.value : 2);
        result.set(topNum, Math.max(result.get(topNum) ?? 1, limit));
      }
    }
  }
  return result;
}

/** 後方互換の「複数アクセ可ホスト」一覧。上限の強制には collectMultiAcceLimits を使う。 */
export function collectMultiAcceSigni(
  state: PlayerState,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  otherState: PlayerState,
  isOwnerTurn: boolean,
): string[] {
  return [...collectMultiAcceLimits(state, effectsMap, cardMap, otherState, isOwnerTurn).keys()];
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
 * CONTINUOUS BATTLE_BANISH_PREVENT_LOSE_ABILITY（§3タスク6 D・置換ルール）:
 * 「（このシグニ／あなたの＜C＞のシグニ1体）がバニッシュされる場合、代わりにバニッシュされず、ターン終了時まで、この能力を失う」。
 * state（守られる側＝防御プレイヤー）の場に、victimNum のバニッシュを肩代わりできる source（この能力を失う側）があれば
 * その source instance を返す（無ければ null）。source が既に abilities_removed（能力喪失済み＝同ターン再発動不可）なら対象外。
 * banishPrevent.thisCardOnly＝source 自身のみ守る／banishPrevent.story＝当該クラスの自シグニを守る（source は別カードでも可）。
 * isOwnerTurn＝victim オーナーのターンか（バトルでは常に false＝相手ターン）。呼び出し側は victim を場に残し source を abilities_removed へ積む。
 */
export function collectBanishPreventLoseAbility(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  victimNum: string,
): string | null {
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  const victimClass = cardMap.get(baseNum(victimNum))?.CardClass ?? '';
  const removed = new Set(state.abilities_removed ?? []);
  for (const stack of state.field.signi) {
    const src = stack?.at(-1);
    if (!src || removed.has(src)) continue; // 能力喪失済みは再発動不可
    for (const eff of (effectsMap.get(baseNum(src)) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'BATTLE_BANISH_PREVENT_LOSE_ABILITY' || !act.banishPrevent) continue;
      const bp = act.banishPrevent;
      if (bp.oppTurnOnly && isOwnerTurn) continue; // 「対戦相手のターンの間」＝victim オーナーのターンでは無効
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, src)) continue;
      if (bp.thisCardOnly && src !== victimNum) continue;
      if (bp.story && !victimClass.includes(bp.story)) continue;
      return src;
    }
  }
  return null;
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
  effectivePowers?: Map<string, number>,
  effectSourceOwner: 'self' | 'opponent' | 'rule' = 'opponent',
  // 🆕**§5.3 `O-65`＝`activeCondition` のフェイズ限定（`DURING_MAIN_PHASE`／`DURING_ATTACK_PHASE`）を
  // 効かせるために必要**。⚠**渡さないと `checkActiveCondition` が `true` を返す**（過小実行回避の既定）＝
  // 受け皿を JSON に足しても**恒久 no-op** になる（`O-64` で踏んだ「委ね先が読んでいない」型）。
  turnPhase?: TurnPhase,
): Set<string> {
  // activeCondition に実効パワー参照（SELF_POWER_THRESHOLD 等）があると、渡さない限り**表記パワーへ
  // フォールバック**して「バフしても条件が真にならない」過小実行になる（タスク12(cxii)）。
  // 呼び出し元は解決途中のローカル state を渡すので、外から貰えないときは**その state から計算**する
  // （component の memo を使うと1手前の盤面になる）。activeCondition が1つも無ければ計算しない。
  let _powers = effectivePowers;
  const powersOf = (): Map<string, number> =>
    (_powers ??= calcFieldPowers(state, otherState, isOwnerTurn, effectsMap, cardMap));
  const protected_ = new Set<string>();
  // BANISH耐性の宣言元はシグニに限らない（WXEX1-01-E2 はセンタールリグ）。
  const sourceNums = [
    ...state.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
    ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
  ];
  for (const sourceNum of sourceNums) {
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum, powersOf(), undefined, turnPhase)) continue;
      // 「基本パワーはNになり、このシグニはバニッシュされない」は
      // SEQUENCE[POWER_SET, GRANT_PROTECTION]。分岐を持たないこの正準形だけ leaf を読む。
      const protectionActions = eff.action.type === 'SEQUENCE'
        && eff.action.steps.some(step => step.type === 'POWER_SET')
        ? eff.action.steps.filter((step): step is GrantProtectionAction => step.type === 'GRANT_PROTECTION')
        : eff.action.type === 'GRANT_PROTECTION' ? [eff.action as GrantProtectionAction] : [];
      for (const gp of protectionActions) {
      // rule は従来どおり opponent 指定だけを受理し、any をルール処理（power<=0）へ広げない。
      // 効果解決では any または実際の効果オーナーに一致する保護だけを受理する。
      if (effectSourceOwner === 'rule'
        ? gp.sourceOwner !== 'opponent'
        : gp.sourceOwner !== 'any' && gp.sourceOwner !== effectSourceOwner) continue;
      // bySourceType/bySourceLevel（「レベル2以下のルリグとシグニの効果によって…」等）は
      // 発生源カードを知る効果解決文脈でのみ
      // 評価する（collectBanishBySourceProtectedSigni）。バトル・他コンテキストの本コレクタでは適用しない。
      if (gp.bySourceType || gp.bySourceLevel !== undefined) continue;
      if (!gp.from?.includes('BANISH') && !gp.from?.includes('any')) continue;
      if (gp.subjectFilter) {
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2 && (!gp.subjectFilter.excludeSelf || top2 !== sourceNum)
              && matchesFilter(cardMap.get(top2), gp.subjectFilter)) protected_.add(top2);
        }
      } else if (gp.target?.owner === 'self' && gp.target?.count === 1) {
        protected_.add(sourceNum);
      } else if (gp.target?.owner === 'self' && gp.target?.count === 'ALL') {
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2) protected_.add(top2);
        }
      } else if (gp.target?.owner === 'any' && gp.target?.count === 'ALL') {
        // 🆕**§5.3 `O-66`②：「シグニは〜されない」＝両プレイヤーのシグニ**（`WXEX2-44-E1`）。
        // 自分側の宣言なので、ここでは自分側の全シグニを守る（相手側は下の第2ループが守る）。
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2) protected_.add(top2);
        }
      }
      }
    }
  }
  // 🆕**§5.3 `O-66`②：宣言元が**相手側**にある「両プレイヤーのシグニ」保護**（`WXEX2-44-E1`）。
  // ⚠この関数は本来「`state` 側の宣言が `state` 側のシグニを守る」形しか見ないので、
  //   相手の盤面に立っている宣言は**永久に届かなかった**（`count:1` 潰れと合わせて原文の 1/6 に縮んでいた）。
  // ⚠`activeCondition` は**宣言元の側から**評価する＝`state`/`otherState` と `isOwnerTurn` を入れ替える
  //   （`DURING_MAIN_PHASE {owner:'opponent'}` は宣言元コントローラーから見た「対戦相手の」なので、
  //   入れ替えを忘れると条件が反転して「守るべきでないときに守る」）。
  {
    const otherSourceNums = [
      ...otherState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
      ...(otherState.field.lrig.at(-1) ? [otherState.field.lrig.at(-1)!] : []),
    ];
    let _otherPowers: Map<string, number> | undefined;
    const otherPowersOf = (): Map<string, number> =>
      (_otherPowers ??= calcFieldPowers(otherState, state, !isOwnerTurn, effectsMap, cardMap));
    for (const sourceNum of otherSourceNums) {
      for (const eff of (effectsMap.get(sourceNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        const gp = eff.action.type === 'GRANT_PROTECTION' ? eff.action as GrantProtectionAction : undefined;
        if (!gp) continue;
        if (gp.target?.owner !== 'any' || gp.target?.count !== 'ALL') continue;
        if (effectSourceOwner === 'rule'
          ? gp.sourceOwner !== 'opponent'
          : gp.sourceOwner !== 'any' && gp.sourceOwner !== effectSourceOwner) continue;
        if (gp.bySourceType || gp.bySourceLevel !== undefined) continue;
        if (!gp.from?.includes('BANISH') && !gp.from?.includes('any')) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, otherState, state, !isOwnerTurn, cardMap, sourceNum, otherPowersOf(), undefined, turnPhase)) continue;
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2) protected_.add(top2);
        }
      }
    }
  }
  // AUTO/ACTIVATED の集合耐性は field_grants_active に保護キーワードとして保持される。
  // filter は activeFieldGrantKeywordsForSigni が毎回評価するため、付与後に場へ出たシグニも対象になる。
  const fieldKeywordBlocks = (keyword: string): boolean => {
    if (!keyword.startsWith('PROTECTION:')) return false;
    const [, fromRaw = '', owner = ''] = keyword.split(':');
    const from = fromRaw.split(',').filter(Boolean);
    if (!from.includes('BANISH') && !from.includes('any')) return false;
    return effectSourceOwner === 'rule'
      ? owner === 'opponent'
      : owner === 'any' || owner === effectSourceOwner;
  };
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top && activeFieldGrantKeywordsForSigni(state, otherState, top, cardMap).some(fieldKeywordBlocks)) {
      protected_.add(top);
    }
  }
  // PREVENT_SELF_MOVE_BY_OPP: バニッシュも含む場移動禁止（STUB）
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const sn = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sn, powersOf(), undefined, turnPhase)) continue;
      const a = eff.action as import('../types/effects').StubAction;
      if (a.type === 'STUB' && a.id === 'PREVENT_SELF_MOVE_BY_OPP') protected_.add(sn);
    }
  }
  return protected_;
}

/**
 * collectBanishBySourceProtectedSigni: GRANT_PROTECTION で from に 'BANISH' を持ち、bySourceType（発生源カード種別）
 * または bySourceLevel（発生源カードの表記レベル）が指定されたシグニのうち、いま解決中の効果ソースが
 * 両方の制約に一致する場合のみ、バニッシュ保護される
 * シグニ番号を返す（「対戦相手のシグニの効果によってバニッシュされない」WXK04-064 等）。
 * バトルやルール処理（power≤0）はソース種別を持たないため発火しない＝原文の「シグニとのバトル…はバニッシュされる」と整合。
 * 呼び出し側で otherBanishProtectedNums に union する（バニッシュ軸のみ。バウンス/ダウン等は保護しない）。
 */
export function collectBanishBySourceProtectedSigni(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
  sourceCardType: string,
  sourceCardNum?: string,
): Set<string> {
  const protected_ = new Set<string>();
  const srcType = sourceCardType ?? '';
  const baseSourceNum = sourceCardNum?.includes('#')
    ? sourceCardNum.slice(0, sourceCardNum.indexOf('#'))
    : sourceCardNum;
  const sourceCard = baseSourceNum ? cardMap.get(baseSourceNum) : undefined;
  const sourceLevel = Number.parseInt(sourceCard?.Level ?? '', 10);
  const srcIsSigni = srcType.includes('シグニ') || srcType.includes('レゾナ');
  const srcIsLrig = srcType.includes('ルリグ');
  const srcIsSpell = srcType.includes('スペル');
  const srcIsArts = srcType.includes('アーツ') || srcType.includes('ピース') || srcType.includes('キー');
  const matchesSource = (types: GrantProtectionAction['bySourceType']): boolean => {
    if (!types) return true;
    const list = Array.isArray(types) ? types : [types];
    return list.some(t => (t === 'シグニ' && srcIsSigni) || (t === 'ルリグ' && srcIsLrig)
      || (t === 'スペル' && srcIsSpell) || (t === 'アーツ' && srcIsArts));
  };
  const matchesSourceLevel = (level: GrantProtectionAction['bySourceLevel']): boolean => {
    if (level === undefined) return true;
    // Level 未定義・非数値のカードは、レベル制限つき保護へ誤って入れない（fail closed）。
    if (!Number.isFinite(sourceLevel)) return false;
    if (typeof level === 'number') return sourceLevel === level;
    if (level.min !== undefined && sourceLevel < level.min) return false;
    if (level.max !== undefined && sourceLevel > level.max) return false;
    return true;
  };
  const sourceConstraintsMatch = (
    bySourceType: GrantProtectionAction['bySourceType'],
    bySourceLevel: GrantProtectionAction['bySourceLevel'],
  ): boolean => matchesSource(bySourceType) && matchesSourceLevel(bySourceLevel);
  const sourceNums = [
    ...state.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : []),
    ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
  ];
  for (const sourceNum of sourceNums) {
    if (!sourceNum) continue;
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_PROTECTION') continue;
      const gp = eff.action as import('../types/effects').GrantProtectionAction;
      if ((!gp.bySourceType && gp.bySourceLevel === undefined) || !gp.from?.includes('BANISH')) continue;
      if (gp.sourceOwner && gp.sourceOwner !== 'opponent' && gp.sourceOwner !== 'any') continue;
      if (!sourceConstraintsMatch(gp.bySourceType, gp.bySourceLevel)) continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, sourceNum)) continue;
      if (gp.subjectFilter) {
        for (const s2 of state.field.signi) {
          const top2 = s2?.at(-1);
          if (top2 && (!gp.subjectFilter.excludeSelf || top2 !== sourceNum)
              && matchesFilter(cardMap.get(top2), gp.subjectFilter)) protected_.add(top2);
        }
      } else if (gp.target?.count === 'ALL') {
        for (const s2 of state.field.signi) { const top2 = s2?.at(-1); if (top2) protected_.add(top2); }
      } else {
        protected_.add(sourceNum); // target self count:1 → このシグニ
      }
    }
  }

  // AUTO/ACTIVATED で付与された同じ保護語彙。execGrantProtection が制約を専用キーワードへ
  // JSON保存するため、通常の PROTECTION:BANISH（全発生源）経路へは流さずここで同じ判定を行う。
  const grantedMatches = (keyword: string): boolean => {
    const prefix = 'PROTECTION_BY_SOURCE:';
    if (!keyword.startsWith(prefix)) return false;
    try {
      const grant = JSON.parse(keyword.slice(prefix.length)) as Pick<GrantProtectionAction,
        'from' | 'sourceOwner' | 'bySourceType' | 'bySourceLevel'>;
      if (!grant.from?.includes('BANISH')) return false;
      if (grant.sourceOwner && grant.sourceOwner !== 'opponent' && grant.sourceOwner !== 'any') return false;
      return sourceConstraintsMatch(grant.bySourceType, grant.bySourceLevel);
    } catch {
      return false;
    }
  };
  for (const store of [state.keyword_grants, state.keyword_grants_until_opp_turn]) {
    if (!store) continue;
    for (const stack of state.field.signi) {
      const top = stack?.at(-1);
      if (top && (store[top] ?? []).some(grantedMatches)) protected_.add(top);
    }
  }
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top && activeFieldGrantKeywordsForSigni(state, otherState, top, cardMap).some(grantedMatches)) protected_.add(top);
  }
  return protected_;
}

/**
 * collectForcedFrontAttackZones: 「この正面のシグニは可能ならばアタックしなければならない」（FORCE_FRONT_SIGNI_ATTACK）。
 * viewerState（いまアタックフェイズのプレイヤー）の各シグニゾーンのうち、対戦相手 ownerState の正面シグニが
 * この CONTINUOUS 効果を持つために強制アタック対象となるゾーン番号の集合を返す。
 * 盤面は左右反転するため、ownerState のゾーン zi の正面は viewerState のゾーン (2 - zi)。
 */
export function collectForcedFrontAttackZones(
  viewerState: PlayerState,
  ownerState: PlayerState,
  isViewerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Set<number> {
  const zones = new Set<number>();
  for (let zi = 0; zi < ownerState.field.signi.length; zi++) {
    const hostTop = ownerState.field.signi[zi]?.at(-1);
    if (!hostTop) continue;
    const frontZi = 2 - zi;
    if (!viewerState.field.signi[frontZi]?.at(-1)) continue; // 正面にシグニがいなければ対象なし
    for (const eff of (effectsMap.get(hostTop) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'FORCE_FRONT_SIGNI_ATTACK') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, viewerState, !isViewerTurn, cardMap, hostTop)) continue;
      zones.add(frontZi);
    }
  }
  return zones;
}

/** resolveForcedSigniAttack の結果。`forced=false` のとき `infectedOnly` は意味を持たない。 */
export interface ForcedSigniAttackResult {
  /** viewerState のシグニが「可能ならばアタックしなければならない」か。 */
  forced: boolean;
  /** 強制対象が感染状態のシグニだけか（WX16-047）。強制源が1つでも全体強制なら false。 */
  infectedOnly: boolean;
}

/**
 * resolveForcedSigniAttack: 「（対戦相手の）シグニは可能ならばアタックしなければならない」を**1か所で**解決する。
 *
 * ⚠**軸が2本ある**のが要点。
 *  - (1) ターン限定フラグ `must_attack_signi` … 【起】【出】の `FORCE_SIGNI_ATTACK` を `execForceSigniAttack` が
 *        立てる（WXK01-035／WXDi-P08-010／WX15-003／WXEX2-19／WX16-047）。
 *  - (2) 印字/付与の **CONTINUOUS** `FORCE_SIGNI_ATTACK` … こちらは**実行されない**（CONTINUOUS は宣言型で
 *        `executeAction` を通らない）ため、フラグは永久に立たない。**読む側がここで拾わないと恒久 no-op** になる。
 *        実際 `WD07-004-E1`／`WX14-018-E1`／`WX20-Re07〜09-E1`（＋復活させた `WX12-010-E1`）の【常】は
 *        live に構造としては入っているのに engine のどこからも読まれていなかった（§6.4「強制アタック機構」）。
 *
 * ⚠**呼び出し元は必ずこの関数を使う**（フラグを直接読まない）。フラグだけを見ると【常】が効かず、
 *   CONTINUOUS だけを見ると【起】由来が効かない、という軸ズレが即座に発生する。
 *
 * 走査軸は「印字（シグニ＋センター/アシストルリグ）＋付与2ストア」。付与ストアを見ないと
 * `GRANT_EFFECT` で配られた【常】が落ちる（`effectsMap` には載らないため）。
 *
 * @param viewerState 強制されるか判定したいプレイヤー（＝いまアタックする側）
 */
export function resolveForcedSigniAttack(
  viewerState: PlayerState,
  opponentState: PlayerState,
  isViewerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): ForcedSigniAttackResult {
  let forced = false;
  let infectedOnly = true; // 「全ての強制源が感染限定」のときだけ true で返す

  const note = (isInfectedOnly: boolean) => {
    forced = true;
    if (!isInfectedOnly) infectedOnly = false;
  };

  // 軸(1) ターン限定フラグ
  if (viewerState.must_attack_signi) note(viewerState.must_attack_infected_only ?? false);

  // 軸(2) CONTINUOUS（印字＋付与）
  const scan = (holder: PlayerState, other: PlayerState, isHolderTurn: boolean, holderIsViewer: boolean) => {
    // holder の能力が viewer を強制するのは、holder 自身が viewer なら targetOwner:'self'、
    // holder が対戦相手なら targetOwner:'opponent' のときだけ。
    const wantOwner = holderIsViewer ? 'self' : 'opponent';
    const consider = (hostNum: string, effects: readonly import('../types/effects').CardEffect[]) => {
      for (const eff of effects) {
        if (eff.effectType !== 'CONTINUOUS') continue;
        const act = eff.action as import('../types/effects').ForceSigniAttackAction;
        if (act?.type !== 'FORCE_SIGNI_ATTACK') continue;
        if ((act.targetOwner ?? 'opponent') !== wantOwner) continue;
        if (!checkActiveCondition(eff.activeCondition, holder, other, isHolderTurn, cardMap, hostNum)) continue;
        note(act.infectedOnly ?? false);
      }
    };
    for (const stack of holder.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      consider(top, [
        ...(effectsMap.get(top) ?? []),
        ...(holder.granted_effects?.[top] ?? []),
        ...(holder.granted_effects_until_opp_turn?.[top] ?? []),
      ]);
    }
    // ルリグ側（この文型の印字は大半がルリグ＝WX14-018／WX20-Re07〜09／WD07-004）。
    // 能力消失（lrig_abilities_disabled）で丸ごと落ちるのは scanLrigSelfBlocks と同じ扱い。
    if (!holder.lrig_abilities_disabled) {
      for (const top of lrigZoneTops(holder.field)) {
        if (!top) continue;
        consider(top, [
          ...(effectsMap.get(top) ?? []),
          ...(holder.granted_effects?.[top] ?? []),
          ...(holder.granted_effects_until_opp_turn?.[top] ?? []),
        ]);
      }
    }
  };
  scan(viewerState, opponentState, isViewerTurn, true);
  scan(opponentState, viewerState, !isViewerTurn, false);

  return { forced, infectedOnly: forced && infectedOnly };
}

/**
 * 場に出た viewerState のシグニ自身の【出】を、場の【常】が抑止するか。
 * CONTINUOUS は executeAction を通らないため、印字＋付与2ストアを収集地点から宣言走査する。
 */
export function isSigniOnPlaySuppressedByContinuous(
  placedInstanceId: string,
  viewerState: PlayerState,
  opponentState: PlayerState,
  isViewerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): boolean {
  const baseCardNum = (id: string): string => {
    const hash = id.indexOf('#');
    return hash > 0 ? id.slice(0, hash) : id;
  };
  const placedCard = cardMap.get(baseCardNum(placedInstanceId));
  if (!placedCard) return false;

  const scan = (holder: PlayerState, other: PlayerState, isHolderTurn: boolean, holderIsViewer: boolean): boolean => {
    const wantOwner = holderIsViewer ? 'self' : 'opponent';
    for (const stack of holder.field.signi) {
      const top = stack?.at(-1);
      if (!top) continue;
      const base = baseCardNum(top);
      const printed = effectsMap.get(top) ?? effectsMap.get(base) ?? [];
      const granted = holder.granted_effects?.[top] ?? holder.granted_effects?.[base] ?? [];
      const grantedLong = holder.granted_effects_until_opp_turn?.[top]
        ?? holder.granted_effects_until_opp_turn?.[base] ?? [];
      for (const eff of [...printed, ...granted, ...grantedLong]) {
        if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'BLOCK_ACTION') continue;
        const block = eff.action as import('../types/effects').BlockActionAction;
        if (block.actionId !== 'ON_PLAY_ABILITY' || block.target.type !== 'SIGNI') continue;
        if (block.target.owner !== wantOwner) continue;
        if (!checkActiveCondition(eff.activeCondition, holder, other, isHolderTurn, cardMap, top)) continue;
        if (!matchesFilter(placedCard, block.target.filter)) continue;
        return true;
      }
    }
    return false;
  };

  return scan(viewerState, opponentState, isViewerTurn, true)
    || scan(opponentState, viewerState, !isViewerTurn, false);
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
  sourceCardNum?: string,
  sourceEffectType?: import('../types/effects').CardEffect['effectType'],
  effectivePowers?: Map<string, number>,
): Set<string> {
  // タスク12(cxii) と同じ穴＝`activeCondition` に実効パワー参照（`SELF_POWER_THRESHOLD` 等）があると、
  // powers を渡さない限り**表記パワーへフォールバック**して「バフしても耐性が付かない」過小実行になる。
  // (cxii) では耐性系のうち `collectBanishEffectProtectedSigni`（バニッシュ軸）だけを直しており、
  // **汎用の効果耐性を読むこの関数は残っていた**（当時 live 母集団が0件だったため）。
  // `WX09-019`（表記パワー**0**／「パワーが14000以上であるかぎり対戦相手のアーツの効果を受けず」）で顕在化。
  let _powers = effectivePowers;
  const powersOf = (): Map<string, number> =>
    (_powers ??= calcFieldPowers(state, opponentState, isOwnerTurn, effectsMap, cardMap));
  // 実効レベル（`SELF_LEVEL_THRESHOLD`。タスク12(cxvii)）＝`WX20-Re18`「レベルが5以上であるかぎり
  // 対戦相手の効果を受けない」は**表記レベル2**なので、渡さないと一生 false になる。
  let _levels: Map<string, number> | undefined;
  const levelsOf = (): Map<string, number> =>
    (_levels ??= calcSigniLevels(state, opponentState, effectsMap, cardMap));
  const immune = new Set<string>();
  const srcType = sourceCardType ?? '';
  // sourceCostMin（「コストの合計がN以上の、アーツとスペルの効果を受けない」WX15-031）判定用に
  // 解決中ソースカードの使用コスト合計を求める（《色×N》の合計・コイン除く＝matchesFilter.costMin と同基準）。
  const srcCard = sourceCardNum ? cardMap.get(sourceCardNum.includes('#') ? sourceCardNum.slice(0, sourceCardNum.indexOf('#')) : sourceCardNum) : undefined;
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

  // CONTINUOUS の SEQUENCE は各 step が同時に常在する。POWER_MODIFY 側は既に再帰抽出する一方、
  // 効果耐性だけ action 直下に限定されていたため、引用能力内の複合【常】で保護節が不発になっていた。
  // CONDITIONAL/CHOOSE は分岐条件の評価が必要なので、ここでは意味が自明な SEQUENCE だけを再帰する。
  const extractGrantProtections = (action: EffectAction, insideSequence = false): GrantProtectionAction[] => {
    if (action.type === 'GRANT_PROTECTION') {
      const gp = action as GrantProtectionAction;
      if (!insideSequence) return [gp];
      // 本バッチの引用内複合形だけを解禁する。既存 live には別意味の SEQUENCE 内
      // GRANT_PROTECTION が11効果あり、無条件に一般化するとそれらまで挙動変更するため。
      const isOtherSigniNonLbProtection = gp.subjectOwner === 'self'
        && gp.subjectFilter?.excludeSelf === true
        && (gp.sourceOwner === 'opponent' || gp.sourceOwner === 'any')
        && gp.sourceFilter?.hasLifeBurst === false
        && gp.from?.length === 1 && gp.from[0] === 'シグニ';
      // 「このシグニのパワーは＋Nされ、このシグニは相手シグニの効果を受けない」のような
      // 自身対象の直下 leaf も同じく分岐を持たない。同型だけを許可し、他の11効果へ一般化しない。
      const isSelfSigniProtection = gp.target?.type === 'SIGNI'
        && gp.target.owner === 'self' && gp.target.count === 1
        && !gp.subjectFilter
        && (gp.sourceOwner === 'opponent' || gp.sourceOwner === 'any')
        && gp.from?.length === 1 && gp.from[0] === 'シグニ';
      return isOtherSigniNonLbProtection || isSelfSigniProtection ? [gp] : [];
    }
    if (action.type === 'SEQUENCE') {
      return (action as import('../types/effects').SequenceAction).steps.flatMap(step => extractGrantProtections(step, true));
    }
    return [];
  };

  // 実効色（`COLOR_INHERIT` 等の追加色）＝`sourceSharedColorWithSelf` の判定に要る。遅延評価。
  let _selfExtraColors: Map<string, string[]> | undefined;
  const selfExtraColors = (): Map<string, string[]> =>
    (_selfExtraColors ??= collectFieldSigniExtraColors(state, cardMap, effectsMap, opponentState, isOwnerTurn));

  const collectFromCard = (sourceNum: string): void => {
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const protections = extractGrantProtections(eff.action);
      if (protections.length === 0) continue;
      if (!checkActiveCondition(eff.activeCondition, state, opponentState, isOwnerTurn, cardMap, sourceNum,
                                eff.activeCondition ? powersOf() : undefined, undefined, undefined,
                                eff.activeCondition ? levelsOf() : undefined)) continue;
      for (const gp of protections) {
        if (gp.sourceOwner && gp.sourceOwner !== 'opponent' && gp.sourceOwner !== 'any') continue;

        // この解決中のソース種別が耐性対象に含まれるか判定
        const blocked = gp.fromAll
          ? !exceptMatches(gp.exceptSource)
          : sourceMatches(gp.from);
        if (!blocked) continue;

        // sourceCostMin: 解決中ソースカード（アーツ/スペル）の使用コスト合計が閾値未満なら保護しない（WX15-031）
        if (gp.sourceCostMin !== undefined && !matchesFilter(srcCard, { costMin: gp.sourceCostMin })) continue;

        // sourceFilter: 解決中ソースカードの属性が指定フィルタに非マッチなら保護しない（WXEX2-36 ライズアイコン非所持／WXK11-021 LB非所持）
        if (gp.sourceFilter && !matchesFilter(srcCard, gp.sourceFilter)) continue;
        if (gp.sourceEffectType && gp.sourceEffectType !== sourceEffectType) continue;

        // 🆕`sourceSharedColorWithSelf`＝「**自身と共通する色を持つ**対戦相手のシグニの効果を受けない」
        //   （`WX11-032`・2026-08-27 Sheet1 B13）。無いと**全相手シグニからの無条件保護**になる。
        // ⚠色は**実効色**（印刷色＋`COLOR_INHERIT` 等）で見る＝`WX11-032` は自身の色がエナ依存なので
        //   印刷色だけで見ると保護が実際より薄くなる。
        // ⚠**発生源カードが引けないときは保護しない**（fail-closed）＝引けない＝共通色を確かめられない。
        if (gp.sourceSharedColorWithSelf) {
          const srcColors = new Set([...(srcCard?.Color ?? '')].filter(c => '白赤青緑黒'.includes(c)));
          if (srcColors.size === 0) continue;
          const selfPrinted = cardMap.get(sourceNum)?.Color ?? '';
          const selfColors = new Set([...selfPrinted].filter(c => '白赤青緑黒'.includes(c)));
          for (const c of (selfExtraColors().get(sourceNum) ?? [])) selfColors.add(c);
          if (![...srcColors].some(c => selfColors.has(c))) continue;
        }

        // 保護対象シグニを収集
        if (gp.subjectFilter) {
          const subjState = gp.subjectOwner === 'opponent' ? opponentState : state;
          // カード属性（matchesFilter）に加えゾーン状態（isDown/isDrive 等）も honor する（WXK04-002 血晶武装シグニ保護）。
          // excludeSelf（「あなたの他のレゾナ」WX13-005A）は付与元シグニ自身を除外する。
          subjState.field.signi.forEach((s2, zi2) => {
            const top2 = s2?.at(-1);
            if (!top2) return;
            if (gp.subjectFilter?.excludeSelf && top2 === sourceNum) return;
            if (matchesFilter(cardMap.get(top2), gp.subjectFilter) && matchesStateFilter(subjState, zi2, gp.subjectFilter)) immune.add(top2);
          });
        } else if (gp.target) {
          // target ベース（一時付与でない CONT は稀）: self/any count:1 → このシグニ自身
          if ((gp.target.owner === 'self' || gp.target.owner === 'any')) immune.add(sourceNum);
        } else {
          immune.add(sourceNum);
        }
      }
    }
  };

  // Share the exact GRANT_PROTECTION evaluation between signi hosts and the
  // center-lrig host. A target-less protection adds only its own sourceNum.
  for (const stack of state.field.signi) {
    const sourceNum = stack?.at(-1);
    if (sourceNum) collectFromCard(sourceNum);
  }
  const lrigTop = state.field.lrig?.at(-1);
  if (lrigTop) collectFromCard(lrigTop);

  // 一時付与（AUTO/ACTIVATED/スペル）の効果耐性: keyword_grants / keyword_grants_until_opp_turn の
  // 'PROTECTION:<種別>:<owner>' を読み、解決中ソース種別が該当する場の自シグニ／センタールリグを免疫に加える。
  // （WX04-064「あなたのセンタールリグとあなたのシグニはアーツの効果を受けない」UNTIL_OPP_TURN_END 等）
  const protMatches = (kw: string): boolean => {
    if (kw.startsWith('PROTECTION_FILTERED:')) {
      try {
        const spec = JSON.parse(kw.slice('PROTECTION_FILTERED:'.length)) as {
          from?: string[];
          sourceOwner?: string;
          sourceFilter?: import('../types/effects').TargetFilter;
          sourceCostMin?: number;
          sourceEffectType?: import('../types/effects').CardEffect['effectType'];
        };
        if (spec.sourceOwner && spec.sourceOwner !== 'opponent' && spec.sourceOwner !== 'any') return false;
        if (!sourceMatches(spec.from)) return false;
        if (spec.sourceFilter && !matchesFilter(srcCard, spec.sourceFilter)) return false;
        if (spec.sourceCostMin !== undefined && !matchesFilter(srcCard, { costMin: spec.sourceCostMin })) return false;
        if (spec.sourceEffectType && spec.sourceEffectType !== sourceEffectType) return false;
        return true;
      } catch {
        return false;
      }
    }
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
  for (const stack of state.field.signi) {
    const top = stack?.at(-1);
    if (top && activeFieldGrantKeywordsForSigni(state, opponentState, top, cardMap).some(protMatches)) immune.add(top);
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
  // 🆕`O-65`：同上。`WXK07-031-E1`＝「あなたのアタックフェイズの間、対戦相手の効果はバニッシュ以外で
  // あなたの＜宇宙＞のシグニを場から移動させない」が**常時保護**になっていた。
  turnPhase?: TurnPhase,
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
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum, undefined, undefined, turnPhase)) continue;

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

      // 🆕§5.3 `O-66`③：保護対象は **payload（`moveProtectFilter`）** で読む。
      // ⚠ここは**省略＝あなたのシグニ全部**が原文どおり（`WX13-029-E1`②）＝`underAbilityGrant` とは
      //   fail の向きが逆。旧実装は `EffectText` を regex で読んでいた（`O-60` 同型）。
      if (act.id === 'SIGNI_CANT_BOUNCE_FROM_FIELD') {
        for (const s of state.field.signi) {
          if (!s?.length) continue;
          const sTop = s[s.length - 1];
          const sBase = sTop.includes('#') ? sTop.slice(0, sTop.indexOf('#')) : sTop;
          if (matchesFilter(cardMap.get(sBase), act.moveProtectFilter)) protected_.add(sTop);
        }
      }

      // PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_SELF_MOVE_BY_OPP: このシグニ自身がバウンス不可
      if (act.id === 'PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH' || act.id === 'PREVENT_SELF_MOVE_BY_OPP') {
        const inSigniField = state.field.signi.some(s => s?.at(-1) === topNum);
        if (inSigniField) protected_.add(topNum);
      }

      // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH: 指定クラスの全シグニがバウンス不可
      // 🆕§5.3 `O-66`③：保護対象は **payload（`moveProtectFilter`）** で読む。
      // 🔴旧実装は `EffectText`/`BurstText` を regex で読み、外れると**発生源自身の `CardClass`** へ
      //   フォールバックしていた＝原文と無関係なクラスを守りうる（`O-60` 同型の「JSON を見ても分からない」形）。
      if (act.id === 'PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH') {
        for (const s of state.field.signi) {
          if (!s?.length) continue;
          const sTop = s[s.length - 1];
          const sBase = sTop.includes('#') ? sTop.slice(0, sTop.indexOf('#')) : sTop;
          if (matchesFilter(cardMap.get(sBase), act.moveProtectFilter)) protected_.add(sTop);
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
 * SELF_TRASH_PREVENT（§6.1・WX07-033「あなたは、自分でこのシグニを場からトラッシュに置くことができない」）:
 * 効果オーナー自身の効果/コストで場からトラッシュに置けないシグニ番号を返す（自己トラッシュ制限）。
 * 相手効果によるトラッシュ・バニッシュ（→トラッシュ）は対象外＝あくまで「自分で置く」ことの禁止。
 */
export function collectSelfTrashPreventNums(
  state: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  cardMap: Map<string, CardData>,
): Set<string> {
  const result = new Set<string>();
  for (const stack of state.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) continue;
      if ((eff.action as { type: string }).type === 'SELF_TRASH_PREVENT') result.add(topNum);
    }
  }
  return result;
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
  abilityType?: '常' | '自' | '起' | '出',
): Set<string> {
  const removed = new Set<string>();
  const RemoveAbilitiesType = 'REMOVE_ABILITIES';

  // 一過性 REMOVE_ABILITIES（ACTIVATED/AUTO で「ターン終了時まで能力を失う」。WX05-001-E2/G085-E2 等）。
  // state.abilities_removed に記録された分も能力喪失として扱う（ターン終了時にクリアされる）。
  for (const cn of state.abilities_removed ?? []) removed.add(cn);
  // 場／ゾーンレベルの能力喪失（§6.4 O-16）。instanceId ではなく**ゾーン**に紐づくので、
  // このゾーンに後から出たシグニも毎回ここで拾われる（＝「新たに得られない」の忠実表現）。
  for (let zi = 0; zi < state.field.signi.length; zi++) {
    const top = state.field.signi[zi]?.at(-1);
    if (top && fieldGrantRemovesAbilities(state, otherState, top, cardMap)) removed.add(top);
  }

  // 自フィールドの CONTINUOUS REMOVE_ABILITIES(owner:'self') — 自分自身が能力を失う
  for (let zi = 0; zi < state.field.signi.length; zi++) {
    const stack = state.field.signi[zi];
    if (!stack?.length) continue;
    const sourceNum = stack[stack.length - 1];
    for (const eff of (effectsMap.get(sourceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if ((eff.action as { type: string }).type !== RemoveAbilitiesType) continue;
      const act = eff.action as import('../types/effects').RemoveAbilitiesAction;
      if (act.keywords?.length) continue;
      if (abilityType && act.abilityTypes && !act.abilityTypes.includes(abilityType)) continue;
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
      if (act.keywords?.length) continue;
      if (abilityType && act.abilityTypes && !act.abilityTypes.includes(abilityType)) continue;
      if (act.target.owner !== 'opponent') continue;
      if (!checkActiveCondition(eff.activeCondition, otherState, state, !isOwnerTurn, cardMap, sourceNum)) continue;
      // count:1 は対面のシグニを対象とする。
      // §6.3「正面」サブ機構(b)(e)＝**原文が「正面」と明示する効果（filter.frontOfSelf）だけ** engine 共通規約の
      //   **2 - zi**（`resolveFrontOfSelfCardNum`／バトルの `opZone = 2 - attackZone` と同じ）で解決する。
      // ⚠ frontOfSelf を持たない count:1 は従来どおり same-zi のまま据置＝この分岐に落ちている残り8効果は
      //   そもそも「正面」ではなく「対戦相手の〈状態〉のシグニすべて」等の**誤 parse**（count:'ALL'+filter が正）で、
      //   facing 解決自体が近似。規約統一のついでに挙動を変えると未検証の退化になるためタスク12 へ登録して別途消化する。
      if (act.target.count === 1) {
        const facing = state.field.signi[act.target.filter?.frontOfSelf ? 2 - zi : zi]?.at(-1);
        if (facing) removed.add(facing);
      } else if (act.target.count === 'ALL') {
        for (let targetZi = 0; targetZi < state.field.signi.length; targetZi++) {
          const s = state.field.signi[targetZi];
          const top = s?.at(-1);
          if (!top) continue;
          if (act.target.filter && (!matchesFilter(cardMap.get(top), act.target.filter)
            || !matchesStateFilter(state, targetZi, act.target.filter))) continue;
          removed.add(top);
        }
      }
    }
  }

  // 相手フィールドのセンタールリグ由来 CONTINUOUS REMOVE_ABILITIES。
  // ルリグには facing を決めるシグニゾーン index が無いため count:'ALL' だけを扱う。
  // count:1 は既存の facing 規約の対象外とし、シグニ由来の走査だけに残す。
  const otherLrigTop = otherState.field.lrig.at(-1);
  if (otherLrigTop) {
    for (const eff of (effectsMap.get(otherLrigTop) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if ((eff.action as { type: string }).type !== RemoveAbilitiesType) continue;
      const act = eff.action as import('../types/effects').RemoveAbilitiesAction;
      if (act.keywords?.length) continue;
      if (abilityType && act.abilityTypes && !act.abilityTypes.includes(abilityType)) continue;
      if (act.target.owner !== 'opponent' || act.target.count !== 'ALL') continue;
      if (!checkActiveCondition(eff.activeCondition, otherState, state, !isOwnerTurn, cardMap, otherLrigTop)) continue;
      for (let targetZi = 0; targetZi < state.field.signi.length; targetZi++) {
        const top = state.field.signi[targetZi]?.at(-1);
        if (!top) continue;
        if (act.target.filter && (!matchesFilter(cardMap.get(top), act.target.filter)
          || !matchesStateFilter(state, targetZi, act.target.filter))) continue;
        removed.add(top);
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
    const effects = [...(effectsMap.get(cn) ?? []), ...(otherState.granted_effects?.[cn] ?? []), ...(otherState.granted_effects_until_opp_turn?.[cn] ?? [])];
    for (const eff of effects) {
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
    const effects = [...(effectsMap.get(cn) ?? []), ...(ownerState.granted_effects?.[cn] ?? []), ...(ownerState.granted_effects_until_opp_turn?.[cn] ?? [])];
    for (const eff of effects) {
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
  | { kind: 'pay_cost'; sourceNum: string; costType: 'discardSpell' | 'trashStackSpell' | 'lifeCrash'; amount: number };

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
          const excludeSourceFromSacrifice = bs.sacrificeFilter?.excludeSelf ?? true;
          for (const n of tops) {
            if (excludeSourceFromSacrifice && n === sourceNum) continue;
            if (bs.sacrificeClass && !(cardMap.get(baseNum(n))?.CardClass ?? '').includes(bs.sacrificeClass)) continue;
            result.push({ kind: 'sacrifice', sourceNum, sacrificeNum: n });
          }
        } else if (bs.pattern === 'protect_other_sacrifice_self') {
          const excludeSourceFromVictims = bs.victimTarget?.filter?.excludeSelf ?? true;
          if (excludeSourceFromVictims && sourceNum === victimNum) continue;
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
        } else if (cost.lifeCrash) {
          // §3タスク6 D（WX14-026）: 自分のライフクロスを割ってバニッシュを回避。ライフが足りなければ選べない。
          if (state.life_cloth.length >= cost.lifeCrash) result.push({ kind: 'pay_cost', sourceNum, costType: 'lifeCrash', amount: cost.lifeCrash });
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
  effectivePowers?: Map<string, number>,
): Map<string, CardEffect[]> {
  // 付与宣言のゲート（activeCondition）に実効パワー参照があると、渡さないと**表記パワーへフォールバック**して
  // 「バフしても付与されない」過小実行になる（タスク12(cxii)）。渡されなければ**受け取った effectsMap から計算**する。
  // ⚠この effectsMap は「レイヤー付与を足す前」なので循環しない（付与の中身がパワーを変えても、
  //   ゲート判定に使うのは付与前のパワー＝同時適用の1段近似）。activeCondition が無ければ計算しない。
  let _powers = effectivePowers;
  const powersOf = (): Map<string, number> =>
    (_powers ??= calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, cardMap));
  const result = new Map<string, CardEffect[]>();
  const baseNum = (n: string) => n.includes('#') ? n.slice(0, n.indexOf('#')) : n;
  type GrantAction = import('../types/effects').GrantFieldSigniAbilityAction;

  // 1) 場のシグニから付与宣言を収集（付与先オーナーごとに分ける）。thisCardOnly の判定に付与元 top を保持。
  const selfGrants: Array<{ g: GrantAction; src: string; fromPlayer?: boolean }> = [];   // targetOwner 省略/self: 自分の場へ付与
  const oppGrants: Array<{ g: GrantAction; src: string; fromPlayer?: boolean }> = [];    // targetOwner:'opponent': 対戦相手の場へ付与
  for (let zi = 0; zi < 3; zi++) {
    const top = ownerState.field.signi[zi]?.at(-1);
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      // SEQUENCE 直下も走査する（「パワーは＋Nされ、このシグニは「Q」を得る」＝
      // SEQUENCE[POWER_MODIFY, GRANT_FIELD_SIGNI_ABILITY] の連用中止形。WXDi-P11-046 等）
      const actions = eff.action.type === 'SEQUENCE'
        ? (eff.action as import('../types/effects').SequenceAction).steps
        : [eff.action];
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, top, powersOf())) continue;
      for (const act of actions) {
        if (act.type === 'GRANT_FIELD_SIGNI_ABILITY') {
          const g = act as GrantAction;
          (g.targetOwner === 'opponent' ? oppGrants : selfGrants).push({ g, src: top });
          continue;
        }
        // CONTINUOUS の引用付与 STUB は executor を通らないため、この collector で【自】を展開する。
        // STUB 自体は消さず、`sourceAbilityText` と同じ `abilityBlockTextOf(card,effectId)` で当該ブロックだけを読む。
        if (act.type === 'STUB'
            && ['GRANT_ABILITY_INNER_TEXT', 'GRANT_QUOTED_AUTO_ABILITY', 'GRANT_QUOTED_ABILITY'].includes(act.id)) {
          const sourceCard = cardMap.get(top);
          const blockText = sourceCard ? abilityBlockTextOf(sourceCard, eff.effectId) : '';
          const quotedText = blockText.match(/「([^」]+)」(?:の能力)?を得る/)?.[1] ?? '';
          if (!sourceCard || !/^【自】/.test(quotedText)) continue;
          const parsedQuoted: CardEffect[] = (() => {
            try {
              return parseCardEffects({ ...sourceCard, EffectText: quotedText, BurstText: '' });
            } catch {
              return [];
            }
          })();
          const usable = parsedQuoted.filter(granted => granted.effectType === 'AUTO' && granted.action
            && (granted.action.type !== 'STUB' || granted.action.id === 'SET_OPP_SIGNI_POWER_BY_SELF_POWER'));
          if (usable.length === 0) continue;
          const tagged = usable.map((granted, index) => ({
            ...granted,
            effectId: `${eff.effectId}-quoted-${index + 1}`,
          }));
          result.set(top, [...(result.get(top) ?? []), ...tagged]);
        }
      }
    }
  }

  // プレイヤー自身へゲーム中付与されたCONTINUOUSも、同じシグニ能力付与レイヤーへ載せる。
  for (const eff of (ownerState.game_granted_effects ?? [])) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, '', powersOf())) continue;
    const actions = eff.action.type === 'SEQUENCE' ? eff.action.steps : [eff.action];
    for (const act of actions) {
      if (act.type !== 'GRANT_FIELD_SIGNI_ABILITY') continue;
      const g = act as GrantAction;
      (g.targetOwner === 'opponent' ? oppGrants : selfGrants).push({ g, src: '', fromPlayer: true });
    }
  }
  if (selfGrants.length === 0 && oppGrants.length === 0) return result;

  // 2) フィルタに合う付与先の場のシグニへ付与（thisCardOnly は付与元自身のみ）
  const apply = (grants: Array<{ g: GrantAction; src: string; fromPlayer?: boolean }>, tgtState: PlayerState) => {
    if (grants.length === 0) return;
    for (let zi = 0; zi < 3; zi++) {
      const top = tgtState.field.signi[zi]?.at(-1);
      if (!top) continue;
      const card = cardMap.get(baseNum(top));
      for (const { g, src, fromPlayer } of grants) {
        if (g.thisCardOnly && top !== src) continue;
        if (g.filter && !matchesFilter(card, g.filter)) continue;
        if (fromPlayer && g.filter && !matchesStateFilter(tgtState, zi, g.filter)) continue;
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
    const acceNums = acceCardsAt(ownerState.field, zi);
    if (acceNums.length === 0) continue;
    const hostTop = ownerState.field.signi[zi]?.at(-1);
    if (!hostTop) continue;
    const hostCard = cardMap.get(baseNum(hostTop));
    for (const acceNum of acceNums) for (const eff of (effectsMap.get(acceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (eff.action.type !== 'GRANT_ACCE_HOST_ABILITY') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, acceNum)) continue;
      const g = eff.action as GrantAcce;
      if (g.filter && !matchesFilter(hostCard, g.filter)) continue;
      // byChoice（SPK01-11 ラズベリー）: 装着時に選んだ1能力（acce_choice[acceNum]）だけを付与する。
      // 未選択（インデックス未登録）の間は付与しない。
      if (g.byChoice) {
        const idx = ownerState.acce_choice?.[acceNum];
        if (idx === undefined || idx < 0 || idx >= g.abilities.length) continue;
        result.set(hostTop, [...(result.get(hostTop) ?? []), g.abilities[idx]]);
        continue;
      }
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
  // 🆕`O-65`：`activeCondition` のフェイズ限定を効かせるために必要（渡さないと `checkActiveCondition` が
  // true を返して**恒久 no-op** になる）。`WXK08-048-E1`＝「あなたのアタックフェイズの間、このシグニは
  // このカードの下にある…シグニの【自】能力を得る」が**常時付与**になっていた。
  turnPhase?: TurnPhase,
): Map<string, CardEffect[]> {
  const result = new Map<string, CardEffect[]>();
  // 🆕§5.3 `O-66`③：**この関数はもう `EffectText` を読まない**（全角→半角の `toHW` も不要になった）。
  //   付与の中身は `StubAction.underAbilityGrant` が運ぶ。

  for (let zi = 0; zi < 3; zi++) {
    const stack = ownerState.field.signi[zi];
    if (!stack || stack.length < 2) continue;

    const topNum = stack[stack.length - 1];
    const underNums = stack.slice(0, -1);
    const topBaseNum = topNum.includes('#') ? topNum.slice(0, topNum.indexOf('#')) : topNum;
    const topCard = cardMap.get(topBaseNum);

    // Pattern A: トップシグニの CONTINUOUS スタブ → 下のカードから効果を収集
    // 🔴**`topNum` は実戦では必ずインスタンスID（`WX21-024#1`）**だが、`effectsMap` は**カード番号キー**が基本
    //   （インスタンスIDのエントリは card_identity_overrides / granted_effects が作った分だけ）。
    //   そのため旧実装は **実機で Pattern A が一度も見つからず、この付与は丸ごと no-op** だった
    //   （golden は素のカード番号で盤面を作るので緑のまま通っていた＝§5.3 `O-66`③ の実機検証で発覚）。
    //   ⚠下のカード側（`unBase`）は最初から番号へ落としていたので、**上側だけが穴**だった。
    for (const eff of (effectsMap.get(topNum) ?? effectsMap.get(topBaseNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, topNum, undefined, undefined, turnPhase)) continue;
      if (eff.action.type !== 'STUB') continue;
      const stub = eff.action as import('../types/effects').StubAction;

      // 🆕**§5.3 `O-66`③（2026-08-25）＝「下のカードの能力を得る」3種は payload で読む。**
      // 🔴**旧実装は `cardMap` の `EffectText`（＋`BurstText`）を regex で読んでいた**（`O-60` と同型）＝
      //   ①**JSON を見ても何が付与されるか分からない** ②`txt.includes('【常】')` のように**カード全文**を
      //   見るので、**同じカードの別の能力**に書かれた【常】【自】【起】まで拾って種別を広げていた
      //   （`WX21-024` は【出】と【常】を持つので、下のカードの【自】【起】まで得る形に化けうる）。
      // ⚠**ペイロードが無い宣言は何も付与しない（fail-closed）**＝parser が落としても「効かない」で済み、
      //   「下の全カードの全能力を得る」には**ならない**。
      const grantSpec = (stub as import('../types/effects').StubAction).underAbilityGrant;
      if (grantSpec && (stub.id === 'GRANT_UNDER_SIGNI_ALL_ABILITIES'
        || stub.id === 'GRANT_UNDER_SIGNI_CONSTANT_ABILITY'
        || stub.id === 'GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE')) {
        const kinds = new Set(grantSpec.kinds);
        for (const un of underNums) {
          const unBase = un.includes('#') ? un.slice(0, un.indexOf('#')) : un;
          const unCard = cardMap.get(unBase);
          if (!unCard) continue;
          if (grantSpec.filter && !matchesFilter(unCard, grantSpec.filter)) continue;
          // ⚠効果の引き先は**インスタンスID優先・無ければ番号**（`GRANT_UNDER_SIGNI_ALL_ABILITIES` だけ
          //   旧実装がインスタンス側を引いていた＝両方見る形に揃えて挙動差を消す）。
          const src = effectsMap.get(un) ?? effectsMap.get(unBase) ?? [];
          const extra = src.filter(e => {
            if (!kinds.has(e.effectType as 'CONTINUOUS' | 'AUTO' | 'ACTIVATED')) return false;
            if (grantSpec.eichiOnly && e.activeCondition?.type !== 'EICHI_LEVEL_SUM') return false;
            return true;
          });
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
 * DEPLOY_RESTRICT（配置数制限・CONTINUOUS）: 「対戦相手はシグニをN体までしか場に出せない」を
 * 持つシグニ/ルリグが opponentState の場にある場合、myState（配置しようとする側）のシグニ配置数上限 N を返す。
 * WX07-006（レゾナ・【常】）等の恒久版。AUTO版（このターン限定）は PlayerState.signi_deploy_count_limit フラグで別途処理。
 * 見つからなければ undefined。cap は原文 EffectText の「N体まで」から読む（DEPLOY_RESTRICT stub と同じ text ベース）。
 */
export function collectDeployCountLimit(
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
  let cap: number | undefined;
  for (const cn of candidates) {
    const base = cn.split('#')[0]; // instance id（CARDNUM#N）→ base cardNum

    for (const eff of (effectsMap.get(base) ?? effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, opponentState, myState, isOpponentTurn, cardMap, cn)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'DEPLOY_RESTRICT') continue;
      // §5.3 `O-60` 第4バッチ＝**payload だけを読む**（旧実装はここでも `EffectText` を regex で読んでおり、
      // execStubPart3 の同じ判定と二重管理になっていた）。⚠**主語が相手側でない宣言はここでは効かない**
      // （この関数は「相手の場にある札が myState の配置数を縛る」経路）。
      const specDR = act.deployRestrict;
      if (!specDR || specDR.kind !== 'count' || specDR.cap === undefined) continue;
      if (specDR.subject === 'self') continue;
      cap = cap === undefined ? specDR.cap : Math.min(cap, specDR.cap);
    }
  }
  return cap;
}

/**
 * FORCE_PLACE_FRONT (CONTINUOUS): 「対戦相手がシグニを配置する場合、可能ならばこのシグニの正面に配置しなければならない」。
 * opponentState = この能力を持つシグニのプレイヤー（配置を強制する側）
 * myState       = シグニを配置しようとしているプレイヤー（強制される側）
 * 戻り値: myState が配置を強制されるゾーン番号の集合（該当シグニの正面＝2-j。空きゾーンのみ）。
 *   空集合 = 強制なし（該当シグニなし、または正面ゾーンがすべて埋まっている＝「可能ならば」不成立）。
 */
export function collectForcePlaceFrontZones(
  opponentState: PlayerState,
  myState: PlayerState,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  isOpponentTurn: boolean,
): Set<number> {
  const zones = new Set<number>();
  for (let j = 0; j < opponentState.field.signi.length; j++) {
    const cn = opponentState.field.signi[j]?.at(-1);
    if (!cn) continue;
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').BlockActionAction;
      if (act.type !== 'BLOCK_ACTION' || act.actionId !== 'FORCE_PLACE_FRONT') continue;
      if (!checkActiveCondition(eff.activeCondition, opponentState, myState, isOpponentTurn, cardMap, cn)) continue;
      const front = 2 - j; // 盤面ミラー：相手ゾーンjの正面は自分ゾーン2-j
      if (!(myState.field.signi[front]?.length)) zones.add(front); // 正面が空きのときのみ強制
    }
  }
  return zones;
}

/**
 * FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM / FROZEN_SIGNI_TO_TRASH_ON_LEAVE:
 * フィールド上のCONT効果を検査し、凍結シグニバニッシュの置換先を返す。
 * - frozenBanishToDeckBottom: 相手の凍結シグニのバニッシュ先をデッキ下に変更
 * - frozenLeaveToTrash: 相手の凍結シグニが場を離れる場合トラッシュへ
 *
 * どちらも ownerState が置換能力の holder 側。FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM の原文は
 * 「このシグニとのバトルによって」だが StubAction に bySource を持たないため、新語彙は足さず
 * battlingHolderNum と holder instance の一致を追加ガードにする。
 */
export function collectFrozenBanishOverrides(
  ownerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, import('../types/effects').CardEffect[]>,
  battlingHolderNum: string,
  effectivePowers?: Map<string, number>,
): { frozenBanishToDeckBottom: boolean; frozenLeaveToTrash: boolean } {
  let frozenBanishToDeckBottom = false;
  let frozenLeaveToTrash = false;
  const candidates: string[] = [
    ...ownerState.field.signi.flatMap(s => s?.at(-1) ? [s.at(-1)!] : []),
    ...(ownerState.field.lrig.at(-1) ? [ownerState.field.lrig.at(-1)!] : []),
    ...activeKeyAbilitySources(ownerState),
  ];
  for (const cn of candidates) {
    for (const eff of (effectsMap.get(cn) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      if (!checkActiveCondition(eff.activeCondition, ownerState, otherState, isOwnerTurn, cardMap, cn, effectivePowers)) continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB') continue;
      if (act.id === 'FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM' && cn === battlingHolderNum) frozenBanishToDeckBottom = true;
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
    ...activeKeyAbilitySources(opponentState),
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
    ...activeKeyAbilitySources(opponentState),
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

  // アクセカードの CONTINUOUS ACCE_SIGNI_ALL_COLOR：装着先ホストシグニを全色にする
  // （「これにアクセされている＜調理＞のシグニはすべての色を得る」WX22-043 クギニ）。
  // アクセカードは場のシグニではないため CONTINUOUS STUB が発火せず story_overrides に乗らない。
  // ここで signi_acce を直接走査し、ホストへ全色バイパスを付与する。
  for (let zi = 0; zi < (state.field.signi_acce?.length ?? 0); zi++) {
    const acceNums = acceCardsAt(state.field, zi);
    if (acceNums.length === 0) continue;
    const hostTop = state.field.signi[zi]?.at(-1);
    if (!hostTop) continue;
    for (const acceNum of acceNums) for (const eff of (effectsMap.get(acceNum) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type === 'STUB' && act.id === 'ACCE_SIGNI_ALL_COLOR') result.add(hostTop);
    }
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

    // COLOR_INHERIT (source:'energy'): このシグニはあなたのエナゾーンにあるカードの色を追加で持つ（WX11-032・§6.1）
    const hasColorInheritEnergy = [...(effectsMap.get(topNum) ?? [])].some(eff => {
      if (eff.effectType !== 'CONTINUOUS') return false;
      if (!checkActiveCondition(eff.activeCondition, state, otherState, isOwnerTurn, cardMap, topNum)) return false;
      const act = eff.action as import('../types/effects').ColorInheritAction;
      return act.type === 'COLOR_INHERIT' && act.source === 'energy';
    });
    if (hasColorInheritEnergy) {
      for (const enCn of state.energy) {
        const enColor = cardMap.get(enCn)?.Color ?? '';
        for (const c of [...enColor].filter(s => '白赤青緑黒'.includes(s))) {
          if (!extraColors.includes(c)) extraColors.push(c);
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
 * CONTINUOUS GRANT_ABILITY_INNER_TEXT があれば、対象シグニ名と最大フリップ数を返す。
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
  // シグニゾーンに加え、センタールリグも走査（COPY_LRIG_NAME_ABILITY でルリグが【常】コピーした場合に対応）。
  const lrigTop = ownerState.field.lrig.at(-1);
  const holders = [...ownerState.field.signi.map(s => s?.at(-1)), lrigTop];
  for (const top of holders) {
    if (!top) continue;
    for (const eff of (effectsMap.get(top) ?? [])) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as import('../types/effects').StubAction;
      if (act.type !== 'STUB' || act.id !== 'GUARD_ALTERNATIVE_COST') continue;
      // コピー効果の場合は元カードの EffectText を参照（保持者のテキストには記述がないため）。
      const txtCard = eff.copiedFromCardNum ? cardMap.get(eff.copiedFromCardNum) : cardMap.get(top);
      const txt = txtCard?.EffectText ?? '';
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
  // 🔴**一時的な基本レベル変更**（`SET_BASE_LEVEL{until:'END_OF_TURN'}`／`CHANGE_BASE_LEVEL` 系が書く
  //   `attack_phase_level_overrides`）も**ここで cardMap へ反映する**（§6.4 O-10・続き509）。
  //   従来この store の読み手は `EICHI_LEVEL_SUM` の1箇所だけで、レベル参照の funnel（cardMap 上書き）に
  //   載っていなかった＝「基本レベルを1にする」がフィルタにもレベル比較にも一切効かない**ほぼ死んだ store**だった。
  // ⚠CONTINUOUS 宣言（上の scan）より**後**に適用する＝一時変更が恒久宣言を上書きする（後勝ち）。
  for (const state of [ownerState, otherState]) {
    for (const [cn, level] of Object.entries(state.attack_phase_level_overrides ?? {})) {
      if (typeof level === 'number') overrides.push({ cn, level });
    }
  }
  if (overrides.length === 0) return cardMap;
  const newMap = new Map(cardMap);
  for (const { cn, level } of overrides) {
    const card = newMap.get(cn);
    if (card) newMap.set(cn, { ...card, Level: String(level) });
  }
  return newMap;
}
