# 意味照合監査 clean群 round1 段1 第14バッチ triage（軸「condition」）

## 1. サマリ

分類は finding 単位。`機構待ち` は真バグの内数である。

| action 型 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 1 | 1 | 0 | 1 | 0 |
| BANISH | 6 | 6 | 0 | 4 | 0 |
| BOUNCE | 1 | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/BANISH/SIGNI) | 2 | 2 | 0 | 1 | 0 |
| CHOOSE(CHOOSE/ENERGY_CHARGE_FROM_DECK/TRANSFER_TO_HAND) | 1 | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/EXILE/TRASH_CARD) | 1 | 1 | 0 | 1 | 0 |
| CHOOSE(CHOOSE/SEARCH/ADD_TO_FIELD) | 1 | 1 | 0 | 1 | 0 |
| CHOOSE(CHOOSE/TRASH/HAND_CARD) | 2 | 2 | 0 | 2 | 0 |
| DRAW | 1 | 0 | 1 | 0 | 0 |
| ENERGY_CHARGE_FROM_DECK | 2 | 2 | 0 | 2 | 0 |
| ENERGY_CHARGE | 1 | 1 | 0 | 0 | 0 |
| GRANT_FIELD_SIGNI_ABILITY | 1 | 1 | 0 | 0 | 0 |
| LIFE_CRASH | 1 | 1 | 0 | 1 | 0 |
| LOOK_AND_REORDER | 1 | 1 | 0 | 1 | 0 |
| POWER_MODIFY | 2 | 2 | 0 | 0 | 0 |
| SEARCH | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/BANISH/SIGNI) | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/BOUNCE/SIGNI) | 2 | 2 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/PLACE_UNDER_SIGNI/TRASH) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/POWER_MODIFY/SIGNI) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/POWER_SET/SIGNI) | 2 | 2 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRANSFER_TO_DECK/TRASH_CARD) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRASH/SIGNI) | 2 | 2 | 0 | 0 | 0 |
| TRANSFER_TO_HAND | 1 | 1 | 0 | 1 | 0 |
| **計** | **36** | **35** | **1** | **17** | **0** |

### 条件の種類別

| 条件の種類 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| ①ターン中の履歴 | 6 | 6 | 0 | 3 | 0 |
| ②盤面数の比較 | 5 | 5 | 0 | 2 | 0 |
| ③状態フィルタ | 6 | 6 | 0 | 2 | 0 |
| ④選択集合の一致／総和制約 | 9 | 9 | 0 | 8 | 0 |
| ⑤ゾーン参照（チェックゾーン等） | 1 | 1 | 0 | 1 | 0 |
| ⑥その他 | 9 | 8 | 1 | 1 | 0 |
| **計** | **36** | **35** | **1** | **17** | **0** |

## 2. finding 全36件の分類

`真バグ＋機構待ち` は真バグにも機構待ちにも計上する。

