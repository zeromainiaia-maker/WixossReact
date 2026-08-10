import type { PlayerState } from '../../types';
import type { CardEffect, StubAction } from '../../types/effects';

/**
 * 「このシグニは対戦相手にダメージを与えない」（`STUB:CANNOT_DEAL_DAMAGE_TO_OPPONENT`）の判定。
 *
 * §6.4 の STUB 仕分け計器（`npm run census:stubs`）が **A＝実装の穴（engine のどこにも消費が無い）**
 * として検出した1件（`WX25-CP1-074-E1` が付与する【常】）。付与されても engine 側の受け皿が無く、
 * 逆翻訳には出るのに実機では**ライフを普通にクラッシュしていた**。
 *
 * ⚠**印字能力と付与能力の両方を見る**＝この能力は現状 `GRANT_EFFECT` 経由の付与でしか現れないが、
 *   付与ストア（`granted_effects` / `granted_effects_until_opp_turn`）だけを見る実装にすると、
 *   同じ文を印字するカードが増えた瞬間に無言で落ちる。走査軸は `effectEngine` の
 *   「印字＋付与2ストア」（`effectEngine.ts` の能力収集）と同じ3本に揃える。
 *
 * ⚠**ダメージ地点は1つではない**＝呼び出し元は `resolvePendingSigniBattleFor` の
 *   (a) ランサー/Sランサーの追加クラッシュ (b) 正面が空/アサシンのライフアタック の**両方**でこれを見る。
 *   片方だけに入れると「バトルに勝ったときだけダメージが通る」半端な近似になる。
 */
export const CANNOT_DEAL_DAMAGE_STUB_ID = 'CANNOT_DEAL_DAMAGE_TO_OPPONENT';

export function signiCannotDealDamageToOpponent(
  attackerState: PlayerState,
  attackerNum: string | undefined,
  effectsMap: Map<string, CardEffect[]>,
): boolean {
  if (!attackerNum) return false;
  const effects: CardEffect[] = [
    ...(effectsMap.get(attackerNum) ?? []),
    ...(attackerState.granted_effects?.[attackerNum] ?? []),
    ...(attackerState.granted_effects_until_opp_turn?.[attackerNum] ?? []),
  ];
  return effects.some(eff => {
    if (eff.effectType !== 'CONTINUOUS') return false;
    const act = eff.action as StubAction | undefined;
    return act?.type === 'STUB' && act.id === CANNOT_DEAL_DAMAGE_STUB_ID;
  });
}
