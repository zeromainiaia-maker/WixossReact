# 完成までのロードマップ (ROADMAP)

> ゲーム開発「完成」までの全体計画。**日々の次の一手・バトンは [P1_PLAN.md](./P1_PLAN.md) §3 が唯一の正**（本ファイルは全体地図）。残作業の索引は [TODO.md](./TODO.md)、設計方針は [DESIGN.md](./DESIGN.md)、修正記録は [BUGFIXES.md](./BUGFIXES.md)。
>
> 作成: 2026-07-02（docs 全体＋逆翻訳シート実測に基づく）。フェーズ完了時に本ファイルの該当節と P1_PLAN §1/§3 を更新する。

---

## 現在地（2026-07-02 時点）

P1_PLAN の3フェーズ枠組み（①表現 P1／②実行 P2／③挙動 P3）のうち **P1 の最終盤**。

- **達成済み**：同型★0・held/LOSS/VALUE 全0・脱落疑い255枚全分類・大型機構B1〜B4完了・**C1 timing 配線 残0**（ON_KEYWORD_GAINED 含め全配線）・検証ハーネス3層（smoke 10557件 全0／golden 96/96／fuzz 全0）＋CI 自動化・実機ドライバ `scripts/verifyBattleDrive.mjs` 既定10シナリオ PASS。
- **本丸の残**：逆翻訳機の出力品質（原文一致・P1_PLAN §1 4つ目）。実測＝**英語ID露出の `[STUB:…]` は 582件・約280系統**（2026-07-02 走査）。
  - 上位クラスタ：BET_MECHANIC 19／DOWN_UP_SIGNI_AND_CHOOSE 14／TRASH_AT_TURN_END 13／REVEAL_AND_PICK 13／BET_CONDITION 11／CHOOSE_COLOR_FROM_LIST 10／CRAFT_TO_LRIG_DECK＋ADD_CRAFT 18／ACCE_FROM_HAND 9／SERVANT_ZERO系 計24／SEED系 20／LOOK_TOP系 20／REPEAT系 14 …上位20系統で約170件、残りは1〜4件の長いテール。
  - 再走査コマンド（Bash）：
    `grep -ohE "\[STUB:[^]]*[A-Z][A-Z0-9_]{4,}[^]]*\]" docs/decompile_sheet*.txt | grep -oE "[A-Z][A-Z0-9_]{4,}" | grep -vE "^(STUB|COUNT|AUTO|WX|CONTINUOUS|SELECT_TARGET)" | sort | uniq -c | sort -rn`

## 完成の定義（4段）

P1_PLAN は P1 の DoD しか定義していないため、「開発の完成」を以下の4段で定義する。

1. **P1完了（表現）** — 全効果カードで逆翻訳が原文一致（英語ID漏れ0・文法崩れ0・脱落0）
2. **P2完了（実行）** — エンジンが全DSL構文を正しく実行（golden で型網羅・smoke SKIP 解消・機構待ちテール実装）
3. **P3完了（挙動）** — 実機で各カードがルール通り動く（TODO §5 の宿題クローズ・対話UI残の実装）
4. **対戦体験の完成** — CPU AI がメインフェイズで能動行動し、一人でも通しで遊べる

---

## フェーズ1：P1 完了（表現）— 最優先・低〜中リスク

**目標＝英語ID漏れ 582件→0＋B層データ欠落の解消。** 手法は BUGFIXES ⑥〜⑨ で確立済み（engine 実装済みSTUBなら `decompileEffects.ts` に原文抽出/意味文を足すだけ・engine 不変・ゲートは同型★0＋原文照合のみで軽い）。1セッション30〜80件ペースは実証済み。

- [ ] **Z-1：多い順に系統消化**。DOWN_UP_SIGNI_AND_CHOOSE(14)→TRASH_AT_TURN_END(13)→CHOOSE_COLOR_FROM_LIST(10)→CRAFT系(18)→ACCE_FROM_HAND(9)→SERVANT_ZERO系(24)→SEED系(20)→LOOK_TOP系(20)→REPEAT系(14)…。手順は P1_PLAN §3 次の一手①のとおり（id確認→engine実装確認→意味文→シート再生成【**Bash `>`**】→下流再生成→同型★0＋原文照合→push）。
- [ ] **Z-1b：単発テール（約260系統・1〜4件）**。系統単位ではなくシート単位で一括走査→原文抽出パターンの共通ヘルパ（`currentCardText` 正規表現抽出）で潰す。
- [ ] **Z-2：BET系（BET_MECHANIC 19＋BET_CONDITION 11＋BET_ALTERNATIVE 8）**＝機構待ちの唯一の大クラスタ。まず**表現だけ原文抽出で描画**（原文はカードテキストに在る）。engine 側の不足はフェーズ2へ送る。
- [ ] **B層：JSONデータ欠落の補完（中リスク）**＝REVEAL_AND_PICK/LOOK_AND_REORDER で pick 部分が JSON に無く逆翻訳から脱落するカード（WXDi-P04-047 等）。走査スクリプトで対象確定→effectId アンカーで curated JSON を直接パッチ。**逆翻訳を直したらエンジン実装までセット**の鉄則を守る。
- [ ] **完了判定**：grep 走査で英語ID漏れ0 ＋ シートごとランダム20枚の原文照合 spot-check で一致を記録 → **P1_PLAN §1 4つ目にチェックを入れ P1 クローズを宣言**。

