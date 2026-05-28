import type { PlayerState, CardData, PendingInteractionDef, TargetScope } from '../types';
import { hasShadow } from '../utils/keywords';
import type {
  CardEffect,
  EffectAction,
  TargetFilter,
  Owner,
  NumberOrRef,
  Condition,
  DrawAction,
  BanishAction,
  BounceAction,
  PowerModifyAction,
  PowerSetAction,
  TrashAction,
  EnergyChargeAction,
  EnergyChargeFromDeckAction,
  LifeCrashAction,
  ShuffleDeckAction,
  TransferToHandAction,
  AddToFieldAction,
  AddToLifeAction,
  FreezeAction,
  DownAction,
  UpAction,
  BlockActionAction,
  StoryChangeAction,
  GrantKeywordAction,
  SearchAction,
  SequenceAction,
  ChooseAction,
  ConditionalAction,
  LookAndReorderAction,
  TransferToDeckAction,
  GrantProtectionAction,
  AttachCharmAction,
  RevealAndPickAction,
  PlayFreeAction,
  CostIncreaseAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLrigLevelAction,
  CharmProtectionAction,
  MutualDiscardAndDrawAction,
  RemoveAbilitiesAction,
  GainCoinAction,
  DiscardBothAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PlaceVirusAction,
  AttachAcceAction,
  BloodCrystalArmorAction,
  GrantLrigAbilityAction,
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
}

export type ExecResult =
  | { done: true;  ownerState: PlayerState; otherState: PlayerState; logs: string[]; forceEndTurn?: boolean; lastProcessedCards?: string[] }
  | { done: false; ownerState: PlayerState; otherState: PlayerState; logs: string[]; pending: PendingInteractionDef };

// ===== ユーティリティ =====

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function resolveNum(n: NumberOrRef): number {
  return typeof n === 'number' ? n : 0;
}

function ownerState(owner: Owner, ctx: ExecCtx): PlayerState {
  return owner === 'self' ? ctx.ownerState : ctx.otherState;
}

function setOwnerState(owner: Owner, s: PlayerState, ctx: ExecCtx): ExecCtx {
  return owner === 'self'
    ? { ...ctx, ownerState: s }
    : { ...ctx, otherState: s };
}

function addLog(ctx: ExecCtx, msg: string): ExecCtx {
  return { ...ctx, logs: [...ctx.logs, msg] };
}

// 任意コストが支払えるかチェック（色の一致を検証）
function canPayOptionalCost(costColors: string[], state: PlayerState, cardMap: Map<string, CardData>): boolean {
  const pool = [...state.energy];
  for (const color of costColors) {
    if (color === '無') {
      if (pool.length === 0) return false;
      pool.splice(0, 1);
    } else {
      const idx = pool.findIndex(n => cardMap.get(n)?.Color === color);
      if (idx === -1) return false;
      pool.splice(idx, 1);
    }
  }
  return true;
}

function done(ctx: ExecCtx): ExecResult {
  return { done: true, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, forceEndTurn: ctx.forceEndTurn, lastProcessedCards: ctx.lastProcessedCards };
}

function needsInteraction(ctx: ExecCtx, pending: PendingInteractionDef): ExecResult {
  return { done: false, ownerState: ctx.ownerState, otherState: ctx.otherState, logs: ctx.logs, pending };
}

export function matchesFilter(
  card: CardData | undefined,
  filter: TargetFilter | undefined,
  effectivePower?: number,  // 実効パワー（未指定時はcard.Powerを使用）
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
    if (!stories.some(s => card.CardClass?.includes(s))) return false;
  }
  if (filter.cardName && !card.CardName?.includes(filter.cardName)) return false;
  if (filter.cardNum && card.CardNum !== filter.cardNum) return false;
  if (filter.powerRange) {
    // CONTINUOUS効果・temp_power_mods適用済みの実効パワーを優先して使用する
    const pw = effectivePower !== undefined ? Math.max(0, effectivePower) : parseInt(card.Power ?? '', 10);
    if (filter.powerRange.min !== undefined && pw < filter.powerRange.min) return false;
    if (filter.powerRange.max !== undefined && pw > filter.powerRange.max) return false;
  }
  return true;
}



/**
 * インスタンスID（CardNum#N）からCardNumを取り出す。
 * #N がない場合はそのまま返す（後方互換）。
 */
export function getCardNum(id: string): string {
  const h = id.indexOf('#');
  return h > 0 ? id.slice(0, h) : id;
}

function fieldCandidates(
  state: PlayerState,
  filter: TargetFilter | undefined,
  cardMap: Map<string, CardData>,
  effectivePowers?: Map<string, number>,
): string[] {
  return state.field.signi.flatMap((stack, zoneIdx) => {
    if (!stack || stack.length === 0) return [];
    const cardNum = stack[stack.length - 1];
    // ゾーン状態に依存するフィルター（infected / hasAcce）
    if (filter?.infected !== undefined) {
      const infected = (state.field.signi_virus?.[zoneIdx] ?? 0) > 0;
      if (filter.infected !== infected) return [];
    }
    if (filter?.hasAcce !== undefined) {
      const acceExists = (state.field.signi_acce?.[zoneIdx] ?? null) !== null;
      if (filter.hasAcce !== acceExists) return [];
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
    if (!matchesFilter(cardMap.get(cardNum), filter, effectivePowers?.get(cardNum))) return [];
    return [cardNum];
  });
}

function handCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>): string[] {
  return state.hand.filter(n => matchesFilter(cardMap.get(n), filter));
}

function trashCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>): string[] {
  return state.trash.filter(n => matchesFilter(cardMap.get(n), filter));
}

function energyCandidates(state: PlayerState, filter: TargetFilter | undefined, cardMap: Map<string, CardData>): string[] {
  return state.energy.filter(n => matchesFilter(cardMap.get(n), filter));
}

function evalCondition(cond: Condition, ctx: ExecCtx): boolean {
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
    case 'TRASH_HAS_CARD':
      return st(cond.owner).trash.some(n => matchesFilter(ctx.cardMap.get(n), cond.filter));
    case 'DECK_TOP_MATCHES': {
      const topNum = st(cond.owner).deck[0];
      if (!topNum) return false;
      return matchesFilter(ctx.cardMap.get(topNum), cond.filter);
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
    case 'PAID_ADDITIONAL_COST':  return false; // execSequence の look-ahead で処理済みのため通常到達しない
    case 'COND_STUB':             return true;
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
  const newSigni = state.field.signi.map(stack => {
    if (!stack) return null;
    if (stack[stack.length - 1] !== cardNum) return stack;
    return stack.length > 1 ? stack.slice(0, -1) : null;
  }) as (string[] | null)[];
  const zoneIdx = state.field.signi.findIndex(s => s?.at(-1) === cardNum);
  const newDown   = [...(state.field.signi_down   ?? [false, false, false])];
  const newFrozen = [...(state.field.signi_frozen  ?? [false, false, false])];
  const newCharms = [...(state.field.signi_charms  ?? [null, null, null])];
  const newAcce   = [...(state.field.signi_acce    ?? [null, null, null])];
  const extraTrash: string[] = [];
  if (zoneIdx >= 0) {
    newDown[zoneIdx]   = false;
    newFrozen[zoneIdx] = false;
    if (newCharms[zoneIdx]) { extraTrash.push(newCharms[zoneIdx]!); newCharms[zoneIdx] = null; }
    if (newAcce[zoneIdx])   { extraTrash.push(newAcce[zoneIdx]!);   newAcce[zoneIdx]   = null; }
    // ウィルスはゾーンに属するため、シグニが離れても除去しない
  }
  return {
    ...state,
    trash: extraTrash.length > 0 ? [...state.trash, ...extraTrash] : state.trash,
    field: {
      ...state.field,
      signi: newSigni,
      signi_down:   newDown   as boolean[],
      signi_frozen: newFrozen as boolean[],
      signi_charms: newCharms,
      signi_acce:   newAcce,
    },
  };
}

// SELECT_TARGET ヘルパー：候補数によって自動実行か要インタラクションかを決める
function selectOrInteract(
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
    filteredCands = candidates.filter(
      n => !hasShadow(n, ctx.cardMap, ctx.otherState.keyword_grants),
    );
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

// ===== 個別アクション実行 =====

function execDraw(a: DrawAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const canDraw = Math.min(count, state.deck.length);
  let s: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
  };
  if (canDraw < count && s.trash.length > 0) {
    const topLife = s.life_cloth.at(-1) ?? null;
    s = {
      ...s,
      deck: shuffle([...s.trash]),
      trash: topLife ? [topLife] : [],
      life_cloth: topLife ? s.life_cloth.slice(0, -1) : s.life_cloth,
    };
  }
  return done(addLog(setOwnerState(a.owner, s, ctx), `${count}枚ドロー`));
}

function execBanish(a: BanishAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';

  function applyBanish(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(tgt.owner, cur);
      const removed = removeFromField(num, s);
      const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, num] };
      cur = addLog(setOwnerState(tgt.owner, withEnergy, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をバニッシュ`);
    }
    return cur;
  }

  if (tgt.count === 'ALL') return done(applyBanish(cands, ctx));
  const count = resolveNum(tgt.count);
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx);
}

function execBounce(a: BounceAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';

  function applyBounce(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(tgt.owner, cur);
      const removed = removeFromField(num, s);
      const withHand: PlayerState = { ...removed, hand: [...removed.hand, num] };
      cur = addLog(setOwnerState(tgt.owner, withHand, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}を手札に戻す`);
    }
    return cur;
  }

  if (tgt.count === 'ALL') return done(applyBounce(cands, ctx));
  const count = resolveNum(tgt.count);
  return selectOrInteract(cands, count, (a.optional ?? false) || (tgt.upToCount ?? false), scope, a, undefined, ctx);
}

