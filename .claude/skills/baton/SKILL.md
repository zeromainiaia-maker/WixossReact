---
name: baton
description: セッション終了時のバトン簿記。PLAN.md §4 の進捗サマリを入れ替え（旧要約を PLAN_PROGRESS.md の先頭へ退避）、恒久指標を更新し、BUGFIXES.md に追記して commit/push まで回す。
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

## ③ PLAN.md §4 進捗サマリを入れ替え（**入れ替え式・最新1件のみ**）

1. **いま §4「📍 進捗サマリ」に載っている要約を丸ごと切り取り**、`docs/PLAN_PROGRESS.md` の
   「過去セッション要約」の**先頭**（新しいものが上）へ貼る。
2. §4 を**今回の作業の要約に書き換える**。§4 に2件並べない。

要約に必ず含める：
- **セッション見出し**＝日付・続きNN・モデル名・一行の主題（例：`🆕 セッション（2026-07-14・続き114・Fable 5・…）`）
- ✅ 何を消化したか（枚数・機構名・census/golden の増減）
- **次の一手**＝次の担当が最初に取る作業（Opus 側 / Sonnet 側 で分けて書く）

## ④ 恒久指標を更新（§4「📊 恒久指標」）

数字が動いたものだけ実数を書き換える：
- census 高シグナル欠落（**効果単位**・2026-07-13〜）。減ったら `scripts/vocabCensus.ts` の `BASELINE_HIGH` も更新。
- golden 件数・smoke SKIP 件数・同型★0・parserWorklist（held / LOSS / VALUE）。
- 母数（効果カード数・効果数・MANUAL 効果数・STUB 含むカード数）。

## ⑤ worklist を締め直す

- 消化した項目は PLAN から消し、**詳細は `docs/PLAN_DETAIL.md` へ移す**（PLAN には1行✅サマリだけ残す＝PLAN を「生きている worklist」だけに保つ）。
- 新しく見つけたが直さなかったバグは **PLAN §3 の該当タスクへ登録**する。
  Sonnet セッションで見つけた engine/parser バグは **Opus タスク12（常設受け口）** へ。
- モデル分担（PLAN §3）の割付が消化で空いたら、次の割付を書いておく。

## ⑥ commit / push

```
git add -A && git commit && git push
```
- 実機未検証の変更を含むならコミットメッセージ末尾に「要実機検証」。
- push すると CI（typecheck・lint・golden・smoke・fuzz）が走る。緑を確認して終わる。
