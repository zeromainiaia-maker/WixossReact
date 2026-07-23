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
| ~~**1**~~ | ~~引用付与の内側 ability parse~~ | parser語彙＋engine機構 | M | **✅クローズ（続き224）**＝本丸 続き164・「アタックできない」家族 続き205・(d)`WX25-P3-085` 単文型 grant mis-parse は続き224（E1 は fresh 側で既に是正済＝再収穫のみ／同カード BURST の DOWN 対象 SIGNI→LRIG を parseSentencePart1 の DOWN 規則へ bare-LRIG 検出追加＝続き223 凍結の DOWN 版・11効果消化・census 1866→1865）。残の (b) 内側「代わりに」置換（WX25-P3-038）は§3タスク6と合流・(c) `GRANT_LRIG_ABILITY` ON_PLAY 誤デフォルトは続き218i（タスク5）で消化済。詳細 BUGFIXES 続き164・205・224 |
| ~~2~~ | ~~census「動的比較」の残~~ | parser語彙＋engine解決器 | — | **✅クローズ（続き237）**＝残 WXK08-005（キー）を消化。①先頭文脱落で E4（エクシード2ダウン凍結）が無条件発火していた過剰効果を `condition:LRIG_LEVEL_CMP_OPP{lt}`（既存＝新機構不要・getKeyPieceActions が evalUseCondition 済で engine 追加ゼロ）でゲート化。②E2 空 grant は機能近似のまま維持（詰めると二重発火＋granted 経路が condition 未評価）。副産物で getKeyPieceActions の timing↔phase 未照合（107+能力の広域緩さ）を Opusタスク12 (li) へ登録。詳細 BUGFIXES 続き237（他は続き203） |
| ~~3~~ | ~~DRAW 脱落の parseSingleSentence 直呼び経路~~ | parser修正 | S〜M | **✅tractable 分クローズ（続き238）**＝(1)`対象とし`挟みのエナ置き＋バニッシュ（WX05-024/WX13-034）(2)「対象とし、それを移動連用、B」の前半移動脱落（WXDi-P13-001 の bounce＝一般化ハンドラ）(3)WX20-071（3項＋「アクセされていた場合」を engine の離脱直前 leftStateFilter{hasAcce} へ寄せ＋collectLeaveFieldTriggers の self 経路に leftStateFilter/turnOwner ゲート新設で7効果の過剰発火も是正）(4)ドリームチーム系ピース WXDi-P08-003（REVEAL 早期 return が後続その後セグメント＋先頭色条件を捨てていたのを seed 方式で白/赤/黒3分岐復元）。census 1836→1831・golden 551・詳細 BUGFIXES 続き238。**残＝真の§6.3（単発機構待ち）**＝WXK07-042（この方法でトラッシュした数カウンタ）・WX20-049（did-pay ゲート下の自己トラッシュ＋SEARCH 逐次化）・WX26-CP1-066（per-count パワー＋二重入れ子）・対戦相手ドロー idiom/per-count ドロー＝いずれもタスク6/§6.3 長テールへ合流 |
| 4 | §5c 条件節の残 | parser語彙 | S | ~~「あり」複合条件 WXDi-P11-048~~ **✅続き227（Opus）で消化**＝E1「トラッシュに黒10枚以上あり相手エナ2枚以上ある場合」複合条件が丸ごと脱落し無条件で相手エナをトラッシュしていた過剰効果を `AND[TRASH_HAS_CARD, ENERGY_COUNT{opponent}]` 語彙1本で是正（WXDi-P05-056 と同型・engine/decompiler 既存対応・census 1845維持・golden 532維持。詳細 BUGFIXES 続き227）。残＝「代わりに」WX25-P2-068/070 は engine 置換機構＝タスク6級（S ではない・要再ラベル）・WX25-P3-116 はタスク6送り |
| 5 | 小口持ち越し（約10件・隙間埋めに最適） | 単点（parser/engine/decompiler混在） | S×件数 | ~~WXDi-P03-005（PAID_ADDITIONAL_COST の置換モード）~~ **✅続き218k（Opus）で消化**＝curated MANUAL が「自分のシグニをデッキに戻す」有害幻覚だったのを REVEAL_AND_PICK+エクシード置換（Pattern④ replace）へ是正。副産物で parser の REVEAL_AND_PICK pick文が `noGuard` filter を弾いていた過剰保守を解消（＋pickNoun 保持）＝P05-021 も AUTO 化可能に。golden 516→517。詳細 BUGFIXES 続き218k。**残＝置換系統40枚の一般化は §6.3級**（分離 pick 単独解決＋置換 else 機構）・WX26-CP1-100（SEND_TO_ENERGY のトラッシュ対象化）・~~GRANT_LRIG_ABILITY 系5枚の parser ON_PLAY 誤デフォルト~~ **✅続き218i（Opus）で消化**＝**実体は ON_PLAY 誤デフォルトではなく内側能力の `triggerScope` 脱落**（外側 ON_PLAY は【出】＝アシストルリグ登場時で妥当）。相手アタック検出 regex が「シグニ」単独しか見ず複合主語「シグニかルリグ」等を取りこぼし、scope 未設定＝engine 既定 `self` → `collectFieldTriggers` の付与AUTO収集（any_opp/any 必須）で弾かれ**完全な no-op（防御能力が丸ごと死亡）**だった。regex 拡張で3効果是正（`WXDi-D06-010`／`WX24-P2-046`／`WXDi-P09-036`）。**残＝`WX15-002-E2`（「対戦相手のセンタールリグ」単独）は engine に「相手ルリグのアタックで自分の付与能力を発火させる」経路が無く据置**（`ON_ATTACK_LRIG` は自分側の付与しか見ない＝拾うと相手シグニのアタックで誤発火する過剰効果を新設するため。→タスク12へ）。「かルリグ」半分の脱落は `markSilentFallback`＋PARTIAL 刻印で計器化。詳細 BUGFIXES 続き218i・~~原文無関係 `TRANSFER_TO_DECK` 混入~~ **✅続き218e（Opus）で消化**＝「（トラッシュから…対象とし、）それをデッキの一番上に置く」がトラッシュ回収→山札トップ（`TRASH_CARD`/top）ではなく場のシグニ移動へ幻覚化していた系統。part1 の緩い field-SIGNI 規則にトラッシュ回収 guard＋position:top、part2 のトラッシュ→トップ規則を「N枚まで」＋level/color/story フィルタへ拡張。8効果是正（census 1891→1888・詳細 BUGFIXES 続き218e）。**残**＝(1)条件/連文分割で「それ」の先行詞が失われた節（`WXDi-P05-009-E1` 等・field-SIGNI のまま＝先行詞解決が要る）(2)`WXEX1-65-E1` の front-of-self owner ニュアンス(3)`WXDi-P11-003`＝無関係な held 差分混在で採用見送り・SEQUENCE 下流「そうした場合」IS_MY_TURN 連鎖・PR-Di038 duration・WX25-P2-095・WXEX2-50-E3 step2 レベル制約・WX12-008 exceed-cost timing・WXK10-033-E1 据置確認・~~WXEX2-25-E3 の decompiler levelLtSelf~~ **✅続き189（Opus）で消化**＝GRANT_EFFECT 付与先が LRIG のとき inner の `levelLtSelf/levelGtSelf` を「このシグニより」→「このルリグより」に読み替え（engine は host 基準で解決済＝表示のみの是正・同型★0維持）。**⚠この表の他項目「代わりに」WX25-P2-068/070・動的比較3枚（タスク2）は実は engine 置換機構＝タスク6級でSではない（要再ラベル）**。**🆕続き203で追加**＝(a)`parseSentencePart1` の catch-all「デッキに戻す」（includes 判定）は依然広すぎ＝「〜デッキに戻す」文脈を SIGNI 移動へ丸める疑い（続き203はルリグデッキのみガード・全数再点検が要る）(b)WXK06-016「カードを１枚引き、このカードをルリグデッキに戻す」の then 分解（現 fresh は DRAW ごと UNKNOWN＝採用見送り中）(c)WX20-053「手札**か**デッキから…探して場に出す」の二重ソース SEARCH（現 bare ADD_TO_FIELD 退化のまま据置）。**🆕続き232（Opus）で消化**＝(1)「このシグニを場からトラッシュに置いてもよい」自己犠牲5枚（WX19-031/034・WXK10-032/033・WXEX2-31）が thisCardOnly も optional も欠き全シグニ強制トラッシュ＋「そうした場合」本体常時発火に退化していたのを parser 828 で thisCardOnly＋optional 付与（WXK10-033 は MANUAL 保護のため直パッチ）＋decompiler の optional 接尾辞欠落も是正（golden 535）(2)**WX26-CP1-100 は正常と確認**（choice② は既に ENERGY_CHARGE{TRASH_CARD} で engine 実装済）(3)**PR-Di038 duration も正常と確認**（UNTIL_OPP_TURN_END＝次の相手ターン終了時）。詳細 BUGFIXES 続き232。**残＝上記の (a)(b)(c)＋置換系統40枚一般化・WXEX1-65 正面owner＋レベル比較・WXDi-P05-009「それ」先行詞・WX20-053 二重ソース SEARCH・WXEX2-50 動的レベル制約＝いずれも単発機構待ち（§6.3送り）** |
| 6 | 「代わりに」残テールの機構系 | engine新機構（置換） | L | **🆕続き235b（Opus）で B1残の tractable 分4枚＋WX16-021 消化**＝(1)target-property 条件「それに【チャーム】が付いている場合、代わりに－M」を LAST_PROCESSED_MATCHES{hasCharm}＋targetsLastProcessed の加算モデルで表現（engine の LAST_PROCESSED_MATCHES を zone 状態フィルタ対応に拡張）＝WX25-P2-102/107/109（従来は owner:any 別対象への二重適用の過剰効果）(2)「場に傀儡状態のシグニがある場合」＝HAS_CARD_IN_FIELD{isPuppet}（engine既存）を STATE_CONDITION_CLAUSES へ追加＝WXK09-057-E2（E1 の「あなたか対戦相手のデッキ」CHOOSE は fresh 退化のため元 CHOOSE を MANUAL 復元）(3)WX16-021（驚天動地）の 0コスト無条件 LIFE_CRASH 幻覚（アタック幾何機構§6.3を有害過剰効果化）を STUB no-op へ無害化。golden+3・census 1838→1836。詳細 BUGFIXES 続き235b。**残＝すべて単発§6.3の長テール**：B1残5枚＝ターン中イベント counter（WXDi-P11-067 手札2枚捨て・WX14-070 効果アップ・WXK06-071 4枚デッキ移動＝各々専用 turn-counter）＋コスト参照（WDK17-014 傀儡トラッシュ・WX25-P2-101 レベル1捨て＝cost 内容照合機構）／D:置換ルール9（WX04-052 は CHARM_PROTECTION 実装済＝偽陽性等が混在・各々別バニッシュ置換機構）／C:コスト代替6／E:リコレクト2＋WX16-021 のアタック幾何。「過剰語彙を作らない」方針で単発機構は据置 |
| ~~7~~ | ~~§6.1 未実装action型の engine 実装~~ | engine実装 | — | **✅クローズ（続き202/204/204b）＝残型0**（PLAY_FREE_FROM_TRASH／PREVENT_DAMAGE／COST_SUBSTITUTE。詳細 PLAN_DETAIL §3／BUGFIXES 続き202・204） |
| 8 | §6.3 大型機構 | engine機構＋parser | L（項目ごと独立） | ゲーム除外・canCardGuard 統一・多段閾値 nested CONDITIONAL・スペル被破棄【自】収集パス・ON_LEAVE_FIELD 相手scope 3枚・出現条件レゾナ35・正面32の parser 未配線調査 |
| ~~9~~ | ~~§6.2 semantic audit 系統残の機構対応~~ | engine＋decompiler | M | **✅クローズ（続き239・Opus）**＝(a)SEQUENCE内 GRANT_PROTECTION `WX08-017`＝step2 count:1→'ALL'＋power30000＋UNTIL_END_OF_TURN（execGrantProtection の keyword_grants 一括付与＝既存経路）(b)LAYER付与 `WX15-031`＝内側【常】に `sourceCostMin:5`（新機構＝解決中アーツ/スペルの Cost 合計判定・collectGrantedFromLayer 経由で各＜怪異＞シグニへ付与）(c)広域24件の subjectFilter/新機構＝engine 中核（collectEffectImmuneSigni が `target:{count:'ALL'}` を honor せず効果元1体のみ保護する偽陰性）を subjectFilter 変換で解消＋engine に `isDrive` 状態フィルタ・`sourceCostMin`・subjectFilter.`excludeSelf`・ローカル matchesFilter への costMin/hasCrossIcon 追加。**9カード是正**（WX05-024-E2/WX09-016/WX09-CB02〔from を全効果耐性→BANISH の過剰保護解消〕/WX13-005A/WX18-034/WX19-048/WXEX1-37/WX08-017/WX15-031）。census 1831→1826・golden +1（552）。**残＝真の§6.3**＝WX11-027（ライフバースト源限定免疫）・WX17-001（自身以外の効果＝self-except）・WXEX2-36/WXK11-021（発生源が[ライズ/LB]を持たない限定）・WXK11-020（相手エナゾーンのカード免疫）・WX14-049/WXEX1-58（「そのレゾナ」トリガー元付与）・WXK10-080/WD18-008（対象付与で count:'ALL' 誤り）・WX12-Re09（共通色なし条件）・POWER_MODIFY 免疫5件（from:['POWER_MODIFY'] の別mis-parse＝「パワー増減しない」の別機構）＝§6.3 へ登録。詳細 BUGFIXES 続き239。系統①は✅続き106で完了 |
| ~~11~~ | ~~BEHAVIOR_AUDIT 高シグナル22 の最終仕分け~~ | 仕分け＋engine修正 | — | **✅クローズ（続き234）**＝続き133で22件全件精査（真no-opバグ0件）＋残件「WXK01-021-E1 の空付与」を続き234で engine コード確認＝**バグではない**（E2/E3/E4 がキー top-level 効果として正しく機能・空 GRANT_LRIG_ABILITY は無害 no-op・約37枚のキー系統的ノイズ）。副産物でアーツ一時付与の内側【自】parse 失敗3枚を発見しタスク12 (l) へ登録。詳細 BUGFIXES 続き234。監査ツールの SPELL_CUTIN/トリガー文脈盲点は §6.4 追記候補（別件） |
| 12 | **Sonnet が積んだ engine/parser バグの修正（常設受け口）** | 可変 | 可変 | **下の在庫リスト参照** |
| 13 | §5b 混線テール（実測823カード・16テーマ分類済み） | JSON再parse（1カードずつ） | L（低優先） | effect 構造そのものが原文とズレたカードの再parse。逓減テール＝他が尽きたら |
| 14 | リファクタ Stage2（useState 11本）→Stage3 純粋バトルコントローラ | BattleScreen構造 | L | **✅Stage2完了＋Stage3骨組み着地（続き244・Opus）**＝(a)**Stage2完了**＝BattleScreen 本体の残 useState 11本のうち `bs`（中核ゲーム状態＝Stage3対象）以外の10本を3ドメインフックへ集約（`useBattleSession`＝loading/自CPUデッキ/CPU戦フラグ・`useBattleLog`＝logExpanded/battleLogs/logScrollRef・`useSetupFlow`＝マリガン/アシスト配置/召喚ゾーン/closeZoneSignal）。本体の直接 useState は `bs` のみに。(b)**Stage3設計＋骨組み**＝永続化チョークポイント `useBattlePersist(roomId)`（`persist.ts`＝battle_states I/O を1点集約）＋純粋 reducer `reduceBattle(bs, action): Partial<BattleStateRow>`（`battleController.ts`＝代表3 action で seam 実証・網羅 never guard）を新設。代表3箇所（setup_phase 遷移・CPU終了ACK・CPUじゃんけん）を `persist.commit(reduceBattle(bs,action))` へ実配線。golden 562→565（Stage3 reduceBattle 3件）・全ゲート緑・warning 純増0。設計/移行レシピ `docs/BATTLE_CONTROLLER.md`。(c)**続き245（Opus）で永続化移行完了＋reducer純粋化一部**＝battle_states の**全行 I/O 120箇所を `persist` へ機械移行**（単一行update 58＋複数行update 53＋delete 4＋select\* 2＋代表3。生 supabase 残は特定カラム select 4箇所のみ＝意図的 raw）。厳格型が潜在的緩さ2件を検出・是正（じゃんけん update の setup_phase widening）。reducer に `SET_TURN_PHASE` 追加し turn_phase 遷移7箇所を純粋化。**続き246（Opus）で `WRITE_STATE` action 追加＝プレイヤー状態書き込みを集約**（payload＝myKey/myState＋任意 opp/effectStack/clearPending。単一キー15＋複合キー15＝30箇所移行）。reduceBattle は5 action・40/114 commit 経由に。**続き247（Opus）で `SET_STACK`（settle イディオム集約・5箇所）・`END_GAME`（決着・3箇所）追加＋条件付き opp/明示2キー9箇所を WRITE_STATE へ・ACK_END 手動側1箇所。reduceBattle は7 action・58/114 commit 経由**。golden 566→573・全ゲート緑・warning 純増0。**残＝reducer純粋化の本体（56 commit）**＝命令的 `const update:Record<string,unknown>` インクリメンタル構築（`'X' in update`・差し替え・約22ハンドラ）／pending_spell・pending_effect オブジェクト／spread。⚠ハンドラ側 payload 構築は golden 非カバーのため機械一括変換はサイレント挙動変化を検出できず、1件ずつ手動レビューか先にハンドラ挙動テスト整備が要る（レシピは BATTLE_CONTROLLER.md §4） |
| 15 | （大型・任意）§8 CPU AI のメインフェイズ拡張 | 新規設計 | L（特大） | ⏳DESIGN §4「CPU は対人戦と同じ処理」の統一が先 |
| ~~17~~ | ~~timing 判定が本文後半/引用内のトリガー語を先に拾う~~ | parser | — | **✅続き136で修正＝判定を効果ブロック先頭のトリガー句（trigText）に限定・23効果是正**（詳細 BUGFIXES 続き136） |
| 16 | timing 語彙センサス（`npm run census:timing`）の消化 | parser語彙 | S（ロングテール） | [A]完全wired／[B]軽量engine拡張／[C]新規機構 の3階層を続き75-76・172・175-180・207-208・213・235・**236** で系統消化済み（経緯の全文は PLAN_DETAIL §3・BUGFIXES 各続き。振り分け台帳 `docs/_timing_census_triage.txt`）。**残40効果/37クラスタ**（続き236＝Sonnet が[B]「正面以外の」1件消化＝WX17-032・triage記載の想定より実際は新規 `targetsBattleAttacker` engine 配線が要る[B]〜[C]境界級だった＝triage の[B]判定は「軽量」の保証ではなく要individual確認の再確認）。残る [A] はほぼ枯渇。「シグニの下からトラッシュ」3・「アタックを効果によって無効にしたとき」2・以降ロングテール（大半 [C]§6.3 機構待ち＋[B] 軽量拡張） |

