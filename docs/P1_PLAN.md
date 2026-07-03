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
> **機械指標（同型★0・脱落疑い分類・大型機構）は達成済み＝下記3つは✅。だが大本の目的「全効果カードで逆翻訳が原文一致」には未達。本丸は「逆翻訳機の出力品質」（下の4つ目）に移行した（2026-06-30）。** 機械指標は必要条件だが十分ではない＝同型★0でも逆翻訳が英語ID漏れ・文法崩れで原文一致しないカードが多数あった。
- [x] 全シートで **同型★ = 0**（`docs/grouped_all.txt`・`node scripts/groupSimilar.mjs --all` で再生成）。**達成・維持中**。
- [x] 「⚠脱落疑い」リストの各カードが、**偽陽性**／**修正済**／**機構待ち（理由明記）** のいずれかに分類済み。**✅2026-06-28＝255枚を全分類**（偽陽性179／機構待ち72／修正済）。`node scripts/_dropTriage.mjs`・明細 `docs/_drop_triage.txt`。
- [x] 残る大型機構（§5）が実装＋配線済み、または明確にスコープ外と合意。**✅2026-06-28＝§5 B機構を全完了**（B1トラップ表現／B2動的閾値／B3遅延条件トリガー／B4引用付与実発火）。残るは **C（engine 実機配線・全 R5-R58 と B1-B4 は要実機検証）＝P2 スコープ**。
- [ ] **🆕 逆翻訳機（`scripts/decompileEffects.ts`）の出力品質＝原文一致**（2026-06-30 着手・現在の本丸）。同型★0は「カード間で逆翻訳が割れていない」ことしか保証せず、**個々のカードで逆翻訳が原文どおりか**は別。逆翻訳機が **①英語ID/enum を漏らさず ②文法崩れず ③脱落なく** 描画することが完了条件。§4 の「文法崩れ着手禁止」を解除し、レンダラを1系統ずつ原文一致へ改善中（BUGFIXES 上部①〜⑤＝REVEAL_AND_PICK／LOOK_AND_REORDER／CHOOSE／BLOCK_ACTION／timing-icon 是正済）。**指標＝逆翻訳行を `grep -ohE "[A-Z][A-Z0-9_]+"` した英語漏れ（残＝機構待ちSTUB id のみ）＋ 原文照合（spot-check）。⚠`_dropTriage` の件数では文法品質を測れない（構造分類のため）。**
- ⚠ **「脱落疑いの件数」は完了指標にしない**（§2）。

## 2. 不変の運用ルール（全員必須）
- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的＝絶対に実行しない。** JSONは直接パッチ。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。語彙が無ければ §5 の機構として実装する。
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（Git Bash 経由の `node -e` は文字化けする）。papaparse 等が要るカード参照スクリプトは project root に一時 `.ts/.mjs` を置いて `npx tsx`/`node` 実行・終わったら削除。
- **件数メトリクスを信じない**：「脱落疑いNN枚」は「。区切り文数」比較で粗く、逆翻訳器は複数効果を1行(、／そして)に圧縮するため**内容を直しても件数は減らない**。さらに `_dropTriage` の分類（「文法崩れ」等）は**構造ベース＝逆翻訳機の文法を直しても件数は変わらない**。判断は必ず **同型★0＋該当カードの逆翻訳が原文一致（目視/grep）** で行う。
- **§4 の「真の偽陽性」は直さない。ただし「逆翻訳機の品質問題（英語ID漏れ・文法崩れ）」は直す**（2026-06-30 方針変更・§1 4つ目／§4 参照）。両者を混同しない。
- **ゲートは `npm run typecheck`（＝`tsc -b --noEmit`）**。plain `tsc --noEmit` は project references を見ず CI が拾うエラーを見逃すので不可。

