# STUB実装状況メモ（全件）

最終更新: 2026-06-01 (v0.152)

## ステータス凡例

| 記号 | 意味 |
|------|------|
| ✅ | 実装済み（ゲームに効果あり） |
| ⚡ | 部分実装（主要パターンは動作、稀ケースはログのみ） |
| 📝 | ログのみ（STUB_LOGテーブルまたはCONTINUOUS未実装） |

**effectType略称:** AUTO=自/起動, CONT=常在, LIFE=ライフバースト, SONG=歌牌

---

## 📝 未実装一覧（ログのみ・優先実装対象）

ゲーム状態への影響なし。件数の多い順に並べている。

| 件数 | effectType | STUB ID |
|-----:|-----------|---------|
| 377 | ACTIVATED/CONT | OPTIONAL_COST |

**合計: 1種 / 約377件**（OPTIONAL_COST 377件含む）



---

## ⚡ 部分実装一覧（主要動作あり・フォールバックあり）

主要パターンは動作するが一部ケースはSTUB_LOGのみ。件数の多い順。

| 件数 | effectType | STUB ID |
|-----:|-----------|---------|
| 6 | ACTIVATED/AUTO | ACTIVATE_TRAP |
| 6 | ACTIVATED | CAST_FROM_OPP_TRASH |
| 6 | ACTIVATED | CONDITIONAL_COST_REDUCTION_BY_FIELD |
| 6 | ACTIVATED | CRAFT_TO_LRIG_DECK |
| 6 | ACTIVATED/AUTO | GATE |
| 6 | AUTO | TRAP_OP |
| 6 | AUTO | TRAP_OPERATION |
| 5 | AUTO/ACTIVATED | ADD_CARD_TO_LRIG_DECK_HIDDEN |
| 5 | CONT | ARTS_IMMOVABLE |
| 5 | CONT/AUTO | COLLAB |
| 5 | AUTO/ACTIVATED | REPEAT_N_TIMES |
| 4 | AUTO/ACTIVATED | FLIP_FACE_DOWN_SIGNI |
| 4 | AUTO | MAKE_SERVANT_ZERO |
| 4 | AUTO/ACTIVATED | OPEN_MAGIC_BOX |
| 4 | AUTO/ACTIVATED | SIGNI_REPOSITION |
| 4 | AUTO/ACTIVATED | TRAP_TO_HAND |
| 3 | AUTO/ACTIVATED | ADD_CRAFT_TO_LRIG_DECK |
| 3 | LIFE | DECK_TOP_TO_LIFE |
| 3 | CONT | DEPLOY_RESTRICT |
| 3 | AUTO | NEGATE_ATTACK_ON_TRIGGER |
| 3 | AUTO/ACTIVATED | OPP_DECLARE_CHOICE |
| 3 | ACTIVATED/LIFE | SET_OPP_SIGNI_AS_TRAP |
| 3 | AUTO/ACTIVATED | TRIGGER_LIFE_BURST |
| 2 | AUTO/ACTIVATED | BET_CONDITION |
| 2 | AUTO | CHOOSE_SAME_OPTION_TWICE |
| 2 | AUTO/ACTIVATED | COIN_USE_RESTRICTION |
| 2 | AUTO/ACTIVATED | CONDITIONAL_ALT_POWER_BOOST |
| 2 | AUTO/ACTIVATED | CONDITIONAL_PER_TRASH |
| 2 | CONT | FIELD_ENERGY_SIGNI_GAIN_COLOR |
| 2 | CONT | GRANT_QUOTED_ACTIVATE_ABILITY |
| 2 | AUTO/ACTIVATED | PLACE_MAGIC_BOX |
| 2 | ACTIVATED/AUTO | POWER_COPY_FROM_DOWNED |
| 2 | AUTO/ACTIVATED | REPEAT_EFFECT |
| 2 | AUTO | RIDE_ON |
| 2 | AUTO/ACTIVATED | SIGNI_FLIP_FACEDOWN |
| 2 | AUTO | SIGNI_SERVANT_ZERO |
| 2 | AUTO/ACTIVATED | TARGET_OPP_SIGNI_ONLY |
| 2 | AUTO/ACTIVATED | USE_CONDITION_ARTS_USED |
| 1 | CONT | ACCE_COST_REDUCTION |
| 1 | AUTO | ACCE_FROM_TRASH |
| 1 | AUTO/ACTIVATED | ACCE_OP |
| 1 | CONT | ACCE_SIGNI_ALL_COLOR |
| 1 | AUTO | ACCE_TO_ENERGY |
| 1 | AUTO | ACTIVATE_COST_ZERO_BLACK |
| 1 | ACTIVATED | ACTIVATE_EICHI_ABILITY |
| 1 | AUTO | ADD_CARD_TO_LRIG_DECK |
| 1 | CONT | ADD_RESONANCE_CONDITION |
| 1 | CONT | ALL_CARDS_COLOR_CHANGE_BLACK |
| 1 | ACTIVATED | ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE |
| 1 | CONT | ALL_COLOR |
| 1 | ACTIVATED | ALL_OPP_SIGNI_SERVANT_ZERO |
| 1 | CONT | ALL_ZONE_BLACK |
| 1 | CONT | ARM_SIGNI_LRIG_PROTECTION |
| 1 | AUTO/ACTIVATED | ARTS_EXTRA_COST_CONDITION |
| 1 | ACTIVATED | ARTS_COLORLESS_MUST_PAY_CENTER_COLOR |
| 1 | CONT | BANISH_BY_SELF_GOES_TO_TRASH |
| 1 | CONT | BANISH_SUBSTITUTE_RISE_STACK |
| 1 | AUTO | BATTLE_BANISH_LIFE_BURST |
| 1 | CONT | BEAT_ZONE_OP |
| 1 | AUTO | BLACK_RISE_PLAY_STACK_FROM_TRASH |
| 1 | AUTO | BLOCK_OPP_ARTS_SPELL_ACT |
| 1 | ACTIVATED | BLOCK_OPP_AUTO_ABILITY_EXTENDED |
| 1 | ACTIVATED | BLOCK_OPP_SPELL_ACT_NEXT_TURN |
| 1 | ACTIVATED | BOTH_DISCARD_BY_CENTER_LEVEL |
| 1 | CONT | CENTER_LRIG_COLOR_CHANGE_BLACK |
| 1 | AUTO | CENTER_LRIG_DISMOUNT |
| 1 | ACTIVATED | CENTER_LRIG_RIDES_ON_SIGNI |
| 1 | AUTO/ACTIVATED | CENTER_ZONE_CONDITION |
| 1 | AUTO/ACTIVATED | CHOOSE_SAME_OPTION_MULTIPLE |
| 1 | AUTO/ACTIVATED | COIN_SPEND_CONDITION |
| 1 | AUTO | CONDITIONAL_FREE_GROW |
| 1 | AUTO | CONDITIONAL_TRASH_TO_ENERGY |
| 1 | AUTO/ACTIVATED | CONDITIONAL_TRASH_UNDER_SIGNI |
| 1 | CONT | COOKING_BANISH_SUBSTITUTE |
| 1 | AUTO/ACTIVATED | COST_COLOR_SELECT |
| 1 | ACTIVATED | DECK_SIGNI_LEVEL_OVERRIDE |
| 1 | AUTO/ACTIVATED | DECLARE_COLOR_COND_ENERGY_TRASH |
| 1 | AUTO/ACTIVATED | DECLARE_NUMBER_POWER |
| 1 | AUTO | DEFEAT |
| 1 | ACTIVATED | DISCARD_BY_POWER_MATCH |
| 1 | AUTO | DISCARD_IF_NO_CLASS_SIGNI |
| 1 | AUTO/ACTIVATED | DRAW |
| 1 | AUTO | DRAW_BY_CHARM_COUNT |
| 1 | AUTO/ACTIVATED | DRAW_DISCARD_COUNT_PLUS_N |
| 1 | AUTO | DRIVE_SIGNI_PREVENT_DOWN |
| 1 | AUTO | EACH_PLAYER_DRAW_DISCARD |
| 1 | AUTO | DRAW_AND_PUT_HAND_TO_DECK_BOTTOM |
| 1 | CONT | ENERGY_COLOR_SUBSTITUTE_TRASH |
| 1 | CONT | ENERGY_SUBSTITUTE_TRASH_KEY |
| 1 | CONT | ENERGY_SUBSTITUTE_TRASH_SIGNI |
| 1 | CONT | ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI |
| 1 | AUTO/ACTIVATED | ENERGY_LEVEL_CONDITION_CHOOSE |
| 1 | AUTO | ENERGY_TO_HAND_ON_DECK |
| 1 | AUTO | ENERGY_TO_TRASH |
| 1 | AUTO/ACTIVATED | FIELD_COND_DRAW_REVEAL |
| 1 | CONT | FIRST_SPELL_COST_UP |
| 1 | ACTIVATED | FROM_TRASH_TO_CENTER_ZONE |
| 1 | CONT | FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM |
| 1 | CONT | FROZEN_SIGNI_TO_TRASH_ON_LEAVE |
| 1 | CONT | GAIN_ADDITIONAL_LRIG_TYPE |
| 1 | AUTO | GAIN_COIN_AND_DISCARD |
| 1 | CONT | GAIN_LRIG_COLOR |
| 1 | AUTO/ACTIVATED | GRANT_ABILITY_UNTIL_OPP_TURN |
| 1 | CONT | GRANT_CHOSEN_ABILITY_FROM_PLAY |
| 1 | ACTIVATED | GRANT_CHOSEN_ABILITY_SELF |
| 1 | ACTIVATED | GRANT_CONDITIONAL_ASSASSIN_ABILITY |
| 1 | AUTO/ACTIVATED | GRANT_LRIG_ABILITY |
| 1 | CONT | GRANT_LRIG_TRASH_ACTIVATE_ABILITY |
| 1 | CONT | GRANT_SIGNI_CLASS |
| 1 | CONT | GRANT_UNDER_LRIG_ACTIVATE_ABILITY |
| 1 | CONT | GRANT_UNDER_LRIG_AUTO_ABILITY |
| 1 | CONT | GRANT_UNDER_SIGNI_ALL_ABILITIES |
| 1 | CONT | GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE |
| 1 | CONT | GRANT_UNDER_SIGNI_CONSTANT_ABILITY |
| 1 | AUTO | GRID_REVEAL_PLUS |
| 1 | CONT | GROW_COST_SUBSTITUTE_TRASH_SIGNI |
| 1 | CONT | GUARD_ALTERNATIVE_COST |
| 1 | AUTO | HAND_CARDS_UNDER_SIGNI |
| 1 | AUTO | HAND_NONCOLORLESS_TO_ENERGY |
| 1 | ACTIVATED | HASTARLIQ |
| 1 | CONT | IGNORE_LRIG_RESTRICTION_ARTS |
| 1 | CONT | INCREASE_ACT_ABILITY_COST |
| 1 | CONT | INHERIT_OPP_LRIG_TYPE |
| 1 | CONT | INHERIT_UNDER_SIGNI_COLOR |
| 1 | AUTO/ACTIVATED | LEVEL_BASED_CONDITIONAL |
| 1 | CONT | LEVEL_MOD_PER_COUNT |
| 1 | CONT | LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT |
| 1 | AUTO | LIFE_BURST_DOUBLE |
| 1 | AUTO | LIMIT_OPP_SIGNI_ATTACKS_ONCE |
| 1 | AUTO | LOOK_TOP_ONE_RETURN_REST_BOTTOM |
| 1 | AUTO/ACTIVATED | LRIG_GAIN_ABILITY |
| 1 | CONT | LRIG_LIMIT_UP_AND_COLOR_GAIN |
| 1 | AUTO/ACTIVATED | LRIG_RIDE_SIGNI |
| 1 | AUTO | LRIG_TRASH_KEY_TO_CENTER_UNDER |
| 1 | ACTIVATED | MAKE_MULTI_SERVANT_ZERO |
| 1 | AUTO | MOVE_ACCE_TO_SIGNI |
| 1 | AUTO | MULTI_ACCE_FROM_HAND |
| 1 | CONT | MULTI_ACCE_LIMIT |
| 1 | ACTIVATED | MULTI_DAMAGE_ON_LRIG_ATTACK |
| 1 | AUTO | MULTI_SIGNI_TO_ENERGY |
| 1 | AUTO | NAMED_SIGNI_ACCE_FROM_TRASH |
| 1 | ACTIVATED | NEGATE_ALL_OPP_EFFECTS |
| 1 | AUTO | NEGATE_COIN_ABILITY |
| 1 | AUTO | NEGATE_THAT_ATTACK |
| 1 | AUTO | NON_GUARD_DISCARD_TO_ENERGY |
| 1 | ACTIVATED | NON_LRIG_TO_LRIG_TRASH |
| 1 | AUTO | OPP_CHOOSE_EFFECT |
| 1 | AUTO | OPP_CHOOSES_FOR_YOU |
| 1 | AUTO/ACTIVATED | OPP_DECK_REVEAL_UNTIL |
| 1 | CONT | OPP_ENERGY_COLOR_CONDITION_TRASH |
| 1 | AUTO | OPP_ENERGY_EXCESS_TRASH |
| 1 | ACTIVATED | OPP_ENERGY_OR_DISCARD_CONDITION |
| 1 | AUTO | OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND |
| 1 | AUTO/ACTIVATED | OPP_HAND_TO_DECK_TOP |
| 1 | AUTO | OPP_MAIN_PHASE_LIMIT_DOWN |
| 1 | AUTO | OPP_RETURN_HAND_ON_SELF_BANISH |
| 1 | ACTIVATED | OPP_REVEAL_HAND_AND_LRIG_DECK |
| 1 | ACTIVATED | OPP_REVEAL_LRIG_DECK |
| 1 | ACTIVATED | OPP_REVEAL_TOP_AND_HAND |
| 1 | ACTIVATED | OPP_SIGNI_ATTACK_COST |
| 1 | AUTO | OPP_SIGNI_ONE_ATTACK_TOTAL |
| 1 | AUTO | OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL |
| 1 | ACTIVATED | OPP_SIGNI_TO_DECK_AND_SHUFFLE |
| 1 | ACTIVATED | OPP_SIGNI_TO_DECK_BY_GATE |
| 1 | ACTIVATED | OPP_SIGNI_TO_DECK_NTH |
| 1 | AUTO | OPP_TRASH_FIELD_SIGNI_AND_ENERGY |
| 1 | CONT | OPP_TRASH_LOSE_COLOR_AND_CLASS |
| 1 | AUTO | OPP_TRASH_TO_DECK_TOP |
| 1 | AUTO | OPP_TRASH_TO_OPP_SIGNI_UNDER |
| 1 | AUTO | OPP_TURN_NO_ENERGY_COST |
| 1 | CONT | OPP_ZONE_PLACEMENT_RESTRICT |
| 1 | AUTO | OPTIONAL_DISCARD_CLASS_SIGNI |
| 1 | AUTO | PLACE_CHOKKIN |
| 1 | AUTO | PLACE_DECK_TOP_UNDER_WEAPON_SIGNI |
| 1 | ACTIVATED | PLACE_LRIG_FROM_DECK_ON_TOP |
| 1 | AUTO | PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON |
| 1 | AUTO | PLACE_VIRUS_CENTER |
| 1 | AUTO | PLAY_SPELL_FROM_HAND_FREE |
| 1 | AUTO | POWER_BOOST_PER_SIGNI_WITH_ICON |
| 1 | AUTO | POWER_BY_LEVEL_SUM_COMPARE |
| 1 | ACTIVATED | POWER_DOUBLE_ALL |
| 1 | AUTO | POWER_DOWN_BY_ZONE_CARD_COUNT |
| 1 | AUTO | POWER_EQUALS_FRONT_SIGNI |
| 1 | AUTO | POWER_MOD_BY_COLOR_VARIETY |
| 1 | AUTO | POWER_MOD_BY_LRIG_LEVEL_SUM |
| 1 | ACTIVATED | POWER_MOD_BY_TRASHED_SIGNI_LEVEL |
| 1 | AUTO | POWER_MOD_BY_UNDER_COUNT |
| 1 | AUTO/ACTIVATED | POWER_MOD_DISTRIBUTE |
| 1 | ACTIVATED | POWER_MOD_MIRROR |
| 1 | AUTO | POWER_MOD_ON_FRONT_PLACE |
| 1 | AUTO | POWER_MOD_TARGET_AND_SELF |
| 1 | ACTIVATED | POWER_UP_BY_DISCARDED_SIGNI_POWER |
| 1 | CONT | PREVENT_ABILITY_CHANGE_BY_OPP |
| 1 | CONT | PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP |
| 1 | ACTIVATED | PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE |
| 1 | ACTIVATED | PREVENT_DAMAGE_UNTIL_OPP_TURN_END |
| 1 | AUTO | PREVENT_DEFEAT_THIS_TURN |
| 1 | AUTO | PREVENT_DEFEAT_UNTIL_NEXT_TURN |
| 1 | ACTIVATED | PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN |
| 1 | CONT | PREVENT_INFECTED_SIGNI_ACTIVATE |
| 1 | ACTIVATED | PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN |
| 1 | CONT | PREVENT_NON_FIELD_MOVE_BY_OPP |
| 1 | CONT | PREVENT_OPP_POWER_PLUS |
| 1 | CONT | PREVENT_OPP_SIGNI_ABILITY_GAIN |
| 1 | CONT | PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH |
| 1 | CONT | PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH |
| 1 | ACTIVATED | PREVENT_TARGET_LRIG_ATTACK_THIS_TURN |
| 1 | ACTIVATED | REDUCE_PLAY_ABILITY_COST |
| 1 | AUTO/ACTIVATED | REPLACE_PLUS_N |
| 1 | AUTO | RESONANCE_COST_CARDS_TO_ENERGY |
| 1 | CONT | RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE |
| 1 | CONT | RISE_BANISH_SUBSTITUTE |
| 1 | CONT | RISE_LEAVE_DISCARD_STACK |
| 1 | AUTO | RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY |
| 1 | AUTO | SELECT_OTHER_SIGNI |
| 1 | ACTIVATED | SELF_TO_DECK_TOP |
| 1 | AUTO | SELF_TRASH_IF_NO_OPP_VIRUS |
| 1 | AUTO | SET_HAND_CARD_AS_TRAP |
| 1 | ACTIVATED | SET_LEVEL_RANGE |
| 1 | ACTIVATED | SET_OPP_SIGNI_POWER_BY_SELF_POWER |
| 1 | AUTO | SIGNI_GAIN_ONE_LRIG_COLOR |
| 1 | AUTO | SIGNI_GRANT_CHOSEN_ABILITY |
| 1 | AUTO | SIGNI_LOSE_COLOR |
| 1 | CONT | SIGNI_PROTECT_MOVE_EXCEPT_ENERGY |
| 1 | ACTIVATED | SIGNI_UNDER_WEAPON_SIGNI |
| 1 | ACTIVATED | SPELL_COST_REDUCTION_BY_TRASH_COUNT |
| 1 | AUTO | STACK_ALL_LRIG_UNDER |
| 1 | CONT | SUBSTITUTE_DAMAGE_WITH_SELF_TRASH |
| 1 | CONT | SUPPRESS_LIFE_BURST_ON_CRASH |
| 1 | AUTO | TOP_TO_BOTTOM_OPTIONAL |
| 1 | AUTO | TRADE_SELF_AND_OPP_TO_ENERGY |
| 1 | AUTO/ACTIVATED | TRASH_FROM_DECK_PER_SIGNI_LEVEL |
| 1 | AUTO | TRASH_ACCE_AT_TURN_END |
| 1 | AUTO | TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY |
| 1 | ACTIVATED | TRASH_ALL_OPP_CARDS |
| 1 | ACTIVATED | TRASH_CLASS_TO_HAND_OR_ENERGY |
| 1 | AUTO | TRASH_SIGNI_TO_BEAT |
| 1 | CONT | WEAPON_SIGNI_PREVENT_DOWN |
| 1 | CONT | WEAPON_SIGNI_PROTECTION |