| S番号 | effectId | parseStatus | 分類 | 根拠（1行ごとに固有） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WX24-P4-038-sub-E2 | live無し | 真バグ＋機構待ち | 親効果が全ルリグへ与える第2起動能力自体が live に無く、能力を得た各ルリグのレベルを相手SIGNIへ束縛する情報も保存されない。 | `effectExecutor.ts:2308-2465 resolveDynamicFilter`／`execBanish:1042-1228` | 最寄りは `TargetFilter.levelEqLrig` だが `:684` は self/opponent のセンタールリグ固定で、付与先アシストを含む「このルリグ」を指せない。 | このルリグと同じレベル |
| S002 | PR-205-E1 | AUTO | 真バグ＋機構待ち | `ON_REFRESH` と `refreshedOwner:self` はあるが、更新後の自分の `refresh_count_this_turn` が1である判定が無いため2回目にもBANISHが積まれる。 | `triggerCollect.ts:2134-2188 collectRefreshTriggers`／`refresh.ts:66,80` | 最寄りは `ANY_PLAYER_REFRESHED_THIS_TURN` だが `execUtils.ts:2154-2156` は両者の回数を `>0` でしか見ず、selfの `===1` を表せない。 | このターンであなたの最初のリフレッシュ |
| S003 | WXK01-072-E1 | AUTO | 真バグ | live は相手P12000以下だけを選び、自場ドライブSIGNI存在を検査する `HAS_CARD_IN_FIELD{owner:self,filter:{isDrive:true}}` が無い。 | `execUtils.ts:1713-1776 evalCondition`→`matchesStateFilter`（`effects.ts:652`） | `IS_DRIVE_STATE` は効果元自身用なので外した。今回は既存 `HAS_CARD_IN_FIELD`＋`TargetFilter.isDrive` で候補の状態を数えられる。 | あなたの場にドライブ状態のシグニがある場合 |
| S004 | WX17-046-E2 | AUTO | 真バグ＋機構待ち | `ON_SIGNI_BANISH_OPPONENT` は発火してもBANISH targetは無制限で、直前にバニッシュした triggering card の実効powerと等値比較するキーが存在しない。 | `triggerCollect.ts` の banish collector→`effectExecutor.ts:2308-2520 resolveDynamicFilter`→`execBanish` | 最寄りは `powerLteTrigger`（`effects.ts:699`）だが以下を許してしまい、「同じパワー」の min=max 等値にはならない。 | バニッシュしたシグニと同じパワー |
| S005 | WX14-025-E2 | AUTO | 真バグ | live のON_PLAY全体BANISHには自場のカード名にフレイスロを含むSIGNI3体の存在条件が丸ごと無い。 | `execUtils.ts:1713-1776 HAS_CARD_IN_FIELD`→`evalCondition` | `triggerScope` やON_PLAY対象自動化では枚数条件は生えない。既存 `HAS_CARD_IN_FIELD{minCount:3,filter:{cardNameContains:'フレイスロ'}}` で表せる。 | フレイスロ》を含むシグニが３体ある場合 |
| S006 | WXDi-D05-016-E2 | AUTO | 真バグ | live は無条件BANISHで、自分手札−相手手札が4以上という既存の符号付き差条件を搭載していない。 | `execUtils.ts:1624-1625 HAND_DIFF` | 値を持たない `HAND_COMPARE_OPP` は差4を表せないが、既存 `HAND_DIFF{operator:'gte',value:4}` は正確に表せる。 | あなたの手札が対戦相手より４枚以上多い場合 |
| S007 | WX13-013-E1 | AUTO | 真バグ＋機構待ち | targetはowner:anyの3体を独立選択するだけで、選択3体のeffective powerが全て同一かを確定時に検証しない。 | `execUtils.ts:2669-2720 satisfiesSelectionConstraint`／選択UI | 最寄りは `SelectionConstraint.same` だがinterface本体（`effects.ts:844-848`）は `'name'` のみで `same:'power'` が無い。 | 同じパワーを持つシグニ３体 |
| S008 | WXK02-042-E1 | AUTO | 真バグ | live はON_ATTACK_SIGNI直後にレベル2以下を戻し、既に記録される `turn_signi_returned_to_hand` を読む条件だけが欠落している。 | `effectEngine.ts:591-592 SIGNI_RETURNED_TO_HAND_THIS_TURN`（記録 `effectExecutor.ts:1262-1263,9242-9243`） | timing scopeは履歴条件を代替しない。既存ActiveCondition `SIGNI_RETURNED_TO_HAND_THIS_TURN{owner:self}` で足りる。 | このターンにシグニが場から手札に戻っていた場合 |
| S009 | WXDi-P13-067-E1 | AUTO | 真バグ＋機構待ち | 選択肢c1だけconditionが無く、相手場のホスト群について「付いたカード」または「スタック下」が1枚でもあるかを横断判定できない。 | `execUtils.ts:1713-1776 HAS_CARD_IN_FIELD`／fieldのattached・under状態参照 | 最寄りは `THIS_CARD_HAS_ATTACHED` だが効果元1体のチャーム/アクセ/ソウルだけを数え、相手場全体も通常のunderも扱わない。第12バッチ§4 S034と同一機構（owner拡張）で二重登録しない。 | シグニに付いているカードかシグニの下に置かれているカードがある場合 |
| S010 | SP27-010-E1 | AUTO | 真バグ | c1はDRAW1を2回直列実行し、相手の `actions_done` にUSE_SPELLが無い場合も追加1枚を引く。 | `execUtils.ts:1709-1712 SPELL_USED_THIS_TURN` | CHOOSEのchoice availabilityではなく追加DRAWだけを既存 `CONDITIONAL{SPELL_USED_THIS_TURN owner:opponent}` に包む必要があり、慣例による自動ゲートは無い。 | このターンに対戦相手がスペルを使用していた場合 |
| S011 | WXDi-P12-082-E1 | AUTO | 真バグ | c0のENERGY_CHARGE_FROM_DECKは選択時に常時実行され、自場Dissona SIGNIの存在を確認するconditionが付いていない。 | `execUtils.ts:1713-1776 HAS_CARD_IN_FIELD` | `ALL_FIELD_SIGNI_MATCH` は全員Dissonaを要求する別条件。既存 `HAS_CARD_IN_FIELD{owner:self,filter:{isDisona:true}}` が適合する。 | あなたの場に《ディソナアイコン》のシグニがある場合 |
| S012 | WX13-005B-E1 | AUTO | 真バグ＋機構待ち | ON_PLAYのCHOOSEは相手 `field.check` のカード型を一度も読み取らず、チェック中のスペルが無くても二択を発火する。 | `execUtils.ts:1474-2459 evalCondition`（新条件の消費候補）／`PlayerState.field.check` | 最寄りは `THIS_CARD_IN_LOCATION` だがsource自身の所在を見る型であり、opponentの単一check札をcardType filter付きで読む条件ではない。 | 対戦相手のチェックゾーンにスペルがある場合 |
| S013 | WX13-012-E1 | AUTO | 真バグ＋機構待ち | c0は任意SIGNIを1枚SEARCHするだけで、先に選んだ自SIGNIの `crossConditionText` を解析して構成名ごと各1枚を必須検索しない。 | `effectEngine.ts:3959-3973 getCrossConditionText/evaluateCrossCondition`／SEARCH executor | 最寄りは `requiredCardNames`（`LAST_PROCESSED_MATCHES`）だが検索候補集合を作る語彙ではなく、選択元のクロス構成名を後段へ展開できない。 | それのクロス条件に含まれるすべてのシグニを１枚ずつ |
| S014 | WXK10-003-E1 | AUTO | 真バグ＋機構待ち | c2はP12000以下なら常にBANISHでき、自場SIGNI数−相手場SIGNI数が-2以下という差を測るconditionがunionに無い。 | `execUtils.ts:1601 FIELD_COUNT` 近傍の `evalCondition` | 最寄りは `FIELD_COUNT` だが片側と定数の比較だけで、相手盤面との差2を同時に参照できない。 | あなたの場にあるシグニの数が対戦相手より２体以上少ない場合 |
| S015 | WXK10-003-E1 | AUTO | 真バグ＋機構待ち | c3のLIFE_CRASHは自ライフが相手より2枚以上少ないかを問わず選べ、live末尾にも差分閾値conditionが無い。 | `execUtils.ts:2120-2121 LIFE_COMPARE_OPP` | 最寄りは `LIFE_COMPARE_OPP{lt}` だが大小だけで差2を保持しないため、LIFE版DIFFが必要。 | あなたのライフクロスが対戦相手より２枚以上少ない場合 |
| S016 | WXK10-041-E3 | AUTO | 偽陽性 | `cost.beat_signi:1` の候補は原文から《炎魔の不正 ベリアル》以外を抽出し、同名SIGNIを `eligibleOtherZones` から既に除く。 | `execUtils.ts:1005-1030 analyzeBeatSigniCost`（`excludedName` と候補filter） | JSON表面にfilterが無い点は原文regex駆動の既存慣例。`payBeatSigniCost:1037-1080`も同じ解析結果だけから支払う。 | 《炎魔の不正　ベリアル》以外のシグニ１体を【ビート】にする |
| S017 | WXDi-P15-088-E1 | AUTO | 真バグ＋機構待ち | ON_TURN_ENDで常時エナチャージし、相手側 `signi_banished_this_turn` が2以上かを読む条件型が無い。 | `BattleScreen.tsx:3124-3130`（記録）→`checkActiveCondition`（新consumer候補） | 最寄りは第12バッチ§4 S021の同カウンタgte1条件だが、現unionにも未着地で閾値2とowner指定を表せない。同一機構として二重登録しない。 | このターンに対戦相手のシグニが２体以上バニッシュされていた場合 |
| S018 | WXK09-036-E1 | AUTO | 真バグ＋機構待ち | ON_PLAYエナチャージは自場3スタックのいずれかにunder cardがあるかを走査せず必ず実行される。 | `execUtils.ts:1713-1776 HAS_CARD_IN_FIELD` 近傍／field.signi stack走査 | 最寄りは `THIS_CARD_HAS_UNDER` だがsource自身のstackしか見ない。第12バッチ§4 S034の「自場host全体のattached/under存在OR」と同一機構で二重登録しない。 | あなたのシグニの下にカードがある場合 |
| S019 | WXEX2-19-E1 | AUTO | 真バグ | TRASH_CARD filterはlevel≤2とSIGNIだけで、既存 `hasIcon:'アクセ'` が無いため非アクセ札もエナへ送れる。 | `matchesFilter`（`TargetFilter.hasIcon` は `effects.ts:743`）→`execEnergyCharge` | `hasAcce` は「アクセが付いたホスト」の状態で別物。カード印字アイコンは既存 `hasIcon:'アクセ'` が正しい。 | 《アクセアイコン》を持つレベル２以下のシグニ |
| S020 | WXK08-023-E1 | AUTO | 真バグ | CONTINUOUSは常に能力を付与し、登録者100万以上とsourceが中央zoneのANDが親activeConditionに無い。 | `effectEngine.ts:496-509 SUBSCRIBER_COUNT`／`IS_SELF_IN_CENTER_ZONE`→`collectGrantedFromLayer` | `thisCardOnly` は付与対象だけを固定し発動条件にはならない。既存ActiveCondition `AND[SUBSCRIBER_COUNT gte100,IS_SELF_IN_CENTER_ZONE]` で足りる。 | 登録者数が１００万人を達成していて、このシグニが中央のシグニゾーンにあるかぎり |
| S021 | WX09-Re06-E1 | AUTO | 真バグ＋機構待ち | ACTIVATED解決時に即LIFE_CRASHし、ON_REFRESH遅延予約も「更新後count=1」の序数ゲートも存在しない。 | `triggerCollect.ts:2169-2188` delayed ON_REFRESH collector／`INSTALL_DELAYED_TRIGGER` executor | 最寄りは `ANY_PLAYER_REFRESHED_THIS_TURN` だが過去に1回でもrefresh済みなら真で、将来のself最初のrefreshだけを予約できない。S002と同一のrefresh序数機構。 | それがこのターンであなたの最初のリフレッシュである場合 |
| S022 | WX25-P3-109-E1 | AUTO | 真バグ＋機構待ち | ON_TRASHにcause制限が無く、さらにdeck経路collectorは `byEffect` を読まず、hand/energy経路も `byOwnEffect` しか評価しないため単なるJSON追記では全領域を正しく塞げない。 | `triggerCollect.ts:859-925 collectDeckTrashSelfTriggers/collectAnyZoneTrashSelfTriggers` と `:925-990 collectTrashTriggers` | 最寄りは `triggerCondition.byEffect` だがfield経路だけが`:972`で消費し、deck・any-zone入口では無視されるため配線待ち。 | 効果によっていずれかの領域からトラッシュに置かれたとき |
| S023 | WXDi-P11-068-E1 | AUTO | 真バグ | ON_TURN_ENDのPOWER_MODIFYに、このターン自分が捨てた累計2枚以上を読む既存条件が付いていない。 | `effectEngine.ts:464-466 TURN_HAND_DISCARD_GTE`（記録 `effectExecutor.ts:1862-1891,9342-9361`） | `hand_discarded_just` は直前イベント用。ここは既存ターン累計 `TURN_HAND_DISCARD_GTE{value:2}` が正確。 | このターンにあなたがカードを２枚以上捨てていた場合 |
| S024 | SPK01-15-E2 | AUTO | 真バグ | ON_PLAY時に相手手札−自分手札が5以上でなくても-10000を適用し、差分条件がliveから脱落している。 | `execUtils.ts:1624-1625 HAND_DIFF` | `HAND_COMPARE_OPP` の単純gtでは差1でも通る。視点selfの `HAND_DIFF{operator:'lte',value:-5}` なら既存consumerで表せる。 | 対戦相手の手札があなたより５枚以上多い場合 |
| S025 | WX06-016-BURST | AUTO | 真バグ＋機構待ち | SEARCHは天使2枚を独立に選べ、確定した2枚のLevel文字列が同一であることを検索UIが検証しない。 | SEARCH pendingの選択確定→`satisfiesSelectionConstraint`相当の集合検証 | 最寄りは `SelectionConstraint.same` だが隣接interfaceを開いても `'name'` のみで `same:'level'` は存在しない。 | それぞれ同じレベルの＜天使＞のシグニ２枚 |
| S026 | WX21-010-E1 | AUTO | 真バグ＋機構待ち | SEQUENCE先頭BANISHは相手2体を任意選択し、後段色判定以前に2体のpower同一性を強制しない。 | `execUtils.ts:2669-2720 satisfiesSelectionConstraint`→`execBanish` | 最寄りはS007と同じ `SelectionConstraint.same` で、`same:'power'` が無い。同一機構として1件に束ねる。 | 同じパワーを持つ対戦相手のシグニ２体 |
| S027 | WDK05-T13-E1 | AUTO | 真バグ | optional BOUNCE成功後にdeck topを公開するが、最後のADD_TO_FIELDは公開札のcardTypeを確認せず無条件に走る。 | `execUtils.ts:1813 DECK_TOP_MATCHES`／`execAddToField` の `DECK_CARD.fromTop` | did-itゲートはBOUNCE→LOOKの実行可否しか保証しない。既存 `CONDITIONAL{DECK_TOP_MATCHES SIGNI}` とfromTop sourceで表せる。 | それがシグニの場合、それを場に出す |
| S028 | WX24-P4-003-E1 | AUTO | 真バグ＋機構待ち | BOUNCEが記録した相手SIGNIと同powerの自trash札を選ぶ必要があるが、TRANSFER_TO_HAND filterには等値動的キーが無い。 | `effectExecutor.ts:2308-2520 resolveDynamicFilter`→TRANSFER_TO_HAND candidate filter | 最寄りは `powerLteLastProcessed` だが低い札も許す。S004のtrigger基準とはproducerが違うものの `powerEqLastProcessed` 等値基盤を共有できる。 | それと同じパワーのシグニ |
| S029 | WX05-023-E3 | AUTO | 真バグ | PLACE_UNDER_SIGNIの後にTRASHが裸で続くため3枚設置成功時にもsourceを捨てるが、処理結果枚数を読む既存条件で失敗側だけ包める。 | `execUtils.ts:2317-2402 LAST_PROCESSED_MATCHES`→SEQUENCE continuation | did-itの成功時次段ゲートは向きが逆。`LAST_PROCESSED_MATCHES{operator:'lt',value:3}` なら「そうしない場合」を既存語彙で表せる。 | そうしない場合、このシグニを場からトラッシュに置く |
| S030 | WXK03-062-E1 | AUTO | 真バグ | CONTINUOUSのPOWER+4000と耐性は常時収集され、相手手札が自分より2枚多い間だけというactiveConditionが無い。 | `effectEngine.ts:284-297 HAND_DIFF`→`calcFieldPowers`／protection collector | `COUNT_THRESHOLD`を別々に置くと相対差にならない。既存ActiveCondition `HAND_DIFF{operator:'lte',value:-2}` で両stepを共通ゲートできる。 | 対戦相手の手札があなたより２枚以上多いかぎり |
| S031 | WXK04-025-CB-E2 | AUTO | 真バグ | costでエナから捨てた枚数を問わず2つ目のPOWER_SETが1体へ走り、原文の5枚以上かつ相手全体の両要件を外している。 | `execUtils.ts:2195-2223 COST_TRASHED_MATCHES(minCount)`→`execPowerSet` | `temp_power_mods`やPOWER_SET source自動適用は対象数をALLへ変えない。既存 `COST_TRASHED_MATCHES{minCount:5}` とcount:ALLで足りる。 | ５枚以上トラッシュに置いた場合、対戦相手のすべてのシグニの基本パワーを１にする |
| S032 | WXK04-025-CB-E2 | AUTO | 真バグ | 3段目は9枚条件も被BANISH時付与も失い、代わりに即時LIFE_CRASHを無条件実行するため作用自体が別物。 | `execUtils.ts:2195-2223 COST_TRASHED_MATCHES`→`GRANT_EFFECT`／ON_BANISH collector | `LIFE_CRASH`を遅延扱いする慣例は無い。既存9枚cost条件のthenに相手全SIGNIへの被バニッシュAUTO付与を置く必要がある。 | ９枚以上トラッシュに置いた場合、追加で…「バニッシュされたとき…クラッシュ」を得る |
| S033 | WX25-P1-113-E1 | AUTO | 真バグ | c0には `colorMatchesLastProcessed` がある一方c1 filterはcardTypeだけで、移動札とのCardName完全一致を落としている。 | `effectExecutor.ts:2308-2333 resolveDynamicFilter(nameEqLastProcessed)`→`execPowerModify` | CHOOSEは先頭TRANSFERのlastProcessedを消さない。既存 `nameEqLastProcessed:true` をc1へ付ければよく新機構不要。 | この効果でデッキに移動したシグニと同じカード名 |
| S034 | WX22-Re06-E1 | AUTO | 真バグ | TRASH後のlevel合計3条件だけはあるが、9以上のLIFE_CRASHはCONDITIONAL外に裸で置かれている。 | `execUtils.ts:2246-2256 LAST_PROCESSED_LEVEL_SUM`→`execLifeCrash` | 前段3以上のconditionは後続へ持続しない。既存 `LAST_PROCESSED_LEVEL_SUM{gte,9}` でこのstepを個別に包める。 | レベルの合計が９以上の場合 |
| S035 | WX22-Re06-E1 | AUTO | 真バグ | 同じSEQUENCEのDRAW2もlevel合計6を読まず、0枚トラッシュでも2枚引ける構造になっている。 | `execUtils.ts:2246-2256 LAST_PROCESSED_LEVEL_SUM`→DRAW executor | `conditional:true`のSEQUENCE慣例は直前成功だけで数値6を導かない。既存合計condition gte6が必要。 | ６以上の場合、カードを２枚引く |
| S036 | WXK11-023-BURST | AUTO | 真バグ＋機構待ち | TRASH_CARD2枚は各自filter一致だけで、選んだ2枚のlevelが互いに同じかを確定時に調べない。 | `execUtils.ts:2669-2720 satisfiesSelectionConstraint`／TRANSFER_TO_HAND選択UI | 最寄りはS025同様 `SelectionConstraint.same` だが `'name'` 限定で `same:'level'` が無い。同一機構として束ねる。 | 同じレベルのシグニ２枚 |

