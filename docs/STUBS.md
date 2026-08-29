# STUB 一覧

effects JSON 内の `{ type: 'STUB', id: '...' }` ノードの全一覧と実装状況。
**このファイルは `node scripts/genStubsMd.mjs` で再生成する**（手で編集しても次回再生成で消える）。

> **STUB とは:** カードテキストを DSL に落とし込む際、汎用アクションでは表現しきれない固有ロジックを
> 名前付きハンドラ（`src/engine/execStub.ts` → `execStubPart1〜3.ts`）に逃がす仕組み。
> `execStub` は Part1→2→3 の順に `stub.id` を照合し、どれにも一致しなければ `[STUB: id]` をログ出力する（フォールバック）。

## サマリー（最終生成: 2026-08-29）

| 区分 | 値 |
|---|---:|
| JSON で使用中の STUB id 種類 | 618 |
| 　└ ハンドラ実装あり | 563 |
| 　└ フォールバック（execStub 未処理） | 55 |
| 総 STUB ノード件数 | 2911 |
| JSON 0 件・ハンドラのみ（内部/動的生成 STUB） | 349 |

- 「説明」列は `execStubPart*.ts` の各 `stub.id ===` 直前コメントから自動抽出（空欄＝コメント無し、要補完）。説明を充実させたい場合は該当ハンドラの直前にコメントを書いて再生成する。
- **STUB_LOG（ゲーム効果なしのログのみ）は 0 件達成済み**（v0.284）。現在残る STUB は何らかの実処理を持つ。

---

## ⚠ フォールバック（execStub で未処理）

execStub の if 分岐に無い id。ただし下記の一部は **CONTINUOUS 宣言型**で `effectEngine` 側が処理するため実害はない
（例: `TREAT_AS_LEVEL1_IN_DECK_TRASH`）。新規 STUB を足したのにここに出る場合は実装漏れの可能性。

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `OPTIONAL_ACTIVATE` | 22 | 22 | WD10-001, SPDi43-21, WX02-003 |  |
| `OPTIONAL_TRASH_SELF` | 17 | 17 | PR-319, WX06-CB01, WX06-CB03 |  |
| `PREVENT_POWER_MODIFY_BY_OPP` | 5 | 5 | WX05-024, WX12-033, WX20-023 |  |
| `DAMAGE_REPLACE_BY_COST` | 4 | 4 | SPDi44-12, WX24-P3-005, WX24-P4-021 |  |
| `BATTLE_BANISH_PREVENT_LOSE_ABILITY` | 3 | 3 | WX13-031, WX16-001, WXK04-068 |  |
| `CONVERT_ENERGY_COLOR` | 3 | 3 | WXEX1-54, WXEX1-56, WXEX2-56 |  |
| `EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY` | 3 | 3 | WX25-P2-059, WX26-CP1-047, WXDi-CP02-056 |  |
| `EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY` | 3 | 3 | WX25-P2-071, WX25-P3-055, WX25-P2-TK04 |  |
| `GRANT_ALL_ZONE_LIFEBURST` | 3 | 3 | WD14-001, WX02-002, WX17-036 |  |
| `GUARD_LOSS_UNLESS_LRIG` | 3 | 3 | WX12-025, WX12-034, WX12-036 |  |
| `DEFERRED_COLOR_QUALIFIED_USE_BLOCK` | 2 | 2 | PR-471, WXK09-037 |  |
| `EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY` | 2 | 2 | SPDi44-08, WX25-P1-018 |  |
| `ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白` | 2 | 2 | WDK16-01T, WXK10-015 |  |
| `OPTIONAL_DISCARD_HAND_CLASS` | 2 | 2 | WX24-P3-068, WXDi-P14-083 |  |
| `ATTACK_WHILE_DOWN` | 1 | 1 | WX22-022 |  |
| `CANNOT_DEAL_DAMAGE_TO_OPPONENT` | 1 | 1 | WX25-CP1-074 |  |
| `DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE` | 1 | 1 | SPDi43-05 |  |
| `DEFERRED_CHECK_ZONE_TO_HAND` | 1 | 1 | WXDi-P11-006 |  |
| `DEFERRED_CONDITIONAL_EXTRA_USE_TIMING` | 1 | 1 | WX16-Re20 |  |
| `DEFERRED_CONDITIONAL_GROW_BY_LRIG_LEVEL` | 1 | 1 | SP38-001 |  |
| `DEFERRED_EACH_PLAYER_REVEAL_HAND` | 1 | 1 | WXEX2-80 |  |
| `DEFERRED_LIFE_TOP_TO_DECK_SHUFFLE` | 1 | 1 | WXDi-P12-034 |  |
| `DEFERRED_LOOK_OWN_LIFE_TOP_OPTIONAL_CRASH` | 1 | 1 | WD23-022-E |  |
| `DEFERRED_MOVE_OPP_SIGNI_TO_OTHER_ZONE` | 1 | 1 | WXDi-P06-045 |  |
| `DEFERRED_OPP_BLIND_PICK_MY_HAND_DISCARD` | 1 | 1 | SPK01-14 |  |
| `DEFERRED_OPP_BLIND_PICK_MY_HAND_REVEAL` | 1 | 1 | PR-K078 |  |
| `DEFERRED_OPP_BLIND_PICK_MY_LRIG_DECK` | 1 | 1 | PR-K070 |  |
| `DEFERRED_OPP_DECK_BOTTOM_MILL_THEN_NAME_BANISH` | 1 | 1 | WXDi-P00-037 |  |
| `DEFERRED_OPP_DECK_TOP_REVEAL_TO_BOTTOM` | 1 | 1 | WXDi-P00-063 |  |
| `DEFERRED_OPP_HAND_TO_CHECK_ZONE_UNTIL_END` | 1 | 1 | WXK10-045 |  |
| `DEFERRED_OPP_LRIG_LEVEL_MODIFY` | 1 | 1 | SP38-005 |  |
| `DEFERRED_OPP_LRIG_UNDER_TO_TRASH` | 1 | 1 | WD23-012-A |  |
| `DEFERRED_OPP_TRASH_TO_DECK_THEN_REARRANGE` | 1 | 1 | WDK09-015 |  |
| `DEFERRED_OPTIONAL_SELF_MILL_THEN_LEVEL_MILL` | 1 | 1 | WX24-P4-085 |  |
| `DEFERRED_PLACE_LOOKED_CARD_UNDER_SIGNI` | 1 | 1 | WXK08-084 |  |
| `DEFERRED_REPEAT_ON_REVEALED_NAME` | 1 | 1 | WXDi-CP01-033 |  |
| `DEFERRED_SELF_BECOME_ACCE_OF_PLAYED_SIGNI` | 1 | 1 | WDK17-015 |  |
| `DEFERRED_SELF_SIGNI_COLOR_TO_DECLARED` | 1 | 1 | WX22-042 |  |
| `DEFERRED_SELF_TRASH_TO_DECK_BOTTOM` | 1 | 1 | WX22-Re17 |  |
| `DEFERRED_SWAP_OPP_LIFE_TOP_AND_DECK_TOP` | 1 | 1 | WXDi-P08-008 |  |
| `DEFERRED_TRASH_UNDER_DISTINCT_LEVELS` | 1 | 1 | WX24-P4-046 |  |
| `EFFECT_LEAVE_REPLACE_BANISH` | 1 | 1 | WX25-P1-056 |  |
| `FLIP_SELF_ON_TARGETED` | 1 | 1 | WX25-CP1-060 |  |
| `GUARD_ALT_HAND_REPLACE` | 1 | 1 | WX24-P4-026 |  |
| `HOLOGRAPH_REVEAL_REPLACE` | 1 | 1 | WX16-004 |  |
| `LIMIT_ALL_FIELD_1` | 1 | 1 | WX04-005 |  |
| `LRIG_UNDER_TO_TRASH` | 1 | 1 | WX05-007 |  |
| `MAYU_ENCOUNTER_FLIP_AND_GROW` | 1 | 1 | WXDi-P13-003A |  |
| `OPP_TURN_ARTS_COST_REDUCTION_ONCE` | 1 | 1 | WXK03-071 |  |
| `OPTIONAL_LRIG_UNDER_COST` | 1 | 1 | WXDi-P05-009 |  |
| `REFRESH_LIFE_MOVE_REPLACE_LOSE_ABILITY` | 1 | 1 | WX24-P3-009 |  |
| `STRIP_OPP_ENA_MULTI_ENA` | 1 | 1 | WXK11-020 |  |
| `TRASH_ABILITY_LOSS_AND_IMMUNITY` | 1 | 1 | WX12-023 |  |
| `TREAT_AS_CLASS_ALL_ZONES` | 1 | 1 | WXDi-CP02-103 |  |
| `UNDER_CARD_AS_ENERGY_COST` | 1 | 1 | WXDi-P10-041 |  |

---

## 実装済み STUB（ハンドラ別）

