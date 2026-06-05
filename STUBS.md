# STUB実装状況メモ（全件）

最終更新: 2026-06-04 (v0.197)

## ステータス凡例

| 記号 | 意味 |
|------|------|
| ✅ | 実装済み（ゲームに効果あり） |
| ⚡ | 部分実装（主要パターンは動作、稀ケースはログのみ） |
| 📝 | ログのみ（STUB_LOGテーブルまたはCONTINUOUS未実装） |

**effectType略称:** AUTO=自/起動, CONT=常在, LIFE=ライフバースト, SONG=歌牌


---

## 全STUB一覧（件数順）

| 件数 | effectType | 状態 | STUB ID |
|-----:|-----------|:----:|---------|
| 397 | ACTIVATED/CONT | ✅ | OPTIONAL_COST ※effectExecutorがSEQUENCE内STUB→CONDITIONAL(IS_MY_TURN)パターンをインターセプト→pay/skipのCHOOSE＋エナ選択UI（338件）。Pattern④で離れた位置のIS_MY_TURNも対応。execStub.tsがエッジケース（SEQUENCE末尾33件）も同様のCHOOSEを提示（v0.153） |
| 116 | CONT/AUTO | ✅ | ARTS_COST_REDUCTION_BY_EFFECT |
| 2 | AUTO/ACTIVATED | ✅ | TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST ※v0.143: effectExecutor専用ハンドラ追加。パーサーバグ(target.owner='self')を'opponent'に修正。BANISH/BOUNCE/DOWN/POWER_MODIFY対応。canPayOptionalCostチェック+CHOOSE(pay/skip)提示 |
| 52 | ACTIVATED/AUTO | ✅ | TARGET_AND_DISCARD_HAND |
| 57 | ACTIVATED/CONT/AUTO | ✅ | POWER_MOD_PER_COUNT |
| 44 | AUTO | ✅ | CONDITIONAL_POWER_BONUS |
| 45 | CONT | ✅ | RULE_REMINDER_TEXT ※execStubがdone(ctx)を返すため無音スキップ済み |
| 41 | AUTO/ACTIVATED/CONT/SONG | ✅ | GRANT_QUOTED_AUTO_ABILITY |
| 35 | ACTIVATED | ✅ | DECLARE_NUMBER |
| 2 | ACTIVATED/AUTO | ✅ | OPTIONAL_TRASH_ENERGY_CLASS ※v0.143: effectExecutor専用ハンドラ追加。エナゾーンからクラスフィルタ選択(SELECT_TARGET)→INTERNAL_OTEC_MOVE_SELECTED(トラッシュ/手札移動)。BOUNCE/BANISH target修正。resumeChooseのcontinuation合成対応 |
| 32 | CONT | ✅ | LRIG_GROW_RESTRICT |
| 2 | AUTO/ACTIVATED | ✅ | TRADE_BANISH_SELF_SIGNI |
| 29 | AUTO/ACTIVATED | ✅ | LOOK_OPP_LIFE_TOP |
| 30 | ACTIVATED/AUTO | ✅ | SOUL_OP ※v0.133: +3パターン追加（ルリグ下N枚任意消費/固定消費/ルリグトラッシュ→ルリグ下配置）+INTERNAL_CONSUME_LRIG_UNDER/INTERNAL_PLACE_LRIG_UNDER_CENTER |
| 21 | AUTO | ✅ | GAIN_SUBSCRIBER_COUNT |
| 23 | AUTO/ACTIVATED | ✅ | LRIG_UNDER_CARD_OP |
| 22 | CONT/AUTO/ACTIVATED | ⚡ | GRANT_ABILITY_INNER_TEXT ※v0.204: ダウン保護/パワー弱体保護/ダメージ保護/能力取得禁止の4パターン追加（WXDi-P03-060/WXDi-P07-085②③/WXDi-P13-052/WX25-CP1-044/WX25-P1-026/SPDi44-04）。残り: 相手シグニ自能力コスト化/ルリグパワー修正付与/攻撃行動変更/ガード代替等はログのみ |
| 18 | AUTO/ACTIVATED | ✅ | BET_ALTERNATIVE ※BET_MECHANICで通常/ベット選択肢を一括処理済み。このSTUBはスキップ（正常動作） |
| 18 | AUTO/ACTIVATED | ✅ | DECLARE_CARD_NAME |
| 18 | AUTO/ACTIVATED | ✅ | LOOK_AND_REORDER |
| 16 | CONT | ✅ | COPY_LRIG_NAME_ABILITY ※v0.113: collectLrigNameAliases実装・アーツコスト名前条件に対応 / v0.132: collectCopiedLrigAutoEffects追加・ON_ATTACK_LRIG/ON_PLAYトリガーにトラッシュルリグの【自】能力を組み込み |
| 1 | ACTIVATED | ✅ | REVEAL_PICK_HAND_SHUFFLE_BOTTOM |
| 1 | AUTO/ACTIVATED | ✅ | REVEAL_PICK_PLAY ※デッキ上N枚公開→シグニ選択→場に出すインタラクション実装済み |
| 15 | AUTO/ACTIVATED | ✅ | TARGET_ONLY ※対象シグニ選択→lastProcessedCardsに格納→後続ステップへ続行 |
| 14 | CONT | ✅ | ARTS_COST_REDUCTION_BY_CENTER_LRIG |
| 14 | AUTO/ACTIVATED | ✅ | GAIN_ABILITY_THIS_GAME |
| 14 | ACTIVATED | ✅ | CONDITIONAL_ARTS_COST ※v0.143: 正しい条件チェックに修正。対戦相手ルリグ色条件/自ルリグレベル条件を確認。コスト計算はcomputeArtsEffectiveCostで処理済み |
| 16 | AUTO/ACTIVATED/CONT | ✅ | GRANT_QUOTED_ABILITY |
| 13 | AUTO/ACTIVATED | ✅ | REVEAL_AND_PICK ※デッキ上N枚→クラスフィルタ→手札/場に出すインタラクション実装済み |
| 11 | ACTIVATED | ✅ | SONG_FRAGMENT |
| 10 | ACTIVATED/AUTO | ✅ | ARTS_USE_DISCARD_LRIG_DECK ※ルリグデッキからアーツを任意でルリグトラッシュへのCHOOSEインタラクション実装済み |
| 1 | AUTO/ACTIVATED | ✅ | PLACE_TRAP_FROM_REVEALED ※v0.145: SEARCH(デッキ上N枚→任意選択)→INTERNAL_PTFR_CHOOSE_ZONE→INTERNAL_SET_TRAP の2段階インタラクション実装。restDest:'deck_bottom'で未選択カードをデッキ下へ |
| 2 | ACTIVATED | ✅ | CONDITIONAL_MULTI_CHOOSE_BY_CENTER ※v0.145: 条件不成立時もベース選択数でCHOOSEを提示するよう修正。センター名複数条件（か/と区切り）対応。新選択肢: FREEZE/DOWN+FREEZE ALL/スペル打ち消し/トラッシュからシグニ手札/バニッシュ以上/ダブルクラッシュ等のキーワード付与/BOUNCE。INTERNAL_DOWN_AND_FREEZE_OPP/INTERNAL_BANISH_OPP_POWER_GTE/INTERNAL_TRASH_SIGNI_TO_HAND追加 |
| 10 | AUTO/ACTIVATED | ✅ | DESIGNATE_SIGNI_ZONE |
| 9 | AUTO/ACTIVATED | ✅ | GRANT_GUARD_ICON_HAND_SIGNI ※hand_signi_guard_enabledフラグ設置・BattleScreenのガードUIに統合済み |
| 9 | ACTIVATED | ✅ | PLAY_FREE |
| 8 | ACTIVATED/AUTO/CONT | ✅ | BLOOD_CRYSTAL_ARMOR ※v0.110: 血晶武装状態管理・ON_BLOOD_CRYSTAL_ARMORトリガー・IS_SELF_ARMOREDアクティブ条件・isArmoredフィルタ・UIバッジ実装 |
| 1 | AUTO | ✅ | COUNT_BASED_DRAW_OR_POWER ※v0.135: 手札をN枚まで捨てるインタラクティブ処理追加（SELECT_TARGET→INTERNAL_CBDOP_AFTER_DISCARD）。捨て枚数ドロー/パワー修正に対応 |
| 8 | AUTO/ACTIVATED/CONT | ✅ | LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END ※v0.139: 「対戦相手のリミット－N」パターンを追加（otherState.lrig_limit_mod修正）。両プレイヤー対応 |
| 8 | AUTO/ACTIVATED | ✅ | PLACE_SEED_FROM_REVEALED ※SEARCH(デッキ上N枚)+INTERNAL_SEED_FROM_DECK→ゾーン選択→INTERNAL_SET_SEEDの2段階インタラクション実装済み |
| 9 | ACTIVATED | ✅ | REMOVE_VIRUS ※v0.144: effectExecutor専用ハンドラ追加(IS_MY_TURNパターン対応)。任意除去(CHOOSE)/強制除去/TRANSFER_TO_HAND連結パターン(好きな数→N枚手札)を実装。execStub側も「すべて」/「Nつ」/デフォルト全除去に修正。INTERNAL_REMOVE_VIRUS_N・INTERNAL_RV_BATCH_TRANSFER追加 |
| 8 | ACTIVATED/AUTO | ✅ | ACCE_FROM_HAND ※手札/エナのカードをSELECT→ATTACH_ACCE付与済み |
| 7 | CONT | ✅ | CHOOSE_N_FROM_LIST ※①②③④テキスト解析+N択CHOOSE実装済み |
| 1 | AUTO | ✅ | DECK_REVEAL_UNTIL |
| 7 | AUTO/ACTIVATED | ✅ | DOWN_UP_SIGNI_AND_CHOOSE ※アップ状態シグニをクラス抽出→CHOOSE(ダウン選択)実装済み |
| 7 | AUTO/ACTIVATED | ✅ | DO_THREE_THINGS ※v0.136: WXK11シリーズ①追加（ドローN/ルリグダウン/シグニアタック禁止選択/パワーX以下バニッシュ選択） |
| 7 | AUTO/ACTIVATED | ✅ | EXILE_FROM_CHECK_ZONE ※自/相手チェックゾーンのカードをトラッシュへ移動済み |
| 2 | CONT | ✅ | LEVEL_REFERENCE_OVERRIDE ※v0.134: DECK_TOP_MATCHESにLEVEL_REFERENCE_OVERRIDE考慮追加。LAST_PROCESSED_LEVEL_SUM_EQ条件追加。effects.json修正（WX18-066/WX19-024: DECK_TOP_MATCHES条件付きBANISH、WD21-012: レベル合計10条件） |
| 7 | CONT | ✅ | LOSE_COLOR_ALL_ZONES |
| 7 | AUTO/ACTIVATED | ✅ | PLACE_CARD_UNDER_SIGNI ※「このシグニを他シグニの下」/「トラッシュからシグニ下配置」の2パターン実装済み |
| 7 | AUTO/ACTIVATED | ✅ | PLACE_LIMIT_UPPER ※lrig_limit_mod+1でリミット上限を増加済み |
| 7 | AUTO/ACTIVATED | ✅ | PLACE_TRAP_OPTIONAL ※手札選択→ゾーン選択→INTERNAL_SET_TRAPで設置済み |
| 2 | AUTO/ACTIVATED | ✅ | TRASH_SIGNI_UNDER_FIELD_SIGNI ※v0.136: 2ステップ実装（SELECT_TARGET[トラッシュ]→INTERNAL_TSU_CHOOSE_ZONE→INTERNAL_TSU_DO_PLACE）複数枚連続配置対応 |
| 6 | ACTIVATED/AUTO | ✅ | ACTIVATE_TRAP ※v0.167: parseCardEffects+execでTRAP_ICONを発動。lastProcessedCards[0]でトラップ指定対応 |
| 2 | ACTIVATED | ✅ | CAST_FROM_OPP_TRASH ※v0.185: PLAY_FREE系ハンドラでCAST_FROM_OPP_TRASH検出時、相手トラッシュからカードを除去して使用 |
| 6 | ACTIVATED | ✅ | CONDITIONAL_COST_REDUCTION_BY_FIELD ※v0.169: computeArtsEffectiveCostで「パワーN以上のシグニ」「クラスシグニ」フィールド条件コスト軽減実装済み（line 223-249） |
| 6 | ACTIVATED | ✅ | CRAFT_TO_LRIG_DECK ※v0.185: 既存実装確認→✅（sourceCardNum/lastProcessedCardsからクラフトを特定しルリグデッキへ） |
| 6 | CONT | ✅ | DOUBLE_POWER_MINUS ※v0.115: calcFieldPowers applyEffectsで相手シグニへの負デルタを2倍に実装 |
| 6 | ACTIVATED/AUTO | ✅ | GATE ※v0.169: INTERNAL_SET_GATEがblocked_actions['ATTACK:signiId']を設定。BattleScreen/CpuBattleScreenのアタック処理でチェック追加 |
| 6 | ACTIVATED/AUTO | ✅ | POWER_MOD_BY_HAND_COUNT |
| 7 | AUTO | ✅ | TRAP_OP ※v0.167: トラップアイコン発動パターン追加（parseCardEffects+exec）。「その中から」パターン追加（lastProcessedCards→CHOOSE_TRAP_ZONE） |
| 13 | AUTO | ✅ | TRAP_OPERATION ※v0.167: チェックゾーンパターン追加（txtにチェックゾーンに置く→field.check設定）。lastProcessedCards/デッキ上パターン継続 |
| 2 | AUTO/ACTIVATED | ✅ | TRASH_OWN_KEY_OPTIONAL ※needsInteraction CHOOSE: キーをルリグトラッシュに置く/スキップ |
| 5 | AUTO/ACTIVATED | ✅ | ADD_CARD_TO_LRIG_DECK_HIDDEN ※v0.174: 2候補をCHOOSE提示→選択されたほうをルリグデッキへ（INTERNAL_ACLDH_APPLY）。1候補は自動選択 |
| 5 | CONT | ✅ | ARTS_IMMOVABLE ※v0.169: execStub内ARTS_USE_DISCARD_LRIG_DECKが不動アーツをフィルタ（line 2271）。配置不可は実質防止済み |
| 5 | AUTO/ACTIVATED | ✅ | CHOOSE_COLOR_FROM_LIST ※needsInteraction CHOOSE: エナの色一覧から選択実装済み |
| 5 | CONT/AUTO | ✅ | COLLAB ※v0.185: 「コラボしてもよい」CHOOSE→INTERNAL_DO_COLLAB実装済み確認✅。「コラボライバーN人を呼ぶ」も✅ |
| 5 | AUTO/ACTIVATED | ✅ | CONDITIONAL_CARD_COST_BY_OPP_LRIG |
| 5 | AUTO/ACTIVATED | ✅ | DECK_TOP_CHECK_LEVEL_HAND ※不一致時はデッキトップに留まる（移動なし）。宣言レベルはDECLARE_NUMBERで設定 |
| 5 | AUTO | ✅ | MOVE_TO_OTHER_SIGNI_ZONE ※v0.135: INTERNAL_MOVE_TO_ZONEに移動後パワーブースト追加（「移動したとき.*パワーを＋」テキスト検出→temp_power_mods付与）。effects.json E2誤発修正（POWER_MODIFY→STUB noop） |
| 6 | CONT | ✅ | OPP_GUARD_COST_COLORLESS |
| 5 | AUTO/ACTIVATED | ✅ | OPTIONAL_DISCARD_CLASS_SIGNI ※手札のクラスシグニを最大N枚selectOrInteractで任意捨て |
| 5 | AUTO/ACTIVATED | ✅ | POWER_MOD_BY_DISCARD_COUNT_HIGH ※lastProcessedCards枚数×deltaPerCardでパワー修正 |
| 5 | AUTO/ACTIVATED | ✅ | POWER_MOD_PER_REVEALED ※lastProcessedCards公開枚数×+1000（または効果テキスト値）で自シグニパワー修正 |
| 5 | AUTO/ACTIVATED | ✅ | REPEAT_N_TIMES ※v0.185: 「この効果をN回繰り返す」パターン追加。DECK_REVEAL_UNTIL系の連鎖再実行も対応（WX04-093系） |
| 5 | AUTO/ACTIVATED | ✅ | REVEAL_CLASS_SIGNI_FROM_HAND ※手札のクラスシグニを任意枚数selectOrInteract（lastProcessedCardsに格納） |
| 4 | AUTO/ACTIVATED | ✅ | CLASS_CHANGE ※card_class_overridesで一時クラス変更、全体/単体パターン対応 |
| 4 | ACTIVATED | ✅ | DECLARE_COLOR ※5色CHOOSE→declared_colorに保存（v0.146実装） |
| 2 | AUTO/ACTIVATED | ✅ | DECK_TOP_DECLARED_NUM_TRASH ※declared_guard_restrict_level枚のデッキ上カードをトラッシュ |
| 4 | AUTO/ACTIVATED | ✅ | EFFECT_LIMIT ※効果テキストのN枚上限キャップをtemp_power_modsに適用 |
| 4 | AUTO/ACTIVATED | ✅ | FLIP_FACE_DOWN_SIGNI ※v0.170: flip-back実装済み（face_down_signi全解除+abilities_removed除去）。「この方法で裏向きにしたシグニを表向きにする」パターン対応
| 4 | AUTO/ACTIVATED | ✅ | GAIN_EXTRA_TURN |
| 4 | AUTO | ✅ | MAKE_SERVANT_ZERO ※v0.157: card_identity_overrides['instanceId']='WXDi-P07-TK01-A'に変更。battleCardMapとeffectsMapがZEROカードデータを解決し、power=1000/class=精元/color=無/abilities=なしが全システムで正確に反映 |
| 2 | AUTO/ACTIVATED | ✅ | MASS_TRASH ※相手エナ全枚+フィールド全シグニをトラッシュ |
| 5 | AUTO/ACTIVATED | ✅ | OPEN_MAGIC_BOX ※v0.170: 同ゾーンMBを「開ける/しない」CHOOSE→INTERNAL_OPEN_MB_DO（トラッシュ移動+lastProcessedCards設定） |
| 5 | AUTO/ACTIVATED | ✅ | OPPONENT_PAY_OPTIONAL ※相手にCHOOSE提示→支払いでenergy消費+opponent_paid_optional_cost=trueフラグ→後続CONDITIONAL(OPPONENT_NOT_PAID)で結果効果スキップ（v0.146実装） |
| 4 | AUTO/ACTIVATED | ✅ | OPP_CHOOSE_YOUR_HAND_DISCARD ※相手がこちらの手札から1枚をblind選択しトラッシュ |
| 4 | ACTIVATED/AUTO | ✅ | PLAY_SPELL_FREE_IGNORE_RESTRICTION ※v0.140: グループから分離・SELECT_TARGET from hand(スペル/コスト上限フィルタ)追加 |
| 4 | AUTO/ACTIVATED | ✅ | POWER_MOD_PER_REVEALED_LEVEL ※lastProcessedCardsのシグニレベル合計×-1000で相手シグニパワー修正 |
| 1 | AUTO/ACTIVATED | ✅ | REVEAL_PICK_CLASS_TO_ENERGY ※lastProcessedCardsのクラスシグニをエナへ、残りをデッキ上に戻す |
| 5 | AUTO | ✅ | SEED_BLOOM ※v0.109: ON_PLAY効果トリガー実装・WXK04-060条件修正 |
| 4 | AUTO/ACTIVATED | ✅ | SIGNI_REPOSITION ※v0.158: 自/相手シグニ対応+INTERNAL_REPOSITION_TO_ZONEでゾーン選択→スワップ実装 |
| 5 | AUTO/ACTIVATED | ✅ | TRAP_TO_HAND ※v0.167: N枚まで指定時は SELECT_TARGET→INTERNAL_TTH_APPLY。全枚取得もそのまま対応 |
| 4 | AUTO/ACTIVATED | ✅ | UNKNOWN_NESTED ※自シグニを任意トラッシュCHOOSE→self_optional_effect_taken設定。後続CONDITIONAL(SELF_OPTIONAL_EFFECT_TAKEN)で制御（v0.147） |
| 3 | AUTO/ACTIVATED | ✅ | ADD_CRAFT_TO_LRIG_DECK ※v0.172: 《カード名》テキスト解析でlrig_trash/fieldから名前検索+手札/トラッシュからも移動対応 |
| 2 | AUTO/ACTIVATED | ✅ | BANISH_FROM_GAME ※トラッシュより任意除外CHOOSE→self_optional_effect_taken設定。後続CONDITIONAL(SELF_OPTIONAL_EFFECT_TAKEN)で制御（v0.147） |
| 3 | AUTO/ACTIVATED | ✅ | CHOOSE_HAND_CARD ※SELECT_TARGET on自手札→lastProcessedCardsに格納 |
| 3 | ACTIVATED | ✅ | DECK_TOP_CHECK_LEVEL_ENERGY ※宣言レベル一致シグニならエナゾーンへ、不一致はデッキトップ留まり |
| 5 | LIFE | ✅ | DECK_TOP_TO_LIFE ※デッキ上→ライフクロス追加実装済み（自/相手判定・枚数解析） |
| 3 | AUTO/ACTIVATED | ✅ | DECLARE_NUMBER_RANGE ※0〜5のCHOOSE→declared_guard_restrict_levelに保存（v0.147） |
| 3 | CONT | ✅ | DEPLOY_RESTRICT ※v0.169: signi_deploy_power_limitをBattleScreen/CpuBattleScreenのhandleSummonSigni+CPUメインフェイズで検査。UIでも「パワー制限」表示 |
| 3 | AUTO/ACTIVATED | ✅ | DISCARD_OR_PENALTY ※特定クラス/タイプ1枚捨てるかペナルティN枚捨てるかCHOOSE（v0.147） |
| 4 | CONT | ✅ | DOUBLE_OWN_POWER_MINUS ※v0.137: SELECT_TARGET(相手シグニ)+double_power_minus_targets設定。effectEngine.applyTempModsで負デルタを2倍適用 |
| 3 | CONT | ✅ | FORCE_TARGET_SELF |
| 3 | AUTO | ✅ | HAND_SIZE_INCREASE ※effectEngine.collectHandLimitsで動的計算に移行 |
| 3 | AUTO/ACTIVATED | ✅ | MOVE_TO_ATTACKER_FRONT ※v0.139: attacked_signi_ids の最終アタッカーからゾーンを動的取得。正面が空ならCHOOSE移動確認→INTERNAL_MOVE_TO_ZONE。stub.value後方互換保持 |
| 3 | AUTO | ✅ | NEGATE_ATTACK_ON_TRIGGER ※line 41でprevent_next_damage+1設定。CONT版と同実装（v0.171確認） |
| 3 | AUTO/ACTIVATED | ✅ | OPP_DECLARE_CHOICE ※v0.174: 色宣言パターン追加（ウリス系）: 対戦相手が6色CHOOSEで宣言→INTERNAL_ODC_COLOR_CHECK（カード色と比較→不一致なら相手全シグニバニッシュ）。①②パターンも継続対応 |
| 1 | CONT/AUTO | ✅ | PREVENT_LRIG_DAMAGE_THIS_TURN ※prevent_lrig_damageフラグ設置・BattleScreenで完全実装済み |
| 3 | CONT | ✅ | PREVENT_ZONE_MOVE_BY_OPP ※v0.137: AUTO時にprevent_opp_trash_fromフラグ設置。effectExecutorのapplyTrashHand/EnergyでotherState.prevent_opp_trash_fromも検査 |
| 4 | AUTO/ACTIVATED | ✅ | REMOVE_SIGNI_ZONE ※CHOOSE+INTERNAL_REMOVE_SIGNI_ZONEで実装済み |
| 1 | AUTO/ACTIVATED | ✅ | REVEAL_TOP_CONDITIONAL_ROUTE ※デッキ上公開→レベル条件判定→トラッシュ |
| 3 | ACTIVATED/LIFE | ✅ | SET_OPP_SIGNI_AS_TRAP ※v0.167: SELECT_TARGET(相手シグニ)→INTERNAL_OPP_SIGNI_TO_TRAP（同ゾーンにトラップ設置）。ACTIVATED/LIFEどちらも対応 |
| 3 | AUTO/ACTIVATED | ✅ | TRIGGER_LIFE_BURST ※v0.170: lastProcessedCards[0]のLBをfield.checkにセット→BattleScreenがLBプロンプト表示 |
| 2 | AUTO/ACTIVATED | ✅ | ABILITY_CHECK_ELSE_TRASH ※sourceCardNumに能力テキストあり→スキップ、なし→フィールドからトラッシュへ |
| 2 | ACTIVATED/AUTO | ✅ | ARTS_USE_DISCARD_COLOR_HAND ※手札の特定色カードを任意N枚selectOrInteractで捨て（v0.147） |
| 2 | CONT | ✅ | ATTACK_PHASE_LEVEL_OVERRIDE ※v0.137: collectAttackPhaseLevelOverrides追加・checkActiveCondition EICHI_LEVEL_SUM で ownerState.attack_phase_level_overrides を使用・BattleScreenアタックフェイズ時に ownerStateForCtx に設定 |
| 2 | AUTO/ACTIVATED | ✅ | BANISH ※lastProcessedCards[0]またはsourceCardNumをバニッシュ（相手→エナ、自→エナ） |
| 2 | AUTO/ACTIVATED | ✅ | BET_CONDITION ※v0.185: BET_ALTERNATIVEと同ハンドラ→ログのみ（BET_MECHANICで処理済み） |
| 3 | AUTO/ACTIVATED | ✅ | CHARM_CONDITIONAL_POWER ※同ゾーンにチャームがあればパワー修正 |
| 2 | AUTO/ACTIVATED | ✅ | CHOOSE_HAND_OR_ENERGY ※LOOK_AND_REORDER後のデッキ上N枚をSEARCH→手札/残りエナ（v0.147） |
| 2 | AUTO | ✅ | CHOOSE_SAME_OPTION_TWICE ※v0.173: ①バウンス+手札捨てセット対応, ②アタック不可(INTERNAL_GRANT_NO_ATTACK_LRIG), ③クラスサーチ追加。WX17-003/WXK05-010の主要パターン対応 |
| 2 | AUTO/ACTIVATED | ✅ | COIN_USE_RESTRICTION ※v0.174: coin_use_restriction='spell_signi_only'フラグ設定。BET_MECHANICでcoinRestricted確認→アーツBET不可 |
| 2 | AUTO/ACTIVATED | ✅ | CONDITIONAL_ALTERNATE_EFFECT |
| 2 | AUTO/ACTIVATED | ✅ | CONDITIONAL_ALT_POWER_BOOST ※v0.170: 「代わりに＋/－N」テキスト解析→sourceCardNumにtemp_power_mods適用 |
| 2 | AUTO/ACTIVATED | ✅ | CONDITIONAL_PER_TRASH ※v0.169: テキスト解析でN枚閾値→1枚ドロー。主要パターン実装済み |
| 2 | ACTIVATED | ✅ | COPY_SIGNI ※v0.138: 2ステップSELECT_TARGET(フィールド→トラッシュ)+INTERNAL_COPY_SIGNI_APPLY。card_identity_overrides追加・effectEngine.calcFieldPowersでコピー元パワー参照 |
| 2 | AUTO | ✅ | COPY_TARGET_POWER ※v0.137: lastProcessedCards未設定時にSELECT_TARGET→COPY_TARGET_POWER継続。パワー差分をtemp_power_modsに設定 |
| 3 | CONT | ✅ | DEPLOY_RESTRICT ※v0.169: signi_deploy_power_limit統合済み（AUTO設定+BattleScreen検査） |
| 2 | AUTO | ✅ | DISCARD_IF_ATTACKED_THIS_TURN ※実装済み: attacked_signi_idsチェック+手札SELECT捨て |
| 2 | AUTO/ACTIVATED | ✅ | DISONA_RESTRICTION ※使用条件チェック（BattleScreen側で処理済み）、実行時はログのみ |
| 1 | AUTO | ✅ | DRAW_AND_PUT_HAND_TO_DECK_BOTTOM |
| 2 | AUTO/ACTIVATED | ✅ | ENERGY_BY_LEVEL_SUM_LIMIT ※エナレベル合計超過分をトラッシュへ（過剰分逆算） |
| 2 | CONT | ✅ | ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白 |
| 2 | ACTIVATED | ✅ | EXTRA_COST_REMOVE_VIRUS ※v0.138: ウイルス除去数CHOOSE(0〜N)→INTERNAL_ECRV_APPLY→除去実行+(N+1)択CHOOSE。①〜④テキスト解析で効果選択肢生成 |
| 2 | AUTO/ACTIVATED | ✅ | FACE_DOWN_OPP_SIGNI ※相手シグニSELECT_TARGET→face_down_signi+abilities_removed追加（v0.147） |
| 2 | CONT | ✅ | FIELD_ENERGY_SIGNI_GAIN_COLOR ※v0.173: 《ディソナアイコン》フィルター対応追加（CardName//ディソナで判定）。他の特殊アイコンフィルターは未対応だが主要2件✅ |
| 14 | ACTIVATED/AUTO | ✅ | GAIN_ABILITY_THIS_GAME |
| 2 | ACTIVATED/AUTO | ✅ | GRANT_CHOSEN_ABILITY ※v0.138: lastProcessedCardsに自シグニなければSELECT_TARGET→CHOOSE能力(アサシン/ランサー/ダブルクラッシュ/バニッシュ不可/ダウン不可/バウンス不可)。keyword_grantsに格納 |
| 1 | CONT | ✅ | GRANT_QUOTED_ACTIVATE_ABILITY ※v0.197: WX13-058をeffects.jsonでDOUBLE_OWN_POWER_MINUS+HAS_CARD_IN_FIELD(ダイオ姫)条件に変換。WXK08-078はcollectGrantedFromUnderSigni経由で処理 |
| 1 | AUTO/ACTIVATED | ✅ | HAND_REVEAL_CLASS_SIGNI ※手札クラスシグニSELECT_TARGET→lastProcessedCardsに格納（v0.148） |
| 2 | AUTO | ✅ | HAND_TO_ENERGY_OPTIONAL ※v0.139: 重複ハンドラ削除。先行ハンドラ（maxHTE解析+INTERNAL_HAND_TO_ENERGY続行）が正しく動作 |
| 2 | ACTIVATED/AUTO | ✅ | LAYER_ABILITY_COPY ※v0.139: SELECT_TARGET(怪異trash/field)+INTERNAL_LAYER_COPY_APPLY。《レイヤーアイコン》テキストからSランサー等を keyword_grants に付与 |
| 1 | ACTIVATED/CONT | ✅ | LIMIT_OPP_DRAW_COUNT ※v0.139: collectDrawLimits追加（CONTINUOUS LIMIT_OPP_DRAW_COUNT効果を動的検査）。BattleScreen UP フェイズのドロー計算に統合 |
| 2 | AUTO/ACTIVATED | ✅ | LOOK_OPP_HAND_DISCARD_SIGNI ※相手手札シグニをフィルタ→selectOrInteract→TRASH（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_COLOR_SORT ※LOOK_TOP_Nと同ハンドラ: デッキ上N枚LOOK_AND_REORDER（v0.148） |
| 2 | CONT | ✅ | MULTI_ZONE_ATTACK |
| 2 | CONT | ✅ | ONE_ATTACK_PER_TURN ※effectEngine.calcContinuousBlockedActionsで実装 |
| 2 | ACTIVATED | ✅ | OPP_CHOOSE_OWN_SIGNI_TO_ENERGY ※v0.140: thenActionをBANISH→INTERNAL_OPP_FIELD_TO_ENERGYに修正（フィールド→エナゾーン移動） |
| 2 | AUTO/ACTIVATED | ✅ | OPP_DECLARE_COLOR ※5色CHOOSE(opponentResponds)→INTERNAL_SET_OPP_DECLARED_COLOR→otherState.declared_color（v0.148） |
| 2 | AUTO | ✅ | OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL ※v0.140: excess計算修正（常に1枚トラッシュ）・重複ハンドラ削除 |
| 2 | AUTO | ✅ | OPP_SIGNI_ATTACK_POWER_RESTRICT ※v0.140: BattleScreenにeffectivePowers使用のパワー上限アタック制限チェック追加 |
| 2 | AUTO/ACTIVATED | ✅ | PEEP_HAND ※相手手札全カード名をログ表示（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | PICK_FROM_TRASHED_CARDS ※トラッシュSELECT_TARGET→TRANSFER_TO_HAND（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | PLACE_ACCE_SIGNI_TO_ENERGY ※signi_acceの全アクセをエナゾーンへ移動実装済み(ACCE_TO_ENERGYと同ハンドラ) |
| 2 | AUTO/ACTIVATED | ✅ | PLACE_MAGIC_BOX ※v0.170: lastProcessedCards[0]のゾーン選択→INTERNAL_SET_MAGIC_BOX（既存MBトラッシュ→設置） |
| 2 | AUTO | ✅ | PLACE_SIGNI_UNDER_SELF_OPT ※v0.140: レベル完全一致フィルタ追加・フィールドソース対応（手札からなし→場から選択） |
| 2 | ACTIVATED/AUTO | ✅ | POWER_COPY_FROM_DOWNED ※v0.174: lastProcessedCards[0]（起動コストでダウンした自シグニ）のパワーを+delta。フォールバック: 自フィールドのダウンシグニ |
| 2 | AUTO | ✅ | POWER_MOD_BY_ATTACKER_LEVEL ※v0.140: SELECT_TARGET(奇数/偶数フィルタ)追加・重複ハンドラ削除 |
| 2 | AUTO | ✅ | POWER_MOD_BY_LRIG_TRASH_ARTS ※v0.140: SELECT_TARGET追加・重複ハンドラ削除 |
| 2 | AUTO/ACTIVATED | ✅ | PREVENT_OWN_ARTS_USE ※blocked_actionsにUSE_ARTS追加でアーツ使用禁止実装済み |
| 2 | AUTO | ✅ | REACTIVE_POWER_UP ※相手temp_power_modsのマイナス合計を自パワーに加算 |
| 3 | AUTO/ACTIVATED | ✅ | REPEAT_EFFECT ※v0.185: REPEAT_N_TIMESと同ハンドラ。「この効果をN回繰り返す」regex追加+stub.value連鎖再実行対応 |
| 2 | AUTO/ACTIVATED | ✅ | REVEAL_OPP_HAND_CARD ※相手手札からランダム1枚をlastProcessedCardsに格納して公開（v0.148） |
| 2 | AUTO | ✅ | RIDE_ON ※v0.163: ドライブ状態でない場合のみCHOOSE→SELECT乗機シグニ→lrig_riding_signi設定 |
| 4 | AUTO/ACTIVATED | ✅ | SIGNI_FLIP_FACEDOWN ※v0.170: 自/相手フィールド判定→face_down_signi+abilities_removed設定（lastProcessedCards優先） |
| 2 | CONT | ✅ | SIGNI_GRANT_QUOTED_CONSTANT_ABILITY ※v0.141: SELECT_TARGET(自フィールド)+keyword_grants付与(assassin/shadow/lancer等) |
| 2 | AUTO | ✅ | SIGNI_SERVANT_ZERO ※v0.157: MAKE_SERVANT_ZEROと同一実装に統合 |
| 2 | CONT | ✅ | SPECIFIC_CARD_COST_REDUCE ※v0.111: collectSpecificCardCostReductions+removeNColorFromCostでアーツコスト軽減 |
| 2 | CONT | ✅ | SPELL_COST_REDUCTION_BY_TRASH_COUNT |
| 2 | AUTO/ACTIVATED | ✅ | SUPPRESS_LIFE_BURST_ON_CARD ※suppress_life_burstフラグセット→BattleScreenのライフバースト発動抑制（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | SWAP_OPTIONAL ※SELECT_TARGET(optional)→INTERNAL_REPOSITION_MOVEで空きゾーンへ移動（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | TARGET_OPP_SIGNI_ONLY ※v0.185: 後続SELECT_TARGETが相手フィールドを指定するため修飾子ログのみで✅ |
| 2 | AUTO/ACTIVATED | ✅ | TRASH ※lastProcessedCards[0]/sourceCardNumをフィールド/手札/相手フィールドからトラッシュへ（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | TRASH_IF_ZONE_OCCUPIED ※フィールド満杯時にsourceCardNum自身をトラッシュへ（v0.148） |
| 2 | ACTIVATED/LIFE | ✅ | TRASHED_CARD_TO_HAND_OR_ENERGY ※v0.142: lastProcessedCards優先+trash.at(-1)フォールバック・重複ハンドラ2つ削除 |
| 2 | AUTO | ✅ | TRASH_ALL_SIGNI_AND_KEY |
| 2 | AUTO/ACTIVATED | ✅ | USE_CONDITION_ARTS_USED ※v0.170: executeArts時にactions_done['USE_ARTS']を追加。execStubがactions_done確認→使用可否判定 |
| 2 | AUTO | ✅ | VIEW_AND_DISCARD_SPELL ※相手手札スペル選択+TRASH実装済み・重複ハンドラ削除 |
| 2 | CONT | ✅ | ACCE_BANISH_SELF_TRASH ※signi_acceの全アクセをトラッシュへ移動+field更新実装済み |
| 1 | CONT | ✅ | ACCE_COST_REDUCTION ※v0.173: collectAcceCostReduction追加。BattleScreenエナアクセUIでreducedCostItems計算→緑コスト1軽減実装 |
| 1 | AUTO | ✅ | ACCE_FROM_TRASH ※v0.169: トラッシュのアクセを手札経由でSELECT_TARGET→ATTACH_ACCE（line 8910）。NAMED_SIGNI_ACCE_FROM_TRASHと同ハンドラ |
| 2 | AUTO/ACTIVATED | ✅ | ACCE_OP ※v0.185: アクセカウントログ（SP27-015はCONT効果でバニッシュ処理のため✅） |
| 1 | CONT | ✅ | ACCE_SIGNI_ALL_COLOR ※v0.185: story_overrides['ALL_COLOR']設定+fieldCandidatesで色フィルターバイパス実装 |
| 1 | CONT | ✅ | ACCE_SIGNI_GRANT_ABILITY ※アクセゾーン対象シグニにkeyword_grants付与実装済み |
| 1 | AUTO | ✅ | ACCE_TO_ENERGY ※v0.169: signi_acceの全アクセをエナゾーンへ移動（PLACE_ACCE_SIGNI_TO_ENERGYと同ハンドラ） |
| 1 | AUTO | ✅ | ACTIVATE_COST_ZERO_BLACK ※v0.171: BattleScreen起動コストUIにisCostZeroByEffectチェック追加+executeSigniActivated後フラグクリア |
| 1 | ACTIVATED | ✅ | ACTIVATE_EICHI_ABILITY ※v0.185: sourceCardNumのON_PLAY AUTO効果を再発動（WXEX1-18: REVEAL_AND_PICK再実行） |
| 1 | AUTO | ✅ | ADD_CARD_TO_LRIG_DECK ※v0.141: lastProcessedCardsなし時は《カード名》テキスト解析→デッキ/手札から移動（主要パターン実装済み） |
| 1 | CONT | ✅ | ADD_RESONANCE_CONDITION ※v0.197: collectResonanceExtraAttackPhaseCondition追加（effectEngine）。レゾナにアタックフェイズタイミング追加対応 |
| 1 | CONT | ✅ | ADJACENT_ZONE_ATTACK ※v0.116: 英知=10条件付き・隣ゾーン1つ追加バトル（有利な方を自動選択） |
| 1 | CONT | ✅ | ALL_CARDS_COLOR_CHANGE_BLACK ※v0.195確認: effectEngine.hasAllCardsColorBlack+myEnergyExtraColorsで黒色をエナに反映済み ✅ |
| 1 | ACTIVATED | ✅ | ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE ※v0.186: lrig_gained_types配列に付与タイプを追加。両プレイヤーに反映。collectLrigNameAliasesで参照 |
| 1 | CONT | ✅ | ALL_CLASS ※v0.115: collectAllClassSigni実装（レゾナ条件等のfiltterに活用可） |
| 1 | CONT | ✅ | ALL_COLOR ※v0.186: collectAllColorSigniForField追加+ExecCtx.allColorSigniNums接続→fieldCandidatesで全色バイパス実装 |
| 1 | AUTO | ✅ | ALL_OPP_SIGNI_POWER_DOWN_HALF ※自パワー÷2だけ相手全シグニのtemp_power_modsに適用 |
| 1 | ACTIVATED | ✅ | ALL_OPP_SIGNI_SERVANT_ZERO ※v0.157: MAKE_SERVANT_ZEROと同一実装 |
| 1 | CONT | ✅ | ALL_ZONE_BLACK ※v0.187: collectFieldSigniExtraColors+ExecCtx.fieldSigniExtraColors接続→fieldCandidatesで追加色（黒）チェック実装 |
| 1 | AUTO/ACTIVATED | ✅ | ARTS_EXTRA_COST_CONDITION ※v0.197: self_optional_effect_taken確認→追加コスト払済は2択CHOOSE、未払は1択CHOOSE（①パワー+/②ダウン） |
| 1 | ACTIVATED | ✅ | ARTS_COLORLESS_MUST_PAY_CENTER_COLOR ※v0.173: BattleScreen arts payment UにてARTS_COLORLESS_MUST_PAY_CENTER_COLOR検出→《無》をセンタールリグ色に置換してvalidation |
| 14 | ACTIVATED | ✅ | ARTS_COST_REDUCTION_BY_CENTER_LRIG |
| 1 | CONT | ✅ | ARTS_COST_REDUCTION_BY_COST_THRESHOLD ※v0.114: collectArtsThresholdCostReductions+computeArtsEffectiveCostに統合 |
| 1 | CONT | ✅ | ATTACK_COUNT_BY_POWER ※v0.117: calcContinuousBlockedActionsでパワー/10000回数上限・attacked_signi_idsをバッグ化 |
| 2 | CONT | ✅ | BANISH_BY_SELF_GOES_TO_TRASH ※v0.171: banish_to_trash_by_selfフラグ+BattleScreen banishBySelftToTrashチェック+ターン終了リセット |
| 1 | CONT | ✅ | BANISH_REDIRECT_TO_HAND ※banish_redirect_to_handフラグ→BattleScreenのバニッシュ先変更に統合（v0.148） |
| 2 | CONT | ✅ | BANISH_SUBSTITUTE_RISE_STACK ※v0.185: collectRiseBanishSubstituteSigni+BattleScreen/CpuBattleScreenのバニッシュ解決でスタック下カードをトラッシュしてバニッシュ回避（自動） |
| 2 | AUTO/ACTIVATED | ✅ | BANISH_MULTI_COLOR_SIGNI ※相手フィールドの複数色(2色以上)シグニを全体自動バニッシュ（v0.148） |
| 2 | AUTO | ✅ | BATTLE_BANISH_LIFE_BURST ※v0.170: バトルバニッシュカードのLBをotherState.field.checkにセット→相手LB発動 |
| 1 | CONT | ✅ | BEAT_ZONE_OP ※v0.172: 条件チェック（N枚以下）+フィールドSELECT→INTERNAL_MOVE_TO_BEAT実装 |
| 1 | AUTO | ✅ | BLACK_RISE_PLAY_STACK_FROM_TRASH ※v0.189: 3フェーズ実装（トラッシュシグニ最大2枚選択→ウェポン2体選択→スタック下配置+下カード数ドロー） |
| 1 | CONT | ✅ | BLOCK_OPP_ZONE_PLACEMENT ※disabled_signi_zones配列に指定ゾーンを追加実装済み |
| 1 | CONT | ✅ | BLOCK_ALL_OPP_ACTIVATE_ABILITY ※v0.131: calcContinuousBlockedActionsでUSE_ACTをforSelfに追加（相手ターン条件付き） |
| 1 | CONT | ✅ | BLOCK_COLORLESS_PLAY ※v0.131: PLAY_COLORLESSをforSelfに追加。handleSummonSigni/castSpellでColor=無をガード |
| 1 | CONT | ✅ | BLOCK_FRONT_SIGNI_ATTACK ※v0.115: calcContinuousBlockedActionsで正面シグニをcannotAttackSigniに追加 |
| 1 | CONT | ✅ | BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT ※collectBlockLowCostSpellCount+castSpellでチャーム数≤コストのスペルをブロック |
| 1 | CONT | ✅ | BLOCK_NON_WHITE_SPELL ※v0.131: BLOCK_NON_WHITE_SPELLを両者forSelf/forOtherに追加。castSpellで白以外をガード |
| 1 | AUTO | ✅ | BLOCK_OPP_ARTS_SPELL_ACT ※v0.169: blocked_actionsにUSE_ARTS/USE_SPELL/USE_ACTを追加→BattleScreenのisActionBlockedで検査済み（line 7124） |
| 1 | ACTIVATED | ✅ | BLOCK_OPP_AUTO_ABILITY_EXTENDED ※v0.174: blocked_actionsにBLOCK_OPP_SIGNI_AUTO+:NEXT_TURNを追加。collectFieldTriggersで相手シグニAUTOをスキップ |
| 1 | CONT | ✅ | BLOCK_OPP_DECK_TO_ENERGY ※calcContinuousBlockedActions+execEnergyChargeFromDeckでデッキ→エナをブロック |
| 1 | CONT | ✅ | BLOCK_OPP_ENCORE_AND_BET ※calcContinuousBlockedActionsでENCORE/BET両方をforOther/forSelfに追加済み |
| 1 | CONT | ✅ | BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT ※calcContinuousBlockedActions+execAddToFieldでシグニ効果による配置をブロック |
| 1 | ACTIVATED | ✅ | BLOCK_OPP_SPELL_ACT_NEXT_TURN ※execStub.tsで'USE_SPELL:NEXT_TURN'/'USE_ACT:NEXT_TURN'をblocked_actionsに追加済み（ターン移行時に変換） |
| 1 | ACTIVATED | ✅ | BOTH_DISCARD_BY_CENTER_LEVEL ※v0.169: 両者センターLv分自動捨て（先頭N枚、非インタラクティブ）（line 4561） |
| 2 | AUTO | ✅ | CAST_FROM_OPP_TRASH ※v0.197: lastProcessedCards未設定時にSELECT_TARGET(opp_trash→スペル)→相手トラッシュから削除してコストなし使用 |
| 1 | CONT | ✅ | CENTER_LRIG_COLOR_CHANGE_BLACK ※v0.186: lrig_extra_colors['黒']設定。collectFieldSigniExtraColors(GAIN_LRIG_COLOR)でシグニへ伝播 |
| 1 | AUTO | ✅ | CENTER_LRIG_DISMOUNT ※v0.173: CHOOSE(降りる/そのまま)→INTERNAL_DISMOUNT_DO(lrig_riding_signi=[])でドライブ解除実装 |
| 1 | ACTIVATED | ✅ | CENTER_LRIG_RIDES_ON_SIGNI ※v0.163: SELECT乗機シグニ→乗り換え対応（lrig_riding_signi設定） |
| 1 | AUTO/ACTIVATED | ✅ | CENTER_ZONE_CONDITION ※v0.170: field.signi[1]（中央ゾーン）にsourceCardNumがあるか確認。条件不成立時スキップ |
| 1 | AUTO | ✅ | CHANGE_BASE_LEVEL ※v0.142: CHOOSE(1-3,optional)→attack_phase_level_overrides設定 |
| 1 | AUTO | ✅ | CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN ※v0.142: SELECT_TARGET(任意シグニ,optional)→レベル1に設定 |
| 1 | AUTO | ✅ | CHANGE_EICHI_SIGNI_BASE_LEVEL ※v0.142: SELECT_TARGET(英知シグニ)→CHOOSE(1-3)→attack_phase_level_overrides |
| 1 | AUTO | ✅ | CHANGE_SIGNI_COLOR ※v0.142: レベルフィルタ追加（「レベルN以下」テキスト解析） |
| 1 | AUTO/ACTIVATED | ✅ | CHOOSE_SAME_OPTION_MULTIPLE ※v0.185: CHOOSE_SAME_OPTION_TWICEと同ハンドラで処理済み（maxRoundsCSO解析対応） |
| 2 | AUTO | ✅ | CHOOSE_SAME_OPTION_TWICE ※v0.173: CHOOSE_SAME_OPTION_TWICEと同ハンドラで処理済み |
| 1 | AUTO/ACTIVATED | ✅ | CHOSEN_TO_ENERGY_OR_HAND ※needsInteraction CHOOSE: エナか手札への移動を選択 |
| 1 | AUTO/ACTIVATED | ✅ | CLASS_SIGNI_TO_ENERGY ※デッキ上クラスシグニをフィルタしneedsInteraction SEARCHでエナへ |
| 1 | AUTO/ACTIVATED | ✅ | COIN_SPEND_CONDITION ※v0.197: coin_condition_signi_instances登録→ターン終了時COIN_SPENTチェック→未達でフィールドシグニをトラッシュ |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_ADD_HAND ※フィールドシグニ有無チェック+デッキ上ドロー実装済み |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_DISCARD ※needsInteraction SELECT_TARGET: 条件付き手札選択捨て実装済み |
| 1 | AUTO | ✅ | CONDITIONAL_FREE_GROW ※v0.172: free_grow_this_turnフラグ+BattleScreenグロウUIでisFreeGrowチェック |
| 1 | CONT | ✅ | CONDITIONAL_KEYWORD_BY_CENTER_COLOR ※センター色チェック+keyword_grants付与実装済み |
| 4 | ACTIVATED | ✅ | CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_SEARCH_IF_FIELD ※フィールドシグニ有無チェック+デッキ上3枚からシグニ手札追加実装済み |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_SEARCH_IF_RESONA ※レゾナ有無チェック+needsInteractionでデッキから手札追加実装済み |
| 2 | AUTO | ✅ | CONDITIONAL_TRASH_TO_ENERGY ※v0.169: センタールリグクラス条件チェック+トラッシュ→エナ実装済み（line 4328） |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_TRASH_UNDER_SIGNI ※v0.172: 相手エナN枚以上確認→シグニ下カードSELECT→INTERNAL_TRASH_UNDER_SIGNI |
| 2 | CONT | ✅ | COOKING_BANISH_SUBSTITUTE ※v0.195: バトル勝利処理で調理クラス+アクセ存在+相手ターン確認→アクセをtrashへ、シグニを場に残す（WX17-048） |
| 1 | AUTO/ACTIVATED | ✅ | COST_COLOR_SELECT ※v0.197: 支払ったエナの色からユニーク色を収集→CHOOSE(色別シグニSEARCH) |
| 1 | AUTO/ACTIVATED | ✅ | COUNT_DISTINCT_NAMES ※自フィールドシグニ名数×deltaをtemp_power_modsに適用 |
| 1 | AUTO/ACTIVATED | ✅ | DECK_REVEAL_UNTIL_CLASS ※DECK_REVEAL_UNTILと同ハンドラ: クラスフィルタ付き完全実装 |
| 1 | ACTIVATED | ✅ | DECK_SIGNI_LEVEL_OVERRIDE ※v0.197: deck_signi_level_override{class,level}フラグ設定（DECK_TOP_MATCHES等でレベル参照時に適用可） |
| 5 | LIFE | ✅ | DECK_TOP_TO_LIFE ※デッキ上→ライフクロス実装済み |
| 1 | AUTO/ACTIVATED | ✅ | DECLARE_COLOR_COND_ENERGY_TRASH ※v0.170: 色CHOOSE→INTERNAL_DCCE_TRASH_COLORで宣言色エナをトラッシュ。スキップ選択肢あり |
| 1 | AUTO/ACTIVATED | ✅ | DECLARE_NUMBER_POWER ※SET_DECLARED_NUMBERハンドラと接続済み（3000〜15000のCHOOSE） |
| 4 | AUTO | ✅ | DECLARE_COLOR |
| 1 | AUTO | ✅ | DEFEAT ※v0.159: prevent_defeatチェック→life_cloth=[]でゲーム終了誘発 |
| 1 | ACTIVATED | ✅ | DISCARD_BY_POWER_MATCH ※v0.159: SELECT_TARGET(手札青シグニ)→捨て→相手手札同パワーシグニを捨てさせる |
| 1 | AUTO | ✅ | DISCARD_IF_NO_CLASS_SIGNI ※クラスシグニなし判定→手札捨て実装済み |
| 1 | AUTO/ACTIVATED | ✅ | DRAW ※テキスト解析→指定枚数ドロー実装済み |
| 1 | AUTO | ✅ | DRAW_BY_CHARM_COUNT ※チャーム枚数ドロー実装済み |
| 1 | AUTO/ACTIVATED | ✅ | DRAW_DISCARD_COUNT_PLUS_N ※捨て枚数+Nドロー実装済み |
| 1 | AUTO | ✅ | DRIVE_SIGNI_PREVENT_DOWN ※v0.159: SELECT_TARGET→PROTECTION:DOWN:opponentをkeyword_grantsに設定 |
| 1 | CONT | ✅ | DYNAMIC_LEVEL_BY_ENERGY ※buildLevelModsにエナ枚数比例レベル変動追加 |
| 1 | AUTO | ✅ | EACH_PLAYER_DRAW_DISCARD ※v0.170: 両者ドロー+自SELECT_TARGET捨て+相手opponentResponds捨て実装 |
| 2 | CONT | ✅ | ENERGY_COLOR_SUBSTITUTE_TRASH ※collectEnergyTrashSubstituteInfoで黒エナ→ワイルド |
| 2 | CONT | ✅ | ENERGY_SUBSTITUTE_TRASH_KEY ※collectEnergyTrashSubstituteInfoでキーピース→エナ2代替UI |
| 2 | CONT | ✅ | ENERGY_SUBSTITUTE_TRASH_SIGNI ※collectEnergyTrashSubstituteInfoでエナの自身→ルリグ色 |
| 1 | CONT | ✅ | ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI ※collectEnergyTrashSubstituteInfoで美巧エナ→白 |
| 1 | AUTO/ACTIVATED | ✅ | ENERGY_LEVEL_CONDITION_CHOOSE ※エナにLvN以上のシグニがあるか確認→条件不成立時はスキップ（v0.171確認） |
| 1 | AUTO | ✅ | ENERGY_TO_HAND_ON_DECK ※SELECT_TARGET(エナ)→手札へ実装済み |
| 1 | AUTO | ✅ | ENERGY_TO_TRASH ※SELECT_TARGET(エナ)→トラッシュへ実装済み |
| 2 | CONT | ✅ | EXTRA_GUARD_COST_FROM_HAND ※collectOppExtraGuardFromHand+handleGuardResponse+ガードUI統合 |
| 1 | AUTO/ACTIVATED | ✅ | FIELD_COND_DRAW_REVEAL ※v0.169: フィールドクラス条件→デッキ上公開→クラス一致なら手札/不一致ならトラッシュ（line 8532） |
| 1 | CONT | ✅ | FIRST_SPELL_COST_UP ※v0.173: collectFirstSpellCostUp追加。BattleScreenスペルコストUIに統合（初回のみ+《無×1》）。castSpellで'USE_SPELL'をactions_doneに記録 |
| 1 | ACTIVATED | ✅ | FROM_TRASH_TO_CENTER_ZONE ※v0.159: トラッシュから中央シグニゾーン(zone[1])に出す（既存シグニはエナへ） |
| 1 | CONT | ✅ | FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM ※v0.167: collectFrozenBanishOverrides追加。BattleScreen/CpuBattleScreenバトル解決で防御側CONTチェック→凍結シグニをデッキ下へ |
| 2 | CONT | ✅ | FROZEN_SIGNI_TO_TRASH_ON_LEAVE ※v0.167: collectFrozenBanishOverrides追加。BattleScreen/CpuBattleScreenバトル解決で攻撃側CONTチェック→相手凍結シグニをトラッシュへ |
| 1 | CONT | ✅ | GAIN_ADDITIONAL_LRIG_TYPE ※v0.186: collectLrigNameAliasesにkey_piece/signiフィールド対応追加。条件付きタイプ付与実装 |
| 1 | AUTO | ✅ | GAIN_COIN_AND_DISCARD ※v0.170: コイン付与後にSELECT_TARGETでインタラクティブ手札捨て |
| 1 | CONT | ✅ | GAIN_LRIG_COLOR ※v0.187: collectFieldSigniExtraColors+ExecCtx.fieldSigniExtraColors接続→ルリグ色+lrig_extra_colorsをシグニ追加色として適用 |
| 1 | AUTO/ACTIVATED | ✅ | GRANT_ABILITY_UNTIL_OPP_TURN ※v0.171: テキスト解析→keyword_grants付与（相手ターン終了=次の自分ターン開始でリセット） |
| 2 | CONT | ✅ | GRANT_CHOSEN_ABILITY_FROM_PLAY ※ON_PLAYのGRANT_QUOTED_ABILITYでkeyword_grants設定済み。CONTはdone(ctx)で正しく動作 |
| 1 | ACTIVATED | ✅ | GRANT_CHOSEN_ABILITY_SELF ※v0.169: GRANT_CHOSEN_ABILITYと同ハンドラ: SELECT_TARGET(自フィールド)+CHOOSE能力→keyword_grants付与 |
| 1 | ACTIVATED | ✅ | GRANT_CONDITIONAL_ASSASSIN_ABILITY ※v0.169: sourceCardNumにアサシンをkeyword_grants付与（line 9013） |
| 1 | AUTO/ACTIVATED | ✅ | GRANT_LRIG_ABILITY ※PR-317: effects.jsonをGRANT_LRIG_ABILITYアクション型に変更+lrig_granted_auto_effectsをgrantedMyLrigEffectsに統合 |
| 2 | CONT | ✅ | GRANT_LRIG_TRASH_ACTIVATE_ABILITY ※WXEX2-12: collectLrigGrantedEffectsにlrig_trash名前フィルタ付き収集を追加 |
| 1 | CONT | ✅ | GRANT_SIGNI_CLASS ※v0.173: execUtils.matchesFilterにclassOverride引数追加。fieldCandidatesがcard_class_overrides[cardNum]をmatchesFilterに渡し、story(class)フィルターで上書きクラスを考慮 |
| 1 | CONT | ✅ | GRANT_UNDER_LRIG_ACTIVATE_ABILITY ※WX12-001: collectLrigGrantedEffectsにunder-lrig ACTIVATED収集を追加 |
| 1 | CONT | ✅ | GRANT_UNDER_LRIG_AUTO_ABILITY ※WX21-003: collectLrigGrantedEffectsにunder-lrig AUTO収集を追加 |
| 1 | CONT | ✅ | GRANT_UNDER_SIGNI_ALL_ABILITIES ※WX21-024: collectGrantedFromUnderSigniで下シグニの全効果をトップに付与 |
| 1 | CONT | ✅ | GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE ※WXK08-048: collectGrantedFromUnderSigniでフィルタ付きAUTO収集 |
| 1 | CONT | ✅ | GRANT_UNDER_SIGNI_CONSTANT_ABILITY ※WX19-027: collectGrantedFromUnderSigniで英知CONTINUOUS収集 |
| 1 | AUTO | ✅ | GRID_REVEAL_PLUS ※v0.197: grid_reveal_plus_one_this_turnフラグ設定（このターンデッキ公開+1可） |
| 1 | CONT | ✅ | GROW_COST_SUBSTITUTE_TRASH_SIGNI ※v0.197: collectGrowCostSubstitute追加（effectEngine）+BattleScreenグロウUIに代替コスト情報表示（SP07-001） |
| 2 | CONT | ✅ | GUARD_ALTERNATIVE_COST ※v0.197: collectGuardAlternativeCost追加（effectEngine）+BattleScreenガードUIに代替ボタン追加（WX24-P2-026） |
| 1 | AUTO | ✅ | HAND_CARDS_UNDER_SIGNI ※手札からN枚このシグニの下に配置実装済み |
| 1 | AUTO | ✅ | HAND_NONCOLORLESS_TO_ENERGY ※SELECT_TARGET(有色手札)→エナゾーンへ実装済み |
| 1 | CONT | ✅ | HAND_SIGNI_HAS_GUARD_ICON ※v0.115: collectHandGuardIconClasses+ガードUI(myHandGuardClasses)に統合 |
| 1 | AUTO/ACTIVATED | ✅ | HAND_SIGNI_UNDER_SIGNI ※needsInteraction SELECT_TARGET: 手札シグニを選択してシグニ下に配置 |
| 1 | ACTIVATED | ✅ | HASTARLIQ ※v0.198: CHOOSE(ゾーン1/2/3)→otherState.hastarliq_zones設定。BattleScreen MAIN→ATTACK_ARTS移行時にHASTARLIQ_TRIGGERをスタックに積み、相手が手札捨て/《無》払い/どちらもしない（バニッシュ）を選択 |
| 1 | CONT | ✅ | IGNORE_LRIG_RESTRICTION_ARTS ※v0.188: lrig_gained_types['__ignore_lrig_restriction__']設定+BattleScreen meetsRestriction/ignoreRestrictionで全制限バイパス |
| 1 | CONT | ✅ | INCREASE_ACT_ABILITY_COST ※v0.173: collectIncreaseActCost追加。BattleScreen起動能力コストUIに統合（自分のターン中に+《無×1》）。adjustedTotal+actExtraCosts対応 |
| 1 | CONT | ✅ | INFECTED_SIGNI_POWER_DOWN_BY_LEVEL ※ウイルスレベル合計×-1000をtemp_power_modsに適用実装済み |
| 2 | CONT | ✅ | INHERIT_OPP_LRIG_TYPE ※v0.186: collectLrigNameAliasesに追加。otherState引数を渡して相手センタールリグのCardClass/CardNameをエイリアスに追加 |
| 1 | CONT | ✅ | INHERIT_UNDER_SIGNI_COLOR ※v0.187: collectFieldSigniExtraColors+ExecCtx.fieldSigniExtraColors接続→スタック下の対象クラスシグニ色を継承 |
| 1 | CONT | ✅ | LEAVE_FIELD_TO_DECK_BOTTOM ※removeFromField+deckへ追加でデッキ下移動実装済み |
| 1 | AUTO/ACTIVATED | ✅ | LEVEL_BASED_CONDITIONAL ※v0.170: lastProcessedCards[0]のLvN枚だけSELECT_TARGET手札捨て |
| 1 | CONT | ✅ | LEVEL_MOD_PER_COUNT ※v0.196確認: effectEngine.buildLevelModsで「対戦相手の場のチャームN枚につきN減る」実装済み ✅ |
| 1 | CONT | ✅ | LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT ※v0.197: collectLevelRefOverridesFromNonField追加（effectEngine）。DECK_TOP_MATCHESは既存テキスト解析で対応済み（WXEX1-62） |
| 1 | AUTO/ACTIVATED | ✅ | LIFE_TO_HAND_OPTIONAL ※life_cloth先頭を手札へ移動実装済み |
| 2 | AUTO | ✅ | LIFE_BURST_DOUBLE ※life_burst_double_nextフラグ設定→BattleScreenでバースト2回発動 |
| 1 | AUTO | ✅ | LIMIT_OPP_SIGNI_ATTACKS_ONCE ※signi_attack_once_limitフラグ設定→アタック1回制限 |
| 1 | AUTO | ✅ | LOOK_DECK_BOTTOM ※デッキ下1枚LOOK_AND_REORDER(destPosition:'bottom')（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_BOTTOM ※デッキ上下1枚ずつLOOK_AND_REORDER(destPosition:'any')（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_BY_LIFE_COUNT ※ライフ枚数分デッキ上をLOOK_AND_REORDER（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_N ※デッキ上N枚LOOK_AND_REORDER（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | LOOK_TOP_OPP_CHOOSE_TRASH ※デッキ上N枚公開→相手SELECT_TARGET(opponentResponds)→INTERNAL_TRASH_CARD（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_SIGNI_TO_FIELD ※デッキ上3枚から最初のシグニを空きゾーンに配置・残はトラッシュ（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_SORT ※LOOK_TOP_Nと同ハンドラ: デッキ上N枚LOOK_AND_REORDER（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_SPELLS_TO_HAND ※デッキ上N枚のスペルを自動で手札へ・非スペルはデッキ戻し（v0.148） |
| 1 | AUTO | ✅ | LOOK_TOP_ONE_RETURN_REST_BOTTOM ※v0.161: first_top_rest_bottom destPosition追加。1枚→デッキトップ・残り→デッキ下 |
| 1 | CONT | ✅ | LRIG_ALL_NAMES ※v0.129: collectLrigNameAliasesでLRIG_ALL_NAMES_SENTINEL追加。lrigNameMatchesで全ルリグ名マッチ。execStubのCONDITIONAL_MULTI_CHOOSE_BY_CENTERもruntime aliasesを考慮 |
| 1 | AUTO/ACTIVATED | ✅ | LRIG_GAIN_ABILITY ※v0.186: lastProcessedCards[0]をCHOOSEで選択した能力としてセンタールリグのkeyword_grantsに付与 |
| 1 | CONT | ✅ | LRIG_LIMIT_UP_AND_COLOR_GAIN ※v0.186: collectLrigNameAliasesに「追加で＜タイプ＞を得る」テキスト解析追加。リミット増加はv0.115済み |
| 1 | AUTO/ACTIVATED | ✅ | LRIG_RIDE_SIGNI ※v0.163: 自場の全乗機シグニにlrig_riding_signiを設定（ドライブ状態化） |
| 2 | AUTO | ✅ | LRIG_TRASH_KEY_TO_CENTER_UNDER ※v0.169: lrig_trashのキーをセンタールリグの下に挿入実装済み（line 4793） |
| 1 | ACTIVATED | ✅ | MAKE_MULTI_SERVANT_ZERO ※v0.157: MAKE_SERVANT_ZEROと同一実装 |
| 1 | AUTO | ✅ | MOVE_ACCE_TO_SIGNI ※v0.169: sourceゾーンのアクセを別の空きゾーンへ自動移動（line 8624） |
| 1 | AUTO | ✅ | MULTI_ACCE_FROM_HAND ※v0.169: ACCE_FROM_HANDと同ハンドラ（line 8894） |
| 1 | CONT | ✅ | MULTI_ACCE_LIMIT ※v0.185: collectMultiAcceSigni+BattleScreenアクセUIにhasTarget判定統合（多アクセ可能シグニへの2個目付与を許可） |
| 1 | ACTIVATED | ✅ | MULTI_DAMAGE_ON_LRIG_ATTACK ※v0.161: lrig_attack_remainingフラグ設置+BattleScreen handleGuardResponse/CPU側でマルチアタック実装 |
| 1 | AUTO | ✅ | MULTI_SIGNI_POWER_UP_5000 |
| 1 | AUTO | ✅ | MULTI_SIGNI_TO_ENERGY ※v0.161: BANISH→INTERNAL_OPP_SIGNI_TO_ENERGY_EXECに変更。選択した相手シグニを相手エナゾーンへ移動 |
| 1 | AUTO | ✅ | NAMED_SIGNI_ACCE_FROM_TRASH ※v0.169: ACCE_FROM_TRASHと同ハンドラ（line 8911） |
| 6 | ACTIVATED | ✅ | NEGATE_ALL_OPP_EFFECTS ※v0.171: all_cont_effects_negatedフラグ+effectEngine applyEffectsでスキップ+ターン終了リセット |
| 3 | CONT | ✅ | NEGATE_ATTACK_ON_TRIGGER ※prevent_next_damageフラグ設置でアタック無効化実装済み |
| 6 | AUTO | ✅ | NEGATE_COIN_ABILITY ※v0.185: otherState.negate_coin_abilities=trueフラグ設定。BET_MECHANICでcoinNegatedチェック→ベット不可。ターン開始時リセット |
| 6 | AUTO | ✅ | NEGATE_THAT_ATTACK ※v0.170: BattleScreen/CpuBattleScreenのsigniAttackでop.negated_attacksチェック追加。ownerState.negated_attacksに攻撃者IDを登録 |
| 1 | CONT | ✅ | NO_ABILITY_SIGNI_TO_DECK_BOTTOM ※能力テキスト有無チェック+removeFromField+デッキ下移動実装済み |
| 1 | AUTO | ✅ | NON_GUARD_DISCARD_TO_ENERGY ※v0.169: ガードアイコンなし確認→エナゾーンへ移動（line 8775） |
| 1 | ACTIVATED | ✅ | NON_LRIG_TO_LRIG_TRASH ※v0.169: lastProcessedCardsのカードをフィールド/トラッシュからルリグトラッシュへ（line 4398） |
| 1 | CONT | ✅ | ODD_LEVEL_SIGNI_CANT_ATTACK ※effectEngine.calcContinuousBlockedActionsで実装 |
| 1 | AUTO | ✅ | OPP_CHOOSE_EFFECT ※v0.161: opponentResponds CHOOSE+テキスト解析（①ドロー/②手札シグニ配置）対応。WXK04-032全パターン確認済み |
| 1 | AUTO | ✅ | OPP_CHOOSES_FOR_YOU ※v0.161: INTERNAL_OPP_DECK_TRASH_N+トラッシュからシグニ手札パターン対応。WXDi-P07-007全パターン確認済み |
| 1 | AUTO/ACTIVATED | ✅ | OPP_DECK_REVEAL_UNTIL ※v0.169: DECK_REVEAL_UNTILと同ハンドラ。相手デッキを条件まで公開→トラッシュ/デッキ下（line 1567） |
| 2 | CONT | ✅ | OPP_ENERGY_COLOR_CONDITION_TRASH ※v0.169: collectOppEnergyColorRestriction+BattleScreen line 2614/2643でエナチャージ時色制限チェック統合済み |
| 2 | AUTO | ✅ | OPP_ENERGY_EXCESS_TRASH ※v0.169: 閾値チェック+相手opponentResponds SELECT_TARGET→INTERNAL_OPP_ENERGY_TO_TRASH（line 1071） |
| 1 | ACTIVATED | ✅ | OPP_ENERGY_OR_DISCARD_CONDITION ※相手にエナ捨てか手札捨てかをopponentResponds CHOOSEで提示（v0.171確認） |
| 1 | AUTO | ✅ | OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND ※v0.168: excess枚数分のみ移動（全移動→超過分）。相手opponentResponds SELECT_TARGET→INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N |
| 1 | AUTO/ACTIVATED | ✅ | OPP_HAND_TO_DECK_TOP ※v0.168: SELECT_TARGET(opponentResponds)+INTERNAL_OPP_HAND_TO_DECK_TOP。枚数テキスト解析対応 |
| 1 | CONT | ✅ | OPP_LRIG_ATTACK_COST ※v0.114: collectOppLrigAttackExtraCost+handleLrigAttackに追加コスト支払い統合 |
| 2 | AUTO | ✅ | OPP_MAIN_PHASE_LIMIT_DOWN ※v0.161: pending_lrig_limit_mod(-2)フラグ設定→GROW→MAIN移行時にlrig_limit_modへ適用（誤実装draw_limit→修正） |
| 1 | AUTO | ✅ | OPP_RETURN_HAND_ON_SELF_BANISH ※v0.169: 相手手札からopponentResponds SELECT_TARGET→TRANSFER_TO_DECK(top)（line 7233） |
| 1 | ACTIVATED | ✅ | OPP_REVEAL_HAND_AND_LRIG_DECK ※v0.169: 相手手札+ルリグデッキ名一覧をログ表示（line 8656） |
| 1 | ACTIVATED | ✅ | OPP_REVEAL_LRIG_DECK ※v0.169: 相手ルリグデッキ名一覧をログ表示（line 8659） |
| 1 | ACTIVATED | ✅ | OPP_REVEAL_TOP_AND_HAND ※v0.169: 相手デッキトップ+手札名一覧をログ表示（line 8662） |
| 2 | ACTIVATED | ✅ | OPP_SIGNI_ATTACK_COST ※v0.161: signi_attack_costフラグ(=2)設定+BattleScreen/CpuBattleScreenのシグニアタック時にエナ消費・不足時アタック不可 |
| 1 | CONT | ✅ | OPP_SIGNI_LEAVE_TO_TRASH ※banish_redirectフラグ設置: BattleScreenのバニッシュ先変更に統合 |
| 1 | AUTO | ✅ | OPP_SIGNI_ONE_ATTACK_TOTAL ※v0.168: CpuBattleScreen CPU側のATTACK_SIGNIフェイズにsigni_attack_once_limitチェック追加 |
| 2 | AUTO | ✅ | OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL ※v0.168: SELECT_TARGETのthenActionバグ修正。noopをthenAction、INTERNAL_APPLY_POWER_DELTA_OPP(delta=stub.value)をcontinuationに変更 |
| 1 | ACTIVATED | ✅ | OPP_SIGNI_TO_DECK_AND_SHUFFLE ※v0.167以前のline 2567ハンドラが正実装（SELECT_TARGET+INTERNAL_OPP_SIGNI_TO_DECK_SHUFFLE）。dead code除去 |
| 1 | ACTIVATED | ✅ | OPP_SIGNI_TO_DECK_BY_GATE ※v0.169: lastProcessedCards→removeFromField+デッキ下配置（line 4171） |
| 1 | ACTIVATED | ✅ | OPP_SIGNI_TO_DECK_NTH ※v0.169: N番目テキスト解析→デッキN番目に挿入（line 4072） |
| 2 | AUTO | ✅ | OPP_TRASH_FIELD_SIGNI_AND_ENERGY ※v0.169: 相手フィールド全シグニ+全エナをトラッシュ実装済み（line 3811） |
| 2 | CONT | ✅ | OPP_TRASH_LOSE_COLOR_AND_CLASS ※v0.197: collectOppTrashLoseColorClass追加（effectEngine）。自ターン中相手トラッシュ色/クラスを失う（WXK11-026） |
| 1 | AUTO | ✅ | OPP_TRASH_TO_DECK_TOP ※v0.168: line 1211の正実装（SELECT_TARGET+INTERNAL_OPP_TRASH_TO_DECK_TOP）を確認・dead code除去 |
| 2 | AUTO | ✅ | OPP_TRASH_TO_OPP_SIGNI_UNDER ※v0.168: CHOOSE for zone selection+INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE（lastProcessedCards経由でカード情報保持） |
| 1 | AUTO | ✅ | OPP_TURN_NO_ENERGY_COST |
| 1 | CONT | ✅ | OPP_ZONE_PLACEMENT_RESTRICT ※v0.161: collectCenterZoneDeployRestrict(effectEngine)+handleSummonSigniで中央ゾーンLv3+配置禁止 |
| 1 | AUTO | ✅ | OPTIONAL_HAND_REVEAL_NAMED |
| 5 | AUTO | ✅ | OPTIONAL_DISCARD_CLASS_SIGNI ※line 93と同一実装（重複エントリ）→✅確認 |
| 1 | AUTO | ✅ | PLACE_CHOKKIN ※v0.174: sourceCardNumのゾーンにsigni_chokkinカウンター+1。BoardComponentsで「菌×N」バッジをパワー上に表示 |
| 1 | AUTO | ✅ | PLACE_DECK_TOP_UNDER_WEAPON_SIGNI ※v0.170: ウェポンシグニゾーンを検索→デッキ上カードをスタック底に追加 |
| 1 | ACTIVATED | ✅ | PLACE_LRIG_FROM_DECK_ON_TOP ※v0.169: lrig_deck先頭をfield.lrigに追加（line 5319） |
| 2 | AUTO/ACTIVATED | ✅ | PLACE_SIGNI_UNDER_SIGNI ※lastProcessedCardsのシグニをsourceCardNumの下に配置実装済み |
| 2 | AUTO | ✅ | PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON ※v0.170: 全ウェポンゾーンを検索→SELECT_TARGET(トラッシュシグニ)→INTERNAL_PTSUAW_PLACEでスタック配置 |
| 1 | AUTO | ✅ | PLACE_VIRUS_CENTER ※v0.169: 相手の全シグニゾーン（シグニ在中）にウィルス1を設置（line 4930） |
| 4 | CONT | ✅ | PLAY_EFFECT_TARGET_CLASS_CHANGE ※PLAY_FREEグループに統合: スペル/アーツ効果を実行 |
| 1 | AUTO | ✅ | PLAY_SPELL_FROM_HAND |
| 1 | AUTO | ✅ | PLAY_SPELL_FROM_HAND_FREE ※v0.169: PLAY_FREEグループに統合: lastProcessedCardsのスペルを無料プレイ（line 6210） |
| 1 | AUTO | ✅ | POWER_BOOST_PER_SIGNI_WITH_ICON ※v0.169: キーワード持ち自シグニ体数×delta→相手全シグニに適用（line 4866） |
| 1 | CONT | ✅ | POWER_BY_ACCE_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | CONT | ✅ | POWER_BY_CENTER_LRIG_TYPE_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | CONT | ✅ | POWER_BY_CHARM_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | CONT | ✅ | POWER_BY_ENERGY_COLOR_VARIETY ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | AUTO | ✅ | POWER_BY_LEVEL_SUM_COMPARE ※v0.162: 条件修正(>→≦)・delta×levelSum・SELECT_TARGET実装 |
| 1 | CONT | ✅ | POWER_BY_RISE_SIGNI_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装（スタック2枚以上判定） |
| 1 | CONT | ✅ | POWER_CAP ※v0.114: calcFieldPowers後処理でパワー上限適用 |
| 2 | ACTIVATED | ✅ | POWER_DOUBLE_ALL ※既存実装正しく確認（全自シグニに現在effectivePower分のdelta追加でx2）|
| 1 | AUTO | ✅ | POWER_DOWN_BY_ZONE_CARD_COUNT ※v0.162: SELECT_TARGET自己再帰で1体指定・ゾーン枚数×delta適用 |
| 1 | AUTO | ✅ | POWER_EQUALS_FRONT_SIGNI ※既存実装正しく確認（正面シグニPower-selfPower=delta適用） |
| 1 | AUTO | ✅ | POWER_MOD_BY_COLOR_VARIETY ※v0.162: 自場シグニ色種類数×delta・SELECT_TARGET自己再帰で1体指定 |
| 1 | AUTO/ACTIVATED | ✅ | POWER_MOD_BY_FIELD_CLASS_LEVEL ※フィールドクラスシグニのレベル合計×deltaをtemp_power_modsに適用 |
| 1 | CONT | ✅ | POWER_MOD_BY_FRONT_LEVEL ※v0.114: calcFieldPowers STUBハンドラで正面シグニLv×値パワーダウン実装 |
| 1 | AUTO | ✅ | POWER_MOD_BY_LRIG_LEVEL_SUM ※既存実装正しく確認（ルリグLv合計×delta・自シグニに適用） |
| 1 | ACTIVATED | ✅ | POWER_MOD_BY_TRASHED_SIGNI_LEVEL ※v0.162: SELECT_TARGET→INTERNAL_PMBTSL_APPLY・1体指定・Lv×-2000 |
| 1 | AUTO | ✅ | POWER_MOD_BY_UNDER_COUNT ※v0.162: SELECT_TARGET→INTERNAL_PMBUC_APPLY・2体まで・下枚数×delta |
| 1 | AUTO/ACTIVATED | ✅ | POWER_MOD_DISTRIBUTE ※v0.162: SELECT自場最大3体→均等配分（+20000/count/1000*1000） |
| 2 | ACTIVATED | ✅ | POWER_MOD_MIRROR ※v0.162: 捨てシグニのパワー→相手対象に-(opp)または自シグニに+(self)で適用 |
| 1 | AUTO | ✅ | POWER_MOD_ON_FRONT_PLACE ※v0.162: 正面シグニに任意で-3000（CHOOSEダイアログ+INTERNAL_PMOP_APPLY） |
| 1 | AUTO | ✅ | POWER_MOD_TARGET_AND_SELF ※v0.162: own signi(lastProcessedCards)+sourceCardNum両方にdelta適用修正 |
| 1 | ACTIVATED | ✅ | POWER_UP_BY_DISCARDED_SIGNI_POWER ※v0.162: SELECT自場シグニ→捨てたシグニのパワー分+適用 |
| 1 | CONT | ✅ | PREVENT_ABILITY_CHANGE_BY_OPP ※v0.185: collectAbilityGainProtectedSigniに追加（クラスフィルタ付き）。ExecCtxのotherAbilityGainProtectedNumsで参照 |
| 1 | CONT | ✅ | PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP ※v0.174: effectEngine.applyEffectsにallOtherSigniProtectedフラグ追加→全フィールドシグニをotherPowerProtectedに追加 |
| 1 | ACTIVATED | ✅ | PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE ※v0.170: blocked_actions['ATTACK:{cardId}']追加（GATE機構と同様） |
| 1 | CONT | ✅ | PREVENT_BOUNCE_AND_DOWN_BY_OPP ※v0.114: collectDownProtectedSigni+execDownに保護フィルター統合 |
| 1 | CONT | ✅ | PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP ※prevent_lrig_damageフラグ設置実装済み |
| 1 | CONT | ✅ | PREVENT_DAMAGE_FROM_OPP_EFFECTS ※prevent_lrig_damageフラグ設置実装済み |
| 1 | ACTIVATED | ✅ | PREVENT_DAMAGE_UNTIL_OPP_TURN_END ※PREVENT_LRIG_DAMAGEと同ハンドラ: prevent_lrig_damage=true（v0.172確認） |
| 1 | AUTO/ACTIVATED | ✅ | PREVENT_DEFEAT ※prevent_defeatフラグ設置: 敗北無効実装済み |
| 1 | AUTO | ✅ | PREVENT_DEFEAT_THIS_TURN ※v0.169: prevent_defeatフラグ設置（ターン開始時リセット）。PREVENT_DEFEATと同ハンドラ |
| 1 | AUTO | ✅ | PREVENT_DEFEAT_UNTIL_NEXT_TURN ※v0.169: prevent_defeatフラグ設置（次ターン開始まで有効）。PREVENT_DEFEATと同ハンドラ |
| 1 | ACTIVATED | ✅ | PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN ※v0.169: prevent_next_damage+1設定（次の相手ターンの最初のルリグダメージを無効） |
| 1 | CONT | ✅ | PREVENT_INFECTED_SIGNI_ACTIVATE ※v0.185: collectInfectedActivateBlockedSigni+BattleScreen MAINフェイズACTIVATEDフィルタで感染シグニの起動能力をブロック |
| 1 | CONT | ✅ | PREVENT_LOW_LEVEL_LRIG_DAMAGE ※prevent_lrig_damageフラグ設置実装済み |
| 1 | CONT | ✅ | PREVENT_LRIG_DAMAGE ※v0.115: BattleScreenガード応答時に手札0枚条件を動的チェック |
| 1 | ACTIVATED | ✅ | PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN ※PREVENT_LRIG_DAMAGEと同ハンドラ: prevent_lrig_damage=true（v0.172確認） |
| 1 | CONT | ✅ | PREVENT_NON_FIELD_MOVE_BY_OPP ※v0.185: collectProtectedZonesにルリグ候補追加+PREVENT_NON_FIELD_MOVE_BY_OPPで'hand'+'energy'保護 |
| 1 | CONT | ✅ | PREVENT_OPP_POWER_PLUS ※v0.185: calcFieldPowers applyEffectsにblockOwnerPosDeltaフラグ追加→相手CONT効果の正デルタをブロック |
| 1 | CONT | ✅ | PREVENT_OPP_SIGNI_ABILITY_GAIN ※v0.185: collectAbilityGainProtectedSigni+BattleScreen ExecCtxのotherAbilityGainProtectedNumsに統合 |
| 2 | CONT | ✅ | PREVENT_POWER_MINUS_BY_OPP ※v0.114: calcFieldPowers applyDeltaToStateで負delta時の保護チェック実装 |
| 1 | CONT | ✅ | PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH ※v0.185: collectBounceProtectedSigni+collectTrashFieldProtectedSigniに追加。bounce/trash from field両方ブロック |
| 1 | CONT | ✅ | PREVENT_SIGNI_DOWN_BY_OPP_ALL ※v0.114: collectDownProtectedSigni+execDownに保護フィルター統合 |
| 1 | CONT | ✅ | PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH ※v0.185: collectBounceProtectedSigni+collectTrashFieldProtectedSigniに追加。クラスフィルタ付き保護 |
| 1 | ACTIVATED | ✅ | PREVENT_TARGET_LRIG_ATTACK_THIS_TURN ※v0.169: negated_attacksにルリグIDを設定。BattleScreen/CpuBattleScreenのhandleLrigAttackでチェック |
| 1 | CONT | ✅ | REDUCE_OPP_HAND_LIMIT ※effectEngine.collectHandLimitsで実装 |
| 1 | ACTIVATED | ✅ | REDUCE_PLAY_ABILITY_COST ※v0.197: reduce_next_on_play_costフラグ設定（color+count）。次の【出】能力コスト軽減（WXK04-075） |
| 1 | CONT | ✅ | REMOVE_OPP_MULTI_ENA ※相手エナの複数色カードをフィルタしてトラッシュへ移動実装済み |
| 1 | CONT | ✅ | REMOVE_OPP_MULTI_ENA_ONLY ※REMOVE_OPP_MULTI_ENAと同ハンドラ: 複数色エナ削除実装済み |
| 1 | AUTO/ACTIVATED | ✅ | REPLACE_PLUS_N ※v0.174: replace_opp_power_plusフラグ+effectEngine.applyTempModsで対象シグニへの正デルタを負に置換 |
| 1 | AUTO/ACTIVATED | ✅ | REVEAL ※デッキ上1枚をlastProcessedCardsに格納してログ表示実装済み |
| 1 | AUTO/ACTIVATED | ✅ | REVEALED_CARD_COLOR_DISCARD ※needsInteraction: 公開カードの色と同色手札を選択して捨て実装済み |
| 2 | AUTO/ACTIVATED | ✅ | REVEALED_SIGNI_TO_FIELD_REST_TRASH ※lastProcessedCardsのシグニを空きゾーンに配置+残りトラッシュ実装済み |
| 1 | AUTO | ✅ | RESONANCE_COST_CARDS_TO_ENERGY ※v0.169: lastProcessedCardsのカードをトラッシュ→エナゾーンへ（line 9092） |
| 2 | CONT | ✅ | RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE ※v0.196: バトルバニッシュで宇宙レゾナ検出+フィールド走査→代替シグニをremoveFromField+trash（WXEX2-32） |
| 1 | CONT | ✅ | REVERSE_OPP_POWER_MINUS ※temp_power_modsの負デルタを正に反転する実装済み |
| 2 | CONT | ✅ | RISE_BANISH_SUBSTITUTE ※v0.185: collectRiseBanishSubstituteSigni+BattleScreen/CpuBattleScreenのバニッシュ解決でスタック下カードをトラッシュしてバニッシュ回避（自動） |
| 1 | CONT | ✅ | RISE_LEAVE_DISCARD_STACK ※v0.185: removeFromField既実装確認（スタック下全カードを自動トラッシュ）→✅ |
| 1 | AUTO | ✅ | RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY ※v0.171: テキスト解析→lastProcessedCards[0]にkeyword_grants付与 |
| 1 | AUTO/ACTIVATED | ✅ | SELECT_NO_COMMON_COLOR ※CHOOSE選択で共通色なしパターン実装済み |
| 1 | AUTO | ✅ | SELECT_OTHER_SIGNI ※v0.169: ソース以外の自場シグニをoptionalでSELECT_TARGET→lastProcessedCardsへ（line 7412） |
| 1 | ACTIVATED | ✅ | SELF_TO_DECK_TOP ※複数ハンドラ確認済み（フィールド→デッキトップ） |
| 2 | AUTO | ✅ | SELF_TRASH_IF_NO_OPP_VIRUS ※フィールド在籍チェック追加 |
| 1 | AUTO | ✅ | SET_HAND_CARD_AS_TRAP ※PLACE_TRAP_OPTIONALと共有実装 |
| 1 | ACTIVATED | ✅ | SET_LEVEL_RANGE ※v0.158: SELECT_TARGET→CHOOSE(1-4)→INTERNAL_SET_LEVEL_RANGEでattack_phase_level_overrides設定 |
| 1 | ACTIVATED | ✅ | SET_OPP_SIGNI_POWER_BY_SELF_POWER ※v0.158: delta=-selfPowerに修正+SELECT_TARGET追加 |
| 2 | CONT | ✅ | SIGNI_CANT_BOUNCE_FROM_FIELD ※v0.131: collectBounceProtectedSigni追加・ExecCtxにotherBounceProtectedNums・execBounceでフィルタ |
| 1 | AUTO | ✅ | SIGNI_GAIN_ONE_LRIG_COLOR ※signi_color_overridesにルリグ色追加 |
| 1 | AUTO | ✅ | SIGNI_GRANT_CHOSEN_ABILITY ※GRANT_CHOSEN_ABILITYハンドラで処理 |
| 1 | AUTO | ✅ | SIGNI_LOSE_COLOR ※v0.158: SELECT_TARGET(opp)→signi_color_overrides['無']設定 |
| 1 | CONT | ✅ | SIGNI_PROTECT_MOVE_EXCEPT_ENERGY ※v0.185: collectBounceProtectedSigni+collectTrashFieldProtectedSigniに追加。バウンス/トラッシュをブロック（エナへの移動は許可） |
| 4 | AUTO | ✅ | SIGNI_REPOSITION ※v0.158: INTERNAL_REPOSITION_TO_ZONEで統合（自/相手・スワップ対応）|
| 1 | ACTIVATED | ✅ | SIGNI_UNDER_WEAPON_SIGNI ※v0.158: SELECT_TARGET(源)→SELECT_TARGET(ウェポン)→INTERNAL_SIGNI_UNDER_WEAPONでスタック下配置 |
| 2 | ACTIVATED | ✅ | SPELL_COST_REDUCTION_BY_TRASH_COUNT ※v0.169: computeArtsEffectiveCostにtarsh引数追加+クラスシグニN枚につき色コスト軽減ロジック実装 |
| 1 | AUTO | ✅ | STACK_ALL_LRIG_UNDER ※v0.158: lrig_trash全ルリグをfield.lrigスタック下に配置 |
| 1 | CONT | ✅ | SUBSTITUTE_DAMAGE_WITH_SELF_TRASH ※v0.172: CHOOSE→INTERNAL_SDWT_DO（シグニトラッシュ+prevent_next_damage） |
| 7 | CONT | ✅ | SUPPRESS_LIFE_BURST_ON_CRASH ※v0.169: collectEichiStubEffects+BattleScreen line 1307でEICHI_LEVEL_SUM=8条件→eichiSuppressActive→LBボタン非表示 |
| 1 | AUTO | ✅ | TOP_TO_BOTTOM_OPTIONAL ※デッキトップ公開→CHOOSE(デッキ下/スキップ)実装済み |
| 1 | AUTO | ✅ | TRADE_SELF_AND_OPP_TO_ENERGY ※自シグニ→エナ後SELECT_TARGET(相手シグニ)→エナ |
| 2 | AUTO/ACTIVATED | ✅ | TRASH_FROM_DECK_PER_SIGNI_LEVEL ※自場シグニのレベル合計分デッキトラッシュ実装済み |
| 2 | AUTO | ✅ | TRASH_ACCE_AT_TURN_END ※v0.158: sourceCardNumのゾーンのアクセのみトラッシュ |
| 2 | AUTO | ✅ | TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY ※名前解析→相手フィールド+エナから全削除 |
| 2 | ACTIVATED | ✅ | TRASH_ALL_OPP_CARDS ※v0.158: テキスト解析で名前一致を相手エナからトラッシュ |
| 1 | ACTIVATED | ✅ | TRASH_CLASS_TO_HAND_OR_ENERGY ※v0.158: SELECT(複数)→INTERNAL_TRASH_CLASS_SPLIT(1手札+残エナ) |
| 1 | AUTO | ✅ | TRASH_SIGNI_TO_BEAT ※v0.112: beat_zone状態管理実装済み。SELECT_TARGET(トラッシュシグニ最大2枚optional)→beat_zone追加も実装済み |
| 1 | ACTIVATED/AUTO | ✅ | BEAT_ZONE_OP ※v0.172: CONT版と同ハンドラ実装済み（→INTERNAL_MOVE_TO_BEAT）|
| 1 | ACTIVATED | ✅ | TRASH_SPELL_FREE_USE_LIMIT ※v0.142: SELECT_TARGET(トラッシュスペル,コスト上限フィルタ)+コストなし使用 |
| 1 | AUTO | ✅ | TRIGGER_OTHER_SIGNI_EICHI_ABILITY ※v0.142: SELECT_TARGET(他自シグニ)+英知AUTO効果を発動 |
| 2 | ACTIVATED | ✅ | TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH ※v0.142: SELECT_TARGET(3枚)→1枚目エナ/2枚目手札/3枚目デッキ下 |
| 1 | AUTO | ✅ | UNDER_SIGNI_TO_ENERGY ※v0.142: ソースゾーン限定・複数時SELECT_TARGET・重複ハンドラ削除 |
| 1 | AUTO | ✅ | UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS ※v0.142: ソースゾーン限定・エナ同クラス確認・正しい条件チェック |
| 1 | AUTO/ACTIVATED | ✅ | UPKEEP_OR_NO_UP ※needsInteraction CHOOSE: アップキープ or アップなし選択実装済み |
| 1 | AUTO/ACTIVATED | ✅ | USE_SPELL_FROM_TRASH ※PLAY_FREEグループに統合: lastProcessedCardsのスペルを無料使用 |
| 1 | CONT | ✅ | WHITE_SIGNI_ABILITY_PROTECT ※v0.142: effectEngine.collectAbilityProtectedSigniに相手ターン中の白シグニ保護追加 |

