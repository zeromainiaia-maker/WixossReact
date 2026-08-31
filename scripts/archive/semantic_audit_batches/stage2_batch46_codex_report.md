完了しました。81 findings を全件分類し、確実に閉じられる32件を台帳へ反映しました。

- 実装修正：12効果・13 findings
- 既に live で直っていた偽陽性：17効果・19 findings
- 残OPEN：249 → 217
- commit / push：未実施
- `PLAN.md` / `PLAN_PROGRESS.md`：未編集
- HEAD：`45c6efd73` のまま

## 1. 変更ファイル

主要実装：

- [manualEffects.ts](C:/Users/zerom/WixossReact/src/data/manualEffects.ts:8575) — 12効果を既存語彙だけで外科override。
- [execStubPart1.ts](C:/Users/zerom/WixossReact/src/engine/execStubPart1.ts:171) — `SELECT_TARGET_ONLY` でも既存 `powerLteSelfHalf` を解決。
- [triggerCollect.ts](C:/Users/zerom/WixossReact/src/engine/triggerCollect.ts:1432) — self `ON_BANISH` 経路で既存 `banishedHadCharm` を評価。
- [decompileEffects.ts](C:/Users/zerom/WixossReact/scripts/decompileEffects.ts:2478) — 手札公開の `selectionConstraint.groups` を逆翻訳。
- [goldenTest.ts](C:/Users/zerom/WixossReact/scripts/goldenTest.ts:55940) — 採用効果、成立・不成立、動的上限3方向、fresh+manual を固定。
- [stage2_closed.txt](C:/Users/zerom/WixossReact/scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt:1374) — 指定見出し＋32 findingを正しい `:: quote` 形式で追記。
- [BUGFIXES.md](C:/Users/zerom/WixossReact/docs/BUGFIXES.md:3) — 続き751の記録。

live同期：

- `public/data/effects_WX24_26.json` — `WX25-CP1-082`
- `public/data/effects_WXDi.json` — `WXDi-P02-049 / P11-075 / P12-052 / P15-050`
- `public/data/effects_WXK.json` — `WXK07-048 / WXK10-023`
- `public/data/effects_misc.json` — `PR-K054 / WD20-018 / WDK04-011 / WDK06-R01 / WDK14-009`

生成・診断物：

- `docs/decompile_sheet3.txt`〜`sheet9.txt` — 採用12効果の逆翻訳更新。
- `docs/grouped_sentence_all.txt` — regen下流再生成。
- `docs/_held_fresh.json` / `_held_review.txt` — 最終held再生成。
- `docs/_manual_drift.txt` / `_manual_drift_dates.txt` — manual/live同期監査。
- `docs/_census_enginetext.txt` — engine行番号更新。
- `docs/_census_stubs.txt` / `_vocab_census.txt` — 最終ゲート出力。

既存関数の差分は限定的です。

- `SELECT_TARGET_ONLY`：動的フィルタ解決11行追加＋候補抽出2か所を解決済みfilterへ差し替え。
- `collectBanishTriggers`：`banishedHadCharm` の2行guardのみ追加。
- それ以外の既存ブロックは変更していません。

## 2. 81件の分類

### 受け皿あり・採用：13 findings

- `PR-K054-E1` — 期限
- `WD20-018-E1` — ＜英知＞限定
- `WDK04-011-E1` — 奇数公開札のトラッシュ
- `WDK06-R01-E2` — 場に出したシグニ以下
- `WDK14-009-E1` — 追加配置の出所・対象
- `WX25-CP1-082-E1` — 自身の半分以下
- `WXDi-P02-049-E1` — 相手シグニ限定
- `WXDi-P11-075-E1` — レベル1/2/3各1枚
- `WXDi-P11-075-E1` — 両選択肢の「そうした場合」
- `WXDi-P12-052-E2` — ディソナ限定
- `WXDi-P15-050-E1` — 下敷き合計2枚条件
- `WXK07-048-E1` — バニッシュ前のチャーム
- `WXK10-023-E1` — 捨てたシグニとの共通クラス

### finding偽陽性：19 findings

いずれも live JSON と engine 消費地点まで既に存在しました。

