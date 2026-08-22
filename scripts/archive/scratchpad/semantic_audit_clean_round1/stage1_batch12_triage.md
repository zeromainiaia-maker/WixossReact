# 意味照合監査 clean群 round1 段1 第12バッチ triage（軸 timing/trigger）

## 1. サマリ

機構待ちは真バグとの重複計上。偽陽性2件はいずれも `ON_SIGNI_BANISH_OPPONENT` がバトル経路限定である engine 慣例に段0指摘が衝突したもの。

| action型 | 件数 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 2 | 2 | 0 | 2 | 0 |
| ADD_TO_FIELD | 4 | 4 | 0 | 0 | 0 |
| BANISH | 1 | 1 | 0 | 1 | 0 |
| BLOCK_ACTION | 2 | 2 | 0 | 2 | 0 |
| DOWN | 2 | 2 | 0 | 2 | 0 |
| DRAW | 5 | 5 | 0 | 4 | 0 |
| ENERGY_CHARGE_FROM_DECK | 8 | 7 | 1 | 4 | 0 |
| FREEZE | 1 | 1 | 0 | 0 | 0 |
| GRANT_KEYWORD | 2 | 2 | 0 | 2 | 0 |
| LIFE_CRASH | 1 | 1 | 0 | 0 | 0 |
| LOOK_AND_REORDER | 1 | 1 | 0 | 0 | 0 |
| POWER_MODIFY_PER_LRIG_LEVEL | 1 | 1 | 0 | 1 | 0 |
| POWER_MODIFY | 4 | 4 | 0 | 2 | 0 |
| SEARCH | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/BLOCK_ACTION/PLAYER) | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/TRANSFER_TO_DECK/TRASH_CARD) | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/TRASH/DECK_CARD) | 1 | 1 | 0 | 1 | 0 |
| UP | 2 | 1 | 1 | 1 | 0 |
| **計** | **40** | **38** | **2** | **25** | **0** |

「指摘の正体」の検算は、① `activeCondition` / `condition` の欠落 **25件**、②真に timing/trigger の誤り（段0指摘が偽陽性だった2件を含む）**11件**、③置換効果 **1件**、④その他（禁止内容・使用可能 timing・複合効果の誤変換）**3件**。軸名に反して条件欠落が62.5%を占めた。

