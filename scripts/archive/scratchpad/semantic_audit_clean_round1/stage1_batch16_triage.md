# 意味照合監査 clean群 round1 段1 第16バッチ triage（軸 `filter.color`）

## 1. サマリ

32 findings / 32 effectId を全件照合した。**真バグ32、偽陽性0、機構待ち6、要追調査0**。機構待ち6件は真バグにも計上した。

### action型別

| action型 | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---:|---:|---:|---:|
| (live無) | 1 | 0 | 1 | 0 |
| ADD_TO_LIFE | 1 | 0 | 0 | 0 |
| BANISH | 1 | 0 | 0 | 0 |
| BOUNCE | 1 | 0 | 1 | 0 |
| CHOOSE(CHOOSE/BANISH/SIGNI) | 1 | 0 | 1 | 0 |
| CHOOSE(CHOOSE/DOWN/CENTER_LRIG_OR_SIGNI) | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/DRAW/SEQUENCE) | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/GRANT_KEYWORD/SIGNI) | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/NEGATE_ATTACK/SIGNI) | 1 | 0 | 0 | 0 |
| CHOOSE(CHOOSE/TRANSFER_TO_HAND/ENERGY_CARD) | 1 | 0 | 0 | 0 |
| ENERGY_CHARGE | 1 | 0 | 0 | 0 |
| FREEZE | 1 | 0 | 0 | 0 |
| GRANT_EFFECT | 2 | 0 | 0 | 0 |
| GRANT_PROTECTION | 1 | 0 | 1 | 0 |
| LOOK_AND_REORDER | 1 | 0 | 1 | 0 |
| POWER_MODIFY_PER_TRASH_COUNT | 1 | 0 | 0 | 0 |
| POWER_MODIFY | 3 | 0 | 0 | 0 |
| POWER_SET | 1 | 0 | 0 | 0 |
| REVEAL_AND_PICK | 1 | 0 | 0 | 0 |
| SEARCH | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/ADD_TO_FIELD/TRASH_CARD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/GRANT_EFFECT/SIGNI) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/LIFE_CRASH/TRANSFER_TO_HAND) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/SEARCH/REVEAL) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRANSFER_TO_DECK/TRASH_CARD) | 1 | 0 | 0 | 0 |
| SEQUENCE(SEQUENCE/TRASH/DECK_CARD) | 1 | 0 | 0 | 0 |
| TRANSFER_TO_DECK | 1 | 0 | 0 | 0 |
| TRANSFER_TO_HAND | 1 | 0 | 1 | 0 |
| TRASH | 1 | 0 | 0 | 0 |
| **合計** | **32** | **0** | **6** | **0** |

### 5つの原因＋その他

| 原因 | 件数 | findings |
|---|---:|---|
| ① ORの片側脱落／OR色条件欠落 | 4 | S006, S008, S009, S012 |
| ② 条件の色が対象へ誤付着 | 2 | S003, S005 |
| ③ 条件版／選択制約版の取り違え | 1 | S011 |
| ④ ゾーン違い | 0 | — |
| ⑤ 語彙・配線が無い | 5 | S001, S004, S015, S016, S031 |
| ⑥ その他 | 20 | S002, S007, S010, S013, S014, S017〜S030, S032 |
| **合計** | **32** | |

S005は②を主因に置いたが、正しい条件へ直すには色付きスペル使用履歴が不足するため機構待ちにも計上する。

## 2. finding 全32件の分類

