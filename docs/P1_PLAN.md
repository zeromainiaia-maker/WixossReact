# P1 プラン：表現完成（3人・バトン式の順番開発）

> 目的＝**全効果カードで「逆翻訳が原文一致」かつ「同型★=0」**にし、残る大型機構を実装し切る。
> 3人は**同時に作業せず、順番に push / pull で引き継ぐ**（バトン式）。このファイルは全員が同じ方針・同じ品質ゲートで続けるための共有ルール。
> 新セッション（cold start）は **まず本ファイル §3 → `TODO.md`先頭 → `DESIGN.md`** の順に読む。

---

## 0. 全体像（3フェーズ）— P1はこのうち①だけ

| 層 | 内容 | 検証手段 | 本プランの対象 |
|---|---|---|---|
| **① 表現** | JSON がカード原文を正しく**表現**する | 逆翻訳一致／同型★0 | **★P1=ここ** |
| ② 実行 | エンジンが各DSL構文を正しく**実行** | 構文ごとの smoke テスト | P2（別途） |
| ③ 挙動 | 実ゲームで各カードがルールどおり動く | 実機/自動対戦テスト | P3（別途） |

**注意**：①の「逆翻訳一致」は “JSONがテキストを表す” ことのみ保証。実機での正しさ(③)は別。各コミットは**「要実機検証」**を付す。

## 1. Definition of Done（P1完了条件）
- [x] 全シートで **同型★ = 0**（`docs/grouped_all.txt`・`node scripts/groupSimilar.mjs --all` で再生成）。**達成・維持中**。
- [x] 「⚠脱落疑い」リストの各カードが、**偽陽性**／**修正済**／**機構待ち（理由明記）** のいずれかに分類済み。**✅2026-06-28＝255枚を全分類**（偽陽性179／機構待ち72／修正済）。`node scripts/_dropTriage.mjs`・明細 `docs/_drop_triage.txt`。
- [x] 残る大型機構（§5）が実装＋配線済み、または明確にスコープ外と合意。**✅2026-06-28＝§5 B機構を全完了**（B1トラップ表現／B2動的閾値／B3遅延条件トリガー／B4引用付与実発火）。残るは **C（engine 実機配線・全 R5-R58 と B1-B4 は要実機検証）＝P2 スコープ**。⚠表現①としてのP1は完了、実行②/挙動③検証は P2/P3。
- ⚠ **「脱落疑いの件数」は完了指標にしない**（§2）。

## 2. 不変の運用ルール（全員必須）
- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的＝絶対に実行しない。** JSONは直接パッチ。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。語彙が無ければ §5 の機構として実装する。
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（Git Bash 経由の `node -e` は文字化けする）。papaparse 等が要るカード参照スクリプトは project root に一時 `.ts/.mjs` を置いて `npx tsx`/`node` 実行・終わったら削除。
- **件数メトリクスを信じない**：「脱落疑いNN枚」は「。区切り文数」比較で粗く、逆翻訳器は複数効果を1行(、／そして)に圧縮するため**内容を直しても件数は減らない**。判断は必ず **同型★0＋該当カードの逆翻訳が原文一致** で行う。
- **偽陽性は直さない**（§4）。
- **ゲートは `npm run typecheck`（＝`tsc -b --noEmit`）**。plain `tsc --noEmit` は project references を見ず CI が拾うエラーを見逃すので不可。

## 3. 現在地と今後の計画（バトン）
> 3人は**同時に作業しない**。**① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push** を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最終更新 2026-06-28）
- **P1 表現①の systematic 指標は全達成・維持中**：**held 0 / LOSS 0 / VALUE 0 / 同型★0**。
  - 再生成・検証＝`npx tsx scripts/parserWorklist.ts`（held/LOSS/VALUE）＋`node scripts/groupSimilar.mjs --all`（同型★）。
