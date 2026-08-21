# 段2 第2バッチ報告：`filter.hasCharm` の配線漏れ

## 1. 触ったファイルと理由

- `src/data/effectParser.ts`：対象名詞句を既存 `parseSigniTarget` へ合流し、誤った付与キーワードも本文から復元。
- `scripts/goldenTest.ts`：live action の両方向 E2E 2本と、既存 `WX13-006A` fixture のチャーム前提を追加。
- `scripts/vocabCensus.ts`：実測低下 783→781 に `BASELINE_HIGH` を同期。
- `public/data/effects_WX.json`／`effects_WXDi.json`／`effects_WXK.json`／`effects_misc.json`：採用13効果の live JSON。
- `docs/decompile_sheet*.txt`、`docs/_review_repr.txt`、`docs/grouped_all.txt`、`docs/grouped_sentence_all.txt`：指定の regen／同型確認による再生成物。
- `docs/_census_wiring.txt`、`docs/_vocab_census.txt`、`docs/_held_review.txt`、`docs/_partial_report.txt`、`docs/_census_stubs.txt`、`docs/_srctext_align.txt`：最終計器出力。
- `docs/BUGFIXES.md`：本修正の記録。
- 本報告：効果単位の判断と実測値。

`docs/PLAN.md`／`PLAN_PROGRESS.md`／`scripts/censusWiring.ts` は編集していない。

## 2. 調査結果（効果ごとの経路）

| effectId | 結果 |
|---|---|
| WDK12-011-E1 | POWER_MODIFY の対象名詞句を `parseSigniTarget` へ合流 |
| WDK12-011-E2 | GRANT_KEYWORD を合流。count:ALL と keyword:ランサーも復元 |
| WDK12-013-E1 | POWER_MODIFY を合流 |
| WX07-031-E2 | POWER_MODIFY を合流 |
| WX13-006A-E1 | 相手 POWER_MODIFY を合流 |
| WX13-006A-E3 | 相手 POWER_MODIFY を合流 |
| WX25-P2-069-E2 | REMOVE_ABILITIES を合流 |
| WXDi-P11-009-E1 | 相手 POWER_MODIFY を合流 |
| WXDi-P11-TK05-E1 | REMOVE_ABILITIES を合流 |
| WXDi-P11-TK05-E2 | action 対象ではない。既存 `triggerCondition.banishedHadCharm:true` を確認し据置 |
| WXDi-P11-TK06-E2 | 相手 POWER_MODIFY を合流 |
| WXEX2-24-E3 | 対象宣言を合流。owner:opponent と keyword:アタックできないも復元 |
| WXK07-050-E1 | 文分割後の POWER_MODIFY 節だけ合流。前段 ATTACH_CHARM と後段付与は不変更 |
| WXK07-074-E1 | action 対象ではない。既存 `triggerCondition.banishedHadCharm:true` を確認し据置 |
| WXK07-077-E1 | 対象宣言を合流。keyword:ランサーも復元 |
| WXK11-041-E3 | action は別の相手シグニ。既存 `triggerCondition.banishedHadCharm:true` を確認し据置 |

新しい型・フィールド・STUB id は0。`hasCharm` の regex は複製せず、既存規則を再利用した。

## 3. 採用した効果（全13件）

全件 `parseStatus=AUTO`。JSON は action（条件があるものは activeCondition も併記）の生成結果。

