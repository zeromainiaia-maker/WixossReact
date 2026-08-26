# 意味照合監査 段2 第45バッチ報告 ― 「センタールリグ」を主語・基準にした限定が丸ごと落ちていた14効果

- ベースライン: `cc5573c80`
- 実施日: 2026-08-27（続き677）
- 実装・検証・簿記: Claude（Opus 5）単独
- **台帳 OPEN 659 → 649**（段2 消化 453 → 463・段0/段1 は不変）

---

## 1. バッチの取り方（何を軸にしたか）

第44バッチの勝ち筋（「engine に受け皿があるのに parser が出していない語彙」）をそのまま踏襲しようとして、
**先に3回空振りした**。記録しておく。

| 試した軸 | 結果 |
|---|---|
| 残 OPEN 659 の **quote / claim の n-gram クラスタ** | 531群／647群＝ほぼシングルトン（第44バッチの記述どおり） |
| **`TargetFilter` のキー × live 出現数 × parser 生成数** | `parser=0` の受け皿は全部 live 1〜3件＝バッチにならない |
| **`npm run census:wiring` の ★★セル**（`cardClass × SIGNI[filter]` miss=15） | **ほぼ偽陽性**（＜X＞がコスト節・条件節に掛かっている＝計器のクロス計上） |
| **原文フレーズ → TargetFilter キーの自作対応表**（34語彙） | `frontOfSelf` 57／`centerZoneOnly` 53 等の大物は**全部偽陽性**（`IS_SELF_IN_CENTER_ZONE` 等の別受け皿で実装済み） |

🔑**当たったのは「原文に頻出する名詞で切る」**＝残 OPEN の quote を n-gram で数えたとき
**「センタールリグ」が17 findings**（単一名詞では最大クラスタ）だったので、そこから
**live の生データへ戻して用法ごとに割り直した**。7つの独立した parser 穴が出た。

⚠**教訓**＝「軸」も「構造署名」も**先に findings 側で切る**のは第43・44バッチで枯れた。
**残 OPEN の quote に出る固有名詞（センタールリグ／トラッシュ／エナゾーン…）で粗く束ね、
そこから生データへ戻す**ほうが、第45バッチでは速かった。

---

## 2. 触ったファイルと理由

| ファイル | 穴 | 理由 |
|---|---|---|
| `src/data/parsers/parseSentencePart1.ts` | **H1** | 「ダウンし凍結」の**複合**枝がルリグ対象を見ていなかった（単独 DOWN／単独 FREEZE には同じ3分岐が既にあった） |
| 〃 | **H2** | `REMOVE_ABILITIES` の汎用枝に「センタールリグと〜シグニは能力を失う」の検出が無く SIGNI 固定へ落ちていた |
| 〃 | **H3** | 「エナゾーンから場に出す」枝だけ `parseColorMatchesLrig` が呼ばれていなかった（トラッシュ枝には在った） |
| `src/data/parserUtils.ts` | **H3** | `LRIG_COLOR_RE` が「持つ**対戦相手の**シグニ」を落としていた（否定形には `対戦相手の` が入っていた＝非対称）／`signiClauseLrigColorFilter` を新設して `parseSigniTarget` へ配線 |
| `src/data/effectParser.ts` | **H3/H4/H5/H6/H7** | デッキトップ公開の条件節へ `parseColorMatchesLrig`／`LRIG_NAME_CONTAINS` の2規則（かぎり形・場合形）／ルリグ色だけの `かぎり` 形／SEARCH の `levelLteLrig`／**「代わりに」置換で base ゲートを外側へ持ち上げる** |
| `src/types/effects.ts` | **H2/H4** | `RemoveAbilitiesAction.alsoCenterLrig` を新設／`ActiveCondition` へ `LRIG_NAME_CONTAINS` を追加 |
| `src/types/index.ts` | **H2** | `PlayerState.lrig_abilities_disabled_next_turn`（2スロット式の予約） |
| `src/engine/effectExecutor.ts` | **H2** | `execRemoveAbilities` に `alsoCenterLrig` の書き込み（`alsoKeys` と同形） |
| `src/engine/effectEngine.ts` | **H4** | `checkActiveCondition` へ `LRIG_NAME_CONTAINS`（`Condition` 側と同じ読み） |
| `src/screens/battle/turnScopedState.ts` | **H2** | `lrig_abilities_disabled_next_turn` → `lrig_abilities_disabled` の境界昇格 |
| `scripts/decompileEffects.ts` | **H2** | 逆翻訳に `alsoCenterLrig` の日本語 |
| `scripts/goldenTest.ts` | 全部 | **+8テスト**（穴ごとに成立／不成立／参照不能の3方向）＋ ActiveCondition 型数のトリップワイヤ更新（57→58） |
| `scripts/verifyBattleDrive.mjs` | H7 | 実機シナリオ2本を新設し既定 `order` へ追加／`queryState` に `pendingVisibleCards` を追加 |
| `scripts/vocabCensus.ts` | ― | `BASELINE_HIGH` 562 → **561**（払い戻し） |
| `public/data/effects_*.json` | ― | 採用14効果（自動採用7＋`heldReview --adopt` 7） |