| S番号 | effectId | parseStatus | 分類 | 根拠 | consumer | 検討して外した慣例エンコード | 原文の該当句 |
|---|---|---|---|---|---|---|---|
| S001 | WX24-P4-038-sub-E1 | 該当effectなし | 真バグ＋機構待ち | liveは`null`で、全ルリグへ付与される第1起動能力そのものが無く、付与先ルリグの色をトラッシュ対象へ比較する処理もない。 | 付与ACTIVATEDの候補生成→`resolveDynamicFilter`→`execAddToField` | 最寄りは`colorMatchesLrig`だがセンター固定で、能力を得たcenter/assistのinstanceを参照できない。 | このルリグと共通する色を持つシグニ1枚 |
| S002 | WXDi-P01-004-E1 | AUTO | 真バグ | live条件は`LIFE_COUNT eq 0`だけで、青と緑を別々の場ルリグが持つAND条件が完全に抜けている。 | `evalCondition`の`FIELD_LRIGS_HAVE_COLORS`（`execUtils.ts:1586`） | `LRIG_COLOR`はセンター1体限定。既存`FIELD_LRIGS_HAVE_COLORS{colors:['青','緑']}`が場の3枠を走査するため機構追加不要。 | あなたの場に青と緑のルリグがいる |
| S003 | WX24-D2-11-E1 | AUTO | 真バグ | `ARTS_USED_THIS_TURN{color:'赤'}`は既に正しい一方、対象filterにも`color:'赤'`が重複し、原文の色を問わないpower≤2000を赤だけへ狭めている。 | `evalCondition`の`ARTS_USED_THIS_TURN`（`execUtils.ts:1701`）と`execBanish` | 第8バッチS006/S007・第9バッチ`WX22-002-E2`同型。条件色を対象色として再利用する慣例はない。 | 対戦相手のパワー2000以下のシグニ1体 |
| S004 | WXDi-P05-049-BURST | AUTO | 真バグ＋機構待ち | BOUNCEにはpower≤10000しかなく、白を持つ場ルリグを2体数える条件が存在しない。 | `evalCondition`→`execBounce` | 最寄りの`FIELD_LRIG_COLOR_COUNT`は場ルリグの**色種類数**、`FIELD_LRIGS_SHARE_COLOR{minCount:2}`は共通色を持つ任意2体で、白ルリグ2体を数えられない。 | あなたの場に白のルリグが2体以上いる場合 |
| S005 | WX25-P2-075-E1 | AUTO | 真バグ＋機構待ち | choice①にconditionがなく、代わりにBANISH対象へ`color:'赤'`が付き、赤スペル使用済み条件が対象色へ誤付着している。 | `evalCondition`の`SPELL_USED_THIS_TURN`（`execUtils.ts:1709`）→`execChoose` | 最寄りの`SPELL_USED_THIS_TURN`は`actions_done`の回数だけで色を保持しない。`ARTS_USED_THIS_TURN{color}`はアーツ履歴なので流用不可。 | このターンにあなたが赤のスペルを使用していた場合 |
| S006 | WX24-P4-031-E1 | AUTO | 真バグ | choice②のTRANSFER_TO_DECK sourceはcardTypeだけで、ORである赤・緑の両方が欠落している。 | `execTransferToDeck`→`matchesFilter` | `TargetFilter.color:string[]`はORとして消費されるため`color:['赤','緑']`で表現済み。AND解釈はしない。 | 対戦相手の赤か緑のシグニ1体 |
| S007 | WX25-P2-057-E1 | AUTO | 真バグ | ON_BANISHに`triggerScope`も`triggerFilter`もなく、自分の青シグニ以外のバニッシュでも発火する。 | `collectBanishTriggers`のtriggerScope/triggerFilter判定 | action側のADD_TO_FIELD level1は発火元条件を救済しない。既存`triggerScope:'any_ally'`＋`triggerFilter:{color:'青'}`で足りる。 | あなたの青のシグニ1体がバニッシュされたとき |
| S008 | PR-K044-E3 | AUTO | 真バグ | choice①が`color:'緑'`のみで、原文ORの赤側だけが脱落している。 | `execGrantKeyword`→`fieldCandidates`→`matchesFilter` | `color:['赤','緑']`の配列ORが既存。単色緑は「赤か緑」の正準化ではない。 | あなたの赤か緑のシグニ1体 |
| S009 | WX24-P4-033-E1 | AUTO | 真バグ | choice②のSEND_TO_ENERGY targetにfilter自体がなく、青・黒ORを無視して全相手シグニを候補にする。 | `execSendToEnergy`→`fieldCandidates` | `color:['青','黒']`で既存表現可能。`sharedColor`は複数選択集合の制約であり単体色ORには使わない。 | 対戦相手の青か黒のシグニ1体 |
| S010 | WXK10-028-BURST | AUTO | 真バグ | energyから手札／場の両choice sourceがcardTypeのみで、どちらも緑以外を選べる。 | `execTransferToHand`と`execAddToField`のENERGY_CARD候補 | choice共有元を暗黙継承する慣例はなく、各source filterへ`color:'緑'`が必要。 | エナゾーンから緑のシグニ1枚 |
| S011 | WXDi-P10-070-E1 | AUTO | 真バグ | `nonColorless:true`はあるが、選んだ2枚相互に共通色がないことを強制する`selectionConstraint`がない。 | `execEnergyCharge`→`selectOrInteract`→`satisfiesSelectionConstraint`（`execUtils.ts:2693`） | 条件型`NO_COMMON_COLOR_AMONG_FIELD_SIGNI`は盤面存在条件。選択集合には`sharedColor:'none'`を使う。 | それぞれ共通する色を持たず無色ではないシグニ2枚 |
| S012 | PR-046-E3 | AUTO | 真バグ | costは無色エナ2だけで、白か青のシグニ1枚を手札から捨てる起動コストが丸ごと欠落している。 | `handDiscardSigni`の可否・候補・支払UI（`screens/battle/costs.ts:125-139`） | `EffectCost.handDiscardSigni.color`も配列OR対応済みなので`{color:['白','青'],count:1}`で足りる。 | 手札から白か青のシグニを1枚捨てる |
| S013 | WXDi-P09-069-E1 | AUTO | 真バグ | 同一filterに`color:'青'`と3名称を置くためANDとなり、「3名称のいずれか、または青」の集合を大幅に狭める。 | `execGrantEffect`→`fieldCandidates`→`matchesFilter` | 隣接field`TargetFilter.anyOf`が種別・名称・色を跨ぐORを再帰評価するため、機構待ちではない。 | 3種の指定シグニか青のシグニ1体 |
| S014 | WXDi-P08-061-E1 | AUTO | 真バグ | 赤と3名称が同じfilterでANDされ、指定名称の非赤シグニと名称外の赤シグニを候補から落とす。 | `execGrantEffect`のtarget filter解決 | `anyOf:[{cardNames:[...]},{color:'赤'}]`が既存の異種条件OR。`color:string[]`は色同士のORだけなので今回は`anyOf`を使う。 | 3種の指定シグニか赤のシグニ1体 |
| S015 | WX11-032-E2 | AUTO | 真バグ＋機構待ち | GRANT_PROTECTIONは全相手シグニ効果を遮断し、解決中sourceと保護対象スノロップの色交差を検査しない。 | `collectEffectImmuneSigni`の`sourceFilter`判定（`effectEngine.ts:5314-5315`） | 最寄りの`sourceFilter`はsource単体属性だけを`matchesFilter`し、保護対象sourceNumとの動的共通色比較を渡せない。`colorMatchesLrig`は主語がセンタールリグ。 | 自身と共通する色を持つ対戦相手のシグニの効果を受けない |
| S016 | WXDi-P12-039-E1 | AUTO | 真バグ＋機構待ち | liveは5枚を見て全てbottomへreorderするだけで、基準1枚＋共通色なし0〜1枚をenergyへ分配する選択段がない。 | `execLookAndReorder`の閲覧pool・destination対話 | 最寄りの`SelectionConstraint.sharedColor:'none'`は単一選択集合全体を相互制約するだけで、必須1枚とそれに対する任意1枚のquota/destination partitionを表せない。第11バッチ§4 S022のLOOK集合partition基盤に追加する。 | カード1枚と、そのカードと共通する色を持たないカードを1枚まで |
| S017 | WXK10-042-E1 | AUTO | 真バグ | `countFilter`がシグニだけなので、trashの全色シグニを2枚単位で数え、青限定の減少量より過大になる。 | `execPowerModifyPerTrashCount`のcountFilter | `TargetFilter.color:'青'`はtrash count consumerでも既存`matchesFilter`へ渡るため、単純filter欠落。 | トラッシュにある青のシグニ2枚につき－1000 |
| S018 | WXDi-P09-070-E1 | AUTO | 真バグ | CONTINUOUS POWER_MODIFYにactiveConditionがなく、energyが0色・1色でも常時＋4000する。 | `checkActiveCondition`→`ENERGY_COLOR_TYPES`（`effectEngine.ts:314`） | `ENERGY_COLOR_TYPES{owner:'self',operator:'gte',value:2}`がゾーン・色種類数とも一致する。 | エナゾーンのカードが持つ色が合計2種類以上あるかぎり |
| S019 | WXDi-P12-076-E1 | AUTO | 真バグ | self限定POWER_MODIFYだけで、自場シグニの色種類数3以上というactiveConditionがない。 | `checkActiveCondition`の`HAS_CARD_IN_FIELD.distinctColors` | `HAS_CARD_IN_FIELD{filter:{cardType:'シグニ'},distinctColors:true,minCount:3}`は一致シグニの色集合を数える既存条件。energy用語彙へ誤配線しない。 | あなたの場にあるシグニが持つ色が合計3種類以上 |
| S020 | WDA-F03-13-E1 | AUTO | 真バグ | activeCondition不在のため、energyに白・青・緑・黒のいずれも無くても＋2000する。 | `checkActiveCondition`→`evalCondition` | `ENERGY_HAS_COLOR`は列挙色**すべて**のANDなので不適。既存`OR`の各枝に色別`ENERGY_COUNT_FILTER gte1`を置けば「いずれか」を表せる。 | エナゾーンに白か青か緑か黒のカードがあるかぎり |
| S021 | WX10-038-E1 | AUTO | 真バグ | CONTINUOUS `POWER_SET`がcount:1・filterなしなのでconsumer慣例により効果元自身だけを15000にし、全自場の赤シグニへ適用しない。 | `calcFieldPowers`のPOWER_SET（`effectEngine.ts:1849`以降） | count≠ALLはsource自動適用という第7バッチ13機構の1つ。正解はcount:`ALL`＋`color:'赤'`で、現JSONの救済にはならない。 | あなたの赤のシグニの基本パワーを15000にする |
| S022 | WDA-F04-10-E1 | AUTO | 真バグ | REVEAL_AND_PICK filterはcardTypeだけで、公開札がセンタールリグと共通色かを判定せず手札に加える。 | `execRevealAndPick`→`resolveDynamicFilter` | 先回りメモBHに反し`colorMatchesLrig:true`がTargetFilterに存在し、`resolveDynamicFilter`が具体色へ解決するため機構待ちではない。 | センタールリグと共通する色を持つシグニの場合 |
| S023 | PR-318-E1 | AUTO | 真バグ | `colorMatchesLrig:true`は正しく存在するが、同時に`cardType:'ルリグ'`へ限定し、原文の任意カード検索をルリグだけへ狭める。 | `execSearch`→`resolveDynamicFilter`（`effectExecutor.ts:5547`） | 共通色比較は既に実装済み。不要なcardTypeを外すだけで、`colorMatchesLrig`を新語彙へ置換しない。 | センタールリグと共通する色を持つカード1枚 |
| S024 | PR-322-E2 | AUTO | 真バグ | actionはtrash黒シグニを出す1経路だけで、原文のhand黒シグニを出す選択肢が消失している。 | `execChoose`→`execAddToField`のHAND_CARD/TRASH_CARD source | CHOOSEで同じADD_TO_FIELDをsource zone別に2枝持てる。`color:'黒'`も両source consumerで既存。 | トラッシュから黒のシグニ1枚を場に出すか手札から黒のシグニ1枚を場に出す |
| S025 | WX25-CP1-088-E1 | AUTO | 真バグ | UPが独立した自分のシグニ1体を無条件選択し、直前に付与した対象・level3・黒の3条件を一つも保持しない。 | `SELECT_TARGET_ONLY`/stored target→条件→`UP.targetsStored` | 第7バッチ慣例のUP source自動適用は「効果元」用で、直前に選んだ別シグニには効かない。既存stored-target正準形で表現可能。 | それがレベル3の黒のシグニの場合、それをアップする |
| S026 | WXDi-D07-011-E1 | AUTO | 真バグ | 原文の使用条件はチーム＋全員level1以上だけなのに、liveは別途無色energy1を支払わせる。 | ability使用可否・cost支払consumer→condition評価 | 色条件をenergy costへ変換する慣例はない。既存`LRIG_TEAM_COUNT`/`LRIG_LEVEL`条件を残してenergy costを除く差分。 | 【使用条件】【チーム】デウス・エクス・マキナ＆全員レベル1以上 |
| S027 | WXDi-D08-011-E1 | AUTO | 真バグ | 白・赤ルリグ条件はliveに既にあるが、原文にない無色energy3も追加され、使用時に余計な支払いを要求する。 | cost可否・支払UIと`evalCondition` | `HAS_CARD_IN_FIELD`による現live条件のconsumer妥当性とは別に、使用条件をコストへ二重変換する慣例はない。 | 【使用条件】あなたの場に白と赤のルリグがいる |
| S028 | WX20-079-E1 | AUTO | 真バグ | sourceはシグニ＋distinct levelだけで、黒以外の異levelシグニも4枚へ混ぜられる。 | `execTransferToDeck`のsource filter＋selectionConstraint | `distinct:'level'`は色を含意しない。既存`color:'黒'`とAND併用するだけでよい。 | それぞれレベルの異なる黒のシグニ4枚 |
| S029 | WXEX2-51-E3 | AUTO | 真バグ | ADD_TO_FIELD sourceは黒を持つがpower上限がなく、黒なら12000超も場に出せる。 | `execAddToField`→trash candidates→`matchesFilter` | `powerRange.max:12000`はTargetFilterの既存単体制約。黒filterとANDで併記できる。 | パワー12000以下の黒のシグニ1枚 |
| S030 | WXK09-058-E1 | AUTO | 真バグ | trash sourceはlevel4のみで、白・赤・青・緑のlevel4も選べる。 | `execTransferToDeck`のTRASH_CARD filter | level4と`color:'黒'`は同一TargetFilterでAND評価される既存形。 | レベル4の黒のシグニ1枚 |
| S031 | WX24-P1-013-E1 | AUTO | 真バグ＋機構待ち | 回収sourceは色なしの**シグニ**になっており、正しいcardTypeスペルと、場に出た電機シグニとの共通色比較の両方を失っている。 | `collectPlayTriggers`が渡す`triggeringCardNum`→`resolveDynamicFilter`→`execTransferToHand` | 最寄りの`colorMatchesLrig`はセンター比較、`colorMatchesLastProcessed`は直前action処理札比較。トリガー元シグニ用の`colorMatchesTrigger`が隣接fieldにもない。 | そのシグニと共通する色を持つスペル1枚 |
| S032 | WXEX1-29-E2 | AUTO | 真バグ | TRASH targetは相手シグニだけで、センタールリグとの共通色filterが欠落している。 | `execTrash`→`resolveDynamicFilter`→field candidates | `colorMatchesLrig:true`はセンター比較を既に実装し、`execTrash`も動的filter解決経路を通るため機構待ちではない。 | センタールリグと共通する色を持つ対戦相手のシグニ1体 |