- `WDA-F03-13-E3` — `ZONE_SUM_COUNT <= 7`
- `WX18-056-E1` — `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE`
- `WX21-044-E2` — `THIS_CARD_PLACED_BY_CLASS`
- `WX25-P1-113-E1` — `nameEqLastProcessed`
- `WXDi-CP01-031-E1` — 2ゾーンの `ZONE_SUM_COUNT distinctBy:name >= 5`
- `WXDi-D07-017-E1` — 相手 `ENERGY_COUNT >= 2`
- `WXDi-P04-034-E1` — `FIELD_ATTACHED_COUNT`
- `WXDi-P04-034-E1` — 相手 `ENERGY_COUNT >= 2`
- `WXDi-P08-048-E1` — レベル1/2/3各1枚の `THIS_CARD_HAS_UNDER`
- `WXDi-P08-048-E1` — 各2枚＋兄弟E1bの【アサシン】
- `WXDi-P12-056-E1` — `ZONE_SUM_COUNT >= 7`
- `WXDi-P12-073-E2` — 条件後の `FREEZE`
- `WXDi-P13-009-E2` — `TRANSFER_TO_HAND`
- `WXDi-P13-067-E1` — `FIELD_ATTACHED_COUNT`
- `WXEX1-31-E1` — 3色不在の `ZONE_SUM_COUNT`
- `WXEX2-31-E1` — `nameEqTriggerSource`
- `WXK05-051-E1` — `distinctName`
- `WXK07-087-E2` — レベル1〜4の `HAS_CARD_IN_FIELD`
- `WXK09-036-E1` — `FIELD_ATTACHED_COUNT`

### 受け皿あり・見送り：15 findings

部分修正で同じ効果内の未表現部分を残すため、今回は採用していません。

- `WD08-008-E1` — `DECLARE_CLASS + classEqDeclaredClass` はあるが、公開結果から宣言候補を作る全列の再構成が必要。
- `WX25-CP1-TK2A-E1` — `aboveSelf + cardName` はあるが、クラフト上面関係を含めた確認が必要。
- `WX25-P1-088-E1` — `FIELD_SIGNI_ALL_DISTINCT_CLASS` あり。
- `WX26-CP1-059-E1` — 5枚／10枚の別条件は既存ゾーン枚数条件で表現可能。
- `WXDi-D03-011-E1` — `GRANT_LRIG_ABILITY` とレベルfilterあり。
- `WXDi-P00-012-E1` — `selectionConstraint.totalLevelMaxRef` あり。
- `WXDi-P01-049-E1` — `TURN_OWNER` あり。
- `WXDi-P08-068-E1` — `anyOf`、`HAS_CARD_IN_FIELD`、`HAND_COUNT` あり。
- `WXDi-P11-003-E1` — ルリグ3色条件は `FIELD_LRIG_COLOR_COUNT` あり。
- `WXDi-P11-003-E1` — 偽の「使用条件」付与は削除可能だが、同効果の再選択禁止が未表現。
- `WXDi-P11-TK02-E2` — `LIMIT_OPP_SIGNI_ATTACKS_ONCE` 系STUBは実装済み。
- `WXDi-P14-070-E1` — `GRANT_LRIG_ABILITY` 内の継続能力として表現可能。
- `WXDi-P16-051-E2` — `ENERGY_COUNT`＋条件分岐＋キーワード付与あり。
- `WXK01-001-E2` — `GRANT_PROTECTION` あり。
- `WXK06-030-E1` — `SELECT/STORE` と公開枚数条件はあるが、対象先決めを含む全列の再構成が必要。

### 受け皿なし・機構待ち：34 findings

