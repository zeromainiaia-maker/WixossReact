# 意味照合監査 clean群 round1 段1 第11バッチ triage（軸「count/upTo」）

## 1. サマリ

分類は finding 単位（46 findings / 43 effectId）。`真バグ＋機構待ち` は双方へ計上する。

| action型 | 件数 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| ADD_TO_FIELD | 1 | 1 | 0 | 0 | 0 |
| BANISH | 4 | 4 | 0 | 3 | 0 |
| BLOCK_ACTION | 1 | 1 | 0 | 0 | 0 |
| CHOOSE系 | 6 | 5 | 1 | 2 | 0 |
| CONDITIONAL | 2 | 2 | 0 | 0 | 0 |
| DOWN / DRAW / ENERGY_CHARGE_FROM_DECK | 3 | 3 | 0 | 2 | 0 |
| GRANT_KEYWORD / LIFE_CRASH | 2 | 2 | 0 | 2 | 0 |
| LOOK_AND_REORDER | 3 | 3 | 0 | 3 | 0 |
| LOOK_PICK_CHAIN | 5 | 0 | 5 | 0 | 0 |
| SEARCH | 3 | 0 | 3 | 0 | 0 |
| SEND_TO_ENERGY | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE系 | 12 | 10 | 2 | 4 | 0 |
| TRANSFER_TO_DECK | 3 | 3 | 0 | 1 | 0 |
| **計** | **46** | **35** | **11** | **18** | **0** |

### 「枚数がおかしい」原因の内訳

排他的な主因で数えた。偽陽性は4原因へ押し込まず別枠とした。

| 主因 | 件数 |
|---|---:|
| ① parserが数量詞・条件・固定枚数を落とした | 17 |
| ② `$ref`は載るが当該executorが`resolveNum`で読まない | 0 |
| ③ `countFromZone`相当の盤面・ゾーン計数が必要 | 3 |
| ④語彙・選択機構・動的filterが無い | 15 |
| 慣例executorが既に「0〜上限」を実装（偽陽性） | 11 |
| **計** | **46** |

②が0なのは見落としではない。liveで実際に`$ref`を持つS043後段BANISHは`execBanish`が`resolveCountRef`を呼ぶ。逆に`resolveNum`側のS019/S020/S038/S044/S046はliveに`$ref`が載っておらず、必要なのは新語彙・別機構である。

