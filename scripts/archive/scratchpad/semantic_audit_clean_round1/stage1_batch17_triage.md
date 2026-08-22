# 意味照合監査 clean群 round1 段1 第17バッチ triage

対象は軸「(未分類)」の1〜36件（36 findings / 35 effectId）。実装・既存ファイル編集は行っていない。

## 1. サマリ

### action型別

| action型 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 2 | 1 | 1 | 0 | 0 |
| ADD_TO_FIELD | 1 | 1 | 0 | 1 | 0 |
| ADD_TO_LIFE | 1 | 1 | 0 | 0 | 0 |
| ATTACH_CHARM | 1 | 1 | 0 | 0 | 0 |
| BANISH | 1 | 1 | 0 | 0 | 0 |
| BLOCK_ACTION | 3 | 3 | 0 | 3 | 0 |
| CHOOSE系 | 7 | 7 | 0 | 3 | 0 |
| CONDITIONAL | 6 | 6 | 0 | 2 | 0 |
| DOWN | 1 | 1 | 0 | 0 | 0 |
| DRAW | 5 | 5 | 0 | 1 | 0 |
| ENERGY_CHARGE_FROM_DECK | 4 | 4 | 0 | 3 | 0 |
| FREEZE | 1 | 1 | 0 | 0 | 0 |
| GAIN_COIN | 1 | 1 | 0 | 0 | 0 |
| GRANT_KEYWORD | 1 | 1 | 0 | 0 | 0 |
| LOOK_AND_REORDER | 1 | 1 | 0 | 1 | 0 |
| **計** | **36** | **35** | **1** | **14** | **0** |

機構待ちは真バグの内数。S007/S009は同一機構なので、§4では1登録に束ねる。

### 残り67件を切るための再クラスタ軸案

今回36件を後から割るなら、次の8軸が実務上扱いやすい。件数は今回の36件に対する実測で、残り67件の予測値ではない。

| 軸案 | 件数 | 今回のfinding |
|---|---:|---|
| 効果元自身・正面・固定zone/host | 6 | S001,S002,S003,S011,S033,S036 |
| 移動元・移動先・前後処理 | 6 | S004,S005,S024,S026,S028,S035 |
| 継続禁止・フェイズ制御 | 3 | S007,S008,S009 |
| CHOOSEの可用条件・反復・不足時処理 | 6 | S010,S012,S013,S014,S016,S017 |
| 対象型・対象確定の順序 | 4 | S006,S015,S019,S023 |
| 動的閾値・履歴・比例値 | 6 | S018,S025,S029,S030,S031,S034 |
| 両プレイヤー／player-scoped状態 | 4 | S021,S022,S027,S032 |
| 固有盤面操作の単純脱落 | 1 | S020 |

「(未分類)」をaction型だけで束ねるより、上記の意味軸で切る方が同一consumerをまとめやすい。一方、同じ軸内でも根拠の横展開はせず、各live構造を再照合する必要がある。

