# パーサー修正：定量ワークリスト（終わりが見える計画）

> **目的**：パーサー修正を「手当たり次第のキーワード探し」から「**有限の・進捗が測れる**作業」に変える。
> このファイルは計器 `scripts/parserWorklist.ts` の出力スナップショット＋段階計画。
> **数字は `npx tsx scripts/parserWorklist.ts` でいつでも再生成**（live な真実はスクリプト側）。

## 0. 全体の母数（5973効果カード）と「終わり」の定義
| 区分 | 枚数 | 状態 |
|---|---|---|
| parser == 既存JSON | 約5400 | **解決済み**（同型★0で構造検証済み） |
| MANUAL（手書き効果） | 約165 | 意図的にパーサー対象外（型どおり） |
| **held（parser ≠ 既存JSON）** | **404** | ↓ ここが全作業 |

**held の内訳（1カード=1プライマリバケツ・重複なし）** ← 数字は計器の最新値（下の進捗ログ参照）
| トラック | 初期 | 現在 | 性質 | 対応 |
|---|---|---|---|---|
| **① LOSS** | 255 | **234** | 既存JSONが持つ構造をパーサーが出せない＝**真の弱点** | **直す**（この計画の本体） |
| ② VALUE | 149 | 153 | 同キーで値が違うだけ＝慣例/効果分割ズレの水増し | **1件ずつ人間判断**（bulk禁止・§2） |
| ③ ADD/OTHER | 0 | 0 | — | — |
| held合計 | 404 | **387** | | |

