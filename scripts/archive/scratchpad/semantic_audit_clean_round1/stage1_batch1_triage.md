# clean群 round1 段1 batch1 triage

判定日: 2026-08-21。対象は C001〜C010 の101 findings。live JSON と原文を1件ずつ照合し、engine の入口・消費地点も確認した。全件 `parseStatus:AUTO`（MANUAL/PARTIAL は0件）。

## 1. サマリ

| cluster | quote | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---|---:|---:|---:|---:|
| C001 | バトルによって | 0 | 16 | 0 | 0 |
| C002 | ターン終了時まで | 3 | 11 | 0 | 0 |
| C003 | このシグニの基本パワー | 0 | 13 | 0 | 0 |
| C004 | あなたのターン終了時 | 0 | 12 | 0 | 0 |
| C005 | そうした場合 | 5 | 4 | 0 | 0 |
| C006 | 【チャーム】が付いている | 8 | 0 | 0 | 0 |
| C007 | このシグニは | 1 | 7 | 0 | 0 |
| C008 | シグニ１体を対象とし | 4 | 3 | 0 | 0 |
| C009 | デッキをシャッフルし | 7 | 0 | 0 | 0 |
| C010 | バニッシュされない | 7 | 0 | 0 | 0 |
| **計** |  | **35** | **66** | **0** | **0** |

## 2. finding 全101件

根拠の共通略記: **BATTLE**=`ON_SIGNI_BANISH_OPPONENT` はバトル結果専用入口（`effectParser.ts:11944-11953`, `triggerCollect.ts:2338-2410`）。**TEMP**=`POWER_MODIFY` は duration 未指定でも `temp_power_mods`（`effectExecutor.ts:1596-1675`）。**SELF-SET**=`POWER_SET` は `sourceCardNum` を自動適用（`effectExecutor.ts:1677-1701`）。**SELF-GRANT**=filterなしの単体 grant は source を自動適用（`effectExecutor.ts:3580-3633`）。**OWN-END**=`collectTurnTriggers` はターンプレイヤー場の `triggerScope:self` を収集（`triggerCollect.ts:3932-3948,4106-4125`）。**DID-IT**=前段成功型と `IS_MY_TURN` placeholder の gate（`effectExecutor.ts:3804-3808,4865-4882`）。

