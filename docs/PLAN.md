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
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | **残33効果/33クラスタ**＝原文が【自】なのに timing 判定が外れて `ON_PLAY` へフォールバックした効果群。[B]は枚数閾値・原因owner・移動カードfilter・target origin 等の軸不足で `timing:[]` 安全停止中、[C]は collector 無し。明細と §6.3 送り提案は `docs/_timing_census_triage.txt` 2026-07-27節。<br>**残の要注意1件＝`cost.underSelfTrash`（16効果）が未配線**＝「このシグニの下からカードN枚をトラッシュに置く」【起】コストは `BattleScreen.tsx:5404` でカットイン候補から除外されるだけで支払い実装が無い。配線には「このシグニの下／あなたのシグニの下」の区別・支払い可能判定・複数候補時のゾーン/カード選択UI・既存コスト支払い経路への合流が要る。<br>⚠**計器に盲点あり**＝2026-07-28 の誤分類36件を `census:timing` は33件しか報告しなかった。消化済みの経緯（36件停止／続き272・273・277・278 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節・BUGFIXES 2026-07-28節。ゲートではない（exit 0） |

> **✅消化済のタスク（1〜9・11・17〜19）は 2026-07-29 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節。生きているのは上表の **12〜16** のみ。

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。**下表は残作業のある在庫のみ**。消化済み在庫〔(i)〜(lvi) の大半〕の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19・2026-07-24・2026-07-28・**2026-07-29**の各退避節〕。直近クローズ＝**(xliv) `BANISH_REDIRECT` 残テール**と **(xlii) `GRANT_LEAVE_PLACE_PENDING` 残2枚**は 2026-07-29 に残0で完全クローズ〔詳細 BUGFIXES 2026-07-29節〕）：

