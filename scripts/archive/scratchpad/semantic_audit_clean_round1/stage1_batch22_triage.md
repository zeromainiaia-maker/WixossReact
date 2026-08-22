# 意味照合監査 clean群 round1 段1 第22バッチ triage（軸「キーワード能力」残り18件）

## 1. サマリ

分類は finding 単位（18 findings / 17 effectId）。`真バグ＋機構待ち` は真バグ・機構待ちの両方へ計上する。全18件を分類し、軸「キーワード能力」の段1 triage を閉じた。

| action型 | 件数 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(ADD_TO_FIELD/ENERGY_CARD) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(ADD_TO_FIELD/TRASH_CARD) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(BANISH/SIGNI) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(CONDITIONAL/HAS_CARD_IN_FIELD) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(COST_REDUCTION/CHOOSE) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(DOWN/SIGNI) | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(ENERGY_CHARGE_FROM_DECK/GRANT_KEYWORD) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(GRANT_KEYWORD/LRIG) | 1 | 1 | 0 | 1 | 0 |
| SEQUENCE(LOOK_PICK_CHAIN/GRANT_KEYWORD) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(POWER_MODIFY/SIGNI) | 3 | 3 | 0 | 0 | 0 |
| SEQUENCE(SEARCH/REVEAL) | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE(TRASH/DECK_CARD) | 2 | 2 | 0 | 0 | 0 |
| TRANSFER_TO_HAND | 1 | 1 | 0 | 0 | 0 |
| TRASH | 1 | 1 | 0 | 0 | 0 |
| **計** | **18** | **18** | **0** | **3** | **0** |

### キーワード種別ごとの内訳

複数キーワードを含む finding は、指摘の主対象で排他的に数えた。

| 種別 | 件数 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| 【ガード】 | 5 | 5 | 0 | 3 | 0 |
| シャドウ | 3 | 3 | 0 | 0 | 0 |
| マルチエナ | 3 | 3 | 0 | 0 | 0 |
| ランサー | 2 | 2 | 0 | 0 | 0 |
| Sランサー | 1 | 1 | 0 | 0 | 0 |
| アサシン | 2 | 2 | 0 | 0 | 0 |
| ダブルクラッシュ | 1 | 1 | 0 | 0 | 0 |
| 引用能力付与 | 1 | 1 | 0 | 0 | 0 |
| **計** | **18** | **18** | **0** | **3** | **0** |

