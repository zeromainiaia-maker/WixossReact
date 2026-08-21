# clean群 round1 段1 batch7 triage

判定日: 2026-08-21。対象は H001〜H017 の34 findings（32カード）。live JSON、原文、各 action/timing の実 consumer を個別照合した。全件 `parseStatus:AUTO`（MANUAL/PARTIAL 0件）。「真バグ かつ 機構待ち」は真バグ・機構待ち双方へ計上する。

## 1. サマリ

| cluster | quote | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---|---:|---:|---:|---:|
| H001 | 手札からカード２枚 | 2 | 0 | 0 | 0 |
| H002 | 色が合計３種類以上ある場合 | 2 | 0 | 2 | 0 |
| H003 | 新たに得られない | 1 | 1 | 0 | 0 |
| H004 | 赤のシグニ１体の上に置く | 0 | 2 | 0 | 0 |
| H005 | 赤のシグニがある場合 | 2 | 0 | 0 | 0 |
| H006 | 対戦相手の、能力か効果 | 2 | 0 | 0 | 0 |
| H007 | 対戦相手のシグニ１体を対象 | 2 | 0 | 0 | 0 |
| H008 | 対戦相手のデッキ | 2 | 0 | 0 | 0 |
| H009 | 対戦相手の効果を受けない | 2 | 0 | 0 | 0 |
| H010 | 対戦相手の中央のシグニゾーン | 2 | 0 | 0 | 0 |
| H011 | 対戦相手は自分のトラッシュ | 2 | 0 | 0 | 0 |
| H012 | 能力を持たないシグニがある場合 | 2 | 0 | 0 | 0 |
| H013 | 白と黒のシグニがあるかぎり | 2 | 0 | 0 | 0 |
| H014 | 表向きにしてトラッシュに置き | 0 | 2 | 0 | 0 |
| H015 | 枚数×1000以下 | 2 | 0 | 2 | 0 |
| H016 | 無色のカードを１枚選び | 2 | 0 | 0 | 0 |
| H017 | 名前の異なる | 2 | 0 | 0 | 0 |
| **計** |  | **29** | **5** | **4** | **0** |

## 2. finding 全34件の分類

