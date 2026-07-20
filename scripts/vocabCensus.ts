// 語彙センサス（vocab census）＝原文の修飾句パターン × effects JSON の対応語彙の全数突き合わせ lint
//
// 既存の検出網（behavior-audit キュー＝無変化no-op／脱落疑い＝文数比較／smoke＝クラッシュ）は
// すべて「効果が足りない側」を見る網で、対象フィルタ脱落による**過剰効果**
// （例: SP07-010「最も大きいパワーを持つすべて」→無条件 BOUNCE ALL）は盤面が変化するため掛からない。
// 本 lint はその死角＝「原文に修飾句があるのに JSON に対応語彙が無い」カードを機械抽出する。
// 2026-07-04 続き18 で逆方向（JSON にあるのに原文に無い＝幻覚/取り違え）と構造軸
// （能力マーカー/引用付与平坦化/BURST内IS_MY_TURN/BURST↔E1誤配置/アーツタイミング列）を追加＝両方向網。
//
// 実行: npx tsx scripts/vocabCensus.ts  （npm run census）
// 出力: サマリ表を stdout、明細を docs/_vocab_census.txt（コミット対象・回帰diff用）
//
// 【判定粒度＝効果単位（effectId）】2026-07-13 続き109 で**カード単位から精密化**（PLAN §4 全カード完成戦略①）。
//   旧: 原文（カード全文）× JSON（カード全効果）＝**同カード別効果に語彙があれば合格**する粗い網。
//       効果Aの原文修飾句を効果BのJSON語彙が救ってしまい、真の欠落が数百件埋もれていた（死角(b)）。
//       逆に効果Aの数値を効果BのJSONに探して外す偽陽性も生み、毎バッチ手作業のトリアージ工程が要っていた。
//   新: 原文ブロック（docs/_effect_srctext.json＝build:effects が出す effectId→由来ブロックの対応表）
//       × その効果のJSONだけ、で突き合わせる。前提として **`npm run build:effects` が先に走っている**こと。
//   STUB/MANUAL 隔離も効果単位（カードに1つでも STUB があれば全効果が隔離される、が無くなった）。
//   ⚠計測仕様の変更なので新旧の数字は比較不能（カード 1447 → 効果 2264）。移行時の抜き取り検証では
//     新規顕在化した5/5がすべて真バグ（例: WX10-036-BURST＝「【アサシン】を得る」が keyword:"チャーム" に化け、
//     WX12-022-E1＝「〜の場合にしか場に出せない」制限が丸ごと消失）。
// ⚠ベースラインから増えたら回帰（PLAN.md §恒久指標）。JSON手パッチで語彙を足したら数字は自然に減る。

import * as fs from 'fs';
import * as path from 'path';

