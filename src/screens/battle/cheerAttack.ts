/**
 * **チアゾーンのシグニのアタック先**（§5.3 `O-538` 段階4・2026-10-01）。
 *
 * 🔑**公式ルール**（タカラトミー「チアゾーン」word_125）＝チアゾーンのシグニは**相手のシグニゾーンを1つ選んで**アタックする。
 *   正面は無い／対戦相手（ルリグ）へ直接アタックはできない／**シグニがいないゾーンを選んでもよいが何も起きない**
 *   （ライフはクラッシュしない）。アタックしたときの【自】は発動する。
 * 🔑判定は人間のボタン（`BattleScreen`）と CPU（`cpuTurn`）の**両方がここを通す**（写経すると片側だけズレる）。
 */
import type { CardData, PlayerState } from '../../types';
import { getCardNum } from '../../engine/effectExecutor';

export interface CheerAttackTarget {
  /** 相手のシグニゾーン番号（0〜2）。 */
  zone: number;
  /** そのゾーンの一番上のシグニ（いなければ null）。 */
  signi: string | null;
  /** ボタンの文言（例「アタック→《羅菌　ナットー》」／「アタック→空きゾーン（何も起きない）」）。 */
  label: string;
}

/** 相手の各シグニゾーンをアタック先として列挙する（空きゾーンも含む＝ルール上選べる）。 */
export function cheerAttackTargets(defender: PlayerState, cardMap: Map<string, CardData>): CheerAttackTarget[] {
  return [0, 1, 2].map(zone => {
    const signi = defender.field.signi[zone]?.at(-1) ?? null;
    const name = signi ? (cardMap.get(getCardNum(signi))?.CardName ?? signi) : null;
    // ⚠視点＝アタックする側から見た左右（相手のゾーン z はこちらのゾーン 2-z と向かい合う）。
    const side = ['左', '中央', '右'][2 - zone];
    return {
      zone, signi,
      label: name ? `アタック→《${name}》` : `アタック→${side}の空きゾーン（何も起きない）`,
    };
  });
}

/**
 * CPU が選ぶアタック先。🔑**チアゾーンのアタックに損は無い**（規則上アタッカーはバトルで落ちない・ライフも割らない）＝
 *   ①**バニッシュできる（パワーが同じか上の）シグニのうち一番強いもの** ②いなければ空きゾーン（【自】だけ起こす）
 *   ③空きゾーンも無ければ一番弱いシグニ（バトルは起きるが何も失わない）。
 */
export function pickCheerAttackTarget(p: {
  defender: PlayerState;
  attackerPower: number;
  defenderPower: (signi: string) => number;
}): number {
  const zones = [0, 1, 2];
  const occupied = zones.filter(z => !!p.defender.field.signi[z]?.at(-1));
  const beatable = occupied
    .map(z => ({ z, pw: p.defenderPower(p.defender.field.signi[z]!.at(-1)!) }))
    .filter(x => x.pw <= p.attackerPower)
    .sort((a, b) => b.pw - a.pw);
  if (beatable.length > 0) return beatable[0].z;
  const empty = zones.find(z => !occupied.includes(z));
  if (empty !== undefined) return empty;
  return occupied
    .map(z => ({ z, pw: p.defenderPower(p.defender.field.signi[z]!.at(-1)!) }))
    .sort((a, b) => a.pw - b.pw)[0].z;
}