| effectId | parseStatus | 分類 | 根拠（live JSON と原文） | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|
| WDK05-R01-E2 | AUTO | 真バグ | live `SEQUENCE` 第2段は `LOOK_AND_REORDER{source:hand,count:1,destination:deck/bottom}`だが原文は手札2枚。 | `execLookAndReorder` | `count`省略時既定や自動加算を検討したが、live は明示値1をそのまま選択上限に使う。 | 手札からカード２枚を好きな順番でデッキの一番下に置く |
| WXK02-089-E1 | AUTO | 真バグ | live の手札→デッキ下 action は `count:1`、原文の単位は2枚。 | `execLookAndReorder` | DRAWの`count:2`との連動を検討したが、後段の独立actionへ枚数伝播はない。 | 手札からカード２枚を好きな順番でデッキの一番下に置く |
| WXDi-D06-015-E1 | AUTO | 真バグ＋機構待ち | live は無色エナ3個の `cost.energy` の直後に無条件 `BANISH`、原文は支払ったカードの有色3種類以上（無色除外）が条件。 | 無し＝機構待ち（`payCost`/`analyzeCost`から支払カード色集合を記録し、`evalCondition`で評価する配線が必要） | `HAS_CARD_IN_FIELD.distinctColors`は場の現存シグニを数えるだけ、`SelectionConstraint`にもdistinct colorは無く支払履歴を表せない。 | このコストでトラッシュに置いたカードが持つ色が合計３種類以上ある場合 |
| WXDi-P04-071-E1 | AUTO | 真バグ＋機構待ち | live `cost.energyTrash{count:3,story:天使}`から `GRANT_KEYWORD`へ直結し、原文の支払3枚の色数条件がない。 | 無し＝機構待ち（`execUtils`のenergyTrash支払結果を色集合として保持し`evalCondition`へ渡す必要） | `selectionConstraint.sharedColor:'none'`は全カード間で共有色なしを要求し「合計3色以上」と非同値、`distinctColors`は場条件専用。 | この方法でトラッシュに置いたカードが持つ色が合計３種類以上ある場合 |
| WX19-022-BURST | AUTO | 真バグ | live は `DRAW`後に `REMOVE_ABILITIES{SIGNI,opponent,count:ALL}`のみ。これはシグニの新規付与も抑止するが、原文の対戦相手センタールリグが対象外。 | `execRemoveAbilities`／`collectFieldGrantedKeywords` | `REMOVE_ABILITIES`が対象シグニへの新規keyword付与を止める慣例は成立するため外していない。ただしLRIG欠落は救えない。 | 対戦相手のセンタールリグとすべてのシグニは能力を失い、新たに得られない |
| WXDi-P00-002-E1 | AUTO | 偽陽性 | live `REMOVE_ABILITIES.keywords:[アサシン,ランサー,ダブルクラッシュ],until:UNTIL_END_OF_TURN`は`keyword_abilities_removed`へ記録され、同キーワードの再付与を拒否する（`effectEngine.ts:4042-4048`）。 | `execRemoveAbilities`／`collectFieldGrantedKeywords` | 該当なし | それは【アサシン】【ランサー】【ダブルクラッシュ】を失い、新たに得られない |
| WXDi-D09-H13（effectIdなし） | AUTO | 偽陽性 | 効果JSONにライズ条件を置かない慣例。`getRiseFilter`がCardDataのEffectTextから赤filterを作り、召喚時に`matchesRiseFilter`で既存トップを検査する（`BattleScreen.tsx:5840-5848`）。 | `getRiseFilter`／`matchesRiseFilter` | 該当なし | 【ライズ】あなたの赤のシグニ１体の上に置く |
| WXDi-P07-067（effectIdなし） | AUTO | 偽陽性 | CardData原文に【ライズ】があり、JSON effectId不在でも召喚経路がEffectTextを直接読み、赤シグニ上以外を拒否する。 | `getRiseFilter`／`handleSummonSigni` | 該当なし | 【ライズ】あなたの赤のシグニ１体の上に置く |
| WX10-054-E2 | AUTO | 真バグ | live `CONTINUOUS POWER_SET{value:12000}`に`activeCondition`がなく、原文の自分場の赤シグニ存在条件が脱落。 | `checkActiveCondition(HAS_CARD_IN_FIELD)`／`calcFieldPowers` | CONTINUOUS単体targetがhostへ自動適用される慣例は対象同定だけで、赤存在ゲートを補わない。 | あなたの場に赤のシグニがある場合 |
| WXDi-D01-007-E1 | AUTO | 真バグ | live はBANISH対象filterに`color:赤`を誤配置し、後続DRAW/ENERGY_CHARGEも無条件。原文は自分場の赤・青・緑存在で各段を別々にゲートする。 | `evalCondition(HAS_CARD_IN_FIELD)`／`execSequence` | 色filterを条件代用とみなせない。前者は相手対象の色、原文は自分場の存在色で主語が異なる。 | あなたの場に赤のシグニがある場合 |
| WX24-P4-102-E1 | AUTO | 真バグ | live `ON_TARGETED`は`triggerCondition:{turnOwner:opponent}`だけで、原文の対象化した能力・効果の使用者が相手というorigin限定がない。 | `collectTargetedTriggers`（`targetedOrigins`） | 相手ターン慣例を検討したが、自ターン中に相手が使う効果もありsource owner条件とは同値でない。 | 対戦相手の、能力か効果の対象になったとき |
| WX25-P2-055-E2 | AUTO | 真バグ | live `ON_TARGETED`には`triggerCondition`自体がなく、誰の効果で対象になっても自身の常能力を失う。 | `collectTargetedTriggers`（`targetedOrigins`） | `triggerScope:self`省略は「対象になったこのカード」を表すだけで、originのownerを制限しない。 | 対戦相手の、能力か効果の対象になったとき |
| WX02-020-E1 | AUTO | 真バグ | live は自シグニTRASH後に新規相手SIGNIをBANISHし、原文で先に対象とした相手シグニの同一性を保持しない。 | `execTrash`／stored-target consumer（`targetsStored`） | did-it `CONDITIONAL{IS_MY_TURN}`は支払成功だけをゲートし、事前対象の同一性を保存しない。 | 対戦相手のシグニ１体を対象とし…そうした場合、それをバニッシュする |
| WX22-001-E2 | AUTO | 真バグ | live 第1段は`TRASH{owner:opponent,story:遊具}`で、原文の自分の遊具1体をコスト様に場から置く主語が反転し、後段も相手を新規選択する。 | `execTrash`／stored-target consumer | did-it placeholderは前段成功を見ても、原文の事前対象と後段POWER_MODIFYを結び付けない。 | 対戦相手のシグニ１体を対象とし、あなたの＜遊具＞のシグニ１体を場からトラッシュに置く |
| WX10-071-E1 | AUTO | 真バグ | live `LOOK_AND_REORDER.source.owner:self`は自分のdeck topを見てself deck topへ戻すが、原文は相手deck。 | `execLookAndReorder` | `ON_ATTACK_SIGNI triggerScope:self`は攻撃者のscopeであり、見るdeck ownerを反転する慣例ではない。 | 対戦相手のデッキの一番上を見る |
| WX24-P1-048-E1 | AUTO | 真バグ | live `TRASH.target{type:DECK_CARD,owner:self,count:1}`、原文は対戦相手のdeck top。 | `execTrash` | `triggerScope:any_ally`はバニッシュされた味方の収集範囲だけでaction ownerを相手へ変えない。 | 対戦相手のデッキの一番上のカードをトラッシュに置く |
| WXK01-001-E2 | AUTO | 真バグ | live は手札2枚TRASH→`LAST_PROCESSED_COUNT_GTE:2`→相手GUARD禁止だけで、原文のこのLRIGへの全相手効果耐性が欠落。 | `execGrantProtection`／`collectEffectImmuneSigni`（center-lrig host・granted storeも走査） | did-it gateは正しく成立するがthen内に保護actionが無く、自動補完されない。 | ターン終了時まで、このルリグは「対戦相手の効果を受けない。」を得 |
| WXK10-104-E1 | AUTO | 真バグ | live choice②は`GRANT_PROTECTION.target.type:SIGNI,from:[ルリグ],duration:PERMANENT`で、原文のセンターLRIG・相手の全効果・ターン終了までと3軸不一致。 | `execGrantProtection`／`collectEffectImmuneSigni` | `from:[ルリグ]`を全効果の略記とはできない。正準形`fromAll:true,sourceOwner:opponent`をcollectorが読む。 | センタールリグ１体を対象とし、ターン終了時まで…対戦相手の効果を受けない |
| SPDi43-14-E1 | AUTO | 真バグ | live CONTINUOUS `POWER_MODIFY.target{owner:any,count:1}`に中央zone限定がなく、原文は相手中央1体。 | `calcFieldPowers`／`matchesStateFilter(centerZoneOnly)` | CONTINUOUS単体targetのhost自動適用慣例はowner:anyのため自分hostへ誤適用し、相手中央を導けない。 | 対戦相手の中央のシグニゾーンにあるシグニ |
| WXDi-D06-004-E1 | AUTO | 真バグ | live `POWER_MODIFY.target{owner:any,count:1}`は所有者・位置とも無限定、原文は相手中央zone。 | `calcFieldPowers`／`matchesStateFilter(centerZoneOnly)` | `activeCondition TURN_OWNER:self`は適用ターンだけを絞り、target owner/zoneを補わない。 | 対戦相手の中央のシグニゾーンにあるシグニ |
| WXK11-006-E1-G | AUTO | 真バグ | 付与能力live第2段は`TRANSFER_TO_HAND.source{TRASH_CARD,owner:self}`だが、原文は対戦相手が自分のtrashから自分のhandへ選ぶ。 | `execTransferToHand`／`opponentResponds`選択配線 | `GRANT_LRIG_ABILITY`内ではownerが付与先基準へ自動反転する慣例はなく、actionのselfは解決者側のまま。 | 対戦相手は自分のトラッシュから対象のシグニを１枚まで手札に加える |
| WXK11-006-E1-G2 | AUTO | 真バグ | 付与能力live後段は`ADD_TO_LIFE{owner:self,count:1,fromTop:true}`、原文は相手trashからこちらが選んだカードを相手lifeへ加える。 | `execAddToLife`（`fromTrash`・owner）／`opponentResponds` | BOUNCE前段の相手ownerは後段へ継承されず、`fromTop:true`をtrash選択の慣例とはできない。 | 対戦相手は自分のトラッシュからあなたの選んだカード１枚をライフクロスに加える |
| WX12-041-E1 | AUTO | 真バグ | live `ON_PLAY`から無条件`ENERGY_CHARGE_FROM_DECK count:1`、原文の相手場に能力なしシグニ存在条件がない。 | `evalCondition(HAS_CARD_IN_FIELD)`／`hasNoAbility` | `noAbilities`は既存で`abilities_removed`も統合評価するため、機構待ちではなくparser脱落。 | 対戦相手の場に能力を持たないシグニがある場合 |
| WX12-042-E1 | AUTO | 真バグ | live `ON_PLAY action:DRAW{self,1}`にconditionなし、原文は相手場の能力なしシグニが前提。 | `evalCondition(HAS_CARD_IN_FIELD)`／`hasNoAbility` | ON_PLAY候補収集は盤面条件を暗黙評価しない。既存`filter.noAbilities:true`を条件に置けばconsumerが読む。 | 対戦相手の場に能力を持たないシグニがある場合 |
| WX20-Re07-E2 | AUTO | 真バグ | live CONTINUOUS相手ALLへ-2000に`activeCondition`なし、原文は自分場に白と黒双方がある間だけ。 | `checkActiveCondition(AND/HAS_CARD_IN_FIELD)`／`calcFieldPowers` | target owner:opponentは正しいが、色条件を対象filterへ寄せる慣例ではなく自分場2条件が必要。 | あなたの場に白と黒のシグニがあるかぎり |
| WX20-Re09-E2 | AUTO | 真バグ | live 自分ALLへ+1000が恒常適用され、白・黒シグニの同時存在を表す`activeCondition`がない。 | `checkActiveCondition(AND/HAS_CARD_IN_FIELD)`／`calcFieldPowers` | `HAS_CARD_IN_FIELD.distinctColors`も検討したが、多色1体で白黒を満たす原文解釈を避け、白存在AND黒存在が正確。 | あなたの場に白と黒のシグニがあるかぎり |
| WX24-P3-014-E2 | AUTO | 偽陽性 | delayed SEQUENCEの`REVEAL_FACEDOWN_LRIG_ZONE`自体が伏せカードをtrashへ移し`lastProcessedCards`へ載せる（`effectExecutor.ts:7947-7962`）。 | `REVEAL_FACEDOWN_LRIG_ZONE` executor | 該当なし | そのカードを表向きにしてトラッシュに置き |
| WX25-P2-051-E2 | AUTO | 偽陽性 | delayed第1段`REVEAL_FACEDOWN_LRIG_ZONE`が公開とtrash移動を一体実行し、後段DOWNの`levelEqLastProcessed`へlevelを渡す。 | `REVEAL_FACEDOWN_LRIG_ZONE` executor／`resolveDynamicFilter` | 該当なし | そのカードを表向きにしてトラッシュに置き |
| WX11-041-E2 | AUTO | 真バグ＋機構待ち | live BANISH filterは対象自身を`story:[鉱石,宝石]`に限定するだけ。原文は自分trashの両クラス枚数合計×1000以下という動的power上限。 | 無し＝機構待ち（`resolveDynamicFilter`へtrash count×倍率のpowerRange解決を追加し`execBanish`から渡す必要） | `POWER_MODIFY_PER_TRASH_COUNT`はpower修整actionで対象選択閾値ではなく、`countFromZone`は処理枚数用なので転用不可。 | パワーが「あなたのトラッシュにある＜鉱石＞と＜宝石＞のシグニを合わせた枚数×1000」以下 |
| WX17-Re02-E2 | AUTO | 真バグ＋機構待ち | live BANISH filterは相手対象を`story:龍獣`へ誤限定し、原文の自分trash龍獣枚数×1000以下powerがない。 | 無し＝機構待ち（`resolveDynamicFilter`＋`execBanish`にtrash filtered count multiplier配線） | `powerLteSelf`等は単一参照カードのpower、`POWER_MODIFY_PER_TRASH_COUNT`はdelta生成であり動的選択上限を読まない。 | パワーが「あなたのトラッシュにある＜龍獣＞のシグニの枚数×1000」以下 |
| WX17-071-BURST | AUTO | 真バグ | live choice②`TRASH.target{HAND_CARD,owner:opponent,count:1,actingPlayerSelects:true}`にcolor filterがなく、有色も捨てられる。 | `execTrash`／`matchesFilter` | `actingPlayerSelects:true`は誰が相手手札を選ぶかだけで、無色条件を暗黙付与しない。 | 対戦相手の手札を見て無色のカードを１枚選び、捨てさせる |
| WX17-071-TRAP | AUTO | 真バグ | TRAP版choice②も同じく相手HAND_CARDへ`filter`不在で、原文の無色限定が脱落。 | `execTrash`／`matchesFilter(color)` | owner:opponentから無色を推定する慣例はない。`filter.color:'無'`をconsumerが直接読む。 | 対戦相手の手札を見て無色のカードを１枚選び、捨てさせる |
| WX06-001-E3 | AUTO | 真バグ | live `TRANSFER_TO_DECK.source{TRASH_CARD,count:7,story:天使}`に`selectionConstraint`がなく、同名7枚を選べる。 | `execTransferToDeck`／`selectOrInteract(selectionConstraint)` | `TRASH_HAS_CARD.distinctName`は所持条件用で実選択を拘束しない。source直下`selectionConstraint.distinct:'name'`が必要。 | トラッシュから名前の異なる＜天使＞のシグニ７枚 |
| WX21-065-E1 | AUTO | 真バグ | live `REVEAL.source{HAND_CARD,count:2,upToCount:true,story:龍獣}`に`selectionConstraint`がなく同名2枚を公開可能。 | `execReveal`／`selectOrInteract(selectionConstraint)` | `filter.eachDistinct*`は表示用か未enforceで、実装済み正準形はsourceの`selectionConstraint.distinct:'name'`。 | 手札から名前の異なる＜龍獣＞のシグニを２枚まで公開 |