根拠列は32/32件すべて異なる文面であり、同じ色句のカードもlive構造・正しい色語彙・consumerを個別に記した。

## 3. 所見（原因分類別）

### ① ORの片側脱落／OR色条件欠落

S006/S008/S009は`TargetFilter.color:string[]`という既存OR語彙をparserが生成しなかったか、S008では赤側だけを落とした。S012は同じORが`EffectCost.handDiscardSigni.color:string[]`に既にある。S013/S014は色同士のORではなく「指定名称群 OR 色」なので、隣接field`TargetFilter.anyOf`を使う別系統として⑥に置いた。

### ② 条件の色が対象へ誤付着

S003は赤アーツ条件を正しく生成済みなのにBANISH対象へ赤を重複付着し、S005は赤スペル条件を落としてBANISH対象へ赤を付着した。両件は**第8バッチS006/S007・第9バッチ`WX22-002-E2`と同型**であり、段2では「条件句の色を対象名詞句へ持ち越す」parser退化を1本の修正候補として扱える。ただしS005だけは色付きスペル履歴consumerが先に必要。

### ③ 条件版／選択制約版の取り違え

S011は盤面存在条件`NO_COMMON_COLOR_AMONG_FIELD_SIGNI`ではなく、今回選ぶtrash2枚の集合制約`SelectionConstraint.sharedColor:'none'`が正しい。`satisfiesSelectionConstraint`はペアごとの色集合交差を実際に拒否し、ENERGY_CHARGEのpendingにもconstraintが渡る。