function execPowerModify(a: PowerModifyAction, ctx: ExecCtx): ExecResult {
  const delta = resolveNum(a.delta);
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  if (cands.length === 0) return done(ctx);

  function applyPowerMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const mods = [
      ...(s.temp_power_mods ?? []),
      ...selected.map(cardNum => ({ cardNum, delta })),
    ];
    const newS: PlayerState = { ...s, temp_power_mods: mods };
    return addLog(setOwnerState(tgtOwner, newS, c), `パワー${delta > 0 ? '+' : ''}${delta}`);
  }

  if (a.target.count === 'ALL') return done(applyPowerMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPowerSet(a: PowerSetAction, ctx: ExecCtx): ExecResult {
  const value = resolveNum(a.value);
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  if (cands.length === 0) return done(ctx);

  function applyPowerSet(targets: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const filtered = (s.temp_power_mods ?? []).filter(m => !targets.includes(m.cardNum));
    const setMods = targets.map(cardNum => {
      const base = parseInt(c.cardMap.get(cardNum)?.Power ?? '0') || 0;
      return { cardNum, delta: value - base };
    });
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: [...filtered, ...setMods] }, c), `パワーを${value}にセット`);
  }

  if (a.target.count === 'ALL') return done(applyPowerSet(cands, ctx));

  const count = resolveNum(a.target.count);
  // 「このシグニ」: sourceCardNum が候補に含まれていれば自動適用
  if (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) {
    return done(applyPowerSet([ctx.sourceCardNum], ctx));
  }
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execTrash(a: TrashAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);

  if (tgt.type === 'SIGNI') {
    const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
    function applyTrashField(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      for (const num of selected) {
        const s = ownerState(tgt.owner, cur);
        const removed = removeFromField(num, s);
        cur = addLog(setOwnerState(tgt.owner,
          { ...removed, trash: [...removed.trash, num] }, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}をトラッシュへ`);
      }
      return cur;
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashField(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
  }

  if (tgt.type === 'HAND_CARD') {
    if (tgt.blind) {
      const count = tgt.count === 'ALL' ? state.hand.length : resolveNum(tgt.count);
      const picked = shuffle([...state.hand]).slice(0, count);
      const newS: PlayerState = {
        ...state,
        hand: state.hand.filter(n => !picked.includes(n)),
        trash: [...state.trash, ...picked],
      };
      return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `手札${count}枚ランダム捨て`), lastProcessedCards: picked });
    }
    const cands = handCandidates(state, tgt.filter, ctx.cardMap);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_hand' : 'opp_hand';
    function applyTrashHand(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      const remaining = [...s.hand];
      const toTrash: string[] = [];
      for (const n of selected) {
        const idx = remaining.indexOf(n);
        if (idx >= 0) { remaining.splice(idx, 1); toTrash.push(n); }
      }
      const newS: PlayerState = { ...s, hand: remaining, trash: [...s.trash, ...toTrash] };
      return addLog(setOwnerState(tgt.owner, newS, c), `手札${toTrash.length}枚捨てる`);
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashHand(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    // actingPlayerSelects=true: 「手札を見てN枚選び捨てさせる」= 自分が選択
    // それ以外の opponent 手札: 「対戦相手は手札をN枚捨てる」= 相手自身が選択
    const opponentResponds = tgt.owner === 'opponent' && !tgt.blind && !tgt.actingPlayerSelects;
    return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx, opponentResponds);
  }

  if (tgt.type === 'ENERGY_CARD') {
    const cands = energyCandidates(state, tgt.filter, ctx.cardMap);
    const scope: TargetScope = tgt.owner === 'self' ? 'self_energy' : 'opp_energy';
    function applyTrashEnergy(selected: string[], c: ExecCtx): ExecCtx {
      const s = ownerState(tgt.owner, c);
      const newS: PlayerState = {
        ...s,
        energy: s.energy.filter(n => !selected.includes(n)),
        trash: [...s.trash, ...selected],
      };
      return addLog(setOwnerState(tgt.owner, newS, c), `エナゾーン${selected.length}枚トラッシュへ`);
    }
    if (tgt.count === 'ALL') return done({ ...applyTrashEnergy(cands, ctx), lastProcessedCards: cands });
    const count = resolveNum(tgt.count);
    return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx);
  }

  if (tgt.type === 'DECK_CARD') {
    const count = tgt.count === 'ALL' ? state.deck.length : resolveNum(tgt.count);
    const took = state.deck.slice(0, count);
    const newS: PlayerState = {
      ...state,
      deck: state.deck.slice(count),
      trash: [...state.trash, ...took],
    };
    return done({ ...addLog(setOwnerState(tgt.owner, newS, ctx), `デッキ上${count}枚トラッシュへ`), lastProcessedCards: took });
  }

  return done(ctx);
}

function execEnergyCharge(a: EnergyChargeAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  let cands: string[];
  let scope: TargetScope;

  if (tgt.type === 'HAND_CARD') {
    cands = handCandidates(state, tgt.filter, ctx.cardMap);
    scope = 'self_hand';
  } else if (tgt.type === 'TRASH_CARD') {
    cands = trashCandidates(state, tgt.filter, ctx.cardMap);
    scope = 'self_trash';
  } else {
    cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);
    scope = 'self_field';
  }

  function applyCharge(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    let newS = { ...s };
    for (const n of selected) {
      if (tgt.type === 'HAND_CARD') {
        newS = { ...newS, hand: newS.hand.filter(x => x !== n), energy: [...newS.energy, n] };
      } else if (tgt.type === 'TRASH_CARD') {
        newS = { ...newS, trash: newS.trash.filter(x => x !== n), energy: [...newS.energy, n] };
      } else {
        const removed = removeFromField(n, newS);
        newS = { ...removed, energy: [...removed.energy, n] };
      }
    }
    return addLog(setOwnerState(tgt.owner, newS, c), `エナチャージ${selected.length}枚`);
  }

  const count = tgt.count === 'ALL' ? cands.length : resolveNum(tgt.count);
  if (tgt.count === 'ALL') return done(applyCharge(cands, ctx));
  return selectOrInteract(cands, count, tgt.upToCount ?? false, scope, a, undefined, ctx);
}

function execEnergyChargeFromDeck(a: EnergyChargeFromDeckAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    energy: [...state.energy, ...took],
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `エナチャージ${count}枚（デッキから）`));
}

function execLifeCrash(a: LifeCrashAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  const crashed: string[] = [];
  let life = [...state.life_cloth];
  for (let i = 0; i < count && life.length > 0; i++) {
    crashed.push(life.pop()!);
  }
  // クラッシュしたカードはcheckゾーンへ（バーストトリガーは呼び出し元が担当）
  const checkCard = crashed[0] ?? null;
  const newS: PlayerState = {
    ...state,
    life_cloth: life,
    field: { ...state.field, check: checkCard },
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `ライフクロス${count}枚クラッシュ`));
}

function execShuffleDeck(a: ShuffleDeckAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const newS: PlayerState = { ...state, deck: shuffle([...state.deck]) };
  return done(addLog(setOwnerState(a.owner, newS, ctx), 'デッキシャッフル'));
}

function execTransferToHand(a: TransferToHandAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  const tgtOwner = src.owner;
  const state = ownerState(tgtOwner, ctx);

  let cands: string[];
  let scope: TargetScope;

  if (src.type === 'TRASH_CARD') {
    cands = trashCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    cands = energyCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_energy' : 'opp_energy';
  } else {
    return done(ctx);
  }

  function applyTransfer(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    let newS = { ...s };
    for (const n of selected) {
      if (src.type === 'TRASH_CARD') {
        newS = { ...newS, trash: newS.trash.filter(x => x !== n), hand: [...newS.hand, n] };
      } else if (src.type === 'ENERGY_CARD') {
        newS = { ...newS, energy: newS.energy.filter(x => x !== n), hand: [...newS.hand, n] };
      }
    }
    return addLog(setOwnerState(tgtOwner, newS, c), `${selected.length}枚を手札に加える`);
  }

  const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
  if (src.count === 'ALL') return done(applyTransfer(cands, ctx));
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx);
}

function execAddToField(a: AddToFieldAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.owner;
  const src = a.source;

  // source未指定＝デッキトップのカードをプレイヤーが選んだゾーンに出す
  if (!src) {
    const state = ownerState(tgtOwner, ctx);
    if (state.deck.length === 0) return done(ctx);
    // 空きゾーンがなければスキップ
    if (!state.field.signi.some(z => !z || z.length === 0)) return done(ctx);
    const cardNum = state.deck[0];
    const newS: PlayerState = { ...state, deck: state.deck.slice(1) };
    const newCtx = setOwnerState(tgtOwner, newS, ctx);
    return needsInteraction(newCtx, {
      type: 'SELECT_ZONE',
      cardNum,
      owner: tgtOwner === 'opponent' ? 'opponent' : 'self',
    });
  }

  const state = ownerState(tgtOwner, ctx);
  let cands: string[];
  let scope: TargetScope;

  if (src.type === 'TRASH_CARD') {
    cands = trashCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_trash' : 'opp_trash';
  } else if (src.type === 'ENERGY_CARD') {
    cands = energyCandidates(state, src.filter, ctx.cardMap);
    scope = tgtOwner === 'self' ? 'self_energy' : 'opp_energy';
  } else {
    return done(ctx);
  }

  // 場に出す：空きゾーンに配置（呼び出し元が担当できないため自動的に最初の空きへ）
  const srcDefined = src!;
  function applyToField(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const n of selected) {
      const s = ownerState(tgtOwner, cur);
      let newS = { ...s };
      if (srcDefined.type === 'TRASH_CARD') {
        newS = { ...newS, trash: newS.trash.filter(x => x !== n) };
      } else if (srcDefined.type === 'ENERGY_CARD') {
        newS = { ...newS, energy: newS.energy.filter(x => x !== n) };
      }
      // 空きゾーンに配置
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyIdx = signi.findIndex(z => !z || z.length === 0);
      if (emptyIdx >= 0) signi[emptyIdx] = [n];
      newS = { ...newS, field: { ...newS.field, signi } };
      cur = addLog(setOwnerState(tgtOwner, newS, cur),
        `${cur.cardMap.get(n)?.CardName ?? n}を場に出す`);
    }
    return cur;
  }

  const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
  if (src.count === 'ALL') return done(applyToField(cands, ctx));
  return selectOrInteract(cands, count, src.upToCount ?? false, scope, a, undefined, ctx);
}

function execAddToLife(a: AddToLifeAction, ctx: ExecCtx): ExecResult {
  const count = resolveNum(a.count);
  const state = ownerState(a.owner, ctx);
  if (!a.fromTop) return done(ctx);
  const took = state.deck.slice(0, count);
  const newS: PlayerState = {
    ...state,
    deck: state.deck.slice(count),
    life_cloth: [...state.life_cloth, ...took],
  };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `ライフクロス+${count}枚`));
}

function execFreeze(a: FreezeAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.target.owner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';

  function applyFreeze(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newFrozen = [...(s.field.signi_frozen ?? [false, false, false])] as boolean[];
      const newDown   = [...(s.field.signi_down   ?? [false, false, false])] as boolean[];
      newFrozen[zoneIdx] = true;
      newDown[zoneIdx]   = true; // 凍結はダウン状態も伴う
      const newS: PlayerState = { ...s, field: { ...s.field, signi_frozen: newFrozen, signi_down: newDown } };
      cur = addLog(setOwnerState(a.target.owner, newS, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}を凍結`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyFreeze(cands, ctx));
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execDown(a: DownAction, ctx: ExecCtx): ExecResult {
  if (a.target.type === 'LRIG') {
    const state = ownerState(a.target.owner, ctx);
    const newS: PlayerState = { ...state, field: { ...state.field, lrig_down: true } };
    const lrigName = state.field.lrig?.length
      ? (ctx.cardMap.get(getCardNum(state.field.lrig.at(-1) ?? ''))?.CardName ?? 'ルリグ')
      : 'ルリグ';
    return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}をダウン`));
  }
  const state = ownerState(a.target.owner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);

  function applyDown(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = true;
      cur = addLog(setOwnerState(a.target.owner,
        { ...s, field: { ...s.field, signi_down: newDown } }, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をダウン`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyDown(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execUp(a: UpAction, ctx: ExecCtx): ExecResult {
  if (a.target.type === 'LRIG') {
    const s = ownerState(a.target.owner, ctx);
    const lrigName = s.field.lrig?.length
      ? (ctx.cardMap.get(getCardNum(s.field.lrig.at(-1) ?? ''))?.CardName ?? 'ルリグ')
      : 'ルリグ';
    const newS: PlayerState = { ...s, field: { ...s.field, lrig_down: false } };
    return done(addLog(setOwnerState(a.target.owner, newS, ctx), `${lrigName}をアップ`));
  }
  const state = ownerState(a.target.owner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  const scope: TargetScope = a.target.owner === 'self' ? 'self_field' : 'opp_field';

  function applyUp(selected: string[], c: ExecCtx): ExecCtx {
    let cur = c;
    for (const num of selected) {
      const s = ownerState(a.target.owner, cur);
      const zoneIdx = s.field.signi.findIndex(st => st?.at(-1) === num);
      if (zoneIdx < 0) continue;
      const newDown = [...(s.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = false;
      cur = addLog(setOwnerState(a.target.owner,
        { ...s, field: { ...s.field, signi_down: newDown } }, cur),
        `${cur.cardMap.get(num)?.CardName ?? num}をアップ`);
    }
    return cur;
  }

  if (a.target.count === 'ALL') return done(applyUp(cands, ctx));
  const count = resolveNum(a.target.count);
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execBlockAction(a: BlockActionAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.target.owner, ctx);
  // NEXT_TURN は ':NEXT_TURN' サフィックスで区別し、ターン終了時に変換して次のターンに適用
  const id = a.until === 'NEXT_TURN' ? `${a.actionId}:NEXT_TURN` : a.actionId;
  const blocked = [...(state.blocked_actions ?? []), id];
  const newS: PlayerState = { ...state, blocked_actions: blocked };
  return done(addLog(setOwnerState(a.target.owner, newS, ctx), `アクション${a.actionId}を封じる`));
}

function execStoryChange(a: StoryChangeAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);

  function applyStory(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const overrides = { ...(s.story_overrides ?? {}) };
    for (const n of selected) overrides[n] = a.newStory;
    return addLog(setOwnerState(tgt.owner, { ...s, story_overrides: overrides }, c),
      `ストーリーを${a.newStory}に変更`);
  }

  if (tgt.count === 'ALL') return done(applyStory(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execGrantKeyword(a: GrantKeywordAction, ctx: ExecCtx): ExecResult {
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);

  function applyGrant(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const grants = { ...(s.keyword_grants ?? {}) };
    for (const n of selected) {
      grants[n] = [...(grants[n] ?? []), a.keyword];
    }
    let newS: PlayerState = { ...s, keyword_grants: grants };

    // チアガールはフリーゾーンへ移動
    if (a.keyword === 'チアガール') {
      for (const n of selected) {
        const zoneIdx = newS.field.signi.findIndex(stack => stack?.at(-1) === n);
        if (zoneIdx >= 0) {
          const newSigni = [...newS.field.signi] as (string[] | null)[];
          newSigni[zoneIdx] = null;
          const newFreeZone = [...(newS.field.free_zone ?? []), n];
          newS = { ...newS, field: { ...newS.field, signi: newSigni, free_zone: newFreeZone } };
        }
      }
    }

    return addLog(setOwnerState(tgt.owner, newS, c), `【${a.keyword}】を付与`);
  }

  if (tgt.count === 'ALL') return done(applyGrant(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execSearch(a: SearchAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.from.owner as Owner, ctx);
  const fromDeck = a.from.location === 'deck';
  const pool = fromDeck ? state.deck : state.trash;

  // 対象カードが1枚でも存在するか確認
  const hasVisible = pool.some(n => matchesFilter(ctx.cardMap.get(n), a.filter));
  if (!hasVisible) {
    if (a.afterSearch) return executeAction(a.afterSearch, ctx);
    return done(ctx);
  }

  // フィルタがある場合は一致カードのみ表示、ない場合は全体を公開
  const visibleCards = pool.filter(n => matchesFilter(ctx.cardMap.get(n), a.filter));

  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards,
    maxPick: a.maxCount,
    thenAction: a.then,
    afterAction: a.afterSearch,
  });
}

function execSequence(a: SequenceAction, ctx: ExecCtx): ExecResult {
  let cur = ctx;
  for (let i = 0; i < a.steps.length; i++) {
    const step = a.steps[i];
    // リコレクトゲート：条件未達なら残りステップをすべてスキップ
    if (step.type === 'RECOLLECT_GATE') {
      const gate = step as import('../types/effects').RecollectGateAction;
      const artsInLrigTrash = (cur.ownerState.lrig_trash ?? []).filter(
        n => cur.cardMap.get(n)?.Type === 'アーツ'
      ).length;
      if (artsInLrigTrash < gate.minArts) {
        return done(addLog(cur, `リコレクト条件未達（アーツ${artsInLrigTrash}枚 / 必要${gate.minArts}枚以上）`));
      }
      cur = addLog(cur, `リコレクト条件達成（アーツ${artsInLrigTrash}枚）`);
      continue;
    }
    // TARGET_AND_DISCARD_HAND: 対戦相手シグニを対象とし手札を捨ててバニッシュ/バウンス/パワー変更
    if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'TARGET_AND_DISCARD_HAND') {
      const remaining = a.steps.slice(i + 1);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
        : undefined;
      const oppState = cur.otherState;
      const cands = fieldCandidates(oppState, { cardType: 'シグニ' }, cur.cardMap, cur.effectivePowers);
      // 対戦相手シグニをバニッシュ（applyDirectActionが正しいカードを特定）、その後手札1枚捨て
      const banishAction: import('../types/effects').BanishAction = {
        type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
      };
      const discardCont: EffectAction = { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as import('../types/effects').TrashAction;
      const fullCont: EffectAction = cont
        ? { type: 'SEQUENCE', steps: [discardCont, cont] } as SequenceAction
        : discardCont;
      return selectOrInteract(cands, 1, false, 'opp_field', banishAction, fullCont, cur);
    }
    // 任意コストパターン: STUB(各種任意コスト) → CONDITIONAL(IS_MY_TURN)
    // IS_MY_TURN はパーサーが「コスト支払い → 効果発動」を表すプレースホルダーとして使用
    if (step.type === 'STUB') {
      const nextStep = i + 1 < a.steps.length ? a.steps[i + 1] : undefined;
      if (nextStep?.type === 'CONDITIONAL' &&
          (nextStep as ConditionalAction).condition.type === 'IS_MY_TURN') {
        const conditional = nextStep as ConditionalAction;
        const remaining = a.steps.slice(i + 2);
        const cont: EffectAction | undefined = remaining.length > 0
          ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining } as SequenceAction)
          : undefined;
        const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
        const stub = step as import('../types/effects').StubAction;
        const costColors = stub.costColors ?? [];

        // OPPONENT_PAY_OPTIONAL: 対戦相手がコストを支払う/支払わない
        // pay → 何も起きない（対戦相手のエナ消費）, skip → 効果発動（conditional.then）
        if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
          const canOppAfford = costColors.length === 0 || canPayOptionalCost(costColors, cur.otherState, cur.cardMap);
          const payLabel = costColors.length > 0
            ? `支払う（コスト: ${costColors.map(c => `《${c}》`).join('')}）`
            : '支払う';
          const options = [
            { id: 'pay', label: payLabel, action: noopAction as EffectAction, available: canOppAfford, ...(costColors.length ? { costColors } : {}) },
            { id: 'skip', label: '支払わない', action: conditional.then, available: true },
          ];
          const pending: PendingInteractionDef = {
            type: 'CHOOSE', options, count: 1, opponentResponds: true,
            ...(cont ? { continuation: cont } : {}),
          };
          return needsInteraction(addLog(cur, '対戦相手：コストを支払いますか？'), pending);
        }

        const canAfford = costColors.length === 0 || canPayOptionalCost(costColors, cur.ownerState, cur.cardMap);
        const payLabel = costColors.length > 0
          ? `発動する（コスト: ${costColors.map(c => `《${c}》`).join('')}）`
          : '発動する';
        const options = [
          { id: 'pay', label: payLabel, action: conditional.then, available: canAfford, ...(costColors.length ? { costColors } : {}) },
          { id: 'skip', label: 'スキップ', action: (conditional.else ?? noopAction) as EffectAction, available: true },
        ];
        const pending: PendingInteractionDef = {
          type: 'CHOOSE',
          options,
          count: 1,
          ...(cont ? { continuation: cont } : {}),
        };
        return needsInteraction(addLog(cur, '任意コスト：発動しますか？'), pending);
      }

      // Pattern ④ 追加コスト強化: STUB ... BASE_STEPS ... CONDITIONAL(IS_MY_TURN|PAID_ADDITIONAL_COST)
      // (直後でなく離れた位置にある CONDITIONAL を先読みしてインタラクションを生成)
      {
        const stub4 = step as import('../types/effects').StubAction;
        const optIds = ['OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS'];
        if (optIds.includes(stub4.id)) {
          const condIdx = a.steps.findIndex((s, idx) => {
            if (idx <= i + 1) return false;
            if (s?.type !== 'CONDITIONAL') return false;
            const c = (s as ConditionalAction).condition.type;
            return c === 'IS_MY_TURN' || c === 'PAID_ADDITIONAL_COST';
          });
          if (condIdx > i + 1) {
            const conditional4 = a.steps[condIdx] as ConditionalAction;
            const baseSteps = a.steps.slice(i + 1, condIdx);
            const remaining4 = a.steps.slice(condIdx + 1);
            const noopAction4: SequenceAction = { type: 'SEQUENCE', steps: [] };
            const baseAction4: EffectAction = baseSteps.length === 0 ? noopAction4
              : baseSteps.length === 1 ? baseSteps[0]
              : { type: 'SEQUENCE', steps: baseSteps } as SequenceAction;
            const cont4: EffectAction | undefined = remaining4.length > 0
              ? (remaining4.length === 1 ? remaining4[0] : { type: 'SEQUENCE', steps: remaining4 } as SequenceAction)
              : undefined;
            const isAdditional = conditional4.condition.type === 'PAID_ADDITIONAL_COST';
            const payAction4: EffectAction = isAdditional
              ? (baseSteps.length === 0
                  ? conditional4.then
                  : { type: 'SEQUENCE', steps: [...baseSteps, conditional4.then] } as SequenceAction)
              : conditional4.then; // replace mode: 強化効果のみ
            const costColors4 = stub4.costColors ?? [];
            const canAfford4 = costColors4.length === 0 || canPayOptionalCost(costColors4, cur.ownerState, cur.cardMap);
            const payLabel4 = costColors4.length > 0
              ? `追加コスト支払う（${costColors4.map(c => `《${c}》`).join('')}）`
              : '追加コストを支払う';
            const opts4 = [
              { id: 'pay', label: payLabel4, action: payAction4, available: canAfford4, ...(costColors4.length ? { costColors: costColors4 } : {}) },
              { id: 'skip', label: 'スキップ（基本効果のみ）', action: baseAction4, available: true },
            ];
            const pending4: PendingInteractionDef = {
              type: 'CHOOSE', options: opts4, count: 1,
              ...(cont4 ? { continuation: cont4 } : {}),
            };
            return needsInteraction(addLog(cur, '追加コスト：支払いますか？'), pending4);
          }
        }
      }
      // Pattern ⑤: OPTIONAL_COST (後続のCONDITIONALなし)
      // pay → 残りステップ実行; skip → 残りステップをスキップ
      {
        const stub5 = step as import('../types/effects').StubAction;
        const optIds5 = ['OPTIONAL_COST', 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', 'OPTIONAL_TRASH_ENERGY_CLASS'];
        if (optIds5.includes(stub5.id)) {
          const remaining5 = a.steps.slice(i + 1);
          const noopAction5: SequenceAction = { type: 'SEQUENCE', steps: [] };
          const cont5: EffectAction = remaining5.length > 0
            ? (remaining5.length === 1 ? remaining5[0] : { type: 'SEQUENCE', steps: remaining5 } as SequenceAction)
            : noopAction5;
          const costColors5 = stub5.costColors ?? [];
          const canAfford5 = costColors5.length === 0 || canPayOptionalCost(costColors5, cur.ownerState, cur.cardMap);
          const payLabel5 = costColors5.length > 0
            ? `支払う（${costColors5.map(c => `《${c}》`).join('')}）`
            : '支払う';
          const options5 = [
            { id: 'pay', label: payLabel5, action: cont5, available: canAfford5, ...(costColors5.length ? { costColors: costColors5 } : {}) },
            { id: 'skip', label: 'スキップ', action: noopAction5 as EffectAction, available: true },
          ];
          const pending5: PendingInteractionDef = { type: 'CHOOSE', options: options5, count: 1 };
          return needsInteraction(addLog(cur, '任意コスト：支払いますか？'), pending5);
        }
      }
      // Pattern ⑥: TARGET_AND_DISCARD_HAND
      // 手札1枚を自動捨て → 残りステップへ続行（ターゲットは後続ステップが独立して選択）
      if (step.type === 'STUB' && (step as import('../types/effects').StubAction).id === 'TARGET_AND_DISCARD_HAND') {
        if (cur.ownerState.hand.length > 0) {
          const discardIdx = cur.ownerState.hand.length - 1;
          const discarded = cur.ownerState.hand[discardIdx];
          const newOwnerHand = [...cur.ownerState.hand.slice(0, discardIdx)];
          const newOwnerTrash = [...cur.ownerState.trash, discarded];
          const discardName = cur.cardMap.get(discarded)?.CardName ?? discarded;
          cur = {
            ...cur,
            ownerState: { ...cur.ownerState, hand: newOwnerHand, trash: newOwnerTrash },
            logs: [...cur.logs, `手札を捨て対戦相手シグニを対象に（${discardName}を捨て）`],
          };
        } else {
          cur = { ...cur, logs: [...cur.logs, '手札なし（TARGET_AND_DISCARD_HAND）'] };
        }
        continue;
      }
    }
    const result = executeAction(step, cur);
    if (!result.done) {
      // インタラクション必要：残りのステップをcontinuationに入れる
      const remaining = a.steps.slice(i + 1);
      const cont: EffectAction | undefined = remaining.length > 0
        ? (remaining.length === 1 ? remaining[0] : { type: 'SEQUENCE', steps: remaining })
        : undefined;
      const pending: PendingInteractionDef = cont
        ? { ...result.pending, continuation: cont }
        : result.pending;
      return { ...result, pending };
    }
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs, lastProcessedCards: result.lastProcessedCards };
  }
  return done(cur);
}

function execChoose(a: ChooseAction, ctx: ExecCtx): ExecResult {
  const options = a.choices.map(ch => ({
    id: ch.choiceId,
    label: ch.label,
    action: ch.action,
    available: ch.condition ? evalCondition(ch.condition, ctx) : true,
  }));
  return needsInteraction(ctx, { type: 'CHOOSE', options, count: a.choose_count });
}

function execConditional(a: ConditionalAction, ctx: ExecCtx): ExecResult {
  const cond = evalCondition(a.condition, ctx);
  if (cond) return executeAction(a.then, ctx);
  if (a.else) return executeAction(a.else, ctx);
  return done(ctx);
}

function execLookAndReorder(a: LookAndReorderAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.source.owner as Owner, ctx);
  const count = resolveNum(a.count);
  const cards = state.deck.slice(0, count);
  if (cards.length === 0) return done(ctx);
  // 一時的にデッキからカードを取り除く
  const newS: PlayerState = { ...state, deck: state.deck.slice(count) };
  const newCtx = setOwnerState(a.source.owner as Owner, newS, ctx);
  return needsInteraction(newCtx, {
    type: 'LOOK_AND_REORDER',
    cards,
    canTrash: a.canTrash ?? false,
    destLocation: 'deck',
    destOwner: (a.destination.owner === 'any' ? 'self' : a.destination.owner) as 'self' | 'opponent',
    destPosition: a.destination.position,
  });
}

function execTransferToDeck(a: TransferToDeckAction, ctx: ExecCtx): ExecResult {
  const src = a.source;
  const state = ownerState(src.owner, ctx);
  const toBottom = a.position === 'bottom';

  function insertToDeck(s: PlayerState, cards: string[]): PlayerState {
    if (a.shuffle) return { ...s, deck: shuffle([...s.deck, ...cards]) };
    return toBottom
      ? { ...s, deck: [...s.deck, ...cards] }
      : { ...s, deck: [...cards, ...s.deck] };
  }

  if (src.type === 'TRASH_CARD') {
    const cands = trashCandidates(state, src.filter, ctx.cardMap);
    const cards = src.count === 'ALL' ? cands : cands.slice(0, resolveNum(src.count));
    const newS = insertToDeck({ ...state, trash: state.trash.filter(n => !cards.includes(n)) }, cards);
    return done({ ...addLog(setOwnerState(src.owner, newS, ctx), `${cards.length}枚をデッキに戻す`), lastProcessedCards: cards });
  }

  if (src.type === 'HAND_CARD') {
    const cands = handCandidates(state, src.filter, ctx.cardMap);
    const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    const scope: TargetScope = src.owner === 'self' ? 'self_hand' : 'opp_hand';

    function applyHandToDeck(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      const s = ownerState(src.owner, cur);
      const remaining = [...s.hand];
      const toMove: string[] = [];
      for (const n of selected) {
        const i = remaining.indexOf(n);
        if (i >= 0) { remaining.splice(i, 1); toMove.push(n); }
      }
      const newS = insertToDeck({ ...s, hand: remaining }, toMove);
      return addLog(setOwnerState(src.owner, newS, cur),
        `手札${toMove.length}枚をデッキ${toBottom ? '下' : '上'}に置く`);
    }

    if (src.count === 'ALL') return done({ ...applyHandToDeck(cands, ctx), lastProcessedCards: cands });
    return selectOrInteract(cands, count, a.source.upToCount ?? false, scope, a, undefined, ctx);
  }

  if (src.type === 'SIGNI') {
    const cands = fieldCandidates(state, src.filter, ctx.cardMap, ctx.effectivePowers);
    const count = src.count === 'ALL' ? cands.length : resolveNum(src.count);
    const scope: TargetScope = src.owner === 'self' ? 'self_field' : 'opp_field';

    function applyToBottom(selected: string[], c: ExecCtx): ExecCtx {
      let cur = c;
      for (const num of selected) {
        const s = ownerState(src.owner, cur);
        const removed = removeFromField(num, s);
        const newS = insertToDeck(removed, [num]);
        cur = addLog(setOwnerState(src.owner, newS, cur),
          `${cur.cardMap.get(num)?.CardName ?? num}をデッキ${toBottom ? '下' : '上'}へ`);
      }
      return cur;
    }

    if (src.count === 'ALL') return done({ ...applyToBottom(cands, ctx), lastProcessedCards: cands });
    return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
  }

  return done(ctx);
}

function execGrantProtection(a: GrantProtectionAction, ctx: ExecCtx): ExecResult {
  // 効果耐性はキーワード付与として扱う
  const tgt = a.target;
  const state = ownerState(tgt.owner, ctx);
  const cands = fieldCandidates(state, tgt.filter, ctx.cardMap, ctx.effectivePowers);
  const keyword = `PROTECTION:${a.from.join(',')}:${a.sourceOwner}`;

  function applyProtection(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgt.owner, c);
    const grants = { ...(s.keyword_grants ?? {}) };
    for (const n of selected) grants[n] = [...(grants[n] ?? []), keyword];
    return addLog(setOwnerState(tgt.owner, { ...s, keyword_grants: grants }, c), '効果耐性付与');
  }

  if (tgt.count === 'ALL') return done(applyProtection(cands, ctx));
  const count = resolveNum(tgt.count);
  const scope: TargetScope = tgt.owner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, false, scope, a, undefined, ctx);
}

function execAttachCharm(a: AttachCharmAction, ctx: ExecCtx): ExecResult {
  const charmOwner = a.charm.owner ?? 'self';
  const toOwner    = a.to.owner ?? 'self';
  const charmSrc   = ownerState(charmOwner, ctx);
  const toState    = ownerState(toOwner, ctx);

  // チャームカードの候補をソース（手札/エナ/トラッシュ/デッキ）から探す
  let charmCands: string[];
  let charmFromLocation: 'hand' | 'energy' | 'trash' | 'deck';
  if (a.charm.type === 'DECK_CARD') {
    charmCands = charmSrc.deck.slice(0, 1);
    charmFromLocation = 'deck';
  } else if (a.charm.type === 'TRASH_CARD') {
    charmCands = charmSrc.trash.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    charmFromLocation = 'trash';
  } else {
    // デフォルトは手札 or エナ（filter指定があればエナから）
    const fromEnergy = charmSrc.energy.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    const fromHand = charmSrc.hand.filter(n => matchesFilter(ctx.cardMap.get(n), a.charm.filter));
    if (fromEnergy.length > 0) { charmCands = fromEnergy; charmFromLocation = 'energy'; }
    else { charmCands = fromHand; charmFromLocation = 'hand'; }
  }
  if (charmCands.length === 0) return done(addLog(ctx, 'チャーム対象なし'));

  // 対象シグニのゾーンを探す
  const toCands = fieldCandidates(toState, a.to.filter, ctx.cardMap, ctx.effectivePowers);
  if (toCands.length === 0) return done(addLog(ctx, 'チャーム付与対象シグニなし'));

  const charmNum = charmCands[0];
  const targetNum = toCands[0];
  const zoneIdx = toState.field.signi.findIndex(s => s?.at(-1) === targetNum);
  if (zoneIdx < 0) return done(addLog(ctx, 'チャーム付与: ゾーン不明'));

  // チャームカードをソースから除去
  let newCharmSrc: PlayerState = { ...charmSrc };
  if (charmFromLocation === 'deck') {
    newCharmSrc = { ...newCharmSrc, deck: newCharmSrc.deck.slice(1) };
  } else if (charmFromLocation === 'energy') {
    newCharmSrc = { ...newCharmSrc, energy: newCharmSrc.energy.filter(n => n !== charmNum) };
  } else if (charmFromLocation === 'trash') {
    newCharmSrc = { ...newCharmSrc, trash: newCharmSrc.trash.filter(n => n !== charmNum) };
  } else {
    newCharmSrc = { ...newCharmSrc, hand: newCharmSrc.hand.filter(n => n !== charmNum) };
  }
  let ctx2 = setOwnerState(charmOwner, newCharmSrc, ctx);

  // 対象シグニのゾーンにチャームをセット
  let newToState = ownerState(toOwner, ctx2);
  const charms = [...(newToState.field.signi_charms ?? [null, null, null])];
  charms[zoneIdx] = charmNum;
  newToState = { ...newToState, field: { ...newToState.field, signi_charms: charms } };
  ctx2 = setOwnerState(toOwner, newToState, ctx2);

  const cardName = ctx.cardMap.get(charmNum)?.CardName ?? charmNum;
  const targetName = ctx.cardMap.get(targetNum)?.CardName ?? targetNum;
  return done(addLog(ctx2, `${cardName}を${targetName}にチャームとして付与`));
}

function execRevealAndPick(a: RevealAndPickAction, ctx: ExecCtx): ExecResult {
  const state = ownerState(a.owner, ctx);
  const count = resolveNum(a.revealCount);
  const visible = state.deck.slice(0, count);
  const pickable = a.filter ? visible.filter(n => matchesFilter(ctx.cardMap.get(n), a.filter)) : visible;
  const maxPick = a.pickCount === 'ALL' ? pickable.length : a.pickCount;

  if (pickable.length === 0) {
    // ピック対象なし：残りを指定場所へ
    if (a.remainder) {
      const pos = a.remainder.position;
      const newS: PlayerState = {
        ...state,
        deck: pos === 'bottom'
          ? [...state.deck.slice(count), ...visible]
          : state.deck,
      };
      return done(addLog(setOwnerState(a.owner, newS, ctx), `デッキ${count}枚公開：対象なし`));
    }
    return done(ctx);
  }

  // 一時的にデッキ上部を除去
  const newS: PlayerState = { ...state, deck: state.deck.slice(count) };
  const newCtx = setOwnerState(a.owner, newS, ctx);

  return needsInteraction(newCtx, {
    type: 'SEARCH',
    visibleCards: pickable,
    maxPick,
    thenAction: a.then,
    afterAction: a.remainder
      ? {
          type: 'LOOK_AND_REORDER',
          source: { location: 'deck', owner: a.owner },
          count: 0, // placeholder: remainder handled separately
          private: true,
          reorder: false,
          destination: { location: a.remainder.location, owner: a.owner, position: a.remainder.position },
        }
      : undefined,
  });
}

function execPlayFree(a: PlayFreeAction, ctx: ExecCtx): ExecResult {
  const state = a.source === 'opp_hand' || a.source === 'opp_trash'
    ? ctx.otherState : ctx.ownerState;
  let cands: string[];
  let scope: TargetScope;

  if (a.source === 'hand') {
    cands = handCandidates(ctx.ownerState, a.filter, ctx.cardMap);
    scope = 'self_hand';
  } else if (a.source === 'opp_hand') {
    cands = handCandidates(ctx.otherState, a.filter, ctx.cardMap);
    scope = 'opp_hand';
  } else if (a.source === 'opp_trash') {
    cands = trashCandidates(ctx.otherState, a.filter, ctx.cardMap);
    scope = 'opp_trash';
  } else {
    // lrig_deck: ルリグデッキの先頭から対象を探す
    cands = (ctx.ownerState.lrig_deck ?? []).filter(n => matchesFilter(ctx.cardMap.get(n), a.filter));
    scope = 'self_hand'; // 近似
  }

  if (cands.length === 0) return done(addLog(ctx, 'PlayFree: 対象なし'));

  // インタラクションでカードを選ばせる（選択後の実際の使用はBattleScreenが担当）
  return needsInteraction(ctx, {
    type: 'SEARCH',
    visibleCards: cands,
    maxPick: 1,
    thenAction: { type: 'ADD_TO_HAND', owner: 'self' }, // プレースホルダー
  });

  void state; void scope;
}

function execCostIncrease(a: CostIncreaseAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.targetOwner === 'self' ? 'self' : 'opponent';
  const state = ownerState(tgtOwner, ctx);
  const mod = {
    direction: 'increase' as const,
    targetCardType: a.targetCardType,
    amount: a.amount,
    until: (a.duration ?? 'PERMANENT') as 'END_OF_TURN' | 'NEXT_TURN' | 'PERMANENT',
  };
  const newS: PlayerState = {
    ...state,
    cost_modifiers: [...(state.cost_modifiers ?? []), mod],
  };
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${a.targetCardType}コスト+${a.amount.map(e => e.count + e.color).join('')}`));
}

function execPowerModifyPerField(a: PowerModifyPerFieldAction, ctx: ExecCtx): ExecResult {
  // ターゲットのcardNumを取得（excludeSelf用）
  const tgtOwnerForExclude = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const tgtStatePre = ownerState(tgtOwnerForExclude, ctx);
  const tgtCandsPre = a.target.count !== 'ALL'
    ? fieldCandidates(tgtStatePre, a.target.filter, ctx.cardMap, ctx.effectivePowers)
    : [];
  const excludeCardNum = a.excludeSelf && tgtCandsPre.length > 0 ? tgtCandsPre[0] : undefined;

  const countSigniInState = (s: PlayerState) => s.field.signi.filter(stack => {
    if (!stack || stack.length === 0) return false;
    const cn = stack[stack.length - 1];
    if (a.excludeSelf && cn === excludeCardNum) return false;
    const card = ctx.cardMap.get(cn);
    return matchesFilter(card, a.countFilter);
  }).length;

  const fieldCount = a.countOwner === 'any'
    ? countSigniInState(ctx.ownerState) + countSigniInState(ctx.otherState)
    : countSigniInState(ownerState(a.countOwner, ctx));

  if (fieldCount === 0) return done(ctx);

  const delta = a.deltaPerUnit * fieldCount;
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（フィールド×${fieldCount}体）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPlaceUnderSigni(a: import('../types/effects').PlaceUnderSigniAction, ctx: ExecCtx): ExecResult {
  const sourceCardNum = ctx.sourceCardNum;
  if (!sourceCardNum) return done(ctx);

  // ソースシグニがあるゾーンのインデックスを探す
  const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.includes(sourceCardNum));
  if (zoneIdx === -1) return done(ctx);

  if (a.source === 'deck_top') {
    const count = Math.min(a.count, ctx.ownerState.deck.length);
    if (count === 0) return done(ctx);
    const cards = ctx.ownerState.deck.slice(0, count);  // デッキの一番上からN枚
    const newDeck = ctx.ownerState.deck.slice(count);
    const newSigni = ctx.ownerState.field.signi.map((stack, i) => {
      if (i !== zoneIdx) return stack;
      return [...cards, ...(stack ?? [])];
    }) as (string[] | null)[];
    const newOwner = { ...ctx.ownerState, deck: newDeck, field: { ...ctx.ownerState.field, signi: newSigni } };
    return done(addLog({ ...ctx, ownerState: newOwner }, `デッキトップから${count}枚をシグニの下に置いた`));
  }

  // trash/hand/energy: SELECT_TARGET インタラクション
  const state = ctx.ownerState;
  const srcList = a.source === 'trash' ? state.trash :
                  a.source === 'hand'  ? state.hand  :
                                          state.energy;
  const cands = srcList.filter(cn => {
    const card = ctx.cardMap.get(cn);
    return !a.filter || matchesFilter(card, a.filter);
  });
  if (cands.length === 0) return done(ctx);
  const thenAction: import('../types/effects').PlaceUnderSourceSigniAction =
    { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: a.source as 'trash' | 'hand' | 'energy' };
  const scope: TargetScope = a.source === 'hand' ? 'self_hand' :
                              a.source === 'energy' ? 'self_energy' : 'self_trash';
  return selectOrInteract(cands, a.count, a.upToCount ?? false, scope, thenAction, undefined, ctx);
}

function execTakeFromUnderSigni(a: import('../types/effects').TakeFromUnderSigniAction, ctx: ExecCtx): ExecResult {
  let cands: string[] = [];
  if (a.fromThis && ctx.sourceCardNum) {
    const zoneIdx = ctx.ownerState.field.signi.findIndex(s => s?.includes(ctx.sourceCardNum!));
    if (zoneIdx !== -1) {
      const stack = ctx.ownerState.field.signi[zoneIdx]!;
      // under-cards = all except the last (top) card
      cands = stack.slice(0, -1).filter(cn => !a.filter || matchesFilter(ctx.cardMap.get(cn), a.filter));
    }
  } else {
    ctx.ownerState.field.signi.forEach(stack => {
      if (!stack || stack.length <= 1) return;
      stack.slice(0, -1).forEach(cn => {
        if (!a.filter || matchesFilter(ctx.cardMap.get(cn), a.filter)) cands.push(cn);
      });
    });
  }
  if (cands.length === 0) return done(ctx);
  return selectOrInteract(cands, a.count, a.upToCount ?? false, 'self_field', a, undefined, ctx);
}

function execNegateAttack(a: import('../types/effects').NegateAttackAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  if (cands.length === 0) return done(ctx);

  if (a.target.count === 'ALL') {
    const s = ownerState(tgtOwner, ctx);
    const negated = [...(s.negated_attacks ?? []), ...cands];
    const newS = { ...s, negated_attacks: negated };
    return done(addLog(setOwnerState(tgtOwner, newS, ctx), `${cands.length}体のシグニのアタックを無効化`));
  }
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execAwakenSigni(ctx: ExecCtx): ExecResult {
  if (!ctx.sourceCardNum) return done(ctx);
  const awakened = [...(ctx.ownerState.awakened_signi ?? [])];
  if (!awakened.includes(ctx.sourceCardNum)) awakened.push(ctx.sourceCardNum);
  const newOwner = { ...ctx.ownerState, awakened_signi: awakened };
  return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.sourceCardNum} が覚醒状態になった`));
}

function execDrawPerFieldCount(a: import('../types/effects').DrawPerFieldCountAction, ctx: ExecCtx): ExecResult {
  const countState = ownerState(a.countOwner, ctx);
  const fieldCount = countState.field.signi.filter(stack => {
    if (!stack || stack.length === 0) return false;
    const card = ctx.cardMap.get(stack[stack.length - 1]);
    return matchesFilter(card, a.countFilter);
  }).length;
  if (fieldCount === 0) return done(ctx);
  const drawCount = a.drawPerUnit * fieldCount;
  return executeAction({ type: 'DRAW', owner: 'self', count: drawCount }, ctx);
}

function execPowerModifyPerLrigLevel(a: PowerModifyPerLrigLevelAction, ctx: ExecCtx): ExecResult {
  const lrigState = a.lrigOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const lrigNum = lrigState.field.lrig.at(-1);
  const lv = parseInt(ctx.cardMap.get(lrigNum ?? '')?.Level ?? '0', 10);
  if (isNaN(lv) || lv === 0) return done(ctx);

  const delta = a.deltaPerLevel * lv;
  const tgtOwner = a.target.owner === 'any' ? 'self' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  if (cands.length === 0) return done(ctx);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtOwner, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtOwner, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（ルリグlv${lv}×${a.deltaPerLevel}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const count = resolveNum(a.target.count);
  const scope: TargetScope = tgtOwner === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, count, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execCharmProtection(a: CharmProtectionAction, ctx: ExecCtx): ExecResult {
  // チャーム保護は BattleScreen のバニッシュ処理内で判定するため、
  // ここではプレイヤー状態にキーワードとして記録する
  const keyword = `CHARM_PROTECTION:${JSON.stringify(a.signiFilter)}`;
  const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
  // フィールドの対象シグニ全体に付与
  const cands = fieldCandidates(ctx.ownerState, a.signiFilter, ctx.cardMap, ctx.effectivePowers);
  for (const n of cands) grants[n] = [...(grants[n] ?? []), keyword];
  const newOwner: PlayerState = { ...ctx.ownerState, keyword_grants: grants };
  return done(addLog({ ...ctx, ownerState: newOwner }, 'チャーム保護付与'));
}

function execMutualDiscardAndDraw(a: MutualDiscardAndDrawAction, ctx: ExecCtx): ExecResult {
  // 両者の手札枚数を記録してから全捨て
  const selfCount  = ctx.ownerState.hand.length;
  const otherCount = ctx.otherState.hand.length;
  const maxCount   = Math.max(selfCount, otherCount);

  let cur: ExecCtx = {
    ...ctx,
    ownerState: { ...ctx.ownerState, hand: [], trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand] },
    otherState: { ...ctx.otherState, hand: [], trash: [...ctx.otherState.trash, ...ctx.otherState.hand] },
  };
  cur = addLog(cur, `両者手札全捨て（${selfCount}枚/${otherCount}枚）`);

  if (!a.drawMax || maxCount === 0) return done(cur);

  // 双方が maxCount 枚引く
  const drawSelf  = Math.min(maxCount, cur.ownerState.deck.length);
  const drawOther = Math.min(maxCount, cur.otherState.deck.length);
  cur = {
    ...cur,
    ownerState: {
      ...cur.ownerState,
      hand: [...cur.ownerState.deck.slice(0, drawSelf)],
      deck: cur.ownerState.deck.slice(drawSelf),
    },
    otherState: {
      ...cur.otherState,
      hand: [...cur.otherState.deck.slice(0, drawOther)],
      deck: cur.otherState.deck.slice(drawOther),
    },
  };
  return done(addLog(cur, `各${maxCount}枚ドロー`));
}

function execRemoveAbilities(a: RemoveAbilitiesAction, ctx: ExecCtx): ExecResult {
  const tgtOwner = a.target.owner === 'any' ? 'opponent' : a.target.owner as Owner;
  const state = ownerState(tgtOwner, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  const removed = [...(state.abilities_removed ?? []), ...cands];
  const newS: PlayerState = { ...state, abilities_removed: removed };
  return done(addLog(setOwnerState(tgtOwner, newS, ctx), `シグニ${cands.length}体の能力を消去`));
}

function execGainCoin(a: GainCoinAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.owner, ctx);
  const gained = Math.min(a.count, 5 - s.coins);
  const newS: PlayerState = { ...s, coins: Math.min(5, s.coins + a.count) };
  return done(addLog(setOwnerState(a.owner, newS, ctx), `コイン${gained}枚獲得（計${newS.coins}枚）`));
}

function execRemoveCharm(a: RemoveCharmAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.targetOwner, ctx);
  const charms = [...(s.field.signi_charms ?? [null, null, null])];
  const count = a.count === 'ALL'
    ? charms.filter(c => c !== null).length
    : a.count;
  let removed = 0;
  let newTrash = [...s.trash];
  const removedCards: string[] = [];
  const newCharms = charms.map(c => {
    if (c !== null && removed < count) {
      // フィルターがあればチェック
      if (!a.targetFilter || matchesFilter(ctx.cardMap.get(c), a.targetFilter)) {
        newTrash = [...newTrash, c];
        removedCards.push(c);
        removed++;
        return null;
      }
    }
    return c;
  });
  const newS: PlayerState = { ...s, field: { ...s.field, signi_charms: newCharms }, trash: newTrash };
  const ctx2 = setOwnerState(a.targetOwner, newS, ctx);
  return done({ ...addLog(ctx2, `チャーム${removed}枚をトラッシュに置いた`), lastProcessedCards: removedCards });
}

