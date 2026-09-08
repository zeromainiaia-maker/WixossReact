# 意味照合監査 Sheet6 round4（2026-09-08）

🏁**Sheet6（round4）は 2026-09-08 に監査完了＝43枚 / 5バッチ全消化**
（**codex（`CODEX_HOME=C:/Users/zerom/.codex-work`）で実行＝失敗0バッチ**）。
`node scripts/archive/semanticAuditGap.mjs --sheet 6` の未監査は **0**。

🔴**findings 16件は全件未 triage**＝次は Opus で O-A から（PLAN §5.0）。
内訳＝HIGH 7 / MED 9、型は MISSING 11 / WRONG 5。**歩留まり 3.2件/バッチ＝今日の5シートで最高**
（Sheet3 2.65 / Sheet4 1.9 / Sheet5 1.5）。⚠**母数が43枚と小さいので単独では読まない。**
🔑**MISSING が WRONG を上回った唯一のシート**（他は全部 WRONG 優勢）＝triage 時に見る価値がある偏り。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet 6 --list 2>/dev/null > tmp_sheet6_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_sheet6_round4 \
  --cards-file tmp_sheet6_pending.txt --batch-size 10
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs \
  --out scripts/archive/scratchpad/semantic_audit_sheet6_round4 --batches 1,2,3
```

⚠**`semanticAuditGap.mjs --list` の `[gap] …` 行は stderr へ出る**＝`2>/dev/null` を外すと `--cards-file` が1行余分に読む。
⚠**`audited_cards_cumulative.txt` はランナーが更新しない**＝バッチを回したら `raw/batch_NN.json` の `cardNum` を手で追記する。