## 3. クラスタ所見

- **H001**: 2件とも手札→デッキ下の明示`count:1`。単純な枚数退化。
- **H002**: 2件とも支払カード集合の「有色3種類」を後段条件にする履歴がない。場の`distinctColors`や既存SelectionConstraintでは代用不可。
- **H003**: 結論が割れた。WXDi-P00-002は指定keywordのREMOVE_ABILITIESが再付与抑止まで内包する慣例。WX19-022は同慣例で相手シグニは救えるが、センターLRIG自体がtargetから脱落。
- **H004**: 2件ともJSON外のEffectText駆動ライズ慣例で偽陽性。
- **H005**: 1件はactiveCondition丸ごと欠落、1件は三色の独立条件が対象色filter/無条件後段へ崩壊。
- **H006**: ON_TARGETEDのscope/turnOwnerとorigin ownerは別軸。2件とも`targetedOrigins`欠落。
- **H007**: 2件とも事前対象を保存して後段へ渡す構造がなく、did-it gateだけでは不足。
- **H008**: deck ownerのself/opponent反転が2件。
- **H009**: 2件とも真バグ。SEQUENCE再帰の5条件ゲートを確認したが、WXK01は保護action自体がなく、WXK10はCHOOSE内なのでCONTINUOUS SEQUENCE抽出の慣例対象でもない。
- **H010**: 2件ともCONTINUOUS targetのownerとcenterZoneOnlyが脱落。
- **H011**: 同一カードの付与能力2本だが、前者は相手trash→相手hand、後者は相手trash→相手life＋こちらが選ぶという別配線。
- **H012**: 2件とも統一済み`hasNoAbility`で修正可能。機構待ちではない。
- **H013**: 2件とも白存在AND黒存在activeConditionの欠落。対象ownerだけが異なる。
- **H014**: 2件とも`REVEAL_FACEDOWN_LRIG_ZONE`が公開＋trash＋lastProcessed記録を一体化しており偽陽性。
- **H015**: 2件とも対象自身のstory filterへ誤変換。trash filtered count×1000をpower上限へ解決する語彙・配線がない。
- **H016**: BURST/TRAPの同一choice退化。相手手札選択は実装済みでcolor filterだけ欠落。
- **H017**: 2件とも既存`selectionConstraint.distinct:'name'`を選択元へ付ければconsumerが実拘束する。

