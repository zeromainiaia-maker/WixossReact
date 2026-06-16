// 効果テキストの「以下のNつからMつ選ぶ」①②③④選択肢を解析してCHOOSEオプションに変換する共通モジュール。
// CONDITIONAL_MULTI_CHOOSE_BY_CENTER / CHOOSE_N_FROM_LIST / BET_MECHANIC / INTERNAL_BET_SHOW_4 /
// INTERNAL_ECRV_APPLY から共用される（従来は各STUBが独自の部分解析を持ち、対応パターンがまちまちだった）。
import type {
  EffectAction,
  StubAction,
  DrawAction,
  BanishAction,
  BounceAction,
  TrashAction,
  DownAction,
  FreezeAction,
  SequenceAction,
  GrantKeywordAction,
  LifeCrashAction,
  AddToLifeAction,
  EnergyChargeFromDeckAction,
  AddToFieldAction,
  BlockActionAction,
} from '../types/effects';

export interface ParsedChoiceOption {
  id: string;
  label: string;
  action: EffectAction;
  available: boolean;
}

const toHW = (s: string) => s.replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0));

const CHOICE_PATTERNS = [
  { m: /①([^②③④]+)/, idx: 0 }, { m: /②([^③④⑤]+)/, idx: 1 },
  { m: /③([^④⑤]+)/, idx: 2 }, { m: /④([^⑤]+)/, idx: 3 },
];