| effectId | parseStatus | 分類 | 根拠／直す場所 | 原文の該当句 |
|---|---|---|---|---|
| WX17-032-E1 | AUTO | 偽陽性 | BATTLE。正面外条件も `triggerCondition.banishedNotFront` を collector が読む。 | バトルによって正面以外のシグニをバニッシュしたとき |
| WX24-P1-039-E2 | AUTO | 偽陽性 | BATTLE。効果バニッシュは別 timing。 | このシグニがバトルによってバニッシュしたとき |
| WX24-P1-070-E1 | AUTO | 偽陽性 | BATTLE＋`triggerScope:any_ally`/excludeSelf。 | 他の＜アーム＞がバトルによってバニッシュしたとき |
| WX24-P4-055-E1 | AUTO | 偽陽性 | BATTLE＋味方白 filter。 | 他の白のシグニがバトルによって |
| WXDi-CP02-058-E2 | AUTO | 偽陽性 | BATTLE。 | このシグニがバトルによってバニッシュしたとき |
| WXDi-P00-061-E1 | AUTO | 偽陽性 | BATTLE。凍結 filter は triggerCondition。 | バトルによって凍結状態のシグニを |
| WXDi-P02-018-sub-E1 | AUTO | 偽陽性 | BATTLE。付与能力も同 timing collector に入る。 | バトルによって対戦相手のシグニを |
| WXDi-P05-041-E2 | AUTO | 偽陽性 | BATTLE。 | このシグニがバトルによって |
| WXDi-P05-054-E2 | AUTO | 偽陽性 | BATTLE。 | バトルによって対戦相手のシグニを |
| WXDi-P05-070-E1 | AUTO | 偽陽性 | BATTLE。 | バトルによってバニッシュしたとき |
| WXDi-P09-073-E2 | AUTO | 偽陽性 | BATTLE。 | バトルによって相手シグニを |
| WXDi-P10-059-E2 | AUTO | 偽陽性 | BATTLE＋凍結 filter。 | バトルによって凍結状態のシグニを |
| WXDi-P12-067-E1 | AUTO | 偽陽性 | BATTLE。 | このシグニがバトルによって |
| WXEX2-76-E2 | AUTO | 偽陽性 | BATTLE＋hasCharm filter。 | バトルで【チャーム】付きシグニを |
| WXK02-054-E1 | AUTO | 偽陽性 | BATTLE＋凍結 filter。 | バトルによって凍結状態のシグニを |
| WXK10-072-E1 | AUTO | 偽陽性 | BATTLE＋凍結 filter。 | バトルによって凍結状態のシグニを |
| WX06-037-BURST | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－10000 |
| WX07-023-E2 | AUTO | 真バグ | `parseSingleSentence` の GRANT_PROTECTION に `duration:UNTIL_END_OF_TURN`。action内PERMANENTを直す。 | ターン終了時まで効果を受けない |
| WX09-021-BURST | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－8000 |
| WX24-P3-039-E1 | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－8000 |
| WX24-P3-040-E1 | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－8000 |
| WX24-P4-035-E1 | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－20000 |
| WX25-CP1-047-BURST | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－15000 |
| WX26-CP1-018-E1 | AUTO | 偽陽性 | TEMP（両choice）。 | ターン終了時までパワーを－ |
| WX26-CP1-059-BURST | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－15000 |
| WXDi-P05-052-E1 | AUTO | 偽陽性 | `GRANT_LRIG_ABILITY` はセンタールリグ専用で turn grant store（`effectExecutor.ts:3760-3790`）、ターン終了で消去。 | ターン終了時までセンタールリグは能力を得る |
| WXDi-P08-048-E1 | AUTO | 偽陽性 | TEMP。 | ターン終了時まで－12000 |
| WXEX1-27-E2 | AUTO | 真バグ | `parseSingleSentence` の GRANT_PROTECTION action durationをUNTIL_END_OF_TURNへ。 | ターン終了時まで効果を受けない |
| WXK10-104-E1 | AUTO | 真バグ | choice②の `GRANT_PROTECTION.duration` をUNTIL_END_OF_TURNへ。 | ターン終了時まで効果を受けない |
| WXK11-005-E1 | AUTO | 偽陽性 | TEMP（`POWER_MODIFY_PER_LRIG_LEVEL` も一時修整store、`effectExecutor.ts:10070-10125`）。 | ターン終了時まで－2000×レベル |
| WD02-011-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを15000にする |
| WX02-074-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを5000にする |
| WX03-038-E2 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを5000にする |
| WX03-040-E2 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを5000にする |
| WX03-048-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを5000にする |
| WX06-038-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを12000にする |
| WX06-039-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを8000にする |
| WX06-040-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを5000にする |
| WX09-Re20-E2 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを10000にする |
| WX10-038-E2 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを15000にする |
| WX12-Re14-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを15000にする |
| WX14-036-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを12000にする |
| WX16-059-E1 | AUTO | 偽陽性 | SELF-SET。 | このシグニの基本パワーを10000にする |
| WDK07-E13-E1 | AUTO | 偽陽性 | OWN-END。scope省略はself。 | あなたのターン終了時 |
| WX25-P1-065-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WX25-P1-070-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WX25-P3-067-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXDi-P02-065-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXDi-P03-065-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXDi-P05-085-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXDi-P08-066-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXDi-P08-076-E2 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXDi-P09-073-E1-G | AUTO | 偽陽性 | OWN-END。付与能力も holder 側 field collector を通る。 | あなたのターン終了時 |
| WXK03-060-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WXK09-053-E1 | AUTO | 偽陽性 | OWN-END。 | あなたのターン終了時 |
| WDK08-Y17-E1 | AUTO | 真バグ | REVEALはDID-IT対象外。`parseThisWayGenericCount`でLAST_PROCESSED_COUNT_GTE(3)を生成。 | 3枚公開した場合 |
| WX10-088-E1 | AUTO | 真バグ | REMOVE_CHARMはliveのDID-IT対象外。現parserの`prevIsRemoveCharmRecorder`（`effectParser.ts:11183-11210`）でLAST_PROCESSED条件へ再生成。 | チャームをトラッシュに置いた場合 |
| WX12-014-E1 | AUTO | 偽陽性 | LIFE_CRASHはDID-IT対象。任意クラッシュskip/空振り時にplaceholderを剥がす。 | そうした場合、上からライフへ |
| WX14-030-E1 | AUTO | 偽陽性 | TRANSFER_TO_DECKはDID-IT対象、4枚未達なら後段抑止。 | 4枚をデッキに加えた場合 |
| WX21-042-E2 | AUTO | 真バグ | TAKE_FROM_UNDER_SIGNIはDID-IT対象外。executorで成功記録＋条件、または専用gateを追加。 | 下のカードをトラッシュに置いた場合 |
| WX25-P2-063-E2 | AUTO | 偽陽性 | TRANSFER_TO_DECKはDID-IT対象。 | 3枚をデッキの下に置いた場合 |
| WXDi-P11-075-E1 | AUTO | 真バグ | REVEALはDID-IT対象外。各choiceに必要枚数のLAST_PROCESSED_COUNT_GTE。 | 必要枚数を公開した場合 |
| WXEX1-28-E2 | AUTO | 真バグ | WX10-088と同型。現parser `prevIsRemoveCharmRecorder` 経由へ。 | チャームをトラッシュに置いた場合 |
| WXK03-021-E1 | AUTO | 偽陽性 | BANISHはDID-IT対象。前段条件未成立/対象なしなら後段placeholderを抑止。 | そうした場合、エナをトラッシュに |
| WDK12-011-E1 | AUTO | 真バグ | `parseTargetFilter`でaction target.filter.hasCharm=true。engineは`matchesFilter`（`effectEngine.ts:754-757`）対応済み。 | 【チャーム】付きのあなたのシグニ |
| WDK12-013-E1 | AUTO | 真バグ | 同上。 | 【チャーム】付きのあなたのシグニ |
| WX13-006A-E1 | AUTO | 真バグ | 同上（opponent ALL）。 | 【チャーム】付きの対戦相手のシグニ |
| WX13-006A-E3 | AUTO | 真バグ | 同上（opponent ALL）。 | 【チャーム】付きの対戦相手のシグニ |
| WX25-P2-069-E2 | AUTO | 真バグ | REMOVE_ABILITIES target.filter.hasCharm=true。executor filter対応（`effectExecutor.ts:6588-6625`）。 | 【チャーム】付きの対戦相手のシグニ |
| WXDi-P11-TK05-E1 | AUTO | 真バグ | 同上。 | 【チャーム】付きの対戦相手のシグニ |
| WXDi-P11-TK06-E2 | AUTO | 真バグ | POWER_MODIFY target.filter.hasCharm=true。 | 【チャーム】付きの対戦相手のシグニ |
| WXK07-050-E1 | AUTO | 真バグ | 後段POWER_MODIFY/GRANT_KEYWORD双方へhasCharm=true。 | 【チャーム】付きのあなたのシグニ |
| WX12-CB01-E2 | AUTO | 偽陽性 | SELF-GRANT。 | このシグニは【ダブルクラッシュ】を得る |
| WX13-049-E1 | AUTO | 偽陽性 | GRANT_PROTECTION単体はcollectorがsource自身を守る（`effectEngine.ts:4912-4928`）。 | このシグニはバニッシュされない |
| WX16-051-LAYER-E1 | AUTO | 偽陽性 | 付与能力のsourceはholder、SELF-GRANT。 | このシグニは【ランサー】を得る |
| WX17-072-E1 | AUTO | 偽陽性 | GRANT_PROTECTION単体はsource自身。 | このシグニはバニッシュされない |
| WX22-019-E2 | AUTO | 偽陽性 | GRANT_PROTECTION単体はsource自身。 | このシグニはダウンしない |
| WX24-P1-056-E1 | AUTO | 偽陽性 | SELF-GRANT。 | このシグニは【シュート】を得る |
| WXDi-P06-046-E2-G | AUTO | 偽陽性 | 付与能力holderをsourceとして単体保護。 | このシグニはバニッシュされない |
| WXK09-047-E1 | AUTO | 真バグ | story filterのためSELF-GRANT自動化を外れ別電機を選べる。target.filter.thisCardOnly=trueへ。 | このシグニは効果を受けない |
| WDA-F03-13-E3 | AUTO | 真バグ | BANISH target.ownerをanyへ。engine両場候補対応（`effectExecutor.ts:1679-1684`と共通resolver）。 | シグニ1体を対象とし |
| WDK07-Y13-E1 | AUTO | 偽陽性 | 条件不成立時の対象宣言のみには盤面・ログ上の効果がなく、CONDITIONALはthenだけ実行（`effectExecutor.ts:4740-4760`）。 | シグニ1体を対象とし、あなたのターンの場合 |
| WDK11-012-E1 | AUTO | 偽陽性 | 同上。条件不成立時に対象を選ばない差はゲーム状態を変えない。 | シグニ1体を対象とし、場にイザベラがある場合 |
| WX02-034-E1 | AUTO | 真バグ | BANISH target.ownerをanyへ。 | シグニ1体を対象とし |
| WX02-034-BURST | AUTO | 真バグ | BANISH target.ownerをanyへ。 | シグニ1体を対象とし |
| WXK01-087-E1 | AUTO | 偽陽性 | 条件不成立時の対象宣言のみの省略で実動作同値。 | シグニ1体を対象とし、手札1枚以下の場合 |
| WXK10-104-E1 | AUTO | 真バグ | choice①をSELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS→2 grants{targetsStored}へ。既存語彙（`effectParser.ts:2695-2696`, `effectExecutor.ts:3558-3578`）。 | シグニ1体を対象とし、それは2能力を得る |
| WD21-001-E1 | AUTO | 真バグ | 先頭LOOK_AND_REORDERの前にSHUFFLE_DECK selfを追加。 | デッキをシャッフルし一番上を公開 |
| WX24-P3-038-E1 | AUTO | 真バグ | choice②ADD_TO_LIFE前にSHUFFLE_DECK self。 | デッキをシャッフルし上をライフへ |
| WX24-P4-005-E1 | AUTO | 真バグ | ADD_TO_LIFE前にSHUFFLE_DECK self。 | デッキをシャッフルし上をライフへ |
| WX25-CD1-04-E2 | AUTO | 真バグ | ADD_TO_LIFE前にSHUFFLE_DECK self。 | デッキをシャッフルし上をライフへ |
| WXDi-CP02-040-E1 | AUTO | 真バグ | ADD_TO_LIFE前にSHUFFLE_DECK self。 | デッキをシャッフルし上をライフへ |
| WXDi-P03-004-E1 | AUTO | 真バグ | choice②ADD_TO_LIFE前にSHUFFLE_DECK self。 | デッキをシャッフルし上をライフへ |
| WXDi-P06-030-E1 | AUTO | 真バグ | ADD_TO_LIFE前にSHUFFLE_DECK self。 | デッキをシャッフルし上をライフへ |
| WD20-011-E1 | AUTO | 真バグ | 原因無限定なのにsourceOwner:opponent。GRANT_PROTECTIONの無限定表現へ（collectorは現状opponentを必須、`effectEngine.ts:4912`）。 | このシグニはバニッシュされない |
| WD21-001-E1 | AUTO | 真バグ | level4 branchのsourceOwner限定を除く/全原因耐性語彙へ。 | このシグニはバニッシュされない |
| WX17-072-E1 | AUTO | 真バグ | 同上。 | このシグニはバニッシュされない |
| WXEX1-76-E2-G | AUTO | 真バグ | 同上。 | このシグニはバニッシュされない |
| WXEX2-07-E1 | AUTO | 真バグ | activeCondition TURN_OWNER内actionをSEQUENCE化し、宝石ALLへのGRANT_PROTECTION(BANISH)を追加。 | あなたのターン中、＜宝石＞はバニッシュされない |
| WXK07-043-E1 | AUTO | 真バグ | charm conditional内GRANT_PROTECTIONの原因限定を除く/全原因耐性へ。 | このシグニはバニッシュされない |
| WXK09-047-E1 | AUTO | 真バグ | ON_MATERIAL_USED actionに自身限定のBANISH protectionを追加（既存ability自体は別途未配線だがJSONにも欠落）。 | ターン終了時までバニッシュされない |

