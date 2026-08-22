# 意味照合監査 clean群 round1 段1 第8バッチ triage

対象は `stage1_batch8.txt` の S001〜S040（軸 `filter.story`、40 findings / 35 effectId）のみ。全行について明細の live JSON と原文を照合し、提案語彙は当該 action executor / timing collector の実消費地点まで確認した。分類の「真バグ＋機構待ち」は真バグ・機構待ち双方へ計上する。

## 1. サマリ

| action 型 | findings | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|---:|
| ATTACH_CHARM | 1 | 0 | 1 | 0 | 0 |
| BANISH | 7 | 7 | 0 | 2 | 0 |
| BOUNCE | 5 | 5 | 0 | 1 | 0 |
| CHOOSE 系 | 7 | 7 | 0 | 1 | 0 |
| CONDITIONAL | 3 | 3 | 0 | 1 | 0 |
| DOWN | 1 | 1 | 0 | 0 | 0 |
| DRAW | 2 | 2 | 0 | 0 | 0 |
| ENERGY_CHARGE_FROM_DECK | 3 | 3 | 0 | 1 | 0 |
| ENERGY_CHARGE | 1 | 1 | 0 | 0 | 0 |
| GRANT_EFFECT | 1 | 1 | 0 | 1 | 0 |
| GRANT_KEYWORD | 3 | 3 | 0 | 0 | 0 |
| GRANT_LRIG_ABILITY | 2 | 2 | 0 | 1 | 0 |
| GRANT_PROTECTION | 4 | 4 | 0 | 2 | 0 |
| **計** | **40** | **39** | **1** | **10** | **0** |

