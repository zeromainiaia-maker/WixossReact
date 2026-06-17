# 引き継ぎ: スタブ実装ラウンド（2026-06-17 zerom側 → ymsty側へ）

前回HANDOFFの「残作業A（バリア/再構築カードの近似・未実装）」を全て本実装化した。
また FUTURE SESSION② の近似残件と TokenCallers B 積み残しが引き続き残っている。

デプロイ済みバージョン: **v0.327**

---

## ✅ 実施済み（本セッション）

### 1. CHOOSE「N つまで(up to)」対応
- `ChooseAction` に `upTo?: boolean` フィールド追加（`src/types/effects.ts`）
- `PendingInteractionDef` CHOOSE 型に `upTo?: boolean` 追加（`src/types/index.ts`）
- `execChoose`（`effectExecutor.ts`）で `upTo:true` 時に `multiSelect:true` を pending に付加
- `BattleScreen.tsx` に multiSelect UI 実装（チェックボックス＋決定ボタン）
- `resumeChoose` の引数を `string | string[]` に拡張し、複数選択時は SEQUENCE として実行
- **セイクリッド・フォース (WX24-P1-001)**: effects_WX24_26.json で `"upTo": true` 付与済み

### 2. FUTURE SESSION リコレクト + 動的 choose_count
- `ChooseAction` に `recollect?` フィールド追加（`minCount` 以上の時 `thenChooseCount`/`thenUpTo` に上書き）
- `execChoose` でトラッシュのプリオケ枚数を評価し、条件達成時に choose_count/upTo を上書き
- effects_WX24_26.json: WX26-CP1-001-E1 の c2 に `recollect: {minCount:4, thenChooseCount:2, thenUpTo:true}` 設定済み

### 3. FUTURE SESSION ③ 遅延タイミング実装
- `PlayerState.pending_prioke_attack_trash_grant?: boolean` を追加（`src/types/index.ts`）
- stub `GRANT_PRIOKE_PENDING_ATTACK_TRASH`（`execStubPart3.ts`）: フラグをセット
- stub `INTERNAL_APPLY_PRIOKE_ATTACK_TRASH`（`execStubPart3.ts`）: `granted_effects` 経由でプリオケシグニに
  ON_ATTACK_SIGNI→BANISH 能力を付与
- `collectTurnTriggers`（`BattleScreen.tsx`）: APS 検出でフラグがあれば `INTERNAL_APPLY_PRIOKE_ATTACK_TRASH` エントリを追加
- effects_WX24_26.json: WX26-CP1-001-E1 の c3 action を `STUB GRANT_PRIOKE_PENDING_ATTACK_TRASH` に変更

### 4. エビディバ!!!!!（WX25-P3-050）赤色実装
- stub `EVDIVA_PER_LRIG_COLOR`（`execStubPart3.ts`）の赤分岐:
  `SELECT_TARGET`（2体まで、optional）→ stub `INTERNAL_EVDIVA_RED_BANISH`
- stub `INTERNAL_EVDIVA_RED_BANISH`: `effectivePowers` で対象2体のパワー合計 ≤ 12000 なら両バニッシュ

### 5. PR-Di035 OPEN DREAM LAND! 遅延タイミング実装
- `PlayerState.pending_pridi035_paradise?: boolean` を追加（`src/types/index.ts`）
- stub `PRDI035_PARADISE_COLOR`: 即時色判定から **フラグセットのみ** に変更
- stub `PRDI035_APPLY_PARADISE`（新設）: 場のプリパラシグニの共通色・レベル3種類を確認し色別効果を適用
- `collectTurnTriggers`: APS 検出でフラグがあれば `PRDI035_APPLY_PARADISE` エントリを追加

### 6. ダーク系 TK 生成（WX25-P1-TK1〜5）配線
- WX25-P1-034 (うらら系スペル) E2 を `CRAFT_TO_LRIG_DECK` stub から CHOOSE（2体選ぶ）に変更
- 各選択肢が `ADD_CRAFT_TO_LRIG_DECK` + cardName でルリグデッキの対応クラフトカードを生成
- `battleCardNums` に TK1〜5 を常時ロード追加（`BattleScreen.tsx`）

