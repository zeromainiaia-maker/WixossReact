import type { CardEffect, SequenceAction, ChooseAction, GrantLrigAbilityAction } from '../types/effects';

/**
 * パーサーで自動解析できないカード固有の効果定義。
 * buildEffectsMap および buildEffectsJson で自動解析結果にマージされる。
 * - 同じ effectId が存在する場合はここの定義で上書き
 * - 存在しない effectId は末尾に追加
 */
export const MANUAL_EFFECTS: Record<string, CardEffect[]> = {
  // ===== 【常】：【マルチエナ】（自身キーワード）を effects.json に未登録だったカード群（逆翻訳・検出の一貫性のため明示）=====
  "WD01-016": [{"effectId":"WD01-016-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WD01-017": [{"effectId":"WD01-017-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WD04-016": [{"effectId":"WD04-016-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WD04-017": [{"effectId":"WD04-017-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX01-051": [{"effectId":"WX01-051-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX01-100": [{"effectId":"WX01-100-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX02-077": [{"effectId":"WX02-077-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX02-078": [{"effectId":"WX02-078-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX10-097": [{"effectId":"WX10-097-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX10-098": [{"effectId":"WX10-098-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX10-099": [{"effectId":"WX10-099-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX10-100": [{"effectId":"WX10-100-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-D01-020": [{"effectId":"WXDi-D01-020-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-D03-020": [{"effectId":"WXDi-D03-020-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK01-119": [{"effectId":"WXK01-119-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK01-120": [{"effectId":"WXK01-120-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK01-121": [{"effectId":"WXK01-121-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK01-122": [{"effectId":"WXK01-122-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK05-030": [{"effectId":"WXK05-030-MULTIENA","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],


  // ===== F: フラット化 CONTINUOUS BANISH 修正の durable 化（v0.414 JSON 修正を manualEffects へ昇格・再生成耐性）=====
  "WX10-063": [{"effectId":"WX10-063-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"THIS_CARD_IN_CENTER_ZONE"},{"type":"LRIG_COLOR","owner":"self","color":"赤"}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":1000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK07-044": [{"effectId":"WXK07-044-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IN_CENTER_ZONE"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":7000,"max":7000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "PR-288": [{"effectId":"PR-288-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"THIS_CARD_IN_CENTER_ZONE"},{"type":"LRIG_LEVEL_EQ_OPP"}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":2000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "PR-426": [{"effectId":"PR-426-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"AND","conditions":[{"type":"LIFE_COUNT","owner":"self","operator":"lte","value":1},{"type":"THIS_CARD_IN_CENTER_ZONE"}]},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX17-038": [{"effectId":"WX17-038-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IN_CENTER_ZONE"},"action":{"type":"REVEAL_UNTIL_BANISH_SAME_LEVEL","revealClass":"宇宙","banishOwner":"opponent"},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX05-021": [{"effectId":"WX05-021-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":20000},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-P07-060": [{"effectId":"WXDi-P07-060-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_AWAKENED"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WDK08-L11": [{"effectId":"WDK08-L11-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_IS_ARMORED"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"filter":{"cardType":"シグニ"},"upToCount":true}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WDK16-06H": [{"effectId":"WDK16-06H-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"LRIG_NAME_CONTAINS","owner":"self","name":"楓"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXDi-P05-034": [{"effectId":"WXDi-P05-034-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"THIS_CARD_HAS_UNDER"},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤","赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK03-034": [{"effectId":"WXK03-034-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"TURN_HAND_DISCARD_GTE","value":2},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WXK03-056": [{"effectId":"WXK03-056-E1","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"TURN_HAND_DISCARD_GTE","value":1},"action":{"type":"SEQUENCE","steps":[{"type":"STUB","id":"OPTIONAL_COST","costColors":["赤"]},{"type":"CONDITIONAL","condition":{"type":"PAID_ADDITIONAL_COST"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":3000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX20-Re18": [{"effectId":"WX20-Re18-E2","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","condition":{"type":"SELF_POWER_GTE","value":12000},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX13-034": [{"effectId":"WX13-034-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ"},"abilities":[{"effectId":"WX13-034-E2-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLtSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX21-052": [{"effectId":"WX21-052-E1","effectType":"CONTINUOUS","action":{"type":"GRANT_FIELD_SIGNI_ABILITY","filter":{"cardType":"シグニ","cardClass":"天使"},"abilities":[{"effectId":"WX21-052-E1-G","effectType":"AUTO","timing":["ON_TURN_END"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":2,"upToCount":true,"filter":{"cardType":"シグニ","powerRange":{"max":5000}}},"selfTrashCost":true},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX16-045": [{"effectId":"WX16-045-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WX16-045-E3-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX20-072": [{"effectId":"WX20-072-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ"},"abilities":[{"effectId":"WX20-072-E3-G","effectType":"AUTO","timing":["ON_ATTACK_SIGNI"],"triggerScope":"self","action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerLteSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "SP27-015": [{"effectId":"SP27-015-E3","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","abilities":[{"effectId":"SP27-015-E3-G","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"acceTrash":2},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ"},"upToCount":false}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
  "WX18-076": [{"effectId":"WX18-076-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_ACCE_HOST_ABILITY","filter":{"cardType":"シグニ","cardClass":"調理"},"abilities":[{"effectId":"WX18-076-E2-G","effectType":"AUTO","timing":["ON_BANISH"],"triggerScope":"self","condition":{"type":"IS_OPPONENT_TURN"},"action":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","frontOfSelf":true},"upToCount":false}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}]},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}],
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
  "WX04-071": [
    {"effectId":"WX04-071-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}],"trash_self":true},"action":{"type":"SEARCH","from":{"location":"deck","owner":"self"},"filter":{"cardType":"スペル","color":"赤","costMax":1},"maxCount":1,"then":{"type":"SEQUENCE","steps":[{"type":"REVEAL"},{"type":"ADD_TO_HAND","owner":"self"}]},"afterSearch":{"type":"SHUFFLE_DECK","owner":"self"}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

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
    {"effectId":"WX04-073-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"LIFE_CRASH","owner":"self","count":1,"triggerBurst":true},{"type":"CONDITIONAL","condition":{"type":"IS_MY_TURN"},"then":{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":8000}},"upToCount":false}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-074-E1 懐疑する慟哭（スペル）対戦相手の、パワー5000以下のシグニ1体とパワー10000以上のシグニ1体を対象とし、それらをバニッシュする。
  //   旧AUTO: 1体の target に powerRange{min:10000,max:5000}（成立不能）で潰れていた。2体別々の BANISH に分割。
  "WX04-074": [
    {"effectId":"WX04-074-E1","effectType":"ACTIVATED","timing":["MAIN"],"cost":{"energy":[{"color":"赤","count":2},{"color":"緑","count":1}]},"action":{"type":"SEQUENCE","steps":[{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"max":5000}},"upToCount":false}},{"type":"BANISH","target":{"type":"SIGNI","owner":"opponent","count":1,"filter":{"cardType":"シグニ","powerRange":{"min":10000}},"upToCount":false}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-078-E1 コードアート R・P・G（シグニ 精械：電機）【常】対戦相手の場に凍結状態のシグニがあるかぎり、このシグニの基本パワーは10000になる。
  //   activeCondition HAS_CARD_IN_FIELD(owner:opponent, filter:isFrozen) 欠落で常時10000になっていた。
  //   ※ checkActiveCondition/evalUseCondition の HAS_CARD_IN_FIELD を matchesStateFilter 併用に拡張（isFrozen等の状態フィルタ対応）。
  "WX04-078": [
    {"effectId":"WX04-078-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"opponent","filter":{"cardType":"シグニ","isFrozen":true}},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":10000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-079-E1 羅原 F（シグニ 精羅：原子）【常】あなたの場に＜原子＞のシグニが3体あるかぎり、あなたのシグニのパワーを+2000する。
  //   activeCondition の minCount:3 欠落で「1体以上」になっていた。
  "WX04-079": [
    {"effectId":"WX04-079-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"原子"},"minCount":3},"action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ"}},"delta":2000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-082-E1 コードアート S・M・L（シグニ 精械：電機）【自】このシグニの正面のシグニがアタックしたとき、アタックしたそのシグニを凍結する。
  //   旧AUTO: timing ON_ATTACK_SIGNI（このシグニがアタック時）＋対象 self（誤）。正しくは防御側・正面シグニが、アタッカー（正面のシグニ）を凍結。
  //   新トリガー ON_FRONT_SIGNI_ATTACK（BattleScreen のアタックハンドラが正面ゾーンの守備側シグニで発火・triggeringCardNum=アタッカー）、
  //   FREEZE 対象 owner:opponent + filter.isTriggerSource（execFreeze が triggeringCardNum に限定）。
  "WX04-082": [
    {"effectId":"WX04-082-E1","effectType":"AUTO","timing":["ON_FRONT_SIGNI_ATTACK"],"action":{"type":"FREEZE","target":{"type":"SIGNI","owner":"opponent","count":"ALL","filter":{"cardType":"シグニ","isTriggerSource":true}}},"duration":"INSTANT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-056-E1 大壊 アクス（シグニ 精武：アーム）【常】あなたの他の＜アーム＞のシグニのパワー+2000。
  "WX04-056": [
    {"effectId":"WX04-056-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","cardClass":"アーム","excludeSelf":true}},"delta":2000,"excludeSelf":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-054 サーバント X（シグニ 精元）E1【常】カード名に《サーバント》を含む他の自シグニのパワー+3000。E2【常】このシグニは【マルチエナ】を持つ。
  "WX04-054": [
    {"effectId":"WX04-054-E1","effectType":"CONTINUOUS","action":{"type":"POWER_MODIFY","target":{"type":"SIGNI","owner":"self","count":"ALL","filter":{"cardType":"シグニ","cardName":"サーバント","excludeSelf":true}},"delta":3000,"excludeSelf":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX04-054-E2","effectType":"CONTINUOUS","action":{"type":"GRANT_KEYWORD","target":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}},"keyword":"マルチエナ","duration":"PERMANENT"},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"}
  ],

  // WX04-052 堕落の虚無 パイモン（シグニ 精像：悪魔）
  //  E1【常】＜悪魔＞シグニがバニッシュされる場合、代わりに付いている【チャーム】1枚をトラッシュしてもよい（チャーム盾）。
  //  E2【出】デッキトップをこのシグニの【チャーム】にしてもよい。BURST：デッキ上3枚トラッシュ→トラッシュから＜悪魔＞シグニ1枚を手札へ。
  "WX04-052": [
    {"effectId":"WX04-052-E1","effectType":"CONTINUOUS","action":{"type":"CHARM_PROTECTION","signiFilter":{"cardType":"シグニ","story":"悪魔"},"optional":true},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX04-052-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"ATTACH_CHARM","optional":true,"charm":{"type":"DECK_CARD","owner":"self","count":1},"to":{"type":"SIGNI","owner":"self","count":1,"filter":{"thisCardOnly":true}}},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"},
    {"effectId":"WX04-052-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[{"type":"TRASH","target":{"type":"DECK_CARD","owner":"self","count":3}},{"type":"TRANSFER_TO_HAND","source":{"type":"TRASH_CARD","owner":"self","count":1,"upToCount":false,"filter":{"cardType":"シグニ","story":"悪魔"}}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
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
    {"effectId":"WX04-041-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"迷宮"},"excludeSelf":true},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":10000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
    {"effectId":"WX04-041-E2","effectType":"AUTO","timing":["ON_PLAY"],"action":{"type":"REARRANGE_SIGNI","target":{"type":"SIGNI","owner":"opponent","count":"ALL"},"optional":true},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

  // WX04-040 極壊 ハンマ（シグニ 精武：アーム）
  //  E1【常】場に＜ウェポン＞がある限り基本パワー15000。E2【起】場から＜アーム＞1体＋＜ウェポン＞1体トラッシュ→相手シグニ1体バニッシュ。
  //  BURST：手札から＜アーム＞1枚＋＜ウェポン＞1枚を捨てたら、相手シグニ1体を手札に戻し、相手シグニ1体をバニッシュ。
  "WX04-040": [
    {"effectId":"WX04-040-E1","effectType":"CONTINUOUS","activeCondition":{"type":"HAS_CARD_IN_FIELD","owner":"self","filter":{"cardType":"シグニ","story":"ウェポン"}},"action":{"type":"POWER_SET","target":{"type":"SIGNI","owner":"self","count":1},"value":15000},"duration":"PERMANENT","mandatory":true,"parseStatus":"MANUAL"},
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
    {"effectId":"WX04-035-BURST","effectType":"LIFE_BURST","timing":["ON_LIFE_BURST"],"action":{"type":"SEQUENCE","steps":[{"type":"ENERGY_CHARGE_FROM_DECK","owner":"self","count":1},{"type":"CONDITIONAL","condition":{"type":"ENERGY_COUNT_FILTER","owner":"self","filter":{"cardType":"シグニ","story":"美巧"},"operator":"gte","value":5},"then":{"type":"ADD_TO_LIFE","owner":"self","count":1,"fromTop":true}}]},"duration":"INSTANT","mandatory":false,"parseStatus":"MANUAL"}
  ],

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
  // ・冒頭のコスト軽減（自L4以下&相手L5以上で《無×1》）は CONDITIONAL_ARTS_COST STUB のまま（未実装）。
  // ・④ADD_TO_FIELD はエンジン上【出】を発動させないため「【出】能力は発動しない」を既定で満たす。
  'WX20-020': [
    {
      effectId: 'WX20-020-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '無', count: 6 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' },
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
  // ・任意コスト軽減（手札から赤緑の＜龍獣＞1枚ずつ捨てて《赤×0》）は OPTIONAL_COST STUB のまま（未実装）。
  // ・①colorNotMatchesLrig は ENERGY_CARD 対象では対象オーナー（＝相手）のルリグ基準で解決される（execTrash）。
  'WX21-035': [
    {
      effectId: 'WX21-035-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 1 }, { color: '緑', count: 1 }, { color: '無', count: 1 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['赤', '緑'] },
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
  ],

  // WX04-030 トライ・シグナル（スペル）
  // E1「対戦相手のシグニ1体を対象とし、それを対戦相手のデッキに戻し、対戦相手は自分のデッキをシャッフルする」
  //   旧パース誤り: TRANSFER_TO_DECK の shuffle:false（＝デッキの上に置く）。正しくは shuffle:true（デッキに戻してシャッフル）。
  // BURST「手札から＜迷宮＞シグニ1枚を捨てる。そうした場合、対戦相手は対象の自分のシグニ1体をトラッシュに置く」
  //   旧パース誤り: 2段目 TRASH に opponentSelects 欠落（相手自身が選ぶべき）。
  'WX04-030': [
    {
      effectId: 'WX04-030-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '白', count: 3 }, { color: '無', count: 2 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' },
        { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, shuffle: true },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
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
      effectId: 'WX04-031-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'COUNT_THRESHOLD', owner: 'opponent', location: 'energy', operator: 'lte', value: 4 },
      action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, keyword: 'ダブルクラッシュ', duration: 'PERMANENT' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX04-031-E2',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      triggerScope: 'self',
      action: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
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
      effectId: 'WX04-032-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 5 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ', powerRange: { max: 10000 } } } },
        { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
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
  'WX04-033': [
    {
      effectId: 'WX04-033-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'COST_INCREASE', targetCardType: 'スペル', targetOwner: 'opponent', amount: [{ color: '無', count: 1 }], duration: 'PERMANENT' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX04-033-E2',
      effectType: 'AUTO',
      timing: ['ON_SPELL_USE'],
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', story: '原子' } }, delta: 2000 },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX04-033-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { fieldDown: { count: 2, filter: { cardType: 'シグニ', isUp: true, story: '原子' } } },
      action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX04-033-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'SEQUENCE', steps: [
        { type: 'DRAW', owner: 'self', count: 1 },
        { type: 'CONDITIONAL', condition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', story: '原子' } }, then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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

  // WD03-011 コードアート　Ｓ・Ｍ・Ｐ（シグニ）
  // 【出】：対戦相手の手札を見てレベル１のカード１枚を選び、捨てさせる。
  // 旧JSONの誤り: blind/actingPlayerSelects が無いため execTrash で opponentResponds=true＝「相手が選ぶ」になっていた。
  // 本来は「見て…選び」＝自分（効果使用側）が相手手札のレベル1を選ぶ → actingPlayerSelects:true。
  'WD03-011': [
    {
      effectId: 'WD03-011-E1',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'TRASH',
        target: { type: 'HAND_CARD', owner: 'opponent', count: 1, filter: { level: 1 }, actingPlayerSelects: true },
      },
      duration: 'INSTANT',
      mandatory: true,
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
      effectId: 'WX01-030-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 3 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 12000 } }, upToCount: false } },
        { type: 'GRANT_KEYWORD', target: { type: 'LRIG', owner: 'self', count: 1 }, keyword: 'ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN' },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
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
  'WX01-085': [
    {
      effectId: 'WX01-085-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 1 }] },
      action: { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' }, upToCount: false }, down: true },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX01-085-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 2, filter: { cardType: 'シグニ' }, upToCount: true }, down: true },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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
  'WX01-037': [
    {
      effectId: 'WX01-037-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { down_self: true },
      action: { type: 'SEARCH', from: { location: 'deck', owner: 'self' },
        filter: { cardType: 'シグニ', level: { max: 3 }, excludeCardName: '忘得ぬ幻想　ヴァルキリー' },
        maxCount: 1,
        then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] },
        afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' } },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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
  'WX01-033': [
    {
      effectId: 'WX01-033-E1',
      effectType: 'AUTO',
      timing: ['ON_SPELL_USE'],
      triggerFilter: { color: '緑' },
      action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WX01-033-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 1 }, { color: '緑', count: 1 }] },
      action: { type: 'TRANSFER_TO_DECK', source: { type: 'TRASH_CARD', owner: 'self', count: 'ALL', filter: { color: '緑' } }, shuffle: true },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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
  'WX01-032': [
    {
      effectId: 'WX01-032-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '青', count: 2 }, { color: '無', count: 1 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 2 } },
        { type: 'CONDITIONAL', condition: { type: 'HAND_COUNT', owner: 'opponent', operator: 'eq', value: 0 },
          then: { type: 'DRAW', owner: 'self', count: 1 } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

  // WX01-034 修復（スペル）
  // 「あなたのデッキの一番上のカードをライフクロスに加える。その後、あなたのエナゾーンにカードが10枚以上ある場合、追加であなたのデッキの一番上のカードをライフクロスに加える。」
  // 旧JSONは2回目のADD_TO_LIFEが無条件（エナ10枚以上条件が欠落）だった。→ 2枚目を CONDITIONAL{ENERGY_COUNT self gte 10} でゲート。
  'WX01-034': [
    {
      effectId: 'WX01-034-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 3 }] },
      action: { type: 'SEQUENCE', steps: [
        { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true },
        { type: 'CONDITIONAL', condition: { type: 'ENERGY_COUNT', owner: 'self', operator: 'gte', value: 10 },
          then: { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true } },
      ] },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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
    {
      // E3【起】《赤》《赤》：ターン終了時まで、このシグニは【ダブルクラッシュ】を得る。
      // 旧JSONは target owner:self count:1（任意自シグニに見える・フィルタ無し）＋keyword duration:PERMANENT。
      // → 「このシグニ」を thisCardOnly で明示、keyword duration を UNTIL_END_OF_TURN に。
      effectId: 'WX01-029-E3',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '赤', count: 1 }, { color: '赤', count: 1 }] },
      action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, keyword: 'ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
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
  'WX01-002': [
    {
      effectId: 'WX01-002-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'AND', conditions: [
        { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: '白' } },
        { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardType: 'シグニ', color: '赤' } },
      ] },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } }, delta: 3000 },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
  ],

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
  'WX01-025': [
    {
      effectId: 'WX01-025-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 1 }] },
      action: {
        type: 'TRANSFER_TO_HAND',
        source: {
          type: 'TRASH_CARD',
          owner: 'self',
          count: 1,
          upToCount: false,
          filter: { cardType: 'シグニ', colorMatchesLrig: true },
        },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
    },
  ],

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
      effectId: 'WXDi-P06-007-E2',
      effectType: 'AUTO',
      timing: ['ON_PLAY'],
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'DRAW', owner: 'self', count: 1 },
          { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
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
  // 「対戦相手のアタックフェイズの間」は近似で省略（自ライフクラッシュはほぼ相手アタック中に発生）。
  // E2（【起】このキーをルリグトラッシュ：対戦相手が自分のシグニ/エナを対象…）は対戦相手選択の複雑効果のためパーサー生成のまま維持。
  'WDK17-009': [
    {
      effectId: 'WDK17-009-E1',
      effectType: 'AUTO',
      timing: ['ON_LIFE_CRASHED'],
      triggerScope: 'self',
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

  // WX05-020 幻水　シャチ（AUTO E2）
  // 【自】《ターン１回》：あなたの＜鉱石＞か＜宝石＞のシグニ１体が対戦相手のアーツの効果を受けたとき、
  //   対戦相手にダメージを与える。（近似: 相手がアーツを使用したとき、フィールドに該当シグニがいれば発動）
  'WX05-020': [
    {
      effectId: 'WX05-020-E2',
      effectType: 'AUTO',
      timing: ['ON_OPP_ARTS_USE'],
      triggerScope: 'self',
      activeCondition: {
        type: 'HAS_CARD_IN_FIELD',
        owner: 'self',
        filter: { cardType: 'シグニ', story: ['鉱石', '宝石'] },
      },
      action: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
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

  // WX06-022 大槍　トライデ
  // 【常】センタールリグが白かつ中央ゾーン在籍かぎり、基本パワーは10000になり、
  //   「対戦相手の効果によってバニッシュされない」を得る。（条件はPARTIAL）
  'WX06-022': [
    {
      effectId: 'WX06-022-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'POWER_SET', target: { type: 'SIGNI', owner: 'self', count: 1 }, value: 10000 },
          {
            type: 'GRANT_PROTECTION',
            target: { type: 'SIGNI', owner: 'self', count: 1 },
            from: ['シグニ', 'アーツ', 'スペル', 'ルリグ'],
            sourceOwner: 'opponent',
            duration: 'PERMANENT',
          },
        ],
      } as SequenceAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
    },
  ],

  // WX08-035 弩砲　トーピード（E1のみ）
  // 【常】あなたの場にある《クロスアイコン》を持つシグニ1体につき＋2000される。
  //   （アイコンフィルタ未対応のためPARTIAL：全シグニ1体ごと+2000で近似）
  'WX08-035': [
    {
      effectId: 'WX08-035-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: 2000,
        countFilter: { cardType: 'シグニ' },
        countOwner: 'self',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX09-CB02 終末の回旋　チェロン（E1のみ）
  // 【常】あなたの《クロスアイコン》を持つ＜美巧＞のシグニは対戦相手の効果によってバニッシュされない。
  //   （アイコンフィルタ未対応のためPARTIAL：美巧全体に保護で近似）
  'WX09-CB02': [
    {
      effectId: 'WX09-CB02-E1',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_PROTECTION',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { story: '美巧' } },
        from: ['シグニ', 'アーツ', 'スペル', 'ルリグ'],
        sourceOwner: 'opponent',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-018 暴風警報（スペル）
  // このターン、対戦相手のシグニかセンタールリグがアタックしたとき、
  //   1度目か2度目の場合、そのアタックを無効にする。（PARTIAL：全アタック防止で近似）
  'WX10-018': [
    {
      effectId: 'WX10-018-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '緑', count: 2 }] },
      action: { type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN' },
      duration: 'UNTIL_END_OF_TURN',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX10-053 集結する守護（スペル）
  // コストはサーバントシグニ1体につき《無×2》減る（PARTIAL近似）。
  // ①トラッシュからサーバントシグニを2枚まで手札に。②サーバント全シグニ+5000+ランサー。
  'WX10-053': [
    {
      effectId: 'WX10-053-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 7 }] },
      action: {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'COST_REDUCTION',
            targetCardType: 'スペル',
            reduction: [{ color: '無', count: 2 }],
            duration: 'PERMANENT',
          },
          {
            type: 'CHOOSE',
            choose_count: 1,
            from_count: 2,
            choices: [
              {
                choiceId: 'c0',
                label: '①サーバントを手札へ',
                action: {
                  type: 'TRANSFER_TO_HAND',
                  source: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true },
                },
              },
              {
                choiceId: 'c1',
                label: '②全サーバント+5000+ランサー',
                action: {
                  type: 'SEQUENCE',
                  steps: [
                    { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, delta: 5000 },
                    { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 'ALL' }, keyword: 'ランサー', duration: 'UNTIL_END_OF_TURN' },
                  ],
                } as SequenceAction,
              },
            ],
          } as ChooseAction,
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX11-024 リフレッシュ・エンド（スペル）
  // このターン、対戦相手が次にリフレッシュした場合、その後でこのターンを終了する。
  //   （PARTIAL：リフレッシュ条件を省略しFORCE_END_TURNで近似）
  'WX11-024': [
    {
      effectId: 'WX11-024-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN'],
      cost: { energy: [{ color: '無', count: 1 }] },
      action: { type: 'FORCE_END_TURN' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX05-016 ジャッジメント・クロス（アーツ）
  // 全5色コストで使用 → このターンを強制終了する
  'WX05-016': [
    {
      effectId: 'WX05-016-E1',
      effectType: 'ACTIVATED',
      timing: ['SPELL_CUTIN'],
      cost: {
        energy: [
          { color: '白', count: 1 },
          { color: '赤', count: 1 },
          { color: '青', count: 1 },
          { color: '緑', count: 1 },
          { color: '黒', count: 1 },
        ],
      },
      action: { type: 'FORCE_END_TURN' },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WX01-057-BURST',
      effectType: 'LIFE_BURST',
      timing: ['ON_LIFE_BURST'],
      action: { type: 'DRAW', owner: 'self', count: 1 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXK04-060 羅植 ガウラ: ON_BANISH は「対戦相手のターンの間」のみ
  // パーサーが activeCondition を解析できないため手動で設定
  'WXK04-060': [
    {
      effectId: 'WXK04-060-E1',
      effectType: 'AUTO',
      timing: ['ON_BANISH'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
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
          } as import('../types/effects').LookAndReorderAction,
          { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as import('../types/effects').StubAction,
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXK09-TK-01A 改造素材（アーツ/クラフト）
  // このターン改造素材使用不可 + 電機シグニ対象に①+4000 ②起動能力付与 ③自動能力付与 から1つ選択
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
          { type: 'STUB', id: 'DO_THREE_THINGS' },
        ],
      } as SequenceAction,
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WXDi-P11-TK01 白羅星姫　サタン（レゾナクラフト）
  // 【常】あなたのターンの間、対戦相手はシグニを２体までしか場に出すことができない
  'WXDi-P11-TK01': [
    {
      effectId: 'WXDi-P11-TK01-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'TURN_OWNER', owner: 'self' },
      action: { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
    },
  ],

  // WX25-P2-TK05 蒼穹将姫　ニヴルヘイム（シグニ/レゾナクラフト）
  // 【常】：対戦相手はドローフェイズの間にカードを合計１枚までしか引けない。
  // 【自】：このシグニが場を離れたとき、カードを２枚引くか、対戦相手は手札を２枚捨てる。
  'WX25-P2-TK05': [
    {
      effectId: 'WX25-P2-TK05-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'OPP_DRAW_LIMIT_PER_TURN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
    },
  ],

  // WX08-005 エナゾーン以外の領域にあるカードは白になる（CONTINUOUS）
  'WX08-005': [
    {
      effectId: 'WX08-005-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'CARDS_OUTSIDE_ENERGY_BECOME_WHITE' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WX08-006 対戦相手は【チャーム】が付いているシグニの【起】能力を使用できない（CONTINUOUS）
  'WX08-006': [
    {
      effectId: 'WX08-006-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'RESTRICT_CHARMED_SIGNI_ACTIVATED' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
      crossOnly: true,
    },
  ],

  // WX10-006 このシグニがアタックしたとき、あなたのエナゾーンからカード１枚を手札に加えてもよい（AUTO / ON_ATTACK_SIGNI）
  'WX10-006': [
    {
      effectId: 'WX10-006-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      action: {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true },
      },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'AUTO',
    },
  ],

  // WX14-017 あなたのエナゾーンにある無色ではないカードはすべての色を持つ（CONTINUOUS）
  'WX14-017': [
    {
      effectId: 'WX14-017-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'ENERGY_NON_COLORLESS_ALL_COLORS' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ],

  // WXEX1-26 対戦相手のセンタールリグの基本リミットは５になる（CONTINUOUS）
  'WXEX1-26': [
    {
      effectId: 'WXEX1-26-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'OPP_CENTER_LRIG_LIMIT_SET_5' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
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
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_WITH_DOWN' } as import('../types/effects').StubAction,
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
    {
      effectId: 'WXDi-CP02-TK01A-E3',
      effectType: 'AUTO',
      timing: ['ON_TURN_END'],
      activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
      action: { type: 'STUB', id: 'REMOVE_SELF_SIGNI_FROM_GAME' } as import('../types/effects').StubAction,
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
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

  // WX19-045 羅菌　ポレン（起動）
  // 【起】《アタックフェイズ》手札からこのカードを捨てる：
  //   相手の場のウィルス合計が2つになるように相手のシグニゾーンにウィルスを置く。＜ナナシ＞限定。
  // PLACE_VIRUS の fillToTotal:2 で「合計が2個になるよう不足分を配置先選択して置く」。
  // 旧 STUB PLACE_VIRUS_TO_2（空きゾーン自動配置）から、配置先をプレイヤーが選べる正式アクションへ。
  'WX19-045': [
    {
      effectId: 'WX19-045-E1',
      effectType: 'ACTIVATED',
      timing: ['ATTACK_ARTS'],
      condition: { type: 'LRIG_STORY', owner: 'self', story: 'ナナシ' },
      cost: { discardSelfFromHand: true },
      action: { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: 2, virusCount: 1, fillToTotal: 2 },
      duration: 'INSTANT',
      mandatory: false,
      parseStatus: 'MANUAL',
      handActivated: true,
    },
  ],

  // WX22-016 グレイブ・ディガー（ベット―好きな枚数）
  // ベットのコイン1枚につき2択（①コスト減 ②効果1回繰り返し）。パーサーは多択ベットを
  // BET_MECHANIC stub 化するため、CHOOSE 構造を保持するマニュアル上書き。
  'WX22-016': [
    {
      effectId: 'WX22-016-E1',
      effectType: 'ACTIVATED',
      timing: ['MAIN', 'ATTACK'],
      cost: { energy: [{ color: '黒', count: 6 }] },
      action: {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          {
            choiceId: 'c0',
            label: '選択肢1',
            action: { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' },
          },
          {
            choiceId: 'c1',
            label: '選択肢2',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'STUB', id: 'REPEAT_EFFECT' },
                {
                  type: 'TRANSFER_TO_HAND',
                  source: {
                    type: 'TRASH_CARD',
                    owner: 'self',
                    count: 1,
                    upToCount: false,
                    filter: { cardType: 'シグニ' },
                  },
                },
              ],
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
  // E2【常】：あなたの中央のシグニゾーンにあるシグニのパワーを＋3000する。
  //   → CONTINUOUS POWER_MODIFY self ALL に centerZoneOnly フィルタ（中央ゾーン=index1）。旧＝POWER_MODIFY any count1（対象誤り）。
  'WXDi-P06-034': [
    {
      effectId: 'WXDi-P06-034-E1',
      effectType: 'CONTINUOUS',
      action: { type: 'STUB', id: 'BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY' },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXDi-P06-034-E2',
      effectType: 'CONTINUOUS',
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', centerZoneOnly: true } }, delta: 3000 },
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
        then: { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 3, private: true, reorder: true, canTrash: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } },
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
      action: { type: 'BANISH_REDIRECT', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, redirectTo: 'trash', until: 'END_OF_TURN' },
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
  //   → 近似：CONTINUOUS REMOVE_ABILITIES opponent（対面）に activeCondition SAME_ZONE_HAS_GATE を付与（旧＝無条件のフリーロックbug。相手の《無》支払い回避とAPS再付与は近似省略）。
  // E2【常】：同じシグニゾーンに【ゲート】があるあなたのシグニのパワーを＋2000する。
  //   → CONTINUOUS POWER_MODIFY self ALL に inGateZone フィルタ（own_gate_zones のゾーンのシグニのみ）。
  'WXDi-P16-062': [
    {
      effectId: 'WXDi-P16-062-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'SAME_ZONE_HAS_GATE' },
      action: { type: 'REMOVE_ABILITIES', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, until: 'UNTIL_END_OF_TURN' },
      duration: 'PERMANENT',
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

  // WXDi-P15-064 幻蟲　アロス・ピルルク//THE DOOR
  // 【常】このカードの上にある＜解放派＞のシグニは「【自】あなたのアタックフェイズ開始時、手札を１枚捨ててもよい。
  //   そうした場合、対戦相手の手札を１枚見ないで選び、捨てさせる。」を得る。
  // 旧 E2 パース＝CONTINUOUS TRASH HAND opponent blind（no-op）。上シグニ付与＝GRANT_SIGNI_ABOVE_ABILITY。
  // 付与能力は ON_ATTACK_PHASE_START の「手札1枚捨て→相手手札を見ないで1枚捨てさせる(blind)」。
  // 「捨ててもよい」の任意性は SEQUENCE＋CONDITIONAL(IS_MY_TURN) で近似（同カード E1 の生成パターンに合わせる）。
  'WXDi-P15-064': [
    {
      effectId: 'WXDi-P15-064-E2',
      effectType: 'CONTINUOUS',
      action: {
        type: 'GRANT_SIGNI_ABOVE_ABILITY',
        filter: { cardType: 'シグニ', story: '解放派' },
        abilities: [
          {
            effectId: 'WXDi-P15-064-E2-G',
            effectType: 'AUTO',
            timing: ['ON_ATTACK_PHASE_START'],
            triggerScope: 'self',
            action: {
              type: 'SEQUENCE',
              steps: [
                { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } },
                { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } } },
              ],
            } as SequenceAction,
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
  // 【常】【ランサー】（静的キーワードはテキストから自動判定）
  // 【自】：あなたのアタックフェイズ開始時、《無》《無》《無》を支払わないかぎり、このシグニを場からトラッシュに置く。
  // 旧パース＝CONTINUOUS TRASH SIGNI self（no-op）。任意《無×3》コストを払えば維持、払わなければ自己トラッシュ。
  // OPTIONAL_COST（支払う/スキップ）→ CONDITIONAL{PAID_ADDITIONAL_COST, then:noop, else: このシグニを自己トラッシュ}。
  // 自己トラッシュは TRASH SIGNI self＋filter.thisCardOnly（execTrash に thisCardOnly 対応を追加）。
  'WXDi-P04-040': [
    {
      effectId: 'WXDi-P04-040-E1',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_PHASE_START'],
      triggerScope: 'self',
      action: {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無', '無', '無'] },
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
