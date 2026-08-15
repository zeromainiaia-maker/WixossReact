import type { CardData, PlayerState, SigniDeployBan } from '../types';
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
 * ⚠**ライズ（既存シグニへの上乗せ）が外れるのは count 制限だけ**（`onExistingStack: true`）。
 * 数制限の原文は「（すでに場に3体ある場合は2体になるようにトラッシュ）」＝**場のシグニの体数**を縛るもので、
 * 上乗せでは体数が増えないため対象外。一方パワー制限は「パワーN以上のシグニを**新たに場に出せない**」＝
 * ライズも場に出す行為なので**適用する**（旧・通常召喚UIの分岐と同じ非対称）。
 */
export type DeployBlockReason =
  | 'COUNT_LIMIT'  // 「シグニをN体までしか場に出すことができない」（AUTO フラグ or CONTINUOUS）
  | 'POWER_LIMIT'  // 「パワーN以上のシグニを新たに場に出せない」
  | 'NAME_BAN'     // 「それと同じ名前のシグニを新たに場に出せない」（signi_deploy_bans）
  | 'SOURCE_BAN'   // 「自分の、シグニとスペルの効果によってシグニを新たに場に出せない」（同上）
  | 'ALL_BAN';     // 「このターン、あなたは他のシグニを場に出せない」＝絞り込みキー無しの ban（同上）

/**
 * その配置が「どうやって場に出されるか」。`signi_deploy_bans.bySource` の判定だけに使う。
 *
 * ⚠**すべての呼び出し元が明示する**（省略＝出自不明＝ bySource つき ban は掛からない＝過少側に倒す）。
 * ⚠`'signi_or_spell_effect'` は**効果元カードの Type がシグニ／スペル**のときだけ＝アーツ／ルリグ／キーの
 *   効果による配置は原文の対象外（`WX25-P3-009`）。
 */
export type DeployPlacementSource = 'normal_summon' | 'signi_or_spell_effect' | 'other_effect';

/** 効果元カード番号から `DeployPlacementSource` を決める（engine 側の共通ヘルパー）。 */
export function effectPlacementSource(
  sourceCardNum: string | undefined,
  cardMap: Map<string, CardData>,
): DeployPlacementSource {
  const type = cardMap.get(sourceCardNum ?? '')?.Type
    ?? cardMap.get((sourceCardNum ?? '').split('#')[0])?.Type
    ?? '';
  return /シグニ|スペル/.test(type) ? 'signi_or_spell_effect' : 'other_effect';
}

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
  /** ライズ＝既存スタックへの上乗せ。**count 制限だけ**を外す（パワー制限は外さない）。 */
  onExistingStack?: boolean;
  /** 場のシグニ数から差し引く枚数（レゾナの出現条件で場から払う分など、この配置と同時に場を空ける数）。 */
  fieldCountAdjust?: number;
  /** どうやって場に出すか。`signi_deploy_bans.bySource` の判定にだけ使う（省略＝出自不明）。 */
  placementSource?: DeployPlacementSource;
}

/** 出そうとしているシグニの表記パワー（∞は Infinity）。 */
function deployPower(p: DeployLimitInput): number {
  const raw = p.cardMap.get(p.cardNum)?.Power ?? p.cardMap.get(p.cardNum.split('#')[0])?.Power;
  return raw === '∞' ? Infinity : (parseInt(raw ?? '', 10) || 0);
}

/** いまの配置に掛かっている `signi_deploy_bans` の1件（無ければ null）。 */
function matchedDeployBan(p: DeployLimitInput): SigniDeployBan | null {
  const bans = p.placingState.signi_deploy_bans ?? [];
  if (bans.length === 0) return null;
  const name = p.cardMap.get(p.cardNum)?.CardName
    ?? p.cardMap.get(p.cardNum.split('#')[0])?.CardName;
  return bans.find(ban => {
    if (ban.turnsRemaining <= 0) return false;
    if (ban.cardNames && !(name && ban.cardNames.includes(name))) return false;
    if (ban.bySource && p.placementSource !== ban.bySource) return false;
    if (ban.powerGte !== undefined && deployPower(p) < ban.powerGte) return false;
    return true;
  }) ?? null;
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
  // 名前／出自／パワーによる配置禁止（「このターンと次のターンの間、〜を新たに場に出せない」）。
  // ⚠**ライズ（上乗せ）も「場に出す」**なので対象にする（数制限だけが非対称）。
  const ban = matchedDeployBan(p);
  if (ban) {
    if (ban.cardNames) return 'NAME_BAN';
    if (ban.bySource) return 'SOURCE_BAN';
    return ban.powerGte !== undefined ? 'POWER_LIMIT' : 'ALL_BAN';
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
  if (reason === 'COUNT_LIMIT') return `配置数制限のため${cardLabel}を場に出せない`;
  if (reason === 'NAME_BAN') return `同じ名前のシグニを新たに場に出せないため${cardLabel}を場に出せない`;
  if (reason === 'SOURCE_BAN') return `シグニとスペルの効果では新たに場に出せないため${cardLabel}を場に出せない`;
  if (reason === 'ALL_BAN') return `このターンは他のシグニを場に出せないため${cardLabel}を場に出せない`;
  return `配置パワー制限のため${cardLabel}を場に出せない`;
}
