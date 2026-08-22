# clean群 round1 段1 batch9 triage

判定日: 2026-08-22。軸 `filter.story` の残り S001〜S049（49 findings / 45 effectId）を、原文、live JSON、action 固有 consumer と照合した。`真バグ＋機構待ち` は両方へ計上する。

## 1. サマリ

| action 型 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|
| GRANT_PROTECTION | 1 | 0 | 0 | 0 |
| LIFE_CRASH | 1 | 0 | 0 | 0 |
| LOOK_AND_REORDER | 1 | 0 | 0 | 0 |
| PLACE_UNDER_SIGNI | 1 | 0 | 0 | 0 |
| POWER_MODIFY_PER_FIELD | 1 | 0 | 0 | 0 |
| POWER_MODIFY | 8 | 0 | 2 | 0 |
| POWER_SET | 2 | 0 | 1 | 0 |
| REVEAL_AND_PICK | 1 | 0 | 0 | 0 |
| SEARCH | 4 | 0 | 0 | 0 |
| SEQUENCE(BANISH/SIGNI) | 4 | 0 | 1 | 0 |
| SEQUENCE(CONDITIONAL/HAS_CARD_IN_FIELD) | 4 | 0 | 0 | 0 |
| SEQUENCE(CONDITIONAL/THIS_CARD_IS_UP) | 0 | 1 | 0 | 0 |
| SEQUENCE(DRAW) | 1 | 0 | 1 | 0 |
| SEQUENCE(LOOK_AND_REORDER/UP) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEARCH/TRASH) | 0 | 1 | 0 | 0 |
| SEQUENCE(TRANSFER_TO_DECK/TRASH_CARD) | 4 | 0 | 2 | 0 |
| SEQUENCE(TRANSFER_TO_HAND/TRASH_CARD) | 1 | 0 | 1 | 0 |
| SEQUENCE(TRASH/DECK_CARD) | 3 | 0 | 2 | 0 |
| SEQUENCE(TRASH/SIGNI) | 1 | 0 | 0 | 0 |
| TAKE_FROM_UNDER_SIGNI | 1 | 0 | 0 | 0 |
| TRANSFER_TO_DECK | 1 | 0 | 0 | 0 |
| TRANSFER_TO_HAND | 2 | 0 | 0 | 0 |
| TRASH | 4 | 0 | 2 | 0 |
| **計** | **47** | **2** | **12** | **0** |

