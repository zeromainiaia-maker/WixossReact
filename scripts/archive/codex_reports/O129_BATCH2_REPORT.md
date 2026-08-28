# O-129 第2バッチ 作業報告（2026-08-28）

## 1. 触ったファイルと理由

- `src/data/effectParser.ts` — `orderObservable` から条件③だけを外し、盤外由来の中間動作を対象化した。前置条件がある文型は、原文順を守るため対象宣言から帰結までを条件内へ入れる一般分岐を追加した。
- `src/data/manualEffects.ts` — live が MANUAL の `WX04-073-E1` / `WX06-014-E2` を完全置換し、既存限定とトップレベルフィールドを保ったまま対象宣言・保存・候補0打ち切り・帰結束縛を追加した。
- `scripts/goldenTest.ts` — A/B両群の候補あり・候補0・修正前木の対照、C群の条件順、D群の完全フィールドを固定した。新しい対象宣言が先行するため、既存の「段2 第38バッチ」テストだけは最初の対象選択を明示的に処理するよう追随させた。
- `public/data/effects_WX.json` / `effects_WXDi.json` / `effects_WX24_26.json` / `effects_WXK.json` / `effects_misc.json` — reviewed fresh の採用と MANUAL 同期による live 18効果の更新。
- `docs/decompile_sheet1.txt` / `sheet3.txt` / `sheet6.txt` / `sheet7.txt` / `sheet8.txt` / `sheet9.txt` / `sheet10.txt` — `npm run regen` による対象効果の逆翻訳更新。
- `docs/_review_repr.txt` / `_vocab_census.txt` / `_census_stubs.txt` / `_held_review.txt` / `grouped_all.txt` / `grouped_sentence_all.txt` — build/regen/各計器の再生成結果。
- `docs/BUGFIXES.md` — 本バッチの修正、検証、未修正事項を先頭へ記録した。
- 本報告書 — 必須の全件照合と実測値を保存した。

`scripts/verifyBattleDrive.mjs` はブラウザ確認用シナリオを一度試作したが、ハーネス起動待ちで検証不能だったため全変更を戻した。`git diff` は0、作業ツリーの blob hash も HEAD と同一である。Gitのインデックス更新権限がないため `git status` の stat 表示だけ `M` が残る。

## 2. `abortIfNoCandidate` の実行経路調査

- `execSequence`（`src/engine/effectExecutor.ts:4304`）は各 step の実行直後、同ファイル `:5339-5348` で `SELECT_TARGET_ONLY` かつ `abortIfNoCandidate:true` かつ `lastProcessedCards.length===0` を検出し、残りの中間動作・帰結を実行せず `done(nextCtx)` を返す。
- `SELECT_TARGET_ONLY` の実体は `execStubPart1`（`src/engine/execStubPart1.ts:168-198`）。候補0の同期経路でも、候補選択UIを経由する非同期経路でも、選択結果を `lastProcessedCards` に渡す。
- UI選択後は `resumeSelectTarget`（`src/engine/effectExecutor.ts:9014`、継続再開は同 `:9190` 付近）が残りの `execSequence` を再開するため、同じ `:5339-5348` の打ち切り判定を通る。
- ACTIVATED の印刷コストは、場の【起】では `executeSigniActivated`（`src/screens/BattleScreen.tsx:13062`）、トラッシュ【起】では `executeTrashActivated`（同 `:13188`、`payTrashActivateCost` は `:13199`）が効果列の実行前に支払う。したがって候補0打ち切りは「効果本文の中間動作と帰結」を止め、適正に起動済みの印刷コストを巻き戻さない。`WXK05-024-E3` でも《青》《無》は従来どおり支払われ、本文の「このシグニをトラッシュから場に出す」動作だけが候補0時に止まる。
- `CONDITIONAL` が先頭の `WX25-P2-063-E2` は、対象宣言を平坦に先頭挿入すると条件不成立時にもUIが出て保存領域が汚れる。そこで原文上の「場合」が対象宣言より前、かつ木が `SEQUENCE[leading CONDITIONAL, did-it gate]` である一般形だけ、外側条件の `then` に対象宣言・中間動作・帰結をまとめた。条件不成立時は候補が存在しても `done`、トラッシュ／デッキ／`lastProcessedCards`／`storedTargetCards` は全て不変と golden で確認した。

