# WixossReactClone — Claude Code 引き継ぎメモ

## プロジェクト概要
WixossカードゲームのReactクローン実装。

---

## 注意事項
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）
- `scripts/addWX01.mjs` などのWEL化スクリプトは削除済み（WEL化は廃止）

## 検証コマンド（共同開発者・必読）
実機（ブラウザ対戦）不要でヘッドレス回帰検証できる。**`npm install` 後すぐ動く**（tsx は devDependency）。詳細は `docs/PLAN.md §12`。
- `npm run typecheck` — 型チェック（CIと同じ／必須）
- `npm run smoke` — 全効果10557件を自動実行し CRASH/HANG/INVARIANT 検出（現状 全0）
- `npm run golden` — DSLアクション型＋C1トリガー収集の結果を assert（現状 106/106 PASS）
- `npm run fuzz` — 乱択 自己対戦ファズ＝進化盤面で効果連鎖し相互作用/複製バグ検出（現状 全0・シード再現可）
- **engine / BattleScreen / decompiler を触ったら（C・D・Stage2）上記 smoke・golden・fuzz を必ず回す**（数秒）。バグを golden に1件足してから直すと回帰を防げる。
- **CI（`.github/workflows/ci.yml`）が push/PR(master) で typecheck・lint・golden・smoke・fuzz を自動実行**＝回し忘れても素通りしない。ローカルで先に回して緑にしてから push する。

## ドキュメント配置ルール
- **メモ・ノート・引き継ぎ（HANDOFF）・調査記録などの .md は必ず `docs/` にまとめる**。プロジェクトルートに散らばせない。
- ルート直下に置いてよいのは定位置が規約で決まっているものだけ：`CLAUDE.md` / `README.md` / `.github/pull_request_template.md`
- 現状の `docs/` の主要ファイル：
  - **`P1_PLAN.md` — 現在の目標（全カード表現完成）と3人バトン式（順番 push/pull）の方針。§3「現在地（バトン）」に次の一手。cold startはまずこれ**
  - **`ROADMAP.md` — 完成までの全体計画（P1→P2→P3→対戦体験の4フェーズ）。全体地図はこれ、日々のバトンは P1_PLAN §3**
  - **`DESIGN.md` — 設計方針・開発ルール（まずこれを読む）**
  - **`TODO.md` — 残作業の一覧（完了したら消す）**
  - **`BUGFIXES.md` — バグ修正記録（新しいものを上に追記）**
  - **`BEHAVIOR_AUDIT.md` — 挙動トレース監査（原文照合の主軸）。engine実行結果（盤面差分＋ログ）を原文と目視照合。LLM不使用・決定論**
  - `SEMANTIC_AUDIT.md` — （旧・主軸から外した）LLM意味比較。発見器実績は BEHAVIOR_AUDIT へ lint 化して引き継ぎ
  - `STUBS.md` — 全STUBの一覧と実装状況（`node scripts/genStubsMd.mjs` で再生成。手編集しない）
  - `TokenCallers.md` — トークン↔呼び出し元の対応表
  - `effects-json-guide.md` — effects JSONの表現語彙・ガイド
- 引き継ぎ（HANDOFF）は廃止。残作業は `TODO.md`、設計判断は `DESIGN.md`、修正記録は `BUGFIXES.md` に集約する。