## 2. finding 全49件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠（live JSON と原文） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WX19-021-E1 | AUTO | 真バグ | live は `activeCondition=HAS_CARD_IN_FIELD(ウェポン)` 下の `GRANT_PROTECTION{subjectFilter.story:アーム,from:[ルリグ]}` だけで、原文の相手ターン中アーム+3000 action が無い。 | `calcFieldPowers`（CONTINUOUS `POWER_MODIFY`） | protection collector は耐性だけを収集しpower deltaを生成しない。 | 相手ターンの間、＋3000 |
| S002 | WX18-031-E1 | AUTO | 真バグ | live `ON_ATTACK_SIGNI→LIFE_CRASH{opponent,1}` は無条件。原文はself trashの鉱石・宝石SIGNI合計20枚以上が前提。 | `evalUseCondition(TRASH_HAS_CARD)`／`collectAttackerSelfTriggers` | attack timingはtrash在庫を暗黙検査しない。story配列OR＋`minCount:20`で既存評価可能。 | 合計２０枚以上ある場合 |
| S003 | WXDi-P11-047-E1 | AUTO | 真バグ | live `LOOK_AND_REORDER{count:3,destination:deck/bottom}` は3枚全部を下へ戻すだけで、原文の地獣SIGNI最大2枚をhost下へ移す段がない。 | `execLookAndReorder`／`PLACE_UNDER_SOURCE_SIGNI` | `canTrash:false`やprivate公開は下カード化を兼ねず、選択札をhost stackへ移さない。 | ＜地獣＞のシグニを２枚までこのシグニの下に置き |
| S004 | SP27-017-E1 | AUTO | 真バグ | live `PLACE_UNDER_SIGNI.filter{cardType:シグニ,story:天使}` にlevelがなく、原文はtrashのレベル4以下。 | `execPlaceUnderSigni`→`matchesFilter(level.max)` | source:`trash` は領域だけを絞り、level上限を補完しない。 | レベル４以下の＜天使＞ |
| S005 | WX25-P2-069-E1 | AUTO | 真バグ | live `countFilter.story:凶蟲` に `excludeSelf` がなくhost自身も数える。原文は「他の」。さらにtargetが`opponent,ALL`で、原文の「このシグニ」とも食い違う。 | `calcFieldPowers` の `POWER_MODIFY_PER_FIELD` | CONTINUOUSはUIへ行かずhostごと直接計算するが、`:2017`系は`mod.excludeSelf`が無ければhostも数える。 | 他の＜凶蟲＞ |
| S006 | WXK10-047-E1 | AUTO | 真バグ＋機構待ち | live CONTINUOUS `POWER_MODIFY{thisCardOnly,+4000}` に条件なし。原文はself energyで共通classを持つSIGNIが5種類以上の間だけ。 | 無し＝機構待ち（`evalUseCondition`へenergyのclass別distinct-name最大数を評価する条件を追加） | `ENERGY_COUNT_FILTER.distinctName`は全一致札の種類数で、「同じclassを共有する5種類」を保持しない。 | 共通するクラスを持つシグニが５種類以上あるかぎり |
| S007 | WX25-CP1-085-E1 | AUTO | 真バグ＋機構待ち | live attack-phase開始時に相手の黒いブルアカへ即時-1000。原文は先に任意の相手SIGNIを対象化し、このターンself黒ブルアカがattackした時にその固定対象を弱体化する遅延watcher。 | 無し＝機構待ち（`execInstallDelayedTrigger`へ設置時`storedTargetCards`を焼き込み、ON_ATTACK_SIGNI collectorからeffectへ復元） | `triggerFilter`は後のattackerを絞れるが、設置時に選んだ相手対象をdelayed triggerが保持しない。 | あなたの黒の＜ブルアカ＞のシグニ１体がアタックしたとき |
| S008 | WXDi-P05-084-E1 | AUTO | 真バグ | live costは`handDiscardSigni{原子,1}`のみ。原文には加えてself energyの原子SIGNI1枚をtrashへ置く支払いがある。 | `payCost`／`cost.energyTrash{count:1,filter:{story:原子,cardType:シグニ}}` | hand discardとenergy trashは別費目で、一方から他方は派生しない。 | エナゾーンから＜原子＞のシグニ１枚をトラッシュに置き |
| S009 | WX24-P3-080-E1 | AUTO | 真バグ | live `ON_TURN_END→POWER_MODIFY{thisCardOnly,+5000,UNTIL_OPP_TURN_END}` は無条件。原文はself energyに美巧SIGNIがある場合。 | `evalUseCondition(ENERGY_HAS_CARD)`／turn trigger collector | durationが次相手turn末まででも発動時のenergy条件は自動評価されない。 | エナゾーンに＜美巧＞のシグニがある場合 |
| S010 | WXDi-D02-20-E1 | AUTO | 真バグ | live CONTINUOUS +5000 に`activeCondition`なし。原文はself fieldのバーチャルSIGNI3体以上の間だけ。 | `checkActiveCondition(HAS_CARD_IN_FIELD,minCount:3)`／`calcFieldPowers` | `thisCardOnly`は適用先同定であり盤面の3体条件ではない。 | ＜バーチャル＞のシグニが３体以上あるかぎり |
| S011 | WX25-P3-068-E1 | AUTO | 真バグ | liveは`story:天使,excludeSelf:true,upToCount:true`の選択札だけ+4000し、原文の「それとこのシグニ」のhost側加算が欠落。 | `execSequence`／`execPowerModify(targetsStored)`＋source直接適用 | `excludeSelf:true`はhostを候補から外すだけで、選択後にhostへ同じdeltaを複製しない。 | それとこのシグニのパワーを＋4000 |
| S012 | WX25-P1-088-E1 | AUTO | 真バグ | live activeConditionは`TURN_OWNER:self`だけ。原文はさらにself field全SIGNIが互いに共通classを持たないことを要求。 | `evalUseCondition(FIELD_SIGNI_ALL_DISTINCT_CLASS)`／`calcFieldPowers` | 自分turn条件とclass相互制約は独立で、前者だけでは後者を満たさない。 | すべてのシグニがそれぞれ共通するクラスを持たないかぎり |
| S013 | WX05-044-E1 | AUTO | 真バグ | live costは`down_self:true`だけで、原文の他の古代兵器SIGNI1体をbanishする支払いがない。 | `execSequence`→`execBanish`／did-it conditional | down支払いは別カードのbanishを暗黙実行せず、`excludeSelf`とstoryを持つBANISH段が必要。 | 他の＜古代兵器＞のシグニ１体をバニッシュする |
| S014 | WX09-Re08-E1 | AUTO | 真バグ | live CONTINUOUS `POWER_SET{self,count:1,value:10000}` に条件なし。原文はself fieldにlevel4タマがいる間。 | `checkActiveCondition(HAS_CARD_IN_FIELD)`／`calcFieldPowers:1849` | targetに`thisCardOnly`が無くてもCONTINUOUS count≠ALLはhostへ直適用されるが、タマ存在条件までは補わない。 | レベル４の＜タマ＞がいるかぎり |
| S015 | WXDi-CP01-031-E1 | AUTO | 真バグ＋機構待ち | live attack-phase開始時に無条件`POWER_SET{35000}`。原文はself fieldとenergyを合わせた世怜音女学院SIGNIが5種類ある場合。 | 無し＝機構待ち（`evalUseCondition`へfield+energy unionのfilter一致distinct-name数を渡す条件を配線） | `HAS_CARD_IN_FIELD`と`ENERGY_COUNT_FILTER`をANDしても各zone別に5を要求し、合計5種類を表せない。source自動適用は対象だけを救う。 | 場とエナゾーンに＜世怜音女学院＞のシグニが合計５種類ある場合 |
| S016 | WX18-073-E2 | AUTO | 真バグ | live `REVEAL_AND_PICK`のpickedへの`then`は`ENERGY_CHARGE_FROM_DECK`だけで、原文の公開した英知SIGNIを手札へ移すactionが無い。 | `execRevealAndPick`→SEARCH再開／`applyDirectAction` | pickedへthenを適用する慣例はあるが、EC actionはpickedを手札へ移さずdeck topをenergyへ置く。 | それを手札に加え |
| S017 | WX10-001-E3 | AUTO | 真バグ | live SEARCHは`story:[アーム,ウェポン],maxCount:1`でOR集合から合計1枚。原文は各1枚、計2枚を場へ出す。 | `execSearch`／2段SEARCH→`PLACE_SIGNI_ON_FIELD` | story配列はOR条件であり各class quotaではない。 | ＜アーム＞と＜ウェポン＞のシグニを１枚ずつ |
| S018 | WX02-050-E1 | AUTO | 真バグ | live `story:[アーム,天使],maxCount:1`はどちらか1枚だけ。原文はアーム1枚と天使1枚を公開し手札へ加える。 | `execSearch`／class別SEARCH＋`ADD_TO_HAND` | `selectionConstraint`にもclass別1枚ずつの割当はなく、maxCount 1を2へ変えるだけなら同class2枚を許す。既存SEARCHをclass別に連鎖できる。 | ＜アーム＞のシグニ１枚と＜天使＞のシグニ１枚 |
| S019 | WXK09-049-E1 | AUTO | 真バグ | live search filterは`story:電機`に加え`cardName:改造素材`を要求。原文の改造素材は使用イベントで、探索札は任意の電機SIGNI。 | `execSearch`→`matchesFilter` | `triggerCondition.materialUsedByPlayer:true`がイベント側を既に限定し、同名条件をsearch候補へ重ねる慣例はない。 | ＜電機＞のシグニ１枚を探してエナゾーンに置き |
| S020 | WX13-049-BURST | AUTO | 真バグ | live filterは`cardType:シグニ,story:原子`だけで、原文のOR候補「スペル1枚」がない。 | `execSearch`→`matchesFilter(anyOf)` | story配列はclass ORでありcardTypeの異なるスペルを含めない。`anyOf` consumerは実装済み。 | ＜原子＞のシグニ１枚かスペル１枚 |
| S021 | WX14-031-E3 | AUTO | 真バグ | live第1段BANISHは`owner:opponent,story:天使,excludeSelf:true`。原文の支払い対象はself fieldの他の天使1体。 | `execBanish`／`execSequence` | 後段の相手POWER_MODIFY対象からownerを継承する慣例はなく、第1段ownerはそのまま候補側を決める。 | あなたの他の＜天使＞のシグニ１体をバニッシュする |
| S022 | WXEX2-70-E1 | AUTO | 真バグ | live optional BANISHは相手のlevel3以下かつ遊具を対象にするが、原文は事前対象が相手level3以下、任意banishはselfの他の遊具。 | `SELECT_TARGET_ONLY`／`execBanish` | 1つのBANISH targetに事前対象と支払い対象を合成する慣例はない。 | あなたの他の＜遊具＞のシグニ１体をバニッシュしてもよい |
| S023 | WXEX2-70-E1 | AUTO | 真バグ | live後段は`ENERGY_CHARGE{DECK_CARD,self,1}`。原文はS022より前に対象化した相手SIGNI「それ」をenergyへ送る。 | `execSendToEnergy(targetsStored)`／`STORE_LAST_PROCESSED_TARGETS` | ENERGY_CHARGEはdeck topを動かし、相手fieldの固定対象を参照しない。 | そうした場合、それをエナゾーンに置く |
| S024 | WX09-045-E1 | AUTO | 真バグ＋機構待ち | liveはpower≤8000 BANISH後、相手の赤かつpower≤15000をもう1体BANISH。原文はself field赤3体が共通classを持つ場合だけ15000枝へ置換し、elseで8000枝。 | 無し＝機構待ち（`evalUseCondition`へfield filter一致札のclass別最大共有数を追加しCHOOSE/CONDITIONAL分岐へ配線） | 第2targetの`color:赤`は相手対象の色で、条件主語self fieldを代用しない。2 action連続は「代わりに」でもない。 | あなたの場に赤のシグニが３体あり、それらが共通するクラスを持つ場合、代わりに |
| S025 | WX22-002-E2 | AUTO | 真バグ | live 5段中黒枝`TRANSFER_TO_HAND`は無条件。原文はself fieldに黒の天使がある場合だけtrash SIGNI1枚を回収。 | `evalCondition(HAS_CARD_IN_FIELD)`／`execSequence` | 先頭白枝のCONDITIONALは後続4段を包まず、条件を横展開しない。 | 黒の＜天使＞がある場合 |
| S026 | WX22-002-E2 | AUTO | 真バグ | live第3段`TRASH{opponent HAND_CARD,1}`にconditionなし。原文はself fieldの青天使存在時だけ相手が1枚discard。 | `evalCondition(HAS_CARD_IN_FIELD)`／`execTrash` | TRASHはdid-it対象9型に含まれず、そもそも前置条件を自動生成しない。 | 青の＜天使＞がある場合 |
| S027 | WX22-002-E2 | AUTO | 真バグ | live第2段BANISH targetへ`color:赤,story:天使`を付け、条件なしで相手赤天使だけをbanish。原文はself field赤天使存在を条件に任意の相手SIGNIを対象。 | `evalCondition(HAS_CARD_IN_FIELD)`／`execBanish` | target filterは相手候補を絞るため、self盤面条件と主語が逆。 | 赤の＜天使＞がある場合 |
| S028 | WX22-002-E2 | AUTO | 真バグ | live第4段`ENERGY_CHARGE_FROM_DECK{self,1}`は無条件。原文はself fieldに緑天使がある場合だけ。 | `evalCondition(HAS_CARD_IN_FIELD)`／`execEnergyChargeFromDeck` | EC actionはfield色/classを暗黙検査せず、白枝のconditionも兄弟stepへ届かない。 | 緑の＜天使＞がある場合 |
| S029 | WXDi-CP01-045-E1 | AUTO | 偽陽性 | live後段`TRASHED_STORY_COUNT_GTE{story:バーチャル,count:2}`はzone全体ではなく直前処理`ctx.lastProcessedCards`だけを数える（`execUtils.ts:2275-2280`）。前段が実行された時はdeck top2枚だけが母集団。 | `evalCondition(TRASHED_STORY_COUNT_GTE)` | 該当なし。別件として前段THIS_CARD_IS_UP不成立時に古い`lastProcessedCards`が残り得るかは§6へ分離。 | この方法で＜バーチャル＞のシグニ２枚がトラッシュに置かれた場合 |
| S030 | WX09-049-E1 | AUTO | 真バグ＋機構待ち | liveはDRAW4→DRAW3を連続実行し計7枚。原文はself field青SIGNI3体が共通classなら4、そうでなければ3の排他分岐。 | 無し＝機構待ち（S024と同じfield共有class条件を`CONDITIONAL{then:DRAW4,else:DRAW3}`へ配線） | DRAWは常に成功しlastProcessedを記録しないためdid-it gate対象外。連続DRAWをif/elseとは解釈しない。 | 共通するクラスを持つ場合、カードを４枚引く。そうでない場合、カードを３枚引く |
| S031 | WXK05-051-E1 | AUTO | 真バグ | liveは公開相当`LOOK_AND_REORDER count:3`後に無条件UP。原文は直前3枚が全て植物SIGNIかつ名前が相異なる場合だけhostをUP。 | `evalCondition(LAST_PROCESSED_MATCHES{filter:植物,distinctName:true,value:3})`／`execUp` | `selectionConstraint`は選択集合を拘束する語彙で公開済み3枚の事後判定には不適。既存LAST_PROCESSED条件なら用途が一致する。 | それらがそれぞれ名前の異なる＜植物＞のシグニの場合 |
| S032 | WXEX1-03-E1 | PARTIAL | 偽陽性 | SEARCH再開はpicked全件をloopし、各instanceIdへ`thenAction`を個別適用する（`effectExecutor.ts:8598-8614`）。`applyDirectAction(TRASH,DECK_CARD)`は渡された1枚をdeckからtrashへ移す（`:9262-9274`）ため、`count:1`×選択7枚で原文どおり7枚。 | `resumeSearch`／`applyDirectAction(TRASH)` | deck-placement順序特例は本件に非該当だが、通常SEARCHの「pickedごとにthen」慣例が段0指摘を反証する。 | ＜天使＞のシグニ７枚を探してトラッシュに置き |
| S033 | WXK09-090-E1 | AUTO | 真バグ＋機構待ち | liveは美巧7枚をdeckへ戻した後`ADD_TO_FIELD`するが、原文でその前に別の美巧1枚を対象として保持する段が無く、場出し札を特定できない。 | 無し＝機構待ち（第8バッチ§4 S021と同一の「事前対象を後段ADD_TO_FIELDへ固定」機構。`execAddToField`へstored target sourceを配線） | `lastProcessedCards`は直前にdeckへ移した7枚へ上書きされ、事前対象の代用にならない。 | ＜美巧＞のシグニ１枚を対象とし |
| S034 | WX12-Re02-E1 | AUTO | 真バグ | live第1段`TRANSFER_TO_DECK.source.count:1`で、原文はtrash原子SIGNIを0〜任意枚、かつ名前が異なる集合として選ぶ。 | `execTransferToDeck`→`selectOrInteract(count:'ALL',upToCount:true,selectionConstraint.distinct:name)` | 数値1は好きな数の略記でなく選択上限1。既存ALL+upToCount慣例で本findingは表現可能。 | 好きな数対象とし |
| S035 | WX25-CP1-047-E1 | AUTO | 真バグ | live transfer filterは`story:ブルアカ`だけ。原文はtrashの黒いブルアカSIGNI最大3枚。 | `execTransferToDeck`→`matchesFilter(color)` | `triggerFilter.story:ブルアカ`はattackした他の自軍SIGNIを絞り、trash候補のcolorを補わない。 | 黒の＜ブルアカ＞のシグニ |
| S036 | PR-322-E1 | AUTO | 真バグ＋機構待ち | liveはtrashの無条件SIGNI1枚をdeck下へ置く。原文は黒天使1枚と黒古代兵器1枚の双方を揃えて移す。 | 無し＝機構待ち（`execTransferToDeck`へ`transferGroups`相当の同一移動元group選択と、両group成功をdid-it記録する配線） | 2本のTRANSFERを単純連鎖すると片groupだけ成功でも末尾did-itが成立し得る。`selectionConstraint`はclass別quotaを表さない。 | 黒の＜天使＞のシグニ１枚と黒の＜古代兵器＞のシグニ１枚 |
| S037 | WX09-057-E1 | AUTO | 真バグ＋機構待ち | liveは黒SIGNIをtrashから2回無条件回収。原文の追加1枚はself fieldに黒SIGNI3体があり共通classを共有する場合だけ。 | 無し＝機構待ち（S024/S030と同じfield共有class条件を第2`TRANSFER_TO_HAND`のCONDITIONALへ配線） | 1回目回収の成功や黒filterは盤面3体のclass交差を証明しない。 | 場に黒のシグニが３体あり、それらが共通するクラスを持つ場合 |
| S038 | WX08-036-E2 | AUTO | 真バグ＋機構待ち | liveはdeck top5枚trash後、対象側へ`story:[鉱石,宝石]`を誤付着しlevel条件なし。原文はこの5枚中の鉱石・宝石SIGNI数以下のlevelを持つ任意SIGNI。 | 無し＝機構待ち（第8バッチ§4 S009の動的level上限ファミリ。`resolveDynamicFilter`へ`levelLteLastProcessedCount(filter)`を追加し`execBanish`へ配線） | 既存`levelEqLastProcessedCount`は等しいlevelだけで「以下」にならず、対象story ORは基準集合を対象へ誤適用する。 | 合わせた枚数以下のレベル |
| S039 | WD08-008-E1 | PARTIAL | 真バグ＋機構待ち | live条件`LAST_PROCESSED_MATCHES{shareClass:true,gte:3}`は成立数だけ返し、後段TRANSFER filterは素のSIGNI。原文は勝ったclassを選び、そのclassだけ最大2枚回収。 | 無し＝機構待ち（`evalCondition`のshareClass集計で候補classをctx/stateへ保存し、`resolveDynamicFilter`→`execTransferToHand`で選択classをstoryへ解決） | `execUtils.ts:2379-2387`は`Math.max(counts.values())`だけを保持しclass名を捨てる。 | 選択したクラスを持つシグニを２枚まで |
| S040 | WXK03-074-E1 | AUTO | 真バグ | live dynamic `levelEqLastProcessedCount{story:武勇}`自体は正しいが、同時に対象filterへ`story:武勇`を付ける。原文の相手対象はlevel一致だけでclass不問。 | `resolveDynamicFilter(levelEqLastProcessedCount)`→`execBanish` | 動的キーは直前5枚中の武勇数をlevelへ解決するため、対象storyを残す必要はない。 | 同じレベルを持つ対戦相手のシグニ |
| S041 | WXEX1-14-E2 | AUTO | 真バグ | live第1段は相手fieldの植物SIGNI1体をtrash。原文はself energyの植物SIGNI3枚を支払い、成功時に事前対象の相手SIGNIをenergyへ送る。 | `execTrash(ENERGY_CARD)`／`SEND_TO_ENERGY(targetsStored)` | TRASHのdid-it一般集合に無いがself ENERGY_CARDには専用空振りskipがある。相手field1体をself energy3枚の代用にはできない。 | エナゾーンから＜植物＞のシグニ３枚をトラッシュに置く |
| S042 | WXK08-050-E2 | AUTO | 真バグ | live CONTINUOUS actionは`TAKE_FROM_UNDER_SIGNI`を即時実行する形。原文はこのカードの上にあるウェポンSIGNIへ黒2・turn1回の起動能力を付与する宣言。 | `GRANT_SIGNI_ABOVE_ABILITY` collector／付与childの`execTakeFromUnderSigni` | TAKE executorはCONTINUOUS能力付与へ変換せず、cost/usageLimitも生成しない。既存above-ability語彙が用途に一致する。 | このカードの上にある＜ウェポン＞のシグニは…を得る |
| S043 | WXK10-073-E2 | AUTO | 真バグ | live transfer source filterは`story:英知`のみ。原文はさらにlevel3以下。 | `execTransferToDeck`→`matchesFilter(level.max)` | upToCount:trueは0〜1枚の任意性だけでlevelを絞らない。 | レベル３以下の＜英知＞ |
| S044 | WXEX2-34-E3 | AUTO | 真バグ | live trash鉱石2枚回収に`selectionConstraint`なし。同level2枚も選べるが原文はlevel相異。 | `execTransferToHand`→`selectOrInteract(selectionConstraint.distinct:level)` | storyは個々の鉱石条件で、2候補間のlevel関係を評価しない。 | レベルの異なる＜鉱石＞のシグニ２枚 |
| S045 | WXK10-038-E1 | AUTO | 真バグ | live回収filterは`hasIcon:ライズ`のみ。原文はcostで捨てたSIGNIと共通classも必要。 | `resolveDiscardLevelFilter(classMatchesDiscardSigni)`→`execTransferToHand` | `last_discarded_signi_class`は支払い時に記録されるが、filter flag無しでは回収候補へ適用されない。 | この方法で捨てたシグニと共通するクラスを持ち |
| S046 | WX25-CP1-042-E2 | AUTO | 真バグ＋機構待ち | live LRIG attack-step開始時に相手hand固定1枚trash。原文は今turnにself青ブルアカSIGNIがcrashした相手life枚数ぶん。 | 無し＝機構待ち（`life_crashed_by_signi_this_turn`をcardMapの青/ブルアカで集計し、TRASH countへ解決するNumberOrRef/consumerを追加） | `life_crashed_this_turn`は全原因合計、`ON_SIGNI_CRASHED_LIFE_TOTAL`は当該SIGNI自身のtriggerで、LRIG-step時のfiltered合計を返さない。 | 青の＜ブルアカ＞のシグニがクラッシュした対戦相手のライフクロス１枚につき |
| S047 | WX10-052-E3 | AUTO | 真バグ＋機構待ち | live cost `handDiscardSigni{count:4,story:精元}` は名前相互制約なし。同名4枚を払えるが原文は各名が異なる。 | 無し＝機構待ち（`CostSpec.handDiscardSigni`へ`selectionConstraint`を追加し`canPayCost`と支払いSELECT_TARGETへ配線） | action側SelectionConstraintは支払カード集合を拘束せず、現型の`handDiscardSigni`にはconstraint fieldがない。 | それぞれ名前の異なる＜精元＞のシグニを４枚捨てる |
| S048 | WXDi-P09-060-E1 | AUTO | 真バグ | live `ON_BANISH`に`triggerFilter`なしで、どの自軍banishでも相手energy1枚をtrash。原文主語はselfのpower10000以上かつ地獣SIGNI。 | `collectBanishTriggers`→`matchesFilter(triggerFilter,effectivePower)` | collectorは被banish札へeffective powerを渡せるが、filter無しならclass/powerを検査しない。 | パワー10000以上の＜地獣＞のシグニ１体がバニッシュされたとき |
| S049 | WXK04-090-E1 | AUTO | 真バグ | liveはself fieldの水獣SIGNI1体を無条件trash。原文はhandの水獣SIGNI1枚を公開する選択肢があり、公開しない場合だけhost自身をtrash。 | `CHOOSE`／`REVEAL{HAND_CARD}`／`execTrash(thisCardOnly)` | TRASH SIGNIにはsource自動適用慣例がなく、現filterは別の水獣も選べる。公開action・else分岐は自動補完されない。 | 手札から＜水獣＞のシグニを１枚公開しないかぎり、このシグニを場からトラッシュに置く |

