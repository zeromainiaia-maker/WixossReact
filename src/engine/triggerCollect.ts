/**
 * triggerCollect.ts — C1 配線のトリガー収集（pure 関数・Stage2 抽出）
 *
 * BattleScreen.tsx の React クロージャだった collect*Triggers を、依存を ctx で注入する
 * pure 関数として抽出した。これにより golden/fuzz から呼んで C1 配線（ON_TARGETED 発火等）を
 * ヘッドレス自動検証できる（＝実機検証(C2)の宿題を削減）。BattleScreen 側は本関数を呼ぶ薄いラッパに置換。
 *
 * 対象 timing: ON_TARGETED / ON_LRIG_GROW / ON_COIN_PAID（いずれも C1・2026-06-29 配線）
 *           / ON_SIGNI_POWER_ZERO_OR_LESS（R37・Stage2第2弾）/ ON_BLOOD_CRYSTAL_ARMOR（Stage2第3弾）。
 */
import type { PlayerState, CardData, StackEntry, TurnPhase } from '../types';
import type { CardEffect, Condition, GrantAcceHostAbilityAction, TargetFilter, PowerModifyAction, AddToFieldAction, StubAction, Owner, TriggerOriginZone } from '../types/effects';
import { evalUseCondition, matchesFilter, getCardNum } from './execUtils';
import { normalizeKeywordName } from '../utils/keywords';
import { activeKeyAbilitySources, checkActiveCondition, collectContinuousAbilitiesRemovedSigni, isCrossZoneActive, isKizunaActive, isSigniOnPlaySuppressedByContinuous, matchesStateFilter } from './effectEngine';
import { acceCardsAt } from '../utils/acce';
import { grantedStoreWatchers } from './grantedStore';

export interface TargetedOrigin {
  cardNum: string;
  effect: CardEffect;
}

/** ON_SPELL_USE の属性限定を、使用スペルそのものへ適用する共通ゲート。 */
export function spellUseTriggerMatches(effect: CardEffect, usedSpell: CardData | undefined): boolean {
  return !effect.triggerFilter || matchesFilter(usedSpell, effect.triggerFilter);
}

const TARGET_ZONE_STATE_KEYS = ['hasCharm', 'hasAcce', 'infected', 'isDown', 'isFrozen', 'isAwakened', 'isUp', 'isArmored', 'inGateZone', 'centerZoneOnly', 'zoneSide'] as const;

/** トリガー収集の依存（BattleScreen の bs/effectsMap/battleCardMap 等を注入）。 */
export interface TrigCtx {
  hostId: string;
  guestId: string;
  /** 視点プレイヤー（ローカル操作者）の userId。collectBanishTriggers の my/op 分岐で使用。省略時は hostId 視点。 */
  meId?: string;
  activeUserId: string | null;
  turnPhase: string;
  effectsMap: Map<string, CardEffect[]>;
  cardMap: Map<string, CardData>;
  effectivePowers?: Map<string, number>;
  genId: () => string;
}

/**
 * ON_OPP_LIFE_CRASHED の発火源限定を、headless collector と BattleScreen の実機経路で共有する。
 *
 * - `self` + `triggerFilter.thisCardOnly`：クラッシュ源 instance が watcher 自身である場合だけ。
 * - `any_ally`：クラッシュ源カードへ triggerFilter を適用する。
 * - 上記マーカーなし：受動形や既存の別用途 `self` の挙動を維持する。
 *
 * crashSourceCardNum が無い旧状態は従来どおり通す。通常の check-zone funnel は source を保持しており、
 * 今回の限定は source がある実イベントで fail-closed になる。
 */
/**
 * 🆕§5.3 `O-120`：クラッシュの**原因キーワード**限定（「【ランサー】によって…クラッシュしたとき」）。
 *
 * 🔴**fail-closed**＝`crashedByKeywords` を持つ効果は、原因が不明（`crashCause` 未設定）なら**発火しない**。
 * 旧実装はこの条件そのものが無く、**通常のバトルダメージのクラッシュでも発火していた**（実測3効果）。
 * ⚠原因を刻むのは `BattleScreen.crashOneLife` の1本だけなので、**そこを通らない経路は必ず未設定**になる。
 *   ここで `true` へ倒すと元の過剰実行に戻るので、**倒す向きを間違えないこと**。
 */
export function crashCauseMatches(effect: CardEffect, crashCause: string | undefined): boolean {
  const want = effect.triggerCondition?.crashedByKeywords;
  if (!want || want.length === 0) return true;
  if (!crashCause) return false;
  // ⚠**原文は全角【Ｓランサー】・engine コードは半角 `'Sランサー'`** という既知の綴りズレがある
  //   （`utils/keywords.ts` 冒頭＝これで live 27効果が無言 no-op になった前例）。両端を正規化して照合する。
  const cause = normalizeKeywordName(crashCause);
  return want.some(k => normalizeKeywordName(k) === cause);
}

export function oppLifeCrashSourceMatches(
  effect: CardEffect,
  watcherNum: string,
  crashSourceCardNum: string | undefined,
  cardMap: Map<string, CardData>,
): boolean {
  if (!crashSourceCardNum) return true;
  if (effect.triggerScope === 'self' && effect.triggerFilter?.thisCardOnly) return crashSourceCardNum === watcherNum;
  if (effect.triggerScope !== 'any_ally') return true;
  if (effect.triggerFilter?.excludeSelf && crashSourceCardNum === watcherNum) return false;
  return matchesFilter(cardMap.get(getCardNum(crashSourceCardNum)), effect.triggerFilter);
}

const effsOf = (ctx: TrigCtx, n: string): CardEffect[] =>
  ctx.effectsMap.get(n) ?? ctx.effectsMap.get(getCardNum(n)) ?? [];

/** triggerCondition の原因主体限定を、能力の持ち主（controllerId）視点で評価する。 */
const effectCauseMatches = (eff: CardEffect, controllerId: string, causeOwnerId?: string): boolean => {
  if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== controllerId) return false;
  if (eff.triggerCondition?.byOpponentEffect && (!causeOwnerId || causeOwnerId === controllerId)) return false;
  if (eff.triggerCondition?.byEffect && !causeOwnerId) return false;
  return true;
};

/** バトルで相手シグニをバニッシュした側に対する watcher の scope/filter/使用回数判定。 */
export function battleBanisherMatchesTrigger(
  effect: CardEffect,
  watcherNum: string,
  banisherNum: string,
  banisherCard: CardData | undefined,
  effectivePower: number | undefined,
  actionsDone: readonly string[] = [],
  pendingUsedIds: readonly string[] = [],
): boolean {
  const scope = effect.triggerScope ?? 'self';
  if (scope === 'self' && watcherNum !== banisherNum) return false;
  if (scope !== 'self') {
    if (effect.triggerFilter?.excludeSelf && watcherNum === banisherNum) return false;
    if (effect.triggerFilter && !matchesFilter(banisherCard, effect.triggerFilter, effectivePower)) return false;
  }
  return effect.usageLimit !== 'once_per_turn'
    || (!actionsDone.includes(effect.effectId) && !pendingUsedIds.includes(effect.effectId));
}

/**
 * INSTALL_DELAYED_TRIGGER（B3）: バニッシュした側のプレイヤーに設置された ON_SIGNI_BANISH_BATTLE watcher
 * （タスク12(lxi) 第7波・`WX24-P4-011-E3`「このターン、あなたのシグニがバトルによってシグニ１体を
 * バニッシュしたとき、…」）。従来 `delayed_triggers` を見ていたのは ON_LEAVE_FIELD／ON_REFRESH／
 * フェイズ系の3経路だけで、バトルバニッシュ経路は場のシグニ効果しか収集していなかった。
 *
 * ⚠**バニッシュした側の state だけを見る**＝「**あなたの**シグニがバトルによって」の主語限定。
 *   呼び出し側（BattleScreen のバトル解決）はアタッカー側でのみ被バニッシュを確定させるため、
 *   既存の場シグニ収集（battleBanisherMatchesTrigger 側）と同じ射程になる。
 */
export function collectBattleBanishDelayedTriggers(
  ctx: TrigCtx,
  banisherId: string,
  banisherState: PlayerState,
  banisherCardNum?: string,
  delayedTriggers = banisherState.delayed_triggers ?? [],
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const dt of delayedTriggers) {
    if (dt.trigger?.timing !== 'ON_SIGNI_BANISH_BATTLE') continue;
    // 🆕バニッシュした側のカード条件（2026-08-31 続き748・「あなたの**＜龍獣＞の**シグニが〜」）。
    if (dt.trigger.banisherFilter
      && !matchesFilter(ctx.cardMap.get(getCardNum(banisherCardNum ?? '')), dt.trigger.banisherFilter)) continue;
    entries.push({
      id: ctx.genId(), playerId: banisherId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: `${dt.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズ' : 'このターン'}の遅延トリガー（バトルバニッシュ時）`,
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_SIGNI_BANISH_BATTLE'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
      triggeringCardNum: banisherCardNum,
    });
  }
  return entries;
}

/**
 * INSTALL_DELAYED_TRIGGER（B3）: **防御側**プレイヤーに設置された ON_ATTACK_SIGNI watcher
 * （タスク12(lxi) 第8波・`WXK05-009-E2`「このターン、対戦相手のシグニがアタックしたとき、…」）。
 * 設置者から見た `attackerOwner` で弁別する（本収集地点はアタッカー＝設置者の対戦相手なので
 * `'self'` 指定の watcher はここでは発火しない）。`triggeringCardNum` にアタッカーを載せて
 * 帰結の「そのシグニ」（`targetsTriggerSource`）が解けるようにする。
 */
export function collectSigniAttackDelayedTriggers(
  ctx: TrigCtx,
  defenderId: string,
  defenderState: PlayerState,
  attackerCardNum: string,
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const dt of defenderState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== 'ON_ATTACK_SIGNI') continue;
    if ((dt.trigger.attackerOwner ?? 'any') === 'self') continue;
    if (dt.duration === 'THIS_ATTACK_PHASE' && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
    // 🆕アタッカーのカード条件（2026-08-31 続き747）＝「**黒の＜ブルアカ＞の**シグニがアタックしたとき」。
    if (dt.trigger.attackerFilter
      && !matchesFilter(ctx.cardMap.get(getCardNum(attackerCardNum)), dt.trigger.attackerFilter)) continue;
    entries.push({
      id: ctx.genId(), playerId: defenderId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: `${dt.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズ' : 'このターン'}の遅延トリガー（相手シグニアタック時）`,
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
      triggeringCardNum: attackerCardNum,
    });
  }
  return entries;
}

/**
 * INSTALL_DELAYED_TRIGGER（B3）: **攻撃側**プレイヤーに設置された ON_ATTACK_SIGNI watcher
 * （§5.3 2026-08-27 Sheet1 B11・`WX10-035`「このターン、あなたのシグニ１体がアタックしたとき、
 * あなたのデッキの一番上のカードをエナゾーンに置く。」）。
 *
 * 🔴姉妹関数 `collectSigniAttackDelayedTriggers` は**防御側専用**（`attackerOwner:'self'` を明示的に
 * 読み飛ばす）ため、設置者＝アタッカー側の watcher は**どこからも収集されていなかった**。
 * ここを足さないと parser 側で設置しても永久に発火しない（＝過剰実行を no-op へ替えるだけになる）。
 * `attackerOwner:'opponent'` はこちらでは読み飛ばす（対称）。
 */
export function collectAttackerSelfDelayedTriggers(
  ctx: TrigCtx,
  attackerId: string,
  attackerState: PlayerState,
  attackerCardNum: string,
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const dt of attackerState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== 'ON_ATTACK_SIGNI') continue;
    if ((dt.trigger.attackerOwner ?? 'any') === 'opponent') continue;
    if (dt.duration === 'THIS_ATTACK_PHASE' && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
    // 🆕アタッカーのカード条件（2026-08-31 続き747）＝「**黒の＜ブルアカ＞の**シグニがアタックしたとき」。
    if (dt.trigger.attackerFilter
      && !matchesFilter(ctx.cardMap.get(getCardNum(attackerCardNum)), dt.trigger.attackerFilter)) continue;
    entries.push({
      id: ctx.genId(), playerId: attackerId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: `${dt.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズ' : 'このターン'}の遅延トリガー（自分シグニアタック時）`,
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
      triggeringCardNum: attackerCardNum,
    });
  }
  return entries;
}

/** Collect the new face's own AUTO ability after a permanent LRIG identity flip. */
export function collectLrigFlipTriggers(
  ctx: TrigCtx,
  beforeState: PlayerState,
  afterState: PlayerState,
  ownerId: string,
): StackEntry[] {
  const instanceId = afterState.field.lrig.at(-1);
  if (!instanceId || beforeState.field.lrig.at(-1) !== instanceId) return [];
  const beforeIdentity = beforeState.card_identity_overrides?.[instanceId] ?? getCardNum(instanceId);
  const afterIdentity = afterState.card_identity_overrides?.[instanceId] ?? getCardNum(instanceId);
  if (beforeIdentity === afterIdentity) return [];
  return (ctx.effectsMap.get(afterIdentity) ?? [])
    .filter(effect => effect.effectType === 'AUTO' && effect.timing?.includes('ON_LRIG_FLIP'))
    .map(effect => ({
      id: ctx.genId(), playerId: ownerId, cardNum: instanceId, effectId: effect.effectId,
      label: `${ctx.cardMap.get(afterIdentity)?.CardName ?? afterIdentity} の【自】効果（反転時）`,
      effect,
    }));
}

/**
 * 「あなたのメインフェイズの間（`duringMainPhase`）／あなたのメインフェイズ以外で（`outsideMainPhase`）」の共通ゲート。
 * ⚠**「あなたの」＝その【自】の持ち主視点**なので、フェイズだけでなく**ターンプレイヤーも見る**。
 *   従来は全 collector が `ctx.turnPhase` だけを見ていたため、**対戦相手のメインフェイズ**を
 *   「あなたのメインフェイズ」に数えていた（`duringMainPhase`＝過剰発火／`outsideMainPhase`＝過小発火）。
 * ownerPlayerId＝その効果が誰の【自】か（= entry.playerId と同じ基準）。
 * ⚠**旧コメントにあった「`collectFieldTriggers` だけは例外」は `O-64` で解消済み**（あちらも owner 相対で評価する）。
 *
 * 🆕**§5.3 `O-64`（2026-08-25）＝`ctx` を取らない素の版を切り出して export した。**
 * 消費地点が collector の外（`BattleScreen` の ON_POWER_THRESHOLD / ON_ENERGY_CHARGE watcher）にも
 * あるため。⚠**この2 timing は collector ではなく watcher なので golden から叩けない**＝実機で守る。
 */
export function mainPhaseGateOkFor(
  eff: CardEffect, turnPhase: string | undefined, activeUserId: string | null | undefined, ownerPlayerId: string,
): boolean {
  const tc = eff.triggerCondition;
  if (!tc?.duringMainPhase && !tc?.outsideMainPhase) return true;
  const isOwnMainPhase = turnPhase === 'MAIN' && activeUserId === ownerPlayerId;
  if (tc.duringMainPhase && !isOwnMainPhase) return false;
  if (tc.outsideMainPhase && isOwnMainPhase) return false;
  return true;
}

function mainPhaseGateOk(eff: CardEffect, ctx: TrigCtx, ownerPlayerId: string): boolean {
  return mainPhaseGateOkFor(eff, ctx.turnPhase, ctx.activeUserId, ownerPlayerId);
}

/**
 * 「〈あなた／対戦相手〉のアタックフェイズの間」の**フェイズ側**ゲート（`duringAttackPhase`）。
 * ⚠**ターン主（どちらのアタックフェイズか）はここでは見ない**＝`triggerCondition.turnOwner` が担い、
 *   `effectStack.turnGateOk` が全 collector 共通に entry.playerId 基準で評価する（`O-63` で実証）。
 *   ⇒ 「対戦相手のアタックフェイズの間」＝`duringAttackPhase:true` ＋ `turnOwner:'opponent'` の2枚組。
 */
function attackPhaseGateOk(eff: CardEffect, ctx: TrigCtx): boolean {
  if (!eff.triggerCondition?.duringAttackPhase) return true;
  return (ctx.turnPhase ?? '').startsWith('ATTACK');
}

/** ON_PLAY の由来限定を評価する。由来不明は限定能力だけ不成立（fail-closed）。 */
export function onPlayOriginMatches(eff: CardEffect, placedFromZone?: TriggerOriginZone): boolean {
  const required = eff.triggerCondition?.fromZones;
  if (required?.length) return !!placedFromZone && required.includes(placedFromZone);
  if (eff.triggerCondition?.placedFromTrash) return placedFromZone === 'trash';
  return true;
}

/** 通常召喚で自身の mandatory【出】として積める構造か。 */
export function isMandatoryOwnOnPlayForNormalSummon(
  eff: CardEffect,
  placedFromZone: TriggerOriginZone = 'hand',
): boolean {
  return eff.effectType === 'AUTO'
    && !!eff.timing?.includes('ON_PLAY')
    && (eff.triggerScope === undefined || eff.triggerScope === 'self' || eff.triggerScope === 'any')
    && eff.mandatory !== false
    && !eff.triggerCondition?.byEffect
    && !eff.triggerCondition?.bySigniEffect
    && onPlayOriginMatches(eff, placedFromZone);
}

/**
 * 任意【出】の `EffectCost` を engine 既存の `OPTIONAL_COST` スタブへ写す（タスク12(xxix)(1)）。
 *
 * 通常召喚は `handleSummonSigni` → `SigniOnPlayCostModal` という **BattleScreen 側の支払いフロー**を持つが、
 * 効果で場に出た場合はスタック解決の途中なのでそのフローに入れない。そこで**支払い選択そのものを
 * action に埋め込む**＝`SEQUENCE[OPTIONAL_COST, 元のaction]` にして、解決時に engine の Pattern ⑤
 * （「任意コスト：支払いますか？」CHOOSE）へ載せる。engine 内で完結するので golden で検証できる。
 *
 * ⚠ `OptionalCostSpec` が表現できるのは **エナ色／《コイン》／手札捨て／手札からエナ／手札から自身の下／
 *   エナゾーン捨て／エクシード／場シグニトラッシュ／ルリグダウン／自身シグニダウン／ライフ／
 *   デッキ上トラッシュ／チャームトラッシュ／ルリグデッキのアーツトラッシュ／相手ウィルス除去**。
 *   それ以外のコスト（beat_signi 等）が1つでも混ざる効果は
 *   **null を返して収集しない**＝従来どおり不発のまま据え置く。**払っていないコストを踏み倒して
 *   効果だけ通す方が、発火しないことより有害**なので取りこぼす側に倒す。
 */
/**
 * コスト自体は `SUPPORTED` で表現できるが、**効果本体がそのコストで動かしたカードを参照している**ため、
 * 参照が解決できないまま包むと過剰実行になる効果の明示ゲート（カードゲート）。
 * ここに載せる条件＝「包める」かつ「包むと原文より強くなる」。参照側を直した波でこのリストから外す。
 * 第12波で上記2件の記録→levelEqualsVar解決を実装し、現在の保留対象は0件。
 */
export const OPTIONAL_ON_PLAY_COST_REF_DEFERRED = new Set<string>();

export function optionalOnPlayCostStub(
  cost: import('../types/effects').EffectCost,
  effectId?: string,
): StubAction | null {
  if (effectId && OPTIONAL_ON_PLAY_COST_REF_DEFERRED.has(effectId)) return null;
  const SUPPORTED = new Set([
    'energy', 'coin', 'discard', 'discardFilter', 'discardGroups', 'handDiscardSigni',
    'handToEnergy', 'handToUnderSelf', 'underAnySigniTrash', 'energyTrash', 'energyTrashGroups', 'exceed', 'fieldTrash', 'fieldTrashGroups',
    'fieldToLrigTrash',
    'lrigDown', 'lrigDownVariable', 'down_self', 'life_crash', 'lifeTrash', 'lifeToHand',
    'beat_signi', 'beat_signi_from_trash',
    'deckTrash', 'charmTrash', 'charmTrashVariable', 'trashArtsFromLrigDeck', 'removeOppVirus',
    // 支払いキーではなく**コストの修飾**（§6.4 O-35・続き530）。呼び出し側が
    // `applyAbilityCostReduction` で `energy` へ焼き込み済みなので、ここでは無視して通す
    // （SUPPORTED に無いと「未対応キーあり」で包めず、任意【出】が丸ごと積まれなくなる）。
    'conditionalEnergyReduction',
  ]);
  const keys = Object.keys(cost).filter(k => (cost as Record<string, unknown>)[k] !== undefined);
  if (keys.length === 0) return null;
  if (keys.some(k => !SUPPORTED.has(k))) return null;
  const costColors = (cost.energy ?? []).flatMap(e => Array.from({ length: e.count }, () => e.color as string));
  let handDiscard: { count: number; filter?: TargetFilter } | undefined;
  if (cost.discard !== undefined) {
    handDiscard = { count: cost.discard, ...(cost.discardFilter ? { filter: cost.discardFilter } : {}) };
  } else if (cost.handDiscardSigni) {
    const hds = cost.handDiscardSigni;
    handDiscard = {
      count: hds.count,
      filter: {
        cardType: 'シグニ',
        ...(hds.story !== undefined ? { story: hds.story } : {}),
        ...(hds.color !== undefined ? { color: hds.color } : {}),
        ...(hds.level !== undefined ? { level: hds.level } : {}),
      },
    };
  } else if (cost.discardFilter) {
    // discardFilter だけがあり枚数が無い形は解釈できない（枚数不明のまま捨てさせない）
    return null;
  }
  // 「何も払わない」形（energy:[{count:0}] のみ等）は OPTIONAL_COST を挟む意味が無い＝発動可否の確認だけになるが、
  // 原文が「〜してもよい」である以上その確認自体が正しい挙動なので通す。
  return {
    type: 'STUB', id: 'OPTIONAL_COST',
    ...(costColors.length > 0 ? { costColors } : {}),
    ...(cost.coin ? { coinCost: cost.coin } : {}),
    ...(handDiscard ? { handDiscard } : {}),
    ...(cost.handToEnergy ? { handToEnergy: cost.handToEnergy } : {}),
    ...(cost.handToUnderSelf ? { handToUnderSelf: cost.handToUnderSelf } : {}),
    ...(cost.underAnySigniTrash ? { underAnySigniTrash: cost.underAnySigniTrash } : {}),
    ...(cost.discardGroups ? { handDiscardGroups: cost.discardGroups } : {}),
    ...(cost.energyTrash ? { energyTrash: cost.energyTrash } : {}),
    ...(cost.energyTrashGroups ? { energyTrashGroups: cost.energyTrashGroups } : {}),
    ...(cost.exceed ? { exceed: cost.exceed } : {}),
    ...(cost.fieldTrash ? { fieldTrash: cost.fieldTrash } : {}),
    ...(cost.fieldTrashGroups ? { fieldTrashGroups: cost.fieldTrashGroups } : {}),
    ...(cost.fieldToLrigTrash ? { fieldToLrigTrash: cost.fieldToLrigTrash } : {}),
    ...(cost.lrigDown ? { lrigDown: cost.lrigDown } : {}),
    ...(cost.lrigDownVariable ? { lrigDownVariable: cost.lrigDownVariable } : {}),
    ...(cost.down_self ? { down_self: true } : {}),
    ...(cost.beat_signi ? { beat_signi: cost.beat_signi } : {}),
    ...(cost.beat_signi_from_trash ? { beat_signi_from_trash: cost.beat_signi_from_trash } : {}),
    ...(cost.life_crash ? { life_crash: cost.life_crash } : {}),
    ...(cost.lifeTrash ? { lifeTrash: cost.lifeTrash } : {}),
    ...(cost.lifeToHand ? { lifeToHand: cost.lifeToHand } : {}),
    ...(cost.deckTrash ? { deckTrash: cost.deckTrash } : {}),
    ...(cost.charmTrash ? { charmTrash: cost.charmTrash } : {}),
    ...(cost.charmTrashVariable ? { charmTrashVariable: cost.charmTrashVariable } : {}),
    ...(cost.trashArtsFromLrigDeck ? { trashArtsFromLrigDeck: cost.trashArtsFromLrigDeck } : {}),
    ...(cost.removeOppVirus ? { removeOppVirus: cost.removeOppVirus } : {}),
  } as StubAction;
}

/**
 * 任意【出】を「発動可否／支払い可否を問う包み」へ変換する（タスク12(xxix)(1)(2)）。
 * - コストあり＆`OptionalCostSpec` で表現できる → `SEQUENCE[OPTIONAL_COST, 元action]`
 * - コストなし（「〜してもよい」／【出】英知＝N） → `SEQUENCE[OPTIONAL_ACTIVATE, 元action]`
 * - コストありだが表現できない → **null**（積まない＝コストの踏み倒しを避ける）
 * `cost` は包みへ移すので落とす（二重徴収・UI重複の防止）。
 */
export function wrapOptionalOnPlay(
  eff: CardEffect,
  // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」の評価に要る盤面（§6.4 O-35・続き530）。
  // 省略時は減額しない＝**印刷どおりの重いコスト**で包む（安全側）。
  reduceCtx?: {
    my: PlayerState; op: PlayerState; cardMap: Map<string, CardData>;
    sourceCardNum: string; turnPhase: string; effectivePowers?: Map<string, number>;
  },
): CardEffect | null {
  if (reduceCtx && eff.cost?.conditionalEnergyReduction) {
    eff = applyAbilityCostReduction(
      eff, reduceCtx.my, reduceCtx.op, reduceCtx.cardMap,
      reduceCtx.sourceCardNum, reduceCtx.turnPhase, reduceCtx.effectivePowers,
    );
  }
  // 原文にコスト句があるのに parser が解釈できなかった効果は**絶対に包まない**。
  // 包むと「発動しますか？」だけ出てコストを払わずに撃ててしまう（＝踏み倒し）。
  if (eff.costUnparsed) return null;
  // 本体がコストで動かしたカードを参照していて、参照が未実装のまま包むと過剰実行になる効果は収集しない
  // （理由と対象は `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` の定義コメント参照）。
  if (OPTIONAL_ON_PLAY_COST_REF_DEFERRED.has(eff.effectId)) return null;
  // 可変枚数捨ては action 先頭の typed TRASH が任意 SELECT_TARGET を提示し、同じ ExecCtx の後段へ
  // lastProcessedCards を渡す。外側の OPTIONAL_ACTIVATE / OPTIONAL_COST は二重プロンプトになるため、
  // この構造に限って action をそのまま積む。
  // ⚠ 落としてよい cost は **action 自身が徴収する `discardUpTo` だけ**。他のコスト（エナ・コイン等）が
  //   混ざっている効果まで無条件に落とすと、そのコストを踏み倒して action だけ通る。
  //   `discardUpTo` 以外を持つ場合は下の通常経路（包むか、包めなければ null）へ落とす。
  const selfPaidVariableDiscard = eff.action.type === 'SEQUENCE'
    && eff.action.steps[0]?.type === 'TRASH'
    && eff.action.steps[0].asCost === true
    && eff.action.steps[0].target.type === 'HAND_CARD'
    && eff.action.steps[0].target.owner === 'self'
    && eff.action.steps[0].target.upToCount === true;
  if (selfPaidVariableDiscard) {
    const otherCostKeys = Object.keys(eff.cost ?? {})
      .filter(k => k !== 'discardUpTo' && (eff.cost as Record<string, unknown>)[k] !== undefined);
    if (otherCostKeys.length === 0) return { ...eff, cost: undefined };
  }
  let stub: StubAction | null;
  if (eff.cost) {
    stub = optionalOnPlayCostStub(eff.cost, eff.effectId);
    if (!stub) return null;
  } else {
    stub = { type: 'STUB', id: 'OPTIONAL_ACTIVATE' } as StubAction;
  }
  return {
    ...eff,
    cost: undefined,
    action: { type: 'SEQUENCE', steps: [stub as unknown as import('../types/effects').EffectAction, eff.action] } as unknown as import('../types/effects').EffectAction,
  };
}

/** 通常召喚で「自身の任意【出】」として支払い/発動可否を問う対象か（mandatory は別関数）。 */
export function isOptionalOwnOnPlayForNormalSummon(
  eff: CardEffect,
  placedFromZone: TriggerOriginZone = 'hand',
): boolean {
  return eff.effectType === 'AUTO'
    && !!eff.timing?.includes('ON_PLAY')
    && (eff.triggerScope === undefined || eff.triggerScope === 'self' || eff.triggerScope === 'any')
    && eff.mandatory === false
    && !eff.triggerCondition?.byEffect
    && !eff.triggerCondition?.bySigniEffect
    && onPlayOriginMatches(eff, placedFromZone);
}

/**
 * センタールリグのグロウ時に、任意・無コスト【出】を発動確認つきへ変換する。
 * activeCondition → condition の順は executeGrow の既存収集順に合わせる。
 * costUnparsed など包めないものは deferred に残し、コスト踏み倒しを避ける。
 */
export function collectOptionalNoCostOnPlayForGrow(
  effects: CardEffect[],
  controllerState: PlayerState,
  otherState: PlayerState,
  isOwnerTurn: boolean,
  cardMap: Map<string, CardData>,
  sourceCardNum: string,
  turnPhase: string,
  effectivePowers?: Map<string, number>,
): { effects: CardEffect[]; deferred: CardEffect[] } {
  const wrappedEffects: CardEffect[] = [];
  const deferred: CardEffect[] = [];
  for (const eff of effects) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
    if (eff.mandatory !== false || eff.cost) continue;
    if (eff.activeCondition && !checkActiveCondition(
      eff.activeCondition, controllerState, otherState, isOwnerTurn, cardMap, sourceCardNum,
    )) continue;
    if (eff.condition && !evalUseCondition(
      eff.condition, controllerState, otherState, cardMap, sourceCardNum, turnPhase, effectivePowers,
    )) continue;
    const wrapped = wrapOptionalOnPlay(eff, {
      my: controllerState, op: otherState, cardMap, sourceCardNum, turnPhase, effectivePowers,
    });
    if (wrapped) wrappedEffects.push(wrapped);
    else deferred.push(eff);
  }
  return { effects: wrappedEffects, deferred };
}

/**
 * 効果で場に出たシグニ自身の【出】を収集する。
 * mandatory:false は、コスト付きなら `OPTIONAL_COST`、無コストなら `OPTIONAL_ACTIVATE` を
 * 前置した action で積む。`OptionalCostSpec` で表現できないコストは収集せず、踏み倒しを避ける。
 */
export function collectPlacedSelfOnPlayTriggers(
  ctx: TrigCtx,
  placedInstanceId: string,
  controllerState: PlayerState,
  otherState: PlayerState,
  ownerId: string,
  opts: { placedByEffect: boolean; sourceIsSigni: boolean; suppressOnPlay?: boolean; placedFromZone?: TriggerOriginZone },
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  if (opts.suppressOnPlay) {
    return { entries, usedHostIds, usedGuestIds };
  }

  const ownerIsHost = ownerId === ctx.hostId;
  const usedIds = ownerIsHost ? usedHostIds : usedGuestIds;
  const limitOk = mkLimitOk(controllerState.actions_done, usedIds);
  const isOwnerTurn = ownerId === ctx.activeUserId;
  if (isSigniOwnOnPlaySuppressed(
    placedInstanceId, controllerState, otherState, isOwnerTurn, ctx.effectsMap, ctx.cardMap,
  )) return { entries, usedHostIds, usedGuestIds };
  const blocked = collectContinuousAbilitiesRemovedSigni(
    controllerState, otherState, isOwnerTurn, ctx.effectsMap, ctx.cardMap, '出',
  ).has(placedInstanceId);
  if (blocked) return { entries, usedHostIds, usedGuestIds };

  for (const eff of effsOf(ctx, placedInstanceId)) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'self' && scope !== 'any') continue;
    const byEffect = !!eff.triggerCondition?.byEffect;
    const bySigniEffect = !!eff.triggerCondition?.bySigniEffect;
    if ((byEffect || bySigniEffect) && !opts.placedByEffect) continue;
    if (bySigniEffect && !opts.sourceIsSigni) continue;
    if (!onPlayOriginMatches(eff, opts.placedFromZone)) continue;
    // 任意【出】は「支払いますか？／発動しますか？」の包みに変換して積む。
    // 変換できない（コストを表現できない）ものだけ従来どおり据え置き。
    let wrapped: CardEffect | null = null;
    if (eff.mandatory === false) {
      wrapped = wrapOptionalOnPlay(eff, {
        my: controllerState, op: otherState, cardMap: ctx.cardMap,
        sourceCardNum: placedInstanceId, turnPhase: ctx.turnPhase, effectivePowers: ctx.effectivePowers,
      });
      if (!wrapped) continue;
    }
    if (eff.activeCondition && !checkActiveCondition(
      eff.activeCondition, controllerState, otherState, isOwnerTurn, ctx.cardMap, placedInstanceId,
    )) continue;
    if (eff.condition && !evalUseCondition(
      eff.condition, controllerState, otherState, ctx.cardMap, placedInstanceId, ctx.turnPhase, ctx.effectivePowers,
    )) continue;
    if (!limitOk(eff)) continue;
    const cardName = ctx.cardMap.get(getCardNum(placedInstanceId))?.CardName ?? getCardNum(placedInstanceId);
    entries.push({
      id: ctx.genId(),
      playerId: ownerId,
      cardNum: placedInstanceId,
      effectId: eff.effectId,
      label: `${cardName} の【出】効果${wrapped ? (eff.cost ? '（任意コスト）' : '（任意）') : ''}`,
      effect: wrapped ?? eff,
    });
  }
  return { entries, usedHostIds, usedGuestIds };
}

/** 通常召喚・CPU召喚・効果配置の全経路で共有する、自身【出】のプレイヤー/【常】抑止判定。 */
export function isSigniOwnOnPlaySuppressed(
  placedInstanceId: string,
  controllerState: PlayerState,
  otherState: PlayerState,
  isControllerTurn: boolean,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
): boolean {
  return controllerState.suppress_signi_on_play_this_turn === true
    || isSigniOnPlaySuppressedByContinuous(
      placedInstanceId, controllerState, otherState, isControllerTurn, effectsMap, cardMap,
    );
}

/**
 * 通常手順でルリグデッキから配置したアシストルリグ自身の【出】を収集する。
 * 効果による配置ではないため byEffect / bySigniEffect は発火させない。
 */
export function collectAssistOnPlayTriggers(
  ctx: TrigCtx,
  placedInstanceId: string,
  controllerState: PlayerState,
  otherState: PlayerState,
  ownerId: string,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  return collectPlacedSelfOnPlayTriggers(
    ctx, placedInstanceId, controllerState, otherState, ownerId,
    { placedByEffect: false, sourceIsSigni: false },
  );
}

