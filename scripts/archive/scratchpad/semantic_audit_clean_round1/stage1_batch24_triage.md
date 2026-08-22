# 意味照合監査 clean群 round1 段1 第24バッチ triage

## 1. サマリ

| action型 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|
| REVEAL_AND_PICK | 2 | 0 | 0 | 0 |
| SEARCH | 0 | 2 | 0 | 0 |
| SEND_TO_ENERGY | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/ADD_TO_FIELD/ENERGY_CARD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/ADD_TO_FIELD/HAND_CARD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/BANISH/SIGNI) | 3 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/CONDITIONAL/HAS_CARD_IN_FIELD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/DRAW) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/ENERGY_CHARGE_FROM_DECK) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/ENERGY_CHARGE_FROM_DECK/DRAW) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/GRANT_KEYWORD/SIGNI) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/LIFE_CRASH/ADD_TO_LIFE) | 2 | 0 | 2 | 0 |
| SEQUENCE(SEQUENCE/LIFE_CRASH/CONDITIONAL) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/LOOK_PICK_CHAIN/BANISH) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/LOOK_PICK_CHAIN/INSTALL_DELAYED_TRIGGER) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/POWER_MODIFY/SIGNI) | 3 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/POWER_SET/SIGNI) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/REMOVE_ABILITIES/SIGNI) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/SEARCH/ADD_TO_FIELD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/SEARCH/REVEAL) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/SEND_TO_ENERGY/SIGNI) | 2 | 0 | 1 | 0 |
| SEQUENCE(SEQUENCE/TRANSFER_TO_DECK/SIGNI) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRANSFER_TO_DECK/TRASH_CARD) | 2 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRASH/DECK_CARD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRASH/HAND_CARD) | 2 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRASH/SIGNI) | 1 | 0 | 1 | 0 |
| TAKE_FROM_UNDER_SIGNI | 1 | 0 | 0 | 0 |
| TRANSFER_TO_DECK | 3 | 0 | 1 | 0 |
| TRANSFER_TO_HAND | 1 | 0 | 0 | 0 |
| TRASH | 2 | 0 | 0 | 0 |
| **計** | **41** | **2** | **5** | **0** |

※機構待ちは真バグの内数。finding単位で5件、登録単位で3件。

