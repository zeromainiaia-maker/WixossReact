import { isKizunaActive } from '../../../engine/effectEngine';
import { evalUseCondition, getCardNum, matchesFilter } from '../../../engine/effectExecutor';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { collectOppLifeBurstActivatedTriggers, collectPlayerDamagedTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers, crashCauseMatches } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import { grantedAllZoneBurstAction, resolveAllZoneBurstGrant, shouldAddGrantedAllZoneBurst } from '../allZoneBurst';
import { generateUUID } from '../battleUtils';
import { type PlayerStateKey, reduceBattle } from '../controller/battleController';
import { queueCardEffects as queueCardEffectsImpl } from '../controller/queueCardEffects';
import { battleOppLifeCrashSourceMatches } from '../lifeCrashTriggers';
import { consumeDamagedJust, consumeLifeBurstDouble } from '../turnScopedState';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
 const getAllZoneBurstGrant = (ctx: PerformCtx) => (
  state: PlayerState,
  includeTemporary = false,
  // 🆕**§5.3 `O-239`**＝順序つき付与（N枚目まで）を見るために、判定中のライフクロスを渡す。
  cardNum?: string,
): import('../../../types/effects').StubAction | null => {
  return resolveAllZoneBurstGrant(state, ctx.effectsMap, includeTemporary, cardNum);
};

 const grantedBurstEntry = (ctx: PerformCtx) => (cardNum: string, ownerId: string, grant: import('../../../types/effects').StubAction | null): StackEntry => ({
  id: generateUUID(),
  playerId: ownerId,
  cardNum,
  effectId: 'GRANTED_ALLZONE_BURST',
  label: `${ctx.cardMap.get(cardNum)?.CardName ?? cardNum} の【ライフバースト】（付与）`,
  effect: {
    effectId: 'GRANTED_ALLZONE_BURST', effectType: 'LIFE_BURST', timing: ['ON_LIFE_BURST'],
    action: grantedAllZoneBurstAction(grant),
    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
  },
});