### execStubPart1.ts（122 種）

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `OPTIONAL_COST` | 625 | 587 | WD10-009, WD12-009, WD13-003 | 任意コスト（effectExecutorのSEQUENCEインターセプト対象外のエッジケース） |
| `STORE_LAST_PROCESSED_TARGETS` | 227 | 222 | WD12-009, WD22-029-G, WDK06-R09 |  |
| `SELECT_TARGET_ONLY` | 211 | 206 | WD12-009, WD22-029-G, WDK06-R09 | SELECT_TARGET_ONLY（タスク12(liii)）: 「〈シグニ〉１体を対象とし、」だけを行い盤面は一切変えない対象宣言。 「それのレベル１につき〈コスト〉を支払ってもよい」族は、コスト量が対象のレベルで決まるため **対象を… |
| `TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` | 121 | 118 | WD06-001, WD15-001, WD20-001 | 他の任意コスト系（SEQUENCEパターン外のフォールバック） |
| `ARTS_COST_REDUCTION_BY_EFFECT` | 78 | 76 | WD10-006, WD12-006, WD16-010 | アーツコスト軽減／置換マーカー（コストはBattleScreen使用時に算出済み）。 「減る/増える」は `computeArtsEffectiveCost` の軽減規則、「《X》に**なる**」＝条件つき置換は 同ファイルの `comp… |
| `OPPONENT_PAY_OPTIONAL` | 78 | 70 | WDK10-001, SPDi43-01, SPDi43-02 | 対戦相手任意コスト（相手にCHOOSEを提示し、支払うとフラグを立てる） |
| `OPTIONAL_TRASH_ENERGY_CLASS` | 39 | 39 | WD14-009, WDK08-Y14, WX11-006 | 他の任意コスト系（SEQUENCEパターン外のフォールバック） |
| `RULE_REMINDER_TEXT` | 34 | 34 | SP26-003, SP38-001, PR-469 | ゲームプレイに影響しない説明テキストは無音でスキップ |
| `DECLARE_NUMBER` | 31 | 30 | WD06-008, WD13-008, WDK09-011 | 数字宣言：CHOOSE UI で 1〜5 を選択し declared_number に保存する（ガード制限は伴わない・§6.4 O-41） |
| `SOUL_OP` | 26 | 26 | WD21-006, WD22-016-UG, SPK06-05 | ソウル/ルリグデッキ操作 |
| `GAIN_SUBSCRIBER_COUNT` | 21 | 20 | WDK16-01T, WDK16-02T, WDK16-03T | サブスクライバーカウント+1 |
| `GRANT_ABILITY_INNER_TEXT` | 20 | 20 | WD17-001, SPDi43-01, WXEX1-11 |  |
| `GAIN_ABILITY_THIS_GAME` | 19 | 18 | WX08-015, WX10-011, WX24-P4-036 | このゲームの間、グロウ不可・キーワード付与・特定カード名の使用禁止などの常在効果を得る |
| `LOOK_OPP_LIFE_TOP` | 19 | 18 | WD06-006, WD06-018, WDK09-017 | 指定されたゾーンの上から N 枚を見る（公開する）。 |
| `DECLARE_CARD_NAME` | 18 | 16 | PR-257, WX10-068, WX11-037 | カード名宣言（手札のカード名から選択） |
| `POWER_MOD_PER_COUNT` | 17 | 17 | SP26-003, PR-K026, SPDi47-05 | 動的パワー修正（COUNT依存） |
| `COPY_LRIG_NAME_ABILITY` | 16 | 16 | WX24-P4-011, WX24-P4-012, WX24-P4-013 | ルリグトラッシュのルリグ名を現在のルリグに追加する（能力コピーは |
| `TARGET_AND_DISCARD_HAND` | 16 | 15 | PR-195, WX18-033, WX19-Re18 | 手札を捨てて対戦相手シグニを対象とする効果（スタンドアロン時：手札1枚捨て+相手シグニをlastProcessedCardsへ） |
| `COUNT_BASED_DRAW_OR_POWER` | 15 | 15 | WX19-Re18, WX24-P3-074, WX25-P3-084 | カウント基準ドロー/パワー（lastProcessedCardsの枚数だけドロー or パワー修正） |
| `GRANT_QUOTED_ABILITY` | 15 | 14 | WX22-Re04, WX24-P1-042, WXDi-D04-011 | 引用符付き能力付与（キーワード → keyword_grants、複合能力 → granted_effects） |
| `ARTS_COST_REDUCTION_BY_CENTER_LRIG` | 14 | 14 | WX11-015, WXK05-002, WXK05-004 | アーツコスト軽減／置換マーカー（コストはBattleScreen使用時に算出済み）。 「減る/増える」は `computeArtsEffectiveCost` の軽減規則、「《X》に**なる**」＝条件つき置換は 同ファイルの `comp… |
| `STEAL_OPP_TRASH_PUPPET` | 13 | 11 | WDK17-001, WDK17-007, WDK17-012 | 対戦相手のトラッシュからシグニを傀儡状態であなたの場に出す（WDK17-007）。 |
| `SONG_FRAGMENT` | 11 | 11 | SPDi47-01, SPDi47-02, SPDi47-03 | エナゾーンから【歌のカケラ】持ちカードをトラッシュに置き、その効果を発動 |
| `LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END` | 10 | 10 | WX24-P3-001, WX24-P3-003, WX24-P3-005 | ルリグリミット修正（エナフェイズ終了まで） |
| `GRANT_GUARD_ICON_HAND_SIGNI` | 9 | 9 | WXDi-P04-049, WXDi-P10-049, WXDi-P13-044 | 手札のシグニにガードアイコンを付与（このターン） |
| `REMOVE_VIRUS` | 9 | 9 | WD19-001, WX15-028, WX15-040 | ウイルス除去：テキストを解析して適切な数のウイルスを取り除く |
| `TRASH_SIGNI_UNDER_FIELD_SIGNI` | 9 | 9 | WDK15-001, WDK15-007, WX22-035 | トラッシュからシグニをフィールドシグニの下に置く（ライズ補充） |
| `BET_MECHANIC` | 8 | 8 | WDK06-R08, WDK12-007, SPK16-13E | ①②③④選択（ベット時は強化数まで選べる） |
| `CONDITIONAL_ARTS_COST` | 8 | 8 | WX18-009, WX18-012, WX18-015 | 条件つきアーツ使用コスト（§5.3 `O-60` 第8バッチ・2026-08-26）。 |
| `SUPPRESS_LIFE_BURST_ON_CRASH` | 8 | 8 | SP26-002, WX05-032, WX08-010 | ライフバースト抑制：対戦相手の suppress_life_burst フラグをセット |
| `DOUBLE_POWER_MINUS` | 7 | 7 | SPDi43-04, WX13-058, WX22-023 |  |
| `EXILE_FROM_CHECK_ZONE` | 7 | 7 | WX14-002, WX14-014, WXEX1-46 | チェックゾーンから除外：対戦相手のチェックゾーンのカードをトラッシュへ |
| `LIFE_CRASH_PREVENTION` | 6 | 6 | WD06-008, WD13-010, SP38-002 | 「このターン、あなたのライフクロスは（ダメージ以外によっては）クラッシュされない」 |
| `LOOK_AND_REORDER` | 6 | 6 | WX13-035, WX26-CP1-055, WXDi-P01-013 | デッキを見て並べ替え（STUB版：動的パース） |
| `PER_OWN_LRIG_COLOR_SCALE` | 6 | 2 | WX25-P3-050, WXDi-P08-064 | PER_OWN_LRIG_COLOR_SCALE（§6.4 O-34(d)）:「あなたの場にいる〈色〉のルリグ１体につき〈効果〉」＝ その色の自ルリグ体数だけ本体を繰り返す。 🔑**数える対象はセンター＋アシスト2枠の最前面**（`lr… |
| `PLACE_CARD_UNDER_SIGNI` | 6 | 6 | WX24-P2-056, WX24-P4-046, WX25-P3-110 | `placeUnder` が指すものをシグニの下に置く。 |
| `DECLARE_NUMBER_PLAIN` | 5 | 4 | PR-434, WX17-039, WX24-P4-039 | 数字宣言（宣言できる数字を絞れる版・タスク12(xlvi)(c)）。「数字１つを宣言する。…宣言した数字と同じ レベルを持つシグニを手札に加える」（PR-434）のように宣言値を filter に使うだけの効果はこちら。 ⚠**§6.4 … |
| `MOVE_TO_OTHER_SIGNI_ZONE` | 5 | 5 | WX14-050, WX14-052, WX14-053 | 自シグニを他の空きシグニゾーンに移動（してもよい） |
| `POWER_MOD_PER_REVEALED` | 5 | 5 | WX25-CP1-003, WX25-CP1-061, WXDi-P00-033 | 公開したカード枚数基準パワー修正 |
| `PREVENT_DEFEAT_THIS_TURN` | 5 | 4 | SP36-001, WX24-P3-004, WX25-P3-049 | 敗北無効フラグ |
| `SUPPRESS_LIFE_BURST_ON_CARD` | 5 | 5 | WX24-P1-003, WX25-P3-032, WX25-P3-036 | ライフバースト抑制：対戦相手の suppress_life_burst フラグをセット |
| `TRADE_BANISH_SELF_SIGNI` | 5 | 5 | WX20-022, WXEX1-09, WX25-CP1-003 | トレード：自シグニ1体をトラッシュに置き、相手シグニ1体をバニッシュ |
| `TRASH_OWN_KEY_OPTIONAL` | 5 | 5 | WXK08-010, WXK08-015, WXK08-016 | キー１枚を任意でルリグトラッシュに置く（追加効果条件） |
| `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` | 4 | 4 | SP26-005, SP38-004, WX13-060 | CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE 「以下のN つからM つ選ぶ。[条件]の場合、代わりにK つまで選ぶ。①...②...」 stub.value: undefined=初回, 0=ベ… |
| `DECK_REVEAL_UNTIL` | 4 | 4 | WDK04-006, WDK13-017, WX22-021 | デッキを条件が満たされるまで公開する |
| `DECLARE_CLASS` | 4 | 4 | PR-431, WX24-P1-035, WX25-P1-058 | クラスを宣言してownerState.declared_classに保存 |
| `DECLARE_COLORS` | 4 | 4 | WX11-074, WX11-077, WX11-080 | 原文が列挙した候補から重複なしで複数色を同時宣言する。 |
| `GRANT_QUOTED_AUTO_ABILITY` | 4 | 4 | WD21-007, PR-K076, WXDi-CP02-TK03A | WD21-007型: 「以下の５つから１つを選ぶ。…対象のシグニ１体は選んだ能力を得る。あなたがベットしていた場合、この効果を１回繰り返す。」 |
| `INTERNAL_NOOP` | 4 | 4 | WX24-P3-050, WX25-CP1-087, WX26-CP1-092 | 盤面を変えない内部マーカー（SELECT_TARGET_ONLY の thenAction 等）。 |
| `LRIG_GROW_RESTRICT` | 4 | 4 | WX25-P2-032, WX25-P2-033, WX25-P3-034 | グロウ制限：対戦相手の no_grow フラグをセット |
| `POWER_MOD_BY_DISCARD_COUNT_HIGH` | 4 | 4 | WX24-P3-052, WX26-CP1-051, WXDi-P05-078 | 捨てた枚数基準パワー修正 |
| `REVEAL_PICK_HAND_SHUFFLE_BOTTOM` | 4 | 4 | WX14-037, WX16-Re04, WX20-041-CB | デッキ上N枚公開してM枚を手札に加え残りをデッキ下/トラッシュ/エナゾーンへ |
| `UNKNOWN_NESTED` | 4 | 4 | WX24-P2-060, WX24-P3-018, WXDi-P04-033 | 自シグニを任意でトラッシュに置く（そうした場合に後続効果が発動） |
| `BANISH_FROM_GAME` | 3 | 3 | WX12-035, WX13-040, WX14-064 | ゲームから除外：トラッシュにある自シグニを任意で除外（後続効果条件） |
| `DECLARE_COLOR` | 3 | 3 | WX22-042, WXDi-P07-059, WXDi-P13-051 |  |
| `LIFE_TO_ENERGY` | 3 | 2 | WX25-CP1-020, WXK09-003 | 対象プレイヤーのライフクロス上1枚を、そのプレイヤーのエナゾーンへ置く。 クラッシュではないためライフバースト/check は発生させない。 |
| `MASS_TRASH` | 3 | 3 | WX11-020, WXDi-P05-007, WXK06-028 | 大量トラッシュ: 相手エナ全体+相手シグニ全体、またはシグニ+キー |
| `OPP_CHOOSE_YOUR_HAND_DISCARD` | 3 | 3 | WD21-004, WX17-014, WXK01-013 | 対戦相手が手札を1枚選んで捨てる |
| `REVEAL_CLASS_SIGNI_FROM_HAND` | 3 | 3 | WDK08-Y11, WXK04-034, WXK05-043 | 手札のクラスシグニを好きな枚数公開（公開＝SELECT_TARGET、デッキに触れない） |
| `STRIP_ATTACHED_AND_UNDER` | 3 | 3 | WX18-029, WX19-064, WXDi-P07-041 | STRIP_ATTACHED_AND_UNDER（§6.4 O-34(a)・`WX19-064-E1` 選択肢③）: 「シグニ１体を対象とし、**それに付いているすべてのカード**と、**下に置かれているすべてのカード**を  トラッシュ… |
| `BET_ALTERNATIVE` | 2 | 2 | WX17-005, WXDi-P07-059 | ベット強化済みなのでスキップ（BET_MECHANICで処理済み） |
| `CRASH_LIFE_TO_HAND` | 2 | 2 | WX24-P2-048, WXDi-P07-001 | ライフクロスの一番上を手札に加える |
| `DECK_TOP_TO_LIFE` | 2 | 2 | WX10-002, WXK02-035 | デッキ上をライフクロスに加える |
| `DISCARD_IF_ATTACKED_THIS_TURN` | 2 | 2 | WX12-047, WX12-048 | このターンにこのシグニがアタックしていた場合、手札を1枚捨てる |
| `DISRUPT_OPP_LRIG_UNDER_BY_TYPE` | 2 | 2 | SPK16-8C, PR-465 | このシグニがアタックしたとき、対戦相手のセンタールリグの下のカードを最大2枚、 |
| `DRAW_AND_PUT_HAND_TO_DECK_BOTTOM` | 2 | 2 | WX26-CP1-006, WXK10-043 | 各プレイヤーがカードを1枚引き手札を1枚デッキ下に置く |
| `EXTRA_COST_REMOVE_VIRUS` | 2 | 2 | WX16-023, WX16-048 | ウイルスを任意数取り除いてからN+1択の効果を選ぶ |
| `HAND_TO_ENERGY_OPTIONAL` | 2 | 2 | WX14-067, WXDi-P06-076 | 手札から任意でエナゾーンに置く |
| `LRIG_UNDER_CARD_OP` | 2 | 2 | SPDi43-26, WXDi-CP02-054 | `underCardOp` が指す操作を1つだけ行う。 |
| `LRIG_UNDER_TRASH_ANY` | 2 | 2 | WD21-009, PR-238 | あなたのルリグ（アシスト含む）の下からカードを好きな枚数選び、ルリグトラッシュに置く |
| `NEGATE_ATTACK_ON_TRIGGER` | 2 | 2 | WX25-P1-TK6, WXDi-P11-055 |  |
| `OPP_CHOOSE_OWN_SIGNI_TO_ENERGY` | 2 | 2 | WXDi-P12-051, WXDi-P16-077 | 対戦相手が自分のシグニを選んでエナに置く |
| `OPP_GUARD_COST_COLORLESS` | 2 | 2 | WX24-P3-069, WXDi-P16-059 | 実行型の「このターン、追加で《無》N枚」。until 省略の CONTINUOUS 宣言は collector が処理する。 |
| `OPP_HAND_TO_DECK_TOP` | 2 | 2 | WXK06-028, WXK06-041 | 相手の手札をデッキトップに置く |
| `OPP_LRIG_DECK_TO_LRIG_TRASH` | 2 | 2 | SPDi43-25, WX24-P4-014 | 対戦相手が自分のルリグデッキからカード1枚を選んでルリグトラッシュに置く（WX24-P4-014-E3 ②）。 ⚠**選ぶのはカードの持ち主＝対戦相手**なので `opponentResponds` を立てる（`OPP_CHOOSE_YO… |
| `SELF_TO_DECK_TOP` | 2 | 2 | WXDi-P02-058, WXK03-051 | 自シグニをデッキトップに置く |
| `SET_NEXT_LIFE_CRASH_COUNTER` | 2 | 2 | WX25-P1-004, WXDi-P12-030 | 「次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスをクラッシュする」 |
| `TARGET_ONLY` | 2 | 2 | PR-Di017B, WXDi-P07-086 | ターゲット選択のみ（lastProcessedCards に格納し後続ステップへ） |
| `TRASH_ALL_SIGNI_AND_KEY` | 2 | 2 | WX07-017, WXEX2-21 |  |
| `TRASHED_CARD_TO_HAND_OR_ENERGY` | 2 | 2 | WX24-P3-007, WX24-P3-030 | トラッシュに置かれたカードを手札かエナに |
| `VIEW_AND_DISCARD_SPELL` | 2 | 2 | WX14-038, WXDi-P16-050 | 相手の手札を見てスペルを捨てさせる |
| `ACCE_BANISH_SUBSTITUTE` | 1 | 1 | WXDi-P09-TK03A | アクセクラフトによる場離れ代替（オンタマ等） |
| `ARTS_ATTACK_EMPTY_ZONE_AS_FRONT` | 1 | 1 | WX16-021 | 「このターン、あなたの＜英知＞のシグニがシグニのない対戦相手のシグニゾーンにアタックする場合、     代わりにそのアタックではそのシグニゾーンの正面にあるかのように対戦相手にダメージを与える。」 ⚠クラスは**構造（`sideAttac… |
| `BANISH_ATTACKER_IF_WEAKER_THAN_FRONT` | 1 | 1 | WD07-012 | WD07-012 コードアンチ ヴィマナ【自】。 |
| `DECLARE_PARITY_OPPONENT` | 1 | 1 | WDK04-006 | WDK04-006: 対戦相手が偶数/奇数を宣言する。値は汎用 declared_number に偶=0/奇=1で保存し、 ガード制限用 declared_guard_restrict_level は立てない。 |
| `DECLARE_TWO_GUARD_LEVELS` | 1 | 1 | WD21-009 | 異なるレベルを2つ宣言する（対戦相手はそのレベルのシグニで【ガード】できない） |
| `DISCARD_IF_NO_CLASS_SIGNI` | 1 | 1 | WXDi-P07-062 | フィールドに他のクラスシグニがない場合、手札を捨てる |
| `DRAW_IF_POWER_ZERO_TEMP` | 1 | 1 | WX15-064 | lastProcessedCards[0]がtemp_power_mods適用後パワー0以下なら1枚引く（WX15-064型） |
| `EACH_PLAYER_DRAW_DISCARD` | 1 | 1 | WXDi-P04-010 | 各プレイヤーがカードを1枚引き、1枚捨てる |
| `EXILE_ARTS_FROM_LRIG_DECK_SKIP_SIGNI_STEP` | 1 | 1 | WXK11-001 | WXK11-001 ②「あなたのルリグデッキにあるコストの合計が２以上のアーツ１枚をゲームから除外してもよい。   そうした場合、このターン、シグニアタックステップをスキップする。」 ⚠**スキップ機構は既に完備**（同カード①のルリグ側… |
| `GRANT_QUOTED_ACTIVATE_ABILITY` | 1 | 1 | WXDi-P09-066 | 「【起】...」付与（effectEngineのCONTINUOUS処理で対応） |
| `HAND_NONCOLORLESS_TO_ENERGY` | 1 | 1 | WXK10-083 | 手札から無色でないカードをエナに置く |
| `INSTALL_GAME_GRANTED_AUTO` | 1 | 1 | WX25-P2-009 | ゲーム全体能力付与 |
| `INTERNAL_GRANT_ATTACK_BANISH_TO_ARMORED` | 1 | 1 | WXK04-030 | WXK04-030 血晶の紅雨。 |
| `MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC` | 1 | 1 | WX24-P4-016 | 「このターンのアタックフェイズの間、効果によってあなたの【マジックボックス】１つが表向きに     なったとき、あなたのシグニ１体を対象とし、ターン終了時まで、それは【アサシン】か     【ダブルクラッシュ】を得る。」 ⚠**印字能力で… |
| `MUGEN_Q_RESET_AND_FLIP` | 1 | 1 | WXDi-P11-010A | WXDi-P11-010A 夢限 -Q-: reset and flip in one indivisible state write. Field SIGNI leave triggers are collected later by … |
| `MULTI_SIGNI_TO_ENERGY` | 1 | 1 | WXDi-P04-077 | 相手シグニ複数をエナに置く |
| `NON_GUARD_DISCARD_TO_ENERGY` | 1 | 1 | WX24-P2-051 | ガードアイコンなしカードを捨てたとき、そのカードをエナへ |
| `OPP_ENERGY_COLORLESS_ABILITY_LOSS` | 1 | 1 | WXK10-008 | トラッシュから黒シグニを手札へ |
| `OPP_ENERGY_EXCESS_TRASH` | 1 | 1 | WXEX1-07 | 対戦相手のエナゾーンが閾値以上の場合、1枚トラッシュに |
| `OPP_REVEAL_SPELL_USE_FREE` | 1 | 1 | WX04-015 | 対戦相手のデッキを上からスペルがめくれるまで公開し、 |
| `OPP_SIGNI_TO_DECK_AND_SHUFFLE` | 1 | 1 | WXK10-006 | 相手シグニをデッキに加えてシャッフル |
| `OPP_TRASH_TO_DECK_TOP` | 1 | 1 | WXDi-P07-076 | 相手のトラッシュからカードをデッキトップに（もよい） |
| `OPTIONAL_DISCARD_CLASS_SIGNI` | 1 | 1 | PR-328 | 手札からクラスシグニを任意枚数捨てる |
| `PLACE_REV_SIGNI` | 1 | 1 | PR-Di017A | REVメカニクス（ライフクロス1枚以下時に指定シグニを場に出す） |
| `PLACE_TRASH_SIGNI_FACING_SAME_POWER` | 1 | 1 | WXDi-CP01-024 | ═══ PLACE_TRASH_SIGNI_FACING_SAME_POWER（§6.4 O-32・`WXDi-CP01-024-E1`）═══ 「あなたのトラッシュから**対戦相手の場にあるシグニ１体と同じパワー**の＜X＞のシグニを１… |
| `PLAY_MILLED_SIGNI_DELAYED_TRASH` | 1 | 1 | WXDi-P09-079 | 「あなたのデッキからレベル１のシグニ１枚がトラッシュに置かれたとき、そのシグニを場に出す。     ターン終了時、そのシグニを場からトラッシュに置く。」 ⚠**timing・triggerCondition は既に配線済み**（`ON_C… |
| `POWER_PLUS_BANISHED_POWER` | 1 | 1 | WX24-P2-049 | 対象のパワーを、そのバニッシュしたシグニのパワーぶん＋する |
| `PREVENT_DEFEAT` | 1 | 1 | WX12-002 | 敗北無効フラグ |
| `PREVENT_DEFEAT_UNTIL_NEXT_TURN` | 1 | 1 | WXEX2-08 | 敗北無効フラグ |
| `REMOVE_VIRUS_TARGET_ZONE` | 1 | 1 | WX15-064 | lastProcessedCards[0]と同じゾーンのウィルスを1個除去（WX15-064型） |
| `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG` | 1 | 1 | WX25-P2-009 |  |
| `REVEAL_EACH_PLAYER_DECK_TOP` | 1 | 1 | SPDi43-25 | 対戦相手のライフクロス上を見る（複数枚パターン対応） REVEAL_EACH_PLAYER_DECK_TOP（§6.4 O-35・続き530）＝「各プレイヤーは自分のデッキの一番上のカードを公開する」。 🔴従来は parser がこの文… |
| `REVEAL_PICK_CLASS_TO_ENERGY` | 1 | 1 | WX18-034 | デッキ上2枚を見てクラスシグニをエナへ、残りをデッキ上へ |
| `SELF_TO_LRIG_DECK_AND_FETCH_SAME_NAME` | 1 | 1 | PR-470A | 自身を場→ルリグデッキへ戻し、ルリグデッキから fetchCardName（省略時は同名）のカードを同じゾーンへ出す。 PR-470A《現実からの逃避 タマ》→《進化する筋肉 紗倉ひびき》（PR-470B）＝**別名カード**なので fe… |
| `SET_DISPAIR_BURST_GRANT` | 1 | 1 | WX25-P3-027 | ディスペア：次の対戦相手ターンだけ、自分の全ゾーンの非LBカードへ指定LBを付与する。 |
| `SIGNI_GRANT_CHOSEN_ABILITY` | 1 | 1 | WXK09-050 | WXK09-050 コードアート Ｒ・Ｌ・Ｃ【出】。 |
| `SKIP_MAIN_PHASE` | 1 | 1 | WXK06-078 | 「このメインフェイズを終了する」（`WXK06-078-E1`・§6.4 O-3 続き491）。 ⚠🔴従来は**ログを1行出すだけ**で state を一切書いていなかった＝`census:stubs` は「ハンドラがある」   ことを… |
| `TK3_DECLARE_DISCARD` | 1 | 1 | WD03-006 | 数字を宣言し、対戦相手の手札から宣言レベルのシグニをすべて捨てさせる |
| `TOP_TO_BOTTOM_OPTIONAL` | 1 | 1 | WXDi-P03-050 | デッキトップを見て下に置いてもよい |
| `USE_SEARCHED_SPELL_OR_TRASH` | 1 | 1 | WX20-077 | USE_SEARCHED_SPELL_OR_TRASH（§6.4 O-34(b)・`WX20-077-E2`）: 「その後、デッキをシャッフルし、**それをコストを支払わずに使用するかトラッシュに置く**」＝ 直前のサーチで見つけたカード… |
| `VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE` | 1 | 1 | WX25-CP1-040 | エナゾーンからN枚までトラッシュに置き、この方法で置いた枚数と同じレベルの対戦相手のシグニ1体を手札に戻す |