| ID | 内容 |
|---|---|
| 🆕(xxix) | **semantic audit stub群 round3（2,101枚・findings 2,799件）**＝①duration系統／②選択肢欠落／③「そうした場合」did-it ゲート／(a)／(b)／(b1)／**(b2-i)〜(b2-vi)** は**すべて✅消化済**（1437効果の自身【出】配線まで到達。消化経緯の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節、一次記録は BUGFIXES 2026-07-28節／続き148・149・218h・222・223・226・243）。<br>**残＝(1) 自身【出】の任意+cost 933効果**（支払いプロンプトが別フロー）**(2) 段階3＝`mandatory:false`＋cost無しの65効果**（＝在庫(lv) と同根）**(3) watcher [B]4件**（エナ由来／手札以外由来／【出】能力保有＝限定語彙が無く `timing:[]` で安全停止中）**(4) defer 3件**（相手効果による自シグニ場離れのターン履歴 Condition／配置個体への `REMOVE_ABILITIES` 固定語彙／`ATTACH_CHARM_FROM_TRASH` 本実装）**(5) (b2-ii) の defer 4件**→(3)〜(5) は §6.3 送り。<br>⚠**この経路は `fuzz`/`smoke` が通らず golden だけが網**（`selfPlayFuzz.ts:12-13` が自ら明記）＝BattleScreen 側の変更は実機 driver でも確認する。明細と表 `docs/_semantic_audit_stub_round3_triage.txt` §6 |
| 🆕(xlvi) | **原文は「手札に加える」なのに curated が `LOOK_AND_REORDER` のままで、pick が live で実行されない系統**（カードアドバンテージが死ぬ）。✅続き218g で9効果を外科採用。✅**2026-07-29 に3波で21効果を消化**＝第1波5（`pk` 規則を `hasRiseIcon`／`isDisona`／`hasLifeBurst`／色OR へ拡張）＋第2波12（独立SEARCHの `LOOK_PICK_CHAIN` 展開・`remainder.shuffle?`）＋第3波4（**中段 `then:'deck_top'`＝「1枚をデッキの一番上へ戻す」を engine 実装**）。census 1476→**1468**・golden 891→**926**・held 257 据置。<br>**残＝31効果**（`heldReview` ではなく**live JSON 走査で確定した実数**＝held に載らない「fresh も pick を落とす」分を含む。抽出条件＝curated の action に `LOOK_AND_REORDER` があり pick 系 type が1つも無く、原文に「手札に加え」がある）。分類：**(a) 動的filter 7**〔場のルリグと共通色＝`SPDi01-131-E1`／`WXDi-P02-017-E1`／`WXDi-P15-031-E1`／`WXDi-P15-005-E1`、対象と同名＝`WXK04-045-E1`、共通クラス＝`WXK08-025-E3`／`WX25-P1-041-E1`〕**(b) 複合・条件 10**〔`WXDi-P03-061-E2` は**held 群A＝採用すれば pick は入る**が「加えた枚数ぶん捨てる」が落ちる／`WX12-Re10-E1` 条件付きpick／`WX24-P4-037-E1`／`WX26-CP1-061-E1`＋`-SONG`／`WXDi-P05-015-E2` 束分け／`WXDi-P08-007-E3` REPEAT内／`WXDi-P09-066-E1`／`WXK02-001-E2`／`WX25-P3-052-E1`（エナ経由＝要偽陽性判定）〕**(c) 宣言系STUB 4**〔`PR-434-E1`／`-BURST`／`WX11-037-E1`／`WX24-P1-035-E1`〕**(d) hand-or-energy 3**〔`WX24-P1-039-E2`／`WXDi-P16-086-E1`／`WX11-074-E1`〕**(e) 表記ゆれ/後続セグメント 3**〔`WXDi-P05-050-E1`＝原文が「３枚**を**見る」で reveal 規則が外れる・**最小コスト**／`WXDi-P12-001-E1`＝使用条件＋バリア後続で早期returnを避ける必要／`WX24-P2-049-E2`＝**fresh は既に `REVEAL_AND_PICK` を出すが effectId がずれる**＝外科採用案件〕**(f) OR filter 2**〔`WX25-P1-022-E1`／`WX25-P2-045-E1`＝「スペルか＜X＞のシグニ」〕**(g) トラップ設置併記 2**〔`WX15-083-TRAP`／`WX19-039-E1`〕。**次に取るなら (e)→(f)→(a)** の順が費用対効果が高い。詳細 BUGFIXES 続き218g／2026-07-29節（第1〜3波） |
| 🆕(l) | **アーツ「ターン終了時まで、あなたのセンタールリグは「【自】…」を得る」の内側【自】parse 失敗3枚＝完全 no-op**（続き234・Opus観測）＝WD21-009／PR-204／WX15-016。`GRANT_LRIG_ABILITY{abilities:[]}` に full rawText を抱えたまま内側【自】が nest されずアーツが何もしない。同パターン11枚中8枚は正しく nest 済＝§6.3 新機構は不要・内側 ability parse 改善で直る。失敗3枚の内側は複雑（アタック時トリガー／数字宣言／バーストアイコン照合／アタック無効）。詳細 BUGFIXES 続き234 |
| 🆕(lv) | **WXEX2-71-E2 は `mandatory:false`＋costなしの自身 ON_PLAY で収集経路から脱落し、元から no-op**（2026-07-26・タスク8(c)差し戻し実測）＝`handleSummonSigni` の `ownOnPlay` は mandatory のみ、`ownCostOnPlay` は cost ありのみを収集し、`droppedOnPlay` が同 effectId を警告する。英知=2 `activeCondition` 自体は engine で正しく評価できるが発火候補にならない。任意・無コスト【出】の共通選択機構として実装する（本差し戻しでは honest defer）。|

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 76件まで消化済（(a)(b)(c)＋oppDrawOwnEffectOnly＋続き173/174＋🆕`resonaMainWx08021`〔続き263・レゾナ召喚UI MAIN〕）。**残＝§7 の未消化項目**＝🆕**レゾナ召喚UIの ATTACK 窓／SPELL_CUTIN 窓／REQUIRES_NEW_FLOW／支払いトリガー発火（最優先・§4 参照）**＝(xi) skip検証・(xxxvi) グロウ支払いUI・ON_LRIG_GROW④・WX22-001-E3（§6.4）＋🆕(xlvii) 防御側ルリグアタック収集（続き218j＝ガード応答とスタック解決順が噛み合うかの要実機確認）。経緯は PLAN_DETAIL §3 |
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

