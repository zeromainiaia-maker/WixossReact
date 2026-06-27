# P1 プラン：表現完成（3人・バトン式の順番開発）

> 目的＝**全効果カードで「逆翻訳が原文一致」かつ「同型★=0」**にし、残る大型機構を実装し切る。
> 3人は**同時に作業せず、順番に push / pull で引き継ぐ**（バトン式）。このファイルは全員が同じ方針・同じ品質ゲートで続けるための共有ルール。
> 新セッション（cold start）は **まず本ファイル → `TODO.md`先頭 → `DESIGN.md`** の順に読む。

---

## 0. 全体像（3フェーズ）— P1はこのうち①だけ

| 層 | 内容 | 検証手段 | 本プランの対象 |
|---|---|---|---|
| **① 表現** | JSON がカード原文を正しく**表現**する | 逆翻訳一致／同型★0 | **★P1=ここ** |
| ② 実行 | エンジンが各DSL構文を正しく**実行** | 構文ごとの smoke テスト | P2（別途） |
| ③ 挙動 | 実ゲームで各カードがルールどおり動く | 実機/自動対戦テスト | P3（別途） |

**注意**：①の「逆翻訳一致」は “JSONがテキストを表す” ことのみ保証。実機での正しさ(③)は別。各コミットは**「要実機検証」**を付す。

## 1. Definition of Done（P1完了条件）
- [ ] 全シートで **同型★ = 0**（`docs/grouped_all.txt`）。
- [ ] 「⚠脱落疑い」リストの各カードが、**偽陽性**／**修正済**／**機構待ち（理由明記）** のいずれかに分類済み。
- [ ] 残る大型機構（§5）が実装＋配線済み、または明確にスコープ外と合意。
- ⚠ **「脱落疑いの件数」は完了指標にしない**（後述）。

## 2. 不変の運用ルール（全員必須）
- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的＝絶対に実行しない。** JSONは直接パッチ。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。語彙が無ければ §5 の機構として実装する。
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（Git Bash 経由の `node -e` は文字化けする）。
- **件数メトリクスを信じない**：「脱落疑いNN枚」は「。区切り文数」比較で粗く、逆翻訳器は複数効果を1行(、／そして)に圧縮するため**内容を直しても件数は減らない**。判断は必ず **同型★0＋該当カードの逆翻訳が原文一致** で行う。
- **偽陽性は直さない**（§4）。

## 3. 進め方＝バトン式（順番に push / pull）
3人は**同時に作業しない**。**① `git pull` → ② 下の「現在地（バトン）」を読む → ③ そこから作業 → ④ バトンを更新 → ⑤ commit & push** を回す。衝突は起きないので担当ファイル分けは不要。**唯一の約束＝push前にバトンを最新化すること**（次の人が迷わず続けられるように）。

### 📍 現在地（バトン）— 次の人はここから
> **push する人は、このブロックを上書きしてから push する。** 詳細な修正履歴は `BUGFIXES.md`（新しい順）に積むので、ここは**短く・次の一手だけ**。

