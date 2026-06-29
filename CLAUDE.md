# WixossReactClone — Claude Code 引き継ぎメモ

## プロジェクト概要
WixossカードゲームのReactクローン実装。

---

## 注意事項
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）
- `scripts/addWX01.mjs` などのWEL化スクリプトは削除済み（WEL化は廃止）

## 検証コマンド（共同開発者・必読）
実機（ブラウザ対戦）不要でヘッドレス回帰検証できる。**`npm install` 後すぐ動く**（tsx は devDependency）。詳細は `docs/P1_PLAN.md §7`。
- `npm run typecheck` — 型チェック（CIと同じ／必須）
- `npm run smoke` — 全効果10557件を自動実行し CRASH/HANG/INVARIANT 検出（現状 全0）
- `npm run golden` — DSLアクション型＋C1トリガー収集の結果を assert（現状 31/31 PASS）
- `npm run fuzz` — 乱択 自己対戦ファズ＝進化盤面で効果連鎖し相互作用/複製バグ検出（現状 全0・シード再現可）
- **engine / BattleScreen / decompiler を触ったら（C・D・Stage2）上記 smoke・golden・fuzz を必ず回す**（数秒）。バグを golden に1件足してから直すと回帰を防げる。

## ドキュメント配置ルール
- **メモ・ノート・引き継ぎ（HANDOFF）・調査記録などの .md は必ず `docs/` にまとめる**。プロジェクトルートに散らばせない。
- ルート直下に置いてよいのは定位置が規約で決まっているものだけ：`CLAUDE.md` / `README.md` / `.github/pull_request_template.md`
- 現状の `docs/` の主要ファイル：
  - **`P1_PLAN.md` — 現在の目標（全カード表現完成）と3人バトン式（順番 push/pull）の方針。§3「現在地（バトン）」に次の一手。cold startはまずこれ**
  - **`DESIGN.md` — 設計方針・開発ルール（まずこれを読む）**
  - **`TODO.md` — 残作業の一覧（完了したら消す）**
  - **`BUGFIXES.md` — バグ修正記録（新しいものを上に追記）**
  - `STUBS.md` — 全STUBの一覧と実装状況（`node scripts/genStubsMd.mjs` で再生成。手編集しない）
  - `TokenCallers.md` — トークン↔呼び出し元の対応表
  - `effects-json-guide.md` — effects JSONの表現語彙・ガイド
- 引き継ぎ（HANDOFF）は廃止。残作業は `TODO.md`、設計判断は `DESIGN.md`、修正記録は `BUGFIXES.md` に集約する。
