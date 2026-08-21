# 意味照合監査 clean群 round1 — 段1 第5バッチ triage

対象は F001〜F020 の40 findings（40カード）。finding 単位で live JSON・原文・当該 action の consumer を照合した。実装はしていない。`parseStatus` は40件すべて `AUTO` であり、`MANUAL` / `PARTIAL` の `syncManualLive.ts` 経路に該当するものはない。

## 1. サマリ

| cluster | quote | 真バグ | 偽陽性 | 機構待ち | 要追調査 |
|---|---|---:|---:|---:|---:|
| F001 | このシグニは対戦相手の | 2 | 0 | 2 | 0 |
| F002 | このシグニを場から手札に | 2 | 0 | 0 | 0 |
| F003 | このルリグは能力を失う | 2 | 0 | 0 | 0 |
| F004 | シグニを１枚まで | 2 | 0 | 2 | 0 |
| F005 | シグニを３体まで | 2 | 0 | 2 | 0 |
| F006 | すべてのカードをデッキに加えてシャッフル | 2 | 0 | 0 | 0 |
| F007 | センタールリグ | 0 | 2 | 0 | 0 |
| F008 | センタールリグ１体とシグニ１体 | 2 | 0 | 0 | 0 |
| F009 | センタールリグとすべてのシグニ | 2 | 0 | 0 | 0 |
| F010 | それのパワーを－10000 | 2 | 0 | 0 | 0 |
| F011 | それのパワーを＋3000 | 2 | 0 | 0 | 0 |
| F012 | それは【アサシン】と | 2 | 0 | 0 | 0 |
| F013 | それをトラッシュから場に出す | 2 | 0 | 2 | 0 |
| F014 | それをトラッシュに置き | 2 | 0 | 0 | 0 |
| F015 | ダメージを受けたとき | 2 | 0 | 0 | 0 |
| F016 | デッキの下からカードを２枚 | 2 | 0 | 0 | 0 |
| F017 | デッキをシャッフルし、そのカードを | 0 | 2 | 0 | 0 |
| F018 | トラッシュから | 2 | 0 | 0 | 0 |
| F019 | パワー10000以下のシグニ１体 | 2 | 0 | 0 | 0 |
| F020 | パワー8000以下のシグニ | 2 | 0 | 0 | 0 |
| **合計** |  | **36** | **4** | **8** | **0** |

注: 機構待ち8件はすべて真バグとの重複計上。

## 2. finding 全40件の分類

