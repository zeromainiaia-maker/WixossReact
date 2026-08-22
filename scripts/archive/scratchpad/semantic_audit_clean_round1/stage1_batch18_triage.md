# 意味照合監査 clean群 round1 段1 第18バッチ triage

## 1. サマリ

分類は **真バグ35 / 偽陽性1 / 機構待ち11 / 要追調査0**。機構待ちは真バグへ重複計上する。

| action型 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| LOOK_AND_REORDER | 1 | 1 | 0 | 1 | 0 |
| PLAY_FREE_FROM_TRASH | 1 | 0 | 1 | 0 | 0 |
| PLAY_FREE | 1 | 1 | 0 | 1 | 0 |
| POWER_MODIFY_PER_FIELD | 1 | 1 | 0 | 1 | 0 |
| POWER_MODIFY | 10 | 10 | 0 | 2 | 0 |
| REMOVE_ABILITIES | 1 | 1 | 0 | 0 | 0 |
| REVEAL_AND_PICK | 2 | 2 | 0 | 0 | 0 |
| SEARCH | 5 | 5 | 0 | 1 | 0 |
| SELF_PLAY_RESTRICT | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE系 | 13 | 13 | 0 | 4 | 0 |
| **計** | **36** | **35** | **1** | **11** | **0** |

前回提案した8軸へ、主因で排他的に割り当てた内訳：

| 8軸案 | 件数 | findings |
|---|---:|---|
| 効果元自身・正面・固定zone/host | 9 | S001,S005,S006,S007,S010,S012,S020,S023,S029 |
| 移動元・移動先・前後処理 | 8 | S018,S019,S024,S025,S027,S028,S035,S036 |
| 継続禁止・フェイズ制御 | 2 | S003,S030 |
| CHOOSEの可用条件・反復・不足時処理 | 4 | S002,S017,S022,S032 |
| 対象型・対象確定の順序 | 4 | S015,S021,S031,S033 |
| 動的閾値・履歴・比例値 | 7 | S004,S008,S011,S013,S014,S016,S034 |
| 両プレイヤー・player-scoped状態 | 1 | S026 |
| 固有盤面操作の単純脱落 | 1 | S009 |

