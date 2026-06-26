# 残作業 (TODO)

未実装・未対応の作業をまとめた恒久ドキュメント。完了したら該当項目を消すこと。
設計方針は [DESIGN.md](./DESIGN.md)、過去の修正は [BUGFIXES.md](./BUGFIXES.md)。

> **🎯 現在の目標＝P1（表現完成）。3人がバトン式（順番に push/pull）で進める。まず [P1_PLAN.md](./P1_PLAN.md) を読む（§3「現在地（バトン）」＝次の一手・品質ゲート）。**

最終更新: 2026-06-26。**まず下記「📌 引き継ぎ（最新・2026-06-26）」を読むこと。** それ以前の引き継ぎ（zerom→ymst / ymst→karka）は履歴として残置。

---

## 📌 引き継ぎ（最新・2026-06-26）— 新セッションはここから読む

### 0. このプロジェクトで今やっていること（2系統）
1. **逆翻訳トリアージ（文型★脱落バグ修正）**＝ `docs/grouped_sentence_all.txt` の「⚠脱落疑い」を上から潰す。**簡単な系統バグはほぼ枯れた**（残241枚は機構実装待ちが中心）。
2. **機構実装ラウンド**＝残った複雑カードに必要な未実装機構を1つずつ作る。**①コスト増加(NEXT_OPP_TURN)・②ライフクラッシュ履歴条件 を実装済**（BUGFIXES「機構実装①②」）。今はこちらが主軸。

### 1. 現在地（数字）
- 文型★：1〜14巡で本物バグ約58枚＋汎用フィルタ2種を修正。機構実装①②で計7枚。**15巡：場出しシグニの【出】抑止（ON_PLAY_ABILITY）5枚／16巡：look→pick→手札が「並べ替える」に退化した系統16枚**（BUGFIXES先頭）。同型★ は常に0（退化なし）を維持。
- ⚠ **脱落疑いの件数（242枚前後）は内容修正で減らない**：メトリクスが「。区切りの文数」で粗く、decompiler が複数効果を1行（、／そして）に圧縮するため。真の指標は **同型★0＋該当カードの逆翻訳が原文一致**。件数を追わず内容で判断する。
- 直近未コミット（git未コミット）。`git status` で確認し、区切りでコミットする運用。
- **後回し（multi-dest pick／要 LOOK_PICK_CHAIN）**: look5→**手札＋場**の二目的pick系。WXDi-P16-035・WXDi-P02-020（＋【出】抑止）／WX24-P1-017・WX24-P1-026・WX25-P1-039・WX25-P3-038・WX25-CP1-025（＋付与/条件/絆）。15-16巡で「場出し単目的」「手札単目的」は再構築済。残るは手札＋場の同時pickで別語彙が要る。**抽出コマンド**: 逆翻訳に「並べ替える」を含み「手札に加え/場に出/エナ」を欠き、原文に「その中から…手札に加え…場に出」を持つもの（scratchpad の scan4/6.mjs 参照）。

### 2. ⚠ 最重要の運用注意（時間を無駄にしないため）
- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的なので実行しない。** 修正は JSON を直接パッチ。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。[[decompile-engine-parity]]
- **`node -e` 内に日本語リテラルを書くと Git Bash 経由で文字化けし誤動作する**（実例: owner調査で count 0 の誤判定）。**日本語を含むスクリプトは scratchpad に `.mjs` を書いて `node <path>` で実行**すること（UTF-8 保証）。
- **大きな編集の直後は永続化を必ず検証する**（本セッションで一部の Edit/Bash 出力が乱れ、BUGFIXES記録が飛んでいた。コードとJSONは残っていた）。`grep -c` で目印を数えて確認。

### 3. 標準ワークフロー（1カード/1巡）
①`grouped_sentence_all.txt` の⚠脱落疑いを上から見る（原文・逆翻訳併記済）→ ②欠落把握 → ③`effects_*.json` を既存語彙で直す → ④`npx tsc --noEmit` → ⑤該当シート再生成 `npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt` → ⑥下流 `node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all` → ⑦逆翻訳が原文一致を確認＆同型★0確認 → ⑧BUGFIXES追記。カード→シート対応は `grep -q "^<CardNum> " docs/decompile_sheet<N>.txt` で特定。

### 4. 機構実装の「型」（①②で確立。新機構もこれに倣う）
1. `src/types/effects.ts`：アクション/条件の型を追加・拡張。
2. `src/types/index.ts`：必要なら `PlayerState` に状態フィールド追加。
3. `src/engine/effectExecutor.ts`（実行）/ `src/engine/execUtils.ts`（`evalCondition`）：ロジック。
4. `src/screens/BattleScreen.tsx`：**状態の読み取り（コスト計算/バトル等）と、ターン境界でのリセット**を忘れない（リセット箇所は3つ：PvP通常終了・PvP確認後・CPU。`power_mods_until_opp_turn` や `cards_drawn_by_effect_this_turn` の隣に追記すると漏れない）。
5. `scripts/decompileEffects.ts`：表示。
6. JSON を該当カードに配線 → ④〜⑧で検証。
- **期間「次の相手ターン」型は `power_mods_until_opp_turn` と同じライフサイクル**（キャスター側保持→相手ターン通過→自分の次ターン開始でクリア）が手本。

### 5. 落とし穴・既に調査済みで「触らなくてよい/枯れた」系統
- **owner:any は一括変換禁止**：POWER_MODIFY/BANISH の `owner:'any'` は大半が正当（「シグニ1体を対象とし±N」＝自他選択／「すべてのシグニをバニッシュ」）。原文に明示主語があるものだけ個別是正。
- **LIFE_BURST 内 `CONDITIONAL{IS_MY_TURN}`（105枚）は実害なし**（evalCondition で常時true＋「そうした場合」プレースホルダー特別処理）。修正不要。
- **強制アタック**は実装済み（`must_attack_signi`/FORCE_SIGNI_ATTACK）。未配線は WX12-010（複雑レゾナ・CONTINUOUS強制）のみ。
- **BURST丸ごと欠落**は全網羅で残0（WX04-029 で最後の1枚を是正済）。
- **保護系キーワード（バニッシュされない等）を相手付与の owner誤り**＝残0。
- `REVEAL_AND_PICK` の `then` が公開カード非消費（DRAW/ENERGY_CHARGE等）＝8〜11巡で潰し済。残は重い機構（disona済・奇偶済）。
- 偽陽性パターン（脱落疑いに出るが直さない）：CHOOSE1文圧縮／REVEAL_AND_PICK文法崩れ／使用条件＋本体／アンコール注記のみ／BET_MECHANIC。

### 6. 次の一手（機構実装の候補・影響枚数順）
当初ユーザー方針＝「影響枚数が多い順に機構を1つずつ」。残候補：
- **《相手ターン》/《自分ターン》トリガー基盤**（最高価値・最高リスク）：`IS_MY_TURN`はevalCondition常時true・`TURN_OWNER`はCONTINUOUS activeConditionのみ。AUTO/ACTIVATEDのターン限定発動が未対応。多数の付与能力の前提。core（トリガー収集＝effectEngine `collectSelfEventTriggers`/BattleScreen）に踏み込む。
- ~~**【ビート】機構**（出現44）~~ → **Phase1-6実装済**（《ビート》[条件]ゲート12＋ON_BECOME_BEAT8＋cost.beat_signi支払い＋コスト型[４枚以下]使用ゲート9＋トラッシュ→beatコスト/WDK14-013＋look→pick beat化宛先/同レベルバニッシュ/WDK14-008。BUGFIXES参照）。**残（コア表現はほぼ完了）**: beat対象のプレイヤー選択UI（自動近似・要実機）／MAKE_BEAT正規化。
- **引用能力付与の精緻化**（`GRANT_QUOTED_AUTO_ABILITY` 系・ヒューリスティック）：WX25-CP1-074・WXK09-055・WX24-P2-044 等の「シグニに『〜』を付与」。
- ~~**`LOOK_PICK_CHAIN` の field 宛先拡張**~~ → **実装済み（機構実装③・BUGFIXES参照）**。WXDi-P16-035・WXDi-P02-020・WX24-P1-026 配線済。**残**: WX24-P1-017・WX25-P3-038（場出しシグニへ引用AUTO付与＝GRANT_EFFECT要・引用付与タスク）／WX25-P1-039（`levelLteLastProcessed` フィルタ新設要）／WX25-CP1-025（hand＋「白を手札に加えた場合」条件）／WX26-CP1-019（CHOOSE2分岐×look→ener/hand）。
- 個別の複合（place-swap WXDi-P08-037／look-pickチェーン WX26-CP1-019・WX25-P1-103／ウィルス数スケール WX16-048/023 等）は TODO 下部参照。
- 機構選択はユーザーに確認してよい（前回 AskUserQuestion で「コスト増加」を選定）。

### 7. 主要ファイル
- 語彙: `src/types/effects.ts` / `src/types/index.ts`（PlayerState）
- エンジン: `src/engine/effectExecutor.ts`（実行・`execLookPickChain`/`execCostIncrease`/`execLifeCrash` 等）・`src/engine/execUtils.ts`（`evalCondition`/`matchesFilter`）・`src/engine/effectEngine.ts`（CONTINUOUS収集・`calcActiveCostMods`）
- UI/ルール: `src/screens/BattleScreen.tsx`（コスト計算・バトル・ターン境界リセット・`crashOneLife`）
- 逆翻訳器: `scripts/decompileEffects.ts`、グルーピング: `scripts/groupBySentence.mjs`/`groupSimilar.mjs`
- 記録: `docs/BUGFIXES.md`（修正記録・新しい順）・`docs/TODO.md`（本ファイル）・`docs/DESIGN.md`（設計方針）

**2026-06-23 追記（ymst→zerom）:** 逆翻訳スキャンを効率化する**系統分け／同型グルーピング・インデックス**を新設（`scripts/group*.mjs`＋全10シート統合 `docs/grouped_all.txt` / `grouped_sentence_all.txt`）。

---

## 📌 引き継ぎ（2026-06-26 zerom → ymst）— まずここを読む

**現在地:** `grouped_all.txt`（同型グルーピング）の **G1〜G265 を全件確認・修正完了**。いま `grouped_sentence_all.txt`（文型グルーピング）のトリアージ中。**脱落疑い262枚のうち先頭10枚を修正済**（BUGFIXES 冒頭参照）。

**今セッションで整備したトリアージ基盤（これを使えば速い）:**
1. **`docs/grouped_sentence_all.txt` が強化済み**。各★外れに **原文・逆翻訳を併記**＋ **⚠脱落疑い(原文N文/逆翻訳M文)** マーカー（逆翻訳の効果文数 < 原文＝効果の脱落＝実バグの主流）。脱落疑いを各グループ先頭・脱落疑い含むグループを全体先頭に並べる。**＝原文を別途引かずに「バグか／何が欠けてるか」が一目で分かる。**ヘッダの脱落疑い総数から上詰めで潰す。
2. **`scripts/groupBySentence.mjs` の誤検出抑制**（接続句・選択肢番号除去／CHOOSE選択肢の別文展開／共通バリアント許容）で ★1626→約390枚に圧縮。
3. **`scripts/decompileEffects.ts` 強化**: `CONDITIONAL_MULTI_CHOOSE_BY_CENTER(_LEVEL_GTE)` を原文の選択肢で自然文描画（実装済みSTUBの偽陽性除去）。

