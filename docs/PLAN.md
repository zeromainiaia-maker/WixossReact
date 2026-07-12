# PLAN — 開発計画（統合版）

> **2026-07-03統合**：以前は「今後の予定」を決める文章が `P1_PLAN.md`／`ROADMAP.md`／`TODO.md` の3つに分かれていて分かりにくかったため、この1本の `PLAN.md` に統合した。旧3ファイルは削除済み（内容はすべてここに移した）。
> **3人は同時に作業せず、順番に push / pull で引き継ぐ（バトン式）**。新セッション（cold start）は **本ファイル §4「現在地とバトン」→ `DESIGN.md`** の順に読む。
> 個別の修正記録は [BUGFIXES.md](./BUGFIXES.md)（新しいものを上に追記）。**原文照合の主軸ツールは [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)**（実行結果の目視照合・LLM不使用・決定論）。補完的発見器は [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（LLM意味比較）。
> **消化済みバッチ・完了項目の詳細履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) に分離（2026-07-07）**＝本ファイルは「現在地・ルール・生きている worklist」だけを保つ。完了項目を増やしたら詳細は PLAN_DETAIL.md へ移し、ここには1行の ✅ サマリだけ残す。

---

## 0. 全体像（3+1フェーズ）

| 層 | 内容 | 検証手段 |
|---|---|---|
| **① 表現 P1** | JSON がカード原文を正しく**表現**する | 逆翻訳一致／同型★0／BEHAVIOR_AUDIT キュー消化 |
| ② 実行 P2 | エンジンが各DSL構文を正しく**実行** | golden型網羅／smoke／fuzz／BEHAVIOR_AUDITで見つかる実行バグの解消 |
| ③ 挙動 P3 | 実ゲームで各カードがルールどおり動く | 実機/自動対戦テスト（`scripts/verifyBattleDrive.mjs`） |
| ④ 対戦体験 | CPU AI がメインフェイズで能動行動し、一人でも通しで遊べる | 実機通し対戦・fuzz重め |

**注意**：①の「逆翻訳一致」は "JSONがテキストを表す" ことのみ保証。実機での正しさ(③)は別。各コミットは**「要実機検証」**を付す。

---

## 1. 現在の方針＝BEHAVIOR_AUDIT が主軸（2026-07-03〜）

「JSON が原文を正しく表現しているか」を JSON を読んで判定するのではなく、**engine で実際に効果を実行した結果（盤面差分＋ログ）を原文と並べて人間が目視照合する**。LLM不使用・決定論・無料・回帰資産。詳細・使い方・現在のキュー件数は **[BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)** を参照。