## 3. クラスタ所見

- **C001**: 修正不要。16件とも battle専用timingをLLMが読めなかった同一偽陽性。
- **C002**: 1本で束ねられるのは GRANT_PROTECTION 3件。`parseSingleSentence` の期間prefixをaction.durationへ伝播する。POWER系11件とは割れる。
- **C003**: 修正不要。13件ともSELF-SETの慣例。
- **C004**: 修正不要。12件ともscope省略=selfの慣例。
- **C005**: 1本では不可。generic DID-IT で4件済み、REMOVE_CHARM 2件は現parserの結果条件化、REVEAL 2件は枚数条件、UNDER 1件は成功記録が軸。
- **C006**: ほぼ1本。`parseTargetFilter`/各ALL対象の組立時に「【チャーム】が付いている」を`hasCharm:true`へ。REMOVE_ABILITIESを含むaction別入口だけ確認が要る。
- **C007**: 7件は慣例で修正不要。WXK09-047だけstory filterが自己自動選択を阻害するためthisCardOnly追加。
- **C008**: owner無指定3件はtarget owner:anyの規則1本。条件前対象宣言3件は実動作同値。WXK10-104は既存stored-target正準形への個別組替え。
- **C009**: 「デッキをシャッフルし、上をライフへ」をSEQUENCE化する規則で6件、WD21-001は公開前shuffleの別枝。SHUFFLE_DECK語彙・engineは既存（`effectExecutor.ts:2188-2196`）。
- **C010**: 「バニッシュされない」の無限定形をsourceOwner:opponentへ狭めない規則で5件。WXEX2-07は能力1本欠落、WXK09-047は複数能力の一部欠落。なお既存collectorがsourceOwner:opponentを必須にしており、全原因耐性の表現方法は段2着手時に既存キーワード/collector経路を選ぶ必要があるが、型追加が必須とは断定しない。