## 2. finding 全43件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WX06-013-E1 | AUTO | 真バグ | `REVEAL_AND_PICK.remainder.position`は`split_top_bottom`を受理し分割UIまで在るが、liveは`top`固定なので下へ置く選択を一度も提示しない。 | `resumeSearch:8422-8446`→`INTERNAL_SPLIT_REVEALED`→`EffectInteractionModal` | `reorder`やtop内順序指定は上下の行き先選択を代行しない。 | 残りを好きな順番でデッキの一番上か一番下に置く |
| S002 | WXDi-CP02-005-E1 | AUTO | 真バグ | `GAIN_BOND{source:'last_found'}`は直前に手札へ加えたCardNameを`ownerState.bonds`へ追加できるが、liveの後段に同actionがない。 | `execGainBond:6743-6753`→`hasKeyword`のkizuna gate | `HAS_BOND`は獲得済み判定であり、REVEAL_AND_PICK自体に絆の暗黙付与はない。 | この方法で公開した生徒との絆を獲得する |
| S003 | WXK02-070-E1 | AUTO | 偽陽性 | `thenAction`がDECK_CARDの`TRANSFER_TO_DECK`なのでdeck-placement特例が成立し、`afterAction`のshuffleを先に解決してからpicked instanceをtopへ固定する。 | `isDeckPlacementFromSearch:8345-8353`→`resumeSearch:8464-8480` | JSON配列のthen→after表面順は、この専用予約経路では実行順を表さない。 | シャッフルし、そのシグニを公開しデッキの一番上に置く |
| S004 | WXK03-049-E1 | AUTO | 偽陽性 | CHOOSEの全choiceがDECK_CARD配置であるため再帰判定を通り、shuffle後に選択札をinstanceIdでtopまたはsecondへ当て直す。 | `isDeckPlacementFromSearch:8349-8352`→`bindSearchedDeckCards`→`resumeSearch` | 通常SEARCH契約だけを当てはめる見方を外した。CHOOSEもCX特例の明示対象である。 | デッキをシャッフルし、そのシグニを一番目かニ番目に置く |
| S005 | WX20-046-E3 | AUTO | 真バグ | ally attack collectorは`triggerFilter.powerRange.min`へ実効powerを渡せるのに、live triggerFilterは緑だけで20000下限を持たない。 | `collectFieldTriggers:3783-3790`→`matchesFilter(effectivePower)` | action対象の相手SIGNIへpower条件を付けても、アタッカー側の条件にはならない。 | アタックしたそのシグニのパワーが20000以上の場合 |
| S006 | WX24-P3-086-E1 | AUTO | 真バグ | `POWER_MODIFY.targetsLastProcessed`なら直前に配置したinstanceへ無選択適用できるが、owner:anyの再選択になっており配置札との同一性がない。 | `execPowerModify:1656-1664` | durationの`UNTIL_OPP_TURN_END`は期間だけを表し、対象参照を直前札へ束縛しない。 | 次の対戦相手のターン終了時まで、それのパワーを＋2000する |
| S007 | WX20-039-CB-E1 | AUTO | 真バグ | BANISH consumerは`powerRange.max`を候補へ適用するが、後段target filterはcardTypeだけなので5000超も選べる。 | `execBanish`→`resolveDynamicFilter`→`matchesFilter(powerRange)` | ADD_TO_FIELD側のlevel/color/story filterは相手BANISH候補へ伝播しない。 | 対戦相手のパワー5000以下のシグニ１体 |
| S008 | WX20-063-E3 | AUTO | 真バグ | `matchesFilter`の`cardName`は`CardName.includes`による部分一致だが、liveはthisCardOnly BANISHしかなく《Ne》含有の別1体を支払わない。 | `matchesFilter:641`→`execBanish` | このカード自身のバニッシュは「《Ne》を含むシグニ1体と」の追加対象を兼ねない。 | カード名に《Ne》を含むシグニ１体とこのシグニを |
| S009 | WX20-050-E1 | AUTO | 真バグ | 自分SIGNI候補へ`cardName:'ニャローブ'`を付ければ部分一致するが、現状filterはcardTypeのみで名称不問になっている。 | `effectEngine.matchesFilter:641`→`execBanish:1243-1249` | optionalは支払うか否かだけで、選べるカード名を狭めない。 | カード名に《ニャローブ》を含むシグニ１体 |
| S010 | WX11-046-E2 | AUTO | 真バグ | `powerLteLastProcessed`を`resolveDynamicFilter`が直前処理札の実効powerへ解決できるのに、2体目BANISHに同flagがない。 | `resolveDynamicFilter:2413-2420`→`execBanish` | 固定対象数やSEQUENCE順序からpower上限を暗黙生成する処理はない。 | それのパワー以下の対戦相手のシグニ１体 |
| S011 | WX25-P2-054-E1 | AUTO | 真バグ | `THIS_CARD_IS_AWAKENED`と`CONDITIONAL.else`が既存だが、liveは5000以下条件BANISHの後に13000以下BANISHを無条件連結する。 | `evalCondition(THIS_CARD_IS_AWAKENED)`→`execConditional:4962-4967` | did-itアンラップはelse付きCONDITIONALを外すため、排他的分岐を連続実行へ変える慣例はない。 | このシグニが覚醒状態の場合、代わりに |
| S012 | SP27-012-E1 | AUTO | 真バグ | `NO_COMMON_COLOR_AMONG_FIELD_SIGNI{filter:天使}`とelse分岐を評価可能なのに、liveは条件なしDRAW1＋DRAW2で必ず3枚引く。 | `evalCondition:2424-2447`→`execConditional` | 2つのDRAWを「代わりに」の最大値として統合するexecutor規則は存在しない。 | ３体ある場合、代わりにカードを２枚引く |
| S013 | WXDi-P12-081-E1 | AUTO | 真バグ | `SELF_POWER_GTE`を条件にDRAW等と同じthen/else構造を実行できるが、liveはENERGY_CHARGE1と2を無条件に足して3にする。 | `evalCondition(SELF_POWER_GTE):2053-2060`→`execConditional` | action countの後勝ち上書きはなく、SEQUENCEは両stepを順に消費する。 | パワーが15000の場合、代わりに【エナチャージ２】 |
| S014 | WX15-057-E1 | AUTO | 真バグ | 直前にエナへ置いた札はlastProcessedCardsへ残り、`LAST_PROCESSED_MATCHES{hasIcon:'アクセ',cardType:'シグニ'}`でDRAWをゲート可能だがliveは裸のDRAW。 | `execEnergyChargeFromDeck`→`evalCondition(LAST_PROCESSED_MATCHES)` | デッキトップをエナへ置くactionは札のiconに応じて後段DRAWを自動抑止しない。 | それが《アクセアイコン》を持つシグニの場合 |
| S015 | WXDi-P04-079-E1 | AUTO | 真バグ | 相手全SIGNIの能力喪失は在る一方、基本powerを期限付き10000へする`POWER_SET` stepが丸ごと存在しない。 | `execSequence`／continuous `POWER_SET` collector | REMOVE_ABILITIESは能力だけを除き、印刷powerや基本powerを変更しない。 | それらの基本パワーを10000にする |
| S016 | WD06-009-E2 | AUTO | 真バグ＋機構待ち | `execLifeCrash(triggerBurst:true)`はcheckへ置くだけで、その札がburst後energyへ行ったかという置換成立結果を後段ADD_TO_LIFEへ返さない。 | `execLifeCrash:2102-2160`→BattleScreen burst placement | 既存`crash_to_trash_instead`はturn flagで相手attack crashを一律変更し、今回1枚の「energyへ置かれる場合」成功ゲートにはならない。 | チェックゾーンに置かれたカードがエナゾーンに置かれる場合 |
| S017 | WD06-009-E2 | AUTO | 真バグ＋機構待ち | liveにcheck札のenergy配置をtrashへ差し替える宣言がなく、通常burst後placementをこの解決だけ横取りするone-shot置換も在らない。 | life-burst完了funnel `BattleScreen:11913-12054` | `CRASH_TO_TRASH_INSTEAD`はターン中の相手LC crash用で、自己crash札1枚に限定せず寿命・主体が過大。 | 代わりにそれをトラッシュへ置き |
| S018 | WX12-004-E1 | AUTO | 真バグ | 対象宣言を`STORE_LAST_PROCESSED_TARGETS`へ退避し後段BANISHを`targetsStored`にできるが、liveはcrash後に新しい相手SIGNIを選ぶ。 | `SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS`→`execBanish.targetsStored` | `snapshotLastProcessedForConditionals`はcrash札の条件スナップショットであり、事前のSIGNI対象を保存しない。 | 対戦相手のシグニ１体を対象とし…そうした場合、それをバニッシュ |
| S019 | WDK06-R01-E2 | AUTO | 真バグ | LOOK_PICK_CHAINのfield配置結果をlastProcessedCardsへ残せるため`powerLteLastProcessed`を使えるが、BANISH filterに動的上限がない。 | `resumeLookPickChain`→`resolveDynamicFilter.powerLteLastProcessed`→`execBanish` | 固定storyアームは配置札の候補だけを絞り、相手のpower候補には作用しない。 | この方法で場に出たシグニのパワー以下 |
| S020 | WX25-P1-079-E1 | AUTO | 真バグ | delayed effectはtargetをそのまま実行し、owner:any count1なので自分のcross状態全体ではなく双方から1体を選ぶ。 | `execInstallDelayedTrigger`→`execPowerModify`→`matchesStateFilter(isCross)` | triggerのON_ATTACK_PHASE_STARTは発火時期だけで対象owner/count/stateを補完しない。 | あなたのクロス状態のすべてのシグニ |
| S021 | WXDi-P09-074-E1 | AUTO | 真バグ | HAND_COUNT gte5のCONDITIONAL elseと`targetsStored`/`targetsLastProcessed`で同一対象へ3000か5000を排他的適用できるが、liveは別対象へ両方足す。 | `evalCondition(HAND_COUNT)`→`execConditional`→`execPowerModify` | effect durationを外側へ置いてもdeltaの排他性・対象同一性は生まれない。 | 手札が５枚以上ある場合、代わりに…＋5000 |
| S022 | WXDi-P09-055-E1 | AUTO | 真バグ | `AWAKEN_SIGNI.targetsLastProcessed`と`cardNames`完全一致集合を組めるのに、裸AWAKENが直前対象の名称を検査せず実行される。 | `execAwakenSigni:6294`／`matchesFilter.cardNames:642` | AWAKEN_SIGNI省略時のsource既定は効果元寄りで、3名称条件や先行対象同一性を含まない。 | それが《コードハート…》か《幻獣…》か《爆砲…》の場合 |
| S023 | WX25-P3-105-E1 | AUTO | 真バグ | TRASH_COUNT gte15のthen/elseとstored targetで同じ1体へ-12000または-10000を実行できるが、現状は-10000後に別のanyへ-12000を追加する。 | `evalCondition(TRASH_COUNT)`→`execConditional.else`→`execPowerModify.targetsStored` | 条件付き後段を前段の置換と解釈する合成規則はなく、deltaは合計-22000になり得る。 | １５枚以上ある場合、代わりに…－12000 |
| S024 | WX06-022-E1 | AUTO | 真バグ | `LRIG_COLOR:white`と`THIS_CARD_IN_CENTER_ZONE`をANDできるが、live CONTINUOUSにはactiveConditionがなく全zone・全LRIG色で有効。 | `checkActiveCondition(LRIG_COLOR/IS_SELF_IN_CENTER_ZONE)`→continuous collectors | target owner:self count1は効果元自身や中央zoneを自動指定せず、条件の代用にならない。 | センタールリグが白で、このシグニが中央のシグニゾーンにあるかぎり |
| S025 | WDK07-Y08-E1 | AUTO | 真バグ | SIGNIへの`GRANT_KEYWORD 'アタックできない'`は既存attack gateが読むが、liveは能力喪失とbet時LRIG付与しか持たない。 | `execGrantKeyword`→signi attack gate | REMOVE_ABILITIESは対象SIGNIへ新しい攻撃禁止能力を付与しない。 | 対象の対戦相手のシグニ１体は「【常】：アタックできない。」を得る |
| S026 | WXK02-051-E1 | AUTO | 真バグ | SEARCH→ADD_TO_FIELDの配置結果を参照する`powerLteLastProcessed`が在るのに、後段BANISHは無制限のcardType filterだけである。 | `resumeSearch`/`execPlaceSigniOnField`→`resolveDynamicFilter:2413` | ライズ召喚条件は配置可否を制御する別層で、場に出た札のpowerをBANISHへ渡さない。 | この方法で場に出したシグニのパワー以下 |
| S027 | WX16-041-E1 | AUTO | 真バグ | トラップ発動は専用collectorが独立effectを収集する設計だが、liveはトラップ帰結をON_PLAYのSEARCH後へ連結している。 | `collectTrapActivateTriggers`→effect stack | `hasIcon:'トラップ'`の捨てコストは【出】の支払いだけで、同カードのトラップ能力発動を意味しない。 | 《トラップアイコン》：対戦相手の…シグニ１体を |
| S028 | WXK04-059-E1 | AUTO | 真バグ | `TRANSFER_TO_HAND{source:TRASH_CARD,filter:{story:'水獣'}}`を実行可能だが、liveのSEQUENCEはSEND_TO_ENERGYとDRAWしかない。 | `execTransferToHand`→`movableTrashCandidates` | DRAW1は不特定deck topの取得であり、対象の水獣回収を代替しない。 | トラッシュから対象の＜水獣＞のシグニ１枚を手札に加え |
| S029 | WXK03-070-E1 | AUTO | 真バグ＋機構待ち | `costUnparsed:true`のため指定3名称をenergyから各1枚払わず2つの除去を解決でき、宣言済`energyTrashGroups`も一般ACTIVATED/AUTO cost経路で消費されない。 | effect cost gate/pay/UI（現状`energyTrashGroups` consumerは`resonaSummon.ts`のみ） | 単一`energyTrash` count3＋cardNamesでは各名称exact1を保証せず、同名3枚を許す。 | エナゾーンから《モモイヌ》１枚と《モモザル》１枚と《モモキジ》１枚を |
| S030 | WXDi-CP02-035-E1 | AUTO | 真バグ | `LAST_PROCESSED_POWER_GTE:15000`は直前に移動したSIGNIの実効powerを判定できるが、後段HAND TRASHは無条件である。 | `execTransferToDeck`→`evalCondition:2414-2422`→`execTrash` | 移動元filterのcardTypeはpower情報を条件へ自動昇格しない。 | それのパワーが15000以上の場合 |
| S031 | WXEX1-60-E2 | AUTO | 真バグ | `matchesFilter.cardName`は部分一致なのでフレイスロを指定可能だが、live source filterは全SIGNIを5枚まで許す。 | `execTransferToDeck`→`matchesFilter:641` | 後段`levelEqLastProcessedCount`は戻した枚数だけを使い、戻した札の名称を検証しない。 | カード名に《フレイスロ》を含むシグニを５枚まで |
| S032 | WXDi-P04-005-E1 | AUTO | 真バグ | CHOOSEでself版とopponent版のTRANSFER_TO_DECKを分けられるが、liveはowner:self一本なので相手側を選択できない。 | `execChoose`→`execTransferToDeck(owner)` | owner:anyの暗黙解決はなく、後段DRAWのowner:selfも前段player選択を生まない。 | あなたか対戦相手は自分のトラッシュにあるすべてのカードを |
| S033 | WXEX2-62-E1 | AUTO | 真バグ | `LAST_PROCESSED_LEVEL_SUM{operator:'gte',value:7}`が既存なのに、BANISHはeq7 LIFE_CRASH条件の外で常時走る。 | `evalCondition(LAST_PROCESSED_LEVEL_SUM)`→`execConditional` | 直前のeq7条件は次の独立stepへ波及せず、7未満でもBANISHを止めない。 | ７以上の場合、対戦相手のパワー7000以下のシグニ |
| S034 | WXDi-P06-035-E2 | AUTO | 真バグ | `LAST_PROCESSED_COUNT_GTE:3`のthenに無制限BANISH、else内eq2相当へ10000以下BANISHを置けるが、liveは後者を常時追加する。 | `execTrash`→`evalCondition(LAST_PROCESSED_COUNT_GTE)`→`execConditional.else` | gte2条件の直後に裸BANISHを置く構造は「3枚以上なら代わりに」を表さない。 | ３枚以上捨てた場合、代わりに対戦相手のシグニ１体 |
| S035 | WX14-062-E1 | AUTO | 真バグ | SIGNI検索とは別にcardTypeスペルのSEARCHを連結できるが、liveはシグニ1枚の検索しか生成していない。 | `execSequence`→`execSearch`→`resumeSearch` | 単一SEARCHのfilterはOR quotaを作らず、シグニ選択からスペル1枚を暗黙追加しない。 | デッキからシグニ１枚とスペル１枚を探して |
| S036 | WX19-031-E1 | AUTO | 真バグ＋機構待ち | `collectAllyLrigAttackTriggers`はassist topもwatcherに含め、triggerScope:any_allyだけでは攻撃slotをcenterに限定できないためassist attackでも積む。 | `performLrigAttack(slot)`→`collectAllyLrigAttackTriggers:611-647` | ON_ATTACK_LRIGは現在center/assist共通eventで、triggerFilterはCardDataだけを見てslot identityを表せない。 | あなたのセンタールリグがアタックしたとき |
| S037 | WXDi-P12-052-E2 | AUTO | 真バグ | `TakeFromUnderSigniAction.filter`をexecutorがunder候補へ掛けるが、live actionはfilterなしなので非ディソナ札も選べる。 | `execTakeFromUnderSigni:6229-6256`→`matchesFilter(hasIcon)` | fromThisはhostだけを固定し、その下のカード属性を制限しない。 | このシグニの下から《ディソナアイコン》のカードを１枚まで |
| S038 | WX17-022-E1 | AUTO | 真バグ | 自分版・相手版をCHOOSEで選び各ownerのtrashを全戻しできるが、liveはself固定で相手trashに到達しない。 | `execChoose`→`execTransferToDeck` | spell/arts使用者が対象playerを選ぶという暗黙owner切替はない。 | あなたか対戦相手のトラッシュにあるすべてのカード |
| S039 | WX11-002-E3 | AUTO | 真バグ | `TRANSFER_TO_DECK.shuffle:true`なら移動後にowner側deckをshuffleするが、liveは明示的にfalseで順序が保存される。 | `execTransferToDeck`→deck shuffle branch | source.owner opponentからshuffleを自動推論せず、boolean宣言が実動作を決める。 | 対戦相手は自分のデッキをシャッフルする |
| S040 | WXDi-P09-002-E1 | AUTO | 真バグ＋機構待ち | count:'ALL'経路は候補配列順のまま即時top挿入し、`opponentSelects`も単数選択時しかUIへ渡らないため相手が順番を決められない。 | `execTransferToDeck:5318-5331`→`applyToBottom` | `opponentSelects`は「どの札」を選ぶfieldで、ALL集合の並べ替え回答者・順序UIを表さない。 | 置く順番は対戦相手が決める |
| S041 | WX05-023-BURST | AUTO | 真バグ | 原子SIGNI回収1枚だけで、同一解決にTRASH_CARD cardTypeスペル1枚を手札へ移すactionがない。 | `execTransferToHand`／`SEQUENCE` | filterをシグニからカードへ広げるだけでは「各1枚」のquotaにならない。 | トラッシュからスペル１枚と＜原子＞のシグニ１枚 |
| S042 | WXDi-P03-071-BURST | AUTO | 真バグ | `CHOOSE`はDOWN＋相手discardのSEQUENCEとDRAW2を排他的選択にできるが、liveはdiscard1だけへ全体が退化している。 | `execChoose`→`execDown`/`execTrash`/`execDraw` | mandatory:falseは効果全体の任意性で、2つの選択肢やDOWN/DRAWを補わない。 | どちらか１つを選ぶ |
| S043 | WXDi-CP02-034-E1 | AUTO | 真バグ | optional no-cost ON_PLAYは`mandatory:false`をcollectorが任意スタック化できるが、liveはtrueなので手札2枚discardを拒否できない。 | `isOptionalNoCostOnPlayForGrow`／`wrapOptionalOnPlay` | blind:trueは非公開選択の指定であり、能力を発動しない選択肢ではない。 | 発動しないことを選んでもよい |