## 2. finding全36件の分類表

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WXDi-P15-079-E1 | AUTO | 真バグ＋機構待ち | `LOOK_AND_REORDER`は見た5枚を全てdeck bottomへ渡し、1枚をgate所在zoneへ分離配置するpick枝を持たない。 | `effectExecutor.ts` `execLookAndReorder`、ADD_TO_FIELD zone選択 | `inGateZone`は既配置SIGNIの状態filterで、LOOK中の札の配置先をgate zoneへ固定しない。 | シグニ１枚を【ゲート】があるあなたのシグニゾーンに出し |
| S002 | WX09-012-E2 | AUTO | 偽陽性 | `execPlayFreeFromTrash`はSEARCH interactionを`maxPick:1`かつ0枚確定可で出し、「使用しない」を既に許すため`mandatory:true`でも強制使用にならない。 | `effectExecutor.ts:6094` `execPlayFreeFromTrash`（SEARCH生成部） | effectの`mandatory`を任意性の唯一の表現と見る指摘を外し、consumerの0枚選択慣例を採用した。 | 使用してもよい |
| S003 | WX25-P1-022-E2 | AUTO | 真バグ＋機構待ち | `PLAY_FREE source:opp_trash`は解決時に候補を選ぶ経路で、対象2枚をこのターン後刻使用できる権利もコスト支払使用も保存しない。 | `effectExecutor.ts:6039` `execPlayFree`、spell use gate | `optional:true`は今使用するかの辞退であり、対象カード別のturn-scoped使用許可ではない。 | このターン、あなたはそれらを使用してもよい（コストは支払う） |
| S004 | WXDi-P15-051-E1 | AUTO | 真バグ＋機構待ち | `countFilter:{cardType:'シグニ'}`は自場全SIGNIを数え、stack下カードを持つhostだけという集合へ絞れない。 | `effectEngine.ts` POWER_MODIFY_PER_FIELD consumer、`matchesStateFilter` | BOの7比例型ではPER_FIELDが最寄りだが、TargetFilterにhas-under-hostがなく単位集合を作れない。 | 下にカードがあるあなたのシグニ１体につき－1000 |
| S005 | WXDi-P11-051-E1 | AUTO | 真バグ | CONTINUOUS対象は`thisCardOnly`1体だけで、同名ウムルへの第二POWER_MODIFYが無い。 | `effectEngine.ts` `calcFieldPowers` POWER_MODIFY収集 | `cardName`で同名対象は表せるがactiveConditionの存在確認は対象への自動波及を起こさない。 | このシグニとあなたの《融合の儀　ウムル//メモリア》のパワーを＋4000 |
| S006 | WXDi-P11-079-E1 | AUTO | 真バグ＋機構待ち | 相手SIGNI targetはcardTypeだけで、付着物またはstack下カードを持つというOR制約が全欠落している。 | `effectExecutor.ts` `execPowerModify`→`fieldCandidates` | `anyOf`と`hasCharm`/`hasAcce`は近いが、ソウルおよび「下にカードあり」のTargetFilter隣接語彙が無くOR全体を完結できない。 | カードが付いているか下にカードがある対戦相手のシグニ |
| S007 | WX25-CP1-TK2A-E1 | AUTO | 真バグ | owner:any無filterは任意SIGNIを選び、クラフト自身をstack下に含むtopの指定名SIGNIへ固定しない。 | `effectExecutor.ts` `execPowerModify`、`calcFieldPowers` | `aboveSelf:true`と`cardName`のANDでhost位置と名前を既存表現でき、単なるcardNameだけの対象化にはしない。 | これの上にある《鰐渕アカリ（正月）》の…パワーを＋10000 |
| S008 | WX14-073-E2 | AUTO | 真バグ | ON_PLAY効果にconditionが無く、trash内spell数を問わず相手SIGNIを－3000する。 | `execUtils.ts` `evalCondition` COUNT_THRESHOLD | `COUNT_THRESHOLD{location:'trash',color?}`の隣接仕様で枚数比較可能で、POWER比例7型を使う文ではない。 | トラッシュにスペルが３枚以上ある場合 |
| S009 | WXDi-P05-044-E1 | AUTO | 真バグ | activeConditionは相手ターンだけで、center LRIGの白条件がANDされていない。 | `effectEngine.ts` continuous condition評価、`LRIG_COLOR` consumer | `TURN_OWNER`が色まで暗黙評価する経路はなく、既存`AND[TURN_OWNER,LRIG_COLOR]`で表せる。 | センタールリグが白であるかぎり |
| S010 | WXK04-043-E2 | AUTO | 真バグ | ON_BLOOD_CRYSTAL_ARMORのtriggering SIGNIを保存せず、owner:anyの別SIGNIを再選択する。 | trigger collector、`execPowerModify` dynamic target解決 | `triggerScope:any_ally`は発火元の向きだけであり、対象を発火元へ自動固定しない；`isTriggerSource`が既存。 | そのシグニのパワーを＋5000 |
| S011 | WDK01-013-E1 | AUTO | 真バグ | 無条件CONTINUOUSとなり、自場にdrive SIGNIが0体でも自己＋4000が適用される。 | `evalCondition` HAS_CARD_IN_FIELD、`matchesStateFilter` | `HAS_CARD_IN_FIELD{filter:{isDrive:true}}`が既存で、POWER_MODIFY_PER_FIELD等の比例値ではない。 | 場にドライブ状態のシグニがあるかぎり |
| S012 | WX25-CP1-TK2A-E1 | AUTO | 真バグ | liveはPOWER_MODIFYだけで、指定hostの実効levelへ＋1を積むLEVEL_MODIFY stepが存在しない。 | `effectExecutor.ts:1488` `execLevelModify` | power値からlevelを暗黙加算する慣例はなく、`LEVEL_MODIFY`＋`aboveSelf/cardName`で既存配線へ載る。 | これの上にある《鰐渕アカリ（正月）》のレベルを＋１し |
| S013 | WXDi-P08-068-E1 | AUTO | 真バグ | conditionは相手手札`eq 1`だけで、指定3名の自場存在ORと手札0枚の場合を拒む誤条件になっている。 | `execUtils.ts` OR/HAS_CARD_IN_FIELD/HAND_COUNT | `HAND_COUNT eq1`を「1枚以下」とみなす慣例はなく、cardNames＋ORと`lte1`で既存表現できる。 | 指定3種があるか、対戦相手の手札が１枚以下の場合 |
| S014 | WD06-009-E1 | AUTO | 真バグ | 全自SIGNI＋1000にactiveConditionが無く、life枚数の両者比較を一切行わない。 | `execUtils.ts` `LIFE_COMPARE_OPP` | `LIFE_COUNT`閾値は別物だが`LIFE_COMPARE_OPP{operator:'lt'}`がconsumerまで既存なので機構待ちではない。 | あなたのライフクロスが対戦相手より少ないかぎり |
| S015 | WXDi-P13-043-E1 | AUTO | 真バグ | REMOVE_ABILITIESしか実行せず、同じ最大2体へ－5000するactionが欠落する。 | `effectExecutor.ts` `execRemoveAbilities`、`execPowerModify` targetsStored | duration共有は別actionを生成せず、先行対象保存から同一対象POWER_MODIFYを既存構成できる。 | それらのパワーを－5000する |
| S016 | WXK11-048-E1 | AUTO | 真バグ | REVEAL_AND_PICK filterはcardTypeだけで、公開SIGNIの実効powerを被バニッシュsource未満に限定しない。 | `resolveDynamicFilter`→REVEAL_AND_PICK候補filter | `powerLtSelf`が効果元実効power－1を解決する既存語彙で、BOの比例修正族を新設する必要はない。 | それがこのシグニよりパワーの低いシグニの場合 |
| S017 | WXDi-P04-079-BURST | AUTO | 真バグ | LB liveは公開3枚側だけで、二択CHOOSEと自全SIGNI＋10000のchoice①が存在しない。 | `effectExecutor.ts` `execChoose`、`execPowerModify` | `mandatory:false`はLB全体の辞退で、欠落した選択肢を合成しない。 | どちらか１つを選ぶ。①…すべてのシグニのパワーを＋10000 |
| S018 | WX11-052-E2 | AUTO | 真バグ | SEARCH filterがサーバントXだけなので、Yを別に探して同時に場へ出す処理が無い。 | `effectExecutor.ts` `execSearch`/resumeSearch | `cardNames:[X,Y],maxCount:2`では各名1枚を必須にせず、名前別SEARCH2段が必要。 | 《サーバント　Ｘ》１枚と《サーバント　Ｙ》１枚 |
| S019 | WX14-CB02-BURST | AUTO | 真バグ | LB SEARCHは暁月1枚のみを候補化し、燦を探す第二検索を行わない。 | `effectExecutor.ts` SEARCH continuation | 単一filterの部分一致は異名2枚の各1制約を保証せず、名前別処理のSEQUENCEで足りる。 | 《暁月》１枚と《燦》１枚 |
| S020 | WX05-019-E3 | AUTO | 真バグ＋機構待ち | movedToDeckOwner/minCountは相手の任意zone・任意cardのdeck移動でも発火し、field-origin SIGNIを識別しない。 | `triggerCollect.ts` ON_CARD_MOVED_TO_DECK collector | ON_TRASHの`fromZones`/card filterが最寄りだが、このtimingのtriggerCondition隣接fieldにorigin zoneとmoved-card filterが無く配線されない。 | 対戦相手のシグニ１体が場からデッキに移動したとき |
| S021 | SP15-001-E1 | AUTO | 真バグ＋機構待ち | `cardType:'ルリグ'`は検索対象型を誤限定し、候補カードの限定条件欄とcenter LRIG typeの動的一致を評価しない。 | `execSearch`→`matchesFilter`、card metadata | `colorMatchesLrig`等は色比較で、カードの限定条件文字列とLRIG typeを比較するTargetFilter隣接語彙は無い。 | 限定条件にあなたのセンタールリグのルリグタイプを持つカード |
| S022 | WXEX2-43-E3 | AUTO | 真バグ | `selectionConstraint.distinct:'level'`は在るが`maxCount:1`のため2枚を選べず、原文の合計2枚に到達しない。 | `execSearch` selectionConstraint consumer | distinct levelを機構待ちとはせず、既存constraintを保ったまま上限2へ直す単点。 | レベルの異なる…シグニを合計２枚 |
| S023 | PR-470B-E1 | AUTO | 真バグ＋機構待ち | `never:true`を`canSelfPlay`が無条件falseにし、指定カード効果からの配置まで一律拒否する。 | `effectEngine.ts:1119` `canSelfPlay`、ADD_TO_FIELD gate | `condition`は盤面状態による通常召喚許可で、配置cause cardNameをwhitelistする隣接fieldがSelfPlayRestrictActionに無い。 | 《現実からの逃避　タマ》の効果以外によっては…場に出せない |
| S024 | WXK05-016-E2 | AUTO | 真バグ＋機構待ち | TRASH_CARD filterは全SIGNIを候補化し、当ターンに手札から捨てたinstanceだけへ絞るprovenanceを持たない。 | `execAddToField` trash candidates、discard funnels | `turn_hand_discarded_count`は枚数だけでcard identityを保持せず、`last_cost_trashed_cards`は直前コスト限定で今回の履歴に使えない。 | トラッシュからこのターンに捨てたシグニ１枚 |
| S025 | WX24-P3-041-E1 | AUTO | 真バグ | 場出し後のPOWER_MODIFYがowner:anyを再選択し、直前にtrashから置いたinstanceへ関連付かない。 | `execAddToField` lastProcessedCards、`execPowerModify` targetsStored | `STORE_LAST_PROCESSED_TARGETS`/targetsStoredの既存引継ぎで表せ、cardName一致では同名別instanceを誤る。 | それのパワーを＋3000する |
| S026 | WX24-P3-041-E1 | AUTO | 真バグ | `GRANT_KEYWORD`はSIGNIへ文字列を付ける一方、原文はplayerのlimit_upper_tokenを1つ得る。 | `execStubPart3.ts:4025` `PLACE_LIMIT_UPPER`、`lrigLimit.ts` | 第17バッチS022の汎用player-scoped tokenにせず、リミットアッパー専用state/consumerは既に存在する。 | 【リミットアッパー】１つを得る |
| S027 | WD21-020-E1 | AUTO | 真バグ | 現liveのTRANSFER_TO_DECKは場の自SIGNIをbottomへ動かし、deck上からSIGNIまで公開する走査を全くしない。 | `effectExecutor.ts:5866` `execRevealUntil` | `REVEAL_UNTIL`のstopConditionが既存であり、誤った場移動をdid-it慣例として残さない。 | デッキの上からシグニがめくれるまで公開し |
| S028 | WD21-020-E1 | AUTO | 真バグ | 公開集合をランダム化してdeck bottomへ戻すstepがliveに無く、後続level判定の材料も正しく生成されない。 | `execRevealUntil` `deck_bottom_shuffled`、lastProcessedCards | `TRANSFER_TO_DECK shuffle:false`は1枚の順序維持移動で、公開全束shuffleの代用にならない。 | 公開したカードをシャッフルし、デッキの一番下に置く |
| S029 | WX09-015-E1 | AUTO | 真バグ | 後段BOUNCEはowner:selfを新規選択し、先に対象宣言した正面の相手SIGNIを戻さない。 | `frontOfSelf`候補化、stored target→`execBounce` | BANISHのlastProcessedは支払った自SIGNIなので「直前処理対象」を流用せず、事前対象保存が必要。 | このシグニの正面のシグニ１体を対象とし…それを手札に戻す |
| S030 | WXK10-004-E1 | AUTO | 真バグ＋機構待ち | ZONE_MOVE_IMMUNITY型はzonesをhand/energyに限定し、deck/trash/life/check/lrig等の非field自領域を保護対象へ登録できない。 | `effectExecutor.ts:7999`、`activeOppMoveImmunityZones` | 既存期間・owner配線は使えるが、隣接unionと各移動funnelがhand/energy二択なのでzone集合拡張が必要。 | 場以外のあなたの領域にあるカードは…移動しない |
| S031 | WX25-P2-048-E1 | AUTO | 真バグ | `UP target:LRIG count:1`はcenter top1体だけを処理し、左右assist LRIGをアップしない。 | `effectExecutor.ts` `execUp` LRIG branch | 「LRIGはセンタートップ直結」の慣例は単数「ルリグ1体」用で、「すべて」を3枠へ拡張しない。 | あなたのすべてのルリグをアップする |
| S032 | WX20-043-E1 | AUTO | 真バグ | condition thenのLIFE_CRASHにoptionalが無く、デメニギス存在時に必ずcrash interactionへ進む。 | `effectExecutor.ts:2103` `execLifeCrash` optional branch | effect全体の`mandatory:true`はAUTO解決義務であり、then内crashの任意性を付与しない。 | ライフクロス１枚をクラッシュしてもよい |
| S033 | WX11-018-E1 | AUTO | 真バグ | choice③は自deck topを見るactionだけで、相手hand全体と相手deck topの両方を見る処理を保持しない。 | `execChoose`、REVEAL/LOOK系owner consumer | 単一LOOKのownerをopponentへ直すだけでも相手hand閲覧が残るため、2zoneのSEQUENCEが要る。 | 対戦相手の手札と、対戦相手のデッキの一番上を見る |
| S034 | WX24-P3-048-E1 | AUTO | 真バグ＋機構待ち | DOWNは固定1体で、後段BOUNCE filterも実際に任意数downした枚数をlevel上限へ解決しない。 | `execDown` lastProcessedCards、`resolveDynamicFilter`→`execBounce` | `levelEqLastProcessedCount`は等値候補で、今回のlevel≦countを表せず；固定levelRangeやPER_FIELD比例7型も解決時選択数を渡さない。 | レベルがこの方法でダウンしたシグニの数以下 |
| S035 | WX13-050-E1 | AUTO | 真バグ | trash対象選択が無く、crash後は`ADD_TO_LIFE fromTop:true`でdeck topを加える別効果になっている。 | TRASH_CARD対象保存、`execAddToLife` source経路 | IS_MY_TURN did-itはcrash成否しか表さず、事前に選んだtrash cardを生成しない。 | あなたのトラッシュからカード１枚を対象とし…それをライフクロスに加える |
| S036 | WXK03-066-E1 | AUTO | 真バグ | crash成功後のADD_TO_LIFEが`fromTop:true`を明示し、原文のdeck bottomと逆端から取る。 | `effectExecutor.ts` `execAddToLife` | lifeは上から増減する注記をdeckの取出し方向へ流用せず、bottom source指定の既存action表現へ直す。 | デッキの一番下のカードをライフクロスに加える |

