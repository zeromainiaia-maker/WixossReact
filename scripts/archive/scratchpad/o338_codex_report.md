# §5.3 `O-338` 作業報告

## 1. 結論

- 登録票は**一部 stale**だった。「支払い時に代替肢を提示する機構が無い」は誤りで、`collectGrowCostSubstitute` → `GrowModal` のグロウ専用窓と、`collectGuardAlternativeCost` のガード専用窓が既にある。
- 一方、通常のエナ支払いで「指定色2/3個の要求全体を指定名カード1枚で置換」する受け皿は実在しなかった。`collectEnergyTrashSubstituteInfo` は1枚＝1色の読み替えなので、この意味を表せない。したがって登録票は「窓が無い」ではなく、**グロウ／ガード以外に一括代替 funnel が無い**へ訂正するのが正しい。
- 効果単位の母集団は、指定した2句の `census:population` でいずれも **1効果／1枚＝`WX09-032-E1`／`WX09-032`**。巻き添えは0件。
- 着手前の live は `STUB / DEFERRED_COST_SUBSTITUTE_MULTI_ENERGY`、逆翻訳は `[未実装]`。実装後は専用 payload を live へ配送し、今巡は指示どおり**シグニ【起】とスペルの2支払い窓**だけを通した。

## 2. 触ったファイル

| ファイル | 理由 |
|---|---|
| `src/types/effects.ts` | `WholeEnergyCostSubstituteSpec` と `StubAction.energyCostSubstitute` を型宣言。 |
| `src/data/parsers/parseSentencePart2.ts` | 原文1文を専用 payload にする parser 規則を追加し、旧 defer を廃止。 |
| `src/engine/effectEngine.ts` | payload と盤面から宣言・対象エナを収集する `collectEnergyCostSubstitutes` を新設。 |
| `src/screens/battle/costs.ts` | 通常払いと一括代替払いを共通判定する `isEnergyPaymentSelectionValid` を新設。 |
| `src/screens/BattleScreen.tsx` | 自分の常在宣言を収集してモーダル共通 context へ配送。 |
| `src/screens/battle/modals/types.ts` | `BattleModalCtx.myWholeEnergySubstitutes` を型宣言。 |
| `src/screens/battle/modals/SigniActivatedModal.tsx` | 【起】の枚数・色判定を共有 funnel へ接続し、候補に「一括代替」を表示。 |
| `src/screens/battle/modals/SpellCastModal.tsx` | スペルの枚数・色判定を共有 funnel へ接続し、候補に「一括代替」を表示。 |
| `scripts/decompileEffects.ts` | payload の全条件を日本語へ逆翻訳。 |
| `scripts/goldenTest.ts` | fresh/live、逆翻訳、正負境界、支払い盤面差分を固定。旧 `O-277` の defer assert も同じ1効果の新仕様へ更新。 |
| `public/data/effects_WX.json` | `build:effects`／採用で更新した live payload。 |
| `docs/decompile_sheet1.txt` | `regen` で更新した `WX09-032-E1` の逆翻訳。 |
| `docs/_census_stubs.txt` | defer 1種／1効果が実装済み宣言へ移った再計測結果。 |
| `docs/_census_costtext.txt` | UI 原文 regex A群0を再計測。 |
| `docs/_census_enginetext.txt` | engine 原文 regex A群0を再計測。 |
| `docs/_vocab_census.txt` | 語彙 census 1／baseline 1を再計測。 |
| `docs/_census_deadstate.txt` | dead state 0を再計測。 |
| `docs/BUGFIXES.md` | 真因・修正・テストを先頭へ記録。 |
| `docs/O338_REPORT.md` | 本報告。 |

`docs/PLAN.md` と `docs/PLAN_PROGRESS.md` は編集していない。作業中、別プロセスが `docs/LESSONS.md`／`PLAN.md`／`PLAN_DETAIL.md` を commit し、HEAD は `4a0ae4045` から `104bcdd8bf` へ移動した。こちらはその commit に関与せず、変更も復元もしていない。

## 3. 採用した効果

| 項目 | 内容 |
|---|---|
| effectId | `WX09-032-E1` |
| 原文の該当節 | `【常】：あなたが《緑》《緑》《緑》か《緑》《緑》を支払う際、代わりにあなたのエナゾーンからカード名に《オサキ》を含むカード１枚をトラッシュに置いてもよい。（この能力で《無》を支払うことは置き換えられない）` |
| 生成 JSON | `{"effectId":"WX09-032-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"ENERGY_COST_SUBSTITUTE_WHOLE","energyCostSubstitute":{"color":"緑","counts":[3,2],"nameContains":"オサキ","excludeColorless":true}},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}` |
| 逆翻訳文全体 | `WX09-032-E1: 【常】あなたが《緑》《緑》《緑》か《緑》《緑》を支払う際、代わりにあなたのエナゾーンからカード名に《オサキ》を含むカード１枚をトラッシュに置いてもよい。（この能力で《無》を支払うことは置き換えられない）` |
| 原文一致 | **一致**。緑3／緑2、エナゾーン、名前部分一致、1枚、トラッシュ、任意、無色除外をすべて保持。 |