## 2. finding 全40件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WX07-045-E2 | AUTO | 偽陽性 | live は `charm.count:3,upToCount:true` と `to.count:"ALL",story:"悪魔"`。`execAttachCharm` は ALL を全件適用せず無限上限へ変換し、実ペア数を `min(charm候補,to候補,3,ALL)` とする（`effectExecutor.ts:5431-5486`）ため「全悪魔へ強制」は起きない。 | `execAttachCharm` | `count:"ALL"` の一般 executor の全件分岐を外した。この action 固有には pair-limit 慣例がある。なお任意選択を出さず先頭ペアを自動採用する別不一致は§6。 | 対象のカードを３枚まで対象のあなたの好きな数の＜悪魔＞のシグニの【チャーム】にする |
| S002 | WD15-023-E1 | AUTO | 真バグ | live は即時 `ACTIVATED/MAIN` の `BANISH{owner:opponent,story:龍獣}`。原文は使用時に何もバニッシュせず、このターン自分の龍獣が相手をバニッシュしたイベントを設置する。 | `execInstallDelayedTrigger`／`collectDelayedBanishBattleTriggers` | `triggerScope` 省略や BANISH の owner 反転では遅延 watcher は生えない。既存 `INSTALL_DELAYED_TRIGGER` が正準入口。 | このターン、あなたの＜龍獣＞のシグニが対戦相手のシグニ１体をバニッシュしたとき |
| S003 | WD15-023-E1 | AUTO | 真バグ | 同じ live target の `filter` は `story:龍獣`だけで、誘発した龍獣のレベル未満を示す動的キーがない。原文の比較対象はバニッシュされる相手ではなくバニッシュした自分の龍獣。 | `resolveDynamicFilter(levelLtTrigger)`／`execBanish` | `levelLtSelf` は能力ホスト基準で、実際にバニッシュした龍獣が別個体の場合を誤るため外した。 | その＜龍獣＞のシグニより低いレベルを持つ対戦相手のシグニ１体 |
| S004 | WX10-062-E1 | AUTO | 真バグ | live activeCondition は自場の `story:ウェポン` AND `story:アーム` と正しい一方、相手 BANISH target にも `story:[ウェポン,アーム]` が混入。原文対象は class 無限定の `powerRange.max:7000`。 | `execBanish`→`fieldCandidatesByOwner`→`matchesFilter` | activeCondition の story を action target に継承する慣例はなく、consumer は両者を独立評価する。 | 対象の対戦相手のパワー7000以下のシグニ１体 |
| S005 | WX09-017-BURST | AUTO | 真バグ＋機構待ち | live は相手 target 自身を `story:[鉱石,宝石]` に限定するだけ。原文は自分trashの両classシグニ合計枚数×3000を `powerRange.max` にするが、`TargetFilter` の動的キー群（`effects.ts:685-785`）にtrash class count×倍率がない。 | 無し＝機構待ち。`resolveDynamicFilter` の動的power分岐（既存 `powerLteRevealedSigniLevelSum` の近傍）で self trash を filter 集計し、`execBanish` の既存呼出し `:1074`へ解決済みfilterを返す | `powerLteRevealedSigniLevelSum` は公開札のレベル合計、`POWER_MODIFY_PER_TRASH_COUNT` は修整量であり対象閾値ではない。 | ＜鉱石＞と＜宝石＞のシグニを合計した枚数×3000以下 |
| S006 | WX21-051-E1 | AUTO | 真バグ | live は無条件 ON_PLAY BANISH で `activeCondition` がない。原文は自場の天使の色集合が2種類以上の場合だけ実行する。 | `checkActiveCondition(HAS_CARD_IN_FIELD distinctColors,minCount:2)`／`execBanish` | target の `story:天使` を条件の略記とはできない。target は相手側、条件は自分場で owner も異なる。 | あなたの場にある＜天使＞のシグニが持つ色が合計２種類以上ある場合 |
| S007 | WX21-051-E1 | AUTO | 真バグ | live target `filter:{powerRange.max:3000,story:天使}` は相手天使しか候補にしない。原文は相手の全classの3000以下で、天使は S006 の自場条件にだけ属する。 | `execBanish`／`matchesFilter` | `story` が condition と target の双方へ効く共有キーという慣例はない。S006/S007 は parser が条件側名詞句を対象へ誤付着した同一真因。 | 対戦相手のパワー3000以下のシグニ１体 |
| S008 | WX06-018-BURST | AUTO | 真バグ＋機構待ち | live は相手 target を `story:ウェポン` に限定し power 上限なし。原文は self trash のウェポンSIGNI枚数×3000以下で、対象自身のclassは問わない。型の動的閾値一覧にこの基準はない。 | 無し＝機構待ち。`resolveDynamicFilter` の `powerLteRevealedSigniLevelSum` 後方へ `zone:'trash',countFilter:{story:'ウェポン',cardType:'シグニ'},multiplier:3000` 解決分岐を追加し、`execBanish:1074`から利用 | `levelLteFieldVirusCount` は場のvirus数、`countFromZone` は処理枚数でありpower上限にならない。 | あなたのトラッシュにある＜ウェポン＞のシグニの枚数×3000以下 |
| S009 | WXEX2-55-E1 | AUTO | 真バグ＋機構待ち | live BOUNCE target は相手SIGNI count1の無条件filter。原文の上限は自場の天使SIGNI数という動的level値だが、既存は `levelLteFieldVirusCount` の固定virus専用だけで、任意classのfield countをlevel.maxへ解決するキーがない。 | 無し＝機構待ち。`resolveDynamicFilter` に field count filter→`level.max` を足し、既に同関数を呼ぶ `execBounce:1244`へ配線 | `DRAW_PER_FIELD_COUNT` はドロー枚数を作るactionで、BOUNCE候補のlevel filterには消費されない。 | あなたの場にある＜天使＞のシグニの数以下のレベル |
| S010 | WXEX2-57-E1 | AUTO | 真バグ | live は相手への単独 BOUNCE だけで、自分の緑かつ美巧SIGNIを先に1体選ぶ action がない。 | `SELECT_TARGET_ONLY`／`resumeSelectTarget`（lastProcessedCards記録） | BOUNCE の `triggerScope:self` は攻撃したホストを示すだけで、基準となる別の美巧を自動選択しない。 | 対象のあなたの緑の＜美巧＞のシグニ１体 |
| S011 | WX04-001-E2 | AUTO | 真バグ | live cost は `discardGroups[{アーム:1},{ウェポン:1}]` で各1枚を強制。原文は両classのOR集合から合計2枚で、アーム2枚またはウェポン2枚も許す。 | `payCost`／`cost.handDiscardSigni{story:[アーム,ウェポン],count:2}` | `discardGroups` の充足判定は群ごとの必要数を守るため「合計」の慣例にはならない。 | 手札から＜アーム＞と＜ウェポン＞のシグニを合計２枚捨てる |
| S012 | WXEX2-57-E1 | AUTO | 真バグ | live BOUNCE filter は `cardType:シグニ`のみで、S010で選ぶ基準札との同level比較がない。 | `resolveDynamicFilter(levelEqLastProcessed)`／`execBounce` | `ON_ATTACK_SIGNI` の triggering card levelではなく、原文で明示選択した緑の美巧のlevelを比較するため `levelEqTrigger` 類は不適切。S010/S012は「基準選択→比較」の一つの欠落。 | 同じレベルの対象の対戦相手のシグニ１体 |
| S013 | WX22-011-E1 | AUTO | 真バグ | live は ON_ATTACK_PHASE_START から無条件 BOUNCE。原文は self field に緑の美巧と白の美巧が各1体必要で `activeCondition` が丸ごとない。 | `checkActiveCondition(AND/HAS_CARD_IN_FIELD)`／`execBounce` | `triggerScope:self` は収集側の所有者範囲で、場の色・class条件を補完しない。 | あなたの場に緑と白の＜美巧＞のシグニがある場合 |
| S014 | WX25-P1-097-E1 | AUTO | 真バグ | choice② source は緑ENERGY_CARD count2だが `selectionConstraint` 不在。原文は2枚のclass集合が互いに交差しないことを要求する。 | `execAddToField:2951`→`selectOrInteract(selectionConstraint)`→`satisfiesSelectionConstraint:2669-2700` | `effectParser.ts` の「それぞれ共通するクラスを持たない」限定regexを検討したが原文には「それぞれ」がないため生成されない。 | 共通するクラスを持たない緑のシグニ２枚 |
| S015 | WX05-027-BURST | AUTO | 真バグ | choice① live は `BANISH{owner:self,count:1,story:天使}`。原文の「すべて」は両プレイヤーの天使を対象にするため `owner:any,count:"ALL"` が必要。 | `execBanish`（owner:any候補統合、count ALL一括適用） | CONTINUOUS host自己適用は単体常在効果の慣例で、LIFE_BURSTの明示BANISHには働かない。 | すべての＜天使＞のシグニをバニッシュする |
| S016 | WXDi-CP02-081-E1 | AUTO | 真バグ＋機構待ち | live はフェイズ開始時に無条件CHOOSE。原文は「このターン」「手札から」「ブルアカを1枚以上捨てた」の3軸だが、state はターン総捨て枚数を持つ一方、捨てたcard classをターン累積で保持しない。 | 無し＝機構待ち。手札TRASH/payCostでターン中discard card集合またはclass集合を記録し、`collectTurnTriggers`/`checkActiveCondition`へ story付き履歴条件を配線 | `ON_HAND_DISCARDED triggerFilter` は捨てた直後のイベント用で、後のアタックフェイズまで履歴を保持しない。 | このターンにあなたが手札から＜ブルアカ＞のカードを１枚以上捨てていた場合 |
| S017 | WX25-P3-083-E1 | AUTO | 真バグ | choice② live の遅延付与先が class 無指定 `SIGNI,count:1`。原文は self天使を0〜2体なので `story:天使,count:2,upToCount:true` が必要。 | `INSTALL_DELAYED_TRIGGER`／遅延解決後の `execUp` | GRANT_EFFECT choice①の `story:天使` は別choiceであり choice②へfilter/countを継承しない。 | 次のあなたのアタックフェイズ開始時、あなたの＜天使＞のシグニを２体まで |
| S018 | WX21-Re07-E1 | AUTO | 真バグ | choice② live `GRANT_PROTECTION.target{owner:self,count:1}` はclass無指定の1体。原文は自分の全天使なので `story:天使,count:"ALL"`。 | `execGrantProtection:5386-5396` | SEARCH choice①の `story:天使` は別分岐のfilterで、CHOOSE siblingへ暗黙共有されない。 | あなたのすべての＜天使＞のシグニ |
| S019 | WD20-018-E1 | AUTO | 真バグ | choice①前段の自己BANISHは `story:英知` だが、後段 `REVEAL_AND_PICK.filter` は `cardType:シグニ`のみ。公開4枚から非英知も手札にできる。 | `execRevealAndPick`／`matchesFilter` | 前段target filterは did-it 成否だけを渡し、後段公開候補へstoryを継承しない。 | その中から＜英知＞のシグニ１枚を公開し手札に加える |
| S020 | WXEX1-63-E1 | AUTO | 真バグ | choice② live の自己BANISH target は `story:乗機`だけで `isDrive:true` がない。原文はドライブ状態の乗機に限定する。 | `execBanish`→`fieldCandidatesByOwner`→`matchesStateFilter(isDrive)` | choice①も乗機をバニッシュするが別choiceであり、「②だからdrive」という暗黙分岐はexecutorにない。 | あなたのドライブ状態の＜乗機＞のシグニ１体 |
| S021 | WXK03-079-E1 | AUTO | 真バグ＋機構待ち | live SEQUENCE は deck topをTRASH後、trash全体から `story:トリック` 1枚を選ぶ。`levelParity` は実装済みだが ADD_TO_FIELD sourceを直前の `lastProcessedCards`だけに拘束する語彙がない。 | 奇数は `matchesFilter(levelParity)`。同一札拘束は無し＝機構待ち（`execAddToField` sourceへ `targetsLastProcessed` 相当を追加） | `levelParity:'odd'`だけでは任意trashの奇数トリックを選べる。`thisCardOnly`は能力ホストを指しdeck topではない。 | それがレベルが奇数の＜トリック＞のシグニの場合、それをトラッシュから場に出す |
| S022 | WXEX2-48-E1 | AUTO | 真バグ | live then は `ADD_TO_LIFE{fromTop:true}` でdeck topを加える。原文は先に対象としたself trashの悪魔SIGNIをlifeへ移す。 | `execAddToLife(fromTrash,target)`／対象選択 continuation | `fromTop:true` をtrash選択の代替とはできず、ON_ATTACKのtriggering cardも移動対象ではない。 | あなたのトラッシュから＜悪魔＞のシグニ１枚を対象とし…それをライフクロスに加える |
| S023 | WX26-CP1-071-E1 | AUTO | 真バグ | live は `HAND_COUNT<=2` を外側thenに置き、その枝だけ `HAS_CARD_IN_FIELD story:プリオケ,excludeSelf` を通らない。原文は他のプリオケ存在が両power閾値に共通する前提。 | `execConditional`／`evalCondition(AND)` | else枝にだけある盤面条件を外側条件にも適用する慣例はない。手札条件は閾値の代替分岐で、発動条件の代替ではない。 | あなたの場に他の＜プリオケ＞のシグニがある場合…手札が２枚以下の場合、代わりに |
| S024 | WX24-P1-048-E3 | AUTO | 真バグ | live は他の悪魔2体を直接DOWN。原文は他の悪魔2体を場→trashへ置く任意支払いを提示し、支払わなかった場合だけこのシグニをDOWNする逆分岐。 | `execTrash(asCost,optional)`→`execConditional(else:DOWN thisCardOnly)` | did-it の隣接 `CONDITIONAL{IS_MY_TURN}` は成功時後段用で逆条件を自動生成しないが、通常CONDITIONALのelseで表現可能。 | 他の＜悪魔＞のシグニ２体を場からトラッシュに置かないかぎり、このシグニをダウンする |
| S025 | WX11-028-E1 | AUTO | 真バグ | live timingは `ON_OPP_LIFE_CRASHED` だが `triggerFilter` がなく、どの自軍crash sourceでもDRAWする。原文主語は自分のウェポンSIGNI。 | `collectLifeCrashTriggers:3412-3416`（crashSourceCardNumへtriggerFilter適用） | `triggerScope`省略はwatcher側を決めるだけで、crash sourceのclassを補わない。 | あなたの＜ウェポン＞のシグニが対戦相手のライフクロス１枚をクラッシュしたとき |
| S026 | WX17-067-E1 | AUTO | 真バグ | live は `ON_TRASH fromZones:[hand]`後に無条件DRAW。原文はself hand 3枚以下かつself field凶蟲存在のAND条件。 | `collectTrashTriggers`→`checkActiveCondition(AND/HAND_COUNT,HAS_CARD_IN_FIELD)` | fromZonesは移動元だけを絞り、解決時の手札枚数・盤面class条件を評価しない。 | あなたの手札が３枚以下であなたの場に＜凶蟲＞のシグニがある場合 |
| S027 | WXEX2-34-E1 | AUTO | 真バグ | live は固定 `ENERGY_CHARGE_FROM_DECK count:1` だけで、self field鉱石数ぶんのDRAW actionが丸ごとない。 | `execDrawPerFieldCount` | ENERGY_CHARGEのcountやON_ATTACK timingからDRAWは派生しない。 | あなたの場にある＜鉱石＞のシグニ１体につきカードを１枚引き |
| S028 | WX21-044-E2 | AUTO | 真バグ＋機構待ち | live ON_PLAYは常にEC2。既存 collector は `byEffect`/`bySigniEffect` と配置元の一部を判別できるが、「handから」かつ原因シグニの `story:遊具` を同時に保持する source filter がない。 | 無し＝機構待ち。場出しイベントへ origin=`hand` と causeSourceCardNumを渡し、`collectPlayTriggers`で cause source `story:遊具,cardType:シグニ`を評価 | `triggerFilter` は場に出た当該シグニへ掛かるため、場に出した原因カードの遊具判定へ転用できない。 | ＜遊具＞のシグニの効果によって手札から場に出た場合 |
| S029 | WXEX2-34-E1 | AUTO | 真バグ | live ECは固定1。原文はself fieldの「他の」宝石SIGNI1体につき1回で、既存専用actionがclass filterとexcludeSelfを数える。 | `execEnergyChargeFromDeckPerFieldCount:6340-6356` | 固定 `count:1` を「1体につき」の反復単位とは解釈せず、そのままdeck top1枚だけ移動する。S027/S029は同一文の2集計action脱落という一つの真因。 | あなたの場にある他の＜宝石＞のシグニ１体につき【エナチャージ１】 |
| S030 | WXK09-082-E2 | AUTO | 真バグ | live ENERGY_CHARGE target は self trash電機 count2だが `selectionConstraint`なし。同level2枚も選べる。 | `execEnergyCharge`→`selectOrInteract(selectionConstraint)`→`satisfiesSelectionConstraint(distinct:level)` | filterの `story:電機` は各候補を絞るだけで候補間level関係を検査しない。 | レベルの異なる＜電機＞のシグニ２枚 |
| S031 | WXDi-P00-026-E1 | AUTO | 真バグ＋機構待ち | live GRANT_EFFECT targetは素の self LRIG count1で `story:さんばか`なし。`GRANT_EFFECT`のLRIG経路はセンタートップ固定で、class付きでセンター・両assistから1体を選ぶconsumerがない。 | 無し＝機構待ち。`execGrantEffect` のLRIG分岐へ3ルリグ候補＋filter＋選択UIを配線 | 素のLRIGがセンターを指す慣例は確認したが、原文は「センター」ではなくclass付きルリグ1体なので適用できない。 | あなたの＜さんばか＞のルリグ１体 |
| S032 | WX21-015-E3 | AUTO | 真バグ | live target `owner:self,story:空獣,count:1` は自軍だけ。原文は所有者修飾なしの空獣SIGNI1体で、相手側も対象候補。 | `execGrantKeyword`／`fieldCandidatesByOwner(owner:any)` | 「あなたの」省略を常にselfとするaction慣例はない。owner:any対応済みで明示的に両場を統合する。 | ＜空獣＞のシグニ１体を対象とし |
| S033 | WX22-Re02-E2 | AUTO | 真バグ | live は場のself SIGNI1体へ文字列keyword「アクセ」を永久付与。原文はself energyのアクセアイコン付き調理SIGNIを選び、このシグニへカードとして装着する領域移動。 | `ATTACH_ACCE` executor／energy source selection | GRANT_KEYWORDの「アクセ」は装着カードをenergyから除かず `signi_acce` も更新しないため、アクセ機構の略記ではない。 | エナゾーンにある《アクセアイコン》を持つ＜調理＞のシグニ１枚…それをこのシグニの【アクセ】にする |
| S034 | WX21-043-E2 | AUTO | 真バグ | live costは `trash_self:true`だけで、原文のhand毒牙SIGNI1枚discardがない。型には `handDiscardSigni{story,count}` があり通常コストconsumerが読む。 | `payCost`／`cost.handDiscardSigni{story:毒牙,count:1}` | `analyzeBeatSigniCost`のEffectText regexはbeat専用で、通常のhand discardを暗黙支払いしない。 | 手札から＜毒牙＞のシグニを１枚捨て、このシグニを場からトラッシュに置く |
| S035 | WXEX2-03-E1 | AUTO | 真バグ | live abilities配列は相手SIGNI1体へのREMOVE_ABILITIES 1本だけ。原文第1常時能力はself field天使存在中、相手センターLRIG能力を失わせる別能力。 | `collectGrantedLrigAbilities`／`checkActiveCondition(HAS_CARD_IN_FIELD)`／LRIG能力喪失consumer | `triggerScope:any`は各attack phaseの収集範囲で、付与後の対象種別や天使条件を作らない。 | あなたの場に＜天使＞のシグニがあるかぎり、対戦相手のセンタールリグは能力を失う |
| S036 | WXEX2-03-E1 | AUTO | 真バグ＋機構待ち | 同じlive childは相手場SIGNI1体のみで、原文第2能力の古代兵器条件・相手場の全SIGNI・相手trashの全SIGNIが欠落。場のALL能力喪失は既存だがtrash在中カードの能力を継続的に無効化する対象zone/consumerがない。 | 場は `REMOVE_ABILITIES` consumer。trashは無し＝機構待ち（trash発動/常時能力の有効性判定へ zone scoped ability-lossを配線） | count ALLだけではfield候補しか列挙せずtrashには届かない。S035/S036は引用内2能力を1 childへ潰した同一parser真因だが、第2能力だけengine拡張も要る。 | あなたの場に＜古代兵器＞のシグニがあるかぎり、対戦相手の場とトラッシュにあるシグニは能力を失う |
| S037 | WXEX1-01-E2 | AUTO | 真バグ＋機構待ち | live CONTINUOUS は `target self SIGNI count1`、classなし。原文は相手ターン中の全selfアームSIGNI。さらに `collectBanishEffectProtectedSigni` はsourceをfield SIGNIだけから走査し、LRIGホストの本効果を見ない。 | 無し＝機構待ち。`collectBanishEffectProtectedSigni:4904-4931` のsource走査へcenter LRIGを加え、`subjectFilter{story:アーム}`を読む | `target self count1` のCONT慣例はsource SIGNI自身を保護するだけで、LRIGから全アームへ展開しない。 | 対戦相手のターンの間、あなたの＜アーム＞のシグニは…バニッシュされない |
| S038 | WXEX1-40-E1 | AUTO | 真バグ＋機構待ち | live は `subjectFilter:原子,from:[ルリグ,シグニ]`を無条件で同時付与。原文はtrash原子SIGNIの「種類」10以上でシグニ効果、15以上でルリグ効果という別閾値。単一 activeCondition ではfrom別条件を表せず、CONT SEQUENCE collectorもこの一般形を抽出しない（`effectEngine.ts:5272-5291`）。 | 無し＝機構待ち。trash distinct names条件を `checkActiveCondition`へ追加し、2 protection節を個別評価できるよう `collectEffectImmuneSigni` の抽出/表現を配線 | `from:[ルリグ,シグニ]` はOR source-type集合で、10/15の条件分岐を内包しない。枚数countも「種類」を代用できない。 | トラッシュに＜原子＞のシグニが１０種類以上あるかぎり…１５種類以上あるかぎり |
| S039 | WX08-018-E1 | AUTO | 真バグ | live activated GRANT_PROTECTION は classなし `target self count1`。原文は全self美巧なので `story:美巧,count:"ALL"` が必要。 | `execGrantProtection:5386-5396` | CONTINUOUSのhost自己保護慣例はACTIVATEDの選択付与には適用されず、liveは実際に1体選択へ進む。 | あなたのすべての＜美巧＞のシグニ |
| S040 | WX15-010-E1 | AUTO | 真バグ | live は classなし self SIGNI count1へ通常BANISH保護。原文は全self武勇への「次の1回」だけの耐性で、対象class/countに加え消費回数も欠落。 | `execGrantProtection`／バニッシュ保護消費consumer | `duration:UNTIL_END_OF_TURN` は時間だけで回数制限を付けず、1体指定を全武勇の略記にはしない。 | あなたのすべての＜武勇＞のシグニは…次にバニッシュされる場合、バニッシュされない |

