# バグ修正記録 (BUGFIXES)

## 2026-09-01：PLAN §5.3 `O-188` 第6バッチ — 「それぞれ1枚まで」が**手札以外の帰結**で潰れていた3効果 ＋ 別物を実装していた STUB 1本

**Codex は2アカウントとも利用上限**（`.codex-work` 13:55／`~/.codex` 16:27 まで）だったので **Claude が実装**した。

**真因**＝第4バッチで直した「AとBをそれぞれ1枚まで」は**帰結が「手札に加える」の場合だけ**
（`TRANSFER_TO_HAND.transferGroups`）で、**帰結が別のアクションだと群ごと潰れたまま**だった。

🔑**受け皿は既存の `SelectionConstraint.groups`**（「＜A＞1枚と＜B＞1枚」の配分を表す機構）＝
`execAddToField`（`:3582`）・`execPlaceUnderSigni`（`:7551`）・`execSearch`（`:4586`）・`execTrash`（`:2028` 内2箇所）が
**そろって `selectionConstraint` を `selectOrInteract` へ渡しており**、`canAssignSelectionGroups` が
**どの群にも割り当てられない選択を却下する**（群外の札は取れない／同じ群の二重取りもできない）。**新型は0本。**

| 効果 | 原文 | 旧 live（実害） | 直した形 |
|---|---|---|---|
| `WXDi-P06-083-E2` | トラッシュから**レベル１、レベル２、レベル３のシグニをそれぞれ１枚まで**対象とし、それらをこのシグニの下に置く | `PLACE_UNDER_SIGNI{count:3, filter:{cardType:'シグニ'}}`＝**レベル限定が丸ごと消滅**（レベル1を3枚でも置けた＝過剰実行） | 群3つ（level 1/2/3 × 1枚） |
| `WXDi-P07-095-E1`② | トラッシュから**《惨之遊姫　グズ子//メモリア》とレベル２以下のシグニをそれぞれ１枚まで**対象とし、それらを場に出す | `ADD_TO_FIELD{count:1, filter:{level:{max:2}}}`＝**カード名の群が消えて①の劣化版**（枚数の過小＋候補の過剰） | `count:2` ＋ 群2つ（カード名／レベル2以下）。`filter` は2群の `anyOf` |
| `WXK05-030-E1` 後段 | デッキから**白、赤、青、緑、黒のカードをそれぞれ１枚まで**探して公開し手札に加える | `SEARCH{filter:{color:'黒'}, maxCount:1}`＝**最大5枚が1枚**（過小）＋**色が黒に化けていた**（他4色は0枚） | `maxCount:5` ＋ 5色の群 |
| 🆕`WXK05-030-E1` 前段 | **対戦相手の白、赤、青、緑、黒のシグニをそれぞれ１体**対象とし、それらを**トラッシュに置く** | `STUB{BANISH_MULTI_COLOR_SIGNI}`＝engine のハンドラは**「2色以上を持つ相手シグニを、選択させずに全部バニッシュ」**という**まったくの別物** | `TRASH{SIGNI, owner:'opponent', 色ごと1体の群}` へ typed 化し、**ハンドラを削除** |

### 🔴 前段の STUB は「実装済み」に見えて別物だった（`census:stubs` でも `census:enginetext` でも映らない）

`BANISH_MULTI_COLOR_SIGNI` は **engine に消費地点がある**ので `census:stubs` の A群🔴 には出ず、
**カード全文 regex も読んでいない**ので `census:enginetext` にも出ない。**逆翻訳も STUB の日本語ラベルを描くだけ**なので、
「複数色（2色以上）の相手シグニをバニッシュ」という**ラベル自体が原文と違う**ことに気付ける計器が1つも無かった。
⇒ 🔑**STUB の日本語ラベルは「実装の要約」であって「原文の要約」ではない**＝**原文と突き合わせるまで正しさは分からない。**
（今回は同じ効果の後段を直すために原文を読み直したので気付いた。）

### レーンの判断と実装方式

- **同型は各1枚**なので PLAN §2.0 の**速いレーン**＝`manualEffects.ts` に手書き（`parseStatus:'MANUAL'`）。
  ⚠**移設ではない**＝3件とも原文を読み直して JSON を書いた（PLAN §2.0 の禁止事項）。
- ただし**前段の5色トラッシュだけは parser（`parseSentencePart4.ts`）も直した**＝STUB を出す規則がそこに在ったため。
  同じ typed アクションを manual と parser の両方が出す（生成 JSON は一致）。
- 🔴**`upToCount:true` は意図的**＝候補の色構成によっては「ちょうどN体」を満たす選び方が存在しない
  （同じ色が2体・別の色が0体など）ので、**確定できない選択UIを作らないための fail-open**。原文に「まで」は無いが、
  群制約が上限を担保しているので過剰実行にはならない。

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3184 → 3186 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `6342f7d5f`・生文字列比較）＝**変更3・追加0・削除0・予定外0**。
- 3帳票＝`_held_fresh` **75**／`_partial_fresh` **10**／`_idset_fresh` **7**（いずれも据置）。
- ⚠**`manualEffects.ts` を直しただけでは live に届かない**（収穫マージが MANUAL を不可侵にする）＝
  **`npx tsx scripts/syncManualLive.ts WXDi-P06-083 WXDi-P07-095 WXK05-030` が必要**だった（CLAUDE.md の道具）。
- 🔴**反転確認**＝`src/data/manualEffects.ts` を戻すと **golden が赤**（`WXK05-030-E1: live が manualEffects.ts と一致する`）。
  🔑**新テストは live だけでなく「manual 由来のマージ結果」と live の一致まで assert する**＝
  「manual を直したのに同期し忘れた」も「live だけ手で書いた」も検知できる（§5-29 の逆向きの穴＝第5バッチで踏んだもの）。
- 逆翻訳（`regen` 後）＝3効果とも原文どおりに読める。例＝
  `WXDi-P06-083-E2`「あなたのトラッシュからレベル1のシグニ1枚とレベル2のシグニ1枚とレベル3のシグニ1枚をこのシグニの下に置く」／
  `WXK05-030-E1`「対戦相手の《白》のシグニ1体と…《黒》のシグニ1体をトラッシュに置く。そしてあなたのデッキから《白》のカード1枚と…」。
  ⚠**群の filter に `cardType` を入れるまで「カード1体」と描かれていた**＝逆翻訳は群の filter しか読まないので、
  **群にも名詞を決める情報を持たせないと原文照合が効かない**（第4バッチの `filterJa` 対応と同じ趣旨）。
- `node scripts/genStubsMd.mjs` を再生成（`BANISH_MULTI_COLOR_SIGNI` の行が消えた）。
- 🆕**副産物＝逆翻訳の STUB 説明が「別 id の削除メモ」になっていたのを直した**（`WXDi-P08-046-E1`）。
  `genStubsMd.mjs` は**ハンドラの `if` の直上にある連続コメント行**を説明として拾うので、
  **削除した id の記録を次のハンドラの真上に置くと、その説明として逆翻訳に出る**。
  ⇒ 削除メモとハンドラの間に**空行**を入れ、`// LEAVE_FIELD_TO_DECK_BOTTOM: …` の1行説明を足した
  （旧表示＝「§6.4 O-24：`OPP_TRASH_FIELD_SIGNI_AND_ENERGY` は削除した…」／新表示＝
  「このシグニが場を離れる場合、代わりにこれをデッキの一番下に置く」）。

**⚠実機は不要と判定**（§2.2）＝`src/data/` `src/engine/`（ハンドラ削除のみ）`scripts/` `public/data/` `docs/` だけで、
`src/screens/` は触らず、新しい型・機構も足していない（既存 `SelectionConstraint.groups` を使っただけ）。

## 2026-09-01：PLAN §5.3 `O-188` 第5バッチ — 対象名詞句の限定が丸ごと落ちていた4効果（過剰実行）＋「据置」だったはずの1件は**既に直っていた**

**Codex（既定 `~/.codex`）が parser・engine・golden まで実装したところで利用上限**（`try again at 4:27 PM`）に当たり、
**live JSON の再生成（`build:effects` → `heldReview --adopt`）と全ゲートが未了のまま中断**した。**Claude が引き取って完成**させた。
⚠**この巡は `.codex-work` が先に上限**（`try again at 1:55 PM`・**1トークンも使わず即 exit**）だったので既定ホームへ投げ直しており、
**2アカウント連続で上限に当たった**（前例＝2026-08-30 第13バッチ）。

### 群A＝「このターンに手札から捨てた」の履歴限定が消えていた（`SPK01-12-E1`）

原文「あなたのトラッシュから**このターンに手札から捨てた**＜水獣＞のシグニ１枚を対象とし、《緑》を支払ってもよい。
そうした場合、それを手札に加える」に対し、live は `filter:{cardType:'シグニ', story:'水獣'}` だけ＝
**トラッシュの＜水獣＞なら何でも回収できる過剰実行**。

**受け皿は在った**（`TargetFilter.discardedFromHandThisTurn`／消費は `execUtils.ts:1729` の `trashCandidates` funnel／
実装例は `manualEffects.ts` の `WXK05-016-E2`）。**無かったのは名詞句フィルタ側の語彙**＝
`parserUtils.ts` に `parseDiscardedFromHandThisTurnFilter` を新設し、`extractNounPhraseFilter` と `parseSigniTarget` の両方へ配線した。
**対象宣言（`SELECT_TARGET_ONLY.selectTarget`）と回収元（`TRANSFER_TO_HAND.source`）の2箇所とも**限定が付く。

### 群B🔑＝`WXDi-P09-043-E2` は「据置」ではなく**採用漏れ**だった（この巡でいちばん重要な発見）

同日の `O-188` 第2バッチは、この効果を「**上流の別規則が先に食うので未修正・負方向 golden で固定**」と記録していた。
🔴**実測すると、その時点で fresh パースは既に `filter:{thisCardOnly:true}` を出していた**（`src/` を第2バッチ時点へ戻して確認）。
**live に届いていなかっただけ**＝`cardType` が消える変更は**純粋上位集合ではない**ので収穫マージが live を温存し、
カードは `docs/_held_fresh.json` に載っていた。**負方向 golden が live しか見ていなかったので緑のまま**だった。

⇒ **`node scripts/heldReview.mjs --adopt WXDi-P09-043` の1コマンドで解決**（parser の変更は0行）。
🔑**教訓＝「直っていない」と記録する前に fresh を見る。** §5-29 は「live だけの assert では parser の退行を検知できない」だったが、
**逆向き（parser は直っているのに live が古い）も同じ assert の穴から落ちる**。
⇒ **据置を記録するときの golden は live と fresh の両方を assert する**（今回の新テストはそうした）。

### 群C＝「あなたのセンタールリグと同じレベルの」（`WXK02-028-E1` / `SP38-001-E1`）

🔴**PLAN §5.3 の登録票（および 2026-09-01 の第2バッチの記録）は「受け皿は無い・動的レベル比較キーの新設が要る」としていたが、誤り。**
**`TargetFilter.levelEqLrig?: 'self' | 'opponent'` は `src/types/effects.ts:1048` に在り、`effectExecutor.ts:2740` の
`resolveDynamicFilter` が消費し、golden（`goldenTest.ts:4448` `:4468`）まで張ってあった。**
使っていたのは**カード固有 `addFilter` ハードコード2箇所だけ**で、**一般規則が無かった**。

- `parserUtils.ts` の `parseLevelFilter` に「〈あなた／対戦相手〉のセンタールリグと同じレベルの」→ `levelEqLrig` を追加。
  ⇒ **`WXK10-053-BURST` のカード固有ハードコードは不要になったので削除**（生成 JSON は per-effect diff で**変化0**を確認）。
- `effectParser.ts` に `bindCenterLrigLevelUnionTarget` を追加＝「**ルリグかシグニ**」の union 対象（`CENTER_LRIG_OR_SIGNI`）へ
  同じ filter を戻す（シグニ単独は既存の `parseSigniTarget` 経路が担当）。
- 🔴**engine の穴も1つ塞いだ**＝`execGrantKeyword` は **`SIGNI` 単独のときしか `resolveDynamicFilter` を通しておらず**、
  `LRIG` と `CENTER_LRIG_OR_SIGNI` の枝は**生の filter のまま**候補を作っていた。さらに union の枝は
  **センタールリグを filter に関係なく必ず候補へ入れていた**。⇒ 両方を直した（参照不能時は `noMatch` で空ヒット＝fail-closed）。
  ⚠**ブラスト半径は実測済み**＝`GRANT_KEYWORD` × `CENTER_LRIG_OR_SIGNI` は live に **14効果**あるが、
  **`target.filter` を持つのは今回の `SP38-001-E1` だけ**（他13件は `selectionConstraint.groups` を使っており `tgt.filter` は無い）
  ＝`lrigLikeFilterOk(lrig, undefined)` は `true` を返すので**挙動は変わらない**。

### 検証コマンドと結果

- `npm run gates` 全緑＝**golden 3180 → 3184 PASS / FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**（BASELINE 12）／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **per-effect diff**（ベースライン `b54cc149d`・キー順を正規化しない生比較）＝**変更4・追加0・削除0・予定外0**
  （`SPK01-12-E1` / `WXDi-P09-043-E2` / `WXK02-028-E1` / `SP38-001-E1`）。
  ⚠`parseLevelFilter` と `parseSigniTarget` という**広く使われるヘルパ**を触ったので、ここが本命の検査だった。
- 3帳票（報告直前に `build:effects` → `heldReview` を再実行した実測値）＝`_held_fresh` 76 → **75**（`WXDi-P09-043` を採用した1枚ぶん減）／`_partial_fresh` **10**（据置）／`_idset_fresh` **7**（据置）。
- 🔴**反転確認はファイル単位で3回取った**＝
  ①`src/engine/effectExecutor.ts` を戻すと **群C の E2E が FAIL**（「異なるレベルの相手シグニは候補外」）＝engine 変更は載っている。
  ②`src/data/effectParser.ts` を戻すと **3本 FAIL**（群A の fresh assert・群A E2E・群C E2E）。
  ③`src/data/parserUtils.ts` だけを戻すと**import が壊れて実行不能**（新設関数を effectParser が参照するため）＝この軸は ② に含まれる。
- 逆翻訳（`npm run regen` 後）＝`SPK01-12-E1`「…このターンに手札から捨てた＜水獣＞のシグニ…」と原文どおり表示される
  （`decompileEffects.ts` の語彙を「このターンに捨てた」→「このターンに**手札から**捨てた」へ精密化した）。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` `src/engine/` `scripts/` `public/data/` `docs/` で、
**`src/screens/` は触っておらず、新しい型・機構も足していない**（既存 `resolveDynamicFilter` を既存の union 経路へ配線しただけ）。
engine 変更の実挙動は**新規 E2E golden 2本**（候補集合の正・負＋参照不能時の fail-closed）で固定した。

## 2026-09-01：PLAN §5.3 `O-188` 第4バッチ — 「AとBをそれぞれ1枚まで」の回収群を復元（過剰実行＋過小実行）

**真因**＝`TRANSFER_TO_HAND.transferGroups` と executor／逆翻訳の受け皿は既に在ったが、parser が
「あなたのトラッシュから〈A〉と〈B〉（と〈C〉）をそれぞれN枚まで対象とし、それらを手札に加える」から
群を生成していなかった。単一 `source.filter` に片群だけを残す／複数クラスをORへ潰す／限定を全部落とすため、
**合計2〜3枚が1枚へ減る過小実行**と、**限定外のシグニを拾える過剰実行**が同時に起きていた。

### 実装

- `src/data/effectParser.ts` — 効果単位の最終 root に限定文型 `applyRecoveryTransferGroups` を追加。
  名詞句の意味解釈は既存の厳格な `parsePickNounPhraseFilter` へ一任し、新規の名詞句パーサ／型／filterキーは作っていない。
  新規出力のクラスキーは `cardClass`。`applyDroppedRecoveryDesignation` より後なので同規則の
  `transferGroups` 非干渉契約を保ち、既に群を持つ形も触らない。
- `WXDi-P09-004-E1` の「共通修飾、レベル1、レベル2、レベル3のシグニ」は、助詞ではなく
  反復するレベル列挙を分割し、各句を同じ既存ヘルパへ渡した。
- `WXDi-P00-001-E1` は3つの連続 `TRANSFER_TO_HAND` が群と完全一致する場合に据え置く構造ガードを追加。
- `WX24-P4-017-E2` は一般規則だけで既存 JSON と完全一致したため、`applyExceedBodyFixes` のカード固有分岐を削除。
- 🆕**`scripts/decompileEffects.ts`（Claude が追加）** — `transferGroups` の逆翻訳が**自前で noun を組み立てており
  `cardType` と `color` しか描いていなかった**ので、他の群レンダラと同じく **`filterJa` に描かせる**1箇所へ直した。
  🔴**これを直さないと今回の修正そのものが読めない**＝クラス・レベル・アイコン・《ガードアイコン》を持たない・
  宣言クラスが**逆翻訳から丸ごと消え**、原文照合（このリポの主軸の検査）が効かない穴が新しく5効果ぶん増えていた。
- `scripts/goldenTest.ts` — live＋fresh の7効果、単一群の負対照、`WXDi-P00-001-E1` 据置、
  `WX24-P4-017-E2` 完全一致を3本で固定。既存「アイコンをANDしない」テストは、元の意図を保ったまま
  「アイコン群とクラス群が同じ filter に同居しない」を直接見る形へ精密化した。

### 調査結果・採用7効果

全件、既存 `transferGroups` と既存 `TargetFilter` だけで表現可能。JSON は今回生成した該当アクション。

| effectId | 原文の該当節 | 生成 JSON | 逆翻訳（効果全体） | 原文一致 |
|---|---|---|---|---|
| `WX16-026-BURST` | トラッシュからライズ持ちシグニと《武勇》のシグニを各1枚まで | `TRANSFER_TO_HAND{source:{TRASH_CARD,self,1},transferGroups:[{1,{cardType:'シグニ',hasRiseIcon:true}},{1,{cardType:'シグニ',cardClass:'武勇'}}]}` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は両限定を表示せず不一致 |
| `WX16-031-BURST` | ＜調理＞シグニとアクセ持ちシグニを各1枚まで | `…transferGroups:[{1,{cardType:'シグニ',cardClass:'調理'}},{1,{cardType:'シグニ',hasIcon:'アクセ'}}]` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は両限定を表示せず不一致 |
| `WXDi-D04-016-BURST` | シグニとスペルを各1枚まで | `…transferGroups:[{1,{cardType:'シグニ'}},{1,{cardType:'スペル'}}]` | `【LB】【ライフバースト】：あなたのトラッシュからシグニ1枚までとスペル1枚まで対象とし、それらを手札に加える` | 一致 |
| `WXDi-P04-022-E1` | デッキ上2枚をトラッシュ。その後、赤と黒のシグニを各1枚まで | `SEQUENCE[TRASH{DECK_CARD,2},TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',color:'赤'}},{1,{cardType:'シグニ',color:'黒'}}]}]` | `【自】このシグニが場に出たとき：あなたのデッキの上からカードを2枚トラッシュに置く。そしてあなたのトラッシュから赤のシグニ1枚までと黒のシグニ1枚まで対象とし、それらを手札に加える` | 該当節は一致（【出】の表示名は既存 decompiler 規約） |
| `WXDi-P08-002-E1` | 黒ルリグ条件内でLv2シグニとLv3シグニを各1枚まで | 3つ目の `CONDITIONAL.then=TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:2}},{1,{cardType:'シグニ',level:3}}]}` | `【起】（メイン起動）：〈《無×1》〉あなたの場のルリグが3体以上いて、持つ色が3種類以上の場合、あなたの場に《白》のルリグがいるなら、あなたの《ガードアイコン》を持つシグニ(トラッシュ)1枚を手札に加える。そしてあなたの場に《緑》のルリグがいるなら、対戦相手のパワー10000以上のシグニ1体をバニッシュする。そしてあなたの場に《黒》のルリグがいるなら、あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳はLv2/Lv3を表示せず不一致 |
| `WXDi-P09-004-E1` | 宣言クラス・非ガードのLv1/Lv2/Lv3シグニを各1枚まで | `SEQUENCE[DECLARE_CLASS,TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:1,noGuard:true,classEqDeclaredClass:true}},{…level:2…},{…level:3…}]}]` | `【起】（メイン起動）：〈《無×1》〉クラス１つを宣言する。そしてあなたのトラッシュからシグニ1枚までとシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える` | JSONは一致。逆翻訳は宣言クラス・非ガード・各レベルを表示せず不一致 |
| `WXDi-P11-056-E1` | 選択肢①でLv2以下の＜天使＞と＜古代兵器＞を各1枚まで | `CHOOSE.c0=TRANSFER_TO_HAND{…,transferGroups:[{1,{cardType:'シグニ',level:{max:2},cardClass:'天使'}},{1,{cardType:'シグニ',level:{max:2},cardClass:'古代兵器'}}]}` | `【起】（メイン起動）：〈《白×1》《黒×1》〉以下の2つから1つを選ぶ【あなたのトラッシュからシグニ1枚までとシグニ1枚まで対象とし、それらを手札に加える / あなたの場に《融合せし極門　ウトゥルス//メモリア》がいる場合、対戦相手のシグニ1体を手札に戻す】` | JSONは一致。逆翻訳はLv上限・両クラスを表示せず不一致 |

