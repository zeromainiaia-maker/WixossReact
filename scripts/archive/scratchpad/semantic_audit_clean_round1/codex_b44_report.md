# 意味照合監査 段2 第44バッチ報告 ― 効果元自身のパワーを基準にした対象上限が丸ごと落ちていた16効果

- ベースライン: `37e0ac3ac`
- 実施日: 2026-08-26（続き676）
- 実装: Codex CLI（`model_reasoning_effort=high`）／**検証・追修正・簿記: Claude**
- ⚠**Codex は最終報告を書けずに終了した**（Windows `0xc0000142`＝プロセス初期化失敗で PowerShell・Node・`apply_patch` まで起動不能になり中断）。
  実装とゲート実行は完了していたので、**本報告書は Claude が実測し直して書いた**。
  Codex の申告した「golden 2858 PASS / 1 FAIL」も Claude 側で再現・原因特定・修正済み（下の §5）。

---

## 1. 触ったファイルと理由

| ファイル | 理由 | 担当 |
|---|---|---|
| `src/data/parserUtils.ts` | `parseSelfComparison` が比較級「〜**より**パワーの低い」しか見ておらず「〜**の**パワー**以下**」を一切見ていなかった＝根。`powerLteSelf` / `powerLteSelfHalf` の生成と、`parseLastProcessedComparison` へ「この方法で場に出したシグニのパワー以下」を追加 | Codex |
| `src/types/effects.ts` | `TargetFilter.powerLteSelfHalf` を1本新設（「パワーの半分以下」は静的 `powerRange` に焼けない） | Codex |
| `src/engine/effectExecutor.ts` | `resolveDynamicFilter` の `powerLteSelf` ブロックに `powerLteSelfHalf`（`selfPower / 2`）の1分岐を追加 | Codex |
| `src/data/parsers/parseSentencePart1.ts` | シグニ対象の名詞句フィルタ組み立てへ `parseSelfComparison` を配線 | Codex |
| `src/data/effectParser.ts` | `REVEAL_AND_PICK` の「それが〜の場合」条件節へ `parseSelfComparison` を配線（`WXK11-048-E1`） | Codex |
| `scripts/decompileEffects.ts` | 逆翻訳に `powerLteSelfHalf` の日本語を追加 | Codex |
| `scripts/goldenTest.ts` | 採用13効果の境界／境界+1／fail-open を表駆動で1本＋ネスト付与の索引1本＋C1/C2 各1本＋据置判断の contract 1本＝**+5テスト** | Codex |
| `public/data/effects_*.json` | 採用16効果（`heldReview --adopt` 経由） | Codex |
| `src/data/manualEffects.ts` | **`WX16-045` の manual エントリを削除**（parser が追いついて実体同一になった＝§6.4 O-40 の「削除候補」） | Claude |
| `public/data/effects_WX.json` | `WX16-045-E3` / `-E3-G` の `parseStatus` を `MANUAL`→`AUTO`（本体は1バイトも変えていない。`PRESERVE_STATUSES` の凍結を解いて以後の parser 改善を届かせるため） | Claude |
| `scripts/verifyBattleDrive.mjs` | 実機シナリオ2本を新設し既定 `order` に追加（下の §6） | Claude |

---

## 2. 調査結果（今回の機構が成立する前提）

### 消費地点（`sourceCardNum` があって初めて解決される）

- `powerLteSelf` / `powerLtSelf` / `powerGtSelf` … `resolveDynamicFilter`（`src/engine/effectExecutor.ts:2490-2498`）が
  `effectivePowers.get(sourceCardNum)`（無ければ `cardMap` の表記パワー）で `powerRange.max/min` へ解決する。
  🔴**`sourceCardNum` が引けないときはフラグを外すだけ＝制限なしにフォールバックする（fail-open）。**
  この向きは既存の設計判断なので変えず、**golden で明示的に固定**した（＝将来 fail-closed へ変えるなら golden が落ちる）。
- `powerLteSelfHalf` … 上と同じブロックに1分岐。基準は `selfPower / 2`（**切り捨てをしない**＝
  同義の既存実装 `src/utils/keywords.ts:442 selfPowerHalfLte` の `srcPower <= pp / 2` と規約を合わせた）。
  ⚠`keywords.ts` の `selfPowerHalfLte` は【シャドウ】の**保護スコープ**用で `TargetFilter` ではない＝流用していない（§5-5e）。
- `powerLteLastProcessed` … `effectExecutor.ts:2562-2569`（`lastProcessedCards[0]` 基準）。

### 群A8/A9（付与能力の内側）の `sourceCardNum`