- この方式は「逆翻訳が原文と文字列一致するか」だけでは見つからない**実行時の真バグ**（engine dispatch未配線・トリガー主語ミス・未実装action型・誤った自作実装）を多数発見している（2026-07-03〜の1週間で10件以上の実バグ）。
- **この作業はP1（表現）とP2（実行）の境界を跨ぐ**：逆翻訳の系統的誤表示（表現バグ）と engine の未配線・no-op（実行バグ）の両方をこの1つのツールが同時に炙り出すため、フェーズ区分は目安として運用する。
- 補完的発見器＝[SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（BEHAVIOR_AUDITの盤面差分では拾えないSTUB/MANUALの意味エラーに強い）。

## 2. Definition of Done（完了条件）

- [x] 全シートで **同型★ = 0**（`docs/grouped_all.txt`・`node scripts/groupSimilar.mjs --all` で再生成）。**達成・維持中**。
- [x] 「⚠脱落疑い」リストの各カードが、**偽陽性**／**修正済**／**機構待ち（理由明記）** のいずれかに分類済み。**✅2026-06-28＝255枚を全分類**（偽陽性179／機構待ち72／修正済）。`node scripts/_dropTriage.mjs`・明細 `docs/_drop_triage.txt`。
- [x] 残る大型機構（§10）が実装＋配線済み、または明確にスコープ外と合意。**✅2026-06-28＝B1-B4を全完了**。残るは **C（engine 実機配線・全 R5-R58 と B1-B4 は要実機検証・§7）＝P2/P3 スコープ**。
- [~] **逆翻訳機（`scripts/decompileEffects.ts`）の出力品質＝原文一致**（2026-06-30 着手・2026-07-03に主作業の座は次項へ譲った）。英語ID漏れ 582→367（BUGFIXES⑩〜㉒）、レンダラ5系統是正済。残＝§5b（低優先のテール）。
- [ ] **🆕 BEHAVIOR_AUDIT の要レビュー・キューを逓減限界まで消化**（2026-07-03 着手・現在の本丸）。指標＝`node scripts/_bqTriage.mjs` の高シグナル件数（811→285→261→169→129→30…と逓減中）。
- ⚠ **「脱落疑いの件数」は完了指標にしない**（メトリクスが粗く内容修正で減らないため。§3参照）。

## 3. 不変の運用ルール（全員必須）

- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的＝絶対に実行しない。** JSONは直接パッチ（`effectId` をアンカーにした `.mjs` で外科的に）。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。語彙が無ければ §10 の機構として実装するか、`engineUnwiredTimings` に登録し逆翻訳へ `【※engine未配線】` を付けて明示する。[[decompile-engine-parity]]
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（Git Bash 経由の `node -e` は文字化けする）。papaparse 等が要るカード参照スクリプトは project root に一時 `.ts/.mjs` を置いて `npx tsx`/`node` 実行・終わったら削除。
- **件数メトリクスを信じない**：「脱落疑いNN枚」は「。区切り文数」比較で粗く、逆翻訳器は複数効果を1行（、／そして）に圧縮するため内容を直しても件数は減らない。`_dropTriage` の分類（「文法崩れ」等）も構造ベースで文法品質は測れない。判断は必ず **同型★0＋該当カードの逆翻訳が原文一致（目視/grep）** で行う。
- **ゲートは `npm run typecheck`（＝`tsc -b --noEmit`）**。plain `tsc --noEmit` は project references を見ず CI が拾うエラーを見逃すので不可。
- **全再生成系の一括置換は禁止**（無検証置換で約90枚退化の前例）。系統ごとに機構を1回確立→同パターン適用→各カード verify。
- **CSV の順番を必ず維持する**（スクリプト内の `sorted` ロジックで対応済み）。

### 標準ワークフロー（1カード/1巡）
①要レビュー・キュー（`npm run audit -- --id <CardNum>` または `docs/grouped_sentence_all.txt`）を見る→②欠落把握→③`effects_*.json` を既存語彙で直す→④`npm run typecheck`→⑤〜⑥`npm run regen`（**全シート＋下流を UTF-8 直書きで一括再生成**。旧「Bash の `>` で1枚ずつ」は不要＝2026-07-07に `--sheets` モード化・下流に UTF-16 混入ガードあり）→⑦逆翻訳が原文一致＆同型★0を確認→⑧engineを触ったら `npm run smoke && npm run golden && npm run fuzz`（一括なら `npm run gates`）→⑨`BUGFIXES.md` に追記→⑩本ファイル §4 を更新→commit/push。

### 標準ワークフロー（1ラウンド＝横展開・系統バグ向け）
①**抽出**：全シート走査で「同じ壊れ方」を機械抽出（`scratchpad` の `scan*.mjs` が雛形）。②**分類**：偽陽性(§9)・既知複雑札を除外し、クリーンな系統を確定。③**パッチ**：`effectId` をアンカーにした一括スクリプトで安全に置換（他カードを巻き込まない）。MANUAL化する場合は `parseStatus:'MANUAL'`。④**検証ゲート**：上記ワークフローの④〜⑦と同じ。⑤**記録＆バトン**：`BUGFIXES.md` に追記（新しいものを上）→本ファイル §4 を上書き→コミット（末尾に「要実機検証」）→push。

### 機構実装の「型」
1. `src/types/effects.ts`（アクション/条件/timing の型）→ 2. `src/types/index.ts`（`PlayerState` 状態フィールド）→ 3. `src/engine/effectExecutor.ts`（実行）/`execUtils.ts`（`evalCondition`/`matchesFilter`）/`effectEngine.ts`（CONTINUOUS収集）→ 4. `src/screens/BattleScreen.tsx`（状態読み取り＋**ターン境界リセット3箇所**：PvP通常終了・PvP確認後・CPU）→ 5. `scripts/decompileEffects.ts`（表示）→ 6. JSON 配線 → 検証。

### 主要ファイル
- 語彙: `src/types/effects.ts` / `src/types/index.ts`（PlayerState）
- エンジン: `src/engine/effectExecutor.ts`（`execLookPickChain`/`payBeatSigniCost` 等）・`execUtils.ts`（`evalCondition`/`matchesFilter`/`addToBeatZone`）・`effectEngine.ts`（CONTINUOUS収集・`checkActiveCondition`）
- UI/ルール: `src/screens/BattleScreen.tsx`（コスト計算・バトル・ターン境界リセット・`crashOneLife`）
- 逆翻訳器: `scripts/decompileEffects.ts`、グルーピング: `scripts/group{Similar,BySentence}.mjs`（`--all` で全10シート統合）
- 監査: `scripts/behaviorAudit.ts`（`npm run audit`/`audit:html`/`audit:queue`）

### モデル分担（Sonnet 5 / Opus 4.8）
**判断軸＝「コーディング難度」ではなく「意味的退化を見極める検証規律が要るか」**。ゲート（smoke/golden/fuzz/同型★0/census baseline・CI）は**モデル非依存の自動ガード**でクラッシュ・構造破壊は必ず捕まるが、**「全ゲート通過なのに意味が間違っている」退化はゲートを素通りする**（PLAN が警告する「無検証置換で約90枚退化の前例」の失敗モード）。ここの見極めだけがモデル依存。

- **Sonnet 5 で回せる（定型消化・データ単点修正）**：
  - §5c の**パイプライン機械実行**（`build:effects`→`heldReview`→ゲート→シート再生成→commit の定型サイクル）。
  - **owner/値/duration の単点修正バッチ**（parser/engine 変更なし・原文照合が素直なもの。続き31 の「対戦相手のデッキ削り」owner是正が典型）。
  - BEHAVIOR_AUDIT の**キュー再生成＋トリアージの一次選別**（真no-op候補の抽出まで）。
  - ⚠**必須ガードレール**をプロンプトに固定：①**採用前に必ず `build:effects` 再生成→fresh vs live-curated 精密diff＋decompile対原文照合。`heldReview` の diff 表示・`census:clusters` の枚数は古くなりうるので鵜呑みにしない**（続き31で committed `_held_fresh.json` が古く、採用済みの WX21-043/WX24-P2-046 が旧 diff で held 残存していた）。②**1バッチ＝parser/engine 変更なしに限定**。③採用後 `git show`/機械diff で「意図した数枚のみ変更」を確認。④**「curated が正・fresh が誤り」の据置系**（EXILE→TRASH＝ゲーム除外を正しく温存・owner:opponent→undefined 脱落・「このシグニ」→ALL 化・「あなたのトラッシュ」→opponent 化）は**触らせない**明示。

- **Opus 4.8 で行う（機構・語彙の新規実装＋退化の見極め）**：
  - **parser/engine への新規語彙・機構**（§10 大型機構・§6.3 worklist・**内側トリガー語彙拡充＝triggerScope/自己参照**＝引用付与残107 の本丸）。共有パーサ変更は回帰面が広い。
  - **意味的退化の見極めが要るバッチ**（「代わりに」置換・CHOOSE平坦化復元・条件節持ち上げ等、fresh が退化しうる系。全数機械分類→偽陽性を先に切る判断）。
  - **リファクタ Stage2/3**（BattleScreen コントローラ設計）。
  - BEHAVIOR_AUDIT の**真no-op vs シナリオ空振りの最終仕分け**とengine修正。

#### 現在の割付（2026-07-11・続き69後に全面再割付＝残作業を §5b/§6/§7/§8 から総ざらい。旧版は git 履歴と [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) で追える。消化済み割付の詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)＝続き42-47・続き56-69 の2セクション）
> 運用＝**セッション開始時に、下のどちらのリストから取るかでモデルを決める**。トークン節約のため Sonnet 在庫があるうちは Sonnet で回し、Opus は「機構・語彙を新しく開く」バッチに集中投入する。**Opus が1バッチ開く→Sonnet が再収穫＋ゲート＋簿記で消化する交互サイクル**（続き34→35 で実証済み）。定型作業は必ずスキル（`/census-batch`・`/audit-card`・`/baton`）の手順に従う。**Sonnet が作業中に見つけた engine/parser バグはその場で直さず Opusタスク12 へ登録**。

**Opus のタスク（推奨順・機構/語彙の新規実装と退化見極め）**：
1. **GRANT_QUOTED_AUTO_ABILITY の内側 ability parse**（引用付与残107 の本丸）。**🆕続き75で第1弾を消化＝✅**(a)**`GRANT_TO_PLACED_SIGNI` STUB（WX24-P1-017/WX25-P3-038）を `GRANT_EFFECT{targetsLastProcessed, rawText}` へ振り分け**＝`expandGrantEffectRawTexts`（内側 parseBlock 展開）＋`execGrantEffect`（lastProcessedCards へ適用）＋`granted_effects`（ターン終了時失効）の**既存3機構が噛み合って engine 新規実装ゼロで動く**ことを確認。(b)**内側トリガー語彙の欠落を発見・修正＝「…がバトルによってシグニをバニッシュしたとき」が parser に無く、31枚が `ON_PLAY`（場に出たとき）へ誤フォールバックしていた**（engine は最初から配線済みだった＝`battleBanishEntries`）。(c)**「このシグニをアップし、<残り>」複合文で先頭の UP が無言脱落**していた（6枚＝再攻撃コンボの定番でデメリットだけ適用されていた）。計24枚採用・golden 192・census 1557 維持。詳細 BUGFIXES 続き75。**残＝(i) WX25-P3-038 の内側「代わりに」置換（＝タスク6の置換機構と合流）・(ii) 引用付与の内側品質不全の再収穫（他の内側トリガー語彙・`GRANT_LRIG_ABILITY` の ON_PLAY 誤デフォルト＝タスク5）**。
2. **census「動的比較」の残**＝WXEX2-28（直前配置シグニ基準＝last-processed相対で別系）・条件文（WXK08-005）・opp/own センタールリグ（WXK11-003）。自己参照/トリガー参照/designation/anyAlly/printed/lastProcessed/デッキ相対SEARCH/lrig相対 は続き43-47・67-68で✅消化済み（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md)）。
3. **DRAW脱落の parseSingleSentence 直呼び経路 systematic**（19枚・入れ子SEQUENCE＝続き59 の follow-up）。
4. **§5c census 条件節の残**（ARTS_USED拡張・「代わりに」WX25-P2-068/070・「あり」複合条件WXDi-P11-048）。
5. **持ち越し済みの engine/parser 拡張の小口**＝WXDi-P03-005（PAID_ADDITIONAL_COST の「置換モード」拡張）・WX26-CP1-100（SEND_TO_ENERGY のトラッシュ対象化）・GRANT_LRIG_ABILITY系5枚の parser ON_PLAY 誤デフォルト修正・WX25-CP1-051/WXDi-CP02-070 の owner:any・excludeSelf 欠落・続き33発見の原文無関係 `TRANSFER_TO_DECK` 混入5枚（WX24-P2-033等）・SEQUENCE下流「そうした場合」IS_MY_TURN常時真連鎖の精緻化・PR-Di038 duration・WX25-P2-095・WXEX2-50-E3 step2 のレベル制約未反映・WX12-008 exceed-cost timing・WXK10-033-E1 据置確認・WXEX2-25-E3 の decompiler levelLtSelf 描画固定。
6. **「代わりに」残テールの機構系**＝D:置換ルール9（バニッシュされない系＝置換機構）・C:コスト代替6・E:リコレクト2・B1残10の条件語彙（§6.3）＋WX16-021（置換ルール→即時LIFE_CRASH幻覚＝同じ置換機構）。
7. **§6.1 未実装action型 残11種27効果の engine 実装**（instant層＝PLAY_FREE_FROM_TRASH／STACK_SPELL／PREVENT_DAMAGE・CONT層＝COST_SUBSTITUTE／SELF_TRASH_PREVENT／COLOR_INHERIT／GRANT_FIELD_SHADOW）。
8. **§6.3 大型機構**（ゲーム除外＝WXDi-P04-016-E3 とセット・canCardGuard 統一・多段閾値 nested CONDITIONAL・スペル被破棄【自】収集パス・ON_LEAVE_FIELD 相手scope 3枚・出現条件レゾナ35・正面32の parser 未配線調査）。
9. **§6.2 semantic audit 系統残の機構対応**＝系統①(b)「あなたか対戦相手」`owner:'any'` 選択18枚（engine/decompiler の選択対応・opponent への flip 禁止）・(c)混在10枚のノード単位判別・系統②残（SEQUENCE内 GRANT_PROTECTION＝WX08-017・LAYER付与＝WX15-031・広域24件の subjectFilter/新機構）。
10. ~~**CHOOSE平坦化復元 held の最終見極め＋採用**~~ **✅完了（続き76・Opus）＝パターンA〜F をすべて解決**（詳細 BUGFIXES 続き76）。**A**=丸数字クラスが④止まりで**⑤が④に吸収**（5択カード）・**B**=FREEZE/NEGATE_ATTACK が**ルリグ対象を見ずシグニに潰す**（engine の LRIG 分岐も新規実装）・**C**=STUB誤マッチ（効果ドロー禁止 BLOCK_ACTION を engine ごと実装／「選んだ能力を得る」は STUB へ委譲）・**D**=「ライフクロスが**ちょうど**N枚の場合」の条件ゲート脱落（**無条件に自分の全シグニをトラッシュ**していた）・**E**=汎用 DRAW/ENERGY_CHARGE の **owner が self 固定**（相手を利するデメリットが自分の利益に化ける）＋手札 EXILE の実装・**F-1**=連用中止形「Aし、Bする」で**先頭の動作が無言脱落**（47枚）・**F-3**=スペルの【自】ブロックが本体に流入・**F-4**=遅延トリガー「次のアタックフェイズ開始時」の即時化（engine の遅延収集も新設）・**F-2**=「代わりに」の条件語彙を新設（`HAND_TRASHED_BY_OPP`/`ENERGY_TRASHED_BY_OPP`）。
11. **BEHAVIOR_AUDIT 高シグナル22 の最終仕分け＋engine修正**（🆕続き77・Sonnetタスク4でキュー再生成＝210/9288→263/9293〔続き76のparser大規模変更でキュー内容が入れ替わったため増加〕・`node scripts/_bqTriage.mjs` で高シグナル19→22件を再選別＝WX04-003/WX04-082/WX04-099/WX04-102/WX07-045/WX08-029/WX09-012/WX12-010/WX22-Re01/WXEX1-12/WXEX2-51/WXDi-P02-034/WXDi-P04-065/WXDi-P09-079/WXDi-P16-013/WX24-P1-015/WX24-P2-049/WX25-P2-009/WX25-CP1-040/WXK01-021/WXK03-075/WDK03-001。トリガー主語系・CHOOSE分岐・出現条件レゾナ WX09-012/WX12-010 は継続）。
12. **Sonnet が積んだ engine/parser バグの修正（常設受け口）**＝Sonnetタスク1（実機検証）・4（一次トリアージ）・8（semantic audit）の観測結果を受けて修正する。**✅続き78（Opus）で在庫8件を全消化**＝(a)EXILE→TRASH誤変換7枚系統（parser にEXILE 3形を新設・5枚は fresh==curated 化・TK1A timing是正/P13-089 no-op是正を採用）・(b)多段「あるかぎり」2枚（**真因2本を発見**＝genericKagiri の引用跨ぎ消費と qfSelf 貪欲丸呑み。`THIS_CARD_HAS_UNDER{filter}`/`rawStages`/`LOSE_SIGNI_BARRIER` 新設＋**連用中止「パワーは＋Nされ、<B>」系統48枚**へ横展開）・(c)条件ドロップ3枚（ガードC例外化＋manualEffects triggerScope追加）・(d)inner duration（`restoreLeadUntilEndOfTurn` 共通化＝**母集団112枚を機械分類で一括採用**）・(e)GRANT_CHOSEN_ABILITY汎用ハンドラ点検（実欠陥は WXK08-026 の `_SELF` 誤対象選択＝効果元自動化＋クラス限定適用を追加）。**計148枚採用・golden 230・census 1483**。詳細 BUGFIXES 続き78。**🆕新規在庫4件（続き78/81で発見・据置）**：(i)**SP27-002-E3**＝引用付与内側の「このシグニの正面のシグニのパワーが15000以上であるかぎり」条件が genericKagiri（isTimingMarker＝**無言消費で PARTIAL にもならない**）で脱落し無条件アサシン付与に退化＝**genericKagiri の isTimingMarker 設計を silent-fallback 刻印に見直す系統課題**。(ii)**WXDi-P10-035**＝連用中止復元の引用内【自】で「それを手札に戻す」が `BOUNCE{target.owner:'self'}` にエンコードされる＝`TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST`+lastProcessed 慣例との整合を要精査。(iii)**WXK09-050**＝parser規則（続き76 タスク10 パターンC）が `GRANT_CHOSEN_ABILITY` を再生成し続け held に残存＝Part1固有ハンドラ（パワー比較フィルタ）との dispatch 設計を解消するまで採用不可。(iv)**🆕続き81＝`applyDirectAction`（`effectExecutor.ts:4696`）のTRASH/HAND_CARD分岐（4781-4792行目付近）が`hand_discarded_just`/`turn_hand_discarded_count`/`hand_trashed_by_opp_this_turn`の3フィールド更新を欠く**＝§7実機検証（`trashCounterOpp`＝WX14-040-E3）で発見。`TRASH{HAND_CARD,count:'ALL'}`等の即時適用パス（`applyTrashHand`）はこの3フィールドを正しく更新するのに対し、`count:1`等でSELECT_TARGET経由・`resumeSelectTarget`で再開する経路だけこの更新ロジックが丸ごと抜けている＝**`TRASH{type:HAND_CARD,count:1}`を使う全カードが影響対象**（ON_HAND_DISCARDED不発火・`turn_hand_discarded_count`条件不成立・`HAND_TRASHED_BY_OPP`条件＝「代わりに」置換起点の不成立、を併発しうる）。修正自体は`applyTrashHand`と同じロジックの追加で見込みだが、影響範囲（該当カード母集団・ENERGY_CARD/SIGNI分岐にも同型欠落がないかの点検）の精査が要る。再現＝`node scripts/verifyBattleDrive.mjs trashCounterOpp`（既定order外）。詳細 BUGFIXES 続き81。(v)**🆕続き82（Sonnet・golden型網羅追加中に発見）＝`applyDirectAction`（`effectExecutor.ts:4696`）に`ENERGY_CHARGE`/`STORY_CHANGE`（他複数型）のcaseが無く、`default`節が`executeAction(action, {...ctx, lastProcessedCards:[cardNum]})`で元アクションを丸ごと再実行してしまう**＝SEARCH等で1枚選んだ後の`then`適用や`selectOrInteract`のSELECT_TARGET解決後に、選んだ`cardNum`を無視して`ENERGY_CHARGE`の`target`（`DECK_CARD`等）を素通しで再評価するため、(a) `target.type`が`HAND_CARD`/`TRASH_CARD`以外（`DECK_CARD`含む）だと`else`分岐で`fieldCandidates`（**場のシグニ**）を候補にしてしまい、選んだデッキ/トラッシュ札は消えたまま場のシグニ選択SELECT_TARGETへすり替わる（実カード母集団81件＝WX07-017/WX08-003/WX08-072/WX10-003等の「デッキから探して見つけたカードをエナゾーンに置く」＝`SEARCH→then:ENERGY_CHARGE{target:DECK_CARD}`パターンが対象）。(b) `ENERGY_CHARGE`を`target.count`が`'ALL'`でなく`1`等の外部`SELECT_TARGET`経由で直接使う構成（現状は実カード0件・型としては存在）だと、再実行のたび同じSELECT_TARGETが繰り返し発行され続けautopilotが無限ループする（`goldenTest.ts`で`autopilot hang`として実測）。**再現**＝`scripts/goldenTest.ts`の「ENERGY_CHARGE」テストをcount:'ALL'ではなく`count:1`のSELECT_TARGET経路で書くと即再現（続き82でcount:'ALL'に迂回して回避済み・詳細はgoldenTest.tsの当該テストのコメント参照）。**影響範囲の精査が必要**＝`applyDirectAction`の`case`一覧（BANISH/BOUNCE/SEND_TO_ENERGY/TRASH/EXILE/LEVEL_MODIFY/POWER_MODIFY/POWER_MODIFY_BY_TARGET_LEVEL/POWER_MULTIPLY/ADD_TO_HAND/ADD_TO_ENERGY/ADD_TO_BEAT/TRANSFER_TO_HAND/ADD_TO_FIELD/ATTACH_ACCE/SEQUENCE/NEGATE_ATTACK/BLOOD_CRYSTAL_ARMOR/PLACE_UNDER_SOURCE_SIGNI/DOWN/UP/FREEZE/GRANT_KEYWORD/GRANT_EFFECT/TAKE_FROM_UNDER_SIGNI/REMOVE_ABILITIES/ADD_TO_LIFE）に無い型がSEARCH/LOOK_PICK_CHAIN等の`then`やSELECT_TARGET解決後の`thenAction`として使われていないか（`STORY_CHANGE`は実カード母集団0件で現状無害・`POWER_SET`はCONTINUOUS専用でeffectEngine側の別経路のため無関係と確認済み＝ENERGY_CHARGEのDECK_CARD/TRASH_CARD/フィールド経由が主対象）の全数チェックが要る。**🆕続き83（Sonnet・golden型網羅追加続行中に追加確認）＝`POWER_MODIFY_PER_LRIG_LEVEL`（実カード11件中7件がACTIVATED・target count:1）と`POWER_MODIFY_PER_FIELD`も`applyDirectAction`に自身のcaseが無く同型の穴を持つ**（`count:'ALL'`に迂回してgolden追加を完了・詳細はBUGFIXES続き83）。一方で`POWER_MODIFY_BY_SOURCE`/`POWER_MODIFY_PER_TRASHED_LEVEL`/`POWER_MODIFY_PER_HAND_COUNT`/`POWER_MODIFY_PER_CHARM`(trashed_this_effect分岐)/`POWER_MULTIPLY`は内部で`POWER_MODIFY`等の対応済みアクションへ委譲するため無関係と確認済み＝**影響対象は「`applyDirectAction`のswitchに自身のcaseが無く、かつ委譲もしないtarget-based型」に絞り込めてきた**（ENERGY_CHARGE/POWER_MODIFY_PER_LRIG_LEVEL/POWER_MODIFY_PER_FIELDの3型が確定・他は golden型網羅の残49型を消化する過程で追加確認予定）。(vi)**🆕続き84（Sonnet・golden型網羅追加続行中に発見・上記(v)とは別系統のバグ）＝`POWER_MODIFY_PER_DECK_COUNT`（実カード1件のみ＝PR-442・CONTINUOUS）が`effectEngine.ts`のCONTINUOUS計算層に一切実装が無い**＝`effectExecutor.ts:4079`の`case 'POWER_MODIFY_PER_DECK_COUNT': return done(addLog(ctx, 'デッキ枚数比例パワー（effectEngine処理）'))`というコメントは**虚偽**で、`effectEngine.ts`を`grep -i deck_count`しても該当実装が存在しない（`POWER_MODIFY_PER_STACK`/`PER_LEVEL_SUM`/`PER_LRIG_LEVEL`等の隣接する型はすべて`calcFieldPowers`内に`extractPowerModifiesPerXxx`ヘルパーと処理ブロックがあるのに、この型だけ丸ごと欠落）。**実害＝PR-442「デッキ10枚につきパワー+4000」が常に無効化されている**（golden追加中にCONTINUOUS経路で検証しようとして発覚。テストは書かず見送り）。母集団は1枚のみで優先度は低いが、実装パターン自体は既存の`extractPowerModifiesPerLifeCount`等をコピーすれば軽微。(vi-2)**🆕続き93（Sonnet・smoke SKIP分析中に発見）＝`applyDirectAction`の未対応型を機械分類で網羅＝(v)(vi)の`ENERGY_CHARGE`/`POWER_MODIFY_PER_LRIG_LEVEL`/`POWER_MODIFY_PER_FIELD`に加えて`TRANSFER_TO_DECK`（125件・最多）・`GRANT_PROTECTION`（69件・トップレベル母集団73カード）・`POWER_SET`（10件）の3型も同型の穴と確定**＝`scratchpad-verify/tmp_skipTypeAnalysis.mjs`（smokeの「autopilot loop: SELECT_TARGET」258件をaction木で分類）で機械的に特定。全て`applyDirectAction`にcaseが無く`default`節が同一SELECT_TARGETを再発行し続ける同一の設計欠陥＝**実UIでは対象選択を無限に繰り返し要求されターンが進行しなくなる実害バグ**（プレイヤー体感としては操作不能フリーズ相当）。修正パターンは(v)と同一（各型に`applyDirectAction`のcaseを追加するだけ）。詳細 BUGFIXES 続き93。(vi-3)**🆕続き95（Sonnet・§7 R37「他4枚」実機検証中に発見）＝`collectPowerZeroTriggers`（`triggerCollect.ts:195`）が`field.lrig`を走査せず、LRIGカードのON_SIGNI_POWER_ZERO_OR_LESS watcherが構造的に絶対発火しない**＝他の大半のトリガーコレクタ（`collectFreezeTriggers`等）が使う共通ヘルパー`ownFieldSources(state)`（signi最上段＋lrig最上段の両方を含む）をこの関数だけ使わず`field.signi`のみ手書き走査している設計漏れ。**該当2枚（WX22-013・WXDi-P14-009）は印刷テキストの能力が一切機能していない実害バグ**（残り4枚のシグニタイプwatcherは正常動作・続き39/94で実機確認済み）。実機シナリオ`powerzeroWX22013`/`powerzeroWXDiP14009`で非発火を確認（呼び水の-1000適用自体は正常＝engine側の切り分けは明確）。修正パターンは軽微＝該当箇所を`ownFieldSources(watcherState)`ベースの走査に置き換えるだけの見込み。詳細 BUGFIXES 続き95。(vii)**🆕続き89（Sonnet・checkAllEffects MANDATORY_SUSPICIOUS精査中に発見）＝「アップ状態のこのシグニをダウンしてもよい」系で対象/自己混同・条件欠落の構造的バグ7件**＝(a)**WX25-P1-055／WXDi-P04-059**＝原文は「対象を選ぶ→自身を任意でダウン→そうした場合対象をバニッシュ」の3段構成だが、JSONの`DOWN`が対象選択フィルタ（`owner:opponent,powerRange`等）を誤って持ち、自分をダウンする代わりに相手シグニをダウンするだけになっている（後続`BANISH`も対象フィルタなしで無関係化）。(b)**WX25-P3-089**＝同型の対象/自己混同＝`DOWN`が「他の＜迷宮＞のシグニ」フィルタを持ち自分ではなく対象をダウンしようとし、かつ本来「対象への能力付与」の後続が`DRAW`に化けている。(c)**WXDi-P13-074**＝ダウン対象フィルタに原文の「《ディソナアイコン》」条件が欠落（アイコンフィルタ機構の要否を要確認）。(d)**WXDi-CP01-040**＝「公開したカードが＜バーチャル＞の場合のみ引く」条件が欠落し無条件ドロー。(e)**WXDi-P15-084**＝原文「対象ルリグへターン終了時までの能力付与」がJSONで即時`TRASH`に化けている（GRANT_EFFECT等への再構成が要る）。(f)**WX25-P2-112**＝ダウン対象が`SIGNI`だが原文は「ルリグ」＋トラッシュ対象の色フィルタ（「ダウンしたルリグと共通する色」）も欠落。(g)**WX06-006（POWER_VALUE_MISMATCH）＝「代わりに」置換パターンの機構欠落**＝原文「対戦相手のシグニ1体に-12000。センタールリグが黒でライフクロス2枚以下の場合、代わりに2体まで-15000」が条件チェックなしで両方の`POWER_MODIFY`を無条件連続実行（Opusタスク6の置換機構が前提）。単点是正7件（DOWN.optional欠落）は同セッションで修正済み（詳細BUGFIXES続き89）。(viii)**🆕続き90（Sonnet・checkAllEffects MANDATORY_SUSPICIOUS精査の続き）＝残る7件の複合バグ**＝(a)**WX26-CP1-048**＝「このシグニが＜プリオケ＞の効果によって場に出ていた場合」という出自条件が丸ごと欠落＋「共通する色を持つ場合、対戦相手は【エナチャージ1】をしてもよい」の色条件・owner（現状`self`だが`opponent`が正）・optionalがすべて欠落。(b)**WXDi-P10-034**＝「次のあなたのメインフェイズ開始時、そのカードを表向きにしてもよい。そうした場合は+5000、そうしなかった場合は手札に加える」という遅延トリガー＋二分岐の結果がJSONに一切表現されていない（LOOK_AND_REORDERで裏向き配置するところまでしか実装されていない）。(c)**WX16-038**＝「それが《ライズアイコン》を持つ＜武勇＞のシグニの場合」という条件フィルタがADD_TO_FIELDに欠落＋optional欠落＝任意の公開カードを無条件で場に出してしまう。(d)**WX16-070**＝「レベルを+1するか+2してもよい」の値選択がCHOOSE化されておらず固定delta:1のみ。(e)**WX17-028**＝`TRANSFER_TO_DECK`アクション型自体に`optional`フィールドが無く（`src/types/effects.ts`で未定義）、型定義＋`execTransferToDeck`双方の拡張が要る。(f)**WDK16-13／WXK08-033**＝同型カードで「レベル2以下の＜X＞シグニが公開された場合」と「登録者数100万人達成」の2条件に対応する2つのADD_TO_FIELDが、片方だけ`CONDITIONAL(IS_MY_TURN)`で不適切にラップされもう片方は無条件実行という構造不備（本来は各々別々の条件でゲートされるべき・両方optionalも欠落）。(g)**WX25-CP1-062**＝「【自】：あなたのターン終了時、手札を1枚捨ててもよい。そうした場合、次の対戦相手のターン終了時まで、あなたのすべての＜ブルアカ＞のシグニのパワーを+4000する。」という第1能力がJSONに丸ごと存在しない（DOWN能力側の`optional`欠落は続き90で修正済み・詳細BUGFIXES続き90）。
13. **§5b 残367件の混線テール**＝effect構造そのものが原文とズレたカードの effects JSON 再parse（1カードずつ手修正→逆翻訳原文一致→ゲート。**原文コピーでの一括潰しは禁止**）。
14. **リファクタ Stage2 残（useState 11本）→Stage3 純粋バトルコントローラ設計**。
15. **（大型・任意）§8 CPU AI のメインフェイズ拡張**（アーツ/スペル/起動効果の能動使用・グロウ判断。先に DESIGN §4「CPU は対人戦と同じ処理」の統一を完遂してから）。
16. **🆕 timing 語彙センサスの消化（`npm run census:timing`・続き75新設）＝**✅ engine 配線済みで parser 語彙だけ無いクラスタは続き75/76で出し切った（計19系統81枚・376→128）。残128は engine に受け皿が無い機構待ち＝§6.3 へ**。**「engine に収集関数があるのに parser がその timing を一度も生成していない」穴**を機械検出する計器。**静的ギャップ＝29種**（ON_MAIN_PHASE_START／ON_SPELL_USE／ON_EXCEED_COST／ON_RISE／ON_SIGNI_BECOMES_DRIVE／ON_HAND_DISCARDED／ON_ARTS_USE／ON_BECOME_BEAT 等が MANUAL でしか使われていない）。**動的計測＝128効果 / 113クラスタ**が `ON_PLAY`（＝「場に出たとき」）へ誤フォールバック中（明細 `docs/_timing_census.txt`・**履歴 376→…→223→209→174→143→134→128**）＝**召喚しただけで発火する幻覚**。**🆕続き76で計14系統66枚を追加消化＝第1弾9種35枚＝`ON_ACCE`/`ON_ACCE_ATTACH`（8）・`ON_REFRESH`（6）・`ON_ENERGY_TO_TRASH`（3）・`ON_SIGNI_FROZEN`（3）・`ON_OPP_POWER_DECREASED`（4）・`ON_DISCARDED_AS_COST`（4）・`ON_GUARD`（2）・`ON_OPP_ARTS_USE`（4）。第2弾5系統31枚＝`ON_CARD_MILLED_FROM_DECK`（10）・`ON_SELF_REVEAL_FROM_HAND`（6）・`ON_PLAY`+`placedFront`（3）・`ON_LEAVE_FIELD`+`leftToZone:hand`（4）・`ON_HAND_DISCARDED`+`triggerFilter`（8）。census 1537→1529。⚠engine 配線済みで parser 語彙だけ無い大クラスタはこれでほぼ尽きた＝残りは1〜6件のロングテールと、engine に受け皿が無い機構待ち（正面配置32・パワーN以下・「対戦相手が手札を捨てたとき」・デッキmill＝`ON_CARD_MILLED_FROM_DECK` が MANUAL 専用）。**✅消化済み（続き75・計152枚・census 1557→1537）**＝`ON_SIGNI_BANISH_OPPONENT`（50枚）・`ON_MAIN_PHASE_START`（30枚）・`ON_SPELL_USE`（18枚・**engine の相手側 watcher 未配線もセットで是正**）・`ON_EXCEED_COST`（11枚）・`ON_RISE`（6枚）・`ON_SIGNI_BECOMES_DRIVE`/`ON_BECOME_BEAT`/`ON_ARTS_USE`（10枚）・`ON_TRASH`「手札から」単独（15枚）・`ON_HAND_DISCARDED`（5枚）。
    - **🔎 知見①＝「語彙が無い」だけでなく「既存 regex の穴」もある**。`ON_TRASH` は語彙も engine 配線もあったのに「手札か**デッキ**から」しか書かれておらず「手札から」単独が抜けていた。センサスは**両方**を炙り出す。
    - **🔎 知見②＝「engine 未対応だから見送る」と判断する前に、その条件が別の形で（構造的に）担保されていないか確認する**。`ON_HAND_DISCARDED` の「ガードステップ以外で」は一度「engine に条件語彙が無い」として見送ったが、**engine はガード時にそもそもこの収集経路へ入らない**（`hand_discarded_just`/`asCost` が立たない）＝構造的に担保済みで、parser に timing を足すだけでよかった（doc コメント1行に書いてあった）。
    - **⚠`ON_ARTS_USE` の「対戦相手が使用したとき」／`ON_HAND_DISCARDED` の「対戦相手が捨てたとき」は拾わない**＝engine に相手主語の専用 scope が無く、`self`/`any` に倒すと**発火主体が逆転する or 過剰発火する**（受け皿は `ON_OPP_ARTS_USE` 系＝別途）。
    - **次の上位＝`あなたが自分の効果によって手札からカードをN枚以上公開したとき`6／`このシグニに【アクセ】が付いたとき`5／`《トラップアイコン》が発動したとき`4／`対戦相手のシグニのパワーがN以下になったとき`4** ほか（`npm run census:timing` で最新表）。**大きなクラスタは尽き、以降は1〜6件のロングテール**＝1件あたりの費用対効果は落ちる。
    - **engine が既に配線済みなら parser に regex 1本＋triggerScope 抽出を足すだけで直る**（続き75で `ON_SIGNI_BANISH_OPPONENT` ＝計50枚を実証）。**手順**＝①クラスタ選定→②engine の収集関数で triggerScope/条件の扱いを確認→③parser に timing 抽出＋scope 抽出→④`build:effects`→**全数機械diff で分類**（MANUAL温存・`EXILE`→`TRASH` 等の据置系を除外）→`heldReview --adopt`→⑤golden 1件→`npm run gates`→`npm run regen`。
    - ⚠**トリガー句は actionText から除去しない**＝既存の全文 STUB 規則がトリガー句込みでマッチする前提で書かれており、除去すると別 STUB へ誤マッチして退化する（WXEX2-40 で実測）。
    - ⚠**timing を直しても action 側の既存誤りは残ることがある**（WX10-048＝action がトリガー句の「バニッシュ」を誤読・WX11-031＝条件節の脱落）。これらは別系統（§5b/§6 テール）＝timing 是正の可否とは切り離して判断する。
    - ⚠**fresh 全体の採用が退化を伴う枚数は「timing だけ effectId アンカーで外科パッチ」する**（続き75で3枚＝`PREVENT_DAMAGE`→`GRANT_LRIG_ABILITY` の作り替え・`EXILE`→`TRASH` 据置系・MANUAL 含みで held に出ないカード）。**timing 是正だけは取りこぼさない**のがコツ。
    - ⚠**「次の（次の）あなたの◯◯時」は遅延トリガー＝別機構**（今設置して次ターンに発火）。その場で発火する timing と混ぜない（ON_MAIN_PHASE_START で2件除外した）。