---

## 3. 塞いだ7つの穴と、engine 側の受け皿

### H1 「〈誰か〉のセンタールリグ1体を対象とし、それを**ダウンし凍結する**」（3効果＋選択肢1件）

`parseSentencePart1.ts` の **「ダウンし凍結（複合）」枝だけ**がルリグ対象を見ておらず
`parseSigniTarget` へ落ちていた＝**相手シグニの凍結**という完全な別物。
⚠**すぐ下の単独 DOWN 枝と単独 FREEZE 枝には同じ3分岐が既に入っていた**（＝1つの根が3つの入口に出る形の
取り残し）。engine の `execFreeze` は `LRIG`／`CENTER_LRIG_OR_SIGNI` を最初から扱える（`effectExecutor.ts:3304`）。

- `WX05-022-BURST` / `WX08-002-E2` / `WX14-030-BURST`（`FREEZE{SIGNI}` → `FREEZE{LRIG, down:true}`）
- `WXK05-004-E1` の選択肢②（標本外の拡張採用）

### H2 「対戦相手の**センタールリグと**すべてのシグニは能力を失う」（2効果・**新フィールド1本**）

🔴**`target.type` を `CENTER_LRIG_OR_SIGNI` にしても効かない**＝`execRemoveAbilities` は候補にルリグを混ぜるが、
書き込み先が `abilities_removed`（cardNum リスト）で、**engine にはルリグ能力をその集合で止める消費地点が無い**
（読むのはシグニ／キー／トラッシュ起動だけ）。ルリグ側の唯一の受け皿は
**`PlayerState.lrig_abilities_disabled`**（`grantedStore` / CONTINUOUS 走査 / `lifeCrashGate` / `scanLrigSelfBlocks` が読む）。
⇒ `alsoKeys` と同じ形の **`alsoCenterLrig`** を新設してそちらへ倒した。

⚠**期間の受け皿が片方しか無かった**＝`lrig_abilities_disabled` は turn-end 限定なので、
`WXDi-P10-005-E3`（「**次の**対戦相手のターン終了時まで」）のために
**`lrig_abilities_disabled_next_turn`** を足して `abilities_removed_next_turn` と同じ2スロット式にした。

### H3 `colorMatchesLrig` の未合成（3効果・**新型ゼロ**）

3つの別々の入口で落ちていた。

1. **シグニ対象の主経路**（`parseSigniTarget`）にそもそも規則が無い → `signiClauseLrigColorFilter` を新設
   （`signiClauseColorFilter` 等の兄弟と同じ「対象名詞句に隣接」規律）。`WXEX1-29-E2`。
2. **`LRIG_COLOR_RE` が所有者表記を跨げない**＝「持つ**対戦相手の**シグニ」で外れる。否定形
   （`LRIG_COLOR_NOT_RE`）には最初から `対戦相手の` が入っていた＝**肯定形だけの取り残し**。
3. **「エナゾーンから場に出す」枝**に `parseColorMatchesLrig` が無い（**すぐ下のトラッシュ枝には在った**）。`WX24-P2-007-E1`。
4. **デッキトップ公開の条件節**（`それが〜の場合`）にルリグ色の規則が無い。`WDA-F04-10-E1`。

