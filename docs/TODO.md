# 残作業 (TODO)

未実装・未対応の作業をまとめた恒久ドキュメント。完了したら該当項目を消すこと。
設計方針は [DESIGN.md](./DESIGN.md)、過去の修正は [BUGFIXES.md](./BUGFIXES.md)。

最終更新: 2026-06-20（v0.387 まで）。**F-2 は既存機構でクリーンに実装可能な14枚＋相手場付与1枚（WXDi-P10-072・v0.387）を完了**。残りは F-2 節末の「残り4枚」（ゲート2/置換2＝いずれも専用機構/高リスク）。引き継ぎ詳細は BUGFIXES.md 冒頭の各バッチ記録を参照。

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

**残り（4枚・いずれも要・専用機構/高リスク。既存機構でクリーンに実装可能な付与型・コスト型・相手場付与は v0.377〜v0.387 で完了）:**
- **ゲート条件（自ゲート未モデリング）:** `WXDi-P15-082`（ON_ATTACK_PHASE_START＋同ゾーンに【ゲート】）/ `WXDi-P15-076`（ON_TURN_END＋【ゲート】）← 既存 `signi_gate_zones` は「相手へ設置するアタック不可ゲート」で別概念。THE DOOR の自ゲート表現が必要。
- ~~**相手場への付与（機構は v0.377 で用意済・未配線）:** `WXDi-P10-072`~~ → **v0.387 で実装済**（GRANT_FIELD_SIGNI_ABILITY{targetOwner:opponent}＋付与能力 ON_ATTACK_PHASE_START/MILL self。CPUターンの APS 収集を `cpuTurnAction` に配線。詳細は BUGFIXES.md）。
- **身代わり置換型（F-3 と同種・別タスク）:** `WXDi-P06-034`（ライズ＋「代わりに…してもよい」）/ `WXK05-024`（場離れ代わりに除外）← 置換効果。F-3 と合わせて対応。

### F-3. optional 身代わりバニッシュの表現（**監査済み 2026-06-20: 無害確定・本実装は別タスク**）

**監査結論:** 全7枚に `optional:true` が正しく付与されており、`calcContinuousSigniMutations` の **行397** `if ((act as BanishAction).optional) continue;` により**自動適用されない**＝**無害確定**。表現としては CONTINUOUS BANISH のままだが optional フラグが「自動適用しない身代わり」を正しく表す。
本実装（「してもよい」の対話プロンプトをバトルバニッシュ経路＝BattleScreen 6620-6700 の多分岐＋effect-banish 経路の両方に差し込む）は**最も壊れやすいコアへの高リスク介入**かつ対象7枚のニッチカードのため、リスク承知の上での専用設計タスクとして切り出す。対象：`WX12-024` `WX17-075` `WX20-055` `WXEX2-60` `WXDi-P10-052` `WXDi-CP01-032` `WX25-P1-056`（本来は BANISH_SUBSTITUTE/CHARM_PROTECTION 的な置換機構）。