**Sonnet 5 のタスク（今すぐ回せる在庫・定型消化とデータ単点）**：
1. **§7 実機検証のシナリオ横展開の継続**（`verifyBattleDrive.mjs` の scenarios に1件追加式）。**続き76（Opus）で追加した engine 実装の実機検証**（golden は pure 関数までしか見ない）＝**`execFreeze` の LRIG 分岐**（センタールリグの凍結＝`lrig_frozen`）・**`execNegateAttack` の LRIG**（センタールリグのアタック無効）・**`execDraw`/`execTransferToHand` の BLOCK_ACTION**（`DRAW_OR_ADD_TO_HAND_BY_EFFECT` で効果ドローが止まる）は**✅続き79（Sonnet）で実機PASS確認・既定orderに追加済み**（`freezeLrig`/`negateAttackLrig`/`blockDrawByEffect`・詳細 BUGFIXES §7）。**`execExile` の HAND_CARD＋blind**（`exileHandBlind`）・**`collectTurnTriggers` の遅延トリガー収集**（`delayedAttackTrigger`）は**✅続き81（Sonnet）で実機PASS確認・既定orderに追加済み**＝3件ともFAILの原因はdriver側の不具合（trash基準値の計測タイミング／pointer-events:none画像への通常click／モーダル閉じ忘れ）で、engine実装自体は正しく動作していた（詳細 BUGFIXES 続き81）。**`execTrash` のカウンタ**（`trashCounterOpp`）は driver側の召喚不可設定ミス（lrigレベル不足）を修正して実行は進むようになったが、**`resumeSelectTarget`→`applyDirectAction` のTRASH/HAND_CARD分岐が`hand_trashed_by_opp_this_turn`等3フィールドの更新を欠く実engineバグを確定**＝修正はOpusタスク12へ登録済み（既定order外のまま）。⚠**続き79が記録した「`H.closeModals()`（Escape×3）は当てにならない」は続き81で恒久修正済み**（「タップして閉じる」テキストクリックを追加）。雛形＝`acceSelfScope`/`acceOtherScope`（正例と負例をペアで書く）。**その他の残＝**R30**＝WXK10-022-E1（発火経路は続き66で開通済み＝WXEX2-50-E3 発動→watcher 確認）・**ON_TARGETED 残3枚**（WXDi-P11-040/WX25-P2-055/WXDi-D09-H14）＋②turnOwner:opponent ゲート③《ターン1回》・**R42②**（バトルバニッシュ経路）・**R43②**（自エナ/相手効果では非発火）・**R44②③**・**R46②③**・**R38②③**（《ターン1回》・複数同時凍結。**②は✅続き92（Sonnet）で実機PASS確認・`freezetriggerUsageLimit`として既定orderに追加済み**＝残③複数同時凍結の合算のみ）・**R37②③**（他4枚個別確認含む）・**R36②**（WXDi-CP02-082 相手ターン出し分け）・**R39②**・**R40②**・**R41②**・**ON_COIN_PAID③④**・**ON_LRIG_GROW②③④**・**ON_LRIG_ATTACK_STEP_START②**（《ターン1回》）・**B4引用付与の実発火**（WX24-P2-018等）・**B2**（WX17-028）・**B3**（WX25-CP1-069）・**機構④誤parse 3枚**（WXDi-P07-044/WX25-P3-062-E2）・**クラフトトークンの実機配置**（§6.4）。**発見したバグの修正自体は Opusタスク12 に回す**＝観測結果を §7 とバトンに記録）。
2. ~~CHOOSE平坦化復元 held 約38枚の全数機械分類~~ **✅完了（続き71・2026-07-11）**＝fresh側でCHOOSE増加54枚を1枚ずつ精査→明白な純改善1枚（WXK10-013）採用・残53枚を系統別パターンA〜Fに整理してOpusタスク10へ（詳細 BUGFIXES 続き71・PLAN §3 Opusタスク10）。
3. **verifyBattleDrive のバッチ実行時状態汚染の根本修正**（driver 側のテスト分離強化＝engine/JSON 非依存。続き39後半で13件一括実行時のみ3件FAIL→個別再実行は全PASSを確認済み）。
4. **BEHAVIOR_AUDIT キュー再生成＋一次トリアージ**（`--queue` 再生成→`_bqTriage`→真no-op候補の抽出まで。仕分け確定と修正は Opusタスク11/12）。
5. ~~**golden 型網羅の追加**~~ **✅実質完了（続き82-85・Sonnet・golden 106→277）**＝121型中99型をテスト化（続き82:12型／続き83:POWER_MODIFY_PER_*/BY_*系13型／続き84:9型／続き85:15型）。残22型は(a)PLAN §6.1に明記済みの未実装15型（engineにcase自体が無い＝Opus機構実装待ち）(b)no-opプレースホルダ5型（COUNTER_SPELL/LRIG_LIMIT_MODIFY/RECOLLECT_GATE/UNKNOWN/ALT_COST_OPP_TURN＝ログのみで実処理は別経路）(c)PLAY_FREE（複合STUB委譲で価値の薄いテストになるため見送り）(d)GROW_FREE（no-op placeholder）＝**いずれもSonnetが今テストを足す価値が無い**ため次はOpus機構実装後の追随に委ねる。過程で新規engineバグ2件を発見しOpusタスク12(v)(vi)へ登録（`applyDirectAction`のENERGY_CHARGE/STORY_CHANGE/POWER_MODIFY_PER_LRIG_LEVEL/POWER_MODIFY_PER_FIELDのcase欠落・`POWER_MODIFY_PER_DECK_COUNT`のeffectEngine.ts未実装）。詳細は BUGFIXES 続き82-85。engine/parser/JSON は全期間を通じ無変更（census 1483・同型★0とも維持）。
6. **Opus バッチ着地後の再収穫サイクル**（`/census-batch` スキル準拠＝`build:effects`→`heldReview` spot-check→採用→全ゲート→`regen`→BASELINE/PLAN簿記→commit。⚠必須ガードレール4点は上記リスト参照）。**Opus タスク1〜6 のいずれかが着地するまでは §5c 再収穫に着手しない**（現在プラトー＝空振りになる。続き34着地→続き35収穫の型を踏襲）。
7. ~~**§5b Z-2＝BET系の表現描画**~~ **✅完了（続き86・Sonnet）**＝PLAN記載の「19+11+8=38」は古い数字で現状（実測19＝BET_MECHANIC 11／BET_ALTERNATIVE 7／BET_CONDITION 1）と不一致だったが、現存する全19効果に`decompileEffects.ts`の原文抽出規則を追加し意味文化。engine/JSON不変・同型★0/census 1483とも維持。詳細 BUGFIXES 続き86。
8. **semantic audit のパイプライン実行＋データ単点修正**（パイロット findings 真バグ39件のうち owner/値/duration の単点是正＝parser/engine 変更なしのもののみ・stub群2,306枚へのスケールアップ実行＝`semanticAudit{Extract,Run,Triage}.mjs` 回し。意味判定が割れるもの・機構が要るものは Opusタスク12 へ）。**⚠続き88（Sonnet）で判明＝過去のパイロット出力（findings.jsonl）は既に手元に無い（scratchpad由来で消失済み）ため`semanticAuditTriage.mjs`での再精査は不可。系統①「相手デッキ削り」の残27件は代わりに`_auditSystematicScan.mjs`で再抽出・全件ノード単位で分類し「単点是正できる残件ゼロ」を確定（詳細§6.2・BUGFIXES続き88）。stub群2,306枚への`semanticAudit{Extract,Run}.mjs`スケールアップは`claude -p`呼び出しを要し本セッション環境では未実行＝次回この方向で進める場合は要件を確認**。
9. ~~**smoke SKIP 268 の解消**~~ **⏳部分完了（続き93・Sonnet）**＝DECLARE_BOND/REVEAL_CARDS 5件は`scripts/smokeTest.ts`のautopilotに2ケース追加して解消（SKIP 263→258・engine不変）。**残258件は全て「autopilot loop: SELECT_TARGET」＝`applyDirectAction`の型対応漏れ（Opusタスク12(vi-2)へ登録済み）が真因でscripts側では解消不可**＝Opus着地待ち。
10. ~~**WXK04-003 のボタンラベル表示バグ**~~ **✅完了（続き81・Sonnet）**＝`getMyLrigFieldActions` 内3箇所（own/継承/付与のcostParts）に `eff.cost?.coin` 考慮を追加。E2「サプライズ《コインアイコン》」が「【起】コストなし」→「【起】コイン1」に是正。実UI検証＝`node scripts/verifyBattleDrive.mjs wxk04003Label` PASS（もう一方のボタン＝`WXK04-003-DECORE`〔manualEffects.ts・【デコレ】ACCE付与〕はcost count:0で元から正当な「コストなし」＝2ボタン共存が正解と判明）。詳細 BUGFIXES 続き81。
11. ~~`checkAllEffects` の `MANDATORY_SUSPICIOUS` 一次精査~~ **✅完了（続き89-92・Sonnet）**＝62件検出（EFFECT_TYPE_MISSING_CONTINUOUS 20／MANDATORY_SUSPICIOUS 38／OPTIONAL_SUSPICIOUS 2／POWER_VALUE_MISMATCH 1／MILL_COUNT_MISMATCH 1）のうちMANDATORY_SUSPICIOUS 38件を全精査＝**単点是正16件を修正**（続き89:7件＋続き90:9件。`optional`フィールド欠落＝強制実行バグ・owner誤り2件・filter未限定1件。census 1483→1480）・**構造的バグ7件をOpusタスク12へ登録**（対象/自己混同・条件欠落・即時アクション化等）・**さらに続き90でOpusタスク12へ追加登録7件**（複数条件+owner混同・遅延トリガー欠落・アイコンフィルタ欠落・値選択CHOOSE化欠落・`TRANSFER_TO_DECK`にoptionalフィールド自体が無い・2条件ADD_TO_FIELD構造不備・第1能力まるごと未実装）・**POWER_VALUE_MISMATCH（WX06-006）は「代わりに」置換機構欠落と判明しOpusタスク6へ**・MILL_COUNT_MISMATCH（WX24-P3-039）は誤検知で修正不要と確認。詳細 BUGFIXES 続き89-90。**MANDATORY_SUSPICIOUS残り22件は`REVEAL`/`LIFE_CRASH`/`ENERGY_CHARGE_FROM_DECK`にoptionalフィールドが無いため単点是正不可（engine拡張が要る）or構造的複合バグ＝Opus送り確定**。**✅続き91でEFFECT_TYPE_MISSING_CONTINUOUS 20件も全精査完了**＝15件は「AUTOにcondition/activeConditionで条件ゲートを直接埋め込む」実行時等価な代替表現＝誤検知と確認（JSON変更不要）・**真バグ5件を修正**（WXK10-039＝印字キーワード【アサシン】が丸ごと未実装／PR-426・WX05-021・WXDi-P07-060＝「常に…を得る」の片方〔パワー修正/キーワード〕が欠落／WXDi-CP02-103＝「すべての領域でクラス扱い」機構が実カード母集団0件で初適用）。census 1480→1479。詳細 BUGFIXES 続き91。**✅続き92で`verifyEffects`「定義なし」誤検出も再調査＝全12シート再走査で現状0件と確認しクローズ**（既存の除外フィルタが正しく機能・JSON/engine無変更）。診断ツールは`scripts/_checkAllEffects.mjs`として再実行可能に常設化。
12. ~~**§5b 英語ID漏れ残367件の系統分類**~~ **✅完了（続き87・Sonnet）**＝PLAN記載の「367件」は古い数字で現状（実測823カード・タグ出現968・distinct id 316種）と大きく乖離していた（BEHAVIOR_AUDIT等の主作業でカードが増減し続けているため）。新設の`scripts/_stubLeakScan.mjs`で機械抽出→キーワードベースで16テーマ（デッキ操作系/パワー修正系/手札系/トラッシュ系/対戦相手コスト系/エナ系/ライフ系/シグニ配置系/ルリグ系/能力付与系/ガード・アタック制限系/ソウル・アーツ系/ウィルス系/色・クラス系/ゲーム除外系/チャーム系）に分類し`docs/_stub_leak_classification.txt`へ出力。上位＝デッキ操作系184枚／パワー修正系165枚／手札系102枚。JSON/engineは無変更（分析のみ・JSON再構造化の本修正はOpusタスク13）。詳細 BUGFIXES 続き87。
- ~~§5b 逆翻訳テール＝STUB id 意味文化／B層 JSONデータ欠落補完~~ **✅完了（続き33-36・2026-07-07再確認・§5b参照。残例外は Opusタスク5 へ移管済み）**。

