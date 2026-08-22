# 意味照合監査 clean群 round1 段1 — 第19バッチ triage

対象: `stage1_batch19.txt` の29 findings（28 effectId）／軸表示「(未分類)」。実装・既存ファイル編集は行っていない。

## 1. サマリ

### action 型別

| action 型 | findings | 真バグ | 偽陽性 | 機構待ち※ | 要追調査 |
|---|---:|---:|---:|---:|---:|
| SEQUENCE系 | 14 | 14 | 0 | 7 | 0 |
| TRANSFER_TO_DECK | 5 | 5 | 0 | 1 | 0 |
| TRANSFER_TO_HAND | 4 | 4 | 0 | 1 | 0 |
| TRASH | 5 | 5 | 0 | 2 | 0 |
| UP | 1 | 1 | 0 | 1 | 0 |
| **計** | **29** | **29** | **0** | **12** | **0** |

※機構待ちは真バグとの重複計上。登録単位では11件（§4）。

### 退化の型別

| 退化の型 | findings | S番号 |
|---|---:|---|
| ①移動先／action 型の取り違え | 12 | S001, S005, S009, S010, S011, S015, S016, S017, S018, S019, S021, S028 |
| ②任意（`optional`）の脱落 | 4 | S002, S012, S014, S022 |
| ③「それ」参照（`targetsLastProcessed`系）の脱落 | 4 | S004, S006, S008, S013 |
| ④`thisCardOnly`の脱落 | 2 | S007, S020 |
| ⑤条件の脱落 | 2 | S003, S024 |
| ⑥その他 | 5 | S023, S025, S026, S027, S029 |
| **計** | **29** |  |

