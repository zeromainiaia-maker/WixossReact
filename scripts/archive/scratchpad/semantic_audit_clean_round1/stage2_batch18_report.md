# §6.2 段2 第18バッチ報告

## 1. 触ったファイル

- `src/data/effectParser.ts`：既存の「基本形→強化形」2連発を、原文条件つきの排他的 `CONDITIONAL{then,else}` へ畳む一般規則を追加。
- `scripts/goldenTest.ts`：採用6効果の成立／不成立E2Eと、据置4効果の非採用契約を追加。
- `scripts/vocabCensus.ts`：実測改善 713→708 に合わせて baseline を更新。
- `public/data/effects_WX.json`／`effects_WX24_26.json`／`effects_WXDi.json`／`effects_WXK.json`：採用6効果のlive。
- `docs/decompile_sheet2/3/8/9.txt`、`docs/_vocab_census.txt`、`docs/_census_stubs.txt`、`docs/_manual_drift.txt`、`docs/grouped_sentence_all.txt`：指定再生成物。
- `docs/BUGFIXES.md`：本バッチの一次記録。
- 本報告書：判断、全効果の採否、計測値を固定。

## 2. 調査結果（9効果＋単発1件）

| effectId | 判定 | 条件語彙 | 消費地点 |
|---|---|---|---|
| WX09-045-E1 | 据置 | 該当なし（自場赤3体が共通クラスを持つ条件が無い） | 該当なし |
| WX13-058-E2 | 採用 | `TRASH_HAS_CARD{cardType:'シグニ',cardName:'ダイオ姫'}` | `execUtils.ts:1798` |
| WX22-020-E2 | 採用 | `IS_DRIVE_STATE` | `execUtils.ts:1963` |
| WX25-P2-078-E1 | 採用 | `THIS_CARD_IS_AWAKENED` | `execUtils.ts:1912` |
| WXK02-052-E1 | 採用 | `LAST_PROCESSED_MATCHES{filter:{isFrozen:true}}` | `execUtils.ts:2317` |
| WXDi-P06-084-E1 | 据置 | 該当なし（場全体の attached OR under が無い） | 該当なし |
| WXDi-P13-005-E1 | 採用 | `LAST_PROCESSED_MATCHES{filter:{isDisona:true}}` | `execUtils.ts:2317` |
| WXDi-P16-089-E1 | 据置 | 該当なし（ソウル限定条件が無い） | 該当なし |
| WXDi-P16-087-E1 | 採用 | `LAST_PROCESSED_LEVEL_SUM{lte,3}` | `execUtils.ts:2246` |
| WXDi-P00-037-E1 | 据置 | 本体語彙なし | 該当なし |

## 3. 採用した効果（per-effect）

### WX13-058-E2

- 原文：相手シグニ1体をセンタールリグLv×−1000。トラッシュにカード名が《ダイオ姫》を含むシグニがある場合、代わりに相手のすべてのシグニへ同値。
- 生成JSON：`{"type":"CONDITIONAL","condition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardType":"シグニ","cardName":"ダイオ姫"}},"then":{"type":"POWER_MODIFY_PER_LRIG_LEVEL","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"deltaPerLevel":-1000,"lrigOwner":"self"},"else":{"type":"POWER_MODIFY_PER_LRIG_LEVEL","target":{"type":"SIGNI","owner":"opponent","count":1},"deltaPerLevel":-1000,"lrigOwner":"self"}}`
- 逆翻訳全文：【起】（メイン起動）：〈このシグニを場からトラッシュに置く〉あなたのトラッシュにカード名に《ダイオ姫》を含むシグニがあるなら、対戦相手のすべてのシグニのパワーをセンタールリグのレベルに応じて－1000ずつ変更する、そうでなければ対戦相手のシグニ1体のパワーをセンタールリグのレベルに応じて－1000ずつ変更する
- 一致：一致。

### WX22-020-E2