## 2. finding 全40件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠（固有事実） | consumer（読む関数名。無ければ「無し＝機構待ち」） | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WXK06-023-E1-G | 読取不能（live null） | 真バグ＋機構待ち | live効果自体が無く、`PlayerState` のアタック関連 `_this_turn` は追加攻撃フェイズ・攻撃禁止・攻撃無効化禁止だけで回数台帳がないため、主語=シグニ、単位=回、閾値gte 4を判定不能。 | 無し＝機構待ち（シグニ攻撃宣言funnel＋`collectTurnTriggers`） | `extra_attack_phases_this_turn` はフェイズ追加数であり攻撃回数ではない。 | このターンにシグニが４回以上アタックしていた場合 |
| S002 | WXDi-D04-004-sub-E1 | 読取不能（live null） | 真バグ＋機構待ち | `ON_ATTACK_END` と `attackDealtNoDamage` は存在するが、`collectAttackEndTriggers` は attacker自身の `effectsMap` だけを走査し、ルリグへ一時付与された能力ストアを合流しない。 | 無し＝機構待ち（`collectAttackEndTriggers` にルリグ付与AUTO合流） | WXK11-018のシグニ専用慣例は確認したが、今回の付与先はルリグで同じ経路に載らない。 | そのアタック終了時、そのアタックによって…ダメージが与えられていなかった場合 |
| S003 | WX25-CP1-066-E1 | AUTO | 真バグ | liveは無条件 `ADD_TO_FIELD`。`HAS_CARD_IN_FIELD{owner:self,filter:{cardName:雷ちゃん},negate:true}` は自場・不在・1体閾値を正確に表し、`evalCondition` が候補数を評価できる。 | `evalUseCondition` → `evalCondition(HAS_CARD_IN_FIELD)` | `owner:self`の向き、原因非依存、閾値0（negate）を確認し、場が空くまで自動抑止する慣例は無い。 | あなたの場に《雷ちゃん》がない場合 |
| S004 | WXK01-055-E1 | AUTO | 真バグ | `ON_TRASH` と `fromZones:['hand']` はあるがMAIN限定が無い。`DURING_PHASE{phases:['MAIN']}` は実在 `TurnPhase` 値を `evalCondition` が包含比較する。 | `collectAnyZoneTrashSelfTriggers` → `evalUseCondition` | `ON_TRASH` 自体はフェイズを限定せず、無効値 `ATTACK_SIGNI_OP` ではなく実在値 `MAIN` を使う必要を確認。 | あなたのメインフェイズ |
| S005 | WXK01-104-E1 | AUTO | 真バグ | deck起点だけが `triggerCondition.fromZones` に載り、MAIN条件が脱落。条件の向き=self phase、原因=deck trash、閾値=単一phaseは既存 `DURING_PHASE['MAIN']` で分離できる。 | `collectDeckTrashSelfTriggers` / `evalUseCondition` | デッキから落ちたことはMAIN中を含意しないため、origin慣例では代用不可。 | あなたのメインフェイズの場合 |
| S006 | WXK01-055-E1 | AUTO | 真バグ | liveに手札枚数条件が無く、`HAND_COUNT{owner:self,operator:lte,value:2}` は自分向き・原因非依存・2枚以下をそのまま評価する。 | `evalUseCondition` → `evalCondition(HAND_COUNT)` | `optional:true` は場出しの任意性だけで、手札3枚以上を抑止しない。 | あなたの手札が２枚以下 |
| S007 | WD21-017-E1 | AUTO | 真バグ＋機構待ち | liveはfield→trashの `ON_TRASH` だけ。原文は「効果かレゾナ出現条件」によるON_BANISHとのORだが、離場selfループはcause gateを読まず、バニッシュは通常energyへ行くため一本化不能。 | 無し＝機構待ち（`collectBanishTriggers`＋`collectLeaveFieldTriggers` self cause OR） | `ON_LEAVE_FIELD`単独なら全原因・全行先へ広がり、現行`ON_TRASH`単独ならバニッシュを拾わない。 | 効果かレゾナの出現条件によって、バニッシュされるか場からトラッシュに置かれたとき |
| S008 | WX05-022-E1 | AUTO | 真バグ＋機構待ち | `DRAW_OUTSIDE_DRAW_PHASE` はドロー可否だけのactionIdで、効果によるADD_TO_HAND/SEARCH回収を同じフェイズ例外付きで拒否する消費口が無い。 | 無し＝機構待ち（手札追加funnel＋継続禁止収集） | DRAW禁止が手札追加まで暗黙に包含する慣例は各ADD_TO_HAND executorに存在しない。 | カードを引いたりカードを手札に加えることができない |
| S009 | WX05-022-E1 | AUTO | 真バグ＋機構待ち | liveは相手のターン条件を持たず、固定IDはDRAW phaseだけを例外化してGROWを例外にできない。`DURING_PHASE`は包含表なので「GROW/DRAW以外」の禁止を安全に直接表せない。 | 無し＝機構待ち（`DRAW_OUTSIDE_DRAW_PHASE` consumerをturn owner＋除外phase対応） | 全フェイズ列挙はTurnPhase追加で漏れ、CONTINUOUS actionのconditionが禁止時点で再評価される保証もないため外した。 | 対戦相手は自分のターンの間、グロウフェイズとドローフェイズ以外 |
| S010 | WX24-P3-043-E1 | AUTO | 真バグ＋機構待ち | liveはATTACK時にシグニ1体をDOWNする別効果。原文は被ダメージ直前の任意置換で対象もレベル1以上のアップ状態アシストルリグ2体であり、既存 `DAMAGE_REPLACE_BY_COST` と同じ同期・自動近似枠。 | 無し＝機構待ち（PLAN §6.4 O-37(a)、`crashOneLife`／ルリグアタック応答） | 通常DOWNの選択実行ではダメージfunnelへ介入せず、対象型SIGNIもアシストLRIGを含まない。 | ダメージを受ける場合、代わりに…アシストルリグ２体をダウンしてもよい |
| S011 | WXDi-D06-013-E1 | AUTO | 真バグ＋機構待ち | self `ON_BANISH` はcauseを受け取る一方、selfループは「バトル以外」ゲートを読まない。原因の否定はowner方向ではなくbattleAttacker有無を判別する必要がある。 | 無し＝機構待ち（`collectBanishTriggers` self section） | `banishedByOwnEffect` は自分効果だけへ狭め、相手効果・ルール処理を落とすので「バトル以外」と非同義。 | バトル以外によってバニッシュされたとき |
| S012 | WXK02-034-E1 | AUTO | 真バグ＋機構待ち | `signi_banished_this_turn` は被バニッシュ側へ積む単なる数で、battle/effect原因を区別せずdiff再評価の多重計上を許すため、自分効果・相手SIGNI・gte 2の三点を満たさない。 | 無し＝機構待ち（`collectBoardDiffTriggers` 記録側＋`evalCondition`） | カウンタ存在だけでは原因精度と2体閾値精度が足りないため流用を棄却。 | あなたの効果によって対戦相手のシグニを２体以上バニッシュしていた場合 |
| S013 | WXDi-P12-056-E1 | AUTO | 真バグ＋機構待ち | ENERGY_COUNT_FILTERとTRASH_HAS_CARDは各zoneを別々に数えるだけで、ディソナiconのenergy+trash合計をgte 7比較する複数zone加算条件がない。 | 無し＝機構待ち（`evalCondition` 複数zone count） | ANDで各zone閾値を置くと「合計7」を配分固定してしまい、向きself・単位枚の意味を保てない。 | エナゾーンとトラッシュに…合計７枚以上 |
| S014 | WX15-048-E1 | AUTO | 真バグ＋機構待ち | trapは `field.signi_traps` に保持されるが、場に1つ以上あることを読むCondition/ActiveConditionが無い。 | 無し＝機構待ち（`evalCondition` / `checkActiveCondition`） | `placedOnTrapZone` はON_PLAYした相手シグニのzone照合用で、自場trap存在条件ではない。 | あなたの場に【トラップ】がある場合 |
| S015 | WXK01-084-E1 | AUTO | 真バグ | 効果元自己条件用 `IS_SELF_IN_CENTER_ZONE` があり、`checkActiveCondition` はsourceのfield index=1を判定するため、対象filter用 `centerZoneOnly` を借りる必要がない。 | `collectTurnTriggers` → `checkActiveCondition(IS_SELF_IN_CENTER_ZONE)` | `centerZoneOnly` は候補対象用だが、自己条件専用語彙を確認して用途混同を外した。 | このシグニが中央のシグニゾーンにある場合 |
| S016 | WXDi-P02-070-E1 | AUTO | 真バグ＋機構待ち | 「シグニゾーンの裏向きカード」は実体が `signi_traps` だが、それをself・gte 1で読む条件型がなくliveは無条件DRAW。 | 無し＝機構待ち（S014と同じtrap存在consumer） | 通常のfield.signiは表向きstackだけで、HAS_CARD_IN_FIELDでは裏向きtrapを候補化しない。 | あなたのシグニゾーンに裏向きのカードがある場合 |
| S017 | WX24-P3-055-E2 | AUTO | 真バグ | liveの `ON_ATTACK_SIGNI` は宣言時。既存 `ON_ATTACK_END` は個別攻撃解決末尾で、`attackDealtNoDamage:true` とonce_per_turnを同時に評価できる。 | `collectAttackEndTriggers` | ON_ATTACK_SIGNIの後段遅延慣例はなく、即時エナチャージを終了時扱いにはしない。 | そのアタック終了時、そのアタックによって…ダメージを与えていなかった場合 |
| S018 | WX03-031-E1 | AUTO | 真バグ | `ON_OPP_LIFE_CRASHED` collectorは実際の `crashSourceCardNum` を持ち、`triggerScope:any_ally`＋SIGNI filterなら自分側・シグニ原因・1枚クラッシュを限定できるがliveはscope/filterなし。 | `collectOppLifeCrashedTriggers` | timing名だけでは発生源を限定せず、効果クラッシュも同じチェックzone funnelを通る。 | あなたのシグニが対戦相手のライフクロス１枚をクラッシュしたとき |
| S019 | WX08-042-E2 | AUTO | 真バグ | live timingは空。`ON_ENERGY_TO_FIELD` collectorは配置ownerがwatcher自身かを照合し、移動カードをtriggeringCardNumに載せるため主語=あなたのSIGNIをfilter可能。 | `collectEnergyToFieldTriggers` | 空timingのAUTOを盤面diffが暗黙収集する慣例はない。 | あなたのシグニ１体がエナゾーンから場に出たとき |
| S020 | WXDi-P11-TK04-E1 | AUTO | 偽陽性 | `ON_SIGNI_BANISH_OPPONENT` はBattleScreenのバトルバニッシュ経路だけで収集され、`triggerScope:any_ally` は自分のいずれかのシグニが行った場合を表す。 | `resolvePendingSigniBattleFor` 内 `ON_SIGNI_BANISH_OPPONENT` collector | 効果バニッシュは別 `ON_SIGNI_BANISH_OPPONENT_BY_EFFECT` なので、原因=バトル・主語=自軍・閾値1が既に保証される。 | あなたのシグニがバトルによって対戦相手のシグニ１体をバニッシュしたとき |
| S021 | WXK04-029-E2 | AUTO | 真バグ＋機構待ち | opponent stateの `signi_banished_this_turn>=1` は存在確認用途なら多重計上が無害だが、一般Condition型とconsumerが無くlive ON_PLAYは無条件。 | 無し＝機構待ち（`evalCondition`。記録は`collectBoardDiffTriggers`を再利用可） | ADの警告を適用し、原因不問・gte 1なので既存カウンタの向きと精度は足りるが、条件型が無い点を分離した。 | このターンに対戦相手のシグニがバニッシュされていた場合 |
| S022 | WXDi-P07-045-E1 | AUTO | 真バグ＋機構待ち | `FIELD_SIGNI_POWER_COUNT` は個体数しか数えず、self fieldの実効power総和をeq 30000で比較する条件が存在しない。 | 無し＝機構待ち（`evalCondition`＋effectivePowers） | 表記power合算では修正値を落とし、gte条件への近似は「ちょうど」の向きを壊す。 | 場にあるシグニのパワーの合計が30000の場合 |
| S023 | WX11-045-E2 | AUTO | 真バグ＋機構待ち | `banishedByOwnEffect` は型にあるが、`collectBanishTriggers` のself section 1132-1163はそのcause gateを評価しないため、JSON追加だけでは恒久no-op条件になる。 | 無し＝機構待ち（`collectBanishTriggers` self sectionへcause gate） | any_ally watcher側の同名fieldは読むが、このカード自身が離場済みのself経路とは配線先が違う。 | このシグニが効果によってバニッシュされたとき |
| S024 | WX07-009-E1 | AUTO | 真バグ＋機構待ち | appearanceConditionは白・非レゾナSIGNIを2体払うことだけを保持し、実際に支払った2体のCardName同一性を後続ON_PLAY条件へ渡す台帳がない。 | 無し＝機構待ち（出現条件支払いfunnel→`collectPlacedSelfOnPlayTriggers`） | `distinctName` は種類数を数える語彙であり「2枚が同じ名前」のeq関係を表さない。 | 出現条件で同じ名前のシグニ２体をトラッシュに置いていた場合 |
| S025 | WXDi-P13-070-E2 | AUTO | 真バグ | `cards_drawn_by_effect_this_turn` は効果ドローだけをself側へ正確に累積し、`CARDS_DRAWN_BY_EFFECT{owner:self,gte,2}` を `evalCondition` が読む。 | `collectTurnTriggers` → `evalUseCondition` | 通常ドローを含まない原因精度、自分向き、枚数gte 2の三点を既存台帳で確認。 | このターンにあなたが効果によってカードを２枚以上引いていた場合 |
| S026 | WXK03-059-E1 | AUTO | 真バグ＋機構待ち | liveは任意SIGNI1体へライドを恒久付与するが、原文は既に持つ【ライド】の使用可能phaseをMAIN/ATTACKへ拡張するルール変更で、keyword付与consumerでは扱えない。 | 無し＝機構待ち（ライド使用可否判定） | `GRANT_KEYWORD`のsource自動適用は「誰に付くか」だけを補い、使用timing拡張にはならない。 | 【ライド】をメインフェイズとアタックフェイズを持つかのように使用できる |
| S027 | WXK02-040-E1 | AUTO | 真バグ＋機構待ち | `turn_signi_returned_to_hand` はtrue/falseだけで、owner・CardNum・2体閾値を保持しない。既存 `SIGNI_RETURNED_TO_HAND_THIS_TURN` は1体以上しか表せない。 | 無し＝機構待ち（BOUNCE funnelの件数台帳＋`evalCondition`） | boolean存在を件数2へ流用すると同じ1体の複数評価と2体を区別できないため棄却。 | このターンにシグニが２体以上場から手札に戻っていた場合 |
| S028 | WX05-020-E2 | AUTO | 真バグ | `ON_TARGETED` はoriginカードとeffectを受け、`targetedOrigins`でsourceType=アーツを絞り、any_ally＋鉱石/宝石filterで実際に対象になった自軍SIGNIだけを拾える。liveのON_OPP_ARTS_USE＋場存在は対象化前に過剰発火する。 | `collectTargetedTriggers` | アーツ使用時に場の対象候補が存在することは「効果を受けた」と同義でなく、origin追跡の既存慣例を採用。 | ＜鉱石＞か＜宝石＞のシグニ１体が対戦相手のアーツの効果を受けたとき |
| S029 | WXK07-055-CB-E1 | AUTO | 真バグ | `HAS_CARD_IN_FIELD{owner:self,filter:{cardName:羅星 人生さんB},minCount:1}` は自場・名前一致・1体以上を既存候補走査で評価できるがliveにconditionがない。 | `collectAttackerSelfTriggers` → `evalUseCondition` | LOOK処理開始時のdeck内容やsource自動適用は別カードの場存在を保証しない。 | あなたの場に《羅星　人生さんＢ》がある場合 |
| S030 | WXK11-045-E1 | AUTO | 真バグ＋機構待ち | crash funnelはsourceCardNumを持つが、scope省略selfはwatcherとsourceの一致を確認せず全sourceで発火する。`any_ally`は「あなたのシグニ」までで「このシグニ」同一性を表せない。 | 無し＝機構待ち（`collectOppLifeCrashedTriggers` self-source equality） | `triggerFilter.thisCardOnly` はmatchesFilter単体ではsource/watcher比較を行わないため外した。 | このシグニが対戦相手のライフクロス１枚をクラッシュしたとき |
| S031 | WXDi-P09-010-E3 | AUTO | 真バグ | liveは起動時即時POWER_MODIFY。既存 `INSTALL_DELAYED_TRIGGER` はターン中のON_PLAYを設置でき、`collectFieldTriggers`はplacedByEffectを区別して自分SIGNIだけに絞れる。 | `execInstallDelayedTrigger` → `collectFieldTriggers` | duration UNTIL_END_OF_TURNはpower修正の期限で、発火待ちを暗黙に作らない。 | このターン、あなたのシグニ１体が効果によって場に出たとき |
| S032 | WX18-056-E1 | AUTO | 真バグ＋機構待ち | 必要なのは「このattack phase中にself SIGNIがfield→trash済み」の履歴だが、現stateはそのowner・origin・phase単位の台帳を持たない。 | 無し＝機構待ち（field→trash funnel＋attack-phase reset＋`evalCondition`） | 現在trashにあるカードでは移動時期・元zone・同phaseを証明できない。 | このアタックフェイズの間にあなたのシグニが場からトラッシュに置かれていた場合 |
| S033 | WXDi-CP02-048-E1 | AUTO | 真バグ | liveは初段-8000を落として即時-5000へ置換。原文はSEQUENCEで-8000後、対象へON_ATTACK_PHASE_ENDの-5000 AUTOを付与する二段構造。 | `execPowerModify`＋`execGrantEffect`＋`collectTurnTriggers` | POWER_MODIFYのdurationは後日の追加-5000を生成せず、単純delta合算も発火時点を壊す。 | パワーを－8000し、それは「アタックフェイズ終了時…－5000」を得る |
| S034 | WXDi-P04-081-E1 | AUTO | 真バグ＋機構待ち | attached（charm/acce等）またはunderの存在を自場全hostでOR評価する条件がない。`THIS_CARD_HAS_UNDER`はsource自己だけ、TargetFilter.hasUnderは未実装課題。 | 無し＝機構待ち（field host attachment/under OR condition） | HAS_CARD_IN_FIELDの通常候補はhost topだけで、下カードや付属カードを独立field cardとして数えない。 | シグニに付いているカードかシグニの下に置かれているカードがある場合 |
| S035 | WX09-Re07-E1 | AUTO | 真バグ＋機構待ち | liveはCONTINUOUS SEARCHで条件成立中にaction化する。正しくはself ON_LEAVE_FIELDかつ相手効果原因だが、既知どおりselfループはbyOpponentEffect cause gateを読まない。 | 無し＝機構待ち（第2バッチ§4の`collectLeaveFieldTriggers` self cause面と同一） | HAS_CARD_IN_FIELD minCount3は能力獲得条件であって、場にいる間SEARCHを反復実行する条件ではない。 | 対戦相手の効果によってこのシグニが場を離れたとき |
| S036 | WX15-006-E1 | AUTO | 真バグ＋機構待ち | liveはアーツ使用時に即BANISH＋LIFE追加。必要なのはターン中の自SIGNIバニッシュを自効果だけ除外する遅延watcherで、battle・相手効果・ルール原因をORし、bet時だけ追加LIFEを行うcause否定が現行triggerにない。 | 無し＝機構待ち（`INSTALL_DELAYED_TRIGGER`＋banish cause分類） | `ON_SIGNI_BANISH_BATTLE`だけでは相手効果等を落とし、`banishedByOwnEffect`の否定表現も無い。 | このターン、あなたのシグニ１体があなたの効果以外によってバニッシュされたとき |
| S037 | WX15-Re15-E1 | 読取不能（live行切断） | 真バグ＋機構待ち | 明細のliveはduration途中で切れparseStatus不明。条件型TRASH_HAS_CARDは同名存在までは見られるが、起動候補の当該instanceがtrashにあることと、trashから能力を提示する入口を一体で保証する専用配線がない。 | 無し＝機構待ち（trash在中ACTIVATED能力列挙＋使用条件） | `THIS_CARD_FROM_TRASH` は場に出た後の履歴条件で、起動前のtrash在中判定ではない。 | この能力は、このシグニがトラッシュにある場合にしか使用できない |
| S038 | PR-206-E1 | AUTO | 真バグ＋機構待ち | `ON_OPP_LIFE_CRASHED` はcrashSourceCardNumを運ぶが、ルリグwatcherのscope selfがsource同一性を評価しないため、シグニ・効果クラッシュでも発火する。 | 無し＝機構待ち（S030と同じcrash source/watcher equality、LRIG対応） | sourceType LRIGだけでは他の自ルリグ/付与源との同一性が曖昧で「このルリグ」を満たさない。 | このルリグが対戦相手のライフクロス１枚をクラッシュしたとき |
| S039 | WXDi-P11-TK04-E2 | AUTO | 偽陽性 | `ON_SIGNI_BANISH_OPPONENT` はバトル経路限定で、`triggerScope:self` は効果host自身が実際のアタッカーとして相手SIGNIをバニッシュした場合だけ収集される。 | `resolvePendingSigniBattleFor` のself watcher loop | UPのsource自動適用以前に、timingとscopeが原因=バトル・主語=このシグニ・閾値1を保証する。 | このシグニがバトルによって対戦相手のシグニ１体をバニッシュしたとき |
| S040 | WX11-031-E1 | AUTO | 真バグ＋機構待ち | 必要な履歴は自軍の空獣/地獣SIGNIが相手SIGNIを合計3体バニッシュ。現 `signi_banished_this_turn` は被害側の単数値で、banisher class・原因・正確な回数を保持しない。 | 無し＝機構待ち（banish funnelのsource class付き正確台帳＋`evalCondition`） | `ON_SIGNI_BANISH_OPPONENT`は今回1回のself発火だけを保証し、ターン累計3体と他の同class味方分を補わない。 | このターンにあなたの＜空獣＞か＜地獣＞のシグニが…合計３体バニッシュ |