**Opusタスク12＝未消化の在庫**（Sonnet が観測して積んだ engine/parser バグ。詳細本文と完了行の原文は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §3〔2026-07-19退避節含む〕）：

| ID | 内容 |
|---|---|
| ~~(i)~~ | ~~SP27-002-E3 引用付与の内側条件の無言消費~~ **✅続き193＝二段「かぎり」を AND 平坦化して構造化・旧STUB三重バグ削除**（詳細 BUGFIXES 続き193） |
| ~~(ii)~~ | ~~WXDi-P10-035 の owner エンコード精査~~ **✅続き194＝owner にバグ無しと確定・curated 退化版を fresh へ差し替え**（詳細 BUGFIXES 続き194） |
| ~~(iii)~~ | ~~WXK09-050 GRANT_CHOSEN_ABILITY の held 残存~~ **✅続き195＝parser 主経路から固有ハンドラへ委譲し held ドリフト解消**（詳細 BUGFIXES 続き195） |
| ~~(iv)~~ | ~~applyDirectAction の手札カウンタ3種未更新~~ **✅続き135で修正（手札保護も移植）** |
| ~~(v)~~ | ~~applyDirectAction default 節の暴走再実行~~ **✅続き181＝真の再入は STORY_CHANGE のみ・case 新設で解消、他は benign と機械確認**（詳細 BUGFIXES 続き181） |
| ~~(vi)~~ | ~~POWER_MODIFY_PER_DECK_COUNT が CONTINUOUS 未実装~~ **✅続き135で実装** |
| ~~(vi-4)~~／~~(vi-5)~~ | ~~6コレクタの LRIG ゾーン走査漏れ・usageLimit 書き戻し~~ **✅続き181／続き135で消化＝派生の ON_BANISH any_ally 脱落16効果も根治**（詳細 BUGFIXES 続き181・135） |
| ~~(vii)~~ | ~~「アップ状態のこのシグニをダウンしてもよい」系の対象/自己混同7件~~ **✅完了（続き163/164で6枚・続き220で残1枚 WX25-P2-112）**＝WX25-P2-112 は続き220で消化＝`execDown(LRIG)` がダウンしたルリグを `lastProcessedCards` に記録＋`colorMatchesLastProcessed` 動的フィルタ新設（owner非依存・参照不能で空ヒット＝did-it ゲート）で「共通する色を持つ相手エナをトラッシュ」を実装。DOWN は SIGNI→LRIG 是正＋optional 二択。golden 520・census 1868。詳細 BUGFIXES 続き220 |
| ~~(viii)~~ | ~~checkAllEffects 精査の複合バグ~~ **✅完全クローズ**＝WX25-CP1-062／WX17-028／WX16-070／WX16-038／WDK16-13・WXK08-033／WX26-CP1-048 は続き137〜197で消化。**残の WXDi-P10-034（次メインフェイズ遅延+分岐）は続き221で実装完了**＝(a)裏向き配置＝新ゾーン `facedown_signi`（inert・表向き前はパワー/能力/アタック無し）(b)ターン跨ぎ遅延＝`pending_facedown_flip`（ターン境界クリア対象外の永続フィールド。delayed_triggers は THIS_TURN 限定で相手ターンを跨げないため専用化）＋collectTurnTriggers の ON_MAIN_PHASE_START に RESOLVE_FACEDOWN_FLIP 注入 (c)表向き選択分岐＝CHOOSE で「表向き（場に居るかぎり+5000＝`field_power_mods`）／手札」。裏向き→表向きは開花と同じく「場に出た」扱いにせず ON_PLAY を除外（`detectFacedownFlipped`）。golden 5件追加・全ゲート緑・census 1868→1867（詳細 BUGFIXES 続き221） |
| ~~(x)~~ | ~~collectFieldTriggers の usageLimit 欠落（《ターン1回》過剰発火32枚）~~ **✅続き135＝5コレクタ統一＋書き戻し12箇所・実機PASS** |
| ~~(xi)~~ | ~~CONDITIONAL{条件, then:STUB OPTIONAL_COST}包み46効果のコスト踏み倒し＋ゲート無視~~ **✅続き206で engine 解消**。**要実機検証＝skip 選択時に本体が発動しないこと**（→§7） |
| ~~(xii)~~ | ~~WXEX1-19-E2 自己再帰STUBの無限ループ~~ **✅続き202＝一括受け取り型へ変更で根治・smoke SKIP 1→0**（詳細 BUGFIXES 続き202） |
| ~~(xiii)~~ | ~~WX24-P2-018-E1 の timing 誤登録~~ **✅続き136で ON_ATTACK_PHASE_START へ是正。残る付与先バグはタスク1** |
| ~~(xix)~~ | ~~WX04-005-E3 場出し数制限が未実装~~ **✅続き137＝誤診断・`fieldLimit.ts` に実装済みと確認＋golden 3件**（詳細 BUGFIXES 続き137） |
| ~~(xx)~~ | ~~ON_TARGETED の forced 単一対象 follow-up 未発火~~ **✅続き137＝autoTargetedCards surface で修正・実機PASS** |
| ~~🆕~~ | ~~choice.condition と CONDITIONAL ラップの表現不整合~~ **✅続き156＝liftChoiceOptionCondition 新設・20枚採用** |
| 🆕(xxii) | **後置条件節の IS_MY_TURN 誤変換（当初127件）＝続き143〜212 の12バッチ＋続き241 で系統消化**（LAST_PROCESSED 系条件の一般化・`STATE_CONDITION_CLAUSES` 拡充・negate／distinct／ALL_MATCH 等）。**🆕続き241（Opus）＝ラップされた recorder の検出漏れを消化**＝recorder（lastProcessedCards を残す TRASH/BANISH/TRANSFER_TO_DECK/ENERGY_CHARGE）が先頭ガード CONDITIONAL や連文 SEQUENCE に包まれると parser の `prevRecords` 検出が外れ後置条件が IS_MY_TURN 化していた系統を `unwrapWrappedRecorder`（CONDITIONAL.then／SEQUENCE 末尾を貫通）で解消。engine 追加ゼロ（execConditional がガード真で lastProcessedCards を残し偽なら空＝過剰実行しない）。3枚採用（WX09-Re19＝LRIG_COLOR ガード欠落＋回収1→5枚の退化是正／WXDi-CP01-045＝THIS_CARD_IS_UP＋TRASHED_STORY_COUNT_GTE／WXDi-P16-087＝LEVEL_SUM lte3）。partial 50→44・golden 554→556・census 1826→1825。詳細 BUGFIXES 続き241。**残＝真の§6.3級 約41件**＝ラップ以外の IS_MY_TURN 化はいずれも**前段が STUB（非記録アクション＝REVEAL_AND_PICK/OPTIONAL_TRASH_ENERGY_CLASS/DECK_REVEAL_UNTIL/LRIG_UNDER_CARD_OP/BEAT_ZONE_OP 等）**か**新規状態追跡機構（ビート数/リミット/ターン累計エナ/did-search/アタック幾何/追加コスト・色支払いの実選択）**が要る。execBounce(ALL)・hand-REVEAL も lastProcessedCards 未記録＝記録化 engine 改修が前提。各々独立した単発機構待ちで、parser が条件を吐いても engine が解決できず branch が死ぬ過小実行を避けて据置。明細 `docs/_partial_report.txt`（IS_MY_TURN化41件）・分類 `docs/_partial_triage.txt` |
| ~~🆕(xxiii)~~ | ~~リコレクト分割8件の内容欠落~~ **✅続き173/174で8枚全件消化**（詳細 BUGFIXES 続き173/174）。派生＝WX24-P4-016 の MB 表向きトリガー収集機構は §6.3 送り（未登録） |
| ~~🆕(xxiv)~~ | ~~トリガー発生源フィルタ脱落8件~~ **✅続き162/163/206で全消化**（`discardCostSourceStory`／`powerDecreaseSourceStory`／`last_effect_mill_source`。詳細 BUGFIXES 各続き） |
| ~~(xxv)~~ | ~~driver バッチの累積疲労 flakiness~~ **✅続き140＝DB側累積が真因・injectScenario で既定値張り直し**（詳細 BUGFIXES 続き140） |
| ~~(xxvi)~~ | ~~フルバッチ中の Playwright ブラウザクラッシュ~~ **✅続き142＝RECYCLE_EVERY 予防リサイクル＋クラッシュ時再確立で耐障害化**（詳細 BUGFIXES 続き142） |
| ~~(xxi)~~ | ~~collectOppDrawTriggers が発生源を区別せず PR-423 誤発火~~ **✅続き162＝`drawByDrawerOwnEffect` 新設で修正・E2E 反転は続き170で確認済み**（詳細 BUGFIXES 続き162） |
| ~~🆕(xxx)~~ | ~~WXEX2-76-E1 ON_PLAY の scope/対象幻覚~~ **✅続き188＝同型3枚を根治**（詳細 BUGFIXES 続き188） |
| ~~🆕(xxxi)~~ | ~~レベル比例ドロー/エナチャージの潰れ~~ **✅続き184/187/190＝`DRAW_PER_LRIG_LEVEL`／`ENERGY_CHARGE_PER_LRIG_LEVEL`／`DRAW{perLastProcessedLevel}` 新設でクローズ**（詳細 BUGFIXES 各続き） |
| 🆕(xxxix) | **逆翻訳全文照合で検出した「条件以外の原文不一致」計24効果（続き210/211/212・Codex。各件の不一致内容は BUGFIXES 続き210-212 に明記）**。**続き213（Opus）で全23件を実測＝同型クラスタが無く Codex バッチ化しない判断**（唯一まとまる「このアタックを無効にし」系3枚は攻撃無効化 action 型が engine に無い §6.3級）。**✅続き219（Opus）で先頭条件脱落の過剰効果5枚を消化**＝(1)トリガー句 strip に「各ターン終了時、」を追加（WXK04-027-E2 のエナ2色ゲート復活）(2)相対手札比較 `HAND_DIFF{lt/gt,0}` を `Condition` 型・`execUtils.evalCondition`・parser・decompiler へ配線（WX20-005／WX24-P1-045／WX24-P2-022／WXK10-045 の無条件ドロー/バニッシュ/ハンデスをゲート）。census 1880→1878・golden 517維持。詳細 BUGFIXES 続き219。**✅続き219b（Opus）で CHOOSE 前状態条件の汎用持ち上げを追加＝10枚消化**（「場に《X》/＜C＞/レゾナ がある場合、以下の…から選ぶ」の CHOOSE 無条件発火をゲート化。`matchLeadingStateCondition`＋CHOOSE ヘッダ直後限定。census 1878→1874・golden 518）。詳細 BUGFIXES 続き219b。**残＝「このアタックを無効にし」系3枚（§6.3）＋WXK10-045「差以下のレベル」動的フィルタ＋WXK09-003 赤分岐（ライフクロス→エナ＝新ゾーン遷移§6.3）＋WXDi-P06-039 の対象照応＋WX25-P2-085/SPDi43-30 の選択肢ドリフト＋Magic Box 3件（§6.3級）**。**✅続き242（Opus）で tractable 分2枚を消化**＝(1)WXK10-045「差以下のレベル」動的フィルタを `levelLteHandDiff` 新設で実装（`levelLteFieldVirusCount` と同型の単発動的レベルフィルタ・4層配線＝型/engine `resolveDynamicFilter`/parser `parseHandDiffLevelFilter`/decompiler。HAND_DIFF ゲート通過後の無制限バニッシュを是正）(2)SPDi43-30 の先頭カード名条件「《アンストッパブル Dr.タマゴ》がいる場合」欠落を MANUAL 直付与（219b の持ち上げが MANUAL に効かず据置だった分・選択肢内ドリフトは続き225 で是正済と確認）。**WX25-P2-085 は既に解決済み**（condition＋optional 揃い・続き225 着地）。golden 556→557・census 1825維持。詳細 BUGFIXES 続き242。**残＝真の§6.3級のみ**＝「このアタックを無効にし」系3枚（攻撃無効化 action 型が engine に無い）／WXK09-003 赤分岐（ライフクロス→エナ新ゾーン遷移）／WXDi-P06-039「このシグニの下にあった」照応（leave 時の under-card 追跡機構）／Magic Box 3件 |
| ~~🆕(xxxii)~~ | ~~ON_TRASH／ON_BLOOD_CRYSTAL_ARMOR の any_ally scope 脱落~~ **✅続き182/191で消化**（詳細 BUGFIXES 続き182・191）。残2枚＝WXK07-074（チャーム付帯）・WXK11-018（watcher 相対レベル）＝§6.3級で据置 |
| ~~🆕(xxxiii)~~ | ~~any_opp watcher の usageLimit 未評価~~ **✅続き183＝`limitOkWatcher` 追加＋リムーブ経路の両 state 永続化**（詳細 BUGFIXES 続き183） |
| ~~🆕(xxxiv)~~ | ~~`fromFieldByCostOrEffect` の parser 未 emit~~ **✅続き183＝15枚全件消化**（詳細 BUGFIXES 続き183） |
| ~~🆕(xxxv)~~ | ~~ON_TRASH「〜によって」限定の近傍表記が未ゲート~~ **✅続き186で (a)(b)(d) 消化**（詳細 BUGFIXES 続き186）。**(c) 3枚（WX18-062/WX22-027/WXK03-033）＝「シグニの下から」トラッシュの collector が engine に無く §6.3 送り** |
| ~~🆕(未確認)~~ | ~~collectLrigGrowTriggers の usageLimit 書き戻し疑義~~ **✅続き206＝全15コレクタの全数監査で新規の穴なしを確認**（監査スクリプト `scripts/archive/auditUsageLimitWriteback.mjs`・再実行可） |
| ~~🆕(xxvii)~~ | ~~semantic audit 第2弾（seed202607）の実害37枚~~ **✅続き165〜169・207 の Cluster 別消化でクローズ**（F フィルタ50枚／A 条件節／C owner／D timing／`ON_HAND_ADDED` 新設ほか。経緯の全文は PLAN_DETAIL §3・BUGFIXES 各続き。トリアージ `docs/_semantic_audit_scaleup2_triage.txt`） |
| 🆕(xxix) | **semantic audit stub群 round3（2,101枚・findings 2,799件・続き146）**＝①duration系統 **✅続き148で34効果是正**・②選択肢欠落 **✅続き149で84効果是正**・**③「そうした場合」IS_MY_TURN の did-it ゲート欠落 ✅続き218h＝engine で系統解消（155効果152カード）**（詳細 BUGFIXES 各続き）。③は当初「盲点2件」として登録されていたが実測すると**単カードではなく engine の構造欠落**で、`BANISH`/`BOUNCE`/`DOWN`(相手)/`FREEZE`/`TRANSFER_TO_DECK`/`TRANSFER_TO_HAND`/`SEND_TO_ENERGY`/`LIFE_CRASH` の全型が空振り時も発火していた（`TRASH`/`DOWN`(自分)のみ既存ゲート有り）。**残**＝~~(a)`WX06-014-E2` は JSON が原文と別物~~ **✅続き222（Opus）で消化**＝step1 を「自分トラッシュから《古代兵器》5枚をデッキ下」（TRANSFER_TO_DECK・TRASH_CARD/story:古代兵器/count5/bottom）へ是正し MANUAL 化。既存の did-it ゲートで「そうした場合」を表現（古代兵器不足なら banish 不発）。exceed コストは既存・「それ」は相手シグニ1体で盤面不変ゆえ末尾再選択が照応と同値＝専用機構不要と判明。census 1867→1866・golden 526。詳細 BUGFIXES 続き222。**✅(b) 222クラスタ・トリアージ済み（続き223）**＝§5 の未検証7クラスタを直接JSON照合。**機構不要の当たり＝「対戦相手のルリグ1体…凍結」の種別取り違え18効果を parser 一般化で消化**（FREEZE 対象 SIGNI→LRIG・engine は LRIG凍結対応済み・golden 527）。~~(b1)照応先ロスト系統~~ **✅続き226（Opus）で消化**＝「対戦相手のシグニ1体」power-down owner（22件）＋「あなたのトラッシュから」hand-add zone（13件）＝`owner:self`+`targetsTriggerSource`/`source:DECK_CARD` に化ける同一 parser 系統を後処理2本で復元（`applyLeadingOpponentDesignation` の照応検出拡張＋`applyLeadingTrashHandAnaphora` 新設）。ライブ84枚＋MANUAL1枚を一括是正（systematic に35枚サンプルを超えて捕捉）。TARGET_OPP guard は逆に旧補正を剥がす退化と判明し撤去（fixOwner 冪等）。census 1846→1845・golden 532。詳細 BUGFIXES 続き226。**✅(b2-i)「そのシグニの【出】能力」クラスタ＝続き243（Opus）で忠実表現化**＝これは**挙動上の偽陽性**と確定（`BLOCK_ACTION{ON_PLAY_ABILITY}` は engine 未参照の死アクション＋ADD_TO_FIELD 経路は自身【出】を発火させないため抑制は既定で満たされる）。死アクションを配置アンカーへ畳む `suppressOnPlay` フラグへ変換（type/parser `foldSuppressOnPlay` 単一チョークポイント/engine 前方安全/decompiler の4層＝76効果を折込・22効果はアンカー無しで据置）。census 1825維持・golden 557→562。詳細 BUGFIXES 続き243。残＝(b2)真の§6.3級＝ルリグかシグニ union（NEGATE_ATTACK 対象種別）・**別系統 MISSING**（ADD_TO_FIELD 自身【出】が本来誘発すべきが未発火）・BET・unless。詳細と表 `docs/_semantic_audit_stub_round3_triage.txt` §6・BUGFIXES 続き223/226/243 |
| ~~🆕(xxxvii)~~ | ~~アタック不可付与の据置4効果~~ **✅続き205で4件とも個別に原文照合し全採用（すべて fresh が正）** |
| ~~🆕(xxxviii)~~ | ~~付与対象に閾値フィルタが乗らない過剰効果~~ **✅続き205＝対象節スコープで抽出＋兄弟規則（付与系4規則）へ横展開・色フィルタも追加** |
| ~~🆕(xxxvi)~~ | ~~エナ代替トラッシュ情報がグロウ経路に未接続~~ **✅続き206＝人間のグロウ経路5箇所へ配線（CPU 可否は据置）**。**要実機検証＝グロウ支払いUIでの実選択**（→§7） |
| ~~🆕(xxviii)~~ | ~~「それをエナゾーンに置く」が TRASH 等へ潰れる系統~~ **✅続き147＝7効果を SEND_TO_ENERGY へ是正（実体は parser の REVEAL 文脈規則の誤適用・Sonnet 推定の executor intercept は誤り）**（詳細 BUGFIXES 続き147・元記録の全文は PLAN_DETAIL §3）。残＝WX24-P4-048-E2（「対象とし」2回＋動的パワー制約＝要専用処理）＋WX26-CP1-086/WXK05-027/WXK05-070 のコスト STUB 精緻化 |
| ~~🆕(xl)~~ | ~~【絆常/絆自/絆起/絆出】が効果ブロック境界として認識されず絆能力が飲み込まれる（134カード137能力）~~ **✅続き215＝parser marker 3箇所＋engine 絆未獲得ゲート新設・112枚一括採用**（詳細 BUGFIXES 続き215） |
| ~~🆕(xli)~~ | ~~絆分離の残ギャップ11件~~ **✅完了（続き215→217→218）**＝7件は計器ノイズ・`BANISH_REDIRECT` 本体は続き217・(b) 種類数条件と (c) は続き218・**(a) 場出し欠落は続き218c**（単カードではなく**15効果の系統**＝場出しのみ pick に parser 規則が無く `LOOK_AND_REORDER` へ縮退し場出しが丸ごと消える no-op だった。`LOOK_PICK_CHAIN[field]` 規則を新設）。詳細 BUGFIXES 続き217／218／218b／218c |
| ~~🆕(xliii)~~ | ~~census の系統的偽陽性＝`BANISH_REDIRECT` 族~~ **✅完了（続き218d・Opus）**＝「ゾーン:エナゾーンに置く」カテゴリに `extraOk` を追加し、`BANISH_REDIRECT` を持ち **redirect イディオム句（`エナゾーンに置かれる代わりに…トラッシュに置く`）を除いた残りに「エナゾーンに置」が残らない**ときだけ合格（lrigDown と同じ安全弁）。族の**全22効果**で残存0を機械確認（隠れた SEND_TO_ENERGY 欠落なし）。subject 側フィルタ脱落（(xliv) §6.3）は各専用カテゴリが引き続き露出＝マスクで隠れない。census 1895→1891。詳細 BUGFIXES 続き218d |
| 🆕(xliv) | **`BANISH_REDIRECT` の残テール（続き217→218b→230 で消化）**。族36効果を全数棚卸し。**✅消化＝(1)「パワーが０以下の」限定脱落2件**（`whenPowerZero` 新設・続き218b）**(2) owner 誤り5件**（続き218b）**(3) 属性フィルタ5件＝✅続き230（Opus）**＝parser で target.filter へ復元（level/isFrozen/infected/hasCharm）＋engine の **battle/power0 経路**（`banishRedirectAppliesFrom` に被バニッシュ属性）で評価。WXK10-053/WXDi-P12-073/WX21-005/WX18-038＋WX19-078（over-fire 縮小）。golden 533。詳細 BUGFIXES 続き230。**(a2) 効果経路（`banishDestination`）の 【常】 走査＝✅続き231（Opus）**＝`effectEngine.fieldEffectBanishRedirectToTrash` 新設（`cardMap.get(n).effects` から holder 場の CONTINUOUS BANISH_REDIRECT を on-the-fly 走査＝effectsMap 追加は不要）＋`banishDestination` に opts 配線＋効果経路の呼び出し10箇所へ `banishRedirectOpts` 配線。whenPowerZero/bySource/DURING_ATTACK_PHASE(phase不明) は保守的に除外＝過剰発火ゼロ。golden 534・census 1841維持。詳細 BUGFIXES 続き231。**残＝⛔§6.3 級**：**(a3) bySource='by_this' の効果経路**（発生源シグニ配線が要る・under-fire）**(b) 単体対象4件**（対象選択フローが無い）**(c) 正面限定3件**（target 側ゾーンスコープ機構）。近似すると偽陰性になるため据置。 |
| 🆕(xlvi) | **parser は `REVEAL_AND_PICK`（手札に加える）を正しく出すのに curated が古い `LOOK_AND_REORDER` のまま held ドリフトし「その中から…手札に加え」＝カードアドバンテージが死んでいた系統**。**✅続き218g＝忠実性を1件ずつ検証し9効果を外科的採用**（build:effects harvest は型スワップを held に上げず temp curated 温存＝heldReview 不可視の死角。census 1886→1880。詳細 BUGFIXES 続き218g）。**残＝真ドリフト36件中の未採用27件**＝大半が `parseStatus:MANUAL` で fresh が filter/条件を落とす**過剰簡約**（`WXK10-022-E3` 無色ではない・`WXK01-004-E1` レベル奇数・`WX02-018-E1` 条件付き2ドロー等）＝忠実表現する parser 拡張が要る §6.3級。cur:AUTO の複雑残（`WXDi-P16-008-E2` 多目的等）は忠実性要確認 |
| ~~🆕(xlv)~~ | ~~「[あなたの/対戦相手の]アタックフェイズの間」限定の CONTINUOUS 常在効果が activeCondition 脱落で PERMANENT 化（相手ターン中も過剰適用）~~ **✅続き218f＝`DURING_ATTACK_PHASE` を新設（型／parser／engine：checkActiveCondition＋calcFieldPowers に turnPhase 貫通・13呼び出し元へ bs.turn_phase／decompiler）。13効果12カード是正・census 1888→1886**（続き215/217 の残ギャップ `WX25-CP1-082-E3` を起点に系統化。詳細 BUGFIXES 続き218f）。**残＝keyword/banish_redirect 経路の phase enforcement は permissive（turnPhase 未配線＝従来同値・退化なし）＝将来 threshold/keyword collect へ turnPhase を通せば自動で効く** |
| ~~🆕(xlvii)~~ | ~~「対戦相手のルリグがアタックしたとき」に防御側の付与AUTO を発火させる収集経路が engine に無い~~ **✅完了（続き218j・Opus）**＝`triggerCollect` に **`collectLrigAttackDefenderTriggers` を新設**（ON_ATTACK_SIGNI 側 2429 と同型・any_opp/any だけ拾い未設定 self は攻撃側収集の担当＝二重発火なし・usageLimit/`lrig_abilities_disabled` ゲート込み）＋BattleScreen へ配線（防御側は playerId も `actions_done` 書き戻し先も別）＋parser の timing 判定（複合主語＝2要素 timing／ルリグ単独＝ON_ATTACK_LRIG。**総称フォールバックより前に判定**）＋decompiler の `このルリグ`→scope 主語置換。**4効果が完全化**（`WX15-002-E2` は ON_ATTACK_SIGNI→ON_ATTACK_LRIG 是正、他3件はルリグ半分を回収し 218i の silent fallback が解消＝PARTIAL→AUTO）。golden 514→516。詳細 BUGFIXES 続き218j |
| ~~🆕(xlviii)~~ | ~~「〜てもよい」（任意アクション）が parser で optional:true を落とし engine が強制実行＋「そうした場合」did-it ゲートが常時成立していた系統退化~~ **✅続き225（Opus）＝4ハンドラ（DOWN／手札捨て〔先頭非アンカー〕／エナ→トラッシュ／場出し〔plain も〕）に「てもよい」→optional を配線。ライブ90枚を build:effects の純粋上位集合自動採用で一括是正（全件 source に「てもよい」在を機械確認・偽陽性0）＋optional 復元で過去 held 改善が pure-superset 解禁され自動採用。census 1865→1846・golden 528。3枚 heldReview 採用・SPDi43-30 は choice① のみ手術的パッチ（choice② HAND_COUNT 温存）。詳細 BUGFIXES 続き225** |
| 🆕(xlii) | **フォールバックSTUB `GRANT_LEAVE_PLACE_PENDING` 残2枚（続き216・Opus）**＝主因（parser のトリガー句除去漏れ＋ON_LEAVE_FIELD の duringAttackPhase 未評価）は消化し **WXEX2-51-E1 を実装・7枚の scope/DRAW/条件も是正**（詳細 BUGFIXES 続き216）。残＝(a)**WX21-004-E2**＝エナから「そのシグニと**同じ**レベル」配置＝`levelEqTrigger` 語彙が要るが該当1枚のため「過剰語彙を作らない」方針で据置（STUB維持・no-op・退化なし）。(b)**WX22-001-E3**＝【起】でこのアタックフェイズ限定の遅延 ON_LEAVE_FIELD watcher を設置＝`INSTALL_DELAYED_TRIGGER` の ON_LEAVE_FIELD 拡張（フェイズ限定 lifetime＋手札から低レベル配置）が要る §6.3級。どちらも小口だが単発機構待ち。 |
| ~~🆕(xlix)~~ | ~~【常】出撃制限が `ADD_TO_FIELD` へ mis-parse（続き228・Opus観測）~~ **✅続き248（Opus）で消化＝11枚系統**＝「【常】：このシグニ/カード/キーは〜（新たに）場に出すことができない」が「場に出す」を含むため bare `ADD_TO_FIELD` へ誤 parse され CONTINUOUS のまま inert no-op（＝出撃制限が完全に失われていた）。棚卸し＝Type A（自身出撃制限）11枚（PR-470B/WD16-016/WDK16-05H/S/T/WX08-025/WX12-022/WX14-033/WX18-075/WX19-030/WXK05-032）。※engine 誤実行の懸念は**現状無し**と確認（CONTINUOUS ADD_TO_FIELD はどの収集経路にも拾われず executor にも流れない）。新設 `SELF_PLAY_RESTRICT` アクション（never＝効果でのみ配置可／condition＝許可条件）＋parser 全文先取り（`parseSelfPlayRestrict`＝`parseActiveCondition` が「…ないかぎり、」条件節を剥がす前に検出）＋engine `canSelfPlay` を `handleSummonSigni` チョークポイントへ配線。`evalConditionForContinuous` に FIELD_SIGNI_POWER_COUNT/FIELD_CLASS_COUNT/LRIG_NAME_CONTAINS 追加。**enforcement 実配線＝never（WXK05-032/PR-470B）／WX12-022(パワー10000+)／WX14-033(＜アーム＞2体+)／キー3枚(LRIG名+Lv)**。**permissive 据置**（machine 条件を付けず＝従来 no-op と同値・退化なし）＝WX19-030(ウィルス総数)/WX18-075(アクセ総数)/WX08-025(クロス状態)/WD16-016(相手ディスカード)＝いずれも新規 Condition 語彙が要る単発機構。CPU 召喚経路への配線は §8 CPU 拡張へ据置。golden 573→579・census 1825→1817・全ゲート緑。詳細 BUGFIXES 続き248。 |
| 🆕(l) | **アーツ「ターン終了時まで、あなたのセンタールリグは「【自】…」を得る」の内側【自】parse 失敗3枚＝完全 no-op（続き234・Opus観測）**＝**WD21-009（燐廻転生）／PR-204（アーク・ディストラクト）／WX15-016（スリップ・ノット）**。効果 E1 単独＝`GRANT_LRIG_ABILITY{abilities:[]}` に full rawText を抱えたまま内側【自】が nest されず top-level フォールバックも無く**アーツが何もしない**。同パターン11枚中8枚（WX01-028/WX02-028/WX19-014/PR-238/PR-K077/WXDi-P05-052 等）は abilities:1 に正しく nest され engine の一時 AUTO 付与も動作済み＝**§6.3 新機構は不要・内側 ability parse 改善で直る**。失敗3枚の内側は複雑（アタック時トリガー＋下からルリグトラッシュ／数字宣言／バーストアイコン照合／アタック無効）。詳細 BUGFIXES 続き234。 |
| ~~🆕(li)~~ | ~~`getKeyPieceActions`（BattleScreen.tsx:10765-10772）がキーの ACTIVATED 能力を timing↔phase 照合せず surface~~ **✅続き240（Opus）で消化**＝`battleUtils.ts` に `keyActivatedTimingMatchesPhase` を新設しシグニ【起】と同型の照合を挿入（MAIN専用→メインのみ／ATTACK_ARTS専用→アタックフェイズのみ／SPELL_CUTIN は cut-in phase 不在ゆえ permissive＝退化ゼロ）。キー80枚・ACTIVATED 113効果を棚卸し（timing 未設定0件）。golden 552→554（ヘルパー単体＋全キー退化ゼロ全数ガード）・census 1826据置（UI/engine のみ）。詳細 BUGFIXES 続き240。**残＝《アタックフェイズアイコン》動的付与と真のカットイン窓モデル化は engine フェイズ機構拡張＝§6.3級で据置** |