## 3. 所見（action型ごと）

- **LOOK_AND_REORDER**: S001はLOOK poolの一部をgate所在zoneへ出す固定zone partition。
- **PLAY_FREE系**: S002はSEARCHの0枚確定慣例で唯一の偽陽性。S003は即時使用とturn中使用権を混同した別機構。
- **POWER_MODIFY系**: S004/S006だけTargetFilter語彙待ち。S005/S007/S010/S012/S015は対象host・対象保存の脱落、S008/S009/S011/S013/S014/S016は既存Condition/動的filterで表せる。
- **REVEAL_AND_PICK**: S016は既存`powerLtSelf`、S017はCHOOSEの一枝全欠落。
- **SEARCH**: S018/S019は異名各1枚、S020は移動イベント属性、S021は限定条件×LRIG type、S022は既存distinct制約に対するcount誤り。
- **SELF_PLAY_RESTRICT**: S023は無条件禁止とcause whitelistの差。
- **SEQUENCE系**: S024はturn provenance、S025/S029/S035は選択対象引継ぎ、S027/S028は同じREVEAL_UNTIL構造、S030はzone集合、S034は動的level上限。他は既存actionの単純脱落・owner/count/optional/source誤り。

同じ機構に属する組は、S007/S012（同じeffectの`aboveSelf+cardName` host）、S015/S025/S029/S035（事前/直前対象を後段へ保存する基盤）、S018/S019（異名を各1枚検索）、S027/S028（REVEAL_UNTIL＋公開束bottom shuffle）である。S004/S006はどちらも「下カードありhost」のTargetFilter追加を共有するが、S006は付着物ORも含む。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| LOOK pool→gate zone配置 / S001 | LOOK選択札を`ADD_TO_FIELD`へ渡し、配置候補zoneを`own_gate_zones`に限定するquota/zone配線。最寄り`inGateZone`は既配置対象filter。**第17バッチ§4「固定SIGNI zone配置」S003と同一基盤**。 |
| turn中の対象spell使用権 / S003 | 対象instanceとowner zoneをturn-scoped PlayerStateへ保存し、spell playable gate・使用時cost支払・turn終了clearへ配線。最寄り`PLAY_FREE`は解決時使用。第17バッチ§4 S022のplayer-scoped tokenとは状態所有だけ共通で権利consumerは別。 |
| has-under-host TargetFilter / S004,S006 | TargetFilterへ「stack length>1」を追加し`fieldCandidates`/`matchesStateFilter`へ配線。S006では`anyOf`内でhasCharm/hasAcce/ソウル相当とOR。最寄り`THIS_CARD_HAS_UNDER`は効果元自身Condition。**第12バッチ§4 S034のunder存在基盤と共有**。 |
| moved-to-deck eventのcard/origin filter / S020 | ON_CARD_MOVED_TO_DECKのevent payloadへ移動cardとfromZoneを保持し、collectorが`movedCardFilter:{cardType:'シグニ'}`＋`fromZones:['field']`を評価。最寄りON_TRASHの同fieldは別collector。 |
| 限定条件×center LRIG type filter / S021 | TargetFilterへカードの限定条件とcenter LRIG typeの動的一致を追加し、SEARCH候補の`matchesFilter`へcaster stateを渡す。最寄り`colorMatchesLrig`は色比較で限定条件欄を読まない。 |
| effect-source whitelist付きSELF_PLAY_RESTRICT / S023 | 配置cause cardNumを`canSelfPlay`まで渡し、`allowedEffectSourceCardName`一致時だけneverを解除。最寄り`condition`は通常召喚前の盤面条件。 |
| turn中discard instance履歴 / S024 | 全discard funnelでhand→trash instanceをowner別turn台帳へ積み、TRASH_CARD candidate filterが照合、turn終了clear。最寄り`turn_hand_discarded_count`はidentity無し。**第17バッチ§4 S029のzone-origin履歴とprovenance台帳を共有可能**。 |
| 非field全zone移動耐性 / S030 | ZoneMoveImmunityAction.zonesを全非field zoneへ拡張し、`activeOppMoveImmunityZones`を各移動funnelで一貫消費。最寄り現行型はhand/energyのみ。 |
| lastProcessed count以下のlevel filter / S034 | TargetFilterへ`levelLteLastProcessedCount`を追加し、DOWNの実処理枚数をlastProcessedCardsに残して`resolveDynamicFilter`でlevel.maxへ解決。最寄り`levelEqLastProcessedCount`は等値。 |