## 2. finding 全46件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WDK03-001-E1 | AUTO | 真バグ | live `ADD_TO_FIELD{owner:self}`はsourceもcardNameも無く、ルリグデッキの《異体同心 華代》1枚に候補を限定できない。 | `execAddToField`（source/cardNameを読む） | token用cardName枝はsource無しでも動くが、実在ルリグデッキからの移動ではない。 | ルリグデッキから《異体同心　華代》１枚 |
| S002 | WX13-030-BURST | AUTO | 真バグ＋機構待ち | liveはpower無制限の相手SIGNI count1。必要なのは複数候補集合のpower総和10000以下で、`SelectionConstraint`に総和種別がない。 | 無し＝機構待ち（`satisfiesSelectionConstraint`へpowerSum上限） | 個体ごとの`powerRange.max`では2体以上の合計を拘束できない。 | パワー合計が10000以下になるように好きな数 |
| S003 | WXDi-P10-043-E1 | AUTO | 真バグ＋機構待ち | BANISH対象filterにsourceのunder枚数以下という動的level上限が無く、現状は全levelが候補になる。 | 無し＝機構待ち（`resolveDynamicFilter`へsource-under count→level.max） | `levelLteHandDiff`は手札差、第8バッチS009の盤面枚数level上限ファミリへ統合。 | レベルがこのシグニの下にあるカードの枚数以下 |
| S004 | WXK09-030-E1 | AUTO | 真バグ | 無条件BANISHだが既存`HAND_DIFF{gte,4}`はself−opponentの符号付き差をそのまま評価できる。 | `evalCondition(HAND_DIFF)`→`execBanish` | `HAND_COUNT`単独閾値や値無し`HAND_COMPARE_OPP`では4枚差を表さない。 | 手札が対戦相手より４枚以上多い |
| S005 | WX12-019-E2 | AUTO | 真バグ＋機構待ち | target power上限が丸ごと無く、trash内フレイスロ名カード数×2000を候補ごとに解決するfilter語彙もない。 | 無し＝機構待ち（`resolveDynamicFilter`→`execBanish`） | 第7バッチWX11-041/WX17-Re02および第8バッチS005の動的power上限と同一機構。 | 枚数×2000以下 |
| S006 | WXK05-047-E1 | AUTO | 真バグ | liveの永久ATTACK禁止に適用条件がなく、キー2枚以上でも禁止し続ける。既存の場カード枚数条件をactiveConditionに置ける。 | `checkActiveCondition(HAS_CARD_IN_FIELD)`→BLOCK_ACTION収集 | `until:PERMANENT`は再評価期間であり「2枚未満」を補わない。 | キーが２枚以上ないかぎり |
| S007 | SPDi43-24-E1 | AUTO | 真バグ | choice②TRASHはcount1固定だが、直前DOWN結果と同数が必要。HAND_CARD TRASHは`resolveCountRef`を呼ぶため`last_processed_count`を消費可能。 | `execTrash`は`resolveCountRef`を呼ぶ | field総数を数える`DRAW_PER_FIELD_COUNT`は捨て枚数を救わない。 | １体につき対戦相手は手札を１枚捨てる |
| S008 | SPDi43-24-E1 | AUTO | 真バグ | choice①は自場全SIGNIを数え、直前に実際にDOWNした0〜2体を数えない。通常DRAWならcount refを既存consumerへ渡せる。 | `execDraw`は`resolveCountRef`を呼ぶ | `DRAW_PER_FIELD_COUNT`のstate filterをisDownにしても以前からdownの体まで数える。 | この方法でダウンしたシグニ１体につき |
| S009 | WXEX1-22-E1 | AUTO | 真バグ＋機構待ち | `choose_count:1`固定で、相手fieldのattached charm枚数に応じた0〜3選択を表す動的choose上限がない。 | 無し＝機構待ち（`execChoose`へ動的chooseCount配線） | `countFromZone`はtop cardを数え、SIGNIに付いたcharm集合を数えない。 | 【チャーム】１枚につき１つまで |
| S010 | WX24-P4-053-E1 | AUTO | 真バグ | 3 choicesにconditionが一つも無い。既存の手札/エナ直接比較conditionでlt/gt/eqを各枝へ付けられる。 | `execChoose`→`evalCondition(HAND_COMPARE_OPP/ENERGY_COMPARE_OPP相当)` | `choose_count:1`は選択数だけで、choice availabilityを盤面比較しない。 | 手札の枚数がエナより少ない場合 |
| S011 | WD22-011-G-E1 | AUTO | 真バグ＋機構待ち | choice③の対象levelがself hand枚数以下というfilterが欠落し、既存`levelLteHandDiff`は相手との差で基準が別。 | 無し＝機構待ち（`resolveDynamicFilter`へlevelLteSelfHandCount） | 第8バッチS009・第9バッチS038の動的level上限ファミリと同一。 | レベルがあなたの手札の枚数以下 |
| S012 | WXK04-041-E1 | AUTO | 偽陽性 | SEARCH②は`maxCount:3`で、選んだ各picked cardへthenを個別適用するため`ENERGY_CHARGE target.count:1`は合計1枚制限ではない。 | `execSearch`→`resumeSearch`（maxPick 0〜3、picked個別then） | 後段count1を全体上限と読む見立てを、SEARCH再開慣例の実コードで撤回。 | ３枚まで探して |
| S013 | WXDi-P12-073-E2 | AUTO | 真バグ | thenが対象相手SIGNIへの+4000だけで、FREEZEが無い上にpower主語も原文のsource selfから相手へ反転している。 | `execSequence`→`execFreeze`／`execPowerModify` | CONDITIONALはthen内に未記載actionを補完しない。 | それを凍結し |
| S014 | WX20-065-E1 | AUTO | 真バグ | liveはCMR存在を外側に置き、hand>1でも2ドローする。外側HAND_COUNT lte1の内側でCMR有無を分岐すべき。 | `evalCondition(HAND_COUNT/TRASH_HAS_CARD)` | else連鎖は優先順位を表すだけで、外側条件を後段へ暗黙継承しない。 | 手札が１枚以下の場合 |
| S015 | WXDi-P16-046-E2 | AUTO | 真バグ | discard cost後のDOWNにself life < opponent life条件が無い。既存`LIFE_COMPARE_OPP{lt}`で向きも一致する。 | `evalCondition(LIFE_COMPARE_OPP)`→`execDown` | `mandatory:false`はコストを払わない選択で、支払後のlife比較ではない。 | ライフクロスの枚数が対戦相手より少ない場合 |
| S016 | PR-442-BURST | AUTO | 真バグ＋機構待ち | DRAW count1固定。必要なfloor(self deck count/10)は9語彙のrefにも`CountFromZone`のzone/perにも存在しない。 | 無し＝機構待ち（deck count除算→`execDraw`の`resolveCountRef`） | `countFromZone`はdeckを列挙せず、`per`も除数でなく乗数。 | デッキの枚数１０枚につきカードを１枚引く |
| S017 | WXEX2-46-E1 | AUTO | 真バグ＋機構待ち | EC1固定で、自分SIGNIに付いたACCを数える経路が無い。`execEnergyChargeFromDeck`自体はref対応だが参照値が不足。 | `execEnergyChargeFromDeck`は`resolveCountRef`を呼ぶ／参照producer無し | field `countFromZone`はトップSIGNIを列挙しattached acceを数えない。 | あなたの【アクセ】１枚につき |
| S018 | WX16-022-E1 | AUTO | 真バグ＋機構待ち | liveは任意owner SIGNI1体へkeyword文字列を付けるだけで、energyのアクセアイコン札を複数選び各SIGNIへattachする移動がない。 | 無し＝機構待ち（energy source複数選択→acce attachment配線） | `execGrantKeyword`のsource自動枝はカード移動も1host1枚制約も実行しない。 | エナゾーンから対象の好きな枚数 |
| S019 | WX20-032-E1 | AUTO | 真バグ＋機構待ち | CONTINUOUSなのに`execLifeCrash`を実行して自lifeを1枚失わせる。必要なのはturn単位の受傷上限である。 | 無し＝機構待ち（life crash適用点へper-turn cap） | `execLifeCrash`は`resolveNum(count)`であり制限宣言として収集されない。 | １ターンに１枚までしかクラッシュされない |
| S020 | WD06-007-E1 | AUTO | 真バグ＋機構待ち | `execLookAndReorder`は`resolveNum(count:4)`枚を必ず切り出し、0〜4枚を選ぶupTo入口が型にもexecutorにも無い。 | 無し＝機構待ち（LOOK source枚数選択→`execLookAndReorder`） | deck不足時のminは存在するが、lifeが4枚ある盤面で任意に少なく見ることはできない。 | カードを４枚まで見て |
| S021 | WXDi-P10-007-E3 | AUTO | 真バグ＋機構待ち | liveは上10枚をdeck topへ戻すだけで、spell最大2・cost総和4・check zone・順次無償使用の全工程が欠落。 | 無し＝機構待ち（総cost制約付きpick→check-zone spell use） | LOOKの`canTrash`/reorderはcheck zoneや無償使用を内包しない。 | スペルを２枚までチェックゾーンに置き |
| S022 | SPK01-08-E1 | AUTO | 真バグ＋機構待ち | `canTrash:true`は任意枚数trashを許し、正確に3枚bottom＋残り1枚trashというpartitionを拘束しない。 | 無し＝機構待ち（LOOK partitionのexact destination quota） | reorder先bottom指定だけではbottom枚数3を固定しない。 | その中から３枚を |
| S023 | WX25-P1-091-E1 | AUTO | 偽陽性 | 第1stage `pickCount:1`はSEARCH interactionの`maxPick:1`になり、0枚決定が可能。 | `execLookPickChain`→SEARCH `maxPick` consumer | stage専用upTo fieldは不要というLOOK_PICK_CHAIN慣例を確認。 | カードを１枚までエナゾーンに置き |
| S024 | WX25-P1-091-E1 | AUTO | 偽陽性 | 第2stageも独立したSEARCH `maxPick:1`で0選択でき、第1stageの選択有無に拘束されない。 | `execLookPickChain`（`stages.slice(1)`再入） | 1段しかないという誤読は不成立で、liveにはenergy/trashの2 stageがある。 | カードを１枚までトラッシュに置き |
| S025 | WXDi-P11-030-E1 | AUTO | 偽陽性 | field stageのpickCount2は空きzoneでcapされた後`maxPick`として提示され、0〜2枚を選べる。 | `execLookPickChain`→EffectInteractionModal SEARCH | `pickCount`はexact countでなくUI上限。 | シグニを２枚まで場に出し |
| S026 | WXK01-057-E1 | AUTO | 偽陽性 | pickCount3はSEARCH上限で、選ばなかった公開札はremainder trashへ送られる。 | `execLookPickChain`→`lookPickThenAction`→remainder | mandatory effectでもSEARCH選択枚数は0〜maxであり3枚強制ではない。 | シグニを３枚まで場に出し |
| S027 | WXDi-P00-010-E1 | AUTO | 偽陽性 | 赤・青・緑の3 stagesが各`maxPick:1`として順次再入し、それぞれ0または1枚を選べる。 | `execLookPickChain`（3段のSEARCH interaction） | 合計1枚ではなく色ごとに独立上限を持つlive構造を確認。 | それぞれ１枚まで |
| S028 | WX11-047-E1 | AUTO | 偽陽性 | SEARCH maxCount5は0〜5枚の選択上限で、then target count1はpicked各札をenergyへ移す単位action。 | `execSearch`→`resumeSearch` | `ENERGY_CHARGE{DECK_CARD,count:1}`を全体1枚固定と読むのはSEARCH個別then慣例と衝突。 | カードを５枚まで |
| S029 | WXEX1-17-E2 | AUTO | 偽陽性 | アクセicon SIGNI filter付きSEARCH maxCount2が0〜2枚を取り、各picked cardへenergy thenを反復する。 | `execSearch`→`resumeSearch` | afterSearch shuffleは選択終了後で、1枚目だけで打ち切らない。 | シグニを２枚まで |
| S030 | WD07-006-E1 | AUTO | 偽陽性 | maxCount3とdistinct level制約がSEARCH UIを拘束し、picked各札へTRASH count1を適用する。 | `execSearch`／`satisfiesSelectionConstraint`／`resumeSearch` | 第9バッチS032と同じpicked個別then慣例で、3枚を1枚へ縮めない。 | シグニを３枚まで探してトラッシュ |
| S031 | WXEX1-44-E1 | AUTO | 真バグ＋機構待ち | SEND_TO_ENERGY targetにlevel上限がなく、自分fieldのattached ACC枚数を候補filterへ解決する語彙もない。 | 無し＝機構待ち（acce count→dynamic level.max→`execSendToEnergy`） | 第8バッチS009の動的level上限ファミリだが、producerはfield top枚数でなくattached ACC。 | 【アクセ】の枚数以下のレベル |
| S032 | WX05-010-E1 | AUTO | 真バグ＋機構待ち | liveはlife全枚を並べ替えるだけで、好きな枚数をtrashへ移すactionが無い。LOOK_AND_REORDERはlife sourceのcanTrashも実装していない。 | 無し＝機構待ち（life cloth任意部分集合→trash＋残りreorder） | count:'ALL'は閲覧範囲でありtrash選択を生まない。 | 好きな枚数をトラッシュに置き |
| S033 | WX24-P3-033-E1 | AUTO | 偽陽性 | magic_box stageのpickCount1はSEARCH maxPick1なので0枚設置を選べ、次stageへ継続する。 | `execLookPickChain`→SEARCH `maxPick` | mandatory:falseだけに頼らずstage自身が0選択可能と確認。 | カードを１枚まで |
| S034 | WX22-024-E2 | AUTO | 真バグ | 前段BANISH結果はlastProcessedCardsに残り、ADD_TO_FIELD source countは`resolveCountRef`対応なのにlive count1固定。 | `execBanish`→`execAddToField`は`resolveCountRef`を呼ぶ | `$ref:last_processed_count`を載せれば既存consumerに届くため機構待ちではない。 | 同じ数だけ |
| S035 | WX10-034-E1 | AUTO | 真バグ | BANISHは0〜2体を記録するが後段energy→handがcount1固定。TRANSFER_TO_HANDのenergy sourceはref解決経路を持つ。 | `execBanish`→`execTransferToHand`は`resolveCountRef`を呼ぶ | optional/upToは前段だけで、後段固定1を自動補正しない。 | 同じ数だけエナゾーンから |
| S036 | WXDi-P09-072-E1 | AUTO | 真バグ | DRAWがSEQUENCE直下で無条件実行され、life4 exact条件が無い。 | `evalCondition(LIFE_COUNT eq4)`→`execDraw` | 先行life5 conditionのelseではなく独立した「4枚の場合」である。 | ４枚の場合、カードを１枚引く |
| S037 | WXDi-P04-004-E1 | AUTO | 真バグ＋機構待ち | CHOOSE choose_count1固定。self trash枚数/10個を選択数へ変えるfieldがなく、同じchoiceを複数選べるかの意味も必要。 | 無し＝機構待ち（trash count floor/10→`execChoose`） | `countFromZone`はCHOOSEに無く、カード処理枚数用refをchoice数へ類推しない。 | カード１０枚につき１つ |
| S038 | WXDi-P11-077-E1 | AUTO | 真バグ＋機構待ち | TAKE_FROM_UNDER_SIGNIはupToCount対応でも上限9固定で、host underが10枚以上なら原文の全枚選択域を失う。 | `execTakeFromUnderSigni`は`resolveNum`を呼ぶ／ALL-upTo無し | 9を無限sentinelとする分岐はexecutorに存在しない。後段MILLのcountPerLastProcessedは正しい。 | カードを好きな枚数 |
| S039 | WXDi-P01-026-E1 | AUTO | 偽陽性 | pickCount:'ALL'は候補数をSEARCH `maxPick`へ変換するだけで全選択を強制せず、両playerの各stageで0〜全候補を選べる。 | `execLookPickChain`→SEARCH interaction | `ALL`はここでは上限算出用。TRANSFER等のALL即時全移動とaction固有意味が異なる。 | 好きな枚数のシグニを場に出し |
| S040 | WDK14-009-E1 | AUTO | 真バグ | 条件thenのADD_TO_FIELDにtrash source・SIGNI filter・count1が全部無く、空actionから追加1枚を導けない。 | `execAddToField` | 直前ADD_TO_FIELDのsourceは別actionへ継承されない。 | 追加でシグニ１枚を対象とし |
| S041 | WD10-007-E1 | AUTO | 真バグ | HAND_CARD TRASH count2にupTo/optionalがなく2枚を強制する。executorはtarget upToCountでなくaction optionalを選択flagに使う。 | `execTrash`は`resolveCountRef`を呼ぶがoptional flag無し | count2を上限として扱うLOOK/SEARCH慣例はTRASHには無い。 | ２枚まで捨てる |
| S042 | WD10-007-E1 | AUTO | 真バグ | 後段BANISH count1固定。前段TRASHがlastProcessedCardsを残しBANISHは`resolveCountRef`を読むため既存refで直せる。 | `execTrash`→`execBanish`は`resolveCountRef`を呼ぶ | S041のupTo欠落を直した後の実選択数をrefで受ける必要がある。 | 捨てたシグニの枚数と同じ数 |
| S043 | WDK15-008-E1 | AUTO | 真バグ＋機構待ち | 前段はunder cardでなくself SIGNI本体1体をtrashする。後段の`last_processed_count`自体はBANISH consumerに正しく届く。 | 前段無し＝機構待ち（複数host下から合計2選択）；後段`execBanish`は`resolveCountRef`を呼ぶ | `$ref`を問題視する見立てを撤回し、欠陥をunder選択producerへ限定。 | シグニの下からカードを合計２枚まで |
| S044 | WXEX2-84-E1 | AUTO | 真バグ | LRIG_TRASH_CARDのarts count1固定でupToも無い。`execTransferToDeck`はこのsourceで`resolveNum`を使うが静的count2/upToなら既存選択UIへ載る。 | `execTransferToDeck`は`resolveNum`を呼ぶ | 動的refは不要。原文の2枚までをcount2+upToで表せる。 | アーツを２枚まで |
| S045 | WXDi-CP02-036-E1 | AUTO | 真バグ | opponent SIGNI count1のみをbottomへ置き、全field SIGNIを移す`count:'ALL'`になっていない。 | `execTransferToDeck`（SIGNI ALL branch） | opponentが順序を決める点も通常の自動ALL移動だけでは別途確認が要るが、少なくともcount1は救われない。 | すべてのシグニ |
| S046 | PR-380-E1 | AUTO | 真バグ＋機構待ち | liveはartsだけ1枚強制で、resonaが欠落し「各種0〜1」を単一count2 poolでは保証できない。 | 無し＝機構待ち（category別quota付きLRIG_TRASH選択→transfer） | `filter.cardType:[アーツ,レゾナ]`＋max2ではarts2枚を許すため「それぞれ」と非同値。 | アーツとレゾナをそれぞれ１枚まで |