#### Sonnet のタスク（2026-07-15 棚卸し・生きているものだけ）

> **2026-07-15（続き134）の棚卸しで在庫はほぼ枯渇→続き201/208 の採用待ち在庫77件も✅続き214で全消化**。現在の Sonnet 在庫＝タスク1（§7 実機検証＝(xi)/(xxxvi) の要実機検証ほか）と、Opus の新語彙着地待ちのタスク6。タスク8 の次ラウンド（clean群への展開）は任意・低優先。

| # | タスク | 種別 | 規模 | 残っている内容 |
|---|---|---|---|---|
| ~~9~~ | ~~PARTIAL 刻印 151件のトリアージ~~ **✅完了（続き138）** | 計器読み＋分類 | M | **152件全件を3分類完了＝実害144件を Opusタスク12 (xxii)(xxiii)(xxiv) へ登録**（詳細 PLAN_DETAIL §3・成果物 `docs/_partial_triage.txt`） |
| 1 | **§7 実機検証の横展開** | 検証（driver シナリオ追加のみ） | S×件数 | **✅(a)(b)(c)＋`oppDrawOwnEffectOnly`＋続き173/174 復活分2件は消化済み＝既定order 75件**（経緯の全文は PLAN_DETAIL §3）。残＝§7 の未消化項目（(xi) skip検証・(xxxvi) グロウ支払いUI・ON_LRIG_GROW④ ゲット・グロウ経路）＋WX22-001-E3（§6.4）＋**🆕(xlvii) 防御側ルリグアタック収集（続き218j）**＝相手ルリグのアタック時に `WXDi-D06-010`「そのアタックを無効にする」が実際に発火するか、**ガード応答（`pending_lrig_attack`→`lrig_attacked`）とスタック解決順が噛み合うか**（防御側エントリを攻撃側と同一スタックに積む形にしたため、解決順とガード要求のタイミングが要実機確認。golden はコレクタ単体までしか担保していない） |
| 3 | driver バッチ実行の状態汚染 | scripts（engine/JSON 非依存） | M | ⏳主要因は解消済み（続き77・105・139＝`handPrepend` 由来の単体 flakiness 修正／続き140＝DB側累積／続き142＝ブラウザ再確立。経緯の全文は PLAN_DETAIL §3）。**残**＝(b)`oppDraw` 単独FAIL（CPU挙動依存・未解明）(c)`lrigGrowAnyOppP03046` FRESH=1 FAIL（CPUがグロウ判断に至らない）。現在シナリオ 81定義／75既定実行 |
| 4 | ~~BEHAVIOR_AUDIT キュー再生成＋一次トリアージ~~ **⛔枯渇（常設のまま休眠）** | 計器実行＋分析 | S | **続き133 で高シグナル22件を全件精査＝新規の真no-opバグ0件**。残る母数251件（273−22）は**監査ツールの構造的盲点**（COUNTER_SPELL/SPELL_CUTIN・トリガー文脈依存効果）に大半が該当＝そのまま掘っても同じ結論になる。再開するなら**まず盲点フィルタを機械的に実装して除外してから**（＝新規のスクリプト作業。低収量の見込み） |
| 6 | §5c 再収穫サイクル（`/census-batch` 準拠） | JSON採用 | S | **✅続き214で在庫77件を全消化＝64枚採用**（詳細 BUGFIXES 続き214）。次の在庫が発生するまで待機（Opus1〜6の新語彙着地待ち） |
| 8 | semantic audit のスケールアップ＋単点修正 | パイプライン＋JSON単点 | M | **✅stub群母集団2,401枚は続き144〜146で全数監査完了**（findings 2,799件→Opusタスク12 (xxvii)(xxviii)(xxix)。経緯の全文は PLAN_DETAIL §3）。残＝clean群3,574枚への展開（任意・低優先）。累積除外リスト `scripts/archive/scratchpad/semantic_audit_stub_round3/audited_stub_cards_cumulative.txt` |