## 3. 所見

### REVEAL_AND_PICK / SEARCH

- S001は`split_top_bottom`、S002は`GAIN_BOND:last_found`という既存機構へのproducer欠落で、どちらもparser修正だけで進む。
- S003/S004は同じCX機構の組。`isDeckPlacementFromSearch`が直接TRANSFERと全choice配置CHOOSEの双方を再帰認識するため、2件とも偽陽性だった。

### SEND_TO_ENERGY / ADD_TO_FIELD

- S005は発火元実効powerを`triggerFilter`で絞る既存配線、S006は直前配置instanceへの`targetsLastProcessed`、S007は固定powerRangeの欠落。3件とも新機構不要。

### BANISH / cardName / 動的power

- S008/S009/S031は同じ「カード名部分一致」組で、`cardName` consumerが`includes`を使うことを確認した。
- S010/S019/S026は同じ「直前処理・配置SIGNIの実効power以下」組で、既存`powerLteLastProcessed` familyに乗る。第8/9バッチ§4の動的power familyに見えたが、この3件が要求するproducer/consumerは既に実装済みなので機構待ちへ重複登録しない。

### 「代わりに」分岐

- S011（覚醒時5000→13000）、S012（天使3体でDRAW1→2）、S013（power15000でEC1→2）、S021（手札5枚で+3000→+5000）、S023（trash15枚で-10000→-12000）、S034（discard3枚以上でpower制限付き→無し）は同じ`CONDITIONAL + else` family。依頼本文が「4件」とした狭義の組に加え、同じ壊れ方のS021/S023を含めると6 findingsである。
- 全件で現状は通常効果と置換後効果をSEQUENCEとして足しており、条件欠落だけでなく排他性と一部の対象同一性が壊れている。
- S016/S017も「代わりに」だが、これは条件分岐ではなくlife-burst後のzone placement置換。`DAMAGE_REPLACE_BY_COST`とは別で、既存turn flagも寿命・主体が合わないため機構待ち。