## 4. 機構待ち一覧

| effectId | 不足機構・配線 |
|---|---|
| WXDi-D06-015-E1 | コスト支払で実際にtrashへ置いたenergyカードを記録し、無色を除く色集合数を条件評価する`payCost`→`evalCondition`配線。 |
| WXDi-P04-071-E1 | `energyTrash`で選んだ3枚の色集合を支払結果として保持し、後段GRANT_KEYWORD前に3色以上を判定する配線。 |
| WX11-041-E2 | `resolveDynamicFilter`でself trashの鉱石/宝石SIGNI数×1000を`powerRange.max`へ解決し、`execBanish`へ渡す語彙。 |
| WX17-Re02-E2 | 同じ動的上限機構のcountFilter=龍獣版。対象側の龍獣filterでは代用不可。 |

## 5. 偽陽性件数の自己評価

偽陽性は5/34＝14.7%、precision換算85.3%。パイロット78〜84%より真バグ率が1.3ポイント高いが、前回2.5%より偽陽性を拾えている。5件はいずれも実コード固有の慣例で、内訳はEffectText直読みのライズ2件、REMOVE_ABILITIESの再付与抑止1件、公開とtrash移動を一体化したaction2件。数字合わせではなく、今回指示された疑わしいH003/H004/H014をconsumerまで追った結果である。