### 進捗ログ（LOSS が減る＝前進）
- 2026-06-27 起点: held 404 / LOSS 255。
- 2026-06-28 🎉 R29（残 LOSS 6枚を個別対応／ymst）: 4枚を engine 確認のうえ実修正/MANUAL化（WDK08-L14 resync・WXDi-D09-P18 覚醒activeCondition付与・SP27-016 SEARCH再構築・WXK05-030 印字検出で機能的に正）。**LOSS 6→2／held 162→161**。**LOSS 255→2＝パーサー整合ワークリスト実質完了**。残2＝engine トリガー未配線（WXK10-022 `ON_OPPONENT_SIGNI_PLAY`／WX20-026 自クラス効果ドロー trigger）＝データ不能・`TODO.md` §3 機構④へ登録。
- 2026-06-28 🏁 R28（LOOK/REVEAL 一族61枚 MANUAL化／ymst）: エンジン調査で REVEAL_AND_PICK＝取得実装あり／LOOK_AND_REORDER＝並べ替え専用と確定→take系 canonical は REVEAL_AND_PICK。残LOSSの LOOK/REVEAL 61枚（action.type 57＋filter.cardType 3＋PR-457）を MANUAL化。**LOSS 67→6／held 226→165**。**LOSS 255→6 でワークリストほぼ完了**。残6＝個別判断の難物（WX20-026/WXK05-030/WXDi-D09-P18/WXK10-022/SP27-016/WDK08-L14）→VALUE最終レビューへ合流。別軸＝LOOK_AND_REORDER curate 約252枚の取得未実装疑い（要精査）。
- 2026-06-28 R27（action.type の非LOOK/REVEAL 17枚 MANUAL化／ymst）: action.type 76枚を全数 triage。大半(~59)は LOOK/REVEAL一族で bulk送り。非LOOK/REVEALの17枚のみ MANUAL化（CHOOSE構造崩壊・「代わりに」二重適用・CONDITIONAL/cost脱落）。**LOSS 84→67（−17）／held 243→226**。🚩**1枚ずつのクリーン鉱脈は枯渇**。残 LOSS 67 はほぼ LOOK/REVEAL（REVEAL_AND_PICK↔LOOK_AND_REORDER）の bulk正規化案件＝次フェーズは canonical を決める設計判断。保留2＝WDK08-L14/WXK10-022。
- 2026-06-28 R26（filter（その他）バケツ全 MANUAL化／ymst）: 21枚すべて「EXIST正・FRESH退化」（acceHost/cardClass/level/levelLteDiscardSigni/eachDistinctColor/commonClass/keyword/powerRange 脱落、ON_ACCE timing穴、STUB退化）と判定し MANUAL化。stale/LOOK-REVEAL なし。**LOSS 105→84（−21）／held 264→243**。残 LOSS 84 の大半は action.type 76（構造差）。
- 2026-06-28 R25（filter.cardType／count バケツ triage／ymst）: 2刀流で15枚処理。MANUAL化6（WX10-007/021・WXDi-P12-060・WXDi-P15-093・WX24-P1-076・WXK08-045）＋resync/採用9（WXK04-042・WXDi-P14-077-E1・WX25-P1-018・WX25-P1-026・WX25-P1-115・WXK04-002・SPDi01-121・SPDi44-04・SPDi44-08＝stale JSON の実バグ修正）。**LOSS 120→105（−15）／held 279→264**。⚠SKIP＝REVEAL_AND_PICK 3枚（LOOK/REVEAL一族）・WXDi-D09-P18（覚醒・両不正確）。
- 2026-06-27 R24（stale データ6枚を FRESH へ再同期/採用／ymst）: R23 で発見した逆パターン（FRESHの方が正しい）を `scripts/_resync.ts` で処理＝**実 runtime バグ修正**（JSON直ロードのため stale が誤動作していた）。①再同期3＝WXK04-030（相手シグニ全バニッシュ誤実装→血晶武装）・WX25-CP1-030・WX25-CD1-06（2択喪失→復元）。②data採用3＝WX24-P3-064・WXK07-027（無条件バフ→トラッシュ条件+thisCardOnly）・WX21-Re09（timing誤り→triggerFilter正配置）。**LOSS 126→120（−6）／held 285→279**。⚠WX20-026-E3 不採用（過剰発火・LOSS据置）。
- 2026-06-27 R23（小バケツ hard-tail の MANUAL化／ymst）: action.id 4／condition.type 2／costThreshold 1／optional 2／then 3＝計12枚を「EXIST正・FRESH退化」確認のうえ MANUAL化。**LOSS 138→126（−12）／held 297→285**。⚠逆パターン発見＝FRESH の方が正しいカード（JSON stale 再同期＝WX25-CP1-030/CD1-06/WXK04-030、data採用＝WX24-P3-064/WXK07-027/WX20-026/WX21-Re09、curation＝SP27-016/WXK05-030）は MANUAL化せず別処理（BUGFIXES 先頭参照）。
- 2026-06-27 R22（powerRange anaphora／トリガー穴 hard-tail の MANUAL化／ymst）: R21 継続。triggerCondition/Scope バケツ6枚（WXDi-P06-052・WXK01-076・WXK01-079・WXK07-061・WXK09-038・WDK14-014）を MANUAL化。①「対象とし…そうした場合それをバニッシュ」の文跨ぎ照応で powerRange 脱落（effectParser.ts:1399-1405）②ON_SIGNI_BECOMES_DRIVE/ON_HAND_DISCARDED/ON_BECOME_BEAT は timing 検出ロジックが無く ON_PLAY 退化。差分effectのみ・runtime不変・構造完全一致を検証。**LOSS 144→138（−6）／held 303→297**。triggerCondition バケツ枯渇。
- 2026-06-27 R21（hard-tail の MANUAL化／ymst）: クリーンなパーサー鉱脈が枯れたため、**既存JSONが正しく完成済みだがパーサー再現不能な hard-tail を parseStatus:MANUAL 化**する戦略へ移行。batch1＝GRANT_ACCE 6枚（内側手書き品質）／batch2＝機構依存5枚（機構④/placedDown/傀儡）。差分effectのみMANUAL化・メタデータのみ・runtime不変・キー順保持を検証。**LOSS 155→144（−11）／held 314→303**。⚠LOOK/REVEAL・CHOOSE は curation 不整合のため MANUAL化せず（凍結回避＝bulk正規化案件）。
- 2026-06-27 R20（filter（その他）・levelLteLastProcessed／ymst）: 「この方法で…したシグニのレベル以下」の動的レベル参照を `parseLevelLteLastProcessed` 新設し BOUNCE/SEND_TO_ENERGY/SEARCH の3ハンドラに適用。**LOSS 158→155（−3）／held 317→314**（WX21-022/WX24-P3-026/WXEX2-17 IDENTICAL）。同型★0維持・typecheck緑・JSON無変更。
- 2026-06-27 R19（filter（その他）・《ガードアイコン》hasGuard/noGuard／ymst）: `parseGuardFilter` ヘルパー新設しトラッシュ→手札（spanTxt限定）／トラッシュ→エナ汎用に適用。**LOSS 162→158（−4）／held 321→317**（WXDi-P00-025/P01-011 hasGuard・WXDi-P01-030/P07-029 noGuard が IDENTICAL）。同型★0維持・typecheck緑・JSON無変更。helper 化で横展開容易。
- 2026-06-27 R18（filter（その他）・BOUNCE「このシグニを手札に戻す」thisCardOnly／ymst）: BOUNCE handler（part1:866）が自身限定 thisCardOnly を落としていた。`/このシグニを(?:場から)?手札に戻/` で付与。**LOSS 165→162（−3）／held 324→321**（WXK06-034/036/WXK10-061 IDENTICAL）。同パターンの3枚は別 STUB 差分で held 継続。同型★0維持・typecheck緑・JSON無変更。filter（その他）バケツ細分の最大＝thisCardOnly 6枚のうち clean 3枚を解消。
- 2026-06-27 R17（データ正規化・stale ENERGY_CHARGE{DECK_CARD}→ADD_TO_ENERGY／ymst）: 「デッキ一番上を公開→それが〔X〕の場合エナに置く」の REVEAL_AND_PICK.then が HEAD で stale な `ENERGY_CHARGE{DECK_CARD}`（既知 engine バグ形・effectParser.ts:1284）。パーサー正値 `ADD_TO_ENERGY{owner:self}` に JSON パッチ3枚（WX12-051/052/WX18-070）＝IDENTICAL 化。**LOSS 168→165（−3）／held 327→324**。同パターンの残17枚は別差分ありで対象外。同型★0維持・typecheck緑・パーサー無変更（データのみ）。
- 2026-06-27 R16（Stage B・CHOOSE←BANISH 3枚＝着手→curation 不整合判明→revert／ymst）: WXK07-069/WDK01-020/WDK08-L20（spell「以下の２つから１つを選ぶ。①…トラッシュ→バニッシュ ②【エナチャージ１】」）が①②行・ヘッダ行のフィルタ除去で単一文に潰れ BANISH だけ漏れていた。CHOOSE 復元を試みたが、非アンカー版で +51／文頭アンカー版でも **+99 退行**。**根本＝R14 と同じ curation 不整合**＝「先頭が選択ヘッダ＋①②」のカード156枚のうち既存が CHOOSE は**73枚のみ**、残83枚は SEQUENCE32/STUB11/TRANSFER_TO_HAND6 等の**非 CHOOSE**（同一テキスト形でも curation がバラバラ＝判別シグナル無し）。早期/文頭 interceptor はこの83枚を壊す。→ revert（held 327 復帰・コード無変更）。**この3枚＝着手禁止**（VALUE の最終 CHOOSE curation 統一案件）。LOSS 168 不変。
- 2026-06-27 R15（Stage B・LAST_PROCESSED_HAS_TYPE CONDITIONAL 復元／ymst）: 「この方法でトラッシュに置いたカードの中にスペルがある場合、カードを１枚引く」の条件が落ちて DRAW を無条件化していた。`parseSingleSentence` の「…場合」CONDITIONAL 群に `^この方法で.*?の中に(スペル|シグニ|アーツ|ルリグ)がある場合、(.+)`→CONDITIONAL{LAST_PROCESSED_HAS_TYPE} を追加。**LOSS 170→168（−2）／held 329→327**（WX12-054/055 IDENTICAL）。R14 教訓どおり逆方向ペア DRAW←CONDITIONAL=0 を事前確認。同型★0維持・typecheck緑・JSON無変更。残2（WX18-064=LIFE_CRASHED／WDK14-013=BEAT＋cost脱落）は別パターン。
- 2026-06-27 R14（Stage B・LOOK/REVEAL 一族＝着手→curation 不整合判明→全 revert／ymst）: R4 の「正道」処方（pick動詞ガード＋REVEAL_AND_PICK 分岐拡張）を実装したが **held 329→434（+105）の退行**。**根本＝既存 curation が不整合**（同一文法で REVEAL_AND_PICK 23枚 vs LOOK_AND_REORDER 119枚・判別シグナル無し）。パーサーの現状（LOOK_AND_REORDER）が多数派119枚に正しく一致＝23枚は outlier。**パーサー単独では net 改善不能＝VALUE の最終 curation 統一案件**。全 revert（held 329 復帰）。詳細＝下「🅑 Stage B」⛔R14。**この23枚は着手禁止**。LOSS 170 不変。
- 2026-06-27 R13（Stage B 第2弾・GRANT_ACCE_HOST_ABILITY wrapper 復元／ymst）: 「これにアクセされている[＜X＞の]シグニは『…』を得る」が splitSentences で wrapper を割られ内側能力が単独効果に漏れていた（fresh が GRANT_ACCE_HOST_ABILITY を出せず全 leaf 喪失）。`parseActionText` 冒頭で wrapper を捕捉し rawText→`parseBlock` 再帰展開（GRANT_LRIG_ABILITY と同方式・effectId `{cardNum}-E{N}-G`）。本体は引用「」/『』 か キーワード【】 始まり限定（「すべての色を得る」専用STUB を誤捕捉せず＝WX22-043 退行を narrow 化で回避）。**LOSS 178→170（−8）／held 329 不変（横取り退行0）**。8枚 LOSS→VALUE（WX15-058/WX21-041/WXEX1-70/WXDi-P09-TK02A は inner parseStatus・WX15-102/105/WXK04-050 は inner GRANT_PROTECTION count・WX20-045 は FORCE_FRONT↔FORCE）。残6枚（WX16-074/WX17-075/WX17-077/WXK10-074/WXK10-075/WDK07-E14）は内側が MANUAL 専用（triggerScope/isTriggerSource/独自CHOOSE）で再現不能＝LOSS 残。同型★0維持・typecheck緑・effects_*.json 無変更。
- 2026-06-27 R1（filter.cardType・crossState条件）: 「(あなた\|相手)の場にクロス状態の[＜X＞の]シグニがある」を COND_STUB→HAS_CARD_IN_FIELD 正規化（engine実装済み）。**filter.cardType 30→16**。held 404→394 / **LOSS 255→241**。JSON無変更（既存が正・パーサーが再現できるようになった）。
- 2026-06-27 R2（filter.color・colorMatchesLrig）: 「トラッシュから(センタールリグと共通する色を持つ)〔シグニ/カード/スペル〕…手札に加える」の名詞句限定で colorMatchesLrig 付与（engine動的解決済み）。**filter.color 11→5**。held 394→388 / **LOSS 241→235**。既存が取りこぼしていた7枚に colorMatchesLrig を純改善採用（latent curation bug 修正）。残5＝WX04-021（filter.color 黒・別件）＋SEARCH/reveal の action.filter 4枚（別handler・follow-up）。
- 2026-06-27 R3（filter.cardType・複数クラスバフ）: 「あなたの[他の]＜X＞と＜Y＞のシグニのパワーを±N」のゲート正規表現が単一クラスしか許さず default（owner:any/count:1）に落ちていたのを複数クラス対応に拡張。WX04-016/086 一致、WXK04-043/WXDi-P11-041 は**既存JSONが旧バグの owner:any/count:1 を保存していた**ため fresh（正）に直接パッチ。held 388→387 / LOSS 235→234 / filter.cardType 16→15。
- 2026-06-27 R12（Stage B 第1弾・ENERGY_CHARGE→SEND_TO_ENERGY／ymst）: 「対戦相手のシグニをエナゾーンに置く」を HEAD が `ENERGY_CHARGE`+target:SIGNI と mis-curate（正用途は DECK/HAND/TRASH→エナ）。パーサーは既に `SEND_TO_ENERGY`（正）を出力済み＝**データのみ正規化11枚**（型 swap・パーサー変更なし・恒久安定）。**⚠VALUE 161→151（−10）＝LOSS ではなく VALUE トラックだった**（型の値違いのみで lost leaf 無し）。held 339→329・同型★0維持・typecheck緑。WXK10-046 のみ別件 timing で held 残。**教訓＝「action.type 77（LOSS）」は構造差で lost leaf を持つもの＝LOOK/REVEAL 一族が本体。型の値違いだけは VALUE。次は GRANT_ACCE_HOST_ABILITY 約11枚／LOOK・REVEAL 一族 約59枚（要 surgical・LOSS本体）**。
- 2026-06-27 R11.5（Stage C 残り診断＋Stage B 診断／ymst）: **Stage C は clean な山を消化し残り10枚は hard tail**＝①powerRange.max の anaphora 伝播（「パワーN以下のシグニを対象とし…そうした場合、それをバニッシュ」の `それ` に filter 伝播・WXDi-P06-052/WXK07-061/WXK01-076/079・汎用伝播機構が要る）②2枚クラスタの timing+scope（ON_SIGNI_BECOMES_DRIVE/ON_HAND_DISCARDED/ON_BECOME_BEAT＋triggerScope）③Cluster 1 placedDown+targetsTriggerSource（WX10-074/078）。⚠**fromFieldByCostOrEffect は着手禁止**＝「コストか効果によって場から」は HEAD が **fromZones:["field"] が13枚で規約・fromFieldByCostOrEffect は2枚の少数派**。fromField 化すると13枚が退行（+13 held で検知・revert 済）。直すなら少数派2枚を fromZones へ正規化だが powerRange が残るので保留。
  **🅑 Stage B 診断（action.type 77 を HEAD←fresh の型ペアで分解）**：
  | 枚 | HEAD型 ← fresh型 | 系統 |
  |---|---|---|
  | 23 | SEQUENCE ← REVEAL_AND_PICK | LOOK/REVEAL 一族 |
  | 23 | REVEAL_AND_PICK ← LOOK_AND_REORDER | LOOK/REVEAL 一族（退化） |
  | 10 | SEQUENCE ← LOOK_AND_REORDER | LOOK/REVEAL 一族 |
  | 3 | STUB ← LOOK_AND_REORDER | LOOK/REVEAL 一族 |
  | **11** | **ENERGY_CHARGE ← SEND_TO_ENERGY** | **非REVEAL・最有望の clean 型ミス**（WX20-046/WXDi-P02-023/WX24-P2-007…） |
  | ~11 | GRANT_ACCE_HOST_ABILITY ← STUB/GRANT_PROTECTION/DRAW/GRANT_KEYWORD | アクセ host 付与一族 |
  | 4 | CONDITIONAL ← DRAW | WX12-054/055/WX18-064/WDK14-013 |
  | 3 | CHOOSE ← BANISH | WXK07-069/WDK01-020/WDK08-L20 |
  - **LOOK/REVEAL 一族＝約59枚**（最大レバーだが R4 で「広域ハンドラ＝+129退行」確認済＝§🅑 R4 記録の surgical 手順必須）。**先に潰すべき低リスク候補＝ENERGY_CHARGE←SEND_TO_ENERGY 11枚**（単一 handler の型ミスの可能性大）。