**見送り0件**。指定7効果はすべて既存機構で表現できた。触るな指定2効果は変更0：
`WXDi-P00-001-E1` は旧3連続アクションのまま、`WX24-P4-017-E2` は生成 JSON が旧専用分岐と完全一致。

### 別軸の食い違い・検証

- live JSON の今回の群条件以外で新たに見つけた原文差は **0件**。
- 🔴**上表の「逆翻訳が不一致」5件は Codex の報告時点の値**＝**同じ巡で Claude が `decompileEffects.ts` を直したので解消済み**。
  修正後の実出力（`npm run regen` 後）＝
  `WX16-026-BURST`「あなたのトラッシュから《ライズアイコン》を持つシグニ1枚までと＜武勇＞のシグニ1枚まで対象とし、それらを手札に加える」／
  `WXDi-P09-004-E1`「…レベル1の《ガードアイコン》を持たない宣言したクラスを持つシグニ1枚まで…（レベル2・3も同様）」／
  `WXDi-P11-056-E1`「…＜天使＞のレベル2以下のシグニ1枚までと＜古代兵器＞のレベル2以下のシグニ1枚まで…」＝**7効果とも原文と一致**。
- `npm run gates` 全緑＝golden **3177 → 3180 PASS / FAIL 0**、smoke **10721/10721・全0**、
  fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**、census高シグナル **11据置**、
  census:stubs **A0/C0**、manual-fields **0**、census:enginetext **A🔴130行据置**、
  lint **0 errors / 249 warnings（増減0）**。
- ベースライン `99dda6a11` との effectId 単位・キー順正規化済み機械 diff＝**変更7・追加0・削除0・予定外0**。
- 🆕**Claude 側の独立検証（`tmp_verify.mjs`＝キー順を正規化しない生文字列比較）では 変更8件**＝
  8件目は **`WXDi-D04-016-E2` の `activeCondition` の出現位置が動いただけ**で**中身は1バイトも同じ**
  （同カードが再生成された副作用）。⚠**「正規化済み diff で0」と「生 diff で0」は別の数字**なので、両方見ること。
- 🆕**反転確認は Claude も独立に再現**＝`applyRecoveryTransferGroups` の呼び出し1行を潰すと
  `npm run golden -- --only "O-188 第4"` が **1 PASS / 2 FAIL**（fresh assert と `WX24-P4-017-E2` 一致 assert）。復元後は全件 **3180/3180 PASS**。
- 🆕**逆翻訳の修正後に `npm run regen` → `npm run gates` を回し直して全緑**（golden 3180・census 11・
  census:stubs A0/C0・enginetext A🔴130行・lint 0 errors / 249 warnings）。
- 報告直前に `npm run build:effects` → `node scripts/heldReview.mjs` を再実行＝
  `_held_fresh.json` **76（増減0）**／`_partial_fresh.json` **10（増減0）**／`_idset_fresh.json` **7（増減0）**。
- 反転確認＝最終 root の一般規則呼び出しを一時無効化すると、新規3テスト中2本が FAIL：
  7効果の fresh assert は `WX16-026-BURST` で `transferGroups` 0件、`WX24-P4-017-E2` は旧単一filterへ退行。
  復帰後は新規3/3、全件3180/3180 PASS。
- 実機不要（§2.2）＝`src/data/`／`scripts/`／`public/data/`／`docs/` のみ。
  `src/engine/`／`src/types/`／`src/screens/` と新しい型・機構は変更していない。
- **実装は Codex（既定 `~/.codex`）／検証・逆翻訳の修正・簿記は Claude。**
  ⚠**`.codex-work` はこの巡の投入時点で利用上限**（`try again at 1:55 PM`）＝**1トークンも消費せず即 exit** したため、
  既定ホームへ投げ直した（前巡は「上限で途中放棄」だったが、今回は**着手前に落ちる**形＝残骸の判定が不要）。

## 2026-09-01：PLAN §5.3 `O-188` 第3バッチ — 回収の対象宣言がゾーンごと落ちて「無言 no-op」3効果

Codex は利用上限（`try again at 1:55 PM`）のまま復帰しなかったので **Claude が実装**した。

**真因**＝原文「あなたの〈トラッシュ／エナゾーン〉から〈X〉N枚(まで)を**対象とし**、〈任意コスト〉**てもよい**。
**そうした場合、それを手札に加える**」で、**対象宣言のゾーン・所有者・修飾が丸ごと落ち**、
帰結が既定の `TRANSFER_TO_HAND{source:{DECK_CARD, owner:'self', count:1}}` に化けていた。

🔴**「別のカードを拾う」ではなく、帰結が丸ごと起きない**＝`execTransferToHand` は `DECK_CARD` を
**`fromTop:true` のときしか扱わず**、それ以外は最後の `else` で `done(ctx)` に落ちる。
⇒ **コストを払っても何も起きない過小実行**。⚠**型は正しく値（ゾーン）だけが別物**なので、
逆翻訳・census・`census:goldentypes` のどれにも映らない。

**影響枚数**＝**3効果**（`WXDi-P01-070-E1`＝エナから＜武勇＞／`WXDi-P05-059-E2`＝トラッシュから赤のスペル／
`WDK08-Y14-E1`＝エナから＜水獣＞を1枚まで）。
**先行例と同じ作法**で `applyDroppedRecoveryDesignation` を新設した（`applyDroppedEnergyDesignation`＝続き375 に倣い、
**壊れている形＝`DECK_CARD` 既定に当たったときだけ**書き換える。既に正しいゾーンを持つ形は据置）。
📌`WXDi-P05-059-E2` は source が正しくなった結果、後段の `applyO96OptionalCostTargetFirst` が
**対象固定まで引き上げた**（規則が正しい入力を得ると自動で連鎖する）。

### 母集団の測り方
「原文に『デッキ』が一度も出てこないのに live に `DECK_CARD` が出る効果」で全数走査＝**4効果 / 4カード**
（CSV 総数 6712 を検算）。**うち3件を修正、1件は据置**。

🔴**据置＝`WX24-P2-054-E2`**（原文「対戦相手のシグニを**3体まで**対象とし、**それらのレベルの合計1につき**
《緑》を支払ってもよい。そうした場合、**それらをエナゾーンに置く**」）。
live は `ENERGY_CHARGE{DECK_CARD}`＝**自分のデッキからエナチャージする別の動作**。
帰結の型（`SEND_TO_ENERGY`）も、対象レベル依存コスト（`costColorsPerTargetLevel`）も別軸なので分けた。
**負方向テストを golden に置いた**（直したら赤くなる）。

### 検証コマンドと結果
- `npm run gates` 全緑＝**golden 3176 → 3177・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `ae777cc69` との effectId 単位 機械 diff で **変更3件・追加0・削除0・予定外0**。
- 3帳票（`build:effects`→`heldReview` を報告直前に再実行した実測値）＝`_held_fresh` **76**／`_partial_fresh` **10**／`_idset_fresh` **7**（いずれも据置）。
- 🔴**反転確認（§5-29）**＝規則のマッチを無効化すると `WXDi-P01-070-E1` の **fresh assert が FAIL**。
  golden には live 側と fresh 側の**両方**の assert を入れてある。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` ・ `scripts/` ・ `public/data/` ・ `docs/` のみ。
`src/screens/` も `src/engine/` も `src/types/` も触らず、新しい型・機構も足していない。

### 🔴この巡でいちばん価値があったのは「やらなかった判断」

**当初バッチ4は「`O-96` の did-it ゲートでない18件」＝任意コスト直後が `CONDITIONAL{IS_MY_TURN}` の群にする予定だった。**
署名で数えると **434効果**（AUTO 414 / MANUAL 20）あり、うち **99件が相手ターン側**（`ON_LIFE_BURST` 等）で、
PLAN §1 の「相手ターンに解決する効果では `IS_MY_TURN` の残留が致命的＝効果が丸ごと発火しない」という
記録と合わせると**大物に見えた**。

🔴**engine の消費地点を読んだら実害ではなかった**（CODEX_GUIDE §5-3-3′ の罠を踏む寸前だった）：
- `execUtils.ts:2706`＝`case 'IS_MY_TURN': return true;`（executor はオーナー視点なので**常に真のプレースホルダ**）。
- `effectExecutor.ts:4899`＝**任意コスト STUB の直後の `CONDITIONAL` は
  `['IS_MY_TURN','PAID_ADDITIONAL_COST']` を同一に扱う**（同じ形が `:4742` `:5438` にもある）。
- `triggerCollect.ts:1262` のターン判定は **`eff.condition`（効果レベル）だけ**を見ており、
  アクション内側の `CONDITIONAL` は見ない。

⇒ **この434件は「慣例エンコード」であって、大半は実害ゼロ。**
PLAN §1 が「致命的」と書いた2件（`WX15-053-TRAP` / `WXDi-P05-073-BURST`）は
**この interception が効かない位置**にあった個別事情だった、と読み替えるべき。
🔑**教訓＝「署名の件数」は実害の件数ではない。executor の分岐を読むまで着手しない。**
（同じ罠の前例＝続き603＝998効果と記録されていたが実害は29。）


## 2026-09-01：PLAN §5.3 `O-188` 第2バッチ — 暫定ガードを外して18効果 ＋ 自己回収の語順漏れ（過剰実行）

Codex が利用上限（`try again at 1:55 PM`）で使えなかったため **Claude が指示書どおり実装**した。

### 群A＝`O-96` の対象固定を塞いでいた2つの暫定ガードを外した（12効果）

`applyO96OptionalCostTargetFirst`（`src/data/effectParser.ts`）に、第1バッチで置いた
**「一度に載せすぎないための暫定ガード」が2つ**あった。

1. `outcome.source.filter?.hasGuard || noGuard` ＝**ガード軸だけ**に絞る。**意味的な根拠は無い**。
2. `allowedCostKeys` ＝ **`costColors` 単独 か `handDiscard` 単独のどちらか一方だけ**という排他 XOR。
   🔴**これが一番効いていた**＝`O-190` 第1バッチで `OPTIONAL_COST` の payload に
   `fieldTrash` / `selfTrash` / `handReveal` / `underAnySigniTrash` が入るようになった結果、
   **複合任意コストの効果が全部この XOR で弾かれていた**。

⇒ ①を撤去し、②を**許可リスト方式**へ広げた（`costColors` / `handDiscard` / `handReveal` /
`fieldTrash` / `fieldDown` / `selfTrash` / `energyTrash` / `underAnySigniTrash` / `charmTrash`）。
🔴**fail-closed は維持**＝**知らないキーが1つでも混ざれば通さない**。
⚠**対象のレベルで額が決まる系（`costColorsPerTargetLevel` 等）は許可リストに入れていない**＝倍率の意味が変わるので別軸。

**採用12効果**（全件 `heldReview --adopt` 経由・**1件ずつ原文照合済み**）＝
`WXDi-P04-022-E2` / `WXDi-P04-041-E1` / `WXDi-P04-041-E2` / `WXDi-P13-044-E1` / `WXDi-P14-041-E2` /
`WX24-P1-079-E1` / `WX24-P2-063-E1` / `WX24-P4-059-E1` / `WXK05-022-E1` / `WXK08-052-E1` /
`WDK11-011-E1` / `SPK01-12-E1`。

🔑**見積もりの訂正**＝投入前は「`TRANSFER_TO_HAND` の6効果」と見ていたが、**実際は12効果**だった。
②の XOR を外すと **`BANISH` / `BOUNCE` / `TRASH` / `POWER_MODIFY` 側の複合コスト効果も一緒に直る**
（`WDK11-011-E1`＝`fieldTrash` 単独コスト、`WXK08-052-E1`＝`underAnySigniTrash` 単独コストなど）。
⚠**予定外の5枚は「別の効果へ漏れた」のではなく「同じ欠陥の未計測分」**＝
兄弟効果への波及が無いことを **effectId 単位の per-effect diff で確認済み**（変化したのは意図した効果だけ）。

### 群B＝「**このカードを**トラッシュから手札に加える」の語順が丸ごと漏れていた（6効果）

🔴**実害＝過剰実行**。原文は**効果元自身の回収**なのに、live は `TRANSFER_TO_HAND{TRASH_CARD, filter:{}}`
＝**トラッシュのどのカードでも1枚回収できる**状態だった。

**受け皿も規則も既にあった**（`filter.thisCardOnly`／`execTransferToHand` の `TRASH_CARD` 分岐が消費）。
**漏れていたのは語順だけ**＝既存規則は「あなたのトラッシュから**このカードを**手札に加える」しか読まず、
「**このカードを**トラッシュから手札に加える」を落としていた。指示語も3通り（カード／シグニ／スペル）ある。

**修正6効果**＝`WXDi-P03-081-E1` / `WXDi-P08-075-E1` / `WXK01-041-E2` / `WXK10-030-E2` /
`WX24-P3-093-E2` / `WX16-028-E3`。
⚠**`WX16-028-E3` は Claude の母集団 regex が取りこぼしていた**（「このカードを**あなたの**トラッシュから」＝
指示語とゾーンの間に「あなたの」が入る形）。**実装の regex のほうが広かったので拾えた**＝
🔑**母集団の見積もりが実装より狭いことがある**という実例。

🔴**据置1件＝`WXDi-P09-043-E2`**（原文「この**シグニ**を…」）。**上流の別規則が先に食って**
`filter:{cardType:'シグニ'}` へ落ちるため、**トラッシュのどの＜シグニ＞でも回収できる過剰実行が残る**。
**負方向テストを golden に置いた**（直したら赤くなる）＝「直っている」と誤解しないため。

### 検証コマンドと結果
- `npm run gates` 全緑＝**golden 3174 → 3176・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `21efff5cb` との effectId 単位 機械 diff で **変更18件・追加0・削除0**。
  内訳＝群A 12 ＋ 群B 6。**予定外0**（`WX16-028-E3` は上記のとおり母集団側の取りこぼしで、実装は正しい）。
- 3帳票＝`_held_fresh` 78 → **76**／`_partial_fresh` 10 → 10／`_idset_fresh` 7 → 7。
- 🔴**反転確認（§5-29）を2本とも取った**＝
  ①群Bの regex を旧語順へ戻すと `WXDi-P03-081-E1` の **fresh assert が FAIL**。
  ②群Aの `hasGuard/noGuard` ガードを戻すと `SPK01-12-E1` の **fresh assert が FAIL**。
- **既存 golden 3本を書き換えた**（§5-17′＝元の意図を確認してから）＝
  `§6.4 O-26` は**位置（steps[0]）で `OPTIONAL_COST` を取っていた**ので **id で引く形へ直した**
  （assert の意図は「位置」ではなく「エナと自己トラッシュが1つの任意コストに束ねられていること」）。
  据置契約2本は**削除せず、いま何を据置しているかへ書き換えた**（`CHOOSE` のネスト器と専用 STUB id）。

**⚠実機は不要と判定**（§2.2）＝触ったのは `src/data/` ・ `scripts/` ・ `public/data/` ・ `docs/` のみ。
`src/screens/` も `src/engine/` も `src/types/` も触らず、新しい型・機構も足していない。
今回広げた経路（`SELECT_TARGET_ONLY{TRASH_CARD}`）は**同日の `O-188` 第1バッチで実機 PASS 済み**。

### 新しく見つけた原文との食い違い（このバッチでは直さない＝§5.3 へ登録する）
1. `WXDi-P01-070-E1` — 原文「あなたの**エナゾーンから**＜武勇＞のシグニ1枚」なのに `source` が `DECK_CARD`。
2. `WXDi-P05-059-E2` — 原文「あなたの**トラッシュから**赤のスペル1枚」なのに `source` が `DECK_CARD`。
3. `SPK01-12-E1` — 原文「**このターンに手札から捨てた**＜水獣＞のシグニ」の限定が filter に無い＝**過剰実行**。
4. `WXK02-028-E1` — 原文「**あなたのセンタールリグと同じレベルの**シグニ」の限定が filter に無い＝**過剰実行**。
5. `WX24-P4-051-E2` — コスト「エナゾーンから**それと同じレベルの**シグニ1枚」の動的レベルが表せていない。
6. `WXDi-P04-022-E1` — 原文「トラッシュから**赤と黒の**シグニを**それぞれ1枚まで**」なのに live は**黒1枚だけ**
   （`transferGroups` を使えば表せる形）。
7. `WXDi-P09-043-E2` — 群Bの据置（上記）。
📌**`WXDi-P04-041-E1` と `-E2` の色フィルタ差は正しかった**（原文が別の【自】で、E2 側だけ「黒の」と書いてある）。
投入前に「疑義」として挙げていたが、原文照合で解消した。


## 2026-09-01：PLAN §5.3 `O-188` 第1バッチ — `SELECT_TARGET_ONLY` をトラッシュへ広げ、`TRANSFER_TO_HAND` を対象固定に対応

**真因**＝「あなたのトラッシュから〈X〉1枚を**対象とし**、《色》を支払ってもよい。**そうした場合、それを**手札に加える」
という原文に対し、live は**対象宣言を持たず、支払いのあとで対象を選んでいた**。
⇒ 🔴**コストを払ってから別のトラッシュ札を選び直せた**＝原文の「それ」が別のカードになる**過剰実行**。

⚠**この形は engine 側に4つの穴があり、どれか1つでも残すと「フィールドは付いたが無視される＝無言 no-op」になる。**
`O-96` 第1バッチ（続き763）で「3箇所」と記録していたが、実測すると**4箇所目が本体**だった。

| # | 穴 | 直した場所 |
|---|---|---|
| ① | `TransferToHandAction` に `targetsStored` / `fixedCardNums` が無い | `src/types/effects.ts`（`interface TransferToHandAction`） |
| ② | `execTransferToHand` に保存対象での絞り込みが無い | `src/engine/effectExecutor.ts`（`TRASH_CARD` 分岐） |
| ③ | `freezeStoredTargets` の `FREEZABLE` に `TRANSFER_TO_HAND` が無い | 同上（配列に1語追加） |
| ④ 🔴 | **`SELECT_TARGET_ONLY` が `SIGNI`/`LRIG`/`CENTER_LRIG_OR_SIGNI` 以外を `lastProcessedCards: []` で黙って落とす** | `src/engine/execStubPart1.ts`（`TRASH_CARD`/`owner:'self'` 分岐を追加） |

🔑**④の設計上の要点＝候補集めを `execTransferToHand` と同一の関数に切り出して共有した**
（`transferToHandTrashCandidates` を `effectExecutor.ts` に置き、`execStub` 経由で `execStubPart1` へ注入）。
**宣言時と実行時で候補がズレると「選んだのに動かない」**という、この機構特有の事故を構造的に防ぐため。
⚠**相手トラッシュ（`owner:'opponent'`）は今回入れていない**＝母集団に無いので fail-closed のまま。
⚠**`transferGroups` との併用は非対応**＝1対1対応が付かないので、**黙って束縛を捨てず**ログに残して降りる。

**影響枚数**＝**3効果**（`WXDi-P02-035-E2` / `WXDi-P05-042-E2` / `WX24-P4-044-E3`）。
parser 側は `O96_STORABLE_OUTCOMES` に `TRANSFER_TO_HAND` を足し、**第1バッチは `hasGuard`/`noGuard` 軸だけ**に絞った。
⚠**この絞り込みに意味的な根拠は無い**（一度に20効果を載せないための暫定ガード）＝**第2バッチで外す**。
母集団は「`O-96` 未固定署名のうち帰結に `TRANSFER_TO_HAND` を含むもの＝23効果、うち20効果が `TRASH_CARD`/`owner:self`」。

**検証コマンドと結果**
- `npm run gates` 全緑＝**golden 3168 → 3174（+6本）・FAIL 0**／smoke 全0／fuzz 全0／census 高シグナル **11**／
  census:stubs A0 C0／manual-fields 0／census:enginetext A🔴130行 据置／lint **0 errors / 249 warnings**（増減0）。
- **ブラスト半径**＝ベースライン `223db3b0d` との effectId 単位 機械 diff で**変更3件・追加0・削除0・予定外0**。
- golden の内訳＝①支払えば宣言した1枚だけが動く ②辞退すれば動かない ③払えない盤面では pay 不能
  ④**候補0なら任意コストを提示せず降りる**（④の無言 no-op 再発防止）
  ⑤🔴**`targetsStored` 省略時は従来どおり全候補**（省略をスキップに倒すと既存23効果が全滅する）
  ⑥fresh パース assert（§5-29）。

**🔴実機検証（§2.2＝`src/engine/` と `src/types/` を触り、新機構を足したので必須）**
`scripts/verifyBattleDrive.mjs` に `o188TrashRecoverPay` / `o188TrashRecoverSkip` を追加（`WX24-P4-044-E3`）。
- **PASS**＝宣言した `WD01-016#901` だけが手札へ／もう1枚のガード持ちはトラッシュに残留／
  非ガードは候補外／エナ 2→0／選択モーダルに「トラッシュから」が出る。
