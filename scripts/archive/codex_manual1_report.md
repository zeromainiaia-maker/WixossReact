# PLAN §5.3 manual1 実施報告（7効果・4群）

- 実施日: 2026-08-29
- 投入時 HEAD: `f391b4f98`
- 方針: parser / engine / screens を変更せず、CSV原文と既存consumerを照合して manual 速いレーンで修正
- 結果: 対象7効果を採用、見送り0。`npm run gates` 全緑（golden 2995/2995）。commit / push / PLAN簿記は未実施。

## 1. 触ったファイルと理由

### 実装・テスト

- `src/data/manualEffects.ts` — A〜Cの5効果を完全overrideし、D1の`WX24-P2-049-E2`を【自】へ差し替え、D2の`WXDi-P13-050-E1b` shadowを削除。
- `scripts/goldenTest.ts` — 7効果それぞれにfresh＋manual由来のgoldenを1本追加し、既存O-149参照・ラチェットを実測へ更新。
- `scripts/fixLrigColorFilters.mjs` — 廃止した`WX24-P2-049-E1b`への後処理エントリを削除。
- `scripts/vocabCensus.ts` — MANUAL免除で動いた高シグナル基準を518→517へ更新（前進ではなく不可視化と明記、旧値を残した）。

### live JSON（`syncManualLive` / `build:effects`生成、すべて1行minify）

- `public/data/effects_WX.json` — `WXEX1-16-E2`。
- `public/data/effects_WXK.json` — `WXK07-002-E1` / `WXK10-024-E3`。
- `public/data/effects_WX24_26.json` — `WX24-P2-009-E1` / `WX24-P2-049`の正規id集合。
- `public/data/effects_WXDi.json` — `WXDi-P03-087-E2` / `WXDi-P13-050`の正規id集合。

### 再生成物

- `docs/decompile_sheet3.txt`, `decompile_sheet4.txt`, `decompile_sheet7.txt`, `decompile_sheet8.txt`, `decompile_sheet9.txt` — 対象効果の逆翻訳更新。
- `docs/grouped_sentence_all.txt` — `npm run regen`下流再生成。
- `docs/_effect_srctext.json`, `_srctext_align.txt` — 正規id集合に対応する原文位置合わせを再生成。
- `docs/_idset_fresh.json`, `_partial_fresh.json`, `_manual_drift.txt` — 群D解消後のfresh帳票。
- `docs/_held_review.txt` — 報告直前のheldReview再生成。
- `docs/_vocab_census.txt`, `_census_stubs.txt`, `_census_enginetext.txt` — 最終gate計器出力。

### 一時ファイル

- `tmp_fresh.ts` — BOM除去、CSVカード数、fresh / merged / liveの再実測用（gitignore圏内）。
- `tmp_codex_manual1_report.md` — 本報告（gitignore圏内）。

`docs/PLAN.md`, `docs/PLAN_PROGRESS.md`, `stage2_closed.txt`, parser, engine, screens は触っていない。

## 2. 調査結果（真因の再実測）

CSVは各ファイル先頭のBOMを除去して読み込み、カード総数 **6712** を確認した。

### `WX24-P2-049`

- fresh id集合は `E1 / E2 / E3 / BURST`、旧liveは `E1 / E1b / E2 / BURST`。指示書の真因訂正と一致。
- fresh `E2`はバトルによるバニッシュ節を`UNKNOWN`に落としており、fresh `E3`は`REVEAL_AND_PICK`、`pickUpTo:true`、`remainder.reorder:true`を持つ正しい【出】。
- ただしメモとの差が1点あった。fresh `E2.timing`の実測は`ON_SIGNI_BANISH_OPPONENT`であり、`ON_SIGNI_BANISH_BATTLE`ではなかった。したがってmanual `E2`では原文どおり後者を明示した。
- 旧manual `E2`が【出】を上書きし、旧`E1b`が【自】をshadowとして補っていた。`E2`を【自】へ差し替え、【出】はparser `E3`へ任せる修正が正しい。

