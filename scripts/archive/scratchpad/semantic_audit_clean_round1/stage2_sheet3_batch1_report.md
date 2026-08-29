# §5.2 Sheet3 バッチ1 実施報告（2026-08-30）

着手SHAは `e31decf00`。指定11効果を原文・live JSON・fresh parse・engine消費地点まで照合し、**完全採用7効果、部分採用1効果、見送り3効果**とした。完全修正した13 findingだけを台帳へ追記し、段2消化は660→673、残OPENは460→447。commit / push はしていない。

## 1. 触ったファイルと理由

- `src/data/effectParser.ts`：対象8効果だけに限定した `applyStage2Sheet3Batch1` で条件・対象・分岐をfreshへ復元。
- `src/types/effects.ts`：`powerEqSelf`、`SAME_ZONE_HAS_SEED`、`ATTACK_ORDINAL_THIS_TURN.signiOnly`、`FIELD_COUNT.filter` と条件型ミラーを追加。
- `src/engine/effectExecutor.ts`：`powerEqSelf` を実効パワーの等値 `powerRange` に解決。参照不能は空ヒット。
- `src/engine/execUtils.ts`：`FIELD_COUNT.filter`、`signiOnly`、`SAME_ZONE_HAS_SEED` をAUTO/ACTIVATED側の `evalCondition` に実装。
- `src/engine/effectEngine.ts`：`SAME_ZONE_HAS_SEED` をCONTINUOUS側の `checkActiveCondition` にも実装。
- `scripts/decompileEffects.ts`：新条件・動的フィルタ・シグニ限定回数を逆翻訳へ表示。
- `scripts/goldenTest.ts`：fresh assert、成立/不成立、参照不能、期間つき付与、据置契約を追加。旧型数と `WXEX1-40-E1` の据置契約は受け皿成立に合わせて更新。
- `scripts/vocabCensus.ts`：実測改善481→477へratchetを同期し、旧481をコメントで保存。
- `public/data/effects_WX.json` / `effects_WXK.json`：heldReviewで照合・採用したlive効果。
- `docs/decompile_sheet3.txt` / `decompile_sheet8.txt`、`docs/_effect_srctext.json`、`docs/_held_fresh.json`、`docs/_held_review.txt`、`docs/_vocab_census.txt`、`docs/_census_stubs.txt`、`docs/_census_enginetext.txt`：`build:effects`、`regen`、`gates` の生成物。
- `scripts/archive/scratchpad/semantic_audit_clean_round1/stage2_closed.txt`：完全修正13 findingだけをquote前方一致で閉鎖。
- `docs/BUGFIXES.md` と本報告：修正履歴と根拠。

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。`manualEffects.ts`、偽陽性3効果、機構待ち4効果にも触っていない。

## 2. 調査結果と消費地点

### A群

- **A1 `WX22-002-E2`：成立。** 白枝の既存 `HAS_CARD_IN_FIELD` と同じ形を5色へ適用できる。一般のSEQUENCEへ配る規則にはせず、`effectParser.ts:7848-7878` の当該効果限定post-passにした。
- **A2 `WXEX1-48-E2`：成立（既存型を安全に拡張）。** `FIELD_COUNT` 自体は存在したがfilterを持たなかったため、`TargetFilter` を任意追加し、`execUtils.evalCondition` の `FIELD_COUNT`（`src/engine/execUtils.ts:1786`）で各ゾーンtopと `signi_down` を照合するようにした。`operator:'eq'` なので2体以上では不成立。
- **A3 `WXEX1-40-E1`：成立。** `collectEffectImmuneSigni`（`src/engine/effectEngine.ts:5751`）は `GRANT_PROTECTION` を読む前に `checkActiveCondition` を実行する（同`:5842-5844`）。したがってCONTINUOUSを10種類/15種類の2本へ分割すれば、それぞれの耐性だけが閾値どおり有効になる。goldenで9/10/14/15種類を固定した。
- **A4 `WXK07-028-E1`：成立。** `CHOOSE.conditionChoose` が既に可変個数と`upTo`を持ち、engine/UI既存経路で消費される。外側 `condition` と選択肢③内側 `CONDITIONAL` は `evalCondition`（`src/engine/execUtils.ts:1741`）が評価する。
- **A5 `WXEX2-03-E1`：見送り。** `collectLrigGrantedEffects`（`src/engine/effectEngine.ts:3059-3082`）は引用能力配列を複数保持できるが、2本目の `REMOVE_ABILITIES` の領域が表せない。`execRemoveAbilities`（`src/engine/effectExecutor.ts:7434`）の `allZones` は場に加えて手札・エナ・トラッシュを一括追加する（同`:7525-7533`）。原文の「場とトラッシュ」だけに限定できないため、2本目を足すと手札・エナまで能力を失わせる過剰実行になる。
- **A6 `WXK03-050-E1`：位置だけ採用。** `REVEAL_AND_PICK.remainder.position:'bottom'` は既存実行器で有効。一方、remainder単位のoptional受け皿はなく、`optional`をaction全体へ置くと当たり時の場出しまで任意になるため採用しなかった。底置き修正は退化ではないが、外れ札を必ず底へ置く点は原文不一致のままなのでfindingは閉じていない。

