import type {
  EffectAction,
  TransferToDeckAction,
  EnergyChargeAction,
  TakeFromUnderSigniAction,
  StubAction,
  SendToEnergyAction,
  ConditionalAction,
  BlockCardUseAction,
  PlaceVirusAction,
  SigniDeployBanAction,
  BlockActionAction,
  SequenceAction,
  PreventDamageAction,
  SetLrigBaseLimitAction,
  ReserveDrawPhaseReplacementAction,
  TargetFilter,
  EffectTarget,
} from '../../types/effects';
import {
  parseNum, makeRevealPickStub, parseRevealPickDescriptor, fusedLookPickSentence, tradeOptionalCost,
  parseColorFilter, parseStoryFilter, makeSoulOpStub,
} from '../parserUtils';
import { parseSentencePart1 } from './parseSentencePart1';
import { parseSentencePart2 } from './parseSentencePart2';


/**
 * 「（…、）手札から{好きな枚数の}?{＜クラス＞の}?シグニ{N枚}?を公開する」の**絞り込みと枚数**
 * （§5.3 `O-60` 第51バッチ・2026-09-03）。
 * ⚠**`手札から` より後ろだけ**を見る＝前置きの「対戦相手のシグニ１体を対象とし、」に
 *   ＜クラス＞が書いてある形（`WX06-019-BURST`）でそれを拾わないため。
 */
function parseHandRevealPick(t: string): NonNullable<StubAction['handCardPick']> {
  const seg = t.slice(Math.max(0, t.indexOf('手札から')));
  const anyCount = /^手札から好きな枚数/.test(seg) || /シグニを好きな枚数/.test(seg);
  const filter: TargetFilter = { cardType: 'シグニ' };
  const storyM = seg.match(/^手札から(?:好きな枚数の?)?[＜《]([^＞》]+)[＞》]の/);
  if (storyM) filter.story = storyM[1];
  const countM = seg.match(/シグニ(?:を)?([０-９\d]+)枚/);
  return { filter, ...(anyCount ? { anyCount: true } : { count: countM ? parseNum(countM[1]) : 1 }) };
}

/**
 * 「（あなたの）手札から〈修飾〉〈名詞〉を{好きな枚数|N枚まで}捨てる」＝**可変枚数の手札捨て**（§6.4 O-11・2026-08-17）。
 *
 * 🔴従来はこの文型が**バラバラに3本の `STUB{OPTIONAL_COST}`（ペイロード無し＝真 no-op）**へ落ちており、
 *   「手札を1枚も捨てないのに『この方法で捨てた1枚につき…』の帰結だけが走る」過剰実行になっていた。
 *   ⚠**機構は既にあった**＝すぐ下の「あなたは手札を好きな枚数捨てる」だけが正準形
 *   `TRASH{HAND_CARD, count:'ALL', upToCount:true}` を使っており、engine（`execTrash` の HAND_CARD 分岐）は
 *   0〜全部の選択UIを出して `lastProcessedCards` に選択枚数を残す。**足りなかったのは parser 規則だけ。**
 * 🔑`lastProcessedCards` が残るので、後段の「この方法で捨てた1枚につき」は
 *   `DRAW{count:0, addLastProcessedCount:true}` で枚数に追従できる。
 */
function parseVariableHandDiscard(t: string): EffectAction | null {
  const m = t.match(/^(?:あなたは?の?)?手札から(.*?)(シグニ|スペル|カード)を(好きな枚数|[０-９\d]+枚まで)捨てる$/);
  if (!m) return null;
  const [, mod, noun, cnt] = m;
  // 修飾に条件節や照応が紛れていたら触らない（帰結を条件ごと潰さない／参照先を失わない）。
  // ⚠`それ` の否定先読みは必須＝**「それぞれ異なる色を持つ」を照応と誤判定する**（実際に踏んだ）。
  if (/場合|とき|かぎり|それ(?!ぞれ)|その/.test(mod)) return null;
  const filter: TargetFilter = {};
  if (noun === 'シグニ') filter.cardType = 'シグニ';
  else if (noun === 'スペル') filter.cardType = 'スペル';
  const storyM = mod.match(/＜([^＞]+)＞の/);
  if (storyM) filter.story = storyM[1];
  const colorM = mod.match(/(?:^|[^色])([白赤青緑黒])の/);
  if (colorM) filter.color = colorM[1];
  const target: EffectTarget = {
    type: 'HAND_CARD', owner: 'self',
    count: cnt === '好きな枚数' ? 'ALL' : parseNum(cnt.replace(/枚まで$/, '')),
    upToCount: true,
    ...(Object.keys(filter).length > 0 ? { filter } : {}),
    // 「それぞれ〜異なる」＝**選択集合どうしの相互制約**（候補単体の条件ではない）。
    // ⚠これを落とすと「同じカードを3枚捨てる」が通ってしまう＝原文より緩い。
    ...(/それぞれ異なる色を持つ/.test(mod) ? { selectionConstraint: { sharedColor: 'none' as const } }
      : /それぞれレベルの異なる/.test(mod) ? { selectionConstraint: { distinct: 'level' as const } }
      : /それぞれ名前の異なる/.test(mod) ? { selectionConstraint: { distinct: 'name' as const } }
      : {}),
  };
  return { type: 'TRASH', target } as EffectAction;
}