### 条件・能力分離

- S014/S030/S033はlastProcessedを読む既存Condition、S024はLRIG色＋中央zoneのAND、S027はトラップ能力の独立effect化で直せる。
- S018/S022/S023は事前対象または直前対象のidentity保持を必要とするが、`STORE_LAST_PROCESSED_TARGETS`、`targetsStored`、`targetsLastProcessed`が既に揃っている。

### action丸ごと欠落 / プレイヤー選択

- S028/S035/S041/S042は既存actionを追加・CHOOSE化すればよい。
- S032/S038は同じplayer-owner選択組で、self/opponentの2 branchをCHOOSEにする既存構造で表現可能。
- S029は名称別energy支払groupを一般effect costへ配線する必要があり、型宣言だけ存在する機構待ち。

### LRIG attack / under / deck order

- S036はassist LRIG attack実装後に露出したcenter-slot限定の穴で、新しいtrigger slot gateが必要。
- S037は`TAKE_FROM_UNDER_SIGNI.filter`をexecutorが実消費済みなのでproducerだけの修正。
- S039はshuffle boolean欠落。S040はALL集合を相手回答で並べ替えるUI/continuationがないため機構待ち。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足している語彙・機構・配線 |
|---|---|
| life-crash札のone-shot配置置換＋成立ゲート / S016,S017 | `execLifeCrash`がcheckへ置いたinstanceをreplacement予約へ載せ、life-burst完了時に「energyへ置かれる場合だけtrashへ」を1回適用し、その成立結果を元のSEQUENCE continuationへ返して`ADD_TO_LIFE`をゲートする配線。既存`CRASH_TO_TRASH_INSTEAD`はturn中の相手attack crash用、PLAN §6.4 `O-37(a)`はdamage置換で別物。第8〜第23バッチ§4に同一登録なし。 |
| 名称別energy支払groupの一般effect cost配線 / S029 | `EffectCost.energyTrashGroups`を`canPayEffectCost`、pay確定、起動/ON_PLAY任意コストUIへ通し、各group exact1を別々に満たす。型とResona summon consumerだけ在る。第20バッチ§4 S014「3zone同名exact quota」とquota UI基盤は共有可能だが、今回は単一energy zoneの通常能力costなので同一登録ではない。 |
| event主体の追加メタデータ / S036,S040 | S036は`performLrigAttack(slot)`から`collectAllyLrigAttackTriggers`へcenter/assist slotを渡し、center限定triggerを評価する語彙。S040は`TRANSFER_TO_DECK count:'ALL'`で順序回答者をopponentにし、並べ替えUIから選択順をtopへ適用する配線。両者はevent metadataという実装層だけ共通でconsumerは別。第8〜第23バッチ§4に同一登録なし。 |