結論：ACTIVATED、UI再開、先頭CONDITIONALの各形で本文列の打ち切りは機能する。印刷コストは支払い済みのままであり、これは起動コストの通常の扱いである。

## 3. 採用した効果の全件（18/18）

ステップ列では `SELECT` は `STUB{SELECT_TARGET_ONLY, abortIfNoCandidate:true}`、`STORE` は `STUB{STORE_LAST_PROCESSED_TARGETS}`、`stored` は帰結の `targetsStored:true` を表す。以下の逆翻訳文は `npm run regen` 後の全文である。

### A群（14効果）

1. **`WX06-001-E2`**
   - 原文：`【起】《ターン１回》《白×0》：対戦相手のシグニ１体を対象とし、あなたのトラッシュから＜天使＞のシグニ７枚をデッキの一番下に置く。そうした場合、それをバニッシュし、デッキをシャッフルする。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{self trash, 天使SIGNI, 7, bottom}, CONDITIONAL→SEQUENCE[BANISH{stored}, SHUFFLE_DECK{self}]]`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《白×0》〉対戦相手のシグニ1体を対象とする。そしてあなたの＜天使＞のシグニ(トラッシュ)7枚をデッキの一番下に置く。そうした場合、それをバニッシュする。そしてあなたのデッキをシャッフルする`
   - 一致：はい。対象宣言→支払い→束縛済み帰結の順で一致。

2. **`WX06-014-E2`**（MANUAL）
   - 原文：`【起】《ターン１回》エクシード１：対戦相手のシグニ１体を対象とし、あなたのトラッシュから《古代兵器》のシグニ５枚を好きな順番でデッキの一番下に置く。そうした場合、それをバニッシュする。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{self trash, SIGNI, story:古代兵器, 5, bottom}, CONDITIONAL→BANISH{stored}]`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈エクシード1〉対戦相手のシグニ1体を対象とする。そしてあなたの＜古代兵器＞のシグニ(トラッシュ)5枚をデッキの一番下に置く。そうした場合、それをバニッシュする`
   - 一致：はい。MANUALの `story:"古代兵器"`、exceed、usageLimit等を維持。

3. **`WXEX1-53-E2`**
   - 原文：`【出】《無》：対戦相手のレベル３以下のシグニ１体を対象とし、あなたのトラッシュから＜アーム＞のシグニ１枚と＜ウェポン＞のシグニ１枚をデッキに加えてシャッフルする。そうした場合、それを手札に戻す。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI level<=3}, STORE, TRANSFER_TO_DECK{trash groups:[アーム1,ウェポン1], shuffle}, CONDITIONAL{LAST_PROCESSED_COUNT_GTE:2}→RETURN_TO_HAND{stored}]`
   - 逆翻訳全文：`【自】このシグニが場に出たとき：〈《無×1》〉対戦相手のレベル3以下のシグニ1体を対象とする。そしてあなたの＜アーム＞のシグニ1枚と＜ウェポン＞のシグニ1枚(トラッシュ)をデッキに加えてシャッフルする。そしてこの方法でカードを2枚以上処理したなら、対戦相手のレベル3以下のシグニ1体を手札に戻す`
   - 一致：はい。「そうした場合」は2枚処理条件として表現され、帰結は保存対象へ束縛。