**合計: 239種**



---

## 全STUB一覧（件数順）

| 件数 | effectType | 状態 | STUB ID |
|-----:|-----------|:----:|---------|
| 377 | ACTIVATED/CONT | 📝 | OPTIONAL_COST |
| 87 | CONT/AUTO | ✅ | ARTS_COST_REDUCTION_BY_EFFECT |
| 52 | AUTO/ACTIVATED | ✅ | TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST ※v0.143: effectExecutor専用ハンドラ追加。パーサーバグ(target.owner='self')を'opponent'に修正。BANISH/BOUNCE/DOWN/POWER_MODIFY対応。canPayOptionalCostチェック+CHOOSE(pay/skip)提示 |
| 50 | ACTIVATED/AUTO | ✅ | TARGET_AND_DISCARD_HAND |
| 49 | ACTIVATED/CONT/AUTO | ✅ | POWER_MOD_PER_COUNT |
| 43 | AUTO | ✅ | CONDITIONAL_POWER_BONUS |
| 41 | CONT | ✅ | RULE_REMINDER_TEXT ※execStubがdone(ctx)を返すため無音スキップ済み |
| 39 | AUTO/ACTIVATED/CONT/SONG | ✅ | GRANT_QUOTED_AUTO_ABILITY |
| 35 | ACTIVATED | ✅ | DECLARE_NUMBER |
| 31 | ACTIVATED/AUTO | ✅ | OPTIONAL_TRASH_ENERGY_CLASS ※v0.143: effectExecutor専用ハンドラ追加。エナゾーンからクラスフィルタ選択(SELECT_TARGET)→INTERNAL_OTEC_MOVE_SELECTED(トラッシュ/手札移動)。BOUNCE/BANISH target修正。resumeChooseのcontinuation合成対応 |
| 30 | CONT | ✅ | LRIG_GROW_RESTRICT |
| 29 | AUTO/ACTIVATED | ✅ | TRADE_BANISH_SELF_SIGNI |
| 28 | AUTO/ACTIVATED | ✅ | LOOK_OPP_LIFE_TOP |
| 24 | ACTIVATED/AUTO | ✅ | SOUL_OP ※v0.133: +3パターン追加（ルリグ下N枚任意消費/固定消費/ルリグトラッシュ→ルリグ下配置）+INTERNAL_CONSUME_LRIG_UNDER/INTERNAL_PLACE_LRIG_UNDER_CENTER |
| 21 | AUTO | ✅ | GAIN_SUBSCRIBER_COUNT |
| 21 | AUTO/ACTIVATED | ✅ | LRIG_UNDER_CARD_OP |
| 19 | CONT/AUTO/ACTIVATED | ✅ | GRANT_ABILITY_INNER_TEXT |
| 18 | AUTO/ACTIVATED | ✅ | BET_ALTERNATIVE ※BET_MECHANICで通常/ベット選択肢を一括処理済み。このSTUBはスキップ（正常動作） |
| 17 | AUTO/ACTIVATED | ✅ | DECLARE_CARD_NAME |
| 17 | AUTO/ACTIVATED | ✅ | LOOK_AND_REORDER |
| 16 | CONT | ✅ | COPY_LRIG_NAME_ABILITY ※v0.113: collectLrigNameAliases実装・アーツコスト名前条件に対応 / v0.132: collectCopiedLrigAutoEffects追加・ON_ATTACK_LRIG/ON_PLAYトリガーにトラッシュルリグの【自】能力を組み込み |
| 15 | ACTIVATED | ✅ | REVEAL_PICK_HAND_SHUFFLE_BOTTOM |
| 15 | AUTO/ACTIVATED | ✅ | REVEAL_PICK_PLAY ※デッキ上N枚公開→シグニ選択→場に出すインタラクション実装済み |
| 15 | AUTO/ACTIVATED | ✅ | TARGET_ONLY ※対象シグニ選択→lastProcessedCardsに格納→後続ステップへ続行 |
| 14 | CONT | ✅ | ARTS_COST_REDUCTION_BY_CENTER_LRIG |
| 14 | AUTO/ACTIVATED | ✅ | GAIN_ABILITY_THIS_GAME |
| 13 | ACTIVATED | ✅ | CONDITIONAL_ARTS_COST ※v0.143: 正しい条件チェックに修正。対戦相手ルリグ色条件/自ルリグレベル条件を確認。コスト計算はcomputeArtsEffectiveCostで処理済み |
| 12 | AUTO/ACTIVATED/CONT | ✅ | GRANT_QUOTED_ABILITY |
| 12 | AUTO/ACTIVATED | ✅ | REVEAL_AND_PICK ※デッキ上N枚→クラスフィルタ→手札/場に出すインタラクション実装済み |
| 11 | ACTIVATED | ✅ | SONG_FRAGMENT |
| 10 | ACTIVATED/AUTO | ✅ | ARTS_USE_DISCARD_LRIG_DECK ※ルリグデッキからアーツを任意でルリグトラッシュへのCHOOSEインタラクション実装済み |
| 10 | AUTO/ACTIVATED | ✅ | PLACE_TRAP_FROM_REVEALED ※v0.145: SEARCH(デッキ上N枚→任意選択)→INTERNAL_PTFR_CHOOSE_ZONE→INTERNAL_SET_TRAP の2段階インタラクション実装。restDest:'deck_bottom'で未選択カードをデッキ下へ |
| 9 | ACTIVATED | ✅ | CONDITIONAL_MULTI_CHOOSE_BY_CENTER ※v0.145: 条件不成立時もベース選択数でCHOOSEを提示するよう修正。センター名複数条件（か/と区切り）対応。新選択肢: FREEZE/DOWN+FREEZE ALL/スペル打ち消し/トラッシュからシグニ手札/バニッシュ以上/ダブルクラッシュ等のキーワード付与/BOUNCE。INTERNAL_DOWN_AND_FREEZE_OPP/INTERNAL_BANISH_OPP_POWER_GTE/INTERNAL_TRASH_SIGNI_TO_HAND追加 |
| 9 | AUTO/ACTIVATED | ✅ | DESIGNATE_SIGNI_ZONE |
| 9 | AUTO/ACTIVATED | ✅ | GRANT_GUARD_ICON_HAND_SIGNI ※hand_signi_guard_enabledフラグ設置・BattleScreenのガードUIに統合済み |
| 9 | ACTIVATED | ✅ | PLAY_FREE |
| 8 | ACTIVATED/AUTO/CONT | ✅ | BLOOD_CRYSTAL_ARMOR ※v0.110: 血晶武装状態管理・ON_BLOOD_CRYSTAL_ARMORトリガー・IS_SELF_ARMOREDアクティブ条件・isArmoredフィルタ・UIバッジ実装 |
| 8 | AUTO | ✅ | COUNT_BASED_DRAW_OR_POWER ※v0.135: 手札をN枚まで捨てるインタラクティブ処理追加（SELECT_TARGET→INTERNAL_CBDOP_AFTER_DISCARD）。捨て枚数ドロー/パワー修正に対応 |
| 8 | AUTO/ACTIVATED/CONT | ✅ | LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END ※v0.139: 「対戦相手のリミット－N」パターンを追加（otherState.lrig_limit_mod修正）。両プレイヤー対応 |
| 8 | AUTO/ACTIVATED | ✅ | PLACE_SEED_FROM_REVEALED ※SEARCH(デッキ上N枚)+INTERNAL_SEED_FROM_DECK→ゾーン選択→INTERNAL_SET_SEEDの2段階インタラクション実装済み |
| 8 | ACTIVATED | ✅ | REMOVE_VIRUS ※v0.144: effectExecutor専用ハンドラ追加(IS_MY_TURNパターン対応)。任意除去(CHOOSE)/強制除去/TRANSFER_TO_HAND連結パターン(好きな数→N枚手札)を実装。execStub側も「すべて」/「Nつ」/デフォルト全除去に修正。INTERNAL_REMOVE_VIRUS_N・INTERNAL_RV_BATCH_TRANSFER追加 |
| 7 | ACTIVATED/AUTO | ✅ | ACCE_FROM_HAND ※手札/エナのカードをSELECT→ATTACH_ACCE付与済み |
| 7 | CONT | ✅ | CHOOSE_N_FROM_LIST ※①②③④テキスト解析+N択CHOOSE実装済み |
| 7 | AUTO | ✅ | DECK_REVEAL_UNTIL |
| 7 | AUTO/ACTIVATED | ✅ | DOWN_UP_SIGNI_AND_CHOOSE ※アップ状態シグニをクラス抽出→CHOOSE(ダウン選択)実装済み |
| 7 | AUTO/ACTIVATED | ✅ | DO_THREE_THINGS ※v0.136: WXK11シリーズ①追加（ドローN/ルリグダウン/シグニアタック禁止選択/パワーX以下バニッシュ選択） |
| 7 | AUTO/ACTIVATED | ✅ | EXILE_FROM_CHECK_ZONE ※自/相手チェックゾーンのカードをトラッシュへ移動済み |
| 7 | CONT | ✅ | LEVEL_REFERENCE_OVERRIDE ※v0.134: DECK_TOP_MATCHESにLEVEL_REFERENCE_OVERRIDE考慮追加。LAST_PROCESSED_LEVEL_SUM_EQ条件追加。effects.json修正（WX18-066/WX19-024: DECK_TOP_MATCHES条件付きBANISH、WD21-012: レベル合計10条件） |
| 7 | CONT | ✅ | LOSE_COLOR_ALL_ZONES |
| 7 | AUTO/ACTIVATED | ✅ | PLACE_CARD_UNDER_SIGNI ※「このシグニを他シグニの下」/「トラッシュからシグニ下配置」の2パターン実装済み |
| 7 | AUTO/ACTIVATED | ✅ | PLACE_LIMIT_UPPER ※lrig_limit_mod+1でリミット上限を増加済み |
| 7 | AUTO/ACTIVATED | ✅ | PLACE_TRAP_OPTIONAL ※手札選択→ゾーン選択→INTERNAL_SET_TRAPで設置済み |
| 7 | AUTO/ACTIVATED | ✅ | TRASH_SIGNI_UNDER_FIELD_SIGNI ※v0.136: 2ステップ実装（SELECT_TARGET[トラッシュ]→INTERNAL_TSU_CHOOSE_ZONE→INTERNAL_TSU_DO_PLACE）複数枚連続配置対応 |
| 6 | ACTIVATED/AUTO | ⚡ | ACTIVATE_TRAP |
| 6 | ACTIVATED | ⚡ | CAST_FROM_OPP_TRASH |
| 6 | ACTIVATED | ⚡ | CONDITIONAL_COST_REDUCTION_BY_FIELD |
| 6 | ACTIVATED | ⚡ | CRAFT_TO_LRIG_DECK |
| 6 | CONT | ✅ | DOUBLE_POWER_MINUS ※v0.115: calcFieldPowers applyEffectsで相手シグニへの負デルタを2倍に実装 |
| 6 | ACTIVATED/AUTO | ⚡ | GATE |
| 6 | ACTIVATED/AUTO | ✅ | POWER_MOD_BY_HAND_COUNT |
| 6 | AUTO | ⚡ | TRAP_OP |
| 6 | AUTO | ⚡ | TRAP_OPERATION |
| 6 | AUTO/ACTIVATED | ✅ | TRASH_OWN_KEY_OPTIONAL ※needsInteraction CHOOSE: キーをルリグトラッシュに置く/スキップ |
| 5 | AUTO/ACTIVATED | ⚡ | ADD_CARD_TO_LRIG_DECK_HIDDEN ※lastProcessedCardsのカードをルリグデッキへ追加(カード名解決は部分的) |
| 5 | CONT | ⚡ | ARTS_IMMOVABLE ※executor直接チェック |
| 5 | AUTO/ACTIVATED | ✅ | CHOOSE_COLOR_FROM_LIST ※needsInteraction CHOOSE: エナの色一覧から選択実装済み |
| 5 | CONT/AUTO | ⚡ | COLLAB |
| 5 | AUTO/ACTIVATED | ✅ | CONDITIONAL_CARD_COST_BY_OPP_LRIG |
| 5 | AUTO/ACTIVATED | ✅ | DECK_TOP_CHECK_LEVEL_HAND ※不一致時はデッキトップに留まる（移動なし）。宣言レベルはDECLARE_NUMBERで設定 |
| 5 | AUTO | ✅ | MOVE_TO_OTHER_SIGNI_ZONE ※v0.135: INTERNAL_MOVE_TO_ZONEに移動後パワーブースト追加（「移動したとき.*パワーを＋」テキスト検出→temp_power_mods付与）。effects.json E2誤発修正（POWER_MODIFY→STUB noop） |
| 5 | CONT | ✅ | OPP_GUARD_COST_COLORLESS |
| 5 | AUTO/ACTIVATED | ✅ | OPTIONAL_DISCARD_CLASS_SIGNI ※手札のクラスシグニを最大N枚selectOrInteractで任意捨て |
| 5 | AUTO/ACTIVATED | ✅ | POWER_MOD_BY_DISCARD_COUNT_HIGH ※lastProcessedCards枚数×deltaPerCardでパワー修正 |
| 5 | AUTO/ACTIVATED | ✅ | POWER_MOD_PER_REVEALED ※lastProcessedCards公開枚数×+1000（または効果テキスト値）で自シグニパワー修正 |
| 5 | AUTO/ACTIVATED | ⚡ | REPEAT_N_TIMES ※パワー修正・デッキトラッシュパターンのみ対応、その他は後続ステップに委譲 |
| 5 | AUTO/ACTIVATED | ✅ | REVEAL_CLASS_SIGNI_FROM_HAND ※手札のクラスシグニを任意枚数selectOrInteract（lastProcessedCardsに格納） |
| 4 | AUTO/ACTIVATED | ✅ | CLASS_CHANGE ※card_class_overridesで一時クラス変更、全体/単体パターン対応 |
| 4 | ACTIVATED | ✅ | DECLARE_COLOR ※5色CHOOSE→declared_colorに保存（v0.146実装） |
| 4 | AUTO/ACTIVATED | ✅ | DECK_TOP_DECLARED_NUM_TRASH ※declared_guard_restrict_level枚のデッキ上カードをトラッシュ |
| 4 | AUTO/ACTIVATED | ✅ | EFFECT_LIMIT ※効果テキストのN枚上限キャップをtemp_power_modsに適用 |
| 4 | AUTO/ACTIVATED | ⚡ | FLIP_FACE_DOWN_SIGNI ※face_down_signi+abilities_removed追加（flip-back未実装）
| 4 | AUTO/ACTIVATED | ✅ | GAIN_EXTRA_TURN |
| 4 | AUTO | ⚡ | MAKE_SERVANT_ZERO |
| 4 | AUTO/ACTIVATED | ✅ | MASS_TRASH ※相手エナ全枚+フィールド全シグニをトラッシュ |
| 4 | AUTO/ACTIVATED | ⚡ | OPEN_MAGIC_BOX ※done(addLog)のみ（マジックボックス未実装） |
| 4 | AUTO/ACTIVATED | ✅ | OPPONENT_PAY_OPTIONAL ※相手にCHOOSE提示→支払いでenergy消費+opponent_paid_optional_cost=trueフラグ→後続CONDITIONAL(OPPONENT_NOT_PAID)で結果効果スキップ（v0.146実装） |
| 4 | AUTO/ACTIVATED | ✅ | OPP_CHOOSE_YOUR_HAND_DISCARD ※相手がこちらの手札から1枚をblind選択しトラッシュ |
| 4 | ACTIVATED/AUTO | ✅ | PLAY_SPELL_FREE_IGNORE_RESTRICTION ※v0.140: グループから分離・SELECT_TARGET from hand(スペル/コスト上限フィルタ)追加 |
| 4 | AUTO/ACTIVATED | ✅ | POWER_MOD_PER_REVEALED_LEVEL ※lastProcessedCardsのシグニレベル合計×-1000で相手シグニパワー修正 |
| 4 | AUTO/ACTIVATED | ✅ | REVEAL_PICK_CLASS_TO_ENERGY ※lastProcessedCardsのクラスシグニをエナへ、残りをデッキ上に戻す |
| 4 | AUTO | ✅ | SEED_BLOOM ※v0.109: ON_PLAY効果トリガー実装・WXK04-060条件修正 |
| 4 | AUTO/ACTIVATED | ⚡ | SIGNI_REPOSITION |
| 4 | AUTO/ACTIVATED | ⚡ | TRAP_TO_HAND |
| 4 | AUTO/ACTIVATED | ✅ | UNKNOWN_NESTED ※自シグニを任意トラッシュCHOOSE→self_optional_effect_taken設定。後続CONDITIONAL(SELF_OPTIONAL_EFFECT_TAKEN)で制御（v0.147） |
| 3 | AUTO/ACTIVATED | ⚡ | ADD_CRAFT_TO_LRIG_DECK ※sourceCardNumをルリグデッキへ追加（特定クラフト名解決は未実装） |
| 3 | AUTO/ACTIVATED | ✅ | BANISH_FROM_GAME ※トラッシュより任意除外CHOOSE→self_optional_effect_taken設定。後続CONDITIONAL(SELF_OPTIONAL_EFFECT_TAKEN)で制御（v0.147） |
| 3 | AUTO/ACTIVATED | ✅ | CHOOSE_HAND_CARD ※SELECT_TARGET on自手札→lastProcessedCardsに格納 |
| 3 | ACTIVATED | ✅ | DECK_TOP_CHECK_LEVEL_ENERGY ※宣言レベル一致シグニならエナゾーンへ、不一致はデッキトップ留まり |
| 3 | LIFE | ⚡ | DECK_TOP_TO_LIFE |
| 3 | AUTO/ACTIVATED | ✅ | DECLARE_NUMBER_RANGE ※0〜5のCHOOSE→declared_guard_restrict_levelに保存（v0.147） |
| 3 | CONT | ⚡ | DEPLOY_RESTRICT ※v0.138: AUTO時に「パワーN以上場に出せない」→otherState.signi_deploy_power_limit設定。CONTINUOUS制限はログのみ |
| 3 | AUTO/ACTIVATED | ✅ | DISCARD_OR_PENALTY ※特定クラス/タイプ1枚捨てるかペナルティN枚捨てるかCHOOSE（v0.147） |
| 3 | CONT | ✅ | DOUBLE_OWN_POWER_MINUS ※v0.137: SELECT_TARGET(相手シグニ)+double_power_minus_targets設定。effectEngine.applyTempModsで負デルタを2倍適用 |
| 3 | CONT | ✅ | FORCE_TARGET_SELF |
| 3 | AUTO | ✅ | HAND_SIZE_INCREASE ※effectEngine.collectHandLimitsで動的計算に移行 |
| 3 | AUTO/ACTIVATED | ✅ | MOVE_TO_ATTACKER_FRONT ※v0.139: attacked_signi_ids の最終アタッカーからゾーンを動的取得。正面が空ならCHOOSE移動確認→INTERNAL_MOVE_TO_ZONE。stub.value後方互換保持 |
| 3 | AUTO | ⚡ | NEGATE_ATTACK_ON_TRIGGER |
| 3 | AUTO/ACTIVATED | ⚡ | OPP_DECLARE_CHOICE ※①②テキスト解析→相手がopponentResponds CHOOSEで選択（一部パターンのみ対応） |
| 3 | CONT/AUTO | ✅ | PREVENT_LRIG_DAMAGE_THIS_TURN ※prevent_lrig_damageフラグ設置・BattleScreenで完全実装済み |
| 3 | CONT | ✅ | PREVENT_ZONE_MOVE_BY_OPP ※v0.137: AUTO時にprevent_opp_trash_fromフラグ設置。effectExecutorのapplyTrashHand/EnergyでotherState.prevent_opp_trash_fromも検査 |
| 3 | AUTO/ACTIVATED | ✅ | REMOVE_SIGNI_ZONE ※CHOOSE+INTERNAL_REMOVE_SIGNI_ZONEで実装済み |
| 3 | AUTO/ACTIVATED | ✅ | REVEAL_TOP_CONDITIONAL_ROUTE ※デッキ上公開→レベル条件判定→トラッシュ |
| 3 | ACTIVATED/LIFE | ⚡ | SET_OPP_SIGNI_AS_TRAP |
| 3 | AUTO/ACTIVATED | ⚡ | TRIGGER_LIFE_BURST ※done(addLog)のみ（ライフバースト特殊トリガー未実装） |
| 2 | AUTO/ACTIVATED | ✅ | ABILITY_CHECK_ELSE_TRASH ※sourceCardNumに能力テキストあり→スキップ、なし→フィールドからトラッシュへ |
| 2 | ACTIVATED/AUTO | ✅ | ARTS_USE_DISCARD_COLOR_HAND ※手札の特定色カードを任意N枚selectOrInteractで捨て（v0.147） |
| 2 | CONT | ✅ | ATTACK_PHASE_LEVEL_OVERRIDE ※v0.137: collectAttackPhaseLevelOverrides追加・checkActiveCondition EICHI_LEVEL_SUM で ownerState.attack_phase_level_overrides を使用・BattleScreenアタックフェイズ時に ownerStateForCtx に設定 |
| 2 | AUTO/ACTIVATED | ✅ | BANISH ※lastProcessedCards[0]またはsourceCardNumをバニッシュ（相手→エナ、自→エナ） |
| 2 | AUTO/ACTIVATED | ⚡ | BET_CONDITION ※done(addLog)のみ（ベット条件チェック未実装） |
| 2 | AUTO/ACTIVATED | ✅ | CHARM_CONDITIONAL_POWER ※同ゾーンにチャームがあればパワー修正 |
| 2 | AUTO/ACTIVATED | ✅ | CHOOSE_HAND_OR_ENERGY ※LOOK_AND_REORDER後のデッキ上N枚をSEARCH→手札/残りエナ（v0.147） |
| 2 | AUTO | ⚡ | CHOOSE_SAME_OPTION_TWICE |
| 2 | AUTO/ACTIVATED | ⚡ | COIN_USE_RESTRICTION ※done(addLog)のみ（コイン使用制限未実装） |
| 2 | AUTO/ACTIVATED | ✅ | CONDITIONAL_ALTERNATE_EFFECT |
| 2 | AUTO/ACTIVATED | ⚡ | CONDITIONAL_ALT_POWER_BOOST ※done(addLog)のみ（条件付き代替パワーブースト未実装） |
| 2 | AUTO/ACTIVATED | ⚡ | CONDITIONAL_PER_TRASH ※トラッシュ枚数閾値達成→1枚ドロー（一部パターン） |
| 2 | ACTIVATED | ✅ | COPY_SIGNI ※v0.138: 2ステップSELECT_TARGET(フィールド→トラッシュ)+INTERNAL_COPY_SIGNI_APPLY。card_identity_overrides追加・effectEngine.calcFieldPowersでコピー元パワー参照 |
| 2 | AUTO | ✅ | COPY_TARGET_POWER ※v0.137: lastProcessedCards未設定時にSELECT_TARGET→COPY_TARGET_POWER継続。パワー差分をtemp_power_modsに設定 |
| 2 | CONT | ⚡ | DEPLOY_RESTRICT ※AUTO時はsigni_deploy_power_limitフラグ設置。CONTINUOUS制限はログのみ |
| 2 | AUTO | ✅ | DISCARD_IF_ATTACKED_THIS_TURN ※実装済み: attacked_signi_idsチェック+手札SELECT捨て |
| 2 | AUTO/ACTIVATED | ✅ | DISONA_RESTRICTION ※使用条件チェック（BattleScreen側で処理済み）、実行時はログのみ |
| 2 | AUTO | ✅ | DRAW_AND_PUT_HAND_TO_DECK_BOTTOM |
| 2 | AUTO/ACTIVATED | ✅ | ENERGY_BY_LEVEL_SUM_LIMIT ※エナレベル合計超過分をトラッシュへ（過剰分逆算） |
| 2 | CONT | ✅ | ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白 |
| 2 | ACTIVATED | ✅ | EXTRA_COST_REMOVE_VIRUS ※v0.138: ウイルス除去数CHOOSE(0〜N)→INTERNAL_ECRV_APPLY→除去実行+(N+1)択CHOOSE。①〜④テキスト解析で効果選択肢生成 |
| 2 | AUTO/ACTIVATED | ✅ | FACE_DOWN_OPP_SIGNI ※相手シグニSELECT_TARGET→face_down_signi+abilities_removed追加（v0.147） |
| 2 | CONT | ⚡ | FIELD_ENERGY_SIGNI_GAIN_COLOR ※v0.113: collectFieldEnergySigniColorGains実装・エナ支払い追加色対応（《ディソナアイコン》フィルターは識別子未実装のため除外） |
| 2 | ACTIVATED/AUTO | ✅ | GAIN_ABILITY_THIS_GAME |
| 2 | ACTIVATED/AUTO | ✅ | GRANT_CHOSEN_ABILITY ※v0.138: lastProcessedCardsに自シグニなければSELECT_TARGET→CHOOSE能力(アサシン/ランサー/ダブルクラッシュ/バニッシュ不可/ダウン不可/バウンス不可)。keyword_grantsに格納 |
| 2 | CONT | ⚡ | GRANT_QUOTED_ACTIVATE_ABILITY ※v0.138: GRANT_QUOTED_AUTO_ABILITYブロックから分離。起動能力パターンログ改善（レベル比例/2倍-タイプ識別） |
| 2 | AUTO/ACTIVATED | ✅ | HAND_REVEAL_CLASS_SIGNI ※手札クラスシグニSELECT_TARGET→lastProcessedCardsに格納（v0.148） |
| 2 | AUTO | ✅ | HAND_TO_ENERGY_OPTIONAL ※v0.139: 重複ハンドラ削除。先行ハンドラ（maxHTE解析+INTERNAL_HAND_TO_ENERGY続行）が正しく動作 |
| 2 | ACTIVATED/AUTO | ✅ | LAYER_ABILITY_COPY ※v0.139: SELECT_TARGET(怪異trash/field)+INTERNAL_LAYER_COPY_APPLY。《レイヤーアイコン》テキストからSランサー等を keyword_grants に付与 |
| 2 | ACTIVATED/CONT | ✅ | LIMIT_OPP_DRAW_COUNT ※v0.139: collectDrawLimits追加（CONTINUOUS LIMIT_OPP_DRAW_COUNT効果を動的検査）。BattleScreen UP フェイズのドロー計算に統合 |
| 2 | AUTO/ACTIVATED | ✅ | LOOK_OPP_HAND_DISCARD_SIGNI ※相手手札シグニをフィルタ→selectOrInteract→TRASH（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | LOOK_TOP_COLOR_SORT ※LOOK_TOP_Nと同ハンドラ: デッキ上N枚LOOK_AND_REORDER（v0.148） |
| 2 | CONT | ✅ | MULTI_ZONE_ATTACK |
| 2 | CONT | ✅ | ONE_ATTACK_PER_TURN ※effectEngine.calcContinuousBlockedActionsで実装 |
| 2 | ACTIVATED | ✅ | OPP_CHOOSE_OWN_SIGNI_TO_ENERGY ※v0.140: thenActionをBANISH→INTERNAL_OPP_FIELD_TO_ENERGYに修正（フィールド→エナゾーン移動） |
| 2 | AUTO/ACTIVATED | ✅ | OPP_DECLARE_COLOR ※5色CHOOSE(opponentResponds)→INTERNAL_SET_OPP_DECLARED_COLOR→otherState.declared_color（v0.148） |
| 2 | AUTO | ✅ | OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL ※v0.140: excess計算修正（常に1枚トラッシュ）・重複ハンドラ削除 |
| 2 | AUTO | ✅ | OPP_SIGNI_ATTACK_POWER_RESTRICT ※v0.140: BattleScreenにeffectivePowers使用のパワー上限アタック制限チェック追加 |
| 2 | AUTO/ACTIVATED | ✅ | PEEP_HAND ※相手手札全カード名をログ表示（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | PICK_FROM_TRASHED_CARDS ※トラッシュSELECT_TARGET→TRANSFER_TO_HAND（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | PLACE_ACCE_SIGNI_TO_ENERGY ※signi_acceの全アクセをエナゾーンへ移動実装済み(ACCE_TO_ENERGYと同ハンドラ) |
| 2 | AUTO/ACTIVATED | ⚡ | PLACE_MAGIC_BOX ※done(addLog)のみ（マジックボックス設置未実装） |
| 2 | AUTO | ✅ | PLACE_SIGNI_UNDER_SELF_OPT ※v0.140: レベル完全一致フィルタ追加・フィールドソース対応（手札からなし→場から選択） |
| 2 | ACTIVATED/AUTO | ⚡ | POWER_COPY_FROM_DOWNED |
| 2 | AUTO | ✅ | POWER_MOD_BY_ATTACKER_LEVEL ※v0.140: SELECT_TARGET(奇数/偶数フィルタ)追加・重複ハンドラ削除 |
| 2 | AUTO | ✅ | POWER_MOD_BY_LRIG_TRASH_ARTS ※v0.140: SELECT_TARGET追加・重複ハンドラ削除 |
| 2 | AUTO/ACTIVATED | ✅ | PREVENT_OWN_ARTS_USE ※blocked_actionsにUSE_ARTS追加でアーツ使用禁止実装済み |
| 2 | AUTO | ✅ | REACTIVE_POWER_UP ※相手temp_power_modsのマイナス合計を自パワーに加算 |
| 2 | AUTO/ACTIVATED | ⚡ | REPEAT_EFFECT ※done(addLog)のみ（効果繰り返し未実装） |
| 2 | AUTO/ACTIVATED | ✅ | REVEAL_OPP_HAND_CARD ※相手手札からランダム1枚をlastProcessedCardsに格納して公開（v0.148） |
| 2 | AUTO | ⚡ | RIDE_ON |
| 2 | AUTO/ACTIVATED | ⚡ | SIGNI_FLIP_FACEDOWN ※FLIP_FACE_DOWN_SIGNIと同ハンドラ: face_down_signi+abilities_removed設定 |
| 2 | CONT | ✅ | SIGNI_GRANT_QUOTED_CONSTANT_ABILITY ※v0.141: SELECT_TARGET(自フィールド)+keyword_grants付与(assassin/shadow/lancer等) |
| 2 | AUTO | ⚡ | SIGNI_SERVANT_ZERO |
| 2 | CONT | ✅ | SPECIFIC_CARD_COST_REDUCE ※v0.111: collectSpecificCardCostReductions+removeNColorFromCostでアーツコスト軽減 |
| 2 | CONT | ✅ | SPELL_COST_REDUCTION_BY_TRASH_COUNT |
| 2 | AUTO/ACTIVATED | ✅ | SUPPRESS_LIFE_BURST_ON_CARD ※suppress_life_burstフラグセット→BattleScreenのライフバースト発動抑制（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | SWAP_OPTIONAL ※SELECT_TARGET(optional)→INTERNAL_REPOSITION_MOVEで空きゾーンへ移動（v0.148） |
| 2 | AUTO/ACTIVATED | ⚡ | TARGET_OPP_SIGNI_ONLY ※ログのみ（対象修飾子・後続SELECT_TARGETで相手フィールド指定）（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | TRASH ※lastProcessedCards[0]/sourceCardNumをフィールド/手札/相手フィールドからトラッシュへ（v0.148） |
| 2 | AUTO/ACTIVATED | ✅ | TRASH_IF_ZONE_OCCUPIED ※フィールド満杯時にsourceCardNum自身をトラッシュへ（v0.148） |
| 2 | ACTIVATED/LIFE | ✅ | TRASHED_CARD_TO_HAND_OR_ENERGY ※v0.142: lastProcessedCards優先+trash.at(-1)フォールバック・重複ハンドラ2つ削除 |
| 2 | AUTO | ✅ | TRASH_ALL_SIGNI_AND_KEY |
| 2 | AUTO/ACTIVATED | ⚡ | USE_CONDITION_ARTS_USED ※ログのみ（アーツ使用済み条件チェック・フラグ未実装）（v0.148） |
| 2 | AUTO | ✅ | VIEW_AND_DISCARD_SPELL ※相手手札スペル選択+TRASH実装済み・重複ハンドラ削除 |
| 1 | CONT | ✅ | ACCE_BANISH_SELF_TRASH ※signi_acceの全アクセをトラッシュへ移動+field更新実装済み |
| 1 | CONT | ⚡ | ACCE_COST_REDUCTION ※done(addLog)のみ（アクセコスト軽減未実装） |
| 1 | AUTO | ⚡ | ACCE_FROM_TRASH |
| 1 | AUTO/ACTIVATED | ⚡ | ACCE_OP ※done(addLog)のみ（アクセカウント確認のみ） |
| 1 | CONT | ⚡ | ACCE_SIGNI_ALL_COLOR ※done(addLog)のみ（アクセシグニ全色化未実装） |
| 1 | CONT | ✅ | ACCE_SIGNI_GRANT_ABILITY ※アクセゾーン対象シグニにkeyword_grants付与実装済み |
| 1 | AUTO | ⚡ | ACCE_TO_ENERGY |
| 1 | AUTO | ⚡ | ACTIVATE_COST_ZERO_BLACK ※v0.141: SELECT_TARGET(トラッシュシグニ)+activate_cost_zero_signiフラグ設置 |
| 1 | ACTIVATED | ⚡ | ACTIVATE_EICHI_ABILITY |
| 1 | AUTO | ⚡ | ADD_CARD_TO_LRIG_DECK ※v0.141: lastProcessedCardsなし時は《カード名》テキスト解析→デッキ/手札から移動 |
| 1 | CONT | ⚡ | ADD_RESONANCE_CONDITION ※done(addLog)のみ（レゾナ条件追加未実装） |
| 1 | CONT | ✅ | ADJACENT_ZONE_ATTACK ※v0.116: 英知=10条件付き・隣ゾーン1つ追加バトル（有利な方を自動選択） |
| 1 | CONT | ⚡ | ALL_CARDS_COLOR_CHANGE_BLACK ※v0.141: effectEngine.hasAllCardsColorBlack追加・myEnergyExtraColorsに黒色反映 |
| 1 | ACTIVATED | ⚡ | ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE ※ログのみ改善 |
| 1 | CONT | ✅ | ALL_CLASS ※v0.115: collectAllClassSigni実装（レゾナ条件等のfiltterに活用可） |
| 1 | CONT | ⚡ | ALL_COLOR ※v0.141: effectEngine.collectAllColorSigni追加・myEnergyExtraColorsでの色追加（フィールドシグニへの全色適用は未） |
| 1 | AUTO | ✅ | ALL_OPP_SIGNI_POWER_DOWN_HALF ※自パワー÷2だけ相手全シグニのtemp_power_modsに適用 |
| 1 | ACTIVATED | ⚡ | ALL_OPP_SIGNI_SERVANT_ZERO |
| 1 | CONT | ⚡ | ALL_ZONE_BLACK ※v0.141: effectEngine.collectAllZoneBlackCardNums追加・myEnergyExtraColorsでエナゾーン黒色反映 |
| 1 | CONT | ⚡ | ARM_SIGNI_LRIG_PROTECTION ※done(addLog)のみ（種族保護グループに統合：effectEngine未対応） |
| 1 | AUTO/ACTIVATED | ⚡ | ARTS_EXTRA_COST_CONDITION ※done(addLog)のみ（アーツ追加コスト条件未実装） |
| 1 | ACTIVATED | ⚡ | ARTS_COLORLESS_MUST_PAY_CENTER_COLOR |
| 1 | ACTIVATED | ✅ | ARTS_COST_REDUCTION_BY_CENTER_LRIG |
| 1 | CONT | ✅ | ARTS_COST_REDUCTION_BY_COST_THRESHOLD ※v0.114: collectArtsThresholdCostReductions+computeArtsEffectiveCostに統合 |
| 1 | CONT | ✅ | ATTACK_COUNT_BY_POWER ※v0.117: calcContinuousBlockedActionsでパワー/10000回数上限・attacked_signi_idsをバッグ化 |
| 1 | CONT | ⚡ | BANISH_BY_SELF_GOES_TO_TRASH ※ログのみ（自己バニッシュ→トラッシュ置換効果・エンジン未対応）（v0.148） |
| 1 | CONT | ✅ | BANISH_REDIRECT_TO_HAND ※banish_redirect_to_handフラグ→BattleScreenのバニッシュ先変更に統合（v0.148） |
| 1 | CONT | ⚡ | BANISH_SUBSTITUTE_RISE_STACK ※ログのみ（ライズ/スタック置換効果・ライズシステム未実装）（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | BANISH_MULTI_COLOR_SIGNI ※相手フィールドの複数色(2色以上)シグニを全体自動バニッシュ（v0.148） |
| 1 | AUTO | ⚡ | BATTLE_BANISH_LIFE_BURST |
| 1 | CONT | ⚡ | BEAT_ZONE_OP ※done(addLog)のみ（ビートゾーン対象選択未実装） |
| 1 | AUTO | ⚡ | BLACK_RISE_PLAY_STACK_FROM_TRASH |
| 1 | CONT | ✅ | BLOCK_OPP_ZONE_PLACEMENT ※disabled_signi_zones配列に指定ゾーンを追加実装済み |
| 1 | CONT | ✅ | BLOCK_ALL_OPP_ACTIVATE_ABILITY ※v0.131: calcContinuousBlockedActionsでUSE_ACTをforSelfに追加（相手ターン条件付き） |
| 1 | CONT | ✅ | BLOCK_COLORLESS_PLAY ※v0.131: PLAY_COLORLESSをforSelfに追加。handleSummonSigni/castSpellでColor=無をガード |
| 1 | CONT | ✅ | BLOCK_FRONT_SIGNI_ATTACK ※v0.115: calcContinuousBlockedActionsで正面シグニをcannotAttackSigniに追加 |
| 1 | CONT | ✅ | BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT ※collectBlockLowCostSpellCount+castSpellでチャーム数≤コストのスペルをブロック |
| 1 | CONT | ✅ | BLOCK_NON_WHITE_SPELL ※v0.131: BLOCK_NON_WHITE_SPELLを両者forSelf/forOtherに追加。castSpellで白以外をガード |
| 1 | AUTO | ⚡ | BLOCK_OPP_ARTS_SPELL_ACT |
| 1 | ACTIVATED | ⚡ | BLOCK_OPP_AUTO_ABILITY_EXTENDED |
| 1 | CONT | ✅ | BLOCK_OPP_DECK_TO_ENERGY ※calcContinuousBlockedActions+execEnergyChargeFromDeckでデッキ→エナをブロック |
| 1 | CONT | ✅ | BLOCK_OPP_ENCORE_AND_BET ※calcContinuousBlockedActionsでENCORE/BET両方をforOther/forSelfに追加済み |
| 1 | CONT | ✅ | BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT ※calcContinuousBlockedActions+execAddToFieldでシグニ効果による配置をブロック |
| 1 | ACTIVATED | ⚡ | BLOCK_OPP_SPELL_ACT_NEXT_TURN |
| 1 | ACTIVATED | ⚡ | BOTH_DISCARD_BY_CENTER_LEVEL |
| 1 | AUTO | ⚡ | CAST_FROM_OPP_TRASH |
| 1 | CONT | ⚡ | CENTER_LRIG_COLOR_CHANGE_BLACK ※v0.115: collectLrigColorAndLimitModsで色変更収集（UI/コスト条件への統合は部分的） |
| 1 | AUTO | ⚡ | CENTER_LRIG_DISMOUNT |
| 1 | ACTIVATED | ⚡ | CENTER_LRIG_RIDES_ON_SIGNI |
| 1 | AUTO/ACTIVATED | ⚡ | CENTER_ZONE_CONDITION ※done(addLog)のみ（センターゾーン条件チェック未実装） |
| 1 | AUTO | ✅ | CHANGE_BASE_LEVEL ※v0.142: CHOOSE(1-3,optional)→attack_phase_level_overrides設定 |
| 1 | AUTO | ✅ | CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN ※v0.142: SELECT_TARGET(任意シグニ,optional)→レベル1に設定 |
| 1 | AUTO | ✅ | CHANGE_EICHI_SIGNI_BASE_LEVEL ※v0.142: SELECT_TARGET(英知シグニ)→CHOOSE(1-3)→attack_phase_level_overrides |
| 1 | AUTO | ✅ | CHANGE_SIGNI_COLOR ※v0.142: レベルフィルタ追加（「レベルN以下」テキスト解析） |
| 1 | AUTO/ACTIVATED | ⚡ | CHOOSE_SAME_OPTION_MULTIPLE ※done(addLog)のみ（同選択肢複数回選択未実装） |
| 1 | AUTO | ⚡ | CHOOSE_SAME_OPTION_TWICE |
| 1 | AUTO/ACTIVATED | ✅ | CHOSEN_TO_ENERGY_OR_HAND ※needsInteraction CHOOSE: エナか手札への移動を選択 |
| 1 | AUTO/ACTIVATED | ✅ | CLASS_SIGNI_TO_ENERGY ※デッキ上クラスシグニをフィルタしneedsInteraction SEARCHでエナへ |
| 1 | AUTO/ACTIVATED | ⚡ | COIN_SPEND_CONDITION ※done(addLog)のみ（コイン消費条件チェック未実装） |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_ADD_HAND ※フィールドシグニ有無チェック+デッキ上ドロー実装済み |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_DISCARD ※needsInteraction SELECT_TARGET: 条件付き手札選択捨て実装済み |
| 1 | AUTO | ⚡ | CONDITIONAL_FREE_GROW |
| 1 | CONT | ✅ | CONDITIONAL_KEYWORD_BY_CENTER_COLOR ※センター色チェック+keyword_grants付与実装済み |
| 1 | ACTIVATED | ✅ | CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_SEARCH_IF_FIELD ※フィールドシグニ有無チェック+デッキ上3枚からシグニ手札追加実装済み |
| 1 | AUTO/ACTIVATED | ✅ | CONDITIONAL_SEARCH_IF_RESONA ※レゾナ有無チェック+needsInteractionでデッキから手札追加実装済み |
| 1 | AUTO | ⚡ | CONDITIONAL_TRASH_TO_ENERGY |
| 1 | AUTO/ACTIVATED | ⚡ | CONDITIONAL_TRASH_UNDER_SIGNI ※done(addLog)のみ（条件付きシグニ下トラッシュ未実装） |
| 1 | CONT | ⚡ | COOKING_BANISH_SUBSTITUTE ※done(addLog)のみ（料理系バニッシュ置換未実装） |
| 1 | AUTO/ACTIVATED | ⚡ | COST_COLOR_SELECT ※done(addLog)のみ（コスト色選択未実装） |
| 1 | AUTO/ACTIVATED | ✅ | COUNT_DISTINCT_NAMES ※自フィールドシグニ名数×deltaをtemp_power_modsに適用 |
| 1 | AUTO/ACTIVATED | ✅ | DECK_REVEAL_UNTIL_CLASS ※DECK_REVEAL_UNTILと同ハンドラ: クラスフィルタ付き完全実装 |
| 1 | ACTIVATED | ⚡ | DECK_SIGNI_LEVEL_OVERRIDE |
| 1 | LIFE | ⚡ | DECK_TOP_TO_LIFE |
| 1 | AUTO/ACTIVATED | ⚡ | DECLARE_COLOR_COND_ENERGY_TRASH ※done(addLog)のみ（色宣言→エナトラッシュ条件未実装） |
| 1 | AUTO/ACTIVATED | ⚡ | DECLARE_NUMBER_POWER ※done(addLog)のみ（POWER参照数字宣言未実装） |
| 1 | AUTO | ✅ | DECLARE_COLOR |
| 1 | AUTO | ⚡ | DEFEAT |
| 1 | ACTIVATED | ⚡ | DISCARD_BY_POWER_MATCH |
| 1 | AUTO | ⚡ | DISCARD_IF_NO_CLASS_SIGNI |
| 1 | AUTO/ACTIVATED | ⚡ | DRAW |
| 1 | AUTO | ⚡ | DRAW_BY_CHARM_COUNT |
| 1 | AUTO/ACTIVATED | ⚡ | DRAW_DISCARD_COUNT_PLUS_N |
| 1 | AUTO | ⚡ | DRIVE_SIGNI_PREVENT_DOWN |
| 1 | CONT | ✅ | DYNAMIC_LEVEL_BY_ENERGY ※buildLevelModsにエナ枚数比例レベル変動追加 |
| 1 | AUTO | ⚡ | EACH_PLAYER_DRAW_DISCARD |
| 1 | AUTO | ⚡ | DRAW_AND_PUT_HAND_TO_DECK_BOTTOM |
| 1 | CONT | ⚡ | ENERGY_COLOR_SUBSTITUTE_TRASH ※execStub: [エナ代替]（代替コスト未実装） |
| 1 | CONT | ⚡ | ENERGY_SUBSTITUTE_TRASH_KEY ※execStub: [エナ代替]（代替コスト未実装） |
| 1 | CONT | ⚡ | ENERGY_SUBSTITUTE_TRASH_SIGNI ※execStub: [エナ代替]（代替コスト未実装） |
| 1 | CONT | ⚡ | ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI ※execStub: [エナ代替]（代替コスト未実装） |
| 1 | AUTO/ACTIVATED | ⚡ | ENERGY_LEVEL_CONDITION_CHOOSE |
| 1 | AUTO | ⚡ | ENERGY_TO_HAND_ON_DECK |
| 1 | AUTO | ⚡ | ENERGY_TO_TRASH |
| 1 | CONT | ✅ | EXTRA_GUARD_COST_FROM_HAND ※collectOppExtraGuardFromHand+handleGuardResponse+ガードUI統合 |
| 1 | AUTO/ACTIVATED | ⚡ | FIELD_COND_DRAW_REVEAL |
| 1 | CONT | ⚡ | FIRST_SPELL_COST_UP ※execStub: [コストアップ]（BattleScreen未統合） |
| 1 | ACTIVATED | ⚡ | FROM_TRASH_TO_CENTER_ZONE |
| 1 | CONT | ⚡ | FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM |
| 1 | CONT | ⚡ | FROZEN_SIGNI_TO_TRASH_ON_LEAVE |
| 1 | CONT | ⚡ | GAIN_ADDITIONAL_LRIG_TYPE ※execStub: [ルリグシステム]（lrig system未実装） |
| 1 | AUTO | ⚡ | GAIN_COIN_AND_DISCARD |
| 1 | CONT | ⚡ | GAIN_LRIG_COLOR ※v0.115: collectLrigColorInheritSigni実装（SHADOW統合は未実装） |
| 1 | AUTO/ACTIVATED | ⚡ | GRANT_ABILITY_UNTIL_OPP_TURN ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_CHOSEN_ABILITY_FROM_PLAY |
| 1 | ACTIVATED | ⚡ | GRANT_CHOSEN_ABILITY_SELF |
| 1 | ACTIVATED | ⚡ | GRANT_CONDITIONAL_ASSASSIN_ABILITY |
| 1 | AUTO/ACTIVATED | ⚡ | GRANT_LRIG_ABILITY ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_LRIG_TRASH_ACTIVATE_ABILITY ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_SIGNI_CLASS ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_UNDER_LRIG_ACTIVATE_ABILITY ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_UNDER_LRIG_AUTO_ABILITY ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_UNDER_SIGNI_ALL_ABILITIES ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE ※execStub: [能力付与]（engine未実装） |
| 1 | CONT | ⚡ | GRANT_UNDER_SIGNI_CONSTANT_ABILITY ※execStub: [能力付与]（engine未実装） |
| 1 | AUTO | ⚡ | GRID_REVEAL_PLUS |
| 1 | CONT | ⚡ | GROW_COST_SUBSTITUTE_TRASH_SIGNI ※execStub: [グロウコスト]（engine未実装） |
| 1 | CONT | ⚡ | GUARD_ALTERNATIVE_COST ※execStub: [ガードコスト]（engine未実装） |
| 1 | AUTO | ⚡ | HAND_CARDS_UNDER_SIGNI |
| 1 | AUTO | ⚡ | HAND_NONCOLORLESS_TO_ENERGY |
| 1 | CONT | ✅ | HAND_SIGNI_HAS_GUARD_ICON ※v0.115: collectHandGuardIconClasses+ガードUI(myHandGuardClasses)に統合 |
| 1 | AUTO/ACTIVATED | ✅ | HAND_SIGNI_UNDER_SIGNI ※needsInteraction SELECT_TARGET: 手札シグニを選択してシグニ下に配置 |
| 1 | ACTIVATED | ⚡ | HASTARLIQ |
| 1 | CONT | ⚡ | IGNORE_LRIG_RESTRICTION_ARTS ※done(addLog)のみ（ルリグ制限無視フラグ未実装） |
| 1 | CONT | ⚡ | INCREASE_ACT_ABILITY_COST ※done(addLog)のみ（起動能力コスト増加未実装） |
| 1 | CONT | ✅ | INFECTED_SIGNI_POWER_DOWN_BY_LEVEL ※ウイルスレベル合計×-1000をtemp_power_modsに適用実装済み |
| 1 | CONT | ⚡ | INHERIT_OPP_LRIG_TYPE ※done(addLog)のみ（属性変更グループ: effectEngine未対応） |
| 1 | CONT | ⚡ | INHERIT_UNDER_SIGNI_COLOR ※done(addLog)のみ（属性変更グループ: effectEngine未対応） |
| 1 | CONT | ✅ | LEAVE_FIELD_TO_DECK_BOTTOM ※removeFromField+deckへ追加でデッキ下移動実装済み |
| 1 | AUTO/ACTIVATED | ⚡ | LEVEL_BASED_CONDITIONAL ※done(addLog)のみ（センターレベル条件分岐スキップ） |
| 1 | CONT | ⚡ | LEVEL_MOD_PER_COUNT ※done(addLog)のみ（カウント基準レベル修正未実装） |
| 1 | CONT | ⚡ | LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT ※done(addLog)のみ（属性変更グループ: effectEngine未対応） |
| 1 | AUTO/ACTIVATED | ✅ | LIFE_TO_HAND_OPTIONAL ※life_cloth先頭を手札へ移動実装済み |
| 1 | AUTO | ⚡ | LIFE_BURST_DOUBLE |
| 1 | AUTO | ⚡ | LIMIT_OPP_SIGNI_ATTACKS_ONCE |
| 1 | AUTO | ✅ | LOOK_DECK_BOTTOM ※デッキ下1枚LOOK_AND_REORDER(destPosition:'bottom')（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_BOTTOM ※デッキ上下1枚ずつLOOK_AND_REORDER(destPosition:'any')（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_BY_LIFE_COUNT ※ライフ枚数分デッキ上をLOOK_AND_REORDER（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_N ※デッキ上N枚LOOK_AND_REORDER（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_OPP_CHOOSE_TRASH ※デッキ上N枚公開→相手SELECT_TARGET(opponentResponds)→INTERNAL_TRASH_CARD（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_SIGNI_TO_FIELD ※デッキ上3枚から最初のシグニを空きゾーンに配置・残はトラッシュ（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_SORT ※LOOK_TOP_Nと同ハンドラ: デッキ上N枚LOOK_AND_REORDER（v0.148） |
| 1 | AUTO/ACTIVATED | ✅ | LOOK_TOP_SPELLS_TO_HAND ※デッキ上N枚のスペルを自動で手札へ・非スペルはデッキ戻し（v0.148） |
| 1 | AUTO | ⚡ | LOOK_TOP_ONE_RETURN_REST_BOTTOM |
| 1 | CONT | ✅ | LRIG_ALL_NAMES ※v0.129: collectLrigNameAliasesでLRIG_ALL_NAMES_SENTINEL追加。lrigNameMatchesで全ルリグ名マッチ。execStubのCONDITIONAL_MULTI_CHOOSE_BY_CENTERもruntime aliasesを考慮 |
| 1 | AUTO/ACTIVATED | ⚡ | LRIG_GAIN_ABILITY ※done(addLog)のみ（ルリグシステムグループ: 未実装） |
| 1 | CONT | ⚡ | LRIG_LIMIT_UP_AND_COLOR_GAIN ※v0.115: collectLrigColorAndLimitMods+lrigLimit計算に+limitDelta統合（色変更は部分的） |
| 1 | AUTO/ACTIVATED | ⚡ | LRIG_RIDE_SIGNI ※done(addLog)のみ（ルリグシステムグループ: 未実装） |
| 1 | AUTO | ⚡ | LRIG_TRASH_KEY_TO_CENTER_UNDER |
| 1 | ACTIVATED | ⚡ | MAKE_MULTI_SERVANT_ZERO |
| 1 | AUTO | ⚡ | MOVE_ACCE_TO_SIGNI |
| 1 | AUTO | ⚡ | MULTI_ACCE_FROM_HAND |
| 1 | CONT | ⚡ | MULTI_ACCE_LIMIT ※v0.115: collectMultiAcceSigni実装（アクセ付け時のUI制限への統合は未実装） |
| 1 | ACTIVATED | ⚡ | MULTI_DAMAGE_ON_LRIG_ATTACK |
| 1 | AUTO | ✅ | MULTI_SIGNI_POWER_UP_5000 |
| 1 | AUTO | ⚡ | MULTI_SIGNI_TO_ENERGY |
| 1 | AUTO | ⚡ | NAMED_SIGNI_ACCE_FROM_TRASH |
| 1 | ACTIVATED | ⚡ | NEGATE_ALL_OPP_EFFECTS |
| 1 | CONT | ✅ | NEGATE_ATTACK_ON_TRIGGER ※prevent_next_damageフラグ設置でアタック無効化実装済み |
| 1 | AUTO | ⚡ | NEGATE_COIN_ABILITY |
| 1 | AUTO | ⚡ | NEGATE_THAT_ATTACK |
| 1 | CONT | ✅ | NO_ABILITY_SIGNI_TO_DECK_BOTTOM ※能力テキスト有無チェック+removeFromField+デッキ下移動実装済み |
| 1 | AUTO | ⚡ | NON_GUARD_DISCARD_TO_ENERGY |
| 1 | ACTIVATED | ⚡ | NON_LRIG_TO_LRIG_TRASH |
| 1 | CONT | ✅ | ODD_LEVEL_SIGNI_CANT_ATTACK ※effectEngine.calcContinuousBlockedActionsで実装 |
| 1 | AUTO | ⚡ | OPP_CHOOSE_EFFECT |
| 1 | AUTO | ⚡ | OPP_CHOOSES_FOR_YOU |
| 1 | AUTO/ACTIVATED | ⚡ | OPP_DECK_REVEAL_UNTIL |
| 1 | CONT | ⚡ | OPP_ENERGY_COLOR_CONDITION_TRASH ※collectOppEnergyColorRestriction+handleEnergyChargeFromHand/Signiでエナチャージ時に色制限チェック |
| 1 | AUTO | ⚡ | OPP_ENERGY_EXCESS_TRASH |
| 1 | ACTIVATED | ⚡ | OPP_ENERGY_OR_DISCARD_CONDITION |
| 1 | AUTO | ⚡ | OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND |
| 1 | AUTO/ACTIVATED | ⚡ | OPP_HAND_TO_DECK_TOP |
| 1 | CONT | ✅ | OPP_LRIG_ATTACK_COST ※v0.114: collectOppLrigAttackExtraCost+handleLrigAttackに追加コスト支払い統合 |
| 1 | AUTO | ⚡ | OPP_MAIN_PHASE_LIMIT_DOWN |
| 1 | AUTO | ⚡ | OPP_RETURN_HAND_ON_SELF_BANISH |
| 1 | ACTIVATED | ⚡ | OPP_REVEAL_HAND_AND_LRIG_DECK |
| 1 | ACTIVATED | ⚡ | OPP_REVEAL_LRIG_DECK |
| 1 | ACTIVATED | ⚡ | OPP_REVEAL_TOP_AND_HAND |
| 1 | ACTIVATED | ⚡ | OPP_SIGNI_ATTACK_COST |
| 1 | CONT | ✅ | OPP_SIGNI_LEAVE_TO_TRASH ※banish_redirectフラグ設置: BattleScreenのバニッシュ先変更に統合 |
| 1 | AUTO | ⚡ | OPP_SIGNI_ONE_ATTACK_TOTAL |
| 1 | AUTO | ⚡ | OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL |
| 1 | ACTIVATED | ⚡ | OPP_SIGNI_TO_DECK_AND_SHUFFLE |
| 1 | ACTIVATED | ⚡ | OPP_SIGNI_TO_DECK_BY_GATE |
| 1 | ACTIVATED | ⚡ | OPP_SIGNI_TO_DECK_NTH |
| 1 | AUTO | ⚡ | OPP_TRASH_FIELD_SIGNI_AND_ENERGY |
| 1 | CONT | ⚡ | OPP_TRASH_LOSE_COLOR_AND_CLASS ※done(addLog)のみ（移動リダイレクトグループ: effectEngine未対応） |
| 1 | AUTO | ⚡ | OPP_TRASH_TO_DECK_TOP |
| 1 | AUTO | ⚡ | OPP_TRASH_TO_OPP_SIGNI_UNDER |
| 1 | AUTO | ⚡ | OPP_TURN_NO_ENERGY_COST |
| 1 | CONT | ⚡ | OPP_ZONE_PLACEMENT_RESTRICT ※done(addLog)のみ（相手ゾーン配置制限フラグ未実装） |
| 1 | AUTO | ✅ | OPTIONAL_HAND_REVEAL_NAMED |
| 1 | AUTO | ⚡ | OPTIONAL_DISCARD_CLASS_SIGNI |
| 1 | AUTO | ⚡ | PLACE_CHOKKIN |
| 1 | AUTO | ⚡ | PLACE_DECK_TOP_UNDER_WEAPON_SIGNI |
| 1 | ACTIVATED | ⚡ | PLACE_LRIG_FROM_DECK_ON_TOP |
| 1 | AUTO/ACTIVATED | ✅ | PLACE_SIGNI_UNDER_SIGNI ※lastProcessedCardsのシグニをsourceCardNumの下に配置実装済み |
| 1 | AUTO | ⚡ | PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON |
| 1 | AUTO | ⚡ | PLACE_VIRUS_CENTER |
| 1 | CONT | ✅ | PLAY_EFFECT_TARGET_CLASS_CHANGE ※PLAY_FREEグループに統合: スペル/アーツ効果を実行 |
| 1 | AUTO | ✅ | PLAY_SPELL_FROM_HAND |
| 1 | AUTO | ⚡ | PLAY_SPELL_FROM_HAND_FREE |
| 1 | AUTO | ⚡ | POWER_BOOST_PER_SIGNI_WITH_ICON |
| 1 | CONT | ✅ | POWER_BY_ACCE_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | CONT | ✅ | POWER_BY_CENTER_LRIG_TYPE_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | CONT | ✅ | POWER_BY_CHARM_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | CONT | ✅ | POWER_BY_ENERGY_COLOR_VARIETY ※v0.114: calcFieldPowersのSTUBハンドラで実装 |
| 1 | AUTO | ⚡ | POWER_BY_LEVEL_SUM_COMPARE |
| 1 | CONT | ✅ | POWER_BY_RISE_SIGNI_COUNT ※v0.114: calcFieldPowersのSTUBハンドラで実装（スタック2枚以上判定） |
| 1 | CONT | ✅ | POWER_CAP ※v0.114: calcFieldPowers後処理でパワー上限適用 |
| 1 | ACTIVATED | ⚡ | POWER_DOUBLE_ALL |
| 1 | AUTO | ⚡ | POWER_DOWN_BY_ZONE_CARD_COUNT |
| 1 | AUTO | ⚡ | POWER_EQUALS_FRONT_SIGNI |
| 1 | AUTO | ⚡ | POWER_MOD_BY_COLOR_VARIETY |
| 1 | AUTO/ACTIVATED | ✅ | POWER_MOD_BY_FIELD_CLASS_LEVEL ※フィールドクラスシグニのレベル合計×deltaをtemp_power_modsに適用 |
| 1 | CONT | ✅ | POWER_MOD_BY_FRONT_LEVEL ※v0.114: calcFieldPowers STUBハンドラで正面シグニLv×値パワーダウン実装 |
| 1 | AUTO | ⚡ | POWER_MOD_BY_LRIG_LEVEL_SUM |
| 1 | ACTIVATED | ⚡ | POWER_MOD_BY_TRASHED_SIGNI_LEVEL |
| 1 | AUTO | ⚡ | POWER_MOD_BY_UNDER_COUNT |
| 1 | AUTO/ACTIVATED | ⚡ | POWER_MOD_DISTRIBUTE ※done(addLog)のみ（複合パワー修正グループ: 未実装） |
| 1 | ACTIVATED | ⚡ | POWER_MOD_MIRROR |
| 1 | AUTO | ⚡ | POWER_MOD_ON_FRONT_PLACE |
| 1 | AUTO | ⚡ | POWER_MOD_TARGET_AND_SELF |
| 1 | ACTIVATED | ⚡ | POWER_UP_BY_DISCARDED_SIGNI_POWER |
| 1 | CONT | ⚡ | PREVENT_ABILITY_CHANGE_BY_OPP ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | CONT | ⚡ | PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP ※done(addLog)のみ（effectEngineで動的処理予定） |
| 1 | ACTIVATED | ⚡ | PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE |
| 1 | CONT | ✅ | PREVENT_BOUNCE_AND_DOWN_BY_OPP ※v0.114: collectDownProtectedSigni+execDownに保護フィルター統合 |
| 1 | CONT | ✅ | PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP ※prevent_lrig_damageフラグ設置実装済み |
| 1 | CONT | ✅ | PREVENT_DAMAGE_FROM_OPP_EFFECTS ※prevent_lrig_damageフラグ設置実装済み |
| 1 | ACTIVATED | ⚡ | PREVENT_DAMAGE_UNTIL_OPP_TURN_END |
| 1 | AUTO/ACTIVATED | ✅ | PREVENT_DEFEAT ※prevent_defeatフラグ設置: 敗北無効実装済み |
| 1 | AUTO | ⚡ | PREVENT_DEFEAT_THIS_TURN |
| 1 | AUTO | ⚡ | PREVENT_DEFEAT_UNTIL_NEXT_TURN |
| 1 | ACTIVATED | ⚡ | PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN |
| 1 | CONT | ⚡ | PREVENT_INFECTED_SIGNI_ACTIVATE ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | CONT | ✅ | PREVENT_LOW_LEVEL_LRIG_DAMAGE ※prevent_lrig_damageフラグ設置実装済み |
| 1 | CONT | ✅ | PREVENT_LRIG_DAMAGE ※v0.115: BattleScreenガード応答時に手札0枚条件を動的チェック |
| 1 | ACTIVATED | ⚡ | PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN |
| 1 | CONT | ⚡ | PREVENT_NON_FIELD_MOVE_BY_OPP ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | CONT | ⚡ | PREVENT_OPP_POWER_PLUS ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | CONT | ⚡ | PREVENT_OPP_SIGNI_ABILITY_GAIN ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | CONT | ✅ | PREVENT_POWER_MINUS_BY_OPP ※v0.114: calcFieldPowers applyDeltaToStateで負delta時の保護チェック実装 |
| 1 | CONT | ✅ | PREVENT_SELF_DOWN_BY_OPP ※v0.114: collectDownProtectedSigni+execDownに保護フィルター統合 |
| 1 | CONT | ⚡ | PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | CONT | ✅ | PREVENT_SIGNI_DOWN_BY_OPP_ALL ※v0.114: collectDownProtectedSigni+execDownに保護フィルター統合 |
| 1 | CONT | ⚡ | PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | ACTIVATED | ⚡ | PREVENT_TARGET_LRIG_ATTACK_THIS_TURN |
| 1 | CONT | ✅ | REDUCE_OPP_HAND_LIMIT ※effectEngine.collectHandLimitsで実装 |
| 1 | ACTIVATED | ⚡ | REDUCE_PLAY_ABILITY_COST |
| 1 | CONT | ✅ | REMOVE_OPP_MULTI_ENA ※相手エナの複数色カードをフィルタしてトラッシュへ移動実装済み |
| 1 | CONT | ✅ | REMOVE_OPP_MULTI_ENA_ONLY ※REMOVE_OPP_MULTI_ENAと同ハンドラ: 複数色エナ削除実装済み |
| 1 | AUTO/ACTIVATED | ⚡ | REPLACE_PLUS_N ※done(addLog)のみ（+N置換パターン未実装） |
| 1 | AUTO/ACTIVATED | ✅ | REVEAL ※デッキ上1枚をlastProcessedCardsに格納してログ表示実装済み |
| 1 | AUTO/ACTIVATED | ✅ | REVEALED_CARD_COLOR_DISCARD ※needsInteraction: 公開カードの色と同色手札を選択して捨て実装済み |
| 1 | AUTO/ACTIVATED | ✅ | REVEALED_SIGNI_TO_FIELD_REST_TRASH ※lastProcessedCardsのシグニを空きゾーンに配置+残りトラッシュ実装済み |
| 1 | AUTO | ⚡ | RESONANCE_COST_CARDS_TO_ENERGY |
| 1 | CONT | ⚡ | RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE ※done(addLog)のみ（ライズ/レゾナ退場置換グループ: 未実装） |
| 1 | CONT | ✅ | REVERSE_OPP_POWER_MINUS ※temp_power_modsの負デルタを正に反転する実装済み |
| 1 | CONT | ⚡ | RISE_BANISH_SUBSTITUTE ※done(addLog)のみ（ライズバニッシュ置換未実装） |
| 1 | CONT | ⚡ | RISE_LEAVE_DISCARD_STACK ※done(addLog)のみ（ライズ退場スタック捨てグループ: 未実装） |
| 1 | AUTO | ⚡ | RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY |
| 1 | AUTO/ACTIVATED | ✅ | SELECT_NO_COMMON_COLOR ※CHOOSE選択で共通色なしパターン実装済み |
| 1 | AUTO | ⚡ | SELECT_OTHER_SIGNI |
| 1 | ACTIVATED | ⚡ | SELF_TO_DECK_TOP |
| 1 | AUTO | ⚡ | SELF_TRASH_IF_NO_OPP_VIRUS |
| 1 | AUTO | ⚡ | SET_HAND_CARD_AS_TRAP |
| 1 | ACTIVATED | ⚡ | SET_LEVEL_RANGE |
| 1 | ACTIVATED | ⚡ | SET_OPP_SIGNI_POWER_BY_SELF_POWER |
| 1 | CONT | ✅ | SIGNI_CANT_BOUNCE_FROM_FIELD ※v0.131: collectBounceProtectedSigni追加・ExecCtxにotherBounceProtectedNums・execBounceでフィルタ |
| 1 | AUTO | ⚡ | SIGNI_GAIN_ONE_LRIG_COLOR |
| 1 | AUTO | ⚡ | SIGNI_GRANT_CHOSEN_ABILITY |
| 1 | AUTO | ⚡ | SIGNI_LOSE_COLOR |
| 1 | CONT | ⚡ | SIGNI_PROTECT_MOVE_EXCEPT_ENERGY ※done(addLog)のみ（保護効果グループ: effectEngine未対応） |
| 1 | AUTO | ⚡ | SIGNI_REPOSITION |
| 1 | ACTIVATED | ⚡ | SIGNI_UNDER_WEAPON_SIGNI |
| 1 | ACTIVATED | ⚡ | SPELL_COST_REDUCTION_BY_TRASH_COUNT |
| 1 | AUTO | ⚡ | STACK_ALL_LRIG_UNDER |
| 1 | CONT | ⚡ | SUBSTITUTE_DAMAGE_WITH_SELF_TRASH ※done(addLog)のみ（ダメージ代替未実装） |
| 1 | CONT | ⚡ | SUPPRESS_LIFE_BURST_ON_CRASH ※collectEichiStubEffectsで英知=8条件付き実装済み |
| 1 | AUTO | ⚡ | TOP_TO_BOTTOM_OPTIONAL |
| 1 | AUTO | ⚡ | TRADE_SELF_AND_OPP_TO_ENERGY |
| 1 | AUTO/ACTIVATED | ⚡ | TRASH_FROM_DECK_PER_SIGNI_LEVEL ※ハンドラあり（シグニレベル合計分デッキトラッシュ） |
| 1 | AUTO | ⚡ | TRASH_ACCE_AT_TURN_END |
| 1 | AUTO | ⚡ | TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY |
| 1 | ACTIVATED | ⚡ | TRASH_ALL_OPP_CARDS |
| 1 | ACTIVATED | ⚡ | TRASH_CLASS_TO_HAND_OR_ENERGY |
| 1 | AUTO | ⚡ | TRASH_SIGNI_TO_BEAT ※v0.112: 《ビートアイコン》[条件]解析・beat_zone状態管理・ターン終了クリーンアップ実装済み。対象選択(インタラクティブコスト)は未実装 |
| 5 | ACTIVATED/AUTO | ⚡ | BEAT_ZONE_OP ※v0.112: ビートゾーン状態・UI(フリーゾーン共有)・ターン終了クリーンアップ実装済み。対象選択未実装 |
| 1 | ACTIVATED | ✅ | TRASH_SPELL_FREE_USE_LIMIT ※v0.142: SELECT_TARGET(トラッシュスペル,コスト上限フィルタ)+コストなし使用 |
| 1 | AUTO | ✅ | TRIGGER_OTHER_SIGNI_EICHI_ABILITY ※v0.142: SELECT_TARGET(他自シグニ)+英知AUTO効果を発動 |
| 1 | ACTIVATED | ✅ | TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH ※v0.142: SELECT_TARGET(3枚)→1枚目エナ/2枚目手札/3枚目デッキ下 |
| 1 | AUTO | ✅ | UNDER_SIGNI_TO_ENERGY ※v0.142: ソースゾーン限定・複数時SELECT_TARGET・重複ハンドラ削除 |
| 1 | AUTO | ✅ | UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS ※v0.142: ソースゾーン限定・エナ同クラス確認・正しい条件チェック |
| 1 | AUTO/ACTIVATED | ✅ | UPKEEP_OR_NO_UP ※needsInteraction CHOOSE: アップキープ or アップなし選択実装済み |
| 1 | AUTO/ACTIVATED | ✅ | USE_SPELL_FROM_TRASH ※PLAY_FREEグループに統合: lastProcessedCardsのスペルを無料使用 |
| 1 | CONT | ⚡ | WEAPON_SIGNI_PREVENT_DOWN ※v0.142: effectEngine.collectDownProtectedSigniにウェポン保護追加（使用カードなし） |
| 1 | CONT | ⚡ | WEAPON_SIGNI_PROTECTION ※done(addLog)のみ（種族保護グループ: effectEngine未対応） |
| 1 | CONT | ✅ | WHITE_SIGNI_ABILITY_PROTECT ※v0.142: effectEngine.collectAbilityProtectedSigniに相手ターン中の白シグニ保護追加 |

