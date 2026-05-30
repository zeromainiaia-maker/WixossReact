# STUB実装状況メモ

最終更新: 2026-05-30 (v0.106)  
調査コマンド: `node -e "const d=JSON.parse(require('fs').readFileSync('public/data/effects.json','utf8')); const c={}; for(const [,es] of Object.entries(d)){ if(!Array.isArray(es)) continue; for(const e of es){ const a=e.action; if(a?.type==='STUB'){c[a.id]=(c[a.id]||0)+1;}}} const s=Object.entries(c).sort((a,b)=>b[1]-a[1]); console.log('総計:', s.length, '/', s.reduce((a,b)=>a+b[1],0)); s.slice(0,20).forEach(([k,v])=>console.log(v,k))"`

## 全体サマリー（v0.105）

| 指標 | 値 |
|---|---|
| STUB種別総数 | 336種 |
| STUB登場総数 | 538件 |
| AUTO/ACTIVATED STUBでif-branchなし | 0種（全てif-branch済み） |
| CONTINUOUS STUB（effectEngineで動的処理） | 多数 |
| 「ログのみ」if-branchのSTUB | 少数（COLLAB, SEED_BLOOM系等） |

**注意:** STUB_LOGテーブルはフォールバックとして機能。実際にSTUB_LOGに到達するケースは、if-branchが全パターンをカバーできていないフォールバックケースのみ。

---

## ステータス凡例

- ✅ 実装済み（ゲームに効果あり）
- ⚡ 部分実装（近似処理・一部ケースのみ動作）
- 📝 ログのみ（STUB_LOGテーブル or スキップ）
- ❌ 完全未処理（executor未登録）

---

## 上位STUB詳細

### AUTO/ACTIVATED STUB上位（v0.105時点）

| 件数 | STUB ID | ステータス | 内容 |
|---|---|---|---|
| 16 | GAIN_SUBSCRIBER_COUNT | ✅ | 登録者数カウント（if-branch実装済み）|
| 12 | GRANT_QUOTED_AUTO_ABILITY | ✅ | キーワード能力付与（if-branch実装済み） |
| 11 | SOUL_OP | ⚡ | ソウルメカニクス（複数サブパターン実装） |
| 10 | SONG_FRAGMENT | ✅ | 歌のカケラ効果（if-branch実装済み） |
| 9 | GRANT_QUOTED_ABILITY | ✅ | 引用符付き能力付与（if-branch実装済み） |
| 9 | GRANT_ABILITY_INNER_TEXT | ✅ | キーワード能力付与（if-branch実装済み） |
| 6 | CRAFT_TO_LRIG_DECK | ✅ | クラフトをルリグデッキに（if-branch実装済み） |
| 5 | MOVE_TO_OTHER_SIGNI_ZONE | ✅ | シグニゾーン移動（if-branch実装済み） |
| 5 | TRASH_SIGNI_UNDER_FIELD_SIGNI | ✅ | ライズ機構シグニ下トラッシュ（if-branch実装済み） |
| 5 | COUNT_BASED_DRAW_OR_POWER | ✅ | カウント基準ドロー/パワー（if-branch実装済み） |
| 4 | CONDITIONAL_MULTI_CHOOSE_BY_CENTER | ✅ | センタールリグ多択（if-branch実装済み） |
| 4 | SEED_BLOOM | 📝 | シードブルーム（ログのみ・難度D） |
| 4 | COLLAB | 📝 | コラボ効果（if-branchあるが「ログのみ」） |
| 3 | ACTIVATE_TRAP | ✅ | トラップ発動（if-branch実装済み） |
| 3 | ACCE_FROM_HAND | ✅ | 手札からアクセ（if-branch実装済み） |
| 3 | CLASS_CHANGE | ✅ | クラス変更（if-branch実装済み） |
| 3 | POWER_MOD_PER_COUNT | ✅ | パワー修正（カウント別）（if-branch実装済み） |
| 3 | DO_THREE_THINGS | ✅ | 3択効果（if-branch実装済み） |
| 3 | PLACE_CARD_UNDER_SIGNI | ✅ | カードをシグニ下に（if-branch実装済み） |
| 3 | MAKE_SERVANT_ZERO | ✅ | サーバントゼロ（if-branch実装済み） |