| effectId | parseStatus | 分類 | 根拠（live JSON と原文の個別照合） | consumer | 原文の該当句 |
|---|---|---|---|---|---|
| WXK03-032-CB-E1 | AUTO | 真バグ＋機構待ち | live は `SEQUENCE` 第2段が `GRANT_PROTECTION target={SIGNI,self,count:1}, from:['シグニ']`。原文の「このシグニ」なのに host 固定情報がなく、さらに常在耐性抽出は一般の SEQUENCE 内保護を除外するため現状は不発する。 | `collectEffectImmuneSigni` の `extractGrantProtections` (`effectEngine.ts:5272-5298`)。この形を通す配線無し＝機構待ち | このシグニは対戦相手のシグニの効果を受けない |
| WXK03-041-CB-E1 | AUTO | 真バグ＋機構待ち | live の保護段は `from:['アーツ'], sourceOwner:'opponent'` だが `target.filter` が無い。原文は《仁の遊》がある間の当該 host 限定で、SEQUENCE 抽出 whitelist (`subjectOwner/self + excludeSelf + LB無しシグニ`) にも一致しない。 | `collectEffectImmuneSigni` (`effectEngine.ts:5275-5286,5294-5334`)。複合常在の host 保護を読む経路無し＝機構待ち | このシグニは対戦相手のアーツの効果を受けない |
| WX20-066-E1 | AUTO | 真バグ | live は `BOUNCE.target.owner:'opponent'` と `filter.thisCardOnly:true` の矛盾した組で、相手候補集合に自分の source は入らず空振りする。原文は発生源自身を任意に手札へ戻す。 | `execBounce` (`effectExecutor.ts:1233-1283`, `thisCardOnly` を候補へ固定) | このシグニを場から手札に戻してもよい |
| WXDi-P08-053-E1 | AUTO | 真バグ | live の先頭はレベル2以下の相手 SIGNI に `BOUNCE owner:'opponent', thisCardOnly:true, upToCount:true` を同居させている。原文では相手シグニは先に対象化し、戻すのは能力元の「このシグニ」。 | `execBounce` (`effectExecutor.ts:1244-1283`); 後段固定は `GRANT_KEYWORD.targetsStored` (`:3589-3591`) | 対戦相手のレベル２以下のシグニを１体まで対象とし、このシグニを場から手札に戻してもよい |
| WXDi-D08-004-E1 | AUTO | 真バグ | live の did-it 後段は `UP target={LRIG,self,1}` に続き `REMOVE_ABILITIES target={SIGNI,self,1}`。原文はアップした同じ「このルリグ」が能力を失うため、対象種別が SIGNI ではない。 | `execRemoveAbilities` (`effectExecutor.ts:6598-6610`, `LRIG` はセンタートップへ分岐) | このルリグをアップし、ターン終了時まで、このルリグは能力を失う |
| WXDi-D09-H07-E1 | AUTO | 真バグ | live の付与内 sub-effect は `ON_ATTACK_LRIG` 後に `UP LRIG self` と `REMOVE_ABILITIES SIGNI self` を並べる。引用能力の主語はアタックした当該ルリグであり、シグニ選択は原文にない。 | `execRemoveAbilities` (`effectExecutor.ts:6566-6610`); LRIG 自動対象を既に消費可能 | このルリグをアップし、ターン終了時まで、このルリグは能力を失う |
| WX25-P2-041-E1 | AUTO | 真バグ＋機構待ち | live の `LOOK_PICK_CHAIN.stages` は遊具の hand/field とも `pickCount:1` だけ。原文は各々「1枚まで」だが pending SEARCH に `optional` が渡らず、UI は選択数 `>= maxPick` を要求する。 | `execLookPickChain` (`effectExecutor.ts:5695-5709`) と `EffectInteractionModal.tsx:220-229`。stage の上限選択を pending へ渡す配線無し＝機構待ち | ＜遊具＞のシグニを１枚まで公開し手札に加え、＜遊具＞のシグニを１枚まで場に出し |
| WX25-P3-045-E1 | AUTO | 真バグ＋機構待ち | live は毒牙2段を `pickCount:1` としつつ stage に任意性を表すキーが存在しない。原文は手札行きも場出しも0枚を許すのに、SEARCH 決定条件は `inter.optional` 未設定なら1枚必須。 | `execLookPickChain` (`effectExecutor.ts:5687-5709`)／検索UI (`EffectInteractionModal.tsx:223-233`)。stage optional consumer 不在＝機構待ち | ＜毒牙＞のシグニを１枚まで公開し手札に加え、＜毒牙＞のシグニを１枚まで場に出し |
| SPDi44-16-E2 | AUTO | 真バグ＋機構待ち | live cost は `fieldTrash:{count:3,filter:{cardType:'シグニ'}}` 固定。原文のプライマルは0〜3体で、支払い判定が `selectedZones.length === cost.count` のため3体未満を選べない。 | `fieldTrashSelectionSatisfied` (`fieldLimit.ts:36-47`) と各 cost modal。`fieldTrash` に upTo を読む consumer 無し＝機構待ち | プライマル　シグニを３体まで場からトラッシュに置く |
| WX25-P1-030-E2 | AUTO | 真バグ＋機構待ち | live は `cost.fieldTrash.count:3`、後段だけ `last_processed_count` を参照する。原文は支払った任意枚数ぶん蘇生するが、固定3体支払いしか完了条件を満たさない。 | `execUtils.ts:350-357,475-481`／`fieldLimit.ts:45-47`。可変 fieldTrash cost の読取無し＝機構待ち | プライマル　シグニを３体まで場からトラッシュに置く |
| WXDi-CP01-021-E1 | AUTO | 真バグ | live action は `TRASH DECK_CARD self count:16` 単独。原文で先行する自分のトラッシュ全量のデッキ移送とシャッフルが丸ごと無い。 | `execTransferToDeck` (`effectExecutor.ts:5070`付近, `TRASH_CARD/count:'ALL'`) と `execShuffleDeck` | あなたのトラッシュからすべてのカードをデッキに加えてシャッフルし |
| WXDi-P12-003-E1 | AUTO | 真バグ | live `SEQUENCE` は `ENERGY_CHARGE_FROM_DECK count:2` から始まり、原文冒頭のトラッシュ全カード回収が欠落。結果として墓地を残したままエナチャージする。 | `execTransferToDeck` (`effectExecutor.ts:5092-5183`) の `TRASH_CARD/count:'ALL'` と `SHUFFLE_DECK` | あなたのトラッシュにあるすべてのカードをデッキに加えてシャッフルし、【エナチャージ２】をする |
| WX07-023-BURST | AUTO | 偽陽性 | live 選択肢①は `DOWN target={type:'LRIG',owner:'opponent',count:1}` で filter 無し。`execDown` の LRIG 分岐は `field.lrig.at(-1)` だけを直接ダウンし、アシストを候補化しない。 | `execDown` (`effectExecutor.ts:3123-3215`, センタールリグトップ直結) | 対戦相手のセンタールリグが１体を対象とし、それをダウンする |
| WX21-027-BURST | AUTO | 偽陽性 | live は `GRANT_KEYWORD target={LRIG,opponent,1}`。executor は LRIG のとき `state.field.lrig.at(-1)` のみを候補にし、選択UIなしで適用するためセンター限定は既に成立する。 | `execGrantKeyword` (`effectExecutor.ts:3563-3567,3625-3626`) | 対戦相手のセンタールリグは「【常】：アタックできない。」を得る |
| WX06-002-E1 | AUTO | 真バグ | 条件成立側 live は `GRANT_KEYWORD target={CENTER_LRIG_OR_SIGNI,opponent,count:2}` という混合集合2枚。原文はセンター1体＋シグニ1体であり、現構造はシグニ2体も選べる。 | `execGrantKeyword` (`effectExecutor.ts:3568-3573,3633-3637`); 既存 `SEQUENCE` で LRIG 1＋SIGNI 1へ分離可能 | 対戦相手のセンタールリグ１体とシグニ１体を対象とし |
| WXK01-003-E3 | AUTO | 真バグ | 遅延 action 内の live target は `CENTER_LRIG_OR_SIGNI count:2`。センタールリグがいても種類別内訳を拘束せず同じ candidates から2枚選ぶため、原文の各1体を保証しない。 | `execGrantKeyword` (`effectExecutor.ts:3568-3573`); `DELAY_TO_NEXT_OPP_ATTACK_PHASE` の内側を LRIG/SIGNI 2段にできる | 対戦相手のセンタールリグ１体とシグニ１体を対象とし |
| WX19-022-BURST | AUTO | 真バグ | live は DRAW 後に `REMOVE_ABILITIES target={SIGNI,opponent,count:'ALL'}` のみ。原文は相手センタールリグも同時に失わせ、かつ「新たに得られない」まで含む。 | `execRemoveAbilities` (`effectExecutor.ts:6598-6610`); LRIG と SIGNI の既存対象分岐を SEQUENCE で使用可能 | 対戦相手のセンタールリグとすべてのシグニは能力を失い、新たに得られない |
| WXDi-P10-005-E3 | AUTO | 真バグ | live は `REMOVE_ABILITIES SIGNI opponent ALL until:UNTIL_OPP_TURN_END` だけで、原文の相手センタールリグが対象集合から落ちている。注記どおり後発カード非適用なので単純な場レベル全体化とも異なる。 | `execRemoveAbilities` (`effectExecutor.ts:6533-6564,6604-6610`); LRIG 用 action を並置可能 | 次の対戦相手のターン終了時まで、対戦相手のセンタールリグとすべてのシグニは能力を失う |
| WXDi-P01-044-E2 | AUTO | 真バグ | live は最初に相手へ `delta:-5000`、trash20条件内で別の `owner:'any' delta:-10000` を追加する。原文の「代わりに」は同一対象へ合計ではなく－10000であり、現状は別対象選択か同一なら－15000になる。 | `execPowerModify` (`effectExecutor.ts:1618-1674`); `targetsLastProcessed` を読む `:1656-1664` と CONDITIONAL 分岐再構成 | あなたのトラッシュにカードが２０枚以上ある場合、代わりにターン終了時まで、それのパワーを－10000する |
| WXDi-P08-081-E1 | AUTO | 真バグ | live 選択肢①は先頭が `TRASH target={SIGNI,opponent,story:'悪魔'}` で、原文の「相手を対象＋自分の悪魔をコスト」が逆転している。後段－10000も `targetsStored` 無しなので相手を再選択する。 | `SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS`、`execPowerModify.targetsStored` (`effectExecutor.ts:1666-1669`)、既存 did-it ゲート | 対戦相手のシグニ１体を対象とし、あなたの＜悪魔＞のシグニ１体を場からトラッシュに置く。そうした場合…それのパワーを－10000する |
| WXDi-P08-074-E1 | AUTO | 真バグ | live 選択肢②は `ADD_TO_FIELD ENERGY_CARD` 後に `POWER_MODIFY owner:'any',count:1,delta:3000`。場に出したカードは `lastProcessedCards` に残るが後段に `targetsLastProcessed:true` がなく、無関係な両軍シグニを選べる。 | `execPowerModify` (`effectExecutor.ts:1656-1664`); `execAddToField` は処理札を記録 (`:2638,2674`) | それを場に出す。次の対戦相手のターン終了時まで、それのパワーを＋3000する |
| WXDi-P16-094-E1 | AUTO | 真バグ | live 選択肢①の蘇生後バフは `target.owner:'any'` で参照フラグなし。原文の「それ」は直前にトラッシュから出した【チーム】シグニで、別陣営の1体へ＋3000する余地はない。 | `execPowerModify.targetsLastProcessed` (`effectExecutor.ts:1656-1664`)；蘇生結果は `execAddToField` が引継ぐ | トラッシュから【チーム】を持つシグニ１枚を対象とし、それを場に出す。…それのパワーを＋3000する |
| WXDi-P12-029-E1 | AUTO | 真バグ | live は `GRANT_KEYWORD` を2段に分け、各段が `target={SIGNI,self,1}` で同一対象参照なし。能力元はルリグなので source 自動適用も働かず、アサシンとダブルクラッシュを別々の自軍シグニへ付けられる。 | `execGrantKeyword.targetsLastProcessed` (`effectExecutor.ts:3513-3529`) または `targetsStored` (`:3589-3591,3627`) | あなたのシグニ１体を対象とし…それは【アサシン】と【ダブルクラッシュ】を得る |
| WXK07-012-E1 | AUTO | 真バグ | live 選択肢②は原子SIGNIへの二つの `GRANT_KEYWORD` がそれぞれ独立 `count:1`。第1段の選択結果を第2段が参照しないため、原文の「それ」が分裂する。 | `execGrantKeyword` の `targetsLastProcessed` (`effectExecutor.ts:3513-3529`) | あなたの＜原子＞のシグニ１体を対象とし…それは【アサシン】と【ダブルクラッシュ】を得る |
| WXK03-040-E1 | AUTO | 真バグ＋機構待ち | live は `MILL fromBottom:true` 後に level1判定するが、成功時の `ADD_TO_FIELD source={TRASH_CARD,self,count:1,filter:シグニ}` は直前札へ固定されずトラッシュ全体を候補化する。 | `execAddToField` (`effectExecutor.ts:2855-2866`) は `targetsLastProcessed` を読まない。直前処理札限定の配線無し＝機構待ち | それがレベル１のシグニの場合、それをトラッシュから場に出す |
| WXK07-106-E1 | AUTO | 真バグ＋機構待ち | live の奇数枝は `LAST_PROCESSED_MATCHES` 後に汎用 `TRASH_CARD` 1枚を場出しするだけ。判定対象はこの反復で落とした1枚だが、蘇生候補に `lastProcessedCards` 制約がない。 | `execAddToField` (`effectExecutor.ts:2853-2866,2945-2951`)。ADD_TO_FIELD 用の last-processed 固定 consumer 無し＝機構待ち | この方法でトラッシュに置かれたカードがレベルが奇数のシグニの場合、それをトラッシュから場に出す |
| WX06-001-E3 | AUTO | 真バグ | live は天使7枚をデッキ下へ戻し did-it 後に `SHUFFLE_DECK` するだけで、先に対象とした相手シグニをトラッシュへ置く action 自体が無い。 | `execTrash` (`effectExecutor.ts:1734-1843`) は `targetsStored` を消費可能 (`:1779-1780`) | そうした場合、それをトラッシュに置き、デッキをシャッフルする |
| WXK06-030-E1 | AUTO | 真バグ | live 先頭は `TRASH target={SIGNI,opponent,story:'龍獣'}` で相手対象を即トラッシュにし、原文の「デッキ上から龍獣8枚出るまでミル」を表していない。条件も `LAST_PROCESSED_MATCHES minCount:8` の後は DRAW だけで、対象移送順が逆。 | `execTrash` (`effectExecutor.ts:1734-2009`) と既存 `MILL_UNTIL` 系 action／stored target 経路 | ＜龍獣＞のシグニを８枚トラッシュに置いた場合、それをトラッシュに置き、カードを１枚引く |
| WX18-002-E3 | AUTO | 真バグ | live 起動 action は即時 `LIFE_CRASH owner:'opponent',count:1`。原文は起動後、このターン中に相手がダメージを受けたイベントまで待つ遅延誘発で、発動時点ではクラッシュしない。 | `execInstallDelayedTrigger` (`effectExecutor.ts:2174-2186`) と `ON_OPP_LIFE_CRASHED` delayed collector (`BattleScreen.tsx:11989`付近) | このターン、対戦相手がダメージを受けたとき、対戦相手のライフクロス１枚をクラッシュする |
| WXEX2-27-E3 | AUTO | 真バグ | live は起動直後に `TRASH DECK_CARD owner:'opponent',count:20` を実行する。原文は同ターン後続の対戦相手ダメージを発火条件にするため、ダメージが無いゲームでも20枚落とす現状は過剰。 | `INSTALL_DELAYED_TRIGGER` (`types/effects.ts:1501-1523`)；`ON_OPP_LIFE_CRASHED` の watcher 収集 (`BattleScreen.tsx:11989-12007`) | このターン、対戦相手がダメージを受けたとき、対戦相手はデッキの上からカードを２０枚トラッシュに置く |
| WDK05-R14-E2 | AUTO | 真バグ | live は `TRASH target={DECK_CARD,self,count:2}` で、`execTrash` のこの分岐は `deck.slice(0,count)` を使う。原文はデッキ下2枚なので上端と下端が逆。 | `execTrash` (`effectExecutor.ts:2000-2009`)；下端処理は `execMill(fromBottom:true)` (`:6813-6826`) | あなたのデッキの下からカードを２枚トラッシュに置く |
| WXK03-068-E1 | AUTO | 真バグ | live 先頭の `TRASH DECK_CARD count:2` に `fromBottom` 相当がなく、後続レベル合計5はデッキトップ2枚で計算される。原文が参照するのはボトムから置いた2枚。 | `execTrash` の deck 分岐 (`effectExecutor.ts:2000-2009`); `MILL.fromBottom` consumer (`:6813-6826`) | このシグニがアタックしたとき、あなたのデッキの下からカードを２枚トラッシュに置く |
| WD23-013-A-E1 | AUTO | 偽陽性 | live SEARCH は `then=TRANSFER_TO_DECK position:'top'` と `afterSearch=SHUFFLE_DECK`。通常木順と逆に見えるが、resume はこの組を特別検出し afterAction を先に実行してから picked instanceId をトップへ確定する。 | `resumeSearch` (`effectExecutor.ts:8462-8489`) | デッキからカード１枚を探してデッキをシャッフルし、そのカードをデッキの一番上に置く |
| WD23-024-E-E1 | AUTO | 偽陽性 | live も `SEARCH.then` がトップ配置、`afterSearch` がシャッフルだが、executor の `isDeckPlacementFromSearch` 分岐が選択札を残してシャッフル後に `applyDirectAction` するため実行順は原文どおり。 | `resumeSearch` (`effectExecutor.ts:8466-8488`) | その後、デッキをシャッフルし、そのカードをデッキの一番上に置く |
| WX24-P1-015-E2 | AUTO | 真バグ | live は `ADD_TO_LIFE owner:'self',count:1,fromTop:true`。原文の対象領域は自分のトラッシュ、条件は `hasLifeBurst:false` であり、現在はデッキ上を無条件に加える別効果。 | `execAddToLife` (`effectExecutor.ts:2992-2996`) は `fromTrash` を読むが、現型では trash filter が無い点は実装時要確認 | あなたのトラッシュから【ライフバースト】を持たないカード１枚を対象とし、それをライフクロスに加える |
| WXDi-P06-030-E2 | AUTO | 真バグ | live の有色＋無色3コスト【出】は `ADD_TO_LIFE fromTop:true` へ誤変換され、同カードの別【出】「デッキをシャッフルし一番上」を複製している。原文はLB無しのトラッシュカード1枚。 | `execAddToLife.fromTrash` (`effectExecutor.ts:2992-2996,10010-10015`); filter を通すには consumer 拡張要否を段2で確認 | あなたのトラッシュから【ライフバースト】を持たないカード１枚を対象とし、それをライフクロスに加える |
| WX06-028-E1 | AUTO | 真バグ | live BANISH は `owner:'opponent',count:1,powerRange.max:12000` だけ。原文はこれに加え別の `max:10000` 1体も対象・バニッシュするため、1処理が完全欠落。 | `execBanish` (`effectExecutor.ts:1125-1229`)；異なる閾値2段の `SEQUENCE` で既存 consumer に到達 | パワー12000以下のシグニ１体とパワー10000以下のシグニ１体を対象とし、それらをバニッシュする |
| WX08-036-E1 | AUTO | 真バグ | live は戻すトラッシュ札側に誤って `powerRange.max:10000` を付け、did-it 後 BANISH は相手SIGNI全体。原文では戻す5枚は鉱石/宝石、バニッシュ対象が相手かつパワー10000以下。 | `execTransferToDeck` の source filter と `execBanish` の `matchesFilter` (`effectExecutor.ts:1125-1229`) | 対戦相手のパワー10000以下のシグニ１体を対象とし…そうした場合、それをバニッシュする |
| WX09-025-E1 | AUTO | 真バグ | live BANISH filter は `powerRange.max:8000` に加え対象自身へ `story:['鉱石','宝石']` を課す。原文の種類条件は「あなたの場に合計3体」という発動側盤面条件で、相手対象の種類は不問。 | `execBanish` (`effectExecutor.ts:1125-1229`) と `checkActiveCondition` の自場 story/count 条件 | 対戦相手のパワー8000以下のシグニ１体を対象とし、あなたの場に＜鉱石＞か＜宝石＞のシグニが合計３体ある場合 |
| WX12-Re13-E1 | AUTO | 真バグ | live 選択肢①の2段目 BANISH は `target.owner:'self',powerRange.max:8000`。原文は1段目だけ「あなたのシグニ」、2段目は所有者指定なしなので self 限定は過小で、`owner:'any'` が必要。 | `execBanish` (`effectExecutor.ts:1125-1229`) は owner any の両軍候補と powerRange を消費 | そうした場合、対象のパワー8000以下のシグニ１体をバニッシュする |