## 2. finding 全29件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WXDi-P07-064-E1 | AUTO | 真バグ | `LOOK_AND_REORDER.destination.position`が`top`で、公開3枚を上へ戻す指定になっており原文のbottomと逆。 | `execLookAndReorder`は`destination.position`を読み、型も`top/bottom/any/split_top_bottom`を宣言するため`bottom`生成で届く。 | 省略時topの慣例は検討対象外で、liveは省略でなく明示`top`なのでbottom要求を救済しない。 | デッキの一番下に置く |
| S002 | WXDi-P10-075-E1 | AUTO | 真バグ＋機構待ち | 先頭札を見る処理の後が`TRASH{SIGNI,owner:any}`で、カード種別・移動元・任意性の3点が別物。 | `TrashAction`に`optional`宣言は在るが、`execTrash`の`DECK_CARD`分岐は`optional`を読まず上から固定枚数を即時ミルする。特定のdeck topを全件実行／スキップする配線が必要。 | `TRASH_REVEALED`は`REVEAL_DECK_TOP`が保存する`last_revealed_deck_cards`専用で、`LOOK_AND_REORDER`の閲覧札には流用できない。 | そのカードをトラッシュに置いてもよい |
| S003 | WXK07-038-E1 | AUTO | 真バグ | `activeCondition`が自ターンだけで、自己life＞相手lifeを要求する比較条件がaction全体のどこにもない。 | `LIFE_COMPARE_OPP{operator:'gt'}`は`evalCondition`/`checkActiveCondition`で自己lifeと相手lifeを比較する既存条件。 | `TURN_OWNER:self`は時期だけを限定し、ライフ枚数の大小を暗黙に検査しない。 | ライフクロスが対戦相手より多いかぎり |
| S004 | WX25-P1-002-E1 | AUTO | 真バグ | `REMOVE_ABILITIES`後の`BOUNCE`が相手シグニを再選択し、能力を失ったinstanceとの同一性を保持していない。 | `BounceAction`に`targetsLastProcessed`宣言は**無い**が`targetsStored`宣言は在り、`execBounce`が`storedTargetCards`で候補を絞る。前段選択→`STORE_LAST_PROCESSED_TARGETS`→`targetsStored`の既存正準形で届く。 | `BOUNCE.target.owner/count`一致は同一instanceを保証せず、`optional:false`も対象固定とは無関係。 | それを手札に戻す |
| S005 | WDK04-011-E1 | AUTO | 真バグ | 奇数分岐の`then`が直接`POWER_MODIFY`で、公開札をdeckからtrashへ動かすstepが一つもない。 | `REVEAL_DECK_TOP`は公開札を保存し、`execTrashRevealed`が`last_revealed_deck_cards`をdeckからtrashへ移すため既存`TRASH_REVEALED`を奇数枝の先頭へ置ける。 | `LAST_PROCESSED_MATCHES`は公開札の属性判定だけで、成立してもカードのゾーン移動を副作用として行わない。 | そのカードをトラッシュに置き |
| S006 | SP24-010-E1 | AUTO | 真バグ＋機構待ち | 最終stepは`GRANT_KEYWORD{アクセ}`であり、エナのアクセ札を移動せず、SEARCHで場に出したhostも固定しない。 | `AttachAcceAction`に`optional`もhost用`targetsLastProcessed/targetsStored`も**宣言が無い**。`execAttachAcce`はエナ札を移せるがhostを盤面から再選択するため、SEARCH配置instanceを保持して任意ATTACHする配線が必要。 | `ATTACH_ACCE.targetFilter`は属性一致でhostを絞るだけで、直前に場へ出したinstanceを一意に参照できない。 | それをこの方法で場に出したシグニの【アクセ】にしてもよい |
| S007 | WXK05-031-E2 | AUTO | 真バグ | 最初の`TRANSFER_TO_DECK.source.filter`がcardTypeだけで、自場の任意SIGNIを候補化している。 | `TargetFilter.thisCardOnly`は宣言済みで、`execTransferToDeck`のSIGNI分岐が効果元`sourceCardNum`だけへ絞る。 | source owner selfは「自分のカード」の意味でしかなく「このシグニ自身」を自動選択しない。 | このシグニをデッキの一番下に置く |
| S008 | WXDi-P11-078-E1 | AUTO | 真バグ＋機構待ち | 条件成立後の`ADD_TO_FIELD.source`はtrashの任意SIGNIで、直前にdeck topから落としたタウィルinstanceに固定されない。 | `AddToFieldAction`に`targetsLastProcessed/targetsStored`は**宣言が無い**。`execAddToField`もsource候補を`lastProcessedCards`へ限定しないため、同一instance参照の追加配線が必要。 | `filter.cardName`を足してもtrashに同名複数があれば別instanceを選べるため「そのカード」の代替にならない。 | そのカードをトラッシュから場に出してもよい |
| S009 | WX13-001-E4 | AUTO | 真バグ | SEQUENCEが手札ALL trashと相手SIGNI ALL banishだけで、自己energy ALL trashが丸ごと欠落。 | `execTrash`は`ENERGY_CARD`と`count:'ALL'`を処理する既存分岐を持ち、先頭step追加で届く。 | exceed costはルリグ下カードの支払いであり、エナゾーン全捨てを代行しない。 | エナゾーンからすべてのカードをトラッシュに置き |
| S010 | WX11-052-E3 | AUTO | 真バグ＋機構待ち | 相手手札ALLと相手energy ALLの両stepが`TRASH`で、要求される除外ゾーンへ一枚も移さない。 | `ExileAction`宣言は在り`execExile`はHAND_CARD ALLを消費するが、ENERGY_CARD分岐が**無い**ため手札側は既存、エナ側は`execExile`追加配線待ち。 | EXILEの存在だけでは両zone対応の証明にならず、未対応typeは`if (tgt.type !== 'TRASH_CARD') return done(ctx)`で無言no-opになる。 | 手札とエナゾーンにあるすべてのカードをゲームから除外する |
| S011 | WX16-027-E2 | AUTO | 真バグ | cost相当の先頭stepが相手SIGNIの`TRASH`で、効果元の下カードを一枚も取り出していない。 | `TAKE_FROM_UNDER_SIGNI{destination:'trash',count:1,fromThis:true}`を`execTakeFromUnderSigni`が処理する。事前対象はSTOREし、後段BANISHの`targetsStored`宣言・consumerで同一相手SIGNIへ戻せる。 | 現在の`CONDITIONAL(IS_MY_TURN)` did-itゲートは前段成功を見ても、誤った前段対象を「効果元の下」へ変換しない。 | このシグニの下からカード１枚をトラッシュに置く |
| S012 | WX03-021-E1 | AUTO | 真バグ＋機構待ち | 自場SIGNI ALLの`TRASH`に任意指定がなく、解決時に全候補を強制移動する。 | `TrashAction.optional`宣言は**在る**が、`execTrash`の`count:'ALL'`分岐は`target.upToCount`だけを見て`action.optional`を読まない。部分集合でなくALL実行／ALLスキップの二択配線が必要。 | `target.upToCount:true`は0〜全枚の部分選択まで許し、「すべて置くか何もしないか」より広いので代用不可。 | すべてのシグニを場からトラッシュに置いてもよい |
| S013 | WXEX2-31-E1 | AUTO | 真バグ＋機構待ち | SEARCH filterがcardType SIGNIだけで、離場trigger cardと同名という動的制約がない。 | `TargetFilter`に`nameEqLastProcessed`は在るが、triggeringCardNumとの名前比較キーは**無い**。`collectLeaveFieldTriggers`が渡すtrigger card名をSEARCH候補へ解決する配線が必要。 | `triggerFilter.excludeSelf`と`byOpponentEffect`は発火元を限定するだけで、deck内SEARCH候補の名前を狭めない。 | 場を離れたそのシグニと同じ名前 |
| S014 | WX03-015-E1 | AUTO | 真バグ＋機構待ち | 自場SIGNI ALLの`TRASH`が強制で、原文の任意実行を選ぶ入口がない。 | S012と同一。`TrashAction.optional`宣言は**在る**がALL分岐consumerが無視するため、`execTrash`へ全件二択を1機構として配線する必要がある。 | `upToCount`による任意枚数は3体未満を故意に捨てる挙動を許し、原文のall-or-noneとは一致しない。 | 場からトラッシュに置いてもよい |
| S015 | WXEX1-39-E2 | AUTO | 真バグ | actionは相手SIGNI1体だけをdeck topへ移し、効果元自身を移すstepが無い。 | `TRANSFER_TO_DECK`のSIGNI分岐は`thisCardOnly`と`position:'top'`を消費できるため、相手対象stepと自己stepのSEQUENCEで既存表現可能。 | 単一`source.owner:'opponent'`はself側効果元を候補集合に含めず、「このシグニとそれを」の複数主語を暗黙追加しない。 | このシグニとそれをデッキの一番上に置く |
| S016 | WXEX2-16-E3 | AUTO | 真バグ | `LRIG_TRASH_CARD.count`が1で、緑ARTSが複数あっても先頭一枚しか戻さない。 | `execTransferToDeck`のLRIG_TRASH_CARD分岐は`count:'ALL'`ならfilter一致全件をlrig_deckへ移す。 | `destination:'lrig_deck'`は移動先指定だけで、枚数1を「すべて」に拡張しない。 | すべての緑のアーツをルリグデッキに加える |
| S017 | WXDi-P02-078-E1 | AUTO | 真バグ | bottom移動は相手power10000以上SIGNI一体だけで、このシグニ自身の同時移動が欠落。 | `TRANSFER_TO_DECK`はSIGNI sourceの`thisCardOnly`と`position:'bottom'`を消費するため、相手対象＋自己対象の2stepで届く。 | `position:'bottom'`が正しくても、移動候補を対戦相手側に限定したままself sourceを補完する慣例はない。 | それとこのシグニをデッキの一番下に置く |
| S018 | WXDi-P14-033-E1 | AUTO | 真バグ | trash ALLをshuffleしてdeckへ戻す一actionだけで、shuffle後のdeck top→life追加がない。 | `ADD_TO_LIFE{owner:'self',count:1,fromTop:true}`をexecutorが処理するため、既存actionを後続stepへ足せる。 | `TRANSFER_TO_DECK.shuffle:true`はdeckの並べ替えまでで、top札をlifeへ自動移動しない。 | デッキの一番上のカードをライフクロスに加える |
| S019 | WXEX1-38-E1 | AUTO | 真バグ＋機構待ち | sourceが相手SIGNIで、原文の相手HAND_CARD一枚とはzoneもカード種別も異なる。 | `TRANSFER_TO_DECK`はHAND_CARDを移せるが、`EffectTarget.blind`を同分岐が読まず選択UIに手札内容を露出する。見ないで選ぶrespondent/伏せ選択の配線が必要。 | `blind:true`はTRASHのHAND_CARD分岐ではランダム化されるが、別actionのTRANSFER_TO_DECKへ類推適用できない。 | 対戦相手の手札を１枚見ないで選び |
| S020 | WXK09-031-E2 | AUTO | 真バグ | `TRANSFER_TO_HAND.source`がself ENERGY_CARD一枚の無制限候補で、trigger source自身に限定されない。 | `TargetFilter.thisCardOnly`は宣言済みで、`execTransferToHand`のENERGY_CARD分岐が`sourceCardNum`在中時に即時回収する。 | `timing:ON_ENERGY_FROM_TRASH`は発火契機を決めるだけで、source filter無しの候補UIをtrigger cardへ自動固定しない。 | このカードをエナゾーンから手札に加え |
| S021 | WXEX1-38-BURST | AUTO | 真バグ | liveは＜電機＞SIGNI一枚だけを回収し、同時に要求されるSPELL一枚の選択が欠落。 | `TransferToHandAction.transferGroups`を`execTransferToHand`がgroup別SEQUENCEへ展開するため、SIGNI＜電機＞1＋SPELL1を既存語彙で表せる。 | `count:1`はfilter一致SIGNIの単位であり、異種2カテゴリを各一枚へ暗黙展開しない。 | ＜電機＞のシグニ１枚とスペル１枚 |
| S022 | WXK09-031-E2 | AUTO | 真バグ＋機構待ち | 同effectはouter `mandatory:true`かつsource `upToCount`なしで、energy在中なら一枚選択が強制される。 | `TransferToHandAction`に`optional`宣言が**無い**。consumerも`source.upToCount`だけを任意枚数として読むため、「このカード自身を加える／加えない」の二択配線が必要。 | `mandatory:false`は能力のスタック処理属性であり、手札移動actionのスキップUIを作らない。 | 手札に加えてもよい |
| S023 | WX13-027-E1 | AUTO | 真バグ | source filterはSIGNI＋Guardだけで、色制約がないため有色Guard持ちも候補になる。 | `TargetFilter.color:'無'`を`matchesFilter`が消費し、TRASH_CARD候補生成へ既に渡る。 | コストが無色2であることは支払色であって、回収対象のカード色を自動制限しない。 | 無色のシグニ |
| S024 | WX24-P2-040-E1 | AUTO | 真バグ＋機構待ち | 相手SIGNIのfilterはcardTypeだけで、そのcardNameが相手trashに存在するかを候補ごとに検査しない。 | `TRASH_HAS_CARD`は固定filterの盤面条件で、選択候補ごとの名前をtrashへ照合できない。TargetFilter動的same-name-in-trashと`fieldCandidates`配線が必要。 | `nameEqLastProcessed`は直前処理札との比較であり、未選択候補ごとに相手trash全体を走査する要件とは向きが違う。 | トラッシュにあるいずれかのカードと同じ名前 |
| S025 | WX25-P3-053-E1 | AUTO | 真バグ | liveはON_PLAY時にdeck top3を即trashへ置き、将来の次の2回のdamageとの置換予約を一件も作らない。 | `REPLACE_NEXT_DAMAGE_WITH_MILL`は`life_crash_replacements`へonce予約を積み、damage funnelが消費する。既存actionを2step並べれば2回分を表せる。 | `TRASH{DECK_CARD}`は現在時点のミルで、damage発生まで遅延も置換も行わない。 | このターン、次とその次にあなたがダメージを受ける場合、代わりに |
| S026 | WXDi-P05-063-E1 | AUTO | 真バグ | actionが相手HAND_CARD一枚のblind trashだけで、先行する相手DRAW1が欠落。 | `DrawAction{owner:'opponent',count:1}`を`execDraw`が相手stateへ適用でき、後続TRASHとのSEQUENCEで届く。 | blind discardが相手手札の最終枚数を操作しても、deckからhandへ一枚追加する副作用はない。 | 対戦相手はカードを１枚引き |
| S027 | WXK11-027-E2 | AUTO | 真バグ | target ownerはopponentだが`opponentSelects`がなく、通常の効果使用者応答で相手SIGNIを選ぶ。 | `TrashAction.opponentSelects`宣言は在り、`execTrash`のSIGNI分岐が相手応答の`selectOrInteract`へ渡す。 | owner opponentは移動されるカードの所有者だけを決め、選択者まで自動反転しない。 | 対戦相手は自分のシグニ１体を対象とし |
| S028 | WDK13-001-E3 | AUTO | 真バグ＋機構待ち | `TRASH{SIGNI,count:1}`は相手zoneのtop SIGNI一体だけを移し、各stack下・アクセ等の表向きカード全体を処理しない。 | `TrashAction`のEffectTargetには「シグニゾーン内の表向き全カード」というtarget型/flagが**無く**、`execTrash` SIGNI ALLもtopだけを候補化する。zone layer全体をtrashへ移す配線が必要。 | `count:'ALL'`へ直すだけではfieldCandidatesが各zone topしか返さず、原文の「すべてのカード」にならない。 | シグニゾーンにある表向きのすべてのカード |
| S029 | WXK11-006-E4 | AUTO | 真バグ＋機構待ち | timingが`ON_ATTACK_SIGNI`で、センタールリグ攻撃終了時でも全Guard成立時でも発火条件を満たさない構造。 | `ON_ATTACK_LRIG`は攻撃宣言時、既存`ON_ATTACK_END` collectorはSIGNI個別attack用で`attackDealtNoDamage`しか持たない。center LRIGのattack終了＋全guard済みpayload/collectorが必要。 | `attackDealtNoDamage`は未与damage一般で、全Guard以外の軽減・置換も含み得るため「すべて【ガード】」の代用にしない。 | センタールリグ１体がアタックしたとき、そのアタック終了時、そのアタックがすべて【ガード】されていた場合 |