### execStubPart2.ts（202 種）

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `TRAP_OPERATION` | 16 | 13 | SP26-001, WX15-047, WX15-053 | O-56: TRAP_OP / TRAP_OPERATION の文単位ペイロード。 parser がどの文に一致したかを渡すので、executor はカード全文を読み直さない。 live 18効果・再帰21ノードすべてへの搭載を機械確認後… |
| `DESIGNATE_SIGNI_ZONE` | 14 | 14 | WDK10-009, WX08-021, WX10-051 | シグニゾーンを1つ指定する。 |
| `PLAY_FREE` | 8 | 8 | PR-474, WX07-014, WX14-002 | フリープレイ系：lastProcessedCards[0] のカードをコストなしでプレイ |
| `PLACE_TRAP_OPTIONAL` | 7 | 7 | WX15-084, WX15-086, WX16-015 | 【トラップ】設置 |
| `CAST_FROM_OPP_TRASH` | 6 | 5 | PR-433, WX14-027, WXEX1-46 | lastProcessedCards未設定時は相手トラッシュからスペル選択 |
| `CRAFT_TO_LRIG_DECK` | 6 | 6 | WX25-P1-034, WXDi-P14-006, WXDi-P14-007 | クラフトをルリグデッキへ |
| `DOUBLE_OWN_POWER_MINUS` | 6 | 6 | WX24-P1-049, WX25-P2-103, WX25-CP1-070 | 対象シグニへの自分効果パワー-を2倍にする（SELECT_TARGET + フラグ設置） |
| `TRAP_OP` | 6 | 6 | WX16-061, WX17-044, WX17-062 | O-56: TRAP_OP / TRAP_OPERATION の文単位ペイロード。 parser がどの文に一致したかを渡すので、executor はカード全文を読み直さない。 live 18効果・再帰21ノードすべてへの搭載を機械確認後… |
| `TRAP_TO_HAND` | 6 | 6 | WD23-040-A, WX16-017, WX16-028 | 自分の【トラップ】を `trapToHand.count` 枚だけ手札に加える。 |
| `ACTIVATE_TRAP` | 5 | 5 | SP26-001, WX15-017, WX15-035 | トラップを表向きにしてTRAP_ICON効果を発動 |
| `ADD_CARD_TO_LRIG_DECK_HIDDEN` | 5 | 5 | WX25-P2-017, WX25-P2-021, WXDi-P11-013 | lastProcessedCards をルリグデッキに加える |
| `ARTS_IMMOVABLE` | 5 | 5 | WX25-P1-TK1, WX25-P1-TK2, WX25-P1-TK3 | アーツ条件系（engine: アーツ使用条件未実装） |
| `BLOCK_OPP_ZONE_PLACEMENT` | 5 | 5 | WX08-032, WX10-051, WXEX1-24 | 対戦相手のシグニゾーンへの新規配置を禁止する。禁止するゾーンの供給源は |
| `CONDITIONAL_CARD_COST_BY_OPP_LRIG` | 5 | 5 | WX03-002, WX03-003, WX03-004 | 対戦相手のセンタールリグ色による基本コスト軽減（実コスト軽減は支払い時に computeArtsEffectiveCost が適用済み。ここでは結果ログのみ） |
| `DECK_TOP_CHECK_LEVEL_HAND` | 5 | 5 | WX20-Re05, WX20-Re06, WXEX1-58 | デッキトップを公開してレベル一致なら手札に加える |
| `GAIN_EXTRA_TURN` | 5 | 5 | SP26-006, SP38-006, WX05-001 | 追加ターンフラグをセット（BattleScreen側でターン終了時に追加ターンを付与） |
| `REMOVE_SIGNI_ZONE` | 5 | 5 | WX25-P3-015, WXDi-P00-015, WXDi-P09-003 | 対戦相手のシグニゾーンを1つ削除 |
| `SEED_BLOOM` | 5 | 4 | WDK07-Y01, WDK07-Y07, WXK04-001 | シード1枚（または好きな枚数）を開花する |
| `DECK_TOP_DECLARED_NUM_TRASH` | 4 | 4 | WX06-014, WXDi-P06-013, WXK03-076 | 宣言した数だけデッキ上からトラッシュへ |
| `GUARD_ALTERNATIVE_COST` | 4 | 4 | WX24-P2-026, WX25-P1-071, WX25-P2-007 | ガード系（engine: ガードコスト処理未実装） |
| `MAKE_SERVANT_ZERO` | 4 | 2 | WX17-005, WXDi-P11-031 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `PICK_FROM_TRASHED_CARDS` | 4 | 4 | WXEX2-49, WX24-P4-034, WX26-CP1-057 | 「この方法でトラッシュに置いたカードの中から」N枚（まで）選び、行き先へ送る。 |
| `PLACE_TRAP_FROM_REVEALED` | 4 | 4 | WX16-061, WX17-029, WXEX1-13 | 前のLOOK_AND_REORDERで公開されたデッキ上N枚からトラップ設置 |
| `POWER_MOD_PER_REVEALED_LEVEL` | 4 | 4 | WDK13-012, SPK01-09, WXK07-091 | 公開したシグニのレベルに基づくパワー修正（lastProcessedCards使用） |
| `ADD_CRAFT_TO_LRIG_DECK` | 3 | 3 | WXDi-P16-009, WXDi-P16-010, WXDi-P16-011 | クラフトをルリグデッキへ |
| `CONDITIONAL_COST_REDUCTION_BY_FIELD` | 3 | 3 | WX10-031, WX12-049, WX15-034 | フィールド条件（クラス/枚数）でコスト軽減チェック |
| `DECK_TOP_CHECK_LEVEL_ENERGY` | 3 | 2 | WXK04-062, WXK10-031 | デッキ上を公開し、宣言したレベルのシグニならエナゾーンへ |
| `DRAW_DISCARD_COUNT_PLUS_N` | 3 | 3 | PR-427, WXEX2-39, WXDi-P00-018 | 捨てた枚数+Nドロー |
| `FLIP_FACE_DOWN_SIGNI` | 3 | 3 | WXDi-P01-040, WXDi-P05-037, WXDi-P09-034 | この方法で裏向きにした対象だけをターン終了時の表向き復帰へ予約 |
| `PLAY_SPELL_FREE_IGNORE_RESTRICTION` | 3 | 2 | WX14-014, WXEX2-14 | 手札のスペルをコストなし・限定条件無視で使用 |
| `POWER_MOD_BY_LRIG_TRASH_ARTS` | 3 | 3 | WX24-P1-049, WX24-P4-044, WX25-P2-062 | ルリグトラッシュのアーツ枚数に基づくパワー修正（対象1体を先にSELECT_TARGETで選ぶ） |
| `PREVENT_DAMAGE_FROM_OPP_EFFECTS` | 3 | 3 | SPDi44-04, WX25-P1-026, WXK03-011 | ルリグダメージ無効フラグ |
| `PREVENT_LRIG_DAMAGE` | 3 | 3 | WX24-P3-003, WXK01-002, WXK03-001 | 「あなたはルリグによってダメージを受けない」の**宣言型**（§6.4 O-3 続き492）。 ⚠🔴これは【常】＝場にあるかぎり有効なので、**state に1回きりのフラグを書いてはいけない**   （書くと1回防いだ時点で消え、以後… |
| `SELF_TRASH_IF_NO_OPP_CHARM` | 3 | 3 | WX13-086, WX13-089, WX13-093 | 相手の場に【チャーム】がなければ自トラッシュ（WX13-086等） |
| `SET_OPP_SIGNI_AS_TRAP` | 3 | 2 | WX21-003, WX21-025 | 相手のシグニ1体をトラップとして設置 |
| `SIGNI_FLIP_FACEDOWN` | 3 | 3 | WXDi-P01-040, WXDi-P05-037, WXDi-P09-009 | 自シグニ（または相手lastProcessed）を裏向きにする |
| `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` | 3 | 3 | WXDi-P01-002, WXDi-P10-025, WXDi-P14-008 | 引用常在能力を自シグニに付与（SELECT_TARGET→keyword_grants） |
| `BANISH` | 2 | 2 | WXDi-CP01-015, WXK06-025 | lastProcessedCards[0] か sourceCardNum をバニッシュ |
| `COPY_TARGET_POWER` | 2 | 2 | WXDi-P02-079, WXDi-P09-051 | 対象シグニのパワーを自シグニの基本パワーにする |
| `ENERGY_TO_TRASH` | 2 | 2 | WXDi-P06-069, WXDi-P11-002 | エナゾーンからカード1枚選んでトラッシュ（SELECT→INTERNAL） |
| `EXTRA_GUARD_COST_FROM_HAND` | 2 | 2 | WDK04-001, WX19-001 | ガード系（engine: ガードコスト処理未実装） |
| `FACE_DOWN_OPP_SIGNI` | 2 | 2 | WXDi-P07-010, WXDi-P09-034 | 相手シグニを対象選択→裏向きにする |
| `FIELD_ENERGY_SIGNI_GAIN_COLOR` | 2 | 2 | WXDi-P06-040, WXDi-P12-010 | CONTINUOUS効果はeffectEngineで処理済み（no-op） |
| `FREE_GROW_NEXT_TURN` | 2 | 2 | WX03-024, WX03-027 | 次の自分ターンのグロウコストを0にする予約（WX03-024-BURST） |
| `GRANT_CHOSEN_ABILITY` | 2 | 2 | WXK04-002, WXK10-018 | 選んだキーワード/保護能力付与（シグニ対象・SELECT_TARGET→CHOOSEインタラクション） ※ SIGNI_GRANT_CHOSEN_ABILITY（WXK09-050＝表記パワー比較＋DOWN/BOUNCE 保護）は exe… |
| `GROW_COST_ZERO` | 2 | 2 | WX21-017, WX21-018 | グロウコスト変更（engine: グロウコスト処理未実装） |
| `INTERNAL_ASK_TRAP_ZONE` | 2 | 2 | WD23-008-A, WD23-033-A | INTERNAL_ASK_TRAP_ZONE / INTERNAL_PICK_TO_TRAP（LOOK_PICK_CHAIN の then:'trap'・タスク12(xlvi)(g)）。 ⚠既存の INTERNAL_SET_TRAP は … |
| `INTERNAL_SEED_FROM_DECK_TOP_PLACE` | 2 | 2 | WXK04-060, WXK10-059 | デッキ上1枚をシードとして設置 |
| `LAYER_ABILITY_COPY` | 2 | 2 | WX20-023, WXEX2-59 | ＜怪異＞シグニのレイヤー能力を自シグニにコピー |
| `LOCK_OPP_TRASH_MOVE` | 2 | 2 | WX24-P4-007, WXDi-P14-005 | LOCK_OPP_TRASH_MOVE（タスク12(lxxiii)）: 「**次の**対戦相手のメインフェイズとアタックフェイズの間、 対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない」（`WX24-P4-00… |
| `LOOK_OPP_HAND_DISCARD_SIGNI` | 2 | 2 | WX08-067, WX16-066 | 相手の手札のシグニを見て捨てさせる（宣言数字フィルタ or 有色フィルタ） |
| `OPP_SIGNI_ATTACK_POWER_RESTRICT` | 2 | 2 | WXDi-P05-031, WXDi-CP01-017 | 相手シグニアタック時パワー制限 |
| `OPP_SIGNI_LEAVE_TO_TRASH` | 2 | 2 | WX24-P4-002, WXDi-P04-037 | 相手シグニが退場時にエナではなくトラッシュへ（フラグ設定） |
| `PLACE_SIGNI_UNDER_SELF_OPT` | 2 | 2 | WXDi-P05-034, WXDi-P11-081 | 手札からカードをこのシグニの下に置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT） |
| `PLACE_SIGNI_UNDER_SIGNI` | 2 | 2 | WXDi-P05-060, WXDi-P09-078 | シグニをシグニ下に設置（lastProcessed→sourceCardNumのゾーン下） |
| `PLAY_SPELL_FROM_HAND` | 2 | 2 | WX11-043, WX12-003 |  |
| `POWER_DOUBLE_ALL` | 2 | 2 | WX04-049, WX07-029 | 全自シグニのパワーを2倍にする（現在値と同量をデルタ追加） |
| `POWER_MOD_BY_ATTACKER_LEVEL` | 2 | 1 | WXK10-084 | アタックしたシグニのレベルに基づくパワー修正 |
| `POWER_MOD_BY_TRASH_CLASS_COUNT` | 2 | 2 | WX26-CP1-057, WXDi-CP02-060 | トラッシュの特定クラスカード枚数に基づくパワー修正 |
| `POWER_MOD_MIRROR` | 2 | 2 | WXEX1-23, WXK06-049 | 捨てたシグニのパワーを±として対象に適用 |
| `PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN` | 2 | 2 | WXDi-P07-002, WXDi-P09-008 | 相手の次ターン最初のダメージを無効 |
| `PREVENT_OWN_ARTS_USE` | 2 | 2 | WD15-006, WX13-026 | 自分のアーツ使用封じ |
| `PREVENT_POWER_MINUS_BY_OPP` | 2 | 2 | WXDi-P07-085, WXK03-026 |  |
| `PREVENT_SIGNI_ABILITY_LOSS_BY_OPP` | 2 | 2 | WX25-P2-053, WXK10-024 |  |
| `PREVENT_ZONE_MOVE_BY_OPP` | 2 | 1 | WX19-047 | **【常】の宣言型**（§6.4 O-3 続き493）。 |
| `RIDE_ON` | 2 | 1 | WXK03-022 | ルリグが乗機シグニ1体に任意でライド（ドライブ状態でない場合のみ可） |
| `SIGNI_CANT_BOUNCE_FROM_FIELD` | 2 | 2 | WX13-029, WXK05-024 |  |
| `SIGNI_SERVANT_ZERO` | 2 | 2 | WX19-002, WXDi-P07-041 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `SPECIFIC_CARD_COST_REDUCE` | 2 | 2 | WXDi-CP01-027, WXDi-CP01-048 |  |
| `TRASH_IF_ZONE_OCCUPIED` | 2 | 2 | WXDi-P05-037, WXDi-P09-034 | この方法で裏向きにしたカードの元ゾーンがターン終了時に埋まっていればトラッシュ |
| `ACCE_BANISH_SELF_TRASH` | 1 | 1 | WXK04-031 | アクセを自分のトラッシュへ |
| `ACCE_COST_REDUCTION` | 1 | 1 | WX16-044 | アーツ条件系（engine: アーツ使用条件未実装） |
| `ACCE_TO_ENERGY` | 1 | 1 | WD18-009 | アクセカードをエナゾーンへ |
| `ADD_CARD_TO_LRIG_DECK` | 1 | 1 | WXDi-P09-007 | lastProcessedCards をルリグデッキに加える |
| `ALL_OPP_SIGNI_POWER_DOWN_HALF` | 1 | 1 | WDK15-011 | 自シグニのパワーの半分だけ全相手シグニをパワーマイナス |
| `ALL_OPP_SIGNI_SERVANT_ZERO` | 1 | 1 | WXK04-005 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `ARTS_COST_REDUCTION_BY_COST_THRESHOLD` | 1 | 1 | WDK03-014 |  |
| `ARTS_EXTRA_COST_CONDITION` | 1 | 1 | WX26-CP1-024 | 追加コスト支払い済みなら選択肢を増やす |
| `BANISH_MULTI_COLOR_SIGNI` | 1 | 1 | WXK05-030 | 複数色（2色以上）の相手シグニをバニッシュ |
| `BLOCK_OPP_ENCORE_AND_BET` | 1 | 1 | WXK08-025 | 相手のアンコール/ベット封じ |
| `BOTH_DISCARD_BY_CENTER_LEVEL` | 1 | 1 | WX16-016 | 両者センタールリグのレベル分捨て |
| `CHARM_POWER_MINUS_MULTIPLIER` | 1 | 1 | WX25-P2-103 | CHARM_POWER_MINUS_MULTIPLIER（§6.4 O-10・続き507）＝`WX25-P2-103-E1` の選択肢② 「それに【チャーム】が付いている場合、このターン、あなたの効果によってそれのパワーが－される場合、 … |
| `CHOSEN_TO_ENERGY_OR_HAND` | 1 | 1 | WX22-050 | 選んだカードをエナか手札か選択して追加 |
| `CONDITIONAL_FREE_GROW` | 1 | 1 | WX19-007 | グロウコスト変更（engine: グロウコスト処理未実装） |
| `CONDITIONAL_SEARCH_IF_FIELD` | 1 | 1 | WX09-041 | フィールドにシグニがある場合サーチ |
| `CONDITIONAL_SEARCH_IF_RESONA` | 1 | 1 | WD09-018 | フィールドにレゾナがある場合サーチ |
| `CONDITIONAL_TRASH_TO_ENERGY` | 1 | 1 | WX14-029 | 条件付きトラッシュ→エナ（センタールリグ名条件付き） |
| `COPY_ABILITY` | 1 | 1 | WXDi-P04-035 | このシグニはその能力を得る |
| `DECLARE_COLOR_COND_ENERGY_TRASH` | 1 | 1 | SPDi43-22 | 色を宣言し、エナから宣言色のカードを任意でトラッシュ |
| `DISCARD_BY_POWER_MATCH` | 1 | 1 | WXK10-026 | 手札の青シグニを捨て→相手手札の同パワーシグニを捨てさせる |
| `DRAW` | 1 | 1 | WXDi-P10-006 | N枚ドロー |
| `DRAW_BY_CHARM_COUNT` | 1 | 1 | WX18-038 | チャーム数だけドロー |
| `ENERGY_BY_LEVEL_SUM_LIMIT` | 1 | 1 | WXK11-040 | エナのカードが指定レベル合計を超えたらトラッシュ |
| `FACEDOWN_RELEASE_BY_OPP_PAYMENT` | 1 | 1 | WXDi-P07-010 | ═══ §6.4 O-9(b)＝**繰り返す**遅延ゲート（`WXDi-P07-010-E2`）═══ 「各アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、   対戦相手は《無》《無》を支払うか手札を２枚捨ててもよい。そ… |
| `FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM` | 1 | 1 | WXDi-P13-071 | 凍結シグニのバニッシュをデッキ下へ |
| `FROZEN_SIGNI_TO_TRASH_ON_LEAVE` | 1 | 1 | WXEX1-30 | 凍結状態のシグニが退場するとトラッシュへ |
| `GAIN_COIN_AND_DISCARD` | 1 | 1 | WD23-004-E | コイン獲得+手札から捨て（先頭N枚を自動捨て） |
| `GRANT_ABILITY_UNTIL_OPP_TURN` | 1 | 1 | WXDi-P07-059 | 次の対戦相手のターン終了時まで①の能力を付与 |
| `GRANT_CHOSEN_ABILITY_FROM_PLAY` | 1 | 1 | WX22-Re04 | 【出】で選んだ能力（keyword_grants記録済み）を常在で参照 |
| `GRANT_CHOSEN_ABILITY_SELF` | 1 | 1 | WXK08-026 | 選んだキーワード/保護能力付与（シグニ対象・SELECT_TARGET→CHOOSEインタラクション） ※ SIGNI_GRANT_CHOSEN_ABILITY（WXK09-050＝表記パワー比較＋DOWN/BOUNCE 保護）は exe… |
| `GRANT_LRIG_TRASH_ACTIVATE_ABILITY` | 1 | 1 | WXEX2-12 | 能力付与系（CONTINUOUS効果はeffectEngineで処理、AUTO/ACTIVATEDでも来た場合のフォールバック） GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRAS… |
| `GRANT_SIGNI_CLASS` | 1 | 1 | WX21-Re03 | このシグニに＜X＞クラスを付与 |
| `GRANT_UNDER_LRIG_ACTIVATE_ABILITY` | 1 | 1 | WX12-001 |  |
| `GRANT_UNDER_LRIG_AUTO_ABILITY` | 1 | 1 | WX21-003 |  |
| `GRANT_UNDER_SIGNI_ALL_ABILITIES` | 1 | 1 | WX21-024 |  |
| `GRANT_UNDER_SIGNI_AUTO_ABILITY_ATTACK_PHASE` | 1 | 1 | WXK08-048 |  |
| `GRANT_UNDER_SIGNI_CONSTANT_ABILITY` | 1 | 1 | WX19-027 |  |
| `GROW_COST_SUBSTITUTE_TRASH_SIGNI` | 1 | 1 | SP07-001 |  |
| `HAND_CARDS_UNDER_SIGNI` | 1 | 1 | SPK01-02 | 手札からカードをこのシグニの下に置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT） |
| `HAND_SIGNI_HAS_GUARD_ICON` | 1 | 1 | WD13-014 | ガードアイコン付与（手札のシグニに付与: フラグ設定） |
| `HAND_SIGNI_UNDER_SIGNI` | 1 | 1 | WXDi-P15-067 | 手札のシグニをこのシグニの下に置く |
| `INFECTED_SIGNI_POWER_DOWN_BY_LEVEL` | 1 | 1 | WXEX2-26 | 相手フィールドのウイルスシグニのレベル合計に基づくパワー修正 |
| `LEAVE_FIELD_TO_DECK_BOTTOM` | 1 | 1 | WXDi-P08-046 | §6.4 O-24：`OPP_TRASH_FIELD_SIGNI_AND_ENERGY` は**削除した**（相手の場のシグニ全部＋エナ全部を流す 過剰実行だった）。原文どおり「シグニ1体＋エナ1枚を**対戦相手が**選ぶ」は parse… |
| `LEVEL_MOD_PER_COUNT` | 1 | 1 | WX10-036 | レベル修正（engine: ベースレベル変更システム未実装） |
| `LIFE_TO_HAND_OPTIONAL` | 1 | 1 | WXDi-P11-040 | ライフクロス1枚を手札に加える |
| `LOOK_PLACE_FACEDOWN_DELAYED` | 1 | 1 | WXDi-P10-034 | デッキ上 count 枚を見て、1枚を裏向きでシグニゾーンに置き（PLACE_FACEDOWN_SIGNI）、 |
| `LOOK_TOP_ONE_RETURN_REST_BOTTOM` | 1 | 1 | WXDi-CP01-036 | デッキ上N枚を確認し1枚をトップ・残りをデッキ下に |
| `LOOK_TOP_SIGNI_TO_FIELD` | 1 | 1 | WXDi-P08-046 | デッキ上のシグニをフィールドへ（最初のシグニを配置） |
| `LRIG_LIMIT_MODIFY` | 1 | 1 | WXDi-P16-047 | ルリグリミット修正 |
| `LRIG_LIMIT_UP_AND_COLOR_GAIN` | 1 | 1 | WX22-014 | ルリグリミット増加（+1）と色獲得（log） |
| `LRIG_TRASH_KEY_TO_CENTER_UNDER` | 1 | 1 | WXK09-005 | ルリグトラッシュのキーをセンタールリグの下に |
| `MAKE_MULTI_SERVANT_ZERO` | 1 | 1 | WXDi-P09-005 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `MILL_EACH_REPEAT_ON_NAME` | 1 | 1 | WX12-037 | 🆕§6.4 O-22(b) MILL_EACH_REPEAT_ON_NAME（`WX12-037-E2`）＝「各プレイヤーは自分のデッキの上から カードをN枚トラッシュに置く。この方法でトラッシュに置いたカードの中にカード名に《X》を含… |
| `MULTI_SIGNI_POWER_UP_5000` | 1 | 1 | WXK07-039 | 複数の自シグニにパワー+5000（SELECT_TARGET→INTERNAL_POWER_UP_SELECTED） |
| `NO_ABILITY_SIGNI_TO_DECK_BOTTOM` | 1 | 1 | WXEX2-30 | NO_ABILITY_SIGNI_TO_DECK_BOTTOM（`WXEX2-30`）＝【常】「アタックフェイズの間、能力を持たない対戦相手の シグニが場を離れる場合、代わりにデッキの一番下に置かれる」＝**宣言だけ**。 実体は場離れ置… |
| `OPP_ENERGY_COLOR_CONDITION_TRASH` | 1 | 1 | WXK09-037 | 相手エナのカード1枚を色条件でトラッシュ（相手が選択→スキップ） |
| `OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND` | 1 | 1 | WXK10-025 | 相手より手札が少ない場合、相手の手札をデッキ下へ |
| `OPP_LRIG_DECK_BLIND_REVEAL` | 1 | 1 | PR-469 | 「対戦相手のルリグデッキからカードを１枚**見ないで選び**公開する。   それがルリグでない場合、それをルリグトラッシュに置く。」（`PR-469`③・§6.4 O-11） ⚠既存の `OPP_LRIG_DECK_TO_LRIG_TRA… |
| `OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL` | 1 | 1 | WXK10-056 | トラッシュに置かれたシグニのレベルに基づくパワー修正（1体対象 or 全体） |
| `OPP_SIGNI_TO_DECK_BY_GATE` | 1 | 1 | WDK09-001 | 相手シグニをゲートを通じてデッキへ（バウンス） |
| `OPP_SIGNI_TO_DECK_NTH` | 1 | 1 | WDK09-012 | 相手シグニをデッキのN番目に挿入 |
| `OPP_TRASH_TO_OPP_SIGNI_UNDER` | 1 | 1 | WXK11-069 | 相手トラッシュ最上段を相手シグニ下にカードを置く |
| `PLACE_LRIG_FROM_DECK_ON_TOP` | 1 | 1 | WXEX1-20 | ルリグデッキからルリグをフィールドへ |
| `PLACE_VIRUS_CENTER` | 1 | 1 | WXEX2-79 | 相手の中央のシグニゾーンにウィルスを設置 |
| `PLAY_EFFECT_TARGET_CLASS_CHANGE` | 1 | 1 | WX14-032 |  |
| `PLAY_SPELL_FROM_HAND_FREE` | 1 | 1 | WX20-059 |  |
| `POWER_BOOST_PER_SIGNI_WITH_ICON` | 1 | 1 | WX17-053 | キーワード持ちシグニ1体につきパワー修正 |
| `POWER_BY_ACCE_COUNT` | 1 | 1 | WX21-062 | アクセ数×deltaをパワー修正 |
| `POWER_BY_CENTER_LRIG_TYPE_COUNT` | 1 | 1 | PR-472 | センタールリグのタイプ数×deltaをパワー修正 |
| `POWER_BY_CHARM_COUNT` | 1 | 1 | WXK11-041 | 自場チャーム数に基づくパワー修正 |
| `POWER_BY_ENERGY_COLOR_VARIETY` | 1 | 1 | WXK11-063 | エナゾーンの色の種類数に基づくパワー修正 |
| `POWER_BY_LEVEL_SUM_COMPARE` | 1 | 1 | WXK10-089 | 自・相手のシグニレベル合計比較（自≦相手の場合）× levelSum → 1体相手シグニパワー修正 |
| `POWER_BY_RISE_SIGNI_COUNT` | 1 | 1 | WXK10-064 | 自場ライズシグニ数に基づくパワー修正（スタック2枚以上のシグニ） |
| `POWER_CAP` | 1 | 1 | WX22-022 | シグニのパワーをN以下に制限 |
| `POWER_COPY_FROM_DOWNED` | 1 | 1 | WXDi-P16-052 | ダウンしたシグニのパワーを自シグニに加算 |
| `POWER_DOWN_BY_ZONE_CARD_COUNT` | 1 | 1 | WXK08-032 | シグニゾーンのカード総数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰） |
| `POWER_EQUAL_TO_SELF_POWER` | 1 | 1 | WXK02-038 | 自シグニのパワーに等しく相手シグニのパワーを設定 |
| `POWER_EQUALS_FRONT_SIGNI` | 1 | 1 | PR-K021 | 前のシグニのパワーと等しく設定（自シグニを前シグニのパワーに） |
| `POWER_MOD_BY_COLOR_VARIETY` | 1 | 1 | WXDi-D06-016 | 自場シグニの色の種類数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰） |
| `POWER_MOD_BY_FIELD_CLASS_LEVEL` | 1 | 1 | WD11-007 | 自場の特定クラスシグニのレベル合計に基づくパワー修正 |
| `POWER_MOD_BY_FRONT_LEVEL` | 1 | 1 | WXDi-P04-083 | 相手同ゾーン（前）シグニのレベルに基づくパワー修正 |
| `POWER_MOD_BY_LRIG_LEVEL` | 1 | 1 | WXK09-035 | ルリグレベルに基づくパワー修正（相手センタールリグのレベルを参照） |
| `POWER_MOD_BY_LRIG_LEVEL_SUM` | 1 | 1 | WXDi-P05-055 | ルリグレベル合計に基づくパワー修正（自分のルリグ全体のレベル合計を参照） |
| `POWER_MOD_BY_TRASHED_SIGNI_LEVEL` | 1 | 1 | WXDi-P10-009 | トラッシュしたシグニのレベル×-2000 → 1体相手シグニパワー修正（SELECT→INTERNAL） |
| `POWER_MOD_BY_UNDER_COUNT` | 1 | 1 | WXDi-P09-046 | シグニ下のカード枚数×delta → 2体まで相手シグニパワー修正（SELECT→INTERNAL） |
| `POWER_MOD_DISTRIBUTE` | 1 | 1 | WX17-021 | 合計パワーを選択シグニに均等配分（自場シグニ最大3体） |
| `POWER_MOD_DOUBLE_DIFF` | 1 | 1 | WX24-P4-054 | 対象シグニの基本パワーと自分の基本パワーとの差の2倍でマイナス |
| `POWER_MOD_TARGET_AND_SELF` | 1 | 1 | WXDi-P02-039 | 対象シグニと自シグニの両方にパワー修正（自場シグニを対象とする） |
| `POWER_UP_BY_DISCARDED_SIGNI_POWER` | 1 | 1 | WDK08-Y01 | 捨てたシグニのパワーだけ自場シグニ1体をパワーアップ（SELECT自場→自己再帰） |
| `PREVENT_ABILITY_CHANGE_BY_OPP` | 1 | 1 | WXEX2-49 |  |
| `PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP` | 1 | 1 | WXK06-024 | 全シグニの相手パワーマイナス防止（effectEngineで動的処理） |
| `PREVENT_BOUNCE_AND_DOWN_BY_OPP` | 1 | 1 | WXK08-024 |  |
| `PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP` | 1 | 1 | WX19-046 | ルリグダメージ無効フラグ |
| `PREVENT_INFECTED_SIGNI_ACTIVATE` | 1 | 1 | WXEX1-51 |  |
| `PREVENT_LOW_LEVEL_LRIG_DAMAGE` | 1 | 1 | WXK11-012 | 「あなたは対戦相手のレベルN以下のルリグによってダメージを受けない」の**宣言型**（§6.4 O-3 続き492）。 ⚠上の `PREVENT_LRIG_DAMAGE` と同じ理由でフラグを書かない＝**レベル限定を state では表… |
| `PREVENT_NON_FIELD_MOVE_BY_OPP` | 1 | 1 | WXEX2-22 | **【常】の宣言型**（§6.4 O-3 続き493）。 |
| `PREVENT_OPP_POWER_PLUS` | 1 | 1 | WXDi-P14-048 |  |
| `PREVENT_OPP_SIGNI_ABILITY_GAIN` | 1 | 1 | WX14-023 |  |
| `PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH` | 1 | 1 | WXK11-026 |  |
| `PREVENT_SIGNI_DOWN_BY_OPP` | 1 | 1 | WX13-029 |  |
| `PREVENT_SIGNI_DOWN_BY_OPP_ALL` | 1 | 1 | WX20-025 | PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止 |
| `PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH` | 1 | 1 | WXK07-031 | 保護・移動防止系（engine: 各防止フラグシステム未実装） |
| `REDUCE_PLAY_ABILITY_COST` | 1 | 1 | WXK04-075 | 次の【出】能力コストを軽減 |
| `REMOVE_OPP_MULTI_ENA` | 1 | 1 | WX19-002 | 相手の複数色エナをトラッシュへ |
| `REMOVE_OPP_MULTI_ENA_ONLY` | 1 | 1 | WXK03-002 | 相手の複数色エナをトラッシュへ |
| `RETURN_TRAP_TO_HAND_ONE` | 1 | 1 | WX17-041 | signi_trapsのカードを手札へ（全枚または選択） |
| `REVEALED_CARD_COLOR_DISCARD` | 1 | 1 | WX24-P4-105 | 公開カードの色と同じ色の手札カードを捨てる |
| `RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY` | 1 | 1 | WX20-056 | ライズ対象シグニに引用常在能力を付与 |
| `SEED_BLOOM_OPTIONAL` | 1 | 1 | WXK10-059 | 任意でシード1枚を開花する |
| `SEED_FLOWER_OP` | 1 | 1 | WXK05-050 | 別シード1枚を開花してデッキ上をシード設置（ヤマレンゲ系） |
| `SEED_HAND_AND_BLOOM_FROM_DECK_TOP` | 1 | 1 | WDK07-Y20 | シード1枚を手札に加え、デッキ上をシード設置 |
| `SELF_TRASH_IF_NO_OPP_VIRUS` | 1 | 1 | WX20-030 | 相手にウィルスがなければ自トラッシュ |
| `SET_HAND_CARD_AS_TRAP` | 1 | 1 | WX21-057 |  |
| `SET_LEVEL_RANGE` | 1 | 1 | WX19-065 | 自シグニ1体を選んでレベル1～4に変更（ターン終了時まで） |
| `SET_OPP_SIGNI_POWER_BY_SELF_POWER` | 1 | 1 | WXK11-043 | 自パワーに合わせて相手シグニのパワーを設定 |
| `SHUFFLE_DECK_POWER_HALF` | 1 | 1 | WXK10-051 | シャッフル後に全シグニのパワーを半減 |
| `SIGNI_PROTECT_MOVE_EXCEPT_ENERGY` | 1 | 1 | WXDi-P03-043 |  |
| `SKIP_NEXT_TURN` | 1 | 1 | WD20-006 | 次の自分のターンを丸ごと飛ばす（`WD20-006-E1`・§6.4 O-3 続き491）。 |
| `SUPPRESS_GAIN_ABILITY` | 1 | 1 | WX13-029 |  |
| `SUPPRESS_LIFEBURST_COLOR_CONDITION` | 1 | 1 | WX25-P3-003 | 色条件によるライフバースト抑制（相手に suppress_life_burst フラグ） |
| `TRADE_SELF_AND_OPP_TO_ENERGY` | 1 | 1 | WXDi-P14-064 | 自・相手を両方エナへ（ゾーン交換系） |
| `TRAP_TO_SIGNI_IF_ZONE_EMPTY` | 1 | 1 | WXEX1-67 | このカードのゾーンにシグニがない場合、signi_traps[zone]→signi[zone] |
| `TRASH` | 1 | 1 | WDK07-E09 | lastProcessedCards[0] か sourceCardNum をトラッシュへ |
| `TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY` | 1 | 1 | WXEX2-10 | フィールドの全シグニの名前が一致するカードをエナ・フィールドからトラッシュ |
| `TRASH_ALL_OPP_CARDS` | 1 | 1 | WXK11-047 | 相手エナから名前一致カードをすべてトラッシュへ |
| `TRASH_CLASS_TO_HAND_OR_ENERGY` | 1 | 1 | WX26-CP1-022 | トラッシュからクラスシグニを手札かエナへ選択 |
| `TRASH_FROM_DECK_PER_SIGNI_LEVEL` | 1 | 1 | WXK02-004 | 自場シグニのレベル合計枚数をデッキ上からトラッシュ |
| `TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH` | 1 | 1 | WXEX1-19 | トラッシュから3枚選んでエナ/手札/デッキ下に分配 |
| `UNDER_SIGNI_TO_ENERGY` | 1 | 1 | WXDi-P07-080 | シグニの下のカードをエナゾーンに置く |
| `UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS` | 1 | 1 | WX25-P1-089 | ソースシグニの下のカードを対象とし、エナに同クラスがなければエナへ |
| `USE_SPELL_FROM_TRASH` | 1 | 1 | WXDi-P06-066 |  |
| `USE_SPELL_FROM_TRASH_PAYING_COST` | 1 | 1 | WXDi-P13-008 | ── USE_SPELL_FROM_TRASH_PAYING_COST（§6.4 O-35・続き530）── 「あなたのトラッシュから〈修飾〉スペル1枚を対象とし、それを**使用**してもよい」（`WXDi-P13-008-E1`）。 �… |