- **脱落疑い 255枚を全分類済み**（DoD §1 第2項クリア・`node scripts/_dropTriage.mjs`）：偽陽性179／機構待ち72／修正済。
- **timing flatten**（当初159枚の「ON_TURN_END に潰れて付与即失効＝no-op の実バグ」）は R5-R58 で**完了＝VALUE 0**。
- **母数**：効果カード 5975／効果 10549／MANUAL効果 733／STUB含むカード 1820。
- 直近：**A3 クローズ**＋**§5 B機構を全完了（B1-B4）**。B1＝トラップ機構（engineは既存の `signi_traps` ゾーン。decompilerで9系統トラップSTUBを原文【トラップ】語彙描画＝生STUB残0）。B2＝動的閾値（WX17-028）。B3＝遅延条件トリガー。B4＝引用付与の実発火。**残るP1機構＝C（engine実機配線・P2）のみ**。同型★0（5986枚）。**decompile再生成は Bash の `>` を使う（PowerShell `>` は UTF-16 で下流破壊）。**

### 🔜 今後の計画と必要作業数
> P1 の機械指標は 0。残るのは **(A) 表現の長いテール（個別）** と **(B) 新機構** と **(C) engine 実機配線（P2/P3）**。bulk 再生成は引き続き禁止。1機構/1パターンずつ §6 のゲートで。

**A. 表現の残（decompiler/parser・低〜中リスク・個別）**
- ~~**A1**　GRANT_QUOTED「…は以下の能力を得る。『…』」**後置型**の decompiler 対応~~ **✅完了（2026-06-28）**＝対象は2枚（WXDi-D04-011/WX24-P3-003）のみで両方とも引用能力を描画。※両者は周辺に別の誤パースSTUB（条件付きパワーボーナス/リミット修正）が残る＝A3/別件。
- ~~**A2**　`GRANT_QUOTED_AUTO_ABILITY` の**誤パース是正**~~ **✅完了（2026-06-28・引用無しGQ残0）**＝引用無しGQ13枚（TK03A除く）を全是正。9枚（optional-cost 句）を `OPTIONAL_COST` 規約に置換、残4枚（WD13-002 グロウ軽減／WXDi-P09-079 ミル場出し／WXDi-P10-041 下カードコスト／WX25-CP1-060 ON_TARGETED裏返し＋絆常+5000をE3分離）を記述的STUB＋既存アクションで個別是正。TK03A（本物の付与）は decompiler subject を「これ…は『…』を得る」に拡張。全て MANUAL・同型★0維持。⚠各カードの細部（条件/フィルタ）は一部近似。
- **A3**　各カードの timing/result 近似の是正。**✅完了＝A3クローズ（2026-06-28）**＝A2修正カードの timing 6枚（ON_ACCE_ATTACH/ON_SIGNI_BANISH_OPPONENT/placedFront/ON_SIGNI_BANISH_BATTLE/any_opp/placedFromTrash）＋result 3枚（TRASH是正）＋`PLACE_UNDER_SIGNI` 描画バグ修正。~~WXDi-P11-032 アサシン/ランサー/常 の3択 GRANT~~ **✅完了（2026-06-28）**＝CHOOSE(3)＝GRANT_KEYWORD アサシン/ランサー/アタックできない に復元（MANUAL・同型★0）。~~WXDi-CP02-074/089 の別timing 1効果脱落~~ **✅完了（2026-06-28）**＝先頭【自】を復元し原文順に並べ替え（074=ターン終了時reveal→ブルアカでdraw／089=エナトラッシュ→引用ランサー付与）。~~その他 OPTIONAL_COST 句の具体コスト~~ **✅完了（2026-06-28）＝A3クローズ**＝`StubAction.costText` 追加＋抽出パッチで bare OPTIONAL_COST 80→22枚（58枚を原文コスト句で是正・MANUAL）。残22枚は A3具体コスト対象外＝別系統（誤パース13／替コスト・F-3 2／複数択複合4／動的閾値1／引用内コスト1／ルール注記偽陽性1）に分類済み。decompileシートも UTF-8 正規化（真のカード数5986・同型★0）。**⚠decompile再生成は Bash の `>`（UTF-8）で行う。PowerShell `>` は UTF-16 を書き下流を壊すので禁止。**