// 2026-07-04 続き18: 死角調査第2〜4弾（トリガー種別/コスト/ゾーン/構造マーカー/引用付与平坦化/
// 代わりに/できない/機構/逆方向action・数値 等）を組み込み＝25計測 → 98計測に拡張、実数 2023 で再登録。
// 2026-07-04 続き19: BURST内IS_MY_TURN を較正（TRASH前段32=engine吸収の偽陽性）＋WX05-042/12-020/21-026
// の条件是正（parser 同修正）＝2023→2003。同日続き＝逆数値4は注釈由来の偽陽性（rawAll較正で0）・
// LIFE_CRASH族（自傷owner/条件count化け6効果＋triggerBurst:false慣例の較正）・
// トラッシュ→BANISH族（parser 5規則＋curated 37ノード是正）＝2003→1977。
// 旧ベースライン履歴: 529（続き15初回・14パターン）→522→498（続き16）→1469（続き17・25計測）
// 2026-07-04 続き23: 文型クラスタバッチ①（状態条件節のCONDITIONAL持ち上げ・parser規則＋heldReview一括採用146枚）＝1931→1872。
// 2026-07-04 続き24: 「それが＜C＞のシグニの場合」73枚＝70枚はREVEAL_AND_PICK済みの偽陽性（extraOk較正）＋
// LAST_PROCESSED_MATCHES新設で実バグ13枚是正（採用10＋手パッチ3）＝1872→1800。
// 2026-07-05 続き25: 「次にダメージを受ける場合」46枚＝A11 PND済み偽陽性（キー較正）＋A2 27 damageSource復元（純改善36自動採用）＋
// B7 置換ミルが即時自傷化の実バグ→REPLACE_NEXT_DAMAGE_WITH_MILL新設（採用9＋WXDi-D07-007手パッチ）＝1800→1769。
// 2026-07-05 続き29: 「代わりに」B系統残＝per-target値すり替え・多段閾値のsubject引き継ぎ・CHOOSE平坦化復元
// （parser新規則＋heldReview採用64枚＋WXK02-037手パッチ）＝1751→1720。
// 2026-07-06 続き30: 引用能力付与の平坦化バッチ①68枚採用＝1720→1686。
// 2026-07-06 続き31: held owner是正3枚採用（語彙計器対象外で不変）＝1686→1684（未反映分を実数更新）。
// 2026-07-06 続き33(Sonnet): B層データ欠落補完＝REVEAL_AND_PICK/LOOK_AND_REORDER pick脱落16枚是正＝1684→1670。
// 2026-07-07 続き34(Opus): 引用付与CONTSELF_COND機構新設＝GRANT_FIELD_SIGNI_ABILITY{thisCardOnly}採用4枚＝1670→1667。
// 2026-07-07 続き35(Sonnet): Opusバッチ後の再収穫＝IS_SELF_IN_CENTER_ZONE単一条件で正しく拾えた4枚採用
// （WXDi-P04-057/074・WDK07-Y14・WXK09-059＝ON_ATTACK等トリガー構造が正しく捕捉された分。複合条件脱落
// （WX06-035/WX15-054等）・GRANT_PROTECTION等価変換のcount退化（WXEX1-35）・条件型が別種で未対応
// （WX13-058/WXDi-P13-052/WXK06-023）は原文照合で弾いて held に温存）＝1667→1665。
// 2026-07-07 続き35(Sonnet)第2ラウンド: 同バッチの続き＝WXDi-P06-046/SPDi01-132/WXK02-023 追加採用3枚
// （census高シグナルパターン対象外のため数値不変＝1665のまま）。
// 2026-07-07 続き35(Sonnet)第3ラウンド: B層REVEAL_AND_PICK残タスク＝WXDi-CP01-001/WX24-P4-061/WX24-D1-25の
// LOOK_AND_REORDER+TRANSFER_TO_DECK誤エンコードをREVEAL_AND_PICKへ手パッチ（MANUAL刻印）＝1665→1663。
// 2026-07-07 続き35(Sonnet)第4ラウンド: B層残タスク(c)ピック結果色条件トレイル＝WX25-CP1-025/027/031・
// WX25-P3-047の4枚をLAST_PROCESSED_MATCHES条件で手パッチ（MANUAL刻印）＝1663→1659。
// 2026-07-07 続き35(Sonnet)第5ラウンド: 同4色セット最後の1枚＝WX25-CP1-029（緑）＝ADD_TO_FIELD結果への
// targetsLastProcessedバフ（POWER_MODIFY+GRANT_KEYWORD）で是正（MANUAL刻印）＝1659→1658。
// 2026-07-07 続き35(Sonnet)第6ラウンド: B層残タスク(b)2段/複合ピック＝WXDi-P06-053/WX25-P1-035/
// WX26-CP1-019をLOOK_PICK_CHAINへ手パッチ（MANUAL刻印）＝1658→1655。
// 2026-07-07 続き35(Sonnet)第7ラウンド: B層残タスク(d)CHOOSE内包＝WXDi-P10-004のCHOOSE選択肢1を
// REVEAL_AND_PICK+ADD_TO_FIELDへ手パッチ（MANUAL刻印）＝1655→1654。WX26-CP1-100は
// 「トラッシュ→エナゾーンの対象指定移動」という未実装engineメカニズムが要るため見送り（Opus向け）。
// 2026-07-07 続き41(Opus): GRANT_TO_PLACED_SIGNI 実装＝「この方法で場に出たシグニは【K】を得る/のパワーを＋N」を
// parser で GRANT_KEYWORD/POWER_MODIFY{targetsLastProcessed} へ振り分け、WX25-P1-044/WX25-P2-039/WX24-P3-037 を
// STUB から実アクションへ採用。⚠この3枚は STUB を外したことで census の blanket STUB 免除（js.includes('STUB')）
// を失い、アサシン等キーワードのリマインダ文（「正面のシグニがパワーNN以下の場合…」）＋「Nまで場に出す」pick の
// 語彙が高シグナルに顕在化＝1628→1631（+3）。いずれもキーワード付与/LOOK_PICK_CHAIN/SEND_TO_ENERGY で正しく
// 表現済みの偽陽性（リマインダ文・pick 上限）で、実効果の脱落ではない＝ベースラインを実数更新。
// 2026-07-08 続き48: 「このシグニが覚醒状態の場合」CONDITIONAL 持ち上げ（THIS_CARD_IS_AWAKENED）7枚採用＝1623→1621。
// PR-Di038/039・WXDi-P14-045/047/049・WX25-P2-072/075 のアタックフェイズ開始時効果を覚醒ゲート化（過剰効果是正）。
// dedup -2（CHOOSE 札 WX25-P2-072/075 は別分岐の条件〔①赤スペル使用歴 等〕が残り高シグナル継続）。
// 2026-07-09 続き49: 「あなたの場にあるすべてのシグニが＜C＞/《ディソナアイコン》の場合」CONDITIONAL 持ち上げ
// （新設 ALL_FIELD_SIGNI_MATCH・空盤面 false）20枚採用＝1621→1616（dedup -5・SEQUENCE 下流の そうした場合/nested 条件が
// 残るカードは高シグナル継続）。《ディソナアイコン》は isDisona（Story='Dissona'）でエンコード（カード名ではない）。
// 2026-07-09 続き52: 「制限『できない』」パターンに extraOk 較正＝「しか使用/発動できない」の使用条件（useCondition・
// eff.condition で表現・extractUseCondition が解析済み）41枚の偽陽性をクリア＝1616→1588（dedup -28）。真バグ0を機械確認済み
// （使用制限で condition 無しは0枚）。残17枚は effect-restriction（アタック/場に出せない等＝BLOCK 表現要）で継続。
// ⚠2026-07-13 続き109(Opus): 判定粒度を**カード単位→効果単位**に切替（上のヘッダ参照）。
// ベースラインも「高シグナル欠落カード数 1447」→「高シグナル欠落**効果**数 2264」へ一括切替（併記期間なし）。
// 数字が飛んだのは退化ではなく計測仕様の変更＝旧網が救っていた真の欠落が顕在化したもの（抜き取り5/5が真バグ）。
const BASELINE_HIGH = 1845; // 続き226（Opus・§3 タスク12(xxix)(b) 完了＝照応先ロスト系統）: 「対戦相手のシグニ1体を対象とし、[任意コスト]。そうした場合、（ターン終了時まで、／カードを1枚引き、）それの/それは…」で「それ」の指し先が任意コスト文を挟んで失われ POWER_MODIFY/GRANT が owner:self+targetsTriggerSource（＝トリガー元＝自分シグニ）へ、TRANSFER_TO_HAND が source:DECK_CARD（自デッキ）へ化けていた系統を parser 後処理で復元。applyLeadingOpponentDesignation の照応検出を「それを」限定から「それ[をのは]＋介在節（読点まで）＋それら」へ拡張＝owner:self/any→opponent＋tts撤去＋欠落フィルタ補完（Pattern A）。「あなたのトラッシュから…シグニN枚を対象とし…そうした場合、それを手札に加える」の DECK_CARD→TRASH_CARD 復元ハンドラ applyLeadingTrashHandAnaphora を新設（Pattern B）。「代わりに」置換（二重power-modifyへ平坦化）だけ findTail 部分補正を避けて据置。TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST コスト付き（engine fixOwnerTOSOC が実行時補正）も JSON を opponent へ直す＝旧 accusative 補正と同じく退化なし（fixOwner は冪等）。ライブ84枚（87 leaf）＋MANUAL の WXDi-CP02-072-E1 を是正。census は owner 変更が「欠落語彙」計器をほぼ動かさず（挙動是正であり golden/smoke/fuzz で担保）1846→1845。旧・続き225（Opus・§3 タスク12(vii)系 完了）: 「〜てもよい」（任意アクション）が parser で optional:true を落とし engine が強制実行していた系統退化を消化。DOWN（parseSentencePart1「ダウンしてもよい」）／手札捨て（同「手札をN枚捨ててもよい」＝先頭非アンカーで「…を対象とし、手札を…捨ててもよい」も拾う）／エナ→トラッシュ（parseSentencePart3「対戦相手のエナゾーンから…トラッシュに置いてもよい」）／場出し（同 part1 の 手札から/トラッシュから「場に出してもよい」＝旧・続き207 が down 変種限定していた据置を plain へ拡張）の各ハンドラに「てもよい」→optional を配線。ライブ実害＝90枚が optional 欠落で強制実行だったのを build:effects の純粋上位集合（無損失）自動採用で一括是正（全件 source に「てもよい」在を機械確認・偽陽性0）。さらに optional 復元で過去 held の改善（219b CHOOSE 条件・STUB→REVEAL 等）が pure-superset として解禁され自動採用＝census が押し下げ。加えて WXDi-P00-033／WX24-P2-087／PR-305 を heldReview で採用（optional＋束ねた既存改善）・SPDi43-30 は choice② の HAND_COUNT ドリフト退化を避け choice① の optional のみ手術的パッチ＋MANUAL 化。1865→1846。旧・続き224（Opus・§3 タスク1(d) 完了）: WX25-P3-085 の単文型 grant mis-parse＝「＜微菌＞のシグニ1体を対象とし、ターン終了時まで、それは「【自】…ライフクロスをクラッシュしたとき、カードを1枚引く」を得る」が内側能力を漏れ出させ ON_OPP_LIFE_CRASHED/DRAW にトップ潰れしていたのは既に fresh 側で解消済（GRANT_EFFECT{ON_DISCARDED_AS_COST, discardCostSourceStory:微菌}）で再収穫のみ。同カード BURST「対戦相手のルリグ1体を対象とし、それをダウンする」が DOWN 対象を SIGNI に取り違えていたのを parseSentencePart1 の DOWN 規則に FREEZE と同型の bare-LRIG 検出（センター無しの「ルリグ1体を対象」→ target:'LRIG'）を追加して是正。semantic audit クラスタ「対戦相手のルリグ1体」の DOWN 系統11効果を一括是正（うち WX24-P1-069/WX24-P3-077 は E1 の optional 据置ドリフトを避け BURST のみ手動採用）。1866→1865。旧・続き222（Opus・§3 タスク12(xxix) 残(a) 完了）: WX06-014-E2「対戦相手のシグニ1体を対象とし、あなたのトラッシュから《古代兵器》のシグニ5枚を…デッキの一番下に置く。そうした場合、それをバニッシュする」＝step1 が「相手シグニをデッキ下」に化けていた（原文と別物）。自分トラッシュから古代兵器5枚をデッキ下へ移す TRANSFER_TO_DECK（TRASH_CARD/story:古代兵器/count5/bottom）へ是正し MANUAL 化。既存の did-it ゲート（TRANSFER_TO_DECK が空振り＝古代兵器不足なら banish 不発）で「そうした場合」を表現。exceed コストは既存・「それ」は相手シグニ1体で盤面不変ゆえ末尾の再選択が照応と同値。1867→1866。旧・続き221（Opus・§3 タスク12(viii) 完了）: WXDi-P10-034「デッキ上4枚を見て1枚を裏向きでシグニゾーンに置き、次の自メインフェイズ開始時に表向きにしてもよい（＋5000）／しなければ手札」を実装。従来 LOOK_AND_REORDER（4枚見て全部デッキ下）へ潰れ裏向き設置・ターン跨ぎ遅延・表向き分岐が全脱落していた。専用 STUB LOOK_PLACE_FACEDOWN_DELAYED＋facedown_signi ゾーン＋pending_facedown_flip（ターン境界クリア対象外の永続フィールド）＋field_power_mods（場にあるかぎり+N）を新設し、collectTurnTriggers の ON_MAIN_PHASE_START に遅延分岐（RESOLVE_FACEDOWN_FLIP）を注入。1868→1867。旧・続き220（Opus・§3 タスク12(vii) 完了）: WX25-P2-112「アップ状態のルリグをダウンしてもよい。その後、この方法でダウンしたルリグと共通する色を持つ相手エナ1枚をトラッシュ」を実装。parser は DOWN を SIGNI に取り違え・TRASH を無条件＆色フィルタ無しにしていた。engine の execDown(LRIG) がダウンしたルリグ instance を lastProcessedCards に記録＋アップ状態チェック＋optional 二択を追加し、`colorMatchesLastProcessed` フィルタ（owner非依存・参照不能なら空ヒット＝did-it ゲート）を新設して MANUAL 化。1869→1868。旧・続き219c（Opus・§3 タスク12(xxii)）: 「あなたの手札から＜C＞のシグニをN枚(まで)/好きな枚数 公開する」が bare REVEAL に潰れ source/filter/count が脱落し、engine が lastProcessedCards を記録せず「この方法でシグニをN枚以上公開した場合」の結果カウント条件が IS_MY_TURN 化していた系統を是正。parseSentencePart2 の手札公開規則を「公開してもよい」限定から「公開する（必須）／N枚・N枚まで・好きな枚数」へ一般化。REVEAL{source:HAND_CARD} 復元で6枚を純改善自動採用（filter/optional 復元）＋WX21-023 の公開2枚ゲート復活。1874→1869。旧・続き219b（Opus・§3 タスク12(xxxix)）: CHOOSE ヘッダ（「以下の…から…を選ぶ」）直前の状態条件を効果全体のゲートへ持ち上げる汎用処理を追加（従来は「場にレベルN,M,K」専用のみ＝CHOOSE 分解がヘッダ以前を捨てて条件が脱落し毎アタックフェイズ無条件発火だった）。`matchLeadingStateCondition` で拾える条件のうち直後が CHOOSE ヘッダのものだけ持ち上げ。10枚是正（WX24-P2-048「場に《満月の使徒 小湊るう子》がいる場合」・ディソナ2体・レゾナ 等）。1878→1874。旧・続き219（Opus・§3 タスク12(xxxix)）: 条件外不一致の個別修正5枚。(1)「各ターン終了時、」がトリガー句 strip リストに無く（`^ターン終了時、`は「各」始まりに非マッチ）先頭状態条件の CONDITIONAL 持ち上げが不発＝WXK04-027-E2 の「エナ色2種類以上」ゲート脱落。strip リストに追加。(2)「あなたの手札が対戦相手より少ない/多い場合」＝HAND_DIFF{lt/gt,0} を STATE_CONDITION_CLAUSES_V2・Condition 型・execUtils.evalCondition・decompiler に配線（従来は ActiveCondition のみ＝CONDITIONAL 未評価）。WX20-005（無条件3ドロー）／WX24-P1-045／WX24-P2-022（多い→バニッシュ／少ない→ハンデスの二分岐が両方無条件）／WXK10-045（毎アタックフェイズ無条件バニッシュ）を是正。1880→1878。旧・続き218g（Opus・§3 タスク12）: parser は正しく REVEAL_AND_PICK を出すのに curated が古い LOOK_AND_REORDER のまま held ドリフトし「その中から…手札に加え」（カードアドバンテージ）が丸ごと死んでいた9効果を採用（build:effects の harvest は型スワップを held に上げず curated 温存＝heldReview 不可視のため fresh を外科的採用。過剰簡約の WXK10-022-E3 等は除外）。1886→1880。旧・続き218f（Opus・§3 タスク12）: 「[あなたの/対戦相手の]アタックフェイズの間、」限定の CONTINUOUS 常在効果が activeCondition 脱落で PERMANENT に潰れ相手ターン中も過剰適用だった系統を是正＝ActiveCondition に DURING_ATTACK_PHASE を新設し parser（parseActiveCondition パターン1b）／engine（checkActiveCondition＋calcFieldPowers に turnPhase 貫通・13呼び出し元へ bs.turn_phase）／decompiler を配線。13効果12カード是正（POWER 9＋シャドウ付与2＋BANISH_REDIRECT 2。1888→1886）。旧・続き218e（Opus・§3 タスク5）: 「（トラッシュから…対象とし、）それをデッキの一番上に置く」がトラッシュ回収→山札トップ（TRASH_CARD）ではなく場のシグニ移動（SIGNI）へ幻覚化していた系統を是正＝part1 の緩い field-SIGNI 規則にトラッシュ回収 guard＋position:top、part2 のトラッシュ→トップ規則を「N枚まで」＋level/color/story フィルタへ拡張。8枚是正（1891→1888）。旧・続き218d（Opus・§3 (xliii)）: BANISH_REDIRECT 族の census 偽陽性を解消＝「（対戦相手の）シグニがバニッシュされる場合、エナゾーンに置かれる代わりにトラッシュに置く」の destination 句は BANISH_REDIRECT で表現済み。「ゾーン:エナゾーンに置く」に extraOk 較正（idiom 句を除いた残りに「エナゾーンに置」が残るときだけフラグ維持＝lrigDown と同じ安全弁）。全22効果で残存0を機械確認（うち4件がこのカテゴリ専属＝dedup 総数 1895→1891）。旧・続き218（Opus）: ①「場に＜C＞/(色)のシグニがN種類以上ある場合」＝HAS_CARD_IN_FIELD の distinctNames を parser 語彙＋engine evalCondition に実装（1919→1916）／②lrigDown コストの限定（centerOnly/level）を parser・支払い経路に実装し、表現済みの場合だけ「ダウン/アップ状態フィルタ」の偽陽性を解消（1916→1899）。旧: 続き215 絆マーカー（【絆常/自/起/出】）を効果ブロック境界として認識＝134カード137能力の飲み込みを解消（1928→1919）。旧: 続き214 タスク6在庫消化（1929→1928）

