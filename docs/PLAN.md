# PLAN — 開発計画（統合版）

> **2026-07-03統合**：以前は「今後の予定」を決める文章が `P1_PLAN.md`／`ROADMAP.md`／`TODO.md` の3つに分かれていて分かりにくかったため、この1本の `PLAN.md` に統合した。旧3ファイルは削除済み（内容はすべてここに移した）。
> **3人は同時に作業せず、順番に push / pull で引き継ぐ（バトン式）**。新セッション（cold start）は **本ファイル §4「現在地とバトン」→ `DESIGN.md`** の順に読む。
> 個別の修正記録は [BUGFIXES.md](./BUGFIXES.md)（新しいものを上に追記）。**原文照合の主軸ツールは [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)**（実行結果の目視照合・LLM不使用・決定論）。補完的発見器は [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)（LLM意味比較）。

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
- [ ] **🆕 BEHAVIOR_AUDIT の要レビュー・キューを逓減限界まで消化**（2026-07-03 着手・現在の本丸）。指標＝`node scratchpad/_bqTriage.mjs` の高シグナル件数（811→285→261→169→129→30…と逓減中）。
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
①要レビュー・キュー（`npm run audit -- --id <CardNum>` または `docs/grouped_sentence_all.txt`）を見る→②欠落把握→③`effects_*.json` を既存語彙で直す→④`npm run typecheck`→⑤該当シート再生成 `npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt`（**⚠Bash で実行。PowerShell の `>` は UTF-16LE を書き下流を壊す。シートは1〜10のみ）→⑥下流 `node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all`→⑦逆翻訳が原文一致＆同型★0を確認→⑧engineを触ったら `npm run smoke && npm run golden && npm run fuzz`→⑨`BUGFIXES.md` に追記→⑩本ファイル §4 を更新→commit/push。

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

---

## 4. 現在地とバトン（直近セッション）
> ① `git pull` → ② 本節を読む → ③ 作業 → ④ 本節と `BUGFIXES.md` を更新 → ⑤ commit & push を回す。詳細な修正履歴は `BUGFIXES.md`（新しい順）に積む。ここは**現在地・計画・残作業数だけ**。