## 3. action型ごとの所見・重複effectId

- ADD_TO_FIELD 4件は、MAINの実在phase値、不在条件、HAND_COUNT lteという既存consumerで直せる単純条件欠落だった。
- ENERGY_CHARGE_FROM_DECKは8件中1件がバトル限定timing慣例による偽陽性。残りは終了時timing、energy→field timing、履歴条件に分かれ、同action型でも配線先は一致しない。
- DRAW 5件は中央zoneだけ既存自己条件で完結し、trap、複数zone合算、原因精度付きbanish履歴は機構待ち。効果ドロー累計は既存の正確な台帳を再利用できる。
- POWER_MODIFY系は即時修正、遅延付与、phase履歴、crash source同一性が混在し、action名による横展開は不適切。
- `WXK01-055-E1` のS004/S006は1真因に束ねず、同一effectへ `AND[DURING_PHASE MAIN,HAND_COUNT self lte 2]` を載せる二つの独立欠落として扱う。
- `WX05-022-E1` のS008/S009は「規定phase外のdraw/add-to-hand禁止」という一つの禁止機構へ束ねられる。内容軸とphase/turn軸を同じconsumerで同時に直す必要がある。

## 4. 機構待ち一覧

| finding | 不足語彙・機構・配線 |
|---|---|
| S001 | ターン中SIGNI attack回数の正確な台帳と攻撃宣言funnel。メモAEどおり新規。 |
| S002 | `collectAttackEndTriggers`へルリグ一時付与AUTOを合流し、`ON_ATTACK_END`/no-damageを読む。 |
| S007 | ON_BANISHとfield→trashのOR、および効果/レゾナ出現条件causeをself離場経路へ渡す。`collectLeaveFieldTriggers` self cause面は第2バッチ§4と同系統。 |
| S008/S009 | opponent own turnかつGROW/DRAW以外でDRAWとADD_TO_HANDを禁止するphase exclusion付き継続制限。 |
| S010 | **PLAN §6.4 O-37(a) `DAMAGE_REPLACE_BY_COST` と同一枠**。アシストLRIG2体DOWN支払いをdamage funnelへ追加。二重登録しない。 |
| S011 | `collectBanishTriggers` selfへnon-battle cause判定。 |
| S012 | 自分効果による相手SIGNI banishを正確に数えるsource/cause付き台帳。メモADの単数カウンタは使用不可。 |
| S013 | energy+trashのfilter一致枚数を合算する複数zone Condition。 |
| S014/S016 | `field.signi_traps` のself存在を読む条件。2件で同一機構。 |
| S021 | `signi_banished_this_turn` を相手側gte1だけに限定して読むCondition。記録側は現行再利用可。 |
| S022 | self field SIGNIの実効power総和をeq比較するCondition。 |
| S023 | `collectBanishTriggers` self sectionへ `banishedByOwnEffect` cause gateを配線。第2バッチのleave-field self cause穴と同型だが別collector。 |
| S024 | appearance costで実際に支払った2体のCardName同一性をON_PLAYへ伝える。 |
| S026 | 【ライド】使用可否判定へMAIN/ATTACK timing拡張を収集・適用。 |
| S027 | BOUNCE funnelでowner付きSIGNI戻り件数を正確に累積。boolean `turn_signi_returned_to_hand` の置換。 |
| S030/S038 | `collectOppLifeCrashedTriggers`でcrash sourceとwatcher自身のinstance同一性をSIGNI/LRIG双方で評価。同一機構。 |
| S032 | attack phase中のself SIGNI field→trash履歴台帳。 |
| S034 | 自場host全体のattached/under存在OR条件。`hasUnder`は**第10バッチ§4 S028の対象候補機構と基盤共有**するが、今回は自己場存在条件なので二重登録せずconsumerを分ける。 |
| S035 | **第2バッチ§4 `collectLeaveFieldTriggers` self cause面と同一機構**＝byOpponentEffectをselfループで読む。二重登録しない。 |
| S036 | delayed banish watcherへ「自分の効果以外」のcause否定とbet分岐を配線。 |
| S037 | trash在中カード自身のACTIVATED能力を候補化し、そのinstance在中を使用条件で検証。 |
| S040 | banisher source class（空獣/地獣）付きの相手SIGNI banish正確累計。S012と台帳基盤共有可。 |

