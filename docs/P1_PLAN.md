# P1 プラン：表現完成（3人・バトン式の順番開発）

> 目的＝**全効果カードで「逆翻訳が原文一致」かつ「同型★=0」**にし、残る大型機構を実装し切る。
> 3人は**同時に作業せず、順番に push / pull で引き継ぐ**（バトン式）。このファイルは全員が同じ方針・同じ品質ゲートで続けるための共有ルール。
> 新セッション（cold start）は **まず本ファイル → `TODO.md`先頭 → `DESIGN.md`** の順に読む。

---

## 0. 全体像（3フェーズ）— P1はこのうち①だけ

| 層 | 内容 | 検証手段 | 本プランの対象 |
|---|---|---|---|
| **① 表現** | JSON がカード原文を正しく**表現**する | 逆翻訳一致／同型★0 | **★P1=ここ** |
| ② 実行 | エンジンが各DSL構文を正しく**実行** | 構文ごとの smoke テスト | P2（別途） |
| ③ 挙動 | 実ゲームで各カードがルールどおり動く | 実機/自動対戦テスト | P3（別途） |

**注意**：①の「逆翻訳一致」は “JSONがテキストを表す” ことのみ保証。実機での正しさ(③)は別。各コミットは**「要実機検証」**を付す。

## 1. Definition of Done（P1完了条件）
- [ ] 全シートで **同型★ = 0**（`docs/grouped_all.txt`）。
- [ ] 「⚠脱落疑い」リストの各カードが、**偽陽性**／**修正済**／**機構待ち（理由明記）** のいずれかに分類済み。
- [ ] 残る大型機構（§5）が実装＋配線済み、または明確にスコープ外と合意。
- ⚠ **「脱落疑いの件数」は完了指標にしない**（後述）。

## 2. 不変の運用ルール（全員必須）
- **`effects_*.json` は手動管理。`build:effects`（再生成）は破壊的＝絶対に実行しない。** JSONは直接パッチ。
- **逆翻訳を直したらエンジン実装までセット**（乖離＝偽陰性を作らない）。語彙が無ければ §5 の機構として実装する。
- **日本語を含むスクリプトは `scratchpad` に `.mjs` を書いて `node <path>` 実行**（Git Bash 経由の `node -e` は文字化けする）。
- **件数メトリクスを信じない**：「脱落疑いNN枚」は「。区切り文数」比較で粗く、逆翻訳器は複数効果を1行(、／そして)に圧縮するため**内容を直しても件数は減らない**。判断は必ず **同型★0＋該当カードの逆翻訳が原文一致** で行う。
- **偽陽性は直さない**（§4）。

## 3. 進め方＝バトン式（順番に push / pull）
3人は**同時に作業しない**。**① `git pull` → ② 下の「現在地（バトン）」を読む → ③ そこから作業 → ④ バトンを更新 → ⑤ commit & push** を回す。衝突は起きないので担当ファイル分けは不要。**唯一の約束＝push前にバトンを最新化すること**（次の人が迷わず続けられるように）。

### 📍 現在地（バトン）— 次の人はここから
> **push する人は、このブロックを上書きしてから push する。** 詳細な修正履歴は `BUGFIXES.md`（新しい順）に積むので、ここは**短く・次の一手だけ**。

