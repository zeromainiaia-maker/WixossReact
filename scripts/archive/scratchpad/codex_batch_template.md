# 依頼：一点物バグ修正（第NNNバッチ・30効果）

<!--
  これは **Codex 委譲バッチの指示書テンプレ**（2026-09-10 に第245バッチの実物から作成）。
  使い方＝①`node scripts/archive/semanticAuditQueue.mjs --take 30 --out <scratch>` で表を作る
        ②このファイルをコピーして `<NNN>` / `<BASELINE_COMMIT>` / `<GOLDEN>` / `<プール残>` / `<残数>` を埋める
        ③`batch_table.md` を「今回のスコープ」節へ丸ごと貼る
        ④`CODEX_HOME=/c/Users/zerom/.codex-work codex exec -C "C:/Users/zerom/WixossReact"              -c model_reasoning_effort="high" -o <report> - < <この指示書> > <log> 2>&1`
  🔑運用の要点＝docs/LESSONS.md §4.6「委譲バッチの回し方」／起動法＝docs/CODEX_GUIDE.md §2。
  ⚠**投入前に `git status --porcelain` を空にする**（汚れていると Codex が着手を拒む）。
-->

作業ディレクトリ＝`C:/Users/zerom/WixossReact`。作業ツリーは投入時点で clean。
ベースライン commit＝`<BASELINE_COMMIT>`（`git log --oneline -3` で確認）。

**まず読むもの**＝`CLAUDE.md` → **`docs/LESSONS.md` §4.3「第3の系統」と §4.6「委譲バッチの回し方」**
→ `docs/BUGFIXES.md` の先頭3件（第241〜243）。

## 🔴 このバッチは今までと母集団が違う（重要）

第238〜243 の6バッチは、候補を選ぶときに**「triage 判定文に `.ts:行番号` の引用があるものは機構待ち」として除外**していました。
**この判定は誤りでした。** セッション末に中身を読んだところ、**その引用の多くは「受け皿がここに在る」という意味**でした：

- `WX03-002-E1` ＝ 受け皿 `cardClassExclude` は `types/effects.ts:1342` のコメントが**このカード番号を名指し**している
- `WX05-030-E1` ＝ 受け皿 `cardName:'__lastRevealed__'` は `execSearch`（`effectExecutor.ts:5100`）に在る
- `WXDi-P09-047-E2` ＝ 受け皿 `ENERGY_TRASHED_BY_OPP` の評価器が `execUtils.ts:2466` に在る
- `WXEX2-17-E1` ＝ `timing` に `ON_ATTACK_LRIG` が無いだけ（収集側は `triggerCollect.ts:840` に在る）

⇒ 🔑**下表の「triage 判定」に engine の行番号が出てきても、それは「engine を読んだ」という意味であって
「機構が要る」ではありません。むしろ在処が分かっている＝安い。** そのつもりで読んでください。

**このプールは<プール残>効果あり、今回はその先頭30効果です。**

🔑**1巡目（第244）の実績＝30効果中21効果を採用（density 70%）**＝第242（24/30）と同水準でした。
**見立ては裏付け済み**＝このプールは「受け皿は実在・限定が落ちている」型が主体です。
そのとき engine に足したのは3つだけ（`cost.fieldDown.excludeSelf`／`OPTIONAL_COST.triggeringSigniTrash`／
`ADD_TO_LIFE` ほかの `upToCount`）で、**残りは既存の型・payload の組み合わせで閉じました。**

🔴**1巡目で Claude が引き継いで直したもの**（同じことを繰り返さないために書きます）：
- **`fieldDown.excludeSelf` を UI 2箇所にだけ足して engine の任意コスト経路（可否判定・支払い）に足し忘れていた**
  ＝**「型は在るが1分岐だけ抜けている」形は engine 側も必ず両方**（`fieldTrash`／`fieldToDeckBottom` が先例）。
- **`manualEffects.ts` を直したのに live へ届いていなかった**＝parser が追いついた効果は
  **manual 側を削除する**のが正解（`npx tsx scripts/censusManualDrift.ts` の「削除候補」に出る）。
- **位置固定の既存 golden が腐った**（支払いゲートの中へ処理を移したため）＝**型・id で引く形へ直す**。
- **集合を凍結したトリップワイヤ**（`(xxix)` 段階1/2）は、条件を足すと**集合間で1件移動**する＝
  **3箇所を対で更新**し、理由を1行書く。