#### 分類マトリクス（2026-07-11新設・タスク番号は上のリストと同一）
> **読み方**＝セッション開始時に「着手条件が◎（今すぐ）のうち、残り時間に合う規模」を上から取る。規模＝**S**:1セッション内で完結／**M**:1〜2セッション／**L**:複数セッション（ただし項目単位で分割可なら都度1項目ずつ）。種別＝どの層を触るか（＝必要ゲートが決まる：parser/engine→`npm run gates` 必須・decompiler表現のみ→同型★0＋原文照合・scripts/driverのみ→該当スクリプト実行・分析のみ→ゲート不要）。

**Opus 側**：

| # | タスク | 種別（触る層） | 規模 | 着手条件 |
|---|---|---|---|---|
| 1 | 引用内側 parse＋再収穫27 | parser語彙＋engine機構 | M | ◎今すぐ（**第1弾は✅続き75**＝GRANT_TO_PLACED_SIGNI＋バトルバニッシュ timing 31枚＋UP脱落6枚。残＝内側「代わりに」・他の内側トリガー語彙） |
| 2 | 動的比較の残3枚 | parser語彙（＋engine解決器） | S〜M | ◎今すぐ |
| 3 | DRAW脱落 systematic 19枚 | parser修正 | S | ◎今すぐ |
| 4 | §5c 条件節の残 | parser語彙 | S〜M | ◎今すぐ |
| 5 | 小口持ち越し 約12件 | 単点（parser/engine/decompiler混在） | S×件数（1件ずつ分割可） | ◎今すぐ（隙間埋めに最適） |
| 6 | 「代わりに」機構系 | engine新機構（置換） | L | ◎今すぐ（独立） |
| 7 | §6.1 未実装action型 7種 | engine実装 | M（1型ずつ分割可） | ◎今すぐ |
| 8 | §6.3 大型機構 | engine機構＋parser | L（項目ごと独立・分割可） | ◎今すぐ |
| 9 | semantic audit 機構対応 | engine＋decompiler | M | ◎今すぐ |
| 10 | CHOOSE held 最終見極め | JSON採用（退化見極め） | S〜M | ◎今すぐ（**Sonnetタスク2 の分類完了・続き71**＝パターンA〜F整理済み） |
| 11 | BEHAVIOR_AUDIT 高シグナル22 仕分け | 仕分け＋engine修正 | M | ◎今すぐ（続き77でキュー再生成済み・詳細は上のOpusタスク11本文） |
| 12 | Sonnet 発見バグの修正（常設） | 可変 | 可変 | ◎**在庫6件**（✅続き78で旧8件全消化。新規＝SP27-002 genericKagiri無言消費系統・WXDi-P10-035 引用内BOUNCE owner精査・WXK09-050 dispatch設計・続き81 applyDirectAction TRASH/HAND_CARD 3フィールド欠落・続き93 applyDirectAction 未対応6型〔TRANSFER_TO_DECK/GRANT_PROTECTION/ENERGY_CHARGE/POWER_SET/POWER_MODIFY_PER_FIELD/POWER_MODIFY_PER_LRIG_LEVEL＝smoke SKIP258件の真因・実UIフリーズ相当〕・🆕続き95 `collectPowerZeroTriggers`がfield.lrigを走査せずLRIG watcher（WX22-013/WXDi-P14-009）が絶対発火しない。詳細は上のOpusタスク12本文） |
| 13 | §5b 混線テール367 | JSON再parse（1カードずつ） | L（低優先） | ◎今すぐ（逓減テール＝他が尽きたら） |
| 14 | リファクタ Stage2→3 | BattleScreen構造 | L | ◎今すぐ（独立・他と並行可） |
| 15 | CPU AI メインフェイズ | 新規設計（BattleScreen＋engine） | L（特大） | ⏳DESIGN §4 の CPU/対人統一が先（実質 14 の後） |

**Sonnet 側**：

| # | タスク | 種別（触る層） | 規模 | 着手条件 |
|---|---|---|---|---|
| 1 | §7 実機検証の横展開 | 検証（driver シナリオ追加のみ） | S×約20項目（1件ずつ） | ◎今すぐ（推奨・主力在庫） |
| 2 | ~~CHOOSE held 全数機械分類~~ | 分析（tmp_スクリプト＋分類表） | S〜M | ✅完了（続き71・Opus10解放済み） |
| 3 | driver バッチ状態汚染修正 | scripts（engine/JSON 非依存） | M | ⏳**部分完了（続き77）**＝ゾーン単位フィールドマーカー（signi_acce等17種）の一括初期化は解消・検証済み。**30件超連続実行時のカスケードFAILは別原因（client側state疑い）で持ち越し**（詳細 BUGFIXES 続き77） |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ | 計器実行＋分析 | S | ✅完了（続き77・210/9288→263/9293・高シグナル22件抽出。Opus11へ） |
| 5 | ~~golden 型網羅追加~~ | テスト（scripts） | S（1型1テストずつ） | ✅実質完了（続き82-85・golden 106→277・残22型はOpus機構待ち/no-op placeholderのみ） |
| 6 | ~~§5c 再収穫サイクル~~ | JSON採用（/census-batch 準拠） | S | ✅完了（続き77・held99枚中85枚採用・census 1514→1494。詳細 BUGFIXES 続き77） |
| 7 | ~~BET系の表現描画~~ | decompiler のみ（ゲート軽い） | M（1カードずつ分割可） | ✅完了（続き86・実測19件を全消化） |
| 8 | semantic audit 実行＋単点修正 | パイプライン＋JSONデータ単点 | M | ⏳**部分完了（続き88）**＝系統①の残27件を全分類し単点是正ゼロを確定。stub群スケールアップ（`claude -p`要）は未着手 |
| 9 | smoke SKIP 268 解消 | scripts（smokeTest autopilot） | M | ⏳部分完了（続き93・DECLARE_BOND/REVEAL_CARDS 5件解消。残258件はOpusタスク12(vi-2)着地待ち） |
| 10 | ~~WXK04-003 ボタンラベル~~ | UI表示単点（BattleScreen） | S | ✅完了（続き81・Sonnet） |
| 11 | ~~checkAllEffects／verifyEffects 精査~~ | 計器＋分析＋JSON単点 | S | ✅完了（続き89-92・MANDATORY_SUSPICIOUS単点是正16件＋EFFECT_TYPE_MISSING_CONTINUOUS真バグ5件を修正・census 1479。残22件はoptionalフィールド無/構造的でOpus送り確定。verifyEffects「定義なし」誤検出＝続き92で全12シート再走査し現状0件と確認しクローズ） |
| 12 | ~~英語ID漏れの系統分類~~ | 分析のみ（修正しない） | S〜M | ✅完了（続き87・実測823カードを16テーマに分類・`docs/_stub_leak_classification.txt`） |

**依存の要点（交互サイクルの回し方）**＝待ち関係は3本だけ：**Sonnet2→Opus10**（CHOOSE分類→採用）／**Opus1〜6→Sonnet6**（新語彙着地→再収穫）／**Sonnet1・4・8→Opus12**（観測→修正）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式なので同時作業はしない・§11 の「着手中」宣言は大型機構のみ必須）。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-12・続き95・Sonnet 5・Sonnetタスク1＝§7 R37「他4枚」完了＋新規engineバグ発見）**
  - **✅ R37「他4枚の個別確認」を完了＝LRIG watcher 2枚（WX22-013・WXDi-P14-009）の検証で新規engineバグを確定**＝`collectPowerZeroTriggers`（`triggerCollect.ts:195`）が`field.lrig`を走査していないため**LRIGカードのON_SIGNI_POWER_ZERO_OR_LESS能力が印刷テキストどおり一切機能していない**（他コレクタが使う`ownFieldSources`未使用の設計漏れ）。`powerzeroWX22013`/`powerzeroWXDiP14009`シナリオで呼び水の-1000適用は正常・watcher非発火を確認。Opusタスク12(vi-3)へ登録（詳細 BUGFIXES 続き95）。
  - **R37は①②③とも全カード実機検証を終えた状態に到達**（signi watcher4枚は正常動作確認済み・LRIG watcher2枚は実バグとして切り分け完了・②《ターン1回》③連鎖再発火はOpus修正後に再検証）。
  - **次の一手＝PLAN §3 Sonnetタスク1（§7実機検証R-series）の続き**＝残る「②未検証」項目多数（R43②自エナ/相手効果での非発火・ON_LRIG_GROW③④・ON_COIN_PAID③④・R36②WXDi-CP02-082 等）から1件ずつ消化。Opusタスク12(vi-2)(vi-3)着地後はSonnetタスク9残258件の再測定・R37 LRIG2枚の再検証も。

### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 79 / LOSS 67 / VALUE 12（2026-07-05 続き29終了時点・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**＝続き25時点の24から増えたのは**回帰ではなく続き29の CHOOSE 平坦化修正の採用待ちバックログ**（parser が curated より正しくなった側＝WX14-011/WX17-020/WX20-Re20/WXDi-P02-005 等の CHOOSE 復元 one-off 約35枚と、その巻き添えバケツ）。内訳＝(a)LOSS 67＝CHOOSE復元の採用待ち約35＋レガシードリフト（EXILE→TRASH系 WX21-027/WXDi-CP02-TK03B 等・owner 等）のパーサー弱点、(b)VALUE 12＝count 慣例の非一貫性（CONT保護は count 無視＝機能同値・WX18-034/WXEX1-35 等）・duration 文脈テール（WX25-P2-062）と単発テール。**CHOOSE復元分を採用し切ったら再計測して実数を締め直す。この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）＝**高シグナル欠落 1479枚（2026-07-12 続き91・履歴 …→1567→1566→1563→1558→1557・続き63 DEPLOY_RESTRICT実装で5枚・続き67 WXEX2-25-E3 lrig相対付与で1枚・続き68 デッキ相対SEARCH3枚・続き69 引用内CHOOSE 26枚で5枚・続き71 CHOOSE平坦化復元WXK10-013で1枚解消・続き75 timing語彙8種で1557→1537・続き76 timing語彙 計19系統＋タスク10 パターンA〜F（全解決）で1537→1514・続き77 §5c再収穫（held 85枚採用）で1514→1494・続き78 タスク12根治＋held 148枚採用で1494→1483・続き89 checkAllEffects MANDATORY_SUSPICIOUS のDOWN{optional欠落}7件修正で1483→1482・続き90 残り9件（optional欠落/owner誤り）修正で1482→1480・続き91 EFFECT_TYPE_MISSING_CONTINUOUS真バグ5件修正で1480→1479・明細 `docs/_vocab_census.txt`）**。この数字から増えたら回帰（スクリプトが exit 1）。JSON手パッチでフィルタ語彙を足せば自然に減る＝減ったら `BASELINE_HIGH` とここを実数更新。DSLに新語彙を足したらキー表（PATTERNS）にも追加する。状態系の残（凍結13・ダウン/アップ38）はコスト節/条件/CONT型（別パス・§6.3）。**消化の入口は `npm run census:clusters`＝文型テンプレのクラスタ表（`docs/_census_clusters.txt`・枚数順）から系統バッチを選び、parser規則→`npm run build:effects`→`node scripts/heldReview.mjs` で署名グループごとに一括採用する（続き23確立・手順詳細は §5c）。**
- **母数**：効果カード 5975／効果 10549／MANUAL効果 733／STUB含むカード 1820。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> まず `npm install` → `npm run typecheck && npm run golden && npm run smoke && npm run fuzz` が全部緑になることを確認（CIでも自動実行される）。これが回れば環境OK。現状＝golden 134/134・smoke/fuzz 全0・同型★0・census 1720/1720。
>
> **現在の主作業＝§5c census文型バッチの継続消化（続き23確立のパイプライン・cold startはこの5行）**：
> ① `npm run census:clusters` → `docs/_census_clusters.txt` を枚数順に見てテンプレを選ぶ（未処理上位＝**(a) CHOOSE平坦化復元の残 約35枚**＝続き29の parser 修正で `npm run build:effects` → `node scripts/heldReview.mjs` に one-off の CHOOSE 復元が挙がる＝1枚ずつ spot-check して採用（-EXILE系・STUB退化・type増減なしは据置）。**(b)「代わりに」残テール**＝C コスト代替6／D 置換ルール9（バニッシュされない系＝置換機構要）／E リコレクト2／B1残10枚（コスト参照・ターン中イベント・それにチャーム・傀儡状態＝条件語彙が無い §6.3）。続き28-29で A:ena→trash・B:条件+代わりに94（自己完結15＋per-target値すり替え＋多段閾値＋CHOOSE復元64）は消化済み。機構待ちは §6.3 へ送る。⚠着手前に続き24-29の型＝**全数機械分類で偽陽性を先に切る**）
> ② parser（`src/data/effectParser.ts` の「状態条件節の CONDITIONAL 持ち上げ」CLAUSES 表がテンプレ追加の定位置）に規則を足す。**engine/decompiler 対応済みの条件型のみ**・既存STUB全文規則の横取りに注意（ガード3種の実装コメント参照）
> ③ `npm run build:effects` → ④ `node scripts/heldReview.mjs` でdiff署名グループをspot-check→`--adopt ID群` で一括採用（**STUB退化・「代わりに」・別STUB id化は採用しない**）
> ⑤ golden 1件/テンプレ追加 → `npm run gates`＋`npm run regen`＋同型★0 → `BASELINE_HIGH`/本§更新 → commit/push
>
> **並行の主作業＝BEHAVIOR_AUDIT 段階4（キューから欠落no-opバグ潰し）**。手順＝**キューは古くなるのでまず `npx tsx scripts/behaviorAudit.ts --queue > docs/_behavior_queue.txt` で再生成**→`node scripts/_bqTriage.mjs`（要review キュー109を高シグナル選別）→ `npm run audit -- --id <CardNum>` で原文｜逆翻訳｜盤面差分｜ログを目視→「真no-op（engine未実装/誤配線）／シナリオ空振り（＝`behaviorAudit.ts` のシナリオビルダーを拡充して偽陽性を消す）／STUB未実装」に仕分け→バグは §3 ワークフロー（JSON直パッチ＋engine/decompilerセット＋golden1件＋smoke/golden/fuzz）で修正。**engine を触ったら smoke/golden/fuzz 必須**。残る高シグナル19の主な内訳＝トリガー主語系（audit はトリガー条件を模擬しない＝WX04-082/099/102 等は逆翻訳照合で判定）・CHOOSE 分岐・出現条件レゾナ（WX09-012/WX12-010）・§6.3 既登録の機構待ち（WX25-P2-009 等）＝逓減域。詳細 [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)。§6（未実装action型 worklist・対戦相手シグニ離脱トリガー3枚）も残タスク。
>
> **旧・主作業＝逆翻訳機の出力品質を原文一致へ（§5b）**。レンダラ5系統は是正済（BUGFIXES①〜⑤）。**表現パッチ（decompiler のみ・engine 不変）はゲートが軽い＝§3の「逆翻訳ゲート」（同型★0＋原文照合）でよく、smoke/golden/fuzz は不要。**
1. **逆翻訳機の英語ID漏れ／文法崩れの残を1系統ずつ是正**＝`grep -hE "^\s+[A-Z0-9]+[-_][A-Za-z0-9-]+.*:" docs/decompile_sheet*.txt`（＝逆翻訳行）を `grep -ohE "[A-Z][A-Z0-9_]+" | sort | uniq -c | sort -rn` で英語漏れを多い順に出す。**engine実装済みSTUB id（COPY_LRIG_NAME_ABILITY 等）→ decompiler に原文意味文を1行足す**（`miscStubMap` 等の既存パターン）。
2. **B層（JSONデータ欠落）**＝REVEAL_AND_PICK/LOOK_AND_REORDER で pick部分が JSON に無く逆翻訳から脱落するカード（WXDi-P04-047 等）。curated JSON 補完（中リスク・§3のとおり直接パッチ）。
3. **実機検証（C2・任意）**＝`scripts/verifyBattleDrive.mjs`（シナリオ切替式）。生STUB 3＋C1 timing 6種は実 UI 観測クローズ済（既定10件 全PASS）。残 timing は `scenarios` に1件足すだけで横展開可。逆翻訳機の改善とは独立。
4. **CPU AI 拡張 / doPhaseAdvance pure 抽出**（§8）＝大型・任意。費用対効果は逓減。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [ ] **未実装action型 worklist**（§6）＝action位置なのに engine/UI に型名が一度も現れない完全no-opの型。残11種27効果。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサス1872枚の系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