| effectId | 原文の該当句 | 生成 JSON（要点） | 逆翻訳文全体 | 一致 |
|---|---|---|---|---|
| WDK12-011-E1 | 【チャーム】が付いているあなたのシグニ | `POWER_MODIFY{target:{SIGNI,self,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:3000}` | 【常】あなたのすべてのチャームのあるシグニのパワーを＋3000する | 一致 |
| WDK12-011-E2 | 【チャーム】が付いているあなたのすべてのシグニは【ランサー】を得る | `GRANT_KEYWORD{target:{SIGNI,self,ALL,filter:{cardType:シグニ,hasCharm:true}},keyword:ランサー,duration:UNTIL_END_OF_TURN}` | 【起】（メイン起動）：ターン1回・緑×0、あなたのすべてのチャームのあるシグニに【ランサー】を与える（ターン終了時まで） | 一致 |
| WDK12-013-E1 | あなたのターンの間、【チャーム】が付いているあなたのシグニ | `activeCondition:{TURN_OWNER,self}; POWER_MODIFY{target:{SIGNI,self,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:3000}` | 【常】自分のターンの間、あなたのすべてのチャームのあるシグニのパワーを＋3000する | 一致 |
| WX07-031-E2 | 【チャーム】が付いているあなたのシグニ | `POWER_MODIFY{target:{SIGNI,self,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:2000}` | 【常】あなたのすべてのチャームのあるシグニのパワーを＋2000する | 一致 |
| WX13-006A-E1 | 【チャーム】が付いている対戦相手のシグニ | `POWER_MODIFY{target:{SIGNI,opponent,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:-5000}` | 【常】対戦相手のすべてのチャームのあるシグニのパワーを－5000する | 一致 |
| WX13-006A-E3 | 【チャーム】が付いている対戦相手のすべてのシグニ | `POWER_MODIFY{target:{SIGNI,opponent,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:-10000}` | 【自】このシグニが場に出たとき、対戦相手のすべてのチャームのあるシグニのパワーを－10000する | 一致 |
| WX25-P2-069-E2 | 【チャーム】が付いている対戦相手のすべてのシグニ | `REMOVE_ABILITIES{target:{SIGNI,opponent,ALL,filter:{cardType:シグニ,hasCharm:true}},until:UNTIL_END_OF_TURN}` | 【自】このシグニが場に出たとき、対戦相手のすべてのチャームのあるシグニは能力を失い、新たに得られない（ターン終了時まで） | 一致 |
| WXDi-P11-009-E1 | 【チャーム】が付いている対戦相手のシグニ | `POWER_MODIFY{target:{SIGNI,opponent,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:-3000}` | 【常】対戦相手のすべてのチャームのあるシグニのパワーを－3000する | 一致 |
| WXDi-P11-TK05-E1 | 【チャーム】が付いている対戦相手のすべてのシグニ | `REMOVE_ABILITIES{target:{SIGNI,opponent,ALL,filter:{cardType:シグニ,hasCharm:true}},until:UNTIL_END_OF_TURN}` | 【自】各アタックフェイズ開始時、対戦相手のすべてのチャームのあるシグニは能力を失う（ターン終了時まで） | 一致 |
| WXDi-P11-TK06-E2 | 【チャーム】が付いている対戦相手のすべてのシグニ | `POWER_MODIFY{target:{SIGNI,opponent,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:-10000}` | 【自】このシグニが場に出たとき、対戦相手のすべてのチャームのあるシグニのパワーを－10000する | 一致 |
| WXEX2-24-E3 | 【チャーム】が付いている対戦相手のシグニ1体 | `GRANT_KEYWORD{target:{SIGNI,opponent,1,filter:{cardType:シグニ,hasCharm:true}},keyword:アタックできない,duration:UNTIL_END_OF_TURN}` | 【起】（アタックフェイズ起動）：コイン1、対戦相手のチャームのあるシグニ1体に【アタックできない】を与える（ターン終了時まで） | 一致 |
| WXK07-050-E1 | 後段「【チャーム】が付いているあなたのすべてのシグニ」 | `SEQUENCE[ATTACH_CHARM, POWER_MODIFY{target:{SIGNI,self,ALL,filter:{cardType:シグニ,hasCharm:true}},delta:3000}, GRANT_KEYWORD{keyword:Sランサー}]` | 【起】緑×2：トラッシュの＜微菌＞1枚をチャームにし、あなたのすべてのチャームのあるシグニを＋3000し、あなたのすべてのシグニに【Sランサー】を与える | 条件句は一致。後段付与は既存不一致あり（§5） |
| WXK07-077-E1 | 【チャーム】が付いているあなたのシグニ1体 | `GRANT_KEYWORD{target:{SIGNI,self,1,filter:{cardType:シグニ,hasCharm:true}},keyword:ランサー,duration:UNTIL_END_OF_TURN}` | 【自】このシグニが場に出たとき、あなたのチャームのあるシグニ1体に【ランサー】を与える（ターン終了時まで） | 条件・付与は一致。＋1000は既存脱落（§5） |

## 4. 据置（全3件）

- `WXDi-P11-TK05-E2`：`DRAW` の対象ではなく被バニッシュ側の限定。live に `timing:[ON_BANISH]`、`triggerScope:any_opp`、`triggerCondition:{banishedHadCharm:true}` が既にあり正しい。
- `WXK07-074-E1`：`CHOOSE` の対象ではなく被バニッシュ側の限定。`triggerScope:any_ally`、`triggerCondition:{banishedHadCharm:true}` が既にあり正しい。
- `WXK11-041-E3`：`SEND_TO_ENERGY.target` は「そのシグニよりパワーの低い相手シグニ」で、チャーム限定を付けると意味が変わる。被バニッシュ側は `triggerCondition:{banishedHadCharm:true}` で正しい。

