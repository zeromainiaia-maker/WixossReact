// カードを押したときに出す操作の一覧（手札・トラッシュ・エナ・ルリグデッキ）＝BattleScreen から切り出した（2026-10-24）。
//   🔑**React に依存しない純関数**＝盤面の事実（`CardActionCtx`）と押したときの処理（`CardActionHandlers`）を受け取り、
//   ボタンの一覧を返すだけ。⇒ どの盤面でどのボタンが出るかを golden で直接確かめられる。
//   ⚠本文は画面にあったものをそのまま移した（引数を分解して同じ名前にしてある）。
//   ⚠使えるかの判定は各 gate（`checkSpellUse`／`checkArtsUse`／`checkKeyPieceUse`／`listOffFieldActivatableEffects`／`planRiseSummon`）の1本＝ここで写経しない。
import type { Dispatch, SetStateAction } from 'react';
import type { CardAction } from '../../components/BoardComponents';
import { C } from '../../components/BoardComponents';
import type { CardData } from '../../types';
import type { BattleModalCtx } from './modals/types';
import type { useSpellCast } from './hooks/useSpellCast';
import type { useArtsModal } from './hooks/useArtsModal';
import type { useActivatedModals } from './hooks/useActivatedModals';
import type { useSigniSummonFlow } from './hooks/useSetupFlow';
import type { buildEffectivePowers } from './controller/battleMaterials';
import type { ResonaPaymentItem, ResonaSummonCandidate } from './resonaSummon';
import { getCardNum, evalUseCondition } from '../../engine/effectExecutor';
import { getRiseRequirement, isTrashImmuneByOpponent } from '../../engine/execUtils';
import { isHandSigniPlayBlockedByPower } from '../../engine/blockAction';
import { declaredSigniOverride, meetsRestriction, type effectiveLrigClass } from './growLogic';
import { planRiseSummon } from './riseSummon';
import { hasIgnoreLrigRestriction, checkArtsUse } from './artsUseGate';
import { checkSpellUse } from './spellUseGate';
import { checkKeyPieceUse } from './keyPieceUseGate';
import { listOffFieldActivatableEffects, offFieldActivateTiming, isEnergyAcceActivated } from './offFieldActivateGate';
import { handActivateCostLabel } from './handActivateCost';
import { trashActivateCostLabels, trashActivateVerbLabel } from './trashActivateCost';
import { getResonaSummonCandidate, resonaCombinedOptions, resonaPaymentOptions } from './resonaSummon';
import { cardNameUseBlocked } from './cardNameUseBlock';
import { canAffordEnergyCostWithSubstitutes } from './costs';
import { energyPoolCardNums } from './energyPaySource';
import { isPieceCardType } from './battleUtils';
import type { PlayerState } from '../../types';
import type { useAssistModals } from './hooks/useAssistModals';
import type { useGuardResponses } from './hooks/useMiscBattleUI';
import type { useKeyModals } from './hooks/useKeyModals';
import type { useSigniActivated } from './hooks/useSigniActivated';
import { calcContinuousBlockedActions, collectAltAttackFlipSigni } from '../../engine/effectEngine';
import {CHEER_ZONE, signiStackAt} from '../../engine/cheerZone';
import { collectGrantedLrigEffects, listActivatableAssistLrigEffects, listActivatableLrigEffects, listActivatableGrantedLrigEffects, listActivatableInheritedLrigEffects } from './lrigActivateGate';
import { assistLrigAttackableSlots, type LrigAttackSlot } from './assistLrigAttack';
import { attackFieldTrashCost } from './attackFieldTrashCost';
import { canActivateKeyEffect } from './keyActivateGate';
import { canCardGuard } from './guard';
import { canSigniAttack, signiAttackColorlessCost } from './signiAttackGate';
import { centerLrigAttackBlock } from './lrigAttackGate';
import { cheerAttackTargets } from './cheerAttack';
import { fmtDiscardFilterLabel, fmtHandDiscardSigniLabel } from './costs';
import { fmtLrigDownCostLabel } from './lrigDownCost';
import { listActivatableSeedEffects, listActivatableSigniEffects } from './signiActivateGate';
import { sideAttackEmptyZoneDealsDamage } from './sideAttackDamage';
import { signiAttackBanHandDiscardCost } from './signiAttackBan';

/** 操作一覧を決める盤面の事実（画面が毎レンダーで組む）。 */
export type CardActionCtx = Pick<BattleModalCtx,
  'loading' | 'isMyTurn' | 'bs' | 'my' | 'op' | 'battleCards' | 'battleCardMap' | 'effectsMap'
  | 'myArtsPayerCtx' | 'myEnergyPayPool' | 'myEnaAllMulti' | 'myEnaMultiStripped' | 'myColorlessOverrides'
  | 'myColorSubs' | 'myEnergyExtraColors' | 'myWholeEnergySubstitutes'> & {
  /** 自己使用の判定に使う「付与前」の効果表（キーピースの `SELF_PLAY_RESTRICT`）。 */
  baseEffectsMap: BattleModalCtx['effectsMap'];
  effectivePowers: ReturnType<typeof buildEffectivePowers>;
  /** センタールリグのタイプ（限定条件の照合）。 */
  lrigClass: ReturnType<typeof effectiveLrigClass>;
  currentLrigLevel: number;
  /** 場のシグニのレベル合計（リミットの照合）。 */
  fieldSigniTotal: number;
  lrigLimit: number;
  fieldSigniCountLimit: number;
  /** スペルの使用が封じられているか（`spellUseGate.isSpellUseBlockedFor`）。 */
  isSpellUseBlocked: (card: { Color?: string } | undefined) => boolean;
};

/** ボタンを押したときに画面が行うこと。 */
export interface CardActionHandlers {
  handleEnergyChargeFromHand: (handIndex: number) => unknown;
  setPendingSigniSummon: ReturnType<typeof useSigniSummonFlow>['setPendingSigniSummon'];
  openSpellCast: ReturnType<typeof useSpellCast>['openSpellCast'];
  setBetAmount: ReturnType<typeof useArtsModal>['setBetAmount'];
  openHandActivated: ReturnType<typeof useActivatedModals>['openHandActivated'];
  castGrantedTrashSpell: (cardNum: string, from: 'self' | 'opponent') => Promise<void>;
  openTrashActivated: ReturnType<typeof useActivatedModals>['openTrashActivated'];
  setSelectedResonaPayment: Dispatch<SetStateAction<ResonaPaymentItem[]>>;
  setPendingResonaSummon: Dispatch<SetStateAction<ResonaSummonCandidate | null>>;
  openArtsModal: ReturnType<typeof useArtsModal>['openArtsModal'];
  openKeyModal: (card: CardData) => void;
}

