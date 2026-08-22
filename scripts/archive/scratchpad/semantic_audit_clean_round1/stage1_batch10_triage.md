# 意味照合監査 clean群 round1 段1 第10バッチ triage（軸「キーワード能力」）

## 1. サマリ

分類は finding 単位（40 findings / 39 effectId）。`真バグ＋機構待ち` は真バグ・機構待ちの両方へ計上する。

| action型 | 件数 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 1 | 1 | 0 | 1 | 0 |
| BLOCK_ACTION | 1 | 1 | 0 | 1 | 0 |
| CHOOSE | 2 | 2 | 0 | 0 | 0 |
| CONDITIONAL | 1 | 1 | 0 | 0 | 0 |
| DRAW | 1 | 1 | 0 | 1 | 0 |
| GRANT_FIELD_SIGNI_ABILITY | 1 | 1 | 0 | 0 | 0 |
| GRANT_KEYWORD | 26 | 26 | 0 | 7 | 0 |
| GRANT_LRIG_ABILITY | 2 | 2 | 0 | 0 | 0 |
| GRANT_PROTECTION | 1 | 1 | 0 | 0 | 0 |
| POWER_MODIFY | 2 | 2 | 0 | 1 | 0 |
| REVEAL_AND_PICK | 1 | 1 | 0 | 0 | 0 |
| SEARCH | 1 | 1 | 0 | 1 | 0 |
| **計** | **40** | **40** | **0** | **12** | **0** |

### GRANT_KEYWORD 26件のキーワード別内訳

複数キーワードが原文にある finding は、live の主 action（欠落比較の起点）で排他的に数えた。

| 種別 | 件数 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| アサシン | 9 | 9 | 0 | 2 | 0 |
| シャドウ | 9 | 9 | 0 | 1 | 0 |
| ランサー | 4 | 4 | 0 | 3 | 0 |
| Ｓランサー | 2 | 2 | 0 | 0 | 0 |
| ダブルクラッシュ | 2 | 2 | 0 | 1 | 0 |
| その他 | 0 | 0 | 0 | 0 | 0 |