- **最終更新**: 2026-06-27（ymst・継続）
- **⛔ 直近の重要発見（R14）**: **Stage B の本命「LOOK/REVEAL 一族」はパーサーでは直せない**。R4 の処方どおり surgical 実装したら **+105 退行**＝既存 curation が不整合（同一文法で REVEAL_AND_PICK 23枚 vs LOOK_AND_REORDER 119枚・判別不能）。パーサー現状（LOOK_AND_REORDER 多数派）が正しく、23枚が outlier。**この一族は着手禁止**＝curation 統一は VALUE の最終 bulk レビュー案件。詳細 `docs/parser_worklist.md`「🅑 Stage B」⛔R14。**→ 次は LOOK/REVEAL を避け、別の LOSS バケツ（filter.cardType 13／count 11／triggerCondition 12 等の局所）か、Stage B の非 LOOK/REVEAL 型ペア（CHOOSE←BANISH 3／CONDITIONAL←DRAW 4 等の小クラスタ）を診断してから選ぶ**。
- **🧭 パーサー作業の地盤＝`docs/parser_worklist.md`（cold start はまずこれ）**: held 404 を **LOSS 255（真の弱点＝直す）／ VALUE 149（慣例・対象外）** に重複なく分割した有限ワークリスト。計器 `npx tsx scripts/parserWorklist.ts` で数字を再生成。**完了条件＝LOSS 255→0**。手当たり次第をやめ、バケツ単位（Stage A 局所67→C トリガー73→B action.type中心109）で潰す。各ラウンドで計器の LOSS 減＋同型★0 をゲートにする。**現在値＝held 226 / LOSS 67 / VALUE 159**（R27 commit 後・R27 は action.type の非LOOK/REVEAL 17枚を MANUAL化で −17）。
- **🚩 重要なマイルストーン（R27後）＝1枚ずつ triage のクリーンな鉱脈は枯渇**。残 LOSS 67 はほぼ全て **LOOK/REVEAL 一族（REVEAL_AND_PICK ↔ LOOK_AND_REORDER）＝R14 で「curation 不整合・パーサー不能」と判明済の bulk正規化案件**。action.type 残 ~59＋filter.cardType 3（REVEAL_AND_PICK）＋filter.story/then/colorMatchesLrig/filter.color 各1＋保留2（WXK10-022・WDK08-L14）。**次フェーズは個別 MANUAL化ではなく、LOOK/REVEAL の canonical 形を1つ決める bulk 正規化（REVEAL_AND_PICK と LOOK_AND_REORDER のどちらを「デッキトップ公開して手札/場/エナへ」の正にするか＋engine 確認）**。これは VALUE の最終 bulk レビューと同じ性質＝慎重な設計判断が要る。1枚ずつの MANUAL化/resync で削れる分は出し切った。
- **直近やったこと（ymst・最新24）**: **R27（action.type の非LOOK/REVEAL hard-tail 17枚を MANUAL化）**。action.type 76枚を全数 dry-run triage。大半（~59）は LOOK/REVEAL 一族で bulk送り。**「EXIST正・FRESH退化」かつ非LOOK/REVEALの17枚のみ MANUAL化**＝①CHOORE構造をFRESHが潰した（WXK07-069/WDK01-020/WDK08-L20＝2択→BANISH単体、WXK09-006＝3択内側脱落）②「代わりに」CONDITIONAL then/else の二重適用回避（WXDi-P01-085/WXDi-P06-079）③CONDITIONAL/cost/条件脱落（WX03-046/WX04-025/WX11-021/WX18-063/WX18-064/WX24-P2-070/WX25-P3-062/WXDi-P16-065/WD21-011/WDK14-013/SPDi43-31）。**LOSS 84→67（−17）／held 243→226**。⚠保留＝WDK08-L14（FRESH=manual STUB INTERNAL_KIYOHIME_CHOOSE・engine実装未確認）/WXK10-022（E3 LOOK/REVEAL＋E1 timing曖昧）。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新23）**: **R26（filter（その他）バケツ21枚を全 MANUAL化）**。dry-run triage で**21枚すべてが「EXIST正・FRESH退化」の hard-tail**と判明（stale/FRESH優位なし・LOOK/REVEAL構造問題なし）。脱落 filter 詳細＝acceHost（アクセホスト）/cardClass/level/levelLteDiscardSigni/eachDistinctColor/commonClass/keyword/powerRange、ON_ACCE timing穴、OPTIONAL_TRASH_ENERGY_CLASS STUB 等。差分effectのみ・runtime不変・構造完全一致を検証。**LOSS 105→84（−21）／held 264→243**。詳細 `BUGFIXES.md` 先頭。**⚠次の一手＝残 LOSS 84 は action.type 76（最大・構造差で lost leaf）が大半。ここからは「EXIST正・FRESH退化」だけでなく構造ごと違うため要慎重 dry-run。残りの小バケツ（filter.cardType 3＝REVEAL_AND_PICK・filter.story 1・then 1・colorMatchesLrig 1・filter.color 1）は全て LOOK/REVEAL or curation 案件＝bulk正規化送り。action.type を 1枚ずつ EXIST/FRESH 突き合わせ、curated-STUB が正のものは MANUAL化・stale は resync・LOOK/REVEAL/CHOOSE 構造は触らない**。
- **直近やったこと（ymst・最新22）**: **R25（filter.cardType／count バケツ triage＝15枚）**。2刀流で1枚ずつ判定。①**MANUAL化6枚**（EXIST正・FRESH退化）：WX10-007・WX10-021・WXDi-P12-060・WXDi-P15-093・WX24-P1-076・WXK08-045。②**resync/採用9枚**（FRESH/manual正・stale JSON＝実バグ修正）：WXK04-042（誤BANISH→POWER_MODIFY）・WXDi-P14-077-E1（filter無し→他電音部全体・E2は逆にMANUAL化）・WX25-P1-018/SPDi44-08（REMOVE_ABILITIES誤実装→POWER_SET+grant）・WX25-P1-026/SPDi44-04（無条件→DISTINCT_CLASS条件付き）・WX25-P1-115/SPDi01-121（無条件→DECK_TOP_SHARES_COLOR条件付き）・WXK04-002（GRANT_PROTECTION全→血晶武装のみ）。**LOSS 120→105（−15）／held 279→264**。⚠**SKIP**＝REVEAL_AND_PICK 3枚（WX24-P1-020・WX25-P1-037・WX25-P3-040＝LOOK/REVEAL一族・bulk正規化送り）／WXDi-D09-P18（覚醒・EXIST不完全かつFRESHも漏れで両不正確）。詳細 `BUGFIXES.md` 先頭。**次の一手＝残バケツ＝filter（その他）21／action.type 76（最大・ただし構造差で要慎重）。filter その他から dry-run triage 推奨。LOOK/REVEAL・CHOOSE は引き続き MANUAL化/resync せず bulk送り**。
- **直近やったこと（ymst・最新21）**: **R24（stale データ6枚を FRESH へ再同期/採用＝実 runtime バグ修正）**。R23 で発見した逆パターン（FRESH の方が正しい）を `scripts/_resync.ts <id>`（差分effectをFRESH値へ置換）で処理。runtime はJSON直ロード（build:effects再生成しない）のため stale JSON は実ゲームで誤動作していた。①**再同期3枚**：WXK04-030（「相手シグニ全バニッシュ」誤実装→正しい血晶武装+power+grant）・WX25-CP1-030・WX25-CD1-06（2択CHOOSEが単一NEGATEに退化→復元）。②**data採用3枚**：WX24-P3-064・WXK07-027（無条件バフ→トラッシュ枚数条件付き＋thisCardOnly）・WX21-Re09（timing誤り→triggerScope/Filter/byEffect正配置）。**LOSS 126→120（−6）／held 285→279**。⚠**WX20-026-E3 は不採用**（FRESH が ON_DRAW で発生源「凶蟲シグニの効果で引いたとき」限定を落とし過剰発火＝LOSS据置・パーサーギャップ）。詳細 `BUGFIXES.md` 先頭。**次の一手＝残バケツを dry-run triage（filter その他 21／count 8／filter.cardType 11 が最大）。`_manualize2.ts`＝EXIST正の hard-tail を MANUAL化／`_resync.ts`＝FRESH正の stale を採用、の2刀流で。SP27-016・WXK05-030 は curation 案件で送り**。
- **直近やったこと（ymst・最新20）**: **R23（小バケツ hard-tail 12枚を MANUAL化）**。action.id 4（WX04-015 curated STUB／WXDi-P06-054-E2 GRANT wrapper／WXK01-054・089 DRAW_AT_TURN_END）／condition.type 2（WXK08-070・WXK10-069 ON_BECOME_BEAT穴＋BEAT条件）／costThreshold 1（WX04-011）／optional 2（WXDi-D08-013・WXDi-P14-084 TRASH optional）／then 3（WXK02-071・WXK10-057・WDK05-T15 REVEAL_TOP STUB）。**全て dry-run で「EXIST正・FRESH退化」確認済**。**LOSS 138→126（−12）／held 297→285**。詳細 `BUGFIXES.md` 先頭。
  - **⚠R23 で判明＝MANUAL化してはいけない逆パターン（次の人は注意）**：dry-run で **FRESH（パーサー）の方が EXIST より正しい** カードが混在＝これらは MANUAL化せず別処理。①**JSON stale（manualEffects.ts に richer 定義あり・保存JSONが古い）＝再同期案件**：WX25-CP1-030・WX25-CD1-06（CHOOSE 2択が単一NEGATEに退化）・WXK04-030（血晶武装が BANISH ALL に誤退化）。FRESH が既に parseStatus:MANUAL で完全版を出す＝**JSONをFRESH値に再同期すれば held 化**。②**パーサー優位の stale データ＝data採用案件（R12/R17型）**：WX24-P3-064・WXK07-027（activeCondition のトラッシュ条件＋thisCardOnly 欠落）・WX20-026-E3・WX21-Re09-E1（timing ON_TURN_END 誤り＋story を target に誤配置→FRESHは triggerFilter に正配置）。③**curation 案件**：SP27-016（choice が SEARCH→ENERGY を落とした lossy 近似）・WXK05-030（マルチエナを RULE_REMINDER で近似）。**次の一手＝①の再同期3枚が最もクリーン（leaf を FRESH に合わせるだけで held 化）→②の data採用4枚→残バケツ（filter その他 21／count 8／filter.cardType 11 等）を dry-run triage**。