4. **`WXEX2-04-E2`**
   - 原文：`【起】《ターン１回》《白》：対戦相手のシグニ１体を対象とし、あなたのトラッシュから＜迷宮＞のシグニ１枚をデッキの一番下に置く。そうした場合、それをデッキの一番下に置く。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{self trash, 迷宮SIGNI, 1, bottom}, CONDITIONAL→TRANSFER_TO_DECK{stored, bottom}]`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《白×1》〉対戦相手のシグニ1体を対象とする。そしてあなたの＜迷宮＞のシグニ(トラッシュ)1枚をデッキの一番下に置く。そうした場合、対戦相手のシグニ1体をデッキの一番下に置く`
   - 一致：はい。

5. **`WXEX2-31-E3`**
   - 原文：`【起】《ダウン》：対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれレベルの異なる＜天使＞のシグニ４枚をデッキに加えてシャッフルする。そうした場合、それを手札に戻す。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{self trash, 天使SIGNI, 4, distinctLevel, shuffle}, CONDITIONAL→RETURN_TO_HAND{stored}]`
   - 逆翻訳全文：`【起】（メイン起動）：〈《ダウン》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれレベルの異なる＜天使＞のシグニ(トラッシュ)4枚をデッキに加えてシャッフルする。そうした場合、対戦相手のシグニ1体を手札に戻す`
   - 一致：はい。

6. **`PR-322-E1`**
   - 原文：`【起】《ターン１回》《黒×0》：対戦相手のシグニ１体を対象とし、あなたのトラッシュから黒の＜天使＞のシグニ１枚と黒の＜古代兵器＞のシグニ１枚を好きな順番でデッキの一番下に置く。そうした場合、それをトラッシュに置く。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash groups:[黒天使1,黒古代兵器1], bottom}, CONDITIONAL{LAST_PROCESSED_COUNT_GTE:2}→TRASH{stored}]`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《黒×0》〉対戦相手のシグニ1体を対象とする。そしてあなたの《黒》の＜天使＞のシグニ1枚と《黒》の＜古代兵器＞のシグニ1枚(トラッシュ)をデッキの一番下に置く。そしてこの方法でカードを2枚以上処理したなら、対戦相手のシグニ1体をトラッシュに置く`
   - 一致：はい。

7. **`WXDi-P05-019-E2`**
   - 原文：`【出】《無》《無》：対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれ共通する色を持つカード１０枚をデッキに加えてシャッフルする。そうした場合、それをバニッシュする。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{self trash, sharedColor, 10, shuffle}, CONDITIONAL→BANISH{stored}]`
   - 逆翻訳全文：`【自】このシグニが場に出たとき：〈《無×1》《無×1》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれ共通する色を持つカード(トラッシュ)10枚をデッキに加えてシャッフルする。そうした場合、それをバニッシュする`
   - 一致：はい。

8. **`WXDi-P16-008-E3`**
   - 原文：`【起】《ゲーム１回》《白×0》：対戦相手のシグニ１体を対象とし、あなたのトラッシュから白のカード７枚をデッキに加えてシャッフルする。そうした場合、それをトラッシュに置く。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{self trash, white cards, 7, shuffle}, CONDITIONAL→TRASH{stored}]`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_game》〈《白×0》〉対戦相手のシグニ1体を対象とする。そしてあなたの《白》のカード(トラッシュ)7枚をデッキに加えてシャッフルする。そうした場合、対戦相手のシグニ1体をトラッシュに置く`
   - 一致：はい。

9. **`WX25-P1-014-E1`**
   - 原文：`【起】《ターン１回》《白》：対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれレベルの異なる＜天使＞のシグニ３枚を好きな順番でデッキの一番下に置く。そうした場合、それを手札に戻す。`
   - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash, 天使SIGNI, 3, distinctLevel, bottom}, CONDITIONAL→RETURN_TO_HAND{stored}]`
   - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《白×1》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれレベルの異なる＜天使＞のシグニ(トラッシュ)3枚をデッキの一番下に置く。そうした場合、対戦相手のシグニ1体を手札に戻す`
   - 一致：はい。

10. **`WX25-P1-030-E1`**
    - 原文：`【起】《ターン１回》《黒》：対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれレベルの異なる＜古代兵器＞のシグニ３枚を好きな順番でデッキの一番下に置く。そうした場合、それをバニッシュする。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash, 古代兵器SIGNI, 3, distinctLevel, bottom}, CONDITIONAL→BANISH{stored}]`
    - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《黒×1》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれレベルの異なる＜古代兵器＞のシグニ(トラッシュ)3枚をデッキの一番下に置く。そうした場合、それをバニッシュする`
    - 一致：はい。