## 3. action 型ごとの所見

- **ATTACH_CHARM**: 唯一の偽陽性。一般的な `count:"ALL"` と異なりペア数上限として消費する専用executorが段0の主張を反証した。ただし任意選択そのものは正しくない。
- **BANISH**: 7件すべて真バグだが原因は、遅延trigger化の失敗、比較filter欠落、condition→targetへのstory誤付着、動的trash count閾値不在に分かれた。WD15-023 の S002/S003 は「遅延watcher全体を即時BANISHへ誤解析した」一つの真因に束ねられ、遅延triggerとそのtrigger source比較の二面。
- **BOUNCE**: 固定条件欠落3件と動的参照2系列。WXEX2-57 の S010/S012 は別原因ではなく「基準となる自軍美巧を選び、そのlevelを後段へ渡すSEQUENCE全体」の脱落として一つに束ねた。
- **CHOOSE系**: choice sibling間ではfilterを共有しないため、各choice内の数量・class・状態を個別に持たせる必要がある。S016だけは過去イベントのclass履歴が必要でengine待ち。
- **CONDITIONAL**: S022は移動元そのものの誤り、S023は共通前提を片枝だけに置いた条件木の誤り、S021は直前カード同一性と奇偶の複合。action型が同じでも修正構造は共通しない。
- **DOWN**: S024は対象filterの軽微なズレではなく「任意支払いをしなかった場合」という逆分岐が丸ごと別actionへ崩壊したもの。
- **DRAW**: S025はtrigger source class、S026は解決時盤面AND条件。どちらも既存consumerがあるが配線先はcollectorとcondition evaluatorで異なる。
- **ENERGY_CHARGE_FROM_DECK**: WXEX2-34 の S027/S029 は一つの攻撃時文から `DRAW_PER_FIELD_COUNT(鉱石)` と `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT(他の宝石)` の2 actionを生成すべきところ、固定EC1一つへ潰した同一真因。S028は場出し原因カードまで追うevent metadata不足で別系統。
- **ENERGY_CHARGE**: S030は対象個々の電機filterではなく、選択集合間のlevel distinct制約。既存 `selectionConstraint` で完結する。
- **GRANT_EFFECT**: S031は素のLRIG=センターという慣例が逆に誤りを確定した。class付きでassistを含む選択経路がない。
- **GRANT_KEYWORD**: S032はowner、S033はaction型、S034はcostの誤り。同じaction labelでも欠落箇所は三者三様。
- **GRANT_LRIG_ABILITY**: WXEX2-03 の S035/S036 は引用内2本の常時能力を1本のSIGNI単体REMOVEへ潰した同一parser真因に束ねた。ただしS036のtrash能力喪失だけはengine consumerも不足する。
- **GRANT_PROTECTION**: S039はclass/count、S040はclass/countに加えone-shot、S037はLRIGホスト走査、S038はsource type別の異なるtrash種類閾値。用途別collectorが異なるため同じGRANT_PROTECTIONという理由では束ねられない。