**目標＝`npm run census` の高シグナル1872枚（両方向98計測・続き23時点）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）**＝(1) **「代わりに」残テール**：C:コスト代替6・D:置換ルール9（バニッシュされない系＝置換機構要）・E:リコレクト2・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
- **進め方＝`/census-batch` スキルに定型化済み**（`.claude/skills/census-batch/SKILL.md`＝続き23確立のパイプライン＋必須ガードレール込み。原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）。概要＝①`census:clusters` でテンプレ選定→②既存DSL型で表現できるか確認（不可＝機構待ちとして §6.3 へ）→③parser 規則追加（**JSON手パッチではなく parser を source of truth に**）→④`build:effects`→⑤`heldReview` spot-check→`--adopt`（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**）→⑥golden 1件/テンプレ＋全ゲート＋BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き18更新＝続き17記載の (a)トリガー種別 (b)小さい数 (c)出現条件 (d)そうした場合誤変換 はすべて98計測に組み込み済み）**＝文字列突き合わせで原理的に見えない残り4つ：(a) **参照解決の誤り**（「それ」の指し先取り違え＝WX09-015 の bounce 対象 self 化。両側に語彙が揃うため不可視）。(b) **効果単位の粒度**（同カード別効果に語彙があれば合格＝カード単位判定のマスキング。消化が進んだら効果単位化）。(c) **JSONは正しいが engine 実装が違う**（behavior-audit／golden の領分）。(d) **文間の実行順序・依存関係**。~~横断的再発防止案＝parser の無言フォールバックに parseStatus:PARTIAL 刻印を義務付ける~~ **✅実装済（2026-07-07・続き38）**＝IS_MY_TURN化（条件抽出失敗の常時true化）・UNKNOWNステップ無言除去（リコレクト/multi-dest分割）で `markSilentFallback()` → fresh の parseStatus を PARTIAL 降格＋`docs/_partial_report.txt` に理由明細（**初回計測142効果＝IS_MY_TURN化125/multi-dest11/リコレクト8・逓減計器**）。parseStatusのみの差分は buildEffectsJson/parserWorklist とも比較から除外（held を汚さない・137枚吸収）。新たな無言近似を parser に足すときは **markSilentFallback を必ず呼ぶ**（「そうした場合」常時true等の意図的慣例は刻印しない）。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れの解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**⚠**「367件」という数字は古い（2026-07-12続き87で実測823カードと判明＝BEHAVIOR_AUDIT等の主作業でカード母集団が増減し続けているため。件数メトリクスを信じない §3の原則どおり）。系統別内訳は`docs/_stub_leak_classification.txt`（`node scripts/_stubLeakScan.mjs`で再生成）参照。**