## 2. finding 全18件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WDK05-T09-E1-G | live無 | 真バグ＋機構待ち | 指定effectIdはliveに存在せず、付与される【起】全体が欠落するうえ、`BlockActionAction`は`target/actionId/until`等だけでガード札のlevel条件を保持できない。 | 無し＝`BlockActionAction`のguard-card filterとガード宣言UI／可否判定への配線待ち（PLAN §6.4 `O-41`）。 | 親キー効果・付与能力・STUBを確認したが、この子effectを暗黙実行する経路は無い。第10バッチS001と同一effectId。 | レベル１のシグニで【ガード】ができない |
| S002 | WX25-CP1-005-E1 | AUTO | 真バグ | liveのシャドウ付与は`owner:'any',count:1,keyword:'シャドウ'`で、原文のself・＜ブルアカ＞全体・レベル3以上限定の三要素のうちstory以外を落としている。`ShadowScope.levelGte`は既存。 | `execGrantKeyword`（ALL自動付与）／`collectContinuousGrantedKeywords`／`decodeShadowKeyword`・シャドウ保護評価。 | source自動付与分岐はcount1を1体へ狭めるだけで全体化せず、plainシャドウを`levelGte:3`へ補完もしない。 | あなたのすべての＜ブルアカ＞のシグニは【シャドウ（レベル３以上のシグニ）】を得る |
| S003 | WXDi-P14-070-E1 | AUTO | 真バグ | 解決時の`GRANT_KEYWORD count:'ALL'`はその時点の候補へ付与する一方、既存`reserveFieldGrant`は`duration:'NEXT_TURN',nextTurnOwner:'opponent'`のkeyword grantを対象側stateへ予約し、後発シグニにも再評価できる。liveはその予約経路へ載せていない。 | `execGrantKeyword`のNEXT_TURN分岐→`reserveFieldGrant`→`field_grants_next_opp_turn`→`activeFieldGrantKeywordsForSigni`。 | `count:'ALL'`だけでは将来の場出しを候補化しない。対してCONTINUOUS場全体付与と予約FieldGrantは現在盤面を毎回評価する既存正準形なので新機構は不要。 | このピースの後に場に出たシグニにも影響を与える |
| S004 | WXK03-052-E1 | AUTO | 真バグ | 後段TRASHは`ENERGY_CARD owner:'opponent',count:1`のみで`filter.keyword:'マルチエナ'`が無い。`matchesFilter`はマルチエナを印字またはself CONTINUOUS付与から判定する専用枝を持つ。 | `execTrash`のENERGY_CARD候補→`matchesFilter` `keyword==='マルチエナ'`分岐。 | 前段BANISHのdid-it慣例は後段実行可否を制御しても、エナ候補の能力条件を追加しない。現liveの`IS_MY_TURN`は条件代用にもならない。 | 対戦相手のエナゾーンから対象の【マルチエナ】を持つカード１枚 |
| S005 | WXDi-P16-051-E2 | AUTO | 真バグ | liveはアト＝トレ存在時のランサー付与の後にSランサーを無条件実行する。既存`ENERGY_COUNT{owner:'self',operator:'eq',value:0}`と`CONDITIONAL then/else`で、エナ0ならSランサー、そうでなければ通常ランサーという代替を表せる。 | `evalCondition(ENERGY_COUNT)`→`execConditional`（`then`/`else`）→`execGrantKeyword` source自動付与。 | §6.4 `O-37(a)`はdamage funnelでコストを払う置換であり、本件の解決時条件分岐とは別。SEQUENCEを「代わりに」と読む慣例も無い。 | あなたのエナゾーンにカードが無い場合、代わりに…【Ｓランサー】を得る |
| S006 | WX10-053-E1 | AUTO | 真バグ | choice②のPOWER_MODIFYとGRANT_KEYWORDはいずれも`owner:'self',count:'ALL'`だが`cardName:'サーバント'`がなく、自分の全シグニへ作用する。TargetFilter.cardNameは部分一致で両actionの候補consumerへ届く。 | `execPowerModify`／`execGrantKeyword`→`fieldCandidates`→`matchesFilter(cardName)`。 | CHOOSEは選択肢②を正しく排他実行するだけで、ラベル中の「全サーバント」を対象filterへ反映しない。場全体付与の正準形はALL＋owner＋filterの三点セット。 | カード名に《サーバント》を含むあなたのすべてのシグニ…【ランサー】を得る |
| S007 | WXEX2-01-E2 | AUTO | 真バグ＋機構待ち | DOWN後の`BLOCK_ACTION{actionId:'GUARD'}`はlevel参照を持たず全ガードを止める。動的値は直前DOWNの`lastProcessedCards`から解ける見込みだが、ガード札filterを宣言・消費する入口自体が無い。 | 無し＝`BlockActionAction`へfilter、`resolveDynamicFilter`へ「直前DOWNとlevel一致」、ガード宣言UI／可否判定へ配線（`O-41`）。 | `CONDITIONAL IS_MY_TURN`はdid-itを近似してもカードlevelを限定しない。`levelEqLastProcessed`はTargetFilter隣接語彙だがBLOCK_ACTIONがfilterを持たない。 | この方法でダウンしたシグニと同じレベルのシグニで【ガード】ができない |
| S008 | WX24-P3-042-E1 | AUTO | 真バグ | 原文の「このターン」に対し、エナ全体へのマルチエナ付与だけ`duration:'PERMANENT'`である。`GrantKeywordAction.duration:'UNTIL_END_OF_TURN'`は既存で、通常ストア`keyword_grants`はターン終了時に消える。 | `execGrantKeyword`→`PlayerState.keyword_grants`／turn scoped stateの終了時clear。 | effect外側`duration:'INSTANT'`は内側付与期限を上書きしない。ENERGY_CARD・ALL分岐は対象を自動確定するが期限を永久からターン中へ補正しない。 | このターン、あなたのエナゾーンにあるカードは【マルチエナ】を得る |
| S009 | WD15-010-E1 | AUTO | 真バグ＋機構待ち | ダブルクラッシュ付与は一致するが、続く`BLOCK_ACTION`はレベル1というガード札限定を保持せず全ガード禁止を積む。固定levelでも`BlockActionAction`にguard filterが無い点は同じ。 | 無し＝`BlockActionAction`とガード宣言UI／engine可否判定へのlevel filter配線待ち（PLAN §6.4 `O-41`）。 | LRIG対象のGRANT_KEYWORD自動付与は先行stepだけの慣例で、後続GUARD禁止の対象カードを限定しない。 | レベル１のシグニで【ガード】ができない |
| S010 | WX25-P2-039-E1 | PARTIAL | 真バグ | liveはplain`アサシン`をこの方法で場に出た対象へ付与するが、`AssassinScope`には`isFrozen`と`powerLte`がともにあり、`hasApplicableAssassin`は正面シグニについて両条件をAND評価する。よって`アサシン:{"isFrozen":true,"powerLte":12000}`へ既存語彙だけで直せる。 | `execGrantKeyword`（targetsLastProcessed）→`decodeAssassinKeyword`→`hasApplicableAssassin`→`signiAttackKeywords`。 | 第10バッチS014の「12000以上」は不存在の`powerGte`が必要だったが、本件は逆向きの「以下」なので同じアサシンでも機構待ちにしない。 | 【アサシン（凍結状態のパワー12000以下のシグニ）】を得る |
| S011 | WX26-CP1-059-E1 | AUTO | 真バグ | 1本の`activeCondition minCount:5`がSEQUENCE全体を覆うため、プリオケ5〜9枚でもシャドウまで付く。5枚条件のPOWER_MODIFYと10枚条件のスコープ付きGRANT_KEYWORDを別CONTINUOUS効果へ分ければ、各`TRASH_HAS_CARD`を既存consumerが独立評価できる。 | `checkActiveCondition(TRASH_HAS_CARD)`→`calcFieldPowers`／`collectContinuousGrantedKeywords`。 | 同一SEQUENCE内の後段に閾値を上書きする慣例は無い。`keyword:'シャドウ:{"powerLte":10000}'`は対象からの保護範囲であり、trash10枚条件ではない。 | １０枚以上あるかぎり、このシグニは【シャドウ（パワー10000以下のシグニ）】を得る |
| S012 | WX07-072-E1 | AUTO | 真バグ | POWER_MODIFYで選んだ対象を後段が参照すべきだが、GRANT_KEYWORDは同じ`owner:'any',count:1`を再選択する。前段executorが残す`lastProcessedCards`を`targetsLastProcessed:true`で固定する既存経路がある。 | `execPowerModify`（lastProcessedCards記録）→`execSequence`→`execGrantKeyword(targetsLastProcessed)`。 | source自動付与はfilterなしでも`sourceCardNum`が候補なら効果元へ寄せるため、「それ」の同一対象保証にはならず、むしろ別対象化し得る。 | ターン終了時まで、それは追加で【ランサー】を得る |
| S013 | PR-464-E1 | AUTO | 真バグ | liveにactiveConditionがなく常時+5000・ダブルクラッシュとなる。`ActiveCondition.AND`の子に`LRIG_LEVEL{gte:4}`と`LRIG_COLOR{color:'赤'}`を置け、`checkActiveCondition`は両者をevery評価する。 | `checkActiveCondition(AND/LRIG_LEVEL/LRIG_COLOR)`→`calcFieldPowers`／`collectContinuousGrantedKeywords`。 | センタールリグ参照はtarget filterではなく効果元の常時条件。赤かlevel4の片方だけを置くOR近似や、ダブルクラッシュ名から条件を推測する実行慣例は無い。 | あなたのセンタールリグがレベル４以上で赤であるかぎり |
| S014 | WX20-062-E1 | AUTO | 真バグ | 検索後の付与actionは対象の《超罠ハニトラ》ではなく`keyword:'トラップアイコン'`を与える。`execGrantKeyword`は文字列をそのままstateへ積むため、原文どおり`keyword:'アサシン'`へ直す必要がある。 | `execGrantKeyword`→`keyword_grants`→`hasKeyword('アサシン')`／アタック時判定。 | 前置きの`【トラップアイコン】《超罠ハニトラ》`はトラップ発動条件・対象名であり、付与能力名へ読み替えるengine慣例は無い。 | 《超罠ハニトラ》１体を対象とし…それは【アサシン】を得る |
| S015 | WX25-CP1-024-E1 | AUTO | 真バグ | liveのGUARD禁止は`until:'END_OF_TURN'`だが、型とexecutorには専用`END_OF_ATTACK`があり、`prevent_opp_guard`へ積んで「このアタックの間」として消費する。期限の取り違えは既存語彙で修正可能。 | `execBlockAction`の`actionId==='GUARD' && until==='END_OF_ATTACK'`分岐→`prevent_opp_guard`→attack response。 | ON_ATTACK_LRIG timingは発火時点だけを表し、禁止の失効時点をターン末からアタック末へ狭めない。 | そのアタックの間、対戦相手は【ガード】ができない |
| S016 | WX25-CP1-024-E1 | AUTO | 真バグ | liveはTRASH 7を強制し、成功・拒否に関係なくGUARD禁止を続行する。`ChooseAction.opponentResponds`で相手に「7枚置く／置かない」を選ばせ、拒否枝へ`BLOCK_ACTION END_OF_ATTACK`を置く既存対話経路がある。 | `execChoose(opponentResponds)`→選択action実行→`execTrash`または`execBlockAction(END_OF_ATTACK)`。 | SEQUENCEのdid-itゲートは前段が任意選択になっていない本liveを救わず、TRASHの`mandatory`外側値も相手の「置いてもよい」を生成しない。 | ７枚トラッシュに置いてもよい。そうしなかった場合 |
| S017 | WXDi-P11-051-E3 | AUTO | 真バグ | liveはCONTINUOUSの`TRANSFER_TO_HAND`を常時直接実行する形で、付与先・ON_ATTACK timingを失う。既存`GRANT_SIGNI_ABOVE_ABILITY`は下カードを含むstackを走査し、cardName filterに合うtopへ指定AUTO能力を付与する。 | `collectGrantedFromUnderSigni` Pattern B→`GRANT_SIGNI_ABOVE_ABILITY`→付与された`ON_ATTACK_SIGNI`のcollector。 | `TargetFilter.aboveSelf`はPOWER系対象解決用の隣接語彙だが、引用能力の付与自体には専用actionが既にある。直接TRANSFERをCONTINUOUSとみなす慣例は無い。 | このカードの上にある《融合せし極門　ウトゥルス//メモリア》は「【自】：このシグニがアタックしたとき…」を得る |
| S018 | WDA-F03-13-BURST | AUTO | 真バグ | liveは無条件ENERGY_CARDを1枚だけtrashへ送り、必要な計2枚とマルチエナ枠を落とす。`TargetFilter.keyword`の実consumerがあり、マルチエナ1枚を先に選ぶTRASHと残る任意1枚のTRASHをSEQUENCE化すれば別カード2枚を既存actionで処理できる。 | `execTrash` ENERGY_CARD分岐→`matchesFilter(keyword:'マルチエナ')`、続く無filterの`execTrash`。 | `count:1`を「通常枠1＋能力枠1」と展開する慣例は無い。単一`count:2`＋keyword filterでは2枚ともマルチエナに狭まり原文より強い制約になるため外した。 | カード１枚と【マルチエナ】を持つカード１枚を対象とし、それらをトラッシュに置く |