## 5. 偽陽性の件数についての自己評価

偽陽性は **2/43＝4.7%**。2件ともメモCXが予測したSEARCH順序で、予測は完全に当たった。表面JSONではthen配置→afterSearch shuffleに見えるが、`isDeckPlacementFromSearch`と`resumeSearch`の予約実行を開くと、直接top配置のS003だけでなく、top/secondのCHOOSEを持つS004もshuffle先行・instance固定になっていた。それ以外に偽陽性は見つからず、混成単発群としては低率だが、2件を真バグへ誤計上しなかったことがこのバッチの主要な精度担保である。

## 6. 条件以外で見つけた原文との食い違い

5 effect・7項目。

- S006 `WX24-P3-086-E1`: findingの対象同一性に加え、live parseStatusは入力見出しの主張と異なりAUTOである（分類表はliveを採用）。
- S021 `WXDi-P09-074-E1`: +5000側がowner:anyで相手も選べ、両power actionとも同じ事前対象を保持しない。
- S023 `WX25-P3-105-E1`: -12000側がowner:anyで自分SIGNIも選べ、通常値と置換値の対象同一性もない。
- S024 `WX06-022-E1`: condition欠落に加え、POWER_SET/GRANT_PROTECTIONのtargetに`thisCardOnly:true`がなく、同じ自分SIGNIを指す保証がない。
- S036 `WX19-031-E1`: optional self-trash成功後のUPが`IS_MY_TURN`で代用され、did-it gateと攻撃したLRIG instance固定がない。別の自LRIGを選び得る。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測）:

