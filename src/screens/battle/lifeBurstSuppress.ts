import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';
import { checkActiveCondition, collectGrantedFromLayer } from '../../engine/effectEngine';

/**
 * 「**このシグニによって**クラッシュされた（対戦相手の）カードのライフバーストは発動しない」
 * （`SUPPRESS_LIFE_BURST_ON_CRASH` の **CONTINUOUS** 用法）の判定。
 *
 * ⚠**既存の3軸では拾えない**＝(1) `suppress_life_burst` は STUB を**実行**したときに立つターンフラグで
 *   CONTINUOUS 能力は実行されない (2) `eichiSuppressActive` は `activeCondition.type==='EICHI_LEVEL_SUM'`
 *   限定（`WX16-067` 専用）(3) `game_suppress_lb` はプレイヤー付与。
 *   `WXEX1-32` は【レイヤー】で＜怪異＞のシグニへ**付与された** CONTINUOUS なので、どれにも載らない。
 *
 * ⚠**発生源を見る**のが原文どおり＝「**このシグニによって**クラッシュされた」なので、盤面全体ではなく
 *   `crash_source_card_num`（`execLifeCrash` が記録するクラッシュ元）だけを調べる。
 *   盤面全体を見る実装にすると、その能力を持たないシグニのクラッシュまで抑制する過剰実行になる。
 *
 * ⚠**印字だけでなく【レイヤー】付与も見る**＝`collectGrantedFromLayer` を通さないと、
 *   `WXEX1-32` のように「付与された能力」で成立する形が丸ごと落ちる。
 *
 * @param sourceOwnerState クラッシュ元カードの持ち主（＝クラッシュした側から見た対戦相手）の状態
 * @param sourceOpponentState その対戦相手（＝ライフをクラッシュされた側）の状態
 * @param crashSourceCardNum `crash_source_card_num`（クラッシュを起こした効果元の instanceId）
 * @param isSourceOwnerTurn 発生源の持ち主のターンか（activeCondition 評価用）
 */
export function crashSourceSuppressesLifeBurst(
  sourceOwnerState: PlayerState,
  sourceOpponentState: PlayerState,
  crashSourceCardNum: string | null | undefined,
  effectsMap: Map<string, CardEffect[]>,
  cardMap: Map<string, CardData>,
  isSourceOwnerTurn: boolean,
): boolean {
  if (!crashSourceCardNum) return false;
  // 発生源が持ち主の場にいなければ（既に離場等）判定しない。
  const onField = sourceOwnerState.field.signi.some(stack => stack?.at(-1) === crashSourceCardNum);
  if (!onField) return false;
  const granted = collectGrantedFromLayer(
    sourceOwnerState, sourceOpponentState, isSourceOwnerTurn, effectsMap, cardMap,
  ).get(crashSourceCardNum) ?? [];
  const effects: CardEffect[] = [...(effectsMap.get(crashSourceCardNum) ?? []), ...granted];
  return effects.some(eff => {
    if (eff.effectType !== 'CONTINUOUS') return false;
    const act = eff.action as StubAction | undefined;
    if (act?.type !== 'STUB' || act.id !== 'SUPPRESS_LIFE_BURST_ON_CRASH') return false;
    return checkActiveCondition(
      eff.activeCondition, sourceOwnerState, sourceOpponentState, isSourceOwnerTurn, cardMap, crashSourceCardNum,
    );
  });
}
