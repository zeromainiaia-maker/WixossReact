# 意味照合監査 clean群 round1 — 段1 第6バッチ triage

対象は G001〜G020 の40 findings（37カード、39 effectId）。finding 単位で live JSON・原文・当該 action / trigger の consumer を照合した。実装はしていない。`parseStatus` は40件すべて `AUTO` であり、`MANUAL` / `PARTIAL` の `syncManualLive.ts` 経路に該当するものはない。

## 1. サマリ

| cluster | quote | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---|---:|---:|---:|---:|
| G001 | パワーを＋5000し | 2 | 0 | 0 | 0 |
| G002 | ライフクロスに加える | 2 | 0 | 0 | 0 |
| G003 | ランサー（パワー5000以下のシグニ） | 2 | 0 | 2 | 0 |
| G004 | リコレクトアイコンを持たない | 2 | 0 | 2 | 0 |
| G005 | ルリグ１体とシグニ１体 | 2 | 0 | 0 | 0 |
| G006 | レベル１、レベル２、レベル３ | 2 | 0 | 2 | 0 |
| G007 | レベル１～４の＜電機＞ | 2 | 0 | 2 | 0 |
| G008 | レベル１につき１つまで | 2 | 0 | 0 | 0 |
| G009 | レベルが奇数 | 2 | 0 | 0 | 0 |
| G010 | レベルと同じ回数行う | 2 | 0 | 0 | 0 |
| G011 | 以下の能力を得る | 2 | 0 | 0 | 0 |
| G012 | 基本パワーは15000になり | 2 | 0 | 0 | 0 |
| G013 | 共通するクラスを持つ | 2 | 0 | 1 | 0 |
| G014 | 共通する色を持たない | 2 | 0 | 2 | 0 |
| G015 | 公開するか、このシグニを | 2 | 0 | 0 | 0 |
| G016 | 好きな順番で | 2 | 0 | 1 | 0 |
| G017 | 次にこのルリグがアタック | 2 | 0 | 0 | 0 |
| G018 | 次にそれがアタックしたとき | 1 | 1 | 1 | 0 |
| G019 | 自身のパワー以下 | 2 | 0 | 0 | 0 |
| G020 | 捨てたシグニ１枚につき | 2 | 0 | 2 | 0 |
| **合計** |  | **39** | **1** | **15** | **0** |

注: 機構待ち15件はすべて真バグとの重複計上。

## 2. finding 全40件の分類

