# 意味照合監査 clean群 round1 段1 第20バッチ triage（軸 `cost`）

対象は `stage1_batch20.txt` の21 findings / 21 effectId（S001のみ live/effectIdなし）。既存実装は変更していない。分類の「機構待ち」は真バグとの重複計上である。

## 1. サマリ

### action型別

| action型 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| (live無) | 1 | 1 | 0 | 1 | 0 |
| ADD_TO_FIELD | 2 | 1 | 1 | 1 | 0 |
| BANISH | 2 | 2 | 0 | 1 | 0 |
| BOUNCE | 1 | 1 | 0 | 1 | 0 |
| CHOOSE | 2 | 2 | 0 | 2 | 0 |
| COST_SUBSTITUTE | 2 | 0 | 2 | 0 | 0 |
| DOWN | 1 | 1 | 0 | 1 | 0 |
| DRAW | 2 | 1 | 1 | 1 | 0 |
| EXILE | 1 | 1 | 0 | 1 | 0 |
| FORCE_END_TURN | 1 | 1 | 0 | 1 | 0 |
| POWER_MODIFY | 1 | 1 | 0 | 1 | 0 |
| REVEAL_AND_PICK | 1 | 1 | 0 | 0 | 0 |
| SEQUENCE | 4 | 4 | 0 | 3 | 0 |
| **計** | **21** | **17** | **4** | **14** | **0** |

### コスト退化の型別（全21件を排他的に計上）

| 退化の型 | 件数 | findings |
|---|---:|---|
| ①専用フィールドが在るのに別フィールドを使った | 0 | S009/S010は表面上この形だが、実行時の色overrideで正しいため④ではなく⑥の偽陽性へ分類 |
| ②組コスト（`*Groups`）の脱落 | 1 | S004 |
| ③コスト自体が丸ごと欠落 | 7 | S002, S005, S006, S011, S016, S017, S021 |
| ④原文regex駆動の慣例に衝突（偽陽性） | 2 | S003, S012 |
| ⑤語彙が無い（色制限・可変増加・ゾーン跨ぎの組等） | 4 | S001, S007, S014, S019 |
| ⑥その他 | 7 | S008, S009, S010, S013, S015, S018, S020 |