## 3. 所見

### 今回18件

全18 findingsは原文差がconsumer慣例で戻らず、真バグだった。機構待ちは`O-41`の3件だけで、残る15件は既存語彙・既存consumerへ正しいJSONを配線すれば直せる。特に次の対照が重要である。

- S010のアサシンは「凍結状態」かつ「パワー12000**以下**」。`AssassinScope.isFrozen`と`powerLte`が両方あり、consumerもAND評価する。第10バッチの「パワー12000**以上**」は`powerGte`が無いため機構待ちだった。同じ能力名でも条件の向きで結論が逆になる。
- S003の「後に場に出たシグニにも影響」は新規継続機構ではない。`FieldGrant{kind:'keyword'}`の次相手ターン予約と、場へ出た各シグニを都度照合するconsumerが既にある。
- S005の「代わりに」はdamage置換`O-37(a)`ではなく、解決時の`ENERGY_COUNT eq 0`と`CONDITIONAL then/else`で表せる。
- S017は型の隣接語彙を開いたことで、まさに「下カードから上のシグニへ能力を付与する」`GRANT_SIGNI_ABOVE_ABILITY`と専用collectorが見つかった。

### 第10バッチ＋第22バッチ：軸「キーワード能力」58件の実装カバレッジ総括

段2は「キーワード能力」1バッチとして次の順に束ねられる。