- 2026-06-27 R11（Stage C 本丸・turnOwner／ymst）: 《自分ターン》《相手ターン》を **AUTO/ACTIVATED でも** `triggerCondition.turnOwner` 化（従来 CONTINUOUS の activeCondition のみで AUTO は「engine未整備」と見送られていたが機構④で配線済み）。effectParser.ts:1948 に else-if 追加。**LOSS 206→178（−28・最大の単発）／held 360→339**。turnOwner 値衝突0・同型★0維持・typecheck緑。VALUE +7 は LOSS→VALUE 再分類（timing別ズレ・held のまま）。
- 2026-06-27 R10（Stage C 第1弾・トリガー検出／ymst）: ①ON_PLAY「あなたの**他の**シグニが（効果によって）場に出たとき」の正規表現に `(他の)?` 追加＝excludeSelf 付与（1641）②UP「このシグニをアップ」に thisCardOnly（44枚 harvest）③ON_TRASH の出自ゾーンを `fromZones` 記録（deck/field/hand+deck・63枚 harvest・engine未使用＝表現専用）④自己蘇生「場に出してもよい」の optional（15枚 harvest）。**LOSS 210→206**（WX10-080/083/092/WX02-073）。同型★0維持・typecheck緑。**保留**＝Cluster 1（WX10-074/078 placedDown＋targetsTriggerSource「そのシグニ」自動対象化）は機構追加が要るため次。
- 2026-06-27 R9（filter.color・trash→hand単色＋colorMatchesLrig共用化／ymst）: ①trash→hand に**一意な単色のみ** filter.color 付与（R5 で色を落としていた・複色「白か赤」「白と黒」は誤るので除外＝WX04-021 解消＋単色56枚採用）②`parseColorMatchesLrig` ヘルパーを parserUtils に新設し SEARCH/trash→hand/trash→field に適用（WDK13-009/PR-K064/WX19-004 解消）。**LOSS 214→210**。同型★0維持・typecheck緑。残 filter.color＝PR-457（REVEAL_AND_PICK の colorMatchesLrig＝Stage B 一族）。
- 2026-06-27 R8（filter.cardType・任意捨てコスト／ymst）: `parseSentencePart3.ts` 行1053「手札から＜X＞のシグニをN枚捨ててもよい」が `parseCardTypeFilter(＜X＞)` のみでクラスを空 filter に落としていた（捨てる版 part1:1623 と不整合）。cardType:シグニ＋story/color/level を付与。**35枚の空 filter curation bug を純改善採用**。cardClass→story 正規化4枚（WX21-017/018 解消・WXDi-D08-013/P14-084 は optional 脱落が別途残）。**LOSS 216→214**。同型★0維持・typecheck緑。残 filter.cardType は REVEAL一族（WX10-007/021・WXDi-P14-077・WX24-P1-020/WX25-P1-037＝Stage B）と duration慣例絡み（WXDi-P15-093/WX24-P1-076）と POWER_MODIFY全体バフ（WXDi-P12-060）＝いずれも別系統。
- 2026-06-27 R7（count・対戦相手エナ→トラッシュ「N枚まで」／ymst）: handler 行108 の count 抽出 `カード([０-９\d]+)枚` が「カードを２枚まで」の `を` で外れ count:1 に落ちていた（+upToCount 未設定）。`カード(?:を)?(N)枚`＋`枚まで`検出で是正。**WX04-010 解消（LOSS 217→216）**。横展開で **curation bug 17枚**（HEAD が旧パーサー出力の誤値 count:1 を保存・実テキストは「N枚まで」）が顕在化＝§2 慣例ではなく実害データ誤りのため parser 正値を直接採用（全件テキストでN照合）。同型★0維持・typecheck緑。
- 2026-06-27 R6（activeCondition 3系統＋ビート全角ブラケット／ymst）: ①SUBSCRIBER_COUNT「登録者数がN万人を達成しているかぎり」追加（WXK08-061/064＋034/038）②IS_SELF_ACCED に「【アクセ】が付いているかぎり」言い回し追加（WDK07-E11）③**《ビートアイコン》の全角 ［］ 対応**＝`beatIconM` が ASCII `[]` のみで実データ全角を取りこぼし＝最大波及（WXK08-041/042/043/046/067/068/073/075・WXK10-041・WDK14-001/011/012 一族解消）＋【常】の beatCondition を activeCondition へ。**LOSS 231→217 / held 384→371**（18枚・全 pure superset）。同型★0維持。残 activeCondition 2＝WX24-P3-064/WXK07-027（TURN_OWNER↔AND 複合・別構造）。
- 2026-06-27 R5（filter.story・トラッシュ→手札／ymst）: `parseSentencePart1.ts` の TRANSFER_TO_HAND トラッシュ handler が `＜種族＞の` を落としていた（WX03-050 の story:'悪魔'）。`トラッシュから(.*?)手札に加える` の名詞句スパン内に限定して `parseStoryFilter` 付与（全文だと WX22-002 等で前置きの条件クラスを誤拾い＝偽陽性7枚）。**LOSS 234→233 / held 387→386**。retrieved-card の class フィルタ取りこぼし132枚を収穫マージで純改善採用（全て pure superset）。同型★0維持。残3枚の filter.story（WX20-026/WX21-Re09/WX22-046）は条件/トリガーfilter/コストの別構造＝別ラウンド。
- **⚠ R3 の重要発見＝filter.cardType バケツは「単一クリーン修正」ではない**：worklist 上は primary 16 だが、cardType 脱落は実は **84箇所に分散**し、その多くが STUB↔REVEAL_AND_PICK／STUB↔GRANT_ACCE_HOST_ABILITY／DECK_TOP_MATCHES↔REVEAL_AND_PICK 等の**構造差（action.type バケツ）と絡む**。`makeRevealPickStub` は filter 無し STUB を返す、`これにアクセされている…を得る` は STUB を返す等。**→ filter.cardType は「LOOK_PICK系」「アクセGRANT系」「deck-top条件系」「複数クラスバフ(R3で対処)」等の下位パターンに割って、構造修正（Stage B）とセットで進める必要がある**。純粋な属性付与の局所修正で片付くのは crossState(R1)/colorMatchesLrig(R2)/複数クラス(R3) のような一部のみ。