- **🆕 セッション（2026-07-29・Opus指示＋Codex実装／Opus検証・複数バッチ連投）＝タスク12 の在庫3本〔(xliv)・(xlii)・(xlvi)〕を消化し、うち2本を完全クローズ**（golden 891→**922**・census 1479→**1469**〔`BASELINE_HIGH` 同値更新〕・held 268→**257**・smoke 10726 全0・同型★0）
  - **✅(xliv) `BANISH_REDIRECT` 完全クローズ**＝(b) 単体対象4効果が `count:'ALL'` で「相手シグニ全体をそのターン trash 送り」になっていた過剰実行／(b1) 「それ」が直前ステップの対象を受けず `WXK06-048-E1` で対象選択が2回出る照応バグ／(b2)(b3) バトル限定個体と「次の相手ターン終了時まで」の付与型。副産物で **`WX12-033-E2` の【ランサー】無条件付与**（PRESERVE カードで parser 修正が built JSON に届かない held ドリフト）を外科是正。
  - **✅(xlii) フォールバックSTUB `GRANT_LEAVE_PLACE_PENDING` 残2枚を完全消化**＝場を離れたときの残り配置トリガーを実装し、アタックフェイズの離場 watcher 規則は**クラス/ゾーン/比較を原文から読む**形へリファクタして個別ハードコードを解消。
  - **🆕(xlvi) 第3波＝中段 `then:'deck_top'` を engine 実装し4効果を復元**（golden 922→**926**・census 1469→**1468**）＝「その中から1枚を手札に加え、**1枚をデッキの一番上に戻し**、残りを一番下」の3段形は既存 `pk` 規則が pick 直後に「、残りを」を要求するため必ず外れ、**手札加えもトップ戻しも消えた並べ替え**に退化していた。**要点は順序**＝deck_top 段は盤面を動かさずデッキ内に予約し、remainder を動かした**あと**で一番上へ置く（先に動かすと「残りを下へ」がその1枚を巻き込む）。⚠**この系統の残は10件ではなく31件**＝前回の「残10件」は held 由来の過小推定で、**held に載らない「fresh も pick を落とす」分**が本丸だった（live JSON 走査で確定・分類は §3 (xlvi) 行）。
  - **🆕(xlvi) 第1・2波＝held ドリフトを2波で消化（17効果）**＝**第1波5効果**（既存 `pk` 規則を `hasRiseIcon`／`isDisona`／`hasLifeBurst`／色OR へ拡張し、消えていた pick-to-hand を復元）＋**第2波12効果**（色/レベル/カード種別ごとの独立SEARCH〔D3・7効果〕と hand＋trash/energy の独立SEARCH〔D5・5効果〕を既存 `LOOK_PICK_CHAIN` へ展開し、**合計枚数への誤簡約**を回避）。engine 拡張は `LookPickChainAction.remainder.shuffle?` の1フィールドのみ＝既存40効果は action JSON 不変を機械確認。`then:'deck_top'` が要る群3は**未配線の宣言を避けて honest defer**。
  - **⚠PRESERVE カードの扱いが2波とも要点**＝`WX16-037-E2`・`WXK05-023-BURST` は parser を直しても built JSON に届かないため、**parser 同修正＋effectId アンカーの外科採用＋`MANUAL` 化＋兄弟効果の完全不変確認**の3点セットで着地させた（この型は今後も再発する）。
  - **検証の型が固まった**＝生 parser 出力の全カード effectId 差分（outlier 0）→ live JSON の per-effect 差分（対象件数と一致）→ 実データ action を `execLookPickChain → SEARCH → resumeSearch → continuation再入` で全段完走させ hand/trash/energy/remainder を assert する golden を1効果1本。**golden 891→922 の +31 はほぼこの実行 assert。**
  - **次の一手**＝**Opus：(xlvi) 残31件**（§3 (xlvi) 行に (a)〜(g) で分類済み。**(e) 表記ゆれ/後続セグメント3件 → (f) OR filter 2件 → (a) 動的filter 7件** の順が費用対効果が高い）**／(xxix) 残＝任意+cost 933効果と段階3 65効果（タスク12(lv)）／ゲート脱落 [B]20件（Condition 語彙の新設）／タスク16 の [B]29件＋watcher [B]4件／(l) 内側【自】parse 失敗3枚／§6.3 残機構（H1〜H3・I）**。**Sonnet：§7 実機検証の横展開**＝`effectPlacedOnPlay`／`effectPlacedOnPlayZoneSelect` の型で他の BattleScreen 依存機構（レゾナ召喚UI の ATTACK/SPELL_CUTIN 窓・escapeDiscard 回避モーダル・BET 選択肢・アーツ使用条件20枚）にも実機シナリオを足す。

### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 257枚／署名グループ 110件（2026-07-29 実測・`node scripts/heldReview.mjs`）。LOSS/VALUE は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1511【効果単位】**（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中）。**宣言後の直近推移**＝1581→1580〔WX20-028-E2 誤形撤去〕→1578〔BANISH_REDIRECT 正面限定〕→1577〔BANISH_REDIRECT 単体×パワー0〕→1571〔正面 frontOfSelf target filter 5効果＝WXK11-029-E2/WXDi-P04-049-E1/WXK04-072-E2/WX12-038-E1/WD17-009-E1。⚠WXK04-072 は PRESERVE カードで built JSON 直パッチ必須〕→1567〔正面 CONT パワー修正 frontOfSelf 4効果＝WX24-P1-050-E1/WX24-P2-057-E1/E2/WXDi-P10-044-E1〕→1563〔§3タスク6「代わりに」B1残 per-target 値すり替え4効果＝WXDi-P11-067/WX14-070/WDK17-014/WX25-P2-101〕→1562〔WXK06-071 多段閾値ネスト CONDITIONAL＝OPP_CARDS_MOVED_TO_DECK_THIS_TURN〕→1557〔§3タスク6 D バニッシュ置換ルール5効果＝WX13-031/WX16-001/WXK04-068 の BATTLE_BANISH_PREVENT_LOSE_ABILITY・WX14-026 の substituteCost.lifeCrash・WX10-033 の thisCardOnly・WX25-P1-056 の EFFECT_LEAVE_REPLACE_BANISH〕→1554〔§3タスク6 C コスト代替4効果＝WX24-P1-060/WX25-P3-076 の COST_TRASHED_MATCHES・WXEX2-48 の ACTIVATED_DISCARD_COUNT_GTE 配線・WX07-027 の cost.costSubstitute〕→1552〔§3タスク6 E＝decompiler に recollectArts 描画を追加（機構は実装済・計器バグ）＋「能力を失い＋パワー修正」複文の脱落是正4効果〕→1551〔§3タスク8 §6.3「正面」(b)(d)(e)＝WX05-019-E1/WXK11-029-E1/WX10-036-E2＋新 FRONT_SIGNI 条件〕→1549〔§3タスク8 出現条件レゾナ **段階1のみ**＝parser が捨てていた55枚の【出現条件】を `appearanceCondition` メタデータ（rawText＋timings＋cost／未対応は deferReason）として保存＋新 filter `excludeResona`。⚠**召喚フロー自体は未実装＝語彙の計器改善であって機能実装ではない**〕→1545〔§3タスク12(liv)＝CONTINUOUS 能力喪失の誤 facing 8効果を全数分類。WXEX1-02-E1（凍結ALL＋【常】【自】限定）/WX18-038-E1（チャームALL）を忠実化＋相手センタールリグ走査を新設、残6効果は明示 STUB defer。⚠**減少4のうち engine で新たに動くのは WXEX1-02-E1 の1効果のみ**（他は誤動作の停止＋分類移動）〕→1537〔続き268 分離pick curated 23効果採用〕→1535〔続き269 置換else A残8＋B固定参照1件〕→1527〔続き281〕→1525〔続き284 公開snapshot軸9効果〕→1523〔続き285 ミル/トラッシュ軸7効果〕→1521〔続き291 レベル倍率族〕→1519〔続き293 (xxii) 後置条件 live 実害9効果〕→1518〔続き295 (xxii) WXK06-031 の4枚SEARCH＋後置条件〕→1517〔続き296 (xxii) 群B3効果を過剰実行なしで着地＝**タスク12(xxii) 完全クローズ**〕→1515〔(xxxix) バッチ2＝WX22-006-E3 の distinct:'name'／WXK01-005-E1 のルリグデッキ戻し〕→1513〔(xxxix) バッチ3＝公開集合の照応4効果〕→1511〔(xxxix) バッチ4＝機構4効果＝**タスク12(xxxix) 完全クローズ**〕→**1510**〔(xxix) の副産物＝`REMOVE_ABILITIES` が原文「N体まで」を読まず常に count:1 だった過小実行を是正（WXDi-P03-024／WXDi-P13-043／WXK10-016／WX24-P1-002 の4効果が2体まで消せるように）。**機能実装**。⚠この1件は計器のマスクが剥がれて表面化＝従来は無意味な `upToCount:false` が census キー `'upTo'` に部分一致して「対応済み」に見えていた偽陰性。(xxix) 本体の G154族16効果（union＋escapeDiscard）は census に対応パターンが無く増減しない〕。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **2026-07-28〜29 最新値（上記長文履歴の追補）**：**`BASELINE_HIGH=1469`（2026-07-29 現在の回帰ゲート値）**。1476 以降の推移＝**1476→1471**〔タスク12(xlvi) 第1波＝`LOOK_AND_REORDER` の消えていた単一 pick-to-hand 5効果を復元〕→**1471→1469**〔第2波＝多段/複数グループ pick 12効果を `LOOK_PICK_CHAIN` へ展開。⚠**減少2に対し実際に挙動が変わるのは12効果**＝census 側に対応パターンが無い分は増減しない〕→**1469→1468**〔第3波＝中段 `then:'deck_top'` の3段形4効果。同じく**減少1に対し挙動が変わるのは4効果**〕。以下は 1479→1476 の経緯：タスク12(xliv)(a3) の実働化に伴い、WX09-022 の欠落していた《エナジェ》`activeCondition` を parser から復元して **1479→1478**、さらに Opus 検証で同文型の **WX12-033-E2**（PRESERVE カードのため build が curated を温存し fresh の条件が届いていなかった＝【ランサー】無条件付与）を外科パッチして **1478→1477**。(b3) `WXDi-P14-053-E1` の引用【常】を長期付与ストアへ実働化して **1477→1476**。いずれも計器だけの改善ではなく機能修正。
- **母数**：効果カード 5975／効果 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden **926**・smoke **10726** 全0（SKIP も 0）・fuzz 全0・同型★0・census **1468**（＝`BASELINE_HIGH`・回帰ゲート）・held **257枚/110署名**（2026-07-29 実測）。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（上記の機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫（(xxix) の残／(xlvi)／(xlii)／(l)／(lv)）＋タスク16 残**（(i)〜(xl) の大半は消化済み＝1行✅サマリ参照。(vii)(viii)(xxii)(xxix)(xxxix)(xliii) は完全クローズ）。**Sonnet の主力は タスク1（§7 実機検証＝(xi) skip検証・(xxxvi) グロウ支払いUI・傀儡 resume・エナ復帰・5a エナ焼き filter・selectionConstraint UI・opponentSelects UI・比例カウントほか）**＝タスク8 clean群（3,574枚）は任意。タスク4（キュー）は枯渇したので取らない（理由は §3 Sonnet 表）。
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