### 📍 進捗サマリ（最終更新 2026-07-04）
- **🆕 セッション（2026-07-04・zerom・続き18）＝死角調査 第2〜4弾→census を両方向・94計測に拡張（ベースライン 1469→2023 再登録）**＝続き17の25計測の外側を3ラウンド系統調査（各ラウンド抜き取り較正・ほぼ全件実バグ）。**第2弾＝トリガー/コスト/ゾーン軸**：トリガー種別誤り約220（WX11-007/WX12-008「エクシードのコストとして置かれたとき」→ON_PLAY化・WX06-035 引用『アタック時−3000』が無条件常時化）・**BURST内IS_MY_TURN 42＝LB は相手ターン発動で常に偽＝then永久不発**（WX03-034。manualEffects:970 と同型の系統残）・**IS_MY_TURN誤変換疑い65＝parser フォールバック（effectParser.ts:896系）で実条件が消える**（WX05-013「8種類以上公開」→無条件全バウンス。**IS_MY_TURN は condition キーを持つため条件節センサスをすり抜ける＝センサス内部の死角**）・コイン/ベット24（WX15-006 ベット機構丸ごと消滅＝即時実行化・WXK10-013 アンコール2択+コスト全滅）・エナ置き45/デッキ下12/ルリグデッキ10・基本パワー=POWER_SET 6。**第3弾＝構造軸**：多択CHOOSE平坦化（WX24-P1-007 3択→1本即時化・WX14-011 原文に無い効果に変質+owner逆転）・能力マーカー構造census（引用+「【出】能力」参照除去で純化＝【常】6/【起】12/【自】7/【出】5/起個数13＝丸ごと欠落検出器）・「Nまで」120（WX12-008「2体までしか出せない」制限→ADD_TO_FIELD self という無関係効果）・次の相手ターン終了時まで99（唯一 engine が別枠管理する長期duration＝脱落は実挙動差）・相手が選ぶ31・出現条件35/55（**parser が【出現条件】を除去（effectParser.ts:2340）+engine/UI に強制なし＝レゾナがコスト無しで出せる構造ギャップ→§6 機構案件**）・遅延トリガー13（WX10-035 予約→即時化）。**第4弾＝逆方向（JSON→原文の幻覚検出・最後の未計測方向）**：逆action センサス＝BANISH22（PR-322 トラッシュ送りがバニッシュ化+コスト対象反転）/LIFE_CRASH22（**WX16-021 攻撃リダイレクト置換ルールが即時ライフクラッシュ化**）・逆数値4（WX24-P4-078 原文に無い シャドウ powerLte:5000 幻覚付与）・**引用付与平坦化161＝最大級系統**・代わりに183（WX06-003 置換が加算化＝両方実行）・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・BURST↔E1誤配置5（WD21-011 LB条件文がE2に合流）・アーツタイミング列 vs JSON はほぼ健全（5枚のみ）。クリーン確認＝LB有無両方向0・無作為/チャーム付着/X変数0・逆DRAW/SEARCH/EXILE/GAIN_COIN 0。**全プローブを vocabCensus.ts に組み込み（25→94計測・逆方向/構造セクション新設）＝ベースライン2023**。文字列突き合わせで原理的に見えない残り＝(a)参照解決（「それ」の指し先取り違え・WX09-015 bounce対象self化）(b)効果単位の粒度（カード単位判定のマスキング）(c)JSONは正しいがengine実装が違う（behavior-audit/goldenの領分）(d)文間の実行順序。横断的再発防止案＝**parser の無言フォールバック（IS_MY_TURN化・先頭肢採用・平坦化）に parseStatus:PARTIAL 刻印を義務付けると全網に載る**。tooling/docsのみ・engine不変・typecheck/lint/census 2023 緑。**次の一手＝§5c を新母集団で消化（条件節781→引用平坦化161→代わりに183 の順が実害効率最大）＋トリガーセンサスの残り抜き取り。**
- **セッション（2026-07-04・zerom・続き17）＝語彙センサスの残死角を全数調査→パターン10種＋数値不一致軸を lint 追加（census 14→25計測・ベースライン498→1469再登録）**＝続き15の14パターンの網羅範囲外を系統調査（JSON実語彙の全数集計→候補プローブ→カテゴリ別抜き取り目視で較正）。**新カテゴリの抜き取りはほぼ全件実バグ**：**条件節781枚（最大母集団）**＝WX06-002（「ルリグが白でライフ2枚以下の場合、代わりに」丸ごと脱落→無条件で両適用）/WX14-010・WX20-009（場色条件脱落）/WXK01-040（手札0枚条件脱落）・**クラス339枚**（JSON語彙は `story`＝較正済）＝WX05-026（トリガー「トラッシュから＜古代兵器＞が出たとき」→ON_PLAY化＋フィルタ無）/WX10-006（出現条件丸ごと欠落）・**数値不一致153枚（語彙有無では見えない新軸＝原文の4-5桁数値がJSONに不在）**＝WX06-028（「12000以下と10000以下の2体バニッシュ」→1体のみ）/WX13-030（LB「パワー合計10000以下で好きな数」→制約なし1体）/WX09-017（基本パワー15000・×3000 両方欠落）・**色105**・**正面32**（JSON全体で `frontOfSelf` 3件のみ。WX09-015=正面対象がself化＋《剣》名フィルタ脱落＋「そうした場合」がIS_MY_TURN誤変換の三重バグ）・**ターン1回制限28**（WXDi-D07-002=ソウル付与《ターン1回》アタック時効果が無条件CONTINUOUS PERMANENTエナチャージ化）・ライフクロス25・任意→強制23・能力なし10・以外6・ゲーム1回3。**不採用＝「持続(ターン終了時まで)」**（197ヒットだが engine が INSTANT の POWER_MODIFY/GRANT_KEYWORD を temp バケツ＝ターン終了時リセットで吸収・`effectExecutor.ts:503`/`BattleScreen.tsx:3707`＝偽陽性支配）。「そうした場合」（then連鎖の帰結句）は条件節から pre 除外。**census 手法自体の残死角として (a)トリガー種別誤り（WX09-012「スペル使用時」→ON_PLAY等・少数抜き取りで2件遭遇＝トリガーセンサス新設候補）(b)小さい数（1枚vs2枚）(c)出現条件（`forResonaCondition` 全JSONで7件のみ）を §5c に記録**。tooling/docsのみ・engine不変（smoke/golden/fuzz対象外）・typecheck緑・census 1469/1469 緑。**次の一手＝§5c を新母集団で再優先順位付け（条件節781が最大・実害も条件脱落＝無条件発火が最重）。**
- **セッション（2026-07-04・zerom・続き16）＝語彙センサス§5c 状態フィルタ脱落＝除去系の過剰効果を凍結7＋ダウン/アップ28効果 是正（census 529→498）**＝続き15で新設した `npm run census` の高シグナル状態フィルタ系から、**バニッシュ/バウンス/デッキ下/パワー減の対象フィルタ脱落**を2バッチ系統是正（原文「凍結/アップ/ダウン状態のシグニを対象」→JSONは全シグニ＝過剰効果）。**根本原因＝parser のインライン target ビルダー（BOUNCE/BANISH-all/TRANSFER_TO_DECK）が `parseSigniTarget` と違い状態フィルタを落としていた**→共通ヘルパー `parseStateFilter`（frozen/down/up）新設＋4ビルダー配線（デッキ下は `parsePowerFilter` も欠落→追加）＝**parser を先に正してから curated に注入＝乖離を作らない**（held 25 不変）。凍結7は手patch、ダウン/アップ28は **parser 出力を source of truth に effectId 単位で自動注入**（各効果スコープ内 walk＝複数バウンス持ちでも正しい側だけ）。engine の matchesFilter は isFrozen/isUp/isDown 実装済＝配線不要。typecheck緑・golden 113・smoke 全0（SKIP 266→263）・fuzz 全0・同型★0・逆翻訳原文一致・シート2/3/5/7/8/9再生成。詳細 BUGFIXES 上部。**次の一手＝§5c の残バッチ（パワー閾値84・レベル閾値90＝parser の閾値ヘルパー拡充→curated 注入で同パターン）。状態系の残（コスト節/条件/CONT）は §6.3。**
- **セッション（2026-07-04・zerom・続き15）＝過剰効果（フィルタ脱落）の死角を発見・語彙センサス lint 新設**＝ユーザー報告の SP07-010（「最も大きいパワーを持つすべてのシグニを手札に戻す」→無条件 `BOUNCE ALL`＝最大パワー限定の脱落）を起点に、**既存網（behavior-audit＝無変化no-op／脱落疑い＝文数比較／smoke＝クラッシュ）がすべて「足りない側」しか見ておらず、対象フィルタ脱落による過剰効果（盤面は変化する）が構造的死角**と特定。**`scripts/vocabCensus.ts`（`npm run census`）を新設**＝原文修飾句14パターン（最上級/動的比較/パワー・レベル閾値/凍結・ダウン状態/同一性/共通色/名前包含/否定/数量比例/合計制約/それぞれ異なる/奇偶）× カードJSONの対応語彙40種超の全数突き合わせ。**高シグナル欠落（STUB/MANUAL無しで語彙ゼロ）＝529枚をベースライン登録**（明細 `docs/_vocab_census.txt`・スクリプト内 `BASELINE_HIGH`＝超過で exit 1）。キー表は抜き取り較正済（`SELF_POWER_GTE`/`levelFilter:"same"`/`$ref` 等の条件系・動的解決系を偽陽性除外）。抜き取り精度＝6枚中4枚が確定バグ：**WX09-016**（ダウン状態フィルタ脱落→全シグニ保護の過剰）・**WX13-039**（凍結フィルタ脱落→任意バウンス）・**WX08-036**（powerRange脱落）・**WX03-001**（専用語彙 `levelEqualsVar:'field_trash_level'` がJSON未使用）＋WX07-006（レゾナ出現条件＋【常】2体制限の丸ごと欠落疑い）。最上級はDSL語彙自体が無い＝8枚全滅系統（SP07-010/WXDi-P08-009/WX08-024/WXDi-CP01-026/WXDi-CP02-070/WX25-CP1-051等）。**残作業＝§5c（529枚の系統別消化・過剰効果系から）**。tooling/docsのみ・engine不変（smoke/golden/fuzz対象外）・typecheck緑。
- **セッション（2026-07-04・zerom・続き14）＝BEHAVIOR_AUDIT 段階4・第8収穫＝GLA無言no-op18ノード＋ルリグアップ誤対象13ノード＋per-count選択no-opエンジンバグ**＝(1)**GRANT_LRIG_ABILITY `abilities:[]` 系統**（アーツ/ピース経路の rawText 展開漏れ・複数引用「…」「…」の2能力目以降脱落・「使用タイミング《…》を得る」後置文の飲み込み）を `expandGrantLrigAbilities` に統一して是正＝curated 10ノード書込（WXDi-P06-004等）＋展開品質が低く過剰発火になる4枚は MANUAL 化で no-op 据置（WX15-016/WD21-009/PR-204/PR-238＝§6.3）。**permanent 機構新設**＝「このゲームの間」付与は `permanentGrant` を刻みターン境界リセット3箇所の filter で残す。(2)parser に UP LRIG ルールを足したら parserWorklist が curated の**「このルリグをアップ」→UP{SIGNI} 誤対象13ノード**を検出（計器の好例）→全是正＋新条件 `CENTER_LRIG_IS_UP`。(3)**engine実バグ＝per-count系パワー修正（PER_{TRASH,LIFE,HAND}_COUNT）の選択後無限再プロンプト＝no-op**（applyDirectAction の case 欠落＝続き7と同族）→thenAction を POWER_MODIFY に変換して修正・**smoke SKIP 283→268**。(4)シナリオビルダー3拡充（levelフィルタ播種・EQUALIZE_ENERGY エナ増量・PER_TRASH_COUNT トラッシュ播種）＝WXK11-058/WD03-011/WXK02-061 等の偽陽性解消。(5)**同日その2＝「ゲームから除外」の TRASH{TRASH_CARD} 完全no-op系統**（続き6の場シグニ除外の残り＝ゾーン除外編・parser が EXILE 実装後も旧 TRASH 近似のままで curated 22ノードに伝播）→parser EXILE 化＋curated 12ノード是正（WX10-023 は CHOOSE 2択の構造ごと再エンコード）。(6)**NAME_BAN engine実装（§6.1 A 消化）**＝engine未実装＋targetSelf 反転（禁止対象が自分）の二重バグ→`blocked_card_names_game`（ゲーム内持続）で実装。**高シグナル 30→17・要review 129→102**。golden 108→**113**・全ゲート緑・同型★0・**parserWorklist held 25（LOSS 10/VALUE 15）＝ベースライン水準**。詳細 BUGFIXES 上部。⚠要実機検証＝permanentGrant のターン跨ぎ保持・付与【起】エクシードの UI 発動・NAME_BAN のゲーム内持続。
- **セッション（2026-07-03・zerom・続き13後半）＝条件の無言脱落2系統＋ドロー脱落系統を横断是正**＝(1)**新機構 `ARTS_USED_THIS_TURN`**（turn_arts_used フラグ・executeArts設置・ターン境界リセット5箇所・parser昇格・decompiler描画）で「このターンにあなたがアーツを使用していた場合」の**11枚全滅の条件脱落＝無条件過剰発火**を解消（golden 108/108 に条件ゲートテスト追加）。(2)「カードをN枚引き【エナチャージM】」の**ドロー無言脱落24ノード**（parserショートハンドの飲み込み→curated伝播・WXDi-P07-071 は BURST↔E1 誤配置も発見）を parser＋curated セットで是正。(3)「このシグニのパワーがN以上の場合、」の**条件脱落21枚**に SELF_POWER_GTE 付与＋parser昇格（読点必須ガード＝使用条件文への誤マッチ回避）。(4)「代わりに」二段閾値型2枚（WXDi-P02-061/WX24-P1-081）を CONDITIONAL then/else で正エンコード（P1-081は強化側が自傷targetだった実バグも是正）。全ゲート緑・同型★0。詳細 BUGFIXES 上部。⚠要実機検証＝turn_arts_used。
- **セッション（2026-07-03・zerom・続き13）＝健全性監査→PER_ENERGY実装・parserパリティ回復・curated実バグ4件**＝(1)続き12の「パリティOK」が誤りだった `POWER_MODIFY_PER_ENERGY`（WX09-019・engine完全no-op）を calcFieldPowers に実装（golden 107/107）。(2)owner58/protection24 の系統パッチをパーサーにも反映し **parserWorklist held 94→24**（owner 27→0・count 23→3）＝計器の回帰検出機能を概ね回復（残28の内訳は恒久指標参照）。(3)精査で curated 実バグ4件是正＝**WX25-P1-106-E1**（相手ミルownerが self＝自デッキ削り実害）・**WXDi-P15-055-E3**（引用【自】付与を自ミル即時6に平坦化→GRANT_QUOTED_AUTO_ABILITY 再エンコード）・WXEX1-27-E2/WXK09-047-E1（protection count 取り漏らし）。全ゲート緑・同型★0・詳細 BUGFIXES 上部。**⚠教訓＝JSON系統パッチは (a)パーサー同修正 or (b)parseStatus MANUAL化 or (c)恒久指標の実数更新 をセットにする（計器のベースライン0を守る）。**
- **セッション（2026-07-03・zerom・続き12）＝逆翻訳パリティ系統修正②（decompiler単独・engine不変）**＝キュー triage 中に、前回の PER_TRASH 系4case分割で取り残された2つの表現バグを是正。(1)`POWER_MODIFY_PER_{CHARM,ENERGY,VIRUS_COUNT}` を束ねる case の delta フォールバックが実フィールド名 `deltaPerCharm/Card/Virus` を読まず**「＋0」と誤表示**していた6効果を是正（WX07-045/WX08-031/WX09-019/WX11-034/WX16-032/WX16-046）＋WX07-045の`trashed_this_effect`変種を「この方法でトラッシュに置いた【チャーム】の枚数」に。(2)`POWER_MODIFY_PER_TRASH_COUNT` が数える名詞を常に「シグニ」固定していたのを `countFilter.cardType` 由来に是正（cardType無し＝「カード」・スペル等はその語）＝「《黒》のカード」「スペル」系 約9効果を原文一致に（WXDi-P16-013/WX12-053/PR-402/WX22-031 等）。(3)全 per-count 型を総点検し追加是正＝`PER_HAND_COUNT` が `deltaPerCard` を読まず**「－NaN」**（WXDi-P16-070）／`BY_TARGET_LEVEL`・`PER_TRASHED_LEVEL` が値を落として曖昧表示だったのを `deltaPerLevel` 表示に（WX06-021/037・WX09-021・WXK03-075）＝計5効果。engineは全該当フィールド/フィルタを既に正しく処理＝パリティOK。(4)`ATTACK` timing ラベル未登録でヘッダに生「ATTACK」漏れ（441効果）を「（アタックフェイズ起動）」化＋グルーピング3スクリプトの normalize を先行スラッシュ込み除去に統一し**同型★0維持**。(5)`BANISH_SUBSTITUTE` の代替コスト活用崩れ（「トラッシュするてもよい」→「トラッシュに置いてもよい」等・3効果）。(6)トップレベル英語enum漏れ残3種＝`GRANT_PROTECTION from:POWER_MODIFY`（「POWER_MODIFYされない」→「パワーを増減されない」4効果）・`ON_ENERGY_FROM_TRASH` timing（3効果）・`DURING_PHASE` phase名（`ATTACK_SIGNI_OP`→「対戦相手のアタック」1効果）。残る英語漏れは `[STUB:…]` 内部の機構説明文＝§5bテールのみ。全て decompiler/tooling のみ・engine不変・同型★0維持。typecheck緑・同型★0維持・全10シート＋下流再生成。engine不変につき smoke/golden/fuzz 対象外。詳細 BUGFIXES 上部。
- **🆕 セッション（2026-07-03・zerom・続き11）＝BEHAVIOR_AUDIT 段階4・第5〜7収穫＝実バグ2種＋シナリオ拡充5点＋逆翻訳パリティ系統修正**。(1)**真no-op①**＝`VARIABLE_DISCARD_AND_DRAW`（WX09-Re15）が型/parser/decompilerにあるのに**engine dispatch未配線＝完全no-op**を発見・実装（SELECT_TARGETで任意枚捨て→捨てた数+bonus引く・`DrawAction.addLastProcessedCount`で連結・golden106/106）。(2)**真no-op②＋トリガー機構バグ**＝`ON_LEAVE_FIELD` の `collectLeaveFieldTriggers` が **turnOwner未判定**で相手ターン限定の味方離脱が両ターン過剰発火（any_ally+turnOwnerの5枚該当）→ターンゲート追加。併せて**WX19-003-E2**「相手ターン中あなたの水獣が離れたとき」が `scope`無し(=self)で**恒久no-op**→any_ally+filter水獣+turnOwner:opponent に是正・parser再パース耐性も追加。(3)**シナリオビルダー5点拡充で偽陽性削減**＝スペル/アーツのゾーン対象を全カードプール配置・SEARCH `from`・PLACE系文字列source+複数枚count・countFilter系「場のクラスXにつき」・TAKE_FROM_UNDER_SIGNIのスタック下配置。(4)**逆翻訳パリティ系統修正**＝`POWER_MODIFY_PER_{TRASH_COUNT,LIFE_COUNT,STACK,FIELD}` を1caseに束ねて一律「場の…1体につき」と誤表示していた（ゾーン/unitSize/variety無視・WX17-026は「＋0」）のを4case分割し**約30効果を原文一致に改善**。**要review キュー 169→129・高シグナル 56→30**。「対戦相手のシグニが離れたとき」を見る新機構要の3枚は §6 登録。typecheck緑・golden106・smoke0・fuzz0。詳細 BUGFIXES 上部＋[BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)。**⚠知見＝behavior-audit の盤面差分はトリガー条件を模擬しない（action直接実行）ため、トリガー主語バグは逆翻訳↔原文の目視照合で拾う＝semantic補完を実証。**
- **🆕 セッション（2026-07-03・zerom・続き10）＝意味照合系統②＝GRANT_PROTECTION 単体保護24件を count:'ALL'→1 是正**＝保護コレクタが count===1 分岐でしか source を保護せず count:'ALL' が no-op だった系統。原文分類で単体保護24件を count:1 化（うち from=シグニ/any/ルリグ+シグニ の13件は保護発火を実地確認・残11件はアーツ/ルリグ単独 from で engine 配線が別途要）。逆翻訳も原文一致・同型★0・smoke0・golden101/101・fuzz0。詳細 BUGFIXES 上部・残 §6。behavior-audit の instant型ギャップは ROI 逓減のため、より大口の semantic 系統②に切替えた回。
- **🆕 セッション（2026-07-03・zerom・続き9）＝BEHAVIOR_AUDIT 段階4・第4収穫＝未実装 `LEVEL_MODIFY`(9)実装**＝実効レベル機構（`temp_level_mods`＋`matchesFilter` の optional `effectiveLevel`＋`fieldCandidates` 算出）を局所導入し「レベル-N→レベル≤Mフィルタで対象化」まで golden で検証（101/101）。core targeting 変更だが smoke/fuzz 回帰なし。キュー176→167。**⚠層の教訓**＝POWER_MODIFY_PER_ENERGY は CONTINUOUS＝instant executor では直らず撤回、§6 worklist を instant/CONTINUOUS で再分類。詳細 BUGFIXES 上部。
- **🆕 セッション（2026-07-03・zerom・続き8）＝BEHAVIOR_AUDIT 段階4・第3収穫＝未実装action型を網羅発見（14種42効果）・`EQUALIZE_ENERGY`(6)実装**＝action位置なのに engine/UI に型名が一度も無い＝完全no-opの型を走査で確定。`EQUALIZE_ENERGY`（各プレイヤーのエナをN枚に調整）を実装（golden 100/100・smoke0・fuzz0）。残13種36効果は **§6** に worklist 化（A自己完結型＝LEVEL_MODIFY等／B横断統合型＝GROW_COST_REDUCTION等）。**「逆翻訳は出るが engine が動かない」死角を behavior-audit の盤面差分が発見**。詳細 BUGFIXES 上部。
- **🆕 セッション（2026-07-03・zerom・続き7）＝BEHAVIOR_AUDIT 段階4・第2収穫＝「エナを選択でトラッシュ」完全no-opの engine バグを修正＝76効果一挙解消（キュー253→177）**＝TRASH の resume 適用（effectExecutor.ts 4387〜）が SIGNI/DECK_CARD/HAND_CARD のみで **ENERGY_CARD 分岐を欠き**、「エナをN枚選択トラッシュ」が選択後 no-op になっていた（count:'ALL' のみ inline で動作）。ENERGY_CARD 分岐を追加（保護チェック込み）。JSON/decompiler 不変・同型★不要。typecheck緑・smoke0・**golden 99/99（+1）**・fuzz0。**smoke の死角（SELECT_TARGET は通すが盤面変化を assert しない）を behavior-audit が捕捉した好例。** 詳細 BUGFIXES 上部。
- **🆕 セッション（2026-07-03・zerom・続き6）＝BEHAVIOR_AUDIT 段階4・初の実バグ収穫＝場シグニ「ゲームから除外」誤エンコード12件是正**＝audit キューを高シグナル選別（動作動詞×STUB無×条件無×無変化）して発見。原文「シグニをゲームから除外」が `TRASH{TRASH_CARD,opp}`(no-op) に化けていた系統バグ。**engine に `execExile` の場シグニ除外分岐＋apply の `removeFromField` 除去を新設**＋JSON12件是正（除外10・デッキmill1・自トラッシュ除外1）。同型★0維持・typecheck緑・smoke0・**golden 98/98（EXILEテスト2追加）**・fuzz0。キュー261→253。詳細 BUGFIXES 上部。**段階4は継続可（キュー253を高シグナル順に消化）＝behavior-audit が「find→fix→verify」ループを実証。**
- **📚 過去セッション要約①（2026-06-30〜2026-07-03・BEHAVIOR_AUDIT基盤構築〜逆翻訳原文抽出）**＝(1) BEHAVIOR_AUDIT 段階1〜3を構築（シナリオビルダー→盤面差分器→HTML表レンダラ、`npm run audit`/`audit:html`）し要レビュー・キューを811→261まで削減。(2) 意味照合監査（LLM）パイプラインを新設し、owner取り違え系統・GRANT_PROTECTION `count:'ALL'`系統等の系統バグを発見・worklist化（§6）。(3) 逆翻訳機の英語ID漏れ・文法崩れをレンダラ単位で多数是正（REVEAL_AND_PICK／LOOK_AND_REORDER／CHOOSE／BLOCK_ACTION 等・BUGFIXES⑥〜㉒＝英語ID漏れ 582→367）。**詳細は `BUGFIXES.md`（2026-06-30〜07-02付近の各エントリ）を参照**。

