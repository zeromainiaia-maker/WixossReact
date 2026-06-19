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

## F. CONTINUOUS BANISH/TRASH 誤解析（残: 機能実装と TRASH 系）

> **有害バグは解消済み（v0.339）**: 非optional CONTINUOUS BANISH は残り0件。詳細は BUGFIXES.md「CONTINUOUS BANISH 誤解析の一掃ラウンド」。以下は残りの「機能実装」と無害な TRASH 系。

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
- **テキスト書き換え系:** WX09-027（自分の他シグニのバニッシュ閾値を書き換え）
- **トークン:** ※WXDi-CP02-TK02A は v0.352 でランサー＋バトルバニッシュを実装済（「対戦相手ターン終了時に自己除外」は非アクティブ側ターン終了トリガーが必要で保留）。
- ~~**WX17-038:** 中央でアタック時にデッキ公開→同レベルバニッシュ~~ → v0.353 で `REVEAL_UNTIL_BANISH_SAME_LEVEL` を新設し実装済。

### F-2. 無害な CONTINUOUS TRASH 誤解析（精査のみ）

`calcContinuousSigniMutations` は TRASH を実行しないので無害だが誤解析ではある：`WX06-029` `WX12-018` `WX17-036` `WX21-054` `WXDi-P02-068` `WXDi-P04-040` `WXDi-P04-082` `WXDi-P05-032` `WXDi-P06-034` `WXDi-P09-058` `WXDi-P10-072` `WXDi-P15-060` `WXDi-P15-064` `WXDi-P15-076` `WXDi-P15-082` `WXDi-P15-098` `WXK04-048` `WXK05-024` `WXK10-039` ほか。

### F-3. optional 身代わりバニッシュの表現（無害・別概念）

`optional:true` の「代わりにバニッシュしてもよい」は自動適用されず無害だが、CONTINUOUS BANISH 表現は正しくない（本来は BANISH_SUBSTITUTE/CHARM_PROTECTION 的な置換機構）：`WX12-024` `WX17-075` `WX20-055` `WXEX2-60` `WXDi-P10-052` `WXDi-CP01-032` `WX25-P1-056`。