### 🎯 完了条件（Definition of Done）
- **LOSS 255 → 0**。各バケツは枚数とカードIDが確定した**ミニプロジェクト**。直すたびに計器の数字が減る＝進捗が可視。
- LOSS が 0 になれば、パーサーは「既存JSONを値変更を除いて完全再現」＝表現の地盤が完成。
- VALUE 149 は別トラック（パーサー修正ではない）。多くは効果分割ズレの偽差分（§backlog参照）。最後にまとめて逆翻訳レビューで潰す。
- 全工程を通して **同型★0 を維持**（grouped_all.txt）。

---

## 1. ① LOSS バケツ（直す対象・255枚・ランク順）
> 各行＝「この構造をパーサーが落とす」カード群。バケツ内のカードを開いて共通の言い回しを見つけ、narrow な正規表現で直す（**全文スキャン禁止**＝§backlog の教訓）。
> 代表IDのみ記載。**全IDは計器を実行**して取得。

| 優先 | バケツ | 枚 | 性質・着手メモ | 代表ID |
|---|---|---|---|---|
| **A（高利得・局所）** ||||  |
| A1 | filter.cardType | 30 | 対象の cardType 脱落。名詞句限定で付与 | WX07-002〜005/014/018/020, WX08-001〜003 |
| A2 | filter.color | 11 | 「赤の」等の色脱落。多くは matchesLrig 系 | WX04-021/026, WDK01-010, PR-457 |
| A3 | count | 11 | 対象数の取り違え | WX12-051/052, WX25-P1-018, SPDi44-04 |
| A4 | activeCondition | 7 | 〜があるかぎり/アクセ等の発動条件脱落 | WXK04-080, WXK08-061/064/073 |
| A5 | filter.story | 4 | 「＜種族＞の」脱落 | WX03-050, WX20-026, WX22-046 |
| A6 | upToCount | 4 | 「N体まで」の upTo 脱落 | WX04-010, WX25-CP1-030, WXK04-030 |
| **B（中・アクション形）** ||||  |
| B1 | action.type | 77 | アクション種別を誤出力（最大）。下位パターンに要再分割 | WX02-018, WX03-046, WX11-021, WX16-054 |
| B2 | filter（その他） | 31 | frontOfSelf/thisCardOnly 等の細フィルタ脱落 | WX17-033, WX21-022, WXDi-P01-011 |
| B3 | then/steps | 1 | 後続処理欠落 | WXK05-030 |
| **C（トリガー検出）** ||||  |
| C1 | triggerCondition/Scope/Filter | 43 | トリガーの詳細条件・範囲脱落 | WX02-073, WX10-074/078/080/083 |
| C2 | condition.type（その他） | 15 | 条件型の脱落（WXK08系に集中） | WXK08-026/041〜046/067〜075 |
| C3 | timing（取りこぼし） | 8 | トリガー種別を出せていない | WX15-058, WX17-075/077, WDK07-E14 |
| C4 | effectType | 7 | CONTINUOUS/AUTO 等の取り違え | WX15-102/105, WX21-041 |
| 端数 | action.id ほか単発 | 6 | 個別 | WX04-011/015, SP27-016 |

