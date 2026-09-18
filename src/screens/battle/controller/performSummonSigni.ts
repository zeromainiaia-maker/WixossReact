import { deployLimitBlockReason } from '../../../engine/deployLimit';
import { canSelfPlay, checkActiveCondition, collectContinuousAbilitiesRemovedSigni, collectForcePlaceFrontZones } from '../../../engine/effectEngine';
import { evalUseCondition, getCardNum } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { getRiseRequirement, matchesRiseFilter, riseFieldTotal } from '../../../engine/execUtils';
import { applyAbilityCostReduction, collectHandDiscardTriggers as pureCollectHandDiscardTriggers, isMandatoryOwnOnPlayForNormalSummon, isOptionalOwnOnPlayForNormalSummon, isSigniOwnOnPlaySuppressed, onPlayOriginMatches, wrapOptionalOnPlay, collectFieldTriggers as pureCollectFieldTriggers } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import { type CardEffect, type TriggerOriginZone } from '../../../types/effects';
import { cloneAcceSlots } from '../../../utils/acce';
import { generateUUID } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { type ResonaPaymentSelection, type ResonaSummonCandidate, getResonaSummonCandidate, payResonaAppearanceAndPlace } from '../resonaSummon';
import { EMPTY_RISE_SELECTION, type RiseSelection, payRiseMaterials, riseConsumedZones, validateRiseField, validateRiseMaterials } from '../riseSummon';
import { resolveSigniZonePlacement } from '../signiZoneBlock';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
/**
 * 召喚の実行に要る「行為者まわり」。
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から移設。**UI のコールバック2本は任意**＝
 *   画面だけが渡す（CPU・ヘッドレスは渡さない＝`costOnPlay:'skip'` なのでモーダルの分岐へ来ない）。
 */
export interface SummonActorCtx {
  actor: PlayerState; opponent: PlayerState;
  actorId: string; actorKey: 'host_state' | 'guest_state';
  isActorTurn: boolean;
  /** センタールリグのレベル／実効リミット／場のシグニのレベル合計（配置可否の再検証に使う）。 */
  lrigLevel: number; lrigLimit: number; fieldSigniTotal: number;
  /** 「無色のカードを場に出せない」（`PLAY_COLORLESS`）。 */
  playColorlessBlocked: boolean;
  /** コスト付き任意【出】＝人間はモーダルで問う／CPU は発動しない。 */
  costOnPlay: 'modal' | 'skip';
  /** 🆕召喚モーダルを閉じる（画面のみ）。 */
  closeSummonModals?: () => void;
  /** 🆕コスト付き【出】の確認モーダルを開く（画面のみ・`costOnPlay:'modal'` のときだけ呼ばれる）。 */
  openOnPlayCost?: (p: {
    cardNum: string; costEffect: CardEffect; placedState: PlayerState;
    mandatoryEntries: StackEntry[]; remainingCostEffects: CardEffect[]; placedZone: number;
  }) => void;
}