| effectId | parseStatus | 分類 | 根拠（live JSON と原文の個別照合） | consumer | 原文の該当句 |
|---|---|---|---|---|---|
| WX21-020-E1 | AUTO | 真バグ | live の `CHOOSE.choices[c2].action` は天使1体への `GRANT_KEYWORD keyword:'ランサー'` だけで、原文③に独立して存在する `POWER_MODIFY delta:5000` が無い。ダブルクラッシュも同時に脱落している。 | `execChoose` → `execPowerModify` (`effectExecutor.ts:1558-1674`)。既存 `SEQUENCE` で3付与を並置可能 | 対象のあなたの＜天使＞のシグニ１体のパワーを＋5000し |
| WXDi-P02-055-E1 | AUTO | 真バグ | live action は `REMOVE_ABILITIES target={SIGNI,opponent,count:1}, until:'UNTIL_OPP_TURN_END'` 単独。原文は最初に選んだ自分のシグニへ＋5000するので、パワー段の欠落に加え owner も逆である。 | `execPowerModify` (`effectExecutor.ts:1562-1619`) は `duration:'UNTIL_OPP_TURN_END'` を `power_mods_until_opp_turn` へ保存 | 次の対戦相手のターン終了時まで、それのパワーを＋5000し |
| WX24-P2-038-E1 | AUTO | 真バグ | live は `TRANSFER_TO_DECK source={TRASH_CARD,self,count:'ALL'}, shuffle:true` で終了し、原文のシャッフル後デッキトップを加える `ADD_TO_LIFE` が無い。 | `execTransferToDeck` 後に `execAddToLife` (`effectExecutor.ts:2927-3007`) の `owner:'self',fromTop:true` を既存 `SEQUENCE` で実行可能 | デッキの一番上のカードをライフクロスに加える |
| WXK11-006-E1-G2 | AUTO | 真バグ | live 第2段は `ADD_TO_LIFE owner:'self',count:1,fromTop:true`。原文は「あなたの選んだ」相手トラッシュのカードを相手ライフへ置くため、owner・source・選択者の3軸が一致しない。 | `execAddToLife` (`effectExecutor.ts:2964-3007`) は `owner:'opponent'`、`fromTrash`、`opponentSelects` を読む | 対戦相手は自分のトラッシュからあなたの選んだカード１枚をライフクロスに加える |
| WX24-P1-072-E1 | AUTO | 真バグ＋機構待ち | live は自身へ通常の `keyword:'ランサー'` を付けるだけ。攻撃解決は `isLancer` ならバニッシュ相手のpowerを見ずクラッシュするため、原文の上限5000が失われる。 | `getSigniAttackKeywordState` (`signiAttackKeywords.ts:17-50`) → battle lancer処理 (`BattleScreen.tsx:9341-9371`)。条件付きランサーのpower上限を読む consumer 無し＝機構待ち | 【ランサー（パワー5000以下のシグニ）】を得る |
| WX25-P1-088-E2 | AUTO | 真バグ＋機構待ち | live `GRANT_KEYWORD` は `thisCardOnly:true, keyword:'ランサー'` で対象自身は正しいが、括弧内の `power<=5000` 情報がpayloadに存在せず、5001以上をバトルバニッシュしても通常ランサーが発動する。 | `hasKeyword` / `getSigniAttackKeywordState` と `BattleScreen` のランサークラッシュ経路に対象power条件の読取無し＝機構待ち | ランサー（パワー5000以下のシグニ） |
| SPDi43-14-E2 | AUTO | 真バグ＋機構待ち | live の `LRIG_TRASH_CARD.filter` は `{cardType:'アーツ',color:'黒',costMax:3}` だけで、原文のリコレクトアイコン否定が無い。`TargetFilter.hasIcon` も現状4種だけでリコレクトを表せない。 | `execTransferToDeck` → `matchesFilter` (`execUtils.ts:843-856`)。`hasIcon` にリコレクト判定が無く、否定キーも無し＝機構待ち | 《リコレクトアイコン》を持たないコストの合計が３以下の黒のアーツ |
| SPDi43-16-E2 | AUTO | 真バグ＋機構待ち | live source filter は緑・アーツ・`costMax:3` のみ。原文の「リコレクトアイコンを持たない」を区別する値がなく、アイコン持ちも候補へ入る。 | `execTransferToDeck` の LRIG_TRASH候補化と `matchesFilter`。リコレクト非所持を判定する filter consumer 無し＝機構待ち | 《リコレクトアイコン》を持たないコストの合計が３以下の緑のアーツ |
| WX25-P2-047-E1 | AUTO | 真バグ | live は `GRANT_KEYWORD target={CENTER_LRIG_OR_SIGNI,opponent,count:2}` で混合集合から2体を選ぶため、シグニ2体という内訳も許す。原文はルリグ1＋シグニ1固定。 | `execGrantKeyword` (`effectExecutor.ts:3568-3637`)。既存の `{type:'LRIG'}` と `{type:'SIGNI'}` を2段の `SEQUENCE` に分離可能 | 対戦相手のルリグ１体と対戦相手のシグニ１体 |
| WXK11-006-E1-G | AUTO | 真バグ | live 先頭も `CENTER_LRIG_OR_SIGNI count:2` で、センタールリグとシグニの各1体を拘束しない。後段回収まで同一 sequence にあるが対象内訳を補う処理は無い。 | `execGrantKeyword` の CENTER_LRIG_OR_SIGNI 候補結合 (`effectExecutor.ts:3568-3573`)；LRIG分岐はセンタートップ直結 (`:3563-3567`) | 対象の対戦相手のセンタールリグ１体とシグニ１体 |
| WXDi-P08-048-E1 | AUTO | 真バグ＋機構待ち | live は無条件 `CONTINUOUS SEQUENCE[POWER_MODIFY opponent 1 -12000, GRANT_KEYWORD owner:any アサシン]`。原文はunderにlv1/2/3各1枚で「アタック時能力」を得、各2枚なら追加アサシンであり、条件・timing・対象照応が全て異なる。 | under stackを数える `checkActiveCondition` とレベル別各N枚条件が無く、付与AUTOへ変換する `collectGrantedFromUnderSigni` 用payloadも無し＝機構待ち | 下にレベル１、レベル２、レベル３のシグニがそれぞれ１枚以上あるかぎり |
| WXDi-P11-075-E1 | AUTO | 真バグ＋機構待ち | live 選択肢①は source無しの `REVEAL` 1 stepで、原文の手札SIGNI・レベル1/2/3・各1枚という集合も枚数3も表さない。②には明示 `HAND_CARD count:3 story:'水獣'` があり構造差も明白。 | `execReveal` / selection UI は単一filterと `selectionConstraint.distinct:'level'` までは扱うが、必須レベル集合{1,2,3}を各1枚 enforceする consumer 無し＝機構待ち | 手札からレベル１、レベル２、レベル３のシグニを１枚ずつ公開する |
| WXK09-047-E1 | AUTO | 真バグ＋機構待ち | live は `ON_MATERIAL_USED` で即 `GRANT_PROTECTION` し、エナの電機lv1〜4が各2枚という condition が丸ごと無い。さらに原文のバニッシュ耐性もpayloadから欠落する。 | `evalCondition` に「zone内で指定4レベルを各N枚」の条件型/readerが無い。`collectBanishEffectProtectedSigni` 側も追加actionが必要＝機構待ち | エナゾーンにレベル１～４の＜電機＞のシグニがそれぞれ２枚以上ある場合 |
| WXK09-080-E1 | AUTO | 真バグ＋機構待ち | live は無条件CONTINUOUSの自身 `ランサー`。原文はエナの電機lv1,2,3,4が各1枚以上ある間だけで、現在は1レベルが欠けても付与され続ける。 | `checkActiveCondition` / `evalCondition` にレベル別必要枚数集合を評価する consumer 無し＝機構待ち | エナゾーンにレベル１～４の＜電機＞のシグニがそれぞれ１枚以上あるかぎり |
| WXDi-P06-003-E1 | AUTO | 真バグ | live `CHOOSE` は `choose_count:1` 固定。原文は自分のセンタールリグlevelを上限に0〜level個選ぶため、level2以上で過小実行する。 | `execChoose` (`effectExecutor.ts:4939-4947`) は `countChoose.count={$ref:'center_lrig_level'},upTo:true` を `resolveCountRef` で消費可能 | センタールリグのレベル１につき１つまで選ぶ |
| WXDi-P14-003-E1 | AUTO | 真バグ | live は4択から必ず1つの `choose_count:1` で、センタールリグlevel3なら最大3択という可変上限を失う。各選択肢本体は別々に保持されている。 | `execChoose.countChoose` と `NumberOrRef center_lrig_level` (`types/effects.ts:157-160,1418-1427`; `effectExecutor.ts:4939-4947`) | 以下の４つからあなたのセンタールリグのレベル１につき１つまで選ぶ |
| WXK04-024-E1 | AUTO | 真バグ | live `POWER_MODIFY` の相手SIGNI filterは `{cardType:'シグニ'}` のみ。原文の奇数条件は `levelParity:'odd'` で既存表現できるが、そのキーが無い。 | `execPowerModify` → `matchesFilter` の `levelParity` (`execUtils.ts:778-782`)。既存consumerあり | レベルが奇数の対戦相手のシグニ１体 |
| WXK04-024-E2 | AUTO | 真バグ | live 全体－15000も `filter.cardType` だけで、偶数レベルまで `count:'ALL'` の自動適用対象になる。型宣言だけでなく共通候補filterがoddを実評価することを確認した。 | `execPowerModify` (`effectExecutor.ts:1558-1674`) → `fieldCandidates` / `matchesFilter(levelParity:'odd')` (`execUtils.ts:778-782`) | レベルが奇数の対戦相手のすべてのシグニ |
| WXDi-D05-011-sub-E1 | AUTO | 真バグ | 付与内AUTOの live は攻撃時に `CHOOSE choose_count:1` を1回だけ実行する。原文は相手センタールリグlevel回、同じ選択肢も反復可なのでlevel2以上で回数不足。 | `execChoose` は `countChoose={$ref:'opponent_center_lrig_level'}` と `allowRepeat:true` を消費し、`resumeChoose` は重複choice idを順次実行可能 | この効果を対戦相手のセンタールリグのレベルと同じ回数行う |
| WXK10-104-E1 | AUTO | 真バグ | live 3択は `choose_count:1` 固定。自分センタールリグのlevel回という反復が無く、複数回時に別対象・別選択肢を取り直す原文を実行できない。 | `execChoose.countChoose` の `center_lrig_level` 解決と `allowRepeat` (`effectExecutor.ts:4939-4955`) | この効果をあなたのセンタールリグのレベルと同じ回数行う |
| WX25-CP1-TK2A-E2 | AUTO | 真バグ | live は `CONTINUOUS POWER_MODIFY target={SIGNI,opponent,1} delta:-5000`。原文はクラフト上の特定SIGNIへON_ATTACK_PHASE_STARTの任意黒コストAUTOを付与するので、相手への恒常減少はtiming・対象・コスト全て誤る。 | `GRANT_EFFECT` のSIGNI対象と `filter.aboveSelf`、付与AUTO collector、任意コストdispatcher。いずれも既存consumerで構成可能 | これの上にある《鰐渕アカリ（正月）》は「【自】：あなたのアタックフェイズ開始時…」を得る |
| WXDi-P11-003-E1 | AUTO | 真バグ | live は `GRANT_KEYWORD target=自SIGNI keyword:'使用条件'` 後、起動直後に3択を1回行う。原文はプレイヤーへゲーム中、毎自分MAIN開始時に未選択肢を1つ実行する能力を与える。 | `GRANT_LRIG_ABILITY` の `permanent:true` 保存 (`effectExecutor.ts:7370`以降) と `ON_MAIN_PHASE_START` collector、CHOOSEの選択済み管理語彙を使用可能 | このゲームの間、あなたは以下の能力を得る |
| WX09-017-E1 | AUTO | 真バグ | live は鉱石5枚条件つき自身ダブルクラッシュだけ。原文で同じ条件に結合された `POWER_SET value:15000` が存在せず、基礎powerは元値のまま。 | CONTINUOUS `calcFieldPowers` の `POWER_SET` (`effectEngine.ts:1849`) はhostへ直接適用。runtime `execPowerSet` もsource自動適用 (`effectExecutor.ts:1701`) | このシグニの基本パワーは15000になり |
| WX09-018-E1 | AUTO | 真バグ | live はspell5枚条件で相手SIGNI効果耐性だけを付け、`POWER_SET 15000` が欠落する。原文の「基本パワー」なので一時加算ではない。 | `calcFieldPowers` の CONTINUOUS POWER_SET host適用 (`effectEngine.ts:1849`) | このシグニの基本パワーは15000になり |
| WXDi-P00-021-E2 | AUTO | 真バグ＋機構待ち | live の `SEND_TO_ENERGY` は相手SIGNI1体を無条件候補にし、自分場のいずれかのSIGNIとの共通クラス照合が無い。単一の固定storyでは表せない動的OR条件である。 | `execSendToEnergy` → `resolveDynamicFilter` に「自分場のいずれかとclass交差」を解くキー/reader無し＝機構待ち | あなたの場にあるいずれかのシグニと共通するクラスを持つ対戦相手のシグニ１体 |
| WXK10-023-E1 | AUTO | 真バグ | live SEARCH filterは赤・SIGNI・level<=3のみ。コストは赤SIGNI1枚なので、既存 `classMatchesDiscardSigni:true` を足せば記録された捨て札クラスに絞れるが現値に無い。 | `resolveDiscardLevelFilter` (`effectExecutor.ts:2202-2222`) が `last_discarded_signi_class` をstory ORへ展開；コスト確定側は `BattleScreen.tsx:12290-12293` に記録 | この方法で捨てたシグニと共通するクラスを持つレベル３以下の赤のシグニ |
| WX21-032-E1 | AUTO | 真バグ＋機構待ち | live はON_ATTACK時に `BANISH filter={cardType:'シグニ',story:'天使'}`。原文は対象側を天使に限定せず、自分場に「sourceと共通色を持たない他の天使」がいることを発動条件にする。 | `evalCondition` に source色との非共通色＋`excludeSelf`＋story天使の存在を評価する条件consumer無し＝機構待ち | このシグニと共通する色を持たない他の＜天使＞のシグニがある場合 |
| WX21-039-E1 | AUTO | 真バグ＋機構待ち | live は無条件 `SEQUENCE[ENERGY_CHARGE 1, ENERGY_CHARGE 2]` で常に計3枚。原文は非共通色の他天使があれば1枚、天使3体が相互に共通色なしなら代わりに2枚である。 | 3体条件 `NO_COMMON_COLOR_AMONG_FIELD_SIGNI` は既存だが、source対他天使の非共通色条件が `evalCondition` に無く全分岐を正しく組めない＝機構待ち | このシグニと共通する色を持たない他の＜天使＞のシグニがある場合 |
| WX14-072-E1 | AUTO | 真バグ | live は自分場の天使SIGNI1体を `TRASH` し、成功ならSEARCHする。原文は手札の天使1枚を公開するかhost自身をトラッシュの二択で、公開枝だけがSEARCHを起動する。 | `execChoose`＋`REVEAL source=HAND_CARD`／`TRASH thisCardOnly`、公開枝内 `SEARCH` の既存consumerで表現可能 | 手札から＜天使＞のシグニ１枚を公開するか、このシグニを場からトラッシュに置く |
| WX14-075-E1 | AUTO | 真バグ | live は `TRASH target={SIGNI,self,count:1,story:'天使'}` だけで、手札公開を選べずhost以外の場の天使を犠牲にできる。原文の二択はいずれも保持されない。 | `execChoose`; `execReveal`; `execTrash` の `thisCardOnly` 固定 (`effectExecutor.ts:1734-1843`) | 手札から＜天使＞のシグニ１枚を公開するか、このシグニを場からトラッシュに置く |
| WXK02-089-E1 | AUTO | 真バグ | live はDRAW2後に `LOOK_AND_REORDER source=hand,count:1,reorder:false,destination:bottom`。原文は手札2枚を選び、その2枚の順序も指定するためcountとreorderが双方誤る。 | `execLookAndReorder` / `resumeLookAndReorder` (`effectExecutor.ts:1315-1332,8832-8867`) は `count:2,reorder:true` を消費 | 手札からカード２枚を好きな順番でデッキの一番下に置く |
| WXK11-028-E1 | AUTO | 真バグ＋機構待ち | live `REVEAL_AND_PICK.remainder={location:'deck',position:'top'}` は残余を所定位置へ戻すだけで、任意順を示すfieldが無い。公開枚数は `$ref:last_processed_count` で正しく可変。 | `execRevealAndPick` / resume経路に remainder再配列を要求するキー・pending UIが無い＝機構待ち | 残りを好きな順番でデッキの一番上に戻す |
| SP38-008-E3 | AUTO | 真バグ | live は起動直後 `BLOCK_ACTION target=opponent PLAYER actionId:'GUARD',until:'END_OF_TURN'`。原文はこのルリグの次の攻撃開始時だけ発火し、その攻撃終了で切れる。 | `GRANT_LRIG_ABILITY` で `ON_ATTACK_LRIG` AUTOをターン中付与し、帰結 `BLOCK_ACTION{GUARD,END_OF_ATTACK}` は `execBlockAction` (`effectExecutor.ts:3371-3374`) が消費 | 次にこのルリグがアタックしたとき、そのアタックの間 |
| WXDi-P13-007-E3 | AUTO | 真バグ | live sequence第3段は手札全捨て直後の `BLOCK_ACTION GUARD END_OF_TURN`。捨て枚数連動の相手エナtrashはあるが、次の当該ルリグ攻撃まで待つ付与AUTOではない。 | `GRANT_LRIG_ABILITY` の一時保存と `collectLrigGrantedEffects` のON_ATTACK_LRIG収集、`execBlockAction END_OF_ATTACK` | このターン、次にこのルリグがアタックしたとき、そのアタックの間 |
| WX25-CP1-008-E1 | AUTO | 真バグ＋機構待ち | live 選択肢③は起動時に `POWER_MODIFY_PER_TRASH_COUNT target=相手SIGNI1` を即実行する。原文は先に対象を固定し、その対象の次の攻撃時にtrash枚数比例減少を適用する。 | `INSTALL_DELAYED_TRIGGER` の `ON_ATTACK_SIGNI` collector (`triggerCollect.ts:96-126`) は attackerOwnerだけを見て、予約時に選んだ特定cardNumとの一致ゲートを持たない＝機構待ち | このターン、次にそれがアタックしたとき |
| WX25-P2-042-E1 | AUTO | 偽陽性 | live は `NEGATE_ATTACK target={SIGNI,opponent,count:1}`。これは即時アタックを消すactionではなく、選んだcardNumを対象側 `negated_attacks` に登録し、次の宣言時に消費するため原文どおり。後段エナ3枚まで回収も保持する。 | `execNegateAttack` (`effectExecutor.ts:6258-6290`) と攻撃宣言時の `negated_attacks` 消費 (`BattleScreen.tsx:8802`付近) | このターン、次にそれがアタックしたとき、そのアタックを無効にする |
| WDK01-011-E1-G | AUTO | 真バグ | 付与AUTO内BANISH filterは `{cardType:'シグニ'}` のみで、攻撃したholder自身の実効power以下という動的上限が無い。holderがeffect sourceになるので既存自己power比較を使える。 | `resolveDynamicFilter.powerLteSelf` (`effectExecutor.ts:2341-2350`) → `execBanish` | 自身のパワー以下の対戦相手のシグニ１体 |
| WX21-032-E1 | AUTO | 真バグ | 同じlive BANISHは `story:'天使'` という原文にない対象制限を持つ一方、必要な `powerLteSelf:true` が無い。したがって天使ならsourceより高powerも選べ、非天使なら低powerでも選べない。 | `resolveDynamicFilter` の `powerLteSelf` → `execBanish` (`effectExecutor.ts:2341-2350,1734`以降) | 自身のパワー以下の対戦相手のシグニ１体 |
| WDA-F02-07-E1 | AUTO | 真バグ＋機構待ち | live は最大3枚distinct-levelで捨てた後、`BANISH count:1,levelEqLastProcessed:true`。原文は捨てた各レベルごとに相手1体なので、1体固定かつ単一参照では複数レベルを対応付けられない。 | `resolveDynamicFilter.levelEqLastProcessed` (`effectExecutor.ts:2459`付近) は単一levelへ解決するだけ。各捨て札levelを1回ずつ消費する反復・対応選択consumer無し＝機構待ち | 捨てたシグニ１枚につきそれと同じレベルを持つ対戦相手のシグニ１体 |
| WX24-P2-036-E1 | AUTO | 真バグ＋機構待ち | live は好きな枚数を捨てても後段 `DOWN count:1,levelEqLastProcessed:true` だけ。2枚以上捨てた場合の対象数も、各捨て札と同レベルを1対1対応させる制約も無い。 | `execDown` と `resolveDynamicFilter(levelEqLastProcessed)` は複数level別の反復割当を読まない。対応付きN回選択の配線無し＝機構待ち | この方法で捨てたシグニ１枚につきそのシグニと同じレベルの対戦相手のシグニ１体 |