### 「ログのみ」if-branchを持つSTUB（v0.106時点）

これらはif-branchがあるが、ゲーム状態を変更せずログのみを返す：

| 件数 | STUB ID | 難度 | 実装に必要なもの |
|---|---|---|---|
| 4 | SEED_BLOOM | D | シードゾーン新設+ブルームシステム |
| 1 | ENCORE | 高 | アーツ再使用ロジック |
| 4 | COLLAB | ✅済 | v0.106でON_PLAY配置実装（コラボライバー2人を呼ぶ） |
| 1 | LIMIT_OPP_SIGNI_ATTACKS_ONCE | ✅済 | v0.106でsigni_attack_once_limit実装 |
| 1 | OPP_SIGNI_ONE_ATTACK_TOTAL | ✅済 | v0.106でsigni_attack_once_limit実装 |
| 1 | MOVE_TO_ATTACKER_FRONT | ✅済 | v0.105で実装済み |
| 1 | SIGNI_LOSE_COLOR | ✅済 | v0.105で実装済み |

---

## 真の未ハンドル（v0.106時点）

v0.106時点でexecutor.tsのif-branchが全てのAUTO/ACTIVATEDのSTUBをカバー済み。
`[STUB: xxx]`形式のログは出ない状態。

---

## 実装履歴