### `WXDi-P13-050`

- fresh id集合は `E1 / E2 / BURST`、旧liveは `E1 / E1b / BURST`。指示書と一致。
- fresh `E2`はtop-level `condition:{type:'HAS_CARD_IN_FIELD', owner:'self', filter:{cardName:'コード・ピルルク・極'}}`を保持し、`pickUpTo`なし。
- 原文は「スペル1枚を公開し手札に加え」で「まで」がないため、旧shadowの`pickUpTo:true`は不正。parser `E2`を採用し、`E1b`を削除した。

### consumer本体の確認

- `TargetFilter.keyword`は`execUtils.ts`の実装でstring/arrayを配列化して評価し、配列はOR。
- `cardType:'レゾナ'`はレゾナだけ、`cardType:'シグニ'`はレゾナも含む非対称実装を確認。
- `deltaFromZone`は`resolveCountRef`で先にdeltaを解決し、その値を`splitTotal`分岐が総量として使用。総量0はno-op。
- 汎用`ADD_TO_FIELD`は最初の空きzoneへ置く一方、`FROM_TRASH_TO_CENTER_ZONE`は`zone[1]`へ置き、既存中央シグニをエナへ送る。
- `POWER_PLUS_BANISHED_POWER`は構造化payloadのtarget・durationを実際に消費する。

## 3. 採用した効果の全件

### A1 `WXK10-024-E3`

- 原文該当節: `【自】：あなたのアタックフェイズ開始時、あなたの【ダブルクラッシュ】を持つ赤のシグニ１体を対象とし、ターン終了時まで、それは【アサシン】を得る。`
- 生成JSON: `{"effectId":"WXK10-024-E3","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"赤","keyword":"ダブルクラッシュ"},"explicitTarget":true},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}`
- 逆翻訳全文: `WXK10-024-E3: 【自】あなたのアタックフェイズ開始時：あなたの《赤》の【ダブルクラッシュ】を持つシグニ1体に【アサシン】を与える（ターン終了時まで）`
- 原文一致: **Yes（意味一致）**。対象側の【ダブルクラッシュ】と付与側の【アサシン】が分離されている。
- 検討して外した慣例: 旧`keyword:'ダブルクラッシュ'`は対象条件を付与能力へ誤配置しているため不可。対象修飾はconsumerのある`target.filter.keyword`を採用。

### A2 `WXK07-002-E1` 選択肢②

- 原文該当節: `②【アサシン】か【ダブルクラッシュ】を持つシグニ１体を対象とし、それをバニッシュする。`
- 生成JSON: `{"effectId":"WXK07-002-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"緑","count":3},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_CENTER_LRIG"},{"type":"CHOOSE","choose_count":2,"from_count":4,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":12000}},"upToCount":false}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","keyword":["アサシン","ダブルクラッシュ"]},"upToCount":false}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"color":"緑"},"pickCount":"ALL","pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}},{"choiceId":"c3","label":"選択肢4","action":{"type":"PREVENT_NEXT_DAMAGE","count":1}}],"upTo":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}`
- 逆翻訳全文: `WXK07-002-E1: 【起】（メイン起動）/（アタックフェイズ起動）：〈《緑×3》《無×1》〉あなたのセンタールリグが＜メル＞の場合、このアーツの使用コストは《緑×2》減る。そして以下の4つから2つまで選ぶ【対戦相手のパワー12000以上のシグニ1体をバニッシュする / 自分または対戦相手の【アサシン】か【ダブルクラッシュ】を持つシグニ1体をバニッシュする / あなたのデッキ上3枚を公開し、その中から《緑》のカードをすべて手札に加える、残りを好きな順番でデッキの一番下に置く / このターン、次の1回のダメージを受けない】`
- 原文一致: **Yes（意味一致）**。無指定ownerは`any`、能力配列はOR。
- 検討して外した慣例: `anyOf`による異種条件分岐は不要。同一`keyword`キーの配列ORをconsumerが直接扱うため、無条件filterやAND相当の別構造は採らない。