~~Sonnetタスク6・未採用在庫 第2弾40枚（続き208）~~ **✅続き214で全40枚採用**（詳細 BUGFIXES 続き214）。

~~Sonnetタスク6・未採用在庫37効果（続き201）~~ **✅続き214で消化完了＝24枚採用・11枚は既にMANUAL側で是正済み**。副産物の `WX25-CP1-012-E2` 構造疑義→(xl) 登録→✅続き215で消化。

~~補欠(a) timing census 振り分け台帳／(b) `textNoJson` 56枚の実体確認~~ **✅続き172／続き170で完了**（56枚は全件正当・真の欠落0。詳細 BUGFIXES 続き172・170）。

**依存の要点（交互サイクルの回し方・2026-07-15 更新）**＝待ち関係は3本：**Opus1〜6 → Sonnet6**（新語彙が着地してから再収穫）／**Sonnet1・4・8・9 → Opus12**（Sonnet が観測して積む → Opus が修正する）／**Opus12 → Sonnet1**（修正が着地すると §7 の意図的FAIL回帰シナリオを PASS へ反転させる検証作業が生まれる＝Sonnet の主力在庫が復活する）。それ以外の組はすべて独立＝どの順で取っても衝突しない（バトン式なので同時作業はしない・§11 の「着手中」宣言は大型機構のみ必須）。