### ④ ゾーン違い

0件。S018（energy色種類数）とS019（field色種類数）はゾーンごとに別の既存条件があり、liveでは他ゾーンへ誤配線されたのではなく条件そのものが欠落していた。

### ⑤ 語彙・配線が無い

S001は付与先任意ルリグinstance、S004は指定色を持つ場ルリグ体数、S015は保護対象自身と解決中source、S016はLOOK poolの基準1枚＋任意1枚partition、S031はtriggering signiとの色比較が必要。S005は原因②だが、色付きスペル使用履歴も不足する。

### ⑥ その他

既存色語彙を生成していない単純欠落が中心。S018/S019/S020はenergy種類数・field種類数・energy色ORを区別し、S022/S023/S032は既存`colorMatchesLrig`の有無とcardType過剰を別々に判定した。S026/S027は色filterではなく、使用条件を原文にないenergy costへ変換した別軸の真バグである。

## 4. 機構待ち一覧

| 登録単位 / findings | 不足語彙・機構・配線 |
|---|---|
| 付与先ルリグinstanceとの共通色 / S001 | 付与されたACTIVATED能力のhost center/assist instanceを実行contextへ渡し、`resolveDynamicFilter`で対象色へ解決する。**第8バッチ§4 S031（LRIG付与先候補化）・第13バッチ§4 S014/S015と同一基盤**として二重登録しない。 |
| 指定色ルリグ体数条件 / S004 | `FIELD_LRIG_COUNT_FILTER{owner,filter:{color},operator,value}`相当を`evalCondition`へ追加。最寄りの`FIELD_LRIG_COLOR_COUNT`はdistinct色数、`FIELD_LRIGS_SHARE_COLOR`は色を指定しないため使えない。 |
| 色付きスペル使用履歴 / S005 | `SPELL_USED_THIS_TURN{owner,color?}`またはspell色台帳を、spell使用確定funnelと`evalCondition`へ配線。最寄りの`ARTS_USED_THIS_TURN{color}`は別カード種別、既存spell版は回数のみ。 |
| 保護対象自身とのsource共通色 / S015 | `GrantProtectionAction.sourceFilter`の動的比較語彙と、`collectEffectImmuneSigni`で保護対象sourceNumの色と解決中srcCard色を交差判定する配線。最寄りの`colorMatchesLrig`は比較元がcenter LRIG固定。 |
| LOOK基準札＋任意非共通色札partition / S016 | LOOK poolから基準1枚を必須選択し、それと共通色なしの0〜1枚を同じenergy destinationへ送り、残りだけbottom reorderする多段対話。**第11バッチ§4 S022（LOOK集合destination別quota partition）と同一基盤**として二重登録しない。 |
| trigger cardとの共通色 / S031 | `TargetFilter.colorMatchesTrigger`相当を`resolveDynamicFilter`へ追加し、`ctx.triggeringCardNum`の色をTRANSFER_TO_HAND sourceへ解決。第14バッチ§4 S004/S028のtrigger-card動的filter producerと基盤共有できるが、色producerは未登録。 |