## 3. action型ごとの所見・重複effectId

- BANISH 6件は、既存条件で直せる盤面存在・手札差（S003/S005/S006）と、refresh序数・動的power等値・集合same power（S002/S004/S007）に分かれた。
- CHOOSE 7件はchoiceごとのcondition脱落が中心。ただしS012のcheck zone、S013のクロス構成展開、S014/S015の差分閾値は新consumerが要る。
- `ENERGY_CHARGE_FROM_DECK` 2件はどちらも無条件化しているが、S017はターン履歴閾値、S018は場全体under存在で別機構。
- SEQUENCEは、既存 `LAST_PROCESSED_*` / `COST_TRASHED_MATCHES` で直せるS027/S029/S031-S035と、値受渡し・集合一致が不足するS026/S028に分かれた。
- 重複effectId 3組は、`WXK10-003-E1`（S014/S015＝選択肢3のfield差と選択肢4のlife差）、`WXK04-025-CB-E2`（S031/S032＝同一cost枚数の5/9閾値）、`WX22-Re06-E1`（S034/S035＝同一lastProcessed level sumの9/6閾値）として各1真因の多段条件脱落に束ねた。

## 4. 機構待ち一覧

| effectId / finding | 不足語彙・機構・配線 |
|---|---|
| WX24-P4-038-sub-E2 / S001 | 付与された起動能力が「このルリグ」のinstance/slotを後段targetへ渡し、その実効levelと相手SIGNIをeq比較する動的filter。`levelEqLrig`（center固定）では不可。第8バッチ§4 S031のLRIG付与先候補化基盤と共有し、二重登録しない。 |
| PR-205-E1 / S002、WX09-Re06-E1 / S021 | ON_REFRESH収集時にrefreshed ownerの更新後 `refresh_count_this_turn` をoperator/valueで判定する序数ゲート。S021は同じ情報をdelayed triggerへ載せる。 |
| WX17-046-E2 / S004、WX24-P4-003-E1 / S028 | trigger cardまたはlastProcessed cardの実効powerを後段 `powerRange.min=max` へ解決するeq producer。既存lte/ltでは代用不可。 |
| WX13-013-E1 / S007、WX21-010-E1 / S026 | `SelectionConstraint.same:'power'` と `satisfiesSelectionConstraint`・選択UIのeffective power配線。 |
| WXDi-P13-067-E1 / S009、WXK09-036-E1 / S018 | **第12バッチ§4 S034と同一機構**＝指定ownerの場の全hostについてattached/under存在をOR評価するCondition。owner self/opponentを共通化し二重登録しない。 |
| WX13-005B-E1 / S012 | opponent `field.check` のcardを `TargetFilter` で検査するCHECK_ZONE_HAS_CARD Conditionと`evalCondition`配線。 |
| WX13-012-E1 / S013 | 事前選択したSIGNIの`crossConditionText`から構成CardName群を取り出し、SEARCHをnameごとのexact quotaへ分割する配線。 |
| WXK10-003-E1 / S014 | 自場SIGNI数−相手場SIGNI数をoperator/value比較するFIELD_SIGNI_DIFF Condition。`FIELD_COUNT`隣接フィールドにも該当差分型なし。 |
| WXK10-003-E1 / S015 | 自life−相手lifeをoperator/value比較するLIFE_DIFF Condition。`LIFE_COMPARE_OPP`は差の大きさを捨てる。 |
| WXDi-P15-088-E1 / S017 | **第12バッチ§4 S021と同一機構**＝指定ownerの`signi_banished_this_turn`をoperator/valueで読むCondition。今回はopponent/gte2。 |
| WX25-P3-109-E1 / S022 | `collectDeckTrashSelfTriggers` と `collectAnyZoneTrashSelfTriggers` に `triggerCondition.byEffect` を配線し、field/deck/hand/energy/underの全入口で同じ原因判定にする。 |
| WX06-016-BURST / S025、WXK11-023-BURST / S036 | `SelectionConstraint.same:'level'` をSEARCH/TRANSFER双方の確定判定とUIへ配線。 |

