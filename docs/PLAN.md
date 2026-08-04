# PLAN — 開発計画（統合版）

> **2026-07-03統合**：以前は「今後の予定」を決める文章が `P1_PLAN.md`／`ROADMAP.md`／`TODO.md` の3つに分かれていて分かりにくかったため、この1本の `PLAN.md` に統合した。旧3ファイルは削除済み（内容はすべてここに移した）。
> **3人は同時に作業せず、順番に push / pull で引き継ぐ（バトン式）**。新セッション（cold start）は **本ファイル §4「現在地とバトン」→ `DESIGN.md`** の順に読む。
> 個別の修正記録は [BUGFIXES.md](./BUGFIXES.md)（新しいものを上に追記）。**原文照合の主軸ツールは [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)**（実行結果の目視照合・LLM不使用・決定論）。補完的発見器は [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（LLM意味比較）。
> **消化済みバッチ・完了項目の詳細履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) に分離（2026-07-07）**＝本ファイルは「現在地・ルール・生きている worklist」だけを保つ。完了項目を増やしたら詳細は PLAN_DETAIL.md へ移し、ここには1行の ✅ サマリだけ残す。
> **2026-07-14 に再圧縮**（199KB→約77KB）＝§3 のタスク本文・§7 の実機PASS記録・§4 の census 計測履歴・§6 の完了機構メモを PLAN_DETAIL.md へ退避し、**§3 は「生きているタスクの表」＋Opusタスク12 の在庫表だけ**にした。**タスクは §3 の表から取り、経緯を知りたいときだけ PLAN_DETAIL を開く。**
> **2026-08-02 に再々圧縮**（185KB→約110KB）＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ ①§3 在庫表の残0クローズ行〔(lxix)(lxxi)(lxxii)(lxxiv)(lxxix)(lxxx)＋(lxi)ほかの完了まとめ〕②§4 恒久指標の計測履歴48行 ③§3 タスク16（🏁残0クローズ）④§5c の凍結 worklist ⑤§6.2・§6.3 の完了行 を退避。**§4 の指標は「最新1行だけを置き、旧行は PLAN_DETAIL の同節先頭へ移す」入れ替え式**（進捗サマリと同じ運用）。

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
| 14 | 🏁**完了**（2026-08-03・続き333）リファクタ Stage2→Stage3 純粋バトルコントローラ | BattleScreen構造 | — | ✅Stage2＋永続化移行（全行 I/O 120箇所を `persist` へ）＋**reducer 純粋化＝`persist.commit` 118/118 が `reduceBattle` 経由**（18 action）。残テール (a)(b)(c)(d) すべて残0。設計・**定形13** ・新規ハンドラを書くときの手順は `docs/BATTLE_CONTROLLER.md`。⚠**残タスクは §7 実機通し確認のみ**（ハンドラ側 payload 構築は golden 非カバー＝純粋関数しか見ない）。ここから派生しうる次段（任意・未着手）＝①`BattleScreen.tsx` 本体のフェイズ別ハンドラ分割（今回の純粋化では不要と判明＝**やるなら可読性目的**）②reducer の action 単位テストをさらに厚くする |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |

> **✅消化済のタスク（1〜9・11・16〜19）は 2026-07-29／2026-08-02 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節（1〜9・11・17〜19）と「2026-08-02 整理②」節（16＝timing 語彙センサス 🏁残0クローズ）。生きているのは上表の **12〜15** のみ。

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。**下表は残作業のある在庫のみ**。消化済み在庫〔(i)〜(lvi) の大半〕の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19・2026-07-24・2026-07-28・**2026-07-29**の各退避節〕。直近クローズ＝**(xliv) `BANISH_REDIRECT` 残テール**と **(xlii) `GRANT_LEAVE_PLACE_PENDING` 残2枚**は 2026-07-29 に残0で完全クローズ〔詳細 BUGFIXES 2026-07-29節〕）：