/**
 * kizunaIcon 効果（【絆自】【絆起】【絆出】）のゲート。
 * 効果を持つ側のプレイヤーが発生源カード名との絆を獲得していなければ発動しない。
 * 各コレクタの effect ループ先頭で `if (!kizunaOk(ctx, eff, watcherState, topNum)) continue;` と使う。
 * （【絆常】＝CONTINUOUS は effectEngine 側のループで別途判定済み）
 */
const kizunaOk = (ctx: TrigCtx, eff: CardEffect, state: PlayerState, cardNum: string): boolean =>
  !eff.kizunaIcon || isKizunaActive(state, cardNum, ctx.cardMap);

/**
 * ON_TARGETED（「このシグニが対戦相手の能力か効果の対象になったとき」）のトリガーを収集する。
 * targetedNums=対象に取られたシグニのカード番号群／targetedOwnerId=その所有者（＝効果発生源の対戦相手）。
 *   self（既定）: 対象に取られたシグニ自身が ON_TARGETED を持つ場合
 *   any_ally: watcher 自分側のシグニが対象に取られ triggerFilter（色等）に一致する場合
 *   any_opp/any: 対戦相手側 / いずれか
 * triggerCondition.turnOwner・condition・usageLimit（《ターン1回》）も評価。
 * usageLimit を消費した effectId は usedHostIds/usedGuestIds で返す（呼び出し元が watcher 側の
 * actions_done へ書き戻す責務を持つ＝他コレクターと同型。返さないと同一ターン内に何度でも再発火する）。
 */
/**
 * `cardNum`（インスタンスIDでも素の CardNum でも可）が `state` のどこかのゾーンに在るか。
 * `triggerCondition.targetedByOpponent` の「対象にしてきたのは誰の効果か」判定に使う。
 * ⚠**在るかどうかしか見ない**＝解決中のスペル／アーツは使用者のチェックゾーンかルリグトラッシュに居る。
 */
function ownsCardAnyZone(state: PlayerState, cardNum: string): boolean {
  const want = getCardNum(cardNum);
  const hit = (arr: readonly (string | null | undefined)[] | undefined): boolean =>
    !!arr?.some(n => !!n && (n === cardNum || getCardNum(n) === want));
  if (hit(state.hand) || hit(state.trash) || hit(state.energy) || hit(state.lrig_trash)) return true;
  if (hit(state.field.lrig) || hit(state.field.assist_lrig_l) || hit(state.field.assist_lrig_r)) return true;
  if (hit([state.field.key_piece, ...(state.field.key_piece_extra ?? []), state.field.check])) return true;
  return state.field.signi.some(stack => hit(stack ?? undefined));
}

export function collectTargetedTriggers(
  ctx: TrigCtx,
  targetedNums: string[],
  targetedOwnerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  origin?: TargetedOrigin,
  beforeHostState: PlayerState = afterHostState,
  beforeGuestState: PlayerState = afterGuestState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const targetedSet = new Set(targetedNums);
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? afterHostState : afterGuestState;
    const otherState = watcherIsHost ? afterGuestState : afterHostState;
    const targetedIsWatcherOwn = targetedOwnerId === watcherId;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const limitOk = mkLimitOk(watcherState.actions_done, watcherIsHost ? usedHostIds : usedGuestIds);
    for (const topNum of ownFieldSources(watcherState)) {
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TARGETED')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self') {
          if (!targetedSet.has(topNum)) continue;
        } else if (scope === 'any_ally') {
          if (!targetedIsWatcherOwn) continue;
          if (eff.triggerFilter && !targetedNums.some(n => {
            if (!matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerFilter)) return false;
            const needsZoneState = TARGET_ZONE_STATE_KEYS.some(k => (eff.triggerFilter as Record<string, unknown>)[k] !== undefined);
            if (!needsZoneState) return true;
            const targetState = targetedOwnerId === ctx.hostId ? beforeHostState : beforeGuestState;
            const zoneIdx = targetState.field.signi.findIndex(s => s?.at(-1) === n);
            return zoneIdx >= 0 && matchesStateFilter(targetState, zoneIdx, eff.triggerFilter);
          })) continue;
        } else if (scope === 'any_opp') {
          if (targetedIsWatcherOwn) continue;
          if (eff.triggerFilter && !targetedNums.some(n => {
            if (!matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerFilter)) return false;
            const needsZoneState = TARGET_ZONE_STATE_KEYS.some(k => (eff.triggerFilter as Record<string, unknown>)[k] !== undefined);
            if (!needsZoneState) return true;
            const targetState = targetedOwnerId === ctx.hostId ? beforeHostState : beforeGuestState;
            const zoneIdx = targetState.field.signi.findIndex(s => s?.at(-1) === n);
            return zoneIdx >= 0 && matchesStateFilter(targetState, zoneIdx, eff.triggerFilter);
          })) continue;
        } // 'any' は無条件
        const origins = eff.triggerCondition?.targetedOrigins;
        if (origins?.length) {
          if (!origin) continue;
          const source = ctx.cardMap.get(getCardNum(origin.cardNum));
          if (!origins.some(rule =>
            (rule.sourceType === undefined || source?.Type === rule.sourceType)
            && (rule.effectType === undefined || origin.effect.effectType === rule.effectType)
            && (rule.abilityTiming === undefined || origin.effect.timing?.includes(rule.abilityTiming))
          )) continue;
        }
        // 🆕`targetedByOpponent`＝「**対戦相手の**、能力か効果の対象になったとき」（2026-08-31・
        //   `WX24-P4-102-E1` / `WX25-P2-055-E2`）。🔴旧実装は誰の効果でも発火していた＝
        //   自分の効果で自分のシグニを対象にしただけで誘発する過剰発火だった。
        //   ⚠`TargetedOrigin` は持ち主を持たないので、**origin のカードが watcher 自身のゾーンに
        //   居るか**で判定する（場・手札・トラッシュ・エナ・チェック・ルリグ枠を走査）。
        //   見つからない＝どちらの持ち物か決められない場合は**従来どおり通す**（fail-open＝現状維持）。
        if (eff.triggerCondition?.targetedByOpponent) {
          if (!origin) continue;
          if (ownsCardAnyZone(watcherState, origin.cardNum)) continue;
        }
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(),
          playerId: watcherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（対象になったとき）`,
          effect: eff,
          // 「その（対戦相手の）シグニ」＝**対象にしてきたカード**（タスク12(c)②）。origin は
          // targetedOrigins の照合にだけ使われ entry に載っていなかったため、engine 実装済みの
          // `filter.isTriggerSource` が ON_TARGETED では常に候補0＝no-op に落ちていた。
          ...(origin ? { triggeringCardNum: origin.cardNum } : {}),
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ルリグアタック時に「**防御側**」の付与AUTO（`lrig_granted_auto_effects`）を収集する（続き218j・タスク12(xlvii)）。
 *
 * 従来 `ON_ATTACK_LRIG` の収集は BattleScreen が**アタック側の `my.lrig_granted_auto_effects` しか見ておらず**、
 * 「対戦相手のルリグがアタックしたとき、〜」という**防御側の付与能力を発火させる経路が存在しなかった**。
 * `ON_ATTACK_SIGNI` 側は `collectFieldTriggers` が `opState.lrig_granted_auto_effects` を any_opp/any で拾う
 * 経路を持っており（同ファイル内・「相手ルリグの付与AUTO」節）、本関数はそのルリグアタック版＝同型。
 *
 * defenderId＝アタックされた側（＝この能力の持ち主）。scope が any_opp/any のものだけを拾う
 * （未設定＝既定 'self' は「自分のルリグがアタックしたとき」であり BattleScreen 側の既存収集が担当する）。
 * usageLimit（《ターン1回/2回》）は消費した effectId を usedIds で返し、呼び出し元が actions_done へ書き戻す（他コレクタと同型）。
 *
 * contGranted＝場のシグニ/キーの CONTINUOUS `GRANT_LRIG_ABILITY` 由来の付与能力（`collectLrigGrantedEffects`
 * の結果）。実行時付与（`lrig_granted_auto_effects`）とは別ソースで、**アタック側は BattleScreen が既に
 * 合流させている**のに防御側だけ経路が無かった（タスク12(l)＝WDK04-006「対戦相手のセンタールリグが
 * アタックしたとき」をキー本体の【自】からルリグ付与へ入れ子化したため、この経路が無いと丸ごと不発になる）。
 */
export function collectLrigAttackDefenderTriggers(
  ctx: TrigCtx,
  defenderState: PlayerState,
  defenderId: string,
  contGranted: readonly CardEffect[] = [],
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const usedIds: string[] = [];
  if (defenderState.lrig_abilities_disabled) return { entries, usedIds };
  const limitOk = mkLimitOk(defenderState.actions_done, usedIds);
  const defLrigNum = defenderState.field.lrig.at(-1) ?? '';
  // 付与ストアの走査は `grantedStore.ts` の共通経路に寄せる（3ストア横断＝旧実装は base 1本だけを見ていた）。
  const granted = grantedStoreWatchers(defenderState, 'ON_ATTACK_LRIG', ['any_opp', 'any']).map(w => w.effect);
  for (const eff of [...granted, ...contGranted]) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ATTACK_LRIG')) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'any_opp' && scope !== 'any') continue;
    if (!limitOk(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: defenderId, cardNum: defLrigNum, effectId: eff.effectId,
      label: `ルリグ付与効果（対戦相手のルリグアタック時）`, effect: eff,
    });
  }
  return { entries, usedIds };
}

/**
 * ルリグアタック時に「**アタック側の味方カード**」が持つ `ON_ATTACK_LRIG` を収集する（§3 (cxxviii)・続き475d）。
 *
 * 🔴**この経路が丸ごと無かった**＝BattleScreen のルリグアタック収集は
 * ①アタックしたルリグカード自身（`effectsMap.get(lrigNum)`）②ルリグへの付与ストア
 * ③コピー由来 ④CONTINUOUS `GRANT_LRIG_ABILITY` の4本しか見ておらず、
 * **場のシグニが持つ「あなたのルリグ１体がアタックしたとき」を拾う手段が存在しなかった**。
 * そのため parser もこの語彙を `ON_ATTACK_SIGNI` へ倒すしかなく（＝**シグニのアタックで誤発火**）、
 * `WXDi-P04-051-E1` は「攻撃者が先にダウンするのでアップの自シグニが3体そろわない」＝**恒久 no-op** になっていた。
 *
 * - 母集団＝**18効果**（`あなたの(センター)ルリグ(N体)がアタックしたとき`）。17枚がシグニ・1枚がアシストルリグ。
 * - `attackingLrigNum` は**除外する**＝そのカード自身の `ON_ATTACK_LRIG` は BattleScreen の
 *   `lrigCardEffects` が既に積んでいるので、ここで拾うと**二重発火**する。
 * - scope は `any_ally`（＝「**あなたの**ルリグがアタックしたとき」を見る味方カード）と `any` だけ。
 *   `self`（＝「**この**ルリグがアタックしたとき」）は上記①が担当する。
 */
export function collectAllyLrigAttackTriggers(
  ctx: TrigCtx,
  attackerState: PlayerState,
  attackerId: string,
  attackingLrigNum: string,
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const usedIds: string[] = [];
  const limitOk = mkLimitOk(attackerState.actions_done, usedIds);
  const sources = [
    ...attackerState.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : [])),
    ...(attackerState.field.assist_lrig_l?.at(-1) ? [attackerState.field.assist_lrig_l.at(-1)!] : []),
    ...(attackerState.field.assist_lrig_r?.at(-1) ? [attackerState.field.assist_lrig_r.at(-1)!] : []),
  ].filter(n => n !== attackingLrigNum);
  // 主語の修飾（「あなたの**白の**ルリグ」等）は `triggerFilter` に載っている＝**アタックしたルリグ**を照合する。
  // ⚠ここを見ないと限定が黙って落ちて「どのルリグのアタックでも発火する」過剰発火になる（続き475e）。
  const attackingLrigCard = ctx.cardMap.get(getCardNum(attackingLrigNum));
  for (const num of sources) {
    for (const eff of effsOf(ctx, num)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ATTACK_LRIG')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      if (eff.triggerFilter && !matchesFilter(attackingLrigCard, eff.triggerFilter)) continue;
      // 🆕`centerLrigOnly`＝「あなたの**センタールリグ**がアタックしたとき」（2026-08-31・`WX19-031-E1`）。
      //   🔴立てないと `any_ally` が**アシストルリグのアタックでも**誘発する過剰発火になる。
      if (eff.triggerCondition?.centerLrigOnly
        && attackingLrigNum !== attackerState.field.lrig.at(-1)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: attackerId, cardNum: num, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(num))?.CardName ?? num} の【自】効果（あなたのルリグのアタック時）`,
        effect: eff,
      });
    }
  }
  return { entries, usedIds };
}

/**
 * ON_LRIG_GROW（「（センター）ルリグがグロウしたとき」）のトリガーを収集する。
 * grownOwnerId=グロウしたプレイヤー（センターグロウの実行者）。両プレイヤーの場（シグニ＋キー＋ルリグ上）から収集。
 *   any_ally: watcher 自分側のルリグがグロウ ／ any_opp: 対戦相手のルリグがグロウ ／ self: グロウ先自身（ON_PLAY 経路で処理）＝除外。
 * triggerCondition.turnOwner・condition・usageLimit（《ターン1回》）も評価。
 */
export function collectLrigGrowTriggers(
  ctx: TrigCtx,
  grownOwnerId: string,
  afterGrowerState: PlayerState,
  afterOpState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit の消費 effectId を watcher 側で返す（呼び出し元が actions_done へ書き戻す＝他コレクタと同型）。
  // 従来は actions_done を「読む」だけで書き戻し機構が無く、《ターン1回》が実質ノーガードだった（続き132・Opusタスク12(vi-5)）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const oppOfGrowerId = grownOwnerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  for (const watcherIsGrower of [true, false]) {
    const watcherId = watcherIsGrower ? grownOwnerId : oppOfGrowerId;
    const watcherState = watcherIsGrower ? afterGrowerState : afterOpState;
    const otherState = watcherIsGrower ? afterOpState : afterGrowerState;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const limitOk = mkLimitOk(watcherState.actions_done, watcherId === ctx.hostId ? usedHostIds : usedGuestIds);
    const watcherCardNums: string[] = [];
    for (const stack of watcherState.field.signi) { if (stack?.length) watcherCardNums.push(stack[stack.length - 1]); }
    watcherCardNums.push(...activeKeyAbilitySources(watcherState));
    const lrigTop = watcherState.field.lrig?.at(-1);
    if (lrigTop) watcherCardNums.push(lrigTop);
    for (const topNum of watcherCardNums) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LRIG_GROW')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self') continue;
        if (scope === 'any_ally' && !watcherIsGrower) continue;
        if (scope === 'any_opp' && watcherIsGrower) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(),
          playerId: watcherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（グロウ時）`,
          effect: eff,
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_COIN_PAID（「あなたが《コイン》を1枚以上支払ったとき」）のトリガーを収集する。
 * payerId=コインを支払ったプレイヤー。支払い1イベントにつき1回発火（枚数に依らず）。
 *   self（既定・「あなたが」）/any_ally/any＝payer 側で発火。any_opp（相手が支払い）は対象外。
 * triggerCondition.turnOwner・condition・usageLimit（《ターン1回/2回》）も評価。
 */
export function collectCoinPaidTriggers(
  ctx: TrigCtx,
  payerId: string,
  afterPayerState: PlayerState,
  afterOpState: PlayerState,
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit の消費を usedIds で返す（呼び出し側で payer の actions_done へ書き戻す）。
  // 従来は StackEntry[] のみ返し書き戻しが無く、《ターン1回/2回》が実質ノーガードだった（続き99・WXDi-P15-069）。
  const usedIds: string[] = [];
  const limitOk = mkLimitOk(afterPayerState.actions_done, usedIds);
  const payerIsTurn = ctx.activeUserId === payerId;
  for (const topNum of ownFieldSources(afterPayerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_COIN_PAID')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope === 'any_opp') continue; // 相手支払いは対象外（payer 視点では発火しない）
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !payerIsTurn) continue;
      if (to === 'opponent' && payerIsTurn) continue;
      if (eff.condition && !evalUseCondition(eff.condition, afterPayerState, afterOpState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(),
        playerId: payerId,
        cardNum: topNum,
        effectId: eff.effectId,
        label: `${cardName} の【自】効果（コイン支払時）`,
        effect: eff,
      });
    }
  }
  return { entries, usedIds };
}

/**
 * ON_SIGNI_POWER_ZERO_OR_LESS（「シグニのパワーが0以下になったとき」）のトリガーを収集する（Stage2 抽出）。
 * zeroedCardNum=パワー0以下になったシグニ／zeroedOwnerId=その所有者。両プレイヤーの場シグニから収集。
 *   any（既定）/any_opp（多数派「対戦相手のシグニが0以下」）/any_ally（自分側）/self（0化シグニ自身）。
 * triggerCondition.turnOwner（WXDi-P14-009「あなたのターンの間」）・usageLimit（《ターン1回》）も評価。
 */
export function collectPowerZeroTriggers(
  ctx: TrigCtx,
  zeroedCardNum: string,
  zeroedOwnerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit の消費 effectId を watcher 側で返す（呼び出し元が actions_done へ書き戻す。続き100・Opusタスク12(vi-5)）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? afterHostState : afterGuestState;
    const zeroedIsWatcherOwn = zeroedOwnerId === watcherId;
    const watcherIsTurn = ctx.activeUserId === watcherId;
    const limitOk = mkLimitOk(watcherState.actions_done, watcherIsHost ? usedHostIds : usedGuestIds);
    // ownFieldSources = 場シグニ最上段＋センタールリグ最上段。field.signi のみ走査だと
    // LRIG が watcher の ON_SIGNI_POWER_ZERO_OR_LESS が構造的に絶対発火しなかった（続き95/96・WX22-013/WXDi-P14-009）。
    for (const topNum of ownFieldSources(watcherState)) {
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_POWER_ZERO_OR_LESS')) continue;
        const scope = eff.triggerScope ?? 'any';
        if (scope === 'self' && topNum !== zeroedCardNum) continue;
        if (scope === 'any_ally' && !zeroedIsWatcherOwn) continue;
        if (scope === 'any_opp' && zeroedIsWatcherOwn) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(),
          playerId: watcherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（パワー0以下時）`,
          effect: eff,
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_BLOOD_CRYSTAL_ARMOR（「血晶武装したとき」）のトリガーを収集する（Stage2 抽出）。
 * armoredCardNum=血晶武装したシグニ／armoredPlayerId=その所有者。所有者の場のみ走査。
 *   self（既定）: 血晶武装したシグニ自身（ラベルは「【血晶武装時】効果」）
 *   any_ally/any: 同じ所有者の場シグニが反応
 */
export function collectArmorTriggers(
  ctx: TrigCtx,
  armoredCardNum: string,
  armoredPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const ownerStateAfter = armoredPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  // usageLimit の消費 effectId（呼び出し元が actions_done へ書き戻す＝ON_BANISH と同型）。
  // any_ally パスは続き181 まで parser が self に潰していて死んでおり、ノーガードが露見しなかった。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const limitOkOwner = mkLimitOk(ownerStateAfter.actions_done, armoredPlayerId === ctx.hostId ? usedHostIds : usedGuestIds);
  // このシグニ自身の ON_BLOOD_CRYSTAL_ARMOR (scope=self)
  for (const eff of (ctx.effectsMap.get(armoredCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'self') continue;
    entries.push({
      id: ctx.genId(),
      playerId: armoredPlayerId,
      cardNum: armoredCardNum,
      effectId: eff.effectId,
      label: `${ctx.cardMap.get(armoredCardNum)?.CardName ?? armoredCardNum} の【血晶武装時】効果`,
      effect: eff,
    });
  }
  // フィールド上の全シグニ＋ルリグの ON_BLOOD_CRYSTAL_ARMOR (scope=any_ally)
  for (const topNum of ownFieldSources(ownerStateAfter)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOD_CRYSTAL_ARMOR')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // triggerFilter は血晶武装状態になったシグニ側の限定。
      if (eff.triggerFilter?.excludeSelf && armoredCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(armoredCardNum)), filter)) continue;
      }
      if (!limitOkOwner(eff)) continue;
      entries.push({
        id: ctx.genId(),
        playerId: armoredPlayerId,
        cardNum: topNum,
        effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（血晶武装時）`,
        effect: eff,
        // 🆕`triggeringCardNum`＝**血晶武装状態になったシグニ**（§5.2 Sheet3 バッチ7・2026-08-29）。
        // 🔴この any_ally 経路だけ載せておらず、`targetsTriggerSource`（「**その**シグニのパワーを＋5000」＝
        //   `WXK04-043-E2`）が `ctx.sourceCardNum`（＝watcher 自身）へフォールバックしていた。
        //   他の collector 31箇所は既に載せている＝ここだけの配線漏れ。
        triggeringCardNum: armoredCardNum,
      });
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

// 条件ツリーに IS_MY_TURN / IS_OPPONENT_TURN が含まれるか（evalCondition では IS_MY_TURN が常時true のため明示判定）。
const condHas = (c: Condition | undefined, t: string): boolean =>
  !!c && (c.type === t || (c.type === 'AND' && (c.conditions ?? []).some(cc => condHas(cc, t))));

/**
 * デッキからトラッシュに置かれたカード自身の ON_TRASH（triggerScope:self のみ）を収集する（Stage2 抽出）。
 * 場のシグニ用フィールドトリガー（any_ally等）はデッキミルでは発火しないため除外する。
 */
export function collectDeckTrashSelfTriggers(
  ctx: TrigCtx, trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false,
  causeSourceCardNum?: string, byEffectCause = true,
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const eff of (ctx.effectsMap.get(trashedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
    if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
    if (eff.triggerCondition?.trashSourceStory) {
      if (causeByOpponent) continue;
      const source = causeSourceCardNum ? ctx.cardMap.get(getCardNum(causeSourceCardNum)) : undefined;
      if (!source || source.Type !== 'シグニ' || !(source.CardClass ?? '').includes(eff.triggerCondition.trashSourceStory)) continue;
    }
    // fromZones 指定があり 'deck' を含まない場合はデッキからでは発火しない
    if (eff.triggerCondition?.fromZones && !eff.triggerCondition.fromZones.includes('deck')) continue;
    if (!mainPhaseGateOk(eff, ctx, trashedPlayerId)) continue;
    const cardName = ctx.cardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
    entries.push({
      id: ctx.genId(), playerId: trashedPlayerId, cardNum: trashedCardNum, effectId: eff.effectId,
      label: `${cardName} の【トラッシュ時】効果（デッキから）`, effect: eff,
    });
  }
  return entries;
}

/**
 * 🆕**任意の timing の遅延トリガー**を1本で収集する（2026-08-31 続き749）。
 *
 * 🔴`delayed_triggers` を読む地点はイベントごとに手書きで増えてきた（バトルバニッシュ／アタック／離場／
 *   ミル／リフレッシュ／ダウン／フェイズ系／続き748 で ON_PLAY・ON_BLOOM）。**足し忘れた timing は
 *   「設置しても永久に発火しない」無言 no-op**になるので、残りは この汎用 collector を各イベント地点から
 *   呼ぶ形にする（`timing` を渡すだけ）。
 * ⚠`triggerFilter` は**イベントの発生源カード**に当てる（渡されない地点では素通り＝filter を書かない）。
 */
export function collectGenericDelayedTriggers(
  ctx: TrigCtx,
  holderId: string,
  holderState: PlayerState,
  timing: string,
  triggeringCardNums: string[] = [],
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const dt of holderState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== timing) continue;
    if (dt.trigger.triggerFilter) {
      const hit = triggeringCardNums.some(cn => matchesFilter(ctx.cardMap.get(getCardNum(cn)), dt.trigger.triggerFilter));
      if (!hit) continue;
    }
    entries.push({
      id: ctx.genId(), playerId: holderId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: `このターンの遅延トリガー（${timing}）`,
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: [timing as import('../types/effects').EffectTiming],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
      ...(triggeringCardNums[0] ? { triggeringCardNum: triggeringCardNums[0] } : {}),
    });
  }
  return entries;
}

/** 手札から公開されたカード自身の ON_REVEALED_FROM_HAND を収集する。 */
export function collectRevealedFromHandTriggers(
  ctx: TrigCtx,
  revealedCardNums: string[],
  ownerState: PlayerState,
  ownerId: string,
  causeSourceCardNum?: string,
): StackEntry[] {
  const entries: StackEntry[] = [];
  // 🆕このターンの遅延トリガー（`WXK04-004-E3`「このターン、…手札から＜水獣＞のシグニを1枚以上公開したとき」）。
  entries.push(...collectGenericDelayedTriggers(ctx, ownerId, ownerState, 'ON_REVEALED_FROM_HAND', revealedCardNums));
  for (const cardNum of revealedCardNums) {
    if (!ownerState.hand.includes(cardNum)) continue;
    for (const eff of effsOf(ctx, cardNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_REVEALED_FROM_HAND')) continue;
      const reqStory = eff.triggerCondition?.revealSourceStory;
      if (reqStory) {
        const source = causeSourceCardNum ? ctx.cardMap.get(getCardNum(causeSourceCardNum)) : undefined;
        if (!source || source.Type !== 'シグニ' || !(source.CardClass ?? '').includes(reqStory)) continue;
      }
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(cardNum))?.CardName ?? cardNum}【自】手札公開時`, effect: eff,
      });
    }
  }
  return entries;
}

/**
 * 手札・エナゾーンからトラッシュに置かれたカード自身の ON_TRASH（triggerScope:self かつ fromAnyZone）を収集する（Stage2 抽出）。
 * 「いずれかの領域からトラッシュに置かれたとき」（WX04-035-E2）のうち、場/デッキ以外（手札・エナ）の経路を補う。
 */