機構待ちは17 findings、12行（共有機構で集約）。

## 5. 偽陽性件数の自己評価

明細をconsumer調査する前の事前予測は **0〜2件**。理由は、condition軸はlive JSONに条件節が露骨に無い例が大半で、偽陽性候補は原文regex駆動コスト（S016）とdid-it/lastProcessed慣例（S027/S029）に限られると見たためである。

実測は **1件（S016）** で予測帯の中央。S016は第7バッチ総括の13機構にある `analyzeBeatSigniCost` の原文regex駆動そのものだった。一方S027はDECK_TOP_MATCHESがliveに無く、S029は成功時ゲートと必要な失敗時分岐の向きが逆だったため真バグに残った。分類を真バグ側へ一律に寄せた結果ではない。

## 6. 条件以外で見つけた原文との食い違い

**5件（7項目）**。

- S013 `WX13-012-E1`：選択肢①はクロス構成条件だけでなく、先行する「あなたのシグニ1体を対象」のtarget選択自体もliveに無い。
- S015 `WXK10-003-E1`：live明細が長行で切れていたため実体を確認したところ、選択肢④のactionは存在するが差分条件だけが欠落（追加の作用差なし）。これは食い違い0件として数えない。
- S025 `WX06-016-BURST`：同level条件のほか、原文の「公開し」に対応するREVEALはあるため追加差なし。これも件数に数えない。
- S031 `WXK04-025-CB-E2`：条件以外に、5枚段のtargetが相手ALLではなく1体。
- S032 同effect：9枚段が「被バニッシュ時能力を相手全体へ付与」ではなく即時LIFE_CRASHへ別action化。
- S034/S035 `WX22-Re06-E1`：先頭TRASHに原文の黒filterが無い。また12以上段のADD_TO_FIELDが3枚までかは明細長行から欠けたためlive実体を確認し、既存sourceはcount 3/upTo trueで一致（追加差なし）。
- S020 `WXK08-023-E1`：内側耐性の `from:['BANISH']` 表現は現collectorの正準化課題（第1バッチC010／第4バッチE020）と同系統だが、今回の指摘外で既知のため新規機構登録しない。