- **直近やったこと（ymst・最新19）**: **R22（powerRange anaphora／トリガー穴 hard-tail 6枚を MANUAL化）**。triggerCondition/Scope バケツの6枚（WXDi-P06-052・WXK01-076・WXK01-079・WXK07-061・WXK09-038・WDK14-014）。①「対象とし…そうした場合それをバニッシュ」の文跨ぎ照応（「それ」）で powerRange が落ちる（effectParser.ts:1399-1405）②`ON_SIGNI_BECOMES_DRIVE`／`ON_HAND_DISCARDED`／`ON_BECOME_BEAT` は timing 検出ロジック自体が無い穴＝timingを足しても照応で落ちる。既存JSON正・差分effectのみ MANUAL化・runtime不変。**LOSS 144→138（−6）／held 303→297**。triggerCondition バケツ枯渇。詳細 `BUGFIXES.md` 先頭。**次の MANUAL化候補＝残 LOSS の hard-tail（filter その他 21／action.id 4／count 8 等を1枚ずつ dry-run（`scripts/_manualize2.ts <id>`）で「EXIST正・FRESH退化」を確認してから）。⚠LOOK/REVEAL・CHOOSE は MANUAL化せず（bulk正規化案件）**。
- **直近やったこと（ymst・最新18）**: **R21（hard-tail 11枚を MANUAL化）**。クリーンなパーサー鉱脈が枯れたため戦略移行＝既存JSONが正しいがパーサー再現不能な hard-tail を `parseStatus:MANUAL` 化（計器が held から除外）。GRANT_ACCE 6＋機構依存5（機構④/placedDown/傀儡）。差分effectのみ・メタデータのみ・runtime不変。**LOSS 155→144（−11）**。⚠LOOK/REVEAL・CHOOSE は不整合のため MANUAL化せず（bulk正規化案件）。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新17）**: **R20（levelLteLastProcessed 付与）**。「この方法で…したシグニのレベル以下」を `parseLevelLteLastProcessed` 新設し BOUNCE/SEND_TO_ENERGY/SEARCH に適用。**LOSS 158→155（−3）／held 317→314**（WX21-022/WX24-P3-026/WXEX2-17 IDENTICAL）。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新16）**: **R19（《ガードアイコン》hasGuard/noGuard 付与）**。`parseGuardFilter` 新設しトラッシュ→手札／トラッシュ→エナに適用。**LOSS 162→158（−4）／held 321→317**（WXDi-P00-025/P01-011 hasGuard・WXDi-P01-030/P07-029 noGuard が IDENTICAL）。filter（その他）バケツ細分を消化。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新15）**: **R18（BOUNCE「このシグニを手札に戻す」thisCardOnly 付与）**。part1:866 が自身限定を落としていた。`/このシグニを(?:場から)?手札に戻/` で付与。**LOSS 165→162（−3）／held 324→321**（WXK06-034/036/WXK10-061 IDENTICAL）。filter（その他）バケツ細分の thisCardOnly 6枚中 clean 3枚を解消（残3は別 STUB 差分）。同型★0維持・要実機検証。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新14）**: **R17（データ正規化・stale ENERGY_CHARGE{DECK_CARD}→ADD_TO_ENERGY）**。「公開→それが〔X〕の場合エナに置く」の `then` が HEAD で既知 engine バグ形（effectParser.ts:1284）。パーサー正値 ADD_TO_ENERGY に JSON パッチ3枚（WX12-051/052/WX18-070）＝IDENTICAL。**LOSS 168→165（−3）／held 327→324**。engine バグ修正でもある。残17枚（別差分）は対象外。同型★0維持・パーサー無変更。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新13）**: **Stage B R16（CHOOSE←BANISH 3枚＝着手→全 revert）**。WXK07-069/WDK01-020/WDK08-L20 の CHOOSE 復元を試みたが +51〜+99 退行＝**R14 と同じ curation 不整合**（「先頭が選択ヘッダ＋①②」156枚のうち既存 CHOOSE は73枚のみ・残83枚は SEQUENCE/STUB 等の非 CHOOSE・判別シグナル無し）。revert（コード無変更）。**この3枚＝着手禁止**。詳細 `parser_worklist.md` R16。
- **直近やったこと（ymst・最新12）**: **Stage B R15（LAST_PROCESSED_HAS_TYPE CONDITIONAL 復元）**。「この方法でトラッシュに置いたカードの中にスペルがある場合、引く」の条件脱落を `parseSingleSentence` の「…場合」群に narrow handler 追加で是正。**LOSS 170→168（−2）**（WX12-054/055 IDENTICAL）。R14 教訓どおり逆方向ペア（DRAW←CONDITIONAL=0）を事前確認＝curation 不整合なしを確認してから着手。同型★0維持・typecheck緑・JSON無変更・要実機検証。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新11）**: **Stage B R14（LOOK/REVEAL 一族＝着手→全 revert）**。R4 の surgical 処方を実装したら **+105 退行**＝既存 curation 不整合（同一文法で REVEAL_AND_PICK 23 vs LOOK_AND_REORDER 119）。**パーサーでは直せない＝着手禁止**（VALUE の最終 curation 統一案件）。全 revert（コード無変更）。詳細 `parser_worklist.md`「🅑 Stage B」⛔R14。
- **直近やったこと（ymst・最新10）**: **Stage B R13（GRANT_ACCE_HOST_ABILITY wrapper 復元）**。「これにアクセされている[＜X＞の]シグニは『…』を得る」が splitSentences で引用「」内の「。」により wrapper を割られ、**内側能力が単独効果に漏れて全 leaf 喪失**していた（engine は既に GRANT_ACCE 実装済＝表現だけ欠落）。`parseActionText` 冒頭で wrapper を最優先捕捉し rawText→`parseBlock` 再帰展開（GRANT_LRIG_ABILITY と同方式）。本体は引用/キーワード【】 始まり限定で「すべての色を得る」専用STUB を誤捕捉せず（WX22-043 退行を narrow 化で回避＝held +1→0）。**LOSS 178→170（−8）／held 329 不変**。8枚 LOSS→VALUE（WXEX1-70 等は内側 leaf 完全一致・差は inner parseStatus MANUAL↔AUTO のみ）。残6枚は内側 MANUAL 専用で再現不能＝LOSS 残。同型★0維持・typecheck緑・**effects_*.json 無変更**・要実機検証。詳細 `BUGFIXES.md` 先頭。**次 Stage B＝LOOK/REVEAL 一族 約59枚（本命・要 surgical）**。
- **直近やったこと（ymst・最新9）**: **Stage B R12（ENERGY_CHARGE→SEND_TO_ENERGY 正規化）**。「対戦相手のシグニをエナゾーンに置く」を HEAD が `ENERGY_CHARGE`+SIGNI と mis-curate（パーサーは既に正しく `SEND_TO_ENERGY` 出力）＝**データのみ正規化11枚**（パーサー変更なし・恒久安定）。**⚠VALUE 161→151（−10）＝これは LOSS ではなく VALUE トラックだった**（型の値違いのみで lost leaf 無し・LOSS 178 不変）。held 339→329・同型★0維持・typecheck緑・要実機検証。**教訓＝LOSS本体の action.type は LOOK/REVEAL 一族（構造差）。次 Stage B＝GRANT_ACCE_HOST_ABILITY 約11枚／LOOK・REVEAL 一族 約59枚（要 surgical）**。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新8）**: **Stage C 残り診断＋Stage B 診断**（`parser_worklist.md` の R11.5 ログに詳細）。Stage C は clean 山を消化済み・残り10枚は hard tail（powerRange anaphora 伝播／2枚クラスタの timing+scope／placedDown）。**⚠fromFieldByCostOrEffect 着手禁止**（fromZones:["field"] が規約・少数派2枚のみ・broad化で+13退行 revert 済）。**Stage B 診断完了＝LOOK/REVEAL 一族 約59枚（最大・要 surgical）＋非REVEALの ENERGY_CHARGE←SEND_TO_ENERGY 11枚（最有望の低リスク）＋GRANT_ACCE_HOST 約11枚 等**。**次の一手＝Stage B は ENERGY_CHARGE←SEND_TO_ENERGY 11枚（単一handler型ミスの可能性大）から入るのが低リスク**。
- **直近やったこと（ymst・最新7）**: **Stage C R11 本丸（turnOwner）**。《自分/相手ターン》を AUTO/ACTIVATED でも `triggerCondition.turnOwner` 化（機構④で engine 配線済みだったのにパーサーが CONTINUOUS のみ対応で見送っていた）。**LOSS 206→178（−28・このセッション最大）**。turnOwner 値衝突0・同型★0維持・typecheck緑・要実機検証。VALUE +7 は timing別ズレの再分類。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新6）**: **Stage C R10 第1弾（トリガー検出）**。①ON_PLAY「他のシグニが場に出た」excludeSelf（1641に`(他の)?`）②UP「このシグニ」thisCardOnly（44枚harvest）③ON_TRASH `fromZones`記録（63枚harvest・engine未使用＝表現専用）④自己蘇生 optional（15枚harvest）。**LOSS 210→206**（WX10-080/083/092/WX02-073）。同型★0維持・typecheck緑・要実機検証。**保留**＝Cluster 1（WX10-074/078 placedDown＋targetsTriggerSource「そのシグニ」自動対象化＝機構追加要）。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新5）**: **Stage A R9（filter.color・trash→hand単色＋colorMatchesLrig共用化）**。①trash→hand に一意な単色のみ color 付与（複色「白か赤」「白と黒」は誤るので除外＝WX04-021 解消＋56枚採用）②`parseColorMatchesLrig` ヘルパー新設し SEARCH/trash→hand/trash→field に適用（WDK13-009/PR-K064/WX19-004 解消）。**LOSS 214→210**。同型★0維持・typecheck緑・要実機検証。残 filter.color＝PR-457（REVEAL一族・Stage B）。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新4）**: **Stage A R8（filter.cardType・任意捨てコスト）**。「手札から＜X＞のシグニをN枚捨ててもよい」handler（part3:1053）がクラスを空 filter に落としていた（捨てる版 1623 と不整合）のを cardType＋story/color/level 付与で是正。**35枚の空 filter curation bug を採用**＋cardClass→story 正規化4枚（WX21-017/018 解消・LOSS 216→214）。同型★0維持・typecheck緑・要実機検証。残 filter.cardType は REVEAL一族(Stage B)・duration慣例・全体バフの別系統のみ。詳細 `BUGFIXES.md` 先頭。
- **直近やったこと（ymst・最新3）**: **Stage A R7（count・対戦相手エナ→トラッシュ「N枚まで」）**。handler の count 抽出が「カードを２枚まで」の `を` で外れ count:1 化していたのを是正（WX04-010 解消・LOSS 217→216）。横展開で **curation bug 17枚**（HEAD が旧誤値 count:1 を保存／実テキストは「N枚まで」＝N枚トラッシュできる実害）を顕在化させ、parser 正値を全件テキスト照合の上で採用。同型★0維持・typecheck緑・要実機検証。詳細 `BUGFIXES.md` 先頭。**⚠教訓**：count バケツは「純局所」ではなく、handler 修正が旧パーサー出力に合わせた stale curation を炙り出す（値変更採用が要る）。
- **直近やったこと（ymst・最新2）**: **Stage A R6（activeCondition＋ビート全角ブラケット）**。①SUBSCRIBER_COUNT「登録者数がN万人」②IS_SELF_ACCED「【アクセ】が付いているかぎり」③**《ビートアイコン》の全角 ［］ 対応**（`beatIconM` が ASCII のみ→実データ全角を取りこぼし＝**最大波及**で WXK08/WXK10/WDK14 のビート条件一族が一括解消）＋【常】beatCondition→activeCondition。**LOSS 231→217 / held 384→371**（18枚・全 pure superset）。typecheck緑・同型★0維持・要実機検証。詳細 `BUGFIXES.md` 先頭。**次の純局所候補**: count 11／filter.cardType 15／残 activeCondition 2（WX24-P3-064/WXK07-027＝TURN_OWNER複合）。**precedence宿題**＝WXK04-080/082 の[1]「これにアクセされているシグニのパワー」が広域 POWER_MODIFY に先取りされ acceHost 脱落。本命は依然 Stage B（下記🎯）。
- **直近やったこと（ymst・最新）**: **Stage A R5（filter.story・トラッシュ→手札）**。`parseSentencePart1.ts` の TRANSFER_TO_HAND トラッシュ handler に `parseStoryFilter` を**名詞句スパン（`トラッシュから(.*?)手札に加える`）限定**で追加（全文だと WX22-002 等の前置き条件クラスを誤拾い）。**LOSS 234→233 / held 387→386**。retrieved-card の class 取りこぼし132枚を収穫マージで純改善採用。typecheck緑・同型★0維持・要実機検証。詳細は `BUGFIXES.md` 先頭。
- **直近やったこと（karka・最新9）**: **Stage B（LOOK/REVEAL_AND_PICK 一族）に着手→広域ハンドラ追加で held 387→516 の+129退行を検知し全revert**。コード変更なし（held 387 維持）。**確定知見を `docs/parser_worklist.md` の「🅑 Stage B 着手記録」に詳細記録**：①新ハンドラ追加は厳禁＝既存ハンドラ(LOOK_PICK_CHAIN/結合1373/makeRevealPickStub)が広範カバー済みで横取り退行する。②正道は effectParser.ts:1210 の誤発火分岐をピンポイント修正＋1222分岐拡張。③正解形マッピング（then/filter/pickUpTo/pickNoun/SEQUENCE+BLOCK_ACTION）と story/cardClass 同一視・story正規化方針を全て記録済み。**次の実装者はこの記録通りに surgical 修正すれば一族を安全に進められる**。⚠build後は held合計+N退行ゼロを毎回確認。
- **直近やったこと（karka・最新8）**: **Stage A R3（filter.cardType・複数クラスバフ）**＋**重要発見**。「＜X＞と＜Y＞のシグニのパワー」全体バフのゲート正規表現を複数クラス対応に（WX04-016/086一致・WXK04-043/WXDi-P11-041は旧バグJSONをfresh正値にパッチ）。held 388→387・LOSS 235→234。**⚠filter.cardType は単一クリーン修正ではなく84箇所に分散し多くが構造差(STUB/action.type)と絡むと判明**（worklist R3ログ参照）＝今後は「LOOK_PICK系」「アクセGRANT系」「deck-top条件系」等の下位パターンに割り、Stage B(action.type 77)の構造修正とセットで進める。次の純局所候補は count 11／activeCondition 7／filter.story 4。
- **直近やったこと（karka・最新7）**: **Stage A R2（filter.color・colorMatchesLrig）**。「トラッシュ→手札」source に「センタールリグと共通する色を持つ」を名詞句限定で付与（engine動的解決済み）。**filter.color 11→5・LOSS 241→235・held 394→388**。既存取りこぼし7枚に純改善採用・同型★0維持。残5＝SEARCH/reveal の action.filter（別handler）。次は filter.cardType 残16／filter.color 残5（action.filter版）／count 11 等の Stage A 局所、または計器を見て選ぶ。
- **直近やったこと（karka・最新6）**: **Stage A R1（filter.cardType・crossState条件）**。「場にクロス状態のシグニがある」を COND_STUB→HAS_CARD_IN_FIELD 正規化（engine実装済み・JSON無変更）。計器で **filter.cardType 30→16・LOSS 255→241・held 404→394**。同型★0維持。次は filter.cardType 残16（WX04-016 等の「＜X＞と＜Y＞のシグニ」複数種族 と filter.color 11 等の Stage A 局所）。
- **直近やったこと（karka・最新5）**: **定量計画の地盤を整備**。`scripts/parserWorklist.ts`＋`docs/parser_worklist.md` を新設＝held を LOSS/VALUE に分割しランク化（終わりが見える化）。手当たり次第の修正を卒業。
- **直近やったこと（karka・最新4）**: **「あなたのレゾナのパワーを±N」のtarget脱落是正＋isResona完全撤去**。`parseSentencePart1.ts` のPOWER_MODIFY分岐が「シグニ」限定でレゾナを拾えずデフォルト(any/1/filter無)に落ちていたのを、レゾナ専用分岐 `{owner:'self',count:'ALL',filter:{cardType:'レゾナ'}}` で是正（WX07-007/WX08-019）。既存JSON最後のisResona2箇所をcardType:'レゾナ'へ移行＝**isResona撤去完了（残0）**・レゾナ表現はcardType一本化。typecheck緑・同型★0・要実機検証。→ `BUGFIXES.md` 先頭。**レゾナ系は一段落**。次は `docs/parser_backlog.md` 優先1（filter.cardType脱落98＝最大・名詞句限定で要設計）／upToCount27 等。**⚠duration「次の対戦相手のターン終了時まで」は調査済み＝145枚波及の慣例問題で着手しない**（parser_backlog の「調査してクリーンでないと判断」節参照）。
- **直近やったこと（karka・最新3）**: **自身の基本レベルSET_BASE_LEVEL化＋レゾナ存在条件のdecompile退化を是正**。①「このシグニの基本レベルはNになる」を `parseSentencePart1.ts` で `SET_BASE_LEVEL`（until:END_OF_TURN・engine実行可）として出力（旧 BLOCK_ACTION/SET_LEVEL_N は no-op divergence）。対象指定の他シグニ版は engine 未対応で BLOCK_ACTION 近似据置。②`decompileEffects.ts` が `filter.cardType:'レゾナ'`（多数派正準形）をレゾナと認識せず「シグニ」と退化していた隠れバグを是正（WX08-033等6枚）＋WX10-056/058 の死にキー `isResona` を JSON 除去し cardType 統一。typecheck緑・同型★0・8枚原文一致・要実機検証。→ `BUGFIXES.md` 先頭。**次のレゾナ系候補**: WX07-007/WX08-019「あなたのレゾナのパワーを＋N」＝target に cardType:'レゾナ' filter を付け損ね（filter.isResona held・別の名詞句限定パーサー要）。
- **直近やったこと（karka・最新2）**: **パーサー: 【自】ON_BANISH「(対戦相手|あなた)のターンの間、…バニッシュされたとき」のactiveCondition脱落を是正**。AUTO経路に前置き検出＋`forcedActiveCondition=TURN_OWNER`（従来は【常】G150のみ・素の【自】版は脱落）。engine配線済み（BattleScreen `collectBanishTriggers` が ON_BANISH 自己トリガーで activeCondition 評価）＝新規engine作業なし。**収穫マージで純改善12枚採用**（WXK04-065/067 等・全て原文に「ターンの間」あり）。held 409→408・typecheck緑・同型★0維持・逆翻訳一致。**要実機検証**。→ `BUGFIXES.md` 先頭。**次のパーサー候補は `docs/parser_backlog.md` 優先1（filter.cardType脱落98・最大）／activeCondition残（WXK04-080「【アクセ】が付いているかぎり」・WX10-056/058 isResona等）**。
- **直近やったこと（karka・最新）**: **`build:effects` を非破壊化（収穫マージ）＋パーサー3修正**。ブランチ `fix/parser-harvest-merge`（未マージ・要レビュー/実機検証）。**重要な前提変更**：従来「effects_*.json は手動・build:effects 禁止」だったが、`buildEffectsJson.ts` を **richness ガード付き収穫マージ**化（既存の全リーフ値を保持したまま情報が増える「純粋上位集合」カードのみ自動採用、損失/値変更/混在/MANUAL は温存）＝**手作業を一切失わずパーサー改善だけ収穫できる**ようになり `npm run build:effects` 実行可。パーサー修正＝①POWER_MODIFY「他の＜種族＞/色」バフ（filter/excludeSelf破棄是正）②activeCondition「[色/クラス]のシグニがあるかぎり」③activeCondition「《X》か《Y》」複数名。要レビュー backlog 420→411・全工程回帰0・typecheck緑。パーサー改善の残バックログは **`docs/parser_backlog.md`**（次は triggerCondition脱落51・filter.cardType98・filter.color/storyは名詞句限定で要再設計＝全文スキャン禁止の教訓あり）。`docs/effects_merge_report.md`（gitignore）に採用/温存の全ID。**要実機検証**（データ360枚改善が実ゲームで正しいか未確認）。
- **直近やったこと（karka）**: **【ビート】機構 Phase4-7 で完了**。Phase4＝コスト型《ビート》[４枚以下]使用ゲート9。Phase5＝トラッシュ→beat コスト（WDK14-013）。Phase6＝look→pick の【ビート】化宛先（`then:'beat'`）＋`levelEqLastProcessed`（WDK14-008）。Phase7＝**MAKE_BEAT正規化**（`addToBeatZone` で5経路集約）＋**beat対象のプレイヤー選択UI**（`analyzeBeatSigniCost`＋`payBeatSigniCost(selectedOtherZones)`＝ON_PLAY/ACTIVATEDモーダルでゾーン選択）。smoke 計75pass・同型★0。→ `BUGFIXES.md` 先頭4件。
- **直近やったこと（zerom）**: **【ビート】機構 Phase1-3**（《ビート》[条件]ゲート12＋ON_BECOME_BEAT8＋cost.beat_signi支払い）。→ `BUGFIXES.md`。
- **直近やったこと（karka・続き2）**: **機構④誤parse3枚を是正**（WXDi-P07-044 全3効果＝ON_HAND_DISCARDED/ON_PLAY byEffect＋FREEZE復元・engine配線あり／WX25-P3-062-E2＝ハナレ条件＋エナ＜毒牙＞任意トラッシュ→両者-20000・配線あり／WX25-P2-009＝1ACTIVATEDマッシュを2 AUTOに分割＝refresh置換STUB＋新timing ON_CARD_MILLED_FROM_DECK[未配線マーク]）。逆翻訳が原文一致・同型★0。→ `BUGFIXES.md` 先頭。
- **🎯 次の一手（次の人へ・上から推奨）**＝**現在地は「パーサー LOSS 170→0」の途中**（このセッションで R5-R13＝234→170 消化・R14 は revert）。まず `docs/parser_worklist.md` を読む（地盤）。`npx tsx scripts/parserWorklist.ts` で現在値（**held 329／LOSS 170／VALUE 159**）を再生成できる。**⚠Stage A のクリーンな純局所も GRANT_ACCE（R13）も消化済み。Stage B の本命 LOOK/REVEAL 一族は R14 で「curation 不整合＝パーサー不能」と判明＝着手禁止**。残るクリーンな LOSS レバーは小クラスタのみ。
  1. **【小クラスタ・要慎重】Stage B の非 LOOK/REVEAL 型ペア**。**ただし⛔CHOOSE←BANISH 3（WXK07-069/WDK01-020/WDK08-L20）は R16 で着手禁止確定**（CHOOSE header 156枚中 既存 CHOOSE は73枚のみ・残83枚非CHOOSE＝curation 不整合）。CONDITIONAL←DRAW 残2（WX18-064=LIFE_CRASHED_THIS_TURN／WDK14-013=BEAT＋cost脱落）は別パターンで個別。**残るクリーンな小クラスタは枯れ気味**。**着手前に必ず①逆方向ペア②「同テキスト形の別 curation 枚数」を計器で数え、少数派なら curation 不整合＝着手しない**（R14/R16 の最大教訓）。
  - **⚠ R14/R16 の総括**：Stage B の action.type 系（LOOK/REVEAL・CHOOSE 等の構造型）は**既存 curation が同テキスト形で割れている**ものが多く、パーサーでは net 改善できない。これらは P1 の最終フェーズで **VALUE の curation 統一（bulk 正規化＋engine 確認）** としてまとめて扱う。LOSS の surgical ラウンドで触らない。
  2. **【局所】filter.cardType 13／count 11／triggerCondition 12 の残**。ただし多くは REVEAL 一族や MANUAL 絡みで純局所は枯れ気味＝1件ずつ要診断。
  3. **【⛔着手禁止】LOOK/REVEAL_AND_PICK 一族（REVEAL_AND_PICK←LOOK_AND_REORDER 23 等）**＝R14 で +105 退行確認。curation 統一は VALUE の最終 bulk レビュー案件。
  4. **【済】GRANT_ACCE_HOST_ABILITY**（R13 で wrapper 復元・8枚 LOSS→VALUE）。残6枚（WX16-074/WX17-075/WX17-077/WXK10-074/WXK10-075/WDK07-E14）は内側 MANUAL 専用で再現不能＝LOSS 残（着手しない・最終 VALUE レビュー送り）。
  5. **【着手しない／別トラック】** ①Stage C hard tail（powerRange anaphora 伝播・2枚クラスタの timing+scope・placedDown＝R11.5 ログ参照）②fromFieldByCostOrEffect（fromZones:["field"]が規約・broad化で+13退行）③duration「次の対戦相手のターン終了時まで」＝145枚慣例。**VALUE 159 は最後にまとめて逆翻訳レビューで**（パーサーでは減らない）。
  - **⚠ R14 の教訓（最重要）**：型ペアの片方向だけ見て「直す対象」と決めない。**必ず逆方向ペアも数え、自分が直そうとする型が多数派か確認**。少数派なら curation 不整合＝パーサーでは net 改善できない（VALUE 統一案件）。LOOK/REVEAL 一族がこの罠。
  - **⚠ R12 の教訓**：worklist の「action.type 78（LOSS）」は**構造差で lost leaf を持つもの**。型の値違いだけ（例 ENERGY_CHARGE↔SEND_TO_ENERGY）は **VALUE**。診断時は LOSS/VALUE を必ず区別する（`parserWorklist.ts` のセクションで判定）。