機構待ちは11 findings、8登録単位。過去§4と同一/共有先を明記したS001、S004/S006、S024は新規基盤として二重登録しない。

## 5. 偽陽性件数についての自己評価

事前予測は、前バッチが1/36で今回は全件liveあり・単純脱落が多いため **0〜2件**。実測は **1/36（2.8%）**。S002だけは表面上`mandatory:true`でもconsumerがSEARCHを0枚で確定でき、原文の任意使用を満たした。他35件には同様の自動適用・対象直結・did-it・0枚選択慣例で指摘を打ち消すものが無かったため、予測範囲内である。

## 6. 条件以外で見つけた原文との食い違い

**4 effect・5項目**。

- `WXDi-P15-079-E1`: S001以外に、残りを「好きな順番」にする操作をliveの単一bottom destinationが保持するか段2で要確認。
- `WX25-P1-022-E2`: S003は原文が自分と相手のtrashから「それぞれ1枚まで」だが、liveは`source:'opp_trash'`だけで自分側対象も欠落し、さらに`ignoreCost:true`が「コストは支払う」と逆。
- `WX20-043-E1`: S032以外に、deck topをlifeへ加えるstepがcrash条件の外にあり、条件不成立/任意skipでも実行される。
- `WX24-P3-048-E1`: S034以外に、最初のDOWNが「好きな数」ではなく固定1体である。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（17.2秒、実測）：

