import type { CardEffect, SequenceAction, ChooseAction, GrantLrigAbilityAction } from '../types/effects';

/**
 * パーサーで自動解析できないカード固有の効果定義。
 * buildEffectsMap および buildEffectsJson で自動解析結果にマージされる。
 * - 同じ effectId が存在する場合はここの定義で上書き
 * - 存在しない effectId は末尾に追加
 */
export const MANUAL_EFFECTS: Record<string, CardEffect[]> = {
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
    {"effectId":"WXEX1-49-E2","effectType":"AUTO","timing":["ON_CARD_MILLED_FROM_DECK"],"triggerCondition":{"milledDeckOwner":"self","milledMinCount":3},"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"delta":-8000}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","usageLimit":"once_per_turn"},
  ],
  "WXEX1-69": [
    {"effectId":"WXEX1-69-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"action":{"type":"SEQUENCE","steps":[{"type":"REVEAL","source":{"type":"HAND_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"龍獣"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":2},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"ENERGY_CARD","owner":"self","count":1,"upToCount":true,"filter":{"cardType":"シグニ","story":"龍獣"}}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ"},"minCount":3},"then":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":2000},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
  ],
  "WXEX2-52": [
    {"effectId":"WXEX2-52-E1","effectType":"AUTO","timing":["ON_OPP_POWER_DECREASED"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true}},"delta":0,"deltaFromOppPowerDecrease":true},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerCondition":{"byOwnEffect":true}},
  ],
  "WXEX2-68": [
    {"effectId":"WXEX2-68-E1","effectType":"AUTO","timing":["ON_REVEALED_FROM_HAND"],"action":{"type":"SEQUENCE","steps":[{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"any","count":1},"delta":3000},{"type":"STUB","id":"OPTIONAL_COST","costText":"手札から《幻竜　アルゼンチノ》を１枚捨ててもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"Sランサー","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","triggerCondition":{"revealSourceStory":"龍獣"}},
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
    {"effectId":"WXDi-CP02-052-E1","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","handDiscard":{"count":1}},{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"opponent","operator":"lte","value":3},"then":{"type":"BOUNCE","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":8000}}},"optional":false}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"opponent","operator":"gte","value":4},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","powerRange":{"max":8000}}}}}}]}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","triggerScope":"self"},
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
    {"effectId":"WX25-P1-039-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"LOOK_PICK_CHAIN","owner":"self","revealCount":5,"stages":[{"filter":{"cardType":"シグニ","cardClass":"原子"},"pickCount":1,"then":"hand","pickUpTo":true},{"filter":{"cardType":"シグニ","cardClass":"原子"},"pickCount":1,"then":"field","pickUpTo":true}],"remainder":{"location":"deck","position":"bottom","reorder":true}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ","levelLteLastProcessed":true}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WX25-P2-005": [
    {"effectId":"WX25-P2-005-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"青","count":0}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"GAIN_ABILITY_THIS_GAME"},{"type":"STUB","id":"HAND_SIZE_INCREASE"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
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
    {"effectId":"WXK06-053-E1","effectType":"AUTO","timing":["ON_TURN_END"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"このシグニを場からトラッシュに置いてもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRASH","target":{"type":"ENERGY_CARD","owner":"opponent","count":1}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK07-042": [
    {"effectId":"WXK07-042-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"原子"}}},{"type":"DRAW","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"minCount":2},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"原子"},"minCount":3},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
  ],
  "WXK08-045": [
    {"effectId":"WXK08-045-E1","effectType":"AUTO","timing":["ON_BECOME_BEAT"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"悪魔"}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","condition":{"type":"BEAT_CONDITION","condText":"３枚"}},
  ],
  "WXK09-089": [
    {"effectId":"WXK09-089-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","cardClass":"電機"}}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteLastProcessed":true}}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK10-007": [
    {"effectId":"WXK10-007-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"WXK10-007-E1-c1","label":"対戦相手のターンの場合、対戦相手のセンタールリグは能力を失う（ターン終了時まで）","action":{"type":"REMOVE_ABILITIES","target":{"type":"LRIG","owner":"opponent","count":1},"until":"UNTIL_END_OF_TURN"},"condition":{"type":"TURN_OWNER","owner":"opponent"}},{"choiceId":"WXK10-007-E1-c2","label":"《白》を支払い、対戦相手のシグニ1体に「アタックできない」を付与する","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["白"]},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
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
    {"effectId":"WXK10-075-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","abilities":[{"effectId":"WXK10-075-E2-G","effectType":"AUTO","action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["青"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"POWER_MODIFY_BY_SOURCE","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"basis":"power","multiplier":-1}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXK11-033": [
    {"effectId":"WXK11-033-E1","effectType":"AUTO","timing":["ON_SPELL_USE"],"triggerFilter":{"color":"赤"},"action":{"type":"SEQUENCE","steps":[{"type":"GRANT_PROTECTION","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"from":["BANISH"],"sourceOwner":"opponent","duration":"PERMANENT"},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
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
    {"effectId":"PR-Di035-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":2}]},"action":{"type":"SEQUENCE","steps":[{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","story":"プリパラ"}}},{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"any","count":1,"filter":{"cardType":"シグニ","story":"プリパラ","color":"白"}},"keyword":"シグニバリア","duration":"PERMANENT"},{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":false},{"type":"TRASH","target":{"type":"HAND_CARD","owner":"opponent","count":3}},{"type":"SEND_TO_ENERGY","target":{"type":"SIGNI","owner":"opponent","count":"ALL"}},{"type":"TRASH","target":{"type":"DECK_CARD","owner":"opponent","count":20}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
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
    {"effectId":"WXDi-CP01-036-E1","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"abilityloss","label":"＜バーチャル＞がいれば相手シグニの能力を失わせる","action":{"type":"CONDITIONAL","condition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"バーチャル"},"excludeSelf":true},"then":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"until":"UNTIL_END_OF_TURN"}}},{"choiceId":"look","label":"デッキ上2枚を見て1枚トップ・残り下","action":{"type":"STUB","id":"LOOK_TOP_ONE_RETURN_REST_BOTTOM"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"},
  ],
  "WXDi-CP02-072": [
    {"effectId":"WXDi-CP02-072-E1","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"手札から＜ブルアカ＞のカードを１枚捨ててもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"filter":{"cardType":"シグニ","hasGuard":true}}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
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
    {"effectId":"WXK04-054-E2","effectType":"AUTO","timing":["ON_REVEALED_FROM_HAND"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costText":"手札から《幻水プレシオ》を１枚捨ててもよい"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1},"keyword":"ランサー","duration":"UNTIL_END_OF_TURN"}}]},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL"},
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
    {"effectId":"SPK01-13-E1","effectType":"ACTIVATED","timing":["MAIN","ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"白","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":5,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ"}}}},{"choiceId":"c1","label":"選択肢2","action":{"type":"EXILE","target":{"type":"TRASH_CARD","owner":"opponent","count":2,"upToCount":true}}},{"choiceId":"c2","label":"選択肢3","action":{"type":"PREVENT_NEXT_DAMAGE","count":1}},{"choiceId":"c3","label":"選択肢4","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false},"keyword":"アタックできない","duration":"UNTIL_END_OF_TURN"}},{"choiceId":"c4","label":"対戦相手のすべてのシグニは効果で得ている能力を失う（ターン終了時まで）","action":{"type":"REMOVE_ABILITIES","target":{"type":"SIGNI","owner":"opponent","count":"ALL"},"until":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
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
  "WD20-018": [
    {"effectId":"WD20-018-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"c0","label":"選択肢1","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"英知"},"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"REVEAL_AND_PICK","owner":"self","revealCount":4,"pickCount":1,"filter":{"cardType":"シグニ"},"then":{"type":"ADD_TO_HAND","owner":"self"},"remainder":{"location":"deck","position":"bottom","reorder":true}}},{"type":"LOOK_AND_REORDER","source":{"location":"deck","owner":"self"},"count":0,"private":true,"reorder":true,"destination":{"location":"deck","owner":"self","position":"bottom"}}]}},{"choiceId":"c1","label":"選択肢2","action":{"type":"SEQUENCE","steps":[{"type":"CONDITIONAL","condition":{"type":"LIFE_COUNT","owner":"self","operator":"eq","value":0},"then":{"type":"TRASH","target":{"type":"SIGNI","owner":"self","count":"ALL"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_MATCHES","filter":{"cardType":"シグニ","story":"英知"},"operator":"gte","value":3},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"PARTIAL"},
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
    {"effectId":"WX25-P3-027-E2","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"黒","count":0}]},"action":{"type":"STUB","id":"SET_DISPAIR_BURST_GRANT","burstAction":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["無"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}}}]}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}
  ,
    {"effectId":"WX25-P3-027-E1","effectType":"AUTO","timing":["ON_ATTACK_LRIG"],"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["黒"]},{"type":"CONDITIONAL","condition":{"type":"AND","conditions":[{"type":"IS_MY_TURN"},{"type":"TRASH_HAS_CARD","owner":"self","filter":{"cardType":"シグニ","story":"悪魔"},"minCount":15}]},"then":{"type":"BLOCK_ACTION","target":{"type":"PLAYER","owner":"opponent","count":1},"actionId":"GUARD","until":"END_OF_ATTACK"}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"},
  ],
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
    {"effectId":"WXDi-P04-013-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":3},"action":{"type":"SEQUENCE","steps":[{"type":"EXILE","target":{"type":"LRIG_DECK_CARD","owner":"self","count":1,"filter":{"cardType":"ピース"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":3,"upToCount":true,"filter":{"cardType":"シグニ","noGuard":true}}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}
  ],
  "WXDi-P04-016": [
    {"effectId":"WXDi-P04-016-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":3},"action":{"type":"SEQUENCE","steps":[{"type":"EXILE","target":{"type":"LRIG_DECK_CARD","owner":"self","count":1,"filter":{"cardType":"ピース"}}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true},"delta":-12000,"duration":"UNTIL_END_OF_TURN"}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_game"}
  ],
  // PR-378: 原文は「あなたのシグニ１体を対象とし」＝count:1 強制。除外も「そうした場合」の内側
  // ＝バニッシュ不成立時はこのカードを除外しない（通常どおりトラッシュへ）。
  "PR-378": [
    {"effectId":"PR-378-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":0}]},"action":{"type":"CHOOSE","choose_count":1,"from_count":2,"choices":[{"choiceId":"draw","label":"自分のシグニ1体をバニッシュし、そうした場合1枚引き自身を除外","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEQUENCE","steps":[{"type":"DRAW","owner":"self","count":1},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]}}]}},{"choiceId":"charge","label":"自分のシグニ1体をバニッシュし、そうした場合エナチャージ1し自身を除外","action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"upToCount":false}},{"type":"CONDITIONAL","condition":{"type":"LAST_PROCESSED_COUNT_GTE","value":1},"then":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]}}]}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],
  "SP36-001": [
    {"effectId":"SP36-001-E1","effectType":"ACTIVATED","timing":["ATTACK","SPELL_CUTIN"],"cost":{"energy":[{"color":"赤","count":3},{"color":"無","count":3}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"},{"type":"STUB","id":"ARTS_COST_REDUCTION_BY_EFFECT"},{"type":"STUB","id":"PREVENT_DEFEAT_THIS_TURN"},{"type":"STUB","id":"EXILE_SELF_AFTER_USE"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
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
  "WXK05-030": [{"effectId":"WXK05-030-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WXK05-030-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"無","count":5}]},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"BANISH_MULTI_COLOR_SIGNI"},{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"color":"黒"},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},{"type":"STUB","id":"RULE_REMINDER_TEXT"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
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
    {"effectId":"WXEX2-71-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"緑","count":0}]},"activeCondition":{"type":"EICHI_LEVEL_SUM","operator":"eq","value":5},"action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"英知","excludeSelf":true},"upToCount":false},"keyword":"正面以外追加アタック","duration":"UNTIL_END_OF_TURN"},"duration":"UNTIL_END_OF_TURN","mandatory":false,"parseStatus":"MANUAL","usageLimit":"once_per_turn"}
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
  "WXDi-P05-034": [{"effectId":"WXDi-P05-034-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_HAS_UNDER"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK03-034": [{"effectId":"WXK03-034-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"TURN_HAND_DISCARD_GTE","value":2},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK03-056": [{"effectId":"WXK03-056-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"TURN_HAND_DISCARD_GTE","value":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
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
  "WXDi-P04-015": [{"effectId":"WXDi-P04-015-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_SOUL_HOST_ABILITY","abilities":[{"effectId":"WXDi-P04-015-E1-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","level":{"max":2}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-P15-061": [{"effectId":"WXDi-P15-061-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_SIGNI_ABOVE_ABILITY","filter":{"cardClass":"解放派"},"abilities":[{"effectId":"WXDi-P15-061-E2-G","effectType":"AUTO","timing":["ON_ATTACK_PHASE_START"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WD14-001": [{"effectId":"WD14-001-E3","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GRANT_ALL_ZONE_LIFEBURST"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  // WX02-002 火鳥風月 遊月・肆（ルリグ）E1【常】：あなたのすべての領域にあるカードは【ライフバースト】【エナチャージ１】を持つ。
  //   旧パース＝「シグニ1体に付与」誤り。全領域へエナチャージ1のバーストを付与（burstAdditive＝ネイティブ持ちにも追加し両方使用可）。
  "WX02-002": [{"effectId":"WX02-002-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"GRANT_ALL_ZONE_LIFEBURST","burstAdditive":true,"burstAction":{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1}},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX25-P3-057": [{"effectId":"WX25-P3-057-E1","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_AWAKENED"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","thisCardOnly":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX09-019": [{"effectId":"WX09-019-E2","effectType":"AUTO","timing":["ON_LIFE_CRASHED"],"triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":18000},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX09-027": [{"effectId":"WX09-027-E1","effectType":"CONTINUOUS","action":{"type":"STUB","id":"BANISH_THRESHOLD_BOOST_7_15"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-CP02-TK02A": [{"effectId":"WXDi-CP02-TK02A-E1","effectType":"AUTO","timing":["ON_SIGNI_BATTLE"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":10000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],

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
  //    旧: SEQUENCE末尾に無条件 TRASH があり常に全シグニ消失＝誤。条件判定は OPP_DECLARE_CHOICE→INTERNAL_ODC_COLOR_CHECK が担う（送り先をエナ→トラッシュに是正）。
  "WX05-006": [
    {"effectId":"WX05-006-E2","effectType":"CONTINUOUS","action":{"type":"STUB","id":"IGNORE_LRIG_RESTRICTION_ARTS"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX05-006-E3","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"exceed":5},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"CHOOSE_HAND_CARD"},{"type":"STUB","id":"OPP_DECLARE_CHOICE"}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
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
          { type: 'STUB', id: 'DRAW_IF_POWER_ZERO_TEMP' },
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
  // 【常】あなたのターンの間、対戦相手はシグニを２体までしか場に出すことができない
  'WXDi-P11-TK01': [
    {
      effectId: 'WXDi-P11-TK01-E1',
      effectType: 'CONTINUOUS',
      appearanceCondition: {"rawText":"《メインフェイズアイコン》手札とエナゾーンからシグニを合計２枚トラッシュに置く","timings":["MAIN"],"cost":{},"combinedTrash":{"zones":["hand","energy"],"count":2,"filter":{"cardType":"シグニ"}},"paymentShape":"REQUIRES_NEW_FLOW"},
      activeCondition: { type: 'TURN_OWNER', owner: 'self' },
      action: { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

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

  // PR-Di017B REV:アンコーリング（シグニ）
  // 【自】アタックフェイズ開始時、対戦相手のシグニ1体を対象とし、手札を3枚捨ててもよい→トラッシュ
  'PR-Di017B': [
    {
      effectId: 'PR-Di017B-E1',
      effectType: 'AUTO',
      timing: ['ATTACK'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'TARGET_ONLY' },
          {
            type: 'STUB', id: 'OPTIONAL_COST',
            costColors: [],
            costText: '手札を３枚捨てる',
          },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WXDi-P14-TK04 フェゾーネマジック・深緑（スペル/クラフト）
  // 【エナチャージ１】をする。その後、あなたのエナゾーンからシグニを１枚まで対象とし、それを場に出す
  'WXDi-P14-TK04': [
    {
      effectId: 'WXDi-P14-TK04-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 0 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
          { type: 'STUB', id: 'SUMMON_FROM_ENERGY' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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
      timing: ['ON_BANISH'],
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
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -5000 } },
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
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', hasGuard: true } } } },
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
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['青', '青'] },
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' }, then: { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, shuffle: false, position: 'bottom' } },
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

  // WXDi-P15-098 凶将　アオトラ
  // 【常】：あなたの黒のシグニは「【自】：このシグニがアタックしたとき、対戦相手のデッキの一番上のカードをトラッシュに置く。」を得る。
  // 旧パース＝CONTINUOUS TRASH DECK_CARD self（owner も誤り・no-op）。
  // 自分の黒シグニ全体への付与＝GRANT_FIELD_SIGNI_ABILITY（collectGrantedFromLayer が augMap へ合成）。
  // 付与能力は ON_ATTACK_SIGNI で相手デッキ上1枚をトラッシュ（mill）。BURST はパーサー生成を維持。
  'WXDi-P15-098': [
    {
      effectId: 'WXDi-P15-098-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_FIELD_SIGNI_ABILITY',
        filter: { cardType: 'シグニ', color: '黒' },
        abilities: [
          {
            effectId: 'WXDi-P15-098-E1-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_SIGNI'],
            triggerScope: 'self',
            action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: 1 } },
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
      {"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","無"]},
      {"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":12000},"frontOfSelf":true},"upToCount":false}}}
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
  "WXEX2-69": [{"effectId":"WXEX2-69-E3P","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"acceHost":true,"cardClass":"調理"}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-P03-016": [{"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL","effectId":"WXDi-P03-016-E1b","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":5000}}],
  "WXDi-CP02-103": [{"effectId":"WXDi-CP02-103-E2","effectType":"CONTINUOUS","action":{"type":"STUB","id":"TREAT_AS_CLASS_ALL_ZONES"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX24-P4-058": [{"duration":"UNTIL_OPP_TURN_END","mandatory":true,"parseStatus":"MANUAL","effectId":"WX24-P4-058-E1b","effectType":"AUTO","timing":["ON_SIGNI_BANISH_BATTLE"],"usageLimit":"once_per_turn","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"delta":5000,"duration":"UNTIL_OPP_TURN_END"}}],
  "WX25-P1-054": [{"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL","effectId":"WX25-P1-054-E1b","effectType":"AUTO","timing":["ON_HEAVEN"],"usageLimit":"once_per_turn","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardName":"合炎奇炎　タマヨリヒメ之参"}},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_TRASH_ENERGY_CLASS"},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"LIFE_CRASH","owner":"opponent","count":1,"triggerBurst":true}}]}}],
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
  // §5.2 Sheet2 バッチ1（2026-08-29）＝1文の後半（対戦相手のターン中の＋3000）が丸ごと落ちていた。
  //   原文「…＜アーム＞のシグニは対戦相手のルリグの効果を受けず、**それらのパワーを対戦相手のターンの間、＋3000する**」
  //   ⚠E1（耐性）は parser 出力のままで正しいので触らない。**足りない1本だけ**を E1b として足す。
  //   受け皿は既存（`AND{TURN_OWNER opponent, HAS_CARD_IN_FIELD}`＝`WX20-052` ほか）。
  "WX19-021": [
    {"effectId":"WX19-021-E1b","effectType":"CONTINUOUS","activeCondition":{"type":"AND","conditions":[{"type":"TURN_OWNER","owner":"opponent"},{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"ウェポン"}}]},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","story":"アーム"}},"delta":3000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
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
    {"effectId":"WD15-001-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":2}},{"type":"BANISH","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"cardType":"シグニ","story":"龍獣"},"upToCount":false}},{"type":"GRANT_KEYWORD","target":{"type":"LRIG","owner":"self","count":1},"keyword":"ダブルクラッシュ","duration":"UNTIL_END_OF_TURN"}]},"duration":"UNTIL_END_OF_TURN","mandatory":true,"parseStatus":"MANUAL"}
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