**⚠ 重要な作業ルール（今セッションで判明した落とし穴）:**
- **逆翻訳の `[STUB:id]` は「未実装」ではなく実装済みハンドラのタグ表示**（STUBS.md: 541種中534種ハンドラあり・STUB_LOG 0件）。**`[STUB:]` を含むからとスキップしてはいけない。**タグだけでは「ハンドラがカード全体を実装（例: WX11-017 の CONDITIONAL_MULTI_CHOOSE_BY_CENTER は◎）」と「STUB/単一アクションが断片しか実装せず残りを落とした（例: WX09-Re03/WDK07-E08 は実バグ）」を区別できない。各外れは**該当ハンドラを読む or smoke テスト**で「実装が原文全体を覆うか」個別検証する。
- **逆翻訳を直したらエンジン実装までセットで**（乖離＝偽陰性を作らない）。`effects_*.json` は**手動管理**（`build:effects` は破壊的なので実行しない）。

**標準ワークフロー（1回 = 数分）:** ①`grouped_sentence_all.txt` の脱落疑いを上から見る → ②原文 vs 逆翻訳で欠落を把握 → ③既存語彙で `effects_*.json` を直す（`REVEAL_AND_PICK`/`LOOK_PICK_CHAIN`/`CHOOSE`/`GRANT_EFFECT` 等。G250〜G265 が手本）→ ④`npx tsc --noEmit` → ⑤該当シート再生成 `npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt` → ⑥下流 `node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all` → ⑦該当カードの逆翻訳が原文と一致を確認 → ⑧BUGFIXES に追記。

**今セッションで切り出した別途対応（複雑・要新語彙）:** 下記 E節「次の一手」末尾の「修正進捗」リスト参照（引用付与/LB付与型 `WXDi-P02-039-E2`・`WX25-P3-027-E2` 等）。**未修正の明確な実バグ例: `WX24-P4-026`（修正済）, `WX26-CP1-019`（並べ替え後の択一脱落・未修正）。**

**次の一手:** 脱落疑い #11〜 を10枚ずつ。look→pick系・owner誤り・単純脱落は機械的に直せる。複雑な引用付与/LB付与は新語彙が要るので後回しでよい。

---

## 📌 引き継ぎ（2026-06-26 ymst → karka）— 文型★脱落トリアージの続き

**現在地:** `grouped_sentence_all.txt`（文型★）の脱落疑いを上から精査中。**1〜11巡で本物バグ53枚＋機構2件＋汎用フィルタ2種、12巡で owner誤り2枚、13巡で BURST欠落1枚を修正済**（BUGFIXES の各記録を参照）。脱落疑い 253→242枚。**構造系統チェック済み（脱落少）:** BURST欠落（残0）／REVEAL_AND_PICK then副作用（残は重い機構のみ）／owner:any（大半正当・地雷）／保護系キーワードのowner誤り（残0）／LIFE_BURST内IS_MY_TURN（実害なし・修正不要）／能力数欠落（差≥2＝42枚は引用付与/複数能力/強制アタック/エクシード等の重い機構待ち）。**簡単な系統バグはほぼ枯れ、残りは機構実装待ちが中心。**

**⚠ owner:any は一括変換禁止（12巡目の知見）:** `owner:'any'` POWER_MODIFY/BANISH の**大半は正当**（「シグニ1体を対象とし±N」＝自他選択／「すべてのシグニをバニッシュ」）。delta符号で self/opp を機械決定するのは誤り。**原文に明示主語があるものだけ**個別是正する。本物の誤りは「あなたの他の＜X＞のシグニ…」ロードバフが owner:any単体化したもの等、少数。

**8〜11巡目の系統（横展開で効率潰し）:** `REVEAL_AND_PICK` で `then` が**公開カードを消費しない副作用**（DRAW/ENERGY_CHARGE/BANISH/POWER_MODIFY等）になっている誤りを `SEQUENCE[LOOK_AND_REORDER(公開), CONDITIONAL{DECK_TOP_MATCHES, then}]` へ統一是正（8巡:4／9巡:DRAW9／10巡:エナ/バニッシュ/パワー10／11巡:isDisona/levelParity 新設で5）。**抽出コマンド**（再利用可）: 全 effects_*.json を走査し `REVEAL_AND_PICK.then.type ∉ {ADD_TO_HAND,ADD_TO_ENERGY,ADD_TO_FIELD,TRASH,TRANSFER_TO_HAND,TRANSFER_TO_DECK,EXILE,ADD_TO_LIFE}` を列挙。新フィルタ `isDisona`（Story==='Dissona'）／`levelParity:'odd'|'even'` は今後も流用可。

**この系統で後回し中（複雑・新機構/timing要）:** WX25-P1-082（このターンアーツ使用条件）／WX18-073-E2（公開手札＋次カードエナ複合）／WX25-P3-092（CHOOSE内択一・②未表示）／WXDi-CP02-068・WXDi-P00-034（トリガーtiming誤り＝「自効果で相手シグニ移動時」「相手メイン開始時」が現 ON_PLAY/ON_TURN_END 誤り）／WX24-P4-060（UNTIL_OPP_TURN_END＋2効果目）／WX13-052・WX25-P1-053（self-banish/自身手札戻し起点の複合）／WXDi-P04-045・WXDi-P13-006・WXDi-CP01-025・WX25-CP1-038・WX26-CP1-046・WD21-001（原文乖離・別系統の複合誤り）／WXDi-P08-037（place-swap＋覚醒トリガー誤）。

**新設・流用できる機構（今セッションで追加）:**
- **コイン任意払い** `OPTIONAL_COST` の `coinCost?:number`（StubAction）＝「《コイン》を支払ってもよい→そうした場合〜」系に流用可。`SEQUENCE[{STUB OPTIONAL_COST, coinCost:1}, <本体>]` の形（effectExecutor Pattern⑤が pay/skip を生成）。
- **`HAS_CARD_IN_FIELD` の crossState/isFrozen 実評価**（engine 修正済）。「場にクロス状態/凍結のシグニがある場合」の条件に使える。
- 既存で頻用: `CHOOSE`(upTo)/`REVEAL_AND_PICK`/`LOOK_PICK_CHAIN`/`SEARCH`(then ADD_TO_HAND/ADD_TO_ENERGY)/`MILL`/`EXILE`/`OPP_ENERGY_REDUCE_TO_N`/`GRANT_PROTECTION`/`FREEZE(down)`/`LRIG`対象/`hasIcon`フィルタ/`excludeSelf`フィルタ。

**⚠ 偽陽性パターン（脱落疑いに出るが直さなくてよい）— 毎回これを先に除外:**
1. **CHOOSE/チェインを1文に圧縮**＝1巡目修正済カードや、択肢が逆翻訳に全部出ていれば正しい（WX10-004/WX11-023 等）。
2. **REVEAL_AND_PICK の文法崩れ**（「シグニを1枚あなたのカード1枚を手札に加える」等）＝機能は正常（WX11-059/060/WXEX1-08-E2）。
3. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝正しい（WX01-046/WX06-034/WX15-050/WX04-044/WDK02-007）。
4. **アンコール/ベット注記のみ訳に出ない**＝本体が合っていれば正しい（WX13-010/WX18-013/WXK07-012）。
5. **BET_MECHANIC STUB**＝別タスク（後回し）。

**未修正の本物バグ（複雑・新機構要。karka 着手候補）:**
- ~~**コスト増加機構**: WXK09-006-E1②~~ → **実装済み（機構実装①・BUGFIXES参照）。残**: WXK11-003「このターン」型／WXDi-P06-031等の起動能力コスト増加／WX20-Re20等の自アーツコスト選択数依存。
- **【ビート】機構**: WDK14-008（公開4→1手札＋1ビート→ビートと同レベルの相手バニッシュ）。
- **凍結状態フィルタのアサシン変種**: WX25-P2-084②「【アサシン（凍結状態のパワー3000以下のシグニ）】」＋2択。
- **公開カード→自身のアクセ化**: WDK07-E15（新 STUB `INTERNAL_ACCE_PICKED_TO_SELF` が要る。既存 ACCE_FROM_HAND は手札用で逆向き）。
- **公開カードと同レベルの動的フィルタ**: WX24-P3-063（公開カードのレベルを読んで相手全シグニ能力消失）。
- ~~**自ライフクラッシュ履歴条件**: WX11-021②~~ → **実装済み（機構実装②・BUGFIXES参照）。残**: WXDi-P11-001（「直前のターン」＝前ターン跨ぎ保持）。
- **使用制限の誤パース＋3択崩壊**: WX20-021（「対戦相手のターンにしか使用できない」が壊れた CONTINUOUS 化＋3択全脱落、各択に条件）。WX24-P3-036（スペル打ち消し＋コスト合計比例の《無》任意払い）。
- **トリガー/BURST 崩壊**: WD14-011（E1 トリガーが thisCardOnly 化＋「より低いレベル」フィルタ脱落／BURST 2択崩壊）。
- **複雑系（既出）**: WX25-CP1-002（リコレクト択一④ owner）/WX25-P3-023-E2（遅延トリガー）/WXEX1-08（コインベット誘発＋ライズフィルタ）/WX16-048・WX16-023（ウィルス数+1の選択数スケール）/WX26-CP1-019・WX25-P1-103（look-pickチェーン）/WD22-036-G（self-banish起点の複合2択）/WX25-P1-052-E1（《相手ターン》AUTO＋名指しカード在場条件）。

**《相手ターン》/《自分ターン》の AUTO/ACTIVATED 条件は未対応**（`IS_MY_TURN` は evalCondition で常時 true、`TURN_OWNER` は CONTINUOUS の activeCondition のみ）。ターン限定の AUTO 効果はこの基盤が無いと正確化できない＝下記 E節の課題。当面は近似省略でよい。

**前提:** 新設の語彙は `src/types/effects.ts`、エンジンは `src/engine/effectExecutor.ts`（`execLookPickChain` 等）/`execUtils.ts`。逆翻訳器は `scripts/decompileEffects.ts`。

---

**次の一手は文型★のトリアージ。詳細は下記 E節「系統分け／同型グルーピング・インデックス」。**

> **F-2 全完了**（付与型14枚＋相手場付与 WXDi-P10-072＋THE DOOR自ゲート＋身代わり置換）。**F-4（THE DOOR）全完了**。**F-3 はバトルバニッシュ経路を対話本実装**（犠牲型5枚＋コスト払い型2枚・**要実機検証**／効果バニッシュ経路は powerReduction型 WX06-019 のみ v0.403 で実装、犠牲/コスト型の効果バニッシュは未）。

### 🔰 続きから始める人（zerom）へ — 推奨着手順

