import type { CardData, PlayerState } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import { collectOppEnergyColorRestriction } from '../../../engine/effectEngine';
import { recordEnergyPlacements } from '../../../engine/energyPlacement';

/**
 * 🆕**エナチャージの実行**（§5.7 `S-28`・2026-09-21）＝**手札からも場のシグニからも、同じ1本の関数で置く**。
 *
 * ■ 🔴**なぜ出したか**＝旧は `BattleScreen.tsx` に**ほぼ同じ手順が2本**（`handleEnergyChargeFromHand` /
 *   `…FromSigni`）あり、**CPU（`controller/cpuTurn.ts`）はそのどちらも通らない第3の写経**だった。
 *   その結果 **CPU だけが相手の「エナチャージの色制限」を無視していた**（人間はトラッシュ送りになるのに CPU はエナに置けていた）。
 *   ⇒ DESIGN §4・§8 `O-1` の「**判定も実行も人間と同じ関数**」へ寄せる。
 *
 * ■ ⚠**ここは純関数**（DB も画面も触らない）＝呼び出し側が `persist.commit` する。
 * ■ 🔴**色制限は「宣言された色を持た*ず無色ではない*カード」**＝無色（データ上は `無`／空）は素通しする（原文どおり）。
 *   当たったカードは**エナではなくトラッシュ**へ置く。
 * ■ 🔴**`actions_done` に `'ENERGY'` を必ず積む**＝1ターン1回の台帳（積み忘れると CPU が何度でもチャージする）。
 */
export type EnergyChargeSource =
  | { from: 'hand'; handIndex: number }
  /** 場のシグニ（そのゾーンの**最上層**）。⚠下敷き（ライズの下）は動かさない。 */
  | { from: 'field'; zone: number };

export interface EnergyChargeResult {
  state: PlayerState;
  /** 置いたカード（instance ID）。置けなかった（空のゾーン等）なら null。 */
  charged: string | null;
  /** 色制限でトラッシュへ行ったか。 */
  toTrash: boolean;
  logs: string[];
}

/** 色制限に当たるか（原文＝「宣言された色を持たず**無色ではない**カード」）。 */
function blockedByColorRestriction(colorRestrict: string | null | undefined, color: string): boolean {
  if (!colorRestrict) return false;
  const colorless = color === '' || color === '無' || color === '無色';
  return !colorless && !color.includes(colorRestrict);
}

/**
 * エナチャージを1回ぶん適用する。
 * @param actor 置く側の盤面／@param opponent 相手（色制限の読み取りに要る）
 * @param label ログの接頭辞（人間は空、CPU は `[CPU] `）。
 */
export function performEnergyCharge(
  actor: PlayerState, opponent: PlayerState, source: EnergyChargeSource,
  cardMap: Map<string, CardData>, effectsMap: Map<string, CardEffect[]>, label = '',
): EnergyChargeResult {
  /** 置くカードと、それを取り除いたあとの盤面。⚠置けない（空のゾーン・添字外）なら null。 */
  const taken: { charged: string; base: PlayerState } | null = (() => {
    if (source.from === 'hand') {
      const id = actor.hand[source.handIndex];
      if (!id) return null;
      return { charged: id, base: { ...actor, hand: actor.hand.filter((_, i) => i !== source.handIndex) } };
    }
    const stack = actor.field.signi[source.zone];
    if (!stack || stack.length === 0) return null;
    const signi = [...actor.field.signi] as (string[] | null)[];
    const rest = stack.slice(0, -1);
    signi[source.zone] = rest.length > 0 ? rest : null;
    return { charged: stack[stack.length - 1], base: { ...actor, field: { ...actor.field, signi } } };
  })();
  if (!taken) return { state: actor, charged: null, toTrash: false, logs: [] };
  const { charged, base } = taken;
  const name = cardMap.get(charged.split('#')[0])?.CardName ?? cardMap.get(charged)?.CardName ?? charged;
  const colorRestrict = collectOppEnergyColorRestriction(opponent, actor, effectsMap);
  const color = cardMap.get(charged.split('#')[0])?.Color ?? cardMap.get(charged)?.Color ?? '';
  const done = [...(actor.actions_done ?? []), 'ENERGY'];
  if (blockedByColorRestriction(colorRestrict, color)) {
    return {
      state: { ...base, trash: [...base.trash, charged], actions_done: done },
      charged, toTrash: true,
      logs: [`${label}エナチャージ→トラッシュ（${name}、${colorRestrict}色制限）`],
    };
  }
  // 🆕§5.3 `O-321` 第275＝「エナに送る」はルール処理（`cause:'rule'`）。
  const state = recordEnergyPlacements({ ...base, energy: [...base.energy, charged], actions_done: done }, [charged], 'rule');
  // ⚠**「場から置いた」という印はここでは出さない**＝`census:play` の規則は**文言がソースに literal で残っている**ことを
    //   golden `§5.6 C-3` が検査する。`${label}` を合成するこの場所では literal にならないので、**CPU 側で出す**（`cpuTurn.ts`）。
  return { state, charged, toTrash: false, logs: [`${label}エナチャージ（${name}）`] };
}