| ID | 内容 |
|---|---|
| (cii) | **🆕 CPU自動応答のCHOOSEはcostColors付き'pay'選択肢を選んでも常に「コスト支払いエラー: エナ不足」で空振りする（2026-08-04・§7実機検証(a)対照実験で発見・(ci)とは別バグ）**＝`BattleScreen.tsx:522-530`（`isCpuBattle`のCHOOSE自動応答）は `selected = [firstAvail.id]` と**選択肢IDだけ**を積み、支払いに使うエナカードのinstanceIdを一切付与しない。しかし `handleEffectInteraction`（`BattleScreen.tsx:4596-4604`）は costColors 付き選択肢を `resumeOptionalCost`／`resumeOpponentPayOptional`（`effectExecutor.ts:6475`/`6538`）へ渡す際 `energyNums = selectedOrChoiceId.slice(1)` で2要素目以降をエナIDとして読む＝CPU応答は常に `energyNums=[]`。両関数とも `costColors.length > 0` なら`done(addLog('コスト支払いエラー: エナ不足'))`で**即終了**（cost未消費・`then`/`action`も未実行）＝CPUがエナを十分持っていても「支払う」を選んだ瞬間に何も起こらず終わる。**続き289で発見・修正されたのは同根だが別経路**（人間側UIが `id==='pay'` 以外の新option idで通常CHOOSEボタンにフォールバックしたケース）＝**CPU自動応答の恒常的な欠落は今回が初検出**。影響範囲＝`OPPONENT_PAY_OPTIONAL`のcostColors搭載35効果（CPUが対戦相手として支払う場面）＋CPU自身が効果オーナーとして任意コストcostColorsを支払う場面全般。**再現＝`node scripts/verifyBattleDrive.mjs oppPayEnergySufficient`**（WX25-P1-038・guest energy 3枚で「無×3」を払えるはずが不発＝gEnergy不変・banishも不発のまま`pEff`が黙って解消）。**修正方針＝CPU自動応答（`BattleScreen.tsx`のCHOOSE分岐）がcostColors付き選択肢を選ぶ際、`ctx.otherState.energy`／`ownerState.energy`から`costColors`を満たす実在エナIDを機械的に選出してselectedへ追加する**（human側の`optcost-energy-N`UIが人力でやっている選出をCPU版として実装するだけ＝新規機構ではない）。 |
| (ci) | **🆕 `OPPONENT_PAY_OPTIONAL` の costColors 無し STUB で「支払う」がタダで常時 available（2026-08-04・§7実機検証(b)着手中に発見）**＝`effectExecutor.ts:3333` の `options` 配列先頭に `{id:'pay', ..., available: canOppAfford}` を**無条件**で積むが、`costColorsOPO`（=`stub.costColors ?? []`）が空のとき `canOppAfford = costColorsOPO.length===0 || ...`（`effectExecutor.ts:3315-3316`）で**常に true**＝コスト0で選べる「支払う」が生まれる。カード原文が「〜を支払わないかぎり」で回避手段が手札捨て/エナトラッシュ等**のみ**（costColors非搭載）の場合、本来存在しないはずの無料回避枝が追加され、CPU自動応答（`options.find(o=>o.available) ?? options[0]`・`BattleScreen.tsx:522-530`）はこれを最優先で選ぶため、意図した discard/energyTrash 枝も skip（本体発動）も実質到達しない。effects JSON 全体で `OPPONENT_PAY_OPTIONAL` 68効果中 **33効果**（約半数）が costColors 非搭載＝影響範囲は広い（機械カウント：`node -e`でJSON走査・costColorsキー欠落を検出）。代表＝`WX25-P1-040-E1`（手札3枚捨てないかぎりバニッシュ）／`WX24-P1-023-E1` 内側ゲート／`WX22-025-E3`／`SPDi43-02-E1`／`WX24-P4-023-E3` 等。**修正方針＝'pay' オプションを `costColorsOPO.length > 0` のときだけ配列へ積む**（handSpec/enSpec 等の既存3枝と同じ条件付きspread化にする＝新規機構ではなく既存パターンへ揃えるだけ）。§7実機検証(b) WX25-P1-040 のシナリオ実行でCPUが常に無料 pay を選び discard 枝の available:false 検証に到達しないことを確認 |
| (lv) | **残＝未配線2経路**（原票 `WXEX2-71-E2` と共通機構、人間グロウ／COLLAB／アシスト配置は✅2026-07-29 に消化）＝**③CPU シグニ召喚 ④CPU グロウ**。いずれも「CPU は任意効果を発動しない」を明示据え置き中。**着手するなら「CPU に任意効果をどう選ばせるか」の方針決めが先**（黙って無条件発動にするのは COLLAB と同じ過剰実行になる）。詳細 BUGFIXES 2026-07-29 (lv) 節 |
| (xcvii) | **🆕 場離れ置換チェーンの呼び出しが経路ごとに不揃い（2026-08-04・(xcv) 実装中に観測）**＝離場11経路のうち `execSendToEnergy`（`effectExecutor.ts` のエナ送り）だけ `applyEffectLeaveLrigAbilitySubstitute` を**呼んでいない**（他10経路は lrig→power→banish の順で呼ぶ）。「代わりにこの能力を失う」で場離れを肩代わりする札が、**エナ送りに対してだけ効かない**。⚠(xcv) では**意図的に触らなかった**＝未検証の挙動変更を1バッチに混ぜないため。**着手＝まず原文で「エナ送りも肩代わり対象か」を確認**してから（対象は `EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY` を持つ札）。ついでに**11経路の3〜4本呼び出しを1本の入口へまとめる**と、今後の置換手段追加で経路漏れが起きなくなる（(xcv) では追記方式にしたので4本目が11箇所に散っている） |
| (xcvi) | **🆕 `ArtsModal` Phase2 の `applySpecificCardCostReduction` 二重適用（2026-08-04・(xcii) 実装中に発見／⚠現状は休眠）**＝`ArtsModal.tsx:187` は `rawEffectiveCost` に同軽減を適用するが、その値の出所である `pendingArtsEffectiveCost` は Phase1（同 `:71`）と `getMyLrigDeckCardActions` の**両入口で既に適用済み**＝**2回引く**。⚠**ベット置換値（`betReplacedCost`）と印刷コストは未適用なので、単純に消すと今度はベット経路が損をする**＝「raw の出所が `pendingArtsEffectiveCost` のときだけ飛ばす」形にすること。**今日は対象アーツが0枚なので無害**（`SPECIFIC_CARD_COST_REDUCE` の実測対象2枚はどちらもスペル）＝**将来アーツが対象になった瞬間に静かに安くなりすぎる**時限バグ |
| (xciii) | **🆕 持続する「次に使用する〜が安くなる」＝5枚（2026-08-03・(xc) の全数分類で確定）**＝`WX10-004`／`WX10-005`／`WX10-022`／`WX11-018`（**【チェイン】**＝このターン次に使うアーツの使用コストが2色ぶん減る）と `WX10-073`（次のスペルが《無×2》減る）。**コスト算出の regex ではなく状態が要る**＝スペル側には既に `PlayerState.next_spell_cost_reduction` があるので、**アーツ版の状態フィールドを足して使用時に消費する**のが筋。⚠発生源側（【チェイン】を宣言するアーツの解決）で状態を立てる配線とセットで実装すること |
| (xciv) | **🆕 コスト軽減の長テール＝約20枚（2026-08-03・(xc) の全数分類で確定）**＝複数条件の合成（`WX08-026` は同一文で増＋減／`WX12-013` は2条件の重ね／`WX12-049` は色別2条件）、`WX12-056`（トラッシュにある**同名カード**1枚につき）、`WX15-060`（**アクセされている**＜調理＞1体につき）、`WD16-006`（自分と相手の**手札差**1につき）など**1枚ずつ形が違う**。⚠**クラスタ化できない＝費用対効果が低い**ので、(xcii)(xciii) が済んでから。母集団の出し方は BUGFIXES 2026-08-03 (xc) 節の分類手順に従うこと |
| (lxxxviii) | **🆕 ベット分岐が JSON 側に無い札（2026-08-03・(lxxxiv) 実装中に観測）**＝ベット宣言できるようになっても**変わる先の枝が無い**3枚＝`WX19-006`／`WDK12-007` は action が `STUB BET_MECHANIC`、`WD21-007` は `STUB GRANT_QUOTED_AUTO_ABILITY`。加えて**「あなたがベットしていた場合、代わりに2つ(まで)選ぶ」は `betChoose` で表せる**のに `WX19-006`／`WDK12-007` は持っていない（engine は `effectExecutor:3754` で `a.betChoose` を読む＝**受け皿はある**）。⚠**カットイン固有ではない**＝メインフェイズ経由でも同じく不発なので、母集団は「ベット持ち68枚」全体で数え直すこと（`IS_BETTING`／`betChoose`／`BET_CONDITION` のいずれも持たない札を機械抽出するのが入口） |
| (c) | **🆕 `ON_TARGETED` の同居問題（2026-08-04・(lxviii) の turnOwner 部分だけ閉じたので繰り越し）**＝①`WXDi-P13-089-E2` の本体が原文「そのシグニを**ゲームから除外**する」なのに JSON は `TRASH{TRASH_CARD}`（除外でもシグニでもない二重ズレ・逆翻訳も「対戦相手のを1枚トラッシュに置く」と主語が欠落）②`WXDi-P03-056-E1`／`WXDi-P13-089-E2` の「**その**対戦相手のシグニ」＝**対象化した側と同一のシグニ**を指す origin 同一性が未配線。⚠**1カード監査でまとめて見るほうが早い**（`/audit-card WXDi-P13-089`） |
| (lxvi) | **🆕 タスク12(lxv) の据置2枚（2026-07-31）**＝いずれも本バッチと無関係の既存ドリフトが同居していて、採用すると別の損失が出るため honest defer。①`WX24-P3-057-E1`＝「あなたか対戦相手のデッキの上からカードを３枚トラッシュに置く」の **`CHOOSE`（自分/相手の選択）を fresh が持っていない**（curated のみが持つ）②`WX26-CP1-101-E1`＝条件節に居た ＜プリオケ＞ が `GRANT_KEYWORD` の対象フィルタから落ちる（条件節を切り出す構造上の副作用＝**ゲートは得るがフィルタを失う両損**）。詳細 BUGFIXES 2026-07-31 (lxv) 節 |

> **✅2026-08-04（続き341〜346）に残0クローズした6件＝(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix)**（相手盤面参照のコスト軽減8枚／「能力を持たない」判定の統一／CPU ターンの境界トリガー279効果／CPU のターン開始ドロー／散文形「対戦相手のターンの間、」の過剰実行／主語なしアタック watcher の scope）。**完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-04 整理」節へ退避**。一次記録は `BUGFIXES.md` 2026-08-04 の各節。
> **✅残0クローズ済みの在庫の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) の各整理節へ退避**＝**🆕(lxxxi)〔使用コストの条件つき置換＝2026-08-03 に 続き334＋335 の2セッションで残0クローズ。一次記録は BUGFIXES 2026-08-03 の2節〕**、**🆕(lxxxiv)〔スペルカットイン経路のベット宣言UI＝2026-08-03 続き336 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(xci)〔カード名指定の《無》軽減がスペル使用モーダルに無かった＝2026-08-03 続き340 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(lxxxv)＋(lxxxix)〔使用時の任意支払いによるコスト軽減＝2026-08-03 続き337 で 31枚・続き338 で 場のシグニ払い2枚を追加し**残0クローズ（計33枚）**。残3枚は別機構/別意味で対象外。一次記録は BUGFIXES 2026-08-03 の先頭2節〕**、**🆕(lxxxvi)＋(lxxxvii)〔スペル本体のベットの `ON_COIN_PAID` 配線／カットイン窓のコスト算出をアーツ経路と同じ機構へ＝2026-08-03 続き339。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(xci)〔カード名指定の《無》軽減がスペル使用モーダルに無かった＝2026-08-03 続き340 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、「2026-08-02 整理③」節に (lxx)／(lxxviii)／(lxxxii)〔第3〜6波の追記込み〕／(lxxxiii)**、「2026-08-02 整理②」節に (lxix)(lxxi)(lxxii)(lxxiv)(lxxix)(lxxx)＋(lxi)〔支払い回避クローズ全11波〕(lxxiii)(lxxv)(lxxvi)(lxxvii)。一次記録は BUGFIXES 2026-07-30〜08-02 の各節。⚠**残す教訓**＝(a) engine の回避手段語彙は7系統＝新しい回避手段はそこへ足す／「AかB合計N枚」は2枝に割らず単一プールの候補型で表す (b)「読めた」は「正しい」ではない＝文型 regex は巻き込む。規則を足したら `build:effects` で held 増分と live per-effect 差分を必ず見る (c) 収集経路の無い timing を足すと過剰実行を no-op へ替えるだけ＝collector とセットで。

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 79件まで消化済（(a)(b)(c)＋oppDrawOwnEffectOnly＋続き173/174＋`resonaMainWx08021`〔続き263・レゾナ召喚UI MAIN〕＋`oppPayEnergyInsufficient`/`lbOwnerReversal`/`sequenceContinuationAcrossGate`〔2026-08-04〕）。**残作業は §7「残る実機検証項目」が単一の worklist**＝ここには重複を書かない（2026-07-30 に §4 進捗サマリと二分していたのを §7 へ集約）。**✅2026-08-04＝タスク12(lxi) 本消化5件のうち(a)(b)(d)(e)を実機検証完了**（(c)併記型はlive実例0件のため据置）。**(a)(b)の検証中に新規実バグ2件を発見・Opusタスク12(ci)(cii)へ登録**＝(ci)costColors非搭載のOPPONENT_PAY_OPTIONALが無料pay枝を無条件生成／(cii)CPU自動応答がcostColors付きCHOOSEでエナinstanceIdを渡さず常に空振り。**次の最優先＝§6.3 H／I′ の5件**（ガード追加《無》N枚徴収／`WDK14-013-E1` 候補ピッカー／メルト・ファクトの支払い前ウィルス除去／夢限 -Q- 反転／未知の邂逅の無料グロウ）。経緯は PLAN_DETAIL §3 |
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
- **🆕 セッション（2026-08-04・続き346・Opus 5〔**Claude 単独：実装・検証・簿記**〕）＝🏁**§3 タスク12(xcix) 残0クローズ**＝主語なし「シグニ１体がアタックしたとき」が `self` に潰れて相手のアタックに反応できなかったのを是正（ユーザー指示「タスク12を続ける」）。golden **1363→1366**・**live は3効果のみ変更**・census 1288 据置・同型★0・held 257枚 据置・全ゲート緑。
  - **母集団は登録時の1件ではなく3効果**＝`WXDi-P06-033-E2`（アイコン形《相手ターン》）／`WXDi-CP02-053-E1`（散文形）／`WXEX2-04-E1`（前置きなし）。いずれも原文の主語が「シグニ1体が」なのに `triggerScope` 既定 `self` へ潰れており、**「このシグニがアタックしたとき」と同義**になっていた。⚠`WXDi-P06-033-E2` は `turnOwner` が正しく付いているぶん**自分のアタックでは `turnGateOk` に落とされ、相手のアタックでは収集されない＝実質どちらでも発火しない**状態だった。
  - **🔴 着手時の見立て「collector が turnOwner を見ていない」は誤りで、golden が捕まえた**＝`collectFieldTriggers`（ally/opp 両分岐）と BattleScreen のアタッカー自身経路にゲートを足したところ、**既存 golden 2件**（`Stage2 ON_PLAY field: any_opp …`／`WXK10-022-E1 の turnOwner:self は収集後段の turnGateOk で正しくゲートされる（PLAN §7 R30②検証）`）が落ちた。**正しい設計＝ターン限定は `effectStack.turnGateOk` が `initStack`／`pushToStack` で全コレクタ共通に評価する**（`entry.playerId`＝watcher の持ち主基準）。collector 側は**トリガー元**視点なので watcher 基準とズレて二重ゲートになる。⇒ 追加ゲートは全て差し戻し、3箇所に「ここで見ない・担当は turnGateOk」のコメントを残した。**残った本当のバグは `triggerScope` だけ＝parser のみの修正**で閉じた。
  - **golden +3**＝①3効果が `triggerScope:'any'`／ターン限定は2枚だけ（前置きの無い札に付けない）②scope:any で相手のアタックが watcher に収集され、`initStack` に通すと相手ターンでは残り自ターンでは落ちること ③母集団3効果の固定。逆翻訳も「いずれかのシグニがアタックしたとき」＋《相手ターン》になった。
  - **次の一手**＝**Opus**＝タスク12 の生き残り在庫〔(lv) 残2経路／(lxvi)／(lxxxviii)／(xciii)／(xciv)／(xcvi)／(xcvii)／(c)〕・(lxxxii) 由来の別在庫4件（PLAN_PROGRESS の続き331 行）・§6.3 機構台帳。**Sonnet**＝§7 実機検証＝**続き298〜346 の全件が実機UI未検証**。本件の実機確認は**①`WXDi-P06-033` を場に置き、相手のシグニがアタックしたときに《ターン1回》で能力を失わせること**②自分のシグニがアタックしても発火しないこと③`WXEX2-04` がどちらのアタックでも配置し直しを提案すること。
