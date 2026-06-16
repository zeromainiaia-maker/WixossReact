# ログのみ STUB 修正リスト

優先度順（件数×ゲームへの影響）。修正済みは ✅。

## P1: フラグ設定済みだが BattleScreen 未接続

| # | STUB ID | 件数 | 状態 | 概要 |
|---|---------|------|------|------|
| 1 | `GAIN_EXTRA_TURN` | 5 | ⬜ | extra_turn フラグはセットされるが追加ターン付与ロジックなし |
| 2 | `NEGATE_COIN_ABILITY` | 1 | ⬜ | negate_coin_abilities フラグはセットされるがベットチェック未参照 |

## P2: 完全ログのみ（状態変更ゼロ）— 件数多い順

| # | STUB ID | 件数 | 状態 | 概要 |
|---|---------|------|------|------|
| 3 | `FORCE_TARGET_SELF` | 3 | ⬜ | このシグニしか対象にできない（effectEngine 対象フィルタ） |
| 4 | `UPKEEP_OR_NO_UP` | 2 | ⬜ | アップキープするかしないかを2択で選ぶ |
| 5 | `DISONA_RESTRICTION` | 2 | ⬜ | DISONA ルール制限 |
| 6 | `BET_CONDITION` | 2 | ⬜ | ベット条件（コイン消費でベット宣言） |
| 7 | `TARGET_OPP_SIGNI_ONLY` | 2 | ⬜ | 対象修飾子（相手シグニのみ対象化フラグ） |
| 8 | `DISCARD_BY_POWER_MATCH` | 1 | ⬜ | 手札のパワー一致カードを捨てる |
| 9 | `MULTI_ACCE_LIMIT` | 1 | ⬜ | アクセ最大N枚制限（フラグ設定） |
| 10 | `INCREASE_ACT_ABILITY_COST` | 1 | ⬜ | 相手の起動能力コストを増加（フラグ設定） |
| 11 | `IGNORE_LRIG_RESTRICTION_ARTS` | 1 | ⬜ | ルリグ制限アーツを無視（フラグ設定） |
| 12 | `ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE` | 1 | ⬜ | センタールリグが全ルリグタイプを持つ |
| 13 | `DRAW_IF_OPP_DISCARDED_HAND` | 0 | ⬜ | 相手手札捨て時ドロー（トリガー系） |
| 14 | `DISABLE_FIRST_ABILITY_ON_ATTACK` | 0 | ⬜ | アタック時最初のAUTO能力を無効化 |