機構待ちは**6 findings、6登録単位**。S022/S023/S032は先回りメモBHと異なり`colorMatchesLrig`が既存なので登録しない。

## 5. 偽陽性件数の自己評価

事前予測は**0〜3件（0〜9%）**。色語彙が豊富なため、findingの主成分は「engineに語彙があるのにliveが使っていない」真バグで、慣例エンコードによる救済は少ないと見込んだ。実測は**偽陽性0件**で予測帯内だった。

0件になった理由は、色のOR・energy/field色種類数・センタールリグ共通色・選択集合の非共通色がいずれもconsumerまで存在するのにliveから欠落していたためである。S027の白赤ルリグ条件のように色条件自体がliveにある例も、finding本体は原文にないenergy3追加なので救済されなかった。

## 6. 条件以外で見つけた原文との食い違い

**3件**。

- S008: 指摘対象のchoice①赤側脱落に加え、choice③「trashから赤か緑のカード2枚まで」もliveでは`filter:{}`で色条件が全脱落している。
- S021: 指摘対象の第1常時能力だけでなく、原文の第2常時能力「自場に赤シグニがあるかぎり、このシグニの基本パワー15000」も同じeffectIdのliveに存在しない。
- S031: 指摘対象の共通色欠落に加え、回収対象のcardTypeが原文の「スペル」ではなく`シグニ`へ誤変換されている。