## 2. finding 全21件の分類表

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | PR-K048 | live無 | 真バグ＋機構待ち | live自体がなく、`EnergyCost`は色と枚数だけで「無色要求を白・赤・青だけで支払う」許可色集合を保持しない。 | 型なし／可否は各 `canAfford*`・`canPay*` が色要求を読むが許可色なし／支払funnelも同様／UIへ表示する制限値なし。 | `cannot_pay_colorless_this_attack_phase`は無色支払の全面禁止であり、3色だけ許す正集合ではない。 | 「《無》コストは白か赤か青でしか支払えない」 |
| S002 | WX18-036-E3 | AUTO | 真バグ＋機構待ち | liveは`fieldTrash`しか持たず、手札で公開した発動元instanceを後段`ADD_TO_FIELD.source`へ固定せず任意の手札シグニを候補にする。 | `EffectCost`に通常起動用`handReveal`なし（`StubAction`任意コストには別型あり）／`signiActivateGate`に検算なし／`performSigniActivated`に公開・identity保持なし／`SigniActivatedModal`に選択UIなし。 | `discardSelfFromHand`は公開後も手札に残して場へ出す支払いではなく、`source.filter.cardNum`も同名別instanceを区別しない。 | 「このカードを手札から公開し」 |
| S003 | WXK08-046-E1 | AUTO | 偽陽性 | `analyzeBeatSigniCost` (`execUtils.ts:1005-1028`) がEffectTextの「このシグニを【ビート】に」をregexで読み`includeSelf=true, otherPart=0`にする。 | 型`beat_signi`あり／`canAffordOptionalCostSpec`と起動gateは同解析でself在場を検算／`payBeatSigniCost`がself zoneを移動／両起動モーダルも同解析を表示・選択に使用。 | JSONのcountだけを見る解釈を外した。原文駆動が対象主語を補う13機構の一つ。 | 「このシグニを【ビート】にする」 |
| S004 | WXDi-P10-007-E2 | AUTO | 真バグ | liveのcostは青1だけで、既存`discardGroups`なら`[{SIGNI,1},{SPELL,1}]`を同一手札から別々に要求できる。 | 型あり／`canSatisfyDiscardGroups`と起動gateが充足検算／`performSigniActivated`が選択札をtrashへ移動／`SigniActivatedModal`がgroup別候補と確定可否を表示。 | 単一`discard:2`は種類quotaを失い、`handDiscardSigni`はスペル組を表せないため外した。 | 「シグニ１枚とスペル１枚を捨てる」 |
| S005 | WXDi-P12-031-E2 | AUTO | 真バグ＋機構待ち | `discardAll`と`energyTrashAll`は既存だがliveは`costUnparsed`のみで、さらに両zoneの実支払合計6以上を後段BANISHの条件にする語彙がない。 | 2フィールドは型あり／空集合でも支払える全捨てなので在庫gate不要／`performSigniActivated`と`performLrigActivated`が両zoneを全trashし`last_cost_trashed_cards`へ記録／両起動UIは自動支払を表示。ただし合計gte6 consumerなし。 | `last_cost_trashed_cards`の既存条件はfilter一致有無で、枚数gte6判定ではない。did-itの非空判定も1〜5枚を誤って通す。 | 「手札とエナゾーンにあるすべて」「６枚以上」 |
| S006 | WDK05-T12-E1 | AUTO | 真バグ＋機構待ち | 原文は他の自場SIGNI1体をdeck topへ置くコストだが、`EffectCost`は`selfToDeckBottom`しか持たず、他対象・top指定の場→deckコストがない。 | 型なし／`signiActivateGate`に候補数検算なし／`performSigniActivated`に場stackをdeck topへ移す支払なし／起動UIに他SIGNI選択なし。 | `fieldTrash`は行先がtrash、`selfToDeckBottom`は主語がselfかつbottomなのでどちらも流用不可。 | 「他のシグニ１体を場からデッキの一番上に置く」 |
| S007 | PR-K056-E1 | AUTO | 真バグ＋機構待ち | liveは青1固定で、`CHOOSE`の実選択数をenergy costへ掛けるフィールドが`EffectCost`にも`ChooseAction`にもない。 | 型なし／選択前の可否判定は最終額を算出不能／支払は選択前に固定energyを控除／CHOOSE UIは選択肢だけで増分コストを再計算しない。 | `discardVariable`等は支払枚数自体を選ぶ型、`costSubstitute`は固定costの置換であり、選択肢数比例ではない。 | 「使用コストは選んだ数だけ《青×1》増える」 |
| S008 | WX18-062-E1 | AUTO | 真バグ＋機構待ち | liveは`fromZones:['under_signi']`だけで、under→trash eventがコストまたは効果起因かを限定するtrigger fieldがない。 | trigger型にunder用cause指定なし／collector呼出側は移動原因を統一payloadで渡さない／`collectTrashTriggers`の既存`fromFieldByCostOrEffect`はfield origin限定／誘発UIはstack結果を表示するだけ。 | 第12バッチ§4 S007/S035のleave-field cause伝搬と同じcause基盤だが、今回はunder→trash入口なので同じfield名は使えない。 | 「コストか効果によってシグニの下から」 |
| S009 | WX08-042-E1 | AUTO | 偽陽性 | `collectEnergyTrashSubstituteInfo` (`effectEngine.ts:3472-3485`) は`COST_SUBSTITUTE{substituteCost.banish_self}`をエナ中の当該instanceの白色overrideにし、通常のエナ支払がそのカードをtrashへ送る。 | action型あり／全energy可否判定がoverride mapを受領／通常energy pay funnelが選択instanceをtrashへ控除／支払いUIはそのinstanceを白として候補化。`EffectCost.energyTrashSelf`自体は4地点未配線だが本actionはそれを使わない。 | `banish_self`を字面どおり場のself banishと読む解釈を外した。count1の代替は色overrideで完全表現される。 | 「エナゾーンからこのシグニをトラッシュに置いてもよい」 |
| S010 | WX21-044-E1 | AUTO | 偽陽性 | 同collectorはこのCONTINUOUSをエナ中の当該instanceの緑色overrideにし、選ばれたカードはenergy payの共通trash経路へ移る。 | action型あり／可否は緑要求に対するoverride候補を数える／payは選択したenergy instanceをtrashへ移す／UIも緑支払候補として扱う。宣言だけの`energyTrashSelf`配線は不要。 | 「専用fieldが在るのに別field」というメモCAを外した。ここはEffectCost支払いでなくCONTINUOUS代替の専用consumer。 | 「エナゾーンからこのシグニをトラッシュに置いて」 |
| S011 | WX21-031-CB-E2 | AUTO | 真バグ＋機構待ち | `EffectCost`を末尾まで確認しても場の発動元を手札へ戻すfieldはなく、liveは白1だけなのでselfが場に残る。 | 型なし／self在場の可否gateなし／`performSigniActivated`にself→hand支払なし／起動UIに戻す対価の表示・確認なし。 | `trash_self`・`banish_self`・`selfToDeckBottom`はいずれもdestinationが違い、効果actionのBOUNCEへ平坦化すると支払前対象固定も壊す。 | 「このシグニを場から手札に戻す」 |
| S012 | WXK08-043-E1 | AUTO | 偽陽性 | `analyzeBeatSigniCost`はEffectTextから`《炎魔の悪意　サマエル》以外`を抽出し、`eligibleOtherZones`から同名CardNameを除外する (`execUtils.ts:1013-1027`)。 | 型`beat_signi`あり／gateが除外後候補数を検算／payが除外後zoneだけを移動／起動モーダルも同じeligible listを候補表示。 | JSONにfilterがないという指摘を外した。除外名もcountと同じ原文regex consumerで復元される。 | 「《炎魔の悪意　サマエル》以外のシグニ１体」 |
| S013 | WX25-CP1-016-E1 | AUTO | 真バグ＋機構待ち | `collectHandDiscardTriggers`は`asCost`、相手効果、cause ownerを受けるが、原因sourceのcardTypeがSIGNI/SPELLかつcost-or-effectというORを表すtrigger fieldがない。 | trigger型なし／discard funnelはcauseSourceNumを全経路で統一伝搬しない／collectorは`byOwnEffect`等のみ消費／誘発UIは過剰に積まれたstackを区別不能。 | 第12バッチ§4 cause台帳（S007/S012/S023等）と同一基盤。既存`byOwnEffect`は自分効果だけで自分のコストを除外するため原文より狭い。 | 「シグニかスペルの、コストか効果によって」 |
| S014 | WXDi-P13-089-E3 | AUTO | 真バグ＋機構待ち | `trashExile`はtrash単一zoneしか除外せず、hand・energy・trashから同名を各1枚というzone横断exact quotaを表せない。 | 各zone組の型なし／3zone同時充足gateなし／`performSigniActivated`はtrashExile選択だけを除外へ移す／UIもtrash indicesしか持たない。 | `discardGroups`/`energyTrashGroups`/`fieldTrashGroups`は各単一zone内の組で、`handExileSelf`は発動元self限定。`trashExile`のcount/filterも他zoneへ波及しない。 | 「手札とエナゾーンとトラッシュにある《夢限//ディソナ》を１枚ずつ」 |
| S015 | WX05-016-E1 | AUTO | 真バグ＋機構待ち | liveは5色を能力costにして使用不能化する一方、原文はアーツ本来の支払い内訳に5色全てが含まれた場合だけ効果を実行する条件である。 | 支払色履歴の型なし／アーツ可否は印刷costを通常判定／pay後に色別実支払集合をstackへ保存しない／Cutin UIは支払候補を選ぶだけで条件結果を渡さない。 | `cost.energy`は追加必須costへ意味が変わり、`COST_PAID_CARD_MATCH`系はtrash札属性を見る条件で支払色集合ではない。 | 「使用コストで《白》《赤》《青》《緑》《黒》すべてが支払われている場合」 |
| S016 | WXDi-P07-046-E3 | AUTO | 真バグ＋機構待ち | `selfPowerDown`は型とparser生成規則だけ存在し、repo全体でcanPay/pay/UI consumerが0件なのでliveへ足すだけでは恒久no-opになる。 | 型あり／`signiActivateGate`に現在powerと減算可否の検算なし／`performSigniActivated`に期間付きself power modifier追加なし／`SigniActivatedModal`に対価表示なし。 | action側`POWER_MODIFY`は相手対象の効果であり、同値をSEQUENCE前段へ複製すると「コスト」原因・不支払時抑止を失う。 | 「ターン終了時まで、このシグニのパワーを－10000する」 |
| S017 | WXK08-027-E2 | AUTO | 真バグ | liveは`energyTrash:1`だけだが、既存`discard:1`と`fieldTrash:{count:1,excludeSelf:true}`を併記すれば3対価を表せる。 | 両型あり／gateは手札枚数とexcludeSelf後の場候補数を検算／payは選択handとfield stackをtrashへ移動／起動UIは手札・場を別選択しfield支払完了も検査。 | `trash_self`は「他の」を破り、`fieldTrash`のfilterだけでself除外する類推も効かないため`excludeSelf:true`が必要。 | 「手札を１枚捨て、他のシグニ１体を場からトラッシュに置き」 |
| S018 | WX05-046-E1 | AUTO | 真バグ＋機構待ち | `RearrangeSigniAction`に`optional`がなく、executorは候補があれば必ず`REARRANGE_SIGNI` interactionを作るため再配置だけをskipできない。 | action型に任意flagなし／cost gateとpayは`handDiscardSigni`で正常／`execRearrangeSigni`にskip分岐なし／配置UIに「しない」がなく、後段DRAWだけ進める経路なし。 | effect全体`mandatory:false`はコストを払うかの任意性で、払った後の「再配置のみ任意」ではない。`CHOOSE`化は0-of-1を表さない。 | 「すべてのシグニを好きなように配置し直してもよい」 |
| S019 | WX21-046-E1 | AUTO | 真バグ＋機構待ち | sourceに`cardType:'スペル'`がなく、さらに`SelectionConstraint.distinct`はlevel/name/classだけで3枚の印刷cost合計相異を保持できない。 | filter cardTypeは型・候補・UIまで既存／distinct cost型なし／`TRANSFER_TO_DECK`確定判定は相異costを検算しない／選択UIにも選択済みcost集合の制約なし。 | `distinct:'level'`はCard Level、`costMax/costMin`は各カード単体の閾値で、集合内の互いに異なるcostではない。 | 「それぞれコストの合計が異なるスペル３枚」 |
| S020 | WX24-P4-040-E2 | AUTO | 真バグ＋機構待ち | `TargetFilter.costMax:1`と`PLAY_FREE.filter`は既存だが、前段で実際に捨てたinstanceだけを後段候補へ固定するfieldが`PlayFreeAction`にない。 | costMax型とmatchesFilterは既存／前段TRASHは`lastProcessedCards`を残す／`execPlayFree`はopp_trash全体をfilter検索／PLAY_FREE UIもその全候補を出しidentity固定を消費しない。 | filterへ`cardName`を写すと同名別instanceを許し、`costThreshold:1`だけでは任意の低cost spellを許す。第8/9/19バッチのstored-target基盤と共有可能だがconsumerはPLAY_FREEで別。 | 「そのカードがコストの合計が１以下のスペルの場合」「そのスペル」 |
| S021 | WX21-031-CB-E1 | AUTO | 真バグ | liveは白1＋self downのみだが、既存`discard:1`と`discardFilter:{cardName:'究極　ニパ子'}`で手札の指定名1枚を要求できる。 | 型あり／起動gateとモーダルがfilter一致手札数・選択を検算／`performSigniActivated`が選択札をtrashへ移動／UIは指定名候補だけを選択可能。 | `handDiscardSigni`はcolor/story/levelだけでcardNameを持たないが、汎用`discardFilter`は`TargetFilter.cardName`を既に消費する。 | 「手札から《究極　ニパ子》を１枚捨てる」 |