golden `Stage2 power B44 E2E: granted inner abilities are indexed by the granted-to signi` で機械確認した。
- `WDK01-011-E1-G` … `collectGrantedFromLayer` が**付与先シグニ（＝ドライブ状態のこのシグニ自身）をキーに**能力を返す。
- `WX25-P3-056-sub-E1` … `GRANT_EFFECT` 実行後の `ownerState.granted_effects[付与先]` に載る。

⇒ どちらも「能力を持っているシグニ自身」が効果元になるので `powerLteSelf` の意味が原文と一致する。

### 群C

- `C1 WXK11-048-E1` … `REVEAL_AND_PICK` の候補解決は動的フィルタを通る（`effectExecutor.ts:1467` 付近）。
  golden で「ちょうど境界（自パワー−1）は場に出る／境界（＝同値）は出ない／効果元不在なら fail-open」を固定。
- `C2 WXK02-051-E1` … `SEARCH`→`ADD_TO_FIELD` は場に出したシグニを `lastProcessedCards` に積む。
  golden で「探して出したシグニのパワーが後段 BANISH の上限になる／参照が無ければ fail-open」を固定。

---

## 3. 採用した効果の全件（16効果）

### 群A＝既存キー `powerLteSelf` の配線ギャップ（9効果・新型ゼロ）

| effectId | 原文の該当節 | 逆翻訳（live 実測） | 一致 |
|---|---|---|---|
| `WX10-030-E4` | 【起】《赤》《ダウン》：**このシグニのパワー以下の**対戦相手のシグニ１体を対象とし、それをバニッシュする。 | 【起】（メイン起動）：〈《赤×1》＋《ダウン》〉対戦相手の**このシグニのパワー以下の**シグニ1体をバニッシュする | 一致 |
| `WX15-032-E2` | 【出】：**このシグニのパワー以下の**〜バニッシュする。 | 【自】このシグニが場に出たとき：対戦相手の**このシグニのパワー以下の**シグニ1体をバニッシュする | 一致 |
| `WX24-P3-TK1A-E4` | 【起】《ターン２回》《赤》：**このシグニのパワー以下の**〜 | 【起】（メイン起動）：《twice_per_turn》〈《赤×1》〉対戦相手の**このシグニのパワー以下の**シグニ1体をバニッシュする | 一致 |
| `WXEX2-69-E1` | 【自】《ターン１回》：このシグニに【アクセ】が付いたとき、**このシグニのパワー以下の**〜 | 【自】このシグニに【アクセ】が付いたとき：《once_per_turn》対戦相手の**このシグニのパワー以下の**シグニ1体をバニッシュする | 一致 |
| `WXK10-064-E2` | 【出】手札から＜アーム＞のシグニを１枚捨てる：**このシグニのパワー以下の**〜 | 【自】このシグニが場に出たとき：〈手札から＜アーム＞のシグニ1枚を捨てる〉対戦相手の**このシグニのパワー以下の**シグニ1体をバニッシュする | 一致 |
| `WX21-032-E1` | 【自】：このシグニがアタックしたとき、**自身のパワー以下の**対戦相手のシグニ１体を対象とし、あなたの場にこのシグニと共通する色を持たない他の＜天使＞のシグニがある場合、それをバニッシュする。 | 【自】このシグニがアタックしたとき：対戦相手の＜天使＞の**このシグニのパワー以下の**シグニ1体をバニッシュする | ⚠**部分一致**（下の §4） |
| `PR-328-E1` | …①**このシグニのパワー以下の**対戦相手のシグニ１体を対象とし、それをバニッシュする。 | …【対戦相手の**このシグニのパワー以下の**シグニ1体をバニッシュする / …】 | 一致（選択肢①） |
| `WDK01-011-E1`（→`-E1-G`） | …「【自】：このシグニがアタックしたとき、**自身のパワー以下の**〜」を得る。 | 付与能力の BANISH 対象に `powerLteSelf` | 一致 |
| `WX25-P3-056-E2`（→`-sub-E1`） | …「【自】：…**このシグニのパワー以下の**〜」を得る。 | 同上 | 一致 |

### 群B＝「パワーの半分以下」（5効果・`TargetFilter` に新フィールド1本）

`WX10-029-E2` ／ `WX25-P2-052-E1` ／ `WX26-CP1-054-E1` ／ `WXDi-P13-052-E2` の4効果に `powerLteSelfHalf` を付与。
（`WX25-CP1-082-E1` は据置＝§4）。逆翻訳は「このシグニのパワーの半分以下の」で原文と一致。

### 群C＝既存キーの配線（2効果）