- **最終更新**: 2026-06-27（karka → **次の人へ**）
- **🧭 パーサー作業の地盤＝`docs/parser_worklist.md`（cold start はまずこれ）**: held 404 を **LOSS 255（真の弱点＝直す）／ VALUE 149（慣例・対象外）** に重複なく分割した有限ワークリスト。計器 `npx tsx scripts/parserWorklist.ts` で数字を再生成。**完了条件＝LOSS 255→0**。手当たり次第をやめ、バケツ単位（Stage A 局所67→C トリガー73→B action.type中心109）で潰す。各ラウンドで計器の LOSS 減＋同型★0 をゲートにする。
- **直近やったこと（karka・最新6）**: **Stage A R1（filter.cardType・crossState条件）**。「場にクロス状態のシグニがある」を COND_STUB→HAS_CARD_IN_FIELD 正規化（engine実装済み・JSON無変更）。計器で **filter.cardType 30→16・LOSS 255→241・held 404→394**。同型★0維持。次は filter.cardType 残16（WX04-016 等の「＜X＞と＜Y＞のシグニ」複数種族 と filter.color 11 等の Stage A 局所）。
- **直近やったこと（karka・最新5）**: **定量計画の地盤を整備**。`scripts/parserWorklist.ts`＋`docs/parser_worklist.md` を新設＝held を LOSS/VALUE に分割しランク化（終わりが見える化）。手当たり次第の修正を卒業。
- **直近やったこと（karka・最新4）**: **「あなたのレゾナのパワーを±N」のtarget脱落是正＋isResona完全撤去**。`parseSentencePart1.ts` のPOWER_MODIFY分岐が「シグニ」限定でレゾナを拾えずデフォルト(any/1/filter無)に落ちていたのを、レゾナ専用分岐 `{owner:'self',count:'ALL',filter:{cardType:'レゾナ'}}` で是正（WX07-007/WX08-019）。既存JSON最後のisResona2箇所をcardType:'レゾナ'へ移行＝**isResona撤去完了（残0）**・レゾナ表現はcardType一本化。typecheck緑・同型★0・要実機検証。→ `BUGFIXES.md` 先頭。**レゾナ系は一段落**。次は `docs/parser_backlog.md` 優先1（filter.cardType脱落98＝最大・名詞句限定で要設計）／upToCount27 等。**⚠duration「次の対戦相手のターン終了時まで」は調査済み＝145枚波及の慣例問題で着手しない**（parser_backlog の「調査してクリーンでないと判断」節参照）。
- **直近やったこと（karka・最新3）**: **自身の基本レベルSET_BASE_LEVEL化＋レゾナ存在条件のdecompile退化を是正**。①「このシグニの基本レベルはNになる」を `parseSentencePart1.ts` で `SET_BASE_LEVEL`（until:END_OF_TURN・engine実行可）として出力（旧 BLOCK_ACTION/SET_LEVEL_N は no-op divergence）。対象指定の他シグニ版は engine 未対応で BLOCK_ACTION 近似据置。②`decompileEffects.ts` が `filter.cardType:'レゾナ'`（多数派正準形）をレゾナと認識せず「シグニ」と退化していた隠れバグを是正（WX08-033等6枚）＋WX10-056/058 の死にキー `isResona` を JSON 除去し cardType 統一。typecheck緑・同型★0・8枚原文一致・要実機検証。→ `BUGFIXES.md` 先頭。**次のレゾナ系候補**: WX07-007/WX08-019「あなたのレゾナのパワーを＋N」＝target に cardType:'レゾナ' filter を付け損ね（filter.isResona held・別の名詞句限定パーサー要）。
- **直近やったこと（karka・最新2）**: **パーサー: 【自】ON_BANISH「(対戦相手|あなた)のターンの間、…バニッシュされたとき」のactiveCondition脱落を是正**。AUTO経路に前置き検出＋`forcedActiveCondition=TURN_OWNER`（従来は【常】G150のみ・素の【自】版は脱落）。engine配線済み（BattleScreen `collectBanishTriggers` が ON_BANISH 自己トリガーで activeCondition 評価）＝新規engine作業なし。**収穫マージで純改善12枚採用**（WXK04-065/067 等・全て原文に「ターンの間」あり）。held 409→408・typecheck緑・同型★0維持・逆翻訳一致。**要実機検証**。→ `BUGFIXES.md` 先頭。**次のパーサー候補は `docs/parser_backlog.md` 優先1（filter.cardType脱落98・最大）／activeCondition残（WXK04-080「【アクセ】が付いているかぎり」・WX10-056/058 isResona等）**。
- **直近やったこと（karka・最新）**: **`build:effects` を非破壊化（収穫マージ）＋パーサー3修正**。ブランチ `fix/parser-harvest-merge`（未マージ・要レビュー/実機検証）。**重要な前提変更**：従来「effects_*.json は手動・build:effects 禁止」だったが、`buildEffectsJson.ts` を **richness ガード付き収穫マージ**化（既存の全リーフ値を保持したまま情報が増える「純粋上位集合」カードのみ自動採用、損失/値変更/混在/MANUAL は温存）＝**手作業を一切失わずパーサー改善だけ収穫できる**ようになり `npm run build:effects` 実行可。パーサー修正＝①POWER_MODIFY「他の＜種族＞/色」バフ（filter/excludeSelf破棄是正）②activeCondition「[色/クラス]のシグニがあるかぎり」③activeCondition「《X》か《Y》」複数名。要レビュー backlog 420→411・全工程回帰0・typecheck緑。パーサー改善の残バックログは **`docs/parser_backlog.md`**（次は triggerCondition脱落51・filter.cardType98・filter.color/storyは名詞句限定で要再設計＝全文スキャン禁止の教訓あり）。`docs/effects_merge_report.md`（gitignore）に採用/温存の全ID。**要実機検証**（データ360枚改善が実ゲームで正しいか未確認）。
- **直近やったこと（karka）**: **【ビート】機構 Phase4-7 で完了**。Phase4＝コスト型《ビート》[４枚以下]使用ゲート9。Phase5＝トラッシュ→beat コスト（WDK14-013）。Phase6＝look→pick の【ビート】化宛先（`then:'beat'`）＋`levelEqLastProcessed`（WDK14-008）。Phase7＝**MAKE_BEAT正規化**（`addToBeatZone` で5経路集約）＋**beat対象のプレイヤー選択UI**（`analyzeBeatSigniCost`＋`payBeatSigniCost(selectedOtherZones)`＝ON_PLAY/ACTIVATEDモーダルでゾーン選択）。smoke 計75pass・同型★0。→ `BUGFIXES.md` 先頭4件。
- **直近やったこと（zerom）**: **【ビート】機構 Phase1-3**（《ビート》[条件]ゲート12＋ON_BECOME_BEAT8＋cost.beat_signi支払い）。→ `BUGFIXES.md`。
- **直近やったこと（karka・続き2）**: **機構④誤parse3枚を是正**（WXDi-P07-044 全3効果＝ON_HAND_DISCARDED/ON_PLAY byEffect＋FREEZE復元・engine配線あり／WX25-P3-062-E2＝ハナレ条件＋エナ＜毒牙＞任意トラッシュ→両者-20000・配線あり／WX25-P2-009＝1ACTIVATEDマッシュを2 AUTOに分割＝refresh置換STUB＋新timing ON_CARD_MILLED_FROM_DECK[未配線マーク]）。逆翻訳が原文一致・同型★0。→ `BUGFIXES.md` 先頭。
- **🎯 次の一手（上から推奨）**:
  1. **次の大型機構（§5）**: 引用AUTO付与（GRANT_QUOTED_AUTO_ABILITY精緻化・中/中）。着手したら §5 を `着手中(名前)` に。WX25-CP1-074・WXK09-055・WX24-P2-044 等の「シグニに『〜』を付与」。
  2. **機構④の残（engine配線・重い）**: `ON_CARD_MILLED_FROM_DECK` の収集機構（WX25-P2-009-E2 のミルトリガー＝現【※engine未配線】）／refresh置換実体（WX25-P2-009-E1）／「他＜毒牙＞効果で相手パワー減少」トリガー（WX25-P3-062-E1）。いずれも新トリガー機構。
  3. **ビートの残（低優先）**: トラッシュ→beat（WDK14-013）の選択ピッカーのみ自動近似。