export function handCardActions(c: CardActionCtx, h: CardActionHandlers, cardNum: string, handIndex: number): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCards, battleCardMap, effectsMap, effectivePowers, myArtsPayerCtx, lrigClass, currentLrigLevel, fieldSigniTotal, lrigLimit, fieldSigniCountLimit } = c;
  const { handleEnergyChargeFromHand, setPendingSigniSummon, openSpellCast, setBetAmount, openHandActivated } = h;
  if (loading) return [];
  // 非自分ターンでも ATTACK_ARTS_OP は手札起動効果を許可
  if (!isMyTurn && bs.turn_phase !== 'ATTACK_ARTS_OP') return [];
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
      // 🆕§5.3 `O-226`（2026-09-04）＝「宣言したシグニの基本レベルは0になり、限定条件を無視して場に出せる」
      //   （`WXK09-001-E3`）。⚠**名前が一致したときだけ**効く（フラグだけ見ると全シグニが対象＝過剰実行）。
      const declaredOverride = declaredSigniOverride(my, cardData.CardName);
      const signiLevel = declaredOverride.levelZero ? 0 : (parseInt(cardData.Level) || 0);
      // レベル制限: シグニLv ≤ ルリグLv
      const levelOk = signiLevel <= currentLrigLevel;
      // リミット制限: 空きゾーンに召喚後の合計レベルがリミット以内であること
      // ＋ LIMIT_ALL_FIELD_N: 場のシグニ体数が上限未満であること（WX04-005-E3「1体しか場に出せない」）
      const myCurrentSigniCount = my.field.signi.filter(stk => (stk ?? []).length > 0).length;
      // 🆕🔴**§5.3 `O-147`（2026-09-05）＝【ライズ】はこのゲートを通れないことがあった。**
      //   旧実装は**空きゾーンがあること**と `fieldSigniTotal + Lv <= リミット` しか見ておらず、
      //   ライズ（＝場のシグニ1体の上に置く＝下敷きのレベルと入れ替わる）では
      //   **「盤面が埋まっている」「合計レベルが足りない」だけで「召喚」ボタンが消えていた**＝
      //   合法なライズが打てない（過少実行）。⇒ 配置先の種類ごとに判定を分ける。
      //   ⚠**モーダル（`SigniSummonZoneModal`）と同じ規則を使う**（片方だけ直すと
      //     「押せるのに置けない／置けるのに押せない」になる）。
      const handRiseReq = getRiseRequirement(cardData.EffectText ?? '');
      // 🆕§5.6 `C-6`＝【ライズ】の置き方の可否は `planRiseSummon`（`riseSummon.ts`）の1本＝CPU も同じ関数で置き方を決める。
      const canFitSomewhere = handRiseReq
        ? planRiseSummon({
          my, req: handRiseReq, signiLevel, fieldSigniTotal, lrigLimit, fieldSigniCountLimit, cardMap: battleCardMap,
        }) !== null
        : myCurrentSigniCount < fieldSigniCountLimit && [0, 1, 2].some(zi => {
          const isEmpty = (my.field.signi[zi] ?? []).length === 0;
          return isEmpty && (fieldSigniTotal + signiLevel) <= lrigLimit;
        });
      // Restriction チェック
      const restrictionOk = meetsRestriction(cardData.Restriction, lrigClass,
        hasIgnoreLrigRestriction(my, effectsMap, 'signi', cardData) || declaredOverride.ignoreRestriction);
      const printedPower = cardData.Power === '∞' ? Infinity : parseInt(cardData.Power ?? '', 10);
      const powerBlockOk = !isHandSigniPlayBlockedByPower(my, printedPower);
      if (levelOk && canFitSomewhere && restrictionOk && powerBlockOk) {
        actionList.push({
          label: '召喚',
          color: C.success,
          onClick: () => setPendingSigniSummon({ cardNum, handIndex }),
        });
      }
    }
    // ⚠スペル使用の封じは**3軸**（`USE_SPELL` ／ `PLAY_COLORLESS` ／ `BLOCK_NON_WHITE_SPELL`）＝
    //   `spellUseGate.isSpellUseBlockedFor` の1関数に集約（§6.4 O-18 続き513）。
    //   🔴続き460 では `USE_SPELL` だけを塞いだので、残り2軸は**押しても無反応**のまま残っていた。
    // ⚠**判定は `spellUseGate.checkSpellUse` 1本**（§8 `O-1` (b)）＝封じ3軸・限定・カード名封じ・
    //   ディソナ制限・低コスト封じ・使用条件をそこで見る。CPU の候補フィルタも同じ関数を呼ぶ。
    // ⚠**ここでは `affordable` を見ない**（従来どおり）＝スペルのコストは支払いUI の任意支払い
    //   （手札を捨てての置換・使用時の任意支払い）で下がるので、基本コストで切ると**払える札を隠す**。
    if (cardData?.Type === 'スペル' && myArtsPayerCtx && checkSpellUse({
      card: cardData, my, op, isMyTurn, turnPhase: bs.turn_phase,
      pendingSpell: !!bs.pending_spell, cards: battleCards, cardMap: battleCardMap, effectsMap,
      payer: myArtsPayerCtx, effectivePowers,
    }).usable) {
      actionList.push({
        label: '発動',
        color: C.accent,
        onClick: () => { openSpellCast({ cardNum, handIndex }); setBetAmount(0); },
      });
    }
  }

  // v0.277: 手札から発動できる【起】（MAIN / ATTACK_ARTS / ATTACK_ARTS_OP フェイズ）
  {
    // 🆕§5.7 `S-7`＝提示の判定は CPU と同じ `listOffFieldActivatableEffects` 1本（窓・回数・条件・払えるコストの形）。
    for (const eff of listOffFieldActivatableEffects({
      zone: 'hand', cardNum, my, op, turnPhase: bs.turn_phase, isMyTurn,
      cardMap: battleCardMap, effectsMap, effectivePowers,
    })) {
      actionList.push({
        label: `【起】${handActivateCostLabel(eff)}`,
        color: '#ff6b35',
        onClick: () => { openHandActivated({ cardNum, handIndex, effect: eff }); },
      });
    }
  }

  return actionList;
}

export function opTrashCardActions(c: CardActionCtx, h: CardActionHandlers, cardNum: string): CardAction[] {
  const { loading, isMyTurn, bs, my } = c;
  const { castGrantedTrashSpell } = h;
  if (loading || !isMyTurn) return [];
  const phase = bs.turn_phase;
  if (phase !== 'MAIN' && phase !== 'ATTACK_ARTS') return [];
  const granted = (my.trash_spells_usable_this_turn ?? [])
    .some(e => e.cardNum === cardNum && e.from === 'opponent');
  if (!granted) return [];
  return [{
    label: '【使用】このターン使用できる（コストを支払う）',
    color: '#ff6b35',
    onClick: () => { void castGrantedTrashSpell(cardNum, 'opponent'); },
  }];
}

export function trashCardActions(c: CardActionCtx, h: CardActionHandlers, cardNum: string): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCardMap, effectsMap, effectivePowers, myEnergyPayPool } = c;
  const { castGrantedTrashSpell, openTrashActivated } = h;
  if (loading) return [];
  const actions: CardAction[] = [];
  // 《メインフェイズアイコン》＝自分の MAIN／《アタックフェイズアイコン》＝アーツステップ。
  // 🆕2026-09-26（ルール＝ユーザー確認）＝相手ターンの相手のアーツステップ（`ATTACK_ARTS_OP`）でも起動できる。
  //   ⚠窓の判定は `offFieldActivateTiming` の1本（下の `listOffFieldActivatableEffects` が見る）＝ここで写経しない。
  const phase = bs.turn_phase;
  if (!offFieldActivateTiming('trash', phase, isMyTurn)) return actions;
  // §6.4 O-17:「対戦相手の（すべての領域／手札と場とエナゾーンとトラッシュに）あるシグニは能力を失う」は
  // トラッシュのカードにも `abilities_removed` を積む。⚠ここで見ないと**トラッシュ起動だけが素通り**して、
  // 領域を跨いだ能力喪失が「候補を広げただけの見せかけ」になる。
  if (my.abilities_removed?.includes(cardNum)) return actions;
  // §6.4 O-10（続き514）＝「対戦相手のトラッシュ…にあるカードは能力を失い」（`WX12-023`）＝
  // 相手の場に宣言があれば**自分のトラッシュ起動は丸ごと使えない**。
  if (isTrashImmuneByOpponent(op, battleCardMap, effectsMap)) return actions;
  // 🆕**§5.3 `O-185`＝「このターン使用してもよい」で許可されたスペル**（【起】ではない別入口）。
  // ⚠スペルの使用は自分のターンだけ（相手のアーツステップはこの入口の窓ではない）。
  if (isMyTurn && (my.trash_spells_usable_this_turn ?? []).some(e => e.cardNum === cardNum && e.from === 'self')) {
    actions.push({
      label: '【使用】このターン使用できる（コストを支払う）',
      color: '#ff6b35',
      onClick: () => { void castGrantedTrashSpell(cardNum, 'self'); },
    });
  }
  // 🆕§5.7 `S-7`＝提示の判定は CPU と同じ `listOffFieldActivatableEffects` 1本。
  for (const eff of listOffFieldActivatableEffects({
    zone: 'trash', cardNum, my, op, turnPhase: phase, isMyTurn,
    cardMap: battleCardMap, effectsMap, effectivePowers, energyPool: myEnergyPayPool,
  })) {
    const costLabel = trashActivateCostLabels(eff, my, op).join('・');
    // 🆕**ラベルは本体アクションから決める**（§5.3 `O-114`）＝「トラッシュから出す」固定だと
    //   自己回収（`TRANSFER_TO_HAND`）の【起】が「場に出す」と嘘をつく。
    const verb = trashActivateVerbLabel(eff);
    actions.push({
      label: costLabel ? `【起】${verb}（${costLabel}）` : `【起】${verb}`,
      color: '#ff6b35',
      onClick: () => { openTrashActivated({ cardNum, effect: eff }); },
    });
  }
  return actions;
}

