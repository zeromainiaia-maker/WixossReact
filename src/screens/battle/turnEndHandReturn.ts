import type { PlayerState } from '../../types';

/**
 * 「ターン終了時、それを場から手札に戻す」の解決（§6.4 O-10・続き509・`WXK08-002-E1` の選択肢①）。
 *
 * ⚠**戻し先は手札**＝`turn_end_field_trash_targets`（トラッシュ）や
 *   `turn_end_return_to_lrig_deck`（ルリグデッキ）を流用してはいけない。3本とも「ターン終了時に場から
 *   どこかへ送る」だが行き先が違い、混ぜると**トラッシュへ落ちて再利用できない**等の別カードになる。
 * ⚠**ターン終了処理は BattleScreen に2経路ある**（`doPhaseAdvance` と終了時ディスカード確定後）ので、
 *   片方だけに書くと「手札が多いターンだけ戻らない」型の無言の不整合になる＝両方でこの1本を呼ぶ
 *   （`resolveTurnEndLrigDeckReturn` と同じ規約）。
 *
 * 【背景】原文「それをレベル１のシグニとして場に出す。ターン終了時、それを場から手札に戻す」の後半が
 * 表現できず、選択肢まるごと明示 defer になっていた（＝アーツの3択のうち1択が丸ごと無反応）。
 */
export function resolveTurnEndHandReturn(
  state: PlayerState,
): { state: PlayerState; returned: string[] } {
  const targets = state.turn_end_return_to_hand ?? [];
  if (targets.length === 0) return { state, returned: [] };
  const returned: string[] = [];
  const signi = state.field.signi.map(stack => {
    const top = stack?.at(-1);
    if (!top || !targets.includes(top)) return stack;
    returned.push(top);
    // 下にカードが残っていればスタックはそのまま（最前面だけを戻す）。
    const rest = stack!.slice(0, -1);
    return rest.length > 0 ? rest : null;
  }) as (string[] | null)[];
  // ⚠**予約の失効はここで書かない**＝`turn_end_return_to_hand` は turn-scoped レジストリ
  //   （`turnScopedState.ts`）が turn-end に落とす。ここで手書きすると funnel が二重管理になる。
  if (returned.length === 0) return { state, returned: [] };
  return {
    state: {
      ...state,
      field: { ...state.field, signi },
      hand: [...state.hand, ...returned],
    },
    returned,
  };
}