- typecheck PASS
- golden **2337 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**（200ゲーム、実行7983手）
- census **773 / baseline 773**
- census:stubs **A🔴0 / C群0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業前からのtracked M 2本（`scripts/archive/semanticAuditLedger.mjs`、`scripts/archive/semanticAuditMkBatchSingles.mjs`）と、既存の第8〜第17バッチ成果物・今回入力`stage1_batch18.txt`/indexを含む未追跡群に、本報告書`stage1_batch18_triage.md`が加わった状態。今回新たに変更した既存trackedファイルは0。

`git diff --stat`は計器2本だけ：`semanticAuditLedger.mjs | 13 ++++++++++---`、`semanticAuditMkBatchSingles.mjs | 7 ++++++-`、計 **2 files changed, 16 insertions(+), 4 deletions(-)**。いずれも作業前からの差分で触れていない。

報告書はUTF-8で、書き込み後に先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **25,617 bytes**。

## 8. ガードレール2・3・4・6・7で見立てを変更した件

- **S002（ガードレール2/6）**: `mandatory:true`から強制使用の真バグと見たが、`execPlayFreeFromTrash`が0枚確定可能なSEARCHを生成する実装を開き、偽陽性へ変更した。
- **S004/S006（ガードレール3/4/7）**: BO/BPを再確認。PER_FIELDは使えるがTargetFilter隣接fieldにhas-under-hostが無く、Conditionの`THIS_CARD_HAS_UNDER`は主体が異なるため機構待ちとした。
- **S007/S012（ガードレール4/8）**: cardNameだけでは位置参照不足と見たが、TargetFilter隣接部に`aboveSelf`がconsumer説明付きで存在したため、両方を機構待ちから既存語彙の真バグへ変更した。
- **S011（ガードレール4/7）**: drive条件を新語彙候補と見たが、`TargetFilter.isDrive`とHAS_CARD_IN_FIELD consumerが既存なので真バグのみへ変更した。
- **S014（ガードレール4/7）**: 先回りメモどおり`LIFE_COMPARE_OPP`がCondition unionとconsumerにあり、機構待ちを外した。
- **S016（ガードレール3/4）**: 動的power比較待ちを疑ったが、隣接field`powerLtSelf`が効果元の実効power－1へ解決されるため真バグのみへ変更した。
- **S026（ガードレール2/4）**: player-scoped token一般機構待ちと見たが、`PLACE_LIMIT_UPPER`と`limit_upper_token`/limit consumerが既存なので単純action誤りへ変更した。
- **S027/S028（ガードレール3/4）**: 公開untilと公開束shuffleを新機構と見たが、`REVEAL_UNTIL`の`deck_bottom_shuffled`とlastProcessed保持がconsumerに配線済みなので真バグのみとした。
- **S030（ガードレール4）**: duration/ownerを含む機構全体が無い見立てを外した。現行`ZONE_MOVE_IMMUNITY`は期間配線済みだがzones unionがhand/energy限定で、zone集合拡張だけが機構待ち。

先回りメモBO〜BSと実コードの食い違いは0件。ただしBPの不足は`aboveSelf`（位置host）とは別で、`has-under-host`（候補状態filter）のみ不足することを切り分けた。