export function energyCardActions(c: CardActionCtx, h: CardActionHandlers, cardNum: string): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCardMap, effectsMap, effectivePowers, myEnergyPayPool } = c;
  const { openTrashActivated } = h;
  if (loading) return [];
  const actions: CardAction[] = [];
  const phase = bs.turn_phase;
  // 🆕2026-09-26＝窓の判定は `offFieldActivateTiming` の1本（相手のアーツステップを含む）。
  if (!offFieldActivateTiming('energy', phase, isMyTurn)) return actions;
  if (my.abilities_removed?.includes(cardNum)) return actions;
  // 🆕§5.7 `S-7`＝提示の判定は CPU と同じ `listOffFieldActivatableEffects` 1本。
  for (const eff of listOffFieldActivatableEffects({
    zone: 'energy', cardNum, my, op, turnPhase: phase, isMyTurn,
    cardMap: battleCardMap, effectsMap, effectivePowers, energyPool: myEnergyPayPool,
  })) {
    // 🆕§5.7 `S-33`＝エナのアクセ【起】は専用ボタン（「【アクセ】」）が出す＝ここでは重ねない。
    if (isEnergyAcceActivated(eff)) continue;
    const costLabel = trashActivateCostLabels(eff, my, op).join('・');
    actions.push({
      label: costLabel ? `【起】エナゾーンから手札に加える（${costLabel}）` : '【起】エナゾーンから手札に加える',
      color: '#4caf50',
      onClick: () => { openTrashActivated({ cardNum, effect: eff }); },
    });
  }
  return actions;
}

export function lrigDeckCardActions(c: CardActionCtx, h: CardActionHandlers, cardNum: string): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCards, battleCardMap, effectsMap, baseEffectsMap, effectivePowers, myArtsPayerCtx, myEnergyPayPool, myEnaAllMulti, myEnaMultiStripped, myColorlessOverrides, myColorSubs, myEnergyExtraColors, myWholeEnergySubstitutes, lrigClass, currentLrigLevel, fieldSigniTotal, lrigLimit, isSpellUseBlocked } = c;
  const { setSelectedResonaPayment, setPendingResonaSummon, openSpellCast, setBetAmount, openArtsModal, openKeyModal } = h;
  if (loading) return [];
  const cardData = battleCardMap.get(cardNum);
  if (!cardData) return [];
  const ignoreCardRestriction = cardData.Type === 'アーツ'
    && hasIgnoreLrigRestriction(my, effectsMap, 'arts', cardData);
  if (!meetsRestriction(cardData.Restriction, lrigClass, ignoreCardRestriction)) return [];

  const phase = bs.turn_phase;
  const actions: CardAction[] = [];

  // ── レゾナ【出現条件】── MAIN と ATTACK_ARTS の共通支払いフロー。
  if (cardData.Type === 'レゾナ') {
    const appearanceTiming = phase === 'MAIN' ? 'MAIN'
      : (phase === 'ATTACK_ARTS' || phase === 'ATTACK_ARTS_OP') ? 'ATTACK' : null;
    const canUseWindow = (phase === 'MAIN' && isMyTurn) ||
      (phase === 'ATTACK_ARTS' && isMyTurn) ||
      (phase === 'ATTACK_ARTS_OP' && !isMyTurn);
    if (!canUseWindow || !appearanceTiming || bs.pending_spell) return actions;
    const candidate = getResonaSummonCandidate(cardNum, my, battleCardMap, effectsMap, appearanceTiming);
    const resonaLevel = parseInt(cardData.Level ?? '0', 10) || 0;
    const fieldItems = candidate
      ? (candidate.payment.combined
        ? resonaCombinedOptions(my, candidate.payment, battleCardMap).filter(i => i.zone === 'field')
        : candidate.payment.groups.flatMap(g => g.zone === 'field'
          ? resonaPaymentOptions(my, g, battleCardMap).map(index => ({ zone: 'field' as const, index }))
          : []))
      : [];
    const fieldPayCount = candidate?.payment.combined?.count
      ?? candidate?.payment.groups.filter(g => g.zone === 'field').reduce((n, g) => n + g.count, 0)
      ?? 0;
    const maxPaidFieldLevels = fieldItems
        .map(i => parseInt((battleCardMap.get(my.field.signi[i.index]?.at(-1) ?? '') ?? battleCardMap.get(getCardNum(my.field.signi[i.index]?.at(-1) ?? '')))?.Level ?? '0', 10) || 0)
        .sort((a, b) => b - a)
        .slice(0, fieldPayCount)
        .reduce((sum, lv) => sum + lv, 0)
      ;
    const canFitLimit = fieldSigniTotal - maxPaidFieldLevels + resonaLevel <= lrigLimit;
    if (candidate && resonaLevel <= currentLrigLevel && canFitLimit) {
      actions.push({
        label: '【出現条件】で召喚',
        color: C.accent,
        onClick: () => {
          setSelectedResonaPayment([]);
          setPendingResonaSummon(candidate);
        },
      });
    }
    return actions;
  }

  // ── スペル/クラフト（フェゾーネマジック）── メインフェイズに手札スペルと同様に使用可能
  if (cardData.Type === 'スペル/クラフト') {
    if (cardNameUseBlocked(my, cardData.CardName, cardData.Type)) return actions;
    // pending_spell がある間は新たにスペルを発動できない
    const spellBlocked = !!bs.pending_spell;
    const canUse = !isSpellUseBlocked(cardData) && phase === 'MAIN' && isMyTurn && !spellBlocked;
    // スペル使用条件（手札スペルと同様にACTIVATED効果の condition を評価）
    const spellEff = (effectsMap.get(cardNum) ?? []).find(e => e.effectType === 'ACTIVATED');
    const condOk = !spellEff?.condition || evalUseCondition(spellEff.condition, my, op, battleCardMap, cardNum, bs.turn_phase, effectivePowers);
    // コスト支払い可能か（簡易チェック：エナで賄えるか）
    const costOk = canAffordEnergyCostWithSubstitutes({
      poolNums: energyPoolCardNums(myEnergyPayPool), cards: battleCards, baseCost: cardData.Cost,
      extraCosts: [], keywordGrants: my.keyword_grants, allMulti: myEnaAllMulti,
      stripped: myEnaMultiStripped, colorlessOverrides: myColorlessOverrides,
      colorSubs: myColorSubs, extraColorMap: myEnergyExtraColors,
      banColorlessPay: my.cannot_pay_colorless_this_attack_phase,
      wholeSubstitutes: myWholeEnergySubstitutes,
    });
    if (canUse && condOk && costOk) {
      actions.push({
        label: '使用',
        color: C.accent,
        onClick: () => { openSpellCast({ cardNum, handIndex: -1, fromLrigDeck: true }); setBetAmount(0); },
      });
    }
    return actions;
  }

  // ── アーツ（'アーツ/クラフト'＝改造素材等8枚も同経路で使用可能）──
  if (cardData.Type === 'アーツ' || cardData.Type === 'アーツ/クラフト') {
    // ⚠**判定は `artsUseGate.checkArtsUse` 1本**（§8 `O-1`）＝カード名封じ・限定・フェイズ/Timing・
    //   `ARTS_LIMIT_1`・使用条件・実効コスト・支払い可否をすべてそこで見る。CPU の応答アーツも
    //   同じ関数を呼ぶので、ここに条件を足すときは gate 側へ足すこと（写経すると人間と CPU がズレる）。
    if (!myArtsPayerCtx) return actions;
    const artsCheck = checkArtsUse({
      card: cardData, my, op, isMyTurn, turnPhase: bs.turn_phase,
      cards: battleCards, cardMap: battleCardMap, effectsMap,
      payer: myArtsPayerCtx, effectivePowers,
    });
    if (artsCheck.usable) {
      actions.push({
        label: '使用',
        color: C.coin,
        onClick: () => {
          // 印刷コストから動いたときだけ実効コストを持ち込む（null＝Phase2 が印刷コストを使う）。
          openArtsModal(cardData, artsCheck.effectiveCostForModal);
        },
      });
    }
  }

  // ── キーピース ──
  // 🆕§5.6 `C-7`＝判定は `keyPieceUseGate.checkKeyPieceUse` の1本（枠の空き・Timing・`SELF_PLAY_RESTRICT`・
  //   実効コスト・コインの使用制限・使用条件）。CPU も同じ関数を見る＝**ここに条件を足さない**（写経すると人間と CPU がズレる）。
  if ((cardData.Type === 'キー' || isPieceCardType(cardData.Type)) && myArtsPayerCtx) {
    const keyCheck = checkKeyPieceUse({
      card: cardData, my, op, isMyTurn, turnPhase: bs.turn_phase ?? '',
      cards: battleCards, cardMap: battleCardMap, effectsMap, selfPlayEffectsMap: baseEffectsMap,
      payer: myArtsPayerCtx, effectivePowers,
    });
    if (keyCheck.usable) {
      actions.push({
        // ピースは「セット」ではなく**使用**（1回払って即解決→ルリグトラッシュ）。
        label: keyCheck.isPiece ? 'ピースを使用' : 'キーにセット',
        color: '#cc8800',
        onClick: () => { openKeyModal(cardData); },
      });
    }
  }

  return actions;
}