## 6. 条件以外で見つけた原文との食い違い

8 effect・13項目。

- `WX19-022-BURST`: センタールリグの能力喪失・新規取得禁止が丸ごと欠落（H003判定本体にも反映）。
- `WXDi-D01-007-E1`: 青シグニ存在条件なしでDRAW2、緑シグニ存在条件なしでENERGY_CHARGE2が発火する。
- `WX22-001-E2`: 原文のtrash対象は自分の＜遊具＞だがliveは相手の＜遊具＞。さらに事前対象と後段-12000の同一性もない。
- `WXK10-104-E1`: choice②のtargetがLRIGでなくSIGNI、durationがUNTIL_END_OF_TURNでなくPERMANENT。choice①も2 keywordを同一事前対象へ束ねず別々に選ぶ。choice全体の「センタールリグlevel回」反復もliveにない。
- `SPDi43-14-E1`: target ownerがopponentでなくany。
- `WXDi-D06-004-E1`: target ownerがopponentでなくany。
- `WXK11-006-E1-G`: 先行GRANT_KEYWORDが「相手センターLRIG1体と相手SIGNI1体」ではなく`CENTER_LRIG_OR_SIGNI count:2`で同種2体も選べる。
- `WXK11-006-E1-G2`: ADD_TO_LIFE ownerが相手でなくself、移動元がtrashでなくdeck top、選択者指定も欠落。

