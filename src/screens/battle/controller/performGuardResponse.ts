import { collectOppExtraGuardFromHand, collectOppGuardExtraColorlessCost } from '../../../engine/effectEngine';
import { initStack, pushToStack } from '../../../engine/effectStack';
import { LRIG_BARRIER_CARD, countBarrierTokens, removeOneBarrierToken } from '../../../engine/execUtils';
import { allowedLifeCrashCount, collectLifeCrashPreventions } from '../../../engine/lifeCrashGate';
import { collectAttackEndTriggers as pureCollectAttackEndTriggers, collectLrigAttackGuardedTriggers as pureCollectLrigAttackGuardedTriggers, collectSelfEventTriggers as pureCollectSelfEventTriggers } from '../../../engine/triggerCollect';
import { type PlayerState, type StackEntry } from '../../../types';
import { clearEndOfAttackEffects } from '../attackDuration';
import { CPU_PLAYER_ID } from '../battleUtils';
import { reduceBattle } from '../controller/battleController';
import { consumeNextDamagePrevention } from '../damagePrevention';
import { canCardGuard } from '../guard';
import { applyMillReplacement, applyPayCostReplacement, consumeLifeCrashReplaceDecision, lifeCrashReplaceAskOptions, lifeCrashReplaceLog, pickLifeCrashReplacement } from '../lifeCrashReplace';
import { getLrigAttackCrashState } from '../lrigCrash';
import { resolveLrigDamageShield } from '../lrigDamageShield';
import type { PerformCtx } from './performCtx';

/**
 * 🆕§5.7 `S-5c` 第2段（2026-09-18）＝`BattleScreen` から**逐語で移設**し、I/O と材料（`PerformCtx`）を注入にした。
 * ⚠可否の判定はここに書かない（`*Gate.ts`）。
 */