---

## 集計サマリー（v0.152）

| カテゴリ | 種数 |
|---------|-----:|
| ✅ 実装済み | 233 |
| ⚡ 部分実装 | 245 |
| 📝 未実装（ログのみ） | 1 |
| **合計** | **479** |

**注意事項:**
- `CONT` = CONTINUOUS STUB。effectEngineのcollect関数で動的処理するものは✅
- `⚡` = if-branchが存在し主要パターンは動作するが、STUB_LOGへのフォールバックも持つ
- `📝` = effectEngineに専用処理がなく、ゲーム状態への影響なし（OPTIONAL_COST 377件含む）

---

## 調査コマンド

```bash
node -e "const d=JSON.parse(require('fs').readFileSync('public/data/effects.json','utf8')); const c={}; for(const [,es] of Object.entries(d)){ if(!Array.isArray(es)) continue; for(const e of es){ const a=e.action; if(a?.type==='STUB'){c[a.id]=(c[a.id]||0)+1;}}} const s=Object.entries(c).sort((a,b)=>b[1]-a[1]); console.log('総計:', s.length, '/', s.reduce((a,b)=>a+b[1],0)); s.slice(0,20).forEach(([k,v])=>console.log(v,k))"
```

---

## 実装履歴（抜粋）

| 日付 | 実装内容 | 対象STUB |
|------|---------|---------|
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