- 原文：攻撃時7000以下1体をバニッシュ。ドライブ状態なら代わりに12000以下1体。
- 生成JSON：`{"type":"CONDITIONAL","condition":{"type":"IS_DRIVE_STATE"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":7000}},"upToCount":false}}}`
- 逆翻訳全文：【自】このシグニがアタックしたとき：このシグニがドライブ状態なら、対戦相手のパワー12000以下のシグニ1体をバニッシュする、そうでなければ対戦相手のパワー7000以下のシグニ1体をバニッシュする
- 一致：一致。

### WX25-P2-078-E1

- 原文：攻撃フェイズ開始時、相手ルリグと共通色でない相手エナ1枚をトラッシュ。覚醒なら代わりに3枚まで。
- 生成JSON：`{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_IS_AWAKENED"},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":3,"upToCount":true,"filter":{"colorNotMatchesLrig":true}}},"else":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"colorNotMatchesLrig":true}}}}`
- 逆翻訳全文：【自】あなたのアタックフェイズ開始時：このシグニが覚醒状態なら、対戦相手のセンタールリグと共通色でないエナを3枚までトラッシュに置く、そうでなければ対戦相手のセンタールリグと共通色でないエナを1枚トラッシュに置く
- 一致：一致。

### WXK02-052-E1

- 原文：攻撃時に相手シグニ1体を対象として凍結。すでに凍結なら代わりに1ドロー。
- 生成JSON：`SEQUENCE[SELECT_TARGET_ONLY,STORE_LAST_PROCESSED_TARGETS,CONDITIONAL{LAST_PROCESSED_MATCHES(isFrozen),then:DRAW1,else:FREEZE(targetsStored)}]`
- 逆翻訳全文：【自】このシグニがアタックしたとき：対戦相手のシグニ1体を対象とする。そしてこの方法で凍結状態のカードを1枚以上処理したなら、あなたのカードを1枚引く、そうでなければ対戦相手のシグニ1体を凍結する
- 一致：意味一致。対象決定前後の順序も原文どおり。

### WXDi-P13-005-E1

- 原文：2ドロー1捨て後、相手Lv1シグニ1体をバニッシュ。捨てた札がディソナなら代わりにレベル制限なし。
- 生成JSON：`SEQUENCE[DRAW2→TRASH1,CONDITIONAL{LAST_PROCESSED_MATCHES(isDisona),then:BANISH(any level),else:BANISH(level1)}]`
- 逆翻訳全文：【起】（メイン起動）：〈《無×2》〉あなたのカードを2枚引く。そしてあなたの手札を1枚トラッシュに置く。そしてこの方法で《ディソナアイコン》を持つカードを1枚以上処理したなら、対戦相手のシグニ1体をバニッシュする、そうでなければ対戦相手のレベル1のシグニ1体をバニッシュする
- 一致：一致。

### WXDi-P16-087-E1

- 原文：2ドロー2捨て後、捨てたシグニLv合計3以下なら次の相手ターン終了時まで自己+5000、4以上なら相手2000以下1体をバニッシュ。
- 生成JSON：`SEQUENCE[DRAW2→TRASH2,CONDITIONAL{LAST_PROCESSED_LEVEL_SUM(lte3),then:POWER_MODIFY(+5000,UNTIL_OPP_TURN_END),else:BANISH(power<=2000)}]`
- 逆翻訳全文：【自】このシグニが場に出たとき：あなたの場に＜NoLimit＞のルリグが3体以上の場合、あなたのカードを2枚引く。そしてあなたの手札を2枚トラッシュに置く。そして直前に処理したシグニのレベル合計が3以下なら、このシグニのパワーを＋5000する（次の相手ターン終了時まで）、そうでなければ対戦相手のパワー2000以下のシグニ1体をバニッシュする
- 一致：一致。前段入れ子SEQUENCEの `lastProcessedCards` が条件まで残ることをE2E確認済みで、`snapshotLastProcessedForConditionals` は不要。

## 4. 見送った効果

