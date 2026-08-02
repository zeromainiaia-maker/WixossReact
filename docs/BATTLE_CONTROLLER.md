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
| `src/screens/battle/controller/battleController.ts` | 純粋 reducer `reduceBattle(bs, action): Partial<BattleStateRow>`＋`BattleAction` union。網羅性は `never` guard で強制。現在18 action（下記）。 |
| `scripts/goldenTest.ts` | `Stage3 reduceBattle *` で各遷移を固定。 |

### ✅ 永続化チョークポイント移行＝完了

BattleScreen.tsx の battle_states への**全行(whole-row) I/O 120箇所を `persist` へ移行済み**（`supabase...update(...).eq('room_id',roomId)` の単一行58＋複数行53、`delete()` 4、`select('*')...single()` 2、代表手配線3）。生 supabase 参照が残るのは**特定カラム select の4箇所のみ**（`host_mulligan_done,...` / `host_janken,...` / `host_end_ack,...` の部分読み＝意図的に raw のまま。全行取得ではないため `fetchState()` に寄せない）。

移行で `persist.commit` の厳格型（`Partial<BattleStateRow>`）が潜在的緩さ2件を検出＝じゃんけん解決 update の `setup_phase` widening（`Partial<BattleStateRow>` 注釈で是正）。

### reducer 純粋化＝進行中（114/117 commit が reduceBattle 経由）

現在の `BattleAction`（18種）＝`SET_SETUP_PHASE` / `SET_TURN_PHASE` / `ACK_END` / `SUBMIT_JANKEN` / `RESOLVE_JANKEN` / `SELECT_LRIG` / `COMPLETE_MULLIGAN` / `START_PLAYING` / `WRITE_STATE` / `WRITE_STATES` / `QUEUE_SPELL` / `FINISH_SPELL` / `FINISH_CUTIN` / `ADVANCE_TURN_WITH_STATE` / `SET_STACK` / `END_GAME` / `BEGIN_NEXT_TURN` / `RESOLVE_EFFECT_STEP`。

> **⚠ 盤面依存ケース（第1引数 `bs` を読む action）は現在3つ**＝`BEGIN_NEXT_TURN`（`turn_count: bs.turn_count + 1`）・
> `RESOLVE_EFFECT_STEP`（`settleStackOnDone` が `bs.effect_stack` の解決判定を読む）・
> `WRITE_STATE` の `markCutinResponseComplete`（`bs.pending_spell` を土台に完了印を立てる）。他は payload 完結。
> **「現在盤面から次パッチを求める」契約の実例**なので、同種（カウンタ加算・現在値からの相対更新・現在値の条件判定）を
> 移すときはハンドラ側で計算せず reducer に寄せる。

- **単一フィールド遷移**（13箇所）＝setup_phase 1・turn_phase 7・ACK_END 2（CPU自動＋手動 handleEndAck）・じゃんけん2（提出`SUBMIT_JANKEN`／解決`RESOLVE_JANKEN`＝対人経路も移行済み）。
  `SET_TURN_PHASE` は**任意で1プレイヤー状態＋effect_stack を併記**できる（CPU の MAIN→ATTACK_ARTS＝ハスターリク予約クリア＋
  ON_ATTACK_PHASE_START スタック。`ADVANCE_TURN_WITH_STATE` との違いは**状態書き込みが任意**な点）。
- **セットアップ遷移**（3箇所）＝`SELECT_LRIG`（選択ルリグ＋初期状態）・`COMPLETE_MULLIGAN`（確定状態＋完了フラグ）・`START_PLAYING`（`PLAYING`＋setupクリア＋先攻ID）。
- **`WRITE_STATE`**（54箇所）＝プレイヤー状態書き込みを集約。payload＝`myKey`/`myState`＋任意で `opp:{key,state}`・`effectStack`（null 明示でクリア／省略で不干渉）・`clearPending`・`markCutinResponseComplete`。条件付き opp（旧 `...(cond?{[opK]:x}:{})`）は `opp: cond ? {...} : undefined` として payload 側で表現。
  `markCutinResponseComplete`＝レゾナのスペルカットイン応答（旧 `resonaSpellCutin ? {...update, pending_spell:{...bs.pending_spell!, cutin_response_complete:true}} : update` の三項）＝**盤面の `pending_spell` を土台に完了印だけ立てる**ので reducer 側で読む。