## 3. 現在地と今後の計画（バトン）
> 3人は**同時に作業しない**。**① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push** を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最終更新 2026-07-03）
- **🆕 セッション（2026-07-03・zerom・続き8）＝BEHAVIOR_AUDIT 段階4・第3収穫＝未実装action型を網羅発見（14種42効果）・`EQUALIZE_ENERGY`(6)実装**＝action位置なのに engine/UI に型名が一度も無い＝完全no-opの型を走査で確定。`EQUALIZE_ENERGY`（各プレイヤーのエナをN枚に調整）を実装（golden 100/100・smoke0・fuzz0）。残13種36効果は **[TODO.md](./TODO.md) §1.9** に worklist 化（A自己完結型＝LEVEL_MODIFY等／B横断統合型＝GROW_COST_REDUCTION等）。**「逆翻訳は出るが engine が動かない」死角を behavior-audit の盤面差分が発見**。詳細 BUGFIXES 上部。
- **🆕 セッション（2026-07-03・zerom・続き7）＝BEHAVIOR_AUDIT 段階4・第2収穫＝「エナを選択でトラッシュ」完全no-opの engine バグを修正＝76効果一挙解消（キュー253→177）**＝TRASH の resume 適用（effectExecutor.ts 4387〜）が SIGNI/DECK_CARD/HAND_CARD のみで **ENERGY_CARD 分岐を欠き**、「エナをN枚選択トラッシュ」が選択後 no-op になっていた（count:'ALL' のみ inline で動作）。ENERGY_CARD 分岐を追加（保護チェック込み）。JSON/decompiler 不変・同型★不要。typecheck緑・smoke0・**golden 99/99（+1）**・fuzz0。**smoke の死角（SELECT_TARGET は通すが盤面変化を assert しない）を behavior-audit が捕捉した好例。** 詳細 BUGFIXES 上部。
- **🆕 セッション（2026-07-03・zerom・続き6）＝BEHAVIOR_AUDIT 段階4・初の実バグ収穫＝場シグニ「ゲームから除外」誤エンコード12件是正**＝audit キューを高シグナル選別（動作動詞×STUB無×条件無×無変化）して発見。原文「シグニをゲームから除外」が `TRASH{TRASH_CARD,opp}`(no-op) に化けていた系統バグ。**engine に `execExile` の場シグニ除外分岐＋apply の `removeFromField` 除去を新設**＋JSON12件是正（除外10・デッキmill1・自トラッシュ除外1）。同型★0維持・typecheck緑・smoke0・**golden 98/98（EXILEテスト2追加）**・fuzz0。キュー261→253。詳細 BUGFIXES 上部。**段階4は継続可（キュー253を高シグナル順に消化）＝behavior-audit が「find→fix→verify」ループを実証。**
- **🆕 セッション（2026-07-03・zerom・続き5）＝BEHAVIOR_AUDIT 段階3（HTML表レンダラ）完成**＝`npm run audit:html`→`docs/behavior_audit/`にセット単位HTMLレビュー表（196セット+index.html・効果10557/要review261/側跨ぎ0/crash0）。要review琥珀・側跨ぎ赤帯・crash赤で強調＋検索/「要reviewのみ・側跨ぎのみ」フィルタ・ライト/ダーク・自己完結。**HTMLは11M派生物＝gitignore**（各自生成／軽量 `docs/_behavior_queue.txt` を索引commit）。typecheck/lint緑。**次＝段階4＝実バグ収穫**（`docs/behavior_audit/` の各セットHTMLを「要reviewのみ」フィルタ→原文↔差分↔ログを目視で「真no-op/正当な空振り/STUB未実装」に仕分け→バグは §0 ワークフローで修正）。詳細 [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)。
- **🆕 セッション（2026-07-03・zerom・続き4）＝BEHAVIOR_AUDIT 段階2c（空振りさらに削減）＝キュー 285→261**＝エナを5色化（色フィルタ/色条件の空振り解消）・ENERGY_CARD対象も合致カード配置・colorMatchesLrig を lrig色で解決（8→1）・keyword/cardName も zoneNeeds対象化・差分器に GRANT_LRIG_ABILITY/granted_effects/lrig_abilities_disabled 検出追加。**811→261（68%削減）で逓減域に到達**＝残261はカウント条件/デッキ内容/CHOOSE分岐（autopilot限界・満たすと非代表的）＋STUB23（真の未実装＝残すべき正の suspect）。内訳は `node scratchpad/_bqAnalyze.mjs`。typecheck/lint緑。**次＝段階3 HTML表 or 段階4 キュー消化（残261を目視仕分け→欠落no-opバグ修正）**。
- **🆕 セッション（2026-07-03・zerom・続き3）＝BEHAVIOR_AUDIT 段階2（シナリオ拡充）完成＝キュー 811→285**＝`buildScenario` を効果対応化＝engineの `matchesFilter` 流用で対象フィルタ（パワー/レベル/クラス/色）に合う実シグニを対象側へ配置・状態フィルタ（凍結/ダウン/ウィルス等）フラグ設定・`trashActivated`/thisCardOnly source をトラッシュ/手札へ再配置・サルベージ/サーチ（TRASH/DECK/HAND対象）は該当ゾーンへ合致カード配置。差分器も状態フラグ/付与キーワード/行動制限/コインを追加。**空振りを約65%削減（811→285）＝残285がほぼ真の要レビュー母集団**。typecheck/lint 緑。**次＝段階2c（任意・逓減）or 段階3 HTML表 or 段階4 キュー消化（欠落no-opバグ修正）**。詳細 [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)「実装状況」。
- **🆕 セッション（2026-07-03・zerom・続き2）＝BEHAVIOR_AUDIT 基盤（段階1）を実装**＝`scripts/behaviorAudit.ts` 新設（`npm run audit` / `audit:queue`）。中核①シナリオビルダー（ラベル付きトークン一次版）②盤面差分器（両者全ゾーンを instanceId 追跡・自然文化・`⚠側跨ぎ` 強調）③トレース出力（原文｜逆翻訳｜差分｜ログ）④要レビュー・キュー（非CONTINUOUS×無変化×低情報ログ＝**811/9269効果**・`docs/_behavior_queue.txt`）を一次実装。全効果を約4秒・決定論・トークン0。docの矛盾（未実装／semanticと相互に主軸）を解消＝behavior主軸・semantic補完。
- **🆕 セッション（2026-07-03・zerom・続き）＝方針決定（BEHAVIOR_AUDIT フル実装を主軸に採用）＋意味照合系統①(a)を是正**。(1)docs矛盾を確認＝**BEHAVIOR_AUDIT.md は未実装の設計提案**（成果を出しているのは semantic の方）。ユーザー判断で**実行トレース監査（LLM不使用・決定論・無料・回帰資産）をフル実装する方針**に決定（構築ステップは BEHAVIOR_AUDIT.md §実装の中核）。(2)最初の一手＝**owner取り違え系統①**に着手。**doc「確定76枚」は over-claim を実証**＝`scratchpad/_ownerRefine.mjs` で (a)純・相手58枚／(b)「あなたか対戦相手」選択18枚（opponent不可）／(c)混在10枚 に3分解。**(a)58枚を `owner:self→opponent` に一括是正・全ハーネス緑・原文一致・同型★0**（BUGFIXES上部）。**残＝(b)18・(c)10・系統②48・個別39（TODO §1.8）＋BEHAVIOR_AUDIT基盤構築**。
- **🆕 セッション（2026-07-03・zerom）＝意味照合監査（semantic audit）パイプライン新設**＝原文 vs effects JSON を LLM（`claude -p` headless）で意味比較し、逆翻訳が原理的に検査できない STUB/MANUAL カード（2,306枚）の誤実装を直接検出する仕組み（`scripts/semanticAudit{Extract,Run,Triage}.mjs`・使い方と偽陽性規約は **[SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)**）。パイロット＝stub群30枚全精査で **precision 約78%・17/30枚に確定バグ**（全て同型★0/smoke/fuzz 通過済み＝既存ゲートの死角を実証）。派生の**系統バグ2種を全域スキャン済み**＝①相手デッキ削りの owner:self（自分のデッキを削る実挙動）**確定76枚**／②GRANT_PROTECTION `count:'ALL'`+subjectFilter無し（保護コレクタで no-op 疑い）48件。**worklist と次の一手＝[TODO.md](./TODO.md) §1.8**。engine/JSON は未修正（今回のスコープは仕組み構築のみ）。
- **🆕 セッション（2026-07-02・zerom・続き12＝一区切り）＝逆翻訳の英語ID漏れ「クリーンSTUB原文抽出」を全消化＝444→367（⑭〜㉒）**。**残 367 は effect構造が原文とズレた混線／未構造化STUB＝1 STUB を原文化しても同 effect 内の他のズレが残り原文一致にならず、decompiler の原文抽出では対応不能。effects JSON の再parse（機構実装・データ層）が本筋**（ユーザー判断で現状367で一区切り＝原文コピーで隠すと実装未完成が見えず検証目的に反するため）。**残の索引と進め方＝[TODO.md](./TODO.md) §1.7**（大型レンダラ系統 `REVEAL_AND_PICK`/`CHOOSE`/`LOOK_TOP_*`/`SIGNI_REPOSITION` 等＋heterogeneous＋`BET_*`38）。次の担当は §1.7 のカードを1枚ずつ effects JSON 手修正→原文一致確認→smoke/golden/fuzz→push。
- **🆕 セッション（2026-07-02・zerom・続き11）＝引用能力付与型の原文抽出（BUGFIXES㉒）**＝`GRANT_QUOTED_ACTIVATE_ABILITY`（引用【起】）/`SIGNI_GRANT_QUOTED_CONSTANT_ABILITY`（引用【常】）を「…は「…」を得る」で抽出。全対象 原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ総数 378→367**。**⑭〜㉒累計 444→367（-77）**。方針＝全STUBを原文化して逆翻訳を通しレビュー可能にする（英語漏れは構造化effectの実装検証を妨げるノイズ）。残＝大型レンダラ系統＋heterogeneous混線＋`BET_*`(38)。
- **🆕 セッション（2026-07-02・zerom・続き10）＝原文抽出3系統（BUGFIXES㉑）**＝`COPY_SIGNI`/`PLACE_MAGIC_BOX`/`CLASS_CHANGE`拡張（fallback追加）。全対象 原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ総数 384→378**。**⑭〜㉑累計 444→378（-66）**。残＝大型レンダラ系統（`CHOOSE`/`REVEAL_AND_PICK`/`SELECT`/`REPEAT_*`/`LOOK_TOP_*`/`SIGNI_REPOSITION`+`MOVE_TARGET`/`OPP_CHOOSE_*`）＋引用能力付与型（`GRANT_QUOTED_*`/`GRANT_SIGNI_ABOVE_ABILITY`）＋heterogeneous混線（`TRIGGER_LIFE_BURST`等）＋`BET_*`(38・機構待ち)。**クリーンに1regexで潰せる2件系統は残りわずか＝次は引用能力付与型 or 大型レンダラの検討へ。**
- **🆕 セッション（2026-07-02・zerom・続き9）＝原文抽出4系統（BUGFIXES⑳）**＝`UPKEEP_OR_NO_UP`/`ABILITY_CHECK_ELSE_TRASH`/`POWER_COPY_FROM_DOWNED`/`ACCE_FROM_TRASH`(+`NAMED_SIGNI_ACCE_FROM_TRASH`)。全対象 原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ総数 391→384**。⚠集計は表示テキスト内の英語を拾う＝実 a.id と異なる場合あり（NAMED_SIGNI_ACCE_FROM_TRASH の例）。**⑭〜⑳累計 444→384（-60）**。残＝大型レンダラ系統＋heterogeneous＋`BET_*`(38)。
- **🆕 セッション（2026-07-02・zerom・続き8）＝原文抽出4系統（BUGFIXES⑲）**＝`OPP_MAIN_PHASE_LIMIT_DOWN`/`OPP_SIGNI_ATTACK_COST`/`COPY_TARGET_POWER`/`FIELD_ENERGY_SIGNI_GAIN_COLOR`。全対象 原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ総数 399→391**。方針「原文抽出を1系統ずつ継続」で2件系統を消化中。残＝大型レンダラ系統＋heterogeneous＋`BET_*`(38)。
- **🆕 セッション（2026-07-02・zerom・続き7）＝原文抽出6系統（BUGFIXES⑱）＋矢印注記除去（⑰）**＝方針「原文抽出を1系統ずつ継続（原文一致重視）」（ユーザー確認済み）。⑰＝STUB説明文の実装フロー注記 `（SELECT→INTERNAL）` 6件を汎用除去。⑱＝`PICK_FROM_TRASHED_CARDS`/`DEPLOY_RESTRICT`/`OPP_SIGNI_ATTACK_POWER_RESTRICT`/`COIN_USE_RESTRICTION`/`OPP_DECLARE_COLOR`/`HAND_CARDS_UNDER_SIGNI`(+`PLACE_SIGNI_UNDER_SELF_OPT`) を `currentCardText` 原文抽出。全対象 原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ総数 444→399**（⑭〜⑱累計）。残＝大型レンダラ系統（`CHOOSE`/`REVEAL_AND_PICK`/`SELECT`/`REPEAT_*`/`LOOK_TOP_*`/`SIGNI_REPOSITION`+`MOVE_TARGET`/`OPP_CHOOSE_*`）＋per-card heterogeneous（`PREVENT_ZONE_MOVE_BY_OPP` 等）＋`BET_*`(38・機構待ち)。次も2件系統から原文抽出を継続。
- **🆕 セッション（2026-07-02・zerom・続き6）＝LIFE_BURST_DOUBLE / RIDE_ON / OPP_DRAW_LIMIT を原文抽出で是正（BUGFIXES⑯）**＝定型意味の3系統を `currentCardText` 抽出。全対象 原文一致・同型★0維持・typecheck緑・engine不変。**⚠この時点で「1本の正規表現で複数カードをクリーンに潰せる塊」はほぼ枯れた**。残る英語漏れの主体＝(a)大型レンダラ系統（`CHOOSE`/`REVEAL_AND_PICK`/`SELECT`/`REPEAT_*`/`LOOK_TOP_*`/`SIGNI_REPOSITION`+`MOVE_TARGET_SIGNI_TO_OTHER_ZONE`/`OPP_CHOOSE_*`＝複数効果が1行に混線）(b)per-card heterogeneous（`PREVENT_ZONE_MOVE_BY_OPP`＝同一カードE1/E2が同一アクションで出し分け不能・`DEPLOY_RESTRICT`・`PICK_FROM_TRASHED_CARDS`）＝**レンダラ本体/parser の分解再設計が必要**（無理な固定文化は誤訳を生むため未着手）。(c)`BET_*`系(38)は機構待ち。**次の一手＝大型レンダラ系統の本格着手（高リスク・§6ゲートを1系統ずつ）か、per-card 個別対応。**
- **🆕 セッション（2026-07-02・zerom・続き5）＝相手が公開する系STUBの英語ID漏れを是正（BUGFIXES⑮）**＝`OPP_REVEAL_HAND_AND_LRIG_DECK / OPP_REVEAL_LRIG_DECK / OPP_REVEAL_TOP_AND_HAND`（3枚・engine実装済）が id を `/` 連結で露出していたのを `currentCardText` から原文抽出（公開元が3枚で異なるため固定文不可・末尾括弧補足も取り込む）。全3効果 原文一致・同型★0維持・typecheck緑・engine不変。
- **🆕 セッション（2026-07-02・zerom・続き4）＝相手アタック回数制限STUBの英語ID漏れを是正（BUGFIXES⑭）**＝`LIMIT_OPP_SIGNI_ATTACKS_ONCE / OPP_SIGNI_ONE_ATTACK_TOTAL / LIMIT_OPP_ATTACK_ONCE`（3枚・engine実装済）が id を `/` 連結で露出していたのを `currentCardText` から原文抽出（3枚で語順/範囲が異なるため固定文不可）。CHOOSE分岐（WD13-010）含め全3効果 原文一致・同型★0維持・typecheck緑・engine不変。残 heterogeneous＝`REVEAL_AND_PICK`・`CHOOSE`（レンダラ本体側）／`LOOK_TOP_*`・`SIGNI_REPOSITION`・`REPEAT_N_TIMES`（個別設計要）／`BET_*`(38・機構待ち)。
- **🆕 セッション（2026-07-02・zerom・続き3）＝固定意味STUB 約28系統を一括是正（BUGFIXES⑬）＝489→406（-83）**＝engine実装済みだが逆翻訳描画のみ欠けていた固定意味STUB（HAND_SIZE_INCREASE/DECLARE_NUMBER/REMOVE_SIGNI_ZONE/CLASS_CHANGE/COLLAB/PLACE_OWN_GATE/REVEAL_OPP_HAND_CARD 他多数）を `currentCardText` 原文抽出で是正。すべて match-only フォールスルー（非マッチは従来表示）。COLLAB は effectType 分岐、OPP_*/REPEAT_EFFECT は standalone のみ。同型★0維持・typecheck緑・engine不変。**⑩〜⑬合計 582→406**。残（≈406）＝`BET_*`(38機構待ち)／`REVEAL_AND_PICK`・`CHOOSE`（レンダラ本体側）／`LOOK_TOP_*`・`FLIP_FACE_DOWN_SIGNI`・`SIGNI_REPOSITION`・`REPEAT_N_TIMES`（heterogeneous・個別設計要）。全体計画は [ROADMAP.md](./ROADMAP.md)。
- **🆕 セッション（2026-07-02・zerom・続き2）＝`DO_THREE_THINGS`(7効果) を個別対応で是正（BUGFIXES⑫）**＝単独STUBは「以下のN つを行う。①…②…③…」全文抽出、SEQUENCE埋め込み(WXK11-007〜010)は「先頭stepがDO_THREE_THINGSなら先頭のみ描画」で後続の冗長再パースstepを捨てて重複解消。原文全文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ 496→489**（⑩⑪⑫合計 582→489）。残 heterogeneous＝`REPEAT_*`/`OPP_CHOOSE_*`系(SEQUENCE埋め込みで⑫同様の対応可)/`COLLAB`/`LOOK_TOP_*`/`SIGNI_REPOSITION`+`MOVE_TARGET_SIGNI_TO_OTHER_ZONE`。`REVEAL_AND_PICK`/`CHOOSE` はレンダラ本体側。`BET_*`系(38)は機構待ち。
- **🆕 セッション（2026-07-02・zerom・続き）＝英語ID漏れ STUB をさらに8系統是正（BUGFIXES⑪）**＝`*_SERVANT_ZERO`系4id(8効果)／`SEED_BLOOM`+`SEED_BLOOM_OPTIONAL`(6)／`PLACE_SEED_FROM_REVEALED`(8)／`GAIN_LRIG_BARRIER`(5)／`LOSE_COLOR_ALL_ZONES`(7)／`OPEN_MAGIC_BOX`(5)／`CAST_FROM_OPP_TRASH`(4)／`ACCE_FROM_HAND`+`MULTI_ACCE_FROM_HAND`(8)。全て原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ 548→496**（⑩⑪合計 582→496）。**残る中規模クラスタは heterogeneous で個別精査要**＝`REPEAT_*`/`DO_THREE_THINGS`(WXK11-007等でSEQUENCE重複リスク)/`OPP_CHOOSE_*`系/`COLLAB`/`LOOK_TOP_*`/`SIGNI_REPOSITION`+`MOVE_TARGET_SIGNI_TO_OTHER_ZONE`（原文の枚数動的/語順不揃い/SEQUENCE埋め込みのため単一正規表現に不適）。`REVEAL_AND_PICK`/`CHOOSE` はレンダラ本体側の課題。`BET_*`系(38)は機構待ち。全体計画は [ROADMAP.md](./ROADMAP.md)。
- **🆕 セッション（2026-07-02・zerom）＝逆翻訳機の英語ID漏れ STUB を原文抽出で是正（4系統・BUGFIXES⑩）**＝engine実装済みSTUBの説明文が STUBS.md 由来で英語IDを露出していた4系統を `decompileEffects.ts` で `currentCardText` から原文抽出して描画。`DOWN_UP_SIGNI_AND_CHOOSE`(7)／`TRASH_AT_TURN_END`(12)／`CHOOSE_COLOR_FROM_LIST`(4)／`CRAFT_TO_LRIG_DECK`+`ADD_CRAFT_TO_LRIG_DECK`(9)。全て原文一致・同型★0維持・typecheck緑・engine不変。**英語ID漏れ総数 582→548**。次候補＝`ACCE_FROM_HAND`(9・原文表現 heterogeneous で要個別)／`SIGNI_SERVANT_ZERO`系(計24)／`SEED`系(20)／`LOOK_TOP`系(20)／`REPEAT`系(14)。残一覧＝`grep -ohE "\[STUB:[^]]*[A-Z][A-Z0-9_]{4,}[^]]*\]" docs/decompile_sheet*.txt | grep -oE "[A-Z][A-Z0-9_]{4,}" | grep -vE "^(STUB|COUNT|AUTO|WX|CONTINUOUS|SELECT_TARGET)" | sort | uniq -c | sort -rn`。全体計画は [ROADMAP.md](./ROADMAP.md)。
- **🆕 セッション（2026-06-30）＝逆翻訳機の英語ID漏れ STUB を原文抽出で是正（4系統）**＝engine実装済みSTUBの説明文が STUBS.md 由来で英語IDを露出していた4系統を `decompileEffects.ts` で `currentCardText` から原文抽出して描画。⑥`COPY_LRIG_NAME_ABILITY`(16・過日の巫女系)／⑦`DESIGNATE_SIGNI_ZONE`(12)／⑧`SUMMON_RESONA_FROM_LRIG_DECK`(11)／⑨`SONG_FRAGMENT`(11)。全て同型★0維持・typecheck緑・engine不変。詳細 BUGFIXES.md ⑥〜⑨。**残英語ID漏れ STUB（多い順）＝DOWN_UP_SIGNI_AND_CHOOSE(14)／CHOOSE_COLOR_FROM_LIST(10)／CRAFT_TO_LRIG_DECK(9)／ACCE_FROM_HAND(9)／SERVANT_ZERO系(8)／SEED_BLOOM系 等**。`grep -ohE "\[STUB:[^]]*[A-Z][A-Z0-9_]{4,}[^]]*\]" docs/decompile_sheet*.txt | grep -oE "[A-Z][A-Z0-9_]{4,}" | grep -vE "^(STUB|COUNT|AUTO|WX|CONTINUOUS|SELECT_TARGET)" | sort | uniq -c | sort -rn` で残一覧。BET_MECHANIC 系は機構待ち。