**B. 機構待ち（新語彙/機構が要る・中リスク・§5表）＝✅全4機構完了（B1-B4・2026-06-28）**
- ~~**B1**　`SET_TRAP` 設置アクション~~ **✅完了（2026-06-28）**＝engine は既存（`signi_traps` ゾーン）。decompiler で9系統トラップSTUBを原文【トラップ】語彙描画（生STUB残0）。**§5 のB機構は全完了**。
- ~~**B2**　動的閾値フィルタ（WX17-028「公開したシグニのレベル合計×1000以下」）~~ **✅完了（2026-06-28）**＝`REVEAL_DECK_TOP`/`TRASH_REVEALED`/`powerLteRevealedSigniLevelSum` 新設。残B＝B1/B4。
- ~~**B3**　遅延条件トリガー（WX25-CP1-069「このターン、…クラッシュしたとき」）~~ **✅完了（2026-06-28）**＝`INSTALL_DELAYED_TRIGGER` 機構新設。残B＝B1/B2/B4。
- **B4**　`GRANT_QUOTED_AUTO_ABILITY` の engine 精緻化。**✅一次完了（2026-06-28）**＝引用【自】/【常】能力を `parseCardEffects` 経由で granted_effects に積み実発火（自場シグニ・ターン限定・parse成功時のみ）。残＝permanent（このゲームの間）/相手付与/STUB能力＝従来 log-only 据置（要追加実装・実機検証）。

**C. engine 実機配線（P2・高リスク・要テスト環境）＝最大の残**
- **C1**　**engine未配線 timing 群の発火配線**＝R33-R58 で新設した ~15種。一覧＝`scripts/decompileEffects.ts` の `engineUnwiredTimings`。
  - ~~`ON_TARGETED`（14枚）~~ **✅配線済(claude・2026-06-29)**＝`BattleScreen.handleEffectInteraction` の SELECT_TARGET 確定経路で `collectTargetedTriggers` が発火（人間/CPU 双方カバー・BUGFIXES参照）。⚠実機未検証(C2)・forced単一対象経路は未カバー(follow-up)。
  - 残＝`ON_LRIG_GROW`(5)/`ON_MATERIAL_USED`(6)/`ON_COIN_PAID`(3)/`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`(1)/`ON_ALLY_PLAY_OR_OPP_HAND_DISCARD`(1)/`ON_LRIG_UNDER_MOVED`(1)/`ON_KEYWORD_GAINED`(1)/`ON_DECK_SHUFFLED`(1)/`ON_LRIG_ATTACK_STEP_START`(1)。
- **C2**　**R5-R58 の全 engine 配線＋C1 ON_TARGETED が実機未検証** → PvP/CPU 実機検証（ヘッドレス不可・`/verify` または手動）。

**D. STUB テール（低優先）**
- STUB 544種/2372件。大半は**実装済みハンドラ**の表示（`[STUB:id]` はスキップ理由にしない＝個別検証）。残・単発生IDテール 54件は `STUBS.md` 管理（`node scripts/genStubsMd.mjs` で再生成）。

### 📌 次の一手（推奨順）
1. **A1**（後置型 付与引用の decompiler 対応）＝低リスク・表現の純改善。
2. **A2/A3**（個別 parser 是正・数枚）。
3. **B（§5 機構）** か **C（engine 配線）**＝規模・リスク大。着手前に §5 表の「状態」を `着手中(担当名)` に更新してコミット（重複防止）。

### 共有ファイルの扱い
- `BUGFIXES.md`：**新しいものを上に**追記（誰がやったか分かるよう日付/系統名を見出しに）。
- `src/`（型・engine・decompiler）は**機構実装時のみ**。着手前に §5 の状態を `着手中(名前)` にして push（次の人が同じ機構に手を付けないため）。

