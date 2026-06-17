# 引き継ぎ: FUTURE SESSION ② 2段階ピック実装ラウンド（2026-06-17 ymsty側 → zerom側へ）

前回 `HANDOFF_20260617_stub_implementation_round.md`（v0.327）の残作業を確認・対応。
残作業 C（TokenCallers 積み残し）は**すでに実装済み**であることを確認し、残作業 A の一部を本実装化した。

## ✅ 実施済み（本セッション）

### 1. FUTURE SESSION ②（WX26-CP1-001-E1 c1）2段階リビールピックを本実装
- 元テキスト: 「デッキ上5枚を見る→2枚まで手札→＜プリオケ＞1枚までエナ→残りをデッキ下」
- 旧: `REVEAL_PICK_HAND_SHUFFLE_BOTTOM`（手札に加えるだけ）で近似 → **エナ送り分岐を追加**
- 実装:
  - `StubAction.revealPickParams.secondPick`（`classContains`/`toMax`/`restDest`）を追加（`src/types/effects.ts`）
  - `REVEAL_PICK_HAND_SHUFFLE_BOTTOM`（`execStubPart1.ts`）: `secondPick` 指定時は1段目で `restDest` を付けず
    `continuation` で2段目スタブへ公開カード一覧(`revealed`)を渡す
  - 新 stub `REVEAL_SECOND_PICK_ENERGY`（`execStubPart1.ts`）: 残り公開カードのうち CardClass が
    指定文字（"プリオケ"）を含むものを `toMax` 枚までエナへ、それ以外の残りを先にデッキ下へ
  - effects_WX24_26.json: WX26-CP1-001-E1 c1 に `secondPick:{classContains:"プリオケ",toMax:1,restDest:"deck_bottom"}` 付与
- 検証: `scripts/_verifyFutureSession2.ts`（`npx tsx`、22項目パス）。`typecheck`/`build` 通過。

### 2. 前回残作業 C（TokenCallers 積み残し）の現況確認 → すべて実装済みだった
前回 HANDOFF の残作業 C は前任ラウンドのコピーで、実コードでは既に対応済みだった（HANDOFF が stale）:
- **みこみこ親衛隊**: `WX25-P3-TK03-E1`(ON_TURN_END) + `REMOVE_MIKO_KEYWORD` stub + `collectTurnTriggers` の
  `KEYWORD_TOKEN_MAP` で実装済み。
- **シグニトークン名指し ADD_TO_FIELD**（雷ちゃん等5体）: effects JSON で `cardName` 明示、`battleCardNums`
  に常時ロード済み、`execAddToField` のゲーム外生成経路で解決。
- **サーバント ZERO（全角ＺＥＲＯ）**: `*_SERVANT_ZERO` 系 stub が cardNum `WXDi-P07-TK01-A` を直接指定で解決済み。
- **WXK03-TK-01B 落華流粋**: `battleCardNums` にロード済み。

## ⏳ 残作業（zerom側）

### A. PR-Di035 青「相手手札3枚捨て」の選択化
- `PRDI035_APPLY_PARADISE`（`execStubPart3.ts`）が `othPDL.hand.slice(0,3)` で**先頭3枚固定**（近似）。
- 本来は相手が選ぶ。APS（遅延）評価中のスタブから相手へ `SELECT_DISCARD` 系インタラクションを
  発行する必要があり、機構が横断的。対人戦で要改善。

### B. STUB_LOG→0 の継続
- `docs/TokenCallers.md` の未実装マーク／`project_stub_status.md` を順に。パーサー修正優先（manualEffects回避）。

## 参考
| ファイル | 役割 |
|---------|------|
| `src/engine/execStubPart1.ts` | `REVEAL_PICK_HAND_SHUFFLE_BOTTOM` / 新 `REVEAL_SECOND_PICK_ENERGY` |
| `src/types/effects.ts` | `revealPickParams.secondPick` / `revealed` / `secondPick` |
| `public/data/effects_WX24_26.json` | WX26-CP1-001-E1 c1 |
| `scripts/_verifyFutureSession2.ts` | 検証ハーネス（22項目） |
| `docs/TokenCallers.md` | 近似・未対応の現況（本ラウンドで更新） |

## デプロイ
`vercel deploy --prod` は zerom 側で実施（ymsty 側に権限なし）。
