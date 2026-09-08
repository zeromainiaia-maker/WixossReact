# 意味照合監査 Sheet4 round4（2026-09-08）

🏁**Sheet4（round4）は 2026-09-08 に監査完了＝252枚 / 26バッチ全消化**
（**codex（既定 `~/.codex`）で実行＝失敗0バッチ・12〜81秒/バッチ**。同時刻に `.codex-work` 側が Sheet3/Sheet5 を回しており、
`CODEX_HOME` が別＝認証ファイルが別なので**トークンリフレッシュの競合は起きなかった**）。
`node scripts/archive/semanticAuditGap.mjs --sheet 4` の未監査は **0**。

🔴**findings 50件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。
内訳＝HIGH 26 / MED 24、型は WRONG 27 / MISSING 22 / SUSPECT_STUB 1。**歩留まり 1.9件/バッチ**（Sheet3 の 2.65 より低い）。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 4 --list 2>/dev/null > tmp_sheet4_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet4_round4 \
  --cards-file tmp_sheet4_pending.txt --batch-size 10
node scripts/semanticAuditRunCodex.mjs --out scripts/archive/scratchpad/semantic_audit_sheet4_round4 --batches 1,2,3
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` を外すと `--cards-file` が1行余分に読む。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する
（忘れると gap 計器が減らず、再抽出で同じ枚数をもう一度監査する）。
