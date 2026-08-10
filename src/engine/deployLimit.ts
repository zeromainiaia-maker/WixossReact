import type { CardData, PlayerState } from '../types';
import type { CardEffect } from '../types/effects';
import { collectDeployCountLimit } from './effectEngine';

/**
 * 配置制限（「シグニをN体までしか場に出すことができない」「パワーN以上のシグニを新たに場に出せない」）の
 * 実効判定を1か所に集約した純関数。
 *
 * ⚠**通常召喚UIだけでなく engine の効果配置からも必ず呼ぶこと**。
 * かつてこの判定は **通常召喚UI（人間ボタン／召喚ゾーンモーダル）と CPU 召喚の3箇所にしか無く**、
 * `execAddToField` ほか engine 側の効果配置は cap も power limit も一切見ずにすり抜けていた
 * （＝「対戦相手はシグニを2体までしか場に出せない」を掛けても、効果で出す分は無制限だった。該当7効果）。
 *
 * ⚠**ライズ（既存シグニへの上乗せ）は「新たに場に出す」ではない**ので count 制限の対象外
 * （`onExistingStack: true` を渡す）。パワー制限は原文が「新たに場に出せない」なので同じく対象外。
 */
export type DeployBlockReason =
  | 'COUNT_LIMIT'  // 「シグニをN体までしか場に出すことができない」（AUTO フラグ or CONTINUOUS）
  | 'POWER_LIMIT'; // 「パワーN以上のシグニを新たに場に出せない」

export interface DeployLimitInput {
  /** シグニを場に出す側。 */
  placingState: PlayerState;
  /** その対戦相手（CONTINUOUS 版の配置制限を持つ側）。 */
  opponentState: PlayerState;
  /** 出そうとしているシグニ（instanceId 可）。パワー制限の判定に使う。 */
  cardNum: string;
  cardMap: Map<string, CardData>;
  /** CONTINUOUS 版（`WX07-006` レゾナ等）の走査に要る。無い場合は**フラグ版だけ**で判定する。 */
  effectsMap?: Map<string, CardEffect[]>;
  /** 事前計算済みの CONTINUOUS 版 cap。`effectsMap` を渡せない経路（ExecCtx）はこちらを使う。 */
  contCountCap?: number;
  /** 配置する側のターンか（CONTINUOUS 側の `activeCondition` 評価に使う）。不明なら相手ターン扱いにしない。 */
  isPlacingOwnerTurn?: boolean;
  /** ライズ＝既存スタックへの上乗せ（新規配置ではない）。 */
  onExistingStack?: boolean;
  /** 場のシグニ数から差し引く枚数（レゾナの出現条件で場から払う分など、この配置と同時に場を空ける数）。 */
  fieldCountAdjust?: number;
}

/** 配置数上限（AUTO フラグと CONTINUOUS の小さい方）。undefined なら制限なし。 */
export function deployCountCap(p: {
  placingState: PlayerState;
  opponentState: PlayerState;
  cardMap: Map<string, CardData>;
  effectsMap?: Map<string, CardEffect[]>;
  contCountCap?: number;
  isPlacingOwnerTurn?: boolean;
}): number | undefined {
  const cont = p.effectsMap
    ? collectDeployCountLimit(
        p.opponentState, p.placingState, p.cardMap, p.effectsMap,
        p.isPlacingOwnerTurn === undefined ? false : !p.isPlacingOwnerTurn,
      )
    : p.contCountCap;
  const flag = p.placingState.signi_deploy_count_limit;
  if (flag === undefined) return cont;
  return cont === undefined ? flag : Math.min(flag, cont);
}

/** 配置できない理由。null なら配置可能。 */
export function deployLimitBlockReason(p: DeployLimitInput): DeployBlockReason | null {
  // パワー制限（「パワーN以上のシグニを新たに場に出せない」）。ライズ＝上乗せは「新たに」ではない。
  const powerLimit = p.placingState.signi_deploy_power_limit;
  if (powerLimit !== undefined && !p.onExistingStack) {
    const raw = p.cardMap.get(p.cardNum)?.Power ?? p.cardMap.get(p.cardNum.split('#')[0])?.Power;
    const power = raw === '∞' ? Infinity : (parseInt(raw ?? '', 10) || 0);
    if (power >= powerLimit) return 'POWER_LIMIT';
  }

  if (p.onExistingStack) return null; // ライズは新規配置でないので数制限の対象外

  const cap = deployCountCap(p);
  if (cap === undefined) return null;
  const fieldCount = p.placingState.field.signi.filter(s => s && s.length > 0).length
    - (p.fieldCountAdjust ?? 0);
  return fieldCount >= cap ? 'COUNT_LIMIT' : null;
}

/** ログ用の理由文（engine のログ・逆翻訳と語彙を揃える）。 */
export function deployLimitLogMessage(reason: DeployBlockReason, cardLabel: string): string {
  return reason === 'COUNT_LIMIT'
    ? `配置数制限のため${cardLabel}を場に出せない`
    : `配置パワー制限のため${cardLabel}を場に出せない`;
}