## 2. finding 全40件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WDK05-T09-E1-G | AUTO | 真バグ＋機構待ち | 対象effectはliveに存在せず、原文の付与【起】「レベル1のシグニでガードできない」自体が欠落。仮に現行`BLOCK_ACTION`を生成しても型にはlevel限定がない。 | 無し＝機構待ち（`BlockActionAction`へguard-card filterを追加しガード宣言可否判定へ配線） | parentや付与ストア内の暗黙効果も検索したが`WDK05-T09-E1-G`はlive無。PLAN §6.4 O-41の名指し対象。 | レベル１のシグニで【ガード】ができない |
| S002 | WX18-039-E1 | AUTO | 真バグ＋機構待ち | liveは`BLOCK_ACTION{actionId:'GUARD',target:PLAYER opponent}`だけでlevel 2/3限定を持たず、全ガードを永久禁止する。 | 無し＝機構待ち（`BlockActionAction`とガードUI/可否判定へfilter配線） | `until:'END_OF_TURN'`はCONTINUOUS再評価の慣例たり得るが、カードlevel限定を復元しない。PLAN O-41と同一。 | レベル２とレベル３のシグニで【ガード】ができない |
| S003 | WXDi-P15-052-E1 | AUTO | 真バグ | choice②のliveは`GAIN_COIN{count:1}`で、原文の支払済み3枚条件も`Sランサー`付与もない。既存`COINS_PAID_THIS_TURN{gte,3}`をchoice conditionにできる。 | `evalCondition(COINS_PAID_THIS_TURN)`→`execChoose`→`execGrantKeyword` | `GAIN_COIN`を支払履歴の符号化とはみなせない。consumerは`coins_paid_this_turn`を読む。 | 合計３枚以上支払っていた場合、…【Ｓランサー】を得る |
| S004 | WXDi-P12-050-E2 | AUTO | 真バグ | choice②は正しく`シャドウ:{"cardType":"シグニ"}`を付与するがcondition不在。原文はself hand−opponent handが3以上のときだけ。 | `evalCondition(HAND_DIFF)`→`execChoose` | `HAND_COUNT`の単独閾値ではなく、既存`HAND_DIFF{operator:'gte',value:3}`が差分と向きを直接評価する。 | あなたの手札が対戦相手より３枚以上多い場合 |
| S005 | WX25-CP1-090-E1 | AUTO | 真バグ | liveのthenはplain`keyword:'アサシン'`。原文の正面シグニpower 5000以下は`アサシン:{"powerLte":5000}`に符号化可能。 | `hasApplicableAssassin`／`decodeAssassinKeyword` | 括弧条件はtarget filterではない。`ASSASSIN_PREFIX`のscope consumerを確認。 | アサシン（パワー5000以下のシグニ） |
| S006 | WX07-042-E1 | AUTO | 真バグ＋機構待ち | liveは無条件`ON_OPP_LIFE_CRASHED`の`DRAW 1`。collectorはcrash source cardの通常filterだけを見て、クラッシュ原因がランサーかを受け取らない。 | 無し＝機構待ち（`collectOppLifeCrashedTriggers`および`BattleScreen`の同collectorへcrash cause keywordを配線） | timing名は原因を表さず、効果・通常アタック等も同じチェックゾーン経路へ集約される。 | 【ランサー】によって対戦相手のライフクロスをクラッシュしたとき |
| S007 | WXDi-P11-054-E2 | AUTO | 真バグ | live外側`GRANT_FIELD_SIGNI_ABILITY`にactiveConditionがなく、trash白カード15枚未満でも内側能力を付与する。既存`TRASH_HAS_CARD{color:'白',minCount:15}`を外側で評価可能。 | `collectFieldSigniGrantedAbilities`／`checkActiveCondition(TRASH_HAS_CARD)` | 内側`TURN_OWNER opponent`は相手ターン条件だけで、外側のtrash条件を兼ねない。 | トラッシュに白のカードが１５枚以上あるかぎり |
| S008 | WXK10-027-E1 | AUTO | 真バグ | liveはplain`ランサー`をself SIGNI count1へ恒常付与。原文はランサー所持・緑・power15000以上の自分の全シグニへ上位`Sランサー`。 | `normalizeGrantKeywordSpelling`→`collectContinuousGrantedKeywords`／`hasKeyword` | 全角Ｓは後処理で半角`Sランサー`へ正準化済み。source自動付与はcount1を全対象へ広げず、誤った通常ランサーも直さない。 | 【ランサー】を持つ…パワー15000以上の緑のシグニは【Ｓランサー】を得る |
| S009 | WXDi-P15-048-E2 | AUTO | 真バグ | live actionは`GRANT_KEYWORD keyword:'アサシン'`単独で、原文のアサシン/ダブルクラッシュ二択がない。 | `execChoose`→`execGrantKeyword` | 1つのkeyword文字列に「か」を含める慣例はなく、既存`CHOOSE`が排他的選択を消費する。 | 【アサシン】か【ダブルクラッシュ】を得る |
| S010 | SPDi43-09-E1 | AUTO | 真バグ＋機構待ち | liveは`シャドウ:{"levelLte":2}`を無条件CONTINUOUS付与。stateには専用`field.signi_soul[zone]`があるがActiveConditionに「このシグニにソウルあり」がない。 | 無し＝機構待ち（`checkActiveCondition`へ`IS_SELF_SOUL_ATTACHED`相当を追加し`field.signi_soul`へ配線） | `THIS_CARD_HAS_UNDER`は通常の下敷き、`THIS_CARD_HAS_ATTACHED`はチャーム/アクセ/ソウル合算で、ソウル限定の代用にならない。 | このシグニは【ソウル】が付いているかぎり |
| S011 | WXK11-053-E1 | AUTO | 真バグ | liveはCONTINUOUSのplain`アサシン`1本のみで、原文に並記された`ダブルクラッシュ`が存在しない。 | `collectContinuousGrantedKeywords`／`hasKeyword` | 1 actionが別keywordも暗黙付与する処理はない。SEQUENCE等で2宣言が必要。 | 【アサシン】【ダブルクラッシュ】 |
| S012 | WX08-061-E1 | AUTO | 真バグ | live targetはfilterなしself SIGNI count1で、spell sourceは盤面候補に入らないため`execGrantKeyword`のsource自動枝は発動せず任意自シグニを選べる。原文はダブルクラッシュ所持限定。 | `execGrantKeyword`→`fieldCandidates`／`matchesFilter` | source自動付与（`effectExecutor.ts:3629-3631`）を実測したが、効果元がspellなので`sourceCardNum`はSIGNI候補外。 | 【ダブルクラッシュ】を持つシグニ１体 |
| S013 | WX24-P3-055-E1 | AUTO | 真バグ | activeConditionと美巧filterはあるがlive targetは`count:1`。原文の美巧全体は既存正準形`count:'ALL'`。 | `collectContinuousGrantedKeywords`／`execGrantKeyword` | source自動枝は1体を固定するだけで全美巧へ展開しない。場全体型はengineコメントにも明記。 | あなたの＜美巧＞のシグニは |
| S014 | WX25-P1-059-E2 | AUTO | 真バグ | liveはplain`アサシン`。原文の正面power 12000以上は現行AssassinScopeに`powerLte`しかなく逆向きだが、これはkeyword語彙の不足でもある。 | 無し＝機構待ち（`AssassinScope.powerGte`を`hasApplicableAssassin`へ配線） | `powerLte`へ12000を入れると向きが逆。既存prefixだけでは「以上」を表せない。 | アサシン（パワー12000以上のシグニ） |
| S015 | WXDi-D04-007-E2 | AUTO | 真バグ | liveはアサシン付与1 actionだけで、原文が別の対象1体へ与えるランサーactionが丸ごとない。 | `execSequence`→`execGrantKeyword` | 1回のsource自動付与や同一選択は「対象の…1体」を2回宣言する原文の独立対象を生成しない。 | 対象のあなたのシグニ１体は【ランサー】を得る |
| S016 | WXDi-P04-048-E1 | AUTO | 真バグ | live scopeは`{"levelLte":3}`でlevel1/2も遮断する。原文はlevel3ちょうどなので既存`ShadowScope.levelEq:3`が正確。 | `evaluateShadowScope`／`decodeShadowKeyword` | parserの裸「レベルN」→`levelLte`規則を確認したが、カード注釈も「レベル3のシグニ」と限定しており`levelEq` consumerが在る。 | シャドウ（レベル３のシグニ） |
| S017 | WXDi-P02-060-E2 | AUTO | 真バグ | liveはON_PLAY cost後にplainアサシンを無条件付与し、self trash spell 5枚以上conditionがない。 | `evalCondition(TRASH_HAS_CARD)`→`execGrantKeyword` | 先行の別能力「trashにspellがあるかぎり」は5枚閾値を暗黙供給しない。 | あなたのトラッシュにスペルが５枚以上ある場合 |
| S018 | WX12-046-E1 | AUTO | 真バグ | liveにactiveConditionが皆無。原文はself center LRIG青かつself hand 7枚以上のAND。 | `checkActiveCondition(AND/LRIG_COLOR/HAND_COUNT)` | plainアサシン自体は正しいが、付与喪失抑止は盤面条件の代用ではない。 | センタールリグが青で、あなたの手札が７枚以上あるかぎり |
| S019 | WXK01-049-E1 | AUTO | 真バグ | live targetはfilterなしcount1。signi sourceが候補ならsourceへ自動付与され、原文の「自分のドライブ状態の1体」を選ぶ効果より過少かつisDrive条件もない。 | `execGrantKeyword`／`fieldCandidates(matchesStateFilter isDrive)` | source自動枝を適用すると偽陽性ではなく別の不一致（任意drive対象→source固定）が確定した。 | あなたのドライブ状態のシグニ１体 |
| S020 | WX24-P4-079-E2 | AUTO | 真バグ＋機構待ち | live keywordはplain`ランサー`。原文はバトルでバニッシュした相手がpower10000以下の場合だけ追加クラッシュだが、ランサーにparameter prefix/consumerがない。 | 無し＝機構待ち（LancerScopeを導入し`BattleScreen`のランサー追加クラッシュ判定へ配線） | Assassin/Shadowのprefixを流用不可。`keywords.ts`にLancer prefixは存在しない。 | ランサー（パワー10000以下のシグニ） |
| S021 | WX10-047-E1 | AUTO | 真バグ | liveはself SIGNI ALLへ恒常ランサー。原文はself fieldにeffective power 50000以上SIGNIが存在する間だけで、既存`HAS_CARD_IN_FIELD powerRange.min`を使える。 | `checkActiveCondition(HAS_CARD_IN_FIELD)`→`collectContinuousGrantedKeywords` | `count:'ALL'`は付与先の全体性だけを表し、発生条件を暗黙評価しない。 | 場にパワー50000以上のシグニがあるかぎり |
| S022 | WXDi-P07-045-E2 | AUTO | 真バグ | live ON_ATTACK_SIGNIにはself power条件がなく常にscope付きshadowを付与。既存`SELF_POWER_GTE`はoperatorを受け`eq,13000`を評価できる。 | `evalCondition(SELF_POWER_GTE)`→`execGrantKeyword` | 閾値名のGTEに惑わされず実consumerが`operator ?? 'gte'`を読むことを確認。 | このシグニのパワーが13000の場合 |
| S023 | WXDi-CP02-092-E2 | AUTO | 真バグ | liveは正準半角`Sランサー`付与だけで、同じ絆出の`POWER_MODIFY +10000 UNTIL_END_OF_TURN`が欠落。 | `execSequence`→`execPowerModify`→`execGrantKeyword` | Sランサーがpower修整を内包する処理はなく、表示上位keywordもdeltaを生成しない。 | パワーを＋10000し、このシグニは【Ｓランサー】を得る |
| S024 | WX24-D4-15-E1 | AUTO | 真バグ＋機構待ち | liveはplainランサー。原文はバニッシュ対象power5000以下限定で、現行ランサーにはscopeを保存・評価する語彙がない。 | 無し＝機構待ち（LancerScope→ランサーbattle banish/life crash処理） | アサシンの`powerLte`は正面回避判定でありランサーのバトル勝利対象には転用できない。 | ランサー（パワー5000以下のシグニ） |
| S025 | WX25-CP1-076-E1 | AUTO | 真バグ＋機構待ち | live keywordはplainランサーで、原文のバニッシュ対象power5000以下制約が消失。 | 無し＝機構待ち（S024と同じLancerScope配線） | energyTrash costは付与条件でなく、括弧内のランサー適用範囲を表さない。 | ランサー（パワー5000以下のシグニ） |
| S026 | WX20-057-E1 | AUTO | 真バグ＋機構待ち | liveはこのシグニへダブルクラッシュを無条件CONTINUOUS付与。ActiveConditionには「center LRIGがkeywordを持つ」がなく、`SELF_HAS_KEYWORD`はsource SIGNI自身を見る。 | 無し＝機構待ち（`CENTER_LRIG_HAS_KEYWORD`を`checkActiveCondition`へ追加し`hasKeyword(lrigTop,…)`へ配線） | `LRIG_COLOR`や対象LRIGへのGRANT_KEYWORDは状態条件ではない。 | センタールリグが【ダブルクラッシュ】を持つかぎり |
| S027 | WXDi-P08-049-E1 | AUTO | 真バグ | live shadow scopeは`levelLte:2`でlevel1も対象外にする。原文はlevel2ちょうどなので既存`levelEq:2`へ直せる。 | `evaluateShadowScope`／`decodeShadowKeyword` | 相手ターンactiveConditionは正しいが、scopeの比較演算を変更しない。 | レベル２のシグニによって対象にされない |
| S028 | WXDi-P15-063-E1 | AUTO | 真バグ | live targetは解放派filterだけで、下にカードがある対象限定がない。TargetFilter単体にはhost under有無がないが、対象候補用の状態filter配線が必要。 | 無し＝機構待ち（`TargetFilter.hasUnder`相当を`fieldCandidates/matchesStateFilter`へ配線） | `THIS_CARD_HAS_UNDER`はeffect sourceのconditionで、任意に選ぶ対象各候補のfilterには使えない。 | 下にカードがあるあなたの＜解放派＞のシグニ１体 |
| S029 | WXDi-P06-062-E1 | AUTO | 真バグ | liveは相手ターン条件だけでshadowを付与し、self hand−opponent handが0以上の条件がない。 | `checkActiveCondition(AND/HAND_DIFF/TURN_OWNER)` | `HAND_DIFF{gte,0}`が「以上」を含み、主語と向きも原文どおり。 | あなたの手札の枚数が対戦相手の手札の枚数以上であるかぎり |
| S030 | WXDi-P08-071-E2 | AUTO | 真バグ | liveは相手ターンなら無条件shadow。self energyの有色種類数3以上は既存`ENERGY_COLOR_TYPES`で評価できる。 | `checkActiveCondition(AND/ENERGY_COLOR_TYPES/TURN_OWNER)` | 色はカード枚数ではなくSetの種類数を数え、無色を除く既存consumerを用いる。 | エナゾーンにあるカードが持つ色が合計３種類以上あるかぎり |
| S031 | WXEX2-50-E1 | AUTO | 真バグ | liveはplain shadowを無条件付与。原文はopponent fieldのいずれかのSIGNI zoneにチャームがある間だけ。 | `checkActiveCondition(HAS_CARD_IN_FIELD)`／`matchesStateFilter(hasCharm)` | キーワード喪失の再付与拒否はこの盤面条件を評価しない。ownerはopponent。 | 対戦相手の場に【チャーム】があるかぎり |
| S032 | WX25-P2-089-E1 | AUTO | 真バグ | liveはplainアサシン。原文の正面条件は`AssassinScope{isFrozen:true,powerLte:8000}`として既存consumerが両方AND評価する。 | `hasApplicableAssassin`／`decodeAssassinKeyword` | target側の武勇filterは付与先だけで、正面相手の凍結/power条件ではない。 | アサシン（凍結状態のパワー8000以下のシグニ） |
| S033 | WXDi-P07-054-E2 | AUTO | 真バグ | liveは相手ターン条件だけで`シャドウ:{"color":"赤"}`を付与。self trashの白SIGNI 7枚以上条件がない。 | `checkActiveCondition(AND/TRASH_HAS_CARD/TURN_OWNER)` | shadowの`color:'赤'`は対象にしてくる発生源の色であり、trash白枚数を兼ねない。 | トラッシュに白のシグニが７枚以上あるかぎり |
| S034 | WXDi-D03-004-E3 | AUTO | 真バグ | 付与AUTOのliveは任意DOWN後に`CONDITIONAL{IS_MY_TURN}`で無条件LIFE_CRASHし、相手のguard持ち手札1枚による回避を実行しない。既存opponent optional paymentがfilter付き捨てを扱える。 | `GRANT_LRIG_ABILITY` store→`OPTIONAL_COST/OPPONENT_PAY_OPTIONAL`→`execSequence` | `IS_MY_TURN`はdid-it placeholderにもなり得るが、相手支払いUI・guard filter・未払い分岐を生成しない。 | 対戦相手が《ガードアイコン》を持つカードを１枚捨てないかぎり |
| S035 | WXDi-D03-011-E1 | AUTO | 真バグ | outer actionにlevel3対象条件がなく、childダブルクラッシュは`target.type:'SIGNI'`。原文は自分のlevel3 LRIG1体への能力付与。 | `evalCondition(LRIG_LEVEL)`→`GRANT_LRIG_ABILITY` store→`execGrantKeyword(target LRIG)` | `GRANT_LRIG_ABILITY`がセンターへstoreする慣例は確認したが、child SIGNI targetはルリグ自身へのkeywordにならない。 | あなたのレベル３のルリグ１体を対象とし |
| S036 | WD16-012-E1 | AUTO | 真バグ | liveは相手起因BANISH耐性を無条件PERMANENT付与。原文はopponent hand countがちょうど0の間だけ。 | `checkActiveCondition(HAND_COUNT)`→`collectBanishEffectProtectedSigni` | `sourceOwner:'opponent'`はバニッシュ原因の所有者で、相手手札0条件ではない。 | 対戦相手の手札が０枚であるかぎり |
| S037 | WX21-015-E1 | AUTO | 真バグ＋機構待ち | liveは他の空獣存在conditionで自己`POWER_MODIFY +2000`を行い、原文の空獣条件で得る全原因「バニッシュされない」がない。 | 無し＝機構待ち（第1バッチC010／第4バッチE020と同じ全原因BANISH耐性の正準化・collector配線） | 現行`GRANT_PROTECTION sourceOwner:'opponent'`は全原因耐性と同義でないため、単純置換を外した。 | 他の＜空獣＞のシグニがあるかぎり…バニッシュされない |
| S038 | WX21-015-E1 | AUTO | 真バグ | 同じliveはconditionが空獣のまま`+2000`だけ。原文の地獣存在条件、自己+2000、自己ランサーの組が欠落する。 | `checkActiveCondition(HAS_CARD_IN_FIELD excludeSelf)`→`calcFieldPowers`／`collectContinuousGrantedKeywords` | S037の全原因耐性とは別枝。地獣condition下のSEQUENCEは既存consumerで表現可能。 | 他の＜地獣＞のシグニがあるかぎり…＋2000され…【ランサー】を得る |
| S039 | WXDi-CP02-001-E1 | AUTO | 真バグ | liveは`REVEAL_AND_PICK`で手札追加と残りdeck bottomだけを行い、後続のシグニバリア1獲得actionがない。 | `execSequence`→`STUB GAIN_SIGNI_BARRIER`（`execStubPart3`） | `REVEAL_AND_PICK.then`はpicked cardごとの行先処理で、バリアtokenを暗黙生成しない。 | 【シグニバリア】１つを得る |
| S040 | WX19-071-E1 | AUTO | 真バグ＋機構待ち | liveは無条件`ON_OPP_LIFE_CRASHED`でSEARCHし、crashが自分SIGNIのランサー由来かを記録・判定しない。 | 無し＝機構待ち（S006と同じcrash cause keyword配線、加えてsource SIGNI ownerを固定） | `usageLimit:'once_per_turn'`は回数だけを制限し原因を復元しない。 | あなたのシグニが【ランサー】によって対戦相手のライフクロスをクラッシュしたとき |