// 2218 // 続き136(Opus) タスク17: 【自】の timing 判定を「効果ブロック先頭のトリガー句」に限定（従来は actionText 全体を
//        見ており、トリガー句より後ろの本文/引用付与の内側にある「…したとき」を先に拾って timing が化けていた）。
//        「アタックフェイズ開始時」の誤 timing 23効果を ON_ATTACK_PHASE_START へ是正（2218→2215）。
// 2229 // 続き110(Fable) 第2バッチ: SPELL_USED_THIS_TURN 機構新設（Condition型＋evalCondition＝actions_done
//   'USE_SPELL' 参照＋parser hoist/V2表＋decompiler）＝「このターンにあなたがスペルを使用していた場合」の
//   条件丸ごと脱落11効果（hoist 8・「代わりに」置換1・CHOOSE選択肢別2）を是正。あわせて V2 に
//   「あなたの場に(色)の＜C＞のシグニがある場合」「あなたの場に＜C＞のシグニがある場合」を追加し8枚収穫。
//   lifting にガードD（OPTIONAL_COST系は SEQUENCE 直下ステップ必須＝CONDITIONAL包みで支払フロー崩壊）・
//   ガードE（COUNTER_SPELL は findCounterSpellMaxCost 非再帰＋UI無条件打ち消し）を新設＝既存 curated の
//   包み形27枚が held に浮上（既存潜在バグ・PLAN §3 タスク12 へ登録）。2243→2229。
// 2243 // 続き110(Fable):「対戦相手のアップ状態のシグニN体を対象とし、ターン終了時まで、パワー－N」BURST 21効果
//   ＝parseSentencePart1 のパワー修整対象分岐が「アップ状態の」等の状態接頭辞を許容せず default {owner:'any',filter無し}
//   に落ちていた（owner脱落＋isUp脱落の過剰効果）。状態接頭辞を parseSigniTarget 委譲分岐へ追加（アップ/ダウン/凍結状態）。
//   fresh採用17枚＋手修正温存4枚（WXDi-D06-021/P09-083/P11-083/P15-075）は effectId 外科パッチ。2264→2243。
// 以下は旧・カード単位ベースライン（1447）の履歴。効果単位への切替前の消化記録として残す。
// 旧BASELINE 1447 // 続き107(Opus): WX25-P3-116＝「黒アーツ使用時 代わりに-5000」の色別ARTS_USED_THIS_TURN置換を STATE_CONDITION_CLAUSES に追加＋line3210 hoist を「代わりに」時スキップ＝効果全体が条件付き化＋SEQUENCE両実行(-3000&-5000)だった過剰効果を CONDITIONAL{ARTS_USED{黒},then:-5000,else:-3000} へ是正。1448→1447。以下同続き107: ベット「代わりに」置換機構＝(1)STATE_CONDITION_CLAUSESに IS_BETTING を追加し「あなたがベットしていた場合、代わりに<X>」を CONDITIONAL{IS_BETTING,then:強化,else:基本} 化（WD19-006/007 の値すり替え2枚採用）。(2)ベット選択数変更型「以下のN個からMつ選ぶ。ベットしていた場合、代わりにKつ選ぶ」に betChoose 機構新設（type/engine effectExecutor/parser/decompiler。engine は is_betting で choose_count 上書き＝recollectArts と同型）。(3)census「コスト:《コイン》」に extraOk 較正＝「ベット―《コイン》」プレフィックスの《コイン》はベット宣言コスト（機構:ベットで別途計測）で二重計測しない＝betting 表現の JSON なら covered。1454→1448（WD19-006/007 の脱STUBで+2した分と、bet-prefix《コイン》を二重計上していた既存betting札の是正で計-6）。以下続き106(Opus): 「代わりに」置換の五面4枚（WX06-003/004/005/006）＝STATE_CONDITION_CLAUSESに「センタールリグが(色)でライフN枚以下」複合条件（AND[LRIG_COLOR,LIFE_COUNT]）を追加しparserがCONDITIONAL{then:強化,else:基本}を生成→heldReview採用で1458→1454。以下同続き106: 色別ARTS_USED_THIS_TURN機構（turn_arts_used_colors state＋Condition.color＋parser規則）新設でWX24-D1〜D4-11の色別アーツ条件脱落4枚を是正して1461→1458。以下続き105(Sonnet): CHOOSE選択肢②「あなたの場に(色)の＜C＞のシグニがある場合」の条件節が丸ごと脱落（+一部は誤ってtarget.filterへ混入）していた6枚を ChoiceOption.condition（既存の選択可否ゲート語彙・engine/parser不変）で是正して1477→1471。続けて「対象のパワーN以下のシグニ…捨ててもよい。そうした場合、バニッシュ」型（LIFE_BURST中心）9枚のTRASH.optional欠落＋パワー閾値フィルタ脱落を既存idiom（optional:true+CONDITIONAL(IS_MY_TURN)+powerRange。WXDi-D08-013等の既存実装済みパターンを踏襲）で是正して1471→1467。続けて「あなたの場に(色)と(色)のシグニがある場合」CLAUSES新設＋「このルリグがアタックしたとき」プレフィックス未対応（既存CLAUSES複数が阻害されていた構造欠陥）を修正し10枚是正で1467→1461
// 続き77(Sonnet・§5c再収穫): held 85枚採用（GRANT_LRIG/FIELD_SIGNI_ABILITY・CHOOSE復元・IS_SELF_IN_CENTER_ZONE等）で 1514→1494
// 続き76(タスク10 パターンF-2): 相手効果による手札/エナ喪失の条件語彙を新設（2枚）で 1516→1514
// 続き76(タスク10 パターンF-4): 「次のあなたのアタックフェイズ開始時」の遅延トリガー化（9枚）で 1519→1516
// 続き76(タスク10 パターンF-3): スペルの【自】ブロック分離（5枚）で 1520→1519
// 続き76(タスク10 パターンF-1): 連用中止形「Aし、Bする」の先頭動作脱落を是正（47枚）で 1522→1520
// 続き76(タスク10 パターンF一部): 「ルリグかシグニ」DOWN の CENTER_LRIG_OR_SIGNI 是正で 1523→1522
// 続き76(タスク10 パターンD): 「ライフクロスがちょうどN枚の場合」の条件ゲート脱落を是正で 1525→1523
// 続き76(タスク10 パターンC): 効果ドロー禁止 BLOCK_ACTION・「選んだ能力を得る」STUB委譲で 1526→1525
// 続き76(タスク10 パターンB): センタールリグ対象の FREEZE/NEGATE_ATTACK を LRIG へ是正（+CHOOSE復元）で 1528→1526
// 続き76(第3弾): timing 語彙追加（ON_OPP_VIRUS_PLACED/ON_ENERGY_CHARGE「【エナチャージ】をしたとき」/ON_CARD_MOVED_TO_DECK/ON_TARGETED「シグニの能力で対象化」）で 1529→1528。§3 Opusタスク16
// 続き76(第2弾): timing 語彙追加（ON_CARD_MILLED_FROM_DECK/ON_SELF_REVEAL_FROM_HAND/placedFront/leftToZone:hand/ON_HAND_DISCARDED の triggerFilter）で 1532→1529。§3 Opusタスク16
// 続き76(第1弾): timing 語彙追加（ON_ACCE/ON_ACCE_ATTACH/ON_REFRESH/ON_ENERGY_TO_TRASH/ON_SIGNI_FROZEN/ON_OPP_POWER_DECREASED/ON_DISCARDED_AS_COST/ON_GUARD/ON_OPP_ARTS_USE）で 1537→1532
// 続き75: timing 語彙追加（ON_SIGNI_BANISH_OPPONENT/ON_MAIN_PHASE_START/ON_SPELL_USE/ON_EXCEED_COST/ON_RISE/ON_SIGNI_BECOMES_DRIVE/ON_ARTS_USE/ON_TRASH「手札から」）で 1557→1537

const DATA_DIR = path.join(process.cwd(), 'public', 'data');
const OUT_PATH = path.join(process.cwd(), 'docs', '_vocab_census.txt');
// --clusters: 高シグナルのマッチ節を文型テンプレートに正規化してクラスタ表を出力（消化バッチの入口）
// 実行: npm run census:clusters ＝ 1900枚のID羅列でなく「枚数順テンプレ一覧」から系統バッチを選べる
const CLUSTERS_MODE = process.argv.includes('--clusters');
const CLUSTERS_OUT = path.join(process.cwd(), 'docs', '_census_clusters.txt');

interface Pattern {
  name: string;
  re: RegExp;
  /** カードJSON文字列にいずれか1つでも含まれれば「表現あり」とみなす語彙キー */
  keys: string[];
  /** 判定前に原文へ適用する前処理（例: 「そうした場合」＝then連鎖の帰結句を条件節から除外） */
  pre?: (t: string) => string;
  /** keys で表せない語彙判定（true＝表現あり＝合格）。keys との OR */
  extraOk?: (js: string, t: string) => boolean;
  /** 照合する原文: 'all'（効果+LB・既定）| 'eff'（効果テキストのみ。トリガー句/コスト節等LBに現れない系） */
  src?: 'all' | 'eff';
}