// ライフバースト確認後の処理（人間・CPU共通）
// targetCardNum: 同時クラッシュ時に処理するカードを指定（省略時はfield.check）
export const performLifeBurstResponse = async (activate: boolean, targetCardNum: string | undefined, p: {
  owner: PlayerState; opponent: PlayerState;
  ownerId: string;
  ownerKey: 'host_state' | 'guest_state';
}, ctx: PerformCtx) => {
  const { owner: my, opponent: op, ownerId } = p;
  if (!my.field.check) return;
  ctx.io.setLoading(true);
  try {
    const cardNum = targetCardNum ?? my.field.check;
    let remainingPending: string[];
    let crashSourceCardNum = my.crash_source_card_num;
    // §5.3 O-120: 原因キーワードは**発生源と同じ添字規約**で持つ（別実装にすると片方だけ直る）。
    let crashCause = my.crash_cause;
    let remainingCrashSources: Array<string | null>;
    let remainingCrashCauses: Array<string | null>;
    if (!targetCardNum || targetCardNum === my.field.check) {
      // check のカードを処理: pending はそのまま残す
      remainingPending = my.pending_crashed_cards ?? [];
      remainingCrashSources = my.pending_crash_source_card_nums ?? [];
      remainingCrashCauses = my.pending_crash_causes ?? [];
    } else {
      // pending のカードを先に処理: indexOf で最初の一致のみ除き、check を pending 先頭に回す
      const pendingList = my.pending_crashed_cards ?? [];
      const targetIdx = pendingList.indexOf(targetCardNum);
      const pendingSources = my.pending_crash_source_card_nums ?? [];
      const pendingCauses = my.pending_crash_causes ?? [];
      crashSourceCardNum = targetIdx >= 0 ? pendingSources[targetIdx] ?? undefined : undefined;
      crashCause = targetIdx >= 0 ? pendingCauses[targetIdx] ?? undefined : undefined;
      const afterRemoval = targetIdx >= 0
        ? [...pendingList.slice(0, targetIdx), ...pendingList.slice(targetIdx + 1)]
        : pendingList;
      remainingPending = [my.field.check!, ...afterRemoval];
      remainingCrashSources = [my.crash_source_card_num ?? null,
        ...pendingSources.filter((_, i) => i !== targetIdx)];
      remainingCrashCauses = [my.crash_cause ?? null,
        ...pendingCauses.filter((_, i) => i !== targetIdx)];
    }
    // CRASH_TO_TRASH_INSTEAD: 相手（攻撃側）がフラグを持つ場合エナではなくトラッシュへ
    // 🆕自分のクラッシュ置換（2026-08-31 続き749・`WD06-009-E2` / `WX20-043-E1`）＝
    //   「チェックゾーンに置かれたカードがエナゾーンに置かれる場合、代わりにトラッシュへ置き
    //   デッキの一番上をライフクロスに加える」。**回数制**なので1クラッシュにつき1消費する。
    const selfCrashRefill = (my.self_crash_to_trash_and_refill ?? 0) > 0;
    const crashToTrash = op.crash_to_trash_instead === true || selfCrashRefill;
    // ON_LIFE_CRASHED: 自フィールドシグニの「ライフクロスがクラッシュされたとき」トリガーを収集
    // （アタック・効果問わず全クラッシュ経路がチェックゾーン経由でここに集約される）
    const { entries: crashTriggers, usedOncePerTurnIds: crashTriggerUsedIds } =
      pureCollectSelfEventTriggers(ctx.trigCtx(), 'ON_LIFE_CRASHED', my, op, 'ライフクラッシュ時', ownerId);
    // ON_OPP_LIFE_CRASHED: クラッシュした側（op＝ターンプレイヤー）のフィールドの
    // 「対戦相手のライフクロスがクラッシュされたとき」トリガーを収集する。
    // ダブルクラッシュ判定（同時N枚以上）は OPP_LIFE_CRASH_EVENT_GTE 条件で評価。
    const crasherId = p.ownerKey === 'host_state' ? ctx.bs.guest_id : ctx.bs.host_id;
    const opKey = p.ownerKey === 'host_state' ? 'guest_state' : 'host_state';
    const oppCrashEventSize = 1 + (my.pending_crashed_cards?.length ?? 0);
    const oppCrashTriggers: StackEntry[] = [];
    const oppUsedIds: string[] = [];
    const oppGameUsedIds: string[] = [];
    // usageLimit を op.actions_done の出現回数で制御（once=1 / twice=2）。
    const oppLimitOk = (eff: import('../../../types/effects').CardEffect): boolean => {
      if (eff.usageLimit === 'once_per_game') {
        if ((op.game_actions_done ?? []).includes(eff.effectId) || oppGameUsedIds.includes(eff.effectId)) return false;
        oppGameUsedIds.push(eff.effectId);
        return true;
      }
      if (eff.usageLimit !== 'once_per_turn' && eff.usageLimit !== 'twice_per_turn') return true;
      const max = eff.usageLimit === 'once_per_turn' ? 1 : 2;
      const used = (op.actions_done ?? []).filter(id => id === eff.effectId).length
        + oppUsedIds.filter(id => id === eff.effectId).length;
      if (used >= max) return false;
      oppUsedIds.push(eff.effectId);
      return true;
    };
    // シグニ＋ルリグ／アシストルリグ／キー（付与能力含む。WXDi-P16-039 のアシストルリグ自己付与等）を走査
    const oppCrashSources = [
      ...op.field.signi.map(s => s?.at(-1)),
      op.field.lrig.at(-1),
      op.field.assist_lrig_l?.at(-1),
      op.field.assist_lrig_r?.at(-1),
      op.field.key_piece,
      ...(op.field.key_piece_extra ?? []),
    ].filter((n): n is string => !!n);
    for (const topNum of oppCrashSources) {
      for (const eff of ctx.effectsMap.get(topNum) ?? []) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_LIFE_CRASHED')) continue;
        if (!battleOppLifeCrashSourceMatches(eff, topNum, crashSourceCardNum, ctx.cardMap, op)) continue;
        // §5.3 O-120: 「【ランサー】によってクラッシュしたとき」＝原因キーワード限定（fail-closed）。
        if (!crashCauseMatches(eff, crashCause)) continue;
        if (eff.kizunaIcon && !isKizunaActive(op, topNum, ctx.cardMap)) continue; // 【絆自】は絆獲得時のみ
        if (eff.condition?.type === 'OPP_LIFE_CRASH_EVENT_GTE' && oppCrashEventSize < eff.condition.value) continue;
        // 🆕§5.3 `O-400`（2026-09-16）＝**`condition` を `oppLimitOk` の手前で評価する**。
        //   🔴旧実装は `OPP_LIFE_CRASH_EVENT_GTE` しか見ておらず、それ以外の条件を持つ効果を
        //     **条件不成立のまま積んで**いた＝`WX25-P2-009-E1`（《ゲーム1回》）は
        //     クラッシュのたびに発火し、**0枚になる前の空振りで使い切る**。
        //   ⚠**順番が本体**＝`oppLimitOk` は呼ぶだけで《ターン1回》／《ゲーム1回》を**消費する**ので、
        //     条件判定を後ろに置くと不成立の回にも回数が減る。
        //   ⚠主語は効果の持ち主（`op`＝クラッシュした側）＝「対戦相手のライフクロス」は `my`。
        if (eff.condition
          && !evalUseCondition(eff.condition, op, my, ctx.cardMap, topNum, ctx.bs.turn_phase, ctx.effectivePowers)) continue;
        if (!oppLimitOk(eff)) continue;
        const cardName = ctx.cardMap.get(topNum)?.CardName ?? topNum;
        oppCrashTriggers.push({
          id: generateUUID(),
          playerId: crasherId,
          cardNum: topNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（相手ライフクラッシュ時）`,
          effect: eff,
        });
      }
    }
    for (const eff of op.game_granted_auto_effects ?? []) {
      if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_OPP_LIFE_CRASHED')) continue;
      if (!crashCauseMatches(eff, crashCause)) continue;   // §5.3 O-120（付与された能力にも同じ条件が乗りうる）
      if (eff.condition?.type === 'OPP_LIFE_CRASH_EVENT_GTE' && oppCrashEventSize < eff.condition.value) continue;
      // 🆕§5.3 `O-400`：付与能力側も同じ＝**`oppLimitOk` の手前で** `condition` を評価する。
      //   こちらが `WX25-P2-009-E1`（`INSTALL_GAME_GRANTED_AUTO` で積んだ《ゲーム1回》）の本体の経路。
      //   ⚠付与能力には盤面の場所が無いので、`sourceCardNum` には `effectId` を渡す（LIFE_COUNT は参照しない）。
      if (eff.condition
        && !evalUseCondition(eff.condition, op, my, ctx.cardMap, eff.effectId, ctx.bs.turn_phase, ctx.effectivePowers)) continue;
      if (!oppLimitOk(eff)) continue;
      oppCrashTriggers.push({
        id: generateUUID(),
        playerId: crasherId,
        cardNum: eff.effectId,
        effectId: eff.effectId,
        label: 'ゲーム中に得た【自】効果（相手ライフクラッシュ時）',
        effect: eff,
      });
    }
    // INSTALL_DELAYED_TRIGGER（B3）: op（クラッシュした側＝ターンプレイヤー）に設置された
    // 「このターン、…がクラッシュしたとき、…」遅延トリガーを収集する。crasherFilter があれば
    // 実際のクラッシュ源で判定する。旧状態など発生源不明時だけ従来の場走査へfallbackする。
    for (const dt of op.delayed_triggers ?? []) {
      if (dt.trigger?.timing !== 'ON_OPP_LIFE_CRASHED') continue;
      if (dt.trigger.crasherFilter) {
        const ok = crashSourceCardNum
          ? matchesFilter(ctx.cardMap.get(crashSourceCardNum), dt.trigger.crasherFilter)
          : op.field.signi.some(stack => {
              const num = stack?.at(-1);
              const card = num ? ctx.cardMap.get(num) : undefined;
              return card ? matchesFilter(card, dt.trigger.crasherFilter!) : false;
            });
        if (!ok) continue;
      }
      oppCrashTriggers.push({
        id: generateUUID(),
        playerId: crasherId,
        cardNum,
        effectId: 'DELAYED_TRIGGER',
        label: 'このターンの遅延トリガー（相手ライフクラッシュ時）',
        effect: {
          effectId: 'DELAYED_TRIGGER', effectType: 'AUTO', timing: ['ON_OPP_LIFE_CRASHED'],
          action: dt.effect, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
        },
      });
    }
    // 🆕§5.3 `O-160`（2026-09-02）＝「対戦相手がダメージを受けたとき」＝**アタックのダメージだけ**。
    //   🔴上の `ON_OPP_LIFE_CRASHED` は**効果によるクラッシュでも発火する**ので流用できない。
    //   発生印（`my.damaged_just`）はアタックの2経路（`crashOneLife`／ルリグアタック）だけが立てる。
    //   反応するのは**与えた側**＝`op`（クラッシュされた `my` の対戦相手）。⚠読んだら必ず消す（下の `baseState`）。
    const damagedJust = my.damaged_just === true;
    let opDamagedUsedIds: string[] = [];
    if (damagedJust) {
      const dmg = collectPlayerDamagedTriggers(ctx.trigCtx(), crasherId, op);
      oppCrashTriggers.push(...dmg.entries);
      opDamagedUsedIds = dmg.usedLimitIds;
    }
    // `activate === true` のときだけ「ライフバーストが発動した」。クラッシュだけ／発動辞退では積まない。
    const oppBurstActivated = activate
      ? collectOppLifeBurstActivatedTriggers(ctx.trigCtx(), op, crasherId)
      : { entries: [] as StackEntry[], usedLimitIds: [] as string[] };
    oppCrashTriggers.push(...oppBurstActivated.entries);
    // 🆕§5.3 `O-367`（2026-09-14）＝「そのアタックの間」だけのクラッシュ先置換は、
    //   **このアタックで割れたカードを最後の1枚まで処理し終えた時点**で落とす
    //   （`clearEndOfAttackEffects` はこの関数より前に走るので、あちらでは落とせない）。
    //   ⚠**ダブルクラッシュで2枚割れた回**は1枚目でここに来るので、`remainingPending` を必ず見る。
    const clearAttackCrashEOA = op.crash_to_trash_ends_this_attack === true && remainingPending.length === 0;
    // 🆕§5.3 `O-522`（2026-09-16）＝**「次にクラッシュされる1枚」だけの置換**（`WX25-P3-032-E2`）。
    //   ⚠**`clearAttackCrashEOA` とは落とす時点が違う**＝あちらは「そのアタックで割れた最後の1枚まで」
    //     なので `remainingPending.length === 0` を待つが、こちらは**1枚目を解決した時点で落とす**。
    const clearCrashNextOnly = op.crash_to_trash_next_crash_only === true;
    const opStateForUsed: PlayerState | null = oppUsedIds.length > 0 || oppGameUsedIds.length > 0 || opDamagedUsedIds.length > 0
      || oppBurstActivated.usedLimitIds.length > 0
      || clearAttackCrashEOA || clearCrashNextOnly
      ? {
          ...op,
          actions_done: [...(op.actions_done ?? []), ...oppUsedIds, ...opDamagedUsedIds, ...oppBurstActivated.usedLimitIds],
          game_actions_done: [...(op.game_actions_done ?? []), ...oppGameUsedIds],
          ...(clearAttackCrashEOA
            ? { crash_to_trash_instead: undefined, crash_to_trash_ends_this_attack: undefined }
            : {}),
          ...(clearCrashNextOnly
            ? { crash_to_trash_instead: undefined, crash_to_trash_next_crash_only: undefined }
            : {}),
        }
      : null;
    // SET_NEXT_LIFE_CRASH_COUNTER: 自分（my=クラッシュされた側）に設定されたカウンタークラッシュを消費し、
    // 対戦相手（op）のライフクロスを perTrigger 枚クラッシュし返すトリガーを積む（WX25-P1-004 / WXDi-P12-030）。
    const counterCrashTriggers: StackEntry[] = [];
    // 🆕§5.3 `O-483`（2026-09-16）＝**発生源の限定**を見る。
    //   原文「対戦相手の**ルリグ**によって」∕「**シグニ**によって」。
    //   ⚠発生源が不明（`crash_source_card_num` 無し）なら**限定付きのカウンターは発火しない**
    //     （fail-closed）。限定の無いカウンター（`WXDi-P12-030-E1`）は従来どおり常に発火する。
    const crasherType: 'lrig' | 'signi' | undefined = crashSourceCardNum
      ? (ctx.cardMap.get(getCardNum(crashSourceCardNum))?.Type === 'ルリグ' ? 'lrig' : 'signi')
      : undefined;
    const counterHits = (my.life_crash_counters ?? [])
      .map((c, i) => ({ c, i }))
      .filter(({ c }) => c.remaining > 0 && (!c.sourceType || c.sourceType === crasherType));
    const myCounterAfterList = (my.life_crash_counters ?? [])
      .map((c, i) => (counterHits.some(h => h.i === i) ? { ...c, remaining: c.remaining - 1 } : c))
      .filter(c => c.remaining > 0);
    const myCounterAfter = myCounterAfterList.length > 0 ? myCounterAfterList : undefined;
    for (const { c } of counterHits) {
      const per = c.perTrigger;
      counterCrashTriggers.push({
        id: generateUUID(),
        playerId: ownerId,
        cardNum,
        effectId: 'LIFE_CRASH_COUNTER',
        label: `カウンタークラッシュ（対戦相手のライフクロスを${per}枚クラッシュ）`,
        effect: {
          effectId: 'LIFE_CRASH_COUNTER', effectType: 'AUTO', timing: ['ON_LIFE_CRASHED'],
          action: { type: 'LIFE_CRASH', owner: 'opponent', count: per, triggerBurst: true },
          duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
        },
      });
    }
    // チェックゾーンをクリアしてエナ（またはトラッシュ）へ移動した状態を基点にする
    // 🆕置換が乗った回は**デッキの一番上をライフクロスへ**足し、残り回数を1つ消費する。
    const refillTop = selfCrashRefill ? my.deck[0] : undefined;
    // 🆕§5.3 `O-160`＝ダメージの発生印は**funnel 1本で消す**（T2 が手書きクリアを検出する）。
    const baseState: PlayerState = consumeDamagedJust({
      ...my,
      deck: refillTop ? my.deck.slice(1) : my.deck,
      life_cloth: refillTop ? [...my.life_cloth, refillTop] : my.life_cloth,
      self_crash_to_trash_and_refill: selfCrashRefill
        ? Math.max(0, (my.self_crash_to_trash_and_refill ?? 0) - 1) || undefined
        : my.self_crash_to_trash_and_refill,
      energy: crashToTrash ? my.energy : [...my.energy, cardNum],
      trash: crashToTrash ? [...my.trash, cardNum] : my.trash,
      field: { ...my.field, check: null },
      pending_crashed_cards: remainingPending,
      pending_crash_source_card_nums: remainingCrashSources,
      crash_source_card_num: undefined,
      // §5.3 O-120: 原因列は発生源列と**必ず同時に**更新する（片方だけだと添字がずれる）。
      pending_crash_causes: remainingCrashCauses,
      crash_cause: undefined,
      life_crash_counters: myCounterAfter,
      actions_done: crashTriggerUsedIds.length > 0
        ? [...(my.actions_done ?? []), ...crashTriggerUsedIds]
        : my.actions_done,
      // 🆕§5.3 `O-522`（2026-09-16）＝**「次にクラッシュされる1枚」だけの抑止を、ここで消費する。**
      //   🔴旧は `true` しか無く**ターン終了まで消えなかった**＝同じターンに2枚割れると2枚目以降も不発。
      //   ⚠**述語（`lifeBurstSuppressedByTurnFlag`）では落とせない**＝あれは純関数なので、
      //     消費はチェックゾーン解決の**この1点**に置く（読み手を増やさない）。
      //   ⚠**バーストの有無で分岐しない**＝原文は「次にクラッシュされる**カード**」を指名しており、
      //     そのカードがバーストを持たなくても指名は使われる。
      suppress_life_burst: my.suppress_life_burst === 'once' ? undefined : my.suppress_life_burst,
    });
    if (crashToTrash) ctx.io.appendLogs([`${ctx.cardMap.get(cardNum)?.CardName ?? cardNum}はトラッシュに置かれた（${selfCrashRefill ? 'SELF_CRASH_TO_TRASH_AND_REFILL' : 'CRASH_TO_TRASH_INSTEAD'}）`]);
    if (refillTop) ctx.io.appendLogs([`デッキの一番上のカードをライフクロスに加えた`]);
    if (!activate) {
      const stateKey = p.ownerKey;
      const combinedTriggers = [...crashTriggers, ...oppCrashTriggers, ...counterCrashTriggers];
      const existingStackCrash = ctx.bs.effect_stack ?? null;
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: baseState, clearPending: true,
        opp: opStateForUsed ? { key: opKey, state: opStateForUsed } : undefined,
        effectStack: combinedTriggers.length > 0
          ? (existingStackCrash ? pushToStack(existingStackCrash, combinedTriggers) : initStack(ctx.bs.active_user_id ?? ownerId, combinedTriggers))
          : undefined,
      }));
      return;
    }
    // LIFE_BURST効果を発火。「次に」はここで1回消費し、全ターン版は次のLBにも残す。
    const burstDouble = consumeLifeBurstDouble(baseState);
    const doubleBurst = burstDouble.repeatCount === 2;
    const baseStateForBurst = burstDouble.state;
    // lrig_trash: ARTS_SELF_RECYCLE_ON_TRIGGER with ON_LIFE_BURST timing
    const lrigTrashBurstEntries: StackEntry[] = [];
    for (const artsNum of (baseState.lrig_trash ?? [])) {
      for (const eff of (ctx.effectsMap.get(artsNum) ?? [])) {
        if (eff.effectType !== 'AUTO' || !eff.timing?.includes('ON_LIFE_BURST')) continue;
        const act = eff.action as import('../../../types/effects').StubAction;
        if (act.type !== 'STUB' || act.id !== 'ARTS_SELF_RECYCLE_ON_TRIGGER') continue;
        const cardName = ctx.cardMap.get(artsNum)?.CardName ?? artsNum;
        lrigTrashBurstEntries.push({
          id: generateUUID(),
          playerId: ownerId,
          cardNum: artsNum,
          effectId: eff.effectId,
          label: `${cardName} の【自】効果（ライフバースト時）`,
          effect: eff,
        });
      }
    }
    // WD14-001 / WX17-036: ネイティブ【ライフバースト】を持たないカードに付与された合成バーストを追加
    // （burstFilter があればクラッシュカードが一致した場合のみ）
    const temporaryGrantActive = ctx.bs.active_user_id !== ownerId;
    const allZoneBurstGrant = getAllZoneBurstGrant(ctx)(my, temporaryGrantActive, cardNum);
    // 既定はネイティブ【ライフバースト】が無いカードのみに付与。burstAdditive=true（WX02-002）は
    // ネイティブを持つカードにも追加し、両方を好きな順で使用できる。
    const grantedBurstApplies = shouldAddGrantedAllZoneBurst(
      cardNum, my, ctx.cardMap, ctx.effectsMap, temporaryGrantActive,
    );
    const grantedBurstExtras = grantedBurstApplies
      ? [grantedBurstEntry(ctx)(cardNum, ownerId, allZoneBurstGrant)] : [];
    const allBurstExtras = [...crashTriggers, ...oppCrashTriggers, ...counterCrashTriggers, ...lrigTrashBurstEntries, ...grantedBurstExtras];
    const burstExtraState: { key: PlayerStateKey; state: PlayerState } | undefined =
      opStateForUsed ? { key: opKey, state: opStateForUsed } : undefined;
    const fired = await queueCardEffectsImpl(cardNum, ['LIFE_BURST'], ['ON_LIFE_BURST'], baseStateForBurst, op, burstExtraState, doubleBurst ? 2 : 1, allBurstExtras, { id: ownerId, key: p.ownerKey }, ctx);
    if (!fired) {
      const stateKey = p.ownerKey;
      // ⚠**攻撃側の state も書く**＝`opStateForUsed`（usageLimit の消化＋§5.3 `O-367` のフラグ解除）は
      //   `queueCardEffects` が発火しなかった回に**書かれず捨てられていた**（2026-09-14 に気付いた）。
      await ctx.io.commit(reduceBattle(ctx.bs, {
        type: 'WRITE_STATE', myKey: stateKey, myState: baseState, clearPending: true,
        opp: burstExtraState,
      }));
    }
  } finally {
    ctx.io.setLoading(false);
  }
};