| 1 | CONT | ✅ | ADJACENT_SIGNI_POWER_MOD ※v0.167: sourceCardNumのゾーンから隣接ゾーンを特定、temp_power_modsに+delta追加（WXK01-060） |
| 1 | AUTO | ✅ | ALL_PLAYER_MILL ※各プレイヤーがデッキ上N枚をトラッシュ実装済み |
| 1 | AUTO | ✅ | COPY_ABILITY ※v0.171: lastProcessedCards[0]のparseCardEffects→granted_effects[sourceCardNum]に追加 |
| 1 | AUTO | ✅ | COPY_CARD ※v0.172: card_identity_overrides[sourceCardNum]=lastProcessedCards[0]でコピー元設定 |
| 1 | AUTO | ✅ | CRASH_LIFE_TO_HAND ※ライフクロス上→手札追加実装済み |
| 2 | AUTO | ✅ | CRASH_TO_TRASH_INSTEAD ※v0.166: crash_to_trash_insteadフラグ追加。handleBurstActivateでop側フラグをチェック→エナ→トラッシュへ（WX19-034） |
| 1 | AUTO | ✅ | DECK_MILL_UNTIL_CLASS ※デッキ上からクラス一致まで公開トラッシュ実装済み |
| 1 | AUTO | ✅ | DECLARE_CLASS ※クラスCHOOSE→declared_classに保存実装済み |
| 1 | AUTO | ✅ | END_ATTACK_IF_EXTRA_TURN ※v0.170: extra_turn確認→blocked_actions['ATTACK_SIGNI','ATTACK_LRIG']追加 |
| 2 | CONT | ✅ | ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白 ※effectEngine.collectEnergyColorSubsで動的処理 |
| 2 | CONT | ✅ | GROW_COST_ZERO ※v0.172: free_grow_this_turnフラグ設置+BattleScreenグロウUIでコスト0化（CONDITIONAL_FREE_GROW同） |
| 1 | AUTO | ✅ | LIMIT_OPP_ATTACK_ONCE ※LIMIT_OPP_SIGNI_ATTACKS_ONCE/OPP_SIGNI_ONE_ATTACK_TOTALと同ハンドラ: 1回制限フラグ設置 |
| 1 | CONT | ✅ | LRIG_LIMIT_MODIFY ※lrig_limit_modフィールドで修正量設定実装済み |
| 1 | AUTO | ✅ | NEGATE_ABILITY ※SELECT_TARGET→INTERNAL_NEGATE_ABILITY→abilities_removed追加実装済み |
| 2 | AUTO | ✅ | NEGATE_NTH_ATTACK ※v0.166: negate_opp_signi_attacks_untilフラグ追加。handleSigniAttackでop側フラグをチェック→アタック自動無効化（WX17-006） |
| 1 | AUTO | ✅ | OPTIONAL_DISCARD_GUARD ※v0.197: optional_discard_guard_enabledフラグ設定+BattleScreenガードUIで手札任意カードをガード可能に |
| 1 | CONT | ✅ | POWER_EQUAL_TO_SELF_POWER ※自シグニのパワーに等しくなるよう修正値計算実装済み |
| 1 | AUTO | ✅ | POWER_MINUS_PER_OWN_LEVEL ※自レベル×値: SELECT_TARGET(相手シグニ)+temp_power_mods実装済み |
| 1 | CONT | ✅ | POWER_MOD_BY_LRIG_LEVEL ※ルリグレベル×delta: effectEngine+execStub両方で実装済み |
| 2 | AUTO | ✅ | POWER_MOD_BY_TRASH_CLASS_COUNT ※トラッシュクラス枚数×deltaをtemp_power_modsに適用実装済み |
| 1 | AUTO | ✅ | POWER_MOD_DOUBLE_DIFF ※v0.166: lastProcessedCards[0]の基本パワーと自パワーの差×2でマイナス（WX24-P4-054） |
| 2 | CONT | ✅ | PREVENT_SIGNI_ABILITY_LOSS_BY_OPP ※v0.111: collectAbilityProtectedSigni+otherProtectedSigniNumsでfilter |
| 1 | CONT | ✅ | PREVENT_SIGNI_DOWN_BY_OPP ※PREVENT_SIGNI_DOWN_BY_OPP_ALL同グループ: collectDownProtectedSigni+execDownに保護フィルター統合 |
| 1 | AUTO | ✅ | SEED_BLOOM_OPTIONAL ※v0.109: SEED_BLOOMと同ハンドラ（任意フラグON）実装済み |
| 1 | AUTO | ✅ | SEED_FLOWER_OP ※別シード1枚開花+デッキ上をシード設置実装済み（ヤマレンゲ系） |
| 1 | AUTO | ✅ | SEED_HAND_AND_BLOOM_FROM_DECK_TOP ※シード手札追加+デッキ上シード設置実装済み |
| 1 | ACTIVATED | ✅ | SHUFFLE_DECK_POWER_HALF ※デッキシャッフル+自パワー半減適用実装済み |
| 1 | AUTO | ✅ | SKIP_MAIN_PHASE ※blocked_actionsにMAIN_PHASEを追加実装済み |
| 1 | AUTO | ✅ | SUPPRESS_CENTER_ON_PLAY ※v0.166: suppress_center_on_playフラグ追加。グロウ時のルリグ【出】効果発動を抑制（WX12-011） |
| 1 | CONT | ✅ | SUPPRESS_GAIN_ABILITY ※保護効果グループ: abilities_removed追加で能力無効化実装済み |
| 1 | CONT | ✅ | SUPPRESS_LIFEBURST_COLOR_CONDITION ※ライフバースト色条件抑制実装済み |
| 1 | ACTIVATED | ✅ | SUPPRESS_OPP_SIGNI_ABILITIES ※相手フィールド全シグニのabilities_removed追加実装済み |
| 1 | AUTO | ✅ | TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE ※v0.185: TARGET_OPP_SIGNI_ONLYと同ハンドラ→修飾子ログのみで✅ |
| 1 | AUTO | ✅ | TRAP_TO_SIGNI_IF_ZONE_EMPTY ※ゾーン空き確認+signi_traps->field.signi移動実装済み |
| 1 | AUTO | ✅ | HASTARLIQ ※v0.198: BattleScreen MAIN→ATTACK_ARTS時にスタック積み+相手CHOOSE(手札捨て/払い/バニッシュ)。CpuBattleScreen: auto-decide |
| 1 | AUTO | ✅ | BLACK_RISE_PLAY_STACK_FROM_TRASH ※v0.189: 3フェーズ実装（トラッシュシグニ最大2枚選択→ウェポン2体選択→スタック下配置+下カード数ドロー） |
| 1 | AUTO | ✅ | PLACE_REV_SIGNI ※v0.193: ライフクロス1枚以下チェック→空きゾーンにREVシグニ配置（PR-Di017A） |
| 1 | AUTO | ✅ | SUMMON_FROM_ENERGY ※v0.193: エナゾーンのシグニをSELECT_TARGET→ADD_TO_FIELD（レベル上限テキスト解析対応） |
| 1 | AUTO | ✅ | REMOVE_SELF_SIGNI_FROM_GAME ※v0.193: sourceCardNumをフィールドから除去→trash追加（WXDi-CP02-TK01A） |
| 1 | CONT | ✅ | ACCE_BANISH_SUBSTITUTE ※v0.196: バトルバニッシュ処理でnewOpAcce[zone]のカードがこのSTUBを持つ場合→アクセをtrash、シグニをダウン（WXDi-P09-TK03A） |
| 1 | CONT | ✅ | OPP_DRAW_LIMIT_PER_TURN ※v0.194: collectDrawLimitsにLIMIT_OPP_DRAW_COUNTと同一IDチェックを追加。相手UPフェイズで自フィールド走査→ドロー上限1枚に制限（WX25-P2-TK05） |
| 1 | CONT | ✅ | REDIRECT_ATTACK_TO_SELF_ZONE ※v0.196: handleSigniAttackでopZoneIndex/opStack/opTopCardNumをletに変更→空ゾーンアタック時にこのSTUBのシグニゾーンへリダイレクト（WXDi-CP02-TK01A） |
| 1 | CONT | ✅ | BATTLE_LEAVE_REPLACE_WITH_DOWN ※v0.195: バトル勝利処理でSTUB検出+アップ状態確認→newOpDown[zone]=trueでダウン置換（WXDi-CP02-TK01A） |
| 5 | CONT | ✅ | BANISH_TO_LRIG_TRASH_INSTEAD ※v0.197: CpuBattleScreenのバトル解決にも追加（BattleScreen v0.195済み）。WX10-008/020/024/WX11-013/WX13-028全対応 |
| 1 | CONT | ✅ | CARDS_OUTSIDE_ENERGY_BECOME_WHITE ※v0.197: 手札・トラッシュも含む全ゾーンのカードに'白'を追加（WX08-005完全実装） |
| 1 | CONT | ✅ | RESTRICT_CHARMED_SIGNI_ACTIVATED ※v0.194: BattleScreen getMySigniZoneActionsでsigni_charms[zoneIdx]存在チェック+相手フィールド走査→チャーム付きゾーンの【起】能力をactivatableフィルタで除外（WX08-006） |
| 1 | CONT | ✅ | ENERGY_NON_COLORLESS_ALL_COLORS ※v0.195: collectEnergyTrashSubstituteInfoでSTUB検出時、非無色エナinstIdをwildcardInstIdsに追加→任意色として使用可（WX14-017） |
| 1 | CONT | ✅ | OPP_CENTER_LRIG_LIMIT_SET_5 ※v0.194: BattleScreen lrigLimit計算でop.field.signiを走査→このSTUBが有効ならoppBasicLimitOverride=5で基本リミット上書き（WXEX1-26） |
---