- `PR-205-E1` — ターン内「最初のリフレッシュ」履歴なし。
- `PR-387-E1` — 最初に出したシグニのクロス条件との動的関係なし。
- `SP27-003-E1` — `duringAttackPhase` はあるが self `ON_TRASH` collectorが消費しない。
- `SP27-012-E1` — 天使色ごとの置換処理なし。
- `WD21-017-E1` — 移動原因「効果またはレゾナ出現条件」のORなし。
- `WX13-005B-E1` — チェックゾーンをスペルfilter付きで数える条件なし。
- `WX13-012-E1` — 選択対象のクロス条件名を動的検索する関係なし。
- `WX13-013-E1` — 選択3体の同一パワー制約なし。
- `WX17-046-E2` — 直前処理対象とのパワー完全一致filterなし。
- `WX21-010-E1` — 選択2体の同一パワー制約なし。
- `WX21-039-E1` — 2つの天使条件に応じた置換処理なし。
- `WX21-046-E1` — 選択集合の相異なるコスト制約なし。
- `WX24-P2-043-E1` — 次回アシストグロウのルリグタイプ無視機構なし。
- `WX24-P4-003-E1` — 直前に戻した相手シグニとのパワー一致なし。
- `WX24-P4-040-E2` — 捨てた同一スペルを使用するinstance束縛なし。
- `WX24-P4-102-E1` — 対象能力・効果の使用者owner軸なし。
- `WX25-CP1-016-E1` — 捨て札原因をシグニ／スペルのコスト・効果へ限定する軸なし。
- `WX25-P2-055-E2` — 対象能力・効果の使用者owner軸なし。
- `WX25-P2-075-E1` — 使用済みスペルの色履歴なし。
- `WXDi-CP01-002-E1` — 指定リレーピース使用済み履歴なし。
- `WXDi-CP02-001-E1` — 指定ピース使用済み履歴なし。
- `WXDi-CP02-001-E1` — 複数ルリグ下から合計4枚＋絆獲得処理なし。
- `WXDi-D06-013-E1` — バニッシュ原因「バトル以外」の否定軸なし。
- `WXDi-P00-021-E2` — 場のいずれかのシグニとの動的クラス共有filterなし。
- `WXDi-P11-003-E1` — メインフェイズごとの選択肢永続使用履歴なし。
- `WXDi-P11-079-E1` — 「付いている、または下にある」の対象filterなし。
- `WXDi-P15-063-E1` — 下敷きがあるシグニのTargetFilterなし。
- `WXEX2-03-E1` — 場＋トラッシュの全シグニ能力除去を一括処理する機構なし。
- `WXEX2-27-E3` — 相手ダメージ時の遅延timingなし。
- `WXK05-016-E2` — 「このターン捨てた特定カード」のinstance履歴なし。
- `WXK07-106-E1` — この方法で置いた同一カードinstanceを場へ出す束縛なし。
- `WXK10-003-E1` — 両者の場のシグニ数差条件なし。
- `WXK11-006-E4` — アタック全体がすべてガードされた集計履歴なし。
- `WXK11-028-E1` — `handOrField` の場選択だけをダウン配置する表現なし。

## 3. 採用12効果

JSONは条件・限定に関係する完全な部分を示します。

1. `PR-K054-E1`

   - 原文：`次のあなたのターンまで`
   - JSON：`POWER_MODIFY{thisCardOnly:true,delta:5000,duration:"UNTIL_OPP_TURN_END"}`
   - 逆翻訳全文：`【自】このシグニが場に出たとき：〈手札1枚を捨てる〉あなたのデッキの上から1枚をエナゾーンに置く。そしてこのシグニのパワーを＋5000する（次の相手ターン終了時まで）`
   - 一致：意味一致。engineでは「次の自ターン開始まで」をこの2スロット寿命で表現。

2. `WD20-018-E1`

   - 原文：`＜英知＞のシグニ１枚`
   - JSON：`REVEAL_AND_PICK{revealCount:4,pickCount:1,filter:{cardType:"シグニ",story:"英知"}}`
   - 逆翻訳全文：`【起】（メイン起動）：〈《緑×0》〉以下の2つから1つを選ぶ【あなたの＜英知＞のシグニ1体をバニッシュする。そうした場合、あなたのデッキ上4枚を公開し、その中から＜英知＞のシグニを1枚手札に加える、残りを好きな順番でデッキの一番下に置く。そしてあなたのデッキの上から0枚を見て、好きな順番でデッキの一番下に置く / あなたのライフが0であるなら、あなたのすべてのシグニをトラッシュに置く。そしてこの方法で＜英知＞のシグニを3枚以上処理したなら、あなたのデッキの一番上から1枚をあなたのライフクロスに加える】`
   - 一致：今回の＜英知＞限定は一致。別の既存不一致は後述。