export function collectAnyZoneTrashSelfTriggers(
  ctx: TrigCtx, trashedCardNum: string, trashedPlayerId: string, causeByOpponent = false, origin: 'hand' | 'energy' | 'under_signi' = 'hand',
  causeSourceCardNum?: string, byEffectCause = true, ownerState?: PlayerState, otherState?: PlayerState,
): StackEntry[] {
  const entries: StackEntry[] = [];
  for (const eff of (ctx.effectsMap.get(trashedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    // 場/デッキ以外（手札・エナ・シグニの下）は fromAnyZone 指定、または fromZones が当該領域を含む効果のみ
    const fromZones = eff.triggerCondition?.fromZones;
    // under_signi は新しい明示値だけで opt-in。既存 fromAnyZone の意味（手札・エナ経路）は変えない。
    const okByZones = fromZones
      ? fromZones.includes(origin)
      : origin !== 'under_signi' && !!eff.triggerCondition?.fromAnyZone;
    if (!okByZones) continue;
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
    // byOwnEffect（「あなたの効果によって/あなたがこのカードを捨てたとき」＝タスク16[C]機構②）: 対戦相手効果起因では発火しない。
    if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
    // trashSourceStory（「あなたの＜X＞のシグニの効果によって捨てられたとき」WXDi-P14-086）: 原因効果の発生源
    // カードが自分側の＜X＞のシグニのときのみ（発生源不明＝ガード/ルール処理では発火しない）。
    if (eff.triggerCondition?.trashSourceStory) {
      if (causeByOpponent) continue;
      const srcCard = causeSourceCardNum ? ctx.cardMap.get(getCardNum(causeSourceCardNum)) : undefined;
      if (!srcCard || srcCard.Type !== 'シグニ' || !(srcCard.CardClass ?? '').includes(eff.triggerCondition.trashSourceStory)) continue;
    }
    // turnOwner（「あなたのターンの間、このカードが捨てられたとき」WXDi-P10-070）: 捨てられたカードの持ち主視点。
    const toAZ = eff.triggerCondition?.turnOwner;
    const ownerIsTurnAZ = ctx.activeUserId === trashedPlayerId;
    if (toAZ === 'self' && !ownerIsTurnAZ) continue;
    if (toAZ === 'opponent' && ownerIsTurnAZ) continue;
    const cardName = ctx.cardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
    entries.push({
      id: ctx.genId(), playerId: trashedPlayerId, cardNum: trashedCardNum, effectId: eff.effectId,
      label: `${cardName} の【トラッシュ時】効果（手札／エナから）`, effect: eff,
    });
  }
  // 場に残る any_ally/any watcher（WX18-059-E1）。移動カード自身の self 走査とは母集団を分け、
  // 手札／エナ起点でも watcher の triggerFilter と原因主体を同じイベント上で評価する。
  if (ownerState) {
    const ownerIsTurn = ctx.activeUserId === trashedPlayerId;
    for (const topNum of ownFieldSources(ownerState)) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope !== 'any_ally' && scope !== 'any') continue;
        const fromZones = eff.triggerCondition?.fromZones;
        const okByZones = fromZones
          ? fromZones.includes(origin)
          : origin !== 'under_signi' && !!eff.triggerCondition?.fromAnyZone;
        if (!okByZones) continue;
        if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
        if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
        if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
        if (eff.triggerFilter?.excludeSelf && trashedCardNum === topNum) continue;
        if (eff.triggerFilter) {
          const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
          if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
        }
        if (!mainPhaseGateOk(eff, ctx, trashedPlayerId)) continue;
        if (eff.activeCondition && otherState && !checkActiveCondition(eff.activeCondition, ownerState, otherState, ownerIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && (!otherState || !evalUseCondition(eff.condition, ownerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers))) continue;
        if (eff.usageLimit && (ownerState.actions_done ?? []).includes(eff.effectId)) continue;
        entries.push({
          id: ctx.genId(), playerId: trashedPlayerId, cardNum: topNum, effectId: eff.effectId,
          label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（手札／エナの味方トラッシュ時）`,
          effect: eff, triggeringCardNum: trashedCardNum,
        });
      }
    }
  }
  return entries;
}

/**
 * ON_TRASH トリガーを収集する（Stage2 抽出。「場から」トラッシュ＝field origin が主経路）。
 * causeByOpponent: このトラッシュが対戦相手の効果によるものか（byOpponentEffect ゲート用）。
 * byCostOrEffect: このトラッシュがコストか効果によるものか（fromFieldByCostOrEffect ゲート用。G204）。
 * byEffectCause: このトラッシュが効果によるものか（コスト・バトル・ルール処理は false。byEffect ゲート用）。
 * resonaConditionCardNum: 出現条件の支払いなら、場に出たレゾナの instanceId。省略時は通常のトラッシュ。
 */
export function collectTrashTriggers(
  ctx: TrigCtx,
  trashedCardNum: string,
  trashedPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  causeByOpponent = false,
  byCostOrEffect = true,
  byEffectCause = true,
  resonaConditionCardNum?: string,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  // usageLimit（《ターン1回/2回》）の消費 effectId を返す（呼び出し元が actions_done へ書き戻す＝ON_BANISH と同型。
  // 続き181 までは any_ally が parser で self に潰れていてこのパス自体が死んでおり、ノーガードが露見しなかった）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const ownerState = trashedPlayerId === ctx.hostId ? afterHostState : afterGuestState;
  const limitOkOwner = mkLimitOk(ownerState.actions_done, trashedPlayerId === ctx.hostId ? usedHostIds : usedGuestIds);
  // 「あなたの…シグニがトラッシュに置かれたとき」の watcher＝トラッシュされたシグニのオーナー。
  const ownerIsTurnPlayer = ctx.activeUserId === trashedPlayerId;
  // トラッシュに置かれたカード自身の ON_TRASH 効果（このパスは「場から」トラッシュ＝field origin）
  for (const eff of effsOf(ctx, trashedCardNum)) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
    const scope = eff.triggerScope ?? 'self';
    if (scope !== 'self' && scope !== 'any_ally' && scope !== 'any') continue;
    if (scope !== 'self') {
      // any_ally は**トラッシュされたカード自身も母集団に含む**（自身が＜X＞なら自分のトラッシュでも発火）。
      // 既に場から離れているため下の field 走査では拾えず、ここで拾わないと自己発火だけが落ちる（ON_BANISH と同型）。
      if (eff.triggerFilter?.excludeSelf) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
      }
      if (condHas(eff.condition, 'IS_MY_TURN') && !ownerIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && ownerIsTurnPlayer) continue;
      if (eff.condition && !evalUseCondition(eff.condition, ownerState, trashedPlayerId === ctx.hostId ? afterGuestState : afterHostState, ctx.cardMap, trashedCardNum, ctx.turnPhase ?? '')) continue;
      if (!limitOkOwner(eff)) continue;
    }
    // 「対戦相手の効果によって」限定トリガーは対戦相手効果が原因のときのみ発火（WX04-035-E2）
    if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
    // 🆕「**アタックフェイズの間、**…場からトラッシュに置かれたとき」（2026-08-31 §5.2・`SP27-003-E1`）。
    //   ⚠キー（`triggerCondition.duringAttackPhase`）は既に在るのに **`ON_TRASH` のコレクタだけ見ておらず**、
    //     メインフェイズのトラッシュでも発火していた（過剰発火）。他コレクタ（:1460/:1692/:1922 …）と同じ式。
    if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
    // 「効果によって」だけの文型はコストを含まない。effect 起因シグナルが無ければ発火しない。
    if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
    // 「あなたの効果によって」＝自分の効果起因のみ。コスト・バトル・ルール処理（!byEffectCause）と相手効果（causeByOpponent）を除外。
    if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
    // 「コストか効果によって場から」限定トリガーはコスト/効果起因のときのみ発火（バトル・ルール処理では発火しない。G204）
    if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
    if (eff.triggerCondition?.fromFieldByCostOnly && !(byCostOrEffect && !byEffectCause)) continue;
    // 「コストかあなたの効果によって場から」＝コスト、または trashed owner 自身の効果だけを許可。
    if (eff.triggerCondition?.fromFieldByCostOrOwnEffect
        && !(byCostOrEffect && (!byEffectCause || !causeByOpponent))) continue;
    // fromZones 指定があり 'field' を含まない場合は「場から」では発火しない（WX04-102「手札かデッキから」）
    if (eff.triggerCondition?.fromZones && !eff.triggerCondition.fromZones.includes('field')) continue;
    // レゾナの出現条件の支払いとしてトラッシュされた場合のみ発火（WX10-055等）。
    // 「＜X＞のレゾナ」限定は、今まさに場へ出たレゾナの CardClass で判定する（カード名一致ではない）。
    if (eff.triggerCondition?.forResonaCondition) {
      if (!resonaConditionCardNum) continue;
      const requiredClass = eff.triggerCondition.resonaClass;
      if (requiredClass && !ctx.cardMap.get(getCardNum(resonaConditionCardNum))?.CardClass?.includes(requiredClass)) continue;
    }
    const cardName = ctx.cardMap.get(trashedCardNum)?.CardName ?? trashedCardNum;
    entries.push({
      id: ctx.genId(), playerId: trashedPlayerId, cardNum: trashedCardNum, effectId: eff.effectId,
      label: `${cardName} の【トラッシュ時】効果`, effect: eff,
      ...(resonaConditionCardNum ? { triggeringCardNum: resonaConditionCardNum } : {}),
    });
  }
  // フィールド上シグニ＋ルリグのON_TRASHフィールドトリガー（ally_banished等）
  for (const topNum of ownFieldSources(ownerState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
      if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
      if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
      if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
      if (eff.triggerCondition?.fromFieldByCostOnly && !(byCostOrEffect && !byEffectCause)) continue;
      if (eff.triggerCondition?.fromFieldByCostOrOwnEffect
          && !(byCostOrEffect && (!byEffectCause || !causeByOpponent))) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // triggerFilter はトラッシュに置かれたシグニ側の限定。watcher 自身を除く指定もここで評価する。
      if (eff.triggerFilter?.excludeSelf && trashedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
      }
      // ターン所有者条件は evalCondition では判定できない（IS_MY_TURN はプレースホルダで常時 true）ため、
      // watcher＝トラッシュされたシグニのオーナー視点で収集側が判定する（WX24-P1-015-E1「あなたのメインフェイズの間」＝
      // AND(DURING_PHASE:MAIN, IS_MY_TURN)。DURING_PHASE 単独だと相手のメインフェイズでも発火してしまう）。
      if (condHas(eff.condition, 'IS_MY_TURN') && !ownerIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && ownerIsTurnPlayer) continue;
      // 🆕`O-64`：`duringMainPhase`／`outsideMainPhase` の共通ゲート（上の AND(DURING_PHASE,IS_MY_TURN)
      //   と同じ意味を1フィールドで表す新しい受け皿。両方あっても結論は同じ＝二重掛けで安全）。
      if (!mainPhaseGateOk(eff, ctx, trashedPlayerId)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, ownerState, trashedPlayerId === ctx.hostId ? afterGuestState : afterHostState, ctx.cardMap, topNum, ctx.turnPhase ?? '')) continue;
      if (!limitOkOwner(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: trashedPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（シグニトラッシュ時）`, effect: eff,
      });
    }
  }
  // 対戦相手のシグニがトラッシュに置かれたのを監視する any_opp トリガー（トラッシュされたカードの対戦相手フィールド）。
  // 例: WX04-037-E2「あなたのターンの間、対戦相手のシグニ1体が場からトラッシュに置かれたとき」。
  const watcherPlayerId = trashedPlayerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  const watcherState = trashedPlayerId === ctx.hostId ? afterGuestState : afterHostState;
  const watcherOppState = ownerState; // = トラッシュされたカードのオーナー状態
  const watcherIsTurnPlayer = ctx.activeUserId === watcherPlayerId;
  const limitOkWatcher = mkLimitOk(watcherState.actions_done, watcherPlayerId === ctx.hostId ? usedHostIds : usedGuestIds);
  for (const topNum of ownFieldSources(watcherState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH')) continue;
      if (eff.triggerCondition?.byOpponentEffect && !causeByOpponent) continue;
      if (eff.triggerCondition?.byEffect && !byEffectCause) continue;
      if (eff.triggerCondition?.byOwnEffect && (!byEffectCause || causeByOpponent)) continue;
      if (eff.triggerCondition?.fromFieldByCostOrEffect && !byCostOrEffect) continue;
      if (eff.triggerCondition?.fromFieldByCostOnly && !(byCostOrEffect && !byEffectCause)) continue;
      if (eff.triggerCondition?.fromFieldByCostOrOwnEffect
          && !(byCostOrEffect && (!byEffectCause || !causeByOpponent))) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp') continue; // 'any' は既存の自分側ループで収集済み
      // any_ally と同じく、トラッシュに置かれたシグニ側へ watcher の triggerFilter を適用する。
      if (eff.triggerFilter?.excludeSelf && trashedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _excludeSelf, ...filter } = eff.triggerFilter;
        if (Object.keys(filter).length > 0 && !matchesFilter(ctx.cardMap.get(getCardNum(trashedCardNum)), filter)) continue;
      }
      // 「あなたのターンの間」: IS_MY_TURN 指定があれば watcher がターンプレイヤーのときのみ
      if (condHas(eff.condition, 'IS_MY_TURN') && !watcherIsTurnPlayer) continue;
      if (condHas(eff.condition, 'IS_OPPONENT_TURN') && watcherIsTurnPlayer) continue;
      if (!mainPhaseGateOk(eff, ctx, watcherPlayerId)) continue;   // `O-64`（watcher 視点）
      // ターン条件以外の condition を評価
      if (eff.condition && !evalUseCondition(eff.condition, watcherState, watcherOppState, ctx.cardMap, topNum, ctx.turnPhase ?? '')) continue;
      if (!limitOkWatcher(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: watcherPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum} の【自】効果（対戦相手シグニのトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * バニッシュされたシグニの ON_BANISH 効果 + フィールド上の全シグニのトリガーを収集する（Stage2 抽出）。
 * banishedPlayerId: バニッシュされたシグニのオーナーの userId。
 * prevOwnerState: バニッシュされたカードのオーナーのバニッシュ前状態（アクセ付与ON_BANISH復元用）。
 * ctx.meId（視点プレイヤー）で my/op を確定し、エントリ順（自分側→相手側）を BattleScreen 版と一致させる。
 */
export function collectBanishTriggers(
  ctx: TrigCtx,
  banishedCardNum: string,
  banishedPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  prevOwnerState?: PlayerState,
  cause?: { ownerId: string; sourceCardNum?: string },
  battleAttackerNum?: string,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  const isHost = meId === ctx.hostId;
  const opId = isHost ? ctx.guestId : ctx.hostId;
  const myAfterState = isHost ? afterHostState : afterGuestState;
  const opAfterState = isHost ? afterGuestState : afterHostState;
  const banishedOwnerIsMe = banishedPlayerId === meId;
  // usageLimit の消費 effectId を watcher 側で返す（呼び出し元が actions_done へ書き戻す。続き100・Opusタスク12(vi-5)）。
  // 従来は actions_done を「読む」だけで書き戻しが無く、《ターン1回》が実質ノーガードだった（ON_BANISH watcher 18枚）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const limitOkMy = mkLimitOk(myAfterState.actions_done, isHost ? usedHostIds : usedGuestIds);
  const limitOkOp = mkLimitOk(opAfterState.actions_done, isHost ? usedGuestIds : usedHostIds);
  const banishedZone = prevOwnerState?.field.signi.findIndex(s => s?.at(-1) === banishedCardNum) ?? -1;
  // バニッシュ**直前**にこのシグニの下にあったカード（ライズの土台）。バニッシュ後は下カードもトラッシュへ
  // 落ちて関連付けが消えるため、収集時にスナップショットして `underLeftCard` を解決する
  //   （`WXK10-054-E1`「このシグニの下にあった＜ウェポン＞のシグニ1枚を手札に加える」＝
  //    従来はトラッシュの＜ウェポン＞なら**無関係な札でも回収できる過剰効果**だった＝意味照合 段1 第4バッチ E018）。
  const banishedUnder = banishedZone >= 0
    ? ((prevOwnerState?.field.signi[banishedZone] ?? []).slice(0, -1))
    : [];
  const isFrontOfWatcher = (watcherNum: string, watcherState: PlayerState): boolean => {
    if (banishedZone < 0) return false;
    const watcherZone = watcherState.field.signi.findIndex(s => s?.at(-1) === watcherNum);
    return watcherZone >= 0 && banishedZone === 2 - watcherZone;
  };

  // 🆕**0'. このターン設置された ON_BANISH の遅延トリガー**（2026-09-01 続き760・`WX15-006-E1`
  //   「このターン、あなたのシグニ1体が**あなたの効果以外によって**バニッシュされたとき、〜」）。
  //   🔴従来 `delayed_triggers` を読む地点にバニッシュ（効果／ルール処理）が無く、
  //     設置しても**永久に発火しない**＝アーツ本体が丸ごと死んでいた。
  //   🔑保持者は**バニッシュされたシグニのオーナー**（原文の主語が「あなたのシグニ」）。
  //   ⚠`notByOwnEffect`＝`cause.ownerId` が保持者本人なら発火しない（自分で落として得をする抜け道を塞ぐ）。
  {
    const holderState = banishedPlayerId === ctx.hostId ? afterHostState : afterGuestState;
    for (const dt of holderState.delayed_triggers ?? []) {
      if (dt.trigger?.timing !== 'ON_BANISH') continue;
      if (dt.trigger.notByOwnEffect && cause?.ownerId === banishedPlayerId) continue;
      if (dt.trigger.triggerFilter
        && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), dt.trigger.triggerFilter)) continue;
      entries.push({
        id: ctx.genId(), playerId: banishedPlayerId,
        cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
        label: 'このターンの遅延トリガー（ON_BANISH）',
        effect: {
          effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_BANISH'],
          action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
        },
        triggeringCardNum: banishedCardNum,
      });
    }
  }

  // 0. アクセ付与の ON_BANISH 能力を復元（WX18-076: 離場で消えるため前状態から再構築）
  if (prevOwnerState) {
    const zi = prevOwnerState.field.signi.findIndex(s => s?.at(-1) === banishedCardNum);
    const acceNums = zi >= 0 ? acceCardsAt(prevOwnerState.field, zi) : [];
    if (acceNums.length > 0) {
      const ownerAfter = banishedOwnerIsMe ? myAfterState : opAfterState;
      const otherAfter = banishedOwnerIsMe ? opAfterState : myAfterState;
      const hostCard = ctx.cardMap.get(getCardNum(banishedCardNum));
      const isBanishedOwnerTurn = ctx.activeUserId === banishedPlayerId;
      for (const acceNum of acceNums) for (const eff of (ctx.effectsMap.get(acceNum) ?? [])) {
        if (eff.effectType !== 'CONTINUOUS' || eff.action.type !== 'GRANT_ACCE_HOST_ABILITY') continue;
        const g = eff.action as GrantAcceHostAbilityAction;
        if (g.filter && !matchesFilter(hostCard, g.filter)) continue;
        for (const ab of g.abilities) {
          if (ab.effectType !== 'AUTO' || !ab.timing?.includes('ON_BANISH')) continue;
          if (!mainPhaseGateOk(ab, ctx, banishedPlayerId)) continue;
          if (ab.activeCondition && !checkActiveCondition(ab.activeCondition, ownerAfter, otherAfter, isBanishedOwnerTurn, ctx.cardMap, banishedCardNum)) continue;
          const frontNum = otherAfter.field.signi[2 - zi]?.at(-1); // 正面（前ゾーン 2-zi）の相手シグニ
          entries.push({
            id: ctx.genId(), playerId: banishedPlayerId, cardNum: banishedCardNum, effectId: ab.effectId,
            label: `${hostCard?.CardName ?? banishedCardNum} の付与【自】（バニッシュ時）`, effect: ab, triggeringCardNum: frontNum,
          });
        }
      }
    }
  }

  // 1. バニッシュされたカード自身の ON_BANISH 効果
  for (const eff of (ctx.effectsMap.get(banishedCardNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
    if (!mainPhaseGateOk(eff, ctx, banishedPlayerId)) continue;
    const selfScope = eff.triggerScope ?? 'self';
    if (selfScope !== 'self') {
      // any_ally（「あなたの＜悪魔＞のシグニ1体がバニッシュされたとき」）は**被バニッシュ側自身も母集団に含む**
      // （自身が＜悪魔＞なら自分のバニッシュでも発火する）。既に場から離れているため下の field 走査では拾えず、
      // ここで拾わないと自己発火だけが落ちる。「他の」＝excludeSelf のみ自身を除外。
      if (selfScope !== 'any_ally' && selfScope !== 'any') continue;
      if (eff.triggerFilter?.excludeSelf) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), restFilter)) continue;
      }
      // condition/usageLimit は field 走査側と同じ条件で評価（WXDi-P16-074-E2 の FIELD_HAS_GATE 等）
      const ownerStateForCond = banishedOwnerIsMe ? myAfterState : opAfterState;
      const otherStateForCond = banishedOwnerIsMe ? opAfterState : myAfterState;
      if (eff.condition && !evalUseCondition(eff.condition, ownerStateForCond, otherStateForCond, ctx.cardMap, banishedCardNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!(banishedOwnerIsMe ? limitOkMy : limitOkOp)(eff)) continue;
    }
    // 🆕「**バトル以外によって**バニッシュされたとき」（2026-08-31 §5.2・`WXDi-D06-013-E1`）。
    //   バトル経路だけが `battleAttackerNum` を渡すので、それが在るときは発火しない。
    if (eff.triggerCondition?.notByBattle && battleAttackerNum !== undefined) continue;
    if (eff.triggerCondition?.banishedWasUp
      && (banishedZone < 0 || !prevOwnerState || prevOwnerState.field.signi_down?.[banishedZone] === true)) continue;
    if (eff.triggerCondition?.banishedHadCharm
      && (banishedZone < 0 || !prevOwnerState?.field.signi_charms?.[banishedZone])) continue;
    // activeCondition チェック（「対戦相手のターンの間」等）
    const isBanishedOwnerTurn = ctx.activeUserId === banishedPlayerId;
    if (!checkActiveCondition(eff.activeCondition, banishedOwnerIsMe ? myAfterState : opAfterState, banishedOwnerIsMe ? opAfterState : myAfterState, isBanishedOwnerTurn, ctx.cardMap, banishedCardNum)) continue;
    const cardName = ctx.cardMap.get(banishedCardNum)?.CardName ?? banishedCardNum;
    entries.push({
      id: ctx.genId(), playerId: banishedPlayerId, cardNum: banishedCardNum, effectId: eff.effectId,
      label: `${cardName} の【バニッシュ時】効果`,
      // underLeftCard 等の「離場カード基準」動的フィルタは ON_LEAVE_FIELD と同じ規約で収集時に確定する。
      effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, ctx.cardMap.get(getCardNum(banishedCardNum)), banishedUnder),
      // 場を離れた後に「このシグニの下から」を参照する action（execTakeFromUnderSigni の fallback）用スナップショット。
      leftFieldUnderCards: [...banishedUnder],
    });
  }

  // 2. 自分フィールド上シグニ＋ルリグのトリガー
  const isMyTurn = ctx.activeUserId === meId;
  for (const topNum of ownFieldSources(myAfterState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (banishedOwnerIsMe  && scope !== 'any_ally' && scope !== 'any') continue;
      if (!banishedOwnerIsMe && scope !== 'any_opp'  && scope !== 'any') continue;
      // duringAttackPhase＝アタックフェイズ中のバニッシュのみ発火（「（対戦相手の）アタックフェイズの間、」WX18-002/WXEX1-18）。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      if (!mainPhaseGateOk(eff, ctx, meId)) continue;
      // turnOwner＝反応側（me）のターン限定（'self'＝自分ターン／'opponent'＝相手ターン。「対戦相手のアタックフェイズ」等）。
      if (eff.triggerCondition?.turnOwner === 'self' && !isMyTurn) continue;
      if (eff.triggerCondition?.turnOwner === 'opponent' && isMyTurn) continue;
      if (eff.triggerCondition?.banishedFrontOfSelf && !isFrontOfWatcher(topNum, myAfterState)) continue;
      if (eff.triggerCondition?.banishedHadCharm && (banishedZone < 0 || !prevOwnerState?.field.signi_charms?.[banishedZone])) continue;
      // 🆕§5.3 `O-62`：「**アクセされている**あなたのシグニ1体が…」（`WX15-003-E1`）。
      //   `banishedHadCharm` と同じ規約＝除去直前の盤面で判定し、`prevOwnerState` 不明時は非発火。
      if (eff.triggerCondition?.banishedHadAcce && (banishedZone < 0 || !prevOwnerState?.field.signi_acce?.[banishedZone])) continue;
      if (eff.triggerCondition?.banishedFromCenterZone && banishedZone !== 1) continue;
      if (eff.triggerCondition?.notWhileAttacking && battleAttackerNum === topNum) continue;
      if (eff.triggerCondition?.notByBattle && battleAttackerNum !== undefined) continue;
      if (eff.triggerCondition?.banishedLevelLtWatcher) {
        const banishedLevel = parseInt(ctx.cardMap.get(getCardNum(banishedCardNum))?.Level ?? '', 10);
        const watcherLevel = parseInt(ctx.cardMap.get(getCardNum(topNum))?.Level ?? '', 10);
        if (isNaN(banishedLevel) || isNaN(watcherLevel) || banishedLevel >= watcherLevel) continue;
      }
      if (eff.triggerCondition?.banishedByOwnEffect && (!cause || cause.ownerId !== meId)) continue;
      // 🆕「**効果によって**バニッシュされたとき」（2026-08-27 Sheet1 B10・`WX11-045-E2`）＝所有者を問わず
      //   **効果起因のみ**。バトルによるバニッシュは `cause` が渡らないので落ちる。
      if (eff.triggerCondition?.banishedByEffect && !cause) continue;
      // 🆕§5.3 `O-62`：**否定形**「あなたの効果**以外**によってバニッシュされたとき」（`WX15-003-E1`）。
      //   バトル・ルール処理・相手の効果では発火し、**watcher 所有者自身の効果**が原因のときだけ落とす。
      //   ⚠`banishedByOwnEffect:false` では書けない（未指定と区別できない）＝明示値の別キー。
      if (eff.triggerCondition?.banishedNotByOwnEffect && cause?.ownerId === meId) continue;
      if (eff.triggerCondition?.banishedSourceStory) {
        const source = cause?.sourceCardNum ? ctx.cardMap.get(getCardNum(cause.sourceCardNum)) : undefined;
        if (!cause || cause.ownerId !== meId || source?.Type !== 'シグニ' || !(source.CardClass ?? '').includes(eff.triggerCondition.banishedSourceStory)) continue;
      }
      // triggerFilter＝バニッシュされたシグニ側の限定（「あなたの＜悪魔＞のシグニ1体が」の＜悪魔＞・excludeSelf）。
      if (eff.triggerFilter?.excludeSelf && banishedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), restFilter)) continue;
      }
      // condition を持つAUTOは条件を満たす場合のみ収集（WXDi-P16-074-E2 の FIELD_HAS_GATE 等）
      if (eff.condition && !evalUseCondition(eff.condition, myAfterState, opAfterState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      // usageLimit（《ターン1回/2回》）: actions_done（永続）＋今回の収集内で回数上限に達していればスキップ。
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（バニッシュ時）`, effect: eff, triggeringCardNum: banishedCardNum,
      });
    }
  }

  // 3. 相手フィールド上シグニ＋ルリグのトリガー
  const isOpTurn = ctx.activeUserId === opId;
  for (const topNum of ownFieldSources(opAfterState)) {
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BANISH')) continue;
      const scope = eff.triggerScope ?? 'self';
      // 相手視点：「自分の味方がバニッシュ」= !banishedOwnerIsMe
      if (!banishedOwnerIsMe && scope !== 'any_ally' && scope !== 'any') continue;
      if (banishedOwnerIsMe  && scope !== 'any_opp'  && scope !== 'any') continue;
      // duringAttackPhase / turnOwner（反応側＝opId 視点）を section2 と対称に評価。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      if (!mainPhaseGateOk(eff, ctx, opId)) continue;
      if (eff.triggerCondition?.turnOwner === 'self' && !isOpTurn) continue;
      if (eff.triggerCondition?.turnOwner === 'opponent' && isOpTurn) continue;
      if (eff.triggerCondition?.banishedFrontOfSelf && !isFrontOfWatcher(topNum, opAfterState)) continue;
      if (eff.triggerCondition?.banishedHadCharm && (banishedZone < 0 || !prevOwnerState?.field.signi_charms?.[banishedZone])) continue;
      // 🆕§5.3 `O-62`：「**アクセされている**あなたのシグニ1体が…」（`WX15-003-E1`）。
      //   `banishedHadCharm` と同じ規約＝除去直前の盤面で判定し、`prevOwnerState` 不明時は非発火。
      if (eff.triggerCondition?.banishedHadAcce && (banishedZone < 0 || !prevOwnerState?.field.signi_acce?.[banishedZone])) continue;
      if (eff.triggerCondition?.banishedFromCenterZone && banishedZone !== 1) continue;
      if (eff.triggerCondition?.notWhileAttacking && battleAttackerNum === topNum) continue;
      if (eff.triggerCondition?.notByBattle && battleAttackerNum !== undefined) continue;
      if (eff.triggerCondition?.banishedLevelLtWatcher) {
        const banishedLevel = parseInt(ctx.cardMap.get(getCardNum(banishedCardNum))?.Level ?? '', 10);
        const watcherLevel = parseInt(ctx.cardMap.get(getCardNum(topNum))?.Level ?? '', 10);
        if (isNaN(banishedLevel) || isNaN(watcherLevel) || banishedLevel >= watcherLevel) continue;
      }
      if (eff.triggerCondition?.banishedByOwnEffect && (!cause || cause.ownerId !== opId)) continue;
      // 🆕§5.3 `O-62`：**否定形**「あなたの効果**以外**によってバニッシュされたとき」（`WX15-003-E1`）。
      //   バトル・ルール処理・相手の効果では発火し、**watcher 所有者自身の効果**が原因のときだけ落とす。
      //   ⚠`banishedByOwnEffect:false` では書けない（未指定と区別できない）＝明示値の別キー。
      if (eff.triggerCondition?.banishedNotByOwnEffect && cause?.ownerId === opId) continue;
      if (eff.triggerCondition?.banishedSourceStory) {
        const source = cause?.sourceCardNum ? ctx.cardMap.get(getCardNum(cause.sourceCardNum)) : undefined;
        if (!cause || cause.ownerId !== opId || source?.Type !== 'シグニ' || !(source.CardClass ?? '').includes(eff.triggerCondition.banishedSourceStory)) continue;
      }
      if (eff.triggerFilter?.excludeSelf && banishedCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(banishedCardNum)), restFilter)) continue;
      }
      // condition / usageLimit（相手＝opAfterState 視点で評価）
      if (eff.condition && !evalUseCondition(eff.condition, opAfterState, myAfterState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（バニッシュ時）`, effect: eff, triggeringCardNum: banishedCardNum,
      });
    }
  }

  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_LEAVE_FIELD効果内の動的フィルタを、場を離れたカードの具体値に解決した複製を返す（Stage2 抽出）。
 *  levelBelowLeftCard → level:{max: 離れたカードのレベル-1}
 *  powerBelowLeftCard → powerRange:{max: 離れたカードのパワー-1}
 *  underLeftCard → cardNames:[下にあった《ライズアイコン》を持たないシグニ名]（該当なしなら空＝候補なし）
 *  levelLtTrigger/levelEqTrigger/levelGtTrigger/powerLtTrigger/powerLteTrigger → 「そのシグニより低い/同じ/高い」のトリガー相対比較。
 *    ON_LEAVE_FIELD のトリガー元＝場を離れたカードなので、離れたカード基準で level/powerRange へ解決する
 *    （any_ally 監視では実行元が watcher シグニで triggeringCardNum が離脱カードにならないため、収集時に確定させる。WXEX2-51-E1）。
 *  levelEqFacedownRevealed → level:{この離脱で公開された裏向き付けカードのレベル}（§5.3 `O-81`・`WX16-003-E3`）。
 *    ⚠**ここで確定させるのが必須**＝`facedown_revealed_just` は次の離脱でクリアされる使い捨てマーカーなので、
 *      解決時まで持ち越すと外れる。参照不能なら `level:-1`＝候補ゼロ（過剰実行しない側に倒す）。
 */
export function resolveLeaveFieldDynamicFilters(
  cardMap: Map<string, CardData>,
  eff: CardEffect,
  leftCard: CardData | undefined,
  underCards: string[],
  revealedFacedown: string[] = [],
): CardEffect {
  if (!/"(levelBelowLeftCard|powerBelowLeftCard|underLeftCard|levelLtTrigger|levelEqTrigger|levelGtTrigger|powerLtTrigger|powerLteTrigger|levelEqFacedownRevealed)":true/.test(JSON.stringify(eff.action))) return eff;
  const clone = JSON.parse(JSON.stringify(eff)) as CardEffect;
  // 「**シグニ**を公開したとき、**そのカード**と同じレベルの」＝公開札が複数ある場合は
  // 条件（`FACEDOWN_REVEALED_JUST{cardType:'シグニ'}`）が見るのと同じ**最初のシグニ**を基準にする。
  const revealedBase = revealedFacedown.find(cn => cardMap.get(getCardNum(cn))?.Type === 'シグニ')
    ?? revealedFacedown[0] ?? '';
  const revealedLevel = parseInt(cardMap.get(getCardNum(revealedBase))?.Level ?? '', 10);
  const leftLevel = parseInt(leftCard?.Level ?? '', 10);
  const leftPower = parseInt((leftCard?.Power ?? '').replace(/[^\d]/g, ''), 10);
  const underNames = underCards
    .map(n => cardMap.get(getCardNum(n)))
    .filter((c): c is CardData => !!c && !(c.EffectText ?? '').includes('【ライズ】'))
    .map(c => c.CardName);
  const visit = (node: unknown): void => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const obj = node as Record<string, unknown> & TargetFilter;
    if (obj.levelBelowLeftCard === true) {
      delete obj.levelBelowLeftCard;
      obj.level = { max: isNaN(leftLevel) ? 0 : leftLevel - 1 };
    }
    if (obj.powerBelowLeftCard === true) {
      delete obj.powerBelowLeftCard;
      obj.powerRange = { max: isNaN(leftPower) ? 0 : leftPower - 1 };
    }
    // トリガー相対（「そのシグニより低い/高い」）＝離脱カード基準。resolveDynamicFilter も triggeringCardNum で解くが、
    // any_ally 監視では triggeringCardNum が離脱カードにならないため収集時に確定しておく（幂等：フラグを消すため二重解決しない）。
    if (obj.levelLtTrigger === true || obj.levelGtTrigger === true) {
      const gt = obj.levelGtTrigger === true;
      delete obj.levelLtTrigger; delete obj.levelGtTrigger;
      const base = isNaN(leftLevel) ? 0 : leftLevel;
      const prev = (typeof obj.level === 'object' && obj.level) ? obj.level : {};
      obj.level = { ...prev, ...(gt ? { min: base + 1 } : { max: base - 1 }) };
    }
    if (obj.levelEqTrigger === true) {
      delete obj.levelEqTrigger;
      obj.level = isNaN(leftLevel) ? 0 : leftLevel;
    }
    if (obj.powerLtTrigger === true || obj.powerLteTrigger === true) {
      const lte = obj.powerLteTrigger === true;
      delete obj.powerLtTrigger; delete obj.powerLteTrigger;
      obj.powerRange = { ...(obj.powerRange ?? {}), max: isNaN(leftPower) ? 0 : (lte ? leftPower : leftPower - 1) };
    }
    if (obj.underLeftCard === true) {
      delete obj.underLeftCard;
      obj.cardNames = underNames;
    }
    if (obj.levelEqFacedownRevealed === true) {
      delete obj.levelEqFacedownRevealed;
      obj.level = isNaN(revealedLevel) ? -1 : revealedLevel;
    }
    Object.values(obj).forEach(visit);
  };
  visit(clone.action);
  return clone;
}

/**
 * ON_LEAVE_FIELD トリガーを収集する（Stage2 抽出）。
 * 離れたカード自身の効果（scope=self）と、場の味方シグニ＋ルリグの効果（scope=any_ally。
 * triggerFilter があれば離れたカードがそれを満たす場合のみ）を集める。
 * leftUnder=離れたカードの下にあったカード（動的フィルタ解決用）。
 */
/**
 * ON_LEAVE_FIELD の `triggerCondition.leftToZone`（行き先限定）判定。
 * 素の 'hand' は既存6効果の互換表記で ['hand'] と同義。配列は OR（「手札に戻るかトラッシュに置かれたとき」）。
 * 省略時は行き先不問＝常に true。
 */
function leftToZoneOk(eff: CardEffect, ownerStateAfter: PlayerState, leftCardNum: string): boolean {
  const ltz = eff.triggerCondition?.leftToZone;
  if (!ltz) return true;
  const zones = typeof ltz === 'string' ? [ltz] : ltz;
  return zones.some(z => (z === 'hand' ? ownerStateAfter.hand : ownerStateAfter.trash).includes(leftCardNum));
}