- **⚠ パーサー作業の鉄則**（R1-R4の教訓）: ①逆翻訳を直す前に **engine が当該構文を実装済みか必ず確認**（`decompile-engine-parity`）。②filter抽出は **名詞句限定**（全文スキャン禁止）。③**build後に held合計が増えていないか毎回確認**（新ハンドラの横取り退行検知）。④毎ラウンド **typecheck(tsc -b)＋同型★0** をゲートに。
- **⚠ 機構系の宿題（パーサーが一段落したら）**: 引用AUTO付与（§5 GRANT_QUOTED_AUTO_ABILITY）／機構④残（ON_CARD_MILLED_FROM_DECK 収集・refresh置換実体・「他＜毒牙＞効果で相手パワー減少」トリガー）／ビート Phase1-7＋機構④誤parse3枚は **全て要実機検証**。詳細は下の旧バトン履歴と `BUGFIXES.md`。
- **⚠ 実機検証の宿題（ヘッドレス不可・PvP/CPU要）**: ビート Phase1-3 は全て **要実機検証**（[条件]ゲートの開閉／ON_BECOME_BEAT watcher の self/any_ally 出し分け・CPU代行／beat_signi の出・起発動→beat化→ON_BECOME_BEAT連鎖）。
- **その前**: 逆翻訳器の生ID一掃（アクション21種＋STUB18種）／機構：傀儡場出し汎用化（WXK10-055）／機構④ターン限定AUTO基盤。
- **⚠ ゲートは `npm run typecheck`（`tsc -b`）を使う**（plain `tsc --noEmit` は build-mode未使用でCIが拾うエラーを見逃す。今回それで既存CI赤に気づけなかった）。
- **重要な調査結果**: クリーンな横展開系統・トリビアル個別★は枯れた。**大型機構が主戦場**。機構④で「ターン限定AUTO」を単一チョーク（initStack/pushToStack）で解決できたのが好例＝core収集点を個別に触らず安全に入れられた。
- **機構④の残り**: 誤parse3枚（WXDi-P07-044／WX25-P2-009／WX25-P3-062）＋WX25-CP1-060-E2 本体は別課題（マーカーは正）。turnOwner の付け方は確立済（該当AUTO効果の triggerCondition に追加）。**ACTIVATED《相手ターン》は現データに該当0**（将来出たら BattleScreen の起動可否ゲートが要る）。
- **機構④の誤parse3枚（中リスク・別系統）**: WXDi-P07-044=「シグニ捨てた時→そのカード場出し」＋「手札以外から場出した時→相手凍結-2000」／WX25-P2-009=ゲーム全体能力付与＋リフレッシュ置換／WX25-P3-062=「他＜毒牙＞効果で相手パワー減った時」特殊トリガー。いずれもトリガー/アクション全体が壊れた重い誤parseで新トリガー機構が要る。
- **⚠ ゲートは `npm run typecheck`（`tsc -b`）を使う**（plain `tsc --noEmit` は CI が拾うエラーを見逃す）。**effects_*.json は手動管理＝`build:effects` 禁止**。**日本語含むスクリプトは scratchpad に .mjs を書いて `node` 実行**（papaparse 等の解決のためカード参照スクリプトは project root に一時cpして実行・終わったら削除）。
- **engine注意（重要）**: 動的フィルタ（`*LteLastProcessed`/`*DiscardSigni` 等）は**アクションごとに解決経路を個別確認**。`lastProcessedCards` を渡して resolveDynamicFilter する＝execBanish/SendToEnergy/Bounce/Search/REVEAL_AND_PICK/applyDirectAction。**キャスター値**は `resolveDiscardLevelFilter(filter, ctx.ownerState)`。
- **着手中の機構**: 【ビート】（zerom が Phase1-3 完了。残サブタスクは karka が継続可。新規に別パートへ深入りする場合は §5 を `着手中(karka)` に）。
- **注意/未解決**: 「脱落疑い件数」は指標にしない（§2）。WX24-P3-026-E1 は timing 誤り（原文「メイン開始時」が ON_PLAY）が**別途**残存。

