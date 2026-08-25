import type { CardData, LifeCrashPreventionSpec, PlayerState } from '../types';
import type { CardEffect, StubAction } from '../types/effects';
import { checkActiveCondition } from './effectEngine';

/**
 * 「ライフクロスは〜**クラッシュされない**／N枚まで**しかクラッシュされ**ない」の**唯一の判定点**
 * （§5.3 `O-66`・2026-08-25）。
 *
 * ■ なぜ funnel が要るか
 *   **クラッシュの実行地点が3つある**：
 *     (1) シグニアタックのダメージ  … `BattleScreen.crashOneLife`
 *     (2) ルリグアタックのダメージ  … `BattleScreen` のルリグアタック解決（インライン・`crashOneLife` を**通らない**）
 *     (3) 効果によるクラッシュ      … `effectExecutor.execLifeCrash`（`LIFE_CRASH` アクション）
 *   `O-65` までは受け皿が engine に1つも無く（`grep 'クラッシュされない' src/` が0件）、原文が
 *   **正反対の `LIFE_CRASH{owner:'self'}`＝自分のライフを割る行動**に化けていた。
 *   3地点のどれか1つでも通し忘れると「シグニには効くがルリグには効かない」型の無言の不整合になる。
 *
 * ■ 「ダメージ」と「効果」の別（🔴ここを逆に読むと守りが攻撃に化ける）
 *   `EXCEPT_DAMAGE`＝「**ダメージ以外**によってはクラッシュされない」＝**(3) だけ**を防ぎ、
 *   (1)(2) のアタックによるダメージは**通す**。「ダメージだけ防ぐ」ではない。
 *
 * ■ 宣言の在庫は2つ（**両方見ないと片方だけ効く**）
 *   - アーツ（「このターン、〜」）＝`PlayerState.life_crash_preventions_this_turn`（`execStub` が積む）
 *   - 【常】＝**盤面から毎回読む**（`collectLifeCrashPreventions`）。CONTINUOUS は `executeAction` を
 *     通らないので state に積めない（`FORCE_SIGNI_ATTACK`／`lifeCrashReplace` と同じ罠）。
 *
 * ■ fail-closed の向き
 *   ペイロード（`lifeCrashPrevention`）が無い宣言は**無視する**。parser が payload を落としたときに
 *   「効かない」で済ませ、「あらゆるダメージを無効化する」側へ倒さない。
 */

const baseCardNum = (id: string): string => id.split('#')[0];

/** クラッシュの原因。`damage`＝ルリグ／シグニのアタックによるダメージ、`effect`＝効果によるクラッシュ。 */
export type LifeCrashCause = 'damage' | 'effect';

/**
 * `want` 枚のクラッシュのうち**実際に何枚通るか**を返す（0〜want）。
 *
 * ⚠**全か無かにしない**＝`WX20-032` の原文注記「（複数枚のライフクロスがクラッシュされる場合は
 *   １枚だけクラッシュされる）」のとおり、上限型は**枚数を切り詰める**。
 *
 * @param victim    ライフをクラッシュされる側
 * @param opponent  その相手（`whileFewerLifeThanOpponent` の比較に使う）
 * @param preventions `collectLifeCrashPreventions` が返した、**この victim に効く**宣言（【常】＋ウィンドウ）
 */
export function allowedLifeCrashCount(
  victim: PlayerState,
  opponent: PlayerState,
  preventions: LifeCrashPreventionSpec[],
  cause: LifeCrashCause,
  want: number,
): number {
  if (want <= 0) return 0;
  let allowed = want;
  for (const spec of preventions) {
    // 「あなたのライフクロスが対戦相手より少ないかぎり」＝**クラッシュのたびに再評価**する
    // （宣言時に焼き込むと、ライフが減って条件を満たした後に効かない／満たさなくなった後も効き続ける）。
    if (spec.whileFewerLifeThanOpponent && !(victim.life_cloth.length < opponent.life_cloth.length)) continue;
    if (spec.maxPerTurn !== undefined) {
      // 回数制限型＝このターン既にクラッシュされた枚数との差だけ通す。
      const already = victim.life_crashed_this_turn ?? 0;
      allowed = Math.min(allowed, Math.max(0, spec.maxPerTurn - already));
      continue;
    }
    // 全面防止／ダメージ以外の防止。
    if (spec.scope === 'ALL' || cause === 'effect') return 0;
  }
  return allowed;
}