**合計 255**（計器が真値）。

### 着手順の推奨
1. **Stage A（67枚）**：局所的な「属性付与漏れ」。これまでのレゾナ/種族系と同型＝低リスク高利得。filter.cardType→color→count→activeCondition→story→upToCount。
2. **Stage C（73枚）**：トリガー検出の穴。WXK08系（C2）は同じ壊れ方で固まっており横展開しやすい。
3. **Stage B（109枚）**：action.type 77 が最大の山。**まず77を下位パターンに再分割**（「並べ替え退化」「BLOCK_ACTION退化」等）してから着手。engine ハンドラ不在のものは §5 機構として実装（乖離を作らない）。

---

## 2. ② VALUE トラック（149枚・パーサー修正ではない）
| バケツ | 枚 | 備考 |
|---|---|---|
| timing（値違い） | 111 | **大半は効果分割ズレの偽差分**（1AUTO↔2AUTO等で index がずれ見かけ上 timing 違い）。逆翻訳レビューで1件ずつ。bulk変更禁止 |
| parseStatus | 12 | 表示メタ。実害薄 |
| action.type（値違い） | 10 | 1件ずつ原文照合 |
| owner / then / 他 | 16 | 同上 |

→ **これらはパーサーのキーワードを増やしても減らない**。LOSS を 0 にした後の最終レビューパスでまとめて扱う。