## 3. 所見（コスト退化の型ごと）

- ①は0件。S009/S010はJSONの`banish_self`という名前だけなら誤変換に見えるが、CONTINUOUS `COST_SUBSTITUTE`専用collectorが対象エナinstanceを元色として扱い、共通energy支払がtrashへ送るため意味一致した。
- ②はS004だけ。`discardGroups`は型、充足判定、pay、起動UIまで通っておりparser/live単点修正で閉じる。
- ③はS002/S005/S006/S011/S016/S017/S021。うちS017とS021は既存costの併記だけで足りる。S005は全捨て自体、S016は宣言型自体はあるが後段条件またはconsumerが欠けるため機構待ちである。
- ④はS003/S012の同一`analyzeBeatSigniCost`機構。自身主語と除外CardNameの両方をEffectText regexから復元するため2件とも偽陽性。
- ⑤はS001（無色支払の許可色集合）、S007（CHOOSE数比例energy）、S014（3zone exact quota除外）、S019（選択集合のdistinct cost）。名前の近い単一zone/可変支払/単体cost filterでは代用できない。
- ⑥のcause群S008/S013は第12バッチ§4の原因情報伝搬と同一基盤。S015は支払色履歴、S018は部分任意、S020は前段instance固定。S009/S010は前述の慣例により偽陽性。