## 4. 機構待ち

0件。PLAN §6.3/§6.4、BUGFIXESを検索した。今回必要な hasCharm、owner:any、SHUFFLE_DECK、stored targets、lastProcessed条件は既存。C010の全原因耐性は既存collectorの表現選択を段2で要確認だが、現時点では「語彙・型が存在しない」とまでは言えないため真バグに置いた。

## 5. 段0判定への反証

0件。除去済み228件を再展開しての全件再監査は今回の禁止スコープ外であり実施していない。今回残存C005の9件については、generic gateで実際に救済される4件と救済されない5件を分けた。

## 6. 条件以外で見つけた原文との食い違い

0件（各findingが指摘した主論点以外の新規差分は確認できなかった）。

## 7. ゲート・差分

`npm run gates` 全緑。ベースライン一致:

- golden PASS 2325 / FAIL 0
- smoke 10693効果、OK 10693 / CRASH 0 / HANG 0 / INVARIANT 0 / SKIP 0
- fuzz CRASH/HANG/INVARIANT/EXPLOSION 0
- census 高シグナル 783 / ベースライン 783
- census:stubs 無言no-op 0（🔴0 / C群0）
- manual-fields 0 effects
- lint 0 errors / 260 warnings
- typecheck PASS

`git status --short` / `git diff --stat` は下記「最終差分確認」の実測どおり。作業開始前からMだった計器2本以外のtracked差分は0。