### ⚠ 着手しないと判断済みの慣例案件（再調査防止）
- **duration「次の対戦相手のターン終了時まで」→ UNTIL_OPP_TURN_END**：句が「ターン終了時まで」を部分包含し誤判定するのが根本だが、**既存JSONも145枚が UNTIL_END_OF_TURN（事実上の慣例）**。直すと145枚が新規 held 化する bulk 値変更＝据置（`parser_backlog.md` 参照）。

---

## 3. 運用
- **進捗の見方**：`npx tsx scripts/parserWorklist.ts` の `LOSS` 合計が減る＝前進。0が完了。
- **1ラウンド**：LOSS の1バケツ（or 下位パターン）を選ぶ → narrow 修正 → `npm run build:effects`（収穫マージ）→ 計器で当該バケツ減を確認 → typecheck＋同型★0 → commit。
- **同型★0 と典型カードの逆翻訳一致**を毎回ゲートにする（件数だけを信じない＝§2）。
- **⚠ build 後は held 合計が増えていないか必ず確認**（新ハンドラが他カードを横取りすると +N 退行する。R4 参照）。

## 🅑 Stage B 着手記録：LOOK/REVEAL_AND_PICK 一族（最大レバー・要surgical）

action.type 77 を fresh 出力で分解すると **約半分が LOOK/REVEAL 一族**（25 LOOK_AND_REORDER 退化 ＋ 8 REVEAL_AND_PICK/DRAW ＋ singleton 多数）。filter.cardType / count / then-steps / upToCount の脱落も同時に生む**最大の cross-bucket レバー**。だが着手で重要な制約が判明：