## 2. finding全36件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠（各行固有） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WX17-035-LAYER-E1 | 読取不能（live null） | 真バグ | レイヤー由来能力の対象を自分SIGNIへ一般化すると正面zoneの相手1体という位置関係を失うが、`frontOfSelf`は効果元zoneから`2-zi`を解決できる。 | `execUtils.ts:1007` `resolveFrontOfSelfCardNum`、`effectExecutor.ts:1052` `execBanish`系target解決 | live nullを無条件に機構待ちとはせず、既存`frontOfSelf` consumerを確認した。 | このシグニの正面のシグニ１体 |
| S002 | WXDi-D04-004-sub-E1 | 読取不能（live null） | 偽陽性 | 付与先は「このルリグ」＝この起動能力を持つセンタールリグであり、素のLRIG単体UPは任意の3ルリグを候補化せずcenter topへ直結するため対象意味は一致する。 | `effectExecutor.ts:3290`前後 `execUp` のLRIG分岐（素のLRIGはcenter top） | `thisCardOnly`脱落を疑ったが、`filter.isUp`付き複数LRIG分岐ではなく13機構のcenter直結が適用される。 | このルリグをアップする |
| S003 | WXDi-P03-087-E2 | AUTO | 真バグ＋機構待ち | `source.filter.thisCardOnly`はトラッシュのこのカードを正しく固定する一方、`execAddToField`は空きzoneの先頭へ置き、中央zone指定を保持するaction fieldがない。 | `effectExecutor.ts:2740` `execAddToField`、`:2936`付近の`findIndex`配置 | `centerZoneOnly`は場にいる候補のfilterであり、配置先zoneの指定には使えない。 | 中央のシグニゾーンに出す |
| S004 | WX24-P3-044-E1 | AUTO | 真バグ | liveの`fromTop:true`は`state.deck.slice(0,count)`をlifeへ移すため、コスト後の手札から1枚選ぶ原文と移動元が異なる。 | `effectExecutor.ts:2954` `execAddToLife`（`:2998`の`fromHand`分岐） | `fromTop:false`だけではno-opになるが、隣接`fromHand:true`が既存なので機構待ちから外した。 | あなたの手札からカードを１枚ライフクロスに加える |
| S005 | WX14-076-E1 | AUTO | 真バグ | liveの`charm.type:SIGNI, owner:self`は自場SIGNIを入力候補にする表現で、原文の相手trashカードを移動元にできない。 | `effectExecutor.ts:5399` `execAttachCharm`（`:5439`以降の`TRASH_CARD`分岐） | `ATTACH_CHARM`専用の`charm.type:'TRASH_CARD', owner:'opponent'`が既に消費されるため新機構不要。 | 対戦相手のトラッシュのカード１枚 |
| S006 | WX08-011-E1 | AUTO | 真バグ | 使用条件には`crossState:true`があるが、BANISH target filterは`cardType`だけで相手の非クロスSIGNIも候補に残る。 | `effectExecutor.ts:1052` `execBanish`→`fieldCandidates`、`effectEngine.ts:799`状態filter | 自場のクロス存在条件を対象側にも暗黙転用する経路はなく、target自身の`crossState:true`が必要。 | 対戦相手のクロス状態のシグニ１体 |
| S007 | WXK11-027-E1 | AUTO | 真バグ＋機構待ち | 永続`BLOCK_ACTION{ATTACK}`だけではtrash18枚到達後もkeyword grantが残り、解除条件を評価するfieldが`attackCost.fieldTrash`以外にない。 | `effectExecutor.ts:3370` `execBlockAction`、attack可否共通経路 | 最寄り`attackCost.fieldTrash`は攻撃時に場のSIGNIを支払う条件で、trash枚数の盤面閾値ではない。 | トラッシュにカードが１８枚以上ないかぎり |
| S008 | WXDi-P09-031-E1 | AUTO | 真バグ＋機構待ち | `execBlockAction`は`target.owner`側stateへ`SIGNI_ATTACK_STEP`を積むため、相手ターンに出た場合のturn playerではなくカードcontroller自身を封じる。 | `effectExecutor.ts:3465`付近の`blocked_actions`更新、`attackStepPhase.ts:25` skip消費 | step skip自体は既存だが、`owner:self/opponent`は効果owner基準で「現在のturn player」を表す動的ownerがない。 | このターン、シグニアタックステップをスキップする |
| S009 | PR-402-E1 | AUTO | 真バグ＋機構待ち | liveはtrash15枚未満という有効期間を持たず、ゲーム中ずっとこのSIGNIへATTACK禁止を付け続ける。 | `effectExecutor.ts:3370` `execBlockAction`、SIGNI攻撃可否 | S007と同じ盤面条件付き禁止。`until:'PERMANENT'`や`NEXT_TURN`は時刻寿命で枚数解除を表せない。 | トラッシュにカードが１５枚以上ないかぎり |
| S010 | WXK05-010-E1 | AUTO | 真バグ | liveは`choose_count:2,upTo:true`までで重複ID選択を許可する`allowRepeat`がなく、通常UIでは同じchoiceを2回数えられない。 | `effectExecutor.ts:4893` `execChoose`（`:4957` `allowRepeat`）、選択UI | 先回りメモBLと異なり`ChooseAction.allowRepeat`は`types/effects.ts:1436`に実在しconsumerもあるため機構待ちではない。 | 同じ選択肢を２回選んでもよい |
| S011 | WXK08-040-E1 | AUTO | 真バグ＋機構待ち | choice③のBOUNCEは自SIGNIを候補化し、解決中でzone外のsource spellをpost-resolution trash配置の代わりに手札へ戻せない。 | spell解決`BattleScreen.tsx:7617`の`sourcePlacementPending`、移動action executor | `ATTACH_CHARM`には解決中spell自己移動の特例があるが、BOUNCE/TRANSFER_TO_HANDには同等のsource-placement置換がない。 | このスペルを手札に戻す |
| S012 | WX26-CP1-023-E1 | AUTO | 真バグ | choice②にはconditionがあるのにchoice①にはなく、場にSIGNIがある状態でも①が`available:true`になる。 | `effectExecutor.ts:4893` `execChoose`の`ch.condition`評価 | `FIELD_COUNT{owner:self,cardType:シグニ,eq:0}`は`execUtils.ts:1601`で既存評価されるため追加機構不要。 | あなたの場にシグニがない場合 |
| S013 | WDK05-T10-E1 | AUTO | 真バグ＋機構待ち | `TRASH{HAND_CARD,count:2}`は候補不足時もSELECT_TARGETの要求数2を保ち、1枚以下なら残り全部というexact-or-all規則を表すfieldがない。 | `effectExecutor.ts:1734` `execTrash`、`execUtils.ts:2581` `selectOrInteract` | `upToCount:true`は手札2枚以上でも1枚/0枚を許すため、原文の「2枚、足りなければ全部」と一致しない。 | 手札が１枚以下で使用した場合すべて捨てる |
| S014 | WXDi-P05-003-E1 | AUTO | 真バグ | choice①はエナTRASHを1回するだけで、エナ/手札の二択を各回提示する処理も合計3回の反復もない。 | `effectExecutor.ts:4893` `execChoose`、`:4967` `execRepeat`、`:1734` `execTrash` | 既存`REPEAT{count:3,action:CHOOSE[...]}`で表現でき、単一CHOOSEの`choose_count:3`へ潰す必要はない。 | エナゾーンから…か手札を…合計３回行う |
| S015 | WXDi-P05-003-E1 | AUTO | 真バグ | 原文が事前対象化するLRIGと、liveの`NEGATE_ATTACK target:SIGNI`はカード種別も同一対象性も異なる。 | `effectExecutor.ts:6258` `execNegateAttack`、delayed trigger設置経路 | `IS_MY_TURN`は「そうした場合」のdid-it近似であり、対象LRIGを保存して後の攻撃に結び付ける代用にはならない。 | 対戦相手のルリグ１体を対象とし |
| S016 | WXDi-P15-050-E1 | AUTO | 真バグ＋機構待ち | choice②にはcondition自体がなく、自場3zoneのstack下カード合計が2枚以上かを選択可否で検査しない。 | `effectExecutor.ts:4893` `execChoose`、`evalCondition` | 第12バッチ§4 S034の`hasUnder`は存在ORで、全hostのunder合計を閾値比較する今回の単位を保持しない。 | 場にあるシグニの下にカードが合計２枚以上ある場合 |
| S017 | WXDi-P10-062-E1 | AUTO | 真バグ | `CONDITIONAL.then`が直にDRAWで、条件成立後に引く/引かないを選ぶinteractionがない。 | `effectExecutor.ts:4961` `execConditional`、CHOOSE executor | effect全体の`mandatory:true`はトリガー解決義務であり、then内ドローの「してもよい」を任意化しない。 | カードを１枚引いてもよい |
| S018 | WX26-CP1-054-E1 | AUTO | 真バグ＋機構待ち | BANISH filterはcardTypeだけで、source SIGNIの実効power÷2を対象上限へ動的解決する値がない。 | `resolveDynamicFilter`→`execBanish` | 固定`powerRange.max`や`SELF_POWER_THRESHOLD`は現在値の半分を対象filterへ渡せない。第3バッチ§4 D013と同一機構。 | このシグニのパワーの半分以下 |
| S019 | WDK06-C14-E1 | AUTO | 真バグ | target選択が`TURN_OWNER`のthen内に入り、相手ターンには対象を取るルール処理自体が省略される。 | `effectExecutor.ts:4961` `execConditional`、`SELECT_TARGET_ONLY`/stored target経路 | actionを条件外へ出すだけでは即配置されるため、事前対象保存→条件成立時`targetsStored`配置の既存形を使う。 | シグニ１枚を対象とし、あなたのターンの場合 |
| S020 | WXDi-P13-010-E1 | AUTO | 真バグ | thenは感染SIGNIへのPOWER_MODIFYだけで、ウィルスzone選択・配置actionが丸ごとない。 | `effectExecutor.ts:6994` `execPlaceVirus`、`:7054` zone選択再開 | `infected:true`は既に置かれたウィルスを読むfilterであり、新しいウィルスを生成しない。 | シグニゾーン１つに【ウィルス】１つを置き |
| S021 | WXDi-P06-067-E2 | AUTO | 真バグ | condition成立後のthenがowner selfへの1回だけで、相手deck topから相手energyへ移す第二処理がない。 | `effectExecutor.ts:2083` `execEnergyChargeFromDeck` | `owner:any`で両者を一括処理する慣例はなく、self/opponentのSEQUENCEが必要。 | 各プレイヤーは【エナチャージ１】をする |
| S022 | WXDi-P12-050-E1 | AUTO | 真バグ＋機構待ち | liveは任意SIGNIへkeywordを付けるが、現行token collectorはfield SIGNIの`keyword_grants[topNum]`だけを走査し、playerが持つカウンターを格納・消費できない。 | `triggerCollect.ts:4147` `KEYWORD_TOKEN_MAP`走査、`execGrantKeyword` | `GRANT_KEYWORD target:SIGNI`はホストカード能力に変わり、player-scoped【みこみこ親衛隊】の個数状態ではない。 | 対戦相手は【みこみこ親衛隊】１つを得る |
| S023 | WX24-P2-045-E1 | AUTO | 真バグ | liveはSIGNI1体だけをDOWNし、同じ出現時能力に必要な相手center LRIGのDOWNが存在しない。 | `effectExecutor.ts:3124` `execDown` | 素のLRIG targetはcenter top直結だが、live actionにLRIG step自体がないため暗黙追加されない。 | 対戦相手のルリグ１体と対戦相手のシグニ１体 |
| S024 | WX09-Re15-BURST | AUTO | 真バグ | LB liveはDRAW3だけで、先に自手札2枚をtrashへ移す盤面差分と捨札triggerが発生しない。 | `effectExecutor.ts:1734` `execTrash`→`:154` `execDraw` | 通常能力の可変discard/draw表現をLBへ暗黙共有する経路はなく、SEQUENCEが必要。 | カードを２枚捨て、カードを３枚引く |
| S025 | WXDi-P07-042-E2 | AUTO | 真バグ＋機構待ち | ON_TURN_END liveにconditionがなく、自場SIGNIの実効powerを合算してgte30000を判定するConditionも現行unionにない。 | `evalCondition`、実効power計算基盤 | `FIELD_SIGNI_POWER_COUNT`は各体が個別閾値以上かの体数で、power総和ではない。第12バッチ§4 S022の総和Conditionと同一機構。 | 場にあるシグニのパワーの合計が30000以上 |
| S026 | WX22-045-E1 | AUTO | 真バグ | refresh owner anyとDRAW1は保持される一方、self deck topをenergyへ移す先行actionがない。 | `effectExecutor.ts:2083` `execEnergyChargeFromDeck`、`:154` `execDraw` | エナチャージはdeck top移動を既に実装し、refresh triggerから暗黙発火はしないためSEQUENCE化で足りる。 | デッキの一番上のカードをエナゾーンに置き |
| S027 | WXDi-P04-067-E1 | AUTO | 真バグ | liveはowner selfの手札だけを1増加させ、opponent側DRAWが欠落する。 | `effectExecutor.ts:154` `execDraw` | 「各プレイヤー」をturn ownerへ正規化する慣例はなく、2 ownerの独立actionで表せる。 | 各プレイヤーはカードを１枚引く |
| S028 | WXK06-044-E1 | AUTO | 真バグ | liveの無条件self DRAW1は、両者それぞれのHAND_COUNT gateと手札→deck bottom移動を全て落としている。 | `execConditional`、`execTransferToDeck`、`execDraw` | self処理の結果をopponentへ鏡映する自動機構はないが、owner別SEQUENCEを既存語彙で組める。 | 手札が１枚以上ある各プレイヤーは、手札を１枚デッキの一番下に置き |
| S029 | WXDi-P06-070-E1 | AUTO | 真バグ＋機構待ち | `execAddToField`はenergyからの配置を`signi_played_from_non_hand_this_turn`には入れるが、trash/deckと区別したenergy origin履歴を残さない。 | `effectExecutor.ts:2740` `execAddToField`、`:2702` provenance記録、条件consumer | `THIS_CARD_FROM_TRASH/DECK`と汎用non-handはあるが「このターンenergyから」のみを識別できない。 | このターンにこのシグニがエナゾーンから場に出ていた場合 |
| S030 | WXK02-065-E1 | AUTO | 真バグ＋機構待ち | liveにconditionがなく、現行`turn_signi_returned_to_hand`は1体以上のbooleanなので2体以上という回数を判定できない。 | BOUNCE funnel `effectExecutor.ts:1262`、`SIGNI_RETURNED_TO_HAND_THIS_TURN` consumer | 第12バッチ§4 S027の正確なowner付きBOUNCE累計と同一機構で、booleanを2回条件に流用できない。 | このターンにシグニが２体以上場から手札に戻っていた場合 |
| S031 | WXEX1-59-E1 | AUTO | 真バグ＋機構待ち | action countは定数1で、自場SIGNIが持つレイヤーアイコン総数をcountへ渡すproducerがない。 | `effectExecutor.ts:2083` `execEnergyChargeFromDeck`、`resolveCountRef` | `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT`はSIGNI体数を数え、1体が複数持つレイヤーアイコン単位を数えない。 | レイヤーアイコン１つにつき【エナチャージ１】 |
| S032 | WXDi-P14-063-E2 | AUTO | 真バグ | self deckからのチャージだけが実行され、相手も自分のdeck topをenergyに置く効果が欠落する。 | `effectExecutor.ts:2083` `execEnergyChargeFromDeck` | S021と同じ両owner SEQUENCEで表せるが、condition内ではない別findingとして個別修正が必要。 | 各プレイヤーは【エナチャージ１】をする |
| S033 | WXK03-008-E3 | AUTO | 真バグ | key自身のAUTOとして収集するとkeyの場在中性・source種別で発火し、原文のcenter LRIGが得た能力というhost帰属を保持しない。 | granted effect収集、`GRANT_LRIG_ABILITY` action | triggerScope any_oppは時刻の向きだけを合わせ、能力hostをkeyからcenter LRIGへ移さない。 | あなたのセンタールリグは以下の能力を得る |
| S034 | WXEX1-08-E1 | AUTO | 真バグ | `GAIN_COIN count:2`を`execGainCoin`がそのまま加算するため、原文より1枚多く得る。 | `effectExecutor.ts:6637` `execGainCoin` | coin上限5のclampは過剰なcountを1へ補正せず、上限未満では差が盤面に出る。 | コインアイコンを得る |
| S035 | WX20-002-E2 | AUTO | 真バグ | GRANT_KEYWORDはenergyカードをzoneから除去せず、対象SIGNIへ文字列「アクセ」を付けるだけなのでattachment実体がない。 | `effectExecutor.ts:7111` `execAttachAcce`、`:3509` `execGrantKeyword` | `ATTACH_ACCE`はenergy sourceとhost選択を既に実装するため、キーワード付与慣例で近似しない。 | エナゾーンから対象のアクセアイコンを持つカード１枚を…【アクセ】にする |
| S036 | WXDi-P09-044-E2 | AUTO | 真バグ＋機構待ち | LOOK_AND_REORDERは見た2枚すべてをbottom destinationへ渡し、1枚だけsource SIGNI下へpartitionするdestinationを持たない。 | `effectExecutor.ts:5026` `execLookAndReorder`、`PLACE_UNDER_SOURCE_SIGNI` | `PLACE_UNDER_SIGNI`単独では同じLOOK poolの残り1枚をbottomへ戻せない。第11バッチ§4 S022のdestination別partition基盤と同一。 | その中から１枚をこのシグニの下に置き、残りを…デッキの一番下に置く |