注: S013は軸外のpower主語反転も同じlive action内で確定したため§6にも記録した。S045の並べる順序は本findingの枚数とは別で、段2 E2E確認事項とした。

## 3. action型ごとの所見・重複effectId

- `LOOK_PICK_CHAIN` 5件は全件偽陽性。各stageの`pickCount`はexact要求でなくSEARCH interactionの`maxPick`であり、`stages.slice(1)`と`_revealed`により残りstageへ継続する。
- `SEARCH` 3件とCHOOSE内S012も全件偽陽性。`maxCount`が0〜上限、then内count1はpicked cardごとの単位actionである。
- BANISH/TRASH/DRAW/ADD_TO_FIELDの動的countは`resolveCountRef`へ配線済み。S007/S008/S034/S042はparser修正だけで届く。
- LIFE_CRASH/LOOK_AND_REORDER/TRANSFER_TO_DECKは`resolveNum`利用。ただし今回、これらにlive `$ref`を載せた無言0件は0件で、制限効果・閲覧枚数選択・category quotaという別機構不足だった。
- `WX25-P1-091-E1`（S023/S024）はenergy段とtrash段という別指摘だが、1真因「各stageのpickCountはmaxPick」で束ね、両方偽陽性。
- `WD10-007-E1`（S041/S042）は別々ではなく1連鎖。前段upTo欠落と、前段実績を後段BANISHへ渡すref欠落の2箇所で、双方真バグ。
- `SPDi43-24-E1`（S007/S008）は1真因「前段DOWN結果を参照せず別のcountにした」に束ねられる。consumerはTRASHとDRAWで別だが双方`resolveCountRef`対応経路へ正準化できる。