同一 effectId 5組の結論: S002/S003、S006/S007、S010/S012、S027/S029、S035/S036はいずれも真因を1つに束ねられた。各組内で finding はそれぞれ「欠落構造の入口／後段」または「誤付着元／誤付着先」という別側面である。S035/S036のみ、共通parser真因に加えてS036側だけengine待ちが重なる。

## 4. 機構待ち一覧

| effectId / finding | 不足語彙・機構・配線 |
|---|---|
| WX09-017-BURST / S005 | `TargetFilter`へ zone=self trash・class OR・cardType SIGNI・multiplierを持つ動的power上限を追加。`resolveDynamicFilter` の既存 `powerLteRevealedSigniLevelSum` 分岐近傍でtrash一致数×3000を `powerRange.max`へ解決し、既存 `execBanish:1074` が読む。 |
| WX06-018-BURST / S008 | 同機構のcountFilter=ウェポン、multiplier=3000版。対象自身へstoryを付けてはならない。 |
| WXEX2-55-E1 / S009 | 任意 `countOwner/countFilter` のfield枚数を `level.max`へ変換する動的filter。`resolveDynamicFilter`→`execBounce:1244`へ配線。 |
| WXDi-CP02-081-E1 / S016 | 手札から捨てたカードのclassをターン中累積するstateと、後のphase triggerで照合するcondition。即時 `ON_HAND_DISCARDED` collectorでは代用不可。 |
| WXK03-079-E1 / S021 | `ADD_TO_FIELD.source` を `ctx.lastProcessedCards` に限定する `targetsLastProcessed` 相当。`levelParity`は既に `matchesFilter` が読む。 |
| WX21-044-E2 / S028 | play eventへorigin hand、effect cause、cause source cardNumを同時に渡し、`collectPlayTriggers`で原因sourceの `cardType:シグニ,story:遊具`を評価する配線。 |
| WXDi-P00-026-E1 / S031 | `execGrantEffect` のLRIG対象をセンター固定から、必要時だけcenter/assist L/assist Rをfilter付き候補化する経路。 |
| WXEX2-03-E1 / S036 | 相手trash内SIGNIの能力を条件付きで失わせ、trashから発動・参照される各能力consumerがその抑止を読むzone-scoped能力喪失。 |
| WXEX1-01-E2 / S037 | `collectBanishEffectProtectedSigni` のCONTINUOUS source走査にcenter LRIGを追加し、LRIGホストの `subjectFilter:アーム`を全自場SIGNIへ適用。 |
| WXEX1-40-E1 / S038 | self trashの原子SIGNI「異なる名前の種類数」条件と、シグニsource保護(10)／ルリグsource保護(15)を別々に評価する複数CONT protection抽出。`collectEffectImmuneSigni` の現行SEQUENCE限定抽出では一般形を捨てるため配線追加が必要。 |