件数に計上したのは S013 1、S031 1、S032 1、S034/S035各1の計5 findings・7項目（S034/S035の黒filter脱落は同一項目を両findingに付随）。

## 7. ゲート・差分・成果物確認

- `npm run gates`：**全緑**。typecheck PASS／golden **2337/0**／smoke **10693・OK 10693・CRASH 0・HANG 0・INVARIANT 0・SKIP 0**／fuzz **CRASH 0・HANG 0・INVARIANT 0・EXPLOSION 0**／census **773/773**／census:stubs **A群0・C群0**／manual-fields **0**／lint **0 errors・260 warnings**。
- `git status --short`：作業前からの `M` は `scripts/archive/semanticAuditLedger.mjs` と `scripts/archive/semanticAuditMkBatchSingles.mjs` の2本だけ。`??` は既存の第8〜第13成果物、第14明細・index、および今回新規の `stage1_batch14_triage.md`。スコープ外の新規・変更は0。
- `git diff --stat`：上記計器2本のみ、`7 +++++--`／`5 ++++-`、合計 **2 files changed, 9 insertions(+), 3 deletions(-)**。報告書はuntrackedなのでstat外。
- 報告書 `wc -c`（PowerShell `Get-Item.Length`による同値のbyte実測）：**30054 bytes**。先頭20行はタイトル・§1 action表が正常、末尾20行は§7〜§8が欠落なく閉じることをUTF-8で再読した。
- parseStatusを明細grepで読めなかった7件の結論：S001は**live無し**（したがってparseStatus無し）。残るS009/S010/S012/S014/S015/S033の6件は、明細のlive JSONが長く生成上切れていただけで、実ファイルをJSONとして読んだ結果すべて**AUTO**。よって全体は **AUTO 35件・live無し1件**（finding単位。重複effectIdを含む）で、PARTIAL/MANUALは0件。

