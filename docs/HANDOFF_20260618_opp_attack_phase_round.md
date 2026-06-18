# 引き継ぎ: 相手アタックフェイズ開始時／パーサー系統修正ラウンド（2026-06-18 ymsty側 → zerom側へ）

本セッション（ymsty側）で、パーサーの系統バグ修正・「対戦相手のアタックフェイズ開始時」の
timing区別と強制アタックの実強制化・各種【起】コスト判定の修正を行った。
残作業として **WXDi-P07-073 / WXK07-043 の2枚（アクション再モデル）を zerom 側へ引き継ぐ**。

最新コミット: **2ca2b60a**（push済み）。`tsc --noEmit` exit 0 / 全 effects JSON 整合確認済み。

---

## ✅ 実施済み（本セッション・すべて push 済み）

### 1. パーサー系統バグ修正
- **GUARD制限の誤分類**（`6126674c` `9d4918e2` `9f28f5f8`）: 一般ガード禁止ルールが
  「レベルN以下のシグニで【ガード】ができない」を先に飲み込み GUARD(全禁止) 化 →
  レベル制限を先判定し `GUARD_MAX_LVN` を返すよう統合。データ修正 WX01-004/WX18-040。
- **バリア付与**（`b982c3a4`）: `【シグニ/ルリグバリア】を得る` を no-op化していたのを
  `GAIN_SIGNI_BARRIER`/`GAIN_LRIG_BARRIER` stub に修正。`StubAction.count?` 追加。
- **シャドウ色スコープ符号化**（`b2c4e142`）: `【シャドウ（X）】` → `【シャドウ:{json}】`
  （`encodeShadowScopesInText`, 27表現マッピング）。
- **多択ベットの誤分類**（`310866e7`）: `BET_ALTERNATIVE`(no-op) → `BET_MECHANIC`。
- **「【X】と【Y】を得る」複合付与**（`c424b54c`）: 隣接キーワード連続を SEQUENCE 化
  （シャドウ複合 WXDi-P09-043/P13-058 等）。「か(OR)」「別ターゲット」は除外。
- **引用ネストのシャドウ付与平坦化**（`de089cb3`）: `「【常】：…【シャドウ(X)】を得る。」を得る`
  を直接 GRANT_KEYWORD へ平坦化（WXDi-P07-009/P09-053/P11-038）。
- **BET専用2枚の manualEffects 上書き**（`d2a5fffe`）: WX22-016(CHOOSE)/WD21-007
  (GRANT_QUOTED_AUTO_ABILITY) を再生成時の BET_MECHANIC 上書きから保護。
- **import漏れ修正**（`2ca2b60a`）: parseSentencePart2 に `EffectDuration` を追加（CI検出）。

### 2. 【起】ダウン/手札捨てコストの支払い可否判定（`c56f7275`）
- WX01-072 等の《ダウン》起動効果が、対象シグニが既にダウン済みでも再発動できたバグを修正。
- `BattleScreen.tsx` の activatable フィルタに `down_self`(既ダウン)/`discard`(手札不足) を追加、
  `executeSigniActivated` 冒頭にも多重発動防止ガード。

### 3. 「対戦相手のアタックフェイズ開始時」の系統修正（`b7e3abdc` `f8421754` `13d41d0b`）★本ラウンドの主目的
**根本原因**: パーサーが「あなた/対戦相手/各アタックフェイズ開始時」を無差別に timing `['ATTACK']`
へ潰し owner情報を喪失。さらに `'ATTACK'` は AUTO トリガーとしてディスパッチされない
（エンジンは `collectTurnTriggers` で `ON_ATTACK_PHASE_START` のみ照合。`'ATTACK'` は
「アタックフェイズ中使用可」の多義語）。→ 該当AUTO効果は**全く発火していなかった**。

修正内容:
- **パーサー**（`effectParser.ts`）: 「アタックフェイズ開始時」→ `ON_ATTACK_PHASE_START`
  + `triggerScope`（対戦相手の=`any_opp` / 各=`any` / あなたの=`self`）。トリガー文除去regexも
  owner接頭辞対応。
- **FORCE_SIGNI_ATTACK に `infectedOnly` 追加**（`types/effects.ts` / parser / `effectExecutor.ts`）。
  `PlayerState.must_attack_infected_only` 追加（`types/index.ts`）。
- **強制アタックの実強制化**（`BattleScreen.tsx`）: `must_attack_signi` のとき、強制対象シグニ
  （感染限定時は `signi_virus[zone]>0` の感染シグニのみ）がアタック=ダウンするまで ATTACK_SIGNI
  から進めない。進もうとすると警告ポップアップ（`showMustAttackWarning`）。アタック可否は
  `getMySigniZoneActions` のアタックボタン有無で判定しソフトロック防止。ターン遷移3箇所で
  両フラグreset。
