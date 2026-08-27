---
name: baton
description: セッション終了時のバトン簿記。PLAN.md §1 の進捗サマリを入れ替え（旧要約を PLAN_PROGRESS.md の先頭へ退避）、恒久指標を更新し、BUGFIXES.md に追記して commit/push まで回す。
---

# /baton — セッション終了時のバトン簿記

次のセッション（別モデル・別担当）が **cold start で `docs/PLAN.md` §4 だけ読めば現在地が分かる**状態にして終わる。

---

## ① ゲートが緑であることを確認（先にやる）

```
npm run gates
```
赤いまま簿記しない。engine/parser/decompiler を触ったなら `npm run regen` と同型★0（`node scripts/groupSimilar.mjs --all`）も。

## ② BUGFIXES.md に追記

`docs/BUGFIXES.md` の**先頭**（新しいものを上）へ、今回の修正を「続きNN」として書く。
- 何が壊れていたか（真因）／どう直したか／影響枚数／再現手段（シナリオ名・スクリプト）。
- 次の人が追試できる粒度で書く。ここが詳細の置き場＝PLAN には要約しか置かない。

## ③ PLAN.md §1 進捗サマリを入れ替え（**入れ替え式・最新1件のみ**）

1. **いま §4「📍 進捗サマリ」に載っている要約を丸ごと切り取り**、`docs/PLAN_PROGRESS.md` の
   「過去セッション要約」の**先頭**（新しいものが上）へ貼る。
2. §4 を**今回の作業の要約に書き換える**。§4 に2件並べない。

要約に必ず含める：
- **セッション見出し**＝日付・続きNN・モデル名・一行の主題（例：`🆕 セッション（2026-07-14・続き114・Fable 5・…）`）
- ✅ 何を消化したか（枚数・機構名・census/golden の増減）
- 📊 **3つの計器の併記**（Sheet1 要対応枚数／台帳 残 OPEN／census 高シグナル数）＋**動かなかった計器の理由**
- **次の一手**＝次の担当が最初に取る作業（Opus 側 / Sonnet 側 で分けて書く）

## ④ 恒久指標を更新（PLAN §6「恒久指標」）

🆕🔴**進捗は「3つの計器の併記」で書く**（2026-08-27 ユーザー決定・PLAN §3）＝**どれか1本を「進捗指標」に固定しない**：
1. **Sheet1 要対応カード数** … `npm run census:cards -- --sheet 1`
2. **意味照合 段2 台帳の残 OPEN** … `node scripts/archive/semanticAuditLedger.mjs`
3. **census 高シグナル数** … `npm run census`

⚠**動かなかった計器があるなら「なぜ動かないか」を1行で書く**（書けないことが失敗＝続き684 は11効果を直して Sheet1 が 0 減。
理由＝直した中で Sheet1 は1枚だけ・そのカードは別の finding が残るので落ちない）。

数字が動いたものだけ実数を書き換える：
- census 高シグナル欠落（**効果単位**・2026-07-13〜）。減ったら `scripts/vocabCensus.ts` の `BASELINE_HIGH` も更新。
- golden 件数・smoke SKIP 件数・同型★0・parserWorklist（held / LOSS / VALUE）。
- 母数（効果カード数・効果数・MANUAL 効果数・STUB 含むカード数）。

## ⑤ worklist を締め直す

- 消化した項目は **PLAN から行ごと消す**（1行サマリも残さない）。**詳細は `docs/PLAN_DETAIL.md` へ移し、一次記録は `BUGFIXES.md`**＝PLAN を「生きている worklist」だけに保つ。
- 新しく見つけたが直さなかったバグは **PLAN §5.3 へ `O-<次番号>` で登録**する（§2.4＝先送りしてよいのは新機構が要るときだけ）。
- **モデル分担は廃止（Opus 単独）**＝§1「次の一手」には PLAN §5 のどこから取るかを書く。

## ⑥ commit / push

```
git add -A && git commit && git push
```
- 実機未検証の変更を含むならコミットメッセージ末尾に「要実機検証」。
- push すると CI（typecheck・lint・golden・smoke・fuzz）が走る。緑を確認して終わる。

## ⑦ リーダーへ完了メール（**push が終わってから**）

**どのアカウントの Claude で作業していても送る**（既定の `~/.claude` ／ `.claude-alt` ／ `.claude-karka` の3つ）。
詳細と落とし穴は `docs/PLAN.md` §2.5。

```
node C:/Users/zerom/.claude-shared/notify-mail.mjs --subject "[WixossReact] <ID> 完了 — <一行主題>" --body "<本文>"
```

本文に必ず入れる＝①真因（症状ではなく）②ゲート数値と前回からの増減 ③実機シナリオ名・PASS 数・反転確認の有無
④**commit SHA と push 済みか** ⑤follow-up に登録した `O-nn` ⑥次の一手。

- ⚠**`MAIL_TO` は `zeromain.iaia@gmail.com`（ドット入り）が正**。ドット無しは Resend が **403** を返す（Gmail 側の受信箱は同じ）。
- ⚠**未 push の状態で「完了」と送らない**（リーダーが見に行っても差分が無い）。
- 送信できない／`notify.env` が無い場合は**メールを諦めて終わらず**、その旨をユーザーへ報告する。