/** 選択肢1つ分のテキストをアクションに変換（解析不可ならnull） */
export function parseSingleChoiceText(choiceTxt: string): EffectAction | null {
  // 「レベルが場にある【ウィルス】の数以下の対戦相手のシグニ１体を対象とし、それをバニッシュする」（WX16-005①）
  // 汎用バニッシュ判定より先に判定する必要がある
  if (choiceTxt.match(/レベルが場にある【ウィルス】の数以下の対戦相手のシグニ[１1]体を対象とし.*バニッシュする/)) {
    return {
      type: 'BANISH',
      target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', levelLteFieldVirusCount: true } },
    } as BanishAction;
  }
  // 「トラッシュから、レベルが場にある【ウィルス】の数以下のシグニ１枚を対象とし、それを場に出す。そのシグニの【出】能力は発動しない」（WX16-005②）
  if (choiceTxt.match(/トラッシュから.*レベルが場にある【ウィルス】の数以下のシグニ[１1]枚を対象とし.*場に出す/)) {
    const steps: EffectAction[] = [
      {
        type: 'ADD_TO_FIELD', owner: 'self',
        source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: false, filter: { cardType: 'シグニ', levelLteFieldVirusCount: true } },
      } as AddToFieldAction,
    ];
    if (choiceTxt.match(/【出】能力は発動しない/)) {
      steps.push({
        type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 },
        actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN',
      } as BlockActionAction);
    }
    return steps.length === 1 ? steps[0] : ({ type: 'SEQUENCE', steps } as SequenceAction);
  }
  // 「カードをN枚引く」→ DRAW（後続の「その後…」は近似で省略。JSONの後続STUBが担う場合あり）
  const drawM = choiceTxt.match(/カードを([１-９1-9])枚引く/);
  if (drawM) return { type: 'DRAW', count: parseInt(toHW(drawM[1])) } as DrawAction;
  // 「各プレイヤーはデッキの上からN枚トラッシュに置く」
  const deckTrashM = choiceTxt.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
  if (deckTrashM) {
    return ({ type: 'STUB', id: 'INTERNAL_DECK_TRASH_BOTH', value: parseInt(toHW(deckTrashM[1])) } as StubAction) as EffectAction;
  }
  // 「あなたのデッキの上からカードをN枚エナゾーンに置く」
  const deckEnergyM = choiceTxt.match(/デッキの上からカードを([０-９\d]+)枚エナゾーンに置く/);
  if (deckEnergyM) {
    return { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: parseInt(toHW(deckEnergyM[1])) } as EnergyChargeFromDeckAction;
  }
  // 「あなたのデッキの一番上のカードをライフクロスに加える」
  if (choiceTxt.match(/デッキの一番上のカードをライフクロスに加える/) && !choiceTxt.match(/取り除く/)) {
    return { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true } as AddToLifeAction;
  }
  // 「対戦相手のライフクロスN枚をクラッシュする」
  const crashM = choiceTxt.match(/対戦相手のライフクロス([０-９\d]+)枚をクラッシュ/);
  if (crashM) {
    return { type: 'LIFE_CRASH', owner: 'opponent', count: parseInt(toHW(crashM[1])), triggerBurst: true } as LifeCrashAction;
  }
  // 「対戦相手のセンタールリグを凍結する」（ダウンより先に判定）
  if (choiceTxt.match(/センタールリグ[１1]体を対象とし.*凍結/)) {
    return ({ type: 'STUB', id: 'INTERNAL_FREEZE_OPP_LRIG' } as StubAction) as EffectAction;
  }
  // 「対戦相手のセンタールリグをダウンする」
  if (choiceTxt.match(/センタールリグ[１1]体を対象とし.*ダウン/)) {
    return { type: 'DOWN', target: { type: 'LRIG', owner: 'opponent', count: 1 } } as DownAction;
  }
  // 「対戦相手のシグニを対象とし、それをダウンする」
  if (choiceTxt.match(/対戦相手のシグニ[１1]体を対象とし.*ダウン/)) {
    return { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
  }
  // 「対戦相手の手札を1枚見ないで選び、捨てさせる」
  if (choiceTxt.match(/手札を[１1]枚見ないで選び.*捨て/)) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
  }
  // 「対戦相手は手札を1枚捨てる」
  if (choiceTxt.match(/対戦相手は手札を[１1]枚捨てる/)) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } as TrashAction;
  }
  // 「対戦相手は自分のエナゾーンからカードN枚…トラッシュに置く」（枚数条件は許容近似で無条件実行）
  const oppEnergyTrashM = choiceTxt.match(/対戦相手は自分のエナゾーンからカード([０-９\d]+)枚.*トラッシュに置く/);
  if (oppEnergyTrashM) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: parseInt(toHW(oppEnergyTrashM[1])) } } as TrashAction;
  }
  // 「あなたのすべてのシグニのパワーを＋N」
  const pwAllPlusM = choiceTxt.match(/あなたのすべてのシグニのパワーを[＋+]([０-９\d]+)/);
  if (pwAllPlusM) {
    return {
      type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
      delta: parseInt(toHW(pwAllPlusM[1])),
    } as EffectAction;
  }
  // 「すべてのシグニのパワーを－N」
  const pwAllM = choiceTxt.match(/すべてのシグニのパワーを([－-][０-９\d]+)/);
  if (pwAllM) {
    return ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_ALL_OPP', value: parseInt(toHW(pwAllM[1]).replace('－', '-')) } as StubAction) as EffectAction;
  }
  // 「対戦相手のシグニ1体のパワーを－N」
  const pwDownM = choiceTxt.match(/パワーを([－-][０-９\d]+)する/);
  if (pwDownM) {
    return ({ type: 'STUB', id: 'INTERNAL_POWER_MOD_OPP_ONE', value: parseInt(toHW(pwDownM[1]).replace('－', '-')) } as StubAction) as EffectAction;
  }
  // 「トラッシュから黒のシグニを手札に加える」（汎用トラッシュ回収より先に判定）
  if (choiceTxt.match(/トラッシュから.*黒.*シグニ.*手札/)) {
    return ({ type: 'STUB', id: 'SUMMON_FROM_TRASH_TO_HAND_BLACK' } as StubAction) as EffectAction;
  }
  // 「トラッシュからシグニを場に出す」
  if (choiceTxt.match(/トラッシュから.*シグニ[１1]枚.*場に出す/)) {
    return ({ type: 'STUB', id: 'SUMMON_FROM_TRASH' } as StubAction) as EffectAction;
  }
  // 「トラッシュにあるカードをゲームから除外」
  if (choiceTxt.match(/トラッシュにある.*ゲームから除外/)) {
    return ({ type: 'STUB', id: 'INTERNAL_EXILE_OPP_TRASH' } as StubAction) as EffectAction;
  }
  // 「アタックできない」→ blocked_actions追加
  if (choiceTxt.match(/アタックできない/)) {
    return ({ type: 'STUB', id: 'INTERNAL_BLOCK_ATTACK_THIS_TURN' } as StubAction) as EffectAction;
  }
  // 「パワーN以上のすべてのシグニをバニッシュ」（両プレイヤー）
  const banishAllGteM = choiceTxt.match(/パワー([０-９\d万]+)以上のすべてのシグニをバニッシュ/);
  if (banishAllGteM) {
    const minPwr = parseInt(toHW(banishAllGteM[1]).replace('万', '0000'));
    return ({ type: 'STUB', id: 'INTERNAL_BANISH_ALL_POWER_GTE', value: minPwr } as StubAction) as EffectAction;
  }
  // 「対戦相手のパワーN以下のシグニをバニッシュ」
  const banishLteM = choiceTxt.match(/パワー([０-９\d万]+)以下.*バニッシュ/);
  if (banishLteM) {
    return ({ type: 'STUB', id: 'INTERNAL_BANISH_OPP_POWER_LTE', value: parseInt(toHW(banishLteM[1]).replace('万', '0000')) } as StubAction) as EffectAction;
  }
  // 「エナゾーンからシグニを場に出す」
  if (choiceTxt.match(/エナゾーンから.*シグニ.*場に出す/)) {
    return ({ type: 'STUB', id: 'SUMMON_FROM_ENERGY' } as StubAction) as EffectAction;
  }
  // 「手札をすべて捨て、N枚引く」
  if (choiceTxt.match(/手札をすべて捨て.*([２-９\d]枚|引く)/)) {
    const drawAllM = choiceTxt.match(/([２-９2-9\d])枚引く/);
    return ({ type: 'STUB', id: 'INTERNAL_DISCARD_ALL_DRAW_N', value: drawAllM ? parseInt(toHW(drawAllM[1])) : 4 } as StubAction) as EffectAction;
  }
  // 「デッキ下のカードをトラッシュ→シグニなら場に出す」
  if (choiceTxt.match(/デッキの一番下.*トラッシュ.*シグニ.*場に出す/)) {
    return ({ type: 'STUB', id: 'INTERNAL_DECK_BOTTOM_SUMMON' } as StubAction) as EffectAction;
  }
  // 「デッキ下のカードをトラッシュ→同じレベルの相手シグニをダウン」
  if (choiceTxt.match(/デッキの一番下.*トラッシュ.*同じレベル.*ダウン/)) {
    return ({ type: 'STUB', id: 'INTERNAL_DECK_BOTTOM_LEVEL_DOWN' } as StubAction) as EffectAction;
  }
  // 「シグニをエナゾーンに置く」→ バニッシュ近似（エナゾーンへ移動）
  if (choiceTxt.match(/対戦相手のシグニ[１1]体.*エナゾーンに置く/)) {
    return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction;
  }
  // 「場にある【ウィルス】Nつを取り除く」（「そうした場合…ライフクロスに加える」連結対応）
  const removeVirusM = choiceTxt.match(/【ウィルス】([０-９\d]+)つを取り除く/);
  if (removeVirusM) {
    const steps: EffectAction[] = [
      ({ type: 'STUB', id: 'INTERNAL_REMOVE_VIRUS_N', value: parseInt(toHW(removeVirusM[1])) } as StubAction) as EffectAction,
    ];
    if (choiceTxt.match(/そうした場合.*ライフクロスに加える/)) {
      steps.push({ type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true } as AddToLifeAction);
    }
    return steps.length === 1 ? steps[0] : ({ type: 'SEQUENCE', steps } as SequenceAction);
  }
  // 「凍結する」（単独またはダウンと組み合わせ）
  if (choiceTxt.match(/凍結する/)) {
    if (choiceTxt.match(/ダウンし.*凍結/)) {
      return ({ type: 'STUB', id: 'INTERNAL_DOWN_AND_FREEZE_OPP' } as StubAction) as EffectAction;
    }
    if (choiceTxt.match(/すべてのシグニを凍結/)) {
      return { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } } as FreezeAction;
    }
    return { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as FreezeAction;
  }
  // 「スペルの効果を打ち消す」→ ログのみ（解決インタラクション未実装）
  if (choiceTxt.match(/スペル.*効果を打ち消す|スペル.*打ち消す/)) {
    return ({ type: 'STUB', id: 'NEGATE_SPELL_EFFECT' } as StubAction) as EffectAction;
  }
  // 「トラッシュからシグニ1枚を手札に加える」
  if (choiceTxt.match(/トラッシュから.*シグニ[１1]枚.*手札に加える/)) {
    return ({ type: 'STUB', id: 'INTERNAL_TRASH_SIGNI_TO_HAND' } as StubAction) as EffectAction;
  }
  // 「デッキから＜クラス＞のシグニN枚を探して手札に加える」
  const classSearchM = choiceTxt.match(/デッキから.*＜([^＞]+)＞のシグニ([１-９\d]+)枚を探して/);
  if (classSearchM) {
    return {
      type: 'SEARCH', from: { location: 'deck', owner: 'self' },
      filter: { cardType: 'シグニ', story: classSearchM[1] }, maxCount: parseInt(toHW(classSearchM[2])),
      then: { type: 'ADD_TO_HAND', owner: 'self' }, afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
    } as EffectAction;
  }
  // 「バニッシュする」（パワー制限なし、または以上）
  if (choiceTxt.match(/シグニ[１1]体.*バニッシュする/)) {
    const gte = choiceTxt.match(/パワー([０-９\d万]+)以上.*バニッシュ/);
    if (gte) {
      return ({ type: 'STUB', id: 'INTERNAL_BANISH_OPP_POWER_GTE', value: parseInt(toHW(gte[1]).replace('万', '0000')) } as StubAction) as EffectAction;
    }
    if (!choiceTxt.match(/パワー/)) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as BanishAction;
    }
  }
  // 「ダブルクラッシュ/ランサー等のキーワードを得る」
  if (choiceTxt.match(/【ダブルクラッシュ】を得る|【ランサー】を得る|【アサシン】を得る/)) {
    const kw = choiceTxt.includes('ダブルクラッシュ') ? 'double_crush'
      : choiceTxt.includes('ランサー') ? 'lancer' : 'assassin';
    return { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: kw, duration: 'UNTIL_END_OF_TURN' } as GrantKeywordAction;
  }
  // 「シグニを手札に戻す」→ BOUNCE（「手札を1枚捨てる」が続けばセットで実行）
  if (choiceTxt.match(/シグニ[１1]体.*手札に戻す/)) {
    const bounce: BounceAction = { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
    if (choiceTxt.match(/手札を[１1]枚捨てる/)) {
      return {
        type: 'SEQUENCE', steps: [
          bounce as EffectAction,
          { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 1 } } as TrashAction,
        ],
      } as SequenceAction;
    }
    return bounce;
  }
  // 「ダウンする」（汎用フォールバック: 相手シグニ1体）
  if (choiceTxt.match(/ダウンする/)) {
    return { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as DownAction;
  }
  return null;
}

/** 効果テキスト全体から①②③④の選択肢を解析してCHOOSEオプション配列を生成する */
export function parseChoiceOptionsFromText(txt: string, idPrefix = 'choice'): ParsedChoiceOption[] {
  const options: ParsedChoiceOption[] = [];
  for (const { m, idx } of CHOICE_PATTERNS) {
    const mat = txt.match(m);
    if (!mat) continue;
    const choiceTxt = mat[1].replace(/。\s*$/, '').trim();
    const action = parseSingleChoiceText(choiceTxt);
    if (action) {
      options.push({
        id: `${idPrefix}_${idx}`,
        label: `${'①②③④'[idx]}${choiceTxt.slice(0, 20)}...`,
        action,
        available: true,
      });
    }
  }
  return options;
}