## 4. 支払い地点の全数と接続範囲

依頼文の「28箇所」は、同じ依頼文内の表を合計しても一致しない。修正前 HEAD の `src/screens/` を生 grep した実測は **36ヒット**＝`costs.ts` の定義2＋内部 funnel 2＋外部呼び出し32。表との差の1つは `artsUseGate.ts` が1ではなく2呼び出しあること。今回、外部32呼び出しのうち3呼び出し（2 UI窓）を共有 helper に置換し、残り29は未接続。

| 地点 | 修正前呼び出し数 | 今回 | 備考 |
|---|---:|---|---|
| `BattleScreen.tsx` | 8 | 未接続 | CPU・各種提示／実行ゲート。 |
| `artsUseGate.ts` | 2 | 未接続 | アーツ。 |
| `spellUseGate.ts` | 1 | 未接続 | 人間の `usable` とは別の基本コスト `affordable`／CPU側。 |
| `GrowModal.tsx` | 3 | 未接続 | 既存のグロウ専用代替は維持。 |
| `CutinModal.tsx` | 3 | 未接続 | カットイン。 |
| `AssistGrowModal.tsx` | 2 | 未接続 | アシストグロウ。 |
| `SigniActivatedModal.tsx` | 2 | **接続** | 追加コスト有無の2分岐を共有 helper 1本へ統合。 |
| `SpellCastModal.tsx` | 1 | **接続** | `next_spell_wild_cost_slot` の外側構造を維持。 |
| `ArtsModal.tsx` | 1 | 未接続 | アーツ。 |
| `KeyUseModal.tsx` | 1 | 未接続 | キー使用。 |
| `KeyActivatedModal.tsx` | 1 | 未接続 | キー【起】。 |
| `HandActivatedModal.tsx` | 1 | 未接続 | 手札【起】。 |
| `EnergyActivatedModal.tsx` | 1 | 未接続 | エナ【起】。 |
| `TrashActivatedModal.tsx` | 1 | 未接続 | トラッシュ【起】。 |
| `AssistActivatedModal.tsx` | 1 | 未接続 | アシスト【起】。 |
| `LrigGrantedModal.tsx` | 1 | 未接続 | ルリグ付与【起】。 |
| `SigniOnPlayCostModal.tsx` | 1 | 未接続 | シグニ【出】コスト。 |
| `PhaseConfirmDialogs.tsx` | 1 | 未接続 | グロウ確認。 |
| **外部計** | **32** | **3接続／29未接続** | 2 UI窓だけ採用。 |
| `costs.ts` | 定義2＋内部2 | 共有 helperを新設 | 既存2関数の全呼び出しへ自動適用はしていない。 |

## 5. golden と反転確認

- `§5.3 O-338: WX09-032-E1 は一括代替payloadを fresh/live と逆翻訳に保持`
  - fresh parser と live の両方で id・payload 全キーを確認し、逆翻訳全文を原文と照合。
- `§5.3 O-338: 【起】/スペル共通の支払い判定はオサキ1枚で緑2/3だけを置換する`
  - 成立：緑2、緑3、`《緑》×1《緑》×1` の分割表現、通常の緑2枚払い、緑2＋無1をオサキ＋別カードで支払い。
  - 不成立：名前違い1枚、緑1＋無1、緑2＋無1をオサキ1枚だけ、宣言元だけを場から外した同一盤面。
  - E2E：妥当と判定した選択を `planEnergyPayment` → `applyTo` へ渡し、選んだオサキと無色分のカードだけがエナからトラッシュへ動くことを確認。
- 旧 `§5.3 O-277/O-338: 複数エナ1組の代替は専用payloadで宣言し、単発置換の族は巻き込まない` は、旧 defer 期待を新専用 id・巻き添え1効果だけの期待へ更新。
- 反転確認：共有 helper の代替分岐だけを一時無効化すると、O-338 filter は **PASS 1 / FAIL 1** となり、`緑2をオサキ1枚で置換できない` で赤化。直後に復元し、filter **3/0**、フィルタなし **4037/0** を確認。parser/live を旧 defer に戻せば1本目、collector/helperを戻せば2本目が赤くなる。

## 6. 新設した消費地点