### A3 `WXEX1-16-E2`

- 原文該当節: `【起】《アタックフェイズアイコン》《コインアイコン》：あなたのレゾナ１体を対象とし、ターン終了時まで、それは「【常】：バニッシュされない。」を得る。`
- 生成JSON: `{"effectId":"WXEX1-16-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"レゾナ"}},"keyword":"バニッシュされない","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}`
- 逆翻訳全文: `WXEX1-16-E2: 【起】（アタックフェイズ起動）：〈コイン1〉あなたのレゾナ1体に【バニッシュされない】を与える（ターン終了時まで）`
- 原文一致: **Yes（意味一致）**。
- 検討して外した慣例: `target.type:'LRIG'`はレゾナの実体と不一致。`SIGNI`だけでは非レゾナも通すため、`filter.cardType:'レゾナ'`を併用。

### B `WX24-P2-009-E1`

- 原文該当節: `その後、対戦相手のシグニを好きな数対象とし、ターン終了時まで、それらのパワーを合計であなたのトラッシュにあるカード１枚につき－1000する。この効果では1000単位でしか数字を割り振れない。`
- 生成JSON: `{"effectId":"WX24-P2-009-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":3,"optional":true},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}},"delta":-1000,"deltaFromZone":{"zone":"trash","owner":"self","per":-1000},"splitTotal":{"unit":1000},"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"RULE_REMINDER_TEXT"},{"type":"RECOLLECT_GATE","minArts":4},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","colorMatchesLrig":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}`
- 逆翻訳全文: `WX24-P2-009-E1: 【起】（メイン起動）：〈《黒×1》〉あなたのデッキの上から3枚トラッシュに置いてもよい。そして対戦相手のシグニを好きな数対象とし、それらのパワーを合わせて－1000する（1000単位で割り振る）。そして（リコレクト：ルリグトラッシュのアーツが4枚以上ある場合のみ以下を行う）。そしてあなたのセンタールリグと共通色のシグニ(トラッシュ)2枚までを手札に加える`
- 原文一致: **No（逆翻訳文の厳密比較）**。逆翻訳器が`deltaFromZone`を文へ展開せず、「トラッシュ1枚につき」を欠落して固定－1000と表示する。ただし生成JSONとE2Eではトラッシュ5枚→総量－5000、0枚→no-opを確認済み。
- 検討して外した慣例: 裸`STUB{POWER_MOD_PER_COUNT}`は無言no-op。`delta:{$ref}`は`resolveNum`で0になる。既存4件と同じ`deltaFromZone + splitTotal`を採用。

### C `WXDi-P03-087-E2`

- 原文該当節: `【起】手札を２枚捨てる：このカードをトラッシュから中央のシグニゾーンに出す。（この能力はこのカードがトラッシュにある場合にしか使用できない）`
- 生成JSON: `{"effectId":"WXDi-P03-087-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"discard":2},"action":{"type":"STUB","id":"FROM_TRASH_TO_CENTER_ZONE"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","trashActivated":true}`
- 逆翻訳全文: `WXDi-P03-087-E2: 【起】（メイン起動）：〈手札2枚を捨てる〉[STUB:トラッシュからカードを中央シグニゾーン（zone[1]）に出す]`
- 原文一致: **No（文全体の厳密比較）**。中央zoneは表示されるが、「このカード」とトラッシュ時のみの括弧書きが逆翻訳に出ない。JSONの`trashActivated:true`と`ctx.sourceCardNum`を使うhandler、E2Eで両方の挙動を確認済み。
- 検討して外した慣例: 汎用`ADD_TO_FIELD`は最初の空きzoneへ出すため不可。実装済みの中央専用STUBだけが原文を満たす。

