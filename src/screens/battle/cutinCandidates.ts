import type { CardData, PendingSpell, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import { getCardNum } from '../../engine/effectExecutor';
import { evalUseCondition } from '../../engine/effectExecutor';
import { canUseArtsCondition } from './battleUtils';
import { findCounterSpellMaxCost, parseGrowCost } from './costs';
import { meetsRestriction } from './growLogic';
import { hasIgnoreLrigRestriction } from './artsUseGate';
import { collectPieceCutinCandidates } from './pieceCutin';
import { canPayUnderSelfTrash } from './underAnySigniCost';
import { collectGrantedLrigEffects } from './lrigActivateGate';
import { getSpellCutinResonaCandidates } from './resonaSummon';
import type { CutinCandidate } from './modals/types';

/**
 * 🆕**スペル／ピースのカットイン候補**（§5.6 `C-10`・2026-09-22）＝
 * `BattleScreen.tsx` の `cutinCandidates`（149行の `useMemo`）を**逐語で移設**し、
 * **応答者をパラメータ化**した（`performArts` / `performSigniActivated` と同じやり方＝DESIGN §4）。
 *
 * 🔴**なぜ要るか**＝旧はこの式が**画面の「自分」（＝人間）専用**だったので、
 *   **CPU はカットイン窓で常にパスするしかなかった**（`cpuTurn.ts` の「人間のスペルに対してCPUは常にパス」）。
 *   📏実測（2026-09-22）＝カットインできる札は **61カード**、**ユーザー作27デッキ中7デッキ**が持つ
 *   （A/B に入る `WD13`・`ケトッシー軸` を含む）＝**測れる穴**。
 *
 * ⚠**判定はここに集約する**（人間の画面も CPU も同じ関数を呼ぶ）＝
 *   写経すると「人間には出るのに CPU には出ない」型の無言のズレになる。
 */
export interface CutinCandidateInput {
  /** 応答する側（＝カットインを使うかもしれないプレイヤー）。 */
  my: PlayerState;
  /** スペル／ピースを使った側。 */
  op: PlayerState;
  /** 応答者の user id（`pendingSpell.caster_id` と比べる）。 */
  responderId: string;
  pendingSpell: PendingSpell | null | undefined;
  hostState: PlayerState;
  guestState: PlayerState;
  hostId: string;
  turnPhase: TurnPhase | string | null | undefined;
  isMyTurn: boolean;
  cardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  effectivePowers?: Map<string, number>;
  /** 応答者のルリグクラス（`meetsRestriction` に渡す）。 */
  lrigClass: string;
}

export function collectCutinCandidates(p: CutinCandidateInput): CutinCandidate[] {
  if (!p.pendingSpell || p.pendingSpell.caster_id === p.responderId) return [];
  // §6.4 O-10（続き518）＝ピース応答窓。スペル窓とは**候補の出所も打ち消しの意味も違う**ので早期に分岐する。
  if (p.pendingSpell.kind === 'piece') {
    const usedPieceCard = p.cardMap.get(getCardNum(p.pendingSpell.card_num));
    return collectPieceCutinCandidates({
      responder: p.my, caster: p.op, usedPieceCard,
      cardMap: p.cardMap, effectsMap: p.effectsMap, turnPhase: p.turnPhase ?? undefined,
    }).map(c => ({
      kind: 'effect' as const, card: c.card, instanceId: c.instanceId,
      source: 'lrig_deck' as const, effect: c.effect,
      // ⚠打ち消しは**選択肢①を選んだときだけ**なので、窓を閉じる既定挙動としては打ち消さない。
      countersSpell: false,
    }));
  }
  // GRANT_NEXT_SPELL_UNCOUNTERABLE（WX04-008）は打ち消す従来候補だけを抑止する。
  // SPELL_CUTINレゾナはスペルを打ち消さず先にON_PLAYを解決するため、この窓自体は残す。
  const cutinCasterState = p.pendingSpell.caster_id === p.hostId ? p.hostState : p.guestState;
  const spellUncounterable = !!cutinCasterState.next_spell_uncounterable;
  const pendingSpellCard = p.cardMap.get(p.pendingSpell.card_num);
  const pendingSpellCostTotal = pendingSpellCard
    ? parseGrowCost(pendingSpellCard.Cost).reduce((s, c) => s + c.count, 0)
    : 0;
  const result: CutinCandidate[] = [];

  // 1. lrig_deck: CSV Timing列に「スペルカットイン」を含むカード
  if (!spellUncounterable) p.my.lrig_deck
    .filter((id, i, arr) => arr.indexOf(id) === i)
    .forEach(instanceId => {
      const cardNum = getCardNum(instanceId);
      const card = p.cardMap.get(cardNum);
      if (!card || !card.Timing.includes('スペルカットイン')) return;
      if (!meetsRestriction(card.Restriction, p.lrigClass,
        hasIgnoreLrigRestriction(p.my, p.effectsMap, 'arts', card))) return;
      const effs = p.effectsMap.get(instanceId) ?? p.effectsMap.get(cardNum) ?? [];
      const eff = effs.find(e => e.effectType === 'ACTIVATED');
      if (!canUseArtsCondition(effs, p.my, p.op, p.cardMap, instanceId, p.turnPhase as TurnPhase, p.isMyTurn, p.effectivePowers)) return;
      const maxCost = eff ? findCounterSpellMaxCost(eff.action) : undefined;
      if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
      const dummyEff: import('../../types/effects').CardEffect = eff ?? {
        effectId: cardNum + '-cutin-dummy',
        effectType: 'ACTIVATED',
        timing: ['SPELL_CUTIN'],
        action: { type: 'COUNTER_SPELL' },
        duration: 'INSTANT',
        mandatory: false,
        parseStatus: 'MANUAL',
      };
      // アンチ・スペル・バツの②は、任意支払いを「このカットインを使う」
      // 選択そのものとして扱う。通常のアーツ使用時は manualEffects の CHOOSE を使う。
      if (cardNum === 'WX24-P3-036' && eff?.action.type === 'CHOOSE') {
        const counterChoice = eff.action.choices.find(c => c.action.type === 'SEQUENCE'
          && c.action.steps.some(s => s.type === 'COUNTER_SPELL'));
        if (counterChoice) {
          result.push({
            kind: 'effect',
            card, instanceId, source: 'lrig_deck',
            effect: { ...eff, effectId: `${eff.effectId}-cutin-counter`, action: counterChoice.action },
            additionalColorlessCost: pendingSpellCostTotal,
            countersSpell: true,
          });
        }
        return;
      }
      result.push({ kind: 'effect', card, instanceId, source: 'lrig_deck', effect: dummyEff });
    });

  // 2. lrig_field + key_piece: ACTIVATED効果にSPELL_CUTINタイミングを持つルリグ/キー
  const lrigAndKeyIds = [
    ...new Set(p.my.field.lrig.filter(Boolean)),
    ...(p.my.field.key_piece ? [p.my.field.key_piece] : []),
    ...(p.my.field.key_piece_extra ?? []),
  ];
  if (!spellUncounterable) lrigAndKeyIds.forEach(instanceId => {
    const cardNum = getCardNum(instanceId);
    const card = p.cardMap.get(cardNum);
    if (!card) return;
    const effs = p.effectsMap.get(instanceId) ?? p.effectsMap.get(cardNum) ?? [];
    const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
    if (!eff) return;
    if (eff.cost?.underSelfTrash) return;
    if (eff.cost?.coin) return;
    const maxCost = findCounterSpellMaxCost(eff.action);
    if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
    // 使用条件（「あなたの場に＜凶蟲＞のシグニがある場合」等）を満たさないカットインは候補から除外
    if (eff.condition && !evalUseCondition(eff.condition, p.my, p.op, p.cardMap, instanceId, p.turnPhase as TurnPhase, p.effectivePowers)) return;
    result.push({ kind: 'effect', card, instanceId, source: 'lrig_field', effect: eff });
  });

  // 2b. センタールリグへ**付与**された SPELL_CUTIN の【起】（タスク12(l)）。
  // キーの「あなたのセンタールリグは以下の能力を得る。【起】《スペルカットインアイコン》エクシード１：…」を
  // GRANT_LRIG_ABILITY.abilities へ入れ子にしたため、キーカード自身の effects を走査する 2. では拾えない。
  // 2. と同じガード（uncounterable / underSelfTrash / coin / maxCost / condition）を通す。
  if (!spellUncounterable) {
    const cutinLrigId = p.my.field.lrig.at(-1);
    const cutinLrigCard = cutinLrigId ? p.cardMap.get(getCardNum(cutinLrigId)) : undefined;
    if (cutinLrigId && cutinLrigCard) {
      // ⚠**収集は `lrigActivateGate.collectGrantedLrigEffects` 1本**（画面の `grantedMyLrigEffects` と同じ関数）＝
      //   ここで写経すると「人間には出るのに CPU には出ない」型の無言のズレになる。
      for (const eff of collectGrantedLrigEffects(p.my, p.op, p.isMyTurn, p.effectsMap, p.cardMap)) {
        if (eff.effectType !== 'ACTIVATED' || !eff.timing?.includes('SPELL_CUTIN')) continue;
        if (eff.cost?.underSelfTrash) continue;
        if (eff.cost?.coin) continue;
        const maxCost = findCounterSpellMaxCost(eff.action);
        if (maxCost !== undefined && pendingSpellCostTotal > maxCost) continue;
        if (eff.condition && !evalUseCondition(eff.condition, p.my, p.op, p.cardMap, cutinLrigId, p.turnPhase as TurnPhase, p.effectivePowers)) continue;
        result.push({ kind: 'effect', card: cutinLrigCard, instanceId: cutinLrigId, source: 'lrig_field', effect: eff });
      }
    }
  }

  // 3. signi_field: ACTIVATED効果にSPELL_CUTINタイミングを持つシグニ
  if (!spellUncounterable) p.my.field.signi.forEach((zone, zoneIdx) => {
    const topId = zone?.at(-1);
    if (!topId) return;
    const cardNum = getCardNum(topId);
    const card = p.cardMap.get(cardNum);
    if (!card) return;
    const effs = p.effectsMap.get(topId) ?? p.effectsMap.get(cardNum) ?? [];
    const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
    if (!eff) return;
    if (eff.cost?.underSelfTrash && !canPayUnderSelfTrash(
      p.my, zoneIdx, eff.cost.underSelfTrash.count, p.cardMap,
      eff.cost.underSelfTrash.filter, eff.cost.underSelfTrash.selectionConstraint,
    )) return;
    const maxCost = findCounterSpellMaxCost(eff.action);
    if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
    if (eff.condition && !evalUseCondition(eff.condition, p.my, p.op, p.cardMap, topId, p.turnPhase as TurnPhase, p.effectivePowers)) return;
    result.push({ kind: 'effect', card, instanceId: topId, source: 'signi_field', effect: eff, zoneIdx });
  });

  // 4. hand: ACTIVATED効果にSPELL_CUTINタイミングを持つ手札カード
  if (!spellUncounterable) p.my.hand.forEach((cardNum, handIdx) => {
    const card = p.cardMap.get(cardNum);
    if (!card) return;
    const effs = p.effectsMap.get(cardNum) ?? [];
    const eff = effs.find(e => e.effectType === 'ACTIVATED' && e.timing?.includes('SPELL_CUTIN'));
    if (!eff) return;
    const maxCost = findCounterSpellMaxCost(eff.action);
    if (maxCost !== undefined && pendingSpellCostTotal > maxCost) return;
    if (eff.condition && !evalUseCondition(eff.condition, p.my, p.op, p.cardMap, cardNum, p.turnPhase as TurnPhase, p.effectivePowers)) return;
    result.push({ kind: 'effect', card, instanceId: cardNum, source: 'hand', effect: eff, handIdx });
  });

  for (const resona of getSpellCutinResonaCandidates(p.my, p.cardMap, p.effectsMap)) {
    const card = p.cardMap.get(getCardNum(resona.cardNum));
    if (card) result.push({ kind: 'resona', card, instanceId: resona.cardNum, source: 'lrig_deck', resona });
  }

  return result;
}