1. **逆翻訳スキャンの継続（現在のメインタスク）:** **まず E節「系統分け／同型グルーピング・インデックス」の `docs/grouped_all.txt` / `grouped_sentence_all.txt` で系統的にバグ候補を絞ると効率的（全文を読まずに済む）。** `npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt` で逆翻訳を生成し、原文（同ファイルに併記）と突き合わせて誤りを潰す。**runtime の真実源はプリビルド `effects_*.json`（App.tsx が fetch→`card.effects`→`buildEffectsMap` が優先使用）＋manualEffects 上書き。** durable 化は「manualEffects＋JSON 両方」が原則だが、**系統的な一括修正はパーサー修正＋JSON 直パッチで durable 化する運用も可**（パーサーが同形を再生成するため。v0.434/0.435/0.436/0.437 のFREEZE/配置系一括修正はこの方式）。下記「逆翻訳スキャンで判明した系統バグ」を参照。
2. ~~**`ADD_TO_FIELD` source 欠落族の残り（最優先）:**~~ → **v0.438 で①〜⑥すべて修正済**（エナseq11・動的フィルタ/leave2・名指し2・ベット2・クラフト7・トラッシュ系2）。詳細は BUGFIXES.md。**残るは近似のみ**（WXDi-CP02-087 エナ枚数条件／WXDi-P03-078 自パワー動的フィルタ／WXDi-P05-068 先頭ドロー脱落／WXK07-105 ベット分岐／WX25-CP1-066 場存在条件／WX22-001-E3 付与型 leave トリガー機構）と**クラフトトークンの実機配置検証**。
3. **逆翻訳器（decompileEffects.ts）は随時強化:** STUB→STUBS.md 説明／条件・アクション・選択者・トリガー主語・cardType 名詞・LIFE_CRASH の trash/crash 区別などを表示するよう拡充済み。生ID（`[条件:X]`/`[アクション:X]`/`[STUB:X]`）が残る箇所は未対応＝表示 or 実装の穴。
4. **F-3 の実機検証（ヘッドレス不可・PvP/CPU実機が要る）:** 身代わり対話 pause/resume。対象 犠牲型 `WX12-024`/`WXEX2-60`/`WX20-055`/`WXDi-CP01-032`/`WXDi-P10-052`、コスト払い型 `WX10-033`/`WX11-029`。安定するまで身代わり拡張に進まない。
5. **LOOK_AND_REORDER の canTrash UI（v0.431 実装）も実機検証推奨**（PvP/CPU対話・ヘッドレス不可）。
5c. **WX04-005-E3 シグニ場出し数制限（要実機検証・ヘッドレス不可）:** 「すべてのプレイヤーはシグニを1体しか場に出せない（既に2体以上なら1体になるよう捨てる）」を実装。継続STUB `LIMIT_ALL_FIELD_1`（パーサー＋JSON durable）＋`computeFieldSigniLimit`（自他いずれかのセンタールリグが持てば両者適用）。**召喚制限**＝人間ゲート(canFitSomewhere)＋CPUループに体数上限を追加。**捨て補足**＝グロウ時に各プレイヤーへ「自分のシグニを超過分だけ選んでトラッシュ」を合成スタックエントリ（`__field_limit_trash__`＝TRASH SIGNI self count=超過数）として積み、**選択式**で削減（人間 executeGrow は自他とも選択／CPUグロウは CPU自身のみ自動=レベル高優先・人間相手は選択エントリ）。**検証点／近似:** ①CPU自身の削減のみ自動（レベル高優先）、②削減時の **ON_LEAVE_FIELD/ON_TRASH トリガーは TRASH アクション経由で発火する想定だが要確認**、③出場制限は「シグニを場に出す」全経路（効果による場出し＝ADD_TO_FIELD等）には未適用＝手札召喚のみ、④非ターンプレイヤー（相手）への選択提示がスタック経由で正しく出るか要実機確認。
5b. **WX04-004-E2 守備側アタック無効化（要実機検証・ヘッドレス不可）:** 「対戦相手のシグニが正面なしでアタックしたとき、《緑》《無》＋手札の＜美巧＞シグニ1枚を捨ててそのアタックを無効にしてもよい」を実装。新 timing `ON_OPP_SIGNI_ATTACK_DIRECT`＋`performSigniAttack` で正面空のとき守備側ルリグ能力をスタックに積む＋STUB `OPP_DIRECT_ATTACK_NEGATE`/`OPP_DIRECT_ATTACK_NEGATE_PAY`（支払い可否判定→CHOOSE→エナ自動支払い＋＜美巧＞自動捨て→アタッカー(otherState)の `cancel_current_signi_attack` 設定）。**検証点:** ①守備側（非ターンプレイヤー）にCHOOSEが提示されるか、②支払い後 Phase2(line~6654)でダメージがスキップされるか、③スタック writeback で otherState のキャンセルフラグ＋pending_signi_battle が両立保存されるか、④＜美巧＞捨ては手札からの選択UI（TRASH HAND_CARDで選択→continuationでエナ支払い＋フラグ設定）、⑤エナ支払いは自動割り当て（緑1＋無1）。
6. **未着手の大物:** D（CPU AI 拡張）、F-3 の効果バニッシュ経路（犠牲/コスト型の `execBanish` 側フック）。

### 逆翻訳スキャンで判明した系統バグ（ymst 向け・横展開で潰す）

逆翻訳と原文の突き合わせで見つかった「パーサーが生む典型的な誤り」。Sheet1 で順次修正中（v0.403〜）。**他Sheet（WX02〜/WXDi/WXK帯）にも同型が多数残るはず。**

- **「そうした場合」→ `CONDITIONAL{IS_MY_TURN}` 誤パース:** 特に **LIFE_BURST は相手ターン発動なので IS_MY_TURN が常に false＝後続が永久不発の致命バグ**（WX01-030 BURST で発見・修正、`execLifeCrash` に `conditional` 新設）。`IS_MY_TURN` を使う CONDITIONAL は原文が「そうした場合」「〜した場合」なら誤りを疑う。
- **「シグニをトラッシュに置く」を `BANISH` 誤用:** バニッシュは既定でエナ行き＝トラッシュにならない（WX01-023 で修正）。**粗スキャンで〜49件疑い（誤検出多数・効果単位の原文照合が必要）。** 検出: `BANISH(SIGNI,opponent)` かつ当該効果原文が「…シグニ…をトラッシュに置く」。
- **条件（activeCondition / AUTO condition）欠落で常時化:** 「〜があるかぎり」「パワーN以上の場合」等が抜けて無条件発動（WX01-002 場色条件／WX04-013/015 SELF_POWER_GTE／WX04-009 等）。
- **「それ」のトリガー元参照が `owner:any` 自由選択に:** 「アタックしたとき、それの…」の「それ」＝トリガー元なのに任意シグニ（相手も）選べる（WX01-029-E1＝`targetsTriggerSource` で修正）。
- **「このシグニ」が自由選択に:** GRANT_KEYWORD 等で「このシグニは得る」が任意自シグニに見える（WX01-029-E3＝`thisCardOnly` で明示。`execGrantKeyword` に thisCardOnly 対応追加済）。
- **「そのシグニのパワー以下」等の動的フィルタ欠落:** WD04-018＝`powerLteLastProcessed` 新設で修正。
- **【Team】参照が Story/CardClass 誤参照 or 脱落（系統バグ・修正済）:** WIXOSS の **Team**（CSV `Team` 列。NoLimit/CardJockey/うちゅうのはじまり/アンシエント・サプライズ/DIAGRAM/きゅるきゅるーん☆/さんばか/デウス・エクス・マキナ/夢限少女 の9種）は CardClass/Story とは別軸。「＜Team＞のルリグが3体いる場合」等を AUTO パーサーが `story` に誤parse、または Team 条件ごと脱落（「代わりに」累積化）していた。**`LRIG_TEAM_COUNT` 条件を新設**（場のルリグ＝センター＋アシストL/R の `CardData.Team` 一致数）。本文Team参照の8枚を修正済: WXDi-D01-021（アンシエント・サプライズ）/WXDi-D02-29（さんばか）/WXDi-D03-021（NoLimit。story:NoLimit 誤参照も除去）/WXDi-D04-021（CardJockey。REVEAL_AND_PICK化）/WXDi-D05-021・WXDi-D09-P27（うちゅうのはじまり＝G227）/WXDi-D06-021（DIAGRAM）。WXDi-D02-19LAT は **【使用条件】＜さんばか＞** が対象シグニフィルタに誤混入（＋使用条件「全員レベル1以上」の level:{min:1} 混入）→除去し、本来の ＜バーチャル＞(CardClass) を付与。**残**: WXDi-P00-026（＜さんばか＞のルリグに能力付与）はルリグ対象 grant＋`TargetFilter.team`＋付与能力(ON_ATTACK_LRIG→UP)が必要で未配線（誤UPは no-op STUB `GRANT_UNTAP_ON_ATTACK_TO_TEAM_LRIG` で停止）。47枚の **【使用条件】【チーム】＜Team＞** 系（ピース/アーツの使用ゲート）は使用条件機構が未実装で別途。
  - **着手調査（2026-06-25）— P00-026 と47枚は core 機構の改変が必要なため保留:**
    - **P00-026 の核心ブロッカー＝ルリグ再アタック未実装。** 付与自体は `GRANT_LRIG_ABILITY`→`lrig_granted_auto_effects`（ターン終了でクリア）で可能だが、付与能力「アタック時このルリグをアップ」でアップしても **`lrig_has_attacked` ハードゲート（BattleScreen:8800「ON_ATTACK_LRIGでアップされても再攻撃不可」）** で再アタックできない＝効果が空振り。実装には ①新アクション `LRIG_ATTACK_AGAIN`（アップ＋`lrig_has_attacked`クリア）②付与ルリグON_ATTACK_LRIGトリガーの `usageLimit`(once_per_turn) **強制**（現状8832-8843は未チェック＝無いと無限再アタック）が必要。core戦闘＋ループ防止に関わり、1枚のためにはリスク過大として保留。
    - **47枚の使用条件【チーム】は意図的な非強制（`USE_CONDITION_TEXT` no-op）。** 強制化はピース/アーツ使用フローへの横断的フック＋誤ブロックのリスク。かつ正規デッキでは条件は常に満たされる（チームデッキでしか積まない）ため**ゲーム的価値が低い**。現状の「常に使用可」近似で機能的に等価。保留が妥当。