export function parseSentencePart4(t: string): EffectAction | null {
  {
    const varDiscard = parseVariableHandDiscard(t);
    if (varDiscard) return varDiscard;
  }
  // ═══ §6.4 O-4：UNKNOWN で落ちていた単発文（続き499）═══
  // ⚠**UNKNOWN は「そのノードが no-op」で済まないことが多い**＝直前/直後のステップを束ねる
  //   ゲート（条件・対象・選択肢）を飲み込んでいると、周囲が無条件で走る過剰実行になる。
  //   ここに足す規則はどれも「原文にある絞り込みを必ず載せる」こと。

  // ---- 「対戦相手の効果によってダウンしない」（引用能力の中身・主語は付与先自身）----
  // ⚠`【常】：このシグニは対戦相手の効果によってダウンしない` の形は既に解けるが、
  //   引用付与の中身は主語が剥がれて素の述部だけになるため別規則が要る（`WXDi-P03-060-E1`）。
  if (/^対戦相手の効果によってダウンしない$/.test(t)) {
    return {
      type: 'GRANT_PROTECTION',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      from: ['DOWN'], sourceOwner: 'opponent', duration: 'PERMANENT',
    } as EffectAction;
  }

  // ---- 「あなたは自分のシグニ１体を選びトラッシュに置く」（`WXDi-P11-002-E1` 選択肢③）----
  // ⚠選択肢の1枝が丸ごと no-op だと**CPU/人間がその枝を選んだときだけ何も起きない**＝
  //   3択のうち1つが空振りする（他の2枝は動くので気付きにくい）。
  if (/^あなたは自分のシグニ[１1]体を選びトラッシュに置く$/.test(t)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } } } as EffectAction;
  }

  // ---- 「あなたのトラッシュからシグニをN枚まで対象とし、それらを手札に加え、手札をM枚捨てる」----
  // （`WD21-008-E1` 選択肢③）。連用中止でつながる後段（手札捨て）まで含めて SEQUENCE にする。
  {
    const trashToHandDiscardM = t.match(
      /^あなたのトラッシュからシグニを([０-９\d]+)枚(まで)?対象とし、それらを手札に加え、手札を([０-９\d]+)枚捨てる$/);
    if (trashToHandDiscardM) {
      return { type: 'SEQUENCE', steps: [
        { type: 'TRANSFER_TO_HAND', source: {
          type: 'TRASH_CARD', owner: 'self', count: parseNum(trashToHandDiscardM[1]),
          upToCount: !!trashToHandDiscardM[2], filter: { cardType: 'シグニ' },
        } } as EffectAction,
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(trashToHandDiscardM[3]) } } as EffectAction,
      ] } as EffectAction;
    }
  }

  // ---- 「この〈アーツ／スペル〉の使用コストで《色》…すべてが支払われている場合、〈帰結〉」（`WX05-016-E1`・§5.3 `O-117`）----
  // 🔴旧 live は**条件ごと落ちて `FORCE_END_TURN` が無条件**だった＝《無》×５をどう払っても
  //   ターンが終わる**過剰実行**（登録票の「5色ちょうどでしか使えない過小実行」は誤り＝
  //   アーツの請求額は CSV `Cost` 由来で、`effect.cost.energy` は**アーツでは読まれない**）。
  // ⚠真の出所は `manualEffects.ts` の古い手書き（カード名コメントも別カードのもの）＝
  //   parser は当時から `cost:無×5` ＋ `action:UNKNOWN` を出しており、live だけが無条件形で凍っていた。
  // ⚠母集団は全 CSV で**1枚**（「すべてが支払われている」の全数＝1）。汎用化しない。
  {
    const paidAllM = t.match(/^この(?:アーツ|スペル|カード)の使用コストで((?:《[白赤青緑黒]》)+)すべてが支払われている場合、このターンを終了する$/);
    if (paidAllM) {
      const colors = paidAllM[1].match(/[白赤青緑黒]/g) ?? [];
      return {
        type: 'CONDITIONAL',
        condition: { type: 'PAID_COLORS_INCLUDE_ALL', colors },
        then: { type: 'FORCE_END_TURN' },
      } as EffectAction;
    }
  }

  // ---- 「（その後、）あなたのすべてのライフクロスを見て、好きな順番で並び替える」（`WX05-010-E1`）----
  if (/^(?:その後、)?あなたのすべてのライフクロスを見て、好きな順番で並び替える$/.test(t)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'life_cloth', owner: 'self' },
      count: 'ALL', private: true, reorder: true,
      destination: { location: 'life_cloth', owner: 'self', position: 'any' },
    } as EffectAction;
  }

  // ---- 「このシグニがパワーN以上のシグニとバトルしたとき、そのシグニをトラッシュに置く」（`WXDi-P14-062-E1`）----
  // ⚠timing（`ON_SIGNI_BATTLE`）と `triggerFilter` は上流が既に付けているが、**action 側はトリガー句が
  //   剥がれずに残る**ので、文全体を受ける規則にする（「そのシグニをトラッシュに置く」単体は
  //   `RULE_REMINDER_TEXT`＝no-op へ落ちる）。「その」＝バトル相手＝トリガー元。
  if (/^このシグニがパワー[０-９\d]+以上のシグニとバトルしたとき、そのシグニをトラッシュに置く$/.test(t)) {
    return { type: 'TRASH', target: {
      type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', isTriggerSource: true },
    } } as EffectAction;
  }

  // ---- 「（対戦相手のターンの間、）このシグニがバニッシュされたとき、このシグニをエナゾーンから手札に加えてもよい」----
  // （`WX17-052-LAYER` の《レイヤーアイコン》能力）。バニッシュ先はエナなので、そこから自分自身を拾う。
  // ⚠「してもよい」は `upToCount` で表す（`TRANSFER_TO_HAND` に optional キーは無い）。
  // ⚠トリガー句が剥がれる経路と剥がれない経路の**両方**がある（付与能力の展開はトリガー句を除去して
  //   `activeCondition:{TURN_OWNER}` へ落とす）＝どちらでも受かる形にする。
  if (/^(?:対戦相手のターンの間、)?(?:このシグニがバニッシュされたとき、)?このシグニをエナゾーンから手札に加えてもよい$/.test(t)) {
    return { type: 'TRANSFER_TO_HAND', source: {
      type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true, filter: { thisCardOnly: true },
    } } as EffectAction;
  }

  // ---- 「（その後、）対戦相手の手札を見て、宣言したカードをすべて捨てさせる」（`PR-257-E1`）----
  // 直前の `DECLARE_CARD_NAME` が置いた `declared_card_name` を `nameEqDeclaredName` で参照する。
  // ⚠未宣言なら空ヒット＝「宣言していないのに全部捨てさせる」過剰実行にはならない。
  if (/^(?:その後、)?対戦相手の手札を見て、宣言したカードをすべて捨てさせる$/.test(t)) {
    return { type: 'TRASH', target: {
      type: 'HAND_CARD', owner: 'opponent', count: 'ALL', filter: { nameEqDeclaredName: true },
    } } as EffectAction;
  }

  // ---- 「あなたの手札から〈修飾〉スペル１枚を使用してもよい」（`WX11-043-E2`）----
  // ⚠既存規則は「コストを支払って使用する」「コストを支払わずに使用してもよい」の2形しか受けず、
  //   素の「使用してもよい」が UNKNOWN に落ちていた（コスト軽減は後続文の別ステップが持つ）。
  if (/^あなたの手札から[^。]{0,20}スペル[１1]枚を使用してもよい$/.test(t))
    return { type: 'STUB', id: 'PLAY_SPELL_FROM_HAND' } as StubAction;

  // ---- 「この方法で場に出た《X》が場を離れる場合、代わりにゲームから除外される」（`WXDi-P13-004A-E1`）----
  // 直前の `ADD_TO_FIELD` が場に出したカード（`lastProcessedCards`）を遅延除外マークへ登録する。
  if (/^この方法で場に出た《[^》]*》が場を離れる場合、代わりにゲームから除外される$/.test(t))
    return { type: 'STUB', id: 'MARK_PLACED_DELAYED_EXILE' } as StubAction;

  // ---- 明示 defer（§6.4 O-4 続き499）＝機構が無いことを宣言して UNKNOWN から出す ----
  // 🔑UNKNOWN のままだと計器（`census:stubs`）に映らず、**周囲のステップが無条件で走る**リスクだけが残る。
  //   `DEFERRED_*` にしておけば A群の worklist に並び、前提が揃ったときに着手できる。


  // 「それをコストを支払わずに使用するかトラッシュに置く」（`WX20-077-E2`・§6.4 O-34(b)）＝
  // シャッフル節と分かれて単独文で来た場合の受け口（本体は `parseSentencePart3` の
  // 「デッキをシャッフルし、〜使用するかトラッシュに置く」規則）。
  if (/^(?:その後、)?(?:それ|そのカード)をコストを支払わずに使用するかトラッシュに置く$/.test(t))
    return { type: 'STUB', id: 'USE_SEARCHED_SPELL_OR_TRASH' } as StubAction;

  // 「このターン、あなたのデッキにあるシグニのレベルはNになる」（`WXK07-034-E1` 選択肢①・§6.4 O-34(c)）。
  // 🔑クラス指定なし＝**全シグニ**なので `deck_signi_level_override.class` に `'*'` を入れる。
  //   読み手は `deckSigniOverrideLevel`（デッキ探索＝`execSearch`／デッキ公開＝`execRevealUntil`）。
  {
    const deckLvAllM = t.match(/^このターン、あなたのデッキにあるシグニのレベルは([０-９\d]+)になる$/);
    if (deckLvAllM) {
      return { type: 'STUB', id: 'DECK_SIGNI_LEVEL_OVERRIDE_ALL', value: parseNum(deckLvAllM[1]) } as StubAction;
    }
  }

  // ---- 「このピースはあなたの場にルリグが３体いなくても使用できる」（`WXDi-P16-TK01-E1`）----
  // ⚠**緩和の対象になっているルール（ピースはルリグ3体でなければ使えない）自体が engine 未実装**
  //   ＝緩和も no-op でよい。ルール注記として明示し、UNKNOWN のままにしない（前置文が UNKNOWN だと
  //   後続の CHOOSE 組み立てが成立せず①②③が全部その場で走る）。
  if (/^このピースはあなたの場にルリグが[０-９\d]体いなくても使用できる$/.test(t))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 手札からカードを【トラップ】として設置する ----
  {
    const handTrapM = t.match(/手札からカードを([１-９０-９\d]*)枚?(まで)?【トラップ】として.*シグニゾーンに設置する/);
    if (handTrapM) return {
      type: 'STUB', id: 'TRAP_OP', trapOp: 'set', trapSource: 'hand',
      count: handTrapM[1] ? parseNum(handTrapM[1]) : 1,
      ...(handTrapM[2] ? { upToCount: true } : {}),
    } as StubAction;
  }

  // ---- 忠実に解ける「その中から…」の単一ピック記述子 ----
  // 「数字/カード名/クラス１つを宣言する。デッキの上からN枚公開する。その中から宣言した〜を手札に加え、…」の
  // 系統。従来はどの pick 規則にも掛からず **UNKNOWN＝pick が丸ごと no-op**（PR-434／WX11-037／WX24-P1-035）か、
  // filter だけ落ちた **どの公開札でも拾える過剰実行**（PR-431）だった。
  // ⚠記述子が**忠実に解けたときだけ**受ける（`parseRevealPickDescriptor` が null なら従来経路のまま）。
  if (/^その中から(?:宣言した|すべての)/.test(t) && parseRevealPickDescriptor(t))
    return makeRevealPickStub(t);

  // ---- 「デッキの上からN枚公開し（見て）、その中から〜」＝1文に畳まれた look-pick（タスク12(xlvi)(c)）----
  // 文が分かれている形は effectParser の LOOK_AND_REORDER + STUB 融合が拾うが、読点で1文に畳まれた形は
  // 融合の対象外。従来は上流の汎用「デッキ上→エナ」規則に飲まれて**公開札を全部エナへ送る過剰実行**だった。
  // 記述子が忠実に解けたときだけ受ける。
  {
    const comb = fusedLookPickSentence(t);
    if (comb) {
      const combD = comb.desc;
      const rpp = makeRevealPickStub(comb.pick).revealPickParams!;
      return {
        type: 'REVEAL_AND_PICK', owner: 'self', revealCount: comb.revealCount,
        ...(Object.keys(combD.filter).length > 0 ? { filter: combD.filter } : {}),
        pickCount: combD.pickCount,
        ...(combD.pickUpTo ? { pickUpTo: true } : {}),
        ...(combD.noun !== 'シグニ' ? { pickNoun: combD.noun } : {}),
        ...(combD.dest === 'hand_or_energy' ? { handOrEnergy: true } : {}),
        // ⚠**`dest==='field'` を落とすと「場に出す」が黙って「手札に加える」になる**（§6.4 O-11）。
        //   `makeRevealPickStub` 側には同じ分岐が既にあり、こちらの畳み込み経路だけが欠けていた。
        then: combD.dest === 'energy'
          ? { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction
          : combD.dest === 'field'
            ? { type: 'ADD_TO_FIELD', owner: 'self' }
            : { type: 'ADD_TO_HAND', owner: 'self' },
        remainder: rpp.restDest === 'trash'
          ? { location: 'trash', position: 'bottom' }
          : rpp.restDest === 'energy'
            ? { location: 'energy', position: 'bottom' }
            : { location: 'deck', position: 'bottom', ...(rpp.restShuffle ? { shuffle: true } : {}) },
      } as EffectAction;
    }
  }

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
  // 🆕§5.3 `O-60` 第19バッチ（2026-09-03）＝増加量を payload（符号つき）で運ぶ。
  //   ⚠「（６枚から８枚になる）」は**リマインダ**なので読まない（旧 engine はこちらを最優先で読み、
  //   上限を絶対値へ代入していた＝同種2枚で潰れる）。
  const handLimitUpM = t.match(/あなたの手札の枚数の上限は([１-９\d０-９]+)増える/);
  if (handLimitUpM)
    return { type: 'STUB', id: 'HAND_SIZE_INCREASE', handLimitDelta: parseNum(handLimitUpM[1]) } as StubAction;

  // ---- ウィルスをシグニゾーンに置く（合計N個になるように） ----
  const fillVirusM = t.match(/【ウィルス】の合計が([１-９\d０-９]+)つになるように.*シグニゾーンに【ウィルス】を置く/);
  if (fillVirusM) {
    const n = parseNum(fillVirusM[1]);
    return { type: 'PLACE_VIRUS', targetOwner: 'opponent', zoneCount: n, virusCount: 1, fillToTotal: n } as PlaceVirusAction;
  }

  // ---- すべての【ウィルス】を取り除く ----
  // ⚠**「対戦相手の場にある」を必須にしない**＝`WX16-033-E1`（「…すべてのカードをトラッシュに置き
  //   **すべての【ウィルス】を取り除く**」）は前置きが違うので落ちて、下の catch-all に流れていた。
  if (t.match(/すべての【ウィルス】を取り除く/))
    return { type: 'STUB', id: 'REMOVE_VIRUS', virusCount: 'all' } as StubAction;

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
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_life', count: 1 } } as StubAction;

  // ---- 公開した相手ライフクロスが【ライフバースト】を持たない場合、それをトラッシュに置く（WD06-006-E1）----
  // 🔴従来は catch-all の `CONDITIONAL_POWER_BONUS`＝**丸ごと無言 no-op**＝公開するだけで**何も落ちなかった**。
  // 条件語彙 `LAST_PROCESSED_HAS_BURST{negate}` は既にあり、直前の `LOOK_OPP_LIFE_TOP` が
  // `lastProcessedCards` に公開札を残す（`execStubPart1.ts:1548`）＝そのまま繋がる。
  // ⚠「それ」は**相手のライフクロスの一番上**＝汎用の「それをトラッシュに置く」は `SIGNI{owner:'any'}` に
  //   化けるので、ここで行き先を固定する（`execTrash` の LIFE_CLOTH_CARD 分岐は末尾＝上から count 枚）。
  if (t.match(/そのカードが【ライフバースト】を持たない場合、それをトラッシュに置く/))
    return {
      type: 'CONDITIONAL',
      condition: { type: 'LAST_PROCESSED_HAS_BURST', negate: true },
      then: { type: 'TRASH', target: { type: 'LIFE_CLOTH_CARD', owner: 'opponent', count: 1 } },
    } as EffectAction;

  // ---- 追加のアタックフェイズを加える（§6.4 O-3）----
  // 消化は `resolveNextPhaseAfterAttack`＝ATTACK_LRIG の次を END ではなく ATTACK_ARTS にする1点。
  // ⚠「この方法で加えたアタックフェイズの開始時、〜」の本文は**後続の文**にあるので、
  //   `parseActionText` の SEQUENCE 畳み込みで `onStart` へ移す（ここでは空のまま返す）。
  if (t.match(/追加のアタックフェイズを加える/))
    return { type: 'ADD_EXTRA_ATTACK_PHASE' } as EffectAction;

  // ---- この方法でN枚以上公開/トラッシュした場合 ----
  if (t.match(/この方法でカードが[１-９\d０-９]+枚以上公開された場合/) ||
      t.match(/この方法でカードを[１-９\d０-９]+枚トラッシュに置いた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // 「手札からそれぞれ異なる色を持つ〜シグニを好きな枚数捨てる」は
  // `parseVariableHandDiscard`（この関数の冒頭）が正準形 TRASH で受ける＝旧 `STUB{OPTIONAL_COST}` は撤去。

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
  // 🔴§5.3 `O-60` 第1バッチ＝engine の regex は「上から**N枚**」しか見ておらず、
  //   実データの「上から**カードを**２枚見る」を挟めずに**既定の1枚**へ落ちていた（`WXEX1-11-E2`）。
  if (t.match(/対戦相手のライフクロスの上からカードを[１-９\d０-９]+枚見る/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_life', count: parseNum(t.match(/対戦相手のライフクロスの上からカードを([１-９\d０-９]+)枚見る/)![1]) } } as StubAction;

  // ---- チェックゾーンに置き残りをライフに戻す ----
  if (t.match(/チェックゾーンに置き、残りを対戦相手のライフクロスの一番上に戻す/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- その中からN枚を【トラップ】として設置する ----
  {
    const lookedTrapM = t.match(/その中から([１-９０-９\d]*)枚?(まで)?を【トラップ】として.*シグニゾーンに設置する/);
    if (lookedTrapM) return {
      type: 'STUB', id: 'TRAP_OP', trapOp: 'set', trapSource: 'looked',
      count: lookedTrapM[1] ? parseNum(lookedTrapM[1]) : 1,
      ...(lookedTrapM[2] ? { upToCount: true } : {}),
    } as StubAction;
  }

  // ---- パワーをこの方法で捨てたシグニのパワーと同じだけ増減 ----
  if (t.match(/パワーをこの方法で捨てたシグニのパワーと同じだけ/))
    return { type: 'STUB', id: 'POWER_MOD_MIRROR' } as StubAction;

  // ---- 《レイヤーアイコン》の能力を得る ----
  if (t.match(/《レイヤーアイコン》の能力を得る/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' }, optional: true };

  // ---- すべてのシグニを好きなように配置し直してもよい ----
  // 🆕**持ち主と全体形を payload で刻む**（§5.3 `O-60` 第56バッチ・2026-09-03）＝
  //   この文型は主語が文中にある（「**あなたの**すべてのシグニを」）ので文単位で読める。
  if (t.match(/すべてのシグニを、?好きなように配置し直してもよい/))
    return {
      type: 'STUB', id: 'SIGNI_REPOSITION',
      owner: /対戦相手の(?:すべての)?シグニ/.test(t) ? 'opponent' : 'self',
      ...(/対戦相手の(?:すべての)?シグニ/.test(t) ? {} : { repositionAll: true }),
    } as StubAction;

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
      t.match(/トラップアイコン》を発動させる/)) {
    const fieldSigniM = t.match(/あなたの＜([^＞]+)＞のシグニ[１1]体を対象とし、それの《トラップアイコン》を発動させる/);
    return {
      type: 'STUB', id: 'TRAP_OP', trapOp: 'activate',
      ...(fieldSigniM ? { trapSource: 'field_signi' as const, trapFilter: { cardType: 'シグニ' as const, story: fieldSigniM[1] } } : {}),
    } as StubAction;
  }

  // ---- このターン終了時、手札をN枚捨てる ----
  if (t.match(/^このターン終了時、手札を[１-９\d０-９]+枚捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 2 } };

  // 🏁**§5.3 `O-60` 第61バッチ（2026-09-03）**＝「プレイヤーを1人まで選ぶ」を
  //   `CHOOSE_N_FROM_LIST`（①②③の多択の受け皿）へ流していた枝を撤去した＝**id が嘘をつく形**で、
  //   受け皿ごと消えた。live 0。

  // ---- 対戦相手のすべてのシグニをエナゾーンに置く（エナ送り。バニッシュとは別アクション）----
  if (t.match(/対戦相手のすべてのシグニをエナゾーンに置く/))
    return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } } as SendToEnergyAction;

  // ---- あなたの他の＜クラス＞のシグニ１体を場からトラッシュに置いてもよい ----
  if (t.match(/対象のあなたの他の[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*体?を場からトラッシュに置いてもよい/))
    return tradeOptionalCost(t);

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

  // ---- 「次のあなたのメインフェイズまで、このルリグの基本リミットはNになり〜ダメージを受けない」----
  // `WXK01-002-E2`。✅続き492 で実装＝期間は `clearMainPhaseScopedState` の1点で失効する
  // （`untilNextMainPhase`／`prevent_damage_windows.expires:'MY_NEXT_MAIN_PHASE'`）。
  // ⚠**ターン境界では消さない**＝原文は相手のターンを丸ごと跨ぐ。
  if (/^次のあなたのメインフェイズまで/.test(t)) {
    const steps: EffectAction[] = [];
    const limitM = t.match(/この(?:ルリグ|カード)の基本リミットは([０-９\d]+)になり/);
    if (limitM) steps.push({ type: 'SET_LRIG_BASE_LIMIT', owner: 'self', value: parseNum(limitM[1]), untilNextMainPhase: true } as SetLrigBaseLimitAction);
    if (/あなたは対戦相手のルリグによってダメージを受けない/.test(t)) {
      steps.push({ type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN', scope: 'LRIG', untilNextMainPhase: true } as PreventDamageAction);
    }
    // ⚠句のどれか1つでも拾えなければ**部分採用しない**（落ちた節が無言で消えるより受け皿のほうがよい）。
    const clauseCount = (limitM ? 1 : 0) + (/ダメージを受けない/.test(t) ? 1 : 0);
    if (steps.length > 0 && steps.length === clauseCount) {
      return steps.length === 1 ? steps[0] : ({ type: 'SEQUENCE', steps } as SequenceAction);
    }
    return { type: 'STUB', id: 'DEFERRED_UNTIL_NEXT_MAIN_PHASE_CLAUSE' } as StubAction;
  }
  if (t.match(/次のあなたのメインフェイズまで.*リミットは/) ||
      t.match(/次のあなたのメインフェイズまで.*ダメージを受けない/))
    return { type: 'STUB', id: 'DEFERRED_UNTIL_NEXT_MAIN_PHASE_CLAUSE' } as StubAction;

  // ---- 「あなたが（次のあなたの）ドローフェイズにカードをN枚引く場合、代わりにカードをM枚引く」----
  // `WXK01-002-E2` の3文目。⚠🔴従来ここは規則が無く、後段の汎用ドロー規則に落ちて
  // **使った瞬間に1枚引く**（`DRAW{count:1}`）過剰実行になっていた（原文には即時ドローは無い）。
  {
    const dpr = t.match(/^あなたが(?:次のあなたの)?ドローフェイズに(?:カードを)?([０-９\d]+)枚引く場合、代わりに(?:カードを)?([０-９\d]+)枚引く$/);
    if (dpr) {
      return { type: 'RESERVE_DRAW_PHASE_REPLACEMENT', owner: 'self', fromCount: parseNum(dpr[1]), toCount: parseNum(dpr[2]) } as ReserveDrawPhaseReplacementAction;
    }
  }

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
  // 🆕**§5.3 `O-60` 第65バッチ（2026-09-04）＝「あなたがアーツを使用したとき、このシグニを…」を外した。**
  //   この4パターンは id が `GRANT_QUOTED_AUTO_ABILITY`（engine が原文を読み直す catch-all）だが
  //   **どれも引用付与ではない**（id の名前が嘘）。live で残っていたのは1本目だけで、
  //   実体は `WXK03-042-E1` の**空きシグニゾーンへの自己移動**＝`O-237` へ分離した（`parseSentencePart1`）。
  //   ⚠残り3パターンは **live 0**（＝標本が無く検証できない）ので触らない・消さない。
  if (t.match(/このシグニが場を離れたとき/) ||
      t.match(/ドローフェイズ以外であなたがカードを[１-９\d０-９]*枚引いたとき/) ||
      t.match(/対戦相手のレベル[０-９\d０-９]+以下のシグニ[１-９\d０-９]*体?がこのシグニの正面.*出たとき/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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

  // ---- 対象のシグニをエナゾーンに置く（エナ送り。バニッシュとは別アクション）----
  if (t.match(/^対象の対戦相手のシグニ[１-９\d０-９]*体?をエナゾーンに置く$/)) {
    const cntM = t.match(/([１-９\d０-９]+)体/);
    const cnt = cntM ? parseNum(cntM[1]) : 1;
    return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as SendToEnergyAction;
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

  // 🏁**§5.3 `O-60` 第61バッチ（2026-09-03）**＝「以下のNつを**行う**」（＝選ぶのではなく全部やる）を
  //   `CHOOSE_N_FROM_LIST`（**選ぶ**受け皿）へ流していた枝を撤去した＝**意味が逆**だった。
  //   正しい経路は `tryParseDoAllItems`（`effectParser.ts` の単文 funnel 先頭）。live 0。

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
    return { type: 'STUB', id: 'DEFERRED_TRASH_ALL_TO_DECK_OPTIONAL' } as StubAction;

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
  // 🆕§5.3 `O-60` 第45バッチ（2026-09-03）＝**typed `TRANSFER_TO_DECK{position:'top_or_bottom'}` へ寄せた。**
  // 🔴旧 `STUB{LOOK_AND_REORDER}` は engine が**カード全文**に
  //   `デッキの上からカードをN枚見る` を当てており、**同じカードの別の文**に当たると
  //   「デッキ上を追加でN枚めくる」まったく別の処理が走った（`WX13-035-BURST` は直前の
  //   `REVEAL_AND_PICK` に加えて**もう2枚**めくっていた）。
  // ⚠**「残り〜」で始まる文は直前アクションの `remainder` が既に表している**＝二重に処理しないよう no-op。
  if (t.match(/デッキの一番上か一番下に置く/)) {
    if (/^残り/.test(t)) return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
    const oppSigniTopBottom = /対戦相手の.*シグニ/.test(t);
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'SIGNI', owner: oppSigniTopBottom ? 'opponent' : 'self', count: 1, filter: { cardType: 'シグニ' } },
      shuffle: false,
      position: 'top_or_bottom',
    } as EffectAction;
  }

  // ---- シグニゾーンに配置してもよい ----
  if (t.match(/シグニゾーン[１-９\d０-９]*つに配置してもよい/))
    return { type: 'STUB', id: 'SIGNI_REPOSITION' } as StubAction;

  // ---- 各プレイヤーがシグニを場に出す ----
  if (t.match(/各プレイヤーは.*シグニを.*場に出し/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- シグニを裏向きにしてもよい ----
  if (t.match(/シグニ[１-９\d０-９]*体?(?:まで)?を対象とし、それらを裏向きにしてもよい/))
    return { type: 'STUB', id: 'SIGNI_FLIP_FACEDOWN' } as StubAction;

  // ---- このシグニをエナゾーンからデッキの一番下に置いてもよい（＝任意コスト。§5.3 `O-55`）----
  // 🔴旧実装は `SOUL_OP` を返していたが、`SOUL_OP` は**まったく別の機構**＝「シグニの下のカード（ソウル）を
  //   使用して発動しますか？」の任意コスト（`effectExecutor.ts` の `SOUL_OP` 分岐）。したがって
  //   `WXDi-P02-044-E1` は**エナの自分自身を1枚もデッキへ戻さないまま**「そうした場合」の本体だけが通る
  //   踏み倒しになっていた（しかも下に何も無ければ pay 自体が unavailable になり不発）。
  // ⚠受け皿は `selfToEnergy`／`selfTrash` と同型の `OPTIONAL_COST{selfEnergyToDeckBottom}`（行き先違い）。
  if (t.match(/この(?:シグニ|カード)を(?:あなたの)?エナゾーンからデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST', selfEnergyToDeckBottom: true, costText: t } as StubAction;

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
    return { type: 'STUB', id: 'DEFERRED_SPLIT_PILES_OPP_CHOOSE' } as StubAction;

  // ---- 対戦相手は手札を２枚捨ててもよい ----
  if (t.match(/^対戦相手は手札を[１-９\d０-９]+枚(?:まで)?捨ててもよい$/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 《ガードアイコン》を持たないカードをデッキ下に ----
  // ⚠**「対戦相手の手札を見て」が前置される形（`WXDi-P05-039-E2`）は見る効果**なので `lookZone` を刻む
  //   （§5.3 `O-60` 第1バッチ）。前置が無い形は「選んで置く」だけなので payload を付けない＝
  //   engine は何も覗かない（fail-closed）。
  if (t.match(/《ガードアイコン》を持たないカード[１-９\d０-９]*枚を選び.*デッキの一番下に置く/))
    return /対戦相手の手札を見て/.test(t)
      ? { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_hand', count: 'ALL' } } as StubAction
      : { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // 🏁**§5.3 `O-60` 第61バッチ（2026-09-03）**＝「対戦相手はシグニを好きな数選ぶ」を
  //   `CHOOSE_N_FROM_LIST` へ流していた枝を撤去した（**選ぶのは相手・対象はシグニ**で別物）。live 0。

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

  // ---- 対戦相手は手札をすべてルリグゾーンに裏向きで置く（§6.4 O-3）----
  // ⚠🔴旧 `TARGET_AND_DISCARD_HAND` は「対戦相手のシグニを対象とし**自分の**手札を1枚トラッシュ」する
  //   別文型のハンドラで、置く側・行き先・枚数のすべてが原文と違っていた（`SPDi43-02-E2`）。
  //   しかも「ターン終了時、対戦相手はそれらのカードを手札に加える」側が `RULE_REMINDER_TEXT` に落ちて
  //   いたので、**相手の手札が1枚減ったまま戻らない**という片側採用でもあった。
  if (t.match(/対戦相手は手札をすべてルリグゾーンに裏向きで置く/))
    return { type: 'PLACE_FACEDOWN_LRIG_ZONE', source: 'hand', count: 1, all: true, owner: 'opponent' } as EffectAction;

  // ---- 対戦相手はそれらのカードを手札に加える ----
  if (t.match(/^対戦相手はそれらのカードを手札に加える$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 次の対戦相手のアタックフェイズ開始時〜 ----
  // ⚠ターンを跨いだ「次の相手アタックフェイズ開始時」の遅延トリガーが要る（§6.4 O-3 続き459）。
  if (t.match(/次の対戦相手のアタックフェイズ開始時/))
    return { type: 'STUB', id: 'DEFERRED_NEXT_OPP_ATTACK_PHASE_START' } as StubAction;

  // ---- 各プレイヤーは自分のデッキの一番上のカードを公開する（§6.4 O-35・続き530）----
  // 🔴従来は `LOOK_OPP_LIFE_TOP`（＝**相手のライフクロス**上を見る別機構）に化けており、
  //   公開が起きないうえ `lastProcessedCards` に無関係な札が載って、後続の
  //   「この方法で公開されたシグニのレベルの合計が〜の場合」が別物を数えていた（`SPDi43-25-E2`）。
  if (t.match(/各プレイヤーは自分のデッキの一番上のカードを公開する/))
    return { type: 'STUB', id: 'REVEAL_EACH_PLAYER_DECK_TOP' } as StubAction;

  // ---- 「〈誰か〉のデッキからすべてのカードをトラッシュに置く」（`PR-469`②・§6.4 O-11）----
  // ⚠**大きな `count` で代用しない**＝原文に枚数が無いので `MILL{all:true}` で表す。
  {
    const millAllM = t.match(/^(あなた|対戦相手)のデッキからすべてのカードをトラッシュに置く$/);
    if (millAllM) {
      return { type: 'MILL', owner: millAllM[1] === '対戦相手' ? 'opponent' : 'self', count: 0, all: true } as EffectAction;
    }
  }

  // ---- 「対戦相手のルリグデッキからカードを１枚見ないで選び公開する」（`PR-469`③・§6.4 O-11）----
  // 後続文「それがルリグでない場合、それをルリグトラッシュに置く」まで engine 側の1 STUB で処理する
  // （公開して初めて種別が分かる＝2ステップに割ると「それ」の束縛が要るうえ相手ゾーンを跨ぐ）。
  // ⚠既存の `OPP_LRIG_DECK_TO_LRIG_TRASH` は**相手が自分で選ぶ**別文型なので流用しない。
  if (/^対戦相手のルリグデッキからカードを[１1]枚見ないで選び公開する$/.test(t))
    return { type: 'STUB', id: 'OPP_LRIG_DECK_BLIND_REVEAL' } as StubAction;
  // 上の STUB が種別判定まで済ませるので、続く「それがルリグでない場合、〜」は注記として畳む。
  if (/^それがルリグでない場合、それをルリグトラッシュに置く$/.test(t))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 「対戦相手は自分のルリグデッキからカード１枚をルリグトラッシュに置く」（§6.4 O-35・続き530）----
  // engine 実装済み＝`STUB{OPP_LRIG_DECK_TO_LRIG_TRASH}`（`execStubPart1.ts`。相手が自分で1枚選ぶ）。
  // 🔴**parser 側に規則が無く**、live では `WX24-P4-014-E3` だけが手パッチでこの STUB を持っていた
  //   ＝同じ文の `SPDi43-25-E2` は下の「レベル合計がNの場合」catch-all に飲まれて無言 no-op だった。
  // ⚠先頭の「レベルの合計がN(以上/以下)?の場合、」は多分岐の枝ラベルで、条件は
  //   `applyThisWayTrashOutcomeGuards` が原文から3枝ぶんまとめて復元する（他の2枝と同じ扱い）。
  if (/^(?:レベルの合計が[０-９\d]+(?:以上|以下)?の場合、)?対戦相手は自分のルリグデッキからカード[１1]枚をルリグトラッシュに置く$/.test(t))
    return { type: 'STUB', id: 'OPP_LRIG_DECK_TO_LRIG_TRASH' } as StubAction;


  // ---- エナゾーンから白/色のシグニをデッキ上に置いてもよい ----
  // §5.3 `O-60` 第2バッチ＝操作の種類と絞り込みを `underCardOp` に刻む（engine の全文 regex を撤去）。
  // 🔴**旧 engine は「白の」を1文字も見ずエナのシグニを先頭から機械的に取っていた**（filter 脱落）。
  // 🆕**2026-09-01（§5.3 `O-146`）＝受け皿 STUB をやめて型付きの `TRANSFER_TO_DECK` にした。**
  //   🔴旧 STUB は原文「置いて**もよい**」なのに**強制**で、しかも候補が複数あっても `candUC[0]` を
  //   **自動で選んでいた**（プレイヤーが選べない）。⇒ `ENERGY_CARD` 経路は `upToCount` で
  //   「1枚まで＝0枚でもよい」の選択対話を既に持っている（`effectExecutor.ts` の ENERGY_CARD 分岐）。
  //   ⚠**「そうした場合」のゲートも同時に直す**＝旧 live は `CONDITIONAL{IS_MY_TURN}`＝
  //   **1枚も置かなくても自分のターンなら後続が走る**（`applyDidItGate` 後段が枚数ゲートへ置き換える）。
  const energyTopM = t.match(/エナゾーンから.+のシグニ([１-９\d０-９]*)枚をデッキの一番上に置いてもよい/);
  if (energyTopM) {
    const fEUC = { ...parseColorFilter(t), ...parseStoryFilter(t), cardType: 'シグニ' } as TargetFilter;
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'ENERGY_CARD', owner: 'self', count: energyTopM[1] ? parseNum(energyTopM[1]) : 1, upToCount: true, filter: fEUC },
      shuffle: false, position: 'top', optional: true,
    } as EffectAction;
  }

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
  // ⚠**「好きな数対象とし…合計で」の枝も撤去**（§5.3 `O-140`）＝part3 の `splitTotal` が先に受ける。
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?を対象とし.*パワーを.*につき[＋－][０-９\d０-９]+する/))
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
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' }, optional: true };

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
  // 🔴**この操作だけが engine の「無条件フォールバック」で実行されていた**＝原文にこの文が無い効果でも、
  //   効果元の下にカードが在れば問答無用に全部トラッシュしていた（§5.3 `O-60` 第2バッチ）。
  if (t.match(/このシグニの下にあるすべてのカードをトラッシュに置く/) ||
      t.match(/このシグニに付いている.*下に置かれているすべてのカードをトラッシュに置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP', underCardOp: { op: 'trash_all_under_self' } } as StubAction;

  // ---- このシグニはそれと同じカードになる ----
  if (t.match(/このシグニはそれと同じカードになる/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- 他のすべてのシグニをトラッシュに置く ----
  // ⚠所有者句が無い「すべてのシグニ」は**両者の場**（`WXEX2-51-E2`／`WX17-046-E3` の BANISH と同じ扱い）。
  //   旧実装は `owner:'self'` かつ `excludeSelf` 無しで、**自分の盤面だけを自分ごと**流していた
  //   （`WXDi-P07-050-E3`＝相手の盤面が一切減らない過少実行＋自己トラッシュの過剰実行）。
  // ⚠`execTrash` は `owner:'any'` を `otherState` に潰す（BANISH と違い両側走査が無い）ので、
  //   `WX04-043-E1`（MANUAL）と同じく**自分側／相手側の2ステップ**に分ける。
  if (t.match(/^他のすべてのシグニをトラッシュに置く$/))
    return { type: 'SEQUENCE', steps: [
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', excludeSelf: true } } },
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } } },
    ] };

  // ---- このターン、あなたは他のシグニを場に出せない（§6.4 O-3）----
  // 配置禁止は「課した側」ではなく**場に出す側**の `signi_deploy_bans` に載せる＝判定は既存の
  // `deployLimitBlockReason` 1本（通常召喚UI／召喚ゾーンモーダル／CPU 召喚／engine の効果配置の4経路）。
  // 絞り込みキー無し＝**すべてのシグニ**（「他の」＝このシグニ自身は既に場にいるので新規配置は全部「他の」）。
  // `turns:1`＝このターンのみ（`clearTurnEndScopedState` のカウントダウンで失効）。
  if (t.match(/^このターン、あなたは他のシグニを場に出せない/))
    return { type: 'SIGNI_DEPLOY_BAN', owner: 'self', turns: 1 } as SigniDeployBanAction;

  // ---- このターン、あなたは１以上のエナコストを支払えない（§6.4 O-3）----
  // 支払い元 funnel（`buildEnergyPayPool`）を空にする＝**《色×0》のコストは通り、1以上は通らない**。
  // `blocked_actions` の接尾辞なしエントリはターン終了時に失効する（`clearTurnEndScopedState`）。
  if (t.match(/^このターン、あなたは[１以上０-９\d]+のエナコストを支払えない/))
    return {
      type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 },
      actionId: 'PAY_ENERGY_COST',
    } as BlockActionAction;

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
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_life', count: 1 } } as StubAction;

  // ---- それらのカードを入れ替えてもよい / カードとデッキ上カードを入れ替えてもよい ----
  if (t.match(/とデッキの一番上のカードを入れ替えてもよい/) ||
      t.match(/それらを好きな順番でデッキの一番上に置く/))
    return { type: 'STUB', id: 'DEFERRED_SWAP_WITH_DECK_TOP' } as StubAction;

  // ---- 手札を好きな枚数捨てる ----
  if (t.match(/^あなたは手札を好きな枚数捨てる$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL', upToCount: true } };
  // 「手札からシグニを好きな枚数捨てる」も `parseVariableHandDiscard` が受ける（旧 no-op STUB は撤去）。

  // ---- 手札から〈クラス〉/特定カードを捨ててもよい（条件付き） ----
  if (t.match(/対戦相手のエナゾーンにカードが[１-９\d０-９]+枚以上ある場合、手札から/) ||
      t.match(/このターンにあなたが効果によってカードを[１-９\d０-９]+枚以上引いていた場合.*手札を/) ||
      t.match(/あなたの手札が[１-９\d０-９]+枚以上ある場合.*手札から/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- エナゾーンに置いてもよい（シグニ → エナ転換） ----
  if (t.match(/そのアタック終了時.*エナゾーンから.*シグニ.*場にあるこのシグニをエナゾーンに置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP', underCardOp: { op: 'self_to_energy' } } as StubAction;

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

  // （「次のターンの間、対戦相手はそのシグニゾーンにシグニを新たに配置できない」は
  //   parseSentencePart3 の BLOCK_OPP_ZONE_PLACEMENT へ統合＝タスク12(lxi) 第10波。
  //   ここにあった no-op STUB(LRIG_GROW_RESTRICT) への退避は退役した）

  // ---- あなたの能力として発動する） ----
  if (t.match(/あなたの能力として発動する[）)）]/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- これを取り除く（単独文） ----
  if (t.match(/^これを取り除く$/))
    return { type: 'STUB', id: 'REMOVE_VIRUS' } as StubAction;

  // ---- 手札をすべて捨ててもよい（全捨て任意） ----
  if (t.match(/^手札をすべて捨ててもよい$/))
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' }, optional: true };

  // ---- 対戦相手は手札を裏向きでN束に分ける ----
  if (t.match(/対戦相手は手札を裏向きで[１-９\d０-９]+つの束に分ける/) ||
      t.match(/どちらかの束を選び、対戦相手はその束を捨てる/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- ライフクロスをすべて見て〜場に出すかエナゾーン ----
  // ⚠**所有者を原文から取る**（`WX25-P2-026-E2` は「**あなたの**ライフクロスをすべて見て」）＝
  //   engine の旧 regex は所有者を一切見ず、**常に対戦相手のライフを覗いていた**。
  if (t.match(/ライフクロスをすべて見て.*場に出すかエナゾーンに置き/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: /対戦相手のライフクロスをすべて見て/.test(t) ? 'opp_life' : 'self_life', count: 'ALL' } } as StubAction;

  // ---- カードをルリグゾーンに裏向きで置く ----
  if (t.match(/カードを[１-９\d０-９]*枚?まで?ルリグゾーンに裏向きで置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 〈誰か〉の場に〈X〉がない場合、手札をN枚捨てる（§6.4 O-11・`CONDITIONAL_POWER_BONUS` の解体）----
  // 🔴従来は catch-all の `CONDITIONAL_POWER_BONUS`＝**丸ごと無言 no-op**（ハンドラは原文から
  //   `＋N`/`－N` のパワー値を読む分岐しか持たず、この文型は最後の `done(addLog())` に落ちる）。
  //   前段の「カードを１枚引く」だけが走り、**デメリットの手札捨てが一切起きない**片翼状態だった。
  // ⚠この条件系には NOT ラッパが無いので `HAS_CARD_IN_FIELD{negate:true}` で否定を表す。
  {
    const noneFieldM = t.match(/^(あなた|対戦相手)の場に(凍結状態のシグニ|レゾナ)がない場合、手札を([１-９\d０-９]*)枚捨てる$/);
    if (noneFieldM) {
      const filter: TargetFilter = noneFieldM[2] === '凍結状態のシグニ'
        ? { cardType: 'シグニ', isFrozen: true }
        : { cardType: 'レゾナ' };
      return {
        type: 'CONDITIONAL',
        condition: { type: 'HAS_CARD_IN_FIELD', owner: noneFieldM[1] === 'あなた' ? 'self' : 'opponent', filter, negate: true },
        then: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: noneFieldM[3] ? parseNum(noneFieldM[3]) : 1 } },
      } as EffectAction;
    }
  }

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
  // 🆕**§5.3 `O-60` 第64バッチ（2026-09-04）＝`DEFERRED_` へ改名**（旧＝catch-all
  //   `STUB{GRANT_QUOTED_ABILITY}`＝engine が効果元の原文を読み直す形＝`O-60` A群）。
  //   実測 live 2効果はどちらも**無言 no-op** だった（`WXDi-P05-005-E1` は同じ効果の
  //   `GAIN_ABILITY_THIS_GAME` が既に宣言を立てていた二重表現／`WXDi-D04-011-E1` は
  //   付与先が自場シグニに絞られてログだけ＝`O-236` 機構待ち）。
  // ⚠ここへ来る文は「『…』」だけで**付与先が書かれていない**（付与先は前の文にある）＝
  //   受け皿を推測せず、逆翻訳に【未実装】を出して計器に残す。
  if (t.match(/^『【常】：/))
    return { type: 'STUB', id: 'DEFERRED_GRANT_QUOTED_ABILITY_BLOCK' } as StubAction;

  // ---- 手札から《ガードアイコン》を持つシグニを捨てる ----
  if (t.match(/手札から《ガードアイコン》を持つシグニを.+捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの場にあるシグニが持つ色がN種類以上ある場合 ----
  if (t.match(/あなたの場にあるシグニが持つ色が合計[１-９\d０-９]+種類以上ある場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札からカードをN枚エナゾーンに置く ----
  // 🔴2026-08-16（§6.4 O-11）＝従来は**ペイロードの無い `STUB{OPTIONAL_COST}`** に落としていた＝
  //   `resolveOptionalCostSpec` が空 spec を返し「発動する／スキップ」を出すだけで**何も動かない真 no-op**。
  //   しかもこれは**任意コストではなく効果本体の必須動作**（`WD20-004`「カードを1枚引き、手札から
  //   カードを1枚エナゾーンに置く」／`WDK07-E12`／`WX22-029`）＝デメリットが丸ごと踏み倒されていた。
  // 🔑正準形は `ENERGY_CHARGE{target:HAND_CARD}`＝任意コストの `handToEnergy` 支払いステップが
  //   既に使っている形（`execUtils.ts` の `optionalCostPaySteps`）。**新しい型は要らない。**
  {
    const handToEnergyM = t.match(/^手札からカードを([１-９\d０-９]+)枚エナゾーンに置く$/);
    if (handToEnergyM) {
      return { type: 'ENERGY_CHARGE',
        target: { type: 'HAND_CARD', owner: 'self', count: parseNum(handToEnergyM[1]) } } as EffectAction;
    }
  }
  // ---- 手札からカードをN枚まで好きな順番でデッキの一番下に置く ----
  // 🔴同上＝bare `OPTIONAL_COST`（真 no-op）だった。行き先が明示されている必須動作なので
  //   `TRANSFER_TO_DECK{position:'bottom'}` へ。⚠「N枚**まで**」なので `upToCount` を立てる。
  {
    // ⚠**「あなたの」の前置きを許すこと**＝`^手札から` だけだと `WX25-P1-046-E1`
    //   「**あなたの**手札からカードを５枚まで…」が黙って外れ、後段の総称 `LOOK_AND_REORDER`
    //   （＝デッキを覗いて並べ替える別物）に落ちて**手札が1枚も動かない**真 no-op だった（§6.4 O-11）。
    const handToBottomM = t.match(/^(?:あなたの)?手札からカードを([１-９\d０-９]+)枚まで好きな順番でデッキの一番下に置く$/);
    if (handToBottomM) {
      return { type: 'TRANSFER_TO_DECK', shuffle: false, position: 'bottom',
        source: { type: 'HAND_CARD', owner: 'self', count: parseNum(handToBottomM[1]), upToCount: true } } as EffectAction;
    }
  }

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
  // 🆕§5.3 `O-60` 第45バッチ＝**専用 id に割った**（engine は payload も原文も読まず
  //   `lastProcessedCards` をデッキへ戻してシャッフルするだけ）。
  if (t.match(/^残りをデッキに加えてシャッフルする$/))
    return { type: 'STUB', id: 'SHUFFLE_REMAINDER_INTO_DECK' } as StubAction;

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
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- このゲームの間N回使用したのが〜回目である場合 ----
  if (t.match(/このゲームの間にあなたがこの【起】を使用したのが[１-９\d０-９]+回目である場合/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- この方法でトラッシュに置かれたシグニのレベルの合計がNの場合、その中から〜を手札に加える（WXK05-028-E3）----
  // §6.4 O-11。条件（`LAST_PROCESSED_LEVEL_SUM`）も帰結（`PICK_FROM_TRASHED_CARDS` の
  // `trashedPick`＝候補を `lastProcessedCards` に限定）も**既に機構がある**＝要るのはこの規則だけ。
  // 🔴従来は下の catch-all `CONDITIONAL_POWER_BONUS` に飲まれて**丸ごと無言 no-op**だった。
  {
    const lvSumPickM = t.match(/^この方法で(?:デッキから)?トラッシュに置かれたシグニのレベルの合計が([１-９\d０-９]+)(以上|以下)?の場合、その中から(シグニ|カード)([１-９\d０-９]+)枚(まで)?を?手札に加える$/);
    if (lvSumPickM) {
      return {
        type: 'CONDITIONAL',
        condition: {
          type: 'LAST_PROCESSED_LEVEL_SUM',
          operator: lvSumPickM[2] === '以上' ? 'gte' : lvSumPickM[2] === '以下' ? 'lte' : 'eq',
          value: parseNum(lvSumPickM[1]),
        },
        then: {
          type: 'STUB', id: 'PICK_FROM_TRASHED_CARDS',
          trashedPick: {
            count: parseNum(lvSumPickM[4]),
            ...(lvSumPickM[5] ? { upTo: true } : {}),
            ...(lvSumPickM[3] === 'シグニ' ? { filter: { cardType: 'シグニ' as const } } : {}),
            dest: 'hand' as const,
          },
        } as StubAction,
      } as EffectAction;
    }
  }

  // ---- レベル合計がNの場合〜 ----
  if (t.match(/レベルの合計が[１-９\d０-９]+の場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- それを【シード】として出すかエナゾーンに置く ----
  if (t.match(/シード.*出すか.*エナゾーンに置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 対戦相手のシグニがこのシグニの正面〜 (AUTO trigger) ----
  if (t.match(/対戦相手のシグニ.*がこのシグニの正面のシグニゾーンに出たとき/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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

  // ---- 《X》N枚と《Y》N枚を公開する（特定カード名公開）----
  // レゾナクラフトの「2枚を公開→どちらか1枚を裏向きでルリグデッキへ」型（G039）の前段。
  // 公開自体はゲーム効果を持たず、後続 ADD_CARD_TO_LRIG_DECK_HIDDEN が原文から候補名を再解析するため no-op 扱い。
  if (t.match(/《[^》]+》[１-９\d０-９]*枚と《[^》]+》[１-９\d０-９]*枚を公開する/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 好きな生徒との絆を獲得する（デッキからカード選択） ----
  if (t.match(/好きな生徒.+との絆を獲得する/))
    return { type: 'GAIN_BOND', source: 'declared' } as import('../../types/effects').GainBondAction;

  // ---- この方法で公開した生徒との絆を獲得する ----
  if (t.match(/この方法で公開した生徒との絆を獲得する/))
    return { type: 'GAIN_BOND', source: 'last_found' } as import('../../types/effects').GainBondAction;

  // ---- あなたの場に他の＜C＞のシグニがある場合、対戦相手の〔レベルN**か**〈色〉〕のシグニをトラッシュ（WX25-CP1-056-E1）----
  // 🔴従来は catch-all の `CONDITIONAL_POWER_BONUS`＝**丸ごと無言 no-op**。
  // 条件（`HAS_CARD_IN_FIELD{excludeSelf}`）も帰結も既存語彙で表せるが、汎用の条件持ち上げは
  // **帰結節が単体で UNKNOWN になると catch-all へ委ねる**（ガードB）ため届かなかった。
  // 🔑届かない理由は「レベル３**か**白のシグニ」＝**種別の違う OR** で、`anyOf`（matchesFilter が再帰評価）が要る。
  {
    const otherClassTrashM = t.match(/^あなたの場に他の＜([^＞]+)＞のシグニがある場合、対戦相手のレベル([０-９\d]+)か([白赤青緑黒])のシグニ([０-９\d]+)体を対象とし、それをトラッシュに置く$/);
    if (otherClassTrashM) {
      return {
        type: 'CONDITIONAL',
        condition: {
          type: 'HAS_CARD_IN_FIELD', owner: 'self',
          filter: { cardType: 'シグニ', story: otherClassTrashM[1] }, excludeSelf: true,
        },
        then: {
          type: 'TRASH',
          target: {
            type: 'SIGNI', owner: 'opponent', count: parseNum(otherClassTrashM[4]), upToCount: false,
            filter: { cardType: 'シグニ', anyOf: [{ level: parseNum(otherClassTrashM[2]) }, { color: otherClassTrashM[3] }] },
          },
        },
      } as EffectAction;
    }
  }
  if (t.match(/あなたの場に他の[＜〈<].+[＞〉>]のシグニがある場合、対戦相手のレベル.+のシグニ.+対象とし、それをトラッシュに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- このシグニが対戦相手の能力か効果の対象になったとき、裏向き/表向きにする ----
  if (t.match(/このシグニが対戦相手の.*対象になったとき.*裏向きにし、表向きにする/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- 手札から〈クラス〉のカードをN枚まで公開してもよい ----
  if (t.match(/あなたの手札から[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚?まで(?:公開|捨て)(?:てもよい)?$/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 対戦相手のアタックフェイズ開始時、手札から捨ててもよい ----
  if (t.match(/対戦相手のアタックフェイズ開始時、手札から.*捨ててもよい/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
    return { type: 'REVEAL', source: { type: 'HAND_CARD', owner: 'self', count: 'ALL' }, optional: true };

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
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- このアーツによってルリグが得た能力 ----
  if (t.match(/このアーツによってあなたのルリグが得た能力は/))
    return { type: 'STUB', id: 'GRANT_LRIG_ABILITY' } as StubAction;

  // ---- 対戦相手のレベルN以下のシグニを対象とし手札から〜捨ててもよい ----
  if (t.match(/対戦相手のレベル[０-９\d０-９]+以[下上]のシグニ[１-９\d０-９]*体?を対象とし、手札から.*捨ててもよい/))
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;

  // ---- 公開されたカードをシャッフルしてデッキ下に置く ----
  if (t.match(/^公開されたカードをシャッフルしてデッキの一番下に置く$/))
    return { type: 'STUB', id: 'DEFERRED_SHUFFLE_REVEALED_TO_DECK_BOTTOM' } as StubAction;

  // ---- 対戦相手のシグニを好きな数対象とし、パワーを合計でN減らす ----
  if (t.match(/対戦相手のシグニを好きな数対象とし.*それらのパワーを合計で[＋－][０-９\d０-９]+する/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- あなたのデッキの一番下のカードをN枚トラッシュに置く（§6.4 O-11）----
  // 🔴従来は catch-all の `CONDITIONAL_POWER_BONUS`＝**丸ごと無言 no-op**で、
  //   後続の「それが〈条件〉の場合、〜」だけが（条件も落ちたまま）無条件に走っていた
  //   （`WXK03-040-E1`＝ミルせずに**トラッシュの任意のレベル１シグニ**を場に出す／
  //     `WXDi-CP01-033-E1`＝ミルせずに**無条件で＋5000**）。
  // 🔑正準形 `MILL{fromBottom:true}` は**最初から在った**（`PR-K049`／`WXK02-055` が使っている）＝
  //   足りなかったのはこの1規則だけ。`execMill` が `lastProcessedCards` にミル札を残すので
  //   後続の「それが〜の場合」（`LAST_PROCESSED_*`）がそのまま繋がる。
  {
    const bottomMillM = t.match(/^あなたのデッキの一番下の(?:カードを|カード)([０-９\d]+)?枚?トラッシュに置く$/);
    if (bottomMillM) {
      return { type: 'MILL', owner: 'self', count: bottomMillM[1] ? parseNum(bottomMillM[1]) : 1, fromBottom: true } as EffectAction;
    }
  }

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

  // 「手札からスペルを好きな枚数捨てる」も `parseVariableHandDiscard` が受ける（旧 no-op STUB は撤去）。

  // ---- この方法であなたのセンタールリグのレベル以下のシグニがトラッシュに置かれた場合 ----
  if (t.match(/この方法であなたのセンタールリグのレベル以下のシグニがトラッシュに置かれた場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 対戦相手のシグニ１体が場に出たとき（自動能力） ----
  if (t.match(/対戦相手のシグニ[１-９\d０-９]*体?が場に出たとき/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- そのシグニをトラッシュに置く（単独文） ----
  if (t.match(/^そのシグニをトラッシュに置く$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- グロウする際、手札からシグニを公開してもよい ----
  if (t.match(/このカードにグロウする際、手札から.*シグニ.*を?公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- あなたの他のすべてのシグニをトラッシュに置く ----
  if (t.match(/^あなたの他のすべてのシグニをトラッシュに置く$/))
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { excludeSelf: true } } };

  // ---- この方法で手札を1枚捨てなかった場合、このシグニをトラッシュ ----
  if (t.match(/この方法で手札を[１-９\d０-９]+枚捨てなかった場合、このシグニを場からトラッシュに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このターン、次にスペルを使用するコストが変わる ----
  if (t.match(/このターン、あなたが次にスペルを使用する場合.*使用コストは/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 各アタックフェイズ開始時、裏向きのシグニゾーンに〜場合 ----
  if (t.match(/各アタックフェイズ開始時、裏向きの.*場合/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
  // 🆕§5.3 `O-83`＝**ルール注記ではなく実効ルール**（旧 `RULE_REMINDER_TEXT` は engine で完全な no-op ＝
  //   効果でグロウしたルリグの【出】が普通に発動する過剰実行だった）。直前の `GROW_BY_EFFECT` の予約へ載せる。
  if (t.match(/この方法でグロウしたルリグの【出】能力は発動しない/))
    return { type: 'STUB', id: 'GROW_BY_EFFECT_SUPPRESS_ON_PLAY' } as StubAction;

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
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- 対戦相手の手札を見て無色ではないカードを選ぶ ----
  // 🔴§5.3 `O-60` 第1バッチ＝連用形「見**て**」で engine の終止形 regex に当たらず、
  //   **相手のライフクロスを覗いていた**（`WDK09-017-E1`）。
  if (t.match(/対戦相手の手札を見て無色ではないカードを[１-９\d０-９]*枚?まで?選ぶ/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_hand', count: 'ALL' } } as StubAction;

  // ---- 公開したカードを手札に加える（単独文） ----
  if (t.match(/^公開したカードを手札に加える$/))
    return { type: 'ADD_TO_HAND', owner: 'self' };

  // ---- あなたのトラッシュから〈クラス〉のシグニをトラッシュ置き換えでシグニゾーンに ----
  if (t.match(/あなたのトラッシュから[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*枚を対象とし.*シグニ.*場からトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'TRADE_BANISH_SELF_SIGNI' } as StubAction;

  // ---- エナゾーンのシグニをデッキ一番下に置いてもよい ----
  if (t.match(/あなたの[＜〈<].+[＞〉>]のシグニ[１-９\d０-９]*体?を場からデッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 各プレイヤーは手札をすべてエナゾーンに置く（WX24-P2-026-E2）----
  // 🔴従来は `MASS_TRASH`＝**相手のエナ全部と相手の場のシグニ全部をトラッシュする**別物だった
  //   （行き先も対象も原文と無関係／§6.4 O-11 の `SEND_TO_ENERGY` 群）。両プレイヤーぶんの
  //   `ENERGY_CHARGE{HAND_CARD, count:'ALL'}` へ正準化する（count:'ALL' は対話なしで全部動く）。
  if (t.match(/^各プレイヤーは手札をすべてエナゾーンに置く$/))
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } },
        { type: 'ENERGY_CHARGE', target: { type: 'HAND_CARD', owner: 'opponent', count: 'ALL' } },
      ],
    } as SequenceAction;

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
  // 🆕**`DEFERRED_` へ改名した**（§5.3 `O-60` 第56バッチ・2026-09-03）＝上と同じ理由
  //   （`WXDi-P10-047-E1` は**デッキの一番上とエナゾーンのこのシグニを入れ替える**効果で、
  //   旧 id `SWAP_OPTIONAL` では**自分の場のシグニをゾーン移動する UI** が開いていた）。`O-229`。
  if (t.match(/そのカードとエナゾーンにあるこのシグニを入れ替えてもよい/))
    return { type: 'STUB', id: 'DEFERRED_SWAP_DECK_TOP_WITH_SELF_IN_ENERGY' } as StubAction;

  // ---- あなたの効果によって対戦相手が手札を捨てたとき ----
  if (t.match(/あなたの効果によって対戦相手が手札を[１-９\d０-９]*枚捨てたとき/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
    return { type: 'STUB', id: 'DEFERRED_REMAINDER_TO_LIFE_TOP' } as StubAction;

  // ---- 引いた枚数と同じ枚数をデッキの下に置く ----
  if (t.match(/この方法で引いたカードの枚数と同じ枚数のカードを手札から.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'DEFERRED_DRAWN_COUNT_HAND_TO_DECK_BOTTOM' } as StubAction;

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

  // ---- 「〈誰か〉のライフクロス１枚をエナゾーンに置く」＝ライフ→エナ（§6.4 O-35・続き530）----
  // engine 実装済み＝`STUB{LIFE_TO_ENERGY, owner}`（`execStubPart1.ts`＝そのプレイヤーのライフ上1枚を
  // 同じプレイヤーのエナゾーンへ。**クラッシュではない**のでライフバーストは発動しない）。
  // 🔴従来は素の綴りに規則が無く、`WX25-CP1-020-E2` は条件節ごと下の受け皿 `CONDITIONAL_POWER_BONUS` に
  //   落ちて**ライフ→エナが一度も起きない無言 no-op** だった（機構は最初から在った＝純粋な parser 穴）。
  // ⚠**下の「〜の場合、」形より先に置く**（条件節を先に持ち上げた残りがここへ来る）。
  {
    const l2eM = t.match(/^(対戦相手|あなた)のライフクロス[１1]枚をエナゾーンに置く$/);
    if (l2eM) return { type: 'STUB', id: 'LIFE_TO_ENERGY', owner: l2eM[1] === 'あなた' ? 'self' : 'opponent' } as StubAction;
    // 🆕**主語つきの「〈誰か〉は自分のライフクロス１枚を〜」**（§5.3 `O-60` 第60バッチ・2026-09-03・`SP38-004-E1`②）。
    // ⚠所有者は**主語**が決める（「自分の」は主語を指す）＝`あなたの/対戦相手の` の形だけを見ると向きが落ちる。
    const l2eSubjM = t.match(/^(対戦相手|あなた)は自分のライフクロス[１1]枚をエナゾーンに置く$/);
    if (l2eSubjM) return { type: 'STUB', id: 'LIFE_TO_ENERGY', owner: l2eSubjM[1] === 'あなた' ? 'self' : 'opponent' } as StubAction;
  }

  // ---- 赤の場合、対戦相手のライフクロスをエナゾーンに置く ----
  // ⚠残っているのは条件節を持ち上げられない形だけ（`WXK09-003-E1`＝MANUAL 済み）。live 0件。
  if (t.match(/.*の場合、対戦相手のライフクロス.*エナゾーンに置く/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

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
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- 使用コストはセンタールリグのレベルにつきN減る ----
  if (t.match(/使用コストは.*センタールリグのレベル.*減る/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- 「このターンが対戦相手のターンで、あなたがベットしていなかった場合、次のあなたのターンをスキップする」----
  // `WD20-006-E1`（ベット アーツ）のデメリット節。✅続き491 で実装＝`SKIP_NEXT_TURN`（`skip_next_turn` 予約）。
  // ⚠🔴**条件節（2つとも）を落とさない**＝従来の受け皿 STUB は条件ごと消えていたので、実装だけ足すと
  //   「ベットしていても自分のターンでも必ず次のターンを飛ばす」**過剰実行**になる。
  //   ベット判定は `IS_BETTING{negate:true}`／ターン判定は `TURN_OWNER{owner:'opponent'}`（`ctx.isOwnerTurn`）。
  if (t.match(/ベットしていなかった場合.*ターンをスキップする/)) {
    const conditions: import('../../types/effects').Condition[] = [];
    if (/この(?:ターン|とき)が対戦相手のターンで/.test(t)) conditions.push({ type: 'TURN_OWNER', owner: 'opponent' });
    conditions.push({ type: 'IS_BETTING', negate: true });
    return {
      type: 'CONDITIONAL',
      condition: conditions.length === 1 ? conditions[0] : { type: 'AND', conditions },
      then: { type: 'STUB', id: 'SKIP_NEXT_TURN' } as StubAction,
    } as import('../../types/effects').ConditionalAction;
  }

  // ---- 対象のシグニは選んだ能力を得る ----
  if (t.match(/対象のシグニ.*選んだ能力を得る/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // 🏁**§5.3 `O-60` 第61バッチ（2026-09-03）＝`BET_CONDITION` ハンドラを engine ごと撤去した。**
  //   ベットの昇格は**選択数**なら `CHOOSE{betChoose}`、**対象枚数**なら `CONDITIONAL{IS_BETTING}`
  //   （`effectParser.ts` の「ベットで対象枚数が増える型」）が受け皿。live 0。

  // ---- シグニがトラッシュから場に出たとき、払い、トラッシュに置いてもよい ----
  if (t.match(/のシグニ.*がトラッシュから場に出たとき.*払い.*トラッシュに置いてもよい/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
  // 🆕**機構が入った（§6.4 O-3・続き497）**＝`attackedThisTurn` フィルタ＋`OPTIONAL_COST{trashOwnKey}`。
  // 🔴従来は受け皿 STUB のまま後続が汎用の `BANISH{owner:'self'}` に落ち、
  //   **相手のターン終了時に自分のシグニを1体タダでバニッシュする**過剰実行＋対象取り違えだった（実測）。
  // ⚠対象は**対戦相手**（原文は「対戦相手のターン終了時」＝そのターンにアタックしたのは相手）。
  {
    const atkKeyM = t.match(/このターンにアタックしたシグニを([０-９\d一二三四五六七八九十]+)体(まで)?対象とし[、,].*?ルリグトラッシュに置いてもよい/);
    if (atkKeyM) {
      const target = {
        type: 'SIGNI', owner: 'opponent', count: parseNum(atkKeyM[1]),
        ...(atkKeyM[2] ? { upToCount: true } : {}),
        filter: { cardType: 'シグニ', attackedThisTurn: true },
      } as const;
      return { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: target } as EffectAction,
        { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' } as EffectAction,
        { type: 'STUB', id: 'OPTIONAL_COST', trashOwnKey: true } as EffectAction,
        // 🔴**帰結の体数は「宣言側」に揃える**（2026-08-24・V-35(b) の実機で発見）＝原文は
        //   「シグニを**２体まで**対象とし…**それら**をバニッシュする」なのに、ここが `count:1` 固定だったため
        //   **2体を対象宣言してキーを払っても1体しか消えなかった**（`targetsStored` は候補を絞るだけで
        //   体数は `target.count` から取る＝`execBanish`）。汎用の `bindToStoredTarget` が同じ是正を
        //   持っているのにこの規則だけ自前で組み立てていて漏れていた。
        //   ⚠**母集団は実測1件**（`targetsStored` を持つ live 170アクションのうち、宣言 count>1 なのに
        //     実行 count=1 なのは `WDK06-R09-E1` だけ）。
        { type: 'CONDITIONAL', condition: { type: 'PAID_ADDITIONAL_COST' },
          then: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: target.count,
            ...(target.upToCount ? { upToCount: true } : {}), filter: { cardType: 'シグニ' } }, targetsStored: true } } as EffectAction,
      ] } as EffectAction;
    }
  }

  // ---- トラッシュにある〈X〉のシグニN枚につき±Nする ----
  if (t.match(/トラッシュにある.*のシグニ[１-９\d０-９]+枚につき/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- シグニゾーンにシグニがある場合、手札に戻してから開花する（§6.4 O-3 続き498）----
  // ⚠これは**開花そのものの置換**なので、後続ステップのままだと間に合わない（開花は「シグニあり＝不発」で
  //   先に終わる）。`parseActionTextInner` の SEQUENCE 畳み込みが直前の `SEED_BLOOM` の
  //   `bounceOccupant` へ移す＝ここではマーカーを返すだけ（`DEFERRED_` は付けない＝機構は実装済み）。
  if (t.match(/シグニゾーンにシグニがある場合.*手札に戻してから開花する/))
    return { type: 'STUB', id: 'SEED_BLOOM_BOUNCE_OCCUPANT' } as StubAction;

  // ---- それぞれレベルの異なるシグニN枚が公開された場合、追加で ----
  if (t.match(/それぞれレベルの異なるシグニ[１-９\d０-９]+枚が公開された場合/))
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;

  // ---- 手札が５枚より多い場合、その差の分だけ手札からカードをエナゾーンに置く（WDK08-Y08-E1）----
  // 🔴従来は `CONDITIONAL_POWER_BONUS`（パワー修正の catch-all）＝**丸ごと無言 no-op**で、
  //   前半の「エナ全部を手札へ」だけが走る一方通行になっていた（§6.4 O-11 の `SEND_TO_ENERGY` 群）。
  // 可変枚数は `{$ref:'self_hand_over_five'}`（手札枚数−5・下限0）＝`seven_minus_self_life_count` と同型。
  // ⚠live は「５枚」の1形しかないので閾値は 5 に限定する（他の閾値が出たら ref を増やす）。
  // ⚠上流の条件節スプリッタが「〜場合、」で切るので**帰結節だけ**が来るのが実経路＝そちらは条件を
  //   二重に被せない（外側の CONDITIONAL{HAND_COUNT gt 5} が既に付いている）。
  {
    const handExcessM = t.match(/^(あなたの手札が５枚より多い場合、)?その差の分だけ手札からカードをエナゾーンに置く$/);
    if (handExcessM) {
      const charge: EffectAction = {
        type: 'ENERGY_CHARGE',
        target: { type: 'HAND_CARD', owner: 'self', count: { $ref: 'self_hand_over_five' } },
      } as EffectAction;
      return handExcessM[1]
        ? ({ type: 'CONDITIONAL', condition: { type: 'HAND_COUNT', owner: 'self', operator: 'gt', value: 5 }, then: charge } as EffectAction)
        : charge;
    }
  }

  // ---- 対戦相手のトラッシュから〜デッキの一番下に置く ----
  if (t.match(/対戦相手のトラッシュから.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 対象のシグニを他のシグニゾーンに配置してもよい ----
  if (t.match(/対象のシグニ.*他のシグニゾーンに配置してもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- 指定されたシグニゾーンにあるシグニのパワーをそのシグニのレベルにつきNする ----
  // ⚠「レベル**１**につき」は Part1 の `POWER_MODIFY{deltaPerTargetLevel}` が先に取る（§6.4 O-16(a)）。
  //   ここへ残るのは**除数つき**（「レベル２につき」等・live 0件）＝受け皿が無いので STUB のまま見える化する。
  if (t.match(/指定されたシグニゾーンにあるシグニのパワーを.*レベル.*につき/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- チャームをトラッシュに置いてもよい（コスト支払い） ----
  if (t.match(/【チャーム】.*枚をトラッシュに置いてもよい/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 残りを好きな順番でデッキの一番上に置く ----
  if (t.match(/^残りを好きな順番でデッキの一番上に置く$/))
    return { type: 'STUB', id: 'DEFERRED_REMAINDER_TO_DECK_TOP_ORDERED' } as StubAction;

  // 🏁**2026-09-02（§5.3 `O-151`）に catch-all `それらのパワーを(合わせて|合計で)` を撤去した。**
  //   この枝は「対象宣言が同じ文に無い」2効果のためだけに残していた保留枝で、
  //   `WX24-P2-009-E1`（続き725）と `PR-K026-E1-G2`（今回）が **`manualEffects.ts` で
  //   `POWER_MODIFY{targetsStored, splitTotal}` へ移った**ので母集団が0になった。
  //   ⚠**死んだ枝は catch-all の温床**（§5.3 第5バッチの教訓）＝残さない。
  //   同じ文に「〈owner〉のシグニを好きな数／N体まで対象とし」がある形は `parseSentencePart3` が
  //   `POWER_MODIFY{splitTotal}` を返す＝そちらが本線。

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
  // 🆕§5.3 `O-60` 第45バッチ＝**typed `LOOK_AND_REORDER` を出す**（枚数は payload）。
  {
    const dupLookM = t.match(/デッキの上からカードを([１-９\d０-９]+)枚を見る/);
    if (dupLookM) {
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'deck', owner: 'self' },
        count: parseNum(dupLookM[1]),
        private: true,
        destination: { location: 'deck', owner: 'self', position: 'top' },
      } as EffectAction;
    }
  }

  // ---- スペルを使用する場合、コストに含まれるエナコストを代わりに《無》として支払ってもよい ----
  if (t.match(/スペルを使用する場合.*代わりに《無》として支払ってもよい/))
    return { type: 'STUB', id: 'ARTS_COST_REDUCTION_BY_EFFECT' } as StubAction;

  // ---- そのカードと対戦相手のデッキの一番上のカードを入れ替えてもよい ----
  if (t.match(/そのカードと.*デッキの一番上のカードを入れ替えてもよい/))
    return { type: 'STUB', id: 'LRIG_UNDER_CARD_OP' } as StubAction;

  // ---- デッキの上からカードをN枚トラッシュに置きカードをN枚見る ----
  if (t.match(/デッキの上から、?カードを[１-９\d０-９]+枚トラッシュに置きカードを[１-９\d０-９]+枚見る/))
    return { type: 'STUB', id: 'DEFERRED_MILL_THEN_LOOK' } as StubAction;

  // ---- 見たカードの中から《X》を〜ダウン状態で場に出し、残りをデッキの一番下に置く ----
  if (t.match(/見たカードの中から.*場に出し.*残りを.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'REVEAL_PICK_PLAY' } as StubAction;

  // ---- 《ガードアイコン》を持たないカード〜デッキの一番下に置いてもよい ----
  if (t.match(/《ガードアイコン》を持たないカード.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'DEFERRED_OPP_HAND_NON_GUARD_TO_DECK_BOTTOM' } as StubAction;

  // ---- 手札〜ルリグゾーンに裏向きで置く（§6.4 O-3）----
  // ⚠旧 `SOUL_OP` は**カード全文 regex で分岐する別機構**（ルリグの下／ルリグトラッシュ操作）で、
  //   この文型に該当する分岐が1つも無く**丸ごと no-op** だった（`WXDi-P09-066-E1`）。
  //   ＝後続の「次の対戦相手のターン終了時、そのカードを手札に加える」も参照先を失う。
  {
    const fdHandM = t.match(/^(?:あなたの)?手札を([１-９\d０-９]+)枚(まで)?ルリグゾーンに裏向きで置く$/);
    if (fdHandM) {
      return {
        type: 'PLACE_FACEDOWN_LRIG_ZONE', source: 'hand',
        count: parseNum(fdHandM[1]),
        ...(fdHandM[2] ? { upToCount: true } : {}),
      } as EffectAction;
    }
  }

  // 「次の対戦相手のターン終了時、そのカードを手札に加える」の旧規則（汎用 `LOOK_AND_REORDER`）は削除した
  // （§6.4 O-3 続き498）。`parseSentencePart1` 冒頭の遅延タイミング宣言が先に食うので**到達不能**であり、
  // 本文の解決は `rewriteNextOppTurnEndBody`（＝`RETURN_FACEDOWN_LRIG_ZONE_TO_HAND` への詰め替え）が行う。

  // ---- メインフェイズの間、デッキからシグニがトラッシュに置かれたとき、場に出す ----
  if (t.match(/メインフェイズの間.*デッキから.*シグニ.*がトラッシュに置かれたとき.*場に出す/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- デッキをシャッフルし一番上のカードを公開し手札に加える ----
  // 🆕**§5.3 `O-60` 第59バッチ（2026-09-03）＝枚数は payload（`count`）で渡す**（この文型は常に1枚）。
  //   🔴旧 engine は `カードを([０-９\d]+)枚引く` を**アビリティブロック**に当てて枚数を決めていたが、
  //     この文型の原文にその句は無い＝**必ず外れて既定1**だった（＝たまたま正しい数だった）。
  //   ⚠**「シャッフル」と「公開」は依然として落ちている**＝後段の「この方法で公開されたカードが
  //     【ライフバースト】を持つ場合」が判定できない（§5.3 `O-232` に登録）。
  if (t.match(/デッキをシャッフルし.*一番上のカードを公開し手札に加える/))
    return { type: 'STUB', id: 'DRAW', count: 1 } as StubAction;

  // ---- 対戦相手のシグニ〜体を対象とし、以下からN以上選ぶ ----
  if (t.match(/対戦相手のシグニ.*体を対象とし、以下から[１-９\d０-９]*つを選ぶ/))
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_FROM_CONTEXT_CHOOSE' } as StubAction;

  // ---- 〈X〉のシグニをN枚捨てるか手札をN枚捨てる ----
  if (t.match(/のシグニを[１-９\d０-９]+枚捨てるか手札を[１-９\d０-９]+枚捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- このカードが捨てられたとき、手札を〜してもよい ----
  if (t.match(/このカードが捨てられたとき/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- アタックフェイズの間、エナコストを支払う際、シグニの下のカードをトラッシュに置いて支払える ----
  if (t.match(/アタックフェイズの間.*エナコストを支払う際.*シグニの下にあるカードを.*トラッシュに置いて支払える/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- この方法でエナコストはNターンにN以上しか支払えない ----
  if (t.match(/この方法でエナコストは.*ターンに.*しか支払えない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- このシグニの下にあったカードをトラッシュからエナゾーンに置く ----
  const leftUnderToEnergyM = t.match(/このシグニの下にあったカード([０-９\d]+)枚(まで)?を対象とし.*エナゾーンに置く/);
  if (leftUnderToEnergyM)
    return {
      type: 'TAKE_FROM_UNDER_SIGNI', destination: 'energy', count: parseNum(leftUnderToEnergyM[1]),
      ...(leftUnderToEnergyM[2] ? { upToCount: true } : {}), fromThis: true,
    } as TakeFromUnderSigniAction;

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
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- このカードを捨てたとき、手札を捨ててもよい ----
  if (t.match(/このカードを捨てたとき.*手札を.*枚捨ててもよい/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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
  const ctusM = t.match(/対戦相手のエナゾーンにカードが([１-９\d０-９]+)枚以上ある場合[^。]*シグニの下から[^。]*トラッシュに置いてもよい/);
  if (ctusM)
    // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝しきい値は payload（`OPP_ENERGY_EXCESS_TRASH` と共有）。
    return { type: 'STUB', id: 'CONDITIONAL_TRASH_UNDER_SIGNI', oppEnergyThreshold: parseNum(ctusM[1]) } as StubAction;

  // ---- このターン終了時、《コインアイコン》を合計N枚以上支払っていなかった場合 ----
  const cscM = t.match(/このターン終了時[^。]*《コインアイコン》を合計([１-９\d０-９]+)枚以上支払っていなかった場合/);
  if (cscM)
    // 🆕§5.3 `O-60` 第52バッチ（2026-09-03）＝しきい値は payload。
    return { type: 'STUB', id: 'COIN_SPEND_CONDITION', coinSpentMin: parseNum(cscM[1]) } as StubAction;

  // ---- 対戦相手のレベルN以上のシグニをトラッシュに置く ----
  // 🆕🔴**§5.3 `O-60` 第60バッチ（2026-09-03）＝typed `TRASH` に直した**（旧＝`STUB{BANISH}`）。
  //   ①**「トラッシュに置く」はバニッシュではない**（バニッシュ耐性を貫くし、バニッシュ時トリガーも撃たない）。
  //   ②`STUB{BANISH}` は `lastProcessedCards[0] ?? sourceCardNum` を消す形なので、
  //     **対象を1体も選ばせず**、アーツ自身を消そうとして「フィールドにない」で終わる**恒久 no-op** だった
  //     （`WX19-006-E1`①。engine の `choiceTextParser` 側だけが正しく `TRASH{level:{min:4}}` を組んでいた）。
  {
    const lvTrashM = t.match(/^対戦相手のレベル([０-９\d]+)以上のシグニ([０-９\d]+)体を対象とし[、,]それらをトラッシュに置く$|^対戦相手のレベル([０-９\d]+)以上のシグニ[１1]体を対象とし[、,]それをトラッシュに置く$/);
    if (lvTrashM) {
      const minLv = parseNum(lvTrashM[1] ?? lvTrashM[3]);
      const cnt = lvTrashM[2] ? parseNum(lvTrashM[2]) : 1;
      return {
        type: 'TRASH',
        target: { type: 'SIGNI', owner: 'opponent', count: cnt, filter: { cardType: 'シグニ', level: { min: minLv } }, upToCount: false },
      } as unknown as StubAction;
    }
  }
  if (t.match(/対戦相手のレベル[０-９\d]+以上のシグニ.*体を対象とし.*トラッシュに置く/))
    return { type: 'STUB', id: 'BANISH' } as StubAction;

  // ---- そのカードが《X》の場合、この効果を繰り返す（§6.4 O-29 の繰り返し機構待ち）----
  // 🔴従来は `CONDITIONAL_POWER_BONUS` に落としていたが、これは**無言 no-op ではなく誤発火**だった＝
  //   ハンドラの `selfPwM`（`/このシグニのパワーを([－＋]N)する/`）が**カード全文**から別の節の値を拾い、
  //   `WXDi-CP01-033-E1` は原文に無い ＋5000 を条件抜きで上乗せしていた（同カードの本体 POWER_MODIFY と
  //   合わせて二重適用）。繰り返し機構が入るまでは**明示 defer** にして誤発火を止める（`census:stubs` の
  //   A群では `DEFERRED_*` は「機構が無いと宣言済み」＝無言バグとは別枠に出る）。
  if (t.match(/そのカードが《.+》の場合、この効果を繰り返す/))
    return { type: 'STUB', id: 'DEFERRED_REPEAT_ON_REVEALED_NAME' } as StubAction;

  // ---- それらのカードを好きな順番でデッキの一番上に戻す ----
  // ⚠直前の `LOOK_AND_REORDER` の `destination`（デッキの一番上）が既に表している文＝二重処理しない。
  if (t.match(/それらのカードを好きな順番でデッキの一番上に戻す/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手の効果によって〜が場を離れる場合、〜行ってもよい ----
  if (t.match(/対戦相手の効果によって.*が場を離れる場合.*行ってもよい/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // ---- バトルによってシグニをバニッシュしたとき、〜捨ててもよい ----
  if (t.match(/バトルによってシグニ.*をバニッシュしたとき.*捨ててもよい/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

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

  // ---- デッキの一番上を見て、裏向きでルリグゾーンに置く（§6.4 O-3）----
  // ⚠旧 `SOUL_OP` は**カード全文 regex で分岐する別機構**（ルリグの下／ルリグトラッシュ操作）で、
  //   この文には該当分岐が無く**丸ごと no-op** だった＝後で「そのカードを表向きにして…」が空振りする。
  if (t.match(/デッキの一番上を見て.*裏向きでルリグゾーンに置く/))
    return { type: 'PLACE_FACEDOWN_LRIG_ZONE', source: 'deck_top', count: 1 } as EffectAction;

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
  {
    const handBottomM = t.match(/手札からカードを([１-９\d０-９]+)枚まで好きな順番でデッキの一番下に置く/);
    if (handBottomM) {
      return {
        type: 'TRANSFER_TO_DECK',
        source: { type: 'HAND_CARD', owner: 'self', count: parseNum(handBottomM[1]), upToCount: true },
        shuffle: false,
        position: 'bottom',
      } as EffectAction;
    }
  }

  // ---- シグニによってダメージを受ける場合、代わりに手札を捨ててもよい ----
  if (t.match(/シグニによってダメージを受ける場合、代わりに手札を.*捨ててもよい/))
    return { type: 'STUB', id: 'GAIN_ABILITY_THIS_GAME' } as StubAction;

  // ---- 〈X〉のシグニN体を対象とし、以下のN以上から選ぶ ----
  if (t.match(/のシグニ[１-９\d０-９]*体を対象とし、以下の[１-９\d０-９]*つから[１-９\d０-９]*つを選ぶ/))
    return { type: 'STUB', id: 'TARGET_SIGNI_CHOOSE' } as StubAction;

  // ---- 手札からカードをN枚まで裏向きでルリグゾーンに置く（§6.4 O-3）----
  {
    const facedownHandM = t.match(/手札からカードを([１-９\d０-９]*)枚(まで)?裏向きでルリグゾーンに置く/);
    if (facedownHandM) {
      return {
        type: 'PLACE_FACEDOWN_LRIG_ZONE', source: 'hand',
        count: facedownHandM[1] ? parseNum(facedownHandM[1]) : 1,
        ...(facedownHandM[2] ? { upToCount: true } : {}),
      } as EffectAction;
    }
  }

  // ---- この方法でダウンしたルリグのレベルの合計に〜カードをトラッシュに置く ----
  if (t.match(/この方法でダウンしたルリグのレベルの合計に.*枚数のカードをトラッシュに置く/))
    return { type: 'STUB', id: 'POWER_MOD_PER_COUNT' } as StubAction;

  // ---- それがレベルN以下の場合、代わりにそれをトラッシュに置く ----
  if (t.match(/それがレベル[０-９\d]+以下の場合、代わりにそれをトラッシュに置く/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 対戦相手の【Xトークン名】を好きな数取り除いてもよい ----
  if (t.match(/対戦相手の【.+】を好きな数取り除いてもよい/))
    return { type: 'STUB', id: 'REMOVE_VIRUS', virusCount: 'any', virusOptional: true } as StubAction;

  // ---- アタック終了時、このシグニを場から〜に置いてもよい ----
  if (t.match(/そのアタック終了時.*このシグニを場から.*に置いてもよい/))
    return { type: 'STUB', id: 'DEFERRED_QUOTED_ABILITY_GRANT_UNPARSED' } as StubAction;

  // 🏁**§5.3 `O-60` 第61バッチ（2026-09-03）＝`ARTS_EXTRA_COST_CONDITION` を engine ごと撤去した。**
  //   「使用する際に〈X〉を置いていた場合、代わりにKつ選ぶ」は `CHOOSE{additionalCostChoose}` が受け皿
  //   （支払いは前段の `STUB{OPTIONAL_COST, energyTrash}` が提示し、成否を `self_optional_effect_taken` に残す）。live 0。

  // ---- 手札から色の〈X〉のカードをN枚まで捨てる ----
  if (t.match(/手札から.*の[＜〈<].+[＞〉>]のカードを[１-９\d０-９]+枚まで捨てる/))
    return { type: 'STUB', id: 'OPTIONAL_COST' } as StubAction;

  // ---- 〈X〉のシグニを対象とし、トラッシュからそれぞれレベルの異なる〈X〉のシグニN枚をデッキの一番下に置いてもよい ----
  if (t.match(/のシグニ.*を対象とし.*トラッシュからそれぞれレベルの異なる.*のシグニ.*枚を.*デッキの一番下に置いてもよい/))
    return { type: 'STUB', id: 'DEFERRED_TRASH_DISTINCT_LEVEL_TO_DECK_BOTTOM' } as StubAction;

  // 「この方法でトラッシュに置いたカードの中からカードをN枚まで対象とし、エナゾーンに置く」は
  // parseSentencePart3 の `PICK_FROM_TRASHED_CARDS`（trashedPick ペイロードつき）が受ける（§6.4 O-11）。
  // 🔴従来ここに `CONDITIONAL_POWER_BONUS` へ落とす行があった＝**コメントは正しい意味を書いているのに
  //   受け皿がパワー修正の catch-all** なので、原文どおりの節が丸ごと無言 no-op だった（`WX26-CP1-057-E2`）。

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
  const lodc4aM = t.match(/すべてのプレイヤーはドローフェイズの間にカードを合計([０-９\d]+)枚までしか引けない/);
  if (lodc4aM)
    return { type: 'STUB', id: 'LIMIT_OPP_DRAW_COUNT', drawLimit: parseNum(lodc4aM[1]) } as StubAction;

  // ---- 【マルチエナ】常時能力（このシグニ自身が持つキーワード。括弧の補足付きも許容） ----
  if (t.match(/^(?:【常】：)?【マルチエナ】(?:（[^）]*）)?。?$/))
    return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, keyword: 'マルチエナ', duration: 'PERMANENT' } as EffectAction;

  // ---- 対戦相手のライフクロスを手札に加えさせる ----
  if (t.match(/対戦相手のライフクロス[１-９\d０-９]*枚?を手札に加えさせる/))
    // 🆕§5.3 `O-60` 第53バッチ（2026-09-03）＝どちらのライフかは**既存の汎用 payload `owner`**。
    // 🔴旧 engine は**カード全文**へ `/対戦相手のライフクロス.*手札に加え(?:る|させる)/` を当てて所有者を決めており、
    //   `GRANT_LRIG_ABILITY` の子として実行される `WXDi-P07-001` では **`effectId` からカードを復元する
    //   専用の逆引き**（`-sub-E\d+` の正規表現）まで必要になっていた＝原文を読むための足場が engine 側に生えていた。
    return { type: 'STUB', id: 'CRASH_LIFE_TO_HAND', owner: 'opponent' } as StubAction;

  // ---- このカードをエナゾーンから手札に加えてもよい ----
  // ⚠`filter:{thisCardOnly:true}` が無いと**エナのどのカードでも手札に戻せる過剰実行**になる
  //   （「この**シグニ**を〜」版＝上の `WX17-052-LAYER` 分岐は最初から thisCardOnly を付けており、
  //    同義の別語（シグニ／カード）で片方だけ穴が空いていた＝PLAN §4.2「同義の別キー」型）。
  if (t.match(/このカードをエナゾーンから手札に加えてもよい/))
    return { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true, filter: { thisCardOnly: true } } };

  // ---- その中から１枚をエナゾーンに置く ----
  if (t.match(/^その中から[１-９\d０-９]*枚?をエナゾーンに置く$/) || t.match(/^追加でそれをエナゾーンに置く$/))
    return { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction;

  // ---- 数字/クラス/色を宣言する（種別選択）----
  // 原文が候補クラスを列挙する形（「＜精像＞か＜精武＞か…から１つを宣言する」PR-431）。従来は UNKNOWN で
  // **宣言そのものが起きず**、後段の「宣言したクラスを持つシグニ」も参照先を失っていた。列挙を declareOptions
  // で運び、engine 側の宣言 UI をその候補だけに絞る（列挙を無視して全クラスから選ばせるのは過剰実行）。
  {
    const listM = t.match(/^(?:その後、)?((?:＜[^＞]+＞か)+＜[^＞]+＞)から[１-９\d０-９]*つを宣言する$/);
    if (listM) {
      return {
        type: 'STUB', id: 'DECLARE_CLASS',
        declareOptions: listM[1].split('か').map(s => s.replace(/[＜＞]/g, '')).filter(Boolean),
      } as StubAction;
    }
  }
  if (t.match(/^(?:その後、)?クラス[１-９\d０-９]*つを宣言する$/) || t.match(/^クラス[１-９\d０-９]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_CLASS' } as StubAction;
  if (t.match(/^(?:その後、)?色[１-９\d０-９]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_COLOR' } as StubAction;

  // ---- N体まで対象とする / シグニ１体を対象とする（単独） ----
  // 🆕§5.3 `O-60` 第42バッチ（2026-09-03）＝**対象を payload で運ぶ**（`SELECT_TARGET_ONLY`）。
  // 🔴旧 `STUB{TARGET_ONLY}` は engine が**カード全文**に `あなたのシグニ`／`自分のシグニ`／
  //   `対戦相手.{0,5}シグニ` を当てて所有者を推測しており、原文が**修飾語なしの「シグニ１体」**
  //   （＝どちらの場でもよい・`WXDi-P07-086`）だと**1本も当たらず対戦相手の場だけ**に潰れていた。
  // ⚠受け皿は既存＝`SELECT_TARGET_ONLY` は `owner:'any'` を両フィールド走査で解決する。
  {
    const mSigniTargetOnly = t.match(/^シグニ([１-９\d０-９]*)体?を対象とする$/);
    if (mSigniTargetOnly) {
      return {
        type: 'STUB', id: 'SELECT_TARGET_ONLY',
        selectTarget: {
          type: 'SIGNI', owner: 'any',
          count: mSigniTargetOnly[1] ? parseNum(mSigniTargetOnly[1]) : 1,
          filter: { cardType: 'シグニ' }, upToCount: false,
        },
      } as unknown as StubAction;
    }
    const mLrigOrSigniTargetOnly = t.match(/^対戦相手のルリグかシグニ([１-９\d０-９]*)体?を対象とする$/);
    if (mLrigOrSigniTargetOnly) {
      return {
        type: 'STUB', id: 'SELECT_TARGET_ONLY',
        selectTarget: {
          type: 'CENTER_LRIG_OR_SIGNI', owner: 'opponent',
          count: mLrigOrSigniTargetOnly[1] ? parseNum(mLrigOrSigniTargetOnly[1]) : 1,
          upToCount: false,
        },
      } as unknown as StubAction;
    }
  }

  // ---- それを裏向きにする ----
  if (t.match(/^それ(?:ら)?を裏向きにする(?:もよい)?$/))
    return { type: 'STUB', id: 'SIGNI_FLIP_FACEDOWN' } as StubAction;

  // 🏁**§5.3 `O-60` 第60バッチ（2026-09-03）**＝「Nつ選ぶ」だけの断片を
  //   `CONDITIONAL_MULTI_CHOOSE_BY_CENTER_LEVEL_GTE` に落とす枝は撤去した（受け皿ごと消えた・live 0）。
  //   ⚠選択数の見出しは**文単位より前**の `CHOOSE` ビルダーが読む＝ここへ来る断片は本来の選択肢を持たない。

  // ---- 引用符付き常時能力を得る（「【常】：〜」）----
  // 🆕**§5.3 `O-60` 第64バッチ（2026-09-04）＝`GRANT_EFFECT{rawText}` を出す**（旧＝catch-all
  //   `STUB{GRANT_QUOTED_ABILITY}`＝engine が**効果元のアビリティブロック全文**を読み直す形＝`O-60` A群）。
  // 🔴旧の実害＝`WX22-Re04-E2` は「以下の3つから1つを選ぶ。①「【常】：…」②「…」③「…」」なので、
  //   engine の切り出し regex `「([^」]+)」…を得る` は**「を得る」が無くて1本も当たらず**、
  //   `quotedText` が空 → 最後の `能力を付与（effectEngine処理）` へ落ちる**無言 no-op**だった
  //   （③だけは文単位の耐性規則に先に当たっていたので、①②の2枝だけが黙って消えていた）。
  // 🔑`expandGrantEffectRawTexts` が引用文を本物の `CardEffect` へ展開する＝展開先が
  //   `granted_effects` の CONTINUOUS になるので、`PREVENT_POWER_MODIFY_BY_OPP` /
  //   `SIGNI_CANT_BOUNCE_FROM_FIELD` のような**宣言型 STUB がそのまま収集器に読まれる**
  //   （即時実行の裸 STUB では誰も読まない＝ここが「引用は付与として出す」ことの本質）。
  // ⚠付与先は**このシグニ**（`WX22-Re04-E1`「【常】：…このシグニは自身の【出】能力で**選んだ能力を得る**」）。
  //   展開できない引用は `rawText` のまま残り効果が `PARTIAL` になる＝収穫マージが live へ届けないので退化しない。
  if (t.match(/^「【常】：.+」$/) || t.match(/^「【常】：.+。」$/)) {
    return {
      type: 'GRANT_EFFECT',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      duration: 'UNTIL_END_OF_TURN',
      rawText: t.slice(1, -1),
    } as unknown as EffectAction;
  }

  // ---- ① / ② を行う（番号付き効果フラグメント）----
  if (t.match(/^[①②③④⑤]を行う$/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- それらをルリグトラッシュに置く ----
  // 🆕**§5.3 `O-60` 第57バッチ（2026-09-03）＝以下3件も payload 付きで出す**（旧＝裸の `SOUL_OP`）。
  if (t.match(/^それらをルリグトラッシュに置く$/))
    return makeSoulOpStub(t) as EffectAction;

  // ---- それをルリグデッキに加える ----
  if (t.match(/^それをルリグデッキに加える$/))
    return makeSoulOpStub(t) as EffectAction;

  // ---- このカードをセンタールリグの下に置く ----
  if (t.match(/このカードをあなたのセンタールリグの下に置く/))
    return makeSoulOpStub(t) as EffectAction;

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

  // ---- 手札からクラスシグニを公開 ----
  // 🆕§5.3 `O-60` 第51バッチ（2026-09-03）＝**絞り込みと枚数は payload で運ぶ**。
  //   🔴旧実装は engine が `EffectText + BurstText`（カード全文）に
  //   `/手札から(?:好きな枚数の?)?[＜《]([^＞》]+)[＞》]/` を当てていたので、**同じカードの別の能力**の
  //   ＜クラス＞や《カード名》を掴みうる形だった（`WX05-030` は【起】と【ライフバースト】の両方に
  //   「手札から＜アーム＞の」がある）。ここは**文**しか見ないので取り違えが起きない。
  if (t.match(/手札から(?:好きな枚数の)?[＜《].*[＞》].*シグニ.*を公開する/) ||
      t.match(/対戦相手のシグニ.*を対象とし.*手札から.*シグニを公開する/))
    return { type: 'STUB', id: 'HAND_REVEAL_CLASS_SIGNI', handCardPick: parseHandRevealPick(t) } as StubAction;

  // ---- その後、特定カードを公開してもよい ----
  // 🆕§5.3 `O-60` 第36バッチ（2026-09-03）＝**カード名を payload で運ぶ**。
  //   旧実装は消費地点2つがそれぞれ違う regex（`/《X》を公開/` と `/「X」/`）で名前を取ろうとして
  //   **両方とも外して**おり、公開の選択肢が常に選べない／手札一致0で即終了していた。
  const optRevealNameM = t.match(/手札から《([^》]+)》[０-９\d]*枚を公開してもよい/);
  if (optRevealNameM)
    return {
      type: 'STUB', id: 'OPTIONAL_HAND_REVEAL_NAMED',
      optionalHandRevealNamed: { cardName: optRevealNameM[1] },
    } as StubAction;
  if (t.match(/手札から《.*》[０-９\d]*枚を公開してもよい/))
    return { type: 'STUB', id: 'OPTIONAL_HAND_REVEAL_NAMED' } as StubAction;

  // ---- シグニに隣接するシグニのパワー修正 ----
  if (t.match(/このシグニと隣接する.*パワー/))
    return { type: 'STUB', id: 'ADJACENT_SIGNI_POWER_MOD' } as StubAction;

  // 🏁**§5.3 `O-60` 第60バッチ（2026-09-03）＝`CONDITIONAL_ALTERNATE_EFFECT` を engine ごと撤去した。**
  //   この枝は「あなたの場に＜X＞のシグニがある場合、代わりに」を**カード全文 regex の受け皿**へ流していた
  //   （live 0）。盤面条件つきの「代わりに」は `STATE_CONDITION_CLAUSES` の昇格置換が正しい経路。

  // ---- グリッド固有テキスト ----
  if (t.match(/グリッド固有/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- チャーム条件付きパワー変更 ----
  // §6.4 O-22(a)：**数値を直に置き換える形**（「…－10000する。【チャーム】が付いている場合、代わりに－20000する」）は
  //   `effectParser` の「代わりに」置換 fixup が `CONDITIONAL + POWER_MODIFY{targetsLastProcessed}` へ組む
  //   （前段の base との**差分**で表す）＝ここには来ない。旧 `STUB{CHARM_CONDITIONAL_POWER}` は
  //   delta を**効果元カード自身**へ適用しており、該当2枚がライフバースト（場に無い）だったため恒久 no-op だった。
  // 残るのは**倍率**形（`WX25-P2-103` ②「代わりに３倍－される」）＝§6.4 O-10（続き507）で
  //   `power_minus_multipliers_this_turn`（倍率つきの上位互換）を新設して defer 解体。
  //   ⚠倍率は**原文から読む**（焼き込むと将来の「4倍」で静かにズレる）。
  {
    const charmMulM = t.match(/【チャーム】が付いている場合.*?([０-９\d]+)倍[－-]/);
    if (charmMulM) {
      return { type: 'STUB', id: 'CHARM_POWER_MINUS_MULTIPLIER', value: parseNum(charmMulM[1]) } as StubAction;
    }
  }

  // ---- 緑/青/黒カードを色別にエナまたはトラッシュへ ----
  if (t.match(/その中から.*(?:緑|青|黒|白|赤)の.*カード.*(?:エナゾーンに置き|手札に加え).*残り.*(?:トラッシュ|デッキ)/))
    return { type: 'STUB', id: 'LOOK_TOP_COLOR_SORT' } as StubAction;

  // （「対戦相手は…シグニゾーンに…シグニを新たに配置することができない」は
  //   parseSentencePart3 の BLOCK_OPP_ZONE_PLACEMENT へ統合＝タスク12(lxi) 第10波。
  //   期間（このターン／次のターン）と《無》の支払い回避を同時に読むため1本にまとめた）

  // ---- センタールリグの【出】能力を発動しない ----
  if (t.match(/センタールリグの【出】能力は発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_CENTER_ON_PLAY' } as StubAction;

  // ---- このターン、シグニは新たに能力を得られない ----
  if (t.match(/このターン.*シグニは新たに能力を得られない/))
    return { type: 'STUB', id: 'SUPPRESS_GAIN_ABILITY' } as StubAction;

  // ---- その中からシグニを場に出し残りを手札 ----
  if (t.match(/その中から.*シグニを.*場に出し.*残り.*手札に加える/))
    return { type: 'STUB', id: 'LOOK_TOP_SIGNI_TO_FIELD' } as StubAction;

  // ---- その中から好きな枚数をデッキ上に戻し残りをデッキ下 ----
  if (t.match(/その中から.*デッキの一番上に戻し.*残り.*デッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_TOP_SORT' } as StubAction;

  // ---- その中から対戦相手の選んだカードをトラッシュ、残りを手札 ----
  // 🆕§5.3 `O-60` 第24バッチ（2026-09-03）＝**トラッシュ枚数を payload で運ぶ**。
  //   公開枚数は前段 `LOOK_AND_REORDER` の結果（engine は `lastProcessedCards` を読む）＝
  //   旧実装のように engine がカード全文から公開枚数を読み直さない。
  const lookOppTrashM = t.match(/対戦相手の選んだカード([０-９\d]+)枚をトラッシュに置き、?残り.*手札に加える/);
  if (lookOppTrashM)
    return {
      type: 'STUB', id: 'LOOK_TOP_OPP_CHOOSE_TRASH',
      lookTopOppChooseTrash: { trashCount: parseNum(lookOppTrashM[1]), restTo: 'hand' },
    } as StubAction;
  if (t.match(/対戦相手の選んだカード.*トラッシュに置き.*残り.*手札に加える/))
    return { type: 'STUB', id: 'LOOK_TOP_OPP_CHOOSE_TRASH' } as StubAction;

  // ---- その中からN枚チェックゾーンへ残りを手札 ----
  if (t.match(/その中から.*チェックゾーンに置き.*残り.*手札に加える/))
    return { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'to_check', trapSource: 'looked', count: 1, trapRemainder: 'hand' } as StubAction;

  // ---- 場のシグニをチェックゾーンに置く（§6.4 O-3・`WX22-010-E3` 1件）----
  // ⚠下の `TRAP_OPERATION` に落としてはいけない＝あちらは**デッキ／手札の1枚**を `field.check` へ置く
  //   別機構で、しかも実行時に**カード全文 regex**で分岐する（§6.4 O-20 の生き残り）。
  // 🆕続き498＝`FIELD_SIGNI_TO_CHECK_ZONE` で往復（置く→場に出し直す）を1アクションに畳む。
  //   ⚠原文の次文「その後、それらを場に出し、」は**この規則が飲み込む**＝チェックゾーンは経由地で、
  //     置く側と戻す側を別アクションに割ると「それら」の照応先を運ぶ器が要る。
  //     🔴従来は戻す側の文が**丸ごと脱落**したうえ置く側も受け皿 STUB だった＝往復ごと no-op。
  {
    const chkM = t.match(/^あなたの(?:すべての)?(?:＜([^＞]+)＞の)?シグニを(?:すべて)?チェックゾーンに置く$/);
    if (chkM) {
      return {
        type: 'FIELD_SIGNI_TO_CHECK_ZONE',
        target: {
          type: 'SIGNI', owner: 'self', count: 'ALL',
          filter: { cardType: 'シグニ', ...(chkM[1] ? { cardClass: chkM[1] } : {}) },
        },
      } as EffectAction;
    }
  }
  if (/シグニを(?:すべて)?チェックゾーンに置く/.test(t))
    return { type: 'STUB', id: 'DEFERRED_FIELD_SIGNI_TO_CHECK_ZONE' } as StubAction;

  // ---- トラップ設置（巨大catch-allを文の意味ごとに分離） ----
  // ⚠**規則本体は `parseTrapSetSentence` へ切り出してある**＝part1 の汎用「…をトラッシュに置く」が
  //   先に食う（§5.3 2026-08-27 Sheet1 B11）ため、`parseSingleSentenceInner` の冒頭からも同じ規則を
  //   呼ぶ必要がある。ここに写しを作らないこと（片方だけ直る）。
  {
    const trapSet = parseTrapSetSentence(t);
    if (trapSet) return trapSet;
  }

  // 🆕§5.3 `O-143`（2026-08-29）＝「あなたのチェックゾーンから《ガードアイコン》を持たないカードを
  //   N枚まで対象とし、それを手札に加える」（`WXDi-P11-006-E2` 後半）。
  //   🔴従来は `DEFERRED_CHECK_ZONE_TO_HAND`（明示 defer＝no-op）だった。受け皿は
  //   `TRANSFER_TO_HAND{source:{type:'CHECK_CARD'}}`（`checkZoneCards` から候補を作る）。
  {
    const chkHandM = t.match(
      /^あなたのチェックゾーンから(《ガードアイコン》を持たない)?カードを([０-９\d]+)枚(まで)?対象とし、それを?手札に加える$/);
    if (chkHandM) {
      return {
        type: 'TRANSFER_TO_HAND',
        source: {
          type: 'CHECK_CARD', owner: 'self', count: parseNum(chkHandM[2]),
          ...(chkHandM[3] ? { upToCount: true } : {}),
          ...(chkHandM[1] ? { filter: { noGuard: true } } : {}),
        },
      } as EffectAction;
    }
  }

  // ---- チェックゾーン操作（置く／LB発動／離れる、を別の判別子にする） ----
  if (/チェックゾーン(?:に?置|から|を離れ|のライフ|置いた)/.test(t)) {
    if (/チェックゾーンから.*(?:メモリア|シグニ).*の下に置いてもよい/.test(t)) {
      const trapHostNames = [...t.matchAll(/《([^》]+メモリア[^》]*)》/g)].map(m => m[1]);
      return { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'under_signi', trapSource: 'check', trapHostNames } as StubAction;
    }
    if (/チェックゾーン(?:に置いた|置いた)カードのライフバーストを発動/.test(t))
      return { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'activate_check_burst', trapSource: 'check' } as StubAction;
    if (/チェックゾーン(?:から|を離れ)/.test(t))
      return { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'from_check', trapSource: 'check' } as StubAction;
    const trapSource = /トラッシュからチェックゾーン/.test(t) ? 'trash' as const
      : /デッキの一番上.*チェックゾーン/.test(t) ? 'deck_top' as const
      : 'looked' as const;
    return {
      type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'to_check', trapSource, count: 1,
      ...(/置いてもよい/.test(t) ? { upToCount: true } : {}),
      // 🆕§5.3 `O-143`＝**トラッシュからチェックゾーンへ置く形はライフバースト確認を伴わない**
      //   （バースト確認はライフクラッシュ経由でしか起きない）＝`field.check` ではなく
      //   `field.check_rest` へ置く。既定スロットに置くと確認モーダルが開いて盤面が固まる。
      //   ⚠他の `trapSource`（`looked` / `deck_top`）は**置いた直後にバースト／トラップを発動する**
      //     文型なので従来どおり `field.check` を使う。
      ...(trapSource === 'trash' ? { trapCheckRest: true } : {}),
    } as StubAction;
  }

  // ---- 別カードのトラップ能力を得て発動（能力コピー機構は別バッチ） ----
  if (/トラップ能力を得て/.test(t))
    return { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'gain_trap_ability', trapSource: 'trash' } as StubAction;

  // ---- ライフバーストをチェックゾーン扱いで発動 ----
  if (t.match(/ライフバーストを.*チェックゾーンにあるかのように発動/))
    return { type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'burst_as_check', trapSource: 'trash', upToCount: true } as StubAction;

  // ---- グロウコスト０ ----
  if (t.match(/このカードにグロウするためのコストは.*×0》になる/))
    return { type: 'STUB', id: 'GROW_COST_ZERO' } as StubAction;

  // ---- ルリグトラッシュからルリグをセンター下へ ----
  // 🆕**§5.3 `O-60` 第57バッチ（2026-09-03）**＝レベル／枚数／「完全に同一のルリグタイプ」を payload で渡す。
  //   🔴旧 engine の regex は「レベルN…ルリグ**１枚**…置い**てもよい**」しか読めず、
  //     `WX22-Re20`③「レベル２以下のルリグを**２枚まで**…置**く**」は**どれにも当たらず既定値へ落ちて**いた。
  if (t.match(/ルリグトラッシュから.*センタールリグの下に置(?:く|いてもよい)/))
    return makeSoulOpStub(t) as EffectAction;

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
  // 🆕**回避条件を payload で刻む**（§5.3 `O-60` 第54バッチ・2026-09-03）。
  // 🔴`WXDi-P06-002-E1` はこの STUB が `GRANT_LRIG_ABILITY` の子にあり、実行時の効果元は
  //   **付与先のルリグ**になる＝engine が引く原文が別のカードになり、既定 `pay_colorless1` へ
  //   落ちていた（＝相手は《無》1つで回避できる＝原文の 1/3 の重さ）。第53バッチ④ と同型。
  if (t.match(/アップフェイズに.*(?:捨てるか|支払わないかぎり).*アップしない/)) {
    const uonu: StubAction = { type: 'STUB', id: 'UPKEEP_OR_NO_UP' };
    if (/手札を[１1]枚捨てるか《無》を支払わないかぎり/.test(t)) uonu.upkeepCondition = 'discard_or_colorless1';
    else {
      const payM = t.match(/((?:《無》)+)を支払わないかぎり/);
      if (payM) uonu.upkeepCondition = payM[1].length / 3 >= 3 ? 'pay_colorless3' : 'pay_colorless1';
    }
    return uonu;
  }

  // ---- 対戦相手のシグニの各種能力を失わせる ----
  if (t.match(/【シャドウ】.*失い.*新たに得られない/))
    return { type: 'STUB', id: 'SUPPRESS_OPP_SIGNI_ABILITIES' } as StubAction;

  // ---- 対戦相手の常能力によるパワー＋禁止 ----
  if (t.match(/【常】能力の効果によって.*パワーは＋されない/))
    return { type: 'STUB', id: 'PREVENT_OPP_POWER_PLUS' } as StubAction;

  // 🗑**「リミットを±N する」の受け皿 STUB は撤去した**（§5.3 `O-60` 第52バッチ・2026-09-03）＝
  //   typed `LRIG_LIMIT_MODIFY`（`parseSentencePart2` の「センタールリグのリミット〜」）が
  //   **この綴りも読むようになった**ので、ここへは落ちてこない。engine のハンドラも撤去済み。

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
  // ⚠これは「**減った値**と同じだけ＋」＝REACTIVE_POWER_UP（相手の temp_power_mods のマイナス分を自分に加算）。
  //   POWER_COPY_FROM_DOWNED は「**この方法でダウンした**シグニのパワーと同じだけ＋」（WXDi-P16-052）という
  //   別の効果の実装で、ここへ流すと「ダウンしたシグニを探す」処理になり原文と無関係の挙動になる（誤ルーティング）。
  if (t.match(/パワーが減ったとき.*このシグニのパワーを減った値と同じだけ/))
    return { type: 'STUB', id: 'REACTIVE_POWER_UP' } as StubAction;

  // ---- センタールリグは選んだ能力を得る ----
  if (t.match(/センタールリグは選んだ能力を得る/))
    return { type: 'STUB', id: 'LRIG_GAIN_ABILITY' } as StubAction;

  // ---- ルリグがシグニに乗る ----
  if (t.match(/のシグニに乗る$/))
    return { type: 'STUB', id: 'LRIG_RIDE_SIGNI' } as StubAction;

  // ---- 「白、赤、青、緑、黒のシグニをそれぞれ1体対象とし、それらをトラッシュに置く」----
  // 🔴§5.3 `O-188` 第6バッチ（2026-09-01）＝ここは `STUB{BANISH_MULTI_COLOR_SIGNI}` を出していたが、
  //   engine 側のハンドラは**「2色以上を持つ相手シグニを全部バニッシュ」という別物**を実装していた
  //   （色ごとに1体でもなく、対象選択も無く、バニッシュ置換まで走る）。⇒ 既存の
  //   `SelectionConstraint.groups`（色ごと1体の配分）で typed に書き直し、ハンドラは削除した。
  // ⚠`upToCount:true`＝候補の色構成によっては「N体ちょうど」を満たす選び方が存在しない
  //   （同じ色が2体で別の色が0体など）ため、確定できない選択UIにしないための fail-open。
  if (t.match(/白.*赤.*青.*緑.*黒.*のシグニをそれぞれ[０-９\d]+体対象とし.*トラッシュに置く/)) {
    return {
      type: 'TRASH',
      target: {
        type: 'SIGNI', owner: 'opponent', count: 5, upToCount: true,
        filter: { cardType: 'シグニ', color: ['白', '赤', '青', '緑', '黒'] },
        selectionConstraint: {
          // ⚠群にも `cardType` を持たせる＝逆翻訳が「カード1体」ではなく「シグニ1体」と描けるようにする
          //   （逆翻訳は群ごとの filter しか読まないので、ここを省くと原文照合が効かない）。
          groups: ['白', '赤', '青', '緑', '黒'].map(color => ({ filter: { cardType: 'シグニ' as const, color }, count: 1 })),
        },
      },
    } as EffectAction;
  }

  // ---- 開花/シード操作 ----
  if (t.match(/開花し/) || t.match(/【シード】として/))
    return { type: 'STUB', id: 'SEED_FLOWER_OP' } as StubAction;

  // ---- 各プレイヤーがデッキをルリグレベル分トラッシュ ----
  // 🆕§5.3 `O-60` 第28バッチ（2026-09-03）＝**枚数を payload で運ぶ**。
  //   旧実装は engine が**カード全文**に regex を当てており、原文（`WX22-017` の選択肢③）は
  //   「レベル１に**つき**カードを３枚」なので1本も当たらず**既定 1枚**へ落ちていた。
  const allMillPerLvM = t.match(/各プレイヤーは.*センタールリグのレベル[０-９\d]*につきカードを([０-９\d]+)枚[^。]*トラッシュに置く/);
  if (allMillPerLvM)
    return {
      type: 'STUB', id: 'ALL_PLAYER_MILL',
      allPlayerMill: { perOwnLrigLevel: parseNum(allMillPerLvM[1]) },
    } as StubAction;
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

  // ---- 「**あなたの**トラッシュから〈修飾〉スペル１枚を対象とし、それを使用してもよい」（§6.4 O-35・続き530）----
  // 🔴既存 `USE_SPELL_FROM_TRASH` は**コストを支払わずに**使用するので流用すると過剰実行になる
  //   （原文は「使用」＝印刷コストを払う）。専用 id で**コストを払う使用**へ分岐させる。
  // ⚠「**対戦相手の**トラッシュから」は別機構（`CAST_FROM_OPP_TRASH`）なので除外する。
  {
    // ⚠**修飾は原文にある綴りだけを列挙する**（実測でこの文型は1効果＝《ディソナアイコン》のみ）。
    //   未知の修飾を素通しで無視すると「トラッシュのどのスペルでも撃てる」過剰実行になるので、
    //   表せない修飾が来たら**マッチさせない**（受け皿へ落として計器に映す）。
    const useOwnTrashSpellM = t.match(/^あなたのトラッシュから(《ディソナアイコン》の|[白赤青緑黒]の)?スペル[１1]枚を対象とし、それを使用してもよい$/);
    if (useOwnTrashSpellM) {
      const q = useOwnTrashSpellM[1] ?? '';
      const colorM = q.match(/^([白赤青緑黒])の$/);
      const filter: TargetFilter = {
        cardType: 'スペル',
        ...(q === '《ディソナアイコン》の' ? { isDisona: true } : {}),
        ...(colorM ? { color: colorM[1] } : {}),
      };
      return {
        type: 'STUB', id: 'USE_SPELL_FROM_TRASH_PAYING_COST',
        selectTarget: { type: 'TRASH_CARD', owner: 'self', count: 1, filter },
      } as StubAction;
    }
  }

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
  const lodc4bM = t.match(/次の[^。]*ドローフェイズの間にカードを合計([０-９\d]+)枚までしか引けない/);
  if (lodc4bM)
    return { type: 'STUB', id: 'LIMIT_OPP_DRAW_COUNT', drawLimit: parseNum(lodc4bM[1]) } as StubAction;

  // ---- このシグニはレベル以外で同じカードになる ----
  if (t.match(/このシグニはレベル.*を除き.*同じカードになる/))
    return { type: 'STUB', id: 'COPY_CARD' } as StubAction;

  // ---- デッキ最上位と最下位を見る ----
  if (t.match(/デッキの一番上と一番下を見る/))
    return { type: 'STUB', id: 'LOOK_TOP_BOTTOM' } as StubAction;

  // ---- デッキをライフクロス枚数依存で見る ----
  if (t.match(/デッキの上から.*「.*ライフクロスの枚数.*」枚見る/))
    return { type: 'STUB', id: 'LOOK_TOP_BY_LIFE_COUNT' } as StubAction;

  // ---- 各プレイヤーデッキをトラッシュ ----
  // 🆕§5.3 `O-60` 第28バッチ（2026-09-03）＝固定枚数も payload で運ぶ（engine は原文を読まない）。
  const allMillFlatM = t.match(/各プレイヤー.*デッキの上からカードを([０-９\d]+)枚[^。]*トラッシュに置く/);
  if (allMillFlatM)
    return {
      type: 'STUB', id: 'ALL_PLAYER_MILL',
      allPlayerMill: { count: parseNum(allMillFlatM[1]) },
    } as StubAction;
  if (t.match(/各プレイヤー.*デッキの上から.*トラッシュに置く/))
    return { type: 'STUB', id: 'ALL_PLAYER_MILL' } as StubAction;

  // ---- ＜解放派＞等のシグニを他シグニの下に置いてもよい ----
  // 🆕§5.3 `O-60` 第51バッチ（2026-09-03）＝**手札側の絞り込みと「置き先」を payload で運ぶ**。
  //   🔴旧実装は置き先が `PLACE_UNDER_SOURCE_SIGNI`＝**効果元シグニの下**に固定で、live の唯一のカード
  //   `WXDi-P15-067` は**スペル**なので効果元が場に無く**恒久 無言 no-op** だった（原文2文目が丸ごと死）。
  const handUnderM = t.match(/手札から(?:あなたの)?(?:＜([^＞]+)＞の)?シグニ([０-９\d]+)枚を(?:あなたの)?(?:＜([^＞]+)＞の)?シグニ[０-９\d]*体の下に置いてもよい/);
  if (handUnderM)
    return {
      type: 'STUB', id: 'HAND_SIGNI_UNDER_SIGNI',
      handCardPick: {
        filter: { cardType: 'シグニ', ...(handUnderM[1] ? { story: handUnderM[1] } : {}) },
        count: parseNum(handUnderM[2]), upTo: true,
      },
      handToUnderSigni: { ...(handUnderM[3] ? { hostFilter: { cardType: 'シグニ', story: handUnderM[3] } } : {}) },
    } as StubAction;
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

  // 「N枚以上の場合、代わりにM枚捨てる」＝**多段閾値の昇格置換**なので、ここでは拾わない（タスク12(lxii)）。
  // 旧 `STUB{CONDITIONAL_DISCARD}` は①条件を一切見ず②`ctx.ownerState.hand`＝**自分の手札**を1枚捨てさせる
  // という別物だった（`WD16-016-BURST` は「対戦相手が」捨てる側）。effectParser の (a) 裸の多段閾値＋
  // (c) 枚数のみ形「代わりにN枚捨てる」で `CONDITIONAL{HAND_COUNT gte N} then/else` に組み替え済み。

  // 🏁**§5.3 `O-60` 第60バッチ（2026-09-03）＝同上**。「追加で手札をN枚捨てていた場合、代わりにKつ選ぶ」は
  //   `effectParser.ts` の `CHOOSE{additionalCostChoose}` ビルダーが**文単位より前**に受ける。

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

/**
 * 「〈枚数〉を【トラップ】として…設置（し、残りを…）」＝トラップ設置文。
 *
 * 🔴**part4 まで降りてくる前に part1 の汎用規則へ食われる**（§5.3 2026-08-27 Sheet1 B11 で実測）＝
 * 「あなたのデッキの上からカードを５枚見て好きな枚数を【トラップ】として**あなたの**シグニゾーンに
 * 設置し、**残りをトラッシュに置く**。」（`WX17-044`）が、汎用の「あなたの…シグニ…をトラッシュに置く」に
 * **貪欲マッチ**して `TRASH{自分のシグニ1体}` に化けていた（＝設置が消えたうえ自分の盤面を削る）。
 * ⚠従来この文が正しく見えていたのは、直後に続く【起】の本文まで1文として繋がっていて
 *   `/【トラップ】として.*設置/` の catch-all が**全部を飲み込んでいた**ためで、偶然に依っていた。
 * ⇒ `parseSingleSentenceInner` の冒頭からもここを呼ぶ（規則の実体はこの1本だけ）。
 */
export function parseTrapSetSentence(t: string): EffectAction | null {
  if (!/【トラップ】として.*設置/.test(t)) return null;
  const fixedPrevious = /それがあったシグニゾーン/.test(t);
  const fixedSource = /対戦相手のシグニ[１1]体.*そのシグニゾーン/.test(t)
    || /それを【トラップ】としてそのシグニゾーン/.test(t);
  const fromHand = /手札(?:から|[１1]枚)/.test(t);
  const lookCountM = t.match(/デッキの上からカードを([０-９\d]+)枚(?:見|公開)/);
  const explicitCountM = t.match(/(?:カードを?|その中から)([０-９\d]+)枚(まで)?【トラップ】として/);
  const count = lookCountM ? parseNum(lookCountM[1]) : explicitCountM ? parseNum(explicitCountM[1]) : 1;
  const upToCount = /好きな枚数|[０-９\d]+枚まで/.test(t);
  const trapRemainder = /残りをトラッシュ/.test(t) ? 'trash' as const
    : /残りを手札/.test(t) ? 'hand' as const
    : /手札に加えるか/.test(t) ? 'hand' as const
    : undefined;
  return {
    type: 'STUB', id: 'TRAP_OPERATION', trapOp: 'set',
    trapSource: fixedSource ? 'field_signi' : fromHand ? 'hand' : 'deck_top',
    count,
    ...(upToCount || /手札に加えるか/.test(t) ? { upToCount: true } : {}),
    ...(fixedPrevious ? { trapFixedZone: 'previous' as const } : fixedSource ? { trapFixedZone: 'source' as const } : {}),
    ...(trapRemainder ? { trapRemainder } : {}),
  } as StubAction;
}