- typecheck PASS
- golden **2337 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / baseline 773**
- census:stubs 無言no-op **0**（A群🔴0 / C群0）
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業開始前からのM 2本（`scripts/archive/semanticAuditLedger.mjs`、`scripts/archive/semanticAuditMkBatchSingles.mjs`）と、既存の第8〜23バッチ成果物、入力`stage1_batch24.txt`／索引、今回の`stage1_batch24_triage.md`。今回新たに変更したtracked fileは0、作成したのは本報告書1本だけ。

`git diff --stat`は既存の計器2本だけで **2 files changed, 27 insertions(+), 6 deletions(-)**。本作業では両計器に触れていない。

分類表は **43行 / 根拠43種類（unique 43、100%）**。UTF-8の先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **38,622 bytes**。

## 8. ガードレール2・3・4・7で当初の見立てから変えた件

- S002: `HAS_BOND`しかない可能性から機構待ちを疑ったが、隣接action `GAIN_BOND{source:'last_found'}`と`execGainBond`を確認し、parser修正だけの真バグへ変更。
- S003/S004: 表面順では真バグだったが、CXの`isDeckPlacementFromSearch`再帰とshuffle先行branchを開き、2件とも偽陽性へ変更。
- S008/S009/S031: `cardName`完全一致なら別語彙待ちと見たが、consumerが`CardName.includes`を使うため既存機構で直せる真バグへ変更。
- S010/S019/S026: 動的power familyの新規producer待ち候補から、`powerLteLastProcessed`を実際にBANISH前で解決するconsumer確認により機構待ちを外した。
- S011/S012/S013/S021/S023/S034: did-itアンラップ近傍を開き、`else`付きCONDITIONALはアンラップ対象外かつ`execConditional`が排他的に実行するため、新機構ではなくproducer構造の真バグへ変更。
- S014/S030: 隣接Conditionに`LAST_PROCESSED_MATCHES`／`LAST_PROCESSED_POWER_GTE`があり、直前札属性の条件化が可能と分かったため機構待ちを外した。
- S016/S017: `CRASH_TO_TRASH_INSTEAD`を使える候補だったが、consumerは相手attack crashのturn flagで、自己crash1枚のplacement成立ゲートを返せないため機構待ちを維持。
- S018/S022/S023: 対象identityの新規配線候補から、各actionの隣接field `targetsStored`/`targetsLastProcessed`とconsumerを確認しproducer修正へ変更。
- S029: `energyTrashGroups`の型宣言だけなら既存扱いだったが、全参照を追うと一般effect cost consumerがなくResona summonだけだったため機構待ちへ変更。
- S036: ON_ATTACK_LRIGをcenter専用とみなす候補を外した。assist attackが実装済みでcollectorも同eventを受け、slot filterが無いため真バグ＋機構待ち。
- S037: `TakeFromUnderSigniAction.filter`の型だけで止めずexecutorがunder候補へ適用する行を確認し、parser修正だけの真バグへ変更。
- S040: `opponentSelects`で直る候補を外した。ALL経路は即時処理で選択UIを通らず、既存fieldは対象選択者であって順序回答者ではない。

