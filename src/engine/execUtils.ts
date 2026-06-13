import type { PlayerState, CardData, PendingInteractionDef, TargetScope } from '../types';
import { hasShadow, hasShadowLrig } from '../utils/keywords';
import { checkBeatCondition, checkActiveCondition } from './effectEngine';
import type {
  EffectAction,
  TargetFilter,
  Owner,
  NumberOrRef,
  Condition,
} from '../types/effects';

// ===== 実行コンテキスト & 結果型 =====

export interface ExecCtx {
  ownerState: PlayerState;   // "self"：効果オーナー
  otherState: PlayerState;   // "opponent"：相手
  cardMap: Map<string, CardData>;
  logs: string[];
  effectivePowers?: Map<string, number>; // CONTINUOUS+temp_power_mods 適用済みパワー（powerRangeフィルタ用）
  sourceCardNum?: string;    // 効果発動元カード番号（「このシグニ」参照用）
  forceEndTurn?: boolean;    // FORCE_END_TURN でセット → BattleScreen がターン終了処理を行う
  currentPhase?: string;     // 現在のターンフェイズ（DURING_PHASE条件チェック用）
  lastProcessedCards?: string[]; // 直前ステップで処理されたカード番号（POWER_MOD_PER_COUNT等で参照）
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
  // BLOCK_OPP_DECK_TO_ENERGY: 相手CONTにより自分のデッキ→エナ効果がブロックされている
  deckToEnergyBlocked?: boolean;
  // BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: 相手CONTにより自分はシグニ効果でシグニを出せない
  signiFieldPlaceByEffectBlocked?: boolean;
  // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_NON_FIELD_MOVE_BY_OPP / SIGNI_PROTECT_MOVE_EXCEPT_ENERGY:
  // 相手効果でフィールドから移動（バウンス/トラッシュ）できないシグニ番号
  otherTrashFieldProtectedNums?: string[];
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
}

export type ExecResult =
  | { done: true;  ownerState: PlayerState; otherState: PlayerState; logs: string[]; forceEndTurn?: boolean; lastProcessedCards?: string[] }
  | { done: false; ownerState: PlayerState; otherState: PlayerState; logs: string[]; pending: PendingInteractionDef };

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

// バニッシュされたシグニの行き先を決定する（BattleScreenのバトルバニッシュと同一の優先順）。
// - 相手側の banish_redirect: エナの代わりにトラッシュへ
// - 相手側の banish_redirect_to_hand: エナの代わりに手札へ
// - 自身の opp_signi_energy_to_deck_bottom (WX25-CP1-003): エナの代わりにデッキの一番下へ
export function banishDestination(
  removed: PlayerState,   // バニッシュされた側の状態（removeFromField適用済み）
  opponent: PlayerState,  // バニッシュされた側から見た対戦相手の状態
  num: string,
): { state: PlayerState; log: string } {
  if (opponent.banish_redirect === true) {
    return { state: { ...removed, trash: [...removed.trash, num] }, log: 'をバニッシュ（トラッシュへ）' };
  }
  if (opponent.banish_redirect_to_hand === true) {
    return { state: { ...removed, hand: [...removed.hand, num] }, log: 'をバニッシュ（手札へ）' };
  }
  if (removed.opp_signi_energy_to_deck_bottom === true) {
    return { state: { ...removed, deck: [...removed.deck, num] }, log: '→デッキ下' };
  }
  return { state: { ...removed, energy: [...removed.energy, num] }, log: 'をバニッシュ' };
}

