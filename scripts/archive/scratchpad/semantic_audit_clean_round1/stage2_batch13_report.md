# 段2 第13バッチ報告：対象限定ランサー

## 1. 触ったファイル

- `src/utils/keywords.ts`：LancerScope の encode/decode/原文解析と、倒した相手の実効パワーに対する純判定を新設。旧手修正 `ランサー:N` も互換読取。
- `src/data/effectParser.ts`：stripRuleParens 前の符号化をシグニ・アーツ・スペル・SONG の全入口へ配線。WX25-CP1-081-E1 の脱落だけ対象限定で復旧。
- `src/screens/battle/signiAttackKeywords.ts`：boolean に潰さず lancerKeywords をアタック解決へ運ぶ。
- `src/screens/BattleScreen.tsx`：バニッシュ確定後、倒した相手の実効パワーで `hasApplicableLancer` を評価してからクラッシュ。
- `src/components/BoardComponents.tsx`：スコープ付き付与でも「槍」バッジを表示。
- `src/engine/boardDiff.ts`：スコープ付き付与も `ON_KEYWORD_GAINED` の plain ランサーとして検出。
- `scripts/decompileEffects.ts`：JSON/旧数値の両形式を括弧付きランサーへ逆翻訳。
- `scripts/goldenTest.ts`：5000成立／6000不成立／同盤面の無条件成立、全角数字符号化、既存SONG分離トリップワイヤを更新。
- `public/data/effects_WX24_26.json`：採用した11 live effect のスコープを反映（旧MANUAL 2 effect はデータ不変）。
- `docs/_effect_srctext.json`, `_held_review.txt`, `_vocab_census.txt`, `decompile_sheet9.txt`, `decompile_sheet10.txt`, `grouped_sentence_all.txt`：build/regen の正規生成物。

## 2. Claude の見立ての検証

- 母集団12カードは一致。ただし「live 10効果、3カードは該当効果なし」は不一致。母集団スクリプトが `"keyword":"ランサー"` の完全一致だけを数え、WX26-CP1-088-E1=`ランサー:5000` と WX26-CP1-091-E1=`ランサー:8000` の既存MANUALを見逃していた。実在は13 effect（WX26-CP1-084が2本）。本当に付与が落ちていたのは WX25-CP1-081-E1 だけ。
- `hasKeyword` のプレフィックス照合、BattleScreen の boolean 消費、評価対象が倒した相手である点は一致。
- parser 入口は見立ての15790付近だけではない。実コードでは `parseArtsEffect`、`parseSpellEffect`、通常ブロック、SONG の4入口。全て strip 前へ配線した。
- BoardComponents は配列の完全一致だったため「無傷」ではなく、バッジが消える退化を防ぐ修正が必要だった。
- boardDiff も完全一致だったため修正が必要だった。
- effectEngine の SELF_HAS_KEYWORD は `hasKeyword` 経由で無傷。execStubPart1/2 の knownKeywords は原文抽出側で今回の生成値を作らず無傷。choiceTextParser/execStub の無条件付与経路は変更なし。
- signiAttackKeywords は `has('ランサー')` を維持しつつ一覧を追加。BattleScreen で `hasApplicableLancer(lancerKeywords, opPower)` を呼ぶ。
- アサシン／シャドウ既存関数は行変更0。`git diff -- src/utils/keywords.ts` でも既存 `encodeAssassinScopesInText` の直後への追記のみ。

## 3. A群（per-effect）

共通消費経路は `getSigniAttackKeywordState` → `hasApplicableLancer` → BattleScreen の `crashOneLife`。付与発火は timing ごとに `collectPlacedSelfOnPlayTriggers`（ON_PLAY）、`collectAttackerSelfTriggers`（ON_ATTACK_SIGNI）、`collectTurnTriggers`（ON_ATTACK_PHASE_START）、`execUseSongFragment` 系（SONG_ICON）、起動能力実行経路（ACTIVATED）。