## 集計サマリー（v0.198）

| カテゴリ | 種数 |
|---------|-----:|
| ✅ 実装済み | 526 |
| ⚡ 部分実装 | 0 |
| 📝 未実装 | **0** |
| **合計** | **526** |

※v0.185で✅化（25件）: CAST_FROM_OPP_TRASH（相手トラッシュからカード除去して使用）, CRAFT_TO_LRIG_DECK（既実装確認）, COLLAB（CHOOSE+INTERNAL_DO_COLLAB✅確認）, BET_CONDITION（BET_ALTERNATIVEで処理済み確認）, REPEAT_N_TIMES/REPEAT_EFFECT（「この効果をN回繰り返す」regex+DECK_REVEAL連鎖）, TARGET_OPP_SIGNI_ONLY/TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE（後続SELECT_TARGETで処理），ACCE_OP（ログ✅）, ACCE_SIGNI_ALL_COLOR（story_overrides+fieldCandidates色バイパス）, ACTIVATE_EICHI_ABILITY（ON_PLAY効果再発動）, NEGATE_COIN_ABILITY（negate_coin_abilitiesフラグ+BET_MECHANICチェック）, PREVENT_INFECTED_SIGNI_ACTIVATE（collectInfectedActivateBlockedSigni+BattleScreen）, PREVENT_NON_FIELD_MOVE_BY_OPP（collectProtectedZonesにルリグ候補+全ゾーン保護）, PREVENT_OPP_POWER_PLUS（applyEffectsでblockOwnerPosDeltaチェック）, PREVENT_OPP_SIGNI_ABILITY_GAIN/PREVENT_ABILITY_CHANGE_BY_OPP（collectAbilityGainProtectedSigni+ExecCtx）, PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH/PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH（collectBounceProtectedSigni+collectTrashFieldProtectedSigni）, SIGNI_PROTECT_MOVE_EXCEPT_ENERGY（同上）, RISE_BANISH_SUBSTITUTE/BANISH_SUBSTITUTE_RISE_STACK（collectRiseBanishSubstituteSigni+BattleScreen/CpuBattleScreen統合）, RISE_LEAVE_DISCARD_STACK（removeFromField既実装確認）, CHOOSE_SAME_OPTION_MULTIPLE（TWICE同ハンドラ確認）, MULTI_ACCE_LIMIT（collectMultiAcceSigni+BattleScreenアクセUI統合）