- **⚠ 実機検証の宿題**: ビート Phase1-7＋機構④誤parse3枚は全て **要実機検証**。
- **⚠ 実機検証の宿題（ヘッドレス不可・PvP/CPU要）**: ビート Phase1-3 は全て **要実機検証**（[条件]ゲートの開閉／ON_BECOME_BEAT watcher の self/any_ally 出し分け・CPU代行／beat_signi の出・起発動→beat化→ON_BECOME_BEAT連鎖）。
- **その前**: 逆翻訳器の生ID一掃（アクション21種＋STUB18種）／機構：傀儡場出し汎用化（WXK10-055）／機構④ターン限定AUTO基盤。
- **⚠ ゲートは `npm run typecheck`（`tsc -b`）を使う**（plain `tsc --noEmit` は build-mode未使用でCIが拾うエラーを見逃す。今回それで既存CI赤に気づけなかった）。
- **重要な調査結果**: クリーンな横展開系統・トリビアル個別★は枯れた。**大型機構が主戦場**。機構④で「ターン限定AUTO」を単一チョーク（initStack/pushToStack）で解決できたのが好例＝core収集点を個別に触らず安全に入れられた。
- **機構④の残り**: 誤parse3枚（WXDi-P07-044／WX25-P2-009／WX25-P3-062）＋WX25-CP1-060-E2 本体は別課題（マーカーは正）。turnOwner の付け方は確立済（該当AUTO効果の triggerCondition に追加）。**ACTIVATED《相手ターン》は現データに該当0**（将来出たら BattleScreen の起動可否ゲートが要る）。
- **機構④の誤parse3枚（中リスク・別系統）**: WXDi-P07-044=「シグニ捨てた時→そのカード場出し」＋「手札以外から場出した時→相手凍結-2000」／WX25-P2-009=ゲーム全体能力付与＋リフレッシュ置換／WX25-P3-062=「他＜毒牙＞効果で相手パワー減った時」特殊トリガー。いずれもトリガー/アクション全体が壊れた重い誤parseで新トリガー機構が要る。
- **⚠ ゲートは `npm run typecheck`（`tsc -b`）を使う**（plain `tsc --noEmit` は CI が拾うエラーを見逃す）。**effects_*.json は手動管理＝`build:effects` 禁止**。**日本語含むスクリプトは scratchpad に .mjs を書いて `node` 実行**（papaparse 等の解決のためカード参照スクリプトは project root に一時cpして実行・終わったら削除）。
- **engine注意（重要）**: 動的フィルタ（`*LteLastProcessed`/`*DiscardSigni` 等）は**アクションごとに解決経路を個別確認**。`lastProcessedCards` を渡して resolveDynamicFilter する＝execBanish/SendToEnergy/Bounce/Search/REVEAL_AND_PICK/applyDirectAction。**キャスター値**は `resolveDiscardLevelFilter(filter, ctx.ownerState)`。
- **着手中の機構**: 【ビート】（zerom が Phase1-3 完了。残サブタスクは karka が継続可。新規に別パートへ深入りする場合は §5 を `着手中(karka)` に）。
- **注意/未解決**: 「脱落疑い件数」は指標にしない（§2）。WX24-P3-026-E1 は timing 誤り（原文「メイン開始時」が ON_PLAY）が**別途**残存。

