import type { PlayerState } from '../../types';

/**
 * 「ターン終了時、（その）レゾナを場からルリグデッキに戻す」の解決（§6.4・`WX07-050`／`WX16-Re18`）。
 *
 * ⚠**戻し先はトラッシュではなくルリグデッキ**＝`turn_end_field_trash_targets` を流用してはいけない
 *   （レゾナはトラッシュに置かれずルリグデッキへ戻る）。
 * ⚠**ターン終了処理は BattleScreen に2経路ある**（`doPhaseAdvance` と終了時ディスカード確定後）ので、
 *   片方だけに書くと「手札が多いターンだけ戻らない」型の無言の不整合になる＝両方でこの1本を呼ぶ。
 *
 * 【背景】原文の「ターン終了時、…ルリグデッキに戻す」が `action.type:'UNKNOWN'` に落ちており、
 * **出したレゾナが場に居座り続ける過剰効果**だった（一時的に出す札が恒久展開になる）。
 */
export function resolveTurnEndLrigDeckReturn(
  state: PlayerState,
): { state: PlayerState; returned: string[] } {
  const targets = state.turn_end_return_to_lrig_deck ?? [];
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
  if (returned.length === 0) {
    return { state: { ...state, turn_end_return_to_lrig_deck: undefined }, returned: [] };
  }
  return {
    state: {
      ...state,
      field: { ...state.field, signi },
      lrig_deck: [...state.lrig_deck, ...returned],
      turn_end_return_to_lrig_deck: undefined,
      last_summoned_resonas: undefined,
    },
    returned,
  };
}