1. **符号化スコープを持つ能力は2つだけ**：`アサシン:`と`シャドウ:`。アサシンは`isFrozen/powerLte/selfHandLte`のみで、`powerGte`は無い。シャドウはlevel/power/color/cardType等の広いscopeを持つ。括弧条件は能力名ごとのencoderを必ず通し、plain名へ落とさない。
2. **ランサー系はplain名**：`ランサー`にscope prefixは無い。条件付きランサー3件（第10バッチ）はLancerScopeとバトルconsumerの機構実装単位。`Sランサー`・`ダブルクラッシュ`は綴り正準化後のplain keywordとして扱う。
3. **付与先は3分岐を固定して生成**：`LRIG`は全候補へ自動、`targetsStored || count==='ALL'`は全候補へ自動、filter無し／`thisCardOnly`かつsourceが候補ならsourceへ自動。それ以外は選択UIである。場全体は必ず`count:'ALL' + owner + filter`、同一対象参照は`targetsLastProcessed/targetsStored`、後発カードを含む期間付与はFieldGrant予約へ分ける。
4. **ガード限定は`O-41`へ束ねる**：58件中、第10バッチ2 findingsと今回3 findingsが直接該当する。固定level・列挙・「宣言数字と同じ」・「この方法でダウンしたシグニと同じ」の全形を、`BlockActionAction`のguard-card filterとガード宣言consumerの1機構で解く。今回分はlive10効果の既登録票に含まれるため新規登録しない。
5. **能力喪失は共通funnelを維持**：plain名の喪失は`isKeywordAbilityRemoved`がスコープ付き`アサシン:{...}`・`シャドウ:{...}`もprefixで止める。新しいscope表現でも各consumerがこのfunnelを迂回しないことを段2ゲートへ入れる。
6. **データ修正群を一括化**：今回の15件は、対象owner/count/filter、scope、duration、condition、同一対象参照、引用能力actionへの置換で既存consumerへ着地する。PARTIALのS010は通常buildだけでliveへ届かないため、実装時はmanual/live同期経路を別途確認する。