`WXK11-048-E1`（`powerLtSelf`）／`WXK02-051-E1`（`powerLteLastProcessed`）。

### 標本外の拡張採用（6効果）

`WX10-030-E4` / `WX24-P3-TK1A-E4` / `WXEX2-69-E1` / `WXK10-064-E2` / `PR-328-E1` / `WXDi-P13-052-E2` は
**`findings.jsonl` に載っていない**＝監査の標本外だが、同じ parser 規則で一緒に直った実バグ。
**台帳には書かない**（PLAN §5.2 の「live 修正数と OPEN の減りは一致しない」の実例）。

---

## 4. 見送った効果と理由

| effectId | 理由 | 行き先 |
|---|---|---|
| `WX25-CP1-082-E1` | 原文は「**パワーが半分以下の相手シグニ1体を対象とし**、自分の他のアップ状態の＜ブルアカ＞1体をダウンしてもよい。**そうした場合、それを**バニッシュする」。**先に対象化したシグニと、後段でダウンする別シグニの照応**が木で表せず、全文から比較句を拾うと**ダウン側の対象へ誤付着する**。`parseSelfComparison` に文型ガードを1本置いて誤付着を防ぎ、**据置**にした（golden の contract テストで「誤付着していないこと」を固定） | PLAN §5.3 `O-96` |
| `WX21-032-E1` の別軸 | 「あなたの場にこのシグニと共通する色を持たない**他の＜天使＞**のシグニがある場合」は**発動条件**であって対象フィルタではない。live の `story:'天使'` はこの条件節を対象へ誤って寄せたもの。⚠**片方だけ直すと過小→過剰に裏返る**（`story` を外すと条件なしで無制限に撃てる）ので、条件の受け皿ができるまで両方据置。既存 `NO_COMMON_COLOR_AMONG_FIELD_SIGNI`（`types/effects.ts:178`）は「**それぞれ**共通する色を持たないシグニがN体」＝**相互**の意味で、「**このシグニと**共通しない」とは別 | PLAN §5.3 `O-95` |
| `WX10-029-E2` の別軸 | 原文が【常】表記なのに実体は「アタックしたとき」の【自】。timing 是正は別軸 | 据置（台帳は `::` で半分以下だけ閉じた） |
| `WXDi-P06-059-E1` / `WX24-P1-014-E1` / `WX24-P1-078-E1` | live が `STUB{GRANT_ABILITY_INNER_TEXT}`＝**「〜を得る」の能力ブロックが展開されていない**。パワー限定以前の問題 | 能力ブロック展開の機構 |
| `WXDi-P14-064-E1` | live が `STUB{TRADE_SELF_AND_OPP_TO_ENERGY}` | 同 STUB の実装 |
| `WXEX2-52-E3` | 「**パワーの合計が**このシグニのパワー以下になるように２枚まで」＝**集合合計の動的上限**。live も `ADD_TO_FIELD{source:TRASH_CARD, filter:{thisCardOnly}}` で構造ごと別物 | 集合合計上限の機構＋再parse |
| `WXK04-030-E1` / `WXK04-042-E1` | `parseStatus:'MANUAL'`（`PRESERVE_STATUSES` 対象）＋「得る」ブロック未展開 | manual 解除は §6.4 O-93 側 |
| `WDK10-015-E1` | 基準が「**この方法で捨てたシグニ**のパワーの半分以下」＝self ではなく lastProcessed 基準の half | `powerLteLastProcessedHalf` 相当の新語彙 |
| `WX16-025-E1` | **偽陽性**。原文「このシグニよりパワーの低い」だが**離場後**参照なので live の `powerBelowLeftCard:true` が正しい既存エンコード | 触らない（検算済み） |

---

## 5. 条件以外で見つけた食い違い・副作用

1. 🔴**`WX16-045-E3` の manual 影武者が露出した**（Codex の申告した golden 1 FAIL の正体）。
   parser が `powerLteSelf` を出せるようになった結果、`manualEffects.ts` の `WX16-045` エントリが
   **parser 出力と実体同一**になり、§6.4 O-42 のトリップワイヤ（`O42_KNOWN_REDUNDANT_MANUAL` が
   毎回ゼロから再導出して集合一致を assert する）が正しく発火した。
   `npx tsx scripts/censusManualDrift.ts` の「削除候補」も同じ1件を出した。
   ⇒ **manual エントリを削除**し、**live の `parseStatus` も `MANUAL`→`AUTO` へ直した**
   （`PRESERVE_STATUSES` が効いたままだと、その効果にだけ以後の parser 改善が永久に届かない＝§6.4 O-40 の失敗モード）。
   本体 JSON は `parseStatus` 以外**1バイトも変わっていない**ことを機械確認済み。