## 5. 偽陽性件数の自己評価

偽陽性は **1/40 = 2.5%**、precision換算97.5%。パイロットの偽陽性16〜22%、第1〜7バッチ通算21.2%より大幅に低い。0件ではないのは `ATTACH_CHARM` の action固有pair-limitをconsumerまで追ったためで、表面上の `count:"ALL"` だけなら真バグへ誤分類していた。

単発母集団はクラスタ母集団より必ず偽陽性が出やすい、とは実感しなかった。今回は引用が固有なので共通慣例の横展開はできず、各行でconsumer探索のコストは上がる一方、段3で残った `filter.story` 単発は「条件名詞句をtarget storyへ誤付着」「数量・状態・基準参照をstoryへ潰す」という明白な構造退化が多かった。したがって今回に限れば偽陽性は出にくく、母集団設計上は「単発か否か」より、action固有executorを持つ語彙（今回ならATTACH_CHARM）をどれだけ含むかが偽陽性率を左右すると考える。

## 6. 条件以外で見つけた原文との食い違い

**10 effect・13項目**。

- `WX07-045-E2`: findingの「全悪魔強制」は偽陽性だが、`execAttachCharm`は `charm.upToCount:true` を対話選択へ使わずtrash候補の先頭最大3枚と場候補の先頭最大3体を自動ペアリングする。「カード3枚までを対象」「好きな数の悪魔を対象」という二段のプレイヤー選択がない。
- `WD15-023-E1`: 原文は龍獣が「対戦相手のシグニ1体をバニッシュしたとき」で、バトル限定とは書かれていない。遅延triggerを `ON_SIGNI_BANISH_BATTLE` だけで組むと効果バニッシュを取りこぼすため、battle/効果双方のcauseを含む必要がある。
- `WX05-027-BURST`: choice②はtrash悪魔1枚を「手札に加えるか場に出す」だが、明細liveが途中省略されているため本表のfinding外事項として段2でchoice②全体を再確認すべき。
- `WX25-P3-083-E1`: choice②は「次の」自分attack phase開始時の遅延。class/countだけ直して即時UPにしてはならない。
- `WX21-Re07-E1`: choice②には「対戦相手のターンの場合」という使用分岐条件がある。全天使化だけでなくchoice availability/conditionも保持が必要。
- `WD20-018-E1`: choice①の原文は残りをdeck bottomへ好きな順番で置く。liveには `REVEAL_AND_PICK.remainder bottom` に加えて余分な `LOOK_AND_REORDER` が続いて見え、二重処理の可能性がある。
- `WXEX1-63-E1`: choice②は自己BANISH成功時だけSEARCH→ADD_TO_HAND→SHUFFLE。drive filterだけでなくdid-it隣接構造を維持する必要がある。
- `WXK03-079-E1`: 原文は「あなたのターンの場合」なので外側TURN_OWNERは正しいが、deck topが非該当ならtrashに残す。任意trashから別札を出す現状はfinding本体以外に同一性破壊でもある。
- `WX24-P1-048-E3`: DOWN対象は「このシグニ」1体で、支払い対象の他悪魔2体ではない。さらに支払いは「置かないかぎり」なので選択可能性と支払不能時のelseを両方保持する。
- `WXEX2-34-E1`: DRAWは鉱石全数（自身が鉱石なら自身も含む）、ECは「他の」宝石だけ。2つのcountFilterでexcludeSelfの向きが異なる。
- `WX22-Re02-E2`: cost `緑×0` はliveにあるが、AUTO/ON_PLAYとして扱われている。原文は【出】コスト付きなので任意支払いであることも維持が必要。
- `WXEX2-03-E1`: 付与durationはターン終了までだが、child liveのREMOVE_ABILITIES `until:PERMANENT`。親付与storeの失効で消える設計かを段2で確認し、恒久 `abilities_removed` に焼き込まないこと。
- `WX15-010-E1`: 「次にバニッシュされる場合」の1回消費がliveにない。全武勇化だけ直すとターン中何度でも防ぐ過剰効果が残る。

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