## 7. ゲート・差分・成果物確認

`npm run gates` 全緑（実測）:

- typecheck PASS
- golden PASS **2325 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census **783 / baseline 783**
- census:stubs 無言no-op **0**（🔴0 / C群0）
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は作業開始前からのM 4本（`docs/CODEX_GUIDE.md`、`docs/PLAN.md`、`docs/_census_stubs.txt`、`docs/_vocab_census.txt`）と既存のsemantic-audit未追跡群に、本報告書`stage1_batch7_triage.md`が加わった状態。`git diff --stat`は既存Mのうち`docs/CODEX_GUIDE.md` 10行、`docs/PLAN.md` 40行だけ（計2 files, 48 insertions, 2 deletions）で、**今回の作業により新しく現れたtrackedファイル・tracked差分は0**。報告書以外の既存ファイルは変更していない。

報告書はUTF-8、先頭20行・末尾20行を読み返し済み。最終`wc -c`相当（PowerShell `Get-Item.Length`）は **23,319 bytes**。

## 8. ガードレール2・3・5で当初見立てから変えた件

- `WXDi-P00-002-E1`: JSONだけでは「新たに得られない」が欠落に見えたが、REMOVE_ABILITIES consumerが`keyword_abilities_removed`を参照して再付与を止めるため真バグ候補→偽陽性。
- `WXDi-D09-H13`／`WXDi-P07-067`: effectIdなしを欠落とみなしかけたが、召喚action固有のEffectText直読みを確認して偽陽性。
- `WX24-P3-014-E2`／`WX25-P2-051-E2`: REVEAL後にTRASH actionが無い表面構造から真バグと見たが、そのaction自身がtrash移動まで行うため偽陽性。
- `WXDi-D06-015-E1`／`WXDi-P04-071-E1`: `distinctColors`またはselectionConstraintで直せる見立てを外し、支払履歴consumer不在のため真バグ＋機構待ち。
- `WX11-041-E2`／`WX17-Re02-E2`: `POWER_MODIFY_PER_TRASH_COUNT`の近似利用を外した。同actionはpower delta付与でBANISHの対象閾値を生成しないため真バグ＋機構待ち。