## 3. action 型ごとの所見

- **パワー系11件**: 全件真バグ。S014/S015の`POWER_SET`はsource自動適用、S005のCONTINUOUS per-fieldはhost直接計算を確認したうえで、対象同定ではなく条件・count・別actionの欠落を判定した。S006/S007/S015だけは履歴・複数zone・遅延対象保持が不足し機構待ち。
- **SEARCH 4件**: S017/S018はOR filterを「各1枚」に誤読、S019はtrigger名をcandidate名へ誤付着、S020はcardTypeを跨ぐOR欠落。deck-placement順序特例は4件ともfindingを反証しない。
- **SEQUENCE 21件**: 型名では束ねず全stepsを展開した。S029はlastProcessed限定条件、S032はpickedごとのthen適用により偽陽性。他19件は条件分岐、対象保持、group選択、動的閾値のいずれかが実際に欠ける。
- **TRASH 4件**: S046は履歴由来の動的枚数、S047はcost集合制約、S048はbanish trigger主語、S049は公開/不公開choiceで構造が別。`TRASH`がdid-it 9型に無い事実はS026等で確認したが、分類を一括しなかった。
- **WX22-002-E2 (S025〜S028)**: 4 findingsは「parserが先頭の白分岐だけCONDITIONAL化し、後続4分岐を平坦化した」1つの真因。赤だけ条件名詞句をtargetへ誤付着し、青・緑・黒はconditionごと脱落した。第8バッチS006/S007と同型で束ねられる。
- **WXEX2-70-E1 (S022/S023)**: 「相手対象を先に保存→self遊具を任意banish→成功時に保存対象をenergyへ」の三段構造を、相手遊具BANISH→deck ECへ潰した1つの真因。findingは誤付着元と誤った後段という2側面。