### D1 `WX24-P2-049-E2`

- 原文該当節: `【自】：このシグニがバトルによってシグニ１体をバニッシュしたとき、あなたの白のシグニ１体を対象とし、次の対戦相手のターン終了時まで、それのパワーをそのバニッシュしたシグニのパワーと同じだけ＋（プラス）する。`
- 生成JSON: `{"effectId":"WX24-P2-049-E2","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"action":{"type":"STUB","id":"POWER_PLUS_BANISHED_POWER","powerPlusBanishedPower":{"target":{"type":"SIGNI","owner":"self","count":1,"filter":{"color":"白"}},"duration":"UNTIL_OPP_TURN_END"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}`
- 逆翻訳全文: `WX24-P2-049-E2: 【自】このシグニがバトルで対戦相手のシグニをバニッシュしたとき：[STUB:対象のパワーを、そのバニッシュしたシグニのパワーぶん＋する]`
- 原文一致: **No（逆翻訳文の厳密比較）**。STUB表示が白対象と次の対戦相手ターン終了までを省略する。構造化payloadとhandlerのE2E既存goldenでは両フィールドが消費される。
- 検討して外した慣例: `E1b` shadow維持はid集合を凍結するため不可。parser `E2`の`UNKNOWN`もタイミングが広くaction未実装なので、正規`E2`をmanual完全置換した。

### D2 `WXDi-P13-050-E2`

- 原文該当節: `【出】：あなたの場に《コード・ピルルク・極》がいる場合、あなたのデッキの上からカードを５枚見る。その中からスペル１枚を公開し手札に加え、残りを好きな順番でデッキの一番下に置く。`
- 生成JSON: `{"effectId":"WXDi-P13-050-E2","effectType":"AUTO","timing":["ON_PLAY"],"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"コード・ピルルク・極"}},"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"スペル"},"pickCount":1,"pickNoun":"スペル","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}`
- 逆翻訳全文: `WXDi-P13-050-E2: 【自】このシグニが場に出たとき：あなたの場に《コード・ピルルク・極》がいる場合、あなたのデッキ上5枚を公開し、その中からスペルを1枚手札に加える、残りを好きな順番でデッキの一番下に置く`
- 原文一致: **No（表記の厳密比較）**。内部の`AUTO + ON_PLAY`を逆翻訳器が【自】と表示し、「見る／選んだ1枚を公開」を一括の「5枚を公開」と表示する。既存のcanonical `REVEAL_AND_PICK`表現として、在場条件・必須1枚・残りの並べ替えは原文どおり。
- 検討して外した慣例: 旧shadowの`activeCondition`と`pickUpTo:true`はそれぞれ条件の適用経路と「まで」なしの原文に不適合。parser `condition`＋必須pickを採用しmanualは削除。

## 4. 見送った効果と、やらなかったこと

- 今回指定された7効果の見送りは **0件**。
- `PR-K026-E1`（O-151(a)）およびparserのnarrow catch-all撤去はスコープ外のため未実施。
- `WXDi-P14-068`（O-94②、通常召喚UIの配置制限）はscreensを触る遅いレーンのため未実施。
- `WXDi-P03-087`のparser優先順位（汎用トラッシュ→場が中央専用規則より先に返す問題）は未修正。**O-94①はmanualで閉じただけで、parser側は未修正**。
- parser / engine / screens / PLAN / PLAN_PROGRESS / stage2_closed / BUGFIXES は変更していない。
- commit / push、他カードのheld採用、findingsのcloseはしていない。

## 5. 条件以外で見つけた原文との食い違い