// Color列は「黒青」のような連結形式（'/'区切りではない）。単色文字に分解する（「無」は色を持たないため含まない）
export function splitColors(col: string | undefined): string[] {
  if (!col) return [];
  return [...col].filter(c => '白赤青緑黒'.includes(c));
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
export function canPayOptionalCost(costColors: string[], state: PlayerState, cardMap: Map<string, CardData>): boolean {
  const pool = [...state.energy];
  // 無色は任意のエナで支払えるため、色指定コストを先に消費してから無色を割り当てる
  const ordered = [...costColors].sort((a, b) => (a === '無' ? 1 : 0) - (b === '無' ? 1 : 0));
  for (const color of ordered) {
    if (color === '無') {
      if (pool.length === 0) return false;
      pool.splice(0, 1);
    } else {
      const idx = pool.findIndex(n => cardMap.get(n)?.Color?.includes(color));
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
  }
  return true;
}

export function done(ctx: ExecCtx): ExecResult {
  return { done: true, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, forceEndTurn: ctx.forceEndTurn, lastProcessedCards: ctx.lastProcessedCards };
}

export function needsInteraction(ctx: ExecCtx, pending: PendingInteractionDef): ExecResult {
  return { done: false, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, pending };
}

export function matchesFilter(
  card: CardData | undefined,
  filter: TargetFilter | undefined,
  effectivePower?: number,  // 実効パワー（未指定時はcard.Powerを使用）
  classOverride?: string,   // card_class_overridesによるクラス上書き
  allZoneClassOverrides?: Record<string, string>, // TREAT_AS_CLASS_ALL_ZONES: 全ゾーン適用
): boolean {
  if (!card) return false;
  if (!filter) return true;
  if (filter.cardType) {
    const types = Array.isArray(filter.cardType) ? filter.cardType : [filter.cardType];
    if (!types.includes(card.Type as (typeof types)[number])) return false;
  }
  if (filter.color) {
    const colors = Array.isArray(filter.color) ? filter.color : [filter.color];
    if (!colors.some(c => card.Color?.includes(c))) return false;
  }
  if (filter.level !== undefined) {
    const lv = parseInt(card.Level ?? '', 10);
    if (typeof filter.level === 'number') {
      if (lv !== filter.level) return false;
    } else {
      if (filter.level.min !== undefined && lv < filter.level.min) return false;
      if (filter.level.max !== undefined && lv > filter.level.max) return false;
    }
  }
  if (filter.levelParity !== undefined) {
    const lv = parseInt(card.Level ?? '', 10);
    if (isNaN(lv)) return false;
    if (filter.levelParity === 'even' && lv % 2 !== 0) return false;
    if (filter.levelParity === 'odd'  && lv % 2 !== 1) return false;
  }
  if (filter.story) {
    const stories = Array.isArray(filter.story) ? filter.story : [filter.story];
    // card_class_overridesによるクラス上書き、次にTREAT_AS_CLASS_ALL_ZONESオーバーライドを考慮
    const effectiveClass = classOverride ?? allZoneClassOverrides?.[card.CardNum ?? ''] ?? card.CardClass ?? '';
    if (!stories.some(s => effectiveClass.includes(s))) return false;
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
    const lv = parseInt(card.Level ?? '', 10);
    if (filter.levelRange.min !== undefined && lv < filter.levelRange.min) return false;
    if (filter.levelRange.max !== undefined && lv > filter.levelRange.max) return false;
  }
  if (filter.hasGuard !== undefined) {
    // Guard列は '1'/'0' 形式（空文字判定だと全カードがガード持ち扱いになる）
    const hasGuard = card.Guard === '1';
    if (filter.hasGuard !== hasGuard) return false;
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

export function fieldCandidates(
  state: PlayerState,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  effectivePowers?: Map<string, number>,
  allColorSigniNums?: Set<string>,
  fieldSigniExtraColors?: Map<string, string[]>,
): string[] {
  return state.field.signi.flatMap((stack, zoneIdx) => {
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
    if (filter?.isArmored !== undefined) {
      const isArmored = state.field.signi_armor?.[zoneIdx] ?? false;
      if (filter.isArmored !== isArmored) return [];
    }
    // card_class_overridesによるクラス上書きを考慮してフィルター適用
    const classOverride = state.card_class_overrides?.[cardNum];
    // ACCE_SIGNI_ALL_COLOR / ALL_COLOR / ALL_ZONE_BLACK: 全色を持つシグニは色フィルターをバイパス
    const isAllColor = state.story_overrides?.[cardNum] === 'ALL_COLOR' || allColorSigniNums?.has(cardNum);
    const extraColors = fieldSigniExtraColors?.get(cardNum);
    if (!isAllColor && !matchesFilter(cardMap.get(cardNum), filter, effectivePowers?.get(cardNum), classOverride)) {
      // 追加色がある場合: 色フィルターだけ追加色でも再チェック
      if (!extraColors || !filter?.color) return [];
      const filterColors = Array.isArray(filter.color) ? filter.color : [filter.color];
      if (!filterColors.some(c => extraColors.includes(c))) return [];
      // 色フィルター以外のフィルターを通常チェック
      const filterNoColor = { ...filter, color: undefined };
      if (!matchesFilter(cardMap.get(cardNum), filterNoColor, effectivePowers?.get(cardNum), classOverride)) return [];
    }
    if (isAllColor) {
      // 色フィルター以外のフィルターは通常通りチェック
      const filterNoColor = filter ? { ...filter, color: undefined } : undefined;
      if (!matchesFilter(cardMap.get(cardNum), filterNoColor, effectivePowers?.get(cardNum), classOverride)) return [];
    }
    return [cardNum];
  });
}

export function handCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.hand.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
}

export function trashCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>, allZoneClassOverrides?: Record<string, string>): string[] {
  return state.trash.filter(n => matchesFilter(cardMap.get(n), filter, undefined, undefined, allZoneClassOverrides));
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
    case 'FIELD_COUNT':
      return cmp(st(cond.owner).field.signi.filter(s => s && s.length > 0).length,
        cond.operator, resolveNum(cond.value));
    case 'HAND_COUNT':
      return cmp(st(cond.owner).hand.length, cond.operator, resolveNum(cond.value));
    case 'LIFE_COUNT':
      return cmp(st(cond.owner).life_cloth.length, cond.operator, resolveNum(cond.value));
    case 'ENERGY_COUNT':
      return cmp(st(cond.owner).energy.length, cond.operator, resolveNum(cond.value));
    case 'HAS_CARD_IN_FIELD': {
      const srcNum = ctx.sourceCardNum;
      return st(cond.owner).field.signi.some(stack => {
        if (!stack || stack.length === 0) return false;
        const top = stack[stack.length - 1];
        if (cond.excludeSelf && srcNum && top === srcNum) return false;
        return matchesFilter(ctx.cardMap.get(top), cond.filter);
      });
    }
    case 'TRASH_HAS_CARD': {
      const stripCC = ctx.oppTrashColorLoss && cond.owner === 'self';
      return st(cond.owner).trash.some(n => {
        const c = ctx.cardMap.get(n);
        if (!c) return false;
        return matchesFilter(stripCC ? { ...c, Color: '', CardClass: '' } : c, cond.filter);
      });
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
    case 'THIS_CARD_IS_ARMORED': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const zoneIdx = ctx.ownerState.field.signi.findIndex(z => z?.at(-1) === src);
      if (zoneIdx < 0) return false;
      return ctx.ownerState.field.signi_armor?.[zoneIdx] ?? false;
    }
    case 'SELF_POWER_GTE': {
      const src = ctx.sourceCardNum;
      if (!src) return false;
      const pw = ctx.effectivePowers?.get(src) ?? parseInt(ctx.cardMap.get(src)?.Power ?? '0', 10);
      return pw >= cond.value;
    }
    case 'LIFE_COMPARE_OPP':
      return cmp(s.life_cloth.length, cond.operator, o.life_cloth.length);
    case 'DURING_PHASE':
      return cond.phases.includes(ctx.currentPhase ?? '');
    case 'AND':
      return cond.conditions.every(c => evalCondition(c, ctx));
    case 'IS_MY_TURN':            return true;
    case 'IS_OPPONENT_TURN':      return false;
    case 'BEAT_CONDITION': {
      const beatZone = ctx.ownerState.field.beat_zone ?? [];
      return checkBeatCondition(beatZone, cond.condText, ctx.cardMap);
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
    case 'LAST_PROCESSED_LEVEL_SUM_EQ': {
      // lastProcessedCardsのシグニのレベル合計がvalue=Nか判定（WD21-012等）
      const processed = ctx.lastProcessedCards ?? [];
      const sum = processed.reduce((acc, cn) => {
        const c = ctx.cardMap.get(cn);
        if (c?.Type !== 'シグニ') return acc;
        return acc + (parseInt(c.Level ?? '0', 10) || 0);
      }, 0);
      return sum === cond.value;
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
): ExecResult {
  // シャドウ：相手フィールドを対象とする効果からシャドウ持ちシグニを除外
  let filteredCands = candidates;
  if (scope === 'opp_field') {
    // sourceCardNumがルリグの場合はシャドウ(ルリグ)も除外
    const sourceIsLrig = ctx.sourceCardNum
      ? ctx.cardMap.get(ctx.sourceCardNum)?.Type === 'ルリグ'
      : false;
    filteredCands = candidates.filter(n => {
      if (hasShadow(n, ctx.cardMap, ctx.otherState.keyword_grants, ctx.otherState.bonds)) return false;
      if (sourceIsLrig && hasShadowLrig(n, ctx.cardMap, ctx.otherState.keyword_grants)) return false;
      // activeCondition 付きシャドウ（TURN_OWNER等）を評価:
      // n は ctx.otherState のシグニ。ownerState=otherState, isOwnerTurn=false（ctx.ownerState のターン中に効果実行）
      const hasCondShadow = ctx.cardMap.get(n)?.effects?.some(eff => {
        if (eff.effectType !== 'CONTINUOUS' || !eff.activeCondition) return false;
        if (eff.action.type !== 'GRANT_KEYWORD') return false;
        if ((eff.action as { keyword: string }).keyword !== 'シャドウ') return false;
        return checkActiveCondition(eff.activeCondition, ctx.otherState, ctx.ownerState, false, ctx.cardMap, n, ctx.effectivePowers);
      }) ?? false;
      if (hasCondShadow) return false;
      return true;
    });
  }
  if (filteredCands.length === 0) return done(ctx);
  return needsInteraction(ctx, {
    type: 'SELECT_TARGET',
    candidates: filteredCands,
    count,
    optional,
    targetScope: scope,
    thenAction,
    continuation,
    ...(opponentResponds ? { opponentResponds: true } : {}),
  });
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

  // 《ディソナアイコン》→ Story=Dissona
  if (cond.includes('《ディソナアイコン》')) filter.story = 'Dissona';

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