## 4. 機構待ち一覧

| effectId / finding | 不足語彙・機構・配線 |
|---|---|
| WXK10-047-E1 / S006 | energy内filter一致SIGNIをclassごとに集計し、同一classを共有するdistinct card name数の最大値を条件比較する`evalUseCondition`分岐。 |
| WX25-CP1-085-E1 / S007 | `SELECT_TARGET_ONLY`の`storedTargetCards`を`INSTALL_DELAYED_TRIGGER`設置データへ焼き込み、発火effectの`POWER_MODIFY.targetsStored`へ復元する配線。 |
| WXDi-CP01-031-E1 / S015 | field+energyを単一集合にしてfilter一致のdistinct card name数を数える複数zone condition。**PARTIALではないため通常build経路**。 |
| WX09-045-E1 / S024、WX09-049-E1 / S030、WX09-057-E1 / S037 | fieldの指定owner/filter一致SIGNIについてclass別共有数の最大を閾値比較する汎用condition。3件で同一機構。 |
| WXK09-090-E1 / S033 | **第8バッチ§4 S021と同一機構**＝事前対象を別処理後の`ADD_TO_FIELD` sourceへ固定するstored-target配線。二重登録しない。 |
| PR-322-E1 / S036 | `TRANSFER_TO_DECK`の同一sourceから異なるfilter groupを各必須枚数選び、全group成功を1つのdid-it結果として保持する配線。 |
| WX08-036-E2 / S038 | **第8バッチ§4 S009の「field枚数→level上限」と同じ動的level上限ファミリ**。今回は`lastProcessedCards`のfilter一致数を`level.max`へ解決する`levelLteLastProcessedCount`分岐。別機構として二重登録しない。 |
| WD08-008-E1 / S039 | `LAST_PROCESSED_MATCHES.shareClass`で勝ったclass名をctx/stateへ載せ、後段filterへ渡す配線。`execUtils.ts:2379-2387`のcounts最大値計算箇所でclassも保存し、`resolveDynamicFilter`から`execTransferToHand`へ渡す。**PARTIALのため実装後は`npx tsx scripts/syncManualLive.ts WD08-008`経路が必要**。 |
| WX25-CP1-042-E2 / S046 | `life_crashed_by_signi_this_turn`をsource cardのcolor/storyで絞って合計し、TRASHの動的countへ渡す配線。 |
| WX10-052-E3 / S047 | `handDiscardSigni.selectionConstraint`を型、`canPayCost`、支払選択の3地点で消費する配線。 |

