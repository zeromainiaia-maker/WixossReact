import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../supabaseClient';
import type { User } from '@supabase/supabase-js';
import type { BattleStateRow, PlayerState, CardData, TurnPhase, PendingSpell, PendingEffect, StackEntry, EffectStack } from '../types';
import { buildEffectsMap } from '../data/effectParser';
import { calcFieldPowers, calcActiveCostMods, calcContinuousBlockedActions, checkActiveCondition, collectLrigGrantedEffects, collectGrantedFromUnderSigni, collectColorlessOverrides, collectForcedTargets, collectProtectedZones, collectEnergyColorSubs, collectEnergyTrashSubstituteInfo, collectEichiStubEffects, collectOppGuardExtraColorlessCost, collectHandLimits, collectAbilityProtectedSigni, collectSpecificCardCostReductions, collectCrossStates, collectLrigNameAliases, collectFieldEnergySigniColorGains, collectDownProtectedSigni, collectArtsThresholdCostReductions, collectOppLrigAttackExtraCost, collectHandGuardIconClasses, collectLrigColorAndLimitMods, LRIG_ALL_NAMES_SENTINEL, collectBounceProtectedSigni, collectCopiedLrigAutoEffects, collectAttackPhaseLevelOverrides, collectDrawLimits, collectAllZoneBlackCardNums, hasAllCardsColorBlack, collectOppEnergyColorRestriction, collectOppExtraGuardFromHand, collectBlockLowCostSpellCount, collectCenterZoneDeployRestrict, collectFrozenBanishOverrides, collectFirstSpellCostUp, collectIncreaseActCost, collectAcceCostReduction, collectTrashFieldProtectedSigni, collectAbilityGainProtectedSigni, collectInfectedActivateBlockedSigni, collectMultiAcceSigni, collectRiseBanishSubstituteSigni, collectAllColorSigniForField, collectFieldSigniExtraColors, collectGrowCostSubstitute, collectGuardAlternativeCost, collectAltAttackFlipSigni} from '../engine/effectEngine';
import { executeEffect, resumeSelectTarget, resumeSearch, resumeChoose, resumeOptionalCost, resumeOpponentPayOptional, resumeLookAndReorder, resumeSelectZone, removeFromField, getCardNum, evalUseCondition, type ExecCtx, type ExecResult } from '../engine/effectExecutor';
import { getRiseFilter, matchesRiseFilter } from '../engine/execUtils';
import { initStack, pushToStack, confirmTurnOrder, confirmOppOrder, shiftQueue, isReadyToResolve, isStackDone } from '../engine/effectStack';
import { hasKeyword, hasBanishResist } from '../utils/keywords';
import { C, CardModal, HandCards, PlayerField } from '../components/BoardComponents';
import type { CardAction } from '../components/BoardComponents';

interface Props {
  user: User;
  roomId: string;
  myDeckId: string;
  cards: CardData[];
  onBack: () => void;
}

// CPU専用プレイヤーID（MatchmakingScreenと共有）
const CPU_PLAYER_ID = '00000000-0000-0000-0000-000000000001';
const CPU_ACTION_DELAY = 900; // CPU行動の遅延ms（オンライン感を出す）

function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // HTTP環境など crypto.randomUUID が使えない場合のフォールバック
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return [...bytes].map((b, i) =>
    ([4,6,8,10].includes(i) ? '-' : '') + b.toString(16).padStart(2, '0')
  ).join('');
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// インスタンスIDを意識したMap：CardNum#N のキーに対して自動的にCardNum部分で検索する
class InstanceMap<V> extends Map<string, V> {
  // instanceId キーが存在すれば優先（付与能力用）、なければ CardNum にフォールバック
  override get(id: string): V | undefined {
    if (super.has(id)) return super.get(id);
    return super.get(getCardNum(id));
  }
  override has(id: string): boolean { return super.has(id) || super.has(getCardNum(id)); }
}

// デッキのカード配列にインスタンスIDを付与する（WD03-009 → WD03-009#1, WD03-009#2, ...）
function assignInstanceIds(cards: string[]): string[] {
  const counts: Record<string, number> = {};
  return cards.map(cn => {
    counts[cn] = (counts[cn] ?? 0) + 1;
    return `${cn}#${counts[cn]}`;
  });
}

// CPUゲスト側用：ホストと衝突しないよう #g1, #g2... で採番
function assignGuestInstanceIds(cards: string[]): string[] {
  const counts: Record<string, number> = {};
  return cards.map(cn => {
    counts[cn] = (counts[cn] ?? 0) + 1;
    return `${cn}#g${counts[cn]}`;
  });
}

// リフレッシュ: トラッシュ全枚数をデッキに加えシャッフル。ライフがあれば一番上をトラッシュへ（バーストなし）。
function applyRefresh(state: PlayerState): PlayerState {
  const newDeck = shuffle([...state.trash]);
  const topLife = state.life_cloth.length > 0 ? state.life_cloth[state.life_cloth.length - 1] : null;
  return {
    ...state,
    deck:       newDeck,
    trash:      topLife ? [topLife] : [],
    life_cloth: topLife ? state.life_cloth.slice(0, -1) : state.life_cloth,
  };
}

// ドロー処理（リフレッシュ対応）。
// デッキ枚数が不足した場合: 残り全枚数をドロー → リフレッシュ → そこで停止（追加ドローは行わない）。
function drawCards(state: PlayerState, count: number): PlayerState {
  if (count <= 0) return state;
  const canDraw = Math.min(count, state.deck.length);
  const drew: PlayerState = {
    ...state,
    hand: [...state.hand, ...state.deck.slice(0, canDraw)],
    deck: state.deck.slice(canDraw),
  };
  return canDraw < count ? applyRefresh(drew) : drew;
}

function jankenWinner(h: string, g: string, hostId: string, guestId: string): string | null {
  if (h === g) return null;
  if (
    (h === 'GU' && g === 'CHOKI') ||
    (h === 'CHOKI' && g === 'PA') ||
    (h === 'PA' && g === 'GU')
  ) return hostId;
  return guestId;
}


const toHalfWidth = (s: string) =>
  s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));

// グロウコストのパース: "《白》×１《赤》×２" → [{color:'白',count:1},{color:'赤',count:2}]
function parseGrowCost(raw: string): { color: string; count: number }[] {
  if (!raw || raw === 'なし' || raw === '-') return [];
  const result: { color: string; count: number }[] = [];
  for (const m of raw.matchAll(/《([^》]+)》×([０-９\d]+)/g)) {
    if (m[1] === 'コイン') continue; // コインはエナではない。parseCoinCostで別処理
    const count = parseInt(toHalfWidth(m[2]));
    if (count > 0) result.push({ color: m[1], count });
  }
  return result;
}

// コスト文字列から指定色をN個減らす
function removeNColorFromCost(cost: string, color: string, n: number): string {
  const parts = parseGrowCost(cost);
  const idx = parts.findIndex(p => p.color === color);
  if (idx < 0) return cost;
  const newParts = [...parts];
  newParts[idx] = { color: newParts[idx].color, count: Math.max(0, newParts[idx].count - n) };
  const result = newParts.filter(p => p.count > 0).map(p => `《${p.color}》×${p.count}`).join('');
  return result || 'なし';
}

// コスト文字列から指定色を1つ減らす（《X》×Nが1→削除、2+→-1）
function removeOneCostColor(cost: string, color: string): string {
  const parts = parseGrowCost(cost);
  const idx = parts.findIndex(p => p.color === color);
  if (idx < 0) return cost;
  const newParts = [...parts];
  newParts[idx] = { color: newParts[idx].color, count: newParts[idx].count - 1 };
  const result = newParts.filter(p => p.count > 0).map(p => `《${p.color}》×${p.count}`).join('');
  return result || 'なし';
}

// "《白×2》《赤》" 形式のEffectText内コスト表記をparseGrowCost互換文字列に変換
function normalizeCostText(s: string): string {
  const result: { color: string; count: number }[] = [];
  for (const m of s.matchAll(/《([^×》]+?)(?:×([０-９\d]+))?》/g)) {
    const color = m[1].trim();
    if (['コイン', 'ターン1回', 'アタックフェイズ', 'ダウン'].includes(color)) continue;
    const count = m[2] ? parseInt(toHalfWidth(m[2])) : 1;
    result.push({ color, count });
  }
  return result.map(p => `《${p.color}》×${p.count}`).join('') || 'なし';
}

// EffectText を参照してアーツの実効コストを算出（条件付きコスト軽減の近似）
function computeArtsEffectiveCost(
  card: { Cost: string; EffectText?: string },
  myState: { life_cloth: string[]; hand: string[]; field?: PlayerState['field']; trash?: string[] },
  lrigName?: string,
  oppLrigColor?: string,
  myLrigLevel?: number,
  cardMap?: Map<string, CardData>,
  lrigNameAliases?: string[],
  artsThresholdReductions?: { minTotalCost: number; color: string; reduction: number }[],
): string {
  const text = card.EffectText ?? '';
  const base = card.Cost;
  let m: RegExpMatchArray | null;

  // lrigName判定：エイリアスも含めた名前一致チェック
  // LRIG_ALL_NAMES_SENTINEL がある場合はどのキーワードにも一致
  const lrigNameMatches = (keyword: string) =>
    lrigNameAliases?.includes(LRIG_ALL_NAMES_SENTINEL) ||
    lrigName?.includes(keyword) || lrigNameAliases?.some(a => a.includes(keyword));

  // 対戦相手のルリグ色条件：コスト上書き
  m = text.match(/対戦相手のセンタールリグが(.+?)の場合[、,](?:このアーツの|このカードの)?(?:使用|基本)コストは(.+?)になる/s);
  if (m && oppLrigColor) {
    const colors = m[1].split(/か|と/).map(c => c.trim()).filter(Boolean);
    if (colors.some(c => oppLrigColor.includes(c))) {
      return normalizeCostText(m[2]);
    }
  }

  // 自分のセンタールリグのレベル条件：コスト減
  m = text.match(/センタールリグのレベルが([０-９\d]+)(以上|以下)[^、]*(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && myLrigLevel !== undefined) {
    const threshold = parseInt(toHalfWidth(m[1]));
    const op = m[2];
    const condMet = op === '以上' ? myLrigLevel >= threshold : myLrigLevel <= threshold;
    if (condMet) return removeOneCostColor(base, m[3]);
  }

  // ライフクロスがN枚以下の場合コスト減
  m = text.match(/ライフクロスが([０-９\d]+)枚以下.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && myState.life_cloth.length <= parseInt(toHalfWidth(m[1]))) {
    return removeOneCostColor(base, m[2]);
  }

  // 手札がN枚以下の場合コスト減
  m = text.match(/手札が([０-９\d]+)枚以下.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && myState.hand.length <= parseInt(toHalfWidth(m[1]))) {
    return removeOneCostColor(base, m[2]);
  }

  // センタールリグ名条件（エイリアスも考慮）
  m = text.match(/センタールリグのカード名に《([^》]+)》を含む.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && lrigNameMatches(m[1])) {
    return removeOneCostColor(base, m[2]);
  }
  m = text.match(/センタールリグが.*?カード名に《([^》]+)》.*?(?:このアーツの)?使用コストは《([^》]+)》[１-９一]つ少/s);
  if (m && lrigNameMatches(m[1])) {
    return removeOneCostColor(base, m[2]);
  }

  // フィールドにパワーN以上のシグニがある場合コスト減（CONDITIONAL_COST_REDUCTION_BY_FIELD）
  if (myState.field && cardMap) {
    m = text.match(/あなたの場にパワー([０-９\d]+)以上のシグニがある場合[^、]*使用コストは《([^》]+)》×([０-９\d]+)減る/);
    if (m) {
      const reqPower = parseInt(toHalfWidth(m[1]));
      const color = m[2];
      const cnt = parseInt(toHalfWidth(m[3]));
      const hasStrongSigni = (myState.field.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        if (!top) return false;
        const pow = parseInt(cardMap.get(top)?.Power ?? '0');
        return pow >= reqPower;
      });
      if (hasStrongSigni) return removeNColorFromCost(base, color, cnt);
    }
    // フィールドに特定クラスのシグニがある場合コスト減
    m = text.match(/あなたの場に＜([^＞]+)＞のシグニがある場合[^、]*使用コストは《([^》]+)》×([０-９\d]+)減る/);
    if (m) {
      const reqClass = m[1];
      const color = m[2];
      const cnt = parseInt(toHalfWidth(m[3]));
      const hasClassSigni = (myState.field.signi ?? []).some(stack => {
        const top = stack?.at(-1);
        return top && (cardMap.get(top)?.CardClass ?? '').includes(reqClass);
      });
      if (hasClassSigni) return removeNColorFromCost(base, color, cnt);
    }
  }

  // SPELL_COST_REDUCTION_BY_TRASH_COUNT: トラッシュのクラスシグニN枚につき色コスト×1軽減
  if (myState.trash && cardMap) {
    m = text.match(/トラッシュにある＜([^＞]+)＞のシグニ([０-９\d]+)枚につき《([^》]+)》×?([０-９\d]*)減る/);
    if (m) {
      const cls = m[1]; const perN = parseInt(toHalfWidth(m[2])); const col = m[3]; const perRed = parseInt(toHalfWidth(m[4] || '1')) || 1;
      const cnt = myState.trash.filter(cn => (cardMap.get(cn)?.CardClass ?? '').includes(cls) && cardMap.get(cn)?.Type === 'シグニ').length;
      const reduction = Math.floor(cnt / perN) * perRed;
      if (reduction > 0) return removeNColorFromCost(base, col, reduction);
    }
  }

  // ARTS_COST_REDUCTION_BY_COST_THRESHOLD: コスト合計がN以上なら色コスト軽減
  if (artsThresholdReductions && artsThresholdReductions.length > 0) {
    const totalCost = parseGrowCost(base).reduce((s, c) => s + c.count, 0);
    for (const { minTotalCost, color, reduction } of artsThresholdReductions) {
      if (totalCost >= minTotalCost) {
        return removeNColorFromCost(base, color, reduction);
      }
    }
  }

  return base;
}

// EffectText から【グロウ】条件テキストを抽出（次の【】の手前まで）
function extractGrowCondition(effectText?: string): string | null {
  const m = effectText?.match(/【グロウ】([^【]*)/);
  return m ? m[1].trim() : null;
}

// 【グロウ】条件を評価する。認識できないテキスト（グロウ効果など）は true（条件なし）扱い
function checkGrowCondition(
  cond: string | null,
  myState: PlayerState,
  currentLrig: CardData | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!cond) return true;

  const currentLrigName = currentLrig?.CardName;

  // ライフクロスが○枚以下
  let m = cond.match(/あなたのライフクロスが([０-９\d]+)枚以下/);
  if (m) return myState.life_cloth.length <= parseInt(toHalfWidth(m[1]));

  // ライフクロスが○枚である（PR-461等）
  m = cond.match(/あなたのライフクロスが([０-９\d]+)枚である/);
  if (m) return myState.life_cloth.length === parseInt(toHalfWidth(m[1]));

  // センタールリグがカード名に《X》を含む（CardClass が混在する遊月・肆などでも正確に判定）
  m = cond.match(/あなたのセンタールリグがカード名に《([^》]+)》を含む/);
  if (m) return !!(currentLrigName?.includes(m[1]));

  // トラッシュに○の色のカードが○枚以上ある
  m = cond.match(/あなたのトラッシュに([^\s]+?)のカードが([０-９\d]+)枚以上/);
  if (m) {
    const [, color, nStr] = m;
    const n = parseInt(toHalfWidth(nStr));
    const count = myState.trash.filter(num => cardMap.get(num)?.Color?.includes(color)).length;
    return count >= n;
  }

  // エナゾーンにあるカードが持つ色が○種類以上
  m = cond.match(/あなたのエナゾーンにあるカードが持つ色が([０-９\d]+)種類以上/);
  if (m) {
    const needed = parseInt(toHalfWidth(m[1]));
    const wixossColors = ['白', '赤', '青', '緑', '黒'];
    const colorSet = new Set<string>();
    for (const num of myState.energy) {
      const card = cardMap.get(num);
      for (const c of wixossColors) {
        if (card?.Color?.includes(c)) colorSet.add(c);
      }
    }
    return colorSet.size >= needed;
  }

  // ○かつ○のルリグ（グロウ元ルリグが指定された複数色を持つ必要がある）
  m = cond.match(/([白赤青緑黒])かつ([白赤青緑黒])のルリグ/);
  if (m) {
    const lrigColor = currentLrig?.Color ?? '';
    return lrigColor.includes(m[1]) && lrigColor.includes(m[2]);
  }

  // ルリグデッキから＜X＞か＜Y＞のルリグ（＜Z＞ではない）を1枚置く
  m = cond.match(/あなたのルリグデッキから(?:＜([^＞]+)＞ではない、)?＜([^＞]+)＞か＜([^＞]+)＞のルリグ１枚/);
  if (m) {
    const excludeRaw = m[1] ?? null;
    const class1 = m[2], class2 = m[3];
    const excludeClasses = excludeRaw ? excludeRaw.split(/[／/]/).map(c => c.trim()) : [];
    return myState.lrig_deck.some(id => {
      const card = cardMap.get(id);
      if (!card) return false;
      const classes = card.CardClass?.split('/').map(c => c.trim()) ?? [];
      if (!classes.some(c => c === class1 || c === class2)) return false;
      if (excludeClasses.length > 0 && excludeClasses.every(ec => classes.includes(ec))) return false;
      return true;
    });
  }

  // ルリグデッキにある＜X＞のルリグN枚をゲームから除外する
  m = cond.match(/あなたのルリグデッキにある＜([^＞]+)＞のルリグ([０-９\d]+)枚をゲームから除外する/);
  if (m) {
    const targetClass = m[1];
    const required = parseInt(toHalfWidth(m[2]));
    const count = myState.lrig_deck.filter(id => {
      const card = cardMap.get(id);
      return card?.CardClass?.split('/').map(c => c.trim()).some(c => c === targetClass) ?? false;
    }).length;
    return count >= required;
  }

  // 場にある《X》をセンタールリグの下に置く（現在のセンタールリグがXであることを確認）
  m = cond.match(/あなたの場にある《([^》]+)》をあなたのセンタールリグの下に置く/);
  if (m) {
    const targetName = m[1];
    // 現センタールリグトップまたはアシストルリグに対象カードがあるか確認
    const centerTop = myState.field.lrig.at(-1) ? cardMap.get(myState.field.lrig.at(-1)!) : undefined;
    if (centerTop?.CardName === targetName) return true;
    const assistCards = [
      ...(myState.field.assist_lrig_l ?? []),
      ...(myState.field.assist_lrig_r ?? []),
    ].map(id => cardMap.get(id));
    return assistCards.some(c => c?.CardName === targetName);
  }

  // 場にあるカード名に《X》か《Y》を含むキーをセンタールリグの下に置く
  m = cond.match(/あなたの場にあるカード名に《([^》]+)》か《([^》]+)》を含むキー/);
  if (m) {
    const name1 = m[1], name2 = m[2];
    const keyCard = myState.field.key_piece ? cardMap.get(myState.field.key_piece) : null;
    return !!(keyCard && (keyCard.CardName.includes(name1) || keyCard.CardName.includes(name2)));
  }

  // 認識できないパターン → 条件なし扱い（WXEX1-20の不正テキスト等）
  return true;
}

// グロウ時の追加効果を実行する（ルリグデッキから置く・除外する等）
function applyGrowEffect(
  growCond: string | null,
  state: PlayerState,
  cardMap: Map<string, CardData>,
): { state: PlayerState; log: string | null } {
  if (!growCond) return { state, log: null };

  // ルリグデッキから＜X＞か＜Y＞のルリグ（＜Z＞ではない）をセンタールリグの下に置く
  let m = growCond.match(/あなたのルリグデッキから(?:＜([^＞]+)＞ではない、)?＜([^＞]+)＞か＜([^＞]+)＞のルリグ１枚(?:を公開し、それ)?をあなたのセンタールリグの下に置く/);
  if (m) {
    const excludeRaw = m[1] ?? null;
    const class1 = m[2], class2 = m[3];
    const excludeClasses = excludeRaw ? excludeRaw.split(/[／/]/).map(c => c.trim()) : [];
    const idx = state.lrig_deck.findIndex(id => {
      const card = cardMap.get(id);
      if (!card) return false;
      const classes = card.CardClass?.split('/').map(c => c.trim()) ?? [];
      if (!classes.some(c => c === class1 || c === class2)) return false;
      if (excludeClasses.length > 0 && excludeClasses.every(ec => classes.includes(ec))) return false;
      return true;
    });
    if (idx < 0) return { state, log: null };
    const chosenId = state.lrig_deck[idx];
    const newLrigDeck = state.lrig_deck.filter((_, i) => i !== idx);
    const newLrig = [chosenId, ...state.field.lrig]; // 「下に置く」= スタックの最下部
    const cardName = cardMap.get(chosenId)?.CardName ?? chosenId;
    return {
      state: { ...state, lrig_deck: newLrigDeck, field: { ...state.field, lrig: newLrig } },
      log: `グロウ効果：${cardName}をセンタールリグの下に置いた`,
    };
  }

  // ルリグデッキにある＜X＞のルリグN枚をゲームから除外する
  m = growCond.match(/あなたのルリグデッキにある＜([^＞]+)＞のルリグ([０-９\d]+)枚をゲームから除外する/);
  if (m) {
    const targetClass = m[1];
    const required = parseInt(toHalfWidth(m[2]));
    const toRemove: number[] = [];
    state.lrig_deck.forEach((id, i) => {
      if (toRemove.length >= required) return;
      const card = cardMap.get(id);
      if (card?.CardClass?.split('/').map(c => c.trim()).some(c => c === targetClass)) toRemove.push(i);
    });
    const removeSet = new Set(toRemove);
    const newLrigDeck = state.lrig_deck.filter((_, i) => !removeSet.has(i));
    return {
      state: { ...state, lrig_deck: newLrigDeck },
      log: `グロウ効果：＜${targetClass}＞のルリグ${toRemove.length}枚をゲームから除外した`,
    };
  }

  // 場にあるカード名に《X》か《Y》を含むキーをセンタールリグの下に置く
  m = growCond.match(/あなたの場にあるカード名に《([^》]+)》か《([^》]+)》を含むキー１枚をあなたのセンタールリグの下に置く/);
  if (m) {
    const name1 = m[1], name2 = m[2];
    const keyId = state.field.key_piece;
    if (!keyId) return { state, log: null };
    const keyCard = cardMap.get(keyId);
    if (!keyCard || (!keyCard.CardName.includes(name1) && !keyCard.CardName.includes(name2))) return { state, log: null };
    const newLrig = [keyId, ...state.field.lrig];
    return {
      state: { ...state, field: { ...state.field, lrig: newLrig, key_piece: null } },
      log: `グロウ効果：${keyCard.CardName}をセンタールリグの下に置いた`,
    };
  }

  // 場にある《X》をセンタールリグの下に置く（ユキ等：現センタールリグが対象のため追加処理不要）
  return { state, log: null };
}

// ルリグのグロウ互換性チェック: CardClass に共通する名前（"/"区切り）が1つでもあれば true
function lrigClassesCompatible(fromClass: string, toClass: string): boolean {
  const fromSet = new Set(fromClass.split('/').map(s => s.trim()).filter(Boolean));
  return toClass.split('/').map(s => s.trim()).some(c => fromSet.has(c));
}

// カードの Restriction チェック: "-" または空なら常に使用可。
// それ以外は「〇〇限定」形式で、現在ルリグの CardClass（"/"区切り）に含まれる名前が
// Restriction 文字列中に存在すれば使用可。
// 例: Restriction="タマ限定", lrigClass="タマ" → true
//     Restriction="タマ限定", lrigClass="タマ/イオナ" → true
//     Restriction="タマ限定", lrigClass="花代" → false
function meetsRestriction(restriction: string, lrigClass: string, ignoreRestriction = false): boolean {
  if (ignoreRestriction || !restriction || restriction === '-') return true;
  return lrigClass.split('/').map(s => s.trim()).some(cls => restriction.includes(cls));
}


// マルチエナ判定:
// 1. allMulti（WX01-027/WX05-006のような「全エナにマルチエナ付与」効果がフィールドにある）
// 2. カード自身の CONTINUOUS GRANT_KEYWORD マルチエナ（count!='ALL' = 自身のみ）
// 3. EffectText に「：【マルチエナ】」パターン（effects.json 未登録カードへのフォールバック）
// 4. keyword_grants で動的付与された場合
function isMultiEna(cardNum: string, cards: CardData[], keywordGrants?: Record<string, string[]>, allMulti?: boolean): boolean {
  if (allMulti) return true;
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));
  if (card) {
    if (card.effects?.some(e =>
      e.effectType === 'CONTINUOUS' &&
      e.action.type === 'GRANT_KEYWORD' &&
      (e.action as { keyword: string }).keyword === 'マルチエナ' &&
      (e.action as { target: { count: unknown } }).target?.count !== 'ALL'
    )) return true;
    // effects.json 未登録カード用フォールバック：
    // 「【常】：【マルチエナ】」形式（サーバント系）を EffectText から直接検出
    // WX01-027のような「【常】：あなたの〜は【マルチエナ】を持つ」は「：あ」で始まるため非一致
    if (card.EffectText?.includes('：【マルチエナ】')) return true;
  }
  return keywordGrants?.[cardNum]?.includes('マルチエナ') ?? false;
}

function canAffordGrowCost(
  energyNums: string[],
  cards: CardData[],
  growCost: string,
  keywordGrants?: Record<string, string[]>,
  allMulti?: boolean,
  colorlessOverrides?: string[],
  colorSubs?: { from: string[]; to: string }[],
  extraColorMap?: Map<string, string>,
  trashSubWilds?: Set<string>,       // エナ代替ワイルド（任意色）
  trashSubColors?: Map<string, string>, // エナ代替色指定（instId→色）
  extraWildCount?: number,            // キー代替による追加ワイルド枚数
): boolean {
  const costs = parseGrowCost(growCost);
  if (costs.length === 0) return true;
  // 色指定コストを先に処理し、マルチエナをワイルドカードとして温存する
  const sorted = [...costs].sort((a, b) => (a.color === '無' ? 1 : 0) - (b.color === '無' ? 1 : 0));
  type P = { color: string; isWild: boolean; extraColor?: string };
  let pool: P[] = energyNums.map(n => {
    const c = cards.find(cd => cd.CardNum === getCardNum(n));
    // colorless_card_overrides に含まれるカードは全ゾーンで無色扱い
    const isColorless = colorlessOverrides?.includes(getCardNum(n)) || colorlessOverrides?.includes(n);
    const isTrashWild = trashSubWilds?.has(n) === true;
    const extraColor = extraColorMap?.get(n) ?? trashSubColors?.get(n);
    return {
      color: isColorless ? '無' : (c?.Color ?? '無'),
      isWild: (!isColorless && isMultiEna(n, cards, keywordGrants, allMulti)) || isTrashWild,
      extraColor,
    };
  });
  // キーピース代替による追加ワイルド（エナ選択不要分）
  if (extraWildCount) {
    for (let i = 0; i < extraWildCount; i++) pool.push({ color: '無', isWild: true });
  }
  for (const { color, count } of sorted) {
    let needed = count;
    // まず通常カードで充当（energy_color_substitutes・追加色も考慮）
    const rem: P[] = [];
    for (const p of pool) {
      if (needed > 0 && !p.isWild) {
        const colorMatches = color === '無' || p.color === color || p.extraColor === color ||
          (colorSubs?.some(s => s.to === p.color && s.from.includes(color)));
        if (colorMatches) { needed--; continue; }
      }
      rem.push(p);
    }
    pool = rem;
    // 不足分をマルチエナで補う
    if (needed > 0) {
      const rem2: P[] = [];
      for (const p of pool) {
        if (needed > 0 && p.isWild) needed--;
        else rem2.push(p);
      }
      pool = rem2;
    }
    if (needed > 0) return false;
  }
  return true;
}

function parseCoinCost(costStr: string): number {
  if (!costStr) return 0;
  const toHalf = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF10 + 0x30));
  for (const m of costStr.matchAll(/《コイン》×([０-９\d]+)/g)) return parseInt(toHalf(m[1])) || 0;
  return 0;
}

function parseBetCost(effectText: string): number {
  if (!effectText) return 0;
  const m = effectText.match(/ベット[―─]\s*((?:《コインアイコン》)+)/);
  if (!m) return 0;
  return (m[1].match(/《コインアイコン》/g) ?? []).length;
}

// アンコールコストをパース（エナコスト＋コイン枚数）
function parseEncoreCost(effectText: string): { energy: { color: string; count: number }[]; coins: number } | null {
  if (!effectText.startsWith('アンコール－')) return null;
  const afterDash = effectText.slice('アンコール－'.length);
  // 「（」か漢字テキストの直前まで（アイコン部分のみ）
  const beforeContent = afterDash.split(/[（。【]/)[0];
  const ENERGY_COLORS = new Set(['白', '赤', '青', '緑', '黒', '無']);
  const energy: { color: string; count: number }[] = [];
  let coins = 0;
  const re = /《([^》]+)》/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(beforeContent)) !== null) {
    if (m[1] === 'コインアイコン') { coins++; continue; }
    if (ENERGY_COLORS.has(m[1])) { energy.push({ color: m[1], count: 1 }); continue; }
    const inner = m[1].match(/^([白赤青緑黒無])×([０-９0-9]+)$/);
    if (inner) {
      const cnt = parseInt(inner[2].replace(/[０-９]/g, c => String(c.charCodeAt(0) - 0x30 - 0xFEE0)));
      energy.push({ color: inner[1], count: isNaN(cnt) ? parseInt(inner[2]) : cnt });
    }
  }
  return (energy.length > 0 || coins > 0) ? { energy, coins } : null;
}

// コスト増加修正を考慮してエナを追加消費できるか確認
function canAffordWithExtraCost(
  energyNums: string[],
  cards: CardData[],
  baseCost: string,
  extraCosts: { color: string; count: number }[],
  keywordGrants?: Record<string, string[]>,
  allMulti?: boolean,
  colorlessOverrides?: string[],
  colorSubs?: { from: string[]; to: string }[],
  extraColorMap?: Map<string, string>,
  trashSubWilds?: Set<string>,
  trashSubColors?: Map<string, string>,
  extraWildCount?: number,
): boolean {
  if (extraCosts.length === 0) return canAffordGrowCost(energyNums, cards, baseCost, keywordGrants, allMulti, colorlessOverrides, colorSubs, extraColorMap, trashSubWilds, trashSubColors, extraWildCount);
  // 追加コスト分をプールから引いてから基本コストをチェック
  let pool = [...energyNums];
  for (const { color, count } of extraCosts) {
    let needed = count;
    const rem: string[] = [];
    for (const n of pool) {
      if (needed > 0) {
        const cd = cards.find(c => c.CardNum === getCardNum(n));
        const isColorless = colorlessOverrides?.includes(getCardNum(n)) || colorlessOverrides?.includes(n);
        const isTrashWild = trashSubWilds?.has(n) === true;
        const cardColor = isColorless ? '無' : (cd?.Color ?? '無');
        const extraColor = extraColorMap?.get(n) ?? trashSubColors?.get(n);
        const colorMatches = color === '無' || isTrashWild || cardColor.includes(color) || extraColor === color ||
          (colorSubs?.some(s => s.to === cardColor && s.from.includes(color)));
        if (colorMatches) { needed--; continue; }
      }
      rem.push(n);
    }
    pool = rem;
    if (needed > 0) {
      // extraWildCountで残りを補えるか
      if (extraWildCount && extraWildCount >= needed) break;
      return false;
    }
  }
  return canAffordGrowCost(pool, cards, baseCost, keywordGrants, allMulti, colorlessOverrides, colorSubs, extraColorMap, trashSubWilds, trashSubColors, extraWildCount);
}

// EnergyCost[] を growCost 文字列に変換（altCostOppTurn 用）
function energyCostToString(costs: { color: string; count: number }[]): string {
  return costs.map(e => `《${e.color}》×${e.count}`).join('');
}

const JANKEN_LABEL: Record<string, string> = { GU: 'グー✊', CHOKI: 'チョキ✌', PA: 'パー✋' };
const PHASE_LABEL: Record<string, string> = {
  UP: 'アップ', DRAW: 'ドロー', ENERGY: 'エナ', GROW: 'グロウ', MAIN: 'メイン',
  ATTACK_ARTS:    'アーツステップ(自分)',
  ATTACK_ARTS_OP: 'アーツステップ(相手)',
  ATTACK_SIGNI: 'シグニアタック', ATTACK_LRIG: 'ルリグアタック', END: 'エンド',
};

const PHASE_BTN: Record<TurnPhase, string> = {
  UP: 'ドローフェイズへ', DRAW: 'エナフェイズへ', ENERGY: 'グロウフェイズへ',
  GROW: 'メインフェイズへ', MAIN: 'アタックフェイズへ',
  ATTACK_ARTS:    'アーツ終了→相手へ',
  ATTACK_ARTS_OP: 'アーツ終了',
  ATTACK_SIGNI: 'ルリグアタックへ', ATTACK_LRIG: 'エンドフェイズへ', END: 'ターン終了',
};

const PHASE_NEXT: Record<TurnPhase, TurnPhase> = {
  UP: 'DRAW', DRAW: 'ENERGY', ENERGY: 'GROW', GROW: 'MAIN',
  MAIN: 'ATTACK_ARTS',
  ATTACK_ARTS: 'ATTACK_ARTS_OP', ATTACK_ARTS_OP: 'ATTACK_SIGNI',
  ATTACK_SIGNI: 'ATTACK_LRIG', ATTACK_LRIG: 'END', END: 'UP',
};

// 非ターンプレイヤーが進行ボタンを持つフェイズ
const NON_TURN_PLAYER_PHASES: TurnPhase[] = ['ATTACK_ARTS_OP'];

// 待機中メッセージ（自分がボタンを持たないフェイズ）
const WAITING_MSG: Partial<Record<TurnPhase, string>> = {
  ATTACK_ARTS_OP: '相手のアーツステップ待機中...',
};

const setupWrap: React.CSSProperties = {
  position: 'relative',
  height: '100vh', display: 'flex', flexDirection: 'column',
  justifyContent: 'center', alignItems: 'center',
  backgroundColor: C.bgSetup, gap: 20, color: C.textMuted,
  padding: 24, boxSizing: 'border-box',
};

const primaryBtn: React.CSSProperties = {
  padding: '12px 32px', borderRadius: 8, border: 'none',
  backgroundColor: C.accent, color: C.text, fontSize: 15,
  fontWeight: 'bold', cursor: 'pointer',
};

// ─── MulliganCard: マリガン用（タップで選択、長押しで拡大） ────────
function MulliganCard({ cardNum, cards, selected, onToggle }: {
  cardNum: string;
  cards: CardData[];
  selected: boolean;
  onToggle: () => void;
}) {
  const [enlarged, setEnlarged] = useState(false);
  const longPressed = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const card = cards.find(c => c.CardNum === getCardNum(cardNum));

  const handleStart = () => {
    longPressed.current = false;
    timer.current = setTimeout(() => {
      longPressed.current = true;
      setEnlarged(true);
      timer.current = null;
    }, 400);
  };
  const handleEnd = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
      if (!longPressed.current) onToggle();
    }
  };
  const handleCancel = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  return (
    <>
      <div
        style={{
          width: 90, height: 126, position: 'relative', flexShrink: 0, borderRadius: 6,
          overflow: 'hidden', userSelect: 'none', touchAction: 'none', boxSizing: 'border-box',
          border: selected ? C.borderMulliganSel : C.borderMulligan,
          cursor: 'pointer',
        }}
        onMouseDown={handleStart} onMouseUp={handleEnd} onMouseLeave={handleCancel}
        onTouchStart={e => { e.preventDefault(); handleStart(); }}
        onTouchEnd={e => { e.preventDefault(); handleEnd(); }}
        onTouchCancel={handleCancel}
      >
        {card ? (
          <img src={card.ImgURL} alt={card.CardName} draggable={false}
            style={{ width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none', display: 'block' }}
            onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }}
          />
        ) : (
          <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 9, color: C.textFaint, textAlign: 'center', padding: 4 }}>{cardNum}</span>
          </div>
        )}
        {selected && (
          <div style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: C.text, textShadow: '0 1px 4px #000' }}>戻す</span>
          </div>
        )}
      </div>
      {enlarged && card && <CardModal card={card} onClose={() => setEnlarged(false)} />}
    </>
  );
}

// ─── メインコンポーネント ────────────────────────────────────────────
export default function BattleScreen({ user, roomId, myDeckId, cards, onBack }: Props) {
  const [bs, setBs] = useState<BattleStateRow | null>(null);
  const [myDeckData, setMyDeckData] = useState<{ main_deck: string[]; lrig_deck: string[] } | null>(null);
  // CPU対戦用
  const [isCpuBattle, setIsCpuBattle] = useState(false);
  const [cpuDeckData, setCpuDeckData] = useState<{ main_deck: string[]; lrig_deck: string[] } | null>(null);
  const cpuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showSetupLeaveConfirm, setShowSetupLeaveConfirm] = useState(false);
  const [mulliganSelected, setMulliganSelected] = useState<Set<number>>(new Set());
  const [pendingSigniSummon, setPendingSigniSummon] = useState<{ cardNum: string; handIndex: number } | null>(null);
  const [showEnergySkipConfirm, setShowEnergySkipConfirm] = useState(false);
  const [showGrowSkipConfirm, setShowGrowSkipConfirm] = useState(false);
  const [showSigniAttackSkipConfirm, setShowSigniAttackSkipConfirm] = useState(false);
  const [showLrigAttackSkipConfirm, setShowLrigAttackSkipConfirm] = useState(false);
  const [showGrowModal, setShowGrowModal] = useState(false);
  const [pendingGrowCard, setPendingGrowCard] = useState<CardData | null>(null);
  const [selectedGrowCost, setSelectedGrowCost] = useState<Set<number>>(new Set());
  const [showArtsModal, setShowArtsModal] = useState(false);
  const [pendingArtsCard, setPendingArtsCard] = useState<CardData | null>(null);
  const [pendingArtsEffectiveCost, setPendingArtsEffectiveCost] = useState<string | null>(null);
  const [selectedArtsCost, setSelectedArtsCost] = useState<Set<number>>(new Set());
  const [selectedArtsDiscard, setSelectedArtsDiscard] = useState<Set<number>>(new Set());
  const [isBetting, setIsBetting] = useState(false);
  const [isEncore, setIsEncore] = useState(false);
  const [closeZoneSignal, setCloseZoneSignal] = useState(0);
  const [showRemoveModal, setShowRemoveModal] = useState(false);
  const [selectedRemoveZones, setSelectedRemoveZones] = useState<Set<number>>(new Set());
  const [pendingSpellCast, setPendingSpellCast] = useState<{ cardNum: string; handIndex: number } | null>(null);
  const [selectedSpellCost, setSelectedSpellCost] = useState<Set<number>>(new Set());
  const [pendingCutinCard, setPendingCutinCard] = useState<CardData | null>(null);
  const [selectedCutinCost, setSelectedCutinCost] = useState<Set<number>>(new Set());
  // シグニ起動効果
  const [pendingSigniActivated, setPendingSigniActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedSigniActivatedCost, setSelectedSigniActivatedCost] = useState<Set<number>>(new Set());
  const [selectedSigniActivatedDiscard, setSelectedSigniActivatedDiscard] = useState<Set<number>>(new Set());
  // エナゾーンのACTIVATED能力（アクセカード発動）
  const [pendingEnergyActivated, setPendingEnergyActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedEnergyActivatedCost, setSelectedEnergyActivatedCost] = useState<Set<number>>(new Set());
  // 任意コスト支払い（OPTIONAL_COST）のエナ選択
  const [selectedOptCost, setSelectedOptCost] = useState<Set<number>>(new Set());
  // シグニ出現時コスト付き任意【出】効果
  const [pendingSigniOnPlayCost, setPendingSigniOnPlayCost] = useState<{
    cardNum: string;
    costEffect: import('../types/effects').CardEffect;
    placedState: PlayerState;
    mandatoryEntries: StackEntry[];
  } | null>(null);
  const [selectedSigniOnPlayCost, setSelectedSigniOnPlayCost] = useState<Set<number>>(new Set());
  const [selectedSigniOnPlayDiscard, setSelectedSigniOnPlayDiscard] = useState<Set<number>>(new Set());
  // キーピース
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [pendingKeyCard, setPendingKeyCard] = useState<CardData | null>(null);
  const [selectedKeyCost, setSelectedKeyCost] = useState<Set<number>>(new Set());
  const [pendingKeyActivated, setPendingKeyActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedKeyActivatedCost, setSelectedKeyActivatedCost] = useState<Set<number>>(new Set());
  const [selectedKeyActivatedDiscard, setSelectedKeyActivatedDiscard] = useState<Set<number>>(new Set());
  // キーピース代替コスト（ENERGY_SUBSTITUTE_TRASH_KEY）
  const [keySubstituteEnabled, setKeySubstituteEnabled] = useState(false);
  // アシストルリグ
  const [showAssistGrowModal, setShowAssistGrowModal] = useState(false);
  const [pendingAssistGrowCard, setPendingAssistGrowCard] = useState<CardData | null>(null);
  const [pendingAssistSide, setPendingAssistSide] = useState<'l' | 'r' | null>(null);
  const [selectedAssistGrowCost, setSelectedAssistGrowCost] = useState<Set<number>>(new Set());
  const [pendingAssistActivated, setPendingAssistActivated] = useState<{ cardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedAssistActivatedCost, setSelectedAssistActivatedCost] = useState<Set<number>>(new Set());
  const [selectedAssistActivatedDiscard, setSelectedAssistActivatedDiscard] = useState<Set<number>>(new Set());
  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動
  const [pendingLrigGranted, setPendingLrigGranted] = useState<{ sourceCardNum: string; effect: import('../types/effects').CardEffect } | null>(null);
  const [selectedLrigGrantedCost, setSelectedLrigGrantedCost] = useState<Set<number>>(new Set());
  // ライフクロスクラッシュ時のカード拡大
  const [burstCardZoomed, setBurstCardZoomed] = useState(false);
  const [opCheckCardZoomed, setOpCheckCardZoomed] = useState(false); // 相手ライフクラッシュ拡大
  const [cutinSpellZoomed, setCutinSpellZoomed] = useState(false);   // スペルカットイン画面の拡大
  // 効果インタラクション：SELECT_TARGET / SEARCH / CHOOSE
  const [effectSelectedNums, setEffectSelectedNums] = useState<string[]>([]);
  // カード選択UI長押し拡大
  const [expandedPickImgUrl, setExpandedPickImgUrl] = useState<string | null>(null);
  const pickLongPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 効果スタック整列UI：自分の pending エントリの id を並べた配列
  const [stackOrderIds, setStackOrderIds] = useState<string[]>([]);
  // LOOK_AND_REORDER インタラクション：現在の並び順
  const [lookReorderOrder, setLookReorderOrder] = useState<string[]>([]);
  // アシストルリグセットアップ（センタールリグ選択後の中間状態）
  const [pendingLrigSetup, setPendingLrigSetup] = useState<{
    centerCardNum: string;
    centerInstanceId: string;
    lrigWithIds: string[];
    mainWithIds: string[];
    remainingLv0: Array<{ cardNum: string; instanceId: string; origIdx: number }>;
    assistStep: 'confirm' | 'select_l' | 'select_r';
    assistLInstanceId: string | null;
    assistLCardNum: string | null;
  } | null>(null);
  const [logExpanded, setLogExpanded] = useState(false);
  const [battleLogs, setBattleLogs] = useState<import('../types').GameLog[]>([]);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const prevTurnRef  = useRef<number | null>(null);
  // Realtime で受け取った game_logs をローカル state に同期
  const prevGameLogsLenRef = useRef<number>(0);
  // defer: true のログを main update 後に一括 flush するバッファ
  const pendingLogsRef = useRef<import('../types').GameLog[]>([]);
  useEffect(() => {
    const remote = bs?.game_logs ?? [];
    if (remote.length > prevGameLogsLenRef.current) {
      setBattleLogs(remote.slice(-200));
      prevGameLogsLenRef.current = remote.length;
    }
  }, [bs?.game_logs]);

  const appendBattleLogs = useCallback((entries: string[], opts?: { defer?: boolean }) => {
    if (entries.length === 0 || !user) return;
    const now = new Date().toISOString();
    const newLogs = entries.map(action => ({ timestamp: now, user_id: user.id, action }));
    // ローカルに即時反映
    setBattleLogs(prev => {
      const next = [...prev, ...newLogs].slice(-200);
      prevGameLogsLenRef.current = next.length;
      return next;
    });
    if (opts?.defer) {
      // DB 書き込みを pendingLogsRef にバッファ（main update 後に一括 flush）
      pendingLogsRef.current.push(...newLogs);
    } else {
      // DB に即時書き込んで相手に同期
      supabase.rpc('append_battle_logs', { p_room_id: roomId, p_logs: newLogs })
        .then(({ error }) => { if (error) console.error('[battle_log]', error.message); });
    }
  }, [roomId, user]);

  const flushBattleLogs = useCallback(async () => {
    if (pendingLogsRef.current.length === 0) return;
    const toFlush = [...pendingLogsRef.current];
    pendingLogsRef.current = [];
    const { error } = await supabase.rpc('append_battle_logs', { p_room_id: roomId, p_logs: toFlush });
    if (error) console.error('[battle_log]', error.message);
  }, [roomId]);

  const transitioningRef = useRef(false);
  const leavingRef = useRef(false);
  const stackProcessingRef        = useRef(false);  // resolveStackNext の多重実行防止
  const lastResolvedEntryIdRef    = useRef<string | null>(null); // 直前に処理したキュー先頭のID（DB伝播前の二重処理防止）
  const doPhaseAdvanceRef         = useRef<(() => Promise<void>) | null>(null);
  const triggerPendingCrashRef    = useRef<(() => Promise<void>) | null>(null);
  const resolveStackNextRef       = useRef<(() => Promise<void>) | null>(null);
  const checkPowerZeroBanishRef   = useRef<(() => Promise<void>) | null>(null);
  const lastBanishedKeyRef        = useRef<string>(''); // 直前に処理したバニッシュ候補のフィンガープリント（二重処理防止）
  const cpuTurnRef                = useRef<(() => Promise<void>) | null>(null); // CPU自動行動
  const cpuSetupRef               = useRef<(() => Promise<void>) | null>(null); // CPUセットアップ自動行動

  // フェーズ変化をバトルログに記録（アクティブプレイヤーのみDB書き込み）
  useEffect(() => {
    if (!bs) return;
    const phase = bs.turn_phase;
    const turn  = bs.turn_count;
    if (prevPhaseRef.current === phase && prevTurnRef.current === turn) return;
    if (prevPhaseRef.current !== null) {
      if (bs.active_user_id === user.id) {
        const msg = phase === 'UP'
          ? `── T${turn} あなたのターン開始 ──`
          : `[あなた] ${PHASE_LABEL[phase] ?? phase}フェイズ`;
        appendBattleLogs([msg]);
      } else if (bs.active_user_id === CPU_PLAYER_ID) {
        const msg = phase === 'UP'
          ? `── T${turn} CPUのターン開始 ──`
          : `[CPU] ${PHASE_LABEL[phase] ?? phase}フェイズ`;
        appendBattleLogs([msg]);
      }
    }
    prevPhaseRef.current = phase;
    prevTurnRef.current  = turn;
  }, [bs?.turn_phase, bs?.turn_count, bs?.active_user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    supabase.from('battle_states').select('*').eq('room_id', roomId).single()
      .then(({ data, error }) => {
        if (error) console.error('battle_states 取得エラー:', error.message);
        if (data) {
          setBs(data as BattleStateRow);
          if ((data as BattleStateRow).guest_id === CPU_PLAYER_ID) {
            setIsCpuBattle(true);
            supabase.from('rooms').select('guest_deck_id').eq('id', roomId).single()
              .then(async ({ data: rd }) => {
                if (!rd?.guest_deck_id) return;
                const { data: dd } = await supabase.from('decks')
                  .select('main_deck, lrig_deck').eq('id', rd.guest_deck_id).single();
                if (dd) setCpuDeckData(dd as { main_deck: string[]; lrig_deck: string[] });
              });
          }
        }
      });

    supabase.from('decks').select('main_deck, lrig_deck').eq('id', myDeckId).single()
      .then(({ data }) => {
        if (data) setMyDeckData(data as { main_deck: string[]; lrig_deck: string[] });
      });

    const channel = supabase
      .channel(`battle-${roomId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'battle_states', filter: `room_id=eq.${roomId}`,
      }, (payload) => { setBs(payload.new as BattleStateRow); })
      .on('postgres_changes', {
        event: 'DELETE', schema: 'public', table: 'rooms', filter: `id=eq.${roomId}`,
      }, () => {
        if (!leavingRef.current) { leavingRef.current = true; onBack(); }
      })
      .subscribe((status) => {
        // 接続後に最新データを再取得（リロード時に Realtime が間に合わない場合の対策）
        if (status === 'SUBSCRIBED') {
          supabase.from('battle_states').select('*').eq('room_id', roomId).single()
            .then(({ data }) => { if (data) setBs(data as BattleStateRow); });
        }
      });

    return () => { supabase.removeChannel(channel); };
  }, [roomId, myDeckId]);

  useEffect(() => {
    if (!bs) return;
    const isHost = user.id === bs.host_id;

    // じゃんけん結果処理（両プレイヤー共通：どちらか一方が実行）
    if (!transitioningRef.current && bs.setup_phase === 'JAN_KEN' && bs.host_janken && bs.guest_janken) {
      transitioningRef.current = true;
      const winner = jankenWinner(bs.host_janken, bs.guest_janken, bs.host_id, bs.guest_id);
      const update = winner
        ? { first_player_id: winner, setup_phase: 'LRIG_SELECT', host_janken: null as null, guest_janken: null as null }
        : { host_janken: null as null, guest_janken: null as null };
      const t = setTimeout(() => {
        supabase.from('battle_states').update(update).eq('room_id', roomId)
          .then(() => { transitioningRef.current = false; });
      }, 1800);
      return () => { clearTimeout(t); transitioningRef.current = false; };
    }

    // 以下はホストのみが担当するフェーズ遷移
    if (!isHost || transitioningRef.current) return;

    if (bs.setup_phase === 'LRIG_SELECT' && bs.host_lrig_selected && bs.guest_lrig_selected) {
      transitioningRef.current = true;
      supabase.from('battle_states').update({ setup_phase: 'MULLIGAN' }).eq('room_id', roomId)
        .then(() => { transitioningRef.current = false; });
      return () => { transitioningRef.current = false; };
    }
  }, [
    bs?.setup_phase,
    bs?.host_lrig_selected, bs?.guest_lrig_selected,
    bs?.host_janken, bs?.guest_janken,
  ]);

  // PLAYING 移行時に loading をリセット（マリガン確定後の loading=true をクリア）
  useEffect(() => {
    if (bs?.global_phase === 'PLAYING') setLoading(false);
  }, [bs?.global_phase]);

  // ── CPU 対戦：セットアップ自動行動 ──────────────────────────
  useEffect(() => {
    if (!bs || !isCpuBattle || bs.global_phase !== 'SETUP') return;
    if (bs.setup_phase === 'JAN_KEN'     && bs.guest_janken)        return;
    if (bs.setup_phase === 'LRIG_SELECT' && bs.guest_lrig_selected) return;
    if (bs.setup_phase === 'MULLIGAN'    && bs.guest_mulligan_done) return;
    if (bs.setup_phase === 'LRIG_SELECT' && !cpuDeckData)           return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { cpuSetupRef.current?.(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [isCpuBattle, bs?.setup_phase, bs?.guest_janken, bs?.guest_lrig_selected, bs?.guest_mulligan_done, cpuDeckData]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── CPU 対戦：ターン自動行動 ──────────────────────────────────
  useEffect(() => {
    if (!bs || !isCpuBattle || bs.global_phase !== 'PLAYING') return;
    if (bs.pending_effect || bs.effect_stack) return;
    // プレイヤー（人間）がライフバースト処理中はCPU停止
    if (bs.host_state?.field?.check) return;
    const cpuSt = bs.guest_state;
    const isCpuTurn = bs.active_user_id === CPU_PLAYER_ID;
    // ATTACK_ARTS_OPはCPUがターンプレイヤーのとき人間が担当→CPU動かない
    // CPUが非ターンプレイヤーのときはCPUが担当→動く
    if (bs.turn_phase === 'ATTACK_ARTS_OP' && isCpuTurn) return;
    if (!isCpuTurn && bs.turn_phase !== 'ATTACK_ARTS_OP' && !cpuSt.field?.check && !cpuSt.field?.lrig_attacked && !bs.pending_spell) return;
    if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current);
    cpuTimerRef.current = setTimeout(() => { cpuTurnRef.current?.(); }, CPU_ACTION_DELAY);
    return () => { if (cpuTimerRef.current) clearTimeout(cpuTimerRef.current); };
  }, [
    isCpuBattle, bs?.global_phase, bs?.active_user_id, bs?.turn_phase,
    bs?.guest_state?.field?.check, bs?.guest_state?.field?.lrig_attacked,
    bs?.host_state?.field?.check, bs?.host_state?.field?.lrig_attacked,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    JSON.stringify(bs?.guest_state?.field?.signi_down),
    bs?.pending_effect, !!bs?.effect_stack, !!bs?.pending_spell,
  ]);  

  // CPU対戦：CPU が respondPlayer として応答すべき pending_effect を自動解決
  // 「対戦相手は手札を捨てる」等、効果の解決をCPUが行う必要がある場合
  useEffect(() => {
    if (!isCpuBattle || !bs?.pending_effect) return;
    const pe = bs.pending_effect;
    if (pe.respondPlayerId !== CPU_PLAYER_ID) return;
    const inter = pe.interaction;
    const timer = setTimeout(() => {
      let selected: string[] = [];
      if (inter.type === 'SELECT_TARGET') {
        const count = typeof inter.count === 'number' ? inter.count : 1;
        const shuffled = [...inter.candidates].sort(() => Math.random() - 0.5);
        selected = shuffled.slice(0, Math.min(count, shuffled.length));
      } else if (inter.type === 'CHOOSE') {
        selected = inter.options.length > 0 ? [inter.options[0].id] : [];
      } else if (inter.type === 'SEARCH') {
        const count = inter.maxPick ?? 0;
        selected = inter.visibleCards.slice(0, count);
      } else if (inter.type === 'LOOK_AND_REORDER') {
        selected = [...inter.cards];
      }
      handleEffectInteraction(selected);
    }, CPU_ACTION_DELAY);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.pending_effect?.respondPlayerId, bs?.pending_effect]);

  // CPU対戦：effectスタック整列をCPUが自動確定
  useEffect(() => {
    if (!isCpuBattle || !bs?.effect_stack || loading) return;
    const stack = bs.effect_stack;
    const cpuIsTurnPlayer = bs.active_user_id === CPU_PLAYER_ID;
    const cpuNeedsOrder = cpuIsTurnPlayer
      ? (!stack.orderTurnDone && stack.pendingTurn.length > 1)
      : (!stack.orderOppDone && stack.pendingOpp.length > 1);
    if (!cpuNeedsOrder) return;
    const cpuPending = cpuIsTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
    const timer = setTimeout(async () => {
      const orderedIds = cpuPending.map(e => e.id);
      const newStack = cpuIsTurnPlayer
        ? confirmTurnOrder(stack, orderedIds)
        : confirmOppOrder(stack, orderedIds);
      await supabase.from('battle_states')
        .update({ effect_stack: isStackDone(newStack) ? null : newStack })
        .eq('room_id', roomId);
    }, CPU_ACTION_DELAY);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCpuBattle, bs?.effect_stack]);

  // ── バトルに必要なカードだけを抽出（全1万枚+ を毎回スキャンしない） ────────────
  // 自分のデッキ + bs の全ゾーンにある CardNum を収集し、大本の cards から Map を作る。
  // 大本の cards 配列は一切変更しない。
  const battleCardNums = useMemo(() => {
    const nums = new Set<string>();
    // インスタンスID（CardNum#N）からCardNumを取り出して登録
    const addAll = (arr?: string[]) => arr?.forEach(n => nums.add(getCardNum(n)));
    const addState = (s: PlayerState) => {
      addAll(s.deck); addAll(s.lrig_deck); addAll(s.hand);
      addAll(s.life_cloth); addAll(s.trash); addAll(s.lrig_trash);
      addAll(s.energy); addAll(s.field.lrig);
      s.field.signi.forEach(stack => stack?.forEach(n => nums.add(n)));
      if (s.field.check) nums.add(s.field.check);
      if (s.field.key_piece) nums.add(s.field.key_piece);
      addAll(s.field.assist_lrig_l); addAll(s.field.assist_lrig_r);
      (s.field.signi_charms ?? []).forEach(n => n && nums.add(n));
      (s.field.signi_soul   ?? []).forEach(n => n && nums.add(n));
      (s.field.signi_seeds  ?? []).forEach(n => n && nums.add(n));
      addAll(s.field.free_zone);
    };
    if (myDeckData) { addAll(myDeckData.main_deck); addAll(myDeckData.lrig_deck); }
    if (bs) { addState(bs.host_state); addState(bs.guest_state); }
    nums.add('WXDi-P07-TK01-A'); // サーバントZEROトークン（常時ロード）
    return nums;
  }, [myDeckData, bs]);

  const battleCardMap = useMemo(() => {
    const base = new InstanceMap(cards.filter(c => battleCardNums.has(c.CardNum)).map(c => [c.CardNum, c] as [string, CardData]));
    if (!bs) return base;
    const localIsHost = user.id === bs.host_id;
    const myState = localIsHost ? bs.host_state : bs.guest_state;
    const opState = localIsHost ? bs.guest_state : bs.host_state;
    const allOverrides = { ...(myState.card_identity_overrides ?? {}), ...(opState.card_identity_overrides ?? {}) };
    if (Object.keys(allOverrides).length === 0) return base;
    // card_identity_overrides: instanceId → 差し替えCardNumのカードデータに解決
    const resolved = new Map<string, CardData>(base as Map<string, CardData>);
    for (const [instanceId, overrideNum] of Object.entries(allOverrides)) {
      const overrideCard = base.get(overrideNum);
      if (overrideCard) resolved.set(instanceId, overrideCard);
    }
    return new InstanceMap(resolved);
  }, [cards, battleCardNums, bs, user.id]);

  // サブコンポーネントや既存ヘルパーに渡す配列（最大〜100枚）
  const battleCards = useMemo(() => [...battleCardMap.values()], [battleCardMap]);

  // CONTINUOUS 効果マップ（ベース: カードデータのみ、静的）
  const baseEffectsMap = useMemo(
    () => new InstanceMap(buildEffectsMap(battleCards)),
    [battleCards],
  );

  // granted_effects + under-signi付与 + card_identity_overrides を加味した augmented 効果マップ
  const effectsMap = useMemo(() => {
    if (!bs) return baseEffectsMap;
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;

    const myGranted = myS.granted_effects ?? {};
    const opGranted = opS.granted_effects ?? {};
    const hasGranted = Object.keys(myGranted).length > 0 || Object.keys(opGranted).length > 0;

    // スタックあり（ライズ）ゾーンの有無チェック
    const hasStack = [...myS.field.signi, ...opS.field.signi].some(s => s && s.length >= 2);

    // card_identity_overrides（サーバントZERO等）
    const myOverrides = myS.card_identity_overrides ?? {};
    const opOverrides = opS.card_identity_overrides ?? {};
    const hasOverrides = Object.keys(myOverrides).length > 0 || Object.keys(opOverrides).length > 0;

    if (!hasGranted && !hasStack && !hasOverrides) return baseEffectsMap;

    const augMap = new Map<string, import('../types/effects').CardEffect[]>(baseEffectsMap);

    // card_identity_overrides: ZERO化されたシグニの効果を差し替えカードの効果に設定（通常は空）
    for (const [instanceId, overrideNum] of [...Object.entries(myOverrides), ...Object.entries(opOverrides)]) {
      const overrideEffects = baseEffectsMap.get(overrideNum) ?? [];
      augMap.set(instanceId, overrideEffects);
    }

    // granted_effects の適用
    for (const [instanceId, granted] of [...Object.entries(myGranted), ...Object.entries(opGranted)]) {
      const base = augMap.get(getCardNum(instanceId)) ?? [];
      augMap.set(instanceId, [...base, ...granted]);
    }

    // under-signi → top-signi 効果付与（collectGrantedFromUnderSigni）
    if (hasStack) {
      const myUnder = collectGrantedFromUnderSigni(myS, opS, myTurn, augMap, battleCardMap);
      const opUnder = collectGrantedFromUnderSigni(opS, myS, !myTurn, augMap, battleCardMap);
      for (const [num, extra] of [...myUnder, ...opUnder]) {
        const base = augMap.get(num) ?? augMap.get(getCardNum(num)) ?? [];
        augMap.set(num, [...base, ...extra]);
      }
    }

    return new InstanceMap(augMap);
  }, [bs, baseEffectsMap, user.id, battleCardMap]);

  // フィールドシグニの有効パワー（CONTINUOUS 効果適用済み）
  const effectivePowers = useMemo(() => {
    if (!bs) return new Map<string, number>();
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    const base = calcFieldPowers(myS, opS, myTurn, effectsMap, battleCardMap);
    // lrig_attack_phase_power_down_per_signi: アタックフェイズ中に相手シグニのパワーを自シグニ数×N下げる
    const isAttackPhase = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase);
    if (isAttackPhase && (myS.lrig_attack_phase_power_down_per_signi ?? 0) > 0) {
      const friendlyCount = myS.field.signi.filter(s => s?.length).length;
      const penalty = -(myS.lrig_attack_phase_power_down_per_signi! * friendlyCount);
      const result = new Map(base);
      for (const stack of opS.field.signi) {
        const top = stack?.at(-1);
        if (top) result.set(top, (result.get(top) ?? 0) + penalty);
      }
      return result;
    }
    return base;
  }, [bs, effectsMap, battleCardMap, user.id]);

  // CONTINUOUS コスト修正（CostIncreaseAction 効果を集計）
  const activeCostMods = useMemo(() => {
    if (!bs) return { forMy: [], forOp: [] };
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return calcActiveCostMods(myS, opS, myTurn, effectsMap, battleCardMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // SPECIFIC_CARD_COST_REDUCE: 特定カード名のコスト軽減（《無×N》）を収集
  const specificCardCostReductions = useMemo(() => {
    if (!bs) return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectSpecificCardCostReductions(myS, battleCardMap, effectsMap);
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールドのシグニ・キーピース GRANT_LRIG_ABILITY + lrig_granted_auto_effects でルリグに付与された能力
  const grantedMyLrigEffects = useMemo(() => {
    if (!bs) return [];
    const localIsHost = user.id === bs.host_id;
    const myS  = localIsHost ? bs.host_state  : bs.guest_state;
    const opS  = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return [
      ...collectLrigGrantedEffects(myS, opS, myTurn, effectsMap, battleCardMap),
      ...(myS.lrig_granted_auto_effects ?? []),
    ];
  }, [bs, effectsMap, battleCardMap, user.id]);

  // フィールド（シグニ＋センタールリグ）にCONTINUOUS GRANT_KEYWORD マルチエナ（count:ALL）効果があるか
  // WX01-027（シグニ）・WX05-006（ルリグLv5）のような「全エナにマルチエナ付与」効果を検出
  const myEnaAllMulti = useMemo(() => {
    if (!bs) return false;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const hasAllMultiEffect = (cardNum: string) =>
      (effectsMap.get(cardNum) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        e.action?.type === 'GRANT_KEYWORD' &&
        (e.action as { keyword: string }).keyword === 'マルチエナ' &&
        (e.action as { target: { count: unknown } }).target?.count === 'ALL'
      );
    // シグニゾーン
    if (myS.field.signi.some(stack => { const top = stack?.at(-1); return !!top && hasAllMultiEffect(top); })) return true;
    // センタールリグ
    const lrigTop = myS.field.lrig.at(-1);
    if (lrigTop && hasAllMultiEffect(lrigTop)) return true;
    return false;
  }, [bs, effectsMap, user.id]);

  // ── Rules of Hooks 対策：PLAYING セクション由来の hooks を if(!bs)/SETUP return より前に置く ──

  // CPU対戦: ゲーム終了時にCPUのACKを自動設定
  useEffect(() => {
    if (!isCpuBattle || bs?.global_phase !== 'FINISHED' || bs?.guest_end_ack) return;
    supabase.from('battle_states').update({ guest_end_ack: true }).eq('room_id', roomId);
  }, [isCpuBattle, bs?.global_phase, bs?.guest_end_ack, roomId]);

  // CPU対戦: 両者ACK揃い次第ルームを自動削除
  useEffect(() => {
    if (!isCpuBattle || !bs?.host_end_ack || !bs?.guest_end_ack) return;
    leavingRef.current = true;
    supabase.from('battle_states').delete().eq('room_id', roomId).then(() => {
      supabase.from('rooms').delete().eq('id', roomId).then(() => onBack());
    });
  }, [isCpuBattle, bs?.host_end_ack, bs?.guest_end_ack, roomId, onBack]);

  // CONTINUOUS BLOCK_ACTION 効果によるアクション禁止（フィールド常駐効果）
  const contBlocked = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return { forSelf: new Set<string>(), forOther: new Set<string>(), cannotAttackSigni: new Set<string>() };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return calcContinuousBlockedActions(myS, opS, myTurn, effectsMap, battleCardMap);
   
  }, [bs, effectsMap, battleCardMap, user.id]);

  // LOSE_COLOR_ALL_ZONES: チームルリグ3体未満→全ゾーン色喪失カードのリスト
  const myColorlessOverrides = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as string[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    return collectColorlessOverrides(myS, opS, battleCardMap).ownerColorless;
   
  }, [bs, battleCardMap, user.id]);

  // PREVENT_ZONE_MOVE_BY_OPP はresolveStackNext内でotherProtectedZonesとして動的計算

  // 英知CONTINUOUS STUB効果: SUPPRESS_LIFE_BURST_ON_CRASH など（動的チェック）
  const eichiSuppressActive = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return false;
    const localIsHost = user.id === bs.host_id;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const myTurn = bs.active_user_id === user.id;
    // 相手（op）のフィールドで英知条件を満たす SUPPRESS_LIFE_BURST_ON_CRASH があるか
    return collectEichiStubEffects(opS, battleCardMap, effectsMap, myS, !myTurn)
      .includes('SUPPRESS_LIFE_BURST_ON_CRASH');
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  // ENERGY_COLOR_SUBSTITUTE: 色代替ルール（動的計算）
  const myColorSubs = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as { from: string[]; to: string }[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectEnergyColorSubs(myS, battleCardMap, effectsMap);
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  // エナ代替トラッシュ系CONTINUOUS効果（ENERGY_*_TRASH_*）情報
  const myEnergyTrashSubInfo = useMemo(() => {
    const empty = { wildcardInstIds: new Set<string>(), colorOverrideMap: new Map<string, string>(), keySubInstId: null as string | null };
    if (!bs || bs.global_phase !== 'PLAYING') return empty;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectEnergyTrashSubstituteInfo(myS, battleCardMap, effectsMap);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // FIELD_ENERGY_SIGNI_GAIN_COLOR: エナゾーンの追加色マップ（instId -> 追加色）
  // ALL_ZONE_BLACK / ALL_CARDS_COLOR_CHANGE_BLACK も考慮
  const myEnergyExtraColors = useMemo((): Map<string, string> => {
    const map = new Map<string, string>();
    if (!bs || bs.global_phase !== 'PLAYING') return map;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    for (const { gainColor, instIds } of collectFieldEnergySigniColorGains(myS, battleCardMap, effectsMap)) {
      for (const id of instIds) map.set(id, gainColor);
    }
    // ALL_ZONE_BLACK: 全ゾーンで黒でもあるカードをエナ内で黒追加
    const allZoneBlackNums = collectAllZoneBlackCardNums(effectsMap);
    const allMyCardsBlack = hasAllCardsColorBlack(myS, opS, myTurn, effectsMap, battleCardMap);
    if (allZoneBlackNums.size > 0 || allMyCardsBlack) {
      for (const instId of myS.energy) {
        const baseNum = getCardNum(instId);
        const card = battleCardMap.get(baseNum);
        const currentColor = card?.Color ?? '無';
        if (!currentColor.includes('黒') && !map.has(instId)) {
          if (allMyCardsBlack || allZoneBlackNums.has(baseNum)) map.set(instId, '黒');
        }
      }
    }
    return map;
  }, [bs, battleCardMap, effectsMap, user.id]);

  // COPY_LRIG_NAME_ABILITY (CONT): センタールリグの名前エイリアスリスト
  const myLrigNameAliases = useMemo((): string[] => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    return collectLrigNameAliases(myS, battleCardMap, effectsMap, opS);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // ARTS_COST_REDUCTION_BY_COST_THRESHOLD: コスト閾値によるアーツコスト軽減
  const myArtsThresholdReductions = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return [] as { minTotalCost: number; color: string; reduction: number }[];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    return collectArtsThresholdCostReductions(myS, battleCardMap, effectsMap);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // OPP_LRIG_ATTACK_COST: 自分がルリグアタックする際に支払う追加コスト（相手フィールドの効果による）
  const myLrigAttackExtraCost = useMemo((): number => {
    if (!bs || bs.global_phase !== 'PLAYING') return 0;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    // 相手フィールドのOPP_LRIG_ATTACK_COSTが自分ターン中にアクティブな場合、自分が追加コスト支払い
    return collectOppLrigAttackExtraCost(opS, myS, battleCardMap, effectsMap, !myTurn);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // HAND_SIZE_INCREASE / REDUCE_OPP_HAND_LIMIT: 実効手札上限（自分のターン終了時に適用）
  const myEffectiveHandLimit = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return 6;
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    return collectHandLimits(myS, opS, battleCardMap, effectsMap);
   
  }, [bs, battleCardMap, effectsMap, user.id]);

  // HAND_SIGNI_HAS_GUARD_ICON: 手札の特定クラスのシグニがガード可能
  const myHandGuardClasses = useMemo((): string[] => {
    if (!bs || bs.global_phase !== 'PLAYING') return [];
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return collectHandGuardIconClasses(myS, battleCardMap, effectsMap, opS, myTurn);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // CENTER_LRIG_COLOR_CHANGE_BLACK / LRIG_LIMIT_UP_AND_COLOR_GAIN: ルリグの色・リミット変更
  const myLrigColorAndLimitMods = useMemo(() => {
    if (!bs || bs.global_phase !== 'PLAYING') return { extraColors: [] as string[], limitDelta: 0 };
    const localIsHost = user.id === bs.host_id;
    const myS = localIsHost ? bs.host_state : bs.guest_state;
    const opS = localIsHost ? bs.guest_state : bs.host_state;
    const myTurn = bs.active_user_id === user.id;
    return collectLrigColorAndLimitMods(myS, battleCardMap, effectsMap, opS, myTurn);
  }, [bs, battleCardMap, effectsMap, user.id]);

  // pending_effectが変わったらカード選択をリセット（別効果の選択状態が残らないように）
  useEffect(() => {
    setEffectSelectedNums([]);
    if (!bs?.pending_effect) return;
    const inter = bs.pending_effect.interaction;
    if (inter.type === 'LOOK_AND_REORDER') {
      setLookReorderOrder(prev => {
        const same = prev.length === inter.cards.length && prev.every((n, i) => n === inter.cards[i]);
        return same ? prev : [...inter.cards];
      });
    }
   
  }, [bs?.pending_effect]);

  // 効果スタック整列UI の更新
  useEffect(() => {
    if (!bs?.effect_stack || !user) { setStackOrderIds([]); return; }
    const stack = bs.effect_stack;
    const isTurnPlayer = bs.active_user_id === user.id;
    const myPending = isTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
    const needOrder = isTurnPlayer ? !stack.orderTurnDone : !stack.orderOppDone;
    if (needOrder && myPending.length > 1) {
      setStackOrderIds(prev => {
        const prevSet = new Set(prev);
        const same = myPending.length === prev.length && myPending.every(e => prevSet.has(e.id));
        return same ? prev : myPending.map(e => e.id);
      });
    } else {
      setStackOrderIds([]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack]);

  // キューが解決可能になったらターンプレイヤーが自動解決
  useEffect(() => {
    if (!bs || !user) return;
    const stack = bs.effect_stack;
    if (!stack) return;
    if (!isReadyToResolve(stack)) return;
    if (stack.queue.length === 0) return;
    if (bs.pending_effect) return;
    if (loading) return;
    // ターンプレイヤーが自分か、キュー先頭のエフェクト所有者が自分の場合に解決する
    // （相手ターン中の自分のライフバーストなど、非ターンプレイヤーのエフェクトにも対応）
    const firstEntry = stack.queue[0];
    if (bs.active_user_id !== user.id && firstEntry?.playerId !== user.id) return;
    // 相手のチェックゾーンにカードがある（バースト処理待ち）間はスタック解決を停止
    // ※ CPUバトルでは相手（CPU）はスタック解決後に自動処理するためブロックしない
    const isLocalHost = user.id === bs.host_id;
    const opStateForCheck = isLocalHost ? bs.guest_state : bs.host_state;
    if (!isCpuBattle && opStateForCheck.field?.check) return;
    resolveStackNextRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, loading, bs?.host_state, bs?.guest_state]);

  // pending_life_crashes の自動消化
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (localMy.field?.check) return;
    if (!(localMy.pending_crashed_cards?.length ?? 0)) return;
    triggerPendingCrashRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, loading, bs?.host_state, bs?.guest_state, bs?.global_phase]);

  // パワー0以下シグニの自動バニッシュ
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;
    if (loading) return;
    if (bs.active_user_id !== user.id) return;
    checkPowerZeroBanishRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.effect_stack, bs?.pending_effect, loading, bs?.host_state, bs?.guest_state, bs?.global_phase, bs?.active_user_id]);

  // ATTACH_ACCE完了後にacce_just_doneフラグを検出してON_ACCEトリガーを発火
  // my は後で定義されるため bs から直接参照（isHost も後定義のため bs から計算）
  const acceJustDoneRef = (user && bs)
    ? (user.id === bs.host_id ? bs.host_state?.acce_just_done : bs.guest_state?.acce_just_done)
    : undefined;
  useEffect(() => {
    if (!bs || !user || !acceJustDoneRef || loading) return;
    if (bs.active_user_id !== user.id) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const hostCardNum = acceJustDoneRef;
    const localIsHost = user.id === bs.host_id;
    const localMy: PlayerState = localIsHost ? bs.host_state : bs.guest_state;
    const stateKey = localIsHost ? 'host_state' : 'guest_state';
    const cleared: PlayerState = { ...localMy, acce_just_done: null };
    (async () => {
      setLoading(true);
      try {
        await supabase.from('battle_states').update({ [stateKey]: cleared }).eq('room_id', roomId);
        await checkAndFireOnAcceTriggersForOwner(cleared, hostCardNum);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acceJustDoneRef, bs?.effect_stack, bs?.pending_effect, loading]);

  // ON_TURN_END 解決後の自動フェーズ進行
  useEffect(() => {
    if (!bs || !user) return;
    if (bs.global_phase !== 'PLAYING') return;
    if (bs.turn_phase !== 'END') return;
    const localIsMyTurn = bs.active_user_id === user.id;
    if (!localIsMyTurn || loading) return;
    if (bs.effect_stack || bs.pending_effect) return;
    const localIsHost = user.id === bs.host_id;
    const localMy = localIsHost ? bs.host_state : bs.guest_state;
    if (!(localMy.actions_done?.includes('__TURN_END__'))) return;
    doPhaseAdvanceRef.current?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bs?.turn_phase, bs?.effect_stack, bs?.pending_effect, loading, bs?.global_phase, bs?.active_user_id, bs?.host_state, bs?.guest_state]);

  if (!bs) return (
    <div style={{ height: '100vh', display: 'flex', justifyContent: 'center', alignItems: 'center', backgroundColor: C.bgSetup, color: C.text }}>
      読み込み中...
    </div>
  );

  const isHost = user.id === bs.host_id;

  // CPU セットアップ自動行動（SETUPブロックより前に定義・代入が必要）
  const cpuSetupAction = async () => {
    if (!bs) return;
    const phase = bs.setup_phase;

    if (phase === 'JAN_KEN') {
      const choices = ['GU', 'CHOKI', 'PA'];
      const pick = choices[Math.floor(Math.random() * 3)];
      await supabase.from('battle_states').update({ guest_janken: pick }).eq('room_id', roomId);
      return;
    }

    if (phase === 'LRIG_SELECT' && cpuDeckData) {
      const lrigWithIds = assignGuestInstanceIds(cpuDeckData.lrig_deck);
      const mainWithIds = assignGuestInstanceIds(shuffle(cpuDeckData.main_deck));
      const lv0Idx = cpuDeckData.lrig_deck.findIndex(num => {
        const c = cards.find(card => card.CardNum === num);
        return c?.Type === 'ルリグ' && c.Level === '0';
      });
      if (lv0Idx < 0) return;
      const selectedId = lrigWithIds[lv0Idx];
      const lrigDeckIds = lrigWithIds.filter((_, i) => i !== lv0Idx);
      const cpuState: PlayerState = {
        life_cloth: [], hand: mainWithIds.slice(0, 5), deck: mainWithIds.slice(5),
        lrig_deck: lrigDeckIds, trash: [], lrig_trash: [], energy: [], coins: 0,
        field: { lrig: [selectedId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
      };
      await supabase.from('battle_states').update({
        guest_lrig_selected: cpuDeckData.lrig_deck[lv0Idx],
        guest_state: cpuState,
      }).eq('room_id', roomId);
      return;
    }

    if (phase === 'MULLIGAN') {
      const cpuSt = bs.guest_state;
      const newLifeCloth = cpuSt.deck.slice(0, 7);
      const newDeck = cpuSt.deck.slice(7);
      const newCpuSt: PlayerState = { ...cpuSt, deck: newDeck, life_cloth: newLifeCloth };
      await supabase.from('battle_states').update({
        guest_state: newCpuSt,
        guest_mulligan_done: true,
      }).eq('room_id', roomId);
      const { data: fresh } = await supabase
        .from('battle_states').select('host_mulligan_done, guest_mulligan_done, first_player_id')
        .eq('room_id', roomId).single();
      if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
        await supabase.from('battle_states').update({
          global_phase: 'PLAYING',
          setup_phase: null,
          active_user_id: fresh.first_player_id as string,
        }).eq('room_id', roomId);
      }
    }
  };
  cpuSetupRef.current = cpuSetupAction;

  // ══════════════════════════════════════════
  // SETUP フェイズ
  // ══════════════════════════════════════════

  const handleSetupLeave = async () => {
    setShowSetupLeaveConfirm(false);
    leavingRef.current = true;
    await supabase.from('battle_states').delete().eq('room_id', roomId);
    await supabase.from('rooms').delete().eq('id', roomId);
    onBack();
  };

  const setupLeaveBtn = (
    <div style={{ position: 'absolute', top: 14, right: 14, display: 'flex', gap: 6 }}>
      <button
        onClick={() => window.location.reload()}
        style={{
          padding: '5px 12px', borderRadius: 6, border: '1px solid #444',
          backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer',
        }}
      >
        ↺
      </button>
      <button
        onClick={() => setShowSetupLeaveConfirm(true)}
        style={{
          padding: '5px 12px', borderRadius: 6, border: '1px solid #444',
          backgroundColor: 'transparent', color: '#888', fontSize: 13, cursor: 'pointer',
        }}
      >
        終了
      </button>
    </div>
  );

  const setupLeaveConfirmModal = showSetupLeaveConfirm && (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
      display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
    }}>
      <div style={{
        backgroundColor: '#1a1a2e', border: '1px solid #444', borderRadius: 10,
        padding: '28px 32px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 16,
      }}>
        <p style={{ color: '#ccc', margin: 0, fontSize: 15 }}>ルームを削除して終了しますか？</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button onClick={handleSetupLeave}
            style={{ padding: '8px 28px', borderRadius: 6, border: 'none', backgroundColor: '#c0392b', color: '#fff', fontSize: 14, cursor: 'pointer', fontWeight: 'bold' }}>
            終了する
          </button>
          <button onClick={() => setShowSetupLeaveConfirm(false)}
            style={{ padding: '8px 28px', borderRadius: 6, border: '1px solid #444', backgroundColor: 'transparent', color: '#aaa', fontSize: 14, cursor: 'pointer' }}>
            キャンセル
          </button>
        </div>
      </div>
    </div>
  );

  if (bs.global_phase === 'SETUP') {

    // ① じゃんけん
    if (bs.setup_phase === 'JAN_KEN') {
      const myJanken = isHost ? bs.host_janken : bs.guest_janken;
      const opJanken = isHost ? bs.guest_janken : bs.host_janken;

      const handleJanken = async (choice: string) => {
        if (loading || myJanken) return;
        setLoading(true);
        try {
          const myUpdate = isHost ? { host_janken: choice } : { guest_janken: choice };
          await supabase.from('battle_states').update(myUpdate).eq('room_id', roomId);

          const { data: fresh } = await supabase
            .from('battle_states').select('host_janken, guest_janken')
            .eq('room_id', roomId).single();

          if (fresh?.host_janken && fresh?.guest_janken && !transitioningRef.current) {
            transitioningRef.current = true;
            const winner = jankenWinner(fresh.host_janken, fresh.guest_janken, bs.host_id, bs.guest_id);
            const transUpdate: Partial<BattleStateRow> = winner
              ? { first_player_id: winner, setup_phase: 'LRIG_SELECT', host_janken: null, guest_janken: null }
              : { host_janken: null, guest_janken: null };
            await new Promise(resolve => setTimeout(resolve, 1800));
            await supabase.from('battle_states').update(transUpdate).eq('room_id', roomId);
            transitioningRef.current = false;
          }
        } finally {
          setLoading(false);
        }
      };

      if (myJanken && opJanken) {
        const hostChoice = isHost ? myJanken : opJanken;
        const guestChoice = isHost ? opJanken : myJanken;
        const winner = jankenWinner(hostChoice, guestChoice, bs.host_id, bs.guest_id);
        const iWon = winner === user.id;
        return (
          <>{setupLeaveConfirmModal}<div style={setupWrap}>
            <h2 style={{ color: C.text, margin: 0 }}>じゃんけん結果</h2>
            <p style={{ margin: 0 }}>あなた: {JANKEN_LABEL[myJanken]}   相手: {JANKEN_LABEL[opJanken]}</p>
            {winner ? (
              <>
                <p style={{ color: iWon ? C.success : C.danger, fontSize: 24, fontWeight: 'bold', margin: 0 }}>
                  {iWon ? '勝ち！先攻です' : '負け…後攻です'}
                </p>
                <p style={{ color: C.textFaint, fontSize: 13, margin: '8px 0 0' }}>次のフェイズへ移行中...</p>
              </>
            ) : (
              <>
                <p style={{ color: C.aiko, fontSize: 28, fontWeight: 'bold', margin: 0 }}>あいこ！</p>
                <p style={{ color: C.textDim, fontSize: 14, margin: '8px 0 0' }}>もう一度選んでください...</p>
              </>
            )}
            {setupLeaveBtn}
          </div></>
        );
      }

      if (myJanken) return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけん</h2>
          <p style={{ color: C.success }}>あなた: {JANKEN_LABEL[myJanken]}</p>
          <p style={{ color: C.textFaint }}>相手の選択を待っています...</p>
          {setupLeaveBtn}
        </div></>
      );

      return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>じゃんけんで先攻後攻を決めます</h2>
          <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>出す手を選んでください</p>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['GU', 'CHOKI', 'PA'] as const).map(c => (
              <button key={c} onClick={() => handleJanken(c)} disabled={loading}
                style={{ ...primaryBtn, fontSize: 20, padding: '20px 28px' }}>
                {JANKEN_LABEL[c]}
              </button>
            ))}
          </div>
          {setupLeaveBtn}
        </div></>
      );
    }

    // ② ルリグ選択
    if (bs.setup_phase === 'LRIG_SELECT') {
      const mySelected = isHost ? bs.host_lrig_selected : bs.guest_lrig_selected;

      if (mySelected) return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>ルリグ配置完了</h2>
          <p style={{ color: C.success }}>相手の準備を待っています...</p>
          <p style={{ color: C.textDim, fontSize: 13 }}>配置: {battleCardMap.get(mySelected)?.CardName ?? mySelected}</p>
          {setupLeaveBtn}
        </div></>
      );

      if (!myDeckData) return <div style={setupWrap}><p>デッキ読み込み中...</p></div>;

      const lv0Lrigs = myDeckData.lrig_deck
        .filter((num, i, arr) => arr.indexOf(num) === i)
        .map(num => battleCardMap.get(num))
        .filter((c): c is CardData => !!c && c.Type === 'ルリグ' && c.Level === '0');

      const handleSelectLrig = async (cardNum: string) => {
        if (loading) return;
        setLoading(true);
        // ゲストはホストとinstance IDが衝突しないよう #g プレフィックスを使う
        const assignFn = isHost ? assignInstanceIds : assignGuestInstanceIds;
        // インスタンスIDを付与（シャッフル後のmainDeckとlrigDeck全体に連番を振る）
        const mainWithIds  = assignFn(shuffle(myDeckData.main_deck));
        const lrigWithIds  = assignFn(myDeckData.lrig_deck);
        // 選択されたルリグのインスタンスIDを取得
        const selOrigIdx   = myDeckData.lrig_deck.indexOf(cardNum);
        const selectedId   = selOrigIdx >= 0 ? lrigWithIds[selOrigIdx] : `${cardNum}#1`;

        // Lv0ルリグが3枚以上ならアシスト配置フローへ（アシストゾーンの基底は通常ルリグ）
        const allLv0Indices = myDeckData.lrig_deck
          .map((num, i) => {
            const c = battleCardMap.get(num);
            return c && c.Type === 'ルリグ' && c.Level === '0' ? i : -1;
          })
          .filter(i => i >= 0);

        if (allLv0Indices.length >= 3) {
          const remainingLv0 = allLv0Indices
            .filter(i => i !== selOrigIdx)
            .map(i => ({ cardNum: myDeckData.lrig_deck[i], instanceId: lrigWithIds[i], origIdx: i }));
          setPendingLrigSetup({
            centerCardNum: cardNum,
            centerInstanceId: selectedId,
            lrigWithIds,
            mainWithIds,
            remainingLv0,
            assistStep: 'confirm',
            assistLInstanceId: null,
            assistLCardNum: null,
          });
          setLoading(false);
          return;
        }

        // Lv0ルリグ1〜2枚：アシストなしで通常セットアップ
        const lrigDeckIds  = lrigWithIds.filter((_, i) => i !== selOrigIdx);
        const myState: PlayerState = {
          life_cloth: [], hand: mainWithIds.slice(0, 5), deck: mainWithIds.slice(5),
          lrig_deck: lrigDeckIds,
          trash: [], lrig_trash: [], energy: [], coins: 0,
          field: { lrig: [selectedId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
        };
        const update = isHost
          ? { host_lrig_selected: cardNum, host_state: myState }
          : { guest_lrig_selected: cardNum, guest_state: myState };
        await supabase.from('battle_states').update(update).eq('room_id', roomId);
        setLoading(false);
      };

      // アシストルリグセットアップフロー
      if (pendingLrigSetup) {
        const setup = pendingLrigSetup;
        const centerCard = battleCardMap.get(setup.centerCardNum);

        const confirmNoAssist = async () => {
          setLoading(true);
          const lrigDeckIds = setup.lrigWithIds.filter(id => id !== setup.centerInstanceId);
          const myState: PlayerState = {
            life_cloth: [], hand: setup.mainWithIds.slice(0, 5), deck: setup.mainWithIds.slice(5),
            lrig_deck: lrigDeckIds,
            trash: [], lrig_trash: [], energy: [], coins: 0,
            field: { lrig: [setup.centerInstanceId], signi: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
          };
          const update = isHost
            ? { host_lrig_selected: setup.centerCardNum, host_state: myState }
            : { guest_lrig_selected: setup.centerCardNum, guest_state: myState };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
          setPendingLrigSetup(null);
          setLoading(false);
        };

        const selectAssistL = (instanceId: string, cardNum: string) => {
          setPendingLrigSetup({ ...setup, assistStep: 'select_r', assistLInstanceId: instanceId, assistLCardNum: cardNum });
        };

        const selectAssistR = async (instanceId: string) => {
          if (!setup.assistLInstanceId) return;
          setLoading(true);
          const usedIds = new Set([setup.centerInstanceId, setup.assistLInstanceId, instanceId]);
          const lrigDeckIds = setup.lrigWithIds.filter(id => !usedIds.has(id));
          const myState: PlayerState = {
            life_cloth: [], hand: setup.mainWithIds.slice(0, 5), deck: setup.mainWithIds.slice(5),
            lrig_deck: lrigDeckIds,
            trash: [], lrig_trash: [], energy: [], coins: 0,
            field: {
              lrig: [setup.centerInstanceId],
              signi: [null, null, null],
              assist_lrig_l: [setup.assistLInstanceId],
              assist_lrig_r: [instanceId],
              check: null, key_piece: null, free_zone: [],
            },
          };
          const update = isHost
            ? { host_lrig_selected: setup.centerCardNum, host_state: myState }
            : { guest_lrig_selected: setup.centerCardNum, guest_state: myState };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);
          setPendingLrigSetup(null);
          setLoading(false);
        };

        const btnStyle = { padding: '12px 20px', borderRadius: 8, cursor: 'pointer', border: C.borderUIMid, backgroundColor: C.bgButton, color: C.text, fontSize: 14, textAlign: 'left' as const };

        if (setup.assistStep === 'confirm') {
          return (
            <div style={setupWrap}>
              <h2 style={{ color: C.text, margin: 0 }}>アシストルリグを配置しますか？</h2>
              <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>
                センター: {centerCard?.CardName ?? setup.centerCardNum}
              </p>
              <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                ルリグを配置する枚数は1枚（センターのみ）か3枚（センター＋アシスト左右）です
              </p>
              <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
                <button onClick={() => setPendingLrigSetup({ ...setup, assistStep: 'select_l' })} disabled={loading}
                  style={{ ...btnStyle, backgroundColor: C.accent, fontWeight: 'bold' }}>
                  配置する（3枚）
                </button>
                <button onClick={confirmNoAssist} disabled={loading} style={btnStyle}>
                  配置しない（1枚）
                </button>
              </div>
            </div>
          );
        }

        if (setup.assistStep === 'select_l') {
          return (
            <div style={setupWrap}>
              <h2 style={{ color: C.text, margin: 0 }}>アシストルリグ（左）を選択</h2>
              <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>
                センター: {centerCard?.CardName ?? setup.centerCardNum}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
                {setup.remainingLv0.map(({ cardNum, instanceId }) => {
                  const c = battleCardMap.get(cardNum);
                  return (
                    <button key={instanceId} onClick={() => selectAssistL(instanceId, cardNum)} disabled={loading}
                      style={btnStyle}>
                      {c?.CardName ?? cardNum}
                      <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{cardNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }

        if (setup.assistStep === 'select_r') {
          const assistLCard = battleCardMap.get(setup.assistLCardNum ?? '');
          const remainingForR = setup.remainingLv0.filter(({ instanceId }) => instanceId !== setup.assistLInstanceId);
          return (
            <div style={setupWrap}>
              <h2 style={{ color: C.text, margin: 0 }}>アシストルリグ（右）を選択</h2>
              <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>
                センター: {centerCard?.CardName ?? setup.centerCardNum}
                　左: {assistLCard?.CardName ?? setup.assistLCardNum}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
                {remainingForR.map(({ cardNum, instanceId }) => {
                  const c = battleCardMap.get(cardNum);
                  return (
                    <button key={instanceId} onClick={() => selectAssistR(instanceId)} disabled={loading}
                      style={btnStyle}>
                      {c?.CardName ?? cardNum}
                      <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{cardNum}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        }
      }

      return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>センタールリグを配置</h2>
          <p style={{ color: C.textDim, margin: 0, fontSize: 13 }}>Lv0ルリグを選ぶとデッキをシャッフルして手札5枚を引きます</p>
          {lv0Lrigs.length === 0 ? (
            <p style={{ color: '#f44' }}>Lv0ルリグが見つかりません。デッキを確認してください。</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto', width: 300 }}>
              {lv0Lrigs.map(card => (
                <button key={card.CardNum} onClick={() => handleSelectLrig(card.CardNum)} disabled={loading}
                  style={{ padding: '12px 20px', borderRadius: 8, cursor: 'pointer', border: C.borderUIMid, backgroundColor: C.bgButton, color: C.text, fontSize: 14, textAlign: 'left' }}>
                  {card.CardName}
                  <span style={{ color: C.textFaint, fontSize: 11, marginLeft: 8 }}>{card.CardNum}</span>
                </button>
              ))}
            </div>
          )}
          {setupLeaveBtn}
        </div></>
      );
    }

    // ③ マリガン（カード画像で選択）
    if (bs.setup_phase === 'MULLIGAN') {
      const myState: PlayerState = isHost ? bs.host_state : bs.guest_state;
      const myDone = isHost ? bs.host_mulligan_done : bs.guest_mulligan_done;
      const iAmFirst = bs.first_player_id === user.id;

      if (myDone) return (
        <>{setupLeaveConfirmModal}<div style={setupWrap}>
          <h2 style={{ color: C.text, margin: 0 }}>マリガン完了</h2>
          <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', fontSize: 18, margin: 0 }}>
            {iAmFirst ? '先攻です' : '後攻です'}
          </p>
          <p style={{ color: C.textFaint }}>相手の確認を待っています...</p>
          {setupLeaveBtn}
        </div></>
      );

      const toggleCard = (i: number) => setMulliganSelected(prev => {
        const next = new Set(prev);
        if (next.has(i)) next.delete(i); else next.add(i);
        return next;
      });

      const handleConfirm = async () => {
        if (loading) return;
        setLoading(true);
        try {
          let newHand = [...myState.hand];
          let newDeck = [...myState.deck];

          if (mulliganSelected.size > 0) {
            const returning = [...mulliganSelected].map(i => myState.hand[i]);
            const keeping = myState.hand.filter((_, i) => !mulliganSelected.has(i));
            newDeck = shuffle([...newDeck, ...returning]);
            newHand = [...keeping, ...newDeck.slice(0, returning.length)];
            newDeck = newDeck.slice(returning.length);
          }

          const newLifeCloth = newDeck.slice(0, 7);
          newDeck = newDeck.slice(7);

          const newState: PlayerState = { ...myState, hand: newHand, deck: newDeck, life_cloth: newLifeCloth };
          const update = isHost
            ? { host_state: newState, host_mulligan_done: true }
            : { guest_state: newState, guest_mulligan_done: true };
          await supabase.from('battle_states').update(update).eq('room_id', roomId);

          // 最新状態を取得して両者が完了しているか確認
          const { data: fresh } = await supabase
            .from('battle_states')
            .select('host_mulligan_done, guest_mulligan_done, first_player_id')
            .eq('room_id', roomId)
            .single();

          if (fresh?.host_mulligan_done && fresh?.guest_mulligan_done) {
            // 両者完了 → 自分が直接 PLAYING へ遷移させる（両プレイヤーとも送信して確実に反映）
            const playingUpdate = {
              global_phase: 'PLAYING' as const,
              setup_phase: null as null,
              active_user_id: fresh.first_player_id as string,
            };
            await supabase.from('battle_states').update(playingUpdate).eq('room_id', roomId);
          }
        } finally {
          setLoading(false);
        }
      };

      return (
        <>{setupLeaveConfirmModal}<div style={{ ...setupWrap, justifyContent: 'flex-start', paddingTop: 32, overflowY: 'auto' }}>
          <h2 style={{ color: C.text, margin: 0, flexShrink: 0 }}>マリガン</h2>
          <p style={{ color: iAmFirst ? C.accent : C.textAlt, fontWeight: 'bold', margin: 0, flexShrink: 0 }}>
            {iAmFirst ? '先攻' : '後攻'}
          </p>
          <p style={{ color: C.textDim, margin: 0, fontSize: 12, textAlign: 'center', flexShrink: 0 }}>
            タップで選択（戻す）/ 長押しで拡大
          </p>
          {/* カード画像グリッド */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', flexShrink: 0 }}>
            {myState.hand.map((cardNum, i) => (
              <MulliganCard
                key={i}
                cardNum={cardNum}
                cards={battleCards}
                selected={mulliganSelected.has(i)}
                onToggle={() => toggleCard(i)}
              />
            ))}
          </div>
          {mulliganSelected.size > 0 && (
            <p style={{ color: '#f44', fontSize: 12, margin: 0, flexShrink: 0 }}>
              {mulliganSelected.size}枚を戻して引き直します
            </p>
          )}
          <div style={{ display: 'flex', gap: 12, flexShrink: 0 }}>
            {mulliganSelected.size > 0 ? (
              <button onClick={handleConfirm} disabled={loading}
                style={{ ...primaryBtn, backgroundColor: C.dangerDark }}>
                {mulliganSelected.size}枚引き直す
              </button>
            ) : (
              <button onClick={handleConfirm} disabled={loading} style={primaryBtn}>
                このままでOK
              </button>
            )}
          </div>
          {setupLeaveBtn}
        </div></>
      );
    }
  }

  // ══════════════════════════════════════════
  // PLAYING フェイズ
  // ══════════════════════════════════════════
  const my = isHost ? bs.host_state : bs.guest_state;
  const op = isHost ? bs.guest_state : bs.host_state;
  const isMyTurn = bs.active_user_id === user.id;
  // このフェイズの進行ボタンを自分が持つか
  const iControlThisPhase = NON_TURN_PLAYER_PHASES.includes(bs.turn_phase) ? !isMyTurn : isMyTurn;

  // blocked_actions（一時的封じ）＋ CONTINUOUS 効果の両方を考慮した禁止チェック
  const isActionBlocked = (actionId: string) =>
    (my.blocked_actions?.some(a => a === actionId) ?? false) || contBlocked.forSelf.has(actionId);

  // ドロー枚数（先攻1ターン目=1枚、それ以外=2枚）
  const drawCount = bs.turn_count === 1 && bs.active_user_id === bs.first_player_id ? 1 : 2;

  // ─── バニッシュ・ターントリガー ヘルパー ─────────────────────────────

  /**
   * バニッシュ前後の PlayerState を比較し、フィールドトップが変わってエナゾーンへ移動した
   * カードをバニッシュ済みとして返す。
   */
  const detectBanishedSigni = (before: PlayerState, after: PlayerState): string[] => {
    const result: string[] = [];
    for (let i = 0; i < 3; i++) {
      const beforeTop = (before.field.signi[i] ?? []).at(-1);
      const afterTop  = (after.field.signi[i] ?? []).at(-1);
      if (!beforeTop || beforeTop === afterTop) continue;
      if (after.energy.includes(beforeTop)) result.push(beforeTop);
    }
    return result;
  };

  // トラッシュからエナゾーンに移動したカードを検出（ON_ENERGY_FROM_TRASHトリガー用）
  const detectEnergyFromTrash = (before: PlayerState, after: PlayerState): string[] => {
    const newInEnergy = after.energy.filter(n => !before.energy.includes(n));
    return newInEnergy.filter(n => before.trash.includes(n));
  };

  // 新たに血晶武装状態になったシグニのCardNumとゾーンインデックスを検出
  const detectNewlyArmored = (before: PlayerState, after: PlayerState): string[] => {
    const result: string[] = [];
    for (let i = 0; i < 3; i++) {
      const wasBefore = before.field.signi_armor?.[i] ?? false;
      const isAfter   = after.field.signi_armor?.[i]  ?? false;
      if (!wasBefore && isAfter) {
        const cardNum = after.field.signi[i]?.at(-1);
        if (cardNum) result.push(cardNum);
      }
    }
    return result;
  };

  // ON_BLOOD_CRYSTAL_ARMOR トリガーを収集する
  const collectArmorTriggers = (
    armoredCardNum: string,
    armoredPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const ownerStateAfter = armoredPlayerId === bs!.host_id ? afterHostState : afterGuestState;
    // このシグニ自身の ON_BLOOD_CRYSTAL_ARMOR (scope=self)
    for (const eff of (effectsMap.get(armoredCardNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'self') continue;
      entries.push({
        id: generateUUID(),
        playerId: armoredPlayerId,
        cardNum: armoredCardNum,
        effectId: eff.effectId,
        label: `${battleCardMap.get(armoredCardNum)?.CardName ?? armoredCardNum} の【血晶武装時】効果`,
        effect: eff,
      });
    }
    // フィールド上の全シグニの ON_BLOOD_CRYSTAL_ARMOR (scope=any_ally)
    for (const stack of ownerStateAfter.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_ally' && scope !== 'any') continue;
        entries.push({
          id: generateUUID(),
          playerId: armoredPlayerId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${battleCardMap.get(topNum)?.CardName ?? topNum} の【自】効果（血晶武装時）`,
          effect: eff,
        });
      }
    }
    return entries;
  };

  // フィールドからトラッシュに移動したシグニを検出（ON_TRASHトリガー用）
  const detectTrashedSigni = (before: PlayerState, after: PlayerState): string[] => {
    const result: string[] = [];
    for (let i = 0; i < 3; i++) {
      const beforeTop = (before.field.signi[i] ?? []).at(-1);
      const afterTop  = (after.field.signi[i] ?? []).at(-1);
      if (!beforeTop || beforeTop === afterTop) continue;
      // エナではなくトラッシュに移動した場合
      if (!after.energy.includes(beforeTop) && after.trash.includes(beforeTop)) result.push(beforeTop);
    }
    return result;
  };

  // ON_TRASH トリガーを収集する
  const collectTrashTriggers = (
    trashedCardNum: string,
    trashedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    // トラッシュに置かれたカード自身の ON_TRASH 効果
    for (const eff of (effectsMap.get(trashedCardNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      const cardName = battleCardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
      entries.push({
        id: generateUUID(),
        playerId: trashedPlayerId,
        cardNum: trashedCardNum,
        effectId: eff.effectId,
        label: `${cardName} の【トラッシュ時】効果`,
        effect: eff,
      });
    }
    // フィールド上シグニのON_TRASHフィールドトリガー（ally_banished等）
    const ownerState = trashedPlayerId === bs.host_id ? afterHostState : afterGuestState;
    for (const stack of ownerState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_ally' && scope !== 'any') continue;
        entries.push({
          id: generateUUID(),
          playerId: trashedPlayerId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${battleCardMap.get(topNum)?.CardName ?? topNum} の【自】効果（シグニトラッシュ時）`,
          effect: eff,
        });
      }
    }
    return entries;
  };

  /**
   * バニッシュされたシグニの ON_BANISH 効果 + フィールド上の全シグニのトリガーを収集する。
   * banishedPlayerId: バニッシュされたシグニのオーナーの userId (host_id or guest_id)。
   */
  const collectBanishTriggers = (
    banishedCardNum: string,
    banishedPlayerId: string,
    afterHostState: PlayerState,
    afterGuestState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const opId = isHost ? bs.guest_id : bs.host_id;
    const myAfterState = isHost ? afterHostState : afterGuestState;
    const opAfterState = isHost ? afterGuestState : afterHostState;
    const banishedOwnerIsMe = banishedPlayerId === user.id;

    // 1. バニッシュされたカード自身の ON_BANISH 効果
    for (const eff of (effectsMap.get(banishedCardNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      // activeCondition チェック（「対戦相手のターンの間」等）
      const isBanishedOwnerTurn = bs.active_user_id === banishedPlayerId;
      if (!checkActiveCondition(eff.activeCondition, banishedOwnerIsMe ? myAfterState : opAfterState, banishedOwnerIsMe ? opAfterState : myAfterState, isBanishedOwnerTurn, battleCardMap, banishedCardNum)) continue;
      const cardName = battleCardMap.get(banishedCardNum)?.CardName ?? banishedCardNum;
      entries.push({
        id: generateUUID(),
        playerId: banishedPlayerId,
        cardNum: banishedCardNum,
        effectId: eff.effectId,
        label: `${cardName} の【バニッシュ時】効果`,
        effect: eff,
      });
    }

    // 2. 自分フィールド上シグニのトリガー
    for (const stack of myAfterState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (banishedOwnerIsMe  && scope !== 'any_ally' && scope !== 'any') continue;
        if (!banishedOwnerIsMe && scope !== 'any_opp'  && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（バニッシュ時）`,
          effect: eff,
        });
      }
    }

    // 3. 相手フィールド上シグニのトリガー
    for (const stack of opAfterState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
        const scope = eff.triggerScope ?? 'self';
        // 相手視点：「自分の味方がバニッシュ」= !banishedOwnerIsMe
        if (!banishedOwnerIsMe && scope !== 'any_ally' && scope !== 'any') continue;
        if (banishedOwnerIsMe  && scope !== 'any_opp'  && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: opId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（バニッシュ時）`,
          effect: eff,
        });
      }
    }

    return entries;
  };

  /**
   * ターン開始時・終了時の AUTO 効果を収集する。
   * 自分のフィールドシグニ（'self' スコープ）+ ルリグ + 相手の any_opp/any も対象。
   */
  const collectTurnTriggers = (
    timing: 'ON_TURN_START' | 'ON_TURN_END',
    myState: PlayerState,
    opState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const opId = isHost ? bs.guest_id : bs.host_id;
    const labelSuffix = timing === 'ON_TURN_START' ? 'ターン開始時' : 'ターン終了時';

    // 自分のフィールドシグニ（self = このターンプレイヤーのカード）
    // BLOCK_OWN_SIGNI_AUTO: 設定時は自シグニの【自】能力をスキップ
    const ownAutoBlockedTurn = myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
    for (const stack of myState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      if (ownAutoBlockedTurn) continue;
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        if ((eff.triggerScope ?? 'self') !== 'self') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}）`,
          effect: eff,
        });
      }
    }

    // 自分のルリグ
    const myLrigNum = myState.field.lrig.at(-1);
    if (myLrigNum) {
      for (const eff of (effectsMap.get(myLrigNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, true, battleCardMap, myLrigNum)) continue;
        const cardName = battleCardMap.get(myLrigNum)?.CardName ?? myLrigNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: myLrigNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}）`,
          effect: eff,
        });
      }
    }

    // 相手フィールドシグニ（any_opp / any でこちらのターンにも反応するカード）
    for (const stack of opState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_opp' && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: opId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}）`,
          effect: eff,
        });
      }
    }

    return entries;
  };

  // フェイズ進行（実処理）
  const doPhaseAdvance = async () => {
    // いずれかのチェックゾーンにカードがある間はフェーズ移動不可
    if (my.field.check || op.field.check) return;
    setLoading(true);
    try {
      const phase = bs.turn_phase;
      const stateKey = isHost ? 'host_state' : 'guest_state';
      let newMyState = my;
      const update: Partial<BattleStateRow> = {};

      if (phase === 'UP') {
        // アップフェイズ開始時にすでにアップ済み（ENDフェイズで処理）。ドローして次へ。
        const drawBlocked = my.blocked_actions?.includes('DRAW') ?? false;
        // draw_limit: ターン内フラグ or 相手CONT LIMIT_OPP_DRAW_COUNT 効果の小さい方
        const contDrawLimit = collectDrawLimits(op, effectsMap, battleCardMap, true);
        const effectiveDrawLimit = contDrawLimit !== undefined
          ? (my.draw_limit !== undefined ? Math.min(my.draw_limit, contDrawLimit) : contDrawLimit)
          : my.draw_limit;
        const effectiveDrawCount = effectiveDrawLimit !== undefined ? Math.min(drawCount, effectiveDrawLimit) : drawCount;
        newMyState = drawBlocked
          ? { ...my, actions_done: [], draw_limit: undefined }
          : { ...drawCards(my, effectiveDrawCount), actions_done: ['DRAW'], draw_limit: undefined };
        update.turn_phase = 'DRAW';

        // ON_TURN_START トリガー収集（ドローと同時にスタック積み）
        const startEntries = collectTurnTriggers('ON_TURN_START', newMyState, op);
        if (startEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, startEntries)
            : initStack(turnPlayerId, startEntries);
        }
      } else if (phase === 'MAIN' && bs.turn_count === 1) {
        update.turn_phase = 'END';
      } else if (phase === 'END') {
        // ON_TURN_END トリガーをまだ収集していなければ先に解決する
        const turnEndMarked = my.actions_done?.includes('__TURN_END__');
        if (!turnEndMarked) {
          const endEntries = collectTurnTriggers('ON_TURN_END', my, op);
          if (endEntries.length > 0) {
            const markedMyState: PlayerState = {
              ...my,
              actions_done: [...(my.actions_done ?? []), '__TURN_END__'],
            };
            const turnPlayerId = bs.active_user_id ?? user.id;
            const existingStack = bs.effect_stack ?? null;
            const stack = existingStack
              ? pushToStack(existingStack, endEntries)
              : initStack(turnPlayerId, endEntries);
            await supabase.from('battle_states')
              .update({ [stateKey]: markedMyState, effect_stack: stack })
              .eq('room_id', roomId);
            return; // エフェクト解決後に自動で再度ターン終了処理を行う
          }
        }

        // ENDフェーズ：ビートゾーン全カードをトラッシュへ（手札上限処理と同タイミング）
        let myBeatEND = my.field.beat_zone ?? [];
        let myTrashBeat = my.trash;
        if (myBeatEND.length > 0) {
          myTrashBeat = [...my.trash, ...myBeatEND];
          appendBattleLogs([`ビートゾーン（${myBeatEND.length}枚）をトラッシュへ`]);
          myBeatEND = [];
        }

        // ENDフェーズ：手札上限チェック（HAND_SIZE_INCREASE / REDUCE_OPP_HAND_LIMIT 効果）
        const handLimitEND = myEffectiveHandLimit;
        let myHandEND = my.hand;
        let myTrashEND = myTrashBeat;
        if (my.hand.length > handLimitEND) {
          const excessEND = my.hand.length - handLimitEND;
          // 超過分をトラッシュへ（後ろから捨てる）
          myTrashEND = [...myTrashEND, ...my.hand.slice(-excessEND)];
          myHandEND  = my.hand.slice(0, handLimitEND);
          appendBattleLogs([`手札上限超過（${my.hand.length}枚→${handLimitEND}枚）：${excessEND}枚捨て`]);
        }
        // COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック
        let myFieldAfterCoinCheck = { ...my.field, beat_zone: myBeatEND };
        let myTrashAfterCoinCheck = myTrashEND;
        if ((my.coin_condition_signi_instances ?? []).length > 0) {
          const coinSpent = (my.actions_done ?? []).includes('COIN_SPENT');
          if (!coinSpent) {
            // コイン未消費 → coin_condition_signi_instances のシグニをトラッシュ
            const newSigniField = [...myFieldAfterCoinCheck.signi] as (string[] | null)[];
            for (const instId of my.coin_condition_signi_instances ?? []) {
              for (let zi = 0; zi < 3; zi++) {
                if (newSigniField[zi]?.includes(instId)) {
                  myTrashAfterCoinCheck = [...myTrashAfterCoinCheck, ...newSigniField[zi]!];
                  newSigniField[zi] = null;
                  appendBattleLogs([`コイン消費なし → ${battleCardMap.get(instId)?.CardName ?? instId}をトラッシュ`]);
                }
              }
            }
            myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi: newSigniField };
          }
        }
        // game_turn_end_trash_to_hand: ターン終了時、トラッシュから特定クラスシグニを手札へ（GAIN_ABILITY_THIS_GAME）
        if (my.game_turn_end_trash_to_hand) {
          const { class: ttCls, count: ttCnt } = my.game_turn_end_trash_to_hand;
          const ttMatches = myTrashAfterCoinCheck.filter(cn => {
            const c = battleCardMap.get(cn);
            return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(ttCls);
          });
          const ttToHand = ttMatches.slice(0, ttCnt);
          if (ttToHand.length > 0) {
            myTrashAfterCoinCheck = myTrashAfterCoinCheck.filter(cn => !ttToHand.includes(cn));
            myHandEND = [...myHandEND, ...ttToHand];
            appendBattleLogs([`ターン終了時：トラッシュ＜${ttCls}＞シグニ${ttToHand.length}枚を手札へ（このゲーム）`]);
          }
        }
        // flip_attack_signi_zones: フリップアタックで裏向きにしたシグニをターン終了時に表向きに戻す
        if ((my.flip_attack_signi_zones ?? []).length > 0) {
          const newSigniDownFA = [...(myFieldAfterCoinCheck.signi_down ?? [false, false, false])] as [boolean, boolean, boolean];
          const unflipped: string[] = [];
          for (const zi of my.flip_attack_signi_zones!) {
            if (!(my.field.signi[zi]?.length)) { // ゾーンが空なら表向きに戻す
              newSigniDownFA[zi] = false;
              const topName = battleCardMap.get(my.field.signi[zi]?.at(-1) ?? '')?.CardName;
              if (topName) unflipped.push(topName);
            }
          }
          myFieldAfterCoinCheck = { ...myFieldAfterCoinCheck, signi_down: newSigniDownFA };
          if (unflipped.length > 0) appendBattleLogs([`フリップアタック復元：${unflipped.join('・')}を表向きに`]);
        }
        // 自分（ターン終了プレイヤー）のターン内一時状態をクリア
        newMyState = {
          ...my,
          hand: myHandEND,
          trash: myTrashAfterCoinCheck,
          field: myFieldAfterCoinCheck,
          temp_power_mods:    [],   // UNTIL_END_OF_TURN パワー修正をリセット
          keyword_grants:     {},   // ターン内付与キーワードをリセット
          granted_effects:    {},   // ターン内付与能力をリセット
          blocked_actions:    [],   // ターン内封じ行動をリセット
          blocked_card_names: [],   // ターン内使用禁止カードをリセット
          actions_done:       [],   // ターン内行動履歴をリセット
          pending_crashed_cards: [],  // ダブルクラッシュ残数をリセット
          must_attack_signi:  undefined,  // 強制攻撃フラグをリセット
          cost_modifiers: (my.cost_modifiers ?? []).filter(m => m.until !== 'END_OF_TURN'),
          prevent_next_damage: undefined,  // ターン内ダメージ無効をリセット
          life_burst_double_next: undefined, // ライフバースト2回発動フラグをリセット
          lrig_granted_auto_effects: undefined, // ターン終了時まで付与されたルリグ能力をクリア
          banish_redirect: undefined,           // バニッシュ先変更フラグをクリア
          banish_redirect_to_hand: undefined,   // バニッシュ先→手札フラグをクリア
          no_grow: undefined,                   // グロウ禁止フラグをリセット
          suppress_life_burst: undefined,       // ライフバースト抑制フラグをリセット
          prevent_lrig_damage: undefined,       // ルリグダメージ無効フラグをリセット
          prevent_defeat: undefined,            // 敗北無効フラグをリセット
          declared_guard_restrict_level: undefined, // 宣言数字をリセット
          declared_class: undefined,               // 宣言クラスをリセット
          hand_signi_guard_enabled: undefined,     // 手札シグニガードフラグをリセット
          lrig_limit_mod: undefined,               // ルリグリミット修正をリセット
          prevent_opp_guard: undefined,            // 相手ガード禁止フラグをリセット
          draw_limit: undefined,                   // ドロー上限リセット（次ターン開始時にも解除）
          card_class_overrides: undefined,         // クラスオーバーライドリセット
          signi_color_overrides: undefined,        // シグニ色オーバーライドリセット
          disabled_signi_zones: undefined,         // ゾーン無効化リセット
          attacked_signi_ids: undefined,            // アタック済みシグニIDリセット
          signi_attack_once_limit: undefined,       // シグニ1回アタック制限リセット
          signi_attack_cost: undefined,             // シグニアタックコストリセット
          lrig_riding_signi: undefined,             // ドライブ状態（ライド）をリセット
          lrig_attack_remaining: undefined,         // マルチダメージ残数リセット
          suppress_center_on_play: undefined,       // センタールリグ【出】抑制フラグをリセット
          crash_to_trash_instead: undefined,        // クラッシュ先トラッシュフラグをリセット
          negate_opp_signi_attacks_until: undefined, // N回目シグニアタック自動無効化フラグをリセット
          all_cont_effects_negated: undefined,       // CONTINUOUS効果無効化フラグをリセット
          banish_to_trash_by_self: undefined,        // バニッシュ→トラッシュ誘導フラグをリセット
          negate_coin_abilities: undefined,          // コイン能力無効化フラグをリセット
          coin_condition_signi_instances: undefined,  // コイン消費条件シグニをリセット
          grid_reveal_plus_one_this_turn: undefined,  // グリッド公開+1フラグをリセット
          deck_signi_level_override: undefined,       // デッキシグニレベルオーバーライドをリセット
          reduce_next_on_play_cost: undefined,        // 【出】コスト軽減フラグをリセット
          optional_discard_guard_enabled: undefined,  // 任意捨てガードフラグをリセット
          flip_attack_signi_zones: undefined,         // フリップアタックゾーンをリセット
        };
        // 次のターンプレイヤー（相手）のカードをアップフェイズ開始時点でアップ処理する。
        // 凍結中はアップせず凍結を解除。それ以外のダウンカードはアップ。
        const opKey = isHost ? 'guest_state' : 'host_state';
        const opState = isHost ? bs.guest_state : bs.host_state;
        const curSigniDown   = opState.field.signi_down   ?? [false, false, false];
        const curSigniFrozen = opState.field.signi_frozen  ?? [false, false, false];
        const curLrigFrozen  = opState.field.lrig_frozen   ?? false;
        const newSigniDown = curSigniDown.map((down, i) => down && curSigniFrozen[i]) as boolean[];
        // ':NEXT_TURN' サフィックスのブロックを次のターン用に変換（サフィックス除去して残す）
        const convertedOpBlocked = (opState.blocked_actions ?? [])
          .filter(a => a.endsWith(':NEXT_TURN'))
          .map(a => a.replace(':NEXT_TURN', ''));
        update[opKey] = {
          ...opState,
          blocked_actions: convertedOpBlocked,
          negate_coin_abilities: undefined, // NEGATE_COIN_ABILITY: このターン限定→ターン終了時にクリア
          field: {
            ...opState.field,
            signi_down:   newSigniDown,
            signi_frozen: [false, false, false],
            lrig_down:    (opState.field.lrig_down ?? false) && curLrigFrozen,
            lrig_frozen:  false,
          },
        };
        // GAIN_EXTRA_TURN: 追加ターン取得済みの場合は同プレイヤーの追加ターン
        if (my.extra_turn) {
          newMyState = { ...newMyState, extra_turn: undefined };
          update.turn_phase = 'UP';
          update.turn_count = bs.turn_count + 1;
          appendBattleLogs(['追加ターン取得！']);
        } else {
          update.turn_phase = 'UP';
          update.active_user_id = (isHost ? bs.guest_id : bs.host_id) as string;
          update.turn_count = bs.turn_count + 1;
        }
      } else {
        update.turn_phase = PHASE_NEXT[phase];
        // ENERGY→GROW（グロウフェイズ開始時）: game_grow_phase_limit_plus で game_lrig_limit_bonus を累積
        if (phase === 'ENERGY' && (newMyState.game_grow_phase_limit_plus ?? 0) > 0) {
          const glp = newMyState.game_grow_phase_limit_plus!;
          newMyState = { ...newMyState, game_lrig_limit_bonus: (newMyState.game_lrig_limit_bonus ?? 0) + glp };
          appendBattleLogs([`グロウフェイズ開始：リミット+${glp}（このゲーム・累積${newMyState.game_lrig_limit_bonus}）`]);
        }
        // GROW→MAIN移行時: pending_lrig_limit_modをlrig_limit_modに適用（OPP_MAIN_PHASE_LIMIT_DOWN）
        if (phase === 'GROW' && my.pending_lrig_limit_mod !== undefined) {
          newMyState = {
            ...newMyState,
            lrig_limit_mod: (newMyState.lrig_limit_mod ?? 0) + my.pending_lrig_limit_mod,
            pending_lrig_limit_mod: undefined,
          };
        }
        // GROW→MAIN（メインフェイズ開始時）: game_main_draw（手札5枚以下ならドロー）
        if (phase === 'GROW' && newMyState.game_main_draw && newMyState.hand.length <= 5 && newMyState.deck.length > 0) {
          const drawCard = newMyState.deck[newMyState.deck.length - 1];
          newMyState = { ...newMyState, deck: newMyState.deck.slice(0, -1), hand: [...newMyState.hand, drawCard] };
          appendBattleLogs(['メインフェイズ開始ドロー（このゲーム）']);
        }
        // DRAW→ENERGY（エナフェイズ開始時）: game_energy_phase_draw
        if (phase === 'DRAW' && newMyState.game_energy_phase_draw && newMyState.deck.length > 0) {
          const drawCard = newMyState.deck[newMyState.deck.length - 1];
          newMyState = { ...newMyState, deck: newMyState.deck.slice(0, -1), hand: [...newMyState.hand, drawCard] };
          appendBattleLogs(['エナフェイズ開始ドロー（このゲーム）']);
        }
        // HASTARLIQ: MAIN→ATTACK_ARTS移行時、相手の hastarliq_zones があれば発動
        if (phase === 'MAIN' && (op.hastarliq_zones ?? []).length > 0) {
          const opKey = isHost ? 'guest_state' : 'host_state';
          const turnPlayerId = bs.active_user_id ?? user.id;
          const hlEntries: StackEntry[] = (op.hastarliq_zones ?? []).map(zi => ({
            id: generateUUID(),
            playerId: turnPlayerId,
            cardNum: 'WXDi-P05-TK01A',
            effectId: `HASTARLIQ_TRIGGER_Z${zi}_${Date.now()}`,
            label: `【ハスターリク】ゾーン${zi + 1}発動`,
            effect: {
              effectId: `HASTARLIQ_TRIGGER_Z${zi}`,
              effectType: 'AUTO' as const,
              action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../types/effects').StubAction,
              duration: 'INSTANT' as const,
              mandatory: true,
              parseStatus: 'AUTO' as const,
            },
          }));
          update[opKey] = { ...op, hastarliq_zones: undefined };
          const existingStackHL = bs.effect_stack ?? null;
          update.effect_stack = existingStackHL
            ? pushToStack(existingStackHL, hlEntries)
            : initStack(turnPlayerId, hlEntries);
        }
      }

      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, ...update })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // フェイズ進行（エナフェイズ・グロウフェイズ未使用時は確認ポップアップ）
  const handlePhaseAdvance = () => {
    if (!iControlThisPhase || loading) return;
    if (my.field.check || op.field.check) return; // チェックゾーンにカードがある間はブロック
    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked) {
        setShowEnergySkipConfirm(true);
        return;
      }
    }
    if (bs.turn_phase === 'GROW') {
      const grew    = my.actions_done?.includes('GROW') ?? false;
      const blocked = my.blocked_actions?.includes('GROW') ?? false;
      if (!grew && !blocked) {
        const hasAffordable = growCandidates.some(card => {
          const gCoin = parseCoinCost(card.GrowCost);
          return (gCoin === 0 || my.coins >= gCoin) &&
            canAffordGrowCost(my.energy, battleCards, card.GrowCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
        });
        if (hasAffordable) {
          setShowGrowSkipConfirm(true);
          return;
        }
      }
    }
    if (bs.turn_phase === 'ATTACK_SIGNI') {
      const signiDown   = my.field.signi_down   ?? [false, false, false];
      const hasUpSigni  = my.field.signi.some((stack, i) =>
        (stack?.length ?? 0) > 0 && !signiDown[i],
      );
      if (hasUpSigni) {
        setShowSigniAttackSkipConfirm(true);
        return;
      }
    }
    if (bs.turn_phase === 'ATTACK_LRIG') {
      const hasLrig  = (my.field.lrig?.length ?? 0) > 0;
      const lrigUp   = !(my.field.lrig_down ?? false);
      if (hasLrig && lrigUp) {
        setShowLrigAttackSkipConfirm(true);
        return;
      }
    }
    doPhaseAdvance();
  };

  // エナチャージ（手札のカードをエナゾーンへ）
  const handleEnergyChargeFromHand = async (handIndex: number) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const cardNum = my.hand[handIndex];
      const name = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const colorRestrict = collectOppEnergyColorRestriction(op, battleCardMap, effectsMap);
      const handWithout = my.hand.filter((_, i) => i !== handIndex);
      let newMyState: PlayerState;
      if (colorRestrict && !(battleCardMap.get(cardNum)?.Color ?? '').includes(colorRestrict)) {
        newMyState = { ...my, hand: handWithout, trash: [...my.trash, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ→トラッシュ（${name}、${colorRestrict}色制限）`]);
      } else {
        newMyState = { ...my, hand: handWithout, energy: [...my.energy, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ（${name}）`]);
      }
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // エナチャージ（シグニゾーンの最上層カードをエナゾーンへ）
  const handleEnergyChargeFromSigni = async (zoneIndex: number) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    try {
      const signiStack = my.field.signi[zoneIndex];
      if (!signiStack || signiStack.length === 0) return;
      const cardNum = signiStack[signiStack.length - 1];
      const name = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const newStack = signiStack.slice(0, -1);
      const newSigni = [...my.field.signi] as (string[] | null)[];
      newSigni[zoneIndex] = newStack.length > 0 ? newStack : null;
      const colorRestrict = collectOppEnergyColorRestriction(op, battleCardMap, effectsMap);
      let newMyState: PlayerState;
      if (colorRestrict && !(battleCardMap.get(cardNum)?.Color ?? '').includes(colorRestrict)) {
        newMyState = { ...my, field: { ...my.field, signi: newSigni }, trash: [...my.trash, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ→トラッシュ（${name}、${colorRestrict}色制限）`]);
      } else {
        newMyState = { ...my, field: { ...my.field, signi: newSigni }, energy: [...my.energy, cardNum], actions_done: [...(my.actions_done ?? []), 'ENERGY'] };
        appendBattleLogs([`エナチャージ（${name}）`]);
      }
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ===== 効果エンジン統合 =====

  // 効果タイプの表示ラベル
  const effectTypeLabel = (t: string) => {
    if (t === 'AUTO') return '【自】';
    if (t === 'ACTIVATED') return '【起】';
    if (t === 'LIFE_BURST') return '【ライフバースト】';
    return `【${t}】`;
  };

  // --- スタック操作 ---

  /**
   * カードの効果をスタックに積む。
   * effectTypes/timings でフィルタし、該当効果を StackEntry として追加。
   * extraUpdate でフィールド状態（召喚後など）を同時に保存できる。
   */
  const queueCardEffects = async (
    cardNum: string,
    effectTypes: ('AUTO' | 'ACTIVATED' | 'LIFE_BURST')[],
    timings: string[],
    startMyState: PlayerState,
    _startOpState: PlayerState,
    extraUpdate: Record<string, unknown> = {},
    repeatCount = 1,
  ): Promise<boolean> => {
    const effects = effectsMap.get(cardNum) ?? [];
    const targets = effects.filter(e =>
      (effectTypes as string[]).includes(e.effectType) &&
      (timings.length === 0 || e.timing?.some(t => timings.includes(t)))
    );
    if (targets.length === 0) return false;

    const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
    const turnPlayerId = bs?.active_user_id ?? user.id;

    const makeEntries = (): StackEntry[] => targets.map(eff => ({
      id: generateUUID(),
      playerId: user.id,
      cardNum,
      effectId: eff.effectId,
      label: `${cardName} の${effectTypeLabel(eff.effectType)}効果`,
      effect: eff,
    }));
    const allEntries: StackEntry[] = [];
    for (let r = 0; r < repeatCount; r++) allEntries.push(...makeEntries());
    const entries = allEntries;

    const existing = bs?.effect_stack ?? null;
    const stack: EffectStack = existing
      ? pushToStack(existing, entries)
      : initStack(turnPlayerId, entries);

    const myKey = isHost ? 'host_state' : 'guest_state';
    const { error } = await supabase.from('battle_states')
      .update({
        [myKey]: startMyState,
        effect_stack: stack,
        pending_effect: null,
        ...extraUpdate,
      })
      .eq('room_id', roomId);
    if (error) console.error('[queueCardEffects] DB error:', error);
    return true;
  };

  // --- スタック解決 ---

  /**
   * キューの先頭エントリを取り出して effectExecutor で実行し DB に保存する。
   * ターンプレイヤーが呼び出す（useEffect で監視）。
   */
  const resolveStackNext = async () => {
    if (!bs?.effect_stack || loading) return;
    const stack = bs.effect_stack;
    if (!isReadyToResolve(stack) || stack.queue.length === 0) return;
    if (stackProcessingRef.current) return;  // stale closure による多重実行を防ぐ
    // DB伝播前に setLoading(false) で useEffect が再発火しても同一エントリを二重処理しない
    if (stack.queue[0].id === lastResolvedEntryIdRef.current) return;
    stackProcessingRef.current = true;

    setLoading(true);
    try {
      const { entry, newStack } = shiftQueue(stack);
      if (!entry) {
        await supabase.from('battle_states')
          .update({ effect_stack: null })
          .eq('room_id', roomId);
        return;
      }

      lastResolvedEntryIdRef.current = entry.id;
      const ownerIsHost = entry.playerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === entry.playerId;
      const who = entry.playerId === user.id ? '自分' : '相手';
      appendBattleLogs([`[${who}] ${entry.label}`], { defer: true });
      // ATTACK_PHASE_LEVEL_OVERRIDE: アタックフェイズ中は英知レベルオーバーライドを計算
      const isAttackPhaseBS = ['ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_SIGNI', 'ATTACK_LRIG'].includes(bs.turn_phase ?? '');
      const ownerLevelOverrides = isAttackPhaseBS ? collectAttackPhaseLevelOverrides(ownerState, effectsMap, battleCardMap) : {};
      const ownerStateForCtx = Object.keys(ownerLevelOverrides).length > 0
        ? { ...ownerState, attack_phase_level_overrides: ownerLevelOverrides } : ownerState;
      const ctxPowers = calcFieldPowers(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap);
      // PREVENT_ZONE_MOVE_BY_OPP: 相手（otherState）の保護ゾーンを動的計算してctxに渡す
      const otherProtectedZones = collectProtectedZones(otherState, battleCardMap, effectsMap);
      // PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: 相手フィールドの能力保護シグニを動的計算してctxに渡す
      const otherProtectedSigniNums = collectAbilityProtectedSigni(otherState, battleCardMap, effectsMap, !isOwnerTurn);
      // PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP_ALL: 相手フィールドのダウン保護シグニ
      const otherDownProtectedNums = collectDownProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, isOwnerTurn);
      // SIGNI_CANT_BOUNCE_FROM_FIELD: 相手フィールドのバウンス保護シグニ
      const otherBounceProtectedNums = collectBounceProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, isOwnerTurn);
      // PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH / PREVENT_NON_FIELD_MOVE_BY_OPP / SIGNI_PROTECT_MOVE_EXCEPT_ENERGY: 相手フィールドのトラッシュ保護シグニ
      const otherTrashFieldProtectedNums = collectTrashFieldProtectedSigni(otherState, battleCardMap, effectsMap, ownerStateForCtx, isOwnerTurn);
      // PREVENT_OPP_SIGNI_ABILITY_GAIN / PREVENT_ABILITY_CHANGE_BY_OPP: 能力付与保護シグニ
      const otherAbilityGainProtectedNums = collectAbilityGainProtectedSigni(otherState, ownerStateForCtx, battleCardMap, effectsMap, isOwnerTurn);
      // BLOCK_OPP_DECK_TO_ENERGY / BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT
      const contBlockedCtx = calcContinuousBlockedActions(ownerStateForCtx, otherState, isOwnerTurn, effectsMap, battleCardMap);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerStateForCtx, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerStateForCtx, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerStateForCtx, !isOwnerTurn)]);
      const ctx: ExecCtx = { ownerState: ownerStateForCtx, otherState, cardMap: battleCardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: entry.cardNum, otherProtectedZones, otherProtectedSigniNums, otherDownProtectedNums, otherBounceProtectedNums, otherTrashFieldProtectedNums, otherAbilityGainProtectedNums, deckToEnergyBlocked: contBlockedCtx.forSelf.has('DECK_TO_ENERGY'), signiFieldPlaceByEffectBlocked: contBlockedCtx.forSelf.has('SIGNI_FIELD_PLACE_BY_EFFECT'), allColorSigniNums, fieldSigniExtraColors };
      let result = executeEffect(entry.effect, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      // FORCE_TARGET_SELF: opp_field SELECT_TARGETで強制対象シグニが候補にある場合、候補を絞る
      if (!result.done && result.pending.type === 'SELECT_TARGET' && result.pending.targetScope === 'opp_field') {
        const forcedNums = collectForcedTargets(otherState, effectsMap, isOwnerTurn);
        const forcedInCands = forcedNums.filter(n => result.done === false && result.pending.type === 'SELECT_TARGET' && result.pending.candidates.includes(n));
        if (forcedInCands.length > 0 && result.done === false && result.pending.type === 'SELECT_TARGET' && forcedInCands.length < result.pending.candidates.length) {
          const pend = result.pending;
          result = { ...result, pending: { ...pend, candidates: forcedInCands } } as typeof result;
          appendBattleLogs([`[FORCE_TARGET_SELF] 対象が${forcedInCands.length}体に強制`], { defer: true });
        }
      }

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;

      const stackAfter = isStackDone(newStack) ? null : newStack;
      const update: Record<string, unknown> = {
        host_state: hostState,
        guest_state: guestState,
        effect_stack: stackAfter,
      };
      if (!result.done) {
        // opponentResponds=true の場合、相手プレイヤーがUIを操作する
        const oppId = ownerIsHost ? bs.guest_id : bs.host_id;
        const respondPlayerId = (
          (result.pending?.type === 'SELECT_TARGET' && result.pending.opponentResponds) ||
          (result.pending?.type === 'CHOOSE' && result.pending.opponentResponds)
        ) ? oppId : undefined;
        update.pending_effect = {
          sourcePlayerId: entry.playerId,
          ...(respondPlayerId ? { respondPlayerId } : {}),
          sourceCardNum: entry.cardNum,
          effectId: entry.effectId,
          interaction: result.pending,
        } satisfies PendingEffect;
        // インタラクション中はスタック（残キュー）を保持
        update.effect_stack = newStack;
      } else {
        update.pending_effect = null;

        // ON_BANISH: バニッシュされたシグニを検出してスタックに追加
        const hostBanished  = detectBanishedSigni(bs.host_state, hostState);
        const guestBanished = detectBanishedSigni(bs.guest_state, guestState);
        const banishEntries: StackEntry[] = [];
        for (const cardNum of hostBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.guest_id, hostState, guestState));
        }
        if (banishEntries.length > 0) {
          const baseStack = (update.effect_stack as typeof stackAfter) ?? null;
          update.effect_stack = baseStack
            ? pushToStack(baseStack, banishEntries)
            : initStack(stack.turnPlayerId, banishEntries);
        }

        // ON_TRASH: トラッシュに移動したシグニを検出してスタックに追加
        const hostTrashed  = detectTrashedSigni(bs.host_state, hostState);
        const guestTrashed = detectTrashedSigni(bs.guest_state, guestState);
        const trashEntries: StackEntry[] = [];
        for (const cardNum of hostTrashed) {
          trashEntries.push(...collectTrashTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestTrashed) {
          trashEntries.push(...collectTrashTriggers(cardNum, bs.guest_id, hostState, guestState));
        }
        if (trashEntries.length > 0) {
          const baseStackT = (update.effect_stack as typeof stackAfter) ?? null;
          update.effect_stack = baseStackT
            ? pushToStack(baseStackT, trashEntries)
            : initStack(stack.turnPlayerId, trashEntries);
        }

        // ON_ENERGY_FROM_TRASH: トラッシュからエナゾーンに移動したカードのトリガー
        const hostEnergyFromTrash  = detectEnergyFromTrash(bs.host_state, hostState);
        const guestEnergyFromTrash = detectEnergyFromTrash(bs.guest_state, guestState);
        const energyFromTrashEntries: StackEntry[] = [];
        for (const cardNum of hostEnergyFromTrash) {
          for (const eff of (effectsMap.get(cardNum) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_FROM_TRASH')) continue;
            energyFromTrashEntries.push({
              id: generateUUID(),
              playerId: bs.host_id,
              cardNum,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（トラッシュからエナ時）`,
              effect: eff,
            });
          }
        }
        for (const cardNum of guestEnergyFromTrash) {
          for (const eff of (effectsMap.get(cardNum) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_FROM_TRASH')) continue;
            energyFromTrashEntries.push({
              id: generateUUID(),
              playerId: bs.guest_id,
              cardNum,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（トラッシュからエナ時）`,
              effect: eff,
            });
          }
        }
        if (energyFromTrashEntries.length > 0) {
          const baseStackE = (update.effect_stack as typeof stackAfter) ?? null;
          update.effect_stack = baseStackE
            ? pushToStack(baseStackE, energyFromTrashEntries)
            : initStack(stack.turnPlayerId, energyFromTrashEntries);
        }

        // ON_BLOOD_CRYSTAL_ARMOR: 血晶武装状態になったシグニのトリガーを収集
        const hostNewArmoredSE  = detectNewlyArmored(bs.host_state,  hostState);
        const guestNewArmoredSE = detectNewlyArmored(bs.guest_state, guestState);
        const armorEntriesSE: StackEntry[] = [];
        for (const cardNum of hostNewArmoredSE) {
          armorEntriesSE.push(...collectArmorTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestNewArmoredSE) {
          armorEntriesSE.push(...collectArmorTriggers(cardNum, bs.guest_id, hostState, guestState));
        }
        if (armorEntriesSE.length > 0) {
          const baseStackA = (update.effect_stack as typeof stackAfter) ?? null;
          update.effect_stack = baseStackA
            ? pushToStack(baseStackA, armorEntriesSE)
            : initStack(stack.turnPlayerId, armorEntriesSE);
        }

        // COLLAB: コラボライバー呼び出しで配置されたアシストルリグのON_PLAY効果を積む
        if ((entry.effect.action as import('../types/effects').StubAction)?.type === 'STUB' &&
            (entry.effect.action as import('../types/effects').StubAction)?.id === 'COLLAB') {
          const collabOnPlayEntries: StackEntry[] = [];
          for (const instanceId of result.lastProcessedCards ?? []) {
            const cn = getCardNum(instanceId);
            for (const eff of (effectsMap.get(cn) ?? [])) {
              if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
              collabOnPlayEntries.push({
                id: generateUUID(),
                playerId: entry.playerId,
                cardNum: instanceId,
                effectId: eff.effectId,
                label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果`,
                effect: eff,
              });
            }
          }
          if (collabOnPlayEntries.length > 0) {
            const baseStackC = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStackC
              ? pushToStack(baseStackC, collabOnPlayEntries)
              : initStack(stack.turnPlayerId, collabOnPlayEntries);
          }
        }

        // SEED_BLOOM系: 開花したシグニのON_PLAY効果をスタックに積む
        // INTERNAL_BLOOM_SEED（1枚開花）またはSEED_BLOOM「好きな枚数」パスのどちらも
        // lastProcessedCards に開花したCardNumが入る
        {
          const stubId = (entry.effect.action as import('../types/effects').StubAction)?.id;
          const isBloomAction = stubId === 'INTERNAL_BLOOM_SEED' || stubId === 'SEED_BLOOM' || stubId === 'SEED_BLOOM_OPTIONAL';
          if (isBloomAction && (result.lastProcessedCards?.length ?? 0) > 0) {
            const bloomOnPlayEntries: StackEntry[] = [];
            for (const instanceId of result.lastProcessedCards!) {
              const cn = getCardNum(instanceId);
              for (const eff of (effectsMap.get(cn) ?? [])) {
                if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
                bloomOnPlayEntries.push({
                  id: generateUUID(),
                  playerId: entry.playerId,
                  cardNum: instanceId,
                  effectId: eff.effectId,
                  label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果（開花）`,
                  effect: eff,
                });
              }
            }
            if (bloomOnPlayEntries.length > 0) {
              const baseStackB = (update.effect_stack as typeof stackAfter) ?? null;
              update.effect_stack = baseStackB
                ? pushToStack(baseStackB, bloomOnPlayEntries)
                : initStack(stack.turnPlayerId, bloomOnPlayEntries);
            }
          }
        }

        // ON_OPP_ARTS_USE: 相手がアーツを使用した場合、自分側の ON_OPP_ARTS_USE トリガーを収集
        const entryCardType = battleCardMap.get(entry.cardNum)?.Type;
        if (entryCardType === 'アーツ' && entry.playerId !== user.id) {
          // 自分（user.id）の myState を決定
          const myStateForTrigger = ownerIsHost ? (isHost ? hostState : guestState) : (isHost ? guestState : hostState);
          const opStateForTrigger = ownerIsHost ? (isHost ? guestState : hostState) : (isHost ? hostState : guestState);
          const iAmHost = isHost;
          const myIsActive = bs.active_user_id === user.id;
          const artsTriggers = collectOppArtsUseTriggers(myStateForTrigger, opStateForTrigger, myIsActive);
          if (artsTriggers.length > 0) {
            const baseStack2 = (update.effect_stack as typeof stackAfter) ?? null;
            update.effect_stack = baseStack2
              ? pushToStack(baseStack2, artsTriggers)
              : initStack(iAmHost ? bs.host_id : bs.guest_id, artsTriggers);
          }
        }

        // FORCE_END_TURN: スタック・エフェクト解決後にターンを即座に終了する
        if (result.forceEndTurn) {
          const activeIsHost = bs.active_user_id === bs.host_id;
          const activeKey  = activeIsHost ? 'host_state'  : 'guest_state';
          const nextKey    = activeIsHost ? 'guest_state' : 'host_state';
          const activeState = activeIsHost ? hostState  : guestState;
          const nextState   = activeIsHost ? guestState : hostState;

          // アクティブプレイヤーの一時状態をクリア
          const clearedActive: typeof activeState = {
            ...activeState,
            temp_power_mods:    [],
            keyword_grants:     {},
            granted_effects:    {},
            blocked_actions:    [],
            actions_done:       [],

            cost_modifiers: (activeState.cost_modifiers ?? []).filter((m: {until?: string}) => m.until !== 'END_OF_TURN'),
          };

          // 次のターンプレイヤー（相手）のシグニをアップ（凍結中はアップせず凍結解除）
          const signiDown   = nextState.field.signi_down   ?? [false, false, false];
          const sIgniFrozen = nextState.field.signi_frozen  ?? [false, false, false];
          const newSigniDown = signiDown.map((d: boolean, i: number) => d && sIgniFrozen[i]) as boolean[];
          const convertedBlocked = (nextState.blocked_actions ?? [])
            .filter((a: string) => a.endsWith(':NEXT_TURN'))
            .map((a: string) => a.replace(':NEXT_TURN', ''));
          const nextStateUpd = {
            ...nextState,
            blocked_actions: convertedBlocked,
            field: {
              ...nextState.field,
              signi_down:   newSigniDown,
              signi_frozen: [false, false, false] as [boolean, boolean, boolean],
              lrig_down:    (nextState.field.lrig_down ?? false) && (nextState.field.lrig_frozen ?? false),
              lrig_frozen:  false,
            },
          };

          Object.assign(update, {
            [activeKey]:     clearedActive,
            [nextKey]:       nextStateUpd,
            turn_phase:      'UP',
            active_user_id:  activeIsHost ? bs.guest_id : bs.host_id,
            turn_count:      bs.turn_count + 1,
            effect_stack:    null,
          });
          appendBattleLogs(['ターンが強制終了されました'], { defer: true });
        }
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      // main update が確定してから flush（先に RPC が届いて stale な effect_stack で再実行されるのを防ぐ）
      await flushBattleLogs();
    } finally {
      stackProcessingRef.current = false;
      setLoading(false);
    }
  };


  // --- 整列UI用ハンドラ ---

  /** 自分の未整列効果のID配列を引数として順序を確定する */
  const handleConfirmStackOrder = async (orderedIds: string[]) => {
    if (!bs?.effect_stack || loading) return;
    setLoading(true);
    try {
      const isTurnPlayer = bs.active_user_id === user.id;
      const stack = isTurnPlayer
        ? confirmTurnOrder(bs.effect_stack, orderedIds)
        : confirmOppOrder(bs.effect_stack, orderedIds);
      await supabase.from('battle_states')
        .update({ effect_stack: isStackDone(stack) ? null : stack })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // --- pending_effect インタラクション解決 ---

  const handleEffectInteraction = async (selectedOrChoiceId: string[]) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: battleCardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, allColorSigniNums, fieldSigniExtraColors };
      const inter = pe.interaction;

      let result: ExecResult;
      if (inter.type === 'SELECT_TARGET') {
        result = resumeSelectTarget(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'SEARCH') {
        result = resumeSearch(selectedOrChoiceId, inter, ctx);
      } else if (inter.type === 'CHOOSE') {
        const choiceId = selectedOrChoiceId[0] ?? '';
        const opt = inter.options.find(o => o.id === choiceId);
        if (inter.opponentResponds) {
          // 対戦相手払い選択: resumeOpponentPayOptional で otherState のエナを消費
          const energyNums = selectedOrChoiceId.slice(1);
          result = resumeOpponentPayOptional(choiceId, energyNums, inter, ctx);
        } else if (opt?.costColors?.length) {
          // 任意コスト付き選択: resumeOptionalCost でエナ消費処理
          const energyNums = selectedOrChoiceId.slice(1);
          result = resumeOptionalCost(choiceId, energyNums, inter, ctx);
        } else {
          result = resumeChoose(choiceId, inter, ctx);
        }
      } else if (inter.type === 'LOOK_AND_REORDER') {
        result = resumeLookAndReorder(selectedOrChoiceId, [], inter, ctx);
      } else {
        return;
      }
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        // continuationが発生した場合、次のインタラクションは効果オーナーが応答する（respondPlayerIdをリセット）
        const nextOpponentResponds = (result.pending?.type === 'SELECT_TARGET' || result.pending?.type === 'CHOOSE') && result.pending.opponentResponds;
        const nextRespondPlayerId = nextOpponentResponds ? pe.respondPlayerId : undefined;
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = {
          ...peBase,
          ...(nextRespondPlayerId ? { respondPlayerId: nextRespondPlayerId } : {}),
          interaction: result.pending,
        } satisfies PendingEffect;
      } else {
        update.pending_effect = null;

        // ON_BANISH: バニッシュされたシグニを検出してスタックに追加
        const hostBanished  = detectBanishedSigni(bs.host_state, hostState);
        const guestBanished = detectBanishedSigni(bs.guest_state, guestState);
        const banishEntries: StackEntry[] = [];
        for (const cardNum of hostBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestBanished) {
          banishEntries.push(...collectBanishTriggers(cardNum, bs.guest_id, hostState, guestState));
        }

        // SEED_BLOOM: 開花したシグニのON_PLAY効果をスタックに積む（pending_effect経由の場合）
        // 元の効果が SEED_BLOOM 系の場合のみ処理（BANISH 等の通常選択で lastProcessedCards が入っても誤発動しないよう）
        const peEffectForBloom = (effectsMap.get(pe.sourceCardNum) ?? []).find(e => e.effectId === pe.effectId);
        const peStubId = (peEffectForBloom?.action as import('../types/effects').StubAction)?.id;
        const isBloomActionPE = peStubId === 'INTERNAL_BLOOM_SEED' || peStubId === 'SEED_BLOOM' || peStubId === 'SEED_BLOOM_OPTIONAL';
        const bloomedCardsPE = isBloomActionPE ? (result.lastProcessedCards ?? []) : [];
        const bloomOnPlayPE: StackEntry[] = [];
        for (const instanceId of bloomedCardsPE) {
          const cn = getCardNum(instanceId);
          for (const eff of (effectsMap.get(cn) ?? [])) {
            if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
            bloomOnPlayPE.push({
              id: generateUUID(),
              playerId: pe.sourcePlayerId,
              cardNum: instanceId,
              effectId: eff.effectId,
              label: `${battleCardMap.get(cn)?.CardName ?? cn} の【出】効果（開花）`,
              effect: eff,
            });
          }
        }

        // ON_BLOOD_CRYSTAL_ARMOR: 血晶武装状態になったシグニを検出してトリガー収集
        const hostNewArmored  = detectNewlyArmored(bs.host_state,  hostState);
        const guestNewArmored = detectNewlyArmored(bs.guest_state, guestState);
        const armorEntries: StackEntry[] = [];
        for (const cardNum of hostNewArmored) {
          armorEntries.push(...collectArmorTriggers(cardNum, bs.host_id, hostState, guestState));
        }
        for (const cardNum of guestNewArmored) {
          armorEntries.push(...collectArmorTriggers(cardNum, bs.guest_id, hostState, guestState));
        }

        const pendingEntries = [...banishEntries, ...bloomOnPlayPE, ...armorEntries];
        if (pendingEntries.length > 0) {
          const turnPlayerId = bs.active_user_id ?? user.id;
          const existingStack = bs.effect_stack ?? null;
          update.effect_stack = existingStack
            ? pushToStack(existingStack, pendingEntries)
            : initStack(turnPlayerId, pendingEntries);
        } else {
          // インタラクション解決後にキューが空になったスタックをクリア
          const existingStack = bs.effect_stack ?? null;
          if (existingStack && isStackDone(existingStack)) {
            update.effect_stack = null;
          }
        }
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
      setEffectSelectedNums([]);
    } finally {
      setLoading(false);
    }
  };

  // SELECT_ZONE: 効果でデッキトップを場に出す際のゾーン選択
  const handleSelectZoneForEffect = async (zoneIndex: number) => {
    if (!bs?.pending_effect || loading) return;
    setLoading(true);
    try {
      const pe = bs.pending_effect;
      const inter = pe.interaction;
      if (inter.type !== 'SELECT_ZONE') return;
      const ownerIsHost = pe.sourcePlayerId === bs.host_id;
      const ownerState  = ownerIsHost ? bs.host_state : bs.guest_state;
      const otherState  = ownerIsHost ? bs.guest_state : bs.host_state;
      const isOwnerTurn = bs.active_user_id === pe.sourcePlayerId;
      const ctxPowers = calcFieldPowers(ownerState, otherState, isOwnerTurn, effectsMap, battleCardMap);
      const allColorSigniNums = new Set([...collectAllColorSigniForField(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectAllColorSigniForField(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const fieldSigniExtraColors = new Map([...collectFieldSigniExtraColors(ownerState, battleCardMap, effectsMap, otherState, isOwnerTurn), ...collectFieldSigniExtraColors(otherState, battleCardMap, effectsMap, ownerState, !isOwnerTurn)]);
      const ctx: ExecCtx = { ownerState, otherState, cardMap: battleCardMap, logs: [], effectivePowers: ctxPowers, sourceCardNum: pe.sourceCardNum, allColorSigniNums, fieldSigniExtraColors };

      const result = resumeSelectZone(zoneIndex, inter, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs, { defer: true });

      const hostState  = ownerIsHost ? result.ownerState : result.otherState;
      const guestState = ownerIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState };
      if (!result.done) {
        const { respondPlayerId: _drop, ...peBase } = pe;
        update.pending_effect = { ...peBase, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
        const existingStack = bs.effect_stack ?? null;
        if (existingStack && isStackDone(existingStack)) update.effect_stack = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      await flushBattleLogs();
    } finally {
      setLoading(false);
    }
  };

  /**
   * フィールド上の全シグニから、指定イベントに反応する AUTO 効果を収集して StackEntry[] を返す。
   * 召喚されたカード自身（triggerScope='self'）はここでは除き、queueCardEffects で別途処理する。
   */
  const collectFieldTriggers = (
    event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI',
    triggeringCardNum: string,
    myState: PlayerState,
    opState: PlayerState,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    const opId = isHost ? bs.guest_id : bs.host_id;

    // 自分のフィールド：'any_ally' または 'any' トリガー
    // BLOCK_OWN_SIGNI_AUTO: 設定時は自シグニの【自】能力をスキップ（GRANT_ABILITY_INNER_TEXT付与）
    const ownAutoBlocked = myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
    for (const stack of myState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      if (topNum === triggeringCardNum) continue; // 自身は除く（ON_PLAYは queueCardEffects で処理）
      if (ownAutoBlocked) continue;
      const effects = effectsMap.get(topNum) ?? [];
      for (const eff of effects) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes(event)) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_ally' && scope !== 'any') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（他のシグニ召喚時）`,
          effect: eff,
        });
      }
    }

    // 相手のフィールド：'any_opp' または 'any' トリガー（相手のシグニが自分の召喚に反応）
    // BLOCK_OPP_SIGNI_AUTO: 自分の blocked_actions に設定済みの場合、相手シグニAUTOをスキップ
    const oppAutoBlocked = myState.blocked_actions?.includes('BLOCK_OPP_SIGNI_AUTO');
    for (const stack of opState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      const effects = effectsMap.get(topNum) ?? [];
      for (const eff of effects) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes(event)) continue;
        if (oppAutoBlocked) continue; // BLOCK_OPP_AUTO_ABILITY_EXTENDED
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any' && scope !== 'any_opp') continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: opId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（シグニ召喚時）`,
          effect: eff,
        });
      }
    }

    return entries;
  };

  /**
   * 相手がアーツを使用したとき、ON_OPP_ARTS_USE トリガーを持つ自分のシグニを収集する。
   * activeCondition（HAS_CARD_IN_FIELD 等）を満たす場合のみスタックに追加する。
   */
  const collectOppArtsUseTriggers = (
    myState: PlayerState,
    opState: PlayerState,
    isMyTurnNow: boolean,
  ): StackEntry[] => {
    const entries: StackEntry[] = [];
    for (const stack of myState.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes('ON_OPP_ARTS_USE')) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, isMyTurnNow, battleCardMap)) continue;
        const cardName = battleCardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（相手アーツ使用時）`,
          effect: eff,
        });
      }
    }
    return entries;
  };

  // シグニ召喚（ゾーン選択後に実行）
  const handleSummonSigni = async (handIndex: number, zoneIndex: number) => {
    console.log('[handleSummonSigni] called', { handIndex, zoneIndex, isMyTurn, loading });
    if (!isMyTurn || loading) return;
    const summonCardNum = my.hand[handIndex];
    const summonCardData = battleCardMap.get(summonCardNum);
    const riseFilter = summonCardData ? getRiseFilter(summonCardData.EffectText ?? '') : null;
    const existingZoneStack = my.field.signi[zoneIndex] ?? [];
    // ライズ条件チェック
    if (riseFilter) {
      // ライズシグニ: 空きゾーンには出せない、条件不一致ゾーンにも出せない
      const existingTop = existingZoneStack.at(-1);
      if (!existingTop) return; // 空きゾーン不可
      const existingTopNum = getCardNum(existingTop);
      if (!matchesRiseFilter(existingTopNum, riseFilter, battleCardMap)) return;
    } else {
      // 通常シグニ: 空きゾーンにしか召喚できない
      if (existingZoneStack.length > 0) return;
    }
    if (isActionBlocked('PLAY_COLORLESS') && battleCardMap.get(my.hand[handIndex])?.Color === '無') return;
    // OPP_ZONE_PLACEMENT_RESTRICT: 相手が中央ゾーン(index=1)にLv3+配置不可
    const czRestrict = collectCenterZoneDeployRestrict(op, battleCardMap, effectsMap);
    if (czRestrict !== undefined && zoneIndex === 1) {
      const cardLvCZ = parseInt(battleCardMap.get(my.hand[handIndex])?.Level ?? '0') || 0;
      if (cardLvCZ >= czRestrict) return;
    }
    // DEPLOY_RESTRICT: signi_deploy_power_limit が設定されている場合、パワー上限以上のシグニ配置不可
    if (my.signi_deploy_power_limit !== undefined) {
      const cardPwr = parseInt(battleCardMap.get(my.hand[handIndex])?.Power ?? '0') || 0;
      if (cardPwr >= my.signi_deploy_power_limit) return;
    }
    setLoading(true);
    setPendingSigniSummon(null);
    try {
      const cardNum = my.hand[handIndex];
      const newSigni = [...my.field.signi] as (string[] | null)[];
      const isRise = !!riseFilter;
      if (isRise) {
        // ライズ: 既存スタックの上に積む（下カードはそのまま）
        newSigni[zoneIndex] = [...(existingZoneStack), cardNum];
      } else {
        newSigni[zoneIndex] = [cardNum];
      }
      // ライズ配置: ダウン・凍結状態は引き継がない（ルール：新たに場に出たシグニ）
      // 通常配置: ゾーンのダウン・凍結をリセット
      const newSigniDown   = [...(my.field.signi_down   ?? [false, false, false])];
      const newSigniFrozen = [...(my.field.signi_frozen  ?? [false, false, false])];
      const newCharms      = [...(my.field.signi_charms  ?? [null, null, null])];
      const newAcce        = [...(my.field.signi_acce    ?? [null, null, null])];
      newSigniDown[zoneIndex]   = false;
      newSigniFrozen[zoneIndex] = false;
      const zoneExtraTrash: string[] = [];
      // ライズ時: チャームはルール処理でトラッシュへ（アクセもリセット）
      if (newCharms[zoneIndex]) { zoneExtraTrash.push(newCharms[zoneIndex]!); newCharms[zoneIndex] = null; }
      if (newAcce[zoneIndex])   { zoneExtraTrash.push(newAcce[zoneIndex]!);   newAcce[zoneIndex]   = null; }
      const placed: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIndex),
        field: {
          ...my.field,
          signi: newSigni,
          signi_down:   newSigniDown,
          signi_frozen: newSigniFrozen,
          signi_charms: newCharms,
          signi_acce:   newAcce,
        },
        trash: [...my.trash, ...zoneExtraTrash],
      };

      // フィールド上の他のシグニの「他のシグニが出たとき」トリガーを収集
      const fieldEntries = collectFieldTriggers('ON_PLAY', cardNum, placed, op);

      // 召喚したカード自身の ON_PLAY 効果
      const ownEffects = effectsMap.get(cardNum) ?? [];
      const ownOnPlay = ownEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        (e.triggerScope === undefined || e.triggerScope === 'self') &&
        e.mandatory !== false,
      );
      // コスト付き任意【出】効果（mandatory: false + cost あり）
      const ownCostOnPlay = ownEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        (e.triggerScope === undefined || e.triggerScope === 'self') &&
        e.mandatory === false &&
        e.cost,
      );

      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      appendBattleLogs([`${cardName}を召喚`]);

      // 自身の mandatory ON_PLAY エントリ
      const ownEntries: StackEntry[] = ownOnPlay.map(eff => ({
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: eff.effectId,
        label: `${cardName} の【出】/【自】効果`,
        effect: eff,
      }));

      // コスト付き【出】効果があればモーダルで確認（DBはモーダル確定後に保存）
      if (ownCostOnPlay.length > 0) {
        setPendingSigniOnPlayCost({
          cardNum,
          costEffect: ownCostOnPlay[0],
          placedState: placed,
          mandatoryEntries: [...ownEntries, ...fieldEntries],
        });
        return;
      }

      if (ownOnPlay.length === 0 && fieldEntries.length === 0) {
        // 効果なし：そのまま保存
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: placed }).eq('room_id', roomId);
        return;
      }

      // すべてをスタックに積む
      const allEntries = [...ownEntries, ...fieldEntries];
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existing = bs?.effect_stack ?? null;
      const stack = existing
        ? pushToStack(existing, allEntries)
        : initStack(turnPlayerId, allEntries);

      const stateKey = isHost ? 'host_state' : 'guest_state';
      const { error: summonErr } = await supabase.from('battle_states')
        .update({ [stateKey]: placed, effect_stack: stack, pending_effect: null })
        .eq('room_id', roomId);
      if (summonErr) console.error('[handleSummonSigni] DB error:', summonErr);
    } finally {
      setLoading(false);
    }
  };

  // グロウ
  const myLrig = my.field.lrig ?? [];
  const currentLrigNum = myLrig[myLrig.length - 1] ?? null;
  const currentLrig = currentLrigNum ? battleCardMap.get(currentLrigNum) ?? null : null;
  const currentLrigLevel = currentLrig ? parseInt(currentLrig.Level) || 0 : 0;

  // 現在のルリグにグロウ色制限があるか確認（「このルリグは〜のルリグにしかグロウできない」）
  const growColorRestrictText = currentLrig?.EffectText?.match(/このルリグは(.+)のルリグにしかグロウできない/)?.[1] ?? null;
  const growCandidates = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData =>
      !!c &&
      c.Type === 'ルリグ' &&
      parseInt(c.Level) === currentLrigLevel + 1 &&
      // CardClass 互換チェック
      (!currentLrig || lrigClassesCompatible(currentLrig.CardClass, c.CardClass)) &&
      // 【グロウ】条件チェック（ライフクロス枚数・カード名・トラッシュ色数・エナ色種数・複数色制限）
      checkGrowCondition(extractGrowCondition(c.EffectText), my, currentLrig ?? undefined, battleCardMap) &&
      // グロウ色制限チェック（「青かつ黒のルリグにしかグロウできない」等）
      (!growColorRestrictText || (() => {
        const colors = growColorRestrictText.split(/かつ|と/).map(s => s.trim());
        const cColors = (c.Color ?? '').split(/[・,、]/).map(s => s.trim());
        return colors.every(col => cColors.includes(col));
      })())
    );

  // ルリグのクラス（制限チェック共通）
  const lrigClass = currentLrig?.CardClass ?? '';
  const ignoreRestriction = my.lrig_gained_types?.includes('__ignore_lrig_restriction__') ?? false;

  // シグニ召喚: リミット計算（アシストルリグ+1ずつ、lrig_limit_mod加算、LRIG_LIMIT_UP_AND_COLOR_GAIN加算）
  // OPP_CENTER_LRIG_LIMIT_SET_5: 相手フィールドにあれば基本リミットを5に上書き
  const oppBasicLimitOverride = op.field.signi.some(stack => {
    const top = stack?.at(-1);
    return top && (effectsMap.get(top) ?? []).some(eff =>
      eff.effectType === 'CONTINUOUS' &&
      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
      (eff.action as import('../types/effects').StubAction).id === 'OPP_CENTER_LRIG_LIMIT_SET_5'
    );
  }) ? 5 : undefined;
  // lrig_copy_opp_level_limit: WXK03-003A ルリグのリミットを相手センタールリグからコピー
  const oppCenterLrig = battleCardMap.get(op.field.lrig.at(-1) ?? '');
  const copyBaseLimitFromOpp = my.lrig_copy_opp_level_limit
    ? (parseInt(oppCenterLrig?.Limit ?? '0') || 0)
    : undefined;
  const lrigLimit = (oppBasicLimitOverride ?? copyBaseLimitFromOpp ?? (parseInt(currentLrig?.Limit ?? '0') || 0))
    + ((my.field.assist_lrig_l ?? []).length > 0 ? 1 : 0)
    + ((my.field.assist_lrig_r ?? []).length > 0 ? 1 : 0)
    + (my.lrig_limit_mod ?? 0)
    + (my.game_lrig_limit_bonus ?? 0)
    + myLrigColorAndLimitMods.limitDelta;
  const fieldSigniTopLevels: number[] = my.field.signi.map(stack => {
    if (!stack || stack.length === 0) return 0;
    const top = battleCardMap.get(stack[stack.length - 1]);
    return parseInt(top?.Level ?? '0') || 0;
  });
  const fieldSigniTotal = fieldSigniTopLevels.reduce((s, l) => s + l, 0);


  // アーツ候補（自分の lrig_deck からアーツカード）
  const artsCandidates: CardData[] = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData => !!c && c.Type === 'アーツ');

  // アシストグロウ候補（各ゾーンごとに、lrig_deck からアシストルリグを検索）
  const getAssistGrowCandidates = (side: 'l' | 'r'): CardData[] => {
    if (!bs) return [];
    const phase = bs.turn_phase;
    const stack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
    const topInstanceId = stack.length > 0 ? stack[stack.length - 1] : null;
    const topCard = topInstanceId ? battleCardMap.get(topInstanceId) : null;
    const topLevel = topCard !== undefined ? (parseInt(topCard?.Level ?? '-1') || 0) : -1;
    const topClass = topCard?.CardClass ?? '';
    const canGrowPhase =
      (phase === 'MAIN'           && isMyTurn) ||
      (phase === 'ATTACK_ARTS'    && isMyTurn) ||
      (phase === 'ATTACK_ARTS_OP' && !isMyTurn);
    if (!canGrowPhase) return [];
    return my.lrig_deck
      .map(num => battleCardMap.get(num))
      .filter((c): c is CardData => {
        if (!c || c.Type !== 'アシストルリグ') return false;
        const level = parseInt(c.Level) || 0;
        if (level !== topLevel + 1) return false;
        if (level > currentLrigLevel) return false;
        if (topClass && !lrigClassesCompatible(topClass, c.CardClass)) return false;
        const timingOk =
          (phase === 'MAIN' && c.Timing.includes('メインフェイズ')) ||
          ((phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') && c.Timing.includes('アタックフェイズ'));
        return timingOk;
      });
  };

  // スペルカットイン候補（自分の lrig_deck から、相手がスペル発動中のとき用）
  const cutinCandidates = my.lrig_deck
    .filter((num, i, arr) => arr.indexOf(num) === i)
    .map(num => battleCardMap.get(num))
    .filter((c): c is CardData =>
      !!c &&
      c.Timing.includes('スペルカットイン') &&
      meetsRestriction(c.Restriction, lrigClass, ignoreRestriction)
    );

  const toggleGrowCostCard = (idx: number) => {
    setSelectedGrowCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const executeGrow = async (card: CardData, costIndices: Set<number>) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    setShowGrowModal(false);
    setPendingGrowCard(null);
    setSelectedGrowCost(new Set());
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const coinGain = parseInt(card.Coin) || 0;
      const growCoinCost = parseCoinCost(card.GrowCost);
      let newMyState: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, lrig: [...my.field.lrig, instanceId] },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), 'GROW'],
        coins: Math.min(5, Math.max(0, my.coins - growCoinCost) + coinGain),
        free_grow_this_turn: undefined,
      };
      // グロウ条件の追加効果（ルリグをデッキから下に置く・除外する等）
      const growCond = extractGrowCondition(card.EffectText);
      const { state: afterGrowEffect, log: growEffectLog } = applyGrowEffect(growCond, newMyState, battleCardMap);
      newMyState = afterGrowEffect;
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const cardName = card.CardName;
      const coinLog = coinGain > 0 ? `（コイン+${coinGain}）` : '';
      const logs = [`${cardName}にグロウ${coinLog}`];
      if (growEffectLog) logs.push(growEffectLog);
      // game_grow_draw: グロウ時ドロー（GAIN_ABILITY_THIS_GAME）
      if (newMyState.game_grow_draw && newMyState.deck.length > 0) {
        const drawCard = newMyState.deck[newMyState.deck.length - 1];
        newMyState = { ...newMyState, deck: newMyState.deck.slice(0, -1), hand: [...newMyState.hand, drawCard] };
        logs.push('グロウ時ドロー（このゲーム）');
      }
      appendBattleLogs(logs);

      // ルリグの ON_PLAY 効果を確認（COPY_LRIG_NAME_ABILITYコピー効果も含む）
      const ownEffects = effectsMap.get(cardNum) ?? [];
      // SUPPRESS_CENTER_ON_PLAY: このターンセンタールリグの【出】能力を抑制
      const suppressLrigPlay = newMyState.suppress_center_on_play === true;
      const copiedOnPlayEffects = suppressLrigPlay ? [] : collectCopiedLrigAutoEffects(newMyState, battleCardMap, effectsMap, op, isMyTurn)
        .filter(e => e.timing?.includes('ON_PLAY'));
      const allOnPlayEffects = suppressLrigPlay ? [] : [...ownEffects, ...copiedOnPlayEffects];
      const mandatoryOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        e.mandatory !== false,
      );
      const costOnPlay = allOnPlayEffects.filter(e =>
        e.effectType === 'AUTO' &&
        e.timing?.includes('ON_PLAY') &&
        e.mandatory === false &&
        e.cost,
      );
      if (suppressLrigPlay) appendBattleLogs(['センタールリグの【出】能力は抑制されました']);

      // コスト付き任意【出】効果があればモーダルで確認
      if (costOnPlay.length > 0) {
        const mandatoryEntries: StackEntry[] = mandatoryOnPlay.map(eff => ({
          id: generateUUID(), playerId: user.id, cardNum,
          effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
        }));
        setPendingSigniOnPlayCost({
          cardNum, costEffect: costOnPlay[0],
          placedState: newMyState, mandatoryEntries,
        });
        return;
      }

      if (mandatoryOnPlay.length === 0) {
        await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
        return;
      }

      // mandatory ON_PLAY 効果をスタックに積む
      const entries: StackEntry[] = mandatoryOnPlay.map(eff => ({
        id: generateUUID(), playerId: user.id, cardNum,
        effectId: eff.effectId, label: `${cardName} の【出】効果`, effect: eff,
      }));
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existing = bs?.effect_stack ?? null;
      const stack = existing ? pushToStack(existing, entries) : initStack(turnPlayerId, entries);
      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, effect_stack: stack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  const toggleRemoveZone = (zi: number) => {
    setSelectedRemoveZones(prev => {
      const next = new Set(prev);
      if (next.has(zi)) next.delete(zi); else next.add(zi);
      return next;
    });
  };

  const handleRemove = async () => {
    if (!isMyTurn || loading || selectedRemoveZones.size === 0) return;
    setLoading(true);
    setShowRemoveModal(false);
    try {
      const newSigni = [...my.field.signi] as (string[] | null)[];
      let newTrash = [...my.trash];
      const removedSigniNums: string[] = [];
      for (const zi of selectedRemoveZones) {
        const stack = my.field.signi[zi] ?? [];
        const top = stack.at(-1);
        if (top) removedSigniNums.push(top);
        newTrash = [...newTrash, ...stack];
        newSigni[zi] = null;
      }
      const newMyState: PlayerState = {
        ...my,
        field: { ...my.field, signi: newSigni },
        trash: newTrash,
        actions_done: [...(my.actions_done ?? []), 'REMOVE'],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // ON_TRASH トリガー（フィールドから直接トラッシュ）
      const removeTrashEntries: StackEntry[] = [];
      for (const cn of removedSigniNums) {
        removeTrashEntries.push(...collectTrashTriggers(cn, user.id, newMyState, op));
      }
      if (removeTrashEntries.length > 0) {
        const existing = bs?.effect_stack ?? null;
        const stack = existing ? pushToStack(existing, removeTrashEntries) : initStack(user.id, removeTrashEntries);
        await supabase.from('battle_states').update({ [stateKey]: newMyState, effect_stack: stack }).eq('room_id', roomId);
      } else {
        await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
      setSelectedRemoveZones(new Set());
    }
  };

  const toggleArtsCostCard = (idx: number) => {
    setSelectedArtsCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const executeArts = async (card: CardData, costIndices: Set<number>, betting: boolean = false, encore: boolean = false, discardIndices: Set<number> = new Set(), useKeySub = false) => {
    if (loading) return;
    if (isActionBlocked('USE_ARTS')) return;
    setLoading(true);
    setShowArtsModal(false);
    setPendingArtsCard(null);
    setSelectedArtsCost(new Set());
    setSelectedArtsDiscard(new Set());
    setIsBetting(false);
    setIsEncore(false);
    setKeySubstituteEnabled(false);
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      const betCost = betting ? parseBetCost(card.EffectText ?? '') : 0;
      const encoreCoinCost = encore ? (parseEncoreCost(card.EffectText ?? '')?.coins ?? 0) : 0;
      // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）
      const keySub = useKeySub && myEnergyTrashSubInfo.keySubInstId;
      const lrigTrashBase = encore ? my.lrig_trash : [...my.lrig_trash, instanceId];
      const paid: PlayerState = {
        ...my,
        lrig_deck: encore
          ? [instanceId, ...newLrigDeck]    // アンコール：ルリグデッキ先頭に戻す
          : newLrigDeck,
        energy: newEnergy,
        hand: newHand,
        lrig_trash: keySub ? [...lrigTrashBase, myEnergyTrashSubInfo.keySubInstId!] : lrigTrashBase,
        trash: [...my.trash, ...paidNums, ...discardNums],
        coins: Math.max(0, my.coins - betCost - encoreCoinCost),
        field: keySub ? { ...my.field, key_piece: null } : my.field,
        actions_done: [...(my.actions_done ?? []), 'USE_ARTS', ...((betCost > 0 || encoreCoinCost > 0) ? ['COIN_SPENT'] : [])],
      };
      if (betting && betCost > 0) appendBattleLogs([`ベット：コイン${betCost}枚消費`]);
      if (encore) appendBattleLogs([`アンコール：${card.CardName}をルリグデッキに戻す`]);
      // アーツ効果を発火
      const fired = await queueCardEffects(instanceId, ['ACTIVATED'], [], paid, op);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: paid }).eq('room_id', roomId);
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── キーピース使用 ──
  const executeKeyPiece = async (card: CardData, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setShowKeyModal(false);
    setPendingKeyCard(null);
    setSelectedKeyCost(new Set());
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const coinCost = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
      const paid: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, key_piece: instanceId },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        coins: Math.max(0, my.coins - coinCost),
      };
      const fired = await queueCardEffects(instanceId, ['AUTO'], ['ON_PLAY'], paid, op);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: paid }).eq('room_id', roomId);
      }
      setCloseZoneSignal(s => s + 1);
    } finally {
      setLoading(false);
    }
  };

  // ── キーピース起動効果 ──
  const executeKeyActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set()) => {
    if (loading) return;
    setLoading(true);
    setPendingKeyActivated(null);
    setSelectedKeyActivatedCost(new Set());
    setSelectedKeyActivatedDiscard(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        hand: newHand,
        trash: [...my.trash, ...paidNums, ...discardNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack ? pushToStack(existingStack, [entry]) : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ グロウ ──
  const executeAssistGrow = async (card: CardData, side: 'l' | 'r', costIndices: Set<number>) => {
    if (!isMyTurn || loading) return;
    setLoading(true);
    setShowAssistGrowModal(false);
    setPendingAssistGrowCard(null);
    setPendingAssistSide(null);
    setSelectedAssistGrowCost(new Set());
    try {
      const cardNum = card.CardNum;
      const idx = my.lrig_deck.findIndex(id => getCardNum(id) === cardNum);
      const instanceId = idx >= 0 ? my.lrig_deck[idx] : cardNum;
      const newLrigDeck = idx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, idx), ...my.lrig_deck.slice(idx + 1)];
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const sideKey = side === 'l' ? 'assist_lrig_l' : 'assist_lrig_r';
      const currentStack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
      const assistCoinGain = parseInt(card.Coin) || 0;
      const newMyState: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        field: { ...my.field, [sideKey]: [...currentStack, instanceId] },
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        coins: Math.min(5, my.coins + assistCoinGain),
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // アシストルリグの ON_PLAY 効果をスタックに積む
      const assistOnPlay = (effectsMap.get(cardNum) ?? []).filter(e =>
        e.effectType === 'AUTO' && e.timing?.includes('ON_PLAY') && e.mandatory !== false
      );
      if (assistOnPlay.length > 0) {
        const entries: StackEntry[] = assistOnPlay.map(eff => ({
          id: generateUUID(), playerId: user.id, cardNum,
          effectId: eff.effectId,
          label: `${card.CardName} の【出】効果`,
          effect: eff,
        }));
        const existing = bs?.effect_stack ?? null;
        const stack = existing ? pushToStack(existing, entries) : initStack(bs?.active_user_id ?? user.id, entries);
        await supabase.from('battle_states').update({ [stateKey]: newMyState, effect_stack: stack }).eq('room_id', roomId);
      } else {
        await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // ── アシストルリグ 起動効果 ──
  const executeAssistActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardIndices: Set<number> = new Set()) => {
    if (loading) return;
    setLoading(true);
    setPendingAssistActivated(null);
    setSelectedAssistActivatedCost(new Set());
    setSelectedAssistActivatedDiscard(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardIndices.has(i));
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        hand: newHand,
        trash: [...my.trash, ...paidNums, ...discardNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack ? pushToStack(existingStack, [entry]) : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  const toggleSpellCostCard = (idx: number) => {
    setSelectedSpellCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // スペル発動: 手札から除いてコスト支払い → pending_spell をセット（カットイン待ち）
  const castSpell = async (card: CardData, costIndices: Set<number>, handIdx: number) => {
    if (!isMyTurn || loading) return;
    if (isActionBlocked('USE_SPELL')) return;
    if (isActionBlocked('PLAY_COLORLESS') && card.Color === '無') return;
    if (isActionBlocked('BLOCK_NON_WHITE_SPELL') && !card.Color?.includes('白')) return;
    // BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT: 相手フィールドのチャーム数以下コストのスペルは使用不可
    const spellBlockThreshold = collectBlockLowCostSpellCount(op, battleCardMap, effectsMap);
    if (spellBlockThreshold > 0) {
      const spellTotalCost = parseGrowCost(card.Cost ?? '').reduce((s, c) => s + c.count, 0);
      if (spellTotalCost <= spellBlockThreshold) {
        appendBattleLogs([`スペル使用不可: コスト${spellTotalCost}≤相手チャーム数${spellBlockThreshold}`]);
        return;
      }
    }
    setLoading(true);
    setPendingSpellCast(null);
    setSelectedSpellCost(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.filter((_, i) => i !== handIdx),
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), 'USE_SPELL'],
      };
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // handからはインスタンスIDで正確な1枚を参照する
      const spell: PendingSpell = { caster_id: user.id, card_num: my.hand[handIdx] ?? card.CardNum };
      await supabase.from('battle_states')
        .update({ [stateKey]: newMyState, pending_spell: spell })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // スペルカットインをパス → スペル解決（スペル効果を発火）
  const handleCutinPass = async () => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    setPendingCutinCard(null);
    setSelectedCutinCost(new Set());
    try {
      const { caster_id, card_num } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      const nonCasterState = casterIsHost ? bs.guest_state : bs.host_state;
      // NEGATE_SPELL: casterStateにspell_negated_this_turnがあればコスト合計5以下のスペルを打ち消す
      if (casterState.spell_negated_this_turn) {
        const spellCard = battleCardMap.get(card_num);
        const spellTotalCostNS = parseGrowCost(spellCard?.Cost ?? '').reduce((s, c) => s + c.count, 0);
        if (spellTotalCostNS <= 5) {
          const spellNameNS = spellCard?.CardName ?? card_num;
          const negatedCasterState: PlayerState = {
            ...casterState,
            trash: [...casterState.trash, card_num],
            spell_negated_this_turn: undefined,
          };
          const hostStateNS  = casterIsHost ? negatedCasterState : nonCasterState;
          const guestStateNS = casterIsHost ? nonCasterState : negatedCasterState;
          appendBattleLogs([`[スペル打ち消し] ${spellNameNS}（コスト${spellTotalCostNS}）が打ち消された`]);
          await supabase.from('battle_states')
            .update({ host_state: hostStateNS, guest_state: guestStateNS, pending_spell: null, pending_effect: null })
            .eq('room_id', roomId);
          return;
        }
      }

      const resolved: PlayerState = { ...casterState, trash: [...casterState.trash, card_num] };

      // スペル効果を発火（casterがowner）
      const effects = effectsMap.get(card_num) ?? [];
      const spellEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!spellEff) {
        await supabase.from('battle_states')
          .update({
            [casterIsHost ? 'host_state' : 'guest_state']: resolved,
            pending_spell: null, pending_effect: null,
          })
          .eq('room_id', roomId);
        return;
      }

      const spellWho = caster_id === user.id ? '自分' : '相手';
      const spellName = battleCardMap.get(card_num)?.CardName ?? card_num;
      appendBattleLogs([`[${spellWho}] ${spellName}を使用`]);
      const spellPowers = calcFieldPowers(resolved, nonCasterState, bs.active_user_id === caster_id, effectsMap, battleCardMap);
      const spellIsOwnerTurn = bs.active_user_id === caster_id;
      const spellAllColorSigniNums = new Set([...collectAllColorSigniForField(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn), ...collectAllColorSigniForField(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn)]);
      const spellExtraColors = new Map([...collectFieldSigniExtraColors(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn), ...collectFieldSigniExtraColors(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn)]);
      const ctx: ExecCtx = { ownerState: resolved, otherState: nonCasterState, cardMap: battleCardMap, logs: [], effectivePowers: spellPowers, sourceCardNum: card_num, allColorSigniNums: spellAllColorSigniNums, fieldSigniExtraColors: spellExtraColors };
      const result = executeEffect(spellEff, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      const hostState  = casterIsHost ? result.ownerState : result.otherState;
      const guestState = casterIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      if (!result.done) {
        update.pending_effect = { sourcePlayerId: caster_id, sourceCardNum: card_num, effectId: spellEff.effectId, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  const toggleCutinCostCard = (idx: number) => {
    setSelectedCutinCost(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  // カットイン使用 → カットイン効果発火・スペルをトラッシュ（打ち消し）
  const handleCutinUse = async (cutinCard: CardData, costIndices: Set<number>) => {
    if (!bs.pending_spell || loading) return;
    setLoading(true);
    setPendingCutinCard(null);
    setSelectedCutinCost(new Set());
    try {
      const { caster_id, card_num } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState = casterIsHost ? bs.host_state : bs.guest_state;
      // スペルをトラッシュへ（打ち消し）
      const newCasterState: PlayerState = { ...casterState, trash: [...casterState.trash, card_num] };
      // カットインコスト支払い＆ルリグデッキから除去
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const lrigIdx = my.lrig_deck.findIndex(id => getCardNum(id) === cutinCard.CardNum);
      const cutinInstanceId = lrigIdx >= 0 ? my.lrig_deck[lrigIdx] : cutinCard.CardNum;
      const newLrigDeck = lrigIdx === -1 ? my.lrig_deck
        : [...my.lrig_deck.slice(0, lrigIdx), ...my.lrig_deck.slice(lrigIdx + 1)];
      const cutinPaid: PlayerState = {
        ...my,
        lrig_deck: newLrigDeck,
        energy: newEnergy,
        lrig_trash: [...my.lrig_trash, cutinInstanceId],
        trash: [...my.trash, ...paidNums],
      };
      // カットイン効果発火（ownerState=me, otherState=caster）
      const effects = effectsMap.get(cutinInstanceId) ?? [];
      const cutinEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!cutinEff) {
        const myKey = isHost ? 'host_state' : 'guest_state';
        const casterKey = casterIsHost ? 'host_state' : 'guest_state';
        // myとcasterが同じキーになる場合の処理
        if (myKey === casterKey) {
          // 自分がcasterとはならない（カットインは非キャスター側）
          await supabase.from('battle_states')
            .update({ [myKey]: cutinPaid, pending_spell: null })
            .eq('room_id', roomId);
        } else {
          await supabase.from('battle_states')
            .update({ [myKey]: cutinPaid, [casterKey]: newCasterState, pending_spell: null })
            .eq('room_id', roomId);
        }
        return;
      }
      appendBattleLogs([`[自分] ${cutinCard.CardName}を使用（カットイン）`]);
      // ownerState=cutinPaid(me), otherState=newCasterState
      const cutinPowers = calcFieldPowers(cutinPaid, newCasterState, bs.active_user_id === user.id, effectsMap, battleCardMap);
      const cutinIsOwnerTurn = bs.active_user_id === user.id;
      const cutinAllColorSigniNums = new Set([...collectAllColorSigniForField(cutinPaid, battleCardMap, effectsMap, newCasterState, cutinIsOwnerTurn), ...collectAllColorSigniForField(newCasterState, battleCardMap, effectsMap, cutinPaid, !cutinIsOwnerTurn)]);
      const cutinExtraColors = new Map([...collectFieldSigniExtraColors(cutinPaid, battleCardMap, effectsMap, newCasterState, cutinIsOwnerTurn), ...collectFieldSigniExtraColors(newCasterState, battleCardMap, effectsMap, cutinPaid, !cutinIsOwnerTurn)]);
      const ctx: ExecCtx = { ownerState: cutinPaid, otherState: newCasterState, cardMap: battleCardMap, logs: [], effectivePowers: cutinPowers, sourceCardNum: cutinInstanceId, allColorSigniNums: cutinAllColorSigniNums, fieldSigniExtraColors: cutinExtraColors };
      const result = executeEffect(cutinEff, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      // myがhost/guestに応じてマッピング
      const hostState  = isHost ? result.ownerState : result.otherState;
      const guestState = isHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      if (!result.done) {
        update.pending_effect = { sourcePlayerId: user.id, sourceCardNum: cutinCard.CardNum, effectId: cutinEff.effectId, interaction: result.pending } satisfies PendingEffect;
      } else {
        update.pending_effect = null;
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // フェイズ別・手札カードアクションを返す
  const getMyHandCardActions = (cardNum: string, handIndex: number): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const actionList: CardAction[] = [];

    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked) {
        actionList.push({
          label: 'エナチャージ',
          color: C.accent,
          onClick: () => handleEnergyChargeFromHand(handIndex),
        });
      }
    }

    if (bs.turn_phase === 'MAIN') {
      const cardData = battleCardMap.get(cardNum);
      if (cardData?.Type === 'シグニ') {
        const signiLevel = parseInt(cardData.Level) || 0;
        // レベル制限: シグニLv ≤ ルリグLv
        const levelOk = signiLevel <= currentLrigLevel;
        // リミット制限: 空きゾーンに召喚後の合計レベルがリミット以内であること
        const canFitSomewhere = [0, 1, 2].some(zi => {
          const isEmpty = (my.field.signi[zi] ?? []).length === 0;
          return isEmpty && (fieldSigniTotal + signiLevel) <= lrigLimit;
        });
        // Restriction チェック
        const restrictionOk = meetsRestriction(cardData.Restriction, lrigClass, ignoreRestriction);
        if (levelOk && canFitSomewhere && restrictionOk) {
          actionList.push({
            label: '召喚',
            color: C.success,
            onClick: () => setPendingSigniSummon({ cardNum, handIndex }),
          });
        }
      }
      if (cardData?.Type === 'スペル' && meetsRestriction(cardData.Restriction, lrigClass, ignoreRestriction) &&
          !my.blocked_card_names?.includes(cardData.CardName)) {
        // pending_spell がある間は新たにスペルを発動できない
        const spellBlocked = !!bs.pending_spell;
        const spellEff = effectsMap.get(cardNum)?.find(e => e.effectType === 'ACTIVATED');
        const condOk = !spellEff?.condition || evalUseCondition(spellEff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers);
        if (!spellBlocked && condOk) {
          actionList.push({
            label: '発動',
            color: C.accent,
            onClick: () => { setPendingSpellCast({ cardNum, handIndex }); setSelectedSpellCost(new Set()); },
          });
        }
      }
    }

    return actionList;
  };

  // ルリグデッキのカードアクション（アーツ / キーピース / アシストルリグ）
  const getMyLrigDeckCardActions = (cardNum: string): CardAction[] => {
    if (loading) return [];
    const cardData = battleCardMap.get(cardNum);
    if (!cardData) return [];
    if (!meetsRestriction(cardData.Restriction, lrigClass, ignoreRestriction)) return [];

    const phase = bs.turn_phase;
    const actions: CardAction[] = [];

    // ── アーツ ──
    if (cardData.Type === 'アーツ') {
      // blocked_card_names チェック
      if (my.blocked_card_names?.includes(cardData.CardName)) return actions;
      const canUse =
        !isActionBlocked('USE_ARTS') && (
          (phase === 'MAIN'           && isMyTurn  && cardData.Timing.includes('メインフェイズ'))  ||
          (phase === 'ATTACK_ARTS'    && isMyTurn  && cardData.Timing.includes('アタックフェイズ')) ||
          (phase === 'ATTACK_ARTS_OP' && !isMyTurn && cardData.Timing.includes('アタックフェイズ'))
        );
      const extraArtsCosts = activeCostMods.forMy
        .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
        .flatMap(m => m.amount);
      // SPECIFIC_CARD_COST_REDUCE: 特定カード名の無色コスト軽減を適用
      const specificReduction = specificCardCostReductions.find(r => r.targetCardName === cardData.CardName);
      const reducedArtsCost = specificReduction
        ? removeNColorFromCost(cardData.Cost, '無', specificReduction.colorlessReduction)
        : cardData.Cost;
      // 対戦相手ターン中の代替コストがあればそちらを使う
      const artsAltCost = !isMyTurn ? (effectsMap.get(cardNum)?.[0]?.altCostOppTurn) : undefined;
      const effectiveCostStr = artsAltCost ? energyCostToString(artsAltCost) : null;
      const costOk = effectiveCostStr
        ? canAffordGrowCost(my.energy, battleCards, effectiveCostStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors)
        : canAffordWithExtraCost(my.energy, battleCards, reducedArtsCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
      if (canUse && costOk) {
        actions.push({
          label: '使用',
          color: C.coin,
          onClick: () => {
            setPendingArtsCard(cardData);
            setPendingArtsEffectiveCost(effectiveCostStr ?? (specificReduction ? reducedArtsCost : null));
            setSelectedArtsCost(new Set());
            setShowArtsModal(true);
          },
        });
      }
    }

    // ── キーピース ──
    if ((cardData.Type === 'キー' || cardData.Type === 'ピース') && !my.field.key_piece) {
      const timing = cardData.Timing ?? '';
      const canUse =
        (phase === 'MAIN' && isMyTurn && (timing.includes('メインフェイズ') || !timing)) ||
        (phase === 'GROW' && isMyTurn && timing.includes('グロウフェイズ'));
      const coinNeeded = parseCoinCost(cardData.Cost) + parseCoinCost(cardData.GrowCost);
      const canAfford = my.coins >= coinNeeded && canAffordGrowCost(my.energy, battleCards, cardData.Cost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
      if (canUse && canAfford) {
        actions.push({
          label: 'キーにセット',
          color: '#cc8800',
          onClick: () => { setPendingKeyCard(cardData); setSelectedKeyCost(new Set()); setShowKeyModal(true); },
        });
      }
    }

    return actions;
  };

  // ライフクロスを1枚クラッシュし、チェック状態にする
  // returns: crashed=null + prevented=true → ダメージ無効、crashed=null + !prevented → ライフなし（即勝利判定）
  const crashOneLife = (state: PlayerState): { newState: PlayerState; crashed: string | null; prevented?: boolean } => {
    if ((state.prevent_next_damage ?? 0) > 0) {
      return {
        newState: { ...state, prevent_next_damage: (state.prevent_next_damage ?? 0) - 1 },
        crashed: null,
        prevented: true,
      };
    }
    if (state.life_cloth.length === 0) return { newState: state, crashed: null };
    const crashed = state.life_cloth[state.life_cloth.length - 1];
    return {
      newState: {
        ...state,
        life_cloth: state.life_cloth.slice(0, -1),
        field: { ...state.field, check: crashed },
      },
      crashed,
    };
  };

  // WXDi-P05-069: フリップアタック（ロビンフッドが自シグニを裏向きにしてアタック）
  const handleFlipAttack = async (attackZone: number, flipZones: number[]) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      const flippedCards: string[] = [];
      for (const zi of flipZones) {
        const top = my.field.signi[zi]?.at(-1);
        if (top && !my.field.signi_down?.[zi]) {
          newSigniDown[zi] = true; // 裏向き = ダウン状態で表現
          flippedCards.push(battleCardMap.get(top)?.CardName ?? top);
        }
      }
      const attackerName = battleCardMap.get(my.field.signi[attackZone]?.at(-1) ?? '')?.CardName ?? '';
      const newMyState: PlayerState = {
        ...my,
        field: { ...my.field, signi_down: newSigniDown as [boolean, boolean, boolean] },
        flip_attack_signi_zones: flipZones,
        attacked_signi_ids: [...(my.attacked_signi_ids ?? []), my.field.signi[attackZone]?.at(-1) ?? ''],
      };
      appendBattleLogs([`フリップアタック：${attackerName}がアタック（${flippedCards.join('・')}を裏向き）`]);
      // 正面の相手シグニとバトル（通常アタックと同じ処理だがアサシン的に直接ダメージ）
      const opZone = 2 - attackZone;
      if (!(op.field.signi[opZone]?.length)) {
        // 正面空き → ダメージ
        const newOtherState: PlayerState = { ...op, field: { ...op.field, lrig_attacked: false } };
        if (op.life_cloth.length > 0) {
          const crashed = op.life_cloth[op.life_cloth.length - 1];
          const opKey = isHost ? 'guest_state' : 'host_state';
          await supabase.from('battle_states')
            .update({ [stateKey]: newMyState, [opKey]: { ...op, life_cloth: op.life_cloth.slice(0, -1), field: { ...op.field, check: crashed } } })
            .eq('room_id', roomId);
          appendBattleLogs([`シグニアタック：ライフクロスをクラッシュ`]);
        } else {
          const opKey = isHost ? 'guest_state' : 'host_state';
          await supabase.from('battle_states').update({ [stateKey]: newMyState, [opKey]: newOtherState }).eq('room_id', roomId);
        }
      } else {
        // 正面にシグニ → バトル（通常アタックへ委譲）
        await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
        await handleSigniAttack(attackZone);
      }
    } finally { setLoading(false); }
  };

  // シグニアタック処理（キーワード能力対応）
  const handleSigniAttack = async (zoneIndex: number) => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_SIGNI') return;
    if (op.field.check) return; // 相手のライフバースト処理待ち中はアタック不可
    setLoading(true);
    try {
      const myTopNum = (my.field.signi[zoneIndex] ?? []).at(-1);
      if (!myTopNum) return;
      // GATE: blocked_actions に 'ATTACK:cardId' があればアタック不可
      if (my.blocked_actions?.includes(`ATTACK:${myTopNum}`)) return;

      const myCardName = battleCardMap.get(myTopNum)?.CardName ?? myTopNum;
      let opZoneIndex = 2 - zoneIndex; // 正面ゾーン（表示反転を考慮）
      let opStack = op.field.signi[opZoneIndex] ?? [];
      let opTopCardNum: string | null = opStack.length > 0 ? opStack[opStack.length - 1] : null;
      let opTopCard = opTopCardNum ? battleCardMap.get(opTopCardNum) : null;

      // REDIRECT_ATTACK_TO_SELF_ZONE: 正面が空の場合、このSTUBを持つ相手シグニのゾーンへリダイレクト
      if (!opTopCardNum) {
        for (let zi = 0; zi < op.field.signi.length; zi++) {
          const top = op.field.signi[zi]?.at(-1);
          if (!top) continue;
          const hasRedir = (effectsMap.get(top) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'REDIRECT_ATTACK_TO_SELF_ZONE',
          );
          if (hasRedir) {
            opZoneIndex = zi;
            opStack = op.field.signi[zi]!;
            opTopCardNum = top;
            opTopCard = battleCardMap.get(top) ?? null;
            appendBattleLogs([`${battleCardMap.get(top)?.CardName ?? top}がアタックをこのゾーンへリダイレクト`]);
            break;
          }
        }
      }

      const myKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';

      // 自分のシグニをダウン
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      newSigniDown[zoneIndex] = true;
      const newAttackedIds = [...(my.attacked_signi_ids ?? []), myTopNum];
      // OPP_SIGNI_ATTACK_COST: アタックにエナコストが必要な場合、エナを消費
      const signiAtkCostSA = my.signi_attack_cost ?? 0;
      const newEnergySA = signiAtkCostSA > 0 ? my.energy.slice(signiAtkCostSA) : my.energy;
      const newMyState: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown }, attacked_signi_ids: newAttackedIds, energy: newEnergySA };
      let newOpState = op;
      let banishedOpCardNum: string | null = null; // バニッシュされた相手シグニ

      // キーワード能力を確認
      const myGrants = my.keyword_grants;
      // CONTINUOUS GRANT_KEYWORD: 血晶武装状態のシグニへの動的キーワード付与を確認
      const myArmoredNums = new Set(
        my.field.signi.flatMap((stack, i) =>
          (my.field.signi_armor?.[i] && stack?.at(-1)) ? [stack.at(-1)!] : [],
        ),
      );
      const contGrantedKeywords = new Set<string>();
      for (const stack of my.field.signi) {
        if (!stack?.length) continue;
        const sourceNum = stack[stack.length - 1];
        for (const eff of (effectsMap.get(sourceNum) ?? [])) {
          if (eff.effectType !== 'CONTINUOUS') continue;
          const gkAction = eff.action.type === 'GRANT_KEYWORD' ? eff.action : null;
          if (!gkAction || (gkAction as import('../types/effects').GrantKeywordAction).target.count !== 'ALL') continue;
          const gkA = gkAction as import('../types/effects').GrantKeywordAction;
          if (gkA.target.filter?.isArmored && !myArmoredNums.has(myTopNum)) continue;
          if (gkA.target.filter?.isArmored === false && myArmoredNums.has(myTopNum)) continue;
          contGrantedKeywords.add(gkA.keyword);
        }
      }
      // ドライブ常 GRANT_KEYWORD: このシグニがドライブ状態のとき有効なキーワード付与
      if (my.lrig_riding_signi?.includes(myTopNum)) {
        for (const eff of (effectsMap.get(myTopNum) ?? [])) {
          if (eff.effectType !== 'CONTINUOUS') continue;
          if (eff.activeCondition?.type !== 'IS_DRIVE_STATE') continue;
          const gkDrive = eff.action.type === 'GRANT_KEYWORD'
            ? eff.action as import('../types/effects').GrantKeywordAction
            : null;
          if (gkDrive) contGrantedKeywords.add(gkDrive.keyword);
        }
      }
      // アクセカードのCONTINUOUS GRANT_KEYWORD効果をホストシグニに適用
      // 例: 「これにアクセされている＜調理＞のシグニは【ランサー】を得る」(WXEX1-70-E3等)
      const myZoneIdx = my.field.signi.findIndex(s => s?.at(-1) === myTopNum);
      if (myZoneIdx >= 0) {
        const acceNum = my.field.signi_acce?.[myZoneIdx] ?? null;
        if (acceNum) {
          for (const eff of (effectsMap.get(acceNum) ?? [])) {
            if (eff.effectType !== 'CONTINUOUS') continue;
            if (eff.activeCondition && eff.activeCondition.type !== 'IS_SELF_ACCE_CARD') continue;
            const gkA = eff.action.type === 'GRANT_KEYWORD'
              ? eff.action as import('../types/effects').GrantKeywordAction
              : null;
            if (!gkA) continue;
            if (gkA.target.owner === 'any' || gkA.target.owner === 'opponent') {
              const hostCard = battleCardMap.get(myTopNum);
              if (!hostCard) continue;
              // フィルター簡易チェック（story=クラス名のみ）
              if (gkA.target.filter?.story) {
                const stories = Array.isArray(gkA.target.filter.story)
                  ? gkA.target.filter.story
                  : [gkA.target.filter.story];
                if (!stories.some(s => hostCard.CardClass?.includes(s))) continue;
              }
              if (gkA.target.filter?.cardType && hostCard.Type !== gkA.target.filter.cardType) continue;
              contGrantedKeywords.add(gkA.keyword);
            }
          }
        }
      }
      const hasGrantedKeyword = (kw: string) =>
        hasKeyword(myTopNum, kw, battleCardMap, myGrants) || contGrantedKeywords.has(kw);
      const isAssassin    = hasGrantedKeyword('アサシン');
      const isLancer      = hasGrantedKeyword('ランサー');
      const isSLancer     = hasGrantedKeyword('Sランサー');
      const isDoubleCrush = hasGrantedKeyword('ダブルクラッシュ');

      // NEGATE_NTH_ATTACK: 相手（防御側）がN回目まで自動無効化フラグを持つ場合
      if ((op.negate_opp_signi_attacks_until ?? 0) > 0) {
        const remaining = (op.negate_opp_signi_attacks_until ?? 1) - 1;
        const newOpForNegate: PlayerState = { ...op, negate_opp_signi_attacks_until: remaining > 0 ? remaining : undefined };
        appendBattleLogs([`${myCardName}のアタックは無効化された（残り${remaining}回）`]);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpForNegate })
          .eq('room_id', roomId);
        return;
      }
      // NEGATE_THAT_ATTACK: 相手がop.negated_attacksにmyTopNumを登録していた場合、このアタックを無効化
      if ((op.negated_attacks ?? []).includes(myTopNum)) {
        const clearedNA = (op.negated_attacks ?? []).filter(id => id !== myTopNum);
        const newOpNA: PlayerState = { ...op, negated_attacks: clearedNA.length ? clearedNA : undefined };
        appendBattleLogs([`${myCardName}のアタックは無効化された`]);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpNA })
          .eq('room_id', roomId);
        return;
      }

      // アサシン：正面シグニを無視してライフへ直接アタック
      const effectivelyEmpty = !opTopCardNum || isAssassin;

      if (!effectivelyEmpty && opTopCardNum && opTopCard) {
        // ─── 通常バトル（正面シグニあり・アサシンなし）───
        const opCardName = opTopCard.CardName ?? opTopCardNum;
        const myPower = effectivePowers.get(myTopNum)
          ?? (parseInt(battleCardMap.get(myTopNum)?.Power ?? '0') || 0);
        const opPower = effectivePowers.get(opTopCardNum)
          ?? (parseInt(opTopCard.Power ?? '0') || 0);
        appendBattleLogs([`${myCardName}（${myPower}）vs ${opCardName}（${opPower}）`]);

        if (myPower >= opPower) {
          // バトル勝利：相手シグニをバニッシュ（チャームがあればトラッシュへ）
          const newOpDown   = [...(op.field.signi_down   ?? [false, false, false])];
          const newOpFrozen = [...(op.field.signi_frozen  ?? [false, false, false])];
          const newOpCharms = [...(op.field.signi_charms  ?? [null, null, null])];
          const newOpAcce   = [...(op.field.signi_acce    ?? [null, null, null])];
          const wasOpFrozen = newOpFrozen[opZoneIndex] ?? false;

          // BATTLE_LEAVE_REPLACE_WITH_DOWN: アップ状態のシグニはバニッシュ代わりにダウン（任意→自動適用）
          const opSigniWasUp = !(op.field.signi_down?.[opZoneIndex] === true);
          const leaveReplaceDown = opSigniWasUp && (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'BATTLE_LEAVE_REPLACE_WITH_DOWN',
          );
          if (leaveReplaceDown) {
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniLRD = [...op.field.signi] as (string[] | null)[];
            newOpState = { ...op, field: { ...op.field, signi: newOpSigniLRD, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（場離れ→ダウン代替）バニッシュ回避してダウン`]);
          } else {
          // COOKING_BANISH_SUBSTITUTE: 調理シグニにアクセがある場合、アクセをトラッシュしてバニッシュ回避（相手ターンのみ）
          const opTopCardClass = opTopCardNum ? (battleCardMap.get(opTopCardNum)?.CardClass ?? '') : '';
          const cookingBanishSub = isMyTurn && opTopCardClass.includes('調理') &&
            (op.field.signi_acce?.[opZoneIndex] ?? null) !== null &&
            op.field.signi.some(stack => {
              const top = stack?.at(-1);
              return top && (effectsMap.get(top) ?? []).some(eff =>
                eff.effectType === 'CONTINUOUS' &&
                (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
                (eff.action as import('../types/effects').StubAction).id === 'COOKING_BANISH_SUBSTITUTE' &&
                checkActiveCondition(eff.activeCondition, op, my, false, battleCardMap, top),
              );
            });
          if (cookingBanishSub) {
            const acceTrash = newOpAcce[opZoneIndex]!;
            newOpAcce[opZoneIndex] = null;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniCBS = [...op.field.signi] as (string[] | null)[];
            newOpState = { ...op, trash: [...op.trash, acceTrash], field: { ...op.field, signi: newOpSigniCBS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（調理バニッシュ代替）アクセをトラッシュしてバニッシュ回避`]);
          } else if (newOpAcce[opZoneIndex] && (effectsMap.get(newOpAcce[opZoneIndex]!) ?? []).some(eff =>
            eff.effectType === 'CONTINUOUS' &&
            (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
            (eff.action as import('../types/effects').StubAction).id === 'ACCE_BANISH_SUBSTITUTE')) {
            // ACCE_BANISH_SUBSTITUTE: アクセをゲームから除外してシグニをダウン（バニッシュ回避）
            const exiledAcce = newOpAcce[opZoneIndex]!;
            newOpAcce[opZoneIndex] = null;
            newOpDown[opZoneIndex] = true;
            newOpFrozen[opZoneIndex] = false;
            const newOpSigniABS = [...op.field.signi] as (string[] | null)[];
            newOpState = { ...op, trash: [...op.trash, exiledAcce], field: { ...op.field, signi: newOpSigniABS, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } };
            appendBattleLogs([`${opCardName}（アクセ代替バニッシュ）アクセをゲームから除外してダウン`]);
          } else {
            // RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE: 宇宙レゾナ場離れを代替シグニのトラッシュで回避
            const opTopCardData = opTopCardNum ? battleCardMap.get(opTopCardNum) : null;
            const resonaSubCardNum = (opTopCardData?.Type === 'レゾナ' && (opTopCardData?.CardClass ?? '').includes('宇宙'))
              ? (() => {
                  for (const stack of op.field.signi) {
                    const top = stack?.at(-1);
                    if (!top || top === opTopCardNum) continue;
                    const hasRLSSS = (effectsMap.get(top) ?? []).some(eff =>
                      eff.effectType === 'CONTINUOUS' &&
                      (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
                      (eff.action as import('../types/effects').StubAction).id === 'RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE' &&
                      checkActiveCondition(eff.activeCondition, op, my, false, battleCardMap, top),
                    );
                    if (hasRLSSS) return top;
                  }
                  return null;
                })()
              : null;
            if (resonaSubCardNum) {
              // 代替シグニをトラッシュ、レゾナを場に残す
              const subRemoved = removeFromField(resonaSubCardNum, { ...op, field: { ...op.field, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce } });
              newOpState = { ...subRemoved, trash: [...subRemoved.trash, resonaSubCardNum] };
              appendBattleLogs([`${opCardName}（レゾナ離脱代替）${battleCardMap.get(resonaSubCardNum)?.CardName ?? resonaSubCardNum}をトラッシュしてレゾナをフィールドに残す`]);
            } else {
          banishedOpCardNum = opTopCardNum;
          const newOpSigni = [...op.field.signi] as (string[] | null)[];
          newOpSigni[opZoneIndex] = null;
          newOpDown[opZoneIndex]   = false;
          newOpFrozen[opZoneIndex] = false;
          const banishExtraTrash: string[] = [];
          if (newOpCharms[opZoneIndex]) { banishExtraTrash.push(newOpCharms[opZoneIndex]!); newOpCharms[opZoneIndex] = null; }
          if (newOpAcce[opZoneIndex])   { banishExtraTrash.push(newOpAcce[opZoneIndex]!);   newOpAcce[opZoneIndex]   = null; }
          // ウィルスはゾーンに属するため、シグニがバニッシュされても除去しない
          const redirectBanish = my.banish_redirect === true;
          const redirectBanishToHand = my.banish_redirect_to_hand === true;
          // BANISH_BY_SELF_GOES_TO_TRASH: この攻撃シグニが banish_to_trash_by_self を持つ場合、バニッシュ先はトラッシュ
          const banishBySelftToTrash = (my.banish_to_trash_by_self ?? []).includes(myTopNum);
          // FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: 防御側CONTが有効なら凍結シグニはデッキ下へ
          // FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 攻撃側CONTが有効なら相手凍結シグニはトラッシュへ
          const opFrozenOvr = wasOpFrozen ? collectFrozenBanishOverrides(op, battleCardMap, effectsMap) : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const myFrozenOvr = wasOpFrozen ? collectFrozenBanishOverrides(my, battleCardMap, effectsMap) : { frozenBanishToDeckBottom: false, frozenLeaveToTrash: false };
          const frozenToDeckBottom = opFrozenOvr.frozenBanishToDeckBottom;
          const frozenToTrash = !frozenToDeckBottom && myFrozenOvr.frozenLeaveToTrash;
          // RISE_BANISH_SUBSTITUTE / BANISH_SUBSTITUTE_RISE_STACK:
          // ライズスタック（複数枚）のシグニがバニッシュされる場合、スタック下のカードをトラッシュに置いてバニッシュを回避
          const riseBanishSubSigni = collectRiseBanishSubstituteSigni(op, battleCardMap, effectsMap, my, !isMyTurn);
          const opTopHasRiseSub = riseBanishSubSigni.includes(opTopCardNum ?? '');
          const riseSubStack = opTopHasRiseSub ? (op.field.signi[opZoneIndex] ?? []) : [];
          const riseSubApplied = opTopHasRiseSub && riseSubStack.length >= 2;
          if (riseSubApplied) {
            // バニッシュ代替: スタック下2枚をトラッシュ、トップカードは残る
            const bottomCards = riseSubStack.slice(0, -1);
            const topCard = riseSubStack.at(-1)!;
            const newOpSigniRiseSub = [...newOpSigni] as (string[] | null)[];
            newOpSigniRiseSub[opZoneIndex] = [topCard]; // トップカードのみ残す
            newOpState = {
              ...op,
              trash: [...op.trash, ...bottomCards, ...banishExtraTrash],
              field: { ...op.field, signi: newOpSigniRiseSub, signi_down: newOpDown, signi_frozen: newOpFrozen, signi_charms: newOpCharms, signi_acce: newOpAcce },
            };
            appendBattleLogs([`${opCardName}（ライズ代替）スタック下${bottomCards.length}枚をトラッシュしてバニッシュ回避`]);
          } else {
          // BANISH_TO_LRIG_TRASH_INSTEAD: レゾナシグニはエナ代わりにlrig_trashへ（ルリグデッキ返却の近似）
          const banishToLrigTrash = !redirectBanish && !redirectBanishToHand && !frozenToDeckBottom && !frozenToTrash && !banishBySelftToTrash &&
            (effectsMap.get(opTopCardNum ?? '') ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'BANISH_TO_LRIG_TRASH_INSTEAD',
            );
          const anyRedirect = redirectBanish || redirectBanishToHand || frozenToDeckBottom || frozenToTrash || banishBySelftToTrash || banishToLrigTrash;
          newOpState = {
            ...op,
            hand: redirectBanishToHand ? [...op.hand, ...opStack] : op.hand,
            deck: frozenToDeckBottom ? [...op.deck, ...opStack] : op.deck,
            energy: anyRedirect ? op.energy : [...op.energy, ...opStack],
            lrig_trash: banishToLrigTrash ? [...op.lrig_trash, ...opStack] : op.lrig_trash,
            trash: (redirectBanish || frozenToTrash || banishBySelftToTrash)
              ? [...op.trash, ...opStack, ...banishExtraTrash]
              : (banishExtraTrash.length > 0 ? [...op.trash, ...banishExtraTrash] : op.trash),
            field: {
              ...op.field,
              signi: newOpSigni,
              signi_down:   newOpDown,
              signi_frozen: newOpFrozen,
              signi_charms: newOpCharms,
              signi_acce:   newOpAcce,
            },
          };
          appendBattleLogs([`${myCardName}が${opCardName}をバニッシュ${redirectBanish ? '（トラッシュへ）' : redirectBanishToHand ? '（手札へ）' : frozenToDeckBottom ? '（凍結→デッキ下）' : frozenToTrash ? '（凍結→トラッシュ）' : banishToLrigTrash ? '（ルリグトラッシュへ）' : ''}`]);
          }
          } // end resonaSubCardNum else
          } // end cookingBanishSub/acceBanishSub/resonaSub else
          } // end leaveReplaceDown else

          // ランサー/Sランサー：バトル勝利後に追加でライフを1枚クラッシュ
          if (isLancer || isSLancer) {
            const label = isSLancer ? 'Sランサー' : 'ランサー';
            const { newState: afterCrash, crashed, prevented } = crashOneLife(newOpState);
            if (prevented) {
              appendBattleLogs([`${label}：ダメージ無効`]);
              newOpState = afterCrash;
            } else if (!crashed) {
              if (isSLancer) {
              if (newOpState.prevent_defeat) {
                appendBattleLogs([`Sランサー：ライフなし → 敗北無効`]);
                newOpState = { ...newOpState, prevent_defeat: undefined };
              } else {
                // Sランサー：ライフなし → ダメージ → 相手の敗北
                appendBattleLogs([`Sランサー：ライフなし → ダメージ → 相手の敗北`]);
                await supabase.from('battle_states')
                  .update({ [myKey]: newMyState, [opKey]: newOpState, global_phase: 'FINISHED', winner_id: user.id })
                  .eq('room_id', roomId);
                return;
              }
              }
              // ランサー：ライフなし → 効果消滅（ダメージは与えない）
              appendBattleLogs([`ランサー：ライフなし（効果消滅）`]);
            } else {
              appendBattleLogs([`${label}：ライフクロスをクラッシュ`]);
              newOpState = afterCrash;
            }
          }
        } else {
          appendBattleLogs([`${myCardName}はバトルに敗北`]);
        }
      } else {
        // ─── ライフへのアタック（正面空 or アサシン）───
        const crashCount = isDoubleCrush ? 2 : 1;
        const attackLabel = isAssassin && opTopCardNum
          ? `${myCardName}（アサシン）がライフをクラッシュ`
          : `${myCardName}がライフをクラッシュ`;

        // 1枚目クラッシュ
        const { newState: afterFirst, crashed: firstCrashed, prevented: firstPrevented } = crashOneLife(newOpState);
        if (firstPrevented) {
          appendBattleLogs([`${myCardName}がアタック：ダメージ無効`]);
          newOpState = afterFirst;
        } else if (!firstCrashed) {
          if (newOpState.prevent_defeat) {
            appendBattleLogs([`${myCardName}がアタック：ライフなし → 敗北無効`]);
            newOpState = { ...newOpState, prevent_defeat: undefined };
          } else {
            // ライフなし → 相手の敗北
            appendBattleLogs([`${myCardName}がアタック：相手のライフなし → 相手の敗北`]);
            await supabase.from('battle_states')
              .update({ [myKey]: newMyState, global_phase: 'FINISHED', winner_id: user.id })
              .eq('room_id', roomId);
            return;
          }
        } else {
          appendBattleLogs([attackLabel]);
          newOpState = afterFirst;
        }

        if (crashCount > 1 && newOpState.life_cloth.length > 0) {
          // 公式ルール「同時クラッシュ」: 2枚目もライフから先に取り出す
          const secondCard = newOpState.life_cloth[newOpState.life_cloth.length - 1];
          newOpState = {
            ...newOpState,
            life_cloth: newOpState.life_cloth.slice(0, -1),
            pending_crashed_cards: [...(newOpState.pending_crashed_cards ?? []), secondCard],
          };
          appendBattleLogs([`ダブルクラッシュ：2枚目（${battleCardMap.get(secondCard)?.CardName ?? secondCard}）を同時クラッシュ予約`]);
        }
      }

      // MULTI_ZONE_ATTACK: 正面以外のゾーンにも追加バトル
      // 「アタックする」（強制）か「アタックできる」（任意）かをテキストで判定
      const mzaEffect = (effectsMap.get(myTopNum) ?? []).find(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' && (e.action as import('../types/effects').StubAction).id === 'MULTI_ZONE_ATTACK'
      );
      if (mzaEffect) {
        const myCardDataMZA = battleCardMap.get(myTopNum);
        const myTxtMZA = (myCardDataMZA?.EffectText ?? '') + ' ' + (myCardDataMZA?.BurstText ?? '');
        // 「アタックする」= 強制、「アタックできる」= 任意（デフォルト任意）
        const isForcedMZA = myTxtMZA.includes('シグニゾーンにもアタックする') && !myTxtMZA.includes('アタックできる');
        const myPowerMZA = effectivePowers.get(myTopNum) ?? (parseInt(myCardDataMZA?.Power ?? '0') || 0);
        for (let zi = 0; zi < 3; zi++) {
          if (zi === zoneIndex) continue; // 正面は既に処理済み
          const oppZiMZA = 2 - zi;
          const oppStackMZA = newOpState.field.signi[oppZiMZA] ?? [];
          const oppTopMZA = oppStackMZA.at(-1);
          if (!oppTopMZA) continue; // 相手シグニなし（空ゾーン）はダメージなしスキップ
          const oppPowerMZA = effectivePowers.get(oppTopMZA) ?? (parseInt(battleCardMap.get(oppTopMZA)?.Power ?? '0') || 0);
          // 「アタックできる」（任意）の場合: バトル判定はするが自動的に負けもあり得る
          // ゲーム上は「アタックを宣言するかどうか」を選択すべきだが、現状は自動適用
          // 「アタックする」（強制）の場合 or 自動でバトル判定
          if (isForcedMZA || myPowerMZA >= oppPowerMZA) {
            if (myPowerMZA >= oppPowerMZA) {
              // バニッシュ（追加ゾーンなのでダメージなし）
              const oppSigniMZA = [...newOpState.field.signi] as (string[] | null)[];
              oppSigniMZA[oppZiMZA] = null;
              const oppDownMZA = [...(newOpState.field.signi_down ?? [false, false, false])];
              oppDownMZA[oppZiMZA] = false;
              newOpState = {
                ...newOpState,
                energy: [...newOpState.energy, ...oppStackMZA],
                field: { ...newOpState.field, signi: oppSigniMZA, signi_down: oppDownMZA },
              };
              appendBattleLogs([`${myCardName}が${battleCardMap.get(oppTopMZA)?.CardName ?? oppTopMZA}をバニッシュ（追加ゾーン・ダメージなし）`]);
            } else {
              appendBattleLogs([`${myCardName}（${myPowerMZA}）vs ${battleCardMap.get(oppTopMZA)?.CardName ?? oppTopMZA}（${oppPowerMZA}）：追加ゾーンバトル負け`]);
            }
          }
        }
      }

      // ADJACENT_ZONE_ATTACK: 英知=10条件で隣ゾーン1つにも追加バトル（WD20-009等）
      const azaEffect = (effectsMap.get(myTopNum) ?? []).find(e =>
        e.effectType === 'CONTINUOUS' && e.action.type === 'STUB' &&
        (e.action as import('../types/effects').StubAction).id === 'ADJACENT_ZONE_ATTACK' &&
        checkActiveCondition(e.activeCondition, my, newOpState, isMyTurn, battleCardMap, myTopNum),
      );
      if (azaEffect) {
        const myPowerAZA = effectivePowers.get(myTopNum) ?? (parseInt(battleCardMap.get(myTopNum)?.Power ?? '0') || 0);
        const adjZones = [zoneIndex - 1, zoneIndex + 1].filter(zi => zi >= 0 && zi < 3);
        let bestAZAZi = -1;
        let bestAZAPower = Infinity;
        for (const zi of adjZones) {
          const oppZiAdj = 2 - zi;
          const oppTopAdj = newOpState.field.signi[oppZiAdj]?.at(-1);
          if (!oppTopAdj) continue;
          const oppPowerAdj = effectivePowers.get(oppTopAdj) ?? (parseInt(battleCardMap.get(oppTopAdj)?.Power ?? '0') || 0);
          if (oppPowerAdj < bestAZAPower) { bestAZAPower = oppPowerAdj; bestAZAZi = zi; }
        }
        if (bestAZAZi >= 0 && myPowerAZA >= bestAZAPower) {
          const oppZiAZA = 2 - bestAZAZi;
          const oppStackAZA = [...(newOpState.field.signi[oppZiAZA] ?? [])];
          const oppTopAZA = oppStackAZA.at(-1)!;
          const oppSigniAZA = [...newOpState.field.signi] as (string[] | null)[];
          oppSigniAZA[oppZiAZA] = null;
          const oppDownAZA = [...(newOpState.field.signi_down ?? [false, false, false])];
          oppDownAZA[oppZiAZA] = false;
          newOpState = {
            ...newOpState,
            energy: [...newOpState.energy, ...oppStackAZA],
            field: { ...newOpState.field, signi: oppSigniAZA, signi_down: oppDownAZA },
          };
          appendBattleLogs([`${myCardName}が${battleCardMap.get(oppTopAZA)?.CardName ?? oppTopAZA}をバニッシュ（英知=10隣ゾーン追加バトル）`]);
        }
      }

      // ヘブンヘブン判定: アタッカーダウン後に全クロスシグニがダウン状態か確認
      const heavenEntries: StackEntry[] = [];
      const attackerCard = battleCardMap.get(myTopNum);
      if (attackerCard?.hasCrossIcon) {
        const stateAfterDown: PlayerState = { ...my, field: { ...my.field, signi_down: newSigniDown } };
        const crossStates = collectCrossStates(stateAfterDown, battleCardMap);
        if (crossStates[zoneIndex]) {
          const crossZones = ([0, 1, 2] as const).filter(z => crossStates[z]);
          const allDowned = crossZones.every(z => newSigniDown[z]);
          if (allDowned && crossZones.length >= 2) {
            // ヘブンヘブン成立: 各クロスシグニのON_HEAVENトリガーを収集
            const heavenZoneNums = crossZones
              .map(z => (stateAfterDown.field.signi[z] ?? []).at(-1))
              .filter((n): n is string => !!n);
            for (const cardNum of heavenZoneNums) {
              for (const e of (effectsMap.get(cardNum) ?? [])) {
                if (e.effectType !== 'AUTO' || !e.timing?.includes('ON_HEAVEN')) continue;
                heavenEntries.push({
                  id: generateUUID(),
                  playerId: user.id,
                  cardNum,
                  effectId: e.effectId,
                  label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} の【クロス自】効果（ヘブンヘブン）`,
                  effect: e,
                } satisfies StackEntry);
              }
            }
            if (heavenEntries.length > 0 || crossZones.length >= 2) {
              appendBattleLogs([`ヘブンヘブン！ ${heavenZoneNums.map(n => battleCardMap.get(n)?.CardName ?? n).join(' & ')}`]);
              // heaven_state を更新
              const newHeavenState = [...(my.field.heaven_state ?? [false, false, false])];
              crossZones.forEach(z => { newHeavenState[z] = true; });
              newMyState.field = { ...newMyState.field, heaven_state: newHeavenState };
            }
          }
        }
      }

      // ON_ATTACK_SIGNI トリガー（アタックしたシグニ自身）
      const attackEntries: StackEntry[] = (effectsMap.get(myTopNum) ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_SIGNI'))
        .map(e => ({
          id: generateUUID(),
          playerId: user.id,
          cardNum: myTopNum,
          effectId: e.effectId,
          label: `${battleCardMap.get(myTopNum)?.CardName ?? myTopNum} の【自】効果（シグニアタック時）`,
          effect: e,
        } satisfies StackEntry));

      // ON_BANISH トリガー（バニッシュされた相手シグニ + フィールドトリガー）
      const newHostState  = isHost ? newMyState : newOpState;
      const newGuestState = isHost ? newOpState : newMyState;
      const banishEntries = banishedOpCardNum
        ? collectBanishTriggers(
            banishedOpCardNum,
            isHost ? bs.guest_id : bs.host_id,
            newHostState,
            newGuestState,
          )
        : [];

      // ON_ATTACK_SIGNI トリガー（防御側：相手シグニがアタックしたとき発動するAUTO効果）
      const opPlayerId = isHost ? bs.guest_id : bs.host_id;
      const opAtkedEntries: StackEntry[] = [];
      const opFrontZoneIdx = 2 - zoneIndex; // アタッカー正面ゾーン（防御側から見た）
      for (const opSigniStack of newOpState.field.signi) {
        const opTopNum = opSigniStack?.at(-1);
        if (!opTopNum) continue;
        for (const oe of (effectsMap.get(opTopNum) ?? [])) {
          if (oe.effectType !== 'AUTO' || !oe.timing?.includes('ON_ATTACK_SIGNI')) continue;
          const oeAct = oe.action as import('../types/effects').StubAction;
          if (oeAct.type !== 'STUB') continue;
          if (oeAct.id === 'MOVE_TO_OTHER_SIGNI_ZONE') {
            opAtkedEntries.push({
              id: generateUUID(),
              playerId: opPlayerId,
              cardNum: opTopNum,
              effectId: oe.effectId,
              label: `${battleCardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（相手シグニアタック時）`,
              effect: oe,
            } satisfies StackEntry);
          } else if (oeAct.id === 'MOVE_TO_ATTACKER_FRONT') {
            opAtkedEntries.push({
              id: generateUUID(),
              playerId: opPlayerId,
              cardNum: opTopNum,
              effectId: oe.effectId,
              label: `${battleCardMap.get(opTopNum)?.CardName ?? opTopNum} の【自】効果（アタッカー正面移動）`,
              effect: { ...oe, action: { ...oeAct, value: opFrontZoneIdx } },
            } satisfies StackEntry);
          }
        }
      }

      // ON_TRASH: banish_redirect=true の場合、バニッシュされたシグニがトラッシュへ
      const trashEntriesSA: StackEntry[] = [];
      if (banishedOpCardNum && my.banish_redirect === true) {
        trashEntriesSA.push(...collectTrashTriggers(banishedOpCardNum, opPlayerId, newMyState, newOpState));
      }

      const allTriggers = [...attackEntries, ...banishEntries, ...opAtkedEntries, ...trashEntriesSA, ...heavenEntries];
      if (allTriggers.length > 0) {
        const turnPlayerId = bs.active_user_id ?? user.id;
        const existingStack = bs.effect_stack ?? null;
        const stack = existingStack
          ? pushToStack(existingStack, allTriggers)
          : initStack(turnPlayerId, allTriggers);
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpState, effect_stack: stack })
          .eq('room_id', roomId);
      } else {
        await supabase.from('battle_states')
          .update({ [myKey]: newMyState, [opKey]: newOpState })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // ルリグアタック: 自分のルリグをダウンし相手にガード応答を要求
  const handleLrigAttack = async () => {
    if (!isMyTurn || loading || bs.turn_phase !== 'ATTACK_LRIG') return;
    if (my.field.lrig_down) return; // すでに攻撃済み
    if (op.field.lrig_attacked) return; // ガード応答待ち中
    if ((my.lrig_riding_signi?.length ?? 0) > 0) return; // ドライブ状態：ルリグはアタックできない
    // PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: negated_attacks にルリグIDがある場合アタック不可
    const myLrigNumLA = my.field.lrig.at(-1);
    if (myLrigNumLA && (my.negated_attacks ?? []).includes(myLrigNumLA)) return;
    // keyword_grants で「アタックできない」が付与されている場合アタック不可
    if (myLrigNumLA && (my.keyword_grants?.[myLrigNumLA] ?? []).includes('アタックできない')) return;
    setLoading(true);
    try {
      const myKey = isHost ? 'host_state' : 'guest_state';
      const opKey = isHost ? 'guest_state' : 'host_state';
      const lrigNum = my.field.lrig.at(-1) ?? '';
      const lrigName = battleCardMap.get(lrigNum)?.CardName ?? 'ルリグ';
      // OPP_LRIG_ATTACK_COST: 相手フィールドの効果による追加コスト支払い
      let myEnergyAfterAttack = my.energy;
      if (myLrigAttackExtraCost > 0 && my.energy.length >= myLrigAttackExtraCost) {
        const removed = myEnergyAfterAttack.slice(-myLrigAttackExtraCost);
        myEnergyAfterAttack = myEnergyAfterAttack.slice(0, -myLrigAttackExtraCost);
        appendBattleLogs([`ルリグアタック追加コスト（《無》×${myLrigAttackExtraCost}）消費：${removed.map(n=>battleCardMap.get(n)?.CardName??n).join('、')}`]);
      }
      appendBattleLogs([`${lrigName}がアタック`]);
      const newMyState: PlayerState = { ...my, energy: myEnergyAfterAttack, field: { ...my.field, lrig_down: true } };
      const newOpState: PlayerState = { ...op, field: { ...op.field, lrig_attacked: true } };

      // ON_ATTACK_LRIG AUTO トリガー収集（ルリグカード自身の効果 + スペル付与の能力 + COPY_LRIG_NAME_ABILITYコピー効果）
      const lrigCardEffects = (effectsMap.get(lrigNum) ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG'));
      const grantedAttackEffects = (my.lrig_granted_auto_effects ?? [])
        .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_LRIG'));
      const copiedAutoEffects = collectCopiedLrigAutoEffects(my, battleCardMap, effectsMap, op, isMyTurn)
        .filter(e => e.timing?.includes('ON_ATTACK_LRIG'));
      const onAttackEffects = [...lrigCardEffects, ...grantedAttackEffects, ...copiedAutoEffects];
      const update: Partial<BattleStateRow> = { [myKey]: newMyState, [opKey]: newOpState };
      if (onAttackEffects.length > 0) {
        const entries: StackEntry[] = onAttackEffects.map(e => ({
          id: generateUUID(),
          playerId: user.id,
          cardNum: lrigNum,
          effectId: e.effectId,
          label: `${lrigName} の【自】効果（アタック時）`,
          effect: e,
        }));
        const existing = bs.effect_stack ?? null;
        update.effect_stack = existing ? pushToStack(existing, entries) : initStack(user.id, entries);
      }
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ダブルクラッシュ等による追加ライフクラッシュ（バースト後に自動発動）
  // 同時クラッシュで先にライフから取り出したカードを check にセットして処理する
  const triggerPendingCrash = async () => {
    const pendingCards = my.pending_crashed_cards ?? [];
    if (!pendingCards.length || my.field.check || loading) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const [nextCard, ...remaining] = pendingCards;
      const newMyState: PlayerState = {
        ...my,
        pending_crashed_cards: remaining,
        field: { ...my.field, check: nextCard },
      };
      const crashedName = battleCardMap.get(nextCard)?.CardName ?? nextCard;
      appendBattleLogs([`ダブルクラッシュ：ライフクロスをクラッシュ（${crashedName}）`]);
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // パワー0以下シグニの自動バニッシュ処理
  const checkAndBanishPowerZero = async () => {
    if (!bs || loading || bs.global_phase !== 'PLAYING') return;
    if (bs.effect_stack || bs.pending_effect) return;

    const isMyTurnLocal = bs.active_user_id === bs.host_id;
    const powers = calcFieldPowers(bs.host_state, bs.guest_state, isMyTurnLocal, effectsMap, battleCardMap);

    // バニッシュ候補を先に収集してフィンガープリントで二重処理を防ぐ
    const candidates: string[] = [];
    for (const ownerIsHost of [true, false]) {
      const ownerState = ownerIsHost ? bs.host_state : bs.guest_state;
      const grants = ownerState.keyword_grants;
      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const power = powers.get(topNum) ?? parseInt(battleCardMap.get(topNum)?.Power ?? '0', 10);
        if (power > 0) continue;
        if (hasBanishResist(topNum, battleCardMap, grants)) continue;
        candidates.push(topNum);
      }
    }
    if (candidates.length === 0) return;

    const candidateKey = [...candidates].sort().join(',');
    if (candidateKey === lastBanishedKeyRef.current) return; // DB伝播待ち中の二重処理をスキップ
    lastBanishedKeyRef.current = candidateKey;

    let hostState  = bs.host_state;
    let guestState = bs.guest_state;
    const allTriggers: StackEntry[] = [];

    for (const ownerIsHost of [true, false]) {
      const ownerId = ownerIsHost ? bs.host_id : bs.guest_id;
      const ownerState = ownerIsHost ? hostState : guestState;
      const grants = ownerState.keyword_grants;

      for (const stack of ownerState.field.signi) {
        if (!stack?.length) continue;
        const topNum = stack[stack.length - 1];
        const power = powers.get(topNum) ?? parseInt(battleCardMap.get(topNum)?.Power ?? '0', 10);
        if (power > 0) continue;
        if (hasBanishResist(topNum, battleCardMap, grants)) continue;

        const currentOwner = ownerIsHost ? hostState : guestState;
        const removed = removeFromField(topNum, currentOwner);
        const opState = ownerIsHost ? guestState : hostState;
        const redirectBanishP0 = opState.banish_redirect === true;
        const redirectBanishToHandP0 = opState.banish_redirect_to_hand === true;
        const withBanished: PlayerState = redirectBanishP0
          ? { ...removed, trash: [...removed.trash, topNum] }
          : redirectBanishToHandP0
            ? { ...removed, hand: [...removed.hand, topNum] }
            : { ...removed, energy: [...removed.energy, topNum] };
        if (ownerIsHost) hostState = withBanished; else guestState = withBanished;
        const banishedName = battleCardMap.get(topNum)?.CardName ?? topNum;
        appendBattleLogs([`${banishedName}はパワー0以下のためバニッシュ${redirectBanishP0 ? '（トラッシュへ）' : redirectBanishToHandP0 ? '（手札へ）' : ''}`]);

        const triggers = collectBanishTriggers(topNum, ownerId, hostState, guestState);
        allTriggers.push(...triggers);
      }
    }

    const changed = candidates.length > 0;
    if (!changed) return;
    setLoading(true);
    try {
      let newStack = bs.effect_stack as EffectStack | null;
      if (allTriggers.length > 0) {
        newStack = initStack(bs.active_user_id!, allTriggers);
      }
      await supabase.from('battle_states').update({
        host_state: hostState,
        guest_state: guestState,
        ...(newStack !== bs.effect_stack ? { effect_stack: newStack } : {}),
      }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // refs を常に最新の関数インスタンスに同期（Rules of Hooks 対応）
  doPhaseAdvanceRef.current         = doPhaseAdvance;
  triggerPendingCrashRef.current    = triggerPendingCrash;
  resolveStackNextRef.current       = resolveStackNext;
  checkPowerZeroBanishRef.current   = checkAndBanishPowerZero;

  // ══════════════════════════════════════════
  // CPU AI ロジック（ターン行動）
  // ══════════════════════════════════════════

  // CPU ターン自動行動
  const cpuTurnAction = async () => {
    if (!bs || bs.global_phase !== 'PLAYING') return;
    const cpuSt = bs.guest_state;   // CPUは常にguest
    const huSt  = bs.host_state;    // 人間は常にhost
    const isCpuTurnNow = bs.active_user_id === CPU_PLAYER_ID;

    // 人間がライフバースト処理中（チェックゾーンにカードあり）はCPU行動しない
    if (huSt.field?.check) return;

    // ─── ライフバースト確認（チェックゾーンのカードを処理）───
    if (cpuSt.field?.check) {
      const cardNum = cpuSt.field.check;
      const burstCard = battleCardMap.get(cardNum);
      appendBattleLogs([`[CPU] ライフクロスをオープン: ${burstCard?.CardName ?? cardNum}（ライフバースト不発動）`]);
      // CPUはライフバーストを常に発動しない（エナに送るだけ）
      const newCpuSt: PlayerState = {
        ...cpuSt,
        energy: [...cpuSt.energy, cardNum],
        field: { ...cpuSt.field, check: null },
      };
      await supabase.from('battle_states').update({
        guest_state: newCpuSt,
        pending_effect: null,
      }).eq('room_id', roomId);
      return;
    }

    // ─── ルリグアタックのガード応答（CPUがlrig_attackedされている）───
    if (cpuSt.field?.lrig_attacked) {
      // CPUはガードしない
      let newCpuSt: PlayerState;
      if (cpuSt.prevent_lrig_damage) {
        appendBattleLogs([`[CPU] ルリグアタックを受けたがルリグダメージ無効`]);
        newCpuSt = { ...cpuSt, prevent_lrig_damage: undefined, field: { ...cpuSt.field, lrig_attacked: false } };
        await supabase.from('battle_states').update({ guest_state: newCpuSt }).eq('room_id', roomId);
        return;
      } else if (cpuSt.life_cloth.length > 0) {
        const crashed = cpuSt.life_cloth[cpuSt.life_cloth.length - 1];
        appendBattleLogs([`[CPU] ルリグアタックを受けた → ライフクロスクラッシュ（残り${cpuSt.life_cloth.length - 1}枚）`]);
        newCpuSt = {
          ...cpuSt,
          life_cloth: cpuSt.life_cloth.slice(0, -1),
          field: { ...cpuSt.field, lrig_attacked: false, check: crashed },
        };
      } else if (cpuSt.prevent_defeat) {
        appendBattleLogs([`[CPU] ルリグアタック：ライフなし → 敗北無効`]);
        newCpuSt = { ...cpuSt, prevent_defeat: undefined, field: { ...cpuSt.field, lrig_attacked: false } };
      } else {
        appendBattleLogs([`[CPU] ライフクロスが0枚 → あなたの勝利！`]);
        // ライフなし → 人間の勝利
        await supabase.from('battle_states').update({
          guest_state: { ...cpuSt, field: { ...cpuSt.field, lrig_attacked: false } },
          winner_id: user.id,
          global_phase: 'FINISHED',
        }).eq('room_id', roomId);
        return;
      }
      // MULTI_DAMAGE_ON_LRIG_ATTACK: 人間攻撃側に残りアタック回数があれば再トリガー
      let newHuStMD = huSt;
      if (huSt.lrig_attack_remaining && huSt.lrig_attack_remaining > 0) {
        const remMD = huSt.lrig_attack_remaining - 1;
        newHuStMD = { ...huSt, lrig_attack_remaining: remMD > 0 ? remMD : undefined };
        newCpuSt = { ...newCpuSt, field: { ...newCpuSt.field, lrig_attacked: true } };
        appendBattleLogs([`[CPU] ルリグアタック継続（残り${remMD}回）`]);
      }
      await supabase.from('battle_states').update({ guest_state: newCpuSt, host_state: newHuStMD }).eq('room_id', roomId);
      return;
    }

    // ─── スペルカットインパス（人間のスペルに対してCPUは常にパス）───
    if (bs.pending_spell && bs.pending_spell.caster_id !== CPU_PLAYER_ID) {
      const { caster_id, card_num } = bs.pending_spell;
      const casterIsHost = caster_id === bs.host_id;
      const casterState    = casterIsHost ? bs.host_state : bs.guest_state;
      const nonCasterState = casterIsHost ? bs.guest_state : bs.host_state;
      const resolved: PlayerState = { ...casterState, trash: [...casterState.trash, card_num] };
      const effects = effectsMap.get(card_num) ?? [];
      const spellEff = effects.find(e => e.effectType === 'ACTIVATED');
      if (!spellEff) {
        await supabase.from('battle_states')
          .update({ [casterIsHost ? 'host_state' : 'guest_state']: resolved, pending_spell: null, pending_effect: null })
          .eq('room_id', roomId);
        return;
      }
      const spellName = battleCardMap.get(card_num)?.CardName ?? card_num;
      appendBattleLogs([`[相手] ${spellName}を使用`]);
      const spellPowers = calcFieldPowers(resolved, nonCasterState, bs.active_user_id === caster_id, effectsMap, battleCardMap);
      const spellIsOwnerTurn2 = bs.active_user_id === caster_id;
      const spellAllColorSigniNums2 = new Set([...collectAllColorSigniForField(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn2), ...collectAllColorSigniForField(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn2)]);
      const spellExtraColors2 = new Map([...collectFieldSigniExtraColors(resolved, battleCardMap, effectsMap, nonCasterState, spellIsOwnerTurn2), ...collectFieldSigniExtraColors(nonCasterState, battleCardMap, effectsMap, resolved, !spellIsOwnerTurn2)]);
      const ctx: ExecCtx = { ownerState: resolved, otherState: nonCasterState, cardMap: battleCardMap, logs: [], effectivePowers: spellPowers, sourceCardNum: card_num, allColorSigniNums: spellAllColorSigniNums2, fieldSigniExtraColors: spellExtraColors2 };
      const result = executeEffect(spellEff, ctx);
      if (result.logs.length > 0) appendBattleLogs(result.logs);
      const hostState  = casterIsHost ? result.ownerState : result.otherState;
      const guestState = casterIsHost ? result.otherState : result.ownerState;
      const update: Record<string, unknown> = { host_state: hostState, guest_state: guestState, pending_spell: null };
      update.pending_effect = result.done ? null
        : ({ sourcePlayerId: caster_id, sourceCardNum: card_num, effectId: spellEff.effectId, interaction: result.pending } satisfies PendingEffect);
      await supabase.from('battle_states').update(update).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_ARTS_OPフェイズ：CPUが非ターンプレイヤーの場合はアーツ不使用でスキップ ───
    // ※ このチェックは !isCpuTurnNow の早期リターンより前に置く必要がある
    if (bs.turn_phase === 'ATTACK_ARTS_OP' && !isCpuTurnNow) {
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_SIGNI' }).eq('room_id', roomId);
      return;
    }

    if (!isCpuTurnNow) return;

    const phase = bs.turn_phase;

    // ─── UPフェイズ（ドロー）───
    if (phase === 'UP') {
      appendBattleLogs([`[CPU] ${drawCount}枚ドロー`]);
      const newCpuSt = drawCards(cpuSt, drawCount);
      await supabase.from('battle_states').update({
        guest_state: { ...newCpuSt, actions_done: ['DRAW'] },
        turn_phase: 'DRAW',
      }).eq('room_id', roomId);
      return;
    }

    // ─── DRAWフェイズ → ENERGYへ ───
    if (phase === 'DRAW') {
      await supabase.from('battle_states').update({ turn_phase: 'ENERGY' }).eq('room_id', roomId);
      return;
    }

    // ─── ENERGYフェイズ：手札の先頭1枚をエナチャージ ───
    if (phase === 'ENERGY') {
      const used    = cpuSt.actions_done?.includes('ENERGY') ?? false;
      const blocked = cpuSt.blocked_actions?.includes('ENERGY') ?? false;
      if (!used && !blocked && cpuSt.hand.length > 0) {
        const charged = cpuSt.hand[0];
        const chargedCard = battleCardMap.get(charged);
        appendBattleLogs([`[CPU] エナチャージ: ${chargedCard?.CardName ?? charged}`]);
        const newCpuSt: PlayerState = {
          ...cpuSt,
          hand: cpuSt.hand.slice(1),
          energy: [...cpuSt.energy, charged],
          actions_done: [...(cpuSt.actions_done ?? []), 'ENERGY'],
        };
        await supabase.from('battle_states').update({ guest_state: newCpuSt }).eq('room_id', roomId);
        // 少し待ってGROWへ進む
        await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
      }
      await supabase.from('battle_states').update({ turn_phase: 'GROW' }).eq('room_id', roomId);
      return;
    }

    // ─── GROWフェイズ：グロウ可能なら最初の候補でグロウ ───
    if (phase === 'GROW') {
      const grew    = cpuSt.actions_done?.includes('GROW') ?? false;
      const blocked = (cpuSt.blocked_actions?.includes('GROW') ?? false) || (cpuSt.no_grow ?? false);
      if (!grew && !blocked) {
        const currentLrigId = cpuSt.field.lrig.at(-1) ?? null;
        const currentLrigNum = currentLrigId ? getCardNum(currentLrigId) : null;
        const currentLrigCard = currentLrigNum ? cards.find(c => c.CardNum === currentLrigNum) : null;
        const currentLevel = currentLrigCard ? parseInt(currentLrigCard.Level) || 0 : 0;

        // lrig_deckはinstance IDを持つのでgetCardNum()でCardNumに変換して照合
        const growTargetId = cpuSt.lrig_deck.find(instanceId => {
          const cardNum = getCardNum(instanceId);
          const c = cards.find(card => card.CardNum === cardNum);
          if (!c || c.Type !== 'ルリグ') return false;
          if (parseInt(c.Level) !== currentLevel + 1) return false;
          return canAffordGrowCost(cpuSt.energy, cards, c.GrowCost);
        });

        if (growTargetId) {
          const growCardNum = getCardNum(growTargetId);
          const growCard = cards.find(c => c.CardNum === growCardNum)!;
          appendBattleLogs([`[CPU] グロウ: ${growCard.CardName}（Lv.${growCard.Level}）`]);
          const costs = parseGrowCost(growCard.GrowCost);
          // エナから支払い
          let newEnergy = [...cpuSt.energy];
          for (const { color, count } of costs) {
            let paid = 0;
            newEnergy = newEnergy.filter(eNum => {
              if (paid >= count) return true;
              const eCard = cards.find(c => c.CardNum === getCardNum(eNum));
              const eColor = eCard?.Color ?? '';
              if (color === '無' || eColor.includes(color)) { paid++; return false; }
              return true;
            });
          }
          // lrig_deckはinstance IDなのでgrowTargetIdをそのまま除外・フィールドに積む
          const newLrigDeck = cpuSt.lrig_deck.filter(id => id !== growTargetId);
          const newCpuSt: PlayerState = {
            ...cpuSt,
            energy: newEnergy,
            lrig_deck: newLrigDeck,
            field: { ...cpuSt.field, lrig: [...cpuSt.field.lrig, growTargetId] },
            actions_done: [...(cpuSt.actions_done ?? []), 'GROW'],
          };
          await supabase.from('battle_states').update({ guest_state: newCpuSt }).eq('room_id', roomId);
          await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
        }
      }
      await supabase.from('battle_states').update({ turn_phase: 'MAIN' }).eq('room_id', roomId);
      return;
    }

    // ─── MAINフェイズ：シグニを手札から召喚（空きゾーンに1枚ずつ）───
    if (phase === 'MAIN') {
      if (bs.turn_count === 1) {
        // 先攻1ターン目はMAINからENDへ
        await supabase.from('battle_states').update({ turn_phase: 'END' }).eq('room_id', roomId);
        return;
      }
      const cpuLrigId = cpuSt.field.lrig.at(-1) ?? null;
      const cpuLrigNum = cpuLrigId ? getCardNum(cpuLrigId) : null;
      const cpuLrigCard = cpuLrigNum ? cards.find(c => c.CardNum === cpuLrigNum) : null;
      const cpuLimit     = parseInt(cpuLrigCard?.Limit ?? '0') || 0;
      const cpuLrigLevel = parseInt(cpuLrigCard?.Level ?? '0') || 0;

      // 現在のフィールドのシグニの合計レベル
      let fieldTotal = 0;
      for (const stack of cpuSt.field.signi) {
        if (!stack?.length) continue;
        const topNum = getCardNum(stack[stack.length - 1]);
        const topCard = cards.find(c => c.CardNum === topNum);
        fieldTotal += parseInt(topCard?.Level ?? '0') || 0;
      }

      // 手札のシグニをコストの低い順（レベル低い順）でフィルタ
      const handSignis = cpuSt.hand
        .map((id, idx) => ({ id, idx, card: cards.find(c => c.CardNum === getCardNum(id)) }))
        .filter(({ card }) => card && card.Type === 'シグニ')
        .sort((a, b) => (parseInt(a.card!.Level) || 0) - (parseInt(b.card!.Level) || 0));

      let newCpuSt = { ...cpuSt };

      for (let zone = 0; zone < 3; zone++) {
        if ((newCpuSt.field.signi[zone] ?? []).length > 0) continue; // ゾーン埋まってる
        if (handSignis.length === 0) break;

        // 召喚できるシグニを探す（リミット内 かつ シグニLv ≤ ルリグLv）
        const candidate = handSignis.find(({ card }) => {
          const lv = parseInt(card!.Level) || 0;
          return lv <= cpuLrigLevel && fieldTotal + lv <= cpuLimit;
        });
        if (!candidate) break;

        // エナ支払い（シグニのコスト）
        const signiCosts = parseGrowCost(candidate.card!.Cost);
        if (signiCosts.length > 0) {
          let canPay = true;
          let newEnergy = [...newCpuSt.energy];
          for (const { color, count } of signiCosts) {
            let paid = 0;
            const after = newEnergy.filter(eNum => {
              if (paid >= count) return true;
              const eCard = cards.find(c => c.CardNum === getCardNum(eNum));
              const eColor = eCard?.Color ?? '';
              if (color === '無' || eColor.includes(color)) { paid++; return false; }
              return true;
            });
            if (paid < count) { canPay = false; break; }
            newEnergy = after;
          }
          if (!canPay) {
            handSignis.splice(handSignis.indexOf(candidate), 1);
            continue;
          }
          newCpuSt = { ...newCpuSt, energy: newEnergy };
        }

        appendBattleLogs([`[CPU] シグニ配置: ${candidate.card!.CardName}（ゾーン${zone + 1}）`]);
        const newSigni = [...newCpuSt.field.signi] as (string[] | null)[];
        newSigni[zone] = [candidate.id];
        newCpuSt = {
          ...newCpuSt,
          hand: newCpuSt.hand.filter(id => id !== candidate.id),
          field: { ...newCpuSt.field, signi: newSigni },
        };
        const lv = parseInt(candidate.card!.Level) || 0;
        fieldTotal += lv;
        handSignis.splice(handSignis.indexOf(candidate), 1);

        // 1枚ずつSupabaseを更新して画面に反映させてから次へ
        await supabase.from('battle_states').update({ guest_state: newCpuSt }).eq('room_id', roomId);
        await new Promise(r => setTimeout(r, CPU_ACTION_DELAY));
      }

      // HASTARLIQ: CPUのMAIN→ATTACK_ARTS移行時、相手(人間)の hastarliq_zones があれば発動
      const huStForHL = isHost ? bs.guest_state : bs.host_state;
      const huKeyForHL = isHost ? 'guest_state' : 'host_state';
      const hlZonesCpu = huStForHL.hastarliq_zones ?? [];
      if (hlZonesCpu.length > 0) {
        const cpuTurnPlayerId = bs.active_user_id ?? CPU_PLAYER_ID;
        const hlEntriesCpu: StackEntry[] = hlZonesCpu.map(zi => ({
          id: generateUUID(),
          playerId: cpuTurnPlayerId,
          cardNum: 'WXDi-P05-TK01A',
          effectId: `HASTARLIQ_TRIGGER_Z${zi}_${Date.now()}`,
          label: `【ハスターリク】ゾーン${zi + 1}発動`,
          effect: {
            effectId: `HASTARLIQ_TRIGGER_Z${zi}`,
            effectType: 'AUTO' as const,
            action: { type: 'STUB', id: 'HASTARLIQ_TRIGGER', value: zi } as import('../types/effects').StubAction,
            duration: 'INSTANT' as const,
            mandatory: true,
            parseStatus: 'AUTO' as const,
          },
        }));
        const newHuStForHL = { ...huStForHL, hastarliq_zones: undefined };
        const existingStackHLCpu = bs.effect_stack ?? null;
        const newStackHLCpu = existingStackHLCpu
          ? pushToStack(existingStackHLCpu, hlEntriesCpu)
          : initStack(cpuTurnPlayerId, hlEntriesCpu);
        await supabase.from('battle_states').update({
          turn_phase: 'ATTACK_ARTS',
          [huKeyForHL]: newHuStForHL,
          effect_stack: newStackHLCpu,
        }).eq('room_id', roomId);
        return;
      }
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_ARTS' }).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_ARTSフェイズ：アーツ不使用でスキップ ───
    if (phase === 'ATTACK_ARTS') {
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_ARTS_OP' }).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_SIGNIフェイズ：全シグニでアタック ───
    if (phase === 'ATTACK_SIGNI') {
      // まだダウンしていないシグニを1枚ずつアタック
      const signiDown = cpuSt.field.signi_down ?? [false, false, false];
      const firstUp = cpuSt.field.signi.findIndex((stack, i) =>
        (stack ?? []).length > 0 && !signiDown[i]
      );

      if (firstUp >= 0) {
        const opZone = 2 - firstUp; // 正面ゾーン（反転）
        const opStack = huSt.field.signi[opZone] ?? [];
        const opTopNum = opStack.length > 0 ? opStack[opStack.length - 1] : null;

        const myTopNum = (cpuSt.field.signi[firstUp] ?? []).at(-1)!;
        const myCard = battleCardMap.get(myTopNum);
        const myPower = effectivePowers.get(myTopNum) ?? (parseInt(myCard?.Power ?? '0') || 0);
        const opPower = opTopNum ? (effectivePowers.get(opTopNum) ?? (parseInt(battleCardMap.get(opTopNum)?.Power ?? '0') || 0)) : 0;
        const opCard = opTopNum ? battleCardMap.get(opTopNum) : null;

        const newSigniDown = [...signiDown];
        newSigniDown[firstUp] = true;
        const newCpuSt: PlayerState = { ...cpuSt, field: { ...cpuSt.field, signi_down: newSigniDown } };
        let newHuSt = huSt;

        if (opTopNum && myPower < opPower) {
          // バトル負け：何もしない（シグニはダウンのみ）
          appendBattleLogs([`[CPU] ${myCard?.CardName ?? myTopNum} がバトル敗北（${myPower} < ${opPower}）`]);
        } else if (opTopNum) {
          // バトル勝ち：相手シグニバニッシュ → エナへ
          appendBattleLogs([`[CPU] ${myCard?.CardName ?? myTopNum} がバトル勝利 → ${opCard?.CardName ?? opTopNum} をバニッシュ`]);
          const newOpSigni = [...huSt.field.signi] as (string[] | null)[];
          newOpSigni[opZone] = null;
          newHuSt = {
            ...huSt,
            energy: [...huSt.energy, opTopNum],
            field: { ...huSt.field, signi: newOpSigni },
          };
        } else {
          // 正面シグニなし：ライフクロスをクラッシュ
          if (huSt.life_cloth.length > 0) {
            const crashed = huSt.life_cloth[huSt.life_cloth.length - 1];
            appendBattleLogs([`[CPU] ${myCard?.CardName ?? myTopNum} → あなたのライフをクラッシュ（残り${huSt.life_cloth.length - 1}枚）`]);
            newHuSt = {
              ...huSt,
              life_cloth: huSt.life_cloth.slice(0, -1),
              field: { ...huSt.field, check: crashed },
            };
          } else {
            appendBattleLogs([`[CPU] あなたのライフが0枚 → CPUの勝利！`]);
            // 人間のライフなし → CPUの勝利
            await supabase.from('battle_states').update({
              guest_state: newCpuSt,
              host_state: huSt,
              winner_id: CPU_PLAYER_ID,
              global_phase: 'FINISHED',
            }).eq('room_id', roomId);
            return;
          }
        }

        await supabase.from('battle_states').update({
          guest_state: newCpuSt,
          host_state: newHuSt,
        }).eq('room_id', roomId);
        return; // 次のuseEffectトリガーで残りのシグニをアタック
      }

      // 全シグニアタック完了 → ATTACK_LRIGへ
      await supabase.from('battle_states').update({ turn_phase: 'ATTACK_LRIG' }).eq('room_id', roomId);
      return;
    }

    // ─── ATTACK_LRIGフェイズ：ルリグアタック ───
    if (phase === 'ATTACK_LRIG') {
      if (!cpuSt.field.lrig_down) {
        const cpuLrigNum = cpuSt.field.lrig.at(-1) ? getCardNum(cpuSt.field.lrig.at(-1)!) : null;
        const cpuLrigCard = cpuLrigNum ? battleCardMap.get(cpuLrigNum) : null;
        appendBattleLogs([`[CPU] ルリグアタック: ${cpuLrigCard?.CardName ?? 'ルリグ'}`]);
        const newCpuSt: PlayerState = { ...cpuSt, field: { ...cpuSt.field, lrig_down: true } };
        const newHuSt: PlayerState = { ...huSt, field: { ...huSt.field, lrig_attacked: true } };
        await supabase.from('battle_states').update({
          guest_state: newCpuSt,
          host_state: newHuSt,
        }).eq('room_id', roomId);
        return;
      }
      // ガード応答待ち・ライフバースト処理中はENDへ進まない
      if (huSt.field.lrig_attacked || huSt.field.check) return;
      // ルリグアタック済み → ENDへ
      await supabase.from('battle_states').update({ turn_phase: 'END' }).eq('room_id', roomId);
      return;
    }

    // ─── ENDフェイズ：ターン終了処理 ───
    if (phase === 'END') {
      const nextHuSt = { ...huSt, field: {
        ...huSt.field,
        signi_down:   [false, false, false] as boolean[],
        signi_frozen: [false, false, false] as boolean[],
        lrig_down:    false,
        lrig_frozen:  false,
      }};
      const cleanCpuSt: PlayerState = {
        ...cpuSt,
        temp_power_mods: [], keyword_grants: {}, blocked_actions: [], actions_done: [],
        pending_crashed_cards: [], must_attack_signi: undefined, prevent_next_damage: undefined,
        cost_modifiers: (cpuSt.cost_modifiers ?? []).filter(m => m.until !== 'END_OF_TURN'),
        lrig_granted_auto_effects: undefined,
        banish_redirect: undefined, banish_redirect_to_hand: undefined,
      };
      await supabase.from('battle_states').update({
        guest_state: cleanCpuSt,
        host_state: nextHuSt,
        turn_phase: 'UP',
        active_user_id: user.id,
        turn_count: bs.turn_count + 1,
      }).eq('room_id', roomId);
    }
  };
  cpuTurnRef.current = cpuTurnAction;

  // GUARD_ALTERNATIVE_COST: エナゾーンから指定クラスのシグニをトラッシュしてガード
  const handleGuardWithEnergyAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altCost = collectGuardAlternativeCost(my, battleCardMap, effectsMap);
    if (!altCost) return;
    const energySigni = my.energy.filter(cn => {
      const c = battleCardMap.get(cn);
      return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(altCost.signiClass);
    });
    if (energySigni.length === 0) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      const trashTarget = energySigni[0]; // 最初の該当シグニをトラッシュ
      const newMyState: PlayerState = {
        ...my,
        energy: my.energy.filter(cn => cn !== trashTarget),
        trash: [...my.trash, trashTarget],
        field: { ...my.field, lrig_attacked: false },
      };
      appendBattleLogs([`ガード代替コスト：エナ＜${altCost.signiClass}＞（${battleCardMap.get(trashTarget)?.CardName ?? trashTarget}）をトラッシュ`]);
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally { setLoading(false); }
  };

  // game_guard_alt_hand: 手札N枚を捨ててガード（ガードアイコン不要の代替）
  const handleGuardWithHandAlternative = async () => {
    if (!my.field.lrig_attacked || loading) return;
    const altN = my.game_guard_alt_hand ?? 0;
    if (altN <= 0 || my.hand.length < altN) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      // 手札の末尾N枚を捨てる
      const discarded = my.hand.slice(-altN);
      const newMyState: PlayerState = {
        ...my,
        hand: my.hand.slice(0, -altN),
        trash: [...my.trash, ...discarded],
        field: { ...my.field, lrig_attacked: false },
      };
      appendBattleLogs([`ガード代替：手札${altN}枚を捨てる（${discarded.map(cn => battleCardMap.get(cn)?.CardName ?? cn).join('、')}）`]);
      await supabase.from('battle_states').update({ [stateKey]: newMyState }).eq('room_id', roomId);
    } finally { setLoading(false); }
  };

  // ガード応答: handIndex=ガードカードのインデックス、null=ガードしない
  const handleGuardResponse = async (handIndex: number | null) => {
    if (!my.field.lrig_attacked || loading) return;
    setLoading(true);
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      let newMyState: PlayerState;
      if (handIndex !== null) {
        // ガードカードをトラッシュへ
        const cardNum = my.hand[handIndex];
        const guardCardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
        // OPP_GUARD_COST_COLORLESS: 相手フィールドにアクティブな場合、追加で無色エナを1枚消費
        const needsExtraEnergy = collectOppGuardExtraColorlessCost(op, my, battleCardMap, effectsMap, !isMyTurn);
        // EXTRA_GUARD_COST_FROM_HAND: 相手フィールドにアクティブな場合、手札から追加でガードカードを1枚捨てる
        const needsExtraGuardCard = collectOppExtraGuardFromHand(op, battleCardMap, effectsMap);
        // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→ガード時に追加でエナか手札捨て
        const needsOppHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
        let energyAfterGuard = my.energy;
        const extraTrash: string[] = [];
        if (needsExtraEnergy && my.energy.length > 0) {
          const removedEnergy = my.energy[my.energy.length - 1];
          energyAfterGuard = my.energy.slice(0, -1);
          extraTrash.push(removedEnergy);
        }
        if (needsOppHandOrColorless) {
          // エナがあれば消費、なければ手札を1枚捨てる
          if (energyAfterGuard.length > 0) {
            const removedEnHOC = energyAfterGuard[energyAfterGuard.length - 1];
            energyAfterGuard = energyAfterGuard.slice(0, -1);
            extraTrash.push(removedEnHOC);
          } else {
            const extraHandIdx = my.hand.findIndex((_, i) => i !== handIndex);
            if (extraHandIdx >= 0) extraTrash.push(my.hand[extraHandIdx]);
          }
        }
        if (needsExtraGuardCard) {
          const extraGuardIdx = my.hand.findIndex((cn, i) => i !== handIndex && (battleCardMap.get(cn)?.Guard === '1'));
          if (extraGuardIdx >= 0) {
            const extraGuardNum = my.hand[extraGuardIdx];
            extraTrash.push(extraGuardNum);
            appendBattleLogs([`ガード（${guardCardName}）＋追加コスト：手札ガードカード（${battleCardMap.get(extraGuardNum)?.CardName ?? extraGuardNum}）を捨てる`]);
          } else {
            appendBattleLogs([`ガード（${guardCardName}）（追加ガードカードなし）`]);
          }
        } else if (needsOppHandOrColorless) {
          appendBattleLogs([`ガード（${guardCardName}）＋追加コスト（手札か《無》）消費`]);
        } else if (needsExtraEnergy && energyAfterGuard.length < my.energy.length) {
          appendBattleLogs([`ガード（${guardCardName}）＋追加コスト《無》消費`]);
        } else {
          appendBattleLogs([`ガード（${guardCardName}）`]);
        }
        // 手札から除外: ガードカード本体 + extraTrash に含まれる手札カード
        const handExtraTrashNums = new Set(extraTrash.filter(cn => my.hand.includes(cn)));
        const handAfterExtraGuard = my.hand.filter((cn, i) => i !== handIndex && !handExtraTrashNums.has(cn));
        newMyState = {
          ...my,
          hand: handAfterExtraGuard,
          trash: [...my.trash, cardNum, ...extraTrash],
          energy: energyAfterGuard,
          field: { ...my.field, lrig_attacked: false },
        };
      } else {
        // ガードしない → ライフクロスをクラッシュ
        if ((my.prevent_next_damage ?? 0) > 0) {
          appendBattleLogs([`ルリグアタック：ダメージ無効`]);
          newMyState = { ...my, prevent_next_damage: (my.prevent_next_damage ?? 0) - 1, field: { ...my.field, lrig_attacked: false } };
        } else if (my.prevent_lrig_damage || (() => {
          // PREVENT_LRIG_DAMAGE (条件付き): 手札が0枚のかぎりルリグダメージ無効
          return my.field.signi.some((stack) => {
            const top = stack?.at(-1); if (!top) return false;
            return (effectsMap.get(top) ?? []).some(eff =>
              eff.effectType === 'CONTINUOUS' &&
              (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
              (eff.action as import('../types/effects').StubAction).id === 'PREVENT_LRIG_DAMAGE' &&
              my.hand.length === 0,
            );
          });
        })()) {
          appendBattleLogs([`ルリグアタック：ルリグダメージ無効`]);
          newMyState = { ...my, prevent_lrig_damage: undefined, field: { ...my.field, lrig_attacked: false } };
        } else if (my.life_cloth.length > 0) {
          const crashed = my.life_cloth[my.life_cloth.length - 1];
          const crashedName = battleCardMap.get(crashed)?.CardName ?? crashed;
          appendBattleLogs([`ルリグアタック：ライフクロスをクラッシュ（${crashedName}）`]);
          newMyState = {
            ...my,
            life_cloth: my.life_cloth.slice(0, -1),
            field: { ...my.field, lrig_attacked: false, check: crashed },
          };
        } else if (my.prevent_defeat) {
          appendBattleLogs([`ルリグアタック：ライフなし → 敗北無効`]);
          newMyState = { ...my, prevent_defeat: undefined, field: { ...my.field, lrig_attacked: false } };
        } else {
          // ライフクロス0枚 → 自分の敗北
          appendBattleLogs([`ルリグアタック：ライフなし → 敗北`]);
          const winnerId = isHost ? bs.guest_id : bs.host_id;
          const clearedMyState: PlayerState = { ...my, field: { ...my.field, lrig_attacked: false } };
          await supabase.from('battle_states')
            .update({ [stateKey]: clearedMyState, global_phase: 'FINISHED', winner_id: winnerId })
            .eq('room_id', roomId);
          return;
        }
      }
      // MULTI_DAMAGE_ON_LRIG_ATTACK: 攻撃側に残りアタック回数があれば再トリガー
      const oppStateKey = isHost ? 'guest_state' : 'host_state';
      let newOpState = op;
      if (op.lrig_attack_remaining && op.lrig_attack_remaining > 0) {
        const rem = op.lrig_attack_remaining - 1;
        newOpState = { ...op, lrig_attack_remaining: rem > 0 ? rem : undefined };
        // バースト処理中でない場合は即座に再アタック、バースト中はcheck解消後に再表示
        newMyState = { ...newMyState, field: { ...newMyState.field, lrig_attacked: true } };
        appendBattleLogs([`ルリグアタック継続（残り${rem}回）`]);
      }
      await supabase.from('battle_states').update({ [stateKey]: newMyState, [oppStateKey]: newOpState }).eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ライフバースト確認後の処理
  const handleLifeBurstResponse = async (activate: boolean) => {
    if (!my.field.check || loading) return;
    setLoading(true);
    try {
      const cardNum = my.field.check;
      // CRASH_TO_TRASH_INSTEAD: 相手（攻撃側）がフラグを持つ場合エナではなくトラッシュへ
      const crashToTrash = op.crash_to_trash_instead === true;
      // チェックゾーンをクリアしてエナ（またはトラッシュ）へ移動した状態を基点にする
      const baseState: PlayerState = {
        ...my,
        energy: crashToTrash ? my.energy : [...my.energy, cardNum],
        trash: crashToTrash ? [...my.trash, cardNum] : my.trash,
        field: { ...my.field, check: null },
      };
      if (crashToTrash) appendBattleLogs([`${battleCardMap.get(cardNum)?.CardName ?? cardNum}はトラッシュに置かれた（CRASH_TO_TRASH_INSTEAD）`]);
      if (!activate) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states')
          .update({ [stateKey]: baseState, pending_effect: null })
          .eq('room_id', roomId);
        return;
      }
      // LIFE_BURST効果を発火（LIFE_BURST_DOUBLEフラグがある場合は2回分キュー）
      const doubleBurst = baseState.life_burst_double_next === true;
      const baseStateForBurst = doubleBurst
        ? { ...baseState, life_burst_double_next: undefined }
        : baseState;
      const fired = await queueCardEffects(cardNum, ['LIFE_BURST'], ['ON_LIFE_BURST'], baseStateForBurst, op, {}, doubleBurst ? 2 : 1);
      if (!fired) {
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states')
          .update({ [stateKey]: baseState, pending_effect: null })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // シグニ起動効果を実行（コスト支払い後）
  const executeSigniActivated = async (cardNum: string, effect: import('../types/effects').CardEffect, costIndices: Set<number>, discardCostIndices: Set<number>, useKeySub = false) => {
    if (loading) return;
    setLoading(true);
    setPendingSigniActivated(null);
    setSelectedSigniActivatedCost(new Set());
    setSelectedSigniActivatedDiscard(new Set());
    setKeySubstituteEnabled(false);
    try {
      // エナコストを支払う
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      // 手札捨てコストを支払う
      const discardedCards = [...discardCostIndices].map(i => my.hand[i]);
      const newHand = my.hand.filter((_, i) => !discardCostIndices.has(i));
      // down_self コストの場合はそのゾーンをダウン
      const newSigniDown = [...(my.field.signi_down ?? [false, false, false])];
      if (effect.cost?.down_self) {
        const zoneIdx = my.field.signi.findIndex(s => s?.at(-1) === cardNum);
        if (zoneIdx >= 0) newSigniDown[zoneIdx] = true;
      }
      // キーピース代替（ENERGY_SUBSTITUTE_TRASH_KEY）: キーをルリグトラッシュへ
      const keySub = useKeySub && myEnergyTrashSubInfo.keySubInstId;
      const newField = keySub
        ? { ...my.field, signi_down: newSigniDown, key_piece: null }
        : { ...my.field, signi_down: newSigniDown };
      const newLrigTrash = keySub ? [...my.lrig_trash, myEnergyTrashSubInfo.keySubInstId!] : my.lrig_trash;
      let paid: PlayerState = {
        ...my,
        hand: newHand,
        energy: newEnergy,
        activate_cost_zero_signi: my.activate_cost_zero_signi === cardNum ? undefined : my.activate_cost_zero_signi,
        trash: [...my.trash, ...paidNums, ...discardedCards],
        lrig_trash: newLrigTrash,
        field: newField,
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      // GRANT_TURN_TRIGGER_3RD_DOWN: 植物シグニがdown_selfコストでダウンした回数を追跡
      let plant3rdDownTriggerEntry: StackEntry | null = null;
      if (effect.cost?.down_self && my.turn_trigger_3rd_plant_down) {
        const signiCard3D = battleCardMap.get(cardNum);
        if (signiCard3D?.CardClass?.includes('植物')) {
          const newPlantDownCount = (my.turn_plant_down_count ?? 0) + 1;
          paid = { ...paid, turn_plant_down_count: newPlantDownCount };
          if (newPlantDownCount === 3) {
            const banishEff3D: import('../types/effects').CardEffect = {
              effectId: `plant_3rd_down_${generateUUID()}`,
              effectType: 'ACTIVATED',
              action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as import('../types/effects').BanishAction,
            };
            plant3rdDownTriggerEntry = {
              id: generateUUID(),
              playerId: user.id,
              cardNum,
              effectId: banishEff3D.effectId,
              label: `${battleCardMap.get(cardNum)?.CardName ?? cardNum} 植物3回目ダウン：相手シグニ1体バニッシュ`,
              effect: banishEff3D,
            };
          }
        }
      }
      // 効果をスタックに積む
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName} の【起】効果`,
        effect,
      };
      const stackEntries: StackEntry[] = plant3rdDownTriggerEntry
        ? [entry, plant3rdDownTriggerEntry]
        : [entry];
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, stackEntries)
        : initStack(turnPlayerId, stackEntries);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // エナゾーンのACTIVATED能力（アクセカード）を発動
  const executeEnergyActivated = async (
    cardNum: string,
    effect: import('../types/effects').CardEffect,
    costIndices: Set<number>,
  ) => {
    if (loading) return;
    setLoading(true);
    setPendingEnergyActivated(null);
    setSelectedEnergyActivatedCost(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      // アクセカードがエナから取り除かれるのはATTACH_ACCE実行時（effectExecutor側）
      // コストのみ先払い（緑×0の場合は何も消費しない）
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const paid: PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const cardName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const entry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: effect.effectId,
        label: `${cardName}【起】アクセ`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, [entry])
        : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // ON_ACCE トリガー: ATTACH_ACCE 完了後にホストシグニのON_ACCE AUTO効果を発火
  const checkAndFireOnAcceTriggersForOwner = async (state: PlayerState, acceHostCardNum: string) => {
    const triggerEntries: StackEntry[] = [];
    for (const stack of state.field.signi) {
      if (!stack?.length) continue;
      const topNum = stack[stack.length - 1];
      for (const eff of (effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO') continue;
        if (!eff.timing?.includes('ON_ACCE')) continue;
        if (eff.condition && !evalUseCondition(eff.condition, state, op, battleCardMap, topNum, bs.turn_phase, effectivePowers)) continue;
        const card = battleCardMap.get(topNum);
        triggerEntries.push({
          id: generateUUID(),
          playerId: user.id,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${card?.CardName ?? topNum}【自】${eff.timing?.[0] ?? 'ON_ACCE'}`,
          effect: eff,
        });
      }
    }
    // ホストシグニ自体のON_ACCE効果は上記でキャッチされる
    // また「あなたのシグニ１体がアクセされたとき」系のWX15-059等
    void acceHostCardNum;
    if (triggerEntries.length === 0) return;
    const stateKey = isHost ? 'host_state' : 'guest_state';
    const curStack = bs?.effect_stack ?? null;
    const turnPlayerId = bs.active_user_id ?? user.id;
    const newStack = curStack
      ? pushToStack(curStack, triggerEntries)
      : initStack(turnPlayerId, triggerEntries);
    await supabase.from('battle_states')
      .update({ [stateKey]: state, effect_stack: newStack })
      .eq('room_id', roomId);
  };

  // シグニ出現時コスト付き【出】効果：発動
  const executeSigniOnPlayCost = async (
    cardNum: string,
    costEffect: import('../types/effects').CardEffect,
    costIndices: Set<number>,
    discardIndices: Set<number>,
    placedState: PlayerState,
    mandatoryEntries: StackEntry[],
  ) => {
    if (loading) return;
    setLoading(true);
    setPendingSigniOnPlayCost(null);
    setSelectedSigniOnPlayCost(new Set());
    setSelectedSigniOnPlayDiscard(new Set());
    try {
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const discardNums = [...discardIndices].map(i => placedState.hand[i]);
      const newHand = placedState.hand.filter((_, i) => !discardIndices.has(i));
      const paid: PlayerState = {
        ...placedState,
        energy: newEnergy,
        hand: newHand,
        trash: [...placedState.trash, ...paidNums, ...discardNums],
      };
      const cName = battleCardMap.get(cardNum)?.CardName ?? cardNum;
      const costEntry: StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum,
        effectId: costEffect.effectId,
        label: `${cName} の【出】効果`,
        effect: costEffect,
      };
      const allEntries = [...mandatoryEntries, costEntry];
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, allEntries)
        : initStack(turnPlayerId, allEntries);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // シグニ出現時コスト付き【出】効果：スキップ（召喚はコミット）
  const skipSigniOnPlayCost = async (placedState: PlayerState, mandatoryEntries: StackEntry[]) => {
    if (loading) return;
    setLoading(true);
    setPendingSigniOnPlayCost(null);
    setSelectedSigniOnPlayCost(new Set());
    setSelectedSigniOnPlayDiscard(new Set());
    try {
      const stateKey = isHost ? 'host_state' : 'guest_state';
      if (mandatoryEntries.length === 0) {
        await supabase.from('battle_states').update({ [stateKey]: placedState }).eq('room_id', roomId);
      } else {
        const turnPlayerId = bs.active_user_id ?? user.id;
        const existingStack = bs?.effect_stack ?? null;
        const newStack = existingStack
          ? pushToStack(existingStack, mandatoryEntries)
          : initStack(turnPlayerId, mandatoryEntries);
        await supabase.from('battle_states')
          .update({ [stateKey]: placedState, effect_stack: newStack, pending_effect: null })
          .eq('room_id', roomId);
      }
    } finally {
      setLoading(false);
    }
  };

  // ルリグ付与能力（GRANT_LRIG_ABILITY）の発動：エクシードコスト＋エナコスト支払い
  const executeLrigGranted = async (effect: import('../types/effects').CardEffect, costIndices: Set<number>) => {
    if (loading) return;
    setLoading(true);
    setPendingLrigGranted(null);
    setSelectedLrigGrantedCost(new Set());
    try {
      // エクシードコスト：センター → 左アシスト → 右アシストの順で下からN枚をルリグトラッシュへ
      const exceedCost = effect.cost?.exceed ?? 0;
      const newLrig     = [...my.field.lrig];
      const newAssistL  = [...(my.field.assist_lrig_l ?? [])];
      const newAssistR  = [...(my.field.assist_lrig_r ?? [])];
      let newLrigTrash = [...my.lrig_trash];
      if (exceedCost > 0) {
        let remaining = exceedCost;
        const fromCenter = Math.min(remaining, newLrig.length - 1);
        if (fromCenter > 0) { newLrigTrash = [...newLrigTrash, ...newLrig.splice(0, fromCenter)]; remaining -= fromCenter; }
        if (remaining > 0 && newAssistL.length > 1) {
          const fromL = Math.min(remaining, newAssistL.length - 1);
          newLrigTrash = [...newLrigTrash, ...newAssistL.splice(0, fromL)]; remaining -= fromL;
        }
        if (remaining > 0 && newAssistR.length > 1) {
          const fromR = Math.min(remaining, newAssistR.length - 1);
          newLrigTrash = [...newLrigTrash, ...newAssistR.splice(0, fromR)];
        }
      }
      // エナコスト支払い
      const paidNums = [...costIndices].map(i => my.energy[i]);
      const newEnergy = my.energy.filter((_, i) => !costIndices.has(i));
      const paid: import('../types').PlayerState = {
        ...my,
        energy: newEnergy,
        trash: [...my.trash, ...paidNums],
        field: { ...my.field, lrig: newLrig, assist_lrig_l: newAssistL, assist_lrig_r: newAssistR },
        lrig_trash: newLrigTrash,
        actions_done: [...(my.actions_done ?? []), effect.effectId],
      };
      const lrigTop = my.field.lrig.at(-1);
      const cardName = battleCardMap.get(lrigTop ?? '')?.CardName ?? 'ルリグ';
      const entry: import('../types').StackEntry = {
        id: generateUUID(),
        playerId: user.id,
        cardNum: lrigTop ?? '',
        effectId: effect.effectId,
        label: `${cardName} の【起】付与効果`,
        effect,
      };
      const turnPlayerId = bs.active_user_id ?? user.id;
      const existingStack = bs?.effect_stack ?? null;
      const newStack = existingStack
        ? pushToStack(existingStack, [entry])
        : initStack(turnPlayerId, [entry]);
      const stateKey = isHost ? 'host_state' : 'guest_state';
      await supabase.from('battle_states')
        .update({ [stateKey]: paid, effect_stack: newStack, pending_effect: null })
        .eq('room_id', roomId);
    } finally {
      setLoading(false);
    }
  };

  // シグニゾーンのカードアクション（エナチャージ / 起動 / アタック）
  const getMySigniZoneActions = (rawZoneIdx: number): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const stack = my.field.signi[rawZoneIdx];

    if (bs.turn_phase === 'ENERGY') {
      const used    = my.actions_done?.includes('ENERGY') ?? false;
      const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
      if (used || blocked) return [];
      if (!stack || stack.length === 0) return [];
      return [{ label: 'エナチャージ', color: C.accent, onClick: () => handleEnergyChargeFromSigni(rawZoneIdx) }];
    }

    if (bs.turn_phase === 'MAIN') {
      if (!stack || stack.length === 0) return [];
      const topNum = stack[stack.length - 1];
      const effects = effectsMap.get(topNum) ?? [];
      // PREVENT_INFECTED_SIGNI_ACTIVATE: 感染状態のシグニの起動能力をブロック
      const infectedBlocked = collectInfectedActivateBlockedSigni(my, op, battleCardMap, effectsMap, true);
      const isInfectedBlocked = infectedBlocked.includes(topNum);
      // RESTRICT_CHARMED_SIGNI_ACTIVATED: 相手フィールドにあれば、チャーム付きシグニの【起】能力を封じる
      const hasCharmInZone = (my.field.signi_charms?.[rawZoneIdx] ?? null) !== null;
      const isCharmActivateBlocked = hasCharmInZone && op.field.signi.some(stack => {
        const top = stack?.at(-1);
        return top && (effectsMap.get(top) ?? []).some(eff =>
          eff.effectType === 'CONTINUOUS' &&
          (eff.action as import('../types/effects').StubAction).type === 'STUB' &&
          (eff.action as import('../types/effects').StubAction).id === 'RESTRICT_CHARMED_SIGNI_ACTIVATED'
        );
      });
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        (e.timing === undefined || e.timing.includes('MAIN')) &&
        !(my.actions_done?.includes(e.effectId)) &&
        !(my.blocked_actions?.includes(e.effectId)) &&
        !isActionBlocked('USE_ACT') &&
        !isInfectedBlocked &&
        !isCharmActivateBlocked &&
        (!e.condition || evalUseCondition(e.condition, my, op, battleCardMap, topNum, bs.turn_phase, effectivePowers)),
      );
      if (activatable.length === 0) return [];
      return activatable.map(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [
              energyTotal > 0 ? `エナ${energyTotal}` : null,
              eff.cost.discard ? `手札${eff.cost.discard}枚トラッシュ` : null,
              eff.cost.down_self ? 'ダウン' : null,
            ].filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        return {
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => {
            setPendingSigniActivated({ cardNum: topNum, effect: eff });
            setSelectedSigniActivatedCost(new Set());
          },
        };
      });
    }

    if (bs.turn_phase === 'ATTACK_SIGNI') {
      if (!stack || stack.length === 0) return []; // シグニなし
      if (my.field.signi_down?.[rawZoneIdx]) return []; // すでにダウン
      if (op.field.check) return []; // 相手のライフバースト処理待ち
      const topNum = stack[stack.length - 1];
      if (contBlocked.cannotAttackSigni.has(topNum)) return []; // アタック不可シグニ
      // GATE: blocked_actions に 'ATTACK:cardId' があればアタックボタンを非表示
      if (my.blocked_actions?.includes(`ATTACK:${topNum}`)) return [];
      // OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手側が設定したパワー上限でアタック制限
      const oppPowerCap = op.opp_signi_attack_power_cap;
      if (oppPowerCap !== undefined) {
        const signiPower = effectivePowers.get(topNum) ?? parseInt(battleCardMap.get(topNum)?.Power ?? '0');
        if (signiPower <= oppPowerCap) return [];
      }
      // シグニ合計1回アタック制限チェック
      if (my.signi_attack_once_limit && (my.attacked_signi_ids?.length ?? 0) > 0) return [];
      // OPP_SIGNI_ATTACK_COST: アタックにエナコストが必要
      const signiAtkCost = my.signi_attack_cost ?? 0;
      if (signiAtkCost > 0 && my.energy.length < signiAtkCost) return []; // エナ不足でアタック不可
      const atkLabel = signiAtkCost > 0 ? `アタック（《無》×${signiAtkCost}）` : 'アタック';
      const actions: CardAction[] = [{ label: atkLabel, color: C.danger, onClick: () => handleSigniAttack(rawZoneIdx) }];
      // WXDi-P05-069: フリップアタック（ロビンフッド対象）
      const altFlip = collectAltAttackFlipSigni(my, battleCardMap, effectsMap);
      if (altFlip && (battleCardMap.get(topNum)?.CardName ?? '').includes(altFlip.targetSigniName)) {
        const flipCandidates = [0, 1, 2].filter(zi => zi !== rawZoneIdx && (my.field.signi[zi]?.length ?? 0) > 0);
        if (flipCandidates.length > 0) {
          const flipZones = flipCandidates.slice(0, altFlip.maxFlip);
          actions.push({ label: `フリップアタック（${flipZones.length}体裏向き）`, color: '#7c9e30', onClick: () => handleFlipAttack(rawZoneIdx, flipZones) });
        }
      }
      return actions;
    }

    return [];
  };

  // ルリグゾーンのカードアクション（ルリグアタック）
  const getMyLrigFieldActions = (): CardAction[] => {
    if (!isMyTurn || loading) return [];
    if (my.field.lrig.length === 0) return [];

    // MAINフェイズ：センタールリグのACTIVATED能力 + 付与されたACTIVATED能力を表示
    if (bs.turn_phase === 'MAIN') {
      const lrigTopMA = my.field.lrig.at(-1) ?? '';
      const lrigActionsMA: CardAction[] = [];

      // センタールリグ本来のACTIVATED効果（SONG_FRAGMENT等）
      if (lrigTopMA && !isActionBlocked('USE_ACT')) {
        const lrigEffsMA = effectsMap.get(lrigTopMA) ?? [];
        for (const eff of lrigEffsMA) {
          if (eff.effectType !== 'ACTIVATED') continue;
          if (!eff.timing?.includes('MAIN')) continue;
          if (my.actions_done?.includes(eff.effectId)) continue;
          if (my.blocked_actions?.includes(eff.effectId)) continue;
          // SONG_FRAGMENT: エナゾーンに歌のカケラがある場合のみ表示
          const actMA = eff.action as import('../types/effects').StubAction;
          if (actMA?.type === 'STUB' && actMA.id === 'SONG_FRAGMENT') {
            const hasSongCardMA = my.energy.some(cn => battleCardMap.get(cn)?.EffectText?.includes('【歌のカケラ】'));
            if (!hasSongCardMA) continue;
          }
          const isSongFrag = actMA?.type === 'STUB' && actMA.id === 'SONG_FRAGMENT';
          const energyTotalMA = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCostMA = eff.cost?.exceed ?? 0;
          const costPartsMA: string[] = [];
          if (exceedCostMA > 0) costPartsMA.push(`エクシード${exceedCostMA}`);
          if (energyTotalMA > 0) costPartsMA.push(`エナ${energyTotalMA}`);
          const lrigActLabel = isSongFrag ? '歌のカケラ' : (costPartsMA.join('・') || 'コストなし');
          lrigActionsMA.push({
            label: `【起】${lrigActLabel}`,
            color: isSongFrag ? '#cc66ff' : C.coin,
            onClick: () => {
              setPendingLrigGranted({ sourceCardNum: lrigTopMA, effect: eff });
              setSelectedLrigGrantedCost(new Set());
            },
          });
        }
      }

      // INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュにあるルリグの起動能力を継承
      const hasInheritLrigTrash = (effectsMap.get(lrigTopMA) ?? []).some(eff =>
        eff.effectType === 'CONTINUOUS' &&
        (eff.action as import('../types/effects').StubAction)?.id === 'INHERIT_LRIG_TRASH_ABILITIES',
      );
      if (hasInheritLrigTrash) {
        for (const trashLrigCn of my.lrig_trash) {
          if ((battleCardMap.get(trashLrigCn)?.Type ?? '') !== 'ルリグ') continue;
          for (const eff of (effectsMap.get(trashLrigCn) ?? [])) {
            if (eff.effectType !== 'ACTIVATED') continue;
            if (!eff.timing?.includes('MAIN')) continue;
            const inheritedId = `inherited_${trashLrigCn}_${eff.effectId}`;
            if (my.actions_done?.includes(inheritedId)) continue;
            const energyCostILT = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
            const exceedILT = eff.cost?.exceed ?? 0;
            const costPartsILT: string[] = [];
            if (exceedILT > 0) costPartsILT.push(`エクシード${exceedILT}`);
            if (energyCostILT > 0) costPartsILT.push(`エナ${energyCostILT}`);
            const costLabelILT = costPartsILT.join('・') || 'コストなし';
            const trashLrigName = battleCardMap.get(trashLrigCn)?.CardName ?? trashLrigCn;
            lrigActionsMA.push({
              label: `【継承起】${costLabelILT}（${trashLrigName.slice(0, 6)}）`,
              color: '#9966cc',
              onClick: () => {
                const inheritedEff = { ...eff, effectId: inheritedId, sourceCardNum: lrigTopMA };
                setPendingLrigGranted({ sourceCardNum: lrigTopMA, effect: inheritedEff });
                setSelectedLrigGrantedCost(new Set());
              },
            });
          }
        }
      }

      // 付与された ACTIVATED 能力
      const grantedActionsMA = grantedMyLrigEffects
        .filter(e =>
          e.effectType === 'ACTIVATED' &&
          !(my.actions_done?.includes(e.effectId)) &&
          !(my.blocked_actions?.includes(e.effectId)) &&
          !isActionBlocked('USE_ACT'),
        )
        .map(eff => {
          const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
          const exceedCost = eff.cost?.exceed ?? 0;
          const costParts: string[] = [];
          if (exceedCost > 0) costParts.push(`エクシード${exceedCost}`);
          if (energyTotal > 0) costParts.push(`エナ${energyTotal}`);
          const costLabel = costParts.join('・') || 'コストなし';
          return {
            label: `【起】${costLabel}`,
            color: C.coin,
            onClick: () => {
              setPendingLrigGranted({ sourceCardNum: lrigTopMA, effect: eff });
              setSelectedLrigGrantedCost(new Set());
            },
          };
        });

      return [...lrigActionsMA, ...grantedActionsMA];
    }

    // ATTACK_LRIGフェイズ：ルリグアタック
    if (bs.turn_phase === 'ATTACK_LRIG') {
      if (my.field.lrig_down) return []; // 攻撃済み
      if (op.field.lrig_attacked) return []; // ガード応答待ち
      if ((my.lrig_riding_signi?.length ?? 0) > 0) return [{ label: 'ドライブ中（攻撃不可）', color: C.textDim, onClick: () => {} }];
      return [{ label: 'アタック', color: C.danger, onClick: handleLrigAttack }];
    }

    return [];
  };

  // ── キーピース フィールドアクション ──
  const getKeyPieceActions = (): CardAction[] => {
    if (!isMyTurn || loading || !my.field.key_piece) return [];
    const keyNum = my.field.key_piece;
    const phase = bs.turn_phase;
    const effects = effectsMap.get(keyNum) ?? [];
    const activatable = effects.filter(e =>
      e.effectType === 'ACTIVATED' &&
      !(my.actions_done?.includes(e.effectId)) &&
      !(my.blocked_actions?.includes(e.effectId)) &&
      !isActionBlocked('USE_ACT') &&
      (phase === 'MAIN' || phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP' || phase === 'ATTACK_SIGNI' || phase === 'ATTACK_LRIG') &&
      (!e.condition || evalUseCondition(e.condition, my, op, battleCardMap, keyNum, phase, effectivePowers)),
    );
    return activatable.map(eff => {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const costLabel = eff.cost
        ? [energyTotal > 0 ? `エナ${energyTotal}` : null, eff.cost.discard ? `手札${eff.cost.discard}枚` : null]
            .filter(Boolean).join('・') || 'コストなし'
        : 'コストなし';
      return {
        label: `【起】${costLabel}`,
        color: C.coin,
        onClick: () => { setPendingKeyActivated({ cardNum: keyNum, effect: eff }); setSelectedKeyActivatedCost(new Set()); },
      };
    });
  };

  // ── アシストルリグ フィールドアクション ──
  const getAssistActions = (side: 'l' | 'r'): CardAction[] => {
    const stack = (side === 'l' ? my.field.assist_lrig_l : my.field.assist_lrig_r) ?? [];
    if (stack.length === 0) return [];
    const topNum = stack[stack.length - 1];
    const phase = bs.turn_phase;
    const actions: CardAction[] = [];

    // グロウ（自ターン or 相手アタックフェイズ）
    const growCands = getAssistGrowCandidates(side);
    if (!loading && growCands.length > 0) {
      actions.push({
        label: 'グロウ',
        color: '#6644aa',
        onClick: () => {
          setPendingAssistSide(side);
          setPendingAssistGrowCard(null);
          setSelectedAssistGrowCost(new Set());
          setShowAssistGrowModal(true);
        },
      });
    }

    // 起動効果（自ターンのみ）
    if (isMyTurn && !loading) {
      const effects = effectsMap.get(topNum) ?? [];
      const activatable = effects.filter(e =>
        e.effectType === 'ACTIVATED' &&
        !(my.actions_done?.includes(e.effectId)) &&
        !(my.blocked_actions?.includes(e.effectId)) &&
        !isActionBlocked('USE_ACT') &&
        (phase === 'MAIN' || phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') &&
        (!e.condition || evalUseCondition(e.condition, my, op, battleCardMap, topNum, phase, effectivePowers)),
      );
      activatable.forEach(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const costLabel = eff.cost
          ? [energyTotal > 0 ? `エナ${energyTotal}` : null, eff.cost.down_self ? 'ダウン' : null]
              .filter(Boolean).join('・') || 'コストなし'
          : 'コストなし';
        actions.push({
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => { setPendingAssistActivated({ cardNum: topNum, effect: eff }); setSelectedAssistActivatedCost(new Set()); },
        });
      });
    }

    return actions;
  };

  // フリーゾーンのカードアクション
  const getMyFreeZoneActions = (cardNum: string): CardAction[] => {
    if (!isMyTurn || loading) return [];
    const actions: CardAction[] = [];
    actions.push({
      label: '手札に戻す',
      color: C.textSub,
      onClick: async () => {
        const newFreeZone = (my.field.free_zone ?? []).filter(n => n !== cardNum);
        const newGrants = { ...(my.keyword_grants ?? {}) };
        delete newGrants[cardNum];
        const newMy: typeof my = {
          ...my,
          hand: [...my.hand, cardNum],
          keyword_grants: newGrants,
          field: { ...my.field, free_zone: newFreeZone },
        };
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: newMy }).eq('room_id', roomId);
        setCloseZoneSignal(s => s + 1);
      },
    });
    actions.push({
      label: 'トラッシュへ',
      color: C.danger,
      onClick: async () => {
        const newFreeZone = (my.field.free_zone ?? []).filter(n => n !== cardNum);
        const newGrants = { ...(my.keyword_grants ?? {}) };
        delete newGrants[cardNum];
        const newMy: typeof my = {
          ...my,
          trash: [...my.trash, cardNum],
          keyword_grants: newGrants,
          field: { ...my.field, free_zone: newFreeZone },
        };
        const stateKey = isHost ? 'host_state' : 'guest_state';
        await supabase.from('battle_states').update({ [stateKey]: newMy }).eq('room_id', roomId);
        setCloseZoneSignal(s => s + 1);
      },
    });
    return actions;
  };

  // 勝敗確定後の終了確認（両者が押したらルーム削除）
  const handleEndAck = async () => {
    if (loading) return;
    setLoading(true);
    const ackKey = isHost ? 'host_end_ack' : 'guest_end_ack';
    await supabase.from('battle_states').update({ [ackKey]: true }).eq('room_id', roomId);
    // 最新状態を取得して両者が押したか確認
    const { data } = await supabase
      .from('battle_states')
      .select('host_end_ack, guest_end_ack')
      .eq('room_id', roomId)
      .single();
    if (data?.host_end_ack && data?.guest_end_ack) {
      leavingRef.current = true;
      await supabase.from('battle_states').delete().eq('room_id', roomId);
      await supabase.from('rooms').delete().eq('id', roomId);
      onBack();
      return;
    }
    setLoading(false);
  };

  // 対戦終了（ルーム削除）
  const handleEnd = async () => {
    leavingRef.current = true;
    setLoading(true);
    await supabase.from('battle_states').delete().eq('room_id', roomId);
    await supabase.from('rooms').delete().eq('id', roomId);
    setLoading(false);
    setShowEndConfirm(false);
    onBack();
  };

  return (
    <div style={{ height: '100vh', backgroundColor: C.bgApp, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* 勝敗確定ポップアップ */}
      {bs.global_phase === 'FINISHED' && bs.winner_id && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 5000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 16,
            padding: '40px 32px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20,
            textAlign: 'center',
          }}>
            {bs.winner_id === user.id ? (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>🏆</p>
                <p style={{ color: '#ffd700', fontSize: 28, fontWeight: 'bold', margin: 0 }}>
                  勝利！
                </p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                  おめでとうございます！
                </p>
              </>
            ) : (
              <>
                <p style={{ fontSize: 48, margin: 0 }}>💀</p>
                <p style={{ color: C.danger, fontSize: 28, fontWeight: 'bold', margin: 0 }}>
                  敗北...
                </p>
                <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
                  また挑戦しましょう！
                </p>
              </>
            )}
            {(() => {
              const myAck = isHost ? bs.host_end_ack : bs.guest_end_ack;
              const opAck = isHost ? bs.guest_end_ack : bs.host_end_ack;
              return (
                <>
                  {opAck && !myAck && (
                    <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                      相手が終了を待っています
                    </p>
                  )}
                  <button
                    onClick={handleEndAck}
                    disabled={loading || myAck}
                    style={{
                      width: '100%', padding: '14px 0', borderRadius: 10, border: 'none',
                      backgroundColor: myAck ? C.disabled : C.dangerEnd,
                      color: C.text, fontSize: 15, fontWeight: 'bold',
                      cursor: (loading || myAck) ? 'default' : 'pointer',
                    }}
                  >
                    {myAck ? '終了待機中...' : '対戦終了'}
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* 終了確認モーダル */}
      {showEndConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '28px 24px', width: 'min(88vw, 320px)', textAlign: 'center',
          }}>
            <p style={{ color: C.text, fontSize: 16, fontWeight: 'bold', margin: '0 0 8px' }}>
              対戦を終了しますか？
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 24px' }}>
              ルームが削除され、対戦データは失われます
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={() => setShowEndConfirm(false)}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer',
                }}
              >
                キャンセル
              </button>
              <button
                onClick={handleEnd}
                disabled={loading}
                style={{
                  flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: loading ? C.disabled : C.dangerEnd,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: loading ? 'default' : 'pointer',
                }}
              >
                {loading ? '削除中...' : '終了する'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* グロウ選択モーダル */}
      {showGrowModal && createPortal(
        <div onClick={() => { setShowGrowModal(false); setPendingGrowCard(null); setSelectedGrowCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingGrowCard ? (
              /* ── Phase 1: グロウ先選択 ── */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  グロウ先を選択
                </p>
                <p style={{ color: C.textDim, fontSize: 11, margin: 0, textAlign: 'center' }}>
                  現在 Lv.{currentLrigLevel} → Lv.{currentLrigLevel + 1}
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {growCandidates.length === 0 ? (
                    <p style={{ color: C.textFaint, textAlign: 'center', margin: '12px 0' }}>候補なし</p>
                  ) : growCandidates.map(card => {
                    const growCoinNeeded = parseCoinCost(card.GrowCost);
                    const isFreeGrow = my.free_grow_this_turn === true;
                    const canAfford = isFreeGrow || ((growCoinNeeded === 0 || my.coins >= growCoinNeeded) &&
                      canAffordGrowCost(my.energy, battleCards, card.GrowCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs));
                    const totalReq = isFreeGrow ? 0 : parseGrowCost(card.GrowCost).reduce((s, c) => s + c.count, 0);
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          if (totalReq === 0) { executeGrow(card, new Set()); }
                          else { setPendingGrowCard(card); setSelectedGrowCost(new Set()); }
                        }}
                        disabled={loading || !canAfford}
                        style={{ display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                          backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                          cursor: (loading || !canAfford) ? 'default' : 'pointer',
                          opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>
                            {card.CardName}
                          </p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                            コスト: {card.GrowCost || 'なし'}
                          </p>
                          {(parseInt(card.Coin) || 0) > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              コイン+{card.Coin}枚
                            </p>
                          )}
                          {growCoinNeeded > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              コイン×{growCoinNeeded}（所持: {my.coins}）
                            </p>
                          )}
                          {!canAfford && (
                            <p style={{ color: C.danger, fontSize: 10, margin: '2px 0 0' }}>
                              {growCoinNeeded > 0 && my.coins < growCoinNeeded ? 'コイン不足' : 'エナ不足'}
                            </p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setShowGrowModal(false); setPendingGrowCard(null); setSelectedGrowCost(new Set()); }}
                  style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                    backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
                  キャンセル（グロウしない）
                </button>
              </>
            ) : (() => {
              /* ── Phase 2: コスト支払いカード選択 ── */
              const costItems = parseGrowCost(pendingGrowCard.GrowCost);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedGrowCost].map(i => my.energy[i]);
              const isValid = selectedGrowCost.size === totalReq &&
                canAffordGrowCost(selectedNums, battleCards, pendingGrowCard.GrowCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
              // GROW_COST_SUBSTITUTE_TRASH_SIGNI: 代替コスト情報
              const growSubInfo = collectGrowCostSubstitute(my, battleCardMap, effectsMap);
              const growSubEnaSigni = growSubInfo ? my.energy.filter(cn => {
                const c = battleCardMap.get(cn);
                return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(growSubInfo.signiClass);
              }) : [];
              const canUseGrowSub = growSubInfo && growSubEnaSigni.length > 0 &&
                costItems.some(ci => ci.color === growSubInfo.substituteColor && ci.count > 0);
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingGrowCard(null); setSelectedGrowCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      コストを選択
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingGrowCard.ImgURL} alt={pendingGrowCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {pendingGrowCard.CardName}
                      </p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {pendingGrowCard.GrowCost}
                      </p>
                    </div>
                  </div>
                  <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedGrowCost.size} / {totalReq}枚
                    {costItems.map((c, i) => (
                      <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                    ))}
                  </p>
                  <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : my.energy.map((num, i) => {
                      const card = battleCardMap.get(num);
                      const isSel = selectedGrowCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                      return (
                        <div key={i} onClick={() => toggleGrowCostCard(i)}
                          onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                          onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onContextMenu={e => e.preventDefault()}
                          style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                            overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                            border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                          {card ? (
                            <img src={card.ImgURL} alt={card.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                            </div>
                          )}
                          {isWild && !isSel && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                              backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                              <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {canUseGrowSub && growSubInfo && (
                    <p style={{ color: '#4caf50', fontSize: 11, margin: 0, textAlign: 'center',
                      padding: '4px 8px', background: 'rgba(76,175,80,0.1)', borderRadius: 6 }}>
                      ※ 代替: エナ＜{growSubInfo.signiClass}＞1枚をトラッシュで《{growSubInfo.substituteColor}》代替可
                      （自動適用：追加で{growSubInfo.substituteColor}のエナカードを選ばなくてOK）
                    </p>
                  )}
                  <button onClick={() => executeGrow(pendingGrowCard, selectedGrowCost)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    グロウ実行
                  </button>
                </>
              );
            })()}

          </div>
        </div>,
        document.body,
      )}

      {/* アーツ使用モーダル */}
      {showArtsModal && createPortal(
        <div onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setSelectedArtsCost(new Set()); setIsBetting(false); setIsEncore(false); setKeySubstituteEnabled(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingArtsCard ? (
              /* Phase 1: アーツ選択 */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  アーツを選択
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(() => {
                    const myLrigCard = battleCardMap.get(my.field.lrig.at(-1) ?? '');
                    const myLrigName = myLrigCard?.CardName;
                    const myLrigLevel = myLrigCard ? parseInt(myLrigCard.Level ?? '0') : 0;
                    const oppLrigColor = battleCardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '';
                    return artsCandidates.map(card => {
                    const effCost = computeArtsEffectiveCost(card, my, myLrigName, oppLrigColor, myLrigLevel, battleCardMap, myLrigNameAliases, myArtsThresholdReductions);
                    const extraArtsCosts = activeCostMods.forMy
                      .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                      .flatMap(m => m.amount);
                    const canAfford = canAffordWithExtraCost(my.energy, battleCards, effCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
                    const totalReq = parseGrowCost(effCost).reduce((s, c) => s + c.count, 0);
                    const betCostAmt = parseBetCost(card.EffectText ?? '');
                    const costReduced = effCost !== card.Cost;
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          setIsBetting(false);
                          if (totalReq === 0) { executeArts(card, new Set()); }
                          else {
                            setPendingArtsCard(card);
                            setPendingArtsEffectiveCost(costReduced ? effCost : null);
                            setSelectedArtsCost(new Set());
                          }
                        }}
                        disabled={loading || !canAfford}
                        style={{ display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                          backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                          cursor: (loading || !canAfford) ? 'default' : 'pointer',
                          opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                            {card.CardName}
                          </p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>
                            コスト: {costReduced ? <><s style={{ color: C.textFaint }}>{card.Cost}</s> → {effCost}</> : (card.Cost || 'なし')}
                          </p>
                          <p style={{ color: C.textFaint, fontSize: 10, margin: 0 }}>
                            {card.Timing}
                          </p>
                          {betCostAmt > 0 && (
                            <p style={{ color: C.coin, fontSize: 10, margin: '2px 0 0' }}>
                              ベット: コイン{betCostAmt}枚
                            </p>
                          )}
                          {(() => {
                            const encoreCost = parseEncoreCost(card.EffectText ?? '');
                            if (!encoreCost) return null;
                            const encoreEnaStr = encoreCost.energy.map(e => `《${e.color}》${e.count > 1 ? `×${e.count}` : ''}`).join('');
                            const encoreCoinStr = encoreCost.coins > 0 ? ` コイン${encoreCost.coins}枚` : '';
                            return (
                              <p style={{ color: '#88ddff', fontSize: 10, margin: '2px 0 0' }}>
                                アンコール: {encoreEnaStr}{encoreCoinStr}
                              </p>
                            );
                          })()}
                          {!canAfford && (
                            <p style={{ color: C.danger, fontSize: 10, margin: '2px 0 0' }}>エナ不足</p>
                          )}
                        </div>
                      </button>
                    );
                  });
                  })()}
                </div>
                <button onClick={() => { setShowArtsModal(false); setPendingArtsCard(null); setPendingArtsEffectiveCost(null); setSelectedArtsCost(new Set()); setIsBetting(false); }}
                  style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                    backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
                  キャンセル
                </button>
              </>
            ) : (() => {
              /* Phase 2: コスト支払いカード選択 */
              const rawEffectiveCost = pendingArtsEffectiveCost ?? pendingArtsCard.Cost;
              // ARTS_COLORLESS_MUST_PAY_CENTER_COLOR: 《無》コストをセンタールリグ色で支払わなければならない
              const hasColorlessRestriction = (effectsMap.get(pendingArtsCard.CardNum) ?? [])
                .some(e => e.effectType === 'ACTIVATED' && JSON.stringify(e.action).includes('ARTS_COLORLESS_MUST_PAY_CENTER_COLOR'));
              const centerColorForRestr = hasColorlessRestriction
                ? (battleCardMap.get(my.field.lrig.at(-1) ?? '')?.Color ?? '').split('/')[0] ?? ''
                : '';
              const effectiveCost = hasColorlessRestriction && centerColorForRestr
                ? rawEffectiveCost.replace(/《無》/g, `《${centerColorForRestr}》`)
                : rawEffectiveCost;
              const costItems = parseGrowCost(effectiveCost);
              const encoreCostForCard = parseEncoreCost(pendingArtsCard.EffectText ?? '');
              const encoreExtraEna: { color: string; count: number }[] = encoreCostForCard?.energy ?? [];
              const keySubCount = keySubstituteEnabled && myEnergyTrashSubInfo.keySubInstId ? 2 : 0;
              const baseReq = costItems.reduce((s, c) => s + c.count, 0) +
                (isEncore ? encoreExtraEna.reduce((s, e) => s + e.count, 0) : 0);
              const totalReq = Math.max(0, baseReq - keySubCount);
              const selectedNums = [...selectedArtsCost].map(i => my.energy[i]);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const artsDiscardCost = (effectsMap.get(pendingArtsCard.CardNum) ?? [])
                .filter(e => e.effectType === 'ACTIVATED')
                .reduce((sum, e) => sum + (e.cost?.discard ?? 0), 0);
              const energyValid = selectedArtsCost.size === totalReq &&
                canAffordWithExtraCost(selectedNums, battleCards, effectiveCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount) &&
                (!isEncore || encoreExtraEna.every(req =>
                  selectedNums.filter(n => {
                    const c = battleCardMap.get(n);
                    return c?.Color === req.color || isMultiEna(n, battleCards, my.keyword_grants, myEnaAllMulti);
                  }).length >= req.count
                ));
              const isValid = energyValid && selectedArtsDiscard.size >= artsDiscardCost;
              const betCostForCard = parseBetCost(pendingArtsCard.EffectText ?? '');
              const canBet = betCostForCard > 0 && my.coins >= betCostForCard && !isActionBlocked('BET');
              const canEncore = !!encoreCostForCard && (encoreCostForCard.coins === 0 || my.coins >= encoreCostForCard.coins) && !isActionBlocked('ENCORE');
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingArtsCard(null); setSelectedArtsCost(new Set()); setIsBetting(false); setIsEncore(false); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      コストを選択
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingArtsCard.ImgURL} alt={pendingArtsCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>
                        {pendingArtsCard.CardName}
                      </p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>
                        コスト: {pendingArtsEffectiveCost ?? pendingArtsCard.Cost}
                      </p>
                    </div>
                  </div>
                  {betCostForCard > 0 && (
                    <button
                      onClick={() => { if (canBet || isBetting) setIsBetting(b => !b); }}
                      disabled={!canBet && !isBetting}
                      style={{ padding: '8px 12px', borderRadius: 8,
                        border: isBetting ? `2px solid ${C.coin}` : C.borderUI,
                        backgroundColor: isBetting ? 'rgba(204,136,0,0.15)' : C.bgButton,
                        color: isBetting ? C.coin : (canBet ? C.text : C.textFaint),
                        cursor: (canBet || isBetting) ? 'pointer' : 'default',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>ベット（コイン{betCostForCard}枚追加消費）</span>
                      <span style={{ fontSize: 11, color: canBet ? C.coin : C.danger }}>
                        {isBetting ? 'ON' : 'OFF'} / 所持: {my.coins}枚
                      </span>
                    </button>
                  )}
                  {encoreCostForCard && (
                    <button
                      onClick={() => { if (canEncore || isEncore) setIsEncore(b => !b); }}
                      disabled={!canEncore && !isEncore}
                      style={{ padding: '8px 12px', borderRadius: 8,
                        border: isEncore ? '2px solid #88ddff' : C.borderUI,
                        backgroundColor: isEncore ? 'rgba(0,100,180,0.15)' : C.bgButton,
                        color: isEncore ? '#88ddff' : (canEncore ? C.text : C.textFaint),
                        cursor: (canEncore || isEncore) ? 'pointer' : 'default',
                        fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>アンコール（ルリグデッキに戻す）</span>
                      <span style={{ fontSize: 11 }}>
                        {isEncore ? 'ON' : 'OFF'}
                        {encoreCostForCard.coins > 0 && ` / コイン${encoreCostForCard.coins}枚`}
                      </span>
                    </button>
                  )}
                  {/* キーピース代替トグル */}
                  {myEnergyTrashSubInfo.keySubInstId && baseReq > 0 && (
                    <button
                      onClick={() => { setKeySubstituteEnabled(v => !v); setSelectedArtsCost(new Set()); }}
                      style={{ padding: '6px 10px', borderRadius: 6, border: keySubstituteEnabled ? '2px solid #ff9800' : C.borderUI,
                        backgroundColor: keySubstituteEnabled ? 'rgba(255,152,0,0.2)' : 'transparent',
                        color: C.text, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                      {keySubstituteEnabled ? '✓ ' : ''}キー代替: {battleCardMap.get(myEnergyTrashSubInfo.keySubInstId)?.CardName ?? 'キー'} をルリグTへ (エナ2任意色分)
                    </button>
                  )}
                  <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedArtsCost.size} / {totalReq}枚
                    {costItems.map((c, i) => (
                      <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                    ))}
                    {isEncore && encoreExtraEna.map((e, i) => (
                      <span key={`enc${i}`} style={{ marginLeft: 6, color: '#88ddff' }}>+({e.color}×{e.count})</span>
                    ))}
                  </p>
                  <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0 ? (
                      <p style={{ color: C.textFaint, fontSize: 12, margin: '8px 0' }}>エナがありません</p>
                    ) : my.energy.map((num, i) => {
                      const card = battleCardMap.get(num);
                      const isSel = selectedArtsCost.has(i);
                      const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                      const isTrashWild = myEnergyTrashSubInfo.wildcardInstIds.has(num);
                      const trashColor = myEnergyTrashSubInfo.colorOverrideMap.get(num);
                      const borderColor = isSel ? '#f44336' : isTrashWild ? '#4caf50' : trashColor ? '#9c27b0' : isWild ? '#ffcc00' : undefined;
                      return (
                        <div key={i} onClick={() => toggleArtsCostCard(i)}
                          onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                          onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onContextMenu={e => e.preventDefault()}
                          style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                            overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                            border: borderColor ? `${isSel ? '2px' : '1px'} solid ${borderColor}` : C.borderCard }}>
                          {card ? (
                            <img src={card.ImgURL} alt={card.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                            </div>
                          )}
                          {!isSel && (isTrashWild || trashColor || isWild) && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                              backgroundColor: isTrashWild ? 'rgba(76,175,80,0.85)' : trashColor ? 'rgba(156,39,176,0.85)' : 'rgba(255,204,0,0.85)',
                              textAlign: 'center' }}>
                              <span style={{ fontSize: 7, fontWeight: 'bold', color: '#fff' }}>
                                {isTrashWild ? '代替' : trashColor ?? 'マルチ'}
                              </span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {artsDiscardCost > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedArtsDiscard.size} / {artsDiscardCost}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedArtsDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedArtsDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= artsDiscardCost) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <button onClick={() => executeArts(pendingArtsCard, selectedArtsCost, isBetting, isEncore, selectedArtsDiscard, keySubstituteEnabled)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? (isEncore ? '#3377bb' : C.coin) : C.disabled,
                      color: isValid ? (isEncore ? '#fff' : '#000') : C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    {isEncore ? 'アーツ使用（アンコール）' : isBetting ? 'アーツ使用（ベットあり）' : 'アーツ使用'}
                  </button>
                </>
              );
            })()}

          </div>
        </div>,
        document.body,
      )}

      {/* スペル発動コスト選択 */}
      {pendingSpellCast && createPortal(
        <div onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const spellCard = battleCardMap.get(pendingSpellCast.cardNum);
              if (!spellCard) return null;
              // フィールド条件によるコスト軽減をスペルにも適用
              const myLrigCardSP = battleCardMap.get(my.field.lrig.at(-1) ?? '');
              const effSpellCost = computeArtsEffectiveCost(spellCard, my, myLrigCardSP?.CardName, battleCardMap.get(op.field.lrig.at(-1) ?? '')?.Color ?? '', myLrigCardSP ? parseInt(myLrigCardSP.Level ?? '0') : 0, battleCardMap, myLrigNameAliases);
              const costItems = parseGrowCost(effSpellCost);
              const baseSpellReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedSpellCost].map(i => my.energy[i]);
              const extraSpellCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'スペル')
                .flatMap(m => m.amount);
              // FIRST_SPELL_COST_UP: 相手フィールドが持つ場合、最初のスペルに《無×1》追加
              const firstSpellExtra = !my.actions_done?.includes('USE_SPELL')
                ? collectFirstSpellCostUp(op, effectsMap)
                : 0;
              const firstSpellExtraCosts: { color: string; count: number }[] =
                firstSpellExtra > 0 ? [{ color: '無', count: firstSpellExtra }] : [];
              const allExtraSpellCosts = [...extraSpellCosts, ...firstSpellExtraCosts];
              const totalReq = baseSpellReq + firstSpellExtra;
              const isValid = totalReq === 0 ||
                (selectedSpellCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, effSpellCost, allExtraSpellCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingSpellCast(null); setSelectedSpellCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← キャンセル
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                      スペル発動
                    </p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {spellCard.Cost || 'なし'}</p>
                    </div>
                  </div>
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedSpellCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                        {firstSpellExtra > 0 && (
                          <span style={{ marginLeft: 6, color: C.warn }}>(+《無》×{firstSpellExtra} 初回)</span>
                        )}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedSpellCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => toggleSpellCostCard(i)}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                                overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                                border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <button onClick={() => castSpell(spellCard, selectedSpellCost, pendingSpellCast.handIndex)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.accent : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    発動する
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* スペルカットイン カード拡大 */}
      {cutinSpellZoomed && bs.pending_spell && (() => {
        const zCard = battleCardMap.get(bs.pending_spell.card_num);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setCutinSpellZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setCutinSpellZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* スペルカットインポップアップ（相手のスペル発動中に表示） */}
      {bs.pending_spell && bs.pending_spell.caster_id !== user.id && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          padding: 20 }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '20px 16px', width: 'min(92vw, 360px)', maxHeight: '85vh',
            display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const spellCard = battleCardMap.get(bs.pending_spell.card_num);
              if (!pendingCutinCard) {
                return (
                  <>
                    <p style={{ color: C.danger, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                      スペルカットイン
                    </p>
                    <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                      相手がスペルを発動しました
                    </p>
                    {spellCard && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                        backgroundColor: C.bgButton }}>
                        <img src={spellCard.ImgURL} alt={spellCard.CardName}
                          onClick={() => setCutinSpellZoomed(true)}
                          onTouchEnd={e => { e.preventDefault(); setCutinSpellZoomed(true); }}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{spellCard.CardName}</p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>{spellCard.Timing}</p>
                        </div>
                      </div>
                    )}
                    {cutinCandidates.length > 0 && (
                      <>
                        <p style={{ color: C.textMuted, fontSize: 12, margin: 0 }}>カットインカード:</p>
                        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {cutinCandidates.map(card => {
                            const extraArtsCosts = activeCostMods.forMy
                              .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                              .flatMap(m => m.amount);
                            const cutinReduction = specificCardCostReductions.find(r => r.targetCardName === card.CardName);
                            const cutinReducedCost = cutinReduction ? removeNColorFromCost(card.Cost, '無', cutinReduction.colorlessReduction) : card.Cost;
                            const canAfford = canAffordWithExtraCost(my.energy, battleCards, cutinReducedCost, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors);
                            return (
                              <button key={card.CardNum}
                                onClick={() => { if (canAfford) { setPendingCutinCard(card); setSelectedCutinCost(new Set()); } }}
                                disabled={loading || !canAfford}
                                style={{ display: 'flex', alignItems: 'center', gap: 10,
                                  padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                                  backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                                  cursor: (loading || !canAfford) ? 'default' : 'pointer',
                                  opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                                <img src={card.ImgURL} alt={card.CardName}
                                  style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                                  onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                <div>
                                  <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{card.CardName}</p>
                                  <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>コスト: {card.Cost || 'なし'}</p>
                                  {!canAfford && <p style={{ color: C.danger, fontSize: 10, margin: 0 }}>エナ不足</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <button onClick={handleCutinPass} disabled={loading}
                      style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                        backgroundColor: loading ? C.disabled : C.bgButton,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: loading ? 'default' : 'pointer' }}>
                      {loading ? '処理中...' : 'パス（カットインしない）'}
                    </button>
                  </>
                );
              }
              /* カットインのコスト選択 */
              const cutinReductionModal = specificCardCostReductions.find(r => r.targetCardName === pendingCutinCard.CardName);
              const cutinReducedCostModal = cutinReductionModal ? removeNColorFromCost(pendingCutinCard.Cost, '無', cutinReductionModal.colorlessReduction) : pendingCutinCard.Cost;
              const costItems = parseGrowCost(cutinReducedCostModal);
              const totalReq = costItems.reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedCutinCost].map(i => my.energy[i]);
              const extraArtsCosts = activeCostMods.forMy
                .filter(m => m.direction === 'increase' && m.targetCardType === 'アーツ')
                .flatMap(m => m.amount);
              const isValid = totalReq === 0 ||
                (selectedCutinCost.size === totalReq &&
                  canAffordWithExtraCost(selectedNums, battleCards, cutinReducedCostModal, extraArtsCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors));
              return (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button onClick={() => { setPendingCutinCard(null); setSelectedCutinCost(new Set()); }}
                      style={{ padding: '4px 10px', borderRadius: 6, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 12 }}>
                      ← 戻る
                    </button>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>カットインコスト選択</p>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <img src={pendingCutinCard.ImgURL} alt={pendingCutinCard.CardName}
                      style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 12, fontWeight: 'bold', margin: '0 0 2px' }}>{pendingCutinCard.CardName}</p>
                      <p style={{ color: C.textDim, fontSize: 11, margin: 0 }}>コスト: {pendingCutinCard.Cost || 'なし'}</p>
                    </div>
                  </div>
                  {totalReq > 0 && (
                    <>
                      <p style={{ color: isValid ? C.success : C.textMuted, fontSize: 12, margin: 0, textAlign: 'center' }}>
                        エナから選択: {selectedCutinCost.size} / {totalReq}枚
                        {costItems.map((c, i) => (
                          <span key={i} style={{ marginLeft: 6, color: C.textDim }}>({c.color}×{c.count})</span>
                        ))}
                      </p>
                      <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                        {my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedCutinCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => toggleCutinCostCard(i)}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 52, height: 73, borderRadius: 4,
                                overflow: 'hidden', cursor: 'pointer', flexShrink: 0,
                                border: isSel ? C.borderMulliganSel : isWild ? '1px solid #ffcc00' : C.borderCard }}>
                              {card
                                ? <img src={card.ImgURL} alt={card.CardName} draggable={false}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                                    onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                                : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: 8, color: C.textFaint }}>{num}</span>
                                  </div>
                              }
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.45)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: C.text, fontSize: 14, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <button onClick={() => handleCutinUse(pendingCutinCard, selectedCutinCost)}
                    disabled={loading || !isValid}
                    style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                      backgroundColor: isValid ? C.danger : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !isValid) ? 'default' : 'pointer' }}>
                    カットイン使用
                  </button>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* スペル発動待機中（発動側） */}
      {bs.pending_spell && bs.pending_spell.caster_id === user.id && createPortal(
        <div style={{ position: 'fixed', inset: 0, zIndex: 3200,
          backgroundColor: 'rgba(0,0,0,0.70)',
          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '28px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(() => {
              const spellCard = battleCardMap.get(bs.pending_spell.card_num);
              return (
                <>
                  {spellCard && (
                    <img src={spellCard.ImgURL} alt={spellCard.CardName}
                      style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6, margin: '0 auto' }}
                      onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  )}
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0 }}>
                    {spellCard?.CardName ?? 'スペル'} 発動中
                  </p>
                  <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                    相手のカットイン応答を待っています...
                  </p>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* エナチャージスキップ確認 */}
      {showEnergySkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)', textAlign: 'center',
          }}>
            <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: '0 0 8px' }}>
              エナチャージを行いますか？
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              エナチャージを行わずグロウフェイズへ進みます
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowEnergySkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowEnergySkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showGrowSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              グロウ可能なルリグがいます
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 12px' }}>
              {growCandidates
                .filter(c => canAffordGrowCost(my.energy, battleCards, c.GrowCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs))
                .map(c => c.CardName)
                .join('・')}
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 20px' }}>
              グロウせずにメインフェイズへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowGrowSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowGrowSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* シグニアタックスキップ確認 */}
      {showSigniAttackSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              まだ攻撃していないシグニがいます
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              このままルリグアタックステップへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSigniAttackSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowSigniAttackSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ルリグアタックスキップ確認 */}
      {showLrigAttackSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              まだルリグが攻撃していません
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              このままエンドフェイズへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowLrigAttackSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowLrigAttackSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* ライフバースト確認（自分のチェックゾーンにカードがある場合） */}
      {my.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            {(() => {
              const checkCard = battleCardMap.get(my.field.check!);
              const hasBurst = checkCard?.LifeBurst === '1';
              return (
                <>
                  <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                    ライフクロスクラッシュ
                  </p>
                  {checkCard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <img src={checkCard.ImgURL} alt={checkCard.CardName}
                        onClick={() => setBurstCardZoomed(true)}
                        style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6,
                          boxShadow: hasBurst ? `0 0 14px ${C.accent}` : 'none',
                          cursor: 'pointer' }}
                        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                      <p style={{ color: C.textSub, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        {checkCard.CardName}
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 112, backgroundColor: C.bgButton,
                      borderRadius: 6, margin: '0 auto' }} />
                  )}
                  {hasBurst && !my.suppress_life_burst && !eichiSuppressActive && !my.game_suppress_lb ? (
                    <>
                      <p style={{ color: C.accent, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        ライフバーストあり
                      </p>
                      <div style={{ display: 'flex', gap: 10 }}>
                        <button onClick={() => handleLifeBurstResponse(true)}
                          disabled={loading}
                          style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: 'none',
                            backgroundColor: loading ? C.disabled : C.accent,
                            color: C.text, fontSize: 13, fontWeight: 'bold',
                            cursor: loading ? 'default' : 'pointer' }}>
                          ライフバースト発動
                        </button>
                        <button onClick={() => handleLifeBurstResponse(false)}
                          disabled={loading}
                          style={{ flex: 1, padding: '11px 0', borderRadius: 8, border: C.borderUI,
                            backgroundColor: 'transparent',
                            color: C.textDim, fontSize: 13,
                            cursor: loading ? 'default' : 'pointer' }}>
                          スキップ
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {hasBurst && (my.suppress_life_burst || eichiSuppressActive || my.game_suppress_lb) && (
                        <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
                          ライフバースト抑制中
                        </p>
                      )}
                      {!hasBurst && (
                        <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                          ライフバーストなし
                        </p>
                      )}
                      <button onClick={() => handleLifeBurstResponse(false)}
                        disabled={loading}
                        style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                          backgroundColor: loading ? C.disabled : C.bgButton,
                          color: C.text, fontSize: 13, fontWeight: 'bold',
                          cursor: loading ? 'default' : 'pointer' }}>
                        エナへ送る
                      </button>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ライフクロスクラッシュ カード拡大 */}
      {burstCardZoomed && my.field.check && (() => {
        const zCard = battleCardMap.get(my.field.check);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setBurstCardZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setBurstCardZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* 相手ライフクロスクラッシュ カード拡大 */}
      {opCheckCardZoomed && op.field.check && (() => {
        const zCard = battleCardMap.get(op.field.check);
        if (!zCard) return null;
        return createPortal(
          <div
            onClick={() => setOpCheckCardZoomed(false)}
            onTouchEnd={e => { e.preventDefault(); setOpCheckCardZoomed(false); }}
            style={{ position: 'fixed', inset: 0, zIndex: 5000,
              backgroundColor: 'rgba(0,0,0,0.85)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
            <img src={zCard.ImgURL} alt={zCard.CardName} draggable={false}
              style={{ maxWidth: '80vw', maxHeight: '70vh', borderRadius: 10, objectFit: 'contain' }}
              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
            <span style={{ color: C.textFaint, fontSize: 12 }}>タップで閉じる</span>
          </div>,
          document.body,
        );
      })()}

      {/* 相手のライフクロスクラッシュ確認（攻撃側・読み取り専用） */}
      {!my.field.check && op.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4400,
          backgroundColor: 'rgba(0,0,0,0.80)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            {(() => {
              const checkCard = battleCardMap.get(op.field.check!);
              const hasBurst = checkCard?.LifeBurst === '1';
              return (
                <>
                  <p style={{ color: C.life, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
                    相手のライフクロスクラッシュ
                  </p>
                  {checkCard ? (
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                      <img src={checkCard.ImgURL} alt={checkCard.CardName}
                        onClick={() => setOpCheckCardZoomed(true)}
                        onTouchEnd={e => { e.preventDefault(); setOpCheckCardZoomed(true); }}
                        style={{ width: 80, height: 112, objectFit: 'cover', borderRadius: 6,
                          boxShadow: hasBurst ? `0 0 14px ${C.accent}` : 'none', cursor: 'pointer' }}
                        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                      <p style={{ color: C.textSub, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                        {checkCard.CardName}
                      </p>
                    </div>
                  ) : (
                    <div style={{ width: 80, height: 112, backgroundColor: C.bgButton, borderRadius: 6, margin: '0 auto' }} />
                  )}
                  <p style={{ color: hasBurst ? C.accent : C.textFaint, fontSize: 13, fontWeight: 'bold', margin: 0 }}>
                    {hasBurst ? 'ライフバーストあり' : 'ライフバーストなし'}
                  </p>
                  <p style={{ color: C.textGhost, fontSize: 11, margin: 0 }}>
                    相手の応答を待っています…
                  </p>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ガード応答ダイアログ（自分が攻撃されたとき・バースト処理中は非表示） */}
      {my.field.lrig_attacked && !my.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            <p style={{ color: C.danger, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
              ルリグに攻撃された！
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
              手札の「ガード」を持つカードをトラッシュに送り攻撃を防ぐか、ライフクロスをクラッシュします
            </p>
            {(() => {
              const guardBlockedMax = [...(my.blocked_actions ?? []), ...contBlocked.forSelf]
                .reduce((max, a) => {
                  const m = a.match(/^GUARD_MAX_LV(\d+)/);
                  return m ? Math.max(max, parseInt(m[1])) : max;
                }, -1);
              const declaredRestrictLv = op.declared_guard_restrict_level;
              const handGuardEnabled = my.hand_signi_guard_enabled;
              // 相手のprevent_opp_guardフラグ（PREVENT_OPP_GUARD_THIS_TURN等）でガード禁止
              const guardDisabledByOpp = op.prevent_opp_guard === true;
              // 相手フィールドのOPP_GUARD_COST_COLORLESS: 追加で無色エナ1枚必要
              const oppGuardExtraColorless = collectOppGuardExtraColorlessCost(op, my, battleCardMap, effectsMap, !isMyTurn);
              // 相手フィールドのEXTRA_GUARD_COST_FROM_HAND: 追加でガードカードを手札から捨てる必要
              const oppExtraGuardFromHand = collectOppExtraGuardFromHand(op, battleCardMap, effectsMap);
              // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→追加で手札1枚か《無》必要
              const oppExtraHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
              // game_guard_alt_hand: 自分が能力付与→ガードアイコン代わりに手札N枚捨てでガード可
              const myGuardAltHand = my.game_guard_alt_hand ?? 0;
              const guardCardCountInHand = my.hand.filter(cn => battleCardMap.get(cn)?.Guard === '1').length;
              // エナゾーンが空の場合はガード不可
              const guardBlockedByExtraCost = oppGuardExtraColorless && my.energy.length === 0;
              // 追加ガードカードが1枚しかない場合はガード不可（ガード用1枚＋追加コスト用1枚=2枚必要）
              const guardBlockedByExtraGuard = oppExtraGuardFromHand && guardCardCountInHand < 2;
              // GUARD_ALTERNATIVE_COST: エナゾーンから指定クラスシグニをトラッシュしてガード可能
              const guardAltCost = !guardDisabledByOpp ? collectGuardAlternativeCost(my, battleCardMap, effectsMap) : null;
              const guardAltEnergySigni = guardAltCost ? my.energy.filter(cn => {
                const c = battleCardMap.get(cn);
                return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(guardAltCost.signiClass);
              }) : [];
              const guardCards = (guardDisabledByOpp || guardBlockedByExtraCost || guardBlockedByExtraGuard) ? [] : my.hand
                .map((num, i) => ({ num, i, card: battleCardMap.get(num) }))
                .filter(({ num, card }) => {
                  // OPTIONAL_DISCARD_GUARD: 手札から任意カードを捨ててガード可能
                  if (my.optional_discard_guard_enabled) return true;
                  // hand_signi_guard_enabled: 手札のシグニはすべてガード可能
                  // myHandGuardClasses: 特定クラスの手札シグニがガード可能 (HAND_SIGNI_HAS_GUARD_ICON)
                  const classGuardable = myHandGuardClasses.length > 0 && card?.Type === 'シグニ' &&
                    myHandGuardClasses.some(cls => card?.CardClass?.includes(cls));
                  const isGuardable = card?.Guard === '1' || (handGuardEnabled && card?.Type === 'シグニ') || classGuardable;
                  if (!isGuardable) return false;
                  if (guardBlockedMax >= 0 && parseInt(card?.Level ?? '-1') <= guardBlockedMax) return false;
                  if (declaredRestrictLv !== undefined && parseInt(card?.Level ?? '-1') === declaredRestrictLv) return false;
                  return true;
                  void num;
                });
              return (
                <>
                  {oppGuardExtraColorless && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加で《無》×1（エナ1枚）を支払わないとガードできません
                      {guardBlockedByExtraCost && '（エナゾーンが空のためガード不可）'}
                    </p>
                  )}
                  {oppExtraGuardFromHand && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加でガードアイコンカードを1枚手札から捨てないとガードできません
                      {guardBlockedByExtraGuard && `（ガードカード${guardCardCountInHand}枚では不足）`}
                    </p>
                  )}
                  {oppExtraHandOrColorless && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加で手札1枚か《無》×1を支払わないとガードできません（自動消費）
                    </p>
                  )}
                  {guardAltCost && guardAltEnergySigni.length > 0 && (
                    <button onClick={handleGuardWithEnergyAlternative} disabled={loading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #4caf50',
                        backgroundColor: 'rgba(76,175,80,0.15)', color: '#4caf50', cursor: 'pointer',
                        fontSize: 13, marginBottom: 8 }}>
                      代替ガード：エナ＜{guardAltCost.signiClass}＞1枚をトラッシュ
                    </button>
                  )}
                  {myGuardAltHand > 0 && my.hand.length >= myGuardAltHand && (
                    <button onClick={handleGuardWithHandAlternative} disabled={loading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #7cb9e8',
                        backgroundColor: 'rgba(124,185,232,0.15)', color: '#7cb9e8', cursor: 'pointer',
                        fontSize: 13, marginBottom: 8 }}>
                      代替ガード：手札{myGuardAltHand}枚を捨てる（ガードアイコン不要）
                    </button>
                  )}
                  {guardCards.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: '40vh' }}>
                      {guardCards.map(({ num, i, card }) => (
                        <button key={i} onClick={() => handleGuardResponse(i)}
                          disabled={loading}
                          style={{ display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                            backgroundColor: loading ? C.disabled : C.bgButton,
                            cursor: loading ? 'default' : 'pointer', textAlign: 'left' }}>
                          {card && (
                            <img src={card.ImgURL} alt={card.CardName}
                              style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                          )}
                          <div>
                            <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                              {card?.CardName ?? num}
                            </p>
                            <p style={{ color: C.accent, fontSize: 11, margin: 0 }}>
                              ガードに使う（トラッシュへ）{oppGuardExtraColorless ? '＋《無》×1消費' : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                      使用できるガードカードが手札にありません
                    </p>
                  )}
                </>
              );
            })()}
            <button onClick={() => handleGuardResponse(null)}
              disabled={loading}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: loading ? C.disabled : C.danger,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: loading ? 'default' : 'pointer' }}>
              ガードしない（ライフクロスクラッシュ）
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* リムーブ選択モーダル */}
      {showRemoveModal && createPortal(
        <div onClick={() => setShowRemoveModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '24px 20px', width: 'min(88vw, 320px)', textAlign: 'center',
              display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0 }}>リムーブ</p>
            <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
              トラッシュに送るゾーンを選択（レゾナ不可）
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                const stack = my.field.signi[zi] ?? [];
                const topCardNum = stack[stack.length - 1] ?? null;
                const topCard = topCardNum ? battleCardMap.get(topCardNum) : null;
                const isEmpty = stack.length === 0;
                const isResona = topCard?.Type === 'レゾナ';
                const isDisabled = isEmpty || isResona;
                const isSel = selectedRemoveZones.has(zi);
                return (
                  <button key={zi}
                    onClick={() => { if (!isDisabled) toggleRemoveZone(zi); }}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 8,
                      border: isSel ? `2px solid ${C.danger}` : isDisabled ? `1px solid #333` : C.borderUI,
                      backgroundColor: isSel ? 'rgba(244,67,54,0.2)' : isDisabled ? C.bgCardEmpty : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 12, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                    {topCard ? (
                      <img src={topCard.ImgURL} alt={topCard.CardName}
                        style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4 }}
                        onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                    ) : (
                      <div style={{ width: 44, height: 62, backgroundColor: C.bgCardEmpty,
                        borderRadius: 4, border: C.borderEmpty }} />
                    )}
                    <span>ゾーン{zi + 1}</span>
                    {isResona && <span style={{ fontSize: 10, color: C.danger }}>レゾナ</span>}
                    {isEmpty  && <span style={{ fontSize: 10, color: C.textFaint }}>空</span>}
                  </button>
                );
              })}
            </div>
            <button onClick={handleRemove}
              disabled={loading || selectedRemoveZones.size === 0}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: selectedRemoveZones.size > 0 ? '#8b4513' : C.disabled,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: (loading || selectedRemoveZones.size === 0) ? 'default' : 'pointer' }}>
              {selectedRemoveZones.size > 0 ? `${selectedRemoveZones.size}枚をトラッシュへ` : 'ゾーンを選択してください'}
            </button>
            <button onClick={() => setShowRemoveModal(false)}
              style={{ padding: '8px 0', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13 }}>
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* シグニ召喚ゾーン選択 */}
      {pendingSigniSummon && createPortal(
        <div onClick={() => setPendingSigniSummon(null)}
          style={{
            position: 'fixed', inset: 0, zIndex: 3500,
            backgroundColor: 'rgba(0,0,0,0.88)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          <div onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '24px 20px', width: 'min(80vw, 300px)', textAlign: 'center',
            }}>
            <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: '0 0 4px' }}>
              召喚先のゾーンを選択
            </p>
            {(() => {
              const summonCard = battleCardMap.get(pendingSigniSummon.cardNum);
              const signiLevel = parseInt(summonCard?.Level ?? '0') || 0;
              return (
                <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 14px' }}>
                  Lv.{signiLevel}　リミット: {fieldSigniTotal}/{lrigLimit}
                </p>
              );
            })()}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {([0, 1, 2] as const).map(zi => {
                const summonCard = battleCardMap.get(pendingSigniSummon.cardNum);
                const signiLevel = parseInt(summonCard?.Level ?? '0') || 0;
                const signiPower = parseInt(summonCard?.Power ?? '0') || 0;
                const zoneStack = my.field.signi[zi] ?? [];
                const isOccupied = zoneStack.length > 0;
                const pendingRiseFilter = summonCard ? getRiseFilter(summonCard.EffectText ?? '') : null;
                // ライズカード: 条件を満たす占有ゾーンのみ有効
                const riseConditionMet = pendingRiseFilter
                  ? (isOccupied && matchesRiseFilter(getCardNum(zoneStack.at(-1)!), pendingRiseFilter, battleCardMap))
                  : false;
                // ライズ: 既存シグニの分を引いて新シグニ分を加算
                const existingTopLevel = pendingRiseFilter && isOccupied
                  ? parseInt(battleCardMap.get(getCardNum(zoneStack.at(-1)!))?.Level ?? '0') || 0
                  : 0;
                const afterTotal = fieldSigniTotal - existingTopLevel + signiLevel;
                const overLimit = afterTotal > lrigLimit;
                // DEPLOY_RESTRICT: signi_deploy_power_limit が設定されている場合
                const overPowerLimit = my.signi_deploy_power_limit !== undefined && signiPower >= my.signi_deploy_power_limit;
                const isDisabled = loading || overLimit || overPowerLimit ||
                  (pendingRiseFilter ? !riseConditionMet : isOccupied);
                return (
                  <button key={zi}
                    onClick={() => !isDisabled && handleSummonSigni(pendingSigniSummon.handIndex, zi)}
                    disabled={isDisabled}
                    style={{
                      flex: 1, padding: '12px 0', borderRadius: 8,
                      border: (pendingRiseFilter ? !riseConditionMet : isOccupied) ? `1px solid ${C.textFaint}` : (overLimit || overPowerLimit) ? `1px solid ${C.danger}` : C.borderUI,
                      backgroundColor: isDisabled ? C.disabled : C.bgButton,
                      color: isDisabled ? C.textFaint : C.text,
                      fontSize: 13, cursor: isDisabled ? 'default' : 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                    }}>
                    <span>ゾーン{zi + 1}{pendingRiseFilter ? (riseConditionMet ? ' (ライズ可)' : ' (条件不一致)') : (isOccupied ? ' (使用中)' : '')}</span>
                    <span style={{ fontSize: 11, color: (pendingRiseFilter ? !riseConditionMet : isOccupied) ? C.textFaint : (overLimit || overPowerLimit) ? C.danger : C.textDim }}>
                      {pendingRiseFilter ? (riseConditionMet ? 'ライズ' : '—') : (isOccupied ? '—' : overPowerLimit ? 'パワー制限' : overLimit ? 'リミット超過' : `${afterTotal}/${lrigLimit}`)}
                    </span>
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPendingSigniSummon(null)}
              style={{
                marginTop: 12, padding: '8px 20px', borderRadius: 8, border: C.borderUI,
                backgroundColor: 'transparent', color: C.textDim, cursor: 'pointer', fontSize: 13,
              }}>
              キャンセル
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* 強制攻撃バナー */}
      {isMyTurn && my.must_attack_signi && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#7a1a1a', padding: '4px 12px',
          fontSize: 11, color: '#ffaaaa', textAlign: 'center' }}>
          ⚠ あなたのシグニは可能ならばアタックしなければなりません
        </div>
      )}
      {!isMyTurn && op.must_attack_signi && bs.turn_phase === 'ATTACK_SIGNI' && (
        <div style={{ flexShrink: 0, backgroundColor: '#1a3a1a', padding: '4px 12px',
          fontSize: 11, color: '#aaffaa', textAlign: 'center' }}>
          対戦相手のシグニは可能ならばアタックしなければなりません
        </div>
      )}

      {/* ステータスバー */}
      <div style={{
        flexShrink: 0, backgroundColor: C.bgBar, borderBottom: C.borderBar,
        padding: '6px 12px', display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <span style={{ color: C.textMuted, fontWeight: 'bold', fontSize: 13 }}>T{bs.turn_count}</span>
        <span style={{ color: isMyTurn ? C.accent : C.textDim, fontSize: 12, fontWeight: 'bold' }}>
          {PHASE_LABEL[bs.turn_phase] ?? bs.turn_phase}
        </span>

        {/* GROWフェイズのグロウボタン */}
        {isMyTurn && bs.turn_phase === 'GROW' && (() => {
          const used    = my.actions_done?.includes('GROW') ?? false;
          const blocked = (my.blocked_actions?.includes('GROW') ?? false) || (my.no_grow ?? false);
          if (used || blocked || growCandidates.length === 0) return null;
          return (
            <button onClick={() => setShowGrowModal(true)} disabled={loading}
              style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold',
                backgroundColor: C.success, color: C.text, cursor: loading ? 'default' : 'pointer' }}>
              グロウ
            </button>
          );
        })()}

        {iControlThisPhase ? (
          bs.turn_phase === 'ATTACK_LRIG' && op.field.lrig_attacked ? (
            <span style={{ fontSize: 11, color: C.textDim }}>ガード応答待ち...</span>
          ) : (
          <button
            onClick={handlePhaseAdvance}
            disabled={!!(bs.effect_stack || bs.pending_effect || loading)}
            style={{
              padding: '5px 16px', borderRadius: 5, border: 'none',
              backgroundColor: bs.turn_phase === 'END' ? C.dangerDark : C.accent,
              color: C.text, fontSize: 12, fontWeight: 'bold',
              cursor: 'pointer',
              visibility: (bs.effect_stack || bs.pending_effect || loading) ? 'hidden' : 'visible',
            }}
          >
            {PHASE_BTN[bs.turn_phase]}
          </button>
          )
        ) : (
          <span style={{ fontSize: 11, color: C.textDim }}>
            {WAITING_MSG[bs.turn_phase] ?? '相手のターン中...'}
          </span>
        )}

        {/* MAINフェイズのリムーブボタン */}
        {isMyTurn && bs.turn_phase === 'MAIN' && !(my.actions_done?.includes('REMOVE') ?? false) && (
          <button onClick={() => { setShowRemoveModal(true); setSelectedRemoveZones(new Set()); }}
            disabled={loading}
            style={{ padding: '4px 10px', borderRadius: 4, border: 'none', fontSize: 11, fontWeight: 'bold',
              backgroundColor: '#8b4513', color: C.text, cursor: loading ? 'default' : 'pointer' }}>
            リムーブ
          </button>
        )}

        {/* MAINフェイズ: エナゾーンのアクセカード発動ボタン */}
        {isMyTurn && bs.turn_phase === 'MAIN' && !loading && (() => {
          const acceEffects: { cardNum: string; effect: import('../types/effects').CardEffect; alreadyDone: boolean }[] = [];
          for (const energyCardNum of my.energy) {
            for (const eff of (effectsMap.get(energyCardNum) ?? [])) {
              if (eff.effectType !== 'ACTIVATED') continue;
              if (!eff.timing?.includes('MAIN')) continue;
              if (eff.action.type !== 'ATTACH_ACCE') continue;
              const alreadyDone = my.actions_done?.includes(eff.effectId) ?? false;
              acceEffects.push({ cardNum: energyCardNum, effect: eff, alreadyDone });
            }
          }
          if (acceEffects.length === 0) return null;
          return (
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {acceEffects.map(({ cardNum, effect, alreadyDone }) => {
                const card = battleCardMap.get(cardNum);
                // MULTI_ACCE_LIMIT: 多アクセ可能シグニ（max2個）を考慮したターゲット判定
                const multiAcceSigni = collectMultiAcceSigni(my, effectsMap, battleCardMap, op, true);
                const hasTarget = my.field.signi.some((s, i) => {
                  if (!s?.length) return false;
                  const topCn = s.at(-1)!;
                  const currentAcce = my.field.signi_acce?.[i];
                  if (!currentAcce) return true; // 空きスロット
                  // MULTI_ACCE_LIMIT: このシグニが多アクセ可で既に1個ついている場合は追加可
                  return multiAcceSigni.includes(topCn);
                });
                return (
                  <button key={cardNum + effect.effectId}
                    onClick={() => { setPendingEnergyActivated({ cardNum, effect }); setSelectedEnergyActivatedCost(new Set()); }}
                    disabled={alreadyDone || !hasTarget || loading}
                    style={{ padding: '4px 8px', borderRadius: 4, border: 'none', fontSize: 10, fontWeight: 'bold',
                      backgroundColor: (alreadyDone || !hasTarget) ? C.disabled : '#4caf50',
                      color: C.text, cursor: (alreadyDone || !hasTarget || loading) ? 'default' : 'pointer',
                      maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {card?.CardName ?? cardNum}【アクセ】
                  </button>
                );
              })}
            </div>
          );
        })()}

      </div>

      {/* 盤面エリア */}
      <div style={{ flex: 1, overflow: 'hidden', padding: 4, display: 'flex', flexDirection: 'column', gap: 3, boxSizing: 'border-box' }}>

        {/* バトルログ */}
        {battleLogs.length > 0 && (
          <div
            ref={logScrollRef}
            onClick={() => setLogExpanded(v => !v)}
            style={{
              flexShrink: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              borderRadius: 5,
              padding: '3px 8px',
              cursor: 'pointer',
              overflow: 'hidden',
              maxHeight: logExpanded ? 200 : 38,
              overflowY: logExpanded ? 'auto' : 'hidden',
              border: '1px solid rgba(255,255,255,0.09)',
              transition: 'max-height 0.2s ease',
              position: 'relative',
            }}
          >
            {[...battleLogs].reverse().slice(0, logExpanded ? 60 : 2).map((log, i) => {
              const text = log.user_id !== user.id
                ? log.action.replace(/あなた/g, '\x00').replace(/相手/g, 'あなた').replace(/\x00/g, '相手')
                : log.action;
              return (
                <div key={i} style={{ fontSize: 10, color: i === 0 ? '#b8d4d4' : '#7a9a9a', lineHeight: '1.6', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {text}
                </div>
              );
            })}
            <div style={{
              position: 'absolute', right: 6, top: '50%', transform: logExpanded ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)',
              fontSize: 8, color: 'rgba(255,255,255,0.3)', pointerEvents: 'none', transition: 'transform 0.2s',
            }}>▼</div>
          </div>
        )}

        {/* 相手盤面 */}
        <div style={{ border: C.borderPanel, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgOpponent }}>
          <HandCards cardNums={op.hand} cards={battleCards} faceDown />
          <PlayerField state={op} cards={battleCards} isMe={false} effectivePowers={effectivePowers} />
        </div>

        {/* 中央区切り */}
        <div style={{ height: 2, flexShrink: 0, background: 'linear-gradient(to right, transparent, #007bff33, transparent)' }} />

        {/* 自分の盤面 */}
        <div style={{ border: C.borderSelf, borderRadius: 6, padding: '4px 6px', backgroundColor: C.bgSelf }}>
          <PlayerField state={my} cards={battleCards} isMe={true} getSigniZoneActions={getMySigniZoneActions} getLrigDeckCardActions={getMyLrigDeckCardActions} getLrigFieldActions={getMyLrigFieldActions} getKeyPieceActions={getKeyPieceActions} getAssistLActions={() => getAssistActions('l')} getAssistRActions={() => getAssistActions('r')} getFreeZoneActions={getMyFreeZoneActions} closeZoneSignal={closeZoneSignal} effectivePowers={effectivePowers} />
          <HandCards cardNums={my.hand} cards={battleCards} getCardActions={getMyHandCardActions} />
        </div>
      </div>

      {/* ===== キーピース 使用モーダル ===== */}
      {showKeyModal && pendingKeyCard && createPortal(
        <div onClick={() => { setShowKeyModal(false); setPendingKeyCard(null); setSelectedKeyCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = pendingKeyCard;
              const coinNeeded = parseCoinCost(card.Cost) + parseCoinCost(card.GrowCost);
              const energyTotal = parseGrowCost(card.Cost).reduce((s, c) => s + c.count, 0);
              const selectedNums = [...selectedKeyCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 || (selectedKeyCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, card.Cost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs));
              const canAfford = energyOk && my.coins >= coinNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    キーにセット
                  </p>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <img src={card.ImgURL} alt={card.CardName}
                      style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                    <div>
                      <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                      <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                        コスト: {[coinNeeded > 0 ? `コイン${coinNeeded}個` : null, energyTotal > 0 ? `エナ${energyTotal}枚` : null].filter(Boolean).join('・') || 'なし'}
                      </p>
                      {coinNeeded > 0 && <p style={{ color: my.coins >= coinNeeded ? C.coin : C.danger, fontSize: 11, margin: '2px 0 0' }}>手持ちコイン: {my.coins}</p>}
                    </div>
                  </div>
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedKeyCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => setSelectedKeyCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isWild && !isSel && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}><span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setShowKeyModal(false); setPendingKeyCard(null); setSelectedKeyCost(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeKeyPiece(card, selectedKeyCost)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : '#cc8800',
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      セット
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== キーピース 起動効果モーダル ===== */}
      {pendingKeyActivated && createPortal(
        <div onClick={() => { setPendingKeyActivated(null); setSelectedKeyActivatedCost(new Set()); setSelectedKeyActivatedDiscard(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingKeyActivated.cardNum);
              const eff = pendingKeyActivated.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const discardNeeded = eff.cost?.discard ?? 0;
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedKeyActivatedCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 || (selectedKeyActivatedCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs));
              const canAfford = energyOk && selectedKeyActivatedDiscard.size >= discardNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>キー【起】効果を発動</p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>コスト: {[
                          energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                          discardNeeded > 0 ? `手札${discardNeeded}枚` : null,
                        ].filter(Boolean).join('・') || 'なし'}</p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedKeyActivatedCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => setSelectedKeyActivatedCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isWild && !isSel && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}><span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {discardNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedKeyActivatedDiscard.size} / {discardNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedKeyActivatedDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedKeyActivatedDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= discardNeeded) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setPendingKeyActivated(null); setSelectedKeyActivatedCost(new Set()); setSelectedKeyActivatedDiscard(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeKeyActivated(pendingKeyActivated.cardNum, eff, selectedKeyActivatedCost, selectedKeyActivatedDiscard)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== アシストルリグ グロウモーダル ===== */}
      {showAssistGrowModal && pendingAssistSide && createPortal(
        <div onClick={() => { setShowAssistGrowModal(false); setPendingAssistGrowCard(null); setPendingAssistSide(null); setSelectedAssistGrowCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>

            {!pendingAssistGrowCard ? (
              /* フェーズ1: アシストルリグ選択 */
              <>
                <p style={{ color: C.textSub, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  アシストグロウ（{pendingAssistSide === 'l' ? '左' : '右'}）― カードを選択
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {getAssistGrowCandidates(pendingAssistSide).map(card => {
                    const canAfford = canAffordGrowCost(my.energy, battleCards, card.GrowCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
                    const energyTotal = parseGrowCost(card.GrowCost).reduce((s, c) => s + c.count, 0);
                    return (
                      <button key={card.CardNum}
                        onClick={() => {
                          if (!canAfford) return;
                          if (energyTotal === 0) { executeAssistGrow(card, pendingAssistSide, new Set()); }
                          else { setPendingAssistGrowCard(card); setSelectedAssistGrowCost(new Set()); }
                        }}
                        disabled={loading || !canAfford}
                        style={{ display: 'flex', alignItems: 'center', gap: 10,
                          padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                          backgroundColor: canAfford ? C.bgButton : C.bgButtonDark,
                          cursor: (loading || !canAfford) ? 'default' : 'pointer',
                          opacity: canAfford ? 1 : 0.5, textAlign: 'left' }}>
                        <img src={card.ImgURL} alt={card.CardName}
                          style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                          onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <div>
                          <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>{card.CardName}</p>
                          <p style={{ color: C.textDim, fontSize: 11, margin: '0 0 2px' }}>Lv.{card.Level} / グロウコスト: {card.GrowCost || 'なし'}</p>
                          <p style={{ color: C.textFaint, fontSize: 10, margin: 0 }}>{card.CardClass} / {card.Timing}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
                <button onClick={() => { setShowAssistGrowModal(false); setPendingAssistSide(null); }} disabled={loading}
                  style={{ padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                  キャンセル
                </button>
              </>
            ) : (
              /* フェーズ2: エナコスト選択 */
              (() => {
                const card = pendingAssistGrowCard;
                const side = pendingAssistSide;
                const growCost = card.GrowCost;
                const energyTotal = parseGrowCost(growCost).reduce((s, c) => s + c.count, 0);
                const selectedNums = [...selectedAssistGrowCost].map(i => my.energy[i]);
                const canAfford = energyTotal === 0
                  ? true
                  : selectedAssistGrowCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, growCost, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
                return (
                  <>
                    <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                      アシストグロウ（{side === 'l' ? '左' : '右'}）
                    </p>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>Lv.{card.Level} / グロウコスト: {growCost || 'なし'}</p>
                      </div>
                    </div>
                    {energyTotal > 0 && (
                      <>
                        <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedAssistGrowCost.size} / {energyTotal}枚</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                          {my.energy.map((num, i) => {
                            const c = battleCardMap.get(num);
                            const isSel = selectedAssistGrowCost.has(i);
                            const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                            return (
                              <div key={i} onClick={() => setSelectedAssistGrowCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                                onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                                onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                                onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                                onContextMenu={e => e.preventDefault()}
                                style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                  border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                                {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                   : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                                {isWild && !isSel && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}><span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span></div>}
                                {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <button onClick={() => { setPendingAssistGrowCard(null); setSelectedAssistGrowCost(new Set()); }} disabled={loading}
                        style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                        戻る
                      </button>
                      <button onClick={() => executeAssistGrow(card, side, selectedAssistGrowCost)} disabled={loading || !canAfford}
                        style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                          backgroundColor: (loading || !canAfford) ? C.disabled : '#6644aa',
                          color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                        グロウ
                      </button>
                    </div>
                  </>
                );
              })()
            )}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== アシストルリグ 起動効果モーダル ===== */}
      {pendingAssistActivated && createPortal(
        <div onClick={() => { setPendingAssistActivated(null); setSelectedAssistActivatedCost(new Set()); setSelectedAssistActivatedDiscard(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000, backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingAssistActivated.cardNum);
              const eff = pendingAssistActivated.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const discardNeeded = eff.cost?.discard ?? 0;
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedAssistActivatedCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 || (selectedAssistActivatedCost.size === energyTotal && canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs));
              const canAfford = energyOk && selectedAssistActivatedDiscard.size >= discardNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>アシスト【起】効果を発動</p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName} style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>コスト: {[
                          energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                          discardNeeded > 0 ? `手札${discardNeeded}枚` : null,
                        ].filter(Boolean).join('・') || 'なし'}</p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>エナゾーンから選択: {selectedAssistActivatedCost.size} / {energyTotal}枚</p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedAssistActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i} onClick={() => setSelectedAssistActivatedCost(prev => { const next = new Set(prev); if (next.has(i)) { next.delete(i); return next; } if (next.size >= energyTotal) return prev; next.add(i); return next; })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isWild && !isSel && <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}><span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {discardNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedAssistActivatedDiscard.size} / {discardNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedAssistActivatedDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedAssistActivatedDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= discardNeeded) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard, cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? <img src={c.ImgURL} alt={c.CardName} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                 : <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ fontSize: 7, color: C.textFaint }}>{num}</span></div>}
                              {isSel && <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span></div>}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { setPendingAssistActivated(null); setSelectedAssistActivatedCost(new Set()); setSelectedAssistActivatedDiscard(new Set()); }} disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI, backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button onClick={() => executeAssistActivated(pendingAssistActivated.cardNum, eff, selectedAssistActivatedCost, selectedAssistActivatedDiscard)} disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold', cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== シグニ起動効果 コスト支払いモーダル ===== */}
      {pendingSigniActivated && createPortal(
        <div
          onClick={() => { setPendingSigniActivated(null); setSelectedSigniActivatedCost(new Set()); setSelectedSigniActivatedDiscard(new Set()); setKeySubstituteEnabled(false); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* カード情報 */}
            {(() => {
              const card = battleCardMap.get(pendingSigniActivated.cardNum);
              const eff  = pendingSigniActivated.effect;
              const isCostZeroByEffect = my.activate_cost_zero_signi === pendingSigniActivated.cardNum;
              const energyTotal = isCostZeroByEffect ? 0 : (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const discardNeeded = eff.cost?.discard ?? 0;
              const costStr = isCostZeroByEffect ? '' : ((eff.cost?.energy ?? []).map(e => `${e.color}${e.count}`).join('') || '');
              const keySubCount = (!isCostZeroByEffect && keySubstituteEnabled && myEnergyTrashSubInfo.keySubInstId) ? 2 : 0;
              // INCREASE_ACT_ABILITY_COST: 相手フィールドが持つ場合、自分のターン中に起動能力コスト+1
              const actCostExtra = isCostZeroByEffect ? 0 : collectIncreaseActCost(op, isMyTurn, effectsMap);
              const actExtraCosts: { color: string; count: number }[] =
                actCostExtra > 0 ? [{ color: '無', count: actCostExtra }] : [];
              const adjustedTotal = Math.max(0, energyTotal + actCostExtra - keySubCount);
              const selectedNums = [...selectedSigniActivatedCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0 && actCostExtra === 0
                ? true
                : selectedSigniActivatedCost.size === adjustedTotal &&
                  (actCostExtra > 0
                    ? canAffordWithExtraCost(selectedNums, battleCards, costStr, actExtraCosts, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount)
                    : canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myEnergyTrashSubInfo.wildcardInstIds, myEnergyTrashSubInfo.colorOverrideMap, keySubCount));
              const discardOk = selectedSigniActivatedDiscard.size >= discardNeeded;
              const canAfford = energyOk && discardOk;

              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【起】効果を発動
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            energyTotal > 0 ? `エナ${energyTotal}枚` : null,
                            eff.cost?.discard ? `手札${eff.cost.discard}枚` : null,
                            eff.cost?.down_self ? 'このシグニをダウン' : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* キーピース代替トグル */}
                  {myEnergyTrashSubInfo.keySubInstId && energyTotal > 0 && (
                    <button
                      onClick={() => {
                        setKeySubstituteEnabled(v => !v);
                        setSelectedSigniActivatedCost(new Set());
                      }}
                      style={{ padding: '6px 10px', borderRadius: 6, border: keySubstituteEnabled ? '2px solid #ff9800' : C.borderUI,
                        backgroundColor: keySubstituteEnabled ? 'rgba(255,152,0,0.2)' : 'transparent',
                        color: C.text, fontSize: 11, cursor: 'pointer', textAlign: 'left' }}>
                      {keySubstituteEnabled ? '✓ ' : ''}キー代替: {battleCardMap.get(myEnergyTrashSubInfo.keySubInstId)?.CardName ?? 'キー'} をルリグTへ (エナ2任意色分)
                    </button>
                  )}

                  {(energyTotal > 0 || actCostExtra > 0) && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedSigniActivatedCost.size} / {adjustedTotal}枚
                        {actCostExtra > 0 && (
                          <span style={{ marginLeft: 6, color: C.warn }}>(+《無》×{actCostExtra})</span>
                        )}
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          const isTrashWild = myEnergyTrashSubInfo.wildcardInstIds.has(num);
                          const trashColor = myEnergyTrashSubInfo.colorOverrideMap.get(num);
                          const borderColor = isSel ? '#f44336' : isTrashWild ? '#4caf50' : trashColor ? '#9c27b0' : isWild ? '#ffcc00' : undefined;
                          return (
                            <div key={i}
                              onClick={() => setSelectedSigniActivatedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= adjustedTotal) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: borderColor ? `${isSel ? '2px' : '1px'} solid ${borderColor}` : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {!isSel && (isTrashWild || trashColor || isWild) && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: isTrashWild ? 'rgba(76,175,80,0.85)' : trashColor ? 'rgba(156,39,176,0.85)' : 'rgba(255,204,0,0.85)',
                                  textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#fff' }}>
                                    {isTrashWild ? '代替' : trashColor ? trashColor : 'マルチ'}
                                  </span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  {discardNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedSigniActivatedDiscard.size} / {discardNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniActivatedDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedSigniActivatedDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= discardNeeded) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingSigniActivated(null); setSelectedSigniActivatedCost(new Set()); setSelectedSigniActivatedDiscard(new Set()); setKeySubstituteEnabled(false); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeSigniActivated(pendingSigniActivated.cardNum, eff, selectedSigniActivatedCost, selectedSigniActivatedDiscard, keySubstituteEnabled)}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== エナゾーンACTIVATED（アクセカード）モーダル ===== */}
      {pendingEnergyActivated && createPortal(
        <div
          onClick={() => { setPendingEnergyActivated(null); setSelectedEnergyActivatedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingEnergyActivated.cardNum);
              const eff = pendingEnergyActivated.effect;
              // ACCE_COST_REDUCTION: WX16-044等が場にある場合、緑コストを1軽減
              const acceGreenReduction = collectAcceCostReduction(my, effectsMap);
              const baseCostItems = eff.cost?.energy ?? [];
              const reducedCostItems = acceGreenReduction > 0
                ? (() => {
                    let rem = acceGreenReduction;
                    return baseCostItems.map(c => {
                      if (rem > 0 && c.color === '緑' && c.count > 0) {
                        const reduce = Math.min(rem, c.count);
                        rem -= reduce;
                        return { ...c, count: c.count - reduce };
                      }
                      return c;
                    }).filter(c => c.count > 0);
                  })()
                : baseCostItems;
              const energyTotal = reducedCostItems.reduce((s, c) => s + c.count, 0);
              const costStr = reducedCostItems.map(e => `${e.color}${e.count}`).join('') || '';
              const selectedNums = [...selectedEnergyActivatedCost].map(i => my.energy[i]);
              const canAfford = energyTotal === 0
                ? true
                : selectedEnergyActivatedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【アクセ】発動
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          このカードをエナゾーンからシグニのアクセにする
                        </p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: '2px 0 0' }}>
                          コスト: {energyTotal > 0 ? reducedCostItems.map(e => `《${e.color}》×${e.count}`).join('') : 'なし'}
                          {acceGreenReduction > 0 && (
                            <span style={{ color: C.success, marginLeft: 4 }}>(《緑》×{acceGreenReduction}軽減)</span>
                          )}
                        </p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedEnergyActivatedCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c2 = battleCardMap.get(num);
                          // アクセカード自身は選択対象から除外
                          if (num === pendingEnergyActivated.cardNum) return null;
                          const isSel = selectedEnergyActivatedCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i}
                              onClick={() => setSelectedEnergyActivatedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c2 ? (
                                <img src={c2.ImgURL} alt={c2.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingEnergyActivated(null); setSelectedEnergyActivatedCost(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeEnergyActivated(pendingEnergyActivated.cardNum, eff, selectedEnergyActivatedCost)}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : '#4caf50',
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      アクセ発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== シグニ出現時コスト付き【出】効果 モーダル ===== */}
      {pendingSigniOnPlayCost && createPortal(
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const card = battleCardMap.get(pendingSigniOnPlayCost.cardNum);
              const eff  = pendingSigniOnPlayCost.costEffect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const discardNeeded = eff.cost?.discard ?? 0;
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedSigniOnPlayCost].map(i => my.energy[i]);
              const energyOk = energyTotal === 0
                ? true
                : selectedSigniOnPlayCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
              const canAfford = energyOk && selectedSigniOnPlayDiscard.size >= discardNeeded;
              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    【出】効果を発動しますか？
                  </p>
                  {card && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={card.ImgURL} alt={card.CardName}
                        onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(card.ImgURL); }, 500); }}
                        onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                        onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                        onContextMenu={e => e.preventDefault()}
                        draggable={false}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0, cursor: 'pointer' }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{card.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            energyTotal > 0 ? costStr : null,
                            discardNeeded > 0 ? `手札${discardNeeded}枚` : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                      </div>
                    </div>
                  )}
                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedSigniOnPlayCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniOnPlayCost.has(i);
                          const isWild = isMultiEna(num, battleCards, my.keyword_grants, myEnaAllMulti);
                          return (
                            <div key={i}
                              onClick={() => setSelectedSigniOnPlayCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : isWild ? '1px solid #ffcc00' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isWild && !isSel && (
                                <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0,
                                  backgroundColor: 'rgba(255,204,0,0.85)', textAlign: 'center' }}>
                                  <span style={{ fontSize: 7, fontWeight: 'bold', color: '#000' }}>マルチ</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  {discardNeeded > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        手札から捨てるカードを選択: {selectedSigniOnPlayDiscard.size} / {discardNeeded}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {pendingSigniOnPlayCost.placedState.hand.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedSigniOnPlayDiscard.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedSigniOnPlayDiscard(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= discardNeeded) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #ff9800' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(255,152,0,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => skipSigniOnPlayCost(pendingSigniOnPlayCost.placedState, pendingSigniOnPlayCost.mandatoryEntries)}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      スキップ
                    </button>
                    <button
                      onClick={() => executeSigniOnPlayCost(
                        pendingSigniOnPlayCost.cardNum,
                        pendingSigniOnPlayCost.costEffect,
                        selectedSigniOnPlayCost,
                        selectedSigniOnPlayDiscard,
                        pendingSigniOnPlayCost.placedState,
                        pendingSigniOnPlayCost.mandatoryEntries,
                      )}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== ルリグ付与能力（GRANT_LRIG_ABILITY）発動モーダル ===== */}
      {pendingLrigGranted && createPortal(
        <div
          onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); }}
          style={{ position: 'fixed', inset: 0, zIndex: 4000,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div
            onClick={e => e.stopPropagation()}
            style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
              padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
              display: 'flex', flexDirection: 'column', gap: 12 }}>
            {(() => {
              const eff = pendingLrigGranted.effect;
              const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
              const exceedCost = eff.cost?.exceed ?? 0;
              const costStr = (eff.cost?.energy ?? []).map(e => `《${e.color}》×${e.count}`).join('') || '';
              const selectedNums = [...selectedLrigGrantedCost].map(i => my.energy[i]);
              const canAffordEnergy = energyTotal === 0
                ? true
                : selectedLrigGrantedCost.size === energyTotal &&
                  canAffordGrowCost(selectedNums, battleCards, costStr, my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs);
              const totalExceedAvail = (my.field.lrig.length - 1)
                + Math.max(0, (my.field.assist_lrig_l ?? []).length - 1)
                + Math.max(0, (my.field.assist_lrig_r ?? []).length - 1);
              const canAffordExceed = exceedCost === 0 || totalExceedAvail >= exceedCost;
              const canAfford = canAffordEnergy && canAffordExceed;
              const lrigTop = my.field.lrig.at(-1);
              const lrigCard = battleCardMap.get(lrigTop ?? '');

              return (
                <>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    ルリグ付与【起】効果を発動
                  </p>
                  {lrigCard && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                      <img src={lrigCard.ImgURL} alt={lrigCard.CardName}
                        style={{ width: 52, height: 72, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }} />
                      <div>
                        <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 4px' }}>{lrigCard.CardName}</p>
                        <p style={{ color: C.textFaint, fontSize: 11, margin: 0 }}>
                          コスト: {[
                            exceedCost > 0 ? `エクシード${exceedCost}` : null,
                            energyTotal > 0 ? costStr : null,
                          ].filter(Boolean).join('・') || 'なし'}
                        </p>
                        {exceedCost > 0 && !canAffordExceed && (
                          <p style={{ color: C.danger, fontSize: 11, margin: '4px 0 0' }}>
                            ルリグスタックが不足しています
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {energyTotal > 0 && (
                    <>
                      <p style={{ color: C.text, fontSize: 12, margin: 0 }}>
                        エナゾーンから選択: {selectedLrigGrantedCost.size} / {energyTotal}枚
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, overflowY: 'auto', maxHeight: 180 }}>
                        {my.energy.map((num, i) => {
                          const c = battleCardMap.get(num);
                          const isSel = selectedLrigGrantedCost.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedLrigGrantedCost(prev => {
                                const next = new Set(prev);
                                if (next.has(i)) { next.delete(i); return next; }
                                if (next.size >= energyTotal) return prev;
                                next.add(i); return next;
                              })}
                              onPointerDown={() => { pickLongPressTimer.current = setTimeout(() => { setExpandedPickImgUrl(c?.ImgURL ?? null); }, 500); }}
                              onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                              onContextMenu={e => e.preventDefault()}
                              style={{ position: 'relative', width: 44, height: 62, borderRadius: 3, flexShrink: 0,
                                border: isSel ? '2px solid #f44336' : C.borderCard,
                                cursor: 'pointer', overflow: 'hidden' }}>
                              {c ? (
                                <img src={c.ImgURL} alt={c.CardName} draggable={false}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                              ) : (
                                <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ fontSize: 7, color: C.textFaint }}>{num}</span>
                                </div>
                              )}
                              {isSel && (
                                <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <span style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>✓</span>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}

                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      onClick={() => { setPendingLrigGranted(null); setSelectedLrigGrantedCost(new Set()); }}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      キャンセル
                    </button>
                    <button
                      onClick={() => executeLrigGranted(eff, selectedLrigGrantedCost)}
                      disabled={loading || !canAfford}
                      style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                        backgroundColor: (loading || !canAfford) ? C.disabled : C.success,
                        color: C.text, fontSize: 14, fontWeight: 'bold',
                        cursor: (loading || !canAfford) ? 'default' : 'pointer' }}>
                      発動
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </div>,
        document.body,
      )}

      {/* ===== 効果スタック 整列モーダル ===== */}
      {(() => {
        if (!bs.effect_stack || !user) return null;
        const stack = bs.effect_stack;
        const isTurnPlayer = bs.active_user_id === user.id;
        const myPending = isTurnPlayer ? stack.pendingTurn : stack.pendingOpp;
        const needOrder = isTurnPlayer ? !stack.orderTurnDone : !stack.orderOppDone;
        if (!needOrder || myPending.length <= 1) return null;

        const ordered = stackOrderIds
          .map(id => myPending.find(e => e.id === id))
          .filter((e): e is NonNullable<typeof e> => !!e);

        const moveUp = (idx: number) => {
          if (idx === 0) return;
          const next = [...stackOrderIds];
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          setStackOrderIds(next);
        };
        const moveDown = (idx: number) => {
          if (idx >= stackOrderIds.length - 1) return;
          const next = [...stackOrderIds];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          setStackOrderIds(next);
        };

        return createPortal(
          <div style={{ position: 'fixed', inset: 0, zIndex: 4100,
            backgroundColor: 'rgba(0,0,0,0.92)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <div onClick={e => e.stopPropagation()}
              style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                padding: '20px 16px', width: 'min(95vw, 420px)',
                display: 'flex', flexDirection: 'column', gap: 12 }}>
              <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                効果の発動順序を決めてください
              </p>
              <p style={{ color: C.text, fontSize: 12, margin: 0, textAlign: 'center' }}>
                ↑↓ ボタンで順序を変更し「確定」を押してください
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {ordered.map((entry, idx) => {
                  const card = battleCardMap.get(entry.cardNum);
                  return (
                    <div key={entry.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 8, padding: '6px 10px' }}>
                      <span style={{ color: C.textFaint, fontSize: 12, minWidth: 20, textAlign: 'center' }}>
                        {idx + 1}
                      </span>
                      {card && (
                        <img src={card.ImgURL} alt={card.CardName} draggable={false}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />
                      )}
                      <span style={{ color: C.text, fontSize: 12, flex: 1 }}>{entry.label}</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <button onClick={() => moveUp(idx)} disabled={idx === 0 || loading}
                          style={{ padding: '2px 8px', borderRadius: 4, border: 'none',
                            backgroundColor: idx === 0 ? C.disabled : C.bgButton,
                            color: C.text, cursor: idx === 0 ? 'default' : 'pointer', fontSize: 12 }}>
                          ↑
                        </button>
                        <button onClick={() => moveDown(idx)} disabled={idx >= ordered.length - 1 || loading}
                          style={{ padding: '2px 8px', borderRadius: 4, border: 'none',
                            backgroundColor: idx >= ordered.length - 1 ? C.disabled : C.bgButton,
                            color: C.text, cursor: idx >= ordered.length - 1 ? 'default' : 'pointer', fontSize: 12 }}>
                          ↓
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <button
                onClick={() => handleConfirmStackOrder(stackOrderIds)}
                disabled={loading}
                style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                  backgroundColor: loading ? C.disabled : C.success,
                  color: C.text, fontSize: 14, fontWeight: 'bold',
                  cursor: loading ? 'default' : 'pointer' }}>
                発動順序を確定
              </button>
            </div>
          </div>,
          document.body,
        );
      })()}

      {/* ===== 効果インタラクション モーダル ===== */}
      {(bs.pending_effect?.respondPlayerId ?? bs.pending_effect?.sourcePlayerId) === user.id && (() => {
        const pe = bs.pending_effect!;
        const inter = pe.interaction;
        const srcCard = battleCardMap.get(pe.sourceCardNum);

        // SELECT_TARGET / SEARCH 共通：カード選択ピッカー
        if (inter.type === 'SELECT_TARGET' || inter.type === 'SEARCH') {
          const candidates = inter.type === 'SELECT_TARGET' ? inter.candidates : inter.visibleCards;
          const maxPick = inter.type === 'SELECT_TARGET' ? inter.count : inter.maxPick;

          // 選択UIの説明文を生成（何のためにどこから選ぶか）
          const label = (() => {
            if (inter.type === 'SEARCH') {
              const act = inter.thenAction;
              const actionDesc =
                act.type === 'ADD_TO_HAND'    ? '手札に加えるカードを' :
                act.type === 'ADD_TO_FIELD'   ? '場に出すカードを' :
                act.type === 'ENERGY_CHARGE'  ? 'エナに置くカードを' :
                act.type === 'ADD_TO_LIFE'    ? 'ライフに加えるカードを' :
                act.type === 'TRASH'          ? 'トラッシュに置くカードを' :
                'デッキから';
              return `${actionDesc}${maxPick}枚まで選んでください`;
            }
            // SELECT_TARGET
            const scopeDesc: Record<string, string> = {
              self_hand:   '手札から',
              opp_hand:    '相手の手札から',
              self_field:  '自分のシグニゾーンから',
              opp_field:   '相手のシグニゾーンから',
              self_energy: 'エナから',
              opp_energy:  '相手のエナから',
              self_trash:  'トラッシュから',
              opp_trash:   '相手のトラッシュから',
            };
            const from = scopeDesc[inter.targetScope] ?? '';
            const act = inter.thenAction;
            const actionDesc =
              act.type === 'BANISH'         ? 'バニッシュする' :
              act.type === 'BOUNCE'         ? '手札に戻す' :
              act.type === 'TRASH'          ? 'トラッシュに置く' :
              act.type === 'ADD_TO_HAND'    ? '手札に加える' :
              act.type === 'ENERGY_CHARGE'  ? 'エナに置く' :
              act.type === 'ADD_TO_FIELD'   ? '場に出す' :
              act.type === 'POWER_MODIFY'   ? (() => { const d = (act as import('../types/effects').PowerModifyAction).delta; const n = typeof d === 'number' ? d : 0; return `パワーを${n > 0 ? '+' : ''}${n}する`; })() :
              act.type === 'DOWN'           ? 'ダウンする' :
              act.type === 'FREEZE'         ? '凍結する' :
              act.type === 'DRAW'           ? '引く' :
              act.type === 'ADD_TO_LIFE'    ? 'ライフに加える' :
              act.type === 'BANISH_SUBSTITUTE' ? 'バニッシュ代わりの' :
              act.type === 'REVEAL'         ? '公開する' :
              act.type === 'TRANSFER_TO_DECK' ? 'デッキに加える' :
              act.type === 'BLOOD_CRYSTAL_ARMOR' ? '血晶武装する' :
              '';
            const countStr = maxPick === 1 ? '' : `${maxPick}枚`;
            return `${from}${actionDesc}カードを${countStr}選んでください`;
          })();
          const canConfirm = inter.type === 'SELECT_TARGET'
            ? (inter.optional || effectSelectedNums.length >= maxPick)
            : effectSelectedNums.length <= maxPick;

          // フィールド対象の場合: 候補のゾーンインデックス（0→2）を再構築
          // candidates は zone 0→1→2 の順なので、フィールドを同順で走査してマッピングする
          const fieldZoneInfo: number[] = (() => {
            if (inter.type !== 'SELECT_TARGET') return [];
            const scope = inter.targetScope;
            if (scope !== 'opp_field' && scope !== 'self_field') return [];
            const fieldState = scope === 'opp_field' ? op : my;
            const result: number[] = [];
            let ci = 0;
            for (let zi = 0; zi < 3 && ci < candidates.length; zi++) {
              const topNum = fieldState.field.signi[zi]?.at(-1);
              if (!topNum) continue;
              if (candidates[ci] === topNum) { result.push(zi); ci++; }
            }
            return result;
          })();

          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 400px)', maxHeight: '85vh',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: 0, textAlign: 'center',
                  padding: '6px 8px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 6 }}>
                  {label}
                </p>
                <div style={{ overflowY: 'auto', display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
                  {candidates.map((rawId, idx) => {
                    // インスタンスID（CardNum#N）からCardNumを取り出して表示用データを取得
                    const cardNum = getCardNum(rawId);
                    const c = battleCardMap.get(cardNum);
                    // インデックス文字列で管理 → 同名カードでも個別に選択できる
                    const idxStr = String(idx);
                    const isSel = effectSelectedNums.includes(idxStr);
                    // フィールド対象の場合のゾーン番号（candidates[idx] = zone idx が対応）
                    const zoneIdx = fieldZoneInfo[idx];
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                        <div
                          onPointerDown={() => {
                            pickLongPressTimer.current = setTimeout(() => {
                              setExpandedPickImgUrl(c?.ImgURL ?? null);
                            }, 500);
                          }}
                          onPointerUp={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onPointerLeave={() => { if (pickLongPressTimer.current) { clearTimeout(pickLongPressTimer.current); pickLongPressTimer.current = null; } }}
                          onContextMenu={e => e.preventDefault()}
                          onClick={() => {
                            setEffectSelectedNums(prev => {
                              if (prev.includes(idxStr)) {
                                return prev.filter(x => x !== idxStr);
                              }
                              if (prev.length >= maxPick) return prev;
                              return [...prev, idxStr];
                            });
                          }}
                          style={{ position: 'relative', width: 60, height: 84, borderRadius: 4,
                            border: isSel ? '2px solid #f44336' : C.borderCard,
                            cursor: 'pointer', overflow: 'hidden', flexShrink: 0 }}>
                          {c ? (
                            <img src={c.ImgURL} alt={c.CardName} draggable={false}
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', backgroundColor: C.bgButton,
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ fontSize: 8, color: C.textFaint }}>{cardNum}</span>
                            </div>
                          )}
                          {isSel && (
                            <div style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(244,67,54,0.4)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <span style={{ color: '#fff', fontSize: 20, fontWeight: 'bold' }}>✓</span>
                            </div>
                          )}
                        </div>
                        {zoneIdx !== undefined && (
                          <span style={{ fontSize: 9, color: '#9abcbc', lineHeight: 1 }}>
                            ゾーン{zoneIdx + 1}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  {inter.type === 'SELECT_TARGET' && inter.optional && (
                    <button onClick={() => handleEffectInteraction([])}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      スキップ
                    </button>
                  )}
                  {inter.type === 'SEARCH' && (
                    <button onClick={() => handleEffectInteraction([])}
                      disabled={loading}
                      style={{ flex: 1, padding: '10px 0', borderRadius: 8, border: C.borderUI,
                        backgroundColor: 'transparent', color: C.textSub, fontSize: 13, cursor: 'pointer' }}>
                      該当なし
                    </button>
                  )}
                  <button onClick={() => {
                    // インデックス文字列 → CardNum に変換してから渡す
                    const selectedNums = effectSelectedNums.map(i => candidates[parseInt(i, 10)] ?? i);
                    handleEffectInteraction(selectedNums);
                  }}
                    disabled={loading || !canConfirm}
                    style={{ flex: 2, padding: '10px 0', borderRadius: 8, border: 'none',
                      backgroundColor: canConfirm ? C.success : C.disabled,
                      color: C.text, fontSize: 14, fontWeight: 'bold',
                      cursor: (loading || !canConfirm) ? 'default' : 'pointer' }}>
                    決定 ({effectSelectedNums.length}/{maxPick})
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        // CHOOSE：選択肢ボタン（任意コスト付きの場合はエナ選択UIを統合）
        if (inter.type === 'CHOOSE') {
          const payOpt = inter.options.find(o => o.id === 'pay' && o.costColors?.length);
          const skipOpt = inter.options.find(o => o.id === 'skip');
          const isOptionalCost = !!payOpt;

          if (isOptionalCost) {
            // 任意コスト: エナ選択 + 発動/スキップボタン
            const costColors = payOpt!.costColors!;
            const totalReq = costColors.length;
            const selectedNums = [...selectedOptCost].map(i => my.energy[i]);
            const colorValid = (() => {
              const needed = [...costColors];
              for (const n of selectedNums) {
                const color = battleCardMap.get(n)?.Color ?? '無';
                const idx = needed.findIndex(c => c === color || c === '無');
                if (idx === -1) return false;
                needed.splice(idx, 1);
              }
              return needed.length === 0;
            })();
            const canConfirm = selectedOptCost.size === totalReq && colorValid;

            return createPortal(
              <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
                backgroundColor: 'rgba(0,0,0,0.92)',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                <div onClick={e => e.stopPropagation()}
                  style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                    padding: '16px', width: 'min(94vw, 380px)', maxHeight: '80vh',
                    display: 'flex', flexDirection: 'column', gap: 10, overflowY: 'auto' }}>
                  <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                    {srcCard?.CardName ?? pe.sourceCardNum}の効果
                  </p>
                  <p style={{ color: C.text, fontSize: 12, margin: 0, textAlign: 'center' }}>
                    コスト: {costColors.map(c => `《${c}》`).join('')} を支払いますか？
                  </p>
                  <p style={{ color: canConfirm ? C.success : C.textMuted, fontSize: 11, margin: 0, textAlign: 'center' }}>
                    エナから選択: {selectedOptCost.size} / {totalReq}枚
                    {costColors.map((c, i) => <span key={i} style={{ marginLeft: 4, color: C.textDim }}>({c})</span>)}
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                    {my.energy.length === 0
                      ? <p style={{ color: C.textFaint, fontSize: 12 }}>エナがありません</p>
                      : my.energy.map((num, i) => {
                          const card = battleCardMap.get(num);
                          const isSel = selectedOptCost.has(i);
                          return (
                            <div key={i}
                              onClick={() => setSelectedOptCost(prev => {
                                const next = new Set(prev);
                                isSel ? next.delete(i) : next.add(i);
                                return next;
                              })}
                              style={{ width: 52, cursor: 'pointer', borderRadius: 4, overflow: 'hidden',
                                border: isSel ? `2px solid ${C.success}` : '2px solid transparent',
                                opacity: isSel ? 1 : 0.75 }}>
                              <img src={card?.ImgURL ?? '/ErrerCard.webp'} alt={card?.CardName ?? num}
                                style={{ width: '100%', aspectRatio: '3/4', objectFit: 'cover', display: 'block' }}
                                onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                              <div style={{ backgroundColor: 'rgba(0,0,0,0.6)', textAlign: 'center', padding: '1px 2px' }}>
                                <span style={{ fontSize: 9, color: '#fff' }}>{card?.Color ?? '?'}</span>
                              </div>
                            </div>
                          );
                        })
                    }
                  </div>
                  <button
                    disabled={loading || !canConfirm || !payOpt.available}
                    onClick={() => { handleEffectInteraction(['pay', ...selectedNums]); setSelectedOptCost(new Set()); }}
                    style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                      backgroundColor: (canConfirm && payOpt.available) ? C.success : C.disabled,
                      color: C.text, fontSize: 13, fontWeight: 'bold',
                      cursor: (canConfirm && payOpt.available && !loading) ? 'pointer' : 'default' }}>
                    {payOpt.label}
                  </button>
                  <button
                    disabled={loading}
                    onClick={() => { handleEffectInteraction([skipOpt?.id ?? 'skip']); setSelectedOptCost(new Set()); }}
                    style={{ padding: '10px 0', borderRadius: 8, border: C.borderUI,
                      backgroundColor: 'transparent', color: C.textDim, fontSize: 13,
                      cursor: loading ? 'default' : 'pointer' }}>
                    {skipOpt?.label ?? 'スキップ'}
                  </button>
                </div>
              </div>,
              document.body,
            );
          }

          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(92vw, 360px)',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>効果を選択してください</p>
                {inter.options.map(opt => (
                  <button key={opt.id}
                    disabled={loading || !opt.available}
                    onClick={() => handleEffectInteraction([opt.id])}
                    style={{ padding: '12px 0', borderRadius: 8, border: 'none',
                      backgroundColor: opt.available ? C.success : C.disabled,
                      color: C.text, fontSize: 13, fontWeight: 'bold',
                      cursor: (!opt.available || loading) ? 'default' : 'pointer' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          );
        }

        // LOOK_AND_REORDER：デッキトップのカードを見て並べ替え
        if (inter.type === 'LOOK_AND_REORDER') {
          const moveCard = (idx: number, dir: -1 | 1) => {
            const newOrder = [...lookReorderOrder];
            const swapIdx = idx + dir;
            if (swapIdx < 0 || swapIdx >= newOrder.length) return;
            [newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]];
            setLookReorderOrder(newOrder);
          };
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 400px)',
                  display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <p style={{ color: C.text, fontSize: 13, margin: 0, textAlign: 'center' }}>
                  {inter.destPosition === 'first_top_rest_bottom'
                    ? '1枚目をデッキトップへ戻し、残りはデッキ下へ（上が優先）'
                    : 'カードを見て並べ替えてください（上がデッキトップ）'}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {lookReorderOrder.map((cardNum, i) => {
                    const c = battleCardMap.get(cardNum);
                    return (
                      <div key={cardNum} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 6, padding: '6px 8px' }}>
                        <span style={{ color: C.textDim, fontSize: 11, width: 16 }}>{i + 1}</span>
                        <img src={c?.ImgURL} alt={c?.CardName} draggable={false}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                          onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <span style={{ color: C.textSub, fontSize: 12, flex: 1 }}>{c?.CardName ?? cardNum}</span>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <button onClick={() => moveCard(i, -1)} disabled={i === 0}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: 'transparent',
                              color: i === 0 ? C.textDim : C.text, cursor: i === 0 ? 'default' : 'pointer' }}>↑</button>
                          <button onClick={() => moveCard(i, 1)} disabled={i === lookReorderOrder.length - 1}
                            style={{ padding: '2px 8px', fontSize: 11, borderRadius: 4,
                              border: C.borderUI, backgroundColor: 'transparent',
                              color: i === lookReorderOrder.length - 1 ? C.textDim : C.text,
                              cursor: i === lookReorderOrder.length - 1 ? 'default' : 'pointer' }}>↓</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <button onClick={() => { handleEffectInteraction(lookReorderOrder); setLookReorderOrder([]); }}
                  disabled={loading}
                  style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                    backgroundColor: loading ? C.disabled : C.success,
                    color: C.text, fontSize: 14, fontWeight: 'bold',
                    cursor: loading ? 'default' : 'pointer' }}>
                  決定
                </button>
              </div>
            </div>,
            document.body,
          );
        }

        // SELECT_ZONE：効果によるデッキトップのカードのゾーン選択
        if (inter.type === 'SELECT_ZONE') {
          const placeCard = battleCardMap.get(inter.cardNum);
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 4000,
              backgroundColor: 'rgba(0,0,0,0.92)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div onClick={e => e.stopPropagation()}
                style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                  padding: '20px 16px', width: 'min(95vw, 380px)',
                  display: 'flex', flexDirection: 'column', gap: 14 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                  <img src={placeCard?.ImgURL} alt={placeCard?.CardName}
                    style={{ width: 60, height: 84, objectFit: 'cover', borderRadius: 6 }}
                    onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                  <p style={{ color: C.text, fontSize: 13, margin: 0 }}>
                    {placeCard?.CardName ?? inter.cardNum}
                  </p>
                </div>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  場に出すゾーンを選択してください
                </p>
                <div style={{ display: 'flex', gap: 8 }}>
                  {([0, 1, 2] as const).map(zi => {
                    const isOccupied = (my.field.signi[zi] ?? []).length > 0;
                    return (
                      <button key={zi}
                        onClick={() => !isOccupied && !loading && handleSelectZoneForEffect(zi)}
                        disabled={isOccupied || loading}
                        style={{ flex: 1, padding: '12px 0', borderRadius: 8,
                          border: isOccupied ? `1px solid ${C.textFaint}` : C.borderUI,
                          backgroundColor: isOccupied ? C.disabled : C.bgButton,
                          color: isOccupied ? C.textFaint : C.text,
                          fontSize: 13, cursor: isOccupied || loading ? 'default' : 'pointer' }}>
                        ゾーン{zi + 1}{isOccupied ? '\n(使用中)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          );
        }

        return null;
      })()}

      {/* ===== 相手のLOOK_AND_REORDER 観戦表示（公開する=両者表示 / 見る=待機のみ） ===== */}
      {bs.pending_effect &&
       (bs.pending_effect.respondPlayerId ?? bs.pending_effect.sourcePlayerId) !== user.id &&
       bs.pending_effect.interaction.type === 'LOOK_AND_REORDER' && (() => {
        const inter = bs.pending_effect.interaction;
        const pe = bs.pending_effect;
        const srcCard = battleCardMap.get(pe.sourceCardNum);
        if (!inter.private) {
          // 公開する：相手にもカードを表示（非インタラクティブ）
          return createPortal(
            <div style={{ position: 'fixed', inset: 0, zIndex: 3999,
              backgroundColor: 'rgba(0,0,0,0.80)',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
              <div style={{ backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
                padding: '20px 16px', width: 'min(95vw, 380px)',
                display: 'flex', flexDirection: 'column', gap: 12 }}>
                <p style={{ color: C.textSub, fontSize: 14, fontWeight: 'bold', margin: 0, textAlign: 'center' }}>
                  {srcCard?.CardName ?? pe.sourceCardNum}の効果（公開）
                </p>
                <p style={{ color: C.textDim, fontSize: 12, margin: 0, textAlign: 'center' }}>
                  相手がカードを確認・並べ替え中...
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {inter.cards.map((cardNum, i) => {
                    const c = battleCardMap.get(cardNum);
                    return (
                      <div key={cardNum} style={{ display: 'flex', alignItems: 'center', gap: 8,
                        backgroundColor: C.bgButton, borderRadius: 6, padding: '6px 8px' }}>
                        <span style={{ color: C.textDim, fontSize: 11, width: 16 }}>{i + 1}</span>
                        <img src={c?.ImgURL} alt={c?.CardName} draggable={false}
                          style={{ width: 36, height: 50, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }}
                          onError={e2 => { const img = e2.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                        <span style={{ color: C.textSub, fontSize: 12, flex: 1 }}>{c?.CardName ?? cardNum}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>,
            document.body,
          );
        }
        // 見る：カードは非表示、待機メッセージのみ
        return createPortal(
          <div style={{ position: 'fixed', bottom: 80, left: '50%', transform: 'translateX(-50%)',
            zIndex: 3999, backgroundColor: 'rgba(0,0,0,0.75)', borderRadius: 8,
            padding: '8px 20px', pointerEvents: 'none' }}>
            <p style={{ color: C.textDim, fontSize: 13, margin: 0 }}>
              相手がデッキを確認しています...
            </p>
          </div>,
          document.body,
        );
      })()}

      {/* ===== 長押し拡大オーバーレイ（全モーダル共通） ===== */}
      {expandedPickImgUrl && createPortal(
        <div
          onPointerDown={() => setExpandedPickImgUrl(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 9000,
            backgroundColor: 'rgba(0,0,0,0.85)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer' }}>
          <img src={expandedPickImgUrl} alt=""
            draggable={false}
            style={{ maxWidth: '85vw', maxHeight: '80vh', borderRadius: 8, objectFit: 'contain' }} />
        </div>,
        document.body,
      )}

      {/* 終了ボタン（常に最前面に固定 — エラーで画面が固まっても操作できる） */}
      {createPortal(
        <div style={{ position: 'fixed', top: 6, right: 8, zIndex: 9998, display: 'flex', gap: 6 }}>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '4px 10px', borderRadius: 4,
              border: '1px solid #444', backgroundColor: 'rgba(0,0,0,0.55)',
              color: '#666', cursor: 'pointer', fontSize: 11,
              backdropFilter: 'blur(4px)',
            }}
          >
            ↺
          </button>
          <button
            onClick={() => setShowEndConfirm(true)}
            style={{
              padding: '4px 10px', borderRadius: 4,
              border: '1px solid #444', backgroundColor: 'rgba(0,0,0,0.55)',
              color: '#666', cursor: 'pointer', fontSize: 11,
              backdropFilter: 'blur(4px)',
            }}
          >
            終了
          </button>
        </div>,
        document.body,
      )}

    </div>
  );
}