### 📍 進捗サマリ（最終更新 2026-06-30・zerom 作業中）
- **🆕 zerom セッション（2026-06-30・最新）＝逆翻訳機の本格改善に方針転換（§4「文法崩れ着手禁止」を解除）**。大本の目的「全効果カードで逆翻訳が原文一致」に対し、機械指標（同型★0・held/LOSS/VALUE 0）は達成済だが**逆翻訳機の出力品質（文法崩れ・英語ID漏れ）が§4で凍結されていた**のが本丸の残作業と判明。**4レンダラを是正済**＝①`REVEAL_AND_PICK`（then フル節の二重主語崩壊→配置系/別効果系の2形）②`LOOK_AND_REORDER`（destination 欠落→「好きな順番で一番下に置く」等を描画・513枚）③`CHOOSE`（「次から」→原文「以下のNつからMつ（まで）を選ぶ」・「次から」全消）④`BLOCK_ACTION`（**英語ID漏れ「は「ATTACK」ことができない（END_OF_TURN）」108件→0**・制限/許可/特殊の3分類で網羅・主語文法是正）。`LOOK_PICK_CHAIN` は精査の結果すでに高品質で修正不要。いずれも同型★0維持・typecheck OK・engine不変。**⚠`_dropTriage`の「文法崩れ」件数は構造分類で文法品質を測れない＝改善は原文照合で確認**。詳細 BUGFIXES.md 上部（①②③④）。**次の本丸＝B層（JSONデータ欠落＝REVEAL/LOOK で pick部分が消えるカード）か、他レンダラの英語漏れ系統走査。**
- **🆕 zerom セッション（2026-06-30）＝A表現テール：アーツ/スペル使用コスト改変句を原文復元**＝`ARTS_COST_REDUCTION_BY_EFFECT`/`BY_CENTER_LRIG`/`CONDITIONAL_ARTS_COST` が逆翻訳で内部マーカー（`[STUB:アーツコスト軽減マーカー…]`／`[STUB:条件付きアーツコスト…]`）を露出していたのを、decompiler が `currentCardText` から「…使用コストは…減る/増える/になる」文を抽出して描画するよう修正（engine 不変・表現のみ）。**ARTS_COST_REDUCTION 122/126＋CONDITIONAL_ARTS_COST 8/14 をクリーン抽出**（残は別機構＝コスト色無視/エナコスト代替/グロウコスト/ライフ枚数条件でフォールバック）。同型★0維持（割れ0／5986枚）・typecheck OK・**STUB総数 1392→1259**。詳細 BUGFIXES.md 上部。**次のA表現テール候補＝`grep -ohE "\[STUB:[^]]+\]" docs/decompile_sheet*.txt | sort | uniq -c | sort -rn` で残クラスタを1系統ずつ。注意＝「動的パワー修正(COUNT依存)」「条件付きパワーボーナス」「トレード」「グロウ制限」等は意味/原文が多様で単純固定化に不適＝個別精査要。再パース型（使用コスト/ライフバースト発動しない等、原文がEffectTextに在る）が extraction で安全。**
- **🆕 zerom セッション（2026-06-30）＝C2 実機検証に着手＝フル BattleScreen driver をシナリオ切替式に一般化＋4効果を実 UI で発火・観測**。`scripts/verifyBattleDrive.mjs`＝ログイン→PLAYING到達は一度だけ、同一ルームへ `scenarios` テーブル（`{title,spec,drive}`）の盤面注入＋クリック列を適用。検証＝①WXK09-050（CHOOSE付与）②WXK02-029（アーツ→条件付きグロウ＋全キー喪失）③WD07-012（**CPUに自動アタックさせ** ON_ATTACK_SIGNI バニッシュ）④**WXDi-P03-039＝C1 timing `ON_LRIG_GROW`**（通常グロウUI→`collectLrigGrowTriggers` 発火→任意コスト払い→相手バニッシュ）⑤**WXDi-P15-069＝C1 timing `ON_COIN_PAID`**（コインGrowCostのグロウ→`collectCoinPaidTriggers` 発火→自身+2000）。アサートは**実エンジンログ**（CHOOSE選択肢ラベル等への偽陽性を排除）。併せて潜在バグ修正＝`battleCardNums` が盤面ゾーンを instanceId のまま登録し base フィルタの `battleCardMap` に載らず**デッキ外カードの盤面注入が未ロード→パワー0扱い**になっていたのを `getCardNum` で base 化。回帰＝typecheck/golden 95/0FAIL・smoke 全0・fuzz 全0。詳細 [VERIFY_BROWSER.md](./VERIFY_BROWSER.md)・BUGFIXES.md。**C1 配線の C2 横展開パターンが確立**（同方式で他 timing も追加可能）。
- **🆕 zerom セッション（2026-06-29）＝残生STUB 3種を全 engine 実装＝生STUB id露出 0達成**＝①`SIGNI_GRANT_CHOSEN_ABILITY`（WXK09-050・CHOOSE2択でダウン/バウンス保護を＜電機＞シグニに付与）②`BANISH_ATTACKER_IF_WEAKER_THAN_FRONT`（WD07-012・アタッカーが正面より低パワーならバニッシュ・triggeringCardNum 使用）③`CONDITIONAL_GROW_AND_KEY_DISABLE`（WXK02-029①・条件付きグロウ＋`keys_abilities_disabled` フラグ新設＝key_piece ソース push 8箇所をゲート・セットは本カードのみで回帰リスク0）。`grep "\[STUB:ID\]" docs/decompile_sheet*.txt` が**全シート0件**に。同型★0維持・golden 89→95（+6）・smoke/fuzz 全0。詳細 BUGFIXES.md 上部。⚠各 engine 配線は実機未検証（C2・/verify 推奨）。
- **🆕 zerom セッション（2026-06-29）＝A表現テール着手（3件）**＝①`OPTIONAL_TRASH_ENERGY_CLASS` の別記述誤マッチを decompiler＋engine で是正（WX25-CP1-006④の「シグニ1枚」→「カード3枚」／種別シグニ/カード区別／枚数のトラッシュ句由来化）。**engine 枚数支払いは golden で検証済（goldenTest.ts・PASS 89・エナ3枚払い＋相手シグニ バニッシュを実証）＝実機未検証の⚠解消**。②説明テキスト系STUB（RULE_REMINDER_TEXT/USE_CONDITION_TEXT/UNLIMITED_KEYS）を逆翻訳から無音スキップ（`[STUB:無音…]` タグ44件→0・SEQUENCE/CHOOSE 空ステップ除外）。③敗北/ルリグダメージ防止系STUB 8 id（PREVENT_DEFEAT*/PREVENT_LRIG_DAMAGE*/PREVENT_LOW_LEVEL_LRIG_DAMAGE/PREVENT_DAMAGE_AND_LIFE_MOVE_BY_OPP）を生STUB（id露出）→原文意味文に（engine実装済み・decompiler描画のみ欠落）。いずれも同型★0維持・golden 88/88・smoke/fuzz 全0。詳細は BUGFIXES.md 上部。**GRANT_QUOTED_AUTO_ABILITY の誤パース（A2残）は既に枯れていた**／**OPTIONAL_DISCARD_HAND_CLASS も枯れ**。
- **🆕 zerom セッション続き（2026-06-29）＝A表現テール 保護/制限系STUBを意味文化**＝①保護系 PREVENT_* 18 id＋SUPPRESS_GAIN_ABILITY（能力/パワー/移動/ダウン保護・色動的白/赤・既存近似是正）②行動制限系 BLOCK_* CONTINUOUS 8 id（相手起動/場出し/スペル/アンコール等の「対戦相手は〜できない」・activeCondition前置と二重回避）③能力/色継承系 GRANT_UNDER_* 等8 id（下のカードの【起】/【自】/全能力・色を得る）④色変化系3 id（白/黒になる・全色を持つ）。生STUB→原文意味文（engine実装/認識済み・decompiler描画のみ欠落）。同型★0維持・全ハーネス緑。詳細 BUGFIXES.md 上部。
⑤単発STUB 19 id（保護/代替コスト/グロウ/アタック制限等・`scanRemain.mjs` で網羅確認し本体のみ固定文化）⑥残テール3 id（SEQUENCE/CHOOSE/action 内・engine実装済み）。生STUB（id露出）は**当初41種→3種→0種**に。
  - **✅残3種を全 engine 実装＝生STUB id露出 0達成（2026-06-29）**＝CONDITIONAL_GROW_AND_KEY_DISABLE（条件付きグロウ＋keys_abilities_disabled 新設）・BANISH_ATTACKER_IF_WEAKER_THAN_FRONT（triggeringCardNum でアタッカー判定）・SIGNI_GRANT_CHOSEN_ABILITY（CHOOSE2択保護付与）。固定文化の近似ではなく実挙動。golden 95/95・同型★0・smoke/fuzz 全0。詳細 BUGFIXES.md 上部。**生STUB id露出は枯れた。**
  - **次の候補**＝(a) 残3種の engine 実装＋意味文化（D課題・engine作業）(b) description付きSTUB（`[STUB:日本語説明]`形式・129件のアーツコスト軽減マーカー等。多くはマーカーで描画不要の可能性＝精査要）の原文反映 (c) **実機検証(C2)**（今セッションの decompiler 変更は engine 不変だが、OTEC枚数の engine 変更分は要実機）。
  - **生STUB（id露出 `[STUB:ENGLISH_ID]`）は STUBS.md 管理の単発テールが残**＝engine実装済みなら decompiler に意味文を足すだけの低リスク表現テール。**保護系PREVENT_*はほぼ消化**。残＝`PREVENT_ZONE_MOVE_BY_OPP`（文脈差3件・動的抽出要）／`PREVENT_ATTACK_UNTIL_OPP_ATTACK_PHASE`（付与型）／`PREVENT_DAMAGE_FROM_OPP_EFFECTS`（文脈差3件）／`SUPPRESS_CENTER_ON_PLAY`/`SUPPRESS_OPP_SIGNI_ABILITIES`／その他系統（GRANT_UNDER_*、SPELL系、GROW系 等）。次の人はここを1系統ずつ（`grep -ohE "\[STUB:[A-Z][A-Z0-9_]+\]" docs/decompile_sheet*.txt | sort | uniq -c` で残一覧）。