function execForceSigniAttack(a: ForceSigniAttackAction, ctx: ExecCtx): ExecResult {
  const s = ownerState(a.targetOwner, ctx);
  const newS: PlayerState = { ...s, must_attack_signi: true };
  const ctx2 = setOwnerState(a.targetOwner, newS, ctx);
  return done(addLog(ctx2, `${a.targetOwner === 'opponent' ? '対戦相手' : '自分'}のシグニは可能ならばアタックしなければならない`));
}

function execPowerModifyPerTrashCount(a: PowerModifyPerTrashCountAction, ctx: ExecCtx): ExecResult {
  const countTrash = (st: PlayerState) => {
    const cards = st.trash;
    if (a.countByVariety) {
      const names = new Set(cards
        .filter(n => !a.countFilter || matchesFilter(ctx.cardMap.get(n), a.countFilter))
        .map(n => ctx.cardMap.get(n)?.CardClass ?? n));
      return names.size;
    }
    return cards.filter(n => !a.countFilter || matchesFilter(ctx.cardMap.get(n), a.countFilter)).length;
  };
  let count = 0;
  if (a.trashOwner === 'both') {
    count = countTrash(ctx.ownerState) + countTrash(ctx.otherState);
  } else {
    count = countTrash(a.trashOwner === 'self' ? ctx.ownerState : ctx.otherState);
  }
  const delta = Math.floor(count / a.unitSize) * a.deltaPerUnit;
  if (delta === 0) return done(ctx);

  const tgtO = a.target.owner === 'opponent' ? 'opponent' : 'self' as 'self' | 'opponent';
  const state = ownerState(tgtO, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);
  if (cands.length === 0) return done(ctx);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtO, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtO, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（トラッシュ${count}枚×${a.deltaPerUnit}/${a.unitSize}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtO === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execPowerModifyPerLifeCount(a: PowerModifyPerLifeCountAction, ctx: ExecCtx): ExecResult {
  const lifeState = a.lifeOwner === 'self' ? ctx.ownerState : ctx.otherState;
  const count = lifeState.life_cloth.length;
  const delta = a.deltaPerLife * count;
  if (delta === 0) return done(ctx);

  const tgtO = a.target.owner === 'opponent' ? 'opponent' : 'self' as 'self' | 'opponent';
  const state = ownerState(tgtO, ctx);
  const cands = fieldCandidates(state, a.target.filter, ctx.cardMap, ctx.effectivePowers);

  function applyMod(selected: string[], c: ExecCtx): ExecCtx {
    const s = ownerState(tgtO, c);
    const mods = [...(s.temp_power_mods ?? []), ...selected.map(cardNum => ({ cardNum, delta }))];
    return addLog(setOwnerState(tgtO, { ...s, temp_power_mods: mods }, c),
      `パワー${delta > 0 ? '+' : ''}${delta}（ライフ${count}枚×${a.deltaPerLife}）`);
  }

  if (a.target.count === 'ALL') return done(applyMod(cands, ctx));
  const cnt = resolveNum(a.target.count);
  const scope: TargetScope = tgtO === 'self' ? 'self_field' : 'opp_field';
  return selectOrInteract(cands, cnt, a.target.upToCount ?? false, scope, a, undefined, ctx);
}

function execDiscardBoth(a: DiscardBothAction, ctx: ExecCtx): ExecResult {
  const selfDiscard = Math.min(a.count, ctx.ownerState.hand.length);
  const otherDiscard = Math.min(a.count, ctx.otherState.hand.length);
  const newCtx: ExecCtx = {
    ...ctx,
    ownerState: { ...ctx.ownerState, hand: ctx.ownerState.hand.slice(selfDiscard), trash: [...ctx.ownerState.trash, ...ctx.ownerState.hand.slice(0, selfDiscard)] },
    otherState: { ...ctx.otherState, hand: ctx.otherState.hand.slice(otherDiscard), trash: [...ctx.otherState.trash, ...ctx.otherState.hand.slice(0, otherDiscard)] },
  };
  return done(addLog(newCtx, `各プレイヤー手札${a.count}枚捨て`));
}

function execPlaceVirus(a: PlaceVirusAction, ctx: ExecCtx): ExecResult {
  const tgtState = a.targetOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  const ZONE_COUNT = 3;
  const virus = [...(tgtState.field.signi_virus ?? [0, 0, 0])];
  // どのゾーンに置けるか（まだウィルスが置かれていないゾーン）
  const available = [0, 1, 2].filter(i => virus[i] === 0);

  let placed = 0;
  if (a.zoneCount === 'ALL') {
    for (let i = 0; i < ZONE_COUNT; i++) {
      if (virus[i] === 0) { virus[i] = a.virusCount; placed++; }
    }
  } else {
    const maxZones = Math.min(a.zoneCount as number, available.length);
    for (let i = 0; i < maxZones; i++) {
      virus[available[i]] = a.virusCount; placed++;
    }
  }

  const newField = { ...tgtState.field, signi_virus: virus };
  const newState: PlayerState = { ...tgtState, field: newField };
  const ctx2 = a.targetOwner === 'opponent'
    ? { ...ctx, otherState: newState }
    : { ...ctx, ownerState: newState };
  return done(addLog(ctx2, `【ウィルス】を${placed}ゾーンに配置`));
}

function execAttachAcce(a: AttachAcceAction, ctx: ExecCtx): ExecResult {
  // シグニ選択 → エナゾーンのこのカードをそのシグニのアクセにする
  // "このカード" = 現在実行中のカード（sourceCardNum 未保持のため簡易実装）
  // UI上の完全実装はBattleScreen側で処理するため、ここでは選択のみ促す
  const tgtState = a.targetSigniOwner === 'opponent' ? ctx.otherState : ctx.ownerState;
  // アクセ未付きのシグニゾーンを候補とする
  const acce = tgtState.field.signi_acce ?? [null, null, null];
  const candidates = (tgtState.field.signi ?? []).flatMap((stack, i) => {
    if (!stack || stack.length === 0) return [];
    if (acce[i] !== null) return []; // すでにアクセあり
    const top = stack[stack.length - 1];
    if (a.signiFilter && !matchesFilter(ctx.cardMap.get(top), a.signiFilter)) return [];
    return [top];
  });
  if (candidates.length === 0) return done(addLog(ctx, 'アクセ対象なし'));

  // エナゾーンからアクセカード選択 → 選択後に signi_acce[zoneIdx] に設定
  // thenAction として ATTACH_ACCE 自身を渡すのは循環するので、
  // ここでは SELECT_TARGET でシグニを選ばせ、applyDirectAction で適用する
  // SELECT_TARGET で「どのシグニに付けるか」を選ばせる（applyDirectActionのATTACH_ACCEで完結）
  const scope: TargetScope = a.targetSigniOwner === 'opponent' ? 'opp_field' : 'self_field';
  return {
    done: false,
    ownerState: ctx.ownerState,
    otherState: ctx.otherState,
    logs: ctx.logs,
    pending: {
      type: 'SELECT_TARGET',
      candidates,
      count: 1,
      optional: false,
      targetScope: scope,
      thenAction: a, // BattleScreen 側で ATTACH_ACCE を解釈して signi_acce を更新
    } as PendingInteractionDef,
  };
}

function execBloodCrystalArmor(a: BloodCrystalArmorAction, ctx: ExecCtx): ExecResult {
  // 自分のフィールドにある＜紅蓮＞シグニのうち未武装のものを選択
  const candidates = (ctx.ownerState.field.signi ?? []).flatMap((stack) => {
    if (!stack || stack.length === 0) return [];
    const top = stack[stack.length - 1];
    const card = ctx.cardMap.get(top);
    if (a.targetFilter && !matchesFilter(card, a.targetFilter)) return [];
    // 血晶武装可能（手札またはトラッシュに同名カードがある）
    const sameName = card?.CardName;
    if (!sameName) return [];
    const inHand = a.source.includes('hand') && ctx.ownerState.hand.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    const inTrash = a.source.includes('trash') && ctx.ownerState.trash.some(n => ctx.cardMap.get(n)?.CardName === sameName);
    if (!inHand && !inTrash) return [];
    return [top];
  });
  if (candidates.length === 0) return done(addLog(ctx, '血晶武装対象なし'));

  return {
    done: false,
    ownerState: ctx.ownerState,
    otherState: ctx.otherState,
    logs: ctx.logs,
    pending: {
      type: 'SELECT_TARGET',
      candidates,
      count: Math.min(a.count, candidates.length),
      optional: false,
      targetScope: 'self_field',
      thenAction: a, // BattleScreen側で解釈してスタックに積む
    } as PendingInteractionDef,
  };
}

function execAddCraftToLrigDeck(a: import('../types/effects').AddCraftToLrigDeckAction, ctx: ExecCtx): ExecResult {
  // CardData_TK から cardName が一致するクラフトカードを検索
  const craftCard = [...ctx.cardMap.values()].find(
    c => c.CardName === a.cardName && c.Type?.includes('クラフト'),
  );
  if (!craftCard) {
    return done(addLog(ctx, `クラフトカード「${a.cardName}」が見つかりません`));
  }
  const s = ownerState(a.owner, ctx);
  const additions = Array(a.count).fill(craftCard.CardNum);
  const newState: PlayerState = {
    ...s,
    lrig_deck: [...additions, ...s.lrig_deck],
  };
  return done(addLog(
    setOwnerState(a.owner, newState, ctx),
    `クラフト「${a.cardName}」×${a.count}枚をルリグデッキに追加`,
  ));
}

// ===== メイン実行関数 =====

export function executeAction(action: EffectAction, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'DRAW':                    return execDraw(action as DrawAction, ctx);
    case 'BANISH':                  return execBanish(action as BanishAction, ctx);
    case 'BOUNCE':                  return execBounce(action as BounceAction, ctx);
    case 'POWER_MODIFY':            return execPowerModify(action as PowerModifyAction, ctx);
    case 'POWER_SET':               return execPowerSet(action as PowerSetAction, ctx);
    case 'TRASH':                   return execTrash(action as TrashAction, ctx);
    case 'ENERGY_CHARGE':           return execEnergyCharge(action as EnergyChargeAction, ctx);
    case 'ENERGY_CHARGE_FROM_DECK': return execEnergyChargeFromDeck(action as EnergyChargeFromDeckAction, ctx);
    case 'LIFE_CRASH':              return execLifeCrash(action as LifeCrashAction, ctx);
    case 'SHUFFLE_DECK':            return execShuffleDeck(action as ShuffleDeckAction, ctx);
    case 'REVEAL':                  return done(addLog(ctx, 'カードを公開'));
    case 'ADD_TO_HAND':             return done(addLog(ctx, 'カードを手札に加える')); // SEARCH内で処理
    case 'TRANSFER_TO_HAND':        return execTransferToHand(action as TransferToHandAction, ctx);
    case 'ADD_TO_FIELD':            return execAddToField(action as AddToFieldAction, ctx);
    case 'ADD_TO_LIFE':             return execAddToLife(action as AddToLifeAction, ctx);
    case 'FREEZE':                  return execFreeze(action as FreezeAction, ctx);
    case 'DOWN':                    return execDown(action as DownAction, ctx);
    case 'UP':                      return execUp(action as UpAction, ctx);
    case 'BLOCK_ACTION':            return execBlockAction(action as BlockActionAction, ctx);
    case 'STORY_CHANGE':            return execStoryChange(action as StoryChangeAction, ctx);
    case 'GRANT_KEYWORD':           return execGrantKeyword(action as GrantKeywordAction, ctx);
    case 'SEARCH':                  return execSearch(action as SearchAction, ctx);
    case 'SEQUENCE':                return execSequence(action as SequenceAction, ctx);
    case 'RECOLLECT_GATE':         return done(addLog(ctx, 'リコレクトゲート（シーケンス外では常に通過）'));
    case 'CHOOSE':                  return execChoose(action as ChooseAction, ctx);
    case 'CONDITIONAL':             return execConditional(action as ConditionalAction, ctx);
    case 'LOOK_AND_REORDER':        return execLookAndReorder(action as LookAndReorderAction, ctx);
    case 'TRANSFER_TO_DECK':        return execTransferToDeck(action as TransferToDeckAction, ctx);
    case 'COUNTER_SPELL':           return done(addLog(ctx, 'スペル/アーツ打ち消し'));
    case 'COST_REDUCTION':          return done(addLog(ctx, 'コスト減少効果（次のカード使用時適用）'));
    case 'GRANT_PROTECTION':        return execGrantProtection(action as GrantProtectionAction, ctx);
    case 'ATTACH_CHARM':            return execAttachCharm(action as AttachCharmAction, ctx);
    case 'REVEAL_AND_PICK':         return execRevealAndPick(action as RevealAndPickAction, ctx);
    case 'PLAY_FREE':               return execPlayFree(action as PlayFreeAction, ctx);
    case 'COST_INCREASE':           return execCostIncrease(action as CostIncreaseAction, ctx);
    case 'POWER_MODIFY_PER_FIELD':     return execPowerModifyPerField(action as PowerModifyPerFieldAction, ctx);
    case 'DRAW_PER_FIELD_COUNT':       return execDrawPerFieldCount(action as import('../types/effects').DrawPerFieldCountAction, ctx);
    case 'AWAKEN_SIGNI':               return execAwakenSigni(ctx);
    case 'NEGATE_ATTACK':              return execNegateAttack(action as import('../types/effects').NegateAttackAction, ctx);
    case 'PLACE_UNDER_SIGNI':          return execPlaceUnderSigni(action as import('../types/effects').PlaceUnderSigniAction, ctx);
    case 'PLACE_UNDER_SOURCE_SIGNI':   return done(addLog(ctx, 'シグニの下に置く（直接呼出）')); // applyDirectAction内で処理
    case 'TAKE_FROM_UNDER_SIGNI':      return execTakeFromUnderSigni(action as import('../types/effects').TakeFromUnderSigniAction, ctx);
    case 'POWER_MODIFY_PER_LRIG_LEVEL': return execPowerModifyPerLrigLevel(action as PowerModifyPerLrigLevelAction, ctx);
    case 'FORCE_END_TURN':             return done(addLog({ ...ctx, forceEndTurn: true }, 'ターンを強制終了'));
    case 'CHARM_PROTECTION':           return execCharmProtection(action as CharmProtectionAction, ctx);
    case 'MUTUAL_DISCARD_AND_DRAW': return execMutualDiscardAndDraw(action as MutualDiscardAndDrawAction, ctx);
    case 'REMOVE_ABILITIES':        return execRemoveAbilities(action as RemoveAbilitiesAction, ctx);
    case 'GAIN_COIN':               return execGainCoin(action as GainCoinAction, ctx);
    case 'DISCARD_BOTH':            return execDiscardBoth(action as DiscardBothAction, ctx);
    case 'REMOVE_CHARM':            return execRemoveCharm(action as RemoveCharmAction, ctx);
    case 'FORCE_SIGNI_ATTACK':      return execForceSigniAttack(action as ForceSigniAttackAction, ctx);
    case 'POWER_MODIFY_PER_TRASH_COUNT': return execPowerModifyPerTrashCount(action as PowerModifyPerTrashCountAction, ctx);
    case 'POWER_MODIFY_PER_LIFE_COUNT':  return execPowerModifyPerLifeCount(action as PowerModifyPerLifeCountAction, ctx);
    case 'GRANT_LRIG_ABILITY': {
      const ga = action as GrantLrigAbilityAction;
      if (ga.abilities && ga.abilities.length > 0) {
        const existing = ctx.ownerState.lrig_granted_auto_effects ?? [];
        const newOwner: PlayerState = {
          ...ctx.ownerState,
          lrig_granted_auto_effects: [...existing, ...ga.abilities],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグ付与能力: ${ga.rawText}`));
      }
      return done(ctx);
    }
    case 'PLACE_VIRUS':                  return execPlaceVirus(action as PlaceVirusAction, ctx);
    case 'ATTACH_ACCE':                  return execAttachAcce(action as AttachAcceAction, ctx);
    case 'BLOOD_CRYSTAL_ARMOR':          return execBloodCrystalArmor(action as BloodCrystalArmorAction, ctx);
    case 'POWER_MODIFY_PER_VIRUS_COUNT': return done(addLog(ctx, 'ウィルス数比例パワー（effectEngine処理）'));
    case 'LRIG_LIMIT_MODIFY':            return done(addLog(ctx, `リミット${(action as import('../types/effects').LrigLimitModifyAction).delta > 0 ? '+' : ''}${(action as import('../types/effects').LrigLimitModifyAction).delta}（UI処理）`));
    case 'ADD_CRAFT_TO_LRIG_DECK':       return execAddCraftToLrigDeck(action as import('../types/effects').AddCraftToLrigDeckAction, ctx);
    // 以下は CONTINUOUS 効果専用（effectEngine 側で処理）
    case 'BANISH_REDIRECT': {
      const newOwner: PlayerState = { ...ctx.ownerState, banish_redirect: true };
      return done(addLog({ ...ctx, ownerState: newOwner }, '対戦相手のシグニのバニッシュ先をトラッシュへ変更'));
    }
    case 'REARRANGE_SIGNI':                return done(addLog(ctx, 'シグニ並び替え（BattleScreen側で処理）'));
    case 'GROW_FREE':                      return done(addLog(ctx, 'フリーグロウ（BattleScreen処理）'));
    case 'POWER_MODIFY_PER_STACK':         return done(addLog(ctx, 'スタック参照パワー（effectEngine処理）'));
    case 'POWER_MODIFY_PER_DECK_COUNT':    return done(addLog(ctx, 'デッキ枚数比例パワー（effectEngine処理）'));
    case 'POWER_MODIFY_PER_ENERGY_COLOR':  return done(addLog(ctx, 'エナ色種類比例パワー（effectEngine処理）'));
    case 'ALT_COST_OPP_TURN':
      return done(addLog(ctx, '対戦相手ターン間コスト変動（展開フェイズで適用済み）'));
    case 'BLOCK_CARD_USE': {
      const bcu = action as import('../types/effects').BlockCardUseAction;
      const newOwner = { ...ctx.ownerState, blocked_card_names: [...(ctx.ownerState.blocked_card_names ?? []), bcu.cardName] };
      return done(addLog({ ...ctx, ownerState: newOwner }, `このターン《${bcu.cardName}》を使用不可`));
    }
    case 'PREVENT_NEXT_DAMAGE': {
      const pnd = action as import('../types/effects').PreventNextDamageAction;
      const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + (pnd.count ?? 1) };
      return done(addLog({ ...ctx, ownerState: newOwner }, `このターン、次の${pnd.count ?? 1}回のダメージを無効`));
    }
    case 'STUB': {
      const stub = action as import('../types/effects').StubAction;
      if (stub.id === 'PREVENT_NEXT_DAMAGE') {
        const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
        return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン、次のダメージを1回無効'));
      }
      if (stub.id === 'NEGATE_ATTACK_ON_TRIGGER') {
        // 発動中のアタックを無効化: prevent_next_damage と同様のフラグで近似
        const newOwner = { ...ctx.ownerState, prevent_next_damage: (ctx.ownerState.prevent_next_damage ?? 0) + 1 };
        return done(addLog({ ...ctx, ownerState: newOwner }, 'アタックを無効にする'));
      }
      // ゲームプレイに影響しない説明テキストは無音でスキップ
      if (stub.id === 'RULE_REMINDER_TEXT' || stub.id === 'USE_CONDITION_TEXT') {
        return done(ctx);
      }
      // 任意コストの単独発動（SEQUENCEパターン外）：支払ったものとして処理
      if (stub.id === 'OPTIONAL_COST' ||
          stub.id === 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST' || stub.id === 'OPTIONAL_TRASH_ENERGY_CLASS') {
        return done(addLog(ctx, '任意コスト（自動支払い）'));
      }
      // 対戦相手払い単独発動（SEQUENCEパターン外）：支払わないとして処理
      if (stub.id === 'OPPONENT_PAY_OPTIONAL') {
        return done(addLog(ctx, '対戦相手任意コスト（スキップ）'));
      }
      // アーツコスト軽減マーカー（コストはBattleScreen使用時に算出済み）
      if (stub.id === 'ARTS_COST_REDUCTION_BY_EFFECT' || stub.id === 'ARTS_COST_REDUCTION_BY_CENTER_LRIG') {
        return done(ctx); // コストは支払い時点で計算済み、ここでは何もしない
      }
      // 数字宣言：現在はランダム値で代用
      if (stub.id === 'DECLARE_NUMBER') {
        // 宣言した数字をPlayerStateに保存するSETアクションを各選択肢に
        const setAction = (n: number): import('../types/effects').StubAction => ({
          type: 'STUB', id: 'SET_DECLARED_NUMBER', value: n,
        });
        const options = [1, 2, 3, 4, 5].map(n => ({
          id: `num_${n}`, label: `${n}を宣言`, action: setAction(n) as EffectAction, available: true,
        }));
        const pending: PendingInteractionDef = { type: 'CHOOSE', options, count: 1 };
        return needsInteraction(addLog(ctx, '数字を宣言してください（1〜5）'), pending);
      }
      // DECLARE_NUMBER の宣言値を PlayerState に格納
      if (stub.id === 'SET_DECLARED_NUMBER') {
        const val = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
        const newOwner = { ...ctx.ownerState, declared_guard_restrict_level: val };
        return done(addLog({ ...ctx, ownerState: newOwner }, `数字「${val}」を宣言（相手はLv${val}シグニでガード不可）`));
      }
      // カード名宣言
      if (stub.id === 'DECLARE_CARD_NAME') {
        return done(addLog(ctx, 'カード名を宣言'));
      }
      // シグニの下にカードを置く
      if (stub.id === 'PLACE_CARD_UNDER_SIGNI' || stub.id === 'STACK_SIGNI_UNDER') {
        return done(addLog(ctx, 'カードをシグニの下に置く'));
      }
      // 覚醒メカニクス（ルリグ変身）
      if (stub.id === 'AWAKEN') {
        return done(addLog(ctx, '【覚醒】発動（BattleScreen側処理）'));
      }
      // ベットメカニクス
      if (stub.id === 'BET_MECHANIC' || stub.id === 'BET_ALTERNATIVE') {
        return done(addLog(ctx, 'ベット（BattleScreen側処理）'));
      }
      // 引用符付き能力付与（キーワードを keyword_grants に格納）
      if (stub.id === 'GRANT_QUOTED_AUTO_ABILITY' || stub.id === 'GRANT_QUOTED_ABILITY' ||
          stub.id === 'GRANT_ABILITY_INNER_TEXT' || stub.id === 'GRANT_QUOTED_ACTIVATE_ABILITY') {
        const srcGQ = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtGQ = srcGQ ? (srcGQ.EffectText ?? '') + ' ' + (srcGQ.BurstText ?? '') : '';
        // 付与するキーワードを抽出（ランサー、ダブルクラッシュ、貫通、マルチエナ等）
        const knownKeywords = ['ランサー', 'ダブルクラッシュ', '貫通', 'マルチエナ', 'アサシン', 'バニッシュ無効', 'ライフバースト無効', '影', 'チャーム'];
        const quotedM = txtGQ.match(/「([^」]+)」を得る/);
        const quotedText = quotedM ? quotedM[1] : '';
        const grantedKws = knownKeywords.filter(kw => quotedText.includes(kw));
        // 対象シグニを決定（「このシグニ」→sourceCardNum、「あなたのシグニすべて」→全自シグニ）
        const allM = txtGQ.match(/あなたのシグニすべては|あなたの場にあるすべてのシグニ/);
        const targetCardNums: string[] = allM
          ? ctx.ownerState.field.signi.flatMap(stack => stack?.at(-1) ? [stack.at(-1)!] : [])
          : (ctx.sourceCardNum ? [ctx.sourceCardNum] : []);
        if (grantedKws.length > 0 && targetCardNums.length > 0) {
          const grants = { ...(ctx.ownerState.keyword_grants ?? {}) };
          for (const cn of targetCardNums) {
            grants[cn] = [...new Set([...(grants[cn] ?? []), ...grantedKws])];
          }
          const newOwner = { ...ctx.ownerState, keyword_grants: grants };
          return done(addLog({ ...ctx, ownerState: newOwner }, `${grantedKws.join('・')}を付与（${targetCardNums.length}体）`));
        }
        if (quotedText) return done(addLog(ctx, `能力付与：「${quotedText.slice(0, 15)}...」（ログのみ）`));
        return done(addLog(ctx, '能力を付与（effectEngine処理）'));
      }
      // ルリグデッキ下操作（多パターン）
      if (stub.id === 'LRIG_UNDER_CARD_OP') {
        const srcLrig = ctx.sourceCardNum;
        const effLrigTxt = srcLrig ? (ctx.cardMap.get(srcLrig)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(srcLrig)?.BurstText ?? '') : '';
        // 「エナゾーンからシグニをデッキの一番上に置く」→ エナ→デッキ先頭
        if (effLrigTxt.match(/エナゾーンから.+シグニ.+デッキの一番上に置いてもよい/) && ctx.ownerState.energy.length > 0) {
          const signiInEnergy = ctx.ownerState.energy.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
          if (signiInEnergy.length > 0) {
            const picked = signiInEnergy[0];
            const newOwner = {
              ...ctx.ownerState,
              energy: ctx.ownerState.energy.filter(cn => cn !== picked),
              deck: [picked, ...ctx.ownerState.deck],
            };
            return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(picked)?.CardName ?? picked}をエナからデッキ上へ`));
          }
          return done(addLog(ctx, 'エナゾーンにシグニなし'));
        }
        // 「このシグニをエナゾーンに置く」→ フィールドからエナへ
        if ((effLrigTxt.match(/このシグニをエナゾーンに置いてもよい/) || effLrigTxt.match(/このシグニをエナゾーンに置く/)) && srcLrig) {
          const removed = removeFromField(srcLrig, ctx.ownerState);
          const newOwner = { ...removed, energy: [...removed.energy, srcLrig] };
          return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcLrig)?.CardName ?? srcLrig}をエナゾーンへ`));
        }
        // 「このシグニの下にあるすべてのカードをトラッシュに置く」パターン
        if (srcLrig) {
          for (const owner of ['self', 'opponent'] as const) {
            const st = ownerState(owner, ctx);
            for (let zi = 0; zi < 3; zi++) {
              const stack = st.field.signi[zi];
              if (!stack || stack.length < 2) continue;
              if (stack.at(-1) === srcLrig) {
                const underCards = stack.slice(0, -1);
                const newSigni = [...st.field.signi] as (string[] | null)[];
                newSigni[zi] = [srcLrig];
                const newS: PlayerState = {
                  ...st,
                  field: { ...st.field, signi: newSigni },
                  trash: [...st.trash, ...underCards],
                };
                return done(addLog(setOwnerState(owner, newS, ctx), `シグニ下${underCards.length}枚をトラッシュへ`));
              }
            }
          }
        }
        return done(addLog(ctx, 'ルリグデッキ下のカード操作'));
      }
      // アンコールメカニクス（トラッシュからシグニを出す）
      if (stub.id === 'ENCORE') {
        return done(addLog(ctx, 'アンコール（BattleScreen側処理）'));
      }
      // 対戦相手のライフクロス上を見る（複数枚パターン対応）
      if (stub.id === 'LOOK_OPP_LIFE_TOP') {
        const srcLT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtLT = srcLT ? (srcLT.EffectText ?? '') + ' ' + (srcLT.BurstText ?? '') : '';
        const toHWLT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        // 「対戦相手の手札を見る」パターン → 相手の手札枚数をログ
        if (txtLT.match(/対戦相手の手札を[０-９\d]*枚?見る/)) {
          const oppHand = ctx.otherState.hand.length;
          return done(addLog({ ...ctx, lastProcessedCards: ctx.otherState.hand }, `対戦相手の手札${oppHand}枚を確認`));
        }
        const oppS = ownerState('opponent', ctx);
        // N枚確認パターン
        const countM = txtLT.match(/ライフクロスの上(?:から)?([０-９\d]+)枚(?:の)?(?:カードを)?(?:見る|確認)/);
        const count = countM ? parseInt(toHWLT(countM[1])) : 1;
        const viewed = oppS.life_cloth.slice(Math.max(0, oppS.life_cloth.length - count));
        if (viewed.length === 0) return done(addLog(ctx, '対戦相手のライフクロスなし'));
        const names = viewed.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、');
        return done(addLog({ ...ctx, lastProcessedCards: viewed }, `対戦相手のライフクロス上${viewed.length}枚を確認：${names}`));
      }
      // トレード：自シグニ1体をトラッシュに置き、相手シグニ1体をバニッシュ
      if (stub.id === 'TRADE_BANISH_SELF_SIGNI') {
        const selfSigni = ctx.ownerState.field.signi
          .map((stack, zi) => stack?.at(-1) ? { cn: stack.at(-1)!, zi } : null)
          .filter(Boolean) as { cn: string; zi: number }[];
        const oppSigni = fieldCandidates(ctx.otherState, { cardType: 'シグニ' }, ctx.cardMap, ctx.effectivePowers);
        if (selfSigni.length === 0 || oppSigni.length === 0) {
          return done(addLog(ctx, 'トレード条件未達（シグニなし）'));
        }
        // まず自分シグニを選んでトラッシュ → continuation で相手シグニをバニッシュ
        const selfCands = selfSigni.map(s => s.cn);
        const trashSelfAction: import('../types/effects').TrashAction = {
          type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 },
        };
        const banishOppAction: import('../types/effects').BanishAction = {
          type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        };
        return selectOrInteract(selfCands, 1, false, 'self_field', trashSelfAction, banishOppAction, ctx);
      }
      // 手札を捨てて対戦相手シグニを対象とする効果（スキップ）
      if (stub.id === 'TARGET_AND_DISCARD_HAND') {
        return done(addLog(ctx, '対戦相手シグニを対象+手札捨て（スキップ）'));
      }
      // 動的パワー修正（COUNT依存）
      if (stub.id === 'POWER_MOD_PER_COUNT') {
        const src = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const effText = src ? (src.EffectText ?? '') + ' ' + (src.BurstText ?? '') : '';
        const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const toSigned = (s: string) => parseInt(toHW(s).replace('－', '-').replace('＋', '+'));
        // パターン1: "N体/枚につき±X" → count × deltaPerUnit
        const perM = effText.match(/([０-９\d]+)[体枚]?につき([－＋][０-９\d]+)/);
        // パターン2: "レベル1につき±X" → sum(level) × deltaPerUnit
        const lvlM = !perM ? effText.match(/レベル([０-９\d]+)につき([－＋][０-９\d]+)/) : null;
        // パターン3: "合計で±X" （固定合計値）
        const totalM = (!perM && !lvlM) ? effText.match(/合計で([－＋][０-９\d]+)/) : null;

        let totalDelta = 0;
        const processed = ctx.lastProcessedCards ?? [];

        if (perM) {
          const divisor = Math.max(1, parseInt(toHW(perM[1])));
          const deltaPerUnit = toSigned(perM[2]);
          totalDelta = Math.floor(processed.length / divisor) * deltaPerUnit;
        } else if (lvlM) {
          const unitLvl = Math.max(1, parseInt(toHW(lvlM[1])));
          const deltaPerLvl = toSigned(lvlM[2]);
          const sumLvl = processed.reduce((acc, cn) => {
            const lv = parseInt(ctx.cardMap.get(cn)?.Level ?? '0');
            return acc + (isNaN(lv) ? 0 : lv);
          }, 0);
          totalDelta = Math.floor(sumLvl / unitLvl) * deltaPerLvl;
        } else if (totalM) {
          totalDelta = toSigned(totalM[1]);
        }

        // ドローパターン: "枚数に+Nを加えた枚数のカードを引く"
        const drawM = effText.match(/枚数に([０-９\d]+)を加えた枚数のカードを引く/);
        if (drawM) {
          const bonus = parseInt(toHW(drawM[1]));
          const drawCount = processed.length + bonus;
          if (drawCount > 0) {
            const s = ctx.ownerState;
            const canDraw = Math.min(drawCount, s.deck.length);
            const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
            return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（移動${processed.length}枚+${bonus}）`));
          }
          return done(addLog(ctx, 'ドロー（移動枚数+N）'));
        }

        if (totalDelta !== 0) {
          const mods = [...(ctx.otherState.temp_power_mods ?? [])];
          const oppField = ctx.otherState.field;
          for (let zi = 0; zi < 3; zi++) {
            const top = oppField.signi[zi]?.at(-1);
            if (top) mods.push({ cardNum: top, delta: totalDelta });
          }
          const newOther = { ...ctx.otherState, temp_power_mods: mods };
          return done(addLog({ ...ctx, otherState: newOther },
            `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（処理${processed.length}枚）`));
        }
        return done(addLog(ctx, 'パワー修正（動的カウント）'));
      }
      if (stub.id === 'POWER_MOD_BY_HAND_COUNT') {
        const src2 = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txt2 = src2 ? (src2.EffectText ?? '') + ' ' + (src2.BurstText ?? '') : '';
        const toHW2 = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const m2 = txt2.match(/手札([０-９\d]+)枚につき([－＋][０-９\d]+)/);
        if (m2) {
          const divisor = Math.max(1, parseInt(toHW2(m2[1])));
          const delta = parseInt(toHW2(m2[2]).replace('－', '-').replace('＋', '+'));
          const count = Math.floor(ctx.ownerState.hand.length / divisor);
          const totalDelta = count * delta;
          if (totalDelta !== 0) {
            const mods = [...(ctx.otherState.temp_power_mods ?? [])];
            const oppField = ctx.otherState.field;
            for (let zi = 0; zi < 3; zi++) {
              const top = oppField.signi[zi]?.at(-1);
              if (top) mods.push({ cardNum: top, delta: totalDelta });
            }
            const newOther = { ...ctx.otherState, temp_power_mods: mods };
            return done(addLog({ ...ctx, otherState: newOther },
              `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（手札${ctx.ownerState.hand.length}枚）`));
          }
        }
        return done(addLog(ctx, 'パワー修正（手札枚数）'));
      }
      if (stub.id === 'DOUBLE_POWER_MINUS' || stub.id === 'POWER_MOD_PER_OPPONENT_FIELD') {
        const srcPMO = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtPMO = srcPMO ? (srcPMO.EffectText ?? '') + ' ' + (srcPMO.BurstText ?? '') : '';
        const toHWP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        // パターン: "対戦相手の場にあるシグニ1体につき-N" or "2倍にする"
        const perM = txtPMO.match(/(?:シグニ|体)([０-９\d]*)体?につき([－＋][０-９\d]+)/);
        const doubleM = txtPMO.match(/パワーを([０-９\d]+)倍にする/);
        const oppCount = ctx.otherState.field.signi.filter(s => s && s.length > 0).length;
        if (perM) {
          const unitCount = parseInt(toHWP(perM[1] || '1')) || 1;
          const delta = parseInt(toHWP(perM[2]).replace('－', '-').replace('＋', '+'));
          const totalDelta = Math.floor(oppCount / unitCount) * delta;
          if (totalDelta !== 0) {
            const mods = [...(ctx.ownerState.temp_power_mods ?? [])];
            for (let zi = 0; zi < 3; zi++) {
              const top = ctx.ownerState.field.signi[zi]?.at(-1);
              if (top) mods.push({ cardNum: top, delta: totalDelta });
            }
            return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, temp_power_mods: mods } },
              `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（相手シグニ${oppCount}体）`));
          }
        } else if (doubleM) {
          return done(addLog(ctx, 'パワー2倍修正（ログのみ）'));
        }
        return done(addLog(ctx, `パワー修正（相手${oppCount}体基準）`));
      }
      // 条件付きパワーボーナス
      if (stub.id === 'CONDITIONAL_POWER_BONUS') {
        const srcCB = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtCB = srcCB ? (srcCB.EffectText ?? '') + ' ' + (srcCB.BurstText ?? '') : '';
        const toHWC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const toSignedC = (s: string) => parseInt(toHWC(s).replace('－', '-').replace('＋', '+'));
        // 共通ユーティリティ：対象シグニ全体にパワー修正を適用
        const applyPowerDelta = (delta: number, target: 'self' | 'opponent', reason: string): ExecResult => {
          if (delta === 0) return done(addLog(ctx, reason));
          const targetState = target === 'self' ? ctx.ownerState : ctx.otherState;
          const mods = [...(targetState.temp_power_mods ?? [])];
          for (let zi = 0; zi < 3; zi++) {
            const top = targetState.field.signi[zi]?.at(-1);
            if (top) mods.push({ cardNum: top, delta });
          }
          const newState = { ...targetState, temp_power_mods: mods };
          const newCtx = target === 'self'
            ? { ...ctx, ownerState: newState }
            : { ...ctx, otherState: newState };
          return done(addLog(newCtx, `パワー${delta > 0 ? '+' : ''}${delta}（${reason}）`));
        };
        // パターン「この方法でN枚以上の場合、±X」（lastProcessedCards使用）
        const cM = txtCB.match(/この方法で.*?([０-９\d]+)枚以上.*?場合.*?([－＋][０-９\d]+)(?:する|される)/s);
        if (cM) {
          const threshold = parseInt(toHWC(cM[1]));
          const delta = toSignedC(cM[2]);
          const processed = ctx.lastProcessedCards ?? [];
          if (processed.length >= threshold) return applyPowerDelta(delta, 'opponent', `条件達成（${processed.length}枚≥${threshold}）`);
          return done(addLog(ctx, `条件未達（必要${threshold}枚、処理${processed.length}枚）`));
        }
        // パターン「あなたの場にシグニがN体以上ある場合、代わりに±X」
        const fieldM = txtCB.match(/あなたの場[にの](?:.*?)シグニが([０-９\d]+)体(?:以上|以上ある)(?:.*?)場合[、，](?:代わりに)?([－＋][０-９\d]+)/);
        if (fieldM) {
          const threshold = parseInt(toHWC(fieldM[1]));
          const delta = toSignedC(fieldM[2]);
          const ownCount = ctx.ownerState.field.signi.filter(s => s && s.length > 0).length;
          if (ownCount >= threshold) return applyPowerDelta(delta, 'opponent', `自場${ownCount}体≥${threshold}`);
          return done(addLog(ctx, `条件未達（自場${ownCount}体/必要${threshold}体）`));
        }
        // パターン「あなたのエナゾーンにカードがN枚以上ある場合」
        const energyM = txtCB.match(/あなたのエナゾーンにカードが([０-９\d]+)枚以上ある場合.*?([－＋][０-９\d]+)/);
        if (energyM) {
          const threshold = parseInt(toHWC(energyM[1]));
          const delta = toSignedC(energyM[2]);
          if (ctx.ownerState.energy.length >= threshold) return applyPowerDelta(delta, 'opponent', `エナ${ctx.ownerState.energy.length}枚≥${threshold}`);
          return done(addLog(ctx, `条件未達（エナ${ctx.ownerState.energy.length}枚/必要${threshold}枚）`));
        }
        // パターン「対戦相手のエナゾーンにカードがN枚以上ある場合」
        const oppEnergyM = txtCB.match(/対戦相手のエナゾーンにカードが([０-９\d]+)枚以上ある場合.*?([－＋][０-９\d]+)/);
        if (oppEnergyM) {
          const threshold = parseInt(toHWC(oppEnergyM[1]));
          const delta = toSignedC(oppEnergyM[2]);
          if (ctx.otherState.energy.length >= threshold) return applyPowerDelta(delta, 'opponent', `相手エナ${ctx.otherState.energy.length}枚≥${threshold}`);
          return done(addLog(ctx, `条件未達（相手エナ${ctx.otherState.energy.length}枚/必要${threshold}枚）`));
        }
        // パターン「あなたの手札がN枚以上の場合」
        const handM = txtCB.match(/あなたの手札が([０-９\d]+)枚以上(?:の場合)?.*?([－＋][０-９\d]+)/);
        if (handM) {
          const threshold = parseInt(toHWC(handM[1]));
          const delta = toSignedC(handM[2]);
          if (ctx.ownerState.hand.length >= threshold) return applyPowerDelta(delta, 'opponent', `手札${ctx.ownerState.hand.length}枚≥${threshold}`);
          return done(addLog(ctx, `条件未達（手札${ctx.ownerState.hand.length}枚/必要${threshold}枚）`));
        }
        // パターン「あなたのトラッシュにカード名に〜を含むカードがある場合」（固定パワー）
        const trashNameM = txtCB.match(/あなたのトラッシュにカード名に《?([^》]+)》?を含むカードがある場合.*?([－＋][０-９\d]+)/);
        if (trashNameM) {
          const cardName = trashNameM[1];
          const delta = toSignedC(trashNameM[2]);
          const found = ctx.ownerState.trash.some(cn => ctx.cardMap.get(cn)?.CardName?.includes(cardName));
          if (found) return applyPowerDelta(delta, 'opponent', `トラッシュに${cardName}あり`);
          return done(addLog(ctx, `条件未達（トラッシュに${cardName}なし）`));
        }
        return done(addLog(ctx, '条件付きパワー修正'));
      }
      // グロウ制限：対戦相手の no_grow フラグをセット
      if (stub.id === 'LRIG_GROW_RESTRICT') {
        const newOther = { ...ctx.otherState, no_grow: true };
        return done(addLog({ ...ctx, otherState: newOther }, '対戦相手はグロウできない'));
      }
      // ライフバースト抑制：対戦相手の suppress_life_burst フラグをセット
      if (stub.id === 'SUPPRESS_LIFE_BURST_ON_CRASH' || stub.id === 'SUPPRESS_LIFE_BURST_ON_CARD') {
        const newOther = { ...ctx.otherState, suppress_life_burst: true };
        return done(addLog({ ...ctx, otherState: newOther }, 'このターン対戦相手のライフバーストは発動しない'));
      }
      // このターンのルリグダメージ無効：ownerState に prevent_lrig_damage フラグをセット
      if (stub.id === 'PREVENT_LRIG_DAMAGE_THIS_TURN') {
        const newOwner = { ...ctx.ownerState, prevent_lrig_damage: true };
        return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン自分へのルリグダメージを無効'));
      }
      // 敗北無効フラグ
      if (stub.id === 'PREVENT_DEFEAT_THIS_TURN' || stub.id === 'PREVENT_DEFEAT_UNTIL_NEXT_TURN' || stub.id === 'PREVENT_DEFEAT') {
        const newOwner = { ...ctx.ownerState, prevent_defeat: true };
        return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン敗北無効'));
      }
      // サブスクライバーカウント+1
      if (stub.id === 'GAIN_SUBSCRIBER_COUNT') {
        const newOwner = { ...ctx.ownerState, subscriber_count: (ctx.ownerState.subscriber_count ?? 0) + 1 };
        return done(addLog({ ...ctx, ownerState: newOwner }, `サブスクライバーカウント: ${newOwner.subscriber_count}`));
      }
      // ウイルス除去：対戦相手のシグニに乗った最初のウイルスを取り除く
      if (stub.id === 'REMOVE_VIRUS' || stub.id === 'EXTRA_COST_REMOVE_VIRUS') {
        const virusArr = ctx.otherState.field.signi_virus ?? [0, 0, 0];
        const zoneIdx = virusArr.findIndex(v => v > 0);
        if (zoneIdx < 0) return done(addLog(ctx, 'ウイルスなし'));
        const newVirus = [...virusArr];
        newVirus[zoneIdx] = 0;
        const newOther = { ...ctx.otherState, field: { ...ctx.otherState.field, signi_virus: newVirus } };
        return done(addLog({ ...ctx, otherState: newOther }, `ウイルスを除去（ゾーン${zoneIdx + 1}）`));
      }
      // 手札から任意でエナゾーンに置く
      if (stub.id === 'HAND_TO_ENERGY_OPTIONAL') {
        const srcHTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtHTE = srcHTE ? (srcHTE.EffectText ?? '') + ' ' + (srcHTE.BurstText ?? '') : '';
        const toHWHTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const maxM = txtHTE.match(/手札から(?:カード)?([０-９\d]+)枚まで/);
        const maxHTE = maxM ? parseInt(toHWHTE(maxM[1])) : 1;
        if (ctx.ownerState.hand.length === 0) return done(addLog(ctx, '手札なし（エナ任意置きスキップ）'));
        const toEnaAction: EffectAction = { type: 'MOVE_CARD', from: 'hand', to: 'energy', owner: 'self' } as EffectAction;
        return selectOrInteract(ctx.ownerState.hand, maxHTE, true, 'self_hand', toEnaAction, undefined, ctx);
      }
      // 相手の手札を見てスペルを捨てさせる
      if (stub.id === 'VIEW_AND_DISCARD_SPELL') {
        const srcVDS = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtVDS = srcVDS ? (srcVDS.EffectText ?? '') + ' ' + (srcVDS.BurstText ?? '') : '';
        const toHWVDS = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        // コスト合計N以下のスペル
        const costLimitM = txtVDS.match(/コストの合計が([０-９\d]+)以下のスペル/);
        const costLimit = costLimitM ? parseInt(toHWVDS(costLimitM[1])) : 99;
        const spellCands = ctx.otherState.hand.filter(cn => {
          const c = ctx.cardMap.get(cn);
          if (c?.Type !== 'スペル') return false;
          const cost = c.Cost ?? '';
          const colorCount = (cost.match(/[赤青緑黒白無]/g) ?? []).length;
          return colorCount <= costLimit;
        });
        if (spellCands.length === 0) return done(addLog(ctx, '相手手札に対象スペルなし'));
        const maxM2 = txtVDS.match(/スペル([０-９\d]+)枚/);
        const maxVDS = maxM2 ? parseInt(toHWVDS(maxM2[1])) : 1;
        const discardAction: EffectAction = { type: 'MOVE_CARD', from: 'hand', to: 'trash', owner: 'opponent' } as EffectAction;
        return selectOrInteract(spellCands, maxVDS, false, 'opp_hand', discardAction, undefined, ctx);
      }
      // ゲームから除外：自分のシグニをフィールドからトラッシュへ（ゲーム除外の近似）
      if (stub.id === 'BANISH_FROM_GAME') {
        const src = ctx.sourceCardNum;
        if (!src) return done(addLog(ctx, 'BANISH_FROM_GAME: sourceCardNumなし'));
        const inOwner = ctx.ownerState.field.signi.some(s => s?.at(-1) === src);
        const inOther = ctx.otherState.field.signi.some(s => s?.at(-1) === src);
        if (inOwner) {
          const removed = removeFromField(src, ctx.ownerState);
          const newOwner = { ...removed, trash: [...removed.trash, src] };
          const name = ctx.cardMap.get(src)?.CardName ?? src;
          return done(addLog({ ...ctx, ownerState: newOwner }, `${name}をゲームから除外`));
        }
        if (inOther) {
          const removed = removeFromField(src, ctx.otherState);
          const newOther = { ...removed, trash: [...removed.trash, src] };
          const name = ctx.cardMap.get(src)?.CardName ?? src;
          return done(addLog({ ...ctx, otherState: newOther }, `${name}をゲームから除外`));
        }
        return done(addLog(ctx, 'BANISH_FROM_GAME: フィールドにカードなし'));
      }
      // 対戦相手が手札を1枚選んで捨てる
      if (stub.id === 'OPP_CHOOSE_YOUR_HAND_DISCARD') {
        const cands = ctx.ownerState.hand;
        if (cands.length === 0) return done(addLog(ctx, '手札なし（OPP_CHOOSE_YOUR_HAND_DISCARD）'));
        const trashAction: import('../types/effects').TrashAction = {
          type: 'TRASH',
          target: { type: 'HAND_CARD', owner: 'self', count: 1, upToCount: false },
        };
        return selectOrInteract(cands, 1, false, 'self_hand', trashAction, undefined, ctx, true);
      }
      // チェックゾーンから除外：対戦相手のチェックゾーンのカードをトラッシュへ
      if (stub.id === 'EXILE_FROM_CHECK_ZONE') {
        const target = ctx.otherState.field.check ?? ctx.ownerState.field.check;
        if (target) {
          const cardName = ctx.cardMap.get(target)?.CardName ?? target;
          if (ctx.otherState.field.check) {
            const newOther = {
              ...ctx.otherState,
              trash: [...ctx.otherState.trash, target],
              field: { ...ctx.otherState.field, check: null },
            };
            return done(addLog({ ...ctx, otherState: newOther }, `チェックゾーンから除外（${cardName}）`));
          } else {
            const newOwner = {
              ...ctx.ownerState,
              trash: [...ctx.ownerState.trash, target],
              field: { ...ctx.ownerState.field, check: null },
            };
            return done(addLog({ ...ctx, ownerState: newOwner }, `チェックゾーンから除外（${cardName}）`));
          }
        }
        return done(addLog(ctx, 'チェックゾーンにカードなし'));
      }
      // その他ゾーン/レベル/フェイズ制限
      if (stub.id === 'LRIG_ZONE_RESTRICT' || stub.id === 'LRIG_LEVEL_RESTRICT' || stub.id === 'EXTRA_PHASE_RESTRICT') {
        return done(addLog(ctx, 'ルリグ制限効果（ログのみ）'));
      }
      // カード名コピー系
      if (stub.id === 'COPY_LRIG_NAME_ABILITY') {
        return done(addLog(ctx, 'ルリグ名コピー（ログのみ）'));
      }
      // バトル/アタック条件系
      if (stub.id === 'CONDITIONAL_ARTS_COST' || stub.id === 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE') {
        return done(addLog(ctx, '条件分岐（ログのみ）'));
      }
      // 大量トラッシュ: 相手エナ全体+相手シグニ全体、またはシグニ+キー
      if (stub.id === 'MASS_TRASH') {
        // 相手のエナゾーン全カード + フィールド全シグニをトラッシュ
        const oppSigniAll = ctx.otherState.field.signi.flatMap(s => s ?? []);
        const oppEnaAll = [...ctx.otherState.energy];
        const newOtherField: PlayerState['field'] = {
          ...ctx.otherState.field,
          signi: [null, null, null],
        };
        const newOther: PlayerState = {
          ...ctx.otherState,
          energy: [],
          trash: [...ctx.otherState.trash, ...oppSigniAll, ...oppEnaAll],
          field: newOtherField,
        };
        return done(addLog({ ...ctx, otherState: newOther },
          `相手エナ${oppEnaAll.length}枚+シグニ${oppSigniAll.length}体をトラッシュ`));
      }
      if (stub.id === 'TRASH_ALL_SIGNI_AND_KEY') {
        // 自分のシグニ全体 + キーをトラッシュ/ルリグトラッシュへ
        const srcTAK = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtTAK = srcTAK ? (srcTAK.EffectText ?? '') : '';
        const isSelfTarget = !txtTAK.match(/対戦相手/);
        const target = isSelfTarget ? 'self' : 'opponent';
        const st = ownerState(target, ctx);
        const signiAll = st.field.signi.flatMap(s => s ?? []);
        const keyCard = st.field.key_piece;
        const newField: PlayerState['field'] = { ...st.field, signi: [null, null, null], key_piece: null };
        const newSt: PlayerState = {
          ...st,
          trash: [...st.trash, ...signiAll],
          lrig_trash: keyCard ? [...st.lrig_trash, keyCard] : st.lrig_trash,
          field: newField,
        };
        return done(addLog(setOwnerState(target, newSt, ctx),
          `シグニ${signiAll.length}体${keyCard ? '+キー' : ''}をトラッシュへ`));
      }
      // デッキ公開してシグニを場に出す
      if (stub.id === 'REVEAL_PICK_PLAY') {
        const srcRPP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtRPP = srcRPP ? (srcRPP.EffectText ?? '') + ' ' + (srcRPP.BurstText ?? '') : '';
        const toHWR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const revealCountM = txtRPP.match(/カードを([０-９\d]+)枚(?:見る|公開する)/);
        const revealCount = revealCountM ? parseInt(toHWR(revealCountM[1])) : 5;
        const deckCards = ctx.ownerState.deck.slice(0, Math.min(revealCount, ctx.ownerState.deck.length));
        if (deckCards.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK_PLAY）'));
        // 場に出せるシグニをフィルタ（簡易：「シグニ」タイプ）
        const signiCards = deckCards.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
        const pickCount = txtRPP.match(/シグニを([０-９\d]+)枚まで場に出す/) ? parseInt(toHWR(RegExp.$1)) : 1;
        const addFieldAction: import('../types/effects').AddToFieldAction = { type: 'ADD_TO_FIELD', owner: 'self' };
        const restToTrashAction: import('../types/effects').TrashAction = {
          type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 'ALL' },
        };
        const pending: PendingInteractionDef = {
          type: 'SEARCH',
          visibleCards: deckCards,
          maxPick: Math.min(pickCount, signiCards.length),
          thenAction: addFieldAction,
          restDest: 'trash',
          continuation: restToTrashAction,
        };
        // デッキから公開した分を除去
        const newOwnerDeck = ctx.ownerState.deck.slice(deckCards.length);
        return needsInteraction(
          addLog({ ...ctx, ownerState: { ...ctx.ownerState, deck: newOwnerDeck } }, `デッキ上${deckCards.length}枚公開（シグニを場に）`),
          pending,
        );
      }
      // デッキから探してもよい（REVEAL_AND_PICK: シグニ検索→手札or場）
      if (stub.id === 'REVEAL_AND_PICK') {
        const srcRAP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtRAP = srcRAP ? (srcRAP.EffectText ?? '') + ' ' + (srcRAP.BurstText ?? '') : '';
        const toHWRAP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const countM = txtRAP.match(/シグニ([０-９\d]+)枚を探して/);
        const pickCount = countM ? parseInt(toHWRAP(countM[1])) : 1;
        // デッキ全体からシグニのみをフィルタ
        const signiInDeck = ctx.ownerState.deck.filter(cn => ctx.cardMap.get(cn)?.Type === 'シグニ');
        if (signiInDeck.length === 0) return done(addLog(ctx, 'デッキにシグニなし'));
        const toField = txtRAP.match(/場に出す/) && !txtRAP.match(/手札に加える/);
        const thenAction: EffectAction = toField
          ? { type: 'ADD_TO_FIELD', owner: 'self' } as import('../types/effects').AddToFieldAction
          : { type: 'ADD_TO_HAND', owner: 'self' } as import('../types/effects').AddToHandAction;
        const shuffleAction: import('../types/effects').ShuffleDeckAction = { type: 'SHUFFLE_DECK', owner: 'self' };
        const pending: PendingInteractionDef = {
          type: 'SEARCH',
          visibleCards: signiInDeck,
          maxPick: Math.min(pickCount, signiInDeck.length),
          thenAction,
          afterAction: shuffleAction,
        };
        return needsInteraction(addLog(ctx, `デッキからシグニを${pickCount}枚まで検索`), pending);
      }
      // その他公開ピック（エナへ・任意公開など）
      if (stub.id === 'DECK_REVEAL_UNTIL' || stub.id === 'DECK_REVEAL_UNTIL_CLASS' || stub.id === 'OPP_DECK_REVEAL_UNTIL') {
        return done(addLog(ctx, 'デッキ公開/ピック（ログのみ）'));
      }
      // ソングフラグメント
      if (stub.id === 'SONG_FRAGMENT') {
        return done(addLog(ctx, 'ソング効果フラグメント'));
      }
      // ゲーム全体能力付与
      if (stub.id === 'GAIN_ABILITY_THIS_GAME') {
        const srcGA = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtGA = srcGA ? (srcGA.EffectText ?? '') + ' ' + (srcGA.BurstText ?? '') : '';
        // 「このゲームの間、あなたはグロウできない」
        if (txtGA.match(/このゲームの間、あなたはグロウできない/)) {
          const newOwner = { ...ctx.ownerState, no_grow: true };
          return done(addLog({ ...ctx, ownerState: newOwner }, 'このゲームの間グロウ不可'));
        }
        // 「このゲームの間、対戦相手はグロウできない」
        if (txtGA.match(/このゲームの間、対戦相手はグロウできない/)) {
          const newOther = { ...ctx.otherState, no_grow: true };
          return done(addLog({ ...ctx, otherState: newOther }, 'このゲームの間相手グロウ不可'));
        }
        // 「このゲームの間、あなたは～を使用できない」
        const blockM = txtGA.match(/このゲームの間、あなたは《([^》]+)》を使用できない/);
        if (blockM) {
          const newOwner = { ...ctx.ownerState, blocked_card_names: [...(ctx.ownerState.blocked_card_names ?? []), blockM[1]] };
          return done(addLog({ ...ctx, ownerState: newOwner }, `《${blockM[1]}》の使用をブロック`));
        }
        return done(addLog(ctx, 'このゲームの間：能力付与（ログのみ）'));
      }
      // メインフェイズ終了
      if (stub.id === 'SKIP_MAIN_PHASE') {
        return done(addLog(ctx, 'メインフェイズ終了（BattleScreen側処理）'));
      }
      // ライフクロスの一番上を手札に加える
      if (stub.id === 'CRASH_LIFE_TO_HAND') {
        const srcCLH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtCLH = srcCLH ? (srcCLH.EffectText ?? '') + ' ' + (srcCLH.BurstText ?? '') : '';
        // 対象プレイヤーを判定
        const isOpp = txtCLH.match(/対戦相手のライフクロス.*手札に加える/);
        const target = isOpp ? 'opponent' : 'self';
        const st = ownerState(target, ctx);
        if (st.life_cloth.length === 0) return done(addLog(ctx, 'ライフクロスなし（CRASH_LIFE_TO_HAND）'));
        const top = st.life_cloth[st.life_cloth.length - 1];
        const newSt: PlayerState = {
          ...st,
          life_cloth: st.life_cloth.slice(0, -1),
          hand: [...st.hand, top],
        };
        const name = ctx.cardMap.get(top)?.CardName ?? top;
        return done(addLog(setOwnerState(target, newSt, ctx), `ライフクロス上（${name}）を手札へ`));
      }
      // クラス/色宣言
      if (stub.id === 'DECLARE_CLASS' || stub.id === 'DECLARE_COLOR') {
        return done(addLog(ctx, 'クラス/色宣言（ログのみ）'));
      }
      // ターゲット選択のみ（アクションなし）
      if (stub.id === 'TARGET_ONLY') {
        return done(addLog(ctx, '対象選択（ログのみ）'));
      }
      // デッキ上N枚公開してM枚を手札に加え残りをデッキ下/トラッシュ/エナゾーンへ
      if (stub.id === 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM') {
        const params = (stub as import('../types/effects').StubAction & { revealPickParams?: { pickCount: number | 'ALL'; restDest: 'deck_bottom' | 'trash' | 'energy'; then: 'hand' | 'energy' } }).revealPickParams
          ?? { pickCount: 1, restDest: 'deck_bottom' as const, then: 'hand' as const };
        const effText = ctx.sourceCardNum
          ? (ctx.cardMap.get(ctx.sourceCardNum)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(ctx.sourceCardNum)?.BurstText ?? '')
          : '';
        const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const revealM = effText.match(/カードを([０-９\d]+)枚(?:見る|公開する)/);
        const revealCount = revealM ? parseInt(toHW(revealM[1])) : 5;
        const deckCards = ctx.ownerState.deck.slice(0, Math.min(revealCount, ctx.ownerState.deck.length));
        if (deckCards.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK）'));
        const maxPick = params.pickCount === 'ALL' ? deckCards.length : (params.pickCount as number);
        const addHandAction: import('../types/effects').AddToHandAction = { type: 'ADD_TO_HAND', owner: 'self' };
        const pending: PendingInteractionDef = {
          type: 'SEARCH',
          visibleCards: deckCards,
          maxPick,
          thenAction: addHandAction,
          restDest: params.restDest,
        };
        return needsInteraction(addLog(ctx, `デッキ上${deckCards.length}枚公開（${maxPick}枚まで手札に）`), pending);
      }
      // ソウル/ルリグデッキ操作
      if (stub.id === 'SOUL_OP') {
        const srcSO = ctx.sourceCardNum;
        const effSOtxt = srcSO ? (ctx.cardMap.get(srcSO)?.EffectText ?? '') + ' ' + (ctx.cardMap.get(srcSO)?.BurstText ?? '') : '';
        const processed = ctx.lastProcessedCards ?? [];
        const toHWSO = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        // 「それをルリグデッキに加える」→ sourceCardNumをlrig_deckへ
        if (effSOtxt.match(/それをルリグデッキに加える/) && srcSO) {
          const newOwner = { ...ctx.ownerState, lrig_trash: ctx.ownerState.lrig_trash.filter(n => n !== srcSO), lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), srcSO] };
          return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcSO)?.CardName ?? srcSO}をルリグデッキへ`));
        }
        // 「それらをルリグトラッシュに置く」→ lastProcessedCardsをlrig_trashへ
        if ((effSOtxt.match(/それらをルリグトラッシュに置く/) || effSOtxt.match(/ルリグトラッシュに置く/)) && processed.length > 0) {
          const newOwner = { ...ctx.ownerState, lrig_trash: [...ctx.ownerState.lrig_trash, ...processed] };
          return done(addLog({ ...ctx, ownerState: newOwner }, `${processed.length}枚をルリグトラッシュへ`));
        }
        // 「ルリグトラッシュからアーツをルリグデッキに戻す」
        if (effSOtxt.match(/ルリグトラッシュから.*アーツ.*ルリグデッキに加える/)) {
          const artsInLrigTrash = ctx.ownerState.lrig_trash.filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ');
          if (artsInLrigTrash.length > 0) {
            const toMove = artsInLrigTrash.slice(0, 1);
            const newOwner = {
              ...ctx.ownerState,
              lrig_trash: ctx.ownerState.lrig_trash.filter(cn => !toMove.includes(cn)),
              lrig_deck: [...(ctx.ownerState.lrig_deck ?? []), ...toMove],
            };
            return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(toMove[0])?.CardName ?? toMove[0]}をルリグデッキへ`));
          }
          return done(addLog(ctx, 'ルリグトラッシュにアーツなし'));
        }
        // 「このカードをセンタールリグの下に置く」→ sourceCardNumをlrig_deckの先頭（ルリグの下）へ
        if (effSOtxt.match(/このカードをあなたのセンタールリグの下に置く/) && srcSO) {
          // ルリグの下 = lrig_deck の末尾（先頭がトップ）に追加
          const lrig_deck = ctx.ownerState.lrig_deck ?? [];
          // 手札から取り除く
          const newHand = ctx.ownerState.hand.filter(cn => cn !== srcSO);
          const newOwner = { ...ctx.ownerState, hand: newHand, lrig_deck: [...lrig_deck, srcSO] };
          return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(srcSO)?.CardName ?? srcSO}をルリグデッキ（ルリグ下）へ`));
        }
        // 「ルリグデッキからN枚をルリグトラッシュに置く」
        const lrigDeckTrashM = effSOtxt.match(/ルリグデッキ(?:の上から)?([０-９\d]+)枚をルリグトラッシュに/);
        if (lrigDeckTrashM) {
          const count = parseInt(toHWSO(lrigDeckTrashM[1]));
          const lrig_deck = ctx.ownerState.lrig_deck ?? [];
          const toTrash = lrig_deck.slice(0, Math.min(count, lrig_deck.length));
          if (toTrash.length > 0) {
            const newOwner = {
              ...ctx.ownerState,
              lrig_deck: lrig_deck.slice(toTrash.length),
              lrig_trash: [...ctx.ownerState.lrig_trash, ...toTrash],
            };
            return done(addLog({ ...ctx, ownerState: newOwner }, `ルリグデッキ上${toTrash.length}枚をルリグトラッシュへ`));
          }
          return done(addLog(ctx, 'ルリグデッキなし'));
        }
        return done(addLog(ctx, 'ソウル操作'));
      }
      // デッキを見て並べ替え（STUB版：動的パース）
      if (stub.id === 'LOOK_AND_REORDER') {
        const srcLOR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtLOR = srcLOR ? (srcLOR.EffectText ?? '') + ' ' + (srcLOR.BurstText ?? '') : '';
        const toHWL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        // 「残りをデッキに加えてシャッフルする」→ lastProcessedCardsをデッキへシャッフル
        if ((txtLOR.match(/残りをデッキに加えてシャッフルする/) || txtLOR.match(/^残りをデッキに加えてシャッフルする$/)) && ctx.lastProcessedCards && ctx.lastProcessedCards.length > 0) {
          const cards = ctx.lastProcessedCards;
          const newDeck = shuffle([...ctx.ownerState.deck, ...cards]);
          const newS: PlayerState = { ...ctx.ownerState, deck: newDeck };
          return done(addLog({ ...ctx, ownerState: newS }, `残り${cards.length}枚をデッキに戻してシャッフル`));
        }
        // 「デッキ上からN枚見る」→ LOOK_AND_REORDER インタラクション
        const lookM = txtLOR.match(/デッキの上(?:から)?カードを?([０-９\d]+)枚(?:を?見る|確認する)/);
        if (lookM) {
          const count = parseInt(toHWL(lookM[1]));
          const visible = ctx.ownerState.deck.slice(0, Math.min(count, ctx.ownerState.deck.length));
          if (visible.length > 0) {
            const newS: PlayerState = { ...ctx.ownerState, deck: ctx.ownerState.deck.slice(visible.length) };
            return needsInteraction(
              addLog({ ...ctx, ownerState: newS }, `デッキ上${visible.length}枚を確認`),
              { type: 'LOOK_AND_REORDER', cards: visible, canTrash: false, destLocation: 'deck', destOwner: 'self', destPosition: 'top' },
            );
          }
        }
        return done(addLog(ctx, 'デッキを見て並べ替え（スキップ）'));
      }
      // デッキ上をライフクロスに加える
      if (stub.id === 'DECK_TOP_TO_LIFE') {
        const srcDTL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtDTL = srcDTL ? (srcDTL.EffectText ?? '') + ' ' + (srcDTL.BurstText ?? '') : '';
        const toHWD = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        // 枚数の解析（デフォルト1枚）
        const cntM = txtDTL.match(/デッキの一番上(?:から)?([０-９\d]+)枚のカードをライフクロスに/);
        const addCount = cntM ? parseInt(toHWD(cntM[1])) : 1;
        // 対象プレイヤーの判断
        const oppPattern = /対戦相手のデッキの一番上のカードをライフクロスに/;
        const owner = oppPattern.test(txtDTL) ? 'opponent' : 'self';
        const st = ownerState(owner, ctx);
        if (st.deck.length === 0) return done(addLog(ctx, 'デッキなし（ライフ追加）'));
        const toAdd = st.deck.slice(0, Math.min(addCount, st.deck.length));
        const newS: PlayerState = {
          ...st,
          deck: st.deck.slice(toAdd.length),
          life_cloth: [...toAdd, ...st.life_cloth],
        };
        return done(addLog(setOwnerState(owner, newS, ctx), `デッキ上${toAdd.length}枚をライフクロスに加えた`));
      }
      // カウント基準ドロー/パワー（lastProcessedCardsの枚数だけドロー or パワー修正）
      if (stub.id === 'COUNT_BASED_DRAW_OR_POWER') {
        const srcCBDP = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtCBDP = srcCBDP ? (srcCBDP.EffectText ?? '') + ' ' + (srcCBDP.BurstText ?? '') : '';
        const toHWCBDP = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const processed = ctx.lastProcessedCards ?? [];
        const count = processed.length;
        // 「捨てた枚数のカードを引く」パターン
        if (txtCBDP.match(/(?:捨てた|置かれた|ダウンした).*枚数.*(?:引く|カードを引)/)) {
          const bonusM = txtCBDP.match(/枚数に([０-９\d]+)を加えた枚数/);
          const bonus = bonusM ? parseInt(toHWCBDP(bonusM[1])) : 0;
          const drawCount = count + bonus;
          if (drawCount > 0) {
            const s = ctx.ownerState;
            const canDraw = Math.min(drawCount, s.deck.length);
            const newS: PlayerState = { ...s, hand: [...s.hand, ...s.deck.slice(0, canDraw)], deck: s.deck.slice(canDraw) };
            return done(addLog({ ...ctx, ownerState: newS }, `${drawCount}枚ドロー（処理${count}枚${bonus > 0 ? `+${bonus}` : ''}）`));
          }
          return done(addLog(ctx, 'ドロー0枚（カウントなし）'));
        }
        // 「捨てた枚数につきパワー±N」パターン
        const perM = txtCBDP.match(/(?:捨てた|置かれた).*枚数.*([＋－][０-９\d]+)/);
        if (perM) {
          const delta = parseInt(toHWCBDP(perM[1]).replace('＋', '+').replace('－', '-')) * count;
          if (delta !== 0) {
            const mods = [...(ctx.otherState.temp_power_mods ?? [])];
            for (let zi = 0; zi < 3; zi++) {
              const top = ctx.otherState.field.signi[zi]?.at(-1);
              if (top) mods.push({ cardNum: top, delta });
            }
            return done(addLog({ ...ctx, otherState: { ...ctx.otherState, temp_power_mods: mods } },
              `パワー${delta > 0 ? '+' : ''}${delta}（処理${count}枚）`));
          }
        }
        return done(addLog(ctx, `カウント基準効果（処理${count}枚）`));
      }
      // アーツ使用時にルリグデッキからアーツを任意でルリグトラッシュへ
      if (stub.id === 'ARTS_USE_DISCARD_LRIG_DECK') {
        const lrigDeck = ctx.ownerState.lrig_deck ?? [];
        const artsInDeck = lrigDeck.filter(cn => ctx.cardMap.get(cn)?.Type === 'アーツ');
        if (artsInDeck.length === 0) return done(addLog(ctx, 'ルリグデッキにアーツなし'));
        const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
        // 任意なのでスキップ選択肢も提供
        const options = [
          ...artsInDeck.slice(0, 3).map(cn => ({
            id: cn,
            label: `捨てる（${ctx.cardMap.get(cn)?.CardName ?? cn}）`,
            action: { type: 'STUB', id: 'INTERNAL_DISCARD_LRIG_DECK_ARTS', value: cn } as import('../types/effects').StubAction as EffectAction,
            available: true,
          })),
          { id: 'skip', label: 'スキップ', action: noopAction as EffectAction, available: true },
        ];
        const pending: PendingInteractionDef = { type: 'CHOOSE', options, count: 1 };
        return needsInteraction(addLog(ctx, 'ルリグデッキからアーツを捨てますか？'), pending);
      }
      // INTERNAL: ルリグデッキからアーツをルリグトラッシュへ（CHOOSEの続き）
      if (stub.id === 'INTERNAL_DISCARD_LRIG_DECK_ARTS') {
        const cnArt = String(stub.value ?? '');
        if (!cnArt) return done(addLog(ctx, 'INTERNAL_DISCARD_LRIG_DECK_ARTS: value なし'));
        const lrigDeck = ctx.ownerState.lrig_deck ?? [];
        const newDeck = lrigDeck.filter(cn => cn !== cnArt);
        const newOwner = { ...ctx.ownerState, lrig_deck: newDeck, lrig_trash: [...ctx.ownerState.lrig_trash, cnArt] };
        const artName = ctx.cardMap.get(cnArt)?.CardName ?? cnArt;
        return done(addLog({ ...ctx, ownerState: newOwner }, `${artName}をルリグトラッシュへ`));
      }
      // 手札のシグニにガードアイコンを付与（このターン）
      if (stub.id === 'GRANT_GUARD_ICON_HAND_SIGNI') {
        const newOwner = { ...ctx.ownerState, hand_signi_guard_enabled: true };
        return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン手札のシグニはガードに使える'));
      }
      // トラッシュからシグニをフィールドシグニの下に置く（ライズ補充）
      if (stub.id === 'TRASH_SIGNI_UNDER_FIELD_SIGNI') {
        const srcCardT = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtT = srcCardT ? (srcCardT.EffectText ?? '') + ' ' + (srcCardT.BurstText ?? '') : '';
        const toHWT = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const lvMT = txtT.match(/レベル([０-９\d]+)以下の/);
        const maxLvT = lvMT ? parseInt(toHWT(lvMT[1])) : 99;
        const trashSigniT = ctx.ownerState.trash.filter(cn => {
          const c = ctx.cardMap.get(cn);
          return c?.Type === 'シグニ' && parseInt(c.Level ?? '0') <= maxLvT;
        });
        if (trashSigniT.length === 0) return done(addLog(ctx, 'トラッシュにシグニなし（シグニ下配置スキップ）'));
        const placeUnderAction: import('../types/effects').PlaceUnderSourceSigniAction = {
          type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'trash',
        };
        return selectOrInteract(trashSigniT, 1, false, 'self_trash', placeUnderAction as EffectAction, undefined, ctx);
      }
      // ルリグリミット修正（エナフェイズ終了まで）
      if (stub.id === 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END') {
        const srcL = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtL = srcL ? (srcL.EffectText ?? '') + ' ' + (srcL.BurstText ?? '') : '';
        const toHWL = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const mL = txtL.match(/リミットを([＋+]?)([０-９\d]+)(?:にする|増やす|する)/);
        const mLMinus = txtL.match(/リミットを([－-])([０-９\d]+)/);
        let deltaL = 1;
        if (mLMinus) {
          deltaL = -parseInt(toHWL(mLMinus[2]));
        } else if (mL) {
          deltaL = parseInt(toHWL(mL[2]));
        } else {
          const mLPlus = txtL.match(/リミットを＋([０-９\d]+)/);
          if (mLPlus) deltaL = parseInt(toHWL(mLPlus[1]));
        }
        const newMod = (ctx.ownerState.lrig_limit_mod ?? 0) + deltaL;
        const newOwner = { ...ctx.ownerState, lrig_limit_mod: newMod };
        return done(addLog({ ...ctx, ownerState: newOwner }, `リミット${deltaL > 0 ? '+' : ''}${deltaL}（エナフェイズ終了まで）`));
      }
      // 捨てた枚数基準パワー修正
      if (stub.id === 'POWER_MOD_BY_DISCARD_COUNT_HIGH') {
        const count = (ctx.lastProcessedCards ?? []).length;
        if (count === 0) return done(addLog(ctx, 'パワー修正（捨てた0枚）'));
        const srcPH = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtPH = srcPH ? (srcPH.EffectText ?? '') + ' ' + (srcPH.BurstText ?? '') : '';
        const toHWPH = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const mPH = txtPH.match(/枚につき([－＋][０-９\d]+)/);
        const deltaPerCard = mPH ? parseInt(toHWPH(mPH[1]).replace('－', '-').replace('＋', '+')) : -3000;
        const totalDelta = deltaPerCard * count;
        const mods = [...(ctx.otherState.temp_power_mods ?? [])];
        for (let zi = 0; zi < 3; zi++) {
          const top = ctx.otherState.field.signi[zi]?.at(-1);
          if (top) mods.push({ cardNum: top, delta: totalDelta });
        }
        const newOther = { ...ctx.otherState, temp_power_mods: mods };
        return done(addLog({ ...ctx, otherState: newOther },
          `パワー${totalDelta}（${count}枚捨て×${deltaPerCard}）`));
      }
      // デッキ上2枚を見てクラスシグニをエナへ、残りをデッキ上へ
      if (stub.id === 'REVEAL_PICK_CLASS_TO_ENERGY') {
        const srcRPC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtRPC = srcRPC ? (srcRPC.EffectText ?? '') + ' ' + (srcRPC.BurstText ?? '') : '';
        const classMatchRPC = txtRPC.match(/[<＜]([^>＞]+)[>＞]のシグニ.*エナゾーンに置く/);
        const targetClassRPC = classMatchRPC?.[1];
        const viewedRPC = (ctx.lastProcessedCards ?? []).length > 0 ? ctx.lastProcessedCards! : ctx.ownerState.deck.slice(0, 2);
        if (viewedRPC.length === 0) return done(addLog(ctx, 'デッキなし（REVEAL_PICK_CLASS_TO_ENERGY）'));
        const toEnergyRPC = viewedRPC.filter(cn => {
          const c = ctx.cardMap.get(cn);
          return c?.Type === 'シグニ' && (!targetClassRPC || c.CardClass?.includes(targetClassRPC));
        });
        const toTopRPC = viewedRPC.filter(cn => !toEnergyRPC.includes(cn));
        let newDeckRPC = [...ctx.ownerState.deck];
        for (const cn of [...toEnergyRPC, ...toTopRPC]) {
          const idx = newDeckRPC.indexOf(cn); if (idx >= 0) newDeckRPC.splice(idx, 1);
        }
        newDeckRPC = [...toTopRPC, ...newDeckRPC];
        const newOwnerRPC = { ...ctx.ownerState, deck: newDeckRPC, energy: [...ctx.ownerState.energy, ...toEnergyRPC] };
        const enamesRPC = toEnergyRPC.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('・');
        return done(addLog({ ...ctx, ownerState: newOwnerRPC },
          `${enamesRPC || 'なし'}をエナゾーンへ、残り${toTopRPC.length}枚をデッキ上へ`));
      }
      // 手札のクラスシグニを好きな枚数公開（公開＝SELECT_TARGET、デッキに触れない）
      if (stub.id === 'REVEAL_CLASS_SIGNI_FROM_HAND') {
        const srcRev = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtRev = srcRev ? (srcRev.EffectText ?? '') + ' ' + (srcRev.BurstText ?? '') : '';
        const classMatchRev = txtRev.match(/手札から(?:それぞれ名前の異なる)?[<＜]([^>＞]+)[>＞]のシグニ/);
        const targetClassRev = classMatchRev?.[1];
        const handCands = ctx.ownerState.hand.filter(cn => {
          const c = ctx.cardMap.get(cn);
          if (c?.Type !== 'シグニ') return false;
          if (targetClassRev && !c.CardClass?.includes(targetClassRev)) return false;
          return true;
        });
        if (handCands.length === 0) return done(addLog(ctx, `手札に${targetClassRev ?? 'クラス'}シグニなし（公開スキップ）`));
        const noopAction: import('../types/effects').StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        return selectOrInteract(handCands, handCands.length, true, 'self_hand', noopAction as EffectAction, undefined, ctx);
      }
      // 自シグニを他の空きシグニゾーンに移動（してもよい）
      if (stub.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
        const srcMov = ctx.sourceCardNum;
        if (!srcMov) return done(addLog(ctx, 'ゾーン移動：ソースカードなし'));
        const currentZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcMov);
        if (currentZone < 0) return done(addLog(ctx, 'ゾーン移動：フィールドにいない'));
        const emptyZones = [0, 1, 2].filter(i =>
          i !== currentZone && (!ctx.ownerState.field.signi[i] || ctx.ownerState.field.signi[i]!.length === 0));
        if (emptyZones.length === 0) return done(addLog(ctx, 'ゾーン移動：空きゾーンなし'));
        const moveOptions = emptyZones.map(zi => ({
          id: `zone_${zi}`,
          label: `ゾーン${zi + 1}に移動`,
          action: ({ type: 'STUB', id: 'INTERNAL_MOVE_TO_ZONE', value: zi } as import('../types/effects').StubAction) as EffectAction,
          available: true,
        }));
        moveOptions.push({ id: 'skip', label: 'スキップ',
          action: ({ type: 'STUB', id: 'RULE_REMINDER_TEXT' } as import('../types/effects').StubAction) as EffectAction,
          available: true });
        const pendingMov: PendingInteractionDef = { type: 'CHOOSE', options: moveOptions, count: 1 };
        return needsInteraction(addLog(ctx, '他のシグニゾーンに移動してもよい'), pendingMov);
      }
      if (stub.id === 'INTERNAL_MOVE_TO_ZONE') {
        const srcZ = ctx.sourceCardNum;
        const targetZoneNum = typeof stub.value === 'number' ? stub.value : parseInt(String(stub.value ?? '0'));
        if (!srcZ) return done(addLog(ctx, 'ゾーン移動：ソースカードなし'));
        const curZone = ctx.ownerState.field.signi.findIndex(s => s?.at(-1) === srcZ);
        if (curZone < 0 || curZone === targetZoneNum) return done(addLog(ctx, 'ゾーン移動：ゾーン特定不可'));
        const newSigniMov = [...ctx.ownerState.field.signi] as (string[] | null)[];
        const movedStack = [...(newSigniMov[curZone] ?? [])];
        newSigniMov[curZone] = null;
        newSigniMov[targetZoneNum] = movedStack;
        const copyArr = <T>(arr: T[] | undefined, def: T): T[] =>
          arr ? [...arr] : [def, def, def];
        const newDown   = copyArr(ctx.ownerState.field.signi_down, false);
        const newFrozen = copyArr(ctx.ownerState.field.signi_frozen, false);
        const newCharms = copyArr(ctx.ownerState.field.signi_charms as (null | string)[], null);
        const newAcce   = copyArr(ctx.ownerState.field.signi_acce as (null | string)[], null);
        const newVirus  = copyArr(ctx.ownerState.field.signi_virus, 0);
        [newDown[targetZoneNum], newFrozen[targetZoneNum], newCharms[targetZoneNum], newAcce[targetZoneNum], newVirus[targetZoneNum]] =
          [newDown[curZone], newFrozen[curZone], newCharms[curZone], newAcce[curZone], newVirus[curZone]];
        newDown[curZone] = false; newFrozen[curZone] = false;
        newCharms[curZone] = null; newAcce[curZone] = null; newVirus[curZone] = 0;
        const newFieldMov = {
          ...ctx.ownerState.field, signi: newSigniMov,
          signi_down: newDown as boolean[], signi_frozen: newFrozen as boolean[],
          signi_charms: newCharms, signi_acce: newAcce, signi_virus: newVirus,
        };
        return done(addLog({ ...ctx, ownerState: { ...ctx.ownerState, field: newFieldMov } },
          `${ctx.cardMap.get(srcZ)?.CardName ?? srcZ}をゾーン${curZone + 1}→ゾーン${targetZoneNum + 1}に移動`));
      }
      // 公開したカード枚数基準パワー修正
      if (stub.id === 'POWER_MOD_PER_REVEALED') {
        const revCount = (ctx.lastProcessedCards ?? []).length;
        if (revCount === 0) return done(addLog(ctx, 'パワー修正：公開0枚'));
        const srcPR = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtPR = srcPR ? (srcPR.EffectText ?? '') + ' ' + (srcPR.BurstText ?? '') : '';
        const toHWPR = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const mPR = txtPR.match(/枚につき([＋+][０-９\d]+)/);
        const deltaPerCard = mPR ? parseInt(toHWPR(mPR[1]).replace('＋', '+').replace('+', '+')) : 1000;
        const totalDelta = deltaPerCard * revCount;
        const targetCnPR = ctx.sourceCardNum && ctx.ownerState.field.signi.some(s => s?.at(-1) === ctx.sourceCardNum)
          ? ctx.sourceCardNum
          : ctx.ownerState.field.signi.find(s => s && s.length > 0)?.at(-1);
        if (!targetCnPR) return done(addLog(ctx, `パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（フィールドなし）`));
        const mods = [...(ctx.ownerState.temp_power_mods ?? []), { cardNum: targetCnPR, delta: totalDelta }];
        const newOwner = { ...ctx.ownerState, temp_power_mods: mods };
        return done(addLog({ ...ctx, ownerState: newOwner },
          `${ctx.cardMap.get(targetCnPR)?.CardName ?? targetCnPR}パワー${totalDelta > 0 ? '+' : ''}${totalDelta}（${revCount}枚公開）`));
      }
      // このターン相手はガードできない（ガードコスト無色版 or ガード禁止）
      if (stub.id === 'OPP_GUARD_COST_COLORLESS' || stub.id === 'PREVENT_OPP_GUARD_THIS_TURN') {
        const newOwner = { ...ctx.ownerState, prevent_opp_guard: true };
        return done(addLog({ ...ctx, ownerState: newOwner }, 'このターン対戦相手はガードできない'));
      }
      // キー１枚を任意でルリグトラッシュに置く（追加効果条件）
      if (stub.id === 'TRASH_OWN_KEY_OPTIONAL') {
        const keyPiece = ctx.ownerState.field.key_piece;
        if (!keyPiece) return done(addLog(ctx, 'キーなし（追加効果スキップ）'));
        const keyName = ctx.cardMap.get(keyPiece)?.CardName ?? keyPiece;
        const trashKeyStub: import('../types/effects').StubAction = { type: 'STUB', id: 'INTERNAL_TRASH_OWN_KEY' };
        const skipStub: import('../types/effects').StubAction = { type: 'STUB', id: 'RULE_REMINDER_TEXT' };
        const pendingKey: PendingInteractionDef = {
          type: 'CHOOSE',
          options: [
            { id: 'do', label: `${keyName}をルリグトラッシュへ（追加効果）`, action: trashKeyStub as EffectAction, available: true },
            { id: 'skip', label: 'スキップ', action: skipStub as EffectAction, available: true },
          ],
          count: 1,
        };
        return needsInteraction(addLog(ctx, `キー「${keyName}」をルリグトラッシュに置いてもよい`), pendingKey);
      }
      if (stub.id === 'INTERNAL_TRASH_OWN_KEY') {
        const key = ctx.ownerState.field.key_piece;
        if (!key) return done(addLog(ctx, 'キーなし'));
        const newField = { ...ctx.ownerState.field, key_piece: null };
        const newOwner = {
          ...ctx.ownerState, field: newField,
          lrig_trash: [...ctx.ownerState.lrig_trash, key],
        };
        return done(addLog({ ...ctx, ownerState: newOwner }, `${ctx.cardMap.get(key)?.CardName ?? key}をルリグトラッシュへ`));
      }
      // 手札からクラスシグニを任意枚数捨てる
      if (stub.id === 'OPTIONAL_DISCARD_CLASS_SIGNI') {
        const srcODC = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtODC = srcODC ? (srcODC.EffectText ?? '') + ' ' + (srcODC.BurstText ?? '') : '';
        const toHWODC = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const classMatchODC = txtODC.match(/手札から[<＜]([^>＞]+)[>＞]のシグニ/);
        const targetClassODC = classMatchODC?.[1];
        const maxMODC = txtODC.match(/シグニ([０-９\d]+)枚まで/);
        const maxODC = maxMODC ? parseInt(toHWODC(maxMODC[1])) : 1;
        const handCands = ctx.ownerState.hand.filter(cn => {
          const c = ctx.cardMap.get(cn);
          if (c?.Type !== 'シグニ') return false;
          if (targetClassODC && !c.CardClass?.includes(targetClassODC)) return false;
          return true;
        });
        if (handCands.length === 0) return done(addLog(ctx, `手札に${targetClassODC ?? 'クラス'}シグニなし（任意捨てスキップ）`));
        const discardAction: EffectAction = { type: 'MOVE_CARD', from: 'hand', to: 'trash', owner: 'self' } as EffectAction;
        return selectOrInteract(handCands, maxODC, true, 'self_hand', discardAction, undefined, ctx);
      }
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
        const placeAction: import('../types/effects').PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
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
        const lvMHCU = txtHCU.match(/レベル([０-９\d]+)以上のシグニ/);
        const minLvHCU = lvMHCU ? parseInt(toHWHCU(lvMHCU[1])) : 0;
        const handCandsHCU = ctx.ownerState.hand.filter(cn => {
          const c = ctx.cardMap.get(cn);
          if (!c) return false;
          const lv = parseInt(c.Level ?? '0');
          return (!minLvHCU || lv >= minLvHCU);
        });
        if (handCandsHCU.length === 0) return done(addLog(ctx, '手札なし（シグニ下配置スキップ）'));
        const placeActionHCU: import('../types/effects').PlaceUnderSourceSigniAction = { type: 'PLACE_UNDER_SOURCE_SIGNI', fromLocation: 'hand' };
        return selectOrInteract(handCandsHCU, maxHCU, optHCU, 'self_hand', placeActionHCU as EffectAction, undefined, ctx);
      }
      // シグニの下のカードをエナゾーンに置く
      if (stub.id === 'UNDER_SIGNI_TO_ENERGY') {
        const underCardsUTE: string[] = [];
        for (let zi = 0; zi < 3; zi++) {
          const stack = ctx.ownerState.field.signi[zi];
          if (stack && stack.length > 1) underCardsUTE.push(...stack.slice(0, -1));
        }
        if (underCardsUTE.length === 0) return done(addLog(ctx, 'シグニの下にカードなし'));
        const srcUTE = ctx.sourceCardNum ? ctx.cardMap.get(ctx.sourceCardNum) : undefined;
        const txtUTE = srcUTE ? (srcUTE.EffectText ?? '') + ' ' + (srcUTE.BurstText ?? '') : '';
        const toHWUTE = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));
        const maxMUTE = txtUTE.match(/カード([０-９\d]+)枚/);
        const maxUTE = maxMUTE ? parseInt(toHWUTE(maxMUTE[1])) : 1;
        const toEnergyAction: EffectAction = { type: 'MOVE_CARD', from: 'hand', to: 'energy', owner: 'self' } as EffectAction;
        return selectOrInteract(underCardsUTE, maxUTE, false, 'self_hand', toEnergyAction, undefined, ctx);
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
        const newDeck2 = ctx.ownerState.deck.slice(1);
        const newOwner2 = { ...ctx.ownerState, deck: [...newDeck2, topCard] };
        return done(addLog({ ...ctx, ownerState: newOwner2 },
          `デッキトップ公開：${name}（Lv${lv}）→不一致、デッキ下へ`));
      }
      // 全STUBIDに対するログマップ（実装待ち）
      {
        const STUB_LOG: Record<string, string> = {
          // ソウル/ルリグデッキ下操作（汎用フォールバック）
          SOUL_OP: 'ソウル操作',
          // トラップ系
          TRAP_OPERATION: 'トラップ操作', TRAP_OP: 'トラップ操作',
          PLACE_TRAP_FROM_REVEALED: 'トラップ設置（公開から）', PLACE_TRAP_OPTIONAL: 'トラップ任意設置',
          ACTIVATE_TRAP: 'トラップ発動', TRAP_TO_HAND: 'トラップを手札に',
          SET_OPP_SIGNI_AS_TRAP: '相手シグニをトラップに', SET_HAND_CARD_AS_TRAP: '手札カードをトラップに',
          TRAP_TO_SIGNI_IF_ZONE_EMPTY: 'トラップ→シグニゾーン',
          // シード系
          SEED_BLOOM: 'シードブルーム', SEED_BLOOM_OPTIONAL: 'シードブルーム（任意）',
          PLACE_SEED_FROM_REVEALED: 'シード設置（公開から）', SEED_FLOWER_OP: 'シードフラワー操作',
          SEED_HAND_AND_BLOOM_FROM_DECK_TOP: 'シード手札+ブルーム',
          // 公開/ピック系
          REVEAL_CLASS_SIGNI_FROM_HAND: '手札のクラスシグニを公開',
          HAND_REVEAL_CLASS_SIGNI: '手札のクラスシグニを公開',
          OPTIONAL_HAND_REVEAL_NAMED: '手札カードを任意公開',
          GRID_REVEAL_PLUS: 'グリッド公開', FIELD_COND_DRAW_REVEAL: 'フィールド条件公開ドロー',
          MAGIC_BOX_REVEAL: 'マジックボックス公開', REVEAL: '公開',
          LOOK_AND_REORDER: 'デッキを見て並べ替え（スキップ）',
          // アクセ系
          ACCE_FROM_HAND: '手札からアクセ', ACCE_OP: 'アクセ操作', ACCE_FROM_TRASH: 'トラッシュからアクセ',
          ACCE_BANISH_SELF_TRASH: 'アクセをバニッシュ→トラッシュ', ACCE_SIGNI_GRANT_ABILITY: 'アクセシグニに能力付与',
          ACCE_SIGNI_ALL_COLOR: 'アクセシグニ全色', ACCE_TO_ENERGY: 'アクセをエナゾーンに',
          ACCE_COST_REDUCTION: 'アクセコスト軽減', NAMED_SIGNI_ACCE_FROM_TRASH: '指名シグニをトラッシュからアクセ',
          MOVE_ACCE_TO_SIGNI: 'アクセをシグニに移動', MULTI_ACCE_LIMIT: 'マルチアクセ制限',
          MULTI_ACCE_FROM_HAND: '手札からマルチアクセ', PLACE_ACCE_SIGNI_TO_ENERGY: 'アクセシグニをエナゾーンに',
          TRASH_ACCE_AT_TURN_END: 'ターン終了時アクセをトラッシュ',
          // シグニ配置替え・裏向き
          SIGNI_REPOSITION: 'シグニ配置替え', SIGNI_FLIP_FACEDOWN: 'シグニを裏向きにする',
          FLIP_FACE_DOWN_SIGNI: 'シグニを裏向きにする', FACE_DOWN_OPP_SIGNI: '相手シグニを裏向きにする',
          // ゾーン/リミット系
          DESIGNATE_SIGNI_ZONE: 'シグニゾーン指定', REMOVE_SIGNI_ZONE: 'シグニゾーン削除',
          BLOCK_OPP_ZONE_PLACEMENT: '相手のゾーン配置ブロック',
          LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END: 'エナフェイズ終了まで制限変更',
          PLACE_LIMIT_UPPER: 'リミット上限設置', LRIG_LIMIT_MODIFY: 'ルリグリミット変更',
          // アーツ使用条件
          ARTS_USE_DISCARD_LRIG_DECK: 'アーツ使用時ルリグデッキ捨て',
          ARTS_IMMOVABLE: 'アーツ移動不可', ARTS_USE_DISCARD_COLOR_HAND: 'アーツ使用時色手札捨て',
          ARTS_EXTRA_COST_CONDITION: 'アーツ追加コスト条件',
          // コスト不要プレイ
          PLAY_FREE: 'コストなしプレイ（スキップ）',
          PLAY_SPELL_FREE_IGNORE_RESTRICTION: 'スペル無制限プレイ（スキップ）',
          CAST_FROM_OPP_TRASH: '相手トラッシュからスペル（スキップ）',
          PLAY_SPELL_FROM_HAND: '手札からスペル使用', PLAY_SPELL_FROM_HAND_FREE: '手札からスペル無料使用',
          USE_SPELL_FROM_TRASH: 'トラッシュからスペル使用', PLAY_EFFECT_TARGET_CLASS_CHANGE: 'プレイ効果クラス変更',
          // パワー修正系
          POWER_MOD_PER_REVEALED: 'パワー修正（公開枚数）', POWER_MOD_BY_DISCARD_COUNT_HIGH: 'パワー修正（捨てた枚数高）',
          POWER_MOD_PER_REVEALED_LEVEL: 'パワー修正（公開レベル）', POWER_MOD_MIRROR: 'パワーをミラー修正',
          POWER_MOD_DISTRIBUTE: 'パワー分配修正', POWER_MOD_BY_ATTACKER_LEVEL: 'パワー修正（アタッカーレベル）',
          POWER_MOD_BY_FIELD_CLASS_LEVEL: 'パワー修正（フィールドクラスレベル）',
          POWER_MOD_DOUBLE_DIFF: 'パワー差分2倍', POWER_MOD_TARGET_AND_SELF: 'パワー対象+自己修正',
          POWER_MOD_ON_FRONT_PLACE: 'パワー修正（前配置時）', POWER_MOD_BY_LRIG_LEVEL_SUM: 'パワー修正（ルリグレベル合計）',
          POWER_MOD_BY_LRIG_LEVEL: 'パワー修正（ルリグレベル）', POWER_MOD_BY_UNDER_COUNT: 'パワー修正（下枚数）',
          POWER_MOD_BY_TRASHED_SIGNI_LEVEL: 'パワー修正（トラッシュシグニレベル）',
          POWER_MOD_BY_TRASH_CLASS_COUNT: 'パワー修正（トラッシュクラス数）',
          POWER_MOD_BY_LRIG_TRASH_ARTS: 'パワー修正（ルリグトラッシュアーツ）',
          POWER_MOD_BY_COLOR_VARIETY: 'パワー修正（色の種類）', POWER_MOD_BY_FRONT_LEVEL: 'パワー修正（前シグニレベル）',
          POWER_BY_ACCE_COUNT: 'パワー（アクセ数）', POWER_BY_RISE_SIGNI_COUNT: 'パワー（ライズシグニ数）',
          POWER_BY_CHARM_COUNT: 'パワー（チャーム数）', POWER_BY_ENERGY_COLOR_VARIETY: 'パワー（エナ色種類）',
          POWER_BY_LEVEL_SUM_COMPARE: 'パワー（レベル合計比較）',
          POWER_BY_CENTER_LRIG_TYPE_COUNT: 'パワー（センタールリグタイプ数）',
          POWER_DOUBLE_ALL: '全パワー倍', POWER_CAP: 'パワー上限', POWER_COPY_FROM_DOWNED: 'ダウンシグニからパワーコピー',
          POWER_UP_BY_DISCARDED_SIGNI_POWER: '捨てたシグニのパワーだけアップ',
          POWER_BOOST_PER_SIGNI_WITH_ICON: 'アイコン持ちシグニ1体につきパワー増',
          POWER_DOWN_BY_ZONE_CARD_COUNT: 'ゾーンカード数でパワーダウン',
          POWER_EQUAL_TO_SELF_POWER: '自パワーに等しく設定', POWER_EQUALS_FRONT_SIGNI: '前シグニのパワーに等しく',
          ALL_OPP_SIGNI_POWER_DOWN_HALF: '全相手シグニのパワー半減',
          MULTI_SIGNI_POWER_UP_5000: '複数シグニパワー+5000',
          CONDITIONAL_ALT_POWER_BOOST: '条件付き代替パワー増',
          CHARM_CONDITIONAL_POWER: 'チャーム条件パワー', REACTIVE_POWER_UP: 'リアクティブパワーアップ',
          DOUBLE_OWN_POWER_MINUS: '自パワーマイナス2倍',
          OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL: '相手シグニパワー（トラッシュレベル分）ダウン',
          OPP_SIGNI_ATTACK_POWER_RESTRICT: '相手シグニアタック時パワー制限',
          SHUFFLE_DECK_POWER_HALF: 'シャッフル時パワー半減', SET_OPP_SIGNI_POWER_BY_SELF_POWER: '相手シグニを自パワーに設定',
          COPY_TARGET_POWER: '対象のパワーをコピー', INFECTED_SIGNI_POWER_DOWN_BY_LEVEL: 'ウイルスシグニレベル分パワーダウン',
          LEVEL_MOD_PER_COUNT: 'レベル修正（カウント）', SET_LEVEL_RANGE: 'レベル範囲設定',
          TRASH_FROM_DECK_PER_SIGNI_LEVEL: 'シグニレベル枚数デッキトラッシュ',
          COUNT_BASED_DRAW_OR_POWER: 'カウント基準ドロー/パワー',
          // ダメージ/バースト抑制
          SUPPRESS_LIFE_BURST_ON_CRASH: 'クラッシュ時ライフバースト抑制',
          SUPPRESS_LIFE_BURST_ON_CARD: 'カードのライフバースト抑制',
          SUPPRESS_LIFEBURST_COLOR_CONDITION: 'ライフバースト色条件抑制',
          PREVENT_LRIG_DAMAGE_THIS_TURN: 'このターンルリグダメージ無効',
          PREVENT_LRIG_DAMAGE: 'ルリグダメージ無効', PREVENT_DAMAGE_UNTIL_OPP_TURN_END: '相手ターン終了までダメージ無効',
          PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN: '次のターンまでルリグダメージ無効',
          PREVENT_LOW_LEVEL_LRIG_DAMAGE: '低レベルルリグダメージ無効',
          PREVENT_DAMAGE_FROM_OPP_EFFECTS: '相手効果ダメージ無効',
          PREVENT_DEFEAT_THIS_TURN: 'このターン敗北無効', PREVENT_DEFEAT_UNTIL_NEXT_TURN: '次のターンまで敗北無効',
          PREVENT_DEFEAT: '敗北無効', PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: '相手次ターン最初のダメージ無効',
          PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: '相手によるダメージ/ライフ移動無効',
          // 保護/移動防止系
          PREVENT_ZONE_MOVE_BY_OPP: '相手によるゾーン移動防止',
          PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH: 'バニッシュ以外の相手シグニ移動防止',
          PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH: 'バニッシュ以外の相手による自分移動防止',
          PREVENT_NON_FIELD_MOVE_BY_OPP: '相手によるフィールド外移動防止',
          PREVENT_BOUNCE_AND_DOWN_BY_OPP: '相手によるバウンス/ダウン防止',
          PREVENT_OPP_SIGNI_ABILITY_GAIN: '相手シグニの能力獲得防止',
          PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: '相手によるシグニ能力喪失防止',
          PREVENT_POWER_MINUS_BY_OPP: '相手によるパワーマイナス防止',
          PREVENT_OPP_POWER_PLUS: '相手のパワープラス防止',
          PREVENT_ABILITY_CHANGE_BY_OPP: '相手による能力変更防止',
          PREVENT_SIGNI_DOWN_BY_OPP_ALL: '全シグニの相手によるダウン防止',
          PREVENT_SELF_DOWN_BY_OPP: '自分の相手によるダウン防止',
          PREVENT_INFECTED_SIGNI_ACTIVATE: 'ウイルスシグニ発動防止',
          PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: '相手アタックフェイズまでアタック防止',
          PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: 'このターン対象ルリグアタック防止',
          SIGNI_CANT_BOUNCE_FROM_FIELD: 'シグニをフィールドからバウンスできない',
          SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: 'エナゾーン以外移動防止',
          BLOCK_OPP_ENCORE_AND_BET: '相手のアンコール/ベット封じ',
          PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: '全シグニの相手パワーマイナス防止',
          PREVENT_OWN_ARTS_USE: '自分のアーツ使用封じ',
          // 選択/分岐系
          CHOOSE_N_FROM_LIST: 'リストからN個選択（スキップ）',
          CHOOSE_COLOR_FROM_LIST: 'リストから色選択（スキップ）',
          CHOOSE_HAND_CARD: '手札から選択（スキップ）',
          CHOOSE_HAND_OR_ENERGY: '手札かエナから選択（スキップ）',
          CHOSEN_TO_ENERGY_OR_HAND: '選択→エナか手札（スキップ）',
          CHOOSE_SAME_OPTION_TWICE: '同じ選択を2回（スキップ）',
          CHOOSE_SAME_OPTION_MULTIPLE: '同じ選択を複数回（スキップ）',
          DO_THREE_THINGS: '3つの処理（スキップ）',
          DOWN_UP_SIGNI_AND_CHOOSE: 'シグニダウン/アップ+選択（スキップ）',
          CONDITIONAL_MULTI_CHOOSE_BY_CENTER: 'センタールリグによる複数選択（スキップ）',
          OPP_DECLARE_CHOICE: '相手宣言選択（スキップ）',
          OPP_CHOOSE_YOUR_HAND_DISCARD: '相手があなたの手札を選んで捨てる（スキップ）',
          OPP_CHOOSE_OWN_SIGNI_TO_ENERGY: '相手が自分のシグニをエナに（スキップ）',
          OPP_CHOOSE_EFFECT: '相手が効果を選ぶ（スキップ）',
          OPP_CHOOSES_FOR_YOU: '相手があなたのために選ぶ（スキップ）',
          // ウイルス系
          REMOVE_VIRUS: 'ウイルス除去', EXTRA_COST_REMOVE_VIRUS: 'コスト支払いウイルス除去',
          PLACE_VIRUS_CENTER: 'センターにウイルス設置', SELF_TRASH_IF_NO_OPP_VIRUS: '相手ウイルスなし→自トラッシュ',
          // グロウ特殊系
          GROW_COST_ZERO: 'グロウコスト0',
          CONDITIONAL_FREE_GROW: '条件付き無料グロウ',
          GROW_COST_SUBSTITUTE_TRASH_SIGNI: 'グロウコスト→シグニトラッシュ代替',
          // コスト軽減
          CONDITIONAL_COST_REDUCTION_BY_FIELD: 'フィールド条件コスト軽減',
          CONDITIONAL_CARD_COST_BY_OPP_LRIG: '相手ルリグ条件カードコスト',
          SPELL_COST_REDUCTION_BY_TRASH_COUNT: 'トラッシュ数スペルコスト軽減',
          SPECIFIC_CARD_COST_REDUCE: '特定カードコスト軽減',
          ARTS_COST_REDUCTION_BY_COST_THRESHOLD: 'コスト閾値アーツコスト軽減',
          REDUCE_PLAY_ABILITY_COST: 'プレイ能力コスト軽減',
          // ガード系
          GRANT_GUARD_ICON_HAND_SIGNI: 'ガードアイコン付与（手札シグニ）',
          OPP_GUARD_COST_COLORLESS: '相手ガードコスト（無色）',
          GUARD_ALTERNATIVE_COST: 'ガード代替コスト',
          EXTRA_GUARD_COST_FROM_HAND: '追加ガードコスト（手札から）',
          HAND_SIGNI_HAS_GUARD_ICON: '手札シグニにガードアイコン',
          OPTIONAL_TRADE_GUARD_SIGNI: 'トレードガードシグニ（任意）',
          // 能力付与系
          GRANT_CHOSEN_ABILITY: '選んだ能力付与', GRANT_CHOSEN_ABILITY_FROM_PLAY: 'プレイ時選んだ能力付与',
          GRANT_CHOSEN_ABILITY_SELF: '自分に選んだ能力付与',
          GRANT_LRIG_ABILITY: 'ルリグに能力付与', GRANT_LRIG_TRASH_ACTIVATE_ABILITY: 'ルリグトラッシュ起動能力付与',
          GRANT_UNDER_LRIG_ACTIVATE_ABILITY: 'ルリグ下の起動能力付与',
          GRANT_UNDER_LRIG_AUTO_ABILITY: 'ルリグ下の自動能力付与',
          GRANT_UNDER_SIGNI_ALL_ABILITIES: 'シグニ下に全能力付与',
          GRANT_UNDER_SIGNI_CONSTANT_ABILITY: 'シグニ下に常在能力付与',
          GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE: 'アタックフェイズシグニ下自動能力付与',
          GRANT_ABILITY_UNTIL_OPP_TURN: '相手ターンまで能力付与',
          GRANT_CONDITIONAL_ASSASSIN_ABILITY: '条件付きアサシン付与',
          GRANT_SIGNI_CLASS: 'シグニにクラス付与',
          LAYER_ABILITY_COPY: 'レイヤー能力コピー', COPY_ABILITY: '能力コピー',
          RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: 'ライズ対象シグニ常在能力獲得',
          SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: 'シグニ引用常在能力付与',
          SIGNI_GRANT_CHOSEN_ABILITY: 'シグニ選んだ能力付与',
          GRANT_LRIG_TYPE_GAME_WIDE: 'ゲーム全体ルリグタイプ付与',
          // ライズ/スタック系
          RIDE_ON: 'ライドオン', RISE_BANISH_SUBSTITUTE: 'ライズバニッシュ代替',
          RISE_LEAVE_DISCARD_STACK: 'ライズ退場捨てスタック',
          BANISH_SUBSTITUTE_RISE_STACK: 'バニッシュ代替ライズスタック',
          RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE: 'レゾナ退場自トラッシュ代替',
          COOKING_BANISH_SUBSTITUTE: '料理バニッシュ代替',
          BLACK_RISE_PLAY_STACK_FROM_TRASH: '黒ライズトラッシュからスタック',
          // エネルギー代替/変換系
          ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白: 'エナ赤/青→白代替',
          ENERGY_COLOR_SUBSTITUTE_TRASH: 'エナ→トラッシュ色代替',
          ENERGY_SUBSTITUTE_TRASH_SIGNI: 'エナ→シグニトラッシュ代替',
          ENERGY_SUBSTITUTE_TRASH_KEY: 'エナ→キートラッシュ代替',
          ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI: 'エナ白→シグニトラッシュ代替',
          ENERGY_BY_LEVEL_SUM_LIMIT: 'エナレベル合計制限',
          ENERGY_LEVEL_CONDITION_CHOOSE: 'エナレベル条件選択',
          ENERGY_TO_TRASH: 'エナをトラッシュに', ENERGY_TO_HAND_ON_DECK: 'エナを手札（デッキ経由）',
          OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL: '相手エナオーバーフロートラッシュ',
          OPP_ENERGY_EXCESS_TRASH: '相手エナ超過トラッシュ',
          OPP_ENERGY_OR_DISCARD_CONDITION: '相手エナか捨て条件',
          OPP_ENERGY_COLOR_CONDITION_TRASH: '相手エナ色条件トラッシュ',
          RESONANCE_COST_CARDS_TO_ENERGY: 'レゾナコストカードをエナに',
          HAND_NONCOLORLESS_TO_ENERGY: '手札無色以外をエナに',
          HAND_TO_ENERGY_OPTIONAL: '手札を任意エナに',
          FIELD_ENERGY_SIGNI_GAIN_COLOR: 'フィールドエナシグニが色獲得',
          CLASS_SIGNI_TO_ENERGY: 'クラスシグニをエナに',
          // カード属性変更
          COPY_SIGNI: 'シグニをコピー', COPY_CARD: 'カードをコピー',
          CLASS_CHANGE: 'クラス変更',
          CHANGE_SIGNI_COLOR: 'シグニの色変更', CHANGE_BASE_LEVEL: '基本レベル変更',
          CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN: '次ターンまで基本レベル変更',
          DECK_SIGNI_LEVEL_OVERRIDE: 'デッキシグニレベル上書き',
          DYNAMIC_LEVEL_BY_ENERGY: 'エナによる動的レベル', LEVEL_REFERENCE_OVERRIDE: 'レベル参照上書き',
          LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: '自効果によるレベル参照上書き',
          ALL_CLASS: '全クラス', ALL_COLOR: '全色', ALL_ZONE_BLACK: '全ゾーン黒',
          ALL_CARDS_COLOR_CHANGE_BLACK: '全カードを黒に',
          ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: '全センタールリグタイプ獲得',
          CENTER_LRIG_COLOR_CHANGE_BLACK: 'センタールリグを黒に',
          SIGNI_LOSE_COLOR: 'シグニの色喪失', SIGNI_GAIN_ONE_LRIG_COLOR: 'シグニがルリグ色1つ獲得',
          LOSE_COLOR_ALL_ZONES: '全ゾーンで色喪失',
          INHERIT_OPP_LRIG_TYPE: '相手ルリグタイプを引き継ぐ',
          INHERIT_UNDER_SIGNI_COLOR: 'シグニ下の色を引き継ぐ',
          // ルリグデッキ操作
          CRAFT_TO_LRIG_DECK: 'クラフトをルリグデッキに',
          ADD_CRAFT_TO_LRIG_DECK: 'クラフトをルリグデッキに追加',
          ADD_CARD_TO_LRIG_DECK: 'カードをルリグデッキに追加',
          ADD_CARD_TO_LRIG_DECK_HIDDEN: 'カードを裏向きでルリグデッキに追加',
          PLACE_LRIG_FROM_DECK_ON_TOP: 'デッキからルリグを上に',
          STACK_ALL_LRIG_UNDER: '全ルリグを下に積む',
          LRIG_TRASH_KEY_TO_CENTER_UNDER: 'ルリグトラッシュキーをセンター下に',
          FROM_TRASH_TO_CENTER_ZONE: 'トラッシュからセンターゾーンに',
          NON_LRIG_TO_LRIG_TRASH: '非ルリグをルリグトラッシュに',
          LRIG_RIDE_SIGNI: 'ルリグがシグニに乗る',
          CENTER_LRIG_RIDES_ON_SIGNI: 'センタールリグがシグニに乗る',
          CENTER_LRIG_DISMOUNT: 'センタールリグが降りる',
          LRIG_GAIN_ABILITY: 'ルリグが能力獲得', LRIG_LIMIT_UP_AND_COLOR_GAIN: 'ルリグリミットアップ+色獲得',
          LRIG_ALL_NAMES: 'ルリグが全名称を持つ',
          GAIN_ADDITIONAL_LRIG_TYPE: '追加ルリグタイプ獲得', GAIN_LRIG_COLOR: 'ルリグ色獲得',
          // 手札/ライフ操作
          HAND_SIZE_INCREASE: '手札制限増加', REDUCE_OPP_HAND_LIMIT: '相手手札制限減少',
          LIMIT_OPP_DRAW_COUNT: '相手ドロー数制限',
          DRAW_DISCARD_COUNT_PLUS_N: 'ドロー捨て数+N',
          VIEW_AND_DISCARD_SPELL: 'スペルを見て捨てる',
          LOOK_OPP_HAND_DISCARD_SIGNI: '相手の手札を見てシグニ捨て',
          PEEP_HAND: '手札をのぞき見', REVEAL_OPP_HAND_CARD: '相手の手札のカード公開',
          OPP_REVEAL_HAND_AND_LRIG_DECK: '相手の手札+ルリグデッキ公開',
          OPP_REVEAL_LRIG_DECK: '相手のルリグデッキ公開',
          OPP_REVEAL_TOP_AND_HAND: '相手のトップ+手札公開',
          EACH_PLAYER_DRAW_DISCARD: '両者ドロー捨て',
          DRAW_AND_PUT_HAND_TO_DECK_BOTTOM: 'ドローして手札をデッキ下に',
          DRAW_BY_CHARM_COUNT: 'チャーム数ドロー',
          LIFE_BURST_DOUBLE: 'ライフバースト2倍', TRIGGER_LIFE_BURST: 'ライフバースト発動',
          BATTLE_BANISH_LIFE_BURST: 'バトルバニッシュライフバースト',
          LIFE_TO_HAND_OPTIONAL: 'ライフを任意手札に', DRAW: 'ドロー',
          // デッキ操作
          DECK_TOP_TO_LIFE: 'デッキ上をライフに',
          DECK_TOP_CHECK_LEVEL_HAND: 'デッキ上レベル確認→手札',
          DECK_TOP_CHECK_LEVEL_ENERGY: 'デッキ上レベル確認→エナ',
          DECK_TOP_DECLARED_NUM_TRASH: 'デッキ上宣言数トラッシュ',
          TOP_TO_BOTTOM_OPTIONAL: '任意でトップをボトムに',
          LOOK_TOP_N: 'デッキ上N枚を見る', LOOK_TOP_SORT: 'デッキ上を見て並べ替え',
          LOOK_TOP_BY_LIFE_COUNT: 'ライフ数枚デッキ上を見る',
          LOOK_TOP_COLOR_SORT: 'デッキ上を色別に並べ替え',
          LOOK_TOP_BOTTOM: 'デッキ上と下を見る',
          LOOK_TOP_SIGNI_TO_FIELD: 'デッキ上のシグニをフィールドに',
          LOOK_TOP_ONE_RETURN_REST_BOTTOM: 'デッキ上1枚を見て残りをボトムに',
          LOOK_TOP_SPELLS_TO_HAND: 'デッキ上スペルを手札に',
          LOOK_TOP_OPP_CHOOSE_TRASH: 'デッキ上を相手が選んでトラッシュ',
          LOOK_DECK_BOTTOM: 'デッキ下を見る', DECK_MILL_UNTIL_CLASS: 'クラスが出るまでデッキ削り',
          REVEALED_SIGNI_TO_FIELD_REST_TRASH: '公開シグニをフィールドに残りトラッシュ',
          REVEALED_CARD_COLOR_DISCARD: '公開カードの色を捨てる',
          // シグニ下/ビートゾーン
          BEAT_ZONE_OP: 'ビートゾーン操作', TRASH_SIGNI_TO_BEAT: 'シグニをビートにトラッシュ',
          TRASH_SIGNI_UNDER_FIELD_SIGNI: 'フィールドシグニ下をトラッシュ',
          TRASH_OWN_KEY_OPTIONAL: 'キーを任意トラッシュ',
          PLACE_SIGNI_UNDER_SELF_OPT: '自分の下に任意シグニ設置',
          PLACE_SIGNI_UNDER_SIGNI: 'シグニをシグニ下に設置',
          HAND_CARDS_UNDER_SIGNI: '手札カードをシグニ下に',
          HAND_SIGNI_UNDER_SIGNI: '手札シグニをシグニ下に',
          SIGNI_UNDER_WEAPON_SIGNI: 'シグニをウェポンシグニ下に',
          UNDER_SIGNI_TO_ENERGY: 'シグニ下→エナに',
          UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: 'クラスなしならシグニ下→エナに',
          PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON: 'トラッシュシグニを全ウェポンシグニ下に',
          PLACE_DECK_TOP_UNDER_WEAPON_SIGNI: 'デッキ上をウェポンシグニ下に',
          OPP_TRASH_TO_OPP_SIGNI_UNDER: '相手トラッシュを相手シグニ下に',
          CONDITIONAL_TRASH_UNDER_SIGNI: '条件付きシグニ下トラッシュ',
          // コラボ/ゲート/マジックボックス
          COLLAB: 'コラボ効果', GATE: 'ゲート効果',
          OPEN_MAGIC_BOX: 'マジックボックスを開ける', PLACE_MAGIC_BOX: 'マジックボックス設置',
          // アタック制限
          ONE_ATTACK_PER_TURN: 'ターン1回アタック',
          ODD_LEVEL_SIGNI_CANT_ATTACK: '奇数レベルシグニアタック不可',
          LIMIT_OPP_SIGNI_ATTACKS_ONCE: '相手シグニのアタックを1回に制限',
          ATTACK_COUNT_BY_POWER: 'パワー数アタック', OPP_SIGNI_ONE_ATTACK_TOTAL: '相手シグニ合計1回アタック',
          ADJACENT_ZONE_ATTACK: '隣接ゾーンアタック', MULTI_ZONE_ATTACK: '複数ゾーンアタック',
          BLOCK_FRONT_SIGNI_ATTACK: '前シグニアタックブロック',
          // 効果/行動制限系
          BLOCK_OPP_ARTS_SPELL_ACT: '相手アーツ/スペル/起動封じ',
          BLOCK_OPP_AUTO_ABILITY_EXTENDED: '相手自動能力封じ（拡張）',
          BLOCK_ALL_OPP_ACTIVATE_ABILITY: '相手の全起動能力封じ',
          BLOCK_OPP_SPELL_ACT_NEXT_TURN: '相手次ターンスペル/起動封じ',
          BLOCK_NON_WHITE_SPELL: '白以外のスペル封じ', BLOCK_COLORLESS_PLAY: '無色プレイ封じ',
          BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: 'チャーム数による低コストスペル封じ',
          BLOCK_OPP_DECK_TO_ENERGY: '相手デッキ→エナ封じ',
          BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT: '相手シグニ効果フィールド配置封じ',
          FIRST_SPELL_COST_UP: '最初のスペルコストアップ',
          OPP_LRIG_ATTACK_COST: '相手ルリグアタックコスト',
          OPP_SIGNI_ATTACK_COST: '相手シグニアタックコスト',
          OPP_MAIN_PHASE_LIMIT_DOWN: '相手メインフェイズリミットダウン',
          OPP_TURN_NO_ENERGY_COST: '相手ターン中エナコスト不要',
          OPP_ZONE_PLACEMENT_RESTRICT: '相手ゾーン配置制限',
          ARTS_COLORLESS_MUST_PAY_CENTER_COLOR: 'アーツ無色→センター色支払い必須',
          NEGATE_ABILITY: '能力無効', NEGATE_THAT_ATTACK: 'そのアタック無効',
          NEGATE_NTH_ATTACK: 'N回目のアタック無効',
          NEGATE_COIN_ABILITY: 'コイン能力無効',
          NEGATE_ALL_OPP_EFFECTS: '全相手効果無効', EFFECT_LIMIT: '効果制限',
          DISONA_RESTRICTION: 'DISONA制限',
          COIN_SPEND_CONDITION: 'コイン消費条件', COIN_USE_RESTRICTION: 'コイン使用制限',
          INCREASE_ACT_ABILITY_COST: '起動能力コスト増加',
          // シグニゾーン移動
          MOVE_TO_OTHER_SIGNI_ZONE: '別シグニゾーンに移動',
          MOVE_TO_ATTACKER_FRONT: 'アタッカーの前に移動',
          SWAP_OPTIONAL: '任意で入れ替え', FORCE_TARGET_SELF: '対象を自分に強制',
          // バニッシュ/除外系
          BANISH_FROM_GAME: 'ゲームから除外', EXILE_FROM_CHECK_ZONE: 'チェックゾーンから除外',
          BANISH: 'バニッシュ', BANISH_MULTI_COLOR_SIGNI: '複数色シグニをバニッシュ',
          BANISH_BY_SELF_GOES_TO_TRASH: 'バニッシュ→自トラッシュ',
          BANISH_REDIRECT_TO_HAND: 'バニッシュ→手札リダイレクト',
          CRASH_TO_TRASH_INSTEAD: 'クラッシュ→トラッシュ代替',
          // 相手シグニ操作
          OPP_SIGNI_TO_DECK_AND_SHUFFLE: '相手シグニ→デッキ（シャッフル）',
          OPP_SIGNI_TO_DECK_BY_GATE: 'ゲートで相手シグニ→デッキ',
          OPP_SIGNI_TO_DECK_NTH: '相手シグニをデッキN番目に',
          OPP_SIGNI_LEAVE_TO_TRASH: '相手シグニ退場→トラッシュ',
          OPP_HAND_TO_DECK_TOP: '相手の手札をデッキトップに',
          OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND: '相手の手札枚数少なければデッキ下に',
          OPP_TRASH_FIELD_SIGNI_AND_ENERGY: '相手フィールドシグニとエナをトラッシュ',
          OPP_TRASH_TO_DECK_TOP: '相手のトラッシュ→デッキトップ',
          OPP_TRASH_LOSE_COLOR_AND_CLASS: '相手のトラッシュが色/クラス喪失',
          OPP_RETURN_HAND_ON_SELF_BANISH: '自バニッシュ時相手が手札を返す',
          OPP_DECLARE_COLOR: '相手が色を宣言',
          // 汎用操作
          TRASH_ALL_OPP_CARDS: '相手の全カードをトラッシュ',
          TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH: 'トラッシュから3ゾーンに分配',
          TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY: '名前一致を全フィールド+エナからトラッシュ',
          NON_GUARD_DISCARD_TO_ENERGY: '非ガードの捨て→エナ',
          TRASHED_CARD_TO_HAND_OR_ENERGY: 'トラッシュカード→手札かエナ',
          MULTI_SIGNI_TO_ENERGY: '複数シグニをエナに',
          MULTI_DAMAGE_ON_LRIG_ATTACK: 'ルリグアタック時複数ダメージ',
          ATTACK_PHASE_LEVEL_OVERRIDE: 'アタックフェイズレベル上書き',
          SUPPRESS_CENTER_ON_PLAY: 'プレイ時センター抑制',
          REMOVE_OPP_MULTI_ENA: '相手のマルチエナ除去',
          REMOVE_OPP_MULTI_ENA_ONLY: '相手のマルチエナのみ除去',
          SELF_TO_DECK_TOP: '自分をデッキトップに',
          LEAVE_FIELD_TO_DECK_BOTTOM: 'フィールドを去り→デッキ下',
          SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: 'ダメージ→自トラッシュ代替',
          TRASH: 'トラッシュ（汎用）',
          COUNT_DISTINCT_NAMES: '異なる名称数カウント',
          SELECT_NO_COMMON_COLOR: '共通色なしを選択',
          DISCARD_OR_PENALTY: '捨てるかペナルティ',
          DISCARD_IF_ATTACKED_THIS_TURN: 'このターンアタックされたら捨て',
          DISCARD_IF_NO_CLASS_SIGNI: 'クラスシグニなし→捨て',
          DISCARD_BY_POWER_MATCH: 'パワー一致で捨て',
          OPP_DECLARE_COLOR_COND_ENERGY_TRASH: '相手宣言色エナトラッシュ条件',
          DECLARE_NUMBER_RANGE: '数字範囲宣言', DECLARE_NUMBER_POWER: '数字宣言（パワー関連）',
          REPEAT_N_TIMES: 'N回繰り返し', REPEAT_EFFECT: '効果繰り返し',
          GAIN_EXTRA_TURN: '追加ターン獲得', REVEAL_TOP_CONDITIONAL_ROUTE: '公開トップ条件分岐',
          PLACE_CHOKKIN: 'チョッキン設置', GAIN_COIN_AND_DISCARD: 'コイン獲得+捨て',
          ADD_RESONANCE_CONDITION: 'レゾナ条件追加',
          IGNORE_LRIG_RESTRICTION_ARTS: 'ルリグ制限アーツを無視',
          CENTER_ZONE_CONDITION: 'センターゾーン条件',
          COST_COLOR_SELECT: 'コスト色選択',
          USE_CONDITION_ARTS_USED: 'アーツ使用条件',
          TARGET_OPP_SIGNI_ONLY: '相手シグニのみ対象',
          TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: 'コンテキストから相手シグニを選択',
          SELECT_OTHER_SIGNI: '他のシグニを選択',
          DEPLOY_RESTRICT: '配置制限', HASTARLIQ: 'ハスタルリク効果',
          ACTIVATE_EICHI_ABILITY: 'エイチ能力発動',
          CHANGE_EICHI_SIGNI_BASE_LEVEL: 'エイチシグニ基本レベル変更',
          TRIGGER_OTHER_SIGNI_EICHI_ABILITY: '他シグニのエイチ能力発動',
          BOTH_DISCARD_BY_CENTER_LEVEL: '両者センターレベル数捨て',
          FROZEN_SIGNI_TO_TRASH_ON_LEAVE: '凍結シグニ退場時トラッシュ',
          FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: '凍結シグニバニッシュ→デッキ下',
          NO_ABILITY_SIGNI_TO_DECK_BOTTOM: '能力なしシグニ→デッキ下',
          ALL_OPP_SIGNI_SERVANT_ZERO: '全相手シグニをサーバントゼロに',
          MAKE_SERVANT_ZERO: 'サーバントゼロにする', MAKE_MULTI_SERVANT_ZERO: '複数をサーバントゼロに',
          SIGNI_SERVANT_ZERO: 'シグニをサーバントゼロに',
          DRIVE_SIGNI_PREVENT_DOWN: 'ドライブシグニダウン防止',
          WEAPON_SIGNI_PROTECT_DOWN: 'ウェポンシグニダウン保護',
          WEAPON_SIGNI_PROTECTION: 'ウェポンシグニ保護',
          ARM_SIGNI_LRIG_PROTECTION: 'アームシグニルリグ保護',
          WHITE_SIGNI_ABILITY_PROTECT: '白シグニ能力保護',
          DISABLE_FIRST_ABILITY_ON_ATTACK: 'アタック時最初の能力を無効化',
          REVERSE_OPP_POWER_MINUS: '相手パワーマイナスを反転',
          REPLACE_PLUS_N: '+N置換',
          ABILITY_CHECK_ELSE_TRASH: '能力確認→なければトラッシュ',
          LEVEL_BASED_CONDITIONAL: 'レベル基準条件分岐',
          DEFEAT: '敗北処理',
          CONDITIONAL_SEARCH_IF_FIELD: 'フィールド条件サーチ',
          CONDITIONAL_SEARCH_IF_RESONA: 'レゾナ条件サーチ',
          CONDITIONAL_TRASH_TO_ENERGY: '条件付きトラッシュ→エナ',
          CONDITIONAL_KEYWORD_BY_CENTER_COLOR: 'センター色キーワード条件',
          CONDITIONAL_ADD_HAND: '条件付き手札追加',
          CONDITIONAL_DISCARD: '条件付き捨て',
          CONDITIONAL_PER_TRASH: 'トラッシュ条件分岐',
          CONDITIONAL_ALTERNATE_EFFECT: '条件付き代替効果',
          DECLARE_COLOR_COND_ENERGY_TRASH: '宣言色→エナトラッシュ条件',
          TRASH_IF_ZONE_OCCUPIED: 'ゾーン占有時トラッシュ',
          PICK_FROM_TRASHED_CARDS: 'トラッシュカードからピック',
          TRASH_CLASS_TO_HAND_OR_ENERGY: 'クラストラッシュ→手札かエナ',
          TRASH_SPELL_FREE_USE_LIMIT: 'トラッシュスペル無料使用制限',
          UPKEEP_OR_NO_UP: 'アップキープかアップなし',
          OPTIONAL_DISCARD_CLASS_SIGNI: 'クラスシグニを任意捨て',
          WEAPON_SIGNI_PREVENT_DOWN: 'ウェポンシグニダウン防止',
          ACTIVATE_COST_ZERO_BLACK: '黒の起動コスト0',
          BET_CONDITION: 'ベット条件',
          TRADE_SELF_AND_OPP_TO_ENERGY: '自分と相手をエナに',
        };
        const logMsg = STUB_LOG[stub.id];
        if (logMsg !== undefined) {
          return done(addLog(ctx, logMsg));
        }
      }
      return done(addLog(ctx, `[STUB: ${stub.id}]`));
    }
    case 'UNKNOWN':                 return done(addLog(ctx, `[UNKNOWN: ${(action as {raw:string}).raw?.slice(0, 40) ?? ''}]`));
    default:                        return done(ctx);
  }
}

export function executeEffect(effect: CardEffect, ctx: ExecCtx): ExecResult {
  return executeAction(effect.action, ctx);
}

// ===== インタラクション解決（UIから呼ばれる） =====

// SELECT_TARGET: ユーザーが selected[] のカードを選択した
export function resumeSelectTarget(
  selected: string[],
  pending: PendingInteractionDef & { type: 'SELECT_TARGET' },
  ctx: ExecCtx,
): ExecResult {
  // 選択されたカードに thenAction を個別適用
  let cur = ctx;
  for (const cardNum of selected) {
    // thenActionを単一カードに適用するため、フィルタなしで直接適用
    const result = applyDirectAction(pending.thenAction, cardNum, cur);
    if (!result.done) return result; // ネストしたインタラクション（通常なし）
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  }
  cur = { ...cur, lastProcessedCards: selected };
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// SEARCH: ユーザーが picked[] のカードをピックした
export function resumeSearch(
  picked: string[],
  pending: PendingInteractionDef & { type: 'SEARCH' },
  ctx: ExecCtx,
): ExecResult {
  let cur = ctx;
  for (const id of picked) {
    const result = applyDirectAction(pending.thenAction, id, cur);
    if (!result.done) return result;
    cur = { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs };
  }
  // 未ピックカードの処理（REVEAL_PICK_HAND_SHUFFLE_BOTTOM など）
  if (pending.restDest) {
    const remaining = pending.visibleCards.filter(n => !picked.includes(n));
    let logMsg = '';
    for (const cardNum of remaining) {
      const di = cur.ownerState.deck.indexOf(cardNum);
      if (di < 0) continue;
      const newDeck = [...cur.ownerState.deck];
      newDeck.splice(di, 1);
      if (pending.restDest === 'deck_bottom') {
        newDeck.push(cardNum);
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck } };
        logMsg = '残りをデッキ下へ';
      } else if (pending.restDest === 'trash') {
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck, trash: [...cur.ownerState.trash, cardNum] } };
        logMsg = '残りをトラッシュへ';
      } else if (pending.restDest === 'energy') {
        cur = { ...cur, ownerState: { ...cur.ownerState, deck: newDeck, energy: [...cur.ownerState.energy, cardNum] } };
        logMsg = '残りをエナゾーンへ';
      }
    }
    if (logMsg && remaining.length > 0) cur = addLog(cur, logMsg);
  }
  if (pending.afterAction) {
    const r = executeAction(pending.afterAction, cur);
    if (!r.done) return r;
    cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
  }
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// CHOOSE: ユーザーが choiceId を選択した
export function resumeChoose(
  choiceId: string,
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const opt = pending.options.find(o => o.id === choiceId);
  if (!opt) return done(ctx);
  const result = executeAction(opt.action, ctx);
  if (!result.done) return result;
  if (pending.continuation) {
    return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
  }
  return result;
}

// OPTIONAL_COST: 任意コスト付き効果の発動/スキップ選択後の処理
// choiceId='pay': energyNums 分のエナを支払い効果発動, 'skip': スキップ
export function resumeOptionalCost(
  choiceId: string,
  energyNums: string[],
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
  const skipOpt = pending.options.find(o => o.id === 'skip');
  const payOpt  = pending.options.find(o => o.id === 'pay');

  if (choiceId !== 'pay') {
    // スキップ: スキップアクション → continuation
    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
    if (!result.done) return result;
    if (pending.continuation) {
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
    }
    return result;
  }

  // コスト支払い: 色バリデーション → エナ消費 → アクション実行
  const costColors = [...(payOpt?.costColors ?? [])];
  for (const n of energyNums) {
    const color = ctx.cardMap.get(n)?.Color ?? '無';
    const idx = costColors.findIndex(c => c === color || c === '無');
    if (idx === -1) return done(addLog(ctx, `コスト支払いエラー: ${color}は不要`));
    costColors.splice(idx, 1);
  }
  if (costColors.length > 0) return done(addLog(ctx, `コスト支払いエラー: エナ不足`));

  const newEnergy = ctx.ownerState.energy.filter(n => !energyNums.includes(n));
  const newTrash  = [...ctx.ownerState.trash, ...energyNums];
  let cur = addLog(
    { ...ctx, ownerState: { ...ctx.ownerState, energy: newEnergy, trash: newTrash } },
    `コスト支払い: ${(payOpt?.costColors ?? []).map(c => `《${c}》`).join('')}`,
  );

  const result = executeAction(payOpt?.action ?? noopAction, cur);
  if (!result.done) {
    // continuationを result.pending に付け足す
    if (pending.continuation) {
      const merged: EffectAction = result.pending.continuation
        ? { type: 'SEQUENCE', steps: [result.pending.continuation, pending.continuation] } as SequenceAction
        : pending.continuation;
      return { ...result, pending: { ...result.pending, continuation: merged } };
    }
    return result;
  }
  if (pending.continuation) {
    return executeAction(pending.continuation, { ...cur, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
  }
  return result;
}

// OPPONENT_PAY_OPTIONAL: 対戦相手がコスト支払いを選択した後の処理
// pay → 対戦相手（otherState）のエナを消費して効果なし, skip → 効果発動
export function resumeOpponentPayOptional(
  choiceId: string,
  energyNums: string[], // 対戦相手が選択したエナカードのCardNum
  pending: PendingInteractionDef & { type: 'CHOOSE' },
  ctx: ExecCtx,
): ExecResult {
  const noopAction: SequenceAction = { type: 'SEQUENCE', steps: [] };
  const payOpt  = pending.options.find(o => o.id === 'pay');
  const skipOpt = pending.options.find(o => o.id === 'skip');

  if (choiceId !== 'pay') {
    // 対戦相手が支払わない → 効果発動
    const result = executeAction(skipOpt?.action ?? noopAction, ctx);
    if (!result.done) {
      if (pending.continuation) {
        const merged: EffectAction = result.pending.continuation
          ? { type: 'SEQUENCE', steps: [result.pending.continuation, pending.continuation] } as SequenceAction
          : pending.continuation;
        return { ...result, pending: { ...result.pending, continuation: merged } };
      }
      return result;
    }
    if (pending.continuation) {
      return executeAction(pending.continuation, { ...ctx, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs });
    }
    return result;
  }

  // 対戦相手が支払う → otherState のエナを消費（効果なし）
  const costColors = [...(payOpt?.costColors ?? [])];
  for (const n of energyNums) {
    const color = ctx.cardMap.get(n)?.Color ?? '無';
    const idx = costColors.findIndex(c => c === color || c === '無');
    if (idx === -1) return done(addLog(ctx, `コスト支払いエラー: ${color}は不要`));
    costColors.splice(idx, 1);
  }
  if (costColors.length > 0) return done(addLog(ctx, 'コスト支払いエラー: エナ不足'));

  const newOppEnergy = ctx.otherState.energy.filter(n => !energyNums.includes(n));
  const newOppTrash  = [...ctx.otherState.trash, ...energyNums];
  const cur = addLog(
    { ...ctx, otherState: { ...ctx.otherState, energy: newOppEnergy, trash: newOppTrash } },
    `対戦相手コスト支払い: ${(payOpt?.costColors ?? []).map(c => `《${c}》`).join('')}`,
  );
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// LOOK_AND_REORDER: ユーザーが reordered[] の順に並べ（先頭=デッキトップ）
export function resumeLookAndReorder(
  reordered: string[],
  trashed: string[],
  pending: PendingInteractionDef & { type: 'LOOK_AND_REORDER' },
  ctx: ExecCtx,
): ExecResult {
  const keep = reordered.filter(n => !trashed.includes(n));
  const destOwner = pending.destOwner;
  const state = ownerState(destOwner, ctx);
  let newS: PlayerState;
  if (pending.destPosition === 'top') {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  } else if (pending.destPosition === 'bottom') {
    newS = { ...state, deck: [...state.deck, ...keep], trash: [...state.trash, ...trashed] };
  } else {
    newS = { ...state, deck: [...keep, ...state.deck], trash: [...state.trash, ...trashed] };
  }
  let cur = addLog(setOwnerState(destOwner, newS, ctx), `デッキを並べ替え`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// SELECT_ZONE: プレイヤーが選んだゾーン番号にカードを配置する
export function resumeSelectZone(
  zoneIndex: number,
  pending: PendingInteractionDef & { type: 'SELECT_ZONE' },
  ctx: ExecCtx,
): ExecResult {
  const state = ownerState(pending.owner, ctx);
  const signi = [...state.field.signi] as (string[] | null)[];
  if (signi[zoneIndex] && (signi[zoneIndex]?.length ?? 0) > 0) return done(ctx); // 占有済みならスキップ
  signi[zoneIndex] = [pending.cardNum];
  const newS: PlayerState = { ...state, field: { ...state.field, signi } };
  const cur = addLog(setOwnerState(pending.owner, newS, ctx),
    `${ctx.cardMap.get(pending.cardNum)?.CardName ?? pending.cardNum}を場に出す`);
  if (pending.continuation) return executeAction(pending.continuation, cur);
  return done(cur);
}

// ===== 直接アクション適用（特定のcardNumに対して） =====

function applyDirectAction(action: EffectAction, cardNum: string, ctx: ExecCtx): ExecResult {
  switch (action.type) {
    case 'BANISH': {
      // cardNumが opponent.field にあるか自分のフィールドにあるかを検索
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const s = ownerState(found, ctx);
      const removed = removeFromField(cardNum, s);
      const withEnergy: PlayerState = { ...removed, energy: [...removed.energy, cardNum] };
      return done(addLog(setOwnerState(found, withEnergy, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をバニッシュ`));
    }
    case 'BOUNCE': {
      let found: Owner | null = null;
      if (ctx.ownerState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'self';
      if (ctx.otherState.field.signi.some(s => s?.at(-1) === cardNum)) found = 'opponent';
      if (!found) return done(ctx);
      const s = ownerState(found, ctx);
      const removed = removeFromField(cardNum, s);
      const withHand: PlayerState = { ...removed, hand: [...removed.hand, cardNum] };
      return done(addLog(setOwnerState(found, withHand, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を手札に戻す`));
    }
    case 'TRASH': {
      const trashAction = action as TrashAction;
      const tgt = trashAction.target;
      if (tgt.type === 'SIGNI') {
        // フィールドのシグニをトラッシュ
        const owner = tgt.owner as Owner;
        const s = ownerState(owner, ctx);
        if (s.field.signi.some(stack => stack?.at(-1) === cardNum)) {
          const removed = removeFromField(cardNum, s);
          const newS: PlayerState = { ...removed, trash: [...removed.trash, cardNum] };
          return done(addLog(setOwnerState(owner, newS, ctx),
            `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をトラッシュへ`));
        }
        return done(ctx);
      }
      // HAND_CARD: hand からトラッシュ（同名カードが複数ある場合は先頭の1枚のみ）
      for (const owner of ['self', 'opponent'] as Owner[]) {
        const s = ownerState(owner, ctx);
        const hi = s.hand.indexOf(cardNum);
        if (hi >= 0) {
          const newHand = [...s.hand];
          newHand.splice(hi, 1);
          const newS: PlayerState = { ...s, hand: newHand, trash: [...s.trash, cardNum] };
          return done(addLog(setOwnerState(owner, newS, ctx), `手札をトラッシュへ`));
        }
      }
      return done(ctx);
    }
    case 'POWER_MODIFY': {
      const pmAction = action as PowerModifyAction;
      const delta = resolveNum(pmAction.delta);
      const tgtOwner = pmAction.target.owner === 'any' ? 'self' : pmAction.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      const mods = [...(s.temp_power_mods ?? []), { cardNum, delta }];
      const newS: PlayerState = { ...s, temp_power_mods: mods };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx), `パワー${delta > 0 ? '+' : ''}${delta}`));
    }
    case 'ADD_TO_HAND': {
      // インスタンスIDで正確な1枚を特定しデッキ/トラッシュから除去して手札へ
      const cn = getCardNum(cardNum);
      let s = { ...ctx.ownerState };
      const di = s.deck.indexOf(cardNum);
      if (di >= 0) {
        const newDeck = [...s.deck]; newDeck.splice(di, 1);
        s = { ...s, deck: newDeck };
      } else {
        const ti = s.trash.indexOf(cardNum);
        if (ti >= 0) {
          const newTrash = [...s.trash]; newTrash.splice(ti, 1);
          s = { ...s, trash: newTrash };
        }
      }
      const newS: PlayerState = { ...s, hand: [...s.hand, cardNum] };
      return done(addLog({ ...ctx, ownerState: newS }, `${ctx.cardMap.get(cn)?.CardName ?? cn}を手札に加える`));
    }
    case 'TRANSFER_TO_HAND': {
      const src = (action as TransferToHandAction).source;
      const state = ownerState(src.owner, ctx);
      let newS = { ...state };
      if (src.type === 'TRASH_CARD') {
        const ti = newS.trash.indexOf(cardNum);
        if (ti >= 0) { const t = [...newS.trash]; t.splice(ti, 1); newS = { ...newS, trash: t }; }
        newS = { ...newS, hand: [...newS.hand, cardNum] };
      } else if (src.type === 'ENERGY_CARD') {
        const ei = newS.energy.indexOf(cardNum);
        if (ei >= 0) { const e = [...newS.energy]; e.splice(ei, 1); newS = { ...newS, energy: e }; }
        newS = { ...newS, hand: [...newS.hand, cardNum] };
      }
      return done(addLog(setOwnerState(src.owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を手札に加える`));
    }
    case 'ADD_TO_FIELD': {
      const owner = (action as AddToFieldAction).owner;
      const src = (action as AddToFieldAction).source;
      const state = ownerState(owner, ctx);
      let newS = { ...state };
      if (src?.type === 'TRASH_CARD') {
        const ti = newS.trash.indexOf(cardNum);
        if (ti >= 0) { const t = [...newS.trash]; t.splice(ti, 1); newS = { ...newS, trash: t }; }
      } else if (src?.type === 'ENERGY_CARD') {
        const ei = newS.energy.indexOf(cardNum);
        if (ei >= 0) { const e = [...newS.energy]; e.splice(ei, 1); newS = { ...newS, energy: e }; }
      }
      const signi = [...newS.field.signi] as (string[] | null)[];
      const emptyIdx = signi.findIndex(z => !z || z.length === 0);
      if (emptyIdx >= 0) signi[emptyIdx] = [cardNum];
      newS = { ...newS, field: { ...newS.field, signi } };
      return done(addLog(setOwnerState(owner, newS, ctx), `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を場に出す`));
    }
    case 'ATTACH_ACCE': {
      // cardNum = SELECT_TARGET で選ばれたシグニ
      const acceAction = action as import('../types/effects').AttachAcceAction;
      const tgtState = ownerState(acceAction.targetSigniOwner, ctx);
      const srcState = ownerState(acceAction.sourceOwner, ctx);
      const zoneIdx  = tgtState.field.signi.findIndex(s => s?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const acceCardNum = ctx.sourceCardNum;
      if (!acceCardNum) return done(ctx);
      // エナゾーンまたは手札からアクセカードを除去
      let newSrc = { ...srcState };
      if (newSrc.energy.includes(acceCardNum)) {
        newSrc = { ...newSrc, energy: newSrc.energy.filter(n => n !== acceCardNum) };
      } else if (newSrc.hand.includes(acceCardNum)) {
        newSrc = { ...newSrc, hand: newSrc.hand.filter(n => n !== acceCardNum) };
      } else {
        return done(ctx);
      }
      let ctx2 = setOwnerState(acceAction.sourceOwner, newSrc, ctx);
      // signi_acce[zoneIdx] に設定
      const tgt2 = ownerState(acceAction.targetSigniOwner, ctx2);
      const newAcce = [...(tgt2.field.signi_acce ?? [null, null, null])];
      newAcce[zoneIdx] = acceCardNum;
      const newTgt: PlayerState = { ...tgt2, field: { ...tgt2.field, signi_acce: newAcce } };
      ctx2 = setOwnerState(acceAction.targetSigniOwner, newTgt, ctx2);
      const acceCardName  = ctx.cardMap.get(acceCardNum)?.CardName ?? acceCardNum;
      const signiCardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
      return done(addLog(ctx2, `${acceCardName}を${signiCardName}にアクセ`));
    }
    case 'SEQUENCE': {
      // SEARCH の thenAction が SEQUENCE[REVEAL, ADD_TO_HAND] 等の場合、
      // cardNum を各ステップに引き継いで実行する
      const steps = (action as import('../types/effects').SequenceAction).steps;
      let cur = ctx;
      for (const step of steps) {
        const r = applyDirectAction(step, cardNum, cur);
        if (!r.done) return r;
        cur = { ...cur, ownerState: r.ownerState, otherState: r.otherState, logs: r.logs };
      }
      return done(cur);
    }
    case 'NEGATE_ATTACK': {
      // cardNum を対象シグニの negated_attacks に追加
      const na = action as import('../types/effects').NegateAttackAction;
      const tgtOwner = na.target.owner === 'any' ? 'opponent' : na.target.owner as Owner;
      const s = ownerState(tgtOwner, ctx);
      const negated = [...(s.negated_attacks ?? []), cardNum];
      const newS = { ...s, negated_attacks: negated };
      return done(addLog(setOwnerState(tgtOwner, newS, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}のアタックを無効化`));
    }
    case 'PLACE_UNDER_SOURCE_SIGNI': {
      // ctx.sourceCardNum にあるシグニのゾーンに cardNum を下から追加
      const fromLoc = (action as import('../types/effects').PlaceUnderSourceSigniAction).fromLocation;
      const sourceCard = ctx.sourceCardNum;
      if (!sourceCard) return done(ctx);
      const zoneIdx = ctx.ownerState.field.signi.findIndex(stack => stack?.includes(sourceCard));
      if (zoneIdx === -1) return done(ctx);
      // 移動元のリストから除去
      let newState = { ...ctx.ownerState };
      if (fromLoc === 'trash') {
        newState = { ...newState, trash: newState.trash.filter(c => c !== cardNum) };
      } else if (fromLoc === 'hand') {
        newState = { ...newState, hand: newState.hand.filter(c => c !== cardNum) };
      } else if (fromLoc === 'energy') {
        newState = { ...newState, energy: newState.energy.filter(c => c !== cardNum) };
      }
      // ゾーンの先頭に追加（下に置く）
      const newSigni = newState.field.signi.map((stack, i) => {
        if (i !== zoneIdx) return stack;
        return [cardNum, ...(stack ?? [])];
      }) as (string[] | null)[];
      newState = { ...newState, field: { ...newState.field, signi: newSigni } };
      return done(addLog({ ...ctx, ownerState: newState },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をシグニの下に置いた`));
    }
    case 'DOWN': {
      const downA = action as import('../types/effects').DownAction;
      const downOwner = downA.target.owner === 'any' ? 'opponent' : downA.target.owner as Owner;
      const downS = ownerState(downOwner, ctx);
      const zoneIdx = downS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (zoneIdx < 0) return done(ctx);
      const newDown = [...(downS.field.signi_down ?? [false, false, false])] as boolean[];
      newDown[zoneIdx] = true;
      return done(addLog(setOwnerState(downOwner, { ...downS, field: { ...downS.field, signi_down: newDown } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をダウン`));
    }
    case 'FREEZE': {
      const frzA = action as import('../types/effects').FreezeAction;
      const frzOwner = frzA.target.owner === 'any' ? 'opponent' : frzA.target.owner as Owner;
      const frzS = ownerState(frzOwner, ctx);
      const frzIdx = frzS.field.signi.findIndex(st => st?.at(-1) === cardNum);
      if (frzIdx < 0) return done(ctx);
      const newFrz = [...(frzS.field.signi_frozen ?? [false, false, false])] as boolean[];
      newFrz[frzIdx] = true;
      return done(addLog(setOwnerState(frzOwner, { ...frzS, field: { ...frzS.field, signi_frozen: newFrz } }, ctx),
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}を凍結`));
    }
    case 'TAKE_FROM_UNDER_SIGNI': {
      const ta = action as import('../types/effects').TakeFromUnderSigniAction;
      // cardNum をシグニゾーンの下カードから除去
      const newSigni = ctx.ownerState.field.signi.map(stack => {
        if (!stack) return stack;
        const idx = stack.indexOf(cardNum);
        if (idx === -1 || idx === stack.length - 1) return stack; // 上にある or 最上位(シグニ自体)
        return [...stack.slice(0, idx), ...stack.slice(idx + 1)];
      }) as (string[] | null)[];
      let newOwner = { ...ctx.ownerState, field: { ...ctx.ownerState.field, signi: newSigni } };
      const destLabel = ta.destination === 'hand' ? '手札' : ta.destination === 'energy' ? 'エナゾーン' : 'トラッシュ';
      if (ta.destination === 'hand') {
        newOwner = { ...newOwner, hand: [...newOwner.hand, cardNum] };
      } else if (ta.destination === 'energy') {
        newOwner = { ...newOwner, energy: [...newOwner.energy, cardNum] };
      } else {
        newOwner = { ...newOwner, trash: [...newOwner.trash, cardNum] };
      }
      return done(addLog({ ...ctx, ownerState: newOwner },
        `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}をシグニの下から${destLabel}に移動`));
    }
    default:
      return executeAction(action, ctx);
  }
}
