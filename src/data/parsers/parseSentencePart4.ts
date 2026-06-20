import type {
  EffectAction,
  TransferToDeckAction,
  EnergyChargeAction,
  TakeFromUnderSigniAction,
  StubAction,
  BanishAction,
  ConditionalAction,
  BlockCardUseAction,
  PlaceVirusAction,
} from '../../types/effects';
import {
  parseNum, makeRevealPickStub,
} from '../parserUtils';
import { parseSentencePart1 } from './parseSentencePart1';
import { parseSentencePart2 } from './parseSentencePart2';

export function parseSentencePart4(t: string): EffectAction | null {
  // ---- 手札からカードを【トラップ】として設置する ----
  if (t.match(/手札からカードを[１-９\d]*枚?まで【トラップ】として.*シグニゾーンに設置する/))
    return { type: 'STUB', id: 'TRAP_OP' } as StubAction;

  // ---- その中から〈クラス〉/レベル/色シグニを手札に加え残りをトラッシュ ----
  if (t.match(/その中から.*[＜〈<].*[＞〉>].*シグニ.*手札に加え/) ||
      t.match(/その中から.*シグニ.*手札に加え(?:、残りをトラッシュに置く)?$/) ||
      t.match(/その中から.*(?:好きな数の|それぞれ名前の異なるように).*シグニ.*手札に加え/) ||
      t.match(/その中から(?:白か黒|青か黒|赤か白).+シグニ.+手札に加え/) ||
      t.match(/その中からレベル[０-９\d０-９]+のシグニ.+手札に加え/))
    return makeRevealPickStub(t);

  // ---- その中からスペル/カードを手札に加える ----
  if (t.match(/その中から.*スペル[１-９\d]*枚を(?:公開し)?手札に加える$/) ||
      t.match(/その中から.*を公開し手札に加えるかエナゾーンに置く$/) ||
      t.match(/その中から.*アイコン》を持つシグニ[１-９\d]*枚を(?:公開し)?手札に加える$/))
    return makeRevealPickStub(t);

  // ---- その後、そのシグニを場に出し残りをトラッシュ ----
  if (t.match(/その後、そのシグニを場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- センタールリグが〈クラス〉の場合にしか使用できない ----
  if (t.match(/この能力の使用コストは無色ではないカードでしか支払えない/) ||
      t.match(/このアーツの使用コストに含まれる.*コストは.*でしか支払えない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  if (t.match(/この能力はあなたのセンタールリグが[＜〈<].+[＞〉>]の場合しか使用できない/) ||
      t.match(/この能力はこのシグニが.+の場合にしか発動しない/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- 手札から《特定カード》を捨てる ----
  if (t.match(/^手札から《.+》を[１-９\d]*枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };

  // ---- 手札の枚数の上限がN増える ----
  if (t.match(/あなたの手札の枚数の上限は[１-９\d０-９]+増える/))
    return { type: 'STUB', id: 'HAND_SIZE_INCREASE' } as StubAction;

  // ---- ウィルスをシグニゾーンに置く（合計N個になるように） ----
  const fillVirusM = t.match(/【ウィルス】の合計が([１-９\d０-９]+)つになるように.*シグニゾーンに【ウィルス】を置く/);
  if (fillVirusM) {
    const n = parseNum(fillVirusM[1]);
    return { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: n, virusCount: 1, fillToTotal: n } as PlaceVirusAction;
  }

  // ---- 対戦相手の場のすべての【ウィルス】を取り除く ----
  if (t.match(/対戦相手の場にあるすべての【ウィルス】を取り除く/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- シグニ１体の基本レベルをN～Nにする ----
  if (t.match(/それの基本レベルを[１-９\d０-９]～[１-９\d０-９]いずれかのレベル[１-９\d０-９]つにする/))
    return { type: 'STUB', id: 'SET_LEVEL_RANGE' } as StubAction;

  // ---- それらの【出】能力は発動せず〜 ----
  if (t.match(/【出】能力は発動せず/) ||
      t.match(/【英知】能力の条件がこのシグニのレベルを参照する場合/) ||
      t.match(/アタックフェイズの開始時.*シグニをチェックゾーンに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキを公開しクラスシグニがめくれるまで ----
  if (t.match(/デッキの上から.*シグニがめくれるまで公開し、そのシグニを手札に加える/))
    return makeRevealPickStub(t);

  // ---- このシグニが〜したとき（AUTO能力引用） ----
  if (t.match(/このシグニが対戦相手のシグニ[１-９\d０-９]*体?をバニッシュしたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- カード名に〜を含むシグニを手札/エナ ----
  if (t.match(/あなたの場にカード名に《.+》を含むシグニがある場合、代わりに/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 選んだ数がNつの場合コストが変わる ----
  if (t.match(/選んだ数が[１-９\d０-９]+つの場合、このアーツの使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- それが〜の場合、追加でトラッシュ ----
  if (t.match(/それが.+のシグニの場合、追加でそれをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- ルリグのエクシード能力をコスト0で使用 ----
  if (t.match(/ルリグのエクシード(?:の値が[１-９\d０-９]+以下の)?能力[１-９\d０-９]*つをコストを支払わずに使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 対戦相手はライフクロスの一番上を公開する ----
  if (t.match(/対戦相手はライフクロスの一番上を公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- カードがLBを持たない場合トラッシュ ----
  if (t.match(/そのカードが【ライフバースト】を持たない場合、それをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 追加のアタックフェイズを加える ----
  if (t.match(/追加のアタックフェイズを加える/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- この方法でN枚以上公開/トラッシュした場合 ----
  if (t.match(/この方法でカードが[１-９\d０-９]+枚以上公開された場合/) ||
      t.match(/この方法でカードを[１-９\d０-９]+枚トラッシュに置いた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札からそれぞれ異なる色を持つシグニを好きな枚数捨てる ----
  if (t.match(/手札からそれぞれ異なる色を持つ.+シグニを好きな枚数捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このシグニは色を失い、宣言した色を得る ----
  if (t.match(/このシグニは色を失い、宣言した色を得る/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このカードをトラッシュからデッキ下に置く ----
  if (t.match(/^このカードをトラッシュからデッキの一番下に置く$/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手の場かエナゾーンからシグニをトラッシュ ----
  if (t.match(/対戦相手の、場かエナゾーンから.+シグニ[１-９\d０-９]*枚を対象とし、それをトラッシュに置く/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- レベルN〜Nについても同様に行う ----
  if (t.match(/レベル[１-９\d０-９]、レベル[１-９\d０-９].*についても同様に行う/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手ライフクロス上からカードを見る ----
  if (t.match(/対戦相手のライフクロスの上からカードを[１-９\d０-９]+枚見る/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- チェックゾーンに置き残りをライフに戻す ----
  if (t.match(/チェックゾーンに置き、残りを対戦相手のライフクロスの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- その中からN枚を【トラップ】として設置する ----
  if (t.match(/その中から[１-９\d０-９]*枚?まで?を【トラップ】として.*シグニゾーンに設置する/))
    return { type: 'STUB', id: 'TRAP_OP' } as StubAction;

  // ---- パワーをこの方法で捨てたシグニのパワーと同じだけ増減 ----
  if (t.match(/パワーをこの方法で捨てたシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_MIRROR' } as StubAction;

  // ---- 《レイヤーアイコン》の能力を得る ----
  if (t.match(/《レイヤーアイコン》の能力を得る/))
    return { type: 'STUB', id: 'GRANT_ABILITY_INNER_TEXT' } as StubAction;

  // ---- この下からカードをトラッシュに置いてもよい ----
  {
    const mUnder = t.match(/この下からカード([１-９\d０-９]*)枚をトラッシュに置いてもよい/);
    if (mUnder) {
      const count = mUnder[1] ? parseNum(mUnder[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count, upToCount: true, fromThis: true } as TakeFromUnderSigniAction;
    }
  }

  // ---- スペルがN種類以上ある場合 ----
  if (t.match(/スペルが[１-９\d０-９]+種類以上ある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この方法でシグニをN枚以上公開した場合 ----
  if (t.match(/この方法でシグニを[１-９\d０-９]+枚以上公開した場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札をすべて捨ててもよい ----
  if (t.match(/^あなたは手札をすべて捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- すべてのシグニを好きなように配置し直してもよい ----
  if (t.match(/すべてのシグニを、?好きなように配置し直してもよい/))
    return { type: 'STUB', id: 'SIGNI_REPOSITION' } as StubAction;

  // ---- 宣言されたカード名のカードが《サーバントZERO》になる ----
  if (t.match(/宣言されたカード名のカードは《サーバント.*》になる/))
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;

  // ---- ルリグデッキを分ける/束から選ぶ ----
  if (t.match(/ルリグデッキを裏向きで[１-９\d０-９]+つの束に分ける/) ||
      t.match(/どちらかの束を見て.*アーツ[１-９\d０-９]*枚をルリグトラッシュに置く/))
    return { type: 'STUB', id: 'CAST_FROM_OPP_TRASH' } as StubAction;

  // ---- そのカードのライフバーストを発動する ----
  if (t.match(/そのカードのライフバーストを発動する/))
    return { type: 'STUB', id: 'TRIGGER_LIFE_BURST' } as StubAction;

  // ---- トラップを表向きにして発動 / トラップアイコン発動 ----
  if (t.match(/【トラップ】.*表向きにし.*トラップアイコン.*発動してもよい/) ||
      t.match(/トラップアイコン》を発動させる/))
    return { type: 'STUB', id: 'TRAP_OP' } as StubAction;

  // ---- このターン終了時、手札をN枚捨てる ----
  if (t.match(/^このターン終了時、手札を[１-９\d０-９]+枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 2 } };

  // ---- プレイヤーを1人まで選ぶ ----
  if (t.match(/^プレイヤーを[１-９\d０-９]*人?まで選ぶ$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- 対戦相手のすべてのシグニをエナゾーンに置く（= 全バニッシュ）----
  if (t.match(/対戦相手のすべてのシグニをエナゾーンに置く/))
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } } as BanishAction;

  // ---- あなたの他の＜クラス＞のシグニ１体を場からトラッシュに置いてもよい ----
  if (t.match(/対象のあなたの他の[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*体?を場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- 手札から《特定カード》をN枚捨ててもよい（ターゲット指定後） ----
  if (t.match(/手札から《.+》を[１-９\d０-９]*枚?捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 各プレイヤーは手札からカードを公開する ----
  if (t.match(/各プレイヤーは手札からカードを[１-９\d０-９]*枚?公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- シグニが0枚の場合、何もしない） ----
  if (t.match(/シグニが[０0]枚の場合、何もしない[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手はシグニをN枚まで場に出す ----
  if (t.match(/対戦相手はその中からシグニを[１-９\d０-９]+枚まで場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 次のメインフェイズまでリミットが変わり〜 ----
  if (t.match(/次のあなたのメインフェイズまで.*リミットは/) ||
      t.match(/次のあなたのメインフェイズまで.*ダメージを受けない/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 手札がN枚以下の場合にしか使用できない ----
  if (t.match(/手札が[１-９\d０-９]+枚以下の場合にしか使用できない/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- にしか使用できない（汎用）----
  if (t.match(/にしか使用できない$/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- そのシグニを場に出し、公開されたカードをトラッシュ ----
  if (t.match(/そのシグニを場に出し、この方法で公開されたカードをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- その中から〈クラス〉シグニをN枚まで場に出す ----
  if (t.match(/その中から[＜〈<].+[＞〉>]のシグニを[１-９\d０-９]+枚まで場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 手札からカードをデッキの一番上に置く（好きな順番） ----
  {
    const mHDTop = t.match(/手札からカード([１-９\d０-９]+)枚(?:まで)?を(?:好きな順番で)?デッキの一番上に置く/);
    if (mHDTop) {
      const cnt = parseNum(mHDTop[1]);
      return { type: 'TRANSFER_TO_DECK', source: { type: 'HAND_CARD', owner: 'self', count: cnt }, shuffle: false, position: 'top' } as TransferToDeckAction;
    }
  }

  // ---- 対戦相手は数字を宣言する ----
  if (t.match(/^対戦相手は数字[１-９\d０-９]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- アーツ回数と宣言数字が異なる場合敗北 ----
  if (t.match(/アーツの回数が宣言した数字と異なる場合.*ゲームに敗北する/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキの上からシグニのレベルと同じ枚数をトラッシュ ----
  if (t.match(/デッキの上からそのシグニのレベルと同じ枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'TRASH_FROM_DECK_PER_SIGNI_LEVEL' } as StubAction;

  // ---- デッキからシグニを探して公開する ----
  if (t.match(/^あなたのデッキからシグニ[１-９\d０-９]*枚を探して公開する$/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- 場に出さない場合、トラッシュ ----
  if (t.match(/^場に出さない場合、それをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラッシュから場に出た場合、代わりにパワー変動 ----
  if (t.match(/トラッシュから場に出た場合、代わりに[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札をN枚捨ててもよい（任意） ----
  if (t.match(/^あなたは手札を[１-９\d０-９]+枚捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- デッキからシグニを探してもよい ----
  if (t.match(/あなたのデッキから.+シグニ[１-９\d０-９]*枚を探してもよい/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- このゲームの間の特殊効果 ----
  if (t.match(/このゲームの間、あなた(?:の場|のメイン|が)/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- このゲームの間、N回目の使用で ----
  if (t.match(/このゲームの間に.*[N回目].*である場合/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- このゲームの間（汎用フォールバック） ----
  if (t.match(/^このゲームの間、/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 残りをトラッシュに置く（単独文） ----
  if (t.match(/^残りをトラッシュに置く$/) || t.match(/^残りを好きな順番でデッキの一番下に置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 手札からカードをデッキ上/下に置く ----
  {
    const mHandDeck = t.match(/手札からカード([１-９\d０-９]*)枚?(まで)?をデッキの一番([上下])に置く/);
    if (mHandDeck) {
      const cnt = mHandDeck[1] ? parseNum(mHandDeck[1]) : 1;
      const up = !!mHandDeck[2];
      const pos = mHandDeck[3] === '上' ? 'top' : 'bottom';
      return { type: 'TRANSFER_TO_DECK', source: { type: 'HAND_CARD', owner: 'self', count: cnt, upToCount: up }, shuffle: false, position: pos } as TransferToDeckAction;
    }
  }

  // ---- あなたのターンの場合（条件付き効果） ----
  if (t.match(/^あなたのターンの場合、/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- アーツ/シグニ使用/バニッシュしたとき（AUTO内包テキスト） ----
  if (t.match(/あなたがアーツを使用したとき、このシグニを/) ||
      t.match(/このシグニが場を離れたとき/) ||
      t.match(/ドローフェイズ以外であなたがカードを[１-９\d０-９]*枚引いたとき/) ||
      t.match(/対戦相手のレベル[０-９\d０-９]+以下のシグニ[１-９\d０-９]*体?がこのシグニの正面.*出たとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- コスト支払いでシグニをトラッシュ（任意コスト形式） ----
  if (t.match(/《[白赤青緑黒無][^》]*》.*を支払い、このシグニを場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- バニッシュできなかった場合の注釈） ----
  if (t.match(/バニッシュできなかった場合は.*[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- レベルが偶数/奇数の場合 ----
  if (t.match(/レベルが(?:偶数|奇数)のシグニの場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札から〜捨てないかぎり ----
  if (t.match(/手札から.+捨てないかぎり/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対象のシグニをエナゾーンに置く（= バニッシュ相当）----
  if (t.match(/^対象の対戦相手のシグニ[１-９\d０-９]*体?をエナゾーンに置く$/)) {
    const cntM = t.match(/([１-９\d０-９]+)体/);
    const cnt = cntM ? parseNum(cntM[1]) : 1;
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as BanishAction;
  }

  // ---- デッキ公開して宣言した色のカードをエナゾーン ----
  if (t.match(/デッキの一番上を公開し、それが宣言した色を持つカードの場合.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 【シード】として場に出す ----
  if (t.match(/【シード】として.*シグニゾーンに出してもよい/) ||
      t.match(/【シード】として.*シグニゾーンに出すか/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 正面に加え両隣にもアタック（トリプルアタック） ----
  if (t.match(/正面に加えてその両隣のシグニゾーンにもアタックする/))
    return { type: 'STUB', id: 'MULTI_ZONE_ATTACK' } as StubAction;

  // ---- 追加ターン/追加フェイズのルール注釈 ----
  if (t.match(/この方法で追加されたターンの.+の間、あなたは/) ||
      t.match(/この方法で追加されたアタックフェイズ/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- センタールリグがNでない場合、カードをデッキに加える ----
  if (t.match(/センタールリグが.*でない場合.*デッキに加える/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- その中から赤/白/特定色シグニを場に出す ----
  if (t.match(/その中から(?:赤|白|青|緑|黒)のシグニ[１-９\d０-９]*枚を場に出し、残りをトラッシュに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 以下のN個を行う ----
  if (t.match(/^以下の[１-９\d０-９]+つを行う$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- グロウフェイズのコスト変化 ----
  if (t.match(/グロウフェイズの間.*エナコストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 《サーバントZERO》にする ----
  if (t.match(/を《サーバント.*》にする/))
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;

  // ---- コストの色を無視して支払える/支払う ----
  if (t.match(/コストの色を無視して支払(?:える|ってもよい)/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- トラッシュからすべてのカードをデッキに加えてもよい ----
  if (t.match(/トラッシュからすべてのカードをデッキに加えてもよい/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- センタールリグのレベル以下の数字を宣言 ----
  if (t.match(/センタールリグのレベル以下の数字[１-９\d０-９]*つを宣言する/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- プレイヤーはそこにシグニを配置できない） ----
  if (t.match(/シグニを配置できない[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手は手札をすべて捨てN枚引く ----
  if (t.match(/対戦相手は手札をすべて捨て.*枚.*カードを引く/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 対戦相手はデッキの一番下のカードをトラッシュ ----
  if (t.match(/対戦相手は(?:自分の)?デッキの一番下のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このシグニが場を離れる場合、代わりに裏向きに ----
  if (t.match(/このシグニが場を離れる場合、代わりに.*裏向きにしてもよい/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキの一番上か一番下に置く ----
  if (t.match(/デッキの一番上か一番下に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- シグニゾーンに配置してもよい ----
  if (t.match(/シグニゾーン[１-９\d０-９]*つに配置してもよい/))
    return { type: 'STUB', id: 'SIGNI_REPOSITION' } as StubAction;

  // ---- 各プレイヤーがシグニを場に出す ----
  if (t.match(/各プレイヤーは.*シグニを.*場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- シグニを裏向きにしてもよい ----
  if (t.match(/シグニ[１-９\d０-９]*体?(?:まで)?を対象とし、それらを裏向きにしてもよい/))
    return { type: 'STUB', id: 'SIGNI_FLIP_FACEDOWN' } as StubAction;

  // ---- シグニをエナゾーンからデッキ下に置いてもよい ----
  if (t.match(/このシグニをエナゾーンからデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- 正面にあったシグニをトラッシュ（単独文） ----
  if (t.match(/^正面にあったそのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラッシュから〜シグニを対象とし、手札を捨ててもよい ----
  if (t.match(/あなたのトラッシュから.*シグニ[１-９\d０-９]*枚を対象とし、手札を[１-９\d０-９]*枚捨ててもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- 手札からスペルN枚を公開してもよい ----
  if (t.match(/あなたの手札からスペル[１-９\d０-９]*枚を公開してもよい/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このターン終了時、手札とエナをすべてトラッシュ ----
  if (t.match(/このターン終了時、あなたの手札とエナゾーンにあるすべてのカードをトラッシュに置く/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- デッキ上N枚を見て表/裏束に分けて対戦相手がどちらかをトラッシュ ----
  if (t.match(/表向きの束にし、残りを裏向きの束にする/) ||
      t.match(/どちらかの束をトラッシュに置き.*残りの束を手札に加える/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手は手札を２枚捨ててもよい ----
  if (t.match(/^対戦相手は手札を[１-９\d０-９]+枚(?:まで)?捨ててもよい$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 《ガードアイコン》を持たないカードをデッキ下に ----
  if (t.match(/《ガードアイコン》を持たないカード[１-９\d０-９]*枚を選び.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手はシグニを好きな数選ぶ ----
  if (t.match(/^対戦相手は(?:自分の)?シグニを好きな数選ぶ$/))
    return { type: 'STUB', id: 'CHOOSE_N_FROM_LIST' } as StubAction;

  // ---- あなたのライフクロスN枚をトラッシュに置いてもよい ----
  if (t.match(/^あなたのライフクロス[１-９\d０-９]*枚をトラッシュに置いてもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のシグニを対象とし、手札をN枚捨てる（条件付き） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし、手札を[１-９\d０-９]*枚(?:まで)?捨てる$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- あなたのデッキをシャッフルしてもよい ----
  if (t.match(/^あなたのデッキをシャッフルしてもよい$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキを公開してシグニ場に出し残りをトラッシュ（各プレイヤー） ----
  if (t.match(/デッキの上から.*見て.*好きな枚数のシグニを場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のターン終了時、シグニを場からデッキ下に置いてもよい ----
  if (t.match(/対戦相手のターン終了時.*このシグニを場からデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このターン終了時、すべてのシグニを裏向きにする ----
  if (t.match(/このターン終了時.*すべてのシグニを裏向きにする/))
    return { type: 'STUB', id: 'SIGNI_FLIP_FACEDOWN' } as StubAction;

  // ---- デッキ一番上のカードを公開し（デッキ上確認系） ----
  if (t.match(/^このシグニがアップ状態の場合、あなたのデッキの一番上を公開してもよい$/) ||
      t.match(/^あなたのデッキの一番上を公開し、そのカードが宣言した.*場合.*手札に加える$/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手は手札をすべてルリグゾーンに裏向きで置く ----
  if (t.match(/対戦相手は手札をすべてルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 対戦相手はそれらのカードを手札に加える ----
  if (t.match(/^対戦相手はそれらのカードを手札に加える$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 次の対戦相手のアタックフェイズ開始時〜 ----
  if (t.match(/次の対戦相手のアタックフェイズ開始時/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 各プレイヤーは自分のデッキの一番上を公開する ----
  if (t.match(/各プレイヤーは自分のデッキの一番上のカードを公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- エナゾーンから白/色のシグニをデッキ上に置いてもよい ----
  if (t.match(/エナゾーンから.+のシグニ[１-９\d０-９]*枚をデッキの一番上に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- その中から色のカードをN枚まで選び手札に加えるかエナゾーンに置き残りをトラッシュ ----
  if (t.match(/その中から(?:白|赤|青|緑|黒)のカードを[１-９\d０-９]+枚まで選び.*手札に加えるかエナゾーンに置き/) ||
      t.match(/その中からすべての(?:白|赤|青|緑|黒)のカードを手札に加え/))
    return makeRevealPickStub(t);

  // ---- その中から色のカードをN枚まで公開し手札に加え残りをデッキ下 ----
  if (t.match(/その中から(?:白|赤|青|緑|黒)のカードを[１-９\d０-９]+枚まで公開し手札に加え.*デッキの一番下に置く/))
    return makeRevealPickStub(t);

  // ---- その中からすべての緑のカードをエナゾーンに置き残りをトラッシュ ----
  if (t.match(/その中からすべての(?:白|赤|青|緑|黒)のカードをエナゾーンに置き/))
    return makeRevealPickStub(t);

  // ---- 対戦相手のシグニを対象とし、パワーをN体/N枚につき変動 ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし.*パワーを.*につき[＋－][０-９\d０-９]+する/) ||
      t.match(/対戦相手のシグニを好きな数対象とし.*それらのパワーを合計で/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このターン〜スペルを使用していた場合 ----
  if (t.match(/このターンにあなたがスペルを使用していた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- その中からスペル１枚を公開し手札に加え残りをデッキ下 ----
  if (t.match(/その中からスペル[１-９\d０-９]*枚を公開し手札に加え.*デッキの一番下に置く/))
    return makeRevealPickStub(t);

  // ---- レベルN についても同様である） ----
  if (t.match(/レベル[１-９\d０-９]についても同様(?:である)?[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- その後、パワーをこの方法で場に出たシグニのパワーと同じだけ ----
  if (t.match(/パワーをこの方法で場に出たシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- そのシグニを場に出し、残りをトラッシュに置く ----
  if (t.match(/^そのシグニを場に出し、残りをトラッシュに置く$/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- エナゾーンのカードをすべてトラッシュに置いてもよい ----
  if (t.match(/エナゾーンにあるすべてのカードをトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたはそのカードを捨てさせてもよい / 対戦相手は〜捨てさせる ----
  if (t.match(/^あなたはそのカードを捨てさせてもよい$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- ライフクロスがN枚以下の場合コスト減 ----
  if (t.match(/ライフクロスが[１-９\d０-９]+枚以下の場合.*コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 手札がN枚以下の場合コスト減 ----
  if (t.match(/手札が[１-９\d０-９]+枚以下の場合.*コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 場にカード名を含むルリグがいる場合、以下のN個から選ぶ ----
  if (t.match(/場にカード名に《.+》を含む.*がいる場合、以下の[１-９\d０-９]+つから/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニの下にあるカード全てトラッシュ ----
  if (t.match(/このシグニの下にあるすべてのカードをトラッシュに置く/) ||
      t.match(/このシグニに付いている.*下に置かれているすべてのカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このシグニはそれと同じカードになる ----
  if (t.match(/このシグニはそれと同じカードになる/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 他のすべてのシグニをトラッシュに置く ----
  if (t.match(/^他のすべてのシグニをトラッシュに置く$/))
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL' } };

  // ---- このターン、あなたは他のシグニを場に出せない ----
  if (t.match(/このターン、あなたは他のシグニを場に出せない/) ||
      t.match(/このターン、あなたは[１以上０-９\d０-９]+のエナコストを支払えない/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- このシグニのパワーを自身の下にあるシグニのパワーの合計と同じだけ ----
  if (t.match(/このシグニのパワーを自身の下にあるすべてのシグニのパワーの合計と同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- デッキの一番下のカードを公開する ----
  if (t.match(/^あなたのデッキの一番下のカードを公開する$/))
    return { type: 'REVEAL' };

  // ---- そのカードを場に出すかトラッシュに置く ----
  if (t.match(/^そのカードを場に出すかトラッシュに置く$/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のライフクロスの一番上を公開する ----
  if (t.match(/^対戦相手のライフクロスの一番上を公開する$/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- それらのカードを入れ替えてもよい / カードとデッキ上カードを入れ替えてもよい ----
  if (t.match(/とデッキの一番上のカードを入れ替えてもよい/) ||
      t.match(/それらを好きな順番でデッキの一番上に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 手札を好きな枚数捨てる ----
  if (t.match(/^あなたは手札を好きな枚数捨てる$/) ||
      t.match(/^手札からシグニを好きな枚数捨てる$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 手札から〈クラス〉/特定カードを捨ててもよい（条件付き） ----
  if (t.match(/対戦相手のエナゾーンにカードが[１-９\d０-９]+枚以上ある場合、手札から/) ||
      t.match(/このターンにあなたが効果によってカードを[１-９\d０-９]+枚以上引いていた場合.*手札を/) ||
      t.match(/あなたの手札が[１-９\d０-９]+枚以上ある場合.*手札から/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- エナゾーンに置いてもよい（シグニ → エナ転換） ----
  if (t.match(/そのアタック終了時.*エナゾーンから.*シグニ.*場にあるこのシグニをエナゾーンに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対戦相手のデッキ上からN枚トラッシュ（条件付きN） ----
  if (t.match(/対戦相手のデッキの上からこの方法でダウンしたルリグのレベルの合計.*枚のカードをトラッシュ/) ||
      t.match(/対戦相手のデッキの上からカードを宣言した数字に等しい枚数トラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 〈クラス〉のシグニをN枚場に出しN枚エナゾーンに置く ----
  if (t.match(/その中からシグニを.*場に出し.*エナゾーンに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 赤、青、緑、黒についても同様に行う ----
  if (t.match(/赤、青、緑、黒についても同様に行う/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 次のターンの間、そのシグニゾーンにシグニを配置できない ----
  if (t.match(/次のターンの間、対戦相手はそのシグニゾーンにシグニを新たに配置できない/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- あなたの能力として発動する） ----
  if (t.match(/あなたの能力として発動する[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- これを取り除く（単独文） ----
  if (t.match(/^これを取り除く$/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- 手札をすべて捨ててもよい（全捨て任意） ----
  if (t.match(/^手札をすべて捨ててもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手は手札を裏向きでN束に分ける ----
  if (t.match(/対戦相手は手札を裏向きで[１-９\d０-９]+つの束に分ける/) ||
      t.match(/どちらかの束を選び、対戦相手はその束を捨てる/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- ライフクロスをすべて見て〜場に出すかエナゾーン ----
  if (t.match(/ライフクロスをすべて見て.*場に出すかエナゾーンに置き/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- カードをルリグゾーンに裏向きで置く ----
  if (t.match(/カードを[１-９\d０-９]*枚?まで?ルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 場に凍結状態/レゾナがない場合、手札を捨てる ----
  if (t.match(/場に.*がない場合、手札を[１-９\d０-９]*枚捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- カードをN枚引き、手札をN枚まで捨てる ----
  if (t.match(/カードを[１-９\d０-９]+枚引き、手札を[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のシグニを対象とし、それを他のシグニゾーンに配置してもよい ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし、それを他のシグニゾーン/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このシグニと同じシグニゾーンに〜がある場合 ----
  if (t.match(/このシグニと同じシグニゾーンに.*がある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それのレベルN につき手札を捨ててもよい ----
  if (t.match(/それのレベル[１-９\d０-９]につき手札を[１-９\d０-９]*枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 次にN以下のレベルを持つシグニによってダメージを受ける場合、代わりに ----
  if (t.match(/次に.*レベルを持つ対戦相手のシグニによってダメージを受ける場合、代わりにダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 発動後にデッキに加わった〜） (注釈） ----
  if (t.match(/発動後にデッキに加わった.*[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このアーツ/スペルを使用する際〜コストを支払ってもよい / 捨ててもよい ----
  if (t.match(/(?:このアーツ|このスペル)を使用する際.*(?:コスト.*支払(?:ってもよい|っていた場合)|捨ててもよい|取り除いてもよい)/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 『【常】：…を得る（長文引用） ----
  if (t.match(/^『【常】：/))
    return { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' } as StubAction;

  // ---- 手札から《ガードアイコン》を持つシグニを捨てる ----
  if (t.match(/手札から《ガードアイコン》を持つシグニを.+捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの場にあるシグニが持つ色がN種類以上ある場合 ----
  if (t.match(/あなたの場にあるシグニが持つ色が合計[１-９\d０-９]+種類以上ある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札/エナゾーンからカードをN枚エナゾーンに置く ----
  if (t.match(/^手札からカードを[１-９\d０-９]+枚エナゾーンに置く$/) ||
      t.match(/^手札からカードを[１-９\d０-９]+枚まで好きな順番でデッキの一番下に置く$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- その中から〈クラス〉のカードをN枚まで選びエナゾーンに置き残りをデッキ下 ----
  if (t.match(/その中から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]*枚?まで?エナゾーンに置き/) ||
      t.match(/その中から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]*枚?を?公開し手札に加え/))
    return makeRevealPickStub(t);

  // ---- 手札から〈クラス〉のカードをN枚公開してもよい ----
  if (t.match(/あなたの手札から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]*枚?まで?公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- それらのシグニがカード名と同じ場合、手札に加える ----
  if (t.match(/それらのシグニがそれぞれあなたの場にあるシグニと同じカード名の場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 残りをデッキに加えてシャッフルする ----
  if (t.match(/^残りをデッキに加えてシャッフルする$/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- このターン、このシグニはバトルしない ----
  if (t.match(/このシグニは、正面にアタックしている対戦相手のシグニとバトルしない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- ブースト（追加コスト形式の注釈） ----
  if (t.match(/^ブースト―《[白赤青緑黒無][^（)）]*》[（(（]このアーツを使用する際/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたがブーストしていた場合、ダメージを受けない ----
  if (t.match(/あなたがブーストしていた場合.*ダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- この方法でデッキに移動したカードの枚数＋Nを引く ----
  if (t.match(/この方法でデッキに移動したカードの枚数に[１-９\d０-９]+を加えた枚数のカードを引く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このターンにあなたがアーツを使用していた場合 ----
  if (t.match(/このターンにあなたがアーツを使用していた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 【起】〜シグニを捨てる：能力を得る（コスト形式） ----
  if (t.match(/^【起】《ターン[１-９\d０-９]*回》手札から.+捨てる：/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このターン、パワーN以上のシグニによってダメージを受けない ----
  if (t.match(/このターン、あなたはパワー[０-９\d０-９]+以上のシグニによってダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 対戦相手は偶数か奇数かを宣言する ----
  if (t.match(/^対戦相手は偶数か奇数かを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- このシグニが血晶武装状態の場合 ----
  // （ACTIVATED/AUTO効果内の条件分岐として parseSingleSentence へ到達した場合。
  //   通常は extractUseCondition / condition フィールドで処理されるためここには稀にしか来ない）
  if (t.match(/このシグニが血晶武装状態の場合、(.+)/s)) {
    const bodyM = t.match(/このシグニが血晶武装状態の場合、(.+)/s);
    if (bodyM) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'THIS_CARD_IS_ARMORED' },
        then: (parseSentencePart1(bodyM[1]) ?? parseSentencePart2(bodyM[1]) ?? { type: 'STUB', id: 'UNKNOWN_NESTED' } as EffectAction),
      } as ConditionalAction;
    }
  }

  // ---- そのカードがNのシグニの場合（レベル条件） ----
  if (t.match(/そのカードがレベル[１-９\d０-９]+のシグニの場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- あなたのシグニ１体に【ソウル】が付いたとき ----
  if (t.match(/【ソウル】が付いたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このゲームの間N回使用したのが〜回目である場合 ----
  if (t.match(/このゲームの間にあなたがこの【起】を使用したのが[１-９\d０-９]+回目である場合/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- レベル合計がNの場合〜 ----
  if (t.match(/レベルの合計が[１-９\d０-９]+の場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それを【シード】として出すかエナゾーンに置く ----
  if (t.match(/シード.*出すか.*エナゾーンに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のシグニがこのシグニの正面〜 (AUTO trigger) ----
  if (t.match(/対戦相手のシグニ.*がこのシグニの正面のシグニゾーンに出たとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- あなたの場にあるシグニの下からそれぞれレベルの異なるシグニをトラッシュ ----
  if (t.match(/このシグニの下からそれぞれレベルの異なるシグニ[１-９\d０-９]+枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 手札から〈クラス〉のシグニを好きな枚数/N枚捨てる（条件付きコスト） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし.*手札から[＜〈<].+[＞〉>]のシグニを[１-９\d０-９]+枚公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの場に共通する色を持つルリグがN体以上いる場合 ----
  if (t.match(/あなたの場に共通する色を持つルリグが[１-９\d０-９]+体以上いる場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- スペルの場合、対戦相手はそのカードを捨てる ----
  if (t.match(/^スペルの場合、対戦相手はそのカードを捨てる$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 対戦相手のセンタールリグが〜を得、〜パワーを下げる ----
  if (t.match(/対象の対戦相手のセンタールリグ[１-９\d０-９]*体?は.*アタックできない.*を得/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- コードN枚と〜１枚を公開する（特定カード名公開） ----
  if (t.match(/《[^》]+》[１-９\d０-９]*枚と《[^》]+》[１-９\d０-９]*枚を公開する/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 好きな生徒との絆を獲得する（デッキからカード選択） ----
  if (t.match(/好きな生徒.+との絆を獲得する/))
    return { type: 'GAIN_BOND', source: 'declared' } as import('../../types/effects').GainBondAction;

  // ---- この方法で公開した生徒との絆を獲得する ----
  if (t.match(/この方法で公開した生徒との絆を獲得する/))
    return { type: 'GAIN_BOND', source: 'last_found' } as import('../../types/effects').GainBondAction;

  // ---- あなたの場に他の〈クラス〉のシグニがある場合、対戦相手のシグニをトラッシュ ----
  if (t.match(/あなたの場に他の[＜〈<].+[＞〉>]のシグニがある場合、対戦相手のレベル.+のシグニ.+対象とし、それをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニが対戦相手の能力か効果の対象になったとき、裏向き/表向きにする ----
  if (t.match(/このシグニが対戦相手の.*対象になったとき.*裏向きにし、表向きにする/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- 手札から〈クラス〉のカードをN枚まで公開してもよい ----
  if (t.match(/あなたの手札から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚?まで(?:公開|捨て)(?:てもよい)?$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のアタックフェイズ開始時、手札から捨ててもよい ----
  if (t.match(/対戦相手のアタックフェイズ開始時、手札から.*捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- エナゾーンからカードをトラッシュに置いてもよい（条件付き） ----
  if (t.match(/あなたのエナゾーンから[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚までトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- ターン終了時、〜をトラッシュに置く ----
  if (t.match(/このターン終了時、それを場からトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラッシュからスペルを使用する ----
  if (t.match(/あなたのトラッシュからスペル[１-９\d０-９]*枚?まで?を対象とし、それを使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 〈クラス〉のシグニ１体につきパワーを変動 ----
  if (t.match(/のシグニ[１-９\d０-９]*体?につき[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 手札を公開してもよい ----
  if (t.match(/^あなたの手札を公開してもよい$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手はルリグデッキからカードを見てあなたが公開 ----
  if (t.match(/対戦相手は.*ルリグデッキからカード[１-９\d０-９]*枚を見ないで選び/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手はあなたの手札を見ないで選ぶ ----
  if (t.match(/対戦相手はあなたの手札を[１-９\d０-９]*枚見ないで選び/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- あなたの手札からスペルを公開してもよい ----
  if (t.match(/あなたの手札からスペルを[１-９\d０-９]*枚公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このターン次にルリグによってダメージを受ける場合受けない ----
  if (t.match(/このターン、次に.*ルリグによってダメージを受ける場合、代わりにダメージを受けない/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- このシグニをデッキの一番下に置いてもよい ----
  if (t.match(/^このシグニを場からデッキの一番下に置いてもよい$/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- そうした場合、それの効果を打ち消す ----
  if (t.match(/^そうした場合、それの効果を打ち消す$/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- 【起】コインN枚支払いの能力 ----
  if (t.match(/^【起】《ターン[１-９\d０-９]*回》手札から.*：【ルリグバリア】/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- ゲームN回のコイン技 ----
  if (t.match(/《ゲーム[１-９\d０-９]+回》を《ゲーム[１-９\d０-９]+回》にし/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 対戦相手の凍結シグニにつき手札を捨てる ----
  if (t.match(/対戦相手は.*凍結状態のシグニ[１-９\d０-９]*体?につき手札を[１-９\d０-９]*枚捨てる/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- あなたのターンの間、バトルしたとき〜 ----
  if (t.match(/あなたのターンの間、このシグニがバトルしたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このアーツによってルリグが得た能力 ----
  if (t.match(/このアーツによってあなたのルリグが得た能力は/))
    return { type: 'STUB', id: 'GRANT_LRIG_ABILITY' } as StubAction;

  // ---- 対戦相手のレベルN以下のシグニを対象とし手札から〜捨ててもよい ----
  if (t.match(/対戦相手のレベル[０-９\d０-９]+以[下上]のシグニ[１-９\d０-９]*体?を対象とし、手札から.*捨ててもよい/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 公開されたカードをシャッフルしてデッキ下に置く ----
  if (t.match(/^公開されたカードをシャッフルしてデッキの一番下に置く$/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手のシグニを好きな数対象とし、パワーを合計でN減らす ----
  if (t.match(/対戦相手のシグニを好きな数対象とし.*それらのパワーを合計で[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- あなたのデッキの一番下のカードをトラッシュに置く ----
  if (t.match(/^あなたのデッキの一番下のカードをトラッシュに置く$/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この方法でカードをN枚以上トラッシュに置いた場合 ----
  if (t.match(/この方法でカードを[１-９\d０-９]+枚以上トラッシュに置いた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- N枚以上トラッシュに置いた場合、追加で〜 ----
  if (t.match(/[１-９\d０-９]+枚以上トラッシュに置いた場合、追加で/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- その後、手札を１枚捨てる（単独文） ----
  if (t.match(/^その後、手札を[１-９\d０-９]+枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } };

  // ---- このシグニの下にあるカードをトラッシュに置く ----
  {
    const mUnder2 = t.match(/このシグニの下にある.*カード([１-９\d０-９]*)枚をトラッシュに置いてもよい/);
    if (mUnder2) {
      const count = mUnder2[1] ? parseNum(mUnder2[1]) : 1;
      return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count, upToCount: true, fromThis: true } as TakeFromUnderSigniAction;
    }
  }

  // ---- あなたのグロウフェイズ開始時〜 ----
  if (t.match(/^あなたのグロウフェイズ開始時/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 手札からスペルを好きな枚数捨てる ----
  if (t.match(/手札からスペルを好きな枚数捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- この方法であなたのセンタールリグのレベル以下のシグニがトラッシュに置かれた場合 ----
  if (t.match(/この方法であなたのセンタールリグのレベル以下のシグニがトラッシュに置かれた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のシグニ１体が場に出たとき（自動能力） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?が場に出たとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- そのシグニをトラッシュに置く（単独文） ----
  if (t.match(/^そのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- グロウする際、手札からシグニを公開してもよい ----
  if (t.match(/このカードにグロウする際、手札から.*シグニ.*を?公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの他のすべてのシグニをトラッシュに置く ----
  if (t.match(/^あなたの他のすべてのシグニをトラッシュに置く$/))
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL' } };

  // ---- この方法で手札を1枚捨てなかった場合、このシグニをトラッシュ ----
  if (t.match(/この方法で手札を[１-９\d０-９]+枚捨てなかった場合、このシグニを場からトラッシュに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このターン、次にスペルを使用するコストが変わる ----
  if (t.match(/このターン、あなたが次にスペルを使用する場合.*使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 各アタックフェイズ開始時、裏向きのシグニゾーンに〜場合 ----
  if (t.match(/各アタックフェイズ開始時、裏向きの.*場合/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- それを表向きにする（単独文） ----
  if (t.match(/^それを表向きにする$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手はあなたのライフクロスをN枚公開させる ----
  if (t.match(/対戦相手はあなたのルリグデッキからカード[１-９\d０-９]*枚を見ないで選び/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このターン、〜ライフバーストは発動しない ----
  if (t.match(/このターン、すべての領域にある.*シグニのトリガー能力は発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;

  // ---- 追加で《色》を支払っていた場合 ----
  if (t.match(/追加で《[白赤青緑黒無][^》]*》を支払っていた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この方法でグロウしたルリグの【出】能力は発動しない ----
  if (t.match(/この方法でグロウしたルリグの【出】能力は発動しない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手のルリグのレベルを－１する ----
  if (t.match(/対戦相手のルリグ[１-９\d０-９]*体?を対象とし.*それのレベルを[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- それらをエナゾーンからトラッシュに置く ----
  if (t.match(/^それらをあなたのエナゾーンからトラッシュに置く$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 〈レイラ〉コイン技ゲーム効果 ----
  if (t.match(/あなたの[＜〈<].+[＞〉>]が持つコイン技の《ゲーム[１-９\d０-９]+回》を/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 対戦相手のトラッシュからカードをデッキ上に ----
  if (t.match(/対戦相手のトラッシュからカードを[１-９\d０-９]+枚まで対象とし.*デッキの一番上に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 選ばれた各プレイヤーは手札をすべてデッキに加えてシャッフルし引く ----
  if (t.match(/選ばれた各プレイヤーは手札をすべてデッキに加えてシャッフルし/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- この効果によって各プレイヤーは最大N枚までしか引けない ----
  if (t.match(/この効果によって各プレイヤーは最大[１-９\d０-９]+枚までしかカードを引くことができない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- いずれかのプレイヤーがリフレッシュしていた場合 ----
  if (t.match(/いずれかのプレイヤーがリフレッシュしていた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 各ターン終了時、エナゾーンから対象とし自分をトラッシュ ----
  if (t.match(/各ターン終了時、対戦相手のエナゾーンからカード[１-９\d０-９]*枚を対象とし/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- 対戦相手の手札を見て無色ではないカードを選ぶ ----
  if (t.match(/対戦相手の手札を見て無色ではないカードを[１-９\d０-９]*枚?まで?選ぶ/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 公開したカードを手札に加える（単独文） ----
  if (t.match(/^公開したカードを手札に加える$/))
    return { type: 'ADD_TO_HAND', owner: 'self' };

  // ---- あなたのトラッシュから〈クラス〉のシグニをトラッシュ置き換えでシグニゾーンに ----
  if (t.match(/あなたのトラッシュから[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*枚を対象とし.*シグニ.*場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- エナゾーンのシグニをデッキ一番下に置いてもよい ----
  if (t.match(/あなたの[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*体?を場からデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 各プレイヤーは手札をすべてエナゾーンに置く ----
  if (t.match(/^各プレイヤーは手札をすべてエナゾーンに置く$/))
    return { type: 'STUB', id: 'MASS_TRASH' } as StubAction;

  // ---- この方法でカードを何枚かトラッシュ後、ライフを加える ----
  if (t.match(/この方法でカードを[１-９\d０-９]+枚以上捨てた場合.*ライフクロス/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- アタックフェイズ終了時〜（条件付き） ----
  if (t.match(/あなたのアタックフェイズ終了時.*場を離れていた場合.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 場に出さない場合、エナゾーンに置く ----
  if (t.match(/^《無》《無》を支払わなかった場合、それを手札に加える$/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- そのカードとエナゾーンにあるこのシグニを入れ替えてもよい ----
  if (t.match(/そのカードとエナゾーンにあるこのシグニを入れ替えてもよい/))
    return { type: 'STUB', id: 'SWAP_OPTIONAL' } as StubAction;

  // ---- あなたの効果によって対戦相手が手札を捨てたとき ----
  if (t.match(/あなたの効果によって対戦相手が手札を[１-９\d０-９]*枚捨てたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- チェックゾーンから《ガードアイコン》を持たないカードを手札に ----
  if (t.match(/チェックゾーンから《ガードアイコン》を持たないカードを[１-９\d０-９]*枚まで対象とし.*手札に加える/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- 対戦相手は自分の場からシグニとエナゾーンからカードを対象とする ----
  if (t.match(/対戦相手は自分の場からシグニ[１-９\d０-９]*体と自分のエナゾーンからカード[１-９\d０-９]*枚を対象とする/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- このシグニを【アクセ】にしてもよい ----
  if (t.match(/このシグニをそれの【アクセ】にしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 手札から〈クラス〉のシグニをN枚捨ててよい ----
  if (t.match(/その後、手札から[＜〈<].+[＞〉>]のシグニを[１-９\d０-９]+枚捨ててよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 残りをライフクロスの上に戻す ----
  if (t.match(/残りを好きな順番でライフクロスの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 引いた枚数と同じ枚数をデッキの下に置く ----
  if (t.match(/この方法で引いたカードの枚数と同じ枚数のカードを手札から.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 引いた枚数と同じ枚数を捨てる ----
  if (t.match(/この方法で引いた枚数と同じ枚数のカードを捨てる/))
    return { type: 'STUB', id: 'TRASH' } as StubAction;

  // ---- 手札から〈クラス〉シグニをN枚公開してもよい ----
  if (t.match(/手札から.*[＜〈<].+[＞〉>].*のシグニを[１-９\d０-９]+枚公開してもよい/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- トラッシュのスペルをコスト支払って/コストを支払わずに使用する ----
  if (t.match(/トラッシュにあるスペル.*使用する/) || t.match(/トラッシュからスペルを.*使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 正面のシグニをトラッシュに置いてもよい ----
  if (t.match(/正面のシグニ.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'BANISH' } as StubAction;

  // ---- N枚以上移動していた場合、代わりにN以上選ぶ ----
  if (t.match(/代わりに[１-９\d０-９２三四五六七八九]+つまで選ぶ/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- ～枚以上/ある場合、以下のN以上から選ぶ ----
  if (t.match(/以上.*場合、以下の.*から.*選ぶ/) || t.match(/以上ある場合、以下.*選ぶ/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- デッキを上から条件が満たされるまで公開してもよい ----
  if (t.match(/デッキを上から.*が[２-９\d]枚めくれるまで公開してもよい/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;
  if (t.match(/デッキを上から.*のレベルの合計が.*以上になるまで公開する/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;
  if (t.match(/デッキを上から.*のシグニが[１-９\d０-９]+枚めくれるまで公開/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- それの基本レベルを宣言した数字にする ----
  if (t.match(/それの基本レベルを宣言した数字にする/))
    return { type: 'STUB', id: 'DECLARE_CARD_NAME' } as StubAction;

  // ---- このターン、デッキにある〈X〉のシグニのレベルはNになる ----
  if (t.match(/このターン.*デッキにある.*のシグニのレベルは[０-９\d]+になる/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- その中から１枚をそれの下に置く ----
  if (t.match(/その中から[１-９\d０-９]*枚をそれの下に置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- ルリグトラッシュからアーツをコストを支払わずに使用する ----
  if (t.match(/ルリグトラッシュから.*アーツ.*コストを支払わずに.*使用する/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- 赤の場合、対戦相手のライフクロスをエナゾーンに置く ----
  if (t.match(/.*の場合、対戦相手のライフクロス.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- エナゾーンにレベルXシグニがそれぞれN枚以上ある場合、シグニをエナゾーンに置く ----
  if (t.match(/エナゾーンに.*のシグニがそれぞれ.*以上ある場合.*シグニ.*エナゾーンに置く/))
    return { type: 'STUB', id: 'ENERGY_LEVEL_CONDITION_CHOOSE' } as StubAction;

  // ---- 対戦相手のシグニのパワーが効果によって+される場合、代わりに-される ----
  if (t.match(/対戦相手のシグニのパワーが効果によって.*される場合、代わりに.*される/))
    return { type: 'STUB', id: 'REPLACE_PLUS_N' } as StubAction;

  // ---- それのパワーをこの方法でXのパワーと同じだけ±する ----
  if (t.match(/それのパワーをこの方法で.*のパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 対戦相手は手札を〜チェックゾーンに置く ----
  if (t.match(/対戦相手は手札を.*チェックゾーンに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- それのレベルをこの方法で公開されたシグニのレベルと同じだけ-する ----
  if (t.match(/それのレベルをこの方法で.*のレベルと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- この方法で〈X〉のシグニがN種類公開された場合 ----
  if (t.match(/この方法で.*のシグニが[１-９\d０-９]+種類公開された場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- この効果をセンタールリグのレベルと同じ回数行う ----
  if (t.match(/この効果を.*センタールリグのレベルと同じ回数行う/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- この方法でデッキにカードをN枚以上加えた場合 ----
  if (t.match(/この方法でデッキにカードを[１-９\d０-９]+枚以上加えた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このカードにグロウする際、手札からシグニをN枚まで公開する ----
  if (t.match(/このカードにグロウする際、手札から.*公開する/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- 使用コストはセンタールリグのレベルにつきN減る ----
  if (t.match(/使用コストは.*センタールリグのレベル.*減る/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- ベットしていなかった場合、次のターンをスキップする ----
  if (t.match(/ベットしていなかった場合.*ターンをスキップする/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- 対象のシグニは選んだ能力を得る ----
  if (t.match(/対象のシグニ.*選んだ能力を得る/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- あなたがベットしていた場合（繰り返す・代わりに等） ----
  if (t.match(/あなたがベットしていた場合/))
    return { type: 'STUB', id: 'BET_CONDITION' } as StubAction;

  // ---- シグニがトラッシュから場に出たとき、払い、トラッシュに置いてもよい ----
  if (t.match(/のシグニ.*がトラッシュから場に出たとき.*払い.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このターン、あなたは《X》を使用できない ----
  {
    const m = t.match(/このターン、あなたは《(.+)》を使用できない/);
    if (m) return { type: 'BLOCK_CARD_USE', cardName: m[1] } as BlockCardUseAction;
  }

  // ---- その後、それをクラッシュしてもよい ----
  if (t.match(/それをクラッシュしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキからカードN枚を探す ----
  if (t.match(/あなたのデッキからカード[１-９\d０-９]*枚を探す/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- 好きな枚数の無色ではないシグニを場に出し、残りをトラッシュに置く ----
  if (t.match(/好きな枚数の無色ではないシグニを場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- それぞれレベルの異なるシグニをN枚まで捨てる ----
  if (t.match(/それぞれレベルの異なるシグニを[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'TRASH' } as StubAction;

  // ---- 代わりにN枚まで対象とし、それらを手札に加える ----
  if (t.match(/代わりに[１-９\d０-９]+枚まで対象とし、それらを手札に加える/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニが中央のシグニゾーンにある場合 ----
  if (t.match(/このシグニが中央のシグニゾーンにある場合/))
    return { type: 'STUB', id: 'CENTER_ZONE_CONDITION' } as StubAction;

  // ---- このターンにアタックしたシグニを対象とし、キーをルリグトラッシュに置いてもよい ----
  if (t.match(/このターンにアタックしたシグニを.*対象とし.*ルリグトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- トラッシュにある〈X〉のシグニN枚につき±Nする ----
  if (t.match(/トラッシュにある.*のシグニ[１-９\d０-９]+枚につき/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- シグニゾーンにシグニがある場合、手札に戻してから開花する ----
  if (t.match(/シグニゾーンにシグニがある場合.*手札に戻してから開花する/))
    return { type: 'STUB', id: 'LRIG_GROW_RESTRICT' } as StubAction;

  // ---- それぞれレベルの異なるシグニN枚が公開された場合、追加で ----
  if (t.match(/それぞれレベルの異なるシグニ[１-９\d０-９]+枚が公開された場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札がN枚より多い場合、その差の分だけ手札からカードをエナゾーンに置く ----
  if (t.match(/手札が[１-９\d０-９]+枚より多い場合、その差.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のトラッシュから〜デッキの一番下に置く ----
  if (t.match(/対戦相手のトラッシュから.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対象のシグニを他のシグニゾーンに配置してもよい ----
  if (t.match(/対象のシグニ.*他のシグニゾーンに配置してもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 指定されたシグニゾーンにあるシグニのパワーをそのシグニのレベルにつきNする ----
  if (t.match(/指定されたシグニゾーンにあるシグニのパワーを.*レベル.*につき/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- チャームをトラッシュに置いてもよい（コスト支払い） ----
  if (t.match(/【チャーム】.*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 残りを好きな順番でデッキの一番上に置く ----
  if (t.match(/^残りを好きな順番でデッキの一番上に置く$/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- それらのパワーを合わせて－Nする ----
  if (t.match(/それらのパワーを合わせて[－-][０-９\d]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- センタールリグと共通する色を持つすべてのカードをエナゾーンに置き ----
  if (t.match(/センタールリグと共通する色を持つすべてのカードをエナゾーンに置き/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- レベルNのシグニの場合、手札をN枚捨てる ----
  if (t.match(/レベル[０-９\d]+のシグニの場合、あなたは手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'LEVEL_BASED_CONDITIONAL' } as StubAction;

  // ---- それがスペルの場合、コストを支払わずに使用してもよい ----
  if (t.match(/それがスペルの場合.*コストを支払わずに使用してもよい/))
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;

  // ---- この方法でカードがN枚トラッシュに置かれた場合 ----
  if (t.match(/この方法でカードが[１-９\d０-９]+枚トラッシュに置かれた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- あなたと対戦相手のデッキの一番下のカードをトラッシュに置く ----
  if (t.match(/あなたと対戦相手のデッキの一番下のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- このアーツの使用コストは選んだ数だけ増える ----
  if (t.match(/このアーツの使用コストは選んだ数だけ.*増える/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 対戦相手は手札を公開する ----
  if (t.match(/^対戦相手は手札を公開する$/))
    return { type: 'STUB', id: 'PEEP_HAND' } as StubAction;

  // ---- それを対戦相手のデッキの一番下に置いてもよい ----
  if (t.match(/それを対戦相手のデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- シグニを〜体まで対象とし、それらを裏向きにしてもよい ----
  if (t.match(/シグニを[１-９\d０-９]+体まで対象とし.*裏向きにしてもよい/))
    return { type: 'STUB', id: 'SIGNI_FLIP_FACEDOWN' } as StubAction;

  // ---- この方法でシグニを手札に加えた場合、手札をN枚捨てる ----
  if (t.match(/この方法でシグニを手札に加えた場合、手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- デッキの上からカードをN枚を見る（重複「を」) ----
  if (t.match(/デッキの上からカードを[１-９\d０-９]+枚を見る/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- スペルを使用する場合、コストに含まれるエナコストを代わりに《無》として支払ってもよい ----
  if (t.match(/スペルを使用する場合.*代わりに《無》として支払ってもよい/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- そのカードと対戦相手のデッキの一番上のカードを入れ替えてもよい ----
  if (t.match(/そのカードと.*デッキの一番上のカードを入れ替えてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキの上からカードをN枚トラッシュに置きカードをN枚見る ----
  if (t.match(/デッキの上から、?カードを[１-９\d０-９]+枚トラッシュに置きカードを[１-９\d０-９]+枚見る/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 見たカードの中から《X》を〜ダウン状態で場に出し、残りをデッキの一番下に置く ----
  if (t.match(/見たカードの中から.*場に出し.*残りを.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 《ガードアイコン》を持たないカード〜デッキの一番下に置いてもよい ----
  if (t.match(/《ガードアイコン》を持たないカード.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 手札〜ルリグゾーンに裏向きで置く ----
  if (t.match(/手札.*ルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- 次の対戦相手のターン終了時、そのカードを手札に加える ----
  if (t.match(/次の対戦相手のターン終了時、そのカードを手札に加える/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- メインフェイズの間、デッキからシグニがトラッシュに置かれたとき、場に出す ----
  if (t.match(/メインフェイズの間.*デッキから.*シグニ.*がトラッシュに置かれたとき.*場に出す/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- デッキをシャッフルし一番上のカードを公開し手札に加える ----
  if (t.match(/デッキをシャッフルし.*一番上のカードを公開し手札に加える/))
    return { type: 'STUB', id: 'DRAW' } as StubAction;

  // ---- 対戦相手のシグニ〜体を対象とし、以下からN以上選ぶ ----
  if (t.match(/対戦相手のシグニ.*体を対象とし、以下から[１-９\d０-９]*つを選ぶ/))
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE' } as StubAction;

  // ---- 〈X〉のシグニをN枚捨てるか手札をN枚捨てる ----
  if (t.match(/のシグニを[１-９\d０-９]+枚捨てるか手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このカードが捨てられたとき、手札を〜してもよい ----
  if (t.match(/このカードが捨てられたとき/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- アタックフェイズの間、エナコストを支払う際、シグニの下のカードをトラッシュに置いて支払える ----
  if (t.match(/アタックフェイズの間.*エナコストを支払う際.*シグニの下にあるカードを.*トラッシュに置いて支払える/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- この方法でエナコストはNターンにN以上しか支払えない ----
  if (t.match(/この方法でエナコストは.*ターンに.*しか支払えない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このシグニの下にあったカードをトラッシュからエナゾーンに置く ----
  if (t.match(/このシグニの下にあったカード.*エナゾーンに置く/))
    return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'energy', count: 9, upToCount: true, fromThis: true } as TakeFromUnderSigniAction;

  // ---- 《ガードアイコン》を持たないシグニをデッキに加えてもよい ----
  if (t.match(/《ガードアイコン》を持たないシグニを.*枚まで.*デッキに加えてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキの一番上のカードを公開し宣言したレベルのシグニの場合手札に加える ----
  if (t.match(/デッキの一番上のカードを公開し.*宣言した.*レベルのシグニの場合.*手札に加える/))
    return { type: 'STUB', id: 'REVEAL_AND_PICK' } as StubAction;

  // ---- デッキの上からそれのレベルと同じ枚数のカードをトラッシュに置く ----
  if (t.match(/デッキの上からそれのレベルと同じ枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 正面にシグニがない場合、そのアタックを無効にしてもよい ----
  if (t.match(/正面にシグニがない場合、そのアタックを無効にしてもよい/))
    return { type: 'STUB', id: 'NEGATE_ATTACK_ON_TRIGGER' } as StubAction;

  // ---- スペルを使用したとき、手札を捨ててもよい ----
  if (t.match(/スペルを使用したとき.*手札を.*枚捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このカードを捨てたとき、手札を捨ててもよい ----
  if (t.match(/このカードを捨てたとき.*手札を.*枚捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このシグニの下からカードを好きな枚数トラッシュに置く ----
  if (t.match(/このシグニの下からカードを好きな枚数トラッシュに置く/))
    return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count: 9, upToCount: true, fromThis: true } as TakeFromUnderSigniAction;

  // ---- そうしなかった場合、次のドローフェイズの間にカードを合計N枚までしか引けない ----
  if (t.match(/そうしなかった場合.*次の.*ドローフェイズの間.*引けない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- そのカードをデッキに加えてシャッフルしてもよい ----
  if (t.match(/そのカードをデッキに加えてシャッフルしてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 《ディソナアイコン》のカードをN枚捨ててもよい ----
  if (t.match(/《ディソナアイコン》のカードを[１-９\d０-９]*枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のエナゾーンにカードがN枚以上ある場合、シグニの下から〜トラッシュに置いてもよい ----
  if (t.match(/対戦相手のエナゾーンにカードが[１-９\d０-９]+枚以上ある場合.*シグニの下から.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'CONDITIONAL_TRASH_UNDER_SIGNI' } as StubAction;

  // ---- このターン終了時、《コインアイコン》を合計N枚以上支払っていなかった場合 ----
  if (t.match(/このターン終了時.*《コインアイコン》を合計[１-９\d０-９]+枚以上支払っていなかった場合/))
    return { type: 'STUB', id: 'COIN_SPEND_CONDITION' } as StubAction;

  // ---- 対戦相手のレベルN以上のシグニをトラッシュに置く ----
  if (t.match(/対戦相手のレベル[０-９\d]+以上のシグニ.*体を対象とし.*トラッシュに置く/))
    return { type: 'STUB', id: 'BANISH' } as StubAction;

  // ---- そのカードが《X》の場合、この効果を繰り返す ----
  if (t.match(/そのカードが《.+》の場合、この効果を繰り返す/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それらのカードを好きな順番でデッキの一番上に戻す ----
  if (t.match(/それらのカードを好きな順番でデッキの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- 対戦相手の効果によって〜が場を離れる場合、〜行ってもよい ----
  if (t.match(/対戦相手の効果によって.*が場を離れる場合.*行ってもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- バトルによってシグニをバニッシュしたとき、〜捨ててもよい ----
  if (t.match(/バトルによってシグニ.*をバニッシュしたとき.*捨ててもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このターンにあなたが手札からXのカードをN枚以上捨てていた場合 ----
  if (t.match(/このターンにあなたが手札から.*カードを[１-９\d０-９]+枚以上捨てていた場合/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- パワーをこの方法でデッキに移動したシグニのパワーと同じだけ±する ----
  if (t.match(/パワーをこの方法でデッキに移動したシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- このアーツを使用する際、ライフクロスをトラッシュに置いてもよい ----
  if (t.match(/このアーツを使用する際.*ライフクロス.*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このアーツを使用する際、手札からパワーN以上のシグニをN枚まで捨てる ----
  if (t.match(/このアーツを使用する際.*手札からパワー[０-９\d]+以上のシグニを.*枚まで捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- デッキの一番上を見て、裏向きでルリグゾーンに置く ----
  if (t.match(/デッキの一番上を見て.*裏向きでルリグゾーンに置く/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- 場に〈X〉のシグニがある場合、カードを引き、対戦相手のデッキの一番上を公開する ----
  if (t.match(/場に.*のシグニがある場合.*カードを.*引き.*対戦相手のデッキの一番上を公開する/))
    return { type: 'STUB', id: 'FIELD_COND_DRAW_REVEAL' } as StubAction;

  // ---- デッキの一番上のカードをトラッシュに置いてもよい ----
  if (t.match(/^あなたのデッキの一番上のカードをトラッシュに置いてもよい$/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対戦相手の手札をN枚見ないで選び、公開させる ----
  if (t.match(/対戦相手の手札を[１-９\d０-９]*枚見ないで選び/))
    return { type: 'STUB', id: 'PEEP_HAND' } as StubAction;

  // ---- 場にそのカードと共通する色を持つルリグがいる場合、捨てさせる ----
  if (t.match(/場にそのカードと共通する色を持つルリグがいる場合.*捨てさせる/))
    return { type: 'STUB', id: 'REVEALED_CARD_COLOR_DISCARD' } as StubAction;

  // ---- 手札からカードをN枚まで好きな順番でデッキの一番下に置く ----
  if (t.match(/手札からカードを[１-９\d０-９]+枚まで好きな順番でデッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- シグニによってダメージを受ける場合、代わりに手札を捨ててもよい ----
  if (t.match(/シグニによってダメージを受ける場合、代わりに手札を.*捨ててもよい/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 〈X〉のシグニN体を対象とし、以下のN以上から選ぶ ----
  if (t.match(/のシグニ[１-９\d０-９]*体を対象とし、以下の[１-９\d０-９]*つから[１-９\d０-９]*つを選ぶ/))
    return { type: 'STUB', id: 'TARGET_SIGNI_CHOOSE' } as StubAction;

  // ---- 手札からカードをN枚まで裏向きでルリグゾーンに置く ----
  if (t.match(/手札からカードを[１-９\d０-９]*枚まで裏向きでルリグゾーンに置く/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- この方法でダウンしたルリグのレベルの合計に〜カードをトラッシュに置く ----
  if (t.match(/この方法でダウンしたルリグのレベルの合計に.*枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- それがレベルN以下の場合、代わりにそれをトラッシュに置く ----
  if (t.match(/それがレベル[０-９\d]+以下の場合、代わりにそれをトラッシュに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手の【Xトークン名】を好きな数取り除いてもよい ----
  if (t.match(/対戦相手の【.+】を好きな数取り除いてもよい/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- アタック終了時、このシグニを場から〜に置いてもよい ----
  if (t.match(/そのアタック終了時.*このシグニを場から.*に置いてもよい/))
    return { type: 'STUB', id: 'GRANT_QUOTED_AUTO_ABILITY' } as StubAction;

  // ---- このアーツを使用する際に〈X〉のカードをトラッシュに置いていた場合 ----
  if (t.match(/このアーツを使用する際に.*のカード.*枚をトラッシュに置いていた場合/))
    return { type: 'STUB', id: 'ARTS_EXTRA_COST_CONDITION' } as StubAction;

  // ---- 手札から色の〈X〉のカードをN枚まで捨てる ----
  if (t.match(/手札から.*の[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 〈X〉のシグニを対象とし、トラッシュからそれぞれレベルの異なる〈X〉のシグニN枚をデッキの一番下に置いてもよい ----
  if (t.match(/のシグニ.*を対象とし.*トラッシュからそれぞれレベルの異なる.*のシグニ.*枚を.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LOOK_AND_REORDER' } as StubAction;

  // ---- この方法でトラッシュに置いたカードの中からカードをN枚まで対象とし、エナゾーンに置く ----
  if (t.match(/この方法でトラッシュに置いたカードの中からカードを.*枚まで対象とし.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 場に《X》がいる場合、色を宣言し、エナゾーンから宣言した色を持つカードをトラッシュに置いてもよい ----
  if (t.match(/場に《.+》がいる場合.*色.*宣言し.*エナゾーンから.*カード.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'DECLARE_COLOR_COND_ENERGY_TRASH' } as StubAction;

  // ---- 手札から白/赤/青/緑/黒のカードをN枚捨ててもよい ----
  if (t.match(/手札から[白赤青緑黒]のカードを[１-９\d０-９]+枚捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 場に《X》がいる場合、対戦相手のシグニを対象とし〜捨ててもよい ----
  if (t.match(/場に《.+》がいる場合.*対戦相手.*シグニ.*捨ててもよい/))
    return { type: 'STUB', id: 'USE_CONDITION_TEXT' } as StubAction;

  // ---- 手札をN枚以上捨てた場合、追加でライフクロス〜デッキの一番下に置く ----
  if (t.match(/手札を[１-９\d０-９]+枚以上捨てた場合.*ライフクロス.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このメインフェイズを終了する ----
  if (t.match(/^このメインフェイズを終了する$/))
    return { type: 'STUB', id: 'SKIP_MAIN_PHASE' } as StubAction;

  // ---- コストの合計は0以下にならない（ルール注釈）----
  if (t.match(/使用コストの合計は[０0]以下にならない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- すべてのプレイヤーはドローフェイズにN枚までしか引けない ----
  if (t.match(/すべてのプレイヤーはドローフェイズの間にカードを合計[０-９\d]+枚までしか引けない/))
    return { type: 'STUB', id: 'LIMIT_OPP_DRAW_COUNT' } as StubAction;

  // ---- 【マルチエナ】常時能力 ----
  if (t.match(/^(?:【常】：)?【マルチエナ】。?$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手のライフクロスを手札に加えさせる ----
  if (t.match(/対戦相手のライフクロス[１-９\d０-９]*枚?を手札に加えさせる/))
    return { type: 'STUB', id: 'CRASH_LIFE_TO_HAND' } as StubAction;

  // ---- このカードをエナゾーンから手札に加えてもよい ----
  if (t.match(/このカードをエナゾーンから手札に加えてもよい/))
    return { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1 } };

  // ---- その中から１枚をエナゾーンに置く ----
  if (t.match(/^その中から[１-９\d０-９]*枚?をエナゾーンに置く$/) || t.match(/^追加でそれをエナゾーンに置く$/))
    return { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction;

  // ---- 数字/クラス/色を宣言する（種別選択）----
  if (t.match(/^(?:その後、)?クラス[１-９\d０-９]*つを宣言する$/) || t.match(/^クラス[１-９\d０-９]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_CLASS' } as StubAction;
  if (t.match(/^(?:その後、)?色[１-９\d０-９]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_COLOR' } as StubAction;

  // ---- N体まで対象とする / シグニ１体を対象とする（単独） ----
  if (t.match(/^シグニ[１-９\d０-９]*体?を対象とする$/) || t.match(/^対戦相手のルリグかシグニ[１-９\d０-９]*体?を対象とする$/))
    return { type: 'STUB', id: 'TARGET_ONLY' } as StubAction;

  // ---- それを裏向きにする ----
  if (t.match(/^それ(?:ら)?を裏向きにする(?:もよい)?$/))
    return { type: 'STUB', id: 'SIGNI_FLIP_FACEDOWN' } as StubAction;

  // ---- N個を選ぶ（CHOOSE断片）----
  if (t.match(/^[１-９\d０-９]+つ(?:まで)?選ぶ$/))
    return { type: 'STUB', id: 'CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE' } as StubAction;

  // ---- 引用符付き常時能力を得る（「【常】：〜」）----
  if (t.match(/^「【常】：.+」$/) || t.match(/^「【常】：.+。」$/))
    return { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' } as StubAction;

  // ---- ① / ② を行う（番号付き効果フラグメント）----
  if (t.match(/^[①②③④⑤]を行う$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- それらをルリグトラッシュに置く ----
  if (t.match(/^それらをルリグトラッシュに置く$/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- それをルリグデッキに加える ----
  if (t.match(/^それをルリグデッキに加える$/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- このカードをセンタールリグの下に置く ----
  if (t.match(/このカードをあなたのセンタールリグの下に置く/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- 手札シグニへのガードアイコン付与 ----
  if (t.match(/このターン.*手札にあるシグニは《ガードアイコン》を得る/))
    return { type: 'STUB', id: 'GRANT_GUARD_ICON_HAND_SIGNI' } as StubAction;

  // ---- すべてのシグニパワーを２倍 ----
  if (t.match(/すべてのシグニのパワーを[２-９]倍/))
    return { type: 'STUB', id: 'POWER_DOUBLE_ALL' } as StubAction;

  // ---- コスト支払いエナの色選択 ----
  if (t.match(/使用コストで支払われたエナ.*色.*選択/))
    return { type: 'STUB', id: 'COST_COLOR_SELECT' } as StubAction;

  // ---- 公開されたシグニを場に出し残りをトラッシュ ----
  if (t.match(/公開されたシグニを場に出し.*残り.*トラッシュに置く/))
    return { type: 'STUB', id: 'REVEALED_SIGNI_TO_FIELD_REST_TRASH' } as StubAction;

  // ---- この効果をN回繰り返す ----
  if (t.match(/(?:この効果|このアーツの効果)を(?:あと)?[０-９\d一]*[回度](?:まで)?繰り返[すし](?:て)?(?:もよい)?/))
    return { type: 'STUB', id: 'REPEAT_EFFECT' } as StubAction;

  // ---- クラスレベル合計によるパワー変更 ----
  if (t.match(/シグニのレベルを合計した数だけ[－＋]/))
    return { type: 'STUB', id: 'POWER_MOD_BY_FIELD_CLASS_LEVEL' } as StubAction;

  // ---- 手札からクラスシグニを公開 ----
  if (t.match(/手札から(?:好きな枚数の)?[＜《].*[＞》].*シグニ.*を公開する/) ||
      t.match(/対戦相手のシグニ.*を対象とし.*手札から.*シグニを公開する/))
    return { type: 'STUB', id: 'HAND_REVEAL_CLASS_SIGNI' } as StubAction;

  // ---- その後、特定カードを公開してもよい ----
  if (t.match(/手札から《.*》[０-９\d]*枚を公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_HAND_REVEAL_NAMED' } as StubAction;

  // ---- シグニに隣接するシグニのパワー修正 ----
  if (t.match(/このシグニと隣接する.*パワー/))
    return { type: 'STUB', id: 'ADJACENT_SIGNI_POWER_MOD' } as StubAction;

  // ---- 場にクラスシグニがある場合の代替効果 ----
  if (t.match(/あなたの場に＜.*＞のシグニがある場合.*代わり/))
    return { type: 'STUB', id: 'CONDITIONAL_ALTERNATE_EFFECT' } as StubAction;

  // ---- グリッド固有テキスト ----
  if (t.match(/グリッド固有/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- チャーム条件付きパワー変更 ----
  if (t.match(/【チャーム】が付いている場合.*[－＋]/))
    return { type: 'STUB', id: 'CHARM_CONDITIONAL_POWER' } as StubAction;

  // ---- 緑/青/黒カードを色別にエナまたはトラッシュへ ----
  if (t.match(/その中から.*(?:緑|青|黒|白|赤)の.*カード.*(?:エナゾーンに置き|手札に加え).*残り.*(?:トラッシュ|デッキ)/))
    return { type: 'STUB', id: 'LOOK_TOP_COLOR_SORT' } as StubAction;

  // ---- デッキの一番上を公開し条件でルートへ ----
  if (t.match(/デッキの一番上を公開し.*シグニの場合/))
    return { type: 'STUB', id: 'REVEAL_TOP_CONDITIONAL_ROUTE' } as StubAction;

  // ---- クロスアイコン条件で手札に加える ----
  if (t.match(/《クロスアイコン》を持つシグニの場合.*手札に加える/))
    return { type: 'STUB', id: 'REVEAL_TOP_CONDITIONAL_ROUTE' } as StubAction;

  // ---- 次のターン間、対戦相手のシグニゾーン配置禁止 ----
  if (t.match(/対戦相手は.*シグニゾーン.*シグニを新たに配置することができない/))
    return { type: 'STUB', id: 'BLOCK_OPP_ZONE_PLACEMENT' } as StubAction;

  // ---- センタールリグの【出】能力を発動しない ----
  if (t.match(/センタールリグの【出】能力は発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_CENTER_ON_PLAY' } as StubAction;

  // ---- このターン、シグニは新たに能力を得られない ----
  if (t.match(/このターン.*シグニは新たに能力を得られない/))
    return { type: 'STUB', id: 'SUPPRESS_GAIN_ABILITY' } as StubAction;

  // ---- その中からすべてのスペルを手札に加え ----
  if (t.match(/その中からすべてのスペルを手札に加え/))
    return { type: 'STUB', id: 'LOOK_TOP_SPELLS_TO_HAND' } as StubAction;

  // ---- その中からシグニを場に出し残りを手札 ----
  if (t.match(/その中から.*シグニを.*場に出し.*残り.*手札に加える/))
    return { type: 'STUB', id: 'LOOK_TOP_SIGNI_TO_FIELD' } as StubAction;

  // ---- その中から好きな枚数をデッキ上に戻し残りをデッキ下 ----
  if (t.match(/その中から.*デッキの一番上に戻し.*残り.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_TOP_SORT' } as StubAction;

  // ---- その中から対戦相手の選んだカードをトラッシュ、残りを手札 ----
  if (t.match(/対戦相手の選んだカード.*トラッシュに置き.*残り.*手札に加える/))
    return { type: 'STUB', id: 'LOOK_TOP_OPP_CHOOSE_TRASH' } as StubAction;

  // ---- その中からN枚チェックゾーンへ残りを手札 ----
  if (t.match(/その中から.*チェックゾーンに置き.*残り.*手札に加える/))
    return { type: 'STUB', id: 'TRAP_OPERATION' } as StubAction;

  // ---- トラップ/チェックゾーン操作 ----
  if (t.match(/【トラップ】として.*設置/) || t.match(/チェックゾーン(?:に?置|から|を離れ|のライフ|置いた)/) ||
      t.match(/トラップ能力を得て/))
    return { type: 'STUB', id: 'TRAP_OPERATION' } as StubAction;

  // ---- ライフバーストをチェックゾーン扱いで発動 ----
  if (t.match(/ライフバーストを.*チェックゾーンにあるかのように発動/))
    return { type: 'STUB', id: 'TRAP_OPERATION' } as StubAction;

  // ---- グロウコスト０ ----
  if (t.match(/このカードにグロウするためのコストは.*×0》になる/))
    return { type: 'STUB', id: 'GROW_COST_ZERO' } as StubAction;

  // ---- ルリグトラッシュからルリグをセンター下へ ----
  if (t.match(/ルリグトラッシュから.*センタールリグの下に置(?:く|いてもよい)/))
    return { type: 'STUB', id: 'SOUL_OP' } as StubAction;

  // ---- すべての領域でクラスとして扱う ----
  if (t.match(/このカードはすべての領域で.*として扱う/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- デッキを効果参照でレベルN扱い ----
  if (t.match(/デッキかトラッシュにあるかぎり.*レベル.*として扱ってもよい/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 無色シグニ/スペル使用禁止 ----
  if (t.match(/無色の.*場に出せず.*無色の.*使用できない/))
    return { type: 'STUB', id: 'BLOCK_COLORLESS_PLAY' } as StubAction;

  // ---- ウィルス除去 ----
  if (t.match(/【ウィルス】を取り除く/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- 宣言した数字でパワー変更 ----
  if (t.match(/宣言した数字.*×.*パワー/) || t.match(/[０-９\d～]*の数字.*宣言し.*パワー/))
    return { type: 'STUB', id: 'DECLARE_NUMBER_POWER' } as StubAction;

  // ---- 対戦相手の手札を見て特定シグニを捨てさせる ----
  if (t.match(/対戦相手の手札を見て.*シグニ.*選び.*捨てさせる/))
    return { type: 'STUB', id: 'LOOK_OPP_HAND_DISCARD_SIGNI' } as StubAction;

  // ---- 白のシグニ共通クラスで追加サーチ ----
  if (t.match(/白のシグニが.*共通するクラスを持つ場合.*探して/))
    return { type: 'STUB', id: 'CONDITIONAL_SEARCH_IF_FIELD' } as StubAction;

  // ---- 追加されたターンならアタックフェイズ終了 ----
  if (t.match(/追加されたターン.*アタックフェイズを終了する/))
    return { type: 'STUB', id: 'END_ATTACK_IF_EXTRA_TURN' } as StubAction;

  // ---- レゾナがある場合追加サーチ ----
  if (t.match(/レゾナがある場合.*探して.*手札に加える/))
    return { type: 'STUB', id: 'CONDITIONAL_SEARCH_IF_RESONA' } as StubAction;

  // ---- ビートゾーン操作 ----
  if (t.match(/【ビート】にする/) || t.match(/【ビート】が.*枚以下の場合/))
    return { type: 'STUB', id: 'BEAT_ZONE_OP' } as StubAction;

  // ---- ルリグレベルにつきパワー変更 ----
  if (t.match(/センタールリグのレベル[０-９\d]+につき[－＋][０-９\d]+する/))
    return { type: 'STUB', id: 'POWER_MOD_BY_LRIG_LEVEL' } as StubAction;

  // ---- このターン対戦相手のルリグとシグニはアップしない ----
  if (t.match(/このターン.*センタールリグとシグニはアップしない/))
    return { type: 'STUB', id: 'PREVENT_OPP_UPKEEP' } as StubAction;

  // ---- 対戦相手のセンタールリグとシグニは一度しかアタックできない ----
  if (t.match(/センタールリグとシグニはそれぞれ一度しかアタックできない/))
    return { type: 'STUB', id: 'LIMIT_OPP_ATTACK_ONCE' } as StubAction;

  // ---- アップフェイズに手札/エナ支払いなしだとアップしない ----
  if (t.match(/アップフェイズに.*(?:捨てるか|支払わないかぎり).*アップしない/))
    return { type: 'STUB', id: 'UPKEEP_OR_NO_UP' } as StubAction;

  // ---- 対戦相手のシグニの各種能力を失わせる ----
  if (t.match(/【シャドウ】.*失い.*新たに得られない/))
    return { type: 'STUB', id: 'SUPPRESS_OPP_SIGNI_ABILITIES' } as StubAction;

  // ---- 対戦相手の常能力によるパワー＋禁止 ----
  if (t.match(/【常】能力の効果によって.*パワーは＋されない/))
    return { type: 'STUB', id: 'PREVENT_OPP_POWER_PLUS' } as StubAction;

  // ---- リミット－N ----
  if (t.match(/センタールリグのリミットを[－＋][１-９]/))
    return { type: 'STUB', id: 'LRIG_LIMIT_MODIFY' } as StubAction;

  // ---- シグニの下に置く（クラス条件） ----
  if (t.match(/のシグニ.*の下に置く(?:てもよい)?$/) && !t.match(/センタールリグの下/))
    return { type: 'STUB', id: 'PLACE_SIGNI_UNDER_SIGNI' } as StubAction;

  // ---- トラッシュのクラスカード枚数につきパワー変更 ----
  if (t.match(/トラッシュにある＜.*＞のカード.*につき[－＋][０-９\d]+する/))
    return { type: 'STUB', id: 'POWER_MOD_BY_TRASH_CLASS_COUNT' } as StubAction;

  // ---- マジックボックスを表向きシグニにする ----
  if (t.match(/【マジックボックス】.*表向き.*シグニにする/))
    return { type: 'STUB', id: 'MAGIC_BOX_REVEAL' } as StubAction;

  // ---- パワーを表記差の倍数で変更 ----
  if (t.match(/表記されているパワーとの差の[０-９\d]+倍/))
    return { type: 'STUB', id: 'POWER_MOD_DOUBLE_DIFF' } as StubAction;

  // ---- アクセ操作 ----
  if (t.match(/【アクセ】/))
    return { type: 'STUB', id: 'ACCE_OP' } as StubAction;

  // ---- パワー減少量コピー（毒牙等） ----
  if (t.match(/パワーが減ったとき.*このシグニのパワーを減った値と同じだけ/))
    return { type: 'STUB', id: 'POWER_COPY_FROM_DOWNED' } as StubAction;

  // ---- センタールリグは選んだ能力を得る ----
  if (t.match(/センタールリグは選んだ能力を得る/))
    return { type: 'STUB', id: 'LRIG_GAIN_ABILITY' } as StubAction;

  // ---- ルリグがシグニに乗る ----
  if (t.match(/のシグニに乗る$/))
    return { type: 'STUB', id: 'LRIG_RIDE_SIGNI' } as StubAction;

  // ---- 遊具のシグニをエナゾーンへ ----
  if (t.match(/＜遊具＞のシグニを.*枚まで.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CLASS_SIGNI_TO_ENERGY' } as StubAction;

  // ---- 5色シグニをそれぞれ1体トラッシュ ----
  if (t.match(/白.*赤.*青.*緑.*黒.*それぞれ.*トラッシュに置く/))
    return { type: 'STUB', id: 'BANISH_MULTI_COLOR_SIGNI' } as StubAction;

  // ---- 開花/シード操作 ----
  if (t.match(/開花し/) || t.match(/【シード】として/))
    return { type: 'STUB', id: 'SEED_FLOWER_OP' } as StubAction;

  // ---- 各プレイヤーがデッキをルリグレベル分トラッシュ ----
  if (t.match(/各プレイヤーは.*センタールリグのレベル.*につき.*トラッシュに置く/))
    return { type: 'STUB', id: 'ALL_PLAYER_MILL' } as StubAction;

  // ---- 共通する色を持たないように選ぶ ----
  if (t.match(/共通する色を持たないように.*選ぶ/))
    return { type: 'STUB', id: 'SELECT_NO_COMMON_COLOR' } as StubAction;

  // ---- 選んだ中からエナまたは手札へ ----
  if (t.match(/^選んだ中から.*エナゾーンに置き.*手札に加える$/))
    return { type: 'STUB', id: 'CHOSEN_TO_ENERGY_OR_HAND' } as StubAction;

  // ---- それをエナゾーンに置くか手札に加える ----
  if (t.match(/^それをあなたのエナゾーンに置くか手札に加える$/))
    return { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction;

  // ---- ディソナアイコン制限 ----
  if (t.match(/《ディソナアイコン》ではないスペル/))
    return { type: 'STUB', id: 'DISONA_RESTRICTION' } as StubAction;

  // ---- ライフクロスを手札に加えてもよい ----
  if (t.match(/あなたのライフクロス[０-９\d]*枚を手札に加えてもよい/))
    return { type: 'STUB', id: 'LIFE_TO_HAND_OPTIONAL' } as StubAction;

  // ---- 手札からカードとガードアイコンシグニを捨てる ----
  if (t.match(/手札からカード.*《ガードアイコン》を持つシグニ.*捨ててもよい/))
    return { type: 'STUB', id: 'OPTIONAL_DISCARD_GUARD' } as StubAction;

  // ---- トラッシュからガードアイコンシグニでトレード ----
  if (t.match(/トラッシュから《ガードアイコン》を持つシグニ.*場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_TRADE_GUARD_SIGNI' } as StubAction;

  // ---- このシグニはその能力を得る ----
  if (t.match(/^このシグニはその能力を得る$/))
    return { type: 'STUB', id: 'COPY_ABILITY' } as StubAction;

  // ---- シグニの下にカードが無い場合このカードをその下に置く ----
  if (t.match(/の下にカードが無い場合.*の下に置く/))
    return { type: 'STUB', id: 'PLACE_UNDER_IF_EMPTY' } as StubAction;

  // ---- トラッシュからスペルを使用する ----
  if (t.match(/トラッシュから.*スペル.*を対象とし.*使用する/))
    return { type: 'STUB', id: 'USE_SPELL_FROM_TRASH' } as StubAction;

  // ---- 次の対戦相手のターン終了時まで特定能力を付与 ----
  if (t.match(/次の対戦相手のターン終了時まで.*①を得る/))
    return { type: 'STUB', id: 'GRANT_ABILITY_UNTIL_OPP_TURN' } as StubAction;

  // ---- 代わりに発動した能力は何もしない ----
  if (t.match(/代わりに発動したその能力は何もしない/))
    return { type: 'STUB', id: 'NEGATE_ABILITY' } as StubAction;

  // ---- このシグニの下カード枚数につきパワー変更 ----
  if (t.match(/このシグニの下にあるカード[０-９\d１-９]*枚につき[－＋][０-９\d]+する/))
    return { type: 'STUB', id: 'POWER_MOD_BY_UNDER_COUNT' } as StubAction;

  // ---- 場にあるこのシグニを他シグニの下に置く ----
  if (t.match(/場にあるこのシグニをそのシグニの下に置く/))
    return { type: 'STUB', id: 'PLACE_SELF_UNDER_SIGNI' } as StubAction;

  // ---- 使用コスト追加でトラッシュへ ----
  if (t.match(/使用コストとして追加で.*トラッシュに置(?:いてもよい|く)/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手ターン時シグニ新たに場に出せない ----
  if (t.match(/対戦相手のターンの場合.*シグニを新たに場に出せない/))
    return { type: 'STUB', id: 'BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN' } as StubAction;

  // ---- デッキシャッフル後パワー半分 ----
  if (t.match(/デッキをシャッフルし.*パワーをこのシグニのパワーの半分/))
    return { type: 'STUB', id: 'SHUFFLE_DECK_POWER_HALF' } as StubAction;

  // ---- そのカードを公開する（単独） ----
  if (t.match(/^(?:その後、)?そのカードを公開する$/))
    return { type: 'STUB', id: 'REVEAL' } as StubAction;

  // ---- 次の対戦相手ドローフェイズのカード枚数制限 ----
  if (t.match(/次の.*ドローフェイズの間にカードを合計[０-９\d]+枚までしか引けない/))
    return { type: 'STUB', id: 'LIMIT_OPP_DRAW_COUNT' } as StubAction;

  // ---- このシグニはレベル以外で同じカードになる ----
  if (t.match(/このシグニはレベル.*を除き.*同じカードになる/))
    return { type: 'STUB', id: 'COPY_CARD' } as StubAction;

  // ---- デッキ上から龍獣などN枚トラッシュまで続ける ----
  if (t.match(/のシグニが[０-９\d]+枚トラッシュに置かれるまでカードをトラッシュに置く/))
    return { type: 'STUB', id: 'DECK_MILL_UNTIL_CLASS' } as StubAction;

  // ---- デッキ最上位と最下位を見る ----
  if (t.match(/デッキの一番上と一番下を見る/))
    return { type: 'STUB', id: 'LOOK_TOP_BOTTOM' } as StubAction;

  // ---- デッキをライフクロス枚数依存で見る ----
  if (t.match(/デッキの上から.*「.*ライフクロスの枚数.*」枚見る/))
    return { type: 'STUB', id: 'LOOK_TOP_BY_LIFE_COUNT' } as StubAction;

  // ---- 各プレイヤーデッキをトラッシュ ----
  if (t.match(/各プレイヤー.*デッキの上から.*トラッシュに置く/))
    return { type: 'STUB', id: 'ALL_PLAYER_MILL' } as StubAction;

  // ---- ＜解放派＞等のシグニを他シグニの下に置いてもよい ----
  if (t.match(/手札から＜.*＞のシグニ.*の下に置いてもよい/))
    return { type: 'STUB', id: 'HAND_SIGNI_UNDER_SIGNI' } as StubAction;

  // ---- このスペルは手札以外から使用できない ----
  if (t.match(/このスペルは手札以外から使用できない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- それが調理等の場合手札に加える ----
  if (t.match(/が＜.*＞のシグニの場合.*手札に加える/))
    return { type: 'STUB', id: 'CONDITIONAL_ADD_HAND' } as StubAction;

  // ---- そうした場合、それを手札に加える ----
  if (t.match(/^そうした場合、それを手札に加える$/))
    return { type: 'ADD_TO_HAND', owner: 'self' } as EffectAction;

  // ---- そうした場合、デッキ上をN枚見る ----
  if (t.match(/^そうした場合.*デッキの上から.*枚.*見る$/))
    return { type: 'STUB', id: 'LOOK_TOP_N' } as StubAction;

  // ---- 6枚以上の場合、代わりに2枚捨てる ----
  if (t.match(/枚以上の場合.*代わりに.*枚捨てる/))
    return { type: 'STUB', id: 'CONDITIONAL_DISCARD' } as StubAction;

  // ---- 追加で手札を捨てていた場合代わりに選ぶ数が増える ----
  if (t.match(/追加で手札を[０-９\d]+枚捨てていた場合.*代わりに/))
    return { type: 'STUB', id: 'CONDITIONAL_ALTERNATE_EFFECT' } as StubAction;

  // ---- クラッシュされたカードをエナ代わりにトラッシュ ----
  if (t.match(/クラッシュされたカードはエナゾーンに置かれる代わりにトラッシュに置かれる/))
    return { type: 'STUB', id: 'CRASH_TO_TRASH_INSTEAD' } as StubAction;

  // ---- それのパワーをこのシグニのパワーと同じだけ変更 ----
  if (t.match(/それのパワーをこのシグニのパワーと同じだけ[－＋]する/))
    return { type: 'STUB', id: 'POWER_EQUAL_TO_SELF_POWER' } as StubAction;

  // ---- このターンに対戦相手の効果で手札が減った分だけドロー ----
  if (t.match(/このターンに対戦相手の効果によって.*トラッシュに移動していた場合.*カードを引く/))
    return { type: 'STUB', id: 'DRAW_IF_OPP_DISCARDED_HAND' } as StubAction;

  // ---- このスペルを使用する際、クラスシグニを場からトラッシュに置いてもよい ----
  if (t.match(/このスペルを使用する際.*シグニ.*を場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このターン対戦相手の色と共通しないカードのライフバーストは発動しない ----
  if (t.match(/対戦相手のセンタールリグと共通する色を持たない.*ライフバーストは発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_LIFEBURST_COLOR_CONDITION' } as StubAction;

  // ---- 不明 ----
  return null;
  return null;
}