## 3. クラスタ所見

- F001: 2件とも原文上は host 自身の常在耐性。単なる `thisCardOnly` 欠落ではなく、複合 SEQUENCE 内の一般的 `GRANT_PROTECTION` を抽出しない同一配線穴だった。
- F002: 2件とも「このシグニ」と先行する相手対象を混同。ただし WX20 は owner 矛盾で完全空振り、WXDi は後段付与対象の保存も併発する。
- F003: 2件とも引用内を含む「このルリグ」を SIGNI に誤型付けしており、既存 LRIG consumer で修正可能。
- F004: 同じ `LOOK_PICK_CHAIN` 二段型で一致。型コメントは `pickCount` を上限と呼ぶ一方、実UIは optional 無しなら最大数必須という実装差。
- F005: 2件は同文同構造で完全一致。後段の `$ref:last_processed_count` は正しいが、前段 cost を3体固定にしたため可変性だけが死んでいる。
- F006: いずれも全トラッシュ回収＋shuffle が丸ごと脱落。後続は16枚ミルとエナチャージ2で異なるが結論は同じ。
- F007: 2件とも素の `LRIG` がセンタートップへ直結する既存規約により偽陽性。`filter.isUp` もなくアシスト混入条件に該当しない。
- F008: 2件とも混合候補 `CENTER_LRIG_OR_SIGNI count:2` が種類別1体を保証しない。遅延の有無だけが違い、LRIG/SIGNI 二段化は既存語彙内。
- F009: 2件とも SIGNI ALL だけでセンタールリグ欠落。期間は BURST のターン末とゲーム1回の相手ターン末で異なるため個別 duration 維持が必要。
- F010: 両方同一対象参照漏れだが、WXDi-P01 は「代わりに」を加算へしたバグ、WXDi-P08 は対象宣言と自軍コスト自体の逆転もある。
- F011: 2件とも場出し札は lastProcessed に残るのにバフ側が読まない同型。duration は既に `UNTIL_OPP_TURN_END` で正しく、INSTANT 指摘ではない。
- F012: 2件とも連続キーワード付与の対象共有漏れ。対象フィルタ（無条件 self／原子 self）は異なるため第1段の実JSONを保持して参照化する。
- F013: 2件とも直前ミル札の条件判定まではあるが、ADD_TO_FIELD が lastProcessed を対象固定に使わない同一機構穴。
- F014: 結論は双方真バグだが構造は別。WX06 は主要TRASHだけ欠落、WXK06 はミルと対象TRASHの順序・対象・条件が全面的に崩れている。
- F015: 2件とも遅延誘発を即時 action に平坦化。発火後の action が LIFE_CRASH と20枚TRASHで違うだけで、設置機構は既存。
- F016: 2件とも `TRASH DECK_CARD` のトップ処理を用いている。下端を読む `MILL.fromBottom` は既にあるため parser/action 選択の問題。
- F017: 2件とも JSON 木の表面順に対する指摘だが、同じ resumeSearch 特例が shuffle→top を保証し偽陽性。
- F018: 2件とも別【出】のデッキトップ加算を誤複製した真バグ。`fromTrash` は既存だが `hasLifeBurst:false` filter の受け渡しは段2で要確認。
- F019: 結論は同じ真バグでも WX06 は2体目の処理欠落、WX08 は power/story 条件を移動元へ誤装着しており修正形が異なる。
- F020: WX09 は条件の主語（自場の種類条件 vs 相手対象属性）の取り違え、WX12 は所有者限定の過剰付与。閾値 `max` の向き自体は両方正しい。

