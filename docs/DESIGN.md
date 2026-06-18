# 設計方針 (DESIGN)

WixossReactClone の設計方針・開発ルールをまとめた恒久ドキュメント。
個別の残作業は [TODO.md](./TODO.md)、過去のバグ修正は [BUGFIXES.md](./BUGFIXES.md) を参照。

---

## 1. カード効果 DSL システム

CSV のカードテキストを構造化 JSON（DSL）に変換し、ゲームエンジンで実行する。

### データフロー
```
CardData_Sheet*.csv（カードテキスト）
  → effectParser.ts（自動解析）＋ manualEffects.ts（手動定義をマージ）
  → public/data/effects_*.json（buildEffectsJson.ts で生成）
  → effectExecutor.ts / effectEngine.ts（実行）
  → BattleScreen.tsx（トリガー発火・インタラクションUI）
```

### 主要ファイル
| ファイル | 役割 |
|---|---|
| `src/types/effects.ts` | DSL 型定義（EffectType, EffectAction union, TargetFilter, EffectCost 等） |
| `src/data/effectParser.ts` | CSV テキスト→DSL 自動変換パーサー |
| `src/data/parsers/parseSentencePart1〜4.ts` | 文単位のパース分割 |
| `src/data/manualEffects.ts` | パーサーで解析できないカード固有の手動定義 |
| `src/data/parserUtils.ts` | パーサー共通ユーティリティ |
| `scripts/buildEffectsJson.ts` | `effects_*.json` 生成（`npm run build:effects`） |
| `src/engine/effectExecutor.ts` | アクション実行・インタラクション（SELECT/SEARCH/CHOOSE）要求と継続 |
| `src/engine/effectEngine.ts` | CONTINUOUS 効果のフィールドパワー計算（calcFieldPowers）等 |
| `src/engine/execStub.ts` / `execStubPart1〜3.ts` | STUB アクションの実装 |
| `src/engine/execUtils.ts` | matchesFilter 等の判定ユーティリティ |
| `src/engine/choiceTextParser.ts` | ①②③ 選択肢テキストの共通解析 |

### 解析率の到達点
- **UNKNOWN: 0 件**（完全ゼロ達成済み）
- **STUB_LOG（ログのみ・ゲーム効果なし）: 0 件達成済み**（v0.284）。以降は STUB の本実装化を継続。
- effects JSON ⇔ CSV のアクション不一致: 0 件達成（v0.254、全シート全カテゴリ）

---

## 2. バグ修正はパーサー優先

バグを見つけたら **`manualEffects.ts` への個別追加ではなく、根本原因のパーサー（`buildEffectsJson.ts` / `effectParser.ts` / `parseSentencePart*.ts`）を修正する**。

- **理由:** `manualEffects.ts` は無限に肥大化し、同種の誤解析カードがすべて個別対応になる。パーサーを直せば同パターンのカードがまとめて修正される。
- **判断基準:**
  - 系統的バグ（同パターンが複数カードに発生）→ パーサーを修正
  - 独自ロジック（複雑なシーケンス・STUB が必要等）→ `manualEffects.ts` に追加（最終手段）

---

## 3. フィルター命名規約

`TargetFilter`（`src/types/effects.ts`）のクラス指定は以下を厳守する。

- **`story` は「ディソナ」専用**（`story: "Dissona"`）。
- **シグニのクラス（＜微菌＞・＜天使＞・＜古代兵器＞等）には `cardClass` を使う。**
  - CSV の `CardClass` 列に対して `includes` でマッチする。
  - 例: `filter: { cardType: 'シグニ', cardClass: '微菌' }`
- 理由: Wixoss では「ストーリー」と「クラス」は別概念。`story` でクラスを表すのは命名として不正確。

---

## 4. CPU 戦と対人戦の処理統一

**CPU は対人戦と同じ処理を使う。CPU 独自実装は順次統一していく**（CPU 強化の布石）。

- **抽出パターン:** 本体を `perform*`（owner / attacker 等をパラメータ化）に抽出し、人間用 `handle*` は薄いラッパーにする。
- 統一済み: シグニ/ルリグアタック・ガード応答・ライフバースト（CPU も発動）・スペルカットインパス・召喚【出】/ON_PLAY。
- 落とし穴: 共通関数は行動不可時にダウンさせず早期 return するため、CPU 側は無限ループ防止の事前除外か戻り値での分岐が必須。

---

## 5. バージョン管理・リリース手順

コードを変更したら以下をセットで行う。

1. **`package.json` の `version` をインクリメント**（0.001 ずつ、3桁ゼロパディング）。
   - `src/version.ts` の `APP_VERSION` は `vite.config` の `define` で `v${pkg.version}` として自動注入される。**手で編集するのは `package.json` のみ。**
2. **CI チェック（push 前に必ず実行）:**
   - `npx tsc --noEmit` → 型エラー 0 件
   - `npm run lint` → **error 0 件**（warning は許容、error は NG）
3. `git push origin master`
4. `npx vercel --prod` で本番デプロイ

- ドキュメントのみの変更は version bump / デプロイ不要。
- このリポジトリには「auto: Claude による変更」を自動コミットするフックがある（編集が随時コミットされるのは正常動作）。

---

## 6. その他のルール

- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）。
- **PowerShell のエンコーディング破壊に注意:** `Get-Content` / `Set-Content` は BOM なし UTF-8 の日本語を CP932 で誤読し破壊する。日本語を含むファイルの読み書きは `System.IO.File` を使う。
- **ドキュメント配置:** メモ・ノート・HANDOFF・調査記録の `.md` は必ず `docs/` にまとめる（ルート直下は `CLAUDE.md` / `README.md` / `.github/pull_request_template.md` のみ）。
- WEL 化は廃止済み（`scripts/addWX01.mjs` 等の WEL 化スクリプトは削除済み）。

---

## 7. 検証スクリプト

| コマンド | 内容 |
|---|---|
| `npm run build:effects` | `effects_*.json` を再生成 |
| `npm run verify` | effects JSON ⇔ CSV の照合（`scripts/verifyEffects.ts`） |
| `npx tsc --noEmit` | 型チェック |
| `npm run lint` | ESLint |

- STUB 実装状況: [STUBS.md](./STUBS.md)
- トークン↔呼び出し元: [TokenCallers.md](./TokenCallers.md)
- effects JSON 表現語彙: [effects-json-guide.md](./effects-json-guide.md)