したがって wiring の残 miss 3 は実装穴ではなく、計器が action filter だけを見ることによる偽陽性。

## 5. 条件以外で見つけた原文との食い違い

- `WDK12-011-E2`：旧 `keyword:"チャーム"`、count:1 は誤り。本バッチで `keyword:"ランサー"`、count:ALL へ是正。
- `WXEX2-24-E3`：旧 owner:self／`keyword:"チャーム"` は誤り。本バッチで owner:opponent／`keyword:"アタックできない"` へ是正。
- `WXK07-077-E1`：旧 `keyword:"チャーム"` は本バッチでランサーへ是正。ただし原文の「それのパワーを＋1000」が action に無く、既存脱落のまま。
- `WXK07-050-E1`：原文はパワー10000以上へランサー、15000以上へSランサー。live は全自シグニへのSランサーだけで、閾値と通常ランサーが既存不一致。

## 6. ゲート数値

| 計器 | before | after |
|---|---:|---:|
| golden | 2327 / FAIL 0 | 2329 / FAIL 0 |
| smoke | 10693 OK / 異常0 | 10693 OK / 異常0 |
| fuzz | 異常0 | 異常0（200ゲーム、最大40手） |
| census | 783 / baseline 783 | 781 / baseline 781 |
| census:stubs | 無言0 / C群0 | 無言0 / C群0 |
| manual-fields | 0 effects | 0 effects |
| lint | 0 errors / 260 warnings | 0 errors / 260 warnings |
| 同型★ | 0 | 0（265群・5986枚） |
| held | 99枚 / 40群 | 99枚 / 40群 |
| PARTIAL刻印 | 44 | 44 |
| census:wiring hasCharm | miss 16 / has 10 | miss 3 / has 23 |

`npm run gates`、`npm run regen`、`node scripts/groupSimilar.mjs --all`、`npm run build:effects && node scripts/heldReview.mjs`、`npx tsx scripts/censusWiring.ts --key hasCharm` を実行済み。

## 7. 生パース diff・outlier・held・lint

HEAD 基準 live per-effect diff は **changed 20 / added 0 / removed 0**。うち前回バッチ7件を除く今回の変化集合は本報告の採用13件だけで、**outlier 0／スコープ外0**。途中で母集団外 `WX11-034-BURST` が変化したが、一般規則へ「その後」節の境界を足し `heldReview --adopt WX11-034` で投入前へ戻した。

held は途中 99→102→99、最終 **99枚・40群（増減0）**。lint は **260→260 warnings（増減0）**。

## 8. per-effect 変更一覧

- `WDK12-011-E1`：target.filter.hasCharm 追加。
- `WDK12-011-E2`：hasCharm、count:ALL、keyword:ランサー。
- `WDK12-013-E1`、`WX07-031-E2`：target.filter.hasCharm 追加。
- `WX13-006A-E1/E3`、`WXDi-P11-009-E1`、`WXDi-P11-TK06-E2`：相手全体 POWER_MODIFY に hasCharm。
- `WX25-P2-069-E2`、`WXDi-P11-TK05-E1`：REMOVE_ABILITIES に hasCharm。
- `WXEX2-24-E3`：owner:opponent、hasCharm、keyword:アタックできない。
- `WXK07-050-E1`：第2 step の POWER_MODIFY に hasCharm。
- `WXK07-077-E1`：hasCharm、keyword:ランサー。

据置3件と、同カード内の兄弟効果を含むスコープ外効果の最終変化は0件。

## 9. golden

- `WX25-P2-069-E2` の live `REMOVE_ABILITIES` を `run(effect.action, ctx)` で実行。相手場にチャーム付き／なしを置き、付きは能力喪失、なしは非喪失を assert。
- `WDK12-011-E2` の live `GRANT_KEYWORD` を実行。自場にチャーム付き／なしを置き、付きだけランサー取得、なしは非取得を assert。
- 既存 `WXK06-024-E1` テストは今回 `WX13-006A-E1` が正しくチャーム限定になったため、比較対象2体をチャーム付きにして本来の「効果元自身だけ保護外」を維持。

## 10. エンコーディング

