# STUB 一覧

effects JSON 内の `{ type: 'STUB', id: '...' }` ノードの全一覧と実装状況。
**このファイルは `node scripts/genStubsMd.mjs` で再生成する**（手で編集しても次回再生成で消える）。

> **STUB とは:** カードテキストを DSL に落とし込む際、汎用アクションでは表現しきれない固有ロジックを
> 名前付きハンドラ（`src/engine/execStub.ts` → `execStubPart1〜3.ts`）に逃がす仕組み。
> `execStub` は Part1→2→3 の順に `stub.id` を照合し、どれにも一致しなければ `[STUB: id]` をログ出力する（フォールバック）。

## サマリー（最終生成: 2026-06-22）

| 区分 | 値 |
|---|---:|
| JSON で使用中の STUB id 種類 | 536 |
| 　└ ハンドラ実装あり | 530 |
| 　└ フォールバック（execStub 未処理） | 6 |
| 総 STUB ノード件数 | 2334 |
| JSON 0 件・ハンドラのみ（内部/動的生成 STUB） | 253 |

- 「説明」列は `execStubPart*.ts` の各 `stub.id ===` 直前コメントから自動抽出（空欄＝コメント無し、要補完）。説明を充実させたい場合は該当ハンドラの直前にコメントを書いて再生成する。
- **STUB_LOG（ゲーム効果なしのログのみ）は 0 件達成済み**（v0.284）。現在残る STUB は何らかの実処理を持つ。

---

## ⚠ フォールバック（execStub で未処理）

execStub の if 分岐に無い id。ただし下記の一部は **CONTINUOUS 宣言型**で `effectEngine` 側が処理するため実害はない
（例: `TREAT_AS_LEVEL1_IN_DECK_TRASH`）。新規 STUB を足したのにここに出る場合は実装漏れの可能性。

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `GRANT_ALL_ZONE_LIFEBURST` | 3 | 3 | WD14-001, WX02-002, WX17-036 |  |
| `ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白` | 2 | 2 | WDK16-01T, WXK10-015 |  |
| `GRANT_LEAVE_PLACE_PENDING` | 2 | 2 | WX22-001, WXEX2-51 |  |
| `BANISH_ATTACKER_IF_WEAKER_THAN_FRONT` | 1 | 1 | WD07-012 |  |
| `CONDITIONAL_GROW_AND_KEY_DISABLE` | 1 | 1 | WXK02-029 |  |
| `LIMIT_ALL_FIELD_1` | 1 | 1 | WX04-005 |  |

---

## 実装済み STUB（ハンドラ別）

### execStubPart1.ts（96 種）

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `OPTIONAL_COST` | 426 | 414 | WD06-001, PR-427, WD10-009 | OPTIONAL_COST: 任意コスト（effectExecutorのSEQUENCEインターセプト対象外のエッジケース） 主な338件はeffectExecutor.tsがSTUB→CONDITIONAL(IS_MY_TURN)パター… |
| `ARTS_COST_REDUCTION_BY_EFFECT` | 117 | 115 | WD10-006, WD12-006, WD15-006 | アーツコスト軽減マーカー（コストはBattleScreen使用時に算出済み） |
| `POWER_MOD_PER_COUNT` | 59 | 59 | WD19-001, WDK06-C17, WDK10-009 | 動的パワー修正（COUNT依存） |
| `TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST` | 58 | 57 | WD20-001, WDK05-T11, WDK08-Y11 | 他の任意コスト系（SEQUENCEパターン外のフォールバック） |
| `TARGET_AND_DISCARD_HAND` | 53 | 52 | PR-195, PR-370, PR-459A | 手札を捨てて対戦相手シグニを対象とする効果（スタンドアロン時：手札1枚捨て+相手シグニをlastProcessedCardsへ） |
| `CONDITIONAL_POWER_BONUS` | 43 | 38 | WD06-006, WDK08-Y08, WDK10-009 | 条件付きパワーボーナス |
| `RULE_REMINDER_TEXT` | 42 | 41 | SP26-003, SP38-001, PR-K026 | ゲームプレイに影響しない説明テキストは無音でスキップ |
| `GRANT_QUOTED_AUTO_ABILITY` | 40 | 38 | WD13-002, WD21-007, WD22-007-G | WD21-007型: 「以下の５つから１つを選ぶ。…対象のシグニ１体は選んだ能力を得る。あなたがベットしていた場合、この効果を１回繰り返す。」 |
| `DECLARE_NUMBER` | 35 | 33 | WD06-008, WD13-008, WDK04-006 | 数字宣言：現在はランダム値で代用 |
| `SOUL_OP` | 35 | 33 | WD21-006, WD22-016-UG, SPK06-05 | ソウル/ルリグデッキ操作 |
| `LRIG_GROW_RESTRICT` | 34 | 34 | WD20-006, WDK06-R09, WDK07-Y07 | グロウ制限：対戦相手の no_grow フラグをセット |
| `OPTIONAL_TRASH_ENERGY_CLASS` | 33 | 33 | WD14-009, WDK08-Y14, WX06-CB03 | 他の任意コスト系（SEQUENCEパターン外のフォールバック） |
| `LOOK_OPP_LIFE_TOP` | 30 | 29 | WD06-006, WD06-018, WDK09-017 | 対戦相手のライフクロス上を見る（複数枚パターン対応） |
| `TRADE_BANISH_SELF_SIGNI` | 29 | 29 | WD22-029-G, WDK08-Y01, WDK11-011 | トレード：自シグニ1体をトラッシュに置き、相手シグニ1体をバニッシュ |
| `LRIG_UNDER_CARD_OP` | 23 | 22 | WD23-022-E, WDK09-015, WDK17-015 | ルリグデッキ下操作（多パターン） |
| `GAIN_SUBSCRIBER_COUNT` | 21 | 20 | WDK16-01T, WDK16-02T, WDK16-03T | サブスクライバーカウント+1 |
| `GAIN_ABILITY_THIS_GAME` | 20 | 19 | WX08-015, WX10-011, WX24-P4-036 | ゲーム全体能力付与 |
| `GRANT_ABILITY_INNER_TEXT` | 20 | 19 | SPDi43-01, SPDi44-04, WX07-065 |  |
| `DECLARE_CARD_NAME` | 18 | 16 | PR-K046, WX11-037, WX13-048 | カード名宣言（手札のカード名から選択） |
| `LOOK_AND_REORDER` | 18 | 16 | WDK04-006, SP26-001, WX13-035 | デッキを見て並べ替え（STUB版：動的パース） |
| `COPY_LRIG_NAME_ABILITY` | 16 | 16 | WX24-P4-011, WX24-P4-012, WX24-P4-013 | カード名コピー系 COPY_LRIG_NAME_ABILITY: ルリグトラッシュのルリグ名/タイプを現在のルリグに追加 |
| `GRANT_QUOTED_ABILITY` | 16 | 15 | SPK01-11, WX22-Re04, WX24-P1-042 | 引用符付き能力付与（キーワード → keyword_grants、複合能力 → granted_effects） |
| `REVEAL_PICK_HAND_SHUFFLE_BOTTOM` | 16 | 16 | WD23-041-EA, WDK01-008, WDK13-011 | デッキ上N枚公開してM枚を手札に加え残りをデッキ下/トラッシュ/エナゾーンへ |
| `TARGET_ONLY` | 16 | 16 | SPDi37-06, PR-Di017B, WX24-P4-075 | ターゲット選択のみ（lastProcessedCards に格納し後続ステップへ） |
| `REVEAL_PICK_PLAY` | 15 | 15 | WDA-F01-08, WX13-002, WX18-028 | デッキ公開してシグニを場に出す |
| `ARTS_COST_REDUCTION_BY_CENTER_LRIG` | 14 | 14 | WX11-015, WXK05-002, WXK05-004 | アーツコスト軽減マーカー（コストはBattleScreen使用時に算出済み） |
| `CONDITIONAL_ARTS_COST` | 14 | 14 | WD06-008, WDA-F01-08, SP38-001 | 条件付きアーツコスト（コスト計算はcomputeArtsEffectiveCostで処理済み、ここでは条件確認のみ） |
| `REVEAL_AND_PICK` | 13 | 13 | WD23-024-E, WDK13-011, WDK13-017 | デッキから探してもよい（REVEAL_AND_PICK: シグニ検索→手札or場） |
| `BET_MECHANIC` | 11 | 11 | WDK05-T10, WDK06-R08, WDK12-007 | BET_MECHANIC: ①②③④選択（ベット時は強化数まで選べる） ベット可否・コイン消費はアーツ使用モーダル側（parseBetCost/is_betting_this_effect、BET_CONDITIONと共通）で 既に確定済… |
| `SONG_FRAGMENT` | 11 | 11 | SPDi47-01, SPDi47-02, SPDi47-03 | SONG_FRAGMENT: エナゾーンから【歌のカケラ】持ちカードをトラッシュに置き、その効果を発動 「このルリグはそのカードの【歌のカケラ】を使用する」= ルリグ効果として扱う |
| `ARTS_USE_DISCARD_LRIG_DECK` | 10 | 10 | WX24-P2-002, WX24-P2-004, WX24-P2-006 | アーツ使用時にルリグデッキからアーツを任意でルリグトラッシュへ |
| `LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END` | 10 | 10 | WX24-P3-001, WX24-P3-003, WX24-P3-005 | ルリグリミット修正（エナフェイズ終了まで） |
| `COUNT_BASED_DRAW_OR_POWER` | 9 | 9 | WX19-Re18, WX24-P4-103, WXDi-D07-018 | カウント基準ドロー/パワー（lastProcessedCardsの枚数だけドロー or パワー修正） |
| `GRANT_GUARD_ICON_HAND_SIGNI` | 9 | 9 | WXDi-P04-049, WXDi-P10-049, WXDi-P13-044 | 手札のシグニにガードアイコンを付与（このターン） |
| `DECK_REVEAL_UNTIL` | 8 | 8 | WDK04-006, WX17-039, WX18-028 | デッキを条件が満たされるまで公開する |
| `REMOVE_VIRUS` | 8 | 8 | WD19-001, WX15-028, WX15-040 | ウイルス除去：テキストを解析して適切な数のウイルスを取り除く |
| `TRASH_SIGNI_UNDER_FIELD_SIGNI` | 8 | 8 | WDK15-001, WDK15-007, WX22-035 | トラッシュからシグニをフィールドシグニの下に置く（ライズ補充） |
| `BET_ALTERNATIVE` | 7 | 7 | WD19-006, WD19-007, WX15-029 | BET_ALTERNATIVE: ベット強化済みなのでスキップ（BET_MECHANICで処理済み） |
| `EXILE_FROM_CHECK_ZONE` | 7 | 7 | WX14-002, WX14-014, WXEX1-46 | チェックゾーンから除外：対戦相手のチェックゾーンのカードをトラッシュへ |
| `PLACE_CARD_UNDER_SIGNI` | 7 | 7 | WX16-003, WX24-P2-056, WX24-P4-046 | シグニの下にカードを置く |
| `SUPPRESS_LIFE_BURST_ON_CRASH` | 7 | 7 | SP26-002, WX05-032, WX08-010 | ライフバースト抑制：対戦相手の suppress_life_burst フラグをセット |
| `DOUBLE_POWER_MINUS` | 6 | 6 | SPDi43-04, WX22-023, WX25-CP1-089 |  |
| `POWER_MOD_BY_HAND_COUNT` | 6 | 6 | WX12-013, WX12-020, WX24-P2-005 |  |
| `TRASH_OWN_KEY_OPTIONAL` | 6 | 6 | SPK01-07, WXK08-010, WXK08-015 | キー１枚を任意でルリグトラッシュに置く（追加効果条件） |
| `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` | 5 | 5 | SP26-005, SP38-004, PR-Di013 | CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE 「以下のN つからM つ選ぶ。[条件]の場合、代わりにK つまで選ぶ。①...②...」 stub.value: undefined=初回, 0=ベ… |
| `DECK_TOP_TO_LIFE` | 5 | 5 | WX10-002, WXEX2-48, WXK02-035 | デッキ上をライフクロスに加える |
| `MOVE_TO_OTHER_SIGNI_ZONE` | 5 | 5 | WX14-050, WX14-052, WX14-053 | 自シグニを他の空きシグニゾーンに移動（してもよい） |
| `OPPONENT_PAY_OPTIONAL` | 5 | 5 | SPDi43-06, WXEX1-34, WXEX2-08 | 対戦相手任意コスト（相手にCHOOSEを提示し、支払うとフラグを立てる） |
| `OPTIONAL_DISCARD_CLASS_SIGNI` | 5 | 5 | WD10-006, PR-328, WX13-025 | 手札からクラスシグニを任意枚数捨てる |
| `POWER_MOD_BY_DISCARD_COUNT_HIGH` | 5 | 5 | WX24-P3-052, WX26-CP1-051, WXDi-P05-078 | 捨てた枚数基準パワー修正 |
| `POWER_MOD_PER_REVEALED` | 5 | 5 | WX25-CP1-003, WX25-CP1-061, WXDi-P00-033 | 公開したカード枚数基準パワー修正 |
| `REVEAL_CLASS_SIGNI_FROM_HAND` | 5 | 5 | WDK08-Y11, WXDi-P00-033, WXK04-034 | 手札のクラスシグニを好きな枚数公開（公開＝SELECT_TARGET、デッキに触れない） |
| `DECLARE_COLOR` | 4 | 4 | WX22-042, WXDi-P07-059, WXDi-P13-051 |  |
| `MASS_TRASH` | 4 | 4 | WX11-020, WX24-P2-026, WXDi-P05-007 | 大量トラッシュ: 相手エナ全体+相手シグニ全体、またはシグニ+キー |
| `PREVENT_DEFEAT_THIS_TURN` | 4 | 3 | SP36-001, WX25-P3-049, WXDi-P16-041 | 敗北無効フラグ |
| `PREVENT_LRIG_DAMAGE_THIS_TURN` | 4 | 4 | PR-K019, WX26-CP1-004, WX26-CP1-073 | このターンのルリグダメージ無効：ownerState に prevent_lrig_damage フラグをセット |
| `REVEAL_PICK_CLASS_TO_ENERGY` | 4 | 4 | WX12-021, WX14-041, WX15-003 | デッキ上2枚を見てクラスシグニをエナへ、残りをデッキ上へ |
| `SUPPRESS_LIFE_BURST_ON_CARD` | 4 | 4 | WX24-P1-003, WX25-P3-032, WXDi-D09-H11 | ライフバースト抑制：対戦相手の suppress_life_burst フラグをセット |
| `UNKNOWN_NESTED` | 4 | 4 | WX24-P2-060, WX24-P3-018, WXDi-P04-033 | UNKNOWN_NESTED: 自シグニを任意でトラッシュに置く（そうした場合に後続効果が発動） |
| `BANISH_FROM_GAME` | 3 | 3 | WX12-035, WX13-040, WX14-064 | ゲームから除外：トラッシュにある自シグニを任意で除外（後続効果条件） |
| `DECLARE_CLASS` | 3 | 3 | WX24-P1-035, WX25-P1-058, WXDi-P09-004 | クラス/色宣言 DECLARE_CLASS: クラスを宣言してownerState.declared_classに保存 |
| `GRANT_QUOTED_ACTIVATE_ABILITY` | 3 | 3 | WX13-058, WXDi-P09-066, WXK08-078 | GRANT_QUOTED_ACTIVATE_ABILITY: 「【起】...」付与（effectEngineのCONTINUOUS処理で対応） WXK08-078: GRANT_SIGNI_ABOVE_ABILITY+POWER_MINU… |
| `NEGATE_ATTACK_ON_TRIGGER` | 3 | 3 | WX24-P3-036, WX25-P1-TK6, WXDi-P11-055 |  |
| `OPP_CHOOSE_YOUR_HAND_DISCARD` | 3 | 3 | WD21-004, WX17-014, WXK01-013 | 対戦相手が手札を1枚選んで捨てる |
| `CRASH_LIFE_TO_HAND` | 2 | 2 | WX24-P2-048, WXDi-P07-001 | ライフクロスの一番上を手札に加える |
| `DISCARD_IF_ATTACKED_THIS_TURN` | 2 | 2 | WX12-047, WX12-048 | このターンにこのシグニがアタックしていた場合、手札を1枚捨てる |
| `DRAW_AND_PUT_HAND_TO_DECK_BOTTOM` | 2 | 2 | WX26-CP1-006, WXK10-043 | 各プレイヤーがカードを1枚引き手札を1枚デッキ下に置く |
| `EXTRA_COST_REMOVE_VIRUS` | 2 | 2 | WX16-023, WX16-048 | EXTRA_COST_REMOVE_VIRUS: ウイルスを任意数取り除いてからN+1択の効果を選ぶ |
| `HAND_TO_ENERGY_OPTIONAL` | 2 | 2 | WX14-067, WXDi-P06-076 | 手札から任意でエナゾーンに置く |
| `OPP_CHOOSE_OWN_SIGNI_TO_ENERGY` | 2 | 2 | WXDi-P12-051, WXDi-P16-077 | 対戦相手が自分のシグニを選んでエナに置く |
| `SET_NEXT_LIFE_CRASH_COUNTER` | 2 | 2 | WX25-P1-004, WXDi-P12-030 | SET_NEXT_LIFE_CRASH_COUNTER: 「次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスをクラッシュする」 防御用カウンタークラッシュをセット（WX25-P1-004 / WXDi-P12-030… |
| `TRASH_ALL_SIGNI_AND_KEY` | 2 | 2 | WX07-017, WXEX2-21 |  |
| `TRASHED_CARD_TO_HAND_OR_ENERGY` | 2 | 2 | WX24-P3-007, WX24-P3-030 | トラッシュに置かれたカードを手札かエナに |
| `VIEW_AND_DISCARD_SPELL` | 2 | 2 | WX14-038, WXDi-P16-050 | 相手の手札を見てスペルを捨てさせる |
| `ACCE_BANISH_SUBSTITUTE` | 1 | 1 | WXDi-P09-TK03A | ACCE_BANISH_SUBSTITUTE: アクセクラフトによる場離れ代替（オンタマ等） アクセされているシグニが場を離れる場合、代わりにこのアクセをゲームから除外してシグニをダウン |
| `BET_CONDITION` | 1 | 1 | WDK01-010 | BET_ALTERNATIVE: ベット強化済みなのでスキップ（BET_MECHANICで処理済み） |
| `DISCARD_IF_NO_CLASS_SIGNI` | 1 | 1 | WXDi-P07-062 | フィールドに他のクラスシグニがない場合、手札を捨てる |
| `DRAW_IF_POWER_ZERO_TEMP` | 1 | 1 | WX15-064 | DRAW_IF_POWER_ZERO_TEMP: lastProcessedCards[0]がtemp_power_mods適用後パワー0以下なら1枚引く（WX15-064型） |
| `EACH_PLAYER_DRAW_DISCARD` | 1 | 1 | WXDi-P04-010 | 各プレイヤーがカードを1枚引き、1枚捨てる |
| `HAND_NONCOLORLESS_TO_ENERGY` | 1 | 1 | WXK10-083 | 手札から無色でないカードをエナに置く |
| `MULTI_SIGNI_TO_ENERGY` | 1 | 1 | WXDi-P04-077 | 相手シグニ複数をエナに置く |
| `NON_GUARD_DISCARD_TO_ENERGY` | 1 | 1 | WX24-P2-051 | ガードアイコンなしカードを捨てたとき、そのカードをエナへ |
| `OPP_ENERGY_EXCESS_TRASH` | 1 | 1 | WXEX1-07 | 対戦相手のエナゾーンが閾値以上の場合、1枚トラッシュに |
| `OPP_GUARD_COST_COLORLESS` | 1 | 1 | WXDi-P16-059 | このターン相手はガードできない（ガードコスト無色版 or ガード禁止） |
| `OPP_HAND_TO_DECK_TOP` | 1 | 1 | WXK06-028 | 相手の手札をデッキトップに置く |
| `OPP_REVEAL_SPELL_USE_FREE` | 1 | 1 | WX04-015 | OPP_REVEAL_SPELL_USE_FREE: 対戦相手のデッキを上からスペルがめくれるまで公開し、 めくれたスペルをあなたが手札にあるかのようにコストなし・限定条件無視で使用してもよい。 残り（公開した非スペル）はデッキに戻してシ… |
| `OPP_SIGNI_TO_DECK_AND_SHUFFLE` | 1 | 1 | WXK10-006 | 相手シグニをデッキに加えてシャッフル |
| `OPP_TRASH_TO_DECK_TOP` | 1 | 1 | WXDi-P07-076 | 相手のトラッシュからカードをデッキトップに（もよい） |
| `PLACE_REV_SIGNI` | 1 | 1 | PR-Di017A | PLACE_REV_SIGNI: REVメカニクス（ライフクロス1枚以下時に指定シグニを場に出す） PR-Di017A「白熱する黒白」のREV変身効果 |
| `PREVENT_DEFEAT` | 1 | 1 | WX12-002 | 敗北無効フラグ |
| `PREVENT_DEFEAT_UNTIL_NEXT_TURN` | 1 | 1 | WXEX2-08 | 敗北無効フラグ |
| `REMOVE_VIRUS_TARGET_ZONE` | 1 | 1 | WX15-064 | REMOVE_VIRUS_TARGET_ZONE: lastProcessedCards[0]と同じゾーンのウィルスを1個除去（WX15-064型） |
| `SELF_TO_DECK_TOP` | 1 | 1 | WXDi-P02-058 | 自シグニをデッキトップに置く |
| `SKIP_MAIN_PHASE` | 1 | 1 | WXK06-078 | メインフェイズ終了 |
| `TK3_DECLARE_DISCARD` | 1 | 1 | WD03-006 | TK3_DECLARE_DISCARD: 数字を宣言し、対戦相手の手札から宣言レベルのシグニをすべて捨てさせる （WX25-P1-TK3 ダーク・アナライズ：「数字1つを宣言する。対戦相手の手札を見て、宣言した数字と同じレベルを持つすべて… |
| `TOP_TO_BOTTOM_OPTIONAL` | 1 | 1 | WXDi-P03-050 | デッキトップを見て下に置いてもよい |