// キー表は 2026-07-04 に抜き取り検査で較正済み（SELF_POWER_GTE / levelFilter:"same" / $ref 等の
// 条件系・動的解決系の表現を偽陽性として除外できることを確認）。新語彙を DSL に足したらここにも足す。
// 続き17追加分の較正メモ: クラス＝JSON語彙は `story`／色＝コスト側（energy/handDiscardSigni）の色値は
// 正当なので extraOk で色値単位判定／「持続(ターン終了時まで)」は不採用＝engine が INSTANT の
// POWER_MODIFY/GRANT_KEYWORD を temp バケツ（ターン終了時リセット）で吸収するため偽陽性が支配的。
// 続き18追加分の較正メモ: 基本パワー＝`POWER_SET`／コイン＝`GAIN_COIN`（大文字）+cost `coin`／
// LB有無は effectType 判定（STUB id への部分一致誤爆回避）／マーカー系は引用『「…」』と
// 「【出】能力/効果」参照文を除去してから判定／「対戦相手→opponent不在」は HAND_DIFF 等の
// 条件型で正当表現されるため不採用（未較正）。
const PATTERNS: Pattern[] = [
  {
    name: '最上級(最も×パワー/レベル)',
    re: /(最も|一番)[^。]{0,10}(パワー|レベル)|(パワー|レベル)[^。]{0,6}(最も|一番)(高|低|大き|小さ)/,
    keys: ['superlative', 'HIGHEST', 'LOWEST'],
  },
  {
    name: '動的比較(〜より高い/低い)',
    re: /より[^。]{0,6}(高い|低い|大きい|小さい)/,
    keys: ['powerLtSelf', 'powerLteSelf', 'powerGtSelf', 'levelLtSelf', 'levelGtSelf',
      'powerLtTrigger', 'powerLteTrigger', 'levelLtTrigger', 'levelGtTrigger', 'powerLtAnyAlly', 'powerLtPrinted', 'powerGtPrinted',
      'powerBelowLeftCard', 'levelBelowLeftCard',
      'powerLteLastProcessed', 'powerLtLastProcessed', 'levelLteLastProcessed', 'levelLtLastProcessed', 'levelLteDiscardSigni',
      'levelBelow', 'powerBelow', 'LowerLevel', 'LOWER', 'HIGHER'],
  },
  {
    name: 'パワー閾値(NN以上/以下)',
    re: /パワー(が)?[０-９\d]+以[上下]/,
    keys: ['powerRange', 'SELF_POWER', 'FRONT_SIGNI_POWER', 'POWER_GTE', 'POWER_LTE', 'powerGte', 'powerLte', 'powerMin', 'powerMax'],
  },
  {
    name: 'レベル閾値(N以上/以下)',
    re: /レベル[０-９\d]以[上下]/,
    keys: ['"level"', 'levelRange', 'levelFilter', 'LEVEL_GTE', 'LEVEL_LTE', 'levelMax', 'levelMin', 'requiredLevel'],
  },
  {
    name: '同一性(〜と同じ色/レベル/名前)',
    re: /と同じ(色|レベル|カード名|名前|クラス)/,
    keys: ['levelEq', 'colorMatchesLrig', 'sameAs', '"same"', 'sameLevel', 'sameName', 'sameColor',
      'levelEqualsVar', 'SAME_'],
  },
  {
    name: '共通する色',
    re: /共通する色/,
    keys: ['MatchesLrig', 'eachDistinctColor', 'commonColor', 'sharedColor', 'SAME_COLOR', 'COMMON_COLOR'],
  },
  {
    name: '凍結状態フィルタ',
    re: /凍結状態の/,
    keys: ['isFrozen'],
  },
  {
    name: 'ダウン/アップ状態フィルタ',
    re: /(ダウン状態の|アップ状態の)/,
    keys: ['isDown', 'isUp'],
    // 「アップ状態の［レベルNの］［センター］ルリグN体をダウンする」はコスト `cost.lrigDown` が
    // 限定（count / level / centerOnly）ごと表現済み＝この語形だけを理由に高シグナルへ落ちるのは偽陽性
    // （続き218 で lrigDown を持つ全21効果を個別確認。うち6件は限定が実際に落ちていた真バグで、
    //  parser/支払い経路を直してからここを緩めている）。
    // ⚠ 無条件マスクにはしない＝コスト句を除いた残りに状態語が残るならフラグを維持する
    //   （lrigDown コストと「アップ状態のシグニ」フィルタを併せ持つ将来のカードを隠さないため）。
    extraOk: (js, t) => js.includes('lrigDown')
      && !/(ダウン状態の|アップ状態の)/.test(
        t.replace(/アップ状態の(?:レベル[０-９\d]+の)?(?:センター)?ルリグ[０-９\d]+体をダウンする/g, ''),
      ),
  },
  {
    name: '名前包含(カード名に《X》を含む)',
    re: /カード名に《[^》]+》を含む/,
    keys: ['cardName', 'cardNames', 'nameContains'],
  },
  {
    name: '否定フィルタ(〜ではない○○)',
    re: /では?ない(シグニ|カード|スペル|ルリグ)/,
    keys: ['Exclude', 'exclude', 'nonColorless', 'noGuard', 'notResona', 'isResona'],
  },
  {
    name: '数量比例(1枚/1体につき)',
    re: /(１|1)(枚|体|つ)につき/,
    keys: ['deltaPer', 'PER_', 'perCount', 'countFilter', 'PerCard', 'PerLevel', 'PerCharm',
      '$ref', 'last_processed', 'lastProcessed', 'addLast'],
  },
  {
    name: '合計制約(合計がN以上/以下)',
    re: /(パワー|レベル|コスト)の合計が[０-９\d]+以[上下]?/,
    keys: ['costMax', 'costMin', 'Sum', 'sum', 'totalPower', 'totalLevel'],
  },
  {
    name: 'それぞれ異なる',
    re: /それぞれ(色|レベル|カード名|名前)?の?異なる/,
    keys: ['eachDistinct', 'distinctName'],
  },
  {
    name: '奇数/偶数',
    re: /(奇数|偶数)/,
    keys: ['levelParity', 'odd', 'even'],
  },
  // ---- 2026-07-04 続き17 追加分（死角調査＝抜き取り較正済み。確定バグ例は PLAN.md §4 続き17）----
  {
    // 「そうした/そうしなかった場合」は直前の任意行動の帰結（then連鎖で表現）なので状態条件から除外
    name: '条件節(〜の場合)',
    re: /場合[、,]/,
    pre: t => t.replace(/そう(しなかった|した|でない|である)場合/g, ''),
    keys: ['condition', 'Condition', 'CONDITIONAL', 'HAS_CARD_IN_FIELD', 'COUNT_THRESHOLD',
      'DECK_TOP', 'TRASH_HAS', 'ENERGY_HAS', 'HAND_COUNT', 'LIFE_COUNT', 'TRASH_COUNT',
      'FIELD_COUNT', 'ENERGY_COUNT', 'LRIG_LEVEL', 'LRIG_STORY', 'LRIG_TEAM', 'LRIG_NAME',
      'ARTS_USED', 'LIFE_CRASHED', 'FIELD_HAS', 'FIELD_SIGNI', 'FIELD_CLASS',
      // 「このターン、次にあなたが（シグニ/ルリグによって）ダメージを受ける場合、代わりに〜」は
      // 置換シールド予約アクションが条件を内包する正表現（続き25・46枚較正）
      'PREVENT_NEXT_DAMAGE', 'REPLACE_NEXT_DAMAGE'],
    // 「（公開して）それが＜X＞のシグニの場合、それを手札/エナ/場へ」は REVEAL_AND_PICK{filter:story}
    // の pick 表現で条件が JSON に載る（続き24・70枚較正＝WX02-030/WXK01-050 系サイクル）。
    // 各節の＜X＞が JSON の story 値に居ることを個別確認し、他に条件節が残らないときだけ合格。
    extraOk: (js, t) => {
      if (!js.includes('REVEAL_AND_PICK')) return false;
      let allCovered = true;
      const t2 = t.replace(/それが＜([^＞]+)＞(?:か＜([^＞]+)＞)?のシグニの場合、それを[^。]*。?/g,
        (whole, s1: string, s2: string | undefined) => {
          const okCov = js.includes(`"story":"${s1}"`) && (!s2 || js.includes(`"${s2}"`));
          if (!okCov) { allCovered = false; return whole; }
          return '';
        });
      const t3 = t2.replace(/そう(しなかった|した|でない|である)場合/g, '');
      return allCovered && t2 !== t && !/場合[、,]/.test(t3);
    },
  },
  {
    name: 'クラス指定(＜X＞のシグニ)',
    re: /＜[^＞]+＞の(シグニ|カード)/,
    keys: ['story', 'cardClass', 'commonClass', 'CLASS'],
  },
  {
    // 色値はコスト側（energy/handDiscardSigni）にも正当に現れるため、
    // 原文で言及された色がどこにも color 値として現れない場合のみ欠落（保守的下限）
    name: '色フィルタ(白/赤/青/緑/黒/無色の○○)',
    re: /[白赤青緑黒]の(シグニ|カード|スペル|ルリグ)|無色の(シグニ|カード)/,
    keys: [],
    extraOk: (js, t) => {
      const colors = [...t.matchAll(/([白赤青緑黒])の(?:シグニ|カード|スペル|ルリグ)/g)].map(m => m[1]);
      if (/無色の(シグニ|カード)/.test(t)) colors.push('無');
      return colors.every(c => js.includes(`"color":"${c}`) || js.includes('"colors"')
        || js.includes('colorMatchesLrig') || js.includes('nonColorless'));
    },
  },
  {
    name: '正面(正面のシグニ等)',
    re: /正面/,
    keys: ['front', 'Front', 'FRONT', 'facing', 'opposite'],
  },
  {
    name: 'ライフクロス枚数条件',
    re: /ライフクロスが[０-９\d]枚/,
    keys: ['LIFE_COUNT', 'lifeCount', 'LIFE_CLOTH', 'condition', 'Condition'],
  },
  {
    name: '任意(してもよい)',
    re: /(してもよい|することができる)/,
    keys: ['"mandatory":false', '"optional":true', 'mayChoose'],
  },
  {
    name: '能力を持たない/失っている',
    re: /能力を(持たない|失って)/,
    keys: ['keyword', 'Abilit', 'abilit', 'vanilla'],
  },
  {
    name: '除外(〜以外の)',
    re: /以外の(シグニ|カード|スペル|ルリグ)/,
    keys: ['xclude', 'nonColorless', 'noGuard', 'thisCardOnly', 'exceptSource'],
  },
  {
    name: 'ターン1回制限',
    re: /《ターン(１|1)回》|ターンに(一度|１回|1回|一回)/,
    keys: ['usageLimit'],
  },
  {
    name: 'ゲーム1回制限',
    re: /《ゲーム(１|1)回》|ゲーム(中に)?(一度|１回|1回|一回)/,
    keys: ['usageLimit', '"GAME"'],
  },
  // ---- 2026-07-04 続き18 追加分・第2弾（トリガー種別/コスト/ゾーン/基本パワー。PLAN.md §4 続き18）----
  { name: 'トリガー:アタックしたとき', re: /がアタックしたとき/, keys: ['ON_ATTACK', 'ATTACK_ARTS'], src: 'eff' },
  { name: 'トリガー:場に出たとき', re: /場に出たとき/, keys: ['ON_PLAY', 'ON_ZONE_MOVED', 'ADD_TO_FIELD'], src: 'eff' },
  { name: 'トリガー:バニッシュされたとき', re: /バニッシュされたとき/, keys: ['ON_BANISH'], src: 'eff' },
  { name: 'トリガー:アタックフェイズ開始時', re: /アタックフェイズ開始時/, keys: ['ON_ATTACK_PHASE_START'], src: 'eff' },
  { name: 'トリガー:ターン終了時に', re: /ターン終了時[、に]/, keys: ['ON_TURN_END', 'TURN_END', 'turn_end'], src: 'eff' },
  { name: 'トリガー:トラッシュに置かれたとき', re: /トラッシュに置かれたとき/, keys: ['ON_TRASH', 'ON_CHARM_TO_TRASH', 'ON_ENERGY_TO_TRASH', 'ON_EXCEED_COST'], src: 'eff' },
  { name: 'トリガー:場を離れたとき', re: /場を離れ(たとき|るとき)/, keys: ['ON_LEAVE_FIELD'], src: 'eff' },
  { name: 'トリガー:スペルを使用したとき', re: /スペルを使用した(とき|場合)/, keys: ['ON_SPELL_USE', 'SPELL'], src: 'eff' },
  { name: 'トリガー:アーツを使用したとき', re: /アーツを使用した(とき|場合)/, keys: ['ARTS_USE', 'ARTS_USED'], src: 'eff' },
  { name: 'トリガー:クラッシュされたとき', re: /クラッシュされたとき/, keys: ['LIFE_CRASHED', 'ON_LIFE_CRASH'], src: 'eff' },
  { name: 'トリガー:手札から捨てられたとき', re: /手札から捨てられたとき/, keys: ['ON_HAND_DISCARDED', 'ON_DISCARDED'], src: 'eff' },
  { name: 'トリガー:凍結されたとき', re: /凍結されたとき/, keys: ['ON_SIGNI_FROZEN'], src: 'eff' },
  { name: 'トリガー:グロウしたとき', re: /グロウした(とき|場合)/, keys: ['ON_LRIG_GROW', 'GROW'], src: 'eff' },
  { name: 'トリガー:エナチャージしたとき', re: /【?エナチャージ】?を?した?とき/, keys: ['ON_ENERGY_CHARGE'], src: 'eff' },
  { name: 'コスト:《ダウン》', re: /《ダウン》/, keys: ['down_self', 'lrigDown', 'fieldDown', '"down"', 'ダウン》'], src: 'eff' },
  { name: 'コスト:エクシードN', re: /《?エクシード[０-９\d]/, keys: ['exceed', 'エクシード'], src: 'eff' },
  { name: 'コスト:《コイン》', re: /《コイン/, keys: ['coin', 'COIN', 'コイン'], src: 'eff',
    // 「ベット―《コイン》…」プレフィックスの《コイン》はベット宣言コスト（機構:ベットで別途計測・
    // is_betting_this_effect は BattleScreen が raw text から立てる＝JSON cost には載らない設計）。
    // これを「コスト:《コイン》」で二重計測しない＝原文の《コイン》がベット―プレフィックスのみに現れ、
    // かつ JSON がベット（IS_BETTING/BET_*）を表現していれば covered とみなす（§3 Opusタスク6・betChoose 機構）。
    extraOk: (js, t) => !/《コイン/.test(t.replace(/ベット[―─](?:《[^》]+》)*/g, '')) && /BET/.test(js) },
  { name: 'コスト:手札を捨てる', re: /手札[かをら][^。：]{0,12}捨て(る|て)：/, keys: ['discard', 'handDiscard', 'Discard'], src: 'eff' },
  { name: 'コスト:エナからトラッシュ', re: /エナゾーンから[^。：]{0,18}(トラッシュに置く|支払う)：?/, keys: ['energyTrash', 'ENERGY'], src: 'eff' },
  { name: 'コスト:場からトラッシュ', re: /場から[^。：]{0,18}トラッシュに置く：/, keys: ['fieldTrash', 'trash_self', 'beat', 'fieldTo'], src: 'eff' },
  {
    name: 'ゾーン:エナゾーンに置く', re: /エナゾーンに置/, keys: ['ENERGY', 'nerg'],
    // 「（対戦相手の）シグニがバニッシュされる場合、エナゾーンに置かれる代わりにトラッシュに置く」は
    // 置換先ゾーンの語彙が `BANISH_REDIRECT` で正しく表現済み＝この destination 句だけを理由に高シグナルへ
    // 落ちるのは偽陽性（続き217／218b で族全数36効果を棚卸し済み。§3 (xliii)）。
    // ⚠ 無条件マスクにはしない＝redirect イディオム句を除いた残りに「エナゾーンに置」が残るならフラグ維持
    //   （本物の SEND_TO_ENERGY が別に併存するカードを隠さないため。lrigDown 較正と同じ安全弁）。
    //   subject 側のフィルタ脱落（正面/レベル/凍結など・(xliv) §6.3）はこの destination カテゴリの関心外で、
    //   各々の専用カテゴリ（正面／レベル閾値／凍結状態フィルタ）が引き続き露出する。
    //   BANISH_REDIRECT を持つ全22効果で除去後の残存0を機械確認済み。
    extraOk: (js, t) => js.includes('BANISH_REDIRECT')
      && !/エナゾーンに置/.test(t.replace(/エナゾーンに置かれる代わりに[^。]*?トラッシュに置[くか]/g, '')),
  },
  { name: 'ゾーン:デッキの一番下', re: /デッキの一番下/, keys: ['BOTTOM', 'bottom', 'Bottom'] },
  { name: 'ゾーン:ルリグデッキに戻す', re: /ルリグデッキに戻/, keys: ['LRIG_DECK', 'lrigDeck', 'RETURN_TO_LRIG'] },
  { name: '基本パワー変更', re: /基本パワーは/, keys: ['POWER_SET', 'basePower', 'SET_POWER'], src: 'eff' },
  // ---- 続き18 追加分・第3弾（構造/様相。マーカー構造・逆方向は下部の専用セクション）----
  { name: '「Nまで」上限選択', re: /[０-９\d](枚|体)まで/, keys: ['"upToCount":true', 'maxCount', 'upTo'] },
  { name: '公開し', re: /公開し/, keys: ['REVEAL', 'reveal'] },
  { name: '次の相手ターン終了時まで', re: /次の(対戦相手の)?ターン(の)?終了時まで/, keys: ['UNTIL_OPP_TURN_END', 'NEXT_OPP_TURN', 'NEXT_TURN'] },
  { name: '相手が選ぶ', re: /対戦相手[はが](自分の)?[^。]{0,25}選[びぶ]/, keys: ['opponentSelects', 'actingPlayerSelects', 'OPPONENT_SELECT'] },
  { name: '出現条件(レゾナ/クラフト)', re: /【出現条件】/, keys: ['forResonaCondition', 'playCondition', 'appearCondition', '出現条件'] },
  { name: 'ダメージを受けない', re: /ダメージを受けない/, keys: ['PREVENT', 'DAMAGE', 'damage'] },
  { name: '付着(チャーム/トラップ/アクセとして)', re: /(チャーム|トラップ|アクセ)として/, keys: ['CHARM', 'TRAP', 'ACCE', 'charm', 'trap', 'acce'] },
  { name: 'X変数コスト/効果', re: /[《【]無×Ｘ[》】]|Ｘ[はにをと]|Ｘ枚|Ｘ体|Ｘ000/, keys: ['ariable', '"X"', 'xCost', 'XCOST', '$ref'], src: 'eff' },
  { name: 'triggerScope(他シグニ起点トリガー)', re: /(あなたの|対戦相手の)(他の)?シグニ[０-９\d]体が(場に出た|バニッシュされた|アタックした)とき/, keys: ['triggerScope'], src: 'eff' },
  // ---- 続き18 追加分・第4弾（引用付与平坦化/置換/制限/機構）----
  { name: '引用能力付与の平坦化', re: /「[^」]*【(自|起|常|出)】[^」]*」を(得る|与え)/, keys: ['GRANT', 'grant', 'rawText', 'keyword'] },
  // PREVENT_NEXT_DAMAGE は「代わりにダメージを受けない」の正当な置換表現（続き25較正）
  // BANISH_REDIRECT は「エナゾーンに置かれる代わりにトラッシュに置かれる」の正当な置換表現（続き28較正・
  // 16枚中15枚が BANISH_REDIRECT で正エンコード済みの偽陽性だった＝キー漏れ）
  { name: '代わりに(置換)', re: /代わりに/, keys: ['CONDITIONAL', 'REPLACE', 'instead', 'IS_MY_TURN', 'PAID_ADDITIONAL', 'PREVENT_NEXT_DAMAGE', 'BANISH_REDIRECT'] },
  {
    name: '制限「できない」', re: /(場に出すことができない|使用できない|アタックできない|ガードできない|支払うことができない|選べない|引けない|出せない)/,
    keys: ['BLOCK', 'できない', 'PREVENT', 'NEGATE', 'COST_INCREASE', 'Block'],
    // 「この能力は〔条件〕の場合にしか使用/発動できない」＝使用条件（useCondition・eff.condition で表現）は
    // BLOCK/PREVENT ではなく condition で正しく表現される（extractUseCondition→parseUseCondition が LRIG_STORY／
    // SELF_POWER_GTE／HAS_CARD_IN_FIELD 等へ解析済み）。使用制限のみ（アタック/ガード/場に出せない等の効果制限を
    // 含まない）で JSON に condition があれば covered とみなす＝2026-07-09 続き52 較正（41枚の偽陽性・真バグ0を
    // 機械確認済み）。effect-restriction（アタックできない等）14枚は BLOCK 表現が要る別課題として高シグナル継続。
    extraOk: (js, t) => {
      const useRestrict = /しか(?:使用|発動)できない|しか(?:使用|発動)しない/.test(t);
      const otherBlock = /(場に出すことができない|アタックできない|ガードできない|支払うことができない|選べない|引けない|出せない)/.test(t);
      return useRestrict && !otherBlock && /"condition":\{/.test(js);
    },
  },
  { name: '見ないで(blind)', re: /見ないで/, keys: ['"blind"', 'blind'] },
  { name: '無作為に(blind)', re: /無作為に/, keys: ['"blind"', 'random', 'RANDOM'] },
  { name: 'シグニの下に置く', re: /の下に置/, keys: ['UNDER', 'under'] },
  { name: 'ゲームから除外', re: /ゲームから除外/, keys: ['EXILE', 'exile'] },
  { name: '遅延トリガー(このターン〜したとき)', re: /このターン、[^。]{0,40}したとき/, keys: ['DELAYED', 'delayed', 'this_turn', 'turn_end', 'ON_'] },
  { name: '機構:ライズ', re: /【ライズ】/, keys: ['RISE', 'ise'] },
  { name: '機構:クロス', re: /【クロス/, keys: ['cross', 'CROSS', 'crossOnly'] },
  { name: '機構:ハーモニー', re: /【ハーモニー/, keys: ['HARMONY', 'harmony'] },
  { name: '機構:ベット', re: /ベット―|【ベット/, keys: ['BET', 'bet', 'Betting'] },
  { name: '機構:チーム', re: /【チーム/, keys: ['TEAM', 'team', 'Team'] },
  { name: '機構:ゲート', re: /ゲート/, keys: ['GATE', 'Gate', 'gate'] },
  { name: '機構:ウィルス', re: /ウィルス/, keys: ['VIRUS', 'irus'] },
  { name: '機構:シード', re: /【シード|シードを/, keys: ['SEED', 'eed'] },
  { name: '機構:エクシード持ち', re: /エクシード/, keys: ['exceed', 'EXCEED'] },
  { name: '機構:アンコール', re: /アンコール/, keys: ['ENCORE', 'encore', 'coin'] },
  { name: '機構:ソウル', re: /【ソウル/, keys: ['SOUL', 'soul'] },
  { name: '機構:ドライブ', re: /【ドライブ|ドライブ状態/, keys: ['DRIVE', 'rive'] },
];

interface Corpus {
  /** 効果テキスト＋LBテキスト連結（従来の texts） */
  all: Map<string, string>;
  /** 効果テキストのみ（トリガー句・コスト節などLBに現れない照合用） */
  eff: Map<string, string>;
  /** LBテキストのみ */
  burst: Map<string, string>;
  /** （…）注釈を除去しない生テキスト＝逆方向（JSON→原文）照合用。
   *  例:【シャドウ（パワー5000以下のシグニ）】の 5000 は注釈由来の正当な値（続き19で4枚の偽陽性を較正） */
  rawAll: Map<string, string>;
  /** カード種別（アーツ/シグニ/…・col4） */
  ctype: Map<string, string>;
  /** アーツ使用タイミング列（col14） */
  ctiming: Map<string, string>;
}

function loadTexts(): Corpus {
  // 効果テキスト列（0-idx 18）・LBテキスト列（19以降）を保持し、注釈・キーワード説明の（…）を除去
  const all = new Map<string, string>(), eff = new Map<string, string>(), burst = new Map<string, string>();
  const rawAll = new Map<string, string>();
  const ctype = new Map<string, string>(), ctiming = new Map<string, string>();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('CardData_') && f.endsWith('.csv')).sort();
  for (const f of files) {
    for (const line of fs.readFileSync(path.join(DATA_DIR, f), 'utf8').split('\n')) {
      const cols = line.split(',');
      const id = cols[0];
      if (!id || !/^[A-Z]/.test(id) || id === 'CardNum') continue;
      const strip = (s: string) => s.replace(/（[^）]*）/g, '');
      const e = strip(cols[18] ?? '');
      const b = strip(cols.slice(19).join(','));
      eff.set(id, (eff.get(id) ?? '') + e);
      burst.set(id, (burst.get(id) ?? '') + b);
      // 旧実装（cols.slice(18).join(',')）と同一の連結を維持＝列境界のカンマを保存
      all.set(id, (all.get(id) ?? '') + e + ',' + b);
      rawAll.set(id, (rawAll.get(id) ?? '') + cols.slice(18).join(','));
      if (!ctype.has(id)) ctype.set(id, cols[3] ?? '');
      if (!ctiming.has(id)) ctiming.set(id, cols[13] ?? '');
    }
  }
  return { all, eff, burst, rawAll, ctype, ctiming };
}