## フェーズ2：P2 完了（実行の正しさ）— 中リスク

**目標＝「表現はあるが実行が近似/未実装」の解消。** engine を触るので毎回 smoke・golden・fuzz（＋バグは golden に1件足してから直す）。

- [ ] **golden の型網羅**：DSLアクション型のうち golden 未カバーの型を洗い出し、1型1テストで追加（現96件）。
- [ ] **smoke SKIP 263 の解消**：autopilot 未対応の対話（REVEAL_CARDS/DECLARE_BOND 等）へカバレッジ拡張（TODO §8）。
- [ ] **機構待ちテールの実装**（TODO §3・§4・各1〜数枚を1機構ずつ「機構実装の型」で）：multi-dest pick 5枚／G072 前置き条件6枚／エナ送り残6枚／リフレッシュ置換（WX25-P2-009-E1）／ON_CARD_MILLED 原因限定等の近似精緻化／毒牙 POWER_COPY_FROM_DOWNED／WXK10-008①／引用付与 B4 残（permanent・相手付与）／BET系 engine 不足分（Z-2 から送り）。
- [ ] **F-3 効果バニッシュ経路の置換フック**（execBanish 側・TODO §6）＝身代わり系の共通基盤。
- [ ] **UNKNOWN/PARTIAL 4枚**（WX05-010／WX11-037／WX11-043／WX17-003）の本実装。
- [ ] **スコープ外の裁定**：47枚の【使用条件】【チーム】（正規デッキで常に成立＝機能等価）と WXDi-P00-026（ルリグ再アタック前提）は**明示的にスコープ外と合意**して DoD から除外（TODO §4「保留」の追認）。

## フェーズ3：P3 完了（実機挙動）— 検証中心

**目標＝TODO §5「実機検証の宿題」を全クローズ。** `verifyBattleDrive.mjs` のシナリオ横展開パターン確立済み（1件＝`scenarios` テーブルに1行追加）。**発火条件は golden で自動検証済みなので実機は「総合動作」だけ**に絞る。

- [ ] **C2 残の宿題をシナリオ化**（TODO §5 のリスト順）：R30〜R58 系トリガー（凍結／パワー0／エナ→トラッシュ／チャーム→トラッシュ／placedFront／opp-draw／outsideDrawPhase 等）、B2〜B4（動的閾値／遅延トリガー／引用付与実発火）、follow-up 経路（CPUターンのルリグアタックステップ・アシストグロウ・スペルベット・forced単一対象）。
- [ ] **対話UI の残実装**：トラッシュ自己起動のエナ以外コストUI（手札捨て/コイン/エクシード等・14枚）／LOOK_AND_REORDER の canTrash UI／ビートのトラッシュ版選択ピッカー／F-3 身代わり対話（バトルバニッシュ経路7枚）。
- [ ] **既知の近似の裁定**：TODO に「近似」と明記された項目（ミル原因限定・ON_CHARM_TO_TRASH バトル離脱経路 等）を1つずつ「精緻化する／実害なしと容認する」で消し込む。

## フェーズ4：対戦体験の完成 — ゲームとしての仕上げ

- [ ] **CPU AI のメインフェイズ拡張**（TODO §6・唯一の「新規設計を要する大物」）：アーツ/スペル/起動効果の能動使用・グロウ判断・CPU END 分岐の予約型対応（現状 `turn_end_draw_count` のみ）。**先に DESIGN §4「CPU は対人戦と同じ処理」の統一を完遂**してから AI 判断を乗せる。
- [ ] **doPhaseAdvance の pure 抽出は「やらない」を既定**（P1_PLAN §3 で費用対効果逓減と結論済み）。CPU 統一で必要になった部分だけ最小限切り出す。
- [ ] **リリース判定**：fuzz 重め（`npm run fuzz -- --games 2000 --moves 80`）＋実機 PvP/CPU 通し対戦スモークをリリースゲートに。DESIGN §5 の手順（version bump→CI→push→`npx vercel --prod`）で本番反映。

---

## 進め方の要点

- **順序はフェーズ1→2→3→4 だが直列強制ではない**。フェーズ3のシナリオ追加は独立作業なのでバトンの合間に混ぜてよい（P1_PLAN §3 推奨と同じ）。
- **不変ルールの継続**：`build:effects` 禁止／bulk 置換禁止／逆翻訳とエンジンのセット修正／decompile 再生成は Bash の `>`／engine・BattleScreen・decompiler を触ったら smoke・golden・fuzz。
- **規模感**：フェーズ1が残作業の過半（582件・手法確立済み）。フェーズ2〜3は十数機構＋数十シナリオの消化。フェーズ4の CPU AI が唯一の大物設計。
- フェーズ1完了時にフェーズ2以降を「P2_PLAN」として詳細化（バトン §3 相当の運用に載せ替える）のを推奨。