この整理なら、段2は (A) parser/manual JSONの既存語彙修正15件、(B) 第10バッチの既存語彙修正群、(C) `O-41`、LancerScope、アサシン`powerGte`等の機構単位、の三層に分けられる。機構未実装群をparserバッチへ混ぜず、付与先3分岐とscope encoderをgolden化するのが最小の回帰防止単位である。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足している語彙・機構・配線 |
|---|---|
| guard-card限定付き`BLOCK_ACTION` / S001,S007,S009 | `BlockActionAction`へguard札`TargetFilter`を追加し、固定level 1と動的「直前DOWNと同level」を`resolveDynamicFilter`で具体化したうえ、ガード宣言UI・CPU・engine可否判定が手札のガード札ごとに読む。**PLAN §6.4 `O-41`と同一＝新規登録しない**。3件とも`O-41`のlive10効果票に名指し済み。 |

機構待ちは**3 findings / 1登録単位**。第8〜第21バッチ§4との新たな重複はなく、S001/S007/S009だけが第10バッチ§4およびPLAN `O-41`と重複する。S003はFieldGrant予約、S005は条件分岐、S017は上シグニ能力付与という既存機構を確認できたため登録しない。

## 5. 偽陽性の件数についての自己評価

事前には、同じキーワード軸の第10バッチが40/40真バグ・偽陽性0だったこと、残18件も指摘が対象・scope・duration・条件・action型の具体的な欠落を示すことから、偽陽性は**0〜2件**と予測した。実測は**0/18（0%）**で予測範囲内だった。

慣例エンコード候補は実際に複数見つかった。S003は次turn FieldGrant、S012はlastProcessed固定、S015はEND_OF_ATTACK専用分岐、S017はGRANT_SIGNI_ABOVE_ABILITYである。しかし、いずれもliveがその慣例を使っていないため指摘を反証せず、「新機構なしで直せる」根拠になった。軸全58件でも偽陽性0であり、この軸のfindingはJSON表面の言い換え誤検出より、能力名・scope・付与先の実欠落へ集中していたと評価する。

## 6. 条件以外で見つけた原文との食い違い

**4 effect・7項目**。