## 3. 所見（action型ごと）

- **(live無)**: S001は既存位置filterで直せる。S002は別findingのattack-end収集穴（第12バッチ§4 S002）を抱えるが、今回の「UP対象」だけはcenter直結慣例により偽陽性。
- **ADD_TO_FIELD / ADD_TO_LIFE / ATTACH_CHARM**: 移動元は既存語彙が充足している一方、S003の固定中央配置だけは配置先を保持できない。
- **BANISH**: S006はtarget filterへの`crossState`単純脱落。使用条件側の同名filterでは代用されない。
- **BLOCK_ACTION**: S007/S009は同じ「盤面閾値で解除される継続禁止」。S008はskip consumer自体は既存だが、現在turn playerを指すownerが不足する別機構。
- **CHOOSE系**: S010は現行`allowRepeat`で処理可能。S011は解決中spell自己回収、S013は候補不足時exact-or-all、S016は全host under合計という別々の不足。S014/S015は同一effectで、段2では支払3回・LRIG事前対象・遅延無効を一体で直す。
- **CONDITIONAL**: S018は第3バッチD013、S025は第12バッチS022と同一機構。S021はS032と同じ両プレイヤーchargeだが、片方はcondition内。S019は事前対象と条件付き移動の順序問題。
- **DOWN / DRAW**: S023/S024/S026/S027/S028は既存actionのSEQUENCE不足。S025だけ実効power総和Condition待ち。
- **ENERGY_CHARGE_FROM_DECK**: S021/S032が同じ両者処理。S029はenergy出自履歴、S030はbounce正確累計、S031はlayer icon数producerで別機構。
- **FREEZE**: S033は効果内容でなく能力hostの帰属誤り。
- **GAIN_COIN**: S034は定数の単点誤り。
- **GRANT_KEYWORD**: S035はkeywordとattachmentを混同したaction型誤り。
- **LOOK_AND_REORDER**: S036は第11バッチS022のLOOK partition基盤へ「source SIGNI下」destinationを足す系列。