### 📍 過去セッション要約②（2026-06-29〜2026-06-30・C1/C2 engine配線・改造素材機構・実機ドライバ・Stage2）
- **engine未配線 timing 群を全配線（C1完了）**＝`ON_TARGETED`/`ON_LRIG_GROW`/`ON_COIN_PAID`/`ON_LRIG_ATTACK_STEP_START`/`ON_ALLY_PLAY_OR_OPP_HAND_DISCARD`/`ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`/`ON_LRIG_UNDER_MOVED`/`ON_DECK_SHUFFLED`/`ON_KEYWORD_GAINED` 等15種を新パターン（pure collector `triggerCollect.ts`＋detector `boardDiff.ts`＋中央diff発火＋golden）で配線。
- **改造素材機構（`ON_MATERIAL_USED`）を完成**＝『アーツ/クラフト』8枚プレイ可能化＋トークン3択UI＋全3変種配線。
- **Stage2＝BattleScreen配線の pure 抽出**＝`collect*Triggers`全28関数／detect・count17関数をpure化しgolden自動検証化（golden 79/79）。`doPhaseAdvance`本体のみ着手を見送り。
- **C2実機検証を開始**＝フルBattleScreen実機driver（`scripts/verifyBattleDrive.mjs`）を新設し、生STUB3種＋C1 timing複数種を実UIクリックで発火・観測（既定スイート全PASS）。
- **A表現テール多数是正**＝保護/制限系STUB・アーツコスト軽減句・生STUB id露出を0達成。
- **検証ハーネス3層＋CI整備**＝`npm run smoke`/`golden`/`fuzz`＋CI（`.github/workflows/ci.yml`）が push/PR で自動実行。
- **詳細は `BUGFIXES.md`（2026-06-29〜06-30付近の各エントリ）と [VERIFY_BROWSER.md](./VERIFY_BROWSER.md) を参照。**