- **🆕 ymst 引き継ぎ（2026-06-29）**＝Stage2（C配線の pure 抽出・golden 化）完了 ＋ C1 engine未配線timing をほぼ全配線 ＋ 改造素材機構を完成。golden 31→88件・同型★0・全ハーネス緑。残った engine未配線は `ON_KEYWORD_GAINED` 1枚のみ（COPY_ABILITY no-op で保留）。**意味ある C1 配線は打ち止め＝C は実質収束**。次は A/B 表現テール（低リスク）か実機 `/verify` 推奨。
- **P1 表現①の systematic 指標は全達成・維持中**：**held 0 / LOSS 0 / VALUE 0 / 同型★0**。
  - 再生成・検証＝`npx tsx scripts/parserWorklist.ts`（held/LOSS/VALUE）＋`node scripts/groupSimilar.mjs --all`（同型★）。
- **脱落疑い 255枚を全分類済み**（DoD §1 第2項クリア・`node scripts/_dropTriage.mjs`）：偽陽性179／機構待ち72／修正済。
- **timing flatten**（当初159枚の「ON_TURN_END に潰れて付与即失効＝no-op の実バグ」）は R5-R58 で**完了＝VALUE 0**。
- **母数**：効果カード 5975／効果 10549／MANUAL効果 733／STUB含むカード 1820。
- **A3 クローズ＋§5 B機構全完了（B1-B4）**。B1＝トラップ機構／B2＝動的閾値（WX17-028）／B3＝遅延条件トリガー／B4＝引用付与の実発火。**残るP1機構＝C（engine実機配線・P2）のみ**。同型★0（5986枚）。**decompile再生成は Bash の `>` を使う（PowerShell `>` は UTF-16 で下流破壊）。**
- **🆕 検証ハーネス3層＋CI 整備（2026-06-29）**＝実機検証を Claude/開発者がヘッドレス代替。`npm run smoke`（全効果・新品盤面）／`npm run golden`（型＋トリガー収集 assert・31/31）／`npm run fuzz`（乱択連鎖・進化盤面）。**CI（`.github/workflows/ci.yml`）が push/PR で typecheck・lint・golden・smoke・fuzz を自動実行**（§7・CLAUDE.md 参照）。現状すべて緑。
- **🆕 C1 ほぼ完了（engine未配線timing配線）**＝R33-R58 で新設した timing 群を順次配線。`ON_TARGETED`(14)/`ON_LRIG_GROW`(5)/`ON_COIN_PAID`(3)/`ON_LRIG_ATTACK_STEP_START`(1)（6/28）＋`ON_ALLY_PLAY_OR_OPP_HAND_DISCARD`/`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`/`ON_LRIG_UNDER_MOVED`/`ON_DECK_SHUFFLED`（6/29・各1枚・実アクション）。**残 engine未配線は `ON_KEYWORD_GAINED` 1枚のみ**（COPY_ABILITY no-op で配線価値なし＝保留）。`ON_MATERIAL_USED`(6) は改造素材機構として別途完成。新パターン＝pure collector(triggerCollect.ts)＋detector(boardDiff.ts)＋中央 diff 発火＋golden。⚠各配線は近似含み実機未検証(C2)。
- **🆕 改造素材機構 完成（2026-06-29）**＝『アーツ/クラフト』8枚プレイ可能化＋トークン WXK09-TK-01A の3択UI（CHOOSE3＋GRANT_EFFECT）＋ON_MATERIAL_USED 全3変種（materialUsedByPlayer/self/any_ally）配線＋新STUB `MARK_MATERIAL_TARGET`/新 state `material_used_targets`。BUGFIXES 参照。⚠UI/granted能力は実機 /verify 推奨。
- **✅ Stage2 実質完了（BattleScreen 配線の pure 抽出・2026-06-29）**＝`collect*Triggers` 全28関数を `src/engine/triggerCollect.ts` へ、detect/count 17関数を `src/engine/boardDiff.ts` へ pure 化し、effect_stack 整列（`effectStack.ts`）も golden 化。**C 配線の「トリガー収集・イベント検出・スタック整列」の3層がすべて pure＋golden 自動検証済み**（golden 79/79）。⚠残るは `doPhaseAdvance`（フェイズ遷移本体・React state 密結合）のみだが、C2 削減の主目的は達成済みのため**着手は任意・費用対効果が逓減**＝Stage2 はここで区切り、次は別タスク（A/B 表現テール・C1 残 timing 配線・CPU AI 等）へ。