⚠**`colorMatchesLrig` の基準ルリグは経路で違う**＝`execPowerModify` と汎用対象解決は
**target owner が opponent なら相手のセンター**を基準にする（`colorUsesTargetLrig`）。
live の該当38件を全数確認したところ、**owner:'opponent' の既存用例は全部「対戦相手のセンタールリグ」**で
その swap は正しく、今回の `WXEX1-29-E2`（`execTrash` 経由＝**swap が無い**）だけが「あなたのセンタールリグ」だった。
🔴**この差は JSON からは読めない**＝将来 `POWER_MODIFY` 等で「あなたのセンタールリグと共通色の**相手**シグニ」が
出たら、基準が黙って相手ルリグへ倒れる。**そのときは新キー（caster 基準）が要る**（今回は該当0なので作らない）。

### H4 「あなたの場に**カード名に《X》を含むセンタールリグ**がいる（場合／かぎり）」（2効果）

受け皿は **`LRIG_NAME_CONTAINS`**（`Condition` 側に既存）。
🔴**`HAS_CARD_IN_FIELD{cardType:'ルリグ', cardName}` へ倒してはいけない**＝そちらは `lrigZoneTops`
（センター＋**左右アシスト**）を走査し、**《美兎》《凛》は同名のアシストルリグが実在する**（`WXDi-CP01-018` 等）＝
センター限定の原文をアシストでも成立させてしまう。⇒ `ActiveCondition` 側にも同型を足して**両評価器を揃えた**。

### H5 「〈誰か〉のセンタールリグが〈色〉であるかぎり、」の単独形（1効果）

レベル形・レベル＋色形・色＋手札枚数形・色＋このシグニの位置形は在ったのに**色だけの形が無かった**＝
`WXDi-P05-044-E1` は `activeCondition` が `TURN_OWNER` だけになり **《相手ターン》の間ずっと＋5000** だった。
`LRIG_COLOR` は ActiveCondition にも Condition にも実装済み＝**純粋な配線ギャップ**。

### H6 「代わりに」置換が **base 側のゲートを捨てていた**（副産物・1効果）

`WDK16-06S-E1`「〈《凛》ゲート〉の場合、対戦相手は手札を１枚捨てる。〈登録者数〉の場合、代わりに…捨てさせる。」で、
素直に `else: base` にすると **then 側（置換後）だけがゲートを失って無条件に走る**。
⇒ base が `else` を持たない `CONDITIONAL` なら、その条件を**置換の外側へ持ち上げる**ようにした。

🔴🔴**無条件に持ち上げると退化する**（実測で踏んだ）＝`WD16-016-BURST`（手札**≤5**→1枚／**≥6**→2枚）は
2条件が**排他**なので、外へ出すと「≤5 かつ ≥6」で**2枚側が到達不能**になる（`WD08-006` の多段閾値も同型）。
⇒ **条件 `type` が一致するときは持ち上げない**（多段閾値は必ず同 type、独立ゲートは別 type）。
この規約は golden の回帰テストで固定した。副産物として `WX25-CP1-046-E2` の
「そうした場合」ゲートが【Ｓランサー】側にも掛かるようになった（拡張採用）。

### H7 SEARCH の `levelLteLrig` 未合成（1効果）

「デッキから**あなたのセンタールリグのレベル以下の**赤のシグニ１枚を探して」＝規則が
**BOUNCE／BANISH の「相手シグニ」形にしか無かった**ため、`WXK10-037-E2` は
**デッキの赤シグニなら何レベルでも持ってこられる**過剰効果だった。
engine の `execSearch` は `resolveDynamicFilter` を通す＝**参照不能なら `noMatch`（fail-closed）**。

---

## 4. 採用した効果の全件（14効果）