**現在の Sonnet 在庫＝タスク1（§7 実機検証）が主力**。タスク6は Opus の新語彙着地待ち・タスク8 clean群は任意。作業中に parser/engine のバグを見つけたら Opusタスク12 へ登録し交互サイクルへ戻す。

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最新1件のみ・過去は別ファイル）
> **運用ルール（2026-07-07〜）**：この節には**直近の作業1件の要約だけ**を残す（入れ替え式）。新しく作業したら ①いま置いてある要約を [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) の「過去セッション要約」**先頭**へ移す（新しいものが上）→②この節を今回の作業の要約へ丸ごと書き換える。過去の全セッション要約（旧・要約①②を含む）は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) に集約済み。

- **🆕 セッション（2026-07-22・続き254・Opus 4.8・**[P1_COMPLETION_ROADMAP](./P1_COMPLETION_ROADMAP.md) **バッチ2第2波の実測でルート枯渇を確認→真バグ4件を Opus 直修正＋P1完了宣言フェーズへ移行**（census 1715→**1713**・golden 596→**599**）**（続き253 は [PLAN_PROGRESS.md](./PLAN_PROGRESS.md) 先頭へ退避）
  - **⚠実測でバッチ2〜4が枯渇と判明（CODEX_GUIDE §3・続き213/250 の再現）**＝codex に第2波を投げる前に候補 JSON を全件実測したところ、**census の class/色/閾値/「Nまで」high-signal は大半がコスト・条件・トリガー節・別節にあり、対象フィルタ自体の脱落ではなかった**。genuine 真バグ＝バッチ2第2波 **4件**・バッチ3（閾値）**3件**（偽陽性含む）・バッチ4（「Nまで」）**4件だが全て「代わりに」置換＝対象外機構**。SEND_TO_ENERGY=0・TRASH=0・BANISH=0・BOUNCE=0。**⇒「1 parser規則→N効果」の系統クラスタは出尽くした＝PLAN §5 の逓減限界に到達**。
  - **Opus 直修正4件**（codex バッチにならないため分担）＝WX10-013-E1（水獣）・WX11-046-E1（空獣か地獣）＝`parseSentencePart1` のパワー修整分岐に class/色/level 接頭辞を追加し owner:any 潰れ→owner:self+story 復元（additive）／WX05-023-E3（原子）＝PLACE_UNDER_SIGNI の「《X》以外の＜種族＞N枚」を excludeCardName+story+count へ（cardName 誤合成是正）／WX09-020-BURST（白か黒）＝MANUAL 兄弟の PRESERVE 直パッチ。per-effect diff 巻き添え0・golden +3・全ゲート緑。詳細 BUGFIXES 続き254。
  - **P1完了宣言に向けた簿記**＝純§6.3 94効果（`docs/_p1_classification.txt`）は**全件現在も AUTO・STUBノードなし＝分類有効**を機械再確認し ROADMAP に正式登録（P1完了宣言時に即 P2/P3 送り可）。ROADMAP「次にやるべきこと」冒頭にバッチ2〜4枯渇の実測を記録し「純P1 1647／16バッチ 候補上限1280」は対象filter脱落については over-estimate と明記。
  - **次の一手＝方針判断が要る**（次セッション or ユーザー指示）＝（A）未測ルート（バッチ5 同一性/共通色109・バッチ1残の履歴カウンタ系）を実測して codex バッチが残っていないか確認、（B）残る長テール単発（続き254 の4件が典型）を Opus が BEHAVIOR_AUDIT/semantic audit ベースで逐次直修正、（C）§5「完了判定」に沿って **P1完了＋残りは機構待ち（§6.3）を正式宣言**し §2 DoD を締める。**現時点の実測は（C）が近いことを示す**（parser-fixable 系統クラスタ枯渇）。**Sonnet はタスク1（§7 実機検証）継続**。
### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 188 / LOSS 154 / VALUE 34（2026-07-19 実測・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**。続き29時点（held 79）からの増加は主に**その後の parser 改善で fresh が curated より正しくなった採用待ちバックログ側**（Sonnetタスク6の採用サイクルで消化してから実数を締め直す）。**この数字からさらに増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。旧内訳の詳細は PLAN_DETAIL 参照。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）。**現ベースライン＝高シグナル欠落 1702【効果単位】**（2026-07-23 §6.3 アップ/ダウン状態ファミリ＝codex実装/Claude確認・追加ダウンコストを既存 `fieldDown` regex 拡張（＜A＞か＜B＞/色）で表現〔codex の並行語彙 signiDown は検証で撤去・WXDi-P14-040 二重コスト化を是正〕＋`OPTIONAL_COST.handDiscard` 実払い＋watcher 是正（banishedFrontOfSelf/duringMainPhase）の12効果〔golden 617→627〕＝1711→1702。旧・2026-07-22 ブースト機構＝§6.3 5番目bullet の「あなたがブーストしていた場合」ボーナス4枚を CONDITIONAL{IS_BOOSTING}＋任意追加エナUIで parse＝1713→1711。旧・続き254＝Opus・ROADMAPバッチ2第2波の実測でルート枯渇を確認し真バグ4枚を直修正（WX10-013/WX11-046 の POWER_MODIFY owner:any 潰れ＝class/色/level 接頭辞追加／WX05-023-E3 の PLACE_UNDER cardName 誤合成／WX09-020 の白か黒 PRESERVE 直パッチ）＝1715→1713〔golden 596→599〕。旧・続き253＝Opus+Codex・ROADMAPバッチ2第1波「対象フィルタ合成・トラッシュ→手札」＝30枚採用（`extractNounPhraseFilter` 新設＝複色OR/無色/cardName包含/excludeCardName/nonColorless＋複合対象の SEQUENCE 分割。PRESERVE 11件は直パッチ）＝1742→1715〔golden 593→596〕。effectEngine の nonColorless `'無'` 欠けも同時修正。旧・続き252＝Opus+Codex・ROADMAPバッチ1第4波「センタールリグ条件＋ターン内履歴/出自」＝22枚採用（OR/THIS_CARD_FROM_DECK/PLACED_BY_CLASS省略形の3拡張）＝1761→1742〔golden 590→593〕。Codex の parser 未修正納品（held 86 汚染）と誤合成残骸3件を Claude 側で是正（STATE_COND_BATCH4_ACTIONS 固定・held 73 復帰）。旧・続き251＝Opus+Codex・ROADMAPバッチ1第3波「盤面/ゾーン状態条件」＝「場/トラッシュ/エナに〜がある場合」系の丸ごと脱落33枚（distinctColors/HAS_KEY_IN_FIELD/hasCharm 拡張）を採用＝1792→1761〔golden 588→590〕。Claude 検証で恒久 force-adopt 撤去・巻き添え退化4件復元・死フラグ1件修正。旧・続き250＝Opus+Codex・ROADMAPバッチ1第2波「参照カード属性条件」＝「それ/そのカードが〈属性〉の場合」系の真バグ13枚（elseAction 新設・AWAKEN 対象覚醒・レゾナ per-target 置換・isDisona filter・名前ゲート）を採用＝1799→1792〔golden 584→588〕。同クラスタ41件中21件は REVEAL_AND_PICK filter 表現済みの census 偽陽性と実測分類。旧・続き249＝Opus+Codex・ROADMAPバッチ1第1波「状態条件節の持ち上げ」＝ターン所有者条件17＋ライフクロス枚数8の条件節丸ごと脱落（無条件発火の過剰効果）を新条件型 `TURN_OWNER`（実行時実評価・`ExecCtx.isOwnerTurn` 配線）＋`LIFE_COUNT` opponent版/AND複合で25効果採用＝1817→1799〔golden 579→584〕。旧・続き248＝Opus・タスク12(xlix)「【常】：このシグニ/カード/キーは（新たに）場に出すことができない」の自身出撃制限11枚が bare `ADD_TO_FIELD` へ誤 parse され inert no-op 化していた系統を新設 `SELF_PLAY_RESTRICT`＋`canSelfPlay` 配線で消化＝1825→1817〔golden 573→579〕。旧・続き243＝Opus・タスク12(xxix)「そのシグニの【出】能力」クラスタを忠実表現化＝死アクション `BLOCK_ACTION{ON_PLAY_ABILITY}`（engine 未参照）を配置アクションの `suppressOnPlay` フラグへ畳む fold を parser 単一チョークポイントに新設（76効果折込・22効果はアンカー無しで据置）＝block→flag の構造変換ゆえ高signal欠落計器の対象外・1825維持〔golden 557→562〕。旧・続き236＝Sonnet（Opusタスク16試行）・WX17-032「正面以外のシグニをバニッシュしたとき」の ON_PLAY 誤フォールバックを是正（trigger regex＋新設 `triggerCondition.banishedNotFront`）。UP先「そのアタックしているシグニ」は能力ホスト≠実アタッカーになりうるため新設 `targetsBattleAttacker` で解決＝'除外(〜以外の)' カテゴリの keys に `NotFront` も追加（`thisCardOnly` 採用時の偶然一致に頼らない恒久対応）。1839→1838。旧・続き233＝Opus・§6.3 機構待ち解消＝ON_LEAVE_FIELD 跨サイド any_opp watcher の `byEffect`/`leftStateFilter{isFrozen}` ゲート＋離脱直前 state スナップショット配線で WXK11-017-E1／WXEX1-30-E2／WXDi-P03-040-E1 を self 誤発火→any_opp 正発火へ（併せて REVEAL_AND_PICK remainder に shuffle 語彙）＝1841→1839〔golden 535→537〕。旧・続き232＝Opus・タスク5「このシグニを場からトラッシュに置いてもよい」自己犠牲5枚に thisCardOnly＋optional を付与＝対象/任意性の是正で語彙センサスの対象外＝1841維持〔golden 534→535〕。旧・続き231＝Opus・タスク12(xliv)(a2) 効果経路の 【常】 BANISH_REDIRECT 走査を配線＝バニッシュ先（エナ→トラッシュ）の是正で語彙センサスの対象外・1841維持〔golden 533→534〕。旧・続き229＝Opus・census クラスタ「Nまで上限選択」精査＝REVEAL_AND_PICK のフィルタ付き pick ハンドラが「スペル」noun を欠き「（色の）スペル1枚を公開し手札に加え」が LOOK_AND_REORDER に飲まれ pick 脱落していた系統を noun 群に「スペル」追加（cardType:スペル＋pickNoun:スペル）で是正＝SPDi43-17-E1（採用）＋WXK05-023-E3（MANUAL 手術）を被覆し 1843→1841（golden 532維持）。旧・続き228＝Opus・タスク3 DRAW脱落の一部＝「デッキの一番上のカードをエナゾーンに置き、X」連用中止が後続を飲み込んで脱落していた系統を連用中止 splitter に追加＝WX15-098/WX19-030-E2 の energy-charge を回復し 1845→1843（golden 532維持）。旧・続き227＝Opus・タスク4 「あり」複合条件 WXDi-P11-048-E1 を消化＝トラッシュ色枚数＋相手エナ枚数の AND を parser に1本追加。過剰効果（条件脱落）の是正は「欠落」計器を動かさず 1845 維持（golden 532維持）。旧・続き226＝Opus・タスク12(xxix)(b) 完了＝照応先ロスト系統（「対戦相手のシグニ1体を対象とし、[任意コスト]。そうした場合、それの…」で照応先が失われ owner:self+targetsTriggerSource／source:DECK_CARD へ化ける）を parser 後処理2本で復元＝ライブ84枚＋MANUAL1枚を一括是正。census は owner 変更が欠落語彙計器をほぼ動かさず1846→1845（golden 528→532）。旧・続き225＝Opus・タスク12(vii)系 完了＝「〜てもよい」任意アクションの optional 脱落（強制実行＋did-it ゲート常時成立）を4ハンドラで是正＝ライブ90枚を pure-superset 自動採用で一括是正＋optional 復元で過去 held 改善が解禁され自動採用され1865→1846（golden 527→528）。旧・続き224＝Opus・タスク1(d) 完了＝WX25-P3-085 の単文型 grant mis-parse を再収穫（E1 の GRANT_EFFECT 復元で欠落1件解消）＋同カード BURST の DOWN 対象 SIGNI→LRIG を parser 一般化で是正（DOWN 種別変更は「欠落」計器の対象外）で1866→1865（golden 527維持）。旧・続き223＝Opus・タスク12(xxix)(b) 222クラスタ・トリアージ＝「対戦相手のルリグ1体…凍結」の FREEZE 対象 SIGNI→LRIG 種別取り違え18効果を parser 一般化で消化＝凍結は「欠落」計器の対象外のため1866維持（golden 526→527）。旧・続き222＝Opus・タスク12(xxix) 残(a) クローズ＝WX06-014-E2 の step1 を「自分トラッシュから古代兵器5枚をデッキ下」へ是正し MANUAL 化・did-it ゲートで「そうした場合」を表現し1867→1866。旧・続き221＝Opus・タスク12(viii) 完全クローズ＝WXDi-P10-034 の裏向き設置→ターン跨ぎ遅延→表向き分岐を実装し1868→1867。旧・続き220＝Opus・タスク12(vii) WX25-P2-112 のダウン→共通色エナトラッシュ実装で1869→1868。旧・続き219b＝Opus・タスク12(xxxix) CHOOSE ヘッダ前の状態条件の汎用持ち上げで10枚是正し1878→1874。旧・続き219＝Opus・タスク12(xxxix) 先頭条件脱落5枚＝「各ターン終了時」strip 漏れ＋相対手札比較 `HAND_DIFF` の CONDITIONAL 未配線を是正し1880→1878。旧・続き218g＝Opus・parser は `REVEAL_AND_PICK` を出すのに curated が古い `LOOK_AND_REORDER` のまま「手札に加える」が死んでいた held ドリフト9効果を採用し1886→1880。旧・続き218f＝Opus・「アタックフェイズの間」限定の CONTINUOUS 常在効果の PERMANENT 潰れを `DURING_ATTACK_PHASE` 新設で是正し1888→1886。旧・続き218e＝Opus・「それをデッキの一番上に置く」のトラッシュ回収幻覚を是正し1891→1888。旧・続き218d＝`BANISH_REDIRECT` 族の census 偽陽性を extraOk 較正で解消し1895→1891。旧・続き218＝①「N種類以上」条件の語彙化で1919→1916／②`lrigDown` コスト限定で1916→1899）。**この数字から増えたら回帰（exit 1）／減ったら `BASELINE_HIGH` とここを実数更新**。前提＝`docs/_effect_srctext.json` が最新であること。明細 `docs/_vocab_census.txt`、過去の計測履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §4／BUGFIXES 続き109以降。
- **母数**：効果カード 5975／効果 10719／MANUAL効果 891／STUB含むカード 1862・STUBノード 2432（2026-07-19 実測更新。STUBS.md サマリーと整合）。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- **decompile再生成は `npm run regen`**（全シート＋下流一括・UTF-8直書き＝シェル非依存。2026-07-07にリダイレクト方式を廃止。旧「⚠Bash の `>`」問題は解消済みだが、万一 UTF-16 が混入すると下流3スクリプトがガードで即 exit 1 する）。