- **対照 PASS**＝辞退すれば手札・トラッシュ・エナが1つも動かない。
- 🔴**反転確認**＝`execTransferToHand` の絞り込み2行を外して再実行すると、
  **支払い直後の候補が `["WD01-016#901","WD01-017#902"]` の2枚に戻り FAIL**（＝旧挙動＝選び直せる）。
  戻したうえで `SKIP_BUILD=0` で再実行して ALL PASS を確認した。
- 🔑**この観測は golden では踏めない**＝`self_trash` スコープの選択モーダルが実 UI で開くかは BattleScreen 側の話。

**⚠この巡の運用上の実績＝Codex が2バッチ連続で利用上限に当たった。**
今回は **engine 実装と golden までを Codex が完成させた直後に exit 1**（`try again at 1:55 PM`）で、
**作業ツリーには途中変更が残っていた**（前回＝続き765 は clean だった）。⇒ **落ち方は2通りある**と記録する。
Claude が引き継いで ①コメント・テスト名の日本語化（Codex は英語で書く） ②実機シナリオ ③反転確認 ④簿記 を完了させた。


## 2026-09-01：PLAN §5.3 `O-190` 第1バッチ — 複合任意コストの消失した前半8効果を復元

原文が「〈別のコスト動作〉し《色》を支払ってもよい。そうした場合、～」なのに、live の
`STUB{OPTIONAL_COST}` が `costColors` しか持たず、原文より安いコストで本体を実行できた8効果を修正した。
CSV 12枚を BOM 除去・CardNum 先勝ちで読み、**カード総数6712**を検算したうえで、色支払い任意句493出現、
直前が別コスト動作のもの22出現／22カードを再現した。22件のうち既に正しい10件と受け皿のない4件は変更していない。

### 変更ファイルと理由

- `src/data/effectParser.ts` — 既存 `parseOptionalCostClauseFields` に限定文型を足し、最終 root の bare
  `OPTIONAL_COST{costColors}` だけへ前半payloadを合成した。表せない修飾が残れば `null` の原則は維持した。
- `scripts/goldenTest.ts` — 8効果の fresh/live、4受け皿の pay/skip/支払不能、4効果の did-it gate を固定した。
- `public/data/effects_WXDi.json` / `public/data/effects_WX24_26.json` — parser 出力を `build:effects` と
  `heldReview` で採用した。手編集ではない。
- `docs/decompile_sheet7.txt` / `docs/decompile_sheet8.txt` / `docs/decompile_sheet9.txt` /
  `docs/grouped_sentence_all.txt` — `npm run regen` による8効果の逆翻訳・下流帳票更新。
- `docs/_vocab_census.txt` — 修正済み効果が STUB/MANUAL 格納群から外れた結果を再生成した。
- `docs/_census_stubs.txt` — parser 行追加に伴う生成地点の行番号だけを再生成した。A群/C群の件数は不変。
- `docs/_held_fresh.json` / `docs/_held_review.txt` — fresh/live 収穫帳票を再生成し、4件のゲート差分を目視採用した。
- `docs/BUGFIXES.md` — 本報告。

### 既存受け皿と支払不能判定の実査

全キーは `resolveOptionalCostSpec`（`src/engine/execUtils.ts:388`、payload転送は407～410行）で
`OptionalCostSpec` に渡る。名前だけを借りず、候補数を判定する `canAffordOptionalCostSpec` と実際の支払い列を作る
`optionalCostPaySteps` の両方を確認した。

| effectId | 受け皿 | 支払不能を止める箇所 | 実支払い | 結論 |
|---|---|---|---|---|
| `WXDi-P16-050-E1` | `handDiscard` | `canAffordOptionalCostSpec`:467～471（手札をfilterし必要枚数を比較） | `optionalCostPaySteps`:623～628（`TRASH HAND_CARD`, `asCost:true`） | スペル0枚ならpay不可 |
| `WX24-P1-011-E1` | `handDiscard` | 同467～471 | 同623～628 | 手札0枚ならpay不可 |
| `WX25-P2-022-E1` | `handDiscard` | 同467～471 | 同623～628 | 手札0枚ならpay不可 |
| `WX25-CP1-041-E1` | `handDiscard` | 同467～471 | 同623～628 | ＜ブルアカ＞1枚以下ならpay不可 |
| `WX26-CP1-046-E1` | `handDiscard` | 同467～471 | 同623～628 | ＜プリオケ＞1枚以下ならpay不可 |
| `WXDi-P04-007-E1` | `fieldTrash` | 同527～534（場候補をfilterし必要数を比較） | 同668～676（`TRASH SIGNI`, `asCost:true`） | 白シグニ0体ならpay不可 |
| `WXDi-P06-055-E1` | `handReveal` | 同473～477（手札をfilterし必要枚数を比較） | 同629～635（`REVEAL HAND_CARD`） | ＜天使＞シグニ5枚以下ならpay不可 |
| `WXDi-P06-083-E1` | `underAnySigniTrash` | 同516～525。`fromThis:true` は source と同じ場の束だけを数える | 同660～667（`TAKE_FROM_UNDER_SIGNI`, `fromThis:true`） | このシグニの下2枚以下ならpay不可。他のシグニの下では代用不能 |

`TargetFilter.cardType:'スペル'` は既存型・`matchesFilter` の語彙であり、別キーの借用ではない。
`WXDi-P04-041-E1` が既に通って007が通らなかった理由は、既存 `parserUtils.tradeOptionalCost` が
「あなたの**他の**…シグニ」を直接 `fieldTrash{excludeSelf:true}` にする一方、007の
「あなたの**白の**シグニ」はそのregexに一致せず、従来は bare `costColors` 経路へ落ちたため。
`foldOptionalHandRevealCost` は「公開してもよい」という独立任意動作の木を折り畳む機構であるため、
今回の「公開し《色》を支払ってもよい」は複合句を一括解釈する `parseOptionalCostClauseFields` に⑥として足した。

### 採用8効果（effect単位）

以下の「逆翻訳」は `_decompile` の効果全体。JSON欄は生成された `OPTIONAL_COST` と、今回変更した場合は直後gateを示す。

1. `WXDi-P16-050-E1` — 原文コスト「手札からスペルを１枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":1,"filter":{"cardType":"スペル"}}}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：対戦相手のシグニ1体を対象とする。そして《青》を支払い手札からスペルを1枚捨ててもよい。そして（コストを支払った場合）なら、それをバニッシュする」。
   コスト・gate・本体は原文と一致（接続順の表示差のみ）。
2. `WX24-P1-011-E1` — 原文コスト「手札を１枚捨て《白》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"],"handDiscard":{"count":1}}`。
   逆翻訳全体「【自】このルリグがアタックしたとき：あなたの場に＜アーム＞のシグニがいるなら、《白》を支払い手札からカードを1枚捨ててもよい。そうした場合、あなたのルリグ1体をアップする。そしてあなたのシグニ1体は能力を失い、新たに得られない（ターン終了時まで）」。
   コストは一致。本体gateが別枝の `IS_MY_TURN` であるため `PAID_ADDITIONAL_COST` 化は据置。本体の対象種別にも既存不一致あり（後述）。
3. `WX25-P2-022-E1` — 原文コスト「手札を１枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":1}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのシグニがアタックしたとき：《once_per_turn》《青》を支払い手札からカードを1枚捨ててもよい。そして（コストを支払った場合）なら、あなたのシグニ1体に【アサシン:{\"isFrozen\":true}】を与える（ターン終了時まで）」。
   コストとdid-it gateは一致。対象の＜武勇＞filterには既存不一致あり（後述）。
4. `WX25-CP1-041-E1` — 原文コスト「手札から＜ブルアカ＞のカードを２枚捨て《青》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"],"handDiscard":{"count":2,"filter":{"story":"ブルアカ"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：《青》を支払い手札から＜ブルアカ＞のカードを2枚捨ててもよい。そして（コストを支払った場合）なら、対戦相手のシグニ1体をデッキの一番下に置く」。
   コストとdid-it gateは一致。対象選択時点には既存不一致あり（後述）。