## 4. 機構待ちの一覧

| cluster / 件数 | 不足語彙・機構 | 必要な配線 |
|---|---|---|
| F001 / 2 | 複合 CONTINUOUS 内の host 自身への source-type 効果耐性 | `collectEffectImmuneSigni` の `extractGrantProtections` (`effectEngine.ts:5275`) が現在 whitelist する一特殊形以外にも、安全に SEQUENCE 内 host-target `GRANT_PROTECTION` を抽出する配線 |
| F004 / 2 | `LOOK_PICK_CHAIN` 各 stage の0〜N枚選択 | `LookPickChainStage` から `execLookPickChain` (`effectExecutor.ts:5699`) の SEARCH pending `optional:true` へ渡し、CPU経路も0枚選択を許す配線 |
| F005 / 2 | `cost.fieldTrash` の「N体まで」可変支払い | `EffectCost.fieldTrash`、`fieldTrashSelectionSatisfied`、起動/出現/アタック各 cost UI、`execUtils` の支払い処理へ upTo/minCount を一貫して配線 |
| F013 / 2 | `ADD_TO_FIELD` の直前処理札固定 | `AddToFieldAction` に lastProcessed 対象化語彙を設け、`execAddToField` の TRASH_CARD candidates (`effectExecutor.ts:2855`) を `ctx.lastProcessedCards` で限定する配線 |

