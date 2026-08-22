# 段2 第15バッチ報告

## 1. 触ったファイル

- `src/types/effects.ts`：既存 `*SourceStory` と同形の `revealSourceStory` を宣言し、既存 `milledSourceStory` の原因不明規約コメントを実装に合わせた。
- `src/types/index.ts`：公開イベントの原因カードを運ぶ `hand_revealed_just_source_card_num` を追加。
- `src/engine/execStubPart3.ts`：手札公開の実書き込み2箇所で `ctx.sourceCardNum` を併記。
- `src/engine/triggerCollect.ts`：pure `collectRevealedFromHandTriggers`、deck-origin `trashSourceStory` ゲート、milled原因不明のfail-closedを実装。
- `src/screens/BattleScreen.tsx`：公開収集をpure collectorへ置換、原因記録クリア、deck-trash原因カード受け渡し。
- `src/data/effectParser.ts`：3文型から `revealSourceStory` / `trashSourceStory` / `duringMainPhase` / `milledSourceStory` を生成。
- `scripts/decompileEffects.ts`：新条件を逆翻訳へ表示。
- `scripts/goldenTest.ts`：3 timingの正方向と、別クラス・原因不明・メイン外の負方向を実collectorで固定。
- `public/data/effects_WX.json` / `effects_WX24_26.json`：指定8効果のlive条件を更新。
- `docs/decompile_sheet*.txt` 等のregen生成物：逆翻訳と下流表を再生成。
- `docs/BUGFIXES.md`：本修正を先頭記録。

## 2. Claude見立ての検証

- 実測1：一部正しい。`trashSourceStory` は `collectAnyZoneTrashSelfTriggers`、`banishedSourceStory` は `collectBanishTriggers`、`powerDecreaseSourceStory` は `collectPowerDecreaseTriggers` に存在した。ただし第3 timing用の `milledSourceStory` も既に型・parser・`collectMillTriggers` に存在していた。「生えていない3 timing」ではなく、公開は新設、deck ON_TRASHは既存フィールドのcollector漏れ、millは既存フィールドのlive漏れ＋fail-openだった。
- 実測2：対象数4/3/1は一致。`ON_CARD_MILLED_FROM_DECK` は新機構でなく既存 `milledSourceStory` の是正。
- 実測3：公開記録がカード番号配列だけだった点は一致。実際の代入は `execStubPart3.ts` の2箇所。`execStubPart1.ts` は `INTERNAL_MARK_REVEALED_FROM_HAND` へルーティングする入口で代入せず、`effectExecutor.ts` も `INTERNAL_MARK_REVEALED_NAMED` をSEQUENCEへ挟むだけ。したがって「書き手3箇所」は訂正し、2代入地点＋2入口すべてを確認した。
- §5-20配線：型、公開2代入、2公開入口、BattleScreen、deck collector、mill collectorを確認。`collectAnyZoneTrashSelfTriggers` の既存手札ゲートは変更なし。公開collectorはgoldenから呼べるpure関数へ抽出した。
- 既存3本不変：`banishedSourceStory` と `powerDecreaseSourceStory` の型・判定はdiff 0。既存手札 `trashSourceStory` 判定もdiff 0。なお `powerDecreaseSourceStory` は現状、原因不明時に発火する別規約であり、依頼文の「既存規約はすべてfail-closed」は実コードとは一致しない。本バッチでは変更していない。

## 3. A群8効果