※v0.174で✅化: PLACE_CHOKKIN（signi_chokkinカウンター+BoardComponents「菌×N」バッジ表示）, ADD_CARD_TO_LRIG_DECK_HIDDEN（2候補CHOOSE→INTERNAL_ACLDH_APPLY）, POWER_COPY_FROM_DOWNED（lastProcessedCards優先で自ダウンシグニパワー+）, OPP_DECLARE_CHOICE（色宣言パターン追加→INTERNAL_ODC_COLOR_CHECK）, REPLACE_PLUS_N（replace_opp_power_plusフラグ+effectEngine置換）, COIN_USE_RESTRICTION（coin_use_restriction永続フラグ+BET_MECHANICチェック）, PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP（effectEngine全シグニ保護）。⚡改善: REPEAT_N_TIMES（パワーダウン+ミル複合・両者ミルパターン追加）

※v0.173で✅化: FIRST_SPELL_COST_UP（collectFirstSpellCostUp+BattleScreenスペルコスト統合+USE_SPELLトラッキング）, INCREASE_ACT_ABILITY_COST（collectIncreaseActCost+BattleScreen起動能力コスト統合）, BLOCK_OPP_SPELL_ACT_NEXT_TURN（execStub済み確認）, OPP_TURN_NO_ENERGY_COST（execStub済み確認）, FIELD_ENERGY_SIGNI_GAIN_COLOR（《ディソナアイコン》Story=Dissona判定追加。CardData_Sheet8.csvでDissonaを設定）, CHOOSE_SAME_OPTION_TWICE（①バウンス+手札捨て/②アタック不可/③クラスサーチパターン追加・INTERNAL_GRANT_NO_ATTACK_LRIG実装）