function loadJson(): { str: Map<string, string>; obj: Map<string, unknown[]> } {
  const str = new Map<string, string>();
  const obj = new Map<string, unknown[]>();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.startsWith('effects_') && f.endsWith('.json')).sort();
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(DATA_DIR, f), 'utf8')) as Record<string, unknown[]>;
    for (const [id, effs] of Object.entries(j)) { str.set(id, JSON.stringify(effs)); obj.set(id, effs); }
  }
  return { str, obj };
}

// ---- 効果単位コーパス（2026-07-13 続き109・PLAN §4 全カード完成戦略①）----
// 従来はカード単位判定＝「同カード別効果に語彙があれば合格」＝効果Aの原文修飾句を効果BのJSON語彙で
// 救ってしまう粗い網だった（死角(b)。過去バッチで偽陽性トリアージ工程が毎回必要になっていた真因）。
// build:effects が出力する docs/_effect_srctext.json（effectId → 由来の原文ブロック）を使い、
// 「その効果の原文ブロック × その効果のJSON」だけで突き合わせる＝効果単位の厳密判定にする。
interface Unit {
  effectId: string;
  cardNum: string;
  /** この効果の由来ブロック原文（注釈（…）除去済み）。srctext に無い効果はカード全文へ fallback */
  text: string;
  /** この効果1件だけの JSON 文字列 */
  js: string;
  obj: Record<string, unknown>;
  isBurst: boolean;
  /** srctext 対応が取れず、カード全文で判定した効果（MANUAL 追加効果など＝従来と同じ粗い判定） */
  fallback: boolean;
}