## 4. 機構待ちの一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| 無色costの許可色集合 / S001 | `EnergyCost`またはキー登場costへallowed payment colorsを追加し、全`canPay`・pay solver・支払いUIへ同一制約を通す。全面禁止flagでは代用しない。 |
| hand source公開→同instance配置 / S002 | `EffectCost.handRevealSelf`相当、起動gate、`performSigniActivated`、`SigniActivatedModal`、公開instanceを`ADD_TO_FIELD`へ固定するcontext。第8バッチ§4 S021／第9 S033／第19 S006/S008のinstance保持基盤と共有。 |
| 全捨て支払枚数gate / S005 | `discardAll`＋`energyTrashAll`が積んだ`last_cost_trashed_cards.length`をoperator/valueで読むConditionを、cost支払後・action前へ配線。 |
| 他SIGNI→deck top cost / S006 | EffectCost field、候補数gate、場stack移動pay、選択UI。第17/18バッチの配置zone基盤とは移動方向が逆なので別consumer。 |
| 選択数比例energy cost / S007 | CHOOSE確定数を支払額へ反映する可変energy specと、選択前後を跨ぐgate/pay/UI。`*Variable`は枚数選択だけなので別物。 |
| under→trash cause限定 / S008 | **第12バッチ§4 cause系と同一機構**。under移動funnelからcost/effect/other causeを伝搬し、`collectTrashTriggers` self pathで読む。二重登録しない。 |
| self field→hand cost / S011 | EffectCost field、self在場gate、pay funnel、起動UIの4地点。既存self移動costのdestination拡張として実装可能。 |
| hand discardのsource種別＋cost/effect OR / S013 | **第12バッチ§4 cause台帳と同一機構**。全discard funnelでcause source cardNum/typeとcost/effectを渡し、`collectHandDiscardTriggers`でSIGNI/SPELLを評価。二重登録しない。 |
| 3zone同名exact quota除外 / S014 | hand/energy/trashをzone別quotaで同時gateし、3zoneをexcluded destinationへ移すpayと複合選択UI。単一zoneの`*Groups`は基盤だけ共有。 |
| 実支払色集合Condition / S015 | アーツ支払funnelが実際に控除した色をstack contextへ保存し、`FORCE_END_TURN`前のConditionが5色包含を評価。 |
| `selfPowerDown`の実配線 / S016 | 宣言済fieldを`signiActivateGate`、`performSigniActivated`のturn期限power modifier、`SigniActivatedModal`へ配線。型だけで完了扱いしない。 |
| `REARRANGE_SIGNI`部分任意 / S018 | action optional、executor skip、配置UIの「しない」、SEQUENCE継続を追加。effect全体の任意性から分離。 |
| distinct printed cost選択 / S019 | `SelectionConstraint.distinct:'cost'`と選択確定判定・TRANSFER_TO_DECK UIへ印刷energy cost合計を配線。 |
| PLAY_FREEをlast processed instanceへ固定 / S020 | `PlayFreeAction.targetsLastProcessed`相当と`execPlayFree`/選択UI配線。第8/9/19バッチの参照保持基盤と共有するがPLAY_FREE consumerは新規。 |

