# 段2 第12バッチ報告：対象限定アサシン

## 1. 触ったファイル

- `src/utils/keywords.ts`：scope parser/encoderと `powerGte`・`levelLte` の型・実判定。
- `src/data/effectParser.ts`：通常カード、アーツ、スペルでstrip前にscopeを符号化。
- `scripts/goldenTest.ts`：3軸の成立・不成立・plain対照を実consumer経由で固定。
- `public/data/effects_WX24_26.json` / `effects_misc.json`：fresh 9枚をheld採用し、MANUAL/PARTIAL 3枚を `syncManualLive.ts` で同期。
- `docs/decompile_sheet9.txt` / `decompile_sheet10.txt` と下流生成物：`npm run regen`。
- `docs/BUGFIXES.md`：一次記録。

PLAN/PLAN_PROGRESS、ランサー、開始時から変更済みの `scripts/archive/.../stage3_recluster.{json,txt}` は触っていない。

## 2. Claude見立ての検証

- regex母集団14カードは再現。ただし開始時liveは **plain 12、scope付き1（WX25-P2-084）、Assassin効果なし1（WX25-P1-111）**。よって「14/14脱落」は誤りで実脱落は12/14。
- `AssassinScope`、encode/decode、`hasApplicableAssassin`、攻撃側の消費地点は実在。編集前の主要行は82/96/112、Shadow parser 202・encoder 237、通常カード呼出し15790で概ねメモどおり。
- `powerGte` / `levelLte` は型・consumerとも不存在だったため両方へ追加。power/level取得不能は不成立。
- 通常カード15790だけではアーツとスペルを通らないため `parseArtsEffect` / `parseSpellEffect` にも追加。Burst母集団は0件なので `parseBurstEffect` は変更なし。
- 注釈内も一度符号化されるが外側のルール注釈括弧は残り、後続stripが全体を除去する。二重付与0。
- Shadowの宣言/parser/encoder/consumer変更0。Shadow名を含む追加削除行0（既存呼出しへAssassinを外側合成した1行を除く）。

## 3. A群14カード（per-effect）

| CardNum / effectId | CSV括弧内 | scope JSON | どう読んだか | 逆翻訳全体 |
|---|---|---|---|---|
| WX25-P1-044-E1 | パワー10000以下のシグニ | `{"powerLte":10000}` | 正面powerの上限10000。注釈側は除去。 | 一致 |
| WX25-P1-059-E2 | パワー12000以上のシグニ | `{"powerGte":12000}` | 「以上」を下限12000として保持。 | 一致 |
| WX25-P1-062-E1 | パワー12000以下のシグニ | `{"powerLte":12000}` | 正面powerの上限12000。 | 一致（同期で欠けていたアーツ使用条件も復元） |
| WX25-P1-100-E1 | パワー3000以下のシグニ | `{"powerLte":3000}` | 境界3000を含む上限。 | 一致 |
| WX25-P1-105-E1 | パワー5000以下のシグニ | `{"powerLte":5000}` | 境界5000を含む上限。 | 一致 |
| WX25-P1-111-E1 | パワー8000以下のシグニ | `{"powerLte":8000}`（意図値・未到達） | 上限8000だが「Aか引用能力を得る」をparserが構成不能。 | **不一致・未修正** |
| WX25-P2-022-E1 | 凍結状態のシグニ | `{"isFrozen":true}` | power条件なし、凍結だけ。 | **条件一致。既存target ownerは不一致** |
| WX25-P2-039-E1 | 凍結状態のパワー12000以下のシグニ | `{"isFrozen":true,"powerLte":12000}` | 凍結かつpower上限のAND。 | 一致 |
| WX25-P2-062-E1 | パワー5000以下のシグニ | `{"powerLte":5000}` | 正面power上限5000。 | 一致 |
| WX25-P2-084-E1 | 凍結状態のパワー3000以下のシグニ | `{"isFrozen":true,"powerLte":3000}` | 2条件のAND。開始時からmanual/liveとも正しい。 | 一致 |
| WX25-P2-089-E1 | 凍結状態のパワー8000以下のシグニ | `{"isFrozen":true,"powerLte":8000}` | 2条件のAND。スペル経路も符号化。 | 一致 |
| WX25-P3-059-E1 | 凍結状態のパワー8000以下のシグニ | `{"isFrozen":true,"powerLte":8000}` | ORにせず2条件のAND。 | **条件一致。既存target ownerは不一致** |
| WX25-CP1-090-E1 | パワー5000以下のシグニ | `{"powerLte":5000}` | 正面power上限5000。 | 一致 |
| SPDi43-06-E2 | レベル２以下のシグニ | `{"levelLte":2}` | 全角2を数値化しlevel 2を含む上限。 | 一致 |