// ガード応答: handIndex=ガードカードのインデックス、null=ガードしない
// ルリグアタックへのガード応答（人間・CPU共通）。handIndex=null は「ガードしない」（ダメージ解決）
export const performGuardResponse = async (handIndex: number | null, p: {
  responder: PlayerState; attacker: PlayerState;
  responderId: string; attackerId: string;
  responderKey: 'host_state' | 'guest_state';
}, ctx: PerformCtx) => {
  const { attacker: op, responderId, attackerId } = p;
  // ⚠`let`＝【ガードしない】枝で**ダメージ置換の決定を1件消費した基点**へ差し替えるため（§5.3 `O-414`）。
  let my = p.responder;
  if (!my.field.lrig_attacked) return;
  ctx.io.setLoading(true);
  try {
    const stateKey = p.responderKey;
    let newMyState: PlayerState;
    let guardTriggers: StackEntry[] = [];
    let attackGuardUsedIds: string[] = [];
    const attackingLrigNum = my.lrig_attacked_by_num ?? op.field.lrig.at(-1);
    if (handIndex !== null) {
      // ガードカードをトラッシュへ
      const cardNum = my.hand[handIndex];
      const guardCardName = ctx.cardMap.get(cardNum)?.CardName ?? cardNum;
      // OPP_GUARD_COST_COLORLESS: 相手フィールドにアクティブな場合、追加で無色エナを1枚消費
      // （ガードは常に相手ターン中＝防御側は非ターンプレイヤー）
      const extraEnergyCount = collectOppGuardExtraColorlessCost(op, my, ctx.cardMap, ctx.effectsMap, true);
      // UIだけに依存せず、CPU/直接呼出でも不足時はガードを成立させない。
      if (my.energy.length < extraEnergyCount) return;
      // EXTRA_GUARD_COST_FROM_HAND: 相手フィールドにアクティブな場合、手札から追加でガードカードを1枚捨てる
      const needsExtraGuardCard = collectOppExtraGuardFromHand(op, ctx.cardMap, ctx.effectsMap);
      // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→ガード時に追加でエナか手札捨て
      const needsOppHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
      let energyAfterGuard = my.energy;
      const extraTrash: string[] = [];
      if (extraEnergyCount > 0 && my.energy.length >= extraEnergyCount) {
        const removedEnergy = my.energy.slice(-extraEnergyCount);
        energyAfterGuard = my.energy.slice(0, -extraEnergyCount);
        extraTrash.push(...removedEnergy);
      }
      if (needsOppHandOrColorless) {
        // エナがあれば消費、なければ手札を1枚捨てる
        if (energyAfterGuard.length > 0) {
          const removedEnHOC = energyAfterGuard[energyAfterGuard.length - 1];
          energyAfterGuard = energyAfterGuard.slice(0, -1);
          extraTrash.push(removedEnHOC);
        } else {
          const extraHandIdx = my.hand.findIndex((_, i) => i !== handIndex);
          if (extraHandIdx >= 0) extraTrash.push(my.hand[extraHandIdx]);
        }
      }
      if (needsExtraGuardCard) {
        const extraGuardIdx = my.hand.findIndex((cn, i) => i !== handIndex && canCardGuard(cn, my, ctx.cardMap, ctx.effectsMap));
        if (extraGuardIdx >= 0) {
          const extraGuardNum = my.hand[extraGuardIdx];
          extraTrash.push(extraGuardNum);
          ctx.io.appendLogs([`ガード（${guardCardName}）＋追加コスト：手札ガードカード（${ctx.cardMap.get(extraGuardNum)?.CardName ?? extraGuardNum}）を捨てる`]);
        } else {
          ctx.io.appendLogs([`ガード（${guardCardName}）（追加ガードカードなし）`]);
        }
      } else if (needsOppHandOrColorless) {
        ctx.io.appendLogs([`ガード（${guardCardName}）＋追加コスト（手札か《無》）消費`]);
      } else if (extraEnergyCount > 0 && energyAfterGuard.length < my.energy.length) {
        ctx.io.appendLogs([`ガード（${guardCardName}）＋追加コスト《無》×${extraEnergyCount}消費`]);
      } else {
        ctx.io.appendLogs([`ガード（${guardCardName}）`]);
      }
      // 手札から除外: ガードカード本体 + extraTrash に含まれる手札カード
      const handExtraTrashNums = new Set(extraTrash.filter(cn => my.hand.includes(cn)));
      const handAfterExtraGuard = my.hand.filter((cn, i) => i !== handIndex && !handExtraTrashNums.has(cn));
      newMyState = {
        ...my,
        hand: handAfterExtraGuard,
        trash: [...my.trash, cardNum, ...extraTrash],
        energy: energyAfterGuard,
        field: { ...my.field, lrig_attacked: false },
      };
      // ON_GUARD: 自フィールドシグニの「あなたが【ガード】したとき」トリガーを収集
      const { entries: guardEntries, usedOncePerTurnIds: guardUsedIds } =
        pureCollectSelfEventTriggers(ctx.trigCtx(), 'ON_GUARD', my, op, 'ガード時', responderId);
      // ⚠**`ctx.userId` ではなく `responderId`**＝この経路は CPU がガードする回も通る（`CPU_PLAYER_ID`）。
      const attackGuard = pureCollectLrigAttackGuardedTriggers(ctx.trigCtx(), attackerId, op, my, responderId);
      guardTriggers = [...guardEntries, ...attackGuard.entries];
      attackGuardUsedIds = attackGuard.usedOncePerTurnIds;
      // ⚠§5.3 `O-458`：防御側の《ターン1回》は**防御側**の台帳へ。
      const guardUsedAll = [...guardUsedIds, ...attackGuard.usedDefenderIds];
      if (guardUsedAll.length > 0) {
        newMyState = { ...newMyState, actions_done: [...(newMyState.actions_done ?? []), ...guardUsedAll] };
      }
    } else {
      // ガードしない → ライフクロスをクラッシュ
      // ─── 🆕§5.3 `O-414`：ダメージ置換（「代わりに〜して**もよい**」）を被害側に問う ───
      // ⚠**シグニアタック側（`resolvePendingSigniBattleFor`）と同じ funnel を通す**＝
      //   片方だけだと「シグニには効くがルリグには効かない」型の無言の不整合になる（funnel の規約）。
      // 🔑ここは【ガードしない】を選んだ直後＝**ログをまだ1本も出していない**ので、
      //   中断して再入しても二重ログにならない。応答するのは被害側自身のクライアント。
      if (responderId !== CPU_PLAYER_ID && my.life_crash_replace_choice === undefined) {
        const askOptionsL = lifeCrashReplaceAskOptions(my, { damageSource: 'lrig', cardMap: ctx.cardMap });
        if (askOptionsL.length > 0) {
          await ctx.io.commit(reduceBattle(ctx.bs, {
            type: 'WRITE_STATE', myKey: stateKey,
            myState: { ...my, pending_life_crash_replace: { options: askOptionsL } },
          }));
          ctx.io.appendLogs([`ルリグアタック：ダメージ置換の選択を待っています`]);
          return;
        }
      }
      // 🔴決定は**このクラッシュ1回ぶん**＝下の分岐が拾わなかった経路（防止・バリア・ライフ0）でも
      //   残骸を残さないよう、基点をここで落としておく（`crashOneLife` 側と同じ規約）。
      const lrigCrashDecision = my.life_crash_replace_choice;
      my = consumeLifeCrashReplaceDecision(my);
      // ⚠**funnel は1度だけ引く**＝従来は同じ問い合わせを4回書いており、`cardMap` を渡す／渡さないが
      //   枝ごとにズレていた（`mill` 枝だけコスト支払い型を見ないので、宣言順の意味が枝で変わっていた）。
      const lrigCrashPicked = pickLifeCrashReplacement(my, {
        damageSource: 'lrig', cardMap: ctx.cardMap,
        ...(lrigCrashDecision !== undefined ? { decision: lrigCrashDecision } : {}),
      });
      // 攻撃側ルリグのダブル／トリプルクラッシュ確認
      // ⚠**攻撃したルリグ**を見る（アシストがアタックしたのにセンターのキーワードで判定すると
      //   ダブルクラッシュが誤って乗る／乗らない。続き427）。未設定＝従来どおりセンター。
      // 🔴**§5.6 `C-9` `R-06`（2026-09-17）＝判定は `getLrigAttackCrashState` 1本**。
      //   旧実装はトリプルだけ `keyword_grants` しか見ておらず、CONTINUOUS 付与を読み落としていた。
      const opLrigNum = attackingLrigNum;
      const lrigCrash = getLrigAttackCrashState(opLrigNum, op, my, ctx.cardMap, ctx.effectsMap);

      // 「あなたは対戦相手の（レベルN以下の）ルリグによってダメージを受けない」＝**回数無制限**の防御。
      // 消費型（バリア／prevent_next_damage／置換ミル）を無駄遣いさせないため最初に判定する。
      // §6.4 O-3 続き492: 判定は `resolveLrigDamageShield` 1本（期間ウィンドウ＋【常】宣言をまとめて見る）。
      // ⚠🔴従来ここは期間ウィンドウだけで、【常】版は**消費型のさらに後ろ**かつ**自分のシグニしか
      //   走査しない**インライン判定だった（ルリグ本体・アシスト・キーの宣言が丸ごと無視されていた）。
      // §5.3 O-66: ライフクラッシュ防止／回数制限（**ルリグアタックのダメージ**＝cause:'damage'）。
      // 🔴**この経路は `crashOneLife` を通らない**（インラインでライフを削る）＝ここへ書かないと
      //   「シグニアタックは防げるのにルリグアタックは素通り」という無言の不整合になる。
      // ⚠ルリグアタックは常に相手のターン中＝防御側 `my` は**ターンプレイヤーではない**。
      const lifeCrashPrevented = allowedLifeCrashCount(
        my, op,
        collectLifeCrashPreventions(my, op, false, ctx.cardMap, ctx.effectsMap),
        'damage', 1,
      ) <= 0;
      const lrigShield = resolveLrigDamageShield({
        defender: my, attacker: op, cardMap: ctx.cardMap, effectsMap: ctx.effectsMap,
        attackingLrigNum: opLrigNum ?? undefined,
      });
      if (lifeCrashPrevented) {
        ctx.io.appendLogs([`ルリグアタック：ライフクロスはクラッシュされない（クラッシュ防止）`]);
        newMyState = { ...my, field: { ...my.field, lrig_attacked: false } };
      } else if (lrigShield.prevented) {
        ctx.io.appendLogs([`ルリグアタック：ダメージ無効（ダメージを受けない効果）`]);
        // §6.4 O-10（続き507）＝「代わりにダメージを受けず、ターン終了時まで、この能力を失う」
        // （`WXK01-002-E1`）は**1回だけ**。刻まないと同ターン中の2回目以降も防いで無限バリアになる。
        newMyState = {
          ...my,
          ...(lrigShield.loseEffectId
            ? { lost_ability_effect_ids_this_turn: [...(my.lost_ability_effect_ids_this_turn ?? []), lrigShield.loseEffectId] }
            : {}),
          field: { ...my.field, lrig_attacked: false },
        };
      } else if (countBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD) > 0) {
        const fzLB = removeOneBarrierToken(my.field.free_zone, LRIG_BARRIER_CARD);
        ctx.io.appendLogs([`ルリグアタック：ルリグバリア発動（残${countBarrierTokens(fzLB, LRIG_BARRIER_CARD)}）`]);
        newMyState = { ...my, field: { ...my.field, free_zone: fzLB, lrig_attacked: false } };
      } else if (consumeNextDamagePrevention(my, { type: 'lrig' })) {
        ctx.io.appendLogs([`ルリグアタック：ダメージ無効`]);
        const consumed = consumeNextDamagePrevention(my, { type: 'lrig' })!;
        newMyState = {
          ...consumed,
          field: { ...my.field, lrig_attacked: false },
        };
      } else if (lrigCrashPicked?.repl.kind === 'pay_cost') {
        // §6.4 O-37(a) ダメージ置換（コスト支払い型）＝ルリグアタック側の消費地点。
        // ⚠**シグニアタック側（crashOneLife）と同じ funnel を通す**＝片方だけだと
        //   「シグニには効くがルリグには効かない」型の無言の不整合になる。
        const paidC = applyPayCostReplacement(my, lrigCrashPicked.index, lrigCrashPicked.repl, ctx.cardMap, lrigCrashPicked.payIndex);
        ctx.io.appendLogs([`ルリグアタック：${lifeCrashReplaceLog(lrigCrashPicked.repl, paidC?.paidJa)}`]);
        newMyState = { ...(paidC?.state ?? my), field: { ...my.field, lrig_attacked: false } };
      } else if (lrigCrashPicked?.repl.kind === 'mill') {
        // ライフクラッシュ置換（ルリグアタック側の消費地点）＝ funnel で crashOneLife と同じ規則を通す。
        // ⚠「シグニによって」限定の宣言はここで**選ばれない**（従来は限定を見ずに消費していた）。
        const appliedL = applyMillReplacement(my, lrigCrashPicked.index, lrigCrashPicked.repl.count);
        ctx.io.appendLogs([`ルリグアタック：${lifeCrashReplaceLog(lrigCrashPicked.repl)}`]);
        newMyState = { ...appliedL.state, field: { ...my.field, lrig_attacked: false } };
      } else if (my.prevent_lrig_damage) {
        // 1回消費型の残り（「対戦相手の効果によってダメージを受けない」等・`PREVENT_DAMAGE_FROM_OPP_EFFECTS`）。
        // ⚠期間つきの「ルリグによってダメージを受けない」は上の funnel が先に拾う＝ここには落ちてこない。
        ctx.io.appendLogs([`ルリグアタック：ルリグダメージ無効`]);
        newMyState = { ...my, prevent_lrig_damage: undefined, field: { ...my.field, lrig_attacked: false } };
      } else if (my.life_cloth.length > 0) {
        const crashed = my.life_cloth[my.life_cloth.length - 1];
        const crashedName = ctx.cardMap.get(crashed)?.CardName ?? crashed;
        let lifeAfterCrash = my.life_cloth.slice(0, -1);
        let pendingAfterCrash = my.pending_crashed_cards ?? [];
        if (lrigCrash.crashCount > 1 && lifeAfterCrash.length > 0) {
          // ダブル=追加1枚／トリプル=追加2枚（残ライフが足りなければあるだけ）
          const extraCount = Math.min(lrigCrash.crashCount - 1, lifeAfterCrash.length);
          const extraCards = lifeAfterCrash.slice(-extraCount);
          lifeAfterCrash = lifeAfterCrash.slice(0, -extraCount);
          pendingAfterCrash = [...pendingAfterCrash, ...extraCards];
          ctx.io.appendLogs([`ルリグアタック：${lrigCrash.cause}（${crashedName}、${extraCards.map(cn => ctx.cardMap.get(cn)?.CardName ?? cn).join('、')}）`]);
        } else {
          ctx.io.appendLogs([`ルリグアタック：ライフクロスをクラッシュ（${crashedName}）`]);
        }
        newMyState = {
          ...my,
          life_cloth: lifeAfterCrash,
          // 🔴**§5.3 O-66 で発見した既存バグ**＝この経路だけ `life_crashed_this_turn` を加算していなかった
          //   （シグニアタックの `crashOneLife`・効果の `execLifeCrash`・ライフコストの3本は加算済み）。
          //   ⇒ ①既存の `LIFE_CRASHED_THIS_TURN` 条件が**ルリグアタックのダメージを数えていなかった**
          //     ②`O-66` の「1ターンにN枚まで」が**ルリグアタックだけ素通り**する。
          //   ⚠ダブル／トリプルクラッシュの追加分も枚数に含める（`my.life_cloth` からの実減少数を数える）。
          life_crashed_this_turn:
            (my.life_crashed_this_turn ?? 0) + (my.life_cloth.length - lifeAfterCrash.length),
          // 🆕**§5.3 `O-239`**＝チェックゾーンへ置かれた順を記録する（ルリグアタック経路）。
          checked_life_order_this_turn: [...(my.checked_life_order_this_turn ?? []), ...(crashed ? [crashed] : []), ...pendingAfterCrash],
          pending_crashed_cards: pendingAfterCrash,
          crash_source_card_num: op.field.lrig.at(-1),
          pending_crash_source_card_nums: pendingAfterCrash.map(() => op.field.lrig.at(-1) ?? null),
          // 🆕§5.3 `O-390`（2026-09-16）＝**ルリグアタック経路は原因列を一切書いていなかった**。
          //   §5.3 `O-120` の規約は「原因は**発生源と必ず同じ地点で**書く」＝
          //   書かないと**前のクラッシュの原因が残る**し、【ダブルクラッシュ】限定の札も発火しない。
          //   ⚠添字は `pending_crash_source_card_nums` と**必ず同じ長さ**にする。
          crash_cause: lrigCrash.cause,
          pending_crash_causes: pendingAfterCrash.map(() => lrigCrash.cause ?? null),
          field: { ...my.field, lrig_attacked: false, check: crashed },
          // 🆕§5.3 `O-160`（2026-09-02）＝ルリグアタックも**ダメージ**（`crashOneLife` と同じ印を立てる）。
          //   ⚠この経路は `crashOneLife` を通らないので、書き忘れると
          //   「対戦相手がダメージを受けたとき」がルリグアタックだけ発火しない片肺になる
          //   （`life_crashed_this_turn` を同じ理由で取りこぼしていた前例が上のコメント）。
          damaged_just: true,
        };
      } else if (my.prevent_defeat) {
        ctx.io.appendLogs([`ルリグアタック：ライフなし → 敗北無効`]);
        newMyState = { ...my, prevent_defeat: undefined, field: { ...my.field, lrig_attacked: false } };
      } else {
        // ライフクロス0枚 → 自分の敗北
        ctx.io.appendLogs([`ルリグアタック：ライフなし → 敗北`]);
        const winnerId = attackerId;
        const clearedMyState: PlayerState = { ...my, field: { ...my.field, lrig_attacked: false } };
        await ctx.io.commit(reduceBattle(ctx.bs, { type: 'END_GAME', winnerId, myKey: stateKey, myState: clearedMyState }));
        return;
      }
    }
    // ON_ATTACK_END（O-181）＝ルリグアタックのガード／ダメージ解決が終わった地点。
    // `check` の【ライフバースト】はこの commit より後に解決されるため、シグニ側と同じ境界になる。
    // 場の legacy ON_GUARD watcher はガード時に上で収集済み。collector はそれを二重に拾わず、
    // 実行時付与ストアと非ガードのダメージ無効だけを補完する。
    let newOpState: PlayerState = op;
    if (attackingLrigNum) {
      const dealtLrigDamage = my.life_cloth.length > newMyState.life_cloth.length;
      const attackEnd = pureCollectAttackEndTriggers(
        ctx.trigCtx(), attackerId, attackingLrigNum, newOpState, newMyState, dealtLrigDamage,
        // 🆕§5.3 `O-181` 軸(b)＝ルリグアタックでもライフクラッシュの有無を渡す
        //   （原文は「あなたの**ルリグかシグニが**アタックによって〜」＝両方の入口で同じ材料が要る）。
        { attackerKind: 'lrig', wasGuarded: handIndex !== null, crashedLife: dealtLrigDamage },
      );
      guardTriggers.push(...attackEnd.entries);
      if (attackEnd.usedOncePerTurnIds.length > 0) {
        newOpState = {
          ...newOpState,
          actions_done: [...(newOpState.actions_done ?? []), ...attackEnd.usedOncePerTurnIds],
        };
      }
    }

    // 防御側の「そのアタックで」ダメージ無効も、ガード有無／ダメージ成否を問わずここで失効する。
    newMyState = clearEndOfAttackEffects(newMyState);
    // MULTI_DAMAGE_ON_LRIG_ATTACK: 攻撃側に残りアタック回数があれば再トリガー
    const oppStateKey = stateKey === 'host_state' ? 'guest_state' : 'host_state';
    // 🆕§5.3 `O-367`（2026-09-14）＝**このアタックで割れたライフがまだ未処理なら、
    //   クラッシュ先の置換（`crash_to_trash_instead`）はここで落とさない**＝
    //   それを読む `performLifeBurstResponse` は**この commit より後**に走る。
    //   ⚠キーワード付与（【ダブルクラッシュ】）は**枚数の確定がここより前**なので、ここで落として正しい。
    const crashPendingEOA = newMyState.field.check != null
      || (newMyState.pending_crashed_cards?.length ?? 0) > 0;
    newOpState = clearEndOfAttackEffects(newOpState, { crashPending: crashPendingEOA });
    if (op.lrig_attack_remaining && op.lrig_attack_remaining > 0) {
      const rem = op.lrig_attack_remaining - 1;
      newOpState = { ...newOpState, lrig_attack_remaining: rem > 0 ? rem : undefined };
      // バースト処理中でない場合は即座に再アタック、バースト中はcheck解消後に再表示
      newMyState = { ...newMyState, field: { ...newMyState.field, lrig_attacked: true } };
      ctx.io.appendLogs([`ルリグアタック継続（残り${rem}回）`]);
    }
    if (attackGuardUsedIds.length > 0) {
      newOpState = { ...newOpState, actions_done: [...(newOpState.actions_done ?? []), ...attackGuardUsedIds] };
    }
    const existingStackGuard = ctx.bs.effect_stack ?? null;
    const guardStack = guardTriggers.length > 0
      ? (existingStackGuard ? pushToStack(existingStackGuard, guardTriggers) : initStack(ctx.bs.active_user_id ?? attackerId, guardTriggers))
      : undefined; // トリガー無しなら effect_stack キー自体を書かない
    await ctx.io.commit(reduceBattle(ctx.bs, {
      type: 'WRITE_STATE', myKey: stateKey, myState: newMyState,
      opp: { key: oppStateKey, state: newOpState }, effectStack: guardStack,
    }));
  } finally {
    ctx.io.setLoading(false);
  }
};