/**
 * この `victim` のライフクロスを守っている宣言を、**両プレイヤーの盤面**とウィンドウから集める。
 *
 * ⚠🔴**両方の盤面を見る**＝`WXK11-016-E1`「**各プレイヤーの**ライフクロスは１ターンに２枚までしか
 *   クラッシュされない」は**相手の場のキー**に載っていても自分のライフを守る。片側だけ走査すると
 *   「自分が置いたときだけ効く」になる。
 * ⚠付与された【常】（`lrig_granted_auto_effects` 等）は `effectsMap` に載らない＝
 *   `lrigDamageShield.ts` と同じく印刷側と付与ストア側を**対で**見る。
 *
 * @param isVictimTurn victim がターンプレイヤーか（`activeCondition` の TURN_OWNER 判定に使う）
 */
export function collectLifeCrashPreventions(
  victim: PlayerState,
  opponent: PlayerState,
  isVictimTurn: boolean,
  cardMap: Map<string, CardData>,
  effectsMap: Map<string, CardEffect[]>,
): LifeCrashPreventionSpec[] {
  const out: LifeCrashPreventionSpec[] = [...(victim.life_crash_preventions_this_turn ?? [])];
  // 自分の場の宣言（protects:'self' も 'each_player' も自分に効く）
  for (const [num, eff] of preventionCandidates(victim, effectsMap)) {
    const spec = continuousPreventionSpec(eff);
    if (!spec) continue;
    if (!checkActiveCondition(eff.activeCondition, victim, opponent, isVictimTurn, cardMap, num)) continue;
    out.push(spec);
  }
  // 相手の場の宣言は `protects:'each_player'` のときだけ自分に効く。
  for (const [num, eff] of preventionCandidates(opponent, effectsMap)) {
    const spec = continuousPreventionSpec(eff);
    if (!spec || spec.protects !== 'each_player') continue;
    if (!checkActiveCondition(eff.activeCondition, opponent, victim, !isVictimTurn, cardMap, num)) continue;
    out.push(spec);
  }
  return out;
}

/** 【常】の `STUB{LIFE_CRASH_PREVENTION}` からペイロードを取り出す（無ければ無視＝fail-closed）。 */
function continuousPreventionSpec(eff: CardEffect): LifeCrashPreventionSpec | undefined {
  if (eff.effectType !== 'CONTINUOUS') return undefined;
  if (eff.action.type !== 'STUB') return undefined;
  const action = eff.action as StubAction;
  if (action.id !== 'LIFE_CRASH_PREVENTION') return undefined;
  return action.lifeCrashPrevention;
}

/** 【常】の宣言になりうる `(host, 能力)` の組（印刷能力＋付与ストア）。`lrigDamageShield.ts` と同じ規約。 */
function preventionCandidates(
  state: PlayerState,
  effectsMap: Map<string, CardEffect[]>,
): Array<[string, CardEffect]> {
  const out: Array<[string, CardEffect]> = [];
  for (const num of preventionSources(state)) {
    for (const eff of (effectsMap.get(num) ?? effectsMap.get(baseCardNum(num)) ?? [])) out.push([num, eff]);
  }
  const lrigTop = state.field.lrig.at(-1) ?? '';
  if (!state.lrig_abilities_disabled) {
    for (const eff of state.lrig_granted_auto_effects ?? []) out.push([lrigTop, eff]);
    for (const eff of state.lrig_granted_auto_effects_until_opp_turn ?? []) out.push([lrigTop, eff]);
  }
  for (const eff of state.game_granted_effects ?? []) out.push([lrigTop, eff]);
  return out;
}

/** 宣言元になりうる場のカード（シグニ／センタールリグ／アシスト／キー）。 */
function preventionSources(state: PlayerState): string[] {
  return [
    ...state.field.signi.map(st => st?.at(-1) ?? '').filter(Boolean),
    state.field.lrig.at(-1) ?? '',
    state.field.assist_lrig_l?.at(-1) ?? '',
    state.field.assist_lrig_r?.at(-1) ?? '',
    state.field.key_piece ?? '',
  ].filter(Boolean);
}