## 3. 所見（退化の型ごと）

- **①移動先／action型の取り違え**: S015/S017は「相手対象＋このシグニ」の自己step脱落、S009/S018/S021/S026は複数stepの一部脱落として組める。S001/S016は既存fieldの値違い、S005/S011は既存専用actionへの取り違え、S010/S019/S028はconsumer差を伴うため別バッチに分けるべき。
- **②任意脱落**: S012/S014は同一の`TRASH count:'ALL'` all-or-none consumer穴。S002はDECK_CARD専用、S022はTRANSFER_TO_HAND専用で、`optional`という語だけを共通化せずaction別に扱う。
- **③「それ」参照脱落**: S004は既存STORE→BOUNCE、S006はSEARCH配置host→ATTACH_ACCE、S008はdeck top→trash→ADD_TO_FIELD、S013はleave trigger card名→SEARCH。4件とも参照元・参照先が違い、S006/S008/S013は個別配線待ち。
- **④`thisCardOnly`脱落**: S007はTRANSFER_TO_DECK SIGNI、S020はTRANSFER_TO_HAND ENERGY_CARD。どちらも既存`TargetFilter.thisCardOnly`を各consumerが実際に読むためparser/data修正だけで届く。
- **⑤条件脱落**: S003は既存`LIFE_COMPARE_OPP`で完結。S024は候補SIGNIごとのcardNameを相手trashへ照合する動的filterが無く機構待ち。
- **⑥その他**: S023（color filter）、S026（先行DRAW）、S027（respondent）は既存field。S025は既存置換actionを2件予約する構成。S029だけはLRIG attack終了イベントpayloadから新設が必要。