- **データ修正 22枚（24効果）**: timing+triggerScope を修正。any_opp は `collectTurnTriggers` の
  opState走査（scope any_opp/any）経路で相手アタック開始時に発火。WX16-047(infectedOnly)含む。
  - 対象: SPDi43-24(self), WX12-002, WX12-017, WX13-056, WX21-012(E1=self/E2=any_opp),
    WXEX1-13, WXK06-043, WD22-035-G, WDK09-001, WDK09-011, WDK17-012, WXDi-P03-036,
    WXDi-P03-037, WXDi-P04-041, WXDi-P05-033, WXDi-P06-047, WXDi-P08-049, WXDi-P08-053,
    WXDi-P10-039, WXDi-P13-044, WX24-P1-041, WX24-P3-049, WX16-047
  - アクション内の `CONDITIONAL{IS_MY_TURN}` は「そうした場合（任意ステップ実行時）」の
    プレースホルダーで executor が専用処理するため、相手ターン中でも正常動作する（確認済み）。

---

## ⏳ 残作業（→ zerom側）

### A. WXDi-P07-073「羅原 In」アクション再モデル【dormant維持中】
- テキスト: 「対戦相手のアタックフェイズ開始時、ターン終了時まで、あなたのセンタールリグは
  『【自】：対戦相手のターン終了時、あなたのすべてのシグニをバニッシュする。』を得る。」
- 現状JSON: `BANISH owner:opponent count:ALL`（**owner反転＋遅延→即時化**の誤model）。
  発火させると害になるため timing は `['ATTACK']` のまま（未発火＝dormant）に**意図的に据え置き**。
- 正しい実装: ルリグへ「対戦相手ターン終了時に**自分の**全シグニをバニッシュ」する遅延能力を付与
  （GRANT_LRIG_ABILITY または granted_effects 経由の ON_TURN_END 効果）。timing を
  `ON_ATTACK_PHASE_START`/`any_opp` に直すのは**アクション修正後**に行うこと。

### B. WXK07-043「羅菌 マグネ」アクション再モデル【dormant維持中】
- テキスト: 「対戦相手のアタックフェイズ開始時、このシグニに【チャーム】が付いている場合、
  ターン終了時まで、このシグニは『【常】：バニッシュされない。』を得る。」
- 現状JSON: `GRANT_KEYWORD self keyword:"チャーム"`（**付与キーワードが誤り**）。dormant 据え置き。
- 正しい実装: チャーム付随を条件（activeCondition/condition）に、自身へ**バニッシュ耐性**
  （エンジンは `バニッシュされない`→`バニッシュ不可` / `GRANT_PROTECTION from:['BANISH']` 系で処理）
  を UNTIL_END_OF_TURN 付与。修正後に timing を `ON_ATTACK_PHASE_START`/`any_opp` へ。

### C.（任意）他カードへの横展開
- パーサー修正により「あなたのアタックフェイズ開始時」(self=407) など多数が
  ON_ATTACK_PHASE_START 出力になるが、**全再生成は禁止**（約90枚退化）。
  データは個別に timing/triggerScope を直すこと（本ラウンドは「対戦相手の」系32枚を対象に実施）。

---

## ⚠ 注意事項
- `public/data/effects_WXDi.json` と `effects_WX24_26.json` は **2スペース整形(pretty-print)・
  末尾改行なし**。他3ファイル（misc/WX/WXK）はミニファイ。スクリプトで書き換える際は
  この2ファイルのみ `JSON.stringify(j, null, 2)`（末尾改行なし）で出力すること。
  `JSON.stringify(j)` でミニファイ化すると約13万行の巨大diffになりマージ衝突を招く。
- **全再生成は禁止**（実測で約90枚退化）。`build:effects` は走らせない。
- typecheck は `npx tsc --noEmit -p tsconfig.json; echo "exit: $?"` で**素の終了コード**を確認すること
  （grep/`echo "done"` 固定文字列でフィルタするとエラーを見落とす）。

## 参考ファイル
| ファイル | 役割 |
|---------|------|
| `src/data/effectParser.ts` | アタックフェイズ開始時 timing/triggerScope 区別、IS_MY_TURNプレースホルダー生成 |
| `src/data/parsers/parseSentencePart1.ts` | FORCE_SIGNI_ATTACK(infectedOnly)、複合キーワード付与 |
| `src/data/parsers/parseSentencePart2.ts` | 引用ネストのシャドウ平坦化、EffectDuration import |
| `src/engine/effectExecutor.ts` | `execForceSigniAttack`(infectedOnly)、IS_MY_TURNプレースホルダー処理 |
| `src/screens/BattleScreen.tsx` | 強制アタック実強制化（`mustAttackRemainingZones`/`showMustAttackWarning`）、【起】コスト判定 |
| `src/types/effects.ts` | `ForceSigniAttackAction.infectedOnly` |
| `src/types/index.ts` | `PlayerState.must_attack_infected_only` |
| `public/data/effects_*.json` | 対戦相手アタックフェイズ開始時22枚の timing/triggerScope |

## デプロイ
`vercel deploy --prod` は zerom 側で実施（ymsty 側に権限なし）。
