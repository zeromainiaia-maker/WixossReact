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
| 13 | `DRAW_IF_OPP_DISCARDED_HAND` | 0 | ⬜ | 相手手札捨て時ドロー（トリガー系）。**注記(2026-06-16)**: JSON上は0件だが、対象カードは実在する（`SPK16-13E`③「このターンに対戦相手の効果によって…手札からカードがトラッシュに移動していた場合…カードを引く」）。原因は#15参照。①②③とも「このターン対戦相手の効果で自分の場/エナ/手札からカードが移動した」を追跡するターン限定フラグが未実装のため、機構自体が未着手。SPK16-13E全体は要追加実装で保留中 |
| 14 | `DISABLE_FIRST_ABILITY_ON_ATTACK` | 0 | ⬜ | アタック時最初のAUTO能力を無効化。CSV全件を検索したが該当テキストは実在せず、対象カード0件は正しい |
| 15 | `BET_ALTERNATIVE`誤分類 | 4→2 | ✅/⬜ | `parseSentencePart3.ts`で「あなたがベットしていた場合、代わりに」の判定が`^ベット―`より先にあり、ベット選択メカニクス（本来`BET_MECHANIC`で①②③④選択UIを提示）を持つカード全件が無条件no-opの`BET_ALTERNATIVE`に誤分類されていた。判定順を修正し、条件節を持たない`WX18-003`/`WX18-005`は`BET_MECHANIC`に直して動作確認済み（✅）。`WDK06-R08`（参照シグニとのパワー比較ターゲティングが未実装）と`SPK16-13E`（#13と同じターン追跡フラグが必要）は機構不足のため保留（⬜）。なお`SEQUENCE`内に`BET_ALTERNATIVE`が埋め込まれている既存カードが他に約14枚あり、ベット強化部分のみ無効化されている可能性がある（未調査・別件） |