### 📊 恒久指標（維持中・逐次更新）
- **P1 表現①の systematic 指標**：同型★0（`node scripts/groupSimilar.mjs --all`）。**parserWorklist は held 25 / LOSS 11 / VALUE 14（2026-07-03 続き13後半終了時点・`npx tsx scripts/parserWorklist.ts`・⚠HEAD比較＝未コミットJSONは反映されない）**＝旧記載「全0」は curated 手パッチ（owner58/protection24 等）でパーサー未同修正のまま 94 まで増えていたのを、続き13でパーサー同修正＋curated実バグ是正（4件＋条件2系統＋draw脱落系統）で回復した後の実数。残25は (a)LOSS 11＝curated 側の機構修正（EQUALIZE_ENERGY owner・EXILE 等）にパーサーが追いついていない真の弱点ワークリスト、(b)VALUE 14＝count 慣例の非一貫性（CONT保護は count 無視＝機能同値・WX18-034/WXEX1-35 等）・duration 文脈テール（WX25-P2-062）と単発テール。**この数字から増えたら回帰**（JSON手パッチ時は パーサー同修正 or MANUAL化 or ここを実数更新）。
- **脱落疑い 255枚を全分類済み**（偽陽性179／機構待ち72／修正済・`node scripts/_dropTriage.mjs`）。
- **timing flatten**（当初159枚の実バグ）は R5-R58 で完了＝VALUE 0（詳細 §7下部）。
- **🆕 語彙センサス（過剰効果＋幻覚＝両方向の計器）**：`npm run census`（`scripts/vocabCensus.ts`）＝**高シグナル欠落 2023枚（2026-07-04 続き18・両方向94計測に拡張後の再登録。履歴 529→522→498→1469→2023・明細 `docs/_vocab_census.txt`）**。この数字から増えたら回帰（スクリプトが exit 1）。JSON手パッチでフィルタ語彙を足せば自然に減る＝減ったら `BASELINE_HIGH` とここを実数更新。DSLに新語彙を足したらキー表（PATTERNS）にも追加する。状態系の残（凍結13・ダウン/アップ38）はコスト節/条件/CONT型（別パス・§6.3）。
- **母数**：効果カード 5975／効果 10549／MANUAL効果 733／STUB含むカード 1820。
- **A3クローズ＋B機構全完了（B1-B4）**。残るP1機構＝C（engine実機配線・P2）のみ。同型★0（5986枚）。
- ⚠**decompile再生成は Bash の `>` を使う**（PowerShell `>` は UTF-16 で下流破壊）。

### 📌 次の一手（推奨順）
> まず `npm install` → `npm run typecheck && npm run golden && npm run smoke && npm run fuzz` が全部緑になることを確認（CIでも自動実行される）。これが回れば環境OK。現状＝golden 106/106・smoke/fuzz 全0・同型★0。
>
> **現在の主作業＝BEHAVIOR_AUDIT 段階4（キューから欠落no-opバグ潰し）**。手順＝**キューは古くなるのでまず `npx tsx scripts/behaviorAudit.ts --queue > docs/_behavior_queue.txt` で再生成**→`node scratchpad/_bqTriage.mjs`（要review キュー109を高シグナル選別）→ `npm run audit -- --id <CardNum>` で原文｜逆翻訳｜盤面差分｜ログを目視→「真no-op（engine未実装/誤配線）／シナリオ空振り（＝`behaviorAudit.ts` のシナリオビルダーを拡充して偽陽性を消す）／STUB未実装」に仕分け→バグは §3 ワークフロー（JSON直パッチ＋engine/decompilerセット＋golden1件＋smoke/golden/fuzz）で修正。**engine を触ったら smoke/golden/fuzz 必須**。残る高シグナル19の主な内訳＝トリガー主語系（audit はトリガー条件を模擬しない＝WX04-082/099/102 等は逆翻訳照合で判定）・CHOOSE 分岐・出現条件レゾナ（WX09-012/WX12-010）・§6.3 既登録の機構待ち（WX25-P2-009 等）＝逓減域。詳細 [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md)。§6（未実装action型 worklist・対戦相手シグニ離脱トリガー3枚）も残タスク。
>
> **旧・主作業＝逆翻訳機の出力品質を原文一致へ（§5b）**。レンダラ5系統は是正済（BUGFIXES①〜⑤）。**表現パッチ（decompiler のみ・engine 不変）はゲートが軽い＝§3の「逆翻訳ゲート」（同型★0＋原文照合）でよく、smoke/golden/fuzz は不要。**
1. **逆翻訳機の英語ID漏れ／文法崩れの残を1系統ずつ是正**＝`grep -hE "^\s+[A-Z0-9]+[-_][A-Za-z0-9-]+.*:" docs/decompile_sheet*.txt`（＝逆翻訳行）を `grep -ohE "[A-Z][A-Z0-9_]+" | sort | uniq -c | sort -rn` で英語漏れを多い順に出す。**engine実装済みSTUB id（COPY_LRIG_NAME_ABILITY 等）→ decompiler に原文意味文を1行足す**（`miscStubMap` 等の既存パターン）。
2. **B層（JSONデータ欠落）**＝REVEAL_AND_PICK/LOOK_AND_REORDER で pick部分が JSON に無く逆翻訳から脱落するカード（WXDi-P04-047 等）。curated JSON 補完（中リスク・§3のとおり直接パッチ）。
3. **実機検証（C2・任意）**＝`scripts/verifyBattleDrive.mjs`（シナリオ切替式）。生STUB 3＋C1 timing 6種は実 UI 観測クローズ済（既定10件 全PASS）。残 timing は `scenarios` に1件足すだけで横展開可。逆翻訳機の改善とは独立。
4. **CPU AI 拡張 / doPhaseAdvance pure 抽出**（§8）＝大型・任意。費用対効果は逓減。