`WXEX1-03-E1` (S032) は偽陽性なので機構待ちではない。ただし将来このPARTIAL効果を変更する場合は、`build:effects`だけではliveへ届かず **`npx tsx scripts/syncManualLive.ts WXEX1-03`** が必要。S039も同じPARTIAL不可侵経路である。

## 5. 偽陽性件数についての自己評価

偽陽性は **2/49 = 4.1%**、precision換算95.9%。段1通算21.2%、第8バッチ2.5%よりは1.6ポイント上がったが、依然として通算値から大きく低い。

前回の仮説「単発か否かより、action固有executorを持つ語彙の比率が偽陽性率を左右する」は、今回の実測では**弱くしか支持されず、強い形では反証された**。確かに2件の偽陽性はいずれも固有consumer（S029のlastProcessed限定condition、S032のSEARCH picked個別then）から出ており、第8バッチより率は上がった。しかしSEQUENCE 21件・パワー系11件という固有consumerの塊でも偽陽性は2件だけで、期待した通算21.2%近傍までは上がらなかった。固有executorの「存在数」ではなく、段0指摘がそのexecutorの非自明な慣例（個別反復・履歴限定）へ実際に衝突する割合が説明力を持つ、と仮説を修正する。

## 6. 条件以外で見つけた原文との食い違い

