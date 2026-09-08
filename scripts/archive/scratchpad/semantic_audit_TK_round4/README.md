# 意味照合監査 TK（CardData_TK.csv）round4（2026-09-08）

🏁**TK は 2026-09-08 に監査完了＝32枚 / 4バッチ全消化・失敗0バッチ**
（codex `CODEX_HOME=C:/Users/zerom/.codex-work`）。

🔴**findings 5件は全件未 triage**。内訳＝HIGH 4 / MED 1、型は WRONG 3 / MISSING 1 / SUSPECT_STUB 1。
**歩留まり 1.25件/バッチ＝今日の全シートで最低**。

🔴🔑**このシートは `semanticAuditGap.mjs` のバグで長く「0枚」と見えていた**＝`--sheet` が
`CardData_Sheet${arg}.csv` 決め打ちだったため、**実ファイル `CardData_TK.csv` に一度も当たらず未監査32枚が列挙できなかった**
（エラーではなく静かに0件＝「TK は監査済み」と誤読する形）。2026-09-08 に修正済み
（`semanticAuditGap.mjs:55`＝数字以外は `CardData_<arg>.csv` として解決）。
⚠**ディレクトリ名も `semantic_audit_sheetTK_round4` ではなく `semantic_audit_TK_round4`**（実ファイル名に合わせた）。

## 走らせ方（続きから／再現）

```
node scripts/archive/semanticAuditGap.mjs --sheet TK --list 2>/dev/null > tmp_sheetTK_pending.txt
node scripts/semanticAuditExtract.mjs --out scripts/archive/scratchpad/semantic_audit_TK_round4 \
  --cards-file tmp_sheetTK_pending.txt --batch-size 10
CODEX_HOME="C:/Users/zerom/.codex-work" node scripts/semanticAuditRunCodex.mjs \
  --out scripts/archive/scratchpad/semantic_audit_TK_round4 --batches 1,2,3
```