## 4. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外
1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。
2. **CHOOSE/チェインの1文圧縮**＝択肢が逆翻訳に全部出ていれば正しい。
3. **REVEAL_AND_PICK / LOOK_AND_REORDER の文法崩れ**（語順が変でも機能は正常・R14/R28 で着手禁止確定の最大クラスタ）。
4. **ルール注記**（「（コストのない【出】能力は発動しないことを選べない）」等）＝効果ではない。
5. **アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
6. **BET_MECHANIC STUB**＝別タスク。
7. **owner:any の一括変換**は禁止（POWER_MODIFY/BANISH の `owner:'any'` は大半が正当）。

## 5. 残・大型機構（§D：1人1機構オーナー制）
着手前に**この表の「状態」を `着手中(担当名)` に更新してコミット**（重複防止）。実装の型は `TODO.md §4`「機構実装の型」に従う。

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| 引用AUTO付与（`GRANT_QUOTED_AUTO_ABILITY`） | 中 | 中 | **表現完了＋engine精緻化(B4)着手済(claude・2026-06-28)**＝GRANT_QUOTED フォールバックで引用【自】/【常】能力を `parseCardEffects` で CardEffect 化し granted_effects に積み**実発火**（自場シグニ・ターン限定・parse成功時のみ。permanent/相手付与/STUB能力は従来 log-only 据置＝安全側）。残＝permanent/相手付与対応・誤パース是正（A2・約30枚は原文に引用無し parser 案件）。⚠要実機検証 |
| ~~`SET_TRAP` 設置アクション~~ | 中（トラップ設置型 ~30枚） | 中 | **✅完了(claude・2026-06-28)**＝engine は既に実装済み（`signi_traps` ゾーン＋execStubPart2 の PLACE_TRAP_*/ACTIVATE_TRAP/TRAP_TO_HAND/SET_OPP_SIGNI_AS_TRAP/TRAP_TO_SIGNI_IF_ZONE_EMPTY 等）。**B1の課題は逆翻訳（decompiler）**＝9系統のトラップSTUBを raw `[STUB:id]`→原文の【トラップ】語彙で描画（原文クラスタ抽出＋canonical）。生STUB残0・同型★0。⚠TRAP_OP/TRAP_OPERATION は多段近似（一部 そうした場合 重複） |
| ~~動的閾値フィルタ（公開レベル合計×N 以下 等）~~ | 小（WX17-028 等） | 中 | **✅完了(claude・2026-06-28)**＝`REVEAL_DECK_TOP`＋`TRASH_REVEALED` アクション＋動的閾値フィルタ `powerLteRevealedSigniLevelSum`（resolveDynamicFilter で powerRange.max に解決）を新設。WX17-028 の脱落【出】を復元＋劣化E1是正。原文一致・同型★0 |
| ~~遅延条件トリガー（「このターン、…したとき」）~~ | 小（WX25-CP1-069 等） | 中 | **✅完了(claude・2026-06-28)**＝`INSTALL_DELAYED_TRIGGER` 機構を新設（型＋PlayerState.delayed_triggers＋executor＋ON_OPP_LIFE_CRASHED収集＋ターン境界リセット3箇所＋decompiler）。WX25-CP1-069 を配線・原文一致・同型★0。⚠crasherFilter は「場に該当シグニがいるか」で近似＝要実機検証 |
| engine未配線 timing 群の実機配線 | 大（~15 timing・R33-R58） | 高 | **着手中(claude・2026-06-29)＝C1**。`ON_TARGETED`（14枚）から配線開始。残一覧は `engineUnwiredTimings`。⚠要実機検証 |
| ~~《相手ターン》/《自分ターン》AUTOトリガー基盤~~ | — | — | **実装済**（機構④・BUGFIXES参照） |
| ~~【ビート】機構（Phase1-7）~~ | 44枚 | — | **完了**（BUGFIXES参照）。残はトラッシュ版選択ピッカーのみ（低優先） |
| ~~傀儡場出しの汎用化~~ / ~~`levelLteLastProcessed`~~ | — | — | **実装済**（BUGFIXES参照） |

