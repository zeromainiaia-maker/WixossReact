# 純粋バトルコントローラ（リファクタ Stage3 設計）

> PLAN.md §3 Opusタスク14。**Stage2（BattleScreen の useState を pure/ドメインフックへ寄せる）は完了**（残 useState は `bs` のみ＝本ドキュメントが対象にする中核ゲーム状態）。本書は Stage3＝「`bs` の状態遷移を React/supabase から切り離し純粋関数へ寄せる」設計と段階移行レシピ。

## 1. 現状の問題

BattleScreen.tsx（約1万行）は `bs`（`BattleStateRow`＝supabase 同期の盤面）を唯一の source of truth に持ち、状態遷移を次の形でハンドラ内にインライン実装している：

```
handler(React)
  ├─ 現在の bs から「次に DB へ書く update（Partial<BattleStateRow>）」を組み立てる  ← 計算（本来は純粋）
  └─ supabase.from('battle_states').update(update).eq('room_id', roomId)              ← 永続化（副作用）
```

- `supabase...update(...).eq('room_id', roomId)` が **114箇所インライン散在**（永続化チョークポイント不在）。
- パッチ組み立て計算が副作用（supabase 呼び出し）と同じ関数に同居＝**ヘッドレスに単体検証できない**。
- 盤面遷移のロジックが巨大ファイルに拡散し、追跡・テストが困難。

※ ローカル `setBs` は初期ロードと realtime 購読の**4箇所のみ**。遷移は必ず「DB へ書く → realtime で `bs` 更新」を通る。つまり **遷移＝`bs` から次パッチを求める純粋計算** に落ちる。

## 2. 目標アーキテクチャ（seam）

```
handler(React) → BattleAction を組む
  → reduceBattle(bs, action): Partial<BattleStateRow>   ← 純粋（副作用なし・同入力同出力・golden 検証可）
  → useBattlePersist().commit(patch)                    ← 永続化チョークポイント（唯一の I/O 点）
  → supabase → realtime → setBs
```

- **計算（純粋）と永続化（副作用）を分離**。トリガー収集・盤面差分・スタック整列は Stage2 で既に純粋化済み（`triggerCollect` / `boardDiff` / `effectStack`）＝これらを使うパッチ組み立ても純粋関数へ寄せられる。
- 純粋 reducer は golden で網羅検証。永続化は1点に集約されモック/差し替えが容易。

## 3. 進捗

| ファイル | 役割 |
|---|---|
| `src/screens/battle/controller/persist.ts` | 永続化チョークポイント `useBattlePersist(roomId)`＝`commit(patch)` / `fetchState()` / `remove()`。battle_states への I/O を1点集約。error は `.message` を保持。 |
| `src/screens/battle/controller/battleController.ts` | 純粋 reducer `reduceBattle(bs, action): Partial<BattleStateRow>`＋`BattleAction` union。網羅性は `never` guard で強制。現在4 action＝`SET_SETUP_PHASE` / `SET_TURN_PHASE` / `ACK_END` / `SUBMIT_JANKEN`。 |
| `scripts/goldenTest.ts` | `Stage3 reduceBattle *` で各遷移を固定。 |

### ✅ 永続化チョークポイント移行＝完了

BattleScreen.tsx の battle_states への**全行(whole-row) I/O 120箇所を `persist` へ移行済み**（`supabase...update(...).eq('room_id',roomId)` の単一行58＋複数行53、`delete()` 4、`select('*')...single()` 2、代表手配線3）。生 supabase 参照が残るのは**特定カラム select の4箇所のみ**（`host_mulligan_done,...` / `host_janken,...` / `host_end_ack,...` の部分読み＝意図的に raw のまま。全行取得ではないため `fetchState()` に寄せない）。

移行で `persist.commit` の厳格型（`Partial<BattleStateRow>`）が潜在的緩さ2件を検出＝じゃんけん解決 update の `setup_phase` widening（`Partial<BattleStateRow>` 注釈で是正）。

### reducer 純粋化＝進行中（58/114 commit が reduceBattle 経由）