注: S014・S028は明細作成時の「符号化語彙が在る／既存filterで足りる」という初期想定をconsumerまで追って修正し、機構待ちにも計上した。GRANT_KEYWORDの機構待ちは S010/S014/S020/S024/S025/S026/S028 の7件。

## 3. action型ごとの所見

- `BLOCK_ACTION`: 2 findingsとも限定を載せる型がなくO-41そのもの。S001はさらに対象live effect自体が無い。
- `CHOOSE`: choice器は既存。S003はchoice②が別actionへ化け、S004はchoice conditionだけが落ちた。
- `DRAW` / `SEARCH`: S006/S040は同じ`ON_OPP_LIFE_CRASHED`原因情報不足。通常のcrash source card filterでは「ランサーによって」を判別できない。
- `GRANT_FIELD_SIGNI_ABILITY`: 外側のtrash条件を足せば既存収集器へ届く。
- `GRANT_KEYWORD`: 付与先はsource自動・ALL・選択で結論が分かれた。S012はspell sourceが候補外、S019はsigni source固定、S013/S021はALLが正準形である。
- `GRANT_LRIG_ABILITY`: store自体は既存。S034は付与能力内部の相手任意支払い、S035はlevel3 gateとchild LRIG targetが欠落。
- `GRANT_PROTECTION`: S036は既存HAND_COUNTで修正可能。S037だけは過去バッチと同じ全原因耐性の正準化待ち。
- `REVEAL_AND_PICK`: picked cardへの`then`反復とは無関係な後続バリア獲得が落ちた単純欠落。