- 実装済み機構の履歴：コスト増加(①)・ライフクラッシュ履歴(②)・LOOK_PICK_CHAIN field宛先(③)・リコレクト系統 は `BUGFIXES.md` 参照。

## 6. 標準ワークフロー（1ラウンド＝横展開）
1. **抽出**：全シート走査で「同じ壊れ方」を機械抽出（`scratchpad` の `scan*.mjs` が雛形）。
2. **分類**：偽陽性(§4)・既知複雑札を除外し、**クリーンな系統**を確定。
3. **パッチ**：`effectId` をアンカーにした一括スクリプトで安全に置換（他カードを巻き込まない）。MANUAL 化する場合は `parseStatus:'MANUAL'`。
4. **検証ゲート（必須・この順）**：
   - **`npm run typecheck`（＝`tsc -b --noEmit`）** ← CIと同じ。
   - 該当シート再生成：`npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt`（**⚠Bash で実行。PowerShell の `>` は UTF-16LE を書き genReviewRepr 等の utf-8 読みを壊す。シートは1〜10のみ＝Sheet11は存在しない**）
   - 下流再生成：`node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all`
   - **逆翻訳が原文一致 ＆ 同型★0** を確認（必要に応じ `node scripts/_dropTriage.mjs` で分類の変化も確認）。
5. **記録＆バトン**：`BUGFIXES.md` に追記（新しいものを上）→ **§3 を上書き** → コミット（末尾に「要実機検証」）→ **push**。

## 7. 進捗の可視化（整備済み）
- **`npm run smoke`（`scripts/smokeTest.ts`）＝②実行スモーク／不変条件ハーネス（2026-06-28新設）**。全カードの全効果（10557件）を**オートパイロット**（pending を最小入力で自動応答）でヘッドレス実行し、例外（CRASH）／無限ループ（HANG・step>STEP_CAP=200）／構造不変条件違反（INVARIANT）を機械検出。実機不要・数秒。**現状＝CRASH 0／HANG 0／INVARIANT 0／OK 10294／SKIP 263**（SKIP＝autopilot未対応の対話＝engine バグではない）。⚠「壊れない」を保証するもので「ルール的に正しい結果か（③）」は判定しない＝③は構文ゴールデン＋代表目視で別途。C（engine配線）/D（STUB実装）の回帰検出にこれを使う。
  - **autopilot ループ判定の修正（2026-06-29）**：旧判定は「同一pending**種別**が連続したら SKIP」だったため、SELECT_TARGET が連続するだけで候補が毎回変わる正常進行も誤SKIPしていた。**候補シグネチャ（type＋candidates/options/cards のJSON）が同一**のときだけ真のループとみなす方式に変更（`cd1edf23`）。STEP_CAP も 60→200 に拡大（`c796aa3d`）。
- **`npm run golden`（`scripts/goldenTest.ts`）＝③正しさの構文ゴールデンテスト（2026-06-29 npm登録）**。主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」を assert（型単位で正しさを担保＝全カードを帰納的に信頼）。**現状＝PASS 21／FAIL 0**。smoke が「壊れないか」を全カードで見るのに対し、本テストは型ごとの「正しさ」を見る。C/D 作業時は smoke と併せて回す。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。残り作業の性質が一目で分かる。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUE の health 計器（現在すべて 0）。回帰検出に使う。
- **`npx tsx scripts/_flattenList.ts`**＝timing flatten の EXIST/FRESH 差分（現在 0 枚）。

---
**関連**：`DESIGN.md`（設計方針）／`TODO.md`（残作業・引き継ぎ）／`BUGFIXES.md`（修正記録）／`effects-json-guide.md`（語彙）。