段2のまとまり候補は、(a) **単純parser/data修正** S001/S003/S005/S007/S009/S011/S015〜S018/S020/S021/S023/S025〜S027、(b) **全件任意trash** S012/S014、(c) **同一instance参照** S006/S008/S013、(d) **zone/action consumer追加** S002/S010/S019/S022/S024/S028、(e) **LRIG attack終了** S029。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| DECK_CARDの特定top札を任意trash / S002 | `TrashAction.optional`を`execTrash` DECK_CARD分岐で全件実行／スキップとして消費し、LOOKしたtop札との同一性を保つ。`TRASH_REVEALED`とはproducerが別。 |
| SEARCH配置host固定の任意ATTACH_ACCE / S006 | SEARCH→ADD_TO_FIELDで配置したinstanceを保持し、`AttachAcceAction`のhostをそのinstanceへ固定するfieldとconsumer、ならびにaction全体のoptional二択。**第8バッチ§4 S021／第9バッチ§4 S033の「事前対象をADD_TO_FIELD sourceへ固定」と参照保持基盤を共有するが、今回は配置結果→アクセhostでconsumerが別。** |
| 直前にdeckからtrashへ置いたinstanceのADD_TO_FIELD / S008 | `AddToFieldAction`へ`targetsLastProcessed`相当を追加し、TRASH_CARD候補を直前処理instanceへ固定。**第8バッチ§4 S021／第9バッチ§4 S033のADD_TO_FIELD source固定と同一機構**として二重登録しない。 |
| EXILE ENERGY_CARD / S010 | `execExile`へENERGY_CARD候補・ALL移動・excluded zone記録を追加。HAND_CARD側は既存なのでエナ分岐だけを登録。 |
| TRASH SIGNI ALLのall-or-none optional / S012,S014 | `execTrash`の`count:'ALL'`で`action.optional`を読み、部分集合を許さない実行／スキップ二択とdid-it結果を配線。2 findingsを1登録。 |
| leave trigger cardと同名SEARCH / S013 | triggeringCardNumのCardNameをSEARCH `TargetFilter`へ動的解決する`nameEqTrigger`相当。`nameEqLastProcessed`とは参照元が別。 |
| blind HAND_CARD→deck / S019 | `execTransferToDeck` HAND_CARD分岐で`source.blind`を消費し、「見ないで選ぶ」respondent/非公開選択を保ったままtopへ移す。 |
| TRANSFER_TO_HANDのself-source optional / S022 | `TransferToHandAction`へoptionalを追加し、ENERGY_CARD `thisCardOnly`即時経路を「加える／加えない」の二択にする。 |
| opponent trash同名候補filter / S024 | SIGNI候補ごとのCardNameが指定owner trashに存在するかを評価するTargetFilterと`fieldCandidates`配線。固定値`TRASH_HAS_CARD`では不可。 |
| SIGNI zone表向き全layer trash / S028 | 各相手SIGNI zoneの表向きstack/attachmentを列挙し全てtrashへ移すtarget/actionと、zone構造を壊さず除去するexecutor。top SIGNI ALLとは別。 |
| center LRIG attack終了＋all guarded / S029 | LRIG attack解決終了時のcollector、attacking center instance、guard結果（全guard）をstack entryへ渡すcondition。既存`ON_ATTACK_END`はSIGNI用、`attackDealtNoDamage`は条件が広すぎる。 |