- **ベットのコイン支払い機構（コア解決済）:** 以前は **(1) スペルのベットが未実装＝コイン未払い**（`castSpell`/スペルモーダルにベット無し）、**(2)「ベット―好きな枚数」(WX22-016) が解析不能**、**(3)「ベット―《コイン》or《コイン》《コイン》」(WX16-004) が第1段のみ**、だった。**修正:** `parseBetOptions`（固定/段階(or)/可変(好きな枚数)を統一）＋ベット枚数を数値 state `betAmount` 化。アーツ/スペル両モーダルに枚数選択UI、`executeArts`/`castSpell` で選択枚数分のコイン消費＋`is_betting_this_effect`/`bet_coins_paid`（PlayerState 新設）設定。アンコール併用時の合算可否ガードも追加。**残:** 可変/段階ベットの**効果スケール**（WX22-016 のコイン枚数ぶん繰り返し等）は `bet_coins_paid` を読む個別対応が未（コイン支払いは正しい）。
- **ベット「あなたがベットしていた場合、代わりに〜」が累積化（系統バグ・一部修正済）:** AUTO パーサーが「基本効果」と「代わりに」の強化効果を **SEQUENCE で両方適用**（例: 1体バニッシュ＋全体バニッシュ）してしまう。本来は**択一**（ベットなら強化／しなければ基本）。**`IS_BETTING` 条件を新設**（`evalCondition`＝`is_betting_this_effect` 参照、`CONDITIONAL{IS_BETTING, then:強化, else:基本}` で表現）。`BANISH`/`BOUNCE` に `opponentSelects`、`TrashAction` に `bestEffort`、`DownAction` に `optional` も新設済。
  - **修正済（20枚・CONDITIONAL{IS_BETTING}化）:** ①単純置換11枚: WDK08-L08・SPK16-13B（1体→全体バニッシュ）／WX15-015（draw2→4）／WX15-030（チャージ1→2）／WX16-011（バウンスLv3以下→無制限）／WXK01-011（バニッシュ7000→20000）／WDK02-008（ダウン1→2）／WXDi-P07-068（バニッシュ8000→無制限）／WXDi-P09-076（チャージ2→3）／WXDi-P09-083（－7000→－12000）／WXDi-P15-075（－2000→－7000）。②複合9枚: WX15-005（ライズ場出し＋バニッシュ1→全体、powerLteLastProcessed付与）／WX15-026（黒蘇生1→2）／WX16-010（怪異サーチ1→2）／WX18-004（ダウン＋ドロー：欠落を復元し1体1枚→3体3枚）／WD22-012-G（相手トラッシュ＋遊具蘇生のレベル制限解除）／WDA-F01-09（能力消失1→全体、both ターン終了時まで）／WXDi-D09-P26（draw2→3、discard固定＋スペル封じ）／WXK04-019（ダメージ無効1→2、PREVENT_NEXT_DAMAGE count）／WDK13-007（レベル合計バニッシュ・**自シグニ巻き込み誤りを修正**。`EffectTarget.totalLevelMax` 新設）。
  - **修正済（追加2枚・専用機構）:** WDK08-Y07（手札からシグニ公開→そのパワー以下を対象。`REVEAL{source:HAND_CARD}` を実装＝手札選択で公開し lastProcessedCards に記録、`execSendToEnergy` に動的フィルタ解決を追加。ベットでバニッシュ→エナ送り＋チャージに分岐）／WX16-004（段階追加型：基本ダウン＋ベットで追加ダウン＋《コイン》2枚で常時能力付与。`IS_BETTING.minCoins` 新設で段階判定。ルリグ能力＝ホログラフ置換は GRANT_LRIG_ABILITY のまま近似）。
  - **修正済（追加1枚・専用機構）:** WDK10-008（相手トラッシュ3枚をゲーム除外→共通色なら黒シグニ手札2/4。**`EXILE` アクション新設**＝トラッシュから取り除き lastProcessedCards に記録、**`LAST_PROCESSED_SHARE_COLOR` 条件新設**＝除外カード全てに共通色があるか判定）。
  - **修正済（追加1枚・傀儡サブシステム）:** WDK17-007（相手トラッシュからシグニを傀儡状態で自場に1→2枚）。①**steal を独立STUB** `STEAL_OPP_TRASH_PUPPET`＋`INTERNAL_PLACE_PUPPET` で実装（`execAddToField` を触らず、`opp_trash` から選択→自場の空きゾーンへ配置→`field.puppet_signi` に記録。ベットで2枚）②**離場回収**＝`field.puppet_signi`（PlayerState.field 新設）＋`sweepPuppets`（execUtils）で、場を離れた傀儡を持ち主＝相手のトラッシュへ回収。`applyRefreshOnDone`（効果解決後・全効果チョークポイント）と `resolvePendingSigniBattleFor`（バトル解決後）の2箇所に配線。**近似:** バニッシュは一旦エナ等へ行ってからスイープで持ち主トラッシュへ回収する後追い方式（最終位置は正しい）。**ベット系の「代わりに/段階/追加/傀儡」は全24枚完了。**
  - **STUB系（BET_MECHANIC①②③選択／未対応パターン）:** WX15-029・WX16-005・WX17-003/005/006/019・WX19-005/006・WX22-016・WXK01-034・WXK04-014・WXK07-105/106・WD17-006・WD19-006/007・WD20-006/007・WD21-007・WD23-017-EA・WDK01-007/010・WDK03-009・WDK05-T10・WDK06-R07/R08・WDK07-Y07/Y08・WDK08-Y06・WDK12-007・WDK15-007・SPK16-13E・PR-K072・WXDi-P07-059/P15-071 等は `execStub` の `BET_MECHANIC`/`BET_CONDITION` 依存。BET_CONDITION はテキストマッチで一部パターン（さらにN枚引く／A枚の代わりにB枚手札）のみ対応、それ以外は no-op。要個別確認。
- **引用付与のフラット化 → 有害 CONTINUOUS BANISH:** F 節参照（27件 v0.414/0.415 で manualEffects 昇格・解決済。同型が他Sheetにある可能性）。
- **`FREEZE` の自動ダウン誤り（解決済 v0.433/0.434）:** engine の `execFreeze` が常時 `signi_down` も立てていたため純「凍結する」カードまで誤ってダウンしていた。`FreezeAction.down?` 新設で「ダウンし凍結」のみダウン。既存 `SEQUENCE[DOWN,FREEZE]` 82効果も `FREEZE(down:true)` に一括変換（同一対象の二重選択バグ解消）。**他Sheetの凍結カードは挙動 OK。**
- **`ADD_TO_FIELD` の source 欠落でデッキトップ誤配置（一部解決・残あり）:** 「エナ/手札/トラッシュ/ルリグデッキ から[フィルタ]シグニ（レゾナ）を場に出す」が source 無しの bare `ADD_TO_FIELD` になると `execAddToField` の `!src` 分岐が**デッキトップを出す**（全く別カードが出る重大誤り）。逆翻訳の「**直前に選んだカードを場に出す**」がサイン。**LOOK/SEARCH の後に続く bare ADD_TO_FIELD は正当**（`applyDirectAction` が選んだカードを出す）。`effect.action` が直接 or SEQUENCE 先頭の bare ADD_TO_FIELD のみ要注意。
  - **解決済（v0.435〜0.437・27効果）:** エナ配置9（parser「エナゾーンから…場に出す」→source:ENERGY_CARD）／ルリグデッキレゾナ9（→ STUB `SUMMON_RESONA_FROM_LRIG_DECK`）／手札配置の単純系9（parser「手札から…場に出す」→source:HAND_CARD、「Xではない」=colorExclude）。
  - **解決済（v0.438・①〜⑥すべて／詳細は BUGFIXES.md）:** ①エナ配置 SEQUENCE 形11（対象再生成。parser は v0.435 で生成済だったが JSON 未再生成だった。`parseStoryFilter` 重複除去も追加）②動的フィルタ手札配置/leave2（`ON_LEAVE_FIELD` timing 判定新設＋`powerBelowLeftCard` 新設＋triggerScope/triggerFilter 抽出）③名指し手札配置2（`parseNameFilter` 付与＋`ON_REVEALED_FROM_HAND` broaden）④ベット/アンコール2（現行 parser で正・再生成のみ）⑤クラフト/トークン配置7（parser「クラフトの《X》場に出す」→`ADD_TO_FIELD{cardName}`＋`execAddToField` で CardName→CardNum 解決・幅正規化）⑥WX20-002-E3 エナ配置・WX22-001-E1 トラッシュ配置（再生成）。`WX22-001-E3`（付与型遅延 leave トリガー）は機構未実装のため no-op STUB `GRANT_LEAVE_PLACE_PENDING` で誤配置回避。**残り近似:** WXDi-CP02-087 エナ枚数条件・WXDi-P03-078 自パワー動的フィルタ・WXDi-P05-068 先頭ドロー脱落・WXK07-105 ベット分岐・WX25-CP1-066 場存在条件・WX22-001-E3 付与型 leave トリガー機構・**クラフトトークン実機配置の検証**。
- **逆翻訳器の表示漏れ（実害なし・カードは正しい）:** `cardType` フィルタ未表示で「カード」に見える（WX01-007/025＝SEARCH/領域カードに cardType 名詞反映で解消）等。**「カードに見えるが実はシグニ限定」は逆翻訳器の表示問題でカードは正しいことが多い** ので、必ず JSON を確認してから直すこと。
- **エナ送り（エナゾーンに置く）の `SEND_TO_ENERGY` 移行・残6枚（2026-06-24）:** バニッシュと別アクション `SEND_TO_ENERGY` を新設し、相手シグニのエナ送り48枚中42枚を移行済（BUGFIXES参照）。**残6枚はエナ送り文がSTUB/能力付与/別誤パースに埋もれており要個別実装:**
  - `WXEX2-20`（ルリグ・E3 `GRANT_QUOTED_AUTO_ABILITY` 内：捨てたシグニと同レベルの相手ダウン状態シグニをエナ送り）
  - `WXDi-P01-040`（E1/E2 `GRANT_QUOTED_AUTO_ABILITY`・FLIP系STUB内：相手全シグニをエナ送り）
  - `WX25-P2-041`（アーツ・付与する引用能力「それは『…エナゾーンに置く』」内：パワー10000以下をエナ送り）
  - `WXK09-031`（シグニ・E1 が `ENERGY_LEVEL_CONDITION_CHOOSE` STUB＋`TRASH ALL` に誤パース。本来は「対象の相手シグニ1体をエナ送り」）
  - `WXK10-011`（アーツ・選択肢①が `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` STUBに吸収。①＝相手シグニ1体をエナ送り）
  - `WXDi-P01-005`（ピース・【使用条件】が `GRANT_KEYWORD` に誤パース。本来は条件達成で相手全シグニをエナ送り）
  - いずれも親STUB（引用能力付与・選択肢・使用条件）の実装が前提＝エナ送り区別とは独立の既存課題。

---

## 全体方針

**STUB の本実装化を継続する。** STUB_LOG（ログのみ）は v0.284 で 0 件達成済み。
以降は「ゲーム効果はあるが近似実装」や「機構未実装で UNKNOWN」のものを順次本実装に移行する。

---

## A. 個別カードの未対応・近似実装

| カード | 内容 | 状態 |
|---|---|---|
| ~~PR-Di035（青）~~ | 「相手手札3枚捨て」が先頭3枚固定の近似だった | → 監査(v0.359)で解消済を確認。`PRDI035_APPLY_PARADISE`(execStubPart3.ts:4490)は青成立時に `TRASH{HAND_CARD,owner:opponent}` を `opponentResponds` 付きで発行し相手が選んで捨てる実装。先頭固定の近似は既に撤去済み |
| ~~WXDi-P03-085（ルカ）~~ | 「黒ではない」除外を無視した近似 | → v0.359 で `colorExclude:黒`＋`powerRange.max:3000` を付与し実装済 |
| ~~WX17-035（ピグシイ）~~ | 「このシグニの正面のシグニ」の表現がなく近似（owner:self で全体除去のバグ） | → v0.359 で `execRemoveAbilities` に `frontOfSelf` を追加し正面1体に限定 |

> **解決済み（2026-06-19, v0.337）**: WX21-035（4択2つCHOOSE）/ WX22-029（エナ→手札→エナ）を実装（詳細は BUGFIXES.md）。
> **解決済み（2026-06-19, v0.335）**: WXDi-P07-073 / WXK07-043 は実装完了（HANDOFF の「dormant」記述は古かった）。
> WXDi-P07-073 は `GRANT_LRIG_ABILITY`→`lrig_granted_auto_effects` で相手ターン終了時に発火（実装済み）。
> WXK07-043 はバニッシュ耐性キー不一致のバグを修正（詳細は BUGFIXES.md）。

### 「アタックフェイズ開始時」系の横展開（注意）

- パーサー修正により「あなたのアタックフェイズ開始時」(self=約407件) など多数が `ON_ATTACK_PHASE_START` 出力になるが、**全再生成は禁止**（実測で約90枚が退化する）。
- データは個別に timing / triggerScope を直すこと。2026-06-18 ラウンドでは「対戦相手の」系32枚を対象に実施済み。残りは個別対応。

---

## B. 機構未実装（大規模基盤変更が必要）