### 📌 次の一手（推奨順）
> **cold start＝まず `npm install` → `npm run gates`（全ゲート一括・数秒）が緑になることを確認する。** 現状＝golden 631・smoke/fuzz 全0（SKIP も 0）・同型★0・census 1702。
>
> **戦略＝続き108 策定の「全カード完成戦略①〜⑤」を最優先で適用する。①（census 効果単位化）は✅続き109で完了＝現在は戦略②「純P1の系統バッチ消化」。** 残作業マップは [P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md)（🆕2026-07-22 census 1817 で再計測＝純P1 1647効果 91%／混在 76 4%／純§6.3 94 5%。**純P1は parser helper 単位の16バッチ・候補上限1280へ再編済み＝上位5バッチ計984が最短ルート**）。
>
> 1. **自分のモデル側のタスク表（§3）から取る**。**🆕2026-07-19 整理時点**＝**Opus の主戦場は タスク12 の生き残り在庫（(xliv)・(xxxix)・(xxii)残50件・(xlii)の残）＋タスク16 残43効果**（(i)〜(xl) の大半は消化済み＝1行✅サマリ参照。(vii)(viii)(xxix)(xliii) は完全クローズ）。**Sonnet の主力は タスク1（§7 実機検証＝(xi) skip検証・(xxxvi) グロウ支払いUIほか）**＝タスク6は Opus の新語彙着地待ち・タスク8 clean群（3,574枚）は任意。タスク4（キュー）は枯渇したので取らない（理由は §3 Sonnet 表）。
> 2. **手順はスキルに従う**＝`/census-batch`（§5c 文型バッチ1巡）・`/audit-card <CardNum>`（BEHAVIOR_AUDIT 1カード監査1巡）・`/baton`（セッション終了時の簿記）。散文の記憶で回さない。
> 3. **engine/parser/decompiler を触ったら `npm run gates`・シート再生成は `npm run regen`**（§12）。バグは golden に1件足してから直す。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦`npm run regen`（全シート＋下流一括再生成）＋同型★0 確認 ⑧`npm run gates` 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

> **🆕 P1完了に向けた残作業マップ＝[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md)（2026-07-22 census 1817 で再計測＋純P1を parser helper 単位の16バッチへ再編）**。census高シグナル1817効果を機械分類＝**純P1（parserで直せる）1647効果(91%)／混在76効果(4%)／純§6.3（機構待ちのみ・即P2/P3送り可）94効果(5%)**。「機構待ちを§6.3送りにすれば宣言が近い」は誤りで、95%はparser表現作業を含む（粗い網カテゴリのみに掛かる効果は115件＝効果単位化で旧マスキング死角は解消済み）。**🆕再編の要点＝純P1のうち機構語・相対値・履歴条件・「代わりに」全体・引用付与全体・粗い網を安全側に除いた parser バッチ候補上限は1280効果**。**最短ルート＝上位5バッチ（①状態条件節hoist 326・②共通filter extractor 342・③固定閾値 119・④「Nまで」88・⑤同一性/共通色 109＝計984）**＝`STATE_CONDITION_CLAUSES`／`parseHoistStateCondition`／続き143の3規則の横展開（続き106/107/143手法）。着手順・除外判断・機構待ち効果実IDリストは同ドキュメント＋`docs/_p1_classification.txt`。

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scripts/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scripts/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [x] **未実装action型 worklist**（§6.1）＝**✅残型0（続き204/204b でクローズ）**。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサスの系統別消化（2026-07-04新設・続き17-18で両方向98計測に拡大・続き23で文型バッチ化・過剰効果＋幻覚バグ）

**目標＝`npm run census` の高シグナル欠落（現ベースライン＝§4 恒久指標参照・2026-07-22 時点 **1817 効果**）を文型テンプレ単位のバッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **残りの消化対象（生きている worklist のみ・消化済みバッチの履歴は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §5c。⚠各件数は記載時点のスナップショット＝最新件数は `docs/_vocab_census.txt`／[P1_COMPLETION_ROADMAP.md](./P1_COMPLETION_ROADMAP.md) のバッチ表を正とする）**＝(1) **「代わりに」残テール**：C:コスト代替6・D:置換ルール9（バニッシュされない系＝置換機構要）・E:リコレクト2・B1残10（コスト参照・ターン中イベント等＝条件語彙が無い §6.3）＋**CHOOSE平坦化復元の採用待ち held 約35枚**。(2) **幻覚/取り違え系の残**＝WX16-021（置換ルール→即時LIFE_CRASH幻覚＝置換機構要・§6.3）・BURST内IS_MY_TURN残7（§6.3登録済み）。(3) **構造平坦化系**＝引用付与の残107（CONTSELF_COND 18／OTHER 約30／内側品質不全27＝トリガー語彙拡充で再収穫可・held 103 が計器）・代わりに183・IS_MY_TURN誤変換の残53・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残35・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
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