1. `WX21-053-E1` ／「あなたの＜龍獣＞のシグニの効果によって」／ `{"revealSourceStory":"龍獣"}` ／ `collectRevealedFromHandTriggers` ／ 原因不明・別クラス・非シグニは非発火 ／ 原文の原因主体「龍獣」を公開原因カードのクラスへ落とした ／ 逆翻訳全文「このカードがあなたの＜龍獣＞のシグニの効果によって手札から公開されたとき：対戦相手のパワー3000以下のシグニ1体をバニッシュする」＝一致。
2. `WX21-064-E1` ／同じ龍獣限定／ `{"revealSourceStory":"龍獣"}`（既存 ENERGY_COUNT lte 3維持）／ `collectRevealedFromHandTriggers` ／ 原因不明等は非発火 ／ 「龍獣」を公開原因クラス、別節「3枚以下」は既存条件のまま保持 ／ 逆翻訳全文は龍獣限定＋エナ3以下＋EC1で一致。
3. `WX22-036-E1` ／同じ龍獣限定／ `{"revealSourceStory":"龍獣"}` ／ `collectRevealedFromHandTriggers` ／ 原因不明等は非発火 ／ 「龍獣」を公開原因クラスへ落とした ／ 逆翻訳全文は龍獣原因＋手札の《幻竜 ピュートン》任意場出しで一致。
4. `WXEX2-68-E1` ／同じ龍獣限定／ `{"revealSourceStory":"龍獣"}` ／ `collectRevealedFromHandTriggers` ／ 原因不明等は非発火 ／ MANUALのためeffectIdアンカーでliveへ条件だけ外科適用（全体syncはaction別軸を動かすため不採用）／ 逆翻訳の誘発句は一致。ただし全文は既存action差異があり不一致（§5参照）。
5. `WX25-P1-077-E1` ／「あなたの＜古代兵器＞のシグニの効果」「あなたのメインフェイズの間」／ `{"fromZones":["deck"],"trashSourceStory":"古代兵器","duringMainPhase":true}` ／ `collectDeckTrashSelfTriggers` ／ 原因不明・別クラス・相手原因・MAIN外は非発火 ／ 原因語を `trashSourceStory`、時相語を `duringMainPhase` へ落とした ／ 逆翻訳全文は条件と任意エナコスト後バニッシュまで一致。
6. `WX25-P1-099-E1` ／同じ古代兵器＋MAIN限定／ 同JSON ／ `collectDeckTrashSelfTriggers` ／ 同じfail-closed ／ 原因語と時相語を別フィールドへ保持 ／ 逆翻訳全文は条件＋自己蘇生任意で一致。
7. `WX25-P1-104-E1` ／同じ古代兵器＋MAIN限定／ 同JSON ／ `collectDeckTrashSelfTriggers` ／ 同じfail-closed ／ 原因語と時相語を別フィールドへ保持 ／ 逆翻訳全文は条件＋自己蘇生任意で一致。
8. `WX24-P3-087-E1` ／「あなたの＜悪魔＞のシグニの効果によって」／ 既存 `turnOwner/self,milledDeckOwner/self,milledMinCount/1` に `"milledSourceStory":"悪魔"` を追加 ／ `collectMillTriggers` ／ 原因不明・別クラス・非シグニは非発火 ／ 「悪魔」を直近ミル原因カードのクラスへ落とした ／ MANUALなのでeffectId外科適用。逆翻訳全文は自分ターン・ターン1回・悪魔原因・1枚ミル・相手-2000で一致。

## 4. B群見送り

- `WXEX2-28-E1`：場を離れる前の置換であり、事後AUTOを集める `collectLeaveFieldTriggers` では届かない。liveの `DOWN{thisCardOnly,optional}` は置換対象の＜ウェポン＞watcherでも相手効果原因でもない。置換候補を決めるleave-substitute系と原因ownerを設計する別機構なので未実装。
- `WX18-059-E1`：手札から落ちたカード自身を処理する `collectAnyZoneTrashSelfTriggers` は `triggerScope:self` 限定。場の別カードwatcherを走査する `collectHandDiscardTriggers` は `ON_HAND_DISCARDED` 用で、liveの `ON_TRASH any_ally` を拾わない。`collectTrashTriggers` はfield-origin中心なので、このwatcher主語＋相手効果原因はA群の自己反応ゲートでは表現できず未実装。

## 5. 条件以外の食い違い

- 1件：`WXEX2-68-E1` の既存MANUAL actionは、対象が `owner:any`（原文は自分の＜龍獣＞）、後段も同一対象identityを保持せず、【Sランサー】durationも `PERMANENT`。fresh全体syncなら一部改善するが、本バッチの原因限定以外を同時採用すると検証範囲を越えるため据置。ほか7効果は0件。

## 6. ゲート（before→after）

- golden 2360→2362 PASS、FAIL 0。
- census 733→733。
- smoke 10693→10693、CRASH/HANG/INVARIANT/SKIPすべて0。
- fuzz 全0→全0（200ゲーム、8000手）。
- census:stubs A群0/C群0→0/0。
- check:manual-fields 0→0。
- lint 0 errors / 261 warnings→同値。
- `groupSimilar --all` 同型★0→0。
- held/partial/idset 91/15/46→91/15/46（報告直前build＋heldReview実測）。
- live総数 10693→10693。

## 7. 生パースdiff・outlier・parseStatus

- live変化集合は指定8 effectIdのみ。追加/削除0、changed 8。
- AUTO 6件は条件キーだけの純改善。MANUAL 2件はlive外科適用。outlier 0。
- parseStatus変化0件（AUTO 6はAUTO据置、MANUAL 2はMANUAL据置）。

## 8. held / partial / idset / lint

- `_held_fresh` 91→91、`_partial_fresh` 15→15、`_idset_fresh` 46→46。集合増減0のため個別照合対象なし。
- lint warnings 261→261、errors 0→0。

## 9. やらなかったこと

- B群2件は実装していない。
- `WXEX2-68-E1` の既存action不一致は悪化させず据置。今より悪くなった効果は0件。
- 既存 `banishedSourceStory` / `powerDecreaseSourceStory` / 手札経路 `trashSourceStory` は共通化・変更していない。
- PLAN / PLAN_PROGRESS、force-adopt、isPureSuperset、commit、pushは触っていない。