> **新規 timing 配線の確立パターン**：①該当カードの effect/原文を確認 ②`triggerCollect.ts` に pure collector 追加（`mkLimitOk`/`ownFieldSources`/`effsOf` 流用）③検出が要れば `boardDiff.ts` に detector 追加 ④BattleScreen 中央 diff ブロック（`resolveStackNext` 内・mill/freeze 等と同じ場所）に発火配線＋薄いラッパ ⑤`goldenTest.ts` に発火条件テスト ⑥`decompileEffects.ts` の `engineUnwiredTimings` から除去 ⑦該当 decompile シート再生成（**Bash の `>`**）＋下流再生成＋同型★0 確認 ⑧typecheck/lint/smoke/golden/fuzz 全緑 → commit/push。

---

## 5. フェーズ1残作業：表現（P1）

### 5a. BEHAVIOR_AUDIT によるバグ収穫（現在の主作業・2026-07-03〜）

**目標＝要レビュー・キュー（`node scratchpad/_bqTriage.mjs`）を逓減限界まで消化。** 全効果を実行し盤面差分＋ログを原文と目視照合＝逆翻訳の文字列一致では検出できない「真no-op」「未配線timing」「未実装action型」「トリガー主語ミス」を発見して直す。手法・キュー件数の推移は [BEHAVIOR_AUDIT.md](./BEHAVIOR_AUDIT.md) を参照（811→285→261→169→129→高シグナル30）。

- [ ] **キュー消化を継続**：`node scratchpad/_bqTriage.mjs` で高シグナル選別 → `npm run audit -- --id <CardNum>` で目視 → 「真no-op／シナリオ空振り／STUB未実装」に仕分け → バグは effects JSON 直パッチ＋engine/decompilerセット＋smoke/golden/fuzz で修正。
- [ ] **未実装action型 worklist**（§6）＝action位置なのに engine/UI に型名が一度も現れない完全no-opの型。残11種27効果。
- [ ] **意味照合監査（semantic audit）の worklist**（§6）＝BEHAVIOR_AUDIT の盤面差分では拾えないSTUB/MANUALの意味エラー（owner取り違え・GRANT_PROTECTION no-op 等）の補完的発見器。
- [ ] **完了判定**：高シグナル件数がこれ以上減らない逓減限界に達した時点で「P1完了＋P2の一部前倒し完了」を宣言し、残りは個別カードの機構待ちとして §6/§7 に送る。

### 5c. 語彙センサス2023枚の系統別消化（2026-07-04新設・続き17-18で両方向94計測に拡大・過剰効果＋幻覚バグ）

**目標＝`npm run census` の高シグナル2023枚（両方向94計測）を系統別バッチで0へ逓減。** 過剰効果（フィルタ・条件・使用制限の脱落で対象/発火が広がる・ゲームを壊す側）と幻覚（原文に無い効果/数値がJSONに居る・逆方向）は behavior-audit の無変化キューに掛からない別種のバグ母集団（発見経緯は §4 続き15、拡充は続き17-18）。

- **優先順（続き18改訂）**＝(1) **条件節781**＝条件丸ごと脱落→無条件発火は実害最大＆最大母集団（`condition`/`activeCondition` 系語彙ゼロのカード。まず頻出形「場に○のシグニがある場合」「手札N枚の場合」等でサブ系統化）。(2) **幻覚/取り違え系（少数・即パッチ可・実害極大）**＝逆action BANISH22+LIFE_CRASH22+FREEZE1（WX16-021=即時ライフクラッシュ幻覚）・逆数値4・BURST内IS_MY_TURN42（LB不発）・BURST↔E1誤配置5・アーツタイミング5・マーカー構造【常】6/【起】12/【自】7/【出】5/起個数13。(3) **構造平坦化系**＝引用付与平坦化161・代わりに183・IS_MY_TURN誤変換65・遅延13・「Nまで」120。(4) 除去系の対象フィルタ脱落（クラス339=`story`・色105・パワー閾値83・レベル閾値90・凍結13・ダウン/アップ38・数値不一致153・小さい数390=粗い網）。(5) トリガー種別（約220）・コスト脱落（コイン24+場トラ25+エナトラ12+他）・ゾーン行き先67・機構census（ライズ31/チーム25/アンコール22/エクシード16等）・公開128・次相手ターン99・相手選ぶ31・制限58・キーワード86。(6) 制限/様相（ターン1回28・ゲーム1回3・任意→強制23）・保護/付与系（同一性46・共通色66・能力なし10）。(7) 語彙自体が無い系統＝最上級（6枚・`TargetFilter` に `superlative:{key,dir}` 新設）・**正面32**（`frontOfSelf` はあるが使用3件＝parser 未配線疑い）・動的比較の残36・合計制約27・**出現条件35＝機構1本の欠落（parser が除去+engine強制なし）**は §3「機構実装の型」で新語彙＋engineセット実装。
- **進め方**＝§3 の1ラウンド式そのまま：系統ごとに `docs/_vocab_census.txt` の該当ID群を精査→偽陽性（条件系語彙で表現済み等）はキー表（`vocabCensus.ts` の PATTERNS）に反映→真バグはパーサー修正を先に確立（DESIGN §2）→effectId アンカーで JSON 一括パッチ→parserWorklist held 25 維持→census 数字が減ったら BASELINE_HIGH 更新。
- ⚠判定はカード単位の粗い網（同カード別効果に語彙があれば合格＝過小評価）。効果単位の精密化は消化が進んでから。
- **census 手法自体の残死角（続き17調査・未計測）**＝(a) **トリガー種別誤り**（WX09-012「青のスペルを使用したとき」→ON_PLAY・WX05-026「トラッシュから場に出たとき」→ON_PLAY＝少数抜き取りで2件遭遇）→**「原文トリガー句 × timing enum」のトリガーセンサス新設が次の lint 候補**。(b) 小さい数の不一致（1枚vs2枚＝数値不一致は4-5桁のみ）。(c) レゾナ出現条件の欠落（`forResonaCondition` 全JSONで7件のみ・WX10-006/WX07-006 で確認）。(d) 「そうした場合」then連鎖の誤変換（WX09-015 が IS_MY_TURN 化＝個別バグとして扱う）。

### 5b. 逆翻訳機の出力品質（低優先のテール・大半消化済み）

**目標＝英語ID漏れ残（367件）の解消＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。**2026-07-03時点でBEHAVIOR_AUDITに主作業の座を譲ったため、手が空いたときのサブタスク位置づけ。**

