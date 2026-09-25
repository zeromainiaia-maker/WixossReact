// 【トラップ】のルール上の誘発（2026-09-25・バグ報告 b16e1b03「トラップが発動しない」）。
//
// 公式ルール（用語集「トラップ」）＝「**このトラップの正面のシグニがアタックしたとき、このトラップと同じ
//   シグニゾーンにシグニがない場合、このトラップを表向きにしてもよい**」＝トリガー能力。
//   表向きにしたら《トラップアイコン》を発動し、その後トラッシュへ置かれる。
// 🔴旧実装は【トラップ】の発動を**カードの効果経由（`ACTIVATE_TRAP`／`trapOp:'activate'`）でしか**持っておらず、
//   設置されたトラップは相手のアタックで**一度も誘発しなかった**（`src/screens/` に収集箇所が1つも無かった）。
//
// ⚠**正面＝アタッカーと向かい合うゾーン**（`2 - アタッカーのゾーン`）。側面アタックでも「トラップの正面の
//   シグニ」はアタッカーの位置で決まる（攻撃先ゾーンではない）。
// ⚠**任意**（「〜してもよい」）＝`OPTIONAL_ACTIVATE` で問う。
// ⚠**札の名前をラベルに出さない**＝裏向き（§5.1 `V-285`）。
import type { CardEffect, EffectAction, StubAction } from '../types/effects';
import type { PlayerState } from '../types';

export interface NaturalTrapTrigger {
  trapCardNum: string;
  zoneIndex: number;
  effect: CardEffect;
  label: string;
}

/** 守備側の【トラップ】のうち、`attackerZoneIndex` のシグニのアタックで誘発するもの（0 または 1 件）。 */
export function collectNaturalTrapTrigger(
  defender: PlayerState,
  attackerZoneIndex: number,
): NaturalTrapTrigger | null {
  const zi = 2 - attackerZoneIndex;
  if (zi < 0 || zi > 2) return null;
  const trap = defender.field.signi_traps?.[zi];
  if (!trap) return null;
  if (defender.field.signi[zi]?.length) return null; // 同じシグニゾーンにシグニがある → 誘発しない
  const effect: CardEffect = {
    effectId: `RULE-NATURAL-TRAP-Z${zi + 1}`,
    effectType: 'AUTO',
    mandatory: false,
    duration: 'INSTANT',
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'STUB', id: 'OPTIONAL_ACTIVATE' } as StubAction as EffectAction,
        { type: 'STUB', id: 'ACTIVATE_TRAP', trapZoneIndex: zi } as StubAction as EffectAction,
      ],
    } as EffectAction,
  } as CardEffect;
  return { trapCardNum: trap, zoneIndex: zi, effect, label: `ゾーン${zi + 1}の【トラップ】（正面のシグニがアタック）` };
}