- `WX24-P2-049-E1`は群Dのcard同期時にfresh改善も届いた。旧liveは【常】【シュート】なのに対象`thisCardOnly`がなく、action内durationが`UNTIL_END_OF_TURN`だった。新liveは`filter:{thisCardOnly:true}`かつ`PERMANENT`で原文に一致。既存Sheet1 B2 goldenへ正例として追加した。
- `WXDi-P13-050-E1`は同期でJSONキー順だけ変化し、leaf値・意味は不変。
- B/C/D1/D2には上記の逆翻訳表示上の省略・表記差がある。live JSON / consumerの挙動差として新たに見つかったものは上記`WX24-P2-049-E1`以外 **0件**。
- `WX24-P2-009-E1`のfindings quote「3枚トラッシュに置いてもよい」は現JSONの`MILL.optional:true`で既に正しく、今回の対象外問題は見つからなかった。

## 6. ゲート実測値

- `npm run gates`: **全緑**。
- typecheck: PASS。
- golden: **PASS 2995 / FAIL 0（計2995）**。投入前2988から+7（対象効果ごとに1本）。
- census高シグナル: **517 / baseline 517**。518→517はMANUAL免除による不可視化であり前進ではない旨を基準コメントへ明記。
- census:stubs: **A群🔴 0 / C群 0**。`FROM_TRASH_TO_CENTER_ZONE`は日本語表示のあるD群として認識（live STUB id 617種、総ノード2896）。
- census:enginetext: **A 136行 / 133ハンドラ、B 59行、C 28行、regex miss 40ハンドラ / 56カード**。Aラチェット不変。
- manual-fields: **loss 0 / parseStatus違反 0**。
- smoke: **10703 OK / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0**。
- fuzz: **200ゲーム、CRASH/HANG/INVARIANT/EXPLOSIONすべて0**（最終gate seed 12648430）。
- lint: **0 errors / 249 warnings**（投入前から増加なし）。
- `npm run regen`: 全10 sheet＋下流3生成に成功。
- `censusManualDrift`: 削除候補 **0効果**。
- 追加ラチェット: `BASELINE_SPLIT_TOTAL` 4→5、`BASELINE_REORDER_MISSING` 16→14（群Dの2正規idへreorderが到達）、`BASELINE_ORPHAN_MANUAL` 12→11。

## 7. fresh帳票の増減（報告直前再生成）

報告直前に `npm run build:effects`（カード総数6712、合計10703効果）→`node scripts/heldReview.mjs`を再実行した。

- `_held_fresh.json`: **93→93**。追加・削除カードなし。増えた分がないため追加原文照合対象なし。
- `_partial_fresh.json`: **12→11**。削除は`WX24-P2-049`。正規`E2` manualとparser `E3`のid対応が成立し、partial凍結が解消したため。
- `_idset_fresh.json`: **13→11**。削除は`WX24-P2-049`, `WXDi-P13-050`。追加なし。
- buildの`id集合ズレ(要レビュー)`も **11**。

## 8. 反転確認

各確認は対象manualを一時的に外す（D2だけ旧shadowを一時復元）→`npm run golden -- --only manual1`で該当failを確認→直ちに元へ戻す、の順に1効果ずつ実施した。最終状態は復元済みで、manual1 **7/7 PASS**、全件 **2995/2995 PASS**。

- A1 `WXK10-024-E3`: **Yes** — 外すと付与keywordが旧`ダブルクラッシュ`になりfail。
- A2 `WXK07-002-E1`: **Yes** — 外すと選択肢②の`filter.keyword`が消え、無能力シグニ除外assertがfail。
- A3 `WXEX1-16-E2`: **Yes** — 外すとtargetが旧`LRIG`になりfail。
- B `WX24-P2-009-E1`: **Yes** — 外すと第2stepが裸STUBへ戻り、POWER_MODIFY/E2E assertがfail。
- C `WXDi-P03-087-E2`: **Yes** — 外すと中央専用STUB assertがfail（旧汎用ADD_TO_FIELDへ戻る）。
- D1 `WX24-P2-049-E2`: **Yes** — manual E2を外すとfresh UNKNOWNが残り、構造化STUB assertがfail。
- D2 `WXDi-P13-050-E2`: **Yes** — 旧`E1b` shadowを戻すとfresh＋manual id集合にE1bが増え、id集合assertがfail。