### ⛔ R14（2026-06-27・ymst）＝**この一族はパーサーでは直せない（curation 不整合が根本）。R4 の処方は誤り。着手禁止**
- R4 が「正道」とした処方（LOOK_AND_REORDER 分岐に pick動詞ガード＋REVEAL_AND_PICK 分岐を 場/エナ/pickUpTo/story/pickNoun/colorMatchesLrig/hasGuard へ拡張＝**新ハンドラではなく既存分岐のピンポイント拡張**）を `effectParser.ts:1236`（「N枚見る」分岐）に実装したところ、**held 329→434（+105）の大規模退行**。typecheck緑でも計器で即検知。→ **全 revert（held 329 復帰）**。
- **根本原因＝既存 JSON の curation が不整合**。同一文法「その中から〔＜X＞の〕シグニN枚(まで)を公開し手札に加え／エナゾーンに置き、残りを好きな順番でデッキの一番下に置く」に対し、**既存 JSON は REVEAL_AND_PICK が23枚・LOOK_AND_REORDER が119枚**（後者が多数派）。判別シグナルは**存在しない**。実例：`WX24-P1-053`「＜宝石＞のシグニ１枚を公開し手札に加え」＝REVEAL_AND_PICK／`WX16-043-E1`「＜英知＞のシグニ１枚を公開し手札に加え」＝LOOK_AND_REORDER（**完全同型なのに別 curation**）。`WX16-054`(REVEAL) vs `WX16-057`(LOOK) も同様。
- **パーサーの現状（LOOK_AND_REORDER 出力）は多数派119枚に正しく一致**しており、REVEAL_AND_PICK の23枚が**少数派の outlier**。どちらに寄せても他方が held 化する＝パーサー単独では net 改善不能。
- **正しい解決は curation 統一（142枚を一族として REVEAL_AND_PICK か LOOK_AND_REORDER の一方へ正規化）＝VALUE トラックの最終レビュー（bulk 判断）案件であり、LOSS の surgical ラウンドではない**。engine が REVEAL_AND_PICK のピック UI を全経路で持つかの確認も要る。**次の人はこの23枚（REVEAL_AND_PICK ← LOOK_AND_REORDER）に手を出さないこと**。
- 旧 R4 記録（下記）は歴史として残すが、**「正道」の処方は R14 で否定された**（+105退行）。LOOK/REVEAL 一族の他の型ペア（SEQUENCE←REVEAL_AND_PICK 23／SEQUENCE←LOOK_AND_REORDER 10）も同じ curation 不整合の疑いが濃厚＝着手前に必ず「逆方向の型ペア」を計器で数えて多数派/少数派を確認する（少数派なら不整合＝着手しない）。