`git status --short` は本報告書 `stage1_batch8_triage.md` 1本だけが `??`、`git diff --stat` は空で、既存trackedファイルの変更は0。報告書はUTF-8で先頭20行・末尾20行を読み返し、文字列 `undefined` でないことを確認した。最終 `wc -c` 相当（PowerShell `Get-Item.Length`）は **35,735 bytes**。

## 8. ガードレール2・3・6で当初見立てから変えた件

- S001: `count:"ALL"` から全悪魔強制の真バグと見たが、`execAttachCharm:5431-5486` のpair-limit専用慣例を確認しfinding自体は偽陽性へ変更。別の任意選択欠落は§6へ分離した。
- S014: selectionConstraintが型にあるだけでは足りないため `execAddToField:2951` がsourceのconstraintを `selectOrInteract`へ渡し、`satisfiesSelectionConstraint:2686-2690` がclass集合交差を拒否するところまで確認し、機構待ち候補からparser真バグへ変更。
- S021: `levelParity`実装済みなのでparserだけで直せると見たが、直前deck topへの同一性をADD_TO_FIELD sourceが読めず、真バグ＋機構待ちへ変更。
- S031: 素のLRIG=センター慣例で偽陽性の可能性を検討したが、原文にclass指定がありassistを排除しないため、その慣例こそ過小実行になると判断して真バグ＋機構待ちへ変更。
- S037: `subjectFilter`を生成すれば足りる見立てを、`collectBanishEffectProtectedSigni` がSIGNIホストしか走査しない実装で撤回。LRIGホスト配線も必要。
- S038: 1つの `GRANT_PROTECTION from:[ルリグ,シグニ]` に条件を載せられる見立てを撤回。source typeごとに10/15という別条件で、`collectEffectImmuneSigni`のSEQUENCE抽出も一般形を消費しない。
- 先回りメモとの実測差: S014、S021、S030、S034およびGRANT_PROTECTIONの複数collectorという主要事実は一致した。S001について、メモEの「多くのexecutorでALLは全件」の一般論は正しいが、今回の `ATTACH_CHARM` は明示的な例外だったため、その実測を優先した。