## 9. `syncManualLive --dry` 差分

### 群A〜C

- 各カードを1件ずつdry-runし、id集合変化なしであることを確認して通常同期した。
- 最終dry-run:

```text
= WXK10-024: 差分なし（effects_WXK.json）
= WXK07-002: 差分なし（effects_WXK.json）
= WXEX1-16: 差分なし（effects_WX.json）
= WX24-P2-009: 差分なし（effects_WX24_26.json）
= WXDi-P03-087: 差分なし（effects_WXDi.json）
```

### 群D（allow前の必須dry）

```text
✗ WX24-P2-049: id集合が変わるのでスキップ（消える=[WX24-P2-049-E1b] 増える=[WX24-P2-049-E3]）
✗ WXDi-P13-050: id集合が変わるのでスキップ（消える=[WXDi-P13-050-E1b] 増える=[WXDi-P13-050-E2]）
```

この2カードだけ`--dry --allow-idset-change`で内容確認後、`--allow-idset-change`を付けて同期した。最終dry-runは両方`差分なし`。

## 10. 群Dの付帯物5点

1. `fixLrigColorFilters.mjs`の`WX24-P2-049-E1b / powerPlusBanishedPower`エントリを削除。最終`build:effects`に同effectIdの`[SKIP]`なし（他の既存SKIPは残る）。
2. `MANUAL_DRIFT_KNOWN`から`WX24-P2-049-E2`と`WXDi-P13-050-E1b`を削除。トリップワイヤは全緑。
3. Sheet1 B2付近の「WX24-P2-049はidset凍結中」コメントを、O-149解凍済み＋正例追加へ更新。
4. `BASELINE_ORPHAN_MANUAL`: **12→11**。旧値を同じ行のコメントに保持。
5. `_idset_fresh.json`: **13→11**（削除2カードは上記2件、追加なし）。

補足: live JSONのカード単位差分をHEADと機械比較し、変更カードは指定7カードだけだった。未指定兄弟は`WX24-P2-049-BURST`, `WXDi-P03-087-E1/BURST`, `WXDi-P13-050-BURST`, `WXEX1-16-E1`, `WXK10-024-E1/E2/BURST`が行単位/JSON値一致。`WXDi-P13-050-E1`はキー順のみ、`WX24-P2-049-E1`は§5記載のfresh改善が同期された。

## 11. `findings.jsonl`対応（closeは未実施）

- `WXDi-P03-087-E2` — quote: `中央のシグニゾーンに出す`
- `WX24-P2-009-E1` — quote: `３枚トラッシュに置いてもよい`
- `WX24-P2-049-E2` — quote: `カードを１枚まで手札に加え`（旧idで【出】に紐づいたfinding。現liveでは【出】は`E3`）
- `WXEX1-16-E2` — quote: `あなたのレゾナ１体`
- `WXK07-002-E1` — quote: `以下の４つから２つまで選ぶ`
- `WXK10-024-E3` — quote: `【アサシン】を得る`
- `WXDi-P13-050` / `WXDi-P13-050-E2` / 旧`E1b` — 該当findingなし。

対象findingは`semantic_audit_clean_round1/findings.jsonl`と`semantic_audit_stub_round3/findings.jsonl`で確認した。`stage2_closed.txt`は更新していない。

## 12. 差分・エンコーディング監査

- `git diff --check`: 問題なし。
- tracked差分23ファイルをHEADと比較し、U+FFFD・3文字以上連続`?`・先頭UTF-8 BOMの新規増加 **0ファイル**。
- live JSON 4ファイルはすべて **1行**。
- parser / engine / screens / PLAN / PLAN_PROGRESS の差分 **0**。
- commit / push **未実施**。