## 3. クラスタ所見

- **G001**: 2件とも＋5000段が完全欠落。WX21は同じ選択肢のダブルクラッシュも欠け、WXDiは対象owner逆転と能力付与群の脱落も併発する。
- **G002**: WX24は後段action丸ごと欠落、WXK11はaction自体はあるがowner/source/chooserが別物。結論は同じ真バグでも壊れ方が異なる。
- **G003**: `GRANT_KEYWORD` 自体はsourceへ正しく付くが、攻撃消費側が条件付きランサーを区別しないため2件とも機構待ち。
- **G004**: 色・cost・cardTypeは個別liveで正しい。欠けているのはリコレクトアイコン否定だけだが、filter語彙とconsumerの双方が無い。
- **G005**: 2件とも混合候補2体を種類別1体ずつと誤用。LRIG単独分岐がセンター直結することを確認したため既存action分割で足りる。
- **G006**: underのレベル別存在条件と、手札公開の必須レベル集合という別機構。単なるdistinct levelでは「1,2,3各1」を保証しない。
- **G007**: 各levelをN枚ずつ数える同じ条件機構が不足。片方はON_MATERIAL_USED、片方はCONTINUOUSで入口が違う。
- **G008**: 2件ともliveは固定1だが、`countChoose` のcenter-lrig-level参照が既に配線済みなので通常の真バグ。
- **G009**: `levelParity` は型だけでなく `matchesFilter` で実消費済み。2件ともJSON/parser修正で足り、機構待ちではない。
- **G010**: 自分/相手センタールリグの参照方向は異なるが、可変choose数＋repeatを既存consumerが扱える。
- **G011**: 1件目は上のSIGNIへのAUTO付与、2件目はプレイヤーへのゲーム中能力付与。共通語「得る」を同じpayloadへ束ねられない。
- **G012**: 2件とも条件はliveに残り、同じ条件下のPOWER_SETだけ欠落。CONTINUOUS host直適用なので選択UI問題はない。
- **G013**: 結論が分岐。コストで捨てた1枚との共通classは既存履歴consumerで解けるが、自分場の任意SIGNIとのclass交差は動的集合readerが無い。
- **G014**: 3体相互非共通色は既存条件がある一方、sourceと他の天使の色非交差条件が無い。両effectとも前者だけでは原文全体を復元できない。
- **G015**: 2件とも公開/自己trashのCHOICEへ再構成可能。WX14-072だけ公開枝にSEARCHを内包する必要がある。
- **G016**: 結論が分岐。WXK02は既存LOOK_AND_REORDERの値誤り、WXK11はREVEAL_AND_PICK残余に並替えUI/fieldが無い機構待ち。
- **G017**: raw LRIG targetの即時作用から類推せず、付与ルリグAUTOのON_ATTACK_LRIG収集とEND_OF_ATTACK guard blockを確認。既存語彙で遅延化できる。
- **G018**: 結論が分岐。対象固定＋次回発火＋比例減少はcollectorに対象同一性が無く機構待ちだが、`NEGATE_ATTACK` はそれ自体が次回攻撃予約なので偽陽性。
- **G019**: duration指摘ではなく動的power条件の欠落。2件とも既存 `powerLteSelf` で表現可能。
- **G020**: 2件とも捨て札は複数になり得るため、単一 `lastProcessed` level比較を横展開できない。レベル別1対1反復が必要。

