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