## 8. ガードレール適用で当初見立てから変えた件

- S003：状態語彙不足を疑ったが、`TargetFilter`本体の `isDrive` と `matchesStateFilter` consumerを確認し、機構待ちから通常の真バグへ変更。
- S006/S024/S030：単純比較しか無いとの初見を、`HAND_DIFF`がCondition/ActiveCondition双方にあり差4/5/2を保持できる実測により通常真バグへ変更。先回りメモASと一致。
- S016：JSONにbeat対象filterが無いので真バグと見たが、`analyzeBeatSigniCost`が原文から《X》以外を抽出し支払候補を除くconsumerを確認して偽陽性へ変更。
- S019：`hasAcce`しか無い疑いを、隣接フィールド `hasIcon:'アクセ'` とfilter consumerの確認で通常真バグへ変更。
- S020：登録者数100万をSTUB候補と見たが、`SUBSCRIBER_COUNT`と`IS_SELF_IN_CENTER_ZONE`の両ActiveCondition consumerが実装済みだったため機構待ちを外した。
- S025/S036：`LAST_PROCESSED_MATCHES.shareLevel`流用を検討したが、これは処理後の件数判定で選択集合を拘束しない。`SelectionConstraint`本体を前後込みで開き `same:'name'` のみと確認して機構待ちへ変更。
- S027：公開後の型判定機構不足を疑ったが、既存 `DECK_TOP_MATCHES` と `fromTop` sourceを確認して通常真バグへ変更。
- S029：did-it失敗分岐の新機構を疑ったが、`LAST_PROCESSED_MATCHES`のoperator/value consumerが既にあり、設置数lt3で表現可能として機構待ちを外した。
- S031/S032：可変cost枚数の履歴不足を疑ったが、`COST_TRASHED_MATCHES.minCount`が型とconsumer双方にあり、5/9閾値を既存語彙で表せると判明。
- 先回りメモAQ〜AVとの実測食い違いは**0件**。AQの注意どおり総和フィールドはEffectTarget側、SelectionConstraintの`same`はnameだけ、ARのrefresh counter自体は存在するが序数condition無し、ASのHAND_DIFFは既存・SIGNI/LIFE差分は無し、ATのshareLevelは値を後段へ渡さず、AUのisDriveは既存、AVのcheck zoneはstateだけ存在しCondition無し、をそれぞれinterface本体とconsumerで確認した。
