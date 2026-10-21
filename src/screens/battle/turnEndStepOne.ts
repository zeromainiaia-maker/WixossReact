import type { CardData, PlayerState } from '../../types';
import { getCardNum } from '../../engine/effectExecutor';
import { removeFromField, resolvePendingExiles } from '../../engine/execUtils';
import { resolveTurnEndPreventionMill } from './damagePrevention';
import { resolveTurnEndLrigDeckReturn } from './turnEndLrigDeckReturn';
import { resolveTurnEndHandReturn } from './turnEndHandReturn';
import { resolveTurnEndEnergyTrash } from './turnEndEnergyTrash';

/**
 * 🆕2026-10-21＝**エンドフェイズ①「ターン終了時に」の予約をすべて解決する**（ターンを終えるプレイヤーの state だけ）。
 * 人間の `phaseAdvance`（END 分岐）と CPU の `cpuTurn`（END 分岐）が**同じ1本**を呼ぶ。
 *
 * 🔴旧＝この処理は `phaseAdvance` にだけ書かれており、**CPU のターン終了はドローとエナのトラッシュしか処理していなかった**
 *   ＝CPU のターンでは、ビートゾーンが残る・ターン終了時のミル（デウスシールド）・「コインを使わなければトラッシュ」・
 *   **「ターン終了時、このシグニをトラッシュに置く」・一時レゾナのルリグデッキへの返却・「ターン終了時、手札に戻す」**・
 *   「このゲームの間、ターン終了時にトラッシュから手札へ」が**全部起きなかった**（予約は後片付けで空にされて消えた）。
 *
 * ⚠順序は公式ルールの①（ここ）→②手札上限→③ターン終了。手札を増やす効果は②より前に解決する。
 * ⚠`end_turn_effects_resolved` が立っていれば①は解決済み（手札上限の捨て札で誘発を解決して戻ってきた回）＝二重適用しない。
 * ⚠ログの文言は旧 `phaseAdvance` と同じ。
 */