- **🆕 GRANT_PROTECTION 効果耐性の広域テール残（2026-07-21・続き239・§6.2 系統②タスク9 の非tractable分）**＝subjectFilter/条件/from で表現できない限定を持つ「…効果を受けない」系。いずれも近似すると偽陰性/過剰保護になるため据置：**~~(a) 発生源プロパティ限定~~ ✅2026-07-22（codex実装/Claude確認・commit d09c9a43）で静的属性2枚消化**＝`GrantProtectionAction.sourceFilter?:TargetFilter` を新設（sourceCostMin の一般化）し collectEffectImmuneSigni で解決中ソースカードを matchesFilter 判定。WXEX2-36（源が《ライズアイコン》を持たない・相手ターン限定）・WXK11-021（源が《ライフバースト》ではない・自ターン限定）を manualEffects 化。ローカル matchesFilter に hasLifeBurst（`LifeBurst==='1'`・BurstText基準と全6712枚等価）追加。golden 正負ケース追加。**残＝WX11-027（源が対戦相手のライフバースト効果）は「解決中効果がLB効果か」の動的コンテキスト追跡が要る（静的属性では偽陽性）ため据置**。**~~(b) self-except~~ ✅2026-07-22（codex実装/Claude確認・commit 0c7e7cb1）で消化**＝WX17-001「《カーニバル ―Ｑ―》は自身以外の効果を受けない」。既存 freeze/down consumer は `ctx.otherEffectImmuneNums.has(lrigTop)` を honor 済みだったが、`collectEffectImmuneSigni` 主ループが field.signi のみ走査しルリグを収集していなかった gap を解消（1カード処理を `collectFromCard` ヘルパー化しセンタールリグにも適用・signi 回帰なし）。WX17-001-E1 を GRANT_PROTECTION{fromAll,sourceOwner:opponent} で MANUAL 化（E2/E3 は merge 保持）。`OPP_LRIG_LOSE_ABILITY` も lrig 免疫 honor。「自身以外」は sourceOwner:opponent の忠実近似（自分の効果は対象外＝WX17-001 自身の【自】は維持）・own-other-source は near-inert として defer。golden で自己除外・回帰を assert。**~~(c) 相手エナゾーンのカード免疫~~ ✅2026-07-22（codex実装/Claude確認・commit 2c4377b7）で消化**＝WXK11-020「対戦相手のエナゾーンのカードは【マルチエナ】を失い（対戦相手の）効果を受けない」。①マルチエナ喪失＋②Y の再付与無効化を「支払い側の対戦相手が WXK11-020 を持つ間、支払い側のエナは印字/付与に関わらずマルチエナにならない」単一ルールに集約＝CONT STUB `STRIP_OPP_ENA_MULTI_ENA`＋`isMultiEna` の `stripped` 引数（`costs.ts`）を全支払い経路（人間モーダル15＋CPU グロウ）へ配線。②の非マルチエナ耐性は near-inert のため同 STUB に honest defer。golden で strip 優先順位・正負を assert。**(d) トリガー元付与**＝2機構。**~~Group2 選択結果保持~~ ✅2026-07-22（codex実装/Claude確認・commit 4e9eedd6）で消化**＝WXK10-080/WD18-008（対象選択したシグニへの付与が parser で count:'ALL' 過剰付与）を MANUAL 再エンコードで単体化（WXK10-080＝POWER_MODIFY count:1 で対象記録→OPTIONAL_COST 跨ぎ→`targetsLastProcessed` +5000。WD18-008＝ベット時のみ GRANT_EFFECT count:1 で相手ターン限定 CONT 免疫付与）。golden で単体付与・非適用を assert。**残＝Group1 レゾナ出現条件付与（WX14-049/WXEX1-58「そのレゾナ」へ次ターン付与）は defer**＝`forResonaCondition`（parse済・`triggerCollect.ts:471` で常時 skip＝未発火）を発火させる「出現条件を支払ってルリグデッキからレゾナを出すフロー」自体が現状 engine に無く、出現レゾナをトリガーへ渡せないため機構待ち。**WXK10-080 の optional-cost 跨ぎ連鎖は §7 driver で実機検証推奨**（engine linchpin=resumeSelectTarget の lastProcessedCards 引き継ぎは確認済）。**~~(e) 動的盤面条件~~ ✅2026-07-22（codex実装/Claude確認・commit 8091d498）で消化**＝WX12-Re09（「あなたの場のシグニ3体が共通色を持たないかぎり」基本パワー15000＋このシグニ相手効果耐性）。新 activeCondition `NO_COMMON_COLOR_AMONG_FIELD_SIGNI`（場シグニちょうど3体・色集合の積集合が空・無色は `splitFieldColors` で除外）を `checkActiveCondition` に追加し、条件付き POWER_SET(15000)＋GRANT_PROTECTION(fromAll/相手/自身のみ) で MANUAL 化。既存 CONT 収集経路が activeCondition を honor するため engine 追加配線は評価器のみ。golden 正負＋過剰保護なし(size===1)を assert。**~~(f) POWER_MODIFY 免疫5件~~ ✅2026-07-22（codex実装/Claude確認・commit 28d2aa01）で消化**（WX05-024-E1/WX12-033-E3/WX20-023-LAYER/WX22-013-E1/WXK03-018-E3）＝「対戦相手の効果によってパワーは増減/＋されない」が `GRANT_PROTECTION from:['POWER_MODIFY']` に mis-parse され no-op だった。`StubAction.powerModifyProtection`（directions±/subjectOwner/subjectFilter/thisCardOnly）を新設し `calcFieldPowers` を owner/other×plus/minus の保護集合へ一般化（`applyDeltaToCard` ヘルパー経由化・保護ホストを lrig/assist/key へ拡張）。5枚を MANUAL 化（方向×スコープを厳密表現）。既存 `PREVENT_POWER_MINUS_BY_OPP`/`PREVENT_ALL_SIGNI_POWER_MINUS_BY_OPP`/`PREVENT_OPP_POWER_PLUS` は後方互換維持（`PREVENT_OPP_POWER_PLUS`＝WXDi-P14-048「シグニ」＝両盤面の両ターゲットブロックは Claude が厳密保持を補筆）。golden 5枚正負ケース追加。

- **🆕 `BANISH_REDIRECT` の target 側スコープ機構（2026-07-19・続き218b・タスク12(xliv)）**＝**前提は実装済み**：`banishDestination` は `cardMap`・除去前 state 由来の `banished` 属性・phase・effective powers を受け取り、全効果経路が `banishRedirectOpts` を配線済み。**✅(a) 属性フィルタ4件**＝`WXK10-053-E1`（level）／`WXDi-P12-073-E1`（凍結）／`WX21-005-E1`（感染）／`WX18-038-E2`（チャーム）は target.filter を除去前属性へ評価して動作し、属性一致→トラッシュ／不一致→エナを golden で lock-in 済み。**✅(b) 単体対象4件**＝`WX25-P2-060-E2`／`WXDi-P12-054-E2`／`WXDi-P15-044-E1`／`WXK06-048-E1` は `count:1` の相手シグニ選択を行い、選択番号を `banish_redirect_target_nums` にターン中保持して、そのシグニだけをトラッシュへ送る機構と manualEffects エンコードを実装済み（非選択は従来どおりエナ、ターン終了時クリア、golden 済み）。⚠**WXK06-048 のみ「－7000」と redirect が別々の count:1 選択で「それ」同一対象を保証しない軽微な近似**（本来は同一シグニ＝`targetsLastProcessed` 化が理想。実害＝2回別選択時のみ redirect が非デバフ対象に付く）。**残**＝`WX25-P3-104-E1` は選択対象に加えて「バニッシュ時点でパワー0以下」の動的ゲートが必要なため機構待ち。**(c) 正面限定3件**＝`WX19-078-E1`／`WXDi-D09-P14-E1`／`WXDi-P10-044-E2` はゾーン対応の target スコープ機構待ちで据置。パワー0全体限定と bySource は既存の別フラグを維持する。

- ~~**ガード喪失条件の engine 配線**~~ **✅2026-07-22（codex実装/Claude確認・commit bb145c3d）で消化**＝WX12-025/034/036「センタールリグが＜X＞でないかぎり、手札にあるこのシグニは【ガード】を失う」。①parser（`parseSentencePart1.ts`）が ＜X＞ をキャプチャ（条件節除去経路は cardNum 補完）し `StubAction.lrigClass` に格納（サシェ/アイヤイ/ミュウ）。②共通ヘルパー `src/screens/battle/guard.ts` の `canCardGuard(cardNum, ownerState, cardMap, effectsMap)` 新設＝Guard 列＋CONT STUB `GUARD_LOSS_UNLESS_LRIG`＋センタールリグ CardClass を照合。③分散していた `Guard === '1'` 直読み5箇所（GuardResponseDialog 候補数/isGuardable・GuardBarrierActModal・BattleScreen 追加ガード札/ガードバリア【起】）を `canCardGuard` へ統一（matchesFilter の hasGuard/noGuard は別用途で不変）。effects_WX.json 再生成は3枚 lrigClass 追加のみ（ドリフト無しを意味的 diff で確認）。golden 正負追加。CPU は独自ガード選択を持たず現状「ガードしない」ため追加変更なし。
- ~~**IS_MY_TURN誤変換系統の action層残3枚**~~ **✅2026-07-22（codex実装/Claude確認・commit f161d70f）で3枚消化**＝WXK03-039（デッキ下4ミル＝`MILLAction.fromBottom` 新設＋相手1体を retainedTarget 保持しミル→`TRASHED_DISTINCT_LEVELS_GTE:4` で保持対象バニッシュ）・WXK08-055（下カード可変トラッシュ→4段閾値 -5000/draw/-10000/黒回収）・WXK11-070（自エナ全トラッシュ→2段閾値 全回収+shuffle/ライフ追加→`EXILE_SELF_AFTER_USE`）。多段閾値は `SequenceAction.snapshotLastProcessedForConditionals`（全段を1スナップショットで評価＝後続 then の上書き非影響）＋既存 `LAST_PROCESSED_COUNT_GTE`。`INTERNAL_TRASH_UNDER_SIGNI` 複数枚一般化・`EXILE_SELF_AFTER_USE` 重複非巻き込み補強。manualEffects のみ（parser/JSON 不変更）・golden 各閾値/retained target を assert。**IS_MY_TURN誤変換の未消化サブ系統**＝公開系（`この方法で〜公開された場合`＝REVEAL 前段・WX05-013 美巧8種類/WX12-Re10/WX21-023 等）・エナ置き（`エナゾーンに置かれた場合`・WX14-069/WX15-106）・デッキ加え（WX19-040/WXK02-039/WX22-006）・単一カード公開判定（`そのカードがレベルN/＜X＞の場合`＝多数）＝census IS_MY_TURN誤変換の残53。
- **ダメージ置換系の残テール（2026-07-05・続き25）**＝(a)**WXDi-D07-007 の「防御成功ごとにルリグ【自】付与」**＝現状 log-only STUB `LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE`（シールド PND 2/1 は正実装）。「ダメージを防いだ」イベントのトリガー収集パスが要る。**（今回 defer＝防御回数カウントが深い）**。(b)**WX24-P4-006**「それより低いレベルを持つ対戦相手のシグニによってダメージを受ける場合」＝動的ダメージ源フィルタ（engine はダメージ源自体を未追跡）。**（今回 defer＝ダメージ源追跡が深い）**。**~~(c)「あなたがブーストしていた場合」条件~~ ✅2026-07-22（codex実装/Claude確認・commit 86846a17）で消化**（WX25-P1-002/006/008/010）＝ブーストは BET のエネルギー版と判明。`PlayerState.is_boosting_this_effect`＋`IS_BOOSTING` 条件（evalCondition）を新設し、ArtsModal に「ブーストする（任意追加エナ支払い）」トグルを配線（`parseBoostCost`・executeArts の boosting 引数・ターン終了/BET解決後クリア＝BET 忠実 mirror・非boost非回帰）。parser で「ブースト―《色》」プレフィクス除去＋「あなたがブーストしていた場合、X」→CONDITIONAL{IS_BOOSTING}＋「それ」照応継承。4枚を effects JSON 再生成で採用（意味的 diff で4枚のみ確認・census 1713→1711）。
- ~~**スペルの被破棄【自】トリガー2枚（2026-07-04・続き20）**~~ **✅2026-07-23（Claude確認）で機能実装済みと確定＝golden lock-in のみ追加**＝WX17-045 FLASH（「このカードが手札からトラッシュに置かれたとき、相手シグニ1体ダウン」）・WXDi-P10-070 枝折（「自ターン中に捨てられたとき+2000」）。**2026-07-04 の「トリガー収集経路が無い」は古い**：その後のタスク16[C]機構②で `detectHandTrashed`→`collectAnyZoneTrashSelfTriggers`（`fromZones:['hand']`・byOwnEffect/turnOwner 対応）が構築済みで、両E2はパーサー出力（`ON_TRASH`＋`fromZones:['hand']`／WXDi は `turnOwner:'self'`）も正しく、実データ collector で正発火を確認。**使用時の自身【自】誤発火は構造的に無い**＝スペルは `castSpell` 時点で手札→`pending_spell` へ除かれ、使用解決は pending→trash で `detectHandTrashed`（before.hand 参照）を通らないため、WX17-045 の注記「使用してもこのスペル自身の【自】は発動しない」を担保。goldenに2枚の構造固定＋collector 正負を追加（fromZones/DOWN/turnOwner・cause 非依存・エナ非発火・相手ターン非発火）。census は不変（1711・パーサー出力変更なし）。engine/parser 非変更。
- **続き20の近似・STUB テール**＝WX24-P2-049-E1b（STUB `POWER_PLUS_BANISHED_POWER`＝バニッシュしたシグニのパワー分+の動的値）・WX25-CP1-040-E1b（STUB `VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE`＝可変エナコスト→同レベルバウンス・【絆自】も未対応）・WX14-028-BURST「異なる色を持つ2枚」制約なし＋E1「緑ではない」colorExclude 未付与（色バッチで）・WX20-028-E2「アクセ3枚以上→自アクセ+相手エナ+相手全シグニをトラッシュ」の再エンコード（現状 hasAcce 相手1体トラッシュの誤形）・NEGATE_NTH_ATTACK はシグニアタックのみ（WX10-018 原文はセンタールリグも）・WXK04-015-E1b/WXK01-028 系のキー自壊コスト省略近似・WXDi-P16-092 のチーム条件（LOSE_COLOR_ALL_ZONES に activeCondition 無し＝機構censusバッチで）。