同一機構に属するfinding組は、S007/S009、S018/第3バッチD013、S021/S032、S025/第12バッチS022、S030/第12バッチS027、S036/第11バッチS022。S014/S015は同一effectの一体修正単位だが、findingが指す不足は反復支払と対象保存で異なる。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| 固定SIGNI zone配置 / S003 | `AddToFieldAction`へ`zoneIndex`/`centerZoneOnly`相当の配置先制約を追加し、`execAddToField`と`SELECT_ZONE` UIが中央以外を候補化しない配線。最寄り`TargetFilter.centerZoneOnly`は既に場にいる対象filterで配置先には使えない。 |
| trash枚数閾値付きATTACK禁止 / S007,S009 | `BlockActionAction`へ盤面conditionを持たせ、SIGNI attack可否で毎回trash枚数を評価する。最寄り`attackCost.fieldTrash`は攻撃時支払であり、自然解除条件ではない。2件を1登録に束ねる。 |
| 現在turn playerのstep skip / S008 | `BLOCK_ACTION`のtargetに`turnPlayer`動的ownerを追加し、`execBlockAction`が現turn owner側`blocked_actions`へ`SIGNI_ATTACK_STEP`を積む。最寄り`owner:self/opponent`は効果owner基準で相手ターン出現を表せない。 |
| 解決中source spellの手札回収 / S011 | spell placement pendingをtrash配置せずhandへ差し替えるself-source移動actionと、`BattleScreen` spell resolutionへの完了結果配線。最寄り`ATTACH_CHARM`の`sourcePlacementPending`特例はdestinationがcharmで手札回収に使えない。 |
| 手札discard exact-or-all / S013 | `TRASH`へ「最大Nではなく、N枚以上ならexact N、未満ならALL」の不足時規則を追加し、`selectOrInteract`の要求数と確定可否へ配線。`upToCount`は0〜Nを許して過剰に任意化する。 |
| 全host under合計Condition / S016 | 自場全SIGNI stackのunder枚数合計をoperator/value比較するConditionを`evalCondition`へ追加。**第12バッチ§4 S034**のattached/under存在ORと集計基盤を共有できるが、存在booleanでは2枚閾値を表せない。 |
| source実効power半分の動的対象上限 / S018 | **第3バッチ§4 D013と同一機構**。`resolveDynamicFilter`でsource effectivePower/2を`powerRange.max`へ渡す。二重登録しない。 |
| player-scopedキーワードトークン / S022 | PlayerStateへ【みこみこ親衛隊】個数をowner別に保持し、付与・除去・token AUTO collectorがplayer counterを消費する配線。最寄りのSIGNI `keyword_grants`はホストカード能力へ意味が変わる。 |
| field SIGNI実効power総和Condition / S025 | **第12バッチ§4 S022と同一機構**。`calcFieldPowers`相当の実効値を合算しoperator/valueで評価。二重登録しない。 |
| energy→field出自履歴 / S029 | `execAddToField`のENERGY_CARD分岐でsource instanceをturn-scoped台帳へ記録し、source自身のConditionが照合する。最寄り`signi_played_from_non_hand_this_turn`はtrash/deckと区別不能。 |
| owner付きBOUNCE正確累計 / S030 | **第12バッチ§4 S027と同一機構**。BOUNCE funnelで場→手札の件数をowner付きで累積しgte2を読む。二重登録しない。 |
| field layer icon総数CountRef / S031 | 自場SIGNIが持つレイヤーアイコン総数を数えるproducerを`resolveCountRef`へ追加し`execEnergyChargeFromDeck`へ渡す。最寄り`ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT`はSIGNI体数単位。 |
| LOOK poolのunder/bottom partition / S036 | **第11バッチ§4 S022のLOOK destination別quota partitionと同一基盤**。pick1のdestinationにsource SIGNI underを追加し、remainderだけbottomへ渡す。二重登録しない。 |