### B群

- **B1 `WXK07-052-E1`：成立。** `resolveDynamicFilter`（`src/engine/effectExecutor.ts:2522`）の `powerEqSelf` 分岐（同`:2658-2671`）が効果元の実効パワーを `powerRange:{min,max}` に解決し、`matchesFilter`（`src/engine/execUtils.ts:896`, `:971-979`）が対象の実効パワーと比較する。`sourceCardNum`欠落・非数値時は `powerRange:{min:1,max:0}` の空範囲＝fail-closed。goldenで同値、非同値、参照不能の3方向を固定した。
- **B2 `WXK05-053-E1-G`：成立。** `collectGrantedFromLayer`（`src/engine/effectEngine.ts:6586`）は外側CONTINUOUSの中央ゾーン条件を`:6611-6618`で評価し、子AUTOを条件ごと`:6666-6677`で保持する。AUTO発火時は `evalUseCondition` から `evalCondition` の `SAME_ZONE_HAS_SEED`（`src/engine/execUtils.ts:2279-2285`）へ入り、付与元の現在zoneにある `field.signi_seeds[zi]` を読む。CONTINUOUS/期間つき付与側にも同型を置いた `checkActiveCondition`（`src/engine/effectEngine.ts:646-651`）はsource不在時false。型だけ足して無条件成立へ落ちる穴はない。

### C群

- **C1 `WXK06-023-E1-G`：採用。** `ATTACK_ORDINAL_THIS_TURN` に任意の `signiOnly` を追加し、`evalCondition`（`src/engine/execUtils.ts:2209-2212`）で `attacked_signi_ids.length` だけを数える。ownerは`self`。この能力は「あなたのターン終了時」に自分へ付与されるため、両者合算やopponent参照ではない。ルリグ1＋シグニ3では不成立、シグニ4で成立をgolden固定した。
- **C2 `WXK07-048-E1`：見送り。** `collectBanishTriggers` の自己ON_BANISH経路（`src/engine/triggerCollect.ts:1364-1399`）は除去後stateでactive/conditionを評価し、`banishedHadCharm`を読まない。除去前 `signi_charms` のsnapshotを読む実装は場に残るwatcher経路だけ（同`:1417`）。`THIS_CARD_IS_CHARMED`を付けるだけではsourceが場から消えて常時falseになる。
- **C3 `WX22-047-E1`：見送り。** `matchesFilter` は引数の`effectivePower`と表記Powerのどちらを閾値比較に使うかは選べる（`src/engine/execUtils.ts:896-903`, `:971-979`）が、両者が異なることを比較するfilter keyはない。必要なのは `powerDiffersFromPrinted?:boolean` のような動的キーと、候補ごとに「実効値 !== card.Power」を判定する両候補経路への配線、成立/不成立goldenである。

## 3. 採用した効果の全件

### `WX22-002-E2`

