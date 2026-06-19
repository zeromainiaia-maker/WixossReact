# 残作業 (TODO)

未実装・未対応の作業をまとめた恒久ドキュメント。完了したら該当項目を消すこと。
設計方針は [DESIGN.md](./DESIGN.md)、過去の修正は [BUGFIXES.md](./BUGFIXES.md)。

最終更新: 2026-06-18

---

## 全体方針

**STUB の本実装化を継続する。** STUB_LOG（ログのみ）は v0.284 で 0 件達成済み。
以降は「ゲーム効果はあるが近似実装」や「機構未実装で UNKNOWN」のものを順次本実装に移行する。

---

## A. 個別カードの未対応・近似実装

| カード | 内容 | 状態 |
|---|---|---|
| PR-Di035（青） | 「相手手札3枚捨て」が先頭3枚固定の近似（`PRDI035_APPLY_PARADISE` の `othPDL.hand.slice(0,3)`）。本来は相手が選ぶ。遅延評価中スタブから相手へ SELECT_DISCARD 系を発行する横断的機構が必要 | 近似のまま |
| WXDi-P03-085（ルカ） | 「黒ではない」除外を無視した近似（TargetFilter に色除外がない） | 近似のまま |
| WX17-035（ピグシイ） | 「このシグニの正面のシグニ」の表現がなく owner:opponent で近似 | 近似のまま |

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
| 遅延能力付与 | 「次のアタックフェイズ開始時にシグニへ能力を付与」 | FUTURE SESSION③（WX26-CP1-001） |
| 動的 choose_count | リコレクト枚数等で選択数が動的に変わる | FUTURE SESSION リコレクト |
| ダーク系 TK 生成 | うらら系の汎用ダークアーツ生成（個別名指しなし） | ダーク系トークン |
| CONTINUOUS REMOVE_ABILITIES | 対象シグニの能力を常在的に消す | WX16-001, WXDi-P05-045, WXK01-002, WXK04-068 |
| CONTINUOUS DRAW | 常在ドロー効果 | WXDi-P04-056 |
| クラッシュ時トリガー配線 | `ON_LIFE_CRASHED` timing が未配線。クラッシュ発生は `crashOneLife` 系7箇所＋`execLifeCrash` に分散しており、配線時は全経路対応が必要 | WXDi-P02-037（ダッキ）等 |
| 手札からの自己起動 | 「手札からこのカードを捨てて起動」＝自身がコストという機構自体が未実装 | WX17-031 等8枚 |

---

## C. 未実装の特殊システム（STUB ログのみ）

| STUB / システム | 件数 | 内容 |
|---|---|---|
| GRANT_QUOTED_AUTO_ABILITY 系 | 約27件 | 「アタック時にパワー自己参照-」「アーツ使用時ダブルクラッシュ獲得」等の引用能力付与 |
| GAIN_SUBSCRIBER_COUNT | 16件 | 登録者数（WDK16） |
| SONG_FRAGMENT | 10件 | 歌のカケラ（WX26-CP1） |
| COPY_LRIG_NAME_ABILITY | 16件 | ルリグ名＋AUTO 能力コピー（WX24-P4） |

---

## D. CPU AI の拡張

- メインフェイズ AI（アーツ/スペル/起動効果の能動使用、グロウ時トリガー）が未実装。
- CPU 召喚の ON_PLAY 解決は「全配置後にまとめて」の近似（人間は1枚ごと）。

---

## E. 検証・品質

- `checkAllEffects` の `MANDATORY_SUSPICIOUS`（ヒューリスティック検出・要精査）の精査。
- `verifyEffects` の「定義なし」誤検出（注釈のみ・トークン等）の除外ロジック改善。

---

## F. CONTINUOUS BANISH 誤解析の一掃（系統的・要精査）

- **背景:** `calcContinuousSigniMutations`（`effectEngine.ts`）は CONTINUOUS の BANISH/FREEZE/DOWN（`mandatory:true`・非optional・条件パス）を場にある間ずっと自動適用する。本来は【自】効果や能力付与（「〜を得る『…バニッシュ』」）なのに無条件 CONTINUOUS BANISH に潰れたカードは、場に出した瞬間から相手シグニを一方的にバニッシュし続ける重大バグになる（WD04-009 で発覚・v0.338修正済）。
- **対象候補（CONTINUOUS・action=BANISH・条件なし、要個別精査）:** `WX05-021` `WX09-019` `WX09-027` `WX10-063` `WX12-024` `WX13-034` `WX16-045` `WX17-038` `WX17-075` `WX18-076` `WX20-072` `WX20-Re18` `WX21-052` `WXEX2-60` `WD14-001` `WDK08-L11` `WDK16-06H` `SP27-015` `PR-288` `PR-426` `WXDi-D07-003` `WXDi-P04-015` `WXDi-P05-034` `WXDi-P07-060` `WXDi-P15-061` `WXDi-CP02-TK02A` `WXK03-034` `WXK03-056` `WXK07-044` `WX25-P1-056` `WX25-P3-057` ほか。
  - ※`WX20-055`/`WX25-P1-056` 等の身代わり系は `optional:true` なら自動適用されない。`TURN_OWNER`/`IS_DRIVE_STATE` 等の条件付きは正当な可能性あり。CSV を1枚ずつ確認して AUTO/能力付与/起動へ振り分けること。
  - ※CONTINUOUS TRASH はこの経路で実行されない（無害）が、これも誤解析なので併せて精査対象。