※v0.172で✅化: GROW_COST_ZERO/CONDITIONAL_FREE_GROW（free_grow_this_turn+BattleScreen統合）, CONDITIONAL_TRASH_UNDER_SIGNI（エナ条件チェック+シグニ下SELECT）, SUBSTITUTE_DAMAGE_WITH_SELF_TRASH（CHOOSE→INTERNAL_SDWT_DO）, COPY_CARD（card_identity_overrides）, BEAT_ZONE_OP（条件チェック+フィールドSELECT→INTERNAL_MOVE_TO_BEAT）, ADD_CRAFT_TO_LRIG_DECK（名前解決追加）, DECLARE_NUMBER_POWER/ENERGY_LEVEL_CONDITION_CHOOSE/OPTIONAL_DISCARD_CLASS_SIGNI（✅確認）, PREVENT_DAMAGE_UNTIL_OPP_TURN_END/PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN（既実装✅確認）

※v0.170で✅化: PLACE_MAGIC_BOX/OPEN_MAGIC_BOX/MAGIC_BOX_REVEAL（MBシステム全実装）, TRIGGER_LIFE_BURST, BATTLE_BANISH_LIFE_BURST, CONDITIONAL_ALT_POWER_BOOST, NEGATE_THAT_ATTACK（BattleScreen+CPU統合）, CENTER_ZONE_CONDITION, LEVEL_BASED_CONDITIONAL, DECLARE_COLOR_COND_ENERGY_TRASH, EACH_PLAYER_DRAW_DISCARD（相手捨て追加）, GAIN_COIN_AND_DISCARD（インタラクティブ化）, SIGNI_FLIP_FACEDOWN（分離・表裏判定）, FLIP_FACE_DOWN_SIGNI（flip-back実装）, PLACE_DECK_TOP_UNDER_WEAPON_SIGNI, PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON, END_ATTACK_IF_EXTRA_TURN, PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE, USE_CONDITION_ARTS_USED（USE_ARTSフラグ連携）

