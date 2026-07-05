# WixossReactClone — Claude Code 引き継ぎメモ

## プロジェクト概要
WixossカードゲームのReactクローン実装。

---

## 注意事項
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）
- `scripts/addWX01.mjs` などのWEL化スクリプトは削除済み（WEL化は廃止）

## ディレクトリ規約（2026-07-05整理）
- `src/screens/battle/` — BattleScreen の分割先（純関数ヘルパー＋ `modals/` のモーダル部品。共有コンテキストは `modals/types.ts` の `BattleModalCtx`）。**BattleScreen の新規モーダル/ヘルパーはここに置く**（本体に足さない。分割の経緯と継続レシピは PLAN.md §4）。
- `scripts/` — **現役ツールのみ**（package.json の npm scripts・CI・docs の現行ワークフローから参照される約27本）。ここに one-off を溜めない。
- `scripts/archive/` — **適用済み one-off スクリプト・過去レポートの保管庫**（旧ルート散在分と旧 `scratchpad/` の中身＝`scripts/archive/scratchpad/`）。実行しない歴史記録。BUGFIXES.md 等の過去ログ内パスは移動先に更新済み。
- **使い捨ての調査・検証スクリプトは `tmp_*` 名で作業**（gitignore済み・`/scratchpad/` も廃止済みで無視される）。記録に残す価値があるものだけ、適用後に `scripts/archive/` へ移して BUGFIXES.md から参照する。
- **ルート直下にスクリプトやレポートを作らない**。置いてよいのは設定類（package.json / tsconfig* / vite / eslint / .env* 等）・`index.html`・`verify.html`（viteの追加エントリ）・`CLAUDE.md` / `README.md` のみ。

## 検証コマンド（共同開発者・必読）
実機（ブラウザ対戦）不要でヘッドレス回帰検証できる。**`npm install` 後すぐ動く**（tsx は devDependency）。詳細は `docs/PLAN.md §12`。
- `npm run typecheck` — 型チェック（CIと同じ／必須）
- `npm run smoke` — 全効果10582件を自動実行し CRASH/HANG/INVARIANT 検出（現状 全0）
- `npm run golden` — DSLアクション型＋C1トリガー収集の結果を assert（現状 123/123 PASS）
- `npm run fuzz` — 乱択 自己対戦ファズ＝進化盤面で効果連鎖し相互作用/複製バグ検出（現状 全0・シード再現可）
- `npm run census` — 語彙センサス＝過剰効果/幻覚の両方向計器（高シグナル1872ベースライン・超過で exit 1）。消化は `npm run census:clusters`（文型クラスタ表）→parser規則→`npm run build:effects`→`node scripts/heldReview.mjs` 一括採用（手順は PLAN.md §5c・§4「次の一手」）
- **engine / BattleScreen / decompiler を触ったら（C・D・Stage2）上記 smoke・golden・fuzz を必ず回す**（数秒）。バグを golden に1件足してから直すと回帰を防げる。
- **CI（`.github/workflows/ci.yml`）が push/PR(master) で typecheck・lint・golden・smoke・fuzz を自動実行**＝回し忘れても素通りしない。ローカルで先に回して緑にしてから push する。

## ドキュメント配置ルール
- **メモ・ノート・引き継ぎ（HANDOFF）・調査記録などの .md は必ず `docs/` にまとめる**。プロジェクトルートに散らばせない。
- ルート直下に置いてよいのは定位置が規約で決まっているものだけ：`CLAUDE.md` / `README.md` / `.github/pull_request_template.md`
- 現状の `docs/` の主要ファイル：
  - **`PLAN.md` — 開発計画の唯一の正（旧 P1_PLAN.md/ROADMAP.md/TODO.md を2026-07-03に統合）。全体像・DoD・3人バトン式の現在地・フェーズ別残作業をすべて1本に集約。§4「現在地とバトン」に次の一手。cold startはまずこれ**
  - **`DESIGN.md` — 設計方針・開発ルール（まずこれを読む）**
  - **`BUGFIXES.md` — バグ修正記録（新しいものを上に追記）**
  - **`BEHAVIOR_AUDIT.md` — 挙動トレース監査（原文照合の主軸・§5c census文型バッチと並行の主作業）。engine実行結果（盤面差分＋ログ）を原文と目視照合。LLM不使用・決定論**
  - `SEMANTIC_AUDIT.md` — （旧・主軸から外した）LLM意味比較。補完的発見器として継続利用（worklistは PLAN.md §6.2）
  - `STUBS.md` — 全STUBの一覧と実装状況（`node scripts/genStubsMd.mjs` で再生成。手編集しない）
  - `TokenCallers.md` — トークン↔呼び出し元の対応表
  - `effects-json-guide.md` — effects JSONの表現語彙・ガイド
- 引き継ぎ（HANDOFF）は廃止。残作業・設計判断は `PLAN.md`、修正記録は `BUGFIXES.md` に集約する。