**8 effect・10項目**。

- `WX25-P2-069-E1`: findingのexcludeSelf欠落に加え、live targetが`owner:opponent,count:ALL`で原文の「このシグニ」ではない。durationもlive外側`UNTIL_END_OF_TURN`とaction内の次相手turn末指定を段2で確認する。
- `WX25-CP1-085-E1`: 後の黒ブルアカattackは1回限定と書かれていないため、選んだ対象へ該当attackのたび-1000する期間watcherである。設置時trigger自身の《ターン1回》と遅延watcherのonceを混同しない。
- `WX18-073-E2`: 手札へ加えた後に「デッキの一番上」をenergyへ置く。picked札をenergyへ送る形に直してはいけない。
- `WXEX2-70-E1`: 事前対象は相手level3以下SIGNI。S022のowner/storyだけ直してこのlevel条件をself遊具のbanish側へ残してはいけない。
- `WX12-Re02-E1`: S034の任意枚数に加え、後段は相手SIGNIを「level合計が移動枚数以下」になる好きな数だけ選ぶ集合制約であり、現liveの単体BANISHは別途退化している。
- `PR-322-E1`: 2枚を好きな順でdeck bottomへ置く順序選択と、先に対象化した相手SIGNIの同一性保持も必要。単にcount2/filter ORへ直すだけでは同class2枚を許す。
- `WXDi-CP01-045-E1`: findingは偽陽性だが、前段`THIS_CARD_IS_UP`不成立時にSEQUENCEが古い`lastProcessedCards`をclearせず、後段条件が以前の処理を読む可能性がある。段2では不成立盤面E2Eで確認する。
- `WXK05-051-E1`: 最終文は公開3枚をshuffleしてdeck bottomへ置く。live末尾`LOOK_AND_REORDER{count:0}`が直前公開snapshotを消費する慣例かを段2でE2E確認する。
- `WXEX1-03-E1`: 原文は「7枚トラッシュに置いた場合」にだけ事前対象をtrashへ置く。SEARCH個別TRASHは正しいが、7枚未達時の`LAST_PROCESSED_COUNT_GTE`がpicked全件を保持するか（loopでlastProcessedを上書きしないか）を段2で確認する。
- `WXK04-090-E1`: trash対象は任意のself水獣ではなくhost自身。公開可能なのに公開しない選択も許す必要がある。