export function collectLeaveFieldTriggers(
  ctx: TrigCtx,
  leftCardNum: string,
  leftUnder: string[],
  leftPlayerId: string,
  afterHostState: PlayerState,
  afterGuestState: PlayerState,
  // この離脱を引き起こした効果のオーナー userId（中央 diff の meta.causeOwnerId）。
  // undefined＝バトル/ルール処理など効果起因でない離脱＝byOwnEffect/byOpponentEffect/byEffect ゲート付き効果は発火しない。
  causeOwnerId?: string,
  // 離脱**直前**の盤面（離脱プレイヤーの before state）とゾーン添字。leftStateFilter（凍結/感染/チャーム等）評価用。
  // undefined＝バトル離脱など除去前 state 未渡し＝leftStateFilter 付き効果は保守的に非発火。
  leftBeforeState?: PlayerState,
  leftZoneIdx?: number,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  // leftStateFilter（離脱直前の状態限定）: 除去前 state とゾーンが渡っている場合のみ評価。無ければ保守的に非発火（false）。
  const leftStateOk = (filter: TargetFilter | undefined): boolean => {
    if (!filter) return true;
    if (!leftBeforeState || leftZoneIdx === undefined) return false;
    return matchesStateFilter(leftBeforeState, leftZoneIdx, filter);
  };
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const leftCard = ctx.cardMap.get(getCardNum(leftCardNum));
  const leftIsHost = leftPlayerId === ctx.hostId;
  const ownerStateAfter = leftIsHost ? afterHostState : afterGuestState;
  const otherStateAfter = leftIsHost ? afterGuestState : afterHostState;
  const selfLimitOk = mkLimitOk(ownerStateAfter.actions_done, leftIsHost ? usedHostIds : usedGuestIds);
  // self スコープ（このシグニ自身の離脱）視点のターン。turnOwner／leftStateFilter 判定に使う。
  const selfIsTurn = ctx.activeUserId === leftPlayerId;
  for (const eff of (ctx.effectsMap.get(getCardNum(leftCardNum)) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LEAVE_FIELD')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    // duringAttackPhase（「アタックフェイズの間、…が場を離れたとき」WX24-P3-053/WXK02-031 等）＝アタックフェイズ中の離脱のみ発火。
    if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
    // turnOwner（「対戦相手/あなたのターンの間、このシグニが場を離れたとき」WX20-071 等7効果）: 離脱カード所有者視点のターンで絞る。
    //   従来は self スコープ経路が turnOwner を評価せず相手ターン限定効果が自ターンにも過剰発火していた。
    {
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !selfIsTurn) continue;
      if (to === 'opponent' && selfIsTurn) continue;
    }
    // leftStateFilter（離脱直前の状態限定・「このシグニがアクセされていた場合」等）: 離脱カード自身のゾーンで評価。
    //   従来は self スコープ経路が未評価で無条件発火していた（WX20-071 の hasAcce ゲート）。
    if (!leftStateOk(eff.triggerCondition?.leftStateFilter)) continue;
    // 🔑**cause／フェイズ／行き先ゲートは self スコープでも面で評価する**（Opusタスク12 (clii)）。
    //   この collector の self ループは「watcher ループにはあるゲートが self には無い」穴を通算5回出した
    //   （`turnOwner`／`leftStateFilter`／`byOpponentEffect`／`outsideMainPhase`／`leftToZone`）。
    //   ⚠**ゲートが無い＝JSON に条件を足しても恒久 no-op**（条件が効かないまま過剰発火し、計器にも映らない）。
    // byOpponentEffect（「対戦相手の効果によってこのシグニが場を離れたとき」）:
    // self スコープでも、離脱原因がカード所有者の相手側の効果である場合だけ発火する。
    if (eff.triggerCondition?.byOpponentEffect && (causeOwnerId === undefined || causeOwnerId === leftPlayerId)) continue;
    // byOwnEffect（「あなたの効果によってこのシグニが場を離れたとき」）: 離脱カード所有者自身の効果が原因のときのみ
    //  （バトル・ルール処理・対戦相手の効果では発火しない）。
    if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== leftPlayerId) continue;
    // byEffect（「効果によってこのシグニが場を離れたとき」）: 任意の効果起因のみ（バトル/ルール処理では発火しない）。
    if (eff.triggerCondition?.byEffect && causeOwnerId === undefined) continue;
    // outsideMainPhase / duringMainPhase（「あなたのメインフェイズ以外で／の間、このシグニが場を離れたとき」
    //  `WXDi-P06-035-E1`／`WXDi-P13-053-E1`）: 離脱カード所有者視点のメインフェイズで絞る。
    if (!mainPhaseGateOk(eff, ctx, leftPlayerId)) continue;
    // leftToZone（「場から手札に戻ったとき」等の行き先限定）: watcher ループと同じ規約で self にも適用。
    if (!leftToZoneOk(eff, ownerStateAfter, leftCardNum)) continue;
    if (eff.condition && !evalUseCondition(eff.condition, ownerStateAfter, otherStateAfter, ctx.cardMap, leftCardNum, ctx.turnPhase, ctx.effectivePowers)) continue;
    if (!selfLimitOk(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: leftPlayerId, cardNum: leftCardNum, effectId: eff.effectId,
      label: `${leftCard?.CardName ?? leftCardNum} の【自】効果（場を離れたとき）`,
      effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder, ownerStateAfter.facedown_revealed_just ?? []),
      leftFieldUnderCards: [...leftUnder],
    });
  }
  // watcher（味方）視点のターン。turnOwner 条件（「対戦相手/あなたのターンの間」）判定に使う。
  const watcherIsTurn = ctx.activeUserId === leftPlayerId;
  const allyLimitOk = mkLimitOk(ownerStateAfter.actions_done, leftIsHost ? usedHostIds : usedGuestIds);
  // 場のシグニに加えてルリグも監視対象（例: 炎・花代・伍はルリグの【自】で味方シグニの離脱を見る）
  const lrigTop = ownerStateAfter.field.lrig.at(-1);
  const watcherNums = [
    ...ownerStateAfter.field.signi.flatMap(stack => stack?.length ? [stack[stack.length - 1]] : []),
    ...(lrigTop ? [lrigTop] : []),
  ];
  for (const topNum of watcherNums) {
    // センタールリグには付与ストア（effectsMap 非搭載）を合流させる（WX25-P2-049-E1
    // 「ターン終了時まで、このルリグは『【自】あなたのシグニ1体が場を離れたとき…』を得る」）。
    const watcherEffs = topNum === lrigTop
      ? [...(ctx.effectsMap.get(getCardNum(topNum)) ?? []),
         ...grantedStoreWatchers(ownerStateAfter, 'ON_LEAVE_FIELD', ['any_ally', 'any']).map(w => w.effect)]
      : (ctx.effectsMap.get(getCardNum(topNum)) ?? []);
    for (const eff of watcherEffs) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LEAVE_FIELD')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // duringAttackPhase（「アタックフェイズの間、あなたの＜X＞のシグニが場を離れたとき」WX24-P2-052/WX21-004/WXEX2-51）。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      if (eff.triggerFilter?.excludeSelf && leftCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0 && !matchesFilter(leftCard, restFilter)) continue;
      }
      // turnOwner（「あなた/対戦相手のターンの間」）: watcher 視点のターンで絞る（WX19-003/WX25-P1-034 等）
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !watcherIsTurn) continue;
      if (to === 'opponent' && watcherIsTurn) continue;
      // leftToZone（「場から手札に戻ったとき」WXK02-041／「手札に戻るかトラッシュに置かれたとき」WXDi-CP02-068-E1）:
      // 離れたカードが所有者の当該領域に在中する場合のみ発火。配列は OR。
      if (!leftToZoneOk(eff, ownerStateAfter, leftCardNum)) continue;
      // byOpponentEffect（「対戦相手の効果によって場を離れたとき」WX19-026）: 原因効果のオーナーが watcher の相手側のときのみ。
      if (eff.triggerCondition?.byOpponentEffect && causeOwnerId === undefined) continue;
      if (eff.triggerCondition?.byOpponentEffect && causeOwnerId === leftPlayerId) continue;
      // byEffect（「味方のシグニが効果によって場を離れたとき」）: 任意の効果起因のみ（バトル/ルール処理では発火しない）。
      if (eff.triggerCondition?.byEffect && causeOwnerId === undefined) continue;
      // byOwnEffect（「あなたの効果によってあなたのシグニが場を離れたとき」）: watcher 側（＝離脱カードと同陣営）の効果が原因のときのみ。
      if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== leftPlayerId) continue;
      // outsideMainPhase / duringMainPhase（watcher 所有者視点のメインフェイズ）。
      if (!mainPhaseGateOk(eff, ctx, leftPlayerId)) continue;
      // leftStateFilter（離脱直前の状態限定・凍結/感染/チャーム等）。
      if (!leftStateOk(eff.triggerCondition?.leftStateFilter)) continue;
      // usageLimit（《ターン1回/2回》）＝呼び出し側が usedHostIds/usedGuestIds を actions_done へ書き戻す（続き104 と同型）。
      if (eff.condition && !evalUseCondition(eff.condition, ownerStateAfter, otherStateAfter, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!allyLimitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: leftPlayerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（味方が場を離れたとき）`,
        effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder, ownerStateAfter.facedown_revealed_just ?? []),
        leftFieldUnderCards: [...leftUnder],
      });
    }
  }
  // 跨サイド any_opp（タスク16[C]機構③）: 「（あなたの効果によって）対戦相手のシグニが場を離れた/手札に戻ったとき」
  // ＝離脱したカードの**相手側**（＝効果を与えた側）の watcher（WXK11-049/WXDi-CP01-027-E2）。
  const oppId = leftIsHost ? ctx.guestId : ctx.hostId;
  const oppStateAfter = leftIsHost ? afterGuestState : afterHostState;
  const oppIsTurn = ctx.activeUserId === oppId;
  const oppLimitOk = mkLimitOk(oppStateAfter.actions_done, leftIsHost ? usedGuestIds : usedHostIds);
  const oppLrigTop = oppStateAfter.field.lrig.at(-1);
  const oppWatcherNums = [
    ...oppStateAfter.field.signi.flatMap(stack => stack?.length ? [stack[stack.length - 1]] : []),
    ...(oppLrigTop ? [oppLrigTop] : []),
  ];
  for (const topNum of oppWatcherNums) {
    for (const eff of (ctx.effectsMap.get(getCardNum(topNum)) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LEAVE_FIELD')) continue;
      if (eff.triggerScope !== 'any_opp' && eff.triggerScope !== 'any') continue;
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      if (eff.triggerFilter?.excludeSelf && leftCardNum === topNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0 && !matchesFilter(leftCard, restFilter)) continue;
      }
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !oppIsTurn) continue;
      if (to === 'opponent' && oppIsTurn) continue;
      if (!leftToZoneOk(eff, ownerStateAfter, leftCardNum)) continue;
      // byOwnEffect（「**あなたの効果によって**対戦相手のシグニが…」）: watcher 自身の効果が原因のときのみ
      // （バトル・ルール処理・相手自身の効果では発火しない）。
      if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== oppId) continue;
      // byEffect（「対戦相手のシグニが**効果によって**場を離れたとき」WXK11-017）: 任意の効果起因のみ（バトル/ルール処理では発火しない）。
      if (eff.triggerCondition?.byEffect && causeOwnerId === undefined) continue;
      // outsideMainPhase / duringMainPhase（watcher＝相手側所有者視点のメインフェイズ）。
      if (!mainPhaseGateOk(eff, ctx, oppId)) continue;
      // leftStateFilter（「対戦相手の**凍結状態の**シグニが場を離れたとき」WXEX1-30/WXDi-P03-040）: 離脱直前の状態で絞る。
      if (!leftStateOk(eff.triggerCondition?.leftStateFilter)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, oppStateAfter, ownerStateAfter, oppIsTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, oppStateAfter, ownerStateAfter, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!oppLimitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: oppId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（相手シグニが場を離れたとき）`,
        effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, eff, leftCard, leftUnder, ownerStateAfter.facedown_revealed_just ?? []),
        leftFieldUnderCards: [...leftUnder],
      });
    }
  }

  // INSTALL_DELAYED_TRIGGER: プレイヤーに設置された ON_LEAVE_FIELD watcher。
  // 設置者視点の leftOwner/triggerFilter を評価し、離脱カード基準の動的フィルタを収集時に確定する。
  // THIS_ATTACK_PHASE はフェイズ外では発火させない（BattleScreen の ATTACK_LRIG→END で
  // clearEndOfAttackPhaseDelayedTriggers を両プレイヤーへ適用して物理削除も行う）。
  for (const [controllerId, controllerState] of [
    [ctx.hostId, afterHostState],
    [ctx.guestId, afterGuestState],
  ] as const) {
    for (const dt of controllerState.delayed_triggers ?? []) {
      if (dt.trigger?.timing !== 'ON_LEAVE_FIELD') continue;
      if (dt.duration === 'THIS_ATTACK_PHASE' && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      const leftOwner = dt.trigger.leftOwner ?? 'any';
      const isOwnLeaver = controllerId === leftPlayerId;
      if (leftOwner === 'self' && !isOwnLeaver) continue;
      if (leftOwner === 'opponent' && isOwnLeaver) continue;
      if (dt.trigger.triggerFilter && !matchesFilter(leftCard, dt.trigger.triggerFilter)) continue;
      const delayedEffect: CardEffect = {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_LEAVE_FIELD'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      };
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
        label: `${dt.duration === 'THIS_ATTACK_PHASE' ? 'このアタックフェイズ' : 'このターン'}の遅延トリガー（場を離れたとき）`,
        effect: resolveLeaveFieldDynamicFilters(ctx.cardMap, delayedEffect, leftCard, leftUnder, ownerStateAfter.facedown_revealed_just ?? []),
        leftFieldUnderCards: [...leftUnder],
      });
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/** usageLimit（once/twice_per_turn）チェッカ。actionsDone（永続）＋used（今回の収集内）の出現回数で判定し、許可時は used に積む。 */
function mkLimitOk(actionsDone: string[] | undefined, used: string[]) {
  return (eff: CardEffect): boolean => {
    if (eff.usageLimit !== 'once_per_turn' && eff.usageLimit !== 'twice_per_turn') return true;
    const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
    const n = (actionsDone ?? []).filter(id => id === eff.effectId).length + used.filter(id => id === eff.effectId).length;
    if (n >= max) return false;
    used.push(eff.effectId);
    return true;
  };
}

/** 自分の場のシグニ（各ゾーン top）＋ルリグ top を発動元候補として返す。 */
function ownFieldSources(state: PlayerState): string[] {
  return [
    ...state.field.signi.flatMap(s => (s?.at(-1) ? [s.at(-1)!] : [])),
    ...(state.field.lrig.at(-1) ? [state.field.lrig.at(-1)!] : []),
  ];
}

/**
 * ON_DRAW（「カードを引いたとき」）の自分側トリガー（triggerScope:self）を収集する（Stage2 抽出）。
 * drawBySourceStory（原因が指定storyシグニの効果）・outsideDrawPhase（通常ドローで非発火）ゲートを評価。
 * 戻り値の usedOncePerTurnIds は呼び出し側で actions_done に反映する想定。
 */
export function collectDrawTriggers(
  ctx: TrigCtx,
  drawerId: string,
  drawerState: PlayerState,
  otherState: PlayerState,
  isDrawPhaseDraw = false,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isDrawerTurn = drawerId === ctx.activeUserId;
  const limitOk = mkLimitOk(drawerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(drawerState, otherState, isDrawerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = drawerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  // 🆕このターンの遅延トリガー（`WX24-P4-017-E3`「このターン、あなたがカードを1枚引くか…したとき」）。
  entries.push(...collectGenericDelayedTriggers(ctx, drawerId, drawerState, 'ON_DRAW'));
  for (const topNum of ownFieldSources(drawerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DRAW')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      // drawBySourceStory: このドローの原因が指定＜story＞シグニの効果である場合のみ発火（WX20-026-E3）。
      if (eff.triggerCondition?.drawBySourceStory) {
        const srcNum = drawerState.last_effect_draw_source;
        const srcCard = srcNum ? ctx.cardMap.get(srcNum) : undefined;
        if (!srcCard || srcCard.Type !== 'シグニ') continue;
        if (!(srcCard.CardClass ?? '').includes(eff.triggerCondition.drawBySourceStory)) continue;
      }
      // outsideDrawPhase: ドローフェイズの通常ドローでは発火しない（効果ドローのみ・WXDi-D09-P19 等）。
      if (eff.triggerCondition?.outsideDrawPhase && isDrawPhaseDraw) continue;
      // turnOwner（「あなたのターンの間、…引いたとき」WXK10-040）: drawer 視点のターンで絞る。
      const toDR = eff.triggerCondition?.turnOwner;
      if (toDR === 'self' && !isDrawerTurn) continue;
      if (toDR === 'opponent' && isDrawerTurn) continue;
      // duringAttackPhase（「アタックフェイズの間にあなたがカードをN枚以上引いたとき」WX11-030）。
      if (eff.triggerCondition?.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
      // drawByDrawerOwnEffect（「あなたの効果1つによってあなたが…引いたとき」WXK10-040）: 自分の効果による
      // ドローのみ（相手効果に引かされた場合・通常ドローでは発火しない。execDraw が記録する last_draw_by_own_effect）。
      if (eff.triggerCondition?.drawByDrawerOwnEffect && !drawerState.last_draw_by_own_effect) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, drawerState, otherState, isDrawerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, drawerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: drawerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（ドロー時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 対戦相手が（効果で）引いたとき（ON_DRAW triggerScope:any_opp）の反応側トリガーを収集する（Stage2 抽出）。
 * drawPhaseRestriction（main_attack/opp_attack）で位相を、turnOwner も評価。
 */
export function collectOppDrawTriggers(
  ctx: TrigCtx,
  reactorId: string,
  reactorState: PlayerState,
  drawerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const reactorIsTurn = reactorId === ctx.activeUserId;
  const ATTACK_PHASES = ['ATTACK_SIGNI', 'ATTACK_ARTS', 'ATTACK_ARTS_OP', 'ATTACK_LRIG'];
  const phase = ctx.turnPhase ?? '';
  const limitOk = mkLimitOk(reactorState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(reactorState, drawerState, reactorIsTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = reactorState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(reactorState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DRAW')) continue;
      if (eff.triggerScope !== 'any_opp') continue;
      const pr = eff.triggerCondition?.drawPhaseRestriction;
      if (pr === 'main_attack' && !(phase === 'MAIN' || ATTACK_PHASES.includes(phase))) continue;
      if (pr === 'opp_attack' && !(ATTACK_PHASES.includes(phase) && !reactorIsTurn)) continue;
      const to = eff.triggerCondition?.turnOwner;
      if (to === 'self' && !reactorIsTurn) continue;
      if (to === 'opponent' && reactorIsTurn) continue;
      // 「対戦相手が【自分の効果で】引いたとき」限定（PR-423）＝drawer が自身の効果で引いた場合のみ発火。
      // reactor 自身の効果で drawer を引かせた場合（drawer.last_draw_by_own_effect=false）は誤発火しない。
      if (eff.triggerCondition?.drawByDrawerOwnEffect && !drawerState.last_draw_by_own_effect) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, reactorState, drawerState, reactorIsTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, reactorState, drawerState, ctx.cardMap, topNum, phase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: reactorId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（対戦相手ドロー時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * デッキ→トラッシュ（ミル・ON_CARD_MILLED_FROM_DECK）トリガーを収集する（Stage2 抽出）。
 * milledDeckOwner（self/opponent/any）で発生源デッキを、milledMinCount でその解決単位の最低ミル枚数を判定。
 */
export function collectMillTriggers(
  ctx: TrigCtx,
  controllerId: string,
  controllerState: PlayerState,
  otherState: PlayerState,
  milledFromControllerDeck: number,
  milledFromOppDeck: number,
  milledControllerCards?: string[],
  milledOppCards?: string[],
  causeOwnerId?: string,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CARD_MILLED_FROM_DECK')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
      const owner = eff.triggerCondition?.milledDeckOwner ?? 'any';
      const minCount = eff.triggerCondition?.milledMinCount ?? 1;
      const relevantCards = owner === 'self' ? milledControllerCards
        : owner === 'opponent' ? milledOppCards
        : (milledControllerCards && milledOppCards ? [...milledControllerCards, ...milledOppCards] : undefined);
      if (eff.triggerCondition?.milledCardFilter && !relevantCards) continue;
      // フィルタに一致した**カードそのもの**を保持する（従来は件数だけ数えて捨てていた）。
      // 「あなたのデッキからレベル１のシグニ１枚がトラッシュに置かれたとき、**そのシグニ**を場に出す」
      // （`WXDi-P09-079-E1`）のように**ミルされたカードを後段が参照する**効果があるため。
      const matchedMill = eff.triggerCondition?.milledCardFilter
        ? relevantCards!.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerCondition!.milledCardFilter!))
        : undefined;
      const relevant = matchedMill
        ? matchedMill.length
        : owner === 'self' ? milledFromControllerDeck
        : owner === 'opponent' ? milledFromOppDeck
        : milledFromControllerDeck + milledFromOppDeck;
      if (relevant < minCount) continue;
      const turnOwner = eff.triggerCondition?.turnOwner;
      if (turnOwner === 'self' && !isControllerTurn) continue;
      if (turnOwner === 'opponent' && isControllerTurn) continue;
      if (!mainPhaseGateOk(eff, ctx, controllerId)) continue;
      // 発生源限定「あなたの＜X＞のシグニの効果１つによって」（powerDecreaseSourceStory と同型）。
      // last_effect_mill_source が無い経路は原因不明。原因限定付き効果は保守側へ倒して非発火。
      const reqMillStory = eff.triggerCondition?.milledSourceStory;
      if (reqMillStory) {
        const millSrc = (owner === 'opponent' ? otherState : controllerState).last_effect_mill_source;
        const source = millSrc ? ctx.cardMap.get(getCardNum(millSrc)) : undefined;
        if (!source || source.Type !== 'シグニ' || !(source.CardClass ?? '').includes(reqMillStory)) continue;
      }
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（デッキトラッシュ時）`, effect: eff,
        // 「そのシグニ」＝フィルタに一致してミルされたカード。⚠**`sourceCardNum`（＝能力ホスト `topNum`）とは別軸**
        //   なので、既存の `thisCardOnly`（ホスト自身を指す）効果には影響しない
        //   （この timing の live 16効果のうち triggerSource を読むものは 0＝投入前に全数確認済み）。
        ...(matchedMill && matchedMill.length > 0 ? { triggeringCardNum: matchedMill[0] } : {}),
      });
    }
  }
  // プレイヤーへゲーム中付与された AUTO 能力（アーツ等、解決後に場へ残らない発生源）も収集する。
  for (const eff of controllerState.game_granted_auto_effects ?? []) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CARD_MILLED_FROM_DECK')) continue;
    if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
    const owner = eff.triggerCondition?.milledDeckOwner ?? 'any';
    const minCount = eff.triggerCondition?.milledMinCount ?? 1;
    const relevantCards = owner === 'self' ? milledControllerCards
      : owner === 'opponent' ? milledOppCards
      : (milledControllerCards && milledOppCards ? [...milledControllerCards, ...milledOppCards] : undefined);
    if (eff.triggerCondition?.milledCardFilter && !relevantCards) continue;
    const relevant = eff.triggerCondition?.milledCardFilter
      ? relevantCards!.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerCondition!.milledCardFilter!)).length
      : owner === 'self' ? milledFromControllerDeck
      : owner === 'opponent' ? milledFromOppDeck
      : milledFromControllerDeck + milledFromOppDeck;
    if (relevant < minCount) continue;
    const turnOwner = eff.triggerCondition?.turnOwner;
    if (turnOwner === 'self' && !isControllerTurn) continue;
    if (turnOwner === 'opponent' && isControllerTurn) continue;
    if (!mainPhaseGateOk(eff, ctx, controllerId)) continue;
    if (eff.triggerCondition?.milledSourceStory) continue;
    if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, '')) continue;
    if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, '', ctx.turnPhase, ctx.effectivePowers)) continue;
    if (!limitOk(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: controllerId, cardNum: eff.effectId,
      effectId: eff.effectId, label: 'ゲーム中に得た【自】効果（デッキトラッシュ時）', effect: eff,
    });
  }
  // 🆕INSTALL_DELAYED_TRIGGER（§5.3 `O-73`・2026-08-26）＝「**このターン**、あなたの効果１つによって
  // デッキからカードが合計１枚以上トラッシュに置かれたとき、…」（`WX24-P3-030-E2`）。
  // 🔴**ここに収集経路が無いと「設置されるが永久に発火しない」**＝過剰実行を no-op へ替えるだけになるので、
  //   parser 側で遅延設置へ変換する前に**必ずこちらを先に足す**（登録票のブロッカーそのもの）。
  // ⚠**発火窓は「設置したプレイヤーのデッキ」が既定**（原文の「デッキから」は主語省略で自分のデッキ）。
  //   設置者は場に居るとは限らない（【起】を撃った後にそのシグニが場を離れてもよい）ので、
  //   場のソース走査ではなく `delayed_triggers` を直接読む。
  for (const dt of controllerState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== 'ON_CARD_MILLED_FROM_DECK') continue;
    const dtOwner = dt.trigger.milledDeckOwner ?? 'self';
    const dtMin = dt.trigger.milledMinCount ?? 1;
    const dtRelevant = dtOwner === 'self' ? milledFromControllerDeck
      : dtOwner === 'opponent' ? milledFromOppDeck
      : milledFromControllerDeck + milledFromOppDeck;
    if (dtRelevant < dtMin) continue;
    entries.push({
      id: ctx.genId(), playerId: controllerId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: 'このターンの遅延トリガー（デッキトラッシュ時）',
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_CARD_MILLED_FROM_DECK'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
    });
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 【チャーム】がトラッシュに置かれたとき（ON_CHARM_TO_TRASH）トリガーを収集する（Stage2 抽出）。
 * triggerScope（any=どちらの／any_ally=自分の／any_opp=相手の チャーム）で発生源を判定。
 * ⚠ 近似：同一解決で複数チャームがトラッシュに置かれても1回のみ発火。
 */
export function collectCharmToTrashTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  charmsFromControllerField: number, charmsFromOppField: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CHARM_TO_TRASH')) continue;
      const scope = eff.triggerScope ?? 'any';
      const relevant = scope === 'any_ally' ? charmsFromControllerField
        : scope === 'any_opp' ? charmsFromOppField
        : charmsFromControllerField + charmsFromOppField;
      if (relevant < (eff.triggerCondition?.minCount ?? 1)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（チャームトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 【マジックボックス】が表向きになったとき（ON_MAGIC_BOX_FLIPPED）のトリガーを収集する
 * （§6.4 A群・`WX24-P4-016-E3`）。
 *
 * ⚠**このカードの watcher は印字能力ではなく「そのターンだけ付与されるもの」**なので、
 *   場のカードの印字能力に加えて**付与ストア（`grantedStore.ts`）も必ず走査する**
 *   （§6.3 の教訓＝構造だけ直して付与ストアを見ないと恒久 no-op になる）。
 * ⚠`activeCondition`（「このターンのアタックフェイズの間」＝`DURING_ATTACK_PHASE`）は
 *   **`ctx.turnPhase` を渡さないと常に true** に倒れる＝必ず渡すこと。
 */
export function collectMagicBoxFlippedTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  flippedOnControllerField: number, flippedOnOppField: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  const relevantFor = (scope: string): number =>
    scope === 'any_ally' ? flippedOnControllerField
    : scope === 'any_opp' ? flippedOnOppField
    : flippedOnControllerField + flippedOnOppField;
  const accept = (eff: CardEffect, hostNum: string): boolean => {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_MAGIC_BOX_FLIPPED')) return false;
    if (relevantFor(eff.triggerScope ?? 'any') < (eff.triggerCondition?.minCount ?? 1)) return false;
    if (eff.activeCondition && !checkActiveCondition(
      eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap,
      hostNum, ctx.effectivePowers, undefined, ctx.turnPhase as TurnPhase)) return false;
    if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, hostNum, ctx.turnPhase, ctx.effectivePowers)) return false;
    return limitOk(eff);
  };
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (!accept(eff, topNum)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（マジックボックス公開時）`, effect: eff,
      });
    }
  }
  // 付与ストア（ルリグ付与2本＋プレイヤー付与）。この timing の実カードはこちら側から来る。
  for (const w of grantedStoreWatchers(controllerState, 'ON_MAGIC_BOX_FLIPPED', ['self', 'any_ally', 'any'])) {
    if (!accept(w.effect, w.cardNum)) continue;
    const cardName = ctx.cardMap.get(w.cardNum)?.CardName ?? w.cardNum;
    entries.push({
      id: ctx.genId(), playerId: controllerId, cardNum: w.cardNum, effectId: w.effect.effectId,
      label: `${cardName} の付与【自】効果（マジックボックス公開時）`, effect: w.effect,
    });
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 個別アタックの終了時（ON_ATTACK_END）トリガーを収集する（§6.3 J-4・WXK11-018-E2）。
 *
 * **アタック終了の定義**＝`BattleScreen.resolvePendingSigniBattleFor`（バトル解決 Phase2）の末尾
 * ＝バトル・バニッシュ・ライフクラッシュまで解決し終えた地点。ここで `dealtSigniDamage`（このアタックで
 * 相手ライフをクラッシュしたか）が確定しているので `triggerCondition.attackDealtNoDamage` を判定できる。
 * ⚠**近似**＝この後に走る【ライフバースト】の解決は「アタック終了」に含めない（バーストで盤面が変わっても
 *   判定はクラッシュ有無で確定済み＝この効果の意味では差が出ない）。
 * ⚠アタックしたシグニ自身の【自】だけを見る（`triggerScope:'self'` 相当）＝原文が「このシグニがアタックした
 *   アタック終了時」なので watcher＝アタッカー。
 */
export function collectAttackEndTriggers(
  ctx: TrigCtx, attackerId: string, attackerNum: string,
  attackerState: PlayerState, defenderState: PlayerState, dealtDamage: boolean,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isAttackerTurn = attackerId === ctx.activeUserId;
  const limitOk = mkLimitOk(attackerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(attackerState, defenderState, isAttackerTurn, ctx.effectsMap, ctx.cardMap, '自');
  if (attackerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  if (removed.has(attackerNum)) return { entries, usedOncePerTurnIds };
  for (const eff of (ctx.effectsMap.get(attackerNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ATTACK_END')) continue;
    if (eff.triggerCondition?.attackDealtNoDamage && dealtDamage) continue;
    if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, attackerState, defenderState, isAttackerTurn, ctx.cardMap, attackerNum)) continue;
    if (eff.condition && !evalUseCondition(eff.condition, attackerState, defenderState, ctx.cardMap, attackerNum, ctx.turnPhase, ctx.effectivePowers)) continue;
    if (!limitOk(eff)) continue;
    const cardName = ctx.cardMap.get(getCardNum(attackerNum))?.CardName ?? attackerNum;
    entries.push({
      id: ctx.genId(), playerId: attackerId, cardNum: attackerNum, effectId: eff.effectId,
      label: `${cardName} の【自】効果（アタック終了時）`, effect: eff, triggeringCardNum: attackerNum,
    });
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 他の能力が発動したとき（ON_ABILITY_ACTIVATED）トリガーを収集する（§6.3 J-1）。
 *
 * **発動の定義**＝effectStack から1件取り出して**解決を始める瞬間**（`BattleScreen.resolveStackNext` の
 * `shiftQueue` 直後）。スタック投入時ではなく解決開始時にしたのは、投入されても turnGate 等で落ちる
 * エントリを「発動した」と数えないため。⚠この funnel は `shiftQueue` の**唯一の呼び出し元**なので、
 * ここを押さえれば全経路（人間/CPU・【出】/【自】/LB）を1箇所でカバーできる。
 *
 * 限定は `triggerCondition.activatedAbility*`＝持ち主（self/opponent）・種別（【自】/【出】）・
 * 【英知】能力か・発動元が場のシグニか。
 * ⚠**発動した能力自身が ON_ABILITY_ACTIVATED の場合は無視する**（監視の連鎖・自己発火を作らない）。
 */
export function collectAbilityActivatedTriggers(
  ctx: TrigCtx, watcherId: string, watcherState: PlayerState, otherState: PlayerState,
  activated: { ownerId: string; effect: CardEffect; cardNum: string; ownerState: PlayerState },
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const act = activated.effect;
  if (!act || act.timing?.includes('ON_ABILITY_ACTIVATED')) return { entries, usedOncePerTurnIds };
  // 発動した能力の性質を先に確定させる（watcher ごとに再計算しない）。
  const isOnPlay = !!act.timing?.includes('ON_PLAY');
  const kind: 'AUTO' | 'ON_PLAY' | null = isOnPlay ? 'ON_PLAY' : act.effectType === 'AUTO' ? 'AUTO' : null;
  const hasEichi = (() => {
    const walk = (c: unknown): boolean => {
      if (!c || typeof c !== 'object') return false;
      const o = c as { type?: string; conditions?: unknown[] };
      if (o.type === 'EICHI_LEVEL_SUM') return true;
      return (o.conditions ?? []).some(walk);
    };
    return walk(act.activeCondition) || walk(act.condition);
  })();
  const fromFieldSigni = activated.ownerState.field.signi.some(s => s?.at(-1) === activated.cardNum);
  const isWatcherTurn = watcherId === ctx.activeUserId;
  const limitOk = mkLimitOk(watcherState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(watcherState, otherState, isWatcherTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(watcherState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ABILITY_ACTIVATED')) continue;
      // 自分自身の発動には反応しない（「他の能力」）。
      if (activated.effect.effectId === eff.effectId) continue;
      const tc = eff.triggerCondition ?? {};
      if (tc.activatedAbilityOwner === 'self' && activated.ownerId !== watcherId) continue;
      if (tc.activatedAbilityOwner === 'opponent' && activated.ownerId === watcherId) continue;
      if (tc.activatedAbilityKind && tc.activatedAbilityKind !== kind) continue;
      if (tc.activatedAbilityEichi && !hasEichi) continue;
      if (tc.activatedAbilityFromFieldSigni && !fromFieldSigni) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, isWatcherTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（能力発動時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 《コインアイコン》を得たとき（ON_COIN_GAINED）トリガーを収集する（§6.3 J-5・SP27-007-E1）。
 * 既存 `collectCoinPaidTriggers`（減少方向）の逆向き。watcher 側の場を走査し、
 * triggerScope で「あなたか対戦相手」（any＝既定）／「あなた」（self）／「対戦相手」（any_opp）を弁別する。
 * ⚠ 呼び出し側は**獲得枚数を直接渡す**（グロウは同じ差分に支払いが同居するため before/after 差では取りこぼす）。
 */
export function collectCoinGainedTriggers(
  ctx: TrigCtx, watcherId: string, watcherState: PlayerState, otherState: PlayerState,
  gainedBySelf: number, gainedByOpp: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (gainedBySelf <= 0 && gainedByOpp <= 0) return { entries, usedOncePerTurnIds };
  const isWatcherTurn = watcherId === ctx.activeUserId;
  const limitOk = mkLimitOk(watcherState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(watcherState, otherState, isWatcherTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(watcherState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_COIN_GAINED')) continue;
      const scope = eff.triggerScope ?? 'any';
      const relevant = scope === 'self' || scope === 'any_ally' ? gainedBySelf
        : scope === 'any_opp' ? gainedByOpp
        : gainedBySelf + gainedByOpp;
      if (relevant < (eff.triggerCondition?.minCount ?? 1)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, isWatcherTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（コイン獲得時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 【アクセ】がトラッシュに置かれたとき（ON_ACCE_TO_TRASH）トリガーを収集する（§6.3 J-2）。
 * collectCharmToTrashTriggers の【アクセ】版＝triggerScope（any/any_ally/any_opp）で発生源フィールドを判定し、
 * triggerCondition.minCount で「N枚がトラッシュに置かれたとき」の閾値を見る。
 * ⚠ 近似：同一解決で複数枚がトラッシュに置かれても1回のみ発火（チャーム版と同じ）。
 */
export function collectAcceToTrashTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  acceFromControllerField: number, acceFromOppField: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ACCE_TO_TRASH')) continue;
      const scope = eff.triggerScope ?? 'any';
      const relevant = scope === 'any_ally' || scope === 'self' ? acceFromControllerField
        : scope === 'any_opp' ? acceFromOppField
        : acceFromControllerField + acceFromOppField;
      if (relevant < (eff.triggerCondition?.minCount ?? 1)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（アクセトラッシュ時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 【ソウル】が付いたとき（ON_SOUL_ATTACHED）／カードが付いたとき（ON_CARD_ATTACHED）トリガーを収集する（§6.3 J-2）。
 * 付与先ホストのリストを受け取り、triggerScope で「このシグニに」（self＝ホスト＝トリガー元）と
 * 「あなたのシグニ1体に」（any_ally＝自分の場のどれか）を弁別する。
 * attachedHosts は `{ hostNum, count }`＝同一ホストに同一解決で複数枚付いた場合の枚数（ON_CARD_ATTACHED の minCount 用）。
 * ⚠ 自分の場の付与のみを見る（相手シグニへの付与に反応する効果は実データに無い）。
 */
export function collectAttachedTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  timing: 'ON_SOUL_ATTACHED' | 'ON_CARD_ATTACHED',
  attachedHosts: { hostNum: string; count: number }[],
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (attachedHosts.length === 0) return { entries, usedOncePerTurnIds };
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  const totalCount = attachedHosts.reduce((s, h) => s + h.count, 0);
  const label = timing === 'ON_SOUL_ATTACHED' ? 'ソウル付与時' : 'カード付与時';
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      // scope self＝「このシグニに」＝トリガー元自身が付与先の場合のみ。それ以外は自分の場の付与すべて。
      const scope = eff.triggerScope ?? 'self';
      const relevant = scope === 'self'
        ? attachedHosts.filter(h => h.hostNum === topNum).reduce((s, h) => s + h.count, 0)
        : totalCount;
      if (relevant < (eff.triggerCondition?.minCount ?? 1)) continue;
      if (eff.triggerFilter && !attachedHosts.some(h =>
        (scope === 'self' ? h.hostNum === topNum : true)
        && matchesFilter(ctx.cardMap.get(getCardNum(h.hostNum)), eff.triggerFilter))) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${label}）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * エナゾーン→トラッシュ時（ON_ENERGY_TO_TRASH）トリガーを収集する（Stage2 抽出）。
 * triggerCondition.energyTrashedOwner（self/opponent/any）で発生源エナを、causeOwnerId で原因主体を判定。
 */
export function collectEnergyToTrashTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  fromControllerEnergy: number, fromOppEnergy: number,
  // 行き先を問わない「エナゾーンから出て行った枚数」（`triggerCondition.energyLeftToAnyZone` 用）。
  // 省略時はトラッシュ枚数で代用＝従来挙動（フラグを持つ効果が無ければ差は出ない）。
  fromControllerEnergyAny?: number, fromOppEnergyAny?: number,
  causeOwnerId?: string,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  // フラグの有無で参照する枚数を切り替える（省略時は従来の trash 枚数へフォールバック）。
  const relevantCount = (eff: CardEffect): number => {
    const anyZone = !!eff.triggerCondition?.energyLeftToAnyZone;
    const ownCount = anyZone ? (fromControllerEnergyAny ?? fromControllerEnergy) : fromControllerEnergy;
    const oppCount = anyZone ? (fromOppEnergyAny ?? fromOppEnergy) : fromOppEnergy;
    const owner = eff.triggerCondition?.energyTrashedOwner ?? 'any';
    return owner === 'self' ? ownCount : owner === 'opponent' ? oppCount : ownCount + oppCount;
  };
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_TO_TRASH')) continue;
      if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
      if (relevantCount(eff) < (eff.triggerCondition?.minCount ?? 1)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（エナトラッシュ時）`, effect: eff,
      });
    }
  }
  // 起動効果でセンタールリグへ一時付与された AUTO 能力も同じイベントで収集する。
  // GRANT_LRIG_ABILITY の実行結果は effectsMap ではなく lrig_granted_auto_effects に格納されるため、
  // ここを走査しないと ON_ENERGY_TO_TRASH の内側能力（SPDi43-12）が timing を持っていても no-op になる。
  const lrigTop = controllerState.field.lrig.at(-1);
  if (lrigTop) {
    // 3ストア横断は `grantedStore.ts` の共通経路（lrig_abilities_disabled もそこで判定）。
    for (const eff of grantedStoreWatchers(controllerState, 'ON_ENERGY_TO_TRASH', ['self', 'any_ally', 'any']).map(w => w.effect)) {
      if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
      if (relevantCount(eff) <= 0) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, lrigTop)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, lrigTop, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: lrigTop, effectId: eff.effectId,
        label: `${ctx.cardMap.get(lrigTop)?.CardName ?? lrigTop} の【自】効果（エナトラッシュ時・付与能力）`, effect: eff,
      });
    }
  }
  // トラッシュにあるカード自身を場へ戻す自己トリガー（WD15-013-E1）だけを追加走査する。
  // action の構造で限定し、一般の ON_ENERGY_TO_TRASH をトラッシュから発火させない。
  for (const topNum of controllerState.trash) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_TO_TRASH')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self' || !actionRevivesSelfFromTrash(eff.action)) continue;
      if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
      if (relevantCount(eff) < (eff.triggerCondition?.minCount ?? 1)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（エナトラッシュ時・トラッシュから）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * いずれかのプレイヤーがリフレッシュしたとき（ON_REFRESH）トリガーを収集する（Stage2 抽出）。
 * triggerCondition.refreshedOwner（self/opponent/any）で発生源を判定。
 */
export function collectRefreshTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  refreshedByController: number, refreshedByOpp: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[]; firedOnceDelayed: boolean } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  let firedOnceDelayed = false;
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_REFRESH')) continue;
      if (!kizunaOk(ctx, eff, controllerState, topNum)) continue;
      const owner = eff.triggerCondition?.refreshedOwner ?? 'any';
      const relevant = owner === 'self' ? refreshedByController
        : owner === 'opponent' ? refreshedByOpp
        : refreshedByController + refreshedByOpp;
      if (relevant <= 0) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（リフレッシュ時）`, effect: eff,
      });
    }
  }
  // INSTALL_DELAYED_TRIGGER（B3）: controller に設置された「このターン、…がリフレッシュをした場合」
  // 遅延トリガーを収集する（WX11-024。refreshedOwner で発生源限定・省略=any）。
  for (const dt of controllerState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== 'ON_REFRESH') continue;
    const owner = dt.trigger.refreshedOwner ?? 'any';
    const relevant = owner === 'self' ? refreshedByController
      : owner === 'opponent' ? refreshedByOpp
      : refreshedByController + refreshedByOpp;
    if (relevant <= 0) continue;
    // 🆕`once`＝「そのターン**最初の**リフレッシュだけ」（`WX09-Re06`・§5.3 2026-08-27 Sheet1 B11）。
    //   実際に発火した回だけ true にして、呼び出し側（`collectBoardDiffTriggers`）が設置を消費する。
    //   ⚠**ここで消費しない**＝collector は pure（state を返さない）ため。
    if (dt.once) firedOnceDelayed = true;
    entries.push({
      id: ctx.genId(), playerId: controllerId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: 'このターンの遅延トリガー（リフレッシュ時）',
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_REFRESH'],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
    });
  }
  return { entries, usedOncePerTurnIds, firedOnceDelayed };
}

/**
 * 対戦相手のシグニのパワーが減ったとき（ON_OPP_POWER_DECREASED・毒牙）トリガーを収集する（Stage2 抽出）。
 * deltaFromOppPowerDecrease のとき delta を decreaseOnOpp で動的注入する。
 */
export function collectPowerDecreaseTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState, decreaseOnOpp: number,
  decreaseSources: string[] = [], causeOwnerId?: string,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (decreaseOnOpp <= 0) return { entries, usedOncePerTurnIds };
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_POWER_DECREASED')) continue;
      if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      // 発生源限定（「あなたの＜X＞のシグニの効果によって」「あなたの**他の**＜X＞のシグニの効果によって」）。
      // 🆕**fail-closed**（§6.4 O-44・2026-08-25）＝原因が特定できないときは**発火させない**。原文
      //   「あなたの＜毒牙＞のシグニの**効果によって**」は**原因の特定が意味の一部**なので、
      //   trashSourceStory / banishedSourceStory / milledSourceStory と同じ倒し方に揃えた。
      // ⚠ここが唯一 fail-open（不明なら発火）だった＝「毒牙以外の効果でパワーが減っても発火」する
      //   過剰トリガーの温床。発生源が刻まれない経路（POWER_MODIFY_PER_* / STUB 系）は
      //   `detectPowerDecreaseSources` が中央 diff の `causeSourceCardNum` へ寄せるので、
      //   ここへ来る '' （発生源不明）は実質「効果解決の外で減った」場合だけになる。
      const reqStory = eff.triggerCondition?.powerDecreaseSourceStory;
      const reqOther = eff.triggerCondition?.powerDecreaseExcludeSelf;
      if (reqStory || reqOther) {
        const ok = decreaseSources.some(src => {
          if (reqOther && src === topNum) return false;             // 「他の」＝自分自身の効果は発生源にならない
          if (!reqStory) return true;
          // 発生源は「あなたの」＝controller 側のカード。CardClass に指定クラスを含むシグニのみ。
          // src === '' （発生源不明）は CardClass も空＝ここで false になる＝fail-closed。
          const cls = ctx.cardMap.get(getCardNum(src))?.CardClass ?? '';
          return cls.includes(reqStory);
        });
        if (!ok) continue;
      }
      if (!limitOk(eff)) continue;
      // deltaFromOppPowerDecrease: 「減った値と同じだけ＋」を decreaseOnOpp で動的注入
      let resolvedEff = eff;
      const act = eff.action as PowerModifyAction;
      if (act?.type === 'POWER_MODIFY' && act.deltaFromOppPowerDecrease) {
        resolvedEff = { ...eff, action: { ...act, delta: decreaseOnOpp, deltaFromOppPowerDecrease: undefined } };
      }
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（相手パワー減少時）`, effect: resolvedEff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 他領域→デッキ移動時（ON_CARD_MOVED_TO_DECK）トリガーを収集する（Stage2 抽出）。
 * movedToDeckOwner（self/opponent/any）で宛先デッキを、movedToDeckMinCount で最低枚数を、
 * movedToDeckFromTrash で発生源をトラッシュに限定。
 */
export function collectMoveToDeckTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  movedToControllerDeck: number, movedToControllerDeckFromTrash: number, movedToOppDeck: number, causeOwnerId?: string,
  // §5.3 `O-116`＝**場から**デッキへ移った枚数（自分側／相手側）。省略時は 0＝
  // `movedToDeckFromField` を持つ効果は**発火しない**（fail-closed）。
  movedToControllerDeckFromField = 0, movedToOppDeckFromField = 0,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  const ownAutoBlocked = controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const topNum of ownFieldSources(controllerState)) {
    if (ownAutoBlocked) continue;
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_CARD_MOVED_TO_DECK')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (!effectCauseMatches(eff, controllerId, causeOwnerId)) continue;
      const owner = eff.triggerCondition?.movedToDeckOwner ?? 'any';
      const fromTrash = eff.triggerCondition?.movedToDeckFromTrash ?? false;
      // 🆕`movedToDeckFromField`（§5.3 `O-116`・`WX05-019-E3`「**場から**デッキに移動したとき」）。
      //   ⚠**由来限定は timing ごとに別実装で散る**ので、`fromTrash` と同じ読み方に揃える。
      const fromField = eff.triggerCondition?.movedToDeckFromField ?? false;
      const minCount = eff.triggerCondition?.movedToDeckMinCount ?? 1;
      const relevant = owner === 'self'
        ? (fromField ? movedToControllerDeckFromField : fromTrash ? movedToControllerDeckFromTrash : movedToControllerDeck)
        : owner === 'opponent' ? (fromField ? movedToOppDeckFromField : movedToOppDeck)
        : (fromField ? movedToControllerDeckFromField + movedToOppDeckFromField : movedToControllerDeck + movedToOppDeck);
      if (relevant < minCount) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（デッキ移動時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_SIGNI_FROZEN トリガーを収集する（Stage2 抽出）。frozenByOwner=各所有者と新規凍結シグニ番号。
 * 両プレイヤーの場シグニ/ルリグの【自】を triggerScope（any_opp 多数派/any_ally/any）で絞る。
 * triggeringCardNum に凍結シグニを渡す（targetsTriggerSource 用）。turnOwner/usageLimit も評価。
 */
export function collectFreezeTriggers(
  ctx: TrigCtx,
  frozenByOwner: { ownerId: string; nums: string[] }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    if (watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    for (const topNum of ownFieldSources(watcherState)) {
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_FROZEN')) continue;
        const scope = eff.triggerScope ?? 'any_opp';
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        for (const fz of frozenByOwner) {
          const frozenIsWatcherOwn = fz.ownerId === watcherId;
          if (scope === 'any_opp' && frozenIsWatcherOwn) continue;
          if (scope === 'any_ally' && !frozenIsWatcherOwn) continue;
          for (const frozenNum of fz.nums) {
            const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
              + usedIds.filter(id => id === eff.effectId).length;
            if (used >= max) break;
            if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
            const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
            entries.push({
              id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
              label: `${cardName} の【自】効果（凍結時）`, effect: eff, triggeringCardNum: frozenNum,
            });
          }
        }
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_SIGNI_DOWN / ON_SIGNI_BECOMES_UP トリガーを収集する（タスク16[C]機構①・collectFreezeTriggers と同型）。
 * changedByOwner＝各所有者と状態が変わったシグニ番号（byEffect＝効果起因か。アタックダウン＝false）。
 * lrigNum＝センタールリグがアップした場合のカード番号（ON_SIGNI_BECOMES_UP＋upIncludesLrig のみ反応・WX20-051）。
 * 評価軸: triggerScope（self/any_ally 既定/any）／triggerFilter（story・cardName 部分一致・excludeSelf）／
 *   triggerCondition.byEffect（「効果によって」＝アタック/コストのダウンでは発火しない・WX05-040 公式注釈）／
 *   triggerCondition.duringAttackPhase（「アタックフェイズの間」＝ctx.turnPhase が ATTACK_* のときのみ）。
 * watcher は場シグニ＋センタールリグ＋キー（WXK11-015 はキーカード自身の AUTO）。
 */
/**
 * このターンにダウンしたシグニを台帳（`signi_downed_this_turn`）へ積む（§6.4 O-11・`WX05-042`）。
 *
 * ⚠**ダウン検出の3経路すべてから呼ぶこと**＝中央 diff（効果ダウン）／`performSigniAttack`（アタックダウン）／
 *   `checkAndApplyContMutations`（常時効果ダウン）。1経路でも漏らすと「このターンでN回目」が永久に来ない。
 * ⚠**所有者ごとに積む**（自分のシグニがダウンした回数を数える条件なので、相手のダウンと混ぜない）。
 */
export function recordSigniDownedThisTurn(state: PlayerState, nums: string[]): PlayerState {
  if (nums.length === 0) return state;
  return { ...state, signi_downed_this_turn: [...(state.signi_downed_this_turn ?? []), ...nums] };
}

export function collectSigniDownUpTriggers(
  ctx: TrigCtx,
  event: 'ON_SIGNI_DOWN' | 'ON_SIGNI_BECOMES_UP',
  changedByOwner: { ownerId: string; nums: string[]; lrigNum?: string | null; byEffect: boolean }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const isAttackPhase = (ctx.turnPhase ?? '').startsWith('ATTACK');
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    if (watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const sources = [
      ...ownFieldSources(watcherState),
      ...activeKeyAbilitySources(watcherState),
    ];
    for (const topNum of sources) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(event)) continue;
        const scope = eff.triggerScope ?? 'any_ally';
        if (eff.triggerCondition?.duringAttackPhase && !isAttackPhase) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        for (const grp of changedByOwner) {
          const changedIsWatcherOwn = grp.ownerId === watcherId;
          if (scope === 'any_opp' && changedIsWatcherOwn) continue;
          if (scope === 'any_ally' && !changedIsWatcherOwn) continue;
          if (eff.triggerCondition?.byEffect && !grp.byEffect) continue;
          const changedNums = [
            ...grp.nums,
            ...(event === 'ON_SIGNI_BECOMES_UP' && eff.triggerCondition?.upIncludesLrig && grp.lrigNum ? [grp.lrigNum] : []),
          ];
          for (const changedNum of changedNums) {
            if (scope === 'self' && changedNum !== topNum) continue;
            if (eff.triggerFilter?.excludeSelf && changedNum === topNum) continue;
            if (eff.triggerFilter) {
              const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
              if (Object.keys(restFilter).length > 0
                && !matchesFilter(ctx.cardMap.get(getCardNum(changedNum)), restFilter, ctx.effectivePowers?.get(changedNum))) continue;
            }
            const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
              + usedIds.filter(id => id === eff.effectId).length;
            if (used >= max) break;
            if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
            const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
            entries.push({
              id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
              label: `${cardName} の【自】効果（${event === 'ON_SIGNI_DOWN' ? 'ダウン時' : 'アップ時'}）`, effect: eff, triggeringCardNum: changedNum,
            });
          }
        }
      }
    }
    // INSTALL_DELAYED_TRIGGER（§6.4 O-11・`WX05-042`）＝スペルがこのターンだけ設置した
    // 「あなたのメインフェイズの間、あなたの＜植物＞のシグニがダウンしたとき」型。
    // ⚠場のカードではなく `delayed_triggers` に住むので、上の source ループでは拾えない。
    // ⚠**発火条件（`fireCondition`）は収集時に評価する**＝満たさない回に entry を作ると
    //   `once` が空振りで消費される（「3回目である場合」が2回目で消えてしまう）。
    if (event === 'ON_SIGNI_DOWN') {
      for (const dt of watcherState.delayed_triggers ?? []) {
        if (dt.trigger?.timing !== 'ON_SIGNI_DOWN') continue;
        if (dt.trigger.duringOwnMainPhase && !(watcherIsTurn && (ctx.turnPhase ?? '') === 'MAIN')) continue;
        const wantOwner = dt.trigger.downedOwner ?? 'any';
        const matched = changedByOwner.some(grp => {
          const isOwn = grp.ownerId === watcherId;
          if (wantOwner === 'self' && !isOwn) return false;
          if (wantOwner === 'opponent' && isOwn) return false;
          const f = dt.trigger.triggerFilter;
          return grp.nums.some(num => !f
            || matchesFilter(ctx.cardMap.get(getCardNum(num)), f, ctx.effectivePowers?.get(num)));
        });
        if (!matched) continue;
        if (dt.fireCondition
          && !evalUseCondition(dt.fireCondition, watcherState, otherState, ctx.cardMap, dt.sourceCardNum ?? '', ctx.turnPhase, ctx.effectivePowers)) continue;
        entries.push({
          id: ctx.genId(), playerId: watcherId,
          cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
          label: 'このターンの遅延トリガー（シグニがダウンしたとき）',
          effect: {
            effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_SIGNI_DOWN'],
            action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
          },
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_HAND_ADDED トリガーを収集する（続き207・collectSigniDownUpTriggers と同型）。
 * addedByOwner＝手札が増えた各所有者と移動カード（from＝移動元ゾーン）。causeOwnerId＝原因効果のオーナー。
 * 評価軸: triggerCondition.handOwner（増えた手札の側・既定 self）／fromZones（移動元限定）／
 *   byOpponentEffect・byOwnEffect（原因効果のオーナー）／excludeGrowPhase（グロウフェイズ非発火）／turnOwner。
 *   triggerFilter＝移動カード側の filter（「シグニ1枚が」等）。発火は移動イベント単位（「1枚以上」＝枚数によらず1回）。
 * movedSelf:true の効果は場 watcher では発火せず、移動カード自身（手札に居る）の効果として別ループで発火する（WD12-009/010）。
 */
export function collectHandAddedTriggers(
  ctx: TrigCtx,
  addedByOwner: { ownerId: string; moved: { cardNum: string; from: string }[] }[],
  causeOwnerId: string,
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const isGrowPhase = ctx.turnPhase === 'GROW';
  const evalCommon = (eff: CardEffect, watcherId: string, watcherState: PlayerState, otherState: PlayerState, topNum: string): boolean => {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_ADDED')) return false;
    if (eff.triggerCondition?.excludeGrowPhase && isGrowPhase) return false;
    const to = eff.triggerCondition?.turnOwner;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    if (to === 'self' && !watcherIsTurn) return false;
    if (to === 'opponent' && watcherIsTurn) return false;
    if (eff.triggerCondition?.byOpponentEffect && causeOwnerId === watcherId) return false;
    if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== watcherId) return false;
    if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) return false;
    if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) return false;
    return true;
  };
  const matchingMoved = (eff: CardEffect, moved: { cardNum: string; from: string }[]): { cardNum: string; from: string }[] => {
    let list = moved;
    const fz = eff.triggerCondition?.fromZones;
    if (fz && fz.length > 0) list = list.filter(m => (fz as string[]).includes(m.from));
    if (eff.triggerFilter) list = list.filter(m => matchesFilter(ctx.cardMap.get(getCardNum(m.cardNum)), eff.triggerFilter!));
    return list;
  };
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    // ── 場の watcher（シグニ＋センタールリグ＋キー）──
    if (!watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) {
      const sources = [
        ...ownFieldSources(watcherState),
        ...activeKeyAbilitySources(watcherState),
      ];
      for (const topNum of sources) {
        for (const eff of effsOf(ctx, topNum)) {
          if (eff.triggerCondition?.movedSelf) continue; // 移動カード自身の変種は下のループで扱う
          if (!evalCommon(eff, watcherId, watcherState, otherState, topNum)) continue;
          const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
          for (const grp of addedByOwner) {
            if (grp.moved.length === 0) continue;
            const handIsWatcherOwn = grp.ownerId === watcherId;
            const ho = eff.triggerCondition?.handOwner ?? 'self';
            if (ho === 'self' && !handIsWatcherOwn) continue;
            if (ho === 'opponent' && handIsWatcherOwn) continue;
            if (matchingMoved(eff, grp.moved).length < (eff.triggerCondition?.minCount ?? 1)) continue;
            const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
              + usedIds.filter(id => id === eff.effectId).length;
            if (used >= max) break;
            if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
            const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
            entries.push({
              id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
              label: `${cardName} の【自】効果（手札移動時）`, effect: eff,
            });
          }
        }
      }
    }
    // ── 起動効果でセンタールリグへ一時付与された watcher ──
    // GRANT_LRIG_ABILITY の実行結果は effectsMap ではなく PlayerState の専用配列へ入る。
    // 通常の「このターン」付与と「次の相手ターン終了時まで」付与を両方走査しないと、
    // ON_HAND_ADDED の内側能力（WX25-P3-023-E2-GRANT）は構造が正しくても恒久 no-op になる。
    const lrigTop = watcherState.field.lrig.at(-1);
    if (lrigTop) {
      // 3ストア横断は `grantedStore.ts` の共通経路（lrig_abilities_disabled もそこで判定）。
      const granted = grantedStoreWatchers(watcherState, 'ON_HAND_ADDED', ['self', 'any_ally', 'any']).map(w => w.effect);
      for (const eff of granted) {
        if (eff.triggerCondition?.movedSelf) continue;
        if (!evalCommon(eff, watcherId, watcherState, otherState, lrigTop)) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        for (const grp of addedByOwner) {
          if (grp.moved.length === 0) continue;
          const handIsWatcherOwn = grp.ownerId === watcherId;
          const ho = eff.triggerCondition?.handOwner ?? 'self';
          if (ho === 'self' && !handIsWatcherOwn) continue;
          if (ho === 'opponent' && handIsWatcherOwn) continue;
          if (matchingMoved(eff, grp.moved).length < (eff.triggerCondition?.minCount ?? 1)) continue;
          const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) break;
          if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
          entries.push({
            id: ctx.genId(), playerId: watcherId, cardNum: lrigTop, effectId: eff.effectId,
            label: `${ctx.cardMap.get(getCardNum(lrigTop))?.CardName ?? lrigTop} の【自】効果（手札移動時・付与能力）`, effect: eff,
          });
        }
      }
    }
    // ── 移動カード自身の watcher（movedSelf・手札から発火＝WD12-009/010）──
    for (const grp of addedByOwner) {
      if (grp.ownerId !== watcherId) continue;
      for (const m of grp.moved) {
        for (const eff of effsOf(ctx, m.cardNum)) {
          if (!eff.triggerCondition?.movedSelf) continue;
          if (!evalCommon(eff, watcherId, watcherState, otherState, m.cardNum)) continue;
          if (matchingMoved(eff, [m]).length < (eff.triggerCondition?.minCount ?? 1)) continue;
          const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
          const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) continue;
          if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
          const cardName = ctx.cardMap.get(getCardNum(m.cardNum))?.CardName ?? m.cardNum;
          entries.push({
            id: ctx.genId(), playerId: watcherId, cardNum: m.cardNum, effectId: eff.effectId,
            label: `${cardName} の【自】効果（手札に移動）`, effect: eff, triggeringCardNum: m.cardNum,
          });
        }
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * `ON_TRASH_CARD_ADDED` トリガーを収集する（§6.4 O-37(c)・続き543・`collectHandAddedTriggers` と同型）。
 *
 * 原文＝「〈誰か〉の効果1つによって〈誰か〉のトラッシュにカードが合計N枚以上置かれたとき」
 * （`WX24-P3-007` がセンタールリグへ付与する【自】）。
 *
 * 評価軸: `triggerCondition.trashOwner`（増えたトラッシュの側・既定 self）／`minCount`（合計枚数）／
 *   `byOpponentEffect`・`byOwnEffect`（原因効果のオーナー）／`turnOwner`／`triggerFilter`（置かれたカード）。
 * 発火は**解決イベント単位**（「合計1枚以上」＝枚数によらず1回）。
 *
 * ⚠**印刷能力の走査と付与ストアの走査は必ず対**（`grantedStore.ts` の規約）。この timing の実カードは
 *   いま付与経由の1件だけなので、付与側を落とすと**構造が正しいのに恒久 no-op** になる。
 */
export function collectTrashAddedTriggers(
  ctx: TrigCtx,
  addedByOwner: { ownerId: string; nums: string[] }[],
  causeOwnerId: string | undefined,
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const evalCommon = (eff: CardEffect, watcherId: string, watcherState: PlayerState, otherState: PlayerState, topNum: string): boolean => {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRASH_CARD_ADDED')) return false;
    const to = eff.triggerCondition?.turnOwner;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    if (to === 'self' && !watcherIsTurn) return false;
    if (to === 'opponent' && watcherIsTurn) return false;
    if (eff.triggerCondition?.byOpponentEffect && (causeOwnerId === undefined || causeOwnerId === watcherId)) return false;
    if (eff.triggerCondition?.byOwnEffect && causeOwnerId !== watcherId) return false;
    if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) return false;
    if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) return false;
    return true;
  };
  const matchingCount = (eff: CardEffect, nums: string[]): number =>
    (eff.triggerFilter ? nums.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerFilter!)) : nums).length;
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const lrigTop = watcherState.field.lrig.at(-1);
    const sources: { topNum: string; eff: CardEffect; granted: boolean }[] = [];
    if (!watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) {
      for (const topNum of [...ownFieldSources(watcherState), ...activeKeyAbilitySources(watcherState)]) {
        for (const eff of effsOf(ctx, topNum)) sources.push({ topNum, eff, granted: false });
      }
    }
    if (lrigTop) {
      for (const w of grantedStoreWatchers(watcherState, 'ON_TRASH_CARD_ADDED', ['self', 'any_ally', 'any'])) {
        sources.push({ topNum: lrigTop, eff: w.effect, granted: true });
      }
    }
    for (const { topNum, eff, granted } of sources) {
      if (!evalCommon(eff, watcherId, watcherState, otherState, topNum)) continue;
      const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
      for (const grp of addedByOwner) {
        if (grp.nums.length === 0) continue;
        const trashIsWatcherOwn = grp.ownerId === watcherId;
        const owner = eff.triggerCondition?.trashOwner ?? 'self';
        if (owner === 'self' && !trashIsWatcherOwn) continue;
        if (owner === 'opponent' && trashIsWatcherOwn) continue;
        if (matchingCount(eff, grp.nums) < (eff.triggerCondition?.minCount ?? 1)) continue;
        const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
          + usedIds.filter(id => id === eff.effectId).length;
        if (used >= max) break;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（トラッシュに置かれたとき${granted ? '・付与能力' : ''}）`, effect: eff,
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_ENERGY_CHARGE の movedSelf AUTO と、原因主体限定を持つ場の watcher を収集する。
 * 原因限定のない場 watcher は従来の React watcher が担当する。
 */
export function collectEnergyAddedSelfTriggers(
  ctx: TrigCtx,
  addedByOwner: { ownerId: string; moved: { cardNum: string; from: string }[] }[],
  causeOwnerId: string | undefined,
  causeSourceCardNum: string | undefined,
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const sourceType = causeSourceCardNum
    ? ctx.cardMap.get(getCardNum(causeSourceCardNum))?.Type
    : undefined;
  for (const grp of addedByOwner) {
    const ownerIsHost = grp.ownerId === ctx.hostId;
    const ownerState = ownerIsHost ? hostState : guestState;
    const otherState = ownerIsHost ? guestState : hostState;
    const usedIds = ownerIsHost ? usedHostIds : usedGuestIds;
    for (const moved of grp.moved) {
      for (const eff of effsOf(ctx, moved.cardNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_CHARGE')) continue;
        if (!eff.triggerCondition?.movedSelf) continue;
        const fromZones = eff.triggerCondition.fromZones;
        if (fromZones?.length && !(fromZones as string[]).includes(moved.from)) continue;
        if (eff.triggerCondition.duringAttackPhase && !(ctx.turnPhase ?? '').startsWith('ATTACK')) continue;
        if (!effectCauseMatches(eff, grp.ownerId, causeOwnerId)) continue;
        // 「ルリグかシグニの効果によって」＝ルール上のルリグ／シグニ全種。CardData.Type は
        // 'アシストルリグ'（340枚）と 'レゾナ'（46枚）を別値で持つため、この2つを落とすと過小実行になる
        // （アシストルリグはルリグ、レゾナはシグニ。既存の判定も 'ルリグ' || 'アシストルリグ' を並記している
        //  ＝execStubPart1.ts:3594 / execStubPart3.ts:1137）。原因不明・スペル・アーツ・ルール処理では発火しない。
        if (eff.triggerCondition.byLrigOrSigniEffect
            && sourceType !== 'ルリグ' && sourceType !== 'アシストルリグ'
            && sourceType !== 'シグニ' && sourceType !== 'レゾナ') continue;
        const ownerIsTurn = grp.ownerId === ctx.activeUserId;
        if (eff.triggerCondition.turnOwner === 'self' && !ownerIsTurn) continue;
        if (eff.triggerCondition.turnOwner === 'opponent' && ownerIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, ownerState, otherState, ownerIsTurn, ctx.cardMap, moved.cardNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, ownerState, otherState, ctx.cardMap, moved.cardNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        const used = (ownerState.actions_done ?? []).filter(id => id === eff.effectId).length
          + usedIds.filter(id => id === eff.effectId).length;
        if (used >= max) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
        const cardName = ctx.cardMap.get(getCardNum(moved.cardNum))?.CardName ?? moved.cardNum;
        entries.push({
          id: ctx.genId(), playerId: grp.ownerId, cardNum: moved.cardNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（エナゾーン移動時）`, effect: eff, triggeringCardNum: moved.cardNum,
        });
      }
    }
    if (grp.moved.length !== 1) continue;
    for (const topNum of ownFieldSources(ownerState)) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_CHARGE')) continue;
        if (eff.triggerCondition?.movedSelf) continue;
        const causeLimited = !!(eff.triggerCondition?.byOwnEffect || eff.triggerCondition?.byOpponentEffect || eff.triggerCondition?.byEffect);
        if (!causeLimited || !effectCauseMatches(eff, grp.ownerId, causeOwnerId)) continue;
        const ownerIsTurn = grp.ownerId === ctx.activeUserId;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, ownerState, otherState, ownerIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, ownerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        const used = (ownerState.actions_done ?? []).filter(id => id === eff.effectId).length
          + usedIds.filter(id => id === eff.effectId).length;
        if (used >= max) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
        entries.push({
          id: ctx.genId(), playerId: grp.ownerId, cardNum: topNum, effectId: eff.effectId,
          label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（エナチャージ時・原因限定）`,
          effect: eff, triggeringCardNum: grp.moved[0].cardNum,
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_ENERGY_TO_FIELD トリガーを収集する（続き207・WXDi-P11-007-E1「エナゾーンからシグニ1枚が…場に出たとき」枝）。
 * placedByOwner＝エナから場に出たシグニの各所有者。timing 併記（ON_HAND_ADDED とのOR）を想定し評価軸は同じ
 * triggerCondition（turnOwner）／triggerFilter（出たシグニの filter）を使う。手札枝と同一 usageLimit を
 * 共有するため、呼び出し側は collectHandAddedTriggers の usedIds を反映してから呼ぶこと。
 */
export function collectEnergyToFieldTriggers(
  ctx: TrigCtx,
  placedByOwner: { ownerId: string; nums: string[] }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    if (watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const sources = [
      ...ownFieldSources(watcherState),
      ...activeKeyAbilitySources(watcherState),
    ];
    for (const topNum of sources) {
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ENERGY_TO_FIELD')) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        const max = eff.usageLimit === 'once_per_turn' ? 1 : eff.usageLimit === 'twice_per_turn' ? 2 : Infinity;
        for (const grp of placedByOwner) {
          // 「あなたのエナゾーンから」＝自分側の配置のみ（該当カードは自エナ限定。相手側の配置では発火しない）
          if (grp.ownerId !== watcherId) continue;
          const nums = eff.triggerFilter
            ? grp.nums.filter(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), eff.triggerFilter!))
            : grp.nums;
          if (nums.length === 0) continue;
          const used = (watcherState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) break;
          if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') usedIds.push(eff.effectId);
          const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
          entries.push({
            id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
            label: `${cardName} の【自】効果（エナから場に出たとき）`, effect: eff, triggeringCardNum: nums[0],
          });
        }
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_LIFE_CLOTH_ADDED を収集する。ライフが増えた側自身の場（シグニ／ルリグ／キー）の watcher のみを走査する。
 * turnOwner・condition・usageLimit は既存の中央 diff コレクタと同じ順序で評価する。
 */
export function collectLifeClothAddedTriggers(
  ctx: TrigCtx,
  addedByOwner: { ownerId: string; nums: string[] }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    const added = addedByOwner.find(g => g.ownerId === watcherId)?.nums ?? [];
    // 対象2枚はいずれも「カード1枚が加えられたとき」＝1枚ちょうど。複数枚同時追加は発火しない。
    if (added.length !== 1) continue;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const limitOk = mkLimitOk(watcherState.actions_done, usedIds);
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const sources = [
      ...ownFieldSources(watcherState),
      ...activeKeyAbilitySources(watcherState),
    ];
    for (const topNum of sources) {
      const isSigni = watcherState.field.signi.some(s => s?.at(-1) === topNum);
      if (isSigni && watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LIFE_CLOTH_ADDED')) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（ライフクロス追加時）`, effect: eff, triggeringCardNum: added[0],
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_SIGNI_CRASHED_LIFE_TOTAL＝「このシグニが1ターンにライフクロスを合計N枚以上クラッシュしたとき」
 * （WX05-020-E1）。**単発イベントではなく累計**で判定するため、呼び出し側は
 * `controllerState.life_crashed_by_signi_this_turn[signiNum]`（＝加算後の合計）を `total` に渡す。
 *
 * ⚠ triggerScope は self 固定＝反応するのは**クラッシュした当のシグニ自身**（原文「このシグニが」）。
 *   場に居ないシグニ（クラッシュ後に離場した等）は候補にならない＝ownFieldSources で自然に落ちる。
 * ⚠ 「合計N枚以上」なので閾値到達後もアタックが続けば毎回条件を満たすが、
 *   usageLimit（《ターン1回》）が実質の重複排除になる（原文もそうなっている）。
 */
export function collectSigniCrashTotalTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  signiNum: string, total: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (!signiNum || total <= 0) return { entries, usedOncePerTurnIds };
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  if (controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  if (removed.has(signiNum)) return { entries, usedOncePerTurnIds };
  // 「このシグニが」＝当のシグニが場に居ることが前提（スタック頂点のみ）。
  if (!ownFieldSources(controllerState).includes(signiNum)) return { entries, usedOncePerTurnIds };
  for (const eff of (ctx.effectsMap.get(signiNum) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_CRASHED_LIFE_TOTAL')) continue;
    if (total < (eff.triggerCondition?.crashedTotalThisTurn ?? 1)) continue;
    if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, signiNum)) continue;
    if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, signiNum, ctx.turnPhase, ctx.effectivePowers)) continue;
    if (!limitOk(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: controllerId, cardNum: signiNum, effectId: eff.effectId,
      label: `${ctx.cardMap.get(getCardNum(signiNum))?.CardName ?? signiNum} の【自】効果（ライフクロス累計クラッシュ）`,
      effect: eff,
    });
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_HAND_OR_ENERGY_LOST_BY_OPP＝「**対戦相手の効果1つによって**、あなたの手札が1枚以上捨てられるか
 * あなたのエナゾーンからカードが1枚以上トラッシュに置かれたとき」（WXDi-P13-051-E3）。
 *
 * ⚠**2経路の OR を1つの collector で見るのが要点**＝原文の「効果1つによって」は、1回の解決で手札捨てと
 *   エナトラッシュが**両方**起きても発火は1度だけ、という意味。手札捨ては React watcher（hand_discarded_just）、
 *   エナトラッシュは中央 diff と収集経路が分かれているため、別々の timing に割ると同じ解決で2回積まれる
 *   （実在する＝WXK02-004／WXDi-P10-003／WXDi-P13-003A は1効果で両方やる）。そこで**中央 diff だけで
 *   両方を数え**、entries を1本に畳む。
 * @param handDiscarded 対象プレイヤーの手札→トラッシュ枚数（この解決内）
 * @param energyTrashed 対象プレイヤーのエナ→トラッシュ枚数（この解決内）
 * @param byOppEffect   原因が対戦相手の効果か（causeOwnerId ≠ 対象プレイヤー）。false なら発火しない
 */
export function collectOppResourceLossTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState, otherState: PlayerState,
  handDiscarded: number, energyTrashed: number, byOppEffect: boolean,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (!byOppEffect) return { entries, usedOncePerTurnIds };
  const isControllerTurn = controllerId === ctx.activeUserId;
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  if (controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const removed = collectContinuousAbilitiesRemovedSigni(controllerState, otherState, isControllerTurn, ctx.effectsMap, ctx.cardMap, '自');
  for (const topNum of ownFieldSources(controllerState)) {
    if (removed.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_OR_ENERGY_LOST_BY_OPP')) continue;
      const minCount = eff.triggerCondition?.minCount ?? 1;
      // どちらか一方でも閾値に達していれば発火（OR）。両方起きても entry は1つ＝この1回の走査で畳まれる。
      if (handDiscarded < minCount && energyTrashed < minCount) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, controllerState, otherState, isControllerTurn, ctx.cardMap, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, controllerState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum} の【自】効果（相手効果による手札／エナ喪失時）`,
        effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/** ON_LIFE_CLOTH_MOVED を宛先・owner・到達枚数で収集する。 */
export function collectLifeClothMovedTriggers(
  ctx: TrigCtx,
  movedByOwner: { ownerId: string; moved: { cardNum: string; to: 'trash' | 'hand' | 'energy' | 'deck' | 'other' }[]; beforeCount: number; afterCount: number }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const limitOk = mkLimitOk(watcherState.actions_done, usedIds);
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const sources = [
      ...ownFieldSources(watcherState),
      ...activeKeyAbilitySources(watcherState),
    ];
    for (const topNum of sources) {
      const isSigni = watcherState.field.signi.some(s => s?.at(-1) === topNum);
      if (isSigni && watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LIFE_CLOTH_MOVED')) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        for (const event of movedByOwner) {
          const owner = event.ownerId === watcherId ? 'self' : 'opponent';
          const wantedOwner = eff.triggerCondition?.lifeMovedOwner ?? 'self';
          if (wantedOwner !== 'any' && wantedOwner !== owner) continue;
          const reached = eff.triggerCondition?.lifeCountReached;
          if (reached !== undefined && !(event.beforeCount !== reached && event.afterCount === reached)) continue;
          const destinations = eff.triggerCondition?.lifeMovedTo;
          const matching = destinations ? event.moved.filter(m => destinations.includes(m.to)) : event.moved;
          if (matching.length === 0 || !limitOk(eff)) continue;
          const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
          entries.push({
            id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
            label: `${cardName} の【自】効果（ライフクロス移動時）`, effect: eff,
            triggeringCardNum: matching[0].cardNum,
          });
        }
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_OPP_ENERGY_ADDED を収集する。watcher から見た対戦相手のエナが1枚ちょうど増えたイベントだけを扱い、
 * 置かれたカードを triggeringCardNum に保持する（WX24-P2-050「そのカード」）。
 */
export function collectOppEnergyAddedTriggers(
  ctx: TrigCtx,
  addedByOwner: { ownerId: string; nums: string[] }[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  for (const watcherIsHost of [true, false]) {
    const watcherId = watcherIsHost ? ctx.hostId : ctx.guestId;
    const opponentId = watcherIsHost ? ctx.guestId : ctx.hostId;
    const watcherState = watcherIsHost ? hostState : guestState;
    const otherState = watcherIsHost ? guestState : hostState;
    const added = addedByOwner.find(g => g.ownerId === opponentId)?.nums ?? [];
    if (added.length !== 1) continue;
    const usedIds = watcherIsHost ? usedHostIds : usedGuestIds;
    const limitOk = mkLimitOk(watcherState.actions_done, usedIds);
    const watcherIsTurn = watcherId === ctx.activeUserId;
    const sources = [
      ...ownFieldSources(watcherState),
      ...activeKeyAbilitySources(watcherState),
    ];
    for (const topNum of sources) {
      const isSigni = watcherState.field.signi.some(s => s?.at(-1) === topNum);
      if (isSigni && watcherState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) continue;
      for (const eff of effsOf(ctx, topNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_ENERGY_ADDED')) continue;
        const to = eff.triggerCondition?.turnOwner;
        if (to === 'self' && !watcherIsTurn) continue;
        if (to === 'opponent' && watcherIsTurn) continue;
        if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, watcherState, otherState, watcherIsTurn, ctx.cardMap, topNum)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, watcherState, otherState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: watcherId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（相手エナ追加時）`, effect: eff, triggeringCardNum: added[0],
        });
      }
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * 自分側イベント（ON_LIFE_CRASHED / ON_GUARD / ウィルス系）に反応する自フィールド/ルリグ/キーの AUTO を収集する（Stage2 抽出）。
 * FROZEN_LOSES_ABILITIES（相手ルリグ常在）・CONTINUOUS REMOVE_ABILITIES・トラッシュ自己復活（ON_LIFE_CRASHED）も処理。
 * usedOncePerTurnIds は呼び出し側で actions_done に追加して保存すること。
 */
export function collectSelfEventTriggers(
  ctx: TrigCtx,
  timing: 'ON_LIFE_CRASHED' | 'ON_GUARD' | 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' | 'ON_OPP_VIRUS_PLACED' | 'ON_OPP_VIRUS_REMOVED' | 'ON_OPP_VIRUS_CHANGED',
  myState: PlayerState,
  opState: PlayerState,
  labelSuffix: string,
  ownerId: string,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const limitOk = mkLimitOk(myState.actions_done, usedOncePerTurnIds);
  const containsSelfTrashExile = (action: CardEffect['action']): boolean => {
    const a = action as unknown as Record<string, unknown>;
    if (a.type === 'STUB' && a.id === 'BANISH_FROM_GAME') return true;
    if (Array.isArray(a.steps)) return (a.steps as CardEffect['action'][]).some(containsSelfTrashExile);
    if (a.then && typeof a.then === 'object') return containsSelfTrashExile(a.then as CardEffect['action']);
    return false;
  };
  if (myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  // FROZEN_LOSES_ABILITIES: 相手ルリグにこの常在があれば自分の凍結シグニのAUTOは発火しない
  const opLrigTop = opState.field.lrig.at(-1);
  const frozenLosesAbilities = opLrigTop
    ? (ctx.effectsMap.get(opLrigTop) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as StubAction)?.type === 'STUB' &&
        (e.action as StubAction)?.id === 'FROZEN_LOSES_ABILITIES',
      )
    : false;
  const isOwnerTurnForSelfTrigger = ownerId === ctx.activeUserId;
  const myAbilitiesRemovedSelf = collectContinuousAbilitiesRemovedSigni(myState, opState, isOwnerTurnForSelfTrigger, ctx.effectsMap, ctx.cardMap, '自');
  for (let zi = 0; zi < myState.field.signi.length; zi++) {
    const topNum = myState.field.signi[zi]?.at(-1);
    if (!topNum) continue;
    if (frozenLosesAbilities && (myState.field.signi_frozen?.[zi] ?? false)) continue;
    if (myAbilitiesRemovedSelf.has(topNum)) continue;
    for (const eff of ctx.effectsMap.get(topNum) ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if (timing === 'ON_GUARD' && eff.triggerCondition?.lrigAttackGuarded) continue;
      // 🆕`O-64`：「対戦相手のアタックフェイズの間、あなたのライフクロスがクラッシュされたとき」
      //   （`WDK17-009-E1`）＝フェイズ側はここ、ターン主側は中央の `turnGateOk`（`turnOwner`）が見る。
      if (!attackPhaseGateOk(eff, ctx)) continue;
      if (!mainPhaseGateOk(eff, ctx, ownerId)) continue;
      if (timing === 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' && containsSelfTrashExile(eff.action)) continue;
      // トラッシュからの自己復活（ADD_TO_FIELD source:TRASH_CARD で自身を出す）はトラッシュ専用＝場走査では除外。
      {
        const fAct = eff.action as AddToFieldAction;
        const selfName = ctx.cardMap.get(topNum)?.CardName;
        if (fAct.type === 'ADD_TO_FIELD' && fAct.source?.type === 'TRASH_CARD'
          && selfName && fAct.source.filter?.cardName && selfName.includes(fAct.source.filter.cardName)) {
          continue;
        }
      }
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }
  // ルリグ／アシストルリグ／キーの自イベントトリガー（シグニ以外の発生源）
  const nonSigniSources = [
    myState.field.lrig.at(-1),
    myState.field.assist_lrig_l?.at(-1),
    myState.field.assist_lrig_r?.at(-1),
    ...activeKeyAbilitySources(myState),
  ].filter((n): n is string => !!n);
  const selfEventLrigTop = myState.field.lrig.at(-1);
  for (const srcNum of nonSigniSources) {
    // センタールリグには付与ストア（effectsMap に載らない実行時付与）を合流させる。
    // 「あなたのライフがクラッシュされたとき」等はプレイヤー自身が主語なので scope は self。
    // 外すと WXDi-P12-030-E2（レイラ・ザ・クラック）が構造どおりでも恒久 no-op になる。
    const srcEffects = srcNum === selfEventLrigTop
      ? [...(ctx.effectsMap.get(srcNum) ?? []), ...grantedStoreWatchers(myState, timing, ['self']).map(w => w.effect)]
      : (ctx.effectsMap.get(srcNum) ?? []);
    for (const eff of srcEffects) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if (timing === 'ON_GUARD' && eff.triggerCondition?.lrigAttackGuarded) continue;
      if (!attackPhaseGateOk(eff, ctx)) continue;                 // `O-64`（シグニ側と対称）
      if (!mainPhaseGateOk(eff, ctx, ownerId)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(srcNum)?.CardName ?? srcNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: srcNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }
  // トラッシュからの自己復活（WX11-026 ヘスチア等）：ADD_TO_FIELD source:TRASH_CARD の AUTO のみ対象。
  if (timing === 'ON_LIFE_CRASHED') {
    for (const trashInstance of myState.trash) {
      for (const eff of ctx.effectsMap.get(trashInstance) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        const act = eff.action as AddToFieldAction;
        if (act.type !== 'ADD_TO_FIELD' || act.source?.type !== 'TRASH_CARD') continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(trashInstance)?.CardName ?? trashInstance;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: trashInstance, effectId: eff.effectId,
          label: `${cardName} の【自】効果（${labelSuffix}・トラッシュから復活）`, effect: eff,
        });
      }
    }
  }
  // トラッシュにある自身を任意でゲームから除外することが後続効果の条件になる能力。
  // timing だけ一致する一般のトラッシュカードは拾わず、発生源ゾーンを明記する action に限定する。
  if (timing === 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT' || timing === 'ON_GUARD') {
    for (const trashInstance of myState.trash) {
      for (const eff of ctx.effectsMap.get(trashInstance) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing) || !containsSelfTrashExile(eff.action)) continue;
        if (eff.condition && !evalUseCondition(eff.condition, myState, opState, ctx.cardMap, trashInstance, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(trashInstance)?.CardName ?? trashInstance;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: trashInstance, effectId: eff.effectId,
          label: `${cardName} の【自】効果（${timing === 'ON_GUARD' ? 'ガード時' : 'シグニアタック無効時'}・トラッシュ）`, effect: eff,
        });
      }
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * 《トラップアイコン》が実際に発動し、そのアイコン効果の解決が完了したときの watcher を収集する。
 * 場のシグニ/ルリグに加え、「このカード/シグニをトラッシュから戻す」効果だけはトラッシュ自身から発火する。
 */
export function collectTrapActivateTriggers(
  ctx: TrigCtx,
  ownerId: string,
  ownerState: PlayerState,
  otherState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const used = ownerId === ctx.hostId ? usedHostIds : usedGuestIds;
  const limitOk = mkLimitOk(ownerState.actions_done, used);
  const containsSelfTrashSource = (action: CardEffect['action']): boolean => {
    const a = action as unknown as Record<string, unknown>;
    if ((a.source as { type?: string; owner?: string } | undefined)?.type === 'TRASH_CARD'
        && (a.source as { owner?: string }).owner === 'self') return true;
    if (Array.isArray(a.steps)) return (a.steps as CardEffect['action'][]).some(containsSelfTrashSource);
    if (a.then && typeof a.then === 'object') return containsSelfTrashSource(a.then as CardEffect['action']);
    return false;
  };
  const sources = [
    ...ownFieldSources(ownerState),
    ...ownerState.trash.filter(n => effsOf(ctx, n).some(e => e.timing?.includes('ON_TRAP_ACTIVATE') && containsSelfTrashSource(e.action))),
  ];
  for (const sourceNum of sources) {
    for (const eff of effsOf(ctx, sourceNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRAP_ACTIVATE')) continue;
      if (eff.condition && !evalUseCondition(eff.condition, ownerState, otherState, ctx.cardMap, sourceNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(sourceNum))?.CardName ?? sourceNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: sourceNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（トラップアイコン発動時）`, effect: eff,
      });
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * 効果解決中に発行された【トラップ】設置イベントを収集する。
 * event owner は効果主から見た設置先で、watcher は設置された側の場だけを走査する。
 * これにより「あなたの【トラップ】」は相手側の設置では発火しない。
 */
export function collectTrapSetTriggers(
  ctx: TrigCtx,
  effectOwnerId: string,
  setOwners: readonly Owner[],
  hostState: PlayerState,
  guestState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  let currentHost = hostState;
  let currentGuest = guestState;
  for (const setOwner of setOwners) {
    const setterId = setOwner === 'self'
      ? effectOwnerId
      : effectOwnerId === ctx.hostId ? ctx.guestId : ctx.hostId;
    const setterState = setterId === ctx.hostId ? currentHost : currentGuest;
    const otherState = setterId === ctx.hostId ? currentGuest : currentHost;
    const used = setterId === ctx.hostId ? usedHostIds : usedGuestIds;
    const limitOk = mkLimitOk(setterState.actions_done, used);
    for (const sourceNum of ownFieldSources(setterState)) {
      for (const eff of effsOf(ctx, sourceNum)) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_TRAP_SET')) continue;
        if (eff.condition && !evalUseCondition(eff.condition, setterState, otherState, ctx.cardMap, sourceNum, ctx.turnPhase, ctx.effectivePowers)) continue;
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(getCardNum(sourceNum))?.CardName ?? sourceNum;
        entries.push({
          id: ctx.genId(), playerId: setterId, cardNum: sourceNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（トラップ設置時）`, effect: eff,
        });
      }
    }
    // 同じ効果解決中に複数設置された場合も《ターン1回》を次イベントへ反映する。
    if (used.length > 0) {
      const next = { ...setterState, actions_done: [...(setterState.actions_done ?? []), ...used] };
      if (setterId === ctx.hostId) currentHost = next;
      else currentGuest = next;
    }
  }
  return { entries, usedHostIds, usedGuestIds };
}

/** 攻撃側ルリグの「このルリグのアタックが【ガード】されたとき」を収集する。 */
export function collectLrigAttackGuardedTriggers(
  ctx: TrigCtx,
  attackerId: string,
  attackerState: PlayerState,
  defenderState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  const limitOk = mkLimitOk(attackerState.actions_done, usedOncePerTurnIds);
  // 🆕**発生源はセンタールリグだけではない**（2026-08-31 続き749）＝キー（`WXK11-006-E4`）や場のシグニ
  //   （`WX24-P3-055-E2`）も「そのアタック終了時、…だった場合」を持つ。⚠キーは `activeKeyAbilitySources`
  //   を通す（「すべてのキーは能力を失う」を1点で効かせる funnel）。
  const sourcesLAG = [
    attackerState.field.lrig.at(-1),
    attackerState.field.assist_lrig_l?.at(-1),
    attackerState.field.assist_lrig_r?.at(-1),
    ...activeKeyAbilitySources(attackerState),
    ...attackerState.field.signi.map(stack => stack?.at(-1)),
  ].filter((n): n is string => !!n);
  if (sourcesLAG.length === 0) return { entries, usedOncePerTurnIds };
  for (const srcNum of sourcesLAG) {
    for (const eff of effsOf(ctx, srcNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_GUARD')) continue;
      // 🆕`lrigAttackNoDamage`＝「ダメージを与えていなかった場合」。**ガードされた経路でだけ**発火する
      //   （バリア等でダメージが消えた場合は未配線＝過小側へ fail-closed。§5.4(ii) に登録）。
      if (!eff.triggerCondition?.lrigAttackGuarded && !eff.triggerCondition?.lrigAttackNoDamage) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, attackerState, defenderState, attackerId === ctx.activeUserId, ctx.cardMap, srcNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, attackerState, defenderState, ctx.cardMap, srcNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(srcNum))?.CardName ?? srcNum;
      entries.push({
        id: ctx.genId(), playerId: attackerId, cardNum: srcNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（ルリグアタックがガードされたとき）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * シグニが効果で他シグニゾーンに移動したとき（ON_ZONE_MOVED）のトリガーを収集する（Stage2 抽出）。
 * mover 側＝self(移動シグニ自身)/any_ally/any、対戦相手側＝any_opp/any。triggeringCardNum=移動シグニ。
 */
export function collectZoneMovedTriggers(
  ctx: TrigCtx, movedNum: string, moverState: PlayerState, otherState: PlayerState, moverId: string, otherId: string,
  causeOwnerId?: string, causeLimitedOnly = false,
): { entries: StackEntry[]; moverUsedIds: string[]; otherUsedIds: string[] } {
  const entries: StackEntry[] = [];
  const moverUsedIds: string[] = [];
  const otherUsedIds: string[] = [];
  const scan = (fieldState: PlayerState, ownerId: string, usedIds: string[], accept: (scope: string) => boolean) => {
    if (fieldState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return;
    for (let zi = 0; zi < fieldState.field.signi.length; zi++) {
      const topNum = fieldState.field.signi[zi]?.at(-1);
      if (!topNum) continue;
      for (const eff of ctx.effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ZONE_MOVED')) continue;
        const causeLimited = !!(eff.triggerCondition?.byOwnEffect || eff.triggerCondition?.byOpponentEffect || eff.triggerCondition?.byEffect);
        if (causeLimitedOnly && !causeLimited) continue;
        if (!causeLimitedOnly && causeLimited && !causeOwnerId) continue;
        if (!effectCauseMatches(eff, ownerId, causeOwnerId)) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self' && topNum !== movedNum) continue;
        if (!accept(scope)) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
          const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
          const used = (fieldState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) continue;
          usedIds.push(eff.effectId);
        }
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（ゾーン移動時）`, effect: eff, triggeringCardNum: movedNum,
        });
      }
    }
  };
  scan(moverState, moverId, moverUsedIds, scope => scope === 'self' || scope === 'any_ally' || scope === 'any');
  scan(otherState, otherId, otherUsedIds, scope => scope === 'any_opp' || scope === 'any');
  return { entries, moverUsedIds, otherUsedIds };
}

/**
 * シグニがドライブ状態になったとき（ON_SIGNI_BECOMES_DRIVE）のトリガーを収集する（Stage2 抽出・collectZoneMovedTriggers と同型）。
 * driver 側＝self/any_ally/any、対戦相手側＝any_opp/any。triggeringCardNum=ドライブ化したシグニ。
 */
export function collectDriveBecameTriggers(
  ctx: TrigCtx, becameNum: string, driverState: PlayerState, otherState: PlayerState, driverId: string, otherId: string,
): { entries: StackEntry[]; driverUsedIds: string[]; otherUsedIds: string[] } {
  const entries: StackEntry[] = [];
  const driverUsedIds: string[] = [];
  const otherUsedIds: string[] = [];
  const scan = (fieldState: PlayerState, ownerId: string, usedIds: string[], accept: (scope: string) => boolean) => {
    if (fieldState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return;
    for (let zi = 0; zi < fieldState.field.signi.length; zi++) {
      const topNum = fieldState.field.signi[zi]?.at(-1);
      if (!topNum) continue;
      for (const eff of ctx.effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_BECOMES_DRIVE')) continue;
        const scope = eff.triggerScope ?? 'self';
        if (scope === 'self' && topNum !== becameNum) continue;
        if (!accept(scope)) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
          const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
          const used = (fieldState.actions_done ?? []).filter(id => id === eff.effectId).length
            + usedIds.filter(id => id === eff.effectId).length;
          if (used >= max) continue;
          usedIds.push(eff.effectId);
        }
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（ドライブ状態時）`, effect: eff, triggeringCardNum: becameNum,
        });
      }
    }
  };
  scan(driverState, driverId, driverUsedIds, scope => scope === 'self' || scope === 'any_ally' || scope === 'any');
  scan(otherState, otherId, otherUsedIds, scope => scope === 'any_opp' || scope === 'any');
  return { entries, driverUsedIds, otherUsedIds };
}

/**
 * カードが【ビート】になったとき（ON_BECOME_BEAT）のトリガーを収集する（Stage2 抽出）。
 * self＝なったカード自身（beat_zone 在中）／any_ally・any＝オーナーの場のシグニ。triggeringCardNum=なったカード。
 */
export function collectBeatBecameTriggers(
  ctx: TrigCtx, becameNum: string, ownerState: PlayerState, ownerId: string,
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const usedIds: string[] = [];
  const consumeLimit = (eff: { effectId: string; usageLimit?: string }): boolean => {
    if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
      const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
      const used = (ownerState.actions_done ?? []).filter(id => id === eff.effectId).length
        + usedIds.filter(id => id === eff.effectId).length;
      if (used >= max) return false;
      usedIds.push(eff.effectId);
    }
    return true;
  };
  const pushEntry = (cardNum: string, eff: CardEffect) => {
    entries.push({
      id: ctx.genId(), playerId: ownerId, cardNum, effectId: eff.effectId,
      label: `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum} の【自】効果（【ビート】になったとき）`,
      effect: eff, triggeringCardNum: becameNum,
    });
  };
  if (ownerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedIds };
  // 1. なったカード自身（self scope。beat_zone 在中なので effectsMap から直接引く）
  for (const eff of ctx.effectsMap.get(becameNum) ?? []) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BECOME_BEAT')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    if (!consumeLimit(eff)) continue;
    pushEntry(becameNum, eff);
  }
  // 2. オーナーの場のシグニ（any_ally/any scope）
  for (let zi = 0; zi < ownerState.field.signi.length; zi++) {
    const topNum = ownerState.field.signi[zi]?.at(-1);
    if (!topNum || topNum === becameNum) continue;
    for (const eff of ctx.effectsMap.get(topNum) ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BECOME_BEAT')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(getCardNum(becameNum)), restFilter)) continue;
      }
      if (!consumeLimit(eff)) continue;
      pushEntry(topNum, eff);
    }
  }
  return { entries, usedIds };
}

/**
 * 手札が捨てられたときのトリガー（ON_DISCARDED_AS_COST / ON_HAND_DISCARDED）を収集する（Stage2 抽出）。
 * 'any'（いずれかが捨てた）はターン問わず＋相手フィールドの 'any' も収集。turnOwner:'opponent' は相手ターンのみ。
 * usedLimitIds（discarder側）を呼び出し側で actions_done に追加して保存すること。
 */
/** ON_OPP_LIFE_CRASHED をクラッシュ側の場から収集する。source 省略時は既存効果と同じく無条件。 */
export function collectOppLifeCrashedTriggers(
  ctx: TrigCtx, crasherState: PlayerState, crasherId: string, crashSourceCardNum?: string,
  /** §5.3 `O-120`：クラッシュの原因キーワード（`'ランサー'` / `'Ｓランサー'`）。未指定＝原因不明。 */
  crashCause?: string,
): { entries: StackEntry[]; usedLimitIds: string[] } {
  const entries: StackEntry[] = [];
  const usedLimitIds: string[] = [];
  const limitOk = mkLimitOk(crasherState.actions_done, usedLimitIds);
  const sources = [...crasherState.field.signi.map(s => s?.at(-1)), crasherState.field.lrig.at(-1),
    crasherState.field.assist_lrig_l?.at(-1), crasherState.field.assist_lrig_r?.at(-1),
    ...activeKeyAbilitySources(crasherState)]
    .filter((n): n is string => !!n);
  // センタールリグには付与ストア（effectsMap 非搭載）を合流させる（WXDi-CP02-050-E1）。
  const crasherLrigTop = crasherState.field.lrig.at(-1);
  for (const watcher of sources) {
    const watcherEffs = watcher === crasherLrigTop
      ? [...(ctx.effectsMap.get(watcher) ?? []),
         ...grantedStoreWatchers(crasherState, 'ON_OPP_LIFE_CRASHED', ['self', 'any_ally', 'any']).map(w => w.effect)]
      : (ctx.effectsMap.get(watcher) ?? []);
    for (const eff of watcherEffs) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_LIFE_CRASHED')) continue;
      if (!oppLifeCrashSourceMatches(eff, watcher, crashSourceCardNum, ctx.cardMap)) continue;
      if (!crashCauseMatches(eff, crashCause)) continue;   // §5.3 O-120（fail-closed）
      if (!limitOk(eff)) continue;
      entries.push({ id: ctx.genId(), playerId: crasherId, cardNum: watcher, effectId: eff.effectId,
        label: `${ctx.cardMap.get(watcher)?.CardName ?? watcher}【自】相手ライフクラッシュ時`, effect: eff,
        triggeringCardNum: crashSourceCardNum });
    }
  }
  return { entries, usedLimitIds };
}

export function collectHandDiscardTriggers(
  ctx: TrigCtx, discardedNums: string[], myState: PlayerState, discarderId: string, asCost: boolean,
  opState?: PlayerState, opId?: string, costSourceNum?: string,
  byOppEffect = false,
  causeOwnerId?: string,
): { entries: StackEntry[]; usedLimitIds: string[] } {
  const entries: StackEntry[] = [];
  const usedLimitIds: string[] = [];
  if (discardedNums.length === 0) return { entries, usedLimitIds };
  const limitOk = mkLimitOk(myState.actions_done, usedLimitIds);
  // 🆕このターンの遅延トリガー（`WX24-P4-017-E3` の「対戦相手が手札を1枚捨てたとき」側）。
  //   ⚠設置者は**捨てた側の対戦相手**なので `opState`/`opId` があるときだけそちらへ積む。
  if (opState && opId) {
    entries.push(...collectGenericDelayedTriggers(ctx, opId, opState, 'ON_HAND_DISCARDED', discardedNums));
  }
  const matchesTrigFilter = (eff: CardEffect): boolean =>
    !eff.triggerFilter || discardedNums.some(cn => matchesFilter(ctx.cardMap.get(cn), eff.triggerFilter));
  // 「**その**カードをトラッシュからエナゾーンに置く」（WX24-P2-051-E1）等の「そのカード」参照用に、
  // トリガー元＝捨てられたカードを entry へ載せる。triggerFilter があるときは**一致した1枚**を選ぶ
  // （filter 不一致の巻き添えカードを「そのカード」にしない）。
  const trigSourceOf = (eff: CardEffect): string | undefined =>
    eff.triggerFilter
      ? discardedNums.find(cn => matchesFilter(ctx.cardMap.get(cn), eff.triggerFilter))
      : discardedNums[0];
  const meetsMinCount = (eff: CardEffect): boolean =>
    discardedNums.length >= (eff.triggerCondition?.minCount ?? 1);
  // byOwnEffect（「あなたが**自分の効果によって**カードをN枚以上捨てたとき」WXDi-D09-P16-E2）＝
  // 捨てた本人（discarder）自身の効果が原因のときだけ発火する。除外するのは
  //   ①コスト支払いによる手札捨て（asCost＝コストで捨てるのは「効果によって」ではない）
  //   ②対戦相手の効果で捨てさせられた場合（byOppEffect＝discarder 側 state の
  //     hand_discarded_just_by_opp を呼び出し元が渡す）。
  // ⚠ターン終了時の手札上限処理はそもそも hand_discarded_just を立てないのでこの経路に来ない。
  const ownEffectOk = (eff: CardEffect): boolean =>
    !eff.triggerCondition?.byOwnEffect || (!asCost && !byOppEffect);
  // ON_DISCARDED_AS_COST: 捨てられたカード自身（コストとして捨てられた場合のみ）
  // 発生源限定「あなたの＜X＞のシグニの【出】【起】能力のコストとして」＝コストを支払った能力の host シグニ
  //（costSourceNum）の CardClass に X を含むときだけ発火（Opusタスク12(xxiv)）。
  const costSrcClass = costSourceNum ? (ctx.cardMap.get(costSourceNum)?.CardClass ?? '') : '';
  if (asCost) {
    for (const cn of discardedNums) {
      for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DISCARDED_AS_COST')) continue;
        const reqStory = eff.triggerCondition?.discardCostSourceStory;
        if (reqStory && !costSrcClass.includes(reqStory)) continue;
        if (!limitOk(eff)) continue;
        entries.push({
          id: ctx.genId(), playerId: discarderId, cardNum: cn, effectId: eff.effectId,
          label: `${ctx.cardMap.get(cn)?.CardName ?? cn}【自】コスト捨て時`, effect: eff,
        });
      }
    }
  }
  // ON_HAND_DISCARDED: discarder の自フィールド。'any' は常時、それ以外は discarder のターンのみ。
  const myIsTurn = ctx.activeUserId === discarderId;
  const myBlocked = !!myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  for (const stack of myState.field.signi) {
    const topNum = stack?.at(-1);
    if (!topNum) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
      if (!meetsMinCount(eff)) continue;
      // any_opp＝「対戦相手が捨てたとき」＝discarder 自身の場では発火しない（相手フィールド path で拾う）。
      if (eff.triggerScope === 'any_opp') continue;
      if (!ownEffectOk(eff)) continue;
      const isAny = eff.triggerScope === 'any';
      if (myBlocked) continue;
      if (eff.triggerCondition?.turnOwner === 'opponent') { if (myIsTurn) continue; }
      else if (!isAny && !myIsTurn) continue;
      // 🆕`O-64`：「あなたのメインフェイズの間、あなたがシグニを1枚捨てたとき」（`WXDi-P07-044-E1`）。
      //   この collector はフェイズ語彙を一切見ていなかった＝受け皿があっても恒久 no-op（§4.3）。
      if (!mainPhaseGateOk(eff, ctx, discarderId)) continue;
      if (!matchesTrigFilter(eff)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: discarderId, cardNum: topNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum}【自】手札捨て時`, effect: eff,
        triggeringCardNum: trigSourceOf(eff),
      });
    }
  }
  // 自分のセンタールリグ（ON_HAND_DISCARDED self/any）。signi のみ走査で LRIG が発火しなかった
  // （続き96・アロス・ピルルク ACRO/MIRA/kl＝WXEX2-12/WXDi-P11-006/WXDi-P14-007・月雪ミヤコ WX25-CP1-016）。
  // BLOCK_OWN_SIGNI_AUTO はシグニ限定なので LRIG には適用しない。
  const myLrigHD = myState.field.lrig.at(-1);
  if (myLrigHD) {
    for (const eff of (ctx.effectsMap.get(myLrigHD) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
      if (!meetsMinCount(eff)) continue;
      if (eff.triggerScope === 'any_opp') continue; // 相手が捨てたとき＝discarder 自身の LRIG では発火しない
      if (!ownEffectOk(eff)) continue;
      const isAny = eff.triggerScope === 'any';
      if (eff.triggerCondition?.turnOwner === 'opponent') { if (myIsTurn) continue; }
      else if (!isAny && !myIsTurn) continue;
      if (!mainPhaseGateOk(eff, ctx, discarderId)) continue;   // `O-64`（シグニ側と対称）
      if (!matchesTrigFilter(eff)) continue;
      if (!limitOk(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: discarderId, cardNum: myLrigHD, effectId: eff.effectId,
        label: `${ctx.cardMap.get(myLrigHD)?.CardName ?? myLrigHD}【自】手札捨て時`, effect: eff,
        triggeringCardNum: trigSourceOf(eff),
      });
    }
  }
  // ON_HAND_DISCARDED 'any'/'any_opp': discarder の相手フィールド（センタールリグ＋シグニ）の watcher を
  // 相手コントローラーで収集。'any'＝いずれかが捨てたとき（自分の捨ても含む）／'any_opp'＝対戦相手（＝discarder）
  // が捨てたときのみ（「あなたの効果によって対戦相手が手札を捨てたとき」WXDi-P04-063 等・続き175・Opusタスク16）。
  // LRIG は BLOCK_OWN_SIGNI_AUTO の対象外（シグニ限定）＝別途走査（続き96 の path1 と同じ扱い）。
  if (opState && opId) {
    const oppBlocked = !!opState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
    const oppSources: Array<{ num: string | undefined; isLrig: boolean }> = [
      { num: opState.field.lrig.at(-1), isLrig: true },
      ...opState.field.signi.map(s => ({ num: s?.at(-1), isLrig: false })),
    ];
    for (const { num: topNum, isLrig } of oppSources) {
      if (!topNum) continue;
      if (oppBlocked && !isLrig) continue;
      for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_HAND_DISCARDED')) continue;
        if (!meetsMinCount(eff)) continue;
        if (eff.triggerScope !== 'any' && eff.triggerScope !== 'any_opp') continue;
        // byOwnEffect は「捨てた本人の効果が原因」を指す軸なので、watcher の持ち主が discarder でない
        // このループでは意味が確定しない（実データ0件）。過剰発火を避けて保守的に非発火にする。
        if (eff.triggerCondition?.byOwnEffect) continue;
        // byWatcherEffect（「あなたの効果によって対戦相手が手札を捨てたとき」）＝
        // watcher 所有者（opId）の効果が原因の場合だけ。コスト／ルール処理（undefined）も非発火。
        if (eff.triggerCondition?.byWatcherEffect && causeOwnerId !== opId) continue;
        if (!mainPhaseGateOk(eff, ctx, opId)) continue;   // `O-64`（watcher の持ち主＝opId 視点）
        if (!matchesTrigFilter(eff)) continue;
        if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
          const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
          if ((opState.actions_done ?? []).filter(id => id === eff.effectId).length >= max) continue;
        }
        entries.push({
          id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
          label: `${ctx.cardMap.get(topNum)?.CardName ?? topNum}【自】手札捨て時`, effect: eff,
        });
      }
    }
  }
  return { entries, usedLimitIds };
}

/**
 * 相手がアーツを使用したとき（ON_OPP_ARTS_USE）に反応する自分のシグニを収集する（Stage2 抽出）。
 * activeCondition を満たす場合のみ。playerId は視点プレイヤー（ctx.meId）。
 */
/**
 * §5.3 `O-113`＝**対戦相手のアーツの効果を実際に受けた「自分の場のシグニ」**を、アーツ解決の前後の
 * 盤面差分で求める（`collectOppArtsUseTriggers` の `affectedByOppArtsFilter` 判定材料）。
 *
 * 🔴**なぜ差分か**＝engine には「この効果が触ったカード」の台帳が無い。`lastProcessedCards` は
 *   **最後の1ステップ**しか持たず、`autoTargetedCards` は自動対象化だけ＝どちらも「効果を受けた」を表せない。
 *   台帳を新設すると全 exec 関数に配線が要るので、**観測できる影響を1か所で差分する**形にした。
 *
 * ⚠**観測できるのは盤面に出る影響だけ**（離場／ダウン／凍結／パワー修正／付与キーワード・能力／能力消去）。
 *   「〜できない」のような盤面に出ない影響は拾わない＝**過小side**に倒す。
 *   旧実装は条件そのものが無く「相手がアーツを使っただけ」で発火する**過剰**だったので、方向としては安全側。
 * ⚠`autoTargeted` は選択UIを経ない自動対象化（`ExecResult.autoTargetedCards`）。盤面が動かない付与でも
 *   「対象に取られた」ことは確実なので合流させる。
 */
export function collectOppArtsAffectedOwnSigni(
  before: PlayerState, after: PlayerState, autoTargeted: string[] = [],
): string[] {
  const out = new Set<string>();
  const topsOf = (st: PlayerState) => (st.field?.signi ?? []).map(stack => stack?.at(-1) ?? null);
  const beforeTops = topsOf(before);
  const afterTops = topsOf(after);
  const afterIndexOf = (num: string) => afterTops.findIndex(n => n === num);
  const modSig = (st: PlayerState, num: string) =>
    (st.temp_power_mods ?? []).filter(m => m.cardNum === num).reduce((sum, m) => sum + (m.delta ?? 0), 0);
  const kwSig = (st: PlayerState, num: string) => (st.keyword_grants?.[num] ?? []).join('/');
  const grantSig = (st: PlayerState, num: string) => (st.granted_effects?.[num] ?? []).length;
  const removedSig = (st: PlayerState, num: string) => (st.abilities_removed ?? []).includes(num);
  for (let z = 0; z < beforeTops.length; z++) {
    const num = beforeTops[z];
    if (!num) continue;
    const zi = afterIndexOf(num);
    if (zi < 0) { out.add(num); continue; }          // 場を離れた＝効果を受けた
    const downB = before.field?.signi_down?.[z] ?? false;
    const downA = after.field?.signi_down?.[zi] ?? false;
    const frzB = before.field?.signi_frozen?.[z] ?? false;
    const frzA = after.field?.signi_frozen?.[zi] ?? false;
    if (downB !== downA || frzB !== frzA) { out.add(num); continue; }
    if (modSig(before, num) !== modSig(after, num)) { out.add(num); continue; }
    if (kwSig(before, num) !== kwSig(after, num)) { out.add(num); continue; }
    if (grantSig(before, num) !== grantSig(after, num)) { out.add(num); continue; }
    if (removedSig(before, num) !== removedSig(after, num)) { out.add(num); continue; }
  }
  // 自動対象化されたカードのうち、自分の場に在る（在った）ものだけ合流させる。
  for (const num of autoTargeted) {
    if (beforeTops.includes(num) || afterTops.includes(num)) out.add(num);
  }
  return [...out];
}

export function collectOppArtsUseTriggers(
  ctx: TrigCtx, myState: PlayerState, opState: PlayerState, isMyTurnNow: boolean,
  /**
   * §5.3 `O-113`＝そのアーツの効果を実際に受けた**自分の場のシグニ**（`collectOppArtsAffectedOwnSigni`）。
   * ⚠**未提供（undefined）は「分からない」であって「受けていない」ではない**＝
   *   `affectedByOppArtsFilter` を持つ効果は**発火させない**（fail-closed）。旧挙動の無条件発火へは戻さない。
   */
  affectedOwnSigni?: string[],
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  // 🆕usageLimit（《ターン１回》《ターン２回》）＝**この collector だけ判定が無かった**
  //   （§5.3 2026-08-27 Sheet1 B11・`WX05-020-E2`）。姉妹の `collectArtsUseTriggers` は元から
  //   持っており、片側だけ穴が空いていた＝相手がアーツを使うたびに何度でもダメージが入る。
  const usedIds: string[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  // ownFieldSources = 場シグニ＋センタールリグ。signi のみ走査だと LRIG watcher が発火しなかった
  // （続き96・ON_OPP_ARTS_USE self の WX16-003）。姉妹関数 collectArtsUseTriggers は元から lrig 対応済み。
  for (const topNum of ownFieldSources(myState)) {
    for (const eff of ctx.effectsMap.get(topNum) ?? []) {
      if (eff.effectType !== 'AUTO') continue;
      if (!eff.timing?.includes('ON_OPP_ARTS_USE')) continue;
      // §5.3 O-113: 「あなたの〈フィルタ〉のシグニ1体が対戦相手のアーツの**効果を受けたとき**」。
      // ⚠**usageLimit の消化より前**に弾く（受けていない回で《ターン1回》を使い切らせない）。
      const affFilter = eff.triggerCondition?.affectedByOppArtsFilter;
      if (affFilter) {
        if (!affectedOwnSigni) continue;                    // 判定材料が無い＝発火させない（fail-closed）
        const hit = affectedOwnSigni.some(n => matchesFilter(ctx.cardMap.get(getCardNum(n)), affFilter));
        if (!hit) continue;
      }
      if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
        const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
        const used = (myState.actions_done ?? []).filter(id => id === eff.effectId).length
          + usedIds.filter(id => id === eff.effectId).length;
        if (used >= max) continue;
        usedIds.push(eff.effectId);
      }
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, isMyTurnNow, ctx.cardMap)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（相手アーツ使用時）`, effect: eff,
      });
    }
  }
  return { entries, usedIds };
}

/**
 * あなたがアーツを使用したとき（ON_ARTS_USE）、使用者自身のルリグ/シグニのトリガーを収集する（Stage2 抽出）。
 * usedIds を呼び出し側で caster の actions_done に永続化する。
 */
export function collectArtsUseTriggers(
  ctx: TrigCtx, casterId: string, casterState: PlayerState, opState: PlayerState, isCasterTurn: boolean,
  usedArtsNum?: string,
): { entries: StackEntry[]; usedIds: string[] } {
  const entries: StackEntry[] = [];
  const usedIds: string[] = [];
  const sources = [
    casterState.field.lrig.at(-1),
    ...casterState.field.signi.map(s => s?.at(-1)),
  ].filter((n): n is string => !!n);
  for (const srcNum of sources) {
    for (const eff of (ctx.effectsMap.get(srcNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ARTS_USE')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      // triggerFilter: 使用したアーツの色条件（「あなたが緑のアーツを使用したとき」WXK01-043）。
      // filter があるのにアーツが特定できない呼び出しでは発火させない（過剰発火抑止）。
      if (eff.triggerFilter && !matchesFilter(usedArtsNum ? ctx.cardMap.get(getCardNum(usedArtsNum)) : undefined, eff.triggerFilter)) continue;
      if (eff.usageLimit === 'once_per_turn' || eff.usageLimit === 'twice_per_turn') {
        const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
        const used = (casterState.actions_done ?? []).filter(id => id === eff.effectId).length
          + usedIds.filter(id => id === eff.effectId).length;
        if (used >= max) continue;
        usedIds.push(eff.effectId);
      }
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, casterState, opState, isCasterTurn, ctx.cardMap, srcNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, casterState, opState, ctx.cardMap, srcNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      entries.push({
        id: ctx.genId(), playerId: casterId, cardNum: srcNum, effectId: eff.effectId,
        label: `${ctx.cardMap.get(srcNum)?.CardName ?? srcNum}【自】アーツ使用時`, effect: eff,
      });
    }
  }
  return { entries, usedIds };
}

/**
 * action が「このカード自身をトラッシュから場に出す」ステップ（ADD_TO_FIELD self TRASH_CARD thisCardOnly）を
 * 含むか（SEQUENCE/CONDITIONAL を再帰）。トラッシュ在中カードを watcher として限定走査するためのゲート
 * （WX21-Re06 の placedFromTrash 走査・WD22-035-G の相手アタックフェイズ開始走査で共用。
 * 一般のトラッシュ能力は走査しない）。
 */
function actionRevivesSelfFromTrash(action: CardEffect['action']): boolean {
  const a = action as unknown as Record<string, unknown>;
  const src = a.source as { type?: string; owner?: string; filter?: { thisCardOnly?: boolean } } | undefined;
  if (a.type === 'ADD_TO_FIELD' && src?.type === 'TRASH_CARD' && src.owner === 'self' && src.filter?.thisCardOnly) return true;
  if (Array.isArray(a.steps) && (a.steps as CardEffect['action'][]).some(actionRevivesSelfFromTrash)) return true;
  if (a.then && typeof a.then === 'object' && actionRevivesSelfFromTrash(a.then as CardEffect['action'])) return true;
  return false;
}

/**
 * アタッカー**自身**が持つ ON_ATTACK_SIGNI の triggerFilter 判定（BattleScreen の self 経路の pure 部分）。
 *
 * この経路は triggerScope を見ずアタッカーの ON_ATTACK_SIGNI を全部拾うため、any_ally の効果も
 * 「自身がアタックした場合」はここで収集される。よって主語の限定はここでも効かせる必要がある。
 *
 * ⚠**`excludeSelf` は `matchesFilter` が見ない**（候補集合を作る側の責務）。素の `matchesFilter` に
 *   丸ごと渡していたため、「あなたの**他の**〜シグニがアタックしたとき」が **watcher 自身のアタックでも
 *   発火**していた（続き377f 実測3効果＝WX22-022-E4／WX25-CP1-047-E1／WXDi-CP02-102-E1）。
 *   `collectFieldTriggers` 側は `topNum === triggeringCardNum` の skip で正しく除外できていたので、
 *   **同じ語彙が入口ごとに違う壊れ方をしていた**例。
 */
export function attackerSelfTriggerFilterOk(
  eff: CardEffect,
  card: CardData | undefined,
  effectivePower?: number,
): boolean {
  if (!eff.triggerFilter) return true;
  const { excludeSelf, ...rest } = eff.triggerFilter;
  if (excludeSelf) return false; // この経路は watcher＝アタッカー自身なので常に除外される
  if (Object.keys(rest).length === 0) return true;
  return matchesFilter(card, rest, effectivePower);
}

/** アタッカー自身が持つ ON_ATTACK_SIGNI だけを収集する pure collector。非アタックイベントからは呼ばない。 */
export function collectAttackerSelfTriggers(
  ctx: TrigCtx,
  myState: PlayerState,
  opState: PlayerState,
  attackerNum: string,
  ownerId: string,
  effectivePowers?: Map<string, number>,
  /**
   * 🆕**正面以外のシグニゾーンへアタックしたか**（2026-08-31 続き749・`triggerCondition.attackedNotFront`）。
   * 呼び出し側（`BattleScreen`）が `targetOpZone !== 2 - zoneIndex` で判定して渡す。
   * ⚠**渡されない呼び出しでは `undefined`＝限定つきの効果は発火しない**（fail-closed）。
   */
  sideAttack?: boolean,
): StackEntry[] {
  const attackerCard = ctx.cardMap.get(getCardNum(attackerNum));
  const crossOk = isCrossZoneActive(myState, attackerNum, ctx.cardMap);
  return (ctx.effectsMap.get(attackerNum) ?? [])
    .filter(e => e.effectType === 'AUTO' && e.timing?.includes('ON_ATTACK_SIGNI'))
    .filter(e => !e.triggerCondition?.attackedNotFront || sideAttack === true)
    .filter(e => !e.crossOnly || crossOk)
    .filter(e => !e.kizunaIcon || isKizunaActive(myState, attackerNum, ctx.cardMap))
    .filter(e => attackerSelfTriggerFilterOk(e, attackerCard, effectivePowers?.get(attackerNum)))
    .filter(e => !e.condition || evalUseCondition(e.condition, myState, opState, ctx.cardMap, attackerNum, ctx.turnPhase, effectivePowers, ctx.effectsMap))
    .map(e => ({
      id: ctx.genId(), playerId: ownerId, cardNum: attackerNum, effectId: e.effectId,
      label: `${attackerCard?.CardName ?? attackerNum} の【自】効果（シグニアタック時）`,
      effect: e, triggeringCardNum: attackerNum,
    }));
}

/**
 * 🆕`triggerFilter` の**ゾーン状態**（`hasSoul` / `hasAcce` / `hasCharm` / `isDown` …）をトリガー元カードに当てる
 * （2026-08-31 続き747）。
 *
 * 🔴`matchesFilter` は `CardData` 単体しか見ないので、状態キーを書いても**黙って素通り＝無条件成立**していた
 *   （PLAN §4.2 の「型だけ足すと無条件成立に落ちる」そのもの）。`WXDi-P04-016-E1`
 *   「**【ソウル】が付いている**あなたのシグニ1体がアタックしたとき」を表すのに要る。
 * ⚠場に見つからない（既に離れた等）ときは **false へ fail-closed**＝状態限定つきの効果を過剰発火させない。
 */
function triggerStateFilterOk(state: PlayerState, cardNum: string, filter: TargetFilter | undefined, ctx?: TrigCtx): boolean {
  if (!filter) return true;
  // 🆕`hasOnPlayAbility`＝「**【出】能力を持つ**シグニ」（2026-08-31 続き748）。`effectsMap` が要る軸なので
  //   `matchesStateFilter` ではなくここで解く。⚠`effectsMap` が無い呼び出しでは **false へ fail-closed**。
  if (filter.hasOnPlayAbility !== undefined) {
    const effs = ctx?.effectsMap?.get(getCardNum(cardNum)) ?? [];
    const has = effs.some(e => e.effectType === 'AUTO' && (e.timing ?? []).includes('ON_PLAY'));
    if (filter.hasOnPlayAbility !== has) return false;
  }
  const ZONE_STATE_KEYS = ['hasCharm', 'hasAcce', 'hasSoul', 'hasUnderCards', 'hasAttachedOrUnder', 'infected', 'isDown', 'isUp', 'isFrozen',
    'isAwakened', 'isArmored', 'isPuppet', 'crossState', 'inGateZone', 'centerZoneOnly', 'zoneSide'] as const;
  if (!ZONE_STATE_KEYS.some(k => (filter as Record<string, unknown>)[k] !== undefined)) return true;
  const zi = state.field.signi.findIndex(stack => stack?.at(-1) === cardNum);
  if (zi < 0) return false;
  return matchesStateFilter(state, zi, filter);
}

/**
 * フィールドのシグニ/ルリグの「他のシグニが◯◯したとき」系トリガー（ON_PLAY/ON_BANISH/ON_ATTACK_SIGNI/ON_BLOOM）を収集する（Stage2 抽出）。
 * 自分の場＝any_ally/any、相手の場＝any_opp/any。byEffect/bySigniEffect・placedDown/配置元領域/placedPuppet・
 * frontLowerLevelThanSource/placedFront・triggerFilter・REMOVE_ABILITIES/FROZEN_LOSES_ABILITIES・ARTS_SELF_RECYCLE を保持。
 * ownerId=myState の持ち主。
 */
export function collectFieldTriggers(
  ctx: TrigCtx,
  event: 'ON_PLAY' | 'ON_BANISH' | 'ON_ATTACK_SIGNI' | 'ON_BLOOM',
  triggeringCardNum: string,
  myState: PlayerState,
  opState: PlayerState,
  ownerId: string,
  opts?: {
    placedByEffect?: boolean;
    placeSourceIsSigni?: boolean;
    placedFromZone?: TriggerOriginZone;
    /** @deprecated placedFromZone:'trash' と同義。既存呼び出し・golden の互換用。 */
    placedFromTrash?: boolean;
    /** 🆕ON_ATTACK_SIGNI：正面以外のシグニゾーンへのアタック（`triggerCondition.attackedNotFront` 用）。 */
    sideAttack?: boolean;
  },
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  // 🆕**同じイベントの遅延トリガー**も1箇所で収集する（2026-08-31 続き748・`WXDi-P09-010-E3`
  //   「このターン、あなたのシグニ1体が**効果によって**場に出たとき、…」）。
  // 🔴従来 `delayed_triggers` を読んでいたのはバトルバニッシュ／アタック／離場／ミル／リフレッシュ／
  //   ダウン／フェイズ系だけで、**ON_PLAY・ON_BLOOM の遅延は設置しても永久に発火しなかった**。
  // ⚠`trigger.placedByEffect` は「効果によって場に出た」限定（通常召喚では発火しない）。
  // 🆕`attackedNotFront`（2026-08-31 続き749）＝「あなたのシグニ1体が**正面以外の**シグニゾーンに
  //   アタックしたとき」。⚠`opts.sideAttack` が渡らない呼び出しでは**発火しない**（fail-closed）。
  const sideAttackGateOk = (eff: CardEffect): boolean =>
    !eff.triggerCondition?.attackedNotFront || opts?.sideAttack === true;
  const delayedFieldEntries: StackEntry[] = [];
  for (const dt of myState.delayed_triggers ?? []) {
    if (dt.trigger?.timing !== event) continue;
    // 🔴**`ON_ATTACK_SIGNI` はここで拾わない**（2026-08-31 続き755・`V-100`② の実機で検出）＝
    //   あのイベントには**専用の対**（`collectAttackerSelfDelayedTriggers` ／
    //   `collectSigniAttackDelayedTriggers`）が既にあり、**`attackerOwner` の振り分けと
    //   `attackerFilter` の照合はそちらにしか無い**。ここでも拾うと2つ同時に壊れる＝
    //   ①**同じ watcher が2回積まれて効果が二重に走る**（`WX25-CP1-085` は 相手シグニに －1000 が2回乗った）
    //   ②**`attackerFilter` を見ない**ので「黒の＜ブルアカ＞のシグニがアタックしたとき」が
    //   **誰がアタックしても発火する**（白の＜ブルアカ＞でも乗った）。
    //   ⚠この汎用ループは `ON_PLAY`/`ON_BLOOM` の遅延を拾うために足したもの（続き748）で、
    //   `ON_ATTACK_SIGNI` を巻き込んだのは事故。**専用コレクタがあるイベントはそちらに任せる。**
    if (event === 'ON_ATTACK_SIGNI') continue;
    if (dt.trigger.placedByEffect && !opts?.placedByEffect) continue;
    if (dt.trigger.triggerFilter
      && !matchesFilter(ctx.cardMap.get(getCardNum(triggeringCardNum)), dt.trigger.triggerFilter)) continue;
    delayedFieldEntries.push({
      id: ctx.genId(), playerId: ownerId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
      label: `このターンの遅延トリガー（${event}）`,
      effect: {
        effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: [event],
        action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
      triggeringCardNum,
    });
  }
  const entries: StackEntry[] = [];
  const opId = ownerId === ctx.hostId ? ctx.guestId : ctx.hostId;
  // usageLimit（《ターン1回/2回》）を watcher 側で判定し、消費 effectId を返す（呼び出し元が actions_done へ
  // 書き戻す＝他コレクタと同型）。この関数にはガード自体が丸ごと無く、「味方のシグニが場に出るたびに◯◯
  // （ターンに1回）」型が同一ターンに複数体召喚すると毎回発火する過剰効果だった（続き104・実カード32枚）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const ownerIsHost = ownerId === ctx.hostId;
  const placedFromZone = opts?.placedFromZone ?? (opts?.placedFromTrash ? 'trash' : undefined);
  const limitOkAlly = mkLimitOk(myState.actions_done, ownerIsHost ? usedHostIds : usedGuestIds);
  const limitOkOpp = mkLimitOk(opState.actions_done, ownerIsHost ? usedGuestIds : usedHostIds);
  // byEffect/bySigniEffect:「効果によって場に出たとき」限定の発火可否（ON_PLAY）。
  const byEffectTriggerOk = (eff: CardEffect): boolean => {
    if (event !== 'ON_PLAY') return true;
    if (eff.triggerCondition?.bySigniEffect) return !!(opts?.placedByEffect && opts?.placeSourceIsSigni);
    if (eff.triggerCondition?.byEffect) return !!opts?.placedByEffect;
    return true;
  };

  const isOwnerTurnForTrigger = ownerId === ctx.activeUserId;
  const myAbilitiesRemoved = collectContinuousAbilitiesRemovedSigni(myState, opState, isOwnerTurnForTrigger, ctx.effectsMap, ctx.cardMap, '自');
  const opAbilitiesRemoved = collectContinuousAbilitiesRemovedSigni(opState, myState, !isOwnerTurnForTrigger, ctx.effectsMap, ctx.cardMap, '自');

  // センタールリグ watcher の能力列には、effectsMap に載らない**付与ストア**を合流させる
  // （`grantedStore.ts` 参照）。これを外すと「ターン終了時まで、このルリグは『【自】あなたのシグニが
  // 場に出たとき…』を得る」（WDK12-001-E3）や ON_ATTACK_SIGNI any_opp の付与（WX15-016-E1 ほか7件）が
  // 構造は正しいまま恒久 no-op になる。scope の絞りは各ループ側の既存ゲートがそのまま担う。
  const watcherEffects = (state: PlayerState, topNum: string, isLrig: boolean): CardEffect[] => {
    const printed = ctx.effectsMap.get(topNum) ?? [];
    if (!isLrig) return printed;
    return [...printed, ...grantedStoreWatchers(state, event, ['any_ally', 'any_opp', 'any']).map(w => w.effect)];
  };

  // 自分のフィールド：'any_ally' または 'any' トリガー。ON_PLAY ではルリグも監視対象。
  const ownAutoBlocked = myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  const allyWatchers: { topNum: string; isLrig: boolean; fromTrash?: boolean }[] = [];
  for (const stack of myState.field.signi) {
    if (stack?.length) allyWatchers.push({ topNum: stack[stack.length - 1], isLrig: false });
  }
  // センタールリグも any_ally/any watcher に含める（ON_PLAY 限定だと ON_ATTACK_SIGNI/ON_BANISH/ON_BLOOM の
  // LRIG watcher が構造的に発火しなかった＝続き96・WX12-001/WX14-003/WXDi-P08-007 等）。scope フィルタが発火可否を担保。
  const myLrigWatcher = myState.field.lrig.at(-1);
  if (myLrigWatcher) allyWatchers.push({ topNum: myLrigWatcher, isLrig: true });
  // 「あなたのシグニがトラッシュから場に出たとき、トラッシュにあるこのカードを…」は
  // watcher 自身がトラッシュにいるため、自己回収 action を持つ該当カードだけを追加走査する。
  if (event === 'ON_PLAY') {
    for (const num of myState.trash) {
      if ((ctx.effectsMap.get(num) ?? []).some(e =>
        e.effectType === 'AUTO'
        && e.timing?.includes('ON_PLAY')
        && (e.triggerScope === 'any_ally' || e.triggerScope === 'any')
        && actionRevivesSelfFromTrash(e.action)
        && onPlayOriginMatches(e, placedFromZone)
      )) {
        allyWatchers.push({ topNum: num, isLrig: false, fromTrash: true });
      }
    }
  }
  for (const { topNum, isLrig, fromTrash } of allyWatchers) {
    // any_ally watcher は従来どおり自身のイベントを別の self collector に委ねる。
    // excludeSelf も下で明示的に読み、残りの filter だけを発生源へ適用する。
    if (topNum === triggeringCardNum) continue;
    if (ownAutoBlocked && !isLrig) continue; // BLOCK_OWN_SIGNI_AUTO はシグニ限定
    if (!fromTrash && myAbilitiesRemoved.has(topNum)) continue;
    for (const eff of watcherEffects(myState, topNum, isLrig)) {
      if (eff.effectType !== 'AUTO') continue;
      if (!eff.timing?.includes(event)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      if (!byEffectTriggerOk(eff)) continue;
      // ⚠**`triggerCondition.turnOwner` はここで見ない**（タスク12(xcix) で一度足して差し戻した）。
      //   ターン限定は**収集後段の `effectStack.turnGateOk`** が entry.playerId（＝watcher の持ち主）基準で
      //   全コレクタ共通に評価する。ここで足すと ON_PLAY の「相手ターン中の特殊召喚」等が二重ゲートで落ちる
      //   （この関数の `isOwnerTurnForTrigger` は**トリガー元**側の視点なので watcher 基準とはズレる）。
      // 🆕**§5.3 `O-64`（2026-08-25）＝ここは `mainPhaseGateOk` を使う（旧コメントの「例外」は誤り）。**
      //   旧実装は `ctx.turnPhase !== 'MAIN'` の**フェイズだけ**を見て、ターン主は「後段の `turnGateOk` に
      //   委ねる」と書いていた。⚠**`turnGateOk` が読むのは `turnOwner` だけ**（`effectStack.ts:8`）なので、
      //   `duringMainPhase` しか持たない効果は**誰のメインフェイズでも発火**していた（実測3効果＝
      //   `WX18-052-E1`／`WXEX2-58-E2`／`WX24-P2-092-E1`＝いずれも原文「あなたのメインフェイズの間」）。
      //   ⚠差し戻された `turnOwner` の追加（タスク12(xcix)）とは別物＝あちらは中央ゲートとの**二重掛け**、
      //   こちらは**どこにも消費が無い**。owner のズレは `isOwnerTurnForTrigger`（トリガー元視点）ではなく
      //   **entry.playerId と同じ `ownerId`**（このループの watcher 所有者）を渡すことで解消する。
      if (!mainPhaseGateOk(eff, ctx, ownerId)) continue;
      // placedDown（G144）: トリガー元シグニがダウン状態で出ていなければ発火しない。
      if (eff.triggerCondition?.placedDown && event === 'ON_PLAY') {
        const ziTrig = myState.field.signi.findIndex(s => s?.at(-1) === triggeringCardNum);
        if (ziTrig < 0 || !(myState.field.signi_down?.[ziTrig] ?? false)) continue;
      }
      // ON_PLAY の配置元領域限定。由来不明は限定能力だけ fail-closed。
      if (event === 'ON_PLAY' && !onPlayOriginMatches(eff, placedFromZone)) continue;
      // placedPuppet（WDK17-001）: トリガー元が傀儡状態でなければ発火しない。
      if (eff.triggerCondition?.placedPuppet && event === 'ON_PLAY' && !(myState.field.puppet_signi ?? []).includes(triggeringCardNum)) continue;
      // triggerFilter はイベント発生源（triggeringCardNum）に適用する。⚠実効パワーを渡すこと＝
      // 「あなたのパワーN以上のシグニがアタックしたとき」（WXDi-P02-079-E2/WXK07-030-E2）は表記値ではなく
      // CONTINUOUS/temp_power_mods 適用後のパワーで判定する。effectivePowers のキーは場のスタック頂点の
      // 生値なので getCardNum() で丸めない（丸めるとトークン/複製で lookup が外れ黙って表記値に落ちる）。
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(triggeringCardNum), restFilter, ctx.effectivePowers?.get(triggeringCardNum))) continue;
        // 🆕ゾーン状態（【ソウル】が付いている 等）はカード単体では判定できない＝上の説明を参照。
        if (!triggerStateFilterOk(myState, triggeringCardNum, restFilter, ctx)) continue;
      }
      if (!sideAttackGateOk(eff)) continue;
      if (!limitOkAlly(eff)) continue; // 《ターン1回/2回》＝全ゲート通過後に消費する（最後に置く）
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（他のシグニ召喚時）`, effect: eff, triggeringCardNum,
      });
    }
  }

  // 相手のフィールド：'any_opp' または 'any' トリガー
  const oppAutoBlocked = myState.blocked_actions?.includes('BLOCK_OPP_SIGNI_AUTO');
  const myLrigTop = myState.field.lrig.at(-1);
  const frozenLosesAbilitiesOnMyLrig = myLrigTop
    ? (ctx.effectsMap.get(myLrigTop) ?? []).some(e =>
        e.effectType === 'CONTINUOUS' &&
        (e.action as StubAction)?.type === 'STUB' &&
        (e.action as StubAction)?.id === 'FROZEN_LOSES_ABILITIES',
      )
    : false;
  // 相手のセンタールリグも any_opp/any watcher に含める（signi のみ走査だと相手 LRIG watcher が
  // 構造的に発火しなかった＝続き96・ON_BANISH any_opp の WXEX2-26 等）。
  const opLrigTopField = opState.field.lrig.at(-1);
  for (const topNum of ownFieldSources(opState)) {
    if (opAbilitiesRemoved.has(topNum)) continue;
    for (const eff of watcherEffects(opState, topNum, topNum === opLrigTopField)) {
      if (eff.effectType !== 'AUTO') continue;
      if (!eff.timing?.includes(event)) continue;
      if (oppAutoBlocked) continue;
      if (frozenLosesAbilitiesOnMyLrig) {
        const zi2 = opState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (zi2 >= 0 && (opState.field.signi_frozen?.[zi2] ?? false)) continue;
      }
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any' && scope !== 'any_opp') continue;
      if (!byEffectTriggerOk(eff)) continue;
      if (event === 'ON_PLAY' && !onPlayOriginMatches(eff, placedFromZone)) continue;
      // ⚠`turnOwner` は後段の `turnGateOk` が担当（ally 側と同じ）。**フェイズ限定だけは中央ゲートが無い**ので
      //   ここで owner 相対に評価する（`O-64`）。watcher の持ち主は `opId`＝下で push する entry.playerId と同じ。
      if (!mainPhaseGateOk(eff, ctx, opId)) continue;
      // MOVE_TO_ATTACKER_FRONT / MOVE_TO_OTHER_SIGNI_ZONE は専用ハンドラ（二重発火防止）。
      const oeStub = eff.action as StubAction;
      if (event === 'ON_ATTACK_SIGNI' && oeStub.type === 'STUB'
        && (oeStub.id === 'MOVE_TO_ATTACKER_FRONT' || oeStub.id === 'MOVE_TO_OTHER_SIGNI_ZONE')) continue;
      // triggerFilter は発生源に適用（any_ally 側と対称。実効パワーを渡す理由は上のコメント参照）。
      if (eff.triggerFilter?.excludeSelf && topNum === triggeringCardNum) continue;
      if (eff.triggerFilter) {
        const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
        if (Object.keys(restFilter).length > 0
          && !matchesFilter(ctx.cardMap.get(triggeringCardNum), restFilter, ctx.effectivePowers?.get(triggeringCardNum))) continue;
        // 🆕ゾーン状態（【ソウル】が付いている 等）はカード単体では判定できない＝上の説明を参照。
        if (!triggerStateFilterOk(myState, triggeringCardNum, restFilter, ctx)) continue;
      }
      if (!sideAttackGateOk(eff)) continue;
      // frontLowerLevelThanSource（WX17-075）: このシグニの正面に、これよりレベルの低いシグニが出たときのみ。
      if (eff.triggerCondition?.frontLowerLevelThanSource) {
        if (event !== 'ON_PLAY') continue;
        const ziHost = opState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (ziHost < 0) continue;
        const frontNum = myState.field.signi[2 - ziHost]?.at(-1);
        if (!frontNum || frontNum !== triggeringCardNum) continue;
        const hostLv = parseInt(ctx.cardMap.get(topNum)?.Level ?? '0', 10);
        const newLv = parseInt(ctx.cardMap.get(triggeringCardNum)?.Level ?? '0', 10);
        if (isNaN(hostLv) || isNaN(newLv) || newLv >= hostLv) continue;
      }
      // placedFront（WXDi-P03-043）: このシグニの正面ゾーンにトリガー元が配置された場合のみ。
      if (eff.triggerCondition?.placedFront) {
        if (event !== 'ON_PLAY') continue;
        const ziHost = opState.field.signi.findIndex(s => s?.at(-1) === topNum);
        if (ziHost < 0) continue;
        const frontNum = myState.field.signi[2 - ziHost]?.at(-1);
        if (!frontNum || frontNum !== triggeringCardNum) continue;
      }
      // placedOnTrapZone（WX21-025）/ placedOnGateZone（WXK10-044）: トリガー元シグニの持ち主（myState）の
      // ゾーン状態（signi_traps / own_gate_zones）に【トラップ】/【ゲート】がある場合のみ（タスク16[C]機構⑤）。
      if (eff.triggerCondition?.placedOnTrapZone || eff.triggerCondition?.placedOnGateZone) {
        if (event !== 'ON_PLAY') continue;
        const ziTrig2 = myState.field.signi.findIndex(s => s?.at(-1) === triggeringCardNum);
        if (ziTrig2 < 0) continue;
        if (eff.triggerCondition.placedOnTrapZone && !(myState.field.signi_traps?.[ziTrig2])) continue;
        if (eff.triggerCondition.placedOnGateZone && !(myState.own_gate_zones ?? []).includes(ziTrig2)) continue;
      }
      if (!limitOkOpp(eff)) continue; // 《ターン1回/2回》＝全ゲート通過後に消費する（最後に置く）
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（相手シグニアタック時）`, effect: eff, triggeringCardNum,
      });
    }
  }

  // 自分のルリグトラッシュ（ARTS_SELF_RECYCLE_ON_TRIGGER: ON_PLAYトリガーでアーツ自己回収）
  if (event === 'ON_PLAY') {
    for (const artsNum of (myState.lrig_trash ?? [])) {
      for (const eff of (ctx.effectsMap.get(artsNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_PLAY')) continue;
        const act = eff.action as StubAction;
        if (act.type !== 'STUB' || act.id !== 'ARTS_SELF_RECYCLE_ON_TRIGGER') continue;
        if (!limitOkAlly(eff)) continue;
        const cardName = ctx.cardMap.get(artsNum)?.CardName ?? artsNum;
        entries.push({
          id: ctx.genId(), playerId: ownerId, cardNum: artsNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（シグニ召喚時）`, effect: eff,
        });
      }
    }
  }

  entries.push(...delayedFieldEntries);   // 🆕同じイベントの遅延トリガー（上のコメント参照）
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * 【シード】が開花したとき（ON_BLOOM）のトリガーを収集する（Stage2 抽出）。
 * 開花シグニ自身の self ON_BLOOM ＋場の他シグニの any_ally/any（collectFieldTriggers 経由）。
 * 開花は「場に出た」扱いではないため ON_PLAY は発火させない（公式ルール）。
 */
export function collectBloomTriggers(
  ctx: TrigCtx, bloomedInstanceId: string, myState: PlayerState, opState: PlayerState, ownerId: string,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const ownerIsHost = ownerId === ctx.hostId;
  const limitOkSelf = mkLimitOk(myState.actions_done, ownerIsHost ? usedHostIds : usedGuestIds);
  const cn = getCardNum(bloomedInstanceId);
  const cardName = ctx.cardMap.get(cn)?.CardName ?? cn;
  for (const eff of (ctx.effectsMap.get(cn) ?? [])) {
    if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_BLOOM')) continue;
    if ((eff.triggerScope ?? 'self') !== 'self') continue;
    if (!limitOkSelf(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: ownerId, cardNum: bloomedInstanceId, effectId: eff.effectId,
      label: `${cardName} の【自】効果（開花時）`, effect: eff,
    });
  }
  const ft = collectFieldTriggers(ctx, 'ON_BLOOM', bloomedInstanceId, myState, opState, ownerId);
  entries.push(...ft.entries);
  usedHostIds.push(...ft.usedHostIds);
  usedGuestIds.push(...ft.usedGuestIds);
  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ターン/フェイズ境界トリガー（ON_TURN_START/END・ON_ATTACK_PHASE_START・ON_MAIN_PHASE_START・ON_LRIG_ATTACK_STEP_START）を収集する（Stage2 抽出）。
 * myState=ターンプレイヤー（=視点 meId）の状態。自シグニ/キーワードトークン/自ルリグ/相手場 any_opp/ルリグトラッシュ自己回収/
 * 相手ルリグ付与AUTO/FUTURE SESSION③/PR-Di035 を保持。ctx.meId で my/op を確定。
 */
export function collectTurnTriggers(
  ctx: TrigCtx,
  timing: 'ON_TURN_START' | 'ON_TURN_END' | 'ON_ATTACK_PHASE_START' | 'ON_ATTACK_PHASE_END' | 'ON_GROW_PHASE_START' | 'ON_MAIN_PHASE_START' | 'ON_LRIG_ATTACK_STEP_START',
  myState: PlayerState,
  opState: PlayerState,
): { entries: StackEntry[]; usedHostIds: string[]; usedGuestIds: string[] } {
  const entries: StackEntry[] = [];
  const meId = ctx.meId ?? ctx.hostId;
  const opId = meId === ctx.hostId ? ctx.guestId : ctx.hostId;
  // usageLimit（《ターン1回/2回》）を消費した effectId を watcher 側で返す（呼び出し元が actions_done へ
  // 書き戻す＝他コレクターと同型。返さないと同一ターン内にフェイズ境界を跨いで何度でも再発火する。続き119）。
  const usedHostIds: string[] = [];
  const usedGuestIds: string[] = [];
  const meIsHost = meId === ctx.hostId;
  const limitOkMy = mkLimitOk(myState.actions_done, meIsHost ? usedHostIds : usedGuestIds); // 自分側 entries 用
  const limitOkOp = mkLimitOk(opState.actions_done, meIsHost ? usedGuestIds : usedHostIds); // 相手側 entries 用
  const labelSuffix = timing === 'ON_TURN_START' ? 'ターン開始時'
    : timing === 'ON_TURN_END' ? 'ターン終了時'
    : timing === 'ON_GROW_PHASE_START' ? 'グロウフェイズ開始時'
    : timing === 'ON_MAIN_PHASE_START' ? 'メインフェイズ開始時'
    : timing === 'ON_LRIG_ATTACK_STEP_START' ? 'ルリグアタックステップ開始時'
    : timing === 'ON_ATTACK_PHASE_END' ? 'アタックフェイズ終了時' : 'アタックフェイズ開始時';

  // WXDi-P10-034: 「次のあなたのメインフェイズ開始時、そのカードを表向きにしてもよい」の遅延分岐。
  //   自アタックフェイズ開始時に設置した pending_facedown_flip を、次の自メインフェイズ開始時に RESOLVE_FACEDOWN_FLIP として発火する
  //   （delayed_triggers は THIS_TURN 限定でターン境界クリアされ相手ターンを跨げないため、専用の永続フィールドで持ち越す）。
  if (timing === 'ON_MAIN_PHASE_START' && myState.pending_facedown_flip) {
    const pfMPS = myState.pending_facedown_flip;
    const cardNameMPS = ctx.cardMap.get(getCardNum(pfMPS.cardNum))?.CardName ?? pfMPS.cardNum;
    entries.push({
      id: ctx.genId(), playerId: meId, cardNum: pfMPS.sourceCardNum, effectId: `FACEDOWN_FLIP:${pfMPS.cardNum}`,
      label: `裏向きの${cardNameMPS}を表向きにするか（メインフェイズ開始時）`,
      effect: {
        effectId: `FACEDOWN_FLIP:${pfMPS.cardNum}`,
        effectType: 'AUTO',
        timing: ['ON_MAIN_PHASE_START'],
        action: { type: 'STUB', id: 'RESOLVE_FACEDOWN_FLIP' } as StubAction,
        duration: 'INSTANT',
        mandatory: true,
      } as CardEffect,
    });
  }

  // WXDi-P09-009: 自ターン終了時に裏向きにした複数シグニを、次の対戦相手アタックフェイズ開始時に戻す。
  // 予約は非ターンプレイヤー（opState）側にあるため、myState だけを見る既存 pending_facedown_flip とは走査軸が異なる。
  if (timing === 'ON_ATTACK_PHASE_START' && (opState.pending_opponent_attack_facedown_returns ?? []).length > 0) {
    const firstOAF = opState.pending_opponent_attack_facedown_returns![0];
    entries.push({
      id: ctx.genId(), playerId: opId, cardNum: firstOAF.sourceCardNum,
      effectId: `OPP_ATTACK_FACEDOWN_FLIPS:${firstOAF.sourceCardNum}`,
      label: 'この方法で裏向きにしたシグニを表向きにする（対戦相手アタックフェイズ開始時）',
      effect: {
        effectId: `OPP_ATTACK_FACEDOWN_FLIPS:${firstOAF.sourceCardNum}`,
        effectType: 'AUTO',
        timing: ['ON_ATTACK_PHASE_START'],
        action: { type: 'STUB', id: 'RESOLVE_OPP_ATTACK_FACEDOWN_FLIPS' } as StubAction,
        duration: 'INSTANT',
        mandatory: true,
      } as CardEffect,
    });
  }

  // §6.4 O-9(b)：「**各**アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、
  //   対戦相手は〈コスト〉を支払ってもよい。そうした場合、それを表向きにする」（`WXDi-P07-010-E2`）。
  // ⚠**両プレイヤーのアタックフェイズで走る**（「各」）＝`myState`／`opState` の両方を見る。
  //   片側だけを見ると「自分のアタックフェイズでしか解除できない」半分の実装になる。
  // ⚠**エントリの playerId は裏向きカードの持ち主**（＝支払う側）＝ハンドラの `ctx.ownerState` が
  //   その側になる。ここを間違えると支払い主体が反転する。
  if (timing === 'ON_ATTACK_PHASE_START') {
    for (const [holderId, holderState] of [[meId, myState], [opId, opState]] as const) {
      const pendFR = holderState.facedown_release_by_payment ?? [];
      if (pendFR.length === 0) continue;
      entries.push({
        id: ctx.genId(), playerId: holderId, cardNum: pendFR[0].sourceCardNum,
        effectId: `FACEDOWN_RELEASE_PAYMENT:${pendFR[0].cardNum}`,
        label: '裏向きのシグニを表向きにするか（各アタックフェイズ開始時）',
        effect: {
          effectId: `FACEDOWN_RELEASE_PAYMENT:${pendFR[0].cardNum}`,
          effectType: 'AUTO',
          timing: ['ON_ATTACK_PHASE_START'],
          action: { type: 'STUB', id: 'RESOLVE_FACEDOWN_RELEASE_PAYMENT' } as StubAction,
          duration: 'INSTANT',
          mandatory: true,
        } as CardEffect,
      });
    }
  }

  // 追加のアタックフェイズ（§6.4 O-3）：「この方法で加えたアタックフェイズの開始時、〜」の本文。
  // 予約はターンプレイヤー（myState）側にあり、`resolveNextPhaseAfterAttack` がフェイズ突入時に移している。
  // ⚠**この timing は通常のアタックフェイズ開始でも走る**ので、`pending_*` が空なら何も積まない
  //   （＝「追加したフェイズでだけ発火する」を予約の有無だけで表現する）。取り出しは STUB ハンドラ側。
  if (timing === 'ON_ATTACK_PHASE_START') {
    for (const pe of myState.pending_extra_attack_phase_start_effects ?? []) {
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: pe.sourceCardNum ?? '',
        effectId: `EXTRA_ATTACK_PHASE_START:${pe.sourceCardNum ?? ''}`,
        label: 'この方法で加えたアタックフェイズの開始時の効果',
        effect: {
          effectId: `EXTRA_ATTACK_PHASE_START:${pe.sourceCardNum ?? ''}`,
          effectType: 'AUTO',
          timing: ['ON_ATTACK_PHASE_START'],
          action: { type: 'STUB', id: 'RESOLVE_EXTRA_ATTACK_PHASE_START' } as StubAction,
          duration: 'INSTANT',
          mandatory: true,
        } as CardEffect,
      });
    }
  }

  // 「次の対戦相手のアタックフェイズ開始時、〜」（§6.4 O-3）。
  // ⚠**予約は非ターンプレイヤー（opState）側にある**＝予約したのは「対戦相手のアタックフェイズ」を
  //   待っている側なので、いまターンプレイヤーになっているのはその対戦相手。走査軸は
  //   `pending_opponent_attack_facedown_returns` と同じ（myState を見ると自分のアタックフェイズで誤発火する）。
  if (timing === 'ON_ATTACK_PHASE_START') {
    for (const pn of opState.pending_next_opp_attack_phase_effects ?? []) {
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: pn.sourceCardNum ?? '',
        effectId: `NEXT_OPP_ATTACK_PHASE:${pn.sourceCardNum ?? ''}`,
        label: '次の対戦相手のアタックフェイズ開始時の効果',
        effect: {
          effectId: `NEXT_OPP_ATTACK_PHASE:${pn.sourceCardNum ?? ''}`,
          effectType: 'AUTO',
          timing: ['ON_ATTACK_PHASE_START'],
          action: { type: 'STUB', id: 'RESOLVE_NEXT_OPP_ATTACK_PHASE_EFFECT' } as StubAction,
          duration: 'INSTANT',
          mandatory: true,
        } as CardEffect,
      });
    }
  }

  // 「次の対戦相手のターン終了時、〜」（§6.4 O-3）。
  // ⚠**予約は非ターンプレイヤー（opState）側にある**＝いま終わろうとしているのは「対戦相手のターン」なので、
  //   予約した側はそのターンの非ターンプレイヤー。上のアタックフェイズ版と同じ走査軸
  //   （myState を見ると**自分のターン終了時に誤発火**する）。
  // 「次の**あなたの**ターン終了時、〜」（§6.4 O-4）。⚠こちらは**ターンプレイヤー側**（myState）を読む
  //   ＝予約した本人のターンが終わる瞬間。予約は自分のターン開始時に active スロットへ昇格済み。
  if (timing === 'ON_TURN_END') {
    for (const po of myState.pending_own_turn_end_effects ?? []) {
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: po.sourceCardNum ?? '',
        effectId: `OWN_TURN_END:${po.sourceCardNum ?? ''}`,
        label: '次のあなたのターン終了時の効果',
        effect: {
          effectId: `OWN_TURN_END:${po.sourceCardNum ?? ''}`,
          effectType: 'AUTO',
          timing: ['ON_TURN_END'],
          action: { type: 'STUB', id: 'RESOLVE_OWN_TURN_END_EFFECT' } as StubAction,
          duration: 'INSTANT',
          mandatory: true,
        } as CardEffect,
      });
    }
  }
  if (timing === 'ON_TURN_END') {
    for (const pt of opState.pending_next_opp_turn_end_effects ?? []) {
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: pt.sourceCardNum ?? '',
        effectId: `NEXT_OPP_TURN_END:${pt.sourceCardNum ?? ''}`,
        label: '次の対戦相手のターン終了時の効果',
        effect: {
          effectId: `NEXT_OPP_TURN_END:${pt.sourceCardNum ?? ''}`,
          effectType: 'AUTO',
          timing: ['ON_TURN_END'],
          action: { type: 'STUB', id: 'RESOLVE_NEXT_OPP_TURN_END_EFFECT' } as StubAction,
          duration: 'INSTANT',
          mandatory: true,
        } as CardEffect,
      });
    }
  }

  const ownAutoBlockedTurn = myState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO');
  // collectTurnTriggers はターンプレイヤー=自分が主体（isOwnerTurn: my=true / op=false）
  const myAbilitiesRemovedTurn = collectContinuousAbilitiesRemovedSigni(myState, opState, true, ctx.effectsMap, ctx.cardMap, '自');
  const opAbilitiesRemovedTurn = collectContinuousAbilitiesRemovedSigni(opState, myState, false, ctx.effectsMap, ctx.cardMap, '自');
  // 自分のフィールドシグニ（self）
  for (const stack of myState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    if (ownAutoBlockedTurn) continue;
    if (myAbilitiesRemovedTurn.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (!kizunaOk(ctx, eff, myState, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, myState, opState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 自分のキー（self）。`activeKeyAbilitySources` が全キー／単体キーの能力喪失を一元適用する。
  // `BLOCK_OWN_SIGNI_AUTO` と `collectContinuousAbilitiesRemovedSigni` はシグニ限定なのでキーへは掛けない。
  for (const topNum of activeKeyAbilitySources(myState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (!kizunaOk(ctx, eff, myState, topNum)) continue;
      if (eff.condition && !evalUseCondition(eff.condition, myState, opState, ctx.cardMap, topNum, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // キーワードトークン効果（GRANT_KEYWORD で付与されたキーワードが ON_TURN_END 等を持つ場合）
  const KEYWORD_TOKEN_MAP: Record<string, string> = { 'みこみこ親衛隊': 'WX25-P3-TK03' };
  const myGrantsKT = myState.keyword_grants ?? {};
  for (const stack of myState.field.signi) {
    if (!stack?.length) continue;
    const topNumKT = stack[stack.length - 1];
    if (ownAutoBlockedTurn) continue;
    if (myAbilitiesRemovedTurn.has(topNumKT)) continue;
    for (const kw of (myGrantsKT[topNumKT] ?? [])) {
      const tokenCardKT = KEYWORD_TOKEN_MAP[kw];
      if (!tokenCardKT) continue;
      for (const eff of (ctx.effectsMap.get(tokenCardKT) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
        if (!limitOkMy(eff)) continue;
        const cardNameKT = ctx.cardMap.get(topNumKT)?.CardName ?? topNumKT;
        entries.push({
          id: ctx.genId(), playerId: meId, cardNum: topNumKT, effectId: `${tokenCardKT}:${eff.effectId}:${topNumKT}`,
          label: `${cardNameKT}【${kw}】（${labelSuffix}）`, effect: eff,
        });
      }
    }
  }

  // 🆕**プレイヤー自身が得たキーワードトークン**（2026-09-01 続き760・`WXDi-P12-050-E1`）。
  //   トークンカードの能力は「これを得た**プレイヤー**が『あなた』」なので、ホストはセンタールリグに置く
  //   （`effectId` を一意にするための器＝盤面には何も付いていない）。
  for (const kwP of (myState.player_keywords ?? [])) {
    const tokenCardPK = KEYWORD_TOKEN_MAP[kwP];
    if (!tokenCardPK || ownAutoBlockedTurn) continue;
    const hostPK = myState.field.lrig.at(-1);
    if (!hostPK) continue;
    for (const eff of (ctx.effectsMap.get(tokenCardPK) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if (!limitOkMy(eff)) continue;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: hostPK,
        effectId: `${tokenCardPK}:${eff.effectId}:PLAYER`,
        label: `あなたの【${kwP}】（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 自分のルリグ
  const myLrigNum = myState.field.lrig.at(-1);
  if (myLrigNum) {
    for (const eff of (ctx.effectsMap.get(myLrigNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, myState, opState, true, ctx.cardMap, myLrigNum)) continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(myLrigNum)?.CardName ?? myLrigNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: myLrigNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 起動効果で自センタールリグへ付与されたフェイズ境界AUTO。
  // effectsMap には存在せず PlayerState の専用ストアにだけ入るため、印刷能力とは別に走査する
  // （3ストア横断は `grantedStore.ts` の共通経路。旧実装は base ストア1本しか見ていなかった）。
  for (const eff of grantedStoreWatchers(myState, timing, ['self']).map(w => w.effect)) {
    if (!limitOkMy(eff)) continue;
    entries.push({
      id: ctx.genId(), playerId: meId, cardNum: myLrigNum ?? '', effectId: eff.effectId,
      label: `ルリグ付与効果（${labelSuffix}）`, effect: eff,
    });
  }

  // 相手フィールドシグニ（any_opp / any でこちらのターンにも反応するカード）
  for (const stack of opState.field.signi) {
    if (!stack?.length) continue;
    const topNum = stack[stack.length - 1];
    if (opAbilitiesRemovedTurn.has(topNum)) continue;
    for (const eff of (ctx.effectsMap.get(topNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp' && scope !== 'any') continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手のキー（any_opp / any）。能力喪失の規約は自分側と同じく `activeKeyAbilitySources` に集約済み。
  for (const topNum of activeKeyAbilitySources(opState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp' && scope !== 'any') continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手のセンタールリグ（any_opp/any でこちらのターンにも反応する印刷【自】）。
  // 相手フィールド走査が signi のみで LRIG が構造的に発火しなかった（続き96・ON_ATTACK_PHASE_START の
  // WX12-002/WX19-002/WX21-001 等11枚）。own側ルリグと同じく activeCondition で発火可否を担保する。
  const opLrigNumTurn = opState.field.lrig.at(-1);
  if (opLrigNumTurn) {
    for (const eff of (ctx.effectsMap.get(opLrigNumTurn) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp' && scope !== 'any') continue;
      if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, opState, myState, false, ctx.cardMap, opLrigNumTurn)) continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(opLrigNumTurn)?.CardName ?? opLrigNumTurn;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: opLrigNumTurn, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手側トラッシュ在中の自己蘇生【自】（WD22-035-G「対戦相手のアタックフェイズ開始時…このシグニを
  // トラッシュから場に出してもよい」）。watcher 自身がトラッシュにいるため場走査に掛からない。
  // 一般のトラッシュ能力は走査しない＝自己回収 action を持つカードだけ限定走査
  // （collectFieldTriggers の placedFromTrash 走査と同型ゲート）。
  for (const num of opState.trash) {
    for (const eff of (ctx.effectsMap.get(num) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_opp' && scope !== 'any') continue;
      if (!actionRevivesSelfFromTrash(eff.action)) continue;
      // condition（WD22-035-G の FIELD_COUNT eq 2 等）はカード所有者＝相手側視点で評価する
      if (eff.condition && !evalUseCondition(eff.condition, opState, myState, ctx.cardMap, num, ctx.turnPhase, ctx.effectivePowers)) continue;
      if (!limitOkOp(eff)) continue;
      const cardName = ctx.cardMap.get(num)?.CardName ?? num;
      entries.push({
        id: ctx.genId(), playerId: opId, cardNum: num, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 自分のルリグトラッシュ（ARTS_SELF_RECYCLE_ON_TRIGGER）
  for (const artsNum of (myState.lrig_trash ?? [])) {
    for (const eff of (ctx.effectsMap.get(artsNum) ?? [])) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes(timing)) continue;
      const act = eff.action as StubAction;
      if (act.type !== 'STUB' || act.id !== 'ARTS_SELF_RECYCLE_ON_TRIGGER') continue;
      if (!limitOkMy(eff)) continue;
      const cardName = ctx.cardMap.get(artsNum)?.CardName ?? artsNum;
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: artsNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（${labelSuffix}）`, effect: eff,
      });
    }
  }

  // 相手ルリグの付与AUTO（any_opp/any scope・3ストア横断は `grantedStore.ts` の共通経路）
  for (const eff of grantedStoreWatchers(opState, timing, ['any_opp', 'any']).map(w => w.effect)) {
    if (!limitOkOp(eff)) continue;
    const opLrigNum = opState.field.lrig.at(-1) ?? '';
    entries.push({
      id: ctx.genId(), playerId: opId, cardNum: opLrigNum, effectId: eff.effectId,
      label: `ルリグ付与効果（${labelSuffix}）`, effect: eff,
    });
  }

  // FUTURE SESSION③: 次のAPSにプリオケシグニへアタック時トラッシュ能力を付与（フラグ検出）
  if (timing === 'ON_ATTACK_PHASE_START' && myState.pending_prioke_attack_trash_grant) {
    const priokeSignis = myState.field.signi.flatMap(s => {
      const top = s?.at(-1);
      return (top && (ctx.cardMap.get(top)?.CardClass ?? '').includes('プリオケ')) ? [top] : [];
    });
    if (priokeSignis.length > 0) {
      entries.push({
        id: ctx.genId(), playerId: meId, cardNum: 'WX26-CP1-001', effectId: 'WX26-CP1-001-DELAYED-FS3',
        label: 'FUTURE SESSION③ プリオケシグニへアタック時トラッシュ能力付与',
        effect: {
          effectId: 'WX26-CP1-001-DELAYED-FS3', effectType: 'AUTO', timing: ['ON_ATTACK_PHASE_START'],
          action: { type: 'STUB', id: 'INTERNAL_APPLY_PRIOKE_ATTACK_TRASH' } as StubAction,
          duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
        },
      });
    }
  }

  // PR-Di035 OPEN DREAM LAND!: 次のAPSにプリパラ共通色・レベル3種類チェック（フラグ検出）
  if (timing === 'ON_ATTACK_PHASE_START' && myState.pending_pridi035_paradise) {
    entries.push({
      id: ctx.genId(), playerId: meId, cardNum: 'PR-Di035', effectId: 'PR-Di035-DELAYED-PARADISE',
      label: 'OPEN DREAM LAND! 色別効果（アタックフェイズ開始時）',
      effect: {
        effectId: 'PR-Di035-DELAYED-PARADISE', effectType: 'AUTO', timing: ['ON_ATTACK_PHASE_START'],
        action: { type: 'STUB', id: 'PRDI035_APPLY_PARADISE' } as StubAction,
        duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
      },
    });
  }

  // INSTALL_DELAYED_TRIGGER（B3）: 「**次の**あなたのアタックフェイズ開始時、…」等のターン境界/フェイズ遅延トリガー
  // （§3 Opusタスク10 パターンF-4）。従来 delayed_triggers を見ていたのは ON_REFRESH だけで、フェイズ系の
  // 遅延は parser 側で遅延句が落ちて**即時実行**になっていた（＝アタックフェイズを待たずにその場で発動する過剰効果）。
  // ON_TURN_END は相手ターン中に非ターンプレイヤーが設置する場合もあるため両 state を読む。
  // 他のフェイズ timing は従来どおりターンプレイヤー側だけ（既存の近似と発火範囲を変えない）。
  const delayedHolders = timing === 'ON_TURN_END'
    ? [[meId, myState], [opId, opState]] as const
    : [[meId, myState]] as const;
  for (const [holderId, holderState] of delayedHolders) {
    for (const dt of holderState.delayed_triggers ?? []) {
      if (dt.trigger?.timing !== timing) continue;
      entries.push({
        id: ctx.genId(), playerId: holderId, cardNum: dt.sourceCardNum ?? 'DELAYED_TRIGGER', effectId: 'DELAYED_TRIGGER',
        label: `このターンの遅延トリガー（${labelSuffix}）`,
        effect: {
          effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: [timing],
          action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
        },
      });
    }
  }

  return { entries, usedHostIds, usedGuestIds };
}

/**
 * ON_ALLY_PLAY_OR_OPP_HAND_DISCARD（OR複合・WXDi-P11-064「あなたのターンの間、あなたの他の＜天使＞のシグニが
 * 場に出る か あなたの効果で対戦相手が手札を捨てたとき」）のトリガーを収集する（C1・2026-06-29 配線）。
 * 「あなたのターンの間」＝controller がターンプレイヤーのときのみ。allyPlacedNums=この解決で controller 場に出たシグニ／
 * oppDiscardCount=この解決で相手手札→トラッシュに置かれた枚数。play 枝は triggerFilter（excludeSelf/story）で絞る。
 * ⚠ 近似：「あなたの効果によって」の発生源限定は未判定（相手効果での相手手札捨ても発火しうる）。usedOncePerTurnIds は呼び出し側で永続化。
 */
export function collectAllyPlayOrOppDiscardTriggers(
  ctx: TrigCtx,
  controllerId: string,
  controllerState: PlayerState,
  allyPlacedNums: string[],
  oppDiscardCount: number,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (controllerId !== ctx.activeUserId) return { entries, usedOncePerTurnIds }; // 「あなたのターンの間」
  if (controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  // ⚠上の BLOCK_OWN_SIGNI_AUTO 早期 return はシグニ限定の封じだが、ここでは関数全体を止めるため
  //   ルリグ watcher も巻き添えで止まる（該当実カード0のため既知の近似として据置）。
  for (const topNum of ownFieldSources(controllerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_ALLY_PLAY_OR_OPP_HAND_DISCARD')) continue;
      const filter = eff.triggerFilter;
      // play 枝：味方が場に出た（excludeSelf＝発火元自身は除外／story 等は triggerFilter で照合）
      const playOk = allyPlacedNums.some(n => {
        if (filter?.excludeSelf && n === topNum) return false;
        return !filter || matchesFilter(ctx.cardMap.get(getCardNum(n)), filter);
      });
      // discard 枝：相手手札がトラッシュに置かれた（filter は play 枝専用＝discard 枝には適用しない）
      const discardOk = oppDiscardCount > 0;
      if (!playOk && !discardOk) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（味方場出し/相手手札捨て時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_MATERIAL_USED の「あなたが《改造素材》を使用したとき」（materialUsedByPlayer）変種を収集する（改造素材機構 Step3a・2026-06-29）。
 * 使用者 userId の場シグニ／ルリグの ON_MATERIAL_USED AUTO のうち triggerCondition.materialUsedByPlayer===true のものを発火。
 * 対象シグニ不要（プレイヤー起点）＝WXK09-047-E2（エナから電機回収）/WXK09-049-E1（デッキから電機サーチ）。
 * ⚠「このシグニに/他の味方に使用されたとき」（self/any_ally・対象シグニ依存）は Step2（トークン3択の対象捕捉）が前提＝別途。
 * usedOncePerTurnIds は呼び出し側で userState の actions_done に永続化すること。
 */
export function collectMaterialUsedByPlayerTriggers(
  ctx: TrigCtx, userId: string, userState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (userState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(userState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(userState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_MATERIAL_USED')) continue;
      if (!eff.triggerCondition?.materialUsedByPlayer) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: userId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（改造素材を使用したとき）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_MATERIAL_USED の「このシグニに/あなたの他のシグニに《改造素材》が使用されたとき」（self/any_ally）変種を収集する（改造素材機構 Step3b・2026-06-29）。
 * targetNums=この解決で《改造素材》が使用された対象シグニ（所有者 ownerId の場）。ownerState の場シグニ/ルリグから ON_MATERIAL_USED AUTO
 * （materialUsedByPlayer でないもの）を triggerScope で絞る：self（W が targetNums に含まれる）／any_ally+excludeSelf（W 以外の対象がある）。
 * triggeringCardNum に対象シグニを渡す（targetsTriggerSource 用）。usedOncePerTurnIds は呼び出し側で永続化。
 */
export function collectMaterialUsedOnSigniTriggers(
  ctx: TrigCtx, targetNums: string[], ownerId: string, ownerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (targetNums.length === 0) return { entries, usedOncePerTurnIds };
  if (ownerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(ownerState.actions_done, usedOncePerTurnIds);
  const targetSet = new Set(targetNums);
  for (const topNum of ownFieldSources(ownerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_MATERIAL_USED')) continue;
      if (eff.triggerCondition?.materialUsedByPlayer) continue; // materialUsedByPlayer 変種は別収集
      const scope = eff.triggerScope ?? 'self';
      let trgSigni: string | undefined;
      if (scope === 'any_ally') {
        trgSigni = targetNums.find(n => n !== topNum); // excludeSelf＝発火元以外の対象
        if (!trgSigni) continue;
      } else { // self（既定）＝対象が発火元自身
        if (!targetSet.has(topNum)) continue;
        trgSigni = topNum;
      }
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: ownerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（改造素材が使用されたとき）`, effect: eff, triggeringCardNum: trgSigni,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（「あなたの＜ウェポン＞シグニが効果で対戦相手シグニをバニッシュしたとき」WX07-036）を収集する（C1・2026-06-29）。
 * banisherCardNum=この解決でバニッシュを行った効果の発生源シグニ（＝解決中 entry.cardNum）／banisherOwnerId=その所有者。
 * banisherOwnerState の場シグニ/ルリグから ON_SIGNI_BANISH_OPPONENT_BY_EFFECT AUTO（any_ally/any）を triggerFilter（ウェポン等・バニッシュ実行シグニに対して）で絞って収集。
 * ⚠ 近似：効果解決＝「効果によって」を満たすとみなす／バニッシュ実行シグニは entry.cardNum で近似（連鎖の実発生源は未追跡）。
 */
export function collectBanishOppByEffectTriggers(
  ctx: TrigCtx, banisherCardNum: string, banisherOwnerId: string, banisherOwnerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (banisherOwnerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(banisherOwnerState.actions_done, usedOncePerTurnIds);
  const banisherCard = ctx.cardMap.get(getCardNum(banisherCardNum));
  for (const topNum of ownFieldSources(banisherOwnerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_SIGNI_BANISH_OPPONENT_BY_EFFECT')) continue;
      const scope = eff.triggerScope ?? 'self';
      if (scope !== 'any_ally' && scope !== 'any') continue;
      // triggerFilter（＜ウェポン＞等）はバニッシュ実行シグニ（banisher）に対して照合
      if (eff.triggerFilter && !matchesFilter(banisherCard, eff.triggerFilter)) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: banisherOwnerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（味方ウェポンが効果でバニッシュ時）`, effect: eff, triggeringCardNum: banisherCardNum,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_LRIG_UNDER_MOVED（「あなたのターンの間、あなたのルリグの下からカード1枚が移動したとき」WXDi-P04-042）を収集する（C1・2026-06-29）。
 * controllerId=ルリグ下が変化したプレイヤー。「あなたのターンの間」＝controller がターンプレイヤーのときのみ発火。
 * controller の場シグニ/ルリグから ON_LRIG_UNDER_MOVED self【自】を once_per_turn 制御で収集。
 */
export function collectLrigUnderMovedTriggers(
  ctx: TrigCtx, controllerId: string, controllerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (controllerId !== ctx.activeUserId) return { entries, usedOncePerTurnIds }; // 「あなたのターンの間」
  if (controllerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(controllerState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(controllerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LRIG_UNDER_MOVED')) continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: controllerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（ルリグ下からカード移動時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_DECK_SHUFFLED（「あなたのデッキがシャッフルされたとき」PR-470A）を収集する（C1・2026-06-29）。
 * shufflerId=デッキがシャッフルされたプレイヤー。その場シグニ/ルリグから ON_DECK_SHUFFLED self【自】を収集（usageLimit も評価）。
 */
export function collectDeckShuffledTriggers(
  ctx: TrigCtx, shufflerId: string, shufflerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (shufflerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(shufflerState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(shufflerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_DECK_SHUFFLED')) continue;
      if ((eff.triggerScope ?? 'self') !== 'self') continue;
      if (!limitOk(eff)) continue;
      const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
      entries.push({
        id: ctx.genId(), playerId: shufflerId, cardNum: topNum, effectId: eff.effectId,
        label: `${cardName} の【自】効果（デッキシャッフル時）`, effect: eff,
      });
    }
  }
  return { entries, usedOncePerTurnIds };
}

/**
 * ON_KEYWORD_GAINED（「あなたの他のシグニ1体が【アサシン】か【ランサー】か【ダブルクラッシュ】を得たとき」WXDi-P04-035）を収集する（C1）。
 * gains=この解決で得られた {cardNum, keyword} のリスト（detectKeywordGained）。gainOwnerId=得たプレイヤー（＝watcher と同じ側）。
 * 「他のシグニ」＝watcher 自身（topNum）を得た側（gain.cardNum）から除外。得た各キーワードを triggeringKeyword に積み、
 * COPY_ABILITY が「その能力」として watcher 自身へ付与する。usageLimit（《ターン1回》）も評価。
 */
export function collectKeywordGainedTriggers(
  ctx: TrigCtx, gains: { cardNum: string; keyword: string }[], gainOwnerId: string, ownerState: PlayerState,
): { entries: StackEntry[]; usedOncePerTurnIds: string[] } {
  const entries: StackEntry[] = [];
  const usedOncePerTurnIds: string[] = [];
  if (gains.length === 0) return { entries, usedOncePerTurnIds };
  if (ownerState.blocked_actions?.includes('BLOCK_OWN_SIGNI_AUTO')) return { entries, usedOncePerTurnIds };
  const limitOk = mkLimitOk(ownerState.actions_done, usedOncePerTurnIds);
  for (const topNum of ownFieldSources(ownerState)) {
    for (const eff of effsOf(ctx, topNum)) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_KEYWORD_GAINED')) continue;
      for (const gain of gains) {
        if (gain.cardNum === topNum) continue; // 従来どおり「他のシグニ」だけを収集する
        if (eff.triggerFilter) {
          const { excludeSelf: _x, ...restFilter } = eff.triggerFilter;
          if (Object.keys(restFilter).length > 0
            && !matchesFilter(ctx.cardMap.get(getCardNum(gain.cardNum)), restFilter)) continue;
        }
        if (!limitOk(eff)) continue;
        const cardName = ctx.cardMap.get(getCardNum(topNum))?.CardName ?? topNum;
        entries.push({
          id: ctx.genId(), playerId: gainOwnerId, cardNum: topNum, effectId: eff.effectId,
          label: `${cardName} の【自】効果（味方が【${gain.keyword}】を得たとき）`, effect: eff,
          triggeringCardNum: gain.cardNum, triggeringKeyword: gain.keyword,
        });
      }
    }
  }
  return { entries, usedOncePerTurnIds };
}
/**
 * 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」（`EffectCost.conditionalEnergyReduction`）を
 * **実際のコストへ焼き込む**（§6.4 O-35・続き530／`WX09-011-E2`）。
 *
 * 🔑呼び出しは【出】コスト効果を**集める1点だけ**にする＝提示（モーダル）・可否判定・支払いが
 *   すべて同じ削減後コストを見る（funnel を増やさない）。
 * ⚠削減しきれない色は残す（原文は「減る」であって「支払わない」ではない）。0枚になった色は落とす。
 */
export function applyAbilityCostReduction(
  effect: CardEffect,
  my: PlayerState,
  op: PlayerState,
  cardMap: Map<string, CardData>,
  sourceCardNum: string,
  currentPhase: string,
  effectivePowers?: Map<string, number>,
): CardEffect {
  const red = effect.cost?.conditionalEnergyReduction;
  if (!red) return effect;
  if (!evalUseCondition(red.condition, my, op, cardMap, sourceCardNum, currentPhase, effectivePowers)) return effect;
  const remaining = (effect.cost?.energy ?? []).map(e => ({ ...e }));
  for (const cut of red.energy) {
    let left = cut.count;
    for (const slot of remaining) {
      if (left <= 0) break;
      if (slot.color !== cut.color) continue;
      const take = Math.min(slot.count, left);
      slot.count -= take;
      left -= take;
    }
  }
  return { ...effect, cost: { ...effect.cost, energy: remaining.filter(e => e.count > 0) } };
}