## 5. 偽陽性件数の自己評価

事前予測は低率だった。40件の大半が条件節の丸ごと脱落で、did-itや選択上限のような非自明executor慣例に当たりにくい母集団だからである。実測は2/40=**5.0%**で予測どおり低い。通算17.6%および第11バッチ23.9%より大幅に低く、第10バッチ0%よりは高い。2件はいずれも第7バッチの13機構に明記された「`ON_SIGNI_BANISH_OPPONENT`はバトル限定」に衝突したS020/S039であり、偽陽性率を決めたのは単発母集団か否かでなく、この軸が非自明なengine慣例へ当たった割合だという第9〜11バッチの仮説を再支持する。

## 6. 条件以外で見つけた原文との食い違い

**3件**。

1. S010は対象も誤り。原文はレベル1以上のアップ状態のアシストルリグ2体だが、liveは自SIGNI1体。
2. S033は指摘どおりtiming以前に初段-8000自体が脱落し、liveの-5000がON_PLAY即時へ置換されている。
3. S037は原文の「そうした場合」に対しlive断片が `CONDITIONAL{IS_MY_TURN}` を使っている。これはdid-it placeholder慣例なら成立し得るため本findingの分類根拠にはせず、段2で完全liveを再取得して確認対象とする。

## 7. ゲート・差分・成果物確認