| effectId | 穴 | 直った内容 | 台帳 |
|---|---|---|---|
| `WX05-022-BURST` | H1 | `FREEZE{SIGNI}` → `FREEZE{LRIG,down}` | 閉 |
| `WX08-002-E2` | H1 | 同上 | 標本外 |
| `WX14-030-BURST` | H1 | 同上 | 閉 |
| `WXK05-004-E1` | H1 | 選択肢②の `FREEZE` が LRIG に | 標本外 |
| `WX19-022-BURST` | H2 | `alsoCenterLrig`（ターン終了時まで） | 閉（センター側の1件） |
| `WXDi-P10-005-E3` | H2 | `alsoCenterLrig`（次の相手ターン終了時まで＝2スロット） | 閉 |
| `WXEX1-29-E2` | H3 | 対象に `colorMatchesLrig` | 閉 |
| `WX24-P2-007-E1` | H3 | エナ→場の候補に `colorMatchesLrig` | 標本外 |
| `WDA-F04-10-E1` | H3 | 公開札の判定に `colorMatchesLrig` | 閉 |
| `WDK16-06S-E1` | H4/H6 | `LRIG_NAME_CONTAINS`（《凛》）を置換の外側ゲートに | 閉 |
| `WDK16-06T-E1` | H4 | `activeCondition: LRIG_NAME_CONTAINS`（《美兎》） | 閉 |
| `WXDi-P05-044-E1` | H5 | `AND[TURN_OWNER, LRIG_COLOR]` | 閉 |
| `WX25-CP1-046-E2` | H6 | 「そうした場合」ゲートが【Ｓランサー】側にも掛かる | 標本外 |
| `WXK10-037-E2` | H7 | SEARCH に `levelLteLrig:'self'` | 閉 |

**live 変化は 14 effectId ちょうど**（新規0・消滅0・スコープ外への波及0）。

---

## 5. 据置（このバッチでは直さない）

- **`WXDi-CP01-002-E1`**（「あなたのセンタールリグがレベル３以上の場合、対戦相手のデッキの上から2434枚トラッシュ」）＝
  本文のゲートは `LEADING_STATE_CLAUSES` に語彙があるのに、**先頭の【使用条件】2本が前置されているせいで
  先頭一致が外れて**丸ごと落ちている。しかも【使用条件】の片方（「このゲームの間にあなたがリレーピースを
  使用している」）は**受け皿が無い**ので、既存規約「複数の【使用条件】を持つカードは全条件を表現できるまで
  一部だけを採らない」に従うと部分的な持ち上げもできない。⇒ **§5.3 `O-97` へ登録**。
- **`WX19-022-BURST :: 新たに得られない`**＝センタールリグ側とは別軸（付与のブロック）。
- **`WX07-023-BURST`**＝findings は「センタールリグへの限定がない」だが、**live は既に
  `DOWN{LRIG, opponent}`**＝**偽陽性**（第44バッチ以前のどこかで直っていた）。台帳では閉じず、
  次に段1 の再 triage をするときの実例として残す。

---

## 6. ゲート（全緑・独立実行で確認）

| ゲート | 結果 |
|---|---|
| typecheck | PASS |
| golden | **2859 → 2867**（+8テスト）／FAIL 0 |
| smoke | 全0（CRASH/HANG/INVARIANT） |
| fuzz | 全0 |
| census | 高シグナル **562 → 561**（`BASELINE_HIGH` を実数へ更新） |
| census:stubs | A群🔴 0・C群 0 |
| census:enginetext | A群 **141行／137ハンドラ**（据置） |
| manual-fields | 0 violations |
| lint | 0 errors（warning 263＝±0） |
| held / partial / idset | **82 / 12 / 43**（採用後。着手前は 75 / 12 / 43） |

---

## 7. 実機（§2.2 の「golden が守れない層」）

**探索モーダルの候補絞り込み**は golden/smoke/fuzz が原理的に守れないので、`WXK10-037-E2` で2本新設した。

- `b45LrigLevelSearchCeiling`（正方向）＝センター**Lv3** → 探索候補は**赤Lv3 だけ**、赤Lv4 は候補外。
- `b45LrigLevelSearchFollowsLrig`（対照）＝**盤面はそのまま、センターのレベルだけ Lv4** → 赤Lv3/Lv4 の**両方**が候補。
  ＝「たまたま Lv3 しか出ない」のではなく**上限がルリグのレベルを追っている**ことを示す（§4.4 罠3）。

⚠**SEARCH の候補は `interaction.candidates` ではなく `visibleCards`**（`effectExecutor.ts:4141`）＝
`queryState()` に **`pendingVisibleCards`** を追加した（結果＝何を手札に入れたかでは絞り込みを判定できない）。

回帰＝同カードの既存2本（`lrigDownCenterOnlyUnwired` / `lrigDownCenterOnlyPays`）も併走させた。
