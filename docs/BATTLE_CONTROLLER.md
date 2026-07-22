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

## 3. 骨組み（本セッションで着地）

| ファイル | 役割 |
|---|---|
| `src/screens/battle/controller/persist.ts` | 永続化チョークポイント `useBattlePersist(roomId)`＝`commit(patch)` / `fetchState()` / `remove()`。battle_states への I/O を1点集約。 |
| `src/screens/battle/controller/battleController.ts` | 純粋 reducer `reduceBattle(bs, action): Partial<BattleStateRow>`＋`BattleAction` union。代表3ケース（`SET_SETUP_PHASE` / `ACK_END` / `SUBMIT_JANKEN`）を実装し seam を実証。網羅性は `never` guard で強制。 |
| `scripts/goldenTest.ts` | `Stage3 reduceBattle *` 3件で遷移を固定（golden 562→565）。 |

BattleScreen 側は代表3箇所（setup_phase 遷移・CPU 終了ACK・CPU じゃんけん提出）を `persist.commit(reduceBattle(bs, action))` へ置換済み＝パターンを実配線で実証。**残る約110箇所のインライン書き込みは未移行**（Stage3 実装の本体＝複数セッションのテール）。

## 4. 段階移行レシピ（残テール）

1件ずつ、挙動同値を保って進める（一括変換しない）：

1. **永続化の置換**（機械的・低リスク）＝ `supabase.from('battle_states').update(X).eq('room_id', roomId)` を `persist.commit(X)` へ。型検査で安全。`.then()`/`await` はそのまま（`commit` は同じ thenable を返す）。
   - `.select()` 連鎖や `.delete()` は `persist.fetchState()` / `persist.remove()` を使う。
2. **パッチ組み立ての純粋化**（1ハンドラずつ）＝ハンドラ内の `const update = {...}` 計算を `BattleAction` を1種足して `reduceBattle` の case へ移す。エンジン純粋関数（triggerCollect 等）はそのまま reducer 内から呼べる。
3. **golden を1件足してから移す**＝移す遷移の入出力（`bs`＋action → patch）を `Stage3 reduceBattle *` に固定してから置換（回帰防止）。
4. `npm run gates`（typecheck→golden/smoke/fuzz/census/lint）で緑を確認。BattleScreen を触るので必須。

### ⚠ 注意

- reducer は `bs` を **読むだけ**（純粋）。`bs` を直接書き換えない・supabase を呼ばない。
- CPU 戦では人間クライアントが CPU 側パッチも計算する既存構造を維持（`isHost` 等を action に持たせる）。
- 検証は golden（純粋関数）まで。React オーケストレーション全体のヘッドレス検証は無いので、**一括書き換えは避け1件ずつ**（稼働ゲームの退化を避ける）。実機挙動が絡む移行は §7 実機検証と併走する。