機構待ちは**12 findings／11登録単位**。先回り予測の「少なく出る」は、29件中12件（41.4%）という実測では外れた。主因は、型名自体は在ってもaction別consumerが無いケース（S002/S010/S012/S014/S019/S022）と、直前instance参照がaction別宣言で欠けるケース（S006/S008）が重なったこと。

## 5. 偽陽性の件数についての自己評価

偽陽性は **0/29 = 0%**。今回の指摘はlive JSONの表面差だけでなく、各移動executorを開いても実際の移動元・移動先・選択者・任意性が原文へ戻る慣例救済を確認できなかった。特に、S004は`targetsStored`、S011はTAKE＋STORE、S025は同じ予約actionを2回積むという既存慣例を見つけたが、いずれも「指摘が誤り」ではなく「engine追加なしで修正できる」ことを示すだけだった。

Claudeの「語彙はほぼ全部在るので機構待ちは少ない」予測は**外れた**。action名レベルでは概ね在った一方、`optional`と参照保持はactionごとの宣言／分岐が不足し、EXILEもHAND/SIGNI/TRASH対応からENERGY対応を類推できなかった。真バグ29件という判定は、移動系に非自明な自動救済が少ない母集団の性質と整合する。

## 6. 条件以外で見つけた原文との食い違い