| 日付 | 実装内容 | 対象STUB |
|---|---|---|
| 2026-05-29 | UNKNOWN 0件達成：SONG_ICON regex修正+「この方法で場に出たシグニの」パース追加 | effectParser UNKNOWN解消 |
| 2026-05-29 | アップ状態クラスシグニ選択→ダウン（コスト軽減素材として） | DOWN_UP_SIGNI_AND_CHOOSE |
| 2026-05-29 | lastProcessedCards/デッキ上1枚からトラップ設置ゾーン選択 | TRAP_OPERATION |
| 2026-05-29 | センタールリグ下の任意枚数をルリグトラッシュへ（WX12-Re22等） | SOUL_OP（拡張） |
| 2026-05-29 | コイン消費ベット→2択/4択ダイアログ+①②③④実行 | BET_MECHANIC |
| 2026-05-29 | 歌のカケラ効果をeffects.jsonに15枚追加+エナから発動 | SONG_FRAGMENT |
| 2026-05-29 | 相手ゾーン選択→signi_gate_zones設定+アタック不可フラグ | GATE |
| 2026-05-29 | PLAY_FREE: parseCardEffectsでスペル/シグニ効果を実行 | PLAY_FREE, PLAY_SPELL_FREE_IGNORE_RESTRICTION, CAST_FROM_OPP_TRASH, USE_SPELL_FROM_TRASH |
| 2026-05-29 | ①②③④選択肢解析+CHOOSE | CHOOSE_N_FROM_LIST |
| 2026-05-29 | N回繰り返し（パワー修正・デッキトラッシュに対応） | REPEAT_N_TIMES, REPEAT_EFFECT |
| 2026-05-29 | ルリグ名エイリアスをlrig_name_aliasesに保存 | COPY_LRIG_NAME_ABILITY |
| 2026-05-29 | トラッシュクラス枚数・自場クラス・自シグニパワーパターンを追加 | CONDITIONAL_POWER_BONUS (拡張) |
| 2026-05-29 | 手札捨て+相手シグニ選択インタラクション（スタンドアロン時） | TARGET_AND_DISCARD_HAND (スタンドアロン改善) |
| 2026-05-29 | カード名宣言ダイアログ（手札から選択）・declared_card_name状態保存 | DECLARE_CARD_NAME |
| 2026-05-29 | 相手シグニ選択インタラクション・lastProcessedCardsへ格納 | TARGET_ONLY |
| 2026-05-29 | ライフ枚数条件チェックのログ改善 | CONDITIONAL_ARTS_COST |
| 2026-05-29 | シグニ/宣言名/クラス条件でデッキ公開・lastProcessedCardsに格納・残りトラッシュ/デッキ下処理 | DECK_REVEAL_UNTIL, DECK_REVEAL_UNTIL_CLASS, OPP_DECK_REVEAL_UNTIL |
| 2026-05-29 | トラップシステム全実装（設置/発動/UI/トラップアイコン効果/視覚表示） | TRAP_OPERATION, TRAP_OP, PLACE_TRAP_FROM_REVEALED, PLACE_TRAP_OPTIONAL, ACTIVATE_TRAP, TRAP_TO_HAND, SET_OPP_SIGNI_AS_TRAP, SET_HAND_CARD_AS_TRAP, TRAP_TO_SIGNI_IF_ZONE_EMPTY |
| 2026-05-29 | ゾーン選択インタラクション＋disabled_signi_zonesへの反映 | DESIGNATE_SIGNI_ZONE, BLOCK_OPP_ZONE_PLACEMENT |
| 2026-05-29 | STUB_LOGに11件追加（ログのみ・`[STUB: xxx]`から改善） | END_ATTACK_IF_EXTRA_TURN, SUPPRESS_GAIN_ABILITY, PREVENT_SIGNI_DOWN_BY_OPP, ALL_PLAYER_MILL, ADJACENT_SIGNI_POWER_MOD, PREVENT_OPP_UPKEEP, BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN, LIMIT_OPP_ATTACK_ONCE, SUPPRESS_OPP_SIGNI_ABILITIES, DRAW_IF_OPP_DISCARDED_HAND, OPTIONAL_DISCARD_GUARD |
| 2026-05-30 | 防御側シグニのON_ATTACK_SIGNI AUTOトリガー対応（相手アタック時に防御側が発動） | MOVE_TO_OTHER_SIGNI_ZONE（BattleScreen追加） |
| 2026-05-30 | MAKE_SERVANT_ZERO に1体SELECT_TARGETインタラクション追加（全体→1体選択に改善） | MAKE_SERVANT_ZERO, SIGNI_SERVANT_ZERO |
| 2026-05-30 | チームルリグ3体未満→全ゾーン色喪失（PlayerState.colorless_card_overrides・canAffordGrowCost対応） | LOSE_COLOR_ALL_ZONES |
| 2026-05-30 | 相手ターン中にSELECT_TARGET候補を強制対象シグニのみに絞る（effectEngine.collectForcedTargets追加） | FORCE_TARGET_SELF |
| 2026-05-30 | 「手札の枚数の上限はN増える」パターン対応 / ENDフェーズ手札上限チェック追加 | HAND_SIZE_INCREASE |
| 2026-05-30 | 保護フラグ実装（相手効果でエナ/手札→トラッシュ阻止） | PREVENT_ZONE_MOVE_BY_OPP |
| 2026-05-30 | 赤/青の支払いを白で代替可能（PlayerState.energy_color_substitutes） | ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白 |
| 2026-05-30 | 相手シグニのマイナス合計分だけ自シグニをパワーアップ（ターン終了時AUTOで処理） | REACTIVE_POWER_UP |
| 2026-05-30 | 正面以外のゾーンにも追加バトル（ダメージなし・シグニバニッシュのみ） | MULTI_ZONE_ATTACK |
| 2026-05-30 | 対象シグニ色変更（PlayerState.signi_color_overrides / ENDフェーズリセット） | CHANGE_SIGNI_COLOR |
| 2026-05-30 | このシグニがルリグの色を1つ得る（signi_color_overrides）| SIGNI_GAIN_ONE_LRIG_COLOR |
| 2026-05-30 | CONTINUOUS効果を動的計算に統一（executor.tsのPlayerState直変更を削除） | PREVENT_ZONE_MOVE_BY_OPP, ENERGY_COLOR_SUBSTITUTE_赤_OR_青_TO_白, LOSE_COLOR_ALL_ZONES |
| 2026-05-30 | MULTI_ZONE_ATTACK：強制/任意をテキスト解析で判定、バトル負けケース追加 | MULTI_ZONE_ATTACK |
| 2026-05-30 | ExecCtxにotherProtectedZones追加、resolveStackNext動的計算でexecutorへ渡す | PREVENT_ZONE_MOVE_BY_OPP |
| 2026-05-30 | computeArtsEffectiveCost にフィールド条件コスト軽減追加（スペルにも対応）| CONDITIONAL_COST_REDUCTION_BY_FIELD |
| 2026-05-30 | ルリグカード自身のON_ATTACK_LRIG AUTO効果を処理（handleLrigAttack改善） | ルリグのアタック時AUTO |
| 2026-05-30 | ON_TRASHトリガー実装（56件）：detectTrashedSigni/collectTrashTriggers追加 | ON_TRASH timing |
| 2026-05-30 | ON_ENERGY_FROM_TRASHトリガー実装（3件）：detectEnergyFromTrash追加 | ON_ENERGY_FROM_TRASH timing |
| 2026-05-30 | CONDITIONAL_TRASH_TO_ENERGYにセンタールリグ条件チェック追加 | CONDITIONAL_TRASH_TO_ENERGY |
| 2026-05-30 | OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVELをSELECT_TARGET 1体選択に改善 | OPP_SIGNI_POWER_DOWN_BY_TRASHED_LEVEL |
| 2026-05-30 | アシストグロウ時のON_PLAY効果をスタックに追加 | executeAssistGrow改善 |
| 2026-05-30 | handleRemove時にON_TRASHトリガーを追加 | ON_TRASH |
| 2026-05-30 | SELF_POWER_THRESHOLD条件を正確に評価（effectivePowers参照） | checkActiveCondition |
| 2026-05-30 | GRANT_QUOTED_AUTO_ABILITYのknownKeywordsに Sランサー等追加 | GRANT_QUOTED_AUTO_ABILITY |
| 2026-05-30 | 英知=N 条件をACTIVE_CONDITIONとして正確にパース（EICHI_LEVEL_SUM型追加） | 英知システム全般 |
| 2026-05-30 | CONTINUOUS英知効果の動的チェック（collectEichiStubEffects）・UI反映 | SUPPRESS_LIFE_BURST_ON_CRASH(英知=8) |
| 2026-05-30 | ON_ATTACK_SIGNIトリガーでMOVE_TO_ATTACKER_FRONTを防御側として収集・executor.tsでゾーン移動実装 | MOVE_TO_ATTACKER_FRONT |
| 2026-05-30 | signi_color_overridesに'無'を設定してシグニ色喪失（ENDフェーズリセット済み） | SIGNI_LOSE_COLOR |
| 2026-05-30 | ON_PLAY COLLABでルリグデッキからアシストルリグを2体アシストゾーンに配置（ON_PLAY効果も自動発動） | COLLAB |
| 2026-05-30 | PlayerState.signi_attack_once_limitフラグ追加・BattleScreen/CpuBattleScreenのアタック判定・ENDリセット実装 | LIMIT_OPP_SIGNI_ATTACKS_ONCE, OPP_SIGNI_ONE_ATTACK_TOTAL |

---

## 次回実装優先度

**高難度:**
- SEED_BLOOM（4件）: シードゾーン新設が必要
- ENCORE（1件）: アーツ再使用ロジック

**BattleScreen変更必要:**
- BLOCK_OPP_ARTS_SPELL_ACT, OPP_TURN_NO_ENERGY_COST など
