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
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | 🏁**在庫0**（2026-08-18 続き546 で (cxxxiv)(cxxxi)(cxix)(cxx) を修正・(cxxxii)(cxxii) は実体消滅を確認）。クローズ済み行は PLAN_DETAIL「整理㉚」。Sonnet が新しく積むまで待機 |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L | effect 構造そのものが原文とズレたカードの再parse。**🆕2026-08-07 続き369 で「低優先」を解除**＝§5d の欠落パターン D（重度混線）と同じ母集団で、§5c 店じまい後の主戦場のひとつ  🆕**続き377n 追加＝`WXK05-052-E1`**（「対戦相手のシグニを２体まで対象とし、**このシグニと同じシグニゾーンに【シード】がある場合**、次のターンの間、それらは「【常】：アタックできない。」を得る」＝**条件節の【シード】をキーワードと誤読**して「あなたのシグニ1体に【シード】を付与」に化けている。⚠**体数だけ広げると誤りを増幅**するので golden にトリップワイヤ設置済み）。 |
| 21 | 🚧**§5d-0 工程改善3件（次セッション最優先・Opus）** | 計測＋スクリプト新設 | S（1セッション想定） | ①`npm run census:wiring` 常設化（語彙×入口の被覆マトリクス。試作で134件検出）②残1162の真バグ率を無作為20件で再測定 ③worklist を作業種別へ組み替え。**2026-08-07 続き375 でユーザー合意・通常バッチより優先**。設計・根拠・実測値は §5d-0 |
| 20 | **§5d 1効果ずつの原文照合（新設・現在の主戦場）** | 原文照合＋JSON/parser | L（母集団 約874効果） | §5c の文型バッチが届かない**単発テール**。欠落パターン A〜D で分類し、**繰り返し出るパターンは parser へ還元**する。入口は §5d 末尾の照合済み12件 |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |

> **✅消化済のタスク（1〜9・11・14・16〜19）は 2026-07-29／2026-08-02／2026-08-06 の整理で退避**＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-29 整理」節（1〜9・11・17〜19）／「2026-08-02 整理②」節（16＝timing 語彙センサス 🏁残0クローズ）／**「2026-08-06 整理③」節（14＝リファクタ Stage2→Stage3 純粋バトルコントローラ。⚠残作業は §7 実機通し確認のみ・手順は [BATTLE_CONTROLLER.md](./BATTLE_CONTROLLER.md)）**。生きているのは上表の **13・15・20・21**（**12 は常設受け口**）。**🚧次セッションは 21（§5d-0 工程改善）を最優先**＝それが済んでから **20（§5d）** の通常バッチへ戻る。**主戦場は 20（§5d）**＝2026-08-07 続き369 に §5c の文型バッチを店じまいして移した。

🏁🏁**Opusタスク12＝在庫0**（2026-08-18 続き546）。**この表には生きている行だけを置く**＝クローズ済み行の原文と結末の対照表は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-18 整理㉚」節。
- **同セッションで残0クローズした6件**＝🏁**修正3件**〔(cxxxiv) 旧形式 `signi_acce` の正規化／(cxxxi) ルリグ【起】《ダウン》が実質無コスト＝live 27効果／(cxix) ON_HAND_ADDED の owner 2軸／(cxx) エナ差分 watcher の《ターン1回/2回》＝live 9効果〕（※(cxix)(cxx) を数えると修正は4件）／🟢**実体消滅2件**〔(cxxxii) は §6.4 O-3 続き487 で、(cxxii) は (cxxvii) 続き475d で、**登録から数日のうちに別バッチが原因ごと消していた**〕。
- ⚠**残す教訓**＝(a) **在庫は寝かせるほど陳腐化する**＝着手時は必ず live を実測し直す（6件中2件は原因が既に消えていた）。 (b) **「1点で直る」見立ては消費側を数えてから信じる**＝(cxxxiv) の実害の本体は `.length` 誤読ではなく `[...cards]` の**1文字ずつ展開**で、正規化を読み出しユーティリティ全部＋state 流入口に置いて初めて塞がった。 (c) **廃止したフィールド名で注入している実機シナリオは緑でも無意味**（(cxxxii) の `v11CpuDeployPowerLimitWithControl`）＝機構を統合したら注入側も grep して追随させる。 (d) **支払い地点と提示地点は別々に数える**＝(cxxxi) は支払い1・提示4の計5地点で、支払いだけ直すと「撃てるのに何も起きない」に化ける。
- ⚠**要実機検証5件**は §7「残る実機検証項目」へ `V-66`〜`V-70` で登録済み（うち `V-66`／`V-68` は**既存シナリオの再走**＝新規シナリオは3本）。
- **次に積まれるまで待機**（常設受け口）。Sonnet 側が engine/parser バグを見つけたらここへ足す。


> **🏁🏁2026-08-08 に在庫5件を残0クローズ＝(cxv)(cxiii)(cxiv)（先発3件）と (cxvii)(cxviii)（(cxiii) から切り出した機構待ち2件）**。**5件とも登録時の見立てが外れていた**（真因の対照表と登録行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-08 整理④」節へ退避）。live 12カード・golden 1472→1481・smoke 10679→10686・census 927→932。一次記録は `BUGFIXES.md` 2026-08-08 の先頭2節。⚠**要実機検証5件**は §7「残る実機検証項目」へ登録済み。
⚠**5件が残した教訓（(a)〜(f)＝(cxv)(cxiii)(cxiv)／(g)〜(j)＝(cxvii)(cxviii)）**＝(a) **`activeCondition` に `Condition` 型を書いても誰も止めない**＝`checkActiveCondition` は未知の型で `return true`（無条件成立）に落ちるので、型を1つ取り違えるだけで「条件つき常在能力が常時発動」になり **smoke/census/fuzz は全部緑**。両評価器の末尾に `never` 代入を置いて網羅性を typecheck に固定し、JSON 側は golden がミラー表（`ACTIVE_CONDITION_TYPES` / `CONDITION_TYPES`）と機械照合するようにした。 (b) **ミラー表は `src/` に置く**＝`scripts/` は tsconfig の include 外で**型検査されない**（goldenTest 内に書くと自動追随しない）。 (c) 内側 operator switch の後の `break;` は**外側 switch を抜けて末尾の `return true` に落ちる**＝保守側で閉じる。 (d) **「代わりに」は機構ではなく帯**（`AND` ＋ `operator:'lt'`）で表せる／パワー修正は加算分解。 (e) **`STUB` を「未実装」と決めつけない**（引用付与2種は実装済みで、落ちていたのは「条件を置く場所」＝`keyword_grants` は条件を持てない→`granted_effects` へ回す）。 (f) **`build:effects` の収穫マージには構造的な穴がある**＝MANUAL/PARTIAL を含むカードで **effectId の集合が変わる**と `_held_fresh`／`_partial_fresh` の**どちらにも載らずカード丸ごと温存**される（`sameIdSet` ガード）＝効果を新設するバッチは必ずここに落ちるので parser 出力を直接 live へ書く。 (g) **「機構待ち」の見立ては疑う**＝2件とも足りなかったのは新機構ではなく「①動的レベルを**読む条件型**」「②分岐を**書ける場所**」だけで、部品（`calcSigniLevels`／`IS_BETTING`／`GRANT_EFFECT{targetsLastProcessed}`）は既に揃っていた。 (h) **閾値を別の量で近似した手当ては過剰実行の種**＝`WX20-Re18-E2` は「レベル4以上」を`SELF_POWER_GTE 12000` で近似していたが、パワーだけバフされるとレベル3でも発火する（近似は「たまたま境界が合う」だけで、独立に動く量には効かない）。 (i) **`manualEffects.ts` にある効果は parser の後処理では直せない**（`mergeManualEffects` が上書きする）＝実体のある側を直す。 (j) 逆翻訳の `condJa` は **Condition と ActiveCondition を1つの switch で描く**＝同名型の case は1箇所だけ（両方に足すと `no-duplicate-case`）。

🏁**2026-08-07（続き363）に (cx) までは残0クローズ済み**。クローズ済み行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理③」節（それ以前の〔(i)〜(lvi) の大半〕は同ファイル §3 の 2026-07-19・2026-07-24・2026-07-28・2026-07-29 の各退避節）。

> **🏁🏁2026-08-07（続き363）に最後の (cx) を残0クローズ**＝「対戦相手のシグニ1体がアタックしたときにしか使用できない」【起】（`WX05-013-E2`）。登録時は「新しい ACTIVATED の窓の設計が先＝1枚のために作る費用対効果は低い＝据置が妥当」と結論していたが、**既存の応答窓の作法（`ON_OPP_SIGNI_ATTACK_DIRECT`／`WX04-004-E2`）に合流させれば新規UIは不要**と分かり実装した。⚠**残す教訓**＝(g) **「〜したときにしか使用できない」は使用条件ではなく使用タイミング**。condition に落とすと、仮に真になっても**【起】のUIは全経路が自ターン限定＝到達経路が無い**。窓が要るなら timing を足して収集側（`performSigniAttack`）を書く。 (h) **`TurnPhase` に無い phase 値は「全ゲート緑のまま一生 false」**＝no-op 網にも census にも映らない。golden `(cvii)` の「不正 phase 値0件」を維持するのが唯一の再発検知。 (i) **進行中のアタックは `negated_attacks`（宣言時に見る事前登録）では止まらない**＝`cancel_current_signi_attack` を立てる。一次記録は `BUGFIXES.md` 2026-08-07 の節。

> **✅2026-08-06（続き356〜362f）に残0クローズした16件＝(cviii)(cvii)(ci)(cii)(cv)(civ)(xcvii)(xcvi)(lxvi)(cxi)(c)(cix)(xciii)(lxxxviii)(lv)(xciv)**＝当時の残は (cx) 1件だった（**その (cx) も 2026-08-07 続き363 で残0クローズ＝在庫は空**）。＝完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理③」節。一次記録は `BUGFIXES.md` 2026-08-06 の各節。⚠**残す教訓**＝(a)「実機 FAIL＝engine バグ」ではない〔(civ)＝計器の嘘／(cxi)＝UI の収集漏れ〕 (b) **中断（対話）を挟むと盤面差分は 1巡目ぶんが丸ごと消えていた**＝ON_* 系の実機 FAIL はまず中断の有無を疑う (c) CPU の対象選択は**ランダム**＝「結果が正しい」は合格条件にならず、候補列そのものを見る。 (d) **コスト計算の入口は3箇所ある**〔`ArtsModal` Phase1／Phase2／ルリグデッキのカード詳細「使用」ゲート〕＝1つ落とすと「一覧からは使えるのにタップすると使えない」食い違いになる（(xciii)(xcii)）。 (e) **`STUB` を「未実装」と決めつけない**＝`BET_MECHANIC` / `GRANT_QUOTED_AUTO_ABILITY` は原文から選択肢を組み立てる実装済みハンドラで、**JSON を静的化するとかえって忠実さが落ちる**ことがある（(lxxxviii)）。 (f) **golden が原理的に守れない経路がある**＝engine ハーネスはコスト支払いも同じ ExecCtx で行うので、実UIだけで切れる参照〔`lastProcessedCards`・`seqVars`〕は緑のまま素通りする。コスト由来の参照を足したら**実機シナリオを1本足す**（(cix)）。
> **✅2026-08-04（続き341〜346）に残0クローズした6件＝(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix)**（相手盤面参照のコスト軽減8枚／「能力を持たない」判定の統一／CPU ターンの境界トリガー279効果／CPU のターン開始ドロー／散文形「対戦相手のターンの間、」の過剰実行／主語なしアタック watcher の scope）。**完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-04 整理」節へ退避**。一次記録は `BUGFIXES.md` 2026-08-04 の各節。
> **✅残0クローズ済みの在庫の完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) の各整理節へ退避**＝**🆕(lxxxi)〔使用コストの条件つき置換＝2026-08-03 に 続き334＋335 の2セッションで残0クローズ。一次記録は BUGFIXES 2026-08-03 の2節〕**、**🆕(lxxxiv)〔スペルカットイン経路のベット宣言UI＝2026-08-03 続き336 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(xci)〔カード名指定の《無》軽減がスペル使用モーダルに無かった＝2026-08-03 続き340 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(lxxxv)＋(lxxxix)〔使用時の任意支払いによるコスト軽減＝2026-08-03 続き337 で 31枚・続き338 で 場のシグニ払い2枚を追加し**残0クローズ（計33枚）**。残3枚は別機構/別意味で対象外。一次記録は BUGFIXES 2026-08-03 の先頭2節〕**、**🆕(lxxxvi)＋(lxxxvii)〔スペル本体のベットの `ON_COIN_PAID` 配線／カットイン窓のコスト算出をアーツ経路と同じ機構へ＝2026-08-03 続き339。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、**🆕(xci)〔カード名指定の《無》軽減がスペル使用モーダルに無かった＝2026-08-03 続き340 で残0クローズ。一次記録は BUGFIXES 2026-08-03 の先頭節〕**、「2026-08-02 整理③」節に (lxx)／(lxxviii)／(lxxxii)〔第3〜6波の追記込み〕／(lxxxiii)**、「2026-08-02 整理②」節に (lxix)(lxxi)(lxxii)(lxxiv)(lxxix)(lxxx)＋(lxi)〔支払い回避クローズ全11波〕(lxxiii)(lxxv)(lxxvi)(lxxvii)。一次記録は BUGFIXES 2026-07-30〜08-02 の各節。⚠**残す教訓**＝(a) engine の回避手段語彙は7系統＝新しい回避手段はそこへ足す／「AかB合計N枚」は2枝に割らず単一プールの候補型で表す (b)「読めた」は「正しい」ではない＝文型 regex は巻き込む。規則を足したら `build:effects` で held 増分と live per-effect 差分を必ず見る (c) 収集経路の無い timing を足すと過剰実行を no-op へ替えるだけ＝collector とセットで。

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | 既定order 94件まで消化済（続き263までの既存分＋2026-08-04/05に追加した17シナリオ）。**残作業は §7「残る実機検証項目」が単一の worklist**＝ここには重複を書かない（2026-07-30 に §4 進捗サマリと二分していたのを §7 へ集約）。**✅2026-08-04＝タスク12(lxi) 本消化5件のうち(a)(b)(d)(e)＋§6.3 H／I′ の5件すべて（a-e）を実機検証完了**（タスク12(lxi)(c)併記型はlive実例0件のため据置）。**✅2026-08-05＝タスク12(lxi) 第10波(a)(b)＋(lxxvi) ゾーン供給源2種のうち1種＋タスク12(lxiv)(lxv)(lx)(lxii) を実機検証完了**（「シグニを新たに配置できないゾーン」／「対象ピッカー前置」／「条件つき任意コストのゲート」／「捨てる枚数スケール型ピッカー」を確認）。**検証中に新規実バグ4件を発見・Opusタスク12(ci)〜(cv)へ登録**＝(ci)costColors非搭載OPPONENT_PAY_OPTIONALの無料pay枝／(cii)CPU自動応答のエナinstanceId未送信／(civ)対象宣言直後に別インタラクションへ続く場合ON_TARGETEDが0回発火／(cv)`opp_hand`+`opponentResponds`のviewer視点描画バグでソフトロック。**次の最優先＝タスク12(lxi) 第11波（`WXK06-067-E1` ゾーンを跨いだ選択モーダル）／タスク12(lxiii)(lxi)第2波・第3波 系統**（§7「残る実機検証項目」の残りリストを上から）。経緯は PLAN_DETAIL §3 。**🆕2026-08-07（続き366）＝タスク12(cxvi) の実機検証を追加**＝「コインを払ってからアタック→条件つき効果が発火する／払わなければ発火しない」（`WXDi-P15-068`〔合計2枚以上でエナチャージ〕か `WXDi-P09-039`〔合計1枚以上でバニッシュ〕）。累計の**加算**は `BattleScreen` の支払い経路にあり golden では踏めない|
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77/105/139/140/142）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**。次の在庫が発生するまで待機（Opus 新語彙着地待ち）。⚠P1宣言により新規バッチは切らない |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は全数監査完了**（findings→Opusタスク12 (xxvii)(xxviii)(xxix)）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

> **✅退避＝タスク4（BEHAVIOR_AUDIT キュー再生成＋一次トリアージ）は ⛔枯渇（休眠）**＝続き133 で高シグナル22件精査＝真 no-op バグ0件。行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-06 整理③」節（再開するなら監査ツールの構造的盲点フィルタ実装が先＝低収量見込み）。

（消化済み在庫＝未採用在庫 第2弾40枚〔続き208〕・未採用在庫37効果〔続き201〕・補欠(a)(b) はいずれも✅続き214/172/170 で全消化。詳細 BUGFIXES 各続き）

**依存の要点（交互サイクルの回し方）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・8 → Opus12**（Sonnet が観測して積む → Opus が修正する。タスク4 は⛔枯渇で退避済み）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式・同時作業はしない）。

**🆕2026-08-07 続き376＝Sonnet がタスク1で「コイン支払い累計」機構を実機検証完了**（`coinsPaidAttackFires`／`coinsPaidAttackSkipped` を既定orderへ・126→128件）。⚠**残＝`coins_paid_this_turn` の加算は `BattleScreen.tsx` の10経路にあり、実走したのは ACTIVATED【起】1本だけ**（グロウ／ベット／アンコール／【出】コストは未検証）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。⚠**2026-08-18 続き546 時点で Opusタスク12 の在庫は🏁0件**（在庫6件を残0クローズ。以前の🏁0件は2026-08-08 時点）。🏁(cxv)(cxiii)(cxiv)(cxvii)(cxviii) は 2026-08-08、🏁(cxvi)〔コイン支払い累計〕は続き366、🏁(cxii)〔パワー参照ゲートの表記パワー落ち〕は続き367 で残0クローズ。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。
- **🆕 セッション（2026-08-18・続き548・Opus 5）＝§5「フェーズ1残作業：表現（P1）」＝続き547 が §5d-0 (ii) へ登録した宿題を消化**。**live 10効果を是正**（added 0 / removed 0 / **changed 10**）。ゲート全緑（**golden 2246→2261**・**census 799→796**（`BASELINE_HIGH` 更新）・smoke 10693 全0・fuzz 全0・**同型★0**（265群）・`census:stubs` 全0・manual-fields 0・lint 0 errors）。**CSV 非改変**。一次記録は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18（続き548）。
  - **📏 まず実測＝在庫は登録時の見立て（5+2件）より大きかった**＝原文に「それぞれ〜異なる」を含む効果を全数走査すると**制約が JSON のどこにも無い効果は41件**。本命はコスト節と条件節だった。
  - **🔴① `cost.energyTrash` の集合制約＝regex が捕捉して switch が捨てていた（7効果）**。`effectParser.ts:566` は**5つの言い回しを捕捉**していたのに三項演算子は**2つしか写していなかった**＝「エナゾーンからそれぞれレベルの異なるシグニ３枚をトラッシュに置く」が**同じレベル3枚でも払えた**。⇒ 🔑**捕捉したまま捨てるとマッチはするので他の規則にも回らず完全に無言で消える**＝写像を `energyTrashConstraintOf()` の1関数へ出した。⚠隣接で `WXK11-047-E3` は**規則名に「それぞれ名前の異なる」と書きながら制約を出していない**別規則、`WXK09-052-E2`／`WXK10-050-E2` は「レベル１～４を**1枚ずつ**」が `levelRange`＋枚数だけで**レベル1を4枚**でも払えた。
  - **🔴② 型にあった `selectionConstraint` は支払いUIで完全な死フラグだった**。3つの支払いモーダルはいずれも `size >= count` しか見ておらず**制約を一度も評価していなかった**。⇒ 🔑**parser だけ直すと死フラグを増やすだけ**なので engine もセットで実装＝`costs.ts` に3モーダル共有の純関数（`energyTrashCostSatisfied`／`canAddEnergyTrashIndex`＝**制約を壊す組み合わせはそもそも選べない**）を新設し、`SigniActivatedModal`／`LrigGrantedModal`／`SigniOnPlayCostModal` の**3経路すべて**へ配線（golden にソース走査で固定＋旧写経が残っていないことも同時に）。
  - **🔴③ 盤面状態（覚醒／傀儡）の条件節が丸ごと落ちて無条件発火（3効果）**＝`WXDi-P14-050-E1`（**無条件**で相手の【ガード】に追加コスト）／`WXDi-P14-062-E1`（**無条件**で能力付与）／`WXK09-061-E1`（**無条件**で−3000）。⚠**「がある場合」形の規則はあった**が①**「あるかぎり」形＝【常】の `activeCondition` 経路の表に無かった**②**覚醒だけを見る regex で傀儡に当たらなかった**。engine は両評価器とも実装済みで**新機構は不要**。
  - **🔧④ engine の parity 穴も同時に閉じた**＝`effectEngine` の `HAS_CARD_IN_FIELD` のルリグ走査除外リストが `crossState/isFrozen/isAwakened` の3つだけで **`isPuppet` が抜けていた**（`execUtils` は4つとも除外済み）＝`matchesFilter` は `isPuppet` を見ないので**ルリグが「傀儡状態のシグニ」として数えられる**。
  - **▶ 次の一手【Opus 側】**＝§5d-0 の worklist は**必ず実測し直してから取る**（`npm run census:wiring`＝**197**／`npm run census`＝**796**）。生きている大物は `cardClass` 51／`color` 24／`levelRange` 24／`levelExact` 21／`powerRange` 19。🆕**今回の残**＝「それぞれ〜異なる」の (a) **手札コスト**（`WX10-052-E3`＝`handDiscardSigni` に制約キーが無い）(b) **トラッシュ除外コスト**（`WXK09-029-E2`＝コスト節そのものが未パース）(c) **ミル結果の条件型**（`WXK03-025-E1`）(d) **対象節の残り約15効果**（`WD23-041-EA-E1`／`WDK01-010-E1`／`WDK14-011-E1`／`WX26-CP1-055-E1`／`WXK10-051-E1` ほか＝`DISTINCT_BATCH5C` のオプトイン表に無いだけ）。
  - **▶ 次の一手【Sonnet 側】**＝**§7 実機検証**（`V-nn` が単一 worklist）。🆕**今回ぶんは `V-72`**（エナコストの集合制約＝同レベルを選ぶと2枚目が選べず支払いボタンも出ないこと・3モーダルすべて）。ほかに `V-71`（続き547）・`V-66`〜`V-70`（続き546）・`V-58`(f)・続き534〜544 の分が未検証のまま。

### 📊 恒久指標（最新1件のみ・履歴は PLAN_DETAIL）

- **🆕 2026-08-18 続き548（§5d-0 (ii)＝コスト節の集合制約7効果＋盤面状態の条件節3効果）後 最新値（本行が直近の正）**：**census 796**（799→796 実数更新・`BASELINE_HIGH` 更新済み）、**golden 2261**（+15＝`cost.energyTrash` の集合制約 live 7効果／`energyTrashCostSatisfied`・`canAddEnergyTrashIndex` の純関数契約（**制約違反は払えない・選べない**＋制約なしは従来どおり）／**支払いUI3経路すべてが共有判定を通る**ソース走査＋旧写経ゼロ／盤面状態の条件節 live 3効果／`checkActiveCondition` の負方向（覚醒していない・レベル違い）／**`isPuppet` でルリグを数えない** parity）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**（据置）、manual-fields **0**、被覆マトリクス miss **197 据置**（この層は census:wiring の語彙表に無い＝コスト節・条件節なので数字は動かない）。🆕**新設した関数**＝`energyTrashConstraintOf`（`effectParser.ts`）／`energyTrashCostSatisfied`・`canAddEnergyTrashIndex`・`energyTrashSelectedNums`（`screens/battle/costs.ts`）＝**新しい型も新しいアクション型も0本**（`SelectionConstraint` も `isAwakened`/`isPuppet` も既存）。**live JSON changed 10効果/10カード**（収穫マージ自動採用9＋held 採用1＝`WXK09-061`。CSV 非改変）。⚠**10効果すべて実機未検証**（§7 `V-72` 送り＝エナコストの集合制約は UI 層なので golden が踏めない）。
- **旧・2026-08-18 続き547（§5d-0 (i) 第20バッチ＝「それぞれ〜異なる」の軸取り違え7効果＋「傀儡状態で場に出す」8効果）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2246**（+21＝`DISTINCT_BATCH5C` の全40件で「表の値＝原文から導いた値」／`distinctConstraintOf` の4軸／live 7効果の実値／傀儡 live 8効果の STUB 化＋絞り込み＋旧形（自分トラッシュ ADD_TO_FIELD）へ戻っていないこと／`WXEX2-23-E4` の `suppressOnPlay` 畳み込み／engine の `puppetParams.filter` が候補を絞ること＋filter 無しは従来どおり／連体「傀儡状態の」がトリガー文のままであること）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**（264 warnings）、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**（据置）、manual-fields **0**、🆕**被覆マトリクス miss 242→197**（`npm run census:wiring`。⚠PLAN 旧記載の 541／291 は古い）。🆕**新設した関数**＝`inferDistinctKind`／`distinctConstraintOf`（`effectParser.ts`・export）＝**新しいアクション型も新しい engine 経路も0本**（`STEAL_OPP_TRASH_PUPPET` は既存・足したのは `puppetParams.filter` 1キーだけ）。**live JSON changed 15効果/15カード**（held 採用14＋`_partial_fresh` から外科パッチ1＝`WXEX2-23-E4`。CSV 非改変）。⚠**15効果すべて実機未検証**（§7 `V-71` 送り＝傀儡8効果。「それぞれ〜異なる」7効果は選択集合制約なので UI 側の拒否挙動が要確認）。
- **旧・2026-08-18 続き546（🏁🏁**Opusタスク12 在庫0**＝engine/parser の実バグ4件を修正・2件は実体消滅を確認）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2225**（+4＝旧形式 `signi_acce` を1枚として扱う全経路／ルリグ【起】《ダウン》の母集団27件と自己ダウン支払い／`ON_HAND_ADDED` の owner 2軸＋付与ストア end-to-end＋対照の非反転／エナ差分 watcher の母集団9件＋**ソース照合で push 地点3つ**）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` **A群 4種/5件（すべて明示 defer・無言 no-op 0）／C群 0**（据置）、manual-fields **0**、`parserWorklist` held **122**（据置）。🆕**新設した関数**＝`normalizeAcceSlot`／`normalizeAcceSlots`（`src/utils/acce.ts`）・`payLrigDownSelfCost`（`screens/battle/lrigDownCost.ts`）＝**新しい型も新しい engine 経路も0本**。**live JSON changed 1効果/1カード**（`SPDi43-11`。CSV 非改変）。🆕**挙動是正 37効果**（ルリグ【起】《ダウン》27＝実質無コスト／エナ差分 watcher 9＝撃ち放題／`SPDi43-11-sub-E1` 1＝恒久 no-op）＋**旧形式 `signi_acce` のデータ破壊**。⚠**5件とも実機未検証**（§7 `V-66`〜`V-70` 送り）。
- **旧・2026-08-18 続き545（🏁§6.4 **`O-12` 完了**＝逆翻訳の表示だけの穴・ゲート化）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2221 据置**（逆翻訳の表示だけなので構文ゴールデンは不変）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` **A群＝4種/5件（すべて明示 defer。無言 no-op は 0）／🆕C群＝0種/0箇所**（179種/296箇所→**0**。D 健全 418種→**597種**）、manual-fields **0**、`parserWorklist` held **122**（据置）。🆕**`census:stubs` はゲート2本になった**（A群の無言 no-op＋C群の生ID露出。どちらも増えたら exit 1）。**engine / live JSON / CSV とも非改変**（逆翻訳の表示のみ）。⚠**実機検証は不要**（挙動不変）。
- **旧・2026-08-18 続き544（🏁§6.4 **`O-38` 完了**＝相手シグニ【自】の「支払えば通る」回避）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2221**（+3＝`SPDi43-01-E2` がハードブロックではなく支払いゲートを積むこと（＋宣言→choke point の橋渡し）／ゲートの向き（宣言者自身には掛からない・`:NEXT_TURN` 予約はまだ効かない・シグニ/レゾナの【自】限定）／包んだ【自】は払えば通り払わなければ何もしないこと（＋`costColors` が選択肢に載る＝タダで通らない・エナ0なら払えない表示）。⚠既存1本を更新＝旧「近似の在処の固定」テストは `WXDi-P16-044-E2`（無条件ブロックが正）だけを見る形へ分離）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**4種/5件（すべて明示 defer。無言 no-op は 0）**（据置）、manual-fields **0**、`parserWorklist` held **122**（据置）。🆕**新設した engine 語彙は0本**＝既存の任意コスト機構（`OPTIONAL_COST` → `CONDITIONAL{PAID_ADDITIONAL_COST}`）をスタック解決の1点で被せただけ。**live JSON / CSV とも非改変**（engine 側のみの是正）。⚠**実機未検証**（§7 `V-65` 送り＝エナの実支払いは UI 層で golden が踏めない）。
- **旧・2026-08-18 続き543（🏁§6.4 **`O-37` 完了**＝引用能力の置換3形）後 最新値**：**census 799 据置**（ベースライン 799）、**golden 2218**（+4＝置換3形が専用構造にパースされること／支払い方が原文どおり載ること（⚠「か」split で2つ目が落ちない・`WX24-P4-021` は能力喪失なし・`RECOLLECT_GATE` が残る）／funnel が付与ストアを見て払ったら能力を1つ失うこと（＋払えないなら成立しない・`lrig_abilities_disabled` で落ちる・cardMap 未指定では選ばない）／リフレッシュ置換（＋2回目は守らない・ライフ0なら消費しない・**トラッシュ複製が起きない**）／`ON_TRASH_CARD_ADDED` の検出と付与ストア収集（＋自分の効果・原因不明・相手トラッシュでは発火しない）。⚠旧 defer トリップワイヤ1本は**正方向の挙動テストへ書き換え**）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**4種/5件（すべて明示 defer。無言 no-op は 0）**（7種8件→4種5件＝今回3種3件を実装）、manual-fields **0**、`parserWorklist` held **122**（127→122）。🆕**新設した語彙**＝timing `ON_TRASH_CARD_ADDED` 1本＋`triggerCondition.trashOwner`＋`LifeCrashReplacement.kind:'pay_cost'`＋StubAction 3キー（`damageReplaceByCost`／`refreshLifeMoveReplace`／`trashedCardUpTo`）。**live JSON changed 6効果/6カード**（held 採用6。CSV 非改変）。⚠**6効果すべて実機未検証**（§7 `V-64` 送り）。
- **旧・2026-08-17 続き542（🏁§6.4 **`O-29` 完了**＝「同じ選択肢を複数回選ぶ」ループ）後 最新値**：**census 799**（800→799 実数更新・`BASELINE_HIGH` 更新済み）、**golden 2214**（+4＝`resumeChoose` が重複 id を潰さないこと／選択数1では `allowRepeat` を立てないこと／`WX17-003-E1` の構造・upTo・betChoose・distinct level／`WX22-016-E1` の②を2回選ぶと本体が3回走ること。⚠既存2本を更新＝`REPEAT_EFFECT` の残存許容 1件→**0件**と、`(O-11) WX22-016-E1` の選択肢内チェックの精密化）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**7種/8件（すべて明示 defer。無言 no-op は 0）**（据置）、manual-fields **0**、`parserWorklist` held **127**（据置）。🆕**新設した語彙は `ChooseAction.allowRepeat` 1本だけ**（engine の解決ロジックは無変更＝穴は UI が `Set<string>` だったこと）。🏁**`REPEAT_EFFECT` / `REPEAT_N_TIMES` は live 0件**。**live JSON changed 8効果/8カード**（held 採用1＋MANUAL 同期1＋収穫マージ自動採用6。CSV 非改変）。⚠**UI（回数モーダル）と CPU 自動応答は実機未検証**（§7 `V-63` 送り＝golden は engine 側までしか踏めない）。
- **旧・2026-08-17 続き541（🏁§6.4 **`O-25` 完了**＝自己引用付与の残り (c)(d)）後 最新値（本行が直近の正）**：**census 800**（806→800 実数更新・`BASELINE_HIGH` 更新済み）、**golden 2210**（+7＝ゲート5形の写像／引用付与6効果が無条件 `keyword_grants` に落ちないこと／**付与ストアの条件つきシャドウが対象選択から除外される**こと／序数条件の通算カウント（ルリグ分を含む）／「一度目か二度目」を別機構から奪っていないこと／チャーム条件が別物に化けないこと／(c) の明示 defer。⚠うち1本は**既存テストの順序依存の是正**＝`(xlvi) wave17` の埋め札を cursor 依存から性質選択へ）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**7種/8件（すべて明示 defer。無言 no-op は 0）**（+1＝`DEFERRED_ATTACKER_LEVEL_TRADE_NEGATE`）、manual-fields **0**、`parserWorklist` held **127**（据置）。🆕**新設した条件型2つ**（`THIS_CARD_IS_CHARMED`／`ATTACK_ORDINAL_THIS_TURN`＝`Condition` の型数 119→**121**）。🆕**新しい `ActiveCondition` は0本**（ゲート5形はすべて既存語彙で表せた）。**live JSON changed 11効果/11カード**（held 採用10＋MANUAL 外科パッチ1。CSV 非改変。⚠**ゲート条件の6効果は live 非改変**＝engine 側の是正）。⚠**14効果すべて実機未検証**（§7 `V-61`／`V-62` 送り）。
- **旧・2026-08-17 続き540（§6.4 **`O-14`／`O-15` を消化**＝どちらも残0クローズ）後 最新値（本行が直近の正）**：**census 806 据置**（ベースライン 806）、**golden 2203**（+3＝O-14(a) の「強制アタックと同時に次ターンのアーツ/スペル/【起】封じが積まれる」＋「次の対戦相手のターン」を当ターンに潰さない／O-14(b) の「即時に1体も飛ばず、相手ターン終了時にアタックした分だけ飛ぶ」。⚠`WXEX1-44-E2` の defer トリップワイヤは**正方向の挙動テストへ書き換え**＝件数は据置カウント）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（据置）。🆕**新設した engine 語彙は STUB 1本のみ**（`BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN`）＝**新しい型も新しい engine 経路も0本**（3件とも既存機構に parser を追いつかせただけ）。**live JSON changed 4効果/4カード**（`WXEX1-44`／`WX15-003`／`WXDi-P08-010`／`WX25-P1-050`。CSV 非改変）。⚠**3件とも実機未検証**（§7 `V-59`／`V-60` 送り）。
- **旧・2026-08-17 続き538（§6.4 **O-25 の (a)(b) を消化**＝(c)(d) は残）後 最新値（本行が直近の正）**：**census 806**（807→806 実数更新）、**golden 2200**（+3＝(a) の条件が付与に掛かること／引用のコスト節が本体に化けていないこと＋**E1b は近似のまま**の明示／(b) の構造化）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**自己引用付与の在庫**＝【自】/【起】引用 **42効果**（未構造化8→**5**＝うち3件は別表現で実装済みの偽陽性）／【常】引用 **39効果**（未構造化32＝**O-25(d)**＝付与ストアを読む走査軸が無いのが本体）。**live JSON changed 3枚**（held 採用1枚＋MANUAL 凍結の外科パッチ2枚）。
- **旧・2026-08-17 続き537（🏁§6.4 **O-31 完了**＝簿記の2件は実装済み／実測で新規の穴2つ）後 最新値（本行が直近の正）**：**census 807**（808→807 実数更新）、**golden 2197**（+3＝読点なしの回避ゲート＋制限型を横取りしない負方向／**10効果すべての自己トラッシュが `thisCardOnly` を持つ**こと／相手シグニ【自】停止が engine に届くこと＝近似の在処の固定）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**「支払わないかぎり」を含む73効果を効果単位で走査し、回避表現が無いものは残0**（`SPDi43-01-E2` の支払い回避だけが**近似として残る**＝O-38）。**live JSON changed 10枚**（収穫マージ9枚＋held 採用1枚）。
- **旧・2026-08-17 続き536（🏁§6.4 **O-27 完了**＝引用能力の中身が未パース／ダメージ無効の残り）後 最新値（本行が直近の正）**：**census 808 据置**、**golden 2194**（+4＝リミットと付与が両方載ること／引用の2ブロックが両方そろうこと／【常】が宣言 STUB で条件を保つこと／**付与ストアの【常】シールドが判定へ届く**こと・明示 defer に `REMOVE_ABILITIES` が紛れていないこと）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**6種/7件（すべて明示 defer。無言 no-op は 0）**（+3＝今回の `DEFERRED_DAMAGE_REPLACE_BY_COST`／`DEFERRED_REFRESH_LIFE_MOVE_REPLACE`／`DEFERRED_OPP_EFFECT_TRASHED_ANY_ZONE`）、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**`GRANT_ABILITY_INNER_TEXT` を含む効果 39→38**（残りは §6.4 O-31(a)／O-25 の層）。**live JSON changed 5枚**（収穫マージ4枚＋`PARTIAL` の外科パッチ1枚）。
- **旧・2026-08-17 続き535（🏁§6.4 **O-26 完了**＝自己トラッシュがコストに載らない・6効果 → **残0**）後 最新値（本行が直近の正）**：**census 808 据置**、**golden 2190**（+2＝【起】複合コストの `cost.trash_self` 契約／束ねた任意コストの実経路＝支払うと効果元がトラッシュへ行き、ラベルに対価が出て、場に居ない効果元では支払い枝が選べない）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**3種/4件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**原文に「この〜を場からトラッシュに置き」を含む【起】コスト節／束ねた任意コストの残0を両方向で確認**（⚠付与された内側能力まで辿ること・「**エナゾーンから**」は `energyTrashSelf` の別コスト）。**live JSON changed 6枚**（すべて収穫マージが自動採用＝純粋にコストが増えた側）。
- **旧・2026-08-17 続き534（🏁§6.4 **O-36 完了**＝ターン条件の allowlist 解体・23効果 → **残0**）後 最新値（本行が直近の正）**：**census 808**（809→808 実数更新）、**golden 2188**（+4＝allowlist 撤廃の契約／連言形「手札がN枚で〜のターンの場合」／持ち上げで実装済み STUB へ戻ること／`OPP_TURN_NO_ENERGY_COST` が `:NEXT_TURN` を張らないこと）、smoke **10693 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**3種/4件（すべて明示 defer。無言 no-op は 0）**、manual-fields **0**、`parserWorklist` held **127**（LOSS 115／VALUE 10／ADD 2＝据置）。**原文に「ターンの場合」を含む42効果すべてが live で `TURN_OWNER` を持つ（残0）**。**live JSON changed 21枚**（AUTO収穫16＋自動採用1＋MANUAL外科パッチ4）。