### 🔜 今後の計画と必要作業数
> **🆕 現在の本丸＝(Z) 逆翻訳機の出力品質を原文一致へ（§1 4つ目）**。P1 の機械指標（同型★0 等）は達成済みだが、逆翻訳機が英語ID漏れ・文法崩れで原文一致しないカードが多数あった。§4 の「文法崩れ着手禁止」を解除し、レンダラを1系統ずつ原文一致へ改善中。**進め方＝逆翻訳行を `grep -ohE "[A-Z][A-Z0-9_]+"` で英語漏れ走査 → 1系統ずつ原文に直す → 同型★0＋原文照合で確認 → push**。残る英語漏れは機構待ちSTUB id（BET_MECHANIC 等＝(B)）。
>
> 旧来の (A) 表現テール・(B) 新機構・(C) engine 実機配線（P2/P3）は下記のとおり大半完了。bulk 再生成は引き続き禁止。1系統ずつ §6 のゲートで。

**Z. 逆翻訳機の出力品質（decompiler レンダラ・低〜中リスク・現在の主作業）**
- ~~① REVEAL_AND_PICK 文法崩れ~~ **✅是正（2026-06-30・BUGFIXES①）**＝then フル節の二重主語崩壊を配置系/別効果系の2形に。
- ~~② LOOK_AND_REORDER 行き先欠落~~ **✅是正（BUGFIXES②）**＝destination（一番下に置く/上に戻す）を描画・513枚。
- ~~③ CHOOSE 圧縮~~ **✅是正（BUGFIXES③）**＝「次から」→「以下のNつからMつ（まで）を選ぶ」。
- ~~④ BLOCK_ACTION 英語ID漏れ~~ **✅是正（BUGFIXES④）**＝「は「ATTACK」ことができない（END_OF_TURN）」108件→0。制限/許可/特殊の3分類。
- ~~⑤ timing/icon 英語漏れ~~ **✅是正（BUGFIXES⑤）**＝TRAP_ICON→【トラップアイコン】/SONG_ICON→【歌のカケラ】/ON_BLOOM/血晶武装 等。
- **残＝engine実装済みSTUB id の意味文化**（`[STUB:ENGLISH_ID]`→原文意味文・低リスク）。`grep -ohE "[A-Z][A-Z0-9_]+" 逆翻訳行 | sort | uniq -c | sort -rn` で多い順に：COPY_LRIG_NAME_ABILITY(16)・DOWN_UP_SIGNI_AND_CHOOSE・SUMMON_RESONA_FROM_LRIG_DECK・CHOOSE_COLOR_FROM_LIST・DESIGNATE_SIGNI_ZONE 等。engine実装済みなら decompiler に意味文を1行足すだけ。
- **B層（JSONデータ欠落・中リスク）**＝REVEAL_AND_PICK/LOOK_AND_REORDER で pick部分（「その中から…手札に加え」）が JSON に無く逆翻訳から脱落するカード（WXDi-P04-047 等）。curated JSON 補完が要る。

