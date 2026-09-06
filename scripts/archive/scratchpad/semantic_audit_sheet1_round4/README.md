# 意味照合監査 Sheet1 round4（2026-09-06 開始・2026-09-07 完了）

🏁**Sheet1 は 2026-09-07（第205バッチ）に完了＝252枚 / 26バッチ全消化。`pending_cards.txt` は空。**
**未 triage の findings 43件（r4-09〜26）が残っている**＝詳細は `TYPE_LEDGER.md`。次セッションは Opus で triage から。
**round4 の続きは Sheet2（未監査356枚）**＝このディレクトリと同じ形で `semantic_audit_sheet2_round4/` を新設して回す。

**なぜ始めたか**＝2026-09-06 時点で PLAN の worklist が全節 残0 になった（「完成した」ではなく
**いまある計器が指すものが尽きた**）。⇒ 新しい検出パスが要る。実測すると
**効果ありカード 6,032 枚のうち意味照合を1度も通していないカードが 2,688 枚（44.6%）**あり、
Sheet1 だけで **252 枚**だった（計器＝`node scripts/archive/semanticAuditGap.mjs`＝過去ラウンドの
`audited_*_cumulative.txt` / `sampled_cards.txt` の和集合との差。`--sheet 1` で未監査カード番号を列挙できる）。

意味照合は **「受け皿の名前を知らない穴」も拾える唯一の発見器**（逆翻訳・census・golden は
「知っているキー」しか見ない）＝ここが最も確度の高い未探索在庫。

## 走らせ方（続きから）

```
node scripts/semanticAuditExtract.mjs --out tmp_sa_sheet1 \
  --cards-file <このディレクトリの pending_cards.txt> --batch-size 10
node scripts/semanticAuditRun.mjs --out tmp_sa_sheet1 --model sonnet --batches 1
```
⚠**抽出時のシャッフルは seed 42 の mulberry32**（Sheet1 未監査252枚をシャッフルしてから 10枚/バッチ）。

## 第1〜3バッチの実績（30枚・2026-09-06）

- findings **6件 / 30枚**（batch01 = 0件、batch02 = 2件、batch03 = 4件）。
- **真バグ 3件（precision 50%）／影響カードは 11枚**（クロス宣言の系統展開ぶん）。

| # | finding | 判定 |
|---|---|---|
| 1 | `WX11-043-E1` にクロス限定が無い | 🔴**真バグ・系統**＝クロス宣言つき10枚すべてで先頭能力に `crossOnly` が無かった |
| 2 | `WX11-043-E2` の STUB id 名が実体と食い違う（`..._FROM_TRASH` なのに `value2:"hand"`） | ⚪偽陽性（命名のみ・挙動は正しい） |
| 3 | `WX08-010-E1` の BANISH が `count:1` 固定 | 🔴**真バグ**（原文は「クラッシュした1枚につき」） |
| 4 | `WX08-010-E1` のバースト抑制が LIFE_CRASH の後ろ | 🔴**真バグ**（しかも `SUPPRESS_LIFE_BURST_ON_CRASH` は**対戦相手**にフラグを立てるハンドラ） |
| 5 | `WX10-072-E1` の「そうした場合」が `IS_MY_TURN` | ⚪偽陽性＝`effectExecutor` の **did-it ゲート**（`DID_IT_GATED_TYPES` に `LIFE_CRASH` があり空振り時に消費される） |
| 6 | `WX11-044-BURST` の「捨てないかぎり」が `IS_MY_TURN` | ⚪偽陽性＝`OPPONENT_PAY_OPTIONAL` の**既定の極性が「払わなかったら then」**（`thenOnPay` が無い側） |

🔑**偽陽性2件はどちらも「engine 側が JSON の見た目を裏で読み替えている」型**＝
JSON だけを見る監査員には原理的に判定できない。**引き当てたら engine の受け皿を必ず読む。**