## 5. 偽陽性の件数についての自己評価

偽陽性は4/40＝10%、段0の precision は90%。パイロット precision 78〜84% より偽陽性が少ない。偽陽性は engine の非自明な正準化が明確な2系列だけで、F007の `LRIG`→センタートップ直結2件と、F017の SEARCH `then`/`afterSearch` 表面順を実行時に反転する特例2件である。今回の残存小クラスタの大半は対象型・owner・移動元・イベント化の単純脱落であり、慣例表現に当たった系列が少なかったためと評価する。

## 6. 条件以外で見つけた原文との食い違い

条件以外の追加食い違いは4件。

- `WXDi-P08-081-E1`: F010の同一対象問題に加え、原文の「相手SIGNIを対象」「自分の悪魔SIGNIを場からトラッシュ」を live が `TRASH opponent story:'悪魔'` 一手へ反転・圧縮している。
- `WXK06-030-E1`: F014の後続TRASH欠落だけでなく、原文のデッキ上から龍獣8枚までミルする前処理を、相手の龍獣SIGNI1体を即TRASHする action に誤変換している。
- `WXDi-P01-044-E2`: F010の対象共有漏れに加え、「代わりに－10000」を先行－5000へ加算するため同一対象を選ぶと－15000になる。
- `WX08-036-E1`: F019のBANISH閾値欠落のほか、デッキ下へ戻す5枚の原文フィルタ＜鉱石＞/＜宝石＞が `powerRange.max:10000` に置換されている。