function buildUnits(corpus: Corpus, jsonObj: Map<string, unknown[]>): Unit[] {
  const SRC_PATH = path.join(process.cwd(), 'docs', '_effect_srctext.json');
  if (!fs.existsSync(SRC_PATH)) {
    console.error('⚠ docs/_effect_srctext.json が無い。`npm run build:effects` を先に実行する（効果単位判定の対応表）。');
    process.exit(1);
  }
  const src = JSON.parse(fs.readFileSync(SRC_PATH, 'utf8')) as Record<string, string>;
  const strip = (s: string) => s.replace(/（[^）]*）/g, '');
  const units: Unit[] = [];
  for (const [cardNum, effs] of jsonObj) {
    if (!Array.isArray(effs)) continue;
    for (const e of effs as Array<Record<string, unknown>>) {
      const effectId = (e?.effectId as string) ?? `${cardNum}-?`;
      const raw = src[effectId];
      units.push({
        effectId,
        cardNum,
        text: strip(raw ?? corpus.all.get(cardNum) ?? ''),
        js: JSON.stringify(e),
        obj: e,
        isBurst: e?.effectType === 'LIFE_BURST' || /-BURST$/.test(effectId),
        fallback: raw === undefined,
      });
    }
  }
  return units;
}

const isStub = (js: string) => js.includes('STUB') || js.includes('MANUAL');