## 4. 機構待ち一覧

- **G003（2件）**: `getSigniAttackKeywordState` と `BattleScreen` のランサー勝利処理へ、バニッシュ対象power上限を保持・評価する条件付きランサーpayloadを配線する。
- **G004（2件）**: `TargetFilter` にリコレクトアイコン有無を追加し、`matchesFilter` がLRIG_TRASHのアーツ本文/データから評価する。
- **G006（2件）**: `checkActiveCondition` にunderのlevel別必要枚数、REVEAL選択に必須level集合を各1枚ずつ満たすconstraintを追加する。
- **G007（2件）**: `evalCondition` / `checkActiveCondition` にzone・class・level集合・各level最小枚数を同時評価する条件を配線する。
- **G013（WXDi-P00-021-E2）**: `resolveDynamicFilter` に自分場SIGNI群のclass集合との交差を評価するdynamic filterを追加する。
- **G014（2件）**: `evalCondition` にsourceCardNumの色と共通色を持たない、`excludeSelf` なfield SIGNI存在条件を追加する。既存 `NO_COMMON_COLOR_AMONG_FIELD_SIGNI` は3体相互条件にのみ再利用する。
- **G016（WXK11-028-E1）**: `execRevealAndPick` / resume / modalへ、残余カードをユーザー指定順でdeck topへ戻すpendingを配線する。
- **G018（WX25-CP1-008-E1）**: `INSTALL_DELAYED_TRIGGER` と `collectSigniAttackDelayedTriggers` に、予約時に選んだcard instanceとattackerCardNumの一致ゲートを追加する。
- **G020（2件）**: TRASH結果の全level列を保持し、`execBanish` / `execDown` の対象選択をlevelごとに1体ずつ反復するconsumerを追加する。