## 7. ゲート・差分・成果物実測

- `npm run gates`: 全緑。typecheck PASS／golden **2325/0**／smoke **10693 OK・CRASH 0・HANG 0・INVARIANT 0・SKIP 0**／fuzz **200ゲーム・不具合0**／census **783/783**／census:stubs **無言no-op 0・明示defer 0**／manual-fields **0**／lint **0 errors / 260 warnings**。
- `git status --short`: 作業開始時からの M 4本（`docs/CODEX_GUIDE.md`, `docs/PLAN.md`, `docs/_census_stubs.txt`, `docs/_vocab_census.txt`）と既存 untracked 群を維持し、今回許可された `stage1_batch5_triage.md` だけを新規作成。既存ファイルの追加変更はない。
- `git diff --stat`: `docs/CODEX_GUIDE.md | 8 +++++++-`、`docs/PLAN.md | 25 ++++++++++++++++++++++++-`、計 `2 files changed, 31 insertions(+), 2 deletions(-)`。いずれも作業前からの差分で、**新規ファイルは diff stat に現れていない**。計器2本は改行差の status M だが content diff は空。
- 報告書確認: finding 行 **40**。`wc -c scripts/archive/scratchpad/semantic_audit_clean_round1/stage1_batch5_triage.md` 実測 **30323 bytes**。先頭20行・末尾20行を UTF-8 で読み返し、先頭のサマリと末尾の§8、文字化け・欠落がないことを確認した。