- ~~① REVEAL_AND_PICK 文法崩れ~~ **✅是正（2026-06-30・BUGFIXES①）**＝then フル節の二重主語崩壊を配置系/別効果系の2形に。
- ~~② LOOK_AND_REORDER 行き先欠落~~ **✅是正（BUGFIXES②）**＝destination（一番下に置く/上に戻す）を描画・513枚。
- ~~③ CHOOSE 圧縮~~ **✅是正（BUGFIXES③）**＝「次から」→「以下のNつからMつ（まで）を選ぶ」。
- ~~④ BLOCK_ACTION 英語ID漏れ~~ **✅是正（BUGFIXES④）**＝「は「ATTACK」ことができない（END_OF_TURN）」108件→0。制限/許可/特殊の3分類。
- ~~⑤ timing/icon 英語漏れ~~ **✅是正（BUGFIXES⑤）**＝TRAP_ICON→【トラップアイコン】/SONG_ICON→【歌のカケラ】/ON_BLOOM/血晶武装 等。
- [ ] **残＝engine実装済みSTUB id の意味文化**（`[STUB:ENGLISH_ID]`→原文意味文・低リスク）。`grep -ohE "[A-Z][A-Z0-9_]+" 逆翻訳行 | sort | uniq -c | sort -rn` で多い順に：COPY_LRIG_NAME_ABILITY(16)・DOWN_UP_SIGNI_AND_CHOOSE・SUMMON_RESONA_FROM_LRIG_DECK・CHOOSE_COLOR_FROM_LIST・DESIGNATE_SIGNI_ZONE 等。engine実装済みなら decompiler に意味文を1行足すだけ。
- [ ] **残る単発テール（原文とJSON構造がズレた混線／未構造化STUB・約367件）**＝**2026-07-02時点で「1 effect=1クリーンSTUB」で原文抽出できるものは全消化済み（444→367）**。残367は effect構造そのものが原文とズレた混線で、1つのSTUBを原文化しても同 effect 内の他のズレが残り原文一致にならない＝decompilerの原文抽出では対応不能。**effects JSON の再parse（機構実装・データ層修正）が本筋**。大型レンダラ系統（`REVEAL_AND_PICK`/`CHOOSE`/`LOOK_TOP_*`/`SIGNI_REPOSITION`等）＋per-card heterogeneous＋`BET_*`(38・機構待ち)。進め方＝1カードずつ effects JSON を原文どおりの構造に手修正→逆翻訳が原文一致するか確認→smoke/golden/fuzz→push（**原文コピーでの一括潰しは禁止**＝実装未完成を隠蔽し検証目的に反する）。
- [ ] **Z-2：BET系（BET_MECHANIC 19＋BET_CONDITION 11＋BET_ALTERNATIVE 8）**＝機構待ちの唯一の大クラスタ。まず**表現だけ原文抽出で描画**（原文はカードテキストに在る）。engine 側の不足は §6 へ送る。
- [ ] **B層：JSONデータ欠落の補完（中リスク）**＝REVEAL_AND_PICK/LOOK_AND_REORDER で pick 部分（「その中から…手札に加え」）が JSON に無く逆翻訳から脱落するカード（WXDi-P04-047 等）。走査スクリプトで対象確定→effectId アンカーで curated JSON を直接パッチ。**逆翻訳を直したらエンジン実装までセット**の鉄則を守る。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **§2 DoDの4つ目にチェックを入れる**。

---

## 6. フェーズ2残作業：実行の正しさ（P2）

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

### 6.1 未実装action型 worklist（behavior-audit 段階4で発見・完全no-op・2026-07-03）
`npm run audit` の要レビュー・キューから、**action位置なのに engine(`src/engine/*`) にも UI(`BattleScreen.tsx`) にも型名が一度も現れない＝完全未実装で無言no-op**の action型を網羅スキャンで確定。**14種42効果**中 `EQUALIZE_ENERGY`(6)・`LEVEL_MODIFY`(9)は実装済（BUGFIXES上部）。残**11種27効果**。

**⚠修正層は effectType で決まる**（教訓）＝instant(AUTO/ACTIVATED/LIFE_BURST)→`effectExecutor` の `execXxx`+dispatch。CONTINUOUS→`effectEngine.ts` の calcFieldPowers/CONT収集器。`scratchpad` の型別effectType集計で判定してから着手する。

**A. instant型（executor層・優先）**
- ~~`LEVEL_MODIFY`(9)~~ **✅実装済**（temp_level_mods＋実効レベル・BUGFIXES上部）。
- ~~`LOOK_AT_DECK_AND_LIFE`(3)~~ **✅実装済（2026-07-03）**＝覗き＝情報開示のみ（盤面不変が正しい）・log-only。
- ~~`VARIABLE_DISCARD_AND_DRAW`（1・WX09-Re15）~~ **✅実装済（2026-07-03・BUGFIXES上部）**。
- ~~`NAME_BAN`（2・WX10-023）~~ **✅実装済（2026-07-04・続き14）**＝`blocked_card_names_game`（ゲーム内持続）＋targetSelf反転是正。
- [ ] `PLAY_FREE_FROM_TRASH`（2・WX09-012・AUTO/ACT）／`STACK_SPELL`（1・WX11-029・AUTO）／`PREVENT_DAMAGE`（5・WX08-029・ACT3/AUTO1/LB1＝ただしダメージ層への置換機構が要る＝実質横断）。

**B. CONTINUOUS型（calcFieldPowers/CONT収集器層）**
- ~~`GROW_COST_REDUCTION`（CONT6）~~ **✅実装（2026-07-03・BUGFIXES上部）**＝pure `collectGrowCostReductions`（golden済）＋人間/CPU/アシストグロウ全経路に減額配線。⚠要実機検証(C2)。
- ~~`POWER_MODIFY_PER_ENERGY`（1・WX09-019・CONT）~~ **✅実装済（2026-07-03・続き13）**＝`calcFieldPowers` に `_COLOR` 同様の per-energy を追加（golden済・⚠要実機検証）。
- [ ] `COST_SUBSTITUTE`（2・WX08-042・CONT）／`SELF_TRASH_PREVENT`（1・WX07-033・CONT）／`COLOR_INHERIT`（1・WX11-032・CONT）／`GRANT_FIELD_SHADOW`（1・WXDi-P15-058・CONT）。

進め方＝A群から1型ずつ、effectType を確認→ instant なら `execXxx`+dispatch(+必要なら resume 適用case)→golden 1件→smoke/fuzz→キュー減→push（§3）。

### 6.2 意味照合監査（semantic audit）の worklist（2026-07-03新設・仕組みは [SEMANTIC_AUDIT.md](./SEMANTIC_AUDIT.md)）
原文 vs effects JSON を LLM で意味比較する検査パイプライン（`scripts/semanticAudit{Extract,Run,Triage}.mjs`）。パイロット（stub群30枚精査）で precision約78%・30枚中17枚に確定バグ（同型★0・smoke/fuzz緑を通過済みのカード）。

- [ ] **系統①：相手デッキ削りの owner 取り違え**。**(a) 純・相手のみ58枚＝✅是正済（2026-07-03）**。**(b) 「あなたか対戦相手」選択18枚**（WX07-005/WXDi-D07-019他）＝`owner:'any'`＋engine/decompilerの選択対応が要る（opponentにflipしてはいけない）。**(c) 混在（自ミル文併存）10枚**（WXEX2-21他）＝ノード単位で判別要。
- [~] **系統②：GRANT_PROTECTION `count:'ALL'`＋subjectFilter無し＝48件**。**単体保護24件は `count:'ALL'→1` 是正済（2026-07-03）**。genuineな残ギャップは(a)SEQUENCE内GRANT_PROTECTION（WX08-017）(b)LAYER付与型（WX15-031）。残る**広域24件**（「あなたのシグニは…」）はsubjectFilter/新機構が要る別課題。
- [ ] **パイロット findings の個別修正**（真バグ39件・要追精査3件＋stub群残20枚・clean群50枚の findings）＝`node scripts/semanticAuditTriage.mjs <outDir>` で精査→1カードずつ標準ワークフロー。
- [ ] **スケールアップ**＝stub群全2,306枚へ拡大（SEMANTIC_AUDIT.md「スケールアップの進め方」）。

### 6.3 残・大型機構（個別カード・機構待ち）