- 原文条件節：白・赤・青・緑・黒それぞれの「あなたの場に〈色〉の＜天使＞がある場合」。
- 生成JSON：`SEQUENCE.steps` 5本をそれぞれ `CONDITIONAL{condition:{type:'HAS_CARD_IN_FIELD',owner:'self',filter:{cardType:'シグニ',color:'白|赤|青|緑|黒',story:'天使'}},then:<各効果>}`。赤のBANISH対象は `{owner:'opponent',filter:{cardType:'シグニ'}}`。
- 逆翻訳全文：`【自】あなたのアタックフェイズ開始時：あなたの場に《白》の＜天使＞のシグニがいるなら、対戦相手のシグニ1体を手札に戻す。そしてあなたの場に《赤》の＜天使＞のシグニがいるなら、対戦相手のシグニ1体をバニッシュする。そしてあなたの場に《青》の＜天使＞のシグニがいるなら、対戦相手の手札を1枚トラッシュに置く（相手が選ぶ）。そしてあなたの場に《緑》の＜天使＞のシグニがいるなら、あなたのデッキの上から1枚をエナゾーンに置く。そしてあなたの場に《黒》の＜天使＞のシグニがいるなら、あなたのシグニ(トラッシュ)1枚を手札に加える`
- 判定：意味一致。

### `WXEX1-48-E2`

- 原文条件節：`あなたの場にあるダウン状態のシグニが１体の場合`。
- 生成JSON：`CONDITIONAL{condition:{type:'FIELD_COUNT',owner:'self',filter:{cardType:'シグニ',isDown:true},operator:'eq',value:1},then:{type:'BANISH',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'}}}}`。
- 逆翻訳全文：`【自】このシグニがアタックしたとき：あなたの場のダウン状態のシグニが1体であるなら、対戦相手のシグニ1体をバニッシュする`
- 判定：意味一致。0体/1体/2体の両方向実行テスト済み。

### `WXEX1-40-E1` / `WXEX1-40-E1b`

- 原文条件節：`＜原子＞のシグニが１０種類以上あるかぎり`／`１５種類以上あるかぎり`。
- 生成JSON：E1=`activeCondition:{type:'TRASH_HAS_CARD',owner:'self',filter:{cardType:'シグニ',story:'原子'},minCount:10,distinctName:true}`＋`GRANT_PROTECTION{from:['シグニ']}`。E1bはminCount 15＋`from:['ルリグ']`。
- 逆翻訳全文：`【常】《あなたのトラッシュにそれぞれ名前の異なる＜原子＞のシグニが10種類以上あるかぎり》あなたの＜原子＞のシグニは対戦相手の、シグニの効果を受けない`／`【常】《あなたのトラッシュにそれぞれ名前の異なる＜原子＞のシグニが15種類以上あるかぎり》あなたの＜原子＞のシグニは対戦相手の、ルリグの効果を受けない`
- 判定：意味一致。10以上だけでルリグ耐性まで付かないことも実行テスト済み。

### `WXK07-028-E1`

- 原文条件節：チャーム1枚以上、3枚なら2つまで、選択肢③は3枚ならバニッシュ。選択肢②のシグニは所有者無指定。
- 生成JSON：top-level `condition:{type:'CHARM_COUNT',owner:'self',operator:'gte',value:1}`、`CHOOSE{chooseCount:1,conditionChoose:{condition:{CHARM_COUNT,gte,3},chooseCount:2,upTo:true}}`、choice② target owner=`any`、choice③=`CONDITIONAL{CHARM_COUNT gte 3, then:BANISH}`。
- 逆翻訳全文：`【自】あなたのアタックフェイズ開始時：あなたの場の【チャーム】が1枚以上の場合、以下の3つから1つを選ぶ。あなたの場の【チャーム】が3枚以上なら代わりに2つまで選ぶ【自分または対戦相手のシグニ1体のパワーを＋3000する（ターン終了時まで）。そしてそれは【ランサー】を得る（ターン終了時まで） / 自分または対戦相手のシグニ1体に【バニッシュされない】を与える（ターン終了時まで） / あなたの場の【チャーム】が3枚以上場合、対戦相手のシグニ1体をバニッシュする】`
- 判定：助詞の表示差を除き意味一致。0/1/2/3枚と選択上限をテスト済み。

