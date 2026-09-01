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
  | 'ALL_BAN'      // 「このターン、あなたは他のシグニを場に出せない」＝絞り込みキー無しの ban（同上）
  | 'ONLY_BY_NAMED_EFFECT' // 「《X》の効果以外によっては／によってしか新たに場に出せない」（SELF_PLAY_RESTRICT.exceptSourceCardNames）
  | 'ZONE_LEVEL_RESTRICT'; // 「対戦相手は中央のシグニゾーンにレベルN以上のシグニを新たに配置できない」（STUB.zonePlacementRestrict）

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
  /**
   * 配置の出所となった**効果元カード番号**（`SELF_PLAY_RESTRICT.exceptSourceCardNames` の照合にだけ使う）。
   * ⚠`placementSource` は種別（シグニ/スペル か それ以外）しか運ばないので**カード名までは分からない**＝別口で受ける。
   * 省略＝出自不明＝名前限定の出撃制限は掛けない（この funnel の既存規約どおり過少側へ倒す）。
   */
  placementSourceCardNum?: string;
  /**
   * 置こうとしているシグニゾーンの index（0=左 1=中央 2=右）。
   * `STUB{OPP_ZONE_PLACEMENT_RESTRICT}`（「中央のシグニゾーンにレベルN以上を配置できない」）の判定にだけ使う。
   * ⚠**省略＝ゾーン未確定＝掛けない**（この funnel の既存規約どおり過少側）。
   */
  zoneIndex?: number;
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

/**
 * 出そうとしているカード自身の `SELF_PLAY_RESTRICT.exceptSourceCardNames`（配置元の効果を名前で限定する）に
 * 引っかかるか。掛からない／判定できないときは false（過少側）。
 *
 * 🔑**「置く側のプレイヤー」ではなく「置かれるカード自身」の【常】能力**なので、`signi_deploy_bans` とは別の器から読む。
 * 効果は印刷能力なので `effectsMap`（付与ぶんを含む）が無い経路でも `cardMap` の live 効果で足りる。
 */
function blockedByOnlyByNamedEffect(p: DeployLimitInput): boolean {
  if (!p.placementSource) return false; // 出自不明＝掛けない
  const base = p.cardNum.split('#')[0];
  const effects = p.effectsMap?.get(p.cardNum) ?? p.effectsMap?.get(base)
    ?? p.cardMap.get(p.cardNum)?.effects ?? p.cardMap.get(base)?.effects;
  if (!effects) return false;
  for (const eff of effects) {
    if (eff.effectType !== 'CONTINUOUS') continue;
    const a = eff.action;
    if (!a || a.type !== 'SELF_PLAY_RESTRICT') continue;
    const names = a.exceptSourceCardNames;
    if (!names || names.length === 0) continue;
    if (p.placementSource === 'normal_summon') return true; // 通常召喚は「効果によって」ではない
    const srcNum = p.placementSourceCardNum;
    if (!srcNum) return true; // 効果配置なのに出所が分からない＝原文は名前限定なので掛ける
    const srcName = p.cardMap.get(srcNum)?.CardName ?? p.cardMap.get(srcNum.split('#')[0])?.CardName;
    if (!srcName || !names.includes(srcName)) return true;
  }
  return false;
}

/**
 * 相手の【常】「対戦相手は中央のシグニゾーンにレベルN以上のシグニを新たに配置できない」に引っかかるか。
 *
 * 🔑**旧はここが funnel の外にあった**＝判定は `effectEngine.collectCenterZoneDeployRestrict` にあり、
 *   呼び出しは **`BattleScreen` の通常召喚1箇所だけ**＝**CPU 配置も engine の効果配置も素通り**していた（§5.3 `O-94`②）。
 * ⚠**制限を持つのは「置く側の相手」**＝`opponentState` を走査する（`signi_deploy_bans` は置く側の state）。
 * ⚠ライズ（上乗せ）も「新たに配置」なので対象にする。
 */
function blockedByZoneLevelRestrict(p: DeployLimitInput): boolean {
  if (p.zoneIndex === undefined) return false; // ゾーン未確定＝掛けない
  const lv = p.cardMap.get(p.cardNum)?.Level ?? p.cardMap.get(p.cardNum.split('#')[0])?.Level;
  const level = parseInt(lv ?? '', 10) || 0;
  const holders = [
    ...p.opponentState.field.signi.map(st => st?.at(-1)).filter((n): n is string => !!n),
    ...(p.opponentState.field.lrig?.at(-1) ? [p.opponentState.field.lrig.at(-1)!] : []),
  ];
  for (const cn of holders) {
    const base = cn.split('#')[0];
    const effects = p.effectsMap?.get(cn) ?? p.effectsMap?.get(base)
      ?? p.cardMap.get(cn)?.effects ?? p.cardMap.get(base)?.effects ?? [];
    for (const eff of effects) {
      if (eff.effectType !== 'CONTINUOUS') continue;
      const act = eff.action as { type?: string; id?: string; zonePlacementRestrict?: { zones: number[]; minLevel: number } };
      if (act?.type !== 'STUB' || act.id !== 'OPP_ZONE_PLACEMENT_RESTRICT') continue;
      const spec = act.zonePlacementRestrict;
      if (!spec) continue; // ペイロードが無い宣言では何もしない（fail-closed）
      if (spec.zones.includes(p.zoneIndex) && level >= spec.minLevel) return true;
    }
  }
  return false;
}

/** 配置できない理由。null なら配置可能。 */
export function deployLimitBlockReason(p: DeployLimitInput): DeployBlockReason | null {
  // 出撃元の効果を名前で限定する自身出撃制限（`O-74`/`O-79`）。ライズ（上乗せ）も「場に出す」なので対象にする。
  if (blockedByOnlyByNamedEffect(p)) return 'ONLY_BY_NAMED_EFFECT';
  // ゾーン＋レベル指定の配置禁止（`O-94`②）。`zoneIndex` を渡した呼び出し元だけが受ける。
  if (blockedByZoneLevelRestrict(p)) return 'ZONE_LEVEL_RESTRICT';

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
  if (reason === 'ONLY_BY_NAMED_EFFECT') return `特定のカードの効果によってしか場に出せないため${cardLabel}を場に出せない`;
  if (reason === 'ZONE_LEVEL_RESTRICT') return `そのシグニゾーンにはそのレベルのシグニを配置できないため${cardLabel}を場に出せない`;
  return `配置パワー制限のため${cardLabel}を場に出せない`;
}