### 共有ファイルの扱い
- `BUGFIXES.md`：**新しいものを上に**追記（誰がやったか分かるよう日付/系統名を見出しに）。
- `src/`（型・engine・decompiler）は**機構実装時のみ**。着手前に §5 の状態を `着手中(名前)` にして push（次の人が同じ機構に手を付けないため）。

## 4. 偽陽性パターン（脱落疑いに出るが**直さない**）— 毎回まず除外
1. **使用条件＋本体**（「このカードは〜の場合にしか使用できない」が前置き）＝条件として正しく表現済み。
2. **CHOOSE/チェインの1文圧縮**＝択肢が逆翻訳に全部出ていれば正しい。
3. **REVEAL_AND_PICK の文法崩れ**（語順が変でも機能は正常）。
4. **ルール注記**（「（コストのない【出】能力は発動しないことを選べない）」等）＝効果ではない。
5. **アンコール/ベット注記のみ**訳に出ない＝本体が合っていれば正しい。
6. **BET_MECHANIC STUB**＝別タスク。
7. **owner:any の一括変換**は禁止（POWER_MODIFY/BANISH の `owner:'any'` は大半が正当）。

## 5. 残・大型機構（§D：1人1機構オーナー制）
着手前に**この表の「状態」を `着手中(担当名)` に更新してコミット**（重複防止）。実装の型は `TODO.md §4`「機構実装の型」に従う。