export const performSummonSigni = async (
  handIndex: number,
  zoneIndex: number,
  resona: { candidate: ResonaSummonCandidate; selection: ResonaPaymentSelection } | undefined,
  // 🆕§5.3 `O-147`＝【ライズ】の支払い（下に重ねる材料＋下敷きにする場のシグニ）。
  riseSelection: RiseSelection | undefined,
  sc: SummonActorCtx,
  ctx: PerformCtx,
) => {
  const my = sc.actor;
  const op = sc.opponent;
  const actorIsHost = sc.actorKey === 'host_state';
  console.log('[performSummonSigni] called', { handIndex, zoneIndex, actor: sc.actorId, isActorTurn: sc.isActorTurn });
  const resonaAttackResponse = !!resona && ctx.bs.turn_phase === 'ATTACK_ARTS_OP' && !sc.isActorTurn;
  const resonaSpellCutin = !!resona && !!ctx.bs.pending_spell
    && ctx.bs.pending_spell.caster_id !== sc.actorId
    && resona.candidate.appearance.timings.includes('SPELL_CUTIN');
  if (!sc.isActorTurn && !resonaAttackResponse && !resonaSpellCutin) return;
  const summonCardNum = resona?.candidate.cardNum ?? my.hand[handIndex];
  if (!summonCardNum) return;
  const summonPlacedFromZone: TriggerOriginZone = resona ? 'lrig_deck' : 'hand';
  const summonCardData = ctx.cardMap.get(summonCardNum);
  const riseReq = resona ? null : (summonCardData ? getRiseRequirement(summonCardData.EffectText ?? '') : null);
  // 🆕§5.3 `O-147`＝配置先が「場のシグニ N体の上」か「空きシグニゾーン」かで分岐する
  //   （空きゾーン型＝`WXDi-P06-034`/`WXDi-P15-048` は**材料を払って**空きゾーンへ出す）。
  const riseOnField = riseReq?.base.kind === 'field';
  const riseSel: RiseSelection = riseSelection ?? EMPTY_RISE_SELECTION;
  // 🆕**下敷きにするゾーン**＝単体ライズは配置先1つ／多ゾーン消費型は選んだ全ゾーン。
  const riseConsumed = riseConsumedZones(riseReq, riseSel, zoneIndex);
  const existingZoneStack = my.field.signi[zoneIndex] ?? [];
  // ライズ条件チェック
  if (riseReq?.base.kind === 'field') {
    if (riseFieldTotal(riseReq.base) >= 2) {
      // 🆕多ゾーン消費型（`O-147` 下位family A）＝選択そのものと「配置先が選択の中にあること」を見る。
      //   ⚠**UI の活性化判定と同じ関数（`riseSummon.ts`）を使う**（片肺を作らない）。
      if (!validateRiseField(my, riseReq, riseSel.fieldZones, ctx.cardMap)) return;
      if (!riseConsumed.includes(zoneIndex)) return;   // 「どちらかのシグニがあるシグニゾーンに出す」
    } else {
      // ライズシグニ: 空きゾーンには出せない、条件不一致ゾーンにも出せない
      const existingTop = existingZoneStack.at(-1);
      if (!existingTop) return; // 空きゾーン不可
      const existingTopNum = getCardNum(existingTop);
      if (!matchesRiseFilter(existingTopNum, riseReq.base.groups[0].filter, ctx.cardMap)) return;
    }
  } else if (riseReq?.base.kind === 'empty') {
    if (existingZoneStack.length > 0) return; // 空きシグニゾーンにしか出せない
  } else {
    // 通常シグニは空きゾーンへ。レゾナだけは、出現条件で同時にトラッシュへ置くゾーンを召喚先にできる。
    const paidDestination = resona?.selection.items?.some(i => i.zone === 'field' && i.index === zoneIndex);
    if (existingZoneStack.length > 0 && !paidDestination) return;
  }
  // 🆕§5.3 `O-147`（下位family B）＝【ライズ】の**下に重ねる材料**（トラッシュ／エナ）を確定する。
  //   🔴**材料はコストではなく配置条件**＝満たせないなら召喚そのものが成立しない（＝ここで return）。
  //   ⚠**UI の活性化判定と同じ関数（`riseSummon.ts`）を使う**（別々に書くと押せるのに配置できない片肺になる）。
  let riseStacked: string[] = [];
  let riseTrashAfter: string[] | null = null;
  let riseEnergyAfter: string[] | null = null;
  if (riseReq && riseReq.materials.length > 0) {
    const picked = riseSel.materials;
    if (!validateRiseMaterials(my, riseReq, picked, ctx.cardMap)) return;
    // ⚠**変数名を `paid` のような一般名にしない**＝`census:costtext` の原文追跡は
    //   **ファイル全体を名前で伝播する**ので、`paid` を汚染源にすると `card`／`cardNum`／`timing` まで
    //   「原文由来」に化けて **C群が 3規則→6規則・14カード→941カード**に膨らむ（2026-09-05 に実測）。
    const riseMaterialPayment = payRiseMaterials(my, riseReq, picked);
    riseStacked = riseMaterialPayment.stacked;
    riseTrashAfter = riseMaterialPayment.trash;
    riseEnergyAfter = riseMaterialPayment.energy;
  }
  if (sc.playColorlessBlocked && summonCardData?.Color === '無') return;
  // 🏁§5.3 `O-94`② で `OPP_ZONE_PLACEMENT_RESTRICT` は `deployLimitBlockReason` の funnel へ移した
  //   （旧はここだけの手書き判定＝CPU 配置と engine の効果配置が素通りしていた）。下の `zoneIndex` 付き呼び出しが受ける。
  // DEPLOY_RESTRICT（配置パワー制限／配置数制限）は `engine/deployLimit.ts` に一本化する
  // （通常召喚UI・召喚ゾーンモーダル・CPU召喚・engine の効果配置が同じ関数を呼ぶ。
  //  旧実装は engine 側だけ判定が無く、効果配置がすべてすり抜けていた＝続き405）。
  // ライズ（既存シグニへの上乗せ）は「新たに場に出す」ではないので対象外。
  {
    const paidFieldCount = resona
      ? (resona.selection.items ?? []).filter(i => i.zone === 'field').length
      : 0;
    const blockedDeploy = deployLimitBlockReason({
      placingState: my, opponentState: op, cardNum: summonCardNum,
      cardMap: ctx.cardMap, effectsMap: ctx.effectsMap, isPlacingOwnerTurn: sc.isActorTurn,
      onExistingStack: riseOnField || existingZoneStack.length > 0,
      fieldCountAdjust: paidFieldCount,
      placementSource: 'normal_summon',
      zoneIndex,
    });
    if (blockedDeploy) return;
  }
  // FORCE_PLACE_FRONT: 相手の該当シグニの正面に配置を強制（正面が空いている場合のみ）。ライズは上乗せのため対象外。
  if (!riseReq) {
    const forcedFront = collectForcePlaceFrontZones(op, my, ctx.cardMap, ctx.effectsMap, !sc.isActorTurn);
    if (forcedFront.size > 0 && !forcedFront.has(zoneIndex)) return;
  }
  // BLOCK_OPP_ZONE_PLACEMENT / REMOVE_SIGNI_ZONE（タスク12(lxi) 第10波）: 「新たに配置できない」ゾーン。
  // 《無》×N の支払い回避つきならエナから徴収して通す（不足なら不成立＝ガード追加《無》と同じ作法）。
  // ライズは既存シグニへの上乗せ＝「新たに配置」ではないので対象外。
  const zoneBlockPay = riseOnField ? null : resolveSigniZonePlacement(my, zoneIndex);
  if (zoneBlockPay && !zoneBlockPay.allowed) return;
  // SELF_PLAY_RESTRICT（自身出撃制限・Opusタスク12(xlix)）: このカード自身の【常】出撃条件を満たさなければ通常召喚不可。
  // never（効果でのみ配置可）＝常に不可。condition あり＝盤面で評価（未満たしなら不可）。未対応語彙は permissive（従来同値）。
  // この時点で summonCardNum はまだ手札にあり my.field に含まれないため「あなたの場に…」は当該カードを除いて評価される（正）。
  if (!canSelfPlay(ctx.baseEffectsMap.get(summonCardNum), my, op, ctx.cardMap)) return;
  // レゾナは表示後にも盤面が変わり得るため、確定時に条件・支払い・ルリグデッキ在籍を再検証する。
  if (resona) {
    const timing = resonaSpellCutin ? 'SPELL_CUTIN' : ctx.bs.turn_phase === 'MAIN' ? 'MAIN' : 'ATTACK';
    const current = getResonaSummonCandidate(summonCardNum, my, ctx.cardMap, ctx.effectsMap, timing);
    if (!current) return;
    const paidFieldLevels = (resona.selection.items ?? [])
      .filter(i => i.zone === 'field')
      .reduce((sum, item) => {
        const paidNum = getCardNum(my.field.signi[item.index]?.at(-1) ?? '');
        return sum + (parseInt(ctx.cardMap.get(paidNum)?.Level ?? '0', 10) || 0);
      }, 0);
    const resonaLevel = parseInt(summonCardData?.Level ?? '0', 10) || 0;
    if (resonaLevel > sc.lrigLevel) return;
    if (sc.fieldSigniTotal - paidFieldLevels + resonaLevel > sc.lrigLimit) return;
  }
  ctx.io.setLoading(true);
  sc.closeSummonModals?.();
  try {
    const cardNum = summonCardNum;
    const newSigni = [...my.field.signi] as (string[] | null)[];
    const isRise = !!riseReq;
    // 🆕§5.3 `O-147`（下位family A）＝**潰すゾーンの並び**＝配置先を先頭に、残りはゾーン番号順。
    //   （ルール上、下に重なるカードどうしの順序は指定されない。配置先のスタックを一番下に据えるのが
    //     「そのゾーンに出す」の見た目と一致する。）
    const riseFoldZones = isRise && riseConsumed.length > 1
      ? [zoneIndex, ...riseConsumed.filter(z => z !== zoneIndex).sort((a, b) => a - b)]
      : [zoneIndex];
    if (isRise) {
      // ライズ: 潰した全ゾーンのスタック → 下に重ねる材料 → このカード の順に積む。
      //   🆕§5.3 `O-147`＝空きゾーン型（スタックが空）も多ゾーン消費型も同じ式で表せる。
      const under = riseFoldZones.flatMap(z => my.field.signi[z] ?? []);
      newSigni[zoneIndex] = [...under, ...riseStacked, cardNum];
      // 🔴**潰した他のゾーンは空にする**（消し忘れるとシグニが複製される）。
      for (const z of riseFoldZones) if (z !== zoneIndex) newSigni[z] = null;
    } else {
      newSigni[zoneIndex] = [cardNum];
    }
    // ライズ配置: ダウン・凍結状態は引き継がない（ルール：新たに場に出たシグニ）
    // 通常配置: ゾーンのダウン・凍結をリセット
    const newSigniDown   = [...(my.field.signi_down   ?? [false, false, false])];
    const newSigniFrozen = [...(my.field.signi_frozen  ?? [false, false, false])];
    const newCharms      = [...(my.field.signi_charms  ?? [null, null, null])];
    const newAcce        = cloneAcceSlots(my.field);
    const newSoul        = [...(my.field.signi_soul    ?? [null, null, null])];
    const zoneExtraTrash: string[] = [];
    const zoneExtraLrigTrash: string[] = [];
    // 🆕**潰した全ゾーン**の付随状態を落とす（旧実装は配置先1ゾーンだけを見ていた＝
    //   多ゾーン消費型では**空にしたゾーンにチャーム／アクセ／ソウルだけが浮いて残る**）。
    for (const z of riseFoldZones) {
      newSigniDown[z]   = false;
      newSigniFrozen[z] = false;
      // ライズ時: チャームはルール処理でトラッシュへ（アクセもリセット）
      if (newCharms[z]) { zoneExtraTrash.push(newCharms[z]!); newCharms[z] = null; }
      if (newAcce[z])   { zoneExtraTrash.push(...newAcce[z]!); newAcce[z] = null; }
      // ライズで元のトップシグニが下に置かれるカードになると、付いていた【ソウル】はルリグトラッシュへ（ルール処理）
      if (newSoul[z])   { zoneExtraLrigTrash.push(newSoul[z]!); newSoul[z] = null; }
    }
    let placed: PlayerState;
    let summonOpp = op;
    let resonaPaymentMeta: { fieldTrashCostCards: string[]; discardedCostCards: string[] } | null = null;
    if (resona) {
      const paidAndPlaced = payResonaAppearanceAndPlace(
        my, cardNum, resona.candidate.payment, resona.selection, zoneIndex, ctx.cardMap,
      );
      if (!paidAndPlaced) return;
      placed = paidAndPlaced.state;
      placed = {
        ...placed,
        signi_played_from_non_hand_this_turn: [
          ...(placed.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== cardNum),
          cardNum,
        ],
      };
      resonaPaymentMeta = paidAndPlaced;
    } else {
      placed = {
        ...my,
        signi_played_from_non_hand_this_turn: (my.signi_played_from_non_hand_this_turn ?? []).filter(n => n !== cardNum),
        hand: my.hand.filter((_, i) => i !== handIndex),
        field: {
          ...my.field,
          signi: newSigni,
          signi_down:   newSigniDown,
          signi_frozen: newSigniFrozen,
          signi_charms: newCharms,
          signi_acce:   newAcce,
          signi_soul:   newSoul,
        },
        // 🆕§5.3 `O-147`＝下に重ねた材料はトラッシュ／エナから取り除く（`riseTrashAfter`/`riseEnergyAfter`）。
        trash: [...(riseTrashAfter ?? my.trash), ...zoneExtraTrash],
        ...(riseEnergyAfter ? { energy: riseEnergyAfter } : {}),
        lrig_trash: zoneExtraLrigTrash.length > 0 ? [...my.lrig_trash, ...zoneExtraLrigTrash] : my.lrig_trash,
      };
    }
    // ゾーン配置禁止の《無》回避コストを徴収する（WXDi-P11-009-E3）。可否は上で確定済みなので
    // ここでは支払いだけを placed へ適用する（レゾナ出現条件の支払い後のエナから取る）。
    if ((zoneBlockPay?.paidColorless ?? 0) > 0) {
      const zbCost = zoneBlockPay!.paidColorless;
      // レゾナ出現条件でエナを使った後は my 時点の残量より減りうるため、支払い直前に再検証する。
      if (placed.energy.length < zbCost) return;
      const zbPaid = placed.energy.slice(-zbCost);
      placed = { ...placed, energy: placed.energy.slice(0, -zbCost), trash: [...placed.trash, ...zbPaid] };
      ctx.io.appendLogs([`シグニゾーン${zoneIndex + 1}への配置コスト《無》×${zbCost}を支払う`]);
    }

    // フィールド上の他のシグニの「他のシグニが出たとき」トリガーを収集
    // 出現条件の支払いも通常の盤面差分収集へ載せる。場コストは fieldTrashCostCards により
    // ON_TRASH の byEffectCause=false を維持し、ON_LEAVE_FIELD も同じ共通経路で収集する。
    const paymentDiff = resonaPaymentMeta
      ? ctx.collectBoardDiff(
        actorIsHost ? placed : ctx.bs.host_state,
        actorIsHost ? ctx.bs.guest_state : placed,
        {
          causeOwnerId: sc.actorId,
          causeSourceCardNum: cardNum,
          fieldTrashCostCards: resonaPaymentMeta.fieldTrashCostCards,
          resonaConditionCardNum: cardNum,
        },
      )
      : null;
    if (paymentDiff) {
      placed = actorIsHost ? paymentDiff.hostState : paymentDiff.guestState;
      summonOpp = actorIsHost ? paymentDiff.guestState : paymentDiff.hostState;
    }
    const paymentEntries = paymentDiff?.entries ?? [];
    // 手札支払いは中央差分の ON_TRASH に加え、既存の「手札を捨てたとき」経路にも載せる。
    // 出現条件は【出】【起】能力の使用コストではないため asCost=false（ON_DISCARDED_AS_COST は発火させない）。
    const discardRes = resonaPaymentMeta?.discardedCostCards.length
      ? pureCollectHandDiscardTriggers(ctx.trigCtx(), resonaPaymentMeta.discardedCostCards.map(getCardNum), placed, sc.actorId, false, summonOpp, actorIsHost ? ctx.bs.guest_id : ctx.bs.host_id, undefined, undefined, undefined)
      : null;
    if (discardRes?.usedLimitIds.length) placed = { ...placed, actions_done: [...(placed.actions_done ?? []), ...discardRes.usedLimitIds] };
    paymentEntries.push(...(discardRes?.entries ?? []));
    const fieldRes = pureCollectFieldTriggers(ctx.trigCtx(), 'ON_PLAY', cardNum, placed, summonOpp, sc.actorId, { placedFromZone: summonPlacedFromZone });
    const fieldEntries = fieldRes.entries;
    // usageLimit（《ターン1回/2回》）消費を actions_done へ永続化（自分側＝placed／相手側＝opAfterPlay。続き135）
    const summonUsedMine = actorIsHost ? fieldRes.usedHostIds : fieldRes.usedGuestIds;
    const summonUsedOpp  = actorIsHost ? fieldRes.usedGuestIds : fieldRes.usedHostIds;
    if (summonUsedMine.length > 0) placed = { ...placed, actions_done: [...(placed.actions_done ?? []), ...summonUsedMine] };
    const opAfterPlay: PlayerState | null = summonUsedOpp.length > 0
      ? { ...summonOpp, actions_done: [...(summonOpp.actions_done ?? []), ...summonUsedOpp] }
      : paymentDiff ? summonOpp : null;
    const opKeySummon = actorIsHost ? 'guest_state' : 'host_state';

    // 召喚したカード自身の ON_PLAY 効果
    const ownEffects = ctx.effectsMap.get(cardNum) ?? [];
    // §6.3「正面」サブ機構(b): 相手の CONT「このシグニの正面のシグニの【出】能力は発動しない」（WXK11-029-E1）で
    // 【出】を封じられている場合、召喚したシグニ自身の ON_PLAY を一切積まない（正面は engine 共通規約の 2-zi）。
    const frontOnPlayBlocked = collectContinuousAbilitiesRemovedSigni(placed, op, true, ctx.effectsMap, ctx.cardMap, '出').has(cardNum);
    const familyOnPlayBlocked = isSigniOwnOnPlaySuppressed(
      cardNum, placed, summonOpp, sc.isActorTurn, ctx.effectsMap, ctx.cardMap,
    );
    const onPlayBlocked = frontOnPlayBlocked || familyOnPlayBlocked;
    if (onPlayBlocked) ctx.io.appendLogs([`${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}の【出】能力は発動しない（抑止効果）`]);
    // 手札／ルリグデッキからの召喚は「トラッシュから場に出た」に該当しない。
    const involvesFromTrash = (c?: import('../../../types/effects').Condition): boolean =>
      !!c && (c.type === 'THIS_CARD_FROM_TRASH' || (c.type === 'AND' && c.conditions.some(involvesFromTrash)));
    const ownOnPlay = (onPlayBlocked ? [] : ownEffects).filter(e =>
      isMandatoryOwnOnPlayForNormalSummon(e, summonPlacedFromZone) &&
      // activeCondition（英知=N等）を満たさない【出】は発火しない
      (!e.activeCondition || checkActiveCondition(e.activeCondition, placed, op, sc.isActorTurn, ctx.cardMap, cardNum)) &&
      // THIS_CARD_FROM_TRASH 条件のみ収集時に評価（手札召喚では false）
      (!involvesFromTrash(e.condition) || evalUseCondition(e.condition!, placed, op, ctx.cardMap, cardNum, ctx.bs.turn_phase, ctx.effectivePowers)),
    );
    // コスト付き任意【出】効果（mandatory: false + cost あり）
    const ownCostOnPlay = (onPlayBlocked ? [] : ownEffects).filter(e =>
      e.effectType === 'AUTO' &&
      e.timing?.includes('ON_PLAY') &&
      (e.triggerScope === undefined || e.triggerScope === 'self') &&
      e.mandatory === false &&
      e.cost &&
      onPlayOriginMatches(e, summonPlacedFromZone) &&
      // 使用条件（《ビートアイコン》[N枚以下]ゲート＝BEAT_CONDITION や「〜の場合にしか使用できない」）を満たさない【出】コスト効果は提示しない
      (!e.condition || evalUseCondition(e.condition, placed, op, ctx.cardMap, cardNum, ctx.bs.turn_phase, ctx.effectivePowers)),
    // 「〈盤面条件〉の場合、この能力の発動コストは《X×N》減る」を**提示前に**焼き込む（§6.4 O-35・続き530）。
    ).map(e => applyAbilityCostReduction(e, placed, op, ctx.cardMap, cardNum, ctx.bs.turn_phase, ctx.effectivePowers));
    // mandatory:false + cost なしの自身【出】（「〜してもよい」／【出】英知＝N）＝タスク12(xxix)(2)。
    // `ownOnPlay`（mandatory のみ）にも `ownCostOnPlay`（cost ありのみ）にも入らず**丸ごと無発火**だった
    // （旧実装はここで console.warn するだけ）。engine の OPTIONAL_ACTIVATE 包み（「発動しますか？」）へ
    // 変換してスタックへ積む＝支払いモーダルは要らない。
    const optionalNoCostOnPlay = (onPlayBlocked ? [] : ownEffects).filter(e =>
      isOptionalOwnOnPlayForNormalSummon(e, summonPlacedFromZone) && !e.cost &&
      (!e.activeCondition || checkActiveCondition(e.activeCondition, placed, op, sc.isActorTurn, ctx.cardMap, cardNum)) &&
      (!e.condition || evalUseCondition(e.condition, placed, op, ctx.cardMap, cardNum, ctx.bs.turn_phase, ctx.effectivePowers)),
    );

    const cardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
    ctx.io.appendLogs([`${cardName}を召喚`]);

    // 自身の mandatory ON_PLAY エントリ
    const ownEntries: StackEntry[] = ownOnPlay.map(eff => ({
      id: generateUUID(),
      playerId: sc.actorId,
      cardNum,
      effectId: eff.effectId,
      label: `${cardName} の【出】/【自】効果`,
      effect: eff,
    }));
    for (const eff of optionalNoCostOnPlay) {
      const wrappedOpt = wrapOptionalOnPlay(eff);
      if (!wrappedOpt) continue;
      ownEntries.push({
        id: generateUUID(),
        playerId: sc.actorId,
        cardNum,
        effectId: eff.effectId,
        label: `${cardName} の【出】効果（任意）`,
        effect: wrappedOpt,
      });
    }

    // ON_RISE: ライズ配置時、**下敷きになったシグニ**の「このシグニがライズされたとき」を収集（self）。
    // 🔴**2026-09-03（§5.3 `O-60` 第39バッチ）に収集元を反転した**＝旧実装は「置かれた側（`ownEffects`）」から
    //   集めていたが、`ON_RISE` を持つ11枚は**1枚も【ライズ】を印字していない**（＝ライズする側ではなく
    //   **ライズされる側＝下敷き**）ので、旧実装ではこの11枚が**1度も発火しない死に効果**だった。
    // `risenByNameContains`: 上に置かれた【ライズ】シグニ（`cardNum`）の名前で限定（WX20-056-E2《オダノブ》）。
    // `triggeringCardNum`: 帰結の「そのシグニ」＝**上に置かれたシグニ**（`targetsTriggerSource` で解決）。
    // 🆕**下敷きは1体とは限らない**（§5.3 `O-147` 下位family A＝2〜3体を潰して1ゾーンへ積む）＝
    //   旧実装は配置先ゾーンのトップだけを見ていたので、**他ゾーンから潰されたシグニの `ON_RISE` が発火しなかった**。
    if (isRise) {
      const risenName = ctx.cardMap.get(cardNum)?.CardName ?? '';
      for (const z of riseFoldZones) {
        const underTop = (my.field.signi[z] ?? []).at(-1);
        const underNum = underTop ? getCardNum(underTop) : undefined;
        const underEffects = underNum ? (ctx.effectsMap.get(underNum) ?? []) : [];
        for (const eff of underEffects) {
          if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_RISE')) continue;
          if ((eff.triggerScope ?? 'self') !== 'self') continue;
          const needName = eff.triggerCondition?.risenByNameContains;
          if (needName && !risenName.includes(needName)) continue;
          if (eff.activeCondition && !checkActiveCondition(eff.activeCondition, placed, op, true, ctx.cardMap, underNum)) continue;
          ownEntries.push({
            id: generateUUID(),
            playerId: sc.actorId,
            cardNum: underNum!,
            effectId: eff.effectId,
            label: `${ctx.cardMap.get(underNum!)?.CardName ?? underNum} の【自】効果（ライズされたとき）`,
            effect: eff,
            triggeringCardNum: cardNum,
          });
        }
      }
    }

    // コスト付き【出】効果があればモーダルで確認（DBはモーダル確定後に保存。複数あれば1効果ずつ連鎖）
    // ⚠CPU（`costOnPlay:'skip'`）にモーダルは出せない＝コスト付き任意【出】は発動しない（CPU の既存方針）。
    if (ownCostOnPlay.length > 0 && sc.costOnPlay === 'modal') {
      sc.openOnPlayCost?.({
        cardNum,
        costEffect: ownCostOnPlay[0],
        placedState: placed,
        mandatoryEntries: [...ownEntries, ...fieldEntries, ...paymentEntries],
        remainingCostEffects: ownCostOnPlay.slice(1),
        placedZone: zoneIndex,
      });
      return;
    }

    if (ownEntries.length === 0 && fieldEntries.length === 0 && paymentEntries.length === 0) {
      // 効果なし：そのまま保存
      const stateKey = actorIsHost ? 'host_state' : 'guest_state';
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: placed,
        opp: opAfterPlay ? { key: opKeySummon, state: opAfterPlay } : undefined,
        markCutinResponseComplete: resonaSpellCutin,
      }));
      return;
    }

    // すべてをスタックに積む
    const allEntries = [...ownEntries, ...fieldEntries, ...paymentEntries];
    const turnPlayerId = ctx.bs.active_user_id ?? sc.actorId;
    const existing = ctx.bs?.effect_stack ?? null;
    const stack = existing
      ? pushToStack(existing, allEntries)
      : initStack(turnPlayerId, allEntries);

    const stateKey = actorIsHost ? 'host_state' : 'guest_state';
    const summonUpdate = reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey: stateKey, myState: placed, effectStack: stack, clearPending: true,
      opp: opAfterPlay ? { key: opKeySummon, state: opAfterPlay } : undefined,
      markCutinResponseComplete: resonaSpellCutin,
    });
    const { error: summonErr } = await ctx.io.commit(summonUpdate);
    if (summonErr) console.error('[handleSummonSigni] DB error:', summonErr);
  } finally {
    ctx.io.setLoading(false);
  }
};
