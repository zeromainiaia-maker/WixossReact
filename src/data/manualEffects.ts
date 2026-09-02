import type { CardEffect, SequenceAction, ChooseAction, GrantLrigAbilityAction } from '../types/effects';

/**
 * パーサーで自動解析できないカード固有の効果定義。
 * buildEffectsMap および buildEffectsJson で自動解析結果にマージされる。
 * - 同じ effectId が存在する場合はここの定義で上書き
 * - 存在しない effectId は末尾に追加
 */
export const MANUAL_EFFECTS: Record<string, CardEffect[]> = {
  // ══════════════════════════════════════════════════════════════════════════════
  // PLAN §5.3（2026-09-01）＝支払う量が先に固定した対象のレベルで決まる2効果
  // ══════════════════════════════════════════════════════════════════════════════
  // 🔑2効果だけのため PLAN §2.0 の速いレーンで原文から手書きする。群Bの「レベル合計」だけは
  //   runtime の共通受け皿 `costColorsPerTargetLevelSum` を追加し、既存の最大レベル3効果は変更しない。

  // ── WX24-P4-051 ／ トラッシュの対象を先に固定し、同レベルのエナシグニだけを任意コストにする。
  // 🔴旧 live は別物の STUB でレベル限定を失い、支払い後に回収対象も選び直せた。
  'WX24-P4-051': [
    {"effectId":"WX24-P4-051-E2","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","energyTrash":{"count":1,"filter":{"cardType":"シグニ"}},"energyTrashSameLevelAsTarget":true},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerCondition":{"outsideMainPhase":true}},
  ],

  // ── WX24-P2-054 ／ 最大レベルではなく、選んだ相手シグニすべてのレベル合計ぶん《緑》を払う。
  // 🔴旧 live は《緑》1つ固定のうえ、自分のデッキ上をエナチャージする別動作だった。
  'WX24-P2-054': [
    {"effectId":"WX24-P2-054-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"参式　一衣"}},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":3,"filter":{"cardType":"シグニ"},"upToCount":true},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColorsPerTargetLevelSum":["緑"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":3,"filter":{"cardType":"シグニ"},"upToCount":true},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // §5.3 `O-188` 第6バッチ（2026-09-01）＝「AとBをそれぞれ1枚まで」が**手札以外の帰結**で潰れていた
  // ══════════════════════════════════════════════════════════════════════════════
  // 🔑同じ族の手札版（第4バッチ）は `TRANSFER_TO_HAND.transferGroups` で直したが、帰結が別のアクションだと
  //   群ごと潰れたままだった。**受け皿は `SelectionConstraint.groups`**（「＜A＞1枚と＜B＞1枚」の配分を表す既存機構）
  //   ＝`execAddToField`（`:3582`）・`execPlaceUnderSigni`（`:7551`）・`execSearch`（`:4586`）の3つとも
  //   `selectionConstraint` を `selectOrInteract` へ渡しており、`canAssignSelectionGroups` が
  //   **どの群にも割り当てられないカードを含む選択を却下**する（＝群外の札は取れない）。
  // ⚠同型が2枚以下なので PLAN §2.0 の「速いレーン」で手書きする（parser 規則は書かない）。

  // ── WXDi-P06-083 ／ 原文「【出】：あなたのトラッシュから**レベル１、レベル２、レベル３のシグニをそれぞれ１枚まで**
  //   対象とし、それらをこのシグニの下に置く。」
  // 🔴旧 live＝`PLACE_UNDER_SIGNI{count:3, filter:{cardType:'シグニ'}}`＝**レベル限定が丸ごと消え、
  //   トラッシュの任意のシグニを3枚まで置けた**（過剰実行）。レベル1が3枚あれば3枚とも置けてしまう。
  'WXDi-P06-083': [
    {"effectId":"WXDi-P06-083-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"PLACE_UNDER_SIGNI","source":"trash","count":3,"upToCount":true,"filter":{"cardType":"シグニ","level":{"min":1,"max":3}},"selectionConstraint":{"groups":[{"filter":{"cardType":"シグニ","level":1},"count":1},{"filter":{"cardType":"シグニ","level":2},"count":1},{"filter":{"cardType":"シグニ","level":3},"count":1}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P07-095 ／ 原文「以下の２つから１つを選ぶ。①あなたのトラッシュからレベル２以下のシグニを２枚まで
  //   対象とし、それらを場に出す。②あなたのトラッシュから**《惨之遊姫　グズ子//メモリア》とレベル２以下のシグニを
  //   それぞれ１枚まで**対象とし、それらを場に出す。」
  // 🔴旧 live＝②が `ADD_TO_FIELD{count:1, filter:{level:{max:2}}}`＝**カード名の群が丸ごと消え、
  //   ①の劣化版（1枚だけ）になっていた**（枚数の過小＋候補の過剰）。①は原文どおりなので触らない。
  // ⚠`filter` は2群の和（`anyOf`）にする＝候補一覧に群外の札を出さない。配分は `groups` が担う。
  'WXDi-P07-095': [
    {"effectId":"WXDi-P07-095-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","level":{"max":2}}}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"anyOf":[{"cardName":"惨之遊姫　グズ子//メモリア"},{"cardType":"シグニ","level":{"max":2}}]},"selectionConstraint":{"groups":[{"filter":{"cardName":"惨之遊姫　グズ子//メモリア"},"count":1},{"filter":{"cardType":"シグニ","level":{"max":2}},"count":1}]}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // 意味照合 段2（2026-09-01 続き760）
  // ══════════════════════════════════════════════════════════════════════════════

  // ── WX16-022 ／ 原文「あなたのエナゾーンから対象の**好きな枚数**の《アクセアイコン》を持つシグニを、
  //   対象のあなたの**好きな数**のシグニの【アクセ】にする。」
  // 🔴旧 live＝`GRANT_KEYWORD{keyword:'アクセ'}` を**自分または対戦相手のシグニ1体**へ付けるだけ＝
  //   **エナのカードが1枚も動かない**（アクセ機構としては完全な no-op のうえ、主語も相手を含んでいた）。
  //   受け皿は既存の `ATTACH_ACCE{fromEnergy}`（2段選択＝アクセ札→ホスト）＋今回足した `repeatWhilePossible`。
  // ⚠`optional` を必ず併用する＝**やめる択が無いと候補が尽きるまで強制**になる（原文の「好きな枚数」と真逆）。
  'WX16-022': [
    {"effectId":"WX16-022-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"ATTACH_ACCE","sourceOwner":"self","targetSigniOwner":"self","fromEnergy":true,"signiFilter":{"cardType":"シグニ","hasIcon":"アクセ"},"repeatWhilePossible":true,"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P05-003 ／ 原文①「**対戦相手のルリグ１体**を対象とし、「あなたのエナゾーンからカード１枚を
  //   トラッシュに置く。」**か**「手札を１枚捨てる。」を**合計３回**行う。そうした場合、このターン、
  //   それがアタックしたとき、そのアタックを無効にする。」
  // 🔴旧 live＝**エナ1枚だけ**（択も3回も無い）で、しかも無効化の対象が**対戦相手のシグニ**だった
  //   （原文はルリグ＝このピースの目的そのもの）。
  //   受け皿はすべて既存＝`REPEAT{count:3}`＋`CHOOSE`（支払いの2択）／`NEGATE_ATTACK{target:{type:'LRIG'}}`
  //   （`execNegateAttack` は LRIG 対象をセンタールリグへ解決する分岐を前から持っていた）。
  // ⚠「そうした場合」ゲートは既存規約どおり `CONDITIONAL{IS_MY_TURN}` のマーカーで表す。
  'WXDi-P05-003': [
    {"effectId":"WXDi-P05-003-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"エナか手札を合計3回支払い、対戦相手のルリグのアタックを無効にする","action":{"type":"SEQUENCE","steps":[{"type":"REPEAT","count":3,"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"p0","label":"あなたのエナゾーンからカード1枚をトラッシュに置く","action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":1}}},{"choiceId":"p1","label":"手札を1枚捨てる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}}]}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"NEGATE_ATTACK","target":{"type":"LRIG","owner":"opponent","count":1,"upToCount":false}}}]}},{"choiceId":"c1","label":"あなたのカードを1枚引く","action":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P09-002 ／ 原文「対戦相手のすべてのシグニをデッキの一番上に置く。**（置く順番は対戦相手が決める）**」
  // 🔴旧 live は一括処理＝engine の内部順（ゾーン順）で積まれ、**相手が順番を決める**という原文の指定が消えていた
  //   （デッキトップの並びは次のドロー順そのものなので、ここは実効果が変わる）。
  //   受け皿は今回足した `TransferToDeckAction.orderChosenBy:'opponent'`
  //   （`count:'ALL'` を 1体ずつの `SELECT_TARGET{opponentResponds}` へ割り、continuation で繰り返す）。
  // ⚠候補が1体以下なら順番の余地が無いので従来どおり一括（無意味なモーダルを出さない）。
  'WXDi-P09-002': [
    {"effectId":"WXDi-P09-002-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":6}]},"condition":{"type":"FIELD_LRIG_COLOR_COUNT","owner":"self","operator":"gte","value":3,"minLrigs":3},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"shuffle":false,"position":"top","orderChosenBy":"opponent"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WDK03-001 ／ 原文【起】《コインアイコン》：**あなたのルリグデッキから《異体同心　華代》１枚を場に出す。**
  // 🔴旧 live＝`ADD_TO_FIELD{source なし}`＝**デッキの一番上のカードを場に出す**まったく別のカード
  //   （`ADD_TO_FIELD` はキー枠を知らないので `source:'LRIG_DECK_CARD'` を足しても行き先が無い）。
  //   受け皿は今回足した `PLACE_KEY_FROM_LRIG_DECK`（行き先は `field.key_piece`。読み手は既存の
  //   `activeKeyAbilitySources` なので置くだけでキーの【常】が効く）。
  // ⚠**キーの【出】能力は発動させない**＝この経路は BattleScreen のキー使用フローを通らないので、
  //   発動させると誰も支払っていないコストで【出】が走る。過剰実行を作らない側へ倒した近似。
  // ⚠E2（【エナチャージ2】）は **parser 出力と実体同一**なので manual に置かない（§6.4 O-42 の影武者禁止）。
  'WDK03-001': [
    {"effectId":"WDK03-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":1},"action":{"type":"PLACE_KEY_FROM_LRIG_DECK","owner":"self","cardName":"異体同心　華代"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P09-031 ／ 原文【出】手札を２枚捨てる：**このターン、シグニアタックステップをスキップする。**
  // 🔴旧 live＝`BLOCK_ACTION{PLAYER owner:'self'}`＝**効果の使用者**だけを止めるので、
  //   相手のターンに（効果で）場へ出た場合に**相手のアタックステップが飛ばない**（このカードの目的そのもの）。
  //   受け皿は今回足した `BlockActionAction.bothPlayers`（両者の `blocked_actions` へ積む）。
  // ⚠期間は `END_OF_TURN` のまま＝「このターン」以上には残らない。
  'WXDi-P09-031': [
    {"effectId":"WXDi-P09-031-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":2},"action":{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"self","count":1},"actionId":"SIGNI_ATTACK_STEP","until":"END_OF_TURN","bothPlayers":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P12-050 ／ 原文【自】：あなたのアタックフェイズ開始時、あなたの場に《みこみこ☆さんさんまぜまぜ》が
  //   いる場合、**対戦相手は**【みこみこ親衛隊】１つを得る。
  // 🔴旧 live＝`GRANT_KEYWORD{target:{SIGNI, owner:'any'}}`＝**自分のシグニにも付けられた**＝
  //   トークンの能力（「あなたのターン終了時、あなたは手札を1枚捨てる」）の**払う人が真逆**になりうる。
  //   受け皿は今回足した `target.type:'PLAYER'` ＋ `PlayerState.player_keywords`
  //   （`triggerCollect` の `KEYWORD_TOKEN_MAP` ループがシグニ側と同じトークンカードを引く）。
  // ⚠取り除き（`REMOVE_MIKO_KEYWORD`）も**同じ地点で**プレイヤー側を消す＝片方だけ残すと毎ターン発火する。
  'WXDi-P12-050': [
    {"effectId":"WXDi-P12-050-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"みこみこ☆さんさんまぜまぜ"}},"then":{"type":"STUB","id":"GAIN_MIKOMIKO_GUARD","value":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ── WX15-006 ／ 原文「このアーツは**対戦相手のターンにしか使用できない**。ベット―《コインアイコン》
  //   **このターン、あなたのシグニ１体があなたの効果以外によってバニッシュされたとき**、対戦相手のシグニ１体を
  //   対象とし、それをバニッシュする。**あなたがベットしていた場合**、（同じ条件で）追加であなたのデッキの
  //   一番上のカードをライフクロスに加える。」
  // 🔴旧 live＝**使用したその場で**相手シグニをバニッシュし、**無条件で**ライフも増やしていた
  //   （遅延もベット判定も丸ごと無い＝相手ターンに撃つだけで確定除去＋ライフ回復になる別のカード）。
  //   受け皿は既存の `INSTALL_DELAYED_TRIGGER` ＋ 今回足した ①`ON_BANISH` の遅延収集地点
  //   （`collectBanishTriggers`。従来バニッシュだけ読む地点が無く**設置しても永久に発火しなかった**）
  //   ②`trigger.notByOwnEffect`（`cause.ownerId` が設置者本人なら発火しない）。
  // ⚠使用条件は `BLOCK_ACTION{USE_ARTS_EXCEPT_OPP_TURN}` ではなく `condition:{IS_OPPONENT_TURN}`（提示ゲートが読む形）。
  'WX15-006': [
    {"effectId":"WX15-006-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":1}]},"condition":{"type":"IS_OPPONENT_TURN"},"action":{"type":"SEQUENCE","steps":[{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_BANISH","notByOwnEffect":true,"triggerFilter":{"cardType":"シグニ"}},"effect":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_BANISH","notByOwnEffect":true,"triggerFilter":{"cardType":"シグニ"}},"effect":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WX13-012 ／ 原文①「あなたのシグニ１体を対象とし、あなたのデッキから、**それのクロス条件に含まれる
  //   すべてのシグニ**を１枚ずつ探して場に出し、デッキをシャッフルする。」
  // 🔴旧 live＝`SEARCH{filter:{cardType:'シグニ'}}`＝**デッキの任意のシグニ1枚**（対象宣言も無し）＝
  //   クロスデッキの組み合わせを揃えるというカードの役目が丸ごと消えていた。
  //   受け皿は今回足した `TargetFilter.nameInCrossConditionOfLastProcessed`
  //   （`getCrossConditionText` が読む `《クロスアイコン》《名前》の右　かつ　《名前》の左` から名前を全部集める）。
  // ⚠**基準は `lastProcessedCards`**＝`SELECT_TARGET_ONLY` の resume が選んだシグニを入れる
  //   （`STORE_LAST_PROCESSED_TARGETS` が読むのと同じ値）。取れなければ空ヒット（fail-closed）。
  'WX13-012': [
    {"effectId":"WX13-012-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":1},{"color":"無","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"自分のシグニ1体のクロス条件に含まれるシグニをデッキから場に出す","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","nameInCrossConditionOfLastProcessed":true},"maxCount":2,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}]}},{"choiceId":"c1","label":"クロス状態のシグニがいるなら対戦相手のシグニ1体をバニッシュ","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","crossState":true}},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-CP02-005 ／ 原文「…その中から＜ブルアカ＞のシグニ１枚を公開し手札に加え…
  //   **この方法で公開した生徒との絆を獲得する。**」
  // 🔴旧 live は絆獲得が丸ごと無く、このピースの役目（【絆】能力の有効化）が消えていた。
  //   受け皿は既存の `GAIN_BOND{source:'last_found'}`（`lastProcessedCards` の末尾のカード名を `bonds` へ積む）。
  'WXDi-CP02-005': [
    {"effectId":"WXDi-CP02-005-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"story":"ブルアカ","cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"GAIN_BOND","source":"last_found"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXEX2-03 ／ 原文はセンタールリグへ**2つ**の【常】を与える。旧 live は1つ目だけで、
  //   「**あなたの場に＜古代兵器＞のシグニがあるかぎり、対戦相手の場とトラッシュにあるシグニは能力を失う**」が
  //   丸ごと落ちていた（`rawText` に文字列としては残っていたが `abilities` へ展開されていない）。
  // ⚠**`allZones` を流用しない**＝あれは手札・エナ・トラッシュを**まとめて**足すので、原文が
  //   「場とトラッシュ」しか言っていないこの札では手札とエナまで巻き込む。今回足した `extraZones:['trash']` を使う。
  'WXEX2-03': [
    {"effectId":"WXEX2-03-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"any","action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXEX2-03-sub-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"天使"}},"action":{"type":"REMOVE_ABILITIES","target":{"type":"LRIG","owner":"opponent","count":1},"until":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"},{"effectId":"WXEX2-03-sub-E2","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"古代兵器"}},"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL","extraZones":["trash"],"filter":{"cardType":"シグニ"}},"until":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],


  // ══════════════════════════════════════════════════════════════════════════════
  // 意味照合 段2（2026-08-31 続き759）＝「受け皿は在るのに JSON が指していない」
  // ══════════════════════════════════════════════════════════════════════════════

  // ── WXK10-104 ／ 原文「以下の３つから１つを選ぶ。…②**あなたのセンタールリグ**１体を対象とし、
  //   ターン終了時まで、それは「【常】：**対戦相手の効果を受けない**。」を得る。」
  // 🔴旧 live の選択肢②＝`GRANT_PROTECTION{target:SIGNI, from:['ルリグ']}`＝**主語がシグニ**で、
  //   しかも耐性が「対戦相手の**ルリグの**効果」だけに縮んでいた（2軸とも別のカード）。
  //   受け皿はどちらも既存＝`target:{type:'LRIG'}`（`execGrantProtection` がセンタールリグへ直接付与）と
  //   `from:['any']`（`sourceMatches` が無条件 true）。
  'WXK10-104': [
    {"effectId":"WXK10-104-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"シグニ1体に【ダブルクラッシュ】と【Sランサー】を与える","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"any","count":1}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN","targetsStored":true},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"Sランサー","duration":"UNTIL_END_OF_TURN","targetsStored":true}]}},{"choiceId":"c1","label":"あなたのセンタールリグは対戦相手の効果を受けない","action":{"type":"GRANT_PROTECTION","target":{"type":"LRIG","owner":"self","count":1},"from":["any"],"sourceOwner":"opponent","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c2","label":"あなたのルリグは『アタック時に相手エナを2枚にする』を得る","action":{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK10-104-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"EQUALIZE_ENERGY","targetCount":2,"owner":"opponent"},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO"}}}],"countChoose":{"count":{"$ref":"center_lrig_level"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXK10-014 ／ 原文はセンタールリグへ**３つ**の【起】を与える。旧 live は**1つ目だけ**で、
  //   ②《ターン２回》エクシード１＝トラッシュのシグニ1枚を手札へ ③エクシード２＝相手シグニ1体をダウン
  //   が丸ごと落ちていた。受け皿は既存（`GRANT_EFFECT{target:LRIG}` を SEQUENCE で3本並べるだけ・
  //   `usageLimit:'twice_per_turn'` も既存語彙）。
  // ── SP15-001 ／ 原文「あなたのデッキから、**限定条件にあなたのセンタールリグのルリグタイプを持つ**カード１枚を
  //   探して公開し手札に加え、デッキをシャッフルする。」
  // 🔴旧 live＝`filter:{cardType:'ルリグ'}`＝**メインデッキにいないルリグカード**を探す形で、
  //   実質いつも空振りする別のカードだった。受け皿は今回足した `restrictionMatchesCenterLrig`
  //   （CSV の `Restriction` 列「ユヅキ限定」×センタールリグの `CardClass`「ユヅキ」で照合）。
  'SP15-001': [
    {"effectId":"SP15-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"restrictionMatchesCenterLrig":true},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── PR-205 ／ 原文【自】：あなたがリフレッシュしたとき、対戦相手のシグニ１体を対象とし、
  //   **それがこのターンであなたの最初のリフレッシュである場合**、それをバニッシュする。
  // 🔴旧 live は条件が丸ごと無く、**同じターンの2回目以降のリフレッシュでも**バニッシュしていた。
  //   受け皿は今回足した `REFRESH_COUNT_THIS_TURN`（`refresh_count_this_turn` は加算後に読むので
  //   「最初の1回」は `lte 1`）。
  'PR-205': [
    {"effectId":"PR-205-E1","effectType":"AUTO","timing":["ON_REFRESH"],"condition":{"type":"REFRESH_COUNT_THIS_TURN","owner":"self","operator":"lte","value":1},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"refreshedOwner":"self"}},
  ],

  // ── WXK06-030 ／ 原文【自】：このシグニがアタックしたとき、**対戦相手のシグニゾーンからカード１枚を対象とし**、
  //   あなたのデッキの上から**＜龍獣＞のシグニが８枚トラッシュに置かれるまで**カードをトラッシュに置く。
  //   この方法で＜龍獣＞のシグニを８枚トラッシュに置いた場合、**それを**トラッシュに置き、カードを１枚引く。
  // 🔴旧 live＝「相手の＜龍獣＞のシグニ1体をトラッシュ」＋「8枚処理したなら1枚引く」＝
  //   **①めくり切りが丸ごと無い ②対象が＜龍獣＞に限定されていた（原文は無限定）③「それ」の照応が消えていた**の3軸。
  //   受け皿はすべて既存＝`REVEAL_UNTIL{stopCondition:signiCount, restDestination:'trash'}`（hit 無し＝全部トラッシュ）／
  //   `SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS`／`TRASH{targetsStored}`。
  // ⚠**「シグニゾーンからカード」＝下敷きも含む**が対象解決は最上面のみ＝`PARTIAL`。
  'WXK06-030': [
    {"effectId":"WXK06-030-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"REVEAL_UNTIL","owner":"self","stopCondition":{"kind":"signiCount","count":8,"filter":{"cardType":"シグニ","story":"龍獣"}},"restDestination":"trash"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"龍獣"},"minCount":8},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true},{"type":"DRAW","owner":"self","count":1}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL"},
  ],

  // ── WXK09-090 ／ 原文【起】このシグニを場からトラッシュに置く：あなたのトラッシュから《ナナコビト》以外の
  //   ＜美巧＞のシグニ１枚を対象とし、…それぞれ名前の異なる＜美巧＞のシグニ７枚をデッキに加えてシャッフルする。
  //   **そうした場合、それを場に出す。**
  // 🔴旧 live＝場に出す側が `ADD_TO_FIELD{source 無し}`＝**デッキの一番上を出す**別のカードで、
  //   しかもゲートが「そうした場合」ではなく `IS_MY_TURN` だった（相手ターンには 7枚戻して何も出ない）。
  //   ⇒ 7枚戻し → `LAST_PROCESSED_COUNT_GTE 7`（＝「そうした場合」）→ トラッシュの＜美巧＞1枚を場に出す。
  // 🔑**対象を先に宣言しなくても等価**＝原文は「先に1枚選ぶ」ことで7枚から除外するが、
  //   7枚を先に戻してから残りのトラッシュから選んでも取りうる集合は同じ。
  'WXK09-090': [
    {"effectId":"WXK09-090-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"trash_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":7,"filter":{"cardType":"シグニ","story":"美巧","excludeCardName":"白雪の童話　ナナコビト"},"selectionConstraint":{"distinct":"name"}},"shuffle":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":7},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"美巧","excludeCardName":"白雪の童話　ナナコビト"}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WX16-Re09 ／ 原文…それは「【常】：**対戦相手のターンの間**、このシグニは対戦相手の効果を受けない。」を得る。
  // 🔴旧 live は期間限定が丸ごと落ちて**ターンを問わない耐性**だった（自分のターンの相手アーツも全部弾く）。
  //   受け皿は今回足した `GrantProtectionAction.duringOppTurn`（`PROTECTION_FILTERED:` の JSON へ載せ、
  //   `collectEffectImmuneSigni` の `protMatches` が `isOwnerTurn` で判定する）。
  'WX16-Re09': [
    {"effectId":"WX16-Re09-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"delta":3000,"duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["any"],"sourceOwner":"opponent","duringOppTurn":true,"duration":"UNTIL_END_OF_TURN","targetsLastProcessed":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P03-004 ／ 原文「**あなたのライフクロスの一番上を見て**、以下の２つから１つを選ぶ。…」
  // 🔴旧 live は「見る」が丸ごと無く、**中身を知らずに選ばされる**別のカードだった
  //   （このカードは「見てから選ぶ」ことが効果の本体）。受け皿は既存の `LOOK_AND_REORDER`
  //   （`source.location:'life_cloth'` は `WX05-010-E1` で実績あり）。
  // 🆕🔴**2026-09-01 続き766＝旧コメント「選択肢ごとのコストは `ChoiceOption` に受け皿が無い（支払いUIが要る）」は誤りだった。**
  //   受け皿は**枝の action の中**に置く既存形＝`STUB{OPTIONAL_COST, costColors}` →
  //   `CONDITIONAL{PAID_ADDITIONAL_COST}`（engine の `resolveOptionalCostSpec` が支払いの `CHOOSE` を出す。
  //   `WX25-P2-004-E1` ほかに実績・§5.3 `O-96` の第1〜3バッチで挙動まで golden 済み）。
  //   ⚠**`ChoiceOption` にコスト欄が無い**ことと**枝の中で払えない**ことは別＝**受け皿の在処を1階層間違えていた**。
  //   ⇒ 選択肢②を「払えたときだけ実行」へ変更し、`PARTIAL` を解除した（意味照合 段2 の finding を1件消化）。
  'WXDi-P03-004': [
    {"effectId":"WXDi-P03-004-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"life_cloth","owner":"self"},"count":1,"private":true,"reorder":false,"destination":{"location":"life_cloth","owner":"self","position":"top"}},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"あなたのカードを1枚引く","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"《無》×5を支払い、ライフクロスの一番上を手札に加え、デッキの一番上をライフクロスに加える","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["無","無","無","無","無"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"LIFE_CLOTH_CARD","owner":"self","count":1}},{"type":"SHUFFLE_DECK","owner":"self"},{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}]}}]}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXEX1-28 ／ 原文【起】…《黒×0》：**対象の対戦相手のシグニ１体を**対象の対戦相手の**他の**シグニ１体の
  //   【チャーム】にする。
  // 🔴旧 live は `charm:{type:'SIGNI'}` を書いていたのに engine に SIGNI 分岐が無く、既定枝（手札／エナ）へ
  //   落ちて**相手の手札のカードをチャームにしていた**（＝別のカード）。今回 engine に場ソースを足し、
  //   さらに `toOther` で「他の」を表す（無いと自分自身のチャームになる）。
  'WXEX1-28': [
    {"effectId":"WXEX1-28-E1","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"ATTACH_CHARM","charm":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"to":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"toOther":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn","appearanceCondition":{"rawText":"《メインフェイズアイコン》《アタックフェイズアイコン》合計５枚のレゾナではない＜凶蟲＞のシグニをあなたのエナゾーンと場からトラッシュに置く","timings":["MAIN","ATTACK"],"cost":{},"combinedTrash":{"zones":["energy","field"],"count":5,"filter":{"cardType":"シグニ","story":"凶蟲","excludeResona":true}},"paymentShape":"REQUIRES_NEW_FLOW"}},
  ],

  // ── WX13-005B ／ 原文【出】：**対戦相手のチェックゾーンにスペルがある場合**、以下の２つから１つを選ぶ。…
  // 🔴旧 live は条件が丸ごと無く、**場に出るたび必ず**「相手トラッシュのシグニ2枚除外」か
  //   「このターン相手はスペルとアーツを使用できない」を撃てた。受け皿は既存 `CHECK_ZONE_COUNT` に
  //   今回 `filter` を足しただけ（枚数だけの器だと「何かあれば成立」＝過剰発火のまま）。
  // 🆕**2026-09-02（索引 B 第2巡・§5.3 `O-138`）＝残り2軸を決着させた。**
  //   ①**兄弟2枚（`WX13-006B` / `WX14-006B`）も同じゲートを持つ**＝parser 側に規則を足して AUTO で載せた
  //     （`effectParser.ts` の条件表＋`parseCondition`）。ここを手で写さないこと。
  //   ②🔴**条件を足すだけでは「常に不発」の逆側の事故になる**＝解決待ちのスペルは `pending_spell` が
  //     保持していて `field` のどこにも属さないので、チェックゾーンは**常に空**だった。
  //     ⇒ `PlayerState.spell_in_check_zone` を新設し、`QUEUE_SPELL` で置いて `FINISH_SPELL`/`FINISH_CUTIN`
  //     で降ろす（`checkZoneCards` が数える）。**条件型を足す前に「その条件が真になる盤面が実在するか」を確かめる。**
  //   ③**「この【出】能力はそのスペルの効果より先に発動する」は既に実装済み**＝
  //     `BattleScreen` のカットイン窓が「SPELL_CUTINレゾナはスペルを打ち消さず先にON_PLAYを解決する」
  //     （`bs.pending_spell.cutin_response_complete` を待って元スペルを継続）。受け皿を新設する必要は無かった。
  // ⚠`PARTIAL` のままにしてある＝`appearanceCondition.paymentShape:'REQUIRES_NEW_FLOW'`（出現条件の複合支払い）が別軸。
  'WX13-005B': [
    {"effectId":"WX13-005B-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"CHECK_ZONE_COUNT","owner":"opponent","operator":"gte","value":1,"filter":{"cardType":"スペル"}},"then":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"対戦相手のシグニ(トラッシュ)2枚までをゲームから除外する","action":{"type":"EXILE","target":{"type":"TRASH_CARD","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true}}},{"choiceId":"c1","label":"このターン、対戦相手はスペルとアーツを使用できない","action":{"type":"SEQUENCE","steps":[{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"USE_ARTS","until":"END_OF_TURN"},{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"USE_SPELL","until":"END_OF_TURN"}]}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL","appearanceCondition":{"rawText":"《スペルカットインアイコン》合計２枚のレゾナではない＜宇宙＞のシグニをあなたの手札とエナゾーンと場からトラッシュに置く","timings":["SPELL_CUTIN"],"cost":{},"combinedTrash":{"zones":["hand","energy","field"],"count":2,"filter":{"cardType":"シグニ","story":"宇宙","excludeResona":true}},"paymentShape":"REQUIRES_NEW_FLOW"}},
  ],

  // ── WXK05-016 ／ 原文【起】…このキーを場からルリグトラッシュに置く：あなたのトラッシュから
  //   **このターンに捨てた**シグニ１枚を対象とし、それを場に出す。それの【出】能力は発動しない。
  // 🔴旧 live＝限定が丸ごと落ちて**トラッシュの任意のシグニ**を釣れた（このキーは E1 で相手の手札を
  //   2枚捨てさせるので、原文は「その捨てさせた札」を釣る設計）。
  //   受け皿は今回足した `TargetFilter.discardedFromHandThisTurn`（`trashCandidates` の funnel が消費）。
  // ⚠**自分が捨てた札の履歴**（`turn_hand_discarded_cards`）を見る＝相手に捨てさせた札は入らない。
  //   原文の「（あなたが）このターンに捨てたシグニ」も自分の手札からの捨て札なので一致する。
  'WXK05-016': [
    {"effectId":"WXK05-016-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"trash_key":true},"action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","discardedFromHandThisTurn":true}},"suppressOnPlay":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WD08-008 ／ 原文「…この方法でトラッシュに置いたカードの中に、共通するクラスを持つカードが３枚以上
  //   ある場合、**そのクラス１つを選択する**。その後、あなたのトラッシュから**選択したクラスを持つ**シグニを
  //   ２枚まで対象とし、それらを手札に加える。」
  // 🔴旧 live＝クラス選択が丸ごと無く、手札に加えるのは**トラッシュの任意のシグニ**だった。
  //   受け皿は既存の `DECLARE_CLASS`＋`filter.classEqDeclaredClass`（`resolveDynamicFilter` が解決）で、
  //   今回足したのは候補を「この方法で置いた5枚のうち3枚以上に出るクラス」へ絞る `declareFromLastProcessed` だけ。
  'WD08-008': [
    {"effectId":"WD08-008-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":5}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{},"shareClass":true,"operator":"gte","value":3},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_CLASS","declareFromLastProcessed":{"minCount":3}},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","classEqDeclaredClass":true}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-P04-005 ／ 原文「**あなたか対戦相手は**自分のトラッシュにあるすべてのカードをデッキに加えて
  //   シャッフルする。あなたはカードを１枚引く。」
  // 🔴旧 live＝**自分固定**＝相手のトラッシュを流す使い方（リアニメイト対策）が丸ごとできなかった。
  //   受け皿は既存の `CHOOSE`（プレイヤー選択を2択の枝として書く＝engine に新しい機構は要らない）。
  'WXDi-P04-005': [
    {"effectId":"WXDi-P04-005-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"あなたのトラッシュをすべてデッキに加えてシャッフルする","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":"ALL"},"shuffle":true}},{"choiceId":"c1","label":"対戦相手のトラッシュをすべてデッキに加えてシャッフルする","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"opponent","count":"ALL"},"shuffle":true}}]},{"type":"DRAW","owner":"self","count":1}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WX19-061 ／ 原文【出】：デッキの一番上を公開する。それが青のカードの場合、対戦相手のデッキの一番上を見る。
  //   **＜水獣＞のシグニの場合、カードを１枚引く。** スペルの場合、…（入れ替え）
  // 🔴旧 live＝「青のシグニ」1枝だけで、**＜水獣＞のドローが丸ごと無かった**。公開カードへの分岐は
  //   `REVEAL_DECK_TOP`（`lastProcessedCards` に公開札を載せる）＋`LAST_PROCESSED_MATCHES` で書ける。
  // ⚠**ドローを先に置く**＝`LOOK_AND_REORDER` が `lastProcessedCards` を上書きするので、
  //   公開札を見る条件は上書き前にすべて評価しておく（順序は原文の意味を変えない独立分岐）。
  // 🆕**スペル枝（2026-09-01 続き760）**＝新設 `SWAP_DECK_TOP_AND_LIFE{owner:'opponent',optional}`。
  //   ⚠**この枝だけ `DECK_TOP_MATCHES` で判定する**＝`lastProcessedCards` は上の `LOOK_AND_REORDER`（相手デッキを見る）で
  //     上書きされるので使えない。公開札は引かれない限りデッキトップに残る（＜水獣＞のときだけ引く）ので等価。
  'WX19-061': [
    {"effectId":"WX19-061-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"水獣"},"minCount":1},"then":{"type":"DRAW","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"青"},"minCount":1},"then":{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"opponent"},"count":1,"private":true,"reorder":false,"destination":{"location":"deck","owner":"opponent","position":"top"}}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_MATCHES","owner":"self","filter":{"cardType":"スペル"}},"then":{"type":"SWAP_DECK_TOP_AND_LIFE","owner":"opponent","optional":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ── WXK07-106 ／ 原文「あなたのデッキの一番上のカードをトラッシュに置く。その後、**この方法で
  //   トラッシュに置かれたカードが**レベルが奇数のシグニの場合、**それを**トラッシュから場に出す。」
  // 🔴旧 live＝`ADD_TO_FIELD{source:TRASH_CARD, filter:{cardType:'シグニ'}}`＝**トラッシュの任意のシグニ**を
  //   出せた（「この方法で」の限定が丸ごと落ちた過剰実行）。受け皿は既存の `PICK_FROM_TRASHED_CARDS`
  //   （候補は `lastProcessedCards` ∩ トラッシュ）＋今回足した `dest:'field'`。
  // ⚠`dest:'hand_or_field'` を流用しない＝原文にない「手札に加える」択が増える。
  'WXK07-106': [
    {"effectId":"WXK07-106-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"REPEAT","count":2,"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","levelParity":"odd"},"minCount":1},"then":{"type":"STUB","id":"PICK_FROM_TRASHED_CARDS","trashedPick":{"count":1,"filter":{"cardType":"シグニ"},"dest":"field"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","levelParity":"even"},"minCount":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-12000}}]}},"else":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","levelParity":"odd"},"minCount":1},"then":{"type":"STUB","id":"PICK_FROM_TRASHED_CARDS","trashedPick":{"count":1,"filter":{"cardType":"シグニ"},"dest":"field"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","levelParity":"even"},"minCount":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-12000}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXK10-003 ／ 原文の選択肢③「対戦相手のパワー12000以下のシグニ１体を対象とし、
  //   **あなたの場にあるシグニの数が対戦相手より２体以上少ない場合**、それをバニッシュする。」
  // 🔴旧 live は選択肢③だけ条件が丸ごと落ちて**無条件バニッシュ**だった（④には条件が付いていた＝
  //   同じ効果の中で片方の枝にしか付かない §5-8′ 型の取りこぼし）。
  //   受け皿は既存の `ZONE_COUNT_COMPARE` ＋ 今回足した `offset`（右辺の下駄）。
  'WXK10-003': [
    {"effectId":"WXK10-003-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"無","count":3}]},"action":{"type":"CHOOSE","choose_count":2,"from_count":4,"choices":[{"choiceId":"c0","label":"対戦相手は手札を1枚捨てる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}},{"choiceId":"c1","label":"対戦相手のシグニ1体をダウンする","action":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"choiceId":"c2","label":"場のシグニが2体以上少ないなら、パワー12000以下のシグニ1体をバニッシュ","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}},"condition":{"type":"ZONE_COUNT_COMPARE","left":{"zone":"field","owner":"self","filter":{"cardType":"シグニ"}},"right":{"zone":"field","owner":"opponent","filter":{"cardType":"シグニ"}},"operator":"lte","offset":-2}},{"choiceId":"c3","label":"ライフが2枚以上少ないなら、対戦相手のライフクロスを1枚クラッシュ","action":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true},"condition":{"type":"LIFE_COMPARE_OPP","operator":"lte","value":-2}}],"upTo":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ── WXDi-D03-004 ／ 原文【チーム常】：「**アタックしている**あなたのシグニのパワーを＋2000する。」
  // 🔴旧 live は `filter:{cardType:'シグニ'}` だけ＝**自分の全シグニを常時＋2000**（原文の3倍規模の常在バフ）。
  //   受け皿は今回足した `TargetFilter.isAttacking`（`applyDeltaToState` → `matchesStateFilter` が消費）。
  'WXDi-D03-004': [
    {"effectId":"WXDi-D03-004-E1","effectType":"CONTINUOUS","activeCondition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"NoLimit","operator":"gte","value":3},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","isAttacking":true}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  'WXK10-014': [
    {"effectId":"WXK10-014-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"無","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK10-014-sub-E1","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":1},"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_turn"}},{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK10-014-sub-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":1},"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO","usageLimit":"twice_per_turn"}},{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK10-014-sub-E3","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // 意味照合 段2（2026-08-31 続き758）＝「受け皿は在るのに JSON が指していない」20件
  // 🔑新設した engine 語彙は **`TakeFromUnderSigni.count:'ALL'` / `distinct:'costSum'` /
  //   `triggerCondition.targetedByOpponent` / `triggerCondition.centerLrigOnly` /
  //   `TargetFilter.classMatchesAnyFieldSigni` / `$ref:'assist_lrig_level_sum'` /
  //   `ATTACH_ACCE.targetsLastProcessed`＋`optional`** の7つだけ。残りは既存受け皿への配線。
  // ══════════════════════════════════════════════════════════════════════════════

  // ── (A) 「N枚見て、1枚を〈行き先〉、残りを好きな順番でデッキの一番下」＝`LOOK_PICK_CHAIN` ──
  // 🔴`LOOK_AND_REORDER{canTrash}` は**何枚トラッシュに置けるか無制限**（＝任意）で、
  //   「必ず1枚をトラッシュに置く」も「1枚をデッキの一番上に戻す」も表せない。
  //   受け皿は既存の `LOOK_PICK_CHAIN`（`then:'trash'` / `then:'deck_top'` の2段）。

  // SPDi01-133 ／ 原文【出】：あなたのデッキの上からカードを３枚見る。その中から**カード１枚をトラッシュに置き、
  //   カード１枚をデッキの一番上に戻し**、残りを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝`canTrash:true` の裸＝**3枚全部トラッシュへ送れる**うえ「デッキの一番上に戻す」が丸ごと無かった。
  'SPDi01-133': [
    {"effectId":"SPDi01-133-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"pickCount":1,"then":"trash","pickNoun":"カード"},{"pickCount":1,"then":"deck_top","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX24-P3-078 ／ 原文【出】：あなたのデッキの上からカードを３枚見る。その中から**カード１枚をデッキの一番上に戻し**、
  //   残りを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝3枚とも一番下＝**デッキトップを仕込む**というカードの役目が丸ごと消えていた。
  'WX24-P3-078': [
    {"effectId":"WX24-P3-078-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"pickCount":1,"then":"deck_top","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P15-073 ／ 原文【起】《ターン２回》《コインアイコン》：あなたのデッキの上からカードを５枚見る。
  //   その中から**カード１枚をトラッシュに置き**、残りを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝`canTrash:true`＝トラッシュ送りが**任意**（0枚でもよく、5枚全部でもよかった）。
  'WXDi-P15-073': [
    {"effectId":"WXDi-P15-073-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":1},"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"pickCount":1,"then":"trash","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"twice_per_turn"},
  ],

  // WXDi-P10-075 ／ 原文【自】《ターン１回》：対戦相手のシグニ１体がバニッシュされたとき、
  //   あなたのデッキの一番上を見る。**そのカードを**トラッシュに置いてもよい。
  // 🔴旧 live＝「見る」の後ろに `TRASH{SIGNI owner:any}` が付いており、**任意確認なしで
  //   場のシグニ1体（自分のでも）を強制トラッシュ**していた＝原文と別のカード。
  //   ⇒ `LOOK_AND_REORDER{count:1, canTrash:true}` 1本で「見て、置いてもよい」を表す。
  'WXDi-P10-075': [
    {"effectId":"WXDi-P10-075-E1","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"any_opp","action":{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":1,"private":true,"reorder":false,"canTrash":true,"destination":{"location":"deck","owner":"self","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // ── (B) 「このシグニと共通する色を持たない他の＜天使＞がある場合」＝`HAS_CARD_IN_FIELD{colorNotMatchesSource}` ──
  // 🔴旧 live は `else` 枝が**無条件**で、原文の①（1枚引く／1枚エナ）が**条件を満たさなくても必ず通っていた**。
  //   受け皿は 2026-08-31 続き748 で新設済み（`WX21-032-E1` が使っている式と同じ）。

  // SP27-012 ／ 原文【自】：このシグニがアタックしたとき、**あなたの場にこのシグニと共通する色を持たない
  //   他の＜天使＞のシグニがある場合**、カードを１枚引く。**それぞれ共通する色を持たない＜天使＞が３体ある場合**、
  //   代わりにカードを２枚引く。
  'SP27-012': [
    {"effectId":"SP27-012-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"NO_COMMON_COLOR_AMONG_FIELD_SIGNI","owner":"self","count":3,"filter":{"cardType":"シグニ","story":"天使"}},"then":{"type":"DRAW","owner":"self","count":2},"else":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"天使","colorNotMatchesSource":true},"excludeSelf":true,"minCount":1},"then":{"type":"DRAW","owner":"self","count":1}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX21-039 ／ 原文は SP27-012 と同型（引く→エナゾーンに置く）。
  'WX21-039': [
    {"effectId":"WX21-039-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"NO_COMMON_COLOR_AMONG_FIELD_SIGNI","owner":"self","count":3,"filter":{"cardType":"シグニ","story":"天使"}},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2},"else":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"天使","colorNotMatchesSource":true},"excludeSelf":true,"minCount":1},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ── (C) 単発の受け皿配線 ──

  // PR-322 ／ 原文【起】《アタックフェイズアイコン》エクシード２：あなたのトラッシュから黒のシグニ１枚を対象とし、
  //   **それを場に出すかあなたの手札から黒のシグニ１枚を場に出す**。この方法で場に出たシグニの【出】能力は発動しない。
  // 🔴旧 live＝手札枝が丸ごと落ちて**トラッシュからしか出せなかった**（選択肢が1つ減る過少実行）。
  'PR-322': [
    {"effectId":"PR-322-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"トラッシュから黒のシグニ1枚を場に出す","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}},"suppressOnPlay":true}},{"choiceId":"c1","label":"手札から黒のシグニ1枚を場に出す","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"HAND_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}},"suppressOnPlay":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WD21-017 ／ 原文【自】：このシグニが**効果か**レゾナの出現条件**によって**、バニッシュされるか
  //   場からトラッシュに置かれたとき、対戦相手のパワー3000以下のシグニ１体を対象とし、それをバニッシュする。
  // 🔴旧 live＝原因の限定が丸ごと無く、**バトルでバニッシュされただけでも**発火していた（過剰発火）。
  //   受け皿は既存の `triggerCondition.byEffect`（`ON_TRASH` / `ON_BANISH` の両 collector が消費）。
  // ⚠**レゾナの出現条件（＝コスト支払い）側は拾えない**（コスト経路は `byEffect` を立てない）＝`PARTIAL`。
  //   過小側へ倒す判断＝現状の「何でも発火」より原文に近い。§5.4(ii) に登録。
  'WD21-017': [
    {"effectId":"WD21-017-E1","effectType":"AUTO","timing":["ON_TRASH","ON_BANISH"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL","triggerCondition":{"fromZones":["field"],"byEffect":true}},
  ],

  // WX14-057 ／ 原文【出】：対戦相手のパワー3000以下のシグニ**１体を対象とし**、あなたのトラッシュに
  //   カード名に《フレイスロ》を含むシグニが５枚以上ある場合、それをバニッシュする。
  // 🔴旧 live＝条件成立後に対象を選ぶ形＝**条件を満たさないと対象宣言そのものが起きない**。
  //   原文は先に対象を取るので「対象になったとき」のトリガーが噛み合わなくなる。
  //   受け皿は既存の `SELECT_TARGET_ONLY` → `STORE_LAST_PROCESSED_TARGETS` → 帰結 `{targetsStored}`。
  'WX14-057': [
    {"effectId":"WX14-057-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":3000}}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"CONDITIONAL","condition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardName":"フレイスロ"},"minCount":5},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WDK15-008 ／ 原文：**あなたのシグニの下から**カードを合計２枚までトラッシュに置く。その後、
  //   この方法でトラッシュに置いたカード１枚につき対戦相手のシグニ１体を対象とし、それらをバニッシュする。
  // 🔴旧 live＝**自分のシグニ本体を1体、必ず**トラッシュに置いていた（下のカードではなく盤面が減る別物）。
  //   受け皿は既存の `TAKE_FROM_UNDER_SIGNI`（`fromThis` を付けなければ自分の全スタックの下が候補）。
  'WDK15-008': [
    {"effectId":"WDK15-008-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TAKE_FROM_UNDER_SIGNI","destination":"trash","count":2,"upToCount":true},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":{"$ref":"last_processed_count"},"filter":{"cardType":"シグニ"},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-P11-077 ／ 原文【自】：あなたのアタックフェイズ開始時、このシグニの下からカードを**好きな枚数**
  //   トラッシュに置く。この方法でトラッシュに置いたカード１枚につき対戦相手のデッキの上から１枚トラッシュに置く。
  // 🔴旧 live＝上限が原文に無い **9枚固定**（10枚積んだら1枚取り残す）。新設 `count:'ALL'` で候補全部を上限にする。
  'WXDi-P11-077': [
    {"effectId":"WXDi-P11-077-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"TAKE_FROM_UNDER_SIGNI","destination":"trash","count":"ALL","upToCount":true,"fromThis":true},{"type":"MILL","owner":"opponent","count":0,"countPerLastProcessed":1}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX21-046 ／ 原文【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、あなたのトラッシュから
  //   **それぞれコストの合計が異なるスペル３枚**をデッキに加えてシャッフルする。そうした場合、〜
  // 🔴旧 live＝**任意のカード3枚**（スペル指定もコスト相互差異も無し）＝支払いが実質タダになっていた。
  'WX21-046': [
    {"effectId":"WX21-046-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":3,"filter":{"cardType":"スペル"},"selectionConstraint":{"distinct":"costSum"}},"shuffle":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000,"duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // SP24-010 ／ 原文：…その後、あなたのエナゾーンから《アクセアイコン》を持つシグニ１枚を対象とし、
  //   **それをこの方法で場に出したシグニの【アクセ】にしてもよい**。
  // 🔴旧 live＝`GRANT_KEYWORD{keyword:'アクセ'}`＝**エナのカードは1枚も動かず**、場の任意のシグニに
  //   「アクセ」という語だけが恒久で付いていた。新設 `targetsLastProcessed`＋`optional` で照応と任意性を持たせる。
  'SP24-010': [
    {"effectId":"SP24-010-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":2},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"調理"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2},{"type":"ATTACH_ACCE","targetSigniOwner":"self","sourceOwner":"self","fromEnergy":true,"signiFilter":{"cardType":"シグニ","hasIcon":"アクセ"},"targetsLastProcessed":true,"optional":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],

  // WX13-052 ／ 原文【自】：このシグニが対戦相手のシグニ１体をバニッシュしたとき、あなたのデッキの一番上を公開する。
  //   それが＜遊具＞のシグニの場合、このシグニをバニッシュしてもよい。**そうした場合、この効果で公開した
  //   シグニをダウン状態で場に出す。**
  // 🔴旧 live＝最後の「公開したシグニをダウン状態で場に出す」が丸ごと無く、**自分をバニッシュして終わり**
  //   という損しかしないカードになっていた。
  'WX13-052': [
    {"effectId":"WX13-052-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_OPPONENT"],"triggerScope":"self","action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","story":"遊具"},"pickCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ADD_TO_FIELD","owner":"self","asDown":true}}]},"remainder":{"location":"deck","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P00-021 ／ 原文【出】：**あなたの場にあるいずれかのシグニと共通するクラスを持つ**対戦相手のシグニ１体を
  //   対象とし、それをエナゾーンに置く。そうした場合、【エナチャージ１】をする。
  // 🔴旧 live＝クラス条件が落ちて**相手のどのシグニでも**エナ送りにできた。
  //   新設 `TargetFilter.classMatchesAnyFieldSigni`（`nameMatchesAnyFieldSigni` のクラス版の兄弟）。
  'WXDi-P00-021': [
    {"effectId":"WXDi-P00-021-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","classMatchesAnyFieldSigni":true}}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX19-031 ／ 原文【自】：あなたの**センタールリグ**がアタックしたとき、このシグニを場からトラッシュに
  //   置いてもよい。そうした場合、そのルリグをアップする。
  // 🔴旧 live＝`triggerScope:'any_ally'` だけで、**アシストルリグのアタックでも**誘発していた（過剰発火）。
  'WX19-031': [
    {"effectId":"WX19-031-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"triggerScope":"any_ally","triggerCondition":{"centerLrigOnly":true},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_TRASH_SELF"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX24-P4-102 ／ 原文【自】《相手ターン》《ターン１回》：このシグニが**対戦相手の**、能力か効果の対象に
  //   なったとき、【エナチャージ１】をする。
  // 🔴旧 live＝**誰の効果でも**発火＝自分の効果で自分のシグニを対象にしただけでエナが増えた。
  'WX24-P4-102': [
    {"effectId":"WX24-P4-102-E1","effectType":"AUTO","timing":["ON_TARGETED"],"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"turnOwner":"opponent","targetedByOpponent":true},"usageLimit":"once_per_turn"},
  ],

  // WXDi-P05-008 ／ 原文【出】：あなたの場にいる**アシストルリグのレベルの合計１につき**【エナチャージ１】をする。
  // 🔴旧 live＝比例が落ちて**常に1枚**（レベル2+2でも1枚）。新設 `$ref:'assist_lrig_level_sum'`。
  'WXDi-P05-008': [
    {"effectId":"WXDi-P05-008-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":{"$ref":"assist_lrig_level_sum"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-D04-004 ／ 原文（付与される【自】）：このルリグがアタックしたとき、**そのアタック終了時、そのアタックに
  //   よって対戦相手にダメージが与えられていなかった場合**、あなたのアップ状態のレベル２のルリグ１体を
  //   ダウンしてもよい。そうした場合、**このルリグを**アップする。
  // 🔴旧 live＝①アタック時に即実行（終了時でもダメージ無し条件でもない） ②アップ対象が「自分のルリグ1体」。
  // 🔑受け皿は**既存の** `ON_GUARD` ＋ `triggerCondition.lrigAttackNoDamage`（2026-08-31 続き749 で新設済み）。
  // ⚠発火地点は【ガード】された経路だけ＝バリア等でダメージが消えた場合は拾えない（過小側）＝`PARTIAL`。
  'WXDi-D04-004': [
    {"effectId":"WXDi-D04-004-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXDi-D04-004-sub-E1","effectType":"AUTO","timing":["ON_GUARD"],"triggerCondition":{"lrigAttackNoDamage":true},"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"LRIG","owner":"self","count":1,"filter":{"isUp":true,"level":2}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"UP","target":{"type":"LRIG","owner":"self","count":1,"filter":{"thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL"}],"rawText":"【自】：このルリグがアタックしたとき、そのアタック終了時、そのアタックによって対戦相手にダメージが与えられていなかった場合、あなたのアップ状態のレベル２のルリグ１体をダウンしてもよい。そうした場合、このルリグをアップする。"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"PARTIAL","usageLimit":"once_per_game"},
  ],

  // ── (D) 「あなたのレベル３のルリグ１体を対象とし」＝使用条件へレベル3を足す（ピース3枚） ──
  // 🔴旧 live＝使用条件が「チーム全員レベル１以上」だけで、**レベル1のセンターでも撃てた**。
  //   `GRANT_LRIG_ABILITY` の付与先は常にセンタールリグなので、**センターがレベル3であること**を
  //   使用条件に足すのが原文の「レベル３のルリグ１体を対象とし」の忠実表現になる。
  // ⚠**`eq 3` ではなく `gte 3`** にする＝原文は対象の資格（レベル3のルリグ）であって上限ではない。

  'WXDi-D03-011': [
    {"effectId":"WXDi-D03-011-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"condition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"NoLimit","operator":"gte","value":3},{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":3}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXDi-D03-011-sub-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"WXDi-D03-011-sub-E2","effectType":"CONTINUOUS","action":{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"GUARD","until":"END_OF_TURN"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【常】：【ダブルクラッシュ】【常】：対戦相手は【ガード】ができない。","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  'WXDi-D05-011': [
    {"effectId":"WXDi-D05-011-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"condition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"うちゅうのはじまり","operator":"gte","value":3},{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":3}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXDi-D05-011-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"選択肢2","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}}}],"countChoose":{"count":{"$ref":"opp_lrig_level"}},"allowRepeat":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【自】：このルリグがアタックしたとき、以下の２つから１つを選ぶ。この効果を対戦相手のセンタールリグのレベルと同じ回数行う。①カードを１枚引く。②対戦相手の手札を１枚見ないで選び、捨てさせる。","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  'WXDi-D06-011': [
    {"effectId":"WXDi-D06-011-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"condition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"DIAGRAM","operator":"gte","value":3},{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":3}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXDi-D06-011-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":15}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","noGuard":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【自】：このルリグがアタックしたとき、以下の２つから１つを選ぶ。①対戦相手のデッキの上からカードを１５枚トラッシュに置く。②あなたのトラッシュから《ガードアイコン》を持たないシグニを３枚まで対象とし、それらを手札に加える。","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // 意味照合 段2（2026-08-31 続き757）＝「受け皿は在るのに JSON が指していない」8件
  // 🔑新設した engine 語彙は **`SelectionConstraint.same:'power'` と `TargetFilter.powerEqTrigger` の2つだけ**。
  //   残りは既存の `OR` / `HAS_CARD_IN_FIELD` / `ATTACH_ACCE.fromEnergy` / `GRANT_PLAYER_ABILITY` /
  //   `GRANT_LRIG_ABILITY` へ**配線しただけ**。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX13-013 ／ 原文：**同じパワーを持つ**シグニ３体を対象とし、それらをバニッシュする。
  //   （自分のシグニを含んでもよい。合計２体以下のシグニに使用することはできない）
  // 🔴旧 live＝制約が丸ごと無く、**盤面のどのシグニ3体でも**薙ぎ払えた（赤1エナの全体除去）。
  // 🔑新設 `selectionConstraint.same:'power'`＝`same:'level'` の兄弟（印刷パワーで比較する近似）。
  'WX13-013': [
    {"effectId":"WX13-013-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":3,"filter":{"cardType":"シグニ"},"upToCount":false,"selectionConstraint":{"same":"power"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX21-010 ／ 原文：**同じパワーを持つ**対戦相手のシグニ２体を対象とし、それらをバニッシュする。
  //   その後、それらに白か黒のシグニが１体以上含まれる場合、対戦相手は自分のエナゾーンからカード２枚を
  //   対象とし、それらをトラッシュに置く。
  // 🔴旧 live＝「同じパワー」が落ちて**相手のどの2体でも**選べた。
  // ⚠後段のエナ2枚は**対戦相手が選ぶ**（原文「対戦相手は自分のエナゾーンから…対象とし」）。
  'WX21-010': [
    {"effectId":"WX21-010-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":2},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":false,"selectionConstraint":{"same":"power"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","color":["白","黒"]},"minCount":1},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":2},"opponentSelects":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX17-046 ／ 原文【自】英知＝７：このシグニがシグニ１体をバニッシュしたとき、**バニッシュしたシグニと
  //   同じパワーを持つ**対戦相手のシグニ１体を対象とし、それをバニッシュする。
  // 🔴旧 live＝パワー条件が落ちて**相手のどのシグニでも**連鎖バニッシュできた。
  // 🔑新設 `TargetFilter.powerEqTrigger`＝トリガー元（＝バニッシュされたシグニ）と同値へ解決。
  //   ⚠**参照不能なら空ヒット**（fail-closed）＝`powerLteTrigger` の fail-open を真似ない。
  'WX17-046': [
    {"effectId":"WX17-046-E2","effectType":"AUTO","timing":["ON_SIGNI_BANISH_OPPONENT"],"activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":7},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerEqTrigger":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],

  // WX24-P4-003 ／ 原文：対戦相手のシグニ１体を対象とし、それを手札に戻す。あなたのトラッシュから
  //   **それと同じパワーの**シグニ１枚を対象とし、それを手札に加える。
  // 🔴旧 live＝パワー条件が落ちて**トラッシュのどのシグニでも**回収できた。
  // 🔑`powerEqTrigger` はトリガー元が無ければ `lastProcessedCards[0]`（＝直前に手札へ戻したシグニ）を見る。
  'WX24-P4-003': [
    {"effectId":"WX24-P4-003-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":1},{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerEqTrigger":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX20-002 ／ 原文【起】《ターン１回》《アタックフェイズアイコン》《緑×0》：**あなたのエナゾーンから**
  //   対象の《アクセアイコン》を持つカード１枚を対象のあなたのシグニ１体の【アクセ】にする。
  // 🔴旧 live＝`GRANT_KEYWORD{keyword:'アクセ'}`＝**エナのカードは1枚も動かず**、場のシグニに
  //   「アクセ」という語だけが付いていた（＝アクセ機構としては完全な no-op）。
  // 🔑受け皿は**既存の** `ATTACH_ACCE.fromEnergy`（2026-08-31 続き748 で新設・エナ札→ホストの2段選択）。
  'WX20-002': [
    {"effectId":"WX20-002-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"ATTACH_ACCE","targetSigniOwner":"self","sourceOwner":"self","fromEnergy":true,"signiFilter":{"hasIcon":"アクセ"},"targetFilter":{"cardType":"シグニ"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WXDi-P08-068 ／ 原文：このスペルは**あなたの場に《羅星姫　タマゴ//メモリア》か《羅星　ノヴァ//メモリア》か
  //   《翠魔　バン//メモリア》があるか、対戦相手の手札が１枚以下の場合**にしか使用できない。
  // 🔴旧 live＝3種のシグニ枝が丸ごと落ち、しかも手札条件が `eq 1`＝**ちょうど1枚のときだけ**使えた
  //   （0枚では撃てず、指定シグニが並んでいても撃てない＝両方向に外れていた）。
  // 🔑受け皿は既存の `OR` ＋ `HAS_CARD_IN_FIELD{filter.cardName}`（`cardName` は部分一致）。
  'WXDi-P08-068': [
    {"effectId":"WXDi-P08-068-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"condition":{"type":"OR","conditions":[{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"羅星姫　タマゴ//メモリア"}},{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"羅星　ノヴァ//メモリア"}},{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"翠魔　バン//メモリア"}},{"type":"HAND_COUNT","owner":"opponent","operator":"lte","value":1}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXK03-008（キー）／ 原文【常】：**あなたのセンタールリグは以下の能力を得る。**【起】…【自】：対戦相手の
  //   ターン終了時、対戦相手のシグニ１体を対象とし、それを凍結する。
  // 🔴旧 live＝2本目の【自】が**キー自身の独立した自動能力**として立っていた＝原文の「センタールリグが得る」
  //   という帰属が消え、ルリグが能力を失う効果を受けても凍結だけが残る別物になっていた。
  // 🔑受け皿は同カードの E1 が既に使っている `GRANT_LRIG_ABILITY`（engine 変更なし）。
  'WXK03-008': [
    {"effectId":"WXK03-008-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXK03-008-E3-G","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_opp"}],"rawText":"【自】：対戦相手のターン終了時、対戦相手のシグニ１体を対象とし、それを凍結する。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P11-003（ピース）／ 原文【使用条件】【ドリームチーム】合計３種類以上の色を持つ
  //   **このゲームの間、あなたは以下の能力を得る。**『【自】：あなたのメインフェイズ開始時、以下の３つから
  //   まだ選んでいないもの１つを選ぶ。①カードを２枚引く。②【エナチャージ２】③あなたの**トラッシュから**
  //   シグニ１枚を対象とし、それをデッキの一番上に置く。』
  // 🔴旧 live＝①使用条件（ルリグ3体で3色以上）が無い ②「このゲームの間の付与」が落ちて**使用時に1回だけ
  //   選択肢を即時実行** ③原文に無い `GRANT_KEYWORD{keyword:'使用条件'}` を自分のシグニ1体へ付けていた
  //   ④選択肢③の移動元が**場のシグニ**（トラッシュではない）＝自分の盤面を自らデッキへ戻していた。
  // 🔑受け皿はすべて既存＝`GRANT_PLAYER_ABILITY{permanent:true}` ＋ `ON_MAIN_PHASE_START` ＋
  //   `FIELD_LRIG_COLOR_COUNT{minLrigs:3}`（同型の `WXDi-P06-003`／`WXDi-P14-003` が使っている）。
  // 🆕**2026-09-01 続き760＝「まだ選んでいないもの」を実装した**（`ChooseAction.noRepeat` ＋
  //   `PlayerState.taken_choice_keys`）。🔴無いあいだは**毎メインフェイズに同じ選択肢（例＝2枚ドロー）を
  //   取り続けられた**（このゲームの間ずっと有効な付与なので影響が大きい）。
  // 🔑**マーカーは実行時に組む**＝`execChoose` が各枝を `SEQUENCE[本体, STUB{INTERNAL_MARK_CHOICE_TAKEN}]` へ
  //   包むので **live JSON には `noRepeat` しか出ない**（`census:stubs` C群を汚さない）。
  // ⚠`taken_choice_keys` は**ターン境界でリセットしない**（原文は「このゲームの間」）。
  'WXDi-P11-003': [
    {"effectId":"WXDi-P11-003-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"condition":{"type":"FIELD_LRIG_COLOR_COUNT","owner":"self","operator":"gte","value":3,"minLrigs":3},"action":{"type":"GRANT_PLAYER_ABILITY","abilities":[{"effectId":"WXDi-P11-003-E1-GRANT","effectType":"AUTO","timing":["ON_MAIN_PHASE_START"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"カードを2枚引く","action":{"type":"DRAW","owner":"self","count":2}},{"choiceId":"c1","label":"【エナチャージ2】","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2}},{"choiceId":"c2","label":"トラッシュのシグニ1枚をデッキの一番上に置く","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"shuffle":false,"position":"top"}}],"noRepeat":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【自】：あなたのメインフェイズ開始時、以下の３つからまだ選んでいないもの１つを選ぶ。①カードを２枚引く。②【エナチャージ２】③あなたのトラッシュからシグニ１枚を対象とし、それをデッキの一番上に置く。","permanent":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-P10-063 ／ 原文：あなたのデッキの上からカードを３枚見る。その中から１枚を手札に加え、残りを好きな
  //   順番でデッキの一番上に戻す。**このスペルをチェックゾーンからあなたの《コードオーダー　エルドラ//メモリア》
  //   １体の下に置いてもよい。**
  // 🔴旧 live＝2文目が丸ごと落ちていた（スペルは普通にトラッシュへ行くだけ）。
  // 🔑受け皿は**既存の** `STUB{TRAP_OPERATION, trapOp:'under_signi', trapHostNames:[…]}`
  //   （`execStubPart2.ts:3367`＝ホストを選ぶ CHOOSE を出し、`INTERNAL_PLACE_SELF_UNDER_SIGNI` で
  //   効果元スペル自身をそのシグニの下へ置く。「スキップ（トラッシュへ）」の枝つき＝「置いてもよい」）。
  //   ⇒ engine は1行も足していない＝**受け皿はあったのに JSON が指していなかった**型。
  'WXDi-P10-063': [
    {"effectId":"WXDi-P10-063-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"top","reorder":true}},{"type":"STUB","id":"TRAP_OPERATION","trapOp":"under_signi","trapHostNames":["コードオーダー　エルドラ//メモリア"]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // SPK01-08 ／ 原文【出】：あなたのデッキの上からカードを４枚見る。その中から**３枚**を好きな順番で
  //   デッキの一番下に置き、**残りをトラッシュに置く**。
  // 🔴旧 live＝`LOOK_AND_REORDER{canTrash:true}` の裸＝**何枚トラッシュに置けるかが無制限**（4枚全部
  //   トラッシュに送れた）。⇒ 「トラッシュへ行くのは1枚」を `LOOK_PICK_CHAIN` の**ピック側**で表す
  //   （「3枚を下に置く」と「1枚をトラッシュに置く」は4枚公開では同値）。
  'SPK01-08': [
    {"effectId":"SPK01-08-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":4,"stages":[{"pickCount":1,"then":"trash","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 G（2026-08-31 続き749）＝**「次に」＝1回消費の耐性**
  // 🔑新しい機構は要らなかった＝既存の `BATTLE_BANISH_PREVENT_LOSE_ABILITY`（防いだら `abilities_removed`
  //   へ入る＝二度は防げない）が**まさに1回消費**。付与形が読まれるように collector を1箇所広げただけ。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX15-010 ／ 原文：ターン終了時まで、**あなたのすべての＜武勇＞のシグニは**
  //   「【常】：このシグニが**次に**バニッシュされる場合、バニッシュされない。」を得る。
  // 🔴旧 live＝`GRANT_PROTECTION{target:{count:1}}`＝**1体だけに、しかも回数無制限の**耐性
  //   （＜武勇＞限定も「次に1回」も落ちていた）。
  // 🏁**2026-09-02（§5.3 `O-164`）に「効果によるバニッシュ」経路まで届いた**＝原文は
  //   「バニッシュされる場合」で**発生源を限定していない**のに、受け皿はバトル経路しか読んでいなかった。
  // 🔴**効果経路の入口は2つある**＝`execBanish` の `applyBanish`（選択して撃つ本線）と
  //   `applyDirectAction` の `BANISH`（`targetsLastProcessed` 等）。続き760 は**後者にしか書いておらず**、
  //   「対象を選んで撃つと防げないのに、それ経由なら防げる」無言のズレが残っていた。
  //   ⇒ `applyBanishPreventShield` 1本へ集約して両方から通した。⇒ `PARTIAL` → `MANUAL`。
  // ⚠**1回消費は instance 単位**＝`abilities_removed` に積むのは肩代わりした `src`（＝`thisCardOnly` なら
  //   victim 自身）なので、＜武勇＞が複数いても**各自が1回ずつ**吸収する（原文どおり）。
  'WX15-010': [
    {"effectId":"WX15-010-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","story":"武勇"},"abilities":[{"effectId":"WX15-010-E1-G","effectType":"CONTINUOUS","action":{"type":"STUB","id":"BATTLE_BANISH_PREVENT_LOSE_ABILITY","banishPrevent":{"thisCardOnly":true}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 F（2026-08-31 続き749）＝**「同じレベル」のペア付け機構**
  // 新設は `SelectionConstraint.levelMultiset`（＋実行時に焼き込む `levelMultisetFromLastProcessed`）。
  // 🔴`levelEqLastProcessed`（「捨てたレベルの**どれか**に一致」）では**同じレベルをまとめてN体**取れて
  //   過剰実行になる＝旧「見送り契約」が守っていたのはそこ。多重集合の1対1割り当てで表す。
  // ══════════════════════════════════════════════════════════════════════════════

  // WDA-F02-07 ／ 原文：あなたの手札からそれぞれレベルの異なるシグニを３枚まで捨てる。その後、**この方法で
  //   捨てたシグニ１枚につきそれと同じレベルを持つ**対戦相手のシグニ１体を対象とし、それらをバニッシュする。
  //   （例えばレベル２とレベル３のシグニを捨てた場合レベル２のシグニ１体とレベル３のシグニ１体をバニッシュする）
  // 🔴旧 live＝**常に1体だけ**（3枚捨てても1体）＝原文の括弧書きの例がそのまま再現できなかった。
  'WDA-F02-07': [
    {"effectId":"WDA-F02-07-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ"},"selectionConstraint":{"distinct":"level"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":{"$ref":"last_processed_count"},"filter":{"cardType":"シグニ"},"upToCount":true,"selectionConstraint":{"levelMultisetFromLastProcessed":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX24-P2-036 ／ 原文：手札からシグニを好きな枚数捨てる。その後、**この方法で捨てたシグニ１枚につき
  //   そのシグニと同じレベルの**対戦相手のシグニ１体を対象とし、それらをダウンする。
  // 🔴旧 live＝**常に1体だけ**＋`levelEqLastProcessed`（どれかに一致）＝同じレベルの相手を何体でも選べた。
  'WX24-P2-036': [
    {"effectId":"WX24-P2-036-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":1},{"color":"無","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":{"$ref":"last_processed_count"},"filter":{"cardType":"シグニ"},"upToCount":true,"selectionConstraint":{"levelMultisetFromLastProcessed":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 E（2026-08-31 続き749）＝**`O-104` の据置契約を卒業**
  // 🔑据置の理由だった「候補が足りない盤面で確定ボタンが押せない（ソフトロック）」は
  //   **2026-08-30 続き732 で解消済み**（`fixedSelectionPickLimit` が候補数へクランプし、
  //   golden と実機 `softlockshortpick` の両方が回帰ガードになっている）。理由が死んだので採用する。
  // ⚠parser（fresh）は未対応のまま＝golden で「fresh は据置」を別途固定してある。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX07-039 ／ 原文【起】《青》《青》：対戦相手のシグニ１体を対象とし、**あなたの**＜原子＞のシグニ３体を
  //   バニッシュする。そうした場合、それをバニッシュする。
  // 🔴旧 live＝**相手の＜原子＞を1体バニッシュするだけ**（自分の3体という重い代償が消え、対象の宣言も無かった）。
  // 🆕**2026-09-02（索引 B 第2巡・`O-104`）＝「そうした場合」ゲートを実装した。**
  //   旧 live は `CONDITIONAL{IS_MY_TURN}`＝**自分のターンなら常に真**の偽ゲートだった＝
  //   ＜原子＞が1体も居なくても本体（相手シグニのバニッシュ）が通る＝**原文より強い**。
  //   `fixedSelectionPickLimit` が候補数へクランプするので中間動作は「払える分だけ」で成立してしまい、
  //   **払えたかどうかを判定する層が要る**＝直前ステップの処理枚数を見る `LAST_PROCESSED_COUNT_GTE{3}`。
  'WX07-039': [
    {"effectId":"WX07-039-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1},{"color":"青","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":3,"filter":{"cardType":"シグニ","story":"原子"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXEX1-14 ／ 原文【起】《アタックフェイズアイコン》《コインアイコン》：対戦相手のシグニ１体を対象とし、
  //   **あなたのエナゾーンから**＜植物＞のシグニ３枚をトラッシュに置く。そうした場合、それをエナゾーンに置く。
  // 🔴旧 live＝**相手の場の＜植物＞を1体トラッシュ**＝ゾーンも所有者も枚数も違う別のカードだった。
  // 🆕2026-09-02（索引 B 第2巡・`O-104`）＝`WX07-039-E2` と同じ「そうした場合」ゲート
  //   （`IS_MY_TURN` の偽ゲート → `LAST_PROCESSED_COUNT_GTE{3}`）。
  'WXEX1-14': [
    {"effectId":"WXEX1-14-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":3,"filter":{"cardType":"シグニ","story":"植物"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":3},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 D（2026-08-31 続き749）＝**遅延トリガーの残りの timing**
  // 新設は `collectGenericDelayedTriggers`（任意 timing を1本で収集）＋ `duration:'NEXT_TURN'`。
  // 🔴`delayed_triggers` を読む地点はイベントごとに手書きで増えてきたため、**足し忘れた timing は
  //   「設置しても永久に発火しない」無言 no-op** になっていた（ドロー／手札を捨てた／手札から公開した）。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX24-P4-017 ／ 原文【起】《ゲーム１回》アプリ《青×0》：《リコレクトアイコン》［４枚以上］
  //   **このターン、あなたがカードを１枚引くか、対戦相手が手札を１枚捨てたとき**、対戦相手のシグニ１体を
  //   対象とし、ターン終了時まで、それのパワーを－4000する。
  // 🔴旧 live＝遅延が丸ごと落ちて **`DRAW 1`（自分がカードを1枚引く）** に化けていた＝
  //   本来のパワー－4000が消えたうえ、原文に無いドローが増えるという二重の別物。
  // ⚠原文は「引く**か**捨てたとき」の OR＝遅延設置を**2本**置いて表す（どちらか片方で発火）。
  'WX24-P4-017': [
    {"effectId":"WX24-P4-017-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","once":true,"trigger":{"timing":"ON_DRAW"},"effect":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-4000,"duration":"UNTIL_END_OF_TURN"}},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","once":true,"trigger":{"timing":"ON_HAND_DISCARDED"},"effect":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-4000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],

  // WXK04-004 ／ 原文【起】《ゲーム１回》バーニング《コインアイコン》：**このターン、あなたが自分の効果によって
  //   手札から＜水獣＞のシグニを１枚以上公開したとき**、対戦相手のシグニ１体を対象とし、それをエナゾーンに置く。
  // 🔴旧 live＝遅延が丸ごと落ちて**撃った瞬間に相手シグニ1体をエナ送り**（条件を満たさなくても必ず通る）。
  'WXK04-004': [
    {"effectId":"WXK04-004-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":1},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","once":true,"trigger":{"timing":"ON_REVEALED_FROM_HAND","triggerFilter":{"cardType":"シグニ","cardClass":"水獣"}},"effect":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],

  // WX14-018 ／ 原文【起】エクシード２：**次のターンの間**、対戦相手のシグニ１体がアタックしたとき、
  //   そのアタック終了時にそのシグニをバニッシュする。
  // 🔴旧 live＝遅延も期間も落ちて**その場で相手シグニ1体をバニッシュ**（メインフェイズの確定除去に化けていた）。
  // 🔑新設 `duration:'NEXT_TURN'`＝ターン終了時に `'THIS_TURN'` へ**降格**して次のターンだけ効く
  //   （降格させることで次のターン終了時には確実に消える＝2ターン残さない）。
  // 🆕**2026-09-02（索引B 第1巡・§5.3 `O-181`）＝`attackEnd:true` を追加。**
  //   🔴旧は「そのアタック終了時に」が落ちて**アタック宣言時にバニッシュ**していた＝
  //   バニッシュした時点で**そのアタック自体が起きない**（バトルもライフクラッシュも発生しない）＝
  //   原文（バトル解決**後**に落とす）より明確に強い過剰実行だった。
  //   収集は `collectAttackEndDelayedTriggers`（宣言時の2本は `attackEnd` を読み飛ばす）。
  'WX14-018': [
    {"effectId":"WX14-018-E4","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":2},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"NEXT_TURN","trigger":{"timing":"ON_ATTACK_SIGNI","attackerOwner":"opponent","attackEnd":true},"effect":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isTriggerSource":true},"upToCount":false}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX21-025 神罠　フーディナ（§5.3 `O-59` 構造整理・2026-09-02 索引B 第1巡）
  // 原文【自】：対戦相手のシグニ１体が【トラップ】のあるシグニゾーンに出たとき、**そのシグニとその【トラップ】**を
  //   トラッシュに置く。／【出】：対戦相手のシグニ１体を対象とし、それを【トラップ】としてそのシグニゾーンに設置する。
  //   ／【トラップアイコン】対戦相手のシグニ１体を対象とし、手札から＜トリック＞のシグニを２枚捨てるか
  //   《青》《青》を支払ってもよい。そうした場合、それを【トラップ】としてそのシグニゾーンに設置する。
  // 🔴**旧 live は3つの能力が2つに混線していた**＝
  //   ①E1 が `TRASH{opponent シグニ1体}` 単独＝**トリガー元ではない別のシグニを選べる**うえ
  //     「**その【トラップ】**」が丸ごと落ちていた（過剰＋過小）。
  //   ②E2 に**【トラップアイコン】の本文が流れ込んで**おり、`SET_OPP_SIGNI_AS_TRAP`（正しく動く【出】）の後ろに
  //     `GRANT_KEYWORD{トラップアイコン→自分}` と `TRAP_OPERATION{trapFixedZone:'source'}`（保留ログだけ）が続いて
  //     **同じ設置を2回書いている**状態だった。
  //   ③その結果、**このカードには `TRAP_ICON` 効果が1つも無かった**（アイコンが発動しても何も起きない）。
  // 🔑`SET_OPP_SIGNI_AS_TRAP` は「居たゾーンの添字をそのまま使う」ので**そのシグニゾーン設置は既に正しい**
  //   （2026-09-02 の実測。固定ゾーン指定の口を新設してはいけない）。
  'WX21-025': [
    {"effectId":"WX21-025-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_opp","triggerCondition":{"placedOnTrapZone":true},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"targetsTriggerSource":true},{"type":"STUB","id":"TRAP_OPERATION","trapOp":"trash","trapZoneOfTriggerSource":true}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX21-025-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"STUB","id":"SET_OPP_SIGNI_AS_TRAP"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX21-025-TRAP","effectType":"TRAP_ICON","timing":["ON_TRAP_ACTIVATE"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","additionalCostChoices":[{"id":"pay_blue","label":"《青》《青》を支払う","costColors":["青","青"],"action":{"type":"STUB","id":"SET_OPP_SIGNI_AS_TRAP","targetsStored":true}},{"id":"discard_trick","label":"手札から＜トリック＞のシグニ2枚を捨てる","costColors":[],"handDiscard":{"count":2,"filter":{"cardType":"シグニ","story":"トリック"}},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2,"filter":{"cardType":"シグニ","story":"トリック"}},"asCost":true},{"type":"STUB","id":"SET_OPP_SIGNI_AS_TRAP","targetsStored":true}]}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX25-CP1-012 ／ 原文【自】：あなたのルリグかシグニが**アタックによって**対戦相手のライフクロスを
  //   １枚以上クラッシュしたとき、**そのアタック終了時**、対戦相手が《無》を支払わないかぎり、
  //   対戦相手にダメージを与える。（§5.3 `O-181` 軸(b)・2026-09-02）
  // 🔴旧 live＝`timing:['ON_OPP_LIFE_CRASHED']` の即時発火＝2つ同時に壊れていた：
  //   ①「アタックによって」の限定が無く**効果によるクラッシュでも撃てた**（過剰）
  //   ②「そのアタック終了時」ではなく**クラッシュした瞬間**に割り込んでいた（バトルの解決前）。
  // 🔑受け皿は `ON_ATTACK_END` ＋ `triggerCondition.attackCrashedLife`（新設）。
  // ⚠🔴**`triggerScope:'any_ally'` が必須**＝このカードは**ルリグ**で、アタッカーは自分のシグニでもよい。
  //   既定 `'self'` だと `collectAttackEndTriggers` の watcher 走査（明示 opt-in のみ）に載らず**永久に不発火**。
  // ⚠`CONDITIONAL{IS_MY_TURN}` は `OPPONENT_PAY_OPTIONAL` 標準ペアの**プレースホルダ**（live 77効果と同じ形）＝
  //   SEQUENCE 側が `conditional.then` を支払わなかった枝へ直結するので条件式は評価されない。触らない。
  'WX25-CP1-012': [
    {"effectId":"WX25-CP1-012-E1","effectType":"AUTO","timing":["ON_ATTACK_END"],"triggerScope":"any_ally","triggerCondition":{"attackCrashedLife":true},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPPONENT_PAY_OPTIONAL","costColors":["無"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 C（2026-08-31 続き749）＝**自分のライフクロスのクラッシュ置換**
  // 新設は `PlayerState.self_crash_to_trash_and_refill`（回数制）＋ STUB ハンドラ1本
  // `SELF_CRASH_TO_TRASH_AND_REFILL`、消費は `performLifeBurstResponse`（チェックゾーン解決の1点）。
  // ⚠既存の `crash_to_trash_instead` とは**向きが逆**（あちらは攻撃側が相手のクラッシュ先を変えるターン継続）。
  // ══════════════════════════════════════════════════════════════════════════════

  // WD06-009 ／ 原文【出】《青》：あなたのライフクロス１枚をクラッシュする。**この方法でチェックゾーンに
  //   置かれたカードがエナゾーンに置かれる場合、代わりにそれをトラッシュへ置きあなたのデッキの一番上の
  //   カードをライフクロスに加える。**
  // 🔴旧 live＝置換が落ちて「ライフを1枚割る＋デッキの上をライフに足す」の**2動作を無条件に**行っていた＝
  //   割ったカードはエナへ行き、ライフは減らないのに**エナが増える**という原文と別物の得札になっていた。
  // 🔑置換は**クラッシュより先に**設置する（後だと自分のクラッシュに間に合わない）。
  'WD06-009': [
    {"effectId":"WD06-009-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELF_CRASH_TO_TRASH_AND_REFILL","value":1},{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX20-043 ／ 原文【自】：あなたのアタックフェイズ開始時、あなたのトラッシュにカード名に《デメニギス》を含む
  //   カードがある場合、あなたのライフクロス１枚を**クラッシュしてもよい**。（以下 WD06-009 と同じ置換）
  // 🔴旧 live＝①「してもよい」が落ちて**強制**（毎ターン必ず自分のライフが減る） ②置換が落ちて上と同じ別物に。
  'WX20-043': [
    {"effectId":"WX20-043-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","condition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardName":"デメニギス"}},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELF_CRASH_TO_TRASH_AND_REFILL","value":1},{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true,"optional":true}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 B（2026-08-31 続き749）＝ルリグアタック終了時の条件 と コスト増の比例
  // ══════════════════════════════════════════════════════════════════════════════

  // WXK11-006（キー）／ 原文【自】《ターン１回》：センタールリグ１体がアタックしたとき、そのアタック終了時、
  //   **そのアタックがすべて【ガード】されていた場合**、そのルリグをアップする。
  // 🔴旧 live＝`ON_ATTACK_SIGNI`＝**シグニのアタックのたび無条件にルリグをアップ**（毎ターン実質2回アタック）。
  // 🔑受け皿は**既存の** `ON_GUARD` ＋ `triggerCondition.lrigAttackGuarded`（`collectLrigAttackGuardedTriggers`）。
  //   ⚠あの collector は**センタールリグしか走査していなかった**ので、キー／場のシグニも見るように広げた。
  // 🆕WXK11-006-E1-G ／ 原文「**対戦相手は自分のトラッシュから**対象のシグニを１枚まで手札に加える。」
  //   🔴旧 live＝`TRASH_CARD owner:'self'`＝**自分のトラッシュから自分の手札へ**＝主語が真逆
  //     （相手にシグニを返させるデメリット節が、自分へのアドバンテージに化けていた）。
  //   ⚠もう1件の finding（「ルリグ1体とシグニ1体に分けられていない」）は **`selectionConstraint.groups` で
  //     既に実装済み**＝較正。
  'WXK11-006': [
    {"effectId":"WXK11-006-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXK11-006-E1-G","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_KEYWORD","target":{"type":"CENTER_LRIG_OR_SIGNI","owner":"opponent","count":2,"selectionConstraint":{"groups":[{"filter":{"cardType":"ルリグ"},"count":1},{"filter":{"cardType":"シグニ"},"count":1}]}},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"opponent","count":1,"upToCount":true,"filter":{"cardType":"シグニ"}}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO"},{"effectId":"WXK11-006-E1-G2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"}},"optional":false},{"type":"ADD_TO_LIFE","owner":"opponent","count":1,"fromTop":false,"fromTrash":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK11-006-E4","effectType":"AUTO","timing":["ON_GUARD"],"triggerCondition":{"lrigAttackGuarded":true},"action":{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WX24-P3-055 ／ 原文【自】《ターン１回》：ルリグ１体がアタックしたとき、そのアタック終了時、**そのアタックに
  //   よってそのルリグがダメージを与えていなかった場合**、あなたは【エナチャージ１】をする。
  // 🔴旧 live＝`ON_ATTACK_SIGNI`＝**シグニのアタックのたび無条件にエナチャージ**。
  // ⚠新設 `lrigAttackNoDamage` の発火地点は**【ガード】された経路だけ**＝バリア等でダメージが消えた場合は
  //   発火しない（過小側へ fail-closed）＝`PARTIAL`。§5.4(ii) に登録。
  'WX24-P3-055': [
    {"effectId":"WX24-P3-055-E2","effectType":"AUTO","timing":["ON_GUARD"],"triggerCondition":{"lrigAttackNoDamage":true},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL","usageLimit":"once_per_turn"},
  ],

  // WXEX2-02 ／ 原文【常】：対戦相手のルリグの【起】能力の使用コストは、**対戦相手の場にある凍結状態の
  //   シグニ１体につき**《無×1》増える。
  // 🔴旧 live＝比例が落ちて**常に《無×1》固定**（凍結が0体でも増え、3体でも1しか増えない）。
  // 🔑新設 `COST_INCREASE.amountFromZone`＝0枚なら**増加なし**（`amount` をそのまま積むと固定値に化ける）。
  'WXEX2-02': [
    {"effectId":"WXEX2-02-E1","effectType":"CONTINUOUS","action":{"type":"COST_INCREASE","targetCardType":"ルリグ","targetOwner":"opponent","amount":[{"color":"無","count":1}],"amountFromZone":{"zone":"field","owner":"opponent","filter":{"cardType":"シグニ","isFrozen":true}},"duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第10弾 A（2026-08-31 続き749）＝**正面参照**の3件
  // 新設は `FieldGrantCondition.FRONT_SIGNI_POWER_GTE` ／ `TargetFilter.frontOfAllyWithSoul` ／
  // `triggerCondition.attackedNotFront` の3つだけ。どれも**ゾーン対応（my zi ↔ opp 2-zi）**なので
  // `matchesFilter`（CardData 単体）では表せず、評価する地点を1つずつ決めてある。
  // ══════════════════════════════════════════════════════════════════════════════

  // WD15-007 ／ 原文：このターン、あなたのシグニは、**その正面のシグニのパワーが12000以上であるかぎり**、
  //   【アサシン】を得る。（このアーツの後に場に出たシグニもこの効果の影響を受ける）
  // 🔴旧 live＝条件が丸ごと落ちて**無条件に全シグニが【アサシン】**（アーツ1枚で盤面が確定する壊れ札に）。
  // 🔑**場レベル grant（`field_grants_active`）で持つ**＝per-signi 付与に落とすと ①条件が解決時点で焼き込まれ
  //   ②括弧書き「このアーツの後に場に出たシグニも影響を受ける」が死ぬ。⚠正面が空なら不成立。
  'WD15-007': [
    {"effectId":"WD15-007-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":3},{"color":"無","count":2}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL"},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN","fieldCondition":{"type":"FRONT_SIGNI_POWER_GTE","value":12000}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],



  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 G（2026-08-31 続き748）＝遅延 ON_PLAY と「1体につき1つ選ぶ」
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-P09-010 ／ 原文【起】《ゲーム１回》《黒×0》：**このターン、あなたのシグニ１体が効果によって場に出たとき**、
  //   対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－8000する。
  // 🔴旧 live＝遅延が丸ごと落ちて**撃った瞬間に －8000**（条件を満たさなくても必ず通る）。
  // 🔑`collectFieldTriggers` に**同じイベントの遅延トリガー収集**を1箇所足した＝それまで ON_PLAY／ON_BLOOM の
  //   遅延は**設置しても永久に発火しない**（設置系の死角）。`placedByEffect` で「効果によって」を限定する。
  'WXDi-P09-010': [
    {"effectId":"WXDi-P09-010-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_PLAY","placedByEffect":true,"triggerFilter":{"cardType":"シグニ"}},"effect":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000,"duration":"UNTIL_END_OF_TURN"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],

  // WXDi-P10-036 ／ 原文【自】：あなたのアタックフェイズ開始時、以下の２つから**あなたの場にあるレベル１の
  //   シグニ１体につき**１つ選ぶ。①…②…
  // 🔴旧 live＝比例が落ちて**常に1つだけ**（レベル1が3体いても1つ）。
  // 🔑受け皿は**既存の** `ChooseAction.countChoose.countFromZone`（`effectExecutor.ts:5681` が
  //   `resolveCountRef` で解決して `choose_count` を上書き・逆翻訳も `countFromZonePerJa` で対応済み）。
  //   🔴**新しい型を足す前に受け皿を疑え**（PLAN §5.3）＝一度 `chooseCountFromZone` を新設しかけたが、
  //   逆翻訳のコードを読んだら同義のキーが既にあった。⚠同じ選択肢を複数回選ぶので `allowRepeat` を併用する。
  'WXDi-P10-036': [
    {"effectId":"WXDi-P10-036-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"countChoose":{"count":0,"countFromZone":{"zone":"field","owner":"self","filter":{"cardType":"シグニ","level":1}}},"allowRepeat":true,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"opponentSelects":true},"condition":{"type":"ENERGY_COUNT","owner":"opponent","operator":"gte","value":2}},{"choiceId":"c1","label":"選択肢2","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","level":1},"upToCount":false},"delta":10000,"duration":"UNTIL_OPP_TURN_END"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P11-042 ／ 原文【自】：あなたのメインフェイズ以外でこのシグニがバニッシュされたとき、
  //   **このシグニの下にあったカード１枚につき**対戦相手は自分のエナゾーンからカード１枚を選びトラッシュに置く。
  // 🔴旧 live＝比例が落ちて**常に1枚だけ**（下に4枚積んでいても1枚）。
  // 🔑実体は `ctx.leftFieldUnderCards`＝collector が**離場直前**に撮ったスナップショット（場を離れたあとの
  //   盤面には下カードが残っていないので、これ以外に数える術が無い）＝新しい `$ref` 1つで届いた。
  'WXDi-P11-042': [
    {"effectId":"WXDi-P11-042-E2","effectType":"AUTO","timing":["ON_BANISH"],"triggerCondition":{"outsideMainPhase":true},"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":{"$ref":"left_field_under_count"}},"opponentSelects":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 F（2026-08-31 続き748）＝遅延トリガーの主語限定／アクセの分岐／ゲートゾーン
  // ══════════════════════════════════════════════════════════════════════════════

  // WD15-023 ／ 原文：**このターン、あなたの＜龍獣＞のシグニが対戦相手のシグニ１体をバニッシュしたとき**、
  //   その＜龍獣＞のシグニ**より低いレベルを持つ**対戦相手のシグニ１体を対象とし、それをバニッシュする。
  // 🔴旧 live＝遅延が丸ごと落ちて**その場で「相手の＜龍獣＞を1体バニッシュ」**（主語のクラスが対象側へ移った
  //   うえ、レベル比較も消えていた）＝原文とまったく違うカード。
  // 🔑`INSTALL_DELAYED_TRIGGER{trigger:{timing:'ON_SIGNI_BANISH_BATTLE', banisherFilter}}`（新設）＋
  //   `levelLtTriggerSource`（新設＝発火源のレベル未満）。どちらも参照不能なら空ヒットへ倒してある。
  'WD15-023': [
    {"effectId":"WD15-023-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_SIGNI_BANISH_BATTLE","banisherFilter":{"cardType":"シグニ","story":"龍獣"}},"effect":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelLtTriggerSource":true},"upToCount":false}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXK05-065 ／ 原文【自】《ターン１回》：このシグニに【アクセ】が付いたとき、**それがレベル２以下の【アクセ】の
  //   場合**、【エナチャージ１】をする。**レベル３以上の【アクセ】の場合**、カードを１枚引く。
  // 🔴旧 live＝2つの分岐が丸ごと落ちて**アクセが付くたびエナチャージ＋ドローの両方**が走っていた。
  // 🔑新設した `TRIGGER_SOURCE_MATCHES`（トリガー元＝**いま付いた【アクセ】カード**の属性で分岐）。
  //   ⚠ON_ACCE の収集地点でトリガー元を運ぶようにした（それまで `triggeringCardNum` が空だった）。
  'WXK05-065': [
    {"effectId":"WXK05-065-E1","effectType":"AUTO","timing":["ON_ACCE"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"TRIGGER_SOURCE_MATCHES","filter":{"level":{"max":2}}},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"TRIGGER_SOURCE_MATCHES","filter":{"level":{"min":3}}},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WXDi-P15-079 ／ 原文：あなたのデッキの上からカードを５枚見る。**その中からシグニ１枚を【ゲート】がある
  //   あなたのシグニゾーンに出し**、残りを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝`LOOK_AND_REORDER` 単独＝**5枚見て全部デッキの下に戻すだけ**（配置が丸ごと消えていた）。
  // ⚠「【ゲート】があるシグニゾーンに出す」の**ゾーン限定**を表す語彙がまだ無い（配置ゾーンは UI が選ぶ）＝
  //   必要条件である `FIELD_HAS_GATE` でゲートしたうえで `PARTIAL`。§5.4(ii) に登録。
  // 🆕**2026-09-01 続き760**＝原文「その中からシグニ１枚を**【ゲート】があるあなたのシグニゾーンに出し**」。
  //   🔴旧 live は行き先ゾーンの限定が無く、**空いているどのゾーンでもよい**（【ゲート】を作った意味が消える）。
  //   受け皿は今回足した `LookPickChainStage.gateZoneOnly` →`AddToFieldAction.gateZoneOnly`。
  //   ⚠**ゾーン選択UIは出さない**（`SELECT_SIGNI_ZONE` は `src/screens/` の管轄で全空きゾーンを見せる）＝
  //     ゲートが複数空いていても先頭のゲートゾーンへ自動配置する（過剰許容を作らない側の近似）。
  'WXDi-P15-079': [
    {"effectId":"WXDi-P15-079-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"condition":{"type":"FIELD_HAS_GATE","owner":"self"},"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ"},"pickCount":1,"then":"field","gateZoneOnly":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-001 ／ 原文【使用条件】【ドリームチーム】**白のルリグを１体以上含む**／…／デッキの上から５枚見て
  //   １枚まで手札、残りをデッキの一番下へ。**【シグニバリア】１つを得る。** その後、あなたのルリグの下から
  //   カードを**合計４枚**ルリグトラッシュに置いてもよい。そうした場合、好きな生徒１人との絆を獲得する。
  // 🔴旧 live＝使用条件も【シグニバリア】も丸ごと落ちて**デッキを掘るだけのピース**だった。
  // 🔑【シグニバリア】は既存 `STUB{GAIN_SIGNI_BARRIER}`（フリーゾーンにトークン設置）。
  // 🏁**2026-09-02（§5.3 `O-209`）に残り2軸を解消**＝**「絆を獲得するアクションの受け皿が無い」は失効していた。**
  //   `GAIN_BOND{source:'declared'}`（デッキから1枚選んでその名前を `bonds` へ積む）は型・parser 規則・
  //   `effectExecutor.ts:9695` の消費まで実装済みで、【絆】アイコン能力のゲート（`effectEngine.ts:4687`）が読む。
  // 🔑**「ルリグの下からカードを合計4枚ルリグトラッシュに置く」＝エクシード4**＝受け皿は
  //   `OptionalCostSpec.exceed`（`execUtils.ts:511` が可否・`:725` が支払いステップ `INTERNAL_PAY_EXCEED`）。
  //   任意性は既存の `STUB{OPTIONAL_COST}` → `CONDITIONAL{PAID_ADDITIONAL_COST}` の定型。
  // 🔑**使用条件②も既存**＝`LRIG_TRASH_COUNT{filter:{cardNames:[…]}}`（使用済みピースは lrig_trash へ入る近似。
  //   `effectParser.ts:21223` に同じ規則がある）。**両方の【使用条件】は AND**（原文が明記）。
  // ⚠**engine は0行**（新しい型を1つも足していない）。
  'WXDi-CP02-001': [
    {"effectId":"WXDi-CP02-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"condition":{"type":"AND","conditions":[{"type":"FIELD_LRIGS_HAVE_COLORS","owner":"self","colors":["白"]},{"type":"LRIG_TRASH_COUNT","filter":{"cardNames":["連邦生徒会","クロノス報道部"]},"operator":"gte","value":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"pickCount":1,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"STUB","id":"GAIN_SIGNI_BARRIER","count":1},{"type":"STUB","id":"OPTIONAL_COST","exceed":4},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"GAIN_BOND","source":"declared"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 E（2026-08-31 続き748）＝**比較の基準**が「自分／直前」以外だった4件
  // 新設は `resolveDynamicFilter` の4語彙だけ（`levelEqLastProcessedPlus` / `powerLtAcceHost` /
  // `nameEqTriggerSource` / `colorNotMatchesSource`）＝どれも**参照不能なら空ヒット**へ倒してある。
  // ══════════════════════════════════════════════════════════════════════════════

  // SP07-011 ／ 原文【出】《緑》：**あなたの**＜美巧＞のシグニ１体をバニッシュする。そうした場合、この方法で
  //   バニッシュしたシグニ**よりレベルが１つ大きい**シグニ１枚をあなたのデッキから探して場に出し、デッキをシャッフルする。
  // 🔴旧 live＝①バニッシュ対象が **`owner:'opponent'`**＝自分の＜美巧＞を犠牲にする代わりに**相手の＜美巧＞を除去**
  //   する別のカードだった ②サーチ側のレベル条件（＋1）が丸ごと無く**デッキの好きなシグニを場に出せた**。
  // ⚠`levelGtLastProcessed`（より高い）では上が全部通る＝過剰実行なので `levelEqLastProcessedPlus:1` を新設した。
  'SP07-011': [
    {"effectId":"SP07-011-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"美巧"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","levelEqLastProcessedPlus":1},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX17-033 ／ 原文【自】：このカードが【アクセ】として＜調理＞のシグニに付いたとき、**このシグニにアクセされて
  //   いるシグニよりパワーの低い**対戦相手のシグニ１体を対象とし、それをエナゾーンに置く。
  // 🔴旧 live＝パワー比較が丸ごと落ちて**相手のどのシグニでもエナ送りにできた**。
  // 🔑`powerLtAcceHost` は「効果元（＝このアクセ札）が付いているホストシグニ」の実効パワー未満へ解決する。
  'WX17-033': [
    {"effectId":"WX17-033-E4","effectType":"AUTO","timing":["ON_ACCE_ATTACH"],"triggerCondition":{"accedSelf":true,"accedHostStory":"調理"},"action":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLtAcceHost":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    // WX17-033 ／ 原文【出】：あなたのデッキの上からカードを**３枚**見て《アクセアイコン》を持つシグニ１枚を
    //   このシグニの【アクセ】にする。残りを好きな順番でデッキの一番下に置く。
    // 🔴旧 live＝`GRANT_KEYWORD{keyword:'アクセ'}`＋`LOOK_AND_REORDER{count:0}`＝**0枚見て何もしない**うえ、
    //   自分のシグニに「アクセ」という語を恒久付与するだけの別物だった。
    // 🔑既存 `STUB{ATTACH_SEARCHED_AS_ACCE}`（`execStubPart3.ts:5223`＝「手札経由近似」）に載せる＝
    //   まず1枚を手札へピックし、そのカードをアクセとして付ける。
    {"effectId":"WX17-033-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"filter":{"cardType":"シグニ","hasIcon":"アクセ"},"pickCount":1,"then":"hand"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"STUB","id":"ATTACH_SEARCHED_AS_ACCE"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXEX2-31 ／ 原文【自】：あなたの他のシグニ１体が対戦相手の効果によって場を離れたとき、このシグニを場から
  //   トラッシュに置いてもよい。そうした場合、あなたのデッキから**対戦相手の効果によって場を離れたその
  //   シグニと同じ名前の**シグニ１枚を探して場に出し、デッキをシャッフルする。それの【出】能力は発動しない。
  // 🔴旧 live＝名前一致が丸ごと落ちて**デッキから好きなシグニを場に出せた**（自身をトラッシュするだけで万能サーチ）。
  // 🔑`nameEqTriggerSource`＝トリガー元（＝場を離れたそのシグニ）のカード名。⚠`nameEqLastProcessed` は
  //   「直前に処理した札」基準＝ここでは**自身のトラッシュ**を指してしまうので使えない。
  'WXEX2-31': [
    {"effectId":"WXEX2-31-E1","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"triggerScope":"any_ally","triggerFilter":{"excludeSelf":true},"triggerCondition":{"byOpponentEffect":true},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","nameEqTriggerSource":true},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX21-032 ／ 原文【自】：このシグニがアタックしたとき、自身のパワー以下の対戦相手のシグニ１体を対象とし、
  //   **あなたの場にこのシグニと共通する色を持たない他の＜天使＞のシグニがある場合**、それをバニッシュする。
  // 🔴旧 live＝条件が丸ごと落ちて**アタックのたび無条件にパワー以下を1体バニッシュ**。
  // 🔑`colorNotMatchesSource` は `HAS_CARD_IN_FIELD` の中で `colorExclude` へ潰して評価する
  //   （動的フィルタなので `matchesFilter` に渡すと**未知キーとして素通り＝無条件成立**する）。
  'WX21-032': [
    {"effectId":"WX21-032-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"天使","colorNotMatchesSource":true},"excludeSelf":true,"minCount":1},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 D（2026-08-31 続き748）＝**engine に実装済みのハンドラを JSON が指していなかった**群
  // 🔑この4件は engine 側を1行も足していない＝`LRIG_RIDE_SIGNI` /
  //   `LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS` / `filter.isTriggerSource` はすべて既に動く。
  //   **「受け皿はあるのに parser が配線していない」＝どの計器にも映らない死角**（PLAN §4.3）の実例。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXEX2-11 ／ 原文【起】《ターン１回》《アタックフェイズアイコン》《コインアイコン》：ターン終了時まで、
  //   **このルリグはあなたのすべての＜乗機＞のシグニに乗り**、あなたのすべてのドライブ状態のシグニは【ダブルクラッシュ】を得る。
  // 🔴旧 live＝「乗る」が丸ごと落ちて**【ダブルクラッシュ】付与だけ**＝乗機が1体も無くても撃てる別のカードだった
  //   （しかも「乗る」が無いのでドライブ状態のシグニが0のまま＝付与先も空＝実質 no-op）。
  // 🔑`STUB{LRIG_RIDE_SIGNI}`（`execStubPart3.ts:431`）が「センタールリグがすべての乗機シグニに乗る」の実装。
  'WXEX2-11': [
    {"effectId":"WXEX2-11-E4","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"LRIG_RIDE_SIGNI"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","isDrive":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WXK01-038 ／ 原文：ターン終了時まで、**あなたのセンタールリグはあなたのすべての＜乗機＞のシグニに乗る**。
  //   ターン終了時まで、あなたのセンタールリグは「【自】：あなたのルリグアタックステップ開始時、…」を得る。
  // 🔴旧 live＝1文目（乗る）が丸ごと落ちていた。付与側（2文目）は正しかったのでそのまま残す。
  'WXK01-038': [
    {"effectId":"WXK01-038-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"LRIG_RIDE_SIGNI"},{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WXK01-038-sub-E1","effectType":"AUTO","timing":["ON_LRIG_ATTACK_STEP_START"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":{"$ref":"last_processed_count"},"blind":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXEX2-84 ／ 原文【出】：**あなたのルリグトラッシュからすべてのルリグをこのカードの下に置き**、
  //   対象のアーツを２枚までルリグデッキに加える。
  // 🔴旧 live＝**ルリグを下に置く動作が丸ごと落ちていた**（アーツ回収だけ）＝このカードの本体が消えていた。
  // 🔑`STUB{LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS}`（`execStubPart3.ts:4788`）は**コメントにこのカード番号が
  //   書いてある**＝ハンドラは最初からこのカードのために在ったのに、JSON がそれを指していなかった。
  // ⚠ハンドラはアーツを**全部**ルリグデッキへ戻す（原文は「２枚まで」）＝`PARTIAL`。§5.4(ii) に登録。
  'WXEX2-84': [
    {"effectId":"WXEX2-84-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS","skipArtsReturn":true},{"type":"TRANSFER_TO_DECK","source":{"type":"LRIG_TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"アーツ"}},"shuffle":false,"destination":"lrig_deck"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXEX2-35 ／ 原文【自】《ターン１回》：あなたのターンの間、あなたの＜龍獣＞のシグニが対戦相手のシグニ１体を
  //   バニッシュしたとき、**対戦相手のエナゾーンからそのシグニを**トラッシュに置く。
  // 🔴旧 live＝対象が `SIGNI{owner:'opponent', story:'龍獣'}`＝**相手の場の＜龍獣＞を1体トラッシュに置く**という
  //   別のカードだった（バニッシュしてエナへ行った「そのシグニ」を追撃する、が原文）。
  // 🔑「そのシグニ」は既存 `filter.isTriggerSource`（`execTrash` の `triggerRestrict` が解決＝選択UIを出さない）。
  'WXEX2-35': [
    {"effectId":"WXEX2-35-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_OPPONENT"],"triggerScope":"any_ally","triggerFilter":{"story":"龍獣"},"triggerCondition":{"turnOwner":"self"},"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"isTriggerSource":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 C（2026-08-31 続き748）＝トリガー主語／コスト節／エナからのアクセ
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-P07-058 ／ 原文【自】《ターン１回》：**【出】能力を持つ**あなたのシグニ１体が場に出たとき、【エナチャージ１】をする。
  // 🔴旧 live＝`timing:[]`＝**永久に発火しない安全停止**（トリガー主語の修飾が語彙化できず parser が停止していた）。
  // 🔑新設した `TargetFilter.hasOnPlayAbility` は `triggerStateFilterOk` が `effectsMap` を見て評価する
  //   （`matchesFilter` は CardData 単体しか見ないので、ここに載せないと**無条件成立＝全シグニで発火**する）。
  'WXDi-P07-058': [
    {"effectId":"WXDi-P07-058-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","hasOnPlayAbility":true},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WX25-P1-022 ／ 原文【起】《ゲーム１回》ハプニング《青×0》：**あなたと対戦相手の**トラッシュからスペルを
  //   **それぞれ１枚まで**対象とし、このターン、あなたはそれらを使用してもよい。
  // 🔴旧 live＝**対戦相手のトラッシュ側だけ**（自分のトラッシュから使う枝が丸ごと落ちていた）。
  // 🔑自分のトラッシュ側は既存 `PLAY_FREE_FROM_TRASH{maxCount}`（`costThreshold` は上限なしのつもりで大きく取る）。
  // 🆕WX25-P1-022-E2 ／ 原文「**あなたと対戦相手の**トラッシュからスペルをそれぞれ１枚まで対象とし、
  //   このターン、あなたはそれらを使用してもよい。**（コストは支払う）**」
  //   🔴旧 live は自分側を `PLAY_FREE_FROM_TRASH`（**必ずコスト無し**）で書いており、原文の
  //     「コストは支払う」を表せていなかった。⇒ 両側とも `PLAY_FREE{ignoreCost:false}` に揃える
  //     （`source:'trash'` は今回追加）。⚠**もう1件の finding「あなたと対戦相手のトラッシュ」は較正**＝
  //     自分側の枝は前から在った（claim の「対戦相手のトラッシュだけ」は stale）。
  //   ⚠**「このターン使用してもよい」という*権利*の付与は受け皿が無い**（即時使用の近似のまま）＝`PARTIAL`。
  'WX25-P1-022': [
    {"effectId":"WX25-P1-022-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"PLAY_FREE","source":"trash","filter":{"cardType":"スペル"},"ignoreCost":false,"optional":true},{"type":"PLAY_FREE","source":"opp_trash","filter":{"cardType":"スペル"},"ignoreCost":false,"ignoreRestrictions":true,"optional":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL","usageLimit":"once_per_game"},
  ],

  // WX22-Re02 ／ 原文【出】《緑×0》：**あなたのエナゾーンにある**《アクセアイコン》を持つ＜調理＞のシグニ１枚を
  //   対象とし、それを**このシグニ**の【アクセ】にする。
  // 🔴旧 live＝`GRANT_KEYWORD{keyword:'アクセ'}`＝**自分のシグニに「アクセ」という語を恒久付与するだけ**の別物
  //   （エナから札を持ってくる動作が丸ごと無い）。
  // 🔑新設した `ATTACH_ACCE.fromEnergy` で `fromHand` と同じ2段選択（アクセ札→ホスト）に載せた。
  'WX22-Re02': [
    {"effectId":"WX22-Re02-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"ATTACH_ACCE","targetSigniOwner":"self","sourceOwner":"self","fromEnergy":true,"signiFilter":{"cardType":"シグニ","cardClass":"調理","hasIcon":"アクセ"},"targetFilter":{"thisCardOnly":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],



  // WXDi-P12-031 ／ 原文【出】**手札とエナゾーンにあるすべてのカードをトラッシュに置く**：この方法でカードが
  //   ６枚以上トラッシュに置かれた場合、対戦相手のシグニ１体を対象とし、それをバニッシュする。
  // 🔴旧 live＝`costUnparsed:true`＝**手札とエナを全部捨てるという最大級のコストが JSON に無い**まま
  //   無条件バニッシュだった。受け皿は既存の `discardAll` ＋ `energyTrashAll`。
  // 🆕**2026-09-02（§5.3 `O-201`）＝コストを差し戻した**＝`optionalOnPlayCostStub` の `SUPPORTED` に
  //   `discardAll` / `energyTrashAll` が無かったため、cost を書いた瞬間に**任意【出】が丸ごと積まれなくなる**
  //   （＝`costUnparsed` と同じ「取りこぼす側」）のが差し戻しの理由だった。その穴を塞いだので載せられる。
  // 🔑条件（「この方法でカードが6枚以上トラッシュに置かれた場合」）は **`activeCondition` へ移した**＝
  //   `action` の中に置くと**支払い後**に評価され、手札とエナが空になった後なので**必ず偽**になる（過小）。
  //   支払い前の「手札＋エナが6枚以上」は「全部捨てる」形なので**枚数として同値**。
  // ⚠残る近似＝5枚以下でも「払って何も起きない」を選ぶ余地が原文にはあるが、こちらは発動自体をしない。
  //   任意【出】（`mandatory:false`）なので実害方向は過小の側だけ。
  'WXDi-P12-031': [
    {"effectId":"WXDi-P12-031-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energyTrashAll":true,"discardAll":true},"activeCondition":{"type":"ZONE_SUM_COUNT","zones":[{"zone":"hand","owner":"self"},{"zone":"energy","owner":"self"}],"operator":"gte","value":6},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 B（2026-08-31 続き748）＝**公開領域**と**由来ゾーン**の条件
  // 新設は `PUBLIC_ZONE_MATCH`（場＋エナ＋トラッシュ＋ルリグトラッシュ＋チェックゾーン）と
  // `THIS_CARD_FROM_ZONE_THIS_TURN`（`signi_placed_origin_this_turn` を読む）の2型だけ。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-P07-049 ／ 原文【出】：**あなたの公開領域に＜天使＞ではない、色を持つ表向きのシグニであるカードがある場合**、
  //   このシグニを場からトラッシュに置く。
  // 🔴旧 live＝条件が丸ごと落ちて**場に出た瞬間に必ず自分から死ぬ**（＜天使＞デッキ専用の縛りが消えて完全な自爆札に）。
  // 🔑「＜天使＞ではない」は既存 `cardClassExclude`、「色を持つ」は既存 `nonColorless`。
  'WXDi-P07-049': [
    {"effectId":"WXDi-P07-049-E2","effectType":"AUTO","timing":["ON_PLAY"],"condition":{"type":"PUBLIC_ZONE_MATCH","owner":"self","subjectFilter":{"cardType":"シグニ"},"filter":{"cardClassExclude":"天使","nonColorless":true},"minCount":1},"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK05-028 ／ 原文【出】手札を１枚捨てる：対戦相手のシグニ１体を対象とし、**あなたの公開領域にある表向きの
  //   シグニであるカードのレベルがすべて奇数の場合**、それをバニッシュする。
  // 🔴旧 live＝条件が丸ごと落ちて**手札1枚で無条件バニッシュ**。
  // ⚠`mode:'all'` は**subject が0枚なら不成立**へ倒してある（空集合を真にすると「盤面が空なら常に撃てる」に裏返る）。
  'WXK05-028': [
    {"effectId":"WXK05-028-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":1},"action":{"type":"CONDITIONAL","condition":{"type":"PUBLIC_ZONE_MATCH","owner":"self","subjectFilter":{"cardType":"シグニ"},"filter":{"levelParity":"odd"},"mode":"all"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-P06-070 ／ 原文【自】：このシグニがアタックしたとき、**このターンにこのシグニがエナゾーンから場に出ていた場合**、
  //   【エナチャージ１】をする。
  // 🔴旧 live＝条件が丸ごと落ちて**アタックのたび無条件にエナチャージ**。
  // ⚠既存 `THIS_CARD_FROM_NON_HAND_THIS_TURN` は「手札以外」の一括なので**エナ限定を表せない**（デッキ／トラッシュ
  //   から出た回まで通ってしまう）＝新設した `THIS_CARD_FROM_ZONE_THIS_TURN` で由来ゾーンを名指しする。
  'WXDi-P06-070': [
    {"effectId":"WXDi-P06-070-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_FROM_ZONE_THIS_TURN","zones":["energy"]},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第9弾 A（2026-08-31 続き748）＝**ターン履歴の「絞り込み付き」参照**
  // 🔴旧来は `turn_hand_discarded_count` / `deck_to_trash_count_this_turn` が**枚数しか覚えていない**ため、
  //   「＜ブルアカ＞のカードを捨てていた場合」のような filter 付きの履歴条件が**書けず丸ごと落ちていた**
  //   （＝どれも無条件発動）。実体側 `turn_hand_discarded_cards` / `deck_to_trash_cards_this_turn` を
  //   **枚数と同じ地点**で積むようにし、`HAND_DISCARDED_THIS_TURN{filter}` と
  //   `SELF_DECK_TO_TRASH_THIS_TURN{filter}` を新設／拡張した。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-CP02-055 ／ 原文【自】：このシグニがアタックしたとき、**このターンにあなたが手札から＜ブルアカ＞の
  //   カードを１枚以上捨てていた場合**、対戦相手は手札を１枚捨てる。
  // 🔴旧 live＝条件が丸ごと落ちて**アタックのたび無条件に相手の手札を1枚落とす**。
  'WXDi-CP02-055': [
    {"effectId":"WXDi-CP02-055-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"HAND_DISCARDED_THIS_TURN","owner":"self","filter":{"story":"ブルアカ"},"minCount":1},"action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-081 ／ 原文【自】：あなたのアタックフェイズ開始時、**このターンにあなたが手札から＜ブルアカ＞の
  //   カードを１枚以上捨てていた場合**、以下の２つから１つを選ぶ。①カードを１枚引く。②あなたの場に
  //   《才羽モモイ》がある場合、カードを２枚引き、手札を１枚捨てる。
  // 🔴旧 live＝外側の条件だけが落ちて**毎ターン無条件にドローできる**（②の内側条件だけ残っていた）。
  'WXDi-CP02-081': [
    {"effectId":"WXDi-CP02-081-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","condition":{"type":"HAND_DISCARDED_THIS_TURN","owner":"self","filter":{"story":"ブルアカ"},"minCount":1},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":2},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}]},"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"才羽モモイ"}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-094 ／ 原文【自】：このシグニがアタックしたとき、**このターンにあなたのデッキから＜ブルアカ＞の
  //   カードが１枚以上トラッシュに置かれていた場合**、対戦相手のシグニ１体を対象とし、ターン終了時まで、
  //   それのパワーを－2000する。
  // 🔴旧 live＝条件が丸ごと落ちて**アタックのたび無条件に －2000**。
  'WXDi-CP02-094': [
    {"effectId":"WXDi-CP02-094-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"SELF_DECK_TO_TRASH_THIS_TURN","owner":"self","filter":{"story":"ブルアカ"},"minCount":1},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000,"duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P04-058 ／ 原文【自】：このシグニがアタックしたとき、**このターンにあなたの効果によって対戦相手の
  //   エナゾーンからカードが１枚以上トラッシュに置かれていた場合**、【エナチャージ１】をする。
  // 🔴旧 live＝条件が丸ごと落ちて**アタックのたび無条件にエナチャージ**。
  // 🔑受け皿は**既存の** `ENERGY_TRASHED_BY_OPP`＝あれは「**その owner から見て相手の効果で**エナを失った枚数」なので、
  //   自分視点の「相手のエナを割った」は **`owner:'opponent'`** で読む（新設不要だった）。
  'WXDi-P04-058': [
    {"effectId":"WXDi-P04-058-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"ENERGY_TRASHED_BY_OPP","owner":"opponent","operator":"gte","value":1},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX25-CP1-042 ／ 原文【自】《ターン１回》：あなたのルリグアタックステップ開始時、**このターンにあなたの
  //   青の＜ブルアカ＞のシグニがクラッシュした対戦相手のライフクロス１枚につき**対戦相手は手札を１枚捨てる。
  // 🔴旧 live＝比例が落ちて**常に1枚だけ**（3枚クラッシュしていても1枚）。
  // 🔑受け皿は**既存の** `life_crashed_by_signi_this_turn`（「どのシグニが何枚クラッシュしたか」を
  //   攻撃側 state に持つ台帳）＝新しく足したのは `$ref` 1つだけ。
  'WX25-CP1-042': [
    {"effectId":"WX25-CP1-042-E2","effectType":"AUTO","timing":["ON_LRIG_ATTACK_STEP_START"],"action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":{"$ref":"life_crashed_by_signi_this_turn","filter":{"cardType":"シグニ","color":"青","story":"ブルアカ"}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第8弾（2026-08-31 続き747）＝新設した受け皿は5つだけ
  // ①`TargetFilter.hasSoul`（【ソウル】が付いている／`hasAcce` と同じゾーン状態フィルタ）
  // ②`CountFromZone.distinctBy:'name'`（「N種類」）③`FIELD_ATTACHED_COUNT.include:'acce'`
  // ④`INSTALL_DELAYED_TRIGGER.trigger.attackerFilter` ⑤`TransferToDeckAction.position:'third'`
  // あわせて `POWER_MODIFY` を `freezeStoredTargets` の FREEZABLE に追加（遅延設置時の対象焼き込み）。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-CP01-002 ／ 原文【使用条件】【ドリームチーム】**黒のルリグを１体以上含む**【使用条件】このゲームの間にあなたが
  //   リレーピースを使用している（両方の【使用条件】を満たさなければならない）**あなたのセンタールリグがレベル３以上の場合**、
  //   対戦相手のデッキの上からカードを２４３４枚トラッシュに置く。
  // 🏁**2026-09-02（§5.3 `O-213`）に解消し、manual 定義を削除した。**
  //   🔴**「リレーピースを使用している」の受け皿が無い**という登録は**失効していた**＝
  //   `effectParser.ts:21231` に `LRIG_TRASH_COUNT{filter:{cardType:'リレーピース'}}` の規則が既にあり、
  //   **この manual の `PARTIAL` が上書きして届いていなかった**だけ（第4の死角＝出所のあるスタンプ版）。
  //   ⇒ 定義を消して parser に任せると **2つの【使用条件】が AND で載る**（原文が「両方の…」と明記）。
  // ⚠**「使用している」の近似はルリグトラッシュ**＝使用済みピースは lrig_trash へ入る（`execUtils.ts:2597`）。
  //   ゲームから除外されたピースは残らないので**偽陰性側**＝fail-closed。

  // WXDi-CP01-031 ／ 原文【自】：あなたのアタックフェイズ開始時、**あなたの場とエナゾーンに＜世怜音女学院＞のシグニが
  //   合計５種類ある場合**、次の対戦相手のターン終了時まで、このシグニの基本パワーは35000になる。
  // 🔴旧 live＝条件が丸ごと落ちて**毎ターン無条件で基本パワー35000**。
  // 🏁**2026-09-01（§5.3 `O-214`）に解消**＝旧 `ZONE_SUM_COUNT` は**ゾーンごとの種類数を足す**ので、
  //   同名が場とエナに1枚ずつあると **2 種類**と数えていた（原文は集合の種類数＝過剰成立）。
  //   ⇒ `distinctAcrossZones:'name'`（全ゾーンを合流させてから1度だけ distinct）へ移して `MANUAL` へ。
  'WXDi-CP01-031': [
    {"effectId":"WXDi-CP01-031-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ZONE_SUM_COUNT","zones":[{"zone":"field","owner":"self","filter":{"cardType":"シグニ","story":"世怜音女学院"}},{"zone":"energy","owner":"self","filter":{"cardType":"シグニ","story":"世怜音女学院"}}],"operator":"gte","value":5,"distinctAcrossZones":"name"},"then":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":35000,"duration":"UNTIL_OPP_TURN_END"}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX25-CP1-085 ／ 原文【自】：あなたのアタックフェイズ開始時、対戦相手のシグニ１体を対象とし、**このターン、あなたの
  //   黒の＜ブルアカ＞のシグニ１体がアタックしたとき**、ターン終了時まで、それのパワーを－1000する。
  // 🔴旧 live＝遅延が落ちて**アタックフェイズ開始時にその場で －1000**（しかも対象フィルタが `color:"黒"` へ
  //   ずれて「相手の黒のシグニ」を選ぶ別のカードになっていた）。
  // 🔑対象は設置時に `STORE_LAST_PROCESSED_TARGETS`＋`freezeStoredTargets` で焼き込む（発火時は ExecCtx が別物）。
  'WX25-CP1-085': [
    {"effectId":"WX25-CP1-085-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_ATTACK_SIGNI","attackerOwner":"self","attackerFilter":{"cardType":"シグニ","color":"黒","story":"ブルアカ"}},"effect":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true,"delta":-1000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WDK09-011 ／ 原文【出】《青》：**【ゲート】があるシグニゾーンにある**対戦相手のシグニ１体を対象とし、
  //   それを**デッキの上から三番目**に置く。
  // 🔴旧 live＝**まったく別のカード**になっていた（自分のシグニに【ゲート】キーワードを恒久付与するだけ）。
  // 🔑ゾーン限定は既存の `frontOfGateZone`（`execTransferToDeck` が own_gate_zones から解決）。
  'WDK09-011': [
    {"effectId":"WDK09-011-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","frontOfGateZone":true}},"shuffle":false,"position":"third"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX18-075 ／ 原文【常】：このシグニはあなたのシグニに付いている**【アクセ】が合計２枚以上ある場合にしか**
  //   新たに場に出すことができない。
  // 🔴旧 live＝`SELF_PLAY_RESTRICT` に `condition` が無く**評価されない＝制限そのものが無い**（型のコメントが
  //   「省略時は保守的に配置許可」と明記）。§5.3 `O-105`＝`FIELD_ATTACHED_COUNT` に `include:'acce'` を足して届いた
  //   （既存の `'attached'` はチャーム/ソウル/裏向きも数えるので【アクセ】限定を表せなかった）。
  'WX18-075': [
    {"effectId":"WX18-075-E1","effectType":"CONTINUOUS","action":{"type":"SELF_PLAY_RESTRICT","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"acce","operator":"gte","value":2},"rawText":"このシグニはあなたのシグニに付いている【アクセ】が合計２枚以上ある場合にしか新たに場に出すことができない。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXEX1-31 ／ 原文【常】：**あなたのエナゾーンとトラッシュに赤と青と緑のカードが１枚もないかぎり**、あなたの＜天使＞の
  //   シグニは、対戦相手のルリグの効果を受けず、**「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、
  //   それを手札に戻す。」を得る**。
  // 🔴旧 live＝①発動条件（無色寄せの縛り）が丸ごと落ちて**常時**効いていた ②引用の【自】付与が消えていた。
  // 🔑「合計0枚」は `ZONE_SUM_COUNT{lte:0}` を色ごとに3本 AND（`AND` で足りる＝各色が両ゾーンとも0）。
  'WXEX1-31': [
    {"effectId":"WXEX1-31-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"ZONE_SUM_COUNT","zones":[{"zone":"energy","owner":"self","filter":{"color":"赤"}},{"zone":"trash","owner":"self","filter":{"color":"赤"}}],"operator":"lte","value":0},{"type":"ZONE_SUM_COUNT","zones":[{"zone":"energy","owner":"self","filter":{"color":"青"}},{"zone":"trash","owner":"self","filter":{"color":"青"}}],"operator":"lte","value":0},{"type":"ZONE_SUM_COUNT","zones":[{"zone":"energy","owner":"self","filter":{"color":"緑"}},{"zone":"trash","owner":"self","filter":{"color":"緑"}}],"operator":"lte","value":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"天使"},"from":["ルリグ"],"sourceOwner":"opponent","duration":"PERMANENT"},{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","story":"天使"},"abilities":[{"effectId":"WXEX1-31-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P08-048 ／ 原文【常】：このシグニは**下にレベル１、レベル２、レベル３のシグニがそれぞれ１枚以上あるかぎり**、
  //   「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－12000する。」
  //   を得る。**それぞれ２枚以上あるかぎり**、追加で【アサシン】を得る。
  // 🔴旧 live＝2段の条件が両方とも消えたうえ CONTINUOUS の中で即時 SEQUENCE になっており、
  //   **場に出た瞬間に相手1体へ －12000 し、誰かに【アサシン】が付く**という別のカードだった。
  // 🔑`THIS_CARD_HAS_UNDER{filter,minCount}` が受け皿。1段目は【自】そのものへ `condition` として載せ、
  //   2段目（【アサシン】）は `-E1b` の CONTINUOUS へ分ける（引用の中身が別 timing なので1効果に畳めない）。
  'WXDi-P08-048': [
    {"effectId":"WXDi-P08-048-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":1},"minCount":1},{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":2},"minCount":1},{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":3},"minCount":1}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-12000,"duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P08-048-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":1},"minCount":2},{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":2},"minCount":2},{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":3},"minCount":2}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-D01-011 ／ 原文【使用条件】【チーム】＜アンシエント･サプライズ＞＆全員レベル１以上／あなたのデッキの上からカードを
  //   ８枚見る。**その中からレベル１とレベル２とレベル３のシグニをそれぞれ１枚まで場に出し**、残りをシャッフルして
  //   デッキの一番下に置く。その後、ターン終了時まで、**対象のレベル１のシグニ１体は【アサシン】**を得、
  //   **レベル２は【ダブルクラッシュ】**、**レベル３は【ランサー】**を得る。
  // 🔴旧 live＝`LOOK_AND_REORDER` 単独＝**8枚見て全部デッキの下に戻すだけ**（配置も能力付与も丸ごと消えていた）。
  'WXDi-D01-011': [
    {"effectId":"WXDi-D01-011-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":8}]},"condition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"アンシエント・サプライズ","operator":"gte","value":3},{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":8,"stages":[{"filter":{"cardType":"シグニ","level":1},"pickCount":1,"pickUpTo":true,"then":"field"},{"filter":{"cardType":"シグニ","level":2},"pickCount":1,"pickUpTo":true,"then":"field"},{"filter":{"cardType":"シグニ","level":3},"pickCount":1,"pickUpTo":true,"then":"field"}],"remainder":{"location":"deck","position":"bottom","shuffle":true}},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":1}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":2}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":3}},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX25-CP1-008 ／ 原文③対戦相手のシグニ１体を対象とし、**このターン、次にそれがアタックしたとき**、ターン終了時まで、
  //   それのパワーをあなたのトラッシュにある＜ブルアカ＞のカード１枚につき－2000する。
  //   ④対戦相手のシグニ１体を対象とし、**このターン終了時**、それをバニッシュする。
  // 🔴旧 live＝③④とも遅延が落ちて**その場で －2000 ／ その場でバニッシュ**（アタック前に消えるので原文より強い）。
  // ⚠③の「**それが**アタックしたとき」は発火源をカード個体で縛る語彙が無い（`attackerFilter` はカード属性）＝
  //   `attackerOwner:'opponent'` ＋ `once:true` の近似＝`PARTIAL`。§5.4(ii) に登録。
  // 🆕§5.3 `O-211`（2026-09-02）＝③の遅延トリガーを**カード個体**で縛った。
  //   原文「対戦相手のシグニ１体を対象とし、このターン、**次にそれが**アタックしたとき」。
  //   🔴旧は `attackerOwner` だけ＝**対象に取っていない相手シグニのアタックでも発火**した。
  //   `once:true` があるので、狙ったシグニより先に別のシグニがアタックすると**そちらで消費されて**しまう。
  //   ⚠`attackerFilter` はカード属性の絞りなので「その1体」は指せない＝新設 `attackerFixedFromStored` で
  //   **設置時に `storedTargetCards` を焼き込む**（設置と発火で ExecCtx が別物＝`freezeStoredTargets` と同じ理由）。
  'WX25-CP1-008': [
    {"effectId":"WX25-CP1-008-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"黒","count":1},{"color":"無","count":2}]},"action":{"type":"CHOOSE","choose_count":2,"from_count":4,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":5}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"story":"ブルアカ"},"minCount":1},"then":{"type":"PREVENT_NEXT_DAMAGE","count":1}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","once":true,"trigger":{"timing":"ON_ATTACK_SIGNI","attackerOwner":"opponent","attackerFixedFromStored":true},"effect":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true,"delta":0,"deltaFromZone":{"zone":"trash","owner":"self","filter":{"story":"ブルアカ"},"per":-2000},"duration":"UNTIL_END_OF_TURN"}}]}},{"choiceId":"c3","label":"選択肢4","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_TURN_END"},"effect":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]}}],"upTo":true,"recollectArts":{"minArts":4,"thenChooseCount":3,"thenUpTo":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第7弾（2026-08-31 続き747）＝遅延・置換・対象・条件の脱落
  // 受け皿はすべて既存（`INSTALL_DELAYED_TRIGGER` / `REPLACE_NEXT_DAMAGE_WITH_MILL` /
  // `REMOVE_VIRUS_TARGET_ZONE` / `totalPowerMax` / `nonColorless` / `BANISH_REDIRECT.bySource`）。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX25-P3-015 ／ 原文【起】エクシード５：…あなたのルリグトラッシュから**無色ではない**アーツを**２枚まで**対象とし、
  //   それらをルリグデッキに加える。
  // 🔴旧 live＝枚数が **1枚固定**（`upToCount` も無し）＋**無色ではない**の限定が丸ごと脱落。
  'WX25-P3-015': [
    {"effectId":"WX25-P3-015-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":5},"action":{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LRIG_TRASH_COUNT","filter":{"cardType":["ルリグ","アシストルリグ"],"story":"タマ"},"operator":"gte","value":1},{"type":"LRIG_TRASH_COUNT","filter":{"cardType":["ルリグ","アシストルリグ"],"story":"イオナ"},"operator":"gte","value":1}]},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"LRIG_TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"アーツ","nonColorless":true}},"shuffle":false,"destination":"lrig_deck"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX24-P4-012 ／ 原文【起】《ゲーム１回》夢限の理《白×0》：《リコレクトアイコン》［４枚以上］対戦相手のシグニ１体を
  //   対象とし、それをトラッシュに置く。**このターンの、次のあなたのアタックフェイズ開始時**、あなたのすべてのシグニをアップする。
  // 🔴旧 live＝遅延が落ちて**その場で全アップ**（メインで撃つとアタック前にアップし直すという原文の意味が消える）。
  'WX24-P4-012': [
    {"effectId":"WX24-P4-012-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","once":true,"trigger":{"timing":"ON_ATTACK_PHASE_START"},"effect":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":"ALL"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],

  // WX21-023 ／ 原文【自】：このシグニがアタックしたとき、あなたの手札から**それぞれ名前が異なる**＜龍獣＞のシグニを
  //   ４枚まで公開する。その後、…２枚以上公開した場合、〈エナチャージ〉。**３枚以上の場合**、対戦相手は自分のエナゾーンから
  //   カード１枚を対象とし、それをトラッシュに置く。**４枚の場合**、ターン終了時まで、このシグニは【アサシン】を得る。
  // 🔴旧 live＝**多段閾値のうち2段目・3段目のゲートが丸ごと無く**、1枚公開しただけで相手エナを1枚割り
  //   【アサシン】まで付いていた。⚠公開は上限4枚なので「４枚の場合」は `minCount:4` と同値。
  //   あわせて「それぞれ名前が異なる」の `selectionConstraint` も復元した。
  'WX21-023': [
    {"effectId":"WX21-023-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":4,"upToCount":true,"filter":{"cardType":"シグニ","story":"龍獣"},"selectionConstraint":{"distinct":"name"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":2},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":3},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"opponentSelects":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":4},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WD19-007 ／ 原文 ベット―《コインアイコン》対戦相手の感染状態のシグニ１体を対象とし、**それと同じシグニゾーンにある
  //   【ウィルス】１つを取り除き**、**ターン終了時まで**、それのパワーを－8000する。ベットしていた場合、代わりに－15000する。
  // 🔴旧 live＝①【ウィルス】除去のステップが**丸ごと消えていた** ②`POWER_MODIFY` に `duration` が無く**恒久**の
  //   マイナスになっていた。🔑ゾーン限定の除去は既存ハンドラ `REMOVE_VIRUS_TARGET_ZONE`
  //   （`execStubPart1.ts:2157`＝`lastProcessedCards[0]` と同じゾーンのウィルスを1個）。
  'WD19-007': [
    {"effectId":"WD19-007-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","infected":true}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"REMOVE_VIRUS_TARGET_ZONE"},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","infected":true},"upToCount":false},"targetsStored":true,"delta":-15000,"duration":"UNTIL_END_OF_TURN"},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","infected":true},"upToCount":false},"targetsStored":true,"delta":-8000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX25-P3-053 ／ 原文【出】：このターン、**次とその次にあなたがダメージを受ける場合、代わりに**あなたのデッキの上から
  //   カードを３枚トラッシュに置く。
  // 🔴旧 live＝置換が落ちて**その場で自分のデッキを3枚削るだけ**（ダメージは素通り）＝原文と逆向きの自傷。
  // ⚠受け皿 `REPLACE_NEXT_DAMAGE_WITH_MILL` は**1回ぶんの予約**なので「次とその次」＝2件設置して表す。
  'WX25-P3-053': [
    {"effectId":"WX25-P3-053-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REPLACE_NEXT_DAMAGE_WITH_MILL","millCount":3},{"type":"REPLACE_NEXT_DAMAGE_WITH_MILL","millCount":3}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX24-P4-050 ／ 原文【起】《ダウン》：このターン、次に**このシグニの効果によって**対戦相手のシグニ１体が
  //   バニッシュされる場合、エナゾーンに置かれる代わりにトラッシュに置かれる。
  // 🏁**2026-09-02（§5.3 `O-210`）に parser へ移して manual 定義を削除した。**
  //   ①`byEffectOnly`（「このシグニ**の効果**によって」）②`consumeOnce`（「**次に**」＝1回だけ）の2語を
  //   `parseSentencePart1.ts` の `BANISH_REDIRECT` 規則へ足したので、**parser 出力と実体同一**になった。
  //   ⚠実体同一の manual を残すと `§6.4 O-42 tripwire`（影武者コピー）が赤くなり、
  //     以後の parser 改善もこの効果へ永久に届かなくなる（収穫マージが MANUAL を不可侵にするため）。
  // 🔴**旧 live は経路が真逆だった**＝`bySource` は `banish_redirect_by_source_nums`
  //   （**バトル経路だけが読む**配列）に載るので、効果バニッシュでは一度も置換されなかった。

  // WXK09-023 ／ 原文：あなたのエナゾーンから＜電機＞のシグニを、**パワーの合計が12000になるように**３枚まで対象とし、
  //   それらを場に出す。それらの【出】能力は発動しない。
  // 🔴旧 live＝合計パワーの制約が丸ごと落ちて**パワー無制限で3枚出せた**。受け皿は `EffectTarget.totalPowerMax`。
  // ⚠「12000に**なるように**」は厳密には ちょうど＝上限表現は保守側（超過を許さない）の近似＝`PARTIAL`。
  'WXK09-023': [
    {"effectId":"WXK09-023-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":2}]},"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"電機"},"selectionConstraint":{"totalPowerExact":12000}},"suppressOnPlay":true},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],


  // WX12-024 ／ 原文【常】：あなたが使用する**青と黒の**スペルの使用コストは《無×1》減る。
  // 🔴旧 live＝色限定が落ちて**すべてのスペル**が1つ安くなっていた。
  // ⚠`CostReductionAction.color` は**単値の文字列だが複数色を含められる**規約
  //   （`costs.ts:409` が `[白青赤緑黒無]` を全部拾って **OR** で判定する。`effectEngine.ts:2952` に明記）。
  'WX12-024': [
    {"effectId":"WX12-024-E2","effectType":"CONTINUOUS","action":{"type":"COST_REDUCTION","targetCardType":"スペル","color":"青と黒","reduction":[{"color":"無","count":1}],"duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXEX1-59 ／ 原文【自】：このシグニがアタックしたとき、**あなたの場にあるシグニが持つ《レイヤーアイコン》１つにつき**
  //   【エナチャージ１】をする。
  // 🔴旧 live＝枚数比例が落ちて**固定1回**。受け皿は既存 `countFromZone`（`hasIcon` に 'レイヤー' を追加した）。
  'WXEX1-59': [
    {"effectId":"WXEX1-59-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1,"countFromZone":{"zone":"field","owner":"self","filter":{"cardType":"シグニ","hasIcon":"レイヤー"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第6弾（2026-08-31 続き746）＝条件節・対象・置換・遅延の脱落
  // 新設した受け皿は3つだけ＝`ZONE_SUM_COUNT`（2ゾーン合算）／`PREVENT_NEXT_DAMAGE.sourcePowerLte|sourceLevelLte`
  // （逆翻訳の忠実化用）／`execInstallDelayedTrigger` での `targetsStored` 焼き込み。あとは既存語彙。
  // ══════════════════════════════════════════════════════════════════════════════

  // WDA-F03-13 ／ 原文【自】：このシグニがアタックしたとき、パワー12000以下のシグニ１体を対象とし、
  //   **あなたと対戦相手のエナゾーンにあるカードの合計が７枚以下の場合**、それをバニッシュする。
  // 🔴旧 live＝合算条件が丸ごと落ちて**無条件バニッシュ**。⚠`AND` では同値にならない（合計なので 3+4 でも成立）。
  'WDA-F03-13': [
    {"effectId":"WDA-F03-13-E3","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ZONE_SUM_COUNT","zones":[{"zone":"energy","owner":"self"},{"zone":"energy","owner":"opponent"}],"operator":"lte","value":7},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P12-056 ／ 原文【自】：このシグニがアタックしたとき、**あなたのエナゾーンとトラッシュに《ディソナアイコン》の
  //   カードが合計７枚以上ある場合**、カードを１枚引く。
  // 🔴旧 live＝条件ごと落ちて**無条件ドロー**（§5.4(ii) に「近似禁止」で登録されていた項目）。
  'WXDi-P12-056': [
    {"effectId":"WXDi-P12-056-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ZONE_SUM_COUNT","zones":[{"zone":"energy","owner":"self","filter":{"isDisona":true}},{"zone":"trash","owner":"self","filter":{"isDisona":true}}],"operator":"gte","value":7},"then":{"type":"DRAW","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX25-P3-051 ／ 原文【出】：このターン、あなたは対戦相手の**パワー15000以下の**シグニによってダメージを受けない。
  // ⚠engine はダメージ源を区別しない（既存 `damageSource` と同じ規約）＝**JSON に限定を残すことが目的**。
  'WX25-P3-051': [
    {"effectId":"WX25-P3-051-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"PREVENT_NEXT_DAMAGE","count":1,"damageSource":"signi","sourcePowerLte":15000},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P03-077 ／ 原文【LB】：【エナチャージ１】をする。このターン、あなたは対戦相手の**レベル３以下の**シグニによってダメージを受けない。
  'WXDi-P03-077': [
    {"effectId":"WXDi-P03-077-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"PREVENT_NEXT_DAMAGE","count":1,"damageSource":"signi","sourceLevelLte":3}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-043 ／ 原文【出】《緑》《無》《無》：対戦相手のシグニ１体を対象とし、**このターン終了時、それをバニッシュする**。
  // 🔴旧 live＝遅延が落ちて**即時バニッシュ**（アタック前に消えるので原文より遥かに強い）。
  // 🔑「それ」は `SELECT_TARGET_ONLY`→`STORE_LAST_PROCESSED_TARGETS` で固定し、設置時に `fixedCardNums` へ焼き込む
  //   （`execInstallDelayedTrigger` に `freezeStoredTargets` を通した＝設置と発火で ExecCtx が別物のため）。
  'WXDi-CP02-043': [
    {"effectId":"WXDi-CP02-043-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"緑","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_TURN_END"},"effect":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-P16-069 ／ 引用付与の中身＝「【自】：あなたのアタックフェイズ開始時、対戦相手のシグニ１体を対象とし、
  //   **ターン終了時、それをデッキの一番下に置く**。」
  // 🔴旧 live＝遅延が落ちて**アタックフェイズ開始時に即デッキ下**。
  'WXDi-P16-069': [
    {"effectId":"WXDi-P16-069-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_SIGNI_ABOVE_ABILITY","filter":{"cardType":"シグニ","story":"解放派"},"abilities":[{"effectId":"WXDi-P16-069-E2-G","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_TURN_END"},"effect":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"shuffle":false,"position":"bottom","targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // ── §5.3 `O-105`（2026-09-02）＝**場全体の「シグニの下にあるカードの合計枚数」条件**。
  //   受け皿 `FIELD_ATTACHED_COUNT` は既にあったが、**どのシグニの分を数えるかの `filter` が無かった**。
  //   同日に `Condition.FIELD_ATTACHED_COUNT.filter`（ホスト側の絞り）を新設して2効果を載せた。
  // WXDi-P16-056 ／ 原文「対戦相手のシグニ１体を対象とし、手札を１枚捨ててもよい。そうした場合、
  //   ターン終了時まで、それのパワーを－5000する。あなたの場にある＜解放派＞のシグニの下にカードが
  //   合計４枚以上ある場合、代わりに－8000する。」
  // 🔴旧 live は3つ同時に壊れていた＝①対象が `owner:'self'`＋`targetsTriggerSource`（アタックフェイズ開始時に
  //   トリガー元は無い）②「代わりに」が畳めておらず **-5000 と -8000 が両方走る** ③＜解放派＞の条件が丸ごと無い。
  //   ⇒ 部分採用が禁止されていたのはこのため（登録票）。**3つ同時に直して初めて原文になる。**
  // ── §5.3 `O-148`（2026-09-02）＝【みこみこ親衛隊】を**専用のプレイヤーカウンタ**にした（3枚4効果）。
  // 🔴旧 live は2方向に壊れていた＝
  //   ①得る側が `GRANT_KEYWORD`（シグニへのキーワード付与）＝**engine に消費が無い真 no-op**
  //   ②取り除く側が `STUB{REMOVE_VIRUS}` の**誤流用**＝【ウィルス】は `field.signi_virus`
  //     （シグニゾーン単位）なので、**相手のウィルス state を壊しながら**別カウンタのつもりで動いていた。
  // 🔑新設 `PlayerState.mikomiko_guards`（プレイヤー単位）＋ STUB 3本
  //   （`GAIN_MIKOMIKO_GUARD` / `REMOVE_MIKOMIKO_GUARD` / `INTERNAL_REMOVE_MIKOMIKO_GUARD_N`）。
  // ⚠取り除いた**個数**は `lastProcessedCount` へ載せる（カードではないので `lastProcessedCards` ではない）
  //   ＝後段の「1つにつき－8000」がこれを読む。0個のときは対話を出さず 0 を明示する
  //   （前段の値を引き継いで過剰に効くのを防ぐ）。

  'WX25-P3-058': [
    {"effectId":"WX25-P3-058-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"REMOVE_MIKOMIKO_GUARD"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"targetsStored":true,"delta":-8000,"deltaPerLastProcessedCount":true,"perLastProcessed":{},"duration":"UNTIL_END_OF_TURN"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
    {"effectId":"WX25-P3-058-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"handDiscardSigni":{"count":1,"story":"微菌"}},"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"みこみこ☆さんさんおせおせ"}},"then":{"type":"STUB","id":"GAIN_MIKOMIKO_GUARD","value":1}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"twice_per_turn"},
  ],

  'WXDi-P16-056': [
    {"effectId":"WXDi-P16-056-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"CONDITIONAL","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"under","filter":{"cardType":"シグニ","story":"解放派"},"operator":"gte","value":4},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"targetsStored":true,"delta":-8000,"duration":"UNTIL_END_OF_TURN"},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"targetsStored":true,"delta":-5000,"duration":"UNTIL_END_OF_TURN"}}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P15-007 ／ 原文「この能力はあなたの場にあるシグニの下にカードが合計２枚以上ある場合にしか使用できない。」
  // 🔴旧 live は `COND_STUB`＝`execUtils.ts` の `COND_STUB` は **`return true`（無条件成立）**なので、
  //   **使用条件が無い＝いつでも撃てる**過剰実行だった。こちらは filter 不要（場の全シグニが対象）。
  'WXDi-P15-007': [
    {"effectId":"WXDi-P15-007-E2","effectType":"ACTIVATED","timing":["MAIN"],"condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"under","operator":"gte","value":2},"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WXDi-P12-006 ／ 選択肢②＝「対戦相手のシグニ１体を対象とし、**このターン終了時**、それをデッキの一番下に置く」。
  'WXDi-P12-006': [
    {"effectId":"WXDi-P12-006-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","isDisona":true},"minCount":2},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"相手のレベル1のシグニ1体を手札に戻す","action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":1}},"optional":false}},{"choiceId":"c1","label":"相手のシグニ1体をこのターン終了時にデッキの一番下へ","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_TURN_END"},"effect":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"shuffle":false,"position":"bottom","targetsStored":true}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK11-068 ／ 原文【起】《ターン１回》エナゾーンからすべてのカードをトラッシュに置く：対戦相手のレベル３以下のシグニ１体を
  //   対象とし、**この方法でカードが１枚以上トラッシュに置かれた場合**、それをエナゾーンに置く（＝エナ0枚では撃っても何も起きない）。
  // 受け皿は既存 `COST_TRASHED_MATCHES`（`last_cost_trashed_cards` を見る＝本文の直前ステップを見る `LAST_PROCESSED_COUNT_GTE` とは参照先が違う）。
  'WXK11-068': [
    {"effectId":"WXK11-068-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_turn","cost":{"energyTrashAll":true},"action":{"type":"CONDITIONAL","condition":{"type":"COST_TRASHED_MATCHES","filter":{},"minCount":1},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":3}}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // SPDi43-18 ／ 原文の後半＝「**それが対戦相手のセンタールリグと共通する色を持つ場合、対戦相手は**【エナチャージ１】を**してもよい**。」
  // 🔴旧 live＝条件が落ちたうえ **owner が自分**＝相手に与えるはずの利得を自分が受け取る裏返しだった。
  'SPDi43-18': [
    {"effectId":"SPDi43-18-E1","effectType":"AUTO","timing":["ON_SIGNI_DOWN"],"triggerScope":"any_ally","triggerFilter":{"cardName":"DJ.LOVIT3rdVerse-ULT"},"usageLimit":"once_per_turn","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_SHARES_COLOR_WITH_LRIG","owner":"opponent"},"then":{"type":"CHOOSE","choose_count":1,"from_count":2,"opponentResponds":true,"choices":[{"choiceId":"charge","label":"【エナチャージ1】をする","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"opponent","count":1}},{"choiceId":"skip","label":"しない","action":{"type":"SEQUENCE","steps":[]}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P05-072 ／ 原文【出】：**対戦相手は**【エナチャージ１】を**してもよい**。
  // 🔴旧 live＝`owner:'self'` かつ強制＝**自分が必ずエナチャージ**する正反対の効果だった。
  // ⚠**効果自体は `mandatory:true`**（【出】は必ず誘発する）＝任意なのは**相手の選択**なので `CHOOSE` の空枝で表す。
  //   `mandatory:false` にすると「効果を使うかどうか」を**こちら側**が問われる別の意味になる（golden (xxix) の集合も動く）。
  'WXDi-P05-072': [
    {"effectId":"WXDi-P05-072-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"opponentResponds":true,"choices":[{"choiceId":"charge","label":"【エナチャージ1】をする","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"opponent","count":1}},{"choiceId":"skip","label":"しない","action":{"type":"SEQUENCE","steps":[]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX15-003 ／ 原文【自】：あなたのメインフェイズ開始時、あなたのデッキの上からカードを３枚**公開してもよい**。
  // 🔴旧 live＝`mandatory:true`＝毎ターン強制で公開（デッキが減る／情報が漏れる）。
  'WX15-003': [
    {"effectId":"WX15-003-E2","effectType":"AUTO","timing":["ON_MAIN_PHASE_START"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"hasIcon":"アクセ"},"pickCount":1,"pickNoun":"カード","then":{"type":"ADD_TO_ENERGY","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXK02-004 ／ 原文【自】：このルリグがアタックしたとき、トラッシュが25枚以上ある場合、**対戦相手は、手札を１枚捨て
  //   対象の自分のシグニ１体を場からトラッシュに置き自分のエナゾーンから対象のカード１枚をトラッシュに置く**。
  // 🔴旧 live＝3つの損失のうち**シグニ1体だけ**（しかも選ぶのが自分側）＝原文の1/3。
  'WXK02-004': [
    {"effectId":"WXK02-004-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CONDITIONAL","condition":{"type":"TRASH_COUNT","owner":"self","operator":"gte","value":25},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}},{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"opponentSelects":true},{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"opponentSelects":true}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK02-004-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":2},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SET_KEY_PLACE_LIMIT","value":2},{"type":"PLACE_KEY_FROM_LRIG_DECK","owner":"self"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],

  // WXEX1-38 ／ 原文の帰結＝「**対戦相手の手札を１枚見ないで選び**、対戦相手はそれを**デッキの一番上に置く**」。
  // 🔴旧 live＝対象が**場のシグニ**になっていた（手札干渉が盤面除去に化けていた）。
  'WXEX1-38': [
    {"effectId":"WXEX1-38-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","condition":{"type":"SPELL_USED_THIS_TURN","owner":"self"},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true},"shuffle":false,"position":"top"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK11-040 ／ 原文＝「あなたのデッキから**この方法でトラッシュに置いたシグニと同じ名前の**シグニ１枚を探して〜」。
  // 🔴旧 live＝名前一致が落ちて**デッキのどのシグニでもサーチできる**過剰効果だった。
  'WXK11-040': [
    {"effectId":"WXK11-040-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_turn","cost":{"energyTrash":{"count":1,"filter":{"cardType":"シグニ"}}},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","nameEqLastProcessed":true},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX14-024 ／ 原文【LB】＝デッキから＜美巧＞のシグニ１枚を探して公開し**手札に加えるかエナゾーンに置くか場に出し**、シャッフル。
  // 🔴旧 live＝3択のうち**場に出す**に固定されていた（手札／エナを選べない＝原文より狭い）。
  // ⚠`SearchAction.handOrField` は2択どまりなので、3択は `CHOOSE` で書く（`SEARCH` を3本並べる）。
  'WX14-024': [
    {"effectId":"WX14-024-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"hand","label":"手札に加える","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"美巧"},"maxCount":1,"revealPicked":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"energy","label":"エナゾーンに置く","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"美巧"},"maxCount":1,"revealPicked":true,"then":{"type":"ADD_TO_ENERGY","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"field","label":"場に出す","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"美巧"},"maxCount":1,"revealPicked":true,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-P13-067 ／ 選択肢②＝「**対戦相手の場に、シグニに付いているカードかシグニの下に置かれているカードがある場合**、
  //   対戦相手のパワー8000以下のシグニ１体を対象とし、それをバニッシュする」。
  // 🔴旧 live＝②の条件だけが落ちて**無条件で8000以下を1体バニッシュ**（①は条件つきなので②が常に上位互換だった）。
  'WXDi-P13-067': [
    {"effectId":"WXDi-P13-067-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"自分の全シグニがディソナならパワー5000以下を1体バニッシュ","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}},"condition":{"type":"ALL_FIELD_SIGNI_MATCH","owner":"self","filter":{"cardType":"シグニ","isDisona":true}}},{"choiceId":"c1","label":"相手の場に付随カードがあればパワー8000以下を1体バニッシュ","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}},"condition":{"type":"FIELD_ATTACHED_COUNT","owner":"opponent","include":"both","operator":"gte","value":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P13-010 ／ 原文＝条件成立時に「**対戦相手のシグニゾーン１つに【ウィルス】１つを置き**、ターン終了時まで、
  //   対戦相手の感染状態のすべてのシグニのパワーを－3000する」。
  // 🔴旧 live＝ウィルス設置が丸ごと消えており、**感染していなければ何も起きない**（自分でウィルスを置く手段がこれ）。
  'WXDi-P13-010': [
    {"effectId":"WXDi-P13-010-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ALL_FIELD_SIGNI_MATCH","owner":"self","filter":{"cardType":"シグニ","isDisona":true}},"then":{"type":"SEQUENCE","steps":[{"type":"PLACE_VIRUS","targetOwner":"opponent","zoneCount":1,"virusCount":1},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","infected":true}},"delta":-3000,"duration":"UNTIL_END_OF_TURN"}]}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK06-044 ／ 原文【出】：**手札が１枚以上ある各プレイヤーは**、手札を１枚デッキの一番下に置きカードを１枚引く。
  // 🔴旧 live＝自分が1枚引くだけ＝**デッキ下送りも相手側も丸ごと消えて**いた（実質ノーコストのドロー）。
  'WXK06-044': [
    {"effectId":"WXK06-044-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"HAND_COUNT","owner":"self","operator":"gte","value":1},"then":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"HAND_CARD","owner":"self","count":1},"shuffle":false,"position":"bottom"},{"type":"DRAW","owner":"self","count":1}]}},{"type":"CONDITIONAL","condition":{"type":"HAND_COUNT","owner":"opponent","operator":"gte","value":1},"then":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"HAND_CARD","owner":"opponent","count":1},"shuffle":false,"position":"bottom","opponentSelects":true},{"type":"DRAW","owner":"opponent","count":1}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK09-001 ／ 原文【自】：あなたのメインフェイズ開始時、**センタールリグの下から対象のカード１枚をルリグトラッシュに置くか、
  //   シグニゾーンかエナゾーンから対象のカード１枚をトラッシュに置くか、ライフクロス１枚をトラッシュに置く**（3択のアップキープ）。
  // 🔴旧 live＝3択が消えて**毎ターン強制でライフクロスを1枚失う**（最も重い枝に固定）。
  'WXK09-001': [
    {"effectId":"WXK09-001-E2","effectType":"AUTO","timing":["ON_MAIN_PHASE_START"],"action":{"type":"CHOOSE","choose_count":1,"from_count":4,"choices":[{"choiceId":"under_lrig","label":"センタールリグの下からカード1枚をルリグトラッシュへ","action":{"type":"STUB","id":"TRASH_UNDER_LRIG_CARD"}},{"choiceId":"field","label":"シグニゾーンからカード1枚をトラッシュへ","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"choiceId":"energy","label":"エナゾーンからカード1枚をトラッシュへ","action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":1}}},{"choiceId":"life","label":"ライフクロス1枚をトラッシュへ","action":{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX25-CP1-040 ／ 原文【常】：【シュート】。
  // 🔴旧 live＝**相手の＜ブルアカ＞シグニを常時トラッシュ＋エナチャージ**という別カードになっていた
  //   （後続の【起】の内容が【常】の枠へ漏れていた。【起】は `-E1b` が別に持っている）。
  'WX25-CP1-040': [
    // 🔑E1（【常】：【シュート】）は manual に置かない＝`-E1b`→`-E2` の改名で原文ブロックの割り当てが直り、
    //   parser が正しい `GRANT_KEYWORD{thisCardOnly,'シュート'}` を出すようになった（`O-42` tripwire）。
    // 🆕E2＝【起】《ターン１回》エナゾーンから＜ブルアカ＞のカードを３枚までトラッシュに置く：この方法で
    //   トラッシュに置いたカードの枚数と同じレベルの対戦相手のシグニ１体を対象とし、それを手札に戻す。
    // 🔴従来は **live 限定の `-E1b`**（`census:orphanmanual` の「出所の無いスタンプ」）だった。E1 を直した結果
    //   parser が同じ原文ブロックから `-E2` を出すようになり、放置すると**E1b と E2 が二重に載る**。
    //   ⇒ `census:orphanmanual` の指示どおり `manualEffects.ts` へ移し、id を parser 側に揃えた。
    {"effectId":"WX25-CP1-040-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_turn","action":{"type":"STUB","id":"VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE","variableEnergyTrashLevelBounce":{"story":"ブルアカ","maxCount":3}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX24-P1-048 ／ 原文【出】：**あなたの他の＜悪魔＞のシグニ２体を場からトラッシュに置かないかぎり**、このシグニをダウンする。
  // 🔴旧 live＝回避コストが落ちて**必ずダウン**（デメリットが常時発生）。
  // 受け皿は既存 `STUB{OPTIONAL_COST, unlessPay, fieldTrash}` → `CONDITIONAL{PAID_ADDITIONAL_COST}` の **else 枝**。
  'WX24-P1-048': [
    {"effectId":"WX24-P1-048-E3","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","unlessPay":true,"fieldTrash":{"count":2,"excludeSelf":true,"filter":{"cardType":"シグニ","story":"悪魔"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[]},"else":{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX17-002 ／ 原文ブロックが**2能力ぶん**（【常】グロウ制限 ＋【出】ドロー2）で、live は**【常】の枠で毎回ドロー2**に化けていた。
  // 🔑`LRIG_GROW_RESTRICT` は既存の正準形（`WX25-P2-032-E1` ほか。BattleScreen の growCandidates が原文を読む）。
  // ⚠ドローは兄弟効果 `-E1b` に分ける（census の兄弟畳み込みは**小文字1字サフィックス**が規約）。
  'WX17-002': [
    {"effectId":"WX17-002-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"LRIG_GROW_RESTRICT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX17-002-E1b","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"DRAW","owner":"self","count":2},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第5弾（2026-08-31）＝**条件節・対象フィルタ・数量比例の脱落**（既存の受け皿だけで直る分）
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-D09-H15 ／ 原文【自】：あなたのアタックフェイズ開始時、**あなたのエナゾーンにカードが無い場合**、
  //   次の対戦相手のターン終了時まで、このシグニの**基本レベルは３になり**、基本パワーは12000になる。
  // 🔴旧 live＝条件も基本レベルも落ちて、**エナがあっても常に基本パワー12000**になっていた。
  'WXDi-D09-H15': [
    {"effectId":"WXDi-D09-H15-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ENERGY_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"SEQUENCE","steps":[{"type":"SET_BASE_LEVEL","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":3},{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"value":12000,"duration":"UNTIL_OPP_TURN_END"}]}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P16-094 ／ 原文＝**あなたの場にいるルリグ３体が同じチームの場合**、以下の２つから１つを選ぶ。…
  // 🔴旧 live＝使用条件が丸ごと落ちて**いつでも撃てるピース**だった。受け皿は既存 `LRIG_ANY_TEAM_COUNT`
  //   （チーム名を名指ししない「同じ1つのチームにN体」形。`LRIG_TEAM_COUNT` に `team:''` を入れると無条件で通る）。
  'WXDi-P16-094': [
    {"effectId":"WXDi-P16-094-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"condition":{"type":"LRIG_ANY_TEAM_COUNT","owner":"self","value":3},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"トラッシュから【チーム】を持つシグニ1枚を場に出す","action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"delta":3000,"duration":"UNTIL_OPP_TURN_END","targetsLastProcessed":true}]}},{"choiceId":"c1","label":"デッキ上5枚から2枚までエナゾーンへ","action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_ENERGY","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXK05-052 ／ 原文【出】：対戦相手のシグニを２体まで対象とし、**このシグニと同じシグニゾーンに【シード】がある場合**、
  //   次のターンの間、それらは「【常】：アタックできない。」を得る。
  // 🔴旧 live＝**「自分のシグニに【シード】キーワードを永続付与」**という別のカードになっていた（原文と無関係）。
  // 受け皿は既存 `SAME_ZONE_HAS_SEED` ＋ `SIGNI_ATTACK_BAN{targetsStored, turns:2}`（`WXDi-P08-030-E1` と同型）。
  'WXK05-052': [
    {"effectId":"WXK05-052-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"SAME_ZONE_HAS_SEED"},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"SIGNI_ATTACK_BAN","owner":"opponent","targetsStored":true,"turns":2}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX25-P2-079 ／ 原文＝**あなたの＜電機＞のシグニ１体を対象とし**、ターン終了時まで、それを覚醒状態にする。
  // 🔴旧 live＝`AWAKEN_SIGNI` が対象を1つも持たず、どのシグニが覚醒するか原文から読めなかった。
  'WX25-P2-079': [
    {"effectId":"WX25-P2-079-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","cardClass":"電機"}}},{"type":"AWAKEN_SIGNI","targetsLastProcessed":true}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXEX2-06 ／ 原文【自】：**＜怪異＞のシグニ１体がアタックしたとき**、あなたのトラッシュからそのシグニと同じレベルの
  //   無色ではないシグニ１枚を対象とし、それを手札に加える。
  // 🔴旧 live＝トリガー主語のクラス限定が落ちて、**どのシグニのアタックでも**発火していた。
  'WXEX2-06': [
    {"effectId":"WXEX2-06-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"any","triggerFilter":{"cardType":"シグニ","cardClass":"怪異"},"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelEqTrigger":true,"nonColorless":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXEX2-34 ／ 原文【自】：このシグニがアタックしたとき、**あなたの場にある＜鉱石＞のシグニ１体につき**カードを１枚引き、
  //   **あなたの場にある他の＜宝石＞のシグニ１体につき**【エナチャージ１】をする。
  // 🔴旧 live＝ドローが丸ごと消え、エナチャージが**枚数比例なしの固定1**になっていた。受け皿は既存 `countFromZone`。
  'WXEX2-34': [
    {"effectId":"WXEX2-34-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1,"countFromZone":{"zone":"field","owner":"self","filter":{"cardType":"シグニ","cardClass":"鉱石"}}},{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1,"countFromZone":{"zone":"field","owner":"self","filter":{"cardType":"シグニ","cardClass":"宝石","excludeSelf":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX17-053 ／ 原文【自】：このシグニがアタックしたとき、**このシグニの正面のシグニ**１体を対象とし、
  //   あなたの場に《ライズアイコン》を持つシグニが２体ある場合、それをバニッシュする。
  // 🔴旧 live＝対象が `owner:'self'` の任意シグニ＝**自分のシグニを自爆させていた**（正面参照も脱落）。
  'WX17-053': [
    {"effectId":"WX17-053-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","hasRiseIcon":true},"minCount":2},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK08-032 ／ 原文【自】：このシグニがアタックしたとき、**あなたのシグニゾーンにカードが７枚以上ある場合**、
  //   対戦相手のライフクロス１枚をクラッシュする。
  // ⚠「シグニゾーンにあるカード」＝場のシグニ本体＋下のカード＋付いているカード（`include:'zone'`）。
  'WXK08-032': [
    {"effectId":"WXK08-032-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"zone","operator":"gte","value":7},"then":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P04-034 ／ 原文【自】：あなたのアタックフェイズ開始時、**あなたの場に【ソウル】があり対戦相手のエナゾーンに
  //   カードが２枚以上ある場合**、対戦相手は自分のエナゾーンからカード１枚を選びトラッシュに置く。
  'WXDi-P04-034': [
    {"effectId":"WXDi-P04-034-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"soul","operator":"gte","value":1},{"type":"ENERGY_COUNT","owner":"opponent","operator":"gte","value":2}]},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"opponentSelects":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P08-030 ／ 原文【出】《無》《無》《無》：**このターン、対戦相手のシグニ１体がアタックしたとき**、
  //   **そのアタックがこのターンで二度目以降の対戦相手によるアタックの場合**、そのシグニをバニッシュする。
  // 🔴旧 live＝遅延トリガーも序数条件も落ちて、**使った瞬間に相手シグニ1体を無条件バニッシュ**していた。
  // 🔴**序数条件は `fireCondition` ではなく `effect` の中の `CONDITIONAL` に置く**＝
  //   ON_ATTACK_SIGNI の遅延トリガー収集器（`collectSigniAttackDelayedTriggers` /
  //   `collectAttackerSelfDelayedTriggers`）は **`fireCondition` を読んでいない**（読むのは
  //   `ON_SIGNI_DOWN` 経路だけ）＝そこへ置くと**黙って無視されて無条件バニッシュに戻る**。
  //   ⚠`once` を使う場合だけは収集時評価が要る（空振りで設置が消費されるため）が、この効果は `once` 無し。
  'WXDi-P08-030': [
    {"effectId":"WXDi-P08-030-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"無","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_ATTACK_SIGNI","attackerOwner":"opponent"},"effect":{"type":"CONDITIONAL","condition":{"type":"ATTACK_ORDINAL_THIS_TURN","owner":"opponent","operator":"gte","value":2},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isTriggerSource":true},"upToCount":false}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXK03-060 ／ 原文【自】：あなたのターン終了時、**このターンにあなたのセンタールリグがアタックしていなかった場合**、
  //   【エナチャージ１】をする。
  'WXK03-060': [
    {"effectId":"WXK03-060-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"CONDITIONAL","condition":{"type":"CENTER_LRIG_ATTACKED_THIS_TURN","owner":"self","negate":true},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第4弾（2026-08-31）＝**引用能力付与の平坦化**（「…は「Q」を得る」）
  // 🔴旧 live は**引用の中身が外側の即時アクションとして漏れて**いた＝付与が消え、
  //   引用内の効果が「いま1回だけ」起きる（owner も対象も原文と違う）。受け皿は既存の
  //   `GRANT_EFFECT` / `GRANT_LRIG_ABILITY` / `GRANT_ACCE_HOST_ABILITY` / `GRANT_SIGNI_ABOVE_ABILITY`
  //   だけ＝**新しい型は1つも足していない**。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX24-P2-001 ／ 原文＝デッキ上３枚を見て**シグニ１枚まで場に出し**、残りを一番下。その後あなたのシグニ１体を対象とし、
  //   ターン終了時まで、それは「【自】：このシグニがアタックしたとき、このシグニをアップし、ターン終了時まで、このシグニは能力を失う。」を得る。
  //   《リコレクト》［４枚以上］追加で対戦相手のシグニ１体を手札に戻す。
  // 🔴旧 live＝「場に出す」も「付与」も消え、`LOOK_AND_REORDER` ＋ 無条件 `BOUNCE` だけだった。
  'WX24-P2-001': [
    {"effectId":"WX24-P2-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"filter":{"cardType":"シグニ"},"pickCount":1,"pickUpTo":true,"then":"field"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX24-P2-001-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"until":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},{"type":"RECOLLECT_GATE","minArts":4},{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX25-CP1-TK2A ／ 原文【常】：**これの上にある《鰐渕アカリ》は**「【自】：あなたのアタックフェイズ開始時、対戦相手のシグニ１体を対象とし、
  //   《黒》を支払ってもよい。そうした場合、ターン終了時まで、それのパワーを－5000する。」を得る。
  // 🔴旧 live＝付与が消えて **CONTINUOUS の裸 POWER_MODIFY**＝毎回無条件・コスト無しで相手を－5000していた。
  // 🆕**E1（2026-09-01 続き760）**＝原文1文目「**これの上にある《鰐渕アカリ（正月）》の
  //   レベルを＋１し、パワーを＋10000する**」。🔴旧 live＝`POWER_MODIFY{target:{SIGNI, owner:'any', count:1}}`＝
  //   **主語が「任意のシグニ1体」**で、しかも**レベル＋1 が丸ごと無かった**。
  //   受け皿は `TargetFilter.aboveSelf`（パワー側は `calcFieldPowers` の aboveSelf ループが前から消費）＋
  //   今回足したレベル側の同型ループ（`buildLevelMods`）。
  //   ⚠**クラフトはスタックの下段**なので、最前面だけを走査する既定ループには絶対に載らない。
  'WX25-CP1-TK2A': [
    {"effectId":"WX25-CP1-TK2A-E1","effectType":"CONTINUOUS","action":{"type":"SEQUENCE","steps":[{"type":"LEVEL_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"aboveSelf":true,"cardName":"鰐渕アカリ"}},"delta":1,"until":"PERMANENT"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"aboveSelf":true,"cardName":"鰐渕アカリ"}},"delta":10000}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX25-CP1-TK2A-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_SIGNI_ABOVE_ABILITY","filter":{"cardName":"鰐渕アカリ"},"abilities":[{"effectId":"WX25-CP1-TK2A-E2-GRANT","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000,"duration":"UNTIL_END_OF_TURN","targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX25-P1-111 ／ 原文＝あなたの＜怪異＞のシグニ１体を対象とし、ターン終了時まで、それは
  //   【アサシン（パワー8000以下のシグニ）】**か**「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－8000する。」を得る。
  // 🔴旧 live＝**選択肢が消えて**「＜怪異＞の相手シグニを－8000」＝**owner も対象も逆**だった。
  'WX25-P1-111': [
    {"effectId":"WX25-P1-111-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"assassin","label":"【アサシン（パワー8000以下のシグニ）】を得る","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"怪異"},"explicitTarget":true},"keyword":"アサシン:{\"powerLte\":8000}","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"grant","label":"「アタックしたとき相手シグニのパワーを－8000」を得る","action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"怪異"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX25-P1-111-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000,"duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-026 ／ 原文【出】：次の対戦相手のターン終了時まで、**このルリグは**「【常】：あなたのシグニのパワーを＋5000する。」を得る。
  // 🔴旧 live＝付与が消えて**その瞬間の場のシグニだけ**への +5000 スナップショット（後から出たシグニに乗らない）。
  'WXDi-CP02-026': [
    {"effectId":"WXDi-CP02-026-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"GRANT_LRIG_ABILITY","duration":"UNTIL_OPP_TURN_END","abilities":[{"effectId":"WXDi-CP02-026-E1-GRANT","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":5000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-048 ／ 原文【出】：対戦相手のシグニ１体を対象とし、ターン終了時まで、**それのパワーを－8000し**、それは
  //   「【自】：アタックフェイズ終了時、ターン終了時まで、このシグニのパワーを－5000する。」を得る。
  // 🔴旧 live＝**外側の－8000 が消えて**引用内の－5000 だけが即時に走っていた。
  'WXDi-CP02-048': [
    {"effectId":"WXDi-CP02-048-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000,"duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_EFFECT","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"opponent","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-CP02-048-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_PHASE_END"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":-5000,"duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-CP02-078 ／ 原文【起】《ターン１回》手札から＜ブルアカ＞のカードを１枚捨てる：次の対戦相手のターン終了時まで、
  //   **このシグニのパワーを＋5000し**、このシグニは「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、
  //   《青》を支払ってもよい。そうした場合、ターン終了時まで、それのパワーを－5000する。」を得る。
  // 🔴旧 live＝自分への＋5000 が消え、引用内の－5000 が**コスト無しで即時**に走っていた。
  'WXDi-CP02-078': [
    {"effectId":"WXDi-CP02-078-E1","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_turn","cost":{"discard":1,"discardFilter":{"story":"ブルアカ"}},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000,"duration":"UNTIL_OPP_TURN_END"},{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"duration":"UNTIL_OPP_TURN_END","effect":{"effectId":"WXDi-CP02-078-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXDi-P15-083 ／ 原文＝**同じシグニゾーンに【ゲート】がある**あなたのシグニ１体を対象とし、ターン終了時まで、それは
  //   「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、**対戦相手が手札を３枚捨てないかぎり**、ターン終了時まで、それのパワーを－8000する。」を得る。
  // 🔴旧 live＝付与も【ゲート】限定も回避コストも消え、**その場で相手シグニを無条件に－8000**していた。
  'WXDi-P15-083': [
    {"effectId":"WXDi-P15-083-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","inGateZone":true},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P15-083-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPPONENT_PAY_OPTIONAL","opponentHandDiscard":3},{"type":"CONDITIONAL","condition":{"type":"OPPONENT_NOT_PAID"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXEX2-69 ／ 原文【常】：あなたのターンの間、**これにアクセされている＜調理＞のシグニ**のパワーを＋3000し、それは
  //   「【自】：このシグニがアタックしたとき、次の対戦相手のターン終了時まで、対戦相手はアーツとスペルを使用できない。」を得る。
  // 🔴旧 live＝パワー＋3000 も付与も消え、**常時いきなり相手のアーツ／スペルを封じて**いた。
  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第3弾（2026-08-31）＝**「下にあるカード／付いているカード」の条件脱落**
  // どれも条件節が丸ごと落ちて**無条件実行**だった。受け皿は今回足した
  // `THIS_CARD_HAS_UNDER{subject:'lrig'}`（ルリグの下）と `FIELD_ATTACHED_COUNT`（場全体の付随カード）。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXDi-D05-004 ／ 原文【自】：このルリグがアタックしたとき、**このルリグの下にカードが５枚以上ある場合**、
  //   カードを１枚引く。**７枚以上ある場合**、追加で対戦相手は手札を１枚捨てる。
  // 🔴旧 live＝多段閾値が**両方とも無条件**（グロウ直後でもドロー＋ハンデス）。
  'WXDi-D05-004': [
    {"effectId":"WXDi-D05-004-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","subject":"lrig","minCount":5},"then":{"type":"DRAW","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","subject":"lrig","minCount":7},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P02-023 ／ 原文【自】：あなたのアタックフェイズ開始時、**このルリグの下にカードが５枚以上ある場合**、
  //   【エナチャージ１】をする。**７枚以上ある場合**、あなたのレベル３の緑のシグニ１体を対象とし、ターン終了時まで、それは【ランサー】を得る。
  'WXDi-P02-023': [
    {"effectId":"WXDi-P02-023-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","subject":"lrig","minCount":5},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","subject":"lrig","minCount":7},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"緑","level":3}},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P03-023 ／ 原文【自】：このルリグがアタックしたとき、**このルリグの下にカードが５枚以上ある場合**、
  //   あなたのトラッシュから《ガードアイコン》を持つシグニを１枚まで対象とし、それをデッキの一番上に置く。**７枚以上ある場合**、追加でカードを１枚引く。
  'WXDi-P03-023': [
    {"effectId":"WXDi-P03-023-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","subject":"lrig","minCount":5},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","hasGuard":true}},"shuffle":false,"position":"top"}},{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","subject":"lrig","minCount":7},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P04-081 ／ 原文【出】：**あなたの場に、シグニに付いているカードかシグニの下に置かれているカードがある場合**、
  //   対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－1000する。
  'WXDi-P04-081': [
    {"effectId":"WXDi-P04-081-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"both","operator":"gte","value":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXDi-P06-084 ／ 原文【起】《黒》《ダウン》：あなたのトラッシュからレベル２以下の黒のシグニ１枚を対象とし、それを手札に加える。
  //   **場にシグニに付いているカードかシグニの下に置かれているカードがある場合、代わりに**あなたのトラッシュから黒のシグニ１枚を対象とし、それを手札に加える。
  // 🔴旧 live＝「代わりに」が **SEQUENCE の2連**＝条件を問わず**2枚回収**していた（過剰実行）。
  'WXDi-P06-084': [
    {"effectId":"WXDi-P06-084-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}],"down_self":true},"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"any","include":"both","operator":"gte","value":1},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}},"else":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":{"max":2},"color":"黒"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXK09-036 ／ 原文【出】：**あなたのシグニの下にカードがある場合**、【エナチャージ１】をする。
  'WXK09-036': [
    {"effectId":"WXK09-036-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"under","operator":"gte","value":1},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK11-069 ／ 原文【自】：このシグニがアタックしたとき、対戦相手のレベル３以下のシグニ１体を対象とし、
  //   **場にあるシグニの下にあるカードと場にあるシグニに付いているカードが合計３枚以上の場合**、それをエナゾーンに置く。
  // ⚠「場に」＝両者の場（owner:'any'）。
  'WXK11-069': [
    {"effectId":"WXK11-069-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"any","include":"both","operator":"gte","value":3},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":3}}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 第2弾（2026-08-31・速いレーン §2.0）
  // どれも **原文を読み直して手で書き直した**（parser 出力の移設ではない＝`O-42` tripwire 対象外）。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXK07-006 ／ 原文【起】《ゲーム１回》《赤》《赤》《赤》：**あなたのルリグデッキが２枚以下の場合**、《コイン》を２つ得る。
  // 🔴旧 live＝条件が丸ごと落ちて**いつでもコイン2枚**。受け皿は既存 `LRIG_DECK_COUNT`。
  'WXK07-006': [
    {
      effectId: 'WXK07-006-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 1 }, { color: '赤', count: 1 }, { color: '赤', count: 1 }] },
      usageLimit: 'once_per_game',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'LRIG_DECK_COUNT', owner: 'self', operator: 'lte', value: 2 },
        then: { type: 'GAIN_COIN', owner: 'self', count: 2 },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-CP01-029 ／ 原文【出】：あなたのデッキの一番上のカードをトラッシュに置く。
  //   **そのカードが＜バーチャル＞のシグニでない場合**、このシグニをダウンする。
  // 🔴旧 live＝否定条件が落ちて**必ず自分がダウン**（デメリットが常時発生）。
  // 受け皿は既存 `LAST_PROCESSED_MATCHES{operator:'eq', value:0}`＝「一致が0枚＝でない場合」。
  'WXDi-CP01-029': [
    {
      effectId: 'WXDi-CP01-029-E3',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', cardClass: 'バーチャル' }, operator: 'eq', value: 0 },
            then: { type: 'DOWN', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } } },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK05-051 ／ 原文【自】《ターン１回》：このシグニがアタックしたとき、デッキの上からカードを３枚公開する。
  //   **それらがそれぞれ名前の異なる＜植物＞のシグニの場合**、このシグニをアップする。公開したカードをシャッフルして一番下に置く。
  // 🔴旧 live＝条件が丸ごと落ちて**毎ターン無条件にアップ**（実質2回アタック）。
  // 受け皿は既存 `LAST_PROCESSED_MATCHES{distinctName}`（同型の先例＝`WXK10-060-E2`）。
  'WXK05-051': [
    {
      effectId: 'WXK05-051-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      usageLimit: 'once_per_turn',
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 3, private: false, reorder: false, canTrash: false,
            destination: { location: 'deck', owner: 'self', position: 'bottom' }, shuffle: true,
          },
          {
            type: 'CONDITIONAL',
            condition: {
              type: 'LAST_PROCESSED_MATCHES',
              filter: { cardType: 'シグニ', story: '植物' },
              operator: 'eq', value: 3, distinctName: true, verbJa: '公開された',
            },
            then: { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX22-008 ／ 原文【出】：デッキの上からカードを４枚公開する。**その中からそれぞれ名前の異なるように好きな枚数の
  //   ＜原子＞のシグニ**を選び手札に加え、残りをトラッシュに置く。
  // 🔴旧 live＝`filter` が無く `pickCount:1`＝**任意のカード1枚**しか取れず、しかも＜原子＞制限も同名制限も無かった。
  'WX22-008': [
    {
      effectId: 'WX22-008-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount: 4,
        filter: { cardType: 'シグニ', story: '原子' },
        pickCount: 'ALL',
        selectionConstraint: { distinct: 'name' },
        then: { type: 'ADD_TO_HAND', owner: 'self' },
        remainder: { location: 'trash', position: 'any' },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX18-001 ／ 原文【出】：デッキの上からカードを３枚公開する。**その中から好きな数の＜悪魔＞のシグニ**を手札に加え、残りをトラッシュに置く。
  // 🔴旧 live＝`filter` 無し・`pickCount:1`＝＜悪魔＞以外も1枚だけ拾える（対象も枚数も誤り）。
  'WX18-001': [
    {
      effectId: 'WX18-001-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount: 3,
        filter: { cardType: 'シグニ', story: '悪魔' },
        pickCount: 'ALL',
        then: { type: 'ADD_TO_HAND', owner: 'self' },
        remainder: { location: 'trash', position: 'any' },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX22-023 ／ 原文【自】：**あなたの＜毒牙＞のシグニ１体が場に出るかアタックしたとき**、対戦相手のシグニ１体を対象とし、－2000。
  // 🔴旧 live＝トリガーが `ON_ATTACK_SIGNI` だけ・`triggerScope` も `triggerFilter` も無く、
  //   **「場に出たとき」が丸ごと欠落**し、しかも**誰のどのシグニがアタックしても**発火していた。
  'WX22-023': [
    {
      effectId: 'WX22-023-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY', 'ON_ATTACK_SIGNI'],
      triggerScope: 'any_ally',
      triggerFilter: { cardType: 'シグニ', story: '毒牙' },
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
        delta: -2000,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-P1-TK6 ／ 原文【自】：あなたのメインフェイズ開始時、あなたのトラッシュから**＜怪異＞のシグニを１枚まで**対象とし、
  //   場にあるこのシグニをゲームから除外する。そうした場合、それを場に出す。
  // 🔴旧 live＝`ADD_TO_FIELD` に **`source` が無い**＝出所不明（＝実質 no-op か任意カード）。＜怪異＞制限も「1枚まで」も欠落。
  'WX25-P1-TK6': [
    {
      effectId: 'WX25-P1-TK6-E2',
      effectType: 'AUTO',
      timing: ['ON_MAIN_PHASE_START'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
          {
            type: 'CONDITIONAL',
            condition: { type: 'IS_MY_TURN' },
            then: {
              type: 'ADD_TO_FIELD', owner: 'self',
              source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: true, filter: { cardType: 'シグニ', story: '怪異' } },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX24-P2-093 ／ 原文【自】：アタックフェイズ開始時、**あなたのトラッシュから＜植物＞のシグニ１枚を対象とし**、
  //   アップ状態のこのシグニをダウンしてもよい。そうした場合、**それを**エナゾーンに置く。
  // 🔴旧 live＝エナへ送るのが `DECK_CARD`＝**デッキの上から**になっており、トラッシュ回収が丸ごと別物になっていた。
  'WX24-P2-093': [
    {
      effectId: 'WX24-P2-093-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'DOWN',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', isUp: true, thisCardOnly: true } },
            optional: true,
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'IS_MY_TURN' },
            then: {
              type: 'ENERGY_CHARGE',
              target: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '植物' } },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P09-055 ／ 原文…それのパワーを＋5000する。**それが《…LION//メモリア》か《…LOVIT//メモリア》か《…WOLF//メモリア》の場合**、それは覚醒する。
  // 🔴旧 live＝カード名ゲートが落ちて**どのシグニでも覚醒**していた。
  'WXDi-P09-055': [
    {
      effectId: 'WXDi-P09-055-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '白', count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
            delta: 5000,
            duration: 'UNTIL_OPP_TURN_END',
          },
          {
            type: 'CONDITIONAL',
            condition: {
              type: 'LAST_PROCESSED_MATCHES',
              filter: { cardNames: ['コードハート　LION//メモリア', '幻獣　LOVIT//メモリア', '爆砲　WOLF//メモリア'] },
            },
            then: { type: 'AWAKEN_SIGNI' },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK06-024 ／ 原文【自】：このシグニがアタックしたとき、**そのアタックがこのターン四度目であなたのセンタールリグが＜エマ＞の場合**、以下の３つから１つを選ぶ。
  // 🔴旧 live＝2つの条件が**両方とも落ちて**、毎アタックで強力な3択が撃てた。
  'WXK06-024': [
    {
      effectId: 'WXK06-024-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: {
          type: 'AND',
          conditions: [
            { type: 'ATTACK_ORDINAL_THIS_TURN', owner: 'self', operator: 'eq', value: 4 },
            { type: 'LRIG_STORY', owner: 'self', story: 'エマ' },
          ],
        },
        then: {
          type: 'CHOOSE',
          choose_count: 1,
          from_count: 3,
          choices: [
            {
              choiceId: 'c0', label: '選択肢1',
              action: {
                type: 'ADD_TO_FIELD', owner: 'self',
                source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
              },
            },
            {
              choiceId: 'c1', label: '選択肢2',
              action: {
                type: 'BOUNCE',
                target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true, filter: { cardType: 'シグニ' } },
                optional: false,
              },
            },
            {
              choiceId: 'c2', label: '選択肢3',
              action: {
                type: 'SEQUENCE',
                steps: [
                  { type: 'DRAW', owner: 'self', count: 3 },
                  { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 3 },
                ],
              },
            },
          ],
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX21-044 ／ 原文【出】：**このシグニが＜遊具＞のシグニの効果によって手札から場に出た場合**、デッキの上から２枚エナゾーンに置く。
  // 🔴旧 live＝条件が落ちて**どんな出方でも毎回エナ加速**（普通に手出ししても発火）。
  // 受け皿は既存 `THIS_CARD_PLACED_BY_CLASS`。
  'WX21-044': [
    {
      effectId: 'WX21-044-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'THIS_CARD_PLACED_BY_CLASS', cardClass: '遊具' },
        then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // SPK01-09 ／ 原文【出】《黒》《黒》：あなたのトラッシュから《大罠　ハート・クイーン》以外の**レベルが奇数の**＜トリック＞のシグニ１枚を…
  // 🔴旧 live＝`levelParity` が落ちて**偶数レベルも回収**できた。
  'SPK01-09': [
    {
      effectId: 'SPK01-09-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      cost: { energy: [{ color: '黒', count: 1 }, { color: '黒', count: 1 }] },
      action: {
        type: 'TRANSFER_TO_HAND',
        source: {
          type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
          filter: { cardType: 'シグニ', story: 'トリック', levelParity: 'odd', excludeCardName: '大罠　ハート・クイーン' },
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK10-027 ／ 原文【常】：**【ランサー】を持つ**あなたの**パワー15000以上の緑の**シグニは【Ｓランサー】を得る。
  // 🔴旧 live＝**効果元自身に【ランサー】を付ける**という別物になっていた（3つのフィルタが全部落ちて対象も逆）。
  // 受け皿は既存＝`keyword` フィルタ（`TargetFilter.keyword`）＋`color`＋`powerRange`。
  'WXK10-027': [
    {
      effectId: 'WXK10-027-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_KEYWORD',
        target: {
          type: 'SIGNI', owner: 'self', count: 'ALL',
          filter: { cardType: 'シグニ', color: '緑', powerRange: { min: 15000 }, keyword: 'ランサー' },
        },
        keyword: 'Sランサー',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX24-P3-TK1A ／ E2「**このシグニがレベル２以下の場合**、**このゲームの間**、レベルを＋１」／
  //   E3「**このシグニがレベル３以上の場合**、対戦相手のシグニ１体とこのシグニをゲームから除外」
  // 🔴旧 live＝両方ともレベル条件が落ちて**無条件**（E2 は毎回レベルが上がり、E3 は毎ターン相打ちが強制）。
  //   E2 はさらに `until` が `UNTIL_END_OF_TURN`＝原文「このゲームの間」と食い違っていた。
  'WX24-P3-TK1A': [
    {
      effectId: 'WX24-P3-TK1A-E2',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_BANISH_OPPONENT'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'SELF_LEVEL_THRESHOLD', operator: 'lte', value: 2 },
        then: {
          type: 'LEVEL_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
          delta: 1,
          until: 'PERMANENT',
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX24-P3-TK1A-E3',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'any_opp',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'SELF_LEVEL_THRESHOLD', operator: 'gte', value: 3 },
        then: {
          type: 'SEQUENCE',
          steps: [
            { type: 'EXILE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } },
            { type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
          ],
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P10-070 ／ 原文：あなたのトラッシュから**それぞれ共通する色を持たず**無色ではないシグニ２枚を対象とし、それらをエナゾーンに置く。
  // 🔴旧 live＝「互いに色を共有しない」集合制約が落ち、**同色2枚でも取れた**。
  // 受け皿は既存 `SelectionConstraint.sharedColor:'none'`（PLAN §5.4 の「正準形」）。
  'WXDi-P10-070': [
    {
      effectId: 'WXDi-P10-070-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 1 }] },
      action: {
        type: 'ENERGY_CHARGE',
        target: {
          type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: false,
          filter: { cardType: 'シグニ', nonColorless: true },
          selectionConstraint: { sharedColor: 'none' },
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX20-042-CB ／ 原文【出】：あなたのトラッシュから**＜原子＞のシグニ３枚までと青のスペル１枚まで**を対象とし、それらをこのシグニの下に置く。
  // 🔴旧 live＝`count:1` のシグニ1枚だけ＝**＜原子＞制限も枚数も青スペルも欠落**。
  'WX20-042-CB': [
    {
      effectId: 'WX20-042-CB-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 3, upToCount: true, filter: { cardType: 'シグニ', story: '原子' } },
          { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 1, upToCount: true, filter: { cardType: 'スペル', color: '青' } },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX24-P4-040 ／ 原文【出】：対戦相手の手札を見て１枚選び、捨てさせる。
  //   **そのカードがコストの合計が１以下のスペルの場合**、対戦相手のトラッシュからそのスペルをコストを支払わずに使用してもよい。
  // 🔴旧 live＝コスト条件が落ちて**捨てさせた後に相手トラッシュの任意のスペルを踏み倒せた**。
  'WX24-P4-040': [
    {
      effectId: 'WX24-P4-040-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, actingPlayerSelects: true } },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'スペル', costMax: 1 } },
            then: {
              // ⚠`costThreshold` が使用コスト上限の正準形＝`filter.costMax` と併記すると逆翻訳が二重に出る。
              // 🆕`targetsLastProcessed`（2026-08-31 続き759）＝原文「**その**スペルを」＝
              //   いま捨てさせたカードそのもの。無いと**相手トラッシュの別のコスト1以下スペル**を使えた
              //   （条件側は既に在ったので、残っていたのは照応だけ）。
              type: 'PLAY_FREE', source: 'opp_trash',
              filter: { cardType: 'スペル' },
              costThreshold: 1,
              targetsLastProcessed: true,
              ignoreCost: true, ignoreRestrictions: true, optional: true,
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX18-056 ／ 原文【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、
  //   **このアタックフェイズの間にあなたのシグニが場からトラッシュに置かれていた場合**、－7000。
  // 🔴旧 live＝条件が丸ごと落ちて**毎アタック無条件に－7000**。
  // ⚠`PARTIAL`＝受け皿 `SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE` は「**場を離れた**」までしか見ない（行き先を問わない）＝
  //   エナ送り／手札戻しでも成立する**わずかな過剰**が残る。行き先つきの追跡は §5.3 へ送るべき別課題。
  'WX18-056': [
    {
      effectId: 'WX18-056-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'SIGNI_LEFT_FIELD_THIS_ATTACK_PHASE', owner: 'self' },
        then: {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
          delta: -7000,
        },
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'PARTIAL',
    },
  ],

  // WX24-P2-072 ／ 原文【自】《自分ターン》《ターン１回》：対戦相手のシグニ１体がこのシグニの正面に配置されたとき、
  //   **そのシグニのパワーが3000以下の場合、そのシグニを**バニッシュする。
  // 🔴旧 live＝パワー条件が落ちて**相手のどのシグニでもバニッシュできた**。
  // ⚠`PARTIAL`＝`BANISH` に `targetsTriggerSource` が無く「**その**シグニ」を名指しできない＝
  //   「パワー3000以下の相手シグニ1体」までしか絞れない（正面に置かれた個体とは限らない）。受け皿の追加は §5.3 へ。
  'WX24-P2-072': [
    {
      effectId: 'WX24-P2-072-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      triggerScope: 'any_opp',
      triggerCondition: { placedFront: true, turnOwner: 'self' },
      usageLimit: 'once_per_turn',
      action: {
        type: 'BANISH',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 3000 } } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'PARTIAL',
    },
  ],

  // WXK09-029 BURST ／ 原文：あなたのトラッシュから**無色ではない**シグニ１枚を対象とし、それを手札に加える。
  //   その後、あなたのトラッシュから**そのシグニと共通する色を持つ**スペル１枚を対象とし、それを手札に加える。
  // 🔴旧 live＝2ステップとも「シグニ」で色制限なし＝**2枚目がスペルですらなかった**。
  'WXK09-029': [
    {
      effectId: 'WXK09-029-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'TRANSFER_TO_HAND',
            source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', nonColorless: true } },
          },
          {
            type: 'TRANSFER_TO_HAND',
            source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'スペル', colorMatchesLastProcessed: true } },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
    // WXK09-029-E2 ／ 原文【起】《ターン１回》《無》**トラッシュにあるそれぞれ名前の異なるスペル３枚を
    //   ゲームから除外する**：対戦相手のシグニ１体を対象とし、それをデッキの一番上に置く。
    // 🔴旧 live＝**除外コストが丸ごと無く《無×1》だけで撃てた**。
    // 🏁**2026-09-02（§5.3 `O-206`）に `selectionConstraint` の enforce まで届いた**＝
    //   `costs.ts` に `trashExileCostSatisfied` / `canAddTrashExileIndex` / `trashExileAffordable` を新設し、
    //   **支払いモーダル2本（`SigniActivatedModal` / `LrigGrantedModal`）と可否ゲート**を同じ関数へ通した。
    //   旧は `size >= count` しか見ておらず**同名のスペル3枚でも払えた**（`energyTrash` とまったく同じ穴）。
    //   ⇒ `PARTIAL` → `MANUAL`。
    {"effectId":"WXK09-029-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}],"trashExile":{"count":3,"filter":{"cardType":"スペル"},"selectionConstraint":{"distinct":"name"}}},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"shuffle":false,"position":"top"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],




  // WXDi-CP02-TK02A ／ 🔴**効果 id が1つずつズレていた**（旧 live＝E1 に E2 の内容・E2 に E3 の内容）。
  //   原文 E1「【常】：【ランサー】。」／E2「【自】：このシグニがバトルによってシグニ１体をバニッシュしたとき、
  //   対戦相手のパワー10000以下のシグニ１体をバニッシュする。」／E3「【自】：対戦相手のターン終了時、このシグニをゲームから除外する。」
  //   ⚠旧 `manualEffects` は E1 だけを定義して**E2 の中身を入れていた**ので、【ランサー】が恒久 no-op・E3 も1つずつ後ろへずれていた。
  'WXDi-CP02-TK02A': [
    {
      effectId: 'WXDi-CP02-TK02A-E2',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_BATTLE'],
      triggerScope: 'self',
      action: {
        type: 'BANISH',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 10000 } } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX20-040 ／ 原文【自】：このシグニがアタックしたとき、**あなたの場に【トラップ】が３枚以上ある場合**、デッキの一番上をエナゾーンへ。
  // 🔴旧 live＝条件が落ちて**毎アタック無条件にエナ加速**。
  // 受け皿＝`HAS_TRAP_IN_FIELD` に `minCount` を足した（2026-08-31・型＋両評価器）。
  'WX20-040': [
    {
      effectId: 'WX20-040-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'HAS_TRAP_IN_FIELD', owner: 'self', minCount: 3 },
        then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],



  // WXDi-P03-071 BURST ／ 原文：**どちらか１つを選ぶ**。①対戦相手のシグニ１体を対象とし、それをダウンする。対戦相手は手札を１枚捨てる。②カードを２枚引く。
  // 🔴旧 live＝選択肢そのものが消え、**①の後半（相手の手札破棄）だけ**が残っていた。
  'WXDi-P03-071': [
    {
      effectId: 'WXDi-P03-071-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'c0', label: '選択肢1',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } },
                { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
              ],
            },
          },
          { choiceId: 'c1', label: '選択肢2', action: { type: 'DRAW', owner: 'self', count: 2 } },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-D07-017 ／ 原文【チーム自】：アタックフェイズ開始時、**対戦相手のエナゾーンにカードが２枚以上あり
  //   このターンにあなたがカードを１枚以上捨てていた場合**、対戦相手は自分のエナから1枚選びトラッシュ。
  // 🔴旧 live＝チーム条件だけが残り、**2つの発動条件が丸ごと落ちて毎ターン無条件**だった。
  'WXDi-D07-017': [
    {
      effectId: 'WXDi-D07-017-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'LRIG_TEAM_COUNT', owner: 'self', team: 'デウス・エクス・マキナ', operator: 'gte', value: 3 },
      action: {
        type: 'CONDITIONAL',
        condition: {
          type: 'AND',
          conditions: [
            { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'gte', value: 2 },
            { type: 'TURN_HAND_DISCARD_GTE', owner: 'self', value: 1 },
          ],
        },
        then: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 }, opponentSelects: true },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P06-035 ／ 原文【出】：手札をすべて捨てる。その後、**この方法でカードを２枚捨てた場合**、パワー10000以下のシグニ1体をバニッシュ。
  //   **３枚以上捨てた場合、代わりに**対戦相手のシグニ1体をバニッシュ。
  // 🔴旧 live＝上位帯（3枚以上）が**無条件の追加バニッシュ**になっており、「代わりに」の排他が消えて**2体**バニッシュできた。
  'WXDi-P06-035': [
    {
      effectId: 'WXDi-P06-035-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 3 },
            then: {
              type: 'BANISH',
              target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
            },
            else: {
              type: 'CONDITIONAL',
              condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 2 },
              then: {
                type: 'BANISH',
                target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 10000 } } },
              },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX14-004 ／ 原文③「**【アサシン】【ランサー】【ダブルクラッシュ】のいずれかを持つ**すべてのシグニをバニッシュする」
  // 🔴旧 live＝キーワード条件が落ちて**両者のすべてのシグニを全部バニッシュ**する選択肢になっていた（盤面全消し）。
  // 受け皿は既存＝`TargetFilter.keyword` の配列形（OR）。
  'WX14-004': [
    {
      effectId: 'WX14-004-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '赤', count: 2 }, { color: '黒', count: 1 }, { color: '無', count: 2 }] },
      action: {
        type: 'CHOOSE',
        choose_count: 2,
        from_count: 4,
        upTo: true,
        choices: [
          {
            choiceId: 'c0', label: '選択肢1',
            action: {
              type: 'POWER_MODIFY',
              target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: true },
              delta: -8000,
            },
          },
          {
            choiceId: 'c1', label: '選択肢2',
            action: {
              type: 'BANISH',
              target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', powerRange: { max: 7000 } } },
            },
          },
          {
            choiceId: 'c2', label: '選択肢3',
            action: {
              type: 'BANISH',
              target: {
                type: 'SIGNI', owner: 'any', count: 'ALL',
                filter: { cardType: 'シグニ', keyword: ['アサシン', 'ランサー', 'ダブルクラッシュ'] },
              },
            },
          },
          {
            choiceId: 'c3', label: '選択肢4',
            action: {
              type: 'TRANSFER_TO_HAND',
              source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true, filter: { cardType: 'シグニ' } },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-D04-007 ／ 原文【出】：ターン終了時まで、**対象のあなたのシグニ１体は【アサシン】を得、対象のあなたのシグニ１体は【ランサー】を得る**。
  // 🔴旧 live＝**【ランサー】の付与が丸ごと欠落**していた（片方だけ）。
  'WXDi-D04-007': [
    {
      effectId: 'WXDi-D04-007-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'GRANT_KEYWORD',
            target: { type: 'SIGNI', owner: 'self', count: 1, explicitTarget: true },
            keyword: 'アサシン',
            duration: 'UNTIL_END_OF_TURN',
          },
          {
            type: 'GRANT_KEYWORD',
            target: { type: 'SIGNI', owner: 'self', count: 1, explicitTarget: true },
            keyword: 'ランサー',
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX21-062 ／ 原文【自】：このシグニがアタックしたとき、パワーが5000以上の場合、**あなたのデッキの一番上のカードをエナゾーンに置き**カードを１枚引く。
  // 🔴旧 live＝**エナチャージが丸ごと欠落**してドローだけになっていた。
  'WX21-062': [
    {
      effectId: 'WX21-062-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'SELF_POWER_GTE', value: 5000 },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
          { type: 'DRAW', owner: 'self', count: 1 },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ── `LOOK_PICK_CHAIN{then:'under'}` の3枚（受け皿を 2026-08-31 に新設）──────────────
  // 🔴どれも旧 live は `LOOK_AND_REORDER` 単独＝**選択段が丸ごと消え、公開札が全部デッキの一番下**へ行っていた
  //   （＝「下に置く」が恒久 no-op）。

  // WXDi-P11-047 ／ 原文【出】：デッキの上から３枚見る。その中から**＜地獣＞のシグニを２枚までこのシグニの下に置き**、残りを好きな順番でデッキの一番下に置く。
  'WXDi-P11-047': [
    {
      effectId: 'WXDi-P11-047-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'LOOK_PICK_CHAIN',
        owner: 'self',
        revealCount: 3,
        stages: [{ filter: { cardType: 'シグニ', story: '地獣' }, pickCount: 2, pickUpTo: true, then: 'under' }],
        remainder: { location: 'deck', position: 'bottom', reorder: true },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P10-040 ／ 原文【起】：デッキの上から３枚見る。その中から**スペルと青のシグニをそれぞれ１枚までこのシグニの下に置き**、残りを好きな順番でデッキの一番下に置く。
  'WXDi-P10-040': [
    {
      effectId: 'WXDi-P10-040-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 0 }] },
      usageLimit: 'once_per_turn',
      action: {
        type: 'LOOK_PICK_CHAIN',
        owner: 'self',
        revealCount: 3,
        stages: [
          { filter: { cardType: 'スペル' }, pickCount: 1, pickUpTo: true, pickNoun: 'スペル', then: 'under' },
          { filter: { cardType: 'シグニ', color: '青' }, pickCount: 1, pickUpTo: true, then: 'under' },
        ],
        remainder: { location: 'deck', position: 'bottom', reorder: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P09-044 ／ 原文【起】《緑》：デッキの上から２枚見る。その中から**１枚をこのシグニの下に置き**、残りを好きな順番でデッキの一番下に置く。
  'WXDi-P09-044': [
    {
      effectId: 'WXDi-P09-044-E2',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 1 }] },
      action: {
        type: 'LOOK_PICK_CHAIN',
        owner: 'self',
        revealCount: 2,
        stages: [{ pickCount: 1, pickNoun: 'カード', then: 'under' }],
        remainder: { location: 'deck', position: 'bottom', reorder: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // census 高シグナル 21効果の是正（2026-08-30・速いレーン §2.0）
  // どれも **原文を読み直して手で書き直した**（parser 出力の移設ではない＝`O-42` tripwire 対象外）。
  // 検証＝`build:effects` → 逆翻訳を目視 → `npm run gates`。
  // ══════════════════════════════════════════════════════════════════════════════

  // WXK10-062 ／ 原文【常】：あなたの**ドライブ状態の**シグニのパワーを＋2000する。
  // 🔴旧 live＝`{SIGNI owner:'any' count:1}` フィルタ無し＝**両者の任意の1体**（対象も枚数も持ち主も誤り）。
  // 受け皿は既存＝`isDrive`（`WXK01-001-E1` と同型）。
  'WXK10-062': [
    {
      effectId: 'WXK10-062-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', isDrive: true } },
        delta: 2000,
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK10-060 ／ 原文【常】：**このシグニと同じシグニゾーンに【シード】があるかぎり**、このシグニのパワーは＋3000される。
  // 🔴旧 live＝条件が丸ごと落ちて**無条件で常時＋3000**。受け皿は既存 `SAME_ZONE_HAS_SEED`（ActiveCondition）。

  // SPDi43-08 ／ 原文【常】《自分ターン》：**このシグニに【ソウル】が付いているかぎり**、このシグニのパワーは＋5000される。
  // 🔴旧 live＝`TURN_OWNER` だけで**ソウル条件が丸ごと欠落**＝自分ターンなら常時＋5000。
  // 受け皿は既存 `IS_SELF_SOUL_ATTACHED`（同弾の `SPDi43-09/10` が使用済み）。
  'SPDi43-08': [
    {
      effectId: 'SPDi43-08-E1',
      effectType: 'CONTINUOUS',
      activeCondition: {
        type: 'AND',
        conditions: [{ type: 'TURN_OWNER', owner: 'self' }, { type: 'IS_SELF_SOUL_ATTACHED' }],
      },
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
        delta: 5000,
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P04-014 ／ 原文【常】：**このカードが【ソウル】として付いているシグニは**「【自】《ターン１回》：
  //   このシグニがアタックしたとき、あなたのトラッシュから《ガードアイコン》を持たないシグニ１枚を対象とし、それを手札に加える。」を得る。
  // 🔴旧 live＝引用能力が**平坦化**され、CONTINUOUS が直接 `TRANSFER_TO_HAND` を持っていた
  //   （＝ホストへの付与でも「アタックしたとき」でもない）。
  // 受け皿は既存 `GRANT_SOUL_HOST_ABILITY`（同カード群 `WXDi-P04-011-E1` が同型で実装済み）。
  'WXDi-P04-014': [
    {
      effectId: 'WXDi-P04-014-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_SOUL_HOST_ABILITY',
        abilities: [
          {
            effectId: 'WXDi-P04-014-E1-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_SIGNI'],
            triggerScope: 'self',
            usageLimit: 'once_per_turn',
            action: {
              type: 'TRANSFER_TO_HAND',
              source: {
                type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
                filter: { cardType: 'シグニ', noGuard: true },
              },
            },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXEX1-49 ／ 原文【自】：このシグニがアタックしたとき、あなたのトラッシュから**パワー7000以下の**＜悪魔＞のシグニ１枚を…
  // 🔴旧 live＝両分岐とも `powerRange` が無く、**トラッシュの＜悪魔＞なら何でも**回収／場出しできた。

  // WXDi-CP02-035 ／ 原文【出】：対戦相手のシグニ１体を対象とし、それをデッキの一番下に置く。
  //   **それのパワーが15000以上の場合**、対戦相手は手札を１枚捨てる。
  // 🔴旧 live＝15000ゲートが丸ごと落ちて**手札破棄が無条件**（過剰効果）。
  // 受け皿は既存 `LAST_PROCESSED_MATCHES`（直前にデッキ下へ置いたシグニを見る）。
  'WXDi-CP02-035': [
    {
      effectId: 'WXDi-CP02-035-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'TRANSFER_TO_DECK',
            source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } },
            shuffle: false, position: 'bottom',
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_MATCHES', filter: { powerRange: { min: 15000 } } },
            then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P07-064 ／ 原文【出】：あなたのデッキの上からカードを３枚公開し、それらのカードを好きな順番で**デッキの一番下**に置く。…
  // 🔴旧 live＝`destination.position:'top'`＝原文と**逆のゾーン端**へ戻していた（公開分がそのままデッキトップに残る）。
  'WXDi-P07-064': [
    {
      effectId: 'WXDi-P07-064-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 3, private: false, reorder: true, canTrash: false,
            destination: { location: 'deck', owner: 'self', position: 'bottom' },
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_ALL_MATCH', filter: { level: 1, cardType: 'シグニ' } },
            then: {
              type: 'BANISH',
              target: {
                type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false,
                filter: { cardType: 'シグニ', powerRange: { max: 3000 } },
              },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P09-068 ／ 原文【出】：あなたのデッキの一番上を公開する。そのカードがレベル１のシグニの場合、カードを１枚引く。
  //   **そうでない場合、そのカードをデッキの一番下に置く。**
  // 🔴旧 live＝`remainder.position:'top'`＝外れたカードが**一番上に残る**（原文はデッキの一番下）。
  'WXDi-P09-068': [
    {
      effectId: 'WXDi-P09-068-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount: 1,
        filter: { cardType: 'シグニ', level: 1 },
        pickCount: 1,
        then: { type: 'DRAW', owner: 'self', count: 1 },
        remainder: { location: 'deck', position: 'bottom' },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P05-009 ／ 原文【出】：あなたのデッキの上からカードを３枚見る。**その中からカードを１枚までデッキの一番上に戻し**、
  //   残りを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝`LOOK_AND_REORDER` 単独＝**選択段が丸ごと落ち**、3枚とも一番下へ行っていた（デッキトップ固定ができない）。
  // 受け皿は既存 `LOOK_PICK_CHAIN` の `then:'deck_top'`（`effectExecutor.ts:6615` が `INTERNAL_KEEP_ON_DECK_TOP` で予約）。

  // WX25-P1-098 ／ 原文【出】：あなたのデッキの上からカードを３枚見る。**その中からカードを１枚までトラッシュに置き**、
  //   残りを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝`LOOK_AND_REORDER{canTrash:true}`＝**上限が無く**公開した3枚すべてを捨てられた（PLAN §5.4(ii) の既知項目）。
  'WX25-P1-098': [
    {
      effectId: 'WX25-P1-098-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'LOOK_PICK_CHAIN',
        owner: 'self',
        revealCount: 3,
        stages: [{ pickCount: 1, pickUpTo: true, pickNoun: 'カード', then: 'trash' }],
        remainder: { location: 'deck', position: 'bottom', reorder: true },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK05-035 ／ 原文【出】：対戦相手のシグニ１体を対象とし、**このシグニの下にレベル１、レベル２、レベル３のシグニがある場合**、それをバニッシュする。
  // 🔴旧 live＝条件が落ち、代わりに**対象側へ `level:3`** が付いていた（＝無条件でレベル3だけをバニッシュ＝二重に誤り）。
  'WXK05-035': [
    // 🆕E1＝「このシグニの下にレベル４のシグニが３枚あるかぎり、パワー＋2000／対戦相手のルリグの効果を受けない」。
    //   🔴旧 live は「かぎり」条件が丸ごと落ちて**常時**発動していた（census 高シグナル 第5弾）。
    {"effectId":"WXK05-035-E1","effectType":"CONTINUOUS","activeCondition":{"type":"THIS_CARD_HAS_UNDER","filter":{"cardType":"シグニ","level":4},"minCount":3},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2000},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["ルリグ"],"sourceOwner":"opponent","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {
      effectId: 'WXK05-035-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'CONDITIONAL',
        condition: {
          type: 'AND',
          conditions: [
            { type: 'THIS_CARD_HAS_UNDER', filter: { cardType: 'シグニ', level: 1 } },
            { type: 'THIS_CARD_HAS_UNDER', filter: { cardType: 'シグニ', level: 2 } },
            { type: 'THIS_CARD_HAS_UNDER', filter: { cardType: 'シグニ', level: 3 } },
          ],
        },
        then: {
          type: 'BANISH',
          target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK07-087 ／ 原文【出】《黒》：**場にレベル１、レベル２、レベル３、レベル４のシグニがある場合**、カードを１枚引く。
  // 🔴旧 live＝条件が丸ごと落ちて**無条件ドロー**。⚠「場に」は両者の場（`owner:'any'`＝`execUtils.ts` の
  //   `HAS_CARD_IN_FIELD` が両 state を見る）。
  'WXK07-087': [
    {
      effectId: 'WXK07-087-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      cost: { energy: [{ color: '黒', count: 1 }] },
      action: {
        type: 'CONDITIONAL',
        condition: {
          type: 'AND',
          conditions: [
            { type: 'HAS_CARD_IN_FIELD', owner: 'any', filter: { cardType: 'シグニ', level: 1 } },
            { type: 'HAS_CARD_IN_FIELD', owner: 'any', filter: { cardType: 'シグニ', level: 2 } },
            { type: 'HAS_CARD_IN_FIELD', owner: 'any', filter: { cardType: 'シグニ', level: 3 } },
            { type: 'HAS_CARD_IN_FIELD', owner: 'any', filter: { cardType: 'シグニ', level: 4 } },
          ],
        },
        then: { type: 'DRAW', owner: 'self', count: 1 },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX13-032 BURST ／ 原文：あなたのデッキの一番上を公開する。**それが《ライフバースト》を持っていた場合**、それをライフクロスに加える。
  // 🔴旧 live＝公開してデッキトップへ戻したうえで**無条件に**デッキトップをライフへ加えていた（LB判定が丸ごと欠落）。
  // 受け皿は既存 `REVEAL_AND_PICK{filter:{hasLifeBurst}}`＋`remainder`（外れたら一番上のまま）。
  'WX13-032': [
    {
      effectId: 'WX13-032-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount: 1,
        filter: { hasLifeBurst: true },
        pickCount: 1,
        pickNoun: 'カード',
        then: { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: false, fromSearch: true },
        remainder: { location: 'deck', position: 'top' },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK07-050 ／ 原文…ターン終了時まで、あなたの**パワー10000以上の**すべてのシグニは【ランサー】を得、
  //   **15000以上の**すべてのシグニは【Ｓランサー】を得る。
  // 🔴旧 live＝【ランサー】付与が**丸ごと欠落**し、【Ｓランサー】が**フィルタ無しで自分の全シグニ**に付いていた。
  'WXK07-050': [
    {
      effectId: 'WXK07-050-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 2 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'ATTACH_CHARM',
            charm: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { story: '微菌' } },
            to: { type: 'SIGNI', owner: 'self', count: 1 },
          },
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 'ALL', upToCount: false, filter: { cardType: 'シグニ', hasCharm: true } },
            delta: 3000,
            duration: 'UNTIL_END_OF_TURN',
          },
          {
            type: 'GRANT_KEYWORD',
            target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', powerRange: { min: 10000 } } },
            keyword: 'ランサー',
            duration: 'UNTIL_END_OF_TURN',
          },
          {
            type: 'GRANT_KEYWORD',
            target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', powerRange: { min: 15000 } } },
            keyword: 'Sランサー',
            duration: 'UNTIL_END_OF_TURN',
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P01-004 ／ 原文【使用条件】**あなたの場に青と緑のルリグがいる**／あなたのライフクロスが０枚の場合、…
  // 🔴旧 live＝【使用条件】が丸ごと落ち、ライフ0条件だけが残っていた（＝色を問わず使える過剰効果）。
  // ⚠「ルリグ」はセンター＋アシストの両方＝`cardType` は配列形（PLAN §5.4(ii) の既知の落とし穴）。
  'WXDi-P01-004': [
    {
      effectId: 'WXDi-P01-004-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 3 }] },
      condition: {
        type: 'AND',
        conditions: [
          { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: ['ルリグ', 'アシストルリグ'], color: '青' } },
          { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: ['ルリグ', 'アシストルリグ'], color: '緑' } },
          { type: 'LIFE_COUNT', owner: 'self', operator: 'eq', value: 0 },
        ],
      },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'SHUFFLE_DECK', owner: 'self' },
          { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P05-016 ／ 原文【出】：対戦相手の手札を見て１枚選び、**デッキの一番下に置く**。
  // 🔴旧 live＝`TRASH`＝原文に無い**トラッシュ送り**（デッキ下より強い＝過剰効果）。
  'WXDi-P05-016': [
    {
      effectId: 'WXDi-P05-016-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'TRANSFER_TO_DECK',
        source: { type: 'HAND_CARD', owner: 'opponent', count: 1 },
        shuffle: false,
        position: 'bottom',
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P03-038 ／ 原文【自】：このシグニがアタックしたとき、**このシグニの下に白の＜天使＞がある場合**、次の対戦相手の
  //   ターン終了時まで、このシグニのパワーは＋3000されこのシグニは【シャドウ】を得る。**青の＜天使＞がある場合**、カードを２枚引く。
  //   **緑の＜天使＞がある場合**、【エナチャージ２】をする。
  // 🔴旧 live＝3つの条件が**すべて落ちて**3つの効果が無条件に全部乗り、【シャドウ】付与も欠落していた。
  'WXDi-P03-038': [
    {
      effectId: 'WXDi-P03-038-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'CONDITIONAL',
            condition: { type: 'THIS_CARD_HAS_UNDER', filter: { cardClass: '天使', color: '白' } },
            then: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'POWER_MODIFY',
                  target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
                  delta: 3000,
                  duration: 'UNTIL_OPP_TURN_END',
                },
                {
                  type: 'GRANT_KEYWORD',
                  target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
                  keyword: 'シャドウ:{"cardType":"シグニ"}',
                  duration: 'UNTIL_OPP_TURN_END',
                },
              ],
            },
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'THIS_CARD_HAS_UNDER', filter: { cardClass: '天使', color: '青' } },
            then: { type: 'DRAW', owner: 'self', count: 2 },
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'THIS_CARD_HAS_UNDER', filter: { cardClass: '天使', color: '緑' } },
            then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 },
          },
        ],
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P02-036 ／ 原文【自】：このシグニがアタックしたとき、あなたのデッキの上からカードを４枚公開する。
  //   **その中にレベル１のシグニが３枚以上ある場合**、次の対戦相手のターン終了時まで、このシグニのパワーは＋3000され、
  //   このシグニは【シャドウ】を得る。この効果で公開したカードを好きな順番でデッキの一番下に置く。
  // 🔴旧 live＝3枚以上ゲートが落ちて**無条件に＋3000**、【シャドウ】付与も欠落、公開札は `count:0` の空 LOOK で
  //   一番下へ戻す振りをしていた（実際はデッキトップに残る）。
  'WXDi-P02-036': [
    {
      effectId: 'WXDi-P02-036-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 4, private: false, reorder: true, canTrash: false,
            destination: { location: 'deck', owner: 'self', position: 'bottom' },
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', level: 1 }, minCount: 3 },
            then: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'POWER_MODIFY',
                  target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
                  delta: 3000,
                  duration: 'UNTIL_OPP_TURN_END',
                },
                {
                  type: 'GRANT_KEYWORD',
                  target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
                  keyword: 'シャドウ:{"cardType":"シグニ"}',
                  duration: 'UNTIL_OPP_TURN_END',
                },
              ],
            },
          },
        ],
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P13-009 ／ 原文【自】：あなたのアタックフェイズ開始時、あなたの場に《ディソナアイコン》のシグニが２体以上ある場合、
  //   【エナチャージ１】をし、**その後、あなたのエナゾーンからシグニを１枚まで対象とし、それを手札に加える**。
  // 🔴旧 live＝**後段（エナ→手札の回収）が丸ごと欠落**していた。
  'WXDi-P13-009': [
    {
      effectId: 'WXDi-P13-009-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', isDisona: true }, minCount: 2 },
        then: {
          type: 'SEQUENCE',
          steps: [
            { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
            {
              type: 'TRANSFER_TO_HAND',
              source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true, filter: { cardType: 'シグニ' } },
            },
          ],
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P03-030 ／ 原文【チーム自】：あなたのアタックフェイズ開始時、あなたの場に青と緑と黒のシグニがある場合、
  //   【エナチャージ１】をし、**その後、あなたのエナゾーンからシグニを１枚まで対象とし、それを手札に加える**。
  // 🔴旧 live＝`WXDi-P13-009` と同じく**後段が丸ごと欠落**。
  'WXDi-P03-030': [
    {
      effectId: 'WXDi-P03-030-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'LRIG_TEAM_COUNT', owner: 'self', team: 'DIAGRAM', operator: 'gte', value: 3 },
      action: {
        type: 'CONDITIONAL',
        condition: {
          type: 'AND',
          conditions: [
            { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: '青' } },
            { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: '緑' } },
            { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: '黒' } },
          ],
        },
        then: {
          type: 'SEQUENCE',
          steps: [
            { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
            {
              type: 'TRANSFER_TO_HAND',
              source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true, filter: { cardType: 'シグニ' } },
            },
          ],
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P05-014 ／ 原文【自】：このルリグがアタックしたとき、**対戦相手の手札が３枚以下である場合**、カードを１枚引く。
  //   **４枚以上ある場合**、対戦相手は手札を１枚捨てる。
  // 🔴旧 live＝2つの排他的な帯が**両方とも無条件**に実行され、常にドロー＋相手の手札破棄になっていた。
  'WXDi-P05-014': [
    {
      effectId: 'WXDi-P05-014-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_LRIG'],
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'HAND_COUNT', owner: 'opponent', operator: 'lte', value: 3 },
        then: { type: 'DRAW', owner: 'self', count: 1 },
        else: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX24-P1-013 ロストコード・ピルルク（§5.2 カード単位バッチ第2回・2026-08-30）
  // 原文【自】《自分ターン》《ターン１回》：あなたの＜電機＞のシグニ１体が場に出たとき、
  //   あなたのトラッシュから**そのシグニと共通する色を持つスペル**１枚を対象とし、それを手札に加える。
  // 🔴旧 live の穴は**2つ**＝①**回収する種別が「シグニ」になっていた**（原文は**スペル**）
  //   ②**「そのシグニと共通する色を持つ」の色条件が丸ごと無い**＝トラッシュの任意のシグニを回収できた。
  // 受け皿＝`cardType` は自明、色は 🆕`colorMatchesTriggerSource`（本バッチで新設）。
  // ⚠**`colorMatchesLastProcessed` では駄目**＝あちらは `lastProcessedCards[0]`（この効果が直前に処理した札）を見るが、
  //   ここで要るのは **`ctx.triggeringCardNum`**（＝【自】を誘発させた「そのシグニ」）＝**常に空ヒットになる**。
  // ⚠**同型は原文で7枚**（`SPDi01-121` / `WX14-003` / `WXK09-029` / `WX24-P4-105` / `WX25-P1-115` / `WX25-P3-110`）＝
  //   **用法を確認して parser へ回すのが本筋**（§2.0 の3枚以上ルール）。本バッチは受け皿の新設と1枚の実証まで。
  'WX24-P1-013': [
    {
      effectId: 'WX24-P1-013-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      triggerScope: 'any_ally',
      triggerFilter: { story: '電機' },
      triggerCondition: { turnOwner: 'self' },
      usageLimit: 'once_per_turn',
      action: {
        type: 'TRANSFER_TO_HAND',
        source: {
          type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
          filter: { cardType: 'スペル', colorMatchesTriggerSource: true },
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX21-071 ワイズ・スパーク（§5.3 `O-166`・2026-08-30）
  // 原文「…それのパワーを－8000する。**この効果によってそのシグニのパワーが０以下になった場合、
  //   カードを１枚引き**、対戦相手は手札を１枚捨てる。」
  // 🔴旧 live の穴は**2つ**＝①**0以下ゲートが丸ごと無く**相手の手札破棄が無条件だった
  //   ②**自分のドロー1枚が丸ごと欠落**していた。
  // ⚠parser の `O-166` 汎用規則（`effectParser.ts`）はこの効果に届かない（スペルの文分割で
  //   「この効果によって〜」が別ブロックに落ちる）ので手書きにした。**同型は他に無い**（残り5効果は parser 側で解決済み）。
  // ⚠先頭の `CONDITIONAL{IS_MY_TURN}` は**「そうした場合」の慣例エンコード**（`effectExecutor.ts:2102/4430/4500` が
  //   特別処理する／PLAN 付録B-9）＝原文「捨ててもよい。そうした場合、使用コストは《黒×0》になる」に対応。**触らない。**
  'WX21-071': [
    {
      effectId: 'WX21-071-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '黒', count: 1 }, { color: '青', count: 1 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } },
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false },
            delta: -8000,
          },
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_POWER_LTE', value: 0 },
            then: {
              type: 'SEQUENCE',
              steps: [
                { type: 'DRAW', owner: 'self', count: 1 },
                { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
              ],
            },
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // 2026-08-30 §5.2 **カード単位バッチ 第1回**（`census` と `audit` が**両方**立つ86枚から）。
  // 母集団の作り方＝`npm run census:cards -- --list` の `census,audit` かつ **`mech` が立たない**行
  // （`mech`＝PLAN §5.3 に名指しされた機構待ち。同日に計器へ追加した＝188枚）。
  // 🔑**3件とも受け皿は既存**＝新しい型・条件型・payload キーの新設は **0本**。
  // ══════════════════════════════════════════════════════════════════════════════

  // PR-046 星占の巫女　リメンバ・ナイト
  // 原文【起】《無》《無》**手札から白か青のシグニを１枚捨てる**：シグニ１体を対象とし、それを凍結する。
  // 🔴旧＝`cost` が `energy:[無,無]` だけで、**手札コストが丸ごと無い**＝エナ2つで撃ち放題だった。
  // 受け皿＝`cost.discard` ＋ `cost.discardFilter`（`effects.ts:638-639`）。色の OR は `color: string[]`（同797行）。
  'PR-046': [
    {
      effectId: 'PR-046-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: {
        energy: [{ color: '無', count: 1 }, { color: '無', count: 1 }],
        discard: 1,
        discardFilter: { cardType: 'シグニ', color: ['白', '青'] },
      },
      action: { type: 'FREEZE', target: { type: 'SIGNI', owner: 'any', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // SP27-010 火電一閃
  // 原文②「カードを１枚引く。**このターンに対戦相手がスペルを使用していた場合、追加で**カードを１枚引く。」
  // 🔴旧＝`SEQUENCE[DRAW 1, DRAW 1]`＝**条件なしで常に2枚引いていた**（過剰効果）。
  // 受け皿＝`SPELL_USED_THIS_TURN{owner}`（`effects.ts:363`／`execUtils.ts:1950` が `actions_done` の
  // `'USE_SPELL'` を数える）。⚠**この効果の owner は `opponent`**＝自分のスペル使用では成立しない。
  // ⚠①③は旧のまま（③の「対象とし、〜の場合、バニッシュ」＝`CONDITIONAL{then:BANISH}` は既存の慣例エンコード）。
  // ⚠アンコール注記が `cost` に出ないのは**偽陽性パターン**（PLAN 付録B-5）＝触らない。
  'SP27-010': [
    {
      effectId: 'SP27-010-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '赤', count: 1 }] },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 3,
        choices: [
          { choiceId: 'c0', label: '選択肢1', action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', level: { max: 2 }, excludeResona: true }, upToCount: false } } },
          { choiceId: 'c1', label: '選択肢2', action: { type: 'SEQUENCE', steps: [
            { type: 'DRAW', owner: 'self', count: 1 },
            { type: 'CONDITIONAL', condition: { type: 'SPELL_USED_THIS_TURN', owner: 'opponent' }, then: { type: 'DRAW', owner: 'self', count: 1 } },
          ] } },
          { choiceId: 'c2', label: '選択肢3', action: { type: 'CONDITIONAL', condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'eq', value: 0 }, then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 12000 } }, upToCount: false } } } },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WDK05-T14 讃の遊　ユキガッセン
  // 原文【出】：対戦相手のレベル３以下のシグニ１体を対象とし、**あなたのターンにこのシグニがデッキから場に出た場合**、それを手札に戻す。
  // 🔴旧＝`BOUNCE` 無条件＝**手札から普通に召喚しても、相手ターンに出ても**バウンスしていた。
  // 受け皿＝`IS_MY_TURN`（`effects.ts:491`）と `THIS_CARD_FROM_DECK`（同475／`execUtils.ts` が
  // `signi_played_from_deck` を見る）を `AND`（同490）で束ねる。**3つとも既存**。
  // ⚠発動条件（効果レベルの `condition`）に置く＝原文の「〜場合」は発動そのもののゲート。
  'WDK05-T14': [
    {
      effectId: 'WDK05-T14-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      condition: { type: 'AND', conditions: [{ type: 'IS_MY_TURN' }, { type: 'THIS_CARD_FROM_DECK' }] },
      action: { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', level: { max: 3 } } }, optional: false },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],
  // 2026-08-28 §5.3 `O-133` B群 第15バッチ＝**残る B群162効果を逐語移設して B を 0 にした**。
  // 🔑**いずれも「live が手作りで正・parser が別物を出す」型で、live 側の挙動バグではない**（凍っている＝live が動いている）。
  // **parser の欠陥のうち「凍っていない他カードにも効く systemic なもの」は本セッションで15本以上直した**（BUGFIXES.md 参照）。
  // 残りは**そのカード固有の表現**なので、parser 規則を211種類足すのではなく出所を与える側に倒した。
  // ⚠**実体は1バイトも変えていない**（live からのコピー）＝A/B で実体変化0を確認。
  // ⚠parser が追いついたら `npx tsx scripts/censusManualDrift.ts` の「削除候補（実体同一）」に載る＝**そこが次の畳みどころ**。
  "WX03-046": [
    {"effectId":"WX03-046-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"any","count":1},"delta":5000},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_POWER_GTE","value":15000,"addDelta":5000},"then":{"type":"GRANT_KEYWORD","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"any","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX04-002": [
    {"effectId":"WX04-002-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energyTrashColorAll":"赤"},"action":{"type":"CONDITIONAL","condition":{"type":"ENERGY_TRASH_COLOR_COUNT_GTE","value":3},"then":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX04-009": [
    {"effectId":"WX04-009-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"keyword":"マルチエナ"}},"opponentSelects":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX04-025": [
    {"effectId":"WX04-025-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"黒","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1}},{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1},"opponentSelects":true}]},{"type":"CONDITIONAL","condition":{"type":"FIELD_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX05-009": [
    {"effectId":"WX05-009-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"龍獣","isUp":true},"upToCount":false}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteLastProcessed":true},"upToCount":false},"conditional":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX05-012": [
    {"effectId":"WX05-012-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"青","count":1},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":5},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"distinctName":true,"minCount":3},"then":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"down":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"distinctName":true,"minCount":4},"then":{"type":"DRAW","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"distinctName":true,"operator":"eq","value":5},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":5,"private":false,"reorder":true,"destination":{"location":"deck","owner":"self","position":"bottom"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX05-013": [
    {"effectId":"WX05-013-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":3},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":"ALL"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"美巧"},"distinctName":true,"minCount":8},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX05-081": [
    {"effectId":"WX05-081-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"CHOOSE","choose_count":2,"from_count":2,"upTo":true,"choices":[{"choiceId":"WX05-081-E1-c1","label":"デッキの上から3枚トラッシュ→トラッシュからレベル2以下の黒シグニを場に出す","action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":3},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":{"max":2},"color":"黒"}}}]}},{"choiceId":"WX05-081-E1-c2","label":"センタールリグがレベル4以上で黒なら、トラッシュから黒シグニを場に出す","action":{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":4},{"type":"LRIG_COLOR","owner":"self","color":"黒"}]},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX06-014": [
    {"effectId":"WX06-014-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":5,"filter":{"cardType":"シグニ","story":"古代兵器"}},"shuffle":false,"position":"bottom"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WX09-Re03": [
    {"effectId":"WX09-Re03-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"白","count":2},{"color":"青","count":2}]},"action":{"type":"STUB","id":"CONDITIONAL_MULTI_CHOOSE_BY_CENTER"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX13-019": [
    {"effectId":"WX13-019-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"pickCount":1,"then":"hand","pickNoun":"カード"},{"pickCount":1,"then":"energy","pickNoun":"カード"}],"remainder":{"location":"deck","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX13-036": [
    {"effectId":"WX13-036-E1","effectType":"AUTO","timing":["ON_OPP_POWER_DECREASED"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"delta":0,"deltaFromOppPowerDecrease":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"byOwnEffect":true}},
  ],
  "WX14-074": [
    {"effectId":"WX14-074-E1","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"LRIG_COLOR","owner":"self","color":"黒"}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-3000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX14-078": [
    {"effectId":"WX14-078-E1","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"LRIG_COLOR","owner":"self","color":"黒"}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX15-005": [
    {"effectId":"WX15-005-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":1},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","hasIcon":"ライズ"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","powerLteLastProcessed":true}}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerLteLastProcessed":true}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX15-026": [
    {"effectId":"WX15-026-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"黒","count":3}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}},"else":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX15-034": [
    {"effectId":"WX15-034-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"CONDITIONAL_COST_REDUCTION_BY_FIELD"},{"type":"CHOOSE","choose_count":2,"from_count":2,"upTo":true,"choices":[{"choiceId":"WX15-034-E1-c1","label":"デッキから＜武勇＞のシグニ1枚を探して公開し手札に加える","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"武勇"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"WX15-034-E1-c2","label":"あなたの場に【ライズ】を持つシグニがある場合、対戦相手のシグニ1体をバニッシュする","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","hasIcon":"ライズ"}},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX16-006": [
    {"effectId":"WX16-006-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"無","count":4}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COLORLESS_MUST_PAY_CENTER_COLOR"},{"type":"CHOOSE","choose_count":2,"from_count":4,"upTo":true,"choices":[{"choiceId":"WX16-006-E1-c1","label":"対戦相手のセンタールリグは「【常】：アタックできない」を得る（ターン終了時まで）","action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"opponent","count":1},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"WX16-006-E1-c2","label":"対戦相手のシグニ1体をダウンし凍結する","action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"down":true}},{"choiceId":"WX16-006-E1-c3","label":"あなたのシグニ1体は「【常】：バニッシュされない」を得る（ターン終了時まで）","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"from":["BANISH"],"duration":"UNTIL_END_OF_TURN"}},{"choiceId":"WX16-006-E1-c4","label":"トラッシュからセンタールリグと共通色のシグニ2枚まで手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","colorMatchesLrig":true}}}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX16-010": [
    {"effectId":"WX16-010-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":2}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"怪異"},"maxCount":2,"upToTarget":true,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"else":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"怪異"},"maxCount":1,"upToTarget":false,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX16-028": [
    {"effectId":"WX16-028-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":1,"optional":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"hasIcon":"トラップ"}},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","frontOfSelf":true}},"optional":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WX16-Re02": [
    {"effectId":"WX16-Re02-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_NUMBER"},{"type":"MILL","owner":"self","count":0,"useDeclaredCount":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_ALL_MATCH","filter":{"cardType":"シグニ","story":"ウェポン"}},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelEqDeclaredNumber":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX17-077": [
    {"effectId":"WX17-077-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WX17-077-E2-G","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"any_opp","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"upTo":true,"choices":[{"choiceId":"c0","label":"このシグニをトラッシュ→デッキの上から3枚をエナゾーンに置く","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true},"upToCount":false}},{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":3}]}},{"choiceId":"c1","label":"このシグニをトラッシュ→3枚引く","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true},"upToCount":false}},{"type":"DRAW","owner":"self","count":3}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX18-004": [
    {"effectId":"WX18-004-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":2}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":3,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"DRAW","owner":"self","count":3}]},"else":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"DRAW","owner":"self","count":1}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX18-019": [
    {"effectId":"WX18-019-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{},"maxCount":2,"then":{"type":"ENERGY_CHARGE","target":{"type":"DECK_CARD","owner":"self","count":2}}},{"type":"SHUFFLE_DECK","owner":"self"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX20-006": [
    {"effectId":"WX20-006-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":2},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WX20-006-E1-c1","label":"デッキから＜精羅＞のシグニを3枚まで探してエナゾーンに置く","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"精羅"},"maxCount":3,"upToTarget":true,"then":{"type":"ADD_TO_ENERGY","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"WX20-006-E1-c2","label":"対戦相手のパワー12000以上のシグニ1体をバニッシュする","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":12000}},"upToCount":false}}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX22-005": [
    {"effectId":"WX22-005-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"赤","count":1},{"color":"青","count":1},{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"search","label":"＜天使＞を3枚まで探して場に出す","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"天使","color":["赤","青","緑"]},"maxCount":3,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"draw","label":"カードを6枚引く","action":{"type":"DRAW","owner":"self","count":6}},{"choiceId":"counter","label":"スペルの効果を打ち消す","action":{"type":"COUNTER_SPELL"}}]},{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1}},{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX22-021": [
    {"effectId":"WX22-021-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_CARD_NAME"},{"type":"STUB","id":"DECK_REVEAL_UNTIL"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":7},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX22-046": [
    {"effectId":"WX22-046-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true,"handDiscardSigni":{"count":1,"story":"天使"}},"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"天使","levelLteDiscardSigni":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXEX1-06": [
    {"effectId":"WXEX1-06-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"coin":2},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true},"recordRevealed":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardName":"フレイスロ"},"minCount":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXEX1-49": [
    {
      effectId: 'WXEX1-49-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'hand', label: '手札に加える',
            action: {
              type: 'TRANSFER_TO_HAND',
              source: {
                type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
                filter: { cardType: 'シグニ', story: '悪魔', powerRange: { max: 7000 } },
              },
            },
          },
          {
            choiceId: 'field', label: '場に出す',
            action: {
              type: 'ADD_TO_FIELD', owner: 'self',
              source: {
                type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false,
                filter: { cardType: 'シグニ', story: '悪魔', powerRange: { max: 7000 } },
              },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {"effectId":"WXEX1-49-E2","effectType":"AUTO","timing":["ON_CARD_MILLED_FROM_DECK"],"triggerCondition":{"milledDeckOwner":"self","milledMinCount":3},"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXEX1-69": [
    {"effectId":"WXEX1-69-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"龍獣"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":2},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"龍獣"}}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":3},"then":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2000},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXEX2-52": [
    {"effectId":"WXEX2-52-E1","effectType":"AUTO","timing":["ON_OPP_POWER_DECREASED"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"delta":0,"deltaFromOppPowerDecrease":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"byOwnEffect":true}},
    // WXEX2-52-E3 ／ 原文【起】《ターン１回》《黒》：あなたの**トラッシュから**パワーの合計がこのシグニのパワー以下に
    //   なるように**＜毒牙＞のシグニを２枚まで**対象とし、**それらを場に出す**。
    // 🔴旧 live＝`source` が `{thisCardOnly:true}`＝**このカード自身をトラッシュから1枚出す**という別のカードに
    //   なっていた（クラス・枚数・上限のすべてが脱落）。⚠「パワーの合計が**このシグニのパワー**以下」は
    //   `totalPowerMax` が数値固定で参照を持てない＝§5.4(ii) 登録＝`PARTIAL`。
    {"effectId":"WXEX2-52-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","story":"毒牙"},"selectionConstraint":{"totalPowerMaxRef":{"$ref":"source_effective_power"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL","trashActivated":true,"usageLimit":"once_per_turn"},
  ],
  "WXEX2-68": [
    {"effectId":"WXEX2-68-E1","effectType":"AUTO","timing":["ON_REVEALED_FROM_HAND"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"龍獣"},"upToCount":false},"delta":3000},{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"龍獣"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costText":"手札から《幻竜　アルゼンチノ》を１枚捨ててもよい","handDiscard":{"count":1,"filter":{"cardName":"幻竜　アルゼンチノ"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"龍獣"},"upToCount":false},"keyword":"Sランサー","duration":"UNTIL_END_OF_TURN","targetsStored":true}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","triggerCondition":{"revealSourceStory":"龍獣"}},
  ],
  "WXDi-D01-021": [
    {"effectId":"WXDi-D01-021-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"アンシエント・サプライズ","operator":"gte","value":3},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},"else":{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"緑"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D02-18AT": [
    {"effectId":"WXDi-D02-18AT-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","cardClass":"バーチャル"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"remainder":{"location":"deck","position":"bottom","reorder":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-D02-29": [
    {"effectId":"WXDi-D02-29-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1},{"color":"無","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"さんばか","operator":"gte","value":3},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":["白","黒"]}}},"else":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D03-017": [
    {"effectId":"WXDi-D03-017-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":1,"private":false,"reorder":false,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_MATCHES","owner":"self","filter":{"cardType":"シグニ","level":3}},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","赤"]},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXDi-D03-021": [
    {"effectId":"WXDi-D03-021-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"NoLimit","operator":"gte","value":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":10000}}}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":8000}}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D04-021": [
    {"effectId":"WXDi-D04-021-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1},{"color":"無","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"CardJockey","operator":"gte","value":3},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"pickCount":2,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom"}},"else":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"cardType":"シグニ"},"pickCount":2,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D05-007": [
    {"effectId":"WXDi-D05-007-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ"},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"remainder":{"location":"deck","position":"bottom","reorder":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-D05-021": [
    {"effectId":"WXDi-D05-021-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"うちゅうのはじまり","operator":"gte","value":3},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}}]},"else":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D06-021": [
    {"effectId":"WXDi-D06-021-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"DIAGRAM","operator":"gte","value":3},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"delta":-8000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"delta":-6000}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D09-P26": [
    {"effectId":"WXDi-D09-P26-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":3},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2}}]},"else":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":2},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2}}]}},{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"self","count":1},"actionId":"USE_SPELL","until":"END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-D09-P27": [
    {"effectId":"WXDi-D09-P27-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"うちゅうのはじまり","operator":"gte","value":3},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}}]},"else":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P00-043": [
    {"effectId":"WXDi-P00-043-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":2,"filter":{"cardName":"コード２４３４　アルス・アルマル"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P01-085": [
    {"effectId":"WXDi-P01-085-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"TRASH_COUNT","owner":"self","operator":"gte","value":15},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P02-061": [
    {"effectId":"WXDi-P02-061-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"CONDITIONAL","condition":{"type":"SELF_POWER_GTE","value":12000},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":8000}},
  ],
  "WXDi-P02-083": [
    {"effectId":"WXDi-P02-083-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"このシグニを場からトラッシュに置いてもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_opp","triggerCondition":{"placedFront":true},"triggerFilter":{"level":{"max":2}}},
  ],
  "WXDi-P03-043": [
    {"effectId":"WXDi-P03-043-E3","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"delta":-3000,"targetsTriggerSource":true},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","triggerScope":"any_opp","triggerCondition":{"placedFront":true}},
  ],
  "WXDi-P04-011": [
    {"effectId":"WXDi-P04-011-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_SOUL_HOST_ABILITY","abilities":[{"effectId":"WXDi-P04-011-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P04-012": [
    {"effectId":"WXDi-P04-012-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_SOUL_HOST_ABILITY","abilities":[{"effectId":"WXDi-P04-012-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-10000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P04-047": [
    {"effectId":"WXDi-P04-047-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"cardType":"シグニ","cardClass":"天使"},"pickCount":1,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P04-065": [
    {"effectId":"WXDi-P04-065-E1","effectType":"AUTO","timing":["ON_SIGNI_FROZEN"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"delta":-1000,"targetsTriggerSource":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn","triggerScope":"any_opp"},
  ],
  "WXDi-P06-053": [
    {"effectId":"WXDi-P06-053-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"無","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ","color":"赤"},"pickCount":1,"then":"hand","pickUpTo":true},{"filter":{"cardType":"シグニ","color":["白","青","緑","黒"]},"pickCount":1,"then":"hand","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P06-079": [
    {"effectId":"WXDi-P06-079-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"TRASH_COUNT","owner":"self","operator":"gte","value":15},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-3000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P07-079": [
    {"effectId":"WXDi-P07-079-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"trash_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":5000},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"毒牙"}},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"}},"delta":5000,"targetsLastProcessed":true}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P08-060": [
    {"effectId":"WXDi-P08-060-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1},{"color":"赤","count":1}],"trash_self":true},"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"赤"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P08-060-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","usageLimit":"once_per_turn"}},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P11-032": [
    {"effectId":"WXDi-P11-032-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c1","label":"選択肢2","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c2","label":"選択肢3","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P11-032-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c1","label":"選択肢2","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c2","label":"選択肢3","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P11-070": [
    {"effectId":"WXDi-P11-070-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"使用コストとして追加でエクシード７を支払ってもよい","exceed":7},{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":3,"private":true,"reorder":true,"canTrash":false,"destination":{"location":"deck","owner":"self","position":"split_top_bottom"}},{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":0,"private":false,"reorder":true,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"DRAW","owner":"self","count":2}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P11-076": [
    {"effectId":"WXDi-P11-076-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"使用コストとして追加でエクシード７を支払ってもよい","exceed":7},{"type":"ENERGY_CHARGE","target":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":2,"upToCount":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P13-027": [
    {"effectId":"WXDi-P13-027-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ"},"pickCount":1,"then":"hand","pickUpTo":true},{"filter":{"cardType":"シグニ","nonColorless":true},"pickCount":1,"then":"hand","sharesClassWithPrev":true,"pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P13-082": [
    {"effectId":"WXDi-P13-082-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1},{"color":"無","count":1}]},"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","isDisona":true},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P13-082-sub-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ランサー","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL","activeCondition":{"type":"FRONT_SIGNI","compareToSelf":{"key":"power","operator":"eq"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P16-060": [
    {"effectId":"WXDi-P16-060-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"cardType":"シグニ","hasGuard":true},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP01-040": [
    {"effectId":"WXDi-CP01-040-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true,"isUp":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_DECK_TOP","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"バーチャル"}},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP02-007": [
    {"effectId":"WXDi-CP02-007-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1},{"color":"無","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"gte","value":3},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"else":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXDi-CP02-025": [
    {"effectId":"WXDi-CP02-025-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ"},"pickCount":1,"then":"hand","pickUpTo":true},{"filter":{"cardType":"シグニ","nonColorless":true},"pickCount":1,"then":"hand","sharesClassWithPrev":true,"pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP02-052": [
      // 🆕**§5.3 `O-221` 第5バッチ（2026-09-02）で2点直した**（`WXDi-CP02-052-E1`）。
  //   ①**対象宣言を任意コストより前へ**＝原文は「対戦相手のパワー8000以下のシグニ１体を**対象とし**、
  //     手札を１枚捨てて**もよい**」なので、**候補が居ないのに手札を捨てさせて**いた（`O-96` の実害(a)）。
  //     `CHOOSE` の両枝は同じ1体を指す（原文の「それ」）＝`targetsStored` を両枝へ刻む。
  //     🔑engine 側は `freezeStoredTargets` が **`CHOOSE` の枝 → その中の `CONDITIONAL`** まで
  //     降りて初めて焼き込みが届く（`O-221` 第3バッチで `CONDITIONAL` 降下を足した）。
  //   ②🔴**前置条件「あなたの場にあるすべてのシグニが＜ブルアカ＞の場合」が丸ごと落ちていた**
  //     ＝**無条件で発動する過剰実行**。受け皿は既存の `ALL_FIELD_SIGNI_MATCH`（`WXDi-P12-007-E1` と同形）。
    {"effectId":"WXDi-CP02-052-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CONDITIONAL","condition":{"type":"ALL_FIELD_SIGNI_MATCH","owner":"self","filter":{"cardType":"シグニ","story":"ブルアカ"}},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":8000}}},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"opponent","operator":"lte","value":3},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":8000}}},"optional":false,"targetsStored":true}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"opponent","operator":"gte","value":4},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":8000}}},"targetsStored":true}}}]}}]}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WX24-P1-020": [
    {"effectId":"WX24-P1-020-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}},{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","story":"宝石"},"pickCount":2,"remainder":{"location":"deck","position":"bottom","reorder":true},"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX24-P1-036": [
    {"effectId":"WX24-P1-036-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","level":{"max":2}},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"remainder":{"location":"deck","position":"bottom","reorder":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P1-053": [
    {"effectId":"WX24-P1-053-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"cardType":"シグニ","cardClass":"宝石"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","condition":{"type":"TURN_HAND_DISCARD_GTE","value":1}},
  ],
  "WX24-P1-081": [
    {"effectId":"WX24-P1-081-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"CONDITIONAL","condition":{"type":"SELF_POWER_GTE","value":10000},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":5000}},
  ],
  "WX24-P2-049": [
    {"effectId":"WX24-P2-049-E2","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"action":{"type":"STUB","id":"POWER_PLUS_BANISHED_POWER","powerPlusBanishedPower":{"target":{"type":"SIGNI","owner":"self","count":1,"filter":{"color":"白"}},"duration":"UNTIL_OPP_TURN_END"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P2-061": [
    {"effectId":"WX24-P2-061-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPPONENT_PAY_OPTIONAL","costColors":["無"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"cardType":"シグニ","cardClass":"龍獣"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WX24-P3-032": [
    {"effectId":"WX24-P3-032-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c1","label":"選択肢2","action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","keyword":["アサシン","ランサー","Sランサー","ダブルクラッシュ"]}},"optional":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX24-P4-014": [
    {"effectId":"WX24-P4-014-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}},{"choiceId":"c1","label":"選択肢2","action":{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"opponent","operator":"eq","value":0},"then":{"type":"STUB","id":"OPP_LRIG_DECK_TO_LRIG_TRASH","raw":"対戦相手は自分のルリグデッキからカード１枚をルリグトラッシュに置く"}}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  "WX24-P4-036": [
    {"effectId":"WX24-P4-036-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"PLACE_LIMIT_UPPER"},{"type":"STUB","id":"GAIN_ABILITY_THIS_GAME"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],
  "WX24-P4-061": [
    {"effectId":"WX24-P4-061-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":4},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"else":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","level":{"max":2}},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX24-P4-069": [
    {"effectId":"WX24-P4-069-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"スペル"},"pickCount":1,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true},"pickNoun":"スペル"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P4-080": [
    {"effectId":"WX24-P4-080-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"植物"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","condition":{"type":"ENERGY_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"植物"},"operator":"gte","value":3}},
  ],
  "WX25-P1-037": [
    {"effectId":"WX25-P1-037-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}},{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","story":"ウェポン"},"pickCount":2,"remainder":{"location":"deck","position":"bottom","reorder":true},"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P1-039": [
    {"effectId":"WX25-P1-039-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ","cardClass":"原子"},"pickCount":1,"then":"hand","pickUpTo":true},{"filter":{"cardType":"シグニ","cardClass":"原子"},"pickCount":1,"then":"field","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true},"lastProcessedFrom":"field"},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelLteLastProcessed":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P2-005": [
    {"effectId":"WX25-P2-005-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"GAIN_ABILITY_THIS_GAME"},{"type":"STUB","id":"HAND_SIZE_INCREASE","handLimitDelta":2}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],
  "WX25-P2-007": [
    {"effectId":"WX25-P2-007-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"GAIN_ABILITY_THIS_GAME"},{"type":"STUB","id":"GUARD_ALTERNATIVE_COST"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],
  "WX25-P2-034": [
    {"effectId":"WX25-P2-034-E1","effectType":"AUTO","timing":["ON_SPELL_USE"],"triggerCondition":{"turnOwner":"self"},"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"story":"電機"}},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WX25-P2-046": [
    {"effectId":"WX25-P2-046-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"colorMatchesLrig":true},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"STUB","id":"PLACE_LIMIT_UPPER"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P2-066": [
    {"effectId":"WX25-P2-066-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"cardType":"スペル"},"pickCount":1,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom"},"pickNoun":"スペル"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX25-P3-007": [
    {"effectId":"WX25-P3-007-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":3},{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":3,"upToCount":true}},{"type":"RECOLLECT_GATE","minArts":4},{"type":"STUB","id":"OPTIONAL_COST","costText":"《リコレクトアイコン》［４枚以上］追加でエクシード３を支払ってもよい","exceed":3},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"Sランサー","duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P3-032": [
    {"effectId":"WX25-P3-032-E1","effectType":"AUTO","timing":["ON_OPP_POWER_DECREASED"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"CONDITIONAL","condition":{"type":"ENERGY_COUNT","owner":"opponent","operator":"gte","value":2},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"opponentSelects":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL","triggerCondition":{"turnOwner":"self","powerDecreaseSourceStory":"毒牙"},"usageLimit":"twice_per_turn"},
  ],
  "WX25-P3-040": [
    {"effectId":"WX25-P3-040-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}},{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","story":"天使"},"pickCount":2,"remainder":{"location":"deck","position":"bottom","reorder":true},"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P3-074": [
    {"effectId":"WX25-P3-074-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true,"isUp":true},"upToCount":false},"optional":true},{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"天使","excludeSelf":true}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX25-P3-074-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P3-078": [
    {"effectId":"WX25-P3-078-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true,"isUp":true},"upToCount":false},"optional":true},{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"天使","excludeSelf":true}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX25-P3-078-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P3-096": [
    {"effectId":"WX25-P3-096-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"天使"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","condition":{"type":"ENERGY_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"天使"},"operator":"gte","value":3}},
  ],
  "WX25-P3-104": [
    {"effectId":"WX25-P3-104-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"毒牙"},"excludeSelf":true},"then":{"type":"BANISH_REDIRECT","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":2}}},"redirectTo":"trash","until":"END_OF_TURN","whenPowerZero":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-025": [
    {"effectId":"WX25-CP1-025-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardClass":"ブルアカ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"白","cardClass":"ブルアカ"},"minCount":1},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-027": [
    {"effectId":"WX25-CP1-027-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardClass":"ブルアカ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"青","cardClass":"ブルアカ"},"minCount":1},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPPONENT_PAY_OPTIONAL","opponentHandDiscard":2},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-029": [
    {"effectId":"WX25-CP1-029-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardClass":"ブルアカ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"緑","cardClass":"ブルアカ"},"minCount":1},"then":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"HAND_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","cardClass":"ブルアカ","level":{"max":2}}}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"targetsLastProcessed":true,"delta":3000,"duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"targetsLastProcessed":true,"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-031": [
    {"effectId":"WX25-CP1-031-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardClass":"ブルアカ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"黒","cardClass":"ブルアカ"},"minCount":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-10000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-033": [
    {"effectId":"WX25-CP1-033-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"story":"ブルアカ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"STUB","id":"PLACE_LIMIT_UPPER"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-037": [
    {"effectId":"WX25-CP1-037-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"cardType":"シグニ","story":"ブルアカ"},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"remainder":{"location":"deck","position":"bottom","reorder":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-061": [
    {"effectId":"WX25-CP1-061-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"あなたの手札から＜ブルアカ＞のカードを３枚まで公開してもよい"},{"type":"STUB","id":"POWER_MOD_PER_REVEALED"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":4000}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-069": [
    {"effectId":"WX25-CP1-069-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_OPP_LIFE_CRASHED","crasherFilter":{"cardType":"シグニ","color":"青","story":"ブルアカ"}},"effect":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX26-CP1-019": [
    {"effectId":"WX26-CP1-019-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}},{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardClass":"プリオケ"},"pickCount":1,"then":"energy","pickNoun":"カード","pickUpTo":true},{"filter":{"cardClass":"プリオケ","color":"白"},"pickCount":1,"then":"hand","pickNoun":"カード","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-10000,"duration":"UNTIL_END_OF_TURN"},{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardClass":"プリオケ"},"pickCount":1,"then":"energy","pickNoun":"カード","pickUpTo":true},{"filter":{"cardClass":"プリオケ","color":"黒"},"pickCount":1,"then":"hand","pickNoun":"カード","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX26-CP1-020": [
    {"effectId":"WX26-CP1-020-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"story":"プリオケ"},"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"STUB","id":"PLACE_LIMIT_UPPER"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX24-D1-25": [
    {"effectId":"WX24-D1-25-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"LRIG_TRASH_COUNT","cardType":"アーツ","operator":"gte","value":5,"excludeSource":true},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"else":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","level":{"max":2}},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK02-037": [
    {"effectId":"WXK02-037-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_FROM_TRASH"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"delta":-4000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"delta":-2000}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK02-045": [
    {"effectId":"WXK02-045-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"cardType":"シグニ","cardClass":"遊具"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_ENERGY","owner":"self"},"remainder":{"location":"deck","position":"top","reorder":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK02-084": [
    {"effectId":"WXK02-084-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK02-084-sub-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL","activeCondition":{"type":"FRONT_SIGNI","filter":{"isFrozen":true}}}},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK03-014": [
    {"effectId":"WXK03-014-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"life_cloth","owner":"self"},"count":3,"private":true,"reorder":true,"canTrash":true,"destination":{"location":"life_cloth","owner":"self","position":"top"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK03-014-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"trash_key":true},"action":{"type":"PLACE_KEY_FROM_LRIG_DECK","owner":"self","payPrintedCost":true,"coinReduction":1},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // WXK03-070 幻怪　モモタロ E1【出】＝「エナゾーンから《幻怪　モモイヌ》1枚と《幻怪　モモザル》1枚と
  //   《幻怪　モモキジ》1枚をトラッシュに置く：…」。🔴旧 live は `costUnparsed:true` で**発動コストが無料**だった
  //   （意味照合 段2・2026-09-01 続き767）。受け皿は既存の `cost.energyTrashGroups`（異なるフィルタの組）で、
  //   支払い側 `executeSigniOnPlayCost` は `energyTrash` と同じ「エナ index の集合」を受けるので**共通経路のまま**。
  //   ⚠この巡で `SigniOnPlayCostModal` 側の**可否判定と選択ガード**（`energyTrashGroupsSatisfied` /
  //     `canAddEnergyTrashGroupIndex`）を新設して初めて払えるようになった＝**型だけでは払えなかった**。
  "WXK03-070": [
    {"effectId":"WXK03-070-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energyTrashGroups":[{"count":1,"filter":{"cardName":"幻怪　モモイヌ"}},{"count":1,"filter":{"cardName":"幻怪　モモザル"}},{"count":1,"filter":{"cardName":"幻怪　モモキジ"}}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}},{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  "WXK03-023": [
    {"effectId":"WXK03-023-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"使用コストとして追加であなたのシグニの下からカードを合計４枚までトラッシュに置いてもよい"},{"type":"DRAW","owner":"self","count":1},{"type":"DRAW","owner":"self","count":1},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK03-073": [
    {"effectId":"WXK03-073-E1","effectType":"AUTO","timing":["ON_ZONE_MOVED"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"delta":2000,"targetsTriggerSource":true},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN","targetsTriggerSource":true}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","usageLimit":"once_per_turn"},
  ],
  "WXK05-048": [
    {"effectId":"WXK05-048-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":6}],"costScaling":[{"direction":"reduce","counts":[{"kind":"lrigLevel","owner":"self"}],"per":1,"amount":[{"color":"無","count":1}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"RULE_REMINDER_TEXT"},{"type":"CHOOSE","choose_count":1,"from_count":5,"choices":[{"choiceId":"WXK05-048-E1-c1","label":"デッキからシグニ1枚を探して公開し手札に加える","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"WXK05-048-E1-c2","label":"対戦相手のパワー8000以下のシグニ1体をバニッシュする","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}},{"choiceId":"WXK05-048-E1-c3","label":"カードを2枚引き、手札を1枚捨てる","action":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":2},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}]}},{"choiceId":"WXK05-048-E1-c4","label":"対戦相手のパワー12000以上のシグニ1体をバニッシュする","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":12000}},"upToCount":false}}},{"choiceId":"WXK05-048-E1-c5","label":"トラッシュからシグニ1枚を場に出す","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK06-050": [
    {"effectId":"WXK06-050-E1","effectType":"AUTO","timing":["ON_OPP_LIFE_CRASHED"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒"]},{"type":"MILL","owner":"self","count":999,"untilFilter":{"cardType":"シグニ","story":"龍獣"},"untilCount":3},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"龍獣"},"minCount":3},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"龍獣","level":{"max":3}}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXK06-053": [
    {"effectId":"WXK06-053-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"ENERGY_CARD","owner":"opponent","count":1},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costText":"このシグニを場からトラッシュに置いてもよい","selfTrash":true},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK07-042": [
    {"effectId":"WXK07-042-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"原子"}}},{"type":"DRAW","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"minCount":2},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"minCount":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK08-045": [
    {"effectId":"WXK08-045-E1","effectType":"AUTO","timing":["ON_BECOME_BEAT"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"悪魔"}},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"悪魔"}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN","targetsStored":true}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","condition":{"type":"BEAT_CONDITION","condText":"３枚"}},
  ],
  "WXK09-089": [
    {"effectId":"WXK09-089-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"電機"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteLastProcessed":true}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // WXDi-P15-034（§5.3 `O-96` 第13バッチ・2026-09-02）
  //   原文【出】：以下の２つから１つを選ぶ。①対戦相手のシグニ１体を対象とし、ターン終了時まで、
  //   それは「【常】：アタックできない。」を得る。②対戦相手のシグニ１体を**対象とし**、《白》《無》を
  //   支払って**もよい**。**そうした場合、それを**手札に戻す。
  // 🔴旧 live（`manualEffects.ts` に定義が無い**live 限定 MANUAL**＝§5.3 `O-133` の第4の死角）は
  //   ②枝が `SEQUENCE[OPTIONAL_COST, BOUNCE]` ＝**did-it ゲートが無く、支払わなくても手札に戻せた**。
  // ⚠`mandatory:true` は `scripts/fixLrigColorFilters.mjs` が build 後に毎回立てる（`mandatoryOnPlay`）＝
  //   ここにも同じ値を書いて冪等にする。
  "WXDi-P15-034": [
    {"effectId":"WXDi-P15-034-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WXDi-P15-034-E1-c1","label":"対戦相手のシグニ1体は「【常】：アタックできない」を得る（ターン終了時まで）","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"WXDi-P15-034-E1-c2","label":"《白》《無》を支払い、対戦相手のシグニ1体を手札に戻す","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["白","無"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"optional":false,"targetsStored":true}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK10-007": [
    {"effectId":"WXK10-007-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WXK10-007-E1-c1","label":"対戦相手のターンの場合、対戦相手のセンタールリグは能力を失う（ターン終了時まで）","action":{"type":"REMOVE_ABILITIES","target":{"type":"LRIG","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"},"condition":{"type":"TURN_OWNER","owner":"opponent"}},{"choiceId":"WXK10-007-E1-c2","label":"《白》を支払い、対戦相手のシグニ1体に「アタックできない」を付与する","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN","targetsStored":true}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK10-044": [
    {"effectId":"WXK10-044-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"青","count":1}],"handDiscardSigni":{"count":1,"story":"迷宮"}},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelLteDiscardSigni":true}},"shuffle":false},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK10-052": [
    {"effectId":"WXK10-052-E1","effectType":"AUTO","timing":["ON_CARD_MILLED_FROM_DECK"],"triggerCondition":{"byOwnEffect":true,"milledDeckOwner":"self","milledMinCount":1,"milledCardFilter":{"cardType":"シグニ","cardClass":"龍獣"}},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK10-074": [
    {"effectId":"WXK10-074-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","abilities":[{"effectId":"WXK10-074-E2-G","effectType":"AUTO","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLtSelf":true},"actingPlayerSelects":true,"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK10-075": [
    {"effectId":"WXK10-075-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","abilities":[{"effectId":"WXK10-075-E2-G","effectType":"AUTO","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY_BY_SOURCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"basis":"power","multiplier":-1,"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK11-033": [
    {"effectId":"WXK11-033-E1","effectType":"AUTO","timing":["ON_SPELL_USE"],"triggerFilter":{"color":"赤"},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"},{"type":"CONDITIONAL","condition":{"type":"LRIG_LEVEL","owner":"opponent","operator":"gte","value":4},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK11-071": [
    {"effectId":"WXK11-071-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"このシグニを場からトラッシュに置いてもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_opp"},
  ],
  "WXK11-077": [
    {"effectId":"WXK11-077-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK11-077-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"usageLimit":"once_per_turn","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":3,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":3},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":false,"fromTrash":true,"opponentSelects":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerScope":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WD12-013": [
    {"effectId":"WD12-013-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_OPPONENT"],"triggerScope":"any_ally","action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true,"isUp":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","level":{"max":2}}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WD12-015": [
    {"effectId":"WD12-015-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_OPPONENT"],"triggerScope":"any_ally","action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true,"isUp":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","level":{"max":1}}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WD13-002": [
    {"effectId":"WD13-002-E1","effectType":"CONTINUOUS","action":{"type":"GROW_COST_REDUCTION","reduction":[{"color":"白","count":1},{"color":"黒","count":1}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WD22-007-G": [
    {"effectId":"WD22-007-G-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"そのシグニを場からトラッシュに置いてもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn","triggerScope":"any_ally","triggerCondition":{"placedFromTrash":true},"triggerFilter":{"story":"遊具"}},
  ],
  "WD22-012-G": [
    {"effectId":"WD22-012-G-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"遊具"}}}]},"else":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":{"max":2}}}},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"遊具","level":{"max":2}}}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK07-E14": [
    {"effectId":"WDK07-E14-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","abilities":[{"effectId":"WDK07-E14-E1-G","effectType":"AUTO","action":{"type":"POWER_MODIFY_BY_SOURCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"basis":"level","multiplier":-2000},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK08-Y07": [
    {"effectId":"WDK08-Y07-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ"}}},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"SEQUENCE","steps":[{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerLteLastProcessed":true}}},{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}]},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerLteLastProcessed":true}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK08-Y20": [
    {"effectId":"WDK08-Y20-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"水獣"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteLastProcessed":true}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK13-017": [
    {"effectId":"WDK13-017-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECK_REVEAL_UNTIL"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_LEVEL_SUM","operator":"gte","value":6},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WDK14-008": [
    {"effectId":"WDK14-008-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":4,"stages":[{"pickCount":1,"then":"hand","pickNoun":"カード"},{"pickCount":1,"then":"beat","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelEqLastProcessed":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK14-013": [
    {"effectId":"WDK14-013-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"beat_signi_from_trash":{"count":1,"filter":{"cardType":"シグニ","story":"悪魔"}}},"condition":{"type":"BEAT_CONDITION","condText":"４枚以下"},"action":{"type":"CONDITIONAL","condition":{"type":"BEAT_CONDITION","condText":"４枚"},"then":{"type":"DRAW","owner":"self","count":1}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK15-009": [
    {"effectId":"WDK15-009-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","hasRiseIcon":true}}},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","nonColorless":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK17-007": [
    {"effectId":"WDK17-007-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"STUB","id":"STEAL_OPP_TRASH_PUPPET"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK17-015": [
    {"effectId":"WDK17-015-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ"},"abilities":[{"effectId":"WDK17-015-E2-PG","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"acceHost":true}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"WDK17-015-E2-G","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT","bySourceType":"シグニ"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "SP27-014": [
    {"effectId":"SP27-014-E2","effectType":"AUTO","timing":["ON_TRASH"],"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"SP27-014-E2-c1","label":"カードを1枚引く","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"SP27-014-E2-c2","label":"デッキの一番上のカードをエナゾーンに置く","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"choiceId":"SP27-014-E2-c3","label":"手札を1枚捨て、対戦相手のシグニ1体をバニッシュする","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerCondition":{"byOpponentEffect":true,"fromAnyZone":true}},
  ],
  "PR-459A": [
    {"effectId":"PR-459A-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"REVEAL_OPP_HAND_CARD"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":1}},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":3}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":2}},"then":{"type":"DRAW","owner":"self","count":3}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":3}},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":4}},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":5}},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"スペル"}},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1},"optional":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "SPDi43-28": [
    {"effectId":"SPDi43-28-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"手札から白のカードを３枚捨ててもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"self","count":1},"until":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "SPDi43-30": [
    {"effectId":"SPDi43-30-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"アンストッパブル　Dr.タマゴ"}},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","isUp":true,"thisCardOnly":true},"upToCount":false},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":2}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"HAND_COUNT","owner":"opponent","operator":"eq","value":0},"then":{"type":"STUB","id":"OPTIONAL_COST"}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"}}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "SPDi43-31": [
    {"effectId":"SPDi43-31-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":1,"private":false,"reorder":false,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_MATCHES","owner":"self","filter":{"level":1}},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"opponentSelects":true}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_MATCHES","owner":"self","filter":{"level":2}},"then":{"type":"SEQUENCE","steps":[{"type":"COST_INCREASE","targetCardType":"アーツ","targetOwner":"opponent","amount":[{"color":"無","count":2}],"duration":"NEXT_OPP_TURN"},{"type":"COST_INCREASE","targetCardType":"スペル","targetOwner":"opponent","amount":[{"color":"無","count":2}],"duration":"NEXT_OPP_TURN"}]}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_MATCHES","owner":"self","filter":{"level":3}},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":3000,"duration":"UNTIL_OPP_TURN_END"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "SPDi47-03": [
    {"effectId":"SPDi47-03-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"DRAW","owner":"self","count":3},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":"ALL","upToCount":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":8,"verbJa":"捨てた"},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"LIFE_CLOTH_CARD","owner":"opponent","count":1},"shuffle":false,"position":"bottom"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1,"verbJa":"捨てた"},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"shuffle":false,"position":"bottom"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  "SPDi47-05": [
    {"effectId":"SPDi47-05-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"BANISH_REDIRECT","target":{"type":"SIGNI","owner":"opponent","count":"ALL"},"redirectTo":"exile","until":"END_OF_TURN"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}},"delta":-20000,"splitTotal":{"unit":1000},"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"RULE_REMINDER_TEXT"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  "PR-Di035": [
    {"effectId":"PR-Di035-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"プリパラ"}}},{"type":"STUB","id":"PRDI035_PARADISE_COLOR"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // 2026-08-28 §5.3 `O-133` B群 第14バッチ＝**表現の違いだけ**で live 側が保つ情報がある効果を逐語移設。
  // 判定＝意味を絞る軸（filter/condition/owner/count/until/keyword 等）のリーフを live→fresh で数え、
  // **失う数と得る数が同じ**もの＝ルール上は等価で、live は選択肢ラベル等の**表示情報を余分に持つ**側。
  // ⚠**実体は1バイトも変えていない**（live からのコピー）。parser が追いついたら censusManualDrift の「削除候補」に載る。
  "WX04-011": [
    {"effectId":"WX04-011-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"PLAY_FREE","source":"lrig_deck","filter":{"cardType":"アーツ","color":"青"},"ignoreCost":true,"optional":false,"costThreshold":3,"useTimingIncludes":"メインフェイズ"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX15-059": [
    {"effectId":"WX15-059-E1","effectType":"AUTO","timing":["ON_ACCE"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"あなたの手札から＜調理＞のシグニ１枚をエナゾーンに置いてもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn","triggerScope":"any_ally"},
  ],
  "WX17-075": [
    {"effectId":"WX17-075-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_opp","triggerCondition":{"placedFront":true},"triggerFilter":{"levelRange":{"max":2}},"action":{"type":"BANISH","optional":true,"target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isTriggerSource":true},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX17-075-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WX17-075-E3-G","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_opp","triggerCondition":{"frontLowerLevelThanSource":true},"action":{"type":"BANISH","optional":true,"target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isTriggerSource":true},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    // WX17-075-BURST ／ 原文【LB】：**対象のあなたのシグニ１体より低いレベルを持つ**対象の対戦相手のシグニ１体を
    //   バニッシュする。🔴旧 live＝比較の基準（自分のシグニ1体の対象宣言）が丸ごと落ちて**相手のどのシグニでも
    //   バニッシュできた**。🔑基準は `SELECT_TARGET_ONLY` で先に宣言し `levelLtLastProcessed` で解決する。
    {"effectId":"WX17-075-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelLtLastProcessed":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX20-026": [
    {"effectId":"WX20-026-E3","effectType":"AUTO","timing":["ON_DRAW"],"triggerCondition":{"drawBySourceStory":"凶蟲"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"delta":-4000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX20-045": [
    {"effectId":"WX20-045-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WX20-045-E2-G","effectType":"CONTINUOUS","action":{"type":"FORCE_FRONT_SIGNI_ATTACK"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P02-020": [
    {"effectId":"WXDi-P02-020-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"pickCount":1,"then":"hand","pickNoun":"カード","pickUpTo":true},{"filter":{"cardType":"シグニ"},"pickCount":2,"then":"field","suppressOnPlay":true,"pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P06-042": [
    {"effectId":"WXDi-P06-042-E1","effectType":"CONTINUOUS","action":{"type":"FORCE_FRONT_SIGNI_ATTACK"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P09-048": [
    {"effectId":"WXDi-P09-048-E2","effectType":"AUTO","timing":["ON_SPELL_USE"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST","costColors":["青|黒"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXDi-P16-035": [
    {"effectId":"WXDi-P16-035-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"pickCount":1,"then":"hand","pickNoun":"カード","pickUpTo":true},{"filter":{"cardType":"シグニ"},"pickCount":1,"then":"field","suppressOnPlay":true,"pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP01-036": [
    {"effectId":"WXDi-CP01-036-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"abilityloss","label":"＜バーチャル＞がいれば相手シグニの能力を失わせる","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"バーチャル"},"excludeSelf":true},"then":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"until":"UNTIL_END_OF_TURN"}}},{"choiceId":"look","label":"デッキ上2枚を見て1枚トップ・残り下","action":{"type":"STUB","id":"LOOK_TOP_ONE_RETURN_REST_BOTTOM","lookTopReturnRestBottom":{"lookCount":2}}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP02-072": [
    {"effectId":"WXDi-CP02-072-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","hasGuard":true}},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costText":"手札から＜ブルアカ＞のカードを１枚捨ててもよい","handDiscard":{"count":1,"filter":{"story":"ブルアカ"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","hasGuard":true}},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P1-026": [
    {"effectId":"WX24-P1-026-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ","cardClass":"地獣"},"pickCount":1,"then":"hand","pickUpTo":true},{"filter":{"cardType":"シグニ","cardClass":"地獣"},"pickCount":1,"then":"field","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"GRANT_KEYWORD","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX24-P3-087": [
    {"effectId":"WX24-P3-087-E1","effectType":"AUTO","timing":["ON_CARD_MILLED_FROM_DECK"],"triggerCondition":{"turnOwner":"self","milledDeckOwner":"self","milledMinCount":1,"milledSourceStory":"悪魔"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WX25-P2-118": [
    {"effectId":"WX25-P2-118-E2","effectType":"AUTO","timing":["ON_SPELL_USE"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST","costColors":["青|黒"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WX25-P3-081": [
    {"effectId":"WX25-P3-081-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"colorNotMatchesLrig":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"毒牙"},"excludeSelf":true}},
  ],
  "WX26-CP1-074": [
    {"effectId":"WX26-CP1-074-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"colorNotMatchesLrig":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"プリオケ"},"excludeSelf":true}},
  ],
  "WXK04-019": [
    {"effectId":"WXK04-019-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"PREVENT_NEXT_DAMAGE","count":2},"else":{"type":"PREVENT_NEXT_DAMAGE","count":1}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK04-054": [
    {"effectId":"WXK04-054-E2","effectType":"AUTO","timing":["ON_REVEALED_FROM_HAND"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"水獣"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costText":"《緑》を支払い、手札から《幻水　プレシオ》を１枚捨ててもよい","costColors":["緑"],"handDiscard":{"count":1,"filter":{"cardName":"幻水　プレシオ"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"水獣"},"upToCount":false},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN","targetsStored":true}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK05-041": [
    {"effectId":"WXK05-041-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"turnOwner":"opponent"},"triggerScope":"any_opp"},
  ],
  "WXK10-055": [
    {"effectId":"WXK10-055-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"STUB","id":"STEAL_OPP_TRASH_PUPPET","puppetParams":{"count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  
    {"effectId":"WXK10-055-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"美巧"}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK10-055-E2","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"triggerScope":"self","action":{"type":"STUB","id":"STEAL_OPP_TRASH_PUPPET","puppetParams":{"count":1,"optional":true,"levelLteTrigger":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WD17-013": [
    {"effectId":"WD17-013-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"FIELD_CLASS_COUNT","owner":"self","story":"武勇","operator":"gte","value":3},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WD17-015": [
    {"effectId":"WD17-015-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"FIELD_CLASS_COUNT","owner":"self","story":"武勇","operator":"gte","value":3},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK05-T20": [
    {"effectId":"WDK05-T20-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"遊具"}}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"opponentSelects":true}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK06-R20": [
    {"effectId":"WDK06-R20-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"アーム"}}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1},"bestEffort":true},{"type":"DRAW","owner":"self","count":2}]}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK07-E08": [
    {"effectId":"WDK07-E08-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"down","label":"対戦相手のシグニ1体をダウンする","action":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"choiceId":"draw","label":"カードを2枚引く","action":{"type":"DRAW","owner":"self","count":2}},{"choiceId":"counter","label":"スペルの効果を打ち消し、それをトラッシュから対戦相手の手札に戻す","action":{"type":"SEQUENCE","steps":[{"type":"COUNTER_SPELL"},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"opponent","count":1,"filter":{"cardType":"スペル"}}},{"type":"NAME_BAN","targetSelf":false,"duration":"TURN"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK13-007": [
    {"effectId":"WDK13-007-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"黒","count":3},{"color":"無","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"totalLevelMax":7,"filter":{"cardType":"シグニ"}}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"totalLevelMax":5,"filter":{"cardType":"シグニ"}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK14-022": [
    {"effectId":"WDK14-022-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"悪魔"}}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1},"bestEffort":true},{"type":"DRAW","owner":"self","count":2}]}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK16-22": [
    {"effectId":"WDK16-22-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"電機"}}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"opponentSelects":true}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "SPK01-13": [
    {"effectId":"SPK01-13-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":5,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"EXILE","target":{"type":"TRASH_CARD","owner":"opponent","count":2,"upToCount":true}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"PREVENT_NEXT_DAMAGE","count":1}},{"choiceId":"c3","label":"選択肢4","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c4","label":"対戦相手のすべてのシグニは効果で得ている能力を失う（ターン終了時まで）","action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL"},"grantedOnly":true,"until":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // 2026-08-28 §5.3 `O-133` B群 第12バッチ＝**parser が原理的に出せない専用 STUB を持つ効果**を
  // live から逐語移設した（孤児 MANUAL スタンプの解消）。**engine には実装があり live の形が正**で、
  // 解凍すると別物になるため `manualEffects.ts` に出所を持たせる（PLAN §5.3 の「live が正しい・別設計」経路）。
  // ⚠**実体は1バイトも変えていない**（`--unfreeze` ではなく live からのコピー）＝A/B で実体変化0を確認する。
  // ⚠parser がこれらの STUB を出せるようになったら `censusManualDrift` の「削除候補」に載る＝そこで畳む。
  "WX04-004": [
    {"effectId":"WX04-004-E2","effectType":"AUTO","timing":["ON_OPP_SIGNI_ATTACK_DIRECT"],"action":{"type":"STUB","id":"OPP_DIRECT_ATTACK_NEGATE","costColors":["緑","無"]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX04-005": [
    {"effectId":"WX04-005-E3","effectType":"CONTINUOUS","action":{"type":"STUB","id":"LIMIT_ALL_FIELD_1"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX04-015": [
    {"effectId":"WX04-015-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"STUB","id":"OPP_REVEAL_SPELL_USE_FREE"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX15-016": [
    {"effectId":"WX15-016-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WX15-016-GRANTED-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"any_opp","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"mill","label":"デッキの一番上をトラッシュに置く","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"hasLifeBurst":true}},"then":{"type":"STUB","id":"SET_CANCEL_OPP_ATTACK_FLAG"}}]}},{"choiceId":"skip","label":"置かない","action":{"type":"SEQUENCE","steps":[]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【自】：対戦相手のシグニ１体がアタックしたとき、あなたのデッキの一番上のカードをトラッシュに置いてもよい。この方法でトラッシュに置いたカードが《バーストアイコン》を持っていた場合、そのアタックを無効にする。"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX16-021": [
    {"effectId":"WX16-021-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"STUB","id":"ARTS_ATTACK_EMPTY_ZONE_AS_FRONT","sideAttackEmptyZoneAsFront":{"cardClass":"英知"},"costText":"このターン、あなたの＜英知＞のシグニがシグニのない対戦相手のシグニゾーンにアタックする場合、代わりにそのアタックではそのシグニゾーンの正面にあるかのように対戦相手にダメージを与える"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P03-054": [
    {"effectId":"WXDi-P03-054-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"使用コストとして追加でエクシード４を支払ってもよい","exceed":4},{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"REVEAL_PICK_HAND_SHUFFLE_BOTTOM","revealPickParams":{"pickCount":2,"restDest":"deck_bottom","then":"hand"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P09-079": [
    {"effectId":"WXDi-P09-079-E1","effectType":"AUTO","timing":["ON_CARD_MILLED_FROM_DECK"],"triggerCondition":{"milledDeckOwner":"self","milledMinCount":1,"milledCardFilter":{"cardType":"シグニ","level":1},"duringMainPhase":true},"action":{"type":"STUB","id":"PLAY_MILLED_SIGNI_DELAYED_TRASH"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXDi-P10-041": [
    {"effectId":"WXDi-P10-041-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"UNDER_CARD_AS_ENERGY_COST","underCardAsEnergyCost":{"perTurnLimit":3,"duringMyAttackPhase":true}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P14-083": [
    {"effectId":"WXDi-P14-083-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_DISCARD_HAND_CLASS"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P3-068": [
    {"effectId":"WX24-P3-068-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_DISCARD_HAND_CLASS"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P4-016": [
    {"effectId":"WX24-P4-016-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"RECOLLECT_GATE","minArts":4},{"type":"STUB","id":"SELF_SIGNI_ATTACK_NEGATE_IMMUNITY"},{"type":"STUB","id":"MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  "WX25-CP1-060": [
    {"effectId":"WX25-CP1-060-E2","effectType":"AUTO","timing":["ON_TARGETED"],"triggerCondition":{"turnOwner":"opponent"},"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","excludeSelf":true,"filter":{"cardType":"シグニ","story":"ブルアカ"},"minCount":1},"action":{"type":"STUB","id":"FLIP_SELF_ON_TARGETED"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX26-CP1-001": [
    {"effectId":"WX26-CP1-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"STUB","id":"GAIN_SIGNI_BARRIER"}},{"choiceId":"c1","label":"選択肢2","action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"pickCount":2,"then":"hand","pickUpTo":true},{"filter":{"story":"プリオケ"},"pickCount":1,"then":"energy","pickNoun":"カード","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"プリオケ"}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX26-CP1-001-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}}],"recollectArts":{"minArts":4,"thenChooseCount":2,"thenUpTo":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // ── 続き742-2（意味照合 段2）＝parser では表せない多軸破綻を原文から書き直した2件 ──
  // 🔴**「移設」ではない**（§2.0）＝parser 出力のコピーではなく、原文を読み直して組み直したもの。
  //   受け皿はすべて既存（`EXILE{ENERGY_CARD}` / `{$ref:'center_lrig_level'}` / `COST_TRASHED_MATCHES{minCount}` /
  //   `POWER_SET{count:'ALL'}` / `GRANT_EFFECT`）＝新しい型は1つも足していない。
  "WXK11-004": [
    // 原文＝「あなたのセンタールリグのレベル１につき対戦相手のエナゾーンにあるカードを１枚まで対象とし、
    //        対戦相手のすべてのシグニをゲームから除外する。エナゾーンにあるそれらをゲームから除外する。」
    // 旧 live は ①相手エナを **全部トラッシュ**（除外でも枚数制限でもない）②**自分のエナを1枚トラッシュ**
    // （原文に無い）③**相手シグニの除外が丸ごと欠落**、の3点が壊れていた（finding 4件）。
    // ⚠対象宣言（エナ）は先だが、原文の解決順はシグニ除外 → エナ除外。`upToCount` で「N枚**まで**」を表す。
    {"effectId":"WXK11-004-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":4},{"color":"無","count":4}]},"action":{"type":"SEQUENCE","steps":[{"type":"EXILE","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}},{"type":"EXILE","target":{"type":"ENERGY_CARD","owner":"opponent","count":{"$ref":"center_lrig_level"},"upToCount":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK04-025-CB": [
    // 原文＝コスト「このキーを場からルリグトラッシュに置き、エナゾーンにあるすべてのカードをトラッシュに置く」→
    //   ①1枚以上置いた場合＝対象1体の基本パワーを1に ②5枚以上＝相手の**すべての**シグニの基本パワーを1に
    //   ③9枚以上＝相手の**すべての**シグニに「【自】：このシグニがバニッシュされたとき、あなたのライフクロス
    //   １枚をクラッシュする。」を**付与**（＝即時クラッシュではない）。
    //   ⚠付与能力の中の「**あなた**」は**付与先のコントローラー**（＝対戦相手）を指す。`granted_effects` は
    //     付与先の state に積まれ、そのシグニの持ち主の枠で解決されるので `owner:'self'` と書くのが正しい
    //     （`owner:'opponent'` と書くと**自分のライフが割れる**真逆になる）。
    // 旧 live は3段の枚数条件がすべて無く、②が1体固定、③が**即時ライフクラッシュ**に化けていた（finding 3件）。
    // ⚠枚数は**コスト支払いでトラッシュした枚数**なので `COST_TRASHED_MATCHES{minCount}`（`last_cost_trashed_cards`）。
    //   本文の直前ステップを見る `LAST_PROCESSED_COUNT_GTE` とは参照先が違う（型定義のコメント参照）。
    // ⚠**E1 は書かない**＝parser 出力と実体同一の「影武者コピー」になり `§6.4 O-42` の golden tripwire が発火する
    //   （manual は effectId 一致で常に勝つので、コピーを置くとその効果に parser 改善が永久に届かなくなる）。
    {"effectId":"WXK04-025-CB-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"trash_key":true,"energyTrashAll":true},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"COST_TRASHED_MATCHES","filter":{},"minCount":1},"then":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"value":1,"duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"COST_TRASHED_MATCHES","filter":{},"minCount":5},"then":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"value":1,"duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"COST_TRASHED_MATCHES","filter":{},"minCount":9},"then":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK04-025-CB-E2-GRANT","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","action":{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // ── 続き742-2（意味照合 段2）＝一点物3件を原文から書き直し（受け皿はすべて既存・新しい型は0本）──
  "WXK11-022": [
    // 原文＝「【自】《ターン１回》：**他の**シグニ１体がアタックしたとき、あなたのすべてのシグニを好きなように配置し直す。」
    // 旧 live は `triggerScope` 無し（＝既定 self）で**このシグニ自身のアタックでも発動**していた（finding）。
    // ⚠原文は所有者を言わない＝どちらのシグニでもよい `any`。「他の」は `triggerFilter.excludeSelf` で表す。
    {"effectId":"WXK11-022-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"any","triggerFilter":{"excludeSelf":true},"action":{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"self","count":"ALL"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXK11-023": [
    // 原文（LB）＝「あなたのトラッシュから**同じレベルの**シグニ２枚を対象とし、それらを手札に加える。」
    // 旧 live は制約が無く**レベルがばらばらの2枚**でも取れた（finding）。`selectionConstraint.same:'level'` は実装済み。
    {"effectId":"WXK11-023-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":false,"filter":{"cardType":"シグニ"},"selectionConstraint":{"same":"level"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK11-027": [
    // 原文＝「【自】：このシグニがアタックしたとき、**対戦相手は**自分のシグニ１体を対象とし、それをトラッシュに置く。」
    // 旧 live は `opponentSelects` が無く**こちらが相手のシグニを選べる**（＝除去として強すぎる）別物だった。
    {"effectId":"WXK11-027-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"opponentSelects":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXK01-054": [
    {"effectId":"WXK01-054-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":2},"action":{"type":"STUB","id":"DRAW_AT_TURN_END","value":2},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK01-089": [
    {"effectId":"WXK01-089-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":1},"action":{"type":"STUB","id":"DRAW_AT_TURN_END","value":1},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK02-071": [
    {"effectId":"WXK02-071-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXK06-055": [
    {"effectId":"WXK06-055-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":3},{"color":"無","count":1}],"costScaling":[{"direction":"reduce","counts":[{"kind":"zone","zone":"trash","owner":"self","filter":{"cardType":"シグニ","cardClass":"龍獣"}}],"per":5,"amount":[{"color":"黒","count":1}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"WXK06-055-E1-c1","label":"トラッシュから＜龍獣＞のシグニを2枚まで手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","story":"龍獣"}}}},{"choiceId":"WXK06-055-E1-c2","label":"対戦相手のすべてのシグニをバニッシュする","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}},{"choiceId":"WXK06-055-E1-c3","label":"対戦相手はエナゾーンが6枚になるようにトラッシュに置く","action":{"type":"STUB","id":"OPP_ENERGY_REDUCE_TO_N","value":6}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK10-057": [
    {"effectId":"WXK10-057-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WDK05-T15": [
    {"effectId":"WDK05-T15-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"REVEAL_TOP_PLACE_AS_ATTACKER_IF_SIGNI"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "SP26-007": [
    {"effectId":"SP26-007-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":1}]},"altCostOppTurn":[{"color":"赤","count":3}],"action":{"type":"SEQUENCE","steps":[{"type":"SHUFFLE_DECK","owner":"self"},{"type":"REVEAL_DECK_TOP","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"}},"then":{"type":"ADD_TO_FIELD","owner":"self"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"宇宙"}},"then":{"type":"STUB","id":"INTERNAL_ARTS_RECYCLE_EXECUTE"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "SPK01-11": [
    {"effectId":"SPK01-11-E1","effectType":"AUTO","timing":["ON_ACCE_ATTACH"],"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"①このシグニは対戦相手の効果によってダウンしない","action":{"type":"STUB","id":"SET_ACCE_CHOICE","value":"0"}},{"choiceId":"c1","label":"②このシグニは対戦相手の効果によって手札に戻らない","action":{"type":"STUB","id":"SET_ACCE_CHOICE","value":"1"}},{"choiceId":"c2","label":"③このシグニがアタックしたとき、カードを1枚引く","action":{"type":"STUB","id":"SET_ACCE_CHOICE","value":"2"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"accedSelf":true}},
  
    {"effectId":"SPK01-11-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","byChoice":true,"abilities":[{"effectId":"SPK01-11-E2-G0","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["DOWN"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"SPK01-11-E2-G1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BOUNCE"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"SPK01-11-E2-G2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"DRAW","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "SPK16-8C": [
    {"effectId":"SPK16-8C-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"STUB","id":"DISRUPT_OPP_LRIG_UNDER_BY_TYPE"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "PR-465": [
    {"effectId":"PR-465-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"STUB","id":"DISRUPT_OPP_LRIG_UNDER_BY_TYPE"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  // 2026-08-27: 「手札以外の領域から場に出たとき」を ON_PLAY の移動元ゲートへ保持する。
  // MANUAL live は build:effects の PRESERVE 対象なので syncManualLive.ts で同期する。
  "WXDi-P07-044": [
    {"effectId":"WXDi-P07-044-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn","triggerScope":"any_ally","triggerCondition":{"turnOwner":"self","fromZones":["deck","energy","field","under_signi","trash","lrig_deck","lrig_trash","life_cloth","excluded"]}},
  ],
  // 2026-08-22 段2 第17バッチ: PRESERVE 対象の【チーム自】へ印刷済みチーム成立条件を届ける。
  // ⚠`WXDi-P02-030` は**ここに置かない**＝parser が同一の実体（condition 込み）を出せるようになったので、
  //   manual へ写すと §6.4 O-40／O-42 の「parser 出力と実体同一な影武者コピー」を新規に作ることになる
  //   （`npx tsx scripts/censusManualDrift.ts` の「削除候補」に即座に載る＝以後その効果だけ parser 改善が届かない）。
  //   live 側は `syncManualLive.ts --condition-only` で既に条件を受け取っており、`PARTIAL` の温存で維持される。
  "WXDi-P16-048": [
    {"effectId":"WXDi-P16-048-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"condition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"夢限少女","operator":"gte","value":3},"action":{"type":"CHOOSE","choose_count":2,"from_count":3,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ","duration":"UNTIL_OPP_TURN_END"}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}}]}},{"choiceId":"c2","label":"選択肢3","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}}}],"upTo":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  // §6.3 E-2 第2波: 対戦相手のセンタールリグへ2能力をゲーム中恒久付与する。
  "WXK03-001": [
    {"effectId":"WXK03-001-E3","effectType":"ACTIVATED","timing":["MAIN"],"action":{"type":"GRANT_LRIG_ABILITY","targetOwner":"opponent","targetedCenter":true,"permanent":true,"abilities":[{"effectId":"WXK03-001-E3-GRANT-DRAW","effectType":"CONTINUOUS","action":{"type":"DRAW_PHASE_REPLACEMENT","fromCount":1,"toCount":2},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"WXK03-001-E3-GRANT-END","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1,"filter":{"color":"無"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[]},"else":{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"「【常】：あなたがドローフェイズにカードを１枚引く場合、代わりに２枚引く。」と「【自】：あなたのターン終了時、手札から無色のカードを１枚捨ててもよい。そうしなかった場合、このルリグはあなたにダメージを与える。」"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  // §6.3 E-2 第2波: プレイヤーがゲーム中得る【常】。中央＜武勇＞へ+1000し、非メイン時バニッシュAUTOを付与。
  "WXDi-P03-003": [
    {"effectId":"WXDi-P03-003-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"condition":{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":2},"action":{"type":"GRANT_PLAYER_ABILITY","abilities":[{"effectId":"WXDi-P03-003-E1-GRANT","effectType":"CONTINUOUS","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","cardClass":"武勇","centerZoneOnly":true}},"delta":1000},{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","cardClass":"武勇","centerZoneOnly":true},"abilities":[{"effectId":"WXDi-P03-003-E1-GRANT-BANISH","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","triggerCondition":{"outsideMainPhase":true},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【常】：あなたの中央のシグニゾーンにある＜武勇＞のシグニのパワーを＋1000し、そのシグニは「【自】：あなたのメインフェイズ以外でこのシグニがバニッシュされたとき、【エナチャージ１】をする。」を得る。","permanent":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // §6.3 E-2 第2波: ゲーム中、自センタールリグへ引用AUTOを恒久付与する。
  // 内側の数字宣言＋3種の攻撃フェイズ制限は未実装専用STUBで honest defer する。
  "WXK07-001": [
    {"effectId":"WXK07-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"condition":{"type":"OR","conditions":[{"type":"LRIG_NAME_CONTAINS","owner":"self","name":"花代"},{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":4}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId": "WXK07-001-E1-GRANT", "effectType": "AUTO", "timing": ["ON_ATTACK_PHASE_START"], "action": {"type": "SEQUENCE", "steps": [{"type": "STUB", "id": "DECLARE_NUMBER"}, {"type": "STUB", "id": "BLOCK_COLORLESS_ENERGY_PAY"}, {"type": "CONDITIONAL", "condition": {"type": "LRIG_LEVEL", "owner": "opponent", "operator": "gte", "value": 4}, "then": {"type": "BLOCK_ACTION", "target": {"type": "PLAYER", "owner": "opponent", "count": 1}, "actionId": "ARTS_LIMIT_1", "until": "END_OF_TURN"}}]}, "duration": "INSTANT", "mandatory": true, "parseStatus": "MANUAL", "triggerScope": "self"}],"rawText":"【自】：あなたのアタックフェイズ開始時、数字１つを宣言する。対戦相手はこのアタックフェイズの間、無色のカードでエナコストを支払えず、宣言された数字と同じレベルのシグニで【ガード】ができず、自身のセンタールリグがレベル４以上の場合一度しかアーツを使用できない。","permanent":true,"targetedCenter":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // §6.3 C 第4波: ターン終了時に全自シグニを裏向き化し、次の対戦相手アタックフェイズ開始時に戻す二重遅延。
  "WXDi-P09-009": [
    {"effectId":"WXDi-P09-009-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"STUB","id":"SIGNI_FLIP_FACEDOWN","faceDownTarget":{"owner":"self","count":"ALL","delayUntilTurnEnd":true,"returnTiming":"NEXT_OPP_ATTACK_PHASE_START"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  // §6.3 C 第4波: 自シグニを2体まで任意で裏向きにし、ターン終了時に元ゾーンが空の対象だけ戻す。
  "WXDi-P01-040": [
    {"effectId":"WXDi-P01-040-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_ACTIVATE"},{"type":"STUB","id":"SIGNI_FLIP_FACEDOWN","faceDownTarget":{"owner":"self","count":2,"upToCount":true}},{"type":"STUB","id":"FLIP_FACE_DOWN_SIGNI"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  // §6.3 C 第4波: 正面の相手シグニを任意《青青》支払い後に裏向きにし、ターン終了時に元ゾーンで分岐する。
  "WXDi-P05-037": [
    {"effectId":"WXDi-P05-037-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["青","青"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"SIGNI_FLIP_FACEDOWN","faceDownTarget":{"owner":"opponent","count":1,"frontOfSelf":true}}},{"type":"STUB","id":"FLIP_FACE_DOWN_SIGNI"},{"type":"STUB","id":"TRASH_IF_ZONE_OCCUPIED"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  // §6.3 C 第3波: MANUAL 効果は build が curated を温存するため、discardAll の実支払枚数ゲートを完全置換する。
  "WX10-037": [
    {"effectId":"WX10-037-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"discardAll":true},"action":{"type":"CONDITIONAL","condition":{"type":"ACTIVATED_DISCARD_COUNT_GTE","value":4},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // §6.3 C 第1波: 「この方法で」後段条件。PRESERVE カードは fresh parser が採用されないため
  // effectId 単位の完全置換で live へ届ける。
  "WX26-CP1-058": [
    {"effectId":"WX26-CP1-058-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CONDITIONAL","condition":{"type":"ALL_FIELD_SIGNI_MATCH","owner":"self","filter":{"cardType":"シグニ","story":"プリオケ"}},"then":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"self_deck","label":"あなたのデッキの上から5枚をトラッシュ","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":5}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"story":"プリオケ"},"operator":"gte","value":3},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000}}]}},{"choiceId":"opp_deck","label":"対戦相手のデッキの上から5枚をトラッシュ","action":{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":5}}}]}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"PARTIAL","triggerScope":"self"},
  ],
  // 🆕2026-08-31 続き758＝選択肢②の全シグニトラッシュに `optional` を足した（意味照合 段2）。
  //   🔴原文は「トラッシュに置いて**もよい**」＝旧 live はライフ0のとき**自分の盤面が必ず全滅**していた。
  "WD20-018": [
    {"effectId":"WD20-018-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"英知"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"pickCount":1,"filter":{"cardType":"シグニ","story":"英知"},"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}},{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":0,"private":true,"reorder":true,"destination":{"location":"deck","owner":"self","position":"bottom"}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":"ALL"},"optional":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"英知"},"operator":"gte","value":3},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],
  "WX22-Re03": [
    {"effectId":"WX22-Re03-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"怪異"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"怪異"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":2,"filter":{"cardType":"シグニ","story":"怪異"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
  ],
  "WXK05-025": [
    {"effectId":"WXK05-025-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":2},{"type":"TRANSFER_TO_DECK","source":{"type":"HAND_CARD","owner":"self","count":2},"shuffle":false,"position":"bottom"},{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK05-025-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":4,"fromBottom":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_LEVEL_SUM","operator":"gte","value":11},"then":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isFrozen":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LRIG_STORY","owner":"self","story":"リメンバ"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isFrozen":true},"upToCount":false}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  // 続き393: バニッシュ保護の発生源種別（複数可）と表記レベル制限を source of truth 化。
  "WXDi-P03-074": [
    {"effectId":"WXDi-P03-074-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT","bySourceType":"シグニ","bySourceLevel":1},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P10-046": [
    {"effectId":"WXDi-P10-046-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"opponent"},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT","bySourceType":["ルリグ","シグニ"],"bySourceLevel":{"max":2}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP01-038": [
    {"effectId":"WXDi-CP01-038-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"バーチャル","excludeSelf":true}},"from":["BANISH"],"sourceOwner":"opponent","duration":"UNTIL_OPP_TURN_END","bySourceType":["ルリグ","シグニ"],"bySourceLevel":{"max":2}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // 続き389: 印刷済み【チーム】使用条件。live MANUAL の全トップレベルフィールドを保持する。
  "WXDi-D02-19LAT": [
    {"effectId":"WXDi-D02-19LAT-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":5}]},"condition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"さんばか","operator":"gte","value":3},{"type":"LRIG_LEVEL","owner":"self","operator":"gte","value":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","cardClass":"バーチャル"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // タスク12(lxxxii) 第5波: 3択は即時実行ではなく、選んだON_ATTACK_LRIG能力をターン終了時まで付与する。
  "PR-Di013": [
    { effectId: 'PR-Di013-E1', effectType: 'ACTIVATED', timing: ['MAIN'], cost: { energy: [{ color: '無', count: 0 }] }, action: {
      type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costText: '使用コストとして追加でエクシード４を支払ってもよい', exceed: 4 },
        { type: 'CHOOSE', choose_count: 1, from_count: 3, additionalCostChoose: { thenChooseCount: 2 }, choices: [
          { choiceId: 'draw', label: 'アタック時にカードを1枚引く', action: { type: 'GRANT_LRIG_ABILITY', duration: 'UNTIL_END_OF_TURN', rawText: '【自】《ターン１回》：このルリグがアタックしたとき、カードを１枚引く。', abilities: [
            { effectId: 'PR-Di013-E1-G-DRAW', effectType: 'AUTO', timing: ['ON_ATTACK_LRIG'], triggerScope: 'self', usageLimit: 'once_per_turn', action: { type: 'DRAW', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL' },
          ] } },
          { choiceId: 'energy', label: 'アタック時に【エナチャージ1】をする', action: { type: 'GRANT_LRIG_ABILITY', duration: 'UNTIL_END_OF_TURN', rawText: '【自】《ターン１回》：このルリグがアタックしたとき、【エナチャージ１】をする。', abilities: [
            { effectId: 'PR-Di013-E1-G-ENERGY', effectType: 'AUTO', timing: ['ON_ATTACK_LRIG'], triggerScope: 'self', usageLimit: 'once_per_turn', action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 }, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL' },
          ] } },
          { choiceId: 'trash', label: 'アタック時に対戦相手のシグニ1体をトラッシュに置く', action: { type: 'GRANT_LRIG_ABILITY', duration: 'UNTIL_END_OF_TURN', rawText: '【自】《ターン１回》：このルリグがアタックしたとき、対戦相手のシグニ１体を対象とし、それをトラッシュに置く。', abilities: [
            { effectId: 'PR-Di013-E1-G-TRASH', effectType: 'AUTO', timing: ['ON_ATTACK_LRIG'], triggerScope: 'self', usageLimit: 'once_per_turn', action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } }, duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL' },
          ] } },
        ] },
      ],
    }, duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL' },
  ],
  // タスク12(lxxxii) 第3波: 文中CHOOSEをliveへ載せる。
  // ①＝§6.4 O-10（続き509）で解体。「あなたのトラッシュから赤のシグニ１枚を対象とし、ターン終了時まで、
  //   それの基本レベルを１にする。それをレベル１のシグニとして場に出す。ターン終了時、それを場から手札に戻す。」
  //   新機構＝`SET_STORED_BASE_LEVEL`（「それ」の基本レベルをターン終了時まで変更。既存の
  //   `SET_BASE_LEVEL{until:END_OF_TURN}` は `sourceCardNum` 固定で「それ」を指せない）と
  //   `RETURN_TO_HAND_AT_TURN_END`（解決は `turnEndHandReturn.ts` の funnel＝ターン終了2経路）。
  //   ⚠**基本レベルは配置の後に書く**＝`ADD_TO_FIELD` が `lastProcessedCards` に出したカードを残すので
  //     「それ」の照応が取れる（engine の配置はリミット判定を伴わないので順序で挙動は変わらない）。
  // ③＝§6.4 O-10（続き509）で解体。「あなたの赤のセンタールリグ１体を対象とし、ターン終了時まで、
  //   それは能力を失い『【自】《ターン２回》：このルリグのアタックが【ガード】されたとき、このルリグをアップする。』を得る」。
  //   🔑**付与は `GRANT_EFFECT{target:LRIG}`（per-card ストア）で書く**＝`GRANT_LRIG_ABILITY` にすると
  //     `grantedStoreWatchers` が `lrig_abilities_disabled` で落とすので、**自分で消してしまう**
  //     （原文は「失い、得る」＝得た側は残る）。読み手は `collectLrigAttackGuardedTriggers`（augmented effectsMap）。
  //   ⚠色条件は `CONDITIONAL{LRIG_COLOR}` で外に出す（赤でなければ何も起きない＝対象が取れない）。
  "WXK08-002": [
    {"effectId":"WXK08-002-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"赤","count":3},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_CENTER_LRIG"},{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"トラッシュの赤のシグニ1枚をレベル1として場に出す（ターン終了時に手札へ）","action":{"type": "SEQUENCE", "steps": [{"type": "ADD_TO_FIELD", "owner": "self", "source": {"type": "TRASH_CARD", "owner": "self", "count": 1, "upToCount": false, "filter": {"cardType": "シグニ", "color": "赤"}}}, {"type": "STUB", "id": "SET_STORED_BASE_LEVEL", "value": 1}, {"type": "STUB", "id": "RETURN_TO_HAND_AT_TURN_END"}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":2,"upToCount":true,"totalPowerMax":10000,"filter":{"cardType":"シグニ"}}}},{"choiceId":"c2","label":"赤のセンタールリグは能力を失い「ガードされたときアップ」を得る","action":{"type": "CONDITIONAL", "condition": {"type": "LRIG_COLOR", "owner": "self", "color": "赤"}, "then": {"type": "SEQUENCE", "steps": [{"type": "STUB", "id": "SELF_LRIG_LOSE_ABILITY"}, {"type": "GRANT_EFFECT", "target": {"type": "LRIG", "owner": "self", "count": 1}, "duration": "UNTIL_END_OF_TURN", "rawText": "【自】《ターン２回》：このルリグのアタックが【ガード】されたとき、このルリグをアップする。", "effect": {"effectId": "WXK08-002-E1-G3", "effectType": "AUTO", "timing": ["ON_GUARD"], "triggerCondition": {"lrigAttackGuarded": true}, "action": {"type": "UP", "target": {"type": "LRIG", "owner": "self", "count": 1}}, "duration": "INSTANT", "mandatory": true, "parseStatus": "MANUAL", "usageLimit": "twice_per_turn"}}]}}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WDK04-006": [
    {"effectId":"WDK04-006-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WDK04-006-E1-G","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"DECLARE_PARITY_OPPONENT"},{"type":"STUB","id":"DECK_REVEAL_UNTIL"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_SIGNI_LEVEL_PARITY_DIFFERS_FROM_DECLARED"},"then":{"type":"NEGATE_ATTACK","target":{"type":"LRIG","owner":"opponent","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_opp"}],"rawText":"【自】：対戦相手のセンタールリグがアタックしたとき、対戦相手は偶数か奇数かを宣言する。あなたのデッキの上からシグニがめくれるまで公開する。この方法で公開されたシグニのレベルが宣言と異なる場合、そのアタックを無効にする。公開されたカードをシャッフルしてデッキの一番下に置く。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK11-052": [
    {"effectId":"WXK11-052-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":3}]},"action":{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK11-052-E1-G","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"trash_and_up","label":"シグニ２体をトラッシュしてルリグをアップ","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":2}},{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}}]}},{"choiceId":"skip","label":"トラッシュしない","action":{"type":"SEQUENCE","steps":[]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerScope":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "PR-461": [
    {"effectId":"PR-461-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"trash_and_up","label":"シグニ１体をトラッシュしてルリグをアップ","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1}},{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}}]}},{"choiceId":"skip","label":"トラッシュしない","action":{"type":"SEQUENCE","steps":[]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WX25-P1-107": [
    {"effectId":"WX25-P1-107-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"deckTrash":3},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"天使"}},"delta":3000,"duration":"UNTIL_OPP_TURN_END"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // タスク12(l): 引用能力を rawText のまま捨てず、実行可能な内側 CardEffect として付与する。
  "WXDi-P11-038": [
    // 🆕E1＝「あなたのターンの場合、次の対戦相手のターン終了時まで、このルリグは「【常】：あなたのシグニのパワーを＋10000する。」を得る」。
    //   🔴旧 live は付与が消えて**その瞬間の場のシグニだけ**への +10000 スナップショットだった（census 高シグナル 第4弾）。
    {"effectId":"WXDi-P11-038-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"TURN_OWNER","owner":"self"},"then":{"type":"GRANT_LRIG_ABILITY","duration":"UNTIL_OPP_TURN_END","abilities":[{"effectId":"WXDi-P11-038-E1-GRANT","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":10000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]}},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P11-038-E2","effectType":"AUTO","timing":["ON_PLAY"],"activeCondition":{"type":"TURN_OWNER","owner":"opponent"},"action":{"type":"CONDITIONAL","condition":{"type":"TURN_OWNER","owner":"opponent"},"then":{"type":"GRANT_LRIG_ABILITY","rawText":"【常】：あなたのシグニは【シャドウ】を得る。","abilities":[{"effectId":"WXDi-P11-038-E2-GRANT","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"keyword":"シャドウ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX26-CP1-005": [
    {"effectId":"WX26-CP1-005-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":5},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_ATTACK_PHASE_START"},"effect":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"プリオケ"},"upToCount":false}},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":{"$ref":"last_processed_level"}}}]}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_ATTACK_PHASE_START"},"effect":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"プリオケ"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX26-CP1-005-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"shuffle":false,"position":"bottom"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}}}],"recollectArts":{"minArts":4,"thenChooseCount":2,"thenUpTo":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P02-034": [
    {"effectId":"WXDi-P02-034-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P02-034-E1-GRANT","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","action":{"type":"MILL","owner":"self","count":0,"countPerSourceLevel":2},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // タスク12(xxxix) バッチ3: 公開集合の照応と条件の向きを既存の snapshot/stored-target/reveal remainder で忠実化。
  "WD07-007": [
    {"effectId":"WD07-007-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1},{"color":"白","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":4}},{"type":"SEQUENCE","snapshotLastProcessedForConditionals":true,"steps":[{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"黒"}},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"白"}},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","color":"白"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}] }]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXK10-060": [
    {
      effectId: 'WXK10-060-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'SAME_ZONE_HAS_SEED' },
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
        delta: 3000,
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {"effectId":"WXK10-060-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":3},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"植物"},"operator":"eq","value":3,"distinctName":true,"verbJa":"公開された"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"cardType":"シグニ","story":"植物"},"pickCount":1,"then":{"type":"ADD_TO_ENERGY","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}},"else":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"pickCount":0,"then":{"type":"STUB","id":"INTERNAL_NOOP"},"remainder":{"location":"deck","position":"bottom","shuffle":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P11-039": [
    {"effectId":"WXDi-P11-039-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":"ALL"},"optional":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_LEVEL_SUM","operator":"eq","value":10},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"白"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1,"verbJa":"捨てた"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  // タスク12(xxxix) バッチ2: 対象・所有者・集合制約の脱落を既存語彙だけで忠実化。
  "WDK05-T01": [
    {"effectId":"WDK05-T01-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"燃盛　遊月・鍵"}},"action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK09-063": [
    {"effectId":"WXK09-063-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"RULE_REMINDER_TEXT"},{"type":"STUB","id":"STEAL_OPP_TRASH_PUPPET","puppetParams":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","isPuppet":true},"minCount":2},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // WX22-006（キー）：原文は「【常】：あなたのセンタールリグは以下の能力を得る。【起】…エクシード２：…【起】…エクシード２：…」＝
  //   2本の【起】は**キー自身の能力ではなくセンタールリグへの付与能力**。タスク12(l) で parser が
  //   GRANT_LRIG_ABILITY.abilities へ入れ子化するようになったため、旧 `-E3`（トップレベルのキー【起】）は
  //   effectId が `-E1-G2` へ移動する。＜精元＞除外と「それぞれ名前の異なる」制約は parser が出せないので
  //   親 `-E1` ごと MANUAL で持つ。⚠`-E1-G` は **parser の生出力ではなく curated（旧 `-E2`）を正とする**＝
  //   原文「そのシグニの【出】能力は発動しない」は curated の `ADD_TO_FIELD.suppressOnPlay`（出した1体だけ抑止）が
  //   正しく、現 parser の `BLOCK_ACTION{PLAYER, ON_PLAY_ABILITY, END_OF_TURN}` は**そのターンの全【出】を止める**
  //   過剰実行。
  "WX22-006": [
    {"effectId":"WX22-006-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[
      {"effectId":"WX22-006-E1-G","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"SEQUENCE","steps":[{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","level":{"max":4}},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","suppressOnPlay":true},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
      {"effectId":"WX22-006-E1-G2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":7,"filter":{"cardType":"シグニ","cardClassExclude":"精元"},"selectionConstraint":{"distinct":"name"}},"shuffle":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"operator":"eq","value":7,"shareClass":true,"verbJa":"デッキに加えた"},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
    ],"rawText":"【起】《ターン１回》《アタックフェイズアイコン》エクシード２：あなたのデッキからレベル４以下のシグニ１枚を探して場に出し、デッキをシャッフルする。そのシグニの【出】能力は発動しない。【起】《ターン１回》《アタックフェイズアイコン》エクシード２：あなたのトラッシュから＜精元＞ではないそれぞれ名前の異なる対象のシグニ７枚をデッキに加えてシャッフルする。この方法で共通するクラスを持つシグニ７枚をデッキに加えた場合、対象の対戦相手のシグニ１体をトラッシュに置く。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK01-005": [
    {"effectId":"WXK01-005-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","color":"黒"},"operator":"gte","value":1,"verbJa":"手札に加えた"},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"RETURN_SELF_ARTS_TO_LRIG_DECK"},{"type":"BLOCK_CARD_USE","cardName":"インサイダー・サルベージ"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX24-P3-069": [
    {"effectId":"WX24-P3-069-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPEN_MAGIC_BOX"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST","negate":true},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SET_CANCEL_ATTACK_FLAG"},{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WX24-P3-069-E1-G","effectType":"CONTINUOUS","action":{"type":"STUB","id":"OPP_GUARD_COST_COLORLESS","count":3},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【常】：対戦相手は追加で《無》《無》《無》を支払わないかぎり【ガード】ができない。"}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  // タスク12(xxxix) バッチ1: MB公開後にLBを持たない場合、自身のアタックを無効化してから後続処理。
  // OPEN_MAGIC_BOX の非公開/MBなしは lastProcessedCards=[] となり、negate側も不成立のまま維持する。
  "WX24-P3-050": [
    {"effectId":"WX24-P3-050-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"ちより　第三章"}},"then":{"type":"STUB","id":"OPEN_MAGIC_BOX"},"else":{"type":"STUB","id":"INTERNAL_OPEN_MB_SKIP"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST","negate":true},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SET_CANCEL_ATTACK_FLAG"},{"type":"STUB","id":"OPPONENT_PAY_OPTIONAL","costColors":["無","無","無","無","無"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
    {"effectId":"WX24-P3-050-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"トリック"},"excludeSelf":true},"then":{"type":"STUB","id":"INTERNAL_NOOP"},"else":{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX24-P4-067": [
    {"effectId":"WX24-P4-067-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPEN_MAGIC_BOX"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST","negate":true},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SET_CANCEL_ATTACK_FLAG"},{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":3,"upToCount":true,"filter":{"colorNotMatchesLrig":true}}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WX11-027": [{"effectId":"WX11-027-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ"},"sourceOwner":"opponent","from":["any"],"sourceEffectType":"LIFE_BURST","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX24-P4-006": [{"effectId":"WX24-P4-006-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":1},{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"LRIG","owner":"opponent","count":1}},{"type":"PREVENT_NEXT_DAMAGE","count":1,"damageSource":"signi","sourceLevelLtLastProcessed":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  "WXDi-D07-007": [{"effectId":"WXDi-D07-007-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"PREVENT_NEXT_DAMAGE","count":2,"millAtTurnEndPerPrevented":5},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"WXDi-D07-007-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"黒","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"PREVENT_NEXT_DAMAGE","count":1,"millAtTurnEndPerPrevented":5},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  "WXEX1-58": [
    // 「そのレゾナ」＝出現条件で今場に出た＜宇宙＞レゾナ。全シグニ保護ではない。
    {"effectId":"WXEX1-58-E1","effectType":"AUTO","timing":["ON_TRASH"],"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"targetsTriggerSource":true,"from":["ルリグ"],"sourceOwner":"opponent","duration":"UNTIL_OPP_TURN_END"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"forResonaCondition":true,"resonaClass":"宇宙","fromZones":["field"]}}
  ],
  "WXEX1-72": [
    // 「そのレゾナ」＝出現条件で今場に出た＜遊具＞レゾナ。対戦相手の効果だけでなくバトル/ルール処理のバニッシュも防ぐ。
    {"effectId":"WXEX1-72-E1","effectType":"AUTO","timing":["ON_TRASH"],"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"targetsTriggerSource":true,"keyword":"バニッシュされない","duration":"UNTIL_OPP_TURN_END"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"forResonaCondition":true,"resonaClass":"遊具","fromZones":["field"]}}
  ],
  "WXDi-P05-009": [
    {
      effectId: 'WXDi-P05-009-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'LOOK_PICK_CHAIN',
        owner: 'self',
        revealCount: 3,
        stages: [{ pickCount: 1, pickUpTo: true, pickNoun: 'カード', then: 'deck_top' }],
        remainder: { location: 'deck', position: 'bottom', reorder: true },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {"effectId":"WXDi-P05-009-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_LRIG_UNDER_COST"},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":1},"shuffle":false,"position":"top"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WX24-P1-050": [
    {"effectId":"WX24-P1-050-E1","effectType":"CONTINUOUS","activeCondition":{"type":"DURING_ATTACK_PHASE"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"delta":-2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX24-P2-057": [
    {"effectId":"WX24-P2-057-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"DURING_ATTACK_PHASE"},{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"エニグマ/メイデン　イオナ"}}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"delta":-3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX24-P2-057-E2","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"DURING_ATTACK_PHASE","owner":"self"},{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"迷宮"},"excludeSelf":true}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"delta":-4000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // 段2 第44バッチ：既存 MANUAL の探索本体を保ち、発動条件だけ一次原文どおり補う。
  "WX25-P3-054": [
    {"effectId":"WX25-P3-054-E2","effectType":"AUTO","timing":["ON_TRASH"],"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"解明の巫女　ユキ"}},"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","cardClass":"迷宮"},"pickCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn","triggerCondition":{"turnOwner":"self"}},
  ],
  "WXDi-P10-044": [
    {"effectId":"WXDi-P10-044-E1","effectType":"CONTINUOUS","activeCondition":{"type":"DURING_ATTACK_PHASE"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"delta":-2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK11-029": [
    // §6.3「正面」サブ機構(b): 「このシグニの正面のシグニの【出】能力は発動しない」。
    // 従来は BLOCK_ACTION{PLAYER owner:'self'} ＝**自分のプレイヤーの【出】をターン終了まで丸ごと封じる**自傷だった。
    // 既存 abilityTypes 語彙＋frontOfSelf（E2 と同じ解決）で表現し、engine 側は召喚時 ON_PLAY 収集を '出' でゲートする。
    {"effectId":"WXK11-029-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"until":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX12-038": [
    {"effectId":"WX12-038-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WD17-009": [
    {"effectId":"WD17-009-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"condition":{"type":"SELF_POWER_GTE","value":15000},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
    {"effectId":"WD17-009-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"武勇"}},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":15000}},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P04-049": [
    {"effectId":"WXDi-P04-049-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"until":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WX25-CP1-002": [
    {"effectId":"WX25-CP1-002-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":1},{"color":"無","count":2}]},"action":{"type":"CHOOSE","choose_count":2,"from_count":4,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"pickCount":2,"pickUpTo":true,"pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom"}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"HAND_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"ブルアカ"}},"suppressOnPlay":true}]}},{"choiceId":"c2","label":"選択肢3","action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"}},{"choiceId":"c3","label":"選択肢4","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_NO_ABILITIES"},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1,"filter":{"story":"ブルアカ"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]}}]}}],"upTo":true,"recollectArts":{"minArts":4,"thenChooseCount":3,"thenUpTo":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WD22-036-G": [
    {"effectId":"WD22-036-G-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"遊具"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","story":"遊具"},"pickCount":1,"handOrField":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"遊戯"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":5,"upToCount":true,"filter":{"cardType":"シグニ","story":"遊具"}},"shuffle":true}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX25-P3-027": [
    {"effectId":"WX25-P3-027-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"STUB","id":"SET_DISPAIR_BURST_GRANT","burstAction":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["無"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}
  ,
    {"effectId":"WX25-P3-027-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒"]},{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"IS_MY_TURN"},{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardType":"シグニ","story":"悪魔"},"minCount":15}]},"then":{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"GUARD","until":"END_OF_ATTACK"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // WX24-P3-022 エルドラ×マークIII BURST E2【起】：このターンと次のターンの間、全領域へドロー1＋任意手札2枚で固定対象をダウンするLBを追加付与。
  "WX24-P3-022": [{"effectId":"WX24-P3-022-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"STUB","id":"SET_DISPAIR_BURST_GRANT","burstAction":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":2}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]},"burstAdditive":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}],
  "WXDi-P04-036": [
    {"effectId":"WXDi-P04-036-E1","effectType":"CONTINUOUS","activeCondition":{"type":"LRIG_DECK_COUNT","owner":"self","operator":"lte","value":1},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P04-036-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"condition":{"type":"THIS_CARD_IS_UP"},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":3}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WXK08-034": [
    {"effectId":"WXK08-034-E1","effectType":"CONTINUOUS","activeCondition":{"type":"SUBSCRIBER_COUNT","operator":"gte","value":80},"action":{"type":"GRANT_FIELD_SIGNI_ABILITY","thisCardOnly":true,"abilities":[{"effectId":"WXK08-034-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"condition":{"type":"ALL_SELF_SIGNI_DOWN"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","usageLimit":"once_per_turn"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P02-038": [
    {"effectId":"WXDi-P02-038-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"condition":{"type":"THIS_CARD_IS_UP"},"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"colorNotMatchesOppLrig":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
    {"effectId":"WXDi-P02-038-E2","effectType":"AUTO","timing":["ON_TURN_END"],"condition":{"type":"ENERGY_TRASHED_BY_OPP","owner":"opponent","operator":"gte","value":2},"action":{"type":"DRAW","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P14-043": [
    {"effectId":"WXDi-P14-043-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":2}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WX15-055": [
    {"effectId":"WX15-055-E1","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"any_opp","triggerCondition":{"duringAttackPhase":true,"banishedFrontOfSelf":true,"turnOwner":"self"},"condition":{"type":"THIS_CARD_IS_UP"},"action":{"type":"DRAW","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXEX2-23": [
    {"effectId":"WXEX2-23-E2","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"any_opp","triggerCondition":{"duringAttackPhase":true},"action":{"type":"STUB","id":"STEAL_OPP_TRASH_PUPPET","puppetParams":{"count":1,"optional":true,"levelLteTrigger":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX15-056": [
    {"effectId":"WX15-056-E1","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"any_opp","triggerCondition":{"duringAttackPhase":true,"banishedFrontOfSelf":true,"turnOwner":"self"},"condition":{"type":"THIS_CARD_IS_UP"},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX18-052": [
    {"effectId":"WX18-052-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerFilter":{"story":["空獣","地獣"]},"triggerCondition":{"duringMainPhase":true},"condition":{"type":"THIS_CARD_IS_DOWN"},"action":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
  ],
  "WX16-040": [
    {"effectId":"WX16-040-E1","effectType":"AUTO","timing":["ON_TRAP_ACTIVATE"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}}},{"type":"STUB","id":"MARK_SELF_DELAYED_EXILE"}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX21-Re06": [
    {"effectId":"WX21-Re06-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerCondition":{"placedFromTrash":true},"action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}},"optional":true},{"type":"STUB","id":"MARK_SELF_DELAYED_EXILE"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WD22-035-G": [
    {"effectId":"WD22-035-G-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"any_opp","condition":{"type":"FIELD_COUNT","owner":"self","operator":"eq","value":2},"action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}},"optional":true},{"type":"STUB","id":"MARK_SELF_DELAYED_EXILE"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-D07-004": [
    {"effectId":"WXDi-D07-004-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":3},"action":{"type":"SEQUENCE","steps":[{"type":"EXILE","target":{"type":"LRIG_DECK_CARD","owner":"self","count":1,"filter":{"cardType":"ピース"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","color":"赤"}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}
  ],
  "WXDi-P04-013": [
    {"effectId":"WXDi-P04-013-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":3},"action":{"type":"SEQUENCE","steps":[{"type":"EXILE","target":{"type":"LRIG_DECK_CARD","owner":"self","count":1,"filter":{"cardType":"ピース"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","noGuard":true}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
    // WXDi-P04-013 ／ 原文【常】：あなたのターンの間、**【ソウル】が付いているあなたのシグニの正面の**シグニの
    //   パワーを－2000する。
    // 🔴旧 live＝`owner:'any', count:1` の裸 POWER_MODIFY＝**CONTINUOUS の自己適用枠**に落ちており、
    //   「正面」も「【ソウル】が付いている」も丸ごと消えていた。
    // 🔑`calcFieldPowers` の count:'ALL' 経路に per-zone の解決を1本足した（`frontOfAllyWithSoul`）。
    {"effectId":"WXDi-P04-013-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","frontOfAllyWithSoul":true}},"delta":-2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P04-016": [
    {"effectId":"WXDi-P04-016-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":3},"action":{"type":"SEQUENCE","steps":[{"type":"EXILE","target":{"type":"LRIG_DECK_CARD","owner":"self","count":1,"filter":{"cardType":"ピース"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true},"delta":-12000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
    // WXDi-P04-016-E1 ／ 原文【自】：**【ソウル】が付いている**あなたのシグニ１体がアタックしたとき、
    //   対戦相手のデッキの上からカードを２枚トラッシュに置く。
    // 🔴旧 live＝トリガー主語が丸ごと無く（`triggerScope` すら無い）**どのシグニのアタックでも発火**していた。
    // 🔑新設した `TargetFilter.hasSoul`（`hasAcce` と同じゾーン状態フィルタ）＋ `triggerFilter` の
    //   ゾーン状態評価（`triggerStateFilterOk`）で解決。⚠状態キーは `matchesFilter` では素通りする。
    {"effectId":"WXDi-P04-016-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","hasSoul":true},"action":{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":2}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // PR-378: 原文は「あなたのシグニ１体を対象とし」＝count:1 強制。除外も「そうした場合」の内側
  // ＝バニッシュ不成立時はこのカードを除外しない（通常どおりトラッシュへ）。
  "PR-378": [
    {"effectId":"PR-378-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"draw","label":"自分のシグニ1体をバニッシュし、そうした場合1枚引き自身を除外","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]}}]}},{"choiceId":"charge","label":"自分のシグニ1体をバニッシュし、そうした場合エナチャージ1し自身を除外","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "SP36-001": [
    {"effectId":"SP36-001-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"赤","count":3},{"color":"無","count":3}],"costScaling":[{"direction":"reduce","counts":[{"kind":"spellsUsedThisTurn","owner":"opponent"}],"per":1,"amount":[{"color":"赤","count":1},{"color":"無","count":1}]},{"direction":"reduce","counts":[{"kind":"artsUsedThisTurn","owner":"opponent"}],"per":1,"amount":[{"color":"赤","count":3},{"color":"無","count":3}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"PREVENT_DEFEAT_THIS_TURN"},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXK03-039": [
    {"effectId":"WXK03-039-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"STUB","id":"SELECT_OPP_SIGNI_FOR_BOTTOM_MILL"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK08-055": [
    {"effectId":"WXK08-055-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"TRASH_UNDER_SIGNI_UP_TO_ALL"},{"type":"SEQUENCE","snapshotLastProcessedForConditionals":true,"steps":[{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"delta":-5000,"duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"DRAW","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":3},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"delta":-10000,"duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":4},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"color":"\u9ed2","cardType":"\u30b7\u30b0\u30cb"}}}}]}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK11-070": [
    {"effectId":"WXK11-070-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":"ALL"}},{"type":"SEQUENCE","snapshotLastProcessedForConditionals":true,"steps":[{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":5},"then":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":"ALL"},"shuffle":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":10},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "PR-204": [
    {"effectId":"PR-204-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1},{"color":"無","count":2}]},"condition":{"type":"LRIG_LEVEL","owner":"self","operator":"lte","value":4},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"PR-204-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"triggerScope":"self","condition":{"type":"NO_OTHER_ARTS_USED_THIS_TURN","exceptCardName":"アーク・ディストラクト"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","exceed":2},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WD21-009": [
    {"effectId":"WD21-009-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1},{"color":"無","count":2}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WD21-009-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"LRIG_UNDER_TRASH_ANY"},{"type":"SEQUENCE","snapshotLastProcessedForConditionals":true,"steps":[{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"STUB","id":"DECLARE_TWO_GUARD_LEVELS"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":4},"then":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"トリプルクラッシュ","duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":5},"then":{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}}}] }]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "PR-238": [
    {"effectId":"PR-238-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"PR-238-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"triggerScope":"self","condition":{"type":"NO_OTHER_ARTS_USED_THIS_TURN","exceptCardName":"ディストラクト・アウト"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"LRIG_UNDER_TRASH_ANY"},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"MILL","owner":"self","count":0,"countPerStoredTargets":5},{"type":"MILL","owner":"opponent","count":0,"countPerStoredTargets":5},{"type":"CONDITIONAL","condition":{"type":"DECK_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX17-041": [
    {"effectId":"WX17-041-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"RETURN_TRAP_TO_HAND_ONE"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "PR-470A": [
    {"effectId":"PR-470A-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"SELF_POWER_GTE","value":10000},"then":{"type":"DRAW","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"SELF_POWER_GTE","value":25000},"then":{"type":"STUB","id":"SELF_TO_LRIG_DECK_AND_FETCH_SAME_NAME","fetchCardName":"進化する筋肉　紗倉ひびき"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 sub-case (b): Carnival -Q- ignores opponent effects. The
  // own-other-source part of "except itself" is near-inert and intentionally
  // deferred; sourceOwner keeps the lrig's own effects from being blocked.
  // `O-75`＝E2 の「このルリグ」も任意のシグニへ誤分類されていたため、既存の LRIG 付与形へ戻す。
  "WX17-001": [
    {"effectId":"WX17-001-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","fromAll":true,"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX17-001-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CHOOSE","choose_count":1,"from_count":4,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"choiceId":"c2","label":"選択肢3","action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c3","label":"選択肢4","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 sub-case (d): designation survives the intervening optional reveal.
  // The zero-delta POWER_MODIFY is the existing count:1 field selector/recorder;
  // OPTIONAL_COST is an honest approximation of revealing two <Aquatic Beast> signi.
  "WXK10-080": [
    {"effectId":"WXK10-080-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"水獣"}},"delta":0},{"type":"STUB","id":"OPTIONAL_COST","costColors":[],"costText":"手札から＜水獣＞のシグニを2枚公開してもよい"},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"targetsLastProcessed":true,"delta":5000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // BET gives one selected signi a temporary CONT protection ability. The
  // all-signi +2000 remains the first step; only the granted ability is count:1.
  "WD18-008": [
    {"effectId":"WD18-008-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":2000,"duration":"UNTIL_END_OF_TURN"},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WD18-008-E1-GRANT","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"opponent"},"action":{"type":"GRANT_PROTECTION","fromAll":true,"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // WXK11-020 羅星姫 ≡コスモウス≡：相手エナの印字・付与マルチエナをすべて失わせる。
  // 「相手の効果を受けない」の非マルチエナ部分は実在対象がほぼない near-inert な耐性のため、
  // 同じ honest STUB に保持して defer（別の近似アクションは追加しない）。支払い経路は costs.ts で実装。
  "WXK11-020": [{"effectId":"WXK11-020-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"STRIP_OPP_ENA_MULTI_ENA"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX12-Re09 大剣 デュランダ：自分の場のシグニ3体に共通色がない間、基本パワー15000＋相手効果への完全耐性。
  "WX12-Re09": [
    {"effectId":"WX12-Re09-E1","effectType":"CONTINUOUS","activeCondition":{"type":"NO_COMMON_COLOR_AMONG_FIELD_SIGNI","owner":"self","count":3},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":15000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX12-Re09-E2","effectType":"CONTINUOUS","activeCondition":{"type":"NO_COMMON_COLOR_AMONG_FIELD_SIGNI","owner":"self","count":3},"action":{"type":"GRANT_PROTECTION","fromAll":true,"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // ===== 【常】：【マルチエナ】（自身キーワード）＝**残っているのは parser が出せない1枚だけ** =====
  // 🔴**2026-08-27（Sheet1 B2）に18枚を撤去した。** `parseSentencePart1.ts` の印字キーワード汎用規則が
  //   `thisCardOnly` を落としており、`parseSentencePart4.ts` の専用規則（正しい版）と食い違っていたため、
  //   `buildEffectsJson.ts` が「parser の粗い `-E2` を二重に載せない」ガードでサーバント19枚を弾き続け、
  //   結果その19枚が `docs/_idset_fresh.json` に落ちて**あらゆる parser 改善が永久に届かない凍結状態**だった（§6.4 `O-39`）。
  //   汎用規則に `thisCardOnly` を足したことで parser 出力が**この手書きと実体同一**になった（18枚とも相違0を実測）ので、
  //   影武者（§6.4 `O-93`）として撤去し parser に所有権を返した。
  // ⚠**`WXK05-030` だけは残す**＝スペル本文の末尾に付く「。【常】：【マルチエナ】」は parser が拾わないため
  //   （撤去すると live からマルチエナが消える）。実測で確認済み。
  // ⚠`censusManualDrift.ts` の「削除候補」はこの形を出せない＝**effectId で突き合わせる**ので、
  //   `-MULTIENA` と `-E2` のように**id が改名された影武者**は別バケツに落ちる（計器の死角）。
  // 🆕**§5.3 `O-188` 第6バッチ（2026-09-01）＝`WXK05-030-E1` の後段サーチが「黒1枚」に潰れていた。**
  //   原文「あなたのデッキから**白、赤、青、緑、黒のカードをそれぞれ１枚まで**探して公開し手札に加え、
  //   デッキをシャッフルする」に対し、旧 live は `SEARCH{filter:{color:'黒'}, maxCount:1}`
  //   ＝**最大5枚が1枚になる過小実行**うえ、**色の対応が黒に化けていた**（他4色は1枚も取れない）。
  //   受け皿は既存の `SearchAction.selectionConstraint`（`execSearch:4586` が群を解決）。
  // 🔴**前段の `STUB{BANISH_MULTI_COLOR_SIGNI}` も別物を実装していた**＝原文「対戦相手の白、赤、青、緑、黒の
  //   シグニを**それぞれ１体**対象とし、それらを**トラッシュに置く**」に対し、engine のハンドラは
  //   **「2色以上を持つ相手シグニを（選択させずに）全部バニッシュ」**だった。⇒ typed な
  //   `TRASH{SIGNI, selectionConstraint.groups}` へ置き換え、engine のハンドラは削除した。
  "WXK05-030": [{"effectId":"WXK05-030-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK05-030-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":5}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":5,"upToCount":true,"filter":{"cardType":"シグニ","color":["白","赤","青","緑","黒"]},"selectionConstraint":{"groups":[{"filter":{"cardType":"シグニ","color":"白"},"count":1},{"filter":{"cardType":"シグニ","color":"赤"},"count":1},{"filter":{"cardType":"シグニ","color":"青"},"count":1},{"filter":{"cardType":"シグニ","color":"緑"},"count":1},{"filter":{"cardType":"シグニ","color":"黒"},"count":1}]}}},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"color":["白","赤","青","緑","黒"]},"maxCount":5,"upToTarget":true,"revealPicked":true,"selectionConstraint":{"groups":[{"filter":{"color":"白"},"count":1},{"filter":{"color":"赤"},"count":1},{"filter":{"color":"青"},"count":1},{"filter":{"color":"緑"},"count":1},{"filter":{"color":"黒"},"count":1}]},"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},{"type":"STUB","id":"RULE_REMINDER_TEXT"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],


  // ===== §6.2 系統②：GRANT_PROTECTION 効果耐性の subjectFilter/count/from 是正（Opusタスク9） =====
  // 「あなたの[属性/状態]シグニは対戦相手の…効果を受けない」を parser が target:{count:'ALL'} で吐くと
  // collectEffectImmuneSigni が count:'ALL' を honor せず効果元シグニ1体のみ保護（＝広域耐性が実質死ぬ偽陰性）。
  // → subjectFilter:{...}/subjectOwner へ変換（collectEffectImmuneSigni が matchesFilter＋matchesStateFilter で全該当シグニを保護）。
  //   from が誤って全種別（＝全効果耐性）になっているものは原文の軸（BANISH 等）へ、「このシグニ」限定は count:1＋activeCondition へ。
  // WX05-024-E2 幻獣神 ライアン：「あなたのパワー15000以上のシグニは、対戦相手の、スペルとシグニの効果を受けない」
  //   （E1「シグニのパワーは増減しない」＝from:['POWER_MODIFY'] の別mis-parse は §6.3 送り）。
  "WX05-024": [
    {"effectId":"WX05-024-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_POWER_MODIFY_BY_OPP","powerModifyProtection":{"directions":["plus","minus"],"subjectOwner":"any","subjectFilter":{"cardType":"シグニ"}}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX05-024-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","powerRange":{"min":15000}},"subjectOwner":"self","from":["シグニ","スペル"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // POWER_MODIFY 免疫5件。方向と保護主体を明示し、裸の「シグニ」は両盤面(any)、
  // 「あなたの」は self、「対戦相手の」は opponent、レイヤー内「このシグニ」は付与先自身だけを守る。
  "WX12-033": [{"effectId":"WX12-033-E3","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_POWER_MODIFY_BY_OPP","powerModifyProtection":{"directions":["plus","minus"],"subjectOwner":"self","subjectFilter":{"cardType":"シグニ","cardClass":["空獣","地獣"]}}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX20-023": [{"effectId":"WX20-023-LAYER","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","cardClass":"怪異"},"abilities":[{"effectId":"WX20-023-LAYER-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_POWER_MODIFY_BY_OPP","powerModifyProtection":{"directions":["plus","minus"],"subjectOwner":"self","subjectFilter":{"cardType":"シグニ"},"thisCardOnly":true}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX22-013": [{"effectId":"WX22-013-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_POWER_MODIFY_BY_OPP","powerModifyProtection":{"directions":["plus"],"subjectOwner":"any","subjectFilter":{"cardType":"シグニ"}}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX22-013-E2","effectType":"AUTO","timing":["ON_SIGNI_POWER_ZERO_OR_LESS"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"デッキの一番上をエナゾーンに置く","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},{"choiceId":"c1","label":"カードを1枚引く","action":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn","triggerScope":"any_opp"},
  ],
  "WXK03-018": [{"effectId":"WXK03-018-E3","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_POWER_MODIFY_BY_OPP","powerModifyProtection":{"directions":["plus"],"subjectOwner":"opponent","subjectFilter":{"cardType":"シグニ"}}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX09-016-E1 混沌の豊穣 シュブニグラ：「あなたのダウン状態のシグニは対戦相手のシグニの効果を受けない」→ isDown。
  "WX09-016": [{"effectId":"WX09-016-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","isDown":true},"subjectOwner":"self","from":["シグニ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX09-CB02-E1（終末の回旋 チェロン）は下方の既存ブロックで是正済（from:['BANISH']＋hasCrossIcon）。
  // WX13-005A-E1 白羅星 フルムーン：「あなたの他のレゾナは対戦相手のシグニの効果を受けない」→ cardType:レゾナ＋excludeSelf。
  "WX13-005A": [{"effectId":"WX13-005A-E1","effectType":"CONTINUOUS","appearanceCondition":{"rawText":"《メインフェイズアイコン》合計３枚のレゾナではない＜宇宙＞のシグニをあなたの手札と場からトラッシュに置く","timings":["MAIN"],"cost":{},"combinedTrash":{"zones":["hand","field"],"count":3,"filter":{"cardType":"シグニ","story":"宇宙","excludeResona":true}},"paymentShape":"REQUIRES_NEW_FLOW"},"action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"レゾナ","excludeSelf":true},"subjectOwner":"self","from":["シグニ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX18-034-E1 コードオーダー モツナ：「このシグニはアクセされているかぎり、対戦相手のルリグの効果を受けない」。
  //   広域ではなく「このシグニ」限定＋アクセ条件 → count:1（＝効果元自身を保護）＋activeCondition:IS_SELF_ACCED。
  "WX18-034": [{"effectId":"WX18-034-E1","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_ACCED"},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["ルリグ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX19-048-E1 中盾 ティンベー：「対戦相手のターンの間、カード名に《盾》を含むあなたのシグニは対戦相手のシグニの効果を受けない」。
  //   activeCondition:TURN_OWNER(opponent) は既存維持＋subjectFilter:{cardName:'盾'}。
  "WX19-048": [{"effectId":"WX19-048-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"opponent"},"action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","cardName":"盾"},"subjectOwner":"self","from":["シグニ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXEX1-37-E1 コードアクセル アパッチ：「あなたのドライブ状態のシグニは対戦相手の、キーとアーツの効果を受けない」→ isDrive。
  //   キーは srcIsArts（アーツ/ピース/キー）に含まれるため from:['アーツ'] で判定される。
  "WXEX1-37": [{"effectId":"WXEX1-37-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","isDrive":true},"subjectOwner":"self","from":["アーツ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX08-017-E1 日進月歩（アーツ・SEQUENCE内 GRANT_PROTECTION）：
  //   「その後、ターン終了時まで、あなたのパワー30000以上のすべてのシグニは『対戦相手のアーツの効果を受けない』を得る」。
  //   step2 count:1→'ALL'（すべてのシグニ）＋duration PERMANENT→UNTIL_END_OF_TURN。execGrantProtection が count:'ALL' を
  //   keyword_grants へ一括付与し collectEffectImmuneSigni が PROTECTION:アーツ:opponent を読む（power30000 は付与時の実効パワーで判定）。
  //   step1 の POWER_MODIFY は INSTANT 実行時 temp_power_mods（ターン終了時クリア）＝原文「ターン終了時まで＋5000」で正しい。
  "WX08-017": [{"effectId":"WX08-017-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":5000},{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","powerRange":{"min":30000}}},"from":["アーツ"],"sourceOwner":"opponent","duration":"UNTIL_END_OF_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  // WX15-031-LAYER 幻怪姫 ヌラリ（LAYER付与型）：
  //   「【レイヤー】あなたの＜怪異＞のシグニは《レイヤーアイコン》の能力を得る…【常】：このシグニは対戦相手のコストの合計が
  //   ５以上の、アーツとスペルの効果を受けない」。内側【常】GRANT_PROTECTION に sourceCostMin:5 を追加（旧JSONはコスト条件脱落で
  //   全アーツ/スペルを無条件遮断する過剰保護）。GRANT_FIELD_SIGNI_ABILITY は collectGrantedFromLayer 経由で各＜怪異＞シグニへ
  //   付与され、collectEffectImmuneSigni が augMap のその granted 能力を読む（sourceCostMin は解決中アーツ/スペルの Cost 合計で判定）。
  "WX15-031": [{"effectId":"WX15-031-LAYER","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","story":"怪異"},"abilities":[{"effectId":"WX15-031-LAYER-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["スペル","アーツ"],"sourceOwner":"opponent","sourceCostMin":5,"duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXEX2-36-E1 太陽の射手 カルルナ：相手ターン中、ライズ持ちの自シグニを、ライズを持たない相手シグニの効果から保護。
  "WXEX2-36": [{"effectId":"WXEX2-36-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"opponent"},"action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","hasRiseIcon":true},"sourceOwner":"opponent","from":["シグニ"],"sourceFilter":{"noRiseIcon":true},"duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXK11-021-E1 炎魔の先駆 アークゲイン：自ターン中、自シグニすべてを、LBを持たない相手シグニの効果から保護。
  "WXK11-021": [{"effectId":"WXK11-021-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ"},"sourceOwner":"opponent","from":["シグニ"],"sourceFilter":{"hasLifeBurst":false},"duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],


  // ===== 血晶武装：逆翻訳乖離の修正（「血晶武装状態であるかぎり/の場合」の条件欠落） =====
  // WXK04-002 英血の器 優羽莉Lv4'（ルリグ）：E1【常】あなたの血晶武装状態のシグニは対戦相手のルリグの効果を受けない。
  //   旧JSONは target:{owner:self,count:ALL}（collectEffectImmuneSigni が count:ALL を honor せず効果元のみ保護）で実質機能せず。
  //   → subjectFilter:{isArmored:true}/subjectOwner:self（武装シグニ全体）へ。collectEffectImmuneSigni に matchesStateFilter 評価を追加済み。
  "WXK04-002": [
    {"effectId":"WXK04-002-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","isArmored":true},"subjectOwner":"self","from":["ルリグ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // WXK04-074 紅蓮の使い魔 スノーホワイト：E2【自】あなたのターン終了時、このシグニが血晶武装状態の場合、エナチャージ1。
  //   旧JSONは condition 欠落で武装状態に関係なく常にチャージしていた。E1（武装中+5000）はJSON維持。
  "WXK04-074": [{"effectId":"WXK04-074-E2","effectType":"AUTO","timing":["ON_TURN_END"],"condition":{"type":"THIS_CARD_IS_ARMORED"},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // WDK08-L13 紅蓮の使い魔 アマテラス：E1【常】あなたの血晶武装状態のシグニは【ダブルクラッシュ】を得る。
  //   旧JSONは owner:any count:1（任意1体に常時付与）の誤り → 自分の血晶武装シグニ全体へ付与（BattleScreen contGrantedKeywords が isArmored を honor）。
  "WDK08-L13": [{"effectId":"WDK08-L13-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","isArmored":true}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXK04-042 紅蓮の使い魔 オトタチバナ：
  //   E1【常】このシグニが血晶武装状態であるかぎり、+2000され、「【自】アタック時、自パワー以下の相手シグニ1体をバニッシュ」を得る。
  //     旧JSONは E1 が「CONTINUOUS BANISH（常時バニッシュ）」に誤訳され +2000 も欠落。→ E1=POWER+2000(武装中)／E1b=武装中のアタック時バニッシュへ分割。
  //   E2【自】アタック時、パワー10000以上の場合、相手のパワー7000以下を1体バニッシュ（旧JSONは「10000以上」条件が欠落）。
  "WXK04-042": [
    {"effectId":"WXK04-042-E1","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_ARMORED"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK04-042-E1b","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_ARMORED"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // WXK08-005 ぶりっつあーや！（キー・タスク2「動的比較」の最後の1枚）：
  //   原文「アタックフェイズの間、あなたのセンタールリグのレベルが対戦相手のセンタールリグより低いかぎり、このキーは
  //   《アタックフェイズアイコン》を得る。【常】：あなたのセンタールリグは以下の能力を得る。【起】《スペルカットイン》
  //   エクシード１：スペル1つの効果を打ち消す。【起】《アタックフェイズアイコン》エクシード２：対戦相手のシグニ1体を
  //   ダウンし凍結する。【出】：対戦相手のシグニ1体をデッキの一番上に置く。」
  //   ① 先頭文（動的レベル比較で《アタックフェイズアイコン》を得る）が parser のブロック分割で丸ごと脱落し、
  //      E4（エクシード２のダウン＋凍結）が無条件で撃てる過剰効果になっていた。→ E4 に condition:LRIG_LEVEL_CMP_OPP{lt}
  //      （自センタールリグレベル＜相手・engine/decompiler 実装済＝WXK07-025/WXK10-068 と同型）を付与してゲート化。
  //      getKeyPieceActions が eff.condition を evalUseCondition で評価済みのため engine 追加は不要。
  //   ② 🆕タスク12(l)：E2「以下の能力を得る」の 2本の【起】は**センタールリグへの付与能力**なので
  //      `GRANT_LRIG_ABILITY.abilities` へ入れ子にする（旧 `-E3`/`-E4` → `-E2-G`/`-E2-G2`）。
  //      旧コメントは「abilities に詰めると二重発火・granted 経路は condition 未評価」を理由に top-level 維持を
  //      正としていたが、**両方とも解消済み**＝(a) 入れ子化した能力はキー配下の effects から取り除かれるので
  //      二重発火しない (b) granted【起】経路（MAIN/ATTACK_ARTS の両分岐）に `evalUseCondition` と
  //      timing↔phase 照合を追加した。**入れ子化しないとエクシードコストが支払われない**（キー経路の
  //      executeKeyActivated は cost.exceed を無視する）＝踏み倒しになるため、入れ子が正しい。
  //      SPELL_CUTIN 側は付与ルリグ用のカットイン収集（BattleScreen「2b.」）から拾う。
  "WXK08-005": [
    {"effectId":"WXK08-005-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[
      {"effectId":"WXK08-005-E2-G","effectType":"ACTIVATED","timing":["SPELL_CUTIN"],"cost":{"exceed":1},"action":{"type":"COUNTER_SPELL"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
      {"effectId":"WXK08-005-E2-G2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"condition":{"type":"LRIG_LEVEL_CMP_OPP","operator":"lt"},"action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"down":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
    ],"rawText":"【起】《スペルカットインアイコン》エクシード１：スペル１つを対象とし、それの効果を打ち消す。【起】《アタックフェイズアイコン》エクシード２：対戦相手のシグニ１体を対象とし、それをダウンし凍結する。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // WXK04-044 紅蓮の使い魔 オズマ姫：E1【常】このシグニは血晶武装状態であるかぎり、「【自】正面のシグニ1体をバニッシュしたとき、このシグニをアップする」を得る。
  //   旧JSONは「CONTINUOUS UP（常時アップ）」に誤訳。→ AUTO ON_SIGNI_BANISH_BATTLE（バトルで正面をバニッシュ）＋ condition:THIS_CARD_IS_ARMORED で自身アップ。E2（手札1捨て→デッキトップ5見て紅蓮1枚手札）はJSON維持。
  "WXK04-044": [{"effectId":"WXK04-044-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_ARMORED"},"action":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // WDK08-L14 紅蓮の使い魔 清姫：E1【自】アタック時、以下の3つから1つを選ぶ。血晶武装中は代わりに3つまで選ぶ（同一選択肢可）。
  //   旧JSONは CHOOSE from3/choose1 固定で「武装中3つまで・重複可」が欠落 → 専用STUB INTERNAL_KIYOHIME_CHOOSE（武装で1→3回ループ）。BURSTはJSON維持。
  "WDK08-L14": [{"effectId":"WDK08-L14-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"STUB","id":"INTERNAL_KIYOHIME_CHOOSE"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXK04-072 紅蓮の使い魔 ママリリ：E1【常】このシグニが血晶武装状態であるかぎり、+3000され、正面以外の相手シグニゾーンにもアタックできる。
  //   旧JSONは +3000（E1）のみで多面アタックが欠落していた → E1bに MULTI_ZONE_ATTACK（武装中）を追加。E1(+3000)/E2はJSON維持。
  "WXK04-072": [
    {"effectId":"WXK04-072-E1","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_ARMORED"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK04-072-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true,"powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WXK04-072-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_ARMORED"},"action":{"type":"STUB","id":"MULTI_ZONE_ATTACK"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.3 attack geometry: quoted temporary abilities are represented as runtime
  // keywords because GRANT_KEYWORD already has target selection and turn cleanup.
  "WX15-093": [
    {"effectId":"WX15-093-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"英知"},"upToCount":false},"keyword":"正面以外追加アタック","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // 「正面の1つ隣にも」なので、正面との択一である既存「側面アタック」とは別。
  "WX15-094": [
    {"effectId":"WX15-094-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"英知"},"minCount":3},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"正面隣追加アタック","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX15-095": [
    {"effectId":"WX15-095-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"英知"},"minCount":3},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"正面隣追加アタック","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX15-096": [
    {"effectId":"WX15-096-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"英知"},"minCount":3},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"正面隣追加アタック","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXEX2-71": [
    {"effectId":"WXEX2-71-E2","effectType":"AUTO","timing":["ON_PLAY"],"activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":2},"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":{"max":3},"story":"英知"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WXEX2-71-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":5},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"英知","excludeSelf":true},"upToCount":false},"keyword":"正面以外追加アタック","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
    // WXEX2-71 ／ 原文【自】《ターン１回》：あなたのシグニ１体が**正面以外のシグニゾーンにアタックしたとき**、
    //   ターン終了時まで、そのシグニは【ランサー】を得る。
    // 🔴旧 live＝位置限定も主語も無く**どのアタックでも味方1体に【ランサー】**（毎ターン無条件の強化）。
    // 🔑`triggerCondition.attackedNotFront`＝攻撃先ゾーンが「2 − 自分のゾーン」でない＝【側面アタック】。
    //   ⚠`sideAttack` が渡らない収集経路では**発火しない**（fail-closed）。
    //   付与先は `targetsTriggerSource`（アタックした当のシグニ）。
    {"effectId":"WXEX2-71-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"any_ally","triggerCondition":{"attackedNotFront":true},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"targetsTriggerSource":true,"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  // WXK04-030 血晶の紅雨（スペル）：紅蓮シグニ1体を血晶武装［デッキ］→シャッフル。ターン終了時まで、自分の全血晶武装シグニ+5000かつ「【自】アタック時、自パワー以下の相手シグニ1体をバニッシュ」を付与。
  //   旧JSONのE1は「SHUFFLE_DECK＋相手シグニ全バニッシュ」という完全誤訳だった。→ SEQUENCE（武装→武装シグニ全体+5000→アタック時バニッシュ能力付与）に再構成。BURSTはJSON維持（正しい）。
  "WXK04-030": [{"effectId":"WXK04-030-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":3}]},"action":{"type":"SEQUENCE","steps":[
    {"type":"BLOOD_CRYSTAL_ARMOR","source":["deck"],"count":1,"targetFilter":{"cardType":"シグニ","story":"紅蓮"}},
    {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","isArmored":true}},"delta":5000},
    {"type":"STUB","id":"INTERNAL_GRANT_ATTACK_BANISH_TO_ARMORED"}
  ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],


  // ===== 【デコレ】：手札の＜調理＞シグニ1枚を場の＜調理＞シグニの【アクセ】にする起動能力（青×0・ターン1回） =====
  //   パーサーは【デコレ】を非効果キーワード接頭辞として除去するため（effectParser stripKeywordPrefixes）、
  //   デコレ起動能力はどのカードにも登録されていなかった（execAttachAcce の fromHand パスが到達不能の死にコードだった）。
  //   → ＜調理＞のエルドラ全9枚に ATTACH_ACCE(fromHand) の ACTIVATED 能力を付与。既存効果には -DECORE の新IDで追記（マージは追記方式）。
  //   signiFilter=手札のアクセカード側／targetFilter=場のホストシグニ側、どちらも＜調理＞シグニ限定。
  "WXK04-003": [{"effectId":"WXK04-003-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WXK04-016": [{"effectId":"WXK04-016-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WXK04-017": [{"effectId":"WXK04-017-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WXK04-018": [{"effectId":"WXK04-018-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WXK05-014": [{"effectId":"WXK05-014-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WDK07-E01": [{"effectId":"WDK07-E01-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WDK07-E02": [{"effectId":"WDK07-E02-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WDK07-E03": [{"effectId":"WDK07-E03-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WDK07-E04": [{"effectId":"WDK07-E04-DECORE","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"ATTACH_ACCE","fromHand":true,"sourceOwner":"self","targetSigniOwner":"self","signiFilter":{"cardType":"シグニ","story":"調理"},"targetFilter":{"cardType":"シグニ","story":"調理"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],


  // ===== F: フラット化 CONTINUOUS BANISH 修正の durable 化（v0.414 JSON 修正を manualEffects へ昇格・再生成耐性）=====
  "WX10-063": [{"effectId":"WX10-063-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"THIS_CARD_IN_CENTER_ZONE"},{"type":"LRIG_COLOR","owner":"self","color":"赤"}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":1000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // 🆕§6.4 O-25(d)（2026-08-17）＝原文の**チャーム分岐**を補った。原文は「…パワー7000のシグニ1体を
  //    バニッシュする。**このシグニに【チャーム】が付いている場合、代わりに**対戦相手のパワー12000以上の
  //    シグニ1体を対象とし、それをバニッシュする」で、この MANUAL は**7000ちょうどの枝しか持っていなかった**
  //    ＝チャームが付いていても弱い方しか撃てない過少実行（【常】のゾーン限定は既に手当て済みだった）。
  // ⚠「代わりに」＝**排他**なので `then`/`else` で書く（SEQUENCE にすると両方バニッシュする過剰になる）。
  "WXK07-044": [{"effectId":"WXK07-044-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IN_CENTER_ZONE"},"action":{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_IS_CHARMED"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":12000}},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":7000,"max":7000}},"upToCount":false}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "PR-288": [{"effectId":"PR-288-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"THIS_CARD_IN_CENTER_ZONE"},{"type":"LRIG_LEVEL_EQ_OPP"}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":2000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "PR-426": [{"effectId":"PR-426-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"LIFE_COUNT","owner":"self","operator":"lte","value":1},{"type":"THIS_CARD_IN_CENTER_ZONE"}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}, {"effectId":"PR-426-E3","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"COUNT_THRESHOLD","location":"life_cloth","owner":"self","operator":"lte","value":1},{"type":"IS_SELF_IN_CENTER_ZONE"}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":4000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX17-038": [{"effectId":"WX17-038-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IN_CENTER_ZONE"},"action":{"type":"REVEAL_UNTIL_BANISH_SAME_LEVEL","revealClass":"宇宙","banishOwner":"opponent"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // ⚠**E4 は E1 と対で1枚の原文を表す**（2026-08-28・Sheet1 残8枚バッチで `manualEffects.ts` へ移設）。
  //   原文＝「【常】：このシグニはパワーが20000以上であるかぎり、**【ダブルクラッシュ】と**
  //   「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、それをバニッシュする。」を得る。」
  //   ＝**キーワード付与（E4）と引用能力（E1）の2本**。E1 だけを manual に置き、E4 を live へ直接
  //   手パッチしていたため、**fresh と live で id 集合がズレてカード丸ごと凍結**していた（§6.4 `O-39`）。
  //   ⇒ E4 もここへ置いて id 集合を揃える（`mergeManualEffects` は manual 側だけの id を追加する）。
  "WX05-021": [
    {"effectId":"WX05-021-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":20000},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX05-021-E4","effectType":"CONTINUOUS","activeCondition":{"type":"SELF_POWER_THRESHOLD","operator":"gte","value":20000},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P07-060": [{"effectId":"WXDi-P07-060-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_AWAKENED"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}, {"effectId":"WXDi-P07-060-E3","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_AWAKENED"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WDK08-L11": [{"effectId":"WDK08-L11-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_ARMORED"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WDK16-06H": [{"effectId":"WDK16-06H-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"LRIG_NAME_CONTAINS","owner":"self","name":"楓"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // 🆕§5.3 `O-60` 第16バッチ（2026-09-02）で**欠落を1件見つけた**＝原文は
  //   「【常】：このシグニの下にカードがあるかぎり、このシグニのパワーは**＋5000され**、
  //     このシグニは「【自】：…」を得る。」
  // 🔴手書きの E1 は**引用【自】を平らにした形だけ**を持ち、**パワー＋5000 が丸ごと落ちていた**（過小実行）。
  //   parser は正しい CONTINUOUS SEQUENCE（`POWER_MODIFY`＋`GRANT_FIELD_SIGNI_ABILITY`）を出していたが、
  //   手書きが `mergeManualEffects` で常に勝つので届かなかった（§5.3 `O-93`／`O-194` と同じ型）。
  // 🔑**手書きを消さずに `-E1b` へ切り出す**＝手書き側は `abortIfNoCandidate` と
  //   `PAID_ADDITIONAL_COST` ゲート（executor の look-ahead＝Pattern④）を持つぶん parser より忠実。
  //   条件は原文どおり両方に掛かる `THIS_CARD_HAS_UNDER`。
  "WXDi-P05-034": [{"effectId":"WXDi-P05-034-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"THIS_CARD_HAS_UNDER"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P05-034-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_HAS_UNDER"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK03-034": [{"effectId":"WXK03-034-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"TURN_HAND_DISCARD_GTE","value":2},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK03-056": [{"effectId":"WXK03-056-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"TURN_HAND_DISCARD_GTE","value":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX20-Re18 幻獣 アカズキン（タスク12(cxvii)）：原文は「このシグニは**レベルが４以上**であるかぎり、
  //   「【自】：このシグニがアタックしたとき、このシグニの正面のシグニをバニッシュする。」を得」。
  //   ⚠旧 condition は `SELF_POWER_GTE 12000`＝**レベル条件をパワーで近似した手当て**だった
  //   （実効パワー＝表記1000＋3000×実効レベル なので Lv4=13000／Lv3=10000 とたまたま境界が合う）。
  //   **別の効果でパワーだけバフされるとレベル3でも発火する**過剰実行なので、実効レベルを見る
  //   `SELF_LEVEL_THRESHOLD` へ是正した（レベル5側の効果耐性 E4 は parser 側の後処理で新設）。
  "WX20-Re18": [{"effectId":"WX20-Re18-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"SELF_LEVEL_THRESHOLD","operator":"gte","value":4},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX21-052": [{"effectId":"WX21-052-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","cardClass":"天使"},"abilities":[{"effectId":"WX21-052-E1-G","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ","powerRange":{"max":5000}}},"selfTrashCost":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // O-50: E1 は parser の AUTO に戻した。隣接する既存 E3P/E3 の durable 定義は live と同値に揃えて維持する。
  "WX20-072": [{"effectId":"WX20-072-E3P","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"acceHost":true,"cardName":"コードオーダーウェディング"}},"delta":1000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},{"effectId":"WX20-072-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardName":"コードオーダーウェディング"},"abilities":[{"effectId":"WX20-072-E3-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // O-50: 後段の赤＋緑条件を保持したまま、RAP 直後の全デッキ shuffle を remainder.shuffle へ移す。
  "WX25-P3-047": [{"effectId":"WX25-P3-047-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":7,"filter":{"cardType":"シグニ","cardClass":"龍獣"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","shuffle":true}},{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"赤"},"minCount":1},{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"緑"},"minCount":1}]},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  // タスク12(viii)（続き137）: 原文「このシグニのレベルを＋１するか＋２してもよい」＝値の CHOOSE（＋1/＋2）＋任意（してもよい）。parser は LEVEL_MODIFY +1 固定に潰していた（＋2 と「してもよい」を欠落・「このシグニ」も未限定）。choose_count:1/from_count:2/upTo:true（upTo で0選択＝スキップ可）で表現。LEVEL_MODIFY は thisCardOnly（続き137で engine 対応）。
  "WX16-070": [{"effectId":"WX16-070-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"upTo":true,"choices":[{"choiceId":"plus1","label":"レベルを＋1する","action":{"type":"LEVEL_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":1,"until":"UNTIL_END_OF_TURN"}},{"choiceId":"plus2","label":"レベルを＋2する","action":{"type":"LEVEL_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2,"until":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}],
  "SP27-015": [{"effectId":"SP27-015-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","abilities":[{"effectId":"SP27-015-E3-G","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"acceTrash":2},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"SP27-015-E1","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"FIELD_SIGNI_TO_ACCE","sourceOwner":"self","targetSigniOwner":"self","sourceThisCard":true,"targetFilter":{"cardType":"シグニ","excludeSelf":true},"reattachPreviousAcceOptional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX18-076": [{"effectId":"WX18-076-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WX18-076-E2-G","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","condition":{"type":"IS_OPPONENT_TURN"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXEX2-25 救解の冥者 ハナレ（ルリグ）E3【起】《アタックフェイズ》《コイン》：対戦相手のセンタールリグ1体を対象とし、
  //   ターン終了時まで、それは「【常】：このルリグより低いレベルを持つあなたのシグニのパワーを－8000する。」を得る。
  //   旧パース＝引用付与構造が丸ごと落ち POWER_MODIFY owner:self ALL -8000（＝自分の全シグニに-8000）の有害な誤パース。
  //   正＝GRANT_EFFECT で相手センタールリグに CONT POWER_MODIFY を付与。付与先LRIG視点で owner:self＝相手自身のシグニ、
  //   levelLtSelf＝付与先LRIG（このルリグ）のレベル未満（calcFieldPowers の resolveContSelfLevel が host=LRIG基準で解決）。
  //   相手は自分のターン中グロウ不可＝付与期間中LRIGレベル不変で静的解決と等価。§3タスク3 lrig相対（動的比較）。
  "WXEX2-25": [{"effectId":"WXEX2-25-E3","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"opponent","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXEX2-25-E3-GRANT","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","levelLtSelf":true}},"delta":-8000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}],
  // デッキ相対SEARCH（動的比較 §3タスク3）＝SEARCHのレベル制約が「この方法で捨てたシグニ（handDiscardSigniコスト）」基準で欠落していた3枚。
  //   engine: resolveDiscardLevelFilter が levelLtDiscardSigni（<捨てレベル）/levelEqDiscardSigniOffset（=捨てレベル+N）/
  //   classMatchesDiscardSigni（捨てクラスと共通）を caster.last_discarded_signi_level/_class で解決（SEARCH/ADD_TO_FIELD両経路）。
  // WDK13-013 羅星 ハッブラ E1【出】手札から＜宇宙＞捨てる：捨てたシグニよりレベルが1つ高いシグニを探して手札に加える。
  "WDK13-013": [{"effectId":"WDK13-013-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"handDiscardSigni":{"count":1,"story":"宇宙"}},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","levelEqDiscardSigniOffset":1},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  // WXK10-033 罠英の錬金 カリオストロ E2【出】手札からシグニ捨てる：捨てたシグニよりレベルが2つ高い、それと共通するクラスを持つシグニを探して手札に加える。
  "WXK10-033": [{"effectId":"WXK10-033-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"handDiscardSigni":{"count":1}},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","levelEqDiscardSigniOffset":2,"classMatchesDiscardSigni":true},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  // WXEX2-37 羅星姫 ビッグ・ヴァン E3【起】手札から＜宇宙＞捨てる：捨てたシグニより低いレベルの＜宇宙＞シグニを2枚まで探して手札に加える。
  "WXEX2-37": [{"effectId":"WXEX2-37-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"handDiscardSigni":{"count":1,"story":"宇宙"}},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"宇宙","levelLtDiscardSigni":true},"maxCount":2,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WXDi-D07-003": [{"effectId":"WXDi-D07-003-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_SOUL_HOST_ABILITY","abilities":[{"effectId":"WXDi-D07-003-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXDi-D07-002 エクス・ワン E1【常】：ソウル先へ《ターン1回》のアタック時ドロー1／エナチャージ1選択能力を付与。
  "WXDi-D07-002": [{"effectId":"WXDi-D07-002-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_SOUL_HOST_ABILITY","abilities":[{"effectId":"WXDi-D07-002-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","usageLimit":"once_per_turn","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"カードを１枚引く","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"エナチャージ１","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-P04-015": [{"effectId":"WXDi-P04-015-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_SOUL_HOST_ABILITY","abilities":[{"effectId":"WXDi-P04-015-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":2}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXDi-P05-060 世紀末の爆走 E1/E2：設置処理と、下カードから赤シグニへ付与する【常】宣言を分離。
  "WXDi-P05-060": [
    {"effectId":"WXDi-P05-060-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"PLACE_SIGNI_UNDER_SIGNI"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"aboveSelf":true,"cardName":"コードアクセル　ヒャッハー"}},"delta":2000}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P05-060-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_SIGNI_ABOVE_ABILITY","filter":{"color":"赤"},"abilities":[{"effectId":"WXDi-P05-060-E2-G","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
],
  // WXDi-P10-002 アフタヌーンティーショー E1：このゲーム中、アタックフェイズ開始時の二者択一能力をプレイヤーへ付与。
  "WXDi-P10-002": [{"effectId":"WXDi-P10-002-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"condition":{"type":"FIELD_LRIG_COLOR_COUNT","owner":"self","operator":"gte","value":3,"minLrigs":3},"action":{"type":"GRANT_PLAYER_ABILITY","abilities":[{"effectId":"WXDi-P10-002-E1-GRANT","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"エナゾーンからセンタールリグと共通色のシグニ１枚を手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","colorMatchesLrig":true}}}},{"choiceId":"c1","label":"エナチャージ１","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],"permanent":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  "WXDi-P15-061": [{"effectId":"WXDi-P15-061-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_SIGNI_ABOVE_ABILITY","filter":{"cardClass":"解放派"},"abilities":[{"effectId":"WXDi-P15-061-E2-G","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WD14-001": [{"effectId":"WD14-001-E3","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GRANT_ALL_ZONE_LIFEBURST"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXEX1-11 エルドラ×マークIV HYPER E1【常】：全領域の＜水獣＞カードへ、ドロー1／相手シグニ1体ダウンの選択LBを追加付与。
  "WXEX1-11": [{"effectId":"WXEX1-11-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GRANT_ALL_ZONE_LIFEBURST","burstFilter":{"cardClass":"水獣"},"burstAction":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"カードを１枚引く","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"対戦相手のシグニ１体をダウンする","action":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]},"burstAdditive":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WXDi-P08-008 エルドラ×マークν E1【常】：ライフクロス／チェックゾーンの非LBカードへ、ドロー1／エナチャージ1の選択LBを付与。
  "WXDi-P08-008": [{"effectId":"WXDi-P08-008-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GRANT_ALL_ZONE_LIFEBURST","burstAction":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"カードを１枚引く","action":{"type":"DRAW","owner":"self","count":1}},{"choiceId":"c1","label":"エナチャージ１","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX02-002 火鳥風月 遊月・肆（ルリグ）E1【常】：あなたのすべての領域にあるカードは【ライフバースト】【エナチャージ１】を持つ。
  //   旧パース＝「シグニ1体に付与」誤り。全領域へエナチャージ1のバーストを付与（burstAdditive＝ネイティブ持ちにも追加し両方使用可）。
  "WX02-002": [{"effectId":"WX02-002-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GRANT_ALL_ZONE_LIFEBURST","burstAdditive":true,"burstAction":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX25-P3-057": [{"effectId":"WX25-P3-057-E1","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_AWAKENED"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX09-019": [{"effectId":"WX09-019-E2","effectType":"AUTO","timing":["ON_LIFE_CRASHED"],"triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":18000},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX09-027": [{"effectId":"WX09-027-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"BANISH_THRESHOLD_BOOST_7_15"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],

  // ===== WX04-035 不可解な誇超 コンテンポラ（美巧シグニ。複雑効果のため再生成耐性のmanual化）=====
  // E1【常】：あなたの＜美巧＞のシグニは対戦相手の、ルリグとシグニの効果を受けない（GRANT_PROTECTION from=ルリグ/シグニ。
  //   collectEffectImmuneSigni がソース種別を見てバニッシュ/バウンス/ダウン/トラッシュ/能力/フリーズ/パワー-へ反映）。
  // E2【自】：このカードが対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき、《緑》を支払ってもよい。
  //   そうした場合、このシグニを手札に加える（OPTIONAL_COST+PAID_ADDITIONAL_COST → TRANSFER_TO_HAND thisCardOnly）。
  // BURST：デッキトップ1枚をエナへ。その後エナに＜美巧＞シグニが5枚以上ならデッキトップ1枚をライフへ。
  // WX04-058-E2 コードメイズ タジマハ（シグニ 精械：迷宮）【出】あなたのすべてのシグニを好きなように配置し直してもよい（再配置UI・owner:self）。
  "WX04-058": [
    {"effectId":"WX04-058-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"self","count":"ALL"},"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-061-E2 コードメイズ タワブ（シグニ 精械：迷宮）【出】あなたのシグニ1体を対象とし、それとこのシグニの場所を入れ替えてもよい（swap・optional）。
  // 注: swap 機構は effectExecutor 未対応（ログのみ）。今回は optional 表記の欠落のみ正す。
  "WX04-061": [
    {"effectId":"WX04-061-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"self","count":1},"swap":true,"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-062-E1 小壊 棍（シグニ 精武：アーム）【出】あなたの＜アーム＞のシグニ1体を対象とし、それをアップする。
  "WX04-062": [
    {"effectId":"WX04-062-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"アーム"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-063-E1 ゲット・ゲート（スペル）使用コスト《白×1》《無×2》で支払われたエナ1つにつきその色を1つ選択し、
  //   選択した色の種類1つにつきその色のシグニ1枚をデッキから探して公開・手札に加え、シャッフルする。無色は色に含まれない。
  //   COST_COLOR_SELECT スタブが ctx.paidEnergyColorSets（castSpell で記録した実支払いエナの色）を基に処理する。
  //   ※ AUTO 解析は末尾に無条件 SEARCH 1枚を付けてしまうため STUB 単体に固定。
  "WX04-063": [
    {"effectId":"WX04-063-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1},{"color":"無","count":2}]},"action":{"type":"STUB","id":"COST_COLOR_SELECT"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-064 ノー・ゲイン（スペル）
  //  E1: このターンと対戦相手の次のターンの間、あなたのセンタールリグとあなたのシグニはアーツの効果を受けない（GRANT_PROTECTION from:アーツ, UNTIL_OPP_TURN_END）。
  //      collectEffectImmuneSigni が keyword_grants(_until_opp_turn) の PROTECTION:アーツ:opponent を読み、アーツ解決時に免疫へ反映。
  //  BURST: 次のターンの間、対戦相手はアーツを使用できない（BLOCK_ACTION USE_ARTS / NEXT_TURN）。actionId は 'ARTS' でなく 'USE_ARTS'（使用ゲートと一致）。
  "WX04-064": [
    {"effectId":"WX04-064-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":"ALL"},"from":["アーツ"],"sourceOwner":"opponent","duration":"UNTIL_OPP_TURN_END"},{"type":"GRANT_PROTECTION","target":{"type":"LRIG","owner":"self","count":1},"from":["アーツ"],"sourceOwner":"opponent","duration":"UNTIL_OPP_TURN_END"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX04-064-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"USE_ARTS","until":"NEXT_TURN"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-068-E1 幻竜 ワイバーン（シグニ 精生：龍獣）【出】手札を1枚捨てる：対戦相手のエナゾーンから【マルチエナ】を持つカード1枚を対象とし、それをトラッシュに置く。
  //   target.filter.keyword='マルチエナ'（energyCandidates→matchesFilter の印字ベース判定で絞る）。
  "WX04-068": [
    {"effectId":"WX04-068-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":1},"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"keyword":"マルチエナ"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-071-E1 羅石 トパズ（シグニ 精羅：宝石）【起】《赤》このシグニを場からトラッシュに置く：あなたのデッキからコストの合計が1以下の赤のスペル1枚を探して公開し手札に加え、シャッフルする。
  //   filter.costMax=1（matchesFilter が card.Cost の《色×N》合計＝コイン除外で判定）。

  // WX04-072-E1 幻竜 エキドナ（シグニ 精生：龍獣）【起】このシグニを場からトラッシュに置く：対戦相手のエナゾーンから【マルチエナ】を持つカード1枚を対象とし、それをトラッシュに置く。
  //   target.filter.keyword='マルチエナ'（WX04-068 と同型）。BURST: カードを1枚引く。
  "WX04-072": [
    {"effectId":"WX04-072-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"trash_self":true},"action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"keyword":"マルチエナ"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-073-E1 炎壊の舞盃（スペル）対戦相手のパワー8000以下のシグニ1体を対象とし、あなたのライフクロス1枚をクラッシュする。そうした場合、それをバニッシュする。
  //   旧AUTO: LIFE_CRASH owner=opponent（誤。原文は「あなたの」）＋BANISH に powerRange 欠落だった。
  //   修正: LIFE_CRASH owner=self（自分のライフ。triggerBurst=自分のバースト誘発）、BANISH に powerRange.max:8000。
  //   「そうした場合」はコードベース慣例どおり CONDITIONAL{IS_MY_TURN}（スペルは自ターン使用で実質常時真）。
  "WX04-073": [
    {"effectId":"WX04-073-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-074-E1 懐疑する慟哭（スペル）対戦相手の、パワー5000以下のシグニ1体とパワー10000以上のシグニ1体を対象とし、それらをバニッシュする。
  //   旧AUTO: 1体の target に powerRange{min:10000,max:5000}（成立不能）で潰れていた。2体別々の BANISH に分割。
  "WX04-074": [
    {"effectId":"WX04-074-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":2},{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":10000}},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-078-E1 コードアート R・P・G（シグニ 精械：電機）【常】対戦相手の場に凍結状態のシグニがあるかぎり、このシグニの基本パワーは10000になる。
  //   activeCondition HAS_CARD_IN_FIELD(owner:opponent, filter:isFrozen) 欠落で常時10000になっていた。
  //   ※ checkActiveCondition/evalUseCondition の HAS_CARD_IN_FIELD を matchesStateFilter 併用に拡張（isFrozen等の状態フィルタ対応）。

  // WX04-079-E1 羅原 F（シグニ 精羅：原子）【常】あなたの場に＜原子＞のシグニが3体あるかぎり、あなたのシグニのパワーを+2000する。
  //   activeCondition の minCount:3 欠落で「1体以上」になっていた。

  // WX04-089-E1 未解決の逸脱 シュレリス（シグニ 精像：美巧）【常】あなたの場に＜美巧＞のシグニが3体あるかぎり、あなたのシグニのパワーを+2000する。
  //   activeCondition の minCount:3 欠落で「1体以上」になっていた（WX04-079 と同型）。

  // WX04-093 惰眠（スペル -）デッキの上からシグニがめくれるまで公開→そのシグニを場に出し、残りをトラッシュ。これを3回繰り返す。
  //   旧: SEQUENCE(STUB DECK_REVEAL_UNTIL / REVEALED_SIGNI_TO_FIELD_REST_TRASH / REPEAT_EFFECT) で未実装。
  //   新アクション REVEAL_UNTIL_TO_FIELD（repeat:3）で本実装。場に出せないシグニ（空きゾーンなし）はトラッシュへ。
  //   ⚠BURST は**ここから外した**（続き377k）＝原文「デッキの上からカードを３枚見る。その中からカード１枚を
  //     手札に加え、残りをトラッシュに置く」に対し、旧 MANUAL は `LOOK_AND_REORDER{canTrash, dest:deck top}`＝
  //     **手札に加える動作が丸ごと無く、残りもデッキに戻る**古い近似だった。parser は既に正しい
  //     `REVEAL_AND_PICK{revealCount:3, pickCount:1, then:ADD_TO_HAND, remainder:trash}` を作れるので、
  //     MANUAL で上書きすると **live より古いソースで退化させる**（PLAN §5d-0 の「MANUAL が live より古い」型）。
  "WX04-093": [
    {"effectId":"WX04-093-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1},{"color":"白","count":1}]},"action":{"type":"REVEAL_UNTIL_TO_FIELD","owner":"self","repeat":3},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-094 怒号（スペル -）あなたの＜空獣＞か＜地獣＞のシグニ1体を対象とし、ターン終了時までパワー+2000。
  //   さらに、あなたの場に＜空獣＞と＜地獣＞のシグニが合計3体ある場合、ターン終了時までそれは【ランサー】と
  //   「【自】：対戦相手のライフクロスをクラッシュしたとき、デッキの一番上をエナゾーンに置く」(ON_OPP_LIFE_CRASHED) を得る。
  //   旧: 対象 owner:any・無条件で ENERGY_CHARGE_FROM_DECK（誤）。対象クラス絞り・条件付き付与・「それ」(targetsLastProcessed) で本実装。
  "WX04-094": [
    {"effectId":"WX04-094-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":["空獣","地獣"]}},"delta":2000},{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","cardClass":["空獣","地獣"]},"minCount":3},"then":{"type":"SEQUENCE","steps":[{"type":"GRANT_KEYWORD","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_EFFECT","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX04-094-E1-GRANT","effectType":"AUTO","timing":["ON_OPP_LIFE_CRASHED"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-096 堕落の破戒 オリエンス（シグニ 精像：悪魔）
  //  E1【常】このシグニに【チャーム】が付いているかぎり、基本パワーは12000になる（activeCondition IS_SELF_CHARMED 欠落で常時12000だった）。
  //  E2【起】《ダウン》：あなたの＜悪魔＞のシグニ1体を対象とし、デッキの一番上をそれの【チャーム】にしてもよい（旧: 対象クラス絞り＜悪魔＞欠落）。
  "WX04-096": [
    {"effectId":"WX04-096-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"ATTACH_CHARM","charm":{"type":"DECK_CARD","owner":"self","count":1},"to":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"悪魔"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX04-098 堕落の吐露 マイモン（シグニ 精像：悪魔）
  //  E1【常】このシグニに【チャーム】が付いているかぎり、基本パワーは10000になる（activeCondition IS_SELF_CHARMED 欠落で常時10000だった。WX04-096-E1 と同型）。

  // WX04-099 ツヴァイ＝サリナ（シグニ 精武：毒牙）
  //  E1【自】対戦相手のターンの間、このシグニが対戦相手のレベル2以下のシグニとバトルしたとき、そのシグニをバニッシュする（自身がバトルでバニッシュされても発動）。
  //   旧: timing ON_PLAY＋対象が任意の相手レベル2以下シグニ（誤）。timing ON_SIGNI_BATTLE＋IS_OPPONENT_TURN＋isTriggerSource（バトル相手=triggeringCardNum）で本実装。
  "WX04-099": [
    {"effectId":"WX04-099-E1","effectType":"AUTO","timing":["ON_SIGNI_BATTLE"],"triggerScope":"self","condition":{"type":"IS_OPPONENT_TURN"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","isTriggerSource":true,"levelRange":{"max":2}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-102 堕落の消滅 アリトン（シグニ 精像：悪魔）
  //  E1【自】このカードが手札かデッキからトラッシュに置かれたとき、あなたのシグニ1体を対象とし、このカードをそれの【チャーム】にしてもよい。
  //   旧: 発生源限定なし（場からも発火・手札からは不発）＋チャーム源が場のシグニ（誤）。
  //   新: triggerCondition.fromZones:['hand','deck']＋charm TRASH_CARD thisCardOnly（このカード自身をチャーム化）＋optional。
  "WX04-102": [
    {"effectId":"WX04-102-E1","effectType":"AUTO","timing":["ON_TRASH"],"triggerScope":"self","triggerCondition":{"fromZones":["hand","deck"]},"action":{"type":"ATTACH_CHARM","charm":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}},"to":{"type":"SIGNI","owner":"self","count":1},"optional":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-103 エビルズ・ソウル（スペル -）
  //  対戦相手のシグニ1体のパワーを、あなたの場の＜悪魔＞シグニのレベル合計×-1000（ターン終了時まで）。
  //  その後、あなたの＜悪魔＞シグニ1体を対象とし、このスペルをそれの【チャーム】にしてもよい。
  //  旧: Step1=STUB（未実装）、Step2 のチャーム源が場のシグニ・対象が＜悪魔＞絞りなし（誤）。
  //  新: POWER_MODIFY_PER_LEVEL_SUM（executor対応を追加）＋ATTACH_CHARM(charm=このスペル＝TRASH_CARD thisCardOnly, to=＜悪魔＞, optional)。
  "WX04-103": [
    {"effectId":"WX04-103-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY_PER_LEVEL_SUM","target":{"type":"SIGNI","owner":"opponent","count":1},"deltaPerLevel":-1000,"countFilter":{"cardType":"シグニ","cardClass":"悪魔"},"countOwner":"self"},{"type":"ATTACH_CHARM","charm":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}},"to":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"悪魔"}},"optional":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX05-001 創世の巫女 マユ（ルリグ タマ/イオナ Lv5）
  //  【グロウ】（＜タマ＞か＜イオナ＞を公開してセンタールリグの下に置く）はグロウ条件で、BattleScreen の checkGrowCondition/applyGrowEffect が EffectText から処理するため effects には入れない。
  //  旧E1は【グロウ】文を ON_PLAY「シグニをデッキに置く」と誤パース。本来の【出】に置換。
  //  E1【出】ルリグトラッシュの全ルリグをこのカードの下に置き、白と黒の全アーツをルリグデッキに戻す。
  //  E2【起】エクシード1：ターン終了時まで対戦相手の全シグニは能力を失う。
  //  E3【起】エクシード5：エナをすべてトラッシュ＋手札をすべて捨て、追加の1ターンを得る。
  "WX05-001": [
    {"effectId":"WX05-001-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"PLACE_LRIGS_UNDER_CENTER","owner":"self"},{"type":"TRANSFER_TO_DECK","source":{"type":"LRIG_TRASH_CARD","owner":"self","count":"ALL","filter":{"cardType":"アーツ","color":["白","黒"]}},"shuffle":false,"destination":"lrig_deck"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX05-001-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":5},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":"ALL"}},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":"ALL"}},{"type":"STUB","id":"GAIN_EXTRA_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX05-002 花代・伍（ルリグ 花代 Lv5）
  //  【グロウ】「センタールリグがカード名に《花代》を含む」はグロウ条件（checkGrowCondition が EffectText から処理）。
  //  E1【常】このルリグはルリグトラッシュにあるルリグの【起】能力を持つ（COPY_LRIG_TRASH_ACTIVATED。BattleScreen のルリグメニューが継承【起】を提示）。
  //  E2【常】あなたのシグニは【ダブルクラッシュ】を得る。 E3【起】エクシード5：相手シグニをパワー合計30000以下になるよう好きな数バニッシュ。

  // WX05-003 コード・ピルルク ACRO（ルリグ ピルルク Lv5）
  //  【グロウ】「センタールリグがカード名に《ピルルク》を含む」はグロウ条件（checkGrowCondition）。
  //  E1【常】ルリグトラッシュのルリグの【起】能力を持つ（COPY_LRIG_TRASH_ACTIVATED）。
  //  E2【出】対戦相手は手札をすべて捨てる（旧: 1枚のみ＝誤）。 E3【起】エクシード5：手札が6枚より少ない場合、差の分だけ引く（旧: 1枚固定＝誤。untilHandCount で本実装）。
  "WX05-003": [
    {"effectId":"WX05-003-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":"ALL"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX05-004 五型緑姫（ルリグ 緑子 Lv5）
  //  【グロウ】「センタールリグがカード名に《緑姫》を含む」はグロウ条件（checkGrowCondition）。
  //  E1【常】ルリグトラッシュのルリグの【起】能力を持つ（COPY_LRIG_TRASH_ACTIVATED）。
  //  E2【出】デッキの一番上をライフクロスに加える。 E3【起】エクシード5：各プレイヤーは自分のエナの白赤青緑黒のカードをすべてトラッシュ。
  //  実装は正しく（確認）、durable 化のため MANUAL 登録。

  // WX05-005 黒点の巫女 タマヨリヒメ（ルリグ タマ Lv5）
  //  グロウ条件「トラッシュに黒のカードが10枚以上ある」はグロウ時ゲート（checkGrowCondition・511行）で処理。グロウ後はE1は常時発動。
  //  E1【常】エナゾーン以外のシグニは黒になる（CHANGE_ALL_SIGNI_COLOR_TO_BLACK・常時発動。WX04-005と同じくグロウ条件はactiveConditionにしない）。実装は effectEngine collectFieldSigniExtraColors。
  //  E2【起】《黒》エナゾーンから黒のカード1枚をトラッシュ：対戦相手のシグニ1体をトラッシュ。コストは energy 黒×1 ＋ energyTrash(黒×1)（旧: energyTrash 欠落）。
  //  E3【起】エクシード5：対戦相手のセンタールリグと全シグニをダウン。
  "WX05-005": [
    {"effectId":"WX05-005-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}],"energyTrash":{"count":1,"filter":{"color":"黒"}}},"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX05-005-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":5},"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"LRIG","owner":"opponent","count":1}},{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX05-006 虚無の閻魔 ウリス（ルリグ ウリス Lv5）
  //  グロウ条件「エナゾーンのカードの色が3種類以上」はグロウ時ゲート（checkGrowCondition・520行）で処理。グロウ後はE1は常時発動。
  //  E1【常】あなたのエナはマルチエナを持つ（常時発動。WX04-005と同じくグロウ条件はactiveConditionにしない）。BattleScreen myEnaAllMulti が検出。
  //  E2【常】あなたが使用するアーツとスペルの限定条件は無視される（IGNORE_LRIG_RESTRICTION_ARTS）。
  //    旧: BLOCK_ACTION/IGNORE_RESTRICTIONS はエンジン未認識で無効だった。meetsRestriction が STUB IGNORE_LRIG_RESTRICTION_ARTS を認識。
  //  E3【起】エクシード5：手札1枚を選ぶ→相手が色を宣言→公開し宣言色を持たない場合のみ相手の全シグニをトラッシュ。
  //    旧: SEQUENCE末尾に無条件 TRASH があり常に全シグニ消失＝誤。条件判定は OPP_DECLARE_CHOICE→INTERNAL_ODC_COLOR_CHECK が担っていた。
  // 🆕**2026-09-02（索引 B 第2巡・§5.3 `O-163`）＝`DECLARE_ICON_REVEAL_CHECK` へ移した。**
  //   旧形は「宣言→判定→ペナルティ」が **engine のカード全文 regex** に閉じていて（`census:enginetext` A群）、
  //   JSON を読んでも何が起きるか分からず、ペナルティの種類も1つに焼き込まれていた。
  //   ⇒ **宣言する軸と一致軸数ごとの帰結を JSON に出す**（下の `WX16-Re17` が3分岐の実例）。
  "WX05-006": [
    {"effectId":"WX05-006-E2","effectType":"CONTINUOUS","action":{"type":"STUB","id":"IGNORE_LRIG_RESTRICTION_ARTS"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX05-006-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":5},"action":{"type":"DECLARE_ICON_REVEAL_CHECK","declare":["icon"],"outcomes":[{"matched":0,"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":"ALL"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX05-007 ラスト・セレクト（アーツ・コスト《白×1》《黒×1》・タマ/イオナ限定）
  //  対戦相手のシグニ1体を対象とし、センタールリグの下からカード4枚をルリグトラッシュに置く。そうした場合、それをトラッシュ。
  //  旧: 即TRASH＋無関係なBANISH(CONDITIONAL IS_MY_TURN)＝誤パース。
  //  「下から4枚をルリグトラッシュ」はエクシード4相当。コストではなく効果の一部（そうした場合）なので
  //  ゲート型STUB LRIG_UNDER_TO_TRASH(value:4) で表現（下が4枚未満なら置けず以降スキップ＝シグニトラッシュしない）。effectExecutor execSequence で実装。
  "WX05-007": [
    {"effectId":"WX05-007-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"白","count":1},{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"LRIG_UNDER_TO_TRASH","value":4},{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX05-008 遊月・伍（ルリグ ユヅキ Lv5・GrowCost《赤》×3）
  //  グロウ条件「センタールリグがカード名に《遊月》を含む」は checkGrowCondition（EffectText経由）で処理。本カードは名前が遊月・伍のため常に成立。
  //  E1【出】対戦相手のエナを3枚まで対象としトラッシュ（旧: count:1＝「3枚まで」欠落の誤）。
  //  E2【起】《ターン1回》エクシード1：相手エナ1枚トラッシュ。 E3【起】エクシード2：手札の赤スペル1枚をコストなしで使用。

  // WX04-082-E1 コードアート S・M・L（シグニ 精械：電機）【自】このシグニの正面のシグニがアタックしたとき、アタックしたそのシグニを凍結する。
  //   旧AUTO: timing ON_ATTACK_SIGNI（このシグニがアタック時）＋対象 self（誤）。正しくは防御側・正面シグニが、アタッカー（正面のシグニ）を凍結。
  //   新トリガー ON_FRONT_SIGNI_ATTACK（BattleScreen のアタックハンドラが正面ゾーンの守備側シグニで発火・triggeringCardNum=アタッカー）、
  //   FREEZE 対象 owner:opponent + filter.isTriggerSource（execFreeze が triggeringCardNum に限定）。
  "WX04-082": [
    {"effectId":"WX04-082-E1","effectType":"AUTO","timing":["ON_FRONT_SIGNI_ATTACK"],"action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","isTriggerSource":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WXK11-015-E3 反覆する思念　ピルルクＶＳリメンバ（キー）【自】：シグニ１体がダウン状態になったとき、そのシグニを凍結する。
  //   parser: FREEZE 対象 owner:self（トリガー元でなく任意の自分シグニに誤解決）。
  //   正: そのシグニ＝トリガー元（triggeringCardNum）。isTriggerSource で限定。owner はダウンした側が
  //   どちらもありうる（triggerScope:any・自分のアタックダウンでも凍結する＝公式裁定どおりの両刃）。
  //   続き207: execFreeze に owner:'any'＋isTriggerSource の側解決分岐を追加し、旧 owner:opponent 近似
  //   （自分側ダウンは no-op）を撤去。count:'ALL'＝選択UIを経ず自動適用（WX04-082-E1 と同型）。
  "WXK11-015": [
    {"effectId":"WXK11-015-E3","effectType":"AUTO","timing":["ON_SIGNI_DOWN"],"triggerScope":"any","action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"any","count":"ALL","filter":{"cardType":"シグニ","isTriggerSource":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-084-E1 ATTRACTION（スペル）あなたのデッキからコストの合計が1のスペル1枚とコストの合計が2のスペル1枚とコストの合計が3のスペル1枚を探して公開し手札に加え、シャッフルする。
  //   旧AUTO: 単一 SEARCH（コスト条件なし・1枚のみ）。コストちょうど1/2/3 の3回サーチに分割（costMin==costMax で exact 判定）。
  "WX04-084": [
    {"effectId":"WX04-084-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":2},{"color":"無","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"スペル","costMin":1,"costMax":1},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]}},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"スペル","costMin":2,"costMax":2},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]}},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"スペル","costMin":3,"costMax":3},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]}},{"type":"SHUFFLE_DECK","owner":"self"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-086-E1 幻獣 トサ（シグニ 精生：地獣）【常】あなたの他の＜空獣＞と＜地獣＞のシグニのパワーを+2000する。
  //   旧AUTO: owner:any・count:1・フィルタ無し（誤）。owner:self・count:ALL・story:[空獣,地獣]・excludeSelf（他の）に修正。BURST（空獣/地獣サーチ）は正。
  "WX04-086": [
    {"effectId":"WX04-086-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":["空獣","地獣"],"excludeSelf":true}},"delta":2000,"excludeSelf":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-088 幻獣 ビーグル（シグニ 精生：地獣）
  //  E1【常】このシグニが【ランサー】を持っているかぎり、このシグニの基本パワーは10000になる（activeCondition SELF_HAS_KEYWORD 欠落で常時10000だった）。
  //  E2【起】《緑×3》：ターン終了時まで、このシグニは【ランサー】を得る（旧: 対象「あなたのシグニ1体」誤→ thisCardOnly に修正）。
  "WX04-088": [
    {"effectId":"WX04-088-E1","effectType":"CONTINUOUS","activeCondition":{"type":"SELF_HAS_KEYWORD","keyword":"ランサー"},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":10000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX04-056-E1 大壊 アクス（シグニ 精武：アーム）【常】あなたの他の＜アーム＞のシグニのパワー+2000。
  "WX04-056": [
    {"effectId":"WX04-056-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","cardClass":"アーム","excludeSelf":true}},"delta":2000,"excludeSelf":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-054 サーバント X（シグニ 精元）E1【常】カード名に《サーバント》を含む他の自シグニのパワー+3000。
  // 🔴**E2（【マルチエナ】）は 2026-08-27（Sheet1 B2）に撤去**＝印字キーワード規則に `thisCardOnly` を
  //   足したことで parser 出力と実体同一になり、§6.4 `O-42` のトリップワイヤが発火した（＝影武者）。
  //   ⚠**live 側の `parseStatus` も `MANUAL`→`AUTO` へ直した**（MANUAL のままだと `PRESERVE_STATUSES` が
  //   効き続け、この効果にだけ parser 改善が永久に届かない＝§6.4 `O-40`／`O-93`）。
  "WX04-054": [
    {"effectId":"WX04-054-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","cardName":"サーバント","excludeSelf":true}},"delta":3000,"excludeSelf":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX04-052 堕落の虚無 パイモン（シグニ 精像：悪魔）
  //  E1【常】＜悪魔＞シグニがバニッシュされる場合、代わりに付いている【チャーム】1枚をトラッシュしてもよい（チャーム盾）。
  //  E2【出】デッキトップをこのシグニの【チャーム】にしてもよい。BURST：デッキ上3枚トラッシュ→トラッシュから＜悪魔＞シグニ1枚を手札へ。
  "WX04-052": [
    {"effectId":"WX04-052-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"ATTACH_CHARM","optional":true,"charm":{"type":"DECK_CARD","owner":"self","count":1},"to":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX04-050-E1 非可視の現実 キュビ（シグニ 精像：美巧）【起】《ダウン》：デッキ上から＜美巧＞シグニがめくれるまで公開→手札に加え、公開した他のカードをシャッフルしてデッキ下へ。
  "WX04-050": [
    {"effectId":"WX04-050-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"REVEAL_UNTIL_TO_HAND","owner":"self","revealClass":"美巧","restDest":"deck_bottom_shuffled"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-049-E1 幻獣 シエンコ（シグニ 精生：地獣）【常】場に他の＜空獣＞か＜地獣＞がある限り、このシグニの基本レベルは2になる（cardMap Level上書き）。
  "WX04-049": [
    {"effectId":"WX04-049-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":["空獣","地獣"]},"excludeSelf":true},"action":{"type":"SET_BASE_LEVEL","target":{"type":"SIGNI","owner":"self","count":1},"value":2},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-043 羅石 黒曜（シグニ 精羅：宝石）
  //  E1【起】《赤》《赤》＋場から＜鉱石＞か＜宝石＞のシグニ合計3体トラッシュ：すべてのシグニ（両者）をバニッシュ。
  "WX04-043": [
    {"effectId":"WX04-043-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1},{"color":"赤","count":1}],"fieldTrash":{"count":3,"filter":{"cardType":"シグニ","story":["鉱石","宝石"]}}},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-041 コードメイズ スカイジュ（シグニ 精械：迷宮）
  //  E1【常】場に他の＜迷宮＞がある限り基本パワー10000。E2【出】対戦相手のすべてのシグニを好きなように配置し直してもよい（再配置UI）。
  "WX04-041": [
    {"effectId":"WX04-041-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"opponent","count":"ALL"},"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-040 極壊 ハンマ（シグニ 精武：アーム）
  //  E1【常】場に＜ウェポン＞がある限り基本パワー15000。E2【起】場から＜アーム＞1体＋＜ウェポン＞1体トラッシュ→相手シグニ1体バニッシュ。
  //  BURST：手札から＜アーム＞1枚＋＜ウェポン＞1枚を捨てたら、相手シグニ1体を手札に戻し、相手シグニ1体をバニッシュ。
  "WX04-040": [
    {"effectId":"WX04-040-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"fieldTrashGroups":[{"count":1,"filter":{"cardType":"シグニ","story":"アーム"}},{"count":1,"filter":{"cardType":"シグニ","story":"ウェポン"}}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX04-040-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"HAND_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"アーム"},"operator":"gte","value":1},{"type":"HAND_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"ウェポン"},"operator":"gte","value":1}]},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"アーム"}}},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"ウェポン"}}},{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-038 バイオレンス・スプラッシュ（スペル）
  //  E1【スペル】このターン①パワー0以下のシグニのバニッシュ先→トラッシュ（所有者問わず）②あなたのシグニ効果による相手へのパワーマイナス2倍。
  //  BURST：トラッシュから黒のシグニ1枚を対象とし、手札に加えるか場に出す（プレイヤー選択）。
  "WX04-038": [
    {"effectId":"WX04-038-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"BANISH_REDIRECT_POWER0_TRASH"},{"type":"STUB","id":"DOUBLE_POWER_MINUS_THIS_TURN"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX04-038-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"hand","label":"手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"黒"}}}},{"choiceId":"field","label":"場に出す","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"黒"}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-037-E2【自】あなたのターンの間、対戦相手のシグニ1体が場からトラッシュに置かれたとき、デッキトップ1枚をエナへ（triggerScope:any_opp + IS_MY_TURN）。
  //   ※E1（POWER_MODIFY_PER_FIELD）・BURST（owner:'any'の-10000/-7000）はパーサー結果が正しいためE2のみ上書き。
  "WX04-037": [
    {"effectId":"WX04-037-E2","effectType":"AUTO","timing":["ON_TRASH"],"triggerScope":"any_opp","condition":{"type":"IS_MY_TURN"},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-036-E1【起】〈《緑×2》〉あなたの＜美巧＞のシグニを好きな数バニッシュ→デッキから同じ枚数の＜美巧＞シグニを探して場に出す（カード・ゾーンをプレイヤーが選択）→シャッフル。
  "WX04-036": [
    {"effectId":"WX04-036-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"美巧"},"upToCount":true}},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"美巧"},"maxCount":{"$ref":"last_processed_count"},"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  "WX04-035": [
    {"effectId":"WX04-035-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","subjectFilter":{"cardType":"シグニ","story":"美巧"},"subjectOwner":"self","from":["ルリグ","シグニ"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX04-035-E2","effectType":"AUTO","timing":["ON_TRASH"],"triggerScope":"self","triggerCondition":{"byOpponentEffect":true,"fromAnyZone":true},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["緑"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // G154「TOO BADLY」（スペル WX24-D3-25 / SPDi37-06）。
  //  E1: カードを1枚引き、対戦相手は手札を1枚捨てる。《リコレクトアイコン》[5枚以上]代わりに、引いて相手の手札を1枚ランダムに捨てさせる。
  //   → DRAW1 + CONDITIONAL(リコレクト5＝ルリグトラッシュのアーツ5枚以上 ? 相手手札1枚blind : 相手手札1枚(相手選択))。両分岐ともDRAWは共通なので前段で実行。
  ...Object.fromEntries((['WX24-D3-25', 'SPDi37-06'] as const).map(cardNum => [cardNum, [
    {
      effectId: `${cardNum}-E1`,
      effectType: 'ACTIVATED' as const,
      timing: ['MAIN' as const],
      cost: { energy: [{ color: '青', count: 1 }] },
      action: {
        type: 'SEQUENCE' as const,
        steps: [
          { type: 'DRAW' as const, owner: 'self' as const, count: 1 },
          {
            type: 'CONDITIONAL' as const,
            condition: { type: 'LRIG_TRASH_COUNT' as const, cardType: 'アーツ' as const, operator: 'gte' as const, value: 5, excludeSource: true },
            then: { type: 'TRASH' as const, target: { type: 'HAND_CARD' as const, owner: 'opponent' as const, count: 1, blind: true } },
            else: { type: 'TRASH' as const, target: { type: 'HAND_CARD' as const, owner: 'opponent' as const, count: 1 } },
          },
        ],
      },
      duration: 'INSTANT' as const,
      mandatory: true,
      parseStatus: 'MANUAL' as const,
    },
  ]])),

  // ===== 「センタールリグと共通する色を持つ」系の誤パース修正（CHOOSE/SEQUENCE復元）=====
  // 自動パーサーが選択肢構造を STUB/誤 SEQUENCE に潰し colorMatchesLrig フィルタも欠落していた4枚を manual 化。
  // fixLrigColorFilters.mjs の locate() パスが旧構造前提で再適用不能だったため、本体ごとここで定義する。

  // WX17-Re14 コードアート †A・L・C・A†（シグニ）【出】手札から＜電機＞シグニ1枚を捨てる：以下の3つから1つを選ぶ
  'WX17-Re14': [
    {
      effectId: 'WX17-Re14-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      cost: { handDiscardSigni: { count: 1, story: '電機' } },
      action: { type: 'CHOOSE', choose_count: 1, from_count: 3, choices: [
        // ①対戦相手のシグニ2体をターン終了時までそれぞれパワー-2000
        { choiceId: 'c0', label: '対戦相手のシグニ2体のパワー-2000',
          action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: false, filter: { cardType: 'シグニ' } }, delta: -2000 } },
        // ②デッキトップ2枚トラッシュ→トラッシュからセンタールリグと共通色シグニ1枚を手札へ
        { choiceId: 'c1', label: 'デッキトップ2枚をトラッシュ→共通色シグニ回収',
          action: { type: 'SEQUENCE', steps: [
            { type: 'MILL', owner: 'self', count: 2 },
            { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', colorMatchesLrig: true } } },
          ] } },
        // ③デッキトップ3枚トラッシュ→トラッシュから黒のスペル1枚を手札へ
        { choiceId: 'c2', label: 'デッキトップ3枚をトラッシュ→黒スペル回収',
          action: { type: 'SEQUENCE', steps: [
            { type: 'MILL', owner: 'self', count: 3 },
            { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'スペル', color: '黒' } } },
          ] } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX20-020 サティスファクション（アーツ）以下の4つから2つまで選ぶ
  // ・冒頭のコスト軽減（自L4以下&相手L5以上で《無×1》）は CONDITIONAL_ARTS_COST STUB のまま（実コストの
  //   適用は支払い時の `computeArtsEffectiveCost`）。🆕§5.3 `O-60` 第8バッチ（2026-08-26）で engine が
  //   カード全文 regex を読むのをやめたので、**条件は payload で刻む**（落とすと条件がログに出なくなる）。
  // ・④ADD_TO_FIELD はエンジン上【出】を発動させないため「【出】能力は発動しない」を既定で満たす。
  'WX20-020': [
    {
      effectId: 'WX20-020-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '無', count: 6 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'CONDITIONAL_ARTS_COST',
          artsCostCond: { kind: 'center_lrig_level', level: 4, op: '以下', oppLevel: 5, oppOp: '以上' } },
        { type: 'CHOOSE', choose_count: 2, from_count: 4, upTo: true, choices: [
          { choiceId: 'c0', label: '対戦相手のシグニ1体をバニッシュ',
            action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } },
          { choiceId: 'c1', label: 'カードを2枚引く',
            action: { type: 'DRAW', owner: 'self', count: 2 } },
          { choiceId: 'c2', label: 'デッキトップ2枚をエナゾーンへ',
            action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 } },
          { choiceId: 'c3', label: '共通色シグニをトラッシュから場に出す（【出】不発）',
            action: { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', colorMatchesLrig: true } } } },
        ] },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX21-035 縛恋の煉獄（スペル）以下の4つから2つまで選ぶ
  // ・任意コスト置換（手札から赤緑の＜龍獣＞1枚ずつ捨てて《赤×0》）は**使用時の支払い**＝
  //   `SpellCastModal` が `parseOptionalDiscardForCost` で解決する（タスク12(lxxxi) 残テール）。
  //   ⚠**先頭の OPTIONAL_COST STUB は置かない**＝置くと effectExecutor の Pattern⑤ が解決中に
  //   もう一度「支払いますか？」を出し、「スキップ」で**後続の CHOOSE（本体）が丸ごと飛ぶ**。
  //   原文では支払わなくても本体は動く（支払いはコストが変わるだけ）。
  // ・①colorNotMatchesLrig は ENERGY_CARD 対象では対象オーナー（＝相手）のルリグ基準で解決される（execTrash）。
  'WX21-035': [
    {
      effectId: 'WX21-035-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 1 }, { color: '緑', count: 1 }, { color: '無', count: 1 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'CHOOSE', choose_count: 2, from_count: 4, upTo: true, choices: [
          { choiceId: 'c0', label: '相手エナから相手ルリグと共通色を持たないカード1枚をトラッシュ',
            action: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, upToCount: false, filter: { colorNotMatchesLrig: true } } } },
          { choiceId: 'c1', label: 'デッキトップ2枚をエナゾーンへ',
            action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 } },
          { choiceId: 'c2', label: '相手パワー7000以下シグニ1体をバニッシュ',
            action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 7000 } } } } },
          { choiceId: 'c3', label: '相手パワー12000以上シグニ1体をバニッシュ',
            action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { min: 12000 } } } } },
        ] },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK02-029 ビカム・ユー（アーツ）以下の2つから1つを選ぶ
  // ・①条件付きグロウ＋全キー能力喪失は CONDITIONAL_GROW_AND_KEY_DISABLE STUB のまま（未実装の複合効果）。
  'WXK02-029': [
    {
      effectId: 'WXK02-029-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 0 }] },
      action: { type: 'CHOOSE', choose_count: 1, from_count: 2, choices: [
        { choiceId: 'c0', label: '条件付きグロウ＋全キー能力喪失',
          action: { type: 'STUB', id: 'CONDITIONAL_GROW_AND_KEY_DISABLE' } },
        { choiceId: 'c1', label: '共通色シグニを回収して1枚引く',
          action: { type: 'SEQUENCE', steps: [
            { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', colorMatchesLrig: true } } },
            { type: 'DRAW', owner: 'self', count: 1 },
          ] } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // ===== 「対戦相手のシグニがアタックしたとき」系の本文誤り修正（triggerScope:any_opp は parser/engine で対応済み）=====
  // パーサーは triggerScope:any_opp を付与するが、以下3枚は本文（対象）が誤っているため manual で上書き。
  // 他11枚（WX11-025/WX12-001/WX12-035/WX14-003/WX14-050/WX14-052/WX14-053/WXK06-076/WXDi-D06-012/WXDi-P02-052/WXDi-P08-007）は
  // 本文が妥当なため JSON に triggerScope:any_opp のみ付与（manual 不要）。

  // WX04-029 コードラビリンス クイン（シグニ）
  // 「対戦相手のシグニ1体がアタックしたとき、ターン終了時まで、あなたのすべての＜迷宮＞シグニ +1000。その後、アタッカー正面が空ならこのシグニを移動してもよい」
  // 旧パース誤り: POWER_MODIFY target が owner:any/count:1（任意1体）。正しくは自分の全＜迷宮＞シグニ。MOVE_TO_ATTACKER_FRONT は execStub 実装済み。
  'WX04-029': [
    {
      effectId: 'WX04-029-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'any_opp',
      action: { type: 'SEQUENCE', steps: [
        { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', story: '迷宮' } }, delta: 1000 },
        { type: 'STUB', id: 'MOVE_TO_ATTACKER_FRONT' },
      ] },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    
    {"effectId":"WX04-029-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"hand","label":"手札に加える","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"迷宮"},"maxCount":1,"then":{"type":"ADD_TO_HAND","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"field","label":"場に出す","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"迷宮"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  'WX10-025': [
    {
      effectId: 'WX10-025-E1', effectType: 'ACTIVATED', timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '白', count: 1 }, { color: '赤', count: 1 }, { color: '青', count: 1 }, { color: '緑', count: 1 }, { color: '黒', count: 1 }] },
      action: { type: 'SEQUENCE', steps: [
        // §5.3 `O-87`＝「エナゾーンにあるカードが持つ色から最大5色まで選ぶ」の typed アクション化
        // （旧 `STUB{CHOOSE_COLOR_FROM_LIST}` は上限をカード全文の `最大N色` から読んでいた）。
        { type: 'SELECT_COLOR', from: 'energy', count: 5 },
        { type: 'CONDITIONAL', condition: { type: 'SELECTED_COLOR', color: '白' }, then: { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'any', count: 1, upToCount: false, filter: { cardType: 'シグニ' } }, optional: false } },
        { type: 'CONDITIONAL', condition: { type: 'SELECTED_COLOR', color: '赤' }, then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'any', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 12000 } }, upToCount: false } } },
        { type: 'CONDITIONAL', condition: { type: 'SELECTED_COLOR', color: '青' }, then: { type: 'DRAW', owner: 'self', count: 2 } },
        { type: 'CONDITIONAL', condition: { type: 'SELECTED_COLOR', color: '緑' }, then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 } },
        { type: 'CONDITIONAL', condition: { type: 'SELECTED_COLOR', color: '黒' }, then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'any', count: 1 }, delta: -12000 } },
      ] },
      duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
    },
  ],

  'WXK08-029': [
    {
      effectId: 'WXK08-029-E1', effectType: 'ACTIVATED', timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 0 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'CONDITIONAL', condition: { type: 'BEAT_ZONE_COUNT', operator: 'lte', value: 4 }, then: { type: 'STUB', id: 'TRASH_SIGNI_TO_BEAT', value: 'WXK08-029' } },
        { type: 'CONDITIONAL', condition: { type: 'AND', conditions: [
          { type: 'BEAT_ZONE_COUNT', operator: 'eq', value: 4, thisWay: true },
          { type: 'LAST_PROCESSED_COUNT_GTE', value: 1, verbJa: '__internal__' },
        ] }, then: { type: 'DRAW', owner: 'self', count: 2 } },
      ] },
      duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
    },
  ],

  // WX12-010 ホワイトメイズ ホデサパ（レゾナ）
  // 「対戦相手のシグニ1体がアタックしたとき、ターン終了時まで、そのシグニのパワーを－2000する」
  // 旧パース誤り: POWER_MODIFY target が owner:any/count:1。正しくは「そのシグニ」＝アタッカー（targetsTriggerSource）。
  'WX12-010': [
    {
      effectId: 'WX12-010-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'any_opp',
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, targetsTriggerSource: true, delta: -2000 },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      // 【出】：対戦相手のすべてのシグニを好きなように配置し直してもよい。
      //        あなたはこの方法で他のシグニゾーンに移動したシグニをアップしてもよい。
      // ⚠parser の素の出力は 2段目が `UP{SIGNI, owner:'self', count:1}`＝**自分のシグニをアップ**する
      //   別物だった（主語のない「移動したシグニ」を self へ倒す既知の反転）。採ると過剰効果になるので
      //   ここで手書きに置き換える。1段目の「配置し直して**もよい**」も素の出力は optional が落ちていた。
      // 🆕**§6.4 O-8(b) で defer を解除（2026-08-16 続き506）**＝`resumeRearrangeSigni` が
      //   `rearrMoved`（旧ゾーン≠新ゾーン）を `lastProcessedCards` に載せるようにし、
      //   `STORE_LAST_PROCESSED_TARGETS` → `UP{targetsStored}` の正準形で受ける。
      //   `count:'ALL' + upToCount` ＝「好きな数アップして**もよい**」（0体も選べる）。
      // ⚠`filter.isDown` を付けないと**アップ状態のシグニまで候補**に出て「何が起きたか分からない」選択になる。
      effectId: 'WX12-010-E3',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' }, optional: true },
        { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' },
        { type: 'UP', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', upToCount: true, filter: { cardType: 'シグニ', isDown: true } }, targetsStored: true },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WD07-012 コードアンチ ヴィマナ（シグニ）
  // 「対戦相手のシグニがアタックしたとき、そのシグニのパワーがその正面のシグニのパワーより低い場合、アタックしたそのシグニをバニッシュする」
  // 旧パース誤り: BANISH owner:self（自分のシグニをバニッシュ＝有害）。条件（アタッカー<正面）が未実装のため STUB 化して有害動作を防ぐ。
  'WD07-012': [
    {
      effectId: 'WD07-012-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'any_opp',
      action: { type: 'STUB', id: 'BANISH_ATTACKER_IF_WEAKER_THAN_FRONT' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  
    {"effectId":"WD07-012-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":4,"upToCount":false,"filter":{"cardType":"シグニ","story":"古代兵器"},"selectionConstraint":{"distinct":"level"}},"shuffle":false,"position":"bottom"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-10000}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WX04-030 トライ・シグナル（スペル）
  // 🗑**E1 の手書きコピーは 2026-08-27（Sheet1 B10）で撤去した**＝parser が
  //   「〜をデッキに戻し、（対戦相手は自分の）デッキをシャッフルする」の `shuffle` を読むようになり、
  //   出力が実体同一になった（§6.4 O-42 のトリップワイヤが検知）。影武者を残すと**その効果にだけ
  //   以後の parser 改善が永久に届かない**ので削除して parser に任せる。live 側の `parseStatus` も
  //   `MANUAL`→`AUTO` へ直した（`PRESERVE_STATUSES` が効いたままだと同じ凍結が起きる）。
  // BURST「手札から＜迷宮＞シグニ1枚を捨てる。そうした場合、対戦相手は対象の自分のシグニ1体をトラッシュに置く」
  //   旧パース誤り: 2段目 TRASH に opponentSelects 欠落（相手自身が選ぶべき）。
  'WX04-030': [
    {
      effectId: 'WX04-030-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', story: '迷宮' } } },
        { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, opponentSelects: true } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX04-031 幻竜姫 オロチ（シグニ）
  // E1「対戦相手のエナゾーンにあるカードが4枚以下であるかぎり、このシグニは【ダブルクラッシュ】を得る」
  //   旧パース誤り: activeCondition（相手エナ≤4）欠落＋対象が任意1体（正しくは thisCardOnly＝このシグニ）。
  // BURST「対戦相手のエナゾーンから【マルチエナ】を持つ対象のカード1枚をトラッシュに置き、対象の対戦相手のパワー8000以下のシグニ1体をバニッシュする」
  //   旧パース誤り: 1段目（マルチエナ・エナトラッシュ）が欠落しバニッシュのみ。
  'WX04-031': [
    {
      effectId: 'WX04-031-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, filter: { keyword: 'マルチエナ' } } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 8000 } } } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX04-032 龍鳳の排炎（スペル）
  // E1 は正しい（コスト軽減STUB＋パワー10000以下バニッシュ＋そうした場合エナトラッシュ）。配列丸ごと上書きのため E1 も再掲。
  // BURST「対戦相手のエナから対象のカード1枚をトラッシュ。対戦相手のエナが4枚以下の場合、パワー10000以下のシグニ1体をバニッシュ」
  //   旧パース誤り: バニッシュが無条件（「エナ4枚以下の場合」条件が欠落）。エナトラッシュ後に ENERGY_COUNT(opponent≤4) で条件化。
  'WX04-032': [
    {
      effectId: 'WX04-032-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } },
        { type: 'CONDITIONAL', condition: { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'lte', value: 4 }, then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 10000 } } } } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX04-033 羅原姫 Ne（シグニ）
  // E1（COST_INCREASE）/E3（fieldDownコスト＋バニッシュ）は正しい。配列丸ごと上書きのため再掲。
  //   ※E3 の fieldDown コストはエンジン側で支払い・発動可否を実装（従来は未処理＝タダ撃ちだった。12カード共通の修正）。
  // E2「あなたがスペルを使用したとき、ターン終了時まで、あなたのすべての＜原子＞シグニ+2000」
  //   旧パース誤り: timing が ON_TURN_END（本文「ターン終了時まで」を誤検出）＋対象 owner:any/count:1。正: ON_SPELL_USE・自分の全＜原子＞シグニ。
  // BURST「カードを1枚引く。その後、あなたの場に＜原子＞のシグニがある場合、対戦相手のシグニ1体をバニッシュする」
  //   旧パース誤り: ＜原子＞条件をバニッシュ対象に取り違え（無条件で相手の＜原子＞シグニをバニッシュ）。正: 場に＜原子＞がある場合に相手シグニ1体をバニッシュ。

  // WX04-034 SHORT（スペル）以下の3つから1つを選ぶ
  //   ①相手シグニ1体対象・名前の異なる＜原子＞シグニ2枚捨て→バニッシュ ②2体・4枚 ③3体・6枚
  // 旧パース誤り: CHOOSE が SEQUENCE 化＋owner が self＋手札捨てコスト欠落（自分シグニ3連バニッシュの誤り）。
  // 各選択肢を HAND_COUNT_FILTER（手札に名前の異なる＜原子＞シグニN枚以上）でゲートし、捨て→相手バニッシュの SEQUENCE に。
  // ※「名前の異なる」枚数はゲートで担保。捨てカード選択自体の重複名チェックは近似（handDiscardSigni 同様の方針）。
  'WX04-034': [
    {
      effectId: 'WX04-034-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 0 }] },
      action: { type: 'CHOOSE', choose_count: 1, from_count: 3, choices: [
        { choiceId: 'c0', label: '＜原子＞2枚捨て→相手シグニ1体バニッシュ',
          condition: { type: 'HAND_COUNT_FILTER', owner: 'self', filter: { cardType: 'シグニ', story: '原子' }, operator: 'gte', value: 2, distinctName: true },
          action: { type: 'SEQUENCE', steps: [
            { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 2, filter: { cardType: 'シグニ', story: '原子' } } },
            { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } },
          ] } },
        { choiceId: 'c1', label: '＜原子＞4枚捨て→相手シグニ2体バニッシュ',
          condition: { type: 'HAND_COUNT_FILTER', owner: 'self', filter: { cardType: 'シグニ', story: '原子' }, operator: 'gte', value: 4, distinctName: true },
          action: { type: 'SEQUENCE', steps: [
            { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 4, filter: { cardType: 'シグニ', story: '原子' } } },
            { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 2, upToCount: false, filter: { cardType: 'シグニ' } } },
          ] } },
        { choiceId: 'c2', label: '＜原子＞6枚捨て→相手シグニ3体バニッシュ',
          condition: { type: 'HAND_COUNT_FILTER', owner: 'self', filter: { cardType: 'シグニ', story: '原子' }, operator: 'gte', value: 6, distinctName: true },
          action: { type: 'SEQUENCE', steps: [
            { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 6, filter: { cardType: 'シグニ', story: '原子' } } },
            { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 3, upToCount: false, filter: { cardType: 'シグニ' } } },
          ] } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],


  // WD02-007 背炎之陣（アーツ）
  // 「手札を３枚捨てる。そうした場合、すべてのシグニをバニッシュする。（あなたのシグニも含まれる）」
  // 旧JSONの誤り2点: ①「そうした場合」を IS_MY_TURN に誤パース（本来は3枚捨てた場合）/
  //   ②owner:'any' は execBanish で相手シグニのみ＝「あなたのシグニも含まれる」が欠落。
  // → 手札3枚捨てをコスト化（discard:3）し、自分・対戦相手の全シグニをそれぞれ BANISH する。
  'WD02-007': [
    {
      effectId: 'WD02-007-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 2 }], discard: 3 },
      action: { type: 'SEQUENCE', steps: [
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WD03-006 ピーピング・アナライズ（アーツ）
  // 「数字１つを宣言する。その後、対戦相手の手札を見て、宣言した数字と同じレベルのシグニをすべて捨てさせる。」
  // 旧JSONの誤り: SEQUENCE[DECLARE_NUMBER, DECLARE_NUMBER]＝宣言が重複し「捨てさせる」が欠落。
  // → 同一効果の WX25-P1-TK3（ダーク・アナライズ）と同じ STUB TK3_DECLARE_DISCARD（数字宣言→相手手札の同レベルシグニ全捨て）に置換。
  'WD03-006': [
    {
      effectId: 'WD03-006-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 3 }] },
      action: { type: 'STUB', id: 'TK3_DECLARE_DISCARD' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],


  // WD04-009 幻獣　セイリュ（シグニ）
  // 【常】：あなたの場にあるシグニ３体のパワーがそれぞれ15000以上であるかぎり、このシグニは【ランサー】と
  //   「【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、それをバニッシュする。」を得る。
  // 旧JSONの誤り: 引用付与をフラット化し CONTINUOUS BANISH opponent（条件・トリガー欠落＝常時バニッシュの有害誤り）。
  // → 条件 FIELD_SIGNI_POWER_COUNT(15000以上が3体)。E1=条件付きランサー付与（GRANT_KEYWORD）／E2=条件付き ON_ATTACK_SIGNI バニッシュ。
  'WD04-009': [
    {
      effectId: 'WD04-009-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'FIELD_SIGNI_POWER_COUNT', owner: 'self', minPower: 15000, operator: 'gte', value: 3 },
      action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'ランサー', duration: 'PERMANENT' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WD04-009-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'FIELD_SIGNI_POWER_COUNT', owner: 'self', minPower: 15000, operator: 'gte', value: 3 },
      action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-030 贖罪の対火（スペル）
  // 「相手パワー12000以下のシグニ1体をバニッシュ。ターン終了時まで、あなたのセンタールリグは【ダブルクラッシュ】を得る。」
  // BURST「あなたのライフを1枚トラッシュに置く。そうした場合、対戦相手のライフを1枚クラッシュする。」
  // 修正: ①E1の keyword duration を PERMANENT→UNTIL_END_OF_TURN（「ターン終了時まで」）。
  // ②BURSTの「そうした場合」を IS_MY_TURN に誤パース（バーストは相手ターン発動なので常にfalse＝相手ライフクラッシュが永久不発）→
  //   LIFE_CRASH self（triggerBurst:false＝トラッシュへ）が lastProcessedCards を残し、相手 LIFE_CRASH を conditional:true でゲート。
  'WX01-030': [
    {
      effectId: 'WX01-030-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'LIFE_CRASH', owner: 'self', count: 1, triggerBurst: false },
        { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true, conditional: true },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-085 ＦＲＥＥＺＥ（スペル）
  // BURST「対戦相手のシグニを2体まで対象とし、それらをダウンし凍結する。」
  //   旧JSONは DOWN(2体) と FREEZE(2体) を別ステップ＝別々に選択でき、ダウン対象と凍結対象が
  //   一致しない誤り（原文「それら」＝同じ対象）。engine の FREEZE は signi_down も立てる（ダウン込み）ため、
  //   単一の FREEZE(down:true) で「同じ対象をダウン＆凍結」を表現（FREEZE は down:true のときのみダウンも行う）。
  //   E1「対戦相手のすべてのシグニをダウンし凍結する」も単一 FREEZE(ALL, down:true) に整理。

  // WX01-036 巨弓　カタパル（シグニ）
  // E1【出】：デッキトップを見る。それがレベル2以下のシグニで自分の場に他のシグニがない場合、出してもよい。
  //   旧JSONは LOOK_AND_REORDER の後に ADD_TO_FIELD を無条件実行＝条件（レベル2以下・他シグニ無し）と
  //   「出してもよい」（任意）を欠落。→ WX01-057-E1 と同型（CONDITIONAL{AND[DECK_TOP_MATCHES, FIELD_COUNT eq 1]}＋CHOOSE）。
  'WX01-036': [
    {
      effectId: 'WX01-036-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } },
        { type: 'CONDITIONAL',
          condition: { type: 'AND', conditions: [
            { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: { max: 2 } } },
            { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
          ] },
          then: { type: 'CHOOSE', choose_count: 1, from_count: 2, choices: [
            { choiceId: 'yes', label: 'デッキトップを場に出す', action: { type: 'ADD_TO_FIELD', owner: 'self' } },
            { choiceId: 'no', label: '場に出さない', action: { type: 'SEQUENCE', steps: [] } },
          ] } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX12-CB02 幻獣　ぷにとー（§6.4 O-11・2026-08-17 続き526）
  // E1【自】：アタックフェイズ開始時、デッキの一番上を公開する。公開したシグニのレベルで**5分岐**：
  //   Lv1 自パワー＋5000／Lv2 エナチャージ1／Lv3 このシグニが【ランサー】／Lv4 1ドロー／Lv5 相手シグニ1体をバニッシュ。
  // 🔴live は archive の one-off パッチ（`scripts/archive/fixWX2.mjs`）が書いた **Lv1・Lv2 の2分岐だけ**の
  //   MANUAL で、**Lv3〜Lv5 が丸ごと落ちていた**（parser も 5分岐は組めず fresh は Lv1 だけに縮退する）。
  // 🔑**else の入れ子チェーン**にするのが要点＝並列 CONDITIONAL を並べると、Lv2 の
  //   `ENERGY_CHARGE_FROM_DECK` が**デッキトップを持っていってしまう**ため、後段の `DECK_TOP_MATCHES` が
  //   **次のカード**を見て二重発火する。else なら1本だけ走って打ち切られる。
  // ⚠engine 側には同義のカード専用 STUB `REVEAL_TOP_LEVEL_ROUTE`（`execStubPart3.ts`）があるが、
  //   live からは参照していない（§6.4 O-20 の「カード全文を読む STUB」クラス）。構造化 DSL 側を正とする。
  'WX12-CB02': [
    {
      effectId: 'WX12-CB02-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: { type: 'SEQUENCE', steps: [
        { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } },
        { type: 'CONDITIONAL',
          condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 1 } },
          then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 5000 },
          else: { type: 'CONDITIONAL',
            condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 2 } },
            then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
            else: { type: 'CONDITIONAL',
              condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 3 } },
              then: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, keyword: 'ランサー', duration: 'UNTIL_END_OF_TURN' },
              else: { type: 'CONDITIONAL',
                condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 4 } },
                then: { type: 'DRAW', owner: 'self', count: 1 },
                else: { type: 'CONDITIONAL',
                  condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 5 } },
                  then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
                },
              },
            },
          },
        },
      ] },
      // ⚠live の既存値（`UNTIL_END_OF_TURN`）に合わせる＝Lv1 の `POWER_MODIFY`（duration 省略）と
      //   Lv3 の `GRANT_KEYWORD` がターン終了時に消える扱いを従来どおり保つ。
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-059 出弓　ボウ（シグニ）
  // E1【出】：デッキトップを見る。それがレベル1のシグニで自分の場に他のシグニがない場合、出してもよい。
  //   旧JSONは ADD_TO_FIELD 無条件＝条件・任意欠落。→ WX01-036/057 と同型。レベルは「1」（ちょうど）。
  'WX01-059': [
    {
      effectId: 'WX01-059-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } },
        { type: 'CONDITIONAL',
          condition: { type: 'AND', conditions: [
            { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: 1 } },
            { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
          ] },
          then: { type: 'CHOOSE', choose_count: 1, from_count: 2, choices: [
            { choiceId: 'yes', label: 'デッキトップを場に出す', action: { type: 'ADD_TO_FIELD', owner: 'self' } },
            { choiceId: 'no', label: '場に出さない', action: { type: 'SEQUENCE', steps: [] } },
          ] } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-037 忘得ぬ幻想　ヴァルキリー（シグニ）
  // E1【起】《ダウン》：デッキから《忘得ぬ幻想　ヴァルキリー》以外のレベル3以下のシグニ1枚を探して公開し手札に加えシャッフル。
  //   旧JSONは filter.cardName（＝ヴァルキリーを探す）になっており「以外」が反映されず逆。→ excludeCardName に修正。

  // WX01-038 ゲット・ダンタリアン（スペル）
  // 「デッキから白のシグニ1枚と赤のシグニ1枚を探して公開し手札に加え、デッキをシャッフルする。」
  //   旧JSONは白のシグニ1枚のみ（赤のサーチが欠落）。→ SEQUENCE[白サーチ, 赤サーチ]。
  'WX01-038': [
    {
      effectId: 'WX01-038-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '白', count: 1 }, { color: '赤', count: 1 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', color: '白' }, maxCount: 1,
          then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] } },
        { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter: { cardType: 'シグニ', color: '赤' }, maxCount: 1,
          then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] },
          afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-033 幻獣神　オサキ（シグニ）
  // E1【自】：あなたが緑のスペルを使用したとき、あなたのデッキの一番上のカードをエナゾーンに置く。
  // 旧JSONは timing が ON_PLAY（場に出たとき）に誤パースされ、スペル色フィルタも欠落していた。
  // → timing ON_SPELL_USE＋triggerFilter{color:'緑'}。BattleScreen の ON_SPELL_USE 収集を
  //   ルリグだけでなく場のシグニも走査するよう拡張（triggerFilter.color で使用スペルの色を判定）。
  // E2/BURST はパーサー生成を維持。
  // E3【起】《緑》《緑》：あなたのトラッシュからすべての緑のカードをデッキに加えてシャッフルする。
  //   旧JSONは source に色フィルタが無く全色のカードを対象にしていた（過剰）。→ filter:{color:'緑'} を付与。

  // WX01-031 コードハート　Ｖ・Ａ・Ｃ（シグニ）
  // E1【常】：あなたが使用する青のスペルのコストは《無×1》減る。
  // 旧JSONは reduction の color が "無×1"（《無×1》から ×1 が色名にめり込み）で、removeNColorFromCost が
  // color==="無×1" を探して実コスト "無" に一致せず＝軽減が一切効いていなかった。→ color:"無", count:1 に修正。
  'WX01-031': [
    {
      effectId: 'WX01-031-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'COST_REDUCTION', targetCardType: 'スペル', color: '青', reduction: [{ color: '無', count: 1 }] },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX03-028 コードアート　Ｒ・Ｇ・Ｎ（シグニ）
  // E1【常】：あなたが使用する青のアーツのコストは《無×1》減る。 → WX01-031 と同型の "無×1" バグ（軽減不発）。
  // E2【常】：あなたのルリグデッキが0枚であるかぎり、このシグニの基本パワーは18000になる。
  //   旧JSONは activeCondition 欠落で常時18000だった。→ COUNT_THRESHOLD(lrig_deck self eq 0)。
  //   target count:1 owner:self は CONTINUOUS POWER_SET では「このシグニのみ」に適用される（既存挙動）。
  'WX03-028': [
    {
      effectId: 'WX03-028-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'COST_REDUCTION', targetCardType: 'アーツ', color: '青', reduction: [{ color: '無', count: 1 }] },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX03-028-E2',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'COUNT_THRESHOLD', location: 'lrig_deck', owner: 'self', operator: 'eq', value: 0 },
      action: { type: 'POWER_SET', target: { type: 'SIGNI', owner: 'self', count: 1 }, value: 18000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-032 ＳＮＡＴＣＨＥＲ（スペル）
  // 「対戦相手は手札を2枚捨てる。その後、対戦相手の手札が0枚の場合、カードを1枚引く。」
  // 旧JSONは「対戦相手の手札が0枚の場合」を IS_MY_TURN に誤パース（スペルは自ターン使用＝常時ドローの過剰）。
  // → CONDITIONAL を HAND_COUNT(opponent eq 0) に修正。TRASH 後に評価されるので捨てた結果0枚を正しく判定。

  // WX01-034 修復（スペル）
  // 「あなたのデッキの一番上のカードをライフクロスに加える。その後、あなたのエナゾーンにカードが10枚以上ある場合、追加であなたのデッキの一番上のカードをライフクロスに加える。」
  // 旧JSONは2回目のADD_TO_LIFEが無条件（エナ10枚以上条件が欠落）だった。→ 2枚目を CONDITIONAL{ENERGY_COUNT self gte 10} でゲート。

  // WX01-029 羅輝石　アダマスフィア（シグニ）
  // E1【自】：あなたの赤のシグニがアタックしたとき、ターン終了時まで、それのパワーを＋2000する。
  // 旧JSONは POWER_MODIFY owner:any count:1（＝任意シグニ＝相手シグニも選べる誤り）。「それ」＝アタックした赤シグニなので targetsTriggerSource:true。
  // E2/E3/BURST はパーサー生成を維持。
  'WX01-029': [
    {
      effectId: 'WX01-029-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'any_ally',
      triggerFilter: { color: '赤' },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta: 2000, targetsTriggerSource: true },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-023 大器晩成（アーツ）
  // 「対戦相手のエナゾーンにあるすべてのカードと対戦相手のすべてのシグニをトラッシュに置く。」
  // 旧JSONはシグニを BANISH（＝既定でエナゾーン行き）にしていた誤り。「トラッシュに置く」なので TRASH（シグニはトラッシュへ）に修正。
  'WX01-023': [
    {
      effectId: 'WX01-023-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 5 }, { color: '無', count: 7 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 'ALL' } },
        { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-002 暁の巫女　タマヨリヒメ（ルリグ）
  // E1【常】：あなたの場に白と赤のシグニがあるかぎり、あなたのシグニのパワーを＋3000する。
  // 旧JSONは activeCondition 欠落で常時+3000だった。→ AND[白シグニがいる, 赤シグニがいる]。E2/E3 はパーサー生成を維持。

  // WD04-013 / WD04-015（シグニ）: アタック時、このシグニのパワーがN以上の場合のみエナチャージ。
  // 旧JSONは条件（SELF_POWER_GTE）欠落で常時チャージだった。
  'WD04-013': [
    {
      effectId: 'WD04-013-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'SELF_POWER_GTE', value: 5000 },
      action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],
  'WD04-015': [
    {
      effectId: 'WD04-015-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'SELF_POWER_GTE', value: 3000 },
      action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WD04-018 （スペル）: あなたのアップ状態のシグニ1体をダウンする。そうした場合、そのシグニのパワー以下の対戦相手のシグニ1体をバニッシュする。
  // 旧JSONは「そうした場合」を IS_MY_TURN に誤パース＋「そのシグニのパワー以下」フィルタ欠落（＝任意のシグニをバニッシュできる過剰）。
  // → SEQUENCE[DOWN self up 1, BANISH opponent 1 filter{powerLteLastProcessed} conditional:true]。
  //   DOWN が lastProcessedCards にダウンしたシグニをセット → BANISH の powerLteLastProcessed が「そのシグニのパワー以下」を解決。conditional でダウン成立をゲート。
  'WD04-018': [
    {
      effectId: 'WD04-018-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 1 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'DOWN', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', isUp: true }, upToCount: false } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerLteLastProcessed: true }, upToCount: false }, conditional: true },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-025 サルベージ（アーツ）
  // あなたのトラッシュからあなたのセンタールリグと共通する色を持つシグニ１枚を対象とし、それを手札に加える。

  // WX11-026 聖火の祭壇　ヘスチア（自己復活）
  // 【自】：あなたのライフクロス１枚がクラッシュされたとき、このシグニをあなたのトラッシュから場に出してもよい。
  // E1 を ON_PLAY の誤パース（LIFE_CRASH self）から ON_LIFE_CRASHED の自己復活へ修正。
  // トラッシュにあるこのカード自身がトリガー源になるため、collectSelfEventTriggers がトラッシュも走査する。
  // 自己復活アクションは ADD_TO_FIELD source:TRASH_CARD（cardName一致＝同名は機能等価）。upToCount で「してもよい」を表現。
  'WX11-026': [
    {
      effectId: 'WX11-026-E1',
      effectType: 'AUTO',
      timing: ['ON_LIFE_CRASHED'],
      triggerScope: 'self',
      action: {
        type: 'ADD_TO_FIELD',
        owner: 'self',
        source: {
          type: 'TRASH_CARD',
          owner: 'self',
          count: 1,
          upToCount: true,
          filter: { cardType: 'シグニ', cardName: '聖火の祭壇　ヘスチア' },
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX05-042 増武（スペル）— §6.4 O-11（2026-08-17 続き533）
  // 原文＝「このターン、あなたのメインフェイズの間、あなたの＜植物＞のシグニ１体がダウン状態になったとき、
  //   それが**このターンで３回目**である場合、対象の対戦相手のシグニ１体をバニッシュし、
  //   あなたのエナゾーンから対象のカードを１枚手札に加え、カードを１枚引く。
  //   このカードの効果は１ターンに一度しか発動しない。」
  // 🔴旧パース＝`SEQUENCE[DRAW 1, STUB{RULE_REMINDER_TEXT}]`＝**トリガーも条件も丸ごと消えて
  //   使った瞬間に無条件で1枚引くだけ**（バニッシュとエナ回収は消失・ドローは過剰実行）。
  // 🔑機構3本を続き533 で新設した：
  //   ①`InstallDelayedTriggerAction.trigger.timing:'ON_SIGNI_DOWN'` の遅延収集
  //     （`collectSigniDownUpTriggers` に `delayed_triggers` ループを追加）
  //   ②`trigger.duringOwnMainPhase`＝「**あなたのメインフェイズの間**」の発火窓
  //     （期間 `THIS_TURN` とは別軸＝設置はターン中ずっと残るが発火はメインだけ）
  //   ③`fireCondition`＋`SIGNI_DOWNED_COUNT_THIS_TURN`＝「このターンで3回目」
  //     （台帳 `signi_downed_this_turn` は**ダウン検出3経路すべて**で `recordSigniDownedThisTurn` が積む）
  // ⚠`operator:'gte'` にしてある＝同時に複数体ダウンして 2→4 と飛んだ回も取りこぼさない
  //   （`once:true` があるので「最初に3体目に達した1回」しか撃たない＝原文どおり）。
  // ⚠「１ターンに一度しか発動しない」は `once:true`（最初の発火で設置を消費）で表す。
  'WX05-042': [
    {
      effectId: 'WX05-042-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 2 }] },
      action: {
        type: 'INSTALL_DELAYED_TRIGGER',
        duration: 'THIS_TURN',
        once: true,
        trigger: {
          timing: 'ON_SIGNI_DOWN',
          downedOwner: 'self',
          triggerFilter: { cardType: 'シグニ', story: '植物' },
          duringOwnMainPhase: true,
        },
        fireCondition: {
          type: 'SIGNI_DOWNED_COUNT_THIS_TURN', owner: 'self',
          filter: { cardType: 'シグニ', story: '植物' }, operator: 'gte', value: 3,
        },
        effect: {
          type: 'SEQUENCE',
          steps: [
            { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } },
            { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: false } },
            { type: 'DRAW', owner: 'self', count: 1 },
          ],
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // アタック無効化 watcher。スイボクは場、ミニマリ／シンカーはトラッシュを発生源とする。
  'WX05-025': [
    {
      effectId: 'WX05-025-E2', effectType: 'AUTO',
      timing: ['ON_GUARD', 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT'], triggerScope: 'self',
      action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
      duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
    },
  ],
  'WX14-064': [
    {
      effectId: 'WX14-064-E1', effectType: 'AUTO',
      timing: ['ON_GUARD', 'ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT'], triggerScope: 'self',
      condition: { type: 'LRIG_STORY', owner: 'self', story: 'アン' },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'BANISH_FROM_GAME' },
        { type: 'CONDITIONAL', condition: { type: 'SELF_OPTIONAL_EFFECT_TAKEN' }, then: { type: 'DRAW', owner: 'self', count: 1 } },
      ] },
      duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
    },
  ],
  'WX13-040': [
    {
      effectId: 'WX13-040-E1', effectType: 'AUTO',
      timing: ['ON_OPP_SIGNI_ATTACK_NEGATED_BY_EFFECT'], triggerScope: 'self',
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['白'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'BANISH_FROM_GAME' },
          { type: 'CONDITIONAL', condition: { type: 'SELF_OPTIONAL_EFFECT_TAKEN' }, then: { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } } },
        ] } },
      ] },
      duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
    },
  ],

  // WX16-Re07 轟砲　ウルバン（相手ライフ2枚以上クラッシュで自身アップ）
  // 【自】《ターン１回》：【ダブルクラッシュ】によって対戦相手のライフクロスが２枚以上クラッシュされたとき、このシグニをアップする。
  // E1 を ON_PLAY の誤パース（UP）から ON_OPP_LIFE_CRASHED（相手ライフクラッシュ時）へ修正。
  // ダブルクラッシュ＝同時2枚以上クラッシュは OPP_LIFE_CRASH_EVENT_GTE(2) で判定（performLifeBurstResponse 収集時に評価）。
  'WX16-Re07': [
    {
      effectId: 'WX16-Re07-E1',
      effectType: 'AUTO',
      timing: ['ON_OPP_LIFE_CRASHED'],
      usageLimit: 'once_per_turn',
      condition: { type: 'OPP_LIFE_CRASH_EVENT_GTE', value: 2 },
      action: {
        type: 'UP',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-P1-004 条炎反射（アーツ・カウンタークラッシュ）
  // このターン、次に対戦相手のルリグによってあなたのライフクロス１枚がクラッシュされたとき、対戦相手のライフクロス１枚をクラッシュする。
  // E1 を「即時2枚クラッシュ」の誤パースから SET_NEXT_LIFE_CRASH_COUNTER（防御カウンター設定）へ修正。
  // 発生源限定（相手ルリグによって）とブースト時2枚クラッシュは近似で省略（perTrigger=1固定）。
  'WX25-P1-004': [
    {
      effectId: 'WX25-P1-004-E1',
      effectType: 'ACTIVATED',
      timing: ['ATTACK'],
      cost: { energy: [{ color: '赤', count: 0 }] },
      action: { type: 'STUB', id: 'SET_NEXT_LIFE_CRASH_COUNTER', value: 1 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P12-030 レイラ・ザ・クラック（アシストルリグ・カウンタークラッシュ）
  // 【出】：ターン終了時まで、このルリグは「【自】《ターン１回》：対戦相手のシグニによってあなたのライフクロス１枚が
  //   クラッシュされたとき、対戦相手のライフクロス１枚をクラッシュする。」を得る。
  // E1 を「即時クラッシュ」の誤パースから SET_NEXT_LIFE_CRASH_COUNTER へ修正。発生源限定（相手シグニ）は近似で省略。
  // E2（《赤》《無》の別【出】）は別能力のためパーサー生成のまま維持。
  'WXDi-P12-030': [
    {
      effectId: 'WXDi-P12-030-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'SET_NEXT_LIFE_CRASH_COUNTER', value: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-CP1-065 風倉モエ（相手シグニへ即時-2000＋同じ対象へクラッシュ時-2000を付与）
  // 【自】：あなたのアタックフェイズ開始時、対戦相手のシグニ１体を対象とし、手札から＜ブルアカ＞のカードを１枚捨ててもよい。
  //   そうした場合、ターン終了時まで、それのパワーを－2000する。このターン、対戦相手のライフクロス１枚がクラッシュされたとき、
  //   ターン終了時まで、それのパワーを－2000する。
  // 鍵: 即時-2000 と「クラッシュ時-2000」を同一の選択対象へ適用する必要がある（「それ」＝同じ対象）。
  // STUB TARGET_AND_DISCARD_HAND（対象選択→直後 CONDITIONAL(IS_MY_TURN).then を選択対象へ applyDirectAction で適用→手札1枚捨て）を利用し、
  //   then を SEQUENCE[POWER_MODIFY -2000, GRANT_EFFECT(ON_LIFE_CRASHED→POWER_MODIFY thisCardOnly -2000)] にする。
  // 付与先＝相手シグニ。相手（＝付与先コントローラー）のライフがクラッシュされると、その付与 ON_LIFE_CRASHED が
  //   collectSelfEventTriggers（相手フィールド走査）で発火し、付与先自身が-2000（thisCardOnly）。クラッシュごとにスタック（usageLimitなし）。
  // 近似: 捨てる対象の＜ブルアカ＞限定・「捨ててもよい」の任意性・「そうした場合」ゲートは TARGET_AND_DISCARD_HAND の仕様上
  //   「手札を1枚（任意カード）強制で捨て対象選択」に簡略化（既存STUB踏襲）。E2【絆自】は絆条件未対応のため非実装。
  'WX25-CP1-065': [
    {
      effectId: 'WX25-CP1-065-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' },
          {
            type: 'CONDITIONAL',
            condition: { type: 'IS_MY_TURN' },
            then: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'POWER_MODIFY',
                  target: { type: 'SIGNI', owner: 'opponent', count: 1 },
                  delta: -2000,
                },
                {
                  type: 'GRANT_EFFECT',
                  target: { type: 'SIGNI', owner: 'opponent', count: 1 },
                  duration: 'UNTIL_END_OF_TURN',
                  effect: {
                    effectId: 'WX25-CP1-065-E1-CRASH',
                    effectType: 'AUTO',
                    timing: ['ON_LIFE_CRASHED'],
                    action: {
                      type: 'POWER_MODIFY',
                      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
                      delta: -2000,
                    },
                    duration: 'UNTIL_END_OF_TURN',
                    mandatory: true,
                    parseStatus: 'MANUAL',
                  },
                },
              ],
            },
          },
        ],
      } as SequenceAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-CP1-075 姫木メル（相手シグニへ ON_LIFE_CRASHED デバフを付与）
  // 【自】：あなたのアタックフェイズ開始時、あなたの場に他の＜ブルアカ＞のシグニがある場合、対戦相手のシグニ１体を対象とし、
  //   ターン終了時まで、それは「【自】《ターン１回》：このシグニがシグニ１体とバトルしたか、あなたのライフクロス１枚が
  //   クラッシュされたとき、ターン終了時まで、このシグニのパワーを－2000する。」を得る。
  // E1 を「即時-2000＋エナチャージ」の誤パースから GRANT_EFFECT（相手シグニへデバフ能力を付与）へ修正。
  // 付与期間「ターン終了時まで」は既存 granted_effects のクリアと一致。付与能力は ON_LIFE_CRASHED で発火し
  //   付与先（相手）のライフがクラッシュされたとき自身のパワー-2000（thisCardOnly）。
  // 付与能力は2つの契機（このシグニがバトルした=ON_SIGNI_BATTLE / 付与先コントローラーのライフがクラッシュ=ON_LIFE_CRASHED）で
  //   発火し、《ターン1回》（同一effectIdでusageLimit共有）で自身パワー-2000。
  // E2（【絆自】：このシグニが相手ライフをクラッシュしたときエナチャージ）はパーサー生成のまま維持。
  'WX25-CP1-075': [
    {
      effectId: 'WX25-CP1-075-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', cardClass: 'ブルアカ' }, excludeSelf: true },
      action: {
        type: 'GRANT_EFFECT',
        target: { type: 'SIGNI', owner: 'opponent', count: 1 },
        duration: 'UNTIL_END_OF_TURN',
        effect: {
          effectId: 'WX25-CP1-075-GRANT',
          effectType: 'AUTO',
          timing: ['ON_SIGNI_BATTLE', 'ON_LIFE_CRASHED'],
          usageLimit: 'once_per_turn',
          action: {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            delta: -2000,
          },
          duration: 'UNTIL_END_OF_TURN',
          mandatory: true,
          parseStatus: 'MANUAL',
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-CP02-084 大野ツクヨ（次の相手ターン終了まで自己強化＋ON_LIFE_CRASHED付与）
  // 【起】《ダウン》：次の対戦相手のターン終了時まで、このシグニのパワーを＋4000し、このシグニは
  //   「【自】《ターン１回》：あなたのライフクロス１枚がクラッシュされたとき、あなたのデッキの一番上を公開する。
  //   そのカードが＜ブルアカ＞の場合、【エナチャージ１】をする。」を得る。
  // E1 を「即時エナチャージ＋+4000」の誤パースから、UNTIL_OPP_TURN_END の自己強化＋付与へ修正。
  // パワー+4000は power_mods_until_opp_turn、付与能力は granted_effects_until_opp_turn に保存（次の相手ターン終了時にクリア）。
  // E2【絆常】（CONTINUOUS +4000）はパーサー生成のまま維持。
  'WXDi-CP02-084': [
    {
      effectId: 'WXDi-CP02-084-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { down_self: true },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            delta: 4000,
            duration: 'UNTIL_OPP_TURN_END',
          },
          {
            type: 'GRANT_EFFECT',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            duration: 'UNTIL_OPP_TURN_END',
            effect: {
              effectId: 'WXDi-CP02-084-GRANT',
              effectType: 'AUTO',
              timing: ['ON_LIFE_CRASHED'],
              usageLimit: 'once_per_turn',
              action: {
                type: 'CONDITIONAL',
                condition: { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardClass: 'ブルアカ' } },
                then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
              },
              duration: 'INSTANT',
              mandatory: true,
              parseStatus: 'MANUAL',
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P16-039 アザエラ「逆転の炎」（アシストルリグ・自己付与＋両者クラッシュ時ドロー/チャージ）
  // 【出】：対戦相手のパワー10000以下のシグニ１体をバニッシュする。（E1＝パーサー生成が正しいので維持）
  // 【出】：次の対戦相手のターン終了時まで、このルリグは「【自】《ターン２回》：あなたか対戦相手のライフクロス１枚が
  //   クラッシュされたとき、カードを１枚引くか【エナチャージ１】をする。」を得る。
  // E2 を「即時エナチャージ」の誤パースから GRANT_EFFECT（このアシストルリグ自身へ UNTIL_OPP_TURN_END で付与）へ修正。
  // 付与能力は timing [ON_LIFE_CRASHED（自ライフ）, ON_OPP_LIFE_CRASHED（相手ライフ）]＋twice_per_turn。
  // 付与先＝アシストルリグ instanceId（execGrantEffect の thisCardOnly をアシストゾーンにも対応）。
  // 自ライフクラッシュ時は collectSelfEventTriggers が nonSigniSources（assist_lrig 含む）で収集、
  //   相手ライフクラッシュ時は performLifeBurstResponse の oppCrashSources（assist_lrig 含む）で収集する。
  'WXDi-P16-039': [
    {
      effectId: 'WXDi-P16-039-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'GRANT_EFFECT',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
        duration: 'UNTIL_OPP_TURN_END',
        effect: {
          effectId: 'WXDi-P16-039-GRANT',
          effectType: 'AUTO',
          timing: ['ON_LIFE_CRASHED', 'ON_OPP_LIFE_CRASHED'],
          usageLimit: 'twice_per_turn',
          action: {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
              { choiceId: 'c1', label: 'エナチャージ1', action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 } },
            ],
          } as ChooseAction,
          duration: 'INSTANT',
          mandatory: true,
          parseStatus: 'MANUAL',
        },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P06-007 閃光へ飛翔　レイ（ルリグ・効果2枚ドロー条件＋ルリグ付与クラッシュ時）
  // 【自】：あなたのアタックフェイズ開始時、このターンにあなたが効果によってカードを２枚以上引いていた場合、
  //   青のシグニ１体を対象とし、手札を３枚捨ててもよい。そうした場合、ターン終了時まで、それは【アサシン】を得る。
  // 【出】：カードを１枚引き【エナチャージ１】をする。
  // 【起】《ゲーム１回》《青×0》：ターン終了時まで、このルリグは「【自】《ターン２回》：対戦相手のライフクロス１枚が
  //   クラッシュされたとき、カードを１枚引くか、対戦相手は手札を１枚捨てる。」を得る。
  // E1: 条件 CARDS_DRAWN_BY_EFFECT(self,gte,2) を CONDITIONAL でラップ（lrigブランチは eff.condition を評価しないため）。
  //   「捨ててもよい」は CHOOSE（捨てる/捨てない）、捨てる選択肢は HAND_COUNT>=3 でゲート。
  // E2: DRAW1＋エナチャージ1（DRAW 欠落を補完）。
  // E3: GRANT_EFFECT（thisCardOnly＝センタールリグ自身へ UNTIL_END_OF_TURN）で ON_OPP_LIFE_CRASHED twice_per_turn の
  //   CHOOSE（自ドロー / 相手ディスカード）を付与。collectは performLifeBurstResponse の oppCrashSources(lrig含む)で拾う。
  'WXDi-P06-007': [
    {
      effectId: 'WXDi-P06-007-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'CARDS_DRAWN_BY_EFFECT', owner: 'self', operator: 'gte', value: 2 },
        then: {
          type: 'CHOOSE',
          choose_count: 1,
          from_count: 2,
          choices: [
            {
              choiceId: 'c0',
              label: '手札3枚を捨てて青のシグニ1体に【アサシン】を付与',
              condition: { type: 'HAND_COUNT', owner: 'self', operator: 'gte', value: 3 },
              action: {
                type: 'SEQUENCE',
                steps: [
                  { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 3 } },
                  {
                    type: 'GRANT_KEYWORD',
                    target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', color: '青' }, upToCount: false },
                    keyword: 'アサシン',
                    duration: 'UNTIL_END_OF_TURN',
                  },
                ],
              },
            },
            { choiceId: 'c1', label: '何もしない', action: { type: 'SEQUENCE', steps: [] } },
          ],
        } as ChooseAction,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P06-007-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 0 }] },
      usageLimit: 'once_per_game',
      action: {
        type: 'GRANT_EFFECT',
        target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
        duration: 'UNTIL_END_OF_TURN',
        effect: {
          effectId: 'WXDi-P06-007-E3-GRANT',
          effectType: 'AUTO',
          timing: ['ON_OPP_LIFE_CRASHED'],
          usageLimit: 'twice_per_turn',
          action: {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
              { choiceId: 'c1', label: '対戦相手は手札を1枚捨てる', action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
            ],
          } as ChooseAction,
          duration: 'INSTANT',
          mandatory: true,
          parseStatus: 'MANUAL',
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WDK17-009 愛憎の果てに　ハイティ・鍵（キー・自ライフクラッシュ時3択）
  // 【自】《ターン１回》：対戦相手のアタックフェイズの間、あなたのライフクロスがクラッシュされたとき、以下の３つから１つを選ぶ。
  //   ①カードを１枚引く。②対戦相手のダウン状態のシグニ１体を対象とし、それをバニッシュする。
  //   ③あなたのセンタールリグが＜アルフォウ＞であなたのライフクロスが１枚以下の場合、対戦相手のライフクロス１枚をクラッシュする。
  // E1 を ON_PLAY の CHOOSE 誤パースから ON_LIFE_CRASHED（自ライフクラッシュ時）へ修正。キーは collectSelfEventTriggers が走査する（v0.362）。
  // 選択肢③は AND[LRIG_NAME_CONTAINS アルフォウ, LIFE_COUNT self lte 1] の condition で選択可否をゲート（execChoose の available）。
  // 🆕`O-64`（2026-08-25）＝「対戦相手のアタックフェイズの間」の近似省略をやめて配線した。
  //   フェイズ側＝`triggerCondition.duringAttackPhase`（`collectSelfEventTriggers` の `attackPhaseGateOk`）、
  //   ターン主側＝`turnOwner:'opponent'`（中央の `effectStack.turnGateOk`）の2枚組。
  //   ⚠「ほぼ相手アタック中」は正しくない＝効果によるライフクラッシュは自分のメインフェイズでも起きる。
  // E2（【起】このキーをルリグトラッシュ：対戦相手が自分のシグニ/エナを対象…）は対戦相手選択の複雑効果のためパーサー生成のまま維持。
  'WDK17-009': [
    {
      effectId: 'WDK17-009-E1',
      effectType: 'AUTO',
      timing: ['ON_LIFE_CRASHED'],
      triggerScope: 'self',
      triggerCondition: { duringAttackPhase: true, turnOwner: 'opponent' },
      usageLimit: 'once_per_turn',
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 3,
        choices: [
          {
            choiceId: 'c0',
            label: 'カードを1枚引く',
            action: { type: 'DRAW', owner: 'self', count: 1 },
          },
          {
            choiceId: 'c1',
            label: '対戦相手のダウン状態のシグニ1体をバニッシュ',
            action: {
              type: 'BANISH',
              target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', isDown: true }, upToCount: false },
            },
          },
          {
            choiceId: 'c2',
            label: '対戦相手のライフクロス1枚をクラッシュ',
            condition: {
              type: 'AND',
              conditions: [
                { type: 'LRIG_NAME_CONTAINS', owner: 'self', name: 'アルフォウ' },
                { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 1 },
              ],
            },
            action: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true },
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    // 🆕**§5.3 `O-65`（2026-08-25）＝E2 の誤パースを手書きで是正した。**
    // 原文＝「【起】このキーを場からルリグトラッシュに置く：対戦相手は自分の場からシグニ１体と
    //   自分のエナゾーンからカード１枚を対象とする。あなたのライフクロスが２枚以下の場合、
    //   対戦相手は、手札を１枚捨てそれらをトラッシュに置く。」
    // 🔴**旧 live は `SEQUENCE[STUB:LOOK_OPP_LIFE_TOP, LIFE_CRASH{owner:'self', count:2}]`**
    //   ＝「あなたのライフクロスが２枚以下の**場合**」という**条件**を「自分のライフを2枚クラッシュする」
    //   という**行動**として読んでいた。**この【起】を撃つと自分のライフが2枚割れる実害バグ**だった。
    //   ⚠現在の parser 出力（`STUB:CONDITIONAL_ARTS_COST`）も別の意味で誤りなので、どちらを採っても直らない。
    // 🔑**「それら」＝対象にした2枚**（`WD20-006-E1`「対戦相手のシグニ２体と、エナゾーンにあるカード２枚を
    //   対象とし、**それらを**トラッシュに置く。**その後**、対戦相手は手札を２枚捨てる。」と同じ構文）。
    // ⚠**原文の読みを1点だけ判断した**＝CSV の「手札を１枚捨て**それら**をトラッシュに置く」は
    //   助詞も読点も無く日本語として崩れており、**「捨てる。それらを〜」の転記落ち**と判断した。
    //   ⇒ **対象2枚のトラッシュは無条件**／**手札1枚捨ては「ライフ２枚以下」のときだけ**の上乗せ、と解釈している。
    //   （もう一方の読み＝「条件を満たさないと何も起きない」を採ると、対象を取る意味が無くなるうえ
    //     `WD20-006-E1` の同型構文とも食い違う。）
    {
      effectId: 'WDK17-009-E2',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { trash_key: true },          // 「このキーを場からルリグトラッシュに置く」
      action: {
        type: 'SEQUENCE',
        steps: [
          // 「対戦相手は自分の場からシグニ１体（…）を対象とする」＝相手が自分のシグニを選ぶ
          {
            type: 'TRASH',
            target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false },
            opponentSelects: true,
            bestEffort: true,             // 3つの処理は互いに独立＝対象が無くても後続を止めない
          },
          // 「（…と）自分のエナゾーンからカード１枚を対象とする」
          {
            type: 'TRASH',
            target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 },
            opponentSelects: true,
            bestEffort: true,
          },
          // 「あなたのライフクロスが２枚以下の場合、対戦相手は、手札を１枚捨て（る）」
          {
            type: 'CONDITIONAL',
            condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 2 },
            then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 }, bestEffort: true },
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX15-064 羅菌　キョウギュ（起動）
  // 【起】《ダウン》：対戦相手の感染状態のシグニ１体を対象とし、それと同じゾーンの【ウィルス】１つを取り除き、
  //   ターン終了時まで、それのパワーを－7000する。パワーが0以下になった場合、1枚引く。
  'WX15-064': [
    {
      effectId: 'WX15-064-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { down_self: true },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', infected: true }, upToCount: false },
            delta: -7000,
          },
          { type: 'STUB', id: 'REMOVE_VIRUS_TARGET_ZONE' },
          // §5.3 `O-166`（2026-08-30）＝**専用 STUB を汎用の条件型へ引き上げた**。
          // 旧＝`STUB{DRAW_IF_POWER_ZERO_TEMP}`（`execStubPart1.ts:2150`・このカード専用で
          // 「lastProcessedCards[0] が temp_power_mods 適用後パワー0以下なら1枚引く」を丸ごと持っていた）。
          // 新＝`CONDITIONAL{LAST_PROCESSED_POWER_LTE:0}`＋既存 `DRAW`＝**同じ判定を6効果で共有できる形**。
          // ⚠**位置は変えない**＝旧 STUB もこの位置で `lastProcessedCards[0]` を読んで正しく動いていた
          //   （＝間の `REMOVE_VIRUS_TARGET_ZONE` は `lastProcessedCards` を壊さない、が実証済み）。
          {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_POWER_LTE', value: 0 },
            then: { type: 'DRAW', owner: 'self', count: 1 },
          },
        ],
      } as SequenceAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX05-020 羅輝石　ダイヤブライド（AUTO E2）
  // 【自】《ターン１回》：あなたの＜鉱石＞か＜宝石＞のシグニ１体が対戦相手のアーツの効果を受けたとき、
  //   対戦相手にダメージを与える。
  // 🆕**2026-08-28 §5.3 `O-113` で近似を外した。**
  //   旧: `activeCondition: HAS_CARD_IN_FIELD{鉱石,宝石}`＝「相手がアーツを使った」だけで発火し、
  //       **そのアーツが自分のシグニに当たったかを見ていなかった**（＝ほぼ毎回ダメージが入る過剰実行）。
  //   新: `triggerCondition.affectedByOppArtsFilter`＝アーツ解決の前後で自分の場を差分し、
  //       **実際に影響を受けた**シグニがフィルタに合うときだけ発火する（`collectOppArtsAffectedOwnSigni`）。
  //   ⚠`activeCondition` は**外す**（残すと「場に居ればよい」の近似が併存して意味が二重になる）。
  'WX05-020': [
    {
      effectId: 'WX05-020-E2',
      effectType: 'AUTO',
      timing: ['ON_OPP_ARTS_USE'],
      triggerScope: 'self',
      triggerCondition: {
        affectedByOppArtsFilter: { cardType: 'シグニ', story: ['鉱石', '宝石'] },
      },
      action: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
      // 🆕原文の《ターン１回》（§5.3 2026-08-27 Sheet1 B11）。
      //   `collectOppArtsUseTriggers` 側にも usageLimit 判定を足してある（無いと JSON だけの飾りになる）。
      usageLimit: 'once_per_turn',
    },
  ],

  // WXK11-019 羅祝石　ダイヤブライド（§5.3 `O-130`・2026-09-02 索引C 第10巡）
  // 原文【自】《ターン１回》：あなたのシグニ１体が対戦相手のアーツの効果を受けたとき、
  //   **そのシグニをアップし**、ターン終了時まで、**そのシグニ**は**効果によって得ている**能力を失う。
  // 🔴旧 live＝`REMOVE_ABILITIES{target:{owner:'opponent',count:1}}` 単独＝3つ同時に壊れていた：
  //   ①「アップし」が丸ごと落ちている（過小）
  //   ②能力を失わせる相手が**逆**（原文＝効果を受けた**自分の**シグニ／旧＝相手のシグニを選ぶ）
  //   ③「効果によって得ている能力」なのに印刷能力ごと消す（過剰）
  // 🔑受け皿は新設していない＝「そのシグニ」は既存の `triggeringCardNum`（→`targetsTriggerSource`）へ載せた。
  //   `collectOppArtsUseTriggers` が `affectedByOppArtsFilter` に当たったシグニを entry へ焼き込む。
  // ⚠`affectedByOppArtsFilter` が無いと「受けたとき」自体が判定されず（`O-113` の fail-closed で不発火）、
  //   同時に `triggeringCardNum` も載らないので**この2ステップは対象を失う**＝必ず対で書く。
  'WXK11-019': [
    {
      effectId: 'WXK11-019-E2',
      effectType: 'AUTO',
      timing: ['ON_OPP_ARTS_USE'],
      triggerScope: 'self',
      triggerCondition: { affectedByOppArtsFilter: { cardType: 'シグニ' } },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1 }, targetsTriggerSource: true },
          {
            type: 'REMOVE_ABILITIES',
            target: { type: 'SIGNI', owner: 'self', count: 1 },
            targetsTriggerSource: true,
            grantedOnly: true,
            until: 'UNTIL_END_OF_TURN',
          },
        ],
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
      usageLimit: 'once_per_turn',
    },
  ],

  // WX06-019 幻水　シロナクジ（F-3 効果離場型 身代わり）
  // 【常】あなたの他の＜水獣＞のシグニ1体が対戦相手の効果によって場を離れる場合、
  //   代わりにターン終了時まで、このシグニのパワーを－6000してもよい。
  // trigger filter を story:'水獣'（Dissona用）→ cardClass:'水獣' に修正。
  // execBanish の効果離場フック（findEffectLeavePowerReductionSubstitute）が powerReduction 身代わりを自動適用する。
  'WX06-019': [
    {
      effectId: 'WX06-019-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardClass: '水獣' } },
        substituteCost: { powerReduction: 6000 },
        optional: true,
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX06-033 反復する独自性　グリッド
  // 【出】このターン、あなたの効果によってデッキ上から公開する場合、代わりに1枚多く公開してもよい。
  //   （既存型では表現不可のためUNKNOWNアクション＋MANUALステータス）
  'WX06-033': [
    {
      effectId: 'WX06-033-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'GRID_REVEAL_PLUS' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX09-CB02 終末の回旋　チェロン（E1のみ）：§6.2 系統②（Opusタスク9）で是正。
  // 【常】あなたの《クロスアイコン》を持つ＜美巧＞のシグニは対戦相手の効果によってバニッシュされない。
  //   旧近似は from:['シグニ','アーツ','スペル','ルリグ']（＝全効果耐性の過剰保護）＋《クロスアイコン》条件脱落だった。
  //   → from:['BANISH']（バニッシュ軸のみ）＋subjectFilter:{story:美巧, hasCrossIcon}（collectBanishEffectProtectedSigni が honor）。
  'WX09-CB02': [
    {
      effectId: 'WX09-CB02-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_PROTECTION',
        subjectFilter: { cardType: 'シグニ', story: '美巧', hasCrossIcon: true },
        subjectOwner: 'self',
        from: ['BANISH'],
        sourceOwner: 'opponent',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],
  // WX10-053 集結する守護（スペル）
  // 🗑**手書きコピーは 2026-08-27（Sheet1 B11）で撤去した**＝parser が「カード名に《サーバント》を含む」の
  //   前置修飾を読むようになり、**manual 側が parser 出力より劣化**していることが露呈したため：
  //   ①①②の3つの対象すべてに cardName:「サーバント」が無く**自分の全シグニ／トラッシュの全シグニ**が対象
  //   ②step0 が COST_REDUCTION{スペル,無×2,PERMANENT}＝**以後のスペル全部が永続的に2軽くなる**
  //     （原文は「**このスペルの**使用コスト」で、しかも枚数参照。parser は同位置に実行時マーカー
  //      STUB{ARTS_COST_REDUCTION_BY_EFFECT}（no-op）を置くので、少なくとも**嘘の効果は生えない**）。
  //   ⚠**「1体につき《無×2》減る」の枚数参照は未表現のまま**（CostReductionAction に per-count が無い）＝§5.3 へ登録。

  // WX11-024 リフレッシュ・エンド（アーツ・使用タイミング＝スペルカットイン）
  // このターン、対戦相手が次にリフレッシュをした場合、その後でこのターンを終了する。
  //   INSTALL_DELAYED_TRIGGER（B3）× ON_REFRESH（refreshedOwner:opponent）で遅延発火。
  //   発火時 FORCE_END_TURN（スタック解決後にターン終了）。ターン終了時に設置は消滅。
  'WX11-024': [
    {
      effectId: 'WX11-024-E1',
      effectType: 'ACTIVATED',
      timing: ['SPELL_CUTIN'],
      cost: { energy: [{ color: '無', count: 1 }] },
      action: {
        type: 'INSTALL_DELAYED_TRIGGER',
        duration: 'THIS_TURN',
        trigger: { timing: 'ON_REFRESH', refreshedOwner: 'opponent' },
        effect: { type: 'FORCE_END_TURN' },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-028 アーク・オーラ（スペル、コスト《白》×5、タマ限定）
  // ターン終了時まで、あなたのセンタールリグは
  // 「【自】：このルリグがアタックしたとき、あなたのシグニ１体を場からトラッシュに置いてもよい。
  //   そうした場合、このルリグをアップする。」を得る。
  'WX01-028': [
    {
      effectId: 'WX01-028-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '白', count: 5 }] },
      action: {
        type: 'GRANT_LRIG_ABILITY',
        abilities: [
          {
            effectId: 'WX01-028-AUTO',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_LRIG'],
            action: {
              type: 'CHOOSE',
              choose_count: 1,
              from_count: 2,
              choices: [
                {
                  choiceId: 'trash_and_up',
                  label: 'シグニ１体をトラッシュしてルリグをアップ',
                  action: {
                    type: 'SEQUENCE',
                    steps: [
                      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } },
                      { type: 'UP', target: { type: 'LRIG', owner: 'self', count: 1 } },
                    ],
                  } as SequenceAction,
                },
                {
                  choiceId: 'skip',
                  label: 'トラッシュしない',
                  action: { type: 'SEQUENCE', steps: [] } as SequenceAction,
                },
              ],
            } as ChooseAction,
            duration: 'INSTANT',
            mandatory: false,
            parseStatus: 'AUTO',
          },
        ] as CardEffect[],
        rawText: 'このルリグがアタックしたとき、シグニ１体をトラッシュしてもよい。そうした場合、このルリグをアップする。',
      } as GrantLrigAbilityAction,
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-057 出弓　セフィラム
  // 【出】：あなたのデッキの一番上を見る。
  //         それがLv.2以下のシグニで自分の場に他のシグニがない場合、それを場に出してもよい。
  'WX01-057': [
    {
      effectId: 'WX01-057-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'LOOK_AND_REORDER',
            source: { location: 'deck', owner: 'self' },
            count: 1,
            private: true,
            reorder: false,
            destination: { location: 'deck', owner: 'self', position: 'top' },
          },
          {
            // 条件：デッキトップがLv.2以下のシグニ かつ 自分の場に他のシグニがない（自身のみ=1体）
            type: 'CONDITIONAL',
            condition: {
              type: 'AND',
              conditions: [
                { type: 'DECK_TOP_MATCHES', owner: 'self', filter: { cardType: 'シグニ', level: { max: 2 } } },
                { type: 'FIELD_COUNT', owner: 'self', operator: 'eq', value: 1 },
              ],
            },
            then: {
              type: 'CHOOSE',
              choose_count: 1,
              choices: [
                {
                  choiceId: 'yes',
                  label: 'デッキトップを場に出す',
                  action: { type: 'ADD_TO_FIELD', owner: 'self' },
                },
                {
                  choiceId: 'no',
                  label: '場に出さない',
                  action: { type: 'SEQUENCE', steps: [] },
                },
              ],
            } as ChooseAction,
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK09-TK-01A 改造素材（アーツ/クラフト・改造素材機構 Step2）
  // このターン改造素材使用不可 + ＜電機＞シグニ1体を対象に①+4000 ②《緑》で起動付与 ③《緑×2》で自動付与 から1つ選択。
  // 各選択は対象＜電機＞シグニを選択（lastProcessedCards にセット）→効果適用→MARK_MATERIAL_TARGET で対象を記録。
  // 記録された対象に対し BattleScreen が ON_MATERIAL_USED（self/any_ally）を発火する（Step3b）。
  'WXK09-TK-01A': [
    {
      effectId: 'WXK09-TK-01A-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'BLOCK_CARD_USE', cardName: '改造素材' },
          { type: 'CHOOSE', choose_count: 1, from_count: 3, choices: [
            // ①＜電機＞シグニ1体のパワーを+4000（ターン終了時まで）
            { choiceId: 'c0', label: '＜電機＞シグニのパワー+4000',
              action: { type: 'SEQUENCE', steps: [
                { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '電機' } }, delta: 4000, duration: 'UNTIL_END_OF_TURN' },
                { type: 'STUB', id: 'MARK_MATERIAL_TARGET' },
              ] } },
            // ②《緑》を払い、＜電機＞シグニ1体に「【起】《ダウン》：より低パワーの相手シグニ1体をバニッシュ」を付与
            { choiceId: 'c1', label: '《緑》で起動能力を付与',
              action: { type: 'SEQUENCE', steps: [
                { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['緑'] },
                { type: 'GRANT_EFFECT', duration: 'UNTIL_END_OF_TURN',
                  target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '電機' } },
                  effect: { effectId: 'WXK09-TK-01A-G2', effectType: 'ACTIVATED', timing: ['MAIN'], cost: { down_self: true },
                    action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerLtSelf: true } } },
                    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL' } },
                { type: 'STUB', id: 'MARK_MATERIAL_TARGET' },
              ] } },
            // ③《緑》《緑》を払い、＜電機＞シグニ1体に「【自】《ターン1回》：アタックしたとき、このシグニをアップ」を付与
            { choiceId: 'c2', label: '《緑》《緑》で自動能力を付与',
              action: { type: 'SEQUENCE', steps: [
                { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['緑', '緑'] },
                { type: 'GRANT_EFFECT', duration: 'UNTIL_END_OF_TURN',
                  target: { type: 'SIGNI', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', story: '電機' } },
                  effect: { effectId: 'WXK09-TK-01A-G3', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'], usageLimit: 'once_per_turn',
                    action: { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
                    duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL' } },
                { type: 'STUB', id: 'MARK_MATERIAL_TARGET' },
              ] } },
          ] },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P11-TK01 白羅星姫　サタン（レゾナクラフト）
  // 🏁**2026-09-02（索引C 第10巡）に manual 定義ごと撤去した。**
  //   旧 manual は `STUB{OPP_ZONE_PLACEMENT_RESTRICT}`＝engine では「中央のシグニゾーンにレベル3以上を
  //   置けない」（`WXDi-P14-068` 用の**別機構**）として読まれ、**原文の体数制限（2体まで）は1件も効いて
  //   いなかった**（`O-94`② の作業中に発見）。
  //   正しい形＝`STUB{DEPLOY_RESTRICT{kind:'count',cap:2,subject:'opponent'}}` は**parser が既に出している**
  //   ので、§6.4 `O-42` の規約どおり影武者コピーを残さず parser に任せる
  //   （残すとこのカードだけ以後の parser 改善が永久に届かない）。

  // PR-Di017A 白熱する黒白（スペル）
  // カードを2枚引く。ライフクロスが1枚以下の場合、チェックゾーンのカードを裏返して場に出す（REV）
  'PR-Di017A': [
    {
      effectId: 'PR-Di017A-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 2 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: 2 },
          { type: 'STUB', id: 'PLACE_REV_SIGNI', value: 'PR-Di017B' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // 🏁**PR-Di017B（REV:アンコーリング）の手書きは §5.3 `O-221` 第1バッチ（2026-09-02）で削除した。**
  // 🔴**parser のほうが正しくなっていたのに、この手書きが `mergeManualEffects` で常に勝って
  //   古い形を永久に凍らせていた**（`STUB{TARGET_ONLY}` ＋ `costText` だけの `OPTIONAL_COST`
  //   ＝**帰結の「それをトラッシュに置く」が丸ごと無い**＝過小実行。timing も `ATTACK`（起動用）で
  //   原文の「アタックフェイズ開始時」＝`ON_ATTACK_PHASE_START` と違っていた）。
  // ⇒ いまの parser は `SELECT_TARGET_ONLY → STORE → OPTIONAL_COST{handDiscard:3} →
  //   CONDITIONAL{PAID_ADDITIONAL_COST} → TRASH{targetsStored}` を出す（`O-96` の正準形）。
  // 🔑**教訓＝手書きは「そのとき parser が解けなかった」記録であって、恒久的な正ではない。**
  //   `censusManualDrift` の「削除候補」は**実体同一**のものしか出さないので、
  //   **parser が追い越した手書きはどの計器にも出ない**（§6.3 K の既知乖離リストにだけ残っていた）。

  // 🏁**WXDi-P14-TK04（フェゾーネマジック・深緑）の手書きは削除した**（2026-09-03 §5.3 `O-60` 第35バッチ）。
  //   すぐ上の教訓の実例＝**parser が追い越していた**。いまの parser は
  //   `SEQUENCE[ENERGY_CHARGE_FROM_DECK, ADD_TO_FIELD{source:{ENERGY_CARD, upToCount:true}}]` を出す
  //   （原文「シグニを**１枚まで**」＝任意）のに対し、手書きは `STUB{SUMMON_FROM_ENERGY}` で
  //   **必ず1枚出させる**（`selectOrInteract(..., optional=false)`）過剰実行だった。

  // WXDi-P09-TK03A コードイート　オンタマ（アクセクラフト）
  // 『【常】：これにアクセされているシグニが場を離れる場合、代わりにこれをゲームから除外してもよい。そうした場合、そのシグニをダウンする。』
  'WXDi-P09-TK03A': [
    {
      effectId: 'WXDi-P09-TK03A-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'ACCE_BANISH_SUBSTITUTE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX25-P2-TK05 蒼穹将姫　ニヴルヘイム（シグニ/レゾナクラフト）
  // 【常】：対戦相手はドローフェイズの間にカードを合計１枚までしか引けない。
  // 【自】：このシグニが場を離れたとき、カードを２枚引くか、対戦相手は手札を２枚捨てる。
  'WX25-P2-TK05': [
    {
      effectId: 'WX25-P2-TK05-E1',
      effectType: 'CONTINUOUS',
      appearanceCondition: {"rawText":"《メインフェイズアイコン》手札とエナゾーンからシグニを合計２枚トラッシュに置く","timings":["MAIN"],"cost":{},"combinedTrash":{"zones":["hand","energy"],"count":2,"filter":{"cardType":"シグニ"}},"paymentShape":"REQUIRES_NEW_FLOW"},
      action: { type: 'STUB', id: 'OPP_DRAW_LIMIT_PER_TURN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX25-P2-TK05-E2',
      effectType: 'AUTO',
      // 🔴2026-08-31 続き747＝旧 `['ON_BANISH']`＝**バニッシュされたときにしか発火しない**
      //   （手札に戻る・エナに置かれる・トラッシュに置かれる離脱で黙って落ちる）。
      //   原文は「このシグニが**場を離れたとき**」＝`ON_LEAVE_FIELD`（`triggerScope` 無し＝自身）。
      timing: ['ON_LEAVE_FIELD'],
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'draw2',
            label: 'カードを２枚引く',
            action: { type: 'DRAW', owner: 'self', count: 2 } as import('../types/effects').DrawAction,
          },
          {
            choiceId: 'opp_discard2',
            label: '対戦相手は手札を２枚捨てる',
            action: {
              type: 'TRASH',
              target: { type: 'HAND_CARD', owner: 'opponent', count: 2 },
            } as import('../types/effects').TrashAction,
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX08-005 エナゾーン以外の領域にあるカードは白になる（CONTINUOUS）
  'WX08-005': [
    {
      effectId: 'WX08-005-E1',
      effectType: 'CONTINUOUS',
      appearanceCondition: {"rawText":"《メインフェイズアイコン》レゾナ１体をあなたの場からルリグトラッシュに置き、レゾナではないレベル３以上のシグニ１体をあなたの場からトラッシュに置く","timings":["MAIN"],"cost":{"fieldToLrigTrash":{"count":1,"filter":{"cardType":"レゾナ"}},"fieldTrash":{"count":1,"filter":{"cardType":"シグニ","level":{"min":3},"excludeResona":true}}},"paymentShape":"REQUIRES_NEW_FLOW"},
      action: { type: 'STUB', id: 'CARDS_OUTSIDE_ENERGY_BECOME_WHITE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX08-006 対戦相手は【チャーム】が付いているシグニの【起】能力を使用できない（CONTINUOUS）
  'WX08-006': [
    {
      effectId: 'WX08-006-E1',
      effectType: 'CONTINUOUS',
      appearanceCondition: {"rawText":"《メインフェイズアイコン》レゾナではない＜凶蟲＞のシグニ２体をあなたの場からトラッシュに置く","timings":["MAIN"],"cost":{"fieldTrash":{"count":2,"filter":{"cardType":"シグニ","story":"凶蟲","excludeResona":true}}},"paymentShape":"SINGLE_ZONE"},
      action: { type: 'STUB', id: 'RESTRICT_CHARMED_SIGNI_ACTIVATED' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX08-029 （クロス時）あなたのエナゾーンからカード１枚を手札に加えてもよい（AUTO / ON_HEAVEN）
  'WX08-029': [
    {
      effectId: 'WX08-029-E3',
      effectType: 'AUTO',
      timing: ['ON_HEAVEN'],
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
      crossOnly: true,
    },
  ],

  // WX10-006 このシグニがアタックしたとき、あなたのエナゾーンからカード１枚を手札に加えてもよい（AUTO / ON_ATTACK_SIGNI）
  'WX10-006': [
    {
      effectId: 'WX10-006-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      appearanceCondition: {"rawText":"《メインフェイズアイコン》レゾナではない＜遊具＞のシグニ３体をあなたの場からトラッシュに置く","timings":["MAIN"],"cost":{"fieldTrash":{"count":3,"filter":{"cardType":"シグニ","story":"遊具","excludeResona":true}}},"paymentShape":"SINGLE_ZONE"},
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX14-017 あなたのエナゾーンにある無色ではないカードはすべての色を持つ（CONTINUOUS）
  'WX14-017': [
    {
      effectId: 'WX14-017-E1',
      effectType: 'CONTINUOUS',
      appearanceCondition: {"rawText":"《メインフェイズアイコン》レゾナではない＜植物＞のシグニ２体をあなたの場からトラッシュに置く","timings":["MAIN"],"cost":{"fieldTrash":{"count":2,"filter":{"cardType":"シグニ","story":"植物","excludeResona":true}}},"paymentShape":"SINGLE_ZONE"},
      action: { type: 'STUB', id: 'ENERGY_NON_COLORLESS_ALL_COLORS' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXEX1-26 対戦相手のセンタールリグの基本リミットは５になる（CONTINUOUS）
  'WXEX1-26': [
    {
      effectId: 'WXEX1-26-E1',
      effectType: 'CONTINUOUS',
      appearanceCondition: {"rawText":"《メインフェイズアイコン》《アタックフェイズアイコン》合計５枚のレゾナではない＜宇宙＞のシグニをあなたのエナゾーンと場からトラッシュに置く","timings":["MAIN","ATTACK"],"cost":{},"combinedTrash":{"zones":["energy","field"],"count":5,"filter":{"cardType":"シグニ","story":"宇宙","excludeResona":true}},"paymentShape":"REQUIRES_NEW_FLOW"},
      action: { type: 'STUB', id: 'OPP_CENTER_LRIG_LIMIT_SET_5' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-CP02-TK01A ペロロ人形（シグニ/クラフト）
  // 【常】：対戦相手のシグニが正面にアタックする場合、代わりにこのシグニのあるシグニゾーンにアタックする。
  // 【常】：アップ状態のこのシグニがバトルか対戦相手の効果によって場を離れる場合、代わりにこのシグニをダウンしてもよい。
  // 【自】：対戦相手のターン終了時、このシグニをゲームから除外する。
  'WXDi-CP02-TK01A': [
    {
      effectId: 'WXDi-CP02-TK01A-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'REDIRECT_ATTACK_TO_SELF_ZONE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_WITH_DOWN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E3',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      // 「対戦相手のターン終了時」＝相手のターン境界に反応（curated JSON は any_opp を持つ。
      // ここに無いと build:effects の fresh が triggerScope を落とす＝続き77 Sonnet観測(c)）
      triggerScope: 'any_opp',
      action: { type: 'STUB', id: 'REMOVE_SELF_SIGNI_FROM_GAME' } as import('../types/effects').StubAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX08-022 【起】手札を１枚捨てる。そうした場合、あなたのデッキの上からカードを２枚エナゾーンに置く。
  // 「手札を捨てる」はコスト扱いにして、手札がない場合は起動不可にする
  'WX08-022': [
    {
      effectId: 'WX08-022-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { discard: 1 },
      action: {
        type: 'ENERGY_CHARGE_FROM_DECK',
        owner: 'self',
        count: 2,
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],


  // WX22-016 グレイブ・ディガー（ベット―好きな枚数）
  // ベットのコイン1枚につき2択（①コスト減 ②効果1回繰り返し）。パーサーは多択ベットを
  // BET_MECHANIC stub 化するため、CHOOSE 構造を保持するマニュアル上書き。
  //
  // 🔴**2026-08-17（続き533・§6.4 O-11）で3点を是正**：
  //  ①**アーツの本体が選択肢②の中に埋まっていた**＝原文の「対象の対戦相手のシグニ１体をバニッシュし、
  //    あなたのトラッシュから対象の＜遊具＞のシグニ１枚を手札に加える。」は①②のあとに書かれた**本体**で、
  //    ベットしてもしなくても走る。旧構造では**②を選んだときしか走らず**、
  //    ベット0枚（＝ベットは任意）では**カードが何もしない**状態だった。→ CHOOSE の**兄弟**へ出す。
  //  ②**バニッシュが丸ごと落ちていた**（連用形チェーンの脱落）＝手札回収だけが残っていた。
  //  ③**トラッシュ回収の ＜遊具＞ 限定が落ちていた**＝トラッシュのどのシグニでも拾える過剰実行。
  // 🔑選択数は原文どおり「ベットした《コインアイコン》1枚につき1つ」＝`countChoose{$ref:'bet_coins_paid'}`
  //   （§6.4 O-11 続き532 で入れた汎用受け皿。ベット0枚なら選択自体が起きず本体だけが走る）。
  // 🆕**2026-08-17（§6.4 O-29）で「同じ選択肢を２回以上選んでもよい」を表せるようになった**＝
  //   `ChooseAction.allowRepeat`（UI が回数マップへ切り替わる。engine の `resumeChoose` は元から
  //   `['c1','c1']` を受けられた＝穴は UI が `Set<string>` だったこと）。
  //   ⇒ 旧「実質 `upTo` で最大2つ（相異なる）に丸まる過少近似」を解消。
  // 🔑**②「このアーツの効果を一度繰り返す」は本体そのものを action に持たせる**＝
  //   `STUB{REPEAT_EFFECT}`（engine ではログだけの**無言 no-op**）を置き換えた。
  //   `allowRepeat` で②をN回選べば本体がN回**追加で**走る（基底の1回は下の兄弟ステップ）。
  // ⚠**解決順は「追加ぶん → 基底」**になる（CHOOSE が SEQUENCE の先頭にあるため）。このカードの本体は
  //   「相手シグニ1体バニッシュ＋トラッシュから＜遊具＞1枚回収」で**順序に依存しない**ので影響しない。
  //   順序が意味を持つ本体を持つカードが出たら、基底を CHOOSE より前へ出すこと。
  'WX22-016': [
    {
      effectId: 'WX22-016-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '黒', count: 6 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            upTo: true,
            // ベットした《コインアイコン》1枚につき1つ（0枚＝選択なし）
            countChoose: { count: { $ref: 'bet_coins_paid' }, upTo: true },
            // 「同じ選択肢を２回以上選んでもよい」（§6.4 O-29）
            allowRepeat: true,
            choices: [
              {
                choiceId: 'c0',
                label: 'このアーツの使用コストは《黒×3》減る',
                action: { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' },
              },
              {
                choiceId: 'c1',
                label: 'このアーツの効果を一度繰り返す',
                // ⚠**本体と同じ木**（下の兄弟ステップと一致させること）＝ここがズレると
                //   「繰り返し」が本体と違う挙動になる。
                action: {
                  type: 'SEQUENCE',
                  steps: [
                    {
                      type: 'BANISH',
                      target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
                    },
                    {
                      type: 'TRANSFER_TO_HAND',
                      source: {
                        type: 'TRASH_CARD',
                        owner: 'self',
                        count: 1,
                        upToCount: false,
                        filter: { cardType: 'シグニ', story: '遊具' },
                      },
                    },
                  ],
                },
              },
            ],
          },
          // ここから下が**アーツの本体**（①②の選択とは独立に必ず走る）
          {
            type: 'BANISH',
            target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } },
          },
          {
            type: 'TRANSFER_TO_HAND',
            source: {
              type: 'TRASH_CARD',
              owner: 'self',
              count: 1,
              upToCount: false,
              filter: { cardType: 'シグニ', story: '遊具' },
            },
          },
        ],
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WD21-007 自由自罪（ベット―《コイン》《コイン》）
  // 5択から1つ選び対象シグニに付与、ベット時もう1回。パーサーは多択ベットを
  // BET_MECHANIC stub 化するため、GRANT_QUOTED_AUTO_ABILITY stub を保持する上書き。
  'WD21-007': [
    {
      effectId: 'WD21-007-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK', 'SPELL_CUTIN'],
      cost: { energy: [{ color: '赤', count: 2 }] },
      action: { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WD19-018 ラブリー・バイオ（スペル）
  // 以下の２つから１つを選ぶ。
  // ①自分の＜微菌＞のシグニ１体をバニッシュ → 相手シグニゾーン１つにウィルスを置く
  // ②自分の＜微菌＞のシグニ１体をバニッシュ → 相手シグニ１体のパワーを－7000（ターン終了時まで）
  'WD19-018': [
    {
      effectId: 'WD19-018-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '黒', count: 0 }] },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'c0',
            label: '①自分の＜微菌＞シグニをバニッシュ→ウィルス',
            action: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'BANISH',
                  target: {
                    type: 'SIGNI',
                    owner: 'self',
                    count: 1,
                    filter: { cardType: 'シグニ', cardClass: '微菌' },
                    upToCount: false,
                  },
                },
                {
                  type: 'PLACE_VIRUS',
                  targetOwner: 'opponent',
                  zoneCount: 1,
                  virusCount: 1,
                },
              ],
            },
          },
          {
            choiceId: 'c1',
            label: '②自分の＜微菌＞シグニをバニッシュ→相手シグニ－7000',
            action: {
              type: 'SEQUENCE',
              steps: [
                {
                  type: 'BANISH',
                  target: {
                    type: 'SIGNI',
                    owner: 'self',
                    count: 1,
                    filter: { cardType: 'シグニ', cardClass: '微菌' },
                    upToCount: false,
                  },
                },
                {
                  type: 'POWER_MODIFY',
                  target: {
                    type: 'SIGNI',
                    owner: 'opponent',
                    count: 1,
                    filter: { cardType: 'シグニ' },
                    upToCount: false,
                  },
                  delta: -7000,
                },
              ],
            },
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // ===== F-2: 引用付与トリガー能力のフラット化誤解析の修正（CONTINUOUS TRASH → 条件付き/付与トリガー） =====

  // WX06-029 コードアート　Ｏ・Ｓ・Ｓ
  // 【常】：あなたのセンタールリグが青で、このシグニが中央のシグニゾーンにあるかぎり、
  //         このシグニは「【自】：このシグニがアタックしたとき、対戦相手は手札を１枚捨てる。」を得る。
  // 旧パース＝CONTINUOUS TRASH HAND_CARD（calcContinuousSigniMutations を通らず no-op）。
  // 「〜であるかぎり『【自】アタック時…』を得る」型は condition 付き AUTO ON_ATTACK_SIGNI として表現
  //（BattleScreen の ON_ATTACK_SIGNI 収集が evalUseCondition で発動条件を評価する既存パターン）。
  'WX06-029': [
    {
      effectId: 'WX06-029-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: {
        type: 'AND',
        conditions: [
          { type: 'LRIG_COLOR', owner: 'self', color: '青' },
          { type: 'THIS_CARD_IN_CENTER_ZONE' },
        ],
      },
      action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P04-082 凶将　ブルータス
  // 【常】：このシグニは中央のシグニゾーンにあるかぎり、
  //         「【自】：このシグニがアタックしたとき、あなたか対戦相手のデッキの上からカードを４枚トラッシュに置く。」を得る。
  // 旧パース＝CONTINUOUS TRASH DECK_CARD self（no-op）。中央条件付き AUTO ON_ATTACK_SIGNI＋CHOOSE（自/相手デッキ）。
  'WXDi-P04-082': [
    {
      effectId: 'WXDi-P04-082-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'THIS_CARD_IN_CENTER_ZONE' },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'self_deck', label: 'あなたのデッキの上から４枚をトラッシュ', action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 4 } } },
          { choiceId: 'opp_deck', label: '対戦相手のデッキの上から４枚をトラッシュ', action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: 4 } } },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ===== THE DOOR 自ゲート（own_gate_zones）=====
  // 【ゲート】は自分のシグニゾーンに置くマーカー（signi_gate_zones=相手ゾーンのアタック妨害ゲートとは別概念）。
  // 配置：防衛者ルリグの【起】が「あなたのシグニゾーンに【ゲート】を置く」。旧パースは相手ゲートのSTUB GATEに
  // 誤マッピングされていた（THE DOOR防衛者なのに相手ゾーンに設置）ため PLACE_OWN_GATE に修正。

  // WXDi-P15-010 防衛者MC.LION-3rd（ルリグ）: E3【起】《ゲーム1回》《白×0》：あなたのシグニゾーン1つに【ゲート】1つを置く。
  'WXDi-P15-010': [
    {
      effectId: 'WXDi-P15-010-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '白', count: 0 }] },
      action: { type: 'STUB', id: 'PLACE_OWN_GATE' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-011 プロフェッサー 防衛者Dr.タマゴ（ルリグ）: E3【起】《ゲーム1回》《青×0》：あなたのシグニゾーン1つに【ゲート】1つを置く。
  'WXDi-P15-011': [
    {
      effectId: 'WXDi-P15-011-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 0 }] },
      action: { type: 'STUB', id: 'PLACE_OWN_GATE' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-076 コードメイズ ムジカ//THE DOOR
  // E1【常】：このシグニは同じシグニゾーンに【ゲート】があるかぎり、「【自】：あなたのターン終了時、対戦相手のシグニ1体をトラッシュに置く。」を得る。
  //   → condition SAME_ZONE_HAS_GATE 付きの ON_TURN_END AUTO（collectTurnTriggers が evalUseCondition で評価）。旧パース＝CONTINUOUS TRASH（no-op）。
  // E2【常】：あなたの場に【ゲート】があるかぎり、このシグニのパワーは＋5000される。
  //   → CONTINUOUS POWER_MODIFY self に activeCondition FIELD_HAS_GATE を付与（count!=='ALL'＝効果元のみ）。
  'WXDi-P15-076': [
    {
      effectId: 'WXDi-P15-076-E1',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-076-E2',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta: 5000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-082 蒼魔 バン//THE DOOR
  // E1【常】：このシグニは同じシグニゾーンに【ゲート】があるかぎり、「【自】：あなたのアタックフェイズ開始時、対戦相手は手札を1枚捨てる。」を得る。
  //   → condition SAME_ZONE_HAS_GATE 付きの ON_ATTACK_PHASE_START AUTO。相手捨ては TRASH HAND_CARD opponent（opponentResponds＝相手が選ぶ）。旧パース＝CONTINUOUS TRASH（no-op）。
  // E2【自】：あなたのターン終了時、【ゲート】があるあなたのシグニゾーンの正面にある対戦相手のシグニ1体を対象とし、それをデッキの一番下に置く。
  //   → ON_TURN_END AUTO。TRANSFER_TO_DECK（position:bottom, shuffle:false）source SIGNI opponent filter frontOfGateZone（execTransferToDeck が解決）。旧パース＝GRANT_KEYWORD「ゲート」（誤り）。
  'WXDi-P15-082': [
    {
      effectId: 'WXDi-P15-082-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-082-E2',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      action: {
        type: 'TRANSFER_TO_DECK',
        source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', frontOfGateZone: true }, upToCount: false },
        shuffle: false,
        position: 'bottom',
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ===== F-2 身代わり置換型（バトルバニッシュ経路の置換チェーンに配線）=====

  // WXDi-P06-034 紅将姫 クーフーリン（ライズ・武勇）
  // E1【常】：このシグニがバニッシュされる場合、代わりに「アップ状態のこのシグニをダウンし、下から1枚＋エナから1枚をトラッシュ」をしてもよい。
  //   → CONTINUOUS STUB BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY（BattleScreen のバトルバニッシュ置換チェーンが処理。払える＝アップ/下カード有/エナ有なら自動適用）。旧＝CONTINUOUS TRASH ENERGY（no-op誤り）。
  //   ※効果バニッシュ（execBanish 経路）は未対応＝バトルバニッシュのみの近似。
  'WXDi-P06-034': [
    {
      effectId: 'WXDi-P06-034-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK05-024 魔界の末娘 アナスタシア（悪魔）
  // E1【常】：あなたの＜悪魔＞のシグニは場から手札に戻らない。→ STUB SIGNI_CANT_BOUNCE_FROM_FIELD（実装済・パーサー生成を維持）。
  // E2【常】：このシグニが場を離れる場合、代わりにこのシグニをゲームから除外する。
  //   → CONTINUOUS STUB BATTLE_LEAVE_REPLACE_WITH_EXILE（バトルバニッシュ時にエナでなくトラッシュへ＝除外をトラッシュで近似。REMOVE_SELF_SIGNI_FROM_GAME と同じ近似方針）。旧＝CONTINUOUS TRASH（no-op誤り）。
  //   ※効果バニッシュ/バウンス等の場離れは未対応＝バトルバニッシュのみの近似。
  // E3（トラッシュ発動の【起】）はパーサー生成を維持（トラッシュ発動機構が要るため近似・別途）。
  'WXK05-024': [
    {
      effectId: 'WXK05-024-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_WITH_EXILE' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ===== THE DOOR ゲート参照シグニ（F-4・バッチA。基盤は own_gate_zones / SAME_ZONE_HAS_GATE / FIELD_HAS_GATE）=====

  // WXDi-P15-080 蒼天 ヒラナ//THE DOOR
  // 【常】：同じシグニゾーンに【ゲート】があるかぎり「【自】APS開始時、相手シグニ1体のパワーをターン終了時まで-3000」を得る。
  // 旧パース＝CONTINUOUS POWER_MODIFY opponent -3000（常時誤り）。condition SAME_ZONE_HAS_GATE 付き ON_ATTACK_PHASE_START AUTO に修正。
  'WXDi-P15-080': [
    {
      effectId: 'WXDi-P15-080-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -3000 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-081 羅石 レイ//THE DOOR
  // E1【常】：同じゾーンにゲートあるかぎり「【自】APS開始時、カード1枚引く」を得る。→ condition SAME_ZONE_HAS_GATE 付き AUTO。
  // E2【出】：場にゲートがある場合、デッキ上3枚を見て並べ替え。→ CONDITIONAL(FIELD_HAS_GATE){then: LOOK_AND_REORDER}。
  //   ⚠原文は「好きな枚数を…デッキの一番下に置き、**残りを**…デッキの一番上に戻す」＝プレイヤーが振り分ける形。
  //   position:'bottom' だと**見た3枚すべてがデッキ下**へ行き、上に残す選択が消える（G168 の split_top_bottom が正）。
  'WXDi-P15-081': [
    {
      effectId: 'WXDi-P15-081-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'DRAW', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-081-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'CONDITIONAL',
        condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
        then: { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 3, private: true, reorder: true, canTrash: false, destination: { location: 'deck', owner: 'self', position: 'split_top_bottom' } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-077 幻怪 エクス//THE DOOR
  // E1【常】：このシグニと同じシグニゾーンに【ゲート】があるかぎり、このシグニのパワーは＋10000される。
  //   → CONTINUOUS POWER_MODIFY self に activeCondition SAME_ZONE_HAS_GATE 付与（count!=='ALL'＝効果元のみ）。
  // E2【出】《白》look5（無条件）と BURST はパーサー生成を維持（override しない）。
  'WXDi-P15-077': [
    {
      effectId: 'WXDi-P15-077-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta: 10000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],


  // WXDi-P15-078 爆砲 WOLF//THE DOOR
  // E1【常】：同じゾーンにゲートあるかぎり「【自】APS開始時、【エナチャージ1】」を得る。→ condition SAME_ZONE_HAS_GATE 付き AUTO。
  // E2【自】APS開始時、場にゲートがある場合、相手シグニ1体を対象とし、このターンそれがバトルでバニッシュされるならエナでなくトラッシュへ。
  //   → 旧パースは count:ALL かつゲート条件欠落。condition FIELD_HAS_GATE 付与＋count 1 に修正。
  'WXDi-P15-078': [
    {
      effectId: 'WXDi-P15-078-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-078-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: { type: 'BANISH_REDIRECT', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, redirectTo: 'trash', until: 'END_OF_TURN', battleOnly: true },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 バッチB -----

  // WXDi-P15-059 羅星姫 ノヴァ//THE DOOR
  // E1【自】APS開始時、場にゲートがある場合、カード2枚引き手札1枚捨てる。→ condition FIELD_HAS_GATE 付与（既存 SEQUENCE は条件欠落）。
  // E2【自】アタックしたとき、相手は手札1枚捨てる。同ゾーンにゲートがある場合、追加で相手は手札1枚捨てる。
  //   → 旧パースは2枚とも無条件。SEQUENCE[相手捨て1, CONDITIONAL(SAME_ZONE_HAS_GATE){相手捨て1}] に修正。
  'WXDi-P15-059': [
    {
      effectId: 'WXDi-P15-059-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: { type: 'SEQUENCE', steps: [
        { type: 'DRAW', owner: 'self', count: 2 },
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-059-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
        { type: 'CONDITIONAL', condition: { type: 'SAME_ZONE_HAS_GATE' }, then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P16-074 幻怪 ナナシ//THE DOOR（古代兵器）
  // E1【常】：同ゾーンゲートで「【自】APS開始時、相手シグニ1体を対象とし、《無》を支払ってもよい。そうしたらターン終了時まで-5000」を得る。
  //   → condition SAME_ZONE_HAS_GATE 付き AUTO＋OPTIONAL_COST(無)→PAID_ADDITIONAL_COST ゲートで -5000。旧＝CONTINUOUS POWER_MODIFY 常時誤り。
  // E2【自】《ターン1回》：同じシグニゾーンに【ゲート】があるあなたのシグニ1体がバニッシュされたとき、対戦相手は手札を1枚捨てる。
  //   → AUTO ON_BANISH、triggerScope any_ally（自分の他シグニ被バニッシュ＝collectBanishTriggers section2/3）、usageLimit once_per_turn、
  //     condition FIELD_HAS_GATE owner self（「同ゾーンゲート」は被バニッシュシグニの離場後ゾーン参照が要るため場ゲート有で近似）。
  //     collectBanishTriggers に condition/usageLimit 評価を新設（v0.400・ON_BANISH any_ally 効果は既存ゼロで影響なし）。旧＝scope self・条件/回数なしの過少発火。
  'WXDi-P16-074': [
    {
      effectId: 'WXDi-P16-074-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      // 🆕**§5.3 `O-96` 第11バッチ（2026-09-02）＝対象宣言を支払いより前へ**
      //   原文「対戦相手のシグニ１体を**対象とし**、《無》を支払って**もよい**。**そうした場合**、〜」。
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, abortIfNoCandidate: true },
        { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' },
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -5000, targetsStored: true } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P16-074-E2',
      effectType: 'AUTO',
      timing: ['ON_BANISH'],
      triggerScope: 'any_ally',
      usageLimit: 'once_per_turn',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 バッチC（inGateZone フィルタ＝同ゾーンゲートのシグニへの場全体付与）-----

  // WXDi-P16-062 コードライド マキナ//THE DOOR（乗機）
  // E1【常】：同ゾーンゲートで「【自】各APS開始時、相手シグニ1体を対象とし、相手が《無》を払わないかぎりターン終了時まで能力を失う」を得る。
  //   §6.4 O-10（続き508）で defer 解体。⚠**新機構は要らなかった**＝原文 regex（「同じシグニゾーンに【ゲート】」）
  //   で数え直すと同族は **20効果**あり、**18効果は既に「引用を平らにして `condition:SAME_ZONE_HAS_GATE` を
  //   持つ AUTO/CONTINUOUS」で実装済み**（`WXDi-P15-076`／`-078`／`-080`〜`-082`／`WXDi-P16-070`／`-074` 等）。
  //   この1件だけが取り残されていた＝**同じ書き方に揃えるだけ**でよい。
  //   「対戦相手が《無》を支払わないかぎり」は O-31 の正準形
  //   `SEQUENCE[STUB{OPPONENT_PAY_OPTIONAL}, CONDITIONAL{IS_MY_TURN}→本体]`（`WXDi-P05-023-E2` と同形）。
  //   ⚠「**各**アタックフェイズ開始時」＝`triggerScope:'any'`（自分のターンだけの `'self'` にしない）。
  // E2【常】：同じシグニゾーンに【ゲート】があるあなたのシグニのパワーを＋2000する。
  //   → CONTINUOUS POWER_MODIFY self ALL に inGateZone フィルタ（own_gate_zones のゾーンのシグニのみ）。
  'WXDi-P16-062': [
    {
      effectId: 'WXDi-P16-062-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'any',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'OPPONENT_PAY_OPTIONAL', costColors: ['無'] },
          {
            type: 'CONDITIONAL',
            condition: { type: 'IS_MY_TURN' },
            then: {
              type: 'REMOVE_ABILITIES',
              target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false },
              until: 'UNTIL_END_OF_TURN',
            },
          },
        ],
      },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P16-062-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', inGateZone: true } }, delta: 2000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 バッチD -----

  // WXDi-P15-057 幻獣神 LOVIT//THE DOOR（地獣）
  // E1【常】：このシグニと同じシグニゾーンに【ゲート】があるかぎり、このシグニのパワーは＋3000され、「【常】：対戦相手のターンの間【シャドウ】」を得る。
  //   → E1=CONTINUOUS POWER_MODIFY self +3000 に activeCondition SAME_ZONE_HAS_GATE（旧＝常時+3000）。
  //     E1b=相手ターン中シャドウ＝CONTINUOUS GRANT_KEYWORD シャドウ self に activeCondition AND[SAME_ZONE_HAS_GATE, TURN_OWNER opponent]
  //     （execUtils の hasCondShadow が activeCondition 付き self シャドウを評価。v0.400 で本実装）。
  // E2【自】ターン終了時、場ゲートがある場合、トラッシュから《ガードアイコン》シグニ1枚を対象、《無》を払ってもよい。払えば手札に加える。
  //   → AUTO ON_TURN_END、condition FIELD_HAS_GATE、SEQUENCE[OPTIONAL_COST(無), CONDITIONAL(PAID){TRANSFER_TO_HAND from trash hasGuard}]。旧＝GRANT_KEYWORD誤り。
  'WXDi-P15-057': [
    {
      effectId: 'WXDi-P15-057-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta: 3000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-057-E1b',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'AND', conditions: [{ type: 'SAME_ZONE_HAS_GATE' }, { type: 'TURN_OWNER', owner: 'opponent' }] },
      action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'シャドウ', duration: 'PERMANENT' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-057-E2',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      // 🆕**§5.3 `O-96` 第11バッチ（2026-09-02）＝対象宣言を支払いより前へ**
      //   原文「あなたのトラッシュから《ガードアイコン》を持つシグニ１枚を**対象とし**、《無》を
      //   支払って**もよい**。**そうした場合、それを**手札に加える」。
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', hasGuard: true } }, abortIfNoCandidate: true },
        { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' },
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', hasGuard: true } }, targetsStored: true } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 バッチE（POWER_MODIFY_PER_HAND_COUNT 新設）-----

  // WXDi-P16-070 アイン＝サンガ//THE DOOR（毒牙）
  // E1【常】：同ゾーンゲートで「【自】ターン終了時、相手シグニ1体をデッキの一番下に置く」を得る。
  //   → condition SAME_ZONE_HAS_GATE 付き ON_TURN_END AUTO＋TRANSFER_TO_DECK（旧＝CONTINUOUS TRANSFER_TO_DECK no-op）。
  // E2【自】ターン終了時、場ゲートがある場合、自シグニ1体を対象とし、次の相手ターン終了時まで手札1枚につき+1000。
  //   → condition FIELD_HAS_GATE 付き ON_TURN_END AUTO＋POWER_MODIFY_PER_HAND_COUNT（UNTIL_OPP_TURN_END・スナップショット）。旧＝STUB GATE 誤パース（有害＝相手ゲート設置）を無害化。
  'WXDi-P16-070': [
    {
      effectId: 'WXDi-P16-070-E1',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, shuffle: false, position: 'bottom' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P16-070-E2',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: { type: 'POWER_MODIFY_PER_HAND_COUNT', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, deltaPerCard: 1000, handOwner: 'self', until: 'UNTIL_OPP_TURN_END' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-056 コードハート Lスピーカ//THE DOOR（電機）
  // E1【常】：同ゾーンゲートで「【自】アタックしたとき、LIONがいれば《白》《白》払えばアップ＋ターン終了時まで能力喪失」を得る。
  //   → condition SAME_ZONE_HAS_GATE の AUTO ON_ATTACK_SIGNI＋任意《白白》→ payすればこのシグニのみ能力喪失（thisCardOnly REMOVE_ABILITIES）。
  //     「LIONがいれば」「このシグニをアップ（再攻撃）」は近似省略。旧＝CONTINUOUS REMOVE_ABILITIES self（自分の能力を常時消す有害誤り）を解消。
  // E2【自】APS開始時、次の相手ターン終了時まで、同ゾーンゲートのあなたのすべてのシグニのパワー+2000。
  //   → AUTO ON_ATTACK_PHASE_START＋POWER_MODIFY self ALL に inGateZone フィルタ＋duration UNTIL_OPP_TURN_END（旧＝全シグニ無条件 UNTIL_END_OF_TURN）。
  'WXDi-P15-056': [
    {
      effectId: 'WXDi-P15-056-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['白', '白'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'REMOVE_ABILITIES', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, until: 'UNTIL_END_OF_TURN' } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-056-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', inGateZone: true } }, delta: 2000, duration: 'UNTIL_OPP_TURN_END' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P16-054 幻水姫 アキノ//THE DOOR（水獣）
  // E1【常】：同ゾーンゲートで「【常】相手ターン中、このシグニのパワー+5000かつ相手効果でバニッシュされない」を得る。
  //   → E1=CONTINUOUS POWER_MODIFY self +5000 に activeCondition AND[TURN_OWNER opponent, SAME_ZONE_HAS_GATE]（旧＝常時+5000）。
  //     E1b=相手効果バニッシュ耐性＝CONTINUOUS GRANT_PROTECTION self from[BANISH] sourceOwner opponent に同 activeCondition
  //     （collectBanishEffectProtectedSigni が activeCondition 評価込みで保護。v0.400 で本実装）。
  // E2【自】アタックしたとき、場ゲートがある場合、①相手の5000以下を手札に戻す ②カード2枚引く から1つ選ぶ。
  //   → AUTO ON_ATTACK_SIGNI に condition FIELD_HAS_GATE を付与（CHOOSE 構造はパーサー生成を維持）。
  'WXDi-P16-054': [
    {
      effectId: 'WXDi-P16-054-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'AND', conditions: [{ type: 'TURN_OWNER', owner: 'opponent' }, { type: 'SAME_ZONE_HAS_GATE' }] },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta: 5000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P16-054-E1b',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'AND', conditions: [{ type: 'TURN_OWNER', owner: 'opponent' }, { type: 'SAME_ZONE_HAS_GATE' }] },
      action: { type: 'GRANT_PROTECTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, from: ['BANISH'], sourceOwner: 'opponent', duration: 'PERMANENT' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P16-054-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'c0', label: '相手のパワー5000以下を手札に戻す', action: { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 5000 } } }, optional: false } },
          { choiceId: 'c1', label: 'カードを2枚引く', action: { type: 'DRAW', owner: 'self', count: 2 } },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 バッチF -----

  // WXDi-P16-059 小装 デウス//THE DOOR（アーム）
  // E1【常】：同ゾーンゲートで「【常】相手は追加で《無》を支払わないかぎり【ガード】ができない」を得る。
  //   → CONTINUOUS STUB OPP_GUARD_COST_COLORLESS に activeCondition SAME_ZONE_HAS_GATE（既存ガード税機構が activeCondition 対応）。旧＝STUB GRANT_ABILITY_INNER_TEXT。
  // E2【自】ターン終了時、場ゲートがある場合、自シグニ1体に次の相手ターン終了時まで【シャドウ（レベル2以下）】を付与。
  //   → AUTO ON_TURN_END＋condition FIELD_HAS_GATE＋GRANT_KEYWORD（シャドウ:levelLte2・UNTIL_OPP_TURN_END）。旧＝GRANT_KEYWORD「ゲート」誤り。
  'WXDi-P16-059': [
    {
      effectId: 'WXDi-P16-059-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'STUB', id: 'OPP_GUARD_COST_COLORLESS' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P16-059-E2',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'FIELD_HAS_GATE', owner: 'self' },
      action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, keyword: 'シャドウ:{"levelLte":2}', duration: 'UNTIL_OPP_TURN_END' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 バッチG -----

  // WXDi-P15-058 羅星姫 コスチュム//THE DOOR（宇宙）
  // E1【常】：同じシグニゾーンに【ゲート】があるあなたのシグニは【シャドウ（スペル）】を得る。
  //   → 場全体への継続シャドウ付与。新 CONTINUOUS 宣言 GRANT_FIELD_SHADOW{keyword:シャドウ(スペル), filter:inGateZone} で表現し、
  //     execUtils のシャドウ保護フィルタが getFieldGrantedShadowScopes 経由で「own_gate_zones のゾーンの自シグニはスペル効果の対象にできない」を評価する（v0.399）。
  // E2【常】：同ゾーンゲートで「【自】APS開始時、《プロフェッサー　防衛者Ｄｒ．タマゴ》がいる場合、相手シグニ1体を対象、《青》《青》払えばデッキ下」を得る。
  //   → condition AND[SAME_ZONE_HAS_GATE, LRIG_NAME_CONTAINS self 'タマゴ'（センタールリグ名近似）]＋SEQUENCE[OPTIONAL_COST(青青), CONDITIONAL(PAID){TRANSFER_TO_DECK opp1 bottom}]。旧＝CONTINUOUS TRANSFER_TO_DECK no-op。
  'WXDi-P15-058': [
    {
      effectId: 'WXDi-P15-058-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'GRANT_FIELD_SHADOW', keyword: 'シャドウ:{"cardType":"スペル"}', filter: { inGateZone: true }, targetOwner: 'self' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-058-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      condition: { type: 'AND', conditions: [{ type: 'SAME_ZONE_HAS_GATE' }, { type: 'LRIG_NAME_CONTAINS', owner: 'self', name: 'タマゴ' }] },
      // 🆕**§5.3 `O-96` 第11バッチ（2026-09-02）＝対象宣言を支払いより前へ**
      //   原文「対戦相手のシグニ１体を**対象とし**、《青》《青》を支払って**もよい**。
      //   **そうした場合、それを**デッキの一番下に置く」。
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, abortIfNoCandidate: true },
        { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' },
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['青', '青'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, shuffle: false, position: 'bottom', targetsStored: true } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // ----- F-4 ピース（ゲート設置手段）-----

  // WXDi-P15-003 ひらけ！ゲート！（ピース）
  // 「あなたのシグニゾーン1つに【ゲート】1つを置く。このゲームの間、あなたのセンタールリグは『【起】エクシード4：【シグニバリア】1つを得る。【起】エクシード4：カードを4枚引く。』を得る。」
  // ピースは executeKeyPiece が ON_PLAY を発火させるため、旧 ACTIVATED パースでは発火しなかった。
  // E1=AUTO ON_PLAY で PLACE_OWN_GATE（ゲート設置）。E2=CONTINUOUS GRANT_LRIG_ABILITY（key_piece に残る間センタールリグへ付与＝collectLrigGrantedEffects がキーピースを走査）。
  // 【使用条件】ドリームチーム3色以上はピース使用条件のため近似省略。
  'WXDi-P15-003': [
    {
      effectId: 'WXDi-P15-003-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: { type: 'STUB', id: 'PLACE_OWN_GATE' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P15-003-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_LRIG_ABILITY',
        rawText: '【起】エクシード４：【シグニバリア】１つを得る。【起】エクシード４：カードを４枚引く。',
        abilities: [
          {
            effectId: 'WXDi-P15-003-E2-A',
            effectType: 'ACTIVATED',
            timing: ['MAIN'],
            cost: { exceed: 4 },
            action: { type: 'STUB', id: 'GAIN_SIGNI_BARRIER' },
            duration: 'INSTANT',
            mandatory: false,
            parseStatus: 'MANUAL',
          },
          {
            effectId: 'WXDi-P15-003-E2-B',
            effectType: 'ACTIVATED',
            timing: ['MAIN'],
            cost: { exceed: 4 },
            action: { type: 'DRAW', owner: 'self', count: 4 },
            duration: 'INSTANT',
            mandatory: false,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-098 凶将　アオトラ ＝ **2026-08-30 に manual を撤去して parser へ返した**（§6.4 O-40 のトリップワイヤ発火）。
  //   手書きが要った理由は「デッキの一番上のカードをトラッシュに置く」の**所有者を parser が読まず self 固定**
  //   だったことだけで、同日その規則を直した（`parseSentencePart1.ts` の deckOwner）ため実体が同一になった。
  //   🔴影武者を残すと**その効果にだけ parser の改善が永久に届かない**ので、実体同一になったら必ず消す。

  // WXDi-P10-072 凶美　アルフォウ//メモリア
  // 【常】：対戦相手のシグニは「【自】：あなたのアタックフェイズ開始時、あなたのデッキの一番上のカードをトラッシュに置く。」を得る。
  // 旧パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。実体は「対戦相手の場のシグニ全員へ ON_ATTACK_PHASE_START の自己ミル能力を付与」。
  // GRANT_FIELD_SIGNI_ABILITY{targetOwner:'opponent'}（v0.377 で targetOwner 対応済）＋付与能力は MILL self 1（付与先＝対戦相手の視点で「あなた」＝そのシグニのコントローラー）。
  // 付与能力は付与先（対戦相手）のアタックフェイズ開始時に発火。人間ターン側は doPhaseAdvance の collectTurnTriggers、CPU ターン側は cpuTurnAction の MAIN→ATTACK_ARTS 移行で収集（v0.387 で配線）。BURST はパーサー生成を維持。
  'WXDi-P10-072': [
    {
      effectId: 'WXDi-P10-072-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_FIELD_SIGNI_ABILITY',
        targetOwner: 'opponent',
        filter: { cardType: 'シグニ' },
        abilities: [
          {
            effectId: 'WXDi-P10-072-E1-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_PHASE_START'],
            triggerScope: 'self',
            action: { type: 'MILL', owner: 'self', count: 1 },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX12-018 真天使の未来　ガブリエルト
  // 【常】このシグニは対戦相手の、アーツ以外の効果を受けない。（E1: GRANT_PROTECTION、パーサー生成を維持）
  // 【常】あなたのルリグトラッシュにアーツが４枚以上あるかぎり、このシグニは
  //   「【自】このシグニがアタックしたとき、あなたの場に＜天使＞のシグニが３体ある場合、対戦相手のすべてのシグニをトラッシュに置く。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH SIGNI opponent ALL（no-op）。条件付き AUTO ON_ATTACK_SIGNI に修正。
  // E1（protection）と BURST は override しないため JSON のパーサー生成が残る。
  'WX12-018': [
    {
      effectId: 'WX12-018-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: {
        type: 'AND',
        conditions: [
          { type: 'LRIG_TRASH_COUNT', cardType: 'アーツ', operator: 'gte', value: 4 },
          { type: 'FIELD_CLASS_COUNT', owner: 'self', story: '天使', operator: 'gte', value: 3 },
        ],
      },
      action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P09-058 幻獣　LOVIT//メモリア
  // 【常】このシグニは覚醒状態であるかぎり、「【自】あなたのターン終了時、対戦相手のエナゾーンから
  //   対戦相手のセンタールリグと共通する色を持たないカード１枚を対象とし、それをトラッシュに置く。」を得る。
  // 【自】このシグニがバトルによって対戦相手のシグニ１体をバニッシュしたとき、このシグニは覚醒する。
  // 旧パース＝E1: CONTINUOUS TRASH ENERGY（no-op）、E2: ON_PLAY AWAKEN（召喚時覚醒の誤パース）。
  // E1 を「覚醒中」condition 付き AUTO ON_TURN_END に修正。相手エナの「相手センターと共通しない色」は
  //   energy 対象で colorNotMatchesLrig が対象オーナー（相手）のルリグ基準で colorExclude へ解決される（execExecutor）。
  // E2 を ON_SIGNI_BATTLE→AWAKEN_SIGNI に修正（バトル成立時に発火。「バニッシュした」勝利限定は専用情報がなく近似）。
  // WXDi-P14-002 CONNECTスピニング（ピース）
  // 【使用条件】【ドリームチーム】合計３種類以上の色を持つ
  // 以下の４つからあなたのセンタールリグのレベル１につき１つまで選ぶ。
  //   ①対戦相手のシグニ１体をバニッシュ ②相手センタールリグがLv3以上なら相手はエナ3枚をトラッシュ
  //   ③手札をすべて捨て、カードを４枚引く ④手札を２枚捨ててもよい。そうした場合、相手のライフクロス１枚をクラッシュ
  // 🔴④が素の `TRASH{HAND_CARD,self,2}`＋did-it ゲートだった＝**手札が2枚無くてもライフをクラッシュできる**
  //   （`resumeSelectTarget` は足りない枚数でも選択を通し、ゲートは成立する）。正準形の
  //   `STUB{OPTIONAL_COST, handDiscard}` は `canAfford` で支払い可能性を見るので踏み倒しが塞がる。
  // ⚠**parser の fresh は CHOOSE 自体を再現できない**（④の LIFE_CRASH 単体に潰れる）ので、
  //   live の良い構造ごと MANUAL で固定する。fresh を採用してはいけない。
  // 📋 残＝「センタールリグのレベル１につき１つ**まで**選ぶ」の可変 choose_count は語彙が無く `1` 固定。
  'WXDi-P14-002': [
    {
      effectId: 'WXDi-P14-002-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 1 }, { color: '無', count: 2 }] },
      condition: { type: 'FIELD_LRIG_COLOR_COUNT', owner: 'self', operator: 'gte', value: 3, minLrigs: 3 },
      action: { type: 'CHOOSE', choose_count: 1, from_count: 4, choices: [
        { choiceId: 'c0', label: '選択肢1', action: {
          type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } } },
        { choiceId: 'c1', label: '選択肢2',
          condition: { type: 'LRIG_LEVEL', owner: 'opponent', operator: 'gte', value: 3 },
          action: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 3 }, opponentSelects: true } },
        { choiceId: 'c2', label: '選択肢3', action: { type: 'SEQUENCE', steps: [
          { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } },
          { type: 'DRAW', owner: 'self', count: 4 },
        ] } },
        { choiceId: 'c3', label: '選択肢4', action: { type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'OPTIONAL_COST', handDiscard: { count: 2 } },
          { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' },
            then: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true } },
        ] } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P07-010 でじたるあーや！Ⅲ（ルリグ）
  // 【起】《ゲーム１回》《青×0》：対戦相手のシグニ１体を対象とし、それを裏向きにする。
  //   各アタックフェイズ開始時、裏向きのそれと同じ場所にシグニがない場合、
  //   対戦相手は《無》《無》を支払うか手札を２枚捨ててもよい。そうした場合、それを表向きにする。
  // 🔴旧パース＝2文目が `TRASH{HAND_CARD, owner:'self', 2, optional}`＝**自分が手札2枚を捨てる**（しかも
  //   帰結は `RULE_REMINDER_TEXT`＝何も起きない）＝**ただの自傷**だった。
  // 🆕**§6.4 O-9(b) で defer を解除（2026-08-16 続き506）**＝「**各**アタックフェイズ開始時に、
  //   同じ場所が空なら相手が支払える」という**繰り返す遅延ゲート**を専用の予約フィールド
  //   `facedown_release_by_payment` で実装した（`delayed_triggers` は THIS_TURN 限定なので載らない）。
  //   ⚠予約は**裏向きカードの持ち主側**（＝支払う側）に載る。両プレイヤーのアタックフェイズ開始時に
  //   合成トリガーが立ち、支払われるまで消えない。
  // 🆕**E1＝公開したカードのレベル別4分岐（§6.4 O-11・続き532）**。
  // 原文＝「【自】：このルリグがアタックしたとき、**対戦相手の**デッキの一番上を公開する。
  //   それがレベル１のシグニの場合、①を行う。レベル２のシグニの場合、②を行う。
  //   レベル３のシグニの場合、①か②を行う。スペルの場合、①と②を行う。
  //   ①カードを１枚引く。②対戦相手は手札を１枚捨てる。」
  // 🔴旧パース＝`REVEAL_AND_PICK{owner:'self', filter:{シグニ,level:1}, then:RULE_REMINDER_TEXT}`＝
  //   ①**公開するデッキが自分**（相手の情報を見るはずが自分のデッキを晒す）②pick して**何もしない**
  //   ③レベル2/3・スペルの3分岐が丸ごと消えている＝**実質すべて no-op**。
  // 🔑機構は全部既存＝`REVEAL_DECK_TOP{owner:'opponent'}` が `lastProcessedCards` に公開札を残し、
  //   `LAST_PROCESSED_MATCHES` の else 連鎖で4分岐を書ける。**parser 規則にはしない**＝
  //   「①を行う／①か②を行う」という後方参照の書式は**全CSVでこの1枚だけ**（実測）。
  // ⚠**else の入れ子**にする（並列 CONDITIONAL だと「レベル3のシグニ」がレベル1の枝にも当たらない代わりに、
  //   将来 filter を緩めたときに複数枝が同時発火する）。
  'WXDi-P07-010': [
    {
      effectId: 'WXDi-P07-010-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_LRIG'],
      triggerScope: 'self',
      action: { type: 'SEQUENCE', steps: [
        { type: 'REVEAL_DECK_TOP', owner: 'opponent', count: 1 },
        {
          type: 'CONDITIONAL',
          condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', level: 1 } },
          then: { type: 'DRAW', owner: 'self', count: 1 },
          else: {
            type: 'CONDITIONAL',
            condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', level: 2 } },
            then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
            else: {
              type: 'CONDITIONAL',
              condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', level: 3 } },
              // 「①か②を行う」＝プレイヤーがどちらかを選ぶ
              then: {
                type: 'CHOOSE', choose_count: 1, from_count: 2,
                choices: [
                  { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
                  { choiceId: 'c1', label: '対戦相手は手札を1枚捨てる', action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
                ],
              },
              else: {
                type: 'CONDITIONAL',
                condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'スペル' } },
                // 「①と②を行う」＝両方
                then: { type: 'SEQUENCE', steps: [
                  { type: 'DRAW', owner: 'self', count: 1 },
                  { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
                ] },
              },
            },
          },
        },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P07-010-E2',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 0 }] },
      usageLimit: 'once_per_game',
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'FACE_DOWN_OPP_SIGNI' },
        // value＝《無》の枚数／handDiscard＝手札で払う場合の枚数（原文どおり2と2）
        { type: 'STUB', id: 'FACEDOWN_RELEASE_BY_OPP_PAYMENT', value: 2, handDiscard: { count: 2 } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P09-064 羅星 ヴォランス（シグニ）
  // 【出】：対戦相手は手札を２枚まで捨ててもよい。対戦相手はこの方法で捨てたカード１枚につきカードを１枚引く。
  // 🔴旧パース＝`SEQUENCE[STUB{TARGET_AND_DISCARD_HAND}, DRAW{owner:'self'}]`＝**主語が丸ごと反転**して
  //   「**自分**が手札を1枚捨てて**自分**が1枚引く」（相手のデッキ圧縮のはずが自分の手札交換）になっていた。
  // 🆕**§6.4 O-9(a) で近似を解消（2026-08-16 続き506）**＝旧実装は `opponentHandDiscard: 2`（all-or-nothing）で
  //   **0枚か2枚**に丸めており、「1枚だけ捨てて1枚引く」が選べなかった。`opponentHandDiscardUpTo` で
  //   1..N を選択肢に並べ（0枚は skip 枝）、引く枚数は **`addLastProcessedCount` で実枚数に追従**させる
  //   ＝枚数を焼き込まないので「この方法で捨てたカード1枚につき」が任意の中間値でも成立する。
  'WXDi-P09-064': [
    {
      effectId: 'WXDi-P09-064-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      triggerScope: 'self',
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPPONENT_PAY_OPTIONAL', opponentHandDiscardUpTo: 2, thenOnPay: true },
        // count:0 + addLastProcessedCount ＝「直前に捨てた枚数だけ引く」（枚数を焼き込まない）
        { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'DRAW', owner: 'opponent', count: 0, addLastProcessedCount: true } },
      ] },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  'WXDi-P09-058': [
    {
      effectId: 'WXDi-P09-058-E1',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      triggerScope: 'self',
      condition: { type: 'THIS_CARD_IS_AWAKENED' },
      action: {
        type: 'TRASH',
        target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, filter: { colorNotMatchesLrig: true } },
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P09-058-E2',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_BATTLE'],
      triggerScope: 'self',
      action: { type: 'AWAKEN_SIGNI' },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P15-060 幻竜　遊月//THE DOOR
  // 【常】このカードの上にある＜解放派＞のシグニは「【自】あなたのアタックフェイズ開始時、
  //   対戦相手のエナゾーンから対戦相手のセンタールリグと共通する色を持たないカード１枚を対象とし、それをトラッシュに置く。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH ENERGY（no-op）。上シグニ付与＝GRANT_SIGNI_ABOVE_ABILITY（collectGrantedFromUnderSigni PatternB）。
  // E1（下にカードがあるかぎり+4000）と BURST はパーサー生成を維持。
  'WXDi-P15-060': [
    {
      effectId: 'WXDi-P15-060-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_SIGNI_ABOVE_ABILITY',
        filter: { cardType: 'シグニ', story: '解放派' },
        abilities: [
          {
            effectId: 'WXDi-P15-060-E2-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_PHASE_START'],
            triggerScope: 'self',
            action: {
              type: 'TRASH',
              target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1, filter: { colorNotMatchesLrig: true } },
            },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P02-068 蒼将　ヒジカタ
  // 【常】このターンに手札を２枚以上捨てていたかぎり、このシグニは
  //   「【自】このシグニがバトルによって対戦相手のシグニをバニッシュしたとき、対戦相手の手札を１枚見ないで選び、捨てさせる。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH HAND opponent blind（no-op）。
  // condition 付き AUTO ON_SIGNI_BATTLE に修正（ON_SIGNI_BATTLE 収集に condition 評価を追加済み）。
  // 「バトルによってバニッシュした」勝利限定はバッチ2の P09-058 と同じくバトル成立時で近似。
  // E1（このターンに手札1枚以上捨てた→+3000）はパーサー生成を維持（条件欠落は別の軽微な未対応）。
  'WXDi-P02-068': [
    {
      effectId: 'WXDi-P02-068-E2',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_BATTLE'],
      triggerScope: 'self',
      condition: { type: 'TURN_HAND_DISCARD_GTE', value: 2 },
      action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P05-032 大装　ゲイヴォルグ
  // 【常】あなたのセンタールリグは「【自】《ターン１回》：このルリグがアタックしたとき、対戦相手のシグニ１体を対象とし、それをトラッシュに置く。」を得る。
  // 旧 E1 パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。CONTINUOUS GRANT_LRIG_ABILITY でセンタールリグへ
  //   ON_ATTACK_LRIG 能力を付与（collectLrigGrantedEffects→ON_ATTACK_LRIG 収集に配線済み）。
  // E2（アタックフェイズ開始時に白シグニ1体ダウン→ドロー）はパーサー生成を維持。
  'WXDi-P05-032': [
    {
      effectId: 'WXDi-P05-032-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_LRIG_ABILITY',
        rawText: 'あなたのセンタールリグは「【自】《ターン１回》：このルリグがアタックしたとき、対戦相手のシグニ１体を対象とし、それをトラッシュに置く。」を得る。',
        abilities: [
          {
            effectId: 'WXDi-P05-032-E1-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_LRIG'],
            triggerScope: 'self',
            usageLimit: 'once_per_turn',
            action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      } as GrantLrigAbilityAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX17-036 幻怪　ブラウニー
  // 【常】：あなたのすべての領域にある＜怪異＞のシグニであるカードは
  //   【ライフバースト】「対戦相手のシグニ１体を対象とし、それをトラッシュに置く。」を持つ。
  // 旧パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。全領域へのバースト付与は既存 STUB GRANT_ALL_ZONE_LIFEBURST
  //   を burstFilter（＜怪異＞シグニ限定）＋burstAction（相手シグニ1体トラッシュ）対応に拡張して実装（WD14-001 は既定値で不変）。
  'WX17-036': [
    {
      effectId: 'WX17-036-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'STUB',
        id: 'GRANT_ALL_ZONE_LIFEBURST',
        burstFilter: { cardType: 'シグニ', story: '怪異' },
        burstAction: { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK04-048 コードイート　アイスケーキ
  // E1【常】このシグニは【アクセ】が付いているかぎり、「【自】このシグニがアタックしたとき、
  //    《青》を支払ってもよい。そうした場合、対戦相手は手札を１枚捨てる。」を得る。
  // E2【常】これにアクセされているレベル３以上のシグニは「【自】このシグニがアタックしたとき、対戦相手は手札を１枚捨てる。」を得る。
  // 旧パース＝E1/E2 とも CONTINUOUS TRASH HAND opponent（no-op）。BURST はパーサー生成を維持。
  // E1: アクセ付き条件付き AUTO ON_ATTACK_SIGNI＋任意《青》コスト（OPTIONAL_COST→PAID_ADDITIONAL_COST ゲート）。
  // E2: GRANT_ACCE_HOST_ABILITY（ホスト＝レベル3以上）で ON_ATTACK_SIGNI の相手手札捨てを付与。
  'WXK04-048': [
    {
      effectId: 'WXK04-048-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      condition: { type: 'THIS_CARD_IS_ACCED' },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['青'] },
          { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXK04-048-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_ACCE_HOST_ABILITY',
        filter: { cardType: 'シグニ', levelRange: { min: 3 } },
        abilities: [
          {
            effectId: 'WXK04-048-E2-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_SIGNI'],
            triggerScope: 'self',
            action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } },
            duration: 'INSTANT',
            mandatory: true,
            parseStatus: 'MANUAL',
          },
        ],
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WX21-054 幻竜　ディノス
  // 【常】対戦相手のエナゾーンにカードが５枚以上あるかぎり、このシグニは
  //   「【自】：このシグニが対戦相手にダメージを与えたとき、対戦相手のエナゾーンからカード１枚を対象とし、それをトラッシュに置く。」を得る。
  // 旧 E1 パース＝CONTINUOUS TRASH ENERGY（no-op）。新 timing ON_SIGNI_DAMAGE（正面空きでライフをクラッシュした時）
  //   ＋condition ENERGY_COUNT(opp,gte,5) の AUTO に修正。E2（手札公開 or 自己トラッシュ）と BURST は維持。
  'WX21-054': [
    {
      effectId: 'WX21-054-E1',
      effectType: 'AUTO',
      timing: ['ON_SIGNI_DAMAGE'],
      triggerScope: 'self',
      condition: { type: 'ENERGY_COUNT', owner: 'opponent', operator: 'gte', value: 5 },
      action: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P04-040 翠魔姫　イバラキドウジ
  // 🔴**2026-08-27（Sheet1 B2）に effectId を `-E1`→`-E2` へ改名した（内容は1バイトも変えていない）。**
  //   この手書きが書かれた当時は下のコメントどおり parser が【ランサー】を出さなかったが、
  //   §6.4 `O-11`（続き532＝キーワード単独の【常】ブロックを分割）で **parser が `-E1` に
  //   `GRANT_KEYWORD{ランサー}` を出すようになり、この手書きと id が衝突**した。
  //   `mergeManualEffects` は effectId 一致で手書きを勝たせるので、**live からランサーが消え**、
  //   parser の【自】が `-E2` へ押し出されて id 集合がズレ、カードごと `_idset_fresh` に凍結していた。
  //   改名により parser が `-E1`（ランサー）、この手書きが `-E2`（【自】）を持つ正しい対応になる。
  // ⚠**この手書きは parser 出力より richer**（`triggerScope:'self'` と自己トラッシュの `thisCardOnly`）なので撤去しない。
  // 【常】【ランサー】（★当時のメモ＝「静的キーワードはテキストから自動判定」。現在は parser が -E1 に出す）
  // 【自】：あなたのアタックフェイズ開始時、《無》《無》《無》を支払わないかぎり、このシグニを場からトラッシュに置く。
  // 旧パース＝CONTINUOUS TRASH SIGNI self（no-op）。任意《無×3》コストを払えば維持、払わなければ自己トラッシュ。
  // OPTIONAL_COST（支払う/スキップ）→ CONDITIONAL{PAID_ADDITIONAL_COST, then:noop, else: このシグニを自己トラッシュ}。
  // 自己トラッシュは TRASH SIGNI self＋filter.thisCardOnly（execTrash に thisCardOnly 対応を追加）。
  'WXDi-P04-040': [
    {
      effectId: 'WXDi-P04-040-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          // `unlessPay`＝「支払わないかぎり」形の文言・逆翻訳（§6.4 O-30・2026-08-15 続き495）。
          // 機構は不変（pay→then／skip→else）で、選択肢が「支払う／支払わない」になるだけ。
          { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無', '無', '無'], unlessPay: true },
          {
            type: 'CONDITIONAL',
            condition: { type: 'PAID_ADDITIONAL_COST' },
            then: { type: 'SEQUENCE', steps: [] },
            else: { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

  // WXK10-039 羅原　ＣＨ４
  // 【常】【アサシン】（静的キーワードはテキストから自動判定）
  // 【出】：あなたの他の＜原子＞のシグニ２体を場からトラッシュに置かないかぎり、このシグニを場からトラッシュに置く。
  // 旧パース＝CONTINUOUS TRASH SIGNI self（no-op）。他の＜原子＞2体をコストでトラッシュすれば維持、しなければ自己トラッシュ。
  // CHOOSE（2択）: 「他の原子2体トラッシュ」(他の原子が2体以上＝FIELD_CLASS_COUNT≥3 でのみ選択可)／「このシグニを自己トラッシュ」。
  'WXK10-039': [
    {
      effectId: 'WXK10-039-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      triggerScope: 'self',
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'pay_atomos',
            label: 'あなたの他の＜原子＞のシグニ２体をトラッシュ',
            action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 2, filter: { cardType: 'シグニ', story: '原子', excludeSelf: true } } },
            condition: { type: 'FIELD_CLASS_COUNT', owner: 'self', story: '原子', operator: 'gte', value: 3 },
          },
          {
            choiceId: 'sacrifice_self',
            label: 'このシグニを場からトラッシュ',
            action: { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
          },
        ],
      } as ChooseAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  
    {"effectId":"WXK10-039-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WXK10-031 讃の宙遊　チキュウゴマ（シグニ 精武：遊具/精羅：宇宙）
  // E1【自】：このシグニがアタックしたとき、《無》を支払ってもよい。そうした場合、あなたのデッキの上からシグニがめくれるまで公開する。
  //   その後、そのシグニより低いレベルを持つ対戦相手のシグニ１体を対象とし、それを手札に戻し、公開したカードをトラッシュに置く。
  // 旧AUTOパース＝TRASH(相手シグニ・比較脱落)＝「手札に戻す」BOUNCE を TRASH に誤訳＋「そのシグニより低いレベル」脱落。
  // → DECK_REVEAL_UNTIL（公開シグニ=lastProcessed・公開カード全てトラッシュ＝engine 拡張）→ BOUNCE{levelLtLastProcessed}。
  //   任意コスト STUB+CONDITIONAL(IS_MY_TURN) は execSequence の「支払ってもよい」プレースホルダ機構が消費する。E2（【出】数字宣言）は自動パース維持。
  "WXK10-031": [
    {"effectId":"WXK10-031-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["無"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"STUB","id":"DECK_REVEAL_UNTIL"}},{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelLtLastProcessed":true},"upToCount":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // ===== G157: 【出】デッキトップ公開、そのカードと共通色のルリグが場にいる場合のみ【エナチャージ1】 =====
  "SPDi01-121": [{"effectId":"SPDi01-121-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":1,"private":false,"reorder":false,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_SHARES_COLOR_WITH_LRIG","owner":"self"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX25-P1-115": [{"effectId":"WX25-P1-115-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":1,"private":false,"reorder":false,"destination":{"location":"deck","owner":"self","position":"top"}},{"type":"CONDITIONAL","condition":{"type":"DECK_TOP_SHARES_COLOR_WITH_LRIG","owner":"self"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],

  // ===== WX25-P2-112（タスク12(vii)残・アップルリグdown＋「共通する色」動的フィルタ）=====
  // 【自】アタックフェイズ開始時、対戦相手のエナが2枚以上なら、あなたのアップ状態のルリグ1体をダウンしてもよい。
  //   その後、対戦相手のエナから「この方法でダウンしたルリグと共通する色を持つ」カード1枚をトラッシュ。
  //   ⚠parser は DOWN を SIGNI（本来 LRIG）に取り違え・TRASH を無条件＆色フィルタ無しにしていたため MANUAL 化。
  //   engine 側は execDown(LRIG) がダウンしたルリグ instance を lastProcessedCards に記録するよう拡張し、
  //   TRASH の filter.colorMatchesLastProcessed（owner非依存＝相手エナを自ルリグ色で絞る／参照不能なら空ヒット＝
  //   「ダウンしなかった／既にダウン」の did-it ゲートを兼ねる）で共通色1枚に限定する。DOWN の optional は
  //   execDown(LRIG) の「ダウン/スキップ」二択で実装（続き220）。
  //   ⚠target.filter.isUp は「原文が**アップ状態のルリグ**と言っている＝センター固定ではなくアシストも含む」印。
  //     execDown が payLrigDownCost 経路（センター→アシストL→R）へ切り替える判別子（タスク12(cix)）。
  "WX25-P2-112": [
    {"effectId":"WX25-P2-112-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ENERGY_COUNT","owner":"opponent","operator":"gte","value":2},"then":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"LRIG","owner":"self","count":1,"filter":{"isUp":true}},"optional":true},{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"colorMatchesLastProcessed":true}}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // ===== WX26-CP1-048 プリンセス・ジール（タスク12(viii)残・出自条件機構）=====
  // E2【出】：このシグニが＜プリオケ＞のシグニの効果によって場に出ていた場合（出自条件＝THIS_CARD_PLACED_BY_CLASS。
  //   signi_placed_by_source に記録した発生源 CardClass で判定）、対戦相手のエナからカード1枚をトラッシュ。
  //   それが対戦相手のセンタールリグと共通する色を持つ場合（LAST_PROCESSED_SHARES_COLOR_WITH_LRIG）、
  //   対戦相手が【エナチャージ1】（原文「してもよい」＝相手に利するため常に行う近似でmandatory）。
  //   ⚠parser の bare SEQUENCE は出自条件・共通色・エナチャージ owner をすべて落としていたため MANUAL 化。
  "WX26-CP1-048": [
    {"effectId":"WX26-CP1-048-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_PLACED_BY_CLASS","cardClass":"プリオケ"},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_SHARES_COLOR_WITH_LRIG","owner":"opponent"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"opponent","count":1}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // ===== G158: E1 全シグニ異クラス条件で【エナチャージ2】 / E2 プライマル（技名）：エナのシグニを手札へ、5枚以上でルリグに無敵付与 =====
  "SPDi44-04": [
    {"effectId":"SPDi44-04-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"FIELD_SIGNI_ALL_DISTINCT_CLASS","owner":"self"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"SPDi44-04-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_game","cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":5},"then":{"type":"GRANT_LRIG_ABILITY","rawText":"【常】：あなたは対戦相手の効果によってダメージを受けない。","abilities":[{"effectId":"SPDi44-04-E2-GRANT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_DAMAGE_FROM_OPP_EFFECTS"},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX25-P1-026": [
    {"effectId":"WX25-P1-026-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"FIELD_SIGNI_ALL_DISTINCT_CLASS","owner":"self"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX25-P1-026-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_game","cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":5},"then":{"type":"GRANT_LRIG_ABILITY","rawText":"【常】：あなたは対戦相手の効果によってダメージを受けない。","abilities":[{"effectId":"WX25-P1-026-E2-GRANT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_DAMAGE_FROM_OPP_EFFECTS"},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // ===== タスク12(l) A: 2色の拾得条件成立時だけ、次の相手ターン終了時までガード代替を付与 =====
  "WX24-P4-026": [
    {"effectId":"WX24-P4-026-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LAST_PROCESSED_MATCHES","filter":{"color":"白"},"operator":"gte","value":1},{"type":"LAST_PROCESSED_MATCHES","filter":{"color":["赤","青","緑","黒"]},"operator":"gte","value":1},{"type":"LAST_PROCESSED_MATCHES","filter":{"color":["白","赤","青","緑","黒"]},"operator":"eq","value":2}]},"then":{"type":"GRANT_LRIG_ABILITY","duration":"UNTIL_OPP_TURN_END","rawText":"【常】：あなたが【ガード】する際、《ガードアイコン》を持つカードを１枚捨てる代わりに手札を１枚捨ててもよい。","abilities":[{"effectId":"WX24-P4-026-E1-GRANT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GUARD_ALT_HAND_REPLACE","count":1},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // ===== G159: E1 自＜ウェポン＞シグニ出現時トラッシュから《クロス》ウェポンを場へ / E2 イノセンス（技名）：クロス状態シグニの基本パワー15000＋ルリグ付与 =====
  "SPDi44-08": [
    {"effectId":"SPDi44-08-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","story":"ウェポン"},"triggerCondition":{"duringMainPhase":true},"usageLimit":"once_per_turn","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"ウェポン","hasIcon":"クロス"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"SPDi44-08-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_game","cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"crossState":true}},"value":15000},{"type":"GRANT_LRIG_ABILITY","duration":"UNTIL_OPP_TURN_END","rawText":"【常】：あなたのクロス状態のシグニ1体が対戦相手の効果によって場を離れる場合、代わりにこのルリグはこの能力を失う。","abilities":[{"effectId":"SPDi44-08-E2-GRANT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY","leaveVictimFilter":{"crossState":true}},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"}]}]},"duration":"UNTIL_OPP_TURN_END","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX25-P1-018": [
    {"effectId":"WX25-P1-018-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","story":"ウェポン"},"triggerCondition":{"duringMainPhase":true},"usageLimit":"once_per_turn","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"ウェポン","hasIcon":"クロス"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX25-P1-018-E2","effectType":"ACTIVATED","timing":["MAIN"],"usageLimit":"once_per_game","cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"crossState":true}},"value":15000},{"type":"GRANT_LRIG_ABILITY","duration":"UNTIL_OPP_TURN_END","rawText":"【常】：あなたのクロス状態のシグニ1体が対戦相手の効果によって場を離れる場合、代わりにこのルリグはこの能力を失う。","abilities":[{"effectId":"WX25-P1-018-E2-GRANT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"EFFECT_LEAVE_PREVENT_LOSE_LRIG_ABILITY","leaveVictimFilter":{"crossState":true}},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"}]}]},"duration":"UNTIL_OPP_TURN_END","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // ===== G156: 以下2つから1つ選ぶ ①相手ルリグ/シグニ1体のアタック無効 ②エナから＜ブルアカ＞2枚トラッシュしてもよい→相手2体までのアタック無効 =====
  "WX25-CD1-06": [{"effectId":"WX25-CD1-06-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"opt1","label":"対戦相手のルリグかシグニ1体のアタックを無効にする","action":{"type":"NEGATE_ATTACK","target":{"type":"CENTER_LRIG_OR_SIGNI","owner":"opponent","count":1,"upToCount":false}}},{"choiceId":"opt2","label":"エナから＜ブルアカ＞2枚をトラッシュして対戦相手2体までのアタックを無効にする","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS","costColors":[]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"NEGATE_ATTACK","target":{"type":"CENTER_LRIG_OR_SIGNI","owner":"opponent","count":2,"upToCount":true}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  "WX25-CP1-030": [{"effectId":"WX25-CP1-030-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"opt1","label":"対戦相手のルリグかシグニ1体のアタックを無効にする","action":{"type":"NEGATE_ATTACK","target":{"type":"CENTER_LRIG_OR_SIGNI","owner":"opponent","count":1,"upToCount":false}}},{"choiceId":"opt2","label":"エナから＜ブルアカ＞2枚をトラッシュして対戦相手2体までのアタックを無効にする","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS","costColors":[]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"NEGATE_ATTACK","target":{"type":"CENTER_LRIG_OR_SIGNI","owner":"opponent","count":2,"upToCount":true}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  // タスク12(viii)（続き137）: 現行 parser は本カードの2能力（①ターン終了時 手札を捨てて＜ブルアカ＞+4000／②絆自 アタックフェイズ開始時 ダウン→ドロー）を1つの効果に混線させ POWER_MODIFY も owner:any に壊す（parser-broken）。完全 MANUAL 上書きで是正。E1=第1能力（捨てる→+4000）、E2=絆自（既存 JSON と同型）。held に落ちるため build:effects 後 heldReview.mjs --adopt で採用。TRASH HAND_CARD optional+CONDITIONAL(IS_MY_TURN) は WX24-P4-050-E1 と同型。
  "WX25-CP1-062": [
    {"effectId":"WX25-CP1-062-E1","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"ブルアカ"}},"delta":4000,"duration":"UNTIL_OPP_TURN_END"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX25-CP1-062-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","kizunaIcon":true,"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","isUp":true,"thisCardOnly":true},"upToCount":false},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // 🗑**`WXEX1-57` の MANUAL 影武者は 2026-08-27 Sheet1 B5 で撤去した**（§6.4 `O-42` トリップワイヤ発火）。
  //   旧コメントは「共通 `parseColorFilter` は複色名詞句を単色へ昇格しないので、このカードだけ MANUAL で
  //   color OR を保持する」だったが、**B5 で `parseColorFilter` 自身が色OR（配列）を返すようになった**ので
  //   parser 出力と実体同一になった。⚠**live の `parseStatus` も `MANUAL`→`AUTO` へ直すまでがセット**
  //   （`PRESERVE_STATUSES` が効いたままだとこの効果にだけ parser 改善が永久に届かない）。

  // §6.3 cost-game wave 2: select once, preserve the exact instance across an optional payment,
  // then apply the paid/unpaid branch to that preserved target.
  "WXDi-D08-012": [
    {"effectId":"WXDi-D08-012-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","exceed":4},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"EXILE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // 続き269: 「追加エクシードを支払っていた場合、代わりに」の排他的な正準形。
  // OPTIONAL_COST の支払い結果は effectExecutor の pay/skip 分岐が PAID_ADDITIONAL_COST と else を解決する。
  "WXDi-D09-H29": [
    {"effectId":"WXDi-D09-H29-E1","effectType":"ACTIVATED","timing":["MAIN"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","exceed":7},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":2000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-D09-P25": [
    {"effectId":"WXDi-D09-P25-E1","effectType":"ACTIVATED","timing":["MAIN"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","exceed":7},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL"},"until":"UNTIL_END_OF_TURN"}]},"else":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P03-063": [
    {"effectId":"WXDi-P03-063-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","exceed":4},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P03-072": [
    {"effectId":"WXDi-P03-072-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","exceed":4},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"DRAW","owner":"self","count":3},"else":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":2},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P03-080": [
    {"effectId":"WXDi-P03-080-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","exceed":4},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":5000,"duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL"},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P03-080-sub-E1-all","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}]},"else":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":5000,"duration":"UNTIL_END_OF_TURN"},{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL"},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P03-080-sub-E1-one","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P03-089": [
    {"effectId":"WXDi-P03-089-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","exceed":4},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true,"delta":-12000,"duration":"UNTIL_END_OF_TURN"},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true,"delta":-5000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX15-029": [
    {"effectId":"WX15-029-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":false,"filter":{"cardType":"シグニ","colorMatchesLrig":true}}},"else":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","colorMatchesLrig":true}}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXDi-P14-025": [
    {"effectId":"WXDi-P14-025-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"SPELL_USED_THIS_TURN","owner":"opponent"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"else":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK06-027": [
    {"effectId":"WXK06-027-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self",
      "condition":{"type":"OPP_CARDS_MOVED_TO_DECK_THIS_TURN","operator":"gte","value":1},
      "action":{"type":"CONDITIONAL","condition":{"type":"OPP_CARDS_MOVED_TO_DECK_THIS_TURN","operator":"gte","value":3},
        "then":{"type":"CHOOSE","choose_count":2,"upTo":true,"from_count":3,"choices":[
          {"choiceId":"c0","label":"対戦相手のシグニ1体をバニッシュする","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},
          {"choiceId":"c1","label":"対戦相手は手札を1枚捨てる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}},
          {"choiceId":"c2","label":"カードを2枚引く","action":{"type":"DRAW","owner":"self","count":2}}
        ]},
        "else":{"type":"CHOOSE","choose_count":1,"from_count":3,"choices":[
          {"choiceId":"c0","label":"対戦相手のシグニ1体をバニッシュする","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},
          {"choiceId":"c1","label":"対戦相手は手札を1枚捨てる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}},
          {"choiceId":"c2","label":"カードを2枚引く","action":{"type":"DRAW","owner":"self","count":2}}
        ]}},
      "duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-D09-P15": [
    {"effectId":"WXDi-D09-P15-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"bounce","label":"手札を3枚捨ててもよい。そうした場合、それを手札に戻す","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":3}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]}},{"choiceId":"exile","label":"手札2枚とガードを持つシグニ1枚を捨ててもよい。そうした場合、それを除外","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscardGroups":[{"count":2},{"count":1,"filter":{"hasGuard":true,"cardType":"シグニ"}}]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"EXILE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]}}]}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX16-033": [
    {"effectId":"WX16-033-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-D01-016": [
    {"effectId":"WXDi-D01-016-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"SELF_POWER_GTE","value":20000},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}},"else":{"type":"CONDITIONAL","condition":{"type":"SELF_POWER_GTE","value":15000},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 tail: quoted abilities / replacement destinations / precise burst success gates.
  "WX25-CP1-074": [
    {"effectId":"WX25-CP1-074-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"ブルアカ","excludeSelf":true}},"delta":3000,"duration":"UNTIL_END_OF_TURN"},
      {"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL"},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX25-CP1-074-sub-CONT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"CANNOT_DEAL_DAMAGE_TO_OPPONENT"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}},
      {"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL"},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX25-CP1-074-sub-AUTO","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK09-055": [
    {"effectId":"WXK09-055-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[
      {"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"電機"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK09-055-sub-EC3","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":3},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},
      {"type":"CONDITIONAL","condition":{"type":"ENERGY_EACH_LEVEL_FILTER_GTE","owner":"self","filter":{"cardType":"シグニ","story":"電機"},"levels":[1,2,3,4],"minEach":1},"then":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL"},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK09-055-sub-DRAW2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"DRAW","owner":"self","count":2},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}},
      {"type":"CONDITIONAL","condition":{"type":"ENERGY_EACH_LEVEL_FILTER_GTE","owner":"self","filter":{"cardType":"シグニ","story":"電機"},"levels":[1,2,3,4],"minEach":2},"then":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL"},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXK09-055-sub-ENERGY","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // §6.4 O-6：`WX25-P3-038` の MANUAL は**削除して AUTO 採用へ切り替えた**（2026-08-16）。
  // 判断の根拠＝fresh の木は MANUAL の上位互換で、2点だけが違い両方とも fresh が正しい：
  //   ① 対象宣言が `POWER_MODIFY{delta:0}` の代用ではなく `STUB{SELECT_TARGET_ONLY}`
  //      （＝「パワーを＋0した」という偽の履歴を残さない）。
  //   ② 条件が `LAST_PROCESSED_HAS_NO_ABILITIES` ではなく `LAST_PROCESSED_MATCHES{noAbilities}`
  //      ＝カードが実際に居る場から holder を引くので**相手側の `abilities_removed` を見られる**。
  // ⚠②は engine 側も同時に是正済み（`execUtils.ts` の `LAST_PROCESSED_HAS_NO_ABILITIES`）＝
  //   同じ条件型を使う `WX25-CP1-002-E1` の選択肢4も直る。
  "WXEX1-02": [
    {"effectId":"WXEX1-02-E1","effectType":"CONTINUOUS","action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","isFrozen":true}},"abilityTypes":["常","自"],"until":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // Opus task 12 (liv): state-filtered global ability loss.
  // §6.4 O-10（続き507）＝**旧 defer 理由は原文の誤読**だった。「【グロウ】あなたのセンタールリグが
  // カード名に《リメンバ》を含む」は**このルリグへグロウするための条件**（＝グロウ前のセンターに掛かる）で、
  // 場に出たあとの E1 に掛かる「かぎり」条件ではない（このルリグ自身の名前が《リメンバ》を含む）。
  // ⇒ E1 は無条件の【常】＝同文の `WXEX1-02-E1` と同じ形。原文が「【常】能力と【自】能力」ではなく
  //   「能力を失う」なので `abilityTypes` は付けない（全能力）。
  "WX09-Re01": [
    {"effectId":"WX09-Re01-E1","effectType":"CONTINUOUS","action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","isFrozen":true}},"until":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX18-038": [
    {"effectId":"WX18-038-E1","effectType":"CONTINUOUS","action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","hasCharm":true}},"until":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.4 O-10（続き514）＝`WX12-023` の defer を解体。
  // 「【常】：対戦相手のトラッシュとルリグトラッシュにあるカードは能力を失い、効果を受けない。」
  // 🔑**据置理由「相手トラッシュに触る全効果に及ぶ」は古かった**＝トラッシュを発生源にする候補列は
  //   `movableTrashCandidates`（`execUtils.ts`）の**1点 funnel**（8呼び出しが全部そこを通る）。
  //   「効果を受けない」は**候補0**で表す＝アクションは「対象がない」で自然に no-op する
  //   （`isOwnTrashMoveLocked`＝トラッシュ移動ロックと同じ形）。
  // 🔑「能力を失う」の読み手は2つだけ＝①トラッシュ起動【起】のボタン ②ルリグトラッシュ由来の継承【起】。
  // ⚠**「効果を受けない」は主語を問わない**＝原文は誰の効果とも書いていないので、持ち主自身の
  //   トラッシュ回収も止まる（ロック札）。
  "WX12-023": [
    {"effectId":"WX12-023-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"TRASH_ABILITY_LOSS_AND_IMMUNITY"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.4 O-10（続き507）＝`WX25-P3-055-E2` の defer を解体。parser 規則
  // （`EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY`）が《相手ターン》の `activeCondition` ごと正しく作るので
  // **AUTO 採用**（MANUAL エントリを削除）。⚠live レコードは `MANUAL` 刻印だと `build:effects` が
  // 永久に触れないので、live JSON の外科パッチとセットで行うこと（§6.4 O-6 続き505 と同じ手順）。
  // §6.4 O-10（続き507）＝defer を解体。原文「【常】：あなたの手札が０枚であるかぎり、あなたが対戦相手の
  // ルリグによってダメージを受ける場合、代わりにダメージを受けず、ターン終了時まで、この能力を失う。」
  // ⇒ 既存の `PREVENT_LRIG_DAMAGE`（判定 funnel＝`resolveLrigDamageShield`）＋
  //    `loseAbilityAfterUse`（1回で自壊）。⚠**`loseAbilityAfterUse` を落とすと無限バリアになる**
  //    （`PREVENT_LRIG_DAMAGE` の既定は回数無制限）。
  // ⚠条件は「手札が0枚であるかぎり」＝`ActiveCondition`（毎回判定）であって使用時1回の `condition` ではない。
  "WXK01-002": [
    {"effectId":"WXK01-002-E1","effectType":"CONTINUOUS","activeCondition":{"type":"COUNT_THRESHOLD","location":"hand","owner":"self","operator":"eq","value":0},"action":{"type":"STUB","id":"PREVENT_LRIG_DAMAGE","loseAbilityAfterUse":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.4 O-10（続き510）＝解体。「【常】：このシグニが中央のシグニゾーンにあるかぎり、あなたが対戦相手のターンに
  //   アーツを使用する場合、そのアーツの使用コストは《無×2》減り、ターン終了時まで、この能力を失う。」
  //   🔑**軽減の funnel は `computeArtsEffectiveCost` の `artsThresholdReductions`**（ArtsModal／CutinModal／
  //     BattleScreen の3入口が同じ関数を通る）＝`minTotalCost:0` の項として合流させる（`collectOppTurnArtsCostReductions`）。
  //   ⚠**1回で自壊**＝アーツ使用の確定地点で `lost_ability_effect_ids_this_turn`（§6.4 O-10 続き507）へ刻む。
  //     刻まないと同じターンに何度でも軽減される。
  //   ⚠「対戦相手のターンに」を落とすと**常時軽減**になる＝収集器が `isOwnerTurn` で先に落とす。
  "WXK03-071": [
    {"effectId":"WXK03-071-E1","effectType":"CONTINUOUS","activeCondition":{"type":"IS_SELF_IN_CENTER_ZONE"},"action":{"type":"STUB","id":"OPP_TURN_ARTS_COST_REDUCTION_ONCE","value":"無","count":2},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P01-003": [
    {"effectId":"WXDi-P01-003-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":5}]},"condition":{"type":"FIELD_LRIGS_HAVE_COLORS","owner":"self","colors":["白","青"]},"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ","isFrozen":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WD23-023-E": [
    {"effectId":"WD23-023-E-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[
      {"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":false},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{},"maxCount":1,"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":false,"fromSearch":true},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ,
    {"effectId":"WD23-023-E-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":false},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_HAS_BURST"},"then":{"type":"ADD_TO_LIFE","owner":"opponent","count":1,"fromTop":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"byEffect":true}},
  ],
  "WX14-026": [
    {"effectId":"WX14-026-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[
      {"type":"DRAW","owner":"self","count":1},
      {"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true,"optional":true},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"DRAW","owner":"self","count":1}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX19-Re10": [
    {"effectId":"WX19-Re10-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[
      {"type":"TRANSFER_TO_HAND","source":{"type":"LIFE_CLOTH_CARD","owner":"self","count":1}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":false,"fromHand":true}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX24-P2-087": [
    {"effectId":"WX24-P2-087-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"植物"},"upToCount":false},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX24-P2-087-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true}},"delta":0},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true,"isUp":true}},"optional":true},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 B-group tractable fixes (2026-07-24).
  // WXDi-P02-039-E1: the collector already excludes the watcher itself for any_ally ON_PLAY
  // and supplies triggeringCardNum, so both power modifications are exact.
  // E2: frontOfSelf is wired for BANISH, allowing the quoted attack ability to remain exact.
  "WXDi-P02-039": [
    {"effectId":"WXDi-P02-039-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","story":"地獣","excludeSelf":true},"action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"}},"targetsTriggerSource":true,"delta":4000,"duration":"UNTIL_END_OF_TURN"},
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"delta":4000,"duration":"UNTIL_END_OF_TURN"}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P02-039-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","powerRange":{"min":20000}}},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-P02-039-E2-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000},"frontOfSelf":true},"upToCount":false},"abortIfNoCandidate":true},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","無"]},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000},"frontOfSelf":true},"upToCount":false},"targetsStored":true}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // The revealed/picked SIGNI is recorded in lastProcessedCards by resumeSearch.
  // A non-SIGNI top card produces no SEARCH interaction, so the nested action is not run.
  "WX24-P3-063": [
    {"effectId":"WX24-P3-063-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ"},"pickCount":1,"then":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","levelEqLastProcessed":true}},"until":"UNTIL_END_OF_TURN"},"remainder":{"location":"deck","position":"top"}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // E1 is retained exactly: any allied <Demon> banish, with levelLtTrigger for the revived SIGNI.
  // BURST choice 1 records the two discarded cards; the life-cloth add is gated on that exact count.
  "WD14-011": [
    {"effectId":"WD14-011-E1","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"any_ally","triggerFilter":{"story":"悪魔"},"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelLtTrigger":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WD14-011-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
      {"choiceId":"discard-life","label":"手札を2枚捨て、この方法で2枚捨てた場合デッキの一番上をライフクロスに加える","action":{"type":"SEQUENCE","steps":[
        {"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2}},
        {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}
      ]}},
      {"choiceId":"recover-demon","label":"トラッシュから＜悪魔＞のシグニ1枚を手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"悪魔"}}}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 tail / WDK07-E15. ACCE_FROM_HAND cannot represent a picked
  // deck card or the fixed "this SIGNI" host, so use the dedicated exact path.
  "WDK07-E15": [
    {"effectId":"WDK07-E15-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","story":"調理"},"pickCount":1,"then":{"type":"STUB","id":"INTERNAL_ACCE_PICKED_TO_SELF"},"remainder":{"location":"deck","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 engine-foundation wave: leave-field gates, LOOK trash provenance,
  // fixed targets across optional costs, and parameterized assassin.
  "WX25-P1-052": [
    {"effectId":"WX25-P1-052-E1","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","story":"天使"},"triggerCondition":{"turnOwner":"opponent"},"condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"永らえし冒険者　タウィル＝トレ"}},"usageLimit":"once_per_turn","action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"filter":{"cardType":"シグニ","level":{"max":2},"story":"天使"},"pickCount":1,"then":"field","suppressOnPlay":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ,
    {"effectId":"WX25-P1-052-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"cardType":"シグニ","story":"天使"},"pickCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P1-103": [
    {"effectId":"WX25-P1-103-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[
      {"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":3,"private":true,"reorder":true,"canTrash":true,"destination":{"location":"deck","owner":"self","position":"bottom"}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_LOOK_TRASHED_MATCHES","filter":{"cardType":"シグニ","story":"古代兵器"}},"then":{"type":"SEQUENCE","steps":[
        {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},
        {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
        {"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS"},
        {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true,"delta":-5000,"duration":"UNTIL_END_OF_TURN"}}
      ]}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX25-P3-062": [
    {"effectId":"WX25-P3-062-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"虚幸の冥者　ハナレ"}},"action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS"},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[
        {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true,"delta":-20000,"duration":"UNTIL_END_OF_TURN"},
        {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":-20000,"duration":"UNTIL_END_OF_TURN"}
      ]}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ,
    {"effectId":"WX25-P3-062-E1","effectType":"AUTO","timing":["ON_OPP_POWER_DECREASED"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"delta":0,"deltaFromOppPowerDecrease":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"turnOwner":"self","powerDecreaseSourceStory":"毒牙","powerDecreaseExcludeSelf":true}},
  ],
  "WX25-P2-084": [
    {"effectId":"WX25-P2-084-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
      {"choiceId":"c0","label":"他の＜武勇＞がいる場合、相手シグニ2体までを凍結","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"武勇"},"excludeSelf":true},"action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"}}}},
      {"choiceId":"c1","label":"＜武勇＞をエナからトラッシュして条件付きアサシンを得る","action":{"type":"SEQUENCE","steps":[
        {"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS"},
        {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"アサシン:{\"isFrozen\":true,\"powerLte\":3000}","duration":"UNTIL_END_OF_TURN"}}
      ]}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // Batch 7: an optional virus extra cost determines the following CHOOSE count.
  // PLAN §6.3 batch 8: opponent escape payment and composite/dynamic optional costs.
  // ⚠**払うのは付与された側（＝そのシグニの持ち主）＝`ownerState`**（§6.4 O-30・2026-08-15 続き495 で是正）。
  //   `granted_effects` は付与先の持ち主の state に積まれ、`collectAttackerSelfTriggers` は
  //   `playerId: attackerId`（＝そのシグニの持ち主）でスタックに積むので、解決時の `ownerState` は付与された側。
  //   旧 `OPPONENT_PAY_OPTIONAL` は **`otherState`（このカードを使った側）に払わせる**逆向きだった。
  //   同じ action の `BANISH{owner:'self', thisCardOnly}` が成立している時点で `ownerState`＝付与された側と分かる。
  "WX24-P2-044": [
    {"effectId":"WX24-P2-044-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"赤","count":1},{"color":"無","count":1},{"color":"無","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX24-P2-044-sub-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["無","無","無"],"unlessPay":true},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[]},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WDK08-Y12": [
    {"effectId":"WDK08-Y12-E1","effectType":"AUTO","timing":["ON_REVEALED_FROM_HAND"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","costColors":["緑","緑","無","無"],"handDiscard":{"count":1,"filter":{"cardName":"幻水　ダンクルテウス"}}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX24-P2-048": [
    {"effectId":"WX24-P2-048-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"満月の使徒　小湊るう子"}},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"対象のレベルにつき白1枚を捨て、手札に戻す","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"STUB","id":"OPTIONAL_COST","handDiscardCountFromTargetLevel":true,"handDiscardFilter":{"color":"白"}},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}]}},{"choiceId":"c1","label":"手札をすべて捨て、6枚以上ならライフクロスを手札に加える","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":"ALL"},"optional":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":6,"verbJa":"捨てた"},"then":{"type":"STUB","id":"CRASH_LIFE_TO_HAND"}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX16-048": [
    {"effectId":"WX16-048-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"STUB","id":"EXTRA_COST_REMOVE_VIRUS","value":99},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX16-023": [
    {"effectId":"WX16-023-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"STUB","id":"EXTRA_COST_REMOVE_VIRUS","value":2},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // Choice 1 is only available on the opponent's turn. Choice 2 fixes the old
  // IS_MY_TURN placeholder by gating BANISH on the actual optional red payment.
  "WXK10-008": [
    {"effectId":"WXK10-008-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
      {"choiceId":"energy-loss","label":"対戦相手のターンの場合、このターン、対戦相手のエナゾーンにあるカードは色と能力を失う","condition":{"type":"TURN_OWNER","owner":"opponent"},"action":{"type":"STUB","id":"OPP_ENERGY_COLORLESS_ABILITY_LOSS"}},
      {"choiceId":"banish","label":"対戦相手のパワー7000以下のシグニ1体を対象とし、《赤》を支払ってもよい。そうした場合、それをバニッシュする","action":{"type":"SEQUENCE","steps":[
        {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":7000}}},"delta":0},
        {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
        {"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},
        {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}
      ]}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // Curated CHOOSE is preserved here because the generic parser still loses two choices.
  // Dream Team requires all three LRIG slots and at least three distinct colors.
  "WXDi-P10-004": [
    {"effectId":"WXDi-P10-004-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"condition":{"type":"FIELD_LRIG_COLOR_COUNT","owner":"self","operator":"gte","value":3,"minLrigs":3},"action":{"type":"CHOOSE","choose_count":2,"from_count":3,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_AND_PICK","owner":"self","revealCount":5,"filter":{"cardType":"シグニ","cardClass":"プリパラ"},"pickCount":2,"pickUpTo":true,"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"HAND_CARD","owner":"self","count":"ALL","filter":{"cardType":"シグニ","cardClass":"プリパラ"}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"プリパラ"},"minCount":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}],"upTo":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // Dream Team requires all three LRIG slots and at least three distinct colors.
  "WXDi-P11-001": [
    {"effectId":"WXDi-P11-001-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"condition":{"type":"FIELD_LRIG_COLOR_COUNT","owner":"self","operator":"gte","value":3,"minLrigs":3},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
      {"choiceId":"banish-draw","label":"直前のターンにライフクロスが2枚以上クラッシュされていた場合、相手シグニ1体をバニッシュし2枚引く","condition":{"type":"LIFE_CRASHED_LAST_TURN","owner":"self","operator":"gte","value":2},"action":{"type":"SEQUENCE","steps":[
        {"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},
        {"type":"DRAW","owner":"self","count":2}
      ]}},
      {"choiceId":"life","label":"直前のターンにライフクロスが4枚以上クラッシュされていた場合、デッキをシャッフルし一番上をライフクロスに加える","condition":{"type":"LIFE_CRASHED_LAST_TURN","owner":"self","operator":"gte","value":4},"action":{"type":"SEQUENCE","steps":[
        {"type":"SHUFFLE_DECK","owner":"self"},
        {"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}
      ]}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // PLAN §6.3 単独バッチ9: スペルカットインの動的《無》支払いは
  // BattleScreen が pending_spell の印刷コスト合計から候補コストへ展開する。
  "WX24-P3-036": [
    {"effectId":"WX24-P3-036-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
      {"choiceId":"down","label":"対戦相手のシグニ1体をダウンする","action":{"type":"SEQUENCE","steps":[
        {"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},
        {"type":"STUB","id":"OPTIONAL_RETURN_SELF_ARTS_FIRST_USE"}
      ]}},
      {"choiceId":"counter","label":"対象スペルのコスト合計分《無》を支払い、その効果を打ち消す","action":{"type":"SEQUENCE","steps":[
        {"type":"COUNTER_SPELL"},
        {"type":"STUB","id":"OPTIONAL_RETURN_SELF_ARTS_FIRST_USE"}
      ]}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // ピースカットインの pending_piece/応答窓は未実装。①を偽実装せず STUB に残し、
  // 通常使用でも正しく解決できる②だけを実装する。
  // §6.4 O-10（続き517）＝**使用条件を復元**した（機構＝カットイン窓はまだ無い）。
  // 原文「【使用条件】【チーム】＜きゅるきゅるーん☆＞ このピースは、対戦相手が【使用条件】【チーム】を持つ
  //   ピースを使用する際、**カットインして使用できる**。…」
  // 🔴従来は `condition` が丸ごと無く、**チームが揃っていなくても・カットイン窓でなくても
  //   メイン／アタックフェイズにいつでも撃てた**（選択肢②＝「1枚引き＋エナチャージ1」が《青×0》で撃ち放題）。
  //   ⇒ `LRIG_TEAM_COUNT{きゅるきゅるーん☆, gte 3}`（同族11効果と同じ形）＋ `OPP_USING_TEAM_PIECE`。
  // ⚠`OPP_USING_TEAM_PIECE` は**窓が無い間は常に false**＝この札は使えない（宣言済みの過少）。
  //   使えないのは過少だが、**カットイン専用札が通常タイミングで撃てるのは過剰**なので false に倒すのが正しい。
  "WXDi-P05-006": [
    {"effectId":"WXDi-P05-006-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"condition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"きゅるきゅるーん☆","operator":"gte","value":3},{"type":"OPP_USING_TEAM_PIECE"}]},"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
      {"choiceId":"counter-piece","label":"チームピースの効果を打ち消し、ゲームから除外する","action":{"type":"STUB","id":"COUNTER_TEAM_PIECE_AND_EXILE"}},
      {"choiceId":"draw-energy","label":"カードを1枚引き、エナチャージ1","action":{"type":"SEQUENCE","steps":[
        {"type":"DRAW","owner":"self","count":1},
        {"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}
      ]}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // 移動結果軸: 実際に目的ゾーンへ到達したカードで後段を判定する（ターン所有者ではなく）。
  "WXDi-P06-036": [
    {"effectId":"WXDi-P06-036-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[
      {"type":"REVEAL_DECK_TOP","owner":"self","count":1},
      {"type":"DRAW","owner":"self","count":1},
      {"type":"STUB","id":"RESTORE_REVEALED_DECK_CARDS"},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"宝石"}},"then":{"type":"SEQUENCE","steps":[
        {"type":"STUB","id":"OPTIONAL_COST","costColors":["青","赤","無"]},
        {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}
      ]}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
    "WXDi-P03-044": [
      {"effectId":"WXDi-P03-044-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[
        {"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},
        {"type":"CONDITIONAL","condition":{"type":"SELF_DECK_TO_ENERGY_THIS_TURN","operator":"gte","value":3},"then":{"type":"SEQUENCE","steps":[
          {"type":"STUB","id":"OPTIONAL_COST","costColors":["緑","赤","無"]},
          {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}
        ]}}
      ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
    ],
  "WDK11-001": [
    {"effectId":"WDK11-001-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"ＧＦ　ノーマン＆レイ"}},"then":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"OPTIONAL_COST","costColors":["白"]},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"英知"}}}}
    ]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P01-082": [
    {"effectId":"WXDi-P01-082-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[
      {"type":"REVEAL_DECK_TOP","owner":"self","count":1},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":1}},"then":{"type":"SEQUENCE","steps":[
        {"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","noGuard":true}}},
        {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":1}}}
      ]}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WXK09-100": [
    {"effectId":"WXK09-100-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[
      {"type":"MILL","owner":"self","count":2,"alsoOpponent":true},
      {"type":"CONDITIONAL","condition":{"type":"TRASHED_DISTINCT_LEVELS_GTE","count":0,"allSigniDistinct":true},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-1000}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.3 C tail: accumulate both players' actual deck-bottom mill results,
  // then test the SIGNI level sum and modify only the opposing front SIGNI.
  "PR-K049": [
    {"effectId":"PR-K049-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"MILL","owner":"self","count":1,"fromBottom":true,"alsoOpponent":true},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_LEVEL_SUM","operator":"gte","value":6},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"delta":-5000,"duration":"UNTIL_END_OF_TURN"}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // Fix the target before the optional payment. A successful move of that
  // exact opposing SIGNI grants Double Crush only to this attacker.
  // ⚠加える先は **あなたの** ライフクロス（ADD_TO_LIFE.owner:'self'）。原文「それをライフクロスに加える」は
  //   加える先を修飾していない＝効果の使用者側（CSV 全文で、相手のライフに加える文型は必ず
  //   「対戦相手は/対戦相手の…ライフクロスに加える」と明示される）。owner:'opponent' にすると
  //   相手にライフを与える真逆の効果になる（2026-07-28 検証是正）。
  "WX24-P4-045": [
    {"effectId":"WX24-P4-045-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":0},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","無"]},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"SEQUENCE","steps":[
        {"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":false,"fromField":true,"target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true},
        {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}}
      ]}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // Move up to two ACCE-icon SIGNI from hand and gate the draw on the exact
  // number ENERGY_CHARGE recorded as actually moved.
  "WX22-043": [
    {"effectId":"WX22-043-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[
      {"type":"ENERGY_CHARGE","target":{"type":"HAND_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","hasIcon":"アクセ"}}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"DRAW","owner":"self","count":1}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK03-048": [
    {"effectId":"WXK03-048-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"OPTIONAL_COST","costText":"このシグニを場からトラッシュに置いてもよい"},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"self","count":"ALL","upToCount":false,"filter":{"cardType":"シグニ"}}}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"遊具"},"minCount":2,"verbJa":"手札に戻った"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"filter":{"cardType":"シグニ","story":"遊具"},"pickCount":3,"pickUpTo":true,"then":{"type":"ADD_TO_FIELD","owner":"self"},"remainder":{"location":"deck","position":"split_top_bottom","reorder":true}}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.3 G/B: the optional red payment is a three-way replacement, never cumulative.
  "SPK06-01": [
    {"effectId":"SPK06-01-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":2}]},"action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"OPTIONAL_COST","additionalCostChoices":[
        {"id":"pay_red4","label":"追加で《赤×4》を支払う","costColors":["赤","赤","赤","赤"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":3,"filter":{"cardType":"シグニ"},"upToCount":false}}},
        {"id":"pay_red2","label":"追加で《赤×2》を支払う","costColors":["赤","赤"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":false}}}
      ],"unpaidAction":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},
      {"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // §6.3 G/B: select the targets once, then replace -4000 with -12000 when either player refreshed this turn.
  "WXK06-032": [
    {"effectId":"WXK06-032-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"}},"delta":0},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"CONDITIONAL","condition":{"type":"ANY_PLAYER_REFRESHED_THIS_TURN"},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":2},"targetsStored":true,"delta":-12000,"duration":"UNTIL_END_OF_TURN"},"else":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":2},"targetsStored":true,"delta":-4000,"duration":"UNTIL_END_OF_TURN"}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P08-037": [
    {"effectId":"WXDi-P08-037-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ"},"pickCount":1,"then":{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","isUp":true}},"swap":true,"swapWithLastProcessed":true,"optional":true,"suppressOnPlay":true},"remainder":{"location":"deck","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WXK11-024": [
    {"effectId":"WXK11-024-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":"ALL"},"shuffle":true,"optional":true},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":15,"verbJa":"デッキに加えた"},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK06-031": [
    {"effectId":"WXK06-031-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","color":"黒","levelRange":{"min":1,"max":4}},"maxCount":4,"selectionConstraint":{"distinct":"level"},"then":{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":4,"verbJa":"トラッシュに置いた"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WDK08-Y01": [
    {"effectId":"WDK08-Y01-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"delta":0},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":4,"filter":{"cardType":"シグニ","story":"水獣"}}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":4,"verbJa":"公開した"},"then":{"type":"DRAW","owner":"self","count":1}},
      {"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LAST_PROCESSED_COUNT_GTE","value":4,"verbJa":"公開した"},{"type":"TRASHED_DISTINCT_LEVELS_GTE","count":4,"allSigniDistinct":true}]},"then":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.3 H1: use-prep virus removal is carried by pending_spell; 2+ removals change this CHOOSE to "up to 2".
  "WX15-067": [
    {"effectId":"WX15-067-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":2}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"preUseVirusChoose":{"minRemoved":2,"thenChooseCount":2,"thenUpTo":true},"choices":[
      {"choiceId":"c0","label":"トラッシュから黒のシグニ1枚を手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒"}}}},
      {"choiceId":"c1","label":"対戦相手のシグニ1体をターン終了時まで－7000","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-7000,"duration":"UNTIL_END_OF_TURN"}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // §3 task12(xxii) B2: the effective-limit gate is implemented; the all-zone reset/exile/face-down body is atomic defer.
  "WXDi-P11-010A": [
    {"effectId":"WXDi-P11-010A-E1","effectType":"AUTO","timing":["ON_GROW_PHASE_START"],"action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"GAIN_ABILITY_THIS_GAME"},
      {"type":"CONDITIONAL","condition":{"type":"EFFECTIVE_LRIG_LIMIT_GTE","value":9},"then":{"type":"STUB","id":"MUGEN_Q_RESET_AND_FLIP"}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §6.3 J-4（続き384）: timing を配線して**実際に発動する**ようになったので、action 側の既存誤 parse を是正する。
  //   `WXK11-018-E2`＝「このシグニより低いレベルを持つあなたのシグニ1体」が汎用アナフォラ解決で `thisCardOnly`
  //   （＝自分自身をアップ）に化けていた。型にも engine にもある `levelLtSelf` を使う（doc コメントが本カードを名指し）。
  "WXK11-018": [
    {"effectId":"WXK11-018-E2","effectType":"AUTO","timing":["ON_ATTACK_END"],"action":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","levelLtSelf":true,"excludeSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","triggerCondition":{"attackDealtNoDamage":true},"usageLimit":"once_per_turn"}
  ],
  // §5.3 `O-77`（2026-08-29）＝`WX24-P2-075-E1` の手書きコピーは**削除した**。
  //   parser が `LRIG_UNDER_CARD_OP` の catch-all から `TRANSFER_TO_DECK{position:bottom, optional}` を
  //   出せるようになり、**実体が1バイト違わず一致した**（`censusManualDrift` の削除候補・§CODEX_GUIDE `5-10′`）。
  //   ⚠残すと影武者コピーになり、この効果だけ以後の parser 改善が永久に届かない。
  "WXDi-P11-010B": [
    {"effectId":"WXDi-P11-010B-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":1}]},"action":{"type":"EXILE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
  ],
  // §3 task12(xxii) B3: do not charge the all-hand/all-energy cost while the paired free-grow payoff is unavailable.
  "WXDi-P13-003A": [
    {"effectId":"WXDi-P13-003A-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"condition":{"type":"CENTER_LRIG_NOT_GROWN_THIS_TURN","owner":"self"},"action":{"type":"STUB","id":"MAYU_ENCOUNTER_FLIP_AND_GROW"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // §3 task12(xxxix) final batch: preserve the pre-reveal target across the reveal confirmation pause.
  "WXEX1-66": [
    {"effectId":"WXEX1-66-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":4,"private":false,"reorder":false,"canTrash":false,"shuffle":true,"destination":{"location":"deck","owner":"self","position":"bottom"}},
      {"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"operator":"eq","value":4,"distinctName":true,"verbJa":"公開された"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1},"targetsStored":true}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // ON_LEAVE_FIELD already snapshots the former under-stack; restrict both optional-cost branches to that set.
  "WXDi-P06-039": [
    {"effectId":"WXDi-P06-039-E1","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"triggerScope":"self","triggerCondition":{"outsideMainPhase":true},"action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"OPTIONAL_COST","costColors":["無","無"]},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},
        "then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ"},"fromLeftFieldUnder":true},"asDown":true,"suppressOnPlay":true},
        "else":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ"},"fromLeftFieldUnder":true}}}
    ]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXEX2-21": [
    {"effectId":"WXEX2-21-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":1,"countFromZone":{"zone":"trash","owner":"self","filter":{"cardType":"シグニ","story":"悪魔"}}}},
      {"type":"CONDITIONAL","condition":{"type":"DECK_COUNT","owner":"opponent","operator":"eq","value":0},"then":{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"GUARD","until":"END_OF_ATTACK"}}
    ]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §5.3 `O-81`（2026-08-26）＝**手札からカードを裏向きで付ける**唯一のカード（母集団は実測1件）。
  // 原文（E2）＝「【起】カンニング《アタックフェイズアイコン》《コインアイコン》：あなたのシグニ１体を対象とし、
  //   それにあなたの手札からカード１枚を裏向きで付ける。そのシグニが場を離れる場合、追加でこれによって付けた
  //   カードを公開し手札に戻す。この方法でシグニを公開したとき、そのカードと同じレベルの対戦相手のシグニ１体を
  //   対象とし、それをバニッシュする。」
  // 🔴**MANUAL 化する理由**＝第2文以降は【起】の中では解決せず、**ホストが場を離れたときに効く別の watcher**
  //   になる。文単位の parser は1つの ACTIVATED しか組めず、旧 AUTO 出力は
  //   **第2文を「自分のシグニを即バウンス」・第3文を「無条件バニッシュ」に化けさせていた**（過剰実行）。
  // ⚠**【チャーム】ではない**（原文に【チャーム】の語が無い）＝受け皿は `field.signi_facedown_attached`。
  //   `signi_charms` に入れると `hasCharm`／`CHARM_COUNT`／`ON_CHARM_TO_TRASH`／`IS_SELF_CHARMED` が
  //   軒並み過剰発火し、同じシグニに【チャーム】と併存もできなくなる。
  // ■ 公開して手札に戻す部分は `removeFromField`（全離脱経路が通る唯一の funnel）が行い、
  //   `facedown_revealed_just` に刻む。E3 はその**バニッシュだけ**を担当する。
  "WX16-003": [
    {"effectId":"WX16-003-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"ATTACH_FACEDOWN_FROM_HAND","to":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"}},"count":1},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX16-003-E3","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"triggerScope":"any_ally","condition":{"type":"FACEDOWN_REVEALED_JUST","filter":{"cardType":"シグニ"}},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelEqFacedownRevealed":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // WX16-004 THREE OUT：2コインベット時、ターン終了時までホログラフのトップ公開を3枚並べ替え後の公開へ置換。
  "WX16-004": [
    {"effectId":"WX16-004-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"青","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING","minCoins":2},"then":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WX16-004-E1-GRANT","effectType":"CONTINUOUS","action":{"type":"STUB","id":"HOLOGRAPH_REVEAL_REPLACE"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}],"rawText":"【常】：ホログラフの効果によってあなたのデッキの一番上を公開する場合、代わりにあなたはデッキの上からカードを３枚見て、それらを好きな順番でデッキの上に戻してからデッキの一番上を公開する。"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // WXDi-P03-086-E1: 対象 action とトリガー主語が別層で、curated の action を保ったまま
  // 「他の＜アーム＞」だけを collectFieldTriggers の triggerFilter.excludeSelf へ届けるため MANUAL 化。
  "WXDi-P03-086": [
    {"effectId":"WXDi-P03-086-E1","effectType":"AUTO","timing":["ON_PLAY"],"triggerScope":"any_ally","triggerFilter":{"cardType":"シグニ","story":"アーム","excludeSelf":true},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-2000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
  ],
  // task12(lxxxiii) 第4波：対象宣言を既存 lastProcessed/storedTarget 機構へ接続。
  "WX26-CP1-092": [
    {"effectId":"WX26-CP1-092-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"プリオケ","excludeSelf":true},"upToCount":false}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"trash","label":"デッキ上2枚をトラッシュに置く","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":2}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"story":"プリオケ"},"minCount":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"targetsStored":true,"delta":5000,"duration":"UNTIL_OPP_TURN_END"}}]}},{"choiceId":"skip","label":"置かない","action":{"type":"STUB","id":"INTERNAL_NOOP"}}]}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK11-065": [
    {"effectId":"WXK11-065-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"緑","excludeSelf":true},"upToCount":false},"delta":4000,"duration":"UNTIL_END_OF_TURN"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_POWER_GTE","value":10000,"addDelta":4000},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"targetsLastProcessed":true,"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-CP02-066": [
    {"effectId":"WXDi-CP02-066-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"ブルアカ","excludeSelf":true},"upToCount":false}},{"type":"BANISH_REDIRECT","target":{"type":"SIGNI","owner":"self","count":1},"targetsLastProcessed":true,"redirectTo":"trash","until":"END_OF_TURN","bySource":"battle_with_this"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // task12(lxxxiii) 第9波：対象を1度だけ選び、同じ他の緑＜ブルアカ＞へ+5000と引用【常】を付与。
  "WX25-CP1-044": [
    {"effectId":"WX25-CP1-044-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"緑","story":"ブルアカ","excludeSelf":true}},"delta":5000,"duration":"UNTIL_END_OF_TURN"},
      {"type":"GRANT_EFFECT","target":{"type":"SIGNI","owner":"self","count":1},"targetsLastProcessed":true,"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WX25-CP1-044-E2-G","effectType":"CONTINUOUS","action":{"type":"STUB","id":"PREVENT_ABILITY_GAIN_BY_OPP"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}}
    ]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // 対象数は storedTargetCards に固定する。MILL の既存 countPerStoredTargets が CHOOSE pause 後も同数を使う。
  "WX25-CP1-087": [
    {"effectId":"WX25-CP1-087-E1","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[
      {"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","story":"ブルアカ","excludeSelf":true}}},
      {"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},
      {"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[
        {"choiceId":"trash","label":"対象にした体数ぶんデッキの上からトラッシュに置く","action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":0,"countPerStoredTargets":1},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":2},"targetsStored":true,"delta":3000,"duration":"UNTIL_OPP_TURN_END"}]}},
        {"choiceId":"skip","label":"置かない","action":{"type":"STUB","id":"INTERNAL_NOOP"}}
      ]}
    ]},"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // 赤 OR ＜宝石＞の和集合。単一 ALL action なので両方に該当しても+2000は一度だけ。
  "WXDi-P08-065": [
    {"effectId":"WXDi-P08-065-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","excludeSelf":true,"anyOf":[{"color":"赤"},{"story":"宝石"}]}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXK10-067": [
    {"effectId":"WXK10-067-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"赤","count":1}]},"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"古代兵器","excludeSelf":true},"upToCount":false}},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","nameEqLastProcessed":true},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX20-028": [
    {"effectId":"WX20-028-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_IS_ACCED","minCount":3},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"TRASH_SELF_ACCE_ALL"},{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":"ALL"}},{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  // §6.3 E-2 第1波：起動時の即時手札破壊ではなく、現在ターン＋次の相手ターンを監視する付与AUTO。
  "WX25-P3-023": [
    // 🆕§5.3 `O-148`（2026-09-02）＝選択肢②「対戦相手は【みこみこ親衛隊】1つを得る」。
    //   旧は `GRANT_KEYWORD`（シグニへのキーワード付与）＝engine に消費が無い真 no-op だった。
    {"effectId":"WX25-P3-023-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"微菌"}},"then":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"対戦相手は手札を1枚捨てる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}},{"choiceId":"c1","label":"対戦相手は【みこみこ親衛隊】1つを得る","action":{"type":"STUB","id":"GAIN_MIKOMIKO_GUARD","value":1}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","usageLimit":"twice_per_turn"},
    {"effectId":"WX25-P3-023-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"GRANT_LRIG_ABILITY","duration":"UNTIL_OPP_TURN_END","rawText":"グロウフェイズ以外で対戦相手の効果１つによってカードが合計１枚以上対戦相手の手札に移動したとき、対戦相手の手札を１枚見ないで選び、捨てさせる。","abilities":[{"effectId":"WX25-P3-023-E2-GRANT","effectType":"AUTO","timing":["ON_HAND_ADDED"],"action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"handOwner":"opponent","byOpponentEffect":true,"excludeGrowPhase":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}
  ],
  // §6.4 続き444: 公開停止を「レベル4の＜宇宙＞4枚」に限定し、任意公開と既存の4枚成立ゲートを共存させる。
  // parser の一般文分割は「この方法で…4枚公開した場合」を IS_MY_TURN に誤解し、末尾の全公開札トラッシュも
  // DECK_CARD 1枚へ縮退するため、この1効果だけは curated 全体を正として保持する。
  "WXK07-031": [
    {"effectId":"WXK07-031-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_UNTIL","owner":"self","stopCondition":{"kind":"signiCount","count":4,"filter":{"cardType":"シグニ","level":4,"story":"宇宙"}},"restDestination":"trash","optional":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","level":4,"story":"宇宙"},"operator":"eq","value":4},"then":{"type":"STUB","id":"REMOVE_SIGNI_ZONE"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],

  // ── §5.3 `O-133` 第2バッチ（2026-08-28 続き704）＝**C群＝parser が出さない live 固有 id** ──
  // 🔴これらは live の JSON へ直接足された手書き効果で、`manualEffects.ts` に出所が無かった。
  //   収穫マージは live の MANUAL を不可侵にするので**動きはする**が、
  //   ①id 集合がズレて **カード丸ごと凍る**（`O-39`＝そのカードの AUTO 効果にも parser 改善が届かない）
  //   ②`censusManualDrift` の母集団に入らず**乖離しても誰も気づかない**、の二重の死角だった。
  // ⇒ **live の JSON を逐語コピー**してここへ移した（実体は1バイトも変えていない）。
  //   `mergeManualEffects` は manual 側だけの id を**追加する**ので、これで fresh と live の id 集合が揃う。
  "WX14-060": [{"effectId":"WX14-060-E2","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"COUNT_THRESHOLD","location":"hand","owner":"self","operator":"gte","value":6}]},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["any"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX14-060-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"COUNT_THRESHOLD","location":"hand","owner":"self","operator":"gte","value":6}]},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":15000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX14-061": [{"effectId":"WX14-061-E2","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"COUNT_THRESHOLD","location":"hand","owner":"self","operator":"gte","value":6}]},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["any"],"sourceOwner":"opponent","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX14-061-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"COUNT_THRESHOLD","location":"hand","owner":"self","operator":"gte","value":6}]},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":12000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX16-062": [{"effectId":"WX16-062-TRAP","effectType":"TRAP_ICON","timing":["ON_TRAP_ACTIVATE"],"action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":3}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}],
  "WX16-064": [{"effectId":"WX16-064-TRAP","effectType":"TRAP_ICON","timing":["ON_TRAP_ACTIVATE"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","powerRange":{"max":2000}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX17-028": [{"effectId":"WX17-028-E2","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":4},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerLteRevealedSigniLevelSum":1000}}},{"type":"TRASH_REVEALED","owner":"self"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX17-028-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":4,"filter":{"cardType":"シグニ","story":"宇宙"},"selectionConstraint":{"distinct":"level"}},"shuffle":true,"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX20-038": [{"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL","effectId":"WX20-038-E1b","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"PERMANENT"}}, {"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL","effectId":"WX20-038-E1c","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["BANISH","DOWN"],"sourceOwner":"opponent","duration":"PERMANENT"}}],
  // WXEX2-69 ／ 原文【常】：**あなたのターンの間**、これにアクセされている＜調理＞のシグニのパワーを＋3000し、それは
  //   「【自】：このシグニがアタックしたとき、次の対戦相手のターン終了時まで、対戦相手はアーツとスペルを使用できない。」を得る。
  // 🔴旧 live の E3＝パワーも付与も消え、**常時いきなり相手のアーツ／スペルを封じて**いた（census 高シグナル 第4弾）。
  // 🔑パワーは別レコードのまま（CONTINUOUS の POWER_MODIFY は `calcFieldPowers` が単独ノードで拾う）だが、
  //   **id を `-E3P` から `-E3b` へ改名**した＝`vocabCensus` の兄弟畳み込みは**小文字1字サフィックス**だけを
  //   親（`-E3`）へ畳む規約なので、大文字 `P` のままだと親が「3000 が無い」と誤検出される。
  //   ⚠あわせて原文どおり `activeCondition:{TURN_OWNER self}` を足した（旧レコードは相手ターンにも +3000 していた）。
  "WXEX2-69": [
    {"effectId":"WXEX2-69-E3b","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"acceHost":true,"cardClass":"調理"}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXEX2-69-E3","effectType":"CONTINUOUS","activeCondition":{"type":"TURN_OWNER","owner":"self"},"action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WXEX2-69-E3-GRANT","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"USE_ARTS","until":"NEXT_TURN"},{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"USE_SPELL","until":"NEXT_TURN"}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WXDi-P03-016": [{"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","effectId":"WXDi-P03-016-E1b","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":5000}}],
  "WXDi-CP02-103": [{"effectId":"WXDi-CP02-103-E2","effectType":"CONTINUOUS","action":{"type":"STUB","id":"TREAT_AS_CLASS_ALL_ZONES"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // 🔑E1（【常】：【シュート】）は **`-E1b`→`-E2` の改名で原文ブロックの割り当てが直り、parser が正しい
  //   `GRANT_KEYWORD{thisCardOnly,'シュート'}` を出すようになった**ので manual には置かない（`O-42` tripwire）。
  //   旧 live は**パワー＋5000**という無関係な効果だった＝E2 の内容が E1 の枠へ漏れていた。
  "WX24-P4-058": [
    {"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL","effectId":"WX24-P4-058-E2","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"usageLimit":"once_per_turn","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000,"duration":"UNTIL_OPP_TURN_END"}}],
    // 🔑E1（【起】…：【エナチャージ１】）は manual に置かない＝`-E1b`→`-E2` の改名で原文ブロックの割り当てが直り、
  //   parser が正しい JSON を出すようになった（`O-42` tripwire）。旧 live には**原文に無い `LIFE_CRASH{opponent}`**
  //   が `CONDITIONAL{IS_MY_TURN}` の下にぶら下がっていた＝E2 の帰結節が E1 の枠へ漏れていた。
  "WX25-P1-054": [
{"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","effectId":"WX25-P1-054-E2","effectType":"AUTO","timing":["ON_HEAVEN"],"usageLimit":"once_per_turn","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"合炎奇炎　タマヨリヒメ之参"}},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}}]}}],
  "WX25-P2-009": [{"effectId":"WX25-P2-009-ACT","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"INSTALL_GAME_GRANTED_AUTO"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}, {"effectId":"WX25-P2-009-E2","effectType":"AUTO","timing":["ON_CARD_MILLED_FROM_DECK"],"triggerCondition":{"turnOwner":"self"},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","usageLimit":"once_per_turn"},
    {"effectId":"WX25-P2-009-E1","effectType":"AUTO","timing":["ON_OPP_LIFE_CRASHED"],"action":{"type":"STUB","id":"REPLACE_NEXT_OPP_REFRESH_MILL_LRIG"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self","usageLimit":"once_per_game"},
  ],
  "WXK01-074": [{"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","effectId":"WXK01-074-E1b","effectType":"AUTO","timing":["ON_SIGNI_BECOMES_DRIVE"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":5000}}],
  "WXK01-008": [{"effectId":"WXK01-008-E1","effectType":"ACTIVATED","timing":["MAIN"],"action":{"type":"STUB","id":"CENTER_LRIG_RIDES_ON_SIGNI"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  "WXK01-009": [{"effectId":"WXK01-009-E1","effectType":"ACTIVATED","timing":["MAIN"],"action":{"type":"STUB","id":"CENTER_LRIG_RIDES_ON_SIGNI"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],
  // §5.2 Sheet2 バッチ1（2026-08-29）＝【常】の条件と帰結が入れ替わり、後半の1文が丸ごと落ちていた。
  //   原文「他の＜空獣＞があるかぎり…『バニッシュされない』を得、他の＜地獣＞があるかぎり…＋2000され【ランサー】を得る」
  //   旧 live＝`activeCondition:空獣 → POWER_MODIFY +2000` の1本だけ（空獣で+2000／地獣は何も起きない）。
  //   ⚠E1 の `appearanceCondition`（レゾナ出現条件）は E1 側にだけ残す（E1b へ複製しない＝二重に払わせない）。
  "WX21-015": [
    {"effectId":"WX21-015-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"空獣"},"excludeSelf":true},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"バニッシュされない","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL","appearanceCondition":{"rawText":"《メインフェイズアイコン》合計２枚のレゾナではない＜空獣＞か＜地獣＞のシグニをあなたのエナゾーンと場からトラッシュに置く","timings":["MAIN"],"cost":{},"combinedTrash":{"zones":["energy","field"],"count":2,"filter":{"cardType":"シグニ","story":["空獣","地獣"],"excludeResona":true}},"paymentShape":"REQUIRES_NEW_FLOW"}},
    {"effectId":"WX21-015-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"地獣"},"excludeSelf":true},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2000},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ランサー","duration":"PERMANENT"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX21-015-E3","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","story":"空獣"},"upToCount":false,"explicitTarget":true},"keyword":"バニッシュされない","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §5.2 Sheet2 バッチ1（2026-08-29）＝発火条件と保護対象の両方が広がっていた。
  //   原文「このシグニが＜宇宙＞のレゾナの出現条件によって場からトラッシュに置かれたとき、…そのレゾナは…効果を受けない」
  //   旧 live＝`fromZones:['field']` だけ（場から落ちれば何でも発火）＋ `owner:'self',count:'ALL'`（自分のシグニ全部が守られる）。
  //   🔑受け皿は既にあった＝`forResonaCondition`/`resonaClass`（`triggerCollect.ts:1193`・先例 `WX10-055`）と
  //     `targetsTriggerSource`（`effectExecutor.ts:6084`＝「そのレゾナ」へ直接付与する分岐）。
  "WX14-049": [
    {"effectId":"WX14-049-E1","effectType":"AUTO","timing":["ON_TRASH"],"triggerCondition":{"forResonaCondition":true,"resonaClass":"宇宙","fromZones":["field"]},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"targetsTriggerSource":true,"from":["シグニ"],"sourceOwner":"opponent","duration":"UNTIL_OPP_TURN_END"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // §5.2 Sheet2 バッチ1（2026-08-29）＝公開した＜英知＞を**手札に加える処理が丸ごと落ちていた**。
  //   原文「それが＜英知＞のシグニの場合、**それを手札に加え**、…エナゾーンに置く」／旧 live の `then` はエナチャージだけ。
  //   受け皿は既存（`REVEAL_AND_PICK.then` の `ADD_TO_HAND`＝`WX02-025` ほか多数）。
  "WX18-073": [
    {"effectId":"WX18-073-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":8},"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","story":"英知"},"pickCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_HAND","owner":"self"},{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}]},"remainder":{"location":"deck","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  // §5.2 Sheet2 バッチ1（2026-08-29）＝「パワー合計が10000以下になるように好きな数」が
  //   **パワー制限なしの1体バニッシュ**に化けていた（枚数も上限も別物）。
  //   受け皿は既存（`count:"ALL"` ＋ `totalPowerMax`＝`WX07-026-BURST` ほか同型3件）。
  "WX13-030": [
    {"effectId":"WX13-030-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"},"totalPowerMax":10000}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // §5.2 Sheet2 バッチ1（2026-08-29）＝BURST のサーチ対象から**スペルの選択肢が丸ごと落ちていた**
  //   （原文「＜原子＞のシグニ１枚**かスペル１枚**を探して」／旧 live は＜原子＞のシグニしか探せない）。
  //   ⚠`cardType` 配列では表せない＝**スペルに＜原子＞は付かない**ので `story:"原子"` が両方に掛かってしまう。
  //     現行語彙で忠実に書ける形は「2つの SEARCH を `CHOOSE` で択一にする」。
  "WX13-049": [
    {"effectId":"WX13-049-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"＜原子＞のシグニ1枚を探す","label":"＜原子＞のシグニ1枚を探す","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"原子"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}},{"choiceId":"スペル1枚を探す","label":"スペル1枚を探す","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"スペル"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WDK06-R09": [{"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","effectId":"WDK06-R09-E2b","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"usageLimit":"once_per_turn","cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"any","count":1},"delta":2000}}],

  // ── §5.2 Sheet2 バッチ2（2026-08-29・§2.0 速いレーン）───────────────────────
  // 台帳（`node scripts/archive/semanticAuditLedger.mjs`）の残 OPEN のうち **Sheet2 の「1カード1 finding の HIGH」**
  // から9件。⚠**すべて受け皿は既存**＝parser がそこへ吐いていなかっただけで、新しいアクション型・条件型は0本。
  // ⚠**「そうした場合」の `CONDITIONAL{IS_MY_TURN}` は parser の慣例エンコード**（engine 特別処理あり・
  //   `effectParser.ts:8592`）＝**findings がここを「無関係な条件」と書いていたのは偽陽性**なので触っていない。

  // ① 「あなたのエナゾーンからすべてのカードをトラッシュに置き」が丸ごと落ちていた
  //    （旧 live は手札全捨て＋全バニッシュだけ＝**自分のエナを払わずに撃てる**過剰実行）。
  "WX13-001": [
    {"effectId":"WX13-001-E4","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"exceed":5},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"self","count":"ALL"}},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":"ALL"}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // ② ライフに加えるのは**対象に取ったトラッシュのカード**（旧 live は `fromTop`＝デッキの一番上）。
  //    受け皿は既存＝`ADD_TO_LIFE.fromTrash`（原文は「カード１枚」なので filter は付けない）。
  "WX13-050": [
    {"effectId":"WX13-050-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":2},{"color":"無","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":false},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":false,"fromTrash":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // ③ 「**あなたの他の**シグニ１体をバニッシュしてもよい」の owner が opponent に化けていた
  //    （＝コストのつもりが**相手を1体多く割る**過剰実行）。`excludeSelf` は旧 live のまま正しい。
  "WX14-033": [
    {"effectId":"WX14-033-E2","effectType":"AUTO","timing":["ON_SIGNI_BANISH_OPPONENT"],"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","excludeSelf":true},"upToCount":false},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  // ④ 「（この能力は、このシグニが**トラッシュにある場合にしか**使用できない）」が落ちていた＝場に居ても撃てた。
  //    受け皿は既存＝`condition:THIS_CARD_IN_LOCATION{trash}`（`WX13-038-E2`／`WX21-021-E3` と同型）。
  "WX15-Re15": [
    {"effectId":"WX15-Re15-E1","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"condition":{"type":"THIS_CARD_IN_LOCATION","location":"trash"},"cost":{"energy":[{"color":"黒","count":1},{"color":"黒","count":1},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":4,"filter":{"cardType":"シグニ","nonColorless":true},"selectionConstraint":{"distinct":"level"}},"shuffle":false,"position":"bottom"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}}},{"type":"SHUFFLE_DECK","owner":"self"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // ⑤ 《トラップアイコン》能力が**独立した能力ではなく【出】の SEQUENCE 末尾**に混ざっていた
  //    ＝【出】を撃つだけで「パワー15000以上をデッキトップへ」まで一緒に走る過剰実行。
  //    受け皿は既存＝`<CardNum>-TRAP` / `effectType:'TRAP_ICON'` / `timing:['ON_TRAP_ACTIVATE']`（`WX16-062` ほか）。
  "WX16-041": [
    {"effectId":"WX16-041-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":1,"discardFilter":{"hasIcon":"トラップ"}},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"トリック"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX16-041-TRAP","effectType":"TRAP_ICON","timing":["ON_TRAP_ACTIVATE"],"action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":15000}}},"shuffle":false,"position":"top"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // ⑥ 【レイヤー】付与能力の1本目「**このシグニの正面の**シグニ１体」が `owner:'self'` に化けていた
  //    ＝**自分のシグニの能力を自分で消す**逆向きの実行。受け皿は既存＝`filter.frontOfSelf`
  //    （`REMOVE_ABILITIES` での前例＝`WXK11-029-E2` / `WXDi-P04-049-E1`）。2本目は原文どおりなので据置。
  "WX17-035": [
    {"effectId":"WX17-035-LAYER","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","story":"怪異"},"abilities":[{"effectId":"WX17-035-LAYER-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true}},"until":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},{"effectId":"WX17-035-LAYER-E2","effectType":"AUTO","timing":["ON_BANISH"],"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // ⑦ サーチ対象の「【レイヤー】を持つ」限定が落ちていた＝**任意のシグニ**を探せた。
  //    受け皿は既存＝`TargetFilter.keyword`（`matchesFilter` が原文照合。`execSearch` はこれを消費する）。
  //    ⚠同型は `WXEX1-05` の2効果だけ＝合計2カード（§2.0 の速いレーン基準内）なので併せて是正した。
  "WX18-060": [
    {"effectId":"WX18-060-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","keyword":"レイヤー"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WXEX1-05": [
    {"effectId":"WXEX1-05-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","keyword":"レイヤー"},"maxCount":2,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXEX1-05-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS","MAIN"],"cost":{"coin":2},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","keyword":"レイヤー"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
  ],
  // ⑧ 「アタックしたそのシグニのパワーが**20000以上の場合**」が落ちていた＝緑シグニのアタック全部で撃てた。
  //    受け皿は既存＝`triggerFilter`（`collectFieldTriggers` / `attackerSelfTriggerFilterOk` が
  //    **実効パワー**を `matchesFilter` に渡す＝CONTINUOUS 増減後で判定される）。
  "WX20-046": [
    {"effectId":"WX20-046-E3","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","triggerFilter":{"color":"緑","powerRange":{"min":20000}}}
  ],
  // ⑨ `WX20-066-E1`（「**このシグニを**場から手札に戻してもよい」の owner が opponent に化けていた
  //    ＝`thisCardOnly` と `owner:'opponent'` が同居＝**相手の場に自分は居ない**ので候補0の無言 no-op）は
  //    🔴**ここに書かない**＝**parser は既に正しい JSON を出しており、live 側が `_held_fresh` に温存されて
  //    凍っていただけ**だった（`heldReview.mjs --adopt WX20-066` で解けた）。手で書くと §2.0 の禁じ手
  //    「移設だけの manual 化」になり、`§6.4 O-42` トリップワイヤ（golden）が実際に発火して検知した。
  //    ⇒ **live が原文と違うとき、まず `_held_fresh`／`_partial_fresh`／`_idset_fresh` を見る。**

  // ── §5.3 1〜3枚の機構項目（2026-08-29・速いレーン）──────────────────────
  // `O-98` A1＝対象の印字能力【ダブルクラッシュ】が付与能力へ誤着し、原文の【アサシン】が消えていた。
  "WXK10-024": [
    {"effectId":"WXK10-024-E3","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"赤","keyword":"ダブルクラッシュ"},"explicitTarget":true},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  // `O-98` A2＝選択肢②の印字能力 OR 条件が落ち、任意のシグニをバニッシュできていた。
  "WXK07-002": [
    {"effectId":"WXK07-002-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"緑","count":3},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_CENTER_LRIG"},{"type":"CHOOSE","choose_count":2,"from_count":4,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":12000}},"upToCount":false}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","keyword":["アサシン","ダブルクラッシュ"]},"upToCount":false}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":3,"filter":{"color":"緑"},"pickCount":"ALL","pickNoun":"カード","then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}},{"choiceId":"c3","label":"選択肢4","action":{"type":"PREVENT_NEXT_DAMAGE","count":1}}],"upTo":true}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // `O-98` A3＝「レゾナ」をルリグ対象へ誤分類していた。
  "WXEX1-16": [
    {"effectId":"WXEX1-16-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"レゾナ"}},"keyword":"バニッシュされない","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // `O-151(b)`＝トラッシュ枚数で決まる総量を、選んだ好きな数の相手シグニへ1000単位で割り振る。
  "WX24-P2-009": [
    {"effectId":"WX24-P2-009-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":3,"optional":true},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"}},"delta":-1000,"deltaFromZone":{"zone":"trash","owner":"self","per":-1000},"splitTotal":{"unit":1000},"duration":"UNTIL_END_OF_TURN"},{"type":"STUB","id":"RULE_REMINDER_TEXT"},{"type":"RECOLLECT_GATE","minArts":4},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","colorMatchesLrig":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // `O-94①`＝汎用 ADD_TO_FIELD の「最初の空き」ではなく、既存STUBで中央 zone[1] へ固定配置する。
  "WXDi-P03-087": [
    {"effectId":"WXDi-P03-087-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"discard":2},"action":{"type":"STUB","id":"FROM_TRASH_TO_CENTER_ZONE"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","trashActivated":true}
  ],
  // ── §5.3 1〜3枚の機構項目・manual第2バッチ（2026-08-29・速いレーン）──────
  "WD15-001": [
    {"effectId":"WD15-001-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":false},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":2}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"龍獣"},"minCount":1},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"龍獣"},"minCount":2},"then":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  // 「そのアタックの間」は既存の一時付与慣例 `UNTIL_END_OF_TURN` で表す（新しい duration は作らない）。
  "WX19-023": [
    {"effectId":"WX19-023-E2","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","usageLimit":"once_per_turn"}
  ],
  // `O-124`①＝比較元を先に対象化し、参照不能時は powerLtLastProcessed が空候補へ fail-closed する。
  "WX15-060": [
    {"effectId":"WX15-060-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":3}],"costScaling":[{"direction":"reduce","counts":[{"kind":"zone","zone":"field","owner":"self","filter":{"cardType":"シグニ","cardClass":"調理","hasAcce":true}}],"per":1,"amount":[{"color":"緑","count":1}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"}},"abortIfNoCandidate":true},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLtLastProcessed":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  // `O-124`②＝最初に選んだ赤シグニを lastProcessedCards で束縛し、追加2能力も同じ個体へ付与する。
  "SP26-008": [
    {"effectId":"SP26-008-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":6}],"costScaling":[{"direction":"reduce","counts":[{"kind":"lrigLevel","owner":"self"}],"per":1,"amount":[{"color":"赤","count":1}]}]},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","color":"赤"}},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"lte","value":2},"then":{"type":"GRANT_KEYWORD","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}},{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"GRANT_EFFECT","targetsLastProcessed":true,"target":{"type":"SIGNI","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"SP26-008-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerScope":"self","triggerFilter":{"thisCardOnly":true},"usageLimit":"once_per_turn"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // ── §5.2 Sheet2 バッチ3（2026-08-29・速いレーン）＝台帳の残 OPEN から1カード1 finding の HIGH ──
  //   受け皿はすべて既存。1件ずつ CSV 原文を読み直して手で書いた（§2.0）。
  "WX15-057": [
    {"effectId":"WX15-057-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","hasIcon":"アクセ"},"minCount":1},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX17-072": [
    {"effectId":"WX17-072-E1","effectType":"AUTO","timing":["ON_PLAY"],"activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":7},"action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"from":["BANISH"],"sourceOwner":"any","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX18-070": [
    {"effectId":"WX18-070-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":1,"filter":{"cardType":"シグニ","level":4},"pickCount":1,"then":{"type":"ADD_TO_ENERGY","owner":"self"},"remainder":{"location":"deck","position":"top"},"handOrEnergy":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"}
  ],
  "WX17-022": [
    {"effectId":"WX17-022-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"緑","count":1}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"self","label":"あなたのトラッシュ","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":"ALL"},"shuffle":true}},{"choiceId":"opponent","label":"対戦相手のトラッシュ","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"opponent","count":"ALL"},"shuffle":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX14-076": [
    {"effectId":"WX14-076-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"ATTACH_CHARM","charm":{"type":"TRASH_CARD","owner":"opponent","count":1},"to":{"type":"SIGNI","owner":"opponent","count":1}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "WX21-Re19": [
    {"effectId":"WX21-Re19-E2","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"WX21-Re19-sub-E1","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":3}},"upToCount":false,"explicitTarget":true},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_turn"}],"rawText":"【起】《ターン１回》《アタックフェイズアイコン》《白×0》：対戦相手のレベル３以下のシグニ１体を対象とし、ターン終了時まで、それは「【常】：アタックできない。」を得る。","duration":"UNTIL_OPP_TURN_END"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
  ],
  "WX21-045": [
    {"effectId":"WX21-045-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"removeOppVirus":3},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":3}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-5000,"targetsStored":true}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
  ],
  // 2026-08-29 §5.2 Sheet2 バッチ4（速いレーン）＝台帳の残 OPEN から HIGH/MED 10効果を消化。
  // いずれも**受け皿は既存**（`HAND_REVEAL_CLASS_SIGNI` / `REMOVE_VIRUS_TARGET_ZONE` /
  // `TAKE_FROM_UNDER_SIGNI` / `ChoiceOption.condition` / `BanishAction.conditional` / `discardFilter`）で、
  // engine も parser も1行も触らずに原文どおりの JSON を手書きした。
  "WX12-Re13": [
    {"effectId":"WX12-Re13-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WX12-Re13-E1-c1","label":"あなたのシグニ1体をバニッシュする。そうした場合、パワー8000以下のシグニ1体をバニッシュする","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"BANISH","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false},"conditional":true}]}},{"choiceId":"WX12-Re13-E1-c2","label":"あなたのシグニ1体をバニッシュする。そうした場合、対戦相手のエナゾーンから【マルチエナ】を持つカード1枚をトラッシュに置く","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"keyword":"マルチエナ"}}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX14-072": [
    {"effectId":"WX14-072-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WX14-072-E1-c1","label":"手札から＜天使＞のシグニ1枚を公開する","condition":{"type":"HAND_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"天使"},"operator":"gte","value":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"HAND_REVEAL_CLASS_SIGNI"},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"天使"},"maxCount":1,"then":{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}]}},{"choiceId":"WX14-072-E1-c2","label":"このシグニを場からトラッシュに置く","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX14-075": [
    {"effectId":"WX14-075-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WX14-075-E1-c1","label":"手札から＜天使＞のシグニ1枚を公開する","condition":{"type":"HAND_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"天使"},"operator":"gte","value":1},"action":{"type":"STUB","id":"HAND_REVEAL_CLASS_SIGNI"}},{"choiceId":"WX14-075-E1-c2","label":"このシグニを場からトラッシュに置く","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX15-115": [
    {"effectId":"WX15-115-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","infected":true},"upToCount":false},"delta":-5000},{"type":"STUB","id":"REMOVE_VIRUS_TARGET_ZONE"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX16-027": [
    {"effectId":"WX16-027-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_HAS_UNDER","minCount":1},"then":{"type":"SEQUENCE","steps":[{"type":"TAKE_FROM_UNDER_SIGNI","destination":"trash","count":1,"fromThis":true},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WX17-071": [
    {"effectId":"WX17-071-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WX17-071-BURST-c1","label":"あなたのトラッシュから無色のカード1枚を手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"color":"無"}}}},{"choiceId":"WX17-071-BURST-c2","label":"対戦相手の手札を見て無色のカード1枚を捨てさせる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"filter":{"color":"無"},"actingPlayerSelects":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX17-071-TRAP","effectType":"TRAP_ICON","timing":["ON_TRAP_ACTIVATE"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WX17-071-TRAP-c1","label":"あなたのトラッシュから無色のカード1枚を手札に加える","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"color":"無"}}}},{"choiceId":"WX17-071-TRAP-c2","label":"対戦相手の手札を見て無色のカード1枚を捨てさせる","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"filter":{"color":"無"},"actingPlayerSelects":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX20-062": [
    {"effectId":"WX20-062-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","cardName":"ハニトラ"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX20-062-TRAP","effectType":"TRAP_ICON","timing":["ON_TRAP_ACTIVATE"],"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardNames":["超罠　ハニトラ"]},"upToCount":false},"keyword":"アサシン","duration":"UNTIL_END_OF_TURN"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX20-063": [
    {"effectId":"WX20-063-E3","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","cardName":"Ｎｅ"}},"then":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardName":"Ｎｅ"},"upToCount":false}},{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX21-031-CB": [
    {"effectId":"WX21-031-CB-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"白","count":1}],"down_self":true,"discard":1,"discardFilter":{"cardNames":["究極　ニパ子"]}},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"UP","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // 2026-08-29 §5.2 Sheet2 バッチ5（速いレーン）＝台帳の残 OPEN から 10効果を消化。
  // 受け皿はすべて既存（`filter.color:'無'` / `hasLifeBurst` / `noAbilities` / `powerRange` /
  // `excludeSelf` / `cost.energyTrash{filter}` / `LookPickChainStage.pickUpTo` /
  // `SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS`＋`targetsStored`）。
  // ⚠`excludeSelf` だけは `execPowerSet` に配線が無かったので engine を1行だけ足した（golden で固定）。
  "WX12-004": [
    {"effectId":"WX12-004-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":1},{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true},{"type":"SEQUENCE","snapshotLastProcessedForConditionals":true,"steps":[{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}},{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"LRIG_NAME_CONTAINS","owner":"self","name":"ユヅキ"},{"type":"LAST_PROCESSED_HAS_BURST"}]},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX12-Re17": [
    {"effectId":"WX12-Re17-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1}],"trash_self":true},"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"color":"無"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX13-027": [
    {"effectId":"WX13-027-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"無","count":2}]},"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":2,"upToCount":true,"filter":{"cardType":"シグニ","hasGuard":true,"color":"無"}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX15-002": [
    {"effectId":"WX15-002-E1","effectType":"AUTO","timing":["ON_MAIN_PHASE_START"],"action":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":2,"stages":[{"pickCount":1,"pickUpTo":true,"then":"trap","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX15-049": [
    {"effectId":"WX15-049-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_TRAP_IN_FIELD","owner":"self","negate":true},"then":{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":2,"stages":[{"pickCount":1,"pickUpTo":true,"then":"trap","pickNoun":"カード"}],"remainder":{"location":"deck","position":"bottom","reorder":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"PARTIAL"},
  ],
  "WX15-097": [
    {"effectId":"WX15-097-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"down_self":true,"energyTrash":{"count":1,"filter":{"hasIcon":"アクセ"}}},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":12000}},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX16-Re08": [
    {"effectId":"WX16-Re08-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"nonColorless":true,"hasLifeBurst":true},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX19-022": [
    {"effectId":"WX19-022-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"白","count":1}]},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","noAbilities":true}},"shuffle":false,"position":"bottom"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX20-039-CB": [
    {"effectId":"WX20-039-CB-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"HAND_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","level":{"max":3},"story":"遊具","colorExclude":"赤"}},"optional":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX20-074": [
    {"effectId":"WX20-074-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"any","count":1,"explicitTarget":true,"filter":{"cardType":"シグニ","excludeSelf":true}},"value":10000},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // 2026-08-29 §5.2 Sheet3 バッチ6（速いレーン）＝台帳の残 OPEN から 12効果を消化。
  // 受け皿はすべて既存（`filter.cardName` / `hasIcon` / `powerRange` / `isDrive` / `keyword` /
  // `hasLifeBurst` / `nonColorless` / `excludeSelf` / `level` / `HAND_COUNT` /
  // `triggerCondition.duringMainPhase` / `activeCondition{TURN_OWNER}` /
  // `SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS`＋`targetsStored`）。
  "WXEX1-03": [
    {"effectId":"WXEX1-03-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"coin":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":7,"filter":{"cardType":"シグニ","story":"天使"},"selectionConstraint":{"distinct":"name"}},"shuffle":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"targetsStored":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXEX1-08": [
    {"effectId":"WXEX1-08-E1","effectType":"AUTO","timing":["ON_COIN_PAID"],"condition":{"type":"IS_BETTING"},"action":{"type":"GAIN_COIN","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXEX1-60": [
    {"effectId":"WXEX1-60-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":5,"upToCount":true,"filter":{"cardType":"シグニ","cardName":"フレイスロ"}},"shuffle":true},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","levelEqLastProcessedCount":true},"upToCount":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXEX1-63": [
    {"effectId":"WXEX1-63-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WXEX1-63-E1-c1","label":"あなたの＜乗機＞のシグニ1体をバニッシュする。そうした場合、対戦相手のパワー12000以下のシグニ1体をバニッシュする","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"乗機"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000}},"upToCount":false}}}]}},{"choiceId":"WXEX1-63-E1-c2","label":"あなたのドライブ状態の＜乗機＞のシグニ1体をバニッシュする。そうした場合、デッキから＜乗機＞のシグニ1枚を探して公開し手札に加える","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"乗機","isDrive":true},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"乗機"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXEX2-05": [
    {"effectId":"WXEX2-05-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"レゾナ","story":"宇宙"}},"keyword":"アサシン","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXEX2-05-E2","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","story":"宇宙"},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","triggerFilter":{"cardType":"レゾナ"},"usageLimit":"once_per_turn"},
  ],
  "WXEX2-19": [
    {"effectId":"WXEX2-19-E1","effectType":"AUTO","timing":["ON_ACCE_TO_TRASH"],"action":{"type":"ENERGY_CHARGE","target":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"level":{"max":2},"cardType":"シグニ","hasIcon":"アクセ"}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","usageLimit":"once_per_turn"},
  ],
  "WXEX2-51": [
    {"effectId":"WXEX2-51-E3","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":3}},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":3}}]},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"黒","powerRange":{"max":12000}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK01-055": [
    {"effectId":"WXK01-055-E1","effectType":"AUTO","timing":["ON_TRASH"],"condition":{"type":"HAND_COUNT","owner":"self","operator":"lte","value":2},"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}},"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerCondition":{"fromZones":["hand"],"duringMainPhase":true}},
  ],
  "WXK01-104": [
    {"effectId":"WXK01-104-E1","effectType":"AUTO","timing":["ON_TRASH"],"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"thisCardOnly":true}},"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","triggerCondition":{"fromZones":["deck"],"duringMainPhase":true}},
  ],
  "WXK03-052": [
    {"effectId":"WXK03-052-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"handDiscardSigni":{"count":2,"story":"アーム"}},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"keyword":"マルチエナ"}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK07-053": [
    {"effectId":"WXK07-053-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LEVEL_MODIFY","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","level":{"min":2},"excludeSelf":true}},"delta":-1,"until":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK07-082": [
    {"effectId":"WXK07-082-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","level":4,"hasLifeBurst":false,"nonColorless":true}},"shuffle":false,"position":"top"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // 2026-08-29 §5.2 Sheet3 バッチ7（速いレーン）＝台帳の残 OPEN から 12効果を消化。
  // 受け皿はすべて既存（`MILL.fromBottom` / `filter.hasAcce` / `ChooseAction.allowRepeat` /
  // `POWER_MODIFY_PER_TRASH_COUNT.countFilter` / `targetsTriggerSource` / `triggerScope:'any_opp'` /
  // `STUB{HAND_REVEAL_CLASS_SIGNI}` / `SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS`＋`targetsStored`）。
  // ⚠`targetsTriggerSource` は engine 側の `triggeringCardNum` が ON_BLOOD_CRYSTAL_ARMOR の
  //   any_ally 経路だけ載っていなかったので1行足した（`triggerCollect.ts`）。
  "WX22-045": [
    {"effectId":"WX22-045-E1","effectType":"AUTO","timing":["ON_REFRESH"],"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"DRAW","owner":"self","count":1}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"refreshedOwner":"any"},"usageLimit":"once_per_turn"},
  ],
  "WXEX1-29": [
    {"effectId":"WXEX1-29-E1","effectType":"AUTO","timing":["ON_TRASH"],"action":{"type":"CONDITIONAL","condition":{"type":"TURN_OWNER","owner":"self"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_opp","triggerFilter":{"cardType":"シグニ"},"triggerCondition":{"fromZones":["field"]}},
  ],
  "WXEX1-39": [
    {"effectId":"WXEX1-39-E2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"energy":[{"color":"青","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"shuffle":false,"position":"top"},{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"}},"targetsStored":true,"shuffle":false,"position":"top"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXEX2-16": [
    {"effectId":"WXEX2-16-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":5},"action":{"type":"TRANSFER_TO_DECK","source":{"type":"LRIG_TRASH_CARD","owner":"self","count":"ALL","filter":{"cardType":"アーツ","color":"緑"}},"shuffle":false,"destination":"lrig_deck"},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK03-068": [
    {"effectId":"WXK03-068-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"MILL","owner":"self","count":2,"fromBottom":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_LEVEL_SUM","operator":"eq","value":5},"then":{"type":"DRAW","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXK04-043": [
    {"effectId":"WXK04-043-E2","effectType":"AUTO","timing":["ON_BLOOD_CRYSTAL_ARMOR"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"delta":5000,"targetsTriggerSource":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","usageLimit":"once_per_turn"},
  ],
  "WXK04-049": [
    {"effectId":"WXK04-049-E2","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","hasAcce":true}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK04-059": [
    {"effectId":"WXK04-059-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":4}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":1}},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"水獣"}}},{"type":"DRAW","owner":"self","count":1}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK04-090": [
    {"effectId":"WXK04-090-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WXK04-090-E1-c1","label":"手札から＜水獣＞のシグニ1枚を公開する","condition":{"type":"HAND_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"水獣"},"operator":"gte","value":1},"action":{"type":"STUB","id":"HAND_REVEAL_CLASS_SIGNI"}},{"choiceId":"WXK04-090-E1-c2","label":"このシグニを場からトラッシュに置く","action":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK05-010": [
    {"effectId":"WXK05-010-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":2,"from_count":2,"upTo":true,"allowRepeat":true,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"optional":false}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK05-046": [
    {"effectId":"WXK05-046-E1","effectType":"AUTO","timing":["ON_TRASH"],"action":{"type":"CONDITIONAL","condition":{"type":"TURN_OWNER","owner":"self"},"then":{"type":"POWER_MODIFY_PER_TRASH_COUNT","target":{"type":"SIGNI","owner":"opponent","count":1},"deltaPerUnit":-1000,"unitSize":1,"trashOwner":"self","countFilter":{"cardNames":["幕末の人斬り　イゾウ"]},"until":"UNTIL_END_OF_TURN"}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"fromZones":["deck"]}},
  ],
  // 2026-08-30 ソフトロック修正の随伴（検証で発見）＝「N枚捨てる。**そうした場合**」の did-it ゲートが
  // `CONDITIONAL{IS_MY_TURN}`（＝枚数を見ない慣例形）だと、**候補不足クランプ後に一部しか払っていなくても
  // 後段が走る**。⚠実測＝`WX25-P1-TK2-E1` は手札2枚（原文は3枚）で**相手の場を全滅**させた。
  // ⇒ 枚数を明示する `LAST_PROCESSED_COUNT_GTE{value:N}` へ置き換える（兄弟の `WD14-011-BURST` /
  //   `WXK01-001-E2` は元からこの形＝**同じカード群の中で書き方が2種類に割れていた**）。
  "WX14-012": [
    {"effectId":"WX14-012-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"赤","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","cardName":"フレイスロ"},"maxCount":2,"then":{"type":"ADD_TO_FIELD","owner":"self"},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // ─────────────────────────────────────────────────────────────────────────
  // 2026-08-30 §5.2 Sheet2 バッチ6（速いレーン・原文を読み直して手書き）。
  // ⚠**移設ではない**＝3件とも parser 出力と実体が違う（原文と突き合わせて書き直した）。
  // 🔴**4件目（`WX15-010-E1`＝すべての＜武勇＞へ集合耐性）は据置**＝golden の見送り契約
  //   「段2 第23バッチ 見送り契約: WX15-010-E1 は1回消費語彙が無いため集合耐性へ広げない」が発火した。
  //   原文は「**次に**バニッシュされる場合」＝**1回だけ吸収して消える盾**で、受け皿が今も無い。
  //   ⇒ scope だけ広げると「ターン中ずっと＜武勇＞全員がバニッシュ耐性」になり**過剰実行が拡大する**。
  //   契約は生きているので手を出さない（§5.3 `O-164` に登録）。
  // ─────────────────────────────────────────────────────────────────────────

  // 原文「【出】：対戦相手のデッキの一番上を見る。あなたはそれをトラッシュに置いてもよい。」
  // 🔴 parser は「それ」を**相手の場のシグニ**と読み、`TRASH{SIGNI,opponent}` を強制で撃っていた
  //   （＝見た札は必ずデッキに戻り、代わりに盤面のシグニが1体トラッシュへ行く別物）。
  //   正しくは `LOOK_AND_REORDER{canTrash}`＝閲覧した札を任意でトラッシュへ。
  //   `resumeLookAndReorder` は trashed を `destOwner` のトラッシュへ入れる＝相手の札は相手のトラッシュ。
  "WX19-063": [
    {"effectId":"WX19-063-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"opponent"},"count":1,"private":true,"reorder":false,"canTrash":true,"destination":{"location":"deck","owner":"opponent","position":"top"}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // 原文《レイヤーアイコン》「【常】：このシグニは対戦相手の**パワー15000以上のシグニ**の効果を受けない。」
  // 🔴 parser は「パワー15000以上」を**守られる側**（target.filter）に載せていた＝主語が真逆で、
  //   実際には（`collectEffectImmuneSigni` が target を見ず効果元自身を守る慣例のため）
  //   **相手シグニの効果すべてから無条件保護**になっていた。発生源の限定は `sourceFilter`。
  //   ⚠兄弟の `WX16-034-LAYER-E1`（コストの合計1以下のアーツ）は最初から `sourceFilter` で書けている。
  //   ⚠`sourceFilter` の `powerRange` は `matchesFilter(srcCard, …)` ＝**印刷パワー**で判定される近似。
  "WX16-024": [
    {"effectId":"WX16-024-LAYER","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","story":"怪異"},"abilities":[{"effectId":"WX16-024-LAYER-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1},"from":["シグニ"],"sourceOwner":"opponent","sourceFilter":{"cardType":"シグニ","powerRange":{"min":15000}},"duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"AUTO"},{"effectId":"WX16-024-LAYER-E2","effectType":"AUTO","timing":["ON_LEAVE_FIELD"],"action":{"type":"DRAW","owner":"self","count":2},"duration":"INSTANT","mandatory":true,"parseStatus":"AUTO","triggerCondition":{"byOpponentEffect":true}}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // 原文「【起】《アタックフェイズアイコン》**このカードを手札から公開し**、あなたの＜悪魔＞のシグニ２体を
  //   場からトラッシュに置く：**このシグニをあなたの手札から場に出す。**」
  // 🔴 parser は (a) `handActivated` を落とし（＝手札からの起動として提示されない）
  //   (b) 出す先を `HAND_CARD{filter:{cardType:'シグニ'}}` ＝**手札の任意のシグニ**にしていた。
  //   ⚠`HAND_CARD` 分岐は `thisCardOnly` を読まない（`matchesFilter` が黙って無視する）ので
  //   自己限定は `cardNum` で書く（`execAddToField` の HAND_CARD 分岐に thisCardOnly の枝が無い）。
  //   ⚠「公開し」は資源の移動を伴わない宣言なのでコストには載せない。
  "WX18-036": [
    {"effectId":"WX18-036-E3","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"fieldTrash":{"count":2,"filter":{"cardType":"シグニ","story":"悪魔"}}},"action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"HAND_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","cardNum":"WX18-036"}}},"duration":"INSTANT","mandatory":false,"handActivated":true,"parseStatus":"MANUAL"},
  ],

  "WX25-P1-TK2": [
    {"effectId":"WX25-P1-TK2-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1},{"color":"無","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":3}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ"}}}},{"type":"STUB","id":"ARTS_IMMOVABLE"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // Semantic audit stage 2, batch 46: existing receivers only.
  "PR-K054": [
    {"effectId":"PR-K054-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"discard":1},"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000,"duration":"UNTIL_OPP_TURN_END"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK04-011": [
    {"effectId":"WDK04-011-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL_DECK_TOP","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","levelParity":"even"}},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"DECK_CARD","owner":"self","count":1}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","levelParity":"odd"}},"then":{"type":"SEQUENCE","steps":[{"type":"TRASH_REVEALED","owner":"self"},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000,"duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WDK06-R01": [
    {"effectId":"WDK06-R01-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":3,"stages":[{"filter":{"cardType":"シグニ","story":"アーム"},"pickCount":1,"then":"field"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteLastProcessed":true},"upToCount":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WDK14-009": [
    {"effectId":"WDK14-009-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":4}},{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"CONDITIONAL","condition":{"type":"LRIG_STORY","owner":"self","story":"タウィル"},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX25-CP1-082": [
    {"effectId":"WX25-CP1-082-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerLteSelfHalf":true}},"abortIfNoCandidate":true},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"DOWN","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"ブルアカ","isUp":true,"excludeSelf":true},"upToCount":false},"optional":true},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1,"verbJa":"ダウンした"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P02-049": [
    {"effectId":"WXDi-P02-049-E1","effectType":"AUTO","timing":["ON_TRASH"],"triggerScope":"any_opp","triggerFilter":{"cardType":"シグニ"},"triggerCondition":{"fromZones":["field"]},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXDi-P11-075": [
    {"effectId":"WXDi-P11-075-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"CHOOSE","choose_count":1,"from_count":2,"upTo":true,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":3,"upToCount":false,"filter":{"cardType":"シグニ"},"selectionConstraint":{"groups":[{"filter":{"cardType":"シグニ","level":1},"count":1},{"filter":{"cardType":"シグニ","level":2},"count":1},{"filter":{"cardType":"シグニ","level":3},"count":1}]}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":3,"verbJa":"公開した"},"then":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":3,"upToCount":false,"filter":{"cardType":"シグニ","story":"水獣"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":3,"verbJa":"公開した"},"then":{"type":"DRAW","owner":"self","count":1}}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P12-052": [
    {"effectId":"WXDi-P12-052-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"TAKE_FROM_UNDER_SIGNI","destination":"energy","count":1,"upToCount":true,"filter":{"isDisona":true},"fromThis":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P15-050": [
    {"effectId":"WXDi-P15-050-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"解放者エルドラ×マークν"}},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1}}},{"choiceId":"c1","label":"選択肢2","condition":{"type":"FIELD_ATTACHED_COUNT","owner":"self","include":"under","operator":"gte","value":2},"action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK07-048": [
    {"effectId":"WXK07-048-E1","effectType":"AUTO","timing":["ON_BANISH"],"activeCondition":{"type":"TURN_OWNER","owner":"opponent"},"triggerCondition":{"turnOwner":"opponent","banishedHadCharm":true},"action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":2},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK10-023": [
    {"effectId":"WXK10-023-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"energy":[{"color":"赤","count":1}],"handDiscardSigni":{"count":1,"color":"赤"}},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","level":{"max":3},"color":"赤","classMatchesDiscardSigni":true},"maxCount":2,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  // 意味照合 段2 第47バッチ（2026-08-31 続き752）＝いずれも live 母集団を実測して**同型1件**と確認した一点物。
  // 同型が3件以上あるものは parser 側で直しており、ここには置かない（PLAN §2.0 の2レーン制）。
  "WXDi-P08-009": [
    // 原文「あなたのエナゾーンにあるカード１枚を対象とし、…それは【マルチエナ】を得る」＝**1枚だけ**。
    // ⚠parser は count:'ALL' を出していた（エナ全体が対象＝過剰実行）。
    // 実測＝GRANT_KEYWORD×ENERGY_CARD×count:'ALL' は live 6件だが、**残り5件は原文が「あるカードは」＝全体で正しい**。
    {"effectId":"WXDi-P08-009-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false},"keyword":"マルチエナ","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WX25-P3-080": [
    // 原文①「対戦相手のエナゾーンから…カード１枚を**対象とし**」＝**自分が選ぶ**。②だけが「対戦相手は…選び」。
    // ⚠parser は両枝に `opponentSelects:true` を付けており、①で相手に選ばせていた（最弱のカードを出される）。
    {"effectId":"WX25-P3-080-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1,"filter":{"colorNotMatchesLrig":true}}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1},"opponentSelects":true},"condition":{"type":"AND","conditions":[{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","color":"緑","story":"龍獣"}},{"type":"ENERGY_COUNT","owner":"opponent","operator":"gte","value":2}]}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXDi-P12-064": [
    // 原文「あなたの《ディソナアイコン》のシグニ１体がアタックしたとき、…**その**シグニのパワーを＋5000する」
    // ＝強化先は**トリガー元**。⚠parser は `owner:'any'` の自由選択にしており、任意のシグニを強化できていた。
    {"effectId":"WXDi-P12-064-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1},"delta":5000,"targetsTriggerSource":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"any_ally","triggerFilter":{"isDisona":true},"usageLimit":"once_per_turn"},
  ],
  "WXK10-038": [
    // 原文「この方法で捨てたシグニと**共通するクラスを持ち**《ライズアイコン》を持つシグニ１枚」
    // ＝クラス一致が落ちていた。受け皿は `classMatchesDiscardSigni`（続き751 の `WXK10-023-E1` と同じキー）。
    {"effectId":"WXK10-038-E1","effectType":"AUTO","timing":["ON_PLAY"],"cost":{"handDiscardSigni":{"count":1}},"action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","hasIcon":"ライズ","classMatchesDiscardSigni":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "PR-387": [
    // 🆕**2026-09-01 続き760**＝ベット枝の「**この方法で場に出したシグニのクロス条件に含まれる**シグニ1枚」。
    //   🔴旧 live はトラッシュの**任意のシグニ**を出せた（クロス条件の限定が丸ごと落ちていた）。
    //   受け皿は今回足した `TargetFilter.nameInCrossConditionOfLastProcessed`（基準は直前の
    //   `SEARCH`→`ADD_TO_FIELD` が `lastProcessedCards` に残すシグニ）。
    // 原文「…シグニ１枚を探して**ダウン状態で**場に出し」＝`asDown` が落ちていた（アップで出るとそのターン殴れる）。
    {"effectId":"PR-387-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK"],"cost":{"energy":[{"color":"白","count":1},{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"シグニ","level":{"max":4},"color":["白","黒"]},"maxCount":1,"then":{"type":"ADD_TO_FIELD","owner":"self","asDown":true},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","nameInCrossConditionOfLastProcessed":true}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WDK07-Y08": [
    // 原文は**2つの付与**＝「対象の対戦相手のシグニ１体は**能力を失い**、対象の対戦相手のシグニ１体は
    // 『【常】：アタックできない。』を**得る**」。parser は前半しか出しておらず、シグニへの【アタックできない】が丸ごと無かった
    // （ベット時のルリグ側だけは在った＝同じキーワードの受け皿は既に配線済み）。
    {"effectId":"WDK07-Y08-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"},{"type":"CONDITIONAL","condition":{"type":"IS_BETTING"},"then":{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"opponent","count":1},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX24-P2-045": [
    // 原文「対戦相手の**ルリグ１体と**対戦相手のシグニ１体を対象とし、それら**を**ダウンする」＝ルリグ側が丸ごと落ちていた。
    // ⚠E2（凍結）は同じ文型で両方出せているので、受け皿の問題ではなく DOWN 入口の取りこぼし。
    {"effectId":"WX24-P2-045-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"DOWN","target":{"type":"LRIG","owner":"opponent","count":1}},{"type":"DOWN","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX25-P2-055": [
    // 原文「ターン終了時まで、このシグニは**【常】能力**を失う」＝失うのは常在だけ。
    // ⚠無指定だと全能力（【自】【起】【出】も）を失う過剰実行。受け皿は `RemoveAbilitiesAction.abilityTypes`
    //   （消費地点＝`effectEngine.ts:6369/6386/6421` の3経路）。
    // 🆕2026-08-31 続き758＝`triggerCondition.targetedByOpponent` を追加（意味照合 段2）。
    //   🔴原文は「**対戦相手の**、能力か効果の対象になったとき」＝旧 live は自分の効果で
    //   自分のシグニを対象にしただけで「バニッシュされない」を失う**自滅**をしていた。
    {"effectId":"WX25-P2-055-E2","effectType":"AUTO","timing":["ON_TARGETED"],"action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"until":"UNTIL_END_OF_TURN","abilityTypes":["常"]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"targetedByOpponent":true},"usageLimit":"once_per_turn"},
  ],
  // 意味照合 段2 第47バッチ その2（2026-08-31 続き752）＝原文にある処理／限定が丸ごと落ちていた一点物。
  // ⚠**カード単位の完全置換**（§5-16）＝同じカードの他の効果も現行 live のまま並べてある。
  "WX25-P1-002": [
    {"effectId":"WX25-P1-002-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"},{"type":"CONDITIONAL","condition":{"type":"IS_BOOSTING"},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false},"optional":false,"targetsLastProcessed":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P02-078": [
    {"effectId":"WXDi-P02-078-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1},{"color":"無","count":1},{"color":"無","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":10000}}},"shuffle":false,"position":"bottom"},{"type":"TRANSFER_TO_DECK","source":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"shuffle":false,"position":"bottom"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P05-063": [
    {"effectId":"WXDi-P05-063-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"opponent","count":1},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":1,"blind":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXDi-P08-074": [
    {"effectId":"WXDi-P08-074-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","color":"緑"}}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","cardNames":["コードラビリンス　アト//メモリア","コードメイズ　ウムル//メモリア","紅魔　タウィル//メモリア"]}}},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"any","count":1},"delta":3000,"duration":"UNTIL_OPP_TURN_END","targetsLastProcessed":true}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXDi-P11-078": [
    {"effectId":"WXDi-P11-078-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":1}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardName":"融合の儀　タウィル//メモリア"}},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","cardName":"融合の儀　タウィル//メモリア"}},"optional":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WX25-P1-079": [
    // 原文「**あなたのクロス状態のすべてのシグニ**のパワーを＋3000する」＝遅延トリガーの中身が
    // `owner:'any' / count:1`（＝任意の1体を選べる）になっていた。受け皿は `TargetFilter.crossState`。
    {"effectId":"WX25-P1-079-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ","story":"ウェポン"},"pickCount":1,"then":"field"}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_ATTACK_PHASE_START"},"effect":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","crossState":true}},"delta":3000,"duration":"UNTIL_OPP_TURN_END"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P2-054": [
    // 原文「…パワー5000以下を1体バニッシュ。このシグニが覚醒状態の場合、**代わりに**13000以下を1体」
    // ＝**排他**。JSON は SEQUENCE で両方走り、条件成立時は常に2体バニッシュしていた（過剰実行）。
    // 受け皿は `THIS_CARD_IS_AWAKENED`。⚠外側の《ララ・ルーThird》条件は両枝に掛かる。
    {"effectId":"WX25-P2-054-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"ララ・ルーThird"}},"then":{"type":"CONDITIONAL","condition":{"type":"THIS_CARD_IS_AWAKENED"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":13000}},"upToCount":false}},"else":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  // 意味照合 段2 第47バッチ その3（2026-08-31 続き752）＝Codex 第46バッチが「受け皿はあるが部分修正になる」
  // として見送った群のうち、原文全体と突き合わせて**丸ごと閉じられる**と確認できたものだけを取った。
  "WX26-CP1-059": [
    {"effectId":"WX26-CP1-059-E1","effectType":"CONTINUOUS","activeCondition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"story":"プリオケ"},"minCount":5},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX26-CP1-059-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"TRASH_HAS_CARD","owner":"self","filter":{"story":"プリオケ"},"minCount":10},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"powerLte\":10000}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P01-049": [
    {"effectId":"WXDi-P01-049-E1","effectType":"CONTINUOUS","activeCondition":{"type":"COUNT_THRESHOLD","location":"life_cloth","owner":"self","operator":"lte","value":2},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P01-049-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"COUNT_THRESHOLD","location":"life_cloth","owner":"self","operator":"lte","value":2},{"type":"TURN_OWNER","owner":"opponent"}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"cardType\":\"シグニ\"}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // 🆕§5.3 `O-194`（2026-09-02）＝【チーム常】の**2文目の「かぎり」節が丸ごと落ちて**いた（過剰実行）。
  // 原文「…このシグニのパワーは…レベルの合計１につき＋1000される。**あなたの場にいるルリグのレベルの
  //   合計が７であるかぎり**、このシグニは【シャドウ:{"levelLte":2}】を得る。」
  // 🔴旧 live は1本の `SEQUENCE` に両帰結を並べ、**シャドウが常時付いて**いた（チーム条件しか掛かっていない）。
  // 🔑受け皿は `FIELD_LEVEL_SUM{target:'lrig'}`（`WXDi-P13-076` と同形）＋**`-E1b` へ切り出す**規約
  //   （`WX26-CP1-059` / `WXDi-P01-049` / `WXDi-P08-048` / `WX21-015` と同じ＝2文目は別効果にする）。
  // ⚠外側の【チーム常】＝`LRIG_TEAM_COUNT` は**両方に掛かる**ので `AND` で並べる。
  // ⚠既存 id `-E1` の書き直しなので `npx tsx scripts/syncManualLive.ts WXDi-P16-090` まで回さないと live に届かない。
  "WXDi-P16-090": [
    {"effectId":"WXDi-P16-090-E1","effectType":"CONTINUOUS","activeCondition":{"type":"LRIG_TEAM_COUNT","owner":"self","team":"うちゅうのはじまり","operator":"gte","value":3},"action":{"type":"POWER_MODIFY_PER_LRIG_LEVEL","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"deltaPerLevel":1000,"lrigOwner":"self","sumFieldLrigLevels":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXDi-P16-090-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"LRIG_TEAM_COUNT","owner":"self","team":"うちゅうのはじまり","operator":"gte","value":3},{"type":"FIELD_LEVEL_SUM","owner":"self","target":"lrig","operator":"eq","value":7}]},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"シャドウ:{\"levelLte\":2}","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P16-051": [
    {"effectId":"WXDi-P16-051-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":1},{"color":"無","count":1}]},"action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"収斂せし扉　アト＝トレ"}},"then":{"type":"CONDITIONAL","condition":{"type":"ENERGY_COUNT","owner":"self","operator":"lte","value":0},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"Sランサー","duration":"UNTIL_END_OF_TURN"},"else":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}}},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK01-001": [
    {"effectId":"WXK01-001-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":2},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":2}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":2},"then":{"type":"SEQUENCE","steps":[{"type":"GRANT_PROTECTION","target":{"type":"LRIG","owner":"self","count":1},"from":["any"],"sourceOwner":"opponent","duration":"UNTIL_END_OF_TURN"},{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"GUARD","until":"END_OF_TURN"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"},
  ],
  "WX25-P1-088": [
    {"effectId":"WX25-P1-088-E1","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"self"},{"type":"FIELD_SIGNI_ALL_DISTINCT_CLASS","owner":"self"}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-P00-012": [
    {"effectId":"WXDi-P00-012-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":"ALL","upToCount":true,"filter":{"cardType":"シグニ"},"selectionConstraint":{"totalLevelMaxRef":{"$ref":"opp_lrig_level"}}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  // 意味照合 段2 第47バッチ その4（2026-08-31 続き752）＝「このルリグは能力を失う」。
  // 🔴`REMOVE_ABILITIES{SIGNI}` は書き込み先が `abilities_removed`（cardNum リスト）で
  //   **ルリグ能力を止める消費地点がどこにも無い**＝見せかけの実装だった（§5.2 第45バッチの再実証）。
  //   受け皿は `lrig_abilities_disabled` を立てる `SELF_LRIG_LOSE_ABILITY`（`execStubPart3.ts:4757`）。
  "WXDi-D08-004": [
    {"effectId":"WXDi-D08-004-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","fieldDown":{"count":2,"filter":{"cardType":"シグニ"}},"costColors":["白","無"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"SEQUENCE","steps":[{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}},{"type":"STUB","id":"SELF_LRIG_LOSE_ABILITY"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  // ══════════════════════════════════════════════════════════════════════════════
  // §5.3 `O-202`（索引 C・2026-09-02）＝コスト付きの置換＝置換の発生時に支払いを問う窓
  // ══════════════════════════════════════════════════════════════════════════════
  // 🔑**登録票の「窓が無い」は失効していた**＝窓は2本とも既にある。
  //   ①ダメージ置換＝`screens/battle/lifeCrashReplace.ts` の funnel（`kind:'pay_cost'`・続き543）
  //   ②離場置換＝`collectLeaveSubstituteOptions` の軸列（`selfAbilityPay` が既にコストを払っている）
  //   足りなかったのは**支払い種別**（アシストルリグのダウン／宣言者自身のダウン）だけだった。
  //
  // WX24-P3-043 ／ 原文（アーツ）＝**このターン、あなたがダメージを受ける場合、代わりにあなたの
  //   レベル１以上のアップ状態のアシストルリグ２体をダウンしてもよい。**
  // 🔴旧 live＝`ACTIVATED{DOWN{SIGNI, level>=1, isUp}}`＝**使った瞬間にシグニを1体ダウンするだけ**の別物
  //   （置換の宣言でも、アシストルリグでも、2体でもない）。
  // 🔑受け皿は既存 `LIFE_CRASH_REPLACE`（`life_crash_replacements` へ積む宣言）＋今回足した
  //   `payOptions[].assistLrigDown`。⚠`once` を付けない＝原文に「次に」が無いのでターン中は何度でも。
  "WX24-P3-043": [
    {"effectId":"WX24-P3-043-E1","effectType":"ACTIVATED","timing":["ATTACK"],"cost":{"energy":[{"color":"無","count":2}]},"action":{"type":"LIFE_CRASH_REPLACE","replaceKind":"pay_cost","count":1,"optional":true,"payOptions":[{"assistLrigDown":{"count":2,"minLevel":1}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // WXEX2-28 ／ 原文【常】：**あなたの＜ウェポン＞のシグニ１体が対戦相手の効果によって場を離れる場合、
  //   代わりにアップ状態のこのシグニをダウンしてもよい。**
  // 🔴旧 live＝`CONTINUOUS DOWN{thisCardOnly, optional}`＝**CONTINUOUS は `executeAction` を通らない**ので
  //   恒久 no-op（`LIFE_CRASH_REPLACE` 系と同じ壊れ方）＝守りが1回も働いていなかった。
  // 🔑受け皿は離場置換 funnel の新しい軸 `downProtector`（`EFFECT_LEAVE_REPLACE_WITH_DOWN_SELF`）。
  // ⚠`BATTLE_LEAVE_REPLACE_WITH_DOWN`（`WXDi-CP02-TK01A-E2`）とは**別物**＝あちらは
  //   「**このシグニ自身が**バトルか相手効果で離れる場合」で、BattleScreen のバトル経路だけが読む。
  //   こちらは**他の味方＜ウェポン＞を守る**＋**効果による離場**（engine の離場 funnel）。
  "WXEX2-28": [
    {"effectId":"WXEX2-28-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"EFFECT_LEAVE_REPLACE_WITH_DOWN_SELF","leaveDownProtector":{"victimFilter":{"cardType":"シグニ","story":"ウェポン"}}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // §5.3 `O-200`（索引 C・2026-09-02）＝ルリグデッキからキーを場に出す経路
  // ══════════════════════════════════════════════════════════════════════════════
  // 🔑**受け皿は既に在った**＝`PLACE_KEY_FROM_LRIG_DECK`（`WDK03-001-E1` 用に続き760 で新設済み）。
  //   登録票の「`field.key_piece` を**置く**手段がゼロ」は失効していた。今回足したのは
  //   ①**カード名を書かない形**（キーを選ばせる）②`payPrintedCost`（印刷コストの徴収）
  //   ③`key_place_limit`（「N枚まで場に出せる」＝`STUB{SET_KEY_PLACE_LIMIT}`）の3点だけ。
  //
  // WXK02-004 ／ 原文【起】《ゲーム１回》ジョーカー《コインアイコン》《コインアイコン》：
  //   **このゲームの間、あなたはキーを２枚まで場に出すことができる。あなたのルリグデッキからキー１枚を場に出す。**
  // 🔴旧 live＝`SEQUENCE[ADD_TO_FIELD{owner:'self'}, ADD_TO_FIELD{owner:'self'}]`＝
  //   **source の無い `ADD_TO_FIELD` が2つ**＝キーとは無関係にシグニを場へ出そうとする別物だった
  //   （枠の引き上げも、ルリグデッキからの取り出しも、1バイトも無い）。
  // ⚠原文にコストの記載が無い＝**無償**（`payPrintedCost` を付けない）。

  // WXK03-014 ／ 原文【起】このキーを場からルリグトラッシュに置く：**あなたのルリグデッキからコストを支払って
  //   キー１枚を場に出す。そのキーを場に出すためのコストは《コイン×1》減る。**
  // 🔴旧 live＝`SEQUENCE[ADD_TO_FIELD{owner:'self'}, ADD_TO_FIELD{owner:'self'}]`（同上）。
  // 🔑コストは `payPrintedCost`＝engine が**選んだキーの `Cost` 列**（コイン＋エナ）を徴収し、
  //   払えないキーは候補に出さない。⚠軽減を先に引くので《コイン》×1 のキーは実質無償になる（原文どおり）。

  // ══════════════════════════════════════════════════════════════════════════════
  // §5.3 `O-162`（索引 C・2026-09-02）＝「プレイヤーをN人まで選ぶ」＝プレイヤーを対象に取る機構が無い
  // ══════════════════════════════════════════════════════════════════════════════
  // 🔑**新しい型は作らなかった**＝原文の「プレイヤーを1人（2人）まで選ぶ。そのプレイヤーは〜」は
  //   **選択肢が「あなた」と「対戦相手」の2つしかない**ので、既存 `CHOOSE{upTo:true}` の
  //   選択肢そのものを owner 違いの同じアクションにすれば、選ばれた側へ owner を運ぶ器がいらない。
  //   （登録票は「選ばれたプレイヤーを後続へ運ぶ口が要る」と書いていたが、母集団2効果ではその口は不要。）
  // ⚠**`upTo:true` を落とさない**＝原文は「N人**まで**」＝0人（何も起こさない）を選べる。
  //
  // WXEX2-44 ／ 原文【自】：あなたのアタックフェイズ開始時、**プレイヤーを１人まで選ぶ**。そのプレイヤーは、
  //   自分のトラッシュにあるすべてのカードをデッキに加えてシャッフルする。
  // 🔴旧 live＝`SEQUENCE[STUB{CHOOSE_N_FROM_LIST}, TRANSFER_TO_DECK{owner:'self'}]`＝
  //   **選択が無言 no-op**（engine の `([１-４1-4])つ(?:まで)?選ぶ` は「N**人**まで」に1本も当たらない）で、
  //   後続が `owner:'self'` に焼き込まれていた＝**対戦相手を選んでも自分のトラッシュが戻る**真逆の実行。
  "WXEX2-44": [
    {"effectId":"WXEX2-44-E2","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"upTo":true,"choices":[{"choiceId":"self","label":"あなた","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"self","count":"ALL"},"shuffle":true}},{"choiceId":"opponent","label":"対戦相手","action":{"type":"TRANSFER_TO_DECK","source":{"type":"TRASH_CARD","owner":"opponent","count":"ALL"},"shuffle":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],

  // WXK06-028 ／ 原文【起】《ターン１回》《青×0》：**プレイヤーを２人まで選ぶ**。選ばれた各プレイヤーは手札を
  //   すべてデッキに加えてシャッフルし、この方法で自分のデッキに加えたカードの枚数と同じ枚数のカードを引く。
  //   **この効果によって各プレイヤーは最大５枚までしかカードを引くことができない。**
  // 🔴旧 live＝`SEQUENCE[STUB{CHOOSE_N_FROM_LIST}, STUB{MASS_TRASH}, STUB{RULE_REMINDER_TEXT}]`＝
  //   ①選択が無言 no-op ②`MASS_TRASH`＝**トラッシュへ置く別物**（原文はデッキへ加えてシャッフル）
  //   ③**ドローが丸ごと無い**（引く側が消えて捨てさせるだけの効果になっていた）。
  // 🔑引く枚数は `DRAW{count:0, addLastProcessedCount:true}`＝`TRANSFER_TO_DECK{HAND_CARD,count:'ALL'}` が
  //   返す `lastProcessedCards`（実際に動いた札）に追従させる＝枚数を焼き込まない。
  // 🆕上限5枚は今回足した `DrawAction.maxCount`（デッキ残量の切り詰めとは別軸）。
  "WXK06-028": [
    {"effectId":"WXK06-028-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"CHOOSE","choose_count":2,"from_count":2,"upTo":true,"choices":[{"choiceId":"self","label":"あなた","action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"HAND_CARD","owner":"self","count":"ALL"},"shuffle":true},{"type":"DRAW","owner":"self","count":0,"addLastProcessedCount":true,"maxCount":5}]}},{"choiceId":"opponent","label":"対戦相手","action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_DECK","source":{"type":"HAND_CARD","owner":"opponent","count":"ALL"},"shuffle":true},{"type":"DRAW","owner":"opponent","count":0,"addLastProcessedCount":true,"maxCount":5}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // §5.3 索引 C 第9巡（2026-09-02）
  // ══════════════════════════════════════════════════════════════════════════════

  // WX25-P2-052 ／ §5.3 `O-203`＝「レゾナとしても扱う」（カード同一性の上書きを**参照側**で読む機構）。
  //   原文 E2「【起】《ターン１回》エナゾーンから＜宇宙＞のシグニ２枚をトラッシュに置く：
  //   次の対戦相手のターン終了時まで、このシグニのパワーは＋10000され、このシグニは
  //   「【常】：あなたの効果１つによってこのシグニを参照する場合、**レゾナとしても扱う**。」を得る。」
  // 🔴旧 live＝`POWER_MODIFY` だけ＝**引用【常】が丸ごと落ちて**いた（＜宇宙＞レゾナ参照の札が拾えない）。
  // 🆕受け皿＝`STUB{TREAT_SELF_AS_RESONA}`（`treated_as_resona_until_opp_turn` へ積む）＋
  //   `fieldCandidates` が参照時に `Type` を `'レゾナ'` へ差し替える。
  // 🔑**「としても」＝シグニでもある**は無料で成立する＝`matchesFilter` は `Type==='レゾナ'` を
  //   `cardType:'シグニ'` フィルタにも一致させる（非対称の緩和が以前から入っている）。
  // ⚠**近似を明記**＝`fieldCandidates` は「誰の効果が参照しているか」を知らないので、
  //   原文の「**あなたの**効果1つによって」は絞れない（相手の「レゾナ1体を対象とし」にも当たり、
  //   `excludeResona` では逆に外れる）。**1効果のための意図的な近似**。
  // ⚠付与の器（`GRANT_EFFECT`）は使わない＝引用【常】の中身が「参照のされ方」の宣言だけなので、
  //   効果元自身へ直接印を付けるのが最短かつ収集契約に縛られない。
  "WX25-P2-052": [
    {"effectId":"WX25-P2-052-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energyTrash":{"count":2,"filter":{"cardType":"シグニ","story":"宇宙"}}},"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":10000,"duration":"UNTIL_OPP_TURN_END"},{"type":"STUB","id":"TREAT_SELF_AS_RESONA"}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  // WX16-Re20（グレイブ・ラッシュ）／ §5.3 `O-84`＝「条件つき追加使用タイミング」。
  //   原文「**あなたのライフクロスが２枚以下の場合、このアーツは追加で《アタックフェイズアイコン》を持つ。**
  //   あなたのトラッシュからシグニ３枚を対象とし、あなたの場にシグニがない場合、それらを能力を持たない
  //   シグニとして場に出す。ターン終了時、それらを場からトラッシュに置く。」
  // 🔴旧 live＝1文目が `STUB{DEFERRED_CONDITIONAL_EXTRA_USE_TIMING}`（engine に消費なし＝恒久 no-op）で、
  //   **ライフ2枚以下でもアタックフェイズに撃てなかった**（`CardData.Timing` 列は「メインフェイズ」だけ）。
  // 🆕受け皿＝`STUB{EXTRA_USE_TIMING, extraUseTiming:{timing:'ATTACK_ARTS'}}` を**別の CONTINUOUS 効果**
  //   （E2）として置き、条件は `activeCondition` に載せる。消費は `artsUseGate.ts` の `collectExtraUseTimings`。
  // ⚠**E1 の `timing` は印字どおり `["MAIN"]` のまま**＝追加タイミングは `artsUseGate` が動的に足す。
  //   ここへ `ATTACK_ARTS` を書くと「条件と無関係にアタックフェイズで使える」という別の嘘になる
  //   （実行側 `queueCardEffects` は timing で絞らないので、書いても得は無い）。
  // ⚠**宣言は本体の SEQUENCE から外す**＝あれは「使用可否の静的な性質」であって解決ステップではない
  //   （SEQUENCE のステップに残すと、撃った後に宣言する＝永久に間に合わない）。
  // ⚠**向きに注意**＝`condition`（使用条件）ではなく **追加**。条件を使用条件へ載せると
  //   「ライフ2枚以下でしか使えないアーツ」に化ける（`effectParser.ts` の `STATE_HOIST_BATCH1_CARDS`
  //   ガードはその誤変換を封じているので**外さない**）。
  "WX16-Re20": [
    {"effectId":"WX16-Re20-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"FIELD_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"ADD_TO_FIELD","owner":"self","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"type":"STUB","id":"TRASH_AT_TURN_END"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX16-Re20-E2","effectType":"CONTINUOUS","activeCondition":{"type":"LIFE_COUNT","owner":"self","operator":"lte","value":2},"action":{"type":"STUB","id":"EXTRA_USE_TIMING","extraUseTiming":{"timing":"ATTACK_ARTS"}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // PR-K026 ／ §5.3 `O-151`(a)＝「合わせて±N」で**対象宣言が別の文にある**（照応が文をまたぐ）形。
  //   原文（キーが与える2本目の【起】）＝「対戦相手のシグニを**２体まで対象とし**、あなたのデッキの上から
  //   カードを９枚トラッシュに置く。この方法でカードが９枚トラッシュに置かれた場合、ターン終了時まで、
  //   **それら**のパワーを合わせて－18000する。この効果では1000単位でしか数字を割り振ることができない。」
  // 🔴旧 live＝**対象宣言が丸ごと落ちて** `CONDITIONAL{LAST_PROCESSED_COUNT_GTE 9} → STUB{POWER_MOD_PER_COUNT}`
  //   だけ＝相手のパワーは1ミリも下がらない（真 no-op）。
  // 🔑**受け皿は既存の3点**＝`STUB{SELECT_TARGET_ONLY}`（盤面を変えない対象宣言）＋
  //   `STUB{STORE_LAST_PROCESSED_TARGETS}`（`storedTargetCards` へ固定）＋
  //   `POWER_MODIFY{targetsStored, splitTotal}`。**間にミル9枚を挟んでも対象が生き残る**のがこの組の要点
  //   （`lastProcessedCards` はミルで上書きされるので `targetsStored` でないと届かない）。
  // 🆕engine 側は1点だけ足した＝`execPowerModify` の `splitTotal` が `targetsStored` を honor する
  //   （旧実装は必ず選択UIを出したので、**同じ対象へ ON_TARGETED が二度立つ**）。
  // ⚠`RULE_REMINDER_TEXT`（1000単位の但し書き）は `splitTotal.unit:1000` が表すので落とす。
  // ⚠**E1 の1本目【起】（エクシード1・－7000）は旧のまま**＝あちらは同じ文に対象宣言があり正しい。
  "PR-K026": [
    {"effectId":"PR-K026-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"PR-K026-E1-G","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":1},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-7000},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"AUTO","usageLimit":"once_per_turn"},{"effectId":"PR-K026-E1-G2","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":2},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":9}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":9},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ"}},"targetsStored":true,"delta":-18000,"splitTotal":{"unit":1000},"duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}],"rawText":"【起】《ターン１回》《アタックフェイズアイコン》エクシード１：対戦相手のシグニ１体を対象とし、ターン終了時まで、それのパワーを－7000する。【起】《ターン１回》《アタックフェイズアイコン》エクシード２：対戦相手のシグニを２体まで対象とし、あなたのデッキの上からカードを９枚トラッシュに置く。この方法でカードが９枚トラッシュに置かれた場合、ターン終了時まで、それらのパワーを合わせて－18000する。この効果では1000単位でしか数字を割り振ることができない。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  "WXDi-D09-H07": [
    {"effectId":"WXDi-D09-H07-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"GRANT_EFFECT","target":{"type":"LRIG","owner":"self","count":1},"duration":"UNTIL_END_OF_TURN","effect":{"effectId":"WXDi-D09-H07-sub-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"UP","target":{"type":"LRIG","owner":"self","count":1}},{"type":"STUB","id":"SELF_LRIG_LOSE_ABILITY"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"AUTO","usageLimit":"once_per_turn"}},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // 2026-09-02（索引 B 第2巡）§5.3 `O-71`＝**遅延本文が「それ」で先行文を照応する形**
  // 🔑**着手前の実測で受け皿は既に在ることが分かった**＝`STUB{SELECT_TARGET_ONLY}` →
  //   `STUB{STORE_LAST_PROCESSED_TARGETS}` → `INSTALL_DELAYED_TRIGGER{effect:…targetsStored}` の3点組。
  //   設置時に `freezeStoredTargets` が `fixedCardNums` へ焼き込むので、発火時の別 ExecCtx でも「それ」が届く。
  //   登録票の5効果のうち3効果（`WXDi-P12-006-E1`②／`WXDi-CP02-043-E2`／`WX25-CP1-008-E1`④）は
  //   **既にこの組で消化済み**だった＝残っていたのはこの1件と `WXK10-045-E2`（別機構）だけ。
  // ══════════════════════════════════════════════════════════════════════════════

  // WX25-CP1-038 ／ 原文【自】：あなたのアタックフェイズ開始時、あなたの場にあるすべてのシグニが＜ブルアカ＞の
  //   場合、対戦相手のシグニ１体を対象とし、**それのパワーが5000以下の場合、それを手札に戻す。
  //   このターン終了時、それを場からトラッシュに置く。**
  // 🔴旧 live＝`CONDITIONAL{ALL_FIELD_SIGNI_MATCH} → BOUNCE{相手シグニ1体}` ＋ `STUB{RULE_REMINDER_TEXT}`＝
  //   ①**パワー5000以下のゲートが無い**（どんな大型でも無条件で手札へ戻せる＝原文より強い）
  //   ②**遅延トリガーが丸ごと落ちている**（2文目が `RULE_REMINDER_TEXT` に化けて消えていた）。
  // 🔑2文は**どちらも同じ「それ」**を指すので、対象は先に宣言して固定する
  //   （`BOUNCE` を先に撃つと `lastProcessedCards` が動いて2文目の照応先が消える）。
  // ⚠**2文は排他ではない**＝パワー5000以下なら手札へ戻り、遅延側は「場に居ない」ので空振りする。
  //   5000超なら場に残り、ターン終了時にトラッシュへ落ちる。**どちらの枝も原文どおり**なので、
  //   遅延側を `CONDITIONAL` で包まない（包むと5000超のときに何も起きない別のカードになる）。
  // WXK10-045 ／ 原文【出】：対戦相手は手札を１枚チェックゾーンに置く。**このターン終了時、対戦相手はそれを手札に戻す。**
  // 🔴旧 live＝`STUB{DEFERRED_OPP_HAND_TO_CHECK_ZONE_UNTIL_END}`（真 no-op）＋
  //   **`BOUNCE{相手シグニ1体}`**＝2文目が「相手のシグニを1体手札に戻す」に化けていた（原文と無関係な除去）。
  // 🔑`O-71` の3点組をそのまま使う。1点だけ新設が要った＝**手札→チェックゾーンの移動**
  //   （`HAND_TO_CHECK_ZONE`。置き先は `check_rest`＝`check` はバースト確認スロットで盤面が固まる）。
  // ⚠**遅延側とセットでなければ手札が1枚失われる**＝`check_rest` は
  //   `clearTurnEndScopedState` がターン終了時にトラッシュへ送る。戻す遅延トリガーはその前に解決される。
  // ⚠戻すのは「**それ**」＝設置時に固定した1枚だけ（`targetsStored`）。無いとチェックゾーンの
  //   任意の1枚を戻せる（相手が自分で置いた別のカードを回収できてしまう）。
  // ══════════════════════════════════════════════════════════════════════════════
  // 2026-09-02（索引 B 第2巡）§5.3 `O-163`＝**色/アイコン宣言→手札公開→照合の3段**
  // 🔴旧＝engine が `EffectText` **全文**を regex で読んでいた（`OPP_DECLARE_CHOICE` →
  //   `INTERNAL_ODC_COLOR_CHECK`。`census:enginetext` A群）。ペナルティが「相手の全シグニをトラッシュ」
  //   1種類に焼き込まれており、`WX16-Re17-E1` の**3分岐**を表せなかった。
  // 🔴さらに悪いのは JSON 側で、**3分岐が素の3ステップとして並んでいた**＝
  //   `WX16-Re17-E1` は起動するたび**全シグニトラッシュ＋1体バニッシュ＋自分の手札全捨て**が
  //   まとめて起きていた（逆翻訳・census・golden・smoke は全部緑のまま＝A群の典型的な壊れ方）。
  // 🔑新設 `DECLARE_ICON_REVEAL_CHECK`＝**宣言する軸**（1〜2）と**一致軸数ごとの帰結**を JSON で持つ。
  // ⚠「宣言されたアイコン」はカードの色で近似する（既存 `DECLARED_ICON_HAND_DISCARD_BANISH` と同じ判定）。
  // ⚠選んだ手札は**捨てない**（公開するだけ）＝あちらとの違い。
  // ══════════════════════════════════════════════════════════════════════════════

  // PR-K060 ／ 【常】：あなたのセンタールリグは以下の能力を得る。【起】《アタックフェイズアイコン》エクシード４：…
  // ⚠付与される側（`abilities[]`）は parser も生成する層なので `parseStatus:'AUTO'` のまま（§6.4 `O-40`）。
  "PR-K060": [
    {"effectId":"PR-K060-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_LRIG_ABILITY","abilities":[{"effectId":"PR-K060-E2-G","effectType":"ACTIVATED","timing":["ATTACK_ARTS"],"cost":{"exceed":4},"action":{"type":"DECLARE_ICON_REVEAL_CHECK","declare":["icon"],"outcomes":[{"matched":0,"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":"ALL"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"AUTO"}],"rawText":"【起】《アタックフェイズアイコン》エクシード４：あなたの手札を１枚選ぶ。対戦相手は《白2》2《赤2》2《青2》2《緑2》2《黒2》2《無2》2から１つを宣言する。そのカードを公開し、それが宣言されたアイコンを持つカードではない場合、対戦相手のすべてのシグニをトラッシュに置く。"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  // WX16-Re17 ／ 【起】《無×3》：…アイコンと**カードの種類**の2軸を宣言し、**3分岐**する。
  //   どちらも持たない＝相手の全シグニをトラッシュ／どちらか＝相手のシグニ1体をバニッシュ／
  //   どちらも＝**あなたが**手札をすべて捨てる。
  "WX16-Re17": [
    {"effectId":"WX16-Re17-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":3}]},"action":{"type":"DECLARE_ICON_REVEAL_CHECK","declare":["icon","cardType"],"outcomes":[{"matched":0,"action":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":"ALL"}}},{"matched":1,"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}},{"matched":2,"action":{"type":"TRASH","target":{"type":"HAND_CARD","owner":"self","count":"ALL"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],

  // ══════════════════════════════════════════════════════════════════════════════
  // 2026-09-02（索引 B 第2巡）§5.3 `O-160`＝**「このターン、対戦相手がダメージを受けたとき」の遅延トリガー**
  // 🔴旧 live＝遅延句が丸ごと落ちて**起動した瞬間に無条件で実行**していた
  //   （`WX18-002-E3` は相手ライフを即クラッシュ／`WXEX2-27-E3` は即20枚ミル）＝原文より圧倒的に強い。
  // 🔑新設 `ON_PLAYER_DAMAGED`＝**誰の攻撃でも**反応する（既存 `ON_SIGNI_DAMAGE` は
  //   「**このシグニが**与えたとき」で主語が違い、ルリグアタックのダメージを取りこぼす）。
  //   発生印は `PlayerState.damaged_just`（アタックの2経路だけが立て、クラッシュ解決 funnel が読んで消す）。
  // ⚠**`ON_OPP_LIFE_CRASHED` を流用してはいけない**＝あちらは**効果によるクラッシュでも発火**する。
  // ══════════════════════════════════════════════════════════════════════════════

  "WX18-002": [
    {"effectId":"WX18-002-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":2},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_PLAYER_DAMAGED"},"effect":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  "WXEX2-27": [
    {"effectId":"WXEX2-27-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"coin":1},"action":{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_PLAYER_DAMAGED"},"effect":{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":20}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],

  "WXK10-045": [
    {"effectId":"WXK10-045-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"HAND_TO_CHECK_ZONE","owner":"opponent","count":1},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_TURN_END"},"effect":{"type":"TRANSFER_TO_HAND","source":{"type":"CHECK_CARD","owner":"opponent","count":1},"targetsStored":true}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],

  "WX25-CP1-038": [
    {"effectId":"WX25-CP1-038-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"CONDITIONAL","condition":{"type":"ALL_FIELD_SIGNI_MATCH","owner":"self","filter":{"cardType":"シグニ","story":"ブルアカ"}},"then":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"SELECT_TARGET_ONLY","selectTarget":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}},{"type":"STUB","id":"STORE_LAST_PROCESSED_TARGETS"},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_POWER_LTE","value":5000},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"targetsStored":true,"optional":false}},{"type":"INSTALL_DELAYED_TRIGGER","duration":"THIS_TURN","trigger":{"timing":"ON_TURN_END"},"effect":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}},"targetsStored":true}}]}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
};

/**
 * 自動解析結果とマニュアル効果をマージする。
 * - manualEffects 内の effectId が一致するものは上書き
 * - 一致しない effectId は末尾に追加
 */
export function mergeManualEffects(
  cardNum: string,
  parsed: CardEffect[],
): CardEffect[] {
  const manuals = MANUAL_EFFECTS[cardNum];
  if (!manuals || manuals.length === 0) return parsed;

  const manualMap = new Map(manuals.map(e => [e.effectId, e]));
  const merged = parsed.map(e => manualMap.has(e.effectId) ? manualMap.get(e.effectId)! : e);
  for (const m of manuals) {
    if (!merged.some(e => e.effectId === m.effectId)) merged.push(m);
  }
  return merged;
}