## 8. 当初の見立てから変えた件（ガードレール2・3・5）

- F001 2件: 当初は第4バッチの `execGrantProtection` 自動適用と似た自己対象偽陽性を疑ったが、これは CONTINUOUS の SEQUENCE 内であり、実際の collector が whitelist 外を抽出しないため真バグ＋機構待ちへ変更した。
- F004 2件: `LookPickChainStage.pickCount` の型コメント「上限枚数」から偽陽性を疑ったが、live構造ごとに UI consumer を追うと pending.optional が無く1枚必須だったため真バグ＋機構待ちにした。
- F007 2件: 段0どおりセンター限定欠落と見ていたが、各 live に `filter.isUp` が無いことと action 固有の LRIG 分岐を確認し偽陽性へ変更した。
- F013 2件: 条件 `LAST_PROCESSED_MATCHES` があるため直前札へ自動固定される可能性を見たが、`execAddToField` は判定結果を対象候補へ使わないため真バグ＋機構待ちに留置した。
- F017 2件: JSON の `then`→`afterSearch` 表面順から真バグと見たが、当該組合せ専用の `resumeSearch` 分岐を開いて shuffle 先行を確認し偽陽性へ変更した。

---

# 【Claude 検証】2026-08-21（CODEX_GUIDE §7）