## 4. 機構待ち一覧

| effectId / finding | 不足語彙・機構・配線 |
|---|---|
| WX13-030-BURST / S002 | `SelectionConstraint`へpower総和上限を追加し、`satisfiesSelectionConstraint`と選択UIへ配線。 |
| WXDi-P10-043-E1 / S003、WD22-011-G-E1 / S011、WXEX1-44-E1 / S031 | **第8バッチ§4 S009・第9バッチ§4 S038の動的level上限ファミリと同一＝二重登録しない**。producerだけsource under／self hand／attached ACCに分かれる。 |
| WX12-019-E2 / S005 | **第7バッチ§4 WX11-041/WX17-Re02・第8バッチ§4 S005の動的power上限と同一＝二重登録しない**。trash name count×2000版。 |
| WXEX1-22-E1 / S009、WXDi-P04-004-E1 / S037 | CHOOSEの選択数を盤面attached charm数／floor(trash count÷10)から動的解決する`execChoose`配線。 |
| PR-442-BURST / S016 | `resolveCountRef`へdeck枚数のfloor division producer。現行`CountFromZone`はdeck無し・乗算のみ。 |
| WXEX2-46-E1 / S017 | attached ACC数を数え、`execEnergyChargeFromDeck`の既存`resolveCountRef`へ渡すproducer。 |
| WX16-022-E1 / S018 | energyのアクセicon札を任意複数選択し、任意複数SIGNIへ1host1枚制約付きでattachmentする機構。 |
| WX20-032-E1 / S019 | life crash適用地点でplayerごとのturn capを収集・消費する制限機構。 |
| WD06-007-E1 / S020 | LOOK_AND_REORDERのsource閲覧枚数自体を0〜N選ぶ入口。`execLookAndReorder`は現在`resolveNum`固定。 |
| WXDi-P10-007-E3 / S021 | spell cost総和constraint付き公開pick→check zone→順次無償使用→remainder shuffle。S002の総和constraintと基盤共有可。 |
| SPK01-08-E1 / S022 | LOOK集合をdestination別exact quota（bottom3/trash1）へpartitionする機構。 |
| WX05-010-E1 / S032 | life cloth全閲覧後、任意部分集合をtrash、残りをlife内reorderする配線。 |
| WXDi-P11-077-E1 / S038 | TAKE_FROM_UNDER_SIGNIに`count:'ALL'`＋upToを通す。9 sentinel依存を廃止。 |
| WDK15-008-E1 / S043 | 複数self SIGNI hostのunder cardsを単一poolとして合計N枚まで選びtrashし、lastProcessedCardsへ載せる。 |
| PR-380-E1 / S046 | LRIG trashのarts/resonaをcategory別各0〜1で選ぶquota constraint。 |