最終変更集合（既存の未追跡調査物を含む60ファイル）を UTF-8 バイト列で検査し、U+FFFD、3文字以上連続 `?`、先頭BOM `efbbbf` はいずれも HEAD 比の**新規増0（増加ファイル0）**。

報告書を書き込み後に先頭20行・末尾20行を再読し、正常表示を確認した。`wc -c` 相当の実測は更新前 **12128 bytes**、本実測追記後 **12255 bytes**。

---

# 【Claude 検証】2026-08-22（CODEX_GUIDE §7）

## 🎯 計器で結果が裏付けられた（今回から使えるようになった検証軸）
**`census:wiring --key hasCharm` ＝ miss 16 / has 10 → miss 3 / has 23**（Codex 申告）
→ Claude が下記の計器修正を入れて **miss 0 / has 26**＝**配線漏れ完全解消**。
**申告値と計器が一致**＝per-effect の数え間違いが起きていないことの機械的な証明。

## ゲート独立実行＝全緑
golden **2327→2329**（E2E +2）／smoke 10693 OK・異常0／fuzz 0／census **783→781**／census:stubs 0／
manual-fields 0／lint 0 errors・260 warnings（増減0）／同型★ 0／held **99→99**／PARTIAL 44。
**スコープ外の効果変更0**。
- **census の −2 は正当**＝`BASELINE_HIGH` を 783→781 に更新し、**旧値をコメントで残している**（`vocabCensus.ts:96-97`）＝既存の記法どおり。
- ✅**`scripts/censusWiring.ts` は触られていない**（禁止事項を遵守）＝Claude 版と完全一致を確認。

## 🟢 parser 実装が指示どおり「既存規則へ合流」している
`bindCharmedSigniActionTarget`：
- ✅**`parseSigniTarget` を呼んで filter を作る**＝regex をあちこちに複製していない（今回の最重要要件）
- ✅ 対象を **`POWER_MODIFY` / `REMOVE_ABILITIES` / `GRANT_KEYWORD` の3型に限定**
- ✅ **`count` を保存**＝「すべて／N体」が明示されたときだけ上書き（既存の `ALL` を1体に狭めない）
- ✅ 「その後、」で始まる節を除外（前段との結合意味を変えない）
- ✅ カード固有の本文を埋め込んでいない

## 採用13件の実データ確認（抜粋・すべて owner と count が原文どおり）
| effectId | live |
|---|---|
| `WX07-031-E2` | `POWER_MODIFY{self, ALL, hasCharm:true, +2000}` |
| `WX13-006A-E1` | `POWER_MODIFY{opponent, ALL, hasCharm:true, -5000}` |
| `WX25-P2-069-E2` | `REMOVE_ABILITIES{opponent, ALL, hasCharm:true}` |
| `WXEX2-24-E3` | `GRANT_KEYWORD{opponent, 1, hasCharm:true, アタックできない}` |
| `WXK07-077-E1` | `GRANT_KEYWORD{self, 1, hasCharm:true, ランサー}` |

🟢**指示書で挙げた「条件以外の食い違い」も直っている**＝`WDK12-011-E2` は
`keyword:"チャーム"`（誤）→ **`keyword:"ランサー"`** ＋ `count:1` → **`ALL`**（原文「すべてのシグニ」）。

## 🟢 追加 golden は E2E・両方向
`REMOVE_ABILITIES`／`GRANT_KEYWORD` の2本とも、**チャーム付きとチャームなしを両方置いて実行**し
「付きは効果を受ける／なしは受けない」を assert している。

## 🔵 Claude の計器に偽陽性が1つあった（Codex が正しい）
据置3件（`WXK11-041-E3`／`WXK07-074-E1`／`WXDi-P11-TK05-E2`）は
**「【チャーム】が付いているシグニがバニッシュされたとき」＝トリガー側**で、
**既に `triggerCondition.banishedHadCharm:true` で正しく配線済み**だった
（型＝`types/effects.ts:3443`／消費＝`triggerCollect.ts:1182,1230`＝Claude が実コードで確認）。
Claude が追加した `hasCharm` の VOCAB 行が**この別キーを知らなかった**ため miss として出ていた。
→ **`jsonRe: /"hasCharm"\s*:|"banishedHadCharm"\s*:/` を追加して修正**（理由もソースコメントに記載）。
⚠**新しい語彙を VOCAB に足すときは「同義の別キーが無いか」を必ず調べる**＝この表が `noGuard`/`hasGuard`、
`eachDistinctLevel`/`distinct` で既に踏んでいる罠の3例目。
