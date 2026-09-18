/**
 * **宣言したシグニの上書き**（§5.3 `O-226`＝`WXK09-001-E3`
 * 「宣言したシグニの基本レベルは0になり、限定条件を無視して場に出せる」）。
 *
 * 🆕**2026-09-18（`O-534`）に `src/screens/battle/growLogic.ts` から engine へ移設した**＝
 * **配置レベル制限（`R-48`①）を engine 側でも見るようになった**ため（engine は `src/screens/` を import できない）。
 * `growLogic.ts` は互換のためここを re-export する＝**実装は1本**。
 *
 * ⚠**名前が一致したときだけ**効く（フラグだけ見ると**全シグニ**がレベル0＆限定無視になる＝過剰実行）。
 */
export function declaredSigniOverride(
  state: { declared_card_name?: string; game_declared_signi_level_zero?: boolean; game_declared_signi_ignore_restriction?: boolean },
  cardName: string | undefined,
): { levelZero: boolean; ignoreRestriction: boolean } {
  const named = !!cardName && !!state.declared_card_name && cardName === state.declared_card_name;
  return {
    levelZero: named && !!state.game_declared_signi_level_zero,
    ignoreRestriction: named && !!state.game_declared_signi_ignore_restriction,
  };
}