## 9. 段1 完走の総括

### 9.1 軸ごとの機構充足度

第1〜7バッチはクラスタ軸、第8〜24バッチは単発軸で粒度が異なるため、率はfinding票から再集計した実測（同じ機構待ちは各findingに計上）。第8〜23の既報557件に今回43件を加えた単発段600件では、今回追加後の代表軸は以下となる。

| 軸 | findings | 機構待ち | 機構待ち率 | 段2の先行層 |
|---|---:|---:|---:|---|
| cost | 21 | 14 | 66.7% | engine実装が先 |
| timing/trigger | 40 | 25 | 62.5% | engine実装が先 |
| filter.level | 37 | 17 | 45.9% | engine実装が先（動的参照） |
| condition | 36 | 17 | 47.2% | engine実装が先（台帳・複数zone） |
| count/upTo | 46 | 18 | 39.1% | engine実装が先（quota/動的count） |
| 特殊機構 | 33 | 13 | 39.4% | engine実装が先 |
| (未分類) | 101 | 36 | 35.6% | 混成、consumer再確認必須 |
| filter.状態 | 20 | 5 | 25.0% | parser修正中心 |
| filter.story | 89 | 22 | 24.7% | parser修正中心、一部動的集合 |
| キーワード能力 | 58 | 13 | 22.4% | parser修正中心、coverage基盤は別 |
| filter.color | 32 | 6 | 18.8% | parser修正中心 |
| filter.cardName | 13 | 0 | 0.0% | parser修正だけで進む |
| action丸ごと欠落 | 11 | 0 | 0.0% | parser/manual修正だけで進む |
| filter.power | 13 | 2 | 15.4% | 固定値はparser、動的値はengine |
| 順序/構造 | 14 | 2 | 14.3% | parser中心、zone置換のみengine |
| filter.hasIcon | 3 | 0 | 0.0% | parser修正だけで進む |
| プレイヤー選択 | 5 | 0 | 0.0% | CHOOSE化中心 |
| owner/主語 | 5 | 0 | 0.0% | parser修正だけで進む |
| アタック状態 | 4 | 1 | 25.0% | center slotだけengine |
| 能力種別(常/自/起) | 4 | 0 | 0.0% | effect分割/parser修正 |

二分すると、**parser修正だけで進む軸**は固定cardName/story/color/state/icon/power、action欠落、owner、プレイヤー選択、能力分離、通常の順序/分岐である。**engine実装が先の軸**はcost、timing/trigger、複数zone・履歴Condition、動的level/power/count、quota付きLOOK/SEARCH、期間・置換、召喚keywordである。filter.powerは固定閾値と動的参照を分けないと率が意味を失う。

### 9.2 段2の実装バッチ候補

以下は第8〜24バッチ§4を機構単位に束ね直したもの。影響数は§4で明示されたfindingの既知最小数で、過去の「同一機構」参照を重複加算していない。