export function resolveTurnEndStepOne(endState: PlayerState, cardMap: Map<string, CardData>): {
  state: PlayerState; lrigDeckReturned: string[]; logs: string[];
} {
  const logs: string[] = [];
  const nameOf = (n: string) => cardMap.get(getCardNum(n))?.CardName ?? n;
  const resolved = !!endState.end_turn_effects_resolved;
  // ENDフェーズ：ビートゾーン全カードをトラッシュへ（手札上限処理と同タイミング）
  let beat = endState.field.beat_zone ?? [];
  let trash = endState.trash;
  if (beat.length > 0) {
    trash = [...trash, ...beat];
    logs.push(`ビートゾーン（${beat.length}枚）をトラッシュへ`);
    beat = [];
  }
  let hand = endState.hand;
  let deck = endState.deck;
  let field = { ...endState.field, beat_zone: beat };
  let energy = endState.energy;
  let lrigDeckReturned: string[] = [];
  /** 場を離れたシグニの【ソウル】の行き先（ルリグトラッシュ）。 */
  let lrigTrashExtra: string[] | null = null;
  if (!resolved && (endState.turn_end_mill_count ?? 0) > 0) {
    const r = resolveTurnEndPreventionMill({ ...endState, deck, trash });
    deck = r.state.deck; trash = r.state.trash;
    logs.push(`ターン終了時：デウスシールドの能力でデッキの上から${r.milled.length}枚をトラッシュへ`);
  }
  // DRAW_AT_TURN_END: このターン終了時に引く（このシグニが場を離れていても引く）
  if (!resolved && (endState.turn_end_draw_count ?? 0) > 0) {
    const n = endState.turn_end_draw_count!;
    const drawn = deck.slice(0, n);
    deck = deck.slice(n);
    hand = [...hand, ...drawn];
    logs.push(`ターン終了時：カードを${drawn.length}枚引く`);
  }
  // COIN_SPEND_CONDITION: コインを使わなかったら対象のシグニをトラッシュ
  // turn_end_field_trash_targets: ターン終了時にフィールドのシグニをトラッシュへ（TRASH_AT_TURN_END）
  // 🔴2026-10-21＝どちらも**場を離れる処理の共通の1本（`removeFromField`）を通す**＝下に重なっていたカード・【チャーム】【アクセ】はトラッシュ・
  //   【ソウル】はルリグトラッシュ。旧＝「このシグニをトラッシュ」は一番上だけトラッシュへ置き下のカードが消えた／コイン条件は付いていた札が浮いて残った。
  const coinTargets = !resolved && (endState.coin_condition_signi_instances ?? []).length > 0 && !(endState.actions_done ?? []).includes('COIN_SPENT')
    ? endState.coin_condition_signi_instances ?? [] : [];
  const fieldTargets = !resolved ? endState.turn_end_field_trash_targets ?? [] : [];
  if (coinTargets.length > 0 || fieldTargets.length > 0) {
    let tmp: PlayerState = { ...endState, hand, deck, trash, field, energy };
    const leave = (top: string) => { tmp = removeFromField(top, tmp); tmp = { ...tmp, trash: [...tmp.trash, top] }; };
    for (const instId of coinTargets) {
      const top = tmp.field.signi.find(st => st?.includes(instId))?.at(-1);
      if (!top) continue;
      leave(top);
      logs.push(`コイン消費なし → ${nameOf(instId)}をトラッシュ`);
    }
    const trashed: string[] = [];
    for (const targetId of fieldTargets) {
      if (!tmp.field.signi.some(st => st?.at(-1) === targetId)) continue;
      leave(targetId);
      trashed.push(targetId);
    }
    if (trashed.length > 0) logs.push(`ターン終了時：${trashed.map(nameOf).join('・')}をトラッシュへ`);
    hand = tmp.hand; trash = tmp.trash; field = { ...tmp.field, beat_zone: beat };
    lrigTrashExtra = tmp.lrig_trash;
  }
  // turn_end_energy_trash_targets: ターン終了時にエナゾーンからトラッシュへ（TRASH_ENERGY_AT_TURN_END）
  if (!resolved) {
    const et = resolveTurnEndEnergyTrash({ ...endState, energy, trash });
    if (et.trashed.length > 0) {
      energy = et.state.energy; trash = et.state.trash;
      logs.push(`ターン終了時：${et.trashed.map(nameOf).join('・')}をエナゾーンからトラッシュへ`);
    }
  }
  // turn_end_return_to_lrig_deck: 一時レゾナをルリグデッキへ戻す
  if (!resolved) {
    const ret = resolveTurnEndLrigDeckReturn({ ...endState, field });
    if (ret.returned.length > 0) {
      field = { ...field, signi: ret.state.field.signi };
      lrigDeckReturned = ret.returned;
      logs.push(`ターン終了時：${ret.returned.map(nameOf).join('・')}をルリグデッキへ戻す`);
    }
  }
  // turn_end_return_to_hand: 「ターン終了時、それを場から手札に戻す」（手札上限チェックより前に手札へ）
  if (!resolved) {
    const rh = resolveTurnEndHandReturn({ ...endState, field });
    if (rh.returned.length > 0) {
      field = { ...field, signi: rh.state.field.signi };
      hand = [...hand, ...rh.returned];
      logs.push(`ターン終了時：${rh.returned.map(nameOf).join('・')}を手札に戻す`);
    }
  }
  // game_turn_end_trash_to_hand: ターン終了時、トラッシュから特定クラスシグニを手札へ（GAIN_ABILITY_THIS_GAME）
  if (!resolved && endState.game_turn_end_trash_to_hand) {
    const { class: cls, count } = endState.game_turn_end_trash_to_hand;
    const toHand = trash.filter(cn => {
      const c = cardMap.get(cn) ?? cardMap.get(getCardNum(cn));
      return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(cls);
    }).slice(0, count);
    if (toHand.length > 0) {
      trash = trash.filter(cn => !toHand.includes(cn));
      hand = [...hand, ...toHand];
      logs.push(`ターン終了時：トラッシュ＜${cls}＞シグニ${toHand.length}枚を手札へ（このゲーム）`);
    }
  }
  // 遅延自己除外：場に残っていてもターン終了時には除外する。
  const ex = resolvePendingExiles({ ...endState, hand, deck, trash, field }, true);
  return {
    state: {
      ...endState,
      hand: ex.hand, deck: ex.deck, trash: ex.trash,
      field: { ...ex.field, beat_zone: ex.field.beat_zone ?? [] },
      excluded: ex.excluded, energy,
      ...(lrigTrashExtra ? { lrig_trash: lrigTrashExtra } : {}),
      ...(lrigDeckReturned.length > 0
        ? { lrig_deck: [...endState.lrig_deck, ...lrigDeckReturned], turn_end_return_to_lrig_deck: undefined, last_summoned_resonas: undefined }
        : {}),
      pending_exile_nums: undefined,
      turn_end_draw_count: undefined, turn_end_mill_count: undefined,
      coin_condition_signi_instances: undefined, turn_end_field_trash_targets: undefined, turn_end_energy_trash_targets: undefined,
      end_turn_effects_resolved: true,
    },
    lrigDeckReturned,
    logs,
  };
}