## 5. 偽陽性件数の自己評価

偽陽性は **1/40 = 2.5%**、段0 precision換算は **97.5%**。パイロットの precision 78〜84%（偽陽性16〜22%）より真バグ率が明確に高い。0件ではない根拠は、G018の2件を一括せず `WX25-P2-042-E1` の `execNegateAttack` を開き、`negated_attacks` への事前登録が「次にそれがアタックしたとき」を既に実現すると確認したためである。一方、残る39件はliveに具体的なaction/condition/filterの欠落・誤値があり、G003/G004等はconsumer不在まで実測した。小粒な条件脱落クラスタが中心という母集団差で、偽陽性を無理に増減させた数字ではない。

## 6. 条件以外で見つけた原文との食い違い

**7 effect・計10項目。**

- `WX21-020-E1`: findingの＋5000欠落以外に、選択肢③の【ダブルクラッシュ】付与も欠落。
- `WXDi-P02-055-E1`: ＋5000以外に、対象が自分SIGNIではなく相手SIGNI、【シャドウ】と「アタックできない」の付与も欠落。
- `WXK11-006-E1-G2`: life owner逆転以外に、デッキトップを使っており「相手トラッシュからあなたが選ぶ」が欠落。
- `WXK09-047-E1`: level別エナ条件以外に「バニッシュされない」の付与が欠落。
- `WXDi-P11-003-E1`: 原文にない「使用条件」keyword以外に、ゲーム中持続・MAIN開始時trigger・未選択肢管理が欠落し、③もtrashからdeck topではなく場SIGNIをdeckへ移す。
- `WXK02-089-E1`: reorder=false以外に、手札から戻す枚数が原文2枚に対してlive `count:1`。
- `WX25-CP1-008-E1`: finding対象の③以外に、④「このターン終了時、それをバニッシュ」が即時BANISHになっている。