**過去の作業（大半完了）：(A) 表現の長いテール（個別）／(B) 新機構／(C) engine 実機配線（P2/P3）。** bulk 再生成は引き続き禁止。1機構/1パターンずつ §6 のゲートで。

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
  - ~~`ON_LRIG_GROW`(5)~~ **✅配線済(claude・2026-06-29)**＝`executeGrow`（人間・ゲットグロウ含む）/CPUセンターグロウで `collectLrigGrowTriggers` が発火（BUGFIXES参照）。⚠実機未検証(C2)・アシストグロウ経路は未カバー(follow-up)。
  - ~~`ON_COIN_PAID`(3)~~ **✅配線済(claude・2026-06-29)**＝コイン支払の各サイト（グロウ人間/CPU・シグニ【起】・キープレイ・シグニ【出】・アーツベット）で `collectCoinPaidTriggers` が発火（BUGFIXES参照）。⚠実機未検証(C2)・スペルベット/CPUルリグ【出】コインは未カバー(follow-up)。
  - ~~`ON_LRIG_ATTACK_STEP_START`(1)~~ **✅配線済(claude・2026-06-29)**＝`doPhaseAdvance` の ATTACK_SIGNI→ATTACK_LRIG 移行で `collectTurnTriggers` が発火（アクションはパース済み近似・BUGFIXES参照）。⚠実機未検証(C2)・CPUターンは未カバー(follow-up)。
  - ~~`ON_ALLY_PLAY_OR_OPP_HAND_DISCARD`(1・OR複合)~~ **✅配線済(2026-06-29)**＝WXDi-P11-064。`collectAllyPlayOrOppDiscardTriggers`（pure・golden化）＋中央 diff で発火（detectPlacedSigni/detectHandTrashed 再利用）。実 POWER_MODIFY＝実機で機能。⚠自効果限定は近似。
  - ~~`ON_MATERIAL_USED`(6・改造素材機構)~~ **✅完成（2026-06-29・改造素材 foundation Step1-3b）**＝『アーツ/クラフト』8枚プレイ可能化＋トークン3択UI（CHOOSE3＋GRANT_EFFECT）＋ON_MATERIAL_USED 全3変種（materialUsedByPlayer/self/any_ally）配線。engineUnwiredTimings から除去・同型★0・golden 85。⚠UI/granted能力は実機 /verify 推奨。
  - ~~`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`(1)~~ **✅配線済（2026-06-29）**＝WX07-036。`collectBanishOppByEffectTriggers`（pure・golden）＋中央 diff（detectBanishedSigni＋entry.cardNum=banisher）。実 GRANT_KEYWORD。⚠効果解決＝「効果によって」近似。
  - ~~`ON_LRIG_UNDER_MOVED`(1)~~ **✅配線済（2026-06-29）**＝WXDi-P04-042。`countLrigUnderMoved`（boardDiff）＋`collectLrigUnderMovedTriggers`（pure・golden・自ターン限定）＋中央 diff。STUB アクション実装済。
  - ~~`ON_DECK_SHUFFLED`(1)~~ **✅配線済（2026-06-29）**＝PR-470A。`deck_shuffled_count`（execShuffleDeck でインクリメント）＋`detectDeckShuffled`＋`collectDeckShuffledTriggers`（pure・golden）。実 POWER_MODIFY。⚠リフレッシュ等 execShuffleDeck 外は未計上。
  - ~~残＝`ON_KEYWORD_GAINED`(1)のみ＝WXDi-P04-035~~ **✅配線完了（2026-06-30・zerom）**＝`COPY_ABILITY` を実装（得たキーワードを `triggeringKeyword` 経由で watcher 自身へ付与）＋`detectKeywordGained`/`collectKeywordGainedTriggers` 新設＋resolveStackNext/resume 双方に配線。実 UI 検証 `keywordgained` PASS（豪槍で味方に【ランサー】付与→赤無払い→watcher コピー）。golden 96・全ハーネス緑。**engine 未配線 C1 timing は残0＝C1 完全消化。**
  - **Stage2(2026-06-29)**＝collect*Triggers を `src/engine/triggerCollect.ts` へ pure 抽出し **golden に発火条件テスト10件追加（自動検証化）**。抽出済4ファミリ＝`collectTargetedTriggers`(ON_TARGETED)/`collectLrigGrowTriggers`(ON_LRIG_GROW)/`collectCoinPaidTriggers`(ON_COIN_PAID)/`collectPowerZeroTriggers`(ON_SIGNI_POWER_ZERO_OR_LESS)。これらの発火条件は C2(実機)→golden(自動)へ移行。残る発火経路（CPU・forced単一対象・アシストグロウ等）と他 collect*Triggers は TODO §8 参照。