| 機構 | 内容 | 影響カード例 |
|---|---|---|
| クラッシュ時トリガー（複雑ケースのみ残） | 機構は配線済み（全クラッシュ経路が `crashOneLife`/`execLifeCrash(triggerBurst)` 経由でチェックゾーンに集約→`collectSelfEventTriggers('ON_LIFE_CRASHED')`）。v0.362 で collector をルリグ／キーも走査するよう拡張。v0.364 で**トラッシュ走査**を追加し自己復活の WX11-026 を実装済（BUGFIXES参照）。実態は**データ誤パース**で、自分ライフ・クラッシュ時の単純な【自】7枚（WXDi-P02-037/WX02-003/WX14-CB05/WX21-Re03/WXK03-014/WXK11-034/WD21-011）を `ON_LIFE_CRASHED` に修正済。残るは複雑ケース：v0.365 で**相手ライフクラッシュ時トリガー機構（`ON_OPP_LIFE_CRASHED`）を新設**し WX16-Re07（ダブルクラッシュ2枚以上→自身アップ）を実装済（BUGFIXES参照）。v0.366 で**カウンタークラッシュ機構（`life_crash_counter`＋STUB `SET_NEXT_LIFE_CRASH_COUNTER`）を新設**し WX25-P1-004（アーツ）・WXDi-P12-030（アシストルリグE1）を実装済（BUGFIXES参照）。v0.367-0.368 で**付与経由 ON_LIFE_CRASHED**＋**ON_SIGNI_BATTLE**＋**UNTIL_OPP_TURN_END 永続ストア**（`granted_effects_until_opp_turn`/`power_mods_until_opp_turn`）を新設し、WX25-CP1-075（バトル節含め完全化・E2絆自のみ未実装）と WXDi-CP02-084（E2絆常のみ未実装）を実装済（BUGFIXES参照）。**B節クラッシュ複雑ケースは全完了**（v0.372 で WX25-CP1-065 を実装し残0件）。 | 上記 |

> **解決済み（2026-06-20, v0.372）**: ~~WX25-CP1-065（相手ライフクラッシュ時＋遅延対象記憶）~~ → 別ストアを設けず、選択した相手シグニ自身に `GRANT_EFFECT` で `ON_LIFE_CRASHED→POWER_MODIFY thisCardOnly -2000` を付与（相手視点の自ライフクラッシュ＝そのまま `collectSelfEventTriggers` で発火）。即時-2000と付与は STUB `TARGET_AND_DISCARD_HAND` の thenAction を `SEQUENCE[POWER_MODIFY, GRANT_EFFECT]` にして1回の選択で同一対象へ適用。**これで B節クラッシュ時トリガーの複雑ケースは全完了**（詳細は BUGFIXES.md）。
> **解決済み（2026-06-20, v0.371）**: ~~WXDi-P06-007（クラッシュ無関係の別効果が誤リスト）~~ → 3能力とも実装。E3 を `GRANT_EFFECT`（thisCardOnly＝センタールリグへ UNTIL_END_OF_TURN）で `ON_OPP_LIFE_CRASHED`＋`twice_per_turn`＋`CHOOSE(自ドロー/相手ディスカード)` を付与（v0.370 の lrig 走査基盤に乗る）。E1 は新 Condition `CARDS_DRAWN_BY_EFFECT`（`cards_drawn_by_effect_this_turn` を execDraw で加算）を `CONDITIONAL` で評価＋「捨ててもよい」を CHOOSE で表現。E2 は DRAW 欠落を補完（詳細は BUGFIXES.md）。

> **解決済み（2026-06-20, v0.370）**: ~~WXDi-P16-039（lrig自己付与＋両者クラッシュ＋ターン2回）~~ → `manualEffects.ts` の `WXDi-P16-039-E2` を `GRANT_EFFECT`（`thisCardOnly`＋`UNTIL_OPP_TURN_END`）でアシストルリグ自身へ付与。付与能力は timing `[ON_LIFE_CRASHED, ON_OPP_LIFE_CRASHED]`＋`twice_per_turn`＋`CHOOSE(ドロー/エナチャージ)`。`execGrantEffect` の thisCardOnly をアシスト/センタールリグゾーンへ拡張、`collectSelfEventTriggers` の nonSigniSources＋`performLifeBurstResponse` の ON_OPP_LIFE_CRASHED 収集を lrig/アシスト/キー走査かつ twice_per_turn 対応に拡張（詳細は BUGFIXES.md）。
> **解決済み（2026-06-20, v0.369）**: ~~WDK17-009（条件付き／3択）~~ → `manualEffects.ts` に `WDK17-009-E1` を追加（`ON_LIFE_CRASHED`＋`triggerScope:self`＋`once_per_turn`、キーは v0.362 で collector 走査済）。選択肢③は `AND[LRIG_NAME_CONTAINS アルフォウ, LIFE_COUNT self lte 1]` の per-choice condition で `execChoose` がゲート。「相手アタックフェイズの間」は近似省略。E2（対戦相手選択の複雑効果）はパーサー生成のまま維持（詳細は BUGFIXES.md）。

> **解決済み（2026-06-19, v0.359 監査）**: ~~CONTINUOUS REMOVE_ABILITIES~~（WX16-001/WXDi-P05-045/WXK01-002/WXK04-068）は `collectContinuousAbilitiesRemovedSigni`（effectEngine）で対面/全体除去ともに実装済み。~~CONTINUOUS DRAW~~（WXDi-P04-056）は実体が「パワー8000以上の間アタック時に手札1枚捨てて1枚引く」の条件付き付与で、`SELF_POWER_THRESHOLD`＋捨て引きSEQUENCEで実装済み（TODO記載が誤り）。~~動的 choose_count~~（リコレクト）は `execStubPart`/`effectExecutor.ts:1609` の `a.recollect` 上書き（トラッシュの＜プリオケ＞数が閾値以上で選択数を変更）で実装済み。~~遅延能力付与（FS③・WX26-CP1-001）~~は `GRANT_PRIOKE_PENDING_ATTACK_TRASH`→APS時 `INTERNAL_APPLY_PRIOKE_ATTACK_TRASH` で対象プリオケへ付与する形で実装済み。v0.360 で付与能力を `BANISH`→`TRASH`（「トラッシュに置く」＝非バニッシュ）に忠実化。~~ダーク系TK6 `NO_BATTLE_DEFENDER`~~（幻怪ヤミノザンシ）は監査の結果 BattleScreen の `resolvePendingSigniBattleFor`（人間・CPU共通）で既に実装済みと判明（6446〜6454：防御側が当 CONTINUOUS を持つと `effectivelyEmpty`＝アサシン同様にバトルを飛ばしライフへ・防御シグニは残存）。engine 未対応との旧記載はバトルロジックが BattleScreen にあるための誤認だった。
| トラッシュからの自己起動（コスト拡張） | **機構＋UI＋データは v0.455 で新設**（`trashActivated` フラグ＋トラッシュ ZoneCardModal 発動ボタン＋`executeTrashActivated`＋`execAddToField` の thisCardOnly トラッシュ source）。**UIで発動可能なのはエナコストのみ・MAINフェイズの自己蘇生**（WX02-069/071/WXK02-037/WXK11-071）。**残**: ①手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動のコストUI（WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050・WX11-049・WX17-049・WX19-029）②CPU AI のトラッシュ起動使用③実機検証（PvP/CPU・ヘッドレス不可）。データ（thisCardOnly＋trashActivated）は全14枚で正。 | 全18枚（自蘇生14枚） |
| ~~手札からの自己起動~~ | **解決済み（2026-06-20, v0.373）**。機構（手札発動UI `handActivated`＋`executeHandActivated`／spell-cut-in 窓の hand 走査）は既存で、パーサーの配線漏れ（`handActivated` 未付与・全【起】timing=MAIN固定でアイコン無視）が原因だった。effectParser を「手札からこのカードを捨て[る、]」限定で `handActivated`＋アイコン別timing（SPELL_CUTIN/ATTACK_ARTS/MAIN）を付与するよう修正、COUNTER_SPELL の `maxCost:0`（WX17-031）と removeOppVirus 複合コスト（WX21-030）も対応。対象9効果のみJSON外科パッチ（全再生成回避）。**残**: なし（全効果実装済み）。~~spell-cut-in の「場に＜凶蟲＞」条件~~ は v0.375 で cutinCandidates に `eff.condition` 評価を追加＋WX17-031-E3 に条件付与で強制。~~WX19-045 のウィルス充填~~ は v0.374 で `PLACE_VIRUS{fillToTotal}`（配置先選択式）で実装。**この項目は完了。** | WX17-031 等9枚 |

---

## C. 特殊システム（v0.359 監査: 全て実装済み・残るは個別精査のみ）

> **2026-06-19 監査結果**: 下記4システムは「STUB ログのみ」ではなく、いずれも engine に実体実装が存在する（前セッションで実装済み・TODO 未更新だった）。ヒューリスティックなテキスト解析ベースのため、個別カードのエッジケースが残る可能性はあるが、システムとしては機能する。

| STUB / システム | 件数 | 実装状況 |
|---|---|---|
| GRANT_QUOTED_AUTO_ABILITY 系 | 約27件 | `execStubPart1.ts:312`〜 で引用テキストからキーワード/CONTINUOUS能力を抽出して付与。実装済（ヒューリスティック） |
| GAIN_SUBSCRIBER_COUNT | 16件 | `execStubPart1.ts:997` でテキストから加算量を解析し `subscriber_count` を増加。読み取り側(`SUBSCRIBER_COUNT` Cond/パワー/ドロー)も実装済 |
| SONG_FRAGMENT | 10件 | `execStubPart1.ts:2141` でエナの【歌のカケラ】を選択・処理。実装済 |
| COPY_LRIG_NAME_ABILITY | 16件 | `execStubPart1.ts:1608`＋`effectEngine.ts:2633/2724` でルリグトラッシュ参照のカード名エイリアスを設定。実装済 |

---

## D. CPU AI の拡張

- メインフェイズ AI（アーツ/スペル/起動効果の能動使用、グロウ時トリガー）が未実装。
- CPU 召喚の ON_PLAY 解決は「全配置後にまとめて」の近似（人間は1枚ごと）。

---

## E. 検証・品質

- `checkAllEffects` の `MANDATORY_SUSPICIOUS`（ヒューリスティック検出・要精査）の精査。
- `verifyEffects` の「定義なし」誤検出（注釈のみ・トークン等）の除外ロジック改善。

### 逆翻訳ツール `scripts/decompileEffects.ts`（2026-06-20 新設）

JSON効果を日本語に逆翻訳し CardData 原文と並べてレビューする検証補助。`npx tsx scripts/decompileEffects.ts --sheet <N> | <CardNum...> | --manual | --grep <語>`。
- **Sheet1 全974枚の逆翻訳結果を共有: [`docs/decompile_sheet1.txt`](./decompile_sheet1.txt)**（ツール更新時は `npx tsx scripts/decompileEffects.ts --sheet 1 > docs/decompile_sheet1.txt` で再生成）。ルート直下の `decompile_*.txt` はスクラッチ扱いで gitignore。
- **v0.404 で逆翻訳器を強化:** ①STUB は `id` ではなく **STUBS.md の説明文**を表示（id→説明マップを STUBS.md の表からパース）。②未対応アクション補完（`REVEAL_AND_PICK`/`REARRANGE_SIGNI`/`NEGATE_ATTACK`/`COUNTER_SPELL`/`SHUFFLE_DECK`/`EQUALIZE_ENERGY`/`COST_REDUCTION`/`GROW_FREE`/`MOVE_TO_ENERGY`/`ATTACH_CHARM`/`REMOVE_CHARM`/`POWER_MODIFY_PER_*` 一括）。③条件（Condition）を `[条件:ID]` から説明文へ（`condJa` に約30種を追加。条件は effects.ts に約40種と少数のため別メモは作らず switch 直書きが最適）。
- **既知の限界（残）:** 「素朴なキーワード差分」は誤検知（コスト文・ルール注記）。本格運用には近似承認リストが要る。

### Sheet1（974枚）スキャンで判明した残課題（2026-06-20）