## 7. ゲート・差分・成果物実測

`npm run gates`は全緑で指定ベースラインと一致した。

- typecheck PASS
- golden PASS **2337 / FAIL 0**
- smoke **10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**
- fuzz **CRASH 0 / HANG 0 / INVARIANT 0 / EXPLOSION 0**
- census 高シグナル **773 / baseline 773**
- census:stubs **A群🔴0 / C群0**
- manual-fields **0 effects**
- lint **0 errors / 260 warnings**

`git status --short`は開始前からMだった次の計器2本を維持した。

```text
 M scripts/archive/semanticAuditLedger.mjs
 M scripts/archive/semanticAuditMkBatchSingles.mjs
```

未追跡は既存の第8〜15バッチ成果物、第9〜16バッチ入力・索引に加え、今回許可された`stage1_batch16_triage.md`だけが新規。trackedファイルを新たに変更していない。

`git diff --stat`は計器2本だけで、内容は次のとおり。

```text
 scripts/archive/semanticAuditLedger.mjs         | 7 +++++--
 scripts/archive/semanticAuditMkBatchSingles.mjs | 5 ++++-
 2 files changed, 9 insertions(+), 3 deletions(-)
```

報告書の先頭20行・末尾20行を目視で再読し、見出し・合計・未置換placeholder・末尾節に異常がないことを確認した。`wc -c`相当（PowerShell `(Get-Item ...).Length`）の最終実測は **26464 bytes**。

