# パーサー改善 計画（収穫マージ時代）

> 前提：`build:effects` は **richness ガード付き収穫マージ**化済み（`buildEffectsJson.ts`）。
> パーサーを直す→`npm run build:effects`→**無損失な改善だけJSONへ自動収穫**。手作業は温存。
> バックログの定量は `docs/parser_backlog.md`、本書は**順序・手法・ガードレール**。

## 0. 現在地
- ブランチ `fix/parser-harvest-merge`（PR #1・未マージ・要実機検証）。
- 完了：収穫マージ基盤＋クリーン修正3件（POWER_MODIFY「他の＜種族＞/色」・activeCondition「[色/クラス]あるかぎり」・activeCondition「《X》か《Y》」）。
- **要レビュー(held)＝411**（= 現パーサーが既存JSONを再現できない札。これを 0 に近づけるのが表現完成）。

## 1. ガードレール（毎回必須・失敗から学んだ鉄則）
1. **広い `.*` ゲートの既存ハンドラに手を入れない／全文 `parseColorFilter(t)`・`parseStoryFilter(t)` を足さない**。
   - 実績：trash→hand に色/種族を全文スキャンで足し**205件誤付与**／energy-trash の数・「まで」を全文で拾い**held +15**。いずれも破棄。
   - filter・数・「まで」は**対象の名詞句に限定**して正規表現キャプチャから取る。
2. **追加は `^` アンカーで即 return する関数（`parseActiveCondition` 等）を最優先**＝他パターンへの干渉が原理的に無い。
3. **収穫マージのガードは「喪失」しか弾かない＝誤った“追加”は通る**。だから1パターン直すごとに：
   - `npm run typecheck`（`tsc -b`）緑
   - `npx tsx scripts/buildEffectsJson.ts` → **held が増えていないこと**（`analyzeHeldCards.ts`）＝回帰センチネル
   - HEAD との leaf 差分で **劣化0**、かつ **adopted_gain を目視**（誤った追加が無いか）
4. **パーサーが“より豊かな構造”を出す変更（triggerFilter・「そのシグニ」参照等）はエンジン対応とセット**（memory `decompile-engine-parity`）。エンジン未対応のまま出すと「逆翻訳は正しいのに動かない」偽陰性を作る＝**先にエンジン支援を確認、無ければ Phase3 へ回す**。
5. コミットは**小さく**ブランチへ。decompile シートは**バッチ完了ごとに再生成**（古いまま放置しない）。

## 2. フェーズ計画（リスク／効果順）

### Phase 1 — クリーンな表現修正（パーサーのみ・低リスク）★今ここから
`parseActiveCondition` など `^`アンカー関数への**狭いパターン追加**。1件ずつセンチネル確認。
- 残 activeCondition 変種：
  - 「あなたのルリグトラッシュにアーツがあるかぎり」→ `LRIG_TRASH_COUNT`（WDK03-015）
  - 「場にレゾナがあるかぎり」の `isResona:true` 補完（WX10-056/058・ただし別効果でheld残のため低優先）
  - 「トラッシュ/エナに＜X＞がN枚以上あるかぎり」等の未対応バリアント
- 期待効果：held を確実に削る・回帰ほぼ0。**1コミット=1〜数パターン**。

### Phase 2 — 中規模（パーサー＋エンジン確認）
**エンジンが既に支援しているトリガー**に限定して triggerFilter/scope と「そのシグニ」参照を出す。
- triggerFilter 付き `ON_BANISH`（self/＜story＞）＝**既存15カードで支援確認済み**。例：**WX05-025-E1**（あなたの＜美巧＞のシグニがバニッシュされたとき→そのシグニをエナから場に）。
- 手順：①該当文でパーサーが triggerFilter+scope を出す ②エンジンが当該 timing でフィルタ評価しているか確認 ③「そのシグニ」= `targetsTriggerSource` の対応確認 ④無ければ Phase3。
- 対象：backlog「triggerCondition脱落 51」のうち**支援済み timing の分**。

### Phase 3 — 大型機構（新トリガー/新アクション＋エンジン実装）
- 新規複合トリガー：「ガードするか/シグニのアタックを効果で無効にしたとき」（WX05-025-E2）等＝新 timing＋エンジン。
- 「値変更: timing/type」クラスタ（計~263・大半は効果分割ズレの誤検出）＝**1件ずつ原文照合**で真の誤りだけ拾う。一括修正しない。
- 広域ハンドラの**ゲート狭小化リファクタ**（energy-trash 等）＝名詞句スコープ化してから数・「まで」を拾い直す。

## 3. 完了の定義（DoD）／計器
- **センチネル：held（`analyzeHeldCards.ts`）は単調減少**。1コミットで増やしたら原因を潰すかrevert。
- 各バッチ：HEAD leaf 差分で**劣化0**・**adopted_gain 目視**。
- バッチ後：`decompileEffects.ts --sheet N` 再生成＋`genReviewRepr/groupSimilar/groupBySentence` で **同型★** を確認（P1_PLAN §6）。
- 最終：held を可能な限り 0 に。残りは「機構待ち（Phase3・理由明記）」へ分類（P1_PLAN §1 DoD と接続）。

## 4. 運用メモ
- 調査：`scripts/analyzeHeldCards.ts`（held のパーサー取りこぼし分類）／単発確認は `scripts/_dbgFresh.ts`（gitignore）。
- レポート：`docs/effects_merge_report.md`（gitignore・採用/温存の全ID）。
- 関連：`parser_backlog.md`（定量バックログ）・`P1_PLAN.md`（全体方針・バトン）・`DESIGN.md`。