### `WXK03-050-E1`（部分採用）

- 原文条件節：`そうでない場合、それをデッキの一番下に置いてもよい`。
- 生成JSON：`REVEAL_AND_PICK.remainder:{location:'deck',position:'bottom'}`。
- 逆翻訳全文：`【自】このシグニが場に出たとき：〈《白×1》〉あなたのターンの場合、あなたのデッキ上1枚を公開し、その中から＜遊具＞のレベル2以下のシグニを1枚場に出す、残りをデッキの一番下に置く`
- 判定：置き先は一致、任意性は不一致のまま。findingは未閉鎖。

### `WXK07-052-E1`

- 原文条件節：`このシグニと同じパワーの`。
- 生成JSON：`BANISH.target.filter:{cardType:'シグニ',powerEqSelf:true}`。
- 逆翻訳全文：`【自】このシグニが場に出たとき：対戦相手のこのシグニと同じパワーのシグニ1体をバニッシュする`
- 判定：意味一致。実効パワー同値だけを対象化し、参照不能時は0候補。

### `WXK05-053-E1-G`

- 原文条件節：`同じシグニゾーンに【シード】がある場合`。
- 生成JSON：外側 `GRANT_FIELD_SIGNI_ABILITY.abilities[0].condition:{type:'SAME_ZONE_HAS_SEED'}`。
- 逆翻訳全文：`【常】《このシグニが中央ゾーンにあるかぎり》このシグニは『【自】このシグニがアタックしたとき：同じシグニゾーンに【シード】がある場合、あなたのデッキの上から1枚をエナゾーンに置く』を得る`
- 判定：意味一致。別zoneのシードでは不成立、同zoneでは成立。

### `WXK06-023-E1-G`

- 原文条件節：`このターンにシグニが４回以上アタックしていた場合`。
- 生成JSON：外側 `GRANT_FIELD_SIGNI_ABILITY.abilities[0].condition:{type:'ATTACK_ORDINAL_THIS_TURN',owner:'self',operator:'gte',value:4,signiOnly:true}`。
- 逆翻訳全文：`【常】《このシグニが中央ゾーンにあるかぎり》このシグニは『【自】ターン終了時：このターンにシグニが4回以上の場合、対戦相手のライフクロスを1枚クラッシュする』を得る`
- 判定：逆翻訳の「アタックしていた」の省略以外は意味一致。シグニ4回で成立、シグニ3＋ルリグ1では不成立。

## 4. 見送った効果

- `WXEX2-03-E1`：第2引用能力の「場とトラッシュ」限定を表すzone集合がない。`allZones`流用は手札・エナまで巻き込むため不採用。
- `WXK07-048-E1`：自己ON_BANISH経路に除去前チャームsnapshot条件がない。`THIS_CARD_IS_CHARMED`は除去後に常時falseとなるため不採用。
- `WX22-047-E1`：印刷パワーと実効パワーの不一致を候補ごとに比較するfilterがないため不採用。

## 5. 条件以外で見つけた原文との食い違い

- 偽陽性1件：`WXK07-028-E1` の選択肢① `POWER_MODIFY{delta:3000}` は着手時liveに既に存在した。指定どおり台帳を閉じていない。
- 部分修正残1件：`WXK03-050-E1` はbottomへ直したが、任意性が未表現。
- それ以外の採用7効果では、今回の照合範囲に条件以外の新規不一致は0件。

## 6. ゲート数値

