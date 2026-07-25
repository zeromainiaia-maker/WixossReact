---
name: audit-card
description: BEHAVIOR_AUDIT（挙動トレース監査）の1カード監査を1巡回す。原文｜逆翻訳｜盤面差分｜ログを目視照合し「真no-op／シナリオ空振り／STUB未実装」に仕分けて修正・ゲート・簿記まで。引数に CardNum を取る。
---

# /audit-card `<CardNum>` — 挙動トレース監査 1カード1巡

要レビュー・キュー（「非CONTINUOUS なのに実行しても盤面が一切変化せず、意味のあるログも出ない効果」）に挙がったカードを
**engine 実行結果（盤面差分＋ログ）と原文の目視照合**で仕分ける。LLM 判定は使わない＝決定論・トークン0。

引数が無ければ、まずキューを再生成して高シグナルを選別し、そこから1枚選ぶ。

---

## ① キュー（引数なしのとき／キューが古いとき）

**キューは engine/parser を触るたび古くなる。まず再生成する。**
```
npx tsx scripts/behaviorAudit.ts --queue > docs/_behavior_queue.txt
node scripts/_bqTriage.mjs        # 要レビュー・キューを高シグナルに絞る
```

## ② 目視照合
```
npm run audit -- --id <CardNum>
```
**原文｜逆翻訳｜盤面差分｜ログ**を並べて見る。判定は機械に投げず自分で読む。

## ③ 3分類に仕分ける

| 分類 | 見分け方 | 対応 |
|---|---|---|
| **真 no-op（バグ）** | 原文の効果が engine で実行されていない（未実装 action 型・未配線 timing・誤配線・トリガー主語ミス） | ④で修正 |
| **シナリオ空振り** | engine は正しいが、監査用トイ盤面に有効な対象が居ないだけ | `scripts/behaviorAudit.ts` の**シナリオビルダーを拡充**して偽陽性を消す（対象を盤に置く） |
| **STUB 未実装** | STUB id のまま engine 実装が無い | `docs/STUBS.md` / PLAN §6.1・§6.3 の worklist へ登録（その場では直さない） |

⚠ **偽陽性パターン（PLAN §9）をまず除外する**。トリガー主語系（audit はトリガー条件を模擬しない＝逆翻訳照合で判定するしかない）・
CONTINUOUS（モディファイア登録なので盤面カード列が動かない）・条件未成立は**バグではない**。

## ④ 修正（真 no-op のとき）

PLAN §3 の標準ワークフローに従う：
- effects JSON は**直接パッチ**（`effectId` をアンカーにした `.mjs` で外科的に）。`npm run build:effects` は破壊的＝実行しない。
- **逆翻訳を直したら engine 実装までセット**（乖離＝偽陰性を作らない）。engine 未配線なら `engineUnwiredTimings` に登録して
  逆翻訳に `【※engine未配線】` を出す。
- 新機構が要るなら「機構実装の型」（PLAN §3）＝ 型 → PlayerState → executor/execUtils/effectEngine → BattleScreen（**ターン境界リセット3箇所**）→ decompiler → JSON 配線。
- **バグを golden に1件足してから直す**（回帰防止）。

## ⑤ ゲート

engine を触ったら必須：
```
npm run gates     # typecheck→golden/smoke/fuzz/census/lint 一括（数秒）
npm run regen     # decompiler を触ったら
node scripts/groupSimilar.mjs --all   # 同型★0
```

## ⑥ 簿記

- `docs/BUGFIXES.md` に追記（新しいものを上）。
- 同じバグ型が他カードにも居そうなら**正規表現＋JSON 走査の lint に落として全域展開**する（`_auditSystematicScan.mjs` の実績）。
  1枚直して終わりにせず、系統として刈る。
- Sonnet セッションで見つけた engine/parser バグは**その場で直さず** PLAN §3 Opus タスク12 へ登録する。
- PLAN §4 の進捗サマリ更新は `/baton` で。