- **UNKNOWN（部分未実装・parseStatus=PARTIAL）:** `WX05-010`（ライフを見て好きな枚数トラッシュ→同数補充）/ `WX11-037`（デッキ5枚公開→宣言カード手札・残りデッキ下）/ `WX11-043`（ヘブン時に手札の青スペル使用）/ `WX17-003`。効果の一部が UNKNOWN のまま。未完であり退化ではない。
- ~~コスト払い型 `BANISH_SUBSTITUTE`（WX10-033/WX11-029）が宣言だけで未実装~~ → **v0.402 で実装済**（BUGFIXES.md 参照）。~~`WX06-019` は効果離場型のため未対応~~ → **v0.403 で実装済**（効果バニッシュ経路 `execBanish` に powerReduction 自動適用フックを追加。BUGFIXES.md 参照）。
- 他Sheet（特に WXDi/WXK 帯）は近似・STUB が多く本物の誤りが出やすい。逆翻訳ツールで順次スキャン推奨。

### 系統分け／同型グルーピング・インデックス（2026-06-23 新設・ymst→zerom 引き継ぎ）

逆翻訳バグを「似た系統でまとめて」発見・修正するための調査インデックス。LLM に全文を読ませず grep／多数決で機械的に束ねる（トークン削減が目的）。

**ツール（`scripts/`）:**
- `groupBySystem.mjs` — 原文キーワードで系統別件数を集計
- `groupSimilar.mjs` — **カード全体が同型**なのに逆翻訳が割れるグループ（★）を検出＝**高精度**バグ候補
- `groupBySentence.mjs` — **効果文単位**でグルーピング＋★検出＝網羅的だが誤検出多め（要トリアージ）

**生成物（`docs/`・人間が開く検索インデックス。コンテキストに丸載せしない）:**
- `decompile_sheet{1-10}.txt`（全10シート展開済）
- `grouped_all.txt`（同型）／`grouped_sentence_all.txt`（文型）＝**全シート統合版**。再生成: `node scripts/groupSimilar.mjs --all` ／ `node scripts/groupBySentence.mjs --all`（`--all` が `decompile_sheet*.txt` を自動結合・中間ファイル不要）。decompile 自体は `npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt` で再生成。

**運用の要点:**
- **必ず全シート統合（`--all`）で見る。** 系統が弾をまたぐとシート別では取りこぼす（例: WX05-054/076 は手本 WX03-037 が同シートだったから検出できた）。
- ★は「同じ原文型なのに逆翻訳の構造が多数派と違う」カード。**多数派が正・外れがバグ**のことが多いが、原文を見て最終判断する。
- **一括無検証の全置換は禁止**（約90枚退化の前例。A節参照）。系統ごとに機構を1回確立 → 同パターン適用 → 各カード verify。

**現状（2026-06-23）:**
- **同型★は枯れた。** カード番号の多セグメント化（`WXDi-P01-061-E1` 等）とタイミング語（ATTACK/メイン起動）の正規化で誤検出を除去（155→7枚）。構造バグは **WX05-009 / WX05-054 / WX05-076 で出尽くし、すべて修正済**（BUGFIXES）。残る同型★1件 `WX04-056` は**無害な表現差**（`cardClass:アーム` でも `story` と同じ `card.CardClass` を照合し機能正常。`story:アーム` に揃えれば★0だが任意）。

**G072 系（対戦相手シグニのバニッシュ反応）の残り6枚（2026-06-23・ymst）:**
- G072「対戦相手のシグニがバニッシュされたとき」を `ON_BANISH`＋`triggerScope:any_opp` に修正済（クリーン10枚パッチ／BUGFIXES）。
- **残: トリガー前に条件前置きが付く6枚**は未対応（パーサーの分岐が `^対戦相手の…` アンカーのため不一致＝現在 `ON_BANISH` 自バニッシュのまま誤分類）:
  - 「あなたのメインフェイズの間」WX05-040・WX11-027／「アタックフェイズの間」WXEX2-23（→ 相フェイズ condition）
  - 「あなたの効果によって」WXK11-055／「あなたの＜龍獣＞のシグニの効果によって」WX13-051（→ byOwnEffect 限定 + story filter）
  - 「【チャーム】が付いている対戦相手のシグニ」WXDi-P11-TK05（→ charm 付き triggerFilter）
- これらは前置きの condition/triggerCondition モデリングが要り、誤モデル化リスクが高いため個別対応。

**G073 系（ON_ZONE_MOVED）の engine 配線 — 完了（2026-06-23・ymst）:**
- 配線済（BUGFIXES 参照）。移動実行3パス（`INTERNAL_MOVE_TO_ZONE` / `INTERNAL_REPOSITION_TO_ZONE` / `INTERNAL_REPOSITION_MOVE` / `REARRANGE_SIGNI` 解決）が `zone_moved_just` フラグを所有者 state に積み、BattleScreen の watcher が `collectZoneMovedTriggers` で scope 別（self/any_ally=mover側・any_opp=相手側・any=両方）に発火・クリア。テキスト読み取りハックは撤去。
- **GRANT_KEYWORD の targetsTriggerSource 対応済（2026-06-23）:** GrantKeywordAction に `targetsTriggerSource` を追加し execGrantKeyword で `triggeringCardNum→sourceCardNum` へ無選択付与。effectParser の ON_ZONE_MOVED self 後処理が POWER_MODIFY に加え GRANT_KEYWORD(self,count:1,filterなし) も自動マーク。WXK03-073 はランサーも +2000 も移動シグニ自身に適用（JSON 直 SEQUENCE・MANUAL）。

**`ON_SIGNI_BECOMES_DRIVE`（ドライブ状態になったとき）の engine 配線 — 完了（2026-06-24）:**
- 逆翻訳乖離 G184/G218 修正で新設したトリガー timing を配線済（`【※engine未配線】`マークは除去）。対象: WXK01-076/079（`triggerScope:any_ally`・任意《赤》コスト→パワー以下バニッシュ）／ WDK01-014/017（このシグニ自身・無条件バニッシュ＋LBドロー）。従来は `ON_PLAY` 誤分類で「場に出たとき」に発火していた（偽の挙動）。
- ライド実行3パス（execStub の `LRIG_RIDE_SIGNI`/`CENTER_LRIG_RIDES_ON_SIGNI`/`RIDE_ON` が `lrig_riding_signi` を**新規**セットする瞬間＝旧 riding との差分）で所有者 state に `drive_became_just` フラグを積み、BattleScreen の watcher が `collectDriveBecameTriggers` で G073（ON_ZONE_MOVED）と同型に scope 別（self/any_ally=driver側・any_opp=相手側・any=両方）収集・発火・クリア。`triggeringCardNum=ドライブ化シグニ`。検証: `scripts/_verifyDriveBecome.ts`（8/8 pass）。

**`REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI`（G186）のアタック継続 — 完了（2026-06-24）:**
- WXK02-071/WXK10-057/WDK05-T15「アタック時このシグニを手札に戻し→デッキトップ公開→シグニならアタックしているシグニとしてダウン状態で場に出す」。
- **正確化のキモ**: BattleScreen のアタックは ON_ATTACK_SIGNI 収集前に `pending_signi_battle.zoneIndex`（アタッカーの元ゾーン）を保存し、トリガー解決後の Phase 2（`resolvePendingSigniBattleFor`）が**同ゾーンのシグニをアタッカーとして**ダメージ処理する。よって新シグニを**アタッカーの元ゾーン**へ置けばアタックがそのまま継続する（battle ループの攻撃側差し替え機構は不要だった）。STUB を「空きゾーン」配置→「元ゾーン(zoneIndex)」配置に修正。
- **「そうした場合」の厳密化**: バウンス（BOUNCE optional）を選ばなかった場合は公開も配置もしない。`IS_MY_TURN`（シグニアタック中は常時 true で「そうした場合」を表現できない）に頼らず、STUB 内で `sourceCardNum` がまだ自分の場にいる＝バウンス未実行なら不発と判定。
- 検証: `scripts/_verifyRevealTopPlaceAttacker.ts`（10/10 pass）。STUBS.md/decompile も再生成（「近似」注記を除去）。

**WXK09-038「いずれかのプレイヤーが手札を捨てたとき」の相手側発火 — 完了（2026-06-24）:**
- G189系の timing 誤り（持続「ターン終了時まで」をトリガー `ON_TURN_END` と誤認）を「あなたが」5枚＋「いずれか」1枚すべて `ON_HAND_DISCARDED` に修正（BUGFIXES 参照）。
- WXK09-038-E1 に `triggerScope:'any'` を付与。`collectHandDiscardTriggers` を triggerScope 対応に拡張し、捨てた側(discarder)のクライアントが**discarder の自フィールド（self/any）＋ discarder の相手フィールドの 'any' 効果**を収集（相手をコントローラーとして playerId 設定）。`any` はターン問わず発火、self/any_ally は従来どおり discarder の自ターンのみ。
- CPU戦は watcher に CPU(guest)側 `hand_discarded_just` 処理を追加（virus watcher の processCpu と同型。人間が CPU の捨てを検出し CPU自身＋人間盤面の効果を収集）。
- 「ガードステップ以外で」は `performGuardResponse` がガード時の手札捨てに `hand_discarded_just`/asCost を立てない構造で自然に担保。decompiler は `ON_HAND_DISCARDED`+`triggerScope:any` を「いずれかのプレイヤーが手札を捨てたとき」と和文化（`〔範囲〕`マーカーは抑制）。

**《相手ターン》《自分ターン》の AUTO/ACTIVATED 対応（2026-06-23・ymst）:**
- CONTINUOUS は activeCondition `TURN_OWNER` で対応済（BUGFIXES。G074 調査で発覚した系統バグ）。
- **残: AUTO/ACTIVATED の `《相手ターン》`/`《自分ターン》`（約33枚）は未対応。** condition 側はトリガー収集時の ad-hoc 判定（`evalCondition` は IS_*_TURN を実行時 true 扱い）で timing ごとの整備が要る。ターン条件は **必ず `TURN_OWNER`**（`IS_MY_TURN` はパーサーが「そうした場合」CONDITIONAL プレースホルダーに転用しており衝突するため使用禁止）。collectSelfEventTriggers 等の収集側で `TURN_OWNER` を評価する共通フックを入れるのが筋。

**次の一手（zerom）: 文型★のトリアージ。**
- **grouped_all.txt（同型）は全グループ G1〜G265 を確認・修正完了（2026-06-25〜26）。** 直近では G247〜G265 を是正＋多段ピック新機構 `LOOK_PICK_CHAIN` 等を新設（BUGFIXES 参照）。
- **`groupBySentence.mjs` の誤検出抑制を実装済（2026-06-26）**。3点: ①`bodyKey` で先頭接続句（そして／そうした場合／その後…）・選択肢番号（①②③④）を除去、②`splitDecomp` で CHOOSE の「次から…選ぶ【A / B】」を選択肢A・Bの別文に展開＋原文側の選択ヘッダー（「以下の2つから1つを選ぶ」等）を除外、③外れ判定を「単一多数派キー欠落」→「**共通バリアント（2枚以上に出る逆翻訳型）のどれにも一致しないカードのみ**」に変更（複数の正当バリアントを許容）。
  - 効果: **★要確認 1626枚 → 392枚**（うち STUB/UNKNOWN 除く実候補 **約339枚**）。S001「引く」は外れ147→1枚。`grouped_sentence_all.txt` の★節が実用的なバグ候補表になった。
