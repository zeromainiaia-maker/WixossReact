# PLAN — 開発計画（統合版）

> **2026-07-03統合**：以前は「今後の予定」を決める文章が `P1_PLAN.md`／`ROADMAP.md`／`TODO.md` の3つに分かれていて分かりにくかったため、この1本の `PLAN.md` に統合した。旧3ファイルは削除済み（内容はすべてここに移した）。
> **3人は同時に作業せず、順番に push / pull で引き継ぐ（バトン式）**。新セッション（cold start）は **本ファイル §4「現在地とバトン」→ `DESIGN.md`** の順に読む。
> 個別の修正記録は [BUGFIXES.md](./BUGFIXES.md)（新しいものを上に追記）。**原文照合の主軸ツールは [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)**（実行結果の目視照合・LLM不使用・決定論）。補完的発見器は [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（LLM意味比較）。
> **消化済みバッチ・完了項目の詳細履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) に分離（2026-07-07）**＝本ファイルは「現在地・ルール・生きている worklist」だけを保つ。完了項目を増やしたら詳細は PLAN_DETAIL.md へ移し、ここには1行の ✅ サマリだけ残す。
> **2026-07-14 に再圧縮**（199KB→約77KB）＝§3 のタスク本文・§7 の実機PASS記録・§4 の census 計測履歴・§6 の完了機構メモを PLAN_DETAIL.md へ退避し、**§3 は「生きているタスクの表」＋Opusタスク12 の在庫表だけ**にした。**タスクは §3 の表から取り、経緯を知りたいときだけ PLAN_DETAIL を開く。**

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
- [x] **🏁 P1（表現）完了宣言（2026-07-23）**＝語彙センサス高シグナルの逓減限界到達を実測確認（バッチ2〜4の投入前実測枯渇＋生きた parser バッチ全消化）し、残 census 1581 効果を「**§6.3 正式送り 282／粗網のみ偽陽性 116／長テール単発・別節偽陽性 1183**」へ3分類。宣言本文・根拠・以後の運用は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭の宣言節。以後 census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ運用し、主軸は P2/P3（§6.3 機構・§7 実機・BEHAVIOR_AUDIT 継続）へ移行。
- [ ] **🆕 BEHAVIOR_AUDIT の要レビュー・キューを逓減限界まで消化**（2026-07-03 着手・現在の本丸）。指標＝`node scripts/_bqTriage.mjs` の高シグナル件数（811→285→261→169→129→30…と逓減中）。
- ⚠ **「脱落疑いの件数」は完了指標にしない**（メトリクスが粗く内容修正で減らないため。§3参照）。

## 3. 不変の運用ルール（全員必須）

- **`effects_*.json` の curated 値は「上書きされない」ことが保証されている。**`build:effects` は ①`parseStatus` が `MANUAL`/`PARTIAL` を含むカードを**カード単位で温存**（`PRESERVE_STATUSES`）②それ以外も fresh が curated の純粋な上位集合でなければ**温存して held へ送る**（`buildEffectsJson.ts:158-162`）ため、**再生成しても勝手に値が消えることはない**。`heldReview --adopt` で明示採用したものだけが変わる。
  - ⚠**旧記述「`build:effects` は破壊的＝絶対に実行しない」は本節の §5c パイプライン（下記「Sonnet の必須ガードレール①」・§5c の手順④・`heldReview` の前提）と矛盾していたため 2026-07-28 に訂正した。** `heldReview` は「直前に `build:effects` を実行して `docs/_held_fresh.json` を作る」ことが前提なので、禁止すると採用経路そのものが回らない。
  - **正しい規律は「実行禁止」ではなく「実行後に effectId 単位で全数比較して、意図した件数だけが変わったことを確認する」**（`git show <baseline>:public/data/effects_*.json` と突き合わせる使い捨てスクリプトで `added=0 / removed=0 / changed=<意図した件数>`）。出力は minified 1行なのでテキスト diff は役に立たない。
  - **カード単位 PRESERVE で held に載らない効果**（同居効果が MANUAL 等）は `build` では直せないので、`effectId` をアンカーにした**外科パッチ**で JSON を直接訂正する。共有関数（`mergeManualEffects` 等）にカード固有テーブルを埋めるのは禁止。
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
**判断軸＝「コーディング難度」ではなく「意味的退化を見極める検証規律が要るか」**。自動ゲート（smoke/golden/fuzz/同型★0/census baseline・CI）はクラッシュ・構造破壊を必ず捕まえるが、**「全ゲート通過なのに意味が間違っている」退化は素通りする**（PLAN が警告する「無検証置換で約90枚退化の前例」の失敗モード）。この見極めだけがモデル依存。

- **Opus 側＝機構・語彙の新規実装と退化の見極め**：parser/engine への新規語彙・機構（§6.3 大型機構・引用付与の内側 parse）／意味的退化の見極めが要るバッチ（「代わりに」置換・CHOOSE平坦化復元・条件節持ち上げ等＝全数機械分類して偽陽性を先に切る）／リファクタ Stage2-3／BEHAVIOR_AUDIT の真no-op vs シナリオ空振りの最終仕分けと engine 修正。
- **Sonnet 側＝定型消化・データ単点修正**：§5c パイプラインの機械実行（`build:effects`→`heldReview`→ゲート→`regen`→commit）／owner・値・duration の単点修正バッチ（parser/engine 変更なし）／BEHAVIOR_AUDIT キュー再生成と一次トリアージ／§7 実機検証シナリオの横展開。**作業中に見つけた engine/parser バグはその場で直さず Opusタスク12 へ登録する**。
- **Sonnet の必須ガードレール4点**（プロンプトに固定）：①**採用前に必ず `build:effects` を再生成**して fresh vs live-curated を精密 diff＋decompile 対原文照合する（`heldReview` の diff 表示・`census:clusters` の枚数は古くなりうるので鵜呑みにしない）。②**1バッチ＝parser/engine 変更なしに限定**。③採用後に `git show`/機械 diff で「意図した数枚のみ変更」を確認。④**据置系（curated が正・fresh が誤り）は触らない**＝EXILE→TRASH（ゲーム除外の温存）・owner:opponent→undefined 脱落・「このシグニ」→ALL 化・「あなたのトラッシュ」→opponent 化。
- 定型作業は必ずスキル（`/census-batch`・`/audit-card`・`/baton`）の手順に従う。**Opus が機構を1バッチ開く→Sonnet が再収穫＋ゲート＋簿記で消化する交互サイクル**で回す（バトン式・同時作業はしない）。
- **消化済みタスクの詳細・経緯・知見は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3**（続き42-47／56-69／71-92／**2026-07-14 退避のタスク全文＝timing センサス消化の運用知見・Opusタスク12 の在庫明細つき**）。