// ─── 場のシグニ・ルリグ・キー・アシスト（2026-10-24 第566バッチで移設） ───────────────

/** 場の操作一覧を決める盤面の事実。 */
export type FieldActionCtx = Pick<CardActionCtx,
  'loading' | 'isMyTurn' | 'bs' | 'my' | 'op' | 'battleCardMap' | 'effectsMap' | 'effectivePowers' | 'myEnergyPayPool'> & {
  /** 継続効果による封じ（`calcContinuousBlockedActions`）。 */
  contBlocked: ReturnType<typeof calcContinuousBlockedActions>;
  /** 継続効果で得ているキーワード（自分／相手のシグニごと）。 */
  dynamicKeywords: { my: Record<string, string[]>; op: Record<string, string[]> };
  grantedMyLrigEffects: ReturnType<typeof collectGrantedLrigEffects>;
  isActionBlocked: (actionId: string) => boolean;
  /** ルリグアタックの追加コストと可否（画面の `lrigAttackCostInfo`）。 */
  lrigAttackCostInfo: (my: PlayerState, op: PlayerState, lrigNum: string | null | undefined) => { blocked: boolean; colorless: number; fieldTrash: number };
  getAssistGrowCandidates: (side: 'l' | 'r') => CardData[];
};

/** 場の操作のボタンを押したときに画面が行うこと。 */
export interface FieldActionHandlers {
  handleEnergyChargeFromSigni: (zoneIndex: number) => unknown;
  handleFlipAttack: (attackZone: number, flipZones: number[]) => Promise<void>;
  handleLrigAttack: (slot?: LrigAttackSlot) => Promise<void>;
  handleSigniAttack: (zoneIndex: number) => Promise<void>;
  handleSigniSideAttack: (zoneIndex: number, targetOpZone: number) => Promise<void>;
  openAssistActivated: ReturnType<typeof useAssistModals>['openAssistActivated'];
  openAssistGrow: ReturnType<typeof useAssistModals>['openAssistGrow'];
  openGuardBarrierAct: ReturnType<typeof useGuardResponses>['openGuardBarrierAct'];
  openKeyActivated: ReturnType<typeof useKeyModals>['openKeyActivated'];
  openLrigGranted: ReturnType<typeof useActivatedModals>['openLrigGranted'];
  openSigniActivated: ReturnType<typeof useSigniActivated>['openSigniActivated'];
}