function main(): void {
  const corpus = loadTexts();
  const { str: jsonStr, obj: jsonObj } = loadJson();
  const units = buildUnits(corpus, jsonObj);
  const highAll = new Set<string>();
  const detail: string[] = [
    '# 語彙センサス明細（原文修飾句 × effects JSON 対応語彙・両方向）',
    '# 生成: npx tsx scripts/vocabCensus.ts（npm run census）',
    '# 判定は【効果単位】（effectId 粒度・2026-07-13 続き109）＝原文ブロック × その効果のJSON。',
    '# 高シグナル＝STUB/MANUALを含まない効果で対応語彙ゼロ＝フィルタ/条件/構造脱落（過剰効果）候補',
    '',
  ];
  const summary: string[] = [];

  const pushSection = (name: string, hits: number, missHigh: string[], missStub: string[]): void => {
    missHigh.sort();
    missStub.sort();
    summary.push(`${name} | ${hits} | ${missHigh.length} | ${missStub.length}`);
    detail.push(`## ${name} ［原文該当 ${hits}／高シグナル ${missHigh.length}／STUB・MANUAL格納 ${missStub.length}］`);
    detail.push('### 高シグナル（対応語彙なし）');
    detail.push(missHigh.join(' ') || '（なし）');
    detail.push('### STUB/MANUAL格納（要個別確認）');
    detail.push(missStub.join(' ') || '（なし）');
    detail.push('');
  };

  const missByPattern: Array<{ name: string; re: RegExp; pre?: (t: string) => string; src?: 'all' | 'eff'; ids: string[] }> = [];
  for (const { name, re, keys, pre, extraOk, src } of PATTERNS) {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const u of units) {
      // src:'eff'＝トリガー句/コスト節など LB 原文には現れない系＝ライフバースト効果は対象外
      if (src === 'eff' && u.isBurst) continue;
      const t = pre ? pre(u.text) : u.text;
      if (!re.test(t)) continue;
      hits++;
      if (keys.some(k => u.js.includes(k)) || (extraOk && extraOk(u.js, u.text))) continue;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(u.effectId); highAll.add(u.effectId); }
    }
    missByPattern.push({ name, re, pre, src, ids: missHigh.slice() });
    pushSection(name, hits, missHigh, missStub);
  }

  const zen2han = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

  // ---- 数値不一致（語彙有無では見えない別軸・2026-07-04 続き17）----
  // 原文のパワー系数値（4〜5桁）がカードJSONのどこにも現れない＝値の脱落/誤記の候補。
  // 《…》内のカード名由来の数字（例: タンポポ2434）は除外。抜き取り4/4が確定バグ
  // （WX06-028 第2対象丸ごと・WX13-030 パワー合計上限・WX09-017 基本パワー/×3000・WX11-053 基本パワー）。
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const u of units) {
      const nums = [...zen2han(u.text.replace(/《[^》]*》/g, '')).matchAll(/\d{4,5}/g)].map(m => m[0]);
      if (nums.length === 0) continue;
      hits++;
      const missing = [...new Set(nums.filter(n => !u.js.includes(n)))];
      if (missing.length === 0) continue;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(`${u.effectId}(${missing.join('/')})`); highAll.add(u.effectId); }
    }
    pushSection('数値不一致(4-5桁がJSONに不在)', hits, missHigh, missStub);
  }

  // ---- 小さい数（2〜5枚/体が JSON に独立数値として無い・続き18第2弾。粗い網＝脱落節の検出器）----
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const u of units) {
      const t = zen2han(u.text);
      const nums = [...new Set([...t.matchAll(/([2-5])(枚|体)/g)].map(m => m[1]))];
      if (!nums.length) continue;
      hits++;
      const missing = nums.filter(n => !new RegExp('[:\\[,]' + n + '[,}\\]]').test(u.js));
      if (!missing.length) continue;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(`${u.effectId}(${missing.join('/')})`); highAll.add(u.effectId); }
    }
    pushSection('小さい数(2-5枚/体)不在', hits, missHigh, missStub);
  }

  // ---- 逆方向数値（JSONの4-5桁が原文に無い＝幻覚パラメータ・続き18第4弾・続き19較正）----
  // 照合は（…）注釈込みの rawAll＝【シャドウ（パワー5000以下のシグニ）】等の注釈由来の値は正当（4枚の偽陽性を較正）。
  // ⚠照合先は「カード全体の生原文」のまま（効果ブロックへ絞らない）＝幻覚検出は保守的側に倒す。
  // srctext のブロックは注釈（…）が除去済みのものがあり、注釈由来の正当な数値（【シャドウ（パワー5000以下）】等）を
  // 誤検出してしまうため。帰属だけを effectId 単位にする。
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const u of units) {
      const nums = [...new Set([...u.js.matchAll(/(?<![\dA-Za-z-])(\d{4,5})(?!\d)/g)].map(m => m[1]))];
      if (!nums.length) continue;
      hits++;
      const t = zen2han(corpus.rawAll.get(u.cardNum) ?? '');
      const missing = nums.filter(n => !t.includes(n));
      if (!missing.length) continue;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(`${u.effectId}(${missing.join('/')})`); highAll.add(u.effectId); }
    }
    pushSection('逆:JSON数値が原文に無い(幻覚)', hits, missHigh, missStub);
  }

  // ---- キーワード能力語の不在（原文のキーワードがJSONに文字列として無い・続き18第2弾）----
  {
    const KWS = ['アサシン', 'ダブルクラッシュ', 'トリプルクラッシュ', 'ランサー', 'シャドウ', 'マルチエナ',
      'シュート', 'チアガール', 'バニッシュされない', 'ガードできない'];
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const u of units) {
      const found = KWS.filter(k => u.text.includes(k));
      if (!found.length) continue;
      hits++;
      const missing = found.filter(k => !u.js.includes(k));
      if (!missing.length) continue;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(`${u.effectId}(${missing.join('/')})`); highAll.add(u.effectId); }
    }
    pushSection('キーワード能力語の不在', hits, missHigh, missStub);
  }

  // ---- 逆方向 action センサス（JSONのaction型に対応する動詞が原文に無い＝幻覚/取り違え・続き18第4弾・続き19較正）----
  // STUB/MANUAL/rawText 含みの効果はスキップ（近似表現のため）。照合は（…）注釈込みの rawAll。
  // LIFE_CRASH は「ダメージを与える」の正当表現でもあるため ダメージ も許容。
  // 抜き取り確定バグ: WX16-021（置換ルールが即時LIFE_CRASH化）・PR-322（トラッシュ送りがBANISH化）。
  {
    const VERB: Array<[string, RegExp]> = [
      ['BANISH', /バニッシュ/],
      // FREEZE は「アップフェイズにアップしない」（WX19-077）の正当エンコードでもある
      // （CONTINUOUS FREEZE＝BattleScreen useEffect の calcContinuousSigniMutations が常時再凍結）
      ['FREEZE', /凍結|アップしない/],
      ['EXILE', /除外/],
      ['GAIN_COIN', /コイン/],
      ['LIFE_CRASH', /クラッシュ|ダメージ/],
      ['DRAW', /引/],
      ['SEARCH', /探し/],
    ];
    for (const [act, re] of VERB) {
      let hits = 0;
      const missHigh: string[] = [];
      for (const u of units) {
        const s = u.js;
        if (!s.includes('"' + act + '"') || isStub(s) || s.includes('rawText')) continue;
        const crashAllNoBurst = !/"type":"LIFE_CRASH"(?![^}]*"triggerBurst":false)/.test(s);
        hits++;
        const raw = corpus.rawAll.get(u.cardNum) ?? '';
        if (re.test(raw)) continue;
        // LIFE_CRASH triggerBurst:false は「ライフクロスをトラッシュに置く」の確立済み正表現（WX01-030 慣例・続き19較正）
        if (act === 'LIFE_CRASH' && crashAllNoBurst && /ライフクロス[^。]{0,25}(トラッシュに置|を捨て)/.test(raw)) continue;
        missHigh.push(u.effectId); highAll.add(u.effectId);
      }
      pushSection(`逆:JSONに${act}→原文に語なし`, hits, missHigh, []);
    }
  }

  // ---- 能力マーカー構造census（引用『「…」』と「【出】能力/効果」参照を除いた原文マーカー vs effectType・続き18第3弾）----
  // ⚠この節と次節（【起】個数）だけは**カード単位のまま**＝「原文マーカーの集合 vs カードの effectType 集合」という
  // 構造そのものがカード横断の問題（どのブロックが欠落したかは特定できない）。高シグナルは cardNum で計上する
  // （現状いずれも 0件＝計上単位の混在は起きていない。検出が出たら effectId 帰属を設計し直す）。
  {
    const stripQuote = (t: string) => t
      .replace(/『[^』]*』/g, '').replace(/「[^」]*」/g, '')
      // 「【起】能力のコストとして」「【出】【起】能力」等のマーカー参照（実能力ではない）を除去（続き20較正）
      .replace(/(?:【[出起自常]】)+(能力|効果)/g, '')
      // G150: 【常】表記の「（相手ターンの間、）このシグニがバニッシュされたとき」は parser が AUTO[ON_BANISH] に
      // 系統再分類する（WX11-063/064）＝CONTINUOUS 不在は正しい → 【常】マーカーとして数えない
      .replace(/【常】：(?=（?(対戦相手のターンの間、)?このシグニがバニッシュされたとき)/g, '');
    interface Eff { effectType?: string; timing?: string[] }
    const MARKERS: Array<[string, RegExp, (e: Eff) => boolean]> = [
      ['構造:【常】→CONTINUOUS無', /【常】/, e => e.effectType === 'CONTINUOUS'],
      ['構造:【起】→ACTIVATED無', /【起】/, e => e.effectType === 'ACTIVATED'],
      ['構造:【自】→AUTO無', /【自】/, e => e.effectType === 'AUTO' && !(e.timing ?? []).includes('ON_LIFE_BURST')],
      ['構造:【出】→ON_PLAY無', /【出】/, e => (e.timing ?? []).includes('ON_PLAY')],
    ];
    for (const [name, re, pred] of MARKERS) {
      let hits = 0;
      const missHigh: string[] = [];
      const missStub: string[] = [];
      for (const [id, t0] of corpus.eff) {
        let t1 = stripQuote(t0);
        const js = jsonStr.get(id) ?? '';
        // 【レイヤー】付与内のマーカー（《レイヤーアイコン》【自】等）は GRANT_FIELD_SIGNI_ABILITY に
        // 内包されトップレベル effectType に現れない（WX16-024/WX17-035/051/052）＝付与実装済みなら数えない
        if (js.includes('GRANT_FIELD_SIGNI_ABILITY')) t1 = t1.replace(/《レイヤーアイコン》【[^】]+】/g, '');
        if (!re.test(t1)) continue;
        hits++;
        const effs = jsonObj.get(id) as Eff[] | undefined;
        if (!Array.isArray(effs)) continue;
        if (effs.some(pred)) continue;
        if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
        else { missHigh.push(id); highAll.add(id); }
      }
      pushSection(name, hits, missHigh, missStub);
    }
    // 【起】マーカー個数 > ACTIVATED効果数（能力丸ごと欠落）
    {
      let hits = 0;
      const missHigh: string[] = [];
      const missStub: string[] = [];
      for (const [id, t0] of corpus.eff) {
        let t1 = stripQuote(t0);
        const js = jsonStr.get(id) ?? '';
        if (js.includes('GRANT_FIELD_SIGNI_ABILITY')) t1 = t1.replace(/《レイヤーアイコン》【[^】]+】/g, '');
        const n = (t1.match(/【起】/g) ?? []).length;
        if (!n) continue;
        hits++;
        const effs = jsonObj.get(id) as Eff[] | undefined;
        if (!Array.isArray(effs)) continue;
        const m = effs.filter(e => e.effectType === 'ACTIVATED').length;
        if (m >= n) continue;
        if (js.includes('STUB') || js.includes('MANUAL')) missStub.push(id);
        else { missHigh.push(`${id}(${n}vs${m})`); highAll.add(id); }
      }
      pushSection('構造:【起】個数>ACTIVATED個数', hits, missHigh, missStub);
    }
  }

  // ---- BURST内 IS_MY_TURN（続き19較正）----
  // engine 実挙動: IS_MY_TURN は実行時プレースホルダで常に真（execUtils evalCondition）＋
  // 「TRASH対象なし→残りSEQUENCEスキップ」ガードがあるため、**TRASH直前段の「そうした場合」は正動作**
  // （golden『そうした場合ガード』で固定）。フラグするのは前段が TRASH 以外（＝条件内容が
  // IS_MY_TURN に化けて常時真＝過剰、または then 内容の取り違え）のみ。WX05-042/WX12-020/WX21-026 是正済み。
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    interface Step { type?: string; condition?: { type?: string }; steps?: Step[] }
    const hasBadImt = (o: unknown): boolean => {
      if (Array.isArray(o)) return o.some(hasBadImt);
      if (!o || typeof o !== 'object') return false;
      const node = o as Step & Record<string, unknown>;
      if (Array.isArray(node.steps)) {
        for (let i = 0; i < node.steps.length; i++) {
          const st = node.steps[i];
          if (st?.type === 'CONDITIONAL' && st.condition?.type === 'IS_MY_TURN'
            && node.steps[i - 1]?.type !== 'TRASH') return true;
        }
      }
      return Object.values(node).some(hasBadImt);
    };
    for (const u of units) {
      if (!u.isBurst || !u.js.includes('IS_MY_TURN')) continue;
      if (!hasBadImt((u.obj as { action?: unknown }).action)) continue;
      hits++;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(u.effectId); highAll.add(u.effectId); }
    }
    pushSection('BURST内IS_MY_TURN(TRASH前段以外=条件化け)', hits, missHigh, missStub);
  }

  // ---- IS_MY_TURN 誤変換疑い（原文に「そうした場合」等の該当句が無いのに IS_MY_TURN が居る・続き18第2弾）----
  // parser のフォールバック（effectParser.ts の「該当しない場合は IS_MY_TURN」）で実条件が消えた候補。
  // WX05-013 で確認（「8種類以上公開された場合」→無条件全バウンス）。
  {
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const u of units) {
      if (!u.js.includes('IS_MY_TURN')) continue;
      hits++;
      if (/そう(した|しなかった)場合|支払わなかった場合|捨てなかった場合|しなければ|代わりに|あなたのターンの間|しない場合/.test(u.text)) continue;
      if (isStub(u.js)) missStub.push(u.effectId);
      else { missHigh.push(u.effectId); highAll.add(u.effectId); }
    }
    pushSection('IS_MY_TURN誤変換疑い(該当句なし)', hits, missHigh, missStub);
  }

  // ---- BURST↔E1 誤配置（LB原文の動詞がBURST効果に無く非BURST効果にだけある・続き18第4弾。WD21-011で確認）----
  {
    const VB: Array<[RegExp, string]> = [[/引/, 'DRAW'], [/バニッシュ/, 'BANISH'], [/エナ/, 'ENERGY'], [/凍結/, 'FREEZE'], [/クラッシュ/, 'LIFE_CRASH']];
    let hits = 0;
    const missHigh: string[] = [];
    const missStub: string[] = [];
    for (const [id, bt] of corpus.burst) {
      if (!/：/.test(bt)) continue;
      const effs = jsonObj.get(id) as Array<{ effectType?: string }> | undefined;
      if (!Array.isArray(effs)) continue;
      const burstEffs = effs.filter(e => e.effectType === 'LIFE_BURST');
      const otherEffs = effs.filter(e => e.effectType !== 'LIFE_BURST');
      if (!burstEffs.length) continue;
      hits++;
      const bs = JSON.stringify(burstEffs), os = JSON.stringify(otherEffs);
      if (bs.includes('STUB') || bs.includes('MANUAL')) { missStub.push(id); continue; }
      for (const [re, act] of VB) {
        if (re.test(bt) && !bs.includes(act) && os.includes(act)) { missHigh.push(`${id}(${act})`); highAll.add(`${id}-BURST`); break; }
      }
    }
    pushSection('BURST動詞がBURST効果に無くE側にある', hits, missHigh, missStub);
  }

  // ---- アーツ使用タイミング列 vs timing 配列（両方向・続き18第4弾。682枚中5枚のみ＝ほぼ健全の維持ガード）----
  {
    const MAPPING: Array<[string, string[]]> = [
      ['メインフェイズ', ['MAIN']],
      ['アタックフェイズ', ['ATTACK', 'ATTACK_ARTS']],
      ['スペルカットイン', ['SPELL_CUTIN']],
    ];
    let hits = 0;
    const under: string[] = [];
    const over: string[] = [];
    const missStub: string[] = [];
    for (const [id, ty] of corpus.ctype) {
      if (ty !== 'アーツ') continue;
      const effs = jsonObj.get(id) as Array<{ timing?: string[] }> | undefined;
      if (!Array.isArray(effs)) continue;
      hits++;
      const js = jsonStr.get(id) ?? '';
      const stub = js.includes('STUB') || js.includes('MANUAL');
      const col = corpus.ctiming.get(id) ?? '';
      const timings = new Set<string>();
      for (const e of effs) for (const tm of (e.timing ?? [])) timings.add(tm);
      for (const [jp, ens] of MAPPING) {
        const colHas = col.includes(jp);
        const jsonHas = ens.some(e => timings.has(e));
        if (colHas && !jsonHas) { if (stub) missStub.push(`${id}(-${jp})`); else { under.push(`${id}(-${jp})`); highAll.add(`${id}-E1`); } }
        if (!colHas && jsonHas) { if (stub) missStub.push(`${id}(+${jp})`); else { over.push(`${id}(+${jp})`); highAll.add(`${id}-E1`); } }
      }
    }
    pushSection('アーツ:列タイミング→JSON欠(使えない側)', hits, under, missStub);
    pushSection('アーツ:JSON過剰タイミング(使えすぎ側)', hits, over, []);
  }

  detail.push(`# 高シグナル欠落 効果総数（重複除外・effectId単位）: ${highAll.size}（ベースライン ${BASELINE_HIGH}）`);
  fs.writeFileSync(OUT_PATH, detail.join('\n') + '\n', 'utf8');

  if (CLUSTERS_MODE) writeClusters(units, missByPattern);

  const fbCount = units.filter(u => u.fallback).length;
  console.log('パターン | 原文該当 | 高シグナル欠落 | STUB・MANUAL格納(要確認)');
  for (const row of summary) console.log(row);
  console.log(`\n効果単位判定: ${units.length}効果（うち原文ブロック対応なし＝カード全文fallback ${fbCount}件）`);
  console.log(`高シグナル欠落 効果総数(重複除外): ${highAll.size} ／ ベースライン: ${BASELINE_HIGH}`);
  console.log(`明細: docs/_vocab_census.txt`);

  if (highAll.size > BASELINE_HIGH) {
    console.error(`\n⚠回帰: 高シグナルがベースライン ${BASELINE_HIGH} を超過（${highAll.size}）。`
      + ' JSON手パッチ時はフィルタ語彙もセットで入れる（or 本ファイルのキー表・ベースラインを実数更新）。');
    process.exit(1);
  }
  if (highAll.size < BASELINE_HIGH) {
    console.log(`\n改善: ${BASELINE_HIGH} → ${highAll.size}。本ファイルの BASELINE_HIGH と PLAN.md §恒久指標を実数更新してよい。`);
  }
}

