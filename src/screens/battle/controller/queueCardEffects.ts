import { filterKizunaGated, isCrossZoneActive } from '../../../engine/effectEngine';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { type EffectStack } from '../../../types';
import { generateUUID } from '../battleUtils';
import { type PlayerStateKey, reduceBattle } from './battleController';
import type { PlayerState, StackEntry } from '../../../types';
import type { PerformCtx } from './performCtx';

/**
 * 🆕**カードの効果をスタックへ積む共通ヘルパ**（§5.7 `S-5c` 第2段・2026-09-18）＝`BattleScreen` から逐語で移設。
 * `performArts` / `performKeyPiece` / `performLifeBurstResponse` ほかが使う。
 * ⚠**`owner` は省略不可にした**（移設前は省略時＝自分）＝呼び出し側が必ず明示する（CPU の効果を自分の効果と取り違えない）。
 */
 const effectTypeLabel = (t: string) => {
  if (t === 'AUTO') return '【自】';
  if (t === 'ACTIVATED') return '【起】';
  if (t === 'LIFE_BURST') return '【ライフバースト】';
  return `【${t}】`;
};

export const queueCardEffects = async (
  cardNum: string,
  effectTypes: ('AUTO' | 'ACTIVATED' | 'LIFE_BURST')[],
  timings: string[],
  startMyState: PlayerState,
  _startOpState: PlayerState,
  extraState: { key: PlayerStateKey; state: PlayerState } | undefined = undefined,
  repeatCount = 1,
  extraEntries: StackEntry[] = [],
  /** 効果の持ち主（省略時は `ctx.userId`＝この client。CPU の効果は明示指定）。 */
  owner: { id: string; key: 'host_state' | 'guest_state' } | undefined,
  ctx: PerformCtx,
): Promise<boolean> => {
  const ownerId = owner?.id ?? ctx.userId;
  const effects = ctx.effectsMap.get(cardNum) ?? [];
  let targets = effects.filter(e =>
    (effectTypes as string[]).includes(e.effectType) &&
    (timings.length === 0 || e.timing?.some(t => timings.includes(t)))
  );
  // crossOnly（【クロス出】【クロス起】等）: 発生源シグニのゾーンがクロス状態でなければ発動しない。
  // トリガー時（収集時）の状態 startMyState で判定する（解決時ではなく発動時のクロス状態が正）。
  if (targets.some(e => e.crossOnly)) {
    const crossOk = isCrossZoneActive(startMyState, cardNum, ctx.cardMap);
    targets = targets.filter(e => !e.crossOnly || crossOk);
  }
  // kizunaIcon（【絆出】【絆自】）: 発生源カード名との絆を獲得していなければ発動しない。
  // crossOnly と同じくトリガー時（収集時）の状態 startMyState で判定する。
  targets = filterKizunaGated(targets, startMyState, cardNum, ctx.cardMap);
  // placedDown（G144「このシグニがダウン状態で場に出たとき」self経路）: 自身がダウン状態で出ていなければ発動しない。
  // 手札からの通常召喚はダウンにならないため自然に除外される（ダウン配置は効果経由のみ）。
  if (timings.includes('ON_PLAY') && targets.some(e => e.triggerCondition?.placedDown)) {
    const zi = startMyState.field.signi.findIndex(s => s?.at(-1) === cardNum);
    const isDown = zi >= 0 && (startMyState.field.signi_down?.[zi] ?? false);
    targets = targets.filter(e => !e.triggerCondition?.placedDown || isDown);
  }
  if (targets.length === 0 && extraEntries.length === 0) return false;

  const cardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
  const turnPlayerId = ctx.bs?.active_user_id ?? ownerId;

  const makeEntries = (): StackEntry[] => targets.map(eff => ({
    id: generateUUID(),
    playerId: ownerId,
    cardNum,
    effectId: eff.effectId,
    label: `${cardName} の${effectTypeLabel(eff.effectType)}効果`,
    effect: eff,
  }));
  const allEntries: StackEntry[] = [];
  for (let r = 0; r < repeatCount; r++) allEntries.push(...makeEntries());
  allEntries.push(...extraEntries);
  const entries = allEntries;

  const existing = ctx.bs?.effect_stack ?? null;
  const stack: EffectStack = existing
    ? pushToStack(existing, entries)
    : initStack(turnPlayerId, entries);

  const myKey = owner?.key ?? (ctx.isHost ? 'host_state' : 'guest_state');
  const { error } = await ctx.io.commit(reduceBattle(ctx.bs, {
    type: 'WRITE_STATE', myKey, myState: startMyState, effectStack: stack, clearPending: true,
    opp: extraState,
  }));
  if (error) console.error('[queueCardEffects] DB error:', error);
  return true;
};