- **C2**　**R5-R58 の全 engine 配線が実機未検証** → PvP/CPU 実機検証。**🆕 2026-06-30＝専用 driver `scripts/verifyBattleDrive.mjs`（preview＋Playwright・要 verify-accounts.json/.env.local）でヘッドレス実機駆動が可能に**（盤面注入＋クリック列・シナリオ切替式）。**生STUB 3（WXK09-050/WD07-012/WXK02-029）＋C1 timing 3種（`ON_LRIG_GROW`=WXDi-P03-039 / `ON_COIN_PAID`=WXDi-P15-069 / `ON_DECK_SHUFFLED`=PR-470A）を実 UI 観測クローズ**＝既定スイート6件 全PASS。残 C1 timing（`ON_TARGETED`/`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`/`ON_LRIG_UNDER_MOVED` 等）は `scenarios` テーブルに追加して横展開（§3 次の一手①）。グロウ系は `H.openGrow`（GROW 再注入リトライ）でフェイズドリフト対策済。C1 の発火条件は **golden 自動検証済**（Stage2）なので実機は「総合動作」に絞れる。**🔎 `ON_DECK_SHUFFLED` のシャッフル源依存＋修正投入**＝シグニ【出】（スタック解決経路＝中央 diff `BattleScreen.tsx:4767`）は発火。スペル（SEARCHER）はカットイン解決（`handleCutinPass`）/resume（`handleEffectInteraction`）経路で中央 diff を通らず未発火だった→**`collectDeckShuffleInline` 共有ヘルパーを新設し両経路に ON_DECK_SHUFFLED 検出を追加**（既存 ON_PLAY/ON_BANISH 検出と同型）。engine 層は診断で発火確認済・回帰緑。**✅スペル経路の実 UI 確認 完了（2026-06-30・zerom）＝`deckshufflespell` シナリオ PASS**（SEARCHER 解決→`shuffled` 0→1→PR-470A#1 に +5000 反映を実 battle_states で確認）。**真因は2つ**：①`verifyBattleDrive.mjs` が `vite preview`＝**ビルド済 dist 配信**で、build せず古いバンドルを検証していた（→driver に `buildFirst()` 自動 build を追加。`SKIP_BUILD=1` でスキップ可）②`battleCardNums` が **`pending_spell`/`pending_effect` を走査せず**、注入スペル（VERIFY_DECK 外）が発動でハンドから抜け pending のみに在る瞬間に effectsMap から脱落→`handleCutinPass` で `spellEff=undefined`→効果 no-op 化していた（→`battleCardNums` に `pending_spell.card_num`/`pending_effect.sourceCardNum` を追加。通常プレイは deck data 経由で既ロードのため挙動不変、ハーネス検証を可能化＋潜在エッジを堅牢化）。検証判定も可視ログ走査→実 battle_states 照会（`queryState`）に強化。`deckshufflespell` を既定スイートに追加（既定7件 全PASS）。詳細 VERIFY_BROWSER.md / BUGFIXES.md。**✅残 C1 timing 3種も実 UI 検証完了（2026-06-30・zerom）＝`ontargeted`(ON_TARGETED・WXDi-P03-067)／`banishbyeffect`(ON_SIGNI_BANISH_OPPONENT_BY_EFFECT・WX07-036)／`lrigundermoved`(ON_LRIG_UNDER_MOVED・WXDi-P04-042) 全PASS（既定10件 全PASS）。検証中に resume 経路の取りこぼしバグ（対象選択を伴う効果で ON_SIGNI_BANISH_OPPONENT_BY_EFFECT/ON_LRIG_UNDER_MOVED が未発火）を発見・修正＝`collectBanishOppByEffectInline`/`collectLrigUnderMovedInline` を handleEffectInteraction に追加。これで engine 未配線だった C1 timing は実 UI 検証まで完了（残 `ON_KEYWORD_GAINED` のみ COPY_ABILITY 前提で保留）。詳細 BUGFIXES.md。**

**D. STUB テール（低優先）**
- STUB 544種/2372件。大半は**実装済みハンドラ**の表示（`[STUB:id]` はスキップ理由にしない＝個別検証）。残・単発生IDテール 54件は `STUBS.md` 管理（`node scripts/genStubsMd.mjs` で再生成）。

### 📌 次の一手（推奨順・**zerom 向け**）
> まず `npm install` → `npm run typecheck && npm run golden && npm run smoke && npm run fuzz` が全部緑になることを確認（CIでも自動実行される）。これが回れば環境OK。現状＝golden 96/96・smoke/fuzz 全0・同型★0。
>
> **🆕 現在の主作業＝(Z) 逆翻訳機の出力品質を原文一致へ（§1 4つ目・上の Z 節）**。§4「文法崩れ着手禁止」は解除済み。レンダラ5系統は是正済（BUGFIXES①〜⑤）。**表現パッチ（decompiler のみ・engine 不変）はゲートが軽い＝§6 の「逆翻訳ゲート」（同型★0＋原文照合）でよく、smoke/golden/fuzz は不要。**
1. **🆕 逆翻訳機の英語ID漏れ／文法崩れの残を1系統ずつ是正**＝`grep -hE "^\s+[A-Z0-9]+[-_][A-Za-z0-9-]+.*:" docs/decompile_sheet*.txt`（＝逆翻訳行）を `grep -ohE "[A-Z][A-Z0-9_]+" | sort | uniq -c | sort -rn` で英語漏れを多い順に出す。**engine実装済みSTUB id（COPY_LRIG_NAME_ABILITY 等）→ decompiler に原文意味文を1行足す**（`miscStubMap` 等の既存パターン）。手順＝対象id確認→engine実装の有無確認→`decompileEffects.ts` に意味文→該当シート再生成（**Bash `>`**）→下流再生成→同型★0＋原文照合→push。
2. **B層（JSONデータ欠落）**＝REVEAL_AND_PICK/LOOK_AND_REORDER で pick部分が JSON に無く逆翻訳から脱落するカード（WXDi-P04-047 等）。curated JSON 補完（中リスク・§2 のとおり直接パッチ）。
3. **実機検証（C2・任意）**＝`scripts/verifyBattleDrive.mjs`（シナリオ切替式）。生STUB 3＋C1 timing 6種は実 UI 観測クローズ済（既定10件 全PASS）。残 timing は `scenarios` に1件足すだけで横展開可。逆翻訳機の改善とは独立。
4. **CPU AI 拡張 / doPhaseAdvance pure 抽出**（TODO §6・§8）＝大型・任意。費用対効果は逓減。