## やらなかったこと／判断保留

- parser/engine/live JSONは変更していない。commit/push、PLAN/PLAN_PROGRESS/BUGFIXES簿記、C011以降の調査もしていない。
- 要追調査0件。ただしC010の「全原因バニッシュ耐性」をどの既存表現へ正準化するかは段2実装前に小規模実行で確定すべきであり、今回実装判断はしていない。

---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## ゲート独立実行＝ベースライン一致・全緑
golden PASS 2325/FAIL 0／smoke 10693 OK 10693・異常0／fuzz 0／census 783（baseline 783）／census:stubs 0／manual-fields 0／lint 0 errors・260 warnings。
`git diff --stat` は空（tracked 変更は計器2本＝作業前から M）。**Codex は既存ファイルを1つも変更していない**＝申告どおり。

## 偽陽性66件のサンプリング裏取り＝3大ファミリ41件は判定正しい
- **BATTLE（16件）** ✅ `ON_SIGNI_BANISH_OPPONENT` は**バトルバニッシュ経路のみ配線**（`BattleScreen.tsx:9580-9582` に明記）。効果バニッシュは別 timing `ON_SIGNI_BANISH_OPPONENT_BY_EFFECT`（`triggerCollect.ts:4463-4478`）。⚠Codex が挙げた行番号 `triggerCollect.ts:2338-2410` は別機構（DOWN/UP トリガ）で**引用が不正確**。結論は正しい。
- **SELF-SET（13件）** ✅ `execPowerSet` に `if (ctx.sourceCardNum && cands.includes(ctx.sourceCardNum)) return done(applyPowerSet([ctx.sourceCardNum], ctx));`（`effectExecutor.ts:1701-1704`）＝「このシグニ」は自動適用。
- **OWN-END（12件）** ✅ `collectTurnTriggers` は自分場ループが `(eff.triggerScope ?? 'self') !== 'self'` で continue（`triggerCollect.ts:4118`）、相手場ループは `any_opp`/`any` 必須（`:4202-4203`）＝scope 省略はターンプレイヤー側のみ収集。