live変化は12 effects。兄弟effect変化0。WX25-P2-084は開始時から正しく変化0、WX25-P1-111は別parser不足で変化0。

## 4. B群ランサー（調査のみ）

必要な面：①`keywords.ts` の `LancerScope`、encode/decode、scope text parser/encoder、正面を評価する `hasApplicableLancer`、②`effectParser.ts` の `parseArtsEffect` / `parseSpellEffect` / 通常カード分岐（母集団次第でBurstも）のstrip前処理、③`getSigniAttackKeywordState` の `isLancer: has('ランサー')` をconsumerへ置換しdefender/cardMap/effectivePowersを渡す、④`BattleScreen` の `isLancer` / `isSLancer` ライフクラッシュ・damage prevention分岐。能力喪失は `isKeywordAbilityRemoved` / `normalizeKeywordName` のprefix契約を維持し、正負E2Eが要る。今回は実装0。

## 5. 条件以外で見つけた食い違い

- `hasApplicableAssassin` は `opponentState.field.signi.some` で全相手シグニを走査し、正面以外の一致でもtrueになる疑い。指定どおり未修正。
- WX25-P1-111-E1は付与二択が落ち、引用側power低下だけに化けている。
- WX25-P2-022-E1 / WX25-P3-059-E1は原文「あなたのシグニ1体」に対し逆翻訳が自分または相手。P2-022-E2も原文ワンサイドと不一致。いずれも未修正。

## 6. ゲート before / after

| 計器 | before | after |
|---|---:|---:|
| golden | 2355/0 | 2356/0 |
| census | 742/742 | 742/742 |
| smoke | 10693・異常0・SKIP0 | 同左 |
| fuzz | 全0 | 全0 |
| census:stubs | A0/C0 | A0/C0 |
| manual-fields | 0 | 0 |
| lint | 0 errors/260 warnings | 同左 |
| groupSimilar --all | 同型★0 | 同型★0 |
| held/partial/idset | 92/15/46 | 92/15/46 |
| live効果総数 | 10693 | 10693 |

`npm run regen` 実行済み、最終 `npm run gates` 全緑。

## 7. 生パースdiff

変化集合12：`WX25-P1-044-E1`, `WX25-P1-059-E2`, `WX25-P1-062-E1`, `WX25-P1-100-E1`, `WX25-P1-105-E1`, `WX25-P2-022-E1`, `WX25-P2-039-E1`, `WX25-P2-062-E1`, `WX25-P2-089-E1`, `WX25-P3-059-E1`, `WX25-CP1-090-E1`, `SPDi43-06-E2`。兄弟effect outlier 0。P1-062の条件復元は同effect内の原文適合改善。

## 8. バケット・lint

held `92→92`、partial `15→15`、idset `46→46`。一時生成で対象9枚がheldへ出たため各CSVを照合して `--adopt`、再build後に基準へ復帰。lint `260→260`。

## 9. やらなかったこと

- ランサーscope、Assassin正面限定、WX25-P1-111付与二択parser、WX25-P2-022/P3-059 target owner、P2-022-E2は未修正。
- BurstText対象0のためBurst parser、Shadow機構は未変更。
- PLAN/PLAN_PROGRESS、commit、pushは未実施。
- **今より悪くなった効果：0。** 未修正不一致は上記に明示。

---

## 【Claude 検証節】2026-08-22 続き604

**結論＝採用。** ゲート全緑・live 変化は申告どおり **12効果ちょうど**・スコープ値は 12/12 が CSV 原文と一致。

### 独立実行した検証