- **引用AUTO付与の精緻化（`GRANT_QUOTED_AUTO_ABILITY`）** ＝**✅一次完了（B4）**＝引用【自】/【常】能力を実発火（自場シグニ・ターン限定・parse成功時のみ）。**残**＝permanent（このゲームの間）付与・相手シグニ付与・STUB能力＝従来 log-only 据置。例: WX25-CP1-074／WXK09-055／WX24-P2-044。
- **「ゲームから除外」の機構待ちテール（2026-07-04・従来 TRASH 近似のまま no-op 据置）**＝(a)遅延自己除外「ターン終了時に、またはこのシグニが場から離れる場合に、このシグニをゲームから除外する」（WX16-040/WX21-Re06/WD22-035-G）＝遅延トリガー機構が要る。(b)ルリグデッキのピース除外（WXDi-D07-004/WXDi-P04-013）＝execExile の LRIG_DECK 対応が要る。(c)使用後の自己除外「このカード/このスペルをゲームから除外する」（WXK11-070/PR-378/SP36-001/WX17-044）＝source自身の追跡が要る。(d)文脈参照「それをゲームから除外」（WXDi-D08-012/WXDi-D09-P15）＝直前対象の追跡。
- **状態フィルタ脱落の残テール（2026-07-04・続き16・除去系 凍結7＋ダウン/アップ28効果は是正済）**＝census 残（凍結13・ダウン/アップ38）は別パスで未patch＝(a)**コスト節「アップ状態のルリグ/シグニをダウンする：〜」**（WX14-055/WX24-P2-069/WXK10-023/WXK11-056/WXDi-P12-049/P13-053/P14-043-049 等）＝状態はコスト側（`：`後の効果テキストに状態語なし）＝コストの「アップ状態要求」を表す語彙が要る（現状コストは down 効果のみ）。(b)**条件「このシグニがアップ状態の場合」**（WX15-055/056/WXDi-CP01-045/P02-038/P04-036/WX25-P2-048/WX18-052/WXK08-034）＝activeCondition/条件機構。(c)**CONT REMOVE_ABILITIES**（WXEX1-02-E1＝count:1・filter無しで「凍結シグニは【常】【自】を失う」＝全frozen＋能力種別限定）。(d)WXDi-P02-065-E1（count:2 vs 原文「1体」＋「≥2存在」条件欠落）・WXDi-P01-003（アーツ本体欠落）・WX09-016（ダウン状態シグニへの GRANT_PROTECTION）・CHOOSE/入替系（WX24-P2-087/WXDi-P08-037）。
- **GRANT_LRIG_ABILITY の低品質展開4枚（2026-07-04・MANUAL化で no-op 据置）**＝WX15-016（付与【自】の「この方法で置いたカードが《バーストアイコン》を持つ場合アタック無効」＝条件が IS_MY_TURN に誤約・相手ターントリガーで恒久false）／WD21-009（ルリグ下N枚→2/4/5枚の多段閾値＝平坦化すると無条件ガード封じ+トリクラの過剰発火）／PR-204（「カード2枚をルリグトラッシュに置いてもよい。そうした場合アップ」＝支払いゲート脱落で毎アタック無償ルリグアップ＝無限アタック）／PR-238（置いた枚数×5の比例ミル）。共通で「optional支払い→そうした場合」のコストゲート機構＋多段閾値が要る。SPDi43-03/11/12/13・WXK11-052 の「ターン終了時までこのルリグは『【自】…アップ』を得る」も同根（現状は即時 UP LRIG の平坦化近似＝§7の実機検証対象外）。
- **「対戦相手のシグニが場を離れたとき」トリガー（3枚・behavior-audit 段階4で発見・2026-07-03）**＝`ON_LEAVE_FIELD` の watcher 収集（`collectLeaveFieldTriggers`）は**離れたカードと同じ側（味方）の watcher しか見ない**ため、相手の離脱を見る新 `triggerScope` と相手フィールド走査パスが要る。該当＝**WXEX1-30-E2**／**WXK11-017-E1**／**WXDi-P03-040-E1**（3枚とも現JSON `scope=self`＝誤発火）。
- ~~「このターンにあなたがアーツを使用していた場合」条件~~ **✅実装済（2026-07-03・続き13後半）**＝`ARTS_USED_THIS_TURN`＋`turn_arts_used` 機構で11枚全是正（⚠要実機検証）。WX25-P1-106 BURST のダメージ置換近似は §6.1 `PREVENT_DAMAGE` に合流のまま。
- **自パワー閾値条件の残テール（2026-07-03発見・素直な21枚は是正済）**＝(a)「代わりに」昇格型：WXDi-P01-054（【起】バニッシュの昇格）／WXDi-P12-067（被バニ反応の昇格）。(b)多段閾値型：PR-470A（10000/25000）／WXDi-D01-016（15000/20000）。(c)【起】の自パワー条件：WXDi-P03-062（起動時 evalUseCondition 配線の確認要）。
- **WXDi-P05-006＝2択構造ごと崩壊**＝ピース打ち消し（カットイン使用＋対象ピース効果打ち消し＋除外）機構が無く、①②の択も脱落（現 curated は GRANT_KEYWORD 使用条件＋UNKNOWN の残骸）。ピース打ち消し機構待ち。
- `ON_CARD_MILLED_FROM_DECK` の収集機構（WX25-P2-009-E2＝現 `【※engine未配線】`）。
- リフレッシュ置換の実体（WX25-P2-009-E1＝現 no-op STUB `REPLACE_NEXT_OPP_REFRESH_MILL_LRIG`）。
- 「他＜毒牙＞のシグニ効果で相手パワーが減ったとき」トリガー（WX25-P3-062-E1＝現 STUB `POWER_COPY_FROM_DOWNED`）。
- **ビートの残（低優先）**: トラッシュ→beat（WDK14-013）のプレイヤー選択ピッカーのみ自動近似。
- **G072 残6枚**（条件前置き付きの相手シグニ被バニッシュ反応）: WX05-040/WX11-027（「メインフェイズの間」）／WXEX2-23（「アタックフェイズの間」）／WXK11-055（「あなたの効果によって」）／WX13-051（「＜龍獣＞効果で」）／WXDi-P11-TK05（【チャーム】付き相手シグニ）。前置きモデリングの誤りリスク高く個別対応。
- **multi-dest pick（look→手札＋場の二目的）**: WX24-P1-017／WX24-P1-026／WX25-P3-038／WX25-CP1-025／WX26-CP1-019。付与/条件/絆を伴う同時pickは別語彙が要る。
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

- **ON_LRIG_ATTACK_STEP_START（ルリグアタックステップ開始時）**：1枚（WX25-CP1-042-E2）。⚠**全体が未検証**（既定シナリオに未追加）。要確認＝①シグニアタック→ルリグアタックへフェイズを進めたとき E2 が発火する②《ターン1回》③アクションは**パース近似**＝原文「クラッシュした相手ライフ1枚につき相手手札1捨て」ではなく固定「相手手札1トラッシュ＋ブルアカ-5000」が走る（厳密スケーリングは別課題）。⚠**CPUターンのルリグアタックステップは未配線＝follow-up**。
- **ON_COIN_PAID（コインを支払ったとき）**：3枚（WXDi-P15-055/069・WXDi-P16-057）。✅発火自体は実UI検証済み（`WXDi-P15-069`で確認）。残＝③《ターン1回》《ターン2回》の回数制限・④自分のターン外（相手ターンのガード等）でも発火するか。⚠**スペルのベット（pending_spell/カットイン経由）とCPUルリグ【出】《コイン》は未配線＝follow-up**。
- **ON_LRIG_GROW（ルリグがグロウしたとき）**：5枚。✅発火自体は実UI検証済み（`WXDi-P03-039`・CPUセンターグロウも`cpugrow`で確認）。残＝②相手のグロウで any_opp が発火する経路（WXDi-P13-047/WXDi-P03-046）・③any_opp トリガーがグロウ先ルリグの【出】より先に解決される・④《ターン1回》が2回目グロウで再発火しない。⚠**アシストルリグのグロウ経路は未配線（センターグロウのみ）＝follow-up**。
- **ON_TARGETED（対象になったとき）**：AUTO（14枚）。✅発火自体は実UI検証済み（`WXDi-P03-067`）。残＝①相手の効果で自分のシグニが対象に取られた各パターン（WXDi-P11-040/WX25-P2-055/WXDi-P02-043/WXDi-D09-H14）の個別確認・②turnOwner:opponent ゲート・③usageLimit《ターン1回》が複数対象でも1回。⚠**forced単一対象（pending無しで自動解決される対象取り）経路は未発火＝follow-up**。