- WX24-P1-072 / WX24-P1-072-E1 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / 5000以下を上限と読んだ / ON_PLAY → 共通消費 / 逆翻訳の制限節一致、全体一致。
- WX24-P3-085 / WX24-P3-085-E1 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / マジックボックスがLBを持つ場合に得るランサーの対象上限 / ON_ATTACK_SIGNI → 共通消費 / 制限節一致。全体は既存 parser がLBなし分岐を正確に二分できておらず不一致（今回非改変）。
- WX24-P4-079 / WX24-P4-079-E2 / `パワー10000以下のシグニ` / `{"powerLte":10000}` / 10000を境界込み上限 / ON_PLAY → 共通消費 / 制限節・全体一致。
- WX25-P1-088 / WX25-P1-088-E2 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / 5000を境界込み上限 / ON_PLAY → 共通消費 / 制限節一致。E1の「共通クラスを持たない」条件は既存欠落のためカード全体は不一致。
- WX25-P3-094 / WX25-P3-094-E1 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / 龍獣を払った場合の対象上限 / ON_ATTACK_PHASE_START → 共通消費 / 制限節・全体一致。
- WX25-CP1-076 / WX25-CP1-076-E1 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / 5000を境界込み上限 / ON_PLAY → 共通消費 / 制限節・全体一致。
- WX25-CP1-079 / WX25-CP1-079-E1 / `パワー8000以下のシグニ` / `{"powerLte":8000}` / 8000を境界込み上限 / ON_ATTACK_PHASE_START → 共通消費 / 制限節一致。併記された引用常時能力が既存欠落のため全体不一致。
- WX25-CP1-081 / WX25-CP1-081-E1 / `パワー10000以下のシグニ` / `{"powerLte":10000}` / 2枚支払い成功後だけ10000以下へ適用 / ON_ATTACK_PHASE_START → `PAID_ADDITIONAL_COST` → 共通消費 / 制限節一致。併記された「バトルしたシグニは能力を失う」が既存欠落のため全体不一致。
- WX26-CP1-084 / WX26-CP1-084-E1 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / 通常【自】節は他のプリオケへ5000制限 / ON_ATTACK_PHASE_START → 共通消費 / 制限節・全体一致。
- WX26-CP1-084 / WX26-CP1-084-SONG / `パワー10000以下のシグニ` / `{"powerLte":10000}` / 【歌のカケラ】節は選んだ自シグニへ10000制限 / SONG_ICON → 共通消費 / 制限節・全体一致。
- WX26-CP1-088 / WX26-CP1-088-E1 / `パワー5000以下のシグニ` / 旧表現 `ランサー:5000` を decode 後 `{"powerLte":5000}` / 5000を境界込み上限 / ACTIVATED → 共通消費 / 逆翻訳・全体一致。
- WX26-CP1-091 / WX26-CP1-091-E1 / `パワー8000以下のシグニ` / 旧表現 `ランサー:8000` を decode 後 `{"powerLte":8000}` / 8000を境界込み上限 / ACTIVATED → 共通消費 / 逆翻訳・全体一致。
- WX24-D4-15 / WX24-D4-15-E1 / `パワー5000以下のシグニ` / `{"powerLte":5000}` / 5000を境界込み上限 / ON_PLAY → 共通消費 / 制限節・全体一致。

## 4. B群

全CSVを `【(Ｓ|S)ランサー（…）】` で走査し、括弧付きSランサーは **0件**。実装変更なし。

## 5. 条件以外の原文差

4 effectで既存差を確認：WX24-P3-085-E1のLBなし分岐、WX25-P1-088-E1の共通クラス条件、WX25-CP1-079-E1の引用常時能力、WX25-CP1-081-E1の引用自動能力。ランサー制限以外はスコープ外として変更しなかった。

## 6. ゲート before / after

- golden: 2356/0 → **2358/0**。
- census: 742/742 → **742/742**。
- smoke: 10693、異常0、SKIP0 → **10693、異常0、SKIP0**。
- fuzz: 全0 → **全0**。
- census:stubs: A群0/C群0 → **0/0**。
- check:manual-fields: 0 → **0**。
- lint: 0 errors / 260 warnings → **0 / 260**。
- groupSimilar --all: 同型★0 → **0**。
- held/partial/idset: 92/15/46 → **92/15/46**（最初のbuildでは対象9カードがheldへ出たが原文照合後に採用し最終値不変）。
- live効果総数: 10693 → **10693**。

## 7. 生パース diff と outlier

変化集合は scoped keyword への値変更10 effect（WX24-D4-15-E1、WX24-P1-072-E1、WX24-P3-085-E1、WX24-P4-079-E2、WX25-P1-088-E2、WX25-P3-094-E1、WX25-CP1-076-E1、WX25-CP1-079-E1、WX26-CP1-084-E1/SONG）＋付与脱落復旧1 effect（WX25-CP1-081-E1）。旧MANUAL 2 effectは生JSON不変でdecodeのみ変更。対象外 effect の変化0、outlier 0。

## 8. held / partial / idset と lint

最終 92 / 15 / 46で基準から増減0。増減申告対象なし。lint warning 260で増減0。

## 9. やらなかったこと

- B群Sランサーは0件確認だけで未実装。
- PLAN.md / PLAN_PROGRESS.md は未編集。commit/pushなし。force-adopt/isPureSuperset変更なし。
- 上記4 effectのランサー制限以外の既存差は修正していない。
- WX26-CP1-088/091 の旧MANUAL文字列は live JSONを書き換えず、互換decoderで正しい `powerLte` として消費する。逆翻訳も同じ意味を表示する。
- 今より悪くなった効果は0件。無条件ランサー、Sランサー、SELF_HAS_KEYWORD、盤面バッジ、ON_KEYWORD_GAINEDの正方向を維持した。

---

## 【Claude 検証節】2026-08-22 続き605