### execStubPart2.ts（219 種）

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `TRAP_OPERATION` | 13 | 9 | WX15-053, WX15-083, WX16-028 | TRAP_OPERATION: トラップ/チェックゾーン操作の統合ハンドラ |
| `DESIGNATE_SIGNI_ZONE` | 11 | 11 | WDK10-009, WX08-021, WX10-051 | DESIGNATE_SIGNI_ZONE: 相手シグニゾーンを1つ指定する |
| `PLACE_TRAP_FROM_REVEALED` | 10 | 10 | WD23-032-A, WD23-040-A, SP26-001 | PLACE_TRAP_FROM_REVEALED: 前のLOOK_AND_REORDERで公開されたデッキ上N枚からトラップ設置 |
| `PLACE_SEED_FROM_REVEALED` | 8 | 8 | WDK07-Y02, WDK07-Y03, WDK07-Y04 | ─── シード系 ──────────────────────────────────────────────────────────── PLACE_SEED_FROM_REVEALED: デッキ上4枚を見て1枚を【シード】として設置 |
| `PLAY_FREE` | 8 | 8 | PR-474, WX07-014, WX14-002 | フリープレイ系：lastProcessedCards[0] のカードをコストなしでプレイ |
| `PLACE_TRAP_OPTIONAL` | 7 | 7 | WX15-084, WX15-086, WX16-015 | PLACE_TRAP_OPTIONAL / SET_HAND_CARD_AS_TRAP: 手札からトラップ設置 |
| `TRAP_OP` | 7 | 7 | WX16-061, WX17-044, WX17-062 | TRAP_OP: ソースカードのテキストに応じて操作判定 |
| `ACTIVATE_TRAP` | 6 | 5 | SP26-001, WX15-017, WX15-035 | ACTIVATE_TRAP / ACTIVATE_TRAP_IN_FIELD: トラップを表向きにしてTRAP_ICON効果を発動 |
| `CAST_FROM_OPP_TRASH` | 6 | 5 | PR-433, WX14-027, WXEX1-46 | CAST_FROM_OPP_TRASH AUTO: lastProcessedCards未設定時は相手トラッシュからスペル選択 |
| `CRAFT_TO_LRIG_DECK` | 6 | 6 | WX25-P1-034, WXDi-P14-006, WXDi-P14-007 | === バッチ9: ルリグ・条件サーチ・選択系 === CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK: クラフトをルリグデッキへ |
| `ADD_CARD_TO_LRIG_DECK_HIDDEN` | 5 | 5 | WX25-P2-017, WX25-P2-021, WXDi-P11-013 | ADD_CARD_TO_LRIG_DECK / ADD_CARD_TO_LRIG_DECK_HIDDEN: lastProcessedCards をルリグデッキに加える |
| `ARTS_IMMOVABLE` | 5 | 5 | WX25-P1-TK1, WX25-P1-TK2, WX25-P1-TK3 | アーツ条件系（engine: アーツ使用条件未実装） |
| `CONDITIONAL_CARD_COST_BY_OPP_LRIG` | 5 | 5 | WX03-002, WX03-003, WX03-004 | CONDITIONAL_CARD_COST_BY_OPP_LRIG: 対戦相手のセンタールリグ色による基本コスト軽減（実コスト軽減は支払い時に computeArtsEffectiveCost が適用済み。ここでは結果ログのみ） |
| `DECK_TOP_CHECK_LEVEL_HAND` | 5 | 5 | WX20-Re05, WX20-Re06, WXEX1-58 | デッキトップを公開してレベル一致なら手札に加える |
| `DECK_TOP_DECLARED_NUM_TRASH` | 5 | 5 | WX06-014, WX16-Re02, WXDi-P06-013 | 宣言した数だけデッキ上からトラッシュへ |
| `GAIN_EXTRA_TURN` | 5 | 5 | SP26-006, SP38-006, WX05-001 | 追加ターンを獲得（ログのみ、ゲームエンジン実装が必要） GAIN_EXTRA_TURN: 追加ターンフラグをセット（BattleScreen側でターン終了時に追加ターンを付与） |
| `SEED_BLOOM` | 5 | 4 | WDK07-Y01, WDK07-Y07, WXK04-001 | SEED_BLOOM: シード1枚（または好きな枚数）を開花する SEED_BLOOM_OPTIONAL: 任意でシード1枚を開花する |
| `TRAP_TO_HAND` | 5 | 5 | WD23-040-A, WX16-017, WX16-028 | TRAP_TO_HAND: signi_trapsのカードを手札へ（全枚または選択） |
| `CONDITIONAL_COST_REDUCTION_BY_FIELD` | 4 | 4 | WX10-031, WX12-049, WX15-034 | コスト軽減系（engine: コスト計算システム未実装） CONDITIONAL_COST_REDUCTION_BY_FIELD: フィールド条件（クラス/枚数）でコスト軽減チェック |
| `DOUBLE_OWN_POWER_MINUS` | 4 | 4 | WX24-P1-049, WX25-P2-103, WX25-CP1-070 | 自シグニパワーの2倍を全相手シグニにマイナス DOUBLE_OWN_POWER_MINUS: 対象シグニへの自分効果パワー-を2倍にする（SELECT_TARGET + フラグ設置） |
| `FLIP_FACE_DOWN_SIGNI` | 4 | 4 | WXDi-P01-040, WXDi-P05-037, WXDi-P09-009 | FLIP_FACE_DOWN_SIGNI: 裏向きシグニを表向きに戻す（"この方法で裏向きにしたシグニを表向きにする"） |
| `MAKE_SERVANT_ZERO` | 4 | 2 | WX17-005, WXDi-P11-031 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `POWER_MOD_PER_REVEALED_LEVEL` | 4 | 4 | WDK13-012, SPK01-09, WXK07-091 | 公開したシグニのレベルに基づくパワー修正（lastProcessedCards使用） |
| `REMOVE_SIGNI_ZONE` | 4 | 4 | WX25-P3-015, WXDi-P00-015, WXK03-005 | 裏向き系（face_down_signi + abilities_removed で近似実装済み） REMOVE_SIGNI_ZONE: 対戦相手のシグニゾーンを1つ削除 |
| `ADD_CRAFT_TO_LRIG_DECK` | 3 | 3 | WXDi-P16-009, WXDi-P16-010, WXDi-P16-011 | === バッチ9: ルリグ・条件サーチ・選択系 === CRAFT_TO_LRIG_DECK / ADD_CRAFT_TO_LRIG_DECK: クラフトをルリグデッキへ |
| `CHARM_CONDITIONAL_POWER` | 3 | 3 | WX07-031, WX08-032, WX25-P2-103 | CHARM_CONDITIONAL_POWER: チャームがある場合パワー修正 |
| `DECK_TOP_CHECK_LEVEL_ENERGY` | 3 | 2 | WXK04-062, WXK10-031 | デッキ上を公開し、宣言したレベルのシグニならエナゾーンへ |
| `DRAW_DISCARD_COUNT_PLUS_N` | 3 | 3 | PR-427, WXEX2-39, WXDi-P00-018 | DRAW_DISCARD_COUNT_PLUS_N: 捨てた枚数+Nドロー |
| `PLAY_SPELL_FREE_IGNORE_RESTRICTION` | 3 | 2 | WX14-014, WXEX2-14 | PLAY_SPELL_FREE_IGNORE_RESTRICTION: 手札のスペルをコストなし・限定条件無視で使用 |
| `PREVENT_ZONE_MOVE_BY_OPP` | 3 | 2 | WX19-047, WXK10-083 | PREVENT_ZONE_MOVE_BY_OPP: CONTINUOUS→collectProtectedZones動的計算 / AUTO→prevent_opp_trash_fromフラグ設置 |
| `SET_OPP_SIGNI_AS_TRAP` | 3 | 2 | WX21-003, WX21-025 | SET_OPP_SIGNI_AS_TRAP: 相手のシグニ1体をトラップとして設置 |
| `SIGNI_FLIP_FACEDOWN` | 3 | 3 | WXDi-P01-040, WXDi-P05-037, WXDi-P09-009 | SIGNI_FLIP_FACEDOWN: 自シグニ（または相手lastProcessed）を裏向きにする |
| `ABILITY_CHECK_ELSE_TRASH` | 2 | 2 | WX25-P3-069, WX25-P3-072 | ABILITY_CHECK_ELSE_TRASH: 能力なしなら自トラッシュ |
| `ARTS_USE_DISCARD_COLOR_HAND` | 2 | 2 | SP38-003, WX24-P3-006 | ARTS_USE_DISCARD_COLOR_HAND: 手札から特定色のカードを任意N枚まで捨て、コスト軽減（OPTIONAL_DISCARD_CLASS_SIGNI の色版） |
| `BANISH` | 2 | 2 | WXDi-CP01-015, WXK06-025 | === バッチ7: バニッシュ・トラッシュ・条件効果 === BANISH (STUB版): lastProcessedCards[0] か sourceCardNum をバニッシュ |
| `CONDITIONAL_ALT_POWER_BOOST` | 2 | 2 | WXK02-038, WXK10-036 | 複雑パワー修正（engine: コンテキスト/配置情報必要） CONDITIONAL_ALT_POWER_BOOST: 条件成立時に代わりにパワー修正（AUTO/ACTIVATED: temp_power_mods） |
| `CONDITIONAL_PER_TRASH` | 2 | 2 | WD08-008, WX12-037 | CONDITIONAL_PER_TRASH: トラッシュ枚数による条件（N枚以上でX） |
| `COPY_TARGET_POWER` | 2 | 2 | WXDi-P02-079, WXDi-P09-051 | COPY_TARGET_POWER: 対象シグニのパワーを自シグニの基本パワーにする |
| `ENERGY_BY_LEVEL_SUM_LIMIT` | 2 | 2 | WXK10-050, WXK11-040 | エナのカードが指定レベル合計を超えたらトラッシュ |
| `ENERGY_TO_TRASH` | 2 | 2 | WXDi-P06-069, WXDi-P11-002 | エナゾーンからカード1枚選んでトラッシュ（SELECT→INTERNAL） |
| `EXTRA_GUARD_COST_FROM_HAND` | 2 | 2 | WDK04-001, WX19-001 | ガード系（engine: ガードコスト処理未実装） |
| `FACE_DOWN_OPP_SIGNI` | 2 | 2 | WXDi-P07-010, WXDi-P09-034 | FACE_DOWN_OPP_SIGNI: 相手シグニを対象選択→裏向きにする |
| `FIELD_ENERGY_SIGNI_GAIN_COLOR` | 2 | 2 | WXDi-P06-040, WXDi-P12-010 | FIELD_ENERGY_SIGNI_GAIN_COLOR: CONTINUOUS効果はeffectEngineで処理済み（no-op） |
| `FREE_GROW_NEXT_TURN` | 2 | 2 | WX03-024, WX03-027 | FREE_GROW_NEXT_TURN: 次の自分ターンのグロウコストを0にする予約（WX03-024-BURST） |
| `GRANT_CHOSEN_ABILITY` | 2 | 2 | WXK04-002, WXK10-018 | 選んだキーワード/保護能力付与（シグニ対象・SELECT_TARGET→CHOOSEインタラクション） |
| `GROW_COST_ZERO` | 2 | 2 | WX21-017, WX21-018 | グロウコスト変更（engine: グロウコスト処理未実装） |
| `GUARD_ALTERNATIVE_COST` | 2 | 2 | WX24-P2-026, WX25-P2-007 | ガード系（engine: ガードコスト処理未実装） |
| `LAYER_ABILITY_COPY` | 2 | 2 | WX20-023, WXEX2-59 | LAYER_ABILITY_COPY: ＜怪異＞シグニのレイヤー能力を自シグニにコピー |
| `LOOK_OPP_HAND_DISCARD_SIGNI` | 2 | 2 | WX08-067, WX16-066 | 相手の手札のシグニを見て捨てさせる（宣言数字フィルタ or 有色フィルタ） |
| `LOOK_TOP_COLOR_SORT` | 2 | 2 | WX07-071, WX12-024 | LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: デッキ上N枚を確認して並べ替え |
| `OPP_ENERGY_OVERFLOW_TRASH_CONDITIONAL` | 2 | 2 | WDA-F03-13, WX24-P2-050 | 相手エナが指定数以上のとき超過分をトラッシュ |
| `OPP_SIGNI_ATTACK_POWER_RESTRICT` | 2 | 2 | WXDi-P05-031, WXDi-CP01-017 | OPP_SIGNI_ATTACK_POWER_RESTRICT: 相手シグニアタック時パワー制限 |
| `PICK_FROM_TRASHED_CARDS` | 2 | 2 | WXEX2-49, WX24-P4-034 | PICK_FROM_TRASHED_CARDS: トラッシュカードからピックして手札へ |
| `PLACE_ACCE_SIGNI_TO_ENERGY` | 2 | 2 | WX22-043, WXEX1-44 | === バッチ5: アクセ・デッキ・パワー補足 === ACCE_TO_ENERGY / PLACE_ACCE_SIGNI_TO_ENERGY: アクセカードをエナゾーンへ |
| `PLACE_SIGNI_UNDER_SELF_OPT` | 2 | 2 | WXDi-P05-034, WXDi-P11-081 | 手札からカードをこのシグニの下に置く（HAND_CARDS_UNDER_SIGNI / PLACE_SIGNI_UNDER_SELF_OPT） |
| `PLACE_SIGNI_UNDER_SIGNI` | 2 | 2 | WXDi-P05-060, WXDi-P09-078 | PLACE_SIGNI_UNDER_SIGNI: シグニをシグニ下に設置（lastProcessed→sourceCardNumのゾーン下） |
| `POWER_COPY_FROM_DOWNED` | 2 | 2 | WX25-P3-062, WXDi-P16-052 | POWER_COPY_FROM_DOWNED: ダウンしたシグニのパワーを自シグニに加算 |
| `POWER_DOUBLE_ALL` | 2 | 2 | WX04-049, WX07-029 | 全自シグニのパワーを2倍にする（現在値と同量をデルタ追加） |
| `POWER_MOD_BY_ATTACKER_LEVEL` | 2 | 1 | WXK10-084 | アタックしたシグニのレベルに基づくパワー修正 |
| `POWER_MOD_BY_FIELD_CLASS_LEVEL` | 2 | 2 | WD11-007, WX04-103 | 自場の特定クラスシグニのレベル合計に基づくパワー修正 |
| `POWER_MOD_BY_LRIG_TRASH_ARTS` | 2 | 2 | WX24-P1-049, WX25-P2-062 | ルリグトラッシュのアーツ枚数に基づくパワー修正（対象1体を先にSELECT_TARGETで選ぶ） |
| `POWER_MOD_BY_TRASH_CLASS_COUNT` | 2 | 2 | WX26-CP1-057, WXDi-CP02-060 | トラッシュの特定クラスカード枚数に基づくパワー修正 |
| `POWER_MOD_MIRROR` | 2 | 2 | WXEX1-23, WXK06-049 | POWER_MOD_MIRROR: 捨てたシグニのパワーを±として対象に適用 ・WXEX1-23文脈（lastProcessedCardsに相手シグニ）: -(捨てたパワー)を相手シグニへ ・WXK06-049文脈（自場シグニが発動源）:… |
| `PREVENT_OWN_ARTS_USE` | 2 | 2 | WD15-006, WX13-026 | PREVENT_OWN_ARTS_USE: 自分のアーツ使用封じ |
| `PREVENT_POWER_MINUS_BY_OPP` | 2 | 2 | WXDi-P07-085, WXK03-026 |  |
| `PREVENT_SIGNI_ABILITY_LOSS_BY_OPP` | 2 | 2 | WX25-P2-053, WXK10-024 |  |
| `REACTIVE_POWER_UP` | 2 | 2 | WX13-036, WXEX2-52 | REACTIVE_POWER_UP: あなたの効果で相手シグニのパワーが減ったとき、その分だけ自シグニのパワーを上げる |
| `RIDE_ON` | 2 | 1 | WXK03-022 | RIDE_ON: ルリグが乗機シグニ1体に任意でライド（ドライブ状態でない場合のみ可） |
| `SIGNI_CANT_BOUNCE_FROM_FIELD` | 2 | 2 | WX13-029, WXK05-024 |  |
| `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY` | 2 | 2 | WXDi-P10-025, WXDi-P14-008 | SIGNI_GRANT_QUOTED_CONSTANT_ABILITY: 引用常在能力を自シグニに付与（SELECT_TARGET→keyword_grants） |
| `SIGNI_SERVANT_ZERO` | 2 | 2 | WX19-002, WXDi-P07-041 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `SPECIFIC_CARD_COST_REDUCE` | 2 | 2 | WXDi-CP01-027, WXDi-CP01-048 |  |
| `SPELL_COST_REDUCTION_BY_TRASH_COUNT` | 2 | 2 | WX12-056, WXK06-055 |  |
| `TRASH` | 2 | 2 | WDA-F02-07, WDK07-E09 | TRASH (STUB版): lastProcessedCards[0] か sourceCardNum をトラッシュへ |
| `TRASH_IF_ZONE_OCCUPIED` | 2 | 2 | WXDi-P05-037, WXDi-P09-034 | ゾーンが空いているときトラッシュ（条件付き） |
| `ACCE_BANISH_SELF_TRASH` | 1 | 1 | WXK04-031 | ACCE_BANISH_SELF_TRASH: アクセを自分のトラッシュへ |
| `ACCE_COST_REDUCTION` | 1 | 1 | WX16-044 | アーツ条件系（engine: アーツ使用条件未実装） |
| `ACCE_TO_ENERGY` | 1 | 1 | WD18-009 | === バッチ5: アクセ・デッキ・パワー補足 === ACCE_TO_ENERGY / PLACE_ACCE_SIGNI_TO_ENERGY: アクセカードをエナゾーンへ |
| `ADD_CARD_TO_LRIG_DECK` | 1 | 1 | WXDi-P09-007 | ADD_CARD_TO_LRIG_DECK / ADD_CARD_TO_LRIG_DECK_HIDDEN: lastProcessedCards をルリグデッキに加える |
| `ALL_OPP_SIGNI_POWER_DOWN_HALF` | 1 | 1 | WDK15-011 | 自シグニのパワーの半分だけ全相手シグニをパワーマイナス |
| `ALL_OPP_SIGNI_SERVANT_ZERO` | 1 | 1 | WXK04-005 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `ARTS_COST_REDUCTION_BY_COST_THRESHOLD` | 1 | 1 | WDK03-014 |  |
| `ARTS_EXTRA_COST_CONDITION` | 1 | 1 | WX26-CP1-024 | ARTS_EXTRA_COST_CONDITION: 追加コスト支払い済みなら選択肢を増やす |
| `BANISH_MULTI_COLOR_SIGNI` | 1 | 1 | WXK05-030 | 複数色（2色以上）の相手シグニをバニッシュ |
| `BLOCK_OPP_ENCORE_AND_BET` | 1 | 1 | WXK08-025 | BLOCK_OPP_ENCORE_AND_BET: 相手のアンコール/ベット封じ |
| `BLOCK_OPP_ZONE_PLACEMENT` | 1 | 1 | WX10-051 | BLOCK_OPP_ZONE_PLACEMENT: 指定ゾーンへの配置を禁止（disabled_signi_zones に追加） |
| `BOTH_DISCARD_BY_CENTER_LEVEL` | 1 | 1 | WX16-016 | BOTH_DISCARD_BY_CENTER_LEVEL: 両者センタールリグのレベル分捨て |
| `CHOSEN_TO_ENERGY_OR_HAND` | 1 | 1 | WX22-050 | CHOSEN_TO_ENERGY_OR_HAND: 選んだカードをエナか手札か選択して追加 |
| `CLASS_SIGNI_TO_ENERGY` | 1 | 1 | WXK02-045 | デッキ上のクラスシグニを最大2枚選んでエナゾーンへ（LOOK_AND_REORDER後） |
| `CONDITIONAL_ADD_HAND` | 1 | 1 | WDK07-E11 | CONDITIONAL_ADD_HAND: フィールドにシグニがあれば手札に1枚追加 |
| `CONDITIONAL_DISCARD` | 1 | 1 | WD16-016 | CONDITIONAL_DISCARD: 条件付き手札捨て |
| `CONDITIONAL_FREE_GROW` | 1 | 1 | WX19-007 | グロウコスト変更（engine: グロウコスト処理未実装） |
| `CONDITIONAL_SEARCH_IF_FIELD` | 1 | 1 | WX09-041 | CONDITIONAL_SEARCH_IF_FIELD: フィールドにシグニがある場合サーチ |
| `CONDITIONAL_SEARCH_IF_RESONA` | 1 | 1 | WD09-018 | CONDITIONAL_SEARCH_IF_RESONA: フィールドにレゾナがある場合サーチ |
| `CONDITIONAL_TRASH_TO_ENERGY` | 1 | 1 | WX14-029 | 条件付きトラッシュ→エナ（センタールリグ名条件付き） |
| `COPY_ABILITY` | 1 | 1 | WXDi-P04-035 | COPY_ABILITY: このシグニはその（lastProcessed[0]の）能力を得る |
| `DECK_MILL_UNTIL_CLASS` | 1 | 1 | WXK06-050 | クラスが出るまでデッキ上からトラッシュに置く |
| `DECLARE_COLOR_COND_ENERGY_TRASH` | 1 | 1 | SPDi43-22 | 相手が宣言した色に応じてエナをトラッシュ（相手の宣言が必要→スキップ） DECLARE_COLOR_COND_ENERGY_TRASH: 色を宣言し、エナから宣言色のカードを任意でトラッシュ |
| `DISCARD_BY_POWER_MATCH` | 1 | 1 | WXK10-026 | PICK_FROM_TRASHED_CARDS の後半 / CONDITIONAL_ALTERNATE_EFFECT: 代替効果（スキップ） TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（log） … |
| `DRAW` | 1 | 1 | WXDi-P10-006 | === バッチ4: デッキ/手札/エナ操作 === DRAW: N枚ドロー |
| `DRAW_BY_CHARM_COUNT` | 1 | 1 | WX18-038 | チャーム数だけドロー |
| `ENERGY_TO_HAND_ON_DECK` | 1 | 1 | WXDi-P12-079 | エナゾーンからカードを手札へ（SELECT→INTERNAL） |
| `FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM` | 1 | 1 | WXDi-P13-071 | FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM: 凍結シグニのバニッシュをデッキ下へ |
| `FROZEN_SIGNI_TO_TRASH_ON_LEAVE` | 1 | 1 | WXEX1-30 | FROZEN_SIGNI_TO_TRASH_ON_LEAVE: 凍結状態のシグニが退場するとトラッシュへ |
| `GAIN_COIN_AND_DISCARD` | 1 | 1 | WD23-004-E | コイン獲得+手札から捨て（先頭N枚を自動捨て） |
| `GRANT_ABILITY_UNTIL_OPP_TURN` | 1 | 1 | WXDi-P07-059 | GRANT_ABILITY_UNTIL_OPP_TURN: 次の対戦相手のターン終了時まで①の能力を付与 付与先: 直前のTARGET_ONLY等でlastProcessedCardsが設定済みならそれを使う（「あなたのシグニ1体を対象と… |
| `GRANT_CHOSEN_ABILITY_FROM_PLAY` | 1 | 1 | WX22-Re04 | GRANT_CHOSEN_ABILITY_FROM_PLAY: 【出】で選んだ能力（keyword_grants記録済み）を常在で参照 このCONTINUOUS効果はexecStubではなくeffectEngine側でkeyword_gr… |
| `GRANT_CHOSEN_ABILITY_SELF` | 1 | 1 | WXK08-026 | 選んだキーワード/保護能力付与（シグニ対象・SELECT_TARGET→CHOOSEインタラクション） |
| `GRANT_LRIG_TRASH_ACTIVATE_ABILITY` | 1 | 1 | WXEX2-12 | 能力付与系（CONTINUOUS効果はeffectEngineで処理、AUTO/ACTIVATEDでも来た場合のフォールバック） GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRAS… |
| `GRANT_SIGNI_CLASS` | 1 | 1 | WX21-Re03 | GRANT_SIGNI_CLASS: このシグニに＜X＞クラスを付与 |
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
| `LEAVE_FIELD_TO_DECK_BOTTOM` | 1 | 1 | WXDi-P08-046 | 自シグニをフィールドから退場させてデッキ下へ |
| `LEVEL_MOD_PER_COUNT` | 1 | 1 | WX10-036 | レベル修正（engine: ベースレベル変更システム未実装） |
| `LIFE_TO_HAND_OPTIONAL` | 1 | 1 | WXDi-P11-040 | LIFE_TO_HAND_OPTIONAL: ライフクロス1枚を手札に加える |
| `LOOK_TOP_BY_LIFE_COUNT` | 1 | 1 | WXK02-032 | LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_N` | 1 | 1 | WDK13-022 | LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_ONE_RETURN_REST_BOTTOM` | 1 | 1 | WXDi-CP01-036 | LOOK_TOP_ONE_RETURN_REST_BOTTOM: デッキ上N枚を確認し1枚をトップ・残りをデッキ下に |
| `LOOK_TOP_SIGNI_TO_FIELD` | 1 | 1 | WXDi-P08-046 | デッキ上のシグニをフィールドへ（最初のシグニを配置） |
| `LOOK_TOP_SORT` | 1 | 1 | WXDi-P06-050 | LOOK_TOP_N / LOOK_TOP_SORT / LOOK_TOP_COLOR_SORT / LOOK_TOP_BY_LIFE_COUNT: デッキ上N枚を確認して並べ替え |
| `LOOK_TOP_SPELLS_TO_HAND` | 1 | 1 | WX10-033 | LOOK_TOP_SPELLS_TO_HAND: デッキ上N枚を確認してスペルを手札へ・残りをデッキへ |
| `LRIG_LIMIT_MODIFY` | 1 | 1 | WXDi-P16-047 | LRIG_LIMIT_MODIFY (STUB版): ルリグリミット修正 |
| `LRIG_LIMIT_UP_AND_COLOR_GAIN` | 1 | 1 | WX22-014 | LRIG_LIMIT_UP_AND_COLOR_GAIN: ルリグリミット増加（+1）と色獲得（log） |
| `LRIG_TRASH_KEY_TO_CENTER_UNDER` | 1 | 1 | WXK09-005 | LRIG_TRASH_KEY_TO_CENTER_UNDER: ルリグトラッシュのキーをセンタールリグの下に |
| `MAKE_MULTI_SERVANT_ZERO` | 1 | 1 | WXDi-P09-005 | ALL_OPP_SIGNI_SERVANT_ZERO / MAKE_SERVANT_ZERO / MAKE_MULTI_SERVANT_ZERO / SIGNI_SERVANT_ZERO: 対象シグニをサーバントZERO（WXDi-P07… |
| `MULTI_SIGNI_POWER_UP_5000` | 1 | 1 | WXK07-039 | 複数の自シグニにパワー+5000（SELECT_TARGET→INTERNAL_POWER_UP_SELECTED） |
| `NO_ABILITY_SIGNI_TO_DECK_BOTTOM` | 1 | 1 | WXEX2-30 | NO_ABILITY_SIGNI_TO_DECK_BOTTOM: 能力なしシグニをデッキ下に |
| `NON_LRIG_TO_LRIG_TRASH` | 1 | 1 | PR-469 | ルリグデッキにカードを追加（非ルリグをルリグトラッシュへ） |
| `OPP_ENERGY_COLOR_CONDITION_TRASH` | 1 | 1 | WXK09-037 | 相手エナのカード1枚を色条件でトラッシュ（相手が選択→スキップ） |
| `OPP_ENERGY_OR_DISCARD_CONDITION` | 1 | 1 | WDK10-001 | OPP_ENERGY_OR_DISCARD_CONDITION: 相手はエナゾーンかトラッシュか選択 |
| `OPP_HAND_TO_DECK_BOTTOM_IF_LESS_HAND` | 1 | 1 | WXK10-025 | 相手より手札が少ない場合、相手の手札をデッキ下へ |
| `OPP_SIGNI_LEAVE_TO_TRASH` | 1 | 1 | WXDi-P04-037 | 相手シグニが退場時にエナではなくトラッシュへ（フラグ設定） |
| `OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL` | 1 | 1 | WXK10-056 | トラッシュに置かれたシグニのレベルに基づくパワー修正（1体対象 or 全体） |
| `OPP_SIGNI_TO_DECK_BY_GATE` | 1 | 1 | WDK09-001 | 相手シグニをゲートを通じてデッキへ（バウンス） |
| `OPP_SIGNI_TO_DECK_NTH` | 1 | 1 | WDK09-012 | 相手シグニをデッキのN番目に挿入 |
| `OPP_TRASH_FIELD_SIGNI_AND_ENERGY` | 1 | 1 | WXK06-030 | 相手フィールドシグニとエナゾーンをすべてトラッシュ |
| `OPP_TRASH_TO_OPP_SIGNI_UNDER` | 1 | 1 | WXK11-069 | VIEW_AND_DISCARD_SPELL (STUB版): 手札か場のカードを見てスペルを捨てる → 手札からスペルを1枚捨てる (already implemented by batch 5 VIEW_AND_DISCARD_SPE… |
| `PLACE_LRIG_FROM_DECK_ON_TOP` | 1 | 1 | WXEX1-20 | PLACE_LRIG_FROM_DECK_ON_TOP: ルリグデッキからルリグをフィールドへ |
| `PLACE_VIRUS_CENTER` | 1 | 1 | WXEX2-79 | PLACE_VIRUS_CENTER: 相手の中央のシグニゾーンにウィルスを設置 |
| `PLAY_EFFECT_TARGET_CLASS_CHANGE` | 1 | 1 | WX14-032 |  |
| `PLAY_SPELL_FROM_HAND` | 1 | 1 | WX12-003 |  |
| `PLAY_SPELL_FROM_HAND_FREE` | 1 | 1 | WX20-059 |  |
| `POWER_BOOST_PER_SIGNI_WITH_ICON` | 1 | 1 | WX17-053 | POWER_BOOST_PER_SIGNI_WITH_ICON: キーワード持ちシグニ1体につきパワー修正 |
| `POWER_BY_ACCE_COUNT` | 1 | 1 | WX21-062 | POWER_BY_ACCE_COUNT: アクセ数×deltaをパワー修正 |
| `POWER_BY_CENTER_LRIG_TYPE_COUNT` | 1 | 1 | PR-472 | POWER_BY_CENTER_LRIG_TYPE_COUNT: センタールリグのタイプ数×deltaをパワー修正 |
| `POWER_BY_CHARM_COUNT` | 1 | 1 | WXK11-041 | 自場チャーム数に基づくパワー修正 |
| `POWER_BY_ENERGY_COLOR_VARIETY` | 1 | 1 | WXK11-063 | エナゾーンの色の種類数に基づくパワー修正 |
| `POWER_BY_LEVEL_SUM_COMPARE` | 1 | 1 | WXK10-089 | 自・相手のシグニレベル合計比較（自≦相手の場合）× levelSum → 1体相手シグニパワー修正 |
| `POWER_BY_RISE_SIGNI_COUNT` | 1 | 1 | WXK10-064 | 自場ライズシグニ数に基づくパワー修正（スタック2枚以上のシグニ） |
| `POWER_CAP` | 1 | 1 | WX22-022 | === バッチ6: パワー補足・ウィルス・条件移動 === POWER_CAP: シグニのパワーをN以下に制限 |
| `POWER_DOWN_BY_ZONE_CARD_COUNT` | 1 | 1 | WXK08-032 | シグニゾーンのカード総数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰） |
| `POWER_EQUAL_TO_SELF_POWER` | 1 | 1 | WXK02-038 | 自シグニのパワーに等しく相手シグニのパワーを設定 |
| `POWER_EQUALS_FRONT_SIGNI` | 1 | 1 | PR-K021 | 前のシグニのパワーと等しく設定（自シグニを前シグニのパワーに） |
| `POWER_MOD_BY_COLOR_VARIETY` | 1 | 1 | WXDi-D06-016 | 自場シグニの色の種類数×delta → 1体相手シグニパワー修正（SELECT_TARGET→自己再帰） |
| `POWER_MOD_BY_FRONT_LEVEL` | 1 | 1 | WXDi-P04-083 | 相手同ゾーン（前）シグニのレベルに基づくパワー修正 |
| `POWER_MOD_BY_LRIG_LEVEL` | 1 | 1 | WXK09-035 | ルリグレベルに基づくパワー修正（相手センタールリグのレベルを参照） |
| `POWER_MOD_BY_LRIG_LEVEL_SUM` | 1 | 1 | WXDi-P05-055 | ルリグレベル合計に基づくパワー修正（自分のルリグ全体のレベル合計を参照） |
| `POWER_MOD_BY_TRASHED_SIGNI_LEVEL` | 1 | 1 | WXDi-P10-009 | トラッシュしたシグニのレベル×-2000 → 1体相手シグニパワー修正（SELECT→INTERNAL） |
| `POWER_MOD_BY_UNDER_COUNT` | 1 | 1 | WXDi-P09-046 | シグニ下のカード枚数×delta → 2体まで相手シグニパワー修正（SELECT→INTERNAL） |
| `POWER_MOD_DISTRIBUTE` | 1 | 1 | WX17-021 | POWER_MOD_DISTRIBUTE: 合計パワーを選択シグニに均等配分（自場シグニ最大3体） |
| `POWER_MOD_DOUBLE_DIFF` | 1 | 1 | WX24-P4-054 | POWER_MOD_DOUBLE_DIFF: 対象シグニの基本パワーと自分の基本パワーとの差の2倍でマイナス |
| `POWER_MOD_ON_FRONT_PLACE` | 1 | 1 | WXDi-P03-043 | POWER_MOD_ON_FRONT_PLACE: 正面に配置された相手シグニに任意で-3000 |
| `POWER_MOD_TARGET_AND_SELF` | 1 | 1 | WXDi-P02-039 | 対象シグニと自シグニの両方にパワー修正（自場シグニを対象とする） |
| `POWER_UP_BY_DISCARDED_SIGNI_POWER` | 1 | 1 | WDK08-Y01 | 捨てたシグニのパワーだけ自場シグニ1体をパワーアップ（SELECT自場→自己再帰） |
| `PREVENT_ABILITY_CHANGE_BY_OPP` | 1 | 1 | WXEX2-49 |  |
| `PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP` | 1 | 1 | WXK06-024 | PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP: 全シグニの相手パワーマイナス防止（effectEngineで動的処理） |
| `PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE` | 1 | 1 | WXK01-003 | PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE: 次の相手ATKフェイズ開始時、このシグニはアタック不可 |
| `PREVENT_BOUNCE_AND_DOWN_BY_OPP` | 1 | 1 | WXK08-024 |  |
| `PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP` | 1 | 1 | WX19-046 | PREVENT_LOW_LEVEL_LRIG_DAMAGE / PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: ルリグダメージ無効フラグ |
| `PREVENT_DAMAGE_FROM_OPP_EFFECTS` | 1 | 1 | WXK03-011 | PREVENT_LOW_LEVEL_LRIG_DAMAGE / PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: ルリグダメージ無効フラグ |
| `PREVENT_DAMAGE_UNTIL_OPP_TURN_END` | 1 | 1 | WXEX2-06 | ルリグダメージ無効フラグを設定 |
| `PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN` | 1 | 1 | WXDi-P09-008 | PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN: 相手の次ターン最初のダメージを無効 |
| `PREVENT_INFECTED_SIGNI_ACTIVATE` | 1 | 1 | WXEX1-51 |  |
| `PREVENT_LOW_LEVEL_LRIG_DAMAGE` | 1 | 1 | WXK11-012 | PREVENT_LOW_LEVEL_LRIG_DAMAGE / PREVENT_DAMAGE_FROM_OPP_EFFECTS / PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP: ルリグダメージ無効フラグ |
| `PREVENT_LRIG_DAMAGE` | 1 | 1 | WXK03-001 | ルリグダメージ無効フラグを設定 |
| `PREVENT_LRIG_DAMAGE_UNTIL_NEXT_TURN` | 1 | 1 | WXK10-019 |  |
| `PREVENT_NON_FIELD_MOVE_BY_OPP` | 1 | 1 | WXEX2-22 |  |
| `PREVENT_OPP_POWER_PLUS` | 1 | 1 | WXDi-P14-048 |  |
| `PREVENT_OPP_SIGNI_ABILITY_GAIN` | 1 | 1 | WX14-023 |  |
| `PREVENT_SELF_MOVE_BY_OPP_EXCEPT_BANISH` | 1 | 1 | WXK11-026 |  |
| `PREVENT_SIGNI_DOWN_BY_OPP` | 1 | 1 | WX13-029 |  |
| `PREVENT_SIGNI_DOWN_BY_OPP_ALL` | 1 | 1 | WX20-025 | PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止 |
| `PREVENT_SIGNI_MOVE_BY_OPP_EXCEPT_BANISH` | 1 | 1 | WXK07-031 | 保護・移動防止系（engine: 各防止フラグシステム未実装） |
| `PREVENT_TARGET_LRIG_ATTACK_THIS_TURN` | 1 | 1 | WX09-Re03 | PREVENT_TARGET_LRIG_ATTACK_THIS_TURN: このターン対象ルリグのアタックを防ぐ |
| `REDUCE_PLAY_ABILITY_COST` | 1 | 1 | WXK04-075 | REDUCE_PLAY_ABILITY_COST: 次の【出】能力コストを軽減 |
| `REMOVE_OPP_MULTI_ENA` | 1 | 1 | WX19-002 | OPP_TRASH_TO_DECK_TOP は line 1211 の handler で処理済み（dead code 削除） REMOVE_OPP_MULTI_ENA / REMOVE_OPP_MULTI_ENA_ONLY: 相手の複数… |
| `REMOVE_OPP_MULTI_ENA_ONLY` | 1 | 1 | WXK03-002 | OPP_TRASH_TO_DECK_TOP は line 1211 の handler で処理済み（dead code 削除） REMOVE_OPP_MULTI_ENA / REMOVE_OPP_MULTI_ENA_ONLY: 相手の複数… |
| `REVEALED_CARD_COLOR_DISCARD` | 1 | 1 | WX24-P4-105 | REVEALED_CARD_COLOR_DISCARD: 公開カードの色と同じ色の手札カードを捨てる |
| `RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY` | 1 | 1 | WX20-056 | RISE_TARGET_SIGNI_GAIN_CONSTANT_ABILITY: ライズ対象シグニに引用常在能力を付与 |
| `SEED_BLOOM_OPTIONAL` | 1 | 1 | WXK10-059 | SEED_BLOOM: シード1枚（または好きな枚数）を開花する SEED_BLOOM_OPTIONAL: 任意でシード1枚を開花する |
| `SEED_FLOWER_OP` | 1 | 1 | WXK05-050 | SEED_FLOWER_OP: 別シード1枚を開花してデッキ上をシード設置（ヤマレンゲ系） |
| `SEED_HAND_AND_BLOOM_FROM_DECK_TOP` | 1 | 1 | WDK07-Y20 | SEED_HAND_AND_BLOOM_FROM_DECK_TOP: シード1枚を手札に加え、デッキ上をシード設置 |
| `SELF_TRASH_IF_NO_OPP_VIRUS` | 1 | 1 | WX20-030 | SELF_TRASH_IF_NO_OPP_VIRUS: 相手にウィルスがなければ自トラッシュ |
| `SET_HAND_CARD_AS_TRAP` | 1 | 1 | WX21-057 | PLACE_TRAP_OPTIONAL / SET_HAND_CARD_AS_TRAP: 手札からトラップ設置 |
| `SET_LEVEL_RANGE` | 1 | 1 | WX19-065 | SET_LEVEL_RANGE: 自シグニ1体を選んでレベル1～4に変更（ターン終了時まで） |
| `SET_OPP_SIGNI_POWER_BY_SELF_POWER` | 1 | 1 | WXK11-043 | 自パワーに合わせて相手シグニのパワーを設定 |
| `SHUFFLE_DECK_POWER_HALF` | 1 | 1 | WXK10-051 | シャッフル後に全シグニのパワーを半減 |
| `SIGNI_GRANT_CHOSEN_ABILITY` | 1 | 1 | WXK09-050 |  |
| `SIGNI_PROTECT_MOVE_EXCEPT_ENERGY` | 1 | 1 | WXDi-P03-043 |  |
| `SUPPRESS_GAIN_ABILITY` | 1 | 1 | WX13-029 |  |
| `SUPPRESS_LIFEBURST_COLOR_CONDITION` | 1 | 1 | WX25-P3-003 | 色条件によるライフバースト抑制（相手に suppress_life_burst フラグ） |
| `TRADE_SELF_AND_OPP_TO_ENERGY` | 1 | 1 | WXDi-P14-064 | 自・相手を両方エナへ（ゾーン交換系） |
| `TRAP_TO_SIGNI_IF_ZONE_EMPTY` | 1 | 1 | WXEX1-67 | TRAP_TO_SIGNI_IF_ZONE_EMPTY: このカードのゾーンにシグニがない場合、signi_traps[zone]→signi[zone] |
| `TRASH_ALL_BY_NAME_FROM_FIELD_AND_ENERGY` | 1 | 1 | WXEX2-10 | フィールドの全シグニの名前が一致するカードをエナ・フィールドからトラッシュ |
| `TRASH_ALL_OPP_CARDS` | 1 | 1 | WXK11-047 | TRASH_ALL_OPP_CARDS: 相手エナから名前一致カードをすべてトラッシュへ |
| `TRASH_CLASS_TO_HAND_OR_ENERGY` | 1 | 1 | WX26-CP1-022 | トラッシュからクラスシグニを手札かエナへ選択 |
| `TRASH_FROM_DECK_PER_SIGNI_LEVEL` | 1 | 1 | WXK02-004 | 自場シグニのレベル合計枚数をデッキ上からトラッシュ |
| `TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH` | 1 | 1 | WXEX1-19 | トラッシュから3ゾーンへ分配（lastProcessedCards→各ゾーンへ） TRIPLE_ZONE_DISTRIBUTE_FROM_TRASH: トラッシュから3枚選んでエナ/手札/デッキ下に分配 |
| `UNDER_SIGNI_TO_ENERGY` | 1 | 1 | WXDi-P07-080 | シグニの下のカードをエナゾーンに置く |
| `UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS` | 1 | 1 | WX25-P1-089 | UNDER_SIGNI_TO_ENERGY: シグニ下カードをエナゾーンへ UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS: ソースシグニの下のカードを対象とし、エナに同クラスがなければエナへ |
| `USE_SPELL_FROM_TRASH` | 1 | 1 | WXDi-P06-066 |  |

### execStubPart3.ts（215 種）

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `TRASH_AT_TURN_END` | 13 | 12 | WX02-005, WX03-047, WX13-002 | TRASH_AT_TURN_END: ターン終了時にlastProcessedCardsのシグニをフィールドからトラッシュに置く（WX02-005 ホワイト・ホープ） |
| `SUMMON_RESONA_FROM_LRIG_DECK` | 11 | 11 | WD12-007, WD23-001-E, WX07-050 | SUMMON_RESONA_FROM_LRIG_DECK: ルリグデッキからレゾナ1枚を出現条件を無視して場に出す（WX20-069等） |
| `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` | 10 | 10 | WD22-011-G, WD23-012-A, WX11-017 | CONDITIONAL_MULTI_CHOOSE_BY_CENTER: センタールリグによる複数選択 |
| `GUARD_EXTRA_COST_BY_OPP` | 9 | 9 | WX24-P2-047, WX25-P2-001, WX24-D1-05 |  |
| `ACCE_FROM_HAND` | 8 | 8 | WDK07-E15, SP27-015, WX16-074 | === バッチ12: アクセ・シグニ配置・能力付与・無効系 === ACCE_FROM_HAND: 手札のアクセカードを自分のシグニに付ける |
| `DO_THREE_THINGS` | 8 | 8 | WX24-P4-002, WX24-P4-007, WXK11-002 | DO_THREE_THINGS: 3〜4つの処理を動的解析して実行 |
| `LEVEL_REFERENCE_OVERRIDE` | 8 | 8 | WD21-012, WX17-059, WX17-061 |  |
| `DOWN_UP_SIGNI_AND_CHOOSE` | 7 | 7 | SPDi43-23, WX06-024, WX07-024 | DOWN_UP_SIGNI_AND_CHOOSE: シグニをダウン/アップして選択 DOWN_UP_SIGNI_AND_CHOOSE: アップ状態の特定クラスシグニを好きな数ダウン（コスト軽減素材） |
| `LOSE_COLOR_ALL_ZONES` | 7 | 7 | WXDi-P16-086, WXDi-P16-087, WXDi-P16-088 | LOSE_COLOR_ALL_ZONES: CONTINUOUS効果（effectEngine.collectColorlessOverridesで動的計算） |
| `PLACE_LIMIT_UPPER` | 7 | 7 | WX24-P1-031, WX24-P2-041, WX24-P4-036 | PLACE_LIMIT_UPPER: 【リミットアッパー】トークンをルリグゾーンに置く（1つまで） トークン効果（ルリグ1体かつレベル3以上でリミット+2）はBattleScreenのリミット計算側で適用 |
| `CHOOSE_N_FROM_LIST` | 6 | 6 | WX13-003, WXEX2-44, WXDi-P06-050 | CHOOSE_N_FROM_LIST: 以下の①②③④からN個選択して実行 |
| `COLLAB` | 6 | 5 | WXDi-CP01-004, WXDi-CP01-005, WXDi-CP01-006 | COLLAB: コラボ効果 |
| `GAIN_LRIG_BARRIER` | 6 | 6 | SPDi43-26, WX24-P3-026, WX24-P4-013 | GAIN_LRIG_BARRIER: 【ルリグバリア】を得る（フリーゾーンにトークンとして設置。ルリグアタック1回を無効） |
| `BANISH_TO_LRIG_TRASH_INSTEAD` | 5 | 5 | WX10-008, WX10-020, WX10-024 |  |
| `CHOOSE_COLOR_FROM_LIST` | 5 | 4 | WX10-025, WX11-074, WX11-077 | CHOOSE_COLOR_FROM_LIST / CHOOSE_SAME_OPTION_TWICE / CHOOSE_SAME_OPTION_MULTIPLE CHOOSE_COLOR_FROM_LIST: エナゾーンの色から選ぶ（最大N… |
| `OPEN_MAGIC_BOX` | 5 | 5 | WX24-P3-050, WX24-P3-066, WX24-P3-069 | OPEN_MAGIC_BOX: このシグニと同ゾーンのMBを表向きにしてトラッシュへ（任意） |
| `REPEAT_N_TIMES` | 5 | 5 | WX25-P3-028, WXDi-P07-007, WXDi-P08-007 | REPEAT_N_TIMES / REPEAT_EFFECT: 以下をN回繰り返す |
| `CHOOSE_HAND_OR_ENERGY` | 4 | 4 | WX24-P1-025, WX24-P2-042, WXDi-CP01-004 | CHOOSE_HAND_OR_ENERGY: デッキ上N枚から任意枚数を手札に加え、残りをエナへ（LOOK_AND_REORDER後） |
| `CLASS_CHANGE` | 4 | 4 | WX21-049, WXEX2-06, WX25-P1-058 | CLASS_CHANGE: シグニのクラスを一時変更 |
| `EFFECT_LIMIT` | 4 | 4 | WDK06-C17, WX13-053, WX21-066 | EFFECT_LIMIT: 連続効果の上限枚数をキャップ（直前のパワー修正を上限値でキャップ） |
| `OPP_DECLARE_CHOICE` | 4 | 4 | PR-K060, WX05-006, WX16-Re17 | OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 相手が①②から選ぶ |
| `CHOOSE_HAND_CARD` | 3 | 3 | PR-K060, WX05-006, WX16-Re17 | CHOOSE_HAND_CARD: 手札から1枚選択（lastProcessedCardsに設定） |
| `CHOOSE_SAME_OPTION_TWICE` | 3 | 3 | WX17-003, WXDi-P16-TK01, WXK05-010 |  |
| `COPY_LRIG_TRASH_ACTIVATED` | 3 | 3 | WX05-002, WX05-003, WX05-004 |  |
| `DECLARE_NUMBER_RANGE` | 3 | 3 | WXDi-P06-013, WXK03-076, WXK10-052 | DECLARE_NUMBER_RANGE: 0〜5の数字宣言（DECLARE_NUMBERと同様だが0を含む） |
| `DEPLOY_RESTRICT` | 3 | 3 | WXDi-P11-050, WXDi-P15-039, WXK09-015 | DEPLOY_RESTRICT: 配置制限（CONTINUOUSは動的処理、AUTOはフラグ設置） |
| `DISCARD_OR_PENALTY` | 3 | 3 | WX04-047, WX24-P3-079, WXDi-P14-023 | DISCARD_OR_PENALTY: 特定カード1枚捨てるかペナルティ（N枚捨て）を選ぶ |
| `FORCE_TARGET_SELF` | 3 | 3 | WX25-CP1-060, WXDi-P03-053, WXDi-P11-040 | FORCE_TARGET_SELF: このシグニしか対象にできない（ログのみ） |
| `GAIN_SIGNI_BARRIER` | 3 | 3 | SPDi43-23, WXDi-P12-006, WXDi-P15-003 | GAIN_SIGNI_BARRIER: 【シグニバリア】を得る（フリーゾーンにトークンとして設置。相手シグニからのダメージ1回を無効） |
| `GATE` | 3 | 2 | WDK09-001, WDK09-006 | GATE: ゲート効果（ログのみ） GATE: 相手のシグニゾーン1つに【ゲート】を設置（次のアタックフェイズに条件付きでアタック不可） |
| `HAND_SIZE_INCREASE` | 3 | 3 | WD23-001-E, WX19-003, WX25-P2-005 | 手札上限増加（CONTINUOUS：シグニがフィールドにある間） HAND_SIZE_INCREASE: 手札上限を増やす / REDUCE_OPP_HAND_LIMIT: 相手の手札上限を減らす |
| `LIMIT_OPP_DRAW_COUNT` | 3 | 3 | WXEX1-10, WXDi-P12-008, WXK06-004 | ドロー枚数制限（次のターン） |
| `MOVE_TO_ATTACKER_FRONT` | 3 | 3 | WX04-029, WXDi-D06-012, WXDi-P02-052 | MOVE_TO_ATTACKER_FRONT: 相手シグニアタック時、正面が空なら自分をそのアタッカーの正面ゾーンに移動（してもよい）。実装済み（stub.value 優先、なければ attacked_signi_ids から動的特定） |
| `PLACE_OWN_GATE` | 3 | 3 | WXDi-P15-003, WXDi-P15-010, WXDi-P15-011 | PLACE_OWN_GATE: あなたのシグニゾーン1つにTHE DOOR【ゲート】を置く（own_gate_zones）。 signi_gate_zones（相手ゾーンのアタック妨害ゲート）とは別概念。THE DOORシグニが参照する自… |
| `REVEAL_TOP_CONDITIONAL_ROUTE` | 3 | 3 | WX08-025, WX10-030, WXK05-021 | REVEAL_TOP_CONDITIONAL_ROUTE: デッキ上を公開しレベル条件で分岐 |
| `SIGNI_REPOSITION` | 3 | 3 | WXEX2-04, WX24-P2-089, WXDi-CP02-095 | SIGNI_REPOSITION: シグニを別のゾーンに移動（自or相手、1体 or 全体） MOVE_TARGET_SIGNI_TO_OTHER_ZONE: 対象の自シグニを他のシグニゾーンへ移動（同処理） |
| `TRIGGER_LIFE_BURST` | 3 | 3 | WX13-032, WXEX1-11, WXEX2-13 | TRIGGER_LIFE_BURST: lastProcessedCards[0] のLBを発動（field.checkにセット） |
| `ACCE_OP` | 2 | 2 | WD18-009, SP27-015 | ACCE_OP: アクセ操作（汎用ログ） |
| `ARTS_SELF_RECYCLE_ON_TRIGGER` | 2 | 2 | WX10-015, WX10-027 | ARTS_SELF_RECYCLE_ON_TRIGGER: ルリグトラッシュのアーツがトリガー時に自己回収 |
| `ATTACK_PHASE_LEVEL_OVERRIDE` | 2 | 2 | WX21-029, WXEX2-47 | ダメージ特殊（engine: ダメージ処理拡張必要） |
| `CENTER_LRIG_DISMOUNT` | 2 | 2 | WXK03-036, WXK10-063 | CENTER_LRIG_DISMOUNT: センタールリグがすべての乗機シグニから降りる（ドライブ解除・任意） |
| `COIN_USE_RESTRICTION` | 2 | 2 | WXDi-P15-008, WXDi-P15-009 | COIN_USE_RESTRICTION: コイン使用先をスペルとシグニに限定（ゲーム中永続） |
| `COPY_SIGNI` | 2 | 2 | WX17-001, WXK04-005 | COPY_SIGNI: 自フィールドシグニ1体をトラッシュのシグニと同じカードにする（ターン終了時まで） |
| `DISONA_RESTRICTION` | 2 | 1 | WXDi-P12-075 | DISONA_RESTRICTION: 「このターン、あなたは《ディソナアイコン》ではないスペルを使用できない」 （使用条件側「すでに非ディソナスペルを使用していた場合は使用不可」はeffect.conditionで判定済み） |
| `HAND_REVEAL_CLASS_SIGNI` | 2 | 2 | WX05-030, WX06-019 | HAND_REVEAL_CLASS_SIGNI: 手札のクラスシグニを選択して公開（SELECT_TARGET） |
| `INHERIT_OPP_LRIG_TYPE` | 2 | 2 | WDK17-001, WXEX2-23 |  |
| `LIFE_BURST_DOUBLE` | 2 | 2 | WD23-006-E, WXDi-P12-035 | ライフバースト特殊（engine: 発動システム改修必要） LIFE_BURST_DOUBLE: このターン、次のライフバーストは2回発動する |
| `MOVE_TARGET_SIGNI_TO_OTHER_ZONE` | 2 | 2 | WXDi-P00-015, WXDi-P00-068 | SIGNI_REPOSITION: シグニを別のゾーンに移動（自or相手、1体 or 全体） MOVE_TARGET_SIGNI_TO_OTHER_ZONE: 対象の自シグニを他のシグニゾーンへ移動（同処理） |
| `MULTI_ZONE_ATTACK` | 2 | 2 | WX15-037, WXK04-070 |  |
| `NEGATE_NTH_ATTACK` | 2 | 2 | SP27-016, WX17-006 | NEGATE_NTH_ATTACK: このターン、相手シグニのアタックをN回目まで自動無効化 |
| `ONE_ATTACK_PER_TURN` | 2 | 2 | WXDi-P11-071, WXDi-P12-078 | アタック制限系（engine: アタック制限システム未実装） |
| `OPP_DECLARE_COLOR` | 2 | 2 | WXEX1-07, WXK09-037 | OPP_DECLARE_COLOR: 相手が色を宣言（5色CHOOSE opponentResponds→INTERNAL_SET_OPP_DECLARED_COLOR） |
| `OPP_DRAW_LIMIT` | 2 | 2 | WXDi-P05-039, WXDi-P16-005 | OPP_DRAW_LIMIT: 対戦相手のターン開始時、そのターンのドローを1枚に制限（triggerScope: any_opp で相手ターン発動） |
| `OPP_MAIN_PHASE_LIMIT_DOWN` | 2 | 2 | WX25-P2-014, WXDi-P13-029 | OPP_MAIN_PHASE_LIMIT_DOWN: 次の相手メインフェイズの間、センタールリグのリミット-2 |
| `OPP_SIGNI_ATTACK_COST` | 2 | 2 | WX22-Re20, WXEX1-04 | OPP_SIGNI_ATTACK_COST: ターン終了時まで、相手シグニのアタックに《無》×2コスト |
| `OPP_ZONE_PLACEMENT_RESTRICT` | 2 | 2 | WXDi-P14-068, WXDi-P11-TK01 | OPP_ZONE_PLACEMENT_RESTRICT: CONTINUOUS効果（effectEngineで動的判定） |
| `PEEP_HAND` | 2 | 2 | PR-K070, WX24-P4-105 | PEEP_HAND: 相手の手札を覗き見（ログに枚数と名前を表示） |
| `PLACE_MAGIC_BOX` | 2 | 2 | WX24-P3-089, WX24-P4-064 | PLACE_MAGIC_BOX: lastProcessedCards[0]のカードをMBとして設置（ゾーン選択→INTERNAL_SET_MAGIC_BOX） |
| `REPEAT_EFFECT` | 2 | 2 | WX16-042, WX22-016 | REPEAT_N_TIMES / REPEAT_EFFECT: 以下をN回繰り返す |
| `REVEAL_OPP_HAND_CARD` | 2 | 2 | PR-459A, WXDi-P14-060 | REVEAL_OPP_HAND_CARD: 相手の手札のカードを1枚公開 |
| `SWAP_OPTIONAL` | 2 | 2 | WX13-073, WXDi-P10-047 | SIGNI_REPOSITION: シグニを別のゾーンに移動（自or相手、1体 or 全体） MOVE_TARGET_SIGNI_TO_OTHER_ZONE: 対象の自シグニを他のシグニゾーンへ移動（同処理） |
| `TARGET_OPP_SIGNI_ONLY` | 2 | 1 | WXDi-P01-028 | TARGET_OPP_SIGNI_ONLY: 「対戦相手のシグニ１体を対象とする。対戦相手は手札を２枚捨てないかぎり、それをデッキの一番下に置く。」 対象選択→対戦相手が手札2枚を捨てて回避するか、シグニがデッキの一番下に送られるかを選ぶ… |
| `UPKEEP_OR_NO_UP` | 2 | 2 | WXDi-P06-002, WXDi-P13-075 | UPKEEP_OR_NO_UP: 次の相手UPフェーズに条件未達でセンタールリグをアップさせない |
| `USE_CONDITION_ARTS_USED` | 2 | 2 | WD15-006, WD20-008 | USE_CONDITION_ARTS_USED: このターンにアーツを使用していた場合、このカードは使用不可 actions_done に 'USE_ARTS' が含まれるかチェック（BattleScreenがartsUse時に追加） |
| `ACCE_FROM_TRASH` | 1 | 1 | WDK07-E11 | ACCE_FROM_TRASH: トラッシュのアクセカードを自分のシグニに付ける |
| `ACCE_SIGNI_ALL_COLOR` | 1 | 1 | WX22-043 | ACCE_SIGNI_ALL_COLOR: アクセ中のシグニを全色にする |
| `ACCE_SIGNI_GRANT_ABILITY` | 1 | 1 | WX21-041 | ACCE_SIGNI_GRANT_ABILITY: アクセ中のシグニにキーワード能力を付与 |
| `ACTIVATE_COST_ZERO_BLACK` | 1 | 1 | WD08-001 | ACTIVATE_COST_ZERO_BLACK: トラッシュのシグニを選択→次の起動コストを《黒×0》に |
| `ACTIVATE_EICHI_ABILITY` | 1 | 1 | WXEX1-18 | ACTIVATE_EICHI_ABILITY: コイン能力でこのシグニの【出】効果を再発動 |
| `ADD_RESONANCE_CONDITION` | 1 | 1 | WX20-052 | ADD_RESONANCE_CONDITION: ルリグデッキのレゾナにアタックフェイズタイミングを追加（effectEngineで処理） |
| `ADJACENT_SIGNI_POWER_MOD` | 1 | 1 | WXK01-060 | ADJACENT_SIGNI_POWER_MOD: このシグニと隣接するシグニ最大2体のパワーを修正 |
| `ADJACENT_ZONE_ATTACK` | 1 | 1 | WD20-009 |  |
| `ALL_CARDS_COLOR_CHANGE_BLACK` | 1 | 1 | WXK07-005 | ALL_CARDS_COLOR_CHANGE_BLACK: CONTINUOUS→effectEngine.hasAllCardsColorBlackで動的処理済み |
| `ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE` | 1 | 1 | PR-471 | ALL_CENTER_LRIG_GAIN_TYPE_GAME_WIDE: ゲーム全体ルリグタイプ付与（effectEngine lrig_gained_types参照） |
| `ALL_CLASS` | 1 | 1 | WX21-021 | ALL_CLASS: CONTINUOUS→effectEngine.collectAllClassSigniで動的処理済み |
| `ALL_COLOR` | 1 | 1 | WXK05-029 | ALL_COLOR: CONTINUOUS→effectEngine.collectAllColorSigniで動的処理済み |
| `ALL_PLAYER_MILL` | 1 | 1 | WX22-017 | ALL_PLAYER_MILL: 各プレイヤーがデッキ上N枚をトラッシュ |
| `ALL_ZONE_BLACK` | 1 | 1 | WDA-F02-17 | ALL_ZONE_BLACK: CONTINUOUS→effectEngine.collectAllZoneBlackCardNumsで動的処理済み |
| `ALLOW_ATTACK_WHILE_DRIVE` | 1 | 1 | WXEX2-11 |  |
| `ARTS_COLORLESS_MUST_PAY_CENTER_COLOR` | 1 | 1 | WX16-006 |  |
| `ATTACK_COUNT_BY_POWER` | 1 | 1 | WX22-022 |  |
| `BANISH_BY_SELF_GOES_TO_TRASH` | 1 | 1 | WXK06-049 | BANISH_BY_SELF_GOES_TO_TRASH: このシグニによるバニッシュはエナでなくトラッシュへ |
| `BANISH_REDIRECT_POWER0_TRASH` | 1 | 1 | WX04-038 | BANISH_REDIRECT_POWER0_TRASH: このターン、パワー0以下のシグニがバニッシュされる場合エナの代わりにトラッシュへ（所有者問わず。WX04-038-E1） |
| `BANISH_REDIRECT_TO_HAND` | 1 | 1 | WXDi-P13-045 | BANISH_REDIRECT_TO_HAND: このターン、対戦相手のシグニがバニッシュされる場合エナゾーンではなく手札に戻る |
| `BANISH_SUBSTITUTE_RISE_STACK` | 1 | 1 | WX22-034 |  |
| `BANISH_THRESHOLD_BOOST_7_15` | 1 | 1 | WX09-027 | BANISH_THRESHOLD_BOOST_7_15: WX09-027(オリハルティア)の常在マーカー。 実体は execBanish が自場のオリハルティア存在を検出して 7000→15000 に書き換える（no-op） |
| `BATTLE_BANISH_LIFE_BURST` | 1 | 1 | WXEX2-40 | BATTLE_BANISH_LIFE_BURST: バトルバニッシュ後に相手側LBを発動 |
| `BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY` | 1 | 1 | WXDi-P06-034 | BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY: バニッシュ代わりにダウン＋下1枚＋エナ1枚トラッシュ（WXDi-P06-034・BattleScreen側処理） |
| `BATTLE_LEAVE_REPLACE_WITH_DOWN` | 1 | 1 | WXDi-CP02-TK01A | BATTLE_LEAVE_REPLACE_WITH_DOWN: バトル・相手効果による場離れをダウンに置換（任意）（BattleScreen側処理） |
| `BATTLE_LEAVE_REPLACE_WITH_EXILE` | 1 | 1 | WXK05-024 | BATTLE_LEAVE_REPLACE_WITH_EXILE: 場を離れる代わりにゲームから除外（≈トラッシュ近似・WXK05-024・BattleScreen側処理） |
| `BEAT_ZONE_OP` | 1 | 1 | WXK08-029 | BEAT_ZONE_OP: ビートゾーン操作（「【ビート】にする」または「【ビート】がN枚以下」条件チェック） |
| `BLACK_RISE_PLAY_STACK_FROM_TRASH` | 1 | 1 | WDK15-001 |  |
| `BLOCK_ALL_OPP_ACTIVATE_ABILITY` | 1 | 1 | WXEX2-54 | BLOCK_ALL_OPP_ACTIVATE_ABILITY: 全相手起動能力封じ |
| `BLOCK_COLORLESS_PLAY` | 1 | 1 | WX14-017 | BLOCK_COLORLESS_PLAY: 相手の無色プレイを封じる |
| `BLOCK_FRONT_SIGNI_ATTACK` | 1 | 1 | WXDi-P16-047 |  |
| `BLOCK_LOW_COST_SPELL_BY_CHARM_COUNT` | 1 | 1 | WX18-020 |  |
| `BLOCK_NON_WHITE_SPELL` | 1 | 1 | WXDi-P03-052 |  |
| `BLOCK_OPP_ARTS_SPELL_ACT` | 1 | 1 | WX25-P1-050 | BLOCK_OPP_ARTS_SPELL_ACT: このターン対戦相手はアーツ・スペル・起動能力を使用できない |
| `BLOCK_OPP_AUTO_ABILITY_EXTENDED` | 1 | 1 | WXDi-P13-006 | BLOCK_OPP_AUTO_ABILITY_EXTENDED: このターンと次のターン、相手シグニの【自】能力は発動しない |
| `BLOCK_OPP_DECK_TO_ENERGY` | 1 | 1 | WXK11-068 |  |
| `BLOCK_OPP_SIGNI_FIELD_PLACE_BY_SIGNI_EFFECT` | 1 | 1 | WXK11-042 |  |
| `BLOCK_OPP_SPELL_ACT_NEXT_TURN` | 1 | 1 | WXDi-P09-007 | ブロック系（engine: 行動ブロック未実装） BLOCK_OPP_SPELL_ACT_NEXT_TURN: 次の対戦相手のターン中、スペルと起動能力を使用できない |
| `CARDS_OUTSIDE_ENERGY_BECOME_WHITE` | 1 | 1 | WX08-005 |  |
| `CENTER_LRIG_COLOR_CHANGE_BLACK` | 1 | 1 | WXK03-006 |  |
| `CENTER_LRIG_RIDES_ON_SIGNI` | 1 | 1 | SPK01-01 | CENTER_LRIG_RIDES_ON_SIGNI: センタールリグが選択した1体の乗機シグニに乗る（乗り換え可） |
| `CENTER_ZONE_CONDITION` | 1 | 1 | WDK04-014 | CENTER_ZONE_CONDITION: このシグニが中央ゾーン（zone[1]）にある場合のみ続行 |
| `CHANGE_ALL_SIGNI_COLOR_TO_BLACK` | 1 | 1 | WX05-005 |  |
| `CHANGE_BASE_LEVEL` | 1 | 1 | WX19-027 | CHANGE_BASE_LEVEL: このシグニの基本レベルを1～3にしてもよい（ターン終了まで） |
| `CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN` | 1 | 1 | WXK07-032 | CHANGE_BASE_LEVEL_UNTIL_NEXT_TURN: シグニ1体の基本レベルを1にしてもよい（次の自ターン終了まで） |
| `CHANGE_EICHI_SIGNI_BASE_LEVEL` | 1 | 1 | WXEX1-71 | CHANGE_EICHI_SIGNI_BASE_LEVEL: 英知シグニを選択→基本レベルを1～3に変更（ターン終了まで） |
| `CHANGE_SIGNI_COLOR` | 1 | 1 | WX25-P3-111 | CHANGE_SIGNI_COLOR: 対象シグニの色を指定色に変更（ターン終了時まで） |
| `CHOOSE_SAME_OPTION_MULTIPLE` | 1 | 1 | WX17-003 |  |
| `COIN_SPEND_CONDITION` | 1 | 1 | WXDi-P16-083 | COIN_SPEND_CONDITION: ターン終了時にコイン消費チェック、未達時トラッシュ |
| `CONDITIONAL_ALTERNATE_EFFECT` | 1 | 1 | WD23-044-EA | CONDITIONAL_ALTERNATE_EFFECT: 条件達成時にダウン済みシグニをトラッシュへ（代替効果） |
| `CONDITIONAL_KEYWORD_BY_CENTER_COLOR` | 1 | 1 | SP27-002 | CONDITIONAL_KEYWORD_BY_CENTER_COLOR: センタールリグの色に応じてキーワード付与 |
| `CONDITIONAL_TRASH_UNDER_SIGNI` | 1 | 1 | WXDi-P16-064 | CONDITIONAL_TRASH_UNDER_SIGNI: 相手エナN枚以上の場合、シグニ下カードを任意でトラッシュ |
| `COOKING_BANISH_SUBSTITUTE` | 1 | 1 | WX17-048 |  |
| `COPY_CARD` | 1 | 1 | WX21-034 | COPY_CARD: このシグニはlastProcessed[0]のカードとレベル以外同じになる（card_identity_overrides） |
| `COST_COLOR_SELECT` | 1 | 1 | WX04-063 | COST_COLOR_SELECT（WX04-063 ゲット・ゲート）: 支払われたエナ1つにつきその色を1つ選択し、選択した「色の種類」1つにつき その色のシグニ1枚をデッキから探して公開・手札に加える（その後シャッフル）。無色は色に含… |
| `COUNT_DISTINCT_NAMES` | 1 | 1 | WX05-012 | COUNT_DISTINCT_NAMES: フィールドの異なる名称数を数えてパワー修正 |
| `CRASH_TO_TRASH_INSTEAD` | 1 | 1 | WX19-034 | CRASH_TO_TRASH_INSTEAD: このターン相手のライフクロスクラッシュ時、エナではなくトラッシュへ |
| `DECK_SIGNI_LEVEL_OVERRIDE` | 1 | 1 | WX18-065 | DECK_SIGNI_LEVEL_OVERRIDE: デッキ内指定クラスのシグニレベルをN扱い（このターン） |
| `DECLARE_NUMBER_POWER` | 1 | 1 | WXDi-P07-086 | DECLARE_NUMBER_POWER: パワー値宣言（3000〜15000）→ declared_guard_restrict_level に保存 |
| `DECLARE_ZONE_FOR_CLASS_CHANGE` | 1 | 1 | WX14-032 | DECLARE_ZONE_FOR_CLASS_CHANGE: メインデッキ/手札/シグニゾーン/トラッシュの1つを指定 指定領域にある相手シグニはクラス/色を失い＜精元＞を得る（CONTINUOUS） |
| `DEFEAT` | 1 | 1 | PR-422 | DEFEAT: 敗北処理 - ライフクロスを0にしてゲーム終了を誘発 |
| `DOUBLE_POWER_MINUS_THIS_TURN` | 1 | 1 | WX04-038 | DOUBLE_POWER_MINUS_THIS_TURN: このターン、あなたのシグニの効果で対戦相手のシグニのパワーが－される場合2倍－される（WX04-038-E1） |
| `DRIVE_SIGNI_PREVENT_DOWN` | 1 | 1 | WXK03-035 | ウェポン・プロテクション系（engine: 種族保護フラグ未実装） DRIVE_SIGNI_PREVENT_DOWN: ドライブ状態のシグニに対戦相手の効果によるダウン防止を付与 |
| `DYNAMIC_LEVEL_BY_ENERGY` | 1 | 1 | WX20-Re18 |  |
| `END_ATTACK_IF_EXTRA_TURN` | 1 | 1 | WX10-026 | END_ATTACK_IF_EXTRA_TURN: 追加ターンならアタックフェイズを終了（ATTACK_SIGNI/LRIG封じ） |
| `ENERGY_COLOR_SUBSTITUTE_TRASH` | 1 | 1 | WXK07-005 | エナ代替系（effectEngine.collectEnergyTrashSubstituteInfoで動的計算） |
| `ENERGY_LEVEL_CONDITION_CHOOSE` | 1 | 1 | WXK09-031 | ENERGY_LEVEL_CONDITION_CHOOSE: エナにレベルN以上があればCHOOSE提示 |
| `ENERGY_NON_COLORLESS_ALL_COLORS` | 1 | 1 | WX14-017 |  |
| `ENERGY_SUBSTITUTE_TRASH_KEY` | 1 | 1 | WXK02-023 |  |
| `ENERGY_SUBSTITUTE_TRASH_SIGNI` | 1 | 1 | WX16-Re06 | エナ代替系（effectEngine.collectEnergyTrashSubstituteInfoで動的計算） |
| `ENERGY_SUBSTITUTE_WHITE_TRASH_SIGNI` | 1 | 1 | SP07-011 |  |
| `FIRST_SPELL_COST_UP` | 1 | 1 | WXDi-P13-072 | コストアップ系（engine: コスト計算未実装） |
| `GAIN_ADDITIONAL_LRIG_TYPE` | 1 | 1 | WXK09-005 |  |
| `GAIN_LRIG_COLOR` | 1 | 1 | WXDi-P16-058 |  |
| `GRANT_CONDITIONAL_ASSASSIN_ABILITY` | 1 | 1 | WXK02-057 | GRANT_CONDITIONAL_ASSASSIN_ABILITY: 条件付きアサシンをkeyword_grantsに付与 |
| `GRANT_NEXT_SPELL_UNCOUNTERABLE` | 1 | 1 | WX04-008 | GRANT_NEXT_SPELL_UNCOUNTERABLE: 次に自分が使用するスペルは対戦相手の効果で打ち消されない（WX04-008 ファフニール） |
| `GRID_REVEAL_PLUS` | 1 | 1 | WX06-033 | CONDITIONAL_KEYWORD_BY_CENTER_COLOR already handled above === バッチ16: アクセ・公開・汎用選択系 === GRID_REVEAL_PLUS: このターン、デッキ公開枚数+1… |
| `GROW_FROM_LEVEL0` | 1 | 1 | PR-469 |  |
| `HASTARLIQ` | 1 | 1 | WXDi-P05-016 | HASTARLIQ: 【ハスターリク】(WXDi-P05-TK01A)を相手シグニゾーンに設置 |
| `IGNORE_LRIG_RESTRICTION_ARTS` | 1 | 1 | PR-K060 | IGNORE_LRIG_RESTRICTION_ARTS: ルリグ制限アーツを無視（ログのみ） |
| `INCREASE_ACT_ABILITY_COST` | 1 | 1 | WXDi-P06-031 | INCREASE_ACT_ABILITY_COST: 起動能力のコストを増加（ログのみ） |
| `INHERIT_UNDER_SIGNI_COLOR` | 1 | 1 | WXEX2-81 |  |
| `LEVEL_BASED_CONDITIONAL` | 1 | 1 | PR-459A | LEVEL_BASED_CONDITIONAL: 公開したシグニのレベルN枚だけ手札を捨てる |
| `LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT` | 1 | 1 | WXEX1-62 | LEVEL_REFERENCE_OVERRIDE_BY_OWN_EFFECT: このカード自身のレベル参照をLv4として扱う（デッキ/手札/トラッシュ在中） |
| `LIMIT_OPP_ATTACK_ONCE` | 1 | 1 | WD13-010 | LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限 |
| `LIMIT_OPP_SIGNI_ATTACKS_ONCE` | 1 | 1 | WX13-005A | LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限 |
| `LOOK_DECK_BOTTOM` | 1 | 1 | WXDi-P13-049 | LOOK_DECK_BOTTOM: デッキ下を1枚確認 |
| `LOOK_TOP_BOTTOM` | 1 | 1 | WXDi-P08-046 | LOOK_TOP_BOTTOM: デッキ上1枚とデッキ下1枚を確認 |
| `LOOK_TOP_OPP_CHOOSE_TRASH` | 1 | 1 | WXK11-064 | LOOK_TOP_OPP_CHOOSE_TRASH: デッキ上N枚を公開し相手が1枚選んでトラッシュ |
| `LRIG_ALL_NAMES` | 1 | 1 | WX25-P3-037 | ルリグシステム（未実装残） |
| `LRIG_GAIN_ABILITY` | 1 | 1 | PR-Di013 | ルリグシステム（未実装残） |
| `MOVE_ACCE_TO_SIGNI` | 1 | 1 | WXK05-064 | MOVE_ACCE_TO_SIGNI: アクセを別のシグニに付け替え |
| `MULTI_ACCE_FROM_HAND` | 1 | 1 | WXK11-037 | === バッチ12: アクセ・シグニ配置・能力付与・無効系 === ACCE_FROM_HAND: 手札のアクセカードを自分のシグニに付ける |
| `MULTI_ACCE_LIMIT` | 1 | 1 | WXK11-037 | MULTI_ACCE_LIMIT: アクセを特定枚数に制限（ログのみ） |
| `MULTI_DAMAGE_ON_LRIG_ATTACK` | 1 | 1 | WXK01-004 | MULTI_DAMAGE_ON_LRIG_ATTACK: このターン、ルリグアタックをN回与える（lrig_attack_remainingフラグでBattleScreen側が管理） |
| `NAMED_SIGNI_ACCE_FROM_TRASH` | 1 | 1 | WDK17-011 | ACCE_FROM_TRASH: トラッシュのアクセカードを自分のシグニに付ける |
| `NEGATE_ABILITY` | 1 | 1 | WXDi-P08-044 | NEGATE_ABILITY: 対象シグニの能力を無効化（abilities_removedに追加） |
| `NEGATE_ALL_OPP_EFFECTS` | 1 | 1 | WXK02-001 | NEGATE_ALL_OPP_EFFECTS: 相手のCONTINUOUS効果を全て無効化（all_cont_effects_negatedフラグ） |
| `NEGATE_COIN_ABILITY` | 1 | 1 | WX16-002 | NEGATE_COIN_ABILITY: コイン能力を無効化（ログのみ） |
| `NEGATE_THAT_ATTACK` | 1 | 1 | WXEX2-17 | NEGATE_THAT_ATTACK: 現在のアタックを無効化 |
| `ODD_LEVEL_SIGNI_CANT_ATTACK` | 1 | 1 | WXK03-028 | アタック制限系（engine: アタック制限システム未実装） |
| `OPP_CENTER_LRIG_LIMIT_SET_5` | 1 | 1 | WXEX1-26 | BattleScreen側処理済みSTUB（execStub呼び出し時はログのみ） |
| `OPP_CHOOSE_EFFECT` | 1 | 1 | WXK04-032 | OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 相手が①②から選ぶ |
| `OPP_CHOOSES_FOR_YOU` | 1 | 1 | WXDi-P07-007 | OPP_DECLARE_CHOICE / OPP_CHOOSE_EFFECT / OPP_CHOOSES_FOR_YOU: 相手が①②から選ぶ |
| `OPP_DIRECT_ATTACK_NEGATE` | 1 | 1 | WX04-004 | OPP_DIRECT_ATTACK_NEGATE: 相手シグニが正面なしでアタックしたとき、コスト（costColorsのエナ＋＜美巧＞シグニ1枚捨て）を 支払ってそのアタックを無効にしてもよい（WX04-004-E2）。owner=守備… |
| `OPP_DISCARD_OR_PAY_ENERGY` | 1 | 1 | WXDi-P16-091 | OPP_DISCARD_OR_PAY_ENERGY: アタックフェイズ開始時、対戦相手は《無》を支払うか手札を1枚捨てる |
| `OPP_DRAW_LIMIT_PER_TURN` | 1 | 1 | WX25-P2-TK05 | OPP_DRAW_LIMIT_PER_TURN: ドローフェイズ中の相手ドローを1枚に制限（BattleScreen側処理） |
| `OPP_LRIG_ATTACK_COST` | 1 | 1 | WX25-P2-014 | コストアップ系（engine: コスト計算未実装） |
| `OPP_RETURN_HAND_ON_SELF_BANISH` | 1 | 1 | WXK06-041 | OPP_RETURN_HAND_ON_SELF_BANISH: バニッシュされたとき、対戦相手は手札を1枚デッキの一番上に置く |
| `OPP_REVEAL_HAND_AND_LRIG_DECK` | 1 | 1 | WX15-001 | OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND: 公開ログ |
| `OPP_REVEAL_LRIG_DECK` | 1 | 1 | WXDi-P09-039 | OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND: 公開ログ |
| `OPP_REVEAL_TOP_AND_HAND` | 1 | 1 | WXDi-D09-P14 | OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND: 公開ログ |
| `OPP_SIGNI_ONE_ATTACK_TOTAL` | 1 | 1 | WXDi-P04-023 | LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE: 相手シグニ合計1回アタック制限 |
| `OPP_TRASH_LOSE_COLOR_AND_CLASS` | 1 | 1 | WXK11-026 | OPP_TRASH_LOSE_COLOR_AND_CLASS: CONT効果（effectEngineで処理） |
| `OPP_TURN_NO_ENERGY_COST` | 1 | 1 | WXDi-P03-012 | OPP_TURN_NO_ENERGY_COST: 対戦相手の次のターン中、対戦相手はエナコストを支払えない |
| `OPTIONAL_DISCARD_GUARD` | 1 | 1 | WXDi-D09-P15 | OPTIONAL_DISCARD_GUARD: 手札から任意カードを捨ててガード可能フラグを設定 |
| `OPTIONAL_HAND_REVEAL_NAMED` | 1 | 1 | WX05-038 | OPTIONAL_HAND_REVEAL_NAMED: 名称指定で手札カードを任意公開 |
| `PLACE_CHOKKIN` | 1 | 1 | WX17-034 | PLACE_CHOKKIN: sourceCardNumのゾーンに【貯菌】カウンターを+1 |
| `PLACE_DECK_TOP_UNDER_WEAPON_SIGNI` | 1 | 1 | WXK08-088 | PLACE_DECK_TOP_UNDER_WEAPON_SIGNI: ウェポンシグニの下にデッキ上を置く |
| `PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON` | 1 | 1 | WXK08-030 | PLACE_TRASH_SIGNI_UNDER_ALL_WEAPON: 全ウェポンシグニの下にトラッシュからシグニを1枚ずつ置く |
| `PREVENT_ABILITY_GAIN_BY_OPP` | 1 | 1 | WXDi-P06-057 |  |
| `PREVENT_LIFE_REFRESH_TRASH` | 1 | 1 | WXDi-P00-041 |  |
| `PREVENT_SELF_MOVE_BY_OPP` | 1 | 1 | WXDi-P07-050 |  |
| `REDIRECT_ATTACK_TO_SELF_ZONE` | 1 | 1 | WXDi-CP02-TK01A | REDIRECT_ATTACK_TO_SELF_ZONE: 相手シグニの直接アタックをこのシグニゾーンにリダイレクト（BattleScreen側処理） |
| `REDUCE_OPP_HAND_LIMIT` | 1 | 1 | WDK09-009 | 手札上限増加（CONTINUOUS：シグニがフィールドにある間） HAND_SIZE_INCREASE: 手札上限を増やす / REDUCE_OPP_HAND_LIMIT: 相手の手札上限を減らす |
| `REMOVE_SELF_SIGNI_FROM_GAME` | 1 | 1 | WXDi-CP02-TK01A | REMOVE_SELF_SIGNI_FROM_GAME: このシグニをゲームから除外する（クラフトルール適用） |
| `REPLACE_LEAVE_FIELD_WITH_TRASH_UNDER` | 1 | 1 | WXDi-P05-038 |  |
| `REPLACE_PLUS_N` | 1 | 1 | WXK10-005 | REPLACE_PLUS_N: このターン、相手シグニへの正パワー修正を負に置換 |
| `RESONANCE_COST_CARDS_TO_ENERGY` | 1 | 1 | WXEX1-16 | === バッチ11: デッキ/エナ/ドロー系 === RESONANCE_COST_CARDS_TO_ENERGY: レゾナコストカードをエナゾーンへ |
| `RESONANCE_LEAVE_SELF_TRASH_SUBSTITUTE` | 1 | 1 | WXEX2-32 |  |
| `RESTRICT_CHARMED_SIGNI_ACTIVATED` | 1 | 1 | WX08-006 |  |
| `REVEAL` | 1 | 1 | WX16-Re17 | REVEAL: デッキ上を公開（名前ログ） |
| `REVERSE_OPP_POWER_MINUS` | 1 | 1 | WXDi-P00-039 | === バッチ17: パワー反転・条件分岐・ターゲット系 === REVERSE_OPP_POWER_MINUS: 相手シグニのパワーマイナス修正を反転（プラスに） |
| `RISE_BANISH_SUBSTITUTE` | 1 | 1 | WX16-002 | ライズ/スタック系（engine: ライズシステム未実装） |
| `RISE_LEAVE_DISCARD_STACK` | 1 | 1 | WXEX2-09 | ライズ/スタック系（engine: ライズシステム未実装） |
| `SELECT_NO_COMMON_COLOR` | 1 | 1 | WX22-050 | SELECT_NO_COMMON_COLOR: 共通色なしを選択（ログのみ） SELECT_NO_COMMON_COLOR: WX22-050 エンジェル・アウェイク LOOK_AND_REORDER後のlastProcessedCard… |
| `SELECT_OTHER_SIGNI` | 1 | 1 | WXDi-P10-052 | SELECT_OTHER_SIGNI: ソース以外のシグニを選択 |
| `SIGNI_GAIN_ONE_LRIG_COLOR` | 1 | 1 | WXDi-P03-074 | SIGNI_GAIN_ONE_LRIG_COLOR: このシグニがルリグの色を1つ得る（ターン終了時まで） |
| `SIGNI_LOSE_COLOR` | 1 | 1 | WX25-P1-063 | カード属性変更系（engine: 属性変更システム未実装） SIGNI_LOSE_COLOR: 対戦相手のシグニ1体が色を失う（ターン終了時まで） |
| `SIGNI_UNDER_WEAPON_SIGNI` | 1 | 1 | WDK15-013 | SIGNI_UNDER_WEAPON_SIGNI: 自シグニ1体を自＜ウェポン＞シグニの下に置く |
| `STACK_ALL_LRIG_UNDER` | 1 | 1 | WX14-001 | STACK_ALL_LRIG_UNDER: ルリグトラッシュ全ルリグをこのカードの下に置く |
| `SUBSTITUTE_DAMAGE_WITH_SELF_TRASH` | 1 | 1 | WXDi-P08-054 | SUBSTITUTE_DAMAGE_WITH_SELF_TRASH: このシグニをトラッシュに置く代わりにダメージ無効（任意） |
| `SUMMON_FROM_ENERGY` | 1 | 1 | WXDi-P14-TK04 |  |
| `SUPPRESS_CENTER_ON_PLAY` | 1 | 1 | WX12-011 | SUPPRESS_CENTER_ON_PLAY: このターン自分のセンタールリグの【出】効果を抑制 |
| `SUPPRESS_OPP_SIGNI_ABILITIES` | 1 | 1 | SP27-016 | SUPPRESS_OPP_SIGNI_ABILITIES: 相手フィールドの全シグニの能力を消去 |
| `TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE` | 1 | 1 | WXDi-P10-033 | TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE: 相手シグニ1体を対象とし、バウンスかトラッシュを選ぶ （WXDi-P10-033: デッキ5枚公開後の条件付き選択効果） |
| `TRASH_ACCE_AT_TURN_END` | 1 | 1 | WX16-044 | TRASH_ACCE_AT_TURN_END: アクセカードをターン終了時にトラッシュ（即座に処理） TRASH_ACCE_AT_TURN_END: このシグニに付いているアクセ1枚をトラッシュへ |
| `TRASH_SIGNI_TO_BEAT` | 1 | 1 | WDK14-011 |  |
| `TRASH_SPELL_FREE_USE_LIMIT` | 1 | 1 | WX25-P2-034 | TRASH_SPELL_FREE_USE_LIMIT: トラッシュスペル無料使用制限（ログのみ） TRASH_SPELL_FREE_USE_LIMIT: トラッシュからコスト上限以下のスペルをコストなしで使用 |
| `TRIGGER_OTHER_SIGNI_EICHI_ABILITY` | 1 | 1 | PR-366 | TRIGGER_OTHER_SIGNI_EICHI_ABILITY: 他の自シグニを選択し、その英知AUTO能力を発動させる |
| `WHITE_SIGNI_ABILITY_PROTECT` | 1 | 1 | WXDi-P15-085 |  |


---

## 付録: 内部/動的生成 STUB（JSON 0 件・ハンドラのみ 253 種）

他の STUB やパーサーが実行時に動的生成する `INTERNAL_*` 系などが大半。JSON には静的には現れない。

| STUB ID | 件数 | カード数 | 代表カード | 説明 |
|---|---:|---:|---|---|
| `ACTIVATE_TRAP_IN_FIELD` | 0 | 0 |  | ACTIVATE_TRAP / ACTIVATE_TRAP_IN_FIELD: トラップを表向きにしてTRAP_ICON効果を発動 |
| `ARM_SIGNI_LRIG_PROTECTION` | 0 | 0 |  |  |
| `ATTACH_CHARM_FROM_TRASH` | 0 | 0 |  | ATTACH_CHARM_FROM_TRASH: トラッシュのシグニをチャームとして付与（ログのみ近似） |
| `ATTACH_SEARCHED_AS_ACCE` | 0 | 0 |  | ATTACH_SEARCHED_AS_ACCE: サーチしたカードを対象シグニのアクセとして付ける（手札経由近似） |
| `AWAKEN` | 0 | 0 |  | 覚醒メカニクス（ルリグ変身） |
| `BANISH_FACING_IF_SELF_POWER_GE_15000` | 0 | 0 |  | BANISH_FACING_IF_SELF_POWER_GE_15000: アタック時、自パワー15000以上なら正面相手シグニをバニッシュ（WD17-009） |
| `BANISH_IF_DISCARDED_3_THIS_TURN` | 0 | 0 |  | BANISH_IF_DISCARDED_3_THIS_TURN: このターン手札3枚以上捨てていればバニッシュ+相手エナトラッシュ（WXK03-021 ON_ATTACK_PHASE_START） |
| `BANISH_SUBSTITUTE` | 0 | 0 |  | BANISH_SUBSTITUTE (F-3): バニッシュ時の任意身代わり置換（CONTINUOUS宣言・BattleScreen側で対話処理） |
| `BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN` | 0 | 0 |  | BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN: 相手ターン中、相手はシグニを配置できない |
| `BLOOM_CHOOSE` | 0 | 0 |  | BLOOM_CHOOSE: 開花したとき選択効果（個別効果テキスト依存） |
| `BUFF_HOST_WHEN_PLACED_UNDER` | 0 | 0 |  | BUFF_HOST_WHEN_PLACED_UNDER: このカードがシグニの下に置かれたとき上のシグニ+2000（WXDi-P11-063） |
| `CHOOSE_TRAP_ZONE` | 0 | 0 |  | CHOOSE_TRAP_ZONE: 選択済みカードのゾーン選択 |
| `DECK_REVEAL_UNTIL_CLASS` | 0 | 0 |  | デッキを条件が満たされるまで公開する |
| `DECLARE_AND_MILL` | 0 | 0 |  | DECLARE_AND_MILL: effects.jsonではDECLARE_NUMBER+MILL(useDeclaredCount)に移行済み |
| `DECLARED_NAME_TO_SERVANT_ZERO` | 0 | 0 |  | DECLARED_NAME_TO_SERVANT_ZERO: declared_card_name と一致する相手のカードをサーバントZEROに（WXEX2-10） value:'field' 指定時は相手の「場」のみを対象にする（WXK… |
| `DISABLE_FIRST_ABILITY_ON_ATTACK` | 0 | 0 |  | DISABLE_FIRST_ABILITY_ON_ATTACK: アタック時最初の能力を無効化（ログのみ） |
| `DRAW_IF_CHARGED_CLASS` | 0 | 0 |  | DRAW_IF_CHARGED_CLASS: 直前のエナチャージで＜クラス＞のシグニが置かれた場合1ドロー（WDK07-E01） |
| `DRAW_IF_OPP_DISCARDED_HAND` | 0 | 0 |  | DRAW_IF_OPP_DISCARDED_HAND: 相手が手札を捨てたときドロー（トリガー系・ログのみ） |
| `DRAW_UNTIL_HAND_SIZE` | 0 | 0 |  | DRAW_UNTIL_HAND_SIZE: 手札がN枚（value、既定6）になるまで引く |
| `DRAW_UP_TO_SIX` | 0 | 0 |  | DRAW_UP_TO_SIX: 手札が6枚未満のとき、6枚になるまでカードを引く（SPK16-13E③用） |
| `DRIVE_AUTO_BANISH_ALL_OPP` | 0 | 0 |  | DRIVE_AUTO_BANISH_ALL_OPP: ドライブ自→アタック時に相手全シグニをバニッシュ（IS_DRIVE_STATEチェック付き） |
| `DRIVE_CONT_BANISH_RESIST` | 0 | 0 |  | DRIVE_CONT_BANISH_RESIST: ドライブ常→このシグニはバニッシュされない（effectEngineで処理） |
| `ENCORE` | 0 | 0 |  | アンコールメカニクス（ルリグトラッシュのアーツをコストなしで使用） |
| `EVDIVA_PER_LRIG_COLOR` | 0 | 0 |  | EVDIVA_PER_LRIG_COLOR: WX25-P3-050 エビディバ!!!!! 場の色別ルリグ数ぶんに各効果を行う。 白=【ルリグバリア】/青=ドロー3/緑=エナチャージ3/黒=相手デッキ10トラッシュ（決定的）。 赤=対象選… |
| `EXILE_SELF_AFTER_USE` | 0 | 0 |  | EXILE_SELF_AFTER_USE: 使用後このカードをゲームから除外する（近似: トラッシュへ） |
| `EXTRA_PHASE_RESTRICT` | 0 | 0 |  | その他ゾーン/レベル/フェイズ制限 |
| `FIELD_COND_DRAW_REVEAL` | 0 | 0 |  | === バッチ15: 公開・アクセ応用・条件ドロー系 === FIELD_COND_DRAW_REVEAL: フィールド条件達成時にデッキ上を公開し同クラスなら手札へ |
| `FORCE_COLOR_BLACK` | 0 | 0 |  | FORCE_COLOR_BLACK: エナゾーン以外の領域にあるシグニは黒になる（collectFieldSigniExtraColorsで処理） |
| `FROM_TRASH_TO_CENTER_ZONE` | 0 | 0 |  | FROM_TRASH_TO_CENTER_ZONE: トラッシュからカードを中央シグニゾーン（zone[1]）に出す |
| `FROZEN_LOSES_ABILITIES` | 0 | 0 |  | FROZEN_LOSES_ABILITIES: 対戦相手の凍結状態のシグニは能力を失う（effectEngineで処理） |
| `GRANT_LRIG_ABILITY` | 0 | 0 |  | 能力付与系（CONTINUOUS効果はeffectEngineで処理、AUTO/ACTIVATEDでも来た場合のフォールバック） GRANT_UNDER_SIGNI_*/GRANT_UNDER_LRIG_*/GRANT_LRIG_TRAS… |
| `GRANT_LRIG_TYPE_GAME_WIDE` | 0 | 0 |  |  |
| `GRANT_PRIOKE_PENDING_ATTACK_TRASH` | 0 | 0 |  | GRANT_PRIOKE_PENDING_ATTACK_TRASH: FUTURE SESSION③ 次のAPS時にプリオケシグニへ能力付与をフラグとして予約 |
| `GRANT_TURN_TRIGGER_3RD_DOWN` | 0 | 0 |  | GRANT_TURN_TRIGGER_3RD_DOWN: このターン植物シグニ3回目ダウン時トリガー付与（WX05-042 増武） |
| `GROW_CENTER_IF_LEVEL_LTE_OPP` | 0 | 0 |  | GROW_CENTER_IF_LEVEL_LTE_OPP: センタールリグのレベルが相手以下なら無コストグロウ |
| `HAND_EXCESS_TO_ENERGY` | 0 | 0 |  | HAND_EXCESS_TO_ENERGY: 手札がN枚（value、既定5）より多い場合、差分を手札からエナゾーンへ（WDK08-Y08） |
| `HASTARLIQ_TRIGGER` | 0 | 0 |  | HASTARLIQ_TRIGGER: アタックフェイズ開始時発動（BattleScreenがスタックに積む） 相手に「手札を1枚捨てる」か「《無》を支払う」か「どちらも行わない（→バニッシュ）」を選ばせる |
| `INHERIT_LRIG_TRASH_ABILITIES` | 0 | 0 |  | INHERIT_LRIG_TRASH_ABILITIES: ルリグトラッシュにあるルリグの起動能力を継承する（BattleScreen側処理） |
| `INTERNAL_ACLDH_APPLY` | 0 | 0 |  | INTERNAL_ACLDH_APPLY: ADD_CARD_TO_LRIG_DECK_HIDDEN の選択後処理 |
| `INTERNAL_APPLY_CLASS_CHANGE` | 0 | 0 |  | INTERNAL_APPLY_CLASS_CHANGE: 選択シグニのクラスを変更 |
| `INTERNAL_APPLY_POWER_DELTA_OPP` | 0 | 0 |  | INTERNAL_APPLY_POWER_DELTA_OPP: SELECT_TARGET後に対象シグニへparent deltaを適用 |
| `INTERNAL_APPLY_PRIOKE_ATTACK_TRASH` | 0 | 0 |  | INTERNAL_APPLY_PRIOKE_ATTACK_TRASH: 予約したアタック時トラッシュ能力を対象プリオケシグニに適用 |
| `INTERNAL_ARTS_RECYCLE_EXECUTE` | 0 | 0 |  | INTERNAL_ARTS_RECYCLE_EXECUTE: アーツをルリグトラッシュからルリグデッキへ回収実行 |
| `INTERNAL_ATTACH_SOUL_FROM_LRIG` | 0 | 0 |  | ソウル付与（ルリグの下カードを選択シグニに付与） |
| `INTERNAL_BANISH_ALL_POWER_GTE` | 0 | 0 |  | INTERNAL_BANISH_ALL_POWER_GTE: パワーN以上のすべてのシグニ（両プレイヤー）をバニッシュ |
| `INTERNAL_BANISH_FROM_GAME_DO` | 0 | 0 |  |  |
| `INTERNAL_BANISH_FROM_GAME_SKIP` | 0 | 0 |  |  |
| `INTERNAL_BANISH_OPP_POWER_GTE` | 0 | 0 |  | INTERNAL_BANISH_OPP_POWER_GTE: 相手のパワーN以上のシグニ1体をバニッシュ |
| `INTERNAL_BANISH_OPP_POWER_LTE` | 0 | 0 |  | INTERNAL_BANISH_OPP_POWER_LTE: パワーN以下の相手シグニをバニッシュ（対象選択） |
| `INTERNAL_BET_EXTRA_TO_HAND` | 0 | 0 |  | INTERNAL_BET_EXTRA_TO_HAND: ベット時の追加対象（トラッシュ→手札）を1枚処理 |
| `INTERNAL_BIDC_BANISH` | 0 | 0 |  |  |
| `INTERNAL_BIDC_ENERGY` | 0 | 0 |  |  |
| `INTERNAL_BLOCK_ATTACK_THIS_TURN` | 0 | 0 |  | INTERNAL_BLOCK_ATTACK_THIS_TURN: 対象がアタックできない 発動者（ownerState）の keyword_grants に格納する。相手ターン開始の UPフェイズで otherState.keyword_… |
| `INTERNAL_BLOOM_SEED` | 0 | 0 |  | INTERNAL_BLOOM_SEED: 指定ゾーンのシードを開花する |
| `INTERNAL_BOUNCE_TO_DECK` | 0 | 0 |  | === バッチ14: シグニ移動・エナ操作・複数対象系 === OPP_SIGNI_TO_DECK_AND_SHUFFLE / OPP_SIGNI_TO_DECK_BY_GATE / OPP_SIGNI_TO_DECK_NTH は lin… |
| `INTERNAL_CBDOP_AFTER_DISCARD` | 0 | 0 |  | INTERNAL: 手札捨て後の効果（COUNT_BASED_DRAW_OR_POWER から継続） |
| `INTERNAL_CHARGE_PER_CENTER_LEVEL` | 0 | 0 |  | INTERNAL_CHARGE_PER_CENTER_LEVEL: センタールリグのレベル1につきエナチャージ1 |
| `INTERNAL_CHOOSE_SOUL_LRIG` | 0 | 0 |  | ソウル付与（ルリグトラッシュからルリグを選択シグニに付与） |
| `INTERNAL_CMCLG_ALL_POWER_UP` | 0 | 0 |  | INTERNAL_CMCLG_ALL_POWER_UP: 自フィールド全シグニのパワーを+N（次の対戦相手ターン終了まで継続） |
| `INTERNAL_CMCLG_APPLY_POWER_MOD` | 0 | 0 |  | INTERNAL_CMCLG_APPLY_POWER_MOD: POWER_MOD_BY_CLASS_LEVELS の続き |
| `INTERNAL_CMCLG_DEDUCT` | 0 | 0 |  | INTERNAL_CMCLG_DEDUCT: 任意コストのエナを消費 |
| `INTERNAL_CMCLG_DRAW_ON_POWER_ZERO` | 0 | 0 |  | INTERNAL_CMCLG_DRAW_ON_POWER_ZERO: このターン相手シグニのパワー≤0でドロー（フラグ設置） |
| `INTERNAL_CMCLG_GRANT_LAYER_LEAVE_BOUNCE` | 0 | 0 |  | INTERNAL_CMCLG_GRANT_LAYER_LEAVE_BOUNCE: 【レイヤー】持ちシグニに「場を離れたとき手札に戻す」を付与 |
| `INTERNAL_CMCLG_GRANT_SLANCER` | 0 | 0 |  | INTERNAL_CMCLG_GRANT_SLANCER: 選択した＜CLASS＞シグニに【Sランサー】付与 |
| `INTERNAL_CMCLG_MILL_OPP` | 0 | 0 |  | INTERNAL_CMCLG_MILL_OPP: 相手デッキ上N枚→トラッシュ |
| `INTERNAL_CMCLG_OPP_TRASH_TO_DECK_LIFE_ENERGY` | 0 | 0 |  | INTERNAL_CMCLG_OPP_TRASH_TO_DECK_LIFE_ENERGY: 相手トラッシュ全→デッキにシャッフル+相手ライフ1枚→エナ |
| `INTERNAL_CMCLG_PLAY_CLASS_FROM_HAND` | 0 | 0 |  | INTERNAL_CMCLG_PLAY_CLASS_FROM_HAND: 手札から＜CLASS＞のシグニを場に出す |
| `INTERNAL_CMCLG_PLAY_CLASS_FROM_TRASH` | 0 | 0 |  | INTERNAL_CMCLG_PLAY_CLASS_FROM_TRASH: トラッシュから＜CLASS＞のシグニをN枚まで場に出す |
| `INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS` | 0 | 0 |  | INTERNAL_CMCLG_POWER_MOD_BY_CLASS_LEVELS: ＜毒牙＞シグニのレベル合計×-1000で対象シグニのパワーを修正 |
| `INTERNAL_CMCLG_TRASH_TO_DECK_LIFE` | 0 | 0 |  | INTERNAL_CMCLG_TRASH_TO_DECK_LIFE: 自トラッシュ全→デッキにシャッフル+デッキ上→ライフ |
| `INTERNAL_CONSUME_LRIG_UNDER` | 0 | 0 |  | INTERNAL_CONSUME_LRIG_UNDER: ルリグの下からN枚をルリグトラッシュへ（SOUL_OP optional消費の実行部） |
| `INTERNAL_CONSUME_SOUL` | 0 | 0 |  | INTERNAL_CONSUME_SOUL: ソースシグニの下にあるソウルカードをルリグトラッシュへ |
| `INTERNAL_COPY_SIGNI_APPLY` | 0 | 0 |  | INTERNAL_COPY_SIGNI_APPLY: card_identity_overrides を設定してコピーを適用 |
| `INTERNAL_DBPM_DISCARD` | 0 | 0 |  |  |
| `INTERNAL_DC_DECK_PICK` | 0 | 0 |  | INTERNAL_DC_DECK_PICK: WX24-P1-035用 デッキ上3枚から宣言クラスのシグニを好きな枚数手札/エナに振り分け、残りをデッキ下へ |
| `INTERNAL_DC_TRASH_RETRIEVE` | 0 | 0 |  | INTERNAL_DC_TRASH_RETRIEVE: WXDi-P09-004用 宣言クラスを持ち《ガードアイコン》を持たないLv1/Lv2/Lv3のシグニをトラッシュから各1枚まで手札へ |
| `INTERNAL_DCCE_TRASH_COLOR` | 0 | 0 |  | INTERNAL_DCCE_TRASH_COLOR: 宣言色のエナ1枚をトラッシュ |
| `INTERNAL_DECK_BOTTOM_LEVEL_DOWN` | 0 | 0 |  | INTERNAL_DECK_BOTTOM_LEVEL_DOWN: デッキ下1枚トラッシュ→シグニなら同レベル相手シグニをダウン |
| `INTERNAL_DECK_BOTTOM_SUMMON` | 0 | 0 |  | INTERNAL_DECK_BOTTOM_SUMMON: デッキ下1枚トラッシュ→シグニなら場に出す |
| `INTERNAL_DECK_TRASH_BOTH` | 0 | 0 |  | INTERNAL_DECK_TRASH_BOTH: 両プレイヤーのデッキ上N枚をトラッシュ |
| `INTERNAL_DECLARE_CARD_NAME` | 0 | 0 |  |  |
| `INTERNAL_DECLARE_ZONE_EXECUTE` | 0 | 0 |  | INTERNAL_DECLARE_ZONE_EXECUTE: 選択した領域を declared_class_zones に記録 |
| `INTERNAL_DESIGNATE_ZONE` | 0 | 0 |  | INTERNAL_DESIGNATE_ZONE: 選択したゾーンを相手Stateに保存 |
| `INTERNAL_DISCARD_ALL_DRAW_N` | 0 | 0 |  | INTERNAL_DISCARD_ALL_DRAW_N: 手札をすべて捨てN枚引く |
| `INTERNAL_DISCARD_LRIG_DECK_ARTS` | 0 | 0 |  | INTERNAL: ルリグデッキからアーツをルリグトラッシュへ（CHOOSEの続き） |
| `INTERNAL_DISCARD_MATCHING_HAND_DOP` | 0 | 0 |  |  |
| `INTERNAL_DISCARD_PENALTY` | 0 | 0 |  |  |
| `INTERNAL_DISMOUNT_DO` | 0 | 0 |  |  |
| `INTERNAL_DO_COLLAB` | 0 | 0 |  | INTERNAL_DO_COLLAB: コラボ実行（アシストルリグ1人を配置） |
| `INTERNAL_DOWN_AND_FREEZE_OPP` | 0 | 0 |  | INTERNAL_DOWN_AND_FREEZE_OPP: 相手シグニ1体をダウン+全シグニを凍結 |
| `INTERNAL_DOWN_SIGNI_BY_ZONE` | 0 | 0 |  |  |
| `INTERNAL_DPE_DO_DISCARD` | 0 | 0 |  |  |
| `INTERNAL_DPE_PAY` | 0 | 0 |  |  |
| `INTERNAL_DPE_SELECT_DISCARD` | 0 | 0 |  |  |
| `INTERNAL_DRAW_PER_CENTER_LEVEL` | 0 | 0 |  | INTERNAL_DRAW_PER_CENTER_LEVEL: センタールリグのレベル1につき1ドロー |
| `INTERNAL_ECRV_APPLY` | 0 | 0 |  | INTERNAL_ECRV_APPLY: ウイルスN個除去→(N+1)択効果を選ぶ |
| `INTERNAL_ENCORE_USE` | 0 | 0 |  | INTERNAL_ENCORE_USE: 選択したアーツをコストなしで実行 |
| `INTERNAL_ENERGY_TO_HAND` | 0 | 0 |  | ENERGY_TO_HAND_ON_DECK 後処理：選択エナを手札へ |
| `INTERNAL_ENERGY_TO_TRASH` | 0 | 0 |  | ENERGY_TO_TRASH の後処理：選択したエナカードをトラッシュへ |
| `INTERNAL_EVDIVA_RED_BANISH` | 0 | 0 |  | INTERNAL_EVDIVA_RED_BANISH: 選択したシグニのパワー合計が12000以下ならバニッシュ（エビディバ赤効果） |
| `INTERNAL_EXILE_OPP_TRASH` | 0 | 0 |  | INTERNAL_EXILE_OPP_TRASH: 相手トラッシュのカードをゲームから除外（2枚まで） |
| `INTERNAL_FREEZE_OPP_LRIG` | 0 | 0 |  | INTERNAL_FREEZE_OPP_LRIG: 相手センタールリグを凍結（ダウン+凍結状態） |
| `INTERNAL_GRANT_KEYWORD_TO_TARGET` | 0 | 0 |  | INTERNAL_GRANT_KEYWORD_TO_TARGET: 選択されたキーワード/保護能力を対象シグニに付与 |
| `INTERNAL_GRANT_NO_ATTACK_LRIG` | 0 | 0 |  | INTERNAL_GRANT_NO_ATTACK_LRIG: CHOOSE_SAME_OPTION_TWICEから呼ばれる内部ハンドラ 相手センタールリグにアタック不可（negated_attacks）を付与 |
| `INTERNAL_HAND_TO_DECK_BOTTOM` | 0 | 0 |  |  |
| `INTERNAL_HAND_TO_ENERGY` | 0 | 0 |  | INTERNAL: lastProcessedCardsの手札カードをエナへ移動 |
| `INTERNAL_HL_BANISH` | 0 | 0 |  | INTERNAL_HL_BANISH: どちらも行わない→そのゾーンのシグニをバニッシュ（エナへ） |
| `INTERNAL_HL_DO_DISCARD` | 0 | 0 |  | INTERNAL_HL_DO_DISCARD: 選択した手札をトラッシュへ→バニッシュ回避 |
| `INTERNAL_HL_PAY` | 0 | 0 |  | INTERNAL_HL_PAY: 《無》1枚支払い→バニッシュ回避 |
| `INTERNAL_HL_SELECT_DISCARD` | 0 | 0 |  | INTERNAL_HL_SELECT_DISCARD: 手札を1枚選んで捨てる（ハスターリク回避） |
| `INTERNAL_LAYER_COPY_APPLY` | 0 | 0 |  | INTERNAL_LAYER_COPY_APPLY: 選択シグニのレイヤー能力を自シグニに付与 |
| `INTERNAL_LCLTR_TRASH` | 0 | 0 |  |  |
| `INTERNAL_LEAVE_TO_TRASH` | 0 | 0 |  | INTERNAL_LEAVE_TO_TRASH: 選択シグニをトラッシュに置く |
| `INTERNAL_LIFE_TO_HAND_DO` | 0 | 0 |  |  |
| `INTERNAL_MARK_REVEALED_FROM_HAND` | 0 | 0 |  | INTERNAL_MARK_REVEALED_FROM_HAND: 手札公開の記録（applyDirectAction経由で選択カードごとに呼ばれる） BattleScreenが hand_revealed_just を検出してON_RE… |
| `INTERNAL_MARK_REVEALED_NAMED` | 0 | 0 |  | INTERNAL_MARK_REVEALED_FROM_HAND: 手札公開の記録（applyDirectAction経由で選択カードごとに呼ばれる） BattleScreenが hand_revealed_just を検出してON_RE… |
| `INTERNAL_MOVE_TO_BEAT` | 0 | 0 |  | INTERNAL_MOVE_TO_BEAT: 選択シグニをビートゾーンへ移動 |
| `INTERNAL_MOVE_TO_ZONE` | 0 | 0 |  |  |
| `INTERNAL_NEGATE_ABILITY` | 0 | 0 |  | INTERNAL_NEGATE_ABILITY: 選択シグニの能力を無効化 |
| `INTERNAL_ODC_COLOR_CHECK` | 0 | 0 |  | INTERNAL_ODC_COLOR_CHECK: 色宣言後、lastProcessedCards[0]の色を確認してペナルティ適用 |
| `INTERNAL_OPEN_MB_DO` | 0 | 0 |  | INTERNAL_OPEN_MB_DO: MB表向き確定後のトラッシュ移動 |
| `INTERNAL_OPP_DECK_TRASH_N` | 0 | 0 |  | INTERNAL_OPP_DECK_TRASH_N: 相手デッキの上からN枚をトラッシュ |
| `INTERNAL_OPP_ENERGY_TO_TRASH` | 0 | 0 |  |  |
| `INTERNAL_OPP_FIELD_TO_ENERGY` | 0 | 0 |  | INTERNAL_OPP_FIELD_TO_ENERGY: lastProcessedCards[0]を相手フィールドからエナゾーンへ移動 |
| `INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N` | 0 | 0 |  | INTERNAL_OPP_HAND_TO_DECK_BOTTOM_N: 選択した相手手札をデッキ下へ |
| `INTERNAL_OPP_HAND_TO_DECK_TOP` | 0 | 0 |  |  |
| `INTERNAL_OPP_PAY_COST` | 0 | 0 |  |  |
| `INTERNAL_OPP_SIGNI_TO_DECK_SHUFFLE` | 0 | 0 |  |  |
| `INTERNAL_OPP_SIGNI_TO_ENERGY_EXEC` | 0 | 0 |  |  |
| `INTERNAL_OPP_SIGNI_TO_TRAP` | 0 | 0 |  | INTERNAL_OPP_SIGNI_TO_TRAP: 選択した相手シグニをトラップゾーンへ |
| `INTERNAL_OPP_SKIP_COST` | 0 | 0 |  |  |
| `INTERNAL_OPP_SPELL_TO_TRASH` | 0 | 0 |  | INTERNAL_OPP_SPELL_TO_TRASH: 使用しなかった公開スペルを対戦相手のトラッシュへ（WX04-015） |
| `INTERNAL_OPP_TRASH_TO_DECK_TOP` | 0 | 0 |  |  |
| `INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE` | 0 | 0 |  | INTERNAL_OPP_TRASH_UNDER_SIGNI_ZONE: stub.value=ゾーン番号、lastProcessedCards[0]=置くカード |
| `INTERNAL_OTEC_MOVE_SELECTED` | 0 | 0 |  | INTERNAL_OTEC_MOVE_SELECTED: applyDirectActionのdefault経由で呼ばれ、lastProcessedCards[0]を移動 |
| `INTERNAL_OTEC_SELECT` | 0 | 0 |  | INTERNAL_OTEC_SELECT: エナゾーンから特定クラスのカードを選択してトラッシュ/手札へ |
| `INTERNAL_PLACE_LRIG_UNDER_CENTER` | 0 | 0 |  | INTERNAL_PLACE_LRIG_UNDER_CENTER: ルリグトラッシュから選択ルリグをセンタールリグ下に配置 |
| `INTERNAL_PLACE_SELF_UNDER_SIGNI` | 0 | 0 |  | INTERNAL_PLACE_SELF_UNDER_SIGNI: 自シグニを選択シグニのスタック下に移動 |
| `INTERNAL_PMBTSL_APPLY` | 0 | 0 |  |  |
| `INTERNAL_PMBUC_APPLY` | 0 | 0 |  |  |
| `INTERNAL_PMOP_APPLY` | 0 | 0 |  |  |
| `INTERNAL_POWER_MOD_ALL_OPP` | 0 | 0 |  | INTERNAL_POWER_MOD_ALL_OPP: 全相手シグニへのパワー修正 |
| `INTERNAL_POWER_MOD_OPP_ONE` | 0 | 0 |  | INTERNAL_POWER_MOD_OPP_ONE: 相手の1体にパワー修正 |
| `INTERNAL_POWER_UP_SELECTED` | 0 | 0 |  | MULTI_SIGNI_POWER_UP_5000 の後処理：選択した自シグニにパワー+5000 |
| `INTERNAL_PTFR_CHOOSE_ZONE` | 0 | 0 |  | INTERNAL_PTFR_CHOOSE_ZONE: PLACE_TRAP_FROM_REVEALED用のゾーン選択 |
| `INTERNAL_PTSUAW_PLACE` | 0 | 0 |  | INTERNAL_PTSUAW_PLACE: ウェポン下シグニ配置の実行 |
| `INTERNAL_REMOVE_SIGNI_ZONE` | 0 | 0 |  | INTERNAL_REMOVE_SIGNI_ZONE: 選択したゾーンを削除してシグニをトラッシュへ |
| `INTERNAL_REMOVE_VIRUS_N` | 0 | 0 |  | INTERNAL_REMOVE_VIRUS_N: N個ウイルスを除去（effectExecutorのREMOVE_VIRUS+IS_MY_TURNハンドラから使用） |
| `INTERNAL_REORDER_LIFE_APPLY` | 0 | 0 |  | INTERNAL_REORDER_LIFE_APPLY: N枚のライフをトラッシュに置き、デッキ上からN枚をライフに追加 |
| `INTERNAL_REPOSITION_MOVE` | 0 | 0 |  | INTERNAL_REPOSITION_MOVE: 選択シグニを空きゾーンへ移動（後方互換） |
| `INTERNAL_REPOSITION_TO_ZONE` | 0 | 0 |  | INTERNAL_REPOSITION_TO_ZONE: 選択シグニを指定ゾーンへ移動（SIGNI_REPOSITIONの後半） |
| `INTERNAL_RETURN_LRIG_TO_DECK` | 0 | 0 |  | INTERNAL_RETURN_LRIG_TO_DECK: ルリグトラッシュの最初のルリグをlrig_deckへ移動 |
| `INTERNAL_RIDE_ON_APPLY` | 0 | 0 |  |  |
| `INTERNAL_RV_BATCH_TRANSFER` | 0 | 0 |  | INTERNAL_RV_BATCH_TRANSFER: N個ウイルス除去 + トラッシュからシグニN枚を手札へ（WX15-028型） |
| `INTERNAL_SDWT_DO` | 0 | 0 |  | INTERNAL_SDWT_DO: シグニトラッシュ+ダメージ無効実行 |
| `INTERNAL_SEED_FROM_DECK` | 0 | 0 |  | INTERNAL_SEED_FROM_DECK: SEARCHで選択したカードをデッキから取り出してゾーン選択 |
| `INTERNAL_SEED_FROM_DECK_TOP_PLACE` | 0 | 0 |  | INTERNAL_SEED_FROM_DECK_TOP_PLACE: デッキ上1枚をシードとして設置 |
| `INTERNAL_SEED_TO_HAND_THEN_DECK_TOP` | 0 | 0 |  | INTERNAL_SEED_TO_HAND_THEN_DECK_TOP: 指定ゾーンのシードを手札に加えてデッキ上をシード設置 |
| `INTERNAL_SELECT_COLOR` | 0 | 0 |  |  |
| `INTERNAL_SET_DECLARED_COLOR` | 0 | 0 |  |  |
| `INTERNAL_SET_GATE` | 0 | 0 |  |  |
| `INTERNAL_SET_LEVEL_RANGE` | 0 | 0 |  |  |
| `INTERNAL_SET_MAGIC_BOX` | 0 | 0 |  | INTERNAL_SET_MAGIC_BOX: ゾーン確定後の実設置処理 |
| `INTERNAL_SET_OPP_DECLARED_COLOR` | 0 | 0 |  |  |
| `INTERNAL_SET_OWN_GATE` | 0 | 0 |  |  |
| `INTERNAL_SET_SEED` | 0 | 0 |  | INTERNAL_SET_SEED: lastProcessedCards[0]を指定ゾーンにシード設置 |
| `INTERNAL_SET_SOUL_FROM_LRIG_TRASH_RESULT` | 0 | 0 |  | ルリグトラッシュ選択後ソウル付与 |
| `INTERNAL_SET_TRAP` | 0 | 0 |  | INTERNAL_SET_TRAP: ゾーン番号をstub.valueで受け取りトラップ設置 |
| `INTERNAL_SIGNI_UNDER_WEAPON` | 0 | 0 |  | INTERNAL_SIGNI_UNDER_WEAPON: 選択シグニを＜ウェポン＞の下に配置 |
| `INTERNAL_SNC_AFTER_SEARCH` | 0 | 0 |  | INTERNAL_SNC_AFTER_SEARCH: SEARCHで非選択→trash済み、選択カードはまだdeckに残っている SEARCH+restDestがdeck上カードをtrashに移動済み（非選択分） 選択分はdeck内に残っ… |
| `INTERNAL_SNC_MOVE_TO_ENERGY` | 0 | 0 |  | INTERNAL_SNC_MOVE_TO_ENERGY: 指定カードをデッキからエナゾーンへ |
| `INTERNAL_SNC_MOVE_TO_HAND` | 0 | 0 |  | INTERNAL_SNC_MOVE_TO_HAND: 指定カードをデッキから手札へ |
| `INTERNAL_SONG_FRAGMENT` | 0 | 0 |  | INTERNAL_SONG_FRAGMENT: SELECT_TARGETで選択されたカードで歌のカケラ発動 |
| `INTERNAL_STUTO_SELECT_OTHERS` | 0 | 0 |  |  |
| `INTERNAL_STUTO_TRASH_SELECTED` | 0 | 0 |  |  |
| `INTERNAL_STUTO_TRASH_SELF` | 0 | 0 |  |  |
| `INTERNAL_TOP_TO_BOTTOM` | 0 | 0 |  |  |
| `INTERNAL_TOSFC_AFTER_SELECT` | 0 | 0 |  | INTERNAL_TOSFC_AFTER_SELECT: 選択後にバウンスかトラッシュを選択 |
| `INTERNAL_TOSFC_BOUNCE` | 0 | 0 |  | INTERNAL_TOSFC_BOUNCE: 選択した相手シグニをバウンス |
| `INTERNAL_TOSFC_TRASH` | 0 | 0 |  | INTERNAL_TOSFC_TRASH: 選択した相手シグニをトラッシュ |
| `INTERNAL_TOSO_AFTER_SELECT` | 0 | 0 |  | INTERNAL_TOSO_AFTER_SELECT: 選択後、対戦相手の手札が2枚未満なら強制でデッキ下へ。 2枚以上ある場合は対戦相手に「手札2枚を捨てて回避」か「デッキの一番下に送られるのを許す」かを選ばせる |
| `INTERNAL_TOSO_TO_DECK` | 0 | 0 |  | INTERNAL_TOSO_TO_DECK: 選択した相手シグニをデッキの一番下へ |
| `INTERNAL_TRASH_CARD` | 0 | 0 |  | VIEW_AND_DISCARD_SPELL: 手札からスペルを選んでトラッシュへ |
| `INTERNAL_TRASH_CLASS_SPLIT` | 0 | 0 |  | INTERNAL_TRASH_CLASS_SPLIT: 選択カードを手札（1枚）＋エナ（残り）に振り分け |
| `INTERNAL_TRASH_OWN_KEY` | 0 | 0 |  |  |
| `INTERNAL_TRASH_SIGNI_TO_HAND` | 0 | 0 |  | INTERNAL_TRASH_SIGNI_TO_HAND: トラッシュからシグニ1枚を手札へ（CONDITIONAL_MULTI_CHOOSE系） |
| `INTERNAL_TRASH_TO_ENERGY` | 0 | 0 |  | TRASHED_CARD_TO_HAND_OR_ENERGY → エナ選択後処理 |
| `INTERNAL_TRASH_TO_HAND` | 0 | 0 |  | TRASHED_CARD_TO_HAND_OR_ENERGY → 手札選択後処理 |
| `INTERNAL_TRASH_TO_LIFE` | 0 | 0 |  | INTERNAL_TRASH_TO_LIFE: 自トラッシュの末尾カードをライフクロスへ追加（近似：相手選択なし） |
| `INTERNAL_TRASH_UNDER_SIGNI` | 0 | 0 |  | INTERNAL_TRASH_UNDER_SIGNI: シグニ下カードをトラッシュへ移動 |
| `INTERNAL_TRASHED_TO_ENERGY` | 0 | 0 |  |  |
| `INTERNAL_TRASHED_TO_HAND` | 0 | 0 |  |  |
| `INTERNAL_TSU_CHOOSE_ZONE` | 0 | 0 |  | INTERNAL_TSU_CHOOSE_ZONE: 選択トラッシュシグニをどのフィールドシグニの下に置くか選択 |
| `INTERNAL_TSU_DO_PLACE` | 0 | 0 |  | INTERNAL_TSU_DO_PLACE: トラッシュ→フィールド下配置実行、残りがあれば継続 |
| `INTERNAL_TTH_APPLY` | 0 | 0 |  | INTERNAL_TTH_APPLY: TRAP_TO_HAND選択完了後の適用 |
| `INTERNAL_TUSP_APPLY` | 0 | 0 |  |  |
| `INTERNAL_TUSP_TRASH` | 0 | 0 |  |  |
| `INTERNAL_UNKNOWN_NESTED_SKIP` | 0 | 0 |  |  |
| `INTERNAL_UNKNOWN_NESTED_TRASH` | 0 | 0 |  |  |
| `INTERNAL_USE_OPP_SPELL_FREE` | 0 | 0 |  | INTERNAL_USE_OPP_SPELL_FREE: 公開した相手スペルをコストなし・限定条件無視で使用し、使用後は相手トラッシュへ（WX04-015） |
| `INTERNAL_WD007_APPLY` | 0 | 0 |  | INTERNAL_WD007_APPLY: 選択した対象に能力を付与し、ベットしていれば1回繰り返す |
| `INTERNAL_WD007_GRANT` | 0 | 0 |  | INTERNAL_WD007_GRANT: 選んだ能力に応じた対象（自分シグニ or 相手シグニ）を選択 |
| `LIFE_CLOTH_LOOK_TRASH_REFILL` | 0 | 0 |  | LIFE_CLOTH_LOOK_TRASH_REFILL: 全ライフクロスを見て好きな枚数トラッシュ→同数デッキ上から補充（WX05-010） |
| `LRIG_LEVEL_RESTRICT` | 0 | 0 |  | その他ゾーン/レベル/フェイズ制限 |
| `LRIG_RIDE_SIGNI` | 0 | 0 |  | LRIG_RIDE_SIGNI: センタールリグがすべての乗機シグニに乗る（ドライブ状態） |
| `LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS` | 0 | 0 |  | LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS: ルリグトラッシュの全ルリグをこのカードの下に、アーツをルリグデッキへ（WX05-001, WXEX2-84） |
| `LRIG_ZONE_RESTRICT` | 0 | 0 |  | その他ゾーン/レベル/フェイズ制限 |
| `MAGIC_BOX_REVEAL` | 0 | 0 |  | MAGIC_BOX_REVEAL: 場のMBを表向きにしてシグニにする（全MBをシグニとして配置） |
| `MOVE_LRIG_TRASH_UNDER` | 0 | 0 |  | MOVE_LRIG_TRASH_UNDER: ルリグトラッシュからルリグをセンタールリグの下に置き、白/黒アーツをルリグデッキへ |
| `NEGATE_SPELL` | 0 | 0 |  | NEGATE_SPELL: コスト合計5以下のスペルを打ち消す（WX11-017 ブルー・パニッシュ） |
| `OPP_DECK_REVEAL_UNTIL` | 0 | 0 |  | デッキを条件が満たされるまで公開する |
| `OPP_DECLARE_COLOR_COND_ENERGY_TRASH` | 0 | 0 |  | 相手が宣言した色に応じてエナをトラッシュ（相手の宣言が必要→スキップ） DECLARE_COLOR_COND_ENERGY_TRASH: 色を宣言し、エナから宣言色のカードを任意でトラッシュ |
| `OPP_DIRECT_ATTACK_NEGATE_PAY` | 0 | 0 |  | OPP_DIRECT_ATTACK_NEGATE_PAY: ＜美巧＞捨て選択の後続。エナ（costColors）を支払い、 アタッカー(otherState)の cancel_current_signi_attack を立てる（＜美巧＞捨… |
| `OPP_ENERGY_REDUCE_TO_N` | 0 | 0 |  | OPP_ENERGY_REDUCE_TO_N: 相手のエナをstub.value枚になるようにトラッシュ（WXK06-055 CHOOSE選択肢） |
| `OPP_LRIG_LOSE_ABILITY` | 0 | 0 |  | OPP_LRIG_LOSE_ABILITY: 相手ターンの場合、ターン終了時まで相手センタールリグは能力を失う（WX20-003） カットインが未実装のため自ターンに発動することはないが、構造上は otherState にフラグをセット |
| `OPP_PUNISHER_CHOICE` | 0 | 0 |  | OPP_PUNISHER_CHOICE: 相手が3択（手札2捨て/エナ3トラッシュ/シグニ1トラッシュ）を選ぶ（WXK05-001【出】） |
| `OPTIONAL_RETURN_TO_LRIG_DECK` | 0 | 0 |  | OPTIONAL_RETURN_TO_LRIG_DECK: 任意コストを支払ってルリグトラッシュからルリグをルリグデッキに戻す |
| `OPTIONAL_TRADE_GUARD_SIGNI` | 0 | 0 |  | ガード系（engine: ガードコスト処理未実装） |
| `PLACE_VIRUS_TO_2` | 0 | 0 |  | PLACE_VIRUS_TO_2: 相手の場のウィルス合計が2になるようにウィルスを置く（WX19-045） |
| `POWER_MINUS_PER_OWN_LEVEL` | 0 | 0 |  | POWER_MINUS_PER_OWN_LEVEL: このシグニのレベル×2000だけ対戦相手シグニのパワーを下げる WXK08-078（弩書　エムショ）のGRANT_SIGNI_ABOVE_ABILITYで付与されるACTIVATED効果 |
| `POWER_MOD_PER_OPPONENT_FIELD` | 0 | 0 |  |  |
| `PRDI035_APPLY_PARADISE` | 0 | 0 |  | PRDI035_APPLY_PARADISE: PR-Di035 OPEN DREAM LAND! 色分岐（APS時評価）。 場の＜プリパラ＞シグニが、ある色を共通して持ちレベルが3種類以上ある場合、その色の効果を行う。 |
| `PRDI035_PARADISE_COLOR` | 0 | 0 |  | PRDI035_PARADISE_COLOR: 次のアタックフェイズ開始時判定フラグをセット。 |
| `PREVENT_NEXT_DAMAGE` | 0 | 0 |  |  |
| `PREVENT_NEXT_DAMAGE_THIS_TURN` | 0 | 0 |  |  |
| `PREVENT_OPP_GUARD_THIS_TURN` | 0 | 0 |  | このターン相手はガードできない（ガードコスト無色版 or ガード禁止） |
| `PREVENT_OPP_UPKEEP` | 0 | 0 |  | PREVENT_OPP_UPKEEP: 相手のアップキープ（アップ）を防ぐ |
| `PREVENT_SELF_DOWN_BY_OPP` | 0 | 0 |  | PREVENT_SIGNI_DOWN_BY_OPP_ALL / PREVENT_SELF_DOWN_BY_OPP / PREVENT_SIGNI_DOWN_BY_OPP: 相手によるシグニダウン防止 |
| `REMOVE_MIKO_KEYWORD` | 0 | 0 |  | REMOVE_MIKO_KEYWORD: みこみこ親衛隊キーワードをsourceCardNumのシグニのkeyword_grantsから取り除く（WX25-P3-TK03） |
| `REORDER_LIFE_CLOTHS` | 0 | 0 |  | REORDER_LIFE_CLOTHS: ライフクロスを好きな枚数トラッシュに置き同数デッキ上から補充し並び替え |
| `RETURN_ANGEL_SIGNI_TO_DECK` | 0 | 0 |  | RETURN_ANGEL_SIGNI_TO_DECK: トラッシュから天使シグニ7枚をデッキ下に置く（WX06-001 タウィル＝フィーラ E2） |
| `RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK` | 0 | 0 |  | RETURN_UNIQUE_ANGEL_SIGNI_TO_DECK: トラッシュから名前の異なる天使シグニ7枚をデッキ下に置く（WX06-001 E3） |
| `REVEAL_SECOND_PICK_ENERGY` | 0 | 0 |  | REVEAL_SECOND_PICK_ENERGY: 2段階ピックの2段目。1段目で公開した残りのうち、 指定クラスを toMax 枚までエナゾーンへ、それ以外の残りはデッキ下/トラッシュへ。 |
| `REVEAL_TOP_BANISH_BY_LEVEL_SUM` | 0 | 0 |  | REVEAL_TOP_BANISH_BY_LEVEL_SUM: デッキ上N枚公開→公開シグニのレベル合計×1000以下の相手シグニをバニッシュ→公開カードをトラッシュ（WX17-028） |
| `REVEAL_TOP_LEVEL_ROUTE` | 0 | 0 |  | SUMMON_FROM_ENERGY: エナゾーンからシグニを場に出す（シグニ限定） REVEAL_TOP_LEVEL_ROUTE: デッキの一番上を公開しシグニのレベル別効果を実行（WX12-CB02） Lv1:自パワー+5000 / … |
| `REVEALED_SIGNI_TO_FIELD_REST_TRASH` | 0 | 0 |  | 公開したシグニをフィールドに出し、残りをトラッシュ |
| `SELF_TRASH_UNLESS_TRASH_OTHERS` | 0 | 0 |  | SELF_TRASH_UNLESS_TRASH_OTHERS: 他の＜原子＞2体をトラッシュしないかぎり自分をトラッシュ（WXK10-039【出】） |
| `SET_CANCEL_ATTACK_FLAG` | 0 | 0 |  | SET_CANCEL_ATTACK_FLAG: アタックキャンセルフラグをセット（NEGATE_ATTACK_ON_TRIGGERのYes時。攻撃側=効果オーナー自身のアタックを無効化） |
| `SET_CANCEL_OPP_ATTACK_FLAG` | 0 | 0 |  | SET_CANCEL_OPP_ATTACK_FLAG: 守備側の効果が「対戦相手のアタック」を無効化する場合に使う。 Phase2(resolvePendingSigniBattleFor)はアタッカー側stateの cancel_cur… |
| `SET_DECLARED_NUMBER` | 0 | 0 |  | DECLARE_NUMBER の宣言値を PlayerState に格納 |
| `STACK_SIGNI_UNDER` | 0 | 0 |  | シグニの下にカードを置く |
| `SUMMON_FROM_TRASH` | 0 | 0 |  | SUMMON_FROM_TRASH: トラッシュからシグニ1枚を場に出す（choiceTextParser選択肢から使用） |
| `SUMMON_FROM_TRASH_TO_HAND_BLACK` | 0 | 0 |  | SUMMON_FROM_TRASH_TO_HAND_BLACK: トラッシュから黒シグニを手札へ |
| `TK3_DISCARD_BY_LEVEL` | 0 | 0 |  | TK3_DISCARD_BY_LEVEL: REVEAL_CARDS 確認後、宣言レベルのシグニを相手手札からすべて捨てさせる |
| `TRASH_ALL_CHARMS_DRAW_CHARGE` | 0 | 0 |  | TRASH_ALL_CHARMS_DRAW_CHARGE: 場の全チャームをトラッシュ→同枚数ドロー+エナチャ |
| `TRASH_ATTACHED_OR_UNDER_CARD` | 0 | 0 |  | TRASH_ATTACHED_OR_UNDER_CARD: シグニに付いているカードまたは下のカード1枚をトラッシュ |
| `TRASH_UNDER_SPELLS_POWER_MINUS` | 0 | 0 |  | TRASH_UNDER_SPELLS_POWER_MINUS: このシグニの下スペルを任意枚数トラッシュ→相手シグニに-5000×枚数（WXDi-P10-040） |
| `UNLIMITED_KEYS` | 0 | 0 |  | ゲームプレイに影響しない説明テキストは無音でスキップ |
| `USE_CONDITION_TEXT` | 0 | 0 |  | ゲームプレイに影響しない説明テキストは無音でスキップ |
| `WEAPON_SIGNI_PREVENT_DOWN` | 0 | 0 |  |  |
| `WEAPON_SIGNI_PROTECT_DOWN` | 0 | 0 |  |  |
| `WEAPON_SIGNI_PROTECTION` | 0 | 0 |  |  |
| `WXK07_043_CHARM_BANISH` | 0 | 0 |  | WXK07-043「羅菌 マグネ」: 対戦相手のAPS開始時、チャームがある場合バニッシュされない（ターン終了まで） |