export function signiZoneActions(c: FieldActionCtx, h: FieldActionHandlers, rawZoneIdx: number): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCardMap, effectsMap, effectivePowers, myEnergyPayPool, contBlocked, dynamicKeywords } = c;
  const { handleEnergyChargeFromSigni, handleFlipAttack, handleSigniAttack, handleSigniSideAttack, openSigniActivated } = h;
  // 🆕2026-09-26（ルール＝ユーザー確認）＝**使用タイミングにアタックフェイズがある【起】は、相手ターンの相手のアーツステップでも起動できる**
  //   （`ATTACK_ARTS_OP`＝自分が非ターンプレイヤーのアーツステップ）。判定は同じゲートに `phase: 'ATTACK_ARTS'` で渡す。
  const oppArtsStep = !isMyTurn && bs.turn_phase === 'ATTACK_ARTS_OP';
  if ((!isMyTurn && !oppArtsStep) || loading) return [];
  // 🆕§5.3 `O-538` 段階2＝`CHEER_ZONE` でチアゾーンのシグニも同じ関数で扱う（【起】）。
  const stack = signiStackAt(my, rawZoneIdx);
  const isCheer = rawZoneIdx === CHEER_ZONE;

  if (bs.turn_phase === 'ENERGY') {
    const used    = my.actions_done?.includes('ENERGY') ?? false;
    const blocked = my.blocked_actions?.includes('ENERGY') ?? false;
    if (used || blocked) return [];
    if (!stack || stack.length === 0) return [];
    return [{ label: 'エナチャージ', color: C.accent, onClick: () => handleEnergyChargeFromSigni(rawZoneIdx) }];
  }

  // MAIN（メインフェイズ）と ATTACK_ARTS（自分のアタックフェイズ＝アーツステップ）の場シグニ【起】発動。
  // 《アタックフェイズアイコン》付き【起】（timing:['ATTACK_ARTS']）はアタックフェイズのみ、無印【起】（timing未指定/['MAIN']）はメインのみ。
  if (bs.turn_phase === 'MAIN' || bs.turn_phase === 'ATTACK_ARTS' || oppArtsStep) {
    const actPhase: 'MAIN' | 'ATTACK_ARTS' = bs.turn_phase === 'MAIN' ? 'MAIN' : 'ATTACK_ARTS';
    // 🆕**§5.3 `O-218`（2026-09-04）＝【シード】として置いたカードの【起】を提示する。**
    //   🔴engine（`SEED_BLOOM{seedTargetSelf}`）は完成済みで、欠けていたのは**入口だけ**だった
    //     ＝`field.signi_seeds` を読むのは cardMap のロード1箇所で、能力を surface するコードが無かった。
    //   ⚠**シグニの有無と独立**＝シードはシグニが居ないゾーンにも置ける（先に返さない）。
    const seedActions: CardAction[] = [];
    const seedNum = isCheer ? null : (my.field.signi_seeds?.[rawZoneIdx] ?? null);
    if (seedNum) {
      for (const seedEff of listActivatableSeedEffects({
        my, op, zoneIndex: rawZoneIdx, phase: actPhase, isMyTurn,
        effectsMap, cardMap: battleCardMap, energyPool: myEnergyPayPool,
        effectivePowers, contBlockedSelf: contBlocked.forSelf,
      })) {
        const seedCostLabel = trashActivateCostLabels(seedEff, my, op).join('・');
        seedActions.push({
          label: `【起】この【シード】${seedCostLabel ? `（${seedCostLabel}）` : ''}`,
          color: '#44ff88',
          onClick: () => { openSigniActivated({ cardNum: seedNum, effect: seedEff }); },
        });
      }
    }
    if (!stack || stack.length === 0) return seedActions;
    const topNum = stack[stack.length - 1];
    // GATE: 【起】の発動可否は `signiActivateGate` に一本化（人間ボタン／CPU の候補フィルタと同じ関数）。
    const activatable = listActivatableSigniEffects({
      my, op, zoneIndex: rawZoneIdx, phase: actPhase, isMyTurn,
      effectsMap, cardMap: battleCardMap, effectivePowers, contBlockedSelf: contBlocked.forSelf,
    });
    if (activatable.length === 0) return seedActions;
    return [...seedActions, ...activatable.map(eff => {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const costLabel = eff.cost
        ? [
            energyTotal > 0 ? `エナ${energyTotal}` : null,
            eff.cost.coin ? `コイン${eff.cost.coin}` : null,
            eff.cost.discard ? `手札${eff.cost.discard}枚トラッシュ` : null,
            // 🆕**`handDiscardSigni`（条件つき手札捨て）と `energyTrash`（エナ指定枚数）をラベルに出す**（§5.3 `O-46`）。
            //   ⚠出さないと ①プレイヤーにコストが見えない ②同名の【起】を撃ち分けられない（§4.4 罠8m）。
            eff.cost.handDiscardSigni ? `手札の${fmtHandDiscardSigniLabel(eff.cost.handDiscardSigni)}シグニ${eff.cost.handDiscardSigni.count}枚捨て` : null,
            eff.cost.energyTrash ? `エナ${eff.cost.energyTrash.count}枚トラッシュ` : null,
            eff.cost.discardAll ? '手札すべて捨て' : null,
            eff.cost.energyTrashAll ? 'エナすべトラッシュ' : null,
            eff.cost.discardVariable ? `手札${eff.cost.discardVariable.min}枚以上捨て` : null,
            eff.cost.down_self ? 'ダウン' : null,
            eff.cost.underSelfTrash ? `このシグニの下${eff.cost.underSelfTrash.count}枚トラッシュ` : null,
            // 🆕§5.3 `O-313`（2026-09-12）＝「付いているカードか下にあるカード」。
            //   🔴**ラベルに出さないと「コストなし」と表示される**＝プレイヤーに踏み倒しに見える（§4.4-8m）。
            eff.cost.attachedOrUnderTrash ? `付いているカード/下のカード${eff.cost.attachedOrUnderTrash.count}枚トラッシュ` : null,
            eff.cost.removeOppVirus ? `ウィルス${eff.cost.removeOppVirus}除去` : null,
            eff.cost.trash_self ? 'このシグニをトラッシュ' : null,
            eff.cost.bounceSelf ? 'このシグニを手札に戻す' : null,
            eff.cost.fieldExileSelf ? 'このシグニをゲームから除外' : null,
            eff.cost.trash_key ? 'このキーをルリグトラッシュ' : null,
            eff.cost.charmTrash ? `チャーム${eff.cost.charmTrash}枚トラッシュ` : null,
            eff.cost.acceTrash ? `アクセ${eff.cost.acceTrash}枚トラッシュ` : null,
            eff.cost.fieldTrash ? `場の${eff.cost.fieldTrash.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldTrash.count}体トラッシュ` : null,
            // ⚠**行き先はエナゾーン**なので「トラッシュ」と書き分ける（§5.3 `O-67`）。ラベルに出さないと
            //   ①プレイヤーにコストが見えない ②同名の【起】を2つ持つカードで撃ち分けられない（§4.4 罠8m）。
            eff.cost.fieldBanish ? `場の${eff.cost.fieldBanish.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldBanish.count}体バニッシュ` : null,
            // ⚠`excludeSelf`（「**他の**シグニ」）をラベルに出す＝`fieldTrash`／`fieldBanish` と同じ書き分け。
            //   出さないと ①プレイヤーに「自分は払わない」ことが見えない ②同名の【起】を撃ち分けられない（§4.4-8m）。
            eff.cost.fieldDown ? `場の${eff.cost.fieldDown.excludeSelf ? '他の' : ''}シグニ${eff.cost.fieldDown.count}体ダウン` : null,
            eff.cost.lrigDown ? fmtLrigDownCostLabel(eff.cost.lrigDown) : null,
          ].filter(Boolean).join('・') || 'コストなし'
        : 'コストなし';
      return {
        label: `【起】${costLabel}`,
        color: C.coin,
        onClick: () => { openSigniActivated({ cardNum: topNum, effect: eff }); },
      };
    })];
  }

  if (bs.turn_phase === 'ATTACK_SIGNI') {
    if (!stack || stack.length === 0) return []; // シグニなし
    // ⚠「すでにダウン」は **gate（`ALREADY_DOWN`）** が見る（§6.4 O-10）＝ここに写経すると
    //   【常】「このシグニはダウン状態でもアタックできる」の例外が人間側にだけ効かない。
    if (op.field.check) return []; // 相手のライフバースト処理待ち
    if (my.pending_signi_battle) return []; // 別シグニのアタック解決中は操作不可
    if (loading) return []; // 処理中は操作不可
    const topNum = stack[stack.length - 1];
    // GATE: アタック可否のルール判定は signiAttackGate に一本化する（人間ボタン／共通実行経路
    // performSigniAttack／CPU のアタック候補フィルタの3箇所が同じ関数を呼ぶ）。ここに条件を写経すると
    // 「人間には出ないが CPU は撃てる」型の軸ズレが必ず出る（続き404 で `cannotAttackSigni` がまさにそれだった）。
    if (!canSigniAttack({
      attacker: my, defender: op, attackerNum: topNum,
      effectsMap, cardMap: battleCardMap,
      contBlocked, effectivePowers, turnPhase: bs.turn_phase,
    })) return [];
    const signiAtkCost = (my.signi_attack_cost ?? 0)
      + (signiAttackColorlessCost({
          attacker: my, defender: op, attackerNum: topNum, effectsMap, cardMap: battleCardMap,
          contBlocked, effectivePowers,
        }) ?? 0);
    const fieldTrashAtkCost = attackFieldTrashCost(my, topNum);
    // 「手札をN枚捨てないかぎりアタックできない」（§6.4 O-3）＝ボタンにも解除コストを出す
    // （出さないと「押したら知らないモーダルが開く」になる）。
    const handTaxAtkCost = signiAttackBanHandDiscardCost(my, topNum, battleCardMap, effectivePowers.get(topNum));
    const atkCosts = [
      ...(signiAtkCost > 0 ? [`《無》×${signiAtkCost}`] : []),
      ...(fieldTrashAtkCost > 0 ? [`他のシグニ${fieldTrashAtkCost}体トラッシュ`] : []),
      ...(handTaxAtkCost > 0 ? [`手札${handTaxAtkCost}枚捨て`] : []),
    ];
    const atkLabel = atkCosts.length > 0 ? `アタック（${atkCosts.join('・')}）` : 'アタック';
    // 🆕§5.3 `O-538` 段階4＝**チアゾーンのシグニは相手のシグニゾーンを1つ選んでアタック**（正面が無い・空きゾーンは何も起きない）。
    //   攻撃先の列挙は CPU と同じ `cheerAttackTargets`。実行は【側面アタック】と同じ「指定ゾーン」の経路。
    if (isCheer) {
      return cheerAttackTargets(op, battleCardMap).map(t => ({
        label: atkCosts.length > 0 ? `${t.label}（${atkCosts.join('・')}）` : t.label,
        color: C.danger,
        onClick: () => handleSigniSideAttack(CHEER_ZONE, t.zone),
      }));
    }
    const actions: CardAction[] = [{ label: atkLabel, color: C.danger, onClick: () => handleSigniAttack(rawZoneIdx) }];
    // 【側面アタック】（G077等）: 正面の1つ隣の相手シグニゾーンにアタックできる。
    // 攻撃先は正面か側面を「選ぶ」（同時攻撃ではない）。空ゾーンは何も起きないため占有ゾーンのみ提示。
    const hasSideAttack = (dynamicKeywords.my[topNum] ?? []).includes('側面アタック')
      || (my.keyword_grants?.[topNum] ?? []).includes('側面アタック');
    if (hasSideAttack) {
      const frontOpZone = 2 - rawZoneIdx;
      // WX16-021: このターン、空ゾーンへの側面アタックが「正面扱い」でダメージになるなら空ゾーンも提示する。
      // ⚠解決側（resolvePendingSigniBattleFor）と**同じ関数**で判定すること。
      const emptyZoneDamages = sideAttackEmptyZoneDealsDamage(my, topNum, battleCardMap);
      for (const adj of [frontOpZone - 1, frontOpZone + 1]) {
        if (adj < 0 || adj > 2) continue;
        const adjTop = op.field.signi[adj]?.at(-1);
        if (!adjTop && !emptyZoneDamages) continue; // 空ゾーンは提示しない（アタックしても何も起こらない）
        const targetName = adjTop ? (battleCardMap.get(adjTop)?.CardName ?? adjTop) : '空きゾーン（ダメージ）';
        actions.push({ label: `側面アタック→${targetName}`, color: '#b5651d', onClick: () => handleSigniSideAttack(rawZoneIdx, adj) });
      }
    }
    // WXDi-P05-069: フリップアタック（ロビンフッド対象）
    const altFlip = collectAltAttackFlipSigni(my, effectsMap);
    if (altFlip && fieldTrashAtkCost === 0 && (battleCardMap.get(topNum)?.CardName ?? '').includes(altFlip.targetSigniName)) {
      const flipCandidates = [0, 1, 2].filter(zi => zi !== rawZoneIdx && (my.field.signi[zi]?.length ?? 0) > 0);
      if (flipCandidates.length > 0) {
        const flipZones = flipCandidates.slice(0, altFlip.maxFlip);
        actions.push({ label: `フリップアタック（${flipZones.length}体裏向き）`, color: '#7c9e30', onClick: () => handleFlipAttack(rawZoneIdx, flipZones) });
      }
    }
    return actions;
  }

  return [];
}