> **旧・続き532 の計測行**（census 809・golden 2181・`countChoose`／能力ブロック分割／`costUnparsed` ガード）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き531 の計測行**（census 812・golden 2176・O-11 実装穴10件消化／`conditionChoose`／`selfTrash`）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き530 の計測行**（census 816・golden 2166・`CONDITIONAL_POWER_BONUS` 受け皿の解体しきり）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き529 の計測行**（census 818・golden 2162・`LRIG_STORY.negate` ／「追加で」節のゾーン照応の復元）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き528 の計測行**（census 817・golden 2160・`LEADING_STATE_CLAUSES` の module 化／裸の任意手札コスト／エナ「すべて」の ALL 化）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き527 の計測行**（census 817・golden 2155・`ALL_FIELD_SIGNI_MATCH` の ActiveCondition 実装／デッキトップ公開の焼き付き `cardType` 一掃）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き526 の計測行**（census 818・golden 2152・`NO_COMMON_COLOR_AMONG_FIELD_SIGNI` の class filter／`WX12-CB02` のレベル別5分岐）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **旧・続き525 の計測行**（2026-08-17 続き525（§6.4 **O-11：連用形チェーンで「先頭節」が落ちる形**）後 最新値（本行が直近の正）**：**census 819**（820 から −1・`BASELINE_HIGH` も実数更新）、**golden 2147**（+5＝①条件節の内側での先頭バニッシュ復元 ②照応つき先頭節（対象＋それをバニッシュ）の復元 ③`LOOK_AND_REORDER` 後続文の1ドロー ④「手札をすべて捨て」が `DRAW_DISCARD_COUNT_PLUS_N` の**前**に走ること ⑤**公開/探索の複合文を割らない**負方向＝場出しが二重に走らないこと）、smoke **10688 / SKIP 0**、fuzz 全0、lint **0 errors / 262 warnings**、`census:stubs` A群＝**0種/0件 据置**。🆕**`verifyEffects` アクション照合＝25件/23カード → 22件/20カード**（全10シート実測）。🆕**`CONDITIONAL_POWER_BONUS` ＝14効果 据置**（§6.4 `O-35`）。🆕**live JSON changed 4効果 / 4カード**（CSV 非改変）。⚠**4経路とも実機未検証**（§7 送り）。

> **旧・続き524 の計測行**（2026-08-17 続き524（**`CONDITIONAL_POWER_BONUS`（ゴミ箱受け皿）の解体・第1巡**）後 最新値（本行が直近の正）**：**census 820 据置**、**golden 2142**（+6＝①`HAS_CARD_IN_FIELD{negate}`（構造＋engine 駆動の正負2方向）②`MILL{fromBottom}` の正準形 ③`MILL` が recorder＝後段が `LAST_PROCESSED_MATCHES` になること（`IS_MY_TURN` 化けの固定）④誤発火2件が `DEFERRED_*` であること ⑤直前処理の結果条件（バースト非所持／レベル合計＋`trashedPick`） ⑥`anyOf` の OR フィルタ）、smoke **10688 / SKIP 0**、fuzz 全0、lint **0 errors / 262 warnings**、`census:stubs` A群＝**0種/0件 据置**。🆕**`CONDITIONAL_POWER_BONUS`＝21効果/21カード → 14効果/14カード**（⚠着手前の実測値。続き523 の簿記「23」は机上値だった）。🆕**`verifyEffects` アクション照合＝25件 据置**（今回の対象はこの計器に映らない層＝別計器）。🆕**live JSON changed 8効果 / 8カード**（CSV 非改変）。🆕**新機構＝`HAS_CARD_IN_FIELD.negate`／`MILL` の recorder 登録／`MILL{fromBottom}` の parser 規則／`DEFERRED_TRASH_NAME_CHOOSE_COUNT`／`DEFERRED_REPEAT_ON_REVEALED_NAME`**。🔴**是正した誤発火2件**（原文に無いパワー修正の捏造＝`WX20-078-E1` の相手全体−5000／`WXDi-CP01-033-E1` の＋5000 多重適用）。⚠**8経路とも実機未検証**（§7 送り）。⚠**未着手のゲート**＝`STATE_HOIST_BATCH1_CARDS`（allowlist 外に 24効果）。

> **旧・続き523 の計測行**（2026-08-17 続き523（§6.4 **O-11 の `SEND_TO_ENERGY` 群を完全消化**）後 最新値（本行が直近の正）**：**census 820 据置**、**golden 2136**（+6＝①色宣言の store が `DECLARE_COLORS` であること＋後段の宣言色 filter と行き先 ②「この方法でトラッシュに置いた」候補が `lastProcessedCards` 限定であること（engine 駆動） ③場/エナ二択の両枝 ④`MASS_TRASH` に戻っていないこと ⑤多段閾値が then/else の**置換**であること ⑥可変枚数 ref `self_hand_over_five`（engine 駆動））、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors / 262 warnings**、`census:stubs` A群＝**0種/0件 据置**。🆕**`verifyEffects` アクション照合＝31件 → 25件 / 29カード → 23カード**（全10シート実測）。🆕**live JSON changed 11効果 / 11カード**（CSV 非改変）。🆕**新機構＝`StubAction.trashedPick`（候補を `lastProcessedCards` に限定）／`$ref:'self_hand_over_five'`／`wrapFieldOrEnergy`／`foldDeclaredColorTopReveal`／`foldGradedEnergyEachLevelReplacement`／`INTERNAL_TRASHED_PICK_HAND_OR_FIELD`**。🆕**`CONDITIONAL_POWER_BONUS` は live 26効果のゴミ箱受け皿**＝うち3本を解体（**残23効果が次の worklist**）。⚠**11経路とも実機未検証**（§7 送り）。⚠**残した drift**＝`WXK09-031-E2`（fresh が STUB へ退化するため E1 のみ外科パッチ）。

> **旧・続き522 の計測行**（2026-08-17 続き522（§6.4 **O-11 の可変枚数コスト**）後 最新値（本行が直近の正）**：**census 820**（819 から +1＝`BASELINE_HIGH` も実数更新。⚠**STUB を実装で置き換えた効果が高シグナル側へ昇格した +3 と、「同じレベル」限定の汎用化で回収した −1** の差引き。残る +2 は**ペア付け機構待ちの本物の穴**）、**golden 2130**（+1＝可変枚数の正準形・選択集合の相互制約・帰結の枚数追従・**ペア付け未実装のあいだ対象数を1に据え置く負方向**・トリガー元基準を上書きしないこと）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝34件 → 31件**（全10シート実測）。🆕**ペイロード空 `OPTIONAL_COST` ＝34効果 / 総数 606**。🆕**live JSON changed 9効果**（CSV 非改変）。⚠**3経路 実機未検証**（§7 送り）。

> **旧・続き521 の計測行**（2026-08-17（§6.4 **O-11 をさらに3件消化**）後 最新値（本行が直近の正）**：**census 819 据置**、**golden 2129**（+2＝「追加でエクシードNを支払う」と**ルリグの下が実際に4枚減る／skip では減らない**の対と、前置きつき原文で `exceed` payload が載ること）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝37件 → 34件**（全10シート実測）。🆕**ペイロード空 `OPTIONAL_COST` ＝37効果 / `OPTIONAL_COST` 総数 606**（⚠続き519 の「67」は `exceed`/`coinCost` を数え落とした**過大計上**＝正しくは続き519 時点 41）。🆕**live の `OPTIONAL_COST{exceed}` は 9 → 22効果**（エクシード踏み倒しの是正）。🆕**live JSON changed 16効果**（CSV 非改変）。⚠**3経路 実機未検証**（§7 送り）。

> **旧・続き520 の計測行**（2026-08-16（§6.4 **O-11 の実装穴6件消化**）後 最新値（本行が直近の正）**：**census 819**（823 から −4＝`BASELINE_HIGH` も 819 へ更新。これまで `SHUFFLE_DECK` だけに潰れていた文の語彙（探す／設置する／アクセにする）が live に載った分）、**golden 2127**（+2＝行き先2種の live 構造 assert と「デッキから探した札を【アクセ】にしても複製しない」E2E。⚠`trackedCardCount` は `signi_acce` を数えないので総数比較は明示的に足す）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝43件 → 37件**（全10シート実測）。🆕**新機構＝`recoverDroppedConjClauses`＋`CONJ_FIN`/`CONJ_SPLIT_RE` の単一定義／SEARCH の行き先 `INTERNAL_ASK_TRAP_ZONE`／`INTERNAL_ASK_ACCE_HOST`＋`INTERNAL_ATTACH_ACCE_TO_HOST`＋`StubAction.acceHostFilter`＋`resumeSearch` の枚数展開**。🆕**live JSON changed 6効果 / 6カード**（CSV 非改変）。⚠**2経路 実機未検証**（§7 送り）。

> **旧・続き519 の計測行**（2026-08-16（§6.4 **O-11＝計器の較正と仕分け**）後 最新値（本行が直近の正）**：census **823 据置**、**golden 2124 据置**、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、lint **0 errors**、`census:stubs` A群＝**0種/0件**（無言 no-op 0・明示 defer 0＝続き518 の O-10 クローズから据置）・C群 **172種/253箇所 据置**、`census:goldentypes` **未カバー 0型**。🆕**`verifyEffects` アクション照合＝135件 → 43件**（[STUB代替?] 78/[要確認] 57 → 計43。**全10シート実測**。⚠`npm run verify` は既定 `Sheet1` だけなので**在庫を数えるときは10シート回す**）。🆕**新指標＝ペイロードが空の `OPTIONAL_COST` 67効果 / live 606件**（コストの踏み倒し母集団・未着手）。**live JSON / CSV / engine / parser は非改変**（変更は `scripts/verifyEffects.ts` のみ）＝実機検証項目の追加なし。

> **旧・続き506 の計測行**（2026-08-16（§6.4 **O-8／O-9 クローズ**＝ともに 残0）後 最新値（本行が直近の正）**：census **823 据置**、**golden 2102**（+8＝強制アタック順の母集団と「可能ならば」のソフトロック回避の負方向2／`WX12-010-E3` の移動シグニ限定アップと `isDown` 絞り込み2／相手側可変枚数の3択と手札不足の負方向2／繰り返す解除ゲートの予約先・支払い枝・ゾーン占有時の不成立・未払い時の予約残存2）、smoke **10688 / SKIP 0**、fuzz 全0、**同型★ 0**（265群）、held **102枚 / 44群**（据置）、lint **0 errors**、`census:stubs` A群＝**16種/20件**（18種/22件から −2種/−2件＝明示 defer を実装で解体・無言 no-op 0）・C群 **172種/253箇所 据置**、`census:goldentypes` **未カバー 0型**。🆕**live JSON changed 3効果 / 3カード**（＋キー順だけの差1効果・CSV 非改変）。🆕**新機構＝`collectForcedAttackZones`＋ブロック理由 `FORCED_ATTACK_ORDER`（アタック順を gate へ1本化）／`execUp` の `count:'ALL'+upToCount`／`StubAction.opponentHandDiscardUpTo`（相手側の可変枚数コスト）／`PlayerState.facedown_release_by_payment`＋`flipFacedownSigniFaceUp`（繰り返す遅延ゲート）**。⚠**全経路 実機未検証**（§7 送り）。

> **旧・続き505 の計測行**（census 823・golden 2094・`selfToEnergy`／照応復元の純テキスト正規化）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き504 の計測行**（census 823・golden 2090・`StubAction.resonaSummon`／複数枚レゾナ配置）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き503 の計測行**（census 823・golden 2088・キーワード綴りの funnel 集約）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き502 の計測行**（golden 2082・`SigniAttackBan.zones`・choice ビルダーの漏れ一般ガード）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き501 の計測行**（golden 2079・`REPEAT_N_TIMES` 全文 regex 実装 106 行の撤去）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き500 の計測行**（census 826→825・golden 2072・A群 20種/22件→15種/17件・goldentypes 未カバー0 の達成行）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。
> **旧・続き499 の計測行**（`BASELINE_HIGH` 826・golden 2061・A群 20種/22件・UNKNOWN 残0 の達成行）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の要約とセットで参照する。