### 共有ファイルの扱い
- `BUGFIXES.md`：**新しいものを上に**追記（誰がやったか分かるよう日付/系統名を見出しに）。
- `src/`（型・engine・decompiler）は**機構実装時のみ**。着手前に §5 の状態を `着手中(名前)` にして push（次の人が同じ機構に手を付けないため）。

## 4. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外
1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。
2. **CHOOSE/チェインの1文圧縮**＝択肢が逆翻訳に全部出ていれば正しい。
3. **REVEAL_AND_PICK の文法崩れ**（語順が変でも機能は正常）。
4. **ルール注記**（「（コストのない【出】能力は発動しないことを選べない）」等）＝効果ではない。
5. **アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
6. **BET_MECHANIC STUB**＝別タスク。
7. **owner:any の一括変換**は禁止（POWER_MODIFY/BANISH の `owner:'any'` は大半が正当）。

## 5. 残・大型機構（§D：1人1機構オーナー制）
着手前に**この表の「状態」を `着手中(担当名)` に更新してコミット**（重複防止）。実装の型は `TODO.md §4`「機構実装の型」に従う。

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| ~~《相手ターン》/《自分ターン》AUTOトリガー基盤~~ | — | — | **実装済（機構④・BUGFIXES参照）**。AUTO 30枚配線。effectStack でゲート。残: ACTIVATED版（該当0だった）・誤parse3枚 |
| ~~【ビート】機構~~ | 44枚 | — | **完了（Phase1-7）**＝[条件]ゲート12＋ON_BECOME_BEAT8＋cost.beat_signi＋[４枚以下]使用ゲート9＋トラッシュ→beat/WDK14-013＋look→pick beat化/同レベル/WDK14-008＋**MAKE_BEAT正規化＋beat対象プレイヤー選択UI**（BUGFIXES参照）。残はトラッシュ版選択ピッカーのみ（低優先）。要実機検証 |
| 引用AUTO付与の精緻化（GRANT_QUOTED_AUTO_ABILITY） | 中 | 中 | 未着手 |
| ~~傀儡場出しの汎用化（STEAL_OPP_TRASH_PUPPET を count/optional/level対応へ）＋ON_BATTLE_BANISH被バニッシュ参照~~ | 小〜中（WXK10-055 等） | 中 | **実装済（BUGFIXES参照）**。WXK10-055 全効果再構築。残: 他に同型の傀儡カードがあれば横展開可 |
| ~~`levelLteLastProcessed` フィルタ~~ | — | — | **実装済**（BUGFIXES参照） |

- 実装済み機構の履歴：コスト増加(①)・ライフクラッシュ履歴(②)・LOOK_PICK_CHAIN field宛先(③) は `BUGFIXES.md` 参照。

## 6. 標準ワークフロー（1ラウンド＝横展開）
1. **抽出**：全シート走査で「同じ壊れ方」を機械抽出（`scratchpad` の `scan*.mjs` が雛形。例：逆翻訳が「並べ替える」に退化＝look→pick脱落）。
2. **分類**：偽陽性(§4)・既知複雑札を除外し、**自担当ファイルのクリーンな系統**を確定。
3. **パッチ**：`effectId` をアンカーにした一括スクリプトで安全に置換（他カードを巻き込まない）。
4. **検証ゲート（必須・この順）**：
   - **`npm run typecheck`（＝`tsc -b --noEmit`）** ← CIと同じ。**`npx tsc --noEmit`（-b無し）は project references を見ず重複識別子等を見逃すので不可**。
   - 該当シート再生成：`npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt`
   - 下流再生成：`node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all`
   - **逆翻訳が原文一致 ＆ 同型★0** を確認
5. **記録＆バトン**：`BUGFIXES.md` に追記（新しいものを上）→ **§3「現在地（バトン）」を上書き** → コミット（末尾に「要実機検証」）→ **push**。

## 7. 進捗の可視化（推奨・P1を“終わらせられる形”にする）
- 「同型グループ × 機構」ごとに〔表現OK / 機構待ち / 偽陽性〕を集計する計器を作ると、**残り枚数が正確に**見える（既存 grouping 基盤を流用）。誰か1人が P1 序盤に整備すると3人の進捗が一目で揃う。

---
**関連**：`DESIGN.md`（設計方針）／`TODO.md`（残作業・引き継ぎ）／`BUGFIXES.md`（修正記録）／`effects-json-guide.md`（語彙）。
