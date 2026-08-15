import type { PlayerState } from '../../types';

/**
 * 「ターン終了時、それらをあなたのエナゾーンからトラッシュに置く」の解決
 * （`TRASH_ENERGY_AT_TURN_END`・`SPK01-10-E1`・§6.4 O-3）。
 *
 * ⚠**場トラッシュ（`turn_end_field_trash_targets`）を流用してはいけない**＝あちらは
 *   `field.signi` の最上段しか見ないので、エナゾーンのカードは1枚も落ちない。
 * ⚠**ターン終了処理は BattleScreen に2経路ある**（`doPhaseAdvance` と終了時ディスカード確定後）ので、
 *   片方だけに書くと「手札が多いターンだけエナが返らない」型の無言の不整合になる＝両方でこの1本を呼ぶ。
 *
 * 【背景】原文のこの一文はどの規則にも掛からず `STUB{OPTIONAL_COST}` へ落ちて**丸ごと no-op** だった＝
 * 「デッキから2枚エナチャージ」という利得だけが残り、対価の返却が消えていた（過剰実行）。
 * `OPTIONAL_COST` は他所で使われるハンドラ持ちの id なので `census:stubs` の A群にも出ない。
 *
 * ⚠**予約は消化の有無にかかわらず必ずクリアする**（次のターンへ持ち越さない）。
 */
export function resolveTurnEndEnergyTrash(
  state: PlayerState,
): { state: PlayerState; trashed: string[] } {
  const targets = state.turn_end_energy_trash_targets ?? [];
  if (targets.length === 0) return { state, trashed: [] };
  const trashed: string[] = [];
  const energy = state.energy.filter(instanceId => {
    // 同じインスタンスIDは1枚しか無い前提（エナゾーンは instanceId で一意）。
    if (!targets.includes(instanceId)) return true;
    trashed.push(instanceId);
    return false;
  });
  return {
    state: {
      ...state,
      energy,
      trash: [...state.trash, ...trashed],
      turn_end_energy_trash_targets: undefined,
    },
    trashed,
  };
}