**4 effect・6項目**。

- S002 `WXDi-P10-075-E1`: 指摘の任意性に加え、移動対象がdeck top cardでなく`SIGNI owner:any`へ主語・zoneとも反転。
- S006 `SP24-010-E1`: host同一性に加え、アクセ札をenergyから移動せず`GRANT_KEYWORD`で場のSIGNIへ「アクセ」能力を付けるaction型違い、さらに原文の任意性も欠落。
- S010 `WX11-052-E3`: 除外→trashの指摘に加え、energy側をEXILEへ直すだけでは現consumerが無言no-opになる配線差。
- S029 `WXK11-006-E4`: 指摘のSIGNI/LRIG timing違いに加え、「アタック終了時」の遅延と「すべて【ガード】」条件がともに欠落。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測27.1秒）。

- typecheck PASS
- golden **2337 PASS / 0 FAIL**
- smoke **10693効果 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / baseline 773**
- census:stubs **A群🔴 0 / C群 0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は、作業前からのtracked M 2本 `scripts/archive/semanticAuditLedger.mjs` / `scripts/archive/semanticAuditMkBatchSingles.mjs`、既存未追跡の第8報告、第9〜18の明細・索引・報告、第19の明細・索引、および今回新規の本報告を表示した。本作業では指定の計器2本にも既存未追跡物にも触れていない。`git diff --stat`は計器2本だけ（`semanticAuditLedger.mjs` 13行、`semanticAuditMkBatchSingles.mjs` 7行、計 **2 files changed, 16 insertions(+), 4 deletions(-)**）で、本作業によるtracked差分は0。

