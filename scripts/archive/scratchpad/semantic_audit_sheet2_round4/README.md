# 意味照合監査 Sheet2 round4（2026-09-07 開始）🏁完了

🏁**Sheet2 は 2026-09-07 に36/36バッチ（356/356枚）を完了**（第210バッチで18バッチ・続きの回で s2-19〜30 の12バッチ・さらに続きで s2-31〜36 の6バッチ）。
**findings 累計 73件のうち s2-19〜36 の 41件が未 triage**＝次セッションは Opus で O-A から（§5.0）。詳細は `TYPE_LEDGER.md`。
**以後の意味照合は Sheet3（`../semantic_audit_sheet3_round4/`）。**

Sheet1（`semantic_audit_sheet1_round4/`）が完了したので、同じ形でこのディレクトリを新設した。

## 走らせ方（続きから）

```
node scripts/archive/semanticAuditGap.mjs --sheet 2 --list > tmp_sheet2_pending.txt   # 未監査カード番号を再取得
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet2_round4 \
  --cards-file tmp_sheet2_pending.txt --batch-size 10
node scripts/semanticAuditRun.mjs --out scripts/archive/scratchpad/semantic_audit_sheet2_round4 \
  --model sonnet --batches 31,32,33,34,35,36
```

⚠**初回抽出時のシャッフルは seed 42 の mulberry32**（`pending_cards.txt` が356枚の並び。以後は
`semanticAuditGap.mjs --sheet 2` で再取得した「残り」をそのまま `--cards-file` に渡せばよい＝再シャッフル不要）。

⚠**`node scripts/semanticAuditRun.mjs` は `raw/batch_NN.json` が既にあるバッチをスキップする**＝
`--batches` を絞らずに全バッチ範囲を指定しても二重実行はされない（同じコマンドで再開可能）。

⚠**消化した分は `audited_cards_cumulative.txt` へ追記が必須**（`semanticAuditGap.mjs` が
`*cumulative.txt` を自動走査して未監査カードから差し引く）。**このファイルのキー名は `num`**
（`batches/batch_NN.json` の各要素は `{num, group}` であって `{cardNum, group}` ではない＝
第210バッチで一度 `cardNum` と誤読し、180行の空行を書いてしまった事故を踏んだ）。

## 第210バッチの実績（180枚・2026-09-07）

- findings **32件 / 180枚（1.8件/バッチ）**。全件未 triage。
- 実行時トラブル＝**s2-07 が claude -p の JSON 契約を守らず散文で応答**（Sheet1 r4-12 と同型）。
  本文が「findings 空配列で報告済み」と明記していたため 0件で確定・手動復元は不要だった。
- `mandatory:true` 疑い（LOW・「してもよい」なのに強制）が**4件**連続で出ている＝
  規則12（STUB内で任意判定される可能性）に該当するかを O-A triage で優先確認する。

## s2-19〜30 の実績（120枚・2026-09-07・S-1 12バッチ）

- findings **21件 / 120枚（1.75件/バッチ）**。全件未 triage。第210バッチ（1.8件/バッチ）とほぼ同水準＝逓減の兆候なし。
- 実行時トラブルなし（12バッチとも JSON 契約どおり応答）。
- `audited_cards_cumulative.txt` は 180件 → **300件**（`semanticAuditGap.mjs --sheet 2` の残枚数は 176 → **56** と一致確認済み）。
- 止め時（連続3バッチで新型0）はこの回では判定できない（新型判定は O-A triage の役目・§2.6 決定1／§5.0）。

## 🏁 s2-31〜36 の実績（56枚・2026-09-07・S-1 6バッチ＝Sheet2 完了）

- findings **20件 / 56枚（3.3件/バッチ）**。全件未 triage。HIGH 6件を含む（`WX12-032` 発動条件欠落・`WX19-064` 意味逆転×2・`WX12-033`／`WX12-002` 範囲/付与欠落・`WX18-001` 場出し処理欠落）。
- 実行時トラブルなし（6バッチとも JSON 契約どおり応答）。
- `audited_cards_cumulative.txt` は 300件 → **356件**（`semanticAuditGap.mjs --sheet 2` の残枚数は 56 → **0** と一致確認済み）。
- 🏁**Sheet2 完了（36/36バッチ・356/356枚）。以後は Sheet3。**

詳細は `TYPE_LEDGER.md`。