> **新規 timing 配線の確立パターン（zerom 向け・今セッションで6回適用）**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦該当 decompile シート再生成（**Bash の `>`**）＋下流再生成＋同型★0 確認 ⑧typecheck/lint/smoke/golden/fuzz 全緑 → commit/push。

### 共有ファイルの扱い
- `BUGFIXES.md`：**新しいものを上に**追記（誰がやったか分かるよう日付/系統名を見出しに）。
- `src/`（型・engine・decompiler）は**機構実装時のみ**。着手前に §5 の状態を `着手中(名前)` にして push（次の人が同じ機構に手を付けないため）。

## 4. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外
> **2026-06-30 方針変更**：本節は元々「脱落疑いに出るが直さない＝真の偽陽性」のリストだった。しかし 2 と 3 は「機能は正常でも**逆翻訳が原文一致しない**＝逆翻訳機の品質問題」であり、**§1 4つ目（逆翻訳機の出力品質）の改善対象に格上げ**した（着手禁止を解除）。**真の偽陽性は 1・4・5・7**（脱落疑いツールの過検出＝逆翻訳は既に正しい）。**逆翻訳機品質問題は 2・3＋英語ID漏れ系（BLOCK_ACTION・timing/icon＝BUGFIXES④⑤で是正済）**。
1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。【真の偽陽性】
2. ~~**CHOOSE/チェインの1文圧縮**~~ **🔓2026-06-30 改善着手（zerom）**＝「次から[M]つ選ぶ【A/B】」→原文「以下の[N]つから[M]つ（まで）を選ぶ【A/B】」へ（from_count/upTo・STUB経路も整合）。択肢が全部出ていれば機能的には正しいが、総数N欠落・語彙不一致で原文一致しないため改善。BUGFIXES③参照。
3. ~~**REVEAL_AND_PICK / LOOK_AND_REORDER の文法崩れ**（着手禁止）~~ **🔓2026-06-30 着手禁止 解除（zerom）＝逆翻訳機の本格改善対象に格上げ**。「機能は正常」でも逆翻訳が原文一致しない＝大本の目的に反するため、レンダラ自体を原文一致するよう改善する方針に変更。`REVEAL_AND_PICK` は是正済（BUGFIXES上部・then フル節の文法崩れを配置系/別効果系の2形に整理）。残＝`LOOK_AND_REORDER`（「並べ替える」だけに潰れる等）/`LOOK_PICK_CHAIN`/`CHOOSE`圧縮 を順次。**⚠`_dropTriage` の「文法崩れ」件数は構造分類で文法品質を測れない＝改善は原文照合で確認。**
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
   - **engine/BattleScreen/decompiler を触ったら（C・D・Stage2 等）必ず `npm run smoke` ＋ `npm run golden` ＋ `npm run fuzz`**（全て実機不要・数秒。§7 参照。回帰0／全PASS を確認）。表現パッチ（parser/decompiler のみ）なら下記の逆翻訳ゲートでよい。
   - 該当シート再生成：`npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt`（**⚠Bash で実行。PowerShell の `>` は UTF-16LE を書き genReviewRepr 等の utf-8 読みを壊す。シートは1〜10のみ＝Sheet11は存在しない**）
   - 下流再生成：`node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all`
   - **逆翻訳が原文一致 ＆ 同型★0** を確認（必要に応じ `node scripts/_dropTriage.mjs` で分類の変化も確認）。
5. **記録＆バトン**：`BUGFIXES.md` に追記（新しいものを上）→ **§3 を上書き** → コミット（末尾に「要実機検証」）→ **push**。

## 7. 進捗の可視化／検証ハーネス（整備済み）
> **検証3層（実機検証を Claude がヘッドレスで代替）**：①表現＝decompile逆翻訳一致／②実行（壊れない）＝`smoke`（全効果・新品盤面）＋`fuzz`（乱択連鎖・進化盤面）／③正しさ＝`golden`（型ごと結果assert）。C/D 作業時は **smoke・golden・fuzz** を回帰チェックに回す。⚠どれも engine（executeEffect/resume*）が対象＝**BattleScreen.tsx の配線（フェイズ進行・トリガー収集 collect\*Triggers・effect_stack 整列）は対象外**（C2 実機 or Stage2 抽出が要）。
> **CI 自動実行（2026-06-29）**：`.github/workflows/ci.yml` が push/PR(master) で **typecheck・lint・golden・smoke・fuzz** を回す（golden/smoke/fuzz は失敗時に非ゼロ終了でCI失敗）。共同開発者の回し忘れを制度的に防止。`npm install` のみで動く（env/supabase 不要）。
- **`npm run smoke`（`scripts/smokeTest.ts`）＝②実行スモーク／不変条件ハーネス（2026-06-28新設）**。全カードの全効果（10557件）を**オートパイロット**（pending を最小入力で自動応答）でヘッドレス実行し、例外（CRASH）／無限ループ（HANG・step>STEP_CAP=200）／構造不変条件違反（INVARIANT）を機械検出。実機不要・数秒。**現状＝CRASH 0／HANG 0／INVARIANT 0／OK 10294／SKIP 263**（SKIP＝autopilot未対応の対話＝engine バグではない）。⚠「壊れない」を保証するもので「ルール的に正しい結果か（③）」は判定しない＝③は構文ゴールデン＋代表目視で別途。C（engine配線）/D（STUB実装）の回帰検出にこれを使う。
  - **autopilot ループ判定の修正（2026-06-29）**：旧判定は「同一pending**種別**が連続したら SKIP」だったため、SELECT_TARGET が連続するだけで候補が毎回変わる正常進行も誤SKIPしていた。**候補シグネチャ（type＋candidates/options/cards のJSON）が同一**のときだけ真のループとみなす方式に変更（`cd1edf23`）。STEP_CAP も 60→200 に拡大（`c796aa3d`）。
- **`npm run golden`（`scripts/goldenTest.ts`）＝③正しさの構文ゴールデンテスト（2026-06-29 npm登録）**。主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」を assert（型単位で正しさを担保＝全カードを帰納的に信頼）。**現状＝PASS 31／FAIL 0**（うち10件は Stage2 で追加した **トリガー収集テスト**＝`triggerCollect.ts` の ON_TARGETED/ON_LRIG_GROW/ON_COIN_PAID/ON_SIGNI_POWER_ZERO_OR_LESS 発火条件を HOST/GUEST 盤面で自動検証）。smoke が「壊れないか」を全カードで見るのに対し、本テストは型ごとの「正しさ」＋C1発火条件を見る。C/D 作業時は smoke と併せて回す。
- **`npm run fuzz`（`scripts/selfPlayFuzz.ts`）＝乱択 自己対戦ファズ＝②実行レベル検証の最終形（2026-06-29新設）**。smoke が「全効果を1回ずつ・新品盤面」で見るのに対し、本ファズは**ランダム初期盤面**を作り、その上で効果を次々発動→結果状態を持ち越し→別効果を発動…と**連鎖**させて「効果同士の相互作用」「進化盤面でのクラッシュ／ループ」「カード爆発（複製バグ）」を検出。**シード固定で完全再現可能**（既定＝200ゲーム×40手・約0.4秒・効果実行≈7800手／distinct≈2640種）。**現状＝CRASH 0／HANG 0／INVARIANT 0／EXPLOSION 0**。重め検証は `npm run fuzz -- --games 2000 --moves 80`。⚠engine の堅牢性を盤面遷移つきで見るもの＝BattleScreen 配線（collect\*Triggers 等）は対象外（→TODO §8 Stage2）。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。残り作業の性質が一目で分かる。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUE の health 計器（現在すべて 0）。回帰検出に使う。
- **`npx tsx scripts/_flattenList.ts`**＝timing flatten の EXIST/FRESH 差分（現在 0 枚）。

---
**関連**：`DESIGN.md`（設計方針）／`TODO.md`（残作業・引き継ぎ）／`BUGFIXES.md`（修正記録）／`effects-json-guide.md`（語彙）。