### execStubPart3.ts（239 種）

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `TRASH_AT_TURN_END` | 16 | 15 | WD17-008, WX02-005, WX03-047 | ターン終了時にlastProcessedCardsのシグニをフィールドからトラッシュに置く（WX02-005 ホワイト・ホープ） |
| `PLACE_LIMIT_UPPER` | 12 | 12 | WX24-P1-031, WX24-P1-032, WX24-P2-041 | 【リミットアッパー】トークンをルリグゾーンに置く（1つまで） |
| `SUMMON_RESONA_FROM_LRIG_DECK` | 11 | 11 | WD12-007, WD23-001-E, WX07-050 | ═══ SUMMON_RESONA_FROM_LRIG_DECK（§6.4 O-5）═══ 「あなたのルリグデッキから〈絞り込み〉のレゾナを〈枚数〉出現条件を無視して場に出す」。  🔴**旧実装はカード全文 regex でクラスだけを読… |
| `DEPLOY_RESTRICT` | 10 | 10 | WX07-006, WX12-008, WXDi-P05-024 | 配置制限（CONTINUOUSは動的処理、AUTOはフラグ設置） |
| `GAIN_LRIG_BARRIER` | 10 | 10 | SPDi43-26, WX24-P1-001, WX24-P3-026 | 【ルリグバリア】を得る（フリーゾーンにトークンとして設置。ルリグアタック1回を無効） |
| `GUARD_EXTRA_COST_BY_OPP` | 9 | 9 | WX24-P2-047, WX24-D1-05, WXDi-P01-035 |  |
| `LEVEL_REFERENCE_OVERRIDE` | 8 | 8 | WD21-012, WX17-059, WX17-061 |  |
| `LOSE_COLOR_ALL_ZONES` | 8 | 8 | WXDi-P16-086, WXDi-P16-087, WXDi-P16-088 | CONTINUOUS効果（effectEngine.collectColorlessOverridesで動的計算） |
| `ACCE_FROM_HAND` | 6 | 6 | WX16-074, WXDi-P09-007, WXK04-003 | 手札のアクセカードを自分のシグニに付ける |
| `COLLAB` | 6 | 5 | WXDi-CP01-004, WXDi-CP01-005, WXDi-CP01-006 | コラボ効果 |
| `PLACE_MAGIC_BOX` | 6 | 6 | WX24-P3-018, WX24-P3-067, WX24-P3-070 | lastProcessedCards[0]のカードをMBとして設置（ゾーン選択→INTERNAL_SET_MAGIC_BOX） |
| `RETURN_SELF_ARTS_TO_LRIG_DECK` | 6 | 6 | WDK17-008, SP07-009, WXDi-P06-023 | 使用後の自身をルリグデッキに戻す。 |
| `BANISH_SUBSTITUTE` | 5 | 5 | WX12-024, WX20-055, WXEX2-60 | バニッシュ時の任意身代わり置換（CONTINUOUS宣言・BattleScreen側で対話処理） |
| `BANISH_TO_LRIG_TRASH_INSTEAD` | 5 | 5 | WX10-008, WX10-020, WX10-024 |  |
| `GAIN_SIGNI_BARRIER` | 5 | 5 | SPDi43-23, WX26-CP1-001, WXDi-P12-001 | 【シグニバリア】を得る（フリーゾーンにトークンとして設置。相手シグニからのダメージ1回を無効） |
| `OPEN_MAGIC_BOX` | 5 | 5 | WX24-P3-050, WX24-P3-066, WX24-P3-069 | このシグニと同ゾーンのMBを表向きにしてトラッシュへ（任意） |
| `SET_CANCEL_ATTACK_FLAG` | 5 | 5 | SPDi43-06, WX24-P3-050, WX24-P3-069 | アタックキャンセルフラグをセット（NEGATE_ATTACK_ON_TRIGGERのYes時。攻撃側=効果オーナー自身のアタックを無効化） |
| `CENTER_LRIG_RIDES_ON_SIGNI` | 4 | 4 | WDK01-008, SPK01-01, WXK01-008 | センタールリグが選択した1体の乗機シグニに乗る（乗り換え可） |
| `CHOOSE_HAND_OR_ENERGY` | 4 | 4 | WX24-P1-025, WX24-P2-042, WXDi-CP01-004 | デッキ上N枚から任意枚数を手札に加え、残りをエナへ（LOOK_AND_REORDER後） |
| `CLASS_CHANGE` | 4 | 4 | WX21-049, WXEX2-06, WX25-P1-058 | シグニのクラスを一時変更 |
| `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` | 4 | 4 | WX09-Re03, WX12-005, WX17-004 | センタールリグによる複数選択 |
| `DECLARE_NUMBER_RANGE` | 4 | 4 | WX25-CP1-007, WXDi-P06-013, WXK03-076 | 0〜5の数字宣言（DECLARE_NUMBERと同様だが0を含む） |
| `EXILE_SELF_AFTER_USE` | 4 | 3 | PR-378, SP36-001, WXK11-070 | 使用後の既定配置を excluded に置換する。 |
| `MULTI_ACCE_LIMIT` | 4 | 4 | WX16-031, WX20-028, WXK04-053 | アクセを特定枚数に制限（ログのみ） |
| `PREVENT_ABILITY_GAIN_BY_OPP` | 4 | 4 | WX24-P1-043, WX25-CP1-044, WXDi-P06-057 |  |
| `ATTACK_PHASE_LEVEL_OVERRIDE` | 3 | 3 | WX20-044-CB, WX21-029, WXEX2-47 | ダメージ特殊（engine: ダメージ処理拡張必要） |
| `CHOOSE_HAND_CARD` | 3 | 3 | PR-K060, WX05-006, WX16-Re17 | 手札から1枚選択（lastProcessedCardsに設定） |
| `CHOOSE_N_FROM_LIST` | 3 | 3 | WX13-003, WXEX2-44, WXK06-028 | 以下の①②③④からN個選択して実行 |
| `COPY_LRIG_TRASH_ACTIVATED` | 3 | 3 | WX05-002, WX05-003, WX05-004 |  |
| `DISCARD_OR_PENALTY` | 3 | 3 | WX04-047, WX24-P3-079, WXDi-P14-023 | 特定カード1枚捨てるかペナルティ（N枚捨て）を選ぶ |
| `EFFECT_LIMIT` | 3 | 3 | WX13-053, WX21-066, WXDi-P10-076 | 連続効果の上限枚数をキャップ（直前のパワー修正を上限値でキャップ） |
| `FORCE_TARGET_SELF` | 3 | 3 | WX25-CP1-060, WXDi-P03-053, WXDi-P11-040 | このシグニしか対象にできない（ログのみ） |
| `HAND_SIZE_INCREASE` | 3 | 3 | WD23-001-E, WX19-003, WX25-P2-005 | 手札上限を増やす / REDUCE_OPP_HAND_LIMIT: 相手の手札上限を減らす |
| `INTERNAL_ASK_ACCE_HOST` | 3 | 3 | WDK07-E07, WDK07-E20, WXK10-074 | INTERNAL_ASK_ACCE_HOST / INTERNAL_ATTACH_ACCE_TO_HOST（§6.4 O-11・2026-08-16）＝ 「あなたのデッキから〈X〉のシグニ1枚を探して**それの【アクセ】にし**、デッキを… |
| `LIMIT_OPP_DRAW_COUNT` | 3 | 3 | WXEX1-10, WXDi-P12-008, WXK06-004 | ドロー枚数制限（次のターン） |
| `MARK_MATERIAL_TARGET` | 3 | 1 | WXK09-TK-01A | 直前に処理したシグニ（lastProcessedCards＝《改造素材》を |
| `MARK_SELF_DELAYED_EXILE` | 3 | 3 | WD22-035-G, WX16-040, WX21-Re06 | この解決で実際に場へ戻った自身だけを遅延除外対象にする。 |
| `MOVE_TO_ATTACKER_FRONT` | 3 | 3 | WX04-029, WXDi-D06-012, WXDi-P02-052 | 相手シグニアタック時、正面が空なら自分をそのアタッカーの正面ゾーンに移動（してもよい）。実装済み（stub.value 優先、なければ attacked_signi_ids から動的特定） |
| `MULTI_ZONE_ATTACK` | 3 | 3 | WX15-037, WXK04-070, WXK04-072 |  |
| `NEGATE_NTH_ATTACK` | 3 | 3 | SP27-016, WX10-018, WX17-006 | このターン、対象種別の相手アタックを共有カウントでN回目まで自動無効化 |
| `OPP_DECLARE_CHOICE` | 3 | 3 | PR-K060, WX05-006, WX16-Re17 | 相手が①②から選ぶ |
| `PLACE_OWN_GATE` | 3 | 3 | WXDi-P15-003, WXDi-P15-010, WXDi-P15-011 | あなたのシグニゾーン1つにTHE DOOR【ゲート】を置く（own_gate_zones）。 |
| `REVEAL_TOP_CONDITIONAL_ROUTE` | 3 | 3 | WX08-025, WX10-030, WXK05-021 | デッキ上を公開しレベル条件で分岐 |
| `REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI` | 3 | 3 | WDK05-T15, WXK02-071, WXK10-057 | このシグニを手札に戻した場合のみ、デッキの一番上を公開し、シグニならアタッカーの元ゾーンにダウン状態で出してアタックを継続する（G186） |
| `SET_ACCE_CHOICE` | 3 | 1 | SPK01-11 | アクセ装着時に選んだ付与能力のインデックスを記録（SPK01-11 ラズベリー）。 |
| `SIGNI_REPOSITION` | 3 | 3 | WXEX2-04, WX24-P2-089, WXDi-CP02-095 | シグニを別のゾーンに移動（自or相手、1体 or 全体） |
| `TRIGGER_LIFE_BURST` | 3 | 3 | WX13-032, WXEX1-11, WXEX2-13 | lastProcessedCards[0] のLBを発動（field.checkにセット） |
| `ALL_COLOR` | 2 | 2 | WX22-025, WXK05-029 | CONTINUOUS→effectEngine.collectAllColorSigniで動的処理済み |
| `ARTS_SELF_RECYCLE_ON_TRIGGER` | 2 | 2 | WX10-015, WX10-027 | ルリグトラッシュのアーツがトリガー時に自己回収 |
| `BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN` | 2 | 2 | WX15-003, WX25-P1-050 | BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN（§6.4 O-14(a)・`WX15-003-E3`）: 「**次のターンの間**、対戦相手はアーツとスペルと【起】能力を使用できず〜」＝上の当ターン版の予約形。 ⚠`… |
| `CENTER_LRIG_DISMOUNT` | 2 | 2 | WXK03-036, WXK10-063 | センタールリグがすべての乗機シグニから降りる（ドライブ解除・任意） |
| `COIN_USE_RESTRICTION` | 2 | 2 | WXDi-P15-008, WXDi-P15-009 | コイン使用先をスペルとシグニに限定（ゲーム中永続） |
| `COPY_CARD` | 2 | 2 | WX21-034, WXDi-P07-041 | このシグニはlastProcessed[0]のカードとレベル以外同じになる（card_identity_overrides） |
| `COPY_SIGNI` | 2 | 2 | WX17-001, WXK04-005 | 自フィールドシグニ1体をトラッシュのシグニと同じカードにする（ターン終了時まで） |
| `DISONA_RESTRICTION` | 2 | 1 | WXDi-P12-075 | 「このターン、あなたは《ディソナアイコン》ではないスペルを使用できない」 |
| `DRAW_AT_TURN_END` | 2 | 2 | WXK01-054, WXK01-089 | このターン終了時にカードをN枚引く予約（場を離れても引く。WXK01-054/089） |
| `GATE` | 2 | 2 | WDK09-001, WDK09-006 | ゲート効果（ログのみ） 相手のシグニゾーン1つに【ゲート】を設置（次のアタックフェイズに条件付きでアタック不可） |
| `HAND_REVEAL_CLASS_SIGNI` | 2 | 2 | WX05-030, WX06-019 | 手札のクラスシグニを選択して公開（SELECT_TARGET） |
| `IGNORE_LRIG_RESTRICTION_ARTS` | 2 | 2 | PR-K060, WX05-006 | ルリグ制限アーツを無視（ログのみ） |
| `LIFE_BURST_DOUBLE` | 2 | 2 | WD23-006-E, WXDi-P12-035 | このターン、次のライフバーストは2回発動する |
| `MOVE_TARGET_SIGNI_TO_OTHER_ZONE` | 2 | 2 | WXDi-P00-015, WXDi-P00-068 | 対象の自シグニを他のシグニゾーンへ移動（同処理） |
| `NEGATE_THAT_ATTACK` | 2 | 2 | WXEX2-17, WXDi-D06-010 | 現在のアタックを無効化 |
| `ONE_ATTACK_PER_TURN` | 2 | 2 | WXDi-P11-071, WXDi-P12-078 | アタック制限系（engine: アタック制限システム未実装） |
| `OPP_DECLARE_COLOR` | 2 | 2 | WXEX1-07, WXK09-037 | 相手が色を宣言（5色CHOOSE opponentResponds→INTERNAL_SET_OPP_DECLARED_COLOR） |
| `OPP_DRAW_LIMIT` | 2 | 2 | WXDi-P05-039, WXDi-P16-005 | 対戦相手のターン開始時、そのターンのドローを1枚に制限（triggerScope: any_opp で相手ターン発動） |
| `OPP_MAIN_PHASE_LIMIT_DOWN` | 2 | 2 | WX25-P2-014, WXDi-P13-029 | 次の相手メインフェイズの間、センタールリグのリミット-2 |
| `OPP_SIGNI_ATTACK_COST` | 2 | 2 | WX22-Re20, WXEX1-04 | ターン終了時まで、相手シグニのアタックに《無》×2コスト |
| `OPP_ZONE_PLACEMENT_RESTRICT` | 2 | 2 | WXDi-P14-068, WXDi-P11-TK01 | CONTINUOUS効果（effectEngineで動的判定） |
| `OPTIONAL_RETURN_SELF_ARTS_FIRST_USE` | 2 | 1 | WX24-P3-036 | 同名アーツの当ターン初回使用時だけ、 |
| `PEEP_HAND` | 2 | 2 | PR-K070, WX24-P4-105 | 相手の手札を覗き見（ログに枚数と名前を表示） |
| `RETURN_SUMMONED_RESONA_AT_TURN_END` | 2 | 2 | WX07-050, WX16-Re18 | 「ターン終了時、（その）レゾナを場からルリグデッキに戻す」の予約。 |
| `REVEAL_OPP_HAND_CARD` | 2 | 2 | PR-459A, WXDi-P14-060 | 相手の手札のカードを1枚公開 |
| `SWAP_OPTIONAL` | 2 | 2 | WX13-073, WXDi-P10-047 | シグニを別のゾーンに移動（自or相手、1体 or 全体） 対象の自シグニを他のシグニゾーンへ移動（同処理） |
| `TARGET_OPP_SIGNI_ONLY` | 2 | 1 | WXDi-P01-028 | 「対戦相手のシグニ１体を対象とする。対戦相手は手札を２枚捨てないかぎり、それをデッキの一番下に置く。」 |
| `TRASH_SIGNI_TO_BEAT` | 2 | 2 | WDK14-011, WXK08-029 |  |
| `UPKEEP_OR_NO_UP` | 2 | 2 | WXDi-P06-002, WXDi-P13-075 | 次の相手UPフェーズに条件未達でセンタールリグをアップさせない |
| `USE_CONDITION_ARTS_USED` | 2 | 2 | WD15-006, WD20-008 | このターンにアーツを使用していた場合、このカードは使用不可 |
| `ACCE_FROM_TRASH` | 1 | 1 | WDK07-E11 | トラッシュのアクセカードを自分のシグニに付ける |
| `ACCE_OP` | 1 | 1 | WD18-009 | アクセ操作（汎用ログ） |
| `ACCE_SIGNI_ALL_COLOR` | 1 | 1 | WX22-043 | アクセ中のシグニを全色にする |
| `ACTIVATE_COST_ZERO_BLACK` | 1 | 1 | WD08-001 | トラッシュのシグニを選択→次の起動コストを《黒×0》に |
| `ACTIVATE_EICHI_ABILITY` | 1 | 1 | WXEX1-18 | コイン能力でこのシグニの【出】効果を再発動 |
| `ADD_RESONANCE_CONDITION` | 1 | 1 | WX20-052 | ルリグデッキのレゾナにアタックフェイズタイミングを追加（effectEngineで処理） |
| `ADJACENT_SIGNI_POWER_MOD` | 1 | 1 | WXK01-060 | このシグニと隣接するシグニ最大2体のパワーを修正 |
| `ADJACENT_ZONE_ATTACK` | 1 | 1 | WD20-009 |  |
| `ALL_CARDS_COLOR_CHANGE_BLACK` | 1 | 1 | WXK07-005 | CONTINUOUS→effectEngine.hasAllCardsColorBlackで動的処理済み |
| `ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE` | 1 | 1 | PR-471 | ゲーム全体ルリグタイプ付与（effectEngine lrig_gained_types参照） |
| `ALL_CLASS` | 1 | 1 | WX21-021 | CONTINUOUS→effectEngine.collectAllClassSigniで動的処理済み |
| `ALL_PLAYER_MILL` | 1 | 1 | WX22-017 | 各プレイヤーがデッキ上N枚をトラッシュ |
| `ALL_ZONE_BLACK` | 1 | 1 | WDA-F02-17 | CONTINUOUS→effectEngine.collectAllZoneBlackCardNumsで動的処理済み |
| `ALLOW_ATTACK_WHILE_DRIVE` | 1 | 1 | WXEX2-11 |  |
| `ARTS_COLORLESS_MUST_PAY_CENTER_COLOR` | 1 | 1 | WX16-006 |  |
| `ASSIST_LRIG_ATTACK_THIS_TURN` | 1 | 1 | WX25-P1-048 | このターン、レベルが minLevel 以上のアシストルリグでアタックできる |
| `ATTACK_COUNT_BY_POWER` | 1 | 1 | WX22-022 |  |
| `BANISH_BY_SELF_GOES_TO_TRASH` | 1 | 1 | WXK06-049 | このシグニによるバニッシュはエナでなくトラッシュへ |
| `BANISH_REDIRECT_POWER0_TRASH` | 1 | 1 | WX04-038 | このターン、パワー0以下のシグニがバニッシュされる場合エナの代わりにトラッシュへ（所有者問わず。WX04-038-E1） |
| `BANISH_REDIRECT_TO_HAND` | 1 | 1 | WXDi-P13-045 | このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなく手札に戻る |
| `BANISH_SUBSTITUTE_RISE_STACK` | 1 | 1 | WX22-034 |  |
| `BANISH_THRESHOLD_BOOST_7_15` | 1 | 1 | WX09-027 | WX09-027(オリハルティア)の常在マーカー。 |
| `BATTLE_BANISH_LIFE_BURST` | 1 | 1 | WXEX2-40 | バトルバニッシュ後に相手側LBを発動 |
| `BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY` | 1 | 1 | WXDi-P06-034 | バニッシュ代わりにダウン＋下1枚＋エナ1枚トラッシュ（WXDi-P06-034・BattleScreen側処理） |
| `BATTLE_LEAVE_REPLACE_WITH_DOWN` | 1 | 1 | WXDi-CP02-TK01A | バトル・相手効果による場離れをダウンに置換（任意）（BattleScreen側処理） |
| `BATTLE_LEAVE_REPLACE_WITH_EXILE` | 1 | 1 | WXK05-024 | 場を離れる代わりにゲームから除外（≈トラッシュ近似・WXK05-024・BattleScreen側処理） |
| `BET_CONDITION` | 1 | 1 | WDK01-010 | ベット宣言していた場合に追加効果を実行 |
| `BLACK_RISE_PLAY_STACK_FROM_TRASH` | 1 | 1 | WDK15-001 |  |
| `BLOCK_ALL_OPP_ACTIVATE_ABILITY` | 1 | 1 | WXEX2-54 | 全相手起動能力封じ |
| `BLOCK_COLORLESS_ENERGY_PAY` | 1 | 1 | WXK07-001 | このアタックフェイズの間、対戦相手は無色のカードでエナコストを支払えない |
| `BLOCK_COLORLESS_PLAY` | 1 | 1 | WX14-017 | 相手の無色プレイを封じる |
| `BLOCK_FRONT_SIGNI_ATTACK` | 1 | 1 | WXDi-P16-047 |  |
| `BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT` | 1 | 1 | WX18-020 |  |
| `BLOCK_NON_WHITE_SPELL` | 1 | 1 | WXDi-P03-052 |  |
| `BLOCK_OPP_AUTO_ABILITY_EXTENDED` | 1 | 1 | WXDi-P13-006 | このターンと次のターン、相手シグニの【自】能力は発動しない |
| `BLOCK_OPP_DECK_TO_ENERGY` | 1 | 1 | WXK11-068 |  |
| `BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT` | 1 | 1 | WXK11-042 |  |
| `BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN` | 1 | 1 | WXK10-013 | このターン、対戦相手はシグニを新たに場に出せない |
| `BLOCK_OPP_SPELL_ACT_NEXT_TURN` | 1 | 1 | WXDi-P09-007 | 次の対戦相手のターン中、スペルと起動能力を使用できない |
| `CARDS_OUTSIDE_ENERGY_BECOME_WHITE` | 1 | 1 | WX08-005 |  |
| `CENTER_LRIG_COLOR_CHANGE_BLACK` | 1 | 1 | WXK03-006 |  |
| `CHANGE_ALL_SIGNI_COLOR_TO_BLACK` | 1 | 1 | WX05-005 |  |
| `CHANGE_BASE_LEVEL` | 1 | 1 | WX19-027 | このシグニの基本レベルを1～3にしてもよい（ターン終了まで） |
| `CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN` | 1 | 1 | WXK07-032 | シグニ1体の基本レベルを1にしてもよい（次の自ターン終了まで） |
| `CHANGE_EICHI_SIGNI_BASE_LEVEL` | 1 | 1 | WXEX1-71 | 英知シグニを選択→基本レベルを1～3に変更（ターン終了まで） |
| `CHANGE_SIGNI_COLOR` | 1 | 1 | WX25-P3-111 | 対象シグニの色を指定色に変更（ターン終了時まで） |
| `CHECK_ZONE_FLIP_FREE_GROW` | 1 | 1 | WXDi-P16-001A | SELF_SIGNI_ATTACK_NEGATE_IMMUNITY（§6.4 O-10・続き510）＝ 「このターン、あなたの効果によってシグニのアタックは無効にならない」（`WX24-P4-016-E3`）。 ⚠**利得側の効果**（自… |
| `COIN_SPEND_CONDITION` | 1 | 1 | WXDi-P16-083 | ターン終了時にコイン消費チェック、未達時トラッシュ |
| `CONDITIONAL_ALTERNATE_EFFECT` | 1 | 1 | WD23-044-EA | 条件達成時にダウン済みシグニをトラッシュへ（代替効果） |
| `CONDITIONAL_GROW_AND_KEY_DISABLE` | 1 | 1 | WXK02-029 | WXK02-029 ビカム・ユー（アーツ）の選択肢①。 |
| `CONDITIONAL_TRASH_UNDER_SIGNI` | 1 | 1 | WXDi-P16-064 | 相手エナN枚以上の場合、シグニ下カードを任意でトラッシュ |
| `COOKING_BANISH_SUBSTITUTE` | 1 | 1 | WX17-048 |  |
| `COST_COLOR_SELECT` | 1 | 1 | WX04-063 | 支払われたエナ1つにつきその色を1つ選択し、選択した「色の種類」1つにつき その色のシグニ1枚をデッキから探して公開・手札に加える（その後シャッフル）。無色は色に含まれない。 |
| `COUNTER_TEAM_PIECE_AND_EXILE` | 1 | 1 | WXDi-P05-006 | COUNTER_TEAM_PIECE_AND_EXILE（§6.4 O-10・続き518・`WXDi-P05-006-E1` の選択肢①）＝ 「【使用条件】【チーム】を持つ対戦相手のピース１枚を対象とし、それの効果を打ち消す。  この方法… |
| `CRASH_TO_TRASH_INSTEAD` | 1 | 1 | WX19-034 | このターン相手のライフクロスクラッシュ時、エナではなくトラッシュへ |
| `DECK_SIGNI_LEVEL_OVERRIDE` | 1 | 1 | WX18-065 | デッキ内指定クラスのシグニレベルをN扱い（このターン） |
| `DECK_SIGNI_LEVEL_OVERRIDE_ALL` | 1 | 1 | WXK07-034 | 「このターン、あなたのデッキにある**シグニ**のレベルはNになる」 |
| `DECLARE_NUMBER_POWER` | 1 | 1 | WXDi-P07-086 | パワー値宣言（3000〜15000）→ declared_number に保存（§6.4 O-41 で改名） |
| `DECLARE_ZONE_FOR_CLASS_CHANGE` | 1 | 1 | WX14-032 | メインデッキ/手札/シグニゾーン/トラッシュの1つを指定 |
| `DECLARED_ICON_HAND_DISCARD_BANISH` | 1 | 1 | WXDi-P12-055 | ═══ DECLARED_ICON_HAND_DISCARD_BANISH（§6.4 O-34(e)・`WXDi-P12-055-E1`）═══ 「対戦相手のシグニ１体を対象とし、あなたの手札を１枚選んでもよい。そうした場合、対戦相手は … |
| `DEFEAT` | 1 | 1 | PR-422 | 敗北処理 - ライフクロスを0にしてゲーム終了を誘発 |
| `DOUBLE_POWER_MINUS_THIS_TURN` | 1 | 1 | WX04-038 | このターン、あなたのシグニの効果で対戦相手のシグニのパワーが－される場合2倍－される（WX04-038-E1） |
| `DOWN_UP_SIGNI_AND_CHOOSE` | 1 | 1 | SPDi43-23 | シグニをダウン/アップして選択 アップ状態の特定クラスシグニを好きな数ダウン（コスト軽減素材） |
| `DRIVE_SIGNI_PREVENT_DOWN` | 1 | 1 | WXK03-035 | ドライブ状態のシグニに対戦相手の効果によるダウン防止を付与 |
| `DYNAMIC_LEVEL_BY_ENERGY` | 1 | 1 | WX20-Re18 |  |
| `END_ATTACK_IF_EXTRA_TURN` | 1 | 1 | WX10-026 | 追加ターンならアタックフェイズを終了（ATTACK_SIGNI/LRIG封じ） |
| `ENERGY_COLOR_SUBSTITUTE_TRASH` | 1 | 1 | WXK07-005 | エナ代替系（effectEngine.collectEnergyTrashSubstituteInfoで動的計算） |
| `ENERGY_NON_COLORLESS_ALL_COLORS` | 1 | 1 | WX14-017 |  |
| `ENERGY_SUBSTITUTE_TRASH_KEY` | 1 | 1 | WXK02-023 |  |
| `ENERGY_SUBSTITUTE_TRASH_SIGNI` | 1 | 1 | WX16-Re06 | エナ代替系（effectEngine.collectEnergyTrashSubstituteInfoで動的計算） |
| `ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI` | 1 | 1 | SP07-011 |  |
| `EXILE_CRAFTS_RESET_ZONES_AND_DRAW` | 1 | 1 | WX24-P2-014 | 「各プレイヤーは自分の手札とシグニゾーンとエナゾーンとトラッシュにある、すべてのクラフトを     ゲームから除外し、すべてのカードをデッキに加えてシャッフルし、カードをN枚引く」 ⚠**両プレイヤーに同じ処理をする**（従来は自分の D… |
| `FIRST_SPELL_COST_UP` | 1 | 1 | WXDi-P13-072 | コストアップ系（engine: コスト計算未実装） |
| `GAIN_ADDITIONAL_LRIG_TYPE` | 1 | 1 | WXK09-005 |  |
| `GAIN_LRIG_COLOR` | 1 | 1 | WXDi-P16-058 |  |
| `GRANT_CONDITIONAL_ASSASSIN_ABILITY` | 1 | 1 | WXK02-057 | 条件付きアサシンをkeyword_grantsに付与 |
| `GRANT_NEXT_SPELL_UNCOUNTERABLE` | 1 | 1 | WX04-008 | 次に自分が使用するスペルは対戦相手の効果で打ち消されない（WX04-008 ファフニール） |
| `GRID_REVEAL_PLUS` | 1 | 1 | WX06-033 | このターン、デッキ公開枚数+1フラグを設定 |
| `GROW_FROM_LEVEL0` | 1 | 1 | PR-469 |  |
| `HASTARLIQ` | 1 | 1 | WXDi-P05-016 | 【ハスターリク】(WXDi-P05-TK01A)を相手シグニゾーンに設置 |
| `INCREASE_ACT_ABILITY_COST` | 1 | 1 | WXDi-P06-031 | 起動能力のコストを増加（ログのみ） |
| `INHERIT_OPP_LRIG_TYPE` | 1 | 1 | WXEX2-23 |  |
| `INHERIT_UNDER_SIGNI_COLOR` | 1 | 1 | WXEX2-81 |  |
| `INTERNAL_ACCE_PICKED_TO_SELF` | 1 | 1 | WDK07-E15 | WDK07-E15: REVEAL_AND_PICK passes the picked deck card in lastProcessedCards. Attach that exact card to the effect sour… |
| `INTERNAL_ARTS_RECYCLE_EXECUTE` | 1 | 1 | SP26-007 | アーツをルリグトラッシュからルリグデッキへ回収実行 |
| `INTERNAL_KIYOHIME_CHOOSE` | 1 | 1 | WDK08-L14 | WDK08-L14 紅蓮の使い魔 清姫。 |
| `INTERNAL_OPEN_MB_SKIP` | 1 | 1 | WX24-P3-050 | 【マジックボックス】を表向きにしない（「〜してもよい」を断った枝） |
| `LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT` | 1 | 1 | WXEX1-62 | このカード自身のレベル参照をLv4として扱う（デッキ/手札/トラッシュ在中） |
| `LIMIT_OPP_ATTACK_ONCE` | 1 | 1 | WD13-010 | LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限 |
| `LIMIT_OPP_SIGNI_ATTACKS_ONCE` | 1 | 1 | WX13-005A | LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限 |
| `LOOK_DECK_BOTTOM` | 1 | 1 | WXDi-P13-049 | デッキ下を1枚確認 |
| `LOOK_TOP_BOTTOM` | 1 | 1 | WXDi-P08-046 | デッキ上1枚とデッキ下1枚を確認 |
| `LOOK_TOP_OPP_CHOOSE_TRASH` | 1 | 1 | WXK11-064 | デッキ上N枚を公開し相手が1枚選んでトラッシュ |
| `LOSE_SIGNI_BARRIER` | 1 | 1 | WX24-P1-043 | 対戦相手は【○バリア】Nつを失う |
| `LRIG_ALL_NAMES` | 1 | 1 | WX25-P3-037 | ルリグシステム（未実装残） |
| `MARK_PLACED_DELAYED_EXILE` | 1 | 1 | WXDi-P13-004A | この解決で**場に出したカード**（lastProcessedCards）を遅延除外対象にする |
| `MOVE_ACCE_TO_SIGNI` | 1 | 1 | WXK05-064 | アクセを別のシグニに付け替え |
| `MULTI_ACCE_FROM_HAND` | 1 | 1 | WXK11-037 | 手札のアクセカードを自分のシグニに付ける |
| `MULTI_DAMAGE_ON_LRIG_ATTACK` | 1 | 1 | WXK01-004 | このターン、ルリグアタックをN回与える（lrig_attack_remainingフラグでBattleScreen側が管理） |
| `NAMED_SIGNI_ACCE_FROM_TRASH` | 1 | 1 | WDK17-011 | トラッシュのアクセカードを自分のシグニに付ける |
| `NEGATE_ABILITY` | 1 | 1 | WXDi-P08-044 | 対象シグニの能力を無効化（abilities_removedに追加） |
| `NEGATE_ALL_OPP_EFFECTS` | 1 | 1 | WXK02-001 | 相手のCONTINUOUS効果を全て無効化（all_cont_effects_negatedフラグ） |
| `NEGATE_COIN_ABILITY` | 1 | 1 | WX16-002 | コイン能力を無効化（ログのみ） |
| `ODD_LEVEL_SIGNI_CANT_ATTACK` | 1 | 1 | WXK03-028 | アタック制限系（engine: アタック制限システム未実装） |
| `OPP_CENTER_LRIG_LIMIT_SET_5` | 1 | 1 | WXEX1-26 | BattleScreen側処理済みSTUB（execStub呼び出し時はログのみ） |
| `OPP_CHOOSE_EFFECT` | 1 | 1 | WXK04-032 | 相手が①②から選ぶ |
| `OPP_CHOOSES_FOR_YOU` | 1 | 1 | WXDi-P07-007 | 相手が①②から選ぶ |
| `OPP_DIRECT_ATTACK_NEGATE` | 1 | 1 | WX04-004 | 相手シグニが正面なしでアタックしたとき、コスト（costColorsのエナ＋＜美巧＞シグニ1枚捨て）を |
| `OPP_DRAW_LIMIT_PER_TURN` | 1 | 1 | WX25-P2-TK05 | ドローフェイズ中の相手ドローを1枚に制限（BattleScreen側処理） |
| `OPP_ENERGY_REDUCE_TO_N` | 1 | 1 | WXK06-055 | 相手のエナをstub.value枚になるようにトラッシュ（WXK06-055 CHOOSE選択肢） |
| `OPP_LRIG_ATTACK_COST` | 1 | 1 | WX25-P2-014 | コストアップ系（engine: コスト計算未実装） |
| `OPP_LRIG_UNDER_TO_LRIG_TRASH` | 1 | 1 | WXK11-002 | 3〜4つの処理を動的解析して実行 |
| `OPP_REVEAL_HAND_AND_LRIG_DECK` | 1 | 1 | WX15-001 | 公開ログ |
| `OPP_REVEAL_LRIG_DECK` | 1 | 1 | WXDi-P09-039 | 公開ログ |
| `OPP_REVEAL_TOP_AND_HAND` | 1 | 1 | WXDi-D09-P14 | 公開ログ |
| `OPP_SIGNI_ONE_ATTACK_TOTAL` | 1 | 1 | WXDi-P04-023 | LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限 |
| `OPP_TRASH_LOSE_COLOR_AND_CLASS` | 1 | 1 | WXK11-026 | CONT効果（effectEngineで処理） |
| `OPP_TURN_NO_ENERGY_COST` | 1 | 1 | WXDi-P03-012 | このターン、対戦相手はエナコストを支払えない |
| `OPTIONAL_HAND_REVEAL_NAMED` | 1 | 1 | WX05-038 | 名称指定で手札カードを任意公開 |
| `PLACE_CHOKKIN` | 1 | 1 | WX17-034 | sourceCardNumのゾーンに【貯菌】カウンターを+1 |
| `PLACE_DECK_TOP_UNDER_WEAPON_SIGNI` | 1 | 1 | WXK08-088 | ウェポンシグニの下にデッキ上を置く |
| `PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON` | 1 | 1 | WXK08-030 | 全ウェポンシグニの下にトラッシュからシグニを1枚ずつ置く |
| `PREVENT_LIFE_REFRESH_TRASH` | 1 | 1 | WXDi-P00-041 |  |
| `PREVENT_OPP_UPKEEP` | 1 | 1 | WXK10-012 | 相手のアップキープ（アップ）を防ぐ |
| `PREVENT_SELF_MOVE_BY_OPP` | 1 | 1 | WXDi-P07-050 |  |
| `REDIRECT_ATTACK_TO_SELF_ZONE` | 1 | 1 | WXDi-CP02-TK01A | 相手シグニの直接アタックをこのシグニゾーンにリダイレクト（BattleScreen側処理） |
| `REDUCE_OPP_HAND_LIMIT` | 1 | 1 | WDK09-009 | 手札上限増加（CONTINUOUS：シグニがフィールドにある間） 手札上限を増やす / REDUCE_OPP_HAND_LIMIT: 相手の手札上限を減らす |
| `REMOVE_SELF_SIGNI_FROM_GAME` | 1 | 1 | WXDi-CP02-TK01A | このシグニをゲームから除外する（クラフトルール適用） |
| `REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER` | 1 | 1 | WXDi-P05-038 |  |
| `REPLACE_PLUS_N` | 1 | 1 | WXK10-005 | このターン、相手シグニへの正パワー修正を負に置換 |
| `RESONANCE_COST_CARDS_TO_ENERGY` | 1 | 1 | WXEX1-16 | レゾナコストカードをエナゾーンへ |
| `RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE` | 1 | 1 | WXEX2-32 |  |
| `RESTORE_REVEALED_DECK_CARDS` | 1 | 1 | WXDi-P06-036 | この効果で公開したカードを参照し直す（間にドロー等を挟んでも後続の条件が公開カードを見られるようにする） |
| `RESTRICT_CHARMED_SIGNI_ACTIVATED` | 1 | 1 | WX08-006 |  |
| `RETURN_TO_HAND_AT_TURN_END` | 1 | 1 | WXK08-002 | RETURN_TO_HAND_AT_TURN_END（§6.4 O-10・続き509）＝「ターン終了時、それを場から手札に戻す」。 予約だけを積み、解決は `screens/battle/turnEndHandReturn.ts` の f… |
| `REVEAL` | 1 | 1 | WX16-Re17 | デッキ上を公開（名前ログ） |
| `REVERSE_OPP_POWER_MINUS` | 1 | 1 | WXDi-P00-039 | 相手シグニのパワーマイナス修正を反転（プラスに） |
| `RISE_BANISH_SUBSTITUTE` | 1 | 1 | WX16-002 | ライズ/スタック系（engine: ライズシステム未実装） |
| `RISE_LEAVE_DISCARD_STACK` | 1 | 1 | WXEX2-09 | ライズ/スタック系（engine: ライズシステム未実装） |
| `SELECT_NO_COMMON_COLOR` | 1 | 1 | WX22-050 | 共通色なしを選択（ログのみ） WX22-050 エンジェル・アウェイク |
| `SELECT_OPP_SIGNI_FOR_BOTTOM_MILL` | 1 | 1 | WXK03-039 | 対戦相手のシグニ1体を対象とし、デッキの下から4枚をトラッシュに置く（この方法でレベルの異なるシグニ4枚が置かれた場合、それをバニッシュする） |
| `SELECT_OTHER_SIGNI` | 1 | 1 | WXDi-P10-052 | ソース以外のシグニを選択 |
| `SELF_LRIG_LOSE_ABILITY` | 1 | 1 | WXK08-002 | ターン終了時まで、あなたのセンタールリグは能力を失う |
| `SELF_SIGNI_ATTACK_NEGATE_IMMUNITY` | 1 | 1 | WX24-P4-016 | このターン、あなたの効果によってシグニのアタックは無効にならない |
| `SET_CANCEL_OPP_ATTACK_FLAG` | 1 | 1 | WX15-016 | 守備側の効果が「対戦相手のアタック」を無効化する場合に使う。 |
| `SET_STORED_BASE_LEVEL` | 1 | 1 | WXK08-002 | SELF_LRIG_LOSE_ABILITY（§6.4 O-10・続き509）＝「あなたの（赤の）センタールリグ１体を対象とし、 ターン終了時まで、それは能力を失い『…』を得る」（`WXK08-002-E1` の選択肢③）。 上の `OP… |
| `SIGNI_GAIN_ONE_LRIG_COLOR` | 1 | 1 | WXDi-P03-074 | このシグニがルリグの色を1つ得る（ターン終了時まで） |
| `SIGNI_LOSE_COLOR` | 1 | 1 | WX25-P1-063 | 対戦相手のシグニ1体が色を失う（ターン終了時まで） |
| `SIGNI_UNDER_WEAPON_SIGNI` | 1 | 1 | WDK15-013 | 自シグニ1体を自＜ウェポン＞シグニの下に置く |
| `STACK_ALL_LRIG_UNDER` | 1 | 1 | WX14-001 | ルリグトラッシュ全ルリグをこのカードの下に置く |
| `SUBSTITUTE_DAMAGE_WITH_SELF_TRASH` | 1 | 1 | WXDi-P08-054 | このシグニをトラッシュに置く代わりにダメージ無効（任意） |
| `SUMMON_FROM_ENERGY` | 1 | 1 | WXDi-P14-TK04 |  |
| `SUPPRESS_CENTER_ON_PLAY` | 1 | 1 | WX12-011 | このターン自分のセンタールリグの【出】効果を抑制 |
| `SUPPRESS_OPP_SIGNI_ABILITIES` | 1 | 1 | SP27-016 | 相手フィールドの全シグニの能力を消去 |
| `TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE` | 1 | 1 | WXDi-P10-033 | 相手シグニ1体を対象とし、バウンスかトラッシュを選ぶ |
| `TRASH_ACCE_AT_TURN_END` | 1 | 1 | WX16-044 | アクセカードをターン終了時にトラッシュ（即座に処理） このシグニに付いているアクセ1枚をトラッシュへ |
| `TRASH_ENERGY_AT_TURN_END` | 1 | 1 | SPK01-10 | ターン終了時に lastProcessedCards を**エナゾーンから**トラッシュへ（SPK01-10）。 |
| `TRASH_SELF_ACCE_ALL` | 1 | 1 | WX20-028 | 効果元シグニに付いている全【アクセ】をトラッシュへ。 |
| `TRASH_SPELL_FREE_USE_LIMIT` | 1 | 1 | WX25-P2-034 | トラッシュスペル無料使用制限（ログのみ） トラッシュからコスト上限以下のスペルをコストなしで使用 |
| `TRASH_UNDER_SIGNI_UP_TO_ALL` | 1 | 1 | WXK08-055 | あなたのシグニの下にあるカードを好きな枚数選び、それらをトラッシュに置く |
| `TRIGGER_OTHER_SIGNI_EICHI_ABILITY` | 1 | 1 | PR-366 | 他の自シグニを選択し、その英知AUTO能力を発動させる |
| `WHITE_SIGNI_ABILITY_PROTECT` | 1 | 1 | WXDi-P15-085 |  |