現在の `BattleAction`（7種）＝`SET_SETUP_PHASE` / `SET_TURN_PHASE` / `ACK_END` / `SUBMIT_JANKEN` / `WRITE_STATE` / `SET_STACK` / `END_GAME`。

- **単一フィールド遷移**（11箇所）＝setup_phase 1・turn_phase 7・ACK_END 2（CPU自動＋手動 handleEndAck）・じゃんけん1。
- **`WRITE_STATE`**（39箇所）＝プレイヤー状態書き込みを集約。payload＝`myKey`/`myState`＋任意で `opp:{key,state}`・`effectStack`（null 明示でクリア／省略で不干渉）・`clearPending`。条件付き opp（旧 `...(cond?{[opK]:x}:{})`）は `opp: cond ? {...} : undefined` として payload 側で表現。
- **`SET_STACK`**（5箇所）＝effect_stack のみ書き換え。`settle:true` で `isStackDone(stack)?null:stack` の settle イディオムを reducer が適用（＝スタック解決判定を1箇所に集約・テスト可能化）。
- **`END_GAME`**（3箇所）＝決着（`global_phase:'FINISHED'`＋`winner_id`＋最終盤面）。

**残＝Stage3 実装の本体（56 commit）**＝(a) 名前付き `const update: Record<string, unknown> = {...}` の**命令的インクリメンタル構築**（`'X' in update` 判定・`update.host_state = {...}` 差し替え・条件付き pending/stack）＝約22ハンドラ (b) `pending_spell`/`pending_effect` オブジェクト（非 null）を含む遷移 (c) spread（`...opUsageUpdate`/`...update`）。**これらは payload 完結にならず、各ハンドラの命令的ロジックを宣言的 action へ再設計する個別作業**。⚠**ハンドラ側の payload 構築は golden（純粋関数のみ）でカバーされない**ため、機械的な一括変換は「サイレントな挙動変化」を検出できない。1件ずつ手動レビュー、または先にハンドラの挙動テストを用意してから進める（機械変換で `WRITE_RAW(patch)` に丸めるのは純粋化にならないため行わない）。

## 4. 段階移行レシピ（残テール＝reducer 純粋化）

永続化移行は完了。以後は「パッチ組み立ての純粋化」を1ハンドラずつ、挙動同値を保って進める（一括変換しない）：

1. **golden を1件足してから移す**＝移す遷移の入出力（`bs`＋action → patch）を `Stage3 reduceBattle *` に固定してから置換（回帰防止）。
2. **パッチ組み立ての純粋化**＝ハンドラ内の `const update = {...}` 計算を `BattleAction` を1種足して `reduceBattle` の case へ移す。engine 純粋関数（triggerCollect / boardDiff / effectStack 等）はそのまま reducer 内から呼べる。ローカル closure 依存（user.id / isHost / 各種 ref）は action の payload に載せる。
3. `persist.commit(reduceBattle(bs, action))` へ置換。`bs` は非null が必要（多くのハンドラは `if (!bs) return` で narrowing 済）。
4. `npm run gates`（typecheck→golden/smoke/fuzz/census/lint）で緑を確認。BattleScreen を触るので必須。

### 新規 I/O を書くときの約束

- battle_states への全行書き込み/読み取り/削除は**必ず `persist` 経由**（生 `supabase.from('battle_states').update/...` を新設しない）。部分カラム select のみ raw 可。
- reducer は `bs` を**読むだけ**（純粋）。supabase を呼ばない・`bs` を書き換えない。

### ⚠ 注意

- reducer は `bs` を **読むだけ**（純粋）。`bs` を直接書き換えない・supabase を呼ばない。
- CPU 戦では人間クライアントが CPU 側パッチも計算する既存構造を維持（`isHost` 等を action に持たせる）。
- 検証は golden（純粋関数）まで。React オーケストレーション全体のヘッドレス検証は無いので、**一括書き換えは避け1件ずつ**（稼働ゲームの退化を避ける）。実機挙動が絡む移行は §7 実機検証と併走する。