---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## 🟢 追加要求（過小申告の検出策）が機能した
分類表に新設した「**検討して外した慣例エンコード**」列は**行ごとに固有の内容**が入っている
（例＝`WDK05-R01-E2`「`count` 省略時既定や自動加算を検討したが、live は明示値1をそのまま選択上限に使う」／
`WXK02-089-E1`「DRAW の `count:2` との連動を検討したが、後段の独立 action へ枚数伝播はない」）。テンプレートではない。

**偽陽性率が 14.7%（5/34）へ回復**＝第4→第7 で **25% → 10% → 2.5% → 14.7%**。単調低下が止まった。
§8 の見立て変更も**5件が両方向**（3件→偽陽性／2件→真バグ＋機構待ち）。

## ゲート独立実行＝ベースライン一致・全緑
golden 2325/0・smoke 10693 OK・fuzz 0・census 783/783・census:stubs 0・manual-fields 0・lint 0 err/260 warn。
成果物 23,319 bytes（自己申告一致）。既存ファイル変更0。

## 偽陽性のサンプリング裏取り＝実コードで一致
`WXDi-P00-002-E1`（H003「新たに得られない」）＝`REMOVE_ABILITIES` が `keyword_abilities_removed` に記録し、
**付与側4箇所が `isKeywordAbilityRemoved()` で再付与を拒否する**ことを確認（`effectExecutor.ts:3523,3541,3600`／`effectEngine.ts:4042`）。
＝「新たに得られない」の意味は engine に実装済み。指摘は JSON の表面だけを見た誤読。✅

## 🟢 副産物＝条件以外の食い違いが 8 effect・13項目（前回 7/10）
⚠**段2 で該当効果を触るときは finding の指摘だけ直すと残りが残る。**

---

# 🏁 段1（クラスタ段）総括＝2026-08-21 完了

| バッチ | クラスタ | findings | 真バグ | 偽陽性 | 機構待ち |
|---|---:|---:|---:|---:|---:|
| 第1 | 10 | 101 | 36 | 65 | 0 |
| 第2 | 20 | 101 | 88 | 13 | 2※ |
| 第3 | 40 | 107 | 107 | 0 | 25 |
| 第4 | 20 | 40 | 30 | 10 | 15 |
| 第5 | 20 | 40 | 36 | 4 | 8 |
| 第6 | 20 | 40 | 39 | 1 | 15 |
| 第7 | 17 | 34 | 29 | 5 | 4 |
| **計** | **147** | **463** | **365** | **98** | **69** |

※第2バッチの機構待ちは Codex 申告0を Claude の検証で2件へ訂正（`collectLeaveFieldTriggers` の self スコープ穴）。
※第1バッチは段0 修正**前**のクラスタ表から切り出したため、修正後の460件と3件の差がある（差分3件は段0 が後から `FP_DIDIT_GATE` へ再分類）。

**🔑 全体の偽陽性率＝98/463＝21.2%**＝パイロット実測の precision 78〜84%（偽陽性16〜22%）**の帯にちょうど収まった**。
個々のバッチでは 0%〜65% とばらついたが、**母集団を跨いだ総計はパイロットと整合する**＝triage 全体の妥当性の裏付け。

## 段1 が残した恒久的な資産
- **engine 慣例エンコードの一覧（13機構）**＝did-it ゲート／`temp_power_mods`／`POWER_SET`・`GRANT_KEYWORD`・`UP` の source 自動適用（**DOWN には無い**）／
  `calcFieldPowers` の CONTINUOUS 直適用／`analyzeBeatSigniCost` の原文 regex 駆動／`resumeSearch` の deck-placement 特例／
  `LRIG` はセンタートップ直結／`collectTurnTriggers` の scope／`ON_SIGNI_BANISH_OPPONENT` はバトル限定／
  `levelParity`／`isKeywordAbilityRemoved`。**これらは「JSON を見るだけでは分からない」＝段2 で必ず参照する。**
- **機構待ち69件**＝parser では直せず engine 配線が先。§6.3／Opusタスク12 行き。
- **条件以外の食い違い**が第4バッチ以降で 1→4→10→13項目と増加＝**段2 は finding の指摘だけ直してはいけない。**