## 5. 偽陽性件数の自己評価

偽陽性は **11/46 = 23.9%**。第8バッチ1/40=2.5%、第9バッチ2/49=4.1%、第10バッチ0/40=0%を大幅に上回る。第1〜10通算101/592へ今回11件を加えると **112/638 = 17.6%**。

第9で立て第10で支持された「固有executorの数ではなく、段0指摘がexecutorの非自明な慣例に実際に衝突する割合が効く」という仮説を強く支持する。今回の母集団では、`LOOK_PICK_CHAIN.pickCount`と`SEARCH.maxCount`がどちらもJSON上のupTo field無しでSEARCH UIの0〜`maxPick`を表す慣例へ、11 findingsが直接衝突した。動的枚数そのものの`resolveNum`/`resolveCountRef`差では偽陽性は発生せず、むしろ「別actionから類推しない」ことでS043後段だけが既に正しいと切り分けられた。つまり偽陽性率を押し上げたのは動的値の型宣言ではなく、実際の選択UI consumerである。

## 6. 条件以外で見つけた原文との食い違い

**2件**。

- S013: FREEZE欠落に加え、原文の「このシグニ+4000」がliveでは対象相手SIGNI+4000へ主語反転。
- S045: 全SIGNI count欠落とは別に、原文は置く順番を対戦相手が決めるため、ALL bottom移動時のrespondent/order保持を段2 E2Eで確認する必要がある。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測23.5秒）。