---

## 付録: 内部/動的生成 STUB（JSON 0 件・ハンドラのみ 349 種）

他の STUB やパーサーが実行時に動的生成する `INTERNAL_*` 系などが大半。JSON には静的には現れない。

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `ABILITY_CHECK_ELSE_TRASH` | 0 | 0 |  | 「それを手札に戻す。**それ**が能力を持たない場合、代わりにそれをトラッシュに置く」 |
| `ACCE_SIGNI_GRANT_ABILITY` | 0 | 0 |  | アクセ中のシグニにキーワード能力を付与 |
| `ACTIVATE_TRAP_IN_FIELD` | 0 | 0 |  | トラップを表向きにしてTRAP_ICON効果を発動 |
| `ADD_DECLARED_GUARD_LEVEL` | 0 | 0 |  |  |
| `ARM_SIGNI_LRIG_PROTECTION` | 0 | 0 |  |  |
| `ARTS_USE_DISCARD_COLOR_HAND` | 0 | 0 |  | 手札から特定色のカードを任意N枚まで捨て、コスト軽減（OPTIONAL_DISCARD_CLASS_SIGNI の色版） |
| `ARTS_USE_DISCARD_LRIG_DECK` | 0 | 0 |  | アーツ使用時にルリグデッキからアーツを任意でルリグトラッシュへ |
| `ATTACH_CHARM_FROM_TRASH` | 0 | 0 |  | トラッシュのシグニをチャームとして付与（ログのみ近似） |
| `ATTACH_SEARCHED_AS_ACCE` | 0 | 0 |  | サーチしたカードを対象シグニのアクセとして付ける（手札経由近似） |
| `AWAKEN` | 0 | 0 |  | 覚醒メカニクス（ルリグ変身） |
| `BANISH_FACING_IF_SELF_POWER_GE_15000` | 0 | 0 |  | アタック時、自パワー15000以上なら正面相手シグニをバニッシュ（WD17-009） |
| `BANISH_IF_DISCARDED_3_THIS_TURN` | 0 | 0 |  | このターン手札3枚以上捨てていればバニッシュ+相手エナトラッシュ（WXK03-021 ON_ATTACK_PHASE_START） |
| `BEAT_ZONE_OP` | 0 | 0 |  | ビートゾーン操作（「【ビート】にする」または「【ビート】がN枚以下」条件チェック） |
| `BLOCK_OPP_ARTS_SPELL_ACT` | 0 | 0 |  | このターン対戦相手はアーツ・スペル・起動能力を使用できない |
| `BLOOM_CHOOSE` | 0 | 0 |  | 開花したとき選択効果（個別効果テキスト依存） |
| `BUFF_HOST_WHEN_PLACED_UNDER` | 0 | 0 |  | このカードがシグニの下に置かれたとき上のシグニ+2000（WXDi-P11-063） |
| `CENTER_ZONE_CONDITION` | 0 | 0 |  | このシグニが中央ゾーン（zone[1]）にある場合のみ続行 |
| `CHOOSE_COLOR_FROM_LIST` | 0 | 0 |  | エナゾーンの色から選ぶ（最大N色）→ selectedColors に保存 |
| `CHOOSE_SAME_OPTION_MULTIPLE` | 0 | 0 |  |  |
| `CHOOSE_SAME_OPTION_TWICE` | 0 | 0 |  |  |
| `CLASS_SIGNI_TO_ENERGY` | 0 | 0 |  | デッキ上のクラスシグニを最大2枚選んでエナゾーンへ（LOOK_AND_REORDER後） |
| `CONDITIONAL_ADD_HAND` | 0 | 0 |  | フィールドにシグニがあれば手札に1枚追加 |
| `CONDITIONAL_ALT_POWER_BOOST` | 0 | 0 |  | 条件成立時に代わりにパワー修正（AUTO/ACTIVATED: temp_power_mods） |
| `CONDITIONAL_PER_TRASH` | 0 | 0 |  | トラッシュ枚数による条件（N枚以上でX） |
| `CONDITIONAL_POWER_BONUS` | 0 | 0 |  | 条件付きパワーボーナス |
| `COUNT_DISTINCT_NAMES` | 0 | 0 |  | フィールドの異なる名称数を数えてパワー修正 |
| `DECK_MILL_UNTIL_CLASS` | 0 | 0 |  | クラスが出るまでデッキ上からトラッシュに置く |
| `DECK_REVEAL_UNTIL_CLASS` | 0 | 0 |  | デッキを条件が満たされるまで公開する |
| `DECLARE_AND_MILL` | 0 | 0 |  | effects.jsonではDECLARE_NUMBER+MILL(useDeclaredCount)に移行済み |
| `DECLARED_NAME_TO_SERVANT_ZERO` | 0 | 0 |  | declared_card_name と一致する相手のカードをサーバントZEROに（WXEX2-10） |
| `DISABLE_FIRST_ABILITY_ON_ATTACK` | 0 | 0 |  | アタック時最初の能力を無効化（ログのみ） |
| `DO_THREE_THINGS` | 0 | 0 |  |  |
| `DRAW_IF_CHARGED_CLASS` | 0 | 0 |  | 直前のエナチャージで＜クラス＞のシグニが置かれた場合1ドロー（WDK07-E01） |
| `DRAW_IF_OPP_DISCARDED_HAND` | 0 | 0 |  | 相手が手札を捨てたときドロー（トリガー系・ログのみ） |
| `DRAW_UNTIL_HAND_SIZE` | 0 | 0 |  | 手札がN枚（value、既定6）になるまで引く |
| `DRAW_UP_TO_SIX` | 0 | 0 |  | 手札が6枚未満のとき、6枚になるまでカードを引く（SPK16-13E③用） |
| `DRIVE_AUTO_BANISH_ALL_OPP` | 0 | 0 |  | ドライブ自→アタック時に相手全シグニをバニッシュ（IS_DRIVE_STATEチェック付き） |
| `DRIVE_CONT_BANISH_RESIST` | 0 | 0 |  | ドライブ常→このシグニはバニッシュされない（effectEngineで処理） |
| `ENCORE` | 0 | 0 |  | アンコールメカニクス（ルリグトラッシュのアーツをコストなしで使用） |
| `ENERGY_LEVEL_CONDITION_CHOOSE` | 0 | 0 |  | エナにレベルN以上があればCHOOSE提示 |
| `ENERGY_TO_HAND_ON_DECK` | 0 | 0 |  | エナゾーンからカードを手札へ（SELECT→INTERNAL） |
| `EVDIVA_PER_LRIG_COLOR` | 0 | 0 |  | WX25-P3-050 エビディバ!!!!! 場の色別ルリグ数ぶんに各効果を行う。 |
| `EXTRA_PHASE_RESTRICT` | 0 | 0 |  | その他ゾーン/レベル/フェイズ制限 |
| `FACEDOWN_FLIP_TO_HAND` | 0 | 0 |  | 表向きにせず、そのカードを手札に加える。 |
| `FACEDOWN_FLIP_UP` | 0 | 0 |  | 裏向きカードを表向きにしてシグニゾーンへ（場にあるかぎり field_power_mods で +powerBonus）。 |
| `FIELD_COND_DRAW_REVEAL` | 0 | 0 |  | フィールド条件達成時にデッキ上を公開し同クラスなら手札へ |
| `FORCE_COLOR_BLACK` | 0 | 0 |  | エナゾーン以外の領域にあるシグニは黒になる（collectFieldSigniExtraColorsで処理） |
| `FROM_TRASH_TO_CENTER_ZONE` | 0 | 0 |  | トラッシュからカードを中央シグニゾーン（zone[1]）に出す |
| `FROZEN_LOSES_ABILITIES` | 0 | 0 |  | 対戦相手の凍結状態のシグニは能力を失う（effectEngineで処理） |
| `GRANT_LRIG_ABILITY` | 0 | 0 |  | 能力付与系（CONTINUOUS効果はeffectEngineで処理、AUTO/ACTIVATEDでも来た場合のフォールバック） GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRAS… |
| `GRANT_LRIG_TYPE_GAME_WIDE` | 0 | 0 |  |  |
| `GRANT_PRIOKE_PENDING_ATTACK_TRASH` | 0 | 0 |  | FUTURE SESSION③ 次のAPS時にプリオケシグニへ能力付与をフラグとして予約 |
| `GRANT_TURN_TRIGGER_3RD_DOWN` | 0 | 0 |  | このターン植物シグニ3回目ダウン時トリガー付与（WX05-042 増武） |
| `GROW_CENTER_IF_LEVEL_LTE_OPP` | 0 | 0 |  | センタールリグのレベルが相手以下なら無コストグロウ |
| `HAND_EXCESS_TO_ENERGY` | 0 | 0 |  | 手札がN枚（value、既定5）より多い場合、差分を手札からエナゾーンへ（WDK08-Y08） |
| `HASTARLIQ_TRIGGER` | 0 | 0 |  | アタックフェイズ開始時発動（BattleScreenがスタックに積む） |
| `INHERIT_LRIG_TRASH_ABILITIES` | 0 | 0 |  | ルリグトラッシュにあるルリグの起動能力を継承する（BattleScreen側処理） |
| `INTERNAL_ACLDH_APPLY` | 0 | 0 |  | ADD_CARD_TO_LRIG_DECK_HIDDEN の選択後処理 |
| `INTERNAL_APPLY_CARD_NAME_LOCK` | 0 | 0 |  | 宣言されたカード名を使用禁止（blacklist）／許可（whitelist）へ書き込む。 |
| `INTERNAL_APPLY_CLASS_CHANGE` | 0 | 0 |  | 選択シグニのクラスを変更 |
| `INTERNAL_APPLY_POWER_DELTA_OPP` | 0 | 0 |  | SELECT_TARGET後に対象シグニへparent deltaを適用 |
| `INTERNAL_APPLY_PRIOKE_ATTACK_TRASH` | 0 | 0 |  | 予約したアタック時トラッシュ能力を対象プリオケシグニに適用 |
| `INTERNAL_ATTACH_ACCE_TO_HOST` | 0 | 0 |  |  |
| `INTERNAL_ATTACH_SOUL_FROM_LRIG` | 0 | 0 |  | ソウル付与（ルリグの下カードを選択シグニに付与） |
| `INTERNAL_BANISH_ALL_POWER_GTE` | 0 | 0 |  | パワーN以上のすべてのシグニ（両プレイヤー）をバニッシュ |
| `INTERNAL_BANISH_FROM_GAME_DO` | 0 | 0 |  |  |
| `INTERNAL_BANISH_FROM_GAME_SKIP` | 0 | 0 |  |  |
| `INTERNAL_BANISH_OPP_POWER_GTE` | 0 | 0 |  | 相手のパワーN以上のシグニ1体をバニッシュ |
| `INTERNAL_BANISH_OPP_POWER_LTE` | 0 | 0 |  | パワーN以下の相手シグニをバニッシュ（対象選択） |
| `INTERNAL_BET_EXTRA_TO_HAND` | 0 | 0 |  | ベット時の追加対象（トラッシュ→手札）を1枚処理 |
| `INTERNAL_BIDC_BANISH` | 0 | 0 |  |  |
| `INTERNAL_BIDC_ENERGY` | 0 | 0 |  |  |
| `INTERNAL_BLOCK_ATTACK_THIS_TURN` | 0 | 0 |  | 対象がアタックできない |
| `INTERNAL_BLOOM_SEED` | 0 | 0 |  | 指定ゾーンのシードを開花する |
| `INTERNAL_BOUNCE_TO_DECK` | 0 | 0 |  | 選択シグニをデッキにランダム挿入 |
| `INTERNAL_CBDOP_AFTER_DISCARD` | 0 | 0 |  | INTERNAL: 手札捨て後の効果（COUNT_BASED_DRAW_OR_POWER から継続） |
| `INTERNAL_CHARGE_PER_CENTER_LEVEL` | 0 | 0 |  | センタールリグのレベル1につきエナチャージ1 |
| `INTERNAL_CHOOSE_SOUL_LRIG` | 0 | 0 |  | ソウル付与（ルリグトラッシュからルリグを選択シグニに付与） |
| `INTERNAL_CLEAR_OPTIONAL_EFFECT_TAKEN` | 0 | 0 |  |  |
| `INTERNAL_CMCLG_ALL_POWER_UP` | 0 | 0 |  | 自フィールド全シグニのパワーを+N（次の対戦相手ターン終了まで継続） |
| `INTERNAL_CMCLG_APPLY_POWER_MOD` | 0 | 0 |  | POWER_MOD_BY_CLASS_LEVELS の続き |
| `INTERNAL_CMCLG_DEDUCT` | 0 | 0 |  | 任意コストのエナを消費（実行時に組み立てる汎用の支払いステップ。 |
| `INTERNAL_CMCLG_DRAW_ON_POWER_ZERO` | 0 | 0 |  | このターン相手シグニのパワー≤0でドロー（フラグ設置） |
| `INTERNAL_CMCLG_GRANT_LAYER_LEAVE_BOUNCE` | 0 | 0 |  | 【レイヤー】持ちシグニに「場を離れたとき手札に戻す」を付与 |
| `INTERNAL_CMCLG_GRANT_SLANCER` | 0 | 0 |  | 選択した＜CLASS＞シグニに【Sランサー】付与 |
| `INTERNAL_CMCLG_MILL_OPP` | 0 | 0 |  | 相手デッキ上N枚→トラッシュ |
| `INTERNAL_CMCLG_OPP_TRASH_TO_DECK_LIFE_ENERGY` | 0 | 0 |  | 相手トラッシュ全→デッキにシャッフル+相手ライフ1枚→エナ |
| `INTERNAL_CMCLG_PLAY_CLASS_FROM_HAND` | 0 | 0 |  | 手札から＜CLASS＞のシグニを場に出す |
| `INTERNAL_CMCLG_PLAY_CLASS_FROM_TRASH` | 0 | 0 |  | トラッシュから＜CLASS＞のシグニをN枚まで場に出す |
| `INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS` | 0 | 0 |  | ＜毒牙＞シグニのレベル合計×-1000で対象シグニのパワーを修正 |
| `INTERNAL_CMCLG_TRASH_TO_DECK_LIFE` | 0 | 0 |  | 自トラッシュ全→デッキにシャッフル+デッキ上→ライフ |
| `INTERNAL_CONSUME_LRIG_UNDER` | 0 | 0 |  | ルリグの下からN枚をルリグトラッシュへ（SOUL_OP optional消費の実行部） |
| `INTERNAL_CONSUME_SOUL` | 0 | 0 |  | ソースシグニの下にあるソウルカードをルリグトラッシュへ |
| `INTERNAL_COPY_SIGNI_APPLY` | 0 | 0 |  | card_identity_overrides を設定してコピーを適用 |
| `INTERNAL_DBPM_DISCARD` | 0 | 0 |  |  |
| `INTERNAL_DC_DECK_PICK` | 0 | 0 |  | WX24-P1-035用 |
| `INTERNAL_DC_TRASH_RETRIEVE` | 0 | 0 |  | WXDi-P09-004用 |
| `INTERNAL_DCCE_TRASH_COLOR` | 0 | 0 |  | 宣言色のエナ1枚をトラッシュ |
| `INTERNAL_DECK_BOTTOM_LEVEL_DOWN` | 0 | 0 |  | デッキ下1枚トラッシュ→シグニなら同レベル相手シグニをダウン |
| `INTERNAL_DECK_BOTTOM_SUMMON` | 0 | 0 |  | デッキ下1枚トラッシュ→シグニなら場に出す |
| `INTERNAL_DECK_TRASH_BOTH` | 0 | 0 |  | 両プレイヤーのデッキ上N枚をトラッシュ |
| `INTERNAL_DECLARE_CARD_NAME` | 0 | 0 |  |  |
| `INTERNAL_DECLARE_DECK_TOP_ICON` | 0 | 0 |  | 宣言後にデッキの一番上を公開し、外れていたら帰結を実行する（§6.4 O-4）。 |
| `INTERNAL_DECLARE_ZONE_EXECUTE` | 0 | 0 |  | 選択した領域を declared_class_zones に記録 |
| `INTERNAL_DECLARED_ICON_DECLARE` | 0 | 0 |  |  |
| `INTERNAL_DECLARED_ICON_PICK_HAND` | 0 | 0 |  |  |
| `INTERNAL_DECLARED_ICON_RESOLVE` | 0 | 0 |  |  |
| `INTERNAL_DESIGNATE_ZONE` | 0 | 0 |  | 選択したゾーンを対象側の State へ**追記**する（複数指定に対応・§6.4 O-16） |
| `INTERNAL_DISCARD_ALL_DRAW_N` | 0 | 0 |  | 手札をすべて捨てN枚引く |
| `INTERNAL_DISCARD_CLASS_OR_PENALTY` | 0 | 0 |  | 「＜クラス＞のシグニを1枚捨てないかぎり、カードをN枚捨てる」（WXK04-014①）。 |
| `INTERNAL_DISCARD_LRIG_DECK_ARTS` | 0 | 0 |  | INTERNAL: ルリグデッキからアーツをルリグトラッシュへ（CHOOSEの続き） |
| `INTERNAL_DISCARD_MATCHING_HAND_DOP` | 0 | 0 |  |  |
| `INTERNAL_DISCARD_PENALTY` | 0 | 0 |  |  |
| `INTERNAL_DISMOUNT_DO` | 0 | 0 |  |  |
| `INTERNAL_DISRUPT_LRIG_UNDER_EXEC` | 0 | 0 |  | DISRUPT_OPP_LRIG_UNDER_BY_TYPE の実行部（コスト支払い＋除去） |
| `INTERNAL_DO_COLLAB` | 0 | 0 |  | コラボ実行（アシストルリグ1人を配置） |
| `INTERNAL_DOWN_AND_FREEZE_OPP` | 0 | 0 |  | 相手シグニ1体をダウン+全シグニを凍結 |
| `INTERNAL_DOWN_SIGNI_BY_ZONE` | 0 | 0 |  |  |
| `INTERNAL_DPE_DO_DISCARD` | 0 | 0 |  |  |
| `INTERNAL_DPE_PAY` | 0 | 0 |  |  |
| `INTERNAL_DPE_SELECT_DISCARD` | 0 | 0 |  |  |
| `INTERNAL_DRAW_PER_CENTER_LEVEL` | 0 | 0 |  | センタールリグのレベル1につき1ドロー |
| `INTERNAL_ECRV_APPLY` | 0 | 0 |  | ウイルスN個除去→(N+1)択効果を選ぶ |
| `INTERNAL_ENCORE_USE` | 0 | 0 |  | 選択したアーツをコストなしで実行 |
| `INTERNAL_ENERGY_TO_HAND` | 0 | 0 |  | ENERGY_TO_HAND_ON_DECK 後処理：選択エナを手札へ |
| `INTERNAL_ENERGY_TO_TRASH` | 0 | 0 |  | ENERGY_TO_TRASH の後処理：選択したエナカードをトラッシュへ |
| `INTERNAL_EVDIVA_RED_BANISH` | 0 | 0 |  | 選択したシグニのパワー合計が12000以下ならバニッシュ（エビディバ赤効果） |
| `INTERNAL_EXILE_ARTS_FROM_LRIG_DECK_SELECT` | 0 | 0 |  |  |
| `INTERNAL_EXILE_OPP_TRASH` | 0 | 0 |  | 相手トラッシュのカードをゲームから除外（2枚まで） |
| `INTERNAL_EXILE_SELECTED_ARTS_AND_SKIP_SIGNI_STEP` | 0 | 0 |  |  |
| `INTERNAL_FACEDOWN_RELEASE_FLIP` | 0 | 0 |  | 支払い後に裏向きカードを同じゾーンへ表向きで戻し、予約を解除する。 |
| `INTERNAL_FREEZE_OPP_LRIG` | 0 | 0 |  | 相手センタールリグを凍結（ダウン+凍結状態） |
| `INTERNAL_GCA_APPLY` | 0 | 0 |  | 選んだ保護（ダウン/バウンス）をターン終了時まで付与 |
| `INTERNAL_GCA_SELECT` | 0 | 0 |  | 表記パワーより現在パワーが高いあなたの＜電機＞シグニ１体を対象に選ぶ |
| `INTERNAL_GEN_TOKEN_TO_LRIG_DECK` | 0 | 0 |  | 指定 base CardNum のトークンをゲーム外生成しルリグデッキへ（フェゾーネ等） |
| `INTERNAL_GRANT_KEYWORD_TO_TARGET` | 0 | 0 |  | 選択されたキーワード/保護能力を対象シグニに付与 |
| `INTERNAL_GRANT_NO_ATTACK_LRIG` | 0 | 0 |  | CHOOSE_SAME_OPTION_TWICEから呼ばれる内部ハンドラ |
| `INTERNAL_HAND_OR_ENERGY` | 0 | 0 |  | 「それぞれ手札に加えるかエナゾーンに置き」を1枚ずつ問うチェーン（タスク12(xlvi)(h)）。 |
| `INTERNAL_HAND_TO_DECK_BOTTOM` | 0 | 0 |  |  |
| `INTERNAL_HAND_TO_ENERGY` | 0 | 0 |  | INTERNAL: lastProcessedCardsの手札カードをエナへ移動 |
| `INTERNAL_HL_BANISH` | 0 | 0 |  | どちらも行わない→そのゾーンのシグニをバニッシュ（エナへ） |
| `INTERNAL_HL_DO_DISCARD` | 0 | 0 |  | 選択した手札をトラッシュへ→バニッシュ回避 |
| `INTERNAL_HL_PAY` | 0 | 0 |  | 《無》1枚支払い→バニッシュ回避 |
| `INTERNAL_HL_SELECT_DISCARD` | 0 | 0 |  | 手札を1枚選んで捨てる（ハスターリク回避） |
| `INTERNAL_KEEP_ON_DECK_TOP` | 0 | 0 |  | LOOK_PICK_CHAIN の then:'deck_top' 段のマーカー。ここでは盤面を動かさない |
| `INTERNAL_LAYER_COPY_APPLY` | 0 | 0 |  | 選択シグニのレイヤー能力を自シグニに付与 |
| `INTERNAL_LCLTR_TRASH` | 0 | 0 |  |  |
| `INTERNAL_LEAVE_TO_TRASH` | 0 | 0 |  | 選択シグニをトラッシュに置く |
| `INTERNAL_LIFE_TO_HAND_DO` | 0 | 0 |  |  |
| `INTERNAL_LRIG_UNDER_TRASH_SELECTED` | 0 | 0 |  |  |
| `INTERNAL_MARK_REVEALED_FROM_HAND` | 0 | 0 |  | 手札公開の記録（applyDirectAction経由で選択カードごとに呼ばれる） |
| `INTERNAL_MARK_REVEALED_NAMED` | 0 | 0 |  | 手札公開の記録（applyDirectAction経由で選択カードごとに呼ばれる） BattleScreenが hand_revealed_just を検出してON_REVEALED_FROM_HANDトリガーを発火しクリアする |
| `INTERNAL_MOVE_TO_BEAT` | 0 | 0 |  | 選択シグニをビートゾーンへ移動 |
| `INTERNAL_MOVE_TO_ZONE` | 0 | 0 |  |  |
| `INTERNAL_NEGATE_ABILITY` | 0 | 0 |  | 選択シグニの能力を無効化 |
| `INTERNAL_ODC_COLOR_CHECK` | 0 | 0 |  | 色宣言後、lastProcessedCards[0]の色を確認してペナルティ適用 |
| `INTERNAL_OPEN_MB_DO` | 0 | 0 |  | MB表向き確定後のトラッシュ移動 |
| `INTERNAL_OPP_DECK_TRASH_N` | 0 | 0 |  | 相手デッキの上からN枚をトラッシュ |
| `INTERNAL_OPP_ENERGY_TO_TRASH` | 0 | 0 |  |  |
| `INTERNAL_OPP_FIELD_TO_ENERGY` | 0 | 0 |  | lastProcessedCards[0]を相手フィールドからエナゾーンへ移動 |
| `INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N` | 0 | 0 |  | 選択した相手手札をデッキ下へ |
| `INTERNAL_OPP_HAND_TO_DECK_TOP` | 0 | 0 |  |  |
| `INTERNAL_OPP_LRIG_DECK_TO_LRIG_TRASH_APPLY` | 0 | 0 |  |  |
| `INTERNAL_OPP_PAY_COST` | 0 | 0 |  |  |
| `INTERNAL_OPP_SIGNI_TO_DECK_SHUFFLE` | 0 | 0 |  |  |
| `INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC` | 0 | 0 |  |  |
| `INTERNAL_OPP_SIGNI_TO_TRAP` | 0 | 0 |  | 選択した相手シグニをトラップゾーンへ |
| `INTERNAL_OPP_SKIP_COST` | 0 | 0 |  |  |
| `INTERNAL_OPP_SPELL_TO_TRASH` | 0 | 0 |  | 使用しなかった公開スペルを対戦相手のトラッシュへ（WX04-015） |
| `INTERNAL_OPP_TRASH_TO_DECK_TOP` | 0 | 0 |  |  |
| `INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE` | 0 | 0 |  | stub.value=ゾーン番号、lastProcessedCards[0]=置くカード |
| `INTERNAL_OTEC_MOVE_SELECTED` | 0 | 0 |  | applyDirectActionのdefault経由で呼ばれ、lastProcessedCards[0]を移動 |
| `INTERNAL_OTEC_SELECT` | 0 | 0 |  | エナゾーンから特定クラスのカードを選択してトラッシュ/手札へ |
| `INTERNAL_OTEC_SKIP` | 0 | 0 |  |  |
| `INTERNAL_PAY_BEAT_SIGNI` | 0 | 0 |  |  |
| `INTERNAL_PAY_CHARM_TRASH` | 0 | 0 |  |  |
| `INTERNAL_PAY_CHARM_TRASH_VARIABLE` | 0 | 0 |  |  |
| `INTERNAL_PAY_EXCEED` | 0 | 0 |  |  |
| `INTERNAL_PAY_LRIG_DOWN` | 0 | 0 |  |  |
| `INTERNAL_PAY_LRIG_DOWN_VARIABLE` | 0 | 0 |  |  |
| `INTERNAL_PAY_REMOVE_OPP_VIRUS` | 0 | 0 |  |  |
| `INTERNAL_PAY_TRASH_ARTS_FROM_LRIG_DECK` | 0 | 0 |  |  |
| `INTERNAL_PICK_TO_ENERGY` | 0 | 0 |  | 公開中のカード（stub.value）をデッキ/トラッシュからエナゾーンへ（handOrEnergy のエナ分岐）。 |
| `INTERNAL_PICK_TO_HAND` | 0 | 0 |  | 公開中のカード（stub.value）をデッキ/トラッシュ/エナから手札へ（handOrField の手札分岐）。 |
| `INTERNAL_PICK_TO_TRAP` | 0 | 0 |  |  |
| `INTERNAL_PLACE_FACING_SAME_POWER` | 0 | 0 |  | ═══ PLACE_TRASH_SIGNI_FACING_SAME_POWER（§6.4 O-32・`WXDi-CP01-024-E1`）═══ 「あなたのトラッシュから**対戦相手の場にあるシグニ１体と同じパワー**の＜X＞のシグニを１… |
| `INTERNAL_PLACE_LRIG_UNDER_CENTER` | 0 | 0 |  | ルリグトラッシュから選択ルリグをセンタールリグ下に配置 |
| `INTERNAL_PLACE_PUPPET` | 0 | 0 |  | 選択した相手トラッシュのシグニ1枚を、傀儡状態で自分の空きゾーンに出す（applyDirectActionが1枚ずつ呼ぶ） |
| `INTERNAL_PLACE_SELF_UNDER_SIGNI` | 0 | 0 |  | 自シグニを選択シグニのスタック下に移動。 |
| `INTERNAL_PLACE_SUMMONED_RESONAS` | 0 | 0 |  | 選ばれたレゾナを1枚ずつ空きゾーンへ置く（§6.4 O-5）。 |
| `INTERNAL_PMBTSL_APPLY` | 0 | 0 |  |  |
| `INTERNAL_PMBUC_APPLY` | 0 | 0 |  |  |
| `INTERNAL_PMOP_APPLY` | 0 | 0 |  |  |
| `INTERNAL_POWER_MOD_ALL_OPP` | 0 | 0 |  | 全相手シグニへのパワー修正 |
| `INTERNAL_POWER_MOD_OPP_ONE` | 0 | 0 |  | 相手の1体にパワー修正 |
| `INTERNAL_POWER_UP_SELECTED` | 0 | 0 |  | MULTI_SIGNI_POWER_UP_5000 の後処理：選択した自シグニにパワー+5000 |
| `INTERNAL_PTFR_CHOOSE_ZONE` | 0 | 0 |  | PLACE_TRAP_FROM_REVEALED用のゾーン選択 |
| `INTERNAL_PTSUAW_PLACE` | 0 | 0 |  | ウェポン下シグニ配置の実行 |
| `INTERNAL_REMOVE_SIGNI_ZONE` | 0 | 0 |  | 選択したゾーンを削除してシグニをトラッシュへ |
| `INTERNAL_REMOVE_VIRUS_N` | 0 | 0 |  | N個ウイルスを除去（effectExecutorのREMOVE_VIRUS+IS_MY_TURNハンドラから使用） |
| `INTERNAL_REORDER_LIFE_APPLY` | 0 | 0 |  | N枚のライフをトラッシュに置き、デッキ上からN枚をライフに追加 |
| `INTERNAL_REORDER_REMAINDER` | 0 | 0 |  | 公開してピックしなかった残りを |
| `INTERNAL_REPOSITION_MOVE` | 0 | 0 |  | 選択シグニを空きゾーンへ移動（後方互換） |
| `INTERNAL_REPOSITION_TO_ZONE` | 0 | 0 |  | 選択シグニを指定ゾーンへ移動（SIGNI_REPOSITIONの後半） |
| `INTERNAL_RESOLVE_PILES` | 0 | 0 |  |  |
| `INTERNAL_RETURN_LRIG_TO_DECK` | 0 | 0 |  | ルリグトラッシュの最初のルリグをlrig_deckへ移動 |
| `INTERNAL_RETURN_SELECTED_TRAP` | 0 | 0 |  |  |
| `INTERNAL_RIDE_ON_APPLY` | 0 | 0 |  |  |
| `INTERNAL_RV_BATCH_TRANSFER` | 0 | 0 |  | N個ウイルス除去 + トラッシュからシグニN枚を手札へ（WX15-028型） |
| `INTERNAL_SDWT_DO` | 0 | 0 |  | シグニトラッシュ+ダメージ無効実行 |
| `INTERNAL_SEED_FROM_DECK` | 0 | 0 |  | SEARCHで選択したカードをデッキから取り出してゾーン選択 |
| `INTERNAL_SEED_TO_HAND_THEN_DECK_TOP` | 0 | 0 |  | 指定ゾーンのシードを手札に加えてデッキ上をシード設置 |
| `INTERNAL_SEEDS_PLACE_LOOP` | 0 | 0 |  | 選択した【シード】候補を1枚ずつ順次設置する。残りは CHOOSE の continuation に積んで |
| `INTERNAL_SELECT_COLOR` | 0 | 0 |  |  |
| `INTERNAL_SET_DECLARED_COLOR` | 0 | 0 |  |  |
| `INTERNAL_SET_GATE` | 0 | 0 |  |  |
| `INTERNAL_SET_LEVEL_RANGE` | 0 | 0 |  |  |
| `INTERNAL_SET_MAGIC_BOX` | 0 | 0 |  | ゾーン確定後の実設置処理 |
| `INTERNAL_SET_OPP_DECLARED_COLOR` | 0 | 0 |  |  |
| `INTERNAL_SET_OPTIONAL_EFFECT_TAKEN` | 0 | 0 |  |  |
| `INTERNAL_SET_OWN_GATE` | 0 | 0 |  |  |
| `INTERNAL_SET_SEED` | 0 | 0 |  | 指定ゾーンにシード設置。設置カードは stub.seedCards[0]（複数枚設置の順次配置）優先、なければ lastProcessedCards[0]。 |
| `INTERNAL_SET_SOUL_FROM_LRIG_TRASH_RESULT` | 0 | 0 |  | ルリグトラッシュ選択後ソウル付与 |
| `INTERNAL_SET_TRAP` | 0 | 0 |  | ゾーン番号をstub.valueで受け取りトラップ設置 手札の1枚を指定ゾーンへ【トラップ】として置く（`lastProcessedCards[0]` を使う）。 |
| `INTERNAL_SIGNI_UNDER_WEAPON` | 0 | 0 |  | 選択シグニを＜ウェポン＞の下に配置 |
| `INTERNAL_SKIP_OPTIONAL_ACTION` | 0 | 0 |  | 任意の全件処理（手札全公開／手札・エナ全トラッシュ）の非実行枝。 直前効果の記録を持ち越さず、後続 LAST_PROCESSED_* 条件を確実に不成立にする。 |
| `INTERNAL_SNC_AFTER_SEARCH` | 0 | 0 |  | SEARCHで非選択→trash済み、選択カードはまだdeckに残っている |
| `INTERNAL_SNC_MOVE_TO_ENERGY` | 0 | 0 |  | 指定カードをデッキからエナゾーンへ |
| `INTERNAL_SNC_MOVE_TO_HAND` | 0 | 0 |  | 指定カードをデッキから手札へ |
| `INTERNAL_SONG_FRAGMENT` | 0 | 0 |  | SELECT_TARGETで選択されたカードで歌のカケラ発動 |
| `INTERNAL_SPLIT_REVEALED` | 0 | 0 |  | INTERNAL_SPLIT_REVEALED（タスク12(lix)）: 公開してピックしなかった残りを「好きな枚数をデッキの一番下・ 残りを一番上」へ振り分けさせる。カードは resumeSearch が既にデッキから抜いてあるので、 … |
| `INTERNAL_STUTO_SELECT_OTHERS` | 0 | 0 |  |  |
| `INTERNAL_STUTO_TRASH_SELECTED` | 0 | 0 |  |  |
| `INTERNAL_STUTO_TRASH_SELF` | 0 | 0 |  |  |
| `INTERNAL_TOP_TO_BOTTOM` | 0 | 0 |  |  |
| `INTERNAL_TOSFC_AFTER_SELECT` | 0 | 0 |  | 選択後にバウンスかトラッシュを選択 |
| `INTERNAL_TOSFC_BOUNCE` | 0 | 0 |  | 選択した相手シグニをバウンス |
| `INTERNAL_TOSFC_TRASH` | 0 | 0 |  | 選択した相手シグニをトラッシュ |
| `INTERNAL_TOSO_AFTER_SELECT` | 0 | 0 |  | 選択後、対戦相手の手札が2枚未満なら強制でデッキ下へ。 |
| `INTERNAL_TOSO_TO_DECK` | 0 | 0 |  | 選択した相手シグニをデッキの一番下へ |
| `INTERNAL_TRASH_CARD` | 0 | 0 |  | 手札からスペルを選んでトラッシュへ |
| `INTERNAL_TRASH_CLASS_SPLIT` | 0 | 0 |  | 選択カードを手札（1枚）＋エナ（残り）に振り分け |
| `INTERNAL_TRASH_OWN_KEY` | 0 | 0 |  |  |
| `INTERNAL_TRASH_SEARCHED_CARD` | 0 | 0 |  | `USE_SEARCHED_SPELL_OR_TRASH` の「使わない」枝。 |
| `INTERNAL_TRASH_SELECTED_ARTS_FROM_LRIG_DECK` | 0 | 0 |  |  |
| `INTERNAL_TRASH_SIGNI_TO_HAND` | 0 | 0 |  | トラッシュからシグニ1枚を手札へ（CONDITIONAL_MULTI_CHOOSE系） |
| `INTERNAL_TRASH_TO_ENERGY` | 0 | 0 |  | TRASHED_CARD_TO_HAND_OR_ENERGY → エナ選択後処理 |
| `INTERNAL_TRASH_TO_HAND` | 0 | 0 |  | TRASHED_CARD_TO_HAND_OR_ENERGY → 手札選択後処理 |
| `INTERNAL_TRASH_TO_LIFE` | 0 | 0 |  |  |
| `INTERNAL_TRASH_UNDER_SIGNI` | 0 | 0 |  | シグニ下カードをトラッシュへ移動 |
| `INTERNAL_TRASHED_PICK_HAND_OR_FIELD` | 0 | 0 |  | 上の選択結果（lastProcessedCards）を1枚ずつ手札／場へ振り分ける。 |
| `INTERNAL_TRASHED_PICK_HAND_OR_FIELD_REST` | 0 | 0 |  |  |
| `INTERNAL_TRASHED_TO_ENERGY` | 0 | 0 |  |  |
| `INTERNAL_TRASHED_TO_HAND` | 0 | 0 |  |  |
| `INTERNAL_TSU_CHOOSE_ZONE` | 0 | 0 |  | 選択トラッシュシグニをどのフィールドシグニの下に置くか選択 |
| `INTERNAL_TSU_DO_PLACE` | 0 | 0 |  | トラッシュ→フィールド下配置実行、残りがあれば継続 |
| `INTERNAL_TTH_APPLY` | 0 | 0 |  | TRAP_TO_HAND選択完了後の適用 |
| `INTERNAL_TUSP_APPLY` | 0 | 0 |  |  |
| `INTERNAL_TUSP_TRASH` | 0 | 0 |  |  |
| `INTERNAL_UNKNOWN_NESTED_SKIP` | 0 | 0 |  |  |
| `INTERNAL_UNKNOWN_NESTED_TRASH` | 0 | 0 |  |  |
| `INTERNAL_USE_OPP_SPELL_FREE` | 0 | 0 |  | 公開した相手スペルをコストなし・限定条件無視で使用し、使用後は相手トラッシュへ（WX04-015） |
| `INTERNAL_USE_SEARCHED_SPELL` | 0 | 0 |  | `USE_SEARCHED_SPELL_OR_TRASH` の「使う」枝。 |
| `INTERNAL_WD007_APPLY` | 0 | 0 |  | 選択した対象に能力を付与し、ベットしていれば1回繰り返す |
| `INTERNAL_WD007_GRANT` | 0 | 0 |  | 選んだ能力に応じた対象（自分シグニ or 相手シグニ）を選択 |
| `LEVEL_BASED_CONDITIONAL` | 0 | 0 |  | 公開したシグニのレベルN枚だけ手札を捨てる |
| `LIFE_CLOTH_LOOK_TRASH_REFILL` | 0 | 0 |  | 全ライフクロスを見て好きな枚数トラッシュ→同数デッキ上から補充（WX05-010） |
| `LOOK_TOP_BY_LIFE_COUNT` | 0 | 0 |  | デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_COLOR_SORT` | 0 | 0 |  | デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_N` | 0 | 0 |  | デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_SORT` | 0 | 0 |  | デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_SPELLS_TO_HAND` | 0 | 0 |  | デッキ上N枚を確認してスペルを手札へ・残りをデッキへ |
| `LOSE_LRIG_BARRIER` | 0 | 0 |  | 対戦相手は【○バリア】Nつを失う |
| `LRIG_GAIN_ABILITY` | 0 | 0 |  | ルリグシステム（未実装残） |
| `LRIG_LEVEL_RESTRICT` | 0 | 0 |  | その他ゾーン/レベル/フェイズ制限 |
| `LRIG_RIDE_SIGNI` | 0 | 0 |  | センタールリグがすべての乗機シグニに乗る（ドライブ状態） |
| `LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS` | 0 | 0 |  | ルリグトラッシュの全ルリグをこのカードの下に、アーツをルリグデッキへ（WX05-001, WXEX2-84） |
| `LRIG_ZONE_RESTRICT` | 0 | 0 |  | その他ゾーン/レベル/フェイズ制限 |
| `MAGIC_BOX_REVEAL` | 0 | 0 |  | 場のMBを表向きにしてシグニにする（全MBをシグニとして配置） |
| `MOVE_LRIG_TRASH_UNDER` | 0 | 0 |  | ルリグトラッシュからルリグをセンタールリグの下に置き、白/黒アーツをルリグデッキへ |
| `NEGATE_SPELL` | 0 | 0 |  | コスト合計5以下のスペルを打ち消す（WX11-017 ブルー・パニッシュ） |
| `NON_LRIG_TO_LRIG_TRASH` | 0 | 0 |  | ルリグデッキにカードを追加（非ルリグをルリグトラッシュへ） |
| `OPP_DECK_REVEAL_UNTIL` | 0 | 0 |  | デッキを条件が満たされるまで公開する |
| `OPP_DECLARE_COLOR_COND_ENERGY_TRASH` | 0 | 0 |  | 相手が宣言した色に応じてエナをトラッシュ（相手の宣言が必要→スキップ） 色を宣言し、エナから宣言色のカードを任意でトラッシュ |
| `OPP_DIRECT_ATTACK_NEGATE_PAY` | 0 | 0 |  | ＜美巧＞捨て選択の後続。エナ（costColors）を支払い、 |
| `OPP_DISCARD_OR_PAY_ENERGY` | 0 | 0 |  | アタックフェイズ開始時、対戦相手は《無》を支払うか手札を1枚捨てる |
| `OPP_ENERGY_OR_DISCARD_CONDITION` | 0 | 0 |  | 相手はエナゾーンかトラッシュか選択 |
| `OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL` | 0 | 0 |  | 相手エナが指定数以上のとき超過分をトラッシュ |
| `OPP_LRIG_LOSE_ABILITY` | 0 | 0 |  | 相手ターンの場合、ターン終了時まで相手センタールリグは能力を失う（WX20-003） |
| `OPP_PUNISHER_CHOICE` | 0 | 0 |  | 相手が3択（手札2捨て/エナ3トラッシュ/シグニ1トラッシュ）を選ぶ（WXK05-001【出】） |
| `OPP_RETURN_HAND_ON_SELF_BANISH` | 0 | 0 |  | バニッシュされたとき、対戦相手は手札を1枚デッキの一番上に置く |
| `OPTIONAL_DISCARD_GUARD` | 0 | 0 |  | 手札から任意カードを捨ててガード可能フラグを設定 |
| `OPTIONAL_RETURN_TO_LRIG_DECK` | 0 | 0 |  | 任意コストを支払ってルリグトラッシュからルリグをルリグデッキに戻す |
| `OPTIONAL_TRADE_GUARD_SIGNI` | 0 | 0 |  | ガード系（engine: ガードコスト処理未実装） |
| `PLACE_ACCE_SIGNI_TO_ENERGY` | 0 | 0 |  | アクセカードをエナゾーンへ |
| `PLACE_FACEDOWN_SIGNI` | 0 | 0 |  | SEARCH で選んだ1枚（lastProcessedCards[0]）を裏向きでシグニゾーンに置く。restDest が残りをデッキ下へ運ぶ。 |
| `PLACE_SEED_FROM_REVEALED` | 0 | 0 |  | デッキ上4枚を見て1枚を【シード】として設置 |
| `PLACE_SEEDS_FROM_REVEALED` | 0 | 0 |  | デッキ上4枚を見て stub.value 枚まで【シード】設置（WXK04-010 アンコール・シード）。 |
| `PLACE_VIRUS_TO_2` | 0 | 0 |  | 相手の場のウィルス合計が2になるようにウィルスを置く（WX19-045） |
| `POWER_MINUS_PER_OWN_LEVEL` | 0 | 0 |  | このシグニのレベル×2000だけ対戦相手シグニのパワーを下げる |
| `POWER_MOD_BY_HAND_COUNT` | 0 | 0 |  |  |
| `POWER_MOD_ON_FRONT_PLACE` | 0 | 0 |  | 正面に配置された相手シグニに任意で-3000 |
| `PRDI035_APPLY_PARADISE` | 0 | 0 |  | PR-Di035 OPEN DREAM LAND! 色分岐（APS時評価）。 |
| `PRDI035_PARADISE_COLOR` | 0 | 0 |  | 次のアタックフェイズ開始時判定フラグをセット。 |
| `PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE` | 0 | 0 |  | 次の相手ATKフェイズ開始時、このシグニはアタック不可 |
| `PREVENT_DAMAGE_UNTIL_OPP_TURN_END` | 0 | 0 |  | 期間つき版は `PREVENT_DAMAGE{scope:'LRIG'}` へ移行済み（続き492）。旧 id は手パッチ JSON 互換で残す。 |
| `PREVENT_LRIG_DAMAGE_THIS_TURN` | 0 | 0 |  | このターンのルリグダメージ無効：ownerState に prevent_lrig_damage フラグをセット |
| `PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN` | 0 | 0 |  | 期間つき版は `PREVENT_DAMAGE{scope:'LRIG'}` へ移行済み（続き492）。旧 id は手パッチ JSON 互換で残す。 |
| `PREVENT_NEXT_DAMAGE` | 0 | 0 |  |  |
| `PREVENT_NEXT_DAMAGE_THIS_TURN` | 0 | 0 |  |  |
| `PREVENT_OPP_GUARD_THIS_TURN` | 0 | 0 |  | このターン相手はガードできない（追加コストを払えば可能な語彙とは分離） |
| `PREVENT_SELF_DOWN_BY_OPP` | 0 | 0 |  | PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止 |
| `PREVENT_TARGET_LRIG_ATTACK_THIS_TURN` | 0 | 0 |  | このターン対象ルリグのアタックを防ぐ |
| `REACTIVE_POWER_UP` | 0 | 0 |  | あなたの効果で相手シグニのパワーが減ったとき、その分だけ自シグニのパワーを上げる |
| `REMOVE_MIKO_KEYWORD` | 0 | 0 |  | みこみこ親衛隊キーワードをsourceCardNumのシグニのkeyword_grantsから取り除く（WX25-P3-TK03） |
| `REORDER_LIFE_CLOTHS` | 0 | 0 |  | ライフクロスを好きな枚数トラッシュに置き同数デッキ上から補充し並び替え |
| `REPEAT_EFFECT` | 0 | 0 |  | REPEAT_N_TIMES / REPEAT_EFFECT（§6.4 O-32 で本体は撤去） 🔴**旧実装はカード全文の regex を読んで自分でN回ぶん実行する O-20 クラスの受け皿**だった＝   `SEQUENCE` の… |
| `REPEAT_N_TIMES` | 0 | 0 |  | REPEAT_N_TIMES / REPEAT_EFFECT（§6.4 O-32 で本体は撤去） 🔴**旧実装はカード全文の regex を読んで自分でN回ぶん実行する O-20 クラスの受け皿**だった＝   `SEQUENCE` の… |
| `RESOLVE_EXTRA_ATTACK_PHASE_START` | 0 | 0 |  | 追加したアタックフェイズの開始時本文を1件取り出して実行する。 |
| `RESOLVE_FACEDOWN_FLIP` | 0 | 0 |  | 次の自メインフェイズ開始時、裏向きカードを表向きにするか選ぶ（合成トリガーから発火）。 |
| `RESOLVE_FACEDOWN_RELEASE_PAYMENT` | 0 | 0 |  | 上の予約を各アタックフェイズ開始時に問う合成トリガー。 |
| `RESOLVE_NEXT_OPP_ATTACK_PHASE_EFFECT` | 0 | 0 |  | 「次の対戦相手のアタックフェイズ開始時、〜」の本文を |
| `RESOLVE_NEXT_OPP_TURN_END_EFFECT` | 0 | 0 |  | 「次の対戦相手のターン終了時、〜」の本文を |
| `RESOLVE_OPP_ATTACK_FACEDOWN_FLIPS` | 0 | 0 |  | 次の対戦相手アタックフェイズ開始時の合成トリガー。 |
| `RESOLVE_OWN_TURN_END_EFFECT` | 0 | 0 |  | 「次の**あなたの**ターン終了時、〜」の本文を1件取り出して実行する。 |
| `RETURN_ANGEL_SIGNI_TO_DECK` | 0 | 0 |  | トラッシュから天使シグニ7枚をデッキ下に置く（WX06-001 タウィル＝フィーラ E2） |
| `RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK` | 0 | 0 |  | トラッシュから名前の異なる天使シグニ7枚をデッキ下に置く（WX06-001 E3） |
| `REVEAL_AND_PICK` | 0 | 0 |  | デッキから探してもよい（REVEAL_AND_PICK: シグニ検索→手札or場） |
| `REVEAL_SECOND_PICK_ENERGY` | 0 | 0 |  | 2段階ピックの2段目。1段目で公開した残りのうち、 |
| `REVEAL_TOP_BANISH_BY_LEVEL_SUM` | 0 | 0 |  | デッキ上N枚公開→公開シグニのレベル合計×1000以下の相手シグニをバニッシュ→公開カードをトラッシュ（WX17-028） |
| `REVEAL_TOP_LEVEL_ROUTE` | 0 | 0 |  | デッキの一番上を公開しシグニのレベル別効果を実行（WX12-CB02） |
| `REVEALED_SIGNI_TO_FIELD_REST_TRASH` | 0 | 0 |  | 公開したシグニをフィールドに出し、残りをトラッシュ |
| `SELF_TRASH_UNLESS_TRASH_OTHERS` | 0 | 0 |  | 他の＜原子＞2体をトラッシュしないかぎり自分をトラッシュ（WXK10-039【出】） |
| `SET_DECLARED_NUMBER` | 0 | 0 |  | DECLARE_NUMBER の宣言値を PlayerState に格納する。 🔴**2026-08-22（§6.4 O-41）まで `declared_guard_restrict_level` へ書いており、宣言しただけで   「対… |
| `SET_DECLARED_NUMBER_PLAIN` | 0 | 0 |  |  |
| `SET_DECLARED_PARITY` | 0 | 0 |  |  |
| `SPELL_COST_REDUCTION_BY_TRASH_COUNT` | 0 | 0 |  |  |
| `SUMMON_FROM_TRASH` | 0 | 0 |  | トラッシュからシグニ1枚を場に出す（choiceTextParser選択肢から使用） |
| `SUMMON_FROM_TRASH_TO_HAND_BLACK` | 0 | 0 |  |  |
| `TK3_DISCARD_BY_LEVEL` | 0 | 0 |  | REVEAL_CARDS 確認後、宣言レベルのシグニを相手手札からすべて捨てさせる |
| `TRASH_ALL_CHARMS_DRAW_CHARGE` | 0 | 0 |  | 場の全チャームをトラッシュ→同枚数ドロー+エナチャ |
| `TRASH_ATTACHED_OR_UNDER_CARD` | 0 | 0 |  | シグニに付いているカードまたは下のカード1枚をトラッシュ |
| `TRASH_UNDER_SPELLS_POWER_MINUS` | 0 | 0 |  | このシグニの下スペルを任意枚数トラッシュ→相手シグニに-5000×枚数（WXDi-P10-040） |
| `UNLIMITED_KEYS` | 0 | 0 |  | ゲームプレイに影響しない説明テキストは無音でスキップ |
| `USE_CONDITION_TEXT` | 0 | 0 |  | ゲームプレイに影響しない説明テキストは無音でスキップ |
| `WEAPON_SIGNI_PREVENT_DOWN` | 0 | 0 |  |  |
| `WEAPON_SIGNI_PROTECT_DOWN` | 0 | 0 |  |  |
| `WEAPON_SIGNI_PROTECTION` | 0 | 0 |  |  |
| `WXK07_043_CHARM_BANISH` | 0 | 0 |  | WXK07-043「羅菌 マグネ」: 対戦相手のAPS開始時、チャームがある場合バニッシュされない（ターン終了まで） |