#### Opus のタスク（2026-07-14 整理・生きているものだけ）
> 規模＝**S**:1セッション内で完結／**M**:1〜2セッション／**L**:複数セッション（項目単位で分割可）。種別＝触る層（＝必要ゲートが決まる：parser/engine→`npm run gates` 必須・decompiler 表現のみ→同型★0＋原文照合・scripts のみ→該当スクリプト実行）。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **下の在庫リスト参照** |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L（低優先） | effect 構造そのものが原文とズレたカードの再parse。逓減テール＝他が尽きたら |
| 14 | リファクタ Stage2→Stage3 純粋バトルコントローラ | BattleScreen構造 | L | ✅Stage2完了＋永続化移行完了（battle_states 全行 I/O 120箇所を `persist` へ移行）＋**reducer 14 action・72/115 commit 経由**（続き244-247＋🆕続き271＝セットアップ3／スペル・カットイン5／WRITE_STATE 4／ADVANCE_TURN_WITH_STATE 1 の計13箇所）。設計/移行レシピ `docs/BATTLE_CONTROLLER.md`。**残＝reducer純粋化の本体（43 commit）**＝(a) 命令的 `update` インクリメンタル構築（`doPhaseAdvance`／`confirmEndDiscard` 等）(b) `result.done` で pending_effect が null/非null に分岐する効果解決本体 (c) `...opUsageUpdate`／`...extraUpdate` の spread 順序依存 (d) CPUターン終了の複数カラム同時更新。⚠ハンドラ側 payload 構築は golden 非カバー＝機械一括変換不可・1件ずつ手動レビュー要（レシピ BATTLE_CONTROLLER.md §4）。**進め方＝「挙動同値と確信できるものだけ N 箇所」に必達を絞って codex へ投げ、Claude が全箇所の diff を手で照合する**のが続き271 で確立した回し方 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | **✅`cost.underSelfTrash` は 2026-07-30 に残0でクローズ**（実測13効果＝簿記の「16効果」は誤り。全部シグニの【起】で、**カットイン除外は無関係なルリグ/キー経路のみ**＝実体は「コストを払わず撃てる過剰実行」だった。既存の兄弟 `underAnySigniTrash` 配線を踏襲し新機構ゼロで着地。詳細 BUGFIXES 2026-07-30 先頭節）。<br>**✅再トリアージは 2026-07-31 に完了（第1波）＝`[A昇格候補]` は使い切った**。`docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に29件を `ファイル:行` 根拠つきで再判定＝**`[A]`1（消化）／`[B維持]`15／`[C]`13**。**`[C]`13件は §6.3 J へ正式送り済み**（機構台帳が定位置）。<br>⚠**この再トリアージで判明した構図＝軸は「グローバルに実在する」のではなく collector ごとに違う**。PLAN が期待した `handOwner`／`minCount`／`fromZones`／`byOwnEffect`／`byOpponentEffect` は **`collectHandAddedTriggers` では5軸すべて honor される**が、**`collectHandDiscardTriggers` は `minCount` しか持たず原因オーナー引数が無い**（`triggerCollect.ts:2438-2449`）。このため「軸が実在するから群で開く」という読みは外れ、実際に開いたのは `WX20-067-E1` 1件だけだった。**次に群を切るときも collector 単位で軸を数えること。**<br>🔴**残＝`[B維持]` 15効果**（collector はあるが引数/軸が足りない＝engine 軽量拡張が要る）。**軸ごとに束ねると複数枚が同時に開く**＝①`ON_TARGETED` の origin 種別軸（`WXDi-D09-H16-E1`／`WXDi-P08-065-E2` の2件。collector は `triggerCollect.ts:334` に実在するが引数が対象群/owner のみ）②`ON_HAND_DISCARDED` の原因オーナー軸（`WXDi-D09-P16-E2`／`WX24-P2-051-E1`／`WXDi-P13-051-E3`）③life 汎用移動（`WD23-023-E-E1`／`WXDi-P07-052-E1`＝§6.3 J-3 と同じ穴を共有）。**①が最も投げやすい**（既存 collector の引数追加のみ・2件同時）。<br>⚠**計器の偽陽性2件**（2026-07-31 実測）＝`npm run census:timing` の31件のうち `WXDi-P09-079-E1`／`WXK10-052-E1` は **live では既に正しい `ON_CARD_MILLED_FROM_DECK` を持つ**（2026-07-27 に消化済み）。外科パッチが `clearTimingFallback` を呼んでいないため計器に残っているだけ＝**実質残は29効果**。この2件に `clearTimingFallback` を足せば較正できる（**機能実装ではなく計器の較正**なので、やるなら簿記にそう明記すること）。<br>**未再検証は残り1件**＝`SPDi43-11-sub-E1`（複数効果を跨ぐ累積カウンタ＝真の `[C]` 相当）。<br>🆕**残穴＝`ON_TRASH under_signi` の3効果がコスト起因で発火しない**（`WX18-062-E1`／`WX22-027-E1`／`WXK03-033-E1`。原文はいずれも「このカードが**コストか**効果によってシグニの下からトラッシュに置かれたとき」＝コストを明示的に含む）。`payUnderSelfTrash` は state を直接書き、`executeSigniActivated` がコスト支払いとスタック初期化を**1コミットにまとめる**ため、中央 diff の `detectUnderSigniTrashed`（before スナップショット＝`bs.host_state`）が移動を見ない。**退化ではない**（配線前はカードが動かず発火機会自体が無かった）＝新規に露出した未到達経路。直すならコスト支払いを独立コミットに分けるか支払い時に明示的にトリガーを積むかの設計判断が要る。<br>🆕**同族の未配線1枚＝`WXDi-P06-034`**「このシグニの下からカード１枚**と**あなたのエナゾーンからカード１枚をトラッシュに置く」＝複合コストで regex に当たらず `underSelfTrash` が付かない（従来から不変）。<br>⚠**計器に盲点あり**＝2026-07-28 の誤分類36件を `census:timing` は33件しか報告しなかった。消化済みの経緯（36件停止／続き272・273・277・278 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節・BUGFIXES 2026-07-28節。ゲートではない（exit 0） |

> **✅消化済のタスク（1〜9・11・17〜19）は 2026-07-29 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節。生きているのは上表の **12〜16** のみ。

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。**下表は残作業のある在庫のみ**。消化済み在庫〔(i)〜(lvi) の大半〕の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19・2026-07-24・2026-07-28・**2026-07-29**の各退避節〕。直近クローズ＝**(xliv) `BANISH_REDIRECT` 残テール**と **(xlii) `GRANT_LEAVE_PLACE_PENDING` 残2枚**は 2026-07-29 に残0で完全クローズ〔詳細 BUGFIXES 2026-07-29節〕）：

| ID | 内容 |
|---|---|
| (lv) | **残＝未配線2経路**（原票 `WXEX2-71-E2` と共通機構、人間グロウ／COLLAB／アシスト配置は✅2026-07-29 に消化）＝**③CPU シグニ召喚 ④CPU グロウ**。いずれも「CPU は任意効果を発動しない」を明示据え置き中。**着手するなら「CPU に任意効果をどう選ばせるか」の方針決めが先**（黙って無条件発動にするのは COLLAB と同じ過剰実行になる）。詳細 BUGFIXES 2026-07-29 (lv) 節 |
| (lxi) | **✅第1波（「対戦相手**が**」形・29カード30効果）／第2波（「対戦相手**は**」＝主語分配形・8カード9効果）／第3波（分割再パースを基準読み供給へ切替・8効果）／🆕第4波（tail-splice・1効果＋triage 訂正1件）とも消化済み。残7効果はいずれも別機構待ちの honest defer**。⚠**教訓①（第2波）＝「ゲートが無い」と決めつけず現状 JSON と engine ハンドラの実装まで読むこと**。⚠**教訓②（第3波）＝据置理由が複数あっても原因は1つのことがある**（①複文／⑤owner 反転／③そのシグニ照応 の3グループは全部「クローズを外した文を再パースする」設計が原因で、**基準読みを then の供給源にする**だけで同時に開いた）。⚠**教訓③（第4波）＝自分の簿記も疑う**（`WXDi-P13-075-E1` を「前置きにアクションがある」へ入れていたが、実際は専用 STUB `UPKEEP_OR_NO_UP` が回避条件ごと engine＋UI に実装済み＝**既に正しい**。包むと相手に CHOOSE が2回出る）。**🆕第5波（2026-07-31・codex実装/Claude検証）＝`WXK06-047-E1` を消化（残7→6）**＝回避手段「自分のシグニをデッキの一番上に置く」を `OPPONENT_PAY_OPTIONAL` の兄弟語彙 `opponentSigniToDeckTop` として1本追加（engine 新機構0）。**回避クローズと帰結が混線して「相手シグニを無条件でデッキ下送り」だった二重の誤り**を是正。golden 1145→1147・live per-effect changed 1。詳細 BUGFIXES 2026-07-31 第5波節。**🆕第6波（2026-07-31・codex実装/Claude検証）＝`WXDi-P06-023-E2` を消化（残6→5）**＝「このターン終了時、」前置きを**遅延トリガーの設置**として解き、標準ペアを `INSTALL_DELAYED_TRIGGER{ON_TURN_END}` の**内側**に入れる（ゲートを設置の外に出さない）。engine は遅延トリガーに `sourceCardNum` を焼き込み3収集経路で復元＋`RETURN_SELF_ARTS_TO_LRIG_DECK` をアシストルリグゾーンへ拡張。golden 1147→1150・census 1367→1366。⚠**教訓④＝「片肺だから採用しない」の前に、その片肺が本バッチ由来か既存の系統穴かを数えること**（codex は完成した実装をゲート全緑のまま撤回して停止した。実測すると CPU の `ON_TURN_END` 未収集は**既存188効果/183カードに共通**＝採用が厳密に優位だった）。⚠**教訓⑤＝発生源の復元は「その値を読む側」を全部洗う**（`sourceCardNum` を読む分岐は0件でも、`entry.cardNum` の**カード種別**を読むアーツ使用ゲートが二重発火した＝Claude が是正）。詳細 BUGFIXES 2026-07-31 第6波節。**残5の内訳**＝①回避コストが engine 非対応2（`WXK05-009-E2`〔アタック回数比例の可変《無》〕／`WXK06-067-E1`〔エナ＋手札の**合計N枚**という混成コスト〕）②遅延トリガーの設置が前置き1（`WX24-P4-011-E3`＝「このターン、あなたのシグニがバトルによってシグニをバニッシュしたとき」の**収集経路が engine に無い**＝現状 `SEQUENCE[RECOLLECT_GATE, LIFE_CRASH]` の無条件即時クラッシュ）③3機構一体1（`WX24-P4-007-E1`＝`DO_THREE_THINGS` は別カード用 text パターンで完全 no-op）④制限系で別機構1（`WXDi-P11-009-E3`）。**engine の回避手段語彙**＝`costColors`／`opponentHandDiscard`(+`ALL`)／`opponentHandDiscardFilter`／`opponentEnergyTrash`(+`ALL`)／`opponentSigniTrash`／`opponentSigniToDeckTop`。詳細 BUGFIXES 2026-07-31 (lxi) 第3〜6波の各節 |
| (lxvii) | **🆕 CPU ターン終了時に `ON_TURN_END` トリガーを一切収集しない（2026-07-31・第6波の検証で発見）**＝`collectTurnTriggers('ON_TURN_END', …)` の呼び出しは `BattleScreen.tsx:3132`（人間/PvP のターン終了）**1箇所だけ**で、CPU 終了経路（同 9426 付近）は収集せずに `delayed_triggers: undefined` で直接クリアする。**影響＝live JSON の `ON_TURN_END` 効果 188件／183カード**（＋本波で載せた遅延帰還）が **CPU のターンでは全て不発**。同種の既知欠落は `types/effects.ts:46`（`ON_LRIG_ATTACK_STEP_START`＝人間ターンのみ）にも明記済み＝**フェイズ/ターン境界トリガーの CPU 側配線が面で欠けている**可能性が高いので、着手するならまず**全 timing について「人間経路と CPU 経路のどちらから収集されるか」の対応表を作る**こと（1 timing ずつ潰すと同じ穴を何度も踏む）。⚠BattleScreen は golden から叩けない＝**計器に一切映らない**（smoke も census も緑のまま） |
| (lxvi) | **🆕 タスク12(lxv) の据置2枚（2026-07-31）**＝いずれも本バッチと無関係の既存ドリフトが同居していて、採用すると別の損失が出るため honest defer。①`WX24-P3-057-E1`＝「あなたか対戦相手のデッキの上からカードを３枚トラッシュに置く」の **`CHOOSE`（自分/相手の選択）を fresh が持っていない**（curated のみが持つ）②`WX26-CP1-101-E1`＝条件節に居た ＜プリオケ＞ が `GRANT_KEYWORD` の対象フィルタから落ちる（条件節を切り出す構造上の副作用＝**ゲートは得るがフィルタを失う両損**）。詳細 BUGFIXES 2026-07-31 (lxv) 節 |

> **✅残0でクローズした在庫の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理」節へ退避**＝**(xxix)**〔任意【出】コスト・計15波・残4は明示保留〕／**(xlvi)**〔look-pick 計73効果・第1〜17波〕／**(lvii)**〔census キー表 `pickUpTo` 較正〕／**(lviii)**〔トラップ公開 LPC 移行9効果・残1は honest defer〕／**(lix)**〔`split_top_bottom` 全4効果〕／**(l)**〔置換イベント横取り3文型を含む A群/B群 全体・残0〕／**🆕(lx)**〔①`WX25-P1-056-E1` の非バニッシュ離場→バニッシュ置換を engine 9サイトへ配線／②`WX12-020-E3` の「この方法で捨てた枚数」比例＝新語彙 `deltaPerLastProcessedCount`。2026-07-31 に残0クローズ・詳細 BUGFIXES 2026-07-31 節〕／**🆕(lxii)**〔`CONDITIONAL_DISCARD` を型ごと退役し `WD16-016-BURST` を多段閾値の昇格置換へ。2026-07-31 に残0クローズ〕／**🆕(lxiii)**〔「対戦相手の〈ゾーン〉があなたより多い場合」＝両者比較ゲートの脱落4枚＋「中央のシグニゾーン」限定の脱落4枚。2026-07-31 に残0クローズ・残は (lxiv) へ〕／**🆕(lxiv)**〔対象宣言のフィルタが「そうした場合」の本体まで届かない61枚＋「手札がN枚になるように捨てる」。2026-07-31 に残0クローズ・積み残しは (lxv) で解消〕／**🆕(lxv)**〔条件つき任意コストの**条件節だけが黙って消える**51効果＝parser ガードD の退役（engine はタスク12(xi) で包み形の解体を既に持っており**ガードだけが stale** だった＝新機構0・engine 無改修）＋「あなたのエナゾーンに＜X＞の〈シグニ|カード〉がN枚以上ある場合」の一般化。36枚採用・据置2枚は honest defer。2026-07-31 に残0クローズ・詳細 BUGFIXES 2026-07-31 (lxv) 節〕。それ以前の消化済み在庫〔(i)〜(lvi) の大半〕は同ファイルの 2026-07-19・07-24・07-28・07-29 の各退避節。

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 76件まで消化済（(a)(b)(c)＋oppDrawOwnEffectOnly＋続き173/174＋`resonaMainWx08021`〔続き263・レゾナ召喚UI MAIN〕）。**残作業は §7「残る実機検証項目」が単一の worklist**＝ここには重複を書かない（2026-07-30 に §4 進捗サマリと二分していたのを §7 へ集約）。**最優先＝🆕 タスク12(lxi) 本消化が持ち込んだ相手側3択CHOOSE の未検証UI 5件**（エナ不足／手札不足で選択不可・併記型・LB経路での owner・入れ子 SEQUENCE の continuation）＝**30効果に一斉に載ったので影響範囲が最大**。次いで §6.3 H／I′ の5件（ガード追加《無》N枚徴収／`WDK14-013-E1` 候補ピッカー／メルト・ファクトの支払い前ウィルス除去／夢限 -Q- 反転／未知の邂逅の無料グロウ）。経緯は PLAN_DETAIL §3 |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77/105/139/140/142）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（休眠）** | 計器実行＋分析 | S | 続き133 で高シグナル22件精査＝真no-opバグ0件。残る母数は監査ツールの構造的盲点（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存）に該当＝再開なら盲点フィルタ実装が先（低収量見込み） |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**。次の在庫が発生するまで待機（Opus 新語彙着地待ち）。⚠P1宣言により新規バッチは切らない |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は全数監査完了**（findings→Opusタスク12 (xxvii)(xxviii)(xxix)）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

（消化済み在庫＝未採用在庫 第2弾40枚〔続き208〕・未採用在庫37効果〔続き201〕・補欠(a)(b) はいずれも✅続き214/172/170 で全消化。詳細 BUGFIXES 各続き）

**依存の要点（交互サイクルの回し方）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・4・8 → Opus12**（Sonnet が観測して積む → Opus が修正する）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式・同時作業はしない）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-31・続き297・Opus 5〔Claude 検証〕＋codex-work〔実装〕）＝タスク16（timing センサス）を「少しずつ投げる」分担で開始＝第1波で台帳を再トリアージし `[A昇格候補]` を使い切った**（golden **1150→1151**・census **1366 据置**（`BASELINE_HIGH=1366`）・smoke **10679** 全0・SKIP0・fuzz 全0（seed 12648430）・lint 0 errors/**230 warnings 据置**・manual field loss 0。ゲート全緑／live per-effect 差分 **changed 1 / added 0 / removed 0**／`census:timing` **32→31**（実質29＝下記④））
  - **① 台帳 `[B]` 群29件を機械再検証**（`docs/_timing_census_triage.txt` に `ファイル:行` 根拠つきで追記）＝**`[A昇格候補]` 1／`[B維持]` 15／`[C]` 13**。**`[C]` 13件は §6.3 J へ正式送りしタスク16 から外した**（J-1 他能力の発動監視2／J-2 付与・離脱4／J-3 life 汎用移動2／J-4 フェイズ・アタック終了2／J-5 単発3）。
  - 🔴**教訓＝軸は「グローバルに実在する」のではなく collector ごとに違う**。PLAN は「`handOwner`／`minCount`／`fromZones`／`byOwnEffect`／`byOpponentEffect` が実在するのだから群で開く」と見ていたが、**5軸すべてを honor するのは `collectHandAddedTriggers` だけ**（`triggerCollect.ts:1867-1925`）。**`collectHandDiscardTriggers` は `minCount` のみで原因オーナー引数が無い**（同 2438-2449＝`discarderId` は「誰が捨てたか」で「誰の効果が原因か」ではない）＝**実際に開いたのは1件だけ**だった。次に群を切るときも collector 単位で軸を数える。
  - **② `WX20-067-E1` は timing だけでなく効果1枚を丸ごと忠実化**。**`timing:[]` は「未実装」ではなく「暴発を止めている状態」**で、実測すると timing 以外に4つズレていた（①`DOWN` の対象が `owner:'opponent'`＝原文は自身をコストでダウン ②《白》コストが丸ごと欠落 ③原文に無い `CONDITIONAL{IS_MY_TURN}` ④「アタックフェイズの間」ゲート欠落）。**timing だけ戻すと「手札が増えるたびにコスト無しで相手シグニをダウン＋バウンス」への退化**になるため、投入前にこの実測を指示書へ罠として先出しした。着地＝`ON_HAND_ADDED`＋`handOwner:'any'`（型に第3値を追加・**engine は2分岐でしか skip しないので無改修**）＋`minCount:1`＋`DURING_PHASE`4フェイズ＋`OPTIONAL_COST{costColors:['白'], down_self:true}`＋pay 時のみ `BOUNCE`。**「アップ状態の」限定は既存機構でそのまま成立**（`canAffordOptionalCostSpec` が `signi_down` を見る＝`execUtils.ts:274-278`）。
  - **③ Claude 検証で確認した4点**＝`down_self` が3段（`resolveOptionalCostSpec`→`canAfford`→`paySteps`）で実際に読まれること／`DURING_PHASE` が実戦の `mkTrigCtx()`（`BattleScreen.tsx:2329`）経由で届くこと／golden の発生源が実戦と同じシグニゾーンにあり `cursor` を try/finally で復元していること／**11000効果中 changed 1** の全数照合。
  - **④ ⚠計器の偽陽性2件（未修正）**＝`census:timing` の31件のうち **`WXDi-P09-079-E1`／`WXK10-052-E1` は live で既に正しい timing を持つ**（2026-07-27 消化済み）。外科パッチが `clearTimingFallback()` を呼んでいないため残っているだけ＝**実質残29**。較正は**機能実装ではなく計器の較正**として明記すること。
  - **次の一手**＝**Opus：①🆕 タスク16 第2波＝`ON_TARGETED` の origin 種別軸**（`WXDi-D09-H16-E1`／`WXDi-P08-065-E2` の2件が同時に開く。collector は `triggerCollect.ts:334` に実在し引数追加のみ＝`[B維持]` 15件の中で最も投げやすい）**②`ON_HAND_DISCARDED` の原因オーナー軸**（`WXDi-D09-P16-E2`／`WX24-P2-051-E1`／`WXDi-P13-051-E3` の3件。collector のシグネチャ変更が要る）**③(lxvii) CPU ターン終了時の `ON_TURN_END` 未収集**（188効果/183カードが CPU ターンで全不発。まず**全 timing の「人間経路／CPU経路」対応表**を作る。⚠**§6.3 J-4 と同じ穴**なので一体で見る）**④「コストの合計」族の STUB/UNKNOWN 14件⑤`ON_TRASH under_signi` の3効果⑥§6.4 の配置数制限すり抜け7効果⑦§6.3 I＝`WX25-P3-028-E2`⑧(lxvi) の据置2枚**／(lxi) 残5・(xxix) 残4・(lv) 残2経路。**Sonnet：§7 実機検証＝在庫はここだけ**（単一 worklist は §7「残る実機検証項目」）。

### 📊 恒久指標（維持中・逐次更新）

- **🆕 2026-07-31 J-3 差し戻し修正後 最新値（本行を直近の正とする）**：census **1366→1365**（`BASELINE_HIGH=1365`、ハイティのクラッシュ枝を実働化した機能改善）、golden **1151→1158**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**232 warnings**、manual field loss 0。live per-effect 差分 **changed 4 / added 0 / removed 0**（J-3対象4効果のみ）。`ON_LIFE_CRASHED` **11→12**（追加は `WXDi-P07-052-E1` だけ）。
- **2026-07-31 タスク16 第1波後の値（履歴）**：census **1366 据置**（`BASELINE_HIGH=1366`）、golden **1150→1151**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、held **250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX20-067-E1`）。**`npm run census:timing` 32→31 効果/31クラスタ**（⚠**実質29**＝`WXDi-P09-079-E1`／`WXK10-052-E1` は live で既に正しい timing を持つ偽陽性）。**新語彙0本／型の値追加1**＝`triggerCondition.handOwner` に `'any'`（engine 無改修＝既存2分岐が素通りさせる形）。`_vocab_census` の「IS_MY_TURN誤変換疑い」**1115→1114**。
- **2026-07-31 タスク12(lxi) 第5波・第6波後の値（履歴）**：census **1367→1366**（`BASELINE_HIGH=1366`）、golden **1145→1150**（第5波 +2／第6波 +3）、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分は**各波とも changed 1 / added 0 / removed 0**（`WXK06-047-E1`／`WXDi-P06-023-E2`）、`build:effects`・`regen` とも冪等。**新語彙2本**＝`StubAction.opponentSigniToDeckTop`（第5波）／`InstallDelayedTriggerAction.sourceCardNum`（第6波）。engine 拡張＝`RETURN_SELF_ARTS_TO_LRIG_DECK` のアシストルリグゾーン対応・遅延トリガー3収集経路の発生源復元・`ON_ARTS_USE` 二重発火の抑止（`BattleScreen.tsx:4291`）。
- **2026-07-31 タスク12(lxi) 第4波後の値（履歴）**：census **1367 据置**（`BASELINE_HIGH=1367`）、golden **1142→1145**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX24-P2-022-E1`）、`build:effects` 冪等。**新語彙0本**＝既存の `OPPONENT_PAY_OPTIONAL`＋`CONDITIONAL(IS_MY_TURN)` ペアを置く位置を変えただけ（engine 無改修）。
- **2026-07-31 タスク12(lxi) 第3波後の値（履歴）**：census **1369→1367**（`BASELINE_HIGH=1367`）、golden **1137→1142**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **251→250枚／署名グループ 97 据置**、manual field loss 0。live per-effect 差分 **changed 8 / added 0 / removed 0**（held 7枚採用＋MANUAL 同居カード1効果を直接配線）、`build:effects` 冪等。**新語彙2本**＝`TrashAction.targetsTriggerSource`／`StubAction.opponentSigniTrash`。
- **2026-07-31 タスク12(lxv) 残0クローズ後の値（履歴）**：census **1370→1369**（`BASELINE_HIGH=1369`）、golden **1134→1137**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **277→251枚／署名グループ 109→97**、manual field loss 0。live per-effect 差分 **changed 40 / added 0 / removed 0**（36枚採用）、`build:effects` 冪等。**新語彙0本／退役2つ**＝parser ガードD（`tryWrapLeadingStateCond` の OPTIONAL_COST 系 skip）と `applyBoardZoneStateBatch3` のエナ枚数ハードコード2枚。engine 無改修。
- **2026-07-31 タスク12(lxiv) 残0クローズ後の値（履歴）**：census **1373→1370**（`BASELINE_HIGH=1370`）、golden **1132→1134**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288→277枚／署名グループ 104→109**、manual field loss 0。live per-effect 差分 **changed 63 / added 0 / removed 0**（61枚採用＋純改善2）、`build:effects` 冪等。**新語彙1本**＝`TrashAction.untilHandCount`（＋engine の `UP/DOWN/FREEZE` に `targetsStored` を配線）。
- **2026-07-31 タスク12(lxiii) 残0クローズ後の値（履歴）**：census **1373 据置**（`BASELINE_HIGH=1373`）、golden **1131→1132**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚 据置／署名グループ 106→104**、manual field loss 0。live per-effect 差分 **changed 7 / added 0 / removed 0**（`WX15-033`／`WX17-040`／`WX18-032`／`WX20-025`／`WXDi-P02-065`／`WX24-P2-091`／`WXK11-031`）、`build:effects` 冪等。**新語彙2本**＝`HAND_COMPARE_OPP`／`ENERGY_COMPARE_OPP`。
- **2026-07-31 タスク12(lxii) 残0クローズ後の値（履歴）**：census **1373 据置**（`BASELINE_HIGH=1373`）、golden **1130→1131**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WD16-016-BURST`）、`build:effects` 冪等。**新語彙0本／退役1型＋1 STUB id**（`ConditionalDiscardAction`／`STUB{CONDITIONAL_DISCARD}`。STUBS.md 使用中 577→576 種・実装 548→547）。
- **2026-07-31 タスク12(lx) 残0クローズ後の値（履歴）**：census **1373 据置**（`BASELINE_HIGH=1373`）、golden **1128→1130**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚/106署名 据置**（(lx)② で1枚 held に落ち同じ回で採用）、manual field loss 0。live per-effect 差分 **changed 1 / added 0 / removed 0**（`WX12-020-E3`）、`build:effects` 冪等。**新語彙は2本**＝`PowerModifyAction.deltaPerLastProcessedCount`（倍率元＝直前ステップの処理枚数）と engine 内部の `applyEffectLeaveReplaceBanishSubstitute`（JSON 語彙は増えない＝既存 STUB id を宣言として読む）。
- **2026-07-30 タスク12(lxi) 第2波後の値（履歴）**：census **1375→1373**（`BASELINE_HIGH=1373`）、golden **1120→1128**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288枚/106署名 据置**（採用6枚と新規落ち6枚が相殺）、manual field loss 0。live per-effect 差分 **changed 9 / added 0 / removed 0**（held 採用6カード＋カード単位 PRESERVE のため curated 直配線2効果）、`build:effects` 冪等。**新語彙は engine の水平展開3つのみ**＝`StubAction.opponentEnergyTrash`／`opponentHandDiscardFilter`／`opponentHandDiscard` の `ALL` 拡張（いずれも既存 `opponentHandDiscard` と同形）。
- **2026-07-30 タスク12(lxi) 本消化後の値（履歴）**：census **1384→1375**（`BASELINE_HIGH=1375`）、golden **1113→1120**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430・効果実行 7999手／distinct 2702種）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **290→288枚/107→106署名**（前回 +2 だった `WX24-P1-071`／`WX25-P1-005` は本バッチで採用され held から抜けた）、manual field loss 0。live per-effect 差分 **changed 30 / added 0 / removed 0**（parser 経由27＋MANUAL 直配線3）、`build:effects` 冪等。**新語彙は0本**＝既存 `STUB{OPPONENT_PAY_OPTIONAL}`＋`CONDITIONAL(IS_MY_TURN)` の look-ahead ペアを parser 側で一般化しただけ。
- **2026-07-30 エクシード本体6件（次の一手①）5件消化後の値（履歴）**：census **1386→1384**（`BASELINE_HIGH=1384`）、golden **1109→1113**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**230 warnings 据置**、同型★0（5986枚・265群）、held **288→290枚/106→107署名**（+2＝`WX24-P1-071`／`WX25-P1-005`。**本バッチの群B規則で fresh が `OPPONENT_PAY_OPTIONAL` を獲得したのが原因**＝codex の「未再生成ドリフト」という説明は誤りで、Claude が `_held_fresh.json` 実測で訂正。live 挙動は不変＝未採用のまま次バッチの採用候補）、manual field loss 0。live per-effect 差分 **changed 8 / removed 0 / added 1**（added は入れ子 `WX24-P4-011-E2-next-attack`）。新語彙は `TransferToHandAction.transferGroups`・`EffectTarget.addLastProcessedCount`（`DrawAction` 既存名の水平展開）・`CardEffect.consumeOnTrigger` の3本のみ。⚠census 1384 には **`untilHandCount`／`transferGroups` を計器が語彙として認識する較正**が含まれる（新語彙を数えないと偽陽性になるため）。
- **2026-07-30 §6.3 H 節クローズ後の値（履歴）**：census **1386 据置**（`BASELINE_HIGH=1386`）、golden **1101→1109**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430・効果実行 7982手／distinct 2680種）、lint 0 errors/**230 warnings**（H3/H4 の新規ヘルパー2本ぶん +2）、同型★0（5986枚・265群）、held **286→288枚/106署名 据置**（+2＝`WXDi-P05-005`／`WXDi-P11-010B`。**今回の変更に由来しない未再生成ドリフトが顕在化しただけ**＝BUGFIXES H4 節⑧）、manual field loss 0。新語彙＝timing `ON_LRIG_FLIP`（B面反転）・条件 `CENTER_LRIG_NOT_GROWN_THIS_TURN`・STUB `MUGEN_Q_RESET_AND_FLIP`・state `opp_guard_extra_colorless_this_turn`／`signi_deploy_count_limit_next_turn`／`pending_spell.pre_use_virus_removed`・`ChooseAction.preUseVirusChoose`。**`GUARD_EXTRA_COST_BY_OPP`／`OPP_GUARD_COST_COLORLESS` は boolean → `count`（省略時1）へ意味拡張**（既存6 CONTINUOUS は非回帰）。
- **2026-07-30 タスク16 `cost.underSelfTrash` 配線後の値（履歴）**：census **1386 据置**（`BASELINE_HIGH=1386`）、golden **1096→1101**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**228 warnings**、同型★0（5986枚・265群）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 13 / added 0 / removed 0**（13件とも `cost` フィールドのみ変化）、`build:effects` 冪等。新語彙は `SelectionConstraint.same`（「同名の」全一致制約）の1本のみ＝**`EffectCost.underSelfTrash` は `number` → `{count, filter?, selectionConstraint?}` へ型変更**（読み手は parser／BattleScreen 4経路／decompiler／golden の全件を追随済み）。
- **2026-07-30 タスク12(l) 残0クローズ後の値（履歴）**：census **1386**（`BASELINE_HIGH=1386`・別置）、golden **1090→1096**、smoke **10679/10679** 全0・SKIP0、fuzz 全0（seed 12648430）、lint 0 errors/**228 warnings**、同型★0（5986枚・265群）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分は第1波 **changed 3 / added 0 / removed 0**（`WX24-P4-026-E1`・`SPDi44-08-E2`・`WX25-P1-018-E2`）、第2波 **changed 3 / added 0 / removed 0**（`WX16-004-E1` 本体＋`WX15-002-E2`・`WXEX2-15-E2` の `holograph` マーカーのみ）、`build:effects` 冪等。新語彙は `CardEffect.holograph`（データ側ホログラフ判定）・`LookAndReorderAction.revealTopAfterReorder`・`StubAction.leaveVictimFilter`・`GrantLrigAbilityAction.duration` の4本。
- **2026-07-30 「コストの合計」束縛14効果 の値（履歴）**：census **1391→1386**（`BASELINE_HIGH=1386`）、golden **1085→1090**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 14 / added 0 / removed 0**、`build:effects` 冪等。新語彙は `costThresholdFromPaidCount`（動的上限）と `energyTrash.atLeast` の2本のみ＝**いずれも当該2効果だけに付与**（全数走査で確認）。
- **2026-07-30 タスク12(l) A群／手札枚数比例の値（履歴）**：`POWER_MOD_BY_HAND_COUNT`→`POWER_MODIFY_PER_HAND_COUNT` の構造化5効果＋SONG付与展開1＋`WDK04-006-E1-G` の中身＋任意コスト付与2の計**9効果／8カード**。census **1393→1391**（`BASELINE_HIGH=1391`）、golden **1079→1085**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **286枚/106署名 据置**、manual field loss 0。live per-effect 差分 **changed 9 / added 0 / removed 0（影響カード8）**、`build:effects` 2回目差分0。⚠**効果総数は 10679 据置**（今回の入れ子化は SONG の1本のみで、その分は census の効果単位側に現れる）。
- **2026-07-30 タスク12(l) B群の値（履歴）**：キーの「センタールリグは以下の能力を得る。」＋後続ブロックを `GRANT_LRIG_ABILITY.abilities` へ入れ子化（**36枚・47効果**）。census **1394→1393**（`BASELINE_HIGH=1393`）、golden **1075→1079**、smoke **10679/10679** 全0、fuzz 全0、lint 0 errors/**228 warnings**、同型★0（5986枚）、held **292→286枚/106署名**、manual field loss 0。live per-effect 差分 **changed 41 / added 1 / removed 48（影響カード36のみ）**、`build:effects` 2回目差分0。⚠**効果総数が 10722→10679 に減る**のは47効果がトップレベルから入れ子へ移ったため（smoke/census の母数もこの値）。⚠census には**構造マーカー判定を「付与 abilities も再帰で数える」へ較正**した分が含まれる（HEAD の live JSON では 1394 据置＝較正単体の影響0）。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 288枚／署名グループ 106件（2026-07-30 タスク12(lxi) 本消化後に実測。**内訳＝lxi 規則で新たに 24枚 held に落ちたが、その24枚と既存2枚〔`WX24-P1-071`／`WX25-P1-005`〕を同じ回で全採用したので、正味は前回 290枚から −2**。旧 290枚/107件＝§6.3 H 節クローズ後。旧 286枚＝タスク12(l) 後。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1373【効果単位】**（2026-07-30 タスク12(lxi) 第2波＝主語分配形の回避クローズ 9効果）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden **1145**・smoke **10679** 全0（SKIP も 0）・fuzz 全0・同型★0・census **1367**（回帰ゲート）・held **250枚/97署名**（2026-07-31 タスク12(lxi) 第4波後に実測）。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（上記の機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫（**現存は (lv) 残2経路だけ**（(lxi) は第1・第2波とも消化済みで残17は別機構待ち）。**(l) は A群/B群とも 2026-07-30 に残0クローズ、🆕(lx)／(lxii)／(lxiii)／(lxiv)／(lxv) も 2026-07-31 に残0クローズ**、**(xxix) も完全クローズ**＝残4件は明示保留、**(xlvi)／(xlii)／(lix)／(lviii) も残0**）＋**タスク16 残＝`[B維持]` 15効果のみ**（`cost.underSelfTrash` は 2026-07-30 に残0クローズ。**✅再トリアージは 2026-07-31 第1波で完了＝`[A昇格候補]` は使い切り、`[C]` 13件は §6.3 J へ送出済み**。残は collector の引数/軸不足＝engine 軽量拡張が要る群で、**軸ごとに束ねると複数枚が同時に開く**＝§3 タスク16 の行を読む）**（(i)〜(xl) の大半は消化済み＝1行✅サマリ参照。(vii)(viii)(xxii)(xxix)(xxxix)(xliii) は完全クローズ）。**Sonnet の主力は タスク1（§7 実機検証）＝在庫はここだけで、Opus が機構バッチを回すたびに積み上がっている**（未検証UIの単一 worklist は **§7「残る実機検証項目」に集約済み**＝§4 進捗サマリと二重に持たない）。⚠**§6.3 H の4機構は engine/golden では固定したが UI 経路は計器に一切映っていない**＝ここが最優先。タスク8 clean群（3,574枚）は任意。タスク4（キュー）は枯渇したので取らない（理由は §3 Sonnet 表）。
> 2. **手順はスキルに従う**＝`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。⚠`/census-batch` は P1宣言により**新規バッチを切らない**（census 外の計器から新系統が見つかった場合のみ）。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🏁 P1完了宣言済み（2026-07-23）＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭の宣言節が正**。census 高シグナル 1581 を「**§6.3 正式送り 282／粗網のみ偽陽性 116／長テール単発・別節偽陽性 1183**」へ3分類（機械分類の実IDは `docs/_p1_classification.txt`）。根拠＝最短ルートのバッチ1〜5＋再クラスタリング生存バッチ（11「相手が選ぶ」43・6「数量比例」27）を全消化・バッチ2〜4は投入前実測で枯渇（別節表現済みの census 偽陽性主体）＝「1 parser規則→N効果」の系統クラスタが出尽くした＝逓減限界。**以後この節の worklist から新規バッチは切らない**＝census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、残バグは BEHAVIOR_AUDIT／semantic audit／PARTIAL 計器／§7 実機で単発発見→直修正する。§6.3 送り282効果の消化先は §6.3 台帳（P2/P3）。

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [x] **未実装action型 worklist**（§6.1）＝**✅残型0（続き204/204b でクローズ）**。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

> **🏁 2026-07-23 P1完了宣言により worklist 凍結**＝下記「残りの消化対象」は宣言時点の歴史記録（3分類は [ROADMAP](./P1_COMPLETION_ROADMAP.md) 冒頭）。census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、**新規の文型バッチはここからは切らない**（census 外の計器から新系統が見つかった場合のみ検討）。「残死角」4項は引き続き有効＝BEHAVIOR_AUDIT／PARTIAL 計器の領分。

**目標＝`npm run census` の高シグナル欠落（現ベースライン＝§4 恒久指標参照・2026-07-22 時点 **1817 効果**）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c。⚠各件数は記載時点のスナップショット＝最新件数は `docs/_vocab_census.txt`／[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) のバッチ表を正とする）**＝(1) ~~**「代わりに」残テール**~~（🏁**全クローズ**：C✅続き259・D✅続き258・E✅続き260）・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
- **進め方＝`/census-batch` スキルに定型化済み**（`.claude/skills/census-batch/SKILL.md`＝続き23確立のパイプライン＋必須ガードレール込み。原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）。概要＝①`census:clusters` でテンプレ選定→②既存DSL型で表現できるか確認（不可＝機構待ちとして §6.3 へ）→③parser 規則追加（**JSON手パッチではなく parser を source of truth に**）→④`build:effects`→⑤`heldReview` spot-check→`--adopt`（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**）→⑥golden 1件/テンプレ＋全ゲート＋BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き18更新＝続き17記載の (a)トリガー種別 (b)小さい数 (c)出現条件 (d)そうした場合誤変換 はすべて98計測に組み込み済み）**＝文字列突き合わせで原理的に見えない残り4つ：(a) **参照解決の誤り**（「それ」の指し先取り違え＝WX09-015 の bounce 対象 self 化。両側に語彙が揃うため不可視）。(b) **効果単位の粒度**（同カード別効果に語彙があれば合格＝カード単位判定のマスキング。消化が進んだら効果単位化）。(c) **JSONは正しいが engine 実装が違う**（behavior-audit／golden の領分）。(d) **文間の実行順序・依存関係**。~~横断的再発防止案＝parser の無言フォールバックに parseStatus:PARTIAL 刻印を義務付ける~~ **✅実装済（2026-07-07・続き38）**＝IS_MY_TURN化（条件抽出失敗の常時true化）・UNKNOWNステップ無言除去（リコレクト/multi-dest分割）で `markSilentFallback()` → fresh の parseStatus を PARTIAL 降格＋`docs/_partial_report.txt` に理由明細（**初回計測142効果＝IS_MY_TURN化125/multi-dest11/リコレクト8・逓減計器**）。parseStatusのみの差分は buildEffectsJson/parserWorklist とも比較から除外（held を汚さない・137枚吸収）。新たな無言近似を parser に足すときは **markSilentFallback を必ず呼ぶ**（「そうした場合」常時true等の意図的慣例は刻印しない）。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れの解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**⚠**「367件」という数字は古い（2026-07-12続き87で実測823カードと判明＝BEHAVIOR_AUDIT等の主作業でカード母集団が増減し続けているため。件数メトリクスを信じない §3の原則どおり）。系統別内訳は`docs/_stub_leak_classification.txt`（`node scripts/_stubLeakScan.mjs`で再生成）参照。**

- ~~durational付与の「ターン終了時まで」期間注記の逆翻訳脱落（母数132枚）~~ **✅続き62で112枚復元（decompiler `restoreLeadDuration`・engine/JSON 不変）・34枚は偽陽性で正しく無注記**（詳細 BUGFIXES・原文は PLAN_DETAIL 2026-07-19退避節）。
- ~~①REVEAL_AND_PICK 文法崩れ／②LOOK_AND_REORDER 行き先欠落／③CHOOSE 圧縮／④BLOCK_ACTION 英語ID漏れ／⑤timing/icon 英語漏れ~~ **✅全て是正済（BUGFIXES①〜⑤・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5b）**。
- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（2026-07-07再確認）**＝全10シートの英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`＝いずれも§6.3機構待ち登録済み）。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367→その後の作業でカード母集団が変動し2026-07-12実測823・続き87で機械分類済み）**。effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能なものが大半。**effects JSON の再parse（機構実装・データ層修正）が本筋＝Opusタスク13**。系統別内訳（16テーマ・カード数の多い順＝デッキ操作系184／パワー修正系165／手札系102／トラッシュ系75／対戦相手コスト系63／エナ系50／ライフ系48／シグニ配置系48／ルリグ系36／能力付与系31／ガード・アタック制限系26／ソウル・アーツ系15／ウィルス系10／色・クラス系4／ゲーム除外系3／チャーム系1／その他54）は`docs/_stub_leak_classification.txt`参照（続き87・Sonnet）。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- ~~Z-2：BET系の表現描画~~ **✅完了（続き86・詳細は §3 Sonnetタスク7）**。engine 側（ベット判定自体の実装状況）は変更なし＝表現のみの改善。
- ~~B層：JSONデータ欠落の補完~~ **✅是正済（続き33-36・2026-07-07再確認＝全10シートで「then/destination 欠落」0件）**。例外は§6.3登録済み（WDK07-E15／WXDi-P07-010／WXDi-P03-005／WX26-CP1-100）。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **§2 DoDの4つ目にチェックを入れる**。

---

## 6. フェーズ2残作業：実行の正しさ（P2）

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

### 6.1 未実装action型 worklist（behavior-audit 段階4で発見・完全no-op・2026-07-03）
**✅全型クローズ＝残型0（2026-07-19時点。最後の `PREVENT_DAMAGE`／`COST_SUBSTITUTE` は続き204/204b で実装）**。当初14種42効果からの逐次実装の経緯・「修正層は effectType で決まる」の教訓は PLAN_DETAIL §6.1・BUGFIXES（続き116/122/123/202/204）参照。

### 6.2 意味照合監査（semantic audit）の worklist（2026-07-03新設・仕組みは [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)）
原文 vs effects JSON を LLM で意味比較する検査パイプライン（`scripts/semanticAudit{Extract,Run,Triage}.mjs`）。パイロット（stub群30枚精査）で precision約78%・30枚中17枚に確定バグ（同型★0・smoke/fuzz緑を通過済みのカード）。

- [x] **系統①：相手デッキ削りの owner 取り違え＝✅完了**（(a)純・相手のみ58枚是正／(b)「あなたか対戦相手」17枚は続き106で CHOOSE 化／(c)誤検知9件は修正不要。詳細 BUGFIXES 続き88・106・原文は PLAN_DETAIL 2026-07-19退避節）。
- [x] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件 ✅完了（続き239・Opusタスク9）**。単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）。(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）(c)広域24件のうち subjectFilter/条件/from で表現可能な**9カードを是正**（下記の engine 中核＝`collectEffectImmuneSigni` の `target:{count:'ALL'}` 偽陰性を subjectFilter へ変換＋`isDrive`/`sourceCostMin`/`excludeSelf`/local matchesFilter への costMin/hasCrossIcon 追加）。残る広域テールは真の§6.3（下記）へ登録。詳細 BUGFIXES 続き239。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。
- [x] **スケールアップ**＝stub群 **✅続き144〜146で母集団2,401枚を全数監査完了**（findings は Opusタスク12 (xxvii)(xxviii)(xxix) に集約）。残＝clean群3,574枚への展開（任意・低優先＝Sonnetタスク8）。

### 6.3 残・大型機構（個別カード・機構待ち）

> このセクションは機構台帳＝**現存の残作業は下記「残作業（A〜G）＋正面サブ機構の残」に集約**。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録（各機構が日付/commit を明記済み）。

**残作業（2026-07-24 整理・現存の全項目）**
- **A. 動的コンテキスト追跡系**＝**✅続き280で完全クローズ**。WX11-027 は「発生源カードがLBを持つか」ではなく解決中 `effectType:'LIFE_BURST'` を照合して相手LBだけを遮断。WX24-P4-006 は対象にしてダウンした相手ルリグの instanceId→レベルを予約へ固定し、`damageSource:'signi'`＋厳密な `< N` をダメージ消費経路で評価。WXDi-D07-007 は防いだ回数ごとにターン終了時5枚ミルを重複予約し、2回防御なら10枚を実移動する。旧「機構待ち」だけでなく前2枚が限定脱落による有害な過剰効果だった実態へ訂正。
- **B. BANISH_REDIRECT 残**＝✅完全クローズ（2026-07-24＝正面限定3件＋WX25-P3-104-E1 単体×パワー0 動的ゲート・268）。
- **C. IS_MY_TURN 誤変換の未消化サブ系統**＝**fresh 残42効果**（2026-07-27 honest 再生成値。⚠続き284/285 の「33→26件」は消化行を手で削った値だったため訂正＝続き286。**`docs/_partial_report.txt` は `fresh parser` の出力を測る計器で、続き283〜287 の修正は curated JSON への外科的適用なので、消化済み効果もレポートには載り続けるのが正しい**）。**live/curated 側では22効果を消化済み**（続き283=2／続き284 公開軸=9／続き285 ミル・トラッシュ軸=7／続き286 移動軸=1／続き287 誤parseテール=3）。全数分類は `docs/_partial_triage.txt`「2026-07-27 §6.3 段3」節。**共通ブロッカーは「前段 action/STUB が結果を `lastProcessedCards` に記録しない」の一点**で、条件語彙（`LAST_PROCESSED_COUNT_GTE`／`_MATCHES{minCount,operator,distinctName}`／`_LEVEL_SUM`／`_ALL_MATCH`）は既に揃っている。⚠**writer を足すたびに「後段で lastProcessed を読む効果」を実データで全数走査すること**（gates では捕まらない。`TRASH` は既存 reader 50件・`REVEAL_DECK_TOP` 22件・`BANISH`／`TRANSFER_TO_DECK` 各7件＝触るなら全数照合が先）。**✅前段 action 誤parse 3枚は続き287で消化**＝`PR-K049-E1`（両者のデッキ最下ミル結果を合算し、レベル合計6以上で正面−5000）／`WX24-P4-045-E1`（固定した相手シグニを相手ライフへ移し、成功時だけ自身へダブルクラッシュ）／`WX22-043-E1`（手札のアクセアイコン持ちを2枚までエナへ移し、実移動2枚でドロー）。
- **D. レゾナ出現条件トリガー7効果**＝**✅続き279で完全消化**。実データ全数は WX10-055-E1／WX10-076-E1／WX10-086-E1／WX21-021-E2／WX21-047-E1（そのレゾナ参照なし）＋WXEX1-58-E1（＜宇宙＞のそのレゾナ）／WXEX1-72-E1（＜遊具＞のそのレゾナ）。続き262の共通召喚支払いを `fieldTrashCostCards` と同じ `collectBoardDiffTriggers` へ載せ、`resonaConditionCardNum` で「出現条件支払い」と今出たレゾナの instanceId を伝達。通常trash・バトル/ルール処理・他コストは非発火、限定2件は `CardClass` 照合後にそのレゾナだけへ次の自ターンまで耐性付与。旧記載の「2枚」は全件走査で7効果へ訂正。
- **E. 個別カード機構待ち**（続き282で全件を実データ・collector/executorまで再診断）＝**✅WX15-016 は消化**：新キャンセル機構は不要で、既存 `GRANT_LRIG_ABILITY`→防御側 `ON_ATTACK_SIGNI(any_opp)` 収集、デッキトップTRASH記録、`LAST_PROCESSED_MATCHES{hasLifeBurst}`、`SET_CANCEL_OPP_ATTACK_FLAG` を合成して忠実化。**✅WXDi-P06-031 は続き288で消化**：センタールリグ【起】の実ルリグゾーン候補を純関数で固定し、既存の相手場コスト増加collectorをルリグ支払いモーダルへ接続。E2は新 `IS_SELF_DOWN` でパワー+3000とガード追加《無》を同時に限定し、従来 `SEQUENCE` 内で読まれずno-opだったガードSTUBも再帰走査へ是正。**✅WXDi-P08-037 は続き290で消化**：単体`swap` pending/UI基盤を新設し、E2のトップ公開シグニ↔アップ状態自シグニ任意交換を忠実化。「入れ替えない」のUI入力nullはswapだけ空配列へ変換し、`count:'ALL'` の恒等配置規約を維持。【出】はこの経路でON_PLAYを積まないため結果として発動しないが、`suppressOnPlay` 自体はpending保持のみで未参照。配置順列の7状態は従来未追従だった範囲を追加した挙動変更。残＝WX20-028-E2（多重アクセ state・§6.4級）／permanent引用付与残（⚠`GRANT_LRIG_ABILITY.permanent` は既に実装済み。残は主に引用シグニ能力のpermanent/相手付与）／WX17-044（自己除外先 `excluded` は既存だが、トラッシュ起動コスト・トラップ選択・表向き発動・攻撃中対象固定が先）／WXDi-P05-006 choice①（ピースカットイン割込み基盤。着手禁止）／WX25-P3-023-E2（2ターン持続＋相手効果による相手手札移動 collector。E1は発火・ターン2回・微菌条件・択一まで既存）／WDK14-013（**トラッシュ→ビート、4枚条件、ON_BECOME_BEAT連鎖は実装済み。残は複数候補時のプレイヤー選択のみ**）／WX20-Re20（選択数依存コストに加え、能力なしfilter・好きな枚数場出し・出した同一群のターン終了時trashが不足）。**WXEX1-08 は✅続き278で消化済み**。旧「各カード全体が単一の機構待ち」という記載を4項目で訂正。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。
- **G. 置換else系統の残（続き269・§3タスク5から正式送り）**＝**B 2件の置換else部分は✅続き289で消化**。SPK06-01-E1 は追加赤0/2/4の三択を同一対話で保持し、対象数1/2/3を排他的に実行（付随するレイラのコイン技回数・次回コスト軽減は既存基盤が無く別途defer）。WXK06-032-E1 は既存 `refresh_count_this_turn` を双方参照し、最初に選んだ同一対象へ－4000/－12000を排他的に適用する。**残はC 13件**（反復、引用能力／ルリグ能力付与、複雑CHOOSE、支払い系ルール等）。CのWXDi-P02-042-E1を再確認したが、相手側のターン中手札捨て枚数を読む条件軸が無いためhonest defer。effectId 全明細と不足機構は `docs/_replace_else_triage.txt`。

- **✅ H. タスク12(xxii) から正式送りの不足機構＝残 `UNKNOWN` 0 で全クローズ（2026-07-30）**＝H1 メルト・ファクト（支払い前ウィルス除去→コスト軽減／択上限）・H2 夢限 -Q-（全体リセット＋B面反転）・H3 未知の邂逅（原子的な代償＋反転＋無料センターグロウ）・H4 マユB面の配置数制限（自分側 cap の次ターン予約）・I／I′ ガード追加《無》族11効果（枚数化＋「このターン」受け皿）。**実装詳細は BUGFIXES 2026-07-30 の各節、退避した旧記述の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：§6.3 H 節クローズ」節**。実機UI検証は未了＝**§7 の未検証UI 5件**（Sonnetタスク1）。
  - **⚠H が残した横展開の教訓＝UNKNOWN を実装するときは fresh parser の出力を先に測る。** H4 は fresh が主語を見ない `STUB DEPLOY_RESTRICT` を既に吐いており、live の `UNKNOWN` だけが「対戦相手は1体まで」への意味反転を止めていた（採用した瞬間に過剰実行へ反転する型のドリフト）。
  - **⚠I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
  - **⚠I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
  - **⚠honest defer 継続＝`WX20-Re20`**（選択数依存コスト・能力なし filter・任意複数配置UI・同一instance群のターン終了時 trash が**一体で**要る＝部分実装しない）。

- **🆕 J. timing collector 不在の13効果（2026-07-31・タスク16 の `[C]` から正式送り）**＝原文が【自】なのに**そのイベントを検出する collector が engine に存在しない**群。現在は `timing:[]` で安全停止中＝**放置しても過剰実行は起きない**（着手優先度は低いが、機構台帳としてはここが定位置）。判定根拠は `docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に `ファイル:行` つき。**5家族に束ねると1家族＝1バッチで複数枚が同時に開く**：
  - **J-1 他能力の発動監視**（2効果）＝`WX19-066-E1`「あなたの【自】の【英知】能力が発動したとき」／`WXEX1-77-E1`「対戦相手の場にあるシグニの【出】能力が発動したとき」。**他 AUTO の解決開始を横から監視し能力クラス/種別を照合するイベント発行が無い**（`abilityTypes` 型は付与能力側にあるが別用途＝`effects.ts:1475`）。effectStack の push 時にフックを置くのが筋。
  - **J-2 付与・離脱イベント**（4効果）＝`WXDi-D07-004-E1`／`WXDi-D07-019-E1`（【ソウル】が付いたとき・味方/自身）／`WXK10-049-E1`「このシグニにカードN枚が付いたとき」（下敷き等を含む汎用付与＋枚数閾値）／`WXEX2-19-E1`「あなたの【アクセ】N枚がトラッシュに置かれたとき」（アクセ離脱）。**soul/acce の状態と付与能力収集は実在するが、付与/離脱の"イベント"を発火させる collector が無い**（`effectEngine.ts:5302`／`triggerCollect.ts:1787`）。既存 `ON_CHARM_TO_TRASH` がチャーム専用の先例。
  - **✅ J-3 ライフクロスの汎用移動・閾値遷移**（2026-07-31・計4効果）＝`WXK08-028-E1`／`PR-K038-E2`（原文は**0枚への到達**）に、同じ穴を共有した `WD23-023-E-E1`／`WXDi-P07-052-E1` を加えて完了。宛先付き multiset diff＋owner/宛先/到達枚数 collector を新設。実戦クラッシュは `life→field.check` の `to:'other'` として検出し、ハイティだけ既存 `ON_LIFE_CRASHED` と汎用移動をOR併記。⚠ `CRASH_TO_TRASH_INSTEAD` 後の `check→trash` は life 差分が無いため、キスの同置換枝だけ honest defer。詳細は BUGFIXES 2026-07-31 J-3節。
  - **J-4 フェイズ／アタック終了 timing**（2効果）＝`WX24-P2-075-E1`「あなたのアタックフェイズ終了時」（`ON_ATTACK_PHASE_START` のみ実在＝終了時の発行/収集が無い）／`WXK11-018-E2`「このシグニがアタックしたアタック終了時」（個別シグニのアタック終了）。⚠**着手するならタスク12(lxvii) と一体で見る**＝フェイズ/ターン境界トリガーは**CPU 側の収集が面で欠けている**ので、新 timing を足しても人間ターンだけの片肺になる。
  - **J-5 単発**（3効果）＝`WXEX1-41-E1`「【トラップ】Nつが**設置**されたとき」（`ON_TRAP_ACTIVATE` は発動専用・設置完了イベントが無い）／`SP27-007-E1`「あなたか対戦相手が《コインアイコン》を**得た**とき」（`ON_COIN_PAID` は減少方向のみ）／`WXDi-P11-010B-E1`「《夢限 -Q-》から《夢限 -A-》になったとき」（named form 遷移）。いずれも既存 collector の**逆方向/別イベント**で、単独では割に合わない。

- **✅ I. `WX25-P3-028-E2`（2026-07-31 完了）**＝`PREVENT_REFRESH`（既存 `*_until_opp_turn` family と同寿命）＋対話を跨ぐ汎用 `REPEAT`＋既存 `CHOOSE` で3機構を一体実装。発生源本人の「このターン＋次のターン」を守り、各回 self/opponent を選んで合計18枚。旧24枚強制を解消。実在 `REPEAT_N_TIMES` は4効果（旧5表記はstale）で、他3件と共有 `LRIG_GROW_RESTRICT` の対象外37件は完全不変。詳細は BUGFIXES 2026-07-31 §6.3 I 節。

**「正面」サブ機構は✅完全消化（続き281）**（機構台帳・commit 5ca1a96d/269931a0）。target 解決型5効果＋CONT パワー修正4効果、続き261の(b)(d)(e)、続き262の(c)に加え、残4枚も実測して完了。WXDi-P13-082／WXK02-084 は引用内側を `GRANT_EFFECT.effect:{CONTINUOUS, activeCondition:FRONT_SIGNI}` へ構造化し、既存 `granted_effects`→BattleScreen `effectsMap` の instanceId マージ経路で毎フレーム評価（新runtime stateなし）。WXDi-P08-060 は引用 `AUTO` の展開・self攻撃時収集は既存どおり使い、誤って自軍任意対象だった内側BANISHを `owner:opponent,frontOfSelf:true` へ訂正。WXDi-P06-042 は旧same-zi規約問題ではなく、JSONが全体強制 `FORCE_SIGNI_ATTACK{self}` に誤変換されていた真バグで、既存 `FORCE_FRONT_SIGNI_ATTACK`（2-zi）へ訂正。production形goldenで正面成立／非正面・条件不成立を両方固定。

**✅消化済み機構の台帳**（実装詳細は BUGFIXES 各日付）＝GRANT_PROTECTION 効果耐性（sourceFilter・self-except・相手エナ免疫・動的盤面条件・POWER_MODIFY 免疫5）／BANISH_REDIRECT target側スコープ（属性・単体・正面・パワー0）／ガード喪失条件（canCardGuard 統一）／IS_MY_TURN action層3枚／ダメージ置換「ブースト」条件（IS_BOOSTING）／スペル被破棄【自】2枚／続き20 STUB（powerPlusBanishedPower・variableEnergyTrashLevelBounce・negateNthAttack 等）／引用AUTO付与（残＝permanent 付与）／「ゲームから除外」基盤+8枚（PlayerState.excluded 実ゾーン化）／状態フィルタ脱落12効果／GRANT_LRIG_ABILITY 低品質展開／BURST内新語彙（全クローズ）／resume経路 collector 統合／対戦相手離脱トリガー3枚（any_opp watcher）／アーツ使用条件（ARTS_USED_THIS_TURN）／自パワー閾値（全クローズ）／ON_CARD_MILLED_FROM_DECK＋ゲーム持続付与AUTO（game_granted_auto_effects）＋リフレッシュ置換／毒牙 ON_OPP_POWER_DECREASED／G072族（完全クローズ）／multi-dest pick（全クローズ）／REVEAL remainder shuffle／GRANT_TO_PLACED_SIGNI／凍結アサシン変種／公開→自身アクセ化（INTERNAL_ACCE_PICKED_TO_SELF）／公開同レベル動的フィルタ（levelEqLastProcessed）／前ターン跨ぎ保持（LIFE_CRASHED_LAST_TURN）／使用制限誤パース＋択崩壊（全クローズ）／引用・LB付与（ディスペア）／WXK10-008／任意コスト+特定札捨て複合／リコレクト択一・ウィルス数スケール・WD22-036-G・WX25-CP1-002 他。

### 6.4 オープンな実装課題（機構・基盤）
- **配置数制限（`signi_deploy_count_limit`）が効くのは通常召喚UI／CPU召喚の3箇所だけ**（`BattleScreen.tsx:5055`／`SigniSummonZoneModal.tsx:70`／`BattleScreen.tsx:9164`）。**engine 側の効果配置（`execAddToField` ほか）は cap も `signi_deploy_power_limit` も一切見ずにすり抜ける**（2026-07-30 実測）。該当7効果（WXDi-P13-003B-E2／WXK06-004-E1／WX07-006-E1／WX12-008-E1／WXDi-P05-024-E1／WXK05-009-E1／WXK11-074-E1）に共通する既存の穴で、塞ぐと7効果すべての挙動が同時に厳しくなる面配線なので単独バッチが必要。
- **F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**：**残＝`WX17-075`（`ON_PLACED_FRONT` 任意トリガー・別機構）だけ**。`WX06-019`（効果離場+powerReduction）は `findEffectLeavePowerReductionSubstitute`、**`WX25-P1-056`（非バニッシュ離場→バニッシュ置換）は 2026-07-31 に `applyEffectLeaveReplaceBanishSubstitute` を非バニッシュ離場9サイトへ配線して実働化**（タスク12(lx)①）。⚠**3つの離場置換はいずれも「してもよい」を自動適用する決定論的近似**＝対話実装があるのはバトルバニッシュの `BANISH_SUBSTITUTE`（BattleScreen）だけ。実機で選ばせるなら3つまとめて対話化する。
- **CPU AI の拡張**：メインフェイズ AI（アーツ/スペル/起動効果の能動使用・グロウ時トリガー）未実装（→§8）。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。
- **トラッシュ自己起動のコストUI 残**：エナコスト以外（手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動）が未対応。対象: WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050・WX11-049・WX17-049・WX19-029（14枚）。
- **UNKNOWN（部分未実装・逆翻訳に`【未実装/UNKNOWN】`として露出）**: 24枚（2026-07-03 実測・`grep '未実装/UNKNOWN' docs/decompile_sheet*.txt`）＝WX05-010（ライフ見て任意トラッシュ→同数補充）／WX11-037（5枚公開→宣言カード手札）／WX11-043（ヘブン時に手札青スペル使用）／WX17-003 のほか、WX06-024／WX09-019-E3／WX17-052／WX20-077／WX21-Re19／WXEX1-32／WXK02-037／WXK07-106／WXK08-030／WX24-P1-035／WX24-P3-022／WX24-P4-038／WX25-P3-036／WX25-P3-050／WX26-CP1-061／WD23-017／WD23-024／PR-431／PR-461／PR-Di007（ジョークカード）。表示上「未実装」と明示されているため無言バグではない。
- **クラフトトークンの実機配置検証＋ADD_TO_FIELD source 近似** ＝**✅WXDi-CP02-087／WXDi-P03-078／WXDi-P05-068（続き114）・WXK07-105（続き125）で実機PASS**（過程で見つかった `resumeSelectTarget` の continuation 握り潰しは✅続き117で修正）。**残＝WX22-001-E3**（STUB `GRANT_LEAVE_PLACE_PENDING` が未実装＝機構待ち・§6.4 上部「UNKNOWN」欄と同様）。経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6。
- **golden の型網羅**：DSLアクション型のうち golden 未カバーの型を洗い出し、1型1テストで追加（現503件・2026-07-19）。
- ~~smoke SKIP の解消~~ **✅解消済（現 SKIP 0・2026-07-19 実測）**。
- **`checkAllEffects` の `MANDATORY_SUSPICIOUS`**（ヒューリスティック検出）の精査。`verifyEffects` の「定義なし」誤検出（注釈・トークン）の除外改善。
- **生ID残存＝表示or実装の穴**：`[STUB:X]` 系の残存は `STUBS.md` で管理（フォールバック20種・2026-07-19 再生成）。`[条件:X]`/`[アクション:X]` は解消済み。

---

## 7. フェーズ3残作業：実機挙動（P3）

**目標＝実機で各カードがルール通り動く。** `scripts/verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

> **実機ヘッドレス検証が可能（2026-06-30〜）**：`scripts/verifyBattleDrive.mjs`＝実ログイン→CPU戦→盤面注入→実UIクリックで効果発火→観測。手順は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)。**下記の宿題のうち `ON_TARGETED`／`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`／`ON_LRIG_UNDER_MOVED`／`ON_LRIG_GROW`／`ON_COIN_PAID`／`ON_DECK_SHUFFLED` は「発火すること」自体は既に実UI検証でPASS済み**（`ontargeted`/`banishbyeffect`/`lrigundermoved`/`cpugrow`/`deckshufflespell` 等の既定シナリオ）。**各項目末尾の「follow-up」注記（未カバー経路）だけが真に未検証のまま残っている**。

**engine 配線済み timing（C1 群・R30-R46）は✅ほぼ全項目 実機PASS**（続き57-64・112-128）。**個別の PASS 記録・修正経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §7 に退避**。

**残る実機検証項目（これだけが未消化＝Sonnetタスク1 の単一 worklist。§4 進捗サマリと二重に持たない＝新しい未検証UIが出たらここへ足す）**：

- **🆕 タスク12(lxi) 第3波が持ち込んだ未検証UI 1件（2026-07-31）**
  - [ ] **相手側 CHOOSE の4つ目の枝＝「自分のシグニをNトラッシュに置く」**（`WX22-025-E3` は「シグニ／手札2枚／エナ3枚」の3手段併記、`WXDi-P16-088-E1` は「《無》／手札1枚／シグニ1体」）＝①4択が同時に出ること ②場にシグニが無いとシグニ枝が選べないこと ③シグニ枝を選ぶと**相手が自分の場から選ぶ**UIになること。あわせて **`SPDi43-02-E1`＝回避された場合に「以下の２つから１つを選ぶ」の選択UIが出ないこと**（従来は無条件で選択が走った）と、**`WXEX2-25-E1`／`WXDi-P08-007-E1` の対象がトリガー元シグニに固定**され選択UIが出ないこと。

- **🆕 タスク12(lxv) が持ち込んだ未検証UI 1件（2026-07-31・最優先）**＝**36枚に一斉に載った**。engine の「包み形の解体」は golden で固定済みだが UI 経路は計器に映らない。
  - [ ] **条件つき任意コストのゲート**＝`WX24-P1-011-E1`（場に＜アーム＞のシグニがある場合）・`WXDi-P02-077-E1`（手札6枚以上）・`WXK07-035-E1`（相手の場にシグニ3体）で、**条件を満たさないときは支払いプロンプトが出ず、本体も起きない**こと（従来は無条件で撃てた）。条件を満たすときは従来どおり「支払う／支払わない」が出て、**支払わなければ本体が起きない**こと。⚠`WXK03-045-E1`／`WXDi-CP02-090-E1` は (lxiv) の対象ピッカー前置と**同居**するので、「対象選択 → ゲート判定 → 支払い」の順になることも見る。

- **🆕 タスク12(lxiv) が持ち込んだ未検証UI 1件（2026-07-31・最優先）**＝**61枚に一斉に載ったので影響範囲が最大**。
  - [ ] **支払い前の対象ピッカー前置**＝「〈対象〉を対象とし、〈コスト〉を支払ってもよい。そうした場合、それをバニッシュする」型で、**先に対象選択UIが出て、その後にコスト支払いの可否を問う**順序になること（従来は支払い→対象選択）。対象候補が**宣言のフィルタ（パワーN以下／レベルN以下／状態）で絞られる**こと／候補0体のときに素通りすること／支払わなかった場合に**何も起きない**こと（対象だけ選んで終わる）。代表＝`WXDi-D07-013-BURST`（パワー8000以下・《赤》）・`WXK11-031-E1`（パワー5000以下・条件つき手札1枚）・`WXDi-P02-043-E1`（**2体まで**）。
- **🆕 タスク12(lxiii) が持ち込んだ未検証UI 2件（2026-07-31）**
  - [ ] **(a) 選択肢の可否表示**＝`WX17-040-E1`（3つから3つまで選ぶ）で、①は**相手の手札が自分より多いときだけ**／②は**相手のエナが自分より多いときだけ**選べること（`choice.condition` が UI の可否に効いているか）。③は条件つきでも**選べて、条件不成立なら何も起きない**（＝選択肢内 `CONDITIONAL`）こと。
  - [ ] **(b) 中央ゾーン限定のピッカー**＝`WX15-033-E2`／`WXDi-P02-065-E2`／`WX24-P2-091-E1` で、対象候補が**相手の中央シグニゾーン1体だけ**に絞られること（従来は左右も選べた）。中央が空なら空振りすること。
- **🆕 タスク12(lxii) が持ち込んだ未検証UI 1件（2026-07-31）**
  - [ ] **`WD16-016-BURST` の相手側ディスカードUI**＝LB解決時に**対戦相手側**に「捨てる札を選ぶ」画面が出ること（自分側に出ない＝旧実装は自分の手札を1枚捨てさせていた）／相手手札5枚以下なら1枚・6枚以上なら**2枚**選ばされること／相手手札0枚で素通りすること。
- **🆕 タスク12(lx) が持ち込んだ未検証UI 2件（2026-07-31）**＝engine/golden では固定済みだが UI 経路は計器に映らない。
  - [ ] **(a) `WX12-020-E3` の「手札を好きな枚数捨ててもよい」ピッカー**＝アタック時に**まず相手シグニ1体の対象選択**が出て、**次に自分の手札から0〜全部を選ぶ**画面になり、確定後に**その1体だけ**へ（捨てた枚数×－6000）が乗ること。**0枚で確定してもクラッシュせず、パワー修正が乗らない**こと／手札0枚のときに選択画面が出ずに素通りすること。
  - [ ] **(b) `POWER_MODIFY{targetsStored}` の再選択が消えたこと**＝`WXDi-P03-089`（エクシード4の有無で －5000/－12000）で、**対象選択は最初の1回だけ**になり、支払い後にもう一度同じ1体を選ばされないこと（従来は候補1件の選択UIが再提示され ON_TARGETED が二度立っていた）。
- **🆕 タスク12(lxi) 第2波が持ち込んだ未検証UI 1件（2026-07-30・最優先）**＝相手側 CHOOSE に**3つ目の枝「エナゾーンからカードをN枚トラッシュに置く」**が出るケース。engine 直叩き golden で提示・非提示は固定済みだが UI 経路は未検証。
  - [ ] **(a) 3択＋エナ枝**（`WXK05-001-E1`＝手札2枚／エナ3枚／支払わない、`WX15-033-BURST`＝手札2枚／エナ2枚／支払わない）＝3枝が並んで出る／**エナが必要枚数未満なら エナ枝が選べない**／エナ枝を選ぶと相手のエナがちょうどN枚トラッシュへ行き、シグニは場に残ること。`WX24-P4-023-E3` の `ALL` 枝（手札全捨て／エナ全トラッシュ）は**該当0枚なら枝自体が出ない**ことも見る。
- **🆕 タスク12(lxi) 本消化（29カード30効果）が持ち込んだ未検証UI 5件（2026-07-30・最優先）**＝相手側 CHOOSE の3択（支払う／手札をN枚捨てる／支払わない）が 30効果に一斉に載った。**engine/golden/smoke では固定済みだが UI 経路は計器に映らない**。代表カードは `WX25-P1-038`（エナ《無》×3）・`WX25-P1-040`（手札3枚）・`WXDi-P07-024`（手札3枚＋DOWN）。
  - [ ] **(a) エナ不足で「支払う」が選べない**＝相手の `energy.length < costColors.length` のとき pay が `available:false`／その状態で「支払わない」を選ぶと X が実行されること（`WX25-P1-038-E1`）。
  - [ ] **(b) 手札不足で「手札をN枚捨てる」が選べない**＝相手の手札が N 枚未満のとき discard が `available:false`（`WX25-P1-040-E1` は N=3）。
  - [ ] **(c) 併記型で両方の選択肢が同時に出る**＝「手札を1枚捨てるか《無》を支払わないかぎり」形で pay と discard が**並んで**出る（`WXDi-P05-TK01A-E1` は本消化では据置なので、併記型の live 実例は `WXDi-P16-088` 系ではなく golden の `TEST-LXI-BOTH` 相当。**live で併記型が載っているのは現状0**なので、実機確認は次バッチで併記型が入ってからでよい）。
  - [ ] **(d) ライフバースト経路で相手へ CHOOSE が飛ぶ**（`WX24-P2-071-BURST`／`WX24-P4-062-BURST`／`WX25-P3-076-BURST`／`WXDi-P04-058-BURST` の4件）＝**相手のアタック中に自分のLBが捲れる**という文脈で、支払う側が「LBを受けた側の対戦相手（＝LB使用者から見た相手）」になっていること。手番の入れ替わりで owner が反転しないかを見る。
  - [ ] **(e) 入れ子 SEQUENCE の continuation が中断を跨いで残る**（`WX24-P1-023-E1`）＝ゲート（相手CHOOSE）の解決後に**後続の `REVEAL_AND_PICK`（デッキ5枚見て2枚まで手札）が必ず走る**こと。相手が支払っても支払わなくても走る（回避されるのはバニッシュだけ）。同型は `WX24-P2-033-E1`／`WX25-P3-042-E1`。
- **🆕 エクシード本体5件（次の一手①）が持ち込んだ未検証UI 3件（2026-07-30・最優先）**＝engine/golden では固定済みだがUI経路は計器に映らない。
  - [ ] **(a) 群B＝相手側の支払い回避 CHOOSE**（`WX24-P4-018-E2`）＝相手に「支払う／手札を3枚捨てる／支払わない」が出る／**手札が3枚未満なら `discard` が選べない**（`available:false`）／**不払いを選んだときだけ**バニッシュ対象選択が出て、捨てた場合は場が変わらないこと。
  - [ ] **(b) 群C＝任意ライフクラッシュ＋動的対象数**（`WX24-P4-015-E2`）＝「クラッシュする／しない」が出る／しない→**1体**・する→**2体**の対象選択／**ライフバースト解決（チェックゾーン）を跨いでも対象数が2のまま**であること（ここが最重要＝engine では golden で固定済みだが実機の中断経路は未検証）。
  - [ ] **(c) 群E＝2群ピッカー**（`WX24-P4-017-E2`）＝トラッシュから**スペル枠と青シグニ枠が独立に「1枚まで」**で出る／片方0枚でも成立する／該当0枚のときに空振りしないこと。
- **🆕 §6.3 H／I′ の機構4件が持ち込んだ未検証UI（2026-07-30・最優先）**＝engine/golden では固定済みだがUI経路は計器に一切映っていない。
  - [ ] **(a) ガード追加《無》の N枚徴収**（`WX24-P3-069-E1` ほか族11効果）＝警告表示が N枚で出る／`energy.length < N` でガードが**成立しない**／確定時にちょうど N枚徴収される。**UI を迂回する経路でも不足時にガードを成立させないこと**を併せて見る。1枚（`count` 省略）の既存6 CONTINUOUS が非回帰であることも確認。
  - [ ] **(b) `WDK14-013-E1` のトラッシュ＜悪魔＞候補ピッカー**（`SigniOnPlayCostModal`）＝**候補が必要数を超えるときだけ**ピッカーが出る／必要数ちょうど・不足時は出ずに従来の先頭自動選択のまま／選択を省略しても支払いが通る。
  - [ ] **(c) メルト・ファクト `WX15-067-E1` の支払い前ウィルス除去UI**（`SpellCastModal` に1段挿さる）＝相手3ゾーンから0/1/2個を選べる／**除去1個以上でこのカードだけ《黒×2》軽減**／**2個以上で本体 CHOOSE の上限が1→2**／**選択を変えると支払いエナ選択がクリアされる**（旧コストの選択を持ち越さない）／モーダル close で選択が消える。
  - [ ] **(d) 夢限 -Q- `WXDi-P11-010A-E1` の反転**＝手札/エナ/トラッシュのデッキ戻し＋シャッフル、センター最上段以外の全除外、B面 `WXDi-P11-010B` への差し替えが**1手で**起きる／反転後に **Limit 9・B面E2【起】**が使え A面能力が消えている／B面E1（5ドロー＋エナチャージ5）が**1回だけ**発火。
  - [ ] **(e) 未知の邂逅 `WXDi-P13-003A-E1` の無料グロウ**＝実移動**5枚以上でだけ**反転＋グロウが起き4枚以下は代償だけ／グロウ後に**同ターンの通常グロウが封じられる**（`actions_done` に `GROW`）／B面【出】2件が発火／このターン既にセンターグロウ済みなら候補に出ない。

- **ON_LRIG_GROW④**＝《ターン1回》の実機検証：標準グロウの二重発火ブロックは確認済（続き132）・コード疑義は✅続き206の全コレクタ監査で「穴なし」確定。**残＝ゲット・グロウ（GROW_FREE横グロウ）経路の E2E が driver で完走できず未検証**（`openFreeGrow` 後に lrigTop が変化しない・原因未特定）。
- **(xi) の skip 検証**＝`CONDITIONAL{条件, then:STUB OPTIONAL_COST}` 包み（続き206修正）で、skip 選択時に本体が発動しないことの実機確認。
- **(xxxvi) のグロウ支払いUI**＝エナ代替トラッシュ（`wildcardInstIds`/`colorOverrideMap`）のグロウ経路配線（続き206）の実選択検証。
- **クラフトトークンの実機配置**の残＝WX22-001-E3（§6.4）。
- **🆕 lrigDown コストの限定（続き218）**＝(a) センター限定（`WXK10-023`・`WXK10-037`・`PR-K064`）で**アシストルリグが支払い候補にならない**こと。(b) レベル限定（`WXDi-P03-009`・`WXDi-P04-042`・`WXDi-P02-009`）で**該当レベル以外のルリグが候補にならない**こと。どちらも支払い可否（コストモーダルの活性）と自動支払いの選択順の両方を見る。
- **driver 側**＝30件超の連続実行で出る低頻度フレーク（Sonnetタスク3。`oppDraw` 単独FAILは別要因で未解明）。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（flatten 系統としては VALUE=0・LOSS=0・同型★0。⚠parserWorklist 全体の held/LOSS は別勘定＝§4 恒久指標参照）。**残る作業は表現ではなく engine 配線の実機検証のみ**（上記）。診断＝`npx tsx scripts/archive/_flattenList.ts`（0枚を確認）。系統別の直し方は `BUGFIXES.md` の R5〜R58 エントリ。

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
- **`npm run smoke`（`scripts/smokeTest.ts`）**：全効果10722件を**オートパイロット**でヘッドレス実行し、CRASH/HANG（STEP_CAP=200）/INVARIANT違反を検出。現状＝全0（OK 10722／SKIP 0・2026-07-19）。⚠「壊れないか」を保証するもので「ルール的に正しい結果か」は判定しない。
- **`npm run golden`（`scripts/goldenTest.ts`）**：主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」をassert。現状＝**PASS 503／FAIL 0**（2026-07-19。型網羅化の経緯は続き82-85）。バグを直す前に1件足すと回帰を防げる。
- **`npm run fuzz`（`scripts/selfPlayFuzz.ts`）**：乱択自己対戦ファズ。ランダム初期盤面で効果を連鎖発動し相互作用/進化盤面クラッシュ/ループ/カード爆発を検出。シード固定で完全再現可能（既定200ゲーム×40手）。現状＝全0。重め検証は `npm run fuzz -- --games 2000 --moves 80`。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。
- **`npm run census`（`scripts/vocabCensus.ts`）**＝語彙センサス＝**両方向98計測**（原文修飾句77パターン＋数値/構造/逆方向21計測）×JSON対応語彙の突き合わせで**過剰効果（フィルタ/条件/制限/構造の脱落）と幻覚（原文に無い効果/数値）**を検出（既存網の死角＝盤面が変化するバグ）。高シグナル1895効果ベースライン（現値は §4 恒久指標が正）・超過で exit 1・明細 `docs/_vocab_census.txt`。
- **`npm run census:clusters`（`vocabCensus.ts --clusters`・続き23新設）**＝census高シグナルのマッチ節を正規化テンプレ（数値→N・《名前》→《X》・＜クラス＞→＜C＞）にクラスタし、枚数順の文型一覧 `docs/_census_clusters.txt` を出力。**§5c消化バッチの入口**＝カード単位でなくテンプレ単位で作業を組む。
- **`node scripts/heldReview.mjs`（続き23新設）**＝`build:effects` の「温存(要レビュー)」を diff署名（type増減）でグループ化し `docs/_held_review.txt`（原文＋leaf diff付き）に出力→spot-check後 `--adopt ID1,ID2,…` / `--adopt-sig "署名"` で fresh を一括採用。前提＝直前に `npm run build:effects`（fresh を `docs/_held_fresh.json` に保存）。**採用しないもの＝STUB退化・「代わりに」昇格・別STUB id 化**（理由は BUGFIXES 続き23）。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（2026-07-19 実測＝held 188・LOSS154/VALUE34。§4 恒久指標参照）。回帰検出に使う。⚠HEAD比較＝auto-commit 環境では採用コミット後の値で判定する。
- **`npx tsx scripts/archive/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。
- **`docs/_partial_report.txt`（2026-07-07新設・`build:effects` が再生成）**＝parser 無言フォールバック刻印の計器＝「原文の条件/ステップを黙って落とす近似」の理由明細（初回142効果＝IS_MY_TURN化125/multi-dest分割11/リコレクト分割8）。この数字から**増えたら**parser に新たな無言近似が入った兆候（減らすのは §5c の条件語彙拡充）。刻印された fresh は parseStatus:PARTIAL＝heldReview で採用時にレビュアーに見える。

---
**関連**：`DESIGN.md`（設計方針）／`PLAN_DETAIL.md`（消化済み履歴）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