**結論＝採用。** ゲート全緑・live 変化 **11効果ちょうど**・スコープ値は 13/13（新規11＋旧 MANUAL 2）が CSV 原文と一致。
**3バッチ中で最も配線が広いのに、申告と実体のズレが0だった。**

### 独立実行した検証

| 項目 | 結果 |
|---|---|
| `npm run gates` | 全緑（golden **2358/0**・census **742/742**・smoke 10693 全異常0 SKIP0・fuzz 全0・stubs A🔴0 C0・manual-fields 0・lint **0 errors 260 warnings**） |
| `groupSimilar --all` | 同型★ **0** |
| live 機械 diff（ベースライン `6553548a3`） | 変化 **11効果**＝申告と完全一致。新規/削除0・兄弟効果の巻き込み0 |
| スコープ値の原文照合 | **13/13 一致**（新規 scoped 11 ＋ 旧 MANUAL 2 は `ランサー:5000`／`ランサー:8000` のまま互換 decode） |
| held カード集合の diff | `_held_review.txt` の**カード集合は不変**（枚数だけでなく集合で照合） |
| §5-19 エンコーディング | 全変更ファイルで BOM(`efbbbf`) 0／U+FFFD 0 |
| §5-22（既存不変） | `keywords.ts` の diff は **`encodeAssassinScopesInText` の直後への純追記のみ**＝アサシン／シャドウの既存関数は行変更0 |

### 🔴 Claude が最も心配した「過小実行への裏返り」を実測で潰した

`hasApplicableLancer([], p)` は **false** を返すので、**`isLancer` が true なのに `lancerKeywords` が空**になる
経路が1本でもあれば、**無条件ランサーが丸ごと不発（過剰実行→恒久 no-op）**へ裏返る。
`isLancer` は `hasKeyword`（印字 CONTINUOUS・`keyword_grants`・`extraGrants`・`fieldKeywords`・`continuous`）を見るのに対し、
`lancerKeywords` は `attackKeywords` 集合から作られるため、**同じ集合から出ている保証をコードの目視で確認しただけでは足りない**。

⇒ **実測した**（`tmp_b13_probe.ts`）：
- 原文に「ランサー」を含む**シグニ101枚**すべてについて `getSigniAttackKeywordState` を実行し、
  **`isLancer=true` かつ `lancerKeywords` が空 のカードは 0枚**。
- 付与経路も3形式（`ランサー` / `ランサー:{"powerLte":5000}` / 旧 `ランサー:5000`）すべてで
  `isLancer=true` かつ `lancerKeywords` が非空。

⇒ **過小実行への裏返りは無い。** ⚠この整合は**暗黙の不変条件**なので、
`attackKeywords` の作り方か `hasKeyword` の走査軸を将来変えると**静かに壊れる**。
`lancerKeywords` を足す側と `isLancer` を出す側は**同じ集合から作り続けること**。

### Codex が Claude の見立てを正した点（すべて正しい訂正・3件）

1. **母集団の実体は 13効果**（10 ではない）＝`WX26-CP1-088-E1`／`WX26-CP1-091-E1` は
   **旧形式 `ランサー:5000` / `ランサー:8000` の MANUAL が既にあった**（Claude の計測 regex が
   `"keyword":"ランサー"` の完全一致だったため見落とし＝**続き604 と同じ計測ミスを2回続けた**）。
   本当に付与ごと落ちていたのは **`WX25-CP1-081-E1` の1件だけ**だった。
2. **parser 入口は4つ**＝通常ブロック・`parseArtsEffect`・`parseSpellEffect`・**SONG**（Claude は「15790 付近」としか書けていなかった）。
3. **`BoardComponents.tsx` と `boardDiff.ts` は「無傷のはず」ではなく実際に修正が要った**
   （どちらも完全一致比較＝前者は**盤面バッジが消える退化**、後者は**`ON_KEYWORD_GAINED` が誘発しなくなる過小実行**）。
   Claude は表で「確認」としか書いておらず、**必要な修正2件を見落としていた**。

### 妥当な残置

- `WX26-CP1-088-E1`／`WX26-CP1-091-E1` は **live を書き換えず旧形式のまま**、decoder 側で吸収。
  ⚠**同じ意味に2表現がある状態**なので、いずれ正準形へ寄せるのが望ましい（今回の判断自体は
  「MANUAL は parser から届かない」ため妥当）。
- 条件以外の食い違い4件（`WX24-P3-085-E1` の LB なし分岐／`WX25-P1-088-E1` の共通クラス条件／
  `WX25-CP1-079-E1`・`WX25-CP1-081-E1` の引用能力）は**スコープ外として未修正・報告済み**。

### 台帳

閉じたのは **finding 単位で5本**（`WX24-P1-072-E1` / `WX24-P4-079-E2` / `WX25-P1-088-E2` /
`WX25-CP1-076-E1` / `WX24-D4-15-E1`）。残り6効果は findings に無い＝CSV × live の全数走査で新規に見つけた分。
残 OPEN **975→970**／段2 消化 **112→117**。