- **🆕 H. タスク12(xxii) から正式送りの不足機構3件（続き296・2026-07-28）**＝(xxii) 本体は完全クローズしたが、以下は `UNKNOWN{raw}` で honest defer 中（**過剰実行はしない＝現状は安全側**）。実装時は `raw` に原文全文が入っている。
  - **H1 `WX15-067-E1`（メルト・ファクト）**＝①スペル**支払い前**に相手の【ウィルス】を任意数取り除くUI（`SpellCastModal` に1段挿す）②除去実数に連動する使用コスト軽減（受け皿 `next_spell_cost_reduction` は実在＝`SpellCastModal.tsx:46` が消費）③除去2以上のとき本体 `CHOOSE` の上限を1→2へ。既存の近い機構＝`EXTRA_COST_REMOVE_VIRUS`／`INTERNAL_ECRV_APPLY`（`execStubPart1.ts:1476-1530`・選択肢数は `removeN+1` 固定でこのカードとは規則が違う）。**本体2択は続き296で復元済み**。
  - **H2 `WXDi-P11-010A-E1`（夢限 -Q-）**＝①手札＋エナ＋トラッシュの一括デッキ戻し＋シャッフル ②ルリグデッキと場から**「このルリグ以外」**を一括ゲーム除外 ③**ルリグを裏向きにするゲーム状態**（現状 `faceDown` は `BoardComponents` の表示 prop のみ＝**新設が要る唯一の点**）。**条件側は続き296で実装済み**＝`EFFECTIVE_LRIG_LIMIT_GTE{9}`（実効リミット式は `src/screens/battle/lrigLimit.ts` に抽出済・画面と共有）。⚠**3つは原子的に実装すること**（ゾーン移動だけ先に入れると盤面の意味が変わる）。
  - **🆕 I. タスク12(xxxix) から正式送りの不足機構1件（2026-07-28）**＝**`WX24-P3-069-E1` のガード追加コスト枚数化**。「対戦相手は追加で《無》《無》《無》を支払わないかぎり【ガード】ができない」を実装するには、①`collectOppGuardExtraColorlessCost`（`src/engine/effectEngine.ts:3034`）を **boolean→枚数（number）** へ拡張 ②ガード支払いモーダル／確定処理の N 枚徴収 ③この collector は `effectsMap.get(cn)` の **CONTINUOUS しか走査せず、`GRANT_LRIG_ABILITY` でターン中に付与された能力ストアを見ない**ため、付与形を走査する配線、の3点が**一体で**要る。既存の唯一の消費者 `WXDi-P06-031-E2`（《無》×1）の**省略時＝1枚**非回帰が必須。現状は `UNKNOWN{raw}` で honest defer 中（アタック無効化のみ実装済み＝過剰実行はしていない）。
  - **H3 `WXDi-P13-003A-E1`（未知の邂逅・ピース）**＝①【使用条件】【ドリームチーム】＋「このターンにセンタールリグをグロウしていない」の使用可否判定 ②**ピースの両面反転**（A面 `WXDi-P13-003A` ↔ B面《未知の巫女　マユ》） ③**特定カードを指定したコストなしグロウ**（`free_grow_this_turn`＝`execStubPart2.ts:4180` は「無料でグロウできる」フラグのみでカード指定が無い）。⚠**代償（手札全捨て＋エナ全トラッシュ）だけ先に実装しない**＝見返りが無いと今より悪化する（続き296 の設計判断）。