2. `WX21-032-E1` の `story:'天使'` 誤配置（上の §4）。
3. それ以外の食い違いは **0件**。

---

## 6. 実機検証（§2.1 ⑤）

**SELECT_TARGET ピッカーの候補絞り込みは golden/smoke/fuzz が原理的に守れない層**（PLAN §2.2）なので、
`scripts/verifyBattleDrive.mjs` に正方向＋対照の2本を新設した（各**2回連続 PASS**・既定 `order` に追加済み）。

| シナリオ | 盤面 | 結果 |
|---|---|---|
| `powerLteSelfCeiling` | 効果元 `WX10-030`（表記 P12000）で【起】《赤》《ダウン》を発動。相手場 = `WX01-051`（P12000＝**ちょうど上限**）＋ `WX01-053`（P15000＝**上限+1**） | ✅ **PASS**＝ピッカーの候補が `["WX01-051#1"]` **1件だけ**。P12000 のみがバニッシュされ、P15000 は場に残った |
| `powerLteSelfCeilingNoTarget` | 同じ効果元。相手場 = `WX01-053`（P15000）のみ | ✅ **PASS**＝【起】は発動する（stack が1回積まれる）が**候補0件**で何も起きない |

⚠**対照は単独では空振りと区別できない**（§5-21）ので、必ず正方向とセットで読むこと。
盤面の唯一の違いは「ちょうど上限の候補がいるかどうか」で、正方向が PASS することが対照の有効性の根拠になる。
⚠バニッシュされたシグニの行き先は**エナゾーン**（トラッシュではない）＝観測点は `guest.fieldSigni` と `guest.energyCards`。

---

## 7. ゲート数値（Claude が独立実行）

| 計器 | ベースライン `37e0ac3ac` | 第44バッチ後 |
|---|---|---|
| `npm run golden` | 2854 PASS / 0 FAIL | **2859 PASS / 0 FAIL**（+5） |
| `npm run census` 高シグナル | 562（`BASELINE_HIGH`=562） | **562**（据置・baseline 変更なし） |
| `npm run census:stubs` | A群🔴 0 / C群 0 | **0 / 0** |
| `npm run census:enginetext` | A 141行 / 137ハンドラ（B 59 / C 27） | **据置**（engine に原文 regex を足していない） |
| `npm run smoke` | 10696効果 / 異常0 / SKIP 0 | **同左** |
| `npm run fuzz` | 全0 | **全0** |
| `npm run lint` | 0 errors / 263 warnings | **0 errors / 263 warnings**（±0） |
| 同型★ | 0 | **0** |
| `check:manual-fields` | 0 / 0 | **0 / 0** |
| `_held_fresh` / `_partial_fresh` / `_idset_fresh` | 75 / 12 / 43 | **75 / 12 / 43**（±0・新規流入0） |
| live カード / 効果総数 | 5975 / 10696 | **5975 / 10696**（据置） |

---

## 8. live の A/B 差分（ベースライン `37e0ac3ac` と機械比較）

**変化した effectId = 16／新規 0／消滅 0。**

```
PR-328-E1  WDK01-011-E1  WX10-029-E2  WX10-030-E4  WX15-032-E2  WX16-045-E3(*)
WX21-032-E1  WX24-P3-TK1A-E4  WX25-P2-052-E1  WX25-P3-056-E2  WX26-CP1-054-E1
WXDi-P13-052-E2  WXEX2-69-E1  WXK02-051-E1  WXK10-064-E2  WXK11-048-E1
```

(*) `WX16-045-E3` だけは**本体不変・`parseStatus` のみ** `MANUAL`→`AUTO`（§5-1）。
**スコープ16効果の外への波及は0件**（同じカード内の別効果の巻き添えも0）。

---

## 9. エンコーディング検査（§5-19）

`git diff --name-only` の全ファイルで **BOM(`efbbbf`) 0 / `U+FFFD` 0 / 3文字以上連続の `?` 0**。新規増なし。

---

## 10. 台帳の4数字

| | before | after |
|---|---|---|
| 段0 で機械除去 | 221 | **221**（不変） |
| 段1 で偽陽性 | 111 | **111**（不変） |
| 段2 で消化 | 444 | **453**（+9） |
| 🔥残 OPEN | 668 | **659**（−9） |

HIGH / MED / LOW = 463/201/4 → **454/201/4**、影響カード 501→**495**・効果 527→**520**。
**段0・段1 が動いていない＝§5-28′ のズレなし**（閉じた9本がそのまま OPEN の減り9本に対応）。
