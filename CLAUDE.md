# WixossReactClone — Claude Code 引き継ぎメモ

## プロジェクト概要
WixossカードゲームのReactクローン実装。

---

## 注意事項
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）
- `scripts/addWX01.mjs` などのWEL化スクリプトは削除済み（WEL化は廃止）

## ドキュメント配置ルール
- **メモ・ノート・引き継ぎ（HANDOFF）・調査記録などの .md は必ず `docs/` にまとめる**。プロジェクトルートに散らばせない。
- ルート直下に置いてよいのは定位置が規約で決まっているものだけ：`CLAUDE.md` / `README.md` / `.github/pull_request_template.md`
- 現状の `docs/` の主要ファイル：
  - `STUBS.md` — STUB実装状況の一覧
  - `TokenCallers.md` — トークン↔呼び出し元の対応表
  - `effects-json-guide.md` — effects JSONの表現語彙・ガイド
  - `HANDOFF_*.md` — セッション間の引き継ぎメモ（消化済みのものは随時削除）
