import type { PlayerState } from '../../types';

/**
 * Clear only effects whose lifetime is the just-resolved attack.
 *
 * 🔑**「1回のアタックが終わった」地点はここ1本**＝`performGuardResponse`（ガード／ダメージ・クラッシュの
 * 解決が**全部終わった後**）と、4本の「ガード代替コスト」ハンドラから呼ばれる。
 * ⚠**ダブルクラッシュ枚数の判定より後**に呼ばれることが効いている（先に呼ぶと、そのアタック自身から
 *   キーワードが消える）。順序を動かすときはここのコメントごと見直すこと。
 */
export function clearEndOfAttackEffects(
  state: PlayerState,
  opts: {
    /**
     * 🔴**このアタックで割れたライフがまだ未処理か**（チェックゾーンか `pending_crashed_cards` に残っている）。
     * 🆕§5.3 `O-367`（2026-09-14）＝**クラッシュ先の置換だけは、ここで落としてはいけない**。
     * `crash_to_trash_instead` を読むのは `performLifeBurstResponse`＝**この関数より後**に走るので、
     * ここで消すと `WX19-034-E1` が**丸ごと no-op になる**（＝過剰実行を直すつもりで無実行にする）。
     * ⇒ **クラッシュが残っている回はここでは触らず**、最後の1枚を処理した
     *    `performLifeBurstResponse` 側が落とす。⚠**ガードされた／ダメージが出なかった回**は
     *    あちらが走らないので、**ここで落とすのが唯一の機会**になる。
     */
    crashPending?: boolean;
  } = {},
): PlayerState {
  const windows = state.prevent_damage_windows?.filter(w => w.expires !== 'END_OF_ATTACK');
  const unchangedWindows = windows?.length === state.prevent_damage_windows?.length;
  const hasAttackKeywords = !!state.keyword_grants_this_attack
    && Object.keys(state.keyword_grants_this_attack).length > 0;
  const hasAttackCrashFlag = state.crash_to_trash_ends_this_attack === true && !opts.crashPending;
  if (!state.prevent_opp_guard && unchangedWindows && !hasAttackKeywords && !hasAttackCrashFlag) return state;
  return {
    ...state,
    prevent_opp_guard: undefined,
    prevent_damage_windows: windows?.length ? windows : undefined,
    // 🆕**「そのアタックの間」だけのキーワード付与を剥がす**（§5.3 `O-367`・2026-09-14）。
    //   ⚠**台帳に控えた分だけ引く**＝同じキーワードを別の効果が**ターン継続**で付けていたら、そちらは残す
    //     （`['ダブルクラッシュ','ダブルクラッシュ']` から1つだけ抜く＝重複を保つ配列演算にしてある）。
    ...(hasAttackKeywords
      ? {
          keyword_grants: stripGrants(state.keyword_grants, state.keyword_grants_this_attack!),
          keyword_grants_this_attack: undefined,
        }
      : {}),
    // 🆕**クラッシュ先の置換も「そのアタックの間」なら落とす**（同・`WX19-034-E1`）。
    ...(hasAttackCrashFlag
      ? { crash_to_trash_instead: undefined, crash_to_trash_ends_this_attack: undefined }
      : {}),
  };
}

/**
 * `keyword_grants` から「このアタックで足した分」だけを引く。
 * ⚠**`filter` で一括除去しない**＝同じキーワードがターン継続の別効果からも付いている場合、
 *   それまで消える（過少）。**1件につき1つだけ**取り除く。
 */
function stripGrants(
  grants: Record<string, string[]> | undefined,
  ledger: Record<string, string[]>,
): Record<string, string[]> | undefined {
  if (!grants) return grants;
  const next: Record<string, string[]> = {};
  for (const [num, kws] of Object.entries(grants)) {
    const remove = [...(ledger[num] ?? [])];
    const kept = kws.filter(kw => {
      const i = remove.indexOf(kw);
      if (i < 0) return true;
      remove.splice(i, 1);
      return false;
    });
    if (kept.length > 0) next[num] = kept;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

/** Clear delayed watchers whose lifetime is the attack phase that just ended. */
export function clearEndOfAttackPhaseDelayedTriggers(state: PlayerState): PlayerState {
  const delayed = state.delayed_triggers?.filter(dt => dt.duration !== 'THIS_ATTACK_PHASE');
  if (delayed?.length === state.delayed_triggers?.length) return state;
  return { ...state, delayed_triggers: delayed?.length ? delayed : undefined };
}