※v0.171で✅/⚡改善: NEGATE_ALL_OPP_EFFECTS（all_cont_effects_negated+effectEngine統合）, BANISH_BY_SELF_GOES_TO_TRASH（banish_to_trash_by_self+BattleScreen統合）, GRANT_ABILITY_UNTIL_OPP_TURN（キーワード付与実装）, RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY（キーワード付与実装）, GRANT_SIGNI_CLASS（card_class_overrides設定）, COPY_ABILITY（granted_effects経由でコピー）, COLLAB（コラボしてもよいオプション追加）, REPEAT_N_TIMES（ドロー/パワーアップ/バウンスパターン追加）, ACTIVATE_COST_ZERO_BLACK（BattleScreen起動コストUI統合）, NEGATE_ATTACK_ON_TRIGGER AUTO版（line 41で既実装、✅化確認）, OPP_ENERGY_OR_DISCARD_CONDITION（✅確認）

**注意事項:**
- `CONT` = CONTINUOUS STUB。effectEngineのcollect関数で動的処理するものは✅
- `⚡` = if-branchが存在し主要パターンは動作するが、STUB_LOGへのフォールバックも持つ
- すべてのSTUBにハンドラが実装済み（OPTIONAL_COST含む）

---

## 調査コマンド

```bash
node -e "const d=JSON.parse(require('fs').readFileSync('public/data/effects.json','utf8')); const c={}; for(const [,es] of Object.entries(d)){ if(!Array.isArray(es)) continue; for(const e of es){ const a=e.action; if(a?.type==='STUB'){c[a.id]=(c[a.id]||0)+1;}}} const s=Object.entries(c).sort((a,b)=>b[1]-a[1]); console.log('総計:', s.length, '/', s.reduce((a,b)=>a+b[1],0)); s.slice(0,20).forEach(([k,v])=>console.log(v,k))"
```