> **過去の計測 15 行（続き478〜492）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-15 整理⑰」節へ退避**（2026-08-15）。**直近の正は上の1行**。
> **過去の計測履歴 48 行（続き298〜328 ほか）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。**直近の正は上の1行**。以後もここには最新1件だけを置き、旧行は同節の先頭へ移す。
- **🆕 2026-07-30 タスク12(xxix) 15波後の最新値（本行を (xxix) 系の正とする）**：**任意cost【出】母集団 981／`optionalOnPlayCostStub` で写せない 4**（＝`costUnparsed` の4件のみ。**すべて明示保留＝理由つきで不発を維持**しており `OPTIONAL_ON_PLAY_COST_REF_DEFERRED` は**0件**。内訳と保留理由は §4 進捗サマリ参照）。**`costUnparsed` 総数 21／AUTO・ON_PLAY・任意 4**。⚠**ゲート値（golden/census/smoke/held）は上の 2026-07-30 タスク12(l) 行が正**（本行の 15波時点の値は 1075／1394／10726／292枚 で、その後 (l) で更新された）。⚠**80/71/59/54/43/35/33/27/20/15/12/10/8/6 等の旧値は母数が違う**（波ごとに新語彙が増えたため）＝**投入前に必ず `npx tsx scripts/archive/xxixResidualCensus.ts` で数え直す**（実関数 `optionalOnPlayCostStub`／`wrapOptionalOnPlay` を import して live JSON を全数走査する計測スクリプト。簿記の数字は信用しない）。
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**held は 229枚／署名グループ 104件（2026-08-07 続き375 実測・据置・`node scripts/heldReview.mjs`）**。旧 242枚/104件＝続き370。旧 259枚/110件＝2026-08-02 続き330＝タスク12(lxxxii) **第6波**の後の実測（⚠**第1波が「採用禁止」と書いた +7カードのうち5枚は誤判定だった**＝`WXK08-002` の退化を根拠に巻き添えにしていたもので、実測すると live 側が「選択肢1本に平坦化＝強制実行」で壊れていた（第6波で採用済み）。**held の「採用禁止」ラベルは根拠カードごとに検証してから従うこと**。旧 265枚/116件＝第2波後の実測。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠第1波の簿記に codex 報告の 266 を書いてしまい第2波で訂正＝**codex の集計値は鵜呑みにせず数え直す**。⚠**直近 +7カードは「採用禁止」在庫**＝parser 緩和が MANUAL/PARTIAL 温存カードの fresh にも波及したぶんで、`WXK08-002` の fresh には退化4点がある＝[PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」の (lxxxii) 行を読んでから採る）。旧 258枚/109件＝2026-08-02 (lxxxiii) 第15波後。旧 251枚/99件＝2026-08-01 タスク12(lxxvii) 実働化後（+1 は honest defer＝`WXK03-069`）。旧 288枚/106件＝2026-07-30 タスク12(lxi) 本消化後の値で、以下の内訳はその時点のもの。**内訳＝lxi 規則で新たに 24枚 held に落ちたが、その24枚と既存2枚〔`WX24-P1-071`／`WX25-P1-005`〕を同じ回で全採用したので、正味は前回 290枚から −2**。旧 290枚/107件＝§6.3 H 節クローズ後。旧 286枚＝タスク12(l) 後。旧 292枚/107件＝(xxix) 15波後。⚠2026-07-29 の5波後は 293枚だった。⚠従来ここに書いていた「251枚」は `21a24900` 時点の値で、その後の parser/manual 変更ぶんが `_held_review.txt` に反映されていなかっただけ＝ベースラインコミットの worktree で再生成して 293/107 の一致を確認済み・`node scripts/heldReview.mjs`）。LOSS/VALUE は **held 259 / LOSS 203 / VALUE 54 / ADD 2（2026-08-07 続き370 実測）**。旧 held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1291【効果単位】**（2026-08-02 task12(lxxxiii) 第7波＝leave-field trigger 主語1効果の live 忠実化、1294→1293）（🏁 P1完了宣言〔2026-07-23〕の凍結基線1581から、§6.3個別機構の消化で逓減中。1393→1391 は本セッションの構造化2件ぶん）。**宣言後の推移チェーン（1581→1393 の各バッチ内訳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-07-30 整理：census 推移チェーン」節へ退避**。宣言後は worklist ではなく回帰ゲート＝**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**（新規 parser バッチは切らない）。前提＝`docs/_effect_srctext.json` が最新。3分類〔§6.3送り282／粗網のみ116／長テール1183〕は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭。明細 `docs/_vocab_census.txt`、**宣言前のバッチ逓減履歴（1919→1581）と旧計測は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4 の退避節**／BUGFIXES 続き109以降。
- **census 現行補正（第14波）**：高シグナル欠落 **1289**（`WXDi-P14-087-E1` のクラッシュ元限定 live 実働化で 1290→1289）。上行の長期推移文中に残る1291は旧値。
- **母数**：効果カード 5975／効果 **10679**〔2026-07-30 タスク12(l) で47効果がトップレベルから付与入れ子へ移り 10722→10679〕／旧 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。
### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝**全ゲート緑（2026-08-10 続き417）＝golden 1753・smoke 10686 全0（SKIP 0）・fuzz 全0・同型★0（265群）・census 860・manual field loss 0・lint 0 errors。以下の旧値（続き394〜396）は参考**＝golden **1682**・smoke **10686** 全0（SKIP も 0）・fuzz 全0・同型★**0**（265群）・census **882**（回帰ゲート）・manual field loss 0・lint 0 errors/**254 warnings**（⚠`--cache` 使用のため実数とズレる＝簿記前に `rm -rf node_modules/.cache/eslint`）・held **111枚／48群**。**被覆マトリクス miss 277**。**混在カードのレビュー待ち 3カード**。**live の `parseStatus:"UNKNOWN"` は 0**（⚠**入れ子の `action.type:"UNKNOWN"` は 43件**）。⚠**未検証UIが続き380〜392 で計9件**。
>
> **🏁 P1（表現）は 2026-07-23 に完了宣言済み**（宣言・3分類・以後の運用＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭／§2 DoD／§5）。**主軸は P2/P3**＝①**§6.3 機構台帳**（宣言で正式送りした282効果の消化先＝正面40・チーム35・ゲームから除外残・アンコール19・動的比較14・ソウル11・ドライブ9 等を機構単位で）②**§7 実機検証** ③**BEHAVIOR_AUDIT（§5a・フェーズ跨ぎで継続）**。
>
>
> 0. 🎯**次の一手（2026-08-11 続き440 更新）＝Opus 側 / Sonnet 側で分ける**
>    - **【Opus 側】(1) `resolveNum` を使う `count` 消費地点の死角を閉じる**（続き440 で発見）＝`TRANSFER_TO_HAND`（`effectExecutor.ts:2288`）ほか `:1005`／`:2238` は `resolveNum(src.count)` を使い、**`resolveNum` は `{$ref}` を問答無用で 0 にする**（`execUtils.ts:118-120`）＝**動的枚数を書いても黙って0枚**。`resolveCountRef` へ寄せるか、**「ここに `$ref` を書くと0になる」を golden のトリップワイヤで固定**する。⚠これが閉じれば `WXEX1-44-E2`（続き440 で defer）も通る。
>    - **【Opus 側】(2) §3 (cxxiii) ピースのコスト二重請求の裁定**＝`executeKeyPiece` は `AUTO`/`ON_PLAY` しか積まないのに `WXDi-P14-002-E1` は `ACTIVATED`/`MAIN`＝**セットしただけでは効果が発火せず**、KEY の【起】から起動すると**印刷 Cost と同じ `cost.energy` をもう一度**払う。⚠**`executeKeyPiece` は キー と ピース の共通経路**なので片方だけ直すと キー が壊れる。**まず Type='ピース' の母集団を数えて設計判断から**。
>    - **【Opus 側】(3) §6.4 の未消化 worklist**＝番号つき表（`O-n` は着手順ではなく参照用の固定ID・欠番はそのまま）。**🆕2026-08-15 に `O-20`（全文 regex 読み・20サイト）と `O-21`（到達不能ハンドラ・19 id）を消化**（詳細は PLAN_DETAIL「2026-08-15 整理⑮」）。**🆕2026-08-16 続き517 で残0の12行を PLAN_DETAIL「2026-08-16 整理⑳」へ退避**（表に残るのは生きている12件だけ）。**🆕2026-08-15 続き484 で `O-22`（(a)(b)(c) 全部）／`O-23`／`O-24` も消化**（詳細は PLAN_DETAIL「2026-08-15 整理⑯」）。**🆕2026-08-15 続き485 で `O-19`（watcher の `triggerScope` 推論）と新設 `O-25` の本体（引用能力の自己付与）も消化**。**🆕2026-08-15 続き486 で `O-3` の最大クラスタ（`DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE` 7効果）を解体**＝新機構 `SIGNI_ATTACK_BAN`／既存 `PREVENT_DAMAGE`／盤面リセット STUB で**5効果の恒久 no-op を解消**し、残り3形を固有 id へ分割。**🆕2026-08-15 続き487 で `O-3` の `_NEXT_OPP_TURN_CLAUSE`（5）と `_THIS_AND_NEXT_TURN_CLAUSE`（4）も解体**＝新機構 `SIGNI_DEPLOY_BAN`（配置禁止を**場に出す側**に載せ既存 `deployLimitBlockReason` で判定）ほかで**7効果を是正**（うち1件は「期間つき」と型に書きながら失効地点が1つも無い**永続化バグ**）。**🆕2026-08-15 続き489 で `O-3` の `NEXT_OPP_ATTACK_PHASE_START`（2）も解体**＝新機構 `DELAY_TO_NEXT_OPP_ATTACK_PHASE`（予約は**予約した側**に積み collector は `opState` を読む）＋裏向きルリグゾーンで**5効果を是正**（⚠**A群に出ていた2件より、出ていなかった2件のほうが壊れていた**＝原文 regex で母集団を数え直すこと）。**🆕2026-08-15 続き488 で `O-3` の `EXTRA_ATTACK_PHASE`（2）／`SELF_RESTRICT_THIS_TURN`（2）／`UNPARSED_NEXT_OPP_TURN_CLAUSE`（1）も解体**＝新機構 `ADD_EXTRA_ATTACK_PHASE`／エナ支払い封じ／ターン終了時エナ返却／`POWER_MODIFY.deltaFromZone` で**8効果を是正**（うち4件は「遅延タイミング宣言の後続文が即時実行されていた」過剰実行）。**🆕2026-08-15 続き490 で `O-3` の `ATTACK_TAX_HAND_DISCARD`（1）も解体**＝`SigniAttackBan.unlessPayHandDiscard` を新設し、隣接の**無言 no-op**（引用文が `GRANT_KEYWORD.keyword` に入って一度も効かない `WXDi-P05-022-E1`）も同時に是正。**🆕2026-08-15 続き491 で `O-3` の「フェイズ／ターンのスキップ」系統も解体**＝新機構 `PHASE_SKIP_BLOCK_IDS`＋`resolveNextPhaseWithSkips`（フェイズスキップを**次のフェイズを決める1点**へ）と `resolveTurnHandover`（ターン交代判定を**1関数**へ＝`extra_turn` と新設 `skip_next_turn`）で**6効果を是正**（⚠**壊れていた6件のうち4件は STUB ですらなかった**＝未消費の `BLOCK_ACTION` id・綴りズレ・ログだけのハンドラ＝`census:stubs` に映らないクラス）。**🆕2026-08-15 続き492 で `O-3` の `UNTIL_NEXT_MAIN_PHASE_CLAUSE` も解体**＝「ルリグによってダメージを受けない」の**期間軸**（`PREVENT_DAMAGE{scope:'LRIG'}` 1本）と**走査軸**（`isLrigDamagePrevented`＝シグニ／ルリグ／アシスト／キー）をまとめ直し、新期間 `MY_NEXT_MAIN_PHASE`（`clearMainPhaseScopedState` の1点で失効）を足して**9効果を是正**。**🆕2026-08-15 続き493 で `O-3` の `NON_FIELD_ZONE_MOVE_IMMUNITY` も解体**＝「対戦相手の効果によって移動しない」の期間軸を `opp_move_immunity`（`signi_deploy_bans` と同じターン数カウントダウン）へ1本化して**5効果を是正**（⚠🔴旧 `prevent_opp_trash_from` は **set 1箇所・clear 0箇所**で永続していた＝続き487/489 に続く**3回目**の「失効地点が無い期間つきフィールド」）。あわせて「次の対戦相手のターン終了時、〜」の遅延本体を明示 defer（`DEFERRED_NEXT_OPP_TURN_END_BODY`）へ落として即時実行を止めた。**🆕2026-08-15 続き494 で `O-28` の「《無》×Nを支払わないかぎりアタックできない」5効果も消化**＝続き490 の fixup を《無》版へ一般化し、`SigniAttackBan.appliesTo:'LRIG'` で**ルリグのアタック税**軸を追加。あわせて engine の一般バグ2件（🔴`SELECT_TARGET_ONLY` がルリグ対象を扱えず**丸ごと no-op**／🔴**入れ子 SEQUENCE で内側の continuation が上書きされ消えていた**＝母集団 47＋147効果）と、🔴`performLrigAttack` の「《無》を払えないときは else で素通り＝タダでアタック」も是正。**🆕2026-08-15 続き495 で `O-30`（「〈コスト〉を支払わないかぎり、X」の回避ゲート）も消化**＝**在庫は「1効果」ではなく母集団44カード**で、「自分＝能力の持ち主が払う」形に規則が1つも無く**無条件バニッシュ**になっていた8効果を正準形 `OPTIONAL_COST{unlessPay}` へ組み替え、🔴**払う側の取り違え**（`WX24-P2-044` の MANUAL が `OPPONENT_PAY_OPTIONAL`＝使った側に払わせていた）も是正した（**golden がこの誤りを写していた**）。**🆕2026-08-15 続き496 で `O-31`（「対戦相手が払う」側）の回避クローズ4効果も消化**＝**在庫は効果単位で数え直す**（カード単位は偽陰性）。「付与そのものを止める支払い」を標準ペアで表せるよう除外④に例外を足し、🔴引用括り（「以下をN回行う。「…」」）で回避が消えていた形と、🔴【常】の正面アタック禁止が**払っても通らない**形（`cannotAttackSigniUnlessPayColorless` を新設）を是正。**🆕2026-08-15 続き497 で `O-3` の受け皿2種も解体**＝新機構 `DELAY_TO_NEXT_OPP_TURN_END`（続き489 のアタックフェイズ版と同型）／`TargetFilter.attackedThisTurn`／`OptionalCostSpec.trashOwnKey`。🔴`WDK06-R09-E1` は**相手のターン終了時に自分のシグニを1体タダでバニッシュ**していた。⚠**遅延を跨いだ照応は予約できない**（`WXDi-P09-066-E1` は受け皿のまま＝過少側）。**🆕2026-08-15 続き498 で `O-3` は完了**＝残っていた受け皿7種をすべて解体（新機構 `RETURN_FACEDOWN_LRIG_ZONE_TO_HAND`／`FIELD_SIGNI_TO_CHECK_ZONE`／`GAIN_LRIG_TYPE`／`DECLARE_CARD_NAME_LOCK`／`SigniAttackBan.exceptCardNums`）。🔴隣接で見つけた恒久 no-op も是正＝`SPDi43-02-E2`（**自分の**手札をトラッシュしていた）／`WDK17-001-E2`（【起】なのに CONTINUOUS 専用 STUB）／カード名の使用封じが**アーツ一覧と実行入口を素通り**。**次の候補＝🆕`O-32`（`REPEAT_N_TIMES` の二重実行3効果）／🆕`O-33`（アタック禁止のゾーン限定・次の相手ターン軸）／`O-28` の残23綴り／`O-4`（UNKNOWN 25ノード/25カード）／`O-25` の残3件＋【常】引用クラス／~~`O-26`（コスト節の自己トラッシュ脱落2件）~~**。🆕**この候補リストは消化済み**＝`O-32`/`O-33`（続き501/502）・`O-4`（続き499）・`O-28`（続き503）・`O-36`（続き534）・**`O-26`（続き535＝実測は2件ではなく6効果）**。生きている worklist は下の §6.4 の表を見ること。⚠**受け皿 id の「件数」だけ見て設計しない**＝続き486 では7件に**5機構**、続き487 では9件に**7機構**が混ざっており、原文を並べて初めて「大半は既存の funnel に乗る／数件だけ新UIが要る」と分かった。⚠**`parseCardEffects` の内側から `abilityBlockTextOf`／`getAbilityBlockTexts` を呼ばない**＝後者が `parseCardEffects` を呼ぶ**無限再帰**（続き487 で `build:effects` が実際にハングした）。`inferTriggerScope` が安全なのは `buildEffectsMap`＝parseCardEffects の**外**から呼ばれているから。⚠**「期間つき」と型コメントに書いてあるフィールドは失効地点を grep して実測する**＝`signi_deploy_power_limit` はリセット地点が1つも無く永続していた（続き487）。⚠**STUB を実装で置き換えると census が +N する**（`vocabCensus` は STUB を含む効果を別バケツへ逃がしているため、その効果の他の未表現語彙が同時に昇格する）＝毎回「計器の較正漏れ」か「本物の穴」かを仕分ける。⚠**在庫は §3-1 のとおり必ず実測してから着手する**＝続き483 では簿記の「58 id」が実測19 id だった（入れ子分岐を重複と誤検出していた）。🆕**続き485 では `O-19` の在庫が「推論依存」の記述に反して実測1効果**だった一方、**隣接に9カード規模の別クラス（`O-25`）が埋まっていた**＝**在庫の大小より「その層が計器に映るか」で優先度を決める**。⚠**`census:stubs` は「ハンドラの有無」で実装ありを判定する**＝ログを1行出すだけのハンドラは素通りする（続き459 の教訓）。
>    - **【Sonnet 側】(4) §7 実機検証の続き**＝続き436 で `keycost-energy-*`／`my|op-lrig-slot-*`／`card-action-*`+`data-action-label` を整備したので**新規シナリオが安くなっている**。未検証ブロックは §7 に20以上。⚠**(cxxiv) は続き463 で解決済み**（真因は parser の runtime scope 誤補完＝`ON_TURN_END` 41効果の無言不発）。次は §7 の未消化ブロックから。
>    - ⚠**共通の心得（続き435〜440 で確立）**＝①**★★セルでも開くまで投げない**（4 family 連続で偽陽性だった）②**在庫の症状記述は古い前提で live を見る**（3件が既に修正済みだった）③**罠は行番号つきで先出しすると当たる**（8例連続）。
> 0. 🎯**次の一手（2026-08-11 続き432 更新）＝§6.4 の残**＝(a)~~離場置換の対話 policy／`WXDi-CP01-023`／消化済み項目の宿題~~ **✅続き430〜432 で完了**（残は**置換の「してもよい」辞退**＝ライフクラッシュ置換側）。(b)**UNKNOWN 36ノード/34カード**（1カード1機構の単発が大半）(c)**所有者語の「前」に付く修飾が filter に載らない**（`WX25-P3-014-E1` 等・20枚規模）(d)**残 A群16件の明示 defer 見直し**（§6.3 の機構が進んだものから解ける）。**Sonnet 側＝§7 実機検証（続き428 のエナ支払い回帰確認が最優先）**。以下は旧「次の一手」（参考）。
>
> 0-旧. **granted-auto collector の timing 汎用化 →「このゲームの間」型3枚**（`WXDi-P11-002`／`P11-003`／`P04-002`）。⚠**実測済みの障害**＝付与ストア（`lrig_granted_auto_effects`／`game_granted_auto_effects`）の収集は**timing ごとに4箇所へ別々にハードコード**されている（`ON_ATTACK_LRIG`＝`grantedAuto.ts`＋`triggerCollect.ts:535`／`ON_CARD_MILLED_FROM_DECK`＝`:1604`／`ON_ENERGY_TO_TRASH`＝`:1944`／相手側の汎用 scope＝`:3743`）。3枚は **timing 3種＋`P11-002` は付与先が対戦相手**なので、**先に「付与ストアを任意 timing で走査する共通経路」を作る**ほうが安い（**§4 教訓 (i) の同型＝「型ごとに枝を足す層」の再来**）。次点＝**「ルリグとシグニ」母集団の残り4枚**（`WD13-010-E1`／`WXDi-P06-031-E1`／`WXDi-P14-040-E1`／`WXK07-005-E3`＝機構が別々なので1枚ずつ）／`WXDi-P14-002`／`WXDi-P16-002`。**機構待ち8枚**と**計器の死角**は §4 進捗サマリ㉕を参照。次点＝§6.3 の残 **C／E／F／G／K**。
>    ⚠**(i) の ★セルは3回連続で薄い**（377m・378・379 とも上位セルの大半が条件節用法のクロス計上・計器の誤検出）＝**取るなら必ず `--cell` を開いて0件でないことを確かめてから**。
>    ⚠**条件に語彙を足すバッチでは、両評価器（`evalCondition`／`checkActiveCondition`）と両 `matchesFilter` の扱いを先に決める**＝続き378 は**揃えるのが正しく**（`isDisona`）、続き379 は**揃えてはいけなかった**（`powerRange`＝持続側を実効パワーにすると循環）。**「パリティを取る」は自動的に正解ではない。**
>    ✅**続き379 で「`isDisona` の条件節グループ」は消化済み**（8効果＝常在3＋解決時5・新しい条件型ゼロ）。
>
>    🏁**⓪-2 の7効果は続き377n で完遂**（(a) `execAttachCharm` の複数ペア4／(b) `execGrantKeyword` の `upToCount` 2／(c) `classMatchesDiscardSigni` の配線1）。**在庫2効果を取りに行ったら `owner:"any"` の誤りが14効果出た**＝**「関数名まで特定して据置」した在庫は調査ゼロで入れるので費用対効果が最も良い**。次に据置するときも同じ粒度で書き残すこと。
>
>    🏁⚠**(iv) 計器較正は枯れた（続き377m 実測）**＝条件節クラスタ258件では5語彙 −17 が取れたが、続く「Nまで」52件は**1件も較正できず全件が実バグ**だった。**較正で census を下げ続けることはもうできない**＝以後 census を動かすのは機能是正のみ。
>    ⚠**★★セルの残りも薄い**＝続き377m でセル6本を全数分類したところ **41 miss 中 真の脱落は2件**（`levelExact × SIGNI`／`isDisona × SIGNI`／`cardClass × TRASH{HAND_CARD}`／`cardClass × BANISH{SIGNI}` は**4セルとも0件**＝全部が条件節用法のクロス計上）。**(i) から取るなら、まず `--cell` を開いて0件でないことを確かめる。**
> 
>    ⚠**(iv) stale live の「枯渇」は範囲つきで読む**＝続き377h の宣言は *census が見える範囲* だけで、続き377i で `thisCardOnly` のように **census 語彙に無い脱落**がまだ大量にあった。根本原因（`build:effects` のカード単位温存）は続き377i で解消済みなので、**以後は parser を直せば自動で live に届く**。手作業の刈り取りは原則不要。
>    - **⓪ `docs/_partial_fresh.json` は残り3カード＝すべて機構ギャップ**（続き377k で 10→3。行列は「採用待ち」ではなく **parser のバグ台帳**として読む＝続き377j の教訓）。内訳＝`WXK07-031`（fresh が `UNKNOWN`＝「対戦相手の効果はバニッシュ以外であなたの＜宇宙＞のシグニを場から移動させない」の語彙が無い／E2 は REVEAL_UNTIL の構造違い）／`WXK10-075`（fresh が `GRANT_FIELD_SIGNI_ABILITY`＋STUB へ落ちる＝アクセホストへの付与＋自パワー参照セット）／`WDK17-009`（fresh の2段目が `STUB:CONDITIONAL_ARTS_COST`＝live の `LIFE_CRASH{triggerBurst:false}` に届かない）。**この3枚は §6.3 機構台帳として扱い、行列そのものは片付いたものとして読む。**
>    - **🏁⓪-2 (ii) 在庫＝「Nまで」上限がengine側で消費されない7効果 ＝ 続き377n で完遂**（(a) `execAttachCharm` の複数ペア4件／(b) `execGrantKeyword` の `upToCount` 2件／(c) `classMatchesDiscardSigni` を `execRevealAndPick` へ配線1件）。**ペア数＝`min(チャーム候補, 付与先候補, charm.count, to.count)`／`upToCount` は BANISH と同じく `selectOrInteract` の第3引数へ／捨札参照は `resolveDiscardLevelFilter` を先に通す**。⚠**波及して見つかった本命は `owner:"any"`＝engine で `tgtOwner="opponent"` に解決される**（14効果が相手のシグニに付与していた）＝対象名詞句そのものから所有者・体数・上限を取る `signiClauseTargetSpec` を新設して解決。詳細は [BUGFIXES.md](./BUGFIXES.md) の続き377n エントリ。
>    - **① 未分類の ★★セルから取る**（miss/has・2026-08-08 実測）＝`cardClass × TRASH_CARD[filter]` 7（284）／`cardClass × TRASH{HAND_CARD}` 6（70）／`color × SIGNI[filter]` 10（111）／`powerRange × SIGNI[filter]` 10（498）／`levelExact × SIGNI[filter]` 7（69）。⚠**分類済みで「1 regex で N 効果」型ではないもの**＝`cardClass × (filter無)` 25（88・5系統の寄せ集め）／`cardClass × SIGNI[filter]` 18（440・15件がクロス計上）／🆕`cardClass × POWER_MODIFY{SIGNI}` 4（172・続き377l で左右ゾーン3件を消化＝残りは在庫済みの `WX05-044-E1`／`WX24-P3-059-E1` とトリガー主語のクロス計上）。🆕**`color × SIGNI[filter]` は着手前に注意**＝続き377l の下見で 10件のうち**5件が「エナゾーン/場/トラッシュに〈色〉のカードがあるかぎり」の条件節**、2件が「手札から〈色〉のシグニを1枚捨ててもよい」の**効果内コスト**＝対象フィルタは実質3件（較正候補）。
>    - **② `eachDistinctLevel` 28（has 1）** ＝最大の塊だが同入口に配線済みなし。**まず「機構が無いのか、キー綴りが違うのか」を確かめる**（trap (h)）。
>    - **③ 小粒だが has があるセル**＝`powerRange × GRANT_KEYWORD{SIGNI}` 9（8）★／`levelExact × POWER_MODIFY{SIGNI}` 9（7）★／`isDisona` 23（32）。⚠`powerRange` は「パワーを＋N」＝**action の値**との取り違えが濃い（**較正候補**）。
>    - **④ 🆕stale live で見つかった7つの壊れ方は parser 側にも残っている可能性がある**（続き377h）＝**duration 取り違え**（`UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN`）／**付与対象の `thisCardOnly` 脱落**／**条件節の常時true化**／**「そうした場合」の対象取り違え**／**trigger timing の平坦化**（内側の付与能力を最上位へ）／**【使用条件】の焼き付き**／**条件節由来の `excludeSelf` が相手側の対象フィルタへ漏れる**。**この7型を探索キーにして全CSV走査すると新しい母集団が取れる。**
>    - ⚠**着手前に必ず読む罠**＝(a) **素の `parseStoryFilter`/`parseLevelFilter`(文全体) を対象フィルタに使わない**＝**`signiClause*Filter` 3兄弟**を使う。(b) **曖昧なら付けない**。(c) **auto-commit があるので `git stash` で A/B が取れない**＝ベースラインコミットから `git show <sha>:<path>` で取り出す。(d) **exec 側の配線を必ず確認する**（`matchesFilter` は `excludeSelf`/`upToCount` を見ない）。(e) **セルは入口であって終点ではない**＝ビルダー全体を読む。(f) **枚数・値だけ先に直さない**。(g) **★★セルの miss 数は見込み件数ではない**。(h) **同じ概念に2つのキー綴りが併存していないか先に確かめる**。(i) **同じ語彙でも入口ごとに壊れ方が違う**。(j) **A/B の件数＝直った件数ではない**。(k) **採用前の確認は JSON パースによる構造比較で**。(l) **セルは母集団の索引であって母集団そのものではない**。(m) **安全弁はコメントの規律ではなく関数の戻り値にする**。(n) **census が減らないときは live と fresh を全件突き合わせる**。(o) 🆕**「held が新しい」は「held が正しい」ではない**（実測 40件中2件が逆方向）＝**全件原文照合は省略できない**。(p) 🆕**`manualEffects.ts` の MANUAL 定義が live より古いことがある**＝held が消えない MANUAL 効果は**ソース側**を直す。
>    - **✅消化済み**＝「他の」ゲート棚卸し（377）／`noGuard`（377b）／アイコン系（377c）／`levelRange`（377d）／全体バフの語順＋据置held（377e）／ON_ATTACK_SIGNI の味方側トリガー主語＋`excludeSelf` の過剰発火（377f）／stale live の一括解消 38効果（377g）／(iv) stale live の刈り取り 37効果（377h）／**収穫マージの効果単位化 70効果（377i・stale live の構造的原因を解消）**／`_partial_fresh` 行列の parser 是正 7効果（377j）／`_partial_fresh` 行列を 10→3カードへ 19効果（377k・acceHost の到達不能規則／2グループ手札コスト／条件節の後続文への持ち上げ／孤立 reorder の畳み込み）／左右のシグニゾーン機構の新設 15効果（377l・`zoneSide`＋`IS_SELF_IN_SIDE_ZONE`。付与側のゾーン限定は中央すら無かった／`from:[種別]` の過剰保護も是正）／🆕**Codex 委譲＝`isDisona`/`excludeResona` の対象フィルタ合成漏れ 22効果（378・engine の `matchesFilter` パリティ穴で5効果が全味方バフだったのを含む）**／Codex 委譲3バッチ（377m）＝(iv)計器較正 第3バッチ〔条件節クラスタの5語彙・偽陽性17件〕・第4バッチ〔置換3語彙・偽陽性3件。🏁ここで (iv) 枯渇〕・(i)配線ギャップ 第18バッチ〔「Nまで」上限スロットの脱落 7効果。残7効果は engine 未配線で据置＝⓪-2 へ〕**。
>    - **(ii) 機構ギャップの安い在庫**＝`parseStatus:UNKNOWN` の完全no-op **6件**（🆕`WX25-P1-048-E1` を追加＝レベル１以上のアシストルリグでアタックできる）／`PARTIAL` **23件**／`LOOK_PICK_CHAIN` の exact-N 表現ギャップ **23効果**（`cardClass × (filter無)` の10件がここに合流）／「場に《ライズアイコン》を持つシグニがN体ある場合／あるかぎり」の条件型 **5件**／左右のシグニゾーン限定の filter キーが無い 3効果／**【ソウル】が付いているシグニの filter キーが無い 1効果**（`WXDi-P04-016-E1`）／🆕**`WX25-P1-061-E1` の `triggerScope:any_ally`＋`placedFromTrash`**（377h で timing だけ是正した途中段階。足すと golden の「段階2 mandatory集合」が 1455→1454 に戻る）。
>    - **(iii) 構造混線の在庫**＝🆕**`WXEX2-18-E2`**（続き378 で据置＝原文「**対戦相手のシグニ1体を対象とし**、レゾナではない**あなたの**＜遊具＞のシグニ1体をバニッシュする。そうした場合、**それを**エナゾーンに置く」なのに live は BANISH も SEND_TO_ENERGY も `owner:"opponent"`＝**2対象の owner ごと取り違え**。⚠**誤った相手対象に `excludeResona` を足して誤りを固定しないこと**＝golden にトリップワイヤ設置済み）／🆕`WXK05-052-E1`（「対戦相手のシグニを２体まで対象とし、**このシグニと同じシグニゾーンに【シード】がある場合**、次のターンの間、それらは「【常】：アタックできない。」を得る」＝**条件節の【シード】をキーワードと誤読**して「あなたのシグニ1体に【シード】を付与」に化けている。⚠体数だけ広げると誤りを増幅するので golden にトリップワイヤ設置済み〔続き377n〕）／`WXK05-043-E1`／`WX24-P3-059-E1` ほか §5d-0 (iii) の登録分／続き377f で分類した8件（`WDK10-001-E3`・`WXEX2-48-E1`＝トラッシュから選んだシグニをライフに加えるはずが `ADD_TO_LIFE{fromTop}`／`WDK07-E07-E1`・`WXK10-074-E1`＝【アクセ】付与が丸ごと脱落／`WX05-080-E1`／`WX25-P2-079-E1`／`WX16-003-E1`）／**コスト節の限定脱落**（`WX05-044-E1`＝「他の＜古代兵器＞のシグニ1体をバニッシュする」コストが丸ごと落ちて**無料で撃てる**／`WX14-016-E1`＝アンコールコストが別物／`WX08-036-E1`＝対象側のパワー条件をコスト側に載せている／`PR-322-E1`）。／🆕**続き377k の発見3型**＝(a) **acceHost の複合形3枚**（「これにアクセされているシグニのパワーを＋Nし、それは「…」を得る」＝`WX20-072`／`WXEX2-69`／`WDK17-015`。単体の `POWER_MODIFY` 形は続き377k で配線済みだが、この複合形は Part1 の POWER_MODIFY 分岐に載らず live の `GRANT_ACCE_HOST_ABILITY` に届かない）／(b) **`WX12-CB02-E1` の多分岐が2段しかない**（原文はレベル1〜5の5分岐だが live MANUAL はレベル1・2のみ＝レベル3〜5が丸ごと無い。⚠parser 側で無条件 SEQUENCE に足すのは禁止＝golden にトリップワイヤ）／(c) **`suppressOnPlay` の配置アンカーが特定できない2形**（`WX20-020`＝CHOOSE の④に属する末尾文が buildChoose の外に出るため選択肢の `ADD_TO_FIELD` に載らない／`WXDi-P11-007-E3`＝直前が `REARRANGE_SIGNI` で `suppressOnPlay` を持てる型が無く `BLOCK_ACTION{ON_PLAY_ABILITY}` が死んだまま残る。live も同じ）。／🆕**続き377l の発見2型**＝(d) **`WX10-036-BURST` の付与キーワードが条件側の【チャーム】に化けている**（正しくは【アサシン】。live も同じ。⚠「`を得る/を持つ` に隣接する【K】を取る」一般化は 36カード中16カードを退化させたので**禁止**＝golden にトリップワイヤ5枚。個別に直すなら「【K】が**付いているかぎり**」等の条件表現を `isPossessionFilterKw` と同じ要領で除外する）／(e) **ゾーン限定付与の duration 取り違え**（`WX05-034-BURST`「このターンと次のターンの間」・`WD15-002-E1`「このターン」が `duration:"PERMANENT"`＝**永続化して効きすぎる**。duration 軸は続き377h の7型の1つと同系統）。
>    - **Sonnet 側**＝§7 実機検証（タスク1）。⚠コイン支払いは `BattleScreen.tsx` の**10経路**のうち ACTIVATED【起】1本しか実走していない。
>    - ⚠**見積もりの現在地**＝census **924**／被覆マトリクス miss **291**。直近バッチの実績＝12／30／17／8／15／11／38／37／70／7／19／15／23／**22**効果。**census が動かない回でも効果は直る**（377c は census 据置で17効果）＝**census の増減だけで成果を測らない。**
> 1. **自分のモデル側のタスク表（§3）から取る**。**Opus の主戦場＝§6.3 の機構実装（機構単位・実IDは `docs/_p1_classification.txt`）＋タスク12 の生き残り在庫**＝🏁**現存0件**（2026-08-08 に (cxv)(cxiii)(cxiv)(cxvii)(cxviii) を残0クローズ＝受け口は空。⚠この行が挙げていた (lv)/(lxvi)/(lxxxviii)/(xciii)/(xciv)/(xcvi)/(xcvii)/(c) は 2026-08-06 に全件残0クローズ済み＝§3 の在庫表が正）。**🏁(xcii)(xcv)(lxvii)(xcviii)(lxviii)(xcix) は 2026-08-04 に残0クローズ**。**(lxx)／(lxxviii)／(lxxxiii)／🏁(lxxxii) は 2026-08-02 に残0クローズ＝§3 の表から退避済み**（完了行原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理③」）。それ以外の残0在庫の完了行原文は同ファイルの各整理節。**🏁タスク16 も残0クローズ**。**Sonnet の主力は タスク1（§7 実機検証）**＝未検証UIの単一 worklist は §7 に集約。⚠**§6.3 H と続き298〜Batch F の全件が UI 未検証**。
> 2. **手順はスキルに従う**＝`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。⚠`/census-batch` は P1宣言により**新規バッチを切らない**（census 外の計器から新系統が見つかった場合のみ）。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🏁 P1完了宣言済み（2026-07-23）＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭の宣言節が正**。census 高シグナル 1581 を「**§6.3 正式送り 282／粗網のみ偽陽性 116／長テール単発・別節偽陽性 1183**」へ3分類（機械分類の実IDは `docs/_p1_classification.txt`）。根拠＝最短ルートのバッチ1〜5＋再クラスタリング生存バッチ（11「相手が選ぶ」43・6「数量比例」27）を全消化・バッチ2〜4は投入前実測で枯渇（別節表現済みの census 偽陽性主体）＝「1 parser規則→N効果」の系統クラスタが出尽くした＝逓減限界。**以後この節の worklist から新規バッチは切らない**＝census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、残バグは BEHAVIOR_AUDIT／semantic audit／PARTIAL 計器／§7 実機で単発発見→直修正する。§6.3 送り282効果の消化先は §6.3 台帳（P2/P3）。


> **⚠2026-08-07（続き369）に置いた前提**＝**census の高シグナル0は「すべてのカードが完璧に動作する」の十分条件でも必要条件でもない。**
> census は文字列突き合わせの発見器で、死角が4つある（§5c 末尾）。逆に、実データを見ると高シグナルの多くは
> **計器の対応語彙漏れ**でもある（続き365/368 で計68効果を較正）。したがって**完了判定は BEHAVIOR_AUDIT（§5a）と §7 実機検証で出す**。
> census は「回帰ゲート」と「未照合の効果を優先度つきで列挙する索引」として使う。
### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [x] **未実装action型 worklist**（§6.1）＝**✅残型0（続き204/204b でクローズ）**。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

> **🏁🏁 2026-08-07（続き369）＝§5c の「文型バッチ」としての役割を終了する（店じまい）。** 以後 census は
> **回帰ゲート**（`BASELINE_HIGH`）と**発見器**としてのみ維持し、**新規の文型バッチは切らない**。残る
> 「テンプレ2効果以上」77本は §6.3／Opusタスク12 の**機構待ち**へ移送し、主戦場は **§5d「1効果ずつの原文照合」** へ移す。
>
> **根拠（続き369 に実測）**＝残り高シグナル 1199 効果のうち **874（約73%）は「単発テンプレにしか現れない効果」**。
> そこからシード固定で**無作為12件**を抽出して原文照合したところ、**判定できた11件すべてが実バグ**だった
> （残り1件はトークンで原文未取得）。一方、私が枚数順に消化してきた「2効果以上」の頭は **33/37 が計器の偽陽性**。
> これは偶然ではなく**構造的**＝**大きいクラスタ＝systematic な文型＝parser が既に正しく扱っている**から偽陽性が濃く、
> **単発＝汎用規則から漏れた1件もの**だから実バグが濃い。**枚数順に取ると、実バグの薄い側から掘ることになる。**
>
> ⚠**そして単発テールは「文型の問題ではない」**＝無作為12件の内訳は
> 「対象フィルタの脱落」6／「owner 取り違え・任意性喪失」2／「条件節・機構ゲートの脱落」2／「重度の構造混線」1。
> いずれも**効果はだいたい parse できているが修飾が1つ落ちている**形なので、文型テンプレでまとめても作業単位にならない。

> **🏁 2026-07-23 P1完了宣言により worklist 凍結**＝下記「残りの消化対象」は宣言時点の歴史記録（3分類は [ROADMAP](./P1_COMPLETION_ROADMAP.md) 冒頭）。census は回帰ゲート（`BASELINE_HIGH=1580`）としてのみ維持し、**新規の文型バッチはここからは切らない**（census 外の計器から新系統が見つかった場合のみ検討）。「残死角」4項は引き続き有効＝BEHAVIOR_AUDIT／PARTIAL 計器の領分。

**目標＝`npm run census` の高シグナル欠落（現ベースライン＝§4 恒久指標参照・2026-07-22 時点 **1817 効果**）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **消化対象の worklist は 🏁P1完了宣言（2026-07-23）で凍結**＝宣言時点の全文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避（2026-08-02）。3分類は [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) 冒頭、最新件数は `docs/_vocab_census.txt` が正。
- **🎯 現在の消化目標（2026-08-07 続き365〜・ユーザー指示）＝「テンプレ1本あたり2効果以上」の 91テンプレ／248効果（ユニーク効果222・カード215）を全消化する**。単発（1効果）テンプレ 1327本は対象外。母集団は `npm run census:clusters` → `docs/_census_clusters.txt` を件数順に見れば再生成できる。
- **✅消化済みテンプレ**
  - **（続き364）「このシグニはパワーがN以上であるかぎり、〜」（主語先行形の自己パワー閾値）11効果／11カード**＝`genericKagiri` が条件節を無言消費して**無条件付与の過剰効果**になっていた系統。parser パターン6a 1本で是正（census 1283→1274）。
  - **（続き365）「あなたのエナゾーンにレベルA～Bの＜X＞のシグニがそれぞれN枚以上ある場合」6効果**＝`ENERGY_EACH_LEVEL_FILTER_GTE` へ持ち上げ（4効果採用・`WXK09-051` は then/else 両方実行の二重発動だった）。⚠汎用規則を入れたら旧 `wrap('WXK09-083-E1',…)` の名指し hack を撤去すること（二重 CONDITIONAL になる）。
  - **（続き365・計器較正）「〈それ|そのカード〉が〈desc〉(ではない)場合、」＝`REVEAL_AND_PICK{filter}`/`elseAction` が正表現**（テンプレ7本＝「レベルNのシグニ」5／「レベルN以上の＜C＞のシグニ」5／「そのカードが＜C＞」4／「それが＜C＞のシグニ」3／「そのカードがシグニ」3／「それがシグニ」2／「＜C＞か＜C＞のシグニ」5 ほか単発込み **35効果**）。⚠**残渣チェック必須**＝desc からモデル化できた識別子を除いて何か残るなら covered にしない（`WDA-F04-10`「共通する色を持つ」・`WXDi-P08-062`「《X》以外の」・`WXK11-048`「よりパワーの低い」＝filter に載っていない**実バグ**を masking しないため）。
  - **🏁（続き366）「このターンにあなたが《コイン》を合計N枚以上支払っていた場合」10効果／10カード**＝`PlayerState.coins_paid_this_turn`（支払いのみ加算・ターン境界で0）＋Condition `COINS_PAID_THIS_TURN` を新設して**機構ごと実装**。条件節が丸ごと落ちて**無条件発火**していた（アタックのたびに必ずバニッシュ/エナチャージ/パワー−）。⚠加算は `BattleScreen` の支払い経路10箇所＝golden にソース静的走査のガードを入れた。**要実機検証**（§7・Sonnetタスク1）。
  - **🆕（続き368）「このターンに対戦相手のカードがあなたの効果によってN枚以上デッキに移動していた場合」4効果**＝規則は**あった**が `parseSingleSentence` の局所 `CLAUSES` だけで**共通表に無く**、【自】文の hoist 経路で拾えず無条件発火していた（`WDK09-014`×2／`WXK06-068`／`WXK06-070`）。`STATE_CONDITION_CLAUSES_V2` へ移動。⚠「規則が無い」と「共通表に無い」は別物＝**同じ文型なのに一部だけ直らない**ときはどの表に居るかを疑う。
  - **🆕（続き368・計器較正）33効果**＝`minPower`（`FIELD_SIGNI_POWER_COUNT` の閾値・パワー閾値へ）／`LRIG_LEVEL`（センタールリグのレベル閾値・レベル閾値へ）／`Under`（小文字 `under` が camelCase の `handToUnderSelf` に**部分一致しない**・下置きコストへ）。⚠**対応語彙は部分一致なので大文字小文字で穴が空く**。spot-check 12件で masking なしを確認。
- **⏳機構待ち・見送りと判定したテンプレ（続き368 トリアージ）**
  - 「N枚以上ある場合」6＝**ルリグ/シグニの「下」のカード枚数比較の条件型が無い**（`THIS_CARD_HAS_UNDER` は有無のみ）。二段閾値（5枚以上→A／7枚以上→追加でB）も伴う。
  - 「【使用条件】【チーム】＜C＞＆全員レベルN以上…」3＝`使用条件` が `GRANT_KEYWORD` の keyword 文字列に化け、本体の GRANT_LRIG_ABILITY も平坦化。**ピースの使用条件＋ルリグ付与**の構造ごと作り直しが要る。
  - 「それらが共通するクラスを持つ場合」3＝**場のN体が共通クラスを持つ**条件型が無い（`LAST_PROCESSED_MATCHES{shareClass}` は直前処理カード用・`FIELD_SIGNI_ALL_DISTINCT_CLASS` は逆向き）。
- **次に見るべきテンプレ（枚数順・2026-08-07 続き368 時点で **77本・192効果**）**＝「N枚以上ある場合」6〔ルリグ/シグニの**下**のカード枚数＋二段閾値。`THIS_CARD_HAS_UNDER` はあるが**枚数比較の条件型が無い**＝機構寄り〕／「あなたが次にスペルを使用する場合」5〔次回スペルのコスト軽減予約＝機構〕／「その中からカードN枚を【トラップ】として設置してもよい」5／「【常】：対戦相手がシグニを配置する場合」4〔配置時の応答窓＝機構〕／「そのカードが＜C＞の場合」以下は①で消化済み。⚠**選ぶ前に engine/型が表現できるか必ず確認**（不可なら §6.3 か Opusタスク12 へ送る）。
- **進め方＝`/census-batch` スキルに定型化済み**（`.claude/skills/census-batch/SKILL.md`＝続き23確立のパイプライン＋必須ガードレール込み。原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c）。概要＝①`census:clusters` でテンプレ選定→②既存DSL型で表現できるか確認（不可＝機構待ちとして §6.3 へ）→③parser 規則追加（**JSON手パッチではなく parser を source of truth に**）→④`build:effects`→⑤`heldReview` spot-check→`--adopt`（**STUB退化・「代わりに」昇格・別STUB id 化は採用しない**）→⑥golden 1件/テンプレ＋全ゲート＋BASELINE_HIGH 更新。旧手順（census明細から手パッチ）は廃止＝parserWorklist held を増やさない。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き18更新＝続き17記載の (a)トリガー種別 (b)小さい数 (c)出現条件 (d)そうした場合誤変換 はすべて98計測に組み込み済み）**＝文字列突き合わせで原理的に見えない残り4つ：(a) **参照解決の誤り**（「それ」の指し先取り違え＝WX09-015 の bounce 対象 self 化。両側に語彙が揃うため不可視）。(b) **効果単位の粒度**（同カード別効果に語彙があれば合格＝カード単位判定のマスキング。消化が進んだら効果単位化）。(c) **JSONは正しいが engine 実装が違う**（behavior-audit／golden の領分）。(d) **文間の実行順序・依存関係**。~~横断的再発防止案＝parser の無言フォールバックに parseStatus:PARTIAL 刻印を義務付ける~~ **✅実装済（2026-07-07・続き38）**＝IS_MY_TURN化（条件抽出失敗の常時true化）・UNKNOWNステップ無言除去（リコレクト/multi-dest分割）で `markSilentFallback()` → fresh の parseStatus を PARTIAL 降格＋`docs/_partial_report.txt` に理由明細（**初回計測142効果＝IS_MY_TURN化125/multi-dest11/リコレクト8・逓減計器**）。parseStatusのみの差分は buildEffectsJson/parserWorklist とも比較から除外（held を汚さない・137枚吸収）。新たな無言近似を parser に足すときは **markSilentFallback を必ず呼ぶ**（「そうした場合」常時true等の意図的慣例は刻印しない）。

### 5d-0. ✅**工程改善3件（2026-08-07 続き375 でユーザー合意 → 続き376 で①②③とも完了）**

> **なぜ**＝続き369〜375 の7セッションで **82効果／census 1199→1162（−37）** を消化した。平均 **約12効果・census −5.3／セッション**で、残 **1162効果**（クラスタ union で数え直して **1162＝census 公称と完全一致**・続き376 実測）。このまま1件ずつ探すと **約100セッション**。しかも**バッチあたりの収穫は逓減している**（36→12→6→4→4）。**探索コスト自体を下げないと終わらない。**
>
> **🏁続き376 で3件とも完了。以後の worklist は下の「③ 作業種別 worklist」が正**（クラスタ別の worklist は索引としてのみ残す）。

#### ✅① 被覆マトリクスを常設スクリプト化（`npm run census:wiring`）— 続き376 完了

**根拠＝7バッチ中4バッチが同じ形**（「語彙は型にも engine にもあるが、一部の入口から呼ばれていない」）。1件ずつ原文照合で探す必要はなく、**(語彙キー × アクション入口) の被覆マトリクス**で機械検出できる。続き375 で試作したところ **134件を1パスで検出**した：

| 語彙キー | 配線済み | 未配線 | 備考 |
|---|---|---|---|
| `eachDistinctLevel` | 1 | **29** | ほぼ手つかず＝最大の未消化 |
| `isDisona` | 21 | **35** | WXDi-P12/P13 系に集中 |
| `noGuard` | 61 | **14** | うち6件は**同じ `TRASH_CARD` 入口で56件配線済み**＝明確な穴 |
| `levelParity` | 4 | 9 | |
| `excludeResona` | 1 | 6 | |
| `noRiseIcon` / `nonColorless` / `excludeCardName` / `levelEqTrigger` ほか | — | 各1〜5 | |

**🏁続き376 で `scripts/censusWiring.ts` として常設化（`npm run census:wiring`／明細 `docs/_census_wiring.txt`）。** 試作の数字は再現できた（`noGuard` 61/14・`eachDistinctLevel` 1/29・`levelParity` 4/9・`excludeResona` 1/6 が完全一致、`isDisona` 21/34 は試作の 21/35 と1件差）。**語彙表を26キーへ拡張して miss 合計 134→203。** 走査 7721効果（STUB除外 2164／MANUAL除外 756）。

**新規に見つかった大物3つ（試作の表には無かった）**＝`isDisona` **34**（原文は「《ディソナアイコン》**の**シグニ」という**連体の「の」**で書かれる。試作が「を持つ」で探していたら 0 になる＝**語彙表の正規表現は必ず実データで表記を確認してから書く**）／`hasRiseIcon` **31**／`hasCrossIcon` **22**。⚠後2つは**過剰効果として実害が明確**＝`WX07-010-E1` ほか7効果「あなたの《クロスアイコン》を持つシグニのパワーを＋1000」が filter 無し＝**自分の全シグニに+1000**、`WX16-026-BURST` ほか9効果「トラッシュから《ライズアイコン》を持つシグニ」が filter 無し＝**どのシグニでも回収できる**。

**使い方**＝`npm run census:wiring` でセル一覧 → `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>` でそのセルの効果IDと原文を全部出す → 全数分類 → parser の該当ビルダーへフィルタ合成を1本足す。**★印（同じ入口に配線済みの効果がある）が付いたセルが最優先**＝「同じ入口の他の効果は正しいのにこれだけ落ちている」＝明確な穴。

**🆕続き376b＝語彙表を大クラスタへ拡張（miss 203 → 541）。** 従来の26キーは**マイナーな真偽値フラグだけ**で、census の大クラスタ（クラス指定154／レベル閾値57／色79 ほか）を1つも見ていなかった。②の無作為20件でも配線ギャップ5件中2件がここ（`WX12-016-E1` の色／`WXDi-P02-073-E1` の level:1）だった。追加した6キー：

| 語彙キー | has | miss | 性質 |
|---|---|---|---|
| `cardClass`（`story`/`cardClass` 別名対応） | 1407 | **154** | **91%が既に配線済み**＝残りは穴が濃い。ただし条件節用法の誤検出も濃い |
| `levelRange` | 247 | **81** | |
| `color` | 297 | **36** | |
| `powerRange` | 507 | **30** | ⚠「パワーを＋N」は filter ではなく action の値＝取り違え注意 |
| `levelExact`（レベル丁度） | 103 | **29** | |
| **`triggerSubjectClass`** | 37 | **8** | 🆕**トリガー主語**（下記） |

**🆕トリガー主語のクラス限定＝新発見の系統バグ（8件・即バッチ可）**＝「あなたの**＜凶蟲＞の**シグニ1体がアタックしたとき」の**主語限定が丸ごと落ちて `ON_ATTACK_SIGNI` にフィルタ無し**＝**どのシグニがアタックしても発火**する過剰効果。⚠**同型44件のうち36件は `triggerFilter` を持っており、無いのは8件・全部 `ON_ATTACK_SIGNI`** ＝直す場所が1箇所に確定している。`npx tsx scripts/censusWiring.ts --cell 'triggerSubjectClass:TRIGGER{ON_ATTACK_SIGNI}'`（配線済みの見本 `WX25-CP1-047-E1`／`WXDi-CP02-102-E1` も出る）。**直す場所は target の filter ビルダーではなく parser の timing/トリガー抽出**なので、この語彙だけ入口ラベルを timing に差し替えている（`labelBy:'timing'`）。

**⚠⚠セルの miss 数は「1本直せば N 件直る」ではない**（続き376b に実測で判明・**この計器を使う人が最初に読むべき注意**）。判定は**効果単位**だが、その効果は**持っている入口ラベル全部**のセルに計上される＝「原文にフレーズはあるが、それは同じ効果の**別の入口**に掛かっている」効果が関係ないセルにも miss として出る（**クロス計上**）。実測＝`cardClass × SIGNI[filter]`（miss 46）の中身は**少なくとも4系統**だった：
- ①**対象フィルタの真の脱落**（`WDK05-T07-E1`＝「あなたの＜遊具＞のシグニ2体まで」が**自分の全シグニ**を戻せる）
- ②**クロス計上**（`PR-322-E1`＝クラスは対象シグニではなく**トラッシュ側**に掛かる語）
- ③**トリガー主語**（`WX13-037-E2`。→ `triggerSubjectClass` として分離済み）
- ④**コスト側のフィルタ**（`WX05-044-E1`＝「他の＜古代兵器＞をバニッシュする」コスト）

**①②④の切り分けは `--cell` で原文を読むしかない＝セル選定後の全数分類は省略できない。miss 数は「掘る価値の指標」であって「見込み件数」ではない。**

**実装方針**（✅**続き376 で全項目そのまま実装済み**。以下は設計記録として残す）：
1. `docs/_effect_srctext.json` × live JSON を全数走査。
2. `[原文フレーズ正規表現, TargetFilterキー]` の表を持つ（**既に型にも engine にも実装済みの語彙だけ**を載せる。未実装語彙は §6.3 の領分で別物）。
3. 各効果について「**filter を保持しているアクション型**」を列挙してラベル化（`TRASH_CARD` / `SEARCH` / `ENERGY_CARD` / `SIGNI` / `(filter無)` 等）。
4. 原文にフレーズがあるのに JSON にキーが無い＝miss、あり＝has として **(キー, 入口ラベル)** のセルに集計。
5. **一度も配線されていない語彙（has が全0）は除外**＝それは「未実装」であって「配線漏れ」ではない。
6. 出力は miss 降順。⚠STUB/MANUAL 含む効果は除外（別経路）。

**効果**＝作業単位が「1効果」から「**1セル（語彙×入口）**」に変わる。134件は **6〜10バッチ**で消化できる見込み（手探りなら15〜20セッション相当）。→ 実装後は **203件**なので **9〜15バッチ**が現実的な見積もり。

⚠**偽陽性は必ず混じる**（リマインダー文の語・engine が原文から直接読んでいる形＝【ビート】コスト等）。**セルを取るたびに全CSV走査で用法を分類してから配線する**という §5d の既存規律は変えない。

#### ✅② 残1162の**真バグ率を測り直した**（無作為20件・シード固定）— 続き376 完了

**根拠＝続き369 の「11/12 が実バグ」は古かった。** 易しい系統を7バッチ消化した後の母集団で測り直した。

**手順（再現可能）**＝`docs/_vocab_census.txt` の `### 高シグナル` 行を全部 union（注記の `（…）` を剥がすと **ちょうど 1162＝census 公称と一致**）→ `mulberry32(20260807)` で20件抽出 → 原文（`docs/_effect_srctext.json`）と live JSON を並べて目視照合。

**🎯結果＝真バグ 14／20＝70%**（続き369 の 11/12＝92% から**大きく下がった**）。**内訳（作業種別・③の4区分）**：

| 区分 | 件数 | 例（effectId） |
|---|---|---|
| **(i) 配線ギャップ**〔①のマトリクスで機械検出できる〕 | **5** | `WX12-016-E1`「白か黒の」色filter脱落／`WXDi-P02-073-E1` level:1 脱落／`WXDi-P16-046-E2`・`WX13-062-E1` 条件節ごと脱落＝無条件発火／`SP27-010-E1` `excludeResona` 脱落＋無条件2ドロー |
| **(ii) 機構ギャップ**〔§6.3〕 | **6** | `WX11-072-E2`「次に1回だけ」予約が無くターン中無制限軽減／`SPDi43-09-E1`「【ソウル】が付いているかぎり」脱落＝無条件付与／`WXDi-P05-010-E3` **parseStatus:UNKNOWN＝完全no-op**／`WX24-P3-033-E1`【マジックボックス】設置ステップ消失／`WX25-P1-098-E1`／`WX13-015-E1`（アンコール） |
| **(iii) 構造混線**〔タスク13〕 | **3** | `WXK04-090-E1`「＜水獣＞を公開**しないかぎり自分を**トラッシュ」→「自分の水獣シグニをトラッシュ」＝別物／`WXK04-025-CB-E2` 多段閾値全脱落＋`ALL`→1＋能力付与が**直接ライフクラッシュ**に化ける／`WXDi-P16-034-E2` 引用付与の平坦化で《無》支払い回避が消え**無条件アタック禁止**に |
| **(iv) 計器較正**〔`vocabCensus.ts` の対応語彙表を直す・**直す対象ではない**〕 | **6** | 下記 |

**⚠95%信頼区間＝50〜90%**（20件・二項）。**点推定 70% を採ると残りの実バグは約 810件**（区間では 580〜1050）。続き369 の 92% を前提にした「残り約1050件」は**上限側**だった。

**⚠(iv) 計器較正 6件＝サンプルの 30%。ここが一番の伸びしろ**（直す作業ゼロで census が減る）。実測した誤検出の根因と規模：
- **`LOOK_PICK_CHAIN` の `maxPick` が「Nまで」そのもの**（`WX25-P1-091-E1`／`WXDi-P08-050-E1`／`WXDi-P16-032-E1` の3件）＝census は `upToCount`/`pickUpTo` を探すが、`execLookPickChain` は `needsInteraction({type:'SEARCH', maxPick: stage.pickCount})` を渡しており**上限として正しく効いている**。**クラスタ「「Nまで」上限選択」93件のうち 28件が LOOK_PICK_CHAIN＝機械的にまとめて較正できる。**
- **`FORCE_PLACE_FRONT`**（`WD07-010-E1`）＝「配置する**場合**」が条件節クラスタに掛かるだけ。parser／`effectEngine.ts:5610`／`BattleScreen.tsx:5284`／`SigniSummonZoneModal.tsx:58` まで**フル実装済み**。
- **`levelEqLrig` / `colorMatchesLrig`**（`WDA-F03-09-E2`）＝「センタールリグと同じレベル」「共通する色」を正しく持っているのに対応語彙表に無い。
- **`COUNTER_SPELL.maxCost`**（`WX13-015-E1`）＝「コストの合計が1以下」を表現済み（※同カードの**アンコール**は別途 (ii) の実ギャップ）。
- **filter による条件の等価表現**（`WX15-001-E2`）＝「それが赤のシグニの**場合**」を `ADD_TO_FIELD{source:{filter:{color:'赤'}}}` で表している（赤以外は候補0で不発＝等価）。続き365 が `REVEAL_AND_PICK` 形を較正した際に**この形は取りこぼしていた**。

**⚠この測定から出た教訓**＝**「census に残っている＝バグ」ではない**。残り1162のうち約3割は計器側の問題で、**較正は実装より安い**。次バッチを取る前に (iv) を先に潰すと、以後のサンプリング精度も上がる。

#### ✅③ worklist を**クラスタ別ではなく作業種別**へ組み替えた（続き376）

**根拠＝残り1162は均質ではない**（続き375 実測のクラスタ別「もう直っている率」）：

- **機構未実装＝§6.3 の領分（約165効果）**：チーム 0%(34)／アンコール 3%(19)／合計制約 25%(25)／同一性 38%(16)／ゲームから除外 44%(26)／正面 50%(19)／数量比例 51%(26)。**①のマトリクスには出ない**（配線ではなく新機構）。
- **長いテール（75〜92%済み）**：条件節 283／小さい数(2-5枚/体) 181／クラス指定 154／数値不一致 96／「Nまで」 93／色フィルタ 79／キーワード能力語 73／レベル閾値 57 ほか。**①が効くのはここ。**
- **計器の偽陽性**：engine が原文から直接読んで**正しく動いているのに census にだけ残る**形（【ビート】コストの `《X》以外` ＝`analyzeBeatSigniCost`）。**直す対象ではなく census の較正対象。**
- **構造混線（パターンD）**：タスク13 へ送る。

**分類の4区分**＝(i)配線ギャップ〔①で機械検出・バッチ化〕 (ii)機構ギャップ〔§6.3〕 (iii)構造混線〔タスク13〕 (iv)計器較正〔`vocabCensus.ts` の対応語彙表を直す〕。

---

### 🗂 作業種別 worklist（**続き376 以降はこれが正**・クラスタ別 worklist は索引としてのみ残す）

> **取り方**＝上から順ではなく、**(iv)→(i)→(ii)→(iii) の順にコストが安い**。②の実測では残1162の内訳が概ね
> **(i)25% / (ii)30% / (iii)15% / (iv)30%** で、**(iv) は実装ゼロで減る**ぶん最初に取るのが効率がよい。
> 各項目の末尾が**着手時にまず打つコマンド**。

#### (iv) 計器較正 — `scripts/vocabCensus.ts` の対応語彙表を直す（**実装ゼロ**）

**✅第1・2バッチ完了（続き376c）＝census 1151→1089（−62）。実装ゼロ・バグ修正なし。**

> ⚠**較正は「実バグが減った」ではない**＝母集団から偽陽性が抜けただけ。したがって**残りの実バグ率は上がる**。
> §5d-0 ② の実測（1162 のうち 70%＝実バグ約813／偽陽性約349）から算術で更新すると、
> 較正で抜けた62件はすべて偽陽性側なので **1089 のうち実バグ約813＝約75%**。**実バグの絶対数は変わっていない。**
> ⚠**次に `censusSample.mjs` で測り直すのは (iv) をもう1〜2バッチ進めてから**（いま測っても較正途中の母集団を測ることになる）。
- [x] **`LOOK_PICK_CHAIN` の「Nまで」**（−25）＝`stage.pickCount` は `execLookPickChain` が `needsInteraction({type:'SEARCH', maxPick})` へ渡しており**上限として正しく効いている**。⚠**型名を key に足す一括免除はしなかった**＝`vocabCensus.ts` に「LPC は型名を key に足さない」という**過去の明示判断**があり、その理由（効果全体が免除され、同じ効果の**別アクション**にある「N体まで」の脱落まで隠れる＝続き376b のクロス計上と同じ罠）は今も正しい。代わりに **`extraOk` で残渣チェック**＝原文の「Nまで／好きな枚数」の出現数以上の**上限スロット**が JSON にあるときだけ免除。実測＝高シグナル93件中 LPC 28件が**全数 slots ≥ need**。
- [x] **`FORCE_PLACE_FRONT`**（−4）＝「対戦相手がシグニを配置する**場合**」は条件節ではなく行動の言い回し。parser／`effectEngine.ts:5610`／`SigniSummonZoneModal.tsx:58`／`BattleScreen.tsx:5284` までフル実装済み。残渣チェック付きで免除。
- [x] **`COUNTER_SPELL.maxCost`**（−2）＝「コストの合計がN以下のスペル」の正表現。対応表には `costMax`（TargetFilter 側の名前）しか無く、**大文字小文字が違うだけで部分一致しない**という続き368 の `minPower`／`Under` と**同じ罠**だった。
- [ ] **filter による条件の等価表現を条件節クラスタの extraOk に入れる**＝「それが〈desc〉の**場合**」を `ADD_TO_FIELD{source:{filter}}`／`SEARCH{filter}` で表す形（`WX15-001-E2`）。続き365 は `REVEAL_AND_PICK` 形だけ較正しており**この形が漏れていた**。⚠**条件節クラスタは283件と最大**なので、広い extraOk は masking リスクも最大＝残渣チェックを特に厳しく。
- [x] **🆕`trash_key`**（−31・続き376c 第2バッチ）＝「このキーを場からルリグトラッシュに置く：」（【起】コスト）。型（`effects.ts:355`）にも engine（`BattleScreen.tsx:6314` で実際に支払い、コスト表示にも出る）にも実装済みなのに対応表から漏れており、**「コスト:場からトラッシュ」クラスタの高シグナル34件が全部これ1つ**だった。⚠**PLAN の旧記載を訂正**＝「`levelEqLrig`／`colorMatchesLrig` を『同一性』『共通する色』の対応語彙に入れる」は**クラスタの誤記**で、`WDA-F03-09-E2` が落ちていたのは実はこのクラスタ。`levelEq`／`colorMatchesLrig` は同一性・共通する色の対応表に**元から入っていた**。
- ⚠**較正のたびに残渣チェック必須**（続き365 の規律）＝desc からモデル化できた識別子を除いて**何か残るなら covered にしない**。実バグを masking したら計器の意味が消える。**較正後は消えた効果を全件目視し、「新たに高シグナルへ出た効果が0件」を機械確認する**（続き376c で実施）。
- `npm run census`（較正後は `BASELINE_HIGH` と §4 恒久指標を実数更新）

#### (i) 配線ギャップ — ①のマトリクスからセル単位で取る（**バッチ化できる唯一の区分**）

**✅第1〜8バッチ（続き376b〜377c）＝消化済み・計 108効果。第1 `triggerSubjectClass × TRIGGER{ON_ATTACK_SIGNI}` 16／第2 BOUNCE のクラス 3／第3 トラッシュ→デッキ下の source クラス 17／第4 「あなたの〈filter〉シグニ…パワー±N」の owner ごと脱落 18／第5 ディソナ判定の `keyword` 誤用 12／第6 `hasOtherSelfSigniNoun`（「他の」）ゲートの棚卸し 12＋engine 1／第7 `noGuard` セル→同ビルダーの構造バグ 30＋engine 1／第8 《ライズ／クロス／アクセアイコン》 17。****詳細（真因・トリップワイヤ・教訓）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-07 整理：§5d-0(i) 第1〜8バッチ」節と [BUGFIXES.md](./BUGFIXES.md) の各エントリ。**
**✅第19バッチ（続き378・Codex 委譲）＝`isDisona` / `excludeResona` の対象フィルタ合成漏れ 計22効果／census 924 据置・被覆マトリクス miss 307→291・golden 1488→1517。** 真因は `parseIconFilter`（`parserUtils.ts:213`）が `/《(ライズ|クロス|アクセ)アイコン》を持つ/` ＝**「を持つ」接続の3アイコンしか見ない**こと。《ディソナアイコン》は原文で**連体の「の」**で書かれるため、トラッシュ／エナ系ビルダーが呼んでいても**永久に当たらず**「トラッシュから《ディソナ》のシグニを回収／蘇生」が**どのシグニでも取れる**過剰効果だった。`signiClauseDisonaFilter`／`signiClauseExcludeResonaFilter`／`signiClauseResonaFilter` を 3兄弟の隣接規律で新設（⚠**トラッシュ／エナの対象は「N枚」＝助数詞を「枚/体」両対応にしないと当たらない**）。**最大の収穫は engine のパリティ穴**＝`effectEngine.matchesFilter` に `isDisona` が無く（続き372 の移植ブロックから漏れていた）、`HAS_CARD_IN_FIELD`/CONTINUOUS/`activeCondition` では **JSON が正しくても無視**＝`WXDi-P12-044-E1` ほか**5効果が「他の《ディソナ》のシグニのパワーを＋N」を全味方へバフ**していた（1行移植で是正）。据置＝`WXEX2-18-E2`（2対象の owner 取り違え＝(iii) へ）。**🔎教訓＝(a) 判定器が2つある語彙は片方だけ穴が空く＝JSON 差分にもゲートにも映らない。(b) 被覆マトリクスは STUB/MANUAL 同居効果を除外するので同型がセルに出ない（`WXDi-P13-002-E1`）＝全カード A/B でセル外を回収する。**
**✅第9バッチ（続き377d）＝シグニ→デッキ上/下 のレベル範囲 8効果＋計器較正 −38／census 1048→1041・被覆マトリクス miss 422→376。**「対戦相手の**レベルN以下の**シグニ１体を対象とし、それをデッキの一番上／一番下に置く」でレベル限定が丸ごと落ち、**どのレベルのシグニでもデッキへ送れる**過剰効果だった。⚠**miss 22 のうち本物は8件**で残り14件はクロス計上（ルリグのレベル条件／条件節／自身のレベル条件／【ビート】コスト）＝`signiClauseLevelFilter` を新設して隣接判定で分離。これで **`signiClause*Filter` 3兄弟（クラス・アイコン・レベル）が揃った**。同時に計器較正＝`levelRange` の原文正規表現を名詞に係る形へ限定（miss 79→41／`levelRange × GRANT_KEYWORD{SIGNI}` の miss 9 は**9件すべて**が偽陽性だった）。**🔎教訓＝セルを取ったらまず全数分類し、偽陽性の型が分かったら計器を較正するのが最短。**
**✅第15バッチ（続き377j）＝`_partial_fresh` 行列の parser 側を直す・7効果／census 960→**957**。** 続き377i で新設したレビュー行列の12カードは、すべて**live に正しい形があるのに parser だけが退化**していた＝**手で採用しても意味がない**（fresh が退化側）。**parser を直して live と一致させ行列から落とす**方針に切り替えた（一致させれば以後の改善も効果単位マージで自動的に届く）。①「（あなた|対戦相手）のエナゾーンにあるカードがN枚（以上|以下）であるかぎり」＝旧規則は**「あなたの」「N枚以上」「あるかぎり」の1形だけ**を見ており、所有者・不等号・語尾の変種が素通り＝`activeCondition` が落ちて**無条件発火**（4効果。「相手のエナが少ないときだけ強くなる」札が常時強かった）。②🔴「〔X〕以外の効果を受けない」＝`t.includes('アーツ')` が `from:['アーツ']`＝「アーツの効果**だけ**受けない」と読み、**保護範囲が原文とちょうど反対**（2効果）。正しい形（`fromAll`＋`exceptSource`）は同ファイルの「ルリグ以外」規則に既にあった。⚠「**自身**以外」は語彙が無いので触らない。行列は **12→10カード**。**🔎教訓＝(a) レビュー行列に残るものは「採用待ち」ではなく parser のバグ台帳として読む。(b) 1形だけを見ている規則を疑う＝新しい条件規則は最初から〔所有者〕〔不等号〕〔語尾のゆらぎ〕を許す（語順・数量詞に続く4例目）。(c) 🔴`includes(語)` で種別を拾う判定は「以外」で反転する＝否定語の有無を先に見る。(d) ✅ツールを直した効果が次のバッチで実際に効いた＝parser を直して build:effects を回すだけで混在カード4効果が自動収穫された。**

**✅第14バッチ（続き377i）＝収穫マージを「カード単位温存」→「効果単位温存」へ・70効果／census 972→**960**・被覆マトリクス miss 319→318。** 続き377h の「(iv) 枯渇」は *census が見える範囲* だけだったと判明（`thisCardOnly` のように census 語彙に無い脱落が大量に残っていた）。原因は計器ではなく**ツールの構造**＝`build:effects` が「カード内に MANUAL/PARTIAL が1つでもあれば**カード丸ごと**温存」で、**同カードの AUTO 効果への parser 改善が永久に live へ届かなかった**（実測 584カード）。**効果単位の温存**へ変更（MANUAL/PARTIAL は不可侵／残りは `isPureSuperset` を個別通過／effectId 集合が変わるカードはカード丸ごと温存）＝**41カード/43効果を自動収穫**し、以後は parser を直せば自動で届く**恒久的な解決**。あわせて「効果単位でも自動採用できない値変更/構造変更」を出す**第2のレビュー行列 `docs/_partial_fresh.json`** を新設し、39効果を原文照合して **27件採用／12件は live のほうが正しいので不採用**。**🔎教訓＝(a)「計器が0になった＝系統が枯れた」ではない＝枯渇宣言は計器ごとに範囲を書く。(b) 症状を手で刈る前に、なぜ溜まるのかを見る＝2バッチ手作業で刈った系統がツールの1箇所で恒久的に解けた。(c) 🔴テストが落ちたら「実装が悪い」と決めつけない＝golden のトリップワイヤがバグ由来のアーティファクト（E3 の内容が E2 へ漏れた POWER_MODIFY）を検証しており、実装が正しくなった瞬間に落ちた。(d) 保守的すぎる粒度は安全ではなく、ただの取りこぼし＝`isPureSuperset` を効果ごとに通しても保証は同じ。**

**🏁第13バッチ（続き377h）＝(iv) stale live の刈り取り**完了**・37効果／census 1000→**972**・被覆マトリクス miss 320→319。** held 189枚のうち **census 高シグナルに当たる 38カード/40効果を全件原文照合**して消化＝36カードを `heldReview --adopt`、1効果（`WXDi-P06-011-E3`）を外科的に採用。**終了時点で「census 高シグナルに当たる held」は 38カード→0カード＝この系統は枯渇**（held 自体も 189→144枚／89→71群）。**壊れ方は7型に集約**＝duration 取り違え（`UNTIL_OPP_TURN_END`→`UNTIL_END_OF_TURN`＝**相手ターンに効果が切れる**）8／付与対象の `thisCardOnly` 脱落（「**このシグニは**」が味方1体選択になる過剰対象化）6／条件節の常時true化 5／「そうした場合」の対象取り違え（**あなたの**シグニをバニッシュすべきところ**相手**をバニッシュ）2／trigger timing の平坦化（内側の付与能力を最上位へ）3／【使用条件】の焼き付き 4／条件節由来の `excludeSelf` が相手側の対象フィルタへ漏れる 3。**🔎教訓＝(a)「held が新しい」は「held が正しい」ではない（40件中2件が逆方向＝`WXDi-P06-011-E1` の owner／`WXK06-048-E1` の `targetsLastProcessed`）＝全件原文照合は省略できない。(b) カード単位採用だと巻き添えになる＝退化と改善が同居するカードは効果単位で採る。(c) 🔴`manualEffects.ts` の MANUAL 定義が live より古いことがある（逆パターン）＝held が消えない MANUAL 効果は JSON ではなくソース側を直す。(d) この7型は parser 側にも残っている可能性があり、次バッチの探索キーになる。**

**✅第12バッチ（続き377g）＝stale live の一括解消 38効果／census 1030→**1000**・被覆マトリクス miss 338→320。** **`build:effects` の非破壊マージが「parser は直っているのに live は古いまま」の在庫を作る**という**新しい系統**を計器化した＝収穫マージは証明可能に無損失な上位集合だけを自動採用するので、parser を後から直しても live の古い値は上書きされない＝**census には過剰効果として残り続ける**。census 高シグナル 1030件を fresh と全件突き合わせ、①fresh のほうが語彙キーを多く持つ **30効果を外科的に採用**（同カードの別効果が live=MANUAL のとき fresh がそれを退化させるため、**カード単位ではなく効果単位**で採り MANUAL は無条件スキップ）②held から census 高シグナルに当たる **8カードを原文照合のうえ採用**。典型は `GRANT_KEYWORD{keyword:"使用条件"}`＝【使用条件】の前置きをキーワード付与と誤解した古い形が**本文の効果を丸ごと食っていた**もの（`CHOOSE` 4択／`GROW_COST_REDUCTION`／`LRIG_COLOR` 条件が復活）。**parser/engine は1行も触っていない。** **🔎教訓＝(a) census が減らないときはまず live と fresh を全件突き合わせる（parser ではなく live が古い可能性）。(b) 🔴採用値は必ず `build:effects` の出力から取る＝`parseCardEffects` 直呼びの自作ダンプは `_sourceTextLog` を参照する post-pass が効かず後付けフィールドが黙って落ちる（golden のトリップワイヤが検知）。(c) golden が live を読むことの盲点＝parser 側の退化は live が古いままだとテストに映らない＝stale live の解消は回帰検出力そのものを上げる。(d)「held のほうが差分が小さい」は採用理由にならない。**

**✅第11バッチ（続き377f）＝ON_ATTACK_SIGNI の味方側トリガー主語 8効果＋engine の `excludeSelf` 過剰発火 3効果／census 1032→1030・被覆マトリクス miss 349→338。** 最大セル `cardClass × (filter無)`（miss 33／has 83★★）を**全数分類したら「1 regex で N 効果」型ではなく5系統の寄せ集め**だった（アタック主語5／LOOK_PICK_CHAIN 10／構造欠落8／条件節4／コスト2／他 timing 主語4／計器誤検出3）。**真の穴＝アタック主語の修飾語抽出が「クラスのみ」「パワーのみ」「色のみ」の3本の別 regex に分かれており、修飾が2つ以上（パワー＋クラス等）だとどれにも当たらず既定 `self` へ潰れる**＝①味方全体が引き金なのに watcher 自身のアタックでしか発火しない過小実行 ②その自身に対しても「パワー10000以上」等の限定が一切効かない、の二重のズレ。`parseAllyAttackSubject` へ統合し**未知の修飾語が残れば `null`＝配線しない**という安全弁を戻り値で構造化（【ソウル】1件は据置）。engine 同居バグ＝BattleScreen のアタッカー自身経路が `triggerFilter` を素の `matchesFilter` へ丸ごと渡しており `excludeSelf` が無視されていた（pure ヘルパー `attackerSelfTriggerFilterOk` に集約）。較正＝`triggerCondition` の `*Story` 系を `cardClass` の配線済みキーに追加。**🔎教訓＝セルは母集団の索引であって母集団そのものではない（系統が見えたらその語彙全体で全CSV走査＝今回セル外に3件）／安全弁はコメントの規律ではなく関数の戻り値にする／`npm run gates` の lint は `--cache` なので簿記前にキャッシュを消して測り直す。**

**✅第10バッチ（続き377e）＝「あなたのすべての＜X＞のシグニ」の語順 15効果＋計器較正（cardClass 116→98）／census 1041→1032・被覆マトリクス miss 376→349。**`(?:すべての)?` が修飾語群の**後ろ**にしか無く、「あなたの**すべての**＜地獣＞のシグニのパワーを＋3000」で**分岐条件ごと外れて** `{SIGNI, owner:"any", count:1}` へ潰れていた＝**味方全体バフが「シグニ1体」に縮退**＋**相手のシグニにも撃てる**（9効果）。あわせて続き376d が「別系統の改善が同居」として据置した held 3枚を原文照合のうえ採用（6効果＝「**このシグニは**【X】を得る」の `thisCardOnly` 脱落も解消）。較正＝`cardClass` から条件節・コスト軽減用法を否定先読みで除外。**🔎教訓＝A/B の件数と直った件数は違う（6件は live が MANUAL で既に正しかった）／採用前の確認は JSON パースの構造比較で（文字列 strip はネスト括弧で誤検知）。**

> 🔎**census の5つ目の死角＝「語彙はあるが判定器が違う」**（§5c 末尾の4項に追加）。`filter:{keyword:"ディソナアイコン"}` は `matchesFilter` が **EffectText の印字**を見るので、CSV の `Story` 属性であるディソナには**両方向に外れる**（98枚中38枚を取りこぼし／非ディソナ17枚を誤ヒット）。**語彙突き合わせ型の計器は原理的に検出できない。**
> ⚠**「他の」ゲートの穴は再発しやすい**＝第1バッチ（ON_ATTACK_SIGNI 主語）と第5バッチ（`parseSigniTarget` の isDisona）が同型。`hasOtherSelfSigniNoun` で gate している箇所を洗うと同じ穴が出る可能性がある。

> ⚠**follow-up 3件**＝`WX24-P4-079`／`WXDi-CP02-063`／`WXK09-080` は held に**無関係な別系統の改善**（`thisCardOnly` 追加等）が同居していたので分離して据置。原文照合して別途採用すること。
> ⚠**follow-up**＝`WXDi-P13-077-E1`「あなたの《ディソナアイコン》のシグニ1体」は owner だけ是正され `isDisona` は未載（`parseSigniTarget` がこの位置のアイコンを取らない）。

> ⚠**follow-up＝クラスが2つ以上の span は据置**（`PR-322-E1`「＜天使＞1枚**と**＜古代兵器＞1枚」＝別ピック／`WX08-036-E1`「＜鉱石＞**か**＜宝石＞合計5枚」＝OR）。片方だけ載せると**原文と逆の過小実行**になるため、AND/OR/別ピックを区別できる形（`anyOf` か複数ステップ）を用意してから取ること。golden にトリップワイヤあり。

> ⚠**第2バッチで分かった「セルの読み方」**＝`cardClass × SIGNI[filter]`（miss 43）を機械分類すると
> **①対象フィルタの真の脱落 11／条件節（クロス計上）9／別ゾーン指定（クロス計上）13／要目視 10**。
> **大セルはそのままバッチにならない**＝`--cell` で原文を読んで①だけを抜くのが正しい使い方。
> さらに①の11件も内訳が分かれる＝**BOUNCE 対象3件**（消化済み）／**トラッシュ→デッキ下＋レベル相異5件**
> （`SPDi44-12・16`／`WX25-P1-014・030`／`WX25-P2-063-E2`＝同一テンプレの**次のきれいな1本**）／
> コスト側フィルタ1件（`WX05-044-E1`）／機構待ち1件（`WX24-P3-033-E1`＝【マジックボックス】）／`WX17-071-E1`。

**⚠取る前に必ず**：`--cell` で原文を全部読み、**クロス計上**（フレーズが同じ効果の別の入口に掛かっている）・**条件節用法**・**コスト側フィルタ**を仕分ける。miss 数＝見込み件数ではない（①の⚠⚠を参照）。

**✅第20バッチ（続き547）＝`eachDistinctLevel` の軸取り違え7効果＋`isPuppet` の配置様態8効果／計器較正 miss 242→197・census 799 据置・golden 2225→2246。** ⚠**着手前の実測が最重要**＝PLAN 記載の miss 541／291 は古く実測 **242**、しかも最大セル `eachDistinctLevel`（29/1）は **20件が別綴りの正準形 `selectionConstraint.distinct:'level'` で配線済み**だった（trap (h) の4例目）。真の穴は**別の層**にあった＝①`DISTINCT_BATCH5C` が effectId→軸の**手書き表**で、**7効果が原文と別の軸**（`WX14-030-E1` ほか5件が「レベルの異なる」を `distinct:'name'`／`WXDi-P00-023-E1` が class を name／`WXDi-CP01-008-E3` が name を level）。**構造は正しく意味の軸だけ違うので全ゲートを素通りする**＝軸を原文から導く（`inferDistinctKind`）実装へ移し、表は「載せるかどうか」だけにして golden で一致を固定。②`isPuppet` の miss 11 のうち8件は filter ではなく**配置様態**「それを傀儡状態であなたの場に出す」で、live は `ADD_TO_FIELD{TRASH_CARD, owner:'self'}`＝**自分のトラッシュから自己蘇生する完全な別物**だった（機構 `STEAL_OPP_TRASH_PUPPET` は実装済み・parser が載せていないだけ／`WXK10-091-E2` は「＜美巧＞**ではない**」が `story:'美巧'` で**反転**）。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18 続き547。

現在の miss 上位（🆕**2026-08-18 続き547 実測＝合計 197**。PLAN 旧記載の 541／291 は古い。★★＝同入口に20件以上の配線済み／★＝5件以上）：
- ⚠**着手前に必ず `npm run census:wiring` を回し直す**＝下の一覧は続き376b 時点の値で、消化と較正で**大きく動いている**（`eachDistinctLevel` 29→3／`isDisona` 34→4／`hasCrossIcon` 22→1／`noGuard` 14→1／`isPuppet` 11→1／`isAwakened` 10→1）。生きているのは `cardClass` 51／`color` 24／`levelRange` 24／`levelExact` 21／`powerRange` 19／`hasRiseIcon` 8／`levelParity` 6／`levelEqTrigger` 5 ほか。

- [ ] **大クラスタ（続き376b 追加）**＝`cardClass` **154**（has 1407）／`levelRange` **81**（247）／`color` **36**（297）／`powerRange` **30**（507）／`levelExact` **29**（103）。★★セルは `cardClass × SIGNI[filter]` 46／`cardClass × POWER_MODIFY{SIGNI}` 38／`levelRange × SIGNI[filter]` 25／`cardClass × TRASH_CARD[filter]` 13／`color × SIGNI[filter]` 12 ほか。⚠`cardClass × (filter無)` 37 は**条件節用法が濃い**＝優先度低。
- 以下は続き376 時点の実測（マイナー語彙・★＝同じ入口に配線済みの効果があり穴が明確）：
- [ ] **`isDisona` 34**（has 21）＝WXDi-P12/P13 系に集中。
- [ ] **`hasRiseIcon` 31**（has 8）★＝`TRASH_CARD[filter]` 9／`SIGNI[filter]` 8／`SEARCH[filter]` 7／`BANISH{SIGNI}` 6／`GRANT_KEYWORD{SIGNI}` 6。`WX16-026-BURST` ほか**トラッシュから何でも回収できる**過剰効果。
- [x] ~~**`eachDistinctLevel` 29**（has 1）~~ 🏁**続き547 で消化＝miss 3**。⚠**「厳密 enforce は engine 側が TODO」は誤読だった**＝`TargetFilter.eachDistinctLevel` が表示・選択補助どまりなのは事実だが、**正準形は別キー** `SelectionConstraint{distinct:'level'}` で、これは `satisfiesSelectionConstraint`（execUtils）と `resumeSearch` が**実際に不正な集合を拒否する**。29 miss のうち **20 は正準形で配線済み**（計器の誤検出）・**7 は軸そのものが取り違え**（`distinct:'name'` 等）・残り 3 がコスト節/条件節（→ 下の (ii) へ登録）。
- [ ] **`hasCrossIcon` 22**（has 2）★＝`SIGNI[filter]` 11／`SEARCH[filter]` 10／`POWER_MODIFY{SIGNI}` 7。`WX07-010-E1` ほか7効果が**自分の全シグニに+1000**の過剰効果。
- [ ] **`noGuard` 14**（has 61）★＝`TRASH_CARD[filter]` に 7 miss だが**同じ入口で 61件が配線済み**＝最も明確な穴。
- [x] ~~`isPuppet` 10／`isAwakened` 10~~ 🏁**続き547 で消化＝各 miss 1**（配置様態8効果を `STEAL_OPP_TRASH_PUPPET` へ配線＋計器を名詞に係る形へ較正）。残1件ずつは条件節脱落＝(ii) へ登録済み。
- [ ] `levelParity` 6（has 8）★／`excludeResona` 1／`hasGuard` 4／`nonColorless` 4／`levelEqTrigger` 5 ほか（続き547 実測に更新）。
- ⚠**一度も配線されていない語彙は (i) ではない**＝`powerLteSelf` 9／`isDrive` 14／`eachDistinctColor` 3／`levelLtSelf` 2 は has=0＝**機構未実装 (ii)**。スクリプトが自動で別枠に落とす。

**✅消化済みセル**
- **（続き376b・第1バッチ）`triggerSubjectClass × TRIGGER{ON_ATTACK_SIGNI}` 16効果**＝`effectParser.ts` の ON_ATTACK_SIGNI 主語抽出が**「他の」があるときだけ**動いており、「他の」無しは `triggerScope` が既定 `self` に落ちて **watcher 自身がアタックしたときしか発火しない過小実行**だった（原文は味方の該当シグニ全部が引き金）。⚠**当初「どのシグニでも発火する過剰効果」と読んだのは誤りで、実際は逆方向（過小実行）**＝`triggerScope` の既定が `self` であることを確認せずに書いた。**engine（`collectFieldTriggers` の any_ally path）は元から `triggerFilter`/`excludeSelf` に対応済みで、落ちていたのは parser の1行だけ。**
  - 内訳＝クラス有9（`WX13-037-E2` 凶蟲／`WX17-032-E2`・`WXEX2-20-E1` 英知／`WX18-054-E1` 悪魔／`WX19-072-E1` 地獣／`WXEX2-13-E1` 水獣／`WXEX2-18-E1` 遊具／`WX25-CP1-091-E1` ブルアカ／`WXDi-D09-P17-E2` 天使）＋クラス無7（`WD23-032-A-E2`／`WX10-035-E1`／`WX14-006A-E1`／`WXEX2-16-E2`／`WX25-P2-022-E1`／`WX25-P3-023-E1`／`WXDi-P10-054-E1`／`WXK07-030-E1`）。
  - ⚠**抽出を先頭限定（`^`）にして前置き修飾つき3効果を意図的に除外**＝`WXDi-P04-016-E1`「**【ソウル】が付いている**あなたのシグニ」／`WXK10-084-E1・E2`「**レベルが奇数/偶数の**あなたの＜トリック＞のシグニ」。前置きごと無視して any_ally に広げると「条件を満たすシグニだけ」が「味方シグニ全部」になり、**過小実行を過剰発火へ付け替えるだけ**になる。**golden にトリップワイヤを設置済み**（広げたら落ちる）。→ 配線したい場合は先に triggerFilter 側へ前置きの語彙（ソウル付き／`levelParity`）を載せること。`levelParity` は型にも `matchesFilter` にも実装済みなので `WXK10-084` の2件は**すぐ取れる在庫**。
  - ⚠**採用経路が2種混在**＝`WXEX2-18` は held に正しい形が滞留していたので `heldReview --adopt`（同時に E2「それをエナゾーンに置く」＝**デッキトップを自分のエナへ**という別物だったのと、E3 の「＜遊具＞のシグニ5枚まで」フィルタ欠落も是正）。`WX25-CP1-091` は E2 が PARTIAL のため**カード単位 PRESERVE で held に載らない**＝parser 出力と完全一致する形で外科パッチ（続き371 の `WX09-CB02` と同型。**held を増やさないための必須手順**）。
  - **ゲート**＝golden **1419→1422**（+3＝parser 側16効果の固定／前置き除外のトリップワイヤ／engine の同クラス発火・別クラス非発火）、census **1162→1151**（−11・`BASELINE_HIGH` 更新）、smoke 全0、fuzz 全0、同型★**0 据置**（265群）、lint 0 errors/248 warnings（追加0）、manual field loss 0。**A/B 差分で `triggerScope`/`triggerFilter` 以外の変化が 0 件であることを機械確認済み。**
- ⚠**セルを取るたびに全CSV走査で用法を分類してから配線する**（付与文・条件節・リマインダー文を filter にすると**原文と逆の過小実行**になる＝続き369 の教訓）。
- `npm run census:wiring` → `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>`

#### (ii) 機構ギャップ — §6.3 台帳／Opusタスク12 へ送る（1件ずつ・逓減しない）

**🏁続き377n＝「engine 側で上限/フィルタが消費されない7効果」を完遂**（(a) `execAttachCharm` の複数ペア4／(b) `execGrantKeyword` の `upToCount` 2／(c) `classMatchesDiscardSigni` を `execRevealAndPick` へ配線1）。**この3件は「語彙は型にも engine にもあるのに、その入口では読まれていない」型**で、続き377m が exec の該当行まで書き残していたため調査ゼロで入れた。波及で `owner:"any"`（engine で `tgtOwner="opponent"` へ解決）の誤りが **14効果** 出た。詳細＝[BUGFIXES.md](./BUGFIXES.md) 続き377n。
- ✅**「`isDisona` の条件節グループ」は続き379 で消化**（8効果＝常在3＋解決時5。既存条件型のみ・新設ゼロ）。**残ったのは下の1件＋別機構3件だけ。**
- [ ] **🆕2ゾーン合算の枚数条件が無い**（続き379 の defer）＝`WXDi-P12-056-E1`「あなたの**エナゾーンとトラッシュに**《ディソナアイコン》のカードが**合計７枚以上**ある場合」。`ENERGY_HAS_CARD`＋`TRASH_HAS_CARD` の **`AND` では同値にならない**（合計なので 3+4 でも成立）。⚠**近似禁止**＝現状は条件ごと落ちて**無条件ドロー**。コスト側には先例（`combinedTrash{zones:['energy','field']}`）があるので、条件型にも `zones` を持つ形を1つ足すのが素直。
- [ ] **`isDisona` の別機構3件**（続き378 で実測・続き379 も対象外）＝`WXDi-P13-005-E1`（「捨てたカードが《ディソナ》の場合、代わりに」が2連 BANISH へ平坦化＝(iii)）／`WXDi-P13-007-E3`（「捨てた《ディソナ》1枚につき」の数量比例）／`WXDi-P13-008-E3`（引用付与内の「《ディソナ》のスペルを使用したとき」）。
- ⚠**条件に語彙を足すときの必須確認（続き378・379 で2回続けて要になった）**＝**両 `matchesFilter`（`execUtils` / `effectEngine`）と両評価器（`evalCondition` / `checkActiveCondition`）は別物**。①型にキーがあっても評価器が知らなければ**黙って無視**（378 の `isDisona`＝揃えるのが正しかった）②逆に**揃えてはいけない**こともある（379 の `powerRange`＝持続側を実効パワーにすると**パワー計算が循環する**）。③`activeCondition` に評価器が知らない型を書くと **`return true`＝無条件成立**に落ちる。
- [x] 🏁**`parseStatus:UNKNOWN` の完全no-op ＝ 残0クローズ（2026-08-09 続き385・Codex 委譲）**。⚠**投入前実測で在庫は 6件ではなく 7件**だった。内訳＝群A アシストルリグをルリグデッキへ戻す4（新型 `RETURN_ASSIST_LRIG_TO_DECK`）／群B `WX09-019-E3`「これをトラッシュに置く」＝既存 `thisCardOnly` で表現／群C `WXDi-P00-002-E1`＝既存 `RemoveAbilitiesAction` に `keywords?:string[]` 追加／群D `WX25-P1-048-E1`＝アシストルリグのアタック機構が無いので**専用宣言 STUB へ honest defer**。live 変化 7効果・added/removed 0。詳細は [BUGFIXES.md](./BUGFIXES.md) 続き385。
- [ ] 🆕**`HAS_CARD_IN_FIELD{cardType:'ルリグ'}` がアシストルリグを数え落とす＝live 19効果**（続き385 検証で発見）。`matchesFilter` の cardType 照合は `types.includes(card.Type)` の**厳密一致**（`execUtils.ts:590-597`・緩和はレゾナ→シグニの一方向のみ）で、CSV の Type は **`'ルリグ'` 1234枚と `'アシストルリグ'` 340枚が別値**。`lrigZoneTops`（`execUtils.ts:512`）がアシストを走査していても**黙って全部落ちてセンター限定に戻る**。母集団＝`WXDi-P08-001`〜`005` 系のピース使用条件「あなたの場に○と○と○のルリグがいる」9件／`WX24-P4-068/075/082/089`「レベル4以上のルリグ」4件／ほか。**Diva のピースはセンター＋アシスト2の3体を前提にした使用条件なので、原文照合のうえ `cardType:['ルリグ','アシストルリグ']` の配列形へ寄せる**（続き385 で `WXDi-P00-002-E1` 1件は是正済み＝先例）。⚠**`matchesFilter` 側でレゾナ→シグニと同じ緩和を入れる一般化は禁止**（「ルリグ1体を対象とし」の対象フィルタまで広がる）。⚠**逆翻訳 `decompileEffects.ts:458` も文字列比較だった**ので、配列形にしたら逆翻訳の追随を必ず確認する（続き385 で是正済み）。
- [ ] **`PARTIAL`**＝⚠**PLAN の「union 1162 中 23件」は古い**。2026-08-09 実測＝live の `parseStatus:"PARTIAL"` は **54件**、うち census 高シグナルは **18件**（`WX14-046-E1`／`WX21-028-E1`／`WX24-P4-038-E1`／`WX25-P1-044-E1`／`WX25-P3-050-E1` ほか）。中身は **(iii) 構造混線**（`LOOK_AND_REORDER`＋`UNKNOWN` 残渣・引用付与の内側 UNKNOWN 等）＝1件ずつ木を作り直す種類で、(ii) の「安い在庫」ではない。
- ⚠🆕**`docs/_partial_report.txt` を「直すべき40件のリスト」として読まない**（2026-08-09 実測）＝「IS_MY_TURN化」刻印 40件のうち **38件は live が `MANUAL`** で live JSON に `IS_MY_TURN` を含まない＝**既に解消済み**。刻印レポートは *fresh parse* の記録であって live 実害の一覧ではない。live に残る実害は `WX26-CP1-058-E1` の1件だけ。
- [ ] **未配線語彙（has=0）**＝`isDrive` 14／`powerLteSelf` 9／~~`eachDistinctColor` 3~~（🆕続き547 で計器較正＝正準形 `selectionConstraint.sharedColor:'none'` で配線済みだった＝miss 0）／`levelLtSelf` 2。
- [x] 🏁**「それぞれ〜異なる」の**エナ**コスト＝続き548 で消化（7効果）**。⚠**真因は「型が無い」ではなく2つ**＝①parser の regex が**5つの言い回しを捕捉しておきながら switch は2つしか写していなかった**（残り3つは捕捉されて破棄＝マッチするので他の規則にも回らない）②型にあった `EffectCost.energyTrash.selectionConstraint` を**支払いUIが一度も評価していなかった**（`size >= count` だけ＝完全な死フラグ）。⇒ 写像を `energyTrashConstraintOf()` へ出し、`costs.ts` に3モーダル共有の純関数（`energyTrashCostSatisfied`／`canAddEnergyTrashIndex`）を新設して同時に実消費させた。詳細は [BUGFIXES.md](./BUGFIXES.md) 2026-08-18 続き548。
- [x] 🏁**盤面状態（覚醒／傀儡）の条件節脱落＝続き548 で消化（3効果）**＝`WXDi-P14-050-E1`／`WXDi-P14-062-E1`／`WXK09-061-E1`。engine は両評価器とも `isAwakened`/`isPuppet` を実装済みで**parser だけの穴**だった。⚠**「がある場合」形の規則はあったが「あるかぎり」形（＝【常】の `activeCondition` 経路）の表に無かった**＝**条件節は「場合」と「かぎり」で別の表に入る**（片方だけ直すと同じ文型なのに一部だけ直らない）。あわせて `effectEngine` のルリグ走査除外に `isPuppet` が抜けていた parity 穴も閉じた。
- [ ] 🆕**続き548 の残＝「それぞれ〜異なる」のコスト節/条件節のうち別機構のもの（3効果）**＝(a) **手札コスト**＝`WX10-052-E3`「手札からそれぞれ名前の異なる＜精元＞のシグニを４枚捨てる」＝`EffectCost.handDiscardSigni` に集合制約キーが無い（`energyTrash` と違い型から要る）(b) **トラッシュ除外コスト**＝`WXK09-029-E2`「トラッシュにあるそれぞれ名前の異なるスペル３枚をゲームから除外する」＝**コスト節そのものが未パース**（live の cost はエナだけ）(c) **ミル結果の条件型**＝`WXK03-025-E1`「この方法でそれぞれレベルの異なるシグニ４枚がトラッシュに置かれた場合」＝「この方法で置かれた集合」を見る条件型が無い。
- [ ] 🆕**続き548 の残＝「それぞれ〜異なる」の対象節（約15効果）**＝`WD23-041-EA-E1`／`WDK01-010-E1`／`WDK14-011-E1`／`WX21-065-E1`／`WX22-008-E1`／`WX22-050-E1`／`WX24-P4-046-E2`／`WX26-CP1-055-E1`／`WXDi-P10-070-E1`／`WXEX2-34-E3`／`WXK08-027-E2`／`WXK09-082-E2`／`WXK10-050-E1`／`WXK10-051-E1`／`WXK10-081-E2`。**機構は揃っている**（`selectionConstraint` は対象/ソース直下で enforce 済み）＝`effectParser.ts` の `DISTINCT_BATCH5C`（**オプトイン表**。軸は続き547 で原文から導く形にした）に載っていないだけ。⚠**表へ足す前に `visit` が正しいノードへ付くか1件ずつ確かめる**＝条件節に句がある効果を巻き込むと**幻の制約＝過小実行**になる（`applyDistinctBatch5c` は最初の selectable ノードに付ける）。
- [ ] **🆕`LOOK_PICK_CHAIN` が「ちょうどN枚」を表現できない＝実測23効果**（続き376c 計測）。`stage.pickCount` は `maxPick`（上限）として渡るため、原文が強制の「その中から＜アーム＞のシグニ**１枚を**場に出し」（`WDK06-R01-E2`）でも **0枚を選べてしまう**（プレイヤー有利側の過小実行）。「〜してもよい」形9件は上限扱いで**正しい**ので除いた残りが23件。⚠**census では原理的に検出できない**（「Nまで」しか見ない）＝(iv) 較正で見えなくなったぶんをここで引き取っている。直すには stage に「上限か固定か」のフラグを足して `needsInteraction` へ最小枚数を渡す必要がある。全23件＝`WDK06-R01-E2`／`WDK14-008-E1`／`WX11-074-E1`／`WX13-019-E2`／`WX15-083-TRAP`／`WX19-039-E1`／`WX19-069-E1`／`WX22-026-E1`／`WXEX1-12-E1`／`WXEX1-15-E2`／`WXEX1-25-E2`／`WX24-P2-065-E1`／`WX25-P1-041-E1`／`WX25-P1-052-E1`／`WX25-P1-053-E2`／`WX25-P1-079-E1`／`WXDi-P00-034-E2`／`WXDi-P15-010-E1`／`WXK01-069-E1`／`WXK02-030-E2`／`WXK05-023-BURST`／`WXK08-025-E3`／`WXK08-056-E1`。
- [ ] **`LOOK_AND_REORDER` の `canTrash` に枚数上限が無い**（続き376 発見・`WX25-P1-098-E1`）＝原文「カードを**1枚まで**トラッシュに置き」なのに `EffectInteractionModal.tsx:661` の `lookReorderTrash` は **Set で無制限**＝公開した3枚全部を捨てられる過剰効果。型に上限フィールドを足して UI で cap する。
- [ ] **🆕続き377 で登録した BANISH{ALL} 側の機構ギャップ4件**＝①**色の否定 filter が型に無い**（`WXDi-P03-085-E1`「**黒ではない**対戦相手のパワー3000以下のすべてのシグニ」＝`color` の否定形が無い）②**「そのターンにアタックしていた」フラグの filter が無い**（`WXDi-P08-010-E3`／`WXK01-035-E1`＝強制アタック後の一斉バニッシュが**全シグニ**になる）③**キーワードOR の filter が無い**（`WX14-004-E1`③「**【アサシン】【ランサー】【ダブルクラッシュ】のいずれかを持つ**すべてのシグニ」）④**自身パワーとの等値比較が無い**（`WX17-046-E3`「**このシグニと同じパワーを持つ**他のすべてのシグニ」＝`excludeSelf` だけ載って比較は未表現）。
- [ ] **既存の機構待ち登録**＝チーム 34／アンコール 19／合計制約 25／同一性 16／ゲームから除外 26／正面 19／数量比例 26（§6.3 台帳）。§5c の「⏳機構待ちと判定したテンプレ」＋§5d の「🆕新機構待ちとして登録」も同区分。
- `npm run census:clusters` → §6.3 台帳

#### (iii) 構造混線 — Opusタスク13（**1件ずつ再parse・バッチ化できない**）
- [ ] **②で新規発見した3件**：`WXK04-090-E1`（「公開しないかぎり**自分を**トラッシュ」→「自分の水獣シグニをトラッシュ」）／`WXK04-025-CB-E2`（多段閾値全脱落・`ALL`→1・能力付与が**直接ライフクラッシュ**に化ける・エナ全トラッシュのコスト欠落）／`WXDi-P16-034-E2`（引用付与の平坦化で《無》支払い回避が消え**無条件アタック禁止**・owner/duration も誤り）。
- [ ] **続き369 で照合済みの `WXDi-P04-016-E3`**（パターンD）。
- [ ] **§5d 末尾の照合済み12件**のうち (D) 相当。
- ⚠**「効果はだいたい parse できていて修飾が1つ落ちている」(i)(ii) と違い、(iii) は木ごと作り直し**＝1件あたりのコストが桁で違う。**後回しでよい。**

#### ⚠️ 併せて記録（続き375 実測・**思い込みの訂正**）

- **held は「安い勝ち筋」ではない**＝229枚を leaf 単位で調べたところ **純増（情報が増えるだけ）は 0枚**。52枚は**情報が減るだけ＝採用してはいけない**、177枚は増減混在で1枚ずつ判断が要る。「held を一括採用すれば稼げる」は成り立たない（`WX24-P3-063` の1件から一般化しすぎていた）。
- **census が 0 になっても「全カードが完璧に動く」にはならない**＝計器の死角は①JSON は正しいが engine 実装が違う ②文間の実行順序 ③効果単位の粒度 ④参照解決の誤り。続き375 の `WD15-018-E1` も真因は **engine 側**（`matchesFilter` が `colorNotMatchesLrig` を知らない）だった。**本当の完了判定器は BEHAVIOR_AUDIT（§5a）と §7 実機検証**であり、**P1 だけ完璧にしても目標には届かない**＝§7 を並行して進める。

---

### 5d. 1効果ずつの原文照合（2026-08-07 続き369 新設・**現在の主戦場**）

**目標＝「すべてのカードが完璧に動作する」に必要な、効果単位の修飾脱落を全数是正する。** §5c の文型バッチが
届かない**単発テール**が本体で、**母集団は約874効果**（census 高シグナル 1199 のうち単発テンプレにしか現れないもの）。
実バグ率は無作為サンプルで **11/11**（§5c 冒頭の根拠節）。

**⚠この作業の単位は「カード/効果」であって「文型」ではない。** 効果はだいたい parse できていて、
**filter / 対象 / owner / トリガー主語 / 条件節が1つ落ちている**のが典型。

**進め方**
0. ⚠**2026-08-07 続き376 以降は、まず §5d-0 末尾の「🗂 作業種別 worklist」から取る**（(iv)計器較正 →(i)配線ギャップ →(ii)機構ギャップ →(iii)構造混線 の順にコストが安い）。下の 1.〜4. は**そこで取った項目を1件ずつ処理する手順**として使う。クラスタ順に単発を掘るのは**探索コストが高い**（実測：直近7セッションで約12効果/セッション）。
1. `npm run census:clusters` → `docs/_census_clusters.txt` の**単発テンプレ**から効果を取り、原文とJSONを並べて照合する。
2. 落ちている修飾を**欠落パターンで分類**する（下表）。分類は毎回更新すること＝**同じパターンが繰り返し出たら parser へ還元する**のがこの作業の要。
3. 単発の外科パッチは curated JSON へ入れてよいが、**parser が同じ出力を出すようにするか MANUAL 化するか**をセットにする（さもないと parserWorklist の held が増える＝[memory] parserworklist-semantics）。
4. ゲートは `npm run gates`＋`npm run regen`＋同型★0。**parser を触ったら A/B 差分で「意図した効果だけ変わった」ことを機械確認**する。

**欠落パターンの分類（続き369 の無作為12件・以後ここを更新して母数を測る）**

| # | 欠落パターン | 例 | 件数(12件中) | parser 還元の見込み |
|---|---|---|---|---|
| A | **対象フィルタの脱落** | 「《X》**以外の**」「**能力を持たない**」「**このターンに捨てた**」「＜C＞の」「数**以下のレベル**」 | 6 | ◎（系統化しやすい・最優先） |
| B | **owner 取り違え・任意性喪失** | 「**対戦相手は**〜しても**よい**」→ 自分・mandatory | 2 | ○ |
| C | **条件節・機構ゲートの脱落** | 「手札が5枚以下の場合」「【チーム】ルリグ3体」 | 2 | ○（§5c の残規則と地続き） |
| D | **重度の構造混線** | `WXDi-P04-016-E3`＝別効果の内容混入・コスト消失・2体→1体 | 1 | ✕（1件ずつ再parse＝タスク13） |

**⚠完了判定について**＝**census が0になっても「すべてのカードが完璧」にはならない**。census の死角は §5c 末尾の4項
（参照解決の誤り／効果単位の粒度／JSONは正しいが engine 実装が違う／文間の実行順序）で、重度混線（D）も
たまたま census に掛かっただけの個体が居る。**最終的な判定器は BEHAVIOR_AUDIT（§5a）と §7 実機検証**。

**✅消化済みバッチ**
- **（続き369）パターンA「能力を持たない〜シグニN体」11効果**＝`TargetFilter.noAbilities` を新設し、`hasNoAbility`（既存・`abilities_removed` も数える）へ委譲。parser は `parseNoAbilitiesFilter()` を新設して6ビルダーへ配線、decompiler にも描画を追加。⚠**同語の別用法3つ（付与形「〜として場に出す」／条件節「〜場合」／リマインダー文）は filter にしない**＝(b) を誤爆すると**原文と逆の過小実行**になる。golden で「載らないこと」も固定（(b)5枚・(c)4枚）。

- **（続き370）パターンA「無色ではない〜」9効果**＝`nonColorless` は**型にも matchesFilter にも実装済み**だったが、**SEARCH と「トラッシュ→手札」のフィルタ合成から漏れて**いて無色シグニまで拾えていた。SEARCH は無条件配線、トラッシュ→手札は既存の**カード whitelist**（`TTH_FILTER_BATCH2_WAVE1_CARDS`＝段階ロールアウト機構）へ**原文照合した4枚だけ**を追加。⚠`WXEX2-06`「そのシグニと同じレベルの無色ではないシグニ」は2系統を同時に表せないため**据置**（部分 filter だけ採用しない方針）。⚠配線前に**全CSV走査で用法55件を分類**し、危険な別用法が無いことを確認（前バッチの教訓の適用）。

- **（続き371）パターンA「《カード名》以外の」36効果**＝`excludeCardName` は**型・`matchesFilter`（execUtils/effectEngine 両方）・decompiler に実装済み**で、漏れていたのは**8ビルダーのフィルタ合成**。⚠**実害が2種**＝①**反転13効果**（除外名が `cardName`＝部分一致に入り「**そのカードしか選べない**」原文と真逆）②**脱落23効果**（自分自身も回収/バフできる過剰効果）。**反転側は parser では既に正しく held に溜まっていただけ**＝`heldReview --adopt` 12枚＋`WX09-CB02` は**カード単位 PRESERVE で held に載らない**ため外科パッチ。⚠**据置＝【ビート】コスト3効果**（`cost.beat_signi` は count のみだが engine `analyzeBeatSigniCost` が EffectText から除外名を読む＝**JSON に語彙が無くても正しい**）。⚠配線前に全CSV走査で50ヒット/49効果を全数分類し、条件節用法が `PR-204`／`PR-238` の2件だけと確認。

- **（続き372）パターンA `nonColorless` の残りビルダー 11効果**＝第2バッチ（続き370）は **SEARCH とトラッシュ→手札だけ**を配線しており、トラッシュ→デッキ／デッキの一番下／トラッシュ→エナ／エナ→手札／相手手札を見て捨てさせる／`POWER_MODIFY_PER_TRASH_COUNT` の countFilter が素通しだった。⚠**同時に独立バグ2件**＝①続き370 の「部分filter禁止ガード」が**全文**を見ており後続文の語が前文の filter を消していた（対象名詞句に限定して是正）②**`effectEngine.ts` の `matchesFilter` が `execUtils` 版と乖離**（`colorExclude`／`excludeResona`／`noAbilities` が無く CONTINUOUS・activeCondition・HAS_CARD_IN_FIELD で黙って無視。live 使用数 3／33／11）＝移植。併せて「場に〈色〉ではないシグニがある場合」の条件節を新設（`WX16-Re06-E1` が**無条件で基本パワー5000**だった）。

**🔁再評価候補＝`WXK09-029-BURST` の据置**。続き370 が `effectParser` に置いた明示ガード（「そのシグニと共通する色を持つスペル」を含むカードでは同じ効果木の `nonColorless` も落とす）で据置中。⚠**「部分filter不採用」は `WXEX2-06`＝同一の対象に2系統が掛かる形でこそ正当**で、本件は**別ステップの別対象**（step1＝無色ではないシグニ／step2＝そのシグニと共通色のスペル）＝step1 だけ正しくしても step2 は悪化しない。次に触る人はこの区別を踏まえて採否を決めること。

- **（続き373）パターンA 動的な同一性参照 6効果＋据置1件の解除**＝①`levelEqTrigger`「そのシグニと同じレベル」を**トラッシュ→手札**へ（トラッシュ→**場**では配線済みだった＝`WXEX2-06-E2`／`WXEX2-78-E1`）②`nameEqLastProcessed`／`levelEqualsVar` をデッキサーチへ（`WXK05-044-E1`／`WXK09-032-E2` が**万能サーチ**だった）③`WXK05-044-E1` は前段 REVEAL が語順「シグニ**N枚を**公開する」未対応で bare に潰れ**参照先ごと消えていた**ので `source:HAND_CARD`＋クラス/レベルを復元 ④`WX24-P3-063-E1` は正しい MANUAL 定義が held に滞留していただけ（採用漏れ）。**🔓据置解除＝`WXEX2-06-E2`**（続き370 から）＝`levelEqTrigger` の配線で2系統とも表せるようになったため。**部分filter禁止は「片方を表せない」ときの規律で、表せるようになったら解く。**

**🆕新機構待ちとして登録（次の入口）**＝①`WXK11-040-E2`「エナからトラッシュに置いたシグニと**同じ名前**」＝コスト経路の**名前**変数が無い（レベル合計版 `last_cost_energy_trash_level_sum` はある）②`WX14-072-E1`／`WX14-075-E1`「手札から公開する**か**トラッシュに置く」＝選択肢構造が潰れて片方だけ（パターンD・タスク13）。

- **（続き374）パターンA 共通色否定＝相手エナ除去 4効果**＝原文38件のうち**30件は既に正しく**、既存の段階ロールアウト表 `LRIG_COLOR_BATCH5_ENERGY` に未登録の分だけが `TRASH{ENERGY_CARD,opponent}` に filter 無し＝**相手エナのどのカードでも落とせる過剰効果**だった。原文照合して3件追加（`WXDi-P14-054-E1`／`WXDi-P15-089-E1`＝PARTIAL で外科パッチ／`WXDi-P12-002-E1`＝held から採用し「ディソナ3体ゲート」も同時復活）。**機構・型・engine は無改造。**

**🆕engine 修正込みの次バッチ2本（ブロッカー特定済み）**＝①**対象ゾーン取り違え3件**（`WXDi-D09-H20-E1`／`WXDi-P04-054-E1`／`WXDi-P11-060-E2`）＝原文は「相手**エナゾーンから**カード1枚」なのに `TRASH{SIGNI, owner:'any'}`。正準修正は既存 `applyDroppedTargetDesignation` だが (i) 入口 `DESIG_BEFORE_COST_RE` がシグニ専用 (ii) `bindToStoredTarget` が `tgt.type!=='SIGNI'` で降りる (iii) executor の ENERGY_CARD × `targetsStored` 対応が未検証。⚠**色フィルタだけ足すのは禁止**（誤った対象に正しい制限を付けて誤りを固定する）＝golden で固定済み。②**`WD15-018-E1`**＝「相手エナに〈相手ルリグと共通色でない〉カードがある場合」の条件節ごと落ちて**無条件バニッシュ**。ブロッカーは `ENERGY_HAS_CARD` が `effectEngine.ts` にしか無く `execUtils.evalCondition` に無いこと＋condition 内 filter での動的ルリグ色の解決経路が無いこと。

- **（続き375）パターンA 続き374 のブロッカー2件を実装（4効果）**＝①**エナゾーン対象宣言のゾーンごと取り違え**3件（`WXDi-D09-H20-E1`／`WXDi-P04-054-E1`／`WXDi-P11-060-E2`）＝帰結が `TRASH{SIGNI,any}`＝**場のシグニを落とす別物**だったのを `applyDroppedEnergyDesignation` 新設で `TRASH{ENERGY_CARD,opponent,filter}` へ。⚠**`SELECT_TARGET_ONLY` 方式は不採用**（コスト量が対象に依存する形の機構で、ここは不要。engine 拡張3点＝うち1つは循環 import が要るのに得るのは選択タイミングだけ）。②**`WD15-018-E1`**＝条件節ごと落ちて**無条件バニッシュ**だったのを `ENERGY_COUNT_FILTER` 節で是正。⚠真のブロッカーは `ENERGY_HAS_CARD` の不在ではなく、**`matchesFilter` が `colorNotMatchesLrig` を知らない**こと＝`evalCondition` 側で cond.owner のルリグ基準に解決する処理を追加した。**この系統は OK 33→37／未配線 5→1**（残1＝`WX25-P3-003-E1` の LB 封じ STUB は別機構）。

**続き369 で照合済み・未修正の12件（次バッチの入口）**＝`WXDi-P11-044-E2`(A+C)／`WX17-Re05-E1`(過小)／
`WXDi-P03-024-E2`(A)／`WXDi-P05-072-E2`(B)／`WXEX2-55-E1`(A)／`WXK05-027-E1`(A)／`WXK05-072-E1`(A+B)／
`WXDi-P16-092-E1`(C)／`WXDi-P04-016-E3`(D)／`WX17-032-E2`(トリガー主語)／`WXK05-016-E2`(A)／`WX25-P1-TK6-E2`(原文未取得・要確認)。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れの解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**⚠**「367件」という数字は古い（2026-07-12続き87で実測823カードと判明＝BEHAVIOR_AUDIT等の主作業でカード母集団が増減し続けているため。件数メトリクスを信じない §3の原則どおり）。系統別内訳は`docs/_stub_leak_classification.txt`（`node scripts/_stubLeakScan.mjs`で再生成）参照。**

- ~~durational付与の「ターン終了時まで」期間注記の逆翻訳脱落（母数132枚）~~ **✅続き62で112枚復元（decompiler `restoreLeadDuration`・engine/JSON 不変）・34枚は偽陽性で正しく無注記**（詳細 BUGFIXES・原文は PLAN_DETAIL 2026-07-19退避節）。
- ~~①REVEAL_AND_PICK 文法崩れ／②LOOK_AND_REORDER 行き先欠落／③CHOOSE 圧縮／④BLOCK_ACTION 英語ID漏れ／⑤timing/icon 英語漏れ~~ **✅全て是正済（BUGFIXES①〜⑤・詳細 [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5b）**。
- ~~残＝engine実装済みSTUB id の意味文化~~ **✅是正済（2026-07-07再確認）**＝全10シートの英語STUB露出は3件のみ（`VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`／`POWER_PLUS_BANISHED_POWER`／`OPP_LRIG_DECK_TO_LRIG_TRASH`＝いずれも§6.3機構待ち登録済み）。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367→その後の作業でカード母集団が変動し2026-07-12実測823・続き87で機械分類済み）**。effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能なものが大半。**effects JSON の再parse（機構実装・データ層修正）が本筋＝Opusタスク13**。系統別内訳（16テーマ・カード数の多い順＝デッキ操作系184／パワー修正系165／手札系102／トラッシュ系75／対戦相手コスト系63／エナ系50／ライフ系48／シグニ配置系48／ルリグ系36／能力付与系31／ガード・アタック制限系26／ソウル・アーツ系15／ウィルス系10／色・クラス系4／ゲーム除外系3／チャーム系1／その他54）は`docs/_stub_leak_classification.txt`参照（続き87・Sonnet）。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- ~~Z-2：BET系の表現描画~~ **✅完了（続き86・詳細は §3 Sonnetタスク7）**。engine 側（ベット判定自体の実装状況）は変更なし＝表現のみの改善。
- ~~B層：JSONデータ欠落の補完~~ **✅是正済（続き33-36・2026-07-07再確認＝全10シートで「then/destination 欠落」0件）**。例外は§6.3登録済み（WDK07-E15／WXDi-P07-010／WXDi-P03-005／WX26-CP1-100）。
- [ ] **🆕生JSON漏れ（`【シャドウ:{"levelGte":3}】` 形）72件**（2026-08-07 続き366 で観測）＝`シャドウ:{…}` は**JSON データ側の符号化**（engine もこの文字列を読む）なので、表示だけ日本語化するには decompiler に整形器を足す。`levelGte/levelLte/powerLte/cardType/color` の素直な形のほか `selfPowerHalfLte` `lrigTrashArtsColor` `downerLrigLevel` `declaredNumberPowerEq` `declaredColor` `artsCostLte` `selfColor` `selfPowerLte` など**約20種**あり、**1種ずつ原文照合が要る**（【シャドウ（レベル3以上）】等の原文表記に合わせる）。⚠英語**条件**ID漏れは続き366 で残0にした。
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

> このセクションは機構台帳＝**現存の残作業は下記 F／G／K ＋ E-2 の defer 3件に集約**（🏁**C は 2026-08-09 続き394〜397 で残0クローズ**＝計37効果／🏁**E-1「引用付与の忠実化」は続き398〜399 で残0クローズ**／🏁**E-2 は続き400〜402 で tractable を全消化し、残3件は根拠つき defer**／🏁**J 群は 2026-08-08 に残0クローズ**）。消化済み機構の実装詳細（フラグ・ファイル・commit）は BUGFIXES 各日付が一次記録。完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節。

**残作業（現存項目のみ・完了項目は PLAN_DETAIL へ退避済み）**
- **🏁 E「引用付与の忠実化」追加在庫＝2026-08-09 続き398〜399 で残0クローズ**（`WX20-036-CB-E1`／`WX24-P2-010-E1`）。詳細は BUGFIXES 同日2件。**旧記述（「付与先を source として引用能力内の自己除外・攻撃制限コストを評価する共通機構が必要／外側 action の `excludeSelf` では reader に届かない」）は投入前実測で否定された**＝(a) engine は**既に holder を source として `excludeSelf` を評価済み**（`effectEngine.ts:4777` の `GRANT_PROTECTION.subjectFilter.excludeSelf`／`:1814` の `POWER_MODIFY`）。真因は parser で、引用内側は `rawText`→`parseBlock` で**単独再パースされ結果を上書きする**（`effectParser.ts:10174-10188`）ため外側 fixup が届かないだけだった。(b) 「ライフバーストではない対戦相手のシグニの効果を受けず」は**新語彙0で書けた**（`WXK11-021-E1` が完全なテンプレ）。⚠**engine 側は1点だけ不足**＝`collectEffectImmuneSigni` が action 直下の `GRANT_PROTECTION` しか読まないため SEQUENCE 再帰を追加（**5条件の完全一致ゲート**で限定＝SEQUENCE 内 `GRANT_PROTECTION` の既存8効果は挙動不変）。(c) `WX24-P2-010-E1` は「あなたの他のシグニ2体を場からトラッシュに置かないかぎりアタックできない」＝**解除コストつきアタック制限**を新設（`BLOCK_ACTION.attackCost.fieldTrash` ＋ `signi_attack_field_trash_costs`）。⚠**軸の取り違えに注意**＝`keyword_grants['アタックできない']`（`cannotAttackSigni`）は**人間のアタックボタン生成1箇所しか読まず CPU に効かない**。per-signi の実効軸は `blocked_actions:'ATTACK:<id>'`、支払いは**人間3経路と CPU が共通で通る `performSigniAttack`**（別経路は `handleFlipAttack` のみ）。
- **🏁 C. 「この方法／この効果で〜した場合」の後段条件が live で丸ごと脱落（＝無条件実行）＝2026-08-09 続き394〜397 で残0クローズ（計37効果・Codex 委譲4連投）**。詳細は BUGFIXES 同日4件と PLAN_PROGRESS 先頭。**旧記述（「fresh 残42効果」「共通ブロッカーは前段が `lastProcessedCards` に記録しないこと」）は投入前実測で3点とも否定**＝(a) `docs/_partial_report.txt` は **fresh parser の出力**を測る計器で live の実害を測らない。**生成元（CSV原文×live JSON）から数え直した母集団は60カード**。(b) `lastProcessedCards` の writer は engine に**153箇所**あり完備（`execTrash{DECK_CARD}` は `effectExecutor.ts:1228`）＝機構待ちではなく **parser が条件を1つも生成していなかった**。(c) 条件語彙も既に揃っていた。**消化＝第1波11（効果内トラッシュ）／第2波11（公開・手札に加える）／第3波11（手札捨て・エナ配置）／第4波4（裏向きフリップバック）。**
  - ⚠**この家族に手を出すときの必須知識＝「記録する」の書き方が前段ごとに3通り**（取り違えると恒久 no-op でゲートに一切映らない）：`execTrash` は無条件に書く／**`REVEAL_AND_PICK` は `recordRevealed: true` のオプトイン**（`effectExecutor.ts:4533`）／**`LOOK_AND_REORDER` は `needsInteraction` を返すだけで記録は `resumeLookAndReorder`（`:6791`）＝UI ポーズを跨いだ後**。さらに**コスト由来の捨て札／エナトラッシュは engine ではなく `BattleScreen.tsx` が `last_cost_trashed_cards`／`last_activated_discard_count` に書く**（writer は `src/screens/battle/costs.ts`）。⚠**「公開された全カード（`visible`）」と「手札に加えたカード（`picked`）」は別集合**。
  - **🏁 第4波（続き397）＝裏向きフリップバック4カード**（`WXDi-P09-034-E1`／`WXDi-P05-037-E2`／`WXDi-P01-040-E2`／`WXDi-P09-009-E3`）。**「条件脱落」ではなく機構が空回りしていた**（同じ解決内で裏返して即座に表へ戻す＝裏向きが0秒）。🔑**`PlayerState.face_down_signi`（`string[]`）はその STUB 以外に消費者が0件＝ゾーンが埋まったままで「同じ場所にシグニがない」が永久に偽**。`field.facedown_signi`（ゾーン配列・inert・描画/permute/boardDiff 済み）へ移送する `src/engine/facedownSigni.ts` を新設し、**ターン終了3経路（`doPhaseAdvance`／`confirmEndDiscard`／`cpuTurnAction`）で両プレイヤーを解決**（4枚中2枚は**相手のシグニ**を裏返すので「自分の場だけ直す」既存形の写経は永久 no-op になる）。`WXDi-P09-009-E3` の二重遅延（ターン終了時に裏向き→**次の相手アタックフェイズ開始時**に復帰）は `turn_end_facedown_all` ＋ `pending_opponent_attack_facedown_returns` で実装＝**`delayed_triggers` が THIS_TURN 限定でもターン跨ぎは表せる**（先例は `pending_facedown_flip`／`triggerCollect.ts:3589`）。**残2枚は別機構へ移送**＝`WX15-067`（ウィルス除去によるコスト減）／`WXDi-P13-004A`（離場置換＝§6.4 F-3 の家族）。**抽出計器の偽陽性2枚**（`WX20-053-E2`／`WXEX2-21-E1`）は既に正しい。
- **🏁 E-2. 個別カード機構待ち＝2026-08-09〜10 続き400〜402 で tractable を全消化。残3件は「実装しないのが正しい」defer**（下記）。**消化＝** ✅`WX25-P3-023-E2`（続き400）＝起動即発動→**2ターン持続の監視能力**へ。在庫の「2ターン持続＋相手手札移動 collector が必要」は**両方 stale** で、`ON_HAND_ADDED`（`triggerCondition.handOwner`／`byOpponentEffect`／`excludeGrowPhase`。テンプレ `WX25-P2-063-E1`）＋ `GRANT_LRIG_ABILITY{duration:'UNTIL_OPP_TURN_END'}` で**新語彙0**。⚠**構造だけ直すと恒久 no-op**＝`collectHandAddedTriggers` が付与ストアを走査していなかった。／✅**permanent 引用付与4効果**（続き401）＝母集団は CSV 全文で「このゲームの間」×「「…」を得る」の**4枚だけ**。`WX15-002-E2` は**既に `permanent:true` で修正不要**、`WXK07-001-E1`（内側は honest defer・専用の未実装 STUB を新設）、`WXDi-P03-003-E1`（**新 `GRANT_PLAYER_ABILITY`＋`game_granted_effects`**＝「ルリグ」でなく「あなた」が得る）、`WXK03-001-E3`（**新 `GrantLrigAbilityAction.targetOwner`**＝相手ルリグへの恒久付与）。3経路のターン終了を `clearTurnGrantedLrigAbilities` に統合。／✅`WX20-028`（続き402）＝**多重アクセ**。死語彙 `ACCE_LIMIT_99`/`ACCE_LIMIT_2`（`src` に消費実装0件）を既存 `MULTI_ACCE_LIMIT` へ寄せ、collector を「上限N／ALL／旧値なし=2」対応へ拡張。**`signi_acce` を `(string|null)[]` → `(string[]|null)[]` へ型移行**（105参照・19ファイル。tsc が全参照を落とすので追従漏れを機械的に示せる）。同じ死語彙だった `WX16-031-E1`／`WXK04-053-E1` も検証側で原文照合のうえ採用（census −2）。／✅**`WDK14-013` は実測で消化済みと判明**（在庫「残は複数候補時のプレイヤー選択のみ」が stale＝`SigniOnPlayCostModal.tsx:581-587` が候補を描画して選ばせ、`BattleScreen.tsx:11750` が選択を渡している。古いコメントだけが残存）。**✅WX15-016（続き282）／WXDi-P06-031（続き288）／WXDi-P08-037（続き290）／WXEX1-08（続き278）も消化済み**（詳細は PLAN_DETAIL）。
  - **📋 残3件＝いずれも根拠つき defer（着手前にこの理由が今も有効か再判定すること）**：(a) **`WX17-044`＝⚠2026-08-10 再判定＝先行ブロッカーだった §6.4 は消化済（続き403）だが、このカードは**依然として別要因**で止まっている**＝①`WX17-044-E1` に `trashActivated` が立っておらず（parser が「トラッシュにあるこのカードを〜」の【起】をトラッシュ起動と認識していない）②本体アクションが `ADD_TO_FIELD` ではなく**【トラップ】を表向きにして発動させる**（現行の逆翻訳は別物になっている）③コストの `trashExile.self` は `trashActivateCost.ts` の対応キーに入れていない（使う効果が0件のため未実装のまま置いた）。**着手時は parser 側（①②）から。UI は③を足すだけで載る。**(b) **`WXDi-P05-006` choice①＝着手禁止**（ピースカットイン割込み基盤）。(c) **`WX20-Re20`＝一体で要る**（選択数依存コスト・能力なし filter・任意複数配置UI・同一 instance 群のターン終了時 trash）＝部分実装しない。
- **K. `manualEffects.ts` ↔ live JSON の乖離（2026-08-08 続き381 発見・続き382 で計器化＆消化）＝残 15 効果**＝**`build:effects` は live 側 `parseStatus:MANUAL` を不可侵にするので、`manualEffects.ts` を後から直しても live には永久に届かない**（`buildEffectsJson.ts:187`「手修正は不可侵」＝**JSON 直編集**の保護が意図だが、`mergeManualEffects` の出力も MANUAL なので新しい manual エントリも同じ網に掛かる）。`_held_review` にも `_partial_fresh` にも出ない**第3の死角**。**計器＝`npx tsx scripts/censusManualDrift.ts`**（明細 `docs/_manual_drift.txt`／`--date` で方向判定 `docs/_manual_drift_dates.txt`／`--card <ID>` で1カード完全diff／`--adopt <effectId,…>` で**効果単位**同期）。**ゲート＝goldenTest の「§6.3 K トリップワイヤ」**＝`MANUAL_DRIFT_KNOWN` に無い乖離が出たら即 FAIL・解消したのにリストに残っていても FAIL（＝リストは worklist であって許可リストではない）。⚠🔴**実測値は 52 効果／46 カード**（続き381 の速報 105/427 カードは**素朴な JSON 文字列比較＋キー順依存**の過大計上で、続き382 に計器を作って実測し直した値が正）。**続き382 で 37 効果を同期して残 15**。⚠**一括同期は不可（双方向）**＝(a)`LIVE_ONLY`/`LIVE_RICHER` は live のほうが新しい（`PR-426-E3` 等の後付け手修正）(b)**同じ効果でも項目ごとに新旧が違う**＝`WX16-023-E1`/`WXK10-008-E1` は action は manual が新しいのに **timing は manual が退化**していた（CSV の `Timing` 列より狭い `["ATTACK"]`）＝`--adopt` は timing が変わると既定で中止する（`--allow-timing-change` で明示解除）。(c)🔴**`parser由来` の効果に日付判定を使ってはいけない**＝「manual 側の日付」はそのカードのブロックが触られた時刻でしかない。実測で日付が MANUAL_NEWER と言った parser 由来5件は**全件 live のほうが正しかった**（`WX22-013-E2` は fresh が2択を DRAW 1本へ平坦化＝退化）＝計器はこれを `PARSER_REVIEW` として別枠に出す。**残 15 の内訳＝`PARSER_REVIEW`（通常の目視レビュー案件）＋ manual 定義の `UNDATED` 8／`SAME_TIME` 2**。
- **F. 保留**（core改変が過大リスク）＝WXDi-P00-026（さんばかルリグ付与・ルリグ再アタック未実装がブロッカー）／47枚の【使用条件】【チーム】（正規デッキ常時成立で機能等価＝保留妥当）。
- **G. 置換else系統の残（続き269・§3タスク5から正式送り）**＝**B 2件の置換else部分は✅続き289で消化**。SPK06-01-E1 は追加赤0/2/4の三択を同一対話で保持し、対象数1/2/3を排他的に実行（付随するレイラのコイン技回数・次回コスト軽減は既存基盤が無く別途defer）。WXK06-032-E1 は既存 `refresh_count_this_turn` を双方参照し、最初に選んだ同一対象へ－4000/－12000を排他的に適用する。**残はC 13件**（反復、引用能力／ルリグ能力付与、複雑CHOOSE、支払い系ルール等）。CのWXDi-P02-042-E1を再確認したが、相手側のターン中手札捨て枚数を読む条件軸が無いためhonest defer。effectId 全明細と不足機構は `docs/_replace_else_triage.txt`。
- **✅ 完了機構（A 動的コンテキスト追跡／B BANISH_REDIRECT／D レゾナ出現条件トリガー／H タスク12(xxii) の不足機構／J-3 ライフクロス閾値遷移／I `WX25-P3-028-E2`／「正面」サブ機構／消化済み機構の台帳）は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-02 整理②」節へ退避**（2026-08-02）。実装詳細の一次記録は BUGFIXES 各日付。**下に残るのが現存の残作業＝C／E／F／G＋J（J-1/J-2/J-4/J-5）と、H・I が残した横展開の教訓**。

- **⚠H が残した横展開の教訓＝UNKNOWN を実装するときは fresh parser の出力を先に測る。** H4 は fresh が主語を見ない `STUB DEPLOY_RESTRICT` を既に吐いており、live の `UNKNOWN` だけが「対戦相手は1体まで」への意味反転を止めていた（採用した瞬間に過剰実行へ反転する型のドリフト）。
- **⚠I の潜在結合（実害なし・将来の落とし穴）**＝`executeSigniOnPlay` の `beatZones`（`Set<number>`）が **`beat_signi` の「場ゾーン index」と `beat_signi_from_trash` の「トラッシュ index」で同じ集合を共有**している。実データで両コストを併せ持つ効果は**0件**（全数走査）なので現状は実害なしだが、将来併記カードが出ると支払いが `ok:false` で**無言 abort** する。併記が現れたら選択集合を分離すること。
- **⚠I の付与ストア走査は `activeCondition` を評価しない**（`effectEngine.ts:3137-3142`）。今日の唯一のエントリ `WX24-P3-069-E1-G` は無条件なので実害なしだが、条件付き CONTINUOUS を付与する効果を足すときは effectsMap 側と同じ `checkActiveCondition` を通すこと。
- **⚠honest defer 継続＝`WX20-Re20`**（選択数依存コスト・能力なし filter・任意複数配置UI・同一instance群のターン終了時 trash が**一体で**要る＝部分実装しない）。

- **🏁 J. timing collector 不在の13効果（2026-07-31・タスク16 の `[C]` から正式送り）＝🏁2026-08-08 に残0クローズ（J-3→J-2→J-5→J-1→J-4 の順に5家族すべて消化）**＝原文が【自】なのに**そのイベントを検出する collector が engine に存在しない**群。現在は `timing:[]` で安全停止中＝**放置しても過剰実行は起きない**（着手優先度は低いが、機構台帳としてはここが定位置）。判定根拠は `docs/_timing_census_triage.txt`「2026-07-31 [B]群の停止理由 機械再検証」節に `ファイル:行` つき。**5家族に束ねると1家族＝1バッチで複数枚が同時に開く**：
  - **✅J-1 他能力の発動監視（2効果）＝2026-08-08 消化（続き383）**＝新 timing `ON_ABILITY_ACTIVATED`。⭐**「発動した瞬間」の唯一の funnel は `BattleScreen.resolveStackNext` の `shiftQueue` 直後**（`shiftQueue` の呼び出し元はこの1箇所だけ＝人間/CPU・【出】/【自】/LB の全経路をここで押さえられる）。`initStack`/`pushToStack` は BattleScreen 内で**113箇所**あり個別配線は不可能だったので、投入時ではなく**解決開始時**をイベント定義にした（投入されても turnGate 等で落ちるエントリを「発動した」と数えない利点もある）。限定は `triggerCondition.activatedAbility*`＝`Owner`（self/opponent）／`Kind`（`AUTO`＝【自】・`ON_PLAY`＝【出】）／`Eichi`（activeCondition に `EICHI_LEVEL_SUM` を含む）／`FromFieldSigni`（発動元が持ち主の場のシグニ）。`WX19-066-E1`（あなたの【自】の【英知】能力）／`WXEX1-77-E1`（対戦相手の場にあるシグニの【出】能力）。⚠**監視の連鎖を作らない**＝発動した能力自身が `ON_ABILITY_ACTIVATED` なら collector が無視する。⚠**《ターン1回》は `actions_done` へ書き戻す**（既存 collector 群と同じ規約。書き戻さないと同一ターンに何度でも再発火する）。
  - **✅J-2 付与・離脱イベント（4効果）＝2026-08-08 消化（続き380）**＝`ON_ACCE_TO_TRASH`／`ON_SOUL_ATTACHED`／`ON_CARD_ATTACHED` の3 timing を新設し、`boardDiff.ts` の set-diff detector（`countAcceToTrash`／`detectSoulAttached`／`detectCardAttached`）→`triggerCollect.ts` の collector（`collectAcceToTrashTriggers`／`collectAttachedTriggers`）→`BattleScreen` の中央 diff funnel（ON_BANISH/ON_CHARM_TO_TRASH と同じ場所）まで一本に通した。`WXDi-D07-004-E1`（あなたのシグニ1体に【ソウル】＝any_ally・ルリグ側）／`WXDi-D07-019-E1`（このシグニに【ソウル】＝self）／`WXK10-049-E1`（このシグニにカードN枚＝チャーム/アクセ/ソウル横断の汎用付与・minCount）／`WXEX2-19-E1`（あなたの【アクセ】N枚がトラッシュ＝any_ally）。**併せて `THIS_CARD_HAS_ATTACHED` 条件を新設**し、「このシグニにカードが付いている場合」が丸ごと落ちて**無条件【ランサー】**だった `WXK10-049-E2` を是正。⚠**detector は本体が前後で同一のゾーンだけを拾う**（ライズ/場出しでソウル持ちに入れ替わったのを「付いた」と誤検出しない）。⚠**既存 `ON_ACCE` は別経路**（`checkAndFireOnAcceTriggersForOwner`）のまま＝種別指定つきの regex を先に置いて奪わない。census 919→916。golden +6件（collector 3／boardDiff 2／parser 1）。
  - **✅J-4 フェイズ／アタック終了 timing（2効果）＝2026-08-08 消化（続き384）＝これで J 群は残0**。⚠**PLAN のこの行が挙げていた「CPU 側の収集が面で欠けている」は古い警告だった**＝タスク12(lxvii) が 2026-08-04 に残0クローズ済みで、`collectTurnTriggers`（人間）／`collectCpuTurnTriggers`（CPU）が既に対称に揃っていたので、timing を union に足すだけで両経路に載った。**着手前に台帳の警告を実データで検証すること**（J-5 の `WXEX1-41` と同じ教訓）。**(a)`ON_ATTACK_PHASE_END`**＝`ATTACK_LRIG→END` 遷移で発火（既存 `ON_LRIG_ATTACK_STEP_START` が `ATTACK_SIGNI→ATTACK_LRIG` で発火するのと同じ場所）。**(b)`ON_ATTACK_END`**＝個別アタックの終了＝`resolvePendingSigniBattleFor`（バトル解決 Phase2）の末尾＝**`dealtSigniDamage` が既にそこで確定している**ので `triggerCondition.attackDealtNoDamage`（そのアタックでダメージを与えていない場合）をそのまま判定できた。⚠近似＝この後の【ライフバースト】解決は「アタック終了」に含めない。**(c)新条件 `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE`**＋新フィールド `signi_left_field_this_attack_phase`（アタックフェイズ開始時にリセットし、離場の2経路＝効果解決の中央 diff とバトル解決で追記）。🔴**(d)timing を配線すると action が実際に走るので、action 側の既存誤 parse も同時に直す必要があった**＝`WXK11-018-E2` は「このシグニより低いレベルを持つあなたのシグニ1体」が汎用アナフォラ解決で `thisCardOnly`（＝自分自身をアップ）に化けており、`WX24-P2-075-E1` は「このシグニを場からデッキの一番下に置いてもよい」が無関係な STUB `LRIG_UNDER_CARD_OP` に化けていた。**`manualEffects.ts` で是正し §6.3 K の `--adopt` で live へ同期**（この2件は新設したトリップワイヤが即座に検出した＝ゲートが機能することの実証）。
  - **✅J-5 単発（3効果）＝2026-08-08 消化（続き381）**。⚠**台帳の3件のうち1件は既に消化済みだった**＝`WXEX1-41-E1`「【トラップ】Nつが設置されたとき」は `ON_TRAP_SET` として Batch D／タスク(lxx) で配線済み（この行が古かった）。残り2件を消化：**(a)`SP27-007-E1`「あなたか対戦相手が《コインアイコン》を得たとき」**＝新 timing `ON_COIN_GAINED`（既存 `ON_COIN_PAID` の逆方向）。`boardDiff.countCoinsGained` ＋ `collectCoinGainedTriggers` を、**効果解決の中央 diff ＋ グロウ／アシストグロウ／CPU グロウ**の各獲得サイトに配線（`ON_COIN_PAID` が支払いの全サイトを押さえているのと同じ形）。⚠獲得枚数は**上限5クランプ後の実増加**をサイト側から直接渡す（グロウは支払いと獲得が同じ差分に同居するので before/after 差では取りこぼす）。**(b)`WXDi-P11-010B-E1`「《夢限　-Q-》から《夢限　-A-》になったとき」**＝**collector 不在ではなかった**。既存 `ON_LRIG_FLIP`（`collectLrigFlipTriggers`＝センタールリグの `card_identity_overrides` 変化で検出・BattleScreen 配線済み）が受け皿で、**利用者0件の死んだ受け皿**だっただけ。真の原因は 🔴**live JSON の陳腐化**＝`manualEffects.ts` には A面の産出 stub（`MUGEN_Q_RESET_AND_FLIP`＝`execStubPart1.ts:25` に実装済み・golden 済み・`verifyBattleDrive` シナリオまである）とB面の `ON_LRIG_FLIP` が**両方書かれているのに live には届いておらず**、A面は `UNKNOWN`／B面は `timing:[]` のまま機構全体が死んでいた。live を `manualEffects.ts` へ同期して復旧し、**live 側を直接 assert する golden** を足して再発を止めた（従来この golden は `mergeManualEffects` をテスト内で再適用して陳腐化を迂回していたため、ゲートが1件も検出できなかった）。


### 6.4 オープンな実装課題（機構・基盤）

> **消化済みは1行サマリも含めて [PLAN_DETAIL.md](./PLAN_DETAIL.md) へ全文退避**（実装詳細＝「2026-08-12 整理⑧」／1行サマリ欄＝「2026-08-13 整理⑨」／🆕**2026-08-16 続き517〜518 で `O-3`・`O-4`・`O-5`・`O-6`・`O-7`・`O-8`・`O-9`・`O-10`・`O-18`・`O-28`・`O-32`・`O-33`・`O-34` の13行＝「2026-08-16 整理⑳」**／🆕**2026-08-17 続き539 で「■ 消化済み」節の全文21本と残0クローズ済みの `O-11` 行＝「2026-08-17 整理㉖」**）。
> 🆕**実機で確かめるだけの項目はここに置かない**（2026-08-17 続き539）＝**§7 の `V-nn` worklist が唯一の置き場**。旧 `O-13`（8185文字の1セル）は §7 の **🅳 節（`V-28`〜`V-58`）**へ移設した。機構を実装したら**実機の観測点は §7 へ `V-<次番号>` で足す**（§6.4 の行に書き足さない＝これが肥大の原因だった）。
> **ここは生きている worklist だけ**を置く。番号 `O-n` は着手順ではなく**参照用の固定ID**（消化しても番号は再利用しない・欠番はそのまま）。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。**着手前に §3-1 のとおり在庫を実測すること**＝
> 2026-08-12 の整理では消化済みなのに残っていた行が2つあり、2026-08-13 の O-3 では**簿記の「約16効果」が実測38効果**だった。

**■ 未消化 worklist**

| ID | 項目 | 規模 | ブロッカー／次の一手 |
|---|---|---|---|
| **O-1** | **CPU AI の拡張**（→§8） | 大 | メインフェイズ AI（アーツ/スペル/【起】の能動使用・グロウ時トリガー）未実装。CPU 召喚の ON_PLAY 解決は「全配置後まとめて」の近似（人間は1枚ごと）。トラッシュ起動の CPU 使用も未。**§6.4 で唯一の大物＝単独フェーズ扱い** |

**■ 監視だけしている項目（着手不要・壊れたら気付く）**
- 🆕**`census:stubs` は C群（逆翻訳の生ID露出）も 0 でゲート**（2026-08-18 続き545・§6.4 O-12 完了時に追加）＝新しい STUB を足して**日本語の表示語彙を書き忘れる**と赤で止まる。直し方は①ハンドラ直前に `// <ID>: 日本語の説明` を書いて `node scripts/genStubsMd.mjs`（STUBS.md 経由で自動反映）②ハンドラを持たない宣言型は `scripts/decompileEffects.ts` の `miscStubMap` に足す。⚠**どちらも `npm run regen` まで回すこと**（計器は逆翻訳シートの実出力を読む）。
- 🆕**`genStubsMd.mjs` はハンドラ直前コメントの `<ID>:` ラベルを剥がす**（2026-08-18 続き545）＝`ID1 / ID2:` `ID AUTO:` `ID（カード番号）：` の3綴りに対応し、**その id のラベル行だけ**を説明に採る（他 id 宛ての行を混ぜない）。⚠**ラベル行が `ID（…）：` だけで本文が次行以降にある**綴りが実在するので、自己完結していないときだけ続きの行を足す。⚠`stub.id === '[A-Z0-9_]+'` で拾うので**日本語入りの id**（`ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白`）は原理的に拾えない＝そちらは `decompileEffects.ts` 側で id から色を読んで組む。
- 🆕**シグニ【自】の支払いゲートは【出】も巻き込む**（2026-08-18 続き544・§6.4 O-38 実装時）＝`CardEffect` に **【出】と【自】を分ける情報が無い**（どちらも `effectType:'AUTO'`／【出】は `timing:['ON_PLAY']` で、逆翻訳も両方「【自】」と出す）。原文「対戦相手のシグニの**【自】**能力」は本来【出】を含まないが、**旧ハードブロック（`BLOCK_OWN_SIGNI_AUTO`）も同じ母集団を止めていた**のでここは据置＝母集団は変えていない。分けるならアイコン情報を parser から `CardEffect` に載せる必要があり、`BLOCK_OPP_SIGNI_AUTO` 系3枚と同時に直す話になる。
- 🆕**`SPDi43-01-E2` の宣言は実行時のカード原文 regex のまま**（2026-08-18 続き544）＝`STUB{GRANT_ABILITY_INNER_TEXT}` のハンドラ内分岐で、live JSON には構造が載っていない。**engine 側は構造化済み**（`signiAutoPayGateMarkers` → `blocked_actions` → `findSigniAutoPayGate`）なので挙動は正しいが、`GRANT_ABILITY_INNER_TEXT` の受け皿を畳むときはこの分岐も一緒に構造へ移すこと。
- 🆕**ダメージ置換（`DAMAGE_REPLACE_BY_COST`）の「支払うかどうか」は自動適用の近似**（2026-08-18 続き543・§6.4 O-37(a) 実装時）＝原文は「代わりに〈コスト〉を支払って**もよい**」で本来は被害側が選ぶが、消費地点（`crashOneLife`／ルリグアタック応答）は**同期経路で対話窓が無い**。既存の `optional` なライフクラッシュ置換と**同じ枠の近似**（funnel 冒頭のコメント参照）。支払い方は**原文の並び順**で最初に払えるもの、捨てる手札／エナは**末尾から**（決定論）。⚠**払えない盤面では置換が成立しない**ので自滅は構造的に起きない。対話化は離場置換（§6.4 M2）と同じ枠組みで別バッチ。
- 🆕**「その効果によってトラッシュに置かれたカードの中から」の対象は「トラッシュ末尾」の近似**（2026-08-18 続き543）＝`TRASHED_CARD_TO_HAND_OR_ENERGY` は `lastProcessedCards[0]` → 無ければ `trash.at(-1)` を見る**既存ハンドラ**（姉妹 `WX24-P3-030-E1` と共用）。1回の解決で複数枚が置かれたときだけ「最後の1枚」に丸まる。**候補プールを StackEntry へ載せる**なら `leftFieldUnderCards` と同じ作法で複数形フィールドを足す。
- 🆕**`LIFE_TO_ENERGY` は engine に完全実装済み**（2026-08-17 続き529）＝`execStubPart1.ts:3733`。「〈誰か〉のライフクロス1枚をエナゾーンに置く」を新しい action 綴り（`SEND_TO_ENERGY{LIFE_CLOTH_CARD}`）で書きかけて撤回した。⚠**`census:stubs` は「STUB＝未実装」ではない**＝新しい綴りを足す前に、同義の STUB が engine に無いかを必ず見ること。
- 🆕**「エナゾーンから〈限定〉すべてのカード」の2件は1枚（過少）のまま据置**（2026-08-17 続き528）＝`WXEX1-07-E2`／`WXK09-037-E1` の「宣言した色ではない色を持つすべてのカード」。**色限定が未表現**なので `ALL` へ広げると**相手のエナを全部飛ばす過剰**に化ける（A/B で実測）。規則は「エナゾーンから」と「すべてのカード」の**間に修飾が挟まらない綴りだけ**に限定してある＝**このガードを外さないこと**。宣言色の filter が表せるようになったら同時に解ける。
- 🆕**枝の数を固定している golden トリップワイヤは、正しい是正でも落ちる**（2026-08-17 続き528）＝`(lxxv)` は相手ミルの owner を `join(',')` の完全一致で見ており、`WX08-020-E1` が `CONDITIONAL{then, else}` に解けて `DECK_CARD` が2つになっただけで赤になった。**「全エントリが opponent かつ1つ以上」へ書き換え済み**。同型のトリップワイヤを書くときは**性質（owner・型）を固定し、出現回数は固定しない**。
- 🆕**「そうでない場合、〈X〉」の else 節が公開札を指す照応の2件は据置**（2026-08-17 続き527）＝`WXDi-P09-068-E1`「**その**カードをデッキの一番下に置く」／`WXK03-050-E1`「**それ**を…置いてもよい」。単独 parse では参照先が束縛されず UNKNOWN／別物の `LOOK_AND_REORDER` に化け、**行き先は `remainder` の領分で枝ごとに変えられない**＝据置のほうが正しい。ビルダー側は文頭の照応語と UNKNOWN の両方で弾いている（規則を広げるときはこのガードを外さないこと）。
- 🆕**`parseColorFilter` は「AかBの」形で B しか拾わない**（2026-08-17 続き527 に発見）＝`text.includes('〈色〉の')` の直列走査なので「**白か黒の**＜天使＞のシグニ」は `{color:'黒'}` になり**白を落とす過少**。現状の該当は `WXEX1-57-E1` 1件だけで、**live は MANUAL で `color:["白","黒"]` と手当て済み＝実害なし**（＝壊れているのは parser のみ）。複色 OR を書くカードが増えたら `parseLastProcessedMatchesCondition` にある「(色)か(色)のシグニ」規則と同じ形へ寄せる。
- `POWER_THRESHOLD_TRASH`＝parser が生成しうるのに engine に消費地点が無い。**live 0件**で無害。golden に「live 0件」の契約テストがあり、parser 規則が生えた瞬間に赤くなる。
- **【マジックボックス】の複数枚設置**＝現行の分岐は**1枚目だけ設置する**。原文が「1枚まで」の3効果しか無いので実害なし。「2枚以上を同時に設置」するカードが出たら**トラップ分岐と同じ per-card 展開へ寄せる**。
- `STUB{REVEAL_PICK_HAND_SHUFFLE_BOTTOM}` 5効果＝2026-08-12 に実測したところ**全件 `revealPickParams` が完備**（枚数・行き先・filter・二段ピック）で、`REVEAL_PICK_PLAY` のような原文再parse依存ではない。**対象外。**

**■ 消化済み（索引のみ・全文は PLAN_DETAIL）**

> 🆕**2026-08-17 続き539 で全文を [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-17 整理㉖」へ退避した**（21本・6395文字）。
> ここに残すのは**ID と日付だけの索引**＝§6.4 を「生きている worklist」だけに保つ（CLAUDE.md のドキュメント配置ルール）。
> 一次記録は [BUGFIXES.md](./BUGFIXES.md) の各日付。**同じ項目を再着手する前に、まず PLAN_DETAIL の該当節を読むこと**。

- O-12（2026-08-18 続き545・残0クローズ＝ゲート化） ／ O-38（2026-08-18 続き544・残0クローズ） ／ O-37（2026-08-18 続き543・残0クローズ） ／ O-29（2026-08-17 続き542・残0クローズ） ／ O-25（2026-08-17 続き541・残0クローズ） ／ O-14（2026-08-17 続き540） ／ O-15（2026-08-17 続き540） ／ O-11（2026-08-17 続き533・残0クローズ） ／ O-31（2026-08-17 続き537） ／ O-27（2026-08-17 続き536） ／ O-26（2026-08-17 続き535） ／ O-36（2026-08-17 続き534） ／ O-35（2026-08-17 続き530） ／ O-8／O-9（2026-08-16 続き506） ／ O-6／O-7（2026-08-16 続き505） ／ O-4（2026-08-15 続き499） ／ O-3（2026-08-15 続き498） ／ O-3（2026-08-15 続き497） ／ O-31（2026-08-15 続き496） ／ O-30（2026-08-15 続き495） ／ O-28（2026-08-15 続き494） ／ O-3（2026-08-15 続き493） ／ O-3（2026-08-15 続き489） ／ O-3（2026-08-15 続き488） ／ O-3 ／ O-3 ／ O-19 ／ O-20 ／ O-22

## 7. フェーズ3残作業：実機挙動（P3）

**目標＝実機で各カードがルール通り動く。** `scripts/verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

> **実機ヘッドレス検証が可能（2026-06-30〜）**：`scripts/verifyBattleDrive.mjs`＝実ログイン→CPU戦→盤面注入→実UIクリックで効果発火→観測。手順は [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)。**下記の宿題のうち `ON_TARGETED`／`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`／`ON_LRIG_UNDER_MOVED`／`ON_LRIG_GROW`／`ON_COIN_PAID`／`ON_DECK_SHUFFLED` は「発火すること」自体は既に実UI検証でPASS済み**（`ontargeted`/`banishbyeffect`/`lrigundermoved`/`cpugrow`/`deckshufflespell` 等の既定シナリオ）。**各項目末尾の「follow-up」注記（未カバー経路）だけが真に未検証のまま残っている**。

**engine 配線済み timing（C1 群・R30-R46）は✅ほぼ全項目 実機PASS**（続き57-64・112-128）。**個別の PASS 記録・修正経緯は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §7 に退避**。**2026-08-11＝チェックが全部埋まった実機検証17ブロックも [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-11 整理⑥」節へ退避済み**（PLAN 側には1行✅サマリだけ）。

**残る実機検証項目＝下の `V-01`〜`V-71` が単一 worklist**（Sonnetタスク1。§4 進捗サマリと二重に持たない＝**新しい未検証UIが出たらここへ `V-<次番号>` で足す**）。

> **✅ 決着済みブロック8件（続き459／458／457／427／434／431／424／425）は 2026-08-13 続き468 で [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-13 整理⑬」節へ退避**（原文・シナリオID・実測値ごと）。**残作業だけを下へ採番して持つ**。
>
> **番号の意味**＝`V-01`〜`V-03`＝**§3 の実バグ待ち**（シナリオは既にあり赤で待機／engine が直れば緑へ反転する）。`V-04`〜`V-17`＝**未着手・最優先**。`V-18`〜`V-24`＝**未着手・通常**。`V-28`〜`V-65`＝🆕**§6 の機構実装ぶん**（続き409〜518・2026-08-17 続き539 に §6.4 O-13 から移設／`V-59`〜`V-60` は続き540 の O-14・O-15／`V-61`〜`V-62` は続き541 の O-25(d)／`V-63` は続き542 の O-29／`V-64` は続き543 の O-37／`V-65` は続き544 の O-38）。⚠`V-25`〜`V-27` は**既存文中で予約済みの欠番**（`deployCountCapOpponent` ／ エナ0コスト＋条件 ／ `WXDi-P09-009` のターン跨ぎ）。
> ⚠**採番は固定**（消化しても番号を詰めない＝`O-nn` と同じ運用）。消化したら行ごと PLAN_DETAIL へ退避して、ここには残さない。

### 🅰 §3 の実バグ待ち（シナリオ作成済み・**赤のまま既定 order に置いてある**）

- **✅ V-01 離場置換の対話＝2026-08-14 続き475/475b で決着＝6シナリオすべて緑**（`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionNoneIsHonored`／`leaveSubDecisionKeyIsHonored`／`leaveSubNoOptionMeansNoAsk`／`leaveSubAllTargetsAskedPerVictim`）。**在庫3件のうち (cxxv) は取り下げ・(cxxvi)(cxxx) は engine 修正で残0クローズ**。以下は経緯。⭐**(cxxv)「数値 count では問いが出ない」は取り下げ＝シナリオ偽陽性だった**（`pendingCandidates` の index を `pick-<idx>` に使っており、`opp_field` は reverse 描画なので**犠牲シグニを直接バニッシュしていた**＝victim は対象ですらないので問いが出ないのは当然。**結果の盤面は身代わり成立時と同一**＝§7 📌4 の実例）。`clickPendingInstance` へ差し替えて **`leaveSubCpuAutoRespondsSubstitute`／`leaveSubAskDirectedToVictim`／`leaveSubDecisionKeyIsHonored`／`leaveSubNoOptionMeansNoAsk` が PASS**（`asks=1`・`responder=CPU`・options＝`banishSubstitute…`／`none:置換しない`）。**数値 count の hoist（`resumeSelectTarget`＝`effectExecutor.ts:7412`）は正しく効いている。**
  - [x] 🔴**赤で残っていた2本＝engine の実バグ＝続き475b で修正して緑へ**。①`leaveSubDecisionNoneIsHonored`（→§3 **(cxxx)**＝置換不成立時に消費済み ctx を捨てていた）＝**11経路で `sub.ctx` を無条件に採る**ように修正 ②`leaveSubAllTargetsAskedPerVictim`（→§3 **(cxxvi)**＝身代わりで先に場を離れた instance を再処理して移動先へ2枚目を push）＝**ループ5経路に `isOnFieldTop` ガード**を追加。**golden にトリップワイヤ2本を追加し、外すと FAIL することも確認済み**（golden 1964→1966）。
  - [ ] 📋**人間側モーダル（`場離れの置換`）の描画確認は defer**＝`leaveSubstituteAskQueue`（`effectExecutor.ts:740-743`）は victim を `ctx.otherState.field.signi` に限定するので、**問いは常に「効果を撃った側の対戦相手」にしか飛ばない**＝host vs CPU のドライバでは **host を victim にする決定論的手段が無い**。将来案＝(a) CPU 側に効果バニッシュを撃たせる経路を作る (b) `pending_effect` を直接注入する。
  - [ ] 📋**未実装として送る（バグではない）**＝(a) **CPU は常に先頭の選択肢（＝最も安い置換）を選ぶ**＝盤面評価はしない近似 (b) `WX14-026` の**ライフクラッシュは選択肢に出るが engine の自動適用はしない**。

- **✅ V-02「このアタックを無効にする」＝2026-08-14 続き475d で決着＝3シナリオすべて緑**（`oppPayNegateAttackWhenPaid`／`oppPayAttackGoesThroughWhenUnpaid`／`oppHandDiscardIsOpponentSide`）。**§3 (cxxvii) を残0クローズ**＝真因は**2つ**あり、①parser が `NEGATE_ATTACK{owner:'opponent'}` を作っていた（→`STUB{SET_CANCEL_ATTACK_FLAG}` へ是正）②🔴**`resumeOpponentPayOptional` の `pay` 枝が `payOpt.action` を実行していなかった**＝`thenOnPay` の帰結が**エナ払いのときだけ**丸ごと落ちていた（コスト種別で挙動が割れる無言バグ）。
  - ⚠**観測の注意**＝進行中アタックのキャンセルは **`negatedAttacks` には載らない**（一時フラグ＝`effectExecutor.ts:8822` で立て `BattleScreen.tsx:8119` で消去）。**ライフが減ったかどうかで見る**。

- **✅ V-03 ピースの効果が使用時に解決しない＝2026-08-14 続き475g で決着**（→§3 **(cxxiii)** 残0クローズ）。`connectSpinningChoice4Pay`／`connectSpinningChoice4Insufficient` が**緑へ反転**（④pay＝host.hand 2→0・guest.life 7→6／手札不足では pay が `(disabled)`）。**ピースは「使用＝印刷コストを1回払って即解決→ルリグトラッシュ」**になり、キーゾーンを占有しなくなった。新規 `pieceUseResolvesAndGoesToLrigTrash` も PASS。

### 🅱 未着手・最優先

- **🔶 V-04 エナ支払い元の一本化（続き428）＝2026-08-14 続き472 で**代表経路を決着**（Codex 起案→Claude 実機検証・**6シナリオが2回連続PASS**・既定 order 登録済み・**engine バグ0**）。⚠**支払いサイトの本数は資料間で食い違う**＝`energyPaySource.ts:8` は**17本**、`:111` は**13本**、旧 PLAN 記述は**14本**。静的参照も「ラベル利用モーダル14ファイル／`planEnergyPayment` 13箇所」＝**「全経路」の母数は未確定**（codex が実測で指摘）。
  - [x] 🔴**既存のエナ支払いが従来どおり動くか**（回帰確認）＝**実機PASS 2経路**（`energyPayArtsDeductsSelectedOnly`＝アーツ／`energyPayKeyUseDeductsSelectedOnly`＝キー使用）。`UNDER_CARD_AS_ENERGY_COST` を持つカードが**居ない**盤面で、**選んだエナ（index 1）だけがトラッシュへ行き、もう1枚は残る**。⚠**funnel は `applyTo` を呼び忘れると「エナが1枚も減らない＝ただでアーツが撃てる」形に壊れる**設計（`energyPaySource.ts:19-26`）なので、シナリオは**その症状を名指しで FAIL させる**判定を持つ。
    - 📋**残り12経路は未検証**（グロウ／スペル／アシスト各種／シグニ【起】／エナ【起】／手札【起】／トラッシュ【起】／ルリグ付与【起】／カットイン／【出】コスト）。⚠🔑**シグニ【起】は `SigniActivatedModal.tsx:265` にエナ候補の testid が無く、同名エナを決定論的に選べない**＝**踏むなら testid 追加が先**。
  - [x] 🔴**`WXDi-P10-041`（羅植姫 タナバタ）の下カードで払えるか**＝**実機PASS 2本**（`underEnergyPayOfferedInAttackPhase`／`underEnergyPayDeductsUnderCardOnly`）。`ATTACK_ARTS` でアーツのコスト選択を開くと **`artscost-energy-*` が4件**（エナ2＋下2）並び、**下カードのエントリだけ `title` に「（カード名）の下」**を持つ。**下カードだけを選んで支払うと、その1枚が stack からトラッシュへ行き、シグニ本体も残りの下カードもエナも減らない**。
    - 🔑**観測点＝`artscost-energy-{i}` の `i` は pool の index そのもの**（`ArtsModal.tsx:374,383`）で、**pool は先頭が `my.energy` と同順・追加分は末尾**（`energyPaySource.ts:101`）＝**個数と `title` の有無だけで決定論的に観測できる**。
  - [x] **フェイズと上限のゲート**＝**実機PASS 2本**。①`underEnergyPayNotOfferedInMainPhase`＝**盤面を1文字も変えず `top.turn_phase` を `MAIN` にするだけ**で**下カードが候補から消える**（`artscost-energy-*` が2件・`title` 付き0件）＝`duringMyAttackPhase` ゲートが効いている。⚠**「0件だから効いた」ではなくエナ側2件が出ていることを同時に assert**（モーダル未描画との区別）。②`underEnergyPayPerTurnLimit`＝下カードを3枚置き、**`turn_off_zone_energy_paid_count` を 0→2 にするだけ**で **`title` 付き候補が 3→1** に減る＝**上限を候補生成の1点で切っている**（`offZonePayLimit`）。
    - 📋**相手のターン／カットイン窓／ターン跨ぎの復活は未検証**。
  - [ ] **`WXDi-P10-041-E3` と噛み合うか**＝下のカードを払った後にこのシグニが場を離れると、「下にあったカード1枚をトラッシュからエナゾーンへ」の対象に**払ったカードも含まれる**（トラッシュに居るので正しい）。
  - [ ] 📋**未実装として送る（バグではない）**＝(a) 候補の**視覚的マーカーが `title` 属性だけ** (b) **残り上限より下カードが多いとき「どれを払うか」を選べない**（安全側の近似）(c) **CPU は下カードから支払わない**。

- **✅ V-05 対象宣言の脱落（続き423）＝2026-08-13 続き469 で決着**（Codex 起案→Claude 実機検証・**5シナリオが2回連続PASS**・既定 order 登録済み）。⭐**母集団は `STUB{SELECT_TARGET_ONLY}` を使う live 118効果**（PLAN が書いていた「16効果」は**続き423 で変更した数**であって母集団ではない）＝代表2枚で filter の enforce を固定した。
  - [x] 🔴**所有者と体数**（`WXDi-P02-009-E3`）＝**実機PASS 3本**。①`targetDeclOpponentOnlyCandidates`＝`pendingCandidates` が **guest の3体だけ**で**自分のシグニは混入しない**（旧＝自分のシグニ1体が戻っていた）②`targetDeclUpToTwoSelectsBoth`＝**2体選べて、選んだ2体だけが相手の手札へ戻り未選択の1体は場に残存**（旧＝`count:1` 固定）③`targetDeclUpToTwoAllowsZero`＝**`決定 (0/2)` で0体確定でき相手3体すべて残存**（旧＝1体強制）。⚠**0体確定でも《ガードアイコン》の任意コストは提示され、payすると手札→トラッシュへ動く**＝**現状を記録しただけで仕様判断はしていない**（原文「対象とし、〜捨ててもよい。そうした場合、それらを手札に戻す」の解釈が要るなら別途）。
  - [x] **パワー制限が候補に効くか**（`WX06-CB01-E1`）＝**実機PASS 2本**。①`targetDeclPowerCapExcludesAbove`＝候補は **P3000 の1体だけ**で **P15000 は除外**（旧＝無差別）②⭐`targetDeclPowerCapUsesEffectivePower`＝**対照**＝盤面のカードを1枚も変えず `guest.temp_power_mods` に **+1000 を足すだけ**（印字3000→**実効4000**）で**候補が一度も非空にならない** ⇒ **パワー判定が実効パワーで行われている**（`fieldCandidates` に `ctx.effectivePowers` を渡す＝`execStubPart1.ts:163`）ことを実機で証明。⚠**注入が効いたことを `powerMods` で先に確認してから**候補を見ている（効いていないのに「候補0」で PASS すると偽陽性）。

- **V-06 🔴 幻コスト第2波＋下カードコストの絞り込み（続き422）2件**
  - [x] **下カードコストの候補が絞られるか**（`WXDi-P11-042-E1`）＝**実機PASS 2本**（`underCostFiltersByColor` ＋ 対照 `underCostUnavailableWhenNoRed`・2026-08-13 続き471）。下に「赤シグニ1枚＋非赤2枚」を置くと**候補は赤1枚だけ**／支払うと下 stack から trash へ行き対象がバニッシュ（エナへ）。**下の1枚を白へ交換するだけ**の対照で **`pay` が `(disabled)`** になり本体も走らない。⭐**続き421 でこの filter は「型にも無い死フィールド」だった**（逆翻訳にだけ出て engine は無視）＝**続き422 の配線が実UIまで届いていることを実機で確認**。⚠**runtime 型（`execUtils.ts:171-196`）と JSON payload 型は別物**で、**片方にキーを足しただけでは `resolveOptionalCostSpec` が落として黙って無視される**（`:177-179` の警告）。
  - [x] 🔴**捨てさせる向き**（`WXDi-P14-060-E1`）＝**実機PASS 2本**（`revealOppHandSkipKeepsOpponentHand` ＋ 対照 `revealOppHandPayDiscardsOpponentAndDraws`・2026-08-14 続き473）。**辞退**すると `host.hand` 2→2／`guest.hand` 3→3／`guest.trash` 0→0／`guest.deck` 40→40 で**全て不変**（＝捨てさせもドローも起きない）。**pay** すると **`guest.trash` 0→1・`guest.deck` 40→39** で、🔑**`host.hand` は 2→2 のまま**（旧実装＝自分が1枚失って相手が引く**真逆**は再現しない）。⚠**手札の枚数では見えない**（捨て1・引き1で戻る）＝**trash と deck で見る**。
    - 🔑**構造の読み違いに注意**＝この JSON は `SEQUENCE[REVEAL, OPTIONAL_ACTIVATE, TRASH{opponent}, CONDITIONAL→DRAW]` で **`TRASH` が `CONDITIONAL` の外**にあるため「辞退しても捨てさせるのでは」と疑ったが、**実際は Pattern⑤**（`effectExecutor.ts:4314`）が**後続の `TRASH＋CONDITIONAL` を丸ごと pay 側 `cont5` に包み skip 側を no-op にする**（`:4421`）＝**「そうした場合」慣例（`:3745`）は STUB の直後が CONDITIONAL のときだけ**。実機でも辞退時に何も動かないことを確認した。

- **V-07 🔴 幻の手札コストの是正（続き421）2件**＝**16効果**でコストの徴収先が変わった（従来は原文と無関係に**手札**が1枚落ちていた）。
  - [x] 🔴**エナゾーンから正しく徴収されるか**（`WX24-P1-047-E1`）＝**実機PASS 2本**（`energyTrashCostDeductsEnergyNotHand` ＋ 対照 `energyTrashCostUnavailableWhenShort`・2026-08-14 続き473）。エナに「Lv1シグニ2枚＋Lv2シグニ＋スペル」を置くと**候補は Lv1シグニ2枚だけ**／支払うと**その2枚だけがトラッシュへ**行き、🔑**手札は1枚も減らない**（旧実装＝**原文と無関係に手札が1枚落ち、しかもエナは減っていなかった**）。**2枚目を Lv2 へ交換するだけ**（総エナ4枚は維持）の対照で **`pay` が `(disabled)`**。
    - ⚠**検証側で足したドライバ修正**＝**支払い後に `BANISH{targetsStored}` がもう一度 `SELECT_TARGET` を開く**（候補は宣言済み対象に限定）＝**ここに応答しないと `pEff=SELECT_TARGET` のままタイムアウトする**（続き469 の `targetDeclUpToTwoSelectsBoth` と同じ挙動）。**支払い自体は初回から正しく完了していた**。
  - [x] **自己トラッシュコストが二重に取られないか**（`WX06-CB01-E1`）＝**実機PASS**（`optionalTrashSelfNoHandLoss`・2026-08-13 続き469）。**pay**＝`WX06-CB01` 自身が場からトラッシュへ行き対象がバニッシュされ、🔑**host の手札は1枚も減らない**（旧＝手札1枚＋このシグニの**両方**を失っていた）／**skip**＝**双方のシグニも手札も不変**。⚠**同一 spec を再注入して `optcost-pay`／`optcost-skip` のクリックだけを変える**対照形。

- **✅ V-08 `OPTIONAL_COST{handDiscard}` のモーダル（続き420）＝2026-08-13 続き470 で決着**（Codex 起案→Claude 実機検証・**6シナリオが2回連続PASS**・既定 order 登録済み）。**18効果**で「手札を捨てる／捨てない」のモーダルが新たに出るようになった分。
  - [x] **絞り込みが効くか**＝**実機PASS**（`handDiscardCostFiltersCandidates`）。⚠**代表カードは `WX18-001-E3` ではなく `WXK09-041`**（同じ `handDiscard.filter`／`canAfford` 経路を**シグニの【自】アタックだけ**で踏めるため。`WX18-001` はルリグ Lv4・GrowCost《黒》×3・《コインアイコン》起動が要る）。**手札に「＜天使＞シグニ1枚＋非該当2枚」**で pay を選ぶと**候補は該当1枚だけ**／支払い後に本体が走り**相手の手札 2→1**。⚠従来は**末尾の1枚が問答無用で落ちていた**。
  - [x] **`canAfford` が効くか**＝**実機PASS**（`handDiscardCostUnavailableWhenNoMatch`＝**対照**＝手札の該当札を非該当へ**交換するだけ**）。**`pay` が `(disabled)`**（`canAffordOptionalCostSpec`＝`execUtils.ts:250,253-257`）／`skip` しか選べず**本体が走らない**（相手の手札不変）。
  - [x] **辞退できるか**＝**実機PASS 2本**（`handDiscardSkipBlocksBody` ＋ 対照 `handDiscardPayRunsBody`）。`WXDi-CP01-027-E3` で **skip すると本体（相手シグニを手札に戻す）が走らず**自分の手札も減らない／**pay すると《ガードアイコン》持ちシグニだけが候補**になり、支払うと相手の P10000以下シグニが手札へ戻る。
  - [x] 🔴**ルリグを対象にするか**＝**実機PASS 2本**（`handDiscardOptionTwoDownsOpponentLrig` ＋ 対照 `handDiscardOptionThreeDownsOpponentSigni`）。`WX25-CP1-004-E1` の**②だけ**を選ぶと **guest の lrigDown=true・両者の signi は全て up**／**③だけ**を選ぶと **guest の signi だけ down・guest lrig は up**＝**②と③で対象が入れ替わっていない**（旧＝自分のシグニがダウンしていた）。⚠**「4つから2つまで選ぶ」は `choose_count:2`＋`upTo:true` の multiSelect**（`effectExecutor.ts:4567`/`:4613`）で、**1つ選んだ時点で「決定」が押せる**（`EffectInteractionModal.tsx:541`）＝**②③を同時に選ぶと対象の切り分けができないので必ず1つずつ**。
  - 📋**やらなかった**＝`WX18-001-E3` 本体（上記の理由）。⚠**その原文は「捨て**る**」＝強制なのに live は `OPTIONAL_COST`（任意）**という既知差がある＝**仕様判断は未実施**。

- **✅ V-09① 手札捨ての任意コスト＝2026-08-13 続き470 で決着**（上の V-08 と**同一 STUB**なので同じバッチで消化）。`WXK09-041` で ①pay/skip が出る ②**skip で手札が減らず本体も走らない** ③支払うと**＜天使＞のシグニだけ**が候補 ④**該当が0枚なら「支払う」が `(disabled)`**＝**4点すべて実機PASS**。

- **V-09 🔴 任意性脱落の系統消化（続き416〜417）＝残り2件**（①は上で✅・②は続き469 の `optionalTrashSelfNoHandLoss` で✅）＝engine 側は golden で固定したが、**任意コストの pay/skip モーダルが新たに出るカードが 140枚超**あり、実UIでの提示・支払い徴収は golden では踏めない。
  - [x] ~~**手札捨ての任意コスト（`OPTIONAL_COST{handDiscard}`）**~~＝**✅続き470**（上の V-09① を参照）。
  - [x] **効果まるごと任意（`OPTIONAL_ACTIVATE`）**＝**実機PASS**（`optionalActivateSkipThenPay`・2026-08-13 続き471）。⚠**PLAN が例示していた `WX07-003` は記述が誤り**＝実データは**ルリグ**（ミルルン・ユニオン Lv4）で、原文は【自】「あなたの**《クロスアイコン》を持つシグニ１体が場に出たとき**、カードを１枚引いてもよい」＝**【出】でドローではない**。⇒ 代わりに **`WXDi-P02-037-E3`**（シグニ／限定なし／【出】「あなたのライフクロス１枚をクラッシュしてもよい」）で検証＝**通常召喚の ON_PLAY で「発動する／発動しない」が出る**／**発動しないと `host.life` 7→7（不変）**・**発動すると 7→6**（確認フローも消化）。⚠**同一 spec を再注入して応答だけを変える**対照形。
  - [x] ~~**自己トラッシュコスト（`OPTIONAL_TRASH_SELF`）**~~＝**✅続き469**（`optionalTrashSelfNoHandLoss`＝V-07② と同一）。
  - [x] **`underAnySigniTrash{fromThis}` が「このシグニの下」だけに絞るか**＝**実機PASS**（`underCostFromThisOnly`・`WXK08-052`）。**このシグニの下1枚**と**別シグニの下1枚**を同時に置くと、**候補は自分の下の1枚だけ**／支払うと相手シグニに **−3000**、**別 stack は不変**。
  - [x] 🔴**新設 `fieldDown`（アップ状態の自シグニをダウン＋色）**＝`WXDi-P04-051`。①**アップ白シグニが3体そろっていないと「支払う」が選べない**＝**実機PASS**（`fieldDownCostRequiresThreeUpWhite`）。②③＝**2026-08-14 続き475d で決着**（→§3 **(cxxviii)** 残0クローズ）。従来は timing が `ON_ATTACK_SIGNI` で**シグニのアタック時に発火→攻撃者が先にダウン→3体そろわない＝恒久 no-op** だった。**engine に `collectAllyLrigAttackTriggers` を新設**（アタック側の味方カードを走査する経路が丸ごと無かった）してから timing を `ON_ATTACK_LRIG`＋`triggerScope:any_ally` へ、帰結を **LRIG 対象**へ是正。⇒ **実機PASS**（`fieldDownCostPaysThreeAndWhite` を**ルリグアタック経路へ書き換え**＝3体down＋白エナ徴収→**ルリグがアップし能力を失う**・シグニは対象外）。⚠**シナリオはライフ枚数を spec で固定する**（ルーム再利用で前シナリオのクラッシュが残ると `before` がずれて完走タイムアウトになる＝実測）。

- **✅ V-10 F-3 身代わりを効果バニッシュへ配線＝2026-08-14 続き475／475c で決着＝5シナリオすべて緑**（`effectBanishSubstituteRunsAutomatically`／`effectBanishNoSubstituteWithoutSacrifice`／`effectBanishSubstituteDiscardsSpell`／`effectBanishLifeCrashSubstitutePaysLife`／`battleBanishSubstituteStillInteractive`）。**在庫だった (cxxix) も engine 修正で残0クローズ**。以下は経緯。
  - [x] **バトルバニッシュは従来どおり対話モーダルが出る**（＝自動適用に化けていない）＝**実機PASS**（`battleBanishSubstituteStillInteractive`）。`pending_banish_substitute` が立ち、モーダル「身代わりバニッシュ」と待機ログを確認。
  - [x] 🆕**効果バニッシュの身代わりは「被害側へ問い1件→CPU が選択」で成立する＝2026-08-14 続き475 で 3本とも緑**（`effectBanishSubstituteRunsAutomatically`／`effectBanishNoSubstituteWithoutSacrifice`／`effectBanishSubstituteDiscardsSpell`。**2回連続 ALL PASS**）。⭐**続き474 が「問いなし自動適用」を前提に `asks===0` を要求していたのが誤り**＝`BANISH{count:1}` は `resumeSelectTarget` の hoist（`effectExecutor.ts:7412`）を通るので**問いが1件出るのが現行の正**（V-01 の再検証と整合）。**期待値を `asks===1 かつ victim名を含む` に変え、機構が動いた証拠（§7 📌4）は「問いログ＋身代わりログ」の2本立てで取る**ようにした。⚠**対照側（犠牲なし／非スペル）の `asks===0` は据置**＝置換候補が1本も無いので問いが立たないのが正。
  - [x] 🆕**driver の位置依存フレークを2件つぶした（続き475）**＝①**盤面は正しいのに `normalLog=false` で落ちる**＝`H.queryState()` の盤面は Supabase 直照会で先に真になるが `game_logs` の行は数百ms遅れる（§7 📌7 と同型）。⇒ **settled 後も PASS しない間は最大12反復ぶんログの到着を待ってから確定**する（単体PASS・3件バッチFAIL の再現を解消）。②**`決定 (1/1)` が出ず 64反復×3秒＝211秒溶かす**（実測1回）＝pick のクリックが React に載らなかったとき。⇒ **`SELECT_TARGET` が続いているうちは pick からやり直す**自己回復を追加。
  - [x] 🏁**(cxxix)＝`WX14-026` の「コスト0」身代わりを修正（続き475c）**＝真因は `lifeCrash` が `autoEligible:false` でも **`leaveSubstituteAskOptions` は `kind==='optional'` だけで絞るので選択肢には出る**→CPU が選ぶ→**`applyEffectBanishSubstituteChoice` に分岐が無く末尾の `trashStackSpell` へフォールスルー**＝**0枚トラッシュで成立**（実機ログと完全一致）。⇒ **apply 側に `lifeCrash` を実装**（`field.check` を立てて【ライフバースト】確認フローへ乗せる）＋**未実装 costType を列挙段階で落とす `isImplementedSubstituteCost`**。⭐**「同期的に差し込めない」という旧コメントの前提は誤りだった**＝実機で `[CPU] ライフクロスをオープン: …（ライフバーストなし）` まで通しで動く。**`effectBanishLifeCrashSubstitutePaysLife`（旧 `…NotOnEffect`）が guest.life 7→6 で PASS**。
  - 📋**残る近似（バグではない）**＝**CPU は常に先頭の選択肢を選ぶ**ので、`lifeCrash` しか無い盤面では**必ずライフを払って生き残る**（盤面評価はしない）。原文は「してもよい」なので**辞退も正当**＝人間側 UI では選べる。
  - 📋**参考（旧記述）**＝下の項目が当初の検証内容。⚠③は**前提が誤っていた**（下の (cxxix) 参照＝`WX14-026` も効果バニッシュで身代わりできるのが正しく、当時は「されない」を期待値にしていた）。
  - [x] **効果でバニッシュされたときに身代わりが自動で走るか**＝相手の場に `WX12-024`（＋他の＜電機＞）を置き、**バトルではなく効果**で `WX12-024` を狙う → **`WX12-024` が残り、代わりに他の＜電機＞がバニッシュされてログに「身代わり：〜」が出る**こと。あわせて①`WX10-033`（手札のスペル1枚が自動で捨てられる）②**バトルバニッシュは従来どおり対話モーダルが出る**こと③`WX14-026`（ライフクラッシュ型）は**効果バニッシュでは身代わりされない**ことを確認する。⚠**V-01 と同じカードを使うが軸が違う**（V-01 は対話化・こちらは自動適用の配線）。

- **✅ V-11 配置制限ゲートの一本化＝2026-08-14 続き476 で決着＝6シナリオすべて緑**（フラグ版／CONTINUOUS 版＝`fillDeployCaps` 経路／CPU 召喚の3経路とも実UIで効いていることを確認・engine バグ0）。**経緯と罠の詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-14 整理⑭」へ退避**。📋**未カバー＝`deployCountCapOpponent`（自分の効果で相手の場に出す）＝踏むなら V-25 として別立て**。

- **✅ V-12 アタック可否ゲート一本化＋付与ストア共通走査（続き404）＝2026-08-14 続き478 で決着＝8シナリオすべて緑**（続き477 で6/8→続き478 で残り2本が緑へ反転・Codex 起案→Claude 実機検証・既定 order 登録済み）。**在庫だった (cxxxiii) は取り下げ**（＝engine バグではなくシナリオ偽陰性）＋**《ターン2回》未管理の実バグ1件を修正**して残0クローズ。
  - [x] 🔴**CPU がアタック不可のシグニでアタックしないか**＝**実機PASS 3本**。①`keyword_grants` に「アタックできない」を注入すると、**そのシグニだけ up のまま**・もう1体はアタックして down・**`ATTACK_LRIG` へ前進**（＝`performSigniAttack` の早期 return で同じシグニを選び続ける**無限ループが起きない**）＝`v12CpuCannotAttackGranted` ②**対照**＝`keyword_grants` だけ外すと両方 down＝`v12CpuCannotAttackGrantedControl` ③**別軸**＝防御側 `opp_signi_attack_power_cap:5000` で P3000 だけ up・P7000 は down、cap を外すと両方 down＝`v12CpuPowerCapWithControl`。
    - 🔑**アタック可否の6軸のうち4軸は `PlayerState` 注入だけで作れる**（`keyword_grants`／`signi_attack_once_limit`＋`attacked_signi_ids`／`opp_signi_attack_power_cap`／`signi_attack_cost`）＝**CPU 側の検証が決定論的に書ける**。
    - ⚠**アタッカーの正面が空だとライフクラッシュ確認モーダルで止まる**（`VERIFY_BROWSER.md` の既知の罠）＝CPU 観測系は**防御側3ゾーンを埋めて正面を塞ぐ**。実際これで対照2本が最初 FAIL した。
    - 📋**未カバー**＝`fieldTrashCostAlreadyPaid`（G154 BURST 無効化回避モーダルからの再入）。予約済みコストと再入状態を注入だけで作れないため見送り。
  - [x] 🔴**付与された【自】が ON_SPELL_USE / ON_SIGNI_BANISH_OPPONENT で発火するか**＝**実機PASS 2本**。(a)`WXDi-P13-008-E3` を**エクシード4で実際に撃って付与**（`lrigUnder` 4→0・`grantedLrigAutoIds` に sub が入る）→ ディソナスペル `WXDi-P12-089` 使用で相手シグニに **-4000**＝`v12GrantedSpellUseMinus4000` (b)`WXDi-P12-041-sub-E1` を付与ストアへ直接注入→**バトルバニッシュで発火**しエナのシグニとアタッカーが入れ替わる／**2回目は《ターン1回》で非発火**（`actions_done` に同 ID が1件だけ）＝`v12GrantedBattleBanishOnce`。
    - ⚠**swap は2段階**＝①エナから1枚を `SELECT_TARGET` ②`REARRANGE_SIGNI{mode:'swap'}` モーダルで**カード画像を1回クリックすると即確定**（`EffectInteractionModal.tsx:842` 付近＝確定ボタンが無い）。②を押さないと `pending_effect` が `REARRANGE_SIGNI` のまま止まり、**発火しているのに盤面が動かない絵**になる。
    - ⚠🔎**要確認（断定しない）**＝場に**同名シグニ2体**が居ると swap モーダルの候補で**非アタッカー側**を掴めた（`targetsBattleAttacker` が instance 単位で効いていない疑い）。シナリオは zone1 を別カードにして回避済み。**確証は取っていない**ので、踏むなら候補列を直接見るシナリオを1本立てる。
  - [x] 🔴**付与された【自】が ON_ENERGY_CHARGE で発火するか＝2026-08-14 続き478 で決着＝実機PASS 2本**（`v12GrantedEnergyChargeTwice`／`v12GrantedEnergyChargeThirdBlocked`）。`SPDi43-13-E2` を【起】から撃って付与→`WXDi-P12-082`（【エナチャージ１】）を1枚ずつ使うと、**各回 `actions_done` に `SPDi43-13-sub-E1` が入り `lrig_down` が false になる**。**3回目（`energy 2→3`）は約5秒待ってもアップしない**＝《ターン2回》が効く。
    - 🔴**続き477 の「発火しない」は誤りだった**（→§3 (cxxxiii) 取り下げ）＝**シナリオが「エナ増加後の最初の settled 観測」で即 FAIL していた**（📌13 違反）。付与 watcher は `BattleScreen.tsx:1734` の early return により **stack/pending が空になった「あと」の useEffect** で走るので、**最初の settled では必ず未発火**。⚠**対照 `v12PrintedEnergyChargeControl` だけが最初からポーリング型**で、**2本の「判定の待ち方」が非対称**だったことが誤診の原因＝**対照は盤面だけでなく待ち方まで揃える**。
    - ✅**実在した実バグ＝付与 watcher が `usageLimit` を一切見ず `actions_done` にも書き戻していなかった**。`reserveGrantedAutoUsage`（`src/screens/battle/grantedAuto.ts`）を新設して**この経路だけ**で判定・予約し、`WRITE_STATES` で書き戻す（**印刷能力の走査ループは無変更**＝diff 実査で確認）。golden にトリップワイヤ1本（1975→**1976**）。
    - ⚠**負方向側も「その瞬間の絵」で確定させない**＝「3回目はアップしない」は**まだ発火していないだけ**と区別が付かないので、**正方向と同じ待機予算（約5秒）**を置いてから確定する形に是正した。
    - ⚠**SPDi43-13 は【起】が2つあり、E1（《ダウン》でSランサー付与）も「【起】コストなし」と表示される**（ルリグ用のコストラベル生成に `down_self` が無い＝`BattleScreen.tsx:12585` 付近）＝**nth 指定が必須**。→§3 **(cxxxi)** と同根の表示側の穴。

- **✅ V-13 トラッシュ起動のコストUI（続き403）＝2026-08-14 続き478 で決着＝6シナリオすべて緑（engine バグ0）**（Codex 起案→Claude 実機検証・既定 order 登録済み）。**トラッシュゾーンUIからの実発動経路（`getMyTrashCardActions` → `TrashActivatedModal` → `executeTrashActivated` → `execAddToField`）は golden では原理的に踏めない**。全件で **①【起】ボタンが出る ②本体が trash→field で全ゾーン合計1枚（＝複製していない） ③払ったカードが正しいゾーンから減る** を assert。
  - [x] **アップ状態のレベル2のルリグ2体をダウン**（`WXDi-P04-042`）＝**実機PASS 2本**（`v13TrashActLrigDownTwo` ＋ 対照 `v13TrashActLrigDownTwoNoUpLv2`）。**センター→アシストL の順に自動でダウン**（`down=[true,true,false]`）／**アップしているルリグを Lv1 だけにするだけ**の対照で**【起】が出ない**。
  - [x] **アタックフェイズ起動＋複合コスト**（`WX19-029`）＝**実機PASS 2本**（`v13TrashActAttackPhaseCombo` ＋ 対照 `v13TrashActAttackPhaseComboShortHand`）。エナ《黒》2枚＋**手札の＜遊具＞2枚**を払って**ダウン状態で**場に出る／**手札総数は維持したまま＜遊具＞を1枚に減らすだけ**の対照で**【起】が出ない**。
  - [x] **《ディソナアイコン》フィルタつき手札捨て**（`WXDi-P12-053`）＝**実機PASS**（`v13TrashActDisonaDiscardFilter`）。**ディソナ2枚だけ `data-selectable=true`**・非ディソナは false／支払うとディソナ2枚だけが trash へ行き**非ディソナは手札に残る**。
  - [x] **コイン2＋ON_COIN_PAID 連鎖**（`WXDi-P16-082`）＝**実機PASS**（`v13TrashActCoinChain`）。`coins 2→0`・`coins_paid_this_turn=2`・`WXDi-P15-069-E1` が `actions_done` に入り **+2000 が乗る**。
  - 📋**やらなかった**＝**【ウィルス】2個除去**（`WX17-049`／`WXEX2-53`）／**【チャーム】1枚トラッシュ**（`WXEX2-73`）／**エナ0コスト＋条件**（`WX11-049`）＝踏むなら V-26 として別立て。
  - 🔑**セレクタ整備が前提だった**＝`TrashActivatedModal` に `trashact-modal`／`trashact-cancel`／`trashact-cost-summary`（`data-coin-cost`・`data-lrig-down-count`・`data-lrig-down-level`）／`trashact-energy-{i}`／`trashact-hand-{i}`（`data-selectable`）／`trashact-exceed-{i}`／`trashact-pay` を**属性だけ**追加（レイアウト・ロジックは無変更）。⚠**コインとルリグダウンは自動支払いで候補要素が存在しない**ので summary の data 属性で観測する。

- **✅ V-14 §6.3 C 第4波／E（続き397〜402）＝2026-08-14 続き479 で決着＝14シナリオ中13本が緑**（Codex 起案→Claude 実機検証・**13本は2回連続 ALL PASS**・既定 order 登録済み）。**赤1本は engine 実バグの再現用**（→§3 **(cxxxiv)**）。
  - [x] **裏向きにしたシグニがターン終了時に戻る／トラッシュされるか**＝**実機PASS 3本**（`v14FacedownOwnReturnsHumanEndNoDiscard`／`…Opponent…`／`…OpponentOccupiedTrashes…`）。**解決直後は `field.facedown_signi[i]` に居る**（＝まだ裏向き・`field.signi` ではない）→ human END で**同じゾーンへ表向き復帰**。**相手のシグニを裏返した場合も戻る**／**元ゾーンが埋まっていればトラッシュ**（`turn_end_facedown_signi_returns` の `trashIfOccupied`）。⚠`WXDi-P09-009` の**ターン跨ぎ**は別ライフサイクルなので未着手（踏むなら V-27）。
  - [x] **解除コストつきアタック制限**（`WX24-P2-010`）＝**実機PASS 3本**（`v14AttackFieldTrashPayTwoHuman`／対照 `…OneHidesAction`／`…CpuDeterministic`）。他シグニ2体を払うと**その2体だけが場→トラッシュ**（各 instance 1枚）でアタッカーが down／**他シグニを1体に減らしただけ**の対照では**アタック action が出ない**／**CPU は左から決定論的に2体**を払う。
  - [x] **多重アクセ**（`WX20-028`）＝**実機PASS 4本**。**2枚では E2 不発**（アクセ・相手エナ・相手3面をすべて保存）／**3枚で初めて発火**／通常シグニは**2枚目の【アクセ】ボタンが disabled**／**host だけ WX20-028 に替えると enabled**（対照）。🔴**旧形式 `signi_acce` の読み込みは実バグ**＝→§3 **(cxxxiv)**（`v14MultiAcceLegacyStringOneLoads` が**赤のまま既定 order に置いてある**）。
  - [x] **「このゲームの間」付与がターンを跨いで残るか**＝**実機PASS 3本**。`WXK03-001-E3` の付与2件が `permanentGrant:true` で **human END→CPU ターンを跨いで残存**／`WXDi-P03-003-E1` は `game_granted_effects` に入り END を跨いで残存（ピースはルリグトラッシュへ）／**`UNTIL_OPP_TURN_END` は CPU END で失効**（`v14UntilOppTurnPowerExpiresCpuEnd`＝**CPU END 直前に長期ストアの +4000 を直接観測してから**消滅を2回連続で確認）。
  - 🔑**検証側で足したドライバ修正3点**＝①**場のシグニは `StackModal` を開く**（`card-detail-modal` は CardModal 専用）ので `stack-detail-modal` を新設して両対応 ②**Playwright の accessible name は全角スペースを ASCII へ畳む**ので regex を `\s*` 化 ③非 MAIN シナリオは `repatchTop` でフェイズ固定。**①②は §7 📌17・18 として登録**。

- **🔶 V-15 §6.3 J-4 フェイズ／アタック終了 timing（続き384）＝2026-08-14 続き480 で**機構は両方とも実機で確認・6シナリオ中5本が緑**（Codex 起案→Claude 実機検証）。**engine バグ0**。
  - [x] **アタック終了時の【自】が発火するか**（`WXK11-018-E2`）＝**実機PASS 3本**（`v15AttackEndBlockedFiresAndUpsOther`／`v15AttackEndDirectDamageDoesNotFire`／`v15AttackEndOncePerTurnConsumed`）。①正面にシグニがいてダメージが通らなかった場合＝**発火し、別の低Lvシグニだけが up**（＝**アップされるのが自分自身ではない**ことも確認）②**正面だけ空にした対照**＝life 7→6・確認フロー消化まで観測して**非発火** ③`actions_done` だけ変えた対照で**《ターン1回》消化済みなら再発火しない**。
  - [x] **アタックフェイズ終了時の【自】が発火するか**（`WX24-P2-075-E1`）＝**機構は実機で確認**（`left=true`→`phaseEnd=true`→**`trigger=true`＝E1 発火**をログで観測）。**緑2本**＝`v15AttackPhaseEndBattlePathRecordsOpponentToy`（**バトル経路**の離場記録＝`resolvePendingSigniBattleFor`）／`v15AttackPhaseEndNoToyLeftDoesNotFire`（**同一盤面でアタックしなければ非発火**）。
    - [ ] 📋**残作業＝`v15AttackPhaseEndCentralDiffToyLeftFires` を緑で固定する**（**中央 diff 経路**）。E1 の発火までは観測できているが、**帰結（watcher のデッキ下移動・draw）の観測に到達しない**＝`決定` の押下が毎ティック約40秒かかり loop 予算を使い切る。**engine ではなくシナリオ側の未完**。

- **🔶 V-16 §6.3 J-1 他能力の発動監視（続き383）＝2026-08-14 続き480 で**機構は実機で確認・シナリオは未緑**（Codex 起案→Claude 実機検証）。**engine バグ0**。
  - [x] **他の能力の発動に反応して【自】が発火するか**（`WXEX1-77`）＝🔑**実機ログで成立を確認**＝`羅石　ガーネットを召喚`→`[自分] …の【出】/【自】効果`→**`[相手] アイン＝シュミット の【自】効果（能力発動時）`**→**`小剣　ククリをトラッシュへ`**（＝**発動の直後に監視側が解決され、手札1枚が落ちる**）。
    - [ ] 📋**残作業＝`v16AbilityWatcherImmediatelyAfterOpponentOnPlay`／`…OncePerTurnSecondOnPlayIgnored` を緑で固定する**。🔴**盤面設計の作り直しが要る**＝spec の `deck: []` が効果解決中に**「相手リフレッシュ（デッキを再構築）」を誘発**し、さらに**手札・ライフ・埋め札がすべて同名 `WD01-013`** なので **instance 追跡が破綻**する（📌6 の「同名カードが複数並ぶ盤面」の実例）。⇒ **デッキに数枚積む＋埋め札を別カードにする**。
  - [ ] 📋**`WX19-066` は未着手**（同 timing・action=`UP`）。

- **🔶 V-17 §6.3 J-5 単発機構（続き381）＝2026-08-14 続き480 で**コイン獲得は機構を実機で確認・5シナリオ中3本が緑**（Codex 起案→Claude 実機検証）。**engine バグ0**。
  - [x] **コイン獲得で【自】が発火するか**（`SP27-007`）＝**実機PASS 3本**。①**人間 `executeGrow` の Coin 欄獲得**で発火（coins 0→2・draw・`actions_done` 1件）＝`v17CoinGainedHumanGrowFires` ②⚠**所持コインだけ5枚にした同一盤面**では**上限クランプ後の実増加0＝非発火**＝`v17CoinGainedHumanGrowAtCapDoesNotFire` ③**効果解決の中央 diff 経路**（`WXK07-006-E3` で coins 2→4）でも発火＝`v17CoinGainedEffectCentralDiffFires`。
    - [x] **CPU がグロウしたとき（scope `any`）も発火する**＝🔑**実機ログで確認**（`[CPU] グロウ`→`[自分] …の【自】効果（コイン獲得時）`→`1枚ドロー`・`host.actions_done=["SP27-007-E1"]`）。⚠ただし**シナリオ `v17CoinGainedCpuGrowAnyScopeFires` は赤**＝CPU がそのままアタックまで進み settled 条件に到達しないため（**engine ではなく settle 条件の未完**）。
    - [x] ⚠**コイン"支払い"では発火しない**＝**実機で確認**（`【自】効果（コイン支払時）` は出るが `SP27-007-E1` は `actions_done` に入らない）。⚠**シナリオ `v17CoinPaymentDoesNotFire` は赤**＝負方向を確定させる settle 条件に到達せずループ終端（同上）。
  - [ ] **夢限-Q- の反転機構が実機で通しで動くか**（`WXDi-P11-010A`→`B`）＝**既存シナリオ `mugenQFlip` を流すだけ**。⚠**未実行**。📋Codex がソース照合で**規約面の陳腐化3点**を報告済み（`guestSet` 不在で `'field.check': null` を満たさない／機構ログを必須条件にしていない／枚数保存 assert がない）＝**機構的には現行実装と整合**。

### 🅲 未着手・通常

- **✅ V-18 §6.3 J-2 付与・離脱イベント機構（続き380）＝2026-08-14 続き481 で決着＝6シナリオすべて緑**（Codex 起案→Claude 実機検証・既定 order 登録済み・**engine バグ0**）。
  - [x] **【ソウル】付与で【自】が発火するか**（`WXDi-D07-019`＝self／`WXDi-D07-004`＝any_ally）＝**実機PASS 2本**。**1枚ずつ付与**して `WXDi-D07-019` 自身に付けると **self と any_ally の両方が発火**／⚠**付与先だけを別シグニに変えた対照**では**ルリグ側だけ発火・self は非発火**＝**`self` scope が他シグニへの付与で誤発火しない**ことを両方向で固定。
  - [x] **【アクセ】がトラッシュに置かれて【自】が発火するか**（`WXEX2-19-E1`）＝**実機PASS 2本**。`WD18-018` で両軍のホストを同時バニッシュし、**自分の【アクセ】だけ拾ってエナ化**／⚠**付与先を guest に変えただけ**の対照では**相手の【アクセ】はトラッシュに残り非発火**（`any_ally` の極性を固定）。
  - [x] **`WXK10-049` は付いていない状態ではランサーが付かないか**＝**実機PASS 2本**。**アクセが自身に付いていればアタック時にランサー**／**同じアクセを別シグニに移しただけ**の対照では**付かない**（旧＝条件脱落で常時ランサー）。
  - 📋**未修正の原文差1件**＝`WXEX2-19-E1` の原文は「《アクセアイコン》を持つレベル2以下」だが、live の filter は `cardType:'シグニ'`＋`level.max:2` だけで **`hasIcon:'アクセ'` が欠落**（engine 側は `execUtils.ts:755` で消費可能＝**parser/JSON の穴**）。⚠**今回の検証はこの過剰範囲に依存していない**（対象を実際にアクセ判定へ通る `WXK05-041` に固定した）。

- **🔶 V-19 一時レゾナの返却（続き433）＝2026-08-14 続き481 で**「場から消える／トラッシュへ行かない／返却ログが出る」まで到達・4シナリオは赤のまま**（要追試）。
  - [ ] 🔴**出したレゾナがターン終了時にルリグデッキへ戻るか**（`WX07-050`＝【出】／`WX16-Re18`＝【起】）＝**実機で `fieldGone=true` `notTrash=true` `trashDelta=0` `log=true`（`ターン終了時：…をルリグデッキへ戻す`）まで観測**できるのに、**`host.lrig_deck` が空のままで `returned` が立たない**。
    - 🔑**配線は読んだ限り正しい**＝`resolveTurnEndLrigDeckReturn`（`src/screens/battle/turnEndLrigDeckReturn.ts`）は `lrig_deck: [...state.lrig_deck, ...returned]` を返し、**2経路とも**永続化している（`BattleScreen.tsx:3676-3677`＝`doPhaseAdvance`／`:4099-4100`＝`confirmEndDiscard`）。**ログ行は `ret.returned.length > 0` のときだけ出る**ので funnel は戻り値を返している。
    - ⚠**断定しない**＝候補は①**観測側**（シナリオが読む側／タイミング。spec が `lrig_deck: []` 始まりで `placed.length + 1` の比較が崩れている可能性）②**永続側**（`myEndState` 組み立てのどこかで `lrig_deck` が上書きされ**カードが消失**＝一時レゾナが二度と使えない実害）。🔴**§7 📌12 のとおり engine を読み始める前に観測側を疑う**（今日すでに (cxxxiii) が同じ形でシナリオ偽陰性だった）。
  - [ ] **手札が多いターンでも戻るか**＝`v19*WithDiscard*` 2本も同じ地点で赤。**ターン終了処理の2経路**（`doPhaseAdvance` 側と `confirmEndDiscard` 側）はシナリオとして書き分け済み。
  - 📋**未実装として送る（確認済み）**＝`WX16-Re18` の「レゾナを**２枚まで**」は**1枚しか出ない**（`execStubPart3.ts:2892` が `candsSRLD[0]` を1件だけ選ぶ＝複数選択UIが無い）。**2026-08-14 続き481 に実コードで再確認**＝在庫の記述は今も正しい。過少なのでルール違反ではない。

- **V-20 二段の任意（続き426 の残り）1件**
  - [ ] **二段の任意**（`WXDi-P10-039`＝このカードが捨てられたとき）＝①「手札を1枚捨てる／スキップ」→②払った場合だけ「《青》《無》を支払う／スキップ」→③払った場合だけトラッシュから場に出る。⚠①をスキップしたら②が**出ない**こと。⚠「そのターン終了時」の遅延は未実装（②③が即座に来て正しい）。**前提バグは解消済み**（`handDiscard` が既定 order に復帰＝PASS）。**シナリオ未作成。**

- **V-21 `isDisona` 条件節グループ（続き379）1件**
  - [ ] **「あなたの場にパワーN以上の〜シグニがある場合」が**バフ込みの実効パワー**で判定されるか**（`WXDi-P13-078-E1`／`WX06-034-E1`／`WXEX1-50-E1`）＝**印字2000のシグニをバフで10000以上にしたときに条件が成立する**こと。⚠**持続側（`WX15-089/090/091`）は印字のまま据置が正**（実効パワーで見ると循環する）＝**こちらは挙動が変わっていないことも併せて確認**。

- **V-22 `isDisona` パリティ移植（続き378）1件**
  - [ ] **ディソナ限定の CONTINUOUS バフ5効果が実機で「ディソナだけ」に効くか**（`WXDi-P12-044-E1`／`P12-060-E1`／`P13-009-E1`／`P13-047-E1`／`P13-070-E1`）。**従来は `effectEngine.matchesFilter` が `isDisona` を知らず全味方をバフしていた**＝**盤面のパワー表示が非ディソナで増えないこと**と、自分自身（「他の」）が対象外であることを実機で確認する。

- **V-23 機構ギャップ7効果（続き377n）2件**＝engine/golden では固定済みだが `BattleScreen` の経路は計器に映らない。
  - [ ] **ATTACH_CHARM の複数ペア付与が実機で描画されるか**（`WXK07-070`＝【出】でデッキ上2枚を自分のシグニ2体へ／`WXEX1-22-E2`＝相手のトラッシュ3枚を相手のシグニ3体へ）。**`signi_charms` は1ゾーン1枚**なので、2ゾーン以上に同時に付いた状態がボードに出るか・チャーム参照効果（枚数カウント）が正しく数えるかを見る。
  - [ ] **「N体まで＝0体でもよい」選択UIがキーワード付与でも出るか**（`WXDi-P00-004`＝パワー15000以上のシグニ2体まで【ランサー】／`WXDi-P09-053`＝レベル1のシグニ2体まで【シャドウ】）。**0体で確定（キャンセルではなく「選ばずに解決」）できるか**と、**候補が自分のシグニだけ**（従来は `owner:"any"`＝相手のシグニに付いていた）を確認する。

- **V-24 🔴 タスク12 在庫5件の残0クローズ（2026-08-08）5件**＝engine/golden では固定済みだが、いずれも `BattleScreen` の経路にしか無く **golden では原理的に踏めない**（付与の合流・耐性コレクタの呼び出し・レベル表示）。
  - [ ] **(cxiv) 条件つきキーワード付与が `granted_effects` → augmented effectsMap 経由で実際にバッジ／アタック処理に効くか**（`WXDi-CP02-057` か `WXDi-P11-071`。**正面のシグニのパワーを閾値の上下に跨がせ**、【アサシン】/【ランサー】が付く→付かないに変わるのを見る。旧＝正面が誰でも常時付いていた）。
  - [ ] **(cxiii) `WXK10-035` の効果耐性**＝`collectEffectImmuneSigni` の呼び出しは `BattleScreen.tsx:4256` の1箇所だけ。＜電機＞シグニに対し**レベル1のシグニの効果は通らず、レベル2の効果は登録者数50万人を達成して初めて止まる**こと（旧＝`sourceFilter` が無く相手シグニの効果を**全部**受けない過剰保護だった）。
  - [ ] **(cxv) 条件つき常在パワーの出入り**＝`PR-426-E3`（ライフ1枚以下**かつ**中央ゾーンで＋4000）／`WXDi-P07-060-E3`（覚醒で＋2000）。**条件を満たさない盤面で乗っていないこと**が本題（旧＝常時適用）。
  - [ ] **(cxvii) `WX20-Re18` の動的レベル**＝エナ10枚（Lv4）／15枚（Lv5）で場に出し、**レベル表示・アタック時の正面バニッシュ（Lv4以上）・対戦相手の効果を受けない（Lv5以上）**が実効レベルどおりに切り替わるか。⚠`BattleScreen` のレベル表示は `calcSigniLevels` を別途呼ぶので **engine の判定と一致するか**も併せて見る。
  - [ ] **(cxviii) `WXDi-P15-071` のベット分岐**＝**ベットあり／なしで撃ち分け**、ベット時は【Ｓランサー】（無条件）、非ベット時は正面パワー8000以下ゲート付き【ランサー】＝**排他**になること。


### 🅳 §6 の機構実装ぶん（続き409〜518・§6.4 O-13 から移設）

> **2026-08-17 続き539 で §6.4 O-13（8185文字の1セル）をここへ移した**。中身は verbatim で、
> **1ブロック＝1エントリ**に割り直しただけ（採番は `V-28` から＝`V-25`〜`V-27` は既存文中で予約済み）。
> どれも **engine/golden では固定済み・実機だけ未確認**＝「ヘッドレスでは検証できない層」。
> ⚠着手前に **📌「実機シナリオを書くときの必読」**（下）を読むこと。

- **V-28** エナ支払い元 funnel（14サイト＋14モーダル）ほか、続き409〜413 の A群実装（相手ルリグデッキ選択モーダル・新規 CHOOSE 等）。

- **V-29** **続き452＝相手応答モーダルの実表示**（PvP の相手側／CPU 自動応答）＝`WXEX2-84-E2` が最も踏みやすい。

- **V-30** **続き453＝ターン境界を跨いだ能力喪失**（次ターンでの発火抑止／2ターン後の復帰）。

- **V-31** **続き488〜490 の3経路**＝**追加のアタックフェイズ**（`WXK06-026`）／**エナ支払い封じ**（`SPK01-10`＝《色×0》は通る・エナ1以上は通らない**対**）／**`AttackHandDiscardCostModal`**（`SP38-003`＝手札が足りる/足りない**対**）。

- **V-32** **続き491＝フェイズ／ターンのスキップは全経路が未検証**＝(a) メインフェイズスキップ（`WXEX2-19`＝相手ターンで GROW→ATTACK_ARTS へ飛ぶか・`ON_MAIN_PHASE_START` が走らないか）(b) エナフェイズスキップ（`WX05-018`＝DRAW→GROW・`ON_GROW_PHASE_START` は走るか＝**負方向＋対照の対**）(c) ターンスキップ（`WD20-006`＝CPU ターン終了後にもう一度 CPU のターンが来るか）(d) 「このメインフェイズを終了する」の自動進行（`WXK06-078`）(e) `WX16-001-E3` のシグニアタックステップ飛ばし。

- **V-33** **続き492＝ルリグダメージ無効の4経路**＝(a)`WXK01-002-E2`（相手ターンを跨いで①ダメージが通らない②次のドローで**2枚**引く③自分のメインフェイズ開始でリミットが12から戻る）(b)`WXK10-019-E2`（張ったターンには効かず次の相手ターンに効く**負方向＋対照の対**）(c)`WXK03-001-E1`／`WXK11-012-E2`（ルリグ本体・キーの【常】／レベル境界の対）(d)「このターン」版でルリグアタックを**2回**受けて2回とも防ぐか。

- **V-34** **続き493＝移動不可の4経路**＝(a)`WXK10-083-E1`（張ったターンと次のターンはエナが落ちず、**その次のターンでは落ちる**＝負方向＋対照の対）(b)`WXK10-004-E1`（手札とエナの両方）(c)`WXEX2-06-E3`／`WXDi-P16-002-E1`（ダメージ無効と移動不可が**同時に**効くか）(d)`WXDi-P16-002-E1` の使用条件（【チーム】＜夢限少女＞3体＋全員レベル１以上）が満たせないとき使えないか。

- **V-35** **続き497＝遅延予約とキー払いの3経路**＝(a)`WXDi-P16-002-E1`（使った瞬間には引かず、**次の相手ターンが終わるとき**に1枚引き＋エナチャージ1＝負方向＋対照の対）(b)`WDK06-R09-E1`（相手のターン終了時に**相手のアタック済みシグニだけ**が候補に出る／キーを払えばバニッシュ・払わなければ何も起きない／**自分のシグニは一切減らない**）(c)キーが無い盤面で支払い枝が出ないこと。

- **V-36** **続き496＝「対戦相手が払う」側の3経路**＝(a)`WXDi-P05-023-E2`（相手に「《無》×3を支払う／支払わない」が出て、**払えば付与されない／払わなければアタック不可になる**＝負方向＋対照の対）(b)`WXDi-P07-007-E3`（**手札1枚捨て／《無》×1／支払わない**の3択が出るか）(c)`WXDi-P16-047-E1`（正面のシグニがエナ1以上なら**《無》×1 を前払いしてアタックできる**／エナ0ならアタックできない＝対照の対）。

- **V-37** **続き495＝「支払わないかぎり」の3経路**＝(a)`WX25-P2-038-E1`（付与されたシグニでアタック→**「支払う（コスト:《無》×4）／支払わない」**が出て、**払えば残る／払わなければバニッシュ**＝負方向＋対照の対）(b)**払うのは付与された側**（アタックした側のエナが減り、カードを使った側は減らない＝`WX24-P2-044` の是正確認）(c)エナ不足時に支払い枝が選べないこと。

- **V-38** **続き494＝アタック税（《無》×N）の4経路**＝(a)`WXDi-P03-036-E1`（相手アタックフェイズ開始時にルリグへ《無》×2 の税→**エナが足りるときは払ってアタックできる／足りないときはアタックできない**＝負方向＋対照の対）(b)`WX24-P1-041-E2`（「ルリグかシグニ」の選択モーダルに**ルリグが候補として出る**か）(c)`WX24-P4-001-E1`（アーツ1枚で**ルリグ税＋シグニ付与**の両方が乗るか＝入れ子 continuation 取りこぼし是正の実機確認）(d)ボタン表示（`アタック（《無》×N）`／`アタック不可（《無》×N）`）。

- **V-39** **続き494＝`OPP_LRIG_ATTACK_COST` の「払えないときタダで通っていた」是正**＝エナ0でルリグアタックできないことを対で見る。**ヘッドレスでは検証できない層**

- **V-40** **続き500＝O-34 実装の5経路**＝(a)`WX19-064-E1`③／`WX18-029-E1`（相手シグニを選ぶと**付随物と下カードだけ**が落ちて**シグニは場に残る**＝旧実装はシグニ本体を落としていた）(b)`WX20-077-E2`（サーチ後に「使う／トラッシュに置く」の二択が出て、**どちらでも手札に残らない**）(c)`WXDi-P12-055-E1`（相手側に**6択の宣言モーダル**が出る＝PvP の相手表示／CPU 自動応答。**外れたときだけ**対象がバニッシュ＝負方向＋対照の対）(d)`WX25-P3-050-E1`（【チーム】3体が揃わないと使えない／色ごとに回数が変わる／赤節は合計パワー12000以下でしか選べない）(e)`WXK07-034-E1`（①②を両方選ぶと②が Lv4 として2枚めくる＝①を選ばなければめくれない対照）。**ヘッドレスでは検証できない層**

- **V-41** **続き501＝O-32 実装の4経路**＝(a)`WXDi-CP01-024-E1`（トラッシュ選択が最大3回出て、**同じパワーの札だけ**が候補になり**相手シグニの正面**ゾーンに出る／出したシグニの【出】が発動しない）(b)`WX16-042-E1`（1回目のあと「繰り返す／繰り返さない」が出て、断れば手札は1枚しか減らない＝**負方向＋対照の対**／バニッシュ候補が**捨てたシグニと同レベルだけ**に絞られる）(c)`WXDi-P07-007-E3`（相手側に**3回とも**「手札1枚捨て／《無》×1／支払わない」が出る）(d)`WXDi-CP02-047-E1`（対象選択が3回出て毎回別のシグニを選べる）。**ヘッドレスでは検証できない層**

- **V-42** **続き502＝O-33 実装の4経路**＝(a)`WX25-CP1-050-E1`（次の相手ターンだけ**中央のシグニだけ**にアタックボタンの《無》×1 注記が出て、左右は無条件でアタックできる＝**負方向＋対照の対**）(b)`WX24-P1-038-E2`／`WXDi-P03-027-E2`（**自分の**シグニは止まらない＝旧 `owner:'any'` の是正確認）(c)`WXK10-011-E1`（3択が出て①エナ送り／②エナから場出し＋全体＋5000／③中央限定のアタック禁止。**選ばなかった選択肢の効果が走らない**）(d)`WD22-011-G-E1`／`WXK05-003-E1`／`WXK10-009-E1`／`WXK03-TK-01B-E1`／`WX13-003-E1`（同上＝選ばなかった選択肢の2文目が走らない）。**ヘッドレスでは検証できない層**

- **V-43** **続き503＝O-28 実装の4経路**＝(a)**Sランサー26効果**（バトルに勝つとライフを追加クラッシュし、**ライフが無ければ相手が敗北**する＝通常ランサーとの**対**で見る。旧実装は綴りズレで格下げ／不発だった）(b)`WX24-P1-064-E1`（手札2枚以下のときだけ【アサシン】が乗る＝**負方向＋対照の対**）(c)`WXK07-029-E1`（相手の効果でバニッシュ／手札戻しの**両方**が効かない）(d)`WXK08-049-E2`（対象の相手シグニだけパワー－が2倍になる）。**ヘッドレスでは検証できない層**

- **V-44** **続き504＝O-5 実装の4経路**＝(a)`WX16-Re18-E1`（ルリグデッキ選択モーダルが出て**2枚まで**選べ0枚も選べる／出したレゾナの【出】が発動しない／ターン終了時に**2枚とも**ルリグデッキへ戻る）(b)`WX13-007-E3`（「好きな枚数」＝空きゾーン数まで選べる）(c)`WX07-050-E1`（**レベル3以下の白**のレゾナだけが候補に出る＝**負方向＋対照の対**）(d)`WX19-028-E3`（＜空獣＞と＜地獣＞の**両方**が候補に出る）。**ヘッドレスでは検証できない層**

- **V-45** **続き505＝O-6/O-7 実装の4経路**＝(a)`WX25-P2-058`（アタック**解決後**にダイアログが出る／《アイヤイ★クイーン》が居ないと出ない＝**負方向＋対照の対**／エナの＜遊具＞レベル2以下だけが候補／出したシグニの【出】が発動しない）(b)`WX25-P2-090`（支払うと自分がエナへ行き、エナのレベル1＜遊具＞が**ダウン状態で**場に出る／断れば何も起きない）(c)`WX24-P4-052`（自分をバニッシュしても**アタックは通る**＝アタック宣言時に走っていた旧挙動との対）(d)`WX25-P3-038`（**能力を消した**相手シグニがバウンスではなく**トラッシュ**へ）。**ヘッドレスでは検証できない層**

- **V-46** **続き506＝O-8/O-9 実装の4経路**＝(a)**部分強制**の盤面（感染限定など）で**非強制シグニのアタックボタンが消え**、強制対象が殴った直後に復活する（**負方向＋対照の対**）(b)`WX12-010`（相手を並べ替えると**動かしたシグニだけ**がアップ候補に出て、0体も選べる）(c)`WXDi-P09-064`（相手側に**1枚/2枚/0枚の3択**が出て、1枚を選ぶと相手の手札が増減0になる）(d)`WXDi-P07-010`（**毎アタックフェイズ**に相手へ「《無》×2／手札2枚／支払わない」が出て、払うと表向きに戻る／同じ場所にシグニがいる間は出ない）。

- **V-47** **続き507＝O-10 実装の4経路**＝(a)`WX22-022`（**ダウン状態のシグニにアタックボタンが出る**／他のシグニがアタックしてパワーが20000になるまでは2回目が撃てない＝**負方向＋対照の対**／他の素のシグニはダウン中ボタンが出ない）(b)`WX25-P3-055`／`WX25-P2-TK04`（相手の効果で場を離れるはずが**場に残り**、`WX25-P2-TK04` だけダウンする／**同じターンの2回目は普通に場を離れる**＝負方向＋対照の対／`WX25-P3-055` の E1 パワー＋3000 と E3 の手札戻しは**巻き添えで消えない**）(c)`WXK01-002`（手札0枚でルリグアタックのダメージを1回だけ無効にし、**同じターンの2回目は通る**／手札があれば1回目から通る＝対照の対）(d)`WX25-P2-103`②（【チャーム】が付いた相手シグニにだけパワー－が**3倍**になり、付いていなければ何も起きない＝負方向＋対照の対）。

- **V-48** **続き508＝O-10/O-33 実装の4経路**＝(a)`WXDi-P16-062`（同じシグニゾーンに【ゲート】があるときだけ、**両プレイヤーの**アタックフェイズ開始時に相手へ「《無》×1を支払う／支払わない」が出て、払わなければ対象シグニが能力を失う／ゲートが無いゾーンに居るときは何も起きない＝**負方向＋対照の対**）(b)`WXDi-P00-026`（【出】でセンタールリグに付与→ルリグアタック後に**アップして2回目のアタックができる**／《ターン１回》なので3回目は無い）(c)**【コンバート《色》】**（`WXEX1-56` をエナに置いて**グロウコストの《緑》**を払える／アシストグロウ・アシスト【起】・【アクセ】発動でも同じく払える＝**渡し忘れ5サイトの実機確認**／宣言していない色では払えない対照）(d)`WDK09-001`（相手アタックフェイズ開始時に相手のデッキトップが公開され、**【ライフバースト】が無いときだけ**ゲートのあるゾーンのシグニがアタックできない／【ライフバースト】があれば普通にアタックできる＝**負方向＋対照の対**／**ゲートが増えない**こと／ゲート設置だけではアタックが止まらないこと）。

- **V-49** **続き509＝O-10 実装の4経路**＝(a)`WXK08-002`①（トラッシュの**赤の**シグニだけが候補に出て場に出る／**ターン終了時に手札へ戻る**／青のシグニは候補に出ない＝**負方向＋対照の対**）(b)`WXK08-002`③（**赤の**センタールリグなら能力を失い、以後アタックが【ガード】されるたびにアップする＝**ターン2回まで**／赤でなければ何も起きない＝負方向＋対照の対／**能力を失っても得た【自】は消えない**）(c)**基本レベル変更が本当に効くか**（①で出したシグニが「レベル１以下のシグニ」を対象にする効果に当たる／ターンが変わると元のレベルに戻る＝永続バグの是正確認）(d)**ルリグ能力喪失がターンを跨がない**（`WX20-003` 等で相手ルリグの能力を消し、**次のターンには戻っている**＝相手側だけ永続していた穴の是正確認）。

- **V-50** **続き510＝O-10 実装の3経路**＝(a)`WX24-P4-016`③（【起】を使ったターンは、ちより系シグニの「【ライフバースト】を持たない場合、**このアタックを無効にし**…」でも**アタックが通る**／使っていないターンは従来どおり無効になる＝**負方向＋対照の対**）(b)`WXK03-071`（**相手ターンに**アーツを使うと使用コストの《無》が2つ減り、**同じターンの2枚目は減らない**／自分のターンには減らない／左右のシグニゾーンでは減らない＝負方向3本）(c)ルリグのアタック無効化は(a)の免疫でも止まらない（限定の落とし忘れ確認）。

- **V-51** **続き511＝O-10 実装の3経路**＝(a)`WXDi-CP02-056`（相手の効果で＜ブルアカ＞のシグニが場を離れるとき**手札2枚が減ってシグニは場に残る**／手札が1枚以下なら普通に場を離れる＝**負方向＋対照の対**）(b)**同じターンの2回目は守れない**（1回で宣言元が能力を失う）／次のターンには戻る(c)`WX25-P2-059`／`WX26-CP1-047`（エナが《緑》《無》／《無》ぶん減る／足りなければ守れない／色やクラスが合わないシグニは守れない）。

- **V-52** **続き512＝O-10 実装の4経路**＝(a)`WXK07-001`（アーツ使用後、**自分のアタックフェイズ開始時に数字選択が出る**／宣言したレベルのシグニでは相手が【ガード】できない＝**負方向＋対照の対**）(b)同アタックフェイズ中、**相手が無色のカードでエナコストを払えない**（有色カードなら払える対照／無色カードがマルチエナ扱いでも払えないこと）(c)相手のセンタールリグがレベル4以上なら**アーツは1枚しか使えない**／レベル3以下なら制限されない＝負方向＋対照の対 (d)`WX13-007`（**相手は各ターン1枚しかアーツを使えない**＝これまで恒久 no-op だった `ARTS_LIMIT_1` の実挙動。ボタンが消えることと実行入口でも止まることの両方）。

- **V-53** **続き513＝O-18 実装の2経路**＝(a)無色のスペル封じ中に**無色スペルの「発動」ボタンが出ない**／有色スペルには出る＝**負方向＋対照の対**（従来は出て押しても無反応だった）(b)白以外のスペル封じ中に**白スペルだけ発動できる**（手札スペルとスペル/クラフトの両方で）。

- **V-54** **続き514＝O-10 実装の3経路**＝(a)`WX12-023` を場に出すと**相手のトラッシュ起動【起】ボタンが消える**／出していなければ出る＝**負方向＋対照の対** (b)相手のトラッシュを対象にする効果（回収・除外など）が**「対象がない」で終わる** (c)⚠**持ち主自身のトラッシュ回収も止まる**（原文が主語を問わないため。ここが実機で違和感の出やすい点なのでルール確認とセットで見る）。

- **V-55** **続き515＝O-10 実装の4経路**＝(a)`WXDi-P16-001A`（メインフェイズにピースとして使うと**そのままセンタールリグが《扉の俯瞰者　ウトゥルス》へグロウ**する／グロウコストもコイン枠も消費しない）(b)**そのターンに既にグロウしていると何も起きない**＝**負方向＋対照の対**(c)グロウ先の**【出】が発動する**（＝engine 直 push ではなく正規経路を通っている証拠）(d)使ったピースが**ルリグトラッシュに残っていない**。

- **V-56** **続き516＝O-10 実装の4経路**＝(a)`WX25-CP1-060`（相手が能力・効果で対象を選ぶと**そのシグニは対象から外れて何も起きない**／他の＜ブルアカ＞が居なければ普通に効果を受ける＝**負方向＋対照の対**）(b)**同じターンの2回目は外れない**／次のターンにはまた外れる(c)自分のターンには外れない（《相手ターン》の確認）(d)⚠**外れたあとも E1【常】と【絆常】E3 は生きている**（カード単位の能力喪失へ戻していないことの確認）。

- **V-57** **続き517＝O-10 の害除去の2経路**＝(a)`WXDi-P05-006`（**メイン／アタックフェイズで「使用」ボタンが出ない**＝従来は《青×0》で「1枚引き＋エナチャージ1」が撃ち放題だった）(b)チームが揃っていても出ないこと（カットイン窓が無いため＝窓を実装したら**ここが最初の確認点**）。

- **V-58** **続き518＝O-10 クローズ（応答窓）の6経路**＝(a)相手が【使用条件】【チーム】のピースを使うと**カットイン窓が出る**（自分のルリグデッキに `WXDi-P05-006` があり、きゅるきゅるーん☆が3体そろっているとき）(b)**チーム条件を持たないピースでは窓が出ない**＝**負方向＋対照の対**（＝従来どおり即時解決）(c)パスすると元のピースが**普通に解決する** (d)①を選ぶと元のピースが**解決せずゲームから除外**される(e)②を選ぶと1ドロー＋エナチャージ1のあと**元のピースも解決する** (f)CPU 戦で CPU が応答側のとき**自動パスして進む**（＝デッドロックしない。⚠**ここが最優先の確認点**）。**ヘッドレスでは検証できない層**

- **V-59** 🆕**続き540＝O-14 実装の3経路**＝(a)`WX15-003-E3`（【起】ベルセルク《コイン》×3 を撃つと、**次の相手ターンだけ**相手のアーツ／スペル／【起】のボタンが押せず、シグニは強制アタックになる／**撃ったターンには自分のアーツもスペルも普通に使える**＝**負方向＋対照の対**。⚠2スロット式なので「撃った直後」と「相手ターン開始後」の**両方**を見ないと1ターンずれを見逃す）(b)`WX25-P1-050-E1`（【出】だけで同じ封じが**次の相手ターンに**掛かる＝従来は自分のターンに効いて相手のターンには切れていた1ターンずれの是正確認）(c)`WXDi-P08-010-E3`（【起】《ゲーム１回》を撃っても**その場では1体もバニッシュされず**、次の相手ターンの終了時に**アタックしたシグニだけ**が飛ぶ／アタックしなかった相手シグニと自分のシグニは残る＝**旧実装は即時に両者の全シグニを消していた**ので、ここが一番差が大きい）。
- **V-60** 🆕**続き540＝O-15 実装の3経路**＝(a)`WXEX1-44-E2`（【出】で**手札**から《アクセアイコン》を持つシグニだけが候補に出て**2枚まで**選べる／アイコンを持たない手札は候補に出ない＝**負方向＋対照の対**。⚠従来は**場のアクセゾーン**を全部エナへ送る別機構で、手札は1枚も動かなかった）(b)**0枚も選べる**（「まで」＝`upToCount`）(c)⭐**回収枚数が置いた枚数に比例する**＝2枚置けばエナの＜調理＞シグニを2枚回収し、**0枚置けば1枚も回収しない**（旧実装は置いた枚数と無関係に必ず1枚回収する過剰）。

- **V-61** 🆕**続き541＝O-25(d) 引用付与のゲート条件（6効果）の4経路**＝(a)`WXDi-P12-078`／`WXDi-P13-079`（【出】でエナのディソナを捨てて付与→**正面のシグニがレベル1／レベル2以下のときだけ**バトルでバニッシュするとライフがクラッシュされ、**正面が高レベルなら【ランサー】が乗らない**＝**負方向＋対照の対**）(b)`WXDi-P13-069`（**正面が凍結かつパワー5000以下のときだけ**【アサシン】＝正面とバトルせず直接ダメージ／凍結を外すだけの対照で乗らない。⚠**パワーは実効値**なのでデバフで5000以下に落とした盤面でも乗ること）(c)`WX24-P1-042`（**自分の手札が2枚以下のときだけ**【ダブルクラッシュ】＝手札を1枚増やすだけの対照で乗らない。⚠手札枚数は毎フレーム評価される＝付与後に引くと消える）(d)`WXDi-P06-032`／`WXDi-P13-044`（**相手のターンだけ**【シャドウ】＝相手の効果で対象に取れない／**自分のターンには普通に対象に取れる**。⚠🔴**ここが最重要**＝条件つきにした瞬間に付与ストアへ移るので、走査軸が漏れていると「常時シャドウ」から「シャドウが一切効かない」へ裏返る）。
- **V-62** 🆕**続き541＝O-25(d) の序数条件・チャーム条件の3経路**＝(a)`WXK06-033`／`WXK06-035`（**そのターン4回目のアタックのときだけ**このシグニがアップする＝1〜3回目ではアップしない＝**負方向＋対照の対**。⚠旧実装は毎アタックでアップ＝実質もう1回アタックできたので**差が一番大きい**）(b)`WXK06-037`／`WXK06-038`／`WXK06-062`／`WXDi-P14-052`（**N度目のアタックのときだけ**引き／捨て／エナチャージ／手札戻しが走る。⚠序数は**ルリグアタックも含めたターン内通算**なので、シグニ3体＋ルリグで「四度目」が成立することも見る）(c)`WXK07-043`（**【チャーム】が付いているときだけ**バニッシュされなくなり、ターン終了時に追加で1枚引く／付いていなければどちらも起きない＝負方向＋対照の対。⚠旧実装は**無関係な【チャーム】キーワードが付くだけ**でバニッシュ耐性が無かった）／`WXK07-044`（チャームが付いていると**パワー12000以上**を、付いていなければ**パワー7000ちょうど**をバニッシュ＝「代わりに」の排他が効いていること）。

- **V-63** 🆕**続き542＝O-29「同じ選択肢を複数回選ぶ」の4経路**＝(a)`WX17-003`（ベットなしで撃つと**「2つまで」の回数UI**が出て、**同じ選択肢を2回**選べる／0個でも決定できる＝**旧実装は1つずつ2周を強制**していたので「まで」が効くこと自体が新しい）(b)**ベット宣言して撃つと上限が4つに増える**＝負方向＋対照の対（⚠`betChoose` は宣言時のみ）(c)③を選ぶと**レベルの異なる**＜怪異＞が2枚だけ候補になる（同レベル2枚は選べない＝`selectionConstraint`）(d)`WX22-016`（コインを3枚ベットして②を2回選ぶと**相手シグニが3体ぶんバニッシュされ＜遊具＞を3枚回収**する＝**旧実装は②が無言 no-op で1回ぶんしか動かなかった**ので差が一番大きい／①だけなら1回ぶん＝対照）。⚠**CPU が応答側になる盤面**（相手がこのアーツを撃つ）で**自動応答が回数を埋めてデッドロックしないこと**も見る。

- **V-64** 🆕**続き543＝O-37「引用能力の置換3形」の3経路**＝(a)`WX24-P3-005`（アーツを撃ってセンタールリグに付与 → **相手のシグニアタックで手札が1枚勝手にトラッシュへ行き、ライフが減らない**／ログ「ダメージ置換：代わりに手札1枚を捨てる（このルリグはこの能力を失う）」／**2回目のアタックでは普通にライフが減る**＝能力を失っている＝負方向の対。⚠**ルリグアタック側でも同じログが出ること**＝消費地点は2つあり片方だけ効くのが典型の壊れ方）／`WX24-P4-021`（**《緑》《無》を払う形は能力を失わない**＝払えるかぎり何度でも防ぐ／エナを切らすと普通にライフが減る）／`WX25-P1-014`（手札0・エナ1のとき**エナ側で払う**＝2つ目の支払い方が生きている）(b)`WX24-P3-009`（付与後にデッキを撃ち切ってリフレッシュ → **ライフが減らず**、代わりに付与が消える／2回目のリフレッシュではライフが減る。⚠**トラッシュがデッキとトラッシュに二重に居ないこと**＝続き543 で直した複製バグの観測点）(c)`WX24-P3-007`（付与後に**相手の効果で**自分のカードがトラッシュへ行くと【自】が発火し「手札に加える／エナゾーンへ／何もしない」の3択が出る＝「1枚**まで**」／**自分の効果でトラッシュに置いても発火しないこと**＝負方向の対）。⚠(a) は**「払うかどうか」を自動適用している近似**（§6.4 監視項目）なので、実機では**確認ダイアログが出ないこと自体が仕様**＝バグ報告しない。

- **V-65** 🆕**続き544＝O-38「相手シグニ【自】の支払えば通る回避」の3経路**＝(a)`SPDi43-01` の【起】《ゲーム１回》を撃った次の相手ターンに、**相手のシグニの【自】が発動するたびに相手側へ「支払う（コスト:《無》）／支払わない」の窓が出る**（⚠**窓が出ること自体が新しい**＝旧実装は丸ごと止めていて窓が一度も出なかった）(b)**支払えば本体が通り、エナが1枚減る**／**支払わなければ何も起きずエナも減らない**＝正負の対（⚠エナの実支払いは UI 側なので、engine テストでは踏めない層）(c)相手のエナが0枚のとき「支払う」が**選べない表示**になり、能力は何もしない。⚠**自分のシグニの【自】には窓が出ない**こと（原文は「対戦相手のシグニ」）と、**同族の `WXDi-P16-044`（無条件で発動しない）は従来どおり窓なしで止まる**ことも対照で見る。⚠**【出】能力にも窓が出る**のは既知の近似（§6.4 監視項目）＝バグ報告しない。
- **V-66** 🆕**続き546＝タスク12(cxxxiv)（旧形式 `signi_acce` の正規化）**＝**既存の赤シナリオ `v14MultiAcceLegacyStringOneLoads` が緑へ反転する**ことを確認する（`spec` は `'field.signi_acce': ['WD18-013#8202', null, null]`＝スロットが**素の string**）。見るのは3つ＝(a)盤面バッジが `ACE`（×13 ではない）(b)`WX20-028-E2`（3枚以上で発火）が**発火しない**(c)アタック後も **`hTrash` が1文字ずつに展開されていない**（旧挙動は `["W","D","1","8",…]`）。⚠**対照は同 spec の2枚版 `v14MultiAcceTwoDoesNotTrigger`**（配列形で同じく不発）＝正規化が「配列形の既存挙動」を変えていないこと。
- **V-67** 🆕**続き546＝タスク12(cxxxi)（ルリグの【起】《ダウン》）の3経路**＝(a)`WD08-001`（【起】《ダウン》：トラッシュからシグニ1枚を場に出す）を撃つと**効果が解決し、かつ `host.field.lrig_down` が true になる**（⚠**旧実装はここが false のまま**＝実質無コストだった。当時のシナリオはこれを「効果が走った証拠」に使っていたので永久 FAIL だった）(b)🔴**同じ【起】が2回撃てない**＝1回撃ったあと**ボタン自体が消える**（`usageLimit` を持たない効果なので、封じているのは「ダウン済み」ゲートだけ＝**ここが本命の観測点**）(c)ダウン後は**ルリグアタックもできない**（`lrig_down` が攻撃済みフラグと同一であることの確認）。⚠**アシストルリグには `down_self` の live 実例が0件**なので観測不要。
- **V-68** 🆕**続き546＝タスク12(cxxxii) の副産物（廃止フィールド名で注入していたシナリオの是正）**＝`v11CpuDeployPowerLimitWithControl` を**新しい `signi_deploy_bans` 形で**回し直し、(a)制限側で **CPU が P7000 を召喚せず P3000 だけを置く**(b)対照（ban なし）では**両方置ける**＝負方向＋対照の対、を再確認する。⚠**旧フィールド名のままだと「制限側」が対照と同じ盤面になり、緑でも赤でも意味がない**（続き546 実測）。
- **V-69** 🆕**続き546＝タスク12(cxx)（エナ差分 watcher の《ターン1回/2回》）の2経路**＝(a)`WXK04-028`（ON_ENERGY_CHARGE《ターン1回》）を場に置き、**同じターンにエナチャージを2回**行う → **1回目だけ発火し2回目は発火しない**（⚠**旧実装はチャージのたびに撃てた**）(b)`WXDi-P11-073`（《ターン2回》）は**2回目まで発火し3回目で止まる**＝境界の対照。⚠**ターンをまたぐと再び撃てる**ことも見る（`actions_done` のターン境界リセットに乗っていることの確認）。ON_POWER_THRESHOLD 側（`WX18-077`）も同型で1本あると望ましい。
- **V-71** 🆕**続き547＝「傀儡状態であなたの場に出す」8効果（`STEAL_OPP_TRASH_PUPPET` へ載せ替え）**＝`WXK09-034`（【出】・絞り込み無し）と `WXK10-091`（【起】・「＜美巧＞**ではない**レベル３以下」）の2枚で見る。(a)**相手のトラッシュ**にシグニを置いた状態で撃つと、**相手トラッシュのシグニ**が候補に出る（⚠**旧実装は自分のトラッシュから自分のシグニを蘇生していた**＝候補ゾーンごと別物だったので、**候補列そのものを見る**＝盤面結果だけでは区別できない）。(b)`WXK10-091` は**＜美巧＞のシグニとレベル４のシグニが候補に出ない**（負方向。⚠**旧実装は逆に「美巧しか選べない」反転**だったので、対照として**美巧を1枚・非美巧レベル2を1枚**置く）。(c)出したシグニが**バニッシュ等で場を離れると、自分ではなく持ち主（対戦相手）のトラッシュへ行く**（`sweepPuppets`）。(d)`WXEX2-23` の【起】エクシード１で出したシグニは**【出】能力が発動しない**（`suppressOnPlay`）。⚠**空きシグニゾーンが無いと「相手トラッシュにシグニなし」ではなく「空きシグニゾーンなし」でログが出る**＝盤面は3体埋めない。
- **V-70** 🆕**続き546＝タスク12(cxix)（ON_HAND_ADDED の owner 2軸）の3経路**＝`SPDi43-11` の【起】《ゲーム１回》バイブスMAX を撃ってセンタールリグに付与したあと、(a)**自分の効果でカードが手札に増えると、そのたびにルリグがアップする**（⚠**旧実装は `ON_PLAY` 扱いで一度も発火しなかった**＝丸ごと no-op）(b)**《ターン2回》で3回目は発火しない**(c)**相手の効果で自分の手札が増えたときは発火しない**（`byOwnEffect`）＝負方向の対。⚠**対照に `SPDi43-13`（エナ版）**を並べると「兄弟だけ動いていた」旧状態との差が見える。

### 📌 実機シナリオを書くときの必読（続き460〜469 で実証した罠）

1. 🔴**`spec.hostSet`／`guestSet` の両方に `'field.check': null` を必ず入れる**＝`injectScenario` の `CORE_FIELD_KEYS` に `check` が含まれ**リセットされない**。前シナリオのライフクラッシュ確認モーダルが全画面を覆い**クリックが1つも通らない**（3回踏んだ）。
2. 🔴**`getByRole('button', { name: <正規表現>, exact: true })` は `count()` が常に 0**（`exact` は文字列名にしか効かない）＝**モーダルもボタンも出ているのに30反復空振り**する。ラベル照合は `data-action-label` の前方一致か `H.clickBtn`/`clickTextOrBtn`/`clickTestId`。
3. 🔑**負方向テスト（「出ない」「起きない」）は必ず対照とセット**＝**単独では何も検証していなくても緑になる**。対照は**盤面を1文字も変えず原因だけを外す**（実例＝`damageSource` の1語／guest ルリグ1枚／相手資源の枚数）。
4. 🔑**「盤面だけを見る判定」も偽陽性**＝**機構を1度も通らなくても同じ盤面になる**ことがある（続き466 の実例＝対話が出なくても身代わり成立と同じ絵）。**機構が動いた証拠（問いログ・`asks` 件数など）を必須条件に入れる**。
5. 🔑**クリック前から成立している条件で判定しない**＝`pendingEffect==null && stackLen===0` は**効果の開始前と完了後の両方で true**。**効果が走り出したことを1度でも観測してから判定する**（さもないと単体で PASS・バッチで FAIL の位置依存 flakiness になる）。
6. 🔑**候補が複数ある選択で `pick-0` を盲目に押さない**。⚠🔴**ただし `pendingCandidates` の index を `pick-<idx>` にそのまま使うのも誤り**（続き469 で判明）＝**相手の場が対象のときモーダルは候補を reverse して描画する**（`EffectInteractionModal.tsx:189-192`＝`targetScope==='opp_field'` なら `[...candidates].reverse()`）。`data-testid` は**表示順の index**（`:282`）。⇒ **集合として assert してから `[data-testid^="pick-"][data-card-num="<カード番号>"]` で狙う**（`clickPendingInstance`）。⚠**`data-card-num` はカード番号でインスタンスIDではない**＝**同名カードが複数並ぶ盤面では一意にならない**ので、そのときは表示順を自分で反転して index を出す。⚠先例 `cheatingSameLevelDownFilter` が index で動いていたのは**有効候補が1件しかなかったから**。
7. 🔑**DOM の描画待ちを必ず入れる**（続き469 で2回踏んだ）＝`H.queryState()` は **Supabase を直接照会するので DOM より先に真になる**。`pendingCandidates` が立った瞬間に `pick-*` や `決定 (N/M)` を掴みにいくと**0件で即 null**。**待機予算は 3秒程度で全ヘルパに揃える**（`clickPendingInstance`／`clickExactVisibleText`）。⚠**500ms だと1回目 PASS・2回目 FAIL の位置依存フレークになる**。
8. ⚠**`a?.x === a?.y` は `a` が null のとき `undefined===undefined` で true**＝1周目に誤検出して即 FAIL する。
9. ⚠**`ATTACK_ARTS_OP` は非ターンプレイヤーが「アーツ終了」で進める**＝押さないと**CPU のターンが永久に終わらない**。
10. ⚠**切り分けの決め手は `scratchpad-verify/<id>-final.png`**＝ログだけ見ていると原因を engine 側に誤診する。
11. ⚠**Codex は実行できない**（サンドボックスのネットワーク遮断）＝**起案だけさせて実行・判定は検証側**が引き取る。指示書の冒頭でそれを明言すると時間を溶かさない（CODEX_GUIDE §8 続き460〜468）。
12. 🔴🆕**赤のまま在庫化した「engine バグ」は、罠が新しく見つかるたびに遡って洗い直す**（続き475 で実証）＝§3 (cxxv) は**在庫バグではなくシナリオ偽陽性**だった（罠6＝`pick-<idx>` の reverse は、その4シナリオを書いた**後**の回で判明した）。**在庫の症状記述を信じて engine を読み始める前に、まずシナリオを現在のヘルパで書き直して再実行する**ほうが安い（実測＝4本中3本が調査ゼロで緑へ反転）。
13. 🔑🆕**判定は「settled になった最初の1回」で確定させない**（続き475 で実証）＝盤面（`battle_states`）は先に真になるが**ログ行（`game_logs`）は数百ms遅れて届く**ので、`normalLog=false` の形で**単体PASS・バッチFAIL の位置依存フレーク**になる。⇒ **PASS しない間は数秒ぶん反復してから FAIL を確定する**（罠7 の「DOM 待ち」と同じ理由・別の観測面）。
14. ⚠🆕**「今は緑」のシナリオが、写り込んでいるバグを見ていないだけのことがある**（続き475 で実証）＝`leaveSubAllTargetsAskedPerVictim` は問いの回数だけを見ていて、**最終盤面に同一 instance の複製（§3 (cxxvi)）が写っているのに緑**だった。**final の盤面はダンプするだけでなく、不変条件（重複なし・枚数保存）を assert する。**
15. 🔴🆕**観測面を間違えると「engine バグそっくりの偽陰性」になる**（続き478 で実証・2件）＝(a)**`H.queryState().powerMods` は `temp_power_mods` しか写していない**（`verifyBattleDrive.mjs:16847`）。`duration:'UNTIL_OPP_TURN_END'` の POWER_MODIFY は **`power_mods_until_opp_turn` へ書かれる**（`effectExecutor.ts:1456`）ので **`powerMods` を見ると永久に false**＝「発火したのにバフが乗らない」絵になる（`v13TrashActCoinChain` が実際に踏んだ。⇒ 長期ストアを直接照会する `v13PowerModsUntilOpp` を使う）(b)**カードアクションのラベルに効果の限定は現れない**（`WXDi-P12-053` は `【起】トラッシュから出す（手札2枚を捨てる）`＝**ディソナ限定はラベルに出ない**）＝ラベル照合で絞ると永久不一致になり、**FAIL 文言が「対象【起】なし（actions=[…【起】…]）」という自己矛盾**になる。**限定の検査は DOM 属性（`data-selectable`）で行う。**
16. 🔑🆕**対照は「盤面」だけでなく「判定の待ち方」まで揃える**（続き478 で実証）＝§3 (cxxxiii) の誤診は、**本命シナリオが即 FAIL 型・対照だけがポーリング型**だったことで生まれた（本命は engine が正しくても必ず赤／対照は正しく緑）。**非対称な観測方式は「片方だけ壊れている」というもっともらしい結論を作る。**
17. 🔴🆕**Playwright の accessible name は空白を正規化する**（続き479 で実証）＝**カード名の全角スペース（U+3000）が ASCII スペースへ畳まれる**ため、原文どおり全角で書いた `getByRole('button', { name: /コードイート　マヨ【アクセ】/ })` は**永久に一致しない**。⚠**データ側と regex はコードポイントまで一致していた**のに `found=false` になる＝**静的照合では気付けない**。⇒ **`\s*` で吸収する**。既存の 📌2（`exact:true` は正規表現に効かない）と同族＝**「画面には出ているのに掴めない」**型。**切り分けの決め手は `scratchpad-verify/<id>-final.png`**（📌10 の実例がまた1つ）。
18. 🔴🆕**場のシグニをタップして開くのは `CardModal` ではなく `StackModal`**（ライズ用の複数枚ビュー・続き479 で実証）＝`card-detail-modal`（`BoardComponents.tsx:73`）は **CardModal 専用**なので、場のシグニでは**永久に不可視**になり `labels=[]` で落ちる。⚠**アクションボタン側（`card-action-{i}` / `data-action-label`）は両モーダル共通**（`:98` と `:210`）なので、**スコープにした親だけが取れない**という分かりにくい形で出る。⇒ StackModal 側に **`stack-detail-modal`** を追加済み（両方を許す locator を使う）。
19. 🔴🆕**Playwright の `click()` に timeout を渡さないと既定30秒待つ**（続き480 で実証）＝「DOM には在るが操作不能（他要素に覆われている）」ボタンを**毎ティック押しにいくドライバ**では **1ティック30秒 × ループ回数**で実質ハングする（**実測＝120ティックで57分停止**）。⇒ **`click({ timeout: 1200 })` を必須にする**。⚠**ハーネスの10分 kill はラッパーしか止めない＝タスク通知も来ない**ので、気付く手段は**`scratchpad-verify/<id>-*.png` の mtime が進んでいるか**と **`Get-CimInstance Win32_Process` でドライバの生存確認**。
20. 🔑🆕**実機ドライバの出力はパイプ（`| tail`）に通さず、必ずファイルへリダイレクトする**（続き480 で実証）＝パイプ越しだと**完走するまで1行も読めない**ため、上の 📌19 のハングを30分以上検知できなかった。ファイルなら `v15.phaseEnd[NN]` 等の**ティックログで進捗が即分かる**。
21. 🔑🆕**「決定 (N/M)」は完全一致リストに掛からない**（📌2 と同型・続き480）＝**前方一致で掴む**（共通ヘルパー `clickDecideNofM`）。さらに🔴**必要枚数が既に選択済みなら、候補クリックより先に決定を押すこと**＝**候補を押し直すと選択がトグルで外れ**、永久に決定へ到達しない。
22. 🔑🆕**spec の `deck: []` は効果解決中に「リフレッシュ（デッキ再構築）」を誘発する**（続き480 で実証）＝観測対象のカードが**トラッシュからデッキへ戻って盤面追跡が壊れる**。⚠**同じ盤面で手札・ライフ・埋め札を全部同名カードにするのも禁物**（📌6 の「同名カードが複数並ぶと `data-card-num` で一意にならない」の実例）＝**デッキに数枚積み、埋め札は別カードにする**。
23. 🔴🆕**レゾナの配置先は `SELECT_SIGNI_ZONE`＝`EffectInteractionModal.tsx:911` の「ゾーンN」ボタン**であって、**通常召喚の `summon-zone-{zi}`（`SigniSummonZoneModal`）ではない**（続き481 で実証）。取り違えると `zonePicked` が永久に立たず**配置そのものに到達しない**（実測＝574秒／606秒を溶かした）。⇒ **既存 `H.clickZone()`（`^ゾーンN` 走査）を使う**。**この修正だけで「配置未完了」→「ターン終了返却未完了」へ前進し、所要も 109秒→73秒になった。**
24. ⚠🆕**ラベルを読んだ時点では開いていたモーダルが、クリック時には閉じていることがある**（続き481 で実証）＝`did=なし` が延々続く形で出る。⇒ **掴めなければ開き直す自己回復**を入れる（実測＝`v18Wxk10049*` が **264秒 FAIL → 6秒 PASS** に反転）。

- **✅ 実機検証クローズ済み（2026-07-30〜2026-08-07・17ブロック）＝詳細は [PLAN_DETAIL.md](./PLAN_DETAIL.md)「2026-08-11 整理⑥」節へ退避**＝タスク16 残0クローズ3枚（`WXDi-P06-038`／`WX05-020`／`WXDi-P13-051`）／`WXDi-P11-063-E2`（aboveSelf）／タスク12 (lx)(lxi 第2波・第3波・第10波・第11波・本消化5件)(lxii)(lxiii)(lxiv)(lxv)(lxxiii)(lxxvi)／エクシード本体5件／§6.3 H・I′ の機構5件／ON_LRIG_GROW④／(xi) の skip 検証／(xxxvi) のグロウ支払いUI／lrigDown コストの限定（🏁完全クローズ）／コイン支払い累計。**この検証群で発見した実バグは Opusタスク12 (ci)(cii)(civ)(cv)(cvi)(cvii)(cviii) として登録済み・クローズ済み**。⚠**再検証したい場合はシナリオIDが退避先の原文に全部残っている**（`verifyBattleDrive.mjs`）。

- **クラフトトークンの実機配置**の残＝WX22-001-E3（§6.4）。⚠2026-08-05時点で再確認＝`GRANT_LEAVE_PLACE_PENDING`は`src/data/parsers/parseSentencePart1.ts:1946`でparserがSTUBを生成するのみで、`src/engine/effectExecutor.ts`・`execStubPart*.ts`のいずれにも実行側の実装が無いまま＝**引き続き機構待ち**（Sonnet側で実機検証できる状態ではない）。
- **driver 側**＝30件超の連続実行で出る低頻度フレーク（Sonnetタスク3。`oppDraw` 単独FAILは別要因で未解明）。⚠**今回のセッションでは着手せず**＝ユーザーからのフィードバックで「`verifyBattleDrive.mjs` を明示シナリオID無しのフルバッチで実行しない（フリーズ報告あり）」旨の制約があり、この項目の再現には30件超の連続実行が要るため対象外とした。着手する場合は個別セッションで慎重に（タイムアウト・スクショ省略設定込みで）扱うこと。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（flatten 系統としては VALUE=0・LOSS=0・同型★0。⚠parserWorklist 全体の held/LOSS は別勘定＝§4 恒久指標参照）。**残る作業は表現ではなく engine 配線の実機検証のみ**（上記）。診断＝`npx tsx scripts/archive/_flattenList.ts`（0枚を確認）。系統別の直し方は `BUGFIXES.md` の R5〜R58 エントリ。

### 7.2 対話UIの残実装
- ~~トラッシュ自己起動のエナ以外コストUI（手札捨て/コイン/エクシード等・14枚・上記6.4と同一対象）~~ **✅実装済（続き403・§6.4 参照）＝実機検証だけ残**
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
- **`npx tsx scripts/censusManualDrift.ts`（2026-08-08 続き382新設・§6.3 K）**＝**`manualEffects.ts` ↔ live JSON の乖離**を効果単位で分類する計器。**`build:effects` は live 側 `parseStatus:MANUAL` を不可侵にするので、`manualEffects.ts` を後から直しても live に永久に届かない**＝`_held_review` にも `_partial_fresh` にも出ない第3の死角を映す。明細 `docs/_manual_drift.txt`。**`--date`** で git 履歴から方向判定（`docs/_manual_drift_dates.txt`）、**`--card <ID>`** で1カードの原文つき完全 diff、**`--adopt <effectId,…>`** で**効果単位**に live へ同期（⚠timing が変わる採用は既定で中止＝`--allow-timing-change` で解除）。ゲートではない（exit 0）が、**対になるゲートが goldenTest の「§6.3 K トリップワイヤ」**＝新しい乖離が出たら即 FAIL。⚠**`--date` の判定は manual 定義の効果にしか使えない**（parser 由来は `PARSER_REVIEW` として別枠＝原文照合が要る）。
- **`npm run census:wiring`（`scripts/censusWiring.ts`・2026-08-07 続き376新設）**＝**被覆マトリクス**＝「TargetFilter の語彙は型にも engine にも実装済みなのに、parser の**一部のビルダーからだけ**合成されていない」配線漏れを (語彙キー × アクション入口) で機械検出する。**ゲートではない**（常に exit 0）＝「掘る場所を指す索引」。現状 **miss 203件**（走査 7721効果・STUB/MANUAL除外）。明細 `docs/_census_wiring.txt`。セルを取るときは `npx tsx scripts/censusWiring.ts --cell <キー>:<入口ラベル>` で効果IDと原文を全部出す。⚠**★印（同じ入口に配線済みの効果がある）が最優先**＝穴が明確。⚠`has=0` の語彙は自動で別枠に落ちる（＝配線漏れではなく**機構未実装**＝§6.3）。
- **`node scripts/archive/censusSample.mjs [seed] [n]`（2026-08-07 続き376新設）**＝census 高シグナル union（**注記を剥がすとちょうど 1162＝公称と一致**）からシード固定で無作為抽出し、原文＋live JSON を並べて出す**真バグ率の測定器**。続き376 の実測は `seed=20260807 n=20` で **14/20＝70%**（§5d-0 ②）。**バッチを何本か消化したら測り直す**＝残件見積もりの根拠になる唯一の計器。
- **`node scripts/heldReview.mjs`（続き23新設）**＝`build:effects` の「温存(要レビュー)」を diff署名（type増減）でグループ化し `docs/_held_review.txt`（原文＋leaf diff付き）に出力→spot-check後 `--adopt ID1,ID2,…` / `--adopt-sig "署名"` で fresh を一括採用。前提＝直前に `npm run build:effects`（fresh を `docs/_held_fresh.json` に保存）。**採用しないもの＝STUB退化・「代わりに」昇格・別STUB id 化**（理由は BUGFIXES 続き23）。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（**2026-08-07 続き370 実測＝held 259・LOSS 203・VALUE 54・ADD/OTHER 2**。旧 2026-07-19＝held 188・LOSS154/VALUE34。§4 恒久指標参照）。⚠**`heldReview.mjs` の held（242）とは母数が違う**＝こちらは1カード1バケツの分類つき worklist。回帰検出に使う。⚠HEAD比較＝auto-commit 環境では採用コミット後の値で判定する。
- **`npx tsx scripts/archive/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。
- **`docs/_partial_report.txt`（2026-07-07新設・`build:effects` が再生成）**＝parser 無言フォールバック刻印の計器＝「原文の条件/ステップを黙って落とす近似」の理由明細（初回142効果＝IS_MY_TURN化125/multi-dest分割11/リコレクト分割8）。この数字から**増えたら**parser に新たな無言近似が入った兆候（減らすのは §5c の条件語彙拡充）。刻印された fresh は parseStatus:PARTIAL＝heldReview で採用時にレビュアーに見える。

---
**関連**：`DESIGN.md`（設計方針）／`PLAN_DETAIL.md`（消化済み履歴）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