export function lrigFieldActions(c: FieldActionCtx, h: FieldActionHandlers): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCardMap, effectsMap, effectivePowers, contBlocked, grantedMyLrigEffects, isActionBlocked, lrigAttackCostInfo } = c;
  const { handleLrigAttack, openGuardBarrierAct, openLrigGranted } = h;
  // 🆕2026-09-26＝《アタックフェイズアイコン》の【起】は相手ターンの相手のアーツステップでも起動できる（シグニと同じ）。
  const lrigOppArtsStep = !isMyTurn && bs.turn_phase === 'ATTACK_ARTS_OP';
  if ((!isMyTurn && !lrigOppArtsStep) || loading) return [];
  if (my.field.lrig.length === 0) return [];

  // MAINフェイズ：センタールリグのACTIVATED能力 + 付与されたACTIVATED能力を表示
  if (bs.turn_phase === 'MAIN') {
    const lrigTopMA = my.field.lrig.at(-1) ?? '';
    const lrigActionsMA: CardAction[] = [];

    // センタールリグ本来のACTIVATED効果（SONG_FRAGMENT等）
    // ⚠**判定は `lrigActivateGate.listActivatableLrigEffects` 1本**（§8 `O-1` (c)）＝
    //   封じ／【絆起】／`costUnparsed`／ルリグデッキ除外／usageLimit／コイン／エクシード／
    //   `lrigDown`／《ダウン》／【歌のカケラ】／使用条件をそこで見る。CPU も同じ関数を呼ぶ。
    if (lrigTopMA) {
      for (const eff of listActivatableLrigEffects({
        my, op, phase: 'MAIN', effectsMap, cardMap: battleCardMap,
        blockedSelf: contBlocked.forSelf, effectivePowers,
      })) {
        const actMA = eff.action as import('../../types/effects').StubAction;
        const isSongFrag = actMA?.type === 'STUB' && actMA.id === 'SONG_FRAGMENT';
        const energyTotalMA = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const exceedCostMA = eff.cost?.exceed ?? 0;
        const hdSigniMA = eff.cost?.handDiscardSigni;
        const dgMA = eff.cost?.discardGroups;
        const costPartsMA: string[] = [];
        if (exceedCostMA > 0) costPartsMA.push(`エクシード${exceedCostMA}${eff.cost?.exceedColors?.length ? `（${eff.cost.exceedColors.join('と')}のカード）` : ''}`);
        if (energyTotalMA > 0) costPartsMA.push(`エナ${energyTotalMA}`);
        if (eff.cost?.coin) costPartsMA.push(`コイン${eff.cost.coin}`);
        // §5.3 `O-292`＝コラボ（ライバートークン）。⚠同じルリグに【起】が並ぶので撃ち分けのためにラベルへ出す。
        if (eff.cost?.collab) costPartsMA.push(`コラボ${eff.cost.collab}`);
        if (hdSigniMA) costPartsMA.push(`手札${fmtHandDiscardSigniLabel(hdSigniMA)}シグニ×${hdSigniMA.count}`);
        if (dgMA) costPartsMA.push(`手札${dgMA.map(g => `${fmtDiscardFilterLabel(g.filter) || 'カード'}${g.count}枚`).join('と')}`);
        if (eff.cost?.discardAll) costPartsMA.push('手札すべて捨て');
        if (eff.cost?.energyTrashAll) costPartsMA.push('エナすべトラッシュ');
        if (eff.cost?.lrigDown) costPartsMA.push(fmtLrigDownCostLabel(eff.cost.lrigDown));
        if (eff.cost?.down_self) costPartsMA.push('このルリグをダウン');   // タスク12(cxxxi)
        // §5.3 `O-67`＝行き先はエナゾーン。⚠同名の【起】を2つ持つルリグ（`WX25-P1-022`）を撃ち分けるため
        //   ラベルに出す（出さないと両方「コストなし」に見える＝§4.4 罠8m）。
        if (eff.cost?.fieldBanish) costPartsMA.push(`場のシグニ${eff.cost.fieldBanish.count}体バニッシュ`);
        const lrigActLabel = isSongFrag ? '歌のカケラ' : (costPartsMA.join('・') || 'コストなし');
        lrigActionsMA.push({
          label: `【起】${lrigActLabel}`,
          color: isSongFrag ? '#cc66ff' : C.coin,
          onClick: () => {
            openLrigGranted({ sourceCardNum: lrigTopMA, effect: eff });
          },
        });
      }
    }

    // INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュにあるルリグの起動能力を継承
    // ⚠**判定は `lrigActivateGate.listActivatableInheritedLrigEffects` 1本**（§6.4 O-1 (f)）＝
    //   継承元の能力喪失（§6.4 O-10・`WX12-023`）・継承済み印・コスト踏み倒しの全軸をそこで見る。
    //   🔴従来ここは手書きで、**継承済み印以外は何も見ていなかった**＝`costUnparsed`／コイン／
    //   エクシード／`lrigDown`／《ダウン》／使用条件を素通りして撃てた（センター本来の【起】との軸ズレ）。
    for (const eff of listActivatableInheritedLrigEffects({
      my, op, phase: 'MAIN', effectsMap, cardMap: battleCardMap,
      blockedSelf: contBlocked.forSelf, effectivePowers,
    })) {
      const energyCostILT = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const exceedILT = eff.cost?.exceed ?? 0;
      const costPartsILT: string[] = [];
      if (exceedILT > 0) costPartsILT.push(`エクシード${exceedILT}`);
      if (energyCostILT > 0) costPartsILT.push(`エナ${energyCostILT}`);
      if (eff.cost?.coin) costPartsILT.push(`コイン${eff.cost.coin}`);
      const costLabelILT = costPartsILT.join('・') || 'コストなし';
      // 継承元カード番号は id（`inherited_<番号>_<元 id>`）から復元する＝gate と綴りを二重に持たない。
      const srcTrashCn = eff.effectId.split('_')[1] ?? '';
      const trashLrigName = battleCardMap.get(srcTrashCn)?.CardName ?? srcTrashCn;
      lrigActionsMA.push({
        label: `【継承起】${costLabelILT}（${trashLrigName.slice(0, 6)}）`,
        color: '#9966cc',
        onClick: () => { openLrigGranted({ sourceCardNum: lrigTopMA, effect: eff }); },
      });
    }

    // 付与された ACTIVATED 能力
    // ⚠timing↔phase 照合と使用条件・once_per_game は**キー【起】経路と同じゲート**を通す（タスク12(l)）。
    //   従来ここは timing も condition も見ておらず、《アタックフェイズアイコン》専用の付与【起】が
    //   メインでも撃て、使用条件つき付与【起】が条件を無視して撃てた（付与スコープを構造化して
    //   キーの【起】群を GRANT_LRIG_ABILITY.abilities へ入れ子にした結果、この緩さが36枚に効くようになる）。
    const grantedActionsMA = listActivatableGrantedLrigEffects({
      my, op, phase: 'MAIN', effectsMap, cardMap: battleCardMap,
      blockedSelf: contBlocked.forSelf, effectivePowers,
    }, grantedMyLrigEffects)
      .map(eff => {
        const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
        const exceedCost = eff.cost?.exceed ?? 0;
        const costParts: string[] = [];
        // 🆕色指定を出す（§4.2「ラベルに出ないコストはプレイヤーにも見えない」）。
        if (exceedCost > 0) costParts.push(`エクシード${exceedCost}${eff.cost?.exceedColors?.length ? `（${eff.cost.exceedColors.join('と')}のカード）` : ''}`);
        if (energyTotal > 0) costParts.push(`エナ${energyTotal}`);
        if (eff.cost?.coin) costParts.push(`コイン${eff.cost.coin}`);
        if (eff.cost?.down_self) costParts.push('このルリグをダウン');   // タスク12(cxxxi)
        if (eff.cost?.fieldBanish) costParts.push(`場のシグニ${eff.cost.fieldBanish.count}体バニッシュ`); // §5.3 `O-67`
        const costLabel = costParts.join('・') || 'コストなし';
        return {
          label: `【起】${costLabel}`,
          color: C.coin,
          onClick: () => {
            openLrigGranted({ sourceCardNum: lrigTopMA, effect: eff });
          },
        };
      });

    // v0.278: WX25-P2-001 付与【起】（手札ガードシグニを捨てる→ルリグバリア）
    if (my.game_guard_barrier_act && !my.actions_done?.includes('GUARD_BARRIER_ACT') && !isActionBlocked('USE_ACT')) {
      const guardSigniInHand = my.hand.some(cn => canCardGuard(cn, my, battleCardMap, effectsMap));
      if (guardSigniInHand) {
        lrigActionsMA.push({
          label: '【起】ガードシグニ捨て→ルリグバリア',
          color: '#4db6e0',
          onClick: () => { openGuardBarrierAct(); },
        });
      }
    }

    return [...lrigActionsMA, ...grantedActionsMA];
  }

  // ATTACK_ARTSフェイズ（自分のアタックフェイズ）：《アタックフェイズアイコン》付きルリグ【起】（timing:['ATTACK_ARTS']）を表示。
  // MAIN分岐のSONG_FRAGMENT/継承/ガードバリア等のMAIN固有処理は対象外（timingがATTACK_ARTSの能力のみ）。
  if (bs.turn_phase === 'ATTACK_ARTS' || lrigOppArtsStep) {
    const lrigTopAA = my.field.lrig.at(-1) ?? '';
    const lrigActionsAA: CardAction[] = [];
    const buildCostLabelAA = (eff: import('../../types/effects').CardEffect): string => {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const exceedCost = eff.cost?.exceed ?? 0;
      const parts: string[] = [];
      if (exceedCost > 0) parts.push(`エクシード${exceedCost}${eff.cost?.exceedColors?.length ? `（${eff.cost.exceedColors.join('と')}のカード）` : ''}`);
      if (energyTotal > 0) parts.push(`エナ${energyTotal}`);
      if (eff.cost?.discardAll) parts.push('手札すべて捨て');
      if (eff.cost?.energyTrashAll) parts.push('エナすべトラッシュ');
      if (eff.cost?.down_self) parts.push('このルリグをダウン');   // タスク12(cxxxi)
      return parts.join('・') || 'コストなし';
    };
    // センタールリグ本来のACTIVATED効果（timing ATTACK_ARTS）
    // ⚠MAIN 窓と**同じ1本**を通す（§8 `O-1` (c)）＝従来この窓は【絆起】・【歌のカケラ】・
    //   `lrigDown`・使用条件を見ておらず、軸が食い違っていた。
    if (lrigTopAA) {
      for (const eff of listActivatableLrigEffects({
        my, op, phase: 'ATTACK_ARTS', effectsMap, cardMap: battleCardMap,
        blockedSelf: contBlocked.forSelf, effectivePowers,
      })) {
        lrigActionsAA.push({
          label: `【起】${buildCostLabelAA(eff)}`,
          color: C.coin,
          onClick: () => {
            openLrigGranted({ sourceCardNum: lrigTopAA, effect: eff });
          },
        });
      }
    }
    // 付与された ACTIVATED 能力（timing ATTACK_ARTS）
    // ⚠使用条件・once_per_game はキー【起】経路と同じゲートを通す（タスク12(l)。MAIN 分岐と同趣旨）。
    const grantedActionsAA = listActivatableGrantedLrigEffects({
      my, op, phase: 'ATTACK_ARTS', effectsMap, cardMap: battleCardMap,
      blockedSelf: contBlocked.forSelf, effectivePowers,
    }, grantedMyLrigEffects)
      .map(eff => ({
        label: `【起】${buildCostLabelAA(eff)}`,
        color: C.coin,
        onClick: () => {
          openLrigGranted({ sourceCardNum: lrigTopAA, effect: eff });
        },
      }));
    return [...lrigActionsAA, ...grantedActionsAA];
  }

  // ATTACK_LRIGフェイズ：ルリグアタック
  if (bs.turn_phase === 'ATTACK_LRIG') {
    // 🆕**§5.3 `O-236`（2026-09-04）＝門は2箇所ある。**
    //   🔴`performLrigAttack`（実行）だけ直しても**ここ（アクション一覧）が塞いだままだと
    //     「アタック」ボタンが1つも出ない**＝実機で0回になる（実測で踏んだ）。
    //   ⚠**同じ式を2箇所に書いたときの典型**（§5.1 の教訓「片方だけ直すと全ゲート緑のまま
    //     実際に使われる経路にだけ実装が無い」）。
    //   🆕**§5.3 `O-366`（2026-09-14）＝その2箇所を `centerLrigAttackBlock` の1本に統合した。**
    const lrigBlockALK = centerLrigAttackBlock(my);
    // 効果で「アタックできない」＝押せないことをボタンで示す（出さないと理由が分からない・出して無反応はもっと分からない）。
    if (lrigBlockALK === 'GRANTED_CANNOT_ATTACK') return [{ label: 'アタック不可（効果）', color: C.textDim, onClick: () => {} }];
    if (lrigBlockALK !== null) return []; // ダウン中／付与された上限に達した
    if (op.field.lrig_attacked) return []; // ガード応答待ち
    const lrigTopALK = my.field.lrig.at(-1);
    const driveCanAttack = !!(lrigTopALK && (effectsMap.get(lrigTopALK) ?? []).some(e =>
      e.effectType === 'CONTINUOUS' &&
      (e.action as import('../../types/effects').StubAction).type === 'STUB' &&
      (e.action as import('../../types/effects').StubAction).id === 'ALLOW_ATTACK_WHILE_DRIVE',
    ));
    if ((my.lrig_riding_signi?.length ?? 0) > 0 && !driveCanAttack) return [{ label: 'ドライブ中（攻撃不可）', color: C.textDim, onClick: () => {} }];
    // 《無》の前払い（§6.4 O-28）＝`performLrigAttack` と**同じ関数**で判定する。
    // ⚠押せるのに無反応（O-18）にしない＝払えないことをボタンに出す。
    const lrigCostALK = lrigAttackCostInfo(my, op, lrigTopALK);
    // 🆕解除コストの表示は軸ごとに出す（§5.3 `O-222` で「シグニN体」を追加）。
    const lrigCostLabelALK = [
      lrigCostALK.colorless > 0 ? `《無》×${lrigCostALK.colorless}` : '',
      lrigCostALK.fieldTrash > 0 ? `シグニ${lrigCostALK.fieldTrash}体` : '',
    ].filter(Boolean).join('＋');
    if (lrigCostALK.blocked) {
      return [{ label: lrigCostLabelALK ? `アタック不可（${lrigCostLabelALK}）` : 'アタック不可', color: C.textDim, onClick: () => {} }];
    }
    return [{
      label: lrigCostLabelALK ? `アタック（${lrigCostLabelALK}）` : 'アタック',
      color: C.danger, onClick: () => { void handleLrigAttack('center'); },
    }];
  }

  return [];
}