- `npm run gates`：全緑。typecheck PASS、golden **2337/0**、smoke **10693/10693**（CRASH/HANG/INVARIANT/SKIPすべて0）、fuzz不具合 **0**、census **773/773**、census:stubs **A🔴0・C0**、manual-fields **0**、lint **0 errors / 260 warnings**。
- `git status --short`：作業前からの `M` は `scripts/archive/semanticAuditLedger.mjs` と `scripts/archive/semanticAuditMkBatchSingles.mjs` の2本のみ。`??` は既存のbatch8〜11成果物、batch12明細/index、本報告書だけで、許容範囲外の副作用は0。
- `git diff --stat`：上記計器2本だけ（**2 files changed, 9 insertions(+), 3 deletions(-)**）。本作業では触れていない。
- 報告書はUTF-8で先頭20行・末尾20行を再読済み。`wc -c` 相当の実測は **30895 bytes**、全140行。分類表40行の根拠列は **40/40 unique**。
- parseStatusをliveから読めなかった3件は、**S001とS002が `live:null`、S037が明細内のlive JSON行自体が `"duration":"INSTANT","` で切断**されていたもの。したがって3件とも「非AUTO」なのではなく、今回の明細からparseStatusを確定不能と結論した。

## 8. ガードレール2・3・5・6で当初見立てから変えた件