- typecheck PASS
- golden **2337 PASS / 0 FAIL**
- smoke **10693効果 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / baseline 773**
- census:stubs **A群🔴 0 / C群 0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業前からのtracked M 2本 `scripts/archive/semanticAuditLedger.mjs` / `scripts/archive/semanticAuditMkBatchSingles.mjs`、既存未追跡の第8報告、第9明細/索引/報告、第10明細/索引/報告、入力の第11明細/索引、および新規の本報告だけ。本作業では指定の計器2本に触れていない。`git diff --stat`はその既存M 2本だけ（**2 files changed, 9 insertions(+), 3 deletions(-)**）で、本作業によるtracked差分は0。

分類表は46行、根拠列46件、unique **46/46 = 100%**を機械測定した。UTF-8で先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **27219 bytes**。

`parseStatus`を明細live行から読めなかった4件は **S011 / S012 / S037 / S039**。いずれもlive無しやPARTIAL/MANUALではなく、明細ジェネレータが長い1行JSONを途中で切っただけだった。`public/data/effects_*.json`の実体をeffectId検索し、4件すべて **AUTO** と確認した。

## 8. ガードレール2・3・5・6で当初見立てから変えた件

- S007/S008: 「この方法でDOWNした数」はref語彙不足と見たが、`last_processed_count`は既存でTRASH/DRAW双方が`resolveCountRef`を呼ぶためparser真バグへ変更。
- S012/S028/S029/S030: then側count1を総処理枚数と見た初期判断を撤回。`resumeSearch`がpicked各札へthenを適用するため偽陽性。
- S023〜S027/S033/S039: `upToCount`不在を真バグと見た判断を撤回。`execLookPickChain`がstageのpickCountをSEARCH `maxPick`へ変換しUIが0選択を許すため偽陽性。
- S016: `countFromZone`流用案を撤回。zoneにdeckがなく`per`は除算でなく乗算なので機構待ち。
- S017/S031: field countFromZone案を撤回。これはfield top cardsを`matchesFilter`で数え、attached ACCを列挙しない。
- S038: count9を「好きな枚数」のsentinel慣例とする案を撤回。`execTakeFromUnderSigni`は`resolveNum(9)`をそのまま使い10枚目以降を選べない。
- S043: 先回りメモXから後段`$ref`がno-opになる疑いを持ったが、BANISHは`resolveCountRef`を呼ぶため後段は正しい。機構待ちは前段のmulti-host under選択だけ。
- 先回りメモX/Y/Y'/Z/Z'/AA/AB/ACは引用箇所を実コードで確認した。記述との食い違いは0件。AAの「stage countとstage数は別」をS023/S024で、ACの総和constraint不在をS002で採用した。