export function keyPieceActions(c: FieldActionCtx, h: FieldActionHandlers): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCardMap, effectsMap, effectivePowers, contBlocked } = c;
  const { openKeyActivated } = h;
  if (!isMyTurn || loading || !my.field.key_piece) return [];
  const phase = bs.turn_phase;
  const allKeyNums = [my.field.key_piece, ...(my.field.key_piece_extra ?? [])];
  const result: CardAction[] = [];
  for (const keyNum of allKeyNums) {
    // 🆕2026-10-21＝判定は `keyActivateGate.canActivateKeyEffect` の1本（CPU の候補も同じ関数）。
    //   🔴旧＝ここに手書きの判定があり、《コインアイコン》の所持枚数を見ていなかった。
    const keyGateInput = { my, op, phase, effectsMap, cardMap: battleCardMap, blockedSelf: contBlocked.forSelf, effectivePowers };
    const activatable = (effectsMap.get(keyNum) ?? []).filter(e => canActivateKeyEffect(e, keyGateInput, keyNum));
    for (const eff of activatable) {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const costLabel = eff.cost
        ? [
            energyTotal > 0 ? `エナ${energyTotal}` : null,
            eff.cost.discard ? `手札${eff.cost.discard}枚` : null,
            eff.cost.coin ? `《コイン》×${eff.cost.coin}` : null,
            eff.cost.trash_key ? 'このキーをルリグトラッシュ' : null,
            // 🆕全捨てコスト（§5.3 `O-46`＝`WXK04-025-CB-E2`）。支払いは `executeKeyActivated`。
            eff.cost.energyTrashAll ? 'エナすべてトラッシュ' : null,
            eff.cost.discardAll ? '手札すべて捨て' : null,
            // 🆕§5.3 `O-68`②＝ルリグデッキのアーツ徴収（支払いは `executeKeyActivated`＋`KeyActivatedModal`）。
            eff.cost.trashArtsFromLrigDeck ? `アーツ${eff.cost.trashArtsFromLrigDeck.count}枚をルリグトラッシュ` : null,
          ].filter(Boolean).join('・') || 'コストなし'
        : 'コストなし';
      const cardName = battleCardMap.get(keyNum)?.CardName ?? keyNum;
      result.push({
        label: `【起】${costLabel}（${cardName}）`,
        color: C.coin,
        onClick: () => { openKeyActivated({ cardNum: keyNum, effect: eff }); },
      });
    }
  }
  return result;
}