- S015：先回りメモAGの `centerZoneOnly` を対象filterとして使う案から、自己条件専用 `IS_SELF_IN_CENTER_ZONE` の既存consumerへ変更した。
- S020/S039：段0指摘を真バグ候補と見た後、バトル専用collectorを再確認して偽陽性へ変更した。
- S021：メモADの警告からカウンタ全面不採用を疑ったが、原文が原因不問・gte1なので多重計上無害と確認し、記録側は再利用可、条件consumerのみ機構待ちへ狭めた。
- S023：型の `banishedByOwnEffect` 存在からparser修正だけと見かけたが、self sectionが読まないため真バグ＋機構待ちへ変更した。
- S028：ON_OPP_ARTS_USEの修正だけでなく、origin付き `ON_TARGETED` が既にアーツsourceを判別できることを確認し、機構待ちから通常の真バグへ変更した。
- S034：既存のhasAcce等をHAS_CARD_IN_FIELDへ載せる案を検討したが、underを全hostで読む経路がなくOR全体を機構待ちへ変更した。
- 先回りメモAD〜AJの引用事実と今回の実測に結論を変える食い違いは**0件**。ただしAGは同じ語彙を使うのではなく自己条件専用語彙がより適切、AHは包含列挙では将来phase漏れがあるため専用除外consumerが必要、と用途を精密化した。