| 実装単位 | 影響finding数 | 主な配線先 | 依存 |
|---|---:|---|---|
| 動的power閾値 family（zone count×係数、source/trigger/lastProcessed eq・half・lte） | 13+ | `resolveDynamicFilter`→`execBanish`/`execBounce` | `lastProcessedCards`/effectivePowers |
| 動的level閾値・level/count producer family | 11+ | `resolveDynamicFilter`/`resolveCountRef`→各target executor | 実効level計算 |
| instance保持の共通基盤（事前対象・配置結果・cost札→後段action） | 12+ | `storedTargetCards`、`lastProcessedCards`、`execAddToField`、`execPlayFree`、delayed trigger | pause/continuationを跨ぐcontext |
| LOOK/SEARCH exact partition・quota UI | 12+ | `resumeSearch`、`resumeLookAndReorder`、`EffectInteractionModal` | selection constraint基盤 |
| cause/provenance付きevent台帳 | 16+ | 全zone移動funnel→`triggerCollect`各collector | event payload正準化 |
| turn履歴・owner別count台帳 | 10+ | BANISH/BOUNCE/discard/play funnel→`evalCondition` | cause台帳と共有可 |
| 複数zone/集合Condition | 15+ | `evalCondition`、`checkActiveCondition` | zone query共通helper |
| SelectionConstraint総和・同値・distinct | 10+ | `satisfiesSelectionConstraint`＋各選択UI | effective power/level/cost view |
| EffectCost複合group・可変cost | 13+ | `canPayEffectCost`、pay solver、起動UI | 今回S029の`energyTrashGroups`を含む |
| 【ライズ】coverage | 10 | Signi play gate、Rise payment plan、stack merge | SelectionConstraint、複数zone cost |
| 【ライド】coverage | 4 | keyword producer→`RIDE_ON`→ride state/attack gate | 召喚後ACTIVATED注入 |
| 【ハーモニー】coverage | 2 | summon confirm→Harmony resolver→LRIG DOWN | 召喚UI |
| キーワード能力coverage（Lancer/Assassin/guard restriction等） | 10+ | keyword scope、battle/guard gates | effective power/source metadata |
| LRIG付与先instance・assist対象化 | 6+ | `execGrantEffect`/`GRANT_LRIG_ABILITY`→実行context | LRIG slot identity |
| attack/life damage protection・置換 | 7+ | damage funnel、life-burst placement、expiry clear | source metadata、attack instance |
| BLOCK_ACTION動的guard/phase/board condition | 8+ | guard UI、attack/grow/draw gates | dynamic filter/turn owner |
| field/under/attachment集計 | 10+ | `matchesStateFilter`、`evalCondition`、`resolveCountRef` | stack/attachment統一query |
| zone移動actionの不足consumer（optional/all/blind/energy exile） | 10+ | `execTrash`/`execTransferToDeck`/`execTransferToHand`/`execExile` | 選択UI |
| phase限定duration・modifier lifetime | 5+ | phase transition、`clearTurnEndScopedState`、各collector | phase-scoped state |
| LRIG/signi attack event metadata | 6+ | `performLrigAttack`、attack collectors、guard/end collectors | slot/source/guard result payload |
| protection/ability-lossのsource・zone拡張 | 8+ | immunity collectors、全zone ability consumers | unified source card view |

### 9.3 段2で最初に取るべき1本

最初は **instance保持の共通基盤**を取るべきである。理由は、既存の`lastProcessedCards`/`storedTargetCards`が既に多くのactionで動いており、ゼロからの新機構ではない一方、SEARCH→ADD_TO_FIELD、任意cost、delayed trigger、PLAY_FREE、attachmentという複数familyの12件以上を解放できるため。ここを先に正準化すると、その後の動的filterとLOOK partitionが同じ「どのinstanceを参照するか」を再実装せずに済む。次点は動的power/level family。

### 9.4 triage判定を段2で信用してよい範囲

- **高信頼**: 固定filter欠落、固定owner/count/duration、action丸ごと欠落、既存consumerを型だけでなく実行行まで確認した真バグ、CX等の専用慣例を実コードで確認した偽陽性。
- **実装前に再確認**: 機構待ち全件。段1後半だけでも第23バッチS013のように、過去登録後に別作業でconsumerが実装済みになった例がある。
- **再確認必須**: parseStatusがlive/見出しで食い違った行、PARTIAL/MANUAL同期対象、複数findingが同一effectIdを共有する行、根拠が単一collectorの現在行に依存する判定。
- **特に慎重**: event cause/owner/slot、期間、置換、対象identity、LOOK/SEARCH UI。JSON表面と実行順が異なる慣例が最も多かった。
- 今回は要追調査0だが、段1全体の過去報告に要追調査が残っていれば、実装batchへ混ぜず先に再triageする。

### 9.5 parserの系統的な壊れ方 上位5

1. **「場合／そうした場合／代わりに」の平坦化**: 条件・did-it・elseを落とし、通常actionと強化版actionをSEQUENCEで両方実行する。条件句regexと置換fixupを共通化すれば多数を直せる。
2. **修飾句の誤付着**: source/trigger/直前札のpower・level・color・名称条件を、効果対象自身のfilterへ付けるか完全に落とす。動的参照語の主語解析を一段に集約すべき。
3. **「それ／そのシグニ／この方法で」のidentity喪失**: 後段actionがowner:anyの再選択になり、事前対象・配置札・支払札との同一性を失う。stored/lastProcessed fieldを生成する共通fixupが効く。
4. **列挙・各N枚のquota崩壊**: 「A1枚とB1枚」を単一filter/countへ潰すか片方を落とす。SEARCH、trash回収、costのgroup producerを共通化できる。
5. **能力境界・rule keywordの連結/消失**: 【出】とトラップ、付与された引用能力、ライズ/ライド/ハーモニーを同じeffectへ連結するかprefix strippingで消す。能力prefix tokenizerで境界を先に確定するのが有効。