export function assistActions(c: FieldActionCtx, h: FieldActionHandlers, side: 'l' | 'r'): CardAction[] {
  const { loading, isMyTurn, bs, my, op, battleCardMap, effectsMap, effectivePowers, contBlocked, getAssistGrowCandidates } = c;
  const { handleLrigAttack, openAssistActivated, openAssistGrow } = h;
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
        openAssistGrow(side);
      },
    });
  }

  // アシストルリグのアタック（`ASSIST_LRIG_ATTACK_THIS_TURN` が立っているターンだけ・§6.4 A群/続き427）。
  // ⚠可否判定は `assistLrigAttackableSlots` の1本に寄せる（CPU・フェイズ進行と同じ軸）。
  if (isMyTurn && !loading && phase === 'ATTACK_LRIG' && !my.pending_lrig_attack && !op.field.lrig_attacked
      && assistLrigAttackableSlots(my, battleCardMap).includes(side === 'l' ? 'assist_l' : 'assist_r')) {
    actions.push({
      label: 'アタック',
      color: C.danger,
      // 🆕**解除コストの支払いUI を通す**（§5.3 `O-222`）＝センターと同じ入口へ寄せる
      //   （直接 `performLrigAttack` を呼ぶと、どのシグニを置くか選べないまま自動選択になる）。
      onClick: () => { void handleLrigAttack(side === 'l' ? 'assist_l' : 'assist_r'); },
    });
  }

  // 起動効果＝🆕2026-09-28 判定はセンタールリグと同じ `canActivateLrigEffect`（`listActivatableAssistLrigEffects`）。
  //   🔴旧＝手書きの filter で《ゲーム１回》も timing も見ていなかった（アタックフェイズでも MAIN の【起】を出していた）。
  //   ⚠使用タイミングにアタックフェイズがある【起】は相手のアーツステップでも使える（2026-09-26 ルール）＝同じゲートに `ATTACK_ARTS` で渡す。
  const assistActPhase = isMyTurn
    ? (phase === 'MAIN' ? 'MAIN' : phase === 'ATTACK_ARTS' ? 'ATTACK_ARTS' : null)
    : (phase === 'ATTACK_ARTS_OP' ? 'ATTACK_ARTS' : null);
  if (assistActPhase && !loading) {
    const activatable = listActivatableAssistLrigEffects({
      my, op, phase: assistActPhase, effectsMap, cardMap: battleCardMap,
      blockedSelf: contBlocked.forSelf, effectivePowers,
    }, side);
    activatable.forEach(eff => {
      const energyTotal = (eff.cost?.energy ?? []).reduce((s, c) => s + c.count, 0);
      const costLabel = eff.cost
        ? [energyTotal > 0 ? `エナ${energyTotal}` : null, eff.cost.down_self ? 'ダウン' : null]
            .filter(Boolean).join('・') || 'コストなし'
        : 'コストなし';
      actions.push({
        label: `【起】${costLabel}`,
        color: C.coin,
        onClick: () => { openAssistActivated({ cardNum: topNum, effect: eff }); },
      });
    });
  }

  return actions;
}