5. `WX26-CP1-046-E1` — 原文コスト「手札から＜プリオケ＞のカードを２枚捨て《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["無"],"handDiscard":{"count":2,"filter":{"story":"プリオケ"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのルリグがアタックしたとき：〔範囲:any_ally〕《once_per_turn》《無》を支払い手札から＜プリオケ＞のカードを2枚捨ててもよい。そして（コストを支払った場合）なら、あなたのルリグ1体をアップする。そしてあなたのルリグ1体は能力を失い、新たに得られない（ターン終了時まで）」。
   コストとdid-it gateは一致。トリガー個体の照応には既存不一致あり（後述）。
6. `WXDi-P04-007-E1` — 原文コスト「あなたの白のシグニ１体を場からトラッシュに置き《白》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"],"fieldTrash":{"count":1,"filter":{"cardType":"シグニ","color":"白"}}}`。
   逆翻訳全体「【自】あなたのメインフェイズ開始時：対戦相手のシグニ1体を対象とする。そして《白》を支払ってもよい。そして（コストを支払った場合）なら、対戦相手のシグニ1体を手札に戻す」。
   live JSON・実行は原文と一致。逆翻訳器が `fieldTrash` を表示しないため、逆翻訳文だけは不一致。
7. `WXDi-P06-055-E1` — 原文コスト「あなたの手札から＜天使＞のシグニを６枚公開し《赤》《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","無"],"handReveal":{"count":6,"filter":{"cardType":"シグニ","story":"天使"}}} → CONDITIONAL{PAID_ADDITIONAL_COST}`。
   逆翻訳全体「【自】あなたのアタックフェイズ開始時：対戦相手のパワー12000以下のシグニ1体を対象とする。そして《赤》《無》を支払い、手札から＜天使＞のシグニを6枚公開してもよい。そして（コストを支払った場合）なら、それをバニッシュする」。
   語順表示差だけでコスト・gate・本体は原文と一致。
8. `WXDi-P06-083-E1` — 原文コスト「このシグニの下からカード３枚をトラッシュに置き《黒》《無》を支払ってもよい」。生成JSON:
   `{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒","無"],"underAnySigniTrash":{"count":3,"fromThis":true}}`。
   逆翻訳全体「【自】このシグニがアタックしたとき：対戦相手のシグニ1体を対象とする。そしてこのシグニの下からカードを3枚トラッシュに置いてもよい。そして（コストを支払った場合）なら、それのパワーを－8000する」。
   live JSON・実行は原文と一致。逆翻訳器が同payloadと `costColors` を併記しないため、逆翻訳文だけは色支払いが欠落。

### 据置

- `WX15-053-TRAP` — 【トラップ】は `OptionalCostSpec` の対象外。据置。次に取るなら
  `fieldTrapTrash:{count,excludeSource}` のような専用キーを新設し、`canAffordOptionalCostSpec` で
  `field.signi_traps` を数え、`optionalCostPaySteps` から選んだtrapをtrashへ移す支払いaction/UIへ接続する必要がある。
- `WX22-018-E2` — いずれかのtrashから「コスト合計0のスペル」を除外する受け皿がなく、owner横断filterも必要。据置。
  次に取るなら `trashExile:{count,owner:'any',filter:{cardType:'スペル',costSum:0}}` 相当を新設し、
  `canAffordOptionalCostSpec` で両trashを走査、`optionalCostPaySteps` で選択付き `EXILE` を消費する。
- `WXK06-029-E1` — デッキ探索中にsource自身を公開する継続効果で、通常の任意コストではない。据置。
  `deckSearchRevealSelf` 相当の専用状態を設け、deck search の候補提示／resume地点で公開→色支払い→手札移動を消費する必要がある。
- `WXDi-P11-049-E1` — 自trashの＜毒牙＞シグニ3枚を除外する受け皿がないため据置。次に取るなら
  `trashExile:{count:3,owner:'self',filter:{cardType:'シグニ',story:'毒牙'}}` 相当を設け、
  `canAffordOptionalCostSpec` の自trash候補数判定と `optionalCostPaySteps` の選択付き `EXILE` に接続する。
- `WX24-P1-011-E1` のpayloadは採用したが、`OPTIONAL_COST` が `HAS_CARD_IN_FIELD` の内側、結果本体が
  別の `IS_MY_TURN` 枝にあるため、この1件のgate変更は据置。root直列形へ一般化して他効果を壊すより、別バッチで木を組み直す。

既に正しい10効果（`WXDi-D08-004-E1`, `WXDi-P03-035-E1`, `WXDi-P04-041-E1`,
`WXDi-P04-051-E1`, `WXDi-P12-044-E2`, `WXDi-P13-044-E1`, `WX24-P2-063-E1`,
`WX24-P2-086-E1`, `WX24-P4-059-E1`, `WX25-P3-019-E1`）は変更0。

### コスト条件以外で見つけた原文差

本バッチでは直していない。

- `WX24-P1-011-E1` — 原文は「このルリグ」が能力を失うが、live は `REMOVE_ABILITIES` の対象が自シグニ。
- `WX25-P2-022-E1` — 原文の結果対象は自分の＜武勇＞シグニだが、live の結果targetに `story:'武勇'` がない。
- `WX25-CP1-041-E1` — 原文は相手シグニをコスト提示前に対象とするが、live は支払い後に対象を選ぶ。
- `WX26-CP1-046-E1` — 原文の「そのルリグ」はアタックした個体だが、live は任意の自ルリグ1体を選べる。

また、前掲のとおり逆翻訳器には `fieldTrash` 非表示と
`underAnySigniTrash`＋`costColors` 併記漏れがある。いずれも今回生成したliveの実行意味とは別の表示欠落。

### 検証・ブラスト半径・帳票

- `npm run gates`: 全緑。typecheck PASS、golden **3168/3168・FAIL 0**（ベースライン3164から+4）、
  smoke **10721/10721・CRASH/HANG/INVARIANT 0**、fuzz **CRASH/HANG/INVARIANT/EXPLOSION 0**、
  census高シグナル **11**（投入前実数11、`BASELINE_HIGH` 12以下）、census:stubs **A群0/C群0**、
  manual-fields **0 effects / parseStatus違反0**、census:enginetext **A 130行/127ハンドラ**、
  lint **0 errors/249 warnings**（warning増減0）。
- ベースライン `7ba5cdcd0` の5 effects JSONとeffectId単位で比較。変更は
  `WX24-P1-011-E1`, `WX25-CP1-041-E1`, `WX25-P2-022-E1`, `WX26-CP1-046-E1`,
  `WXDi-P04-007-E1`, `WXDi-P06-055-E1`, `WXDi-P06-083-E1`, `WXDi-P16-050-E1` の**8件のみ**。
  期待漏れ0、予定外0。
- `_held_fresh.json`: 76→75カード、追加0・変更0、削除は stale な `WXK03-070` 1件。
  `_partial_fresh.json`: 9→9、追加/削除/変更0。`_idset_fresh.json`: 7→7、追加/削除/変更0。
  `_held_review.txt` は今回の4 gate差分を採用後に空になった。
- §5-19文字検査：変更した全13 tracked fileで、ベースライン比 `U+FFFD`・3文字以上連続の`?`・
  先頭BOMはいずれも **新規増0**。
- §5-29反転確認：`applyCompositeOptionalCostFields` の最終呼び出しを一時的に外し
  `npm run golden -- --only "O-190 第1バッチ"` を実行すると **4本中3本 FAIL**。
  fresh payload、fresh did-it gate、runtime支払不能の3本が赤くなった。呼び出し復帰後は4/4 PASS。

### やらなかったこと

- `src/engine/`, `src/types/`, `src/screens/`, `manualEffects.ts` は変更していない。新しい
  `EffectAction`、`StubAction`キー、STUB id、engine分岐、支払いUIを作っていない。
- 正解10効果、受け皿のない4効果、上記4件の別軸原文差へ変更を波及させていない。
- `effects_*.json` の手編集、`buildEffectsJson.ts` のforce-adopt、`stage2_closed.txt` 更新をしていない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` を編集していない。commit / push もしていない。
- ブラウザ実機確認はしていない。既存機構だけを使うdata/parser変更のため、fresh/runtime両方向goldenと
  smoke/fuzzを権威ある検証とした。

## 2026-09-01：意味照合 段2（支払いUI バッチ1）— `cost.energyTrashGroups` の支払いを2経路に通した

ユーザー決定で「支払いUI を実装する」方針に切り替えた最初のバッチ。残 OPEN **45 → 44**。

🔴**真因＝型はもとから在ったが、消費が `screens/battle/resonaSummon.ts`（レゾナ召喚）1箇所だけだった。**
そのため `WXK03-070-E1`（幻怪　モモタロ）の【出】「エナゾーンから《モモイヌ》1枚と《モモザル》1枚と
《モモキジ》1枚をトラッシュに置く：対象の相手シグニ1体をエナゾーンへ、対象の相手シグニ1体を手札へ」は
`costUnparsed:true` のままで、**発動コストが完全に無料**だった（エナを1枚も払わずに相手シグニ2体を触れた）。

🔑**支払い経路は2つあり、片方だけでは片肺になる**＝
①**通常召喚** … `SigniOnPlayCostModal`。`costs.ts` に `energyTrashGroupsSatisfied` /
  `canAddEnergyTrashGroupIndex` / `energyTrashGroupsAffordable` を新設して可否判定と選択ガードに配線した。
  ⚠**先着順の貪欲割り当てでは足りない**（フィルタが重なると厳しいグループが埋まらず「払えるのに払えない」になる）ので
  **総当たりの割り当て**にした。
②**効果で場に出た** … `optionalOnPlayCostStub` → `optionalCostPaySteps`。
  `StubAction` / `OptionalCostSpec` にキーを足し、**グループごとに1 TRASH ステップへ分解**して払う
  （1本の TRASH に潰すと「各1枚ずつ」が消えて**同名3枚でも払えてしまう**）。
  `canAffordOptionalCostSpec` にもグループ単位の可否を足した（合計枚数だけでは同名3枚を通す）。

🔑**golden の「明示保留リスト」から1件外した。** `(xxix)(2) 第15波後の明示保留4効果` は
**「既存語彙が不完全だから載せない」**という契約で、**「永久に据え置く」ではない**。
語彙を完成させたので `WXK03-070-E1` を外し、連動する計数（任意costあり 961→962／
任意costなし 21→20／据え置き 4→3）と、golden 側にコピーされている `SUPPORTED` 集合も同期した。
⚠**`SUPPORTED` は engine（`triggerCollect.ts`）と golden の2箇所にある**＝片方だけ足すと
「写せるかどうかが対応キー集合と一致」で落ちる（今回それで検出できた）。

影響枚数＝1効果 / 1カード。
🔴**実機必須**（`src/screens/` と `src/types/`・`src/engine/` を触った＝§2.2）。**未実施なので `V-105` を登録した。**
反転確認＝未実施。検証＝gates 全緑（**golden 3162 → 3164**・0 FAIL / smoke・fuzz 全0 / census 11 /
census-stubs A0・C0 / manual-fields 0 / census-enginetext A 130行 据置 / lint 0 errors・249 warnings）。


## 2026-09-01：PLAN §5.3 `O-96` 第3バッチ — 規則を「語尾の列挙」から「順序＋構造ガード」へ切り替え（11効果）

🔴**このバッチは Codex が `.codex-work` の利用上限に達して exit 1 で落ちたため、Claude が引き継いで実装した**
（ログ末尾＝`You've hit your usage limit ... try again at 8:43 AM`。**作業ツリーは clean・HEAD 不変で中途半端な変更は残っていなかった**）。

第1・第2バッチの原文 regex は**語尾を列挙**していた（`それを手札に戻す` ／ `バニッシュする` …）。
これが頭打ちになったことを実測で確認した＝**エナ側の語尾を `handDiscard` 側と同じだけ広げても新規は1効果だけ**
（該当5件のうち4件が `parseStatus:MANUAL`＝収穫マージ不可侵で parser では届かない）。
⇒ **原文 regex を `/を対象とし[、,][^。]*?てもよい。そうした場合[、,]/` の1本（順序だけ）に置き換え、
範囲は構造ガードで担保する方式へ切り替えた**（`applyO96OptionalCostTargetFirst`）。
構造ガード＝①root `SEQUENCE` ②`hasStoredTargetBinding` で二重適用を防ぐ
③コスト payload が `costColors` だけ／`handDiscard` だけ ④直後が did-it ゲート
⑤帰結が `O96_STORABLE_OUTCOMES`（`BOUNCE`/`POWER_MODIFY`/`BANISH`/`TRASH`/`TRANSFER_TO_DECK`/`SEND_TO_ENERGY`/`EXILE`）
かつ `target.type==='SIGNI'`。**この7型は型に `targetsStored` があり `freezeStoredTargets` の `FREEZABLE` にも入っている**
（どちらかが欠けると「フィールドは付いたが engine が無視する」＝無言 no-op になる）。

採用11効果＝`WX07-039-E1` / `WX15-053-TRAP` / `WXK08-070-E1` / `WXDi-P16-050-E1` / `WXK06-074-E1` /
`WDA-F02-17-E3` / `WXDi-P06-083-E1` / `WXDi-P11-049-E1` / `PR-K021-E3` / `WXDi-P04-007-E1` / `WXDi-P05-073-BURST`。
**`SEND_TO_ENERGY` は第3バッチで初めて対象に入った帰結型。**
影響枚数＝11効果 / 11カード（`O-96` の欠陥署名 **133 → 122**）。

🔴**採用前に11件すべての原文を読み、`IS_MY_TURN` → `PAID_ADDITIONAL_COST` の置換が正しいことを確認した**＝
「自分のターンなら」に相当する条件は1件も無く、すべて did-it ゲートの誤パースだった。
**特に `WX15-053-TRAP`（【トラップ】）と `WXDi-P05-073-BURST`（【ライフバースト】）は相手ターンに解決する**ので、
`IS_MY_TURN` が残ると**支払いゲートが永久に成立せず効果が丸ごと発火しない**。この2件は golden で明示的に固定した。
前置条件が**効果レベルの `condition`** にあるもの（`WXK08-070`＝`BEAT_CONDITION` / `PR-K021`＝`SELF_POWER_GTE`）も
落としていないことを golden で固定した。

反転確認＝未実施（実機不要判定のため）。代わりに**ブラスト半径をベースライン commit（`eedcb3ab5`）との
effectId 単位 機械 diff で検算**＝**変わったのは予定の11件のみ・予定外0**。
`build:effects` 2回の再実行で live JSON がビット同一に再生成されることも確認。

🔑**教訓＝「原文の語尾を列挙する」規則は必ず頭打ちになる。**
語尾や対象句の言い回しは無限に変奏されるが、**欠陥そのものは構造（対象固定の有無）で定義できる**。
⇒ **原文 regex は「順序の確認」だけに使い、範囲は live の構造ガードで縛るほうが、広くて安全。**
⚠**ただしこれは「ブラスト半径を毎回機械で検算する」運用とセット**でしか成立しない。

⚠🔴**採用の過程で、今回とは別軸の既存欠陥を3種類見つけた（いずれもベースラインから存在・未修正）**：
1. **複合任意コストの前半が丸ごと消えている**（→ `O-190`）＝原文「〈他のコスト〉し、《色》を支払ってもよい」の
   前半が live に無い。実例＝`WX15-053-TRAP`（他の【トラップ】1枚をトラッシュ）／`WXDi-P04-007-E1`（白のシグニ1体を場からトラッシュ）／
   `WXDi-P06-083-E1`（下からカード3枚をトラッシュ）／`WXDi-P11-049-E1`（トラッシュの＜毒牙＞3枚を除外）／
   `WXDi-P16-050-E1`（手札からスペル1枚を捨て）。**任意コストが原文より安い＝過剰実行側。**
2. **前置条件そのものが消えている**＝`WXK06-074-E1`（原文「このターンに対戦相手のカードがあなたの効果によって
   デッキに移動していた場合」が live に無い）。
3. **対象オーナーの誤パース**＝`PR-K021-E3`（原文「シグニ1体を対象とし」＝無修飾なのに `owner:'self'`）。


影響枚数＝21効果 / 21カード（`O-96` の欠陥署名 154 → 133）。
反転確認＝未実施。代わりに**ブラスト半径をベースライン commit（`2f2291b53`）との effectId 単位 機械 diff で検算**＝
**変わったのは予定の21件のみ・予定外0・群B 変更0**（Claude 側でも独立に再実行して一致を確認）。
`IS_MY_TURN` → `PAID_ADDITIONAL_COST` の置換は**21件すべて原文照合済み**（Claude 側でも5件を抜き取り再確認）＝
いずれも「トリガー＋対象とし＋任意コスト＋そうした場合＋帰結」で、**原文に「自分のターンなら」に相当する条件は無い**。
🔑🔴**教訓＝parser 規則の「適用地点」で対象範囲が変わる。**
当初 `parseActionText` の中で適用したところ、**`CHOOSE` 組み立て前の枝が一時的に root `SEQUENCE` に見えて群B へ当たった**。
⇒ **効果単位の最終 root へ適用地点を移して解決**。**この誤りは fresh 三帳票で検出した**＝
**ブラスト半径の検算はゲートでは代替できない**（ゲートは全部緑のままだった）。
⚠**別軸の残差を2件記録**＝`WXK10-029-E1`（原文「手札から**黒の**シグニを1枚捨てて」）と
`WXK10-040-E2`（同「**赤の**シグニ」）は、**旧 live の時点で `handDiscard.filter` から色指定が脱落している**
＝任意コストが原文より緩い（過剰実行側）。今回の対象固定とは別軸なので未修正（→ `O-189`）。

## 2026-09-01：PLAN §5.3 `O-96` 第2バッチ — 手札を捨てる任意コスト前に対象を固定（21効果）

原文が「相手シグニを対象とし、手札から条件付きカードをN枚捨ててもよい。そうした場合、それを…」の順なのに、live は `OPTIONAL_COST{handDiscard} → CONDITIONAL{IS_MY_TURN} → 帰結` となり、対象候補0でも支払いを提示し、支払い後に対象を選び直していた。第1バッチの parser 規則を一般化し、root `SEQUENCE` の21効果を `SELECT_TARGET_ONLY{abortIfNoCandidate:true} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST{handDiscard} → CONDITIONAL{PAID_ADDITIONAL_COST} → 帰結{targetsStored:true}` へ変更した。帰結は `POWER_MODIFY` 13／`BANISH` 4／`BOUNCE` 2／`TRASH` 2。`handDiscard` の `count`／`filter`／`selectionConstraint` は元オブジェクトをそのまま運び、`POWER_MODIFY` の delta と期間も維持した。

採用＝`WXK01-052-E1` / `WDK10-014-E1` / `WXDi-P03-084-BURST` / `WXDi-P05-082-BURST` / `WXDi-P06-084-BURST` / `WXDi-P07-093-BURST` / `WXDi-P08-047-E1` / `WXDi-P08-075-BURST` / `WXDi-P10-074-BURST` / `WXDi-P11-081-BURST` / `WXDi-P12-085-BURST` / `WXDi-CP01-049-BURST` / `WXDi-CP02-099-BURST` / `WXK10-029-E1` / `WXK10-040-E2` / `WD23-033-A-TRAP` / `WXDi-P04-038-BURST` / `WXEX1-43-E2` / `WXDi-P00-033-E1` / `WXK11-017-E2` / `PR-370-E1`。`IS_MY_TURN` は21件すべて原文のターン条件ではなく「そうした場合」の誤フォールバックだったことを効果単位原文で確認した。

据置＝`WXDi-D09-P17-BURST` / `WX25-CP1-004-E1` / `WXDi-P13-045-E1`（CHOOSE 枝内のネスト器）。当初 `parseActionText` 内で後段適用すると、CHOOSE 組み立て前の各枝も一時的に root `SEQUENCE` に見えて群Bへ当たることを fresh diff が検出した。規則を**効果単位の最終 root**でだけ適用する位置へ移し、三帳票と golden で3件不変を固定した。`TRANSFER_TO_HAND` / `O-188`、エナ軸の追加、engine/types/screens は未変更。

検証＝ベースライン `2f2291b53` と現行 live を effectId 単位・オブジェクトキー順正規化で比較し、論理差分は上記21件のみ（予定外0・群B0）。`npm run regen` で対象宣言→手札捨て→帰結の順と同型★0を目視。`build:effects` 連続2回後の全5 effects JSON は SHA-256 一致。`npm run gates` 全緑（typecheck、golden **3157/3157**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、census 11、census-stubs A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings）。ネットワーク遮断の指示に従い実機確認は未実施。

影響枚数＝21効果 / 21カード（`O-96` 欠陥署名 **154 → 133**）。次の最大下位形は `TRANSFER_TO_HAND` 11効果（`O-188` のゾーン選択機構待ち）、次いでネスト器6効果。反転確認は「候補0で旧木だけが手札コスト CHOOSE を提示する」golden 対照で実施した。

## 2026-09-01：PLAN §5.3 `O-96` 第1バッチ — 任意エナ支払い前に BOUNCE 対象を固定

原文が「対戦相手のシグニを対象とし、《色…》を支払ってもよい。そうした場合、それを手札に戻す」の順なのに、live が `OPTIONAL_COST → CONDITIONAL → BOUNCE` となり、対象候補0でも支払いを提示し、解決時に対象を選び直していた。`effectParser.ts` にこの下位形だけの規則を追加し、root `SEQUENCE` の直接 BOUNCE 7効果を `SELECT_TARGET_ONLY{abortIfNoCandidate:true} → STORE_LAST_PROCESSED_TARGETS → OPTIONAL_COST → PAID_ADDITIONAL_COST → BOUNCE{targetsStored:true}` へ変更した。前置条件付き3効果と公開条件付き1効果は、その条件の内側へ4段をまとめて条件不成立時の挙動を維持した。採用は `WX20-054-E1` / `WXDi-P02-048-BURST` / `WXDi-P08-052-E1` / `WXDi-P14-052-E1` / `WX24-P3-047-E2` / `WX25-P3-055-E3` / `WX25-CP1-055-E1` の7件。build 前後の全 live effectId 差分はこの7件だけで、予定外0・群B変更0。

`TRANSFER_TO_HAND` は `targetsStored` の型定義・executor 対応・任意選択中の保存対象凍結が無いため、群Aの11効果（MANUAL `WXDi-P15-057-E2` を含む）はガードレールどおり据置。群B 6効果も CHOOSE / GRANT 内の別器なので据置。golden を3本追加し、代表3効果の JSON 順序、前置条件維持、候補0なら任意コストを提示しない実行挙動、TRANSFER 据置契約を固定した。`WXDi-P04-041-E1/E2` は同一カード内の別々の【自】能力で重複ではない。`WXDi-P05-059-E1` の TRASH は第1能力に対応しており正しいが、手札回収側 `E2` の source が `DECK_CARD` になっている別疑義を確認し、今回は変更していない。

検証：`npm run regen` で対象7件の逆翻訳が対象宣言→支払い→帰結の順になったことを目視。`build:effects` 連続2回後の全5 effects JSON は SHA-256 一致。`npm run gates` 全緑（typecheck、golden **3154/3154**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、census 11、census-stubs A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings）。ネットワーク遮断の指示に従い実機確認は未実施。

影響枚数＝7効果 / 7カード（`O-96` の欠陥署名 161 → 154）。
反転確認＝未実施。代わりに🔑**ブラスト半径をベースライン commit との機械 diff で検算**した＝
`git show e85bfe6b8:public/data/effects_*.json` と現行を effectId 単位で突き合わせ、
**変わったのは予定の7件のみ・予定外0・群B 変更0**。**遅いレーン（parser）ではこれが主要な検証項目。**
🔑**教訓＝「型にフィールドが無いなら足さずに据置する」が正解だった。**`TRANSFER_TO_HAND` は
`targetsStored` を型（`effects.ts:1909`）にも `execTransferToHand` にも `freezeStoredTargets` の
`FREEZABLE`（`effectExecutor.ts:133`）にも持たない＝**フィールドだけ書いても無視されて無言 no-op**になる。
`O-128` 第4バッチの「収集契約」とまったく同じ罠で、**2バッチ連続で同じ形の落とし穴に当たった**。
⇒ **受け皿へ配線するときは「型・実行・凍結」の3層すべてに消費地点があるかを確かめる。**（→ `O-188` に登録）
⚠**別件の疑義を2つ記録**＝`WXDi-P04-041-E1/E2` は重複ではなく別々の【自】（自アタック時／相手アタックフェイズ開始時）。
`WXDi-P05-059-E2` は原文がトラッシュからの回収なのに `source` が `DECK_CARD`（未修正）。

## 2026-09-01：PLAN §5.3 `O-128` 第4バッチ — 【ソウル】／下カード／プレイヤー恒久の3効果を既存受け皿へ配線

`GRANT_ABILITY_INNER_TEXT` が無言 no-op だった `WXDi-D07-002-E1` を `GRANT_SOUL_HOST_ABILITY`、
`WXDi-P05-060-E1` の引用部分を新設 `WXDi-P05-060-E2` の `GRANT_SIGNI_ABOVE_ABILITY`、
`WXDi-P10-002-E1` を `GRANT_PLAYER_ABILITY` へ manual 配線した（新型・engine・parser変更なし）。
`WXDi-P05-060` は collector 契約に合わせ、付与宣言を `effectType:'CONTINUOUS'` の action 直下へ分離。
E1 は設置 STUB と既存 `POWER_MODIFY` を保持し、引用付与 STUB だけを除去した。
`WXDi-D07-002` は `ON_ATTACK_SIGNI`／`triggerScope:'self'`／`usageLimit:'once_per_turn'` と
ドロー1・エナチャージ1の `CHOOSE`、`WXDi-P10-002` は既存使用条件・コストを保持して
`ON_ATTACK_PHASE_START` の `CHOOSE` と `colorMatchesLrig:true` を付与した。`targetOwner` は省略＝自分。

据置＝`WXDi-P03-002-E1` は `ON_LRIG_GROW` は実在するが「そのターン最初のグロウ」を表す条件が無い。
`WXDi-P05-069-E2` は `collectAltAttackFlipSigni` → BattleScreen の裏向きアタック／ターン終了時復帰で既に動作し、
typed 化には「アタック置換＋N体まで裏向き＋この方法で裏向きにした集合の復帰」を運ぶ構造化ペイロードが要るため据置。
🔑これにより「STUB だが別経路で動く」在庫は既知4枚→5枚。live の当該 STUB 保持カードは **17→14**
（残14のうち既知5枚は動作済み）。

既知の未修正＝`WXDi-P05-060-E1` の `POWER_MODIFY{aboveSelf:true}` は原文では別の【常】だが、
今回は指示どおり既存起動 `SEQUENCE` 内のまま。今回採用した3効果の引用能力部分に近似はない。
逆翻訳は3受け皿を日本語化し、原文の timing／対象色／選択肢／恒久性を保持した。
実機はユーザー指示どおり未実施（data／golden／生成物のみ、新型・engine・screens変更なし）。
検証＝golden **3151/0（+3）**、smoke 10721/10721・CRASH/HANG/INVARIANT 0、fuzz 全0、
census 11、census-stubs 無言A 0/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、
lint 0 errors/249 warnings。`build:effects` 2回後の全5 effects JSON SHA-256 一致も確認済み。
影響枚数＝3効果（`WXDi-P05-060` は1効果を2効果へ分割）。`WXDi-P05-060-E2` の `filter:{color:"赤"}` と
`WXDi-D07-002` のソウル付与は**盤面に載ったときだけ効く**ので静的な該当枚数は出せない。
反転確認＝未実施（実機不要判定のため）。代わりに `build:effects` 2回の SHA-256 一致で
manual→live の正規経路を確認。🔑**golden は JSON の形ではなく「収集されること」を assert**＝
`collectGrantedFromUnderSigni` に赤シグニを上に載せた盤面を渡して能力が返ることと、
**赤でないシグニでは返らないこと**（否定側）まで見ている。
🔑**教訓**＝受け皿には「収集契約」があり、`GRANT_SIGNI_ABOVE_ABILITY` / `GRANT_SOUL_HOST_ABILITY` は
**`effectType:"CONTINUOUS"` の action 直下しか読まない**（`effectEngine.ts:7007` / `7094`）。
`SEQUENCE` のステップに入れると **JSON も逆翻訳も census も golden も緑のまま盤面が動かない**。
⇒ **受け皿へ配線するときは型名の一致だけでなく、収集側の走査条件まで読む。**
🔴**`O-128` は事実上ここでクローズ**＝残 14 のうち **5枚は engine の全文 regex で既に動作**
（`WXDi-P15-033`/`WXDi-P16-044`/`WX24-P2-030`/`SPDi43-01`/`WXDi-P05-069`＝`O-60` の在庫）、
**3枚は据置契約を golden 化済み**（`WD17-001`/`WX25-CP1-003`/`WXDi-P05-068`）、
**残る6枚はすべて新機構待ち**（レイヤー／トラップアイコン付与／序数／最初のグロウ／ほか2枚）。
**既存受け皿だけで取れる在庫は尽きた。**

## 2026-09-01：PLAN §5.3 `O-128` 第3バッチ — 【ライフバースト】付与3効果を既存受け皿へ配線

`GRANT_ABILITY_INNER_TEXT` が対象なし／未知引用で無言 no-op になっていた4効果を原文照合し、
`WXEX1-11-E1`・`WXDi-P08-008-E1` を既存 `GRANT_ALL_ZONE_LIFEBURST`、
`WX24-P3-022-E2` を既存 `SET_DISPAIR_BURST_GRANT` へ manual 配線した（新型・engine変更なし）。
`WXEX1-11` の＜水獣＞は CSV `CardClass` 列にあるため正準キー `cardClass:'水獣'` を使用し、
「＜水獣＞のカード」をシグニ限定にしなかった。`WX24-P3-022` は対象を任意コスト前に固定し、
`OPTIONAL_COST{handDiscard:{count:2}}` の支払い時だけ同じ対象を `DOWN` する。
`WXDi-P12-036-E1` は「チェックゾーンへ置かれた1枚目・2枚目」の序数を保持する受け皿が無いため据置。
既知近似＝`WX24-P3-022` の一時付与は自ターン中に読まれず次の相手ターンだけ読まれるため、
自ターン中に自分のライフがクラッシュされる場合だけ原文「このターンと次のターン」より弱い。
実機不要判定＝変更は data／golden／生成物のみで `src/screens/`・新型・新機構を変更していない。
実機はユーザー指示どおり未実施。検証＝golden 3148/0、smoke・fuzz 全0、census 11、
census-stubs A/C 0、manual-fields 0/0、census-enginetext 130行/127ハンドラ、lint 0 errors/249 warnings。
影響枚数＝直した効果は3件だが、`WXEX1-11` の `burstFilter:{cardClass:"水獣"}` は**CSV 実測158枚**に当たる
（`WXDi-P08-008`・`WX24-P3-022` はフィルタ無し＝全カード）。`O-128` の live 残 STUB は **20 → 17 カード**
（うち4枚は engine の `quotedText` regex で既に動作＝実質の未実装は13枚）。
反転確認＝**未実施**（実機不要判定のため）。代わりに `npm run build:effects` の再実行で live JSON が
ビット同一に再生成されることを確認済み（手編集ではなく manual→live の正規経路で届いている）。
🔑**教訓**＝登録票の「受け皿が無い」は誤りで、受け皿は型・engine・UI・逆翻訳・golden まで完成しており
生成側（parser/manualEffects）が繋いでいないだけだった。§4.1「まず受け皿を疑う」を機構 worklist にも適用する。
⚠**未処理の不整合1件**＝`WX17-036` は修飾なし（「＜怪異＞のシグニであるカードは…を持つ」）なのに
`burstAdditive` が無い＝今回確定したルールと矛盾する。スコープ外として未変更。

## 2026-09-01（続き760）：意味照合 段2 残 OPEN **67 → 46（-21）**＝実装20／較正1

ユーザー指示「さらに２０減らす」の1巡。§5.2（意味照合 段2）を **-21**（依頼は -20）まで消化した。
gates 全緑（typecheck / **golden 3139 → 3145（+6本）**・0 FAIL / smoke 全0 / fuzz 全0 / census 12/12（据置）/
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1065→**1086**／残 OPEN 67→**46**（HIGH 39・MED 7・影響カード 43／効果 34）。
live の A/B 差分＝**15カード**（すべて意図したもの・**巻き添え0**）。

🔑**この巡の主産物＝「engine/JSON だけで閉じられる母集団」をほぼ使い切ったこと。**
続き759 の教訓（「取れる母集団は消費地点の層で決まる」）をそのまま延長して、
**コスト系 finding（`src/screens/` の支払いUIが消費地点）を今回も全部見送り**、engine/JSON だけで -21 を取った。
その結果、**残 46 の主成分は「コスト（支払いUI）」「複数体ライズ（`O-147`）」「ハーモニー」「ピース使用履歴」**に絞られた。
⇒ **次の巡は「engine/JSON で -N」を前提にできない。** コストを取るなら実機込みのバッチとして切る。

---

### ■ 新しく足した語彙（型＋評価器＋逆翻訳＋golden）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `EffectTarget.extraZones` | 「対戦相手の**場とトラッシュにある**シグニは能力を失う」 | 2つ目の【常】付与が丸ごと欠落（`rawText` に文字列としては残っていた） |
| `LEVEL_MODIFY` の `aboveSelf` 適用（`buildLevelMods`） | 「これの上にある《鰐渕アカリ（正月）》の**レベルを＋１**し」 | **レベル側は恒久 no-op**（最前面だけを走査するのでクラフト＝下段の能力は1つも拾われない） |
| `ChooseAction.noRepeat`（+`taken_choice_keys`） | 「以下の３つから**まだ選んでいないもの**１つを選ぶ」 | 毎メインフェイズ**同じ選択肢を取り続けられた**（このゲームの間ずっと有効な付与） |
| `SWAP_DECK_TOP_AND_LIFE` | 「対戦相手のデッキの一番上と対戦相手のライフクロス１枚を入れ替えてもよい」 | 3枝目が丸ごと欠落 |
| `TargetFilter.nameInCrossConditionOfLastProcessed` | 「それの**クロス条件に含まれる**シグニ」 | **デッキ／トラッシュの任意のシグニ**（クロスデッキを揃えるという役目が消えていた） |
| `AttachAcceAction.repeatWhilePossible` | 「エナゾーンから**好きな枚数**を**好きな数の**シグニの【アクセ】にする」 | `GRANT_KEYWORD{アクセ}`＝**エナのカードが1枚も動かない**真 no-op（主語も相手を含む） |
| `LookPickChainStage.gateZoneOnly` → `AddToFieldAction.gateZoneOnly` | 「シグニ１枚を**【ゲート】があるあなたのシグニゾーン**に出し」 | 空いているどのゾーンでもよかった（【ゲート】を作った意味が消える） |
| `ON_BANISH` の遅延収集地点（`collectBanishTriggers`）＋`trigger.notByOwnEffect` | 「このターン、あなたのシグニ１体が**あなたの効果以外によって**バニッシュされたとき」 | **設置しても永久に発火しない**（バニッシュを読む地点が無かった）＝アーツ本体が死んでいた |
| `GRANT_KEYWORD` の `target.type:'PLAYER'`（+`player_keywords`） | 「**対戦相手は**【みこみこ親衛隊】１つを得る」 | 任意のシグニ1体へ付与＝**トークンのコストを払う人が真逆**になりうる |
| 効果バニッシュへの `collectBanishPreventLoseAbility` 適用 | 「このシグニが**次に**バニッシュされる場合、バニッシュされない」 | **バトルバニッシュ経路だけ**が読んでいた（原文は発生源を限定しない） |
| `BlockActionAction.bothPlayers` | 「このターン、**シグニアタックステップをスキップする**」 | 効果の使用者だけを止める＝相手ターンに出たとき**相手のステップが飛ばない** |
| `PLACE_KEY_FROM_LRIG_DECK` | 「あなたのルリグデッキから《異体同心　華代》１枚を場に出す」 | `ADD_TO_FIELD{source なし}`＝**デッキの一番上を場に出す**別のカード |
| `TransferToDeckAction.orderChosenBy:'opponent'` | 「（**置く順番は対戦相手が決める**）」 | 一括処理＝engine の内部順で積まれる（デッキトップの並び＝次のドロー順なので実効果が変わる） |

### ■ 既存の受け皿へ配線しただけのもの

- `GAIN_BOND{source:'last_found'}`（`WXDi-CP02-005-E1`「この方法で公開した生徒との絆を獲得する」）
- `PLACE_LRIGS_UNDER_CENTER`＋`TRANSFER_TO_DECK{LRIG_TRASH_CARD→lrig_deck}`（`WXEX2-84`。同型の `WX05-001-E1` が前からこの形）
- `REPEAT{3}`＋`CHOOSE`（支払いの2択）＋`NEGATE_ATTACK{target:{type:'LRIG'}}`（`WXDi-P05-003-E1`＝**2 finding を1枚で**）
- `REVEAL_DECK_TOP`＋`DECK_TOP_MATCHES`（`WX19-061-E1` のスペル枝。⚠**この枝だけ `lastProcessedCards` を使えない**＝
  直前の `LOOK_AND_REORDER`（相手デッキを見る）が上書きするので、公開札がデッキトップに残る性質を使って判定する）

### ■ 較正（live を開いたら既に実装済みだったもの・1件）

`WXEX2-84-E1`「すべてのルリグをこのカードの下に置き」＝`STUB{LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS}`
（`execStubPart3.ts:4800`）が**ルリグを全部センタールリグの下へ置いていた**（claim が stale）。

### ■ golden：契約1本を更新・影武者1本を撤去

- 🆕**`task12 lxxiv残` の対照を更新**＝`WXDi-P09-031-E1` は `bothPlayers:true` を明示したので**両者**へ積む。
  ⚠**この試験の本来の目的（主語なしを一律 opponent へ倒さない）は残した**＝
  **フラグを外した対照が self だけに積む**ことを同時に assert する形へ組み替えた。
- `WDK03-001-E2`（【エナチャージ２】）は **parser 出力と実体同一**だったので manual から撤去（§6.4 O-42 の影武者禁止）。
- `BASELINE_ORPHAN_MANUAL` を 10 → 9 へ（払い戻し）。

### ■ 実機の判定

⚠**実機は不要と判定**（§2.2 の「触ったディレクトリ」ルール）＝`src/screens/` を1バイトも触っていない。
🔴**ただし今回は新機構が**多段対話**を2つ含む**（`ATTACH_ACCE.repeatWhilePossible` のループ／
`TransferToDeckAction.orderChosenBy` の 1体ずつ `opponentResponds`）＝**UI 層は golden で守れない層**なので、
**engine 側の resume チェーンを golden に固定した**（`--only "続き760"` の6本）。
UI の候補提示・選択リセットまで見たい場合は §5.1 へ `V-nn` として観測点を足すこと。

### ■ 検証コマンド

```
npm run gates            # 全緑（golden 3145 / 0 FAIL）
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 67 → 46
npm run golden -- --only "続き760"                # 新語彙の3点セット（反転確認つき・6本）
```

## 2026-08-31（続き759）：意味照合 段2 残 OPEN **97 → 67（-30）**＝実装25／較正5

ユーザー指示「PLANをよみ、OPENを３０減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3139本・0 FAIL** / smoke 全0 / fuzz 全0 / census 12/12（据置）/
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1035→**1065**／残 OPEN 97→**67**（HIGH 58・MED 9・影響カード 60／効果 51）。
live の A/B 差分＝**20カード**（すべて意図したもの・**巻き添え0**）。
⚠**実機は不要と判定**（§2.2）＝`src/screens/` を1バイトも触っていない（変更は `src/types/` `src/engine/`
`src/data/` `scripts/` `public/data/` だけ）。反転確認は golden 側に埋めた（下記）。

🔑**この巡の主産物＝「claim の半分が stale」という中間状態が母集団の主成分になってきた。**
較正5件のうち3件（`WX25-P1-022-E2` / `WXDi-P14-070-E1` / `WX16-Re19-E2`）は
**engine の実体は正しいのに逆翻訳の語や JSON のラベルが原文と違って見えていた**もので、
`WX24-P4-040-E2` `WXDi-P11-003-E1` `WXDi-P15-079-E1` のように **claim の前半だけ stale**という形も増えた。
⇒ **finding を読んだら「claim の各節」ごとに live を当てる**（1件まるごと真／偽で扱わない）。

---

### ■ 新しく足した語彙（型＋評価器＋逆翻訳＋golden）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `ZONE_COUNT_COMPARE.offset` | 「あなたの場のシグニが対戦相手より**２体以上少ない**場合」 | 条件が丸ごと落ちて**無条件バニッシュ**（同じ効果の④には条件が付いていた＝片枝の取りこぼし） |
| `TargetFilter.isAttacking` | 「**アタックしている**あなたのシグニのパワーを＋2000」 | **自分の全シグニを常時＋2000**（原文の3倍規模の常在バフ） |
| `TargetFilter.discardedFromHandThisTurn` | 「**このターンに捨てた**シグニ１枚を対象とし」 | トラッシュの**任意のシグニ**を釣れた |
| `TargetFilter.restrictionMatchesCenterLrig`（+`restrictionContains`） | 「**限定条件にあなたのセンタールリグのルリグタイプを持つ**カード」 | `cardType:'ルリグ'`＝**メインデッキにいないカード**を探す実質空振り |
| `trashedPick.dest:'field'` | 「**それを**トラッシュから場に出す」 | `ADD_TO_FIELD{TRASH_CARD}`＝**トラッシュの任意のシグニ**（「この方法で」の限定が消えていた） |
| `StubAction.declareFromLastProcessed` | 「（この方法で置いた5枚に）共通するクラスが3枚以上ある場合、**そのクラス**1つを選択する」 | クラス選択そのものが無く、手札に加えるのは**任意のシグニ** |
| `CHECK_ZONE_COUNT.filter` | 「対戦相手のチェックゾーンに**スペル**がある場合」 | 条件が丸ごと無く、**場に出るたび必ず**発動 |
| `GrantProtectionAction.duringOppTurn` | 「**対戦相手のターンの間**、対戦相手の効果を受けない」 | **ターンを問わない永続耐性** |
| `PlayFreeAction.source:'trash'` ／ `targetsLastProcessed` | 「あなたと対戦相手のトラッシュ…**（コストは支払う）**」／「**その**スペルを」 | 自分側が `PLAY_FREE_FROM_TRASH`＝**必ず無料**／照応が消えて**別のコスト1以下スペル**を使えた |
| `ATTACH_CHARM` の場ソース ＋ `toOther` | 「対戦相手のシグニ１体を**他の**シグニの【チャーム】にする」 | `charm.type:'SIGNI'` を書いていたのに engine に分岐が無く、既定枝（手札／エナ）へ落ちて**相手の手札のカードをチャームにしていた** |
| `Condition REFRESH_COUNT_THIS_TURN` | 「それが**このターンであなたの最初のリフレッシュ**である場合」 | 同じターンの**2回目以降でも**バニッシュ |

🔴**手札捨て枚数を候補数で頭打ちにした**（`execTrash` の HAND_CARD 分岐）＝
原文「手札を２枚捨てる。**（手札が１枚以下で使用した場合すべて捨てる）**」（`WDK05-T10-E1`）は
ルールの「できるかぎり行う」そのもの。旧実装は `count` をそのまま渡しており
`EffectInteractionModal.canConfirm`（選択数 ≧ count）が**候補不足でソフトロック**していた。
⚠**上限を下げるだけ**なので候補が足りている盤面は1バイトも変わらない（golden 3139 全緑で確認）。

### ■ 既存の受け皿へ配線しただけのもの（実装25件のうち14件）

- `GRANT_PROTECTION{target:{type:'LRIG'}, from:['any']}`（`WXK10-104-E1`＝主語がシグニ・耐性がルリグ限定の2軸ズレ）
- `GRANT_EFFECT{target:LRIG}` を `SEQUENCE` で3本（`WXK10-014-E1`＝3つの【起】のうち2つが欠落）
- `REVEAL_UNTIL{stopCondition:signiCount, restDestination:'trash'}`＋`SELECT_TARGET_ONLY`→`STORE`→`TRASH{targetsStored}`
  （`WXK06-030-E1`＝**3 finding を1枚で閉じた**。めくり切りが無い／対象が＜龍獣＞に限定されていた／「それ」の照応が消えていた）
- `TRANSFER_TO_DECK`→`LAST_PROCESSED_COUNT_GTE`→`ADD_TO_FIELD{TRASH_CARD}`（`WXK09-090-E1`＝
  旧 `ADD_TO_FIELD{source 無し}` は**デッキの一番上を出す**別のカードで、ゲートも「そうした場合」ではなく `IS_MY_TURN` だった）
- `CHOOSE` の2枝でプレイヤー選択を表す（`WXDi-P04-005-E1`「**あなたか対戦相手は**」＝旧は自分固定）
- `REVEAL_DECK_TOP`＋`LAST_PROCESSED_MATCHES`（`WX19-061-E1` の＜水獣＞ドロー枝）
- `LOOK_AND_REORDER{source:{location:'life_cloth'}}`（`WXDi-P03-004-E1`「ライフクロスの一番上を**見て**」）
- `TRANSFER_TO_HAND{source.owner:'opponent'}`（`WXK11-006-E1-G`＝取得元と受取人が自分になっていた＝**主語が真逆**）
- `cost:{discardAll,energyTrashAll}` 等は**支払いUI（`src/screens/`）が要る**ので今回は取らなかった（実機必須になるため）

### ■ 較正（live を開いたら既に実装済みだったもの・5件）

| finding | 実体 |
|---|---|
| `WX25-P3-053-E1`「次とその次に」 | `REPLACE_NEXT_DAMAGE_WITH_MILL` は `once:true` の予約を**配列に積む**＝2本並べれば2回ぶん |
| `WXK11-006-E1-G`「ルリグ１体とシグニ１体」 | `selectionConstraint.groups` で**既に分けられていた** |
| `WX25-P1-022-E2`「あなたと対戦相手のトラッシュ」 | 自分側の枝は前から在った（claim が stale。**同じ finding のもう1つの節「コストは支払う」は真バグ**） |
| `WXDi-P14-070-E1`「このピースの後に場に出たシグニにも影響」 | `duration:'NEXT_TURN'` は `reserveFieldGrant`＝**場レベル予約**（後から出たシグニにも効く） |
| `WX16-Re19-E2`「次の対戦相手のメインフェイズの間」 | `until:'NEXT_TURN'` の実体は `pending_lrig_limit_mod` → 次ターンの GROW→MAIN で `lrig_limit_mod` へ移り、それは**ターン開始時リセット**＝原文どおり。**逆翻訳の語だけ**「次のターンの間」→「次のメインフェイズの間」に直した |

### ■ golden の据置契約を1本卒業・1本を反転

- 🆕**卒業**＝`(B6) 据置契約: 別ゾーンを指す中間動作は owner だけ直さない（WXK06-030 のみ）`。
  据置理由「原文照合が未了」を解いたので、**3段（対象宣言→めくり切り→そうした場合）が揃っていること**を
  見張る側へ反転した（owner だけ直す退化はここで落ちる）。
- 🆕**反転確認を golden に埋めた**＝`WX16-Re09-E1` は耐性を見る窓を**相手ターン**へ移し、
  同時に「**あなたのターンには耐性を得ない**」も assert（`duringOppTurn` を落とすと必ず落ちる）。
- `(l) センタールリグ付与の入れ子化` は**判定を直した**＝`rawText` が **`undefined`（＝展開済みで消えた正常形）**を
  `?? ''` で空文字にしてから「句点のみ」判定に掛けており、**manual で `abilities` を直書きすると誤検出**していた。

### ■ 検証コマンド

```
npm run gates            # 全緑（golden 3139 / 0 FAIL）
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 97 → 67
npm run regen            # 逆翻訳シート再生成（新語彙10本ぶんの日本語を確認）
```

## 2026-08-31（続き758）：意味照合 段2 残 OPEN **127 → 97（-30）**＝実装26／較正4

ユーザー指示「さらに３０減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3131→3139（+8本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12/12（較正で据置）／census-stubs A🔴0・C0 / manual-fields 0 /
census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 1001→**1035**／残 OPEN 127→**97**（HIGH 81・MED 16・影響カード 79／効果 71）。
live の A/B 差分＝**24カード**（すべて意図したもの・巻き添え0）。

🔑**この巡の主産物＝「1つの受け皿に複数カードを束ねる」ほうが歩留まりが高いと分かったこと。**
新設した engine 語彙は7つだが、**26件の実装のうち19件は既存受け皿への配線**で、
そのうち **`LOOK_PICK_CHAIN` だけで4件**（前セッションの「配線だけ」型の再実証）。

---

### ■ 新しい語彙を足したもの（型＋評価器＋golden の3点セット）

| 語彙 | 原文 | 🔴旧 live の挙動 |
|---|---|---|
| `TakeFromUnderSigniAction.count:'ALL'` | 「このシグニの下からカードを**好きな枚数**」 | **9枚固定**＝原文に無い数字が上限を決めていた |
| `SelectionConstraint.distinct:'costSum'` | 「**それぞれコストの合計が異なる**スペル３枚」 | **任意のカード3枚**＝重い支払いが実質タダ |
| `triggerCondition.targetedByOpponent` | 「**対戦相手の**、能力か効果の対象になったとき」 | **誰の効果でも**発火（`WX25-P2-055` は自分で「バニッシュされない」を剥がす自滅） |
| `triggerCondition.centerLrigOnly` | 「あなたの**センタールリグ**がアタックしたとき」 | **アシストルリグのアタックでも**誘発 |
| `TargetFilter.classMatchesAnyFieldSigni` | 「あなたの場のいずれかのシグニと**共通するクラスを持つ**」 | 相手の**どのシグニでも**取れた |
| `$ref:'assist_lrig_level_sum'` | 「**アシストルリグのレベルの合計**１につき」 | 比例が落ちて**常に1枚** |
| `ATTACH_ACCE.targetsLastProcessed` ＋ `optional` | 「それを**この方法で場に出したシグニ**の【アクセ】にして**もよい**」 | `GRANT_KEYWORD{アクセ}`＝**エナのカードが1枚も動かない**（アクセ機構としては完全な no-op） |

🔴**fail-closed の向きを全部そろえた**＝`classMatchesAnyFieldSigni`（自分の場が空なら空ヒット）／
`distinct:'costSum'`（コストが読めない札が混ざったら不成立）／`ATTACH_ACCE.targetsLastProcessed`
（直前処理カードが場に居なければ候補0）。⚠**例外は `targetedByOpponent` だけ**＝`TargetedOrigin` が
持ち主を持たないので **origin のカードを両者のゾーンから探して**判定し、**見つからないときは従来どおり通す
（fail-open）**。ここだけ過小へ倒すと「誰の効果か分からない経路」で誘発が丸ごと消えるため。

---

### ■ 受け皿は在ったのに配線されていなかったもの（19件）

#### (a) 🔑**`LOOK_PICK_CHAIN` で4件**＝「N枚見て、1枚を〈行き先〉、残りを好きな順番でデッキの一番下」

- 🔴**`LOOK_AND_REORDER{canTrash:true}` は「何枚トラッシュに置けるか無制限」**（＝任意）で、
  「**必ず**1枚をトラッシュに置く」も「1枚を**デッキの一番上**に戻す」も表せない。
  受け皿は `LOOK_PICK_CHAIN` の `then:'trash'` / `then:'deck_top'`（どちらも実装済み）。
- `SPDi01-133-E1`（トラッシュ1＋デッキ上1）／`WX24-P3-078-E1`（デッキ上1）／`WXDi-P15-073-E2`（トラッシュ1）。
- 🔴**`WXDi-P10-075-E1` は別種の壊れ方**＝「見る」の後ろに `TRASH{SIGNI owner:'any'}` が付いており、
  **任意確認なしで場のシグニ1体（自分のでも）を強制トラッシュ**していた＝原文と別のカードだった。
  ⇒ `LOOK_AND_REORDER{count:1, canTrash:true}` 1本で「見て、置いてもよい」を表す。

#### (b) 「このシグニと共通する色を持たない他の＜天使＞がある場合」（2件）

- `SP27-012-E1` / `WX21-039-E1`＝**`else` 枝が無条件**で、原文の①（1枚引く／1枚エナ）が
  条件を満たさなくても必ず通っていた。受け皿は 2026-08-31 続き748 新設の
  `HAS_CARD_IN_FIELD{filter.colorNotMatchesSource, excludeSelf}`（`WX21-032-E1` と同じ式）。

#### (c) 単発の配線（残り13件）

- `PR-322-E2`＝「それを場に出す**か**手札から黒のシグニ1枚を場に出す」の**手札枝が丸ごと落ちていた**。
- `WD20-018-E1`＝選択肢②の全シグニトラッシュが**強制**（ライフ0のとき自分の盤面が必ず全滅した）。
- `WD21-017-E1`＝「**効果によって**バニッシュされたとき」の原因限定が無く、**バトルバニッシュでも発火**。
- `WX14-057-E1`＝条件成立後に対象を選ぶ形＝**条件を満たさないと対象宣言そのものが起きない**。
- `WDK15-008-E1`＝「シグニの**下から**2枚まで」が**シグニ本体を1体、必ず**トラッシュ（盤面が減る別物）。
- `WX21-046-E1`／`SP24-010-E1`／`WX13-052-E1`（「そうした場合、公開したシグニをダウンで場に出す」が
  丸ごと無く**自分をバニッシュして終わり**だった）／`WXDi-P00-021-E2`／`WX19-031-E1`／
  `WX24-P4-102-E1`／`WX25-P2-055-E2`／`WXDi-P05-008-E1`／`WXDi-D04-004-sub-E1`。

#### (d) 「あなたのレベル３のルリグ１体を対象とし」（ピース3枚）

- `WXDi-D03-011-E1` / `WXDi-D05-011-E1` / `WXDi-D06-011-E1`＝使用条件が「チーム全員レベル１以上」だけで
  **レベル1のセンターでも撃てた**。`GRANT_LRIG_ABILITY` の付与先は常にセンタールリグなので、
  **センターがレベル3以上であること**を使用条件に足すのが「レベル３のルリグ１体を対象とし」の忠実表現。
  ⚠**`eq 3` ではなく `gte 3`**＝原文は対象の資格であって上限ではない。
- あわせて `WXDi-D03-011-sub-E1` の【ダブルクラッシュ】付与先を **`SIGNI{thisCardOnly}` → `LRIG`** に直した
  （ルリグが得る能力なのにシグニへ付いていた）。

---

### ■ 較正（4件）＝live を開いたら既に実装済みだったもの

- **`WD06-009-E2` ×2 ／ `WX20-043-E1`**＝自分のライフクラッシュ置換は
  `STUB{SELF_CRASH_TO_TRASH_AND_REFILL}` として 2026-08-31 続き749 で**完全に実装済み**だった
  （`BattleScreen.tsx:12514` でエナ送りをトラッシュへ差し替え、`:12649` で**置換が乗った回だけ**
  デッキ上をライフへ足し、回数を1つ消費する）。
- **`WDK05-T09-E1-G`**＝`actionId:'GUARD_LV1'` は `makeGuardLevelBlocker` が
  **正規表現 `^GUARD_LV(\d+)` で消費済み**だった。
  🔑**教訓＝「リテラルで grep して0件だから未実装」と判断しない。**
  受け皿が**正規表現で id を解釈する**形だと、文字列検索では絶対に見つからない。
  この型は `census:enginetext` が測っている「engine が regex で意味を決めている箇所」の裏返しでもある。

---

### ■ 計器・契約の更新（どちらも「実装したら必ず動く」印）

- 🔴**据置契約 golden を1本反転**＝`段2 第33バッチ 据置契約: PR-322-E2 は手札から出す選択肢が未表現` は
  「実装したら落ちるトリップワイヤ」なので、**消さずに期待値を反転**して
  「トラッシュ枝と手札枝の二択になっている」を要求する契約へ書き換えた（PLAN §5.2 の規約どおり）。
- 🔴**census の較正を1箇所広げた**＝`ON_GUARD` ＋ `lrigAttackNoDamage` を「アタックしたとき」の
  正表現と認める既存規則は主語が**「（センター）ルリグN体」しか剥がせず**、
  「**この**ルリグがアタックしたとき、そのアタック終了時、」（`WXDi-D04-004-sub-E1`）を
  同じ受け皿へ配線した瞬間に高シグナルへ昇格していた（12→13）。
  ⚠**ベースラインを上げずに較正で戻した**＝退化ではなく**計器の穴**（同じ族の綴り違い）。

---

### ■ 検証コマンド／反転確認

```
npm run typecheck && npm run build:effects
node scripts/heldReview.mjs --adopt <22枚>
npx tsx scripts/syncManualLive.ts WD20-018 WX25-P2-055   # 既存 manual を書き直した2枚はこちら
npm run regen && npm run gates
node scripts/archive/semanticAuditLedger.mjs             # 127 → 97
```

**反転確認（実測4件）**＝該当分岐を `if (false && …)` にすると、
- `targetedByOpponent` → `✗ 🔴自分の手札のカードが対象化したときは誘発しない（旧バグ）`
- `centerLrigOnly` → `✗ 🔴アシストルリグのアタックでは誘発しない（旧バグ）`
- `distinct:'costSum'` → `✗ 🔴コスト合計が同じ2枚は選べない`
- `classMatchesAnyFieldSigni` → `✗ 🔴自分の場が空なら誰も対象にならない`

⚠🔑**収穫マージの関門を2種類とも踏んだ**＝新規カード22枚は `heldReview --adopt` で届いたが、
**既に `manualEffects.ts` に定義があるカードを書き直した2枚（`WD20-018` / `WX25-P2-055`）は
`build:effects` では live に届かない**（live 側の MANUAL/PARTIAL が不可侵）。
⇒ `npx tsx scripts/syncManualLive.ts` が要る。**「既存 manual の書き直し」と「新規 manual」は経路が別。**

---

## 2026-08-31（続き757）：意味照合 段2 残 OPEN **157 → 127（-30）**＝実装18／較正12

ユーザー指示「PLANを読み、OPENを30減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3126→3131（+5本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12/12 据置 / census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 970→**1001**／残 OPEN 157→**127**（HIGH 101・MED 26・影響カード 106／効果 98）。
live の A/B 差分＝**15カード**（意図した14＋同文型の拡張採用 `WXDi-P07-002` 1）。

🔑🔴**この巡の主産物＝「受け皿は在るのに、生成側の入口が2つあって片方だけ配線されていなかった」型を見つけたこと。**
新設した engine 語彙は **2つだけ**（`SelectionConstraint.same:'power'` と `TargetFilter.powerEqTrigger`）。
残り16件はすべて**既存受け皿への配線**（`countChoose` ／ `ENERGY_CHARGE_PER_LRIG_LEVEL` ／
`ATTACH_ACCE.fromEnergy` ／ `GRANT_PLAYER_ABILITY` ／ `GRANT_LRIG_ABILITY` ／ `OR`＋`HAS_CARD_IN_FIELD` ／
`LRIG_LIMIT_MODIFY{owner:'any'}`）。

**⑤実機の判定＝不要**（PLAN §2.2 の表）。⚠**`src/screens/battle/lrigLimit.ts` を1行だけ触った**（`owner:'any'` を
受けるための述語拡張）が、**UI を持たない純関数**で、golden が `computeEffectiveLrigLimit` と
`collectOppDeclaredLrigLimitDelta` を**直接呼んで両側を assert**している。新しい UI 面は増えていないので
ドライバは書かず、観測点だけ §5.1 `V-104` に登録した。

---

### ■ 新しい語彙を足したもの（型＋評価器＋golden の3点セット）

#### (a) `SelectionConstraint.same:'power'`（2 findings＝`WX13-013-E1` / `WX21-010-E1`）

- **真因**＝「**同じパワーを持つ**シグニ３体を対象とし、それらをバニッシュする」の相互制約が
  **語彙ごと無く**、`{type:'SIGNI',owner:'any',count:3}` の裸だった＝**盤面のどの3体でも**薙ぎ払える
  過剰効果（赤1エナの全体除去）。`WX21-010` も同様に「相手のどの2体でも」だった。
- **配線先**＝`src/types/effects.ts`（`same` の union に `'power'`）／`execUtils.ts:satisfiesSelectionConstraint`
  （`canAddToSelection` は同関数へ委譲済みなので逐次選択にも自動で効く）／`decompileEffects.ts` の
  `共通する◯を持つ` 表示。
- ⚠**印刷パワーで比較する近似**＝`satisfiesSelectionConstraint` は `cardMap` しか受け取らないので実効パワーを
  見られない（既存の `same:'level'` と同じ層）。パワー不明（`Power` が数値でない）は**不成立**へ倒した（fail-closed）。
  **制約が1つも無い現状より厳密に狭い**ので採用した。
- **影響**＝2効果。

#### (b) `TargetFilter.powerEqTrigger`（2 findings＝`WX17-046-E2` / `WX24-P4-003-E1`）

- **真因**＝「**バニッシュしたシグニと同じパワーを持つ**対戦相手のシグニ1体」／「トラッシュから**それと同じ
  パワーの**シグニ1枚」のパワー条件が落ち、**相手のどのシグニでも**連鎖バニッシュ／回収できた。
- **配線先**＝`effectExecutor.ts:resolveDynamicFilter`（`triggeringCardNum` → 無ければ `lastProcessedCards[0]` を
  基準に `powerRange.min/max` を同値へ解決）／`decompileEffects.ts` の `filterJa`。
- 🔴**参照不能時は空ヒット（fail-closed）**にした。兄弟の `powerLteTrigger` は歴史的に fail-open だが、
  **同値条件を fail-open にすると「同じパワー」の限定が丸ごと消えて過剰実行に裏返る**（§5-3′′）。
- **影響**＝2効果。

---

### ■ 受け皿は在ったのに配線されていなかったもの（engine 変更なし／parser・JSON だけ）

#### (c) 🔴**CHOOSE ヘッダの入口が2つあり、素の入口だけが `countChoose` を捨てていた**（5 findings・実質6効果）

- **真因**＝`parseChooseHeaderCount` は「あなたのセンタールリグのレベル１につき１つまで選ぶ」を
  正しく `countChoose{$ref:'center_lrig_level'}` へ解いていたが、**それを使う入口が2つ**あり、
  `buildChooseFromHeader`（＝ヘッダが文フィルタで落ちた形の救済路）だけが `countChoose` を載せ、
  **素の「先頭がヘッダ」入口（`effectParser.ts` の `headM` ブロック）は `count`/`upTo` しか読まずに捨てていた**。
  ⇒ 該当カードは**常に1つ固定**（センターLv4でも1つしか選べない）に潰れていた。
- 🔑**教訓＝「受け皿が在るのに届かない」を疑うときは、受け皿の *呼び出し元* を全部数える。**
  今回は生成側の関数（`parseChooseHeaderCount`）まで正しく、**その戻り値の一部を捨てる呼び出し元**が犯人だった。
  受け皿・生成関数・呼び出し元の3層を分けて見ないと「実装済みなのに直らない」に見える。
- **影響**＝`WXDi-P06-003-E1` / `WXDi-P14-003-E1` / `WXDi-P07-002-E1`（同文型の拡張採用）。

#### (d) 「この効果を〈誰か〉のセンタールリグのレベルと**同じ回数**行う」（2 findings）

- **真因**＝`WXK10-104-E1` / `WXDi-D05-011-sub-E1` の反復指定が丸ごと落ちて**常に1回**だった。
- **書き方**＝`countChoose{$ref}`＋`allowRepeat`（原文の注記が「同じ選択肢を選んでもよい」なので
  「1回の選択をN回実行」ではなく**選択数そのものがN**）。⚠`upTo` は立てない（必須回数）。
- 🔴**置く場所を3回間違えた**＝①`applyDynamicActionCountBatch35` の中は guard regex に文型が無くて素通り
  ②その後ろの `markRemainderReorder` / `rewriteCatchAllStubs` が action 木を作り直すので先に書くと落ちる
  ⇒ **`parseCardEffects` の最後（カード単位の後段のいちばん後ろ）**に置いた。
  ⚠さらに `currentSourceTexts` にこの effect が載らないカードがある（`WXK10-104-E1`）ので、無ければカード全文へ落とす。
- ⚠**デバッグ中に自分で偽の結論を出した**＝probe が `JSON.stringify(...).slice(0,1200)` で切れており、
  末尾に付く `countChoose` が見えず「効いていない」と誤読した。**出力を切り詰めた計器で「無い」と判断しない。**

#### (e) `ENERGY_CHARGE_PER_LRIG_LEVEL` の単独形（1 finding＝`WXDi-P14-004-E1`）

- **真因**＝受け皿は「レベル1につきN枚引く**か**レベル1につき【エナチャージM】」の**二択形からしか**合成されず、
  単独形は下の【エナチャージ】ショートハンドに食われて**レベルに依らない固定2枚**へ潰れていた。
- **配線先**＝`parseSentencePart1.ts`（二択形の直前に単独形を1本。ドロー単独形も同じ穴なので同時に配線）。

#### (f) `ATTACH_ACCE.fromEnergy`（1 finding＝`WX20-002-E2`）

- **真因**＝「あなたのエナゾーンから《アクセアイコン》を持つカード1枚を…シグニの【アクセ】にする」が
  `GRANT_KEYWORD{keyword:'アクセ'}` に化けており、**エナのカードは1枚も動かず**場のシグニに語だけが付いていた
  （＝アクセ機構としては完全な no-op）。受け皿は 2026-08-31 続き748 で新設済みだった。

#### (g) `LRIG_LIMIT_MODIFY{owner:'any'}`（1 finding＝`WXK11-013-E3`）

- **真因**＝「センタールリグのリミットは１減る。**（お互いのセンタールリグに影響する）**」が `owner:'self'`＝
  **自分のリミットだけ**が減っており、相手の盤面を縛るという札の主目的が丸ごと消えていた。
- 🔴**注記は `stripRuleParens` で文レベル parser へ届く前に消える**（`（…）` を全部落とす）。
  ⇒ 文レベルでは読めないので、**カード全文が見える後段**（`parseCardEffects` の末尾）で刻む。
  **最初に `parseSentencePart2` へ書いた規則は永久に発火しないコードだった**ので撤去した。
- **engine 側**＝`effectEngine.ts:collectLrigColorAndLimitMods`（自分側）と
  `screens/battle/lrigLimit.ts:collectOppDeclaredLrigLimitDelta`（対面側）の**両方**が `'any'` を拾う。
  **片方だけ直すと「自分だけ／相手だけ」に化ける。**

#### (h) 使用条件の OR（1 finding＝`WXDi-P08-068-E1`）

- **真因**＝「3種の指定シグニが場にある**か**、相手の手札が1枚以下」が `HAND_COUNT{eq:1}` の**片枝だけ**に潰れ、
  **0枚では撃てず、指定シグニが並んでいても撃てない**という両方向に外れた条件だった。
  受け皿（`OR` ＋ `HAS_CARD_IN_FIELD{filter.cardName}`）は既存。`manualEffects.ts` へ手書き。

#### (i) 帰属の付け直し2件

- `WXK03-008-E3`＝「あなたのセンタールリグは以下の能力を得る」の2本目【自】が**キー自身の独立した自動能力**
  として立っていた ⇒ 同カードの E1 が既に使っている `GRANT_LRIG_ABILITY` の中へ入れ子にした。
  ⚠**golden のラチェット `ON_TURN_END` 母数 187→186 が動く**（トップレベルの ON_TURN_END が1件減っただけで
  挙動は消えていない）＝理由を書いて基準を下げた。
- `WXDi-P11-003-E1`（ピース）＝①使用条件（ルリグ3体で3色以上）が無い ②「このゲームの間の付与」が落ちて
  **使用時に1回だけ選択肢を即時実行** ③原文に無い `GRANT_KEYWORD{keyword:'使用条件'}` を自分のシグニへ付与
  ④選択肢③の移動元が**場のシグニ**（トラッシュではない）＝自分の盤面を自らデッキへ戻していた。
  ⇒ `GRANT_PLAYER_ABILITY{permanent}` ＋ `ON_MAIN_PHASE_START` ＋ `FIELD_LRIG_COLOR_COUNT{minLrigs:3}` で書き直し。
  ⚠**「まだ選んでいないもの」＝選択履歴による除外は未実装**（parser 側の既存注記と同じ近似）＝`PARTIAL` にして
  finding「メインフェイズ開始時」は**閉じずに残した**（5/6 だけ閉じた）。

---

### ■ 較正（12件）＝live を開いたら既に実装済みだったもの

`WXDi-P06-077-E1`×3・`WXDi-P06-077-sub-E1`・`WXDi-P03-071-BURST`・`WX25-CP1-TK2A-E2`・`WXDi-P06-035-E2`・
`WXEX1-14-E2`・`WX25-CP1-008-E1`・`WXDi-P07-071-E1`・`WX24-P3-055-E2`・`WXK11-006-E4`。

🔑**続き756 の教訓（「live を開いた効果はその場で claim を読み直す」）がそのまま効いた。**
⚠**`semanticAuditRecheck.mjs` の LCS 候補28件とは1件も重なっていない**（あちらは quote と逆翻訳の
最長共通部分文字列で並べるだけなので、「claim の軸が別」の偽陽性が過半）。
🔑**代わりに効いたのは「1効果に複数 finding が付いているカードを開く」**＝`WXDi-P06-077` は
finding 4本のうち**4本とも**が stale だった（E2 が独立した【起】として既に在り、`thisCardOnly` も
`美巧` 条件も配線済み）。**同じ効果の finding が3本以上あるカードは、まとめて古くなっている可能性が高い。**

---

### ■ 検証コマンド／反転確認

```
npm run typecheck && npm run build:effects && node scripts/heldReview.mjs --adopt <10枚> && npm run regen && npm run gates
npm run golden -- --only "same:power" --only "powerEqTrigger" --only "LRIG_LIMIT_MODIFY owner:any" \
                 --only "countChoose" --only "ENERGY_CHARGE_PER_LRIG_LEVEL"
node scripts/archive/semanticAuditLedger.mjs      # 157 → 127
```

**反転確認（実測）**＝
- `satisfiesSelectionConstraint` の `same:'power'` 分岐を `if (false && …)` にすると
  `✗ 🔴パワーが違う2体は選べない` で FAIL。
- `resolveDynamicFilter` の `powerEqTrigger` 分岐を同様に無効化すると
  `✗ 直前処理(12000)と同じパワーは候補` で FAIL。
- `WXDi-D05-011` の golden には**相手センター不在なら0回＝1枚も引かない**という反証を足した
  （これが無いと「レベル比例」を足したつもりで常に1回に潰れていても緑のままになる）。

⚠**収穫マージの関門**＝今回の14カードのうち**10枚が held に落ちた**（`docs/_held_fresh.json`）。
`build:effects` だけでは live に届かないので `node scripts/heldReview.mjs --adopt <CardNum,…>` が要る。
**「parser を直したのに live が変わらない」ときは真っ先にここを見る**（CLAUDE.md の3ファイル）。

---

## 2026-08-31（続き756）：意味照合 段2 残 OPEN **187 → 157（-30）**＝実装21／較正9

ユーザー指示「PLANを読み、OPENを30減らす」の1巡。§5.2（意味照合 段2）を **-30 ちょうど**まで消化した。
gates 全緑（typecheck / **golden 3123→3126（+3本）**・0 FAIL / smoke 全0 / fuzz 全0 /
census 12 / census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
台帳の内訳＝消化 939→**970**／残 OPEN 187→**157**（HIGH 127・MED 30・影響カード 124／効果 120）。

**⑤実機の判定＝不要**（PLAN §2.2 の表）。触ったのは `src/data/` `src/engine/` `public/data/` `scripts/` だけで
**`src/screens/` は1バイトも触っていない**。新設した語彙（下記）は**engine を実走させる golden で両方向を固定し、
修正を外すと FAIL することを実測**した（下の「反転確認」）。⚠ただし **UI に新しく面が出る2件**
（【ライド】の【起】ボタン9枚／`split_top_bottom` の振り分けUI 4枚）は**どの計器も見ていない**ので
§5.1 に `V-101` として観測点を登録した。

---

### ■ 新しい語彙を足したもの（型＋両評価器＋golden の3点セット）

#### (a) `TargetFilter.hasUnderCards` / `hasAttachedOrUnder`（3 findings）

- **真因**＝「**下にカードがある**あなたの＜解放派＞のシグニ1体」（`WXDi-P15-063-E1`）／
  「**カードが付いているか下にカードがある**対戦相手のシグニ1体」（`WXDi-P11-079-E1`）／
  「**下にカードがある**あなたのシグニ1体につき」（`WXDi-P15-051-E1`）の修飾が
  **語彙ごと存在せず**、どれも「任意のシグニ」に化けていた（過剰効果）。
- 🔴**`anyOf:[{hasCharm},{hasUnderCards},…]` では書けない**＝`anyOf` は `matchesFilter`（CardData 単体）
  しか通らず、**ゾーン状態キーは中で黙って無視される＝無条件成立**（`execUtils.ts:941`）。
  ⇒ OR を**1つのゾーン状態キー**（`hasAttachedOrUnder`）として持たせた。
- **配線先**＝`matchesStateFilter`（`effectEngine.ts`）／`fieldCandidates`（`execUtils.ts`）／
  `ZONE_STATE_KEYS` 2箇所（`execUtils` / `triggerCollect`）／`decompileEffects.ts` の `filterJa` 2箇所。
- 🔑**`POWER_MODIFY_PER_FIELD` の数え上げは `matchesFilter` しか呼んでいなかった**＝ゾーン状態キーが素通りする。
  `execPowerModifyPerField`（executor）と CONTINUOUS collector（`effectEngine`）の**両方**へ同じ式を足した
  （**片方だけ直すと経路で挙動が割れる**）。
- **影響**＝3効果（＋原文が同型の `WX25-P3-063-E2` が拡張採用で1件）。

#### (b) `triggerCondition.notByBattle`（1 finding）

- **真因**＝「このシグニが**バトル以外によって**バニッシュされたとき」（`WXDi-D06-013-E1`・原文1枚）の
  限定が丸ごと落ちて、**バトルバニッシュでも発火**していた。
- 🔴**`byEffect` を流用してはいけない**＝あちらは「効果起因の原因主体がいる」ことを要求するので、
  **ルール処理（パワー0）のバニッシュで発火しなくなる**（原文の「バトル以外」はルール処理も含む）。
  ⇒ 判定は `battleAttackerNum !== undefined`（**バトル経路だけがこれを渡す**）。
- **配線先**＝`collectBanishTriggers` の3箇所（被バニッシュ自身／場 watcher×2）。

---

### ■ 「受け皿は既にあるのに生成側だけが取り残されていた」もの（本命・PLAN §5.2 の実証）

| # | 効果 | 症状（旧） | 受け皿（既存） |
|---|---|---|---|
| 1 | `WDK01-001`〜`004`／`WXK01-001`/`008`/`009`/`010`／`WXEX2-11` | 🔴**【ライド】が丸ごと消えていた**（ルリグ9枚でライドが撃てない） | `STUB{RIDE_ON}`＋`INTERNAL_RIDE_ON_APPLY`（乗機選択・ドライブ判定まで実装済み） |
| 2 | `WXDi-P11-051-E2`／`WXDi-P11-078-E2` | 「このシグニ**と《NAME》1体**を場からトラッシュに置く」の**後半が消え、相方が場に無くても撃てた** | `cost.fieldTrash{filter.cardName, excludeSelf}` |
| 3 | `WDK04-014-E1`／`WDK04-015-E1`／`WXDi-P06-071-E1`／`WXDi-CP01-025-E2`／`WXK03-050-E1` | 「デッキの一番下に置いて**もよい**」が `position:'bottom'`＝**強制の下送り**に化けていた | `split_top_bottom`（振り分けUI・続き742-2 が同じ理由で選んだ受け皿） |
| 4 | `WXK11-028-E1` | 「手札に加えるか**ダウン状態で**場に出す」の `asDown` が場出し枝へ渡っていない＝**アップで出てそのターン殴れた** | `PLACE_SIGNI_ON_FIELD.asDown` |
| 5 | `SP27-003-E1` | 「**アタックフェイズの間、**…トラッシュに置かれたとき」＝**メインでも発火**（`ON_TRASH` のコレクタだけ `duringAttackPhase` を見ていなかった） | `triggerCondition.duringAttackPhase`（他コレクタ6箇所は配線済み） |
| 6 | `WXK01-035-E1-G` | 「**このターンにアタックした**すべてのシグニをバニッシュする」＝**場の全シグニ**が対象 | `TargetFilter.attackedThisTurn` |
| 7 | `WX24-P3-041-E1` | 「【リミットアッパー】1つを**得る**」が汎用の「【K】を得る」に食われ **`GRANT_KEYWORD`（シグニに文字列を付けるだけ）**＝無言 no-op | `STUB{PLACE_LIMIT_UPPER}`（`limit_upper_token`／リミット計算まで実装済み） |
| 8 | `WXDi-CP01-021-E1`／`WXDi-P12-003-E1`／`WX24-P2-038-E1` | 「トラッシュの全カードをデッキに加えてシャッフル**し、**〈後続〉」の**「し、」の右側が丸ごと落ちていた**（16枚ミル／エナチャージ／ライフ追加） | `TRANSFER_TO_DECK{TRASH_CARD, count:'ALL'}` は在った＝**分割していなかっただけ**（原文の継続形は実測9文） |
| 9 | `WDK13-001-E3` | 「シグニゾーンにある**すべての**表向きのカード」が `count:1` | `count:'ALL'` |

🔑**7 と 6 の教訓＝「汎用規則に食われる」形は part1 の先頭で引き取る**。
`【リミットアッパー】１つを得る` は `parseSentencePart3` に受け皿規則が在ったのに、
`parseSentencePart1` の汎用「【K】を得る」が先に当たって届いていなかった（単体で part3 を叩くと正しく通る＝
**規則の有無ではなく到達順の問題**）。§2.0 の「regex の網羅率ではなく、どの規則が先に当たるかで決まる」の再実証。

🔑**parser を直したのに live が変わらないときは3つのバケツを見る**（CLAUDE.md）＝今回も
`_held_fresh`（8枚）と `_idset_fresh`（4枚）で止まっていた。**`_idset_fresh` は `heldReview --adopt` では採用できない**
（MANUAL を巻き込む）ので、**新規 id（`-RIDE`）だけを live へ外科パッチ**した。

---

### ■ 較正（実装済みだったのに OPEN のまま残っていた・9 findings）

`node scripts/archive/semanticAuditRecheck.mjs` の候補30件は**ほぼ全部が真の未修正**だった（LCS だけでは拾えない）。
実際に stale だったのは、**live JSON を1件ずつ読み直して**見つけた次の9件：

- `WXDi-P03-087-E2`（`STUB{FROM_TRASH_TO_CENTER_ZONE}` は**zone[1] 固定で実装済み**）
- `WXK01-035-E1-G`（「このターン終了時」は `INSTALL_DELAYED_TRIGGER{ON_TURN_END}` で実装済み）
- `SPK01-08-E1`（`LOOK_PICK_CHAIN{pick 1→trash, remainder→bottom}`＝3枚下・1枚トラッシュと同値）
- `WD19-007-E1`（`STUB{REMOVE_VIRUS_TARGET_ZONE}` は実装済み）
- `WXK05-035-E2`（下のレベル1/2/3 条件は `AND{THIS_CARD_HAS_UNDER}×3` で実装済み・対象のレベル限定も無い）
- `WX24-P2-036-E1`／`WDA-F02-07-E1`（`count:{$ref:last_processed_count}`＋`levelMultisetFromLastProcessed` で実装済み）
- `WXEX1-38-E1`（`HAND_CARD{blind:true}` で実装済み）
- （`WXK01-035-E1-G` は1効果に finding 2本＝実装1・較正1）

🔑**教訓＝`semanticAuditRecheck.mjs` の LCS 候補と、実際の stale はほぼ重ならなかった。**
続き750 で在庫を払い出した直後なので当然だが、**「候補に出ない stale」は live JSON を読まないと見つからない**。
⇒ **バッチの中で live を開いた効果は、finding の claim をその場で照合し直す**のが安い（今回9件がこれで出た）。

---

### ■ golden（+3本・**反転確認済み**）

- `続き756① TargetFilter.hasUnderCards / hasAttachedOrUnder: 両評価器に配線されている`
  ＝生成側（3効果の JSON）＋ `matchesStateFilter` 6ケース＋ `fieldCandidates` 2ケース。
- `続き756② 【ライド】はキーワードそのものが【起】能力`＝ルリグ9枚に `-RIDE` が在ることを固定。
- `続き756③ この巡で配線した既存受け皿`＝上表 2〜9 ＋ `notByBattle` の engine 実走（バトル/効果の両方向）。

**反転確認**＝`matchesStateFilter` の `hasUnderCards` 分岐と `collectBanishTriggers` の `notByBattle` ゲートを
それぞれ**外すと 2 本が FAIL する**ことを実測した（`PASS 1 / FAIL 2`）＝**素通り（無条件成立）していない**証拠。

**既存 golden の期待値を2本更新**（PLAN §5.2「据置契約は受け皿ができたら反転する／消して通すのは禁止」）：
- `WXK03-050-E1: 外れ札の行き先はデッキの一番下（**任意性は未機構で別契約**）` → **契約の前提が消えた**ので
  `split_top_bottom` へ反転（受け皿は既にあった）。
- `wave2 A3 WDK04-015-E1` の `resumeWave2Look` を2回→**1回**（2ステップを1ステップへ畳んだため）。

**`§6.4 O-42` トリップワイヤが発火**＝`WXDi-P14-033-E1` が parser 出力と実体同一になった
（(8) の連用形分割が追いついたため）。`manualEffects.ts` から削除し、**live の `parseStatus` も `MANUAL`→`AUTO`**
へ直した（`PRESERVE_STATUSES` が効いたままだとその効果にだけ parser 改善が永久に届かない）。

---

### ■ 検証コマンド

```
npm run gates                                    # 全緑（golden 3126 / 0 FAIL）
npm run golden -- --only "続き756"               # 新設3本
node scripts/archive/semanticAuditLedger.mjs     # 残 OPEN 157（187 から -30）
npx tsx scripts/censusManualDrift.ts             # 削除候補 0
npm run regen                                    # 逆翻訳シート再生成（decompiler を触ったため）
```


## 2026-08-31（続き755）：§5.1 実機返済を**残0**へ（`V-94`／`V-96`〜`V-100` の6件）＋真バグ2件

ユーザー指示「残り６件も行う」の1巡。**§5.1 は 6 → 0**。実機シナリオを25本追加し、
**すべて両方向（肯定／対照）**で PASS。過程で engine の真バグを2件見つけて直した。
gates 全緑（typecheck / **golden 3121→3123（+2本）**・0 FAIL / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。
実機シナリオ 612 → **637本**。

### ■ 🔴真因①＝`ON_ATTACK_SIGNI` の遅延トリガーが**二重に積まれ、`attackerFilter` も素通り**していた

`WX25-CP1-085`（薬子サヤ）＝「アタックフェイズ開始時に相手シグニ1体を選び、**このターン黒の＜ブルアカ＞の
シグニがアタックしたとき**その1体に －1000」を実機で撃つと、**－1000 が2回乗り**、しかも
**白の＜ブルアカ＞でアタックしても乗った**。

**真因**＝`collectFieldTriggers` の汎用 `delayed_triggers` ループ（`triggerCollect.ts:4282`）。
あれは **`ON_PLAY`/`ON_BLOOM` の遅延を拾うために続き748 で足した**ものだが、
`ON_ATTACK_SIGNI` まで巻き込んでいた。あのイベントには**専用の対**が既にある：

| コレクタ | 役割 | `attackerOwner` | `attackerFilter` |
|---|---|---|---|
| `collectAttackerSelfDelayedTriggers` | 攻撃側に設置された watcher | `opponent` を読み飛ばす | ✅見る |
| `collectSigniAttackDelayedTriggers` | 防御側 | `self` を読み飛ばす | ✅見る |
| **汎用 `collectFieldTriggers`** | （ON_PLAY 用） | 🔴**見ない** | 🔴**見ない** |

⇒ ①専用コレクタと汎用コレクタの**両方**が積む＝効果が2回走る
②汎用側は `attackerFilter` を見ないので**誰がアタックしても発火する**。
**修正**＝汎用ループは `ON_ATTACK_SIGNI` を読み飛ばす（専用コレクタがあるイベントはそちらに任せる）。

**golden**＝`V-100② ON_ATTACK_SIGNI の遅延は専用コレクタだけが拾う` を追加。
①汎用が0件 ②専用が1件 ③白＜ブルアカ＞では専用も0件 ④**`ON_PLAY` の遅延は引き続き汎用が拾う**（巻き添え防止）
の4点を固定。**読み飛ばしを外すと即 FAIL することを確認済み**。

### ■ 🔴真因②＝`TRANSFER_TO_DECK.position` の `'second'`/`'third'` が**実経路に実装されていなかった**

`WDK09-011-E2`「【ゲート】の正面の相手シグニ1体をデッキの**上から三番目**に置く」が、
実機では**一番上（index 0）**に入っていた。

**真因**＝位置解決が**3箇所に別々に**書かれていた：

| 実装 | 由来 | second/third |
|---|---|---|
| `transferSpecificDeckCard` | `DECK_CARD` | ✅ |
| `insertToDeck` | 場・手札・エナ・トラッシュ・ライフ（7経路の共通入口） | 🔴無し |
| `applyDirectAction` の `TRANSFER_TO_DECK` | **SELECT_TARGET を挟む経路** | 🔴無し |

3つ目のコメントには「execTransferToDeck の insertToDeck と同じ配置ロジック」と書いてあったが**ドリフトしていた**。
**SELECT_TARGET を挟む効果は必ず3つ目を通る**ので、あのカードは実質どこにも実装が無かった。
⇒ `deckInsertIndex` / `deckInsertPosJa` を module レベルに切り出し、**3箇所すべてをそこへ寄せた**。

**golden**＝`V-100③ TRANSFER_TO_DECK: 場のシグニでも top/second/third/bottom が位置どおりに入る` を追加。
**既定（position 無し）＝一番上**も同時に固定（ここが動くと大量の既存効果が壊れるため）。

⚠**枚数はどの位置でも同じ**＝この種のバグは**順序を見る計器**が無いと永久に気づけない。
デッキの中身を全部別 id にして index で見るのが唯一の検出法。

### ■ 返済した6件（25シナリオ・すべて両方向）

| 項目 | 見たもの | シナリオ |
|---|---|---|
| `V-100`① | `hasSoul` × `triggerStateFilterOk`（ソウル付き/無しでミル） | `censusSoulAttackerMill` / `…NoSoulNoop` |
| `V-100`② | `attackerFilter` の色 ＋ 設置時対象の焼き込み | `censusDelayedAttackerFilterFires` / `…ColorNoop` |
| `V-100`③ | `position:'third'` ＋【ゲート】正面限定 | `censusTransferToDeckThird` |
| `V-100`④ | `ActiveCondition` の `ZONE_SUM_COUNT`（赤1枚で崩れる） | `censusZoneSumActiveGranted` / `…Broken` |
| `V-100`⑤ | `distinctBy:'name'`（同じ5枚でも2種類なら不成立） | `censusDistinctByNameMet` / `…SameName` |
| `V-99`① | `ZONE_SUM_COUNT` の **3+4=7**（AND 近似では通らない配分） | `censusZoneSumDisona7` / `…Disona6` |
| `V-99`② | ターン終了時の遅延対象の焼き込み（発火時の候補が1件） | `censusDelayedTurnEndStoredTarget` |
| `V-99`③ | 4択アップキープの「センタールリグの下から1枚」 | `censusUpkeepTrashUnderLrig` |
| `V-98`① | `THIS_CARD_HAS_UNDER{lrig}` の**2段閾値**（4/5/7枚） | `censusLrigUnder4Noop` / `…5Charge` / `…7Lancer` |
| `V-98`② | `FIELD_ATTACHED_COUNT{under}` | `censusFieldUnderCharge` / `…Noop` |
| `V-98`③ | `CENTER_LRIG_ATTACKED_THIS_TURN{negate}` | `censusLrigNotAttackedCharge` / `censusLrigAttackedNoop` |
| `V-97` | `cost.beat_signi{excludeSelf}` ＋ `BEAT_CONDITION`「4枚以下」 | `censusBeatSigniCostPay` / `…Blocked` |
| `V-96` | `EffectCost.fieldExileSelf`（トラッシュではなく `excluded` へ） | `censusFieldExileSelfCost` |
| `V-94` | `SUPPRESS_GAIN_ABILITY`（相手の付与が通らない） | `censusSuppressGainAbility` / `…Control` |

■**`V-99`②は登録票の `WXDi-CP02-043`（アシストルリグ）ではなく同一機構の `WXDi-P12-006`（ルリグ【自】）で踏んだ。**
アシストの【出】は UI 経路が別で本筋（焼き込み）から遠く、ルリグ【自】なら同じ
`SELECT_TARGET_ONLY → STORE → INSTALL_DELAYED_TRIGGER{ON_TURN_END, targetsStored}` を安く通せる。

■**`V-94` の「相手が付与を試みる」は `oppArtsStack` で作った**（`O-113` と同じ注入）。
対照（①を選ぶ）で**付与が普通に通る**ことまで見ているので、③側の PASS が
「そもそも付与が来ていないだけ」ではないことを担保している。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`opp_field` の候補は表示時に反転する**（`EffectInteractionModal.tsx:214`＝「相手シグニ選択時はゾーン3→2→1の順」）。
   つまり **`pick-0` は DB 候補の末尾**。`cands[0]` と読むと「選んだのと違う1体に乗った」と**誤って赤を出す**。
2. 🔴**`field.lrig_attacked` と `lrig_has_attacked` は別物。**
   `CENTER_LRIG_ATTACKED_THIS_TURN` が読むのは後者（`execUtils.ts:2464`）。前者は「ルリグアタック解決中」の印で、
   盤面注入で立てると**ガード応答窓が開いてフェイズ送りボタンごと消える**（22ティック空振りした）。
3. 🔴**【出】にコストが付くカードは、コストを払うまで配置が DB へ書かれない**（React 側の `placedState` が持つ）。
   `placed`（DB 反映）を操作の前提にすると**コストモーダルが開いたまま永久に待つ**。
4. 🔴**CHOOSE のボタン名は `選択肢N` とは限らない**＝JSON の `label` をそのまま出すカードがある
   （`WXDi-P12-006` は「相手のシグニ1体をこのターン終了時にデッキの一番下へ」）。
5. 🔴**フェイズ送りボタンは1種類ではない**（`uiConstants.PHASE_BTN`）＝ATTACK_SIGNI は「ルリグアタックへ」／
   ATTACK_LRIG は「エンドフェイズへ」／END は「ターン終了」。さらに ATTACK_SIGNI は送りボタンが出ないことがあるので、
   **ターン終了の解決だけを見たいなら END へ patch して「ターン終了」を押す**。
6. 🔴**`img[alt]` の枚数で「候補に出たか」を測らない**＝同じカード名の画像は手札・配置プレビュー・
   モーダルヘッダにも出る。`excludeSelf` は**結果**（自分が場に残っているか）で見る。
7. 🔴**対照が「そもそも操作できなかった」で PASS しないようにする**＝`V-97` の5枚側は
   「場には出たうえで【出】だけが成立しない」ことを明示的に assert した（初版は召喚失敗でも緑になっていた）。

### ■ 追加した観測点

`queryState` に3つ追加＝**`fieldSoul`**（【ソウル】の付き方）／**`lrigHasAttacked`**（このターンにルリグがアタックしたか。
`field.lrig_attacked` と別物）／**`beatZone`**（【ビート】ゾーンの中身）。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusSoulAttackerMill censusSoulAttackerNoSoulNoop \
  censusDelayedAttackerFilterFires censusDelayedAttackerFilterColorNoop censusTransferToDeckThird \
  censusZoneSumActiveGranted censusZoneSumActiveBroken censusDistinctByNameMet censusDistinctByNameSameName \
  censusZoneSumDisona7 censusZoneSumDisona6 censusDelayedTurnEndStoredTarget censusUpkeepTrashUnderLrig
node scripts/verifyBattleDrive.mjs censusLrigUnder4Noop censusLrigUnder5Charge censusLrigUnder7Lancer \
  censusFieldUnderCharge censusFieldUnderNoop censusLrigNotAttackedCharge censusLrigAttackedNoop \
  censusBeatSigniCostPay censusBeatSigniCostBlocked censusFieldExileSelfCost \
  censusSuppressGainAbility censusSuppressGainAbilityControl
npm run golden -- --only "V-100"
npm run gates
```

## 2026-08-31（続き754）：§5.1 実機返済 7 → 6 件（`V-101` クローズ）＋ **手札捨て台帳の真バグを10箇所修正**

ユーザー指示「実機検証を続ける」の1巡。**`V-101`①②③ を実機5シナリオ（すべて両方向）で返済**し、
その過程で**「このターン手札から捨てた」台帳の書き漏れ**という真バグを見つけて直した。
gates 全緑（typecheck / **golden 3119→3121（+2本）・0 FAIL** / smoke 全0 / fuzz 全0 / census 12 /
census-stubs A🔴0・C0 / manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ 🔴真因（症状ではなく）＝`turn_hand_discarded_cards` を書く支払い地点が3種類あった

`HAND_DISCARDED_THIS_TURN{filter}`（`effectEngine.ts:871` / `:1363` ／ `execUtils.ts:2336`）は
**枚数カウンタではなく実体リスト（`turn_hand_discarded_cards`）を絞って数える**。
ところがコストで手札を捨てる地点は10箇所あり、実装が**3種類に割れていた**：

| 支払い地点 | 旧 `turn_hand_discarded_count` | 旧 `turn_hand_discarded_cards` |
|---|---|---|
| アーツ使用（`performArts`） | ✅ | ✅ |
| スペル使用・**ルリグデッキから** | ✅ | ✅ |
| スペル使用・**手札から** | ✅ | 🔴**無し** |
| シグニ【出】コスト（`executeSigniOnPlayCost`） | 🔴無し | 🔴無し |
| シグニ【起】／ルリグ【起】／キー【起】／アシスト【起】／トラッシュ【起】／ガードシグニ捨て | 🔴無し | 🔴無し |

⇒ **その経路で捨てた turn は条件が永久に false**（無言 no-op）。
とくにスペルの2枝は**同じ関数の中で片方だけ実体を落としていた**ので、
「ルリグデッキから使うと効くのに手札から使うと効かない」という再現しにくい形になっていた。

**実機での再現**＝`WXDi-CP02-055`（猫塚ヒビキ）は1枚で両側を持つ：
E3【出】が手札から＜ブルアカ＞2枚を捨て、E2【自】アタック時がその履歴を読む。
修正前は **`捨て履歴=[] 捨て枚数=0`**（＝【出】のコストで2枚捨てた直後）で、アタックしても相手の手札は減らなかった。

### ■ 直し方＝**唯一の入口**を作って10箇所から呼ぶ

`src/screens/battle/costs.ts` に `handDiscardHistoryRecord(prev, discarded)` を新設し、
**枚数と実体を必ず同時に**積むようにした。既に両方書いていたアーツ／スペル(ルリグデッキ)枝も
この関数へ寄せて、**書き方が分岐する余地を消した**。

⚠**「捨てる」以外を渡さない**＝`handToEnergy`（エナへ）／`handToUnder`（このシグニの下へ）／
`energyTrash`（エナから）は手札を捨てていないので台帳に載せない。各呼び出し地点でコメントを添えた。
⚠**ターン終了時のルール処理（手札上限超過）は通していない**＝あの捨ては `turn_*` がリセットされる
境界と同じ地点で起きるので、載せると寿命が1ティックの値になる（意図的な除外・ヘルパーの JSDoc に明記）。

### ■ golden（+2本）＝**片方だけ書く形を機械で禁止**

- `V-101② handDiscardHistoryRecord: 枚数と実体を必ず同時に積む` … 空配列で何も動かない／初回／追記の3段に加え、
  **不変条件「枚数 === 実体の長さ」**を全状態で assert（旧バグはここが 2 対 0 に割れていた）。
- `V-101② HAND_DISCARDED_THIS_TURN は実体を絞って数える` … ＜ブルアカ＞／非ブルアカ／空 の3方向を `evalCondition` で実走。

### ■ `V-101` の実機5シナリオ（すべて両方向・全 PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusAcceFromEnergy` | `WX22-Re02` | 段1（`targetScope:'self_energy'`）の候補が＜調理＞《アクセアイコン》の**1件だけ**／選ぶとエナから消えて【アクセ】へ |
| `censusHandDiscardedBuruakaFires` | `WXDi-CP02-055` | 【出】コストで＜ブルアカ＞2枚を捨てる → アタック時に相手の手札 2→1 |
| `censusHandDiscardedOtherClassNoop` | 同上 | 対照＝捨てたのが＜ブルアカ＞でなければ発動しない（手札 2→2） |
| `censusDelayedPlacedByEffectFires` | `WXDi-P09-010` | 効果（【起】トラッシュから場に出す）で配置 → 遅延トリガー発火で相手に －8000 |
| `censusDelayedPlacedBySummonNoop` | 同上 | 対照＝手札からの通常召喚では発火しない（`placedByEffect` の弁別） |

■**`ATTACH_ACCE.fromEnergy` と `placedByEffect` は engine 側が正しかった**＝実機で炙って両方向とも期待どおり。
実装の穴が出たのは②だけで、**そこは engine ではなく UI の支払い地点**だった（＝golden/smoke/fuzz が届かない層）。

### ■ 実機ドライバで踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**`H.clickTextOrBtn` は `isEnabled` を検査しない。**
   disabled の「発動」を毎ティック押して `'btn:発動'` を返し続け、**30ティック空振りしても「押せている」ように見える**。
   ⇒ **可否のあるボタンは `H.clickBtn(name, {exact:true})`**（あちらは isEnabled を見る）。ドライバ自身のコメントが
   「disabled のまま押して『クリックした風だが進まない』」を2大罠として警告しているのに、その罠に落ちた。
2. 🔴**ルリグ【起】のボタン名は効果本文ではなく支払い要約**＝実測で `【起】エナ2` と `【起】コストなし` の2件だけ。
   「効果によって」「トラッシュから」といった本文で選び分けようとすると**1つも押せない**。
3. 🔴**`SELECT_SIGNI_ZONE`（効果で場に出すときの配置先）は `ゾーンN` ボタン**で、通常召喚の `summon-zone-N`（testid）
   とは**別の窓**。片方だけ書くと `pEff=SELECT_SIGNI_ZONE` で止まる。
4. 🔴**対象選択（`pick-0`）は「決定」より先に置く。** 逆順だと毎ティック「決定 (0/1)」を押しに行って pick へ到達せず、
   `pEff=SELECT_TARGET` のまま空回りする。
5. **解決待ちの窓が開いている間はルリグ/カードを触らない**（裏でカード詳細が開いて操作を食う）。
6. **ルリグ【起】のコストUIに testid は無い**＝エナ札は `<img alt={CardName}>` を包む div の onClick なので
   **カード名で掴む**。モーダル外の同名カードはオーバーレイに覆われて click が通らないので、
   `force` を付けずに順に試し、通ったものだけを支払いとして数える。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs censusAcceFromEnergy censusHandDiscardedBuruakaFires \
  censusHandDiscardedOtherClassNoop censusDelayedPlacedByEffectFires censusDelayedPlacedBySummonNoop
npm run golden -- --only "V-101②"
npm run gates
```

## 2026-08-31（続き753）：§5.1 実機返済を 10 → 7 件（`V-93` / `V-95` / `V-102` をクローズ）

ユーザー指示「§5.1【最優先】実機未検証の返済」の1巡。**`src/` は1バイトも触っていない**＝変更は
`scripts/verifyBattleDrive.mjs`（ドライバのフレーク修正＋観測点1つ＋新規シナリオ3本）と docs のみ。
gates 全緑（typecheck / golden 3119・0 FAIL / smoke 全0 / fuzz 全0 / census 12 / census-stubs A🔴0・C0 /
manual-fields 0 / census-enginetext A🔴130行 据置 / lint 0 errors）。

### ■ `V-93`＝**engine のバグではなく、実機ドライバのフレークだった**

`wx17040ConditionsTrueExecuteAll` / `wx17040ConditionsFalseNoop`（`WX17-040-E1`＝「以下の3つから3つまで選ぶ」）。
**単独 → 単独 → 連続2本の計4回すべて PASS**（9秒／6秒）。live JSON も逆翻訳も原文と一致したままで、
engine・parser には手を入れていない。

**真因**＝ドライバが**「クリックしたこと」を進行条件にしていた**こと。

```js
await c1.click().catch(() => {});
await c2.click().catch(() => {});
await c3.click().catch(() => {});
did = 'click:選択肢1+2+3'; picked = true;   // ← 押せたかを一度も測っていない
```

`multiSelect` の CHOOSE は1クリックごとに React が再描画する（`EffectInteractionModal.tsx:640` の
`selectedMultiChoiceIds` が更新され、選択済みのラベルが `選択肢N` → `✓ 選択肢N` に変わる）。
続けて押すと直後の locator が **detach 済みの要素を掴んで throw** しうるが、`.catch(() => {})` が
それを握り潰すので、**2つしか選ばれていないまま `picked = true` になって「決定」へ進む**。
`upTo` の確定ボタンは常に enabled なので**そのまま確定できてしまい**、後段の観測（バニッシュ／エナチャージ）
だけが空振りする＝**実行ごとに停止段階が変わる**という記録どおりの症状になる。

**直し方**＝選択済みラベル `✓ 選択肢N` を進行条件にした。1つずつ押して ✓ が付いたことを確かめ、
**3つ揃うまで `picked` を立てない**（`FalseNoop` の③も同じく ✓ 確認へ）。揃わなければ次ティックで押し直す。

🔑**教訓＝実機ドライバでは「押した」ではなく「盤面/DOM が変わった」を進行条件にする。**
`.catch(() => {})` を置いた行は**必ず次の行で「効いたか」を測る**。黙って半端な状態で先へ進むのが最悪の形で、
これは engine のバグと見分けが付かない赤を出し続ける。

### ■ `V-95`＝**書いてあったシナリオを回すだけ**（`HAS_TRAP_IN_FIELD`）

`node scripts/verifyBattleDrive.mjs censusHasTrapInField` → **PASS（9秒）**。
手札 2→1（トラップ無しは不発）→ トラップを `patchPlayerState` で設置してもう1枚召喚 → DRAW で1 の反転確認。
PLAN に書かれていた「Playwright Chromium 未導入／外部認証で timeout」は**既に古い記述**だった（続き747 で解消済み）。

🔑**「ドライバは書いてあるが未実走」の在庫は実装より圧倒的に安い。§5.1 に来たらまず全部回す。**

### ■ `V-102`＝新規シナリオ3本（4方向すべて PASS）

| シナリオ | カード | 見たもの |
|---|---|---|
| `censusSelfCrashToTrashRefill` | `WD06-009` | 自ライフのクラッシュ置換（トラッシュ＋デッキ上を補填）と**回数制**の反転 |
| `censusSideAttackLancerFires` | `WXEX2-71` | 正面以外へアタック→そのシグニが【ランサー】を得る→相手ライフ−1 |
| `censusSideAttackLancerFrontNoop` | `WXEX2-71` | 対照＝正面へアタックすると付かない |

③（`ON_ACCE` のトリガー元）は続き748 で返済済みなので含めていない。

**なぜ実機でしか見えないか**＝
- `SELF_CRASH_TO_TRASH_AND_REFILL` は engine（`execStubPart3.ts:989`）が**カウンタを積むだけ**で、
  置換そのものは `BattleScreen.performLifeBurstResponse`（`BattleScreen.tsx:12644` 付近）の**1点にしかない**。
  golden / smoke / fuzz はこの経路を1行も通らない。
- `triggerCondition.attackedNotFront` は `triggerCollect.ts:4280` で **fail-closed**＝`sideAttack` を渡さない
  収集経路では永久に発火しない。渡しているのは `BattleScreen.tsx:8942` の
  `collectFieldTriggers('ON_ATTACK_SIGNI', …, { sideAttack: isSideAttack })` **1箇所だけ**。

**観測結果**（`censusSelfCrashToTrashRefill`）：
- 対照（残0）＝割った札 `WD01-013#9323` は**エナへ**・life 3→2・deck 3のまま。
- 置換あり（残1）＝**同じ操作**で割った札 `#9322` が**トラッシュへ**・デッキ上 `#9331` がライフ末尾へ・deck 3→2・残回数 1→0。

**観測結果**（`censusSideAttackLancer*`）：
- 側面（host zone0 → opp zone1）＝`keyword_grants` が `側面アタック` → `側面アタック/ランサー` になり、
  バトルバニッシュで**相手ライフ 3→2**（付与が読まれていることまで確認）。
- 正面（host zone0 → opp zone2）＝**付かず**、バニッシュしても相手ライフは 3 のまま。

### ■ シナリオを書くときに踏んだ罠（次の人が同じ時間を払わないために）

1. 🔴**盤面注入で「召喚ボタンが出ない」ときは、まずルリグ限定を疑う。**
   `getMyHandCardActions`（`BattleScreen.tsx:8298`）が `meetsRestriction(cardData.Restriction, lrigClass)` を見るので、
   **エルドラ限定の `WD06-009` は あや のルリグ（`WX22-009`）では召喚できない**。
   症状は「**盤面注入は成功しているのに操作が1手も始まらない**」＝30ティック空振り。
   ⇒ ルリグを `WD06-001`（エルドラ Lv4・Limit11）へ替えて解決。
2. 🔴**回数制の置換は「同じ札・同じ操作で1ビットだけ反転」して測る。**
   チェックゾーンは**クリック待ちで止まる**ので、そこで `self_crash_to_trash_and_refill` を 1→0 に patch してから
   同じ「エナに送る」を押せば、**経路を1本も変えずに**対照が取れる。
   ⚠**別カードで反転しようとしない**＝素の自ライフクラッシュはたいてい `triggerBurst:false` で、
   あれは `execLifeCrash` の else 枝で**直接トラッシュへ**行く（チェックゾーンを通らない別経路）＝比較にならない。
   ⚠**ルリグ限定が違うカードも使えない**（1と同じ理由）。
3. 🔴**patch のあとを固定 sleep で済ませない。**
   realtime 反映前にボタンを押すと**対照のつもりで置換つきを踏み、「置換が無条件に乗っている」と赤を誤報する**（初版がこれ）。
   ⇒ **patch した値を `queryState` で観測してから**次へ進む（最大12回・500ms ポーリング）。
4. **手札モーダルを「1回開けば開いたまま」と仮定しない。**
   毎ティック「召喚ボタンが見えているか」を測り、見えていなければ手札札を押し直す（`censusAcceSelfPlayGate` と同型）。

### ■ 追加した観測点

`queryState` の `sideOf` に **`selfCrashRefill`**（`self_crash_to_trash_and_refill`）を追加。
置換は回数制なので、「2回目に乗らない」を盤面差分だけで言うと**「そもそも1回目も乗っていない」と区別が付かない**＝
カウンタ自体を観測点にした。

### ■ 直していない粗（挙動バグではないので §5.3 には登録しない）

チェックゾーンのボタンは置換が乗っていても **「エナに送る」のまま**（実際はトラッシュ＋ライフ補填）。
**ラベルを変えると 158 シナリオがアクセシブル名でこのボタンを掴んでいる**ので触っていない。
直すなら「ラベル変更＋ドライバ側の名前を一斉に追随」を1巡で通すこと。

### ■ 再現手段

```
node scripts/verifyBattleDrive.mjs wx17040ConditionsTrueExecuteAll wx17040ConditionsFalseNoop
node scripts/verifyBattleDrive.mjs censusHasTrapInField
node scripts/verifyBattleDrive.mjs censusSelfCrashToTrashRefill
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFires
node scripts/verifyBattleDrive.mjs censusSideAttackLancerFrontNoop
```