## 真バグ側のサンプリング裏取り＝正しい
- **C006 hasCharm（8件）** ✅ 型に存在（`types/effects.ts:663`）・engine が消費（`effectEngine.ts:754-757` `matchesFilter`／`:1324` `matchesStateFilter`）・live JSON に19箇所の使用実績。＝**engine は解決できる／parser が生成していないだけ**（CODEX_GUIDE §5-2 の「engine が評価できるか」確認済み）。
- **C009 SHUFFLE_DECK（7件）** ✅ `WX24-P4-005-E1` の live は `SEQUENCE[ADD_TO_LIFE, LIFE_CRASH, CONDITIONAL{IS_MY_TURN}]` で **`SHUFFLE_DECK` が無い**。原文「あなたのデッキをシャッフルし一番上のカードをライフクロスに加える」と食い違う。

## 🔴 Codex の判定に誤りが1件（真バグの取りこぼし）
**`WX14-030-E1` は「偽陽性」ではなく真バグ。**
Codex の根拠は「`TRANSFER_TO_DECK` は DID-IT 対象、4枚未達なら後段抑止」だが、
**live の action には `CONDITIONAL{IS_MY_TURN}` プレースホルダが存在しない**：
`SEQUENCE[TRANSFER_TO_DECK, CHOOSE]`。
did-it ゲート（`effectExecutor.ts:4866`）は **`a.steps[i+1]` が `CONDITIONAL{IS_MY_TURN}` であること**を要求するので、
ここでは発火しない。原文「そうした場合、以下の３つから１つを選ぶ」の条件は**丸ごと脱落**している。
＝**C005 は 真バグ6 / 偽陽性3** が正。バッチ計は **真バグ36 / 偽陽性65**。
⚠失敗モード＝**クラスタの共通根拠（DID-IT）を、構造が違う1件へそのまま適用した**（CODEX_GUIDE §5-5e の同型）。

## 🔵 逆に Claude の段0 判定のほうが誤っていた（Codex が正しい）
段0 の `FP_DIDIT_GATE` 判定は **`else` 無し `CONDITIONAL` のアンラップを再現していなかった**。
engine は `const gateStep = (step.type === 'CONDITIONAL' && !step.else) ? step.then : step;`（`effectExecutor.ts:4832` タスク12(lxiii)）で
包み条件つき前段もゲート対象にする。実測で `WX12-014-E1`(→LIFE_CRASH)／`WX25-P2-063-E2`(→TRANSFER_TO_DECK)／`WXK03-021-E1`(→BANISH) は
**アンラップするとゲート有効＝偽陽性**で、Codex の判定が正しかった。
段0 スクリプトを修正済み（`scripts/archive/semanticAuditStage0.mjs`）＝**OPEN 1216 → 1212件**（`FP_DIDIT_GATE` 118→122）。

## 残作業への申し送り
- **段2 の束ね候補（parser 規則1本で複数件）**＝C006 hasCharm 8件／C009 SHUFFLE_DECK 7件／C002 GRANT_PROTECTION duration 3件／C008 `owner:any` 3件。
- **C010「バニッシュされない」7件は段2 前に表現の正準化が要る**（Codex 所見）＝`GRANT_PROTECTION` の collector が `sourceOwner:'opponent'` を必須にしており「全原因耐性」の表し方が未確定（`effectEngine.ts:4912`）。**先に表現を決めること**。
- **`WX21-042-E2`（`TAKE_FROM_UNDER_SIGNI` が lastProcessed を記録しない）は engine 修正**＝Opusタスク12 の受け口へ。PLAN §3 の follow-up①（同 action の逆翻訳が枚数・destination を落とす）と同じカード群。