**「正面」サブ機構は✅完全消化（続き281）**（機構台帳・commit 5ca1a96d/269931a0）。target 解決型5効果＋CONT パワー修正4効果、続き261の(b)(d)(e)、続き262の(c)に加え、残4枚も実測して完了。WXDi-P13-082／WXK02-084 は引用内側を `GRANT_EFFECT.effect:{CONTINUOUS, activeCondition:FRONT_SIGNI}` へ構造化し、既存 `granted_effects`→BattleScreen `effectsMap` の instanceId マージ経路で毎フレーム評価（新runtime stateなし）。WXDi-P08-060 は引用 `AUTO` の展開・self攻撃時収集は既存どおり使い、誤って自軍任意対象だった内側BANISHを `owner:opponent,frontOfSelf:true` へ訂正。WXDi-P06-042 は旧same-zi規約問題ではなく、JSONが全体強制 `FORCE_SIGNI_ATTACK{self}` に誤変換されていた真バグで、既存 `FORCE_FRONT_SIGNI_ATTACK`（2-zi）へ訂正。production形goldenで正面成立／非正面・条件不成立を両方固定。

**✅消化済み機構の台帳**（実装詳細は BUGFIXES 各日付）＝GRANT_PROTECTION 効果耐性（sourceFilter・self-except・相手エナ免疫・動的盤面条件・POWER_MODIFY 免疫5）／BANISH_REDIRECT target側スコープ（属性・単体・正面・パワー0）／ガード喪失条件（canCardGuard 統一）／IS_MY_TURN action層3枚／ダメージ置換「ブースト」条件（IS_BOOSTING）／スペル被破棄【自】2枚／続き20 STUB（powerPlusBanishedPower・variableEnergyTrashLevelBounce・negateNthAttack 等）／引用AUTO付与（残＝permanent 付与）／「ゲームから除外」基盤+8枚（PlayerState.excluded 実ゾーン化）／状態フィルタ脱落12効果／GRANT_LRIG_ABILITY 低品質展開／BURST内新語彙（全クローズ）／resume経路 collector 統合／対戦相手離脱トリガー3枚（any_opp watcher）／アーツ使用条件（ARTS_USED_THIS_TURN）／自パワー閾値（全クローズ）／ON_CARD_MILLED_FROM_DECK＋ゲーム持続付与AUTO（game_granted_auto_effects）＋リフレッシュ置換／毒牙 ON_OPP_POWER_DECREASED／G072族（完全クローズ）／multi-dest pick（全クローズ）／REVEAL remainder shuffle／GRANT_TO_PLACED_SIGNI／凍結アサシン変種／公開→自身アクセ化（INTERNAL_ACCE_PICKED_TO_SELF）／公開同レベル動的フィルタ（levelEqLastProcessed）／前ターン跨ぎ保持（LIFE_CRASHED_LAST_TURN）／使用制限誤パース＋択崩壊（全クローズ）／引用・LB付与（ディスペア）／WXK10-008／任意コスト+特定札捨て複合／リコレクト択一・ウィルス数スケール・WD22-036-G・WX25-CP1-002 他。

### 6.4 オープンな実装課題（機構・基盤）
- **F-3 効果バニッシュ経路（身代わり置換の execBanish フック）**：現状バトルバニッシュのみ対応。効果バニッシュ/バウンス等の場離れは未フック。対象: WX06-019（効果離場+powerReduction）／WX25-P1-056（非バニッシュ離場→バニッシュ置換）／WX17-075（`ON_PLACED_FRONT` 任意トリガー）。いずれも現状 no-op で無害。
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

**残る実機検証項目（これだけが未消化）**：
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