- **引用AUTO付与の精緻化（`GRANT_QUOTED_AUTO_ABILITY`）** ＝**✅一次完了（B4）**＝引用【自】/【常】能力を実発火（自場シグニ・ターン限定・parse成功時のみ）。**残**＝permanent（このゲームの間）付与・相手シグニ付与・STUB能力＝従来 log-only 据置。例: WX25-CP1-074／WXK09-055／WX24-P2-044。
- **~~「ゲームから除外」の機構待ちテール~~ ✅2026-07-23（codex実装/Claude確認）で基盤＋8枚消化**＝`PlayerState.excluded` を実ゾーン化（旧「消去」「トラッシュ再投入」近似はトラッシュ回収で再利用できる過剰側バグだった）。**(a)遅延自己除外3枚 ✅**＝`pending_exile_nums`＋STUB `MARK_SELF_DELAYED_EXILE`（実際に場へ戻った自身だけ登録）＋中央 resume 完了経路の事後付け替え＋ターン終了時（human END/confirmEndDiscard/CPU END の3経路とも**非ターンプレイヤー側にも適用**＝Claude是正）。WX16-040（トラップ発動時・PAID_ADDITIONAL_COSTゲート）／WX21-Re06（timing が ON_TURN_END 誤変換だったのを placedFromTrash any_ally へ正し、トラッシュ在中 watcher 限定走査を collectFieldTriggers に追加）／WD22-035-G（**collectTurnTriggers に相手側トラッシュの自己蘇生カード限定走査を追加**＝codex 版は収集経路が無く永久不発だったのを Claude 是正・FIELD_COUNT eq 2）。**(b)ピース除外3枚 ✅**＝EXILE target `LRIG_DECK_CARD` 新設（型+executor+選択UI scope）＋除外成功 `LAST_PROCESSED_COUNT_GTE:1` ゲート→対象適用の順序再構成（WXDi-D07-004 アサシン付与・P04-013 ガードなし3枚回収・P04-016 の**相手デッキ削り幻覚を撤去**し-12000）。**(c)使用後自己除外 ✅2枚+既存1枚実体化**＝EXILE_SELF_AFTER_USE をトラッシュ近似→excluded 化（WXK11-070 golden 更新）・PR-378（**codex の count:2 幻覚を原文「１体」へ Claude 是正・除外は「そうした場合」内側**）・SP36-001。**残**＝(c) WX17-044（トラッシュ起動＋表向きトラップ発動フロー＝§6.4 未実装で据置）。~~(d)文脈参照2枚~~ **✅2026-07-23（codex実装/Claude確認・コストゲート第2波）で消化**＝WXDi-D08-012（`OPTIONAL_COST.exceed` 実払い＋pay=EXILE/skip=BANISH を同一固定対象へ。codex の snapshot 誤用＝EXILE枝の事前消滅と skip側凍結漏れを Claude 是正）・WXDi-D09-P15（先行対象固定＋①手札3枚→BOUNCE／②`handDiscardGroups`（2枚＋ガード持ち1枚）→EXILE）。詳細 BUGFIXES 2026-07-23。
- **~~状態フィルタ脱落の残テール (a)(b)~~ ✅2026-07-23（codex実装/Claude確認）で12効果消化**＝**投入前実測で2026-07-04の記述は大幅に古いと判明**（`THIS_CARD_IS_UP`/`CENTER_LRIG_IS_UP`/`down_self`/`lrigDown` は既存で大半のカードは正しく、真のバグは別形状だった）。**(a)追加ダウンコスト ✅**＝「アップ状態の[絞込]シグニN体をダウンする」を**既存 `fieldDown` の regex 拡張**（「＜A＞か＜B＞の」story OR・「(色)の」）で表現（⚠codex は並行語彙 `signiDown` を新設し WXDi-P14-040 が二重コスト化＝Claude 検証で撤去・一本化）。WX14-055・WXK11-056-E2/E3 消化（WXK10-023/P12-049/P13-053/P14-043/P14-049 の lrigDown 系は実測で既に正しかった）。**(b)条件系 ✅**＝WXDi-P04-036-E1（新 activeCondition `LRIG_DECK_COUNT`）・E2（`OPTIONAL_COST.handDiscard` 実支払い新設＝手札N枚捨ての PAID ゲート・`STORE_LAST_PROCESSED_TARGETS`→`fixedCardNums` 凍結で支払い跨ぎ対象保持）・WXK08-034（新 condition `ALL_SELF_SIGNI_DOWN`＋白実払いゲート）・WXDi-P02-038-E1/E2（`colorNotMatchesOppLrig` 動的filter＋既存 `ENERGY_TRASHED_BY_OPP` owner:opponent）・WXDi-P14-043-E2（powerLteSelf＋手札2枚実払い）・**トリガー主語是正**＝WX15-055/056（`banishedFrontOfSelf` 対面2-zi判定を collectBanishTriggers 両側ループへ＋duringAttackPhase＋turnOwner:'self'＝Claude補筆＋THIS_CARD_IS_UP）・WX18-052（any_ally＋story OR triggerFilter＋`duringMainPhase`）。WXDi-CP01-045/WX25-P2-048 等は実測で既に正しく不変。**defer**＝WX24-P2-069-E1（ダウンしたルリグとの共通色をコスト→効果参照で渡す機構）・WXDi-P13-053-E1（「メインフェイズ以外」フェイズ限定）・【ハーモニー】本体。**残**＝(c)**CONT REMOVE_ABILITIES**（WXEX1-02-E1＝count:1・filter無しで「凍結シグニは【常】【自】を失う」＝全frozen＋能力種別限定）。(d)WXDi-P02-065-E1（count:2 vs 原文「1体」＋「≥2存在」条件欠落）・WXDi-P01-003（アーツ本体欠落）・WX09-016（ダウン状態シグニへの GRANT_PROTECTION）・CHOOSE/入替系（WX24-P2-087/WXDi-P08-037）。詳細 BUGFIXES 2026-07-23。
- **GRANT_LRIG_ABILITY の低品質展開4枚（2026-07-04・MANUAL化で no-op 据置。⚠2026-07-23 コストゲート第2波で PR-204/WD21-009/PR-238 に着手したが codex 見送り＝残ブロッカーはアーツ名履歴（turn_arts_used_names 未実装）・ルリグ下任意枚数選択・数字2つ宣言・トリクラ付与・×5比例ミル。OPTIONAL_COST 実払い/PAID/多段閾値の下地は揃った）**＝WX15-016（付与【自】の「この方法で置いたカードが《バーストアイコン》を持つ場合アタック無効」＝条件が IS_MY_TURN に誤約・相手ターントリガーで恒久false）／WD21-009（ルリグ下N枚→2/4/5枚の多段閾値＝平坦化すると無条件ガード封じ+トリクラの過剰発火）／PR-204（「カード2枚をルリグトラッシュに置いてもよい。そうした場合アップ」＝支払いゲート脱落で毎アタック無償ルリグアップ＝無限アタック）／PR-238（置いた枚数×5の比例ミル）。共通で「optional支払い→そうした場合」のコストゲート機構＋多段閾値が要る。SPDi43-03/11/12/13・WXK11-052 の「ターン終了時までこのルリグは『【自】…アップ』を得る」も同根（現状は即時 UP LRIG の平坦化近似＝§7の実機検証対象外）。
- **BURST内「そうした場合/〜の場合」の要新語彙テール7枚（2026-07-04・続き19・TRASH前段32偽陽性と易3枚是正後の残）**＝(a)~~LAST_PROCESSED フィルタ条件: WXEX1-43-BURST・WXEX1-36-BURST~~ **✅続き24で是正**（`LAST_PROCESSED_MATCHES{filter}` 新設・heldReview採用）。(b)**then内容欠落**: WD23-023-E-BURST（「デッキから1枚探してライフクロスに加えシャッフル」→SHUFFLE のみ＝SEARCH の then ADD_TO_LIFE 対応要）。(c)**任意化**: WX14-026-BURST（「クラッシュしてもよい」→強制 LIFE_CRASH）＝optional crash＋conditional ゲート。(d)**コストと対象の参照逆転**: ~~WX16-033-BURST~~ **✅2026-07-23（codex実装/Claude確認・コストゲート第2波）**＝STORE→自シグニBANISH→`LAST_PROCESSED_COUNT_GTE`ゲート→TRASH{targetsStored}（`storedTargetCards` の pause 跨ぎ永続化＝`PendingEffect` 配線を Claude 補筆）。**残**＝WX17-041-BURST（自トラップ回収がコスト＝トラップ1つを手札に戻す実装が未・codex見送り）。(e)**源違い**: WX19-Re10-BURST（「手札1枚をライフクロスに加える」→fromTop＝デッキから）＝ADD_TO_LIFE の from hand 対応要。
- ~~**resume 経路の inline collector 欠落（続き58・§7 R43/R46 実機検証で発見）**~~ **✅続き61（Opus）で根本修正**＝`collectBoardDiffTriggers` へ統合し、`resolveStackNext` の `result.done` 分岐でトリガー収集が落ちる系統（R36/R39/R43/R46）を一括解消。原因分析・対照実験の記録は [PLAN_DETAIL.md](./PLAN_DETAIL.md) §6・BUGFIXES 続き58/61。
- ~~**「対戦相手のシグニが場を離れたとき」トリガー（3枚・behavior-audit 段階4で発見・2026-07-03）**~~ **✅2026-07-21（続き233・Opus）で消化**＝跨サイド `any_opp` watcher 収集は続き218b の機構③（`collectLeaveFieldTriggers` の相手フィールド走査）で既に存在していたので、①parser に「対戦相手の[凍結状態の]シグニが[効果によって]場を離れたとき」→`any_opp`＋`byEffect`/`leftStateFilter{isFrozen}` 抽出を追加、②凍結状態は離脱**直前**の盤面が要るので `collectLeaveFieldTriggers` に離脱直前 state スナップショット（`leftBeforeState`/`leftZoneIdx`＝`detectLeftFieldSigni` が zoneIdx を返し中央diff呼び出し元が before-state を渡す・`matchesStateFilter` で評価）を配線、③engine の any_opp/any_ally 分岐に `byEffect`（任意効果起因）＋`leftStateFilter` ゲートを追加。**WXEX1-30-E2**（凍結相手シグニ離脱でバウンス）／**WXK11-017-E1**（効果離脱でエナチャージ・自ターン限定）／**WXDi-P03-040-E1**（凍結相手シグニ離脱でデッキトップを下へ）を self 誤発火から any_opp 正発火へ（build:effects 純改善自動採用）。golden に3アサート追加（byEffect/turnOwner/leftStateFilter/before-state無しの各ゲート）。⚠**バトル離脱経路は before-state 未渡しのため凍結フィルタ付き効果は保守的に非発火**（過剰発火より偽陰性を選ぶ・WXEX1-30-E1 の凍結→トラッシュ置換 STUB 未実装と整合）。詳細 BUGFIXES 続き233。
- ~~「このターンにあなたがアーツを使用していた場合」条件~~ **✅実装済（2026-07-03・続き13後半）**＝`ARTS_USED_THIS_TURN`＋`turn_arts_used` 機構で11枚全是正。**✅続き116（Sonnet）で実機PASS確認（2回連続）**＝`verifyBattleDrive.mjs artsUsedThisTurnGate`（WX25-P1-095）＝`turn_arts_used:true`注入→アタック時に条件評価→エナチャージ1が正しく発火（hEnergy 0→1）を確認。既定orderに追加。~~WX25-P1-106 BURST のダメージ置換近似~~ **✅続き25で REPLACE_NEXT_DAMAGE_WITH_MILL に正エンコード**。
- **自パワー閾値条件の残テール（2026-07-03発見・素直な21枚は是正済）**＝(a)「代わりに」昇格型：WXDi-P01-054（【起】バニッシュの昇格）／WXDi-P12-067（被バニ反応の昇格）。(b)多段閾値型：~~WXDi-D01-016（15000/20000）~~ **✅2026-07-23（codex実装/Claude確認）**＝20000先評価→else 15000 の相互排他 CONDITIONAL（従来は 15000ゲート後に無条件blind捨てが常時実行＝二重ハンデス実バグ）。**残**＝PR-470A（10000/25000＝25000段の「自身をルリグデッキへ戻し指定レゾナを場に出す」機構が未・codex見送り）。(c)【起】の自パワー条件：WXDi-P03-062（起動時 evalUseCondition 配線の確認要）。
- **WXDi-P05-006＝2択構造ごと崩壊**＝ピース打ち消し（カットイン使用＋対象ピース効果打ち消し＋除外）機構が無く、①②の択も脱落（現 curated は GRANT_KEYWORD 使用条件＋UNKNOWN の残骸）。ピース打ち消し機構待ち。
- `ON_CARD_MILLED_FROM_DECK` の収集機構（WX25-P2-009-E2＝現 `【※engine未配線】`）。
- リフレッシュ置換の実体（WX25-P2-009-E1＝現 no-op STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`）。
- 「他＜毒牙＞のシグニ効果で相手パワーが減ったとき」トリガー（WX25-P3-062-E1＝現 STUB `POWER_COPY_FROM_DOWNED`）。
- **ビートの残（低優先）**: トラッシュ→beat（WDK14-013）のプレイヤー選択ピッカーのみ自動近似。
- **G072 残6枚**（条件前置き付きの相手シグニ被バニッシュ反応）: WX05-040/WX11-027（「メインフェイズの間」）／WXEX2-23（「アタックフェイズの間」）／WXK11-055（「あなたの効果によって」）／WX13-051（「＜龍獣＞効果で」）／WXDi-P11-TK05（【チャーム】付き相手シグニ）。前置きモデリングの誤りリスク高く個別対応。
- **multi-dest pick（look→手札＋場の二目的）**: WX24-P1-017／WX24-P1-026／WX25-P3-038／WX25-CP1-025／WX26-CP1-019。付与/条件/絆を伴う同時pickは別語彙が要る。
- ~~**REVEAL_AND_PICK remainder の shuffle 保持（機構待ち）**~~ **✅2026-07-21（続き233・Opus）で消化**＝`RevealAndPickAction['remainder']`／pending の `revealRemainder` に `shuffle?` を追加し、engine の remainder 適用2経路（`revealRemainder` 消費・pickable空の早期経路）で `shuffle` 時に置く前に順序をランダム化。parser（effectParser.ts の「カード名に《X》を含むシグニ…残りをシャッフルして…」1文型）で `shuffle:true` を抽出。PR-370-E2「残りをシャッフルしてデッキの一番下に置く」を正エンコード。
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