## 7. ゲート・差分・報告書実読

`npm run gates` は全緑（exit 0）。実測は typecheck PASS / golden **2325/0** / smoke **10693 OK・CRASH 0・HANG 0・INVARIANT 0・SKIP 0** / fuzz **200ゲーム・異常0** / census **783/783** / census:stubs **無言no-op 0・明示defer 0** / manual-fields **0** / lint **0 errors / 260 warnings**。

`git status --short` は作業開始前から指定された `docs/CODEX_GUIDE.md`、`docs/PLAN.md`、`docs/_census_stubs.txt`、`docs/_vocab_census.txt` の M と、既存の未追跡監査成果物群を表示し、今回追加したのは `stage1_batch6_triage.md` だけ。`git diff --stat` は既存tracked差分の **2 files changed, 36 insertions(+), 2 deletions(-)** のみで、新しいtrackedファイルは現れていない。既存ファイルは1文字も編集していない。

報告書を書き終えた後の `wc -c` 相当（`Get-Item.Length`）実測は **31351 bytes**。その後、先頭20行と末尾20行を `Get-Content -TotalCount 20` / `Get-Content -Tail 20` で実読し、先頭が本見出し・サマリ表、末尾が§8一覧まで存在しており、`undefined` 1行化や途中欠落がないことを確認した。