分類表は29行、根拠列29件、unique **29/29 = 100%**を機械測定した。UTF-8で先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **27670 bytes**。

## 8. ガードレール2・3・4・7で当初の見立てから変えた件

- S002: `TrashAction.optional`宣言があるためparserだけと見かけたが、`execTrash` DECK_CARD分岐がoptionalを一切読まないため機構待ちへ変更。
- S004: `BounceAction`に`targetsLastProcessed`が無いため機構待ちと見かけたが、隣接fieldの`targetsStored`とSTORE consumerを確認し既存正準形で届く真バグへ変更。
- S006: `ATTACH_ACCE`の存在から既存で届くと見かけたが、interfaceにoptionalもhost instance参照も無く、consumerがhostを再選択するため機構待ちへ変更。
- S008: `ADD_TO_FIELD.optional`があるため既存で届くと見かけたが、同actionに`targetsLastProcessed/targetsStored`が無く、trash同名別instanceを排除できないため機構待ちへ変更。
- S010: 先回りメモBUの「EXILEは独立actionとして在る」を確認した一方、`execExile`にENERGY_CARD分岐が無く未対応typeはno-opだったため、一部機構待ちへ変更。**先回りメモのaction存在自体は正しいが、今回の関係先（手札＋エナ全除外）を既存だけで表せるという含意は不成立。**
- S012/S014: `TrashAction.optional`宣言とコメントから既存で届くと見かけたが、ALL分岐が`target.upToCount`しか読まないため、2件を同一consumer穴の機構待ちへ変更。
- S015/S017: 1 actionでself/opponentを同時指定できないため機構待ちと見かけたが、SEQUENCEと`thisCardOnly` consumerで既存表現できるためparser/data真バグへ変更。
- S019: `TRANSFER_TO_DECK`のHAND_CARD対応から既存で届くと見かけたが、同分岐は`EffectTarget.blind`を読まず内容を見せる選択UIになるため機構待ちへ変更。
- S022: outer `mandatory:false`で任意化できる見立てを外した。`TransferToHandAction`にはoptionalが宣言されず、consumerは`source.upToCount`しか読まないため機構待ち。
- S025: 「次とその次」のremainingUses fieldが無いため機構待ちと見かけたが、`life_crash_replacements`がqueueで既存once予約を2件積めるためengine追加不要へ変更。
- S028: `TRASH count:'ALL'`で足りる見立てを外した。SIGNI候補は各zone topだけで、stack下・attachmentを含む「表向きのすべてのカード」を列挙しないため機構待ち。
- S029: `ON_ATTACK_END + attackDealtNoDamage`流用案を外した。collectorはSIGNI attack用で、no-damageはall-guardより広く、center LRIG終了payloadも無いため機構待ち。

先回りメモBT/BV/BW/BX/BY/BZは該当宣言とconsumerを実コードで再確認した。上記S010以外の記述食い違いは0件。ただしBT/BWは注意書きどおりaction別差が実在し、機構待ち増加の主要因になった。