- `npm run golden`：**PASS 3037 / FAIL 0**（3030→3037）。
- `npm run census`：高シグナル **477 / baseline 477**（481→477）。
- `node scripts/groupSimilar.mjs --all`：5986カード、265グループ、**同型★0**。
- `npm run smoke`：**10705効果、CRASH/HANG/INVARIANT/SKIP 全0**。
- `npm run fuzz`：200ゲーム、CRASH/HANG/INVARIANT/EXPLOSION **全0**（最終runは効果実行7969、SKIP14、distinct 2669）。
- `npm run lint`：**0 errors / 249 warnings**（baseline比±0）。
- `census:enginetext`：A SELF_TEXT **131行 / 128ハンドラ**（増減0）。
- semantic ledger：**段0 213 / 段1偽陽性111 / 段2消化673 / 残OPEN447**（着手時213 / 111 / 660 / 460）。13 findingすべて段2へ移り、OPENは13減で一致。
- `npm run gates`：最終run全緑。最初のrunで既存の型数固定と旧 `WXEX1-40` 据置契約が赤になり、コメントの意図を原文・受け皿と再照合して期待値を更新後に再実行した。テスト削除は0。

## 7. 生パース/live A/Bの変化集合とoutlier

HEADの全 `public/data/effects_*.json` と最終liveをeffectId単位deep compareした。

```text
changed 8
WX22-002-E2
WXEX1-40-E1
WXEX1-48-E2
WXK03-050-E1
WXK05-053-E1       # 内包 WXK05-053-E1-G の条件追加
WXK06-023-E1       # 内包 WXK06-023-E1-G の条件追加
WXK07-028-E1
WXK07-052-E1
added 1
WXEX1-40-E1b
outliers 0
missing 0
```

すべて今回の11効果内。fresh側assertを追加し、`applyStage2Sheet3Batch1` 呼出しを一時的に外す反転確認では A1 fresh assert が `red expected CONDITIONAL got BANISH` で失敗した。復元後PASSなので、live温存だけで緑になるテストではない。

## 8. heldバケットとlint warning

`npm run build:effects` 直後の実測は **held raw 89→92**。差分は次の5カードだけ。

- added：`WXEX1-40`、`WXEX1-48`、`WXK03-050`。いずれも今回の原文修正で新たにheldへ入り、全leafを照合して採用。
- changed：`WX22-002`、`WXK07-028`。既存held内容が今回のfreshへ変わり、全leafを照合して採用。
- removed：0。

採用後の `heldReview` は同一5カードを除外し、レビュー残 **87枚 / 30署名群**。着手時レビュー対象89枚/31署名群から、以前からheldだった `WX22-002` と `WXK07-028` の2枚が解消した。表外heldの新規流入0。lint warningは **249→249（±0）**。

## 9. やらなかったこと／残る原文不一致

- `WXEX2-03-E1`：＜古代兵器＞条件の第2引用能力が今もJSONから欠落。
- `WXK03-050-E1`：外れ札をデッキ底へ置く処理が今も強制で、「置いてもよい」の任意性が欠落。
- `WXK07-048-E1`：「このシグニにチャームが付いていた場合」が今も欠落し、相手ターンにバニッシュされれば無条件エナチャージ2。
- `WX22-047-E1`：「表記パワーと異なるパワー」の対象限定が今も欠落し、相手シグニを無条件に選べる。
- `WXK07-028-E1 :: パワーを＋3000し`：liveが正しい偽陽性だが、指定どおり台帳上はOPENのまま。
- 偽陽性3件 `WXK03-032-CB-E1` / `WXK03-041-CB-E1` / `WXK05-035-E1` の `thisCardOnly`、機構待ち `WX22-048-E1` / `WXEX2-27-E3` / `WXK05-035`ライズ / `WX22-Re02-E2` は一切変更していない。
- ブラウザ実機検証、ネットワーク利用、commit、push、PLAN/PLAN_PROGRESS簿記はしていない。

## 10. 報告書とエンコーディング確認

`wc -c`相当のbyte計測は **18358 bytes**。UTF-8として先頭5行と末尾5行を読み返し、中身が入っていることを確認した。変更・新規21ファイルをHEADとbyte比較し、U+FFFD、3文字以上連続する`?`、先頭UTF-8 BOMはいずれも新規増0。`git diff --check`も空白エラー0（既存のLF→CRLF予告のみ）だった。