### 符号化可能／不可能なキーワードでの分岐

`アサシン`と`シャドウ`だけがJSON scope prefixを持つ。ただし「prefixがある」だけで全表現が可能とは限らない。S005/S032は既存AssassinScopeで直せる一方、S014のpower 12000**以上**は`powerLte`しかなく機構待ち。ShadowScopeは`levelEq`、`levelGte/Lte`、`powerLte`等がありS016/S027はparser真バグである。

`ランサー`にはprefixがなく、括弧付きS020/S024/S025はすべて機構待ち。plainランサーの付与条件・付与先を直すS008/S015/S021/S038は既存語彙で足りる。`Sランサー`の全角/半角は`normalizeGrantKeywordSpelling`で半角へ正準化済みなのでS008/S023は綴り機構待ちではない。

## 4. 機構待ち一覧

| effectId / finding | 不足語彙・機構・配線 |
|---|---|
| WDK05-T09-E1-G / S001、WX18-039-E1 / S002 | **PLAN §6.4 O-41と同一＝新規登録しない**。`BlockActionAction`へguard card filterを追加し、ガード宣言UI/可否判定がlevel固定・列挙・動的levelを読む配線。S001は対象live effectの生成も必要。 |
| WX07-042-E1 / S006、WX19-071-E1 / S040 | `ON_OPP_LIFE_CRASHED`へcrash原因種別（ランサー）とsource SIGNIを運び、`collectOppLifeCrashedTriggers`および`BattleScreen`内の重複collectorで判定する配線。同一機構として1件に束ねる。 |
| SPDi43-09-E1 / S010 | `ActiveCondition.IS_SELF_SOUL_ATTACHED`相当を追加し、`checkActiveCondition`がsource zoneの`field.signi_soul`を読む。通常のunder/attached合算とは分離する。 |
| WX25-P1-059-E2 / S014 | `AssassinScope.powerGte`を`keywords.ts`の型・encode/decode後の`hasApplicableAssassin`へ配線。既存`powerLte`の向きを反転流用しない。 |
| WX24-P4-079-E2 / S020、WX24-D4-15-E1 / S024、WX25-CP1-076-E1 / S025 | LancerScope（powerLte）を新設し、バトルでバニッシュした対象のeffective powerを`BattleScreen`のランサー追加クラッシュ判定へ渡す。3件で同一機構。 |
| WX20-057-E1 / S026 | `CENTER_LRIG_HAS_KEYWORD`を`checkActiveCondition`へ追加し、center LRIG topに対する`hasKeyword`（付与・喪失込み）へ配線。 |
| WXDi-P15-063-E1 / S028 | 任意対象候補ごとの「下にカードあり」を表す`TargetFilter.hasUnder`相当を`fieldCandidates/matchesStateFilter`へ配線。source用`THIS_CARD_HAS_UNDER`とは別軸。 |
| WX21-015-E1 / S037 | **第1バッチ C010／第4バッチ E020 の「全原因バニッシュ耐性」と同一機構＝二重登録しない**。`sourceOwner:'opponent'`限定collectorでは表せない全原因耐性の正準化。 |