- `WX09-045-E1`：`HAS_CARD_IN_FIELD{minCount:3,color:'赤'}` は赤3体までは見られるが「それらが共通するクラス」を評価しない。相手強化対象に誤付与された `color:'赤'` も条件代用にならないため据置。
- `WXDi-P06-084-E1`：既存 `THIS_CARD_HAS_ATTACHED`／`THIS_CARD_HAS_UNDER` は効果元1体だけを見る。原文は場の任意シグニについて「付いているカード OR 下カード」があるかであり、流用すると過小実行。
- `WXDi-P16-089-E1`：`THIS_CARD_HAS_ATTACHED` はチャーム＋アクセ＋ソウル合計。ソウル限定へ使うとチャーム／アクセでも3000枝が走るため据置。
- `WXDi-P00-037-E1`：検討した `TRASH{HAND_CARD,blind:true,count:3}` は3枚を捨てる別物、`LOOK_AND_REORDER` は相手手札から1枚だけをデッキ下へ選ぶフローを持たず、`TRANSFER_TO_DECK{SIGNI}` は対象ゾーン自体が違う。正しい語彙が無いため据置。
- 指示の「触ってはいけない群」は全件変更0。

## 5. 条件以外で見つけた原文との食い違い

- `WX09-045-E1`：強化枝targetの `color:'赤'` は原文に無い（既知finding、据置）。
- それ以外は0件。

## 6. ゲート

| 計器 | 結果 |
|---|---|
| golden | 2387 / FAIL 0（baseline 2380、+7） |
| census | 708 / baseline 708（713→708） |
| smoke | 10693 / CRASH 0 HANG 0 INVARIANT 0 / SKIP 0 |
| fuzz | 全0 |
| census:stubs | A群0 / C群0 |
| manual-fields | 0 |
| lint | 0 errors / 261 warnings（増減0） |
| groupSimilar --all | 同型★0 |
| held / partial / idset | 88 / 15 / 46 |
| censusManualDrift 削除候補 | 86（増減0） |

`npm run regen`、`npm run gates` は全緑。

## 7. 生パースdiffとoutlier

変化集合は採用6効果だけ：`WX13-058-E2`、`WX22-020-E2`、`WX25-P2-078-E1`、`WXK02-052-E1`、`WXDi-P13-005-E1`、`WXDi-P16-087-E1`。追加／削除／parseStatus変更0、outlier 0。

## 8. held と lint

- held は開始時88。parser変更後、対象6カードが要レビューへ正直に現れ、6件を1件ずつ原文照合して個別採用。報告直前の再build→heldReview実測は88で、最終増減0。
- partial 15、idset 46、ともに増減0。
- lint warning 261→261、error 0→0。

## 9. 真バグごとの慣例エンコード検討

- WX13-058-E2：差分加算は単体選択＋全体処理で対象集合が違うため不可。then/elseを採用。
- WX22-020-E2：7000枝後に差分5000を足す語彙ではなく対象上限の置換。then/elseを採用。
- WX25-P2-078-E1：1枚＋追加2枚では「3枚まで」の一回選択にならない。then/elseを採用。
- WXK02-052-E1：FREEZE後の状態判定は常に真になるため排除。SELECT→STORE→事前状態条件→同一対象FREEZEを採用。
- WXDi-P13-005-E1：Lv1 BANISH後に無制限BANISHを足すと2体処理。捨て札snapshotのthen/elseを採用。
- WXDi-P16-087-E1：独立gte4 conditionalも検討したが、既存lte3 conditionalのelseなら排他性が構造上保証され、snapshot追加も不要。
- 据置4件については §4 のとおり、近似語彙を検討して意味不一致を確認したため不採用。

## 10. やらなかったこと

- 表現不能4効果を近似修正しなかった。
- 触ってはいけない群を変更しなかった。
- engine／型union／manualEffectsを変更しなかった。
- PLAN.md／PLAN_PROGRESS.mdを編集しなかった。
- commit／pushしていない。