- S002 `WX25-CP1-005-E1`：指摘の全体対象だけでなく、ownerがselfでなくany、シャドウの`levelGte:3` scopeも欠落。
- S005 `WXDi-P16-051-E2`：Sランサーの代替条件に加え、通常ランサーが「アト＝トレがいる場合」にしか付かない構造とエナ0代替の優先関係を1つの分岐へ組み直す必要がある。
- S011 `WX26-CP1-059-E1`：10枚条件の誤りに加え、CONTINUOUS SEQUENCE内のGRANT_KEYWORDを`collectContinuousGrantedKeywords`が直接収集しないため、シャドウ表示・判定自体が欠落し得る。効果分割が必要。
- S017 `WXDi-P11-051-E3`：付与先違いだけでなく、ON_ATTACK timing、引用能力化、任意でない対象1枚という能力構造がすべて直接TRANSFERへ潰れている。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測16.9秒）。

- typecheck PASS
- golden **2337 PASS / 0 FAIL**
- smoke **10693効果 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**（200ゲーム、7983手）
- census **773 / baseline 773**
- census:stubs **A群🔴0 / C群0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業前からのtracked M 2本 `scripts/archive/semanticAuditLedger.mjs` / `scripts/archive/semanticAuditMkBatchSingles.mjs`を維持し、`??`は既存の第8〜第21成果物、第22入力`stage1_batch22.txt`／`_index.md`、および今回新規の本報告書だけ。今回、計器2本を含む既存ファイルは変更していない。

`git diff --stat`は計器2本だけ（`semanticAuditLedger.mjs | 13 ++++++++++---`、`semanticAuditMkBatchSingles.mjs | 7 ++++++-`、計 **2 files changed, 16 insertions(+), 4 deletions(-)**）。いずれも作業前からの差分で、報告書はuntrackedのためstat対象外。

分類表は18行、根拠列は**18/18ユニーク（100%）**を機械測定した。報告書はUTF-8で、最終確認時に先頭20行・末尾20行を読み返した。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **25281 bytes**。

## 8. ガードレール2・3・4・6・7で当初の見立てから変えた件

- **S003（ガードレール2/7）**：ピース解決後の継続付与は機構待ちの可能性を見たが、`execGrantKeyword`のNEXT_TURN枝が`reserveFieldGrant`へ積み、後発シグニを`activeFieldGrantKeywordsForSigni`が評価する配線を確認したため、真バグのみへ確定した。先回りメモの「CONTINUOUSにしていないだけ」という大意は正しいが、実測の正準経路は場のカードを発生源にするCONTINUOUSではなく、ピース解決からplayer stateへ積むFieldGrant予約だった。
- **S005（ガードレール4/7）**：条件付き代替を第12バッチ／`O-37(a)`の置換機構と共有する可能性を検討したが、`ENERGY_COUNT eq 0`と`CONDITIONAL else`のconsumerを確認し、damage置換とは別の既存分岐で足りると変更した。
- **S010（ガードレール3/6）**：第10バッチのアサシン機構待ちを横展開せず`keywords.ts`を再確認し、今回は`powerLte`が存在して`isFrozen`とのANDも消費されるため、機構待ちを外した。先回りメモCNと実測は一致した。
- **S013（ガードレール4）**：levelとcolorの複合条件に新しい専用conditionが要る可能性を見たが、隣接する`ActiveCondition.AND`と両子consumerが既存だったため真バグのみとした。
- **S015（ガードレール2/4）**：`BlockActionAction`周辺を開いた結果、guard-card filterは無い一方で期間`END_OF_ATTACK`と専用executor分岐は存在したため、`O-41`へ誤合流させずduration単点の真バグとした。
- **S016（ガードレール2）**：相手に任意ミルを選ばせる機構待ちを疑ったが、`ChooseAction.opponentResponds`と分岐action実行が既存なので、TRASH／END_OF_ATTACK禁止の二択として既存語彙で表せると確定した。
- **S017（ガードレール4）**：一般`GRANT_FIELD_SIGNI_ABILITY`ではstack内の上カード限定に不足があると見たが、隣接型`GRANT_SIGNI_ABOVE_ABILITY`と`collectGrantedFromUnderSigni` Pattern Bを発見し、機構待ちを外した。
- **S018（ガードレール2/4）**：`TargetFilter.keyword`の型宣言だけで判断せず、`matchesFilter`のマルチエナ専用consumerを確認した。単一TRASH count2ではquotaを表せないが、能力枠を先に処理する2-step SEQUENCEでdistinctな計2枚にできるため機構待ちにはしなかった。

先回りメモと結論が食い違った件は0件。ただしS003は、メモが想定した「CONTINUOUSの場全体付与」そのものではなく、ピースから予約FieldGrantへ載せるのが実コード上の正準経路だったため、経路の精密化として上記に記録した。