## 5. 偽陽性件数の自己評価

偽陽性は **0/40 = 0%**。第8バッチ1/40=2.5%、第9バッチ2/49=4.1%よりさらに低い。第1〜7バッチ通算98/463に第8（1/40）・第9（2/49）・今回（0/40）を加えると、通算は **101/592 = 17.1%**。

第9バッチで修正した仮説「固有executorの存在数ではなく、段0指摘がそのexecutorの非自明な慣例に実際に衝突する割合が効く」は今回も支持された。GRANT_KEYWORDが26件あっても、source自動枝に実際に衝突したS012はspell sourceが候補外で救済されず、S019は衝突した結果むしろsource固定という別の実害が確定した。`isKeywordAbilityRemoved`も無条件付与の盤面条件を代替しない。母集団は均質でも、非自明な慣例と等価になるfindingが0件だったため偽陽性0になった。

## 6. 条件以外で見つけた原文との食い違い

**14 findings / 15項目**。

- S001: 条件以前に付与能力live effect全体が存在しない。
- S003: choice②がSランサー付与でなくコイン1獲得へ化けている。
- S008: Sランサーが通常ランサーへ格下げされ、ALL/緑/power/ランサー所持の付与先も崩壊。
- S009: ダブルクラッシュとの二択が消えアサシン固定。
- S011: 常在ダブルクラッシュが丸ごと欠落。
- S013: 全美巧ではなくcount1。
- S015: 独立対象へのランサー付与が丸ごと欠落。
- S019: drive限定のほか、任意対象がsource固定になる。
- S023: +10000が欠落。
- S035: child keyword targetがLRIGでなくSIGNI。
- S037: バニッシュ耐性が+2000へ置換。
- S038: 地獣条件下のランサー付与が欠落し、条件storyも空獣のまま。
- S039: シグニバリア獲得が欠落。
- S014/S028: 指摘どおりの不一致に加え、想定された既存語彙自体が不足していた。