機構待ちは14 findings／14登録行。S008/S013は第12バッチcause系と同一基盤、S002/S020は過去のinstance保持基盤と共有するため新規基盤として二重登録しない。

## 5. 偽陽性の件数についての自己評価

偽陽性は4/21（19.0%）で、累積の21.2%に近い。Claudeの予測「`beat_signi` 2件が偽陽性」は**2件とも当たった**。加えてS009/S010も、先回りメモCAとは逆に`COST_SUBSTITUTE`専用consumerを開いた結果、挙動一致の偽陽性と判定した。偽陽性4件はいずれもJSON表面では見えない実コード経路を根拠にしており、数合わせではない。

## 6. 条件以外で見つけた原文との食い違い

0件。

## 7. ゲート・差分・成果物確認

- `npm run gates`：全緑。typecheck PASS、golden **2337/0**、smoke **10693/10693・CRASH/HANG/INVARIANT 0・SKIP 0**、fuzz **0**、census **773/773**、census:stubs **A群🔴0・C群0**、manual-fields **0**、lint **0 errors / 260 warnings**。指定ベースラインと全項目一致。
- `git status --short`：作業前からのMは `scripts/archive/semanticAuditLedger.mjs` と `scripts/archive/semanticAuditMkBatchSingles.mjs` の2本だけ。`??`は過去成果物（batch8 triage、batch9〜19のtxt/index/triage）と、今回scopeの `stage1_batch20.txt` / `_index.md` / `_triage.md` だけ。新たなtracked変更なし。
- `git diff --stat`：上記計器2本だけ（`13 ++++++++++---` / `7 ++++++-`、計 **2 files changed, 16 insertions(+), 4 deletions(-)**）。報告書はuntrackedのためstat対象外。
- 報告書：`wc -c`相当（`Get-Item.Length`） **22426 bytes**。分類行 **21**、根拠列 **21/21ユニーク**。UTF-8で先頭20行・末尾20行を再読し、見出し・集計・§7・§8が正常着地していることを確認した。

## 8. ガードレール2・3・4・7で当初の見立てから変えた件

- S003/S012：ガードレール4により`analyzeBeatSigniCost`を開き、JSON filter欠落の真バグ候補から偽陽性へ変更。
- S009/S010：先回りメモCAは「専用`energyTrashSelf`が在るので別field使用の真バグ」としたが、実測では`energyTrashSelf`は型/parser宣言だけでcanPay/pay/UI consumerが0。一方、現liveの`banish_self`は`collectEnergyTrashSubstituteInfo`が色overrideとして専用消費し、通常energy支払で正しくtrashへ行くため、真バグ予測から偽陽性へ変更。
- S016：`selfPowerDown`の型存在だけならparser修正で足りる見立てだったが、ガードレール2でgate/pay/UIを検索すると全て未配線だったため真バグ＋機構待ちへ変更。
- S005：全捨て2fieldは4地点を通るが「合計6以上」のconsumerが無く、単純なparser修正から真バグ＋機構待ちへ変更。