- **`WRITE_STATES`**（5箇所）＝**プレイヤー状態を0〜2件**書く（＋任意 `effectStack`）。直前フラグ watcher（`hand_revealed_just`/`hand_discarded_just`・`opp_virus_*_just`・`zone_moved_just`・`drive_became_just`・`beat_became_just`）＝「どちら側を書くかが実行時に決まる」形で、旧 `const update: Record<string, unknown> = {}` へ条件付きにキーを足す命令的構築だった。`WRITE_STATE` と違い**両方の状態が任意**。
- **スペル／カットイン遷移**（5箇所）＝`QUEUE_SPELL` 1（非null `pending_spell` をセット）・`FINISH_SPELL` 2（caster／任意の相手状態＋`pending_spell`/`pending_effect` を両方クリア）・`FINISH_CUTIN` 2（使用者／任意のcaster状態＋`pending_spell` のみクリア）。null と省略の差を action ごとに固定。
- **`ADVANCE_TURN_WITH_STATE`**（2箇所）＝CPUのUP処理済み状態と `turn_phase:'DRAW'` を原子的に書く／CPU GROW 開始（`opp?`＋`effectStack?` で ON_GROW_PHASE_START の相手 usage とスタックを併記）。
- **`RESOLVE_EFFECT_STEP`**（6箇所）＝engine の `ExecResult` を受ける `resume*` ハンドラの共通形＝両者の盤面＋`pending_effect` の継続（非null）／完了（null）。optional で `clearPendingSpell`（スペル・カットイン解決）・`effectStack`（解決中に積まれたトリガー）・`settleStackOnDone`（**完了時かつ解決済みのみ** スタックを null）。
  **⚠ 適用順＝settle が先・`effectStack` 明示が後（上書き）**。盤面差分で新しく発火した効果は、直前のスタックが解決済みでも新スタックとして残す（旧ハンドラの順序。逆にすると発火した効果が消える）。
- **`RESOLVE_JANKEN`**（1箇所）＝じゃんけん判定。勝者ありは先攻確定＋`setup_phase:'LRIG_SELECT'`＋両者の手をリセット／**あいこは手だけリセットして `setup_phase` を進めない**（再戦）。
- **`BEGIN_NEXT_TURN`**（2箇所）＝CPUターン終了／`confirmEndDiscard`（手札上限超過）＝`turn_phase:'UP'`＋ターンプレイヤー交代＋`turn_count` 加算＋両者の最終盤面。**`activeUserId` 省略＝据え置き**（追加ターン `extra_turn` はターンプレイヤーが交代しないので `active_user_id` キー自体を書かない）。
- **`SET_STACK`**（5箇所）＝effect_stack のみ書き換え。`settle:true` で `isStackDone(stack)?null:stack` の settle イディオムを reducer が適用（＝スタック解決判定を1箇所に集約・テスト可能化）。
- **`END_GAME`**（3箇所）＝決着（`global_phase:'FINISHED'`＋`winner_id`＋最終盤面）。

#### 残＝3 commit（grep ベース。`persist.commit(` 117箇所のうち、`reduceBattle` を経ないのは下記3つだけ）

単純なセットアップ、非null `pending_spell` の開始、スペル／効果なしカットインの固定クリア、CPUの小さな状態＋phase 遷移、直前フラグ watcher の条件付き2状態書き込みは移行済み。残テールの分類：

| | 残テール | 状況 |
|---|---|---|
| (a) | 名前付き `const update` の**命令的インクリメンタル構築** | **残り3箇所＝`doPhaseAdvance` / `resolveStackNext`（CPUターン強制終了の `Object.assign`）／効果解決結果の後乗せ（`'host_state' in update` の読み戻し）**＝最難関（下記⚠） |
| (b) | `pending_effect` 非null生成／効果実行結果の `done` で null↔非null が分岐する遷移 | ✅**残0**（`RESOLVE_EFFECT_STEP` で6箇所） |
| (c) | `...opUsageUpdate` / `...extraUpdate` 等の spread で**前後の上書き順も意味を持つ**遷移 | ✅**残0**（条件付きキーは `undefined` payload・0〜2状態は `WRITE_STATES` で表現できると判明） |
| (d) | ENDフェイズ／CPUターン終了など複数カラム同時更新 | ✅`BEGIN_NEXT_TURN` で消化 |

