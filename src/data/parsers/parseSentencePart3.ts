import type {
  EffectAction,
  Owner,
  SequenceAction,
  ChooseAction,
  RearrangeSigniAction,
  BlockActionAction,
  EnergyChargeAction,
  FreezeAction,
  DrawPerFieldCountAction,
  NegateAttackAction,
  PlaceUnderSigniAction,
  TakeFromUnderSigniAction,
  StubAction,
  PowerModifyAction,
  BanishAction,
  BounceAction,
  DownAction,
  RecollectGateAction,
  AddToHandAction,
  CardLocation,
  AltCostOppTurnAction,
} from '../../types/effects';
import {
  parseNum, parseSignedNum, parseCardTypeFilter, parseStoryFilter, makeRevealPickStub, parseEnergyCosts, extractCostColors,
} from '../parserUtils';
import { parseSentencePart1 } from './parseSentencePart1';
import { parseSentencePart2 } from './parseSentencePart2';

export function parseSentencePart3(t: string): EffectAction | null {
  // ---- エナゾーンからN枚このシグニの下に置く ----
  {
    const m = t.match(/あなたのエナゾーンから((?:《ガードアイコン》を持たない)?(?:カード|シグニ))を?([０-９\d]+)枚?(まで)?(?:を対象とし、それ(?:ら)?を)?このシグニの下に置く/);
    if (m) {
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'energy',
        count: parseNum(m[2]),
        upToCount: !!m[3],
        filter: { cardType: 'シグニ' },
      } as PlaceUnderSigniAction;
    }
  }

  // ---- 手札からN枚このシグニの下に置く ----
  {
    const m = t.match(/あなたの手札から((?:レベル[０-９\d０-９]+の)?(?:シグニ|カード))を?([０-９\d]+)枚?(まで)?(?:を対象とし、それ(?:ら)?を)?このシグニの下に置く/);
    if (m) {
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'hand',
        count: parseNum(m[2]),
        upToCount: !!m[3],
        filter: { cardType: 'シグニ' },
      } as PlaceUnderSigniAction;
    }
    // 「あなたは手札をN枚まで」形式
    const m2 = t.match(/あなたは手札を([０-９\d]+)枚?(まで)?このシグニの下に置く/);
    if (m2) {
      return { type: 'PLACE_UNDER_SIGNI', source: 'hand', count: parseNum(m2[1]), upToCount: !!m2[2], filter: { cardType: 'シグニ' } } as PlaceUnderSigniAction;
    }
  }

  // ---- このシグニの下から移動（STUB前に配置） ----
  {
    // CHOOSE: 手札に加えるかエナゾーンに置く
    const mc = t.match(/このシグニの下から(?:《[^》]+》の)?カードを?([０-９\d]*)枚?(まで)?を?手札に加えるかエナゾーンに置く/);
    if (mc) {
      const cnt = mc[1] ? parseNum(mc[1]) : 1;
      return {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'hand',   label: '手札に加える',   action: { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'hand',   count: cnt, upToCount: !!mc[2], fromThis: true } as TakeFromUnderSigniAction },
          { choiceId: 'energy', label: 'エナゾーンに置く', action: { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'energy', count: cnt, upToCount: !!mc[2], fromThis: true } as TakeFromUnderSigniAction },
        ],
      } as ChooseAction;
    }
    // 単一移動先（エナ含む）
    const m = t.match(/このシグニの下から(?:《[^》]+》の)?カードを?([０-９\d]*)枚?(まで)?(?:を?対象とし、それ(?:ら)?を)?を?(手札に加える|エナゾーンに置く|トラッシュに置く)/);
    if (m) {
      const dest: 'hand' | 'energy' | 'trash' = m[3].includes('手札') ? 'hand' : m[3].includes('エナ') ? 'energy' : 'trash';
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: dest, count: cnt, upToCount: !!m[2], fromThis: true } as TakeFromUnderSigniAction;
    }
  }

  // ---- シグニの下にカードを置く（手札・エナ・デッキから、汎用） ----
  if (t.match(/(?:このシグニ|シグニ１体)の下に置く/)) {
    return { type: 'STUB', id: 'PLACE_CARD_UNDER_SIGNI' } as StubAction;
  }

  // ---- クラフト ----
  if (t.includes('クラフトから') && t.includes('ルリグデッキに加える')) {
    return { type: 'STUB', id: 'CRAFT_TO_LRIG_DECK' } as StubAction;
  }

  // ---- アーツ移動不可 ----
  if (t.match(/アーツ.*ルリグデッキから他の領域に移動しない/)) {
    return { type: 'STUB', id: 'ARTS_IMMOVABLE' } as StubAction;
  }

  // ---- 各ターンに一度しかアタックできない ----
  if (t.match(/各ターンに一度しかアタックできない/)) {
    return { type: 'STUB', id: 'ONE_ATTACK_PER_TURN' } as StubAction;
  }

  // ---- 対戦相手がシグニを選びエナゾーンに置く ----
  if (t.match(/対戦相手は自分の.+シグニ.+選び.+エナゾーン/)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- コラボ・コラボライバー ----
  if (t.includes('コラボライバー') || t.includes('コラボしてもよい')) {
    return { type: 'STUB', id: 'COLLAB' } as StubAction;
  }

  // ---- デッキ一番上を見て一番下に置いてもよい ----
  if (t.match(/デッキの一番上を見て.*一番下に置いてもよい/)) {
    return { type: 'STUB', id: 'TOP_TO_BOTTOM_OPTIONAL' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、このターン、次にアタックしたとき無効 ----
  {
    const m = t.match(/対戦相手の(?:シグニ(?:やルリグ)?|ルリグとシグニ)(?:を([１-９\d０-９]+)体)?(?:まで)?を?対象とし.*次に.*アタックしたとき.*そのアタックを無効にする/);
    if (m || t.includes('アタックしたとき、そのアタックを無効にする')) {
      const cnt = m?.[1] ? parseNum(m[1]) : 1;
      return {
        type: 'NEGATE_ATTACK',
        target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
      } as NegateAttackAction;
    }
  }
  // ---- アタックを無効にする（一度・汎用） ----
  if (t.includes('アタックを無効') && !t.includes('無効にし')) {
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as NegateAttackAction;
  }

  // ---- 場所（ゾーン）を入れ替える → REARRANGE_SIGNI (swap) ----
  if (t.includes('場所を入れ替える') || t.includes('場所を入れ替えてもよい')) {
    return { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner: 'any', count: 1 }, swap: true } as RearrangeSigniAction;
  }

  // ---- すべての領域で色を失う ----
  if (t.match(/すべての領域で色を失う/)) {
    return { type: 'STUB', id: 'LOSE_COLOR_ALL_ZONES' } as StubAction;
  }

  // ---- ルリグ名コピー（ルリグトラッシュのルリグと同じカード名） ----
  if (t.match(/ルリグトラッシュにある.+と同じカード名/)) {
    return { type: 'STUB', id: 'COPY_LRIG_NAME_ABILITY' } as StubAction;
  }

  // ---- 〈クラス〉のシグニN体につきカードをM枚引く ----
  {
    const m = t.match(/(あなた|対戦相手)?の?場にある(＜[^＞]+＞の)?シグニ([０-９\d]+)体につきカードを([０-９\d]+)枚引く/);
    if (m) {
      const countOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const storyFilter = m[2] ? parseStoryFilter(m[2]) : {};
      return {
        type: 'DRAW_PER_FIELD_COUNT',
        drawPerUnit: parseNum(m[4]),
        countFilter: { cardType: 'シグニ', ...storyFilter },
        countOwner,
      } as DrawPerFieldCountAction;
    }
  }

  // ---- 対戦相手のシグニ/ルリグのパワーをX×N修正（動的倍率） ----
  if (t.match(/シグニ１体につき[－＋][０-９\d]+する/) || t.match(/につき[－＋][０-９\d]+される/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- 各プレイヤーがドローして捨てる ----
  if (t.match(/各プレイヤーは.*カードを.*引き.*手札を.*捨てる/)) {
    return { type: 'STUB', id: 'EACH_PLAYER_DRAW_DISCARD' } as StubAction;
  }

  // ---- このシグニをデッキの一番上に置く ----
  if (t.match(/このシグニをデッキの一番上に置く/)) {
    return { type: 'STUB', id: 'SELF_TO_DECK_TOP' } as StubAction;
  }

  // ---- パワーが対戦相手の効果でマイナスされる場合プラスになる ----
  if (t.match(/対戦相手の効果によって－.*される場合.*代わりに＋/)) {
    return { type: 'STUB', id: 'REVERSE_OPP_POWER_MINUS' } as StubAction;
  }

  // ---- 対戦相手がデッキ一番上と手札を公開する ----
  if (t.match(/対戦相手はデッキの一番上と手札を公開する/)) {
    return { type: 'STUB', id: 'OPP_REVEAL_TOP_AND_HAND' } as StubAction;
  }

  // ---- 対戦相手のターンは使用コスト増加 ----
  if (t.match(/対戦相手のターンの場合.*エナコストを支払えない/)) {
    return { type: 'STUB', id: 'OPP_TURN_NO_ENERGY_COST' } as StubAction;
  }

  // ---- 対戦相手はルリグでアタックできない ----
  if (t.match(/対戦相手は.*(?:《無》|コスト).*支払わないかぎりルリグでアタックできない/)) {
    return { type: 'STUB', id: 'OPP_LRIG_ATTACK_COST' } as StubAction;
  }

  // ---- このターン、プレイヤーはそれ（対象ルリグ）でアタックできない ----
  if (t.match(/このターン.*プレイヤーはそれでアタックできない/)) {
    return { type: 'STUB', id: 'PREVENT_TARGET_LRIG_ATTACK_THIS_TURN' } as StubAction;
  }

  // ---- アーツの《無》コストはセンタールリグの色でしか支払えない ----
  if (t.match(/このアーツの使用コストに含まれる《無》コストは.*センタールリグが持つ色でしか支払えない/)) {
    return { type: 'STUB', id: 'ARTS_COLORLESS_MUST_PAY_CENTER_COLOR' } as StubAction;
  }

  // ---- グリッド固有デッキ公開+1 ----
  if (t.match(/デッキ上公開枚数\+[０-９\d]+/)) {
    return { type: 'STUB', id: 'GRID_REVEAL_PLUS' } as StubAction;
  }

  // ---- ガード代替コスト ----
  if (t.match(/【ガード】する際.*代わりに/)) {
    return { type: 'STUB', id: 'GUARD_ALTERNATIVE_COST' } as StubAction;
  }

  // ---- 特定カードの使用コスト減少 ----
  if (t.match(/《.+》の使用コストは《無×[０-９\d]+》減る/)) {
    return { type: 'STUB', id: 'SPECIFIC_CARD_COST_REDUCE' } as StubAction;
  }

  // ---- シグニが場を離れる場合デッキ一番下 ----
  if (t.match(/場を離れる場合.*代わりに.*デッキの一番下に置いてもよい/)) {
    return { type: 'STUB', id: 'LEAVE_FIELD_TO_DECK_BOTTOM' } as StubAction;
  }

  // ---- デッキシャッフルしてシグニの下に置く ----
  if (t.match(/デッキをシャッフルし.*シグニの下に置く/)) {
    return { type: 'STUB', id: 'SHUFFLE_DECK_UNDER_SIGNI' } as StubAction;
  }

  // ---- ライフバーストが二度発動する ----
  if (t.match(/ライフバーストは二度発動する/)) {
    return { type: 'STUB', id: 'LIFE_BURST_DOUBLE' } as StubAction;
  }

  // ---- 対戦相手のシグニがバニッシュされる場合手札に戻る ----
  if (t.match(/バニッシュされる場合.*手札に戻される/)) {
    return { type: 'STUB', id: 'BANISH_REDIRECT_TO_HAND' } as StubAction;
  }

  // ---- 対戦相手のシグニが場を離れる場合トラッシュに置かれる ----
  if (t.match(/対戦相手のシグニが場を離れる場合.*トラッシュに置かれる/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_LEAVE_TO_TRASH' } as StubAction;
  }

  // ---- 【常】能力の効果でパワーはプラスされない ----
  if (t.match(/【常】能力の効果.*パワーは.*プラス.*されない/)) {
    return { type: 'STUB', id: 'BLOCK_CONTINUOUS_POWER_PLUS' } as StubAction;
  }

  // ---- 対戦相手はシグニゾーンにレベルN以上を配置できない ----
  if (t.match(/対戦相手は中央のシグニゾーンにレベル.*以上のシグニを.*配置できない/)) {
    return { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT' } as StubAction;
  }

  // ---- このターン対戦相手はシグニで合計一度しかアタックできない ----
  if (t.match(/対戦相手はシグニで合計一度しかアタックできない/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_ONE_ATTACK_TOTAL' } as StubAction;
  }

  // ---- アップ状態のシグニをダウンして選択 ----
  if (t.match(/アップ状態の.*シグニ.*ダウン/)) {
    return { type: 'STUB', id: 'DOWN_UP_SIGNI_AND_CHOOSE' } as StubAction;
  }

  // ---- デッキ一番下を見る ----
  if (t.match(/デッキの一番下のカードを見る/)) {
    return { type: 'STUB', id: 'LOOK_DECK_BOTTOM' } as StubAction;
  }

  // ---- ターン中と次のターンの間、対戦相手シグニの【自】能力発動しない ----
  if (t.match(/このターンと次のターンの間.*シグニの【自】能力は発動しない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_AUTO_ABILITY_EXTENDED' } as StubAction;
  }

  // ---- 対戦相手のメインフェイズ間リミット減少 ----
  if (t.match(/対戦相手のメインフェイズの間.*リミット/)) {
    return { type: 'STUB', id: 'OPP_MAIN_PHASE_LIMIT_DOWN' } as StubAction;
  }

  // ---- 白のシグニは効果で能力を失わない ----
  if (t.match(/白のシグニは対戦相手の効果によって能力を失わない/)) {
    return { type: 'STUB', id: 'WHITE_SIGNI_ABILITY_PROTECT' } as StubAction;
  }

  // ---- シグニが対戦相手の効果でエナゾーン以外に移動しない ----
  if (t.match(/対戦相手の効果によって場からエナゾーン以外の領域に移動しない/)) {
    return { type: 'STUB', id: 'SIGNI_PROTECT_MOVE_EXCEPT_ENERGY' } as StubAction;
  }

  // ---- 対戦相手は追加で無を支払わないかぎりガードできない ----
  if (t.match(/追加で《無》を支払わないかぎり【ガード】ができない/)) {
    return { type: 'STUB', id: 'OPP_GUARD_COST_COLORLESS' } as StubAction;
  }

  // ---- 対戦相手のアーツ・スペル・起使用不可（複合） ----
  if (t.match(/アーツとスペルと【起】能力を使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_ARTS_SPELL_ACT' } as StubAction;
  }

  // ---- このルリグは特定色のルリグにしかグロウできない ----
  if (t.match(/このルリグは.+のルリグにしかグロウできない/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- 場にあるこのルリグはすべてのルリグのカード名を得る ----
  if (t.match(/このルリグはすべてのルリグのカード名を得る/)) {
    return { type: 'STUB', id: 'LRIG_ALL_NAMES' } as StubAction;
  }

  // ---- エナフェイズ終了時までリミット変更 ----
  if (t.match(/エナフェイズ終了時まで.*リミット/)) {
    return { type: 'STUB', id: 'LIMIT_CHANGE_UNTIL_ENERGY_PHASE_END' } as StubAction;
  }

  // ---- このターン、あなたはダメージを受けない・敗北しない ----
  if (t.match(/このターン.*パワー\d+以下のシグニによってダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_DAMAGE_BY_LOW_POWER_SIGNI' } as StubAction;
  }

  // ---- 次の対戦相手のターン、最初のダメージを受けない ----
  if (t.match(/最初にダメージを受ける場合.*代わりにダメージを受けない/)) {
    return { type: 'STUB', id: 'PREVENT_FIRST_DAMAGE_NEXT_OPP_TURN' } as StubAction;
  }

  // ---- 対戦相手のシグニゾーンを消す ----
  if (t.match(/シグニゾーン.*消す/)) {
    return { type: 'STUB', id: 'REMOVE_SIGNI_ZONE' } as StubAction;
  }

  // ---- ゲートを置く ----
  if (t.includes('【ゲート】')) {
    return { type: 'STUB', id: 'GATE' } as StubAction;
  }

  // ---- ハスターリクを置く ----
  if (t.includes('【ハスターリク】')) {
    return { type: 'STUB', id: 'HASTARLIQ' } as StubAction;
  }

  // ---- 色を指定する ----
  if (t.match(/^色[１-９\d]*つを指定する/)) {
    return { type: 'STUB', id: 'DECLARE_COLOR' } as StubAction;
  }

  // ---- シグニの色を変更する ----
  if (t.match(/シグニ.*を(?:白|黒|赤|青|緑|無)にする/)) {
    return { type: 'STUB', id: 'CHANGE_SIGNI_COLOR' } as StubAction;
  }

  // ---- 対戦相手の色を失う ----
  if (t.match(/シグニ.*色を失う/)) {
    return { type: 'STUB', id: 'SIGNI_LOSE_COLOR' } as StubAction;
  }

  // ---- このシグニの基本パワーをターゲットのパワーと同じにする ----
  if (t.match(/基本パワーは.*パワーと同じ値になる/)) {
    return { type: 'STUB', id: 'COPY_TARGET_POWER' } as StubAction;
  }

  // ---- 対戦相手のシグニに次にアタックしたとき（シングル/マルチ） ----
  {
    const m = t.match(/対戦相手の(?:シグニ|ルリグ|シグニかルリグ|ルリグとシグニ)(?:を([１-９\d０-９]+)体)?(?:まで)?を?対象とし.*次に.*アタックしたとき.*アタックを無効/);
    if (m) {
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return {
        type: 'NEGATE_ATTACK',
        target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
      } as NegateAttackAction;
    }
  }

  // ---- 対戦相手のセンタールリグのアタック無効 ----
  if (t.match(/センタールリグ.*アタックしたとき.*無効/)) {
    return { type: 'STUB', id: 'NEGATE_CENTER_LRIG_ATTACK' } as StubAction;
  }

  // ---- 正面シグニのアタック禁止 ----
  if (t.match(/このシグニの正面にあるシグニでアタックできない/)) {
    return { type: 'STUB', id: 'BLOCK_FRONT_SIGNI_ATTACK' } as StubAction;
  }

  // ---- 対戦相手のシグニを複数エナゾーンに置く（セレクト） ----
  if (t.match(/対戦相手のシグニ.*体まで.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'MULTI_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- 毒牙/微菌系複合トリガー ----
  if (t.match(/毒牙|微菌/) && t.match(/以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'CLASS_TRIGGER_CHOOSE' } as StubAction;
  }

  // ---- 特定条件（場に特定カードがいる場合）の分岐 ----
  if (t.match(/あなたの場に《.+》がいる場合.*以下の[２-９]つから/) ||
      t.match(/あなたの場に《.+》がいる場合.*以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'FIELD_CONDITION_CHOOSE' } as StubAction;
  }

  // ---- ディソナアイコン系 ----
  if (t.match(/《ディソナアイコン》.*以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'DISONA_CHOOSE' } as StubAction;
  }

  // ---- リコレクトアイコン条件 ----
  const recollectM = t.match(/《リコレクトアイコン》［([０-９\d]+)枚以上/);
  if (recollectM) {
    return { type: 'RECOLLECT_GATE', minArts: parseNum(recollectM[1]) } as RecollectGateAction;
  }

  // ---- 対戦相手が手札を捨てないかぎり分岐 ----
  if (t.match(/対戦相手が手札を.+捨てないかぎり/)) {
    return { type: 'STUB', id: 'OPP_DISCARD_OR_CHOOSE' } as StubAction;
  }

  // ---- あなたのコインを支払ったとき分岐 ----
  if (t.match(/《コインアイコン》.*支払ったとき/)) {
    return { type: 'STUB', id: 'COIN_PAID_TRIGGER' } as StubAction;
  }

  // ---- このシグニはルリグが持つ色を得る ----
  if (t.match(/このシグニはあなたの場にいるルリグが持つ色を得る/)) {
    return { type: 'STUB', id: 'GAIN_LRIG_COLOR' } as StubAction;
  }

  // ---- 特定カードによってしか場に出せない ----
  if (t.match(/の効果によってしか新たに場に出せない/)) {
    return { type: 'STUB', id: 'DEPLOY_RESTRICT' } as StubAction;
  }

  // ---- スペル使用コスト増加（各ターン最初） ----
  if (t.match(/最初に使用するスペルの使用コストは/)) {
    return { type: 'STUB', id: 'FIRST_SPELL_COST_UP' } as StubAction;
  }

  // ---- 凍結シグニのバニッシュ先をデッキ一番下に変更 ----
  if (t.match(/凍結状態のシグニ.*バニッシュされる場合.*デッキの一番下/)) {
    return { type: 'STUB', id: 'FROZEN_SIGNI_BANISH_TO_DECK_BOTTOM' } as StubAction;
  }

  // ---- ダメージ時このシグニをトラッシュに置いてもよい（ブロッカー系） ----
  if (t.match(/ダメージを受ける場合.*代わりにこのシグニを.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'SUBSTITUTE_DAMAGE_WITH_SELF_TRASH' } as StubAction;
  }

  // ---- 複数シグニの【自】能力をブロック ----
  if (t.match(/対戦相手のターンの場合.*エナコストを支払えない/)) {
    return { type: 'STUB', id: 'OPP_TURN_NO_ENERGY_COST_ZERO' } as StubAction;
  }

  // ---- 対戦相手のシグニをエナゾーンに置く → BANISH と同等 ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]*)体(?:を対象とし、)?(?:それを)?エナゾーンに置く/);
    if (m) {
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as BanishAction;
    }
  }
  if (t.match(/対戦相手は自分の.+シグニ.+選び.+エナゾーン/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction;
  }

  // ---- サーバントZEROにする / シグニ名変更 ----
  if (t.match(/それを《サーバント.*》にする/)) {
    return { type: 'STUB', id: 'MAKE_SERVANT_ZERO' } as StubAction;
  }

  // ---- 可能ならばこのシグニを対象とする（強制ターゲット） ----
  if (t.match(/可能ならばこのシグニを対象とする/)) {
    return { type: 'STUB', id: 'FORCE_TARGET_SELF' } as StubAction;
  }

  // ---- デッキからエナゾーンに置かれたとき手札に加えてもよい ----
  if (t.match(/デッキから.*エナゾーンに置かれたとき.*手札に加えてもよい/)) {
    return { type: 'STUB', id: 'ENERGY_TO_HAND_ON_DECK' } as StubAction;
  }

  // ---- 正面にシグニがない場合アタックしたシグニの正面に配置 ----
  if (t.match(/正面にシグニがない場合.*正面に配置してもよい/)) {
    return { type: 'STUB', id: 'MOVE_TO_ATTACKER_FRONT' } as StubAction;
  }

  // ---- この方法で捨てた・置いた・減ったカード枚数分だけドロー/修正 ----
  if (t.match(/この方法で(?:捨てた|トラッシュに置かれた|ダウンした).*(?:枚数|合計|値).*(?:引く|する|＋)/)) {
    return { type: 'STUB', id: 'COUNT_BASED_DRAW_OR_POWER' } as StubAction;
  }

  // ---- 正面シグニのレベルにつきパワー修正 ----
  if (t.match(/正面のシグニのパワーをそのシグニのレベル.*につき/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_FRONT_LEVEL' } as StubAction;
  }

  // ---- 起動能力コスト増加（センタールリグ・シグニ） ----
  if (t.match(/センタールリグとシグニの【起】能力の使用コスト/)) {
    return { type: 'STUB', id: 'INCREASE_ACT_ABILITY_COST' } as StubAction;
  }

  // ---- 場とエナゾーンのシグニが追加で色を得る ----
  if (t.match(/場とエナゾーンにある.*シグニは追加で.*を得る/)) {
    return { type: 'STUB', id: 'FIELD_ENERGY_SIGNI_GAIN_COLOR' } as StubAction;
  }

  // ---- 特定クラスがいない場合手札を捨てる ----
  if (t.match(/場に他の.+のシグニがない場合.*手札を.*捨てる/)) {
    return { type: 'STUB', id: 'DISCARD_IF_NO_CLASS_SIGNI' } as StubAction;
  }

  // ---- 手札からカードを複数枚エナゾーンに置く ----
  if (t.match(/あなたの手札から(?:カードを|シグニを?)[０-９\d]+枚まで(?:エナゾーン|エナ)に置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }
  if (t.match(/あなたの手札からカードを[０-９\d]+枚まで(?:エナゾーン|エナ)に置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }

  // ---- このターン対戦相手の効果でパワーが減る場合2倍になる ----
  if (t.match(/あなたの効果によって.*パワーが－.*場合.*代わりに２倍/)) {
    return { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' } as StubAction;
  }

  // ---- ルリグトラッシュのアーツ枚数につきパワー修正 ----
  if (t.match(/ルリグトラッシュ.*アーツ.*につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_LRIG_TRASH_ARTS' } as StubAction;
  }

  // ---- 対戦相手のシグニが正面に配置されたときパワー修正 ----
  if (t.match(/このシグニの正面に配置されたとき.*パワーを/)) {
    return { type: 'STUB', id: 'POWER_MOD_ON_FRONT_PLACE' } as StubAction;
  }

  // ---- 白ではないスペルを使用できない ----
  if (t.match(/白ではないスペルを使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_NON_WHITE_SPELL' } as StubAction;
  }

  // ---- このシグニは対象のルリグの色を得る ----
  if (t.match(/このシグニは.*ルリグ.*持つ色.*得る/)) {
    return { type: 'STUB', id: 'SIGNI_GAIN_LRIG_COLOR' } as StubAction;
  }

  // ---- トラッシュから中央のシグニゾーンに出す ----
  if (t.match(/トラッシュから中央のシグニゾーンに出す/)) {
    return { type: 'STUB', id: 'FROM_TRASH_TO_CENTER_ZONE' } as StubAction;
  }

  // ---- 対戦相手のシグニ1体を対象とし、手札1枚につきパワー修正 ----
  if (t.match(/手札[１-９\d]+枚につき[－＋][０-９\d]+/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_HAND_COUNT' } as StubAction;
  }

  // ---- このターン対戦相手はパワーNのシグニでアタックできない ----
  if (t.match(/対戦相手はパワーが\d+以下のシグニでアタックできない/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_ATTACK_POWER_RESTRICT' } as StubAction;
  }

  // ---- 捨てた・置いた枚数と同じ数のシグニのパワー修正 ----
  if (t.match(/この方法で捨てた.*枚数と同じ数.*シグニ.*パワー/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_DISCARD_COUNT' } as StubAction;
  }

  // ---- このシグニをデッキ上に / このシグニの下にシグニを置く ----
  if (t.match(/(?:このシグニ|シグニ１体)をこのシグニの下に置いてもよい/) ||
      t.match(/(?:レベル[０-９\d]+以上|レベル[０-９\d]+の)シグニ.*このシグニの下に置く/)) {
    return { type: 'STUB', id: 'PLACE_SIGNI_UNDER_SELF' } as StubAction;
  }

  // ---- エナゾーンからカード1枚を選びトラッシュに置く ----
  if (t.match(/エナゾーンからカード[０-９\d]*枚(?:を選び)?トラッシュに置く/)) {
    return { type: 'STUB', id: 'ENERGY_TO_TRASH' } as StubAction;
  }

  // ---- 対戦相手は以下のN個から1個を選び、あなたが行う ----
  if (t.match(/対戦相手は以下の[２-９]つから[１-９]つを選び.*あなた/)) {
    return { type: 'STUB', id: 'OPP_CHOOSES_FOR_YOU' } as StubAction;
  }

  // ---- 対戦相手のトラッシュからデッキトップに ----
  if (t.match(/対戦相手のトラッシュから.*デッキの一番上に置いてもよい/)) {
    return { type: 'STUB', id: 'OPP_TRASH_TO_DECK_TOP' } as StubAction;
  }

  // ---- シグニの下のカードをエナゾーンに置く ----
  if (t.match(/シグニの下にあるカード.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- デッキ上複数枚見て一部を手札・残りをデッキ下 ----
  if (t.match(/その中からカード(?:[０-９\d]+枚)?を?.*手札に加え.*残り.*デッキの一番下に置く/)) {
    return makeRevealPickStub(t);
  }

  // ---- 対戦相手のスペル・起を使用できない（次のターン間） ----
  if (t.match(/次の対戦相手のターンの間.*スペルと【起】能力を使用できない/)) {
    return { type: 'STUB', id: 'BLOCK_OPP_SPELL_ACT_NEXT_TURN' } as StubAction;
  }

  // ---- 対戦相手のルリグデッキからカードを公開する ----
  if (t.match(/対戦相手は自分のルリグデッキからカード.*公開する/)) {
    return { type: 'STUB', id: 'OPP_REVEAL_LRIG_DECK' } as StubAction;
  }

  // ---- このシグニのパワー以下の対戦相手シグニ１体とともにエナゾーンに置く ----
  if (t.match(/このシグニのパワー以下.*シグニ.*このシグニをエナゾーンに置いてもよい/)) {
    return { type: 'STUB', id: 'TRADE_SELF_AND_OPP_TO_ENERGY' } as StubAction;
  }

  // ---- 以下の3つを行う ----
  if (t.match(/^以下の[３-９]つを行う$/)) {
    return { type: 'STUB', id: 'DO_THREE_THINGS' } as StubAction;
  }

  // ---- 捨てたカード枚数に1加えた枚数ドロー ----
  if (t.match(/捨てた(?:カードの)?枚数に[０-９\d]+を加えた枚数.*カードを引く/)) {
    return { type: 'STUB', id: 'DRAW_DISCARD_COUNT_PLUS_N' } as StubAction;
  }

  // ---- このターンゲームに敗北しない ----
  if (t.match(/このターン.*ゲームに敗北しない/)) {
    return { type: 'STUB', id: 'PREVENT_DEFEAT_THIS_TURN' } as StubAction;
  }

  // ---- ダウンしたシグニのパワーと同じだけこのシグニのパワーをプラス ----
  if (t.match(/ダウンしたシグニのパワーと同じだけ/)) {
    return { type: 'STUB', id: 'POWER_COPY_FROM_DOWNED' } as StubAction;
  }

  // ---- その中からカード1枚をデッキ上に戻し残りをデッキ下に ----
  if (t.match(/その中からカード.*デッキの一番上に戻し.*残り.*デッキの一番下に置く/)) {
    return { type: 'STUB', id: 'LOOK_TOP_ONE_RETURN_REST_BOTTOM' } as StubAction;
  }

  // ---- ガードアイコンを持たないカードを捨てたときトラッシュからエナへ ----
  if (t.match(/《ガードアイコン》を持たないカードを[０-９\d]*枚捨てたとき.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'NON_GUARD_DISCARD_TO_ENERGY' } as StubAction;
  }

  // ---- トラッシュに置かれたカードの中からカードを手札・エナ ----
  if (t.match(/トラッシュに置かれたカードの中から.*手札に加えるかエナゾーンに置く/)) {
    return { type: 'STUB', id: 'TRASHED_CARD_TO_HAND_OR_ENERGY' } as StubAction;
  }

  // ---- 特定クラスのシグニをエナゾーンから複数枚手札に加える/エナに置く ----
  if (t.match(/あなたのトラッシュから.+のカードを.*手札に加え.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'TRASH_CLASS_TO_HAND_OR_ENERGY' } as StubAction;
  }

  // ---- トラッシュからコスト合計N以下のスペルを使用 ----
  if (t.match(/トラッシュからコストの合計が[０-９\d]+以下.*スペル.*コストを支払わずに使用する/)) {
    return { type: 'STUB', id: 'TRASH_SPELL_FREE_USE_LIMIT' } as StubAction;
  }

  // ---- 手札から特定クラスのシグニをエナゾーンに置く ----
  if (t.match(/あなたの手札から[＜＜][^＞]+[＞＞]のシグニを.*エナゾーンに置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }

  // ---- ダウンしたルリグのレベル合計につきパワー修正 ----
  if (t.match(/ダウンしたルリグのレベルの合計[0-9１-９]+につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_DOWNED_LRIG_LEVEL' } as StubAction;
  }

  // ---- 他のシグニ1体を選ぶ（選択のみ） ----
  if (t.match(/^あなたの他のシグニ[０-９\d]*体を選ぶ$/)) {
    return { type: 'STUB', id: 'SELECT_OTHER_SIGNI' } as StubAction;
  }

  // ---- シグニの下にあるシグニをエナゾーンに置く（条件付き） ----
  if (t.match(/このシグニの下にある.*シグニ.*エナゾーンにそれと共通するクラスを持つシグニがない場合/)) {
    return { type: 'STUB', id: 'UNDER_SIGNI_TO_ENERGY_IF_NO_CLASS' } as StubAction;
  }

  // ---- ルリグのレベル合計につきパワープラス ----
  if (t.match(/ルリグのレベルの合計[0-9１-９]+につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_LRIG_LEVEL_SUM' } as StubAction;
  }

  // ---- 場にあるシグニが持つ色の種類につきパワー修正 ----
  if (t.match(/シグニが持つ色の種類.*につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_COLOR_VARIETY' } as StubAction;
  }

  // ---- 毒牙の他のシグニ効果によってパワーが減ったとき自身パワーアップ ----
  if (t.match(/他の.+のシグニの効果によって.*パワーが減ったとき.*パワーを.*プラス/)) {
    return { type: 'STUB', id: 'POWER_UP_ON_ALLY_POWER_DOWN' } as StubAction;
  }

  // ---- クラス指定の複数シグニのパワーを手札枚数×Nする ----
  if (t.match(/すべての.+のシグニのパワーをあなたの手札.*につき[－＋]/)) {
    return { type: 'STUB', id: 'CLASS_SIGNI_POWER_BY_HAND' } as StubAction;
  }

  // ---- 対戦相手が自分のパワーN以上のシグニを選びエナゾーンに置く ----
  if (t.match(/対戦相手は自分の.+シグニ.+エナゾーンに置く/)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_OWN_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- そのシグニとこのシグニのパワーをそれぞれ±Nする ----
  if (t.match(/そのシグニとこのシグニのパワーをそれぞれ[－＋][０-９\d]+する/)) {
    const mPlus  = t.match(/＋([０-９\d]+)/);
    const mMinus = t.match(/－([０-９\d]+)/);
    const delta = mPlus ? parseNum(mPlus[1]) : -(mMinus ? parseNum(mMinus[1]) : 0);
    return { type: 'STUB', id: 'POWER_MOD_TARGET_AND_SELF', delta } as unknown as StubAction;
  }

  // ---- 手札からレベルNのシグニをエナゾーンに置く ----
  if (t.match(/手札からレベル[０-９\d]+(?:以上|以下)?のシグニを[０-９\d]*枚?(?:まで)?エナゾーンに置く/)) {
    const countM = t.match(/([０-９\d]+)枚まで/);
    const count = countM ? parseNum(countM[1]) : 1;
    return { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count, filter: { cardType: 'シグニ' } } } as EnergyChargeAction;
  }

  // ---- このシグニはルリグが持つ色1つを得る ----
  if (t.match(/このシグニは.*(?:ルリグ|それ).*持つ色[１-９\d]*つを得る/)) {
    return { type: 'STUB', id: 'SIGNI_GAIN_ONE_LRIG_COLOR' } as StubAction;
  }

  // ---- レベルNのシグニをこのシグニの下に置いてもよい ----
  if (t.match(/(?:レベル[０-９\d]+(?:以上|以下)?の)?シグニ.*をこのシグニの下に置いてもよい/)) {
    return { type: 'STUB', id: 'PLACE_SIGNI_UNDER_SELF_OPT' } as StubAction;
  }

  // ---- シグニ複数体を《サーバントZERO》にする ----
  if (t.match(/シグニ.*体.*を.*《サーバント.*》にする/)) {
    return { type: 'STUB', id: 'MAKE_MULTI_SERVANT_ZERO' } as StubAction;
  }

  // ---- トラッシュに置かれたシグニのレベル合計×Nパワー修正 ----
  if (t.match(/トラッシュに置かれたシグニのレベル[０-９\d]+につき[－＋]/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_TRASHED_SIGNI_LEVEL' } as StubAction;
  }

  // ---- 捨てたカード1枚につき-N万 ----
  if (t.match(/捨てたカード[０-９\d]+枚につき[－＋][０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_DISCARD_COUNT_HIGH' } as StubAction;
  }

  // ---- 対戦相手のシグニ1体と以下の２つから１つを選ぶ ----
  if (t.match(/対戦相手のシグニ.*以下の[２-９]つから[１-９]つを選ぶ/)) {
    return { type: 'STUB', id: 'TARGET_AND_CHOOSE' } as StubAction;
  }

  // ---- 特定カードがいる場合、以下のN個から ----
  if (t.match(/場に他の[＜＜][^＞＞]+[＞＞]のシグニがある場合.*以下の[２-９]つから/)) {
    return { type: 'STUB', id: 'ALLY_CLASS_CHOOSE' } as StubAction;
  }

  // ---- 代わりに+Nされる（前文の続き） ----
  if (t.match(/^代わりに[＋＋][０-９\d]+される$/)) {
    return { type: 'STUB', id: 'REPLACE_PLUS_N' } as StubAction;
  }

  // ---- 数字を宣言する ----
  if (t.match(/^数字[０-９\d]*つ?を宣言する$/)) {
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;
  }

  // ---- 手札をN枚捨ててもよい（任意）----
  if (t.match(/^手札を([０-９\d]+)枚捨ててもよい$/)) {
    const cnt = parseNum((t.match(/([０-９\d]+)枚/) ?? [])[1] ?? '1');
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt } };
  }

  // ---- それの【出】能力は発動しない（出コストを支払ったが効果を抑止）----
  if (t.match(/それの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;
  }

  // ---- このシグニを場からトラッシュに置いてもよい ----
  if (t.match(/^このシグニを場からトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- 《色》を支払ってもよい（単色任意コスト）→ OPTIONAL_COST with costColors ----
  if (t.match(/^《[赤青緑黒白無]》を支払ってもよい$/)) {
    const costColors = [...t.matchAll(/《([^》]+)》/g)].map(m => m[1]);
    return { type: 'STUB', id: 'OPTIONAL_COST', costColors } as StubAction;
  }

  // ---- あなたのルリグゾーンに【リミットアッパー】を置く ----
  if (t.match(/ルリグゾーンに【リミットアッパー】[０-９\d]*つを置く/)) {
    return { type: 'STUB', id: 'PLACE_LIMIT_UPPER' } as StubAction;
  }

  // ---- 括弧ルール説明の後続フラグメント ----
  if (t.startsWith('（【トラップ】') || t.startsWith('（【シード】')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  if (t.endsWith('トラッシュに置く）') || t.endsWith('置く）') || t.endsWith('いてもよい）')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- 公開したカードをシャッフル・並べ替えてデッキに戻す ----
  if (t.match(/公開したカードをシャッフルして(?:デッキの一番下|デッキ)に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/残りを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- 対戦相手のシグニ1体を対象とし、《色》を支払ってもよい ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体を対象とし、《[赤青緑黒白無]》を支払ってもよい/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', costColors } as StubAction;
  }

  // ---- その中からカード1枚を【シード】/【トラップ】として設置 ----
  if (t.match(/その中からカード[０-９\d]+枚を【シード】として.*シグニゾーンに出して/)) {
    return { type: 'STUB', id: 'PLACE_SEED_FROM_REVEALED' } as StubAction;
  }
  if (t.match(/その中からカード[０-９\d]+枚を【トラップ】として.*シグニゾーンに設置/)) {
    return { type: 'STUB', id: 'PLACE_TRAP_FROM_REVEALED' } as StubAction;
  }

  // ---- このゲームの間、以下の能力を得る ----
  if (t.match(/このゲームの間、あなたは以下の能力を得る/)) {
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;
  }

  // ---- 以下をN回行う ----
  if (t.match(/^以下を[０-９\d]+回行う$/)) {
    return { type: 'STUB', id: 'REPEAT_N_TIMES' } as StubAction;
  }

  // ---- 対戦相手のパワーN以下のシグニをエナゾーンに置く ----
  {
    const banishM = t.match(/対戦相手のパワー([０-９\d]+)以下のシグニ([０-９\d]*)体?を対象とし、それをエナゾーンに置く/);
    if (banishM) {
      const cnt = banishM[2] ? parseNum(banishM[2]) : 1;
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: cnt, filter: { maxPower: parseNum(banishM[1]) } } } as BanishAction;
    }
  }

  // ---- 公開したカードをトラッシュに置く ----
  if (t.match(/^公開したカードをトラッシュに置く$/)) {
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }

  // ---- それらを好きな順番でデッキの一番上/下に戻す ----
  if (t.match(/それらを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }
  if (t.match(/それらを好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/その後、残りを好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 対戦相手はデッキの一番上を公開する ----
  if (t.match(/対戦相手はデッキの一番上を公開する/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'opponent' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'opponent', position: 'top' } };
  }

  // ---- あなたのデッキをシャッフルし一番上を公開する ----
  if (t.match(/あなたのデッキをシャッフルし.*一番上を公開する/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- その後、あなたのキー１枚を場からルリグトラッシュに置いてもよい ----
  if (t.match(/あなたのキー[０-９\d]*枚?を場からルリグトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'TRASH_OWN_KEY_OPTIONAL' } as StubAction;
  }

  // ---- それらのどちらか／一方を対戦相手に見せずに裏向きでルリグデッキに加える ----
  if (t.match(/(?:どちらか|いずれか|一方)[０-９\d]*枚?を対戦相手に見せず.*ルリグデッキに加える/)) {
    return { type: 'STUB', id: 'ADD_CARD_TO_LRIG_DECK_HIDDEN' } as StubAction;
  }

  // ---- このアーツを使用する際、ルリグデッキからアーツをルリグトラッシュに置いてもよい ----
  if (t.match(/このアーツを使用する際.*ルリグデッキから.*アーツ.*ルリグトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'ARTS_USE_DISCARD_LRIG_DECK' } as StubAction;
  }

  // ---- このアーツ/スペル/カードの使用コストは減る/増える ----
  if (t.match(/(?:このアーツ|このスペル|このカード)の使用コストは.*(?:減る|増える)/) ||
      t.match(/使用コストは.*(?:減る|増える)$/)) {
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;
  }

  // ---- ベットメカニクス ----
  if (t.match(/あなたがベットしていた場合、代わりに/)) {
    return { type: 'STUB', id: 'BET_ALTERNATIVE' } as StubAction;
  }
  if (t.match(/^ベット―/)) {
    return { type: 'STUB', id: 'BET_MECHANIC' } as StubAction;
  }

  // ---- トラップメカニクス ----
  if (t.match(/【トラップ】を表向きにし.*《トラップアイコン》/)) {
    return { type: 'STUB', id: 'ACTIVATE_TRAP_IN_FIELD' } as StubAction;
  }

  // ---- 同じ選択肢をN回以上選んでもよい ----
  if (t.match(/同じ選択肢を[０-９\d]+回以上選んでもよい/)) {
    return { type: 'STUB', id: 'CHOOSE_SAME_OPTION_MULTIPLE' } as StubAction;
  }

  // ---- 対戦相手のシグニとあなたのシグニ各1体（トレード）----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、(?:あなたの|この)?シグニ[０-９\d]*体?を場からトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;
  }

  // ---- 対戦相手はあなたの手札を見ないで選び捨てさせる ----
  if (t.match(/対戦相手はあなたの手札を[０-９\d]*枚?見ないで選び、あなたはそれを捨てる/)) {
    return { type: 'STUB', id: 'OPP_CHOOSE_YOUR_HAND_DISCARD' } as StubAction;
  }

  // ---- その中から特定ストーリーのカードを公開して手札に加え残りをデッキ下に置く ----
  if (t.match(/その中から.+のカード[０-９\d]+枚を公開し手札に加え、残りをシャッフルしてデッキの一番下に置く/)) {
    return makeRevealPickStub(t);
  }

  // ---- ゲームルール説明フラグメント（スキップ）----
  if (t.match(/この効果では[０-９\d]+単位でしか数字を割り振ることができない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  if (t.match(/^（実際の.+は変わらない$/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  // ---- 1ターンに一度の制限注釈 ----
  if (t.match(/(?:この効果|このカードの効果|この能力)は[１1一]ターンに一度しか発動しない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- ターン終了時に裏向きシグニを表向きにする ----
  if (t.match(/この方法で裏向きにしたシグニを.*表向きにする/)) {
    return { type: 'STUB', id: 'FLIP_FACE_DOWN_SIGNI' } as StubAction;
  }

  // ---- 特定クラフトカードをルリグデッキに加える ----
  if (t.match(/クラフトの《[^》]+》[０-９\d]*枚?をルリグデッキに加える/)) {
    return { type: 'STUB', id: 'ADD_CRAFT_TO_LRIG_DECK' } as StubAction;
  }

  // ---- デッキ上をN枚公開する後続処理 ----
  if (t.match(/その後、あなたのデッキの一番上を公開する/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- あなたのデッキ上を宣言した枚数トラッシュに置く ----
  if (t.match(/あなたのデッキの上からカードを宣言した数字に等しい枚数トラッシュに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_DECLARED_NUM_TRASH' } as StubAction;
  }

  // ---- それ/あなたはそれをトラッシュに置いてもよい ----
  if (t.match(/^(?:あなたは)?それをトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
  }

  // ---- そのシグニ/それを場からトラッシュに置く ----
  if (t.match(/^(?:その|それ)(?:シグニ)?を場からトラッシュに置く$/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction;
  }

  // ---- それらの【出】能力は発動しない ----
  if (t.match(/それらの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 'ALL' }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;
  }

  // ---- シグニゾーンを指定する ----
  if (t.match(/(?:あなたの|対戦相手の)?シグニゾーン[０-９\d]*つ?を指定する/)) {
    return { type: 'STUB', id: 'DESIGNATE_SIGNI_ZONE' } as StubAction;
  }

  // ---- この効果で公開したカードを好きな順番でデッキの一番上に戻す ----
  if (t.match(/この効果で公開したカードを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- そのカードをデッキの一番下に置いてもよい ----
  if (t.match(/そのカードをデッキの一番下に置いてもよい/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 対戦相手がアーツを使用できない ----
  if (t.match(/このターン、あなたはアーツを使用できない/)) {
    return { type: 'STUB', id: 'PREVENT_OWN_ARTS_USE' } as StubAction;
  }

  // ---- 追加ターン ----
  if (t.match(/追加の[０-９\d]*ターンを得る/)) {
    return { type: 'STUB', id: 'GAIN_EXTRA_TURN' } as StubAction;
  }

  // ---- 括弧ルール説明（【ビート】等）----
  if (t.startsWith('（') && t.includes('この能力はあなたの【')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }
  if (t.startsWith('（') && t.includes('コストの合計とは')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- このターンそれがチェックゾーンから移動された場合、ゲームから除外 ----
  if (t.match(/チェックゾーンから.*ゲームから除外/)) {
    return { type: 'STUB', id: 'EXILE_FROM_CHECK_ZONE' } as StubAction;
  }

  // ---- この効果でクラッシュされたカードのライフバーストは発動しない ----
  if (t.match(/この効果でクラッシュされたカードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;
  }

  // ---- あなたのエナゾーンからすべてのカードをトラッシュに置く ----
  if (t.match(/あなたのエナゾーンからすべてのカードをトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' } };
  }

  // ---- 手札からクラス等のシグニをN枚捨ててもよい ----
  {
    const optDiscardM = t.match(/手札から(.+?)のシグニ?を([０-９\d]+)枚?捨ててもよい/);
    if (optDiscardM) {
      const cnt = parseNum(optDiscardM[2]);
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt, filter: parseCardTypeFilter(optDiscardM[1]) } };
    }
  }

  // ---- 対戦相手が任意コストを支払う（支払わなかった場合に効果発動）----
  if (t.match(/^対戦相手は.*を支払ってもよい/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'OPPONENT_PAY_OPTIONAL', ...(costColors.length ? { costColors } : {}) } as StubAction;
  }

  // ---- 任意コスト支払い（広い汎用パターン）→ STUB with costColors ----
  if (t.match(/を支払ってもよい$/) || t.match(/を支払ってもよい。$/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'OPTIONAL_COST', ...(costColors.length ? { costColors } : {}) } as StubAction;
  }

  // ---- 括弧で始まるルール説明（汎用スキップ）----
  if (t.startsWith('（') && (t.endsWith('）') || t.length > 8)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- デッキの一番下に置く系 ----
  if (t.match(/手札からカード[０-９\d]+枚を好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'hand', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/あなたのデッキの(?:下|一番下)からカードを?([０-９\d]+)枚?トラッシュに置く/)) {
    const m = t.match(/([０-９\d]+)枚/);
    const cnt = m ? parseNum(m[1]) : 1;
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: cnt } };
  }
  if (t.match(/あなたのデッキの一番下のカードをトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }
  if (t.match(/(?:それ|そのカード)をデッキの一番下に置いてもよい$/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }
  if (t.match(/手札からカード[０-９\d]+枚を(?:好きな順番で)?デッキの一番下に置く/)) {
    const m = t.match(/([０-９\d]+)枚/);
    return { type: 'LOOK_AND_REORDER', source: { location: 'hand', owner: 'self' }, count: m ? parseNum(m[1]) : 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 次の対戦相手のターンの間、特定ゾーンのシグニでアタックできない ----
  if (t.match(/次の対戦相手のターン.*アタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, actionId: 'ATTACK', until: 'NEXT_TURN' } as BlockActionAction;
  }

  // ---- 対戦相手のシグニ1体を対象とし、それを裏向きにする ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、それを裏向きにする/)) {
    return { type: 'STUB', id: 'FACE_DOWN_OPP_SIGNI' } as StubAction;
  }

  // ---- 色宣言・手札選択 ----
  if (t.match(/^色[０-９\d]*つを宣言する$/)) {
    return { type: 'STUB', id: 'DECLARE_COLOR' } as StubAction;
  }
  if (t.match(/^対戦相手は色[０-９\d]*つを宣言する$/)) {
    return { type: 'STUB', id: 'OPP_DECLARE_COLOR' } as StubAction;
  }
  if (t.match(/^あなたの手札を[０-９\d]*枚?選ぶ$/)) {
    return { type: 'STUB', id: 'CHOOSE_HAND_CARD' } as StubAction;
  }

  // ---- ライフバーストを発動しない（そのカードの）----
  if (t.match(/そのカードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CARD' } as StubAction;
  }

  // ---- アクセアイコン持ちシグニをエナゾーンへ ----
  if (t.match(/《アクセアイコン》を持つシグニ.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'PLACE_ACCE_SIGNI_TO_ENERGY' } as StubAction;
  }

  // ---- 同じ場所にシグニがある/ない場合トラッシュ/表向き ----
  if (t.match(/同じ場所にシグニがある場合、トラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_IF_ZONE_OCCUPIED' } as StubAction;
  }

  // ---- 好きな枚数手札に加え残りをエナゾーンに置く ----
  if (t.match(/その中からカードを好きな枚数手札に加え、残りをエナゾーンに置く/)) {
    return { type: 'STUB', id: 'CHOOSE_HAND_OR_ENERGY' } as StubAction;
  }

  // ---- ウィルスを除く ----
  if (t.match(/【ウィルス】を好きな数取り除く/)) {
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;
  }

  // ---- マジックボックス/トラップ設置 ----
  if (t.match(/【マジックボックス】として.*シグニゾーンに設置/)) {
    return { type: 'STUB', id: 'PLACE_MAGIC_BOX' } as StubAction;
  }
  if (t.match(/【マジックボックス】.*表向きにし.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPEN_MAGIC_BOX' } as StubAction;
  }
  if (t.match(/【トラップ】として.*シグニゾーンに設置してもよい/)) {
    return { type: 'STUB', id: 'PLACE_TRAP_OPTIONAL' } as StubAction;
  }

  // ---- デッキ上からシグニがめくれるまで/宣言したカードまで公開する ----
  if (t.match(/デッキの上から.*めくれるまで公開する/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- デッキ上を公開し、宣言レベルのシグニなら手札/エナに加える ----
  if (t.match(/デッキの一番上を公開し、それが宣言した数字と同じレベル.*手札に加える/)) {
    return { type: 'STUB', id: 'DECK_TOP_CHECK_LEVEL_HAND' } as StubAction;
  }
  if (t.match(/デッキの一番上を公開し、それが宣言した数字と同じレベル.*エナゾーンに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_CHECK_LEVEL_ENERGY' } as StubAction;
  }

  // ---- この方法で公開されたカードをシャッフルしてデッキの一番下に置く ----
  if (t.match(/この方法で公開されたカードをシャッフルしてデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- この効果/方法でクラッシュされたカードのライフバーストは発動しない ----
  if (t.match(/この(?:効果|方法)でクラッシュされたカードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;
  }

  // ---- この効果はN枚までしか適用されない ----
  if (t.match(/この効果は[０-９\d]+枚までしか適用されない/)) {
    return { type: 'STUB', id: 'EFFECT_LIMIT' } as StubAction;
  }

  // ---- 対戦相手のセンタールリグが〜の場合、このアーツの使用コストは〜になる ----
  if (t.match(/対戦相手のセンタールリグが.*の場合、このアーツの使用コストは/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- この方法でカードをN枚以上捨てた場合、捨てた枚数＋Nのカードを引く ----
  if (t.match(/この方法でカードを[０-９\d]+枚以上捨てた場合、捨てた枚数に[０-９\d]+を加えた枚数のカードを引く/)) {
    return { type: 'STUB', id: 'VARIABLE_DRAW_BY_DISCARD' } as StubAction;
  }

  // ---- 色リストから1つを選ぶ ----
  if (t.match(/^(?:白|赤|青|緑|黒)(?:、(?:白|赤|青|緑|黒))+から[０-９\d]+つを選ぶ$/)) {
    return { type: 'STUB', id: 'CHOOSE_COLOR_FROM_LIST' } as StubAction;
  }

  // ---- 対戦相手は色・コストを宣言する ----
  if (t.match(/対戦相手は.*から[０-９\d]*つを宣言する/)) {
    return { type: 'STUB', id: 'OPP_DECLARE_CHOICE' } as StubAction;
  }

  // ---- その中から特定条件のシグニをエナゾーンに置き残りをデッキ上に ----
  if (t.match(/その中から.*のシグニをエナゾーンに置き、残りを好きな順番でデッキの一番上に置く/)) {
    return { type: 'STUB', id: 'REVEAL_PICK_CLASS_TO_ENERGY' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、手札から〜を捨てる（複合パターン）----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?(?:まで)?を対象とし、手札から.+捨て(?:る|てもよい)?$/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- このシグニのレベル以下のシグニN体を対象とし、手札から〜捨てる ----
  if (t.match(/このシグニのレベル以下の対戦相手のシグニ.+手札から.+捨て(?:る|てもよい)?$/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- あなたの場に〜がいる場合、対戦相手のシグニN体を対象とし... ----
  if (t.match(/あなたの場に.+がいる場合、対戦相手のシグニ.+を対象とし、手札から.+捨て/) ||
      t.match(/あなたの場に.+がいる場合、対戦相手のシグニ.+を対象とし、あなたの.+置いてもよい/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、あなたの〜をトラッシュ/デッキに置いてもよい ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?(?:まで)?を対象とし、あなたの.+(?:トラッシュに置いてもよい|デッキの一番.+に置いてもよい)/)) {
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、あなたの手札から〜公開する ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、あなたの(?:手札から|トラッシュから|エナゾーン)/)) {
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のシグニをN体まで対象とし → 具体アクション ----
  {
    const mDown = t.match(/対戦相手のシグニを([０-９\d]+)体まで対象とし、それらをダウンし凍結する/);
    if (mDown) {
      const cnt = parseNum(mDown[1]);
      return { type: 'SEQUENCE', steps: [
        { type: 'DOWN',   target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true } } as DownAction,
        { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true } } as FreezeAction,
      ]} as SequenceAction;
    }
    const mDown2 = t.match(/対戦相手のシグニを([０-９\d]+)体まで対象とし、それらをダウンする/);
    if (mDown2) {
      const cnt = parseNum(mDown2[1]);
      return { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true } } as DownAction;
    }
    const mBounce = t.match(/対戦相手のシグニを([０-９\d]+)体まで対象とし、それらを手札に戻す/);
    if (mBounce) {
      const cnt = parseNum(mBounce[1]);
      return { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true } } as BounceAction;
    }
    const mBanish = t.match(/対戦相手のシグニを([０-９\d]+)体まで対象とし、それらをバニッシュする/);
    if (mBanish) {
      const cnt = parseNum(mBanish[1]);
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true } } as BanishAction;
    }
    const mPow = t.match(/対戦相手のシグニを([０-９\d]+)体まで対象とし、(?:ターン終了時まで、)?それらのパワーをそれぞれ([＋－+-][０-９\d]+)する/);
    if (mPow) {
      const cnt = parseNum(mPow[1]);
      const delta = parseSignedNum(mPow[2]);
      return { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true }, delta } as PowerModifyAction;
    }
    // 手札/エナ/トラッシュ消費系は TARGET_AND_DISCARD_HAND STUB に残す
    if (t.match(/対戦相手のシグニを[０-９\d]+体まで対象とし/) &&
        (t.includes('手札') || t.includes('エナゾーン') || t.includes('トラッシュに置いてもよい'))) {
      return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
    }
  }

  // ---- このターンと次のターンの間〜（二ターン効果）----
  if (t.match(/このターンと次のターンの間/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- このゲームの間、あなたのセンタールリグは〜を得る ----
  if (t.match(/このゲームの間、あなたの(?:センタールリグ|《.+》)は/) ||
      t.match(/このゲームの間、あなたはグロウできない/) ||
      t.match(/このゲームの間、あなたは.+を使用できない/)) {
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;
  }

  // ---- その中からN枚を手札に加え、M枚をエナゾーンに/残りを〜 ----
  if (t.match(/その中から[０-９\d]*枚?を手札に加え/) ||
      t.match(/その中から好きな枚数を手札に加え/)) {
    return makeRevealPickStub(t);
  }

  // ---- あなたのメインフェイズ開始時〜（フェーズトリガー前置きを剥がして再解析）----
  {
    const m = t.match(/^あなたのメインフェイズ開始時[、,]\s*(.+)$/);
    if (m) return (parseSentencePart1(m[1].trim()) ?? parseSentencePart2(m[1].trim()) ?? { type: 'STUB', id: 'UNKNOWN_NESTED' } as EffectAction);
  }
  if (t === 'あなたのメインフェイズ開始時') {
    return { type: 'STUB', id: 'MAIN_PHASE_START_TRIGGER' } as StubAction;
  }

  // ---- あなたのエナゾーンにあるすべてのカードを手札に加える ----
  if (t.match(/あなたのエナゾーンにあるすべてのカードを手札に加える/)) {
    return { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' } };
  }

  // ---- あなたのエナゾーンにあるカードが持つ色から最大N色まで選ぶ ----
  if (t.match(/あなたのエナゾーンにあるカードが持つ色から最大[０-９\d]+色まで選ぶ/)) {
    return { type: 'STUB', id: 'CHOOSE_COLOR_FROM_LIST' } as StubAction;
  }

  // ---- 対戦相手の場にある【ウィルス】を取り除く ----
  if (t.match(/対戦相手の場にある【ウィルス】[０-９\d]*つを取り除く(?:てもよい)?/)) {
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;
  }

  // ---- あなたのシグニに手札からカードを裏向きで付ける（チャーム）----
  if (t.match(/手札からカード[０-９\d]*枚?を裏向きで付ける/) ||
      t.match(/あなたのシグニ.+に.+手札からカードを.+付ける/)) {
    return { type: 'STUB', id: 'PLACE_CARD_UNDER_SIGNI' } as StubAction;
  }

  // ---- 対戦相手のルリグトラッシュからアーツを使用する ----
  if (t.match(/対戦相手のルリグトラッシュから.+を対象とし/) ||
      t.match(/対戦相手のルリグトラッシュから.+使用/)) {
    return { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' } as StubAction;
  }

  // ---- このアーツはあなたのセンタールリグが〜の場合にしか使用できない ----
  if (t.match(/^このアーツはあなたのセンタールリグが.+の場合(?:にしか使用できない|か、)/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- あなたの場にあるすべてのシグニが〜の場合（条件付き効果）----
  if (t.match(/^あなたの場にあるすべてのシグニが.+の場合/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- このシグニの下からカードをトラッシュに置く ----
  {
    const mOpt = t.match(/このシグニの下からカード([０-９\d]*)枚?をトラッシュに置いてもよい/);
    if (mOpt) {
      const count = mOpt[1] ? parseNum(mOpt[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count, upToCount: true, fromThis: true } as TakeFromUnderSigniAction;
    }
    const mReq = t.match(/このシグニの下からカード([０-９\d]*)枚?をトラッシュに置く$/);
    if (mReq) {
      const count = mReq[1] ? parseNum(mReq[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count, fromThis: true } as TakeFromUnderSigniAction;
    }
  }

  // ---- デッキをシャッフルし、そのシグニを公開しデッキの〜に置く ----
  if (t.match(/デッキをシャッフルし、そのシグニを公開しデッキの(?:一番上|上から)/)) {
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;
  }

  // ---- その後、デッキをシャッフルし、それをコストを支払わずに使用する ----
  if (t.match(/デッキをシャッフルし、(?:それ|そのカード)をコストを支払わずに使用する/)) {
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;
  }

  // ---- デッキをシャッフルし、そのカードをデッキの一番上に置く ----
  if (t.match(/デッキをシャッフルし、そのカードをデッキの一番上に置く/)) {
    return { type: 'TRANSFER_TO_DECK', source: { type: 'DECK_CARD', owner: 'self', count: 1 }, position: 'top', shuffle: true };
  }

  // ---- あなたのトラッシュにカード名に〜を含むカードがある場合 ----
  if (t.match(/あなたのトラッシュにカード名に.+を含むカードがある場合/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- センタールリグのレベルが〜の場合のアーツコスト変動 ----
  if (t.match(/あなたのセンタールリグのレベルが.+の場合/) ||
      t.match(/あなたのセンタールリグのレベルが対戦相手より/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- 対戦相手のパワーN以下/以上のシグニを対象とし手札から〜 ----
  if (t.match(/対戦相手のパワー[０-９\d]+以[下上]のシグニ[０-９\d]*体?を対象とし/) ||
      t.match(/対戦相手のパワー[０-９\d]+以[下上]のシグニ[０-９\d]*体?.*手札から.+捨て/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- この方法でトラッシュに置かれたカードの中からシグニをN枚対象とし〜 ----
  if (t.match(/この方法でトラッシュに置かれたカードの中からシグニ/)) {
    return { type: 'STUB', id: 'PICK_FROM_TRASHED_CARDS' } as StubAction;
  }

  // ---- その中から〜アイコンを持つカードをエナゾーンに置き残りを〜 ----
  if (t.match(/その中から.+アイコン》を持つ.+エナゾーンに置き、残り/)) {
    return { type: 'STUB', id: 'REVEAL_PICK_CLASS_TO_ENERGY' } as StubAction;
  }

  // ---- この方法でトラッシュに置いたカードの中に〜がある場合 ----
  if (t.match(/この方法でトラッシュに置いたカードの中に/)) {
    return { type: 'STUB', id: 'CONDITIONAL_PER_TRASH' } as StubAction;
  }

  // ---- その中から《アクセアイコン》を持つカードをエナゾーンに ----
  if (t.match(/その中から《アクセアイコン》を持つ.+エナゾーンに置き/)) {
    return { type: 'STUB', id: 'REVEAL_PICK_CLASS_TO_ENERGY' } as StubAction;
  }

  // ---- 数値範囲で数字を宣言する ----
  if (t.match(/[０-９\d]+～[０-９\d]+の数字[０-９\d]*つを宣言する/)) {
    return { type: 'STUB', id: 'DECLARE_NUMBER_RANGE' } as StubAction;
  }

  // ---- 手札からクラスシグニを好きな枚数公開する ----
  if (t.match(/手札から.+のシグニを好きな枚数公開する/)) {
    return { type: 'STUB', id: 'REVEAL_CLASS_SIGNI_FROM_HAND' } as StubAction;
  }

  // ---- この方法で公開したカード1枚につき±Nパワー ----
  if (t.match(/この方法で公開したカード[０-９\d]*枚につき[＋－][０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_REVEALED' } as StubAction;
  }

  // ---- ターン終了時まで、公開シグニのレベル合計につき±Nパワー ----
  if (t.match(/ターン終了時まで.*公開された.*レベル.*につき[＋－][０-９\d]+する/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_REVEALED_LEVEL' } as StubAction;
  }

  // ---- このカードはこのターンにアーツを使用していた場合、使用できない ----
  if (t.match(/このカードはあなたがこのターンにアーツを使用していた場合、使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_ARTS_USED' } as StubAction;
  }

  // ---- アーツ使用時に手札から色のカードをN枚まで捨てる ----
  if (t.match(/このアーツを使用する際、手札から.+のカードを[０-９\d]+枚まで捨てる/)) {
    return { type: 'STUB', id: 'ARTS_USE_DISCARD_COLOR_HAND' } as StubAction;
  }

  // ---- 対戦相手の手札をN枚見ないで選び公開させる ----
  if (t.match(/対戦相手の手札を[０-９\d]*枚?見ないで選び、対戦相手はそのカードを公開する/)) {
    return { type: 'STUB', id: 'REVEAL_OPP_HAND_CARD' } as StubAction;
  }

  // ---- 対戦相手のエナゾーンからカードをトラッシュに置いてもよい ----
  if (t.match(/対戦相手のエナゾーンからカード[０-９\d]*枚?を対象とし、それをトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 } };
  }

  // ---- 対戦相手のシグニN体を対象とする（単独）----
  if (t.match(/^対戦相手のシグニ[０-９\d]*体?を対象とする$/)) {
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_ONLY' } as StubAction;
  }

  // ---- そのカード/それをトラッシュに置いてもよい（単独）----
  if (t.match(/^(?:そのカード|それ)をトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
  }

  // ---- このゲームの間、コインの使用制限 ----
  if (t.match(/このゲームの間.*《コインアイコン》.*しか支払えない/)) {
    return { type: 'STUB', id: 'COIN_USE_RESTRICTION' } as StubAction;
  }

  // ---- ビート説明テキスト（括弧複合）→ スキップ ----
  if (t.match(/【ビート】はターン終了時まであなたが持ち/) || t.includes('コストの支払いで【ビート】')) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- 括弧で終わるルール説明（後続フラグメント）→ スキップ ----
  if (t.endsWith('）') && (t.includes('【マジックボックス】') || t.includes('【ビート】') || t.includes('コストの合計') || t.includes('例えば'))) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- この効果ではN単位でしか数字を割り振れない → スキップ ----
  if (t.match(/この効果では[０-９\d]+単位でしか数字を割り振れない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- 対戦相手のセンタールリグが〜の場合、このカード/アーツのコストが変わる ----
  if (t.match(/対戦相手のセンタールリグが.+の場合、このカードの基本コストは/)) {
    return { type: 'STUB', id: 'CONDITIONAL_CARD_COST_BY_OPP_LRIG' } as StubAction;
  }

  // ---- それが能力を持たない場合、代わりにトラッシュ ----
  if (t.match(/能力を持たない場合、代わりにそれをトラッシュに置く/)) {
    return { type: 'STUB', id: 'ABILITY_CHECK_ELSE_TRASH' } as StubAction;
  }

  // ---- 特定条件の場合、手札を捨てる/捨てない選択 ----
  if (t.match(/の場合、手札を[０-９\d]+枚捨ててもよい/)) {
    return { type: 'STUB', id: 'CONDITIONAL_DISCARD' } as StubAction;
  }

  // ---- エナから特定クラスのカードをトラッシュに置いてもよい（任意）----
  if (t.match(/あなたのエナゾーンから.+のカード[０-９\d]+枚?をトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- 対戦相手はデッキをシグニ/スペルがめくれるまで公開する ----
  if (t.match(/対戦相手は.*デッキを上から.*めくれるまで公開する/)) {
    return { type: 'STUB', id: 'OPP_DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- あなたのデッキを上から特定カードがめくれるまで公開する ----
  if (t.match(/あなたのデッキを上から.+がめくれるまで公開する/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL_CLASS' } as StubAction;
  }

  // ---- その中のそれぞれ名前の異なる〜の枚数を数える ----
  if (t.match(/その中のそれぞれ名前の異なる.*の枚数を数える/)) {
    return { type: 'STUB', id: 'COUNT_DISTINCT_NAMES' } as StubAction;
  }

  // ---- 手札から捨てなければ手札をN枚捨てる（コスト選択）----
  if (t.match(/手札から.+捨てないかぎり手札を[０-９\d]+枚捨てる/)) {
    return { type: 'STUB', id: 'DISCARD_OR_PENALTY' } as StubAction;
  }

  // ---- デッキ上から宣言数に等しい枚数をトラッシュ ----
  if (t.match(/デッキの上から宣言した数字に等しい枚数のカードをトラッシュに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_DECLARED_NUM_TRASH' } as StubAction;
  }

  // ---- 場の条件＋代わりに修正（条件付きパワーボーナス）----
  if (t.match(/あなたの場に.*シグニが[０-９\d]+体ある場合、代わりに[＋－][０-９\d]+する/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- あなたの手札を公開する ----
  if (t.match(/^あなたの手札(?:を|から.+)?を?公開する$/)) {
    return { type: 'REVEAL' };
  }

  // ---- デッキの一番上を公開し、選んだ色を持つシグニである場合、手札/エナゾーンに ----
  if (t.match(/あなたのデッキの一番上を公開し、それが選んだ色を持つシグニである場合/)) {
    const owner: Owner = 'self';
    return {
      type: 'REVEAL_AND_PICK',
      owner,
      revealCount: 1,
      pickCount: 1,
      then: { type: 'ADD_TO_HAND', owner } as AddToHandAction,
      remainder: { location: 'deck' as CardLocation, position: 'top' },
    };
  }

  // ---- デッキの一番下のカードをチェックゾーンに置く ----
  if (t.match(/あなたのデッキの一番下のカードをチェックゾーンに置く/)) {
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;
  }

  // ---- その中から1枚を手札に加え〜残りをX置く ----
  if (t.match(/その中から[０-９\d]*枚?を手札に加え(?:、[０-９\d]*枚?を)?(?:エナゾーンに置く|トラッシュに置く|デッキの.+に置く)/)) {
    return makeRevealPickStub(t);
  }

  // ---- このアーツはあなたの〜の場合にしか使用できない ----
  if (t.match(/^このアーツはあなたの.+の場合(?:か、|にしか)(?:あなたの.+の場合)?(?:か、)?にしか?使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- デッキの上からN枚見て特定クラスを手札/エナゾーンに加える ----
  {
    const m = t.match(/あなたのデッキの上からカードを([０-９\d]+)枚見て、その中から(.+?)([０-９\d]+)枚?(?:を公開し)?(?:手札に加える|エナゾーンに置く)/);
    if (m) {
      const revealCount = parseNum(m[1]);
      const filter = parseCardTypeFilter(m[2]);
      return {
        type: 'REVEAL_AND_PICK',
        owner: 'self',
        revealCount,
        pickCount: parseNum(m[3]),
        filter,
        then: { type: 'ADD_TO_HAND', owner: 'self' } as AddToHandAction,
        remainder: { location: 'deck' as CardLocation, position: 'bottom' },
      };
    }
  }

  // ---- デッキの上から〜がめくれるまで公開し手札に加える（汎用）----
  if (t.match(/あなたのデッキの上から.+がめくれるまで公開し(?:、それ)?を手札に加える/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- デッキの上からN枚のカードを公開する（センタールリグレベル参照等）----
  if (t.match(/あなたのデッキの上からあなたのセンタールリグのレベルと同じ枚数のカードを公開する/)) {
    return { type: 'STUB', id: 'DECK_REVEAL_UNTIL' } as StubAction;
  }

  // ---- あなたのトラッシュからクラスのシグニを対象とし（コスト付き）手札に ----
  if (t.match(/あなたのトラッシュから.+のシグニ[０-９\d]*枚?を対象とし、手札からカードを[０-９\d]+枚捨て(?:る|てもよい)/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- あなたのトラッシュからクラスのシグニを使用する ----
  if (t.match(/あなたのトラッシュから.+のシグニ[０-９\d]*枚?を対象とし、.*使用する/)) {
    return { type: 'STUB', id: 'ENCORE' } as StubAction;
  }

  // ---- あなたのエナゾーンからクラスのシグニをトラッシュ/公開する（複数）----
  if (t.match(/あなたのエナゾーンから.+のシグニを?[０-９\d好きな枚数]*枚?(?:まで)?対象とし/) ||
      t.match(/あなたのエナゾーンから.+のシグニ[０-９\d]*枚?をトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- ライフクロスが〜の場合の条件テキスト ----
  if (t.match(/あなたのライフクロスが[０-９\d]+枚以下の場合/) ||
      t.match(/あなたのライフクロスの(?:上から|一番上)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- センタールリグが〜の場合の条件テキスト ----
  if (t.match(/あなたのセンタールリグが.+の場合、(?:代わりに|追加で|この能力)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- 次の対戦相手のターン〜場に出せない（配置制限）----
  if (t.match(/^次の対戦相手のターン(?:終了時まで|の間|、)/) && t.includes('場に出せない')) {
    return { type: 'STUB', id: 'DEPLOY_RESTRICT' } as StubAction;
  }

  // ---- 次の対戦相手のターン〜（一時的制限）----
  if (t.match(/^次の対戦相手のターン(?:終了時まで|の間|、)/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- このターン、対戦相手が場に出せない（配置制限）----
  if (t.match(/^このターン、対戦相手(?:が|は)/) && t.includes('場に出せない')) {
    return { type: 'STUB', id: 'DEPLOY_RESTRICT' } as StubAction;
  }

  // ---- このターン、対戦相手が〜（アタック制限・コスト条件）----
  if (t.match(/^このターン、対戦相手(?:が|は)/)) {
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;
  }

  // ---- 対戦相手のアタックしているシグニのアタックを一度無効にする ----
  if (t.match(/対戦相手の.*アタックしている.*シグニ.*アタックを.*無効にする/)) {
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as NegateAttackAction;
  }

  // ---- 使用条件：特定タイミングにしか使えない ----
  if (t.match(/この能力は.*アタックしたときにしか使用できない/) ||
      t.match(/この能力は.*時にしか使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- 対戦相手のターンの間、このカードの使用コストは《》になる ----
  {
    const m = t.match(/^(?:対戦相手のターン|次のターン)の間、この(?:カード|アーツ|スペル|シグニ)の使用コストは(.+)になる/);
    if (m) {
      const cost = parseEnergyCosts(m[1]);
      if (cost.length > 0) return { type: 'ALT_COST_OPP_TURN', cost } as AltCostOppTurnAction;
    }
    if (t.match(/(?:対戦相手のターン|次のターン).*使用コストは/)) {
      return { type: 'STUB', id: 'ARTS_COST_MODIFY_OPP_TURN' } as StubAction;
    }
  }

  // ---- このシグニの下からカードを移動 ----
  {
    // 「手札に加えるかエナゾーンに置く」CHOOSE パターン
    const mc = t.match(/このシグニの下から(?:《[^》]+》の)?カードを?([０-９\d]*)枚?(まで)?を?手札に加えるかエナゾーンに置く/);
    if (mc) {
      const cnt = mc[1] ? parseNum(mc[1]) : 1;
      return {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'hand',   label: '手札に加える',   action: { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'hand',   count: cnt, upToCount: !!mc[2], fromThis: true } as TakeFromUnderSigniAction },
          { choiceId: 'energy', label: 'エナゾーンに置く', action: { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'energy', count: cnt, upToCount: !!mc[2], fromThis: true } as TakeFromUnderSigniAction },
        ],
      } as ChooseAction;
    }
    // 単一移動先
    const m = t.match(/このシグニの下から(?:《[^》]+》の)?カードを?([０-９\d]*)枚?(まで)?(?:を?対象とし、それ(?:ら)?を)?を?(手札に加える|エナゾーンに置く|トラッシュに置く)/);
    if (m) {
      const dest: 'hand' | 'energy' | 'trash' = m[3].includes('手札') ? 'hand' : m[3].includes('エナ') ? 'energy' : 'trash';
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: dest, count: cnt, upToCount: !!m[2], fromThis: true } as TakeFromUnderSigniAction;
    }
  }

  // ---- 次のターンの間、対戦相手はグロウできない ----
  if (t.match(/次のターンの間、対戦相手はグロウできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'GROW', until: 'NEXT_TURN' } as BlockActionAction;
  }

  // ---- 対戦相手のターン終了時、このシグニをトラッシュに置いてもよい ----
  if (t.match(/対戦相手のターン終了時、このシグニを場からトラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' } as StubAction;
  }

  // ---- トリガーした能力の処理順説明（ルール説明）----
  if (t.match(/トリガーした能力は.*好きな順番で処理する/) ||
      t.match(/（このアーツの後に.*処理する）/) ||
      t.match(/このカードの使用コストは.*にしか支払えない/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- このアーツは/このカードは対戦相手の手札が0枚の場合にしか使用できない ----
  if (t.match(/この(?:アーツ|カード)は.*手札が[０-９\d０]枚の場合にしか使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- 選んだカードによって追加効果（CHOOSE系）----
  if (t.match(/あなたの場に.*シグニが[０-９\d]+体ある場合、代わりにカードを.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ARTS_COST' } as StubAction;
  }

  // ---- この方法で〜N単位につきパワー±N / コスト減少（汎用）----
  if (t.match(/この方法で.*につき/)) {
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;
  }

  // ---- 公開したカードを好きな順番でデッキの一番下に置く ----
  if (t.match(/公開したカードを好きな順番でデッキの一番下に置く/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'bottom' } };
  }

  // ---- 使用しなかった場合、そのスペルを対戦相手のトラッシュに置く ----
  if (t.match(/使用しなかった場合、そのスペルを対戦相手のトラッシュに置く/)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- N体以下/以上のシグニに使用することはできない（使用条件テキスト）----
  if (t.match(/のシグニに使用することはできない[）]?$/) || t.match(/にしか使用することはできない[）]?$/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- このゲームの間、特定カードを使用できない ----
  if (t.match(/このゲームの間、あなたは《.+》を使用できない/)) {
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、手札をN枚捨ててもよい ----
  if (t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、手札を好きな枚数捨ててもよい/) ||
      t.match(/対戦相手のシグニ[０-９\d]*体?を対象とし、手札を[０-９\d]+枚?捨ててもよい$/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- 各プレイヤーは手札・エナ・シグニをすべてトラッシュに ----
  if (t.match(/各プレイヤーは.*(?:手札|エナゾーン).*シグニをすべてトラッシュに置く/)) {
    return { type: 'STUB', id: 'TRASH_ALL_SIGNI_AND_KEY' } as StubAction;
  }

  // ---- このシグニのレベルはN枚につきN減る ----
  if (t.match(/このシグニのレベルは.*[０-９\d]枚?につき[０-９\d]+減る/)) {
    return { type: 'STUB', id: 'LEVEL_MOD_PER_COUNT' } as StubAction;
  }

  // ---- そうしない場合、このシグニを場からトラッシュに置く ----
  if (t.match(/そうしない場合、このシグニを場からトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- あなたのデッキを上から/手札からカードをN枚公開する（汎用）----
  if (t.match(/^あなたの(?:デッキの一番上|手札から)を?公開する$/) ||
      t.match(/^デッキの一番上を公開する$/)) {
    return { type: 'REVEAL' };
  }

  // ---- 対戦相手の手札をN枚見る ----
  if (t.match(/^対戦相手の手札を見る$/) || t.match(/^対戦相手の手札を[０-９\d]+枚見る$/)) {
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;
  }

  // ---- このカードがあなたの効果によって手札から公開されたとき（parseBlock未処理フォールバック） ----
  if (t.match(/このカードがあなたの効果によって手札から公開されたとき/)) {
    return { type: 'STUB', id: 'REVEALED_FROM_HAND_UNSTRIPPED' } as StubAction;
  }

  // ---- 対戦相手のシグニN体を対象とし、ターン終了時まで、パワー±N ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d０-９]+)体?(?:まで)?を対象とし(?:、ターン終了時まで、それら?のパワーを([＋－][０-９\d]+)する)?/);
    if (m) {
      const cnt = parseNum(m[1]);
      const deltaStr = m[2];
      if (deltaStr) {
        const sign = deltaStr[0] === '＋' ? 1 : -1;
        const delta = sign * parseNum(deltaStr.slice(1));
        return {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
          delta,
        };
      }
    }
  }

  // ---- あなたのシグニN体を対象とし、ターン終了時まで、パワー±N ----
  {
    const m = t.match(/あなたのシグニ([０-９\d０-９]+)体?(?:まで)?を対象とし(?:、ターン終了時まで、それら?のパワーを([＋－][０-９\d]+)する)?/);
    if (m) {
      const cnt = parseNum(m[1]);
      const deltaStr = m[2];
      if (deltaStr) {
        const sign = deltaStr[0] === '＋' ? 1 : -1;
        const delta = sign * parseNum(deltaStr.slice(1));
        return {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: cnt, upToCount: t.includes('まで') },
          delta,
        };
      }
    }
  }

  // ---- ゲームから除外 ----
  if (t.match(/をゲームから除外(?:してもよい|する)/))
    return { type: 'STUB', id: 'BANISH_FROM_GAME' } as StubAction;

  // ---- アーツ/スペル使用条件でコスト変化 ----
  if (t.match(/対戦相手が(?:アーツ|スペル)を使用していた場合/) ||
      t.match(/このターンに対戦相手が(?:アーツ|スペル)/) ||
      t.match(/両方を使用していた場合/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 使用コストがXになる/減る ----
  if (t.match(/このアーツの使用コストは《.+》になる/) ||
      t.match(/このアーツの使用コストは《.+》減る/) ||
      t.match(/使用コストは《.+》になる$/) ||
      t.match(/それの使用コストは《.+》減る$/) ||
      t.match(/使用コストは[、《].+?[》]?に?なる/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 選んだ数がN以上の場合コストが変わる ----
  if (t.match(/選んだ数が[０-９\d]+つ以上の場合、このアーツの使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- ライフバーストを発動させる ----
  if (t.match(/そのライフバーストを発動させる/) ||
      t.match(/ライフバーストを持っていた場合.*チェックゾーンに置き/))
    return { type: 'STUB', id: 'TRIGGER_LIFE_BURST' } as StubAction;

  // ---- 《ヘブン》/自動能力引用文 ----
  if (t.match(/が《ヘブン》したとき/) ||
      t.match(/^【自】：.+したとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- アタックを一度無効にする ----
  if (t.match(/のアタックを一度無効にする/) ||
      t.match(/アタックであなたにダメージを与えない/))
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as NegateAttackAction;

  // ---- 対戦相手はデッキの一番上を公開する ----
  if (t.match(/対戦相手は(?:自分の)?デッキの一番上のカードを公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- それらを入れ替えてもよい ----
  if (t.match(/^あなたはそれらを入れ替えてもよい$/))
    return { type: 'STUB', id: 'SWAP_OPTIONAL' } as StubAction;

  // ---- トラッシュから手札にあるかのように使用 ----
  if (t.match(/トラッシュから.*手札にあるかのように.*(?:使用|発動)(?:する|してもよい)/) ||
      t.match(/トラッシュから.*コストを支払わずに.*使用してもよい/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 代替コスト支払い（支払う際、代わりにトラッシュ） ----
  if (t.match(/支払う際、代わりに.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手エナゾーン全カードとシグニをすべてトラッシュ ----
  if (t.match(/対戦相手のエナゾーンにあるすべての.*カードと対戦相手の場にあるすべてのシグニをトラッシュに置く/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- 選んだ色につきシグニを手札/エナ ----
  if (t.match(/選んだ色[１-９1-9]+つにつき.*シグニ[１-９1-9]+枚を手札に加えるかエナゾーンに置く/))
    return { type: 'STUB', id: 'CHOOSE_COLOR_FROM_LIST' } as StubAction;

  // ---- カード名に〜含むすべてを手札に加え残りをトラッシュ ----
  if (t.match(/その中からカード名に《.+》を含むすべてのカードを手札に加え、残りをトラッシュに置く/))
    return makeRevealPickStub(t);

  // ---- 好きな数の〈クラス〉シグニを場に出す ----
  if (t.match(/その中から好きな数の[＜〈<].+[＞〉>]のシグニを場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 以下からN選ぶ ----
  if (t.match(/^以下から[０-９\d]+つから[０-９\d]+つまで選ぶ$/) ||
      t.match(/^以下から[０-９\d]+つ選ぶ$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- それをトラッシュに置いて対戦相手デッキ上をライフに ----
  if (t.match(/トラッシュに置いて対戦相手のデッキの一番上のカードをライフクロスに加えてもよい/))
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;

  // ---- 感染状態の場合、代わりに ----
  if (t.match(/感染状態の場合、代わりに/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- ウィルスN個取り除く（複数形） ----
  if (t.match(/対戦相手の場にある【ウィルス】[０-９\d]+つを取り除いてもよい/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- シグニがアクセされたとき自動能力 ----
  if (t.match(/シグニ[１-９1-9０-９\d]*体?がアクセされたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- そのシグニと共通する色を持つシグニを手札から捨ててもよい ----
  if (t.match(/手札からそのシグニと共通する色を持つシグニを[１-９1-9０-９\d]*枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手シグニのアタックを無効にしたとき/センタールリグをガードしたとき ----
  if (t.match(/対戦相手のシグニ[１-９1-9０-９\d]*体?のアタックを(?:効果によって)?無効にしたとき/) ||
      t.match(/対戦相手のセンタールリグのアタックを【ガード】するか/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 正面のシグニを対象とし、デッキ上カードをトラッシュ ----
  if (t.match(/正面のシグニ[１-９1-9０-９\d]*体?を対象とし、あなたのデッキの一番上のカードをトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 【トラップ】をトラッシュに置く ----
  if (t.match(/【トラップ】[１-９1-9０-９\d]*つをトラッシュに置く/))
    return { type: 'STUB', id: 'TRAP_OP' } as StubAction;

  // ---- このシグニによってクラッシュされたLBは発動しない ----
  if (t.match(/このシグニによってクラッシュされたカードのライフバーストは発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;

  // ---- この効果でレベルは0以下にならない ----
  if (t.match(/この効果でレベルは[０0]以下にはならない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 宣言した数字と同じレベルシグニを捨てさせる ----
  if (t.match(/宣言した数字と同じレベルのシグニをすべて捨てさせる/) ||
      t.match(/その後、数字[１-９1-9０-９\d]*つを宣言し、その数字と同じレベル.*シグニをすべて捨てさせる/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- 対戦相手の手札を見てシグニを捨てさせる ----
  if (t.match(/対戦相手の手札を見て.*シグニ(?:を|すべて)捨てさせる/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- この方法で場に出たレゾナの【出】能力は発動しない ----
  if (t.match(/この方法で場に出たレゾナの【出】能力は発動しない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 好きな数のシグニを対象とし、合わせてパワーを増やす ----
  if (t.match(/好きな数のシグニを対象とし、ターン終了時まで、それらのパワーを合わせて/))
    return { type: 'STUB', id: 'POWER_MOD_DISTRIBUTE' } as StubAction;

  // ---- この下から好きな枚数のシグニをトラッシュ ----
  if (t.match(/この下から好きな枚数のシグニを対象とし、それらをトラッシュに置く/))
    return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count: 9, upToCount: true, fromThis: true, filter: { cardType: 'シグニ' } } as TakeFromUnderSigniAction;

  // ---- 公開した他のカードをシャッフルしてデッキ下 ----
  if (t.match(/公開した他のカードをシャッフルしてデッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- N以外/0からNの数字を宣言する ----
  if (t.match(/^[０0]から[０-９\d]+までの数字[１-９1-9０-９\d]*つを宣言する$/) ||
      t.match(/^[０-９\d]+以外の数字[１-９1-9０-９\d]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- 括弧で終わる注釈文（場合/含まれる/何もしない） ----
  if (t.match(/[）)）]$/) &&
      (t.includes('この効果は何もしない') || t.includes('含まれる') || t.includes('場を離れていた場合')))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラップ配置し直す ----
  if (t.match(/すべての【トラップ】を好きなように配置し直す/))
    return { type: 'STUB', id: 'TRAP_OP' } as StubAction;

  return null;
}
