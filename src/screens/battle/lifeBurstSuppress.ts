import type { CardData, PlayerState } from '../../types';
import type { CardEffect, StubAction, TargetFilter } from '../../types/effects';
import { checkActiveCondition, collectGrantedFromLayer } from '../../engine/effectEngine';
import { getCardNum } from '../../engine/effectExecutor';
import { matchesFilter } from '../../engine/execUtils';

/**
 * §5.3 `O-177`：**このターンのライフバースト抑制が、いま公開された1枚に効くか。**
 *
 * `PlayerState.suppress_life_burst` は **`true`（このターンの全バースト）**か
 * **`TargetFilter`（条件つき）**。
 * 🔴**素の truthy 判定に戻さないこと**＝`WX25-P3-003-E1` の原文は
 *   「**対戦相手のセンタールリグと共通する色を持たない**対戦相手のカードのライフバーストは発動しない」で、
 *   旧実装（boolean）は**そのターンの相手のバーストを全部止めて**いた（過剰実行）。
 *
 * ⚠**基準ルリグはフラグの持ち主**＝抑制フラグはクラッシュ**される側**の state に立つので、
 *   `colorNotMatchesLrig` はその側のセンタールリグで解決する（原文の「対戦相手の」＝抑制される側から見て自分）。
 * ⚠**色は配列で渡す**（文字列だと `colorExclude` が1要素扱いになり1色も除外されない＝§5.3 `O-183` の実測）。
 *
 * @param crashedCardNum クラッシュされて公開された1枚
 * @param crashedState   その持ち主（＝抑制フラグが立っている側）の状態
 */
export function lifeBurstSuppressedByTurnFlag(
  crashedCardNum: string,
  crashedState: PlayerState,
  cardMap: Map<string, CardData>,
): boolean {
  const flag = crashedState.suppress_life_burst;
  if (!flag) return false;
  if (flag === true) return true;
  let filter: TargetFilter = flag;
  if (filter.colorMatchesLrig || filter.colorNotMatchesLrig) {
    const lrigTop = crashedState.field.lrig.at(-1);
    const lrigColor = lrigTop ? cardMap.get(getCardNum(lrigTop))?.Color : undefined;
    const wantsMatch = !!filter.colorMatchesLrig;
    const { colorMatchesLrig: _m, colorNotMatchesLrig: _n, ...rest } = filter;
    const colors = lrigColor ? [...lrigColor].filter(c => '白赤青緑黒'.includes(c)) : [];
    // ルリグ色が引けない＝絞れない。抑制は**広げない側**（＝抑制しない）へ倒す。
    if (colors.length === 0) return false;
    filter = wantsMatch ? { ...rest, color: colors } : { ...rest, colorExclude: colors };
  }
  return matchesFilter(cardMap.get(getCardNum(crashedCardNum)), filter);
}

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