// ---- --clusters: 高シグナルの文型テンプレート・クラスタ表（2026-07-04 続き23）----
// 消化の作業単位を「カード」から「文型」へ圧縮する入口。パターンごとに高シグナルIDの
// マッチ節（条件節は「〜場合、」節・他は文単位）を抽出し、数値→N・《名前》→《X》・
// ＜クラス＞→＜C＞・「引用」→「Q」・色→色 に正規化して同型テンプレートに束ねる。
// 実測（続き23・条件節773枚）: 443テンプレ・上位30で304枚（40%）・上位80で459枚（60%）。
// カスタム節（数値不一致/小さい数/逆方向/構造）は節アンカーが無い粗い網のため対象外。
// ⚠2026-07-13 続き109: ids は effectId（`WX01-001-E1` 等）＝節抽出も効果ブロック原文から行う。
// 採用（heldReview）はカード単位なので、バッチを組むときは effectId から末尾の -E\d+/-BURST 等を落として CardNum にする。
function writeClusters(
  units: Unit[],
  missByPattern: Array<{ name: string; re: RegExp; pre?: (t: string) => string; src?: 'all' | 'eff'; ids: string[] }>,
): void {
  const textOf = new Map(units.map(u => [u.effectId, u.text]));
  const norm = (s: string) => s
    .replace(/《[^》]*》/g, '《X》')
    .replace(/＜[^＞]*＞/g, '＜C＞')
    .replace(/「[^」]*」/g, '「Q」')
    .replace(/[０-９\d]+/g, 'N')
    .replace(/[白赤青緑黒]/g, '色');
  interface Row { pattern: string; tpl: string; ids: Set<string> }
  const allRows: Row[] = [];
  const out: string[] = [
    '# 語彙センサス文型クラスタ表（高シグナルのマッチ節をテンプレート正規化・件数順）',
    '# 生成: npx tsx scripts/vocabCensus.ts --clusters（npm run census:clusters）',
    '# 行形式: 効果数<TAB>テンプレート<TAB>effectId…（テンプレ単位でparser規則→build:effects収穫のバッチを組む）',
    '# ⚠ID は effectId（2026-07-13 続き109で効果単位化）。heldReview の採用はカード単位なので、末尾の',
    '#   -E1/-BURST/-LAYER 等を落として CardNum に変換してからバッチを組む。',
    '',
  ];
  for (const { name, re, pre, ids } of missByPattern) {
    if (!ids.length) continue;
    const clusters = new Map<string, Set<string>>();
    const add = (tpl: string, id: string): void => {
      if (!clusters.has(tpl)) clusters.set(tpl, new Set());
      clusters.get(tpl)!.add(id);
    };
    for (const id of ids) {
      let t = textOf.get(id) ?? '';
      if (pre) t = pre(t);
      const clauses: string[] = [];
      if (name.startsWith('条件節')) {
        // 条件節は「〜場合、」の前置節だけを切り出す（読点で刈って前文の残りを落とす）
        for (const m of t.matchAll(/([^。「」『』]{0,60}?場合)[、,]/g)) {
          clauses.push(m[1].split(/[、,]/).pop() ?? m[1]);
        }
      } else {
        const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g');
        for (const m of t.matchAll(g)) {
          // マッチ位置を含む文（。区切り・前後50字まで）を節として採用
          const idx = m.index ?? 0;
          const start = Math.max(t.lastIndexOf('。', idx) + 1, idx - 50);
          let end = t.indexOf('。', idx + m[0].length);
          if (end < 0) end = t.length;
          end = Math.min(end, idx + m[0].length + 50);
          clauses.push(t.slice(start, end));
        }
      }
      if (!clauses.length) { add('（節抽出不可）', id); continue; }
      for (const c of clauses) add(norm(c), id);
    }
    const sorted = [...clusters.entries()].sort((a, b) => b[1].size - a[1].size);
    out.push(`## ${name}（高シグナル ${ids.length}枚 → テンプレ ${clusters.size}）`);
    for (const [tpl, set] of sorted) {
      out.push(`${set.size}\t${tpl}\t${[...set].sort().join(' ')}`);
      allRows.push({ pattern: name, tpl, ids: set });
    }
    out.push('');
  }
  fs.writeFileSync(CLUSTERS_OUT, out.join('\n') + '\n', 'utf8');
  allRows.sort((a, b) => b.ids.size - a.ids.size);
  console.log('\n=== 文型クラスタ 上位30（全パターン横断・枚数順） ===');
  for (const r of allRows.slice(0, 30)) console.log(String(r.ids.size).padStart(4), `[${r.pattern}]`, r.tpl);
  console.log(`\nクラスタ明細: docs/_census_clusters.txt（テンプレ総数 ${allRows.length}）`);
}

main();