機構待ちは14 findings、13登録行。過去§4と同一のS018/S025/S030/S036は新規機構として二重登録しない。

## 5. 偽陽性件数の自己評価

事前には雑多な母集団なので偽陽性率を予測できなかった。実測は1/36（2.8%）。偽陽性になったS002は、live nullや「このルリグ」という文面では判別できず、素のLRIG targetがcenter topへ直結する13機構をconsumerで確認して初めて除外できたものだった。他35件は移動元・条件・owner・回数・hostがliveから実際に脱落しており、表面JSONだけでなく最寄りconsumerまで追っても指摘を反証する慣例がなかった。

低い偽陽性率は「未分類だから真バグが多い」という予測ではなく、実測後に、残存36件の多くが単発の構造脱落で慣例エンコード系列がS002しかなかった結果として説明する。

## 6. 条件以外で見つけた原文との食い違い

**2 effect・3項目**。

- `WXDi-D04-004-sub-E1`: 今回対象のUP先とは別に、付与AUTOの「そのアタック終了時」および「そのアタックでダメージを与えていなかった場合」は第12バッチS002で真バグ＋機構待ち済み。
- `WXDi-P05-003-E1`: S014/S015以外に、liveの`IS_MY_TURN`は「そうした場合」を正しく表すdid-itではなく、3回の支払完了と対象LRIGの次回attackを結ぶ遅延期間も欠落している。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（17.2秒、実測）：