3. `WDK04-011-E1`

   - 原文：`そのカードをトラッシュに置き`
   - JSON：`CONDITIONAL{LAST_PROCESSED_MATCHES{levelParity:"odd"},then:SEQUENCE[TRASH_REVEALED,POWER_MODIFY{-8000}]}`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《黒×1》〉あなたのデッキの上からカードを1枚公開する。そしてこの方法でレベルが偶数のシグニを1枚以上処理したなら、あなたのカード(デッキ)1枚を手札に加える。そしてこの方法でレベルが奇数のシグニを1枚以上処理したなら、公開したカードをトラッシュに置く。そして対戦相手のシグニ1体のパワーを－8000する（ターン終了時まで）`
   - 一致：一致。

4. `WDK06-R01-E2`

   - 原文：`この方法で場に出たシグニのパワー以下`
   - JSON：`BANISH.filter{cardType:"シグニ",powerLteLastProcessed:true}`
   - 逆翻訳全文：`【自】このシグニが場に出たとき：あなたのデッキの上からカードを3枚見る。その中から＜アーム＞のシグニを1枚場に出し、残りを好きな順番でデッキの一番下に置く。そして対戦相手の直前に処理したシグニのパワー以下のシグニ1体をバニッシュする`
   - 一致：対象上限は一致。

5. `WDK14-009-E1`

   - 原文：`追加でシグニ１枚を対象とし`
   - JSON：`CONDITIONAL{LRIG_STORY:"タウィル",then:ADD_TO_FIELD{source:TRASH_CARD{owner:"self",count:1,filter:{cardType:"シグニ"}}}}`
   - 逆翻訳全文：`【自】このシグニが場に出たとき：あなたのデッキの上からカードを4枚トラッシュに置く。そしてあなたのシグニ(トラッシュ)1枚をコストを支払わずに場に出す。そしてあなたのセンタールリグが＜タウィル＞なら、あなたのシグニ(トラッシュ)1枚をコストを支払わずに場に出す`
   - 一致：一致。

6. `WX25-CP1-082-E1`

   - 原文：`このシグニのパワーの半分以下`
   - JSON：`SELECT_TARGET_ONLY{powerLteSelfHalf:true} → STORE_LAST_PROCESSED_TARGETS → optional DOWN{self,ブルアカ,isUp,excludeSelf} → LAST_PROCESSED_COUNT_GTE{1} → BANISH{targetsStored:true}`
   - 逆翻訳全文：`【自】あなたのアタックフェイズ開始時：対戦相手のこのシグニのパワーの半分以下のシグニ1体を対象とする。そしてあなたの他の＜ブルアカ＞のアップ状態のシグニ1体をダウンする（してもよい）。そしてこの方法でカードを1枚以上ダウンしたなら、それをバニッシュする`
   - 一致：一致。上限ちょうど／+1／参照不能をgolden固定。

7. `WXDi-P02-049-E1`

   - 原文：`対戦相手のシグニ１体が場からトラッシュに置かれたとき`
   - JSON：`triggerScope:"any_opp",triggerFilter:{cardType:"シグニ"},triggerCondition:{fromZones:["field"]}`
   - 逆翻訳全文：`【自】対戦相手のシグニが場からトラッシュに置かれたとき：《once_per_turn》あなたのデッキの上から1枚をエナゾーンに置く`
   - 一致：一致。

8. `WXDi-P11-075-E1`

   - 原文：`レベル１、レベル２、レベル３`／`そうした場合`
   - JSON：選択肢① `REVEAL.selectionConstraint.groups=[Lv1×1,Lv2×1,Lv3×1]`、両枝 `LAST_PROCESSED_COUNT_GTE{value:3}`
   - 逆翻訳全文：`【自】このシグニがアタックしたとき：以下の2つから1つまで選ぶ【あなたの手札からレベル1のシグニ1枚とレベル2のシグニ1枚とレベル3のシグニ1枚を公開する。そしてこの方法でカードを3枚以上公開したなら、あなたのデッキの上から1枚をエナゾーンに置く / あなたの手札から＜水獣＞のシグニ3枚を公開する。そしてこの方法でカードを3枚以上公開したなら、あなたのカードを1枚引く】`
   - 一致：2 findingsとも一致。

9. `WXDi-P12-052-E2`

   - 原文：`《ディソナアイコン》のカード`
   - JSON：`TAKE_FROM_UNDER_SIGNI{fromThis:true,filter:{isDisona:true},destination:"energy",count:1,upToCount:true}`
   - 逆翻訳全文：`【自】あなたのアタックフェイズ開始時：このシグニの下から《ディソナアイコン》を持つカードを1枚までエナゾーンに置く`
   - 一致：一致。

10. `WXDi-P15-050-E1`

   - 原文：`自分のシグニの下にカードが合計２枚以上ある場合`
   - JSON：選択肢② `condition:{type:"FIELD_ATTACHED_COUNT",owner:"self",include:"under",operator:"gte",value:2}`
   - 逆翻訳全文：`【自】あなたのアタックフェイズ開始時：あなたの場に《解放者エルドラ×マークν》がいる場合、以下の2つから1つを選ぶ【対戦相手の手札を1枚トラッシュに置く（相手が選ぶ） / あなたの場のシグニの下にあるカードが2枚以上ある場合、対戦相手の手札を1枚トラッシュに置く（見ないでランダム）】`
   - 一致：一致。

11. `WXK07-048-E1`

   - 原文：`このシグニに【チャーム】が付いていた場合`
   - JSON：`triggerCondition:{turnOwner:"opponent",banishedHadCharm:true}`
   - 逆翻訳全文：`【自】《相手ターン》《対戦相手のターンの間》【チャーム】が付いているこのシグニがバニッシュされたとき：あなたのデッキの上から2枚をエナゾーンに置く`
   - 一致：一致。

12. `WXK10-023-E1`

   - 原文：`この方法で捨てたシグニと共通するクラスを持つ`
   - JSON：`SEARCH.filter:{cardType:"シグニ",level:{max:3},color:"赤",classMatchesDiscardSigni:true}`
   - 逆翻訳全文：`【自】このシグニが場に出たとき：〈《赤×1》＋手札から《赤》のシグニ1枚を捨てる〉あなたのデッキから2枚まで《赤》のレベル3以下のこの方法で捨てたシグニと共通するクラスを持つシグニを探して公開し手札に加える（その後シャッフル）`
   - 一致：一致。

## 4. 条件以外で見つけた食い違い

今回のfindingとしては閉じていません。

`WD20-018-E1` に3件あります。

- 選択肢①の後続が成功判定ではなく `IS_MY_TURN` でゲートされている。
- 原文にない `LOOK_AND_REORDER{count:0}` が残っている。
- 選択肢②の「すべてのシグニをトラッシュに置いてもよい」が非optional。

また `WDK06-R01-E2` はルリグ能力なのに逆翻訳が「このシグニが場に出たとき」と描画する既存の表示上の不一致があります。対象パワー限定そのものは正しいです。

## 5. 生パース・収穫差分

- parser変更：0ファイル
- 生パース変化集合：`∅`
- 生パースoutlier：0
- live JSON変化：上記12カードだけ
- liveの予期しないカード差分：0
- 逆翻訳差分：12効果・12行だけ
- 逆翻訳outlier：0
- U+FFFD、`???`、新規BOM：すべて増分0
- `git diff --check`：問題なし
- id集合変化：0

fresh規則の代わりに、今回は全件manual overrideなので `fresh+manual` assertを採用効果ごとに置きました。manual定義を外すと各token assertが失敗する構造です。

## 6. heldバケット

報告直前の `build:effects → heldReview` 実測：

- `_held_fresh`：85 → 74（-11）
- held署名群：31 → 26（-5）
- 手修正温存：26 → 25（-1）
- `_partial_fresh`：9、増減0
- `_idset_fresh`：7、増減0
- parseStatus-only：96、増減0
- fresh空：0
- 新規採用：0
- 純改善採用：1
- 効果単位採用：0
- manual新規追加：0

## 7. 最終ゲート

最終生成物に対して再実行済みです。

- typecheck：0 errors
- golden：`3091 PASS / 0 FAIL`
- smoke：`10709 OK / CRASH 0 / HANG 0 / INVARIANT 0`
- fuzz：200ゲーム、`CRASH/HANG/INVARIANT/EXPLOSION 全0`
- census：`12 / BASELINE_HIGH 12`
- census:stubs：A群0 / C群0
- manual-fields：0
- census:enginetext：`130行 / 127ハンドラ`
- orphan manual：10、増減0
- lint：`0 errors / 249 warnings`、warning増減0
- regen：全10シート完了

台帳の最終値：

- 段0：207
- 段1偽陽性：111
- 段2消化：909（877 → 909、+32）
- 残OPEN：217（249 → 217、-32）