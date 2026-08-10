import type { PlayerState } from '../types';
import type { CardEffect, TriggerScope, TimingType } from '../types/effects';

/**
 * 付与ストア（＝実行時に「あなたのセンタールリグは『【自】…』を得る」で積まれた能力）の共通走査。
 *
 * ⚠**付与された能力は effectsMap に載らない**。印刷能力は `ctx.effectsMap.get(cardNum)` で
 * 引けるが、`GRANT_LRIG_ABILITY` / `GRANT_PLAYER_ABILITY` の実行結果は PlayerState の専用配列
 * （下記3ストア）にしか入らないため、**各コレクタが個別にここを走査しないと恒久 no-op になる**。
 *
 * かつては timing ごとにハードコードした走査が5箇所に散在し（ON_ATTACK_LRIG／ON_ENERGY_TO_TRASH／
 * ON_HAND_ADDED／フェイズ境界2種）、それ以外の timing の付与 AUTO は**構造が正しくても全部死んでいた**
 * （続き404 実測＝ON_ATTACK_SIGNI・ON_PLAY・ON_LEAVE_FIELD・ON_SPELL_USE・ON_LIFE_CRASHED・
 * ON_OPP_LIFE_CRASHED・ON_SIGNI_BANISH_OPPONENT・ON_ENERGY_CHARGE の8 timing）。
 * **新しい timing を配線するときは、印刷能力の走査と対にしてこの関数も呼ぶこと。**
 *
 * 3ストアの違い：
 * - `lrig_granted_auto_effects` — 通常付与（「ターン終了時まで」等）。ターン終了で `permanentGrant`
 *   以外が落ちる（`clearTurnGrantedLrigAbilities`）。
 * - `lrig_granted_auto_effects_until_opp_turn` — 「次の対戦相手のターン終了時まで」付与。
 * - `game_granted_effects` — `GRANT_PLAYER_ABILITY`（プレイヤー自身がゲーム中得た能力）。
 *   場のカードを host に持たないため cardNum は空になりうる。
 */
export interface GrantedStoreWatcher {
  /** 能力の host（センタールリグの CardNum。プレイヤー付与でルリグ不在なら空文字）。 */
  cardNum: string;
  effect: CardEffect;
}

/**
 * 指定 timing・指定 scope 集合にマッチする付与 AUTO を3ストア横断で列挙する。
 *
 * @param scopes 受け入れる `triggerScope`（省略時は `'self'` 扱い）。呼び出し元の走査軸に合わせる
 *   ＝自分側 watcher なら `['self']` や `['any_ally','any']`、相手側 watcher なら `['any_opp','any']`。
 *   **`'self'` を含めるかは timing の意味で決める**：「あなたがスペルを使用したとき」のように
 *   プレイヤー自身が主語なら self を含め、「あなたのシグニが場に出たとき」のようにカードが主語なら
 *   含めない（host はセンタールリグなので self は永久に成立せず、含めると誤発火の温床になる）。
 */
export function grantedStoreWatchers(
  state: PlayerState,
  timing: TimingType,
  scopes: readonly TriggerScope[],
): GrantedStoreWatcher[] {
  const lrigTop = state.field.lrig.at(-1) ?? '';
  const out: GrantedStoreWatcher[] = [];
  const accept = (effect: CardEffect): boolean =>
    effect.effectType === 'AUTO'
    && !!effect.timing?.includes(timing)
    && scopes.includes(effect.triggerScope ?? 'self');

  // ルリグ付与の2ストアは「ルリグの能力」なので、能力消失（lrig_abilities_disabled）で丸ごと落ちる。
  if (!state.lrig_abilities_disabled) {
    for (const effect of state.lrig_granted_auto_effects ?? []) {
      if (accept(effect)) out.push({ cardNum: lrigTop, effect });
    }
    for (const effect of state.lrig_granted_auto_effects_until_opp_turn ?? []) {
      if (accept(effect)) out.push({ cardNum: lrigTop, effect });
    }
  }
  // プレイヤー付与はルリグの能力ではないので lrig_abilities_disabled の影響を受けない。
  for (const effect of state.game_granted_effects ?? []) {
    if (accept(effect)) out.push({ cardNum: lrigTop, effect });
  }
  return out;
}