- **残作業:** ★節（276文型・多くは外れ1〜2枚）を原文と突き合わせて潰す。**⚠ STUB行をスキップしてはいけない**: `[STUB:]` は実装済みハンドラのタグ表示（STUBS.md参照）だが、**ハンドラがカード全体を覆う場合（WX11-017＝正しい）と、STUB/単一アクションが断片しか実装せず残りを落とした場合（WX09-Re03/WDK07-E08＝実バグ）をタグだけでは区別できない**。各外れは「実装が原文全体を覆うか」を個別検証する（ハンドラ確認 or smoke テスト）。汎用 `CONDITIONAL_MULTI_CHOOSE_BY_CENTER` は「以下のNつからMつ選ぶ」全般を EffectText 実行時パースで実装できるので、択一脱落カードはこのSTUBへ置換するのが定石。
- **修正進捗（10枚ずつ）**: 1巡目（2026-06-26）で脱落疑い先頭10枚を処理（WXDi-CP01-036/WX24-P4-026/WX25-CP1-037/WX26-CP1-001/WXK10-008/WXDi-P02-039/WXDi-P16-048/WX25-P3-027/WX25-CP1-006/WX07-012）。下記の複雑rider/モードは**近似または別途要対応**:
  - `WXDi-P02-039-E2` / `WX25-P3-027-E2`: 引用付与・LB付与（ディスペア）型で未対応＝**要本実装**（現状 E2 は no-op or 誤バニッシュ）。
  - `WXK10-008` ①「相手ターン中エナの色と能力を失う」: 新語彙未対応で**①モード脱落**（②の任意赤コストバニッシュのみ実装）。
  - `WX25-CP1-006` ④: `OPTIONAL_TRASH_ENERGY_CLASS` がカード内の別「エナゾーンから…」記述（②）を誤マッチし枚数/名詞がずれる＝**テキスト解析STUBの多重記述カードでの限界**。要ハンドリング。
  - `WX24-P4-026` 色ゲート（白1+他色1で付与）/`WX26-CP1-001` リコレクト2つ・③の遅延付与/`WX25-CP1-037` 出能力無効: rider近似。
- G250〜G265 と同じ要領でバッチ修正していくとよい。
- **トリアージ用ツール（2026-06-26 実装済み）**: `grouped_sentence_all.txt` が以下を持つ。①各★外れに**原文・逆翻訳を併記**＋**⚠脱落疑い(原文N文/逆翻訳M文)**マーカー（逆翻訳の効果文数＜原文＝効果脱落の最優先実バグ）。脱落疑いを各グループ先頭・脱落疑い含む★グループを全体先頭に並べる。ヘッダに脱落疑い総数（現在262枚前後）。②decompiler が `CONDITIONAL_MULTI_CHOOSE_BY_CENTER(_LEVEL_GTE)` を原文の選択肢で描画（実装済みSTUBの偽陽性除去）。**→ 原文を別途引かずに「バグか／何が欠けてるか」が一目で分かる。脱落疑いから順に潰すのが効率的。**
- **decompiler 改良候補（継続）**: 他のテキスト実行時パース型STUB（`BET_MECHANIC`・`CHOOSE_SAME_OPTION_*`・`DO_THREE_THINGS` 等）も同様に原文反映で描画すれば★偽陽性がさらに減る。

---

## F. CONTINUOUS BANISH/TRASH 誤解析（残: 機能実装と TRASH 系）

> **✅ 解決済み（v0.414 JSON 修正 → v0.415 で manualEffects 昇格＝再生成耐性も獲得）。** 27件を F-2 同型の condition 付き granted AUTO／機構（GRANT_ACCE/SOUL/FIELD/ABOVE_ABILITY・GRANT_ALL_ZONE_LIFEBURST・REVEAL_UNTIL_BANISH 等）で本実装し、プリビルド JSON＋manualEffects の両方に登録（残存0件・パーサー再パース経路でも有害0件を確認）。**`build:effects` 全再生成しても manualEffects が上書きするため durable。** 以下は発見時の記録↓
>
> **⚠ 再発（2026-06-20 発見）**: 非optional・`mandatory:true` の CONTINUOUS BANISH が**プリビルド JSON に 27 件**残存しており、**runtime で実際にバニッシュ適用される＝有害**だった。`calcContinuousSigniMutations`（effectEngine:398, mandatory:true かつ activeCondition 成立で適用）→ BattleScreen:7475 で `removeFromField`。例: `WX05-021`（パワー20000以上で得る引用付与をフラット化＝相手シグニ無条件バニッシュ）/ `WX18-076` 等。**正体は F-2 と同型の「このシグニは『【自】…バニッシュ』を得る（かぎり）」引用付与のフラット化**で、過去に修正されたが**全再生成で失われた**と推測。
>
> **🔑 重要なパイプライン知見:** runtime の効果は `buildEffectsMap`（effectParser:1639）が **`card.effects`（＝App.tsx が fetch するプリビルド `effects_*.json`）を優先使用**し、空のときだけ再パース。さらに `mergeManualEffects` を上に重ねる。**＝プリビルド JSON が runtime の真実源**。よって **JSON 外科パッチは runtime に効くが、`build:effects` 全再生成で manualEffects 未登録の手パッチは消える**。durable に直すには **manualEffects 登録**が必須（JSON だけだと再生成で消える）。
>
> **対象27件**（activeCondition 無し）: WX05-021 / WX09-019 / WX09-027 / WX10-063 / WX13-034-E2 / WX16-045 / WX17-038 / WX18-076 / WX20-072 / WX20-Re18 / WX21-052 / WD14-001 / WDK08-L11 / WDK16-06H / SP27-015 / PR-288 / PR-426 / WX25-P3-057 / WXDi-D07-003 / WXDi-P04-015 / WXDi-P05-034 / WXDi-P07-060 / WXDi-P15-061 / WXDi-CP02-TK02A / WXK03-034 / WXK03-056 / WXK07-044。**各カードを F-2 と同様に「condition 付き granted AUTO ＋（必要なら）keyword 付与」で manualEffects に本実装する**（WD04-009 が手本＝v0.412 で実装済）。検出: 下記 node スクリプトで再スキャン可。
>
> ~~**有害バグは解消済み（v0.339）**~~（↑のとおり再発）。以下は残りの「機能実装」と無害な TRASH 系。

### F-1. no-op 化したカードの機能実装（24枚・無害化のみ済み）

誤バニッシュは停止したが効果は未実装（CONTINUOUS STUB `UNIMPL_GRANTED_ABILITY` に置換）。忠実実装には新しい条件型/機構が必要：

- **覚醒状態の条件:** ※WXDi-P07-060 は v0.340、WX25-P3-057 は v0.351（`thisCardOnly`＋`collectTurnTriggers`のcondition配線。アタック無効化耐性のみ未対応）で実装済。
- ~~**ドライブ状態の Condition:** WDK01-011~~ → v0.340 で `IS_DRIVE_STATE` を Condition にも追加し実装済（「自身のパワー以下」は無フィルタ近似）。
- ~~**血晶武装＋任意コスト:** WDK08-L11~~ → v0.343 で実装済（`THIS_CARD_IS_ARMORED`＋任意コスト）。
- ~~**ソウル付与先への付与:** WXDi-D07-003 / WXDi-P04-015~~ → v0.347 で `GRANT_SOUL_HOST_ABILITY` 機構を新設し実装済。
- ~~**アクセされているシグニへの付与:** WX18-076（被バニッシュ時の正面参照）~~ → v0.357 で実装済（離場時に前状態から `GRANT_ACCE_HOST_ABILITY` の ON_BANISH 能力を再構築＋`isTriggerSource` フィルタで正面シグニを対象）。※WX16-045・WX20-072 は v0.346（`GRANT_ACCE_HOST_ABILITY`）、SP27-015 は v0.356（付与【起】＋`acceTrash`コスト配線）で実装済。
- ~~**場全体/特定クラス全体への付与:** WX21-052（＜天使＞・任意自トラッシュコスト）~~ → v0.358 で実装済（`GRANT_FIELD_SIGNI_ABILITY`＋`cardClass:天使` で自分の＜天使＞へ付与、付与能力は `ON_TURN_END`＋`triggerScope:any_opp`＝対戦相手ターン終了時に発火、`BANISH` の新フラグ `selfTrashCost` で「対象を1体以上選んだら効果元シグニを自トラッシュ」を表現）。※WX13-034 は v0.344（`GRANT_FIELD_SIGNI_ABILITY`＋`powerLtSelf`）、WXDi-P15-061 は v0.345（`GRANT_SIGNI_ABOVE_ABILITY`）、WD14-001 は v0.355（`GRANT_ALL_ZONE_LIFEBURST`）で実装済。
- ~~**正面 等:** WX18-076（被バニッシュ時に「正面にあった」シグニ参照＝離場時ゾーン記録が必要）~~ → v0.357 で実装済（`collectBanishTriggers` にバニッシュ前状態 `prevOwnerState` を渡し、離場ゾーンの正面 2-zi を参照）。※WX20-Re18（動的レベル＋正面）は v0.354、PR-426 は v0.348（`frontOfSelf`＋`IS_SELF_IN_CENTER_ZONE`）、PR-288 は v0.349（`LRIG_LEVEL_EQ_OPP`）で実装済。「自身のパワー以下」は v0.344 で解決済。
- **その他の条件:** ※WDK16-06H（センター名《楓》＋登録者数）は v0.350 で `LRIG_NAME_CONTAINS`/`SUBSCRIBER_COUNT`(Cond) を追加し実装済。WXDi-P05-034（下にカード）は v0.342、WXK03-034・WXK03-056（手札N枚捨て）は v0.341 で実装済。
- ~~**テキスト書き換え系:** WX09-027（自分の他シグニのバニッシュ閾値を書き換え）~~ → v0.363 で実装済。E1=CONTINUOUSマーカー `BANISH_THRESHOLD_BOOST_7_15`、`execBanish` が自場のオリハルティア存在を検出し《オリハルティア》以外のシグニの「相手パワー7000以下バニッシュ」を15000以下に書き換え。E2 は欠落していた「トラッシュに《アダマスフィア》がある場合」を `CONDITIONAL{TRASH_HAS_CARD}` で補完。
- **トークン:** ※WXDi-CP02-TK02A は v0.352 でランサー＋バトルバニッシュを実装済（「対戦相手ターン終了時に自己除外」は非アクティブ側ターン終了トリガーが必要で保留）。
- ~~**WX17-038:** 中央でアタック時にデッキ公開→同レベルバニッシュ~~ → v0.353 で `REVEAL_UNTIL_BANISH_SAME_LEVEL` を新設し実装済。

### F-2. 引用付与トリガー能力のフラット化誤解析（**実装着手 v0.377・バッチ1完了。残りを継続**）

**監査結論（無害性）:** `calcContinuousSigniMutations`（effectEngine.ts、CONTINUOUS効果を実際に適用する唯一の経路）の `if (act.type !== 'BANISH' && act.type !== 'FREEZE' && act.type !== 'DOWN') continue;` により **CONTINUOUS TRASH は一切実行されない**ため、未実装でも**無害**（誤バニッシュ等の害はない）。正体は「このシグニは『【自】…』を得る（かぎり）」型の**引用付与能力のフラット化誤解析**で、内側 trigger 能力が落ちて TRASH だけが CONTINUOUS action として漏れたもの。

**実装方針（v0.377 で確立）:** 大規模機構は不要。「〜であるかぎり『【自】…』を得る」は **condition 付き AUTO トリガー**として表現すれば既存収集（`collectTurnTriggers`/ON_ATTACK_SIGNI 収集が `evalUseCondition` で条件評価）が発火する。場全体付与は既存 `GRANT_FIELD_SIGNI_ABILITY`＋`collectGrantedFromLayer`。機構追加は `LRIG_COLOR` 条件と `GrantFieldSigniAbilityAction.targetOwner` の2点のみ（v0.377）。