| 機構 | 影響 | リスク | 状態 |
|---|---|---|---|
| ~~《相手ターン》/《自分ターン》AUTOトリガー基盤~~ | — | — | **実装済（機構④・BUGFIXES参照）**。AUTO 30枚配線。effectStack でゲート。残: ACTIVATED版（該当0だった）・誤parse3枚 |
| ~~【ビート】機構~~ | 44枚 | — | **完了（Phase1-7）**＝[条件]ゲート12＋ON_BECOME_BEAT8＋cost.beat_signi＋[４枚以下]使用ゲート9＋トラッシュ→beat/WDK14-013＋look→pick beat化/同レベル/WDK14-008＋**MAKE_BEAT正規化＋beat対象プレイヤー選択UI**（BUGFIXES参照）。残はトラッシュ版選択ピッカーのみ（低優先）。要実機検証 |
| 引用AUTO付与の精緻化（GRANT_QUOTED_AUTO_ABILITY） | 中 | 中 | 未着手 |
| ~~傀儡場出しの汎用化（STEAL_OPP_TRASH_PUPPET を count/optional/level対応へ）＋ON_BATTLE_BANISH被バニッシュ参照~~ | 小〜中（WXK10-055 等） | 中 | **実装済（BUGFIXES参照）**。WXK10-055 全効果再構築。残: 他に同型の傀儡カードがあれば横展開可 |
| ~~`levelLteLastProcessed` フィルタ~~ | — | — | **実装済**（BUGFIXES参照） |