## 8. ガードレール2・3・5で当初見立てから変えた件

- **G008 2件**: 可変回数は新機構と思ったが、`countChoose` が `center_lrig_level` のNumberOrRefを消費する実装を確認し、機構待ちから通常の真バグへ変更。
- **G009 2件**: parserコメントだけなら機構待ち候補だったが、`matchesFilter` / `execUtils` の `levelParity` 実評価を確認し通常の真バグへ変更。
- **G010 2件**: 「同じ回数行う」を専用反復機構待ちとする初見から、`execChoose.countChoose` と `allowRepeat` / `resumeChoose` の重複id実行を確認して通常の真バグへ変更。
- **G013 WXK10-023-E1**: G013共通で機構待ちとせず、当該liveのコストがSIGNI1枚で `classMatchesDiscardSigni` consumerが成立するため通常の真バグへ変更。
- **G014 WX21-039-E1**: `NO_COMMON_COLOR_AMONG_FIELD_SIGNI` が既存なので通常修正と見たが、1枚枝のsource対他天使条件は別consumerで未実装のため機構待ちへ変更。
- **G017 2件**: 素のLRIG actionのセンター直結だけでは遅延を表せないが、`GRANT_LRIG_ABILITY` のON_ATTACK_LRIG付与と `BLOCK_ACTION END_OF_ATTACK` を確認し機構待ちから通常の真バグへ変更。
- **G018 WX25-P2-042-E1**: live表面の即時 `NEGATE_ATTACK` を真バグとする初見を、action固有consumerが次回攻撃予約として保存する実コードで反証し偽陽性へ変更。
- **G018 WX25-CP1-008-E1**: 同じ「次にアタック」でも、INSTALL_DELAYED_TRIGGER collectorが予約対象cardNumを照合しないため偽陽性を横展開せず真バグ＋機構待ちに留めた。
- **G020 2件**: `levelEqLastProcessed` の名前だけなら既存機構で直せそうだったが、複数捨て札の各levelを1対1反復するconsumerではないため機構待ちへ変更。