| 項目 | 結果 |
|---|---|
| `npm run gates` | 全緑（golden **2356/0**・census **742/742**・smoke 10693 全異常0 SKIP0・fuzz 全0・stubs A🔴0 C0・manual-fields 0・lint **0 errors 260 warnings**） |
| `groupSimilar --all` | 同型★ **0** |
| live 機械 diff（ベースライン `7ee58bbf9` と全 JSON 比較） | 変化 **12効果**＝申告と完全一致。兄弟効果の巻き込み0 |
| スコープ値の原文照合（12件全数） | **12/12 一致**。`以上`→`powerGte`（`WX25-P1-059`）・全角`２`→`levelLte:2`（`SPDi43-06`）も正しい |
| §5-14（死にフラグ検査） | `powerGte`／`levelLte` とも **型（`AssassinScope`）と判定（`hasApplicableAssassin:138-142`）の両方**に存在 |
| §5-22（既存不変） | `parseShadowScopeText`／`encodeShadowScopesInText`／`decodeShadowKeyword` は **diff ハンク0**。シャドウ挙動は不変 |
| §5-19 エンコーディング | 全変更ファイルで BOM(`efbbbf`) 0／U+FFFD 0。`???` は `BUGFIXES.md` に26件あるがベースラインと**同数**＝新規増0 |
| golden の質 | `hasApplicableAssassin` を**実際に通す**両方向＋**§5-21 の対照**（同じ盤面で plain アサシンなら成立）を3軸すべてに配置＝要件を満たす |

### Codex が Claude の見立てを正した点（正しい訂正）

- 実脱落は **12/14**。`WX25-P2-084-E1` は**開始時から scope 付きで正しかった**（Claude の計測 regex が
  `"keyword":"アサシン"` の完全一致だったため「?」に落ちていた＝**計測側の誤り**）。
- `effectParser.ts:15790` **だけではアーツとスペルを通らない**＝`parseArtsEffect`／`parseSpellEffect` にも配線が要る。
  （`WX25-P2-089` がスペル経路）。Burst 母集団は0件なので `parseBurstEffect` は据置＝妥当。

### 🔴 申告漏れ（1件）＝`parseStatus` の遷移3件が報告に無い

live で **`parseStatus` が3件変わっている**のに、報告§3 も §9 も触れていない：

| effectId | 遷移 | 中身 |
|---|---|---|
| `WX25-P1-044-E1` | **PARTIAL → AUTO** | keyword に scope が付いた以外は差分なし＝**改善** |
| `WX25-P2-039-E1` | **PARTIAL → AUTO** | 同上＝**改善** |
| `WX25-P1-062-E1` | **MANUAL → AUTO** | scope 付与に加えて `duration` **PERMANENT→UNTIL_END_OF_TURN**・`filter.thisCardOnly` **追加**＝原文「ターン終了時まで、**この**シグニは〜」に3軸とも合致＝**改善** |

いずれも**改善方向で退化なし**。3件とも `manualEffects.ts` に実体が無い**live だけの刻印**（§6.4 `O-42` 族）で、
parser 出力に置き換わったもの。⚠ただし報告§1 の「MANUAL/PARTIAL 3枚を `syncManualLive.ts` で同期」は**不正確**
（`manualEffects.ts` は diff 0＝実際には `heldReview --adopt` で fresh に載り替わった）。
**「per-effect で報告する」（§5-12）は守られたが、「同じ効果の別軸が動いた」ことは今回も落ちた**＝続き603 と同じ弱点。

### 未修正として明示された不一致（妥当・次の題材）

`WX25-P1-111-E1`（付与二択が parser で構成不能）／`WX25-P2-022-E1`・`WX25-P3-059-E1` の target owner ／
`hasApplicableAssassin` が**正面ではなく相手の場を全走査**する疑い。**いずれも指示どおり未修正で報告済み**。
⚠全走査は**このバッチで悪化していない**（従来は plain＝常時 true だったので、scope 付与は厳密に改善側）。

### 台帳

閉じたのは **finding 単位で5本**（`WX25-P1-044-E1` / `WX25-P1-059-E2` / `WX25-P2-039-E1` /
`WX25-P2-089-E1` / `WX25-CP1-090-E1`）。⚠§5-3-4′ に従い、`WX25-P1-044-E1` の
「公開枚数が任意（1枚まで）」という**別軸の finding は閉じていない**。
残り7効果は findings に無い＝CSV × live の全数走査で新規に見つけた分。
残 OPEN **980→975**／段2 消化 **107→112**。