🔴ただし**スクリーニングは一次ふるい**＝着手時に**必ず自分で「既存の型・フィールド・STUB だけで表現できるか」を確認**し、
本当に機構が要ると分かったら**その効果だけ見送って理由を報告**してください（見送りは失点ではありません）。

## 🔴 直近5巡で実際に踏んだ罠（順に重い）

### ① 「JSON が原文どおり」と「engine が動く」は別（5件）
`TRANSFER_TO_DECK{owner:'any'}` の場候補が無い／CONTINUOUS `POWER_SET{frontOfSelf}` を `calcFieldPowers` が拾わない／
`execDown` の新分岐が `resolveNum` で `{$ref}` を 0 にする／`ADD_TO_FIELD{targetsTriggerSource}` の消費地点が無い／
`opponentSelects` が `execTransferToDeck` の `HAND_CARD` 分岐だけ無視される（**型は在るのに1分岐だけ抜けている**形が頻出）。
⇒ ①新キーは `grep -rn "<キー名>" src/engine/ src/screens/` ②**既存キーの"組み合わせ"**（owner × count × filter × 型）が
拾われるかを**収集側**（`effectEngine.ts` の `calcFieldPowers` / `collectContinuous*` / `grantedStoreWatchers`）まで読む
③**枚数は `resolveCountRef`**（`resolveNum` は `{$ref}` を 0 にする）
④**`{$ref}` は直前ステップが `lastProcessedCards` を残して初めて効く**＝**E2E で実枚数を確かめる。**

### ② 逆翻訳（`npm run regen`）が嘘をつく＝**原文照合そのものが効かなくなる**（実測7件）
🔴**最悪形＝逆翻訳が原文を regex で抜き出して描いている**（第243 の `COPY_TARGET_POWER`）＝
`/(?:次の対戦相手の)?ターン終了時まで…/` と**両方の期限を受ける regex** だったため、
**JSON の期限が欠落していても逆翻訳は原文どおりに見えていた**（計器がバグの共犯）。
⇒ 🔴**payload を足したら必ず `npm run regen` して逆翻訳を読む。原文 regex で描いている箇所を見つけたら payload から描く形へ直す。**

### ③ 既存 golden は「腐る」＝落ちたら1件ずつ判定する（実測9件）
**位置固定 assert**（型・id で引く形へ）／**`fresh()`（POOL カーソル）依存**（`--only` は緑・全件で赤）／
**旧実装を固定していた assert**（新形へ更新）／**引数追加による文字列 assert**。
⚠**トリップワイヤ**が落ちたら**まず自分の実装を疑う**。広げるなら**消費地点の `ファイル:行` と該当 live 全件**を報告に書く。

## ⚠️ 進め方

- **1効果直すごとに `npm run build:effects` ＋ `node scripts/heldReview.mjs --adopt-effect <effectId>` まで通す**
  （まとめて最後にやらない。**1バッチ30効果はほぼ1アカウントの利用上限ぶん**で、過去6巡すべて途中で止まっています）。
- 表の live JSON は commit `<BASELINE_COMMIT>` 時点。**着手前に必ず現在の JSON と原文を突き合わせ**、
  既に直っている効果は触らず「済み」として報告。
- 利用上限が来たら、**実装済みの分だけ `npm run typecheck` と `npm run golden -- --only` を通し、
  `docs/BUGFIXES.md` へ追記してから終える**（完走は不要）。

## 今回のスコープ＝この30効果だけ

<!-- ここに scripts/archive/semanticAuditQueue.mjs --take 30 --out <dir> が書いた batch_table.md を丸ごと貼る -->

## 直し方の指針

- **effectId アンカーの後処理**（`repairSemanticBatch239`〜`243` と同じ形）が既定。
  同型が3枚以上ある文型だと分かったときだけ汎用の parser 規則を直す。
- 🔑**母集団は必ず実測してからレーンを決める**＝`npm run census:population -- "<原文の正規表現>"`。
  同型1〜2枚なら `src/data/manualEffects.ts` へ `parseStatus:'MANUAL'` で手書きしてよい。