11. **`SPDi44-12-E1`**
    - 原文：`【起】《ターン１回》《白》：対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれレベルの異なる＜天使＞のシグニ３枚を好きな順番でデッキの一番下に置く。そうした場合、それを手札に戻す。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash, 天使SIGNI, 3, distinctLevel, bottom}, CONDITIONAL→RETURN_TO_HAND{stored}]`
    - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《白×1》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれレベルの異なる＜天使＞のシグニ(トラッシュ)3枚をデッキの一番下に置く。そうした場合、対戦相手のシグニ1体を手札に戻す`
    - 一致：はい。

12. **`SPDi44-16-E1`**
    - 原文：`【起】《ターン１回》《黒》：対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれレベルの異なる＜古代兵器＞のシグニ３枚を好きな順番でデッキの一番下に置く。そうした場合、それをバニッシュする。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash, 古代兵器SIGNI, 3, distinctLevel, bottom}, CONDITIONAL→BANISH{stored}]`
    - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《黒×1》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれレベルの異なる＜古代兵器＞のシグニ(トラッシュ)3枚をデッキの一番下に置く。そうした場合、それをバニッシュする`
    - 一致：はい。

13. **`WXK05-024-E3`**（C群判断対象）
    - 原文：`【起】《青》《無》：対戦相手のシグニ１体を対象とし、あなたの手札が０枚の場合、このシグニをトラッシュから場に出す。そうした場合、それをトラッシュに置く。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, CONDITIONAL{HAND_COUNT self=0}→ADD_TO_FIELD{self trash,thisCardOnly}, CONDITIONAL→TRASH{stored}]`。トップレベル `cost.energy=[青1,無1]`、`trashActivated:true`。
    - 逆翻訳全文：`【起】（メイン起動）：〈《青×1》《無×1》〉対戦相手のシグニ1体を対象とする。そしてあなたの手札が0枚であるなら、このシグニをトラッシュから場に出す。そうした場合、対戦相手のシグニ1体をトラッシュに置く`
    - 一致：はい。原文が対象宣言→条件→中間動作なので先頭挿入が正しい。印刷コストは効果実行前に払う既存仕様を維持。