### parseStatusを明細live行から読めなかった3件

- S001 `WX24-P4-038-sub-E1`: `live:null`。対象sub effect自体が無いためparseStatusは**該当なし**。
- S008 `PR-K044-E3`: 明細live行が`"man`で途中切れ。`public/data/effects_misc.json`の実体を再読し、**AUTO**と確認。
- S027 `WXDi-D08-011-E1`: 明細live行がcondition途中で切れ。`public/data/effects_WXDi.json`の実体を再読し、**AUTO**と確認。

## 8. ガードレール2・3・4・7で見立てを変更した件

| finding | 当初の見立て | 実コード確認後 |
|---|---|---|
| S004 | `FIELD_LRIG_COLOR_COUNT`で白ルリグ2体を表せる可能性 | consumerはdistinct色種類数を数えるだけ。`FIELD_LRIGS_SHARE_COLOR minCount:2`とのANDにも「白でない2体が共通色＋別の白1体」という反例があり、機構待ちへ変更。 |
| S011 | `NO_COMMON_COLOR_AMONG_FIELD_SIGNI`候補 | これは盤面存在条件。選ぶ2枚には`SelectionConstraint.sharedColor:'none'`が実際にpending/UIで消費されるため、既存語彙の真バグへ変更。 |
| S013/S014 | 色と名称を跨ぐORは機構待ちの可能性 | `TargetFilter`本体先頭の隣接field`anyOf`と`matchesFilter`再帰消費を確認し、機構待ちから外した。 |
| S016 | `sharedColor:'none'`で表現可能の可能性 | consumerは選択集合全体を対称に制約するだけで、基準1枚必須＋相手0〜1枚＋残りreorderの非対称partitionを表せず、機構待ちへ変更。 |
| S022/S023/S032 | 先回りメモBHどおりセンタールリグ共通色語彙なし | **メモと実測が食い違った。** `TargetFilter.colorMatchesLrig`（`effects.ts:724`）と`resolveDynamicFilter`（`effectExecutor.ts:2468-2477`）が存在し、各action consumerも動的解決するため機構待ちから外した。S023はその語彙を既に使っており、真因はcardType過剰。 |
| S025 | UPのsource自動適用で救済可能の可能性 | 第7バッチ13機構のsource自動適用は効果元自身用で、直前に選んだ「他のブルアカ」には向かない。stored-target経路が必要な真バグと確定。 |

先回りメモBB〜BGの型・consumerは概ね実測一致したが、**BHのみ明確に誤り**だった。またBGについて、`SPELL_USED_THIS_TURN`自体は存在するものの`color`隣接fieldがなく、赤スペル条件には不足するという差分を確認した。