**✅ バッチ1（v0.377）:** `WX06-029` / `WXDi-P04-082` / `WXDi-P15-098`（いずれも ON_ATTACK_SIGNI 経路。詳細は BUGFIXES.md）。
**✅ バッチ2（v0.378）:** `WX12-018`（ON_ATTACK_SIGNI＋`LRIG_TRASH_COUNT`/`FIELD_CLASS_COUNT` 新設）/ `WXDi-P09-058`（覚醒中ターン終了時の相手エナ非共通色トラッシュ＝`colorNotMatchesLrig`＋E2 を `ON_SIGNI_BATTLE` 覚醒に修正）。
**✅ バッチ3（v0.379）:** `WXDi-P15-060` / `WXDi-P15-064`（上シグニ付与＝既存 `GRANT_SIGNI_ABOVE_ABILITY`。内側はエナ非共通色トラッシュ／手札捨て＋blind相手捨て）。
**✅ バッチ4（v0.380）:** `WXDi-P02-068`（`ON_SIGNI_BATTLE` 収集に condition 評価を追加＋「手札2枚以上捨て」ゲートで相手blind捨て）。
**✅ バッチ5（v0.381）:** `WXDi-P05-032`（ルリグ付与＝既存 `GRANT_LRIG_ABILITY`＋`collectLrigGrantedEffects` を ON_ATTACK_LRIG 収集へ配線）。
**✅ バッチ6（v0.382）:** `WX17-036`（全領域 LIFE_BURST 付与＝既存 `GRANT_ALL_ZONE_LIFEBURST` を burstFilter/burstAction 対応に拡張。＜怪異＞シグニ限定・TRASH）。
**✅ バッチ7（v0.383）:** `WXK04-048`（自己付与＝`THIS_CARD_IS_ACCED` 新設＋任意《青》OPTIONAL_COST／アクセ付与＝`GRANT_ACCE_HOST_ABILITY` レベル3以上）。
**✅ バッチ8（v0.384）:** `WX21-054`（`ON_SIGNI_DAMAGE` timing 新設＝シグニが相手ライフをクラッシュした時＋相手エナ5枚以上で相手エナトラッシュ）。
**✅ バッチ9（v0.385）:** `WXDi-P04-040`（自己犠牲型＝`execTrash` に `thisCardOnly` 追加＋OPTIONAL_COST《無×3》払わなければ自己トラッシュ）。
**✅ バッチ10（v0.386）:** `WXK10-039`（シグニ犠牲型＝`execTrash`/`TargetFilter` に `excludeSelf` 追加＋CHOOSE「他の原子2体トラッシュ／自己トラッシュ」）。

**「これにアクセされている」系（2026-06-25 棚卸し → 全31枚完全実装）**: パワー(acceHost＋クラス/名前)・能力付与(`GRANT_ACCE_HOST_ABILITY`)・置換(`ACCE_BANISH_SELF_TRASH`)に加え、複雑8枚も新語彙を整備して本実装（BUGFIXES 冒頭2記録）。`POWER_MODIFY_BY_SOURCE`（効果元レベル/パワー基準）・`FORCE_FRONT_SIGNI_ATTACK`＋`collectForcedFrontAttackZones`（正面個別強制アタック）・`triggerCondition.frontLowerLevelThanSource`（正面低レベル登場誘発）・`GRANT_ACCE_HOST_ABILITY.byChoice`＋`acce_choice` state＋`SET_ACCE_CHOICE` stub（装着時選択付与）・`collectAllColorSigniForField` のアクセ装着先全色対応を新設。残作業なし。

**F-2 はすべて完了**（既存機構でクリーンに実装可能な付与型・コスト型・相手場付与・自ゲート・身代わり置換は v0.377〜v0.393 で完了）:
- ~~**ゲート条件（自ゲート未モデリング）:** `WXDi-P15-082` / `WXDi-P15-076`~~ → **v0.388 で実装済**（THE DOOR 自ゲート機構 `own_gate_zones`＋`SAME_ZONE_HAS_GATE`/`FIELD_HAS_GATE`/`frontOfGateZone`＋配置 `PLACE_OWN_GATE`＋UI バッジを新設。詳細は BUGFIXES.md）。
- ~~**相手場への付与（機構は v0.377 で用意済・未配線）:** `WXDi-P10-072`~~ → **v0.387 で実装済**。
- ~~**身代わり置換型:** `WXDi-P06-034` / `WXK05-024`~~ → **v0.393 で実装済**（バトルバニッシュ経路の置換チェーンに配線＋`centerZoneOnly` フィルタ。**バトルバニッシュのみの近似**＝効果バニッシュ/バウンス等の場離れは未対応で F-3 と同じく execBanish 側フックが要る。詳細は BUGFIXES.md）。

### F-4. THE DOOR アーキタイプ（自ゲート基盤は v0.388 で完成・個別カードを順次実装中）

自ゲート機構（`own_gate_zones`／`SAME_ZONE_HAS_GATE`／`FIELD_HAS_GATE`／`frontOfGateZone`／`PLACE_OWN_GATE`）は v0.388 で新設済み。これを土台に防衛派 THE DOOR シグニ（ゲート参照・約15枚）を順次実装。

**✅ 完了:** WXDi-P15-076/082（v0.388）。バッチA＝WXDi-P15-080/081/077/078（v0.389）。バッチB＝WXDi-P15-059/WXDi-P16-074（v0.390・後者はE1のみ／E2は近似維持）。バッチC＝WXDi-P16-062（v0.391・`inGateZone` フィルタ新設・E1は近似）。バッチD＝WXDi-P15-057（v0.392・E1は近似）。バッチE＝WXDi-P16-070/P15-056/P16-054（v0.394・`POWER_MODIFY_PER_HAND_COUNT` 新設。P15-056-E1は無害化・P16-054-E1はバニッシュ耐性近似）。バッチF＝WXDi-P16-059（v0.395・ガード税＋自シグニシャドウ付与。`execGrantKeyword` の UNTIL_OPP_TURN_END 振り分けバグも修正）。バッチG＝WXDi-P15-058（v0.396・E2はタマゴ近似／E1は v0.399 で本実装＝場全体シャドウ付与 `GRANT_FIELD_SHADOW`）。

**✅ 防衛派 THE DOOR ゲート参照シグニ（15枚）＋ゲート設置手段（ピース WXDi-P15-003・防衛者ルリグ WXDi-P15-010/011）はすべて実装/近似完了。アーキタイプは実用レベルで機能。**

**✅ F-4 近似精緻化も全完了（v0.400）:**
- `WXDi-P16-074-E2`（ゲート条件・ターン1回・被バニッシュ時相手ディスカード）/ `WXDi-P16-054-E1b`（相手効果バニッシュ耐性）/ `WXDi-P15-057-E1b`（相手ターン中シャドウ）を本実装（詳細は BUGFIXES.md）。「同ゾーンゲート」→「場ゲート」近似は P16-074-E2 のみ残る。
- ※`WXDi-P15-058-E1`（場全体【シャドウ（スペル）】付与）は v0.399 で本実装（新 CONTINUOUS `GRANT_FIELD_SHADOW`＋`getFieldGrantedShadowScopes` 経路）。`WXDi-P15-056-E1` は v0.398 で本実装（self REMOVE_ABILITIES の thisCardOnly 対応）。
- **F-4 は実用・忠実度ともに完了。残課題はなし。**

**ピース `ひらけ！ゲート！`（WXDi-P15-003）は v0.397 で配線済み**（E1=AUTO ON_PLAY→PLACE_OWN_GATE、E2=CONTINUOUS GRANT_LRIG_ABILITY。詳細は BUGFIXES.md）。
※「//THE DOOR」でも解放派/闘争派のカードはゲート非参照（箱名のみ）で対象外。

### F-3. optional 身代わりバニッシュの表現（**バトル経路は対話本実装済み v0.401／残2枚は別機構**）

**✅ バトルバニッシュ経路は v0.401〜v0.402 で対話本実装**（`collectBanishSubstitutes`＝オプション統一型＋再入 pause/resume＋防御側プロンプト＋CPUヒューリスティック。詳細は BUGFIXES.md）：
- **犠牲型（v0.401）:** `WX12-024` `WXEX2-60` `WX20-055` `WXDi-CP01-032` `WXDi-P10-052`（別シグニを犠牲）。
- **コスト払い型（v0.402）:** `WX10-033`（手札スペル捨て）/ `WX11-029`（下スペルトラッシュ）。既存 `action.type BANISH_SUBSTITUTE` が未実装だったのを実装。

**残・積み残し:**
- **効果バニッシュ経路:** 上記は**バトルバニッシュのみ**対応。効果バニッシュ（`execBanish`）/バウンス等の場離れは未フック（execBanish 側に置換差し込みが要る。F-2 身代わり置換と共通課題）。
- **実機検証:** 対話 pause/resume・CPU即決はヘッドレス検証不可。PvP／CPU戦での動作確認が必要。
- **効果離場トリガー型:** `WX06-019`（対戦相手効果による場離れ＋`powerReduction`）/ `WX25-P1-056`（非バニッシュ離場→バニッシュ置換）＝場離れ全般のフックが要る。`WX17-075`（「正面にレベル2以下が出たとき任意バニッシュ」＝置換でなく `ON_PLACED_FRONT` 任意トリガー）。いずれも現状 no-op で無害。

### G144 「シグニがダウン状態で場に出たとき」/ G145 「他のシグニが効果によって場に出たとき」any_ally 効果配置トリガー（**配線完了・実機検証推奨**）

G144=`WX10-074`「肆ノ遊 ツナヒキ」/ `WX10-078`「参ノ遊 ナワトビ」（`placedDown`＋`UP targetsTriggerSource`）。G145=`WX10-080`「弐ノ遊 ナゲナワ」/ `WX10-083`「壱ノ遊 アヤトリ」（`byEffect`＋`triggerFilter:{excludeSelf}`＋`UP{thisCardOnly}`）。両者 `ON_PLAY`＋`triggerScope:any_ally`。

**✅ 配線完了（2026-06-23）:** 効果でシグニが場に出る各経路（メインスタック解決 / スペル解決 / REVEAL resume）で、出たシグニへの**他シグニ（any_ally/any）の反応**を発火させる配線を追加。
- `detectPlacedSigni(before, after)`（新ヘルパー）で「効果で新たに場に出た最前面シグニ」を検出し、各解決完了時に `collectFieldTriggers('ON_PLAY', placedNum, …, { placedByEffect:true, placeSourceIsSigni })` を呼ぶ（自身は自己除外＝他シグニのみ）。
- `collectFieldTriggers` に `opts.placedByEffect / placeSourceIsSigni` を追加。`byEffectTriggerOk` で **手札召喚（placedByEffect 無し）では byEffect/bySigniEffect 非発火／効果配置では byEffect 発火・bySigniEffect はソースがシグニのときのみ**を制御。
- `placedDown`（G144）は `collectFieldTriggers` 内で配置直後の `field.signi_down[zone]` を見て判定。`excludeSelf`（G145）は自己除外で担保（matchesFilter は excludeSelf を無視）。

**⚠️ 実機検証（ヘッドレス不可）:** PvP/CPU 対戦画面で、(a) 効果で他シグニをダウン配置 → G144 がそのシグニをアップ、(b) 効果で他シグニを場出し → G145 が自身をアップ、を確認する。**回帰注意:** 非 byEffect の any_ally ON_PLAY（例 WX11-054）も**効果配置時に発火するようになった**（従来は手札召喚のみ）＝WIXOSS ルール上は正しいが、全 any_ally ON_PLAY カードの挙動を実機確認推奨。

**残（副次・未対応）:** ①CPU 自身の効果配置経路（cpuTurnAction）からの any_ally 発火は未配線（人間 PvP の主経路はカバー）。②**self** placedDown を効果配置で出した場合の自己トリガーは、効果配置の自己 ON_PLAY 収集が placedDown 条件を未チェック（手札召喚経路は実装済み）。