### 📊 恒久指標（最新1件のみ・履歴は PLAN_DETAIL）

- **🆕 2026-08-04 続き346（🏁§3 タスク12(xcix) 残0クローズ＝主語なしアタック watcher の scope 是正）後 最新値（本行が直近の正）**：golden **1363→1366**（+3＝①3効果の `triggerScope:'any'` とターン限定の有無 ②scope:any での収集＋`initStack`／`turnGateOk` の残存・除外 ③母集団3効果の固定）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0（265群）、held **257枚／109群 据置**。**live per-effect 差分＝changed 3／added 0／removed 0**（`WXEX2-04-E1`／`WXDi-P06-033-E2`／`WXDi-CP02-053-E1` の `triggerScope:'any'` 追加＋後者2枚の `turnOwner`）。**新語彙0本**＝`triggerScope:'any'` も `turnOwner` も既存で collector/`turnGateOk` も対応済み＝**parser が生成していなかっただけ**。⚠**ターン限定を collector に足してはいけない**（`effectStack.turnGateOk` が担当。足すと二重ゲートで既存効果が落ちる＝本セッションで実際に golden 2件が落ちて差し戻した）。
- **2026-08-04 続き345（🏁§3 タスク12(lxviii) 残0クローズ＝散文形「対戦相手のターンの間、」の過剰実行是正）後の値**：golden **1360→1363**（+3＝①対象2枚の相手ターン発火／自ターン非発火〔origin 付き〕②本文側4枚に turnOwner を付けないこと③母集団の固定〔前置き AUTO 30件・未ゲート1件〕）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0（265群）、held **258→257枚／109群**。**live per-effect 差分＝changed 2／added 0／removed 0**（`WXDi-P12-074-E1`／`WXDi-P13-089-E2` の `turnOwner` 追加のみ）。**新語彙0本**＝`triggerCondition.turnOwner` は既存フィールドで collector も対応済み＝**parser が生成していなかっただけ**。逆翻訳差分は `decompile_sheet8` の当該2行のみ。
- **2026-08-04 続き344（🏁§3 タスク12(xcviii) 残0クローズ＝CPU のターン開始ドロー処理の統一）後の値**：golden **1357→1360**（+3＝①CPU＝guest のターンドローでの `ON_DRAW` 収集と `playerId` ②`drawBySourceStory` の残値あり発火／クリア後 非発火 ③`ON_DRAW` の live 母数13）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（**新語彙0本**）＝触った層は `BattleScreen.tsx` の CPU UP 分岐のみ。⚠**CPU 経路の配線とリフレッシュ回数リセットは golden 非カバー**＝実機通し確認と対で締める。
- **2026-08-04 続き343（🏁§3 タスク12(lxvii) 残0クローズ＝CPU ターンのフェイズ/ターン境界トリガー統一）後の値**：golden **1354→1357**（+3＝①CPU＝guest をターンプレイヤーとした6 timing の pure collector 戻り〔entries の `playerId`・人間側 usageLimit 不消費〕②CPU ターンでの `any_opp` watcher 発火と解決主体 ③**影響母数の固定**〔`ON_TURN_END` 187／`ON_ATTACK_PHASE_START` 非 self 57／`ON_MAIN_PHASE_START` 31／`ON_TURN_START` 3／`ON_LRIG_ATTACK_STEP_START` 1／`ON_GROW_PHASE_START` 2〕）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（**新語彙0本**・`BattleAction` も 18種のまま）＝触った層は `BattleScreen.tsx` のみ（`collectCpuTurnTriggers` 新設＋CPU 5経路への配線＋【ハスターリク】の side 是正＋当該遷移を `SET_TURN_PHASE`→`ADVANCE_TURN_WITH_STATE`）。⚠**CPU 経路の配線は golden 非カバー**＝固定できるのは pure collector の戻りと母数まで。**実機通し確認と対で締める**。
- **2026-08-04 続き342（🏁§3 タスク12(xcv) 残0クローズ＝「能力を持たない」判定の統一）後の値**：golden **1350→1354**（+4＝①`WXEX2-30` の場離れ置換〔バニッシュ/手札戻し/トラッシュ/エナ送り/除外/デッキ戻しの6経路・能力持ちは素通り・メインフェイズでは不成立・宣言者不在・victim が自分側でも成立・`abilities_removed`〕②`ABILITY_CHECK_ELSE_TRASH` の「それ」＝直前 BOUNCE が戻したカード／**効果元シグニが場に残ること**＝旧バグの再発検知／対象なしで盤面不変 ③live 母集団の内訳固定〔STUB 3枚・条件形2枚・宣言1枚〕④**マルチエナ持ちを「能力なし」に倒さないこと**を条件側・置換側の両方で）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（ローカル248は未追跡の残置 `scripts/_dbgFresh.ts` の3件ぶん）、manual field loss 0、同型★0（265群）・held **258枚／109群 据置**（**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**＝engine の action/condition 型は増えていない）＝触った層は `execUtils`（`hasNoAbility` 新設＋`LAST_PROCESSED_HAS_NO_ABILITIES` の委譲）・`execStubPart2`（STUB 2件）・`effectExecutor`（置換1本＋離場11経路への配線）。⚠**修正前は3箇所とも常に no-op**＝計器には一切映っていなかった（smoke も census も緑のまま）＝**実機確認と対で締める**。⚠`docs/STUBS.md`／`grouped_all.txt` の差分には 2026-08-01 以降の未再生成ぶん（続き333〜341 由来）が含まれる。
- **2026-08-04 続き341（🏁§3 タスク12(xcii) 残0クローズ＝相手の盤面を参照するコスト軽減8枚）後の値**：golden **1346→1350**（+4＝①相手の場を数える軽減〔凍結2体・**シグニ不在ゾーンの凍結フラグは数えない**・【ウィルス】2つ・素のシグニと能力持ちの区別・`abilities_removed`〕②合算形の自分側/相手側/両方0と累積形の3状態③相手コイン枚数とライフ枚数比較〔多い/同数/少ない/**相手状態が無ければ減らさない**〕④**相手盤面フルの全数走査＝アーツ/スペル/ピース1236枚のうち動くのは8枚だけ**を期待コスト文字列まで固定）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**（⚠ローカルで248に見えるのは**未追跡の残置ファイル `scripts/_dbgFresh.ts`（3件）**が混じるため＝ベースライン commit の worktree で実測して245を確認済み。本作業の増分は**0**）、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `costs.ts`（`CostReplaceCtx.oppState` の型拡張＋規則5本）と `BattleScreen.getMyLrigDeckCardActions`（実効コスト算出を `ArtsModal` Phase1 と同式へ統一）のみ。⚠**コスト表示・請求は golden 非カバー**（純関数 `computeArtsEffectiveCost` までは固定済み）＝実機確認と対で締める。
- **2026-08-03 続き340（§3 タスク12(xc) 37枚実装＋🏁(xci) 残0クローズ）後の値**：golden **1343→1346**（+3＝①新規規則が**条件成立時だけ**効くこと〔A/D/C/E/H の成立・不成立の対、既存 ＜クラス＞規則の回帰、`SP36-001` の3状態〕②**過剰適用ゼロ**の全数走査〔アーツ/スペル/ピース 1236枚を空盤面で走査し0枚〕③(xci) の対象2枚が実在しスペルであること＋対象名以外/カード名不明/発生源不在では何もしないこと）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・**新語彙0本**）＝触った層は `costs.ts`（規則6本追加＋既存2本の是正＋`applySpecificCardCostReduction` 新設）と3モーダルの呼び出しのみ。⚠**コスト表示・請求は golden 非カバー**（純関数 `computeArtsEffectiveCost` までは固定済み）＝実機確認と対で締める。
- **2026-08-03 続き339（🏁§3 タスク12(lxxxvi)＋(lxxxvii) 残0クローズ）後の値**：golden **1341→1343**（+2＝①ベット持ちスペル7枚の母集団固定〔`ON_COIN_PAID` 収集自体は BattleScreen 層＝非カバー〕②場の CONTINUOUS 軽減が効くべきカットインアーツ3枚＋青以外は効かないこと）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0・held **258枚／109群**（いずれも前回据置＝**parser も JSON も触っていない**）。**live JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）＝触った層は `CutinModal`（`artsBaseCost` 追加）と `castSpell`（`collectCoinPaidTriggers` 追加）のみ。⚠**コスト表示とコイン反応の発火順序は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き338（🏁§3 タスク12(lxxxix) 残0クローズ＝使用時の任意支払い「場のシグニをトラッシュ」2枚）後の値**：golden **1339→1341**（+2＝①場のシグニ払いの後始末〔2ゾーン払いで下のカード・チャーム→トラッシュ／ソウル→ルリグトラッシュ／ダウン・凍結フラグのリセット／選んだゾーンだけ空く／ダウン中でも候補／`WX25-P1-110` のクラス・レベルフィルタ〕②`QUEUE_SPELL` の `effectStack` 指定時のみ `effect_stack` を書く。併せて (lxxxv) の3テーブルを 31→33 へ更新）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings 据置**、manual field loss 0、同型★0、held **257枚／109群 → 258枚／109群**。**live per-effect 差分＝changed 2／added 0／removed 0**（2枚とも「先頭1本除去のみ」で完全一致＝相乗りドリフトなし）。**新語彙 0本**＝engine の action/condition 型は増えていない（`BattleAction` も 18種のまま＝`QUEUE_SPELL` の payload 拡張のみ）。⚠**支払いUI・離場トリガーの発火順序は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き337（§3 タスク12(lxxxv)＝使用時の任意支払いによるコスト軽減 31枚）後の値**：golden **1334→1339**（+5＝①対象31枚の spec と軽減後コスト〔支払い元・上限・比例/固定・1枚時・上限時・0枚時の据え置き〕②除外5枚を読まないこと〔理由つき〕③固定形の「ちょうどN枚」境界と候補フィルタ④**5ゾーンすべての支払いが盤面を正しく動かすこと**⑤**31枚の解決中の支払いステップが live から落ち、かつ本体ステップが残っていること**＋据え置き2枚の先頭は不変）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**245 warnings**（+5＝新規2ファイル分）、manual field loss 0、同型★0、held **259枚／110群 → 257枚／109群**。**live per-effect 差分＝changed 31／added 0／removed 0**（29枚は「先頭1本除去のみ」で完全一致・残2枚は採用に相乗りした既存ドリフトで `WX07-024` は純増）。**新語彙 0本**＝engine の action/condition 型は増えていない（UI 層の純関数モジュール `useTimeCost.ts` を新設し、parser は先頭ステップを落とすだけ）。⚠**支払いUIとコスト再計算は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き336（🏁§3 タスク12(lxxxiv) 残0クローズ＝スペルカットインのベット宣言UI）後の値**：golden **1333→1334**（+1＝`FINISH_CUTIN` の `effectStack` 指定時のみ `effect_stack` を書く〔省略＝不干渉は既存2件が保証〕。併せて既存のコスト置換テストに**対象8枚の `parseBetOptions` 段階＋`Timing` にカットインを含むこと**と `WX17-019` のベット時《青×0》を追加＝**ベットUIの枚数ボタンはこの options から出る**ので空になれば落ちる）、census **1288 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**＝`BattleAction` も 18種のまま〔`FINISH_CUTIN` の payload 拡張のみ〕）。触った層＝`CutinModal`／`useCutin`／`handleCutinUse`／`battleController`。⚠**ベットUIと支払い配線は golden 非カバー**（BattleScreen/モーダル層）＝実機確認と対で締める。
- **2026-08-03 続き335（🏁§3 タスク12(lxxxi) 残0クローズ）後 最新値**：golden **1331→1333**（+2＝`SET_CARD_COST_REPLACEMENT` の engine 書き込み〔クラフト追加との順序・置換後コスト・**同名再設定の後勝ち**〕と UI 読み取り〔別カード名には効かない〕／任意支払い2枚の仕様・未払い/支払い済み・**多色シグニのバックトラック**・境界〔1枚/3枚/クラス違い〕・**母集団は実測2枚だけ**・**先頭 `OPTIONAL_COST` が live から落ちていること**）、census **1289→1288**（`コスト:《コイン》` に《コイン×0》較正を追加＝STUB を実アクション化して表に出た偽陽性の是正。**`BASELINE_HIGH - 2` の暫定オフセットも解消**＝ゲート値は `BASELINE_HIGH` そのもの）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群**（`WXK03-002` 採用で元に戻った）。**live JSON の変更は全5ファイルで3カードのみ**＝`WXK03-002`（heldReview 採用）／`WX21-035`・`WX21-071`（MANUAL＝PRESERVE 保護のため**外科パッチ**）。**新語彙 1本＝`SET_CARD_COST_REPLACEMENT`**（＋`PlayerState.card_cost_replacements`）。⚠**支払いUI（`SpellCastModal` の任意支払い）とコスト算出は golden 非カバー**＝実機確認と対で締める。
- **2026-08-03 続き334（§3 タスク12(lxxxi)＝使用コストの条件つき置換）後 最新値（本行が直近の正）**：golden **1330→1331**（+1＝`computeCostReplacement` のベット9枚〔宣言前 null／宣言後の置換値〕・`WX09-Re02` の4状態〔未使用／アーツのみ／スペルのみ／両方＝《白×0》〕・`WX05-038` の場の有無・`WD22-041-UG` の24/25枚境界・`computeArtsEffectiveCost` 経由・**既存「対戦相手ルリグ色」経路の回帰**）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**＝engine の action/condition 型は一切増えていない）。触った層＝`src/screens/battle/costs.ts`（新関数1本）＋`ArtsModal`／`SpellCastModal`／`BattleScreen.getCardActions` のコスト算出呼び出し。⚠**コスト算出は UI 層＝golden から叩けるのは純関数 `computeCostReplacement` までで、モーダルのベット宣言→再計算→支払い検証の配線は非カバー**＝実機確認と対で締める。
- **2026-08-03 続き333（🏁§3 タスク14 完了・5バッチ）後 最新値（本行が直近の正）**：golden **1326→1330**（+4＝`SET_TURN_PHASE` の状態/スタック任意〔キー集合＋null 明示クリア〕／`WRITE_STATE.markCutinResponseComplete`〔既存フィールド温存・**盤面側を書き換えない純粋性**・省略時はキー無し〕／`WRITE_STATES` の片側・両側・スタック省略・空 states／`RESOLVE_EFFECT_STEP.beginNextTurn` のキー集合・`turn_count` 現盤面+1・省略時はターン関連キー無し）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（BattleScreen 構造のみ＝`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）。**reducer 経由 102/117→118/118（＝残0）・`BattleAction` 17→18種**（+`WRITE_STATES`。`SET_TURN_PHASE`／`WRITE_STATE`／`RESOLVE_EFFECT_STEP` は payload 拡張）。⚠**ハンドラ側の payload 構築は golden で検出できない**（golden は純粋関数のみ）＝**この作業は実機通し確認と対で締める**。
- **2026-08-03 続き332（§3 タスク14 Stage3・5バッチ）後の値**：golden **1317→1326**（+9＝`RESOLVE_EFFECT_STEP` 4本〔継続/完了・settle の3分岐・スペル解決のキー集合・**新スタックが settle に勝つ順序**〕／`BEGIN_NEXT_TURN` 2本〔`turn_count` +1・**追加ターンは `active_user_id` を書かない**〕／`ADVANCE_TURN_WITH_STATE` の opp/effectStack 任意／`WRITE_STATE` の条件式 undefined／`RESOLVE_JANKEN` の勝敗・あいこ非対称）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **259枚／110群 据置**。**parser/effects JSON は完全不変**（BattleScreen 構造のみ＝`public/data/` に差分なし・live per-effect changed 0・**新語彙0本**）。**reducer 経由 72/117→102/117・`BattleAction` 14→17種**（+`BEGIN_NEXT_TURN`／`RESOLVE_EFFECT_STEP`／`RESOLVE_JANKEN`）。⚠**ハンドラ側の payload 構築は golden で検出できない**（golden は純粋関数のみ）＝**この作業は実機通し確認と対で締める**。
- **2026-08-02 続き330 第6波後の値＝🏁(lxxxii) 再クローズ**：golden **1312→1317**（+5＝①「Mつまで＝upTo／Mつ＝upTo無し」の両方向 ②`WX20-007-E1` の前置2本保持＋CHOOSE 3択 upTo＋③の suppressOnPlay ＆宙ぶらりん BLOCK 不在 ③採用5効果の choose_count/from_count/upTo とコスト減 marker 保持 ④`WXK08-003-E1` ③の OR ゲート ⑤curated 直書き4件と MANUAL 外科パッチ2件の upTo）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **264枚／115群 → 259枚／110群**。live per-effect 差分＝**changed 44／added 0／removed 0／outlier 0**（内訳＝**upTo 追加のみ 38**〔機械検証＝`upTo` を剥がすと before と完全一致・それ以外の変化 0〕＋**構造復元 6**〔held 5枚＋`WX20-007`〕）。**新語彙 0本**＝`ChooseAction.upTo` も `ARTS_USED_THIS_TURN`／`SPELL_USED_THIS_TURN`／`OR` も**すべて既存**で、engine/UI も対応済みだった（`effectExecutor.ts:3731`／`EffectInteractionModal.tsx:509,524,967`）＝**parser が語彙を生成していなかっただけ**。⚠**「parser を直した」＝live に届いた、ではない**＝curated 直書き上書き（`STATE_COND_BATCH4_ACTIONS`）と MANUAL の PRESERVE 保護の2群は parser 修正が無効なので、**毎回 live を実測してから件数を締める**。
- **2026-08-02 続き330 第5波後の値**：golden **1311→1312**（+1＝`PR-Di013-E1` を **`manualEffect()` 経路と JSON 生読み経路の両方**で同一検証。スペルの発生源を `field.check` に置き、**①選択直後は手札不変／ルリグアタック時に初めて1枚引く**という即時実行と能力付与を区別する assert、`once_per_turn`、2回目不発火、ターン終了時消滅、支払い時 count=2／未払い時 count=1、2枝同時選択で両方付与、フラグ消費まで固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0、held **264枚／115署名 据置**。live per-effect 差分＝全5ファイルで **changed 1（`PR-Di013-E1`）**／added 0／removed 0／outlier 0。**新語彙 1本＝`CHOOSE.additionalCostChoose`**（保持効果は live 全数で1件。engine 変更はすべて同フィールドのガード内＝既存 CHOOSE・既存 `OPTIONAL_COST` は分岐に入らない）。⚠**PRESERVE 保護カード（既存 JSON が MANUAL/PARTIAL）は `manualEffects.ts` を書いても JSON に出ない**＝外科パッチが要る（第5波の差し戻し理由）。
- **2026-08-02 続き330 第4波後の値**：golden **1308→1311**（+3＝`WD23-044-EA-E1` の支払/未払 2分岐と両枝の盤面効果／`WX26-CP1-024-E1` の支払時 count=2・未払時 count=1／⛔完動2件の現状固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（265群）、held **264枚／115署名 据置**。**生成 JSON は完全不変**（engine-only＝`public/data/` に差分なし・live per-effect changed 0）。**新語彙 0本**。
- **2026-08-02 続き330 第3波後の値**：golden **1307→1308**（+1＝`WXK08-002-E1` のアーツ3択。**発生源を `field.check` に置いてアーツ実戦経路と揃え**、CHOOSE 1/3・前置 marker 保持・①③の**両盤面 JSON 完全一致 no-op**・②の両陣営候補/0-1-2体/3体拒否/合計10000超拒否を**実行で**固定。`withSavedCursor` 済み）、census **1289 据置**、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（265群）、held **265→264枚／116→115署名**（`WXK08-002` が MANUAL 化で抜けた＝**解決ではなく curated 固定**。⚠**残り6枚の採用禁止在庫**〔`WXK05-002`/`WXK05-004`/`WXK07-002`/`WXK08-001`/`WXK08-003`/`SPK01-14`〕は held に残存を確認済み＝触っていない）。live per-effect 差分＝**全5ファイル**で `changed 1`（`WXK08-002-E1`）／added 0／removed 0／outlier 0。`build:effects` 冪等（md5 不変）・生成 JSON の日本語健全（`???` 0）・regen 差分は sheet4 当該行のみ。**新語彙 0本**（engine は `totalPowerMax` の `count` 反映＋`resumeSelectTarget` の上限 slice のみ＝既存4件は `count:"ALL"` で非影響）。
- **2026-08-02 続き330（タスク12(lxxxii) 第1波＋第2波＝文中 CHOOSE 脱落 計4効果／**codex-work 実装・Claude 検証**）後の値**：census **1289 据置**（⚠4効果とも census の高シグナル語彙に**載っていない**＝実働化しても数字は動かない。`BASELINE_HIGH` 変更なし）、golden **1305→1307**（+2＝第1波1本〔`SEQUENCE[marker, CHOOSE{1/3}]` と3選択肢の condition〕／第2波1本〔同型3件をまとめて。**前置の支払い action と `CONDITIONAL{IS_MY_TURN}` 慣例包みが消えていないこと**・`suppressOnPlay`・②の `TURN_OWNER{opponent}` を assert〕。いずれも `withSavedCursor` で共有 `cursor` を save/restore 済み）、smoke **10679/10679** 全0・SKIP0、fuzz 全0、lint 0 errors/**240 warnings 据置**、manual field loss 0、同型★0（5986枚・265群）、held **258→265枚／署名グループ 109→116**（⚠**増分 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したもの。live 非影響だが `WXK08-002` の fresh には退化4点あり。明細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行と BUGFIXES 該当節。⚠**codex 報告の 266 は誤りで 265 が正**＝`node scripts/heldReview.mjs` で数え直すこと）。live per-effect 差分は第1波 **changed 1**（`WXK09-004-E1`）／第2波 **changed 3**（`WD21-008-E1`／`WX20-003-E1`／`SPK01-07-E1`）、いずれも added 0・removed 0・**スコープ外 outlier 0・兄弟効果変更0**。`TURN_OWNER` 保持効果 **23→24**。**新語彙 0本**＝既存救済規則（`effectParser.ts:5730-5765`）の適用条件を緩めただけ（第1波＝前置が非 SEQUENCE でも拾う／本数 2→1／marker id に `ARTS_COST_REDUCTION_BY_CENTER_LRIG` を追加。第2波＝許可する前置の木に「任意支払い action ＋ `CONDITIONAL{IS_MY_TURN}` に包まれた marker」を**狭く固定**して追加）。
> **過去の計測履歴 48 行（続き298〜328 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。**直近の正は上の1行**。以後もここには最新1件だけを置き、旧行は同節の先頭へ移す。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 259枚／署名グループ 110件（2026-08-02 続き330＝タスク12(lxxxii) **第6波**の後に `node scripts/heldReview.mjs` で実測。⚠**第1波が「採用禁止」と書いた +7カードのうち5枚は誤判定だった**＝`WXK08-002` の退化を根拠に巻き添えにしていたもので、実測すると live 側が「選択肢1本に平坦化＝強制実行」で壊れていた（第6波で採用済み）。**held の「採用禁止」ラベルは根拠カードごとに検証してから従うこと**。旧 265枚/116件＝第2波後の実測。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠**直近 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したぶんで、`WXK08-002` の fresh には退化4点がある＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行を読んでから採る）。旧 258枚/109件＝2026-08-02 (lxxxiii) 第15波後。旧 251枚/99件＝2026-08-01 タスク12(lxxvii) 実働化後（+1 は honest defer＝`WXK03-069`）。旧 288枚/106件＝2026-07-30 タスク12(lxi) 本消化後の値で、以下の内訳はその時点のもの。**内訳＝lxi 規則で新たに 24枚 held に落ちたが、その24枚と既存2枚〔`WX24-P1-071`／`WX25-P1-005`〕を同じ回で全採用したので、正味は前回 290枚から −2**。旧 290枚/107件＝§6.3 H 節クローズ後。旧 286枚＝タスク12(l) 後。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1291【効果単位】**（2026-08-02 task12(lxxxiii) 第7波＝leave-field trigger 主語1効果の live 忠実化、1294→1293）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **census 現行補正（第14波）**：高シグナル欠落 **1289**（`WXDi-P14-087-E1` のクラッシュ元限定 live 実働化で 1290→1289）。上行の長期推移文中に残る1291は旧値。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝**全ゲート緑（2026-08-04 続き346＝🏁§3 タスク12(xcix) 残0クローズ後）**＝golden **1366**・smoke **10679** 全0（SKIP も 0）・fuzz 全0・同型★0・census **1288**（回帰ゲート）・manual field loss 0・lint 0 errors/**240 warnings 据置**・held **258枚／109群**。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫**＝現存は **(lv) 残2経路／(lxvi)／(lxxxviii)／(xciii)／(xciv)／(xcvi)／(xcvii)／(c)** の8件。**🏁(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix) は 2026-08-04 に残0クローズ**。**(lxx)／(lxxviii)／(lxxxiii)／🏁(lxxxii) は 2026-08-02 に残0クローズ＝§3 の表から退避済み**（完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」）。それ以外の残0在庫の完了行原文は同ファイルの各整理節。**🏁タスク16 も残0クローズ**。**Sonnet の主力は タスク1（§7 実機検証）**＝未検証UIの単一 worklist は §7 に集約。⚠**§6.3 H と続き298〜Batch F の全件が UI 未検証**。
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

- **消化対象の worklist は 🏁P1完了宣言（2026-07-23）で凍結**＝宣言時点の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避（2026-08-02）。3分類は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭、最新件数は `docs/_vocab_census.txt` が正。
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

- [x] **系統①（相手デッキ削りの owner 取り違え）／系統②（GRANT_PROTECTION `count:ALL`）／スケールアップ（stub群 2,401枚 全数監査）＝✅完了**。完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節（2026-08-02 退避）。findings は Opusタスク12 (xxvii)(xxviii)(xxix) に集約済み。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。

### 6.3 残・大型機構（個別カード・機構待ち）

> このセクションは機構台帳＝**現存の残作業は下記 C／E／F／G＋J（J-1/J-2/J-4/J-5）に集約**。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録（各機構が日付/commit を明記済み）。完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節。

**残作業（現存項目のみ・完了項目は PLAN_DETAIL へ退避済み）**
- **E「引用付与の忠実化」追加在庫（2026-08-02）**＝`WX20-036-CB-E1`／`WX24-P2-010-E1` を (lxxxiii) 第15波から移管。両者は付与された【常】の内側に「あなたの他のシグニ」があり、付与先を source として引用能力内の自己除外・攻撃制限コストを評価する共通機構が必要。外側 action の `excludeSelf` では reader に届かないため、カード固有修正をせず同機構の在庫として扱う。
- **C. IS_MY_TURN 誤変換の未消化サブ系統**＝**fresh 残42効果**（2026-07-27 honest 再生成値。⚠続き284/285 の「33→26件」は消化行を手で削った値だったため訂正＝続き286。**`docs/_partial_report.txt` は `fresh parser` の出力を測る計器で、続き283〜287 の修正は curated JSON への外科的適用なので、消化済み効果もレポートには載り続けるのが正しい**）。**live/curated 側では22効果を消化済み**（続き283=2／続き284 公開軸=9／続き285 ミル・トラッシュ軸=7／続き286 移動軸=1／続き287 誤parseテール=3）。全数分類は `docs/_partial_triage.txt`「2026-07-27 §6.3 段3」節。**共通ブロッカーは「前段 action/STUB が結果を `lastProcessedCards` に記録しない」の一点**で、条件語彙（`LAST_PROCESSED_COUNT_GTE`／`_MATCHES{minCount,operator,distinctName}`／`_LEVEL_SUM`／`_ALL_MATCH`）は既に揃っている。⚠**writer を足すたびに「後段で lastProcessed を読む効果」を実データで全数走査すること**（gates では捕まらない。`TRASH` は既存 reader 50件・`REVEAL_DECK_TOP` 22件・`BANISH`／`TRANSFER_TO_DECK` 各7件＝触るなら全数照合が先）。**✅前段 action 誤parse 3枚は続き287で消化**＝`PR-K049-E1`（両者のデッキ最下ミル結果を合算し、レベル合計6以上で正面−5000）／`WX24-P4-045-E1`（固定した相手シグニを相手ライフへ移し、成功時だけ自身へダブルクラッシュ）／`WX22-043-E1`（手札のアクセアイコン持ちを2枚までエナへ移し、実移動2枚でドロー）。
- **E. 個別カード機構待ち**（続き282で全件を実データ・collector/executorまで再診断）＝**✅WX15-016 は消化**：新キャンセル機構は不要で、既存 `GRANT_LRIG_ABILITY`→防御側 `ON_ATTACK_SIGNI(any_opp)` 収集、デッキトップTRASH記録、`LAST_PROCESSED_MATCHES{hasLifeBurst}`、`SET_CANCEL_OPP_ATTACK_FLAG` を合成して忠実化。**✅WXDi-P06-031 は続き288で消化**：センタールリグ【起】の実ルリグゾーン候補を純関数で固定し、既存の相手場コスト増加collectorをルリグ支払いモーダルへ接続。E2は新 `IS_SELF_DOWN` でパワー+3000とガード追加《無》を同時に限定し、従来 `SEQUENCE` 内で読まれずno-opだったガードSTUBも再帰走査へ是正。**✅WXDi-P08-037 は続き290で消化**：単体`swap` pending/UI基盤を新設し、E2のトップ公開シグニ↔アップ状態自シグニ任意交換を忠実化。「入れ替えない」のUI入力nullはswapだけ空配列へ変換し、`count:'ALL'` の恒等配置規約を維持。【出】はこの経路でON_PLAYを積まないため結果として発動しないが、`suppressOnPlay` 自体はpending保持のみで未参照。配置順列の7状態は従来未追従だった範囲を追加した挙動変更。残＝WX20-028-E2（多重アクセ state・§6.4級）／permanent引用付与残（⚠`GRANT_LRIG_ABILITY.permanent` は既に実装済み。残は主に引用シグニ能力のpermanent/相手付与）／WX17-044（自己除外先 `excluded` は既存だが、トラッシュ起動コスト・トラップ選択・表向き発動・攻撃中対象固定が先）／WXDi-P05-006 choice①（ピースカットイン割込み基盤。着手禁止）／WX25-P3-023-E2（2ターン持続＋相手効果による相手手札移動 collector。E1は発火・ターン2回・微菌条件・択一まで既存）／WDK14-013（**トラッシュ→ビート、4枚条件、ON_BECOME_BEAT連鎖は実装済み。残は複数候補時のプレイヤー選択のみ**）／WX20-Re20（選択数依存コストに加え、能力なしfilter・好きな枚数場出し・出した同一群のターン終了時trashが不足）。**WXEX1-08 は✅続き278で消化済み**。旧「各カード全体が単一の機構待ち」という記載を4項目で訂正。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。
- **G. 置換else系統の残（続き269・§3タスク5から正式送り）**＝**B 2件の置換else部分は✅続き289で消化**。SPK06-01-E1 は追加赤0/2/4の三択を同一対話で保持し、対象数1/2/3を排他的に実行（付随するレイラのコイン技回数・次回コスト軽減は既存基盤が無く別途defer）。WXK06-032-E1 は既存 `refresh_count_this_turn` を双方参照し、最初に選んだ同一対象へ－4000/－12000を排他的に適用する。**残はC 13件**（反復、引用能力／ルリグ能力付与、複雑CHOOSE、支払い系ルール等）。CのWXDi-P02-042-E1を再確認したが、相手側のターン中手札捨て枚数を読む条件軸が無いためhonest defer。effectId 全明細と不足機構は `docs/_replace_else_triage.txt`。
- **✅ 完了機構（A 動的コンテキスト追跡／B BANISH_REDIRECT／D レゾナ出現条件トリガー／H タスク12(xxii) の不足機構／J-3 ライフクロス閾値遷移／I `WX25-P3-028-E2`／「正面」サブ機構／消化済み機構の台帳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。実装詳細の一次記録は BUGFIXES 各日付。**下に残るのが現存の残作業＝C／E／F／G＋J（J-1/J-2/J-4/J-5）と、H・I が残した横展開の教訓**。

- **⚠H が残した横展開の教訓＝UNKNOWN を実装するときは fresh parser の出力を先に測る。** H4 は fresh が主語を見ない `STUB DEPLOY_RESTRICT` を既に吐いており、live の `UNKNOWN` だけが「対戦相手は1体まで」への意味反転を止めていた（採用した瞬間に過剰実行へ反転する型のドリフト）。
- **⚠I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
- **⚠I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
- **⚠honest defer 継続＝`WX20-Re20`**（選択数依存コスト・能力なし filter・任意複数配置UI・同一instance群のターン終了時 trash が**一体で**要る＝部分実装しない）。

- **J. timing collector 不在の13効果（2026-07-31・タスク16 の `[C]` から正式送り）＝🆕 J-3 消化により実残 11効果**＝原文が【自】なのに**そのイベントを検出する collector が engine に存在しない**群。現在は `timing:[]` で安全停止中＝**放置しても過剰実行は起きない**（着手優先度は低いが、機構台帳としてはここが定位置）。判定根拠は `docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に `ファイル:行` つき。**5家族に束ねると1家族＝1バッチで複数枚が同時に開く**：
  - **J-1 他能力の発動監視**（2効果）＝`WX19-066-E1`「あなたの【自】の【英知】能力が発動したとき」／`WXEX1-77-E1`「対戦相手の場にあるシグニの【出】能力が発動したとき」。**他 AUTO の解決開始を横から監視し能力クラス/種別を照合するイベント発行が無い**（`abilityTypes` 型は付与能力側にあるが別用途＝`effects.ts:1475`）。effectStack の push 時にフックを置くのが筋。
  - **J-2 付与・離脱イベント**（4効果）＝`WXDi-D07-004-E1`／`WXDi-D07-019-E1`（【ソウル】が付いたとき・味方/自身）／`WXK10-049-E1`「このシグニにカードN枚が付いたとき」（下敷き等を含む汎用付与＋枚数閾値）／`WXEX2-19-E1`「あなたの【アクセ】N枚がトラッシュに置かれたとき」（アクセ離脱）。**soul/acce の状態と付与能力収集は実在するが、付与/離脱の"イベント"を発火させる collector が無い**（`effectEngine.ts:5302`／`triggerCollect.ts:1787`）。既存 `ON_CHARM_TO_TRASH` がチャーム専用の先例。
  - **J-4 フェイズ／アタック終了 timing**（2効果）＝`WX24-P2-075-E1`「あなたのアタックフェイズ終了時」（`ON_ATTACK_PHASE_START` のみ実在＝終了時の発行/収集が無い）／`WXK11-018-E2`「このシグニがアタックしたアタック終了時」（個別シグニのアタック終了）。⚠**着手するならタスク12(lxvii) と一体で見る**＝フェイズ/ターン境界トリガーは**CPU 側の収集が面で欠けている**ので、新 timing を足しても人間ターンだけの片肺になる。
  - **J-5 単発**（3効果）＝`WXEX1-41-E1`「【トラップ】Nつが**設置**されたとき」（`ON_TRAP_ACTIVATE` は発動専用・設置完了イベントが無い）／`SP27-007-E1`「あなたか対戦相手が《コインアイコン》を**得た**とき」（`ON_COIN_PAID` は減少方向のみ）／`WXDi-P11-010B-E1`「《夢限 -Q-》から《夢限 -A-》になったとき」（named form 遷移）。いずれも既存 collector の**逆方向/別イベント**で、単独では割に合わない。


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

- **🆕 タスク16 残0クローズ（`WXDi-P06-038`／`WX05-020`／`WXDi-P13-051`）が持ち込んだ未検証UI 3件（2026-07-31）**
  - [ ] **`WXDi-P06-038`（翠美姫 アン//メモリア）**＝自分のエナゾーンから効果でカードが**トラッシュ以外**（手札/場/デッキ）へ動いたときにも【エナチャージ１】が誘発すること。⚠**コスト支払いでエナを払っただけでは誘発しない**こと（ここが「効果によって」の要）。《ターン1回》を超えて誘発しないこと。
  - [ ] **`WX05-020`（羅輝石 ダイヤブライド）**＝**1ターンに合計2枚**クラッシュして初めてアップすること（1枚では何も起きない）。①ダブルクラッシュ/ランサー持ちで1回のアタックで2枚 ②アタック1枚＋E2（相手アーツ被効果のダメージ）1枚、の**両方の足し方**で発火すること。**ターンをまたぐと累計がリセット**されること。
  - [ ] **`WXDi-P13-051`（翠美姫 アン//ディソナ）**＝相手効果で手札を捨てさせられたときと、相手効果で自分のエナがトラッシュされたときの**両方**で誘発し、**1つの相手効果が両方やった場合は1回だけ**誘発すること（`WXK02-004`／`WXDi-P10-003` が実戦例）。誘発時に「引く／エナチャージ」の**2択UIが出る**こと（従来はエナチャージが無条件に走っていた）。

- **🆕 タスク16 `WXDi-P11-063-E2`（aboveSelf／シグニの下に置かれた）が持ち込んだ未検証UI 1件（2026-07-31）**
  - [ ] **スペル《無心の豪圧》(`WXDi-P11-063`) をメモリア3種のいずれかの下に置く選択**＝①バニッシュ解決後に「シグニの下に置きますか？」の選択肢（候補は場のメモリア＋スキップ）が出ること ②置くと**そのシグニの下にスペルが入り、そのシグニのパワーが＋2000される**こと（ターン終了時に戻る） ③スキップするとトラッシュのままで何も起きないこと。⚠この配置経路は **part1 の同名 STUB に食われて長期間到達不能だった**＝UI で初めて実走する。
  - [ ] **【常】版4枚の自己バフが止まったこと**＝`WXK08-086`／`WXDi-P03-057`／`WXDi-P05-050` を**普通に場に出しただけ**ではパワーが上がらないこと（従来は自分に＋Nしていた）。`WXDi-P03-057` は【起】《ダウン》で他の赤シグニの下に潜ったときだけ、そのホストが＋2000されること。

- **🆕 タスク12(lxxiii) が持ち込んだ未検証UI 1件（2026-08-01）**＝トラッシュ領域移動ロック。engine 側は全効果走査（330→0）と golden で固定済みだが UI 経路は計器に映らない。
  - [ ] **`WX24-P4-007-E1`（③まで込み）／`WXDi-P14-005-E1`（選択肢③）を撃った次の相手ターン**に、相手が「あなたのトラッシュから…を手札に加える／場に出す／エナに置く／下に置く／【ビート】にする」系を使おうとしても**候補が0で何も起きない**こと。⚠見るべき境界3つ＝①**メインフェイズとアタックフェイズだけ**（アップ／ドロー／エナ／グロウ／エンドの各フェイズでは従来どおり動く）②**そのターンだけ**（さらに次の自分ターンでは解除される）③**こちらの効果で相手のトラッシュを触るのは止まらない**（例：相手トラッシュからカードを奪う効果は従来どおり通る）。

- **🆕 タスク12(lxi) 第11波が持ち込んだ未検証UI 1件（2026-08-01）**＝**ゾーンを跨いだ選択モーダル**は本プロジェクト初。engine/golden では固定済みだが UI 経路は計器に映らない。
  - [ ] **`WXK06-067-E1` の跨ぎプール**＝【起】《青》＋自身トラッシュで起動すると、**相手側**に「手札とエナゾーンから合計2枚をデッキの一番上に置く／支払わない」の選択が出ること。回避を選ぶと**相手の手札とエナが1つのリストに並び**（見出しは「相手の手札とエナから合計」）、①**手札1枚＋エナ1枚のように跨いで選べる** ②手札2枚だけ・エナ2枚だけも選べる ③ちょうど2枚選ぶまで確定できないこと。確定後は選んだ2枚がデッキトップへ行き、**シグニは場に残る**。⚠手札とエナの合計が1枚以下なら回避枝が選べないこと／「支払わない」を選ぶと**相手が自分で選んだシグニ**がデッキの一番上へ行くこと（従来は無条件・かつ効果側が選んでいた）。

- **🆕 タスク12(lxi) 第10波が持ち込んだ未検証UI 2件（2026-08-01・最優先）**＝「シグニを新たに配置できないゾーン」は engine/golden で固定済みだが、**読み手が3つとも BattleScreen 経路＝計器に一切映らない**（`handleSummonSigni`／CPU召喚ループ／`SigniSummonZoneModal`）。
  - [ ] **(a) 無条件の配置禁止**＝`WX10-051-E1`（スペル）／`WX24-P4-024-E3`（【起】）を自ターンに撃ってゾーンを1つ指定 → **次の相手ターン**にそのゾーンが召喚モーダルで `(配置禁止)`＋赤枠になり選べないこと。①**このターンは禁止されない**（「次のターンの間」なので相手は自ターン到来まで影響を受けない）②**さらに次のターンには解除される**（予約の昇格が1回だけ）③**ライズ（上乗せ）は禁止されない**こと。あわせて `REMOVE_SIGNI_ZONE`（`WXDi-P00-015-E2`／`WX25-P3-015-E2`／`WXK03-005-E1`／`WXK07-031-E2`＝「ターン終了時まで、対戦相手のシグニゾーン１つを消す」）で**消したゾーンがそのターン中は埋められない**こと（従来は消した直後に置き直せた）。
  - [ ] **(b) 《無》×5 の支払い回避**＝`WXDi-P11-009-E3`（《ゲーム１回》）で、指定ゾーンが `《無》×5を支払う` 表示になり、①選ぶと**エナがちょうど5枚トラッシュへ行って配置できる** ②エナ4枚以下だと `《無》×5不足` で選べない ③**このターンと次のターンの両方**で効いていること。⚠**CPU 側にも同じ経路がある**（CPU は常に支払う方針＝エナが足りなければそのゾーンを飛ばして別ゾーンへ置く）ので、CPU 戦で「シグニコストを払った後にゾーン回避コストが払えず、エナだけ失う」取りこぼしが起きないことも見る。
  - [ ] **🆕 (lxxvi) のゾーン供給源2種**＝①`WX08-032-E1`（スペル）で相手シグニをバニッシュしたあと、**そのシグニがいたゾーンだけ**がこのターンと次のターン配置禁止になること（**ゾーン1へのフォールバックが起きていない**ことが要点＝別ゾーンを禁止していたら退化）。②`WXEX1-24-E1` ③で、**【ウィルス】があるゾーンが複数あればすべて**禁止され、ウィルスが1つも無ければ何も起きないこと（このターンのみ＝次の相手ターンには解除）。

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
  - [x] **(a) エナ不足で「支払う」が選べない**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs oppPayEnergyInsufficient` で実機確認（2回連続PASS）＝guest energy=0 で pay が unavailable→CPU自動応答が skip を選択→BANISH実行。**対照実験（`oppPayEnergySufficient`＝energy=3で pay を選ばせる）で別の実バグを発見**＝CPU自動応答（`BattleScreen.tsx:522-530`）はCHOOSEの選択肢IDのみを渡しエナinstanceIdを渡さないため、`resumeOpponentPayOptional`が`energyNums=[]`で「コスト支払いエラー: エナ不足」を返し、エナが足りていてもpay選択が常に空振りする＝**Opusタスク12(cii)へ登録**（§3参照）。
  - [x] **(b) 手札不足で「手札をN枚捨てる」が選べない**＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs oppDiscardGateBareBug` で実機確認（2回連続、意図的FAIL）＝手札2枚(<3)でも discard が本来 unavailable のはずのところ、**costColors非搭載のOPPONENT_PAY_OPTIONALは無条件で無料「支払う」を選択肢へ積む**（`effectExecutor.ts:3333`）ためCPUがこれを最優先で選びbanishを回避＝discard枝のavailable:false判定に到達すらしない実バグ＝**Opusタスク12(ci)へ登録**（§3参照）。
  - [ ] **(c) 併記型で両方の選択肢が同時に出る**＝「手札を1枚捨てるか《無》を支払わないかぎり」形で pay と discard が**並んで**出る（`WXDi-P05-TK01A-E1` は本消化では据置なので、併記型の live 実例は `WXDi-P16-088` 系ではなく golden の `TEST-LXI-BOTH` 相当。**live で併記型が載っているのは現状0**なので、実機確認は次バッチで併記型が入ってからでよい）。
  - [x] **(d) ライフバースト経路で相手へ CHOOSE が飛ぶ**（`WX24-P2-071-BURST`／`WX24-P4-062-BURST`／`WX25-P3-076-BURST`／`WXDi-P04-058-BURST` の4件）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs lbOwnerReversal`（`WX24-P2-071-BURST`）で実機確認（2回連続PASS）＝`queueCardEffects(...,{id:ownerId})`がLB所有者(guest)をownerStateに固定するため、OPPONENT_PAY_OPTIONALの支払い側(otherState)はターン所有者に関わらず常に「LB所有者の対戦相手＝アタッカー」になる。host（アタッカー）が実際にoptcost-skip等のCHOOSEを受領→無エナでpay不能→skip→host自身のシグニがBANISHされることを確認＝owner反転が正しく機能。残る3枚（`WX24-P4-062`等）は同一機構（`queueCardEffects`のownerId固定）のため構造的に同じ結論と判断・個別実機は任意。
  - [x] **(e) 入れ子 SEQUENCE の continuation が中断を跨いで残る**（`WX24-P1-023-E1`）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs sequenceContinuationAcrossGate` で実機確認（2回連続PASS）＝内側ゲート（相手CHOOSE＝今回はOpusタスク12(ci)の無料pay枝をCPUが選択）解決後も、外側SEQUENCEの次ステップ`REVEAL_AND_PICK`（デッキ上5枚→スペル/＜電機＞を2枚まで手札）が中断を跨いで正しく続行することを確認（噴流する知識をpick済み）。同型 `WX24-P2-033-E1`／`WX25-P3-042-E1` は同一JSON構造のため個別実機は任意。
- **🆕 エクシード本体5件（次の一手①）が持ち込んだ未検証UI 3件（2026-07-30・最優先）**＝engine/golden では固定済みだがUI経路は計器に映らない。
  - [ ] **(a) 群B＝相手側の支払い回避 CHOOSE**（`WX24-P4-018-E2`）＝相手に「支払う／手札を3枚捨てる／支払わない」が出る／**手札が3枚未満なら `discard` が選べない**（`available:false`）／**不払いを選んだときだけ**バニッシュ対象選択が出て、捨てた場合は場が変わらないこと。
  - [ ] **(b) 群C＝任意ライフクラッシュ＋動的対象数**（`WX24-P4-015-E2`）＝「クラッシュする／しない」が出る／しない→**1体**・する→**2体**の対象選択／**ライフバースト解決（チェックゾーン）を跨いでも対象数が2のまま**であること（ここが最重要＝engine では golden で固定済みだが実機の中断経路は未検証）。
  - [ ] **(c) 群E＝2群ピッカー**（`WX24-P4-017-E2`）＝トラッシュから**スペル枠と青シグニ枠が独立に「1枚まで」**で出る／片方0枚でも成立する／該当0枚のときに空振りしないこと。
- **🆕 §6.3 H／I′ の機構4件が持ち込んだ未検証UI（2026-07-30・最優先）**＝engine/golden では固定済みだがUI経路は計器に一切映っていない。
  - [x] **(a) ガード追加《無》の N枚徴収**（`WX24-P3-069-E1` ほか族11効果）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs guardExtraColorlessSufficient`/`guardExtraColorlessInsufficient`（`WX24-P3-069-E1-G`＝`GRANT_LRIG_ABILITY`で付与される`STUB{OPP_GUARD_COST_COLORLESS,count:3}`をguestへ直接注入）で実機確認（各2回連続PASS・FRESHルームで安定）＝エナ十分(3枚)でガード成立→ちょうど3枚徴収（トラッシュ+4＝ガード札1＋エナ3）／エナ不足(2枚)で「使用できるガードカードが手札にありません」表示＋ガード候補ゼロ→「ガードしない」のみ。⚠**ルーム再利用バッチでは前シナリオのguestルリグダウン状態が残りCPUが再アタックせずFAILする**（個別実行/FRESHルームでは安定）＝既定order外・単体実行専用として保持（他の「CPUターン系バッチ限定FAIL」と同型の既知制約）。1枚（count省略）の既存6 CONTINUOUSは今回の注入方式（guestへの直接付与）と独立のため非回帰は自明（未個別実機・低優先）。
  - [x] **(b) `WDK14-013-E1` のトラッシュ＜悪魔＞候補ピッカー**（`SigniOnPlayCostModal`）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs wdk14013TrashPicker`で実機確認（2回連続PASS）＝トラッシュに候補2枚（必要1枚を超過）を用意→ピッカー出現→img候補クリック→発動でトラッシュから1枚ビート化。**候補が必要数ちょうど/不足のときピッカーが出ずに従来の自動選択のまま**という側面は未個別実機（`beatTrashNeedSelect`のコード読解では確認済み・低優先）。
  - [x] **(c) メルト・ファクト `WX15-067-E1` の支払い前ウィルス除去UI**（`SpellCastModal` に1段挿さる）＝✅2026-08-04・Sonnet・`verifyBattleDrive.mjs meltFactVirusRemoval`で実機確認（2回連続PASS）＝相手ウィルス2個を除去→コスト《黒×2》が0まで軽減／CHOOSE上限が1→2に拡張されc0（トラッシュの黒シグニを手札に）・c1（相手シグニ-7000）を同時選択→両方実行。**「変えると支払いエナ選択がクリアされる」「モーダルcloseで選択が消える」の2点はコード読解で確認済み**（`SpellCastModal.tsx:119-133`・`35`）だが実機クリック単体では未個別検証（低優先）。0/1個除去の中間ケースも未個別実機（低優先）。
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