- ~~**🆕 durational付与の「ターン終了時まで」action内duration脱落＝期間注記の逆翻訳脱落（Opusタスク(A)・母集団132枚）**~~ **✅続き62（Opus）で是正＝decompiler側 `restoreLeadDuration`（原文の当該効果セクションを文スコープで照合し期間注記復元・GRANT_KEYWORD/REMOVE_ABILITIES の2レンダラに配線）で112枚が期間注記を獲得。engine/JSON 不変（parser/JSONは触らず＝held激増を回避）・同型★0維持・全ゲート緑・誤注記ゼロ。母集団132のうち34は抽出の偽陽性（恒久付与 or POWER_MODIFYが期間句の帰属先）で正しく無注記。詳細 BUGFIXES 最上部。** 原因＝`parseActionTextInner`（`effectParser.ts:1398`）の先頭「ターン終了時まで、」strip で action内 duration が PERMANENT/missing に落ちる（engine では PERMANENT と機能同一のため挙動不変）。
- ~~①REVEAL_AND_PICK 文法崩れ／②LOOK_AND_REORDER 行き先欠落／③CHOOSE 圧縮／④BLOCK_ACTION 英語ID漏れ／⑤timing/icon 英語漏れ~~ **✅全て是正済（BUGFIXES①〜⑤・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5b）**。
- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（COPY_LRIG_NAME_ABILITY／DESIGNATE_SIGNI_ZONE／SUMMON_RESONA_FROM_LRIG_DECK／DOWN_UP_SIGNI_AND_CHOOSE／CHOOSE_COLOR_FROM_LIST は `decompileEffects.ts` に意味文実装済み・2026-07-07再確認）**。全10シートに残る英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`）＝いずれも§6.3で機構待ちとして登録済み（decompilerでは対応不能・engine機構実装が前提）。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367→その後の作業でカード母集団が変動し2026-07-12実測823・続き87で機械分類済み）**。effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能なものが大半。**effects JSON の再parse（機構実装・データ層修正）が本筋＝Opusタスク13**。系統別内訳（16テーマ・カード数の多い順＝デッキ操作系184／パワー修正系165／手札系102／トラッシュ系75／対戦相手コスト系63／エナ系50／ライフ系48／シグニ配置系48／ルリグ系36／能力付与系31／ガード・アタック制限系26／ソウル・アーツ系15／ウィルス系10／色・クラス系4／ゲーム除外系3／チャーム系1／その他54）は`docs/_stub_leak_classification.txt`参照（続き87・Sonnet）。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- ~~Z-2：BET系の表現描画~~ **✅完了（続き86・詳細は §3 Sonnetタスク7）**。engine 側（ベット判定自体の実装状況）は変更なし＝表現のみの改善。
- ~~B層：JSONデータ欠落の補完（中リスク）~~ **✅是正済（2026-07-06〜07・続き33-36・BUGFIXES参照）**＝REVEAL_AND_PICK/LOOK_AND_REORDER の pick 部分脱落は分類(a)〜(d)を全消化（WXDi-P04-047含む）。2026-07-07に構造走査で再確認＝全10シートで「then/destination 欠落」0件。残る例外2件（WDK07-E15＝新STUB `INTERNAL_ACCE_PICKED_TO_SELF` 要／WXDi-P07-010＝`RULE_REMINDER_TEXT`）とWXDi-P03-005（PAID_ADDITIONAL_COST拡張要）・WX26-CP1-100（新action型要）はいずれも§6.3で機構待ちとして登録済み＝Opus分担。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **§2 DoDの4つ目にチェックを入れる**。

---

## 6. フェーズ2残作業：実行の正しさ（P2）

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

### 6.1 未実装action型 worklist（behavior-audit 段階4で発見・完全no-op・2026-07-03）
`npm run audit` の要レビュー・キューから、**action位置なのに engine(`src/engine/*`) にも UI(`BattleScreen.tsx`) にも型名が一度も現れない＝完全未実装で無言no-op**の action型を網羅スキャンで確定。**14種42効果**中 `EQUALIZE_ENERGY`(6)・`LEVEL_MODIFY`(9)は実装済（BUGFIXES上部）。残**11種27効果**。

**⚠修正層は effectType で決まる**（教訓）＝instant(AUTO/ACTIVATED/LIFE_BURST)→`effectExecutor` の `execXxx`+dispatch。CONTINUOUS→`effectEngine.ts` の calcFieldPowers/CONT収集器。`scratchpad` の型別effectType集計で判定してから着手する。

**A. instant型（executor層・優先）**
- ~~`LEVEL_MODIFY`(9)／`LOOK_AT_DECK_AND_LIFE`(3)／`VARIABLE_DISCARD_AND_DRAW`(1)／`NAME_BAN`(2)~~ **✅実装済（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6.1）**。
- [ ] `PLAY_FREE_FROM_TRASH`（2・WX09-012・AUTO/ACT）／`STACK_SPELL`（1・WX11-029・AUTO）／`PREVENT_DAMAGE`（5・WX08-029・ACT3/AUTO1/LB1＝ただしダメージ層への置換機構が要る＝実質横断）。

**B. CONTINUOUS型（calcFieldPowers/CONT収集器層）**
- ~~`GROW_COST_REDUCTION`(6)／`POWER_MODIFY_PER_ENERGY`(1)~~ **✅実装済（golden済・⚠要実機検証・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6.1）**。
- [ ] `COST_SUBSTITUTE`（2・WX08-042・CONT）／`SELF_TRASH_PREVENT`（1・WX07-033・CONT）／`COLOR_INHERIT`（1・WX11-032・CONT）／`GRANT_FIELD_SHADOW`（1・WXDi-P15-058・CONT）。

進め方＝A群から1型ずつ、effectType を確認→ instant なら `execXxx`+dispatch(+必要なら resume 適用case)→golden 1件→smoke/fuzz→キュー減→push（§3）。

### 6.2 意味照合監査（semantic audit）の worklist（2026-07-03新設・仕組みは [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)）
原文 vs effects JSON を LLM で意味比較する検査パイプライン（`scripts/semanticAudit{Extract,Run,Triage}.mjs`）。パイロット（stub群30枚精査）で precision約78%・30枚中17枚に確定バグ（同型★0・smoke/fuzz緑を通過済みのカード）。

- [~] **系統①：相手デッキ削りの owner 取り違え**。**(a) 純・相手のみ58枚＝✅是正済（2026-07-03）**。**✅続き88（Sonnet）で(b)(c)を再実測・ノード単位で全27件を最終分類＝単点是正できる残件はゼロと確定**。(b)「あなたか対戦相手」選択17件（WX07-005/WXDi-D07-019/WXDi-D07-022(E1+BURST)/WXDi-P01-044/WXDi-P04-043/WXDi-P05-043/WXDi-P07-087/WXDi-P13-002/WX24-P3-057/WX24-P3-091/WX24-P4-025/WX25-P3-028/WX26-CP1-058/WX26-CP1-098/WXK09-034/WXK09-057/WXK11-076）＝`owner:'any'`＋CHOOSE化が要る。**🔎正しい実装パターンが`WXDi-P04-082`に既存**（`CHOOSE{choices:[TRASH(self),TRASH(opponent)]}`）＝Opusはこれをテンプレートに17件へ横展開すれば新規engine機構は不要。(c)混在の誤検知9件（WXEX2-21/WXDi-P04-082/WXDi-P11-082/WXDi-P15-055/WX24-P3-088/WX24-P4-034/WX24-P4-049/WX25-CP1-007）＝スキャンがカード単位判定のため無関係の正しい`owner:self`ノードを誤検知していただけ＝**修正不要（既に正しい）**。WXDi-P07-007は「対戦相手が２択から選ぶ」構造自体がSTUB化（`OPP_CHOOSES_FOR_YOU`）されており別課題。詳細 BUGFIXES 続き88。
- [~] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件**。**単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）**。genuineな残ギャップは(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）。残る**広域24件**（「あなたのシグニは…」）はsubjectFilter/新機構が要る別課題。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。
- [ ] **スケールアップ**＝stub群全2,306枚へ拡大（SEMANTIC_AUDIT.md「スケールアップの進め方」）。

### 6.3 残・大型機構（個別カード・機構待ち）

- **ガード喪失条件の engine 配線（2026-07-04・続き20・表現は STUB `GUARD_LOSS_UNLESS_LRIG` で回復済み）**＝WX12-025/034/036「センタールリグが＜X＞でないかぎり、手札にあるこのシグニは【ガード】を失う」。engine のガード可否判定が `Guard === '1'` 直読みで6箇所超に分散（BattleScreen 9610/11280/12627/13639/13659・CPU側）＝共通ヘルパー `canCardGuard(cardNum, ownerState)` へ統一してから配線するのが本筋。
- **IS_MY_TURN誤変換系統の action層残3枚（2026-07-04・続き21・条件注入で無条件発火は停止済み）**＝WXK03-039（原文「デッキの下から4枚トラッシュ」が mis-parse で `TRASH SIGNI opponent` 化＝デッキ下ミル機構が要る・条件 TRASHED_DISTINCT_LEVELS_GTE 4 は注入済だが前段が誤りで発火せず）・WXK08-055（「シグニの下にあるカードを好きな枚数トラッシュ」＝under-signi trash＋多段閾値1/2/3/4以上）・WXK11-070（「エナ全トラッシュ」＋多段閾値5/10以上）。多段閾値は各しきい値ごとの nested CONDITIONAL 化が要る。**IS_MY_TURN誤変換の未消化サブ系統**＝公開系（`この方法で〜公開された場合`＝REVEAL 前段・WX05-013 美巧8種類/WX12-Re10/WX21-023 等）・エナ置き（`エナゾーンに置かれた場合`・WX14-069/WX15-106）・デッキ加え（WX19-040/WXK02-039/WX22-006）・単一カード公開判定（`そのカードがレベルN/＜X＞の場合`＝多数）＝census IS_MY_TURN誤変換の残53。
- **ダメージ置換系の残テール（2026-07-05・続き25）**＝(a)**WXDi-D07-007 の「防御成功ごとにルリグ【自】付与」**＝現状 log-only STUB `LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE`（シールド PND 2/1 は正実装）。「ダメージを防いだ」イベントのトリガー収集パスが要る。(b)**WX24-P4-006**「それより低いレベルを持つ対戦相手のシグニによってダメージを受ける場合」＝動的ダメージ源フィルタ（engine はダメージ源自体を未追跡）。(c)**「あなたがブーストしていた場合」条件**（WX25-P1-002/006/008/010＝ブースト機構。WX25-P1-010 の相手8枚ミル前段も無条件のまま＝owner是正のみ済み）。
- **スペルの被破棄【自】トリガー2枚（2026-07-04・続き20）**＝WX17-045 FLASH（「このカードが手札からトラッシュに置かれたとき、相手シグニ1体ダウン」）・WXDi-P10-070 枝折（「自ターン中に捨てられたとき+2000」）。スペルは場ソースでなくトリガー収集経路が無い＝手札破棄イベントからスペル側【自】を収集する新パスが要る（census 構造:【自】の残高シグナル2はこれ）。
- **続き20の近似・STUB テール**＝WX24-P2-049-E1b（STUB `POWER_PLUS_BANISHED_POWER`＝バニッシュしたシグニのパワー分+の動的値）・WX25-CP1-040-E1b（STUB `VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`＝可変エナコスト→同レベルバウンス・【絆自】も未対応）・WX14-028-BURST「異なる色を持つ2枚」制約なし＋E1「緑ではない」colorExclude 未付与（色バッチで）・WX20-028-E2「アクセ3枚以上→自アクセ+相手エナ+相手全シグニをトラッシュ」の再エンコード（現状 hasAcce 相手1体トラッシュの誤形）・NEGATE_NTH_ATTACK はシグニアタックのみ（WX10-018 原文はセンタールリグも）・WXK04-015-E1b/WXK01-028 系のキー自壊コスト省略近似・WXDi-P16-092 のチーム条件（LOSE_COLOR_ALL_ZONES に activeCondition 無し＝機構censusバッチで）。

- **引用AUTO付与の精緻化（`GRANT_QUOTED_AUTO_ABILITY`）** ＝**✅一次完了（B4）**＝引用【自】/【常】能力を実発火（自場シグニ・ターン限定・parse成功時のみ）。**残**＝permanent（このゲームの間）付与・相手シグニ付与・STUB能力＝従来 log-only 据置。例: WX25-CP1-074／WXK09-055／WX24-P2-044。
- **「ゲームから除外」の機構待ちテール（2026-07-04・従来 TRASH 近似のまま no-op 据置）**＝(a)遅延自己除外「ターン終了時に、またはこのシグニが場から離れる場合に、このシグニをゲームから除外する」（WX16-040/WX21-Re06/WD22-035-G）＝遅延トリガー機構が要る。(b)ルリグデッキのピース除外（WXDi-D07-004/WXDi-P04-013/**WXDi-P04-016-E3**＝2026-07-06確認・原文「あなたのルリグデッキにあるピース１枚をゲームから除外する」が curated/fresh とも無関係な `TRASH{DECK_CARD/TRASH_CARD, owner:opponent}` に誤エンコード＝要修正だが本機構未実装のため保留）＝execExile の LRIG_DECK 対応が要る。(c)使用後の自己除外「このカード/このスペルをゲームから除外する」（WXK11-070/PR-378/SP36-001/WX17-044）＝source自身の追跡が要る。(d)文脈参照「それをゲームから除外」（WXDi-D08-012/WXDi-D09-P15）＝直前対象の追跡。
- **状態フィルタ脱落の残テール（2026-07-04・続き16・除去系 凍結7＋ダウン/アップ28効果は是正済）**＝census 残（凍結13・ダウン/アップ38）は別パスで未patch＝(a)**コスト節「アップ状態のルリグ/シグニをダウンする：〜」**（WX14-055/WX24-P2-069/WXK10-023/WXK11-056/WXDi-P12-049/P13-053/P14-043-049 等）＝状態はコスト側（`：`後の効果テキストに状態語なし）＝コストの「アップ状態要求」を表す語彙が要る（現状コストは down 効果のみ）。(b)**条件「このシグニがアップ状態の場合」**（WX15-055/056/WXDi-CP01-045/P02-038/P04-036/WX25-P2-048/WX18-052/WXK08-034）＝activeCondition/条件機構。(c)**CONT REMOVE_ABILITIES**（WXEX1-02-E1＝count:1・filter無しで「凍結シグニは【常】【自】を失う」＝全frozen＋能力種別限定）。(d)WXDi-P02-065-E1（count:2 vs 原文「1体」＋「≥2存在」条件欠落）・WXDi-P01-003（アーツ本体欠落）・WX09-016（ダウン状態シグニへの GRANT_PROTECTION）・CHOOSE/入替系（WX24-P2-087/WXDi-P08-037）。
- **GRANT_LRIG_ABILITY の低品質展開4枚（2026-07-04・MANUAL化で no-op 据置）**＝WX15-016（付与【自】の「この方法で置いたカードが《バーストアイコン》を持つ場合アタック無効」＝条件が IS_MY_TURN に誤約・相手ターントリガーで恒久false）／WD21-009（ルリグ下N枚→2/4/5枚の多段閾値＝平坦化すると無条件ガード封じ+トリクラの過剰発火）／PR-204（「カード2枚をルリグトラッシュに置いてもよい。そうした場合アップ」＝支払いゲート脱落で毎アタック無償ルリグアップ＝無限アタック）／PR-238（置いた枚数×5の比例ミル）。共通で「optional支払い→そうした場合」のコストゲート機構＋多段閾値が要る。SPDi43-03/11/12/13・WXK11-052 の「ターン終了時までこのルリグは『【自】…アップ』を得る」も同根（現状は即時 UP LRIG の平坦化近似＝§7の実機検証対象外）。
- **BURST内「そうした場合/〜の場合」の要新語彙テール7枚（2026-07-04・続き19・TRASH前段32偽陽性と易3枚是正後の残）**＝(a)~~LAST_PROCESSED フィルタ条件: WXEX1-43-BURST・WXEX1-36-BURST~~ **✅続き24で是正**（`LAST_PROCESSED_MATCHES{filter}` 新設・heldReview採用）。(b)**then内容欠落**: WD23-023-E-BURST（「デッキから1枚探してライフクロスに加えシャッフル」→SHUFFLE のみ＝SEARCH の then ADD_TO_LIFE 対応要）。(c)**任意化**: WX14-026-BURST（「クラッシュしてもよい」→強制 LIFE_CRASH）＝optional crash＋conditional ゲート。(d)**コストと対象の参照逆転**: WX16-033-BURST（自シグニバニッシュがコストで対象相手シグニをトラッシュ）・WX17-041-BURST（自トラップ回収がコストで対象相手シグニをバウンス）＝対象保持→コスト→適用の再構成（「それ」参照機構）。(e)**源違い**: WX19-Re10-BURST（「手札1枚をライフクロスに加える」→fromTop＝デッキから）＝ADD_TO_LIFE の from hand 対応要。
- ~~**ON_SIGNI_FROZEN のresume経路取りこぼし（2026-07-07・続き40・§7 R38実機検証で発見・WX08-039/WXEX2-02/WXDi-P04-065が対象）**~~ **✅続き41（Opus）で修正・実機PASS**＝`handleEffectInteraction` の pendingEntries ブロックに他4つ（`collectDeckShuffleInline` 等）と同型の `collectFreezeInline` を追加配線（`detectNewlyFrozen`→`collectFreezeTriggers`→`actions_done` 反映）。`node scripts/verifyBattleDrive.mjs freezetrigger` が PASS（`freeze=true watcher=true`・-1000 反映確認）＝既定orderに復帰。golden 151/smoke全0/fuzz全0。詳細は BUGFIXES 最上部。
- ~~**🆕 resume経路inline collector欠落＝機構原因を特定（2026-07-09・続き58・§7 R43/R46実機検証で発見・R41/R31で対照確認・未修正）**~~ **✅続き61（Opus）で根本修正＝盤面差分トリガー収集を `collectBoardDiffTriggers` に統合（両経路から共通呼び出し）。4シナリオ（R46/R43/R39/R36）実機FAIL→全PASS・回帰なし・全ゲート緑。詳細 BUGFIXES 最上部。以下は当時の原因分析（記録保存）。**＝ON_SIGNI_FROZEN（R38）と同型のバグを**2件連続で確認**＝(a)**ON_OPP_POWER_DECREASED**（WX13-036/WXEX2-52対象・`collectPowerDecreaseTriggers`＝`triggerCollect.ts:900`）：WD11-013（相手シグニ1体-1000・mandatory）をSELECT_TARGET resumeで解決するとwatcher無発火。再現＝`node scripts/verifyBattleDrive.mjs oppPowerDecreased`。(b)**ON_ENERGY_TO_TRASH**（WD15-015/同様カード対象・`collectEnergyToTrashTriggers`＝`triggerCollect.ts:808`）：WD15-014（相手エナ1枚トラッシュ・mandatory）をSELECT_TARGET resumeで解決するとwatcher無発火。再現＝`node scripts/verifyBattleDrive.mjs energyToTrash`。**両シナリオとも既定orderから除外済み**。
  - **🆕 機構原因を`BattleScreen.tsx:3428`の`resolveStackNext`本体で特定（続き58・コード読解で確定・推測ではない）**＝`resolveStackNext`は`executeEffect`の戻り値`result.done`で分岐する（3538行）。`result.done===true`（対象選択等の中断なしに完結）の場合のみ`else`節（3556〜4150行）が走り、ON_BANISH/ON_CARD_MILLED_FROM_DECK/ON_CHARM_TO_TRASH/ON_ENERGY_TO_TRASH/ON_REFRESH/ON_OPP_POWER_DECREASED/ON_CARD_MOVED_TO_DECK/ON_SIGNI_FROZEN等のtrigger収集が行われる。`result.done===false`（SELECT_TARGET/CHOOSE中断）の場合は`pending_effect`を保存して即returnし（3538-3555行）、`else`節は一切実行されない＝**この時点でtrigger収集の機会を失う**。ユーザーが対象を選んで`handleEffectInteraction`（resume）で再開しても、そちらのpendingEntriesブロック（4384-4436）には`collectDeckShuffleInline`/`collectBanishOppByEffectInline`/`collectLrigUnderMovedInline`/`collectKeywordGainedInline`/`collectFreezeInline`の5種しかinline版が無い＝**「原因アクション自体がSELECT_TARGET/CHOOSEで中断するtrigger種別」だけがこの穴の影響を受ける**。ON_OPP_POWER_DECREASED（原因＝POWER_MODIFY単体対象で中断）・ON_ENERGY_TO_TRASH（原因＝TRASH単体対象で中断）はまさにこれに該当し実バグ確認。
  - **🆕 対照実験で理論を裏付け＋精緻化（続き58）**＝(1)**R41 placedFront**（PASS）＝原因は`handleSummonSigni`の**通常召喚**（`collectFieldTriggers`をresolveStackNextを経由せず直接呼ぶ第三の経路）＝この穴と無関係。(2)**R31 drawBySourceStory**（PASS）＝原因アクションが対象選択不要な単純DRAW（E2）のため`result.done=true`のまま`resolveStackNext`のelse節に到達し`collectDrawTriggers`が正常に収集。(3)**🆕 R39 outsideDrawPhase（WXDi-D09-P19・FAIL）**＝R31と**同じ`collectDrawTriggers`**だが、今回は原因アクション（E2）が`SEQUENCE[TRASH(手札1枚選択・要対話), CONDITIONAL→DRAW]`＝**DRAW自体は対話不要でも、SEQUENCE内の先行ステップ（TRASH）が対話を要すればエントリ全体の完了はresumeに落ちる**ため無発火。**→理論を精緻化＝「原因アクション自体が対象選択を要するか」ではなく『そのstack entryの解決中に（SEQUENCE内のどのステップであれ）一度でも対話が挟まったか』が分岐条件＝同一collectorでもカードのSEQUENCE構造次第で結果が変わる（カード単位でなく解決経路単位のバグ）**。
  - **系統的懸念（上記の精緻化された理論に基づく推定・個別未検証）**＝`collectMillTriggers`(ON_CARD_MILLED_FROM_DECK)・`collectCharmToTrashTriggers`(ON_CHARM_TO_TRASH＝**R42と同一対象**)・`collectRefreshTriggers`(ON_REFRESH)・`collectMoveToDeckTriggers`(ON_CARD_MOVED_TO_DECK)・`collectAllyPlayOrOppDiscardTriggers`・`collectMaterialUsedOnSigniTriggers`・`collectOppArtsUseTriggers`/`collectArtsUseTriggers`＝**「そのカードの原因効果のSEQUENCE中に対話ステップが1つでもあるか」を見れば影響有無が判定できる**（`collectDrawTriggers`/`collectOppDrawTriggers`自体は対話なしSEQUENCEならR31のとおりPASSするが、対話ありSEQUENCEならR39のとおりFAILする＝同じcollectorでも個別カードごとに判定が要る）。
  - **🆕 R36 handDiscard（WDA-F02-17・FAIL）＝`collectAnyZoneTrashSelfTriggers`（ON_TRASH self・fromZones:hand）でも同型を実機確認（2026-07-09・続き60・Sonnet）**＝原因＝WXK10-065【出】「あなたは手札を1枚捨てる」（TRASH HAND_CARD self count1）がSELECT_TARGETを要し、手札に残ったWDA-F02-17自身を選んで捨てさせるとresume経路で完結する（ground truth＝hHand 2→0・hTrash 0→1は正しい）が、watcher（ON_TRASH self・fromZones:hand）が一度も発火しない＝`collectAnyZoneTrashSelfTriggers`もresolveStackNext中央diffのみ配線でresume側にinline版なし。系統的懸念リストに追加＝`collectDeckTrashSelfTriggers`（ON_TRASH self・fromZones:deck）も同型の疑いで未検証（`verifyBattleDrive.mjs handDiscard`で再現・既定orderからは除外）。
  - ~~**修正方針**＝`collectFreezeInline`と同型の…場当たり的対応は…対症療法止まり。根本修正としては、**`result.done`に関わらず両経路から共通で呼べる収集関数に統合するリファクタ**が本筋~~ **✅続き61（Opus）で実施＝`collectBoardDiffTriggers`（component-closure・約20種の盤面差分トリガーを before/after 比較で収集）を新設し、`resolveStackNext` の else 節と `handleEffectInteraction` の resume done 分岐を双方これ1呼び出しに置換。action型固有（COLLAB/REVEAL_UNTIL/arts/FORCE_END_TURN）は resume で再現不能のため中央 diff に inline 据置。**
  - 詳細はBUGFIXES続き58（3エントリ・原因分析）＋続き61（根本修正）。
- **「対戦相手のシグニが場を離れたとき」トリガー（3枚・behavior-audit 段階4で発見・2026-07-03）**＝`ON_LEAVE_FIELD` の watcher 収集（`collectLeaveFieldTriggers`）は**離れたカードと同じ側（味方）の watcher しか見ない**ため、相手の離脱を見る新 `triggerScope` と相手フィールド走査パスが要る。該当＝**WXEX1-30-E2**／**WXK11-017-E1**／**WXDi-P03-040-E1**（3枚とも現JSON `scope=self`＝誤発火）。
- ~~「このターンにあなたがアーツを使用していた場合」条件~~ **✅実装済（2026-07-03・続き13後半）**＝`ARTS_USED_THIS_TURN`＋`turn_arts_used` 機構で11枚全是正（⚠要実機検証）。~~WX25-P1-106 BURST のダメージ置換近似~~ **✅続き25で REPLACE_NEXT_DAMAGE_WITH_MILL に正エンコード**。
- **自パワー閾値条件の残テール（2026-07-03発見・素直な21枚は是正済）**＝(a)「代わりに」昇格型：WXDi-P01-054（【起】バニッシュの昇格）／WXDi-P12-067（被バニ反応の昇格）。(b)多段閾値型：PR-470A（10000/25000）／WXDi-D01-016（15000/20000）。(c)【起】の自パワー条件：WXDi-P03-062（起動時 evalUseCondition 配線の確認要）。
- **WXDi-P05-006＝2択構造ごと崩壊**＝ピース打ち消し（カットイン使用＋対象ピース効果打ち消し＋除外）機構が無く、①②の択も脱落（現 curated は GRANT_KEYWORD 使用条件＋UNKNOWN の残骸）。ピース打ち消し機構待ち。
- `ON_CARD_MILLED_FROM_DECK` の収集機構（WX25-P2-009-E2＝現 `【※engine未配線】`）。
- リフレッシュ置換の実体（WX25-P2-009-E1＝現 no-op STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`）。
- 「他＜毒牙＞のシグニ効果で相手パワーが減ったとき」トリガー（WX25-P3-062-E1＝現 STUB `POWER_COPY_FROM_DOWNED`）。
- **ビートの残（低優先）**: トラッシュ→beat（WDK14-013）のプレイヤー選択ピッカーのみ自動近似。
- **G072 残6枚**（条件前置き付きの相手シグニ被バニッシュ反応）: WX05-040/WX11-027（「メインフェイズの間」）／WXEX2-23（「アタックフェイズの間」）／WXK11-055（「あなたの効果によって」）／WX13-051（「＜龍獣＞効果で」）／WXDi-P11-TK05（【チャーム】付き相手シグニ）。前置きモデリングの誤りリスク高く個別対応。
- **multi-dest pick（look→手札＋場の二目的）**: WX24-P1-017／WX24-P1-026／WX25-P3-038／WX25-CP1-025／WX26-CP1-019。付与/条件/絆を伴う同時pickは別語彙が要る。
- **GRANT_TO_PLACED_SIGNI 残（続き42で実装＝4枚）**＝「この方法で場に出たシグニは【K】を得る／のパワーを＋N／レベル１につきミル」は parser で `GRANT_KEYWORD`/`POWER_MODIFY`{targetsLastProcessed}＋`MILL{countIsLastProcessedLevelSum}` へ実装済み（WX25-P1-044/WX25-P2-039/WX24-P3-037/WX24-P3-039）。**残る honest STUB 2枚**＝引用複合能力付与：WX24-P1-017（「【自】バトルバニッシュ時、自アップ＋能力喪失」）・WX25-P3-038（「【自】アタック時、パワー8000以下を手札／能力なしならトラッシュ」）＝内側【自】ability の parse（GRANT_QUOTED_AUTO_ABILITY 系＝現状 log-only STUB）が要る。
- **凍結状態フィルタのアサシン変種**: WX25-P2-084②「【アサシン（凍結状態のパワー3000以下のシグニ）】」＋2択。
- **公開カード→自身のアクセ化**: WDK07-E15（新STUB `INTERNAL_ACCE_PICKED_TO_SELF` が要る）。
- **公開カードと同レベルの動的フィルタ**: WX24-P3-063（公開カードのレベルで相手全シグニ能力消失）。
- **前ターン跨ぎ保持**: WXDi-P11-001（「直前のターン」ライフクラッシュ履歴）。
- **使用制限の誤パース＋択崩壊**: WX20-021（「相手ターンにしか使えない」が壊れCONTINUOUS化＋3択全脱落）／WX24-P3-036（スペル打消し＋《無》任意払い）／WD14-011（E1トリガー thisCardOnly化＋BURST2択崩壊）。
- **コスト増加 残**: WXK11-003「このターン」型／WXDi-P06-031 等の起動能力コスト増加／WX20-Re20 等の自アーツコスト選択数依存。
- **引用/LB付与（ディスペア型）未対応**: WXDi-P02-039-E2／WX25-P3-027-E2（現 no-op or 誤バニッシュ）＝要本実装。
- **WXK10-008①**「相手ターン中エナの色と能力を失う」＝新語彙未対応（②のみ実装）。
- **任意コスト＋特定札捨ての複合 STUB 近似（機構待ち）**: WDK08-Y12／WX24-P2-048-E1 choice①。現状 `OPTIONAL_COST` で近似。本実装には「energy＋特定名カード捨て」「per-level 捨て枚数」の汎用コスト機構が要る。
- **その他既出複合**: WX25-CP1-002（リコレクト択一④owner）／WX25-P3-023-E2（遅延トリガー）／WXEX1-08（コインベット誘発＋ライズフィルタ）／WX16-048・WX16-023（ウィルス数+1の選択数スケール）／WX25-P1-103（look-pickチェーン）／WD22-036-G（self-banish起点の複合2択）／WX25-P1-052-E1（《相手ターン》AUTO＋名指しカード在場）／WXDi-P08-037（place-swap＋覚醒トリガー誤）。
- **保留（core改変が必要・1枚のためにはリスク過大）**: WXDi-P00-026（＜さんばか＞ルリグ付与＝ルリグ再アタック未実装がブロッカー）／**47枚の【使用条件】【チーム】**（正規デッキで常に成立＝機能等価のため保留妥当）。

### 6.4 オープンな実装課題（機構・基盤）
- **F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**：現状バトルバニッシュのみ対応。効果バニッシュ/バウンス等の場離れは未フック。対象: WX06-019（効果離場+powerReduction）／WX25-P1-056（非バニッシュ離場→バニッシュ置換）／WX17-075（`ON_PLACED_FRONT` 任意トリガー）。いずれも現状 no-op で無害。
- **CPU AI の拡張**：メインフェイズ AI（アーツ/スペル/起動効果の能動使用・グロウ時トリガー）未実装（→§8）。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。
- **トラッシュ自己起動のコストUI 残**：エナコスト以外（手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動）が未対応。対象: WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050・WX11-049・WX17-049・WX19-029（14枚）。
- **UNKNOWN（部分未実装・逆翻訳に`【未実装/UNKNOWN】`として露出）**: 24枚（2026-07-03 実測・`grep '未実装/UNKNOWN' docs/decompile_sheet*.txt`）＝WX05-010（ライフ見て任意トラッシュ→同数補充）／WX11-037（5枚公開→宣言カード手札）／WX11-043（ヘブン時に手札青スペル使用）／WX17-003 のほか、WX06-024／WX09-019-E3／WX17-052／WX20-077／WX21-Re19／WXEX1-32／WXK02-037／WXK07-106／WXK08-030／WX24-P1-035／WX24-P3-022／WX24-P4-038／WX25-P3-036／WX25-P3-050／WX26-CP1-061／WD23-017／WD23-024／PR-431／PR-461／PR-Di007（ジョークカード）。表示上「未実装」と明示されているため無言バグではない。
- **クラフトトークンの実機配置検証** ＋ ADD_TO_FIELD source 近似残: WXDi-CP02-087（エナ枚数条件）／WXDi-P03-078（自パワー動的フィルタ）／WXDi-P05-068（先頭ドロー脱落）／WXK07-105（ベット分岐）／WX25-CP1-066（場存在条件）／WX22-001-E3（付与型 leave トリガー機構）。
- **golden の型網羅**：DSLアクション型のうち golden 未カバーの型を洗い出し、1型1テストで追加（現106件）。
- **smoke SKIP 282 の解消**：autopilot 未対応の対話（REVEAL_CARDS/DECLARE_BOND 等）へカバレッジ拡張。
- **`checkAllEffects` の `MANDATORY_SUSPICIOUS`**（ヒューリスティック検出）の精査。`verifyEffects` の「定義なし」誤検出（注釈・トークン）の除外改善。
- **生ID残存＝表示or実装の穴**：`[STUB:X]` 系（残54件＝単発テール・`STUBS.md` 管理）。`[条件:X]`/`[アクション:X]` は解消済み。

---

## 7. フェーズ3残作業：実機挙動（P3）

**目標＝実機で各カードがルール通り動く。** `scripts/verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

> **実機ヘッドレス検証が可能（2026-06-30〜）**：`scripts/verifyBattleDrive.mjs`＝実ログイン→CPU戦→盤面注入→実UIクリックで効果発火→観測。手順は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)。**下記の宿題のうち `ON_TARGETED`／`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`／`ON_LRIG_UNDER_MOVED`／`ON_LRIG_GROW`／`ON_COIN_PAID`／`ON_DECK_SHUFFLED` は「発火すること」自体は既に実UI検証でPASS済み**（`ontargeted`/`banishbyeffect`/`lrigundermoved`/`cpugrow`/`deckshufflespell` 等の既定シナリオ）。**各項目末尾の「follow-up」注記（未カバー経路）だけが真に未検証のまま残っている**。

- **ON_LRIG_ATTACK_STEP_START（ルリグアタックステップ開始時）**：1枚（WX25-CP1-042-E2）。**①実機PASS＝✅確認済み（2026-07-09・続き57・Sonnet）**＝`verifyBattleDrive.mjs lrigattackstepstart`（既定orderに追加）。ATTACK_SIGNI→「ルリグアタックへ」→「まだ攻撃していないシグニがいます」確認ダイアログ「このまま進む」→ATTACK_LRIG遷移で発火。盤面ログ「[自分] 尾刃カンナ の【自】効果（ルリグアタックステップ開始時）」→SELECT_TARGET→相手手札1枚トラッシュ確認（2回連続PASS）。残＝②《ターン1回》の回数制限・③アクションは**パース近似**＝原文「クラッシュした相手ライフ1枚につき相手手札1捨て」ではなく固定「相手手札1トラッシュ＋ブルアカ-5000」が走る（厳密スケーリングは別課題・未検証のまま）。⚠**CPUターンのルリグアタックステップは未配線＝follow-up**。
- **ON_COIN_PAID（コインを支払ったとき）**：3枚（WXDi-P15-055/069・WXDi-P16-057）。✅発火自体は実UI検証済み（`WXDi-P15-069`で確認）。残＝③《ターン1回》《ターン2回》の回数制限・④自分のターン外（相手ターンのガード等）でも発火するか。⚠**スペルのベット（pending_spell/カットイン経由）とCPUルリグ【出】《コイン》は未配線＝follow-up**。
- **ON_LRIG_GROW（ルリグがグロウしたとき）**：5枚。✅発火自体は実UI検証済み（`WXDi-P03-039`・CPUセンターグロウも`cpugrow`で確認）。**②相手のグロウでany_opp発火する経路＝✅続き73（Sonnet）で2枚とも検証完了**（WXDi-P13-047／WXDi-P03-046）。**🆕続き75（Opus）で turnOwner ゲート未実装を修正**＝原文「**あなたのターンの間**、対戦相手のルリグがグロウしたとき」の前置きを parser が抽出せず `triggerCondition.turnOwner` が JSON に無かったため、相手が自分のターンに通常グロウするだけで毎回誤発火していた（過剰効果）。`effectParser.ts` の ON_LRIG_GROW スコープ抽出に ON_LEAVE_FIELD と同型の前置き抽出を追加し、**横展開で WXDi-P03-039／WXDi-P03-046／WXDi-P05-010（E1=self・E2=opponent）も同時是正**（engine は評価済み＝engine 不変）。実機 `lrigGrowAnyOpp`／`lrigGrowAnyOppP03046` は**判定を反転して PASS**（CPUグロウを `lrigUnder` 0→1 で確認した上で非発火＝ゲート成立。従来はバグ挙動を PASS 判定していた）。発火経路自体は golden で担保（「watcher のターン中に相手がグロウ」）。詳細 BUGFIXES 続き75。**残＝未検証**＝③any_opp トリガーがグロウ先ルリグの【出】より先に解決される・④《ターン1回》が2回目グロウで再発火しない。⚠**アシストルリグのグロウ経路は未配線（センターグロウのみ）＝follow-up**。
- **ON_TARGETED（対象になったとき）**：AUTO（14枚）。✅発火自体は実UI検証済み（`WXDi-P03-067`）。**①個別確認＝続き64（Sonnet）でWXDi-P02-043を追加検証しPASS**（`verifyBattleDrive.mjs ontargeted2`＝`ontargeted`と同一配線で正しく発火。5回中4回PASS・軽微なタイミングフレークは既存シナリオと同型で engine 起因ではない）。`order`追加済み。**①残る3枚＝✅続き72（Sonnet）で全数検証完了**（`ontargeted3`=WXDi-P11-040／`ontargeted4`=WXDi-D09-H14／`ontargeted5`=WX25-P2-055・3件とも単体PASS・`order`追加済み）。検証中に**2件の実データ疑義を発見**＝(a)WXDi-P11-040のGRANT_KEYWORDにexcludeSelf相当のフィルタが無く原文「他のシグニ」を無視して自分自身に付与、(b)WX25-P2-055のREMOVE_ABILITIES target.ownerが`'opponent'`だが原文は自己参照（本来`'self'`のはず）。**③usageLimit＝❌続き74（Sonnet）で実バグを発見**＝同一ターン内に2回対象化すると2回目も発火（`collectTargetedTriggers` が `usedOncePerTurnIds` を返さず `actions_done` が更新されない）。**🆕この3件はすべて✅続き75（Opus）で修正済み**＝(a) parser に `filter.excludeSelf` 付与＋engine `execGrantKeyword` に excludeSelf 実装（実機 `ontargeted3` PASS＝watcher 自身ではなく他の味方に付与）／(b) parser の能力消去規則がトリガー句の「対戦相手」を拾う誤りを是正し `owner:'self'+thisCardOnly` へ（実機 `ontargeted5` PASS＝原文どおり watcher 自身が能力喪失）／(c) `collectTargetedTriggers` の戻り値を `{entries, usedHostIds, usedGuestIds}` へ拡張し呼び出し元で `actions_done` へ書き戻し（実機 `ontargetedUsageLimit` PASS＝2回目は非発火）。詳細 BUGFIXES 続き75。**残＝未検証**＝②turnOwner:opponent ゲート。⚠**forced単一対象（pending無しで自動解決される対象取り）経路は未発火＝follow-up**。⚠**driver 注意**＝usageLimit が実際に効くようになったため、watcher が guest 側の ON_TARGETED 系シナリオは注入時に `guestSet` の `actions_done` クリアが必須（続き75で該当6シナリオに追加済み）。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（`npx tsx scripts/parserWorklist.ts` で VALUE=0・LOSS=0・同型★0）。**残る作業は表現ではなく engine 配線の実機検証のみ**＝下記R30-R46系トリガーの個別確認、および上記C1 timingのfollow-up。診断＝`npx tsx scripts/archive/_flattenList.ts`（0枚を確認）。詳細な系統別の直し方・分類は `BUGFIXES.md` のR5〜R58エントリを参照。

**残る実機検証項目（R30-R46・engine配線済みだが実機PvP/CPU未検証）**：
- **ON_OPP_POWER_DECREASED（R46・毒牙）**：WX13-036/WXEX2-52。**①実機PASS＝✅続き61（Opus）で修正確認**＝続き58発見のresume経路取りこぼしを `collectBoardDiffTriggers` 統合で解消。`verifyBattleDrive.mjs oppPowerDecreased`（WD11-013→WX13-036）でwatcher「フィア＝パトラ（相手パワー減少時）」発火。**残＝未検証**＝②複数同時減少時の合算挙動③相手自身の自己弱体では発火すべきでない（現状は近似で発火しうる）。
- **ON_ACCE_ATTACH host条件/ON_REFRESH/ON_LEAVE_FIELD leftToZone（R45）**：①WXK05-041（アクセがレベル4以上のシグニに付いたとき）②WXDi-P04-043（いずれかがリフレッシュ）③WXK02-041（シグニが場→手札に戻った）。**③実機PASS＝✅確認済み（2026-07-09・続き58・Sonnet）**＝`verifyBattleDrive.mjs leaveFieldToHand`（WX21-057→WXK02-041）。ON_LEAVE_FIELDは§6.3の「対策済み9種」の1つ＝原因のBOUNCE（自分のシグニ1体を対象・SELECT_TARGET要）に対話が挟まってもPASS＝R38/R43/R46/R39の穴とは無関係と対照確認。`order`復帰済み。**②実機PASS＝✅確認済み（2026-07-10・続き60・Sonnet）**＝`verifyBattleDrive.mjs refreshTrigger`（WXDi-P04-043→WX15-073）。hostデッキ残り1枚＋trash1枚にし、WX15-073召喚（E1バニッシュ候補0件で即done・E2ドローがデッキ最後の1枚を引いてちょうど0枚化＝リフレッシュ1回のみ）で発火。ログ「幻竜姫　ドラゴンメイドの【自】効果（リフレッシュ時）」を3回連続で確認＝対話なしDRAW/no-op経由のリフレッシュはresume経路取りこぼしと無関係で安全（R31/oppDrawと同型パターン）。⚠デッキを最初から0枚にすると1回目のno-op解決時点で既にリフレッシュ成立し、2回目リフレッシュ時の「ターン強制終了」ルールで収集前に打ち切られる罠を発見・回避（詳細VERIFY_BROWSER.md/BUGFIXES.md）。`order`復帰済み。**①実機❌FAIL＝続き64（Sonnet）で `execAttachAcce` fromHand経路の実バグを発見**（未修正・Opus引き継ぎ）＝手札からACCEカードを選択・確定した時点で完了扱いになり `signi_acce` が終始null（ホスト選択の2段目SELECT_TARGETが現れない）。`thenAction` に未完結アクションを渡す設計が resume 機構と噛み合っていない。詳細 BUGFIXES 最上部・`verifyBattleDrive.mjs acceAttach`（`order`未追加）。
- **ON_EXCEED_COST 場シグニ（R44）**：WXDi-P06-078。**①実機PASS＝✅続き64（Sonnet）で確認**＝`verifyBattleDrive.mjs exceedCost`（WX11-004→WXDi-P06-078）。ルリグ【起】エクシード１支払い時に「発動順序を決めてください」モーダルへwatcherが正しく並び発火を確認（3回連続PASS）。`order`追加済み。**残＝未検証**＝②対象選択CHOOSEで相手シグニ1体に-5000が実際に適用される（今回はスキップで完走）③カットインexceedでは未発火（近似）。
- **ON_ENERGY_TO_TRASH（R43）**：WD15-015。**①実機PASS＝✅続き61（Opus）で修正確認**＝`collectBoardDiffTriggers` 統合で解消。`verifyBattleDrive.mjs energyToTrash`（WD15-014→WD15-015）でWD15-015が【ダブルクラッシュ】取得・watcher「幻竜　アメリカワニ（エナトラッシュ時）」発火。**残＝未検証**＝②自エナ・相手効果による相手エナトラッシュでは非発火（「自効果」限定は近似で未判定）。
- **ON_CHARM_TO_TRASH（R42）**：WX16-Re05。**①実機PASS＝✅続き64（Sonnet）で確認**＝続き61のcollectBoardDiffTriggers統合がcollectCharmToTrashTriggersも一緒にカバーしていたため追加修正不要だった。`verifyBattleDrive.mjs charmToTrash`（WX19-023→WX16-Re05・banish resume経路でチャームがguest.trashへ→watcherが対戦相手シグニに-4000）でPASS。`order`配列に追加済み。**②バトルバニッシュ経路＝❌続き74（Sonnet）で実バグを発見→🆕✅続き75（Opus）で修正・実機PASS**＝戦闘でチャーム付きシグニが力比べに負けてバニッシュされても watcher が一度も発火しなかった（ground truth＝チャームの trash 移動自体は正常）。原因＝`resolvePendingSigniBattleFor`（バトル解決）が独自のトリガーリストを構築し `collectCharmToTrashTriggers` を一切呼ばない＝効果banish経路（`collectBoardDiffTriggers`）のみ配線され戦闘banish経路が未配線だった。**実戦で最頻の経路（通常の戦闘）で ON_CHARM_TO_TRASH 系が全く機能しない実害の大きいバグ**。修正＝`resolvePendingSigniBattleFor` の `allTriggers` 組み立てに、バトル前後の `countCharmsToTrash` diff に対する収集を追加（`usedOncePerTurnIds` 書き戻し込み・効果banish経路と同型）。`verifyBattleDrive.mjs charmToTrashBattle` PASS・既定 `order` に追加済み。詳細 BUGFIXES 続き75。
- **placedFront（R41）**：WXDi-P03-043。**①実機PASS＝✅確認済み（2026-07-09・続き58・Sonnet）**＝`verifyBattleDrive.mjs placedFront`（WD01-013→WXDi-P03-043）でhost自身の通常召喚を正面ゾーン（ミラー対応 index i↔2-i）へ配置→POWER_MODIFY -3000が即時反映（`hPowerMods=WD01-013#1:-3000`）。**handleSummonSigniが`collectFieldTriggers`を直接呼ぶ経路＝R38/R43/R46のresume経路取りこぼしとは無関係と判明**（系統的懸念の対照実験として有効＝全trigger種別が同じ穴を持つわけではない）。`order`配列に復帰済み。**残＝未検証のまま**（②正面以外の配置では非発火＝コード上はガード済みだが実機未確認）。**⚠副産物の発見（低優先）**＝ログ表示が「の【自】効果（相手シグニアタック時）」固定文言（`triggerCollect.ts:1492`のany/any_opp共有ループがON_ATTACK_SIGNI用ラベルをON_PLAY/ON_BANISH/ON_BLOOMでも使い回している表示バグ・機能には影響なし）。
- **opp-draw（R40）**：WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423。**①実機PASS＝✅確認済み（2026-07-09・続き60・Sonnet）**＝`verifyBattleDrive.mjs oppDraw`（WXDi-P15-091→WX12-047のCPU自動アタックドロー）で発火確認＝ログ「[相手]幻水　ヤリイカの【自】効果（シグニアタック時）」→「[自分]羅石　ラブラドライトの【自】効果（対戦相手ドロー時）」・hHand 5→6。R31と同型（対話なしDRAW→resolveStackNextのdoneブランチで正常収集）＝resume経路取りこぼしの穴とは無関係。`order`配列に追加済み。⚠近似＝「自分の効果で」発生源限定なし（②未検証のまま）。
- **outsideDrawPhase（R39）**：WXDi-D09-P19/WXDi-P05-062。**①実機PASS＝✅続き61（Opus）で修正確認**＝SEQUENCE内TRASH対話を挟むDRAWの取りこぼし（解決経路単位のバグ）を `collectBoardDiffTriggers` 統合で解消＝場当たり的inline追加では潰せなかった本命ケース。`verifyBattleDrive.mjs outsideDrawPhase`（WXDi-D09-P19自己完結・E2 SEQUENCE[TRASH手札1枚→DRAW]→E1反応）でWXDi-D09-P19+1000・watcher「蒼天　アウドムラ（ドロー時）」発火。`order`復帰済み。**残＝未検証**＝②ドローフェイズの通常ドローでは非発火。
- **凍結トリガー（R38）**：WX08-039/WXEX2-02/WXDi-P04-065。**①実機PASS＝✅修正完了（2026-07-07・続き41・Opus）**＝続き40で発見した「resume経路でwatcher無発火」バグを `collectFreezeInline`（§6.3参照）で解消。`verifyBattleDrive.mjs freezetrigger` が PASS（`freeze=true watcher=true`・凍結された相手シグニに-1000反映）＝既定orderに復帰。**②実機PASS＝✅確認済み（2026-07-12・続き92・Sonnet）**＝`verifyBattleDrive.mjs freezetriggerUsageLimit`（WX01-081×2召喚→guest2体を別々に凍結）で、1回目の凍結でwatcher（WX08-039）が発火しgHandが減る一方、同一ターン内の2体目の新規凍結（別ゾーン）ではusageLimit《ターン1回》が正しく発火を抑制することを確認（2回連続PASS）。`order`配列に追加。残＝③複数同時凍結時の合算は未検証（次の実機シナリオ候補）。
- **パワー0以下トリガー（R37）**：WX20-Re03/WX21-067/WX22-013/WXDi-P01-043/WXDi-P14-009。**①は実機確認済み（2026-07-07・続き39）**＝`verifyBattleDrive.mjs powerzero`（WD11-013→WX21-067）で相手シグニ0化→WX21-067がドロー、盤面ログ「アイン＝テトロドの【自】効果（パワー0以下時）」を確認。**他4枚の個別確認＝✅続き94（Sonnet）でsigni watcher 2枚を追加確認**（`powerzeroWX20Re03`/`powerzeroWXDiP01043`＝ともにENERGY_CHARGE_FROM_DECK・実機PASS2回連続・`host.energy`増加で確認。後者はバッチ実行時のみ`wxk10068banish`と同型のguest_state注入レースでFAILしうる＝`order`配列には追加せず単体実行専用）。**🆕続き95（Sonnet）でLRIG watcher残り2枚（WX22-013・WXDi-P14-009）を検証→両方とも実機で一度も発火しない実バグを発見・確定**＝原因は`collectPowerZeroTriggers`（`triggerCollect.ts:195`）が`field.signi`のみ走査し`field.lrig`を見ていない構造的欠陥（他の大半のコレクタが使う共通ヘルパー`ownFieldSources`未使用）＝**LRIGがwatcherだと印刷テキストどおりの能力が一切機能しない**。`powerzeroWX22013`/`powerzeroWXDiP14009`シナリオを新設（呼び水WXDi-P02-084の-1000適用は実機ログで確認済み・watcher非発火を確認＝どちらも意図的にFAILする回帰シナリオとして`order`配列には追加しない）。Opusタスク12へ登録。詳細 BUGFIXES 続き95。**残＝②《ターン1回》が複数同時0化でも1回・③連鎖再発火は引き続き未検証**（LRIG watcher2枚はOpus修正後に再検証）。
- **手札捨て/トラッシュ flatten（R36）**：WDA-F02-17-E3／WXDi-CP02-082（自ターンE1／相手ターンE2の出し分け）。**①実機PASS＝✅続き61（Opus）で修正確認**＝ON_TRASH(self,fromZones:hand)のresume経路取りこぼしを `collectBoardDiffTriggers` 統合で解消。`verifyBattleDrive.mjs handDiscard`（WXK10-065の【出】手札1枚捨てでWDA-F02-17自身を選ばせる）で対戦相手-5000・watcher「幻蟲　§アメンボ§（手札／エナから）」発火。**残＝未検証**＝②WXDi-CP02-082（相手ターンE2の出し分け）。
- **drawBySourceStory（R31）**：WX20-026-E3（自＜凶蟲＞シグニの効果ドローで相手シグニ−4000）。**①実機PASS＝✅確認済み（2026-07-09・続き58・Sonnet）**＝`verifyBattleDrive.mjs drawBySourceStory`（ATTACK_SIGNI→E2のDRAW→E3のcollectDrawTriggers発火）。R41(placedFront)に続く「resume経路取りこぼし仮説」の対照実験＝**原因アクション（DRAW）がSELECT_TARGET等の中断を要さないため`resolveStackNext`の`result.done`分岐内で正常に収集される**ことを確認（§6.3のresume経路取りこぼし機構解説を参照）。`order`配列に復帰済み。**残＝未検証のまま**（原文の「他の＜凶蟲＞がいる場合」条件がJSON側で欠落し無条件発火＝census系の別件過剰効果・今回の検証対象外）。
- **ON_PLAY any_opp + targetsTriggerSource（R30）**：WXK10-022-E1。続き64（Sonnet）で発見したブロック要因（WXEX2-50-E3の owner誤パース）は続き66（Opus）で是正済み＝発火経路は開通した。**①❌続き70（Sonnet）で新規バグを発見→🆕✅続き75（Opus）で修正・実機PASS（2回連続）**＝WXEX2-50【起】のSEQUENCE（①対戦相手のトラッシュのシグニを対戦相手の場に出す→②自分のトラッシュの＜凶蟲＞シグニを自分の場に出す）で、ground truth は正しいのに watcher（WXK10-022-E1）が一度も発火しなかった。原因＝`handleEffectInteraction` の `!result.done` 分岐（＝SEQUENCE 途中ラウンド）が **ON_BANISH だけを特例収集**していて `collectBoardDiffTriggers`（続き61導入の統合収集）を呼ばず、step1 の盤面変化が一度も diff 評価されないまま `bs.guest_state` に取り込まれ、step2 が done で完了した時点では **before に既に含まれる＝差分ゼロ**で永久に見逃されていた（続き58/61 が直した「1ラウンドで完了する効果の resume 取りこぼし」とは別系統＝**2ラウンド以上を要する SEQUENCE の途中ラウンド**が対象）。**修正＝その ON_BANISH 特例を done 分岐と同一の `collectBoardDiffTriggers` に置き換え**（設計判断＝pending 中にスタックへ積むのは従来の ON_BANISH 特例と同じ扱いで新しい実行順序を持ち込まない／差分ベースラインは DB 書き込み前の `bs.*_state` なので途中ラウンドでも正しい／コミット後は before 側に含まれるため二重収集にならない）。**副次的に BANISH 以外の全トリガー種別（ON_TRASH/ON_DRAW/ON_ENERGY_TO_TRASH/ON_CHARM_TO_TRASH/ON_LEAVE_FIELD/ON_OPP_POWER_DECREASED 等）も多段 SEQUENCE の途中ラウンドで拾われるようになった**（従来は BANISH 以外すべて取りこぼし）。`onPlayAnyOpp` を既定 `order` に追加。二重発火の回帰確認＝盤面差分系8シナリオ全PASS。詳細 BUGFIXES 続き75。**残＝②turnOwner:selfゲート・③usageLimit《ターン1回》の個別確認**（発火経路が開通したので検証可能に）。

**その他の実機検証待ち**：
- **B4引用付与の実発火**：「あなたの〜シグニ1体を対象とし、ターン終了時まで、それは『【自】このシグニがアタックしたとき〜』を得る」型（WX24-P2-018等）の付与先アタック時実発火。⚠permanent/相手シグニ付与は未対応＝log-only据置。
- **B2 REVEAL_DECK_TOP＋動的閾値**：WX17-028。⚠eachDistinctLevel厳密enforce未対応（同レベル4枚でも通る近似）。
- **B3 INSTALL_DELAYED_TRIGGER**：WX25-CP1-069。⚠crasherFilterは「場に該当シグニがいるか」で近似＝クラッシュ源未追跡。
- **ビート機構Phase1-7**：[条件]ゲート開閉／ON_BECOME_BEAT watcher の self/any_ally出し分け／beat対象のプレイヤー選択UI（場シグニ選択）／CPU自動近似。
- **機構④誤parse3枚**：WXDi-P07-044／WX25-P3-062-E2。
- **F-3身代わり対話**（バトルバニッシュ経路）：犠牲型 WX12-024/WXEX2-60/WX20-055/WXDi-CP01-032/WXDi-P10-052、コスト払い型 WX10-033/WX11-029。
- **LOOK_AND_REORDER の canTrash UI** / **WX04-005-E3**（場出し数制限・捨て選択）/ **WX04-004-E2**（守備側アタック無効化）。
- **G144/G145**（効果配置時の any_ally反応）：(a) 他シグニをダウン配置→G144アップ、(b) 他シグニ場出し→G145自身アップ。

### 7.2 対話UIの残実装
- トラッシュ自己起動のエナ以外コストUI（手札捨て/コイン/エクシード等・14枚・上記6.4と同一対象）
- LOOK_AND_REORDER の canTrash UI
- ビートのトラッシュ版選択ピッカー
- F-3身代わり対話（バトルバニッシュ経路7枚）

### 7.3 既知の近似の裁定
上記各項目の「⚠近似」注記を1つずつ「精緻化する／実害なしと容認する」で消し込む。

---

## 8. フェーズ4：対戦体験の完成

- [ ] **CPU AI のメインフェイズ拡張**（唯一の「新規設計を要する大物」）：アーツ/スペル/起動効果の能動使用・グロウ判断・CPU END分岐の予約型対応（現状 `turn_end_draw_count` のみ）。**先に DESIGN §4「CPU は対人戦と同じ処理」の統一を完遂**してから AI 判断を乗せる。
- [ ] **doPhaseAdvance の pure 抽出は「やらない」を既定**（費用対効果逓減と結論済み）。CPU統一で必要になった部分だけ最小限切り出す。
- [ ] **リリース判定**：fuzz重め（`npm run fuzz -- --games 2000 --moves 80`）＋実機PvP/CPU通し対戦スモークをリリースゲートに。DESIGN §5の手順（version bump→CI→push→`npx vercel --prod`）で本番反映。

---

## 9. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外

1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。【真の偽陽性】
2. **CHOOSE/チェインの1文圧縮**＝「以下の[N]つから[M]つ（まで）を選ぶ」で改善済み（BUGFIXES③）。択肢が全部出ていれば機能的には正しい。
3. **REVEAL_AND_PICK / LOOK_AND_REORDER の文法崩れ**＝主要系統は是正済（BUGFIXES上部）。残りは§5bの低優先テール。
4. **ルール注記**（「（コストのない【出】能力は発動しないことを選べない）」等）＝効果ではない。
5. **アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
6. **BET_MECHANIC STUB**＝§5bのZ-2（機構待ち）。
7. **owner:any の一括変換は禁止**：POWER_MODIFY/BANISH の `owner:'any'` は大半が正当（「シグニ1体を対象とし±N」＝自他選択／「すべてをバニッシュ」）。原文に明示主語があるものだけ個別是正。
8. **`[STUB:id]` を含むからとスキップしない**：実装済みハンドラのタグ表示。ただしハンドラがカード全体を覆うか（◎）／断片だけで残りを落としたか（実バグ）はタグでは区別不可＝各外れは個別検証。[[stub-means-implemented]]
9. **LIFE_BURST 内 `CONDITIONAL{IS_MY_TURN}`** は実害なし（常時true＋「そうした場合」特別処理）。修正不要。

## 10. 触らなくてよい/枯れた系統（調査済み）

- 強制アタック＝実装済み（未配線は WX12-010 複雑レゾナのみ）。BURST丸ごと欠落＝残0。保護系キーワードのowner誤り＝残0。
- 同型★（`grouped_all.txt`）＝**枯れた・常に0維持**。残1件 `WX04-056` は無害な表現差（任意）。
- 「あなたのアタックフェイズ開始時」系（self約407件）は**全再生成禁止**（約90枚退化）。個別にtiming/triggerScopeを直す。

## 11. 残・大型機構オーナー表（ほぼ完了の台帳）

着手前に**この表の「状態」を `着手中(担当名)` に更新してコミット**（重複防止）。実装の型は §3「機構実装の型」に従う。

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| 引用AUTO付与（`GRANT_QUOTED_AUTO_ABILITY`） | 中 | 中 | **表現完了＋engine精緻化(B4)着手済**＝引用【自】/【常】能力を実発火（自場シグニ・ターン限定・parse成功時のみ）。残＝permanent/相手付与対応・誤パース是正（約30枚は原文に引用無しparser案件）。⚠要実機検証 |
| ~~SET_TRAP／動的閾値フィルタ／遅延条件トリガー／《相手ターン》《自分ターン》AUTO基盤／ビート機構Phase1-7／傀儡場出し汎用化・levelLteLastProcessed~~ | — | — | **✅完了**（詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §11） |
| engine未配線 timing 群の実機配線 | 大（~15 timing・R33-R58） | 高 | **✅C1全配線完了**。残るは実機検証のみ（§7参照）。 |

実装済み機構の履歴：コスト増加・ライフクラッシュ履歴・LOOK_PICK_CHAIN field宛先・リコレクト系統・改造素材機構・引用能力付与型・保護/制限系STUB・アーツコスト軽減句 は `BUGFIXES.md` 参照。

---

## 12. 検証ハーネス（整備済み）

> **検証3層（実機検証を Claude がヘッドレスで代替）**：①表現＝decompile逆翻訳一致／②実行（壊れない）＝`smoke`（全効果・新品盤面）＋`fuzz`（乱択連鎖・進化盤面）／③正しさ＝`golden`（型ごと結果assert）。engine/BattleScreen/decompilerを触ったら **smoke・golden・fuzz** を回帰チェックに回す。⚠どれも engine（executeEffect/resume*）が対象＝**BattleScreen.tsx の配線（フェイズ進行・トリガー収集・effect_stack整列）は対象外**（C2実機 or pure抽出＋goldenが要る）。
> **CI 自動実行**：`.github/workflows/ci.yml` が push/PR(master) で **typecheck・lint・golden・smoke・fuzz** を回す（失敗時に非ゼロ終了でCI失敗）。`npm install` のみで動く（env/supabase不要）。
- **`npm run smoke`（`scripts/smokeTest.ts`）**：全効果10582件を**オートパイロット**でヘッドレス実行し、CRASH/HANG（STEP_CAP=200）/INVARIANT違反を検出。現状＝全0（OK 10314／SKIP 268）。⚠「壊れないか」を保証するもので「ルール的に正しい結果か」は判定しない。
- **`npm run golden`（`scripts/goldenTest.ts`）**：主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」をassert。現状＝PASS 123／FAIL 0（うち一部はStage2のトリガー収集テスト）。
- **`npm run fuzz`（`scripts/selfPlayFuzz.ts`）**：乱択自己対戦ファズ。ランダム初期盤面で効果を連鎖発動し相互作用/進化盤面クラッシュ/ループ/カード爆発を検出。シード固定で完全再現可能（既定200ゲーム×40手）。現状＝全0。重め検証は `npm run fuzz -- --games 2000 --moves 80`。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。
- **`npm run census`（`scripts/vocabCensus.ts`）**＝語彙センサス＝**両方向98計測**（原文修飾句77パターン＋数値/構造/逆方向21計測）×JSON対応語彙の突き合わせで**過剰効果（フィルタ/条件/制限/構造の脱落）と幻覚（原文に無い効果/数値）**を検出（既存網の死角＝盤面が変化するバグ）。高シグナル1872枚ベースライン（続き23消化後）・超過で exit 1・明細 `docs/_vocab_census.txt`。
- **`npm run census:clusters`（`vocabCensus.ts --clusters`・続き23新設）**＝census高シグナルのマッチ節を正規化テンプレ（数値→N・《名前》→《X》・＜クラス＞→＜C＞）にクラスタし、枚数順の文型一覧 `docs/_census_clusters.txt` を出力。**§5c消化バッチの入口**＝カード単位でなくテンプレ単位で作業を組む。
- **`node scripts/heldReview.mjs`（続き23新設）**＝`build:effects` の「温存(要レビュー)」を diff署名（type増減）でグループ化し `docs/_held_review.txt`（原文＋leaf diff付き）に出力→spot-check後 `--adopt ID1,ID2,…` / `--adopt-sig "署名"` で fresh を一括採用。前提＝直前に `npm run build:effects`（fresh を `docs/_held_fresh.json` に保存）。**採用しないもの＝STUB退化・「代わりに」昇格・別STUB id 化**（理由は BUGFIXES 続き23）。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（現在 held 25＝LOSS13/VALUE12）。回帰検出に使う。⚠HEAD比較＝auto-commit 環境では採用コミット後の値で判定する。
- **`npx tsx scripts/archive/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。
- **`docs/_partial_report.txt`（2026-07-07新設・`build:effects` が再生成）**＝parser 無言フォールバック刻印の計器＝「原文の条件/ステップを黙って落とす近似」の理由明細（初回142効果＝IS_MY_TURN化125/multi-dest分割11/リコレクト分割8）。この数字から**増えたら**parser に新たな無言近似が入った兆候（減らすのは §5c の条件語彙拡充）。刻印された fresh は parseStatus:PARTIAL＝heldReview で採用時にレビュアーに見える。

---
**関連**：`DESIGN.md`（設計方針）／`PLAN_DETAIL.md`（消化済み履歴）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