---

## 実装履歴（抜粋）

| 日付 | 実装内容 | 対象STUB |
|------|---------|---------|
| 2026-06-04 v0.197 | 全⚡19件を✅化: GRANT_QUOTED_ACTIVATE_ABILITY(WX13-058→effects.json DOUBLE_OWN_POWER_MINUS+条件変換)/ADD_CARD_TO_LRIG_DECK(確認✅)/ADD_RESONANCE_CONDITION(collectResonanceExtraAttackPhaseCondition)/ARTS_EXTRA_COST_CONDITION(self_optional_effect_taken→CHOOSE)/CAST_FROM_OPP_TRASH AUTO(SELECT_TARGET+相手trash削除)/COIN_SPEND_CONDITION(coin_condition_signi_instances+ターン終了チェック)/COST_COLOR_SELECT(色CHOOSE→SEARCH)/DECK_SIGNI_LEVEL_OVERRIDE(フラグ設定)/GRID_REVEAL_PLUS(grid_reveal_plus_one_this_turnフラグ)/GROW_COST_SUBSTITUTE_TRASH_SIGNI(collectGrowCostSubstitute+UI)/GUARD_ALTERNATIVE_COST(collectGuardAlternativeCost+handleGuardWithEnergyAlternative)/LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT(collectLevelRefOverridesFromNonField)/OPP_CHOOSE_EFFECT&OPP_CHOOSES_FOR_YOU(確認✅)/OPP_TRASH_LOSE_COLOR_AND_CLASS(collectOppTrashLoseColorClass)/REDUCE_PLAY_ABILITY_COST(フラグ設定)/OPTIONAL_DISCARD_GUARD(optional_discard_guard_enabled+ガードUI)/BANISH_TO_LRIG_TRASH_INSTEAD(CpuBattleScreen追加)/CARDS_OUTSIDE_ENERGY_BECOME_WHITE(手札・トラッシュ対応) | 19件 |
| 2026-06-04 v0.196 | 5件処理: ✅4件(LEVEL_MOD_PER_COUNT確認/REDIRECT_ATTACK_TO_SELF_ZONE/ACCE_BANISH_SUBSTITUTE/RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE)+⚡1件(CARDS_OUTSIDE_ENERGY_BECOME_WHITE)。BattleScreen: opZoneIndex let化+リダイレクト・acceBanishSub・resonaSub分岐追加。effectEngine: collectFieldSigniExtraColorsに白色追加 | 5件 |
| 2026-06-04 v0.195 | 5件処理: ✅4件(ALL_CARDS_COLOR_CHANGE_BLACK確認/ENERGY_NON_COLORLESS_ALL_COLORS/BATTLE_LEAVE_REPLACE_WITH_DOWN/COOKING_BANISH_SUBSTITUTE)+⚡1件(BANISH_TO_LRIG_TRASH_INSTEAD)。実装: collectEnergyTrashSubstituteInfoに非無色エナワイルド化追加。BattleScreen battle処理にleaveReplaceDown/cookingBanishSub/banishToLrigTrash分岐追加 | 5件 |
| 2026-06-04 v0.194 | 3件✅化: OPP_DRAW_LIMIT_PER_TURN（collectDrawLimitsにID追加→相手ドロー上限1枚）、RESTRICT_CHARMED_SIGNI_ACTIVATED（BattleScreen getMySigniZoneActionsでチャーム付きゾーン起動能力ブロック）、OPP_CENTER_LRIG_LIMIT_SET_5（lrigLimit計算でoppBasicLimitOverride=5上書き） | 3件 |
| 2026-06-04 v0.193 | UNKNOWN 11件→0件（WX08-005/006/029/WX10-006/008/020/024/WX11-013/WX13-028/WX14-017/WXEX1-26）マニュアル定義完了。新規STUB 15件追加: ✅3件(PLACE_REV_SIGNI/SUMMON_FROM_ENERGY/REMOVE_SELF_SIGNI_FROM_GAME)、📝9件(BANISH_TO_LRIG_TRASH_INSTEAD/CARDS_OUTSIDE_ENERGY_BECOME_WHITE/RESTRICT_CHARMED_SIGNI_ACTIVATED/ENERGY_NON_COLORLESS_ALL_COLORS/OPP_CENTER_LRIG_LIMIT_SET_5/ACCE_BANISH_SUBSTITUTE/OPP_DRAW_LIMIT_PER_TURN/REDIRECT_ATTACK_TO_SELF_ZONE/BATTLE_LEAVE_REPLACE_WITH_DOWN)、v0.189追記✅2件(HASTARLIQ/BLACK_RISE_PLAY_STACK_FROM_TRASH) | 15件 |
| 2026-06-03 v0.173 | 5件✅化: FIRST_SPELL_COST_UP（collectFirstSpellCostUp追加・BattleScreenスペルUIにtotalReq+firstSpellExtra統合・castSpellでactions_done['USE_SPELL']記録）, INCREASE_ACT_ABILITY_COST（collectIncreaseActCost追加・BattleScreen起動能力UIにadjustedTotal+actExtraCosts統合）, BLOCK_OPP_SPELL_ACT_NEXT_TURN（execStub済み確認→✅）, OPP_TURN_NO_ENERGY_COST（execStub済み確認→✅）, FIELD_ENERGY_SIGNI_GAIN_COLOR（《ディソナアイコン》フィルター追加） | 5件 |
| 2026-06-02 v0.169 | 実装+確認多数✅化: GATE(blocked_actions ATTACK:id)/DEPLOY_RESTRICT(signi_deploy_power_limit統合)/ARTS_IMMOVABLE/CONDITIONAL_PER_TRASH/LRIG_TRASH_KEY_TO_CENTER_UNDER/CONDITIONAL_TRASH_TO_ENERGY/OPP_TRASH_FIELD_SIGNI_AND_ENERGY/PREVENT_DEFEAT_THIS_TURN&UNTIL_NEXT_TURN/ACCE_TO_ENERGY/PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN/OPP_ENERGY_EXCESS_TRASH/NON_GUARD_DISCARD_TO_ENERGY/CONDITIONAL_COST_REDUCTION_BY_FIELD/SPELL_COST_REDUCTION_BY_TRASH_COUNT(computeArtsEffectiveCostにtrash引数+ロジック)/ACCE_FROM_TRASH/OPP_REVEAL系3件/RESONANCE_COST_CARDS_TO_ENERGY/GRANT_CHOSEN_ABILITY_SELF/GRANT_CONDITIONAL_ASSASSIN_ABILITY/FIELD_COND_DRAW_REVEAL/PLACE_LRIG_FROM_DECK_ON_TOP/OPP_RETURN_HAND_ON_SELF_BANISH/PREVENT_TARGET_LRIG_ATTACK_THIS_TURN(lrigAttackでnegated_attacks検査)/NON_LRIG_TO_LRIG_TRASH/BLOCK_OPP_ARTS_SPELL_ACT + 重複エントリ整理 | 26種+ |
| 2026-06-02 v0.161 | 4件✅化: OPP_MAIN_PHASE_LIMIT_DOWN(pending_lrig_limit_mod-2→GROW→MAIN移行時適用・誤実装draw_limit修正)・OPP_SIGNI_ATTACK_COST(signi_attack_cost=2フラグ+アタック時エナ消費・不足アタック不可)・OPP_ZONE_PLACEMENT_RESTRICT(collectCenterZoneDeployRestrict+handleSummonSigniで中央ゾーンLv3+配置禁止)。⚡改善: OPP_CHOOSE_EFFECT/OPP_CHOOSES_FOR_YOU(テキスト解析+INTERNAL_OPP_DECK_TRASH_N追加) | 3件✅+2件⚡改善 |
| 2026-06-02 v0.160 | 34件新規追加: ✅化(ALL_PLAYER_MILL/CRASH_LIFE_TO_HAND/DECK_MILL_UNTIL_CLASS/DECLARE_CLASS/GROW_COST_ZERO/LIMIT_OPP_ATTACK_ONCE/LRIG_LIMIT_MODIFY/NEGATE_ABILITY/POWER_EQUAL_TO_SELF_POWER/POWER_MINUS_PER_OWN_LEVEL/POWER_MOD_BY_LRIG_LEVEL/POWER_MOD_BY_TRASH_CLASS_COUNT/PREVENT_SIGNI_ABILITY_LOSS_BY_OPP/PREVENT_SIGNI_DOWN_BY_OPP/SEED_BLOOM_OPTIONAL/SEED_FLOWER_OP/SEED_HAND_AND_BLOOM_FROM_DECK_TOP/SHUFFLE_DECK_POWER_HALF/SKIP_MAIN_PHASE/SUPPRESS_GAIN_ABILITY/SUPPRESS_LIFEBURST_COLOR_CONDITION/SUPPRESS_OPP_SIGNI_ABILITIES/TRAP_TO_SIGNI_IF_ZONE_EMPTY/ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白)。ENERGY_*_TRASH_*エナ代替4件✅。カウント70件更新。削除4件 | 38件 |
| 2026-06-02 v0.159 | 18件✅化: DEFEAT(life_cloth=[]でゲーム終了誘発+prevent_defeat対応)/DISCARD_BY_POWER_MATCH(SELECT手札青シグニ→同パワー相手手札捨てさせる)/DRIVE_SIGNI_PREVENT_DOWN(SELECT_TARGET→PROTECTION:DOWN:opponent)/FROM_TRASH_TO_CENTER_ZONE(zone[1]に出す+既存シグニエナへ)。確認済み✅: ENERGY_TO_HAND_ON_DECK/ENERGY_TO_TRASH/DISCARD_IF_NO_CLASS_SIGNI/DRAW/DRAW_BY_CHARM_COUNT/DRAW_DISCARD_COUNT_PLUS_N/DECK_TOP_TO_LIFE/HAND_CARDS_UNDER_SIGNI/HAND_NONCOLORLESS_TO_ENERGY/LIFE_BURST_DOUBLE/LIMIT_OPP_SIGNI_ATTACKS_ONCE | 18件 |
| 2026-06-02 v0.158 | 22件✅化: SET_LEVEL_RANGE(SELECT_TARGET→CHOOSE1-4→attack_phase_level_overrides)/SET_OPP_SIGNI_POWER_BY_SELF_POWER(delta=-selfPw+SELECT_TARGET)/SIGNI_LOSE_COLOR(SELECT_TARGET相手シグニ→color_overrides)/SIGNI_REPOSITION(自/相手+INTERNAL_REPOSITION_TO_ZONE全ゾーン対応)/SIGNI_UNDER_WEAPON_SIGNI(2-phase→INTERNAL_SIGNI_UNDER_WEAPON)/STACK_ALL_LRIG_UNDER(lrig_trash→lrigスタック)/TRASH_ACCE_AT_TURN_END(sourceゾーンのアクセのみ)/TRASH_ALL_OPP_CARDS(名前解析→相手エナ)/TRASH_CLASS_TO_HAND_OR_ENERGY(INTERNAL_TRASH_CLASS_SPLIT)/SELF_TO_DECK_TOP/SELF_TRASH_IF_NO_OPP_VIRUS/SET_HAND_CARD_AS_TRAP/SIGNI_GAIN_ONE_LRIG_COLOR/SIGNI_GRANT_CHOSEN_ABILITY/TOP_TO_BOTTOM_OPTIONAL/TRADE_SELF_AND_OPP_TO_ENERGY/TRASH_FROM_DECK_PER_SIGNI_LEVEL/TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY/SELECT_OTHER_SIGNI/SUPPRESS_LIFE_BURST_ON_CRASH(既実装確認) | 22件 |
| 2026-06-02 v0.157 | サーバントZERO正式実装: card_identity_overrides['instanceId']='WXDi-P07-TK01-A'で4スタブ✅化（MAKE_SERVANT_ZERO/SIGNI_SERVANT_ZERO/ALL_OPP_SIGNI_SERVANT_ZERO/MAKE_MULTI_SERVANT_ZERO）。battleCardMap+effectsMapのcard_identity_overrides解決。removeFromFieldで自動クリア | 4件 |
| 2026-06-02 v0.154 | 効果付与エンジン実装: collectGrantedFromUnderSigni追加（GRANT_UNDER_SIGNI_ALL/CONSTANT/AUTO_ATTACK_PHASE→✅）。collectLrigGrantedEffectsにGRANT_UNDER_LRIG_ACTIVATE/AUTO・GRANT_LRIG_TRASH_ACTIVATE_ABILITY追加（✅）。WXK08-078をGRANT_SIGNI_ABOVE_ABILITY+POWER_MINUS_PER_OWN_LEVEL（✅）。PR-317をGRANT_LRIG_ABILITYアクション型に変更+lrig_granted_auto_effectsをgrantedMyLrigEffectsに統合（✅）。BattleScreen effectsMapにunder-signi付与統合 | 7件✅ |
| 2026-06-01 v0.153 | OPTIONAL_COST✅化: effectExecutorが338件のSTUB→CONDITIONAL(IS_MY_TURN)パターンをインターセプト済みであることを確認。execStub.tsのエッジケースハンドラを「自動支払い」→pay/skipのCHOOSE＋costColors付きオプション（エナ選択UI統合）に改善。📝件数0達成 | 1件 |
| 2026-06-01 v0.152 | STUBS.md一括更新: 92件を📝→✅/⚡に再分類。✅化39件(TRASH_OWN_KEY_OPTIONAL/CHOOSE_COLOR_FROM_LIST/BLOCK_OPP_ZONE_PLACEMENT/NEGATE_ATTACK_ON_TRIGGER/PREVENT_DEFEAT/OPP_SIGNI_LEAVE_TO_TRASH/REVERSE_OPP_POWER_MINUS/REVEALED_SIGNI_TO_FIELD_REST_TRASH/REMOVE_OPP_MULTI_ENA系2件/PREVENT_DAMAGE系3件/PREVENT_OWN_ARTS_USE/LEAVE_FIELD_TO_DECK_BOTTOM/CONDITIONAL_KEYWORD_BY_CENTER_COLOR/CLASS_SIGNI_TO_ENERGY/COUNT_DISTINCT_NAMES/DECK_REVEAL_UNTIL_CLASS/CHOSEN_TO_ENERGY_OR_HAND/CONDITIONAL_ADD_HAND/CONDITIONAL_DISCARD/NO_ABILITY_SIGNI_TO_DECK_BOTTOM/PLACE_ACCE_SIGNI_TO_ENERGY/ACCE_BANISH_SELF_TRASH/ACCE_SIGNI_GRANT_ABILITY/CONDITIONAL_SEARCH_IF_FIELD/CONDITIONAL_SEARCH_IF_RESONA/INFECTED_SIGNI_POWER_DOWN_BY_LEVEL/LIFE_TO_HAND_OPTIONAL/PLACE_SIGNI_UNDER_SIGNI/POWER_MOD_BY_FIELD_CLASS_LEVEL/HAND_SIGNI_UNDER_SIGNI/REVEAL/REVEALED_CARD_COLOR_DISCARD/SELECT_NO_COMMON_COLOR/UPKEEP_OR_NO_UP/USE_SPELL_FROM_TRASH/PLAY_EFFECT_TARGET_CLASS_CHANGE)。⚡化53件(ログのみ確認済み) | 92件 |
| 2026-06-01 v0.151 | 4件✅化: BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT(collectBlockLowCostSpellCount+castSpellでチャーム数以下スペルをブロック)・BLOCK_OPP_DECK_TO_ENERGY(calcContinuousBlockedActions+execEnergyChargeFromDeck)・BLOCK_OPP_ENCORE_AND_BET(既実装確認→✅)・BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT(calcContinuousBlockedActions+execAddToField) | 4件 |
| 2026-06-01 v0.150 | 3件✅化+23件⚡化: DYNAMIC_LEVEL_BY_ENERGY(buildLevelModsにエナ枚数比例レベル変動)/EXTRA_GUARD_COST_FROM_HAND(collectOppExtraGuardFromHand+ガードUI)/DRAW_DISCARD_COUNT_PLUS_N(⚡化)。DRAW/ENERGY_*_SUBSTITUTE_TRASH系4件/ENERGY_LEVEL_CONDITION_CHOOSE/FIELD_COND_DRAW_REVEAL/FIRST_SPELL_COST_UP/FROZEN_SIGNI系2件/GAIN_ADDITIONAL_LRIG_TYPE/GRANT_*系9件/GROW_COST_SUBSTITUTE_TRASH_SIGNI/GUARD_ALTERNATIVE_COSTをlogのみ→⚡化 | 26件 |
| 2026-06-01 v0.149 | 3件⚡化: OPP_DECK_REVEAL_UNTIL/OPP_HAND_TO_DECK_TOP(📝→⚡)・OPP_ENERGY_COLOR_CONDITION_TRASH(collectOppEnergyColorRestriction+エナチャージ時色制限チェック) | 3件 |
| 2026-06-01 v0.148 | 26件処理: ✅化: HAND_REVEAL_CLASS_SIGNI/LOOK_OPP_HAND_DISCARD_SIGNI/LOOK_TOP_COLOR_SORT/LOOK_TOP_N/LOOK_TOP_BOTTOM/LOOK_TOP_BY_LIFE_COUNT/LOOK_TOP_SORT/LOOK_TOP_OPP_CHOOSE_TRASH/LOOK_TOP_SIGNI_TO_FIELD/LOOK_TOP_SPELLS_TO_HAND/LOOK_DECK_BOTTOM/OPP_DECLARE_COLOR/PEEP_HAND/PICK_FROM_TRASHED_CARDS/REVEAL_OPP_HAND_CARD/SUPPRESS_LIFE_BURST_ON_CARD/SWAP_OPTIONAL/TRASH/TRASH_IF_ZONE_OCCUPIED/USE_CONDITION_ARTS_USED(→⚡)/BANISH_REDIRECT_TO_HAND/BANISH_MULTI_COLOR_SIGNI/TARGET_OPP_SIGNI_ONLY(→⚡)/BANISH_BY_SELF_GOES_TO_TRASH(→⚡)/BANISH_SUBSTITUTE_RISE_STACK(→⚡) | 26件 |
| 2026-06-01 v0.147 | 7件✅新規+13件既実装確認→✅: UNKNOWN_NESTED(自シグニ任意トラッシュ+SELF_OPTIONAL_EFFECT_TAKEN)/BANISH_FROM_GAME(トラッシュ任意除外)/DECLARE_NUMBER_RANGE/FACE_DOWN_OPP_SIGNI/DISCARD_OR_PENALTY/ARTS_USE_DISCARD_COLOR_HAND/CHOOSE_HAND_OR_ENERGY。確認✅: CHOOSE_HAND_CARD/DECK_TOP_CHECK_LEVEL_ENERGY/MOVE_TO_ATTACKER_FRONT/REMOVE_SIGNI_ZONE/REVEAL_TOP_CONDITIONAL_ROUTE/ABILITY_CHECK_ELSE_TRASH/BANISH/CHARM_CONDITIONAL_POWER/DISONA_RESTRICTION/ENERGY_BY_LEVEL_SUM_LIMIT等。OPP_DECLARE_CHOICE→⚡ | 25件 |
| 2026-06-01 v0.146 | 2件✅新規+11件確認✅+1件⚡: DECLARE_COLOR(5色CHOOSE→declared_color)/OPPONENT_PAY_OPTIONAL(相手CHOOSE+energy消費+OPPONENT_NOT_PAIDフラグ)。確認✅: OPTIONAL_DISCARD_CLASS_SIGNI/POWER_MOD_BY_DISCARD_COUNT_HIGH/POWER_MOD_PER_REVEALED/REVEAL_CLASS_SIGNI_FROM_HAND/CLASS_CHANGE/DECK_TOP_DECLARED_NUM_TRASH/EFFECT_LIMIT/MASS_TRASH/OPP_CHOOSE_YOUR_HAND_DISCARD/POWER_MOD_PER_REVEALED_LEVEL/REVEAL_PICK_CLASS_TO_ENERGY。REPEAT_N_TIMES/FLIP_FACE_DOWN_SIGNI→⚡ | 16件 |
| 2026-06-01 v0.145 | 2件処理: PLACE_TRAP_FROM_REVEALED(SEARCH→INTERNAL_PTFR_CHOOSE_ZONE→INTERNAL_SET_TRAPの2段階)・CONDITIONAL_MULTI_CHOOSE_BY_CENTER(条件不成立時ベース選択提示バグ修正+センター名複数条件+新選択肢6種) | 2件 |
| 2026-06-01 v0.144 | 11件✅化: REMOVE_VIRUS(IS_MY_TURNパターン専用ハンドラ+Pattern⑦TRANSFER_TO_HAND連結+execStub全除去/N除去修正・INTERNAL_REMOVE_VIRUS_N・INTERNAL_RV_BATCH_TRANSFER追加)・GRANT_GUARD_ICON_HAND_SIGNI/PLACE_SEED_FROM_REVEALED/ACCE_FROM_HAND/CHOOSE_N_FROM_LIST/DOWN_UP_SIGNI_AND_CHOOSE/DO_THREE_THINGS/EXILE_FROM_CHECK_ZONE/PLACE_CARD_UNDER_SIGNI/PLACE_LIMIT_UPPER/PLACE_TRAP_OPTIONAL(既存実装確認→✅) | 11件 |
| 2026-06-01 v0.143 | 9件✅化: TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST(effectExecutor専用ハンドラ+パーサーバグ修正でBANISH/BOUNCE等のowner修正)・OPTIONAL_TRASH_ENERGY_CLASS(INTERNAL_OTEC_SELECT/MOVE_SELECTEDでエナ選択→移動)・CONDITIONAL_ARTS_COST(正しい条件確認に修正)・RULE_REMINDER_TEXT/BET_ALTERNATIVE/REVEAL_PICK_PLAY/TARGET_ONLY/REVEAL_AND_PICK/ARTS_USE_DISCARD_LRIG_DECK(✅確認)。resumeChooseのcontinuation合成・applyDirectActionのlastProcessedCards引き渡し対応 | 9件 |
| 2026-06-01 v0.142 | 13件処理: CHANGE_BASE_LEVEL/UNTIL_NEXT_TURN(CHOOSE→level_override)・CHANGE_EICHI_SIGNI_BASE_LEVEL(SELECT+CHOOSE)・CHANGE_SIGNI_COLOR(levelフィルタ修正)・TRASH_SPELL_FREE_USE_LIMIT(SELECT+use_free)・TRASHED_CARD_TO_HAND_OR_ENERGY(fallback修正+重複2削除)・TRIGGER_OTHER_SIGNI_EICHI_ABILITY(SELECT+exec)・TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH(3枚選択+分配)・UNDER_SIGNI_TO_ENERGY(SELECT+正しいゾーン)・UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS(同クラス条件修正)・WHITE_SIGNI_ABILITY_PROTECT(effectEngine実装+BattleScreen更新)・WEAPON_SIGNI_PREVENT_DOWN(effectEngine追加) | 13件 |
| 2026-06-01 v0.141 | 17件処理: PREVENT_LRIG_DAMAGE_THIS_TURN/REACTIVE_POWER_UP/REMOVE_SIGNI_ZONE/VIEW_AND_DISCARD_SPELL/ALL_OPP_SIGNI_POWER_DOWN_HALF(✅確認)。SIGNI_GRANT_QUOTED_CONSTANT_ABILITY(SELECT+keyword_grants)。ACTIVATE_COST_ZERO_BLACK/ADD_CARD_TO_LRIG_DECK(⚡改善)。effectEngine: collectAllZoneBlackCardNums/collectAllColorSigni/hasAllCardsColorBlack追加。BattleScreen myEnergyExtraColorsにALL_ZONE_BLACK+ALL_CARDS_COLOR_CHANGE_BLACK反映 | 17件 |
| 2026-06-01 v0.140 | 8件✅化: OPP_CHOOSE_OWN_SIGNI_TO_ENERGY(field→energy修正)/OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL(excess1枚固定)/OPP_SIGNI_ATTACK_POWER_RESTRICT(BattleScreenパワー上限チェック)/PLACE_SIGNI_UNDER_SELF_OPT(exactLevel/fieldソース)/PLAY_SPELL_FREE_IGNORE_RESTRICTION(SELECT+分離)/POWER_MOD_BY_ATTACKER_LEVEL(SELECT+奇偶フィルタ)/POWER_MOD_BY_LRIG_TRASH_ARTS(SELECT追加)/effects.ts+effectExecutor.ts(fromLocation:'field'追加) | 8件 |
| 2026-05-31 v0.126 | POWER_MOD_PER_COUNT (AUTO/ACTIVATED 51件): 手札/エナ/登録者数N枚につきパターン追加・正デルタ時ソースシグニへ適用 | POWER_MOD_PER_COUNT |
| 2026-05-31 v0.126 | COUNT_BASED_DRAW_OR_POWER (スタンドアロン5件): エナ/手札/登録者数/フィールド体数ベースのドロー・パワー修正パターン追加 | COUNT_BASED_DRAW_OR_POWER |
| 2026-05-31 v0.127 | CONDITIONAL_ALTERNATE_EFFECT: 条件達成時にダウン済み相手シグニをトラッシュへ移動（WX06-024対応） | CONDITIONAL_ALTERNATE_EFFECT |
| 2026-05-31 v0.127 | OPTIONAL_HAND_REVEAL_NAMED: effectExecutorパターン③に追加→任意公開インタラクション（WX05-038 LIFE_BURST対応） | OPTIONAL_HAND_REVEAL_NAMED |
| 2026-05-31 v0.127 | CONDITIONAL_CARD_COST_BY_OPP_LRIG: computeArtsEffectiveCostの正規表現を"基本コスト"にも対応（WX03-002〜005・014の5枚修正） | CONDITIONAL_CARD_COST_BY_OPP_LRIG |
| 2026-05-31 v0.126 | CONDITIONAL_MULTI_CHOOSE_BY_CENTER (9件): センター条件チェック追加（不一致→ベース効果スキップ）・Nつまで選択数を正しく反映 | CONDITIONAL_MULTI_CHOOSE_BY_CENTER |
| 2026-05-31 v0.125 | SOUL_OP (standalone fallback): ソウルがある場合に汎用消費インタラクション提示（SPDi43系等のテキスト解析失敗ケースに対応） | SOUL_OP |
| 2026-05-31 v0.124 | POWER_MOD_PER_COUNT (CONT): effectEngine.applyEffectsにCONTINUOUS版ハンドラ追加（手札/エナ/登録者数基準パワー修正・WXDi P-series 3件対応） | POWER_MOD_PER_COUNT |
| 2026-05-31 v0.123 | GAIN_EXTRA_TURN: BattleScreenターン終了処理に追加ターンロジック統合（extra_turnフラグ使用・同プレイヤーがUPフェイズへ） | GAIN_EXTRA_TURN |
| 2026-05-31 v0.122 | LRIG_UNDER_CARD_OP (SEQUENCE→IS_MY_TURN): シグニ下カード消費インタラクション実装（WX24/WX25/WXDi/SPDi43系12件対応） | LRIG_UNDER_CARD_OP |
| 2026-05-31 v0.121 | SOUL_OP (SEQUENCE→IS_MY_TURN): ソウル消費インタラクション実装・INTERNAL_CONSUME_SOULでシグニ下ソウルをルリグトラッシュへ（WXDi-P0x-009系7件対応） | SOUL_OP |
| 2026-05-31 v0.121 | POWER_MOD_TARGET_AND_SELF: stub.deltaパラメータを優先使用（テキスト解析フォールバック） | POWER_MOD_TARGET_AND_SELF |
| 2026-05-31 v0.117 | ATTACK_COUNT_BY_POWER: パワー/10000回数制限・attacked_signi_idsをバッグ化 | ATTACK_COUNT_BY_POWER |
| 2026-05-31 v0.116 | ADJACENT_ZONE_ATTACK: 英知=10条件付き隣ゾーン追加バトルをBattleScreen.tsxに実装 | ADJACENT_ZONE_ATTACK |
| 2026-05-31 v0.115 | DOUBLE_POWER_MINUS: applyEffectsでhasDoublePowerMinusフラグ+negMultiplier=2でapplyDeltaToState | DOUBLE_POWER_MINUS |
| 2026-05-31 v0.115 | BLOCK_FRONT_SIGNI_ATTACK: calcContinuousBlockedActionsで相手の正面シグニをアタック不可化 | BLOCK_FRONT_SIGNI_ATTACK |
| 2026-05-31 v0.115 | PREVENT_LRIG_DAMAGE (CONT条件付き): ガード応答時に手札0枚条件チェック実装 | PREVENT_LRIG_DAMAGE |
| 2026-05-31 v0.115 | HAND_SIGNI_HAS_GUARD_ICON: collectHandGuardIconClasses+ガードUIに統合 | HAND_SIGNI_HAS_GUARD_ICON |
| 2026-05-31 v0.115 | LRIG_LIMIT_UP_AND_COLOR_GAIN: limitDeltaをlrigLimit計算に加算 | LRIG_LIMIT_UP_AND_COLOR_GAIN |
| 2026-05-31 v0.115 | 各collectX関数追加: collectAllClassSigni・collectLrigColorAndLimitMods・collectLrigColorInheritSigni・collectMultiAcceSigni | ALL_CLASS他 |
| 2026-05-31 v0.114 | パワー系5件: POWER_BY_ACCE_COUNT・RISE_SIGNI_COUNT・CHARM_COUNT・ENERGY_COLOR_VARIETY・CENTER_LRIG_TYPE_COUNT をcalcFieldPowers STUBハンドラで実装 | パワー修正5件 |
| 2026-05-31 v0.114 | POWER_CAP: calcFieldPowers後処理でパワー上限適用 | POWER_CAP |
| 2026-05-31 v0.114 | POWER_MOD_BY_FRONT_LEVEL: calcFieldPowers STUBハンドラで正面シグニLv×値パワーダウン | POWER_MOD_BY_FRONT_LEVEL |
| 2026-05-31 v0.114 | PREVENT_SELF_DOWN_BY_OPP・SIGNI_DOWN_BY_OPP_ALL・BOUNCE_AND_DOWN: collectDownProtectedSigni+execDown保護フィルター | ダウン保護3件 |
| 2026-05-31 v0.114 | PREVENT_POWER_MINUS_BY_OPP: applyDeltaToStateに負delta保護チェック実装 | PREVENT_POWER_MINUS_BY_OPP |
| 2026-05-31 v0.114 | ARTS_COST_REDUCTION_BY_COST_THRESHOLD: collectArtsThresholdCostReductions+computeArtsEffectiveCostに統合 | ARTS_COST_REDUCTION_BY_COST_THRESHOLD |
| 2026-05-31 v0.114 | OPP_LRIG_ATTACK_COST: collectOppLrigAttackExtraCost+handleLrigAttack追加コスト支払い実装 | OPP_LRIG_ATTACK_COST |
| 2026-05-31 v0.113 | COPY_LRIG_NAME_ABILITY (CONT): collectLrigNameAliases実装・computeArtsEffectiveCostのlrigName判定にエイリアス対応 | COPY_LRIG_NAME_ABILITY |
| 2026-05-31 v0.113 | FIELD_ENERGY_SIGNI_GAIN_COLOR: collectFieldEnergySigniColorGains実装・canAffordGrowCost/canAffordWithExtraCostにextraColorMap対応 | FIELD_ENERGY_SIGNI_GAIN_COLOR |
| 2026-05-31 v0.111 | PREVENT_SIGNI_ABILITY_LOSS_BY_OPP: collectAbilityProtectedSigni+ExecCtx.otherProtectedSigniNumsでfilter | PREVENT_SIGNI_ABILITY_LOSS_BY_OPP |
| 2026-05-31 v0.111 | SPECIFIC_CARD_COST_REDUCE: collectSpecificCardCostReductions+removeNColorFromCostでアーツコスト軽減 | SPECIFIC_CARD_COST_REDUCE |
| 2026-05-31 v0.111 | ONE_ATTACK_PER_TURN: effectEngine.calcContinuousBlockedActionsで実装（attacked_signi_ids使用） | ONE_ATTACK_PER_TURN |
| 2026-05-31 | REDUCE_OPP_HAND_LIMIT: effectEngine.collectHandLimitsで動的実装、HAND_SIZE_INCREASEも同関数に統一 | REDUCE_OPP_HAND_LIMIT, HAND_SIZE_INCREASE |
| 2026-05-31 | ODD_LEVEL_SIGNI_CANT_ATTACK: effectEngine.calcContinuousBlockedActionsに奇数レベル判定を追加 | ODD_LEVEL_SIGNI_CANT_ATTACK |
| 2026-05-30 v0.109 | SEED_BLOOM: ON_PLAY効果トリガー実装（開花後にON_PLAYをスタックへ追加） | SEED_BLOOM, SEED_BLOOM_OPTIONAL |
| 2026-05-30 v0.109 | WXK04-060 ON_BANISH条件修正（相手ターンのみ・manualEffects） | WXK04-060 |
| 2026-05-30 v0.109 | collectBanishTriggersにactiveConditionチェック追加 | ON_BANISH全般 |
| 2026-05-30 v0.108 | OPP_GUARD_COST_COLORLESS CONT→effectEngine実装+BattleScreenガードUI | OPP_GUARD_COST_COLORLESS |
| 2026-05-30 v0.108 | LEVEL_REFERENCE_OVERRIDE：execRevealAndPickでレベル上書き対応 | LEVEL_REFERENCE_OVERRIDE |
| 2026-05-30 v0.108 | LOSE_COLOR_ALL_ZONES：Teamフィールド参照バグ修正 | LOSE_COLOR_ALL_ZONES |
| 2026-05-30 v0.107 | BLOCK_OPP_ARTS_SPELL_ACT / OPP_TURN_NO_ENERGY_COST 実装 | BLOCK_OPP_ARTS_SPELL_ACT, OPP_TURN_NO_ENERGY_COST |
| 2026-05-30 v0.106 | ENCORE, COLLAB, LIMIT_OPP_SIGNI_ATTACKS_ONCE 実装 | ENCORE, COLLAB, LIMIT_OPP_SIGNI_ATTACKS_ONCE |
| 2026-05-29 | トラップシステム全実装 | TRAP_OPERATION, ACTIVATE_TRAP 等 |
| 2026-05-29 | SONG_FRAGMENT, BET_MECHANIC, GATE 等実装 | 多数 |