> **⚠(a) の残り3箇所**は payload 化では落ちない。`update[opKey]` を**読み戻して積み増す**
> （`(update[opKey] as PlayerState) ?? op` / `'host_state' in update ? update.host_state : hostState`）・
> `update.effect_stack` を**ベースにして push**・`update.turn_phase` を
> **読んで分岐**（`if (phase==='ATTACK_SIGNI' && update.turn_phase==='ATTACK_LRIG')`）の3点で、
> **パッチが「途中経過を持つ可変アキュムレータ」**になっている。フェイズ別のハンドラ分割が先＝**着手時に scope を切り直す別作業**。

**2026-08-03 の3バッチ（計19箇所）で分かった定形**：

1. **条件付きキーは `opp: undefined` / `effectStack: undefined` で表す**＝旧 `...(cond ? {k:v} : {})` と
   キー集合まで一致する（reducer は `!== undefined` で判定＝**undefined＝不干渉・null＝明示クリア**）。
2. **命令的 update を潰す基本手＝「payload を組んでから書き換える」を「状態を確定してから1回書く」へ反転**させる
   （例：`updatePayload[stateKey]` の後付け差し替え → commit 前に `paid` を確定させる）。
3. **「代入しないことで表していた据え置き」は optional payload で表す**（`BEGIN_NEXT_TURN` の `activeUserId` 省略＝
   追加ターンでターンプレイヤーを交代しない）。同じ値を書いて丸めるとキー集合が変わるので採らない。
4. 副次収穫＝**computed key `{ [opStateKey]: … }` は書き込み先カラムの型検査が効かない**（`string` へ widening）。
   reducer 経由化すると `PlayerStateKey` 要求で TS が拾う。
5. **⚠ 同じキーに2度書く旧コードは「後から書いた方が勝つ」＝その順序を reducer で再現する**。
   `RESOLVE_EFFECT_STEP` の settle と `effectStack` がこれ（第5バッチで是正）。**移す前に「このキーは何回書かれるか」を必ず数える**。
6. **reducer に既に action があるのに手書きのまま残っている取りこぼしを定期的に探す**
   （第5バッチのセットアップ系5箇所＝`SELECT_LRIG`/`COMPLETE_MULLIGAN`/`START_PLAYING`、
   2026-08-03 第2弾の対人じゃんけん2箇所＝`SUBMIT_JANKEN`/`RESOLVE_JANKEN`＝CPU経路だけ移行済みだった）。
   `isHost ? {host_…} : {guest_…}` の三項がハンドラに残っていたら候補。

**2026-08-03 第2弾の2バッチ（計11箇所・102→114）で分かった定形**：

7. **`update[key]` の読み戻しが「常に undefined」＝死んだアキュムレータなら (a) ではない**。
   直前フラグ watcher の `applyState` は各キーにつき1回しか呼ばれないため `(update[key] as PlayerState) ?? base` は
   常に `base` に落ちる＝**キー集合を保ったまま `Partial<Record<PlayerStateKey, PlayerState>>` へ置換できる**。
   **移す前に「そのキーは何度書かれうるか」を数える**（定形5の系）。真に途中経過を読むのは残る3箇所だけ。
8. **`Record<string, unknown>` のパッチ変数は移行の匂い**＝computed key で型検査が効いていない印（定形4）。
   `PlayerStateKey` で受け直すと、ヘルパー引数（`stateKey: string` → `PlayerStateKey`）まで型が伝播する。
9. **ヘルパー関数の「何でも入る追加パッチ」引数は用途を1つに絞れることが多い**
   （`queueCardEffects(… extraUpdate: Record<string, unknown> …)` は実引数が
   `{}` 2件と `{[opKey]: opState}` 1件だけ＝`opp?:{key,state}` に狭めて `WRITE_STATE` へ合流）。

⚠**ハンドラ側の payload 構築は golden（純粋関数のみ）でカバーされない**ため、機械的な一括変換は「サイレントな挙動変化」を検出できない。1件ずつ手動レビュー、または先にハンドラの挙動テストを用意してから進める（機械変換で `WRITE_RAW(patch)` に丸めるのは純粋化にならないため行わない）。

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