---

# 【Claude 検証】2026-08-22（CODEX_GUIDE §7）

## 🟢 ゲート・成果物・証拠の質
ゲート独立実行で全項目一致（golden 2337/0・census 773/773・lint 0err/260warn）。スコープ外変更0。
**根拠列 46/46 ユニーク**（第3バッチは 107行→40ユニークで失格だった）。

## 🟢 偽陽性11件は妥当＝中核2主張を Claude が独立確認
- `execLookPickChain` は `maxPick: stageMax` を SEARCH interaction の**上限**として渡し、
  `stages.slice(1)` で段ごとに再入する（`effectExecutor.ts:5690-5708`）＝`pickCount` は exact ではない。
- `SearchAction.upToTarget` 省略時は **0枚可**（`types/effects.ts:1352`）。

## 🔴 §4 の1件を Claude 側の誤りとして訂正する＝**`S002` の「機構待ち」は成立しない**

**原因は Claude の先回りメモAC が誤っていたこと。** メモAC は「`SelectionConstraint` は
`same`/`distinct`/`sharedColor` の3種だけで総和制約が無い」と書いたが、**探した場所が違った**。
**総和制約は `SelectionConstraint` ではなく `EffectTarget` 側に実装済み**：

| | 実測 |
|---|---|
| 型 | `types/effects.ts:837` **`totalPowerMax?: number`**（「パワーの合計がN以下になるように好きな数」）／`:839` `totalLevelMax?: number` |
| 消費 | `effectExecutor.ts:1187-1196`（`tgt.totalPowerMax !== undefined` で合計制限つき複数選択へ分岐）／強制は `:8179-8186` |
| 選択UI | `execUtils.ts:2590,2654` が `totalPowerMax` / `candidatePowers` を pending へ載せる |
| parser | **既に生成している**＝`parseSentencePart1.ts:1649,1662`（コメント `:1640`＝「既存の `totalPowerMax`（選択制約として engine 実装済み）に載せる」） |
| 実例 | `manualEffects.ts:781` `WX05-002-E3`＝`{"count":"ALL","totalPowerMax":30000}` |

⇒ **`WX13-030-BURST / S002` は「真バグ（parser の regex が この文型に一致していないだけ）」であって機構待ちではない。**
**§4 の登録行は無効**＝段2 で engine 実装を起こす必要はない。**真バグの判定自体は正しい**（live は power 無制限）。

⚠**`S021`（`WXDi-P10-007-E3`）は別物として残す**＝あちらは「対象選択の総和上限」ではなく
「公開→cost 総和4以内で spell を順次無償使用」という多段フローで、`totalPowerMax` では表せない。
ただし §4 に書かれた「S002 の総和 constraint と基盤共有可」という理由づけは上記により無効。

## 🔑 教訓（次バッチ以降の指示書へ反映済み）
**「この機構は無い」と書く前に、隣接フィールドまで見る。**
`totalPowerMax` は `selectionConstraint` と**同じ interface の3行隣**にあった。
Claude は `SelectionConstraint` の中身だけを grep して「無い」と結論した。