## 7. ゲート・差分・成果物確認

`npm run gates`は全緑（実測、17.8秒）。

- typecheck PASS
- golden **2337 PASS / 0 FAIL**
- smoke **10693効果 / OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **773 / baseline 773**
- census:stubs **A群🔴 0 / C群 0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は、作業前からのtracked M 2本 `scripts/archive/semanticAuditLedger.mjs` / `scripts/archive/semanticAuditMkBatchSingles.mjs`、既存未追跡の第8報告・第9明細/索引/報告、今回入力の第10明細/索引、および新規の本報告だけ。指示どおり計器2本には触れていない。`git diff --stat`はその既存M 2本だけ（**2 files changed, 9 insertions(+), 3 deletions(-)**）で、本作業によるtracked差分は0。

報告書はUTF-8で先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **29213 bytes**。

## 8. ガードレール2・3・6・7で当初見立てから変えた件

- S008: 全角/半角が機構待ちという疑いを撤回。`effectParser.ts:15894-15898`が全`GRANT_KEYWORD`を`Sランサー`へ正準化し、`hasKeyword`にもsafety netがある。liveのplainランサーは綴り問題でなくparserの意味退化。
- S012: filterなしcount1を「任意1体」と即断せずsource自動枝を適用。効果元がspellでfield candidateに入らないため、結論は真バグのままだが根拠を実行時候補へ修正。
- S014: 「アサシンは符号化可能だからparserだけ」とした初期見立てを撤回。AssassinScopeは`powerLte`のみでpowerGte consumerがなく、真バグ＋機構待ち。
- S016/S027: parserの裸level→levelLte規則を確認したうえで、既存`ShadowScope.levelEq` consumerと原文注釈の「レベルNのシグニ」を優先し真バグに維持。
- S019: source自動枝により「任意の非driveも選べる」という段0の方向を修正。実際はsource固定で、原文の任意drive SIGNIを選べない過少実行＋drive限定欠落。
- S022: 型名`SELF_POWER_GTE`だけを見ればexact不可に見えたが、consumerがoptional operatorを読むため`eq,13000`で既存語彙に載ると確定。
- S028: `THIS_CARD_HAS_UNDER`を対象filterへ流用する案を撤回。これはsource conditionで、任意候補各体のunder状態を読むconsumerがないため機構待ち。
- 先回りメモQ/R/S/T/U/V/Wの引用行を実コードで確認した。**メモQとはS014で食い違った**。`AssassinScope`は`isFrozen`/`powerLte`/`selfHandLte`のみ（`keywords.ts:82-92`）、`hasApplicableAssassin`も相手SIGNIへの`powerLte`しか読まない（`:130-138`）。したがって「アサシン（パワー12000以上）」は現状のprefixにJSONを付けるだけでは表現できず、メモのparser単独修正見立てを採らず機構待ちへ変更した。