## 🟢 第4バッチの水準を維持
成果物正常着地（30,323 bytes・自己申告と一致）。根拠列は行ごとに固有。ゲート独立実行＝全緑・ベースライン一致
（golden 2325/0・smoke 10693 OK・fuzz 0・census 783/783・census:stubs 0・manual-fields 0・lint 0 err/260 warn）。既存ファイル変更0。

**§8 の「見立てを変えた件」が両方向に動いている**＝F007／F017 は真バグ→**偽陽性**へ、F004／F013 は偽陽性疑い→**真バグ＋機構待ち**へ。
片方向だけに寄っていない＝1件ずつ判断している証拠。

## 偽陽性のサンプリング裏取り＝**2系列とも実コードで一致・引用行も正確**
- **F007（`WX07-023-BURST`／`WX21-027-BURST`）**＝`execDown` / `execGrantKeyword` の `target.type==='LRIG'` 分岐は
  `state.field.lrig.at(-1)`（センタートップ）だけを扱い、アシストは候補化しない。**アシストまで含むのは `owner==='self' && filter.isUp` の分岐だけ**
  （`effectExecutor.ts:3138`）。live に `filter.isUp` が無いので「センター限定が欠落」は誤読。✅
- **F017（`WD23-013-A-E1`／`WD23-024-E-E1`）**＝`resumeSearch` に**専用分岐**がある：
  `picked.length > 0 && pending.afterAction?.type === 'SHUFFLE_DECK' && isDeckPlacementFromSearch(pending.thenAction)`
  （`effectExecutor.ts:8466-8468`）で **SHUFFLE_DECK を先に実行してから instanceId で top を確定する**。
  ソース内コメントも「先に top へ置いてからシャッフルすると選択札が流れるため」と理由を書いている。
  **JSON の `then`→`afterSearch` の表面順だけ見ると必ず誤検出する形**。✅

## 偽陽性 10%（4/40）について
パイロット precision 78〜84% より偽陽性が少ないが、**第3バッチの 0% とは性質が違う**＝
§5 の自己評価が「残存小クラスタの大半は対象型・owner・移動元・イベント化の単純脱落で、慣例表現に当たった系列が少なかった」と
**母集団の性質で説明しており、実際に偽陽性2系列を実コードで掘り当てている**。数字合わせではない。

## 🟢 副産物＝条件以外の食い違い4件（第4バッチは1件）
`WXDi-P08-081-E1`（対象と主語が反転・圧縮）／`WXK06-030-E1`（デッキ上ミルの前処理が別 action に誤変換）／
`WXDi-P01-044-E2`（「代わりに－10000」が先行－5000へ加算されて－15000になる）／`WX08-036-E1`（原文の＜鉱石＞/＜宝石＞ filter が `powerRange.max:10000` に置換）。
⚠**いずれも「指摘された条件」とは別の脱落**＝**段2 で該当効果を触るときは finding の指摘だけ直すと残りが残る。**

## 段2 への申し送り（本バッチぶん）
機構待ち4クラスタ/8件＝F001（`collectEffectImmuneSigni` の SEQUENCE 内 host-target `GRANT_PROTECTION` 抽出）／
F004（`LOOK_PICK_CHAIN` の0〜N枚選択）／F005（`cost.fieldTrash` の「N体まで」可変支払い）／
F013（`ADD_TO_FIELD` の直前処理札固定）。**いずれも §6.3／Opusタスク12 行き＝段2 の parser 作業から外す。**