14. **`WX25-P2-063-E2`**（C群判断対象）
    - 原文：`【起】《ターン１回》《青》《黒》：あなたの場に《コード・ピルルク・APEX2》がいる場合、対戦相手のシグニ１体を対象とし、あなたのトラッシュからそれぞれレベルの異なる＜電機＞のシグニ３枚を好きな順番でデッキの一番下に置く。そうした場合、それをバニッシュする。`
    - 生成JSON（ステップ列）：`SEQUENCE[CONDITIONAL{HAS_CARD_IN_FIELD self APEX2}→SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash, 電機SIGNI, 3, distinctLevel, bottom}, CONDITIONAL→BANISH{stored}]]`
    - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《青×1》《黒×1》〉あなたの場に《コード・ピルルク・APEX2》がいるなら、対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれレベルの異なる＜電機＞のシグニ(トラッシュ)3枚をデッキの一番下に置く。そうした場合、それをバニッシュする`
    - 一致：はい。条件→対象宣言→中間動作→帰結の原文順。条件不成立時のUIと保存領域汚染もない。

### B群（4効果：既存SELECTに `abortIfNoCandidate` を追加）

15. **`WX04-073-E1`**（MANUAL）
    - 原文：`対戦相手のパワー8000以下のシグニ１体を対象とし、あなたのライフクロス１枚をクラッシュする。そうした場合、それをバニッシュする。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI power<=8000}, STORE, LIFE_CRASH{owner:self,count:1,triggerBurst:true}, CONDITIONAL→BANISH{stored}]`
    - 逆翻訳全文：`【起】（メイン起動）：〈《赤×1》〉対戦相手のパワー8000以下のシグニ1体を対象とする。そしてあなたのライフクロスを1枚クラッシュする。そうした場合、それをバニッシュする`
    - 一致：はい。MANUALで `owner:"self"` を維持。

16. **`WX06-001-E3`**
    - 原文：`【起】《ターン１回》《白×0》：対戦相手のシグニ１体を対象とし、あなたのトラッシュから名前の異なる＜天使＞のシグニ７枚をデッキの一番下に置く。そうした場合、それをトラッシュに置き、デッキをシャッフルする。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI 1}, STORE, TRANSFER_TO_DECK{trash, 天使SIGNI, 7, distinctName, bottom}, CONDITIONAL→SEQUENCE[TRASH{stored},SHUFFLE_DECK{self}]]`
    - 逆翻訳全文：`【起】（メイン起動）：《once_per_turn》〈《白×0》〉対戦相手のシグニ1体を対象とする。そしてあなたのそれぞれ名前の異なる＜天使＞のシグニ(トラッシュ)7枚をデッキの一番下に置く。そうした場合、対戦相手のシグニ1体をトラッシュに置く。そしてあなたのデッキをシャッフルする`
    - 一致：はい。

17. **`WX08-036-E1`**
    - 原文：`【起】《ダウン》：対戦相手のパワー10000以下のシグニ１体を対象とし、あなたのトラッシュから＜鉱石＞か＜宝石＞のシグニ合計５枚を好きな順番でデッキの一番下に置く。そうした場合、それをバニッシュする。`
    - 生成JSON（ステップ列）：`SEQUENCE[SELECT{opp SIGNI power<=10000}, STORE, TRANSFER_TO_DECK{trash, 鉱石・宝石SIGNI, 5, bottom}, CONDITIONAL→BANISH{stored}]`
    - 逆翻訳全文：`【起】（メイン起動）：〈《ダウン》〉対戦相手のパワー10000以下のシグニ1体を対象とする。そしてあなたの＜鉱石・宝石＞のシグニ(トラッシュ)5枚をデッキの一番下に置く。そうした場合、それをバニッシュする`
    - 一致：はい。

18. **`WXDi-P05-077-E1`**
    - 原文：`以下の２つから１つを選ぶ。①対戦相手のパワー8000以上のシグニ１体を対象とし、あなたのエナゾーンから＜天使＞のシグニ１枚をトラッシュに置き手札から＜天使＞のシグニを１枚捨てる。そうした場合、それをバニッシュする。②あなたのエナゾーンから《翠天姫　ガイア》１枚を対象とし、それを手札に加える。`
    - 生成JSON（①のステップ列）：`CHOOSE[SEQUENCE[SELECT{opp SIGNI power>=8000}, STORE, OPTIONAL_COST{handDiscard:天使SIGNI 1}, CONDITIONAL→BANISH{stored}], choice② unchanged]`
    - 逆翻訳全文：`【起】（メイン起動）：〈《緑×0》〉以下の2つから1つを選ぶ【対戦相手のパワー8000以上のシグニ1体を対象とする。そして手札から＜天使＞のシグニを1枚捨ててもよい。そうした場合、それをバニッシュする / あなたのカード(エナ)1枚を手札に加える】`
    - 一致：今回の対象宣言順序は一致し、候補0で後続を止める修正は採用。ただし効果全体は一致しない。エナの＜天使＞1枚をトラッシュに置く支払いが欠落し、手札捨てが任意化されている既存 parser バグは本バッチ外（§5に記録）。

## 4. 見送った効果とC群判断

見送った効果は **0件**。指定18効果は全件、対象宣言を中間動作より前に確定する点が原文と一致したため採用した。

- `WX25-P2-063-E2` は単純な先頭挿入を見送り、一般化した「前置条件の内側」分岐で採用した。理由は、条件不成立時に対象選択UIを出さず、`lastProcessedCards` / `storedTargetCards` を汚さないため。
- `WXK05-024-E3` は先頭挿入で採用した。候補0でも起動時に既に支払った《青》《無》は戻らない一方、本文のトラッシュから場に出す動作と帰結は止まる。これは ACTIVATED の既存コスト処理と整合する。

なお一般分岐には `orderObservable` を含めた。これを含めない試作では生パース差分が33効果に広がり、今回対象外の任意コスト形まで変わったため棄却した。カード固有IDや本文リテラルによる特例はない。

## 5. 条件以外で見つけた原文との食い違い

**3件（いずれも本バッチでは未修正）。**

1. `WX06-014-E2`：fresh parser は原文の `《古代兵器》` を story として取れず、`cardType:"シグニ"` しか出さない。live は MANUAL の `story:"古代兵器"` で正しいまま保護した。
2. `WX04-073-E1`：fresh parser は「あなたのライフクロス」を `LIFE_CRASH{owner:"opponent"}` と逆転する。live は MANUAL の `owner:"self"` を維持した。
3. `WXDi-P05-077-E1`：①のエナゾーンから＜天使＞をトラッシュに置く支払いが欠落し、手札からの＜天使＞捨てが `OPTIONAL_COST` に退化している。live にも残る既存不具合である。

最初の2つの parser 修正、および3つ目の支払い parser 修正は明示されたスコープ外なので触っていない。

## 6. ゲート実測値

| 計器 | 実測 | ベースライン比 |
|---|---:|---:|
| `npm run gates` | 全緑 | 維持 |
| golden（フィルタなし） | **2948 PASS / 0 FAIL** | 2942から+6、減少0 |
| census 高シグナル | **521 / baseline 521** | ±0 |
| smoke | 10700/10700 OK、CRASH/HANG/INVARIANT/SKIP **全0** | 維持 |
| fuzz | 200 games、CRASH/HANG/INVARIANT/EXPLOSION **全0**（seed 12648430） | 維持 |
| lint | **260 warnings / 0 errors** | warnings ±0 |
| `groupSimilar --all` | ★割れ **0**、同型265、総カード5986 | 維持 |
| held（報告直前 build→review） | **31バケット / 91枚** | ±0 / ±0 |
| `census:stubs` | A群🔴 **0** / C群 **0** | 維持 |
| `census:enginetext` | A🔴 **141行 / 137ハンドラ**（B 59、C 27） | ratchet ±0 |
| `check:manual-fields` | 必須フィールド欠落0、parseStatus違反0 | 全緑 |

`git diff --name-only` 全件と新規報告書の計23ファイルをHEADとバイト比較し、U+FFFD、3文字以上連続の `?`、先頭BOMはいずれも**新規増0**だった。

golden は最終的にフィルタなしで実行した。A/Bの追加テストはいずれも、候補ありなら中間動作＋保存対象への帰結、候補0ならトラッシュ／デッキ不変、修正前木なら候補0でも支払いが発生する、という両方向＋対照を含む。D群は `cost` / `timing` / `usageLimit` / `mandatory` / `duration` / `parseStatus` と固有filter/ownerも固定した。

ブラウザ対戦ハーネスは、既定Playwright Chromiumが未導入だったためインストール済みChromeへ切り替えて再試行したが、既存シナリオ開始前の `page.waitForFunction` が30秒でtimeoutした。したがってブラウザ上の目視実機確認は未達であり、上表の engine golden/smoke/fuzz が今回の実行検証である。

## 7. 生パースdiffとlive diff

全6712カード（Sheet1〜11＋TK、BOM除去）・10667 fresh効果を effectId 単位で比較した。変化集合は次の **18効果ちょうど**：

`PR-322-E1`, `SPDi44-12-E1`, `SPDi44-16-E1`, `WX04-073-E1`, `WX06-001-E2`, `WX06-001-E3`, `WX06-014-E2`, `WX08-036-E1`, `WX25-P1-014-E1`, `WX25-P1-030-E1`, `WX25-P2-063-E2`, `WXDi-P05-019-E2`, `WXDi-P05-077-E1`, `WXDi-P16-008-E3`, `WXEX1-53-E2`, `WXEX2-04-E2`, `WXEX2-31-E3`, `WXK05-024-E3`。

- 指定18に対する不足：**0**
- 指定18に対する余分：**0**
- outlier：**0**

HEAD対比の live JSON effectId diff も同じ18効果だけで、不足0／余分0。同カード内の兄弟効果の変化は **0件**。D群2件はこの18集合に含まれるので、「18＋D群」の和集合も18である。

## 8. held増減とlint warning増減

最初の `build:effects` 後は 31バケット／91枚 → **33バケット／103枚**だった。増加は全件を照合した。

- `+SIGNI +STUB×2` の11枚：`PR-322`, `SPDi44-12`, `SPDi44-16`, `WX06-001`, `WX25-P1-014`, `WX25-P1-030`, `WXDi-P05-019`, `WXDi-P16-008`, `WXEX1-53`, `WXEX2-04`, `WXEX2-31`。対象宣言＋保存の追加と束縛された帰結で、全て原文順に一致したため `heldReview --adopt`。
- `+SEQUENCE +SIGNI +STUB×2` の1枚：`WX25-P2-063`。前置条件の内側へ対象宣言列を入れた正しい構造なので採用。
- `WXK05-024-E3` は partial effect として現れたため、カード全体でなく当該effectだけを照合して `--adopt-partial-effect WXK05-024-E3` で採用。
- B群AUTOの `WX06-001-E3` / `WX08-036-E1` / `WXDi-P05-077-E1` は既存木への純粋な `abortIfNoCandidate` 追加として build が採用。D群2件は `syncManualLive.ts` で同期。

報告直前に指定どおり `npm run build:effects` → `node scripts/heldReview.mjs` を再実行し、最終値は **31バケット／91枚**、ベースライン比 **0バケット／0枚**。staleファイルの数値ではない。

lint は **260 warnings / 0 errors**、ベースライン比 warnings **±0**、errors **±0**。

## 9. やらなかったこと／現在も壊れたままの点

- `WX06-014-E2` fresh parser の `《古代兵器》` story欠落は直していない。したがって MANUAL を外すと限定が消える状態のまま。
- `WX04-073-E1` fresh parser の `LIFE_CRASH owner` 反転は直していない。したがって MANUAL を外すと自分でなく対戦相手のライフを割る状態のまま。
- `WXDi-P05-077-E1` のエナ＜天使＞支払い欠落／手札捨て任意化は直していない。これは live に残っており、選択肢①のコストが原文より軽いまま。
- ブラウザ対戦での目視実行は、既存ハーネスがシナリオ開始前にtimeoutしたため確認できていない。engineのヘッドレス検証は全緑だが、実UIで対象不在時に支払いが起きないことは未観測のまま。
- 指定18効果に OPEN finding はなく、新しい OPEN も見つけていないため `stage2_closed.txt` は更新していない。
- 新規STUB id、新規action型、並行打ち切り機構、force-adoptリストは作っていない。既存の `SELECT_TARGET_ONLY` / `STORE_LAST_PROCESSED_TARGETS` / `abortIfNoCandidate` / `bindToStoredTarget` だけを使用した。
- `src/engine/effectExecutor.ts` と `src/types/effects.ts` は行単位diff **0**。`scripts/verifyBattleDrive.mjs` も内容diff **0**。既存goldenで変えたのは、O-129第1バッチの「盤外は据置」という先送りassertの削除と、新しい対象宣言に追随する「段2 第38バッチ」の選択1段追加だけで、既存の帰結assertは維持した。その他の既存テスト／関数は変更していない。
- `docs/PLAN.md` / `docs/PLAN_PROGRESS.md` は編集していない。commit / push もしていない。