- 実装済み機構の履歴：コスト増加(①)・ライフクラッシュ履歴(②)・LOOK_PICK_CHAIN field宛先(③) は `BUGFIXES.md` 参照。

## 6. 標準ワークフロー（1ラウンド＝横展開）
1. **抽出**：全シート走査で「同じ壊れ方」を機械抽出（`scratchpad` の `scan*.mjs` が雛形。例：逆翻訳が「並べ替える」に退化＝look→pick脱落）。
2. **分類**：偽陽性(§4)・既知複雑札を除外し、**自担当ファイルのクリーンな系統**を確定。
3. **パッチ**：`effectId` をアンカーにした一括スクリプトで安全に置換（他カードを巻き込まない）。
4. **検証ゲート（必須・この順）**：
   - **`npm run typecheck`（＝`tsc -b --noEmit`）** ← CIと同じ。**`npx tsc --noEmit`（-b無し）は project references を見ず重複識別子等を見逃すので不可**。
   - 該当シート再生成：`npx tsx scripts/decompileEffects.ts --sheet <N> > docs/decompile_sheet<N>.txt`
   - 下流再生成：`node scripts/genReviewRepr.mjs && node scripts/groupSimilar.mjs --all && node scripts/groupBySentence.mjs --all`
   - **逆翻訳が原文一致 ＆ 同型★0** を確認
5. **記録＆バトン**：`BUGFIXES.md` に追記（新しいものを上）→ **§3「現在地（バトン）」を上書き** → コミット（末尾に「要実機検証」）→ **push**。

## 7. 進捗の可視化（推奨・P1を“終わらせられる形”にする）
- 「同型グループ × 機構」ごとに〔表現OK / 機構待ち / 偽陽性〕を集計する計器を作ると、**残り枚数が正確に**見える（既存 grouping 基盤を流用）。誰か1人が P1 序盤に整備すると3人の進捗が一目で揃う。

---
**関連**：`DESIGN.md`（設計方針）／`TODO.md`（残作業・引き継ぎ）／`BUGFIXES.md`（修正記録）／`effects-json-guide.md`（語彙）。
