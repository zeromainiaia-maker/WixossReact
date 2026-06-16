# ログのみ STUB 修正リスト

優先度順（件数×ゲームへの影響）。修正済みは ✅。

## P1: フラグ設定済みだが BattleScreen 未接続

| # | STUB ID | 件数 | 状態 | 概要 |
|---|---------|------|------|------|
| 1 | `GAIN_EXTRA_TURN` | 5 | ✅ | extra_turn フラグ→BattleScreen.tsxのターン終了処理で追加ターン付与済み |
| 2 | `NEGATE_COIN_ABILITY` | 1 | ✅ | negate_coin_abilities フラグ→ベット可否判定(canBet)で参照済み |

## P2: 完全ログのみ（状態変更ゼロ）— 件数多い順

| # | STUB ID | 件数 | 状態 | 概要 |
|---|---------|------|------|------|
| 3 | `FORCE_TARGET_SELF` | 3 | ✅ | effectEngine.collectForcedTargets + BattleScreen.tsxのSELECT_TARGET候補絞り込みで実装済み |
| 4 | `UPKEEP_OR_NO_UP` | 2 | ✅ | UPフェーズ進行時に支払い確認モーダルを追加（doPhaseAdvanceのupkeepPay引数）。CPU側は自動支払い |
| 5 | `DISONA_RESTRICTION` | 2 | ✅ | 使用条件はCondition型NOT_PLAYED_NON_DISSONA_SPELL_THIS_TURNで判定、ターン内制限はdissona_only_spells_this_turnフラグでcastSpellをゲート |
| 6 | `BET_CONDITION` | 2 | ✅ | 「Ａ枚の代わりにＢ枚まで対象」パターンを追加実装（WDK01-010）。「効果を1回繰り返す」パターン（WD21-007）はGRANT_QUOTED_AUTO_ABILITY側に①〜⑤選択+対象選択+ベット時再帰を実装 |
| 7 | `TARGET_OPP_SIGNI_ONLY` | 2 | ✅ | 対象選択→対戦相手が手札2枚を捨てて回避するか、デッキの一番下に送られるかを選択する実装（WXDi-P01-028） |
| 8 | `DISCARD_BY_POWER_MATCH` | 1 | ✅ | 手札の青シグニ選択→相手手札の同パワーシグニを捨てさせる二段階処理が実装済み |
| 9 | `MULTI_ACCE_LIMIT` | 1 | ✅ | effectEngine.collectMultiAcceSigni + BattleScreen.tsxのアクセ装着可否判定で実装済み |
| 10 | `INCREASE_ACT_ABILITY_COST` | 1 | ✅ | effectEngine.collectIncreaseActCost + 起動能力コスト計算への統合済み |
| 11 | `IGNORE_LRIG_RESTRICTION_ARTS` | 1 | ✅ | BattleScreen.tsxのignoreRestriction判定で実装済み（execStub側はログのみだが実害なし） |
| 12 | `ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE` | 1 | ✅ | lrig_gained_types付与→effectEngine.collectLrigAliasesで常時参照される実装済み |
| 13 | `DRAW_IF_OPP_DISCARDED_HAND` | 0 | ⬜ | 相手手札捨て時ドロー（トリガー系）。JSON上は0件だが対象カードはSPK16-13E③に実在。SPK16-13E自体は2026-06-17にBET_MECHANIC化完了（③はDRAW_UP_TO_SIXで近似実装）。ただし本来必要な「このターン対戦相手の効果で自分のカードが移動したか」を追跡するターン限定フラグ（opp_removed_my_signi_this_turn / opp_trashed_my_energy_this_turn / opp_trashed_my_hand_this_turn）は未実装。完全実装には各種効果のexec箇所でフラグセット+ターン開始時リセットが必要 |
| 14 | `DISABLE_FIRST_ABILITY_ON_ATTACK` | 0 | ⬜ | アタック時最初のAUTO能力を無効化。CSV全件を検索したが該当テキストは実在せず、対象カード0件は正しい |
| 15 | `BET_ALTERNATIVE`誤分類 | ✅完了 | ✅ | parseSentencePart3.tsの判定順バグを修正（2026-06-16）。全14枚対処完了：単純スケール型4枚（WX17-005/WD19-006/WD19-007/WXK07-106）、BET_MECHANIC化11枚（WX18-003/WX18-005/WX15-029/WX16-005/WX17-003/WX19-005/WX19-006/WXK04-014/WDK05-T10/PR-K072/WDK12-007/WDK06-R08/SPK16-13E）、BET_ALTERNATIVE除去1枚（WXDi-P07-059）。BET_ALTERNATIVE 0件達成（v0.319）。WDK06-R08①のパワー比較とSPK16-13E①②③の条件チェックは近似実装（#13参照） |