### R4（2026-06-27）＝広域ハンドラ追加は厳禁（+129退行→全revert）※処方部分は R14 で否定
- 「N枚見る→その中から〔filter〕をM枚(まで)〔手札/場/エナ〕→残りデッキ下/上」を REVEAL_AND_PICK 化する**新ハンドラを早い位置に追加**したら **held 387→516（+129）の大規模退行**。原因＝この一族は既存ハンドラ（`LOOK_PICK_CHAIN`／結合処理 effectParser.ts:1373／`makeRevealPickStub` 等）が**既に広範にカバー**しており、早い位置の広域 match が正しく処理されていたカードを横取りした。→ **即 revert（held 387 復帰）**。
- **教訓（有効な部分）**：新ハンドラ追加は不可。**毎回 build→worklist で +N 退行ゼロを確認**。⚠ R4 が続けて書いた「既存分岐のピンポイント拡張なら正道」は **R14 で +105 退行を出して否定された**（curation 不整合が原因でパーサーでは直せない）。

### この一族の正解形マッピング（確定済み・次の実装者へ）
- 単一pick: `REVEAL_AND_PICK{owner:self, revealCount, filter, pickCount, pickUpTo?(「N枚まで」), pickNoun?(カード/スペル時のみ), then, remainder}`。このキー順で WXDi-P01-018/WXDi-D05-007/WX24-P1-036/WXDi-P16-060/WXDi-D04-012 が IDENTICAL/SUPERSET になった（R4で検証済み）。
- `then`：手札に加え→`ADD_TO_HAND` ／ 場に出(す/し)→`ADD_TO_FIELD` ／ エナゾーンに置(く/き)→`ADD_TO_ENERGY`。
- `filter`：noun=シグニ/スペル→`cardType`、カード→cardType無し＋`pickNoun:'カード'`。＜X＞→**`story`**。色共通→`colorMatchesLrig`、《ガードアイコン》→`hasGuard`、レベル→`level`。「を」は noun と枚数の間で**任意**（「スペル１枚」）。
- **場に出す＋「シグニの【出】能力は発動しない」**＝`SEQUENCE{steps:[REVEAL_AND_PICK, BLOCK_ACTION{target:PLAYER/self, actionId:'ON_PLAY_ABILITY', until:'END_OF_TURN'}]}`。
- **story/cardClass は engine・decompiler とも完全に同一視**（execUtils 231/237＝両方 card.CardClass.includes）。REVEAL_AND_PICK filter は **story が124枚で規約・cardClass はわずか7枚**（WX16-054/WXDi-D02-18AT/WX24-P1-053/WX24-P2-061/WX25-P3-054/WXK02-045/SP27-009）。この7枚を story 正規化してから進めると IDENTICAL になる。
- 多段（手札＋場の2段）は `LOOK_PICK_CHAIN`（WX24-P1-026/WX25-P1-039/WXDi-P02-020/WXDi-P16-035 等）＝別サブパターン。WXDi-P00-045 は既存JSONが旧 LOOK_AND_REORDER（要個別確認）。