- 🔑**今回のプールは「受け皿の在処が判定文に書いてある」ものが多い**＝
  **まずその行を開いて、いま何を消費しているかを読む**。⚠ただし**判定文は数週間前のもの**で、
  行番号がずれている／既に直っている可能性がある＝**名前で `grep` し直す**。
- **STUB を新設してよい範囲**＝**アクション側**は新しい `id` を1つ足してハンドラを書いてよい。
  **条件側**（`Condition`/`ActiveCondition`）は新しい型を作らない（表現できないなら見送り）。
- ⚠**`SPDi43-17-E2`／`-18-E2`／`-19-E2` は同型3件**（アップ対象が `SIGNI` 型でルリグにならない）＝
  まとめて直せる可能性が高い。**同型を見つけたら母集団を測ってから直す。**

## ⚠️ ガードレール（`docs/CODEX_GUIDE.md` §5 から）

- **3-3‴**：キーワード・フィールド名を「完全一致」で存在確認しない（前方一致や別名も探す）。
- **5c′**：閾値・カード名を regex へ直接埋め込まない。effectId アンカーの個別分岐で書いてよい。
- **17**：既存 golden がこの効果を assert しているか `grep -n "<effectId>" scripts/goldenTest.ts` で必ず確認し、
  向きを原文と照合してから書き換える。**書き換えた既存テストは報告に全件列挙。**
- **2″**：任意処理（「そうした場合」）の範囲を、対象効果の実際の文構造で判定する。
- ⚠**`SEQUENCE[STUB{OPTIONAL_COST}, CONDITIONAL{IS_MY_TURN}]` は「支払った場合」の did-it ゲート**であって
  ターン判定ではありません（偽陽性の常連）。**これを「バグ」と読まないこと。**

## ゲート

- ベースライン（投入前実測・commit `<BASELINE_COMMIT>`）：`npm run gates` **全緑**（**golden <GOLDEN> PASS**・smoke 10744 OK・
  fuzz 0・census 高シグナル 1/BASELINE 1・census:stubs A群0・census:enginetext A🔴0行・census:costtext A🔴0規則・
  lint 0 errors / 254 warnings）。**この数値を悪化させないこと。**
- `npm run golden -- --only "<effectId>"` は1.5秒。**最終報告前に必ずフィルタなし全件 `npm run golden`**。
- 採用した効果には **golden を1件ずつ足す**（fresh/live 両方の JSON 断片 assert）。
  **engine の挙動を変えたものは E2E も1本足し、反転確認をしてから緑にする。**
  ⚠**修正の核になる payload を必ず assert に含める**（形だけの assert にしない）。

## 禁止事項

- commit も push もしない
- `docs/PLAN.md` と `docs/PLAN_PROGRESS.md` を編集しない。`docs/BUGFIXES.md` への追記は可
  （末尾に「(未検証・Codex 草稿)」と明記）
- スコープ外に手を出さない。**同型を見つけても直さず grep コマンドだけ報告する**
- 「全部直した」ことを優先しない。**確実に正しい分だけ採用する方が価値が高い。**

## 報告フォーマット

1. 触ったファイルと各1行の理由
2. **調査結果**（効果ごとに：判定文が今も有効か／既存の型で表現できるか）
3. **採用した効果の全件**＝`effectId ／ 原文の条件節 ／ 生成 JSON ／ 逆翻訳文全体（`npm run regen` 後の該当行） ／ 原文と一致するか`
4. **既に直っていた効果の全件**（0件なら「0件」）
5. **見送った効果の全件＋理由**
6. **条件以外で見つけた原文との食い違い**（0件なら「0件」）
7. ゲート数値（golden / census / smoke / fuzz / lint warning の投入前後）
8. `GRANT_*` の `abilities[]` に入れ子だった効果の親 effectId 一覧
9. **engine（`src/engine/`・`src/screens/`）に触った全箇所と、反転確認をした golden テスト名**
10. **書き換えた既存 golden の全件と「なぜ落ちたか」の判定**（腐り／実装ミス／別原因）
11. **トリップワイヤを広げた場合は、消費地点の `ファイル:行` と該当 live 効果の全件**
12. **`npm run regen` 後に逆翻訳が payload を描けていなかった箇所**（＝`decompileEffects.ts` を直した箇所。0件なら「0件」）

---
🤖 この指示書は Claude（Opus 5）が `docs/PLAN.md` §5.0・`docs/CODEX_GUIDE.md` の運用に従って作成した。
