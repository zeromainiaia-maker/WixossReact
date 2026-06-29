# ブラウザ実機検証ハーネス（verify:browser）

`/verify`（実行時GUI観測）を**認証・Supabase 不要**でヘッドレス代替するための仕組み。
engine（`executeEffect`/`resume*`）＋トリガー収集配線（`triggerCollect`）を**実ブラウザ（Chromium）で**実盤面シナリオに対して駆動し、結果を可視化＋スクショ保存する。

## 使い方
```bash
npm run verify:browser   # dev起動→/verify.html を Chromium で開く→結果取得＋スクショ。exit 0=全PASS
```
- スクショ＝`scratchpad-verify/verify-harness.png`（gitignore 済み）。
- 手動で見る場合は `npm run dev` 後にブラウザで `http://localhost:5173/verify.html`。

## 構成
- `verify.html`（ルート・vite の追加エントリ）＋`src/verify/main.ts`（データfetch→盤面構築→engine駆動→DOM描画）。
- `scripts/verifyBrowser.mjs`（Playwright ドライバ：dev起動・遷移・`window.__verifyResults` 取得・スクショ・終了コード）。
- 盤面ビルダー/オートパイロットは `scripts/goldenTest.ts` を踏襲（同じ run ループ）。

## カバー範囲と限界
- ✅ **カバー**＝engine 実行＋pure なトリガー収集（`collectFieldTriggers` 等）を**ブラウザ runtime** で。BANISH シナリオは収集配線（アタック→any_opp 拾い上げ）も実行。
- ❌ **非カバー**＝`BattleScreen.tsx` の React state 密結合部（`doPhaseAdvance`・pending UI 解決ループ・CPU/realtime 同期）。ここは**ログイン（Supabase 認証）必須**でゲートされており、完全な実機検証には別途以下が要る：
  1. **検証専用 Supabase アカウント**（email/password を env に）＝ゲスト/匿名ログイン無しのため。
  2. **盤面注入フック**（`BattleScreen` に dev 限定で初期 PlayerState を流し込む口）＝特定盤面への決定的到達のため。
  3. 本ドライバ（Playwright）をログイン→CPU戦→注入→効果発火→スクショへ拡張。

現状ハーネスは上記 1・2 が無くても回せる範囲（engine＋収集配線）を実ブラウザで観測する。フル BattleScreen 検証は 1・2 整備後の follow-up。

## シナリオ（現状3件＝今セッション実装分）
1. `SIGNI_GRANT_CHOSEN_ABILITY`（WXK09-050）＝CHOOSE2択でバフ済み＜電機＞にダウン保護付与。
2. `BANISH_ATTACKER_IF_WEAKER_THAN_FRONT`（WD07-012）＝収集配線込み・正面より低パワーのアタッカーをバニッシュ。
3. `CONDITIONAL_GROW_AND_KEY_DISABLE`（WXK02-029）＝条件付きグロウ＋全キー能力喪失。

新シナリオは `src/verify/main.ts` の `scenario*()` を足すだけ（golden と同じ盤面ビルダー）。