### 7. WXDi-P11-063（無心の豪圧）修正
- ON_PLACED_UNDER_SIGNI タイミングの効果を JSON で定義
- `INTERNAL_PLACE_SELF_UNDER_SIGNI` stub でテキストパーサーより JSON effects を優先参照に変更

### 8. WXDi-P05-086（TREAT_AS_LEVEL1_IN_DECK_TRASH）配線
- effects_WXDi.json に CONTINUOUS 効果（effectId: WXDi-P05-086-CONT）を追加
- エンジン（`collectDeckTrashLevel1Nums`）は既実装だったため配線のみ

---

## ⏳ 残作業

### A. FUTURE SESSION② 近似
- **WX26-CP1-001-E1 の c2（②）**: 「デッキ上5枚を公開→2枚手札に加え、プリオケのカードを1枚まで
  エナゾーンに置き、残りをデッキ下へ」
- 現状: `REVEAL_PICK_HAND_SHUFFLE_BOTTOM`（手札に加えるだけ）で**近似中**
- 改善: `execRevealPickHandShuffleBottom` にエナゾーン送り分岐を追加するか、専用 stub 化
- 難易度: 中（REVEAL_PICK 系を拡張すれば汎用的に使える）

### B. PR-Di035 青 相手手札捨て近似
- 「対戦相手は手札を3枚捨てる」= **相手が選ぶ** はず
- 現状: `othPDL.hand.slice(0, 3)` で先頭3枚固定（近似）
- 改善: `SELECT_DISCARD` 系インタラクションを相手側に発行する（対人戦では必要）

### C. TokenCallers 積み残し（バリア以外）
- **みこみこ親衛隊(WX25-P3-TK03)**: ターン終了時の手札捨て→除去未実装。GRANT_KEYWORD プレースホルダのまま。
- **シグニトークンの `ADD_TO_FIELD` 名指し解決（未検証）**:
  雷ちゃん/ペロロ人形/ママ勇者/雨雲号/クルセイダーちゃんが正しいトークンを場に出せているか未検証
- **WXK03-TK-01B 落華流粋**: 生成配線が要確認
- **サーバント ZERO(WXDi-P07-TK01-A)**: カーニバル系が全角「ＺＥＲＯ」表記で名前一致しない問題

### D. 全体目標: STUB_LOG→0
- `project_stub_status.md` に 503 種 2189 件の記録あり
- 優先: `docs/TokenCallers.md` に未実装マークがあるカードを順に対応
- 方針: manualEffects ではなくパーサー修正で系統的に対応（`feedback_parser_over_manual.md` 参照）

---

## 参考ファイル
| ファイル | 役割 |
|---------|------|
| `docs/TokenCallers.md` | TK カード全件の呼び出し元と実装状況 |
| `src/engine/execStubPart3.ts` | 本セッションで追加・変更した stub の大半 |
| `src/engine/effectExecutor.ts` | `execChoose` / `resumeChoose` の upTo / multiSelect 対応 |
| `src/screens/BattleScreen.tsx` | multiSelect UI / `collectTurnTriggers` APS フラグ検出 |
| `src/types/index.ts` | `PlayerState` フラグ2件追加 |
| `src/types/effects.ts` | `ChooseAction.upTo` / `.recollect` 追加 |
| `public/data/effects_WX24_26.json` | FUTURE SESSION / セイクリッド・フォース / WX25-P1-034 修正 |
| `public/data/effects_WXDi.json` | WXDi-P11-063 / WXDi-P05-086 修正 |
| `public/data/effects_misc.json` | PR-Di035 (変更なし・既に SEQUENCE 構成) |

## デプロイ
`vercel deploy --prod` は zerom 側で実施（ymsty 側に権限なし）。