- typecheck PASS
- golden **2337 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**（200ゲーム、8000手）
- census **773 / baseline 773**
- census:stubs **A🔴0 / C群0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業前からのtracked M 2本（`scripts/archive/semanticAuditLedger.mjs`、`scripts/archive/semanticAuditMkBatchSingles.mjs`）と、既存の第8〜第16バッチ成果物・今回入力`stage1_batch17.txt`/indexを含む未追跡群に、本報告書`stage1_batch17_triage.md`が加わった状態。今回新たに変更した既存trackedファイルは0。

`git diff --stat`は計器2本だけ：`semanticAuditLedger.mjs | 7 +++++--`、`semanticAuditMkBatchSingles.mjs | 5 ++++-`、計 **2 files changed, 9 insertions(+), 3 deletions(-)**。いずれも作業前からの差分で触れていない。

報告書はUTF-8で、書き込み後に先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **29,322 bytes**。

## 8. ガードレール2・3・4・6・7で見立てを変更した件

- **S002（ガードレール2/6）**: 「このルリグ」なので`thisCardOnly`脱落の真バグと見たが、素のLRIG UPがcenter top直結するconsumerを開き、今回の対象findingだけ偽陽性へ変更した。別findingのattack-end付与能力収集穴とは分離した。
- **S003（ガードレール3/4）**: `centerZoneOnly`があるため既存語彙で直せる見立てを外した。同fieldは候補カードが現在いるzoneを絞るfilterで、`execAddToField`の配置先を固定しない。
- **S008（ガードレール3/6）**: `SIGNI_ATTACK_STEP`のskip自体が既存なので単純owner修正と見たが、self/opponentはいずれも効果owner基準で、どちらのturnにも出現し得る効果の「現在turn player」を固定できないため機構待ちへ変更した。
- **S010（ガードレール4/7、先回りメモとの不一致）**: メモBLは`ChooseAction`に重複許可fieldが無いとしていたが、隣接fieldを開くと`types/effects.ts:1436 allowRepeat`があり、`execChoose:4957`とUIにも配線済みだった。機構待ち見立てを真バグのみへ変更し、今回の実測を採用した。
- **S013（ガードレール3/4）**: `upToCount`で不足時を吸収できる見立てを外した。2枚以上ある場合にも1枚以下を許すため「2枚、足りなければ全部」とは異なる。
- **S016（ガードレール3/6）**: 第12バッチS034のunder存在ORを検討したが、今回は全host合計2枚という単位なので同じboolean consumerでは足りず、集計Condition待ちへ変更した。
- **S022（ガードレール2/3）**: `GRANT_KEYWORD`をowner opponentへ直すだけの見立てを外した。collectorはSIGNIごとのgrantしか読み、playerが得るtoken個数を保持しない。
- **S036（ガードレール3/4）**: `PLACE_UNDER_SOURCE_SIGNI`単独で既存語彙化できる見立てを外した。同じLOOK poolの残余だけをbottomへ分配するpartition consumerが必要で、第11バッチS022へ統合した。

先回りメモBJ/BK/BM/BNは実コードと一致した。BLだけ上記S010のとおり現行コードと食い違った。