## 7. ゲート・差分・成果物確認

`npm run gates` は全緑（実測）:

- typecheck PASS
- golden **2337 PASS / 0 FAIL**
- smoke **10693効果 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / ベースライン 773**
- census:stubs **A群🔴 0 / C群 0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git diff --stat` は作業開始前からMと指定された計器2本だけ（`semanticAuditLedger.mjs` 7行、`semanticAuditMkBatchSingles.mjs` 5行、計9 insertions / 3 deletions）。本作業では両ファイルに触れていない。

`git status --short` は上記M 2本、本報告書の`??`に加え、作業開始時点から存在した入力成果物 `stage1_batch8_triage.md` / `stage1_batch9.txt` / `stage1_batch9_index.md` も`??`だった。したがって指示記載の「??は報告書1本だけ」と実worktreeは開始時点から一致していないが、本作業が新規作成したのは本報告書1本だけで、既存tracked変更は0。

報告書はUTF-8で先頭20行・末尾20行を読み返した。最終 `wc -c` 相当（PowerShell `Get-Item.Length`）は **34,942 bytes**。

## 8. ガードレール2・3・6・7で当初の見立てから変えた件

- S005: action固有のCONTINUOUS直適用を確認し「単体targetだからUI選択」という根拠を撤回。真バグ根拠を`excludeSelf`欠落と相手ALL targetへ限定した。
- S014/S015: `POWER_SET`のsource自動適用でtarget表面上の`thisCardOnly`欠落は救われるため、条件欠落だけを真バグとした。S015はcross-zone distinct種類条件のconsumer不在により機構待ちへ変更。
- S016: REVEAL_AND_PICKのpicked個別then慣例を検討したが、thenがADD_TO_HANDでなくECなので選択札回収を救わないと確認し真バグを維持した。
- S029: `TRASHED_STORY_COUNT_GTE`をtrash zone全体条件と見て真バグ候補だったが、`execUtils.ts:2275`が`lastProcessedCards`だけを数えるため偽陽性へ変更。
- S031: `selectionConstraint.distinct:name`流用案を撤回。これは選択時制約で、公開3枚の事後判定には`LAST_PROCESSED_MATCHES`が正しいためparser真バグに留めた。
- S032: 指示の論点どおりcountを追った結果、SEARCH再開がpicked7枚それぞれへ`TRASH count:1`を適用する実装を確認し偽陽性へ変更。deck-placement順序特例ではなく通常SEARCHの別慣例だった。
- S038: 既存`levelEqLastProcessedCount`で足りる見立てを、原文が「以下」でconsumerが等値しか生成しないため撤回。第8バッチ§4の動的level上限ファミリへ統合した。
- S039: 先回りメモLと一致。`shareClass`は勝ったclass名を保持せず、`execUtils.ts:2379-2387`から後段へ新配線が必要と確認した。
- 先回りメモJ/J'/K/M/N/O/Pは引用箇所と実測が一致した。食い違いは0件。KについてS032は順序特例ではなくpicked個別thenという別の実装事実が判定を反転させた。