---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## 🟢 品質は第4・第5バッチ水準を維持
成果物正常着地（31,351 bytes・自己申告一致）。根拠列は行ごとに固有。ゲート独立実行＝全緑・ベースライン一致
（golden 2325/0・smoke 10693 OK・fuzz 0・census 783/783・census:stubs 0・manual-fields 0・lint 0 err/260 warn）。既存ファイル変更0。

## 先回りメモへの応答＝**3件とも指示どおり engine を確認している**
- **G009（レベルが奇数）**＝`matchesFilter` の `levelParity` を実コードで確認し、**「機構待ち」ではなく「真バグ（parser が生成していないだけ）」**に分類。
  ✅Claude 独立確認＝`execUtils.ts:778-782` に `filter.levelParity` の 'even'/'odd' 判定が実在。**指示した「機構待ちと書く前に engine を確認」が機能した。**
- **G018** は2件を一括せず、`WX25-P2-042-E1` だけ偽陽性・`WX25-CP1-008-E1` は真バグ＋機構待ちに割った（`INSTALL_DELAYED_TRIGGER` collector が予約対象 cardNum を照合しない）。
- **G020** は `levelEqLastProcessed` という**名前が近い既存語彙を借りかけて、consumer が「複数捨て札の各 level を1対1反復する」形ではないと確認して機構待ちへ変更**＝§5-5e の事故を自力で回避。

## サンプリング裏取り＝**3件とも実コードで一致・引用行も正確**
- `execUtils.ts:778-782`（`levelParity`）✅
- `execNegateAttack`（`effectExecutor.ts:6258`）が `negated_attacks` へ事前登録（`:6283`）✅＝唯一の偽陽性の根拠は正しい
- `WXK02-089-E1` の live を直接確認＝`LOOK_AND_REORDER{count:1, reorder:false}` に対し原文は「カード**２枚**を**好きな順番で**」＝真バグ確定 ✅

## 🟡 偽陽性率の低下傾向は注視が要る
バッチ推移＝**25% → 10% → 2.5%**（第4→第5→第6）。第3バッチの 0%（テンプレート化）とは違い、
今回は §5 の自己評価が具体的で、**偽陽性1件も実コードを開いて掘り当てている**し、§8 の見立て変更も両方向に動いている。
とはいえ**単調に下がっている**＝母集団の性質（残存クラスタが「対象型・owner・移動元の単純脱落」中心）で説明はつくが、
**次バッチでは「真バグと判定した件について、どの慣例エンコードを検討して外したか」を明示させる**（＝過小申告の直接の検出策）。

## 🟢 副産物＝条件以外の食い違いが 7 effect・10項目（前回4件）
§5-6 の指示が効き続けている。⚠**段2 で該当効果を触るときは finding の指摘だけ直すと残りが残る。**