### 7.1 timing flatten 系統（実バグ・当初159枚→**✅完了＝VALUE 0**・R58で打ち止め）
> R5-R58 で timing flatten の表現バグ（`timing:ON_TURN_END`だが原文トリガーは「〜したとき」＝ターン終了時に付与即失効の実質no-op）はすべて解消（`npx tsx scripts/parserWorklist.ts` で VALUE=0・LOSS=0・同型★0）。**残る作業は表現ではなく engine 配線の実機検証のみ**＝下記R30-R46系トリガーの個別確認、および上記C1 timingのfollow-up。診断＝`npx tsx scripts/_flattenList.ts`（0枚を確認）。詳細な系統別の直し方・分類は `BUGFIXES.md` のR5〜R58エントリを参照。

**残る実機検証項目（R30-R46・engine配線済みだが実機PvP/CPU未検証）**：
- **ON_OPP_POWER_DECREASED（R46・毒牙）**：WX13-036/WXEX2-52。要確認＝①自効果で相手シグニを-N000したとき、このシグニが+N000される（減少量と一致）②複数同時減少時の合算挙動③相手自身の自己弱体では発火すべきでない（現状は近似で発火しうる）。
- **ON_ACCE_ATTACH host条件/ON_REFRESH/ON_LEAVE_FIELD leftToZone（R45）**：①WXK05-041（アクセがレベル4以上のシグニに付いたとき）②WXDi-P04-043（いずれかがリフレッシュ）③WXK02-041（シグニが場→手札に戻った）。
- **ON_EXCEED_COST 場シグニ（R44）**：WXDi-P06-078。要確認＝①ルリグ起動でエクシードコスト支払時に発火（自ターン・once_per_turn）②対象選択CHOOSEで相手シグニ1体に-5000が実際に適用される③カットインexceedでは未発火（近似）。
- **ON_ENERGY_TO_TRASH（R43）**：WD15-015。要確認＝①自効果で相手エナをトラッシュに送ったとき発火②自エナ・相手効果による相手エナトラッシュでは非発火（「自効果」限定は近似で未判定）。
- **ON_CHARM_TO_TRASH（R42）**：WX16-Re05。要確認＝①効果でチャーム付きシグニが離脱/チャーム除去されトラッシュに行ったとき発火②**バトルバニッシュでhostが離脱したとき**（効果解決経路外＝未検出の可能性）。
- **placedFront（R41）**：WXDi-P03-043。要確認＝①相手が正面ゾーンにシグニを配置したときのみ発火②正面以外の配置では非発火。
- **opp-draw（R40）**：WXDi-P04-038/WXDi-P15-091/WD22-029-G/PR-423。⚠近似＝「自分の効果で」発生源限定なし。
- **outsideDrawPhase（R39）**：WXDi-D09-P19/WXDi-P05-062。要確認＝①メイン/アタックフェイズの効果ドローで発火②ドローフェイズの通常ドローでは非発火。
- **凍結トリガー（R38）**：WX08-039/WXEX2-02/WXDi-P04-065。要確認＝①FREEZE効果で相手シグニが凍結したとき発火②《ターン1回》が複数同時凍結でも1回。
- **パワー0以下トリガー（R37）**：WX20-Re03/WX21-067/WX22-013/WXDi-P01-043/WXDi-P14-009。要確認＝①相手シグニ0化で発火②《ターン1回》が複数同時0化でも1回③連鎖再発火。
- **手札捨て/トラッシュ flatten（R36）**：WDA-F02-17-E3／WXDi-CP02-082（自ターンE1／相手ターンE2の出し分け）。
- **drawBySourceStory（R31）**：WX20-026-E3（自＜凶蟲＞シグニの効果ドローで相手シグニ−4000）。
- **ON_PLAY any_opp + targetsTriggerSource（R30）**：WXK10-022-E1。

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
| ~~`SET_TRAP` 設置アクション~~ | 中（~30枚） | 中 | **✅完了**＝engineは既存（`signi_traps`ゾーン）。decompilerで9系統トラップSTUBを原文【トラップ】語彙描画（生STUB残0）。 |
| ~~動的閾値フィルタ~~ | 小（WX17-028等） | 中 | **✅完了**＝`REVEAL_DECK_TOP`＋`TRASH_REVEALED`アクション＋動的閾値フィルタ新設。 |
| ~~遅延条件トリガー~~ | 小（WX25-CP1-069等） | 中 | **✅完了**＝`INSTALL_DELAYED_TRIGGER`機構新設。 |
| engine未配線 timing 群の実機配線 | 大（~15 timing・R33-R58） | 高 | **✅C1全配線完了**。残るは実機検証のみ（§7参照）。 |
| ~~《相手ターン》/《自分ターン》AUTOトリガー基盤~~ | — | — | **実装済** |
| ~~【ビート】機構（Phase1-7）~~ | 44枚 | — | **完了**。残はトラッシュ版選択ピッカーのみ（低優先） |
| ~~傀儡場出しの汎用化~~ / ~~`levelLteLastProcessed`~~ | — | — | **実装済** |

実装済み機構の履歴：コスト増加・ライフクラッシュ履歴・LOOK_PICK_CHAIN field宛先・リコレクト系統・改造素材機構・引用能力付与型・保護/制限系STUB・アーツコスト軽減句 は `BUGFIXES.md` 参照。

---

## 12. 検証ハーネス（整備済み）

> **検証3層（実機検証を Claude がヘッドレスで代替）**：①表現＝decompile逆翻訳一致／②実行（壊れない）＝`smoke`（全効果・新品盤面）＋`fuzz`（乱択連鎖・進化盤面）／③正しさ＝`golden`（型ごと結果assert）。engine/BattleScreen/decompilerを触ったら **smoke・golden・fuzz** を回帰チェックに回す。⚠どれも engine（executeEffect/resume*）が対象＝**BattleScreen.tsx の配線（フェイズ進行・トリガー収集・effect_stack整列）は対象外**（C2実機 or pure抽出＋goldenが要る）。
> **CI 自動実行**：`.github/workflows/ci.yml` が push/PR(master) で **typecheck・lint・golden・smoke・fuzz** を回す（失敗時に非ゼロ終了でCI失敗）。`npm install` のみで動く（env/supabase不要）。
- **`npm run smoke`（`scripts/smokeTest.ts`）**：全効果10557件を**オートパイロット**でヘッドレス実行し、CRASH/HANG（STEP_CAP=200）/INVARIANT違反を検出。現状＝全0（OK 10275／SKIP 282）。⚠「壊れないか」を保証するもので「ルール的に正しい結果か」は判定しない。
- **`npm run golden`（`scripts/goldenTest.ts`）**：主要DSLアクション型ごとに制御盤面で効果を実行し「結果がこうなる」をassert。現状＝PASS 106／FAIL 0（うち一部はStage2のトリガー収集テスト）。
- **`npm run fuzz`（`scripts/selfPlayFuzz.ts`）**：乱択自己対戦ファズ。ランダム初期盤面で効果を連鎖発動し相互作用/進化盤面クラッシュ/ループ/カード爆発を検出。シード固定で完全再現可能（既定200ゲーム×40手）。現状＝全0。重め検証は `npm run fuzz -- --games 2000 --moves 80`。
- **`node scripts/_dropTriage.mjs`**＝脱落疑いを〔偽陽性／機構待ち／修正済／実バグ候補〕に自動＋手動分類（明細 `docs/_drop_triage.txt`）。
- **`npm run census`（`scripts/vocabCensus.ts`）**＝語彙センサス＝原文修飾句24パターン＋数値不一致軸×JSON対応語彙の突き合わせで**過剰効果（フィルタ/条件/使用制限の脱落）**を検出（既存網の死角＝盤面が変化するバグ）。高シグナル1469枚ベースライン（続き17拡充後）・超過で exit 1・明細 `docs/_vocab_census.txt`。
- **`npx tsx scripts/parserWorklist.ts`**＝held/LOSS/VALUEのhealth計器（現在すべて0）。回帰検出に使う。
- **`npx tsx scripts/_flattenList.ts`**＝timing flattenのEXIST/FRESH差分（現在0枚）。

---
**関連**：`DESIGN.md`（設計方針）／`BUGFIXES.md`（修正記録）／`BEHAVIOR_AUDIT.md`（原文照合の主軸）／`SEMANTIC_AUDIT.md`（補完的発見器）／`effects-json-guide.md`（語彙）／`STUBS.md`（STUB一覧）／`TokenCallers.md`（トークン対応表）。