---

## 【Claude 検証節】2026-08-22 続き607

**結論＝採用。** ゲート全緑・live 変化 **8効果ちょうど**・配線は6箇所すべて実体を確認。
**3バッチ連続で申告値のズレ0**（held の stale も今回は無し＝続き606 の指摘が反映された）。

### 独立実行した検証

| 項目 | 結果 |
|---|---|
| `npm run gates` | 全緑（golden **2362/0**・census **733/733**・smoke 10693 全異常0 SKIP0・fuzz 全0・stubs A🔴0 C0・manual-fields 0・lint **0 errors 261 warnings**） |
| `groupSimilar --all` | 同型★ **0** |
| live 機械 diff（ベースライン `c207f845c`） | 変化 **8効果**＝申告と一致。追加/削除0・`parseStatus` 変化0 |
| held / partial / idset | **91 / 15 / 46 据置**（集合でも不変） |
| §5-19 エンコーディング | 全変更ファイルで BOM(`efbbbf`) 0／U+FFFD 0 |

### 🔴 Claude が最も心配した「他の効果を巻き込む過小実行」は無い

新 collector `collectRevealedFromHandTriggers` のゲートは **`if (reqStory) {…}` の内側だけ**＝
**`revealSourceStory` を持たない既存の `ON_REVEALED_FROM_HAND` 効果は素通り**する。
続き605 の `hasApplicableLancer([], p)===false` のような「空なら全部落ちる」形にはなっていない。

**記録の受け皿も穴が無い**＝`hand_revealed_just` への代入は実コードで **2箇所のみ**
（`execStubPart3.ts:3466`／`:3482`）で、**両方に `hand_revealed_just_source_card_num` が併記**され、
クリア地点（`BattleScreen.tsx:1477-1478`）も**両方を同時に null へ倒す**＝
**前の公開の発生源が残る stale 経路が無い**。

### 🟡 スコープ外の既存効果を1件変えている（申告済み・妥当だが要監視）

`collectMillTriggers` の `milledSourceStory` 判定を **fail-open → fail-closed** へ反転している
（`triggerCollect.ts:1733-1738`）。⚠**元のコメントは「未設定は発生源不明として従来どおり発火させる（過剰側に倒す）。
ここで落とすと部分実装が過少発火の退化になる」と明示的に逆の判断を書いていた**＝
**文書化された決定の反転**（§5-17 の型）。

- 影響を受ける既存効果は **`WX24-P3-030-E1` の1件だけ**（`milledSourceStory` を持つ live 効果は2件で、
  もう1件は本バッチの `WX24-P3-087-E1`）。
- `WX24-P3-030-E1` の原文は「あなたの＜悪魔＞のシグニの効果**１つによって**」＝**原因の特定が意味の一部**なので、
  **fail-closed の方が原文に忠実**。他3本（`trashSourceStory` 等）の規約とも揃う。
- `last_effect_mill_source` の書き手は **`effectExecutor.ts:6858` の1箇所だけ**＝
  ⚠**他のミル経路（`TRASH{DECK_CARD}` 等）で落ちると `WX24-P3-030-E1` が発火しなくなる**。
  ⇒ **§7 の実機検証項目として残す**（golden は両方向を固定済みなので回帰は検知できる）。

### Codex が Claude の見立てを訂正した点（3件・すべて正しい）

1. **「生えていない3 timing」は誤り**＝`milledSourceStory` は**型・parser・`collectMillTriggers` に既に存在**していた。
   正しくは「**公開＝新設／deck ON_TRASH＝既存フィールドの collector 漏れ／mill＝既存フィールドの live 漏れ＋fail-open**」。
2. **`hand_revealed_just` の書き手は3箇所ではなく2箇所**（`execStubPart1.ts:4979` は
   `INTERNAL_MARK_REVEALED_FROM_HAND` へルーティングする入口で代入していない）。
3. **「既存規約はすべて fail-closed」も誤り**＝`powerDecreaseSourceStory` は**現状 fail-open**。
   Codex はこれを**変更せずに指摘だけした**（スコープ遵守）＝⚠**規約が2種類混在している**ことが判明。
   **次に触るときに揃えるか判断する。**

### 台帳

閉じたのは **finding 単位で7本**。`WX25-P1-099-E1`／`WX25-P1-104-E1` は
**「メインフェイズの間」の別軸 finding も同時に閉じた**（`duringMainPhase` を同バッチで足したため）。
`WXEX2-68-E1`／`WX25-P1-077-E1`／`WX24-P3-087-E1` は findings に無い＝実測で新規に見つけた分。
残 OPEN **959→952**／段2 消化 **128→135**。