- producer：`parseSentencePart2`（`src/data/parsers/parseSentencePart2.ts:270`）が payload を生成。
- collector：`collectEnergyCostSubstitutes`（`src/engine/effectEngine.ts:8317`）が場の `CONTINUOUS` 宣言とエナの候補を payload だけから収集。
- 判定 funnel：`isEnergyPaymentSelectionValid`（`src/screens/battle/costs.ts:1587`）。通常の `canAffordWithExtraCost` を内包し、対象色の合計が2/3のときだけ1枚へ縮め、無色・追加コストは残す。同色コストが複数項目でも全項目から正しく差し引く。
- UI 消費：`SigniActivatedModal.tsx:91` と `SpellCastModal.tsx:94`。候補表示もそれぞれ `:361`／`:235`。
- 実支払い：既存の `planEnergyPayment`／`applyTo` が選択した1枚を通常どおりエナからトラッシュへ移す。別の恒久 state は新設していない。
- `census:stubs` で当該 id は明示 defer A群から1件減り、payload 宣言の B群／日本語表示の D群へ移動した。恒久 no-op ではない。

## 7. 配送確認

`npm run build:effects` → `node scripts/heldReview.mjs --adopt-effect WX09-032-E1` → 再度 `npm run build:effects` → `npm run regen` を実施。最終 live は次のとおり。

```json
{"effectId":"WX09-032-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"ENERGY_COST_SUBSTITUTE_WHOLE","energyCostSubstitute":{"color":"緑","counts":[3,2],"nameContains":"オサキ","excludeColorless":true}},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"}
```

採用後の fresh 差分台帳は `_held_fresh.json=0`、`_partial_fresh.json=0`、`_idset_fresh.json=0`。効果総数は live／HEAD とも10754で、今回の配送による総数増減は0。

## 8. ゲート数値

| ゲート | 最終値 | 提示 baseline からの差 |
|---|---|---|
| `npm run typecheck` | PASS | 変化なし |
| `npm run golden` | **4037 PASS / 0 FAIL** | +2 PASS |
| `npm run smoke` | **10754 OK / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0** | 提示10752比 +2。ただし着手時 HEAD のJSON再集計も10754で、今回差は0（提示値だけ stale）。 |
| `npm run fuzz` | CRASH/HANG/INVARIANT/EXPLOSION **0** | 変化なし |
| `npm run census` | 高シグナル **1 / BASELINE 1** | 変化なし |
| `census:stubs` | 無言A群 **0種/0件**、C群 **0種/0件**。明示deferは **28種/31件** | defer 29種/32件から -1種/-1件。Bは39/121→40/122、Dは575→576。 |
| `census:enginetext` | A群 **0行 / 0ハンドラ**、miss 0 | 変化なし |
| `census:costtext` | A群 **0規則 / 0カード**、死に規則0 | 変化なし |
| `census:deadstate` | 書きあり・読み0 **0件** | 変化なし |
| `check:manual-fields` | loss **0** / parseStatus違反 **0** | 変化なし |
| `npm run lint` | **0 errors / 255 warnings** | 変化なし |
| `git diff --check` | エラー0 | 変化なし |
| §5-19 文字コード検査 | 変更ファイルの BOM／U+FFFD／3連続`?` **0** | 新規増0 |

最終 `npm run gates` は全緑。実機は実行していない。

## 9. 実機で確かめるべき観測点

1. 本命【起】：場に《幻獣 コサキ》、エナに名前へ《オサキ》を含むカード1枚を置き、緑2または緑3の【起】を開く。「一括代替」表示の1枚だけを選ぶと決定可能になり、その1枚だけがトラッシュへ移って効果がスタック／解決される。
2. 本命スペル：同じ盤面で緑2または緑3のスペルを選び、オサキ1枚だけで発動でき、オサキがトラッシュへ移りスペルが通常どおり解決される。
3. 対照（名前）：同じ盤面・同じコストで候補を非オサキ1枚へ替えると決定不可。
4. 対照（宣言元）：オサキをエナに残したまま、場の《幻獣 コサキ》だけを外すと一括代替表示と1枚払いが消える。
5. 対照（無色）：緑2＋無1はオサキ1枚だけでは決定不可。オサキ＋別の支払い札1枚なら決定でき、2枚だけがトラッシュへ移る。
6. 対照（通常払い）：緑2を通常の緑2枚で払う既存経路が退化していない。

## 10. やらなかったこと

- 指示どおり、【起】とスペル以外の支払い窓29呼び出しには接続していない。グロウ／ガードの既存専用代替も変更していない。
- CPU の【起】／スペル自動選択、`spellUseGate.affordable`、アーツ、ピース、グロウ、カットイン、アシスト、キー、手札／エナ／トラッシュ起動、付与起動、【出】コストには広げていない。
- `extraWildCount`（キー2色分代替）との併用は、どの色を置換したかを既存 payload が運ばないため安全側で不成立にした。今回の原文には不要。
- 《無》を一括代替する実装、1枚＝1色の既存読み替えの変更、ほかの効果の修正はしていない。
- `card.EffectText` を engine/UI で読む regex は追加していない。
- 実機 `scripts/verifyBattleDrive.mjs` は実行していない。
- `docs/PLAN.md`／`docs/PLAN_PROGRESS.md` は編集していない。外部 commit による HEAD 移動も巻き戻していない。
- commit／push はしていない。
