import type {
  EffectAction,
  EnergyCost,
  EffectTarget,
  EffectDuration,
  TargetFilter,
  Owner,
  TransferToDeckAction,
  CounterSpellAction,
  CostReductionAction,
  GrantProtectionAction,
  AttachCharmAction,
  BanishRedirectAction,
  RearrangeSigniAction,
  GrowFreeAction,
  RemoveAbilitiesAction,
  PlayFreeAction,
  CostIncreaseAction,
  PowerModifyPerStackAction,
  PowerModifyPerFieldAction,
  PowerModifyPerLevelSumAction,
  CharmProtectionAction,
  MutualDiscardAndDrawAction,
  BlockActionAction,
  EnergyChargeAction,
  PowerModifyByTargetLevelAction,
  PowerMultiplyAction,
  LevelModifyAction,
  PowerModifyPerCharmAction,
  PowerModifyPerEnergyAction,
  PreventDamageAction,
  ReserveDrawPhaseReplacementAction,
  EqualizeEnergyAction,
  VariableDiscardAndDrawAction,
  BanishSubstituteAction,
  StackSpellAction,
  ColorInheritAction,
  PowerModifyPerTrashedLevelAction,
  RemoveCharmAction,
  ForceSigniAttackAction,
  PowerModifyPerTrashCountAction,
  PowerModifyPerLifeCountAction,
  PowerModifyPerLrigLevelAction,
  DrawPerLrigLevelAction,
  EnergyChargePerLrigLevelAction,
  PowerModifyPerVirusCountAction,
  PowerModifyPerDeckCountAction,
  PowerModifyPerEnergyColorAction,
  StubAction,
  SelfPlayRestrictAction,
  PowerModifyAction,
  BanishAction,
  TrashAction,
  SendToEnergyAction,
  SequenceAction,
  InstallDelayedTriggerAction,
  GrantKeywordAction,
} from '../../types/effects';
import {
  blockUntilFromText,
  parseNum, parseSigniTarget, parsePowerFilter, parseLevelFilter, parseColorFilter, parseCardTypeFilter, parseCostTotalFilter, parseStoryFilter, parseColorMatchesLrig, parseGuardFilter, parseIconFilter, parseNoAbilitiesFilter, parseExcludeCardNameFilter, extractNounPhraseFilter, parseLevelLteLastProcessed, parseLastProcessedComparison, parseNameFilter, parseEnergyCosts, parseStateFilter, parseSelfComparison, isUnderLeftCardPhrase, parseTriggerComparison, parsePrintedComparison, toHalf, signiClauseOwner, fusedLookPickSentence, isSplitTopBottomReorder, hasOtherSelfSigniNoun, hasAllSubject, signiClauseStoryFilter, signiClauseIconFilter, signiClauseLevelFilter, signiClausePowerFilter, signiClauseColorFilter, signiClauseDisonaFilter, signiClauseTargetSpec,
} from '../parserUtils';

/**
 * 自身出撃制限（SELF_PLAY_RESTRICT・Opusタスク12(xlix)）を全文から検出する。
 * 「【常】：この(シグニ|カード|キー)は〜（新たに）場に出すことができない」＝この効果を持つカード自身の通常召喚可否ゲート。
 * 「対戦相手はシグニをN体まで」（DEPLOY_RESTRICT・場の枚数制限）とは別系統。
 * effectParser の CONTINUOUS 分岐が parseActiveCondition で条件節を剥がす**前**の全文で呼ぶこと（さもないと
 * 「…ないかぎり、新たに場に出す…」の条件節が先に消費され、残余「新たに場に出す…」が bare ADD_TO_FIELD へ誤 parse される）。
 * マッチしなければ null。
 */
export function parseSelfPlayRestrict(t: string): SelfPlayRestrictAction | null {
  if (!/^この(?:シグニ|カード|キー)は/.test(t) || !/(?:新たに)?場に出すことができない/.test(t)) return null;
  const base: SelfPlayRestrictAction = { type: 'SELF_PLAY_RESTRICT', rawText: t };
  // never＝無条件で通常召喚不可（効果でのみ配置可）：「効果以外によっては」／条件節（場合・かぎり・限り）を含まない
  if (/効果以外によっては/.test(t) || !/(?:場合|かぎり|限り)/.test(t)) {
    return { ...base, never: true };
  }
  // あなたの場にパワーN以上のシグニがある場合にしか（WX12-022）
  const pwM = t.match(/あなたの場にパワー([０-９\d,]+)以上のシグニがある場合にしか/);
  if (pwM) return { ...base, condition: { type: 'FIELD_SIGNI_POWER_COUNT', owner: 'self', minPower: parseInt(toHalf(pwM[1]).replace(/,/g, ''), 10), operator: 'gte', value: 1 } };
  // あなたの場に＜C＞のシグニがN体以上ないかぎり／ある場合にしか（WX14-033）
  const clsM = t.match(/あなたの場に[＜<]([^＞>]+)[＞>]のシグニが([０-９\d]+)体以上(?:ないかぎり|ある場合にしか)/);
  if (clsM) return { ...base, condition: { type: 'FIELD_CLASS_COUNT', owner: 'self', story: clsM[1], operator: 'gte', value: parseNum(clsM[2]) } };
  // あなたのセンタールリグが《X（　レベルN）》の場合にしか（キー WDK16-05H/S/T）
  const lrigM = t.match(/あなたのセンタールリグが《([^》]+?)[　\s]*レベル([０-９\d])》の場合にしか/);
  if (lrigM) return { ...base, condition: { type: 'AND', conditions: [ { type: 'LRIG_NAME_CONTAINS', owner: 'self', name: lrigM[1] }, { type: 'LRIG_LEVEL', owner: 'self', operator: 'eq', value: parseNum(lrigM[2]) } ] } };
  // このターンに対戦相手が手札を（N枚以上）捨てていた場合にしか（WD16-016・段2 第43バッチ）。
  // ⚠従来はここが未対応語彙で **permissive（＝出撃制限が恒久 no-op）** に落ちており、条件を無視して召喚できた。
  //   `evalConditionForContinuous` の default が true なので、**型を出すだけでは直らない**＝同バッチで
  //   同関数へ `TURN_HAND_DISCARD_GTE` のケースを追加してある（§5-2‴）。
  const oppDiscM = t.match(/このターンに対戦相手が手札を(?:([０-９\d]+)枚以上)?捨てていた場合にしか/);
  if (oppDiscM) return { ...base, condition: { type: 'TURN_HAND_DISCARD_GTE', owner: 'opponent', value: oppDiscM[1] ? parseNum(oppDiscM[1]) : 1 } };
  // 対戦相手の場に【ウィルス】がNつ以上ある場合にしか（WX19-030）。
  // `signi_virus` のゾーン別個数を合計する VIRUS_COUNT は ActiveCondition と collector の双方で実装済み。
  const virusM = t.match(/対戦相手の場に【ウィルス】が([０-９\d]+)つ以上ある場合にしか/);
  if (virusM) return { ...base, condition: { type: 'VIRUS_COUNT', owner: 'opponent', operator: 'gte', value: parseNum(virusM[1]) } };
  // それ以外（アクセ総数/クロス状態等＝未対応語彙）は machine 条件を付けず permissive（rawText のみ＝据置・退化なし）
  return base;
}

const TTH_FILTER_BATCH2_WAVE1_CARDS = new Set([
  'WDK08-L11', 'WX09-001', 'WX12-017', 'WXK09-005', 'WXK09-037',
  'WX12-019', 'WX13-028', 'WX14-009', 'WXK11-047', 'SPK01-15', 'WX15-039',
  'WD22-038-UG', 'WX14-044', 'WX15-Re15', 'WX20-047-CB', 'WX21-Re09',
  'WX14-031', 'WXEX1-30', 'WXDi-P11-010A', 'WXDi-P00-001',
  // 第2波（Opus 分担・単発）＝「白か黒のシグニ1枚」colorOR 脱落是正
  'WX09-020',
  // §5d パターンA（続き370）＝「あなたのトラッシュから**無色ではない**（レベルNの）シグニ1枚を対象とし、
  //   それを手札に加える」。`nonColorless` が落ちて**無色シグニまで拾える過剰効果**だった。
  //   ⚠「そのシグニと同じレベル／共通する色」を併記する形（`WXEX2-06` 等）は2系統を同時に表せないため
  //     既存ガードが nonColorless を落とす＝ここには入れない（部分 filter だけの採用を禁止する方針を踏襲）。
  'WX20-031', 'WX22-049', 'WXK04-015', 'WXK09-029',
  // 続き372（§5d パターンA 第4バッチ）＝CHOOSE 選択肢②「あなたのトラッシュから無色ではないシグニ1枚を
  //   対象とし、それを手札に加える」（原文照合済み・他系統の修飾を持たない素の形）。
  'WX11-018',
  // 続き373（§5d パターンA 第5バッチ）＝`levelEqTrigger` を配線して**動的等値と `nonColorless` を同時に表せる**
  //   ようになったので、続き370 から据置だった `WXEX2-06`「そのシグニと同じレベルの無色ではないシグニ1枚」を解禁。
  'WXEX2-06',
]);

/**
 * バニッシュ動詞の直前の目的語が「このシグニ」かを判定する。
 * 文の別節に「対戦相手」があるかではなく、同じ節で次の「を」を挟まず
 * `このシグニを ... バニッシュ` と続く構造だけを見る。
 */
function hasThisSigniAsBanishObject(text: string): boolean {
  return /このシグニを[^を、。]*バニッシュ/.test(text);
}

/**
 * 「対戦相手の〈修飾〉シグニN体を対象とし、あなたの〈修飾〉シグニ1体を
 * 〈バニッシュ／場からトラッシュに置く〉」の後半＝自己犠牲だけを局所抽出する。
 *
 * 全文を `parseSigniTarget` へ渡すと、先行する相手側の owner・level・盤面状態まで後半へ混入する。
 * ここでは主語が明示された後半名詞句だけを渡し、カード番号やクラス名には依存しない。
 * count>1 は現行の選択UIが候補不足時に完済不能を表せないため据え置く。
 * 「バニッシュしてもよい」は既存の optional pay/skip 経路へ渡す。
 */
function parseSelfSigniSacrifice(
  text: string,
): { verb: 'BANISH' | 'TRASH'; target: EffectTarget; optional: boolean } | null {
  const m = text.match(
    /対戦相手の(?:(?![。、]|シグニ|ルリグ).){0,32}シグニ(?:を)?[０-９\d]+体を?対象とし、((?:レゾナではない)?あなたの(?:(?![。、]|シグニ|ルリグ).){0,32}シグニ(?:を)?([０-９\d]+)体)を(バニッシュする|バニッシュしてもよい|場からトラッシュに置く)/,
  );
  if (!m || parseNum(m[2]) !== 1 || !/＜[^＞]+＞/.test(m[1])) return null;
  return {
    verb: m[3].startsWith('バニッシュ') ? 'BANISH' : 'TRASH',
    target: parseSigniTarget(m[1], 'self'),
    optional: m[3].endsWith('してもよい'),
  };
}

/**
 * 「能力喪失」汎用枝の**対象名詞句**だけを取り出してフィルタへ戻す（2026-08-22 段2 第3バッチ）。
 *
 * ⚠**文全体を `parseSigniTarget` へ渡してはいけない**＝「あなたの場に他の＜微菌＞のシグニがある場合、
 *   対戦相手のシグニ１体を対象とし…」の**条件節**の修飾語（クラス・色・状態）まで対象へ引き込み、
 *   原文と逆の過小実行になる（`WX25-P3-071-E1` ほか実測5効果がこの形）。
 *   ⇒ 対象句を含む**読点区切りの1節**に限り、さらに所有者語が汎用枝の owner 判定と一致する場合だけ採る。
 * ⚠終端（「を対象とし」「は能力を失う」）まで span に含める＝`parseSigniTarget` の集合判定
 *   （無冠詞の「シグニのパワーを」＝全体）と同じ規約でここも数える。
 */
function removeAbilitiesTargetNounPhraseFilter(t: string, owner: Owner): TargetFilter | undefined {
  const ownerWord = owner === 'opponent' ? '対戦相手' : 'あなた';
  for (const clause of t.split(/[、。]/)) {
    if (!/シグニ/.test(clause)) continue;
    if (!/(?:を[０-９\d]*体?(?:まで)?を?対象とし|(?:は|が)[^。]{0,16}能力を(?:失|新たに得られない))/.test(clause)) continue;
    const np = clause.match(/(あなた|対戦相手)の[^。、]*?シグニ(?:[０-９\d]+体(?:まで)?)?/);
    if (!np || np[1] !== ownerWord) continue;
    const filter = parseSigniTarget(np[0], owner).filter;
    if (!filter) return undefined;
    // `cardType` だけ（＝修飾語なし）なら情報が増えないので触らない。
    const keys = Object.keys(filter).filter(k => k !== 'cardType');
    return keys.length > 0 ? filter : undefined;
  }
  return undefined;
}

export function parseSentencePart1(t: string, cardNum?: string): EffectAction | null {
  // 🔴§5.3 `O-87`（2026-08-26）＝「あなたの【トラップ】１つを対象とし、それを**手札に戻す**」（`WX21-057-E2`）は
  //   **この関数の汎用 BOUNCE に先に食われて「自分のシグニ1体を手札に戻す」に化けていた**
  //   （盤面から自分のシグニが消える過剰実行）。`TRAP_TO_HAND` は part2 に在るが**そこまで到達しない**ので、
  //   part1 の**先頭**で引き取る。⚠**文頭が「あなたの【トラップ】」であること**を要求する＝
  //   「対戦相手のシグニ１体を対象とし、あなたの【トラップ】１つを手札に戻す」（`WX17-041-BURST`）を巻き込まない。
  {
    const trapBackM = t.match(/^あなたの【トラップ】([０-９\d]+)?[つ枚]?を対象とし、それを手札に(?:戻す|加える)/);
    if (trapBackM) {
      return { type: 'STUB', id: 'TRAP_TO_HAND', trapToHand: { count: trapBackM[1] ? parseNum(trapBackM[1]) : 1 } } as StubAction;
    }
  }
  // 能動の連用中止形「〈対象〉のパワーを±Nし、それ（ら）は…を得る」の前半を共通抽出する。
  // 受動形「このシグニのパワーは±Nされ、」は effectParser.parseContinuousQuotedGrant の担当。
  const activeRenyoPower = (): { delta: number; duration: EffectDuration } | null => {
    const m = t.match(/パワーを([＋+－-])([０-９\d,，]+)し、(?:それ|それら|このシグニ)は/);
    if (!m) return null;
    const magnitude = parseNum(m[2].replace(/[,，]/g, ''));
    const delta = m[1] === '－' || m[1] === '-' ? -magnitude : magnitude;
    const duration: EffectDuration = /次の(?:対戦相手|相手)の?ターン終了時まで/.test(t)
      ? 'UNTIL_OPP_TURN_END'
      : /ターン終了時まで/.test(t) ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
    return { delta, duration };
  };
  // ---- 「そのターン終了時、〜」＝いま解決中のターン終了時の遅延タイミング宣言（タスク12(cl)）----
  // 「ターン終了時まで、」は持続期間なので対象外。ここでは本文を即時実行へ流さない受け皿だけを返し、
  // 本文の parse と INSTALL_DELAYED_TRIGGER への詰め替えは parseSingleSentence の後処理が行う。
  if (/^そのターン終了時[、,]/.test(t)) {
    return { type: 'STUB', id: 'DEFERRED_THIS_TURN_END_BODY' } as StubAction;
  }
  // ---- 「次の対戦相手のターン終了時、〜」＝**遅延タイミング宣言**（§6.4 O-3 続き493）----
  // 🔑**遅延の本体は絶対に即時実行しない**（続き488 の教訓）＝予約機構が入るまでは受け皿へ落として
  //   後続を実行させない。⚠🔴従来は本文が素通りで、`WXDi-P16-002-E1` は**使った瞬間に**1枚引き
  //   エナチャージしていた（過剰実行）／`WXDi-P09-066-E1` は無関係な汎用 `STUB{LOOK_AND_REORDER}`
  //   に落ちて計器にも映らなかった。**この関数の先頭に置く**＝本文側の汎用規則（DRAW 等）に
  //   先取りされないため（規則を後ろに置くと本文だけが拾われて宣言が消える）。
  // 🆕**予約機構が入った（続き497）**＝ここは宣言を食い止めるだけで、本文の parse と
  //   `DELAY_TO_NEXT_OPP_TURN_END` への詰め替えは `parseSingleSentence` の後処理
  //   （`rewriteNextOppTurnEndBody`）が行う（この層からは文パーサを再帰呼び出しできないため）。
  if (/^次の対戦相手のターン終了時[、,]/.test(t)) {
    return { type: 'STUB', id: 'DEFERRED_NEXT_OPP_TURN_END_BODY' } as StubAction;
  }
  // ---- 「次の**あなたの**ターン終了時、〜」＝遅延タイミング宣言（§6.4 O-4 続き499・上の兄弟）----
  // ⚠「次のあなたのターン終了時**まで**」は**持続期間**であってトリガーではない（読点必須で除外される）。
  if (/^次のあなたのターン終了時[、,]/.test(t)) {
    return { type: 'STUB', id: 'DEFERRED_NEXT_OWN_TURN_END_BODY' } as StubAction;
  }

  // ---- 「【　　】icon_txt_frame_null アイコンを持たないシグニ１体を対象とする」（`WXDi-P07-041-E2`）----
  // 🔴従来は `GRANT_KEYWORD{target: 自分のシグニ, keyword:'　　'}`＝**対象宣言が付与に化けて**いた
  //   （§6.4 O-28 のゴミ keyword クラス）＝後続の「それと同じカードになる」が参照先を失う。
  // ⚠CSV のアイコンはレンダリング欠落（`icon_txt_frame_null`）＝同カードの注記
  //   「（【ライズ】と【ハーモニー】は【　　】に含まれる）」から**出現条件アイコン**と判定する。
  if (/^【[　\s]*】icon_txt_frame_nullアイコンを持たないシグニ[１1]体を対象とする$/.test(t)) {
    return {
      type: 'STUB', id: 'SELECT_TARGET_ONLY',
      selectTarget: { type: 'SIGNI', owner: 'any', count: 1, upToCount: false, filter: { cardType: 'シグニ', noDeployConditionIcon: true } },
    } as StubAction;
  }
  // ---- 「ターン終了時まで、このシグニはそれと同じカードになる」（`WXDi-P07-041-E2`）----
  // 既存の `COPY_CARD`（`card_identity_overrides`）がそのまま使える形。🔴従来は無関係な
  // `STUB{POWER_MOD_PER_COUNT}` に落ちていた（＝コピーが一度も起きない無言 no-op）。
  if (/^(?:ターン終了時まで、)?この(?:シグニ|カード)はそれと同じカードになる$/.test(t)) {
    return { type: 'STUB', id: 'COPY_CARD' } as StubAction;
  }

  // ---- 「あなたのトラッシュから対戦相手の場にあるシグニ１体と同じパワーの＜X＞のシグニを１枚まで対象とし、
  //        それをその対戦相手のシグニの正面のシグニゾーンに出す」（`WXDi-CP01-024-E1`・§6.4 O-32）----
  // 🔴従来は丸ごと `UNKNOWN`＝**配置が一度も起きない**（同じ効果の「以下を3回行う」も受け皿 STUB のまま
  //   engine のカード全文 regex に落ちていた）。パワー一致の相手シグニを選び、その**正面**（相手ゾーン zi の
  //   正面は自分ゾーン 2-zi）へ出す専用機構へ載せる。
  // 🔑`placesToField` を立てて `foldSuppressOnPlay` の配置アンカーにする＝次文「それの【出】能力は発動しない」が
  //   畳み込まれる（立てないと engine 未参照の `BLOCK_ACTION` が残り、置いたシグニの【出】が発動する）。
  {
    const facingM = t.match(/^あなたのトラッシュから対戦相手の場にあるシグニ[１1]体と同じパワーの＜([^＞]+)＞のシグニを[１1]枚まで対象とし、それをその対戦相手のシグニの正面のシグニゾーンに出す$/);
    if (facingM) {
      return { type: 'STUB', id: 'PLACE_TRASH_SIGNI_FACING_SAME_POWER', value: facingM[1], placesToField: true } as StubAction;
    }
  }

  // ---- 「〈シグニ〉に付いているすべてのカードと、下に置かれているすべてのカードをトラッシュに置く」----
  // （§6.4 O-34(a)・母集団は原文 regex で**3効果**＝`WX19-064-E1`③／`WX18-029-E1`／`WXDi-P07-041-E2`）
  // 🔑**シグニ自身は場に残る**＝剥がすのは付随物（チャーム／アクセ／ソウル）と下カードだけ。
  // 🔴従来 `WX18-029-E1` は `TRASH{SIGNI opponent}` に落ちて**相手シグニ本体をトラッシュに置いていた**
  //   （【出】でノーコストの除去＝重い過剰実行。`DEFERRED_*` ですらないので `census:stubs` に映らない）。
  // ⚠**この関数の先頭寄りに置く**＝後段の汎用「〜をトラッシュに置く」ビルダーに先取りされるため。
  {
    // 3形＝①「シグニ１体を対象とし、それに付いている〜」②「対戦相手のシグニ１体に付いている〜」
    //       ③「このシグニに付いている〜」（＝発生源自身）
    const stripM = t.match(/^(?:(この)シグニ|(対戦相手の|あなたの)?シグニ[１1]体(?:を対象とし、それ)?)に付いているすべてのカードと、下に置かれているすべてのカードをトラッシュに置く$/);
    if (stripM) {
      // 「このシグニ」＝発生源自身（`WXDi-P07-041-E2`）＝対象宣言を挟まない。
      if (stripM[1]) return { type: 'STUB', id: 'STRIP_ATTACHED_AND_UNDER', stripSelf: true } as StubAction;
      // 修飾語なし「シグニ１体」は `owner:'any'`（どちらの場のシグニでもよい）。
      const stripOwner: Owner = stripM[2] === '対戦相手の' ? 'opponent' : stripM[2] === 'あなたの' ? 'self' : 'any';
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'STUB', id: 'SELECT_TARGET_ONLY',
            selectTarget: { type: 'SIGNI', owner: stripOwner, count: 1, upToCount: false, filter: { cardType: 'シグニ' } } } as StubAction,
          { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' } as StubAction,
          { type: 'STUB', id: 'STRIP_ATTACHED_AND_UNDER' } as StubAction,
        ],
      } as SequenceAction;
    }
  }

  // 同じ相手シグニを2回対象化する二段除去。先にエナへ移すため、後段の手札戻しでは
  // 1体目が候補から外れ、必ず別のシグニを選ぶ（WXK03-070）。
  if (/対象の対戦相手のシグニ[１1]体をエナゾーンに置き、対象の対戦相手のシグニ[１1]体を手札に戻す/.test(t)) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } },
        { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'opponent', count: 1, upToCount: false, filter: { cardType: 'シグニ' } }, optional: false },
      ],
    } as SequenceAction;
  }
  // ---- 【シグニバリア】/【ルリグバリア】を得る ----
  // 純粋なバリア付与文のみマッチ（「白のルリグ1体につき【ルリグバリア】…」等の複雑文は別stubで処理するため除外）。
  // 従来は汎用 GRANT_KEYWORD(keyword:○バリア) になり no-op だった。エンジン実装済みの
  // GAIN_SIGNI_BARRIER / GAIN_LRIG_BARRIER stub（フリーゾーンにトークン設置）を返す。
  {
    const barrierM = t.match(/^【(シグニバリア|ルリグバリア)】([０-９\d]+)?つ?(?:と【(シグニバリア|ルリグバリア)】([０-９\d]+)?つ?)?を得る。?$/);
    if (barrierM) {
      const mkBarrier = (kw: string, numStr?: string): StubAction => {
        const id = kw === 'シグニバリア' ? 'GAIN_SIGNI_BARRIER' : 'GAIN_LRIG_BARRIER';
        const n = numStr ? parseNum(numStr) : 1;
        return n !== 1 ? { type: 'STUB', id, count: n } : { type: 'STUB', id };
      };
      const first = mkBarrier(barrierM[1], barrierM[2]);
      if (barrierM[3]) return { type: 'SEQUENCE', steps: [first, mkBarrier(barrierM[3], barrierM[4])] };
      return first;
    }
    // ---- 対戦相手は【シグニバリア】/【ルリグバリア】N つを失う（WX24-P1-043 の引用付与内側）----
    // engine 実装＝LOSE_SIGNI_BARRIER/LOSE_LRIG_BARRIER stub（相手フリーゾーンのバリアトークンを取り除く）
    const barrierLossM = t.match(/^対戦相手は【(シグニバリア|ルリグバリア)】([０-９\d]+)?つ?を失う。?$/);
    if (barrierLossM) {
      const id = barrierLossM[1] === 'シグニバリア' ? 'LOSE_SIGNI_BARRIER' : 'LOSE_LRIG_BARRIER';
      const n = barrierLossM[2] ? parseNum(barrierLossM[2]) : 1;
      return n !== 1 ? { type: 'STUB', id, count: n } : { type: 'STUB', id };
    }
  }

  // ---- 引用能力付与（対象付与形）: 「<対象>を対象とし、(その後、)(期間、)それ(ら)は「【自/出/起】…」を得る」→ GRANT_EFFECT ----
  // granted_effects 経由で augmented effectsMap（BattleScreen）に乗り、トリガー/常時収集が付与能力を拾う。
  // 引用内は effectParser の expandGrantEffectRawTexts が parseBlock で CardEffect へ展開する（rawText 一時保持・
  // 展開不能なら PARTIAL 温存＝engine は effect 無し GRANT_EFFECT を no-op ガード）。
  // 従来は引用内の末尾節が下方の汎用規則に飲まれ即時実行へ平坦化していた（WX24-P1-057 スペルが即時バウンス化 等・§5c 続き30）。
  // 【常】引用は既存の GRANT_KEYWORD 引用規則（本ファイル下方）の管轄＝ここでは扱わない。
  {
    const qgM = t.match(/^(.+?を?対象とし、)(?:その後、)?(ターン終了時まで、|次の対戦相手のターン終了時まで、)それ(?:ら)?は「(【[自出起]】.+)」を得る$/s);
    if (qgM && !/」と「|」か「/.test(qgM[3])) {
      const pre = qgM[1];
      // 表現できない対象修飾（アイコン持ち・ゾーン位置条件・「AとB」複合対象）は据置＝従来規則へ
      if (!/アイコン|同じシグニゾーン|体と[あ対]/.test(pre)) {
        const owner: Owner = /対戦相手の/.test(pre) ? 'opponent' : 'self';
        const dur: EffectDuration = qgM[2].startsWith('次の対戦相手') ? 'UNTIL_OPP_TURN_END' : 'UNTIL_END_OF_TURN';
        let target: EffectTarget | null = null;
        if (/ルリグかシグニ/.test(pre)) {
          const cm = pre.match(/([０-９\d]+)体(まで)?を?対象とし、$/);
          target = { type: 'CENTER_LRIG_OR_SIGNI', owner, count: cm ? parseNum(cm[1]) : 1, ...(cm?.[2] ? { upToCount: true } : {}) };
        } else if (/シグニ/.test(pre)) {
          target = parseSigniTarget(pre, owner);
          // parseSigniTarget はカード名フィルタを扱わない＝《名前》指定をここで合成。
          // 「《A》か《B》か色のシグニ」は名前群と色のORであり、同一filterへ平坦に置くとANDになる。
          const nameF = parseNameFilter(pre);
          const nameOrColorM = pre.match(/((?:《[^》]+》か)+)([白赤青緑黒])のシグニ/);
          if (nameOrColorM) {
            const names = [...nameOrColorM[1].matchAll(/《([^》]+)》/g)].map(m => m[1]);
            const { color: _color, cardName: _cardName, cardNames: _cardNames, ...common } = target.filter ?? {};
            target = { ...target, filter: { ...common, anyOf: [{ cardNames: names }, { color: nameOrColorM[2] }] } };
          } else if (Object.keys(nameF).length > 0) {
            target = { ...target, filter: { ...target.filter, ...nameF } };
          }
        } else if (/ルリグ/.test(pre)) {
          target = { type: 'LRIG', owner, count: 1 };
        }
        if (target) return { type: 'GRANT_EFFECT', target, duration: dur, rawText: qgM[3] } as EffectAction;
      }
    }
  }

  // ---- 条件かぎり、代わりに＋Nされる/する（条件付き代替パワー修正）----
  if (t.match(/^[^。]+かぎり、代わりに[＋+][０-９\d]+(?:される|する)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_ALT_POWER_BOOST' } as StubAction;
  }

  // ---- このシグニは＜X＞を持つ（クラス/ストーリー付与）----
  if (t.match(/^このシグニは＜[^＞]+＞を持つ/)) {
    return { type: 'STUB', id: 'GRANT_SIGNI_CLASS' } as StubAction;
  }

  // ---- このシグニはアタックできない（CONTINUOUS）----
  if (t.match(/このシグニはアタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, actionId: 'ATTACK', until: 'PERMANENT' };
  }

  // ---- センタールリグが＜X＞でないかぎり、手札にあるこのシグニは【ガード】を失う（WX12-025/034/036）----
  // 条件節が残る経路ではクラスを直接キャプチャする。上流の genericKagiri が条件節を除去する経路では
  // 対象3枚の cardNum から補完し、param 無しの旧 STUB は後方互換として残せるようにする。
  const guardLossM = t.match(/(?:センタールリグが＜([^＞]+)＞でないかぎり、)?手札にあるこのシグニは【ガード】を失う/);
  if (guardLossM) {
    const knownClassByCard: Record<string, string> = {
      'WX12-025': 'サシェ',
      'WX12-034': 'アイヤイ',
      'WX12-036': 'ミュウ',
    };
    return {
      type: 'STUB',
      id: 'GUARD_LOSS_UNLESS_LRIG',
      lrigClass: guardLossM[1] ?? (cardNum ? knownClassByCard[cardNum] : undefined),
    } as StubAction;
  }

  // ---- バニッシュ先変更（ルリグデッキ→ルリグトラッシュ: レゾナ系）----
  if (t.match(/このシグニがバニッシュされる場合、ルリグデッキに戻る代わりにルリグトラッシュに置かれる/)) {
    return { type: 'STUB', id: 'BANISH_TO_LRIG_TRASH_INSTEAD' } as StubAction;
  }

  // ---- バニッシュ先変更（エナゾーン→トラッシュ）----
  // 「このシグニとのバトルによって」「このシグニによって」＝バニッシュ元の限定（続き217）。
  // 落とすと「場に1体いるだけで相手の全バニッシュが常時トラッシュ送り」に過剰発火する。
  if (t.match(/バニッシュされ(?:る場合|たシグニは).*エナゾーンに置かれる代わりにトラッシュに置かれる/)) {
    // owner 判定（続き218 で4件の誤りを是正）。素朴な「対戦相手」語の有無だけだと以下を取り落として
    // owner:'self'＝自分のシグニのバニッシュ先を変える（原文と逆の意味）になっていた：
    // - 「このシグニの正面の（感染状態の）シグニ」＝正面は定義上**対戦相手のゾーン**
    //   （WX19-078-E1・WXDi-D09-P14-E1・WXDi-P10-044-E2）
    // - 「それが」＝直前文で対象に取った対戦相手のシグニを受ける照応（WXK06-048-E1「対戦相手のシグニ
    //   １体を対象とし…このターン、それがバニッシュされる場合」）＝文単位パースで主語が落ちる形。
    // - 「この**シグニによって**バニッシュされたシグニは」＝自陣を自分でバニッシュすることはない＝相手側
    //   （WXDi-D04-016-E2。curated が opponent で正しく fresh だけ self に落ちていた既存の乖離）。
    //   ⚠「このシグニとの**バトル**によって」は両者が同時にバニッシュされうるため**ここに含めない**
    //     （該当10効果はいずれも原文に「対戦相手の」があり判定に影響しない）。
    const owner: Owner = (t.includes('対戦相手') || /この(?:シグニ|カード)の正面の/.test(t)
      || /^(?:このターン、)?それが/.test(t) || /このシグニによってバニッシュされた/.test(t))
      ? 'opponent' : 'self';
    const until = t.includes('このターン') ? 'END_OF_TURN' : 'PERMANENT';
    const bySource: BanishRedirectAction['bySource'] | undefined =
      /このシグニとのバトルによって/.test(t) ? 'battle_with_this'
        : /このシグニによって/.test(t) ? 'by_this'
          : undefined;
    // バニッシュされる側の限定「パワーが０以下の(対戦相手の)?シグニがバニッシュされる場合」（続き218）。
    // 落とすと相手の全バニッシュが常時トラッシュ送りになる（WXDi-P10-009-E3／WXDi-CP02-102-E2）。
    const whenPowerZero = /パワーが０以下の[^。]*?シグニが[^。]*?バニッシュされる場合/.test(t);
    // 直前に対象とした単体を受ける「それが」型。文分割後も照応語は残るため、全体置換にしない。
    // 「パワーが０以下のそれが」「それがバトルによって」も同じ選択対象1体への限定。
    const selectedOne = /(?:パワーが０以下の)?それが(?:バトルによって)?バニッシュされる場合/.test(t);
    const battleOnly = /それがバトルによってバニッシュされる場合/.test(t);
    // 句点後の「このターン、それが…」は同じ効果の直前文で対象化済み（WXK06-048）。
    // 同じ解析文内に「対象とし」がある単独文型は BANISH_REDIRECT 自身の選択が必要なので付けない。
    const targetsLastProcessed = selectedOne && /^(?:このターン、)?それが/.test(t) && !/対象とし/.test(t);
    const frontOnly = /この(?:シグニ|カード)の正面の/.test(t);
    // バニッシュされる**側**の属性限定（タスク12(xliv)(a)）。落とすと「対戦相手の全バニッシュ」に過剰発火する
    // ＝engine の battle/power0 経路が target.filter を評価して被バニッシュシグニを絞る（レベル/凍結/感染/チャーム）。
    // レベル１以下(WXK10-053)・凍結(WXDi-P12-073)・感染(WX21-005)・【チャーム】付き(WX18-038)。
    const redirectFilter: TargetFilter = { cardType: 'シグニ' };
    const brLvM = t.match(/レベル([０-９\d]+)以下の[^。]*?シグニが[^。]*?バニッシュされ/);
    if (brLvM) redirectFilter.level = { max: parseNum(brLvM[1]) };
    if (/凍結状態の[^。]*?シグニが[^。]*?バニッシュされ/.test(t)) redirectFilter.isFrozen = true;
    if (/感染状態の[^。]*?シグニが[^。]*?バニッシュされ/.test(t)) redirectFilter.infected = true;
    if (/【チャーム】が付いている[^。]*?シグニが[^。]*?バニッシュされ/.test(t)) redirectFilter.hasCharm = true;
    return {
      type: 'BANISH_REDIRECT',
      target: { type: 'SIGNI', owner, count: selectedOne ? 1 : 'ALL', filter: redirectFilter },
      redirectTo: 'trash',
      until,
      ...(targetsLastProcessed ? { targetsLastProcessed: true } : {}),
      ...(bySource ? { bySource } : {}),
      ...(battleOnly ? { battleOnly: true } : {}),
      ...(whenPowerZero ? { whenPowerZero: true } : {}),
      ...(frontOnly ? { frontOnly: true } : {}),
    } as BanishRedirectAction;
  }

  // ---- 対戦相手エナゾーン→トラッシュ ----
  if (t.match(/対戦相手(?:は自分)?のエナゾーンから.*カード.*トラッシュに置く/)) {
    const cM = t.match(/カード(?:を)?([０-９\d]+)枚/); // 「カードを２枚まで」の「を」を許容（旧regexは数字直後のみ＝WX04-010 が count:1 に落ちていた）
    const upTo = /([０-９\d]+)枚まで/.test(t);
    // 🔴「**すべての**カード」＝枚数表記が無いので既定の `count:1` に落ち、**1枚だけ**になっていた
    //   （§6.4 O-35・続き528 実測＝`PR-470B-E2` はアタックのたびに相手エナ全損のはずが1枚）。
    // ⚠**「エナゾーンから」と「すべてのカード」の間に修飾が挟まる形は対象外**＝
    //   「宣言した色ではない色を持つすべてのカード」（`WXEX1-07-E2`／`WXK09-037-E1`）は
    //   その色限定が未表現なので、ALL にすると**相手のエナを全部飛ばす過剰**に化ける（A/B で実測）。
    //   1枚（過少）のまま据置＝限定を表現できるようになってから広げる。
    const allM = !cM && /エナゾーン(?:から|にある)すべてのカードをトラッシュに置く/.test(t);
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: allM ? 'ALL' : cM ? parseNum(cM[1]) : 1, ...(upTo ? { upToCount: true } : {}) } };
  }
  // ---- 自分エナゾーン→トラッシュ ----
  if (t.match(/あなたのエナゾーンからカード([０-９\d]+)枚をトラッシュに置く/)) {
    const cM = t.match(/カード([０-９\d]+)枚/);
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: cM ? parseNum(cM[1]) : 1 } };
  }

  // ---- エナゾーン全色破壊（各プレイヤー）----
  if (t.match(/エナゾーンからすべての.*白.*赤.*青.*緑.*黒.*のカードをトラッシュに置く/)) {
    const colorFilter: TargetFilter = { color: ['白', '赤', '青', '緑', '黒'] };
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'self', count: 'ALL', filter: colorFilter } },
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 'ALL', filter: colorFilter } },
      ],
    };
  }

  // ---- 対戦相手エナゾーン全カード＋シグニ全滅 ----
  if (t.match(/対戦相手のエナゾーンにあるすべてのカード.*対戦相手のすべてのシグニをトラッシュに置く/)) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 'ALL' } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } } },
      ],
    };
  }

  // ---- フリーグロウ（コスト不要でグロウ）----
  if (t.match(/グロウコストを支払わず.*センタールリグにグロウする/)) {
    return { type: 'GROW_FREE', levelFilter: 'same' } as GrowFreeAction;
  }

  // ---- グロウコスト減少／0化（ルリグ対象）----
  if (t.match(/グロウコストは.*になる/)) {
    const costs = parseEnergyCosts(t);
    const totalCount = costs.reduce((s, c) => s + c.count, 0);
    const isNextTurn = t.includes('次のあなたのターン');
    // 「グロウコストは《無×0》になる」= グロウコストが0になる（実質フリーグロウ）。
    // 「減る（reduction）」ではなく「0にセット」なので専用STUBで表現する（WX03-024-BURST等）。
    if (totalCount === 0) {
      return { type: 'STUB', id: isNextTurn ? 'FREE_GROW_NEXT_TURN' : 'GROW_COST_ZERO', raw: t } as StubAction;
    }
    return {
      type: 'COST_REDUCTION',
      targetCardType: 'ルリグ',
      reduction: costs,
      isGrowCost: true,
      duration: isNextTurn ? 'NEXT_TURN' : 'PERMANENT',
    } as CostReductionAction;
  }

  // ---- ルリグトラッシュ→ルリグデッキ ----
  if (t.match(/ルリグトラッシュから.*ルリグデッキに加える/)) {
    // 「《スピリット・サルベージ》以外のアーツ1枚」（`WD13-009-E1`）＝自分自身を回収できる過剰効果だった
    // （§5d パターンA・続き371）。
    const filter: TargetFilter = { ...parseCardTypeFilter(t), ...parseColorFilter(t), ...parseCostTotalFilter(t), ...parseExcludeCardNameFilter(t) };
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'LRIG_TRASH_CARD', owner: 'self', count: 1, filter },
      shuffle: false,
      destination: 'lrig_deck',
    } as TransferToDeckAction;
  }

  // ---- シグニ再配置 ----
  if (t.match(/シグニを(?:好きなように)?配置し直/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner, count: 'ALL' } } as RearrangeSigniAction;
  }
  if (t.match(/シグニ.*とこのシグニの場所を入れ替えてもよい/)) {
    return { type: 'REARRANGE_SIGNI', target: { type: 'SIGNI', owner: 'self', count: 1 }, swap: true } as RearrangeSigniAction;
  }

  // ---- アーツ使用禁止 ----
  if (t.match(/対戦相手はアーツを使用できない/)) {
    const until = t.includes('次のターン') ? 'NEXT_TURN' : 'END_OF_TURN';
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ARTS', until };
  }

  // ---- エナフェーズスキップ ----
  if (t.match(/対戦相手は.*エナフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ENERGY_PHASE', until: 'END_OF_TURN' };
  }

  // ---- ガード不可 ----
  // 🔴**「〈レベル限定〉のシグニで【ガード】ができない」を素の `GUARD` に落とすと「ガードそのものができない」
  //   ＝原文より遥かに強い過剰実行に化ける**（§6.4 O-41・2026-08-22）。live 実測で 6効果がこの形だった。
  //   限定の表し方は actionId の文字列で持つ（`blocked_actions` も CONTINUOUS の `forSelf` も
  //   `Set<string>` の経路なので、型フィールドを足しても常在側に届かない）。
  //     `GUARD_MAX_LV<n>` ＝レベル n **以下**（従来からある形）
  //     `GUARD_LV<n>` / `GUARD_LV<n>_<m>` ＝そのレベル**ちょうど**／列挙
  //     `GUARD_LV_DECLARED` ＝宣言された数字と同じレベル（実行時に解決）
  //     `GUARD_LV_LAST_DOWNED` ＝この方法でダウンしたシグニと同じレベル（実行時に解決）
  if (t.match(/対戦相手は(?:.*シグニで)?【ガード】ができない/)) {
    const until: BlockActionAction['until'] = t.includes('次の') ? 'NEXT_TURN' : 'END_OF_TURN';
    const blockGuard = (actionId: string): BlockActionAction =>
      ({ type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId, until });
    // 「レベルN以下のシグニで【ガード】ができない」はレベル制限ガード（GUARD_MAX_LVN）として扱う。
    // この一般ルールを先に評価するため、ここで判別しないと後段の専用ルールに到達せず
    // 全ガード禁止(GUARD)に誤分類される（WX01-004 等で発生していた不具合）。
    const lvM = t.match(/レベル([０-９\d]+)以下のシグニで【ガード】ができない/);
    if (lvM) return blockGuard(`GUARD_MAX_LV${parseNum(lvM[1])}`);
    // ⚠列挙（「レベル２とレベル３の」）を**ちょうど1つ**より先に判定する。逆順にすると
    //   `レベル３のシグニで` だけが拾われてレベル２ぶんが落ちる（過小実行）。
    const lvEnum = t.match(/(レベル[０-９\d]+(?:とレベル[０-９\d]+)+)のシグニで【ガード】ができない/);
    if (lvEnum) {
      const levels = [...new Set([...lvEnum[1].matchAll(/レベル([０-９\d]+)/g)].map(m => parseNum(m[1])))];
      return blockGuard(`GUARD_LV${levels.sort((x, y) => x - y).join('_')}`);
    }
    const lvExact = t.match(/レベル([０-９\d]+)のシグニで【ガード】ができない/);
    if (lvExact) return blockGuard(`GUARD_LV${parseNum(lvExact[1])}`);
    if (/宣言された数字と同じレベルのシグニで【ガード】ができない/.test(t)) return blockGuard('GUARD_LV_DECLARED');
    if (/この方法でダウンしたシグニと同じレベルのシグニで【ガード】ができない/.test(t)) return blockGuard('GUARD_LV_LAST_DOWNED');
    return blockGuard('GUARD');
  }

  // ---- §3タスク6 D（置換ルール）: バニッシュ防止＋能力喪失（能力消去ブロックより前に置く＝「この能力を失う」を先取りさせない）----
  // 「（対戦相手のターンの間、）（このシグニ／あなたの＜C＞のシグニ1体）がバニッシュされる場合、代わりにバニッシュされず、
  //   ターン終了時まで、この能力を失う。」＝バトルバニッシュ経路で自動適用（victim を場に残し source を能力喪失）。
  //   ⚠「バニッシュされず」は「バニッシュされない」保護（GRANT_PROTECTION）とは別＝「代わりに…この能力を失う」で
  //     同ターン再発動不可の一回性置換。従来は REMOVE_ABILITIES へ幻覚化し、バニッシュ防止（守り）が丸ごと脱落していた。
  if (/がバニッシュされる場合、代わりにバニッシュされず、ターン終了時まで、この能力を失う/.test(t)) {
    const oppTurnOnlyBP = /対戦相手のターンの間/.test(t);
    const storyBP = t.match(/あなたの＜([^＞]+)＞のシグニ[０-９\d]*体?がバニッシュされる場合/);
    return {
      type: 'STUB', id: 'BATTLE_BANISH_PREVENT_LOSE_ABILITY',
      banishPrevent: {
        ...(storyBP ? { story: storyBP[1] } : { thisCardOnly: true }),
        ...(oppTurnOnlyBP ? { oppTurnOnly: true } : {}),
      },
    } as StubAction;
  }

  // ---- §6.4 O-10（続き507）: 離場の置換「代わりに（ターン終了時まで、）この能力を失う」----
  // 「（対戦相手の効果によって）このシグニが場を離れる場合、代わりに（ターン終了時まで、）この能力を失う。
  //   （そうした場合、このシグニをダウンする。）」＝**離場置換の第3形**（身代わりでも耐性でもない）。
  // 🔴この規則が無いと後段の汎用「能力を失う」ブロックが先取りし、`WX25-P2-TK04-E1` のように
  //   **`REMOVE_ABILITIES{owner:'opponent'}`＝相手シグニの能力を恒久的に消す**という原文にない
  //   加害へ化ける（しかも A群の計器には映らない）。⚠バニッシュ版の規則と同じ理由で**先に置く**。
  // ⚠「そうした場合、このシグニをダウンする」は**別の文**なので此処では見えない＝
  //   `foldLeaveLoseSelfAbilityDown`（effectParser の後処理）が畳んで `thenDown` を立てる。
  if (/(?:この(?:シグニ|カード)が対戦相手の効果によって場を離れる場合|対戦相手の効果によってこの(?:シグニ|カード)が場を離れる場合)[、,]代わりに(?:ターン終了時まで[、,])?この能力を失う/.test(t)) {
    return {
      type: 'STUB', id: 'EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY',
      leaveLoseSelfAbility: /そうした場合[、,]この(?:シグニ|カード)をダウンする/.test(t) ? { thenDown: true } : {},
    } as StubAction;
  }

  // ---- §6.4 O-10（続き511）: 上の置換の**任意コスト**版 ----
  // 「あなたの〈filter〉のシグニ１体が対戦相手の効果によって場を離れる場合、〈コスト〉を支払ってもよい。
  //  そうした場合、代わりにターン終了時まで、このシグニはこの能力を失う。」（原文 regex で3効果）
  // 🔴従来は `SEQUENCE[OPTIONAL_COST, CONDITIONAL{IS_MY_TURN}→REMOVE_ABILITIES{self}]` へ落ちていた＝
  //   **CONTINUOUS の SEQUENCE は誰も実行しない**ので完全な無言 no-op（A群にも映らなかった）。
  // ⚠**victim（守られる側）と宣言元（能力を失う側）は別**＝原文は「あなたの〈filter〉のシグニ１体が…
  //   **この**シグニはこの能力を失う」。victim 条件だけをペイロードに載せ、失うのは宣言元。
  {
    const payLeaveM = t.match(/(?:あなたの([^。]{0,20}?)シグニ[０-９\d]*体?が対戦相手の効果によって場を離れる場合|対戦相手の効果によってあなたの([^。]{0,20}?)シグニ[０-９\d]*体?が場を離れる場合)[、,]([^。]*?てもよい)/);
    if (payLeaveM) {
      const victimDesc = payLeaveM[1] ?? payLeaveM[2] ?? '';
      const costText = payLeaveM[3];
      // 色コスト（「《緑》《無》を支払ってもよい」）／手札捨て（「「手札を２枚捨てる」を行ってもよい」）。
      const colors = [...costText.matchAll(/《([白赤青緑黒無])》/g)].map(m => m[1]);
      const handM = costText.match(/手札を([０-９\d]+)枚捨てる/);
      // この宣言型の consumer が支払えるのは色エナ／手札捨てだけ。たとえば
      // 「代わりにアップ状態のこのシグニをダウンしてもよい」は自己DOWNの置換コストであり、
      // costFields が空の宣言へ丸めると engine の `paidLabels.length === 0` で恒久 no-op になる。
      // 表現できない支払いはここで先取りせず、後続の動詞別ビルダーへ渡す。
      if (colors.length === 0 && !handM) {
        // fall through
      } else {
      const victimFilter: TargetFilter = { cardType: 'シグニ' };
      const colM = victimDesc.match(/^(白|赤|青|緑|黒)の$/);
      if (colM) victimFilter.color = colM[1];
      const storyM = victimDesc.match(/＜([^＞]+)＞/);
      if (storyM) victimFilter.story = storyM[1];
      return {
        type: 'STUB', id: 'EFFECT_LEAVE_PAY_TO_LOSE_SELF_ABILITY',
        leavePayLoseSelfAbility: {
          victimFilter,
          ...(colors.length > 0 ? { costColors: colors } : {}),
          ...(handM ? { handDiscard: parseNum(handM[1]) } : {}),
        },
      } as StubAction;
      }
    }
  }

  // ---- §6.3「正面」サブ機構(b)(e): このシグニの正面のシグニの能力喪失／【出】ブロック ----
  // 「このシグニの正面のシグニは能力を失う」（WX05-019-E1）＝従来 owner:'self' へ落ちて**自分のシグニの能力を消す自傷**だった。
  // 「このシグニの正面のシグニの【出】能力は発動しない」（WXK11-029-E1）＝従来 BLOCK_ACTION{PLAYER owner:'self'} へ落ちて
  //   **自分のプレイヤーの【出】をターン終了まで丸ごと封じる**大幅な誤りだった。既存 `abilityTypes` 語彙で表現する。
  // ⚠下の能力消去ブロックより前に置く（そちらの owner 判定は「対戦相手」の語が無いと 'self' に落ちるため）。
  {
    // 「このシグニのパワーを±Nし、このシグニの正面…は能力を失う」＝自己強化と正面能力喪失の複合。
    // 先に取らないと汎用 ability-loss 枝が後半だけを self/count:1 として返す。
    const frontCompoundM = t.match(/このシグニのパワーを([＋+－-])([０-９\d,，]+)し、このシグニの正面のシグニゾーンにあるシグニは能力を失う/);
    if (frontCompoundM) {
      const magnitude = parseNum(frontCompoundM[2].replace(/[,，]/g, ''));
      const delta = frontCompoundM[1] === '－' || frontCompoundM[1] === '-' ? -magnitude : magnitude;
      return {
        type: 'SEQUENCE',
        steps: [
          {
            type: 'POWER_MODIFY',
            target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
            delta,
            duration: 'UNTIL_END_OF_TURN',
          } as PowerModifyAction,
          {
            type: 'REMOVE_ABILITIES',
            target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', frontOfSelf: true } },
            until: 'UNTIL_END_OF_TURN',
          } as RemoveAbilitiesAction,
        ],
      } as SequenceAction;
    }
    const frontRemoveM = t.match(/^このシグニの正面のシグニ(?:の【([常自起出])】能力は発動しない|は能力を失う)/);
    if (frontRemoveM) {
      return {
        type: 'REMOVE_ABILITIES',
        target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', frontOfSelf: true } },
        until: 'PERMANENT',
        ...(frontRemoveM[1] ? { abilityTypes: [frontRemoveM[1] as '常' | '自' | '起' | '出'] } : {}),
      } as RemoveAbilitiesAction;
    }
  }

  // 「対象のシグニを強化し、それは能力を失い、【K】と引用【常】を得る」＝4 leaf が同一対象。
  // 値やカード番号ではなく文型で取り、最初の POWER_MODIFY が選んだ対象を既存 lastProcessed で束ねる。
  {
    const lossAndGrantsM = t.match(/(あなた|対戦相手)のシグニ([０-９\d]+)体を対象とし、[^。]*?それのパワーを([＋+－-])([０-９\d,，]+)し、それは能力を失い、【([^】]+)】と「【常】：([^」]+?)。?」を得る/);
    if (lossAndGrantsM) {
      const owner: Owner = lossAndGrantsM[1] === 'あなた' ? 'self' : 'opponent';
      const count = parseNum(lossAndGrantsM[2]);
      const magnitude = parseNum(lossAndGrantsM[4].replace(/[,，]/g, ''));
      const delta = lossAndGrantsM[3] === '－' || lossAndGrantsM[3] === '-' ? -magnitude : magnitude;
      const duration: EffectDuration = /次の(?:対戦相手|相手)の?ターン終了時まで/.test(t)
        ? 'UNTIL_OPP_TURN_END' : 'UNTIL_END_OF_TURN';
      const target: EffectTarget = { type: 'SIGNI', owner, count };
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'POWER_MODIFY', target, delta, duration } as PowerModifyAction,
          { type: 'REMOVE_ABILITIES', target, targetsLastProcessed: true, until: duration } as RemoveAbilitiesAction,
          { type: 'GRANT_KEYWORD', target, targetsLastProcessed: true, keyword: lossAndGrantsM[5], duration } as GrantKeywordAction,
          { type: 'GRANT_KEYWORD', target, targetsLastProcessed: true, keyword: lossAndGrantsM[6], duration } as GrantKeywordAction,
        ],
      } as SequenceAction;
    }
  }

  // ---- 指定キーワードだけを失い、新たに得られない ----
  // 「能力」全体の喪失とは別。照応語を含むこの完全文型だけを取り、一般の「これ」を奪わない。
  const keywordLossM = t.match(/それは((?:【[^】]+】)+)を失い、新たに得られない/);
  if (keywordLossM) {
    const keywords = [...keywordLossM[1].matchAll(/【([^】]+)】/g)].map(match => match[1]);
    return {
      type: 'REMOVE_ABILITIES',
      target: { type: 'SIGNI', owner: t.includes('対戦相手') ? 'opponent' : 'self', count: 1 },
      keywords,
      until: t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'PERMANENT',
    } as RemoveAbilitiesAction;
  }

  // ---- 能力消去 ----
  if (t.match(/能力を失[うい]/) || t.match(/能力を新たに得られない/)) {
    // §6.4 O-3: 期間語を3値へ分ける。engine 側は `applyAbilitiesRemoval` がこの `until` を読む
    // （長らく読まれない死フィールドで、全部「このターン終了時まで」に丸まっていた）。
    // ⚠「次の…ターン**終了時まで**」はここでは拾わない＝後段の `applyUntilOppTurnEnd` が
    //   `UNTIL_OPP_TURN_END`（現ターン＋次ターン）へ上げる担当。
    // ⚠「このターンと次のターンの間」も除外＝**現ターンにも効く**ので `NEXT_TURN`（次ターンのみ）では表せない。
    //   該当2枚（`WXEX2-04-E3`／`WX25-P3-014-E2`）は対象軸（指定ゾーン）も別途壊れているため据置。
    const nextTurnOnly = /次の(?:あなたの|対戦相手の)?ターン(?:の間)?[、。]/.test(t)
      && !/このターンと次のターン/.test(t);
    const dur: EffectDuration = t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'
      : nextTurnOnly ? 'NEXT_TURN'
      // 「**このターン、**〜は能力を失い、新たに得られない」＝現ターン限定（§6.4 O-16(b)）。従来は期間語として
      // 読まれず `PERMANENT` へ落ちていた。engine 側は PERMANENT をこの経路では現ターン扱いに丸めるので
      // **挙動は変わらない**が、逆翻訳だけが「永続」に見えて原文照合で毎回引っかかっていた。
      // ⚠読点を必須にする＝「このターン**と次のターンの間**」は別期間なので巻き込まない。
      : /このターン[、,]/.test(t) ? 'UNTIL_END_OF_TURN'
      : 'PERMANENT';
    // §6.4 O-16:「（そこ|それらのシグニゾーン|指定されたシグニゾーン）にあるシグニは能力を失う」＝**ゾーン継続**。
    // ⚠per-card では「後からそのゾーンへ出たシグニ」に効かない＝「新たに得られない」が表せない。
    //   `zoneSource:'designated'` + `count:'ALL'` を engine が `FieldGrant{kind:'abilityLoss'}` として受ける。
    // ⚠「このターンと次のターンの間」は現ターン＋次ターン＝`UNTIL_OPP_TURN_END` と同じ2スロット寿命になる。
    {
      const zoneLossM = t.match(/(?:そこ|それらのシグニゾーン|指定されたシグニゾーン|そのシグニゾーン)にあるシグニは[^。]*能力を(?:失[うい]|新たに得られない)/);
      if (zoneLossM) {
        const spanBoth = /このターンと次のターン/.test(t);
        return {
          type: 'REMOVE_ABILITIES',
          target: {
            type: 'SIGNI', owner: 'opponent', count: 'ALL',
            filter: { cardType: 'シグニ' }, zoneSource: 'designated',
          },
          until: spanBoth ? 'UNTIL_OPP_TURN_END' : dur,
        } as RemoveAbilitiesAction;
      }
    }
    // 「ルリグとシグニを合計N体まで対象とし、…それらは能力を失う」＝両種別を跨ぐ単一の候補プール。
    // SIGNI の「N体まで」規則へ落とすと、ルリグが消えたうえ count:1 になる（WX24-P2-032）。
    const lrigSigniRemoveM = t.match(/対戦相手のルリグとシグニを合計([０-９\d]+)体(まで)?対象とし/);
    if (lrigSigniRemoveM) {
      return {
        type: 'REMOVE_ABILITIES',
        target: {
          type: 'CENTER_LRIG_OR_SIGNI', owner: 'opponent', count: parseNum(lrigSigniRemoveM[1]),
          ...(lrigSigniRemoveM[2] ? { upToCount: true } : {}),
        },
        until: dur,
      } as RemoveAbilitiesAction;
    }
    // §6.4 O-17:「（対戦相手の）キーN枚を対象とし、ターン終了時まで、それは能力を失う」（`WXK05-010-E2`）。
    // ⚠汎用枝は対象種別を SIGNI 固定で組むため、live は**キーではなく相手シグニ1体**を選ぶ別物になっていた。
    // ⚠`alsoKeys`（「場にあるキーとシグニ」＝そのプレイヤーの全キー）とは別軸＝こちらは**1枚を選ぶ**。
    {
      const keyTargetM = t.match(/(あなた|対戦相手)のキー([０-９\d]*)枚(まで)?を?対象とし/);
      if (keyTargetM) {
        return {
          type: 'REMOVE_ABILITIES',
          target: {
            type: 'KEY',
            owner: keyTargetM[1] === 'あなた' ? 'self' : 'opponent',
            count: keyTargetM[2] ? parseNum(keyTargetM[2]) : 1,
            ...(keyTargetM[3] ? { upToCount: true } : {}),
          },
          until: dur,
        } as RemoveAbilitiesAction;
      }
    }
    // 「対戦相手のセンタールリグは能力を失う」（WX20-003②）。汎用枝は能力喪失を
    // SIGNI 固定で組むため、対象種別を明示してからそちらへ渡さない。
    if (/対戦相手のセンタールリグは能力を失/.test(t)) {
      const remove: RemoveAbilitiesAction = {
        type: 'REMOVE_ABILITIES',
        target: { type: 'LRIG', owner: 'opponent', count: 1 },
        until: dur,
      };
      // この枝は汎用の先頭状態条件ラッパーより先に return するため、WX20-003②の
      // availability 条件をここで保持する。上流の liftChoiceOptionCondition が
      // TURN_OWNER を choice.condition へ持ち上げる。
      if (/対戦相手のターンの場合/.test(t)) {
        return {
          type: 'CONDITIONAL',
          condition: { type: 'TURN_OWNER', owner: 'opponent' },
          then: remove,
        } as EffectAction;
      }
      return remove;
    }
    // 「このシグニは【常】能力を失う」＝自己参照（thisCardOnly）。同一文にトリガー句（「このシグニが対戦相手の、
    // 能力か効果の対象になったとき」WX25-P2-055）が残っていると下の owner 判定が「対戦相手」を拾って
    // 相手シグニの能力を消す真逆の効果になる（続き72の実機観測・続き75で修正）ため、先に自己参照を確定させる。
    // ⚠引用付与文（「…このシグニは能力を失う。」を得る＝WXDi-P10-001/WXDi-P09-038）の内側は「付与される能力の
    // 中身」であって効果元自身ではない。引用付与の平坦化は別機構（§3 Opusタスク1）の担当なので従来動作に据え置く。
    const isQuotedGrant = /「[^」]*」を得る/.test(t);
    if (!isQuotedGrant && /このシグニは(?:【[常自起出]】)?能力を失/.test(t)) {
      return { type: 'REMOVE_ABILITIES', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, until: dur } as RemoveAbilitiesAction;
    }
    // 🆕「そのルリグは能力を失う」＝トリガー節「あなたのルリグ１体がアタックしたとき」への照応
    //   （§3 (cxxviii)・続き475d）。従来は下の SIGNI 既定へ落ちて **`REMOVE_ABILITIES{SIGNI}`＝
    //   シグニから能力を奪う**に化けていた（実測6効果。いずれも直前が「そのルリグをアップし」）。
    //   ⚠**live 全6件とも効果主自身のルリグ**を指す（相手のルリグを指す用例は0件＝原文照合済み）。
    if (!isQuotedGrant && /その(?:センター)?ルリグ(?:は|が)[^。]{0,12}能力を失/.test(t)) {
      return { type: 'REMOVE_ABILITIES', target: { type: 'LRIG', owner: 'self', count: 1 }, until: dur } as RemoveAbilitiesAction;
    }
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    // §6.4 O-16(b):「（対戦相手の）場にある**キーと**シグニは能力を失い、新たに得られない」＝
    // キーとシグニの**両方**が、しかも**すべて**対象。従来は「キーと」が挟まるせいで下の `all` 判定が
    // 外れて `count:1`（＝**シグニ1体だけを選ぶ**）に潰れ、さらにキー側は表現手段が無く丸ごと落ちていた。
    const keysAndSigni = /場にあるキーとシグニは[^。]*?能力を(?:失[うい]|新たに得られない)/.test(t);
    // §6.4 O-17: 場**以外**の領域も対象にする2語形。⚠`SPDi47-01-E2` は列挙形（「手札と場とエナゾーンと
    // トラッシュにある」）で `すべての` を含まないため下の `all` 判定を外し、**count:1＝相手シグニ1体だけ**の
    // 過少実行に潰れていた（`WX24-P4-013-E3` の「すべての領域」側は count:'ALL' には届いていた）。
    const allZones = /すべての領域にある[^。]*?シグニ(?:は|が)[^。]*?能力を(?:失[うい]|新たに得られない)/.test(t)
      || /手札と場と(?:エナゾーン|エナ)とトラッシュにある[^。]*?シグニ(?:は|が)[^。]*?能力を(?:失[うい]|新たに得られない)/.test(t);
    const all = keysAndSigni || allZones || t.match(/すべての.*シグニ/) || t.match(/場にあるシグニは能力を失/);
    // 「対戦相手のシグニを**N体まで**対象とし、…能力を失う」＝上限選択。従来は枚数を読まず常に count:1 で、
    // 2体まで消せる効果が1体しか消せない**過小実行**だった（WXDi-P03-024-E1／WXDi-P13-043-E1／WXK10-016-E3 ほか）。
    // ⚠「すべての」側は別枝なので触らない（count:'ALL' を維持）。
    const upToM = all ? null : t.match(/シグニを?([０-９\d]+)体まで対象とし/);
    const ra: RemoveAbilitiesAction = {
      type: 'REMOVE_ABILITIES',
      target: {
        type: 'SIGNI', owner,
        count: all ? 'ALL' : (upToM ? parseNum(upToM[1]) : 1),
        ...(upToM ? { upToCount: true } : {}),
        // ⚠`allZones` は手札／エナ／トラッシュも候補に足すので、**種別を明示しないと
        //   スペルやアーツまで巻き込む**（場だけを見る既定経路では cardType が無くても実害が無かった）。
        ...(allZones ? { allZones: true, filter: { cardType: 'シグニ' } } : {}),
      },
      until: dur,
      ...(keysAndSigni ? { alsoKeys: true } : {}),
    } as RemoveAbilitiesAction;
    // 🆕対象名詞句の修飾語を戻す（2026-08-22 段2 第3バッチ）。この汎用枝は target を owner/count だけで
    // 手組みするため、**「対戦相手の〈レベル／パワー／状態〉のシグニ」の修飾語が丸ごと落ちて**
    // 相手シグニなら誰でも能力を奪える過剰実行になっていた（実測5効果＝`WXDi-P08-049-E2` レベル1／
    // `WXDi-P14-051-E1` レベル2以下／`WX24-P1-050-E2` パワー10000以下／`WX25-CP1-084-E1` レベル2以下／
    // `WX25-P1-051-E2` 感染状態）。engine 側は `fieldCandidates`（`execUtils:1241`）と
    // `collectContinuousAbilitiesRemovedSigni`（`effectEngine:5579`）が両方ともこの filter を読む。
    const npFilter = removeAbilitiesTargetNounPhraseFilter(t, owner);
    if (npFilter) ra.target.filter = { ...npFilter, ...(ra.target.filter ?? {}) };
    // 「この方法でダウンしたルリグと同じレベルの対戦相手のすべてのシグニは能力を失う」（WX25-P1-112）＝
    // レベル条件が丸ごと落ち、相手シグニ**全体**から能力を奪う過剰効果になっていた（タスク12(cix)）。
    if (/この方法でダウンしたルリグと同じレベルの/.test(t)) {
      ra.target.filter = { ...(ra.target.filter ?? {}), levelEqLastDownedLrig: true };
    }
    // §6.4 O-17: 兄弟形「この方法で**公開された**シグニと同じレベルの、対戦相手の…シグニは能力を失う」
    // （`WX24-P4-013-E3`）。⚠これが無いとレベル条件が丸ごと落ちて**相手シグニ全体**から能力を奪う過剰効果になる。
    // 参照元は直前の公開ステップ＝`resumeLookAndReorder` が `lastProcessedCards` に載せる（`levelEqLastProcessed`）。
    if (/この方法で公開された(?:カード|シグニ)と同じレベルの/.test(t)) {
      ra.target.filter = { ...(ra.target.filter ?? {}), cardType: 'シグニ', levelEqLastProcessed: true };
    }
    // §3タスク6 E: 「それは能力を失い、それのパワーを－Nする」＝**同一対象**への能力消去＋パワー修正の複文。
    // 従来はここで能力消去だけを返し **パワー修正が丸ごと脱落**していた（WX26-CP1-009-E1 の－30000）。
    // REMOVE_ABILITIES が対象を lastProcessedCards に記録するので、後段は targetsLastProcessed で同一対象に載る。
    {
      const pmM = t.match(/能力を失[うい]、(?:それの|その)パワーを([－\-＋+])([０-９\d]+)する/);
      if (pmM && !isQuotedGrant && ra.target.count !== 'ALL') {
        return {
          type: 'SEQUENCE',
          steps: [
            ra,
            {
              type: 'POWER_MODIFY',
              target: { type: 'SIGNI', owner, count: 1 },
              delta: ((pmM[1] === '－' || pmM[1] === '-') ? -1 : 1) * parseNum(pmM[2]),
              duration: dur,
              targetsLastProcessed: true,
            },
          ],
        } as EffectAction;
      }
    }
    return ra;
  }

  // ---- 条件付きドロー（手札が少ない場合に差分だけ引く）----
  const handFillM = t.match(/手札が([０-９\d]+)枚より少ない場合、その差の分だけカードを引く/);
  if (handFillM) {
    return {
      type: 'CONDITIONAL',
      condition: { type: 'HAND_COUNT', owner: 'self', operator: 'lt', value: parseNum(handFillM[1]) },
      then: { type: 'DRAW', owner: 'self', count: 1 },
    };
  }

  // ---- ハンデス（レベル指定）----
  const levelHandM = t.match(/対戦相手の手札を見て.*レベル([０-９\d]+).*カード.*選び.*捨てさせる/);
  if (levelHandM) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, filter: { level: parseNum(levelHandM[1]) }, actingPlayerSelects: true } };
  }

  // ---- パワー増減禁止（CONTINUOUS 耐性）----
  if (t.match(/シグニのパワーは増減しない/)) {
    return {
      type: 'GRANT_PROTECTION',
      target: { type: 'SIGNI', owner: 'self', count: 'ALL' },
      from: ['POWER_MODIFY'],
      sourceOwner: 'opponent',
      duration: 'PERMANENT',
    } as GrantProtectionAction;
  }

  // ---- 相手シグニの自発トラッシュ禁止 ----
  if (t.match(/自分で自分のシグニを場からトラッシュに置くことができない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'SELF_SIGNI_TRASH', until: 'PERMANENT' };
  }

  // ---- 効果によるドロー／手札加え禁止（WXK10-010①）----
  // 「このターン、対戦相手は自分の効果によって、カードを引いたりカードを手札に加えることができない」
  // ⚠従来はこの文が STUB `LRIG_GROW_RESTRICT`（＝ルリグのグロウ制限＝原文と無関係）へ誤マッチしていた
  //   （§3 Opusタスク10 パターンC）。engine は execDraw/execTransferToHand で blocked_actions を見る。
  if (t.match(/対戦相手は自分の効果によって[、,]?\s*カードを引いたり[^。]*手札に加えることができない/)) {
    return {
      type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 },
      actionId: 'DRAW_OR_ADD_TO_HAND_BY_EFFECT',
      until: t.includes('このターン') ? 'END_OF_TURN' : 'PERMANENT',
    };
  }

  // ---- フェーズ外ドロー禁止 ----
  if (t.match(/グロウフェイズとドローフェイズ以外でカードを引いたり.*できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'DRAW_OUTSIDE_DRAW_PHASE', until: 'END_OF_TURN' };
  }

  // ---- 両者手札全捨て＋最多ドロー ----
  if (t.match(/あなたと対戦相手は手札をすべて捨て.*最も大きい数に等しい枚数のカードを引く/)) {
    return { type: 'MUTUAL_DISCARD_AND_DRAW', drawMax: true } as MutualDiscardAndDrawAction;
  }

  // ---- ドローフェイズ枚数制限（すべてのプレイヤー）----
  const drawLimitM = t.match(/すべてのプレイヤーはドローフェイズにカードを([０-９\d]+)枚しか引くことができない/);
  if (drawLimitM) {
    const n = parseNum(drawLimitM[1]);
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: `DRAW_LIMIT_${n}`, until: 'PERMANENT' },
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: `DRAW_LIMIT_${n}`, until: 'PERMANENT' },
      ],
    };
  }

  // ---- 次のカード使用コスト減少＋打ち消し耐性 ----
  if (t.match(/次にあなたが(スペル|アーツ)を使用する場合.*コストは.*減り.*打ち消されない/)) {
    const typeM = t.match(/次にあなたが(スペル|アーツ)/);
    const costs = parseEnergyCosts(t);
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'COST_REDUCTION', targetCardType: (typeM?.[1] ?? 'スペル') as 'スペル' | 'アーツ', reduction: costs, duration: 'UNTIL_END_OF_TURN' } as CostReductionAction,
        // 次に使用するスペルは対戦相手の効果で打ち消されない（フラグをセット。WX04-008）
        { type: 'STUB', id: 'GRANT_NEXT_SPELL_UNCOUNTERABLE' } as StubAction,
      ],
    };
  }

  // ---- 対戦相手のアーツとスペルのコスト増加（両種別・期間前置。WXK11-003①/WXK09-006②/SPDi43-31）----
  {
    const costIncBothM = t.match(/^(このターン、|次の対戦相手のターンの間、)?対戦相手の、?(?:アーツとスペル|スペルとアーツ)の使用コストは(.+?)増える/);
    if (costIncBothM) {
      const amountB = parseEnergyCosts(costIncBothM[2]);
      const durB = costIncBothM[1] === '次の対戦相手のターンの間、' ? 'NEXT_OPP_TURN'
        : costIncBothM[1] ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
      const mkCIB = (ct: 'アーツ' | 'スペル'): CostIncreaseAction => ({
        type: 'COST_INCREASE', targetCardType: ct, targetOwner: 'opponent',
        amount: amountB.length > 0 ? amountB : [{ color: '無', count: 1 }],
        duration: durB,
      } as CostIncreaseAction);
      return { type: 'SEQUENCE', steps: [mkCIB('アーツ'), mkCIB('スペル')] } as SequenceAction;
    }
  }

  // ---- 対戦相手スペル/アーツのコスト増加 ----
  const costIncM = t.match(/対戦相手の(スペル|アーツ|ルリグ)(?:の【[^】]+】能力)?の使用コストは/);
  if (costIncM && t.includes('増える')) {
    const amount = parseEnergyCosts(t);
    return {
      type: 'COST_INCREASE',
      targetCardType: costIncM[1] as 'スペル' | 'アーツ' | 'ルリグ',
      targetOwner: 'opponent',
      amount: amount.length > 0 ? amount : [{ color: '無', count: 1 }],
      duration: 'PERMANENT',
    } as CostIncreaseAction;
  }

  // ---- フィールドカウント依存パワー修正（AUTO: 〜につき±N）----
  const perFieldM = t.match(/シグニのパワーを.*＜([^＞]+)＞のシグニ１体につき([＋－])([０-９\d]+)する/);
  if (perFieldM) {
    const sign = perFieldM[2] === '＋' ? 1 : -1;
    const delta = sign * parseNum(perFieldM[3]);
    const tgtOwner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: tgtOwner, count: 'ALL', filter: { cardType: 'シグニ' } },
      deltaPerUnit: delta,
      countFilter: { cardType: 'シグニ', story: perFieldM[1] },
      countOwner: 'self',
    } as PowerModifyPerFieldAction;
  }

  // ---- スタック枚数依存パワー修正（CONTINUOUS: 下にあるカード/シグニ1枚につき）----
  const perStackM = t.match(/このシグニの下にある(?:カード|シグニ)[０-９\d０-９]*枚?につき([＋－])([０-９\d]+)され/);
  if (perStackM) {
    const sign = perStackM[1] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_STACK',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerCard: sign * parseNum(perStackM[2]),
    } as PowerModifyPerStackAction;
  }

  // ---- 他シグニのレベル合計依存パワー修正（CONTINUOUS: 場にある他の＜X＞のレベル1につき±N）----
  const perLevelSumM = t.match(/このシグニのパワーはあなたの場にある他の(.+?)のシグニのレベル１につき([＋－])([０-９\d]+)される/);
  if (perLevelSumM) {
    const sign = perLevelSumM[2] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_LEVEL_SUM',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerLevel: sign * parseNum(perLevelSumM[3]),
      countFilter: { cardType: 'シグニ', ...parseStoryFilter(perLevelSumM[1]) },
      countOwner: 'self',
      excludeSelf: true,
    } as PowerModifyPerLevelSumAction;
  }

  // ---- デッキ枚数比例パワー修正（CONTINUOUS: デッキのN枚につき±M）----
  {
    const perDeckM = t.match(/このシグニのパワーはあなたのデッキの枚数([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (perDeckM) {
      const sign = perDeckM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_DECK_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(perDeckM[3]),
        unitSize: parseNum(perDeckM[1]),
        deckOwner: 'self',
      } as PowerModifyPerDeckCountAction;
    }
  }

  // ---- エナ色種類比例パワー修正（CONTINUOUS: エナの色の種類N種につき±M）----
  {
    const perColorM = t.match(/このシグニのパワーはあなたのエナゾーンにあるカードが持つ色の種類([０-９\d]+)つにつき([＋－])([０-９\d]+)される/);
    if (perColorM) {
      const sign = perColorM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_ENERGY_COLOR',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerColor: sign * parseNum(perColorM[3]),
        energyOwner: 'self',
      } as PowerModifyPerEnergyColorAction;
    }
  }

  // ---- CONTINUOUS: センタールリグのレベルN につきパワー±M ----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき([＋－])([０-９\d]+)される/);
    if (m) {
      const lrigOwner: Owner = m[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerLevel: sign * parseNum(m[4]),
        lrigOwner,
      } as PowerModifyPerLrigLevelAction;
    }
  }

  // ---- ACTIVATED: 対戦相手のシグニのパワーをルリグレベルNにつき（ターン終了時まで）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(?:あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[3] === '＋' ? 1 : -1;
      const lrigOwner: Owner = t.includes('対戦相手のセンタールリグのレベル') ? 'opponent' : 'self';
      return {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerLevel: sign * parseNum(m[4]),
        lrigOwner,
      } as PowerModifyPerLrigLevelAction;
    }
  }

  // ---- ACTIVATED: 対戦相手の全シグニのパワーをルリグレベルにつき（即時）----
  {
    const m = t.match(/対戦相手のすべてのシグニのパワーを(?:あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[2] === '＋' ? 1 : -1;
      const lrigOwner: Owner = t.includes('対戦相手のセンタールリグのレベル') ? 'opponent' : 'self';
      return {
        type: 'POWER_MODIFY_PER_LRIG_LEVEL',
        target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } },
        deltaPerLevel: sign * parseNum(m[3]),
        lrigOwner,
      } as PowerModifyPerLrigLevelAction;
    }
  }

  // ---- CONTINUOUS: トラッシュのカードN枚につきパワー±M ----
  {
    // "あなたのトラッシュにある＜X＞のシグニN枚につき"
    const m1 = t.match(/このシグニのパワーは(あなた|対戦相手|すべてのプレイヤー)のトラッシュにある(.+?)([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (m1) {
      const trashOwner: 'self' | 'opponent' | 'both' =
        m1[1] === 'すべてのプレイヤー' ? 'both' : m1[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m1[4] === '＋' ? 1 : -1;
      const filterStr = m1[2].trim();
      const filter: TargetFilter | undefined =
        filterStr === 'カード' ? undefined
        : filterStr.includes('シグニ') ? { cardType: 'シグニ', ...parseStoryFilter(filterStr), ...parseColorFilter(filterStr) }
        : filterStr.includes('スペル') ? { cardType: 'スペル' }
        : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m1[5]),
        unitSize: parseNum(m1[3]),
        trashOwner,
        countFilter: filter,
      } as PowerModifyPerTrashCountAction;
    }
    // 種類カウント版 "N種類につき"
    const m2 = t.match(/このシグニのパワーは(あなた|対戦相手)のトラッシュにある(.+?)([０-９\d]+)種類につき([＋－])([０-９\d]+)される/);
    if (m2) {
      const trashOwner: 'self' | 'opponent' | 'both' = m2[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m2[4] === '＋' ? 1 : -1;
      const filterStr = m2[2].trim();
      // 「トラッシュにある**無色ではない**シグニN枚/種類につき」（§5d パターンA・続き372）＝`WXK09-036-E2`。
      // 数える母集団の絞り込みが落ちると**下げ幅が過大になる**（＝過剰効果）。
      const filter: TargetFilter | undefined =
        filterStr.includes('シグニ')
          ? { cardType: 'シグニ', ...parseStoryFilter(filterStr), ...parseColorFilter(filterStr), ...(/無色ではない/.test(filterStr) ? { nonColorless: true } : {}) }
          : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m2[5]),
        unitSize: parseNum(m2[3]),
        trashOwner,
        countFilter: filter,
        countByVariety: true,
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをトラッシュ枚数につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(あなた|対戦相手|すべてのプレイヤー)のトラッシュにある(.+?)([０-９\d]+)枚につき([＋－])([０-９\d]+)する/);
    if (m) {
      const trashOwner: 'self' | 'opponent' | 'both' =
        m[2] === 'すべてのプレイヤー' ? 'both' : m[2] === 'あなた' ? 'self' : 'opponent';
      const sign = m[5] === '＋' ? 1 : -1;
      const filterStr = m[3].trim();
      const filter: TargetFilter | undefined =
        filterStr === 'カード' ? undefined
        : filterStr.includes('シグニ') ? { cardType: 'シグニ', ...parseStoryFilter(filterStr), ...parseColorFilter(filterStr) }
        : filterStr.includes('スペル') ? { cardType: 'スペル' }
        : filterStr.match(/[赤青緑黒白]/u) ? { color: filterStr.replace(/のカード|のシグニ/g, '').trim() }
        : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        unitSize: parseNum(m[4]),
        trashOwner,
        countFilter: filter,
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをトラッシュ1枚につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(あなた|すべてのプレイヤー)のトラッシュにある(?:カード)?([１-９]?)枚につき([＋－ー])([０-９\d]+)する/);
    if (m) {
      const trashOwner: 'self' | 'both' = m[2] === 'すべてのプレイヤー' ? 'both' : 'self';
      const sign = m[4] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[5]),
        unitSize: m[3] ? parseNum(m[3]) : 1,
        trashOwner,
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをトラッシュN種類につき ----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(あなた|対戦相手)のトラッシュにある(.+?)([０-９\d]+)種類につき([＋－])([０-９\d]+)する/);
    if (m) {
      const trashOwner: 'self' | 'opponent' | 'both' = m[2] === 'あなた' ? 'self' : 'opponent';
      const sign = m[5] === '＋' ? 1 : -1;
      const filterStr = m[3].trim();
      // 「トラッシュにある**無色ではない**シグニN枚/種類につき」（§5d パターンA・続き372）＝`WXK09-036-E2`。
      // 数える母集団の絞り込みが落ちると**下げ幅が過大になる**（＝過剰効果）。
      const filter: TargetFilter | undefined =
        filterStr.includes('シグニ')
          ? { cardType: 'シグニ', ...parseStoryFilter(filterStr), ...parseColorFilter(filterStr), ...(/無色ではない/.test(filterStr) ? { nonColorless: true } : {}) }
          : undefined;
      return {
        type: 'POWER_MODIFY_PER_TRASH_COUNT',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        unitSize: parseNum(m[4]),
        trashOwner,
        countFilter: filter,
        countByVariety: true,
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashCountAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの＜クラス＞シグニN体につき（対象:相手シグニ、フィルタ:クラス）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの(?:場にある)?(?:(他の))?(＜[^＞]+＞)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[5] === '＋' ? 1 : -1;
      const excludeSelf = !!m[2];
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        countFilter: { cardType: 'シグニ', story: m[3].slice(1, -1) },
        countOwner: 'self',
        ...(excludeSelf ? { excludeSelf: true } : {}),
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの色のシグニN体につき（対象:相手シグニ、フィルタ:色）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの場にある(?:(他の))?([白赤青緑黒]+)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[5] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        countFilter: { cardType: 'シグニ', color: m[3] },
        countOwner: 'self',
        ...(m[2] ? { excludeSelf: true } : {}),
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーをフィールドの「下にカードがある」シグニN体につき（対象:相手シグニ）----
  {
    const m = t.match(/対戦相手のシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーを(?:あなたの場にある)?下にカードがある(?:あなたの)?シグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[4]),
        countFilter: { cardType: 'シグニ' },
        countOwner: 'self',
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- ACTIVATED: ターン終了時まで、パワーを自分シグニ１体につき±N（対象:自シグニ）----
  {
    const m = t.match(/あなたのシグニ([０-９\d]+)体を対象とし.*ターン終了時まで.*パワーをあなたの(?:場にある)?(?:(他の))?(＜[^＞]+＞)のシグニ([０-９\d]+)体につき([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[5] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: parseNum(m[1]) },
        deltaPerUnit: sign * parseNum(m[6]),
        countFilter: { cardType: 'シグニ', story: m[3].slice(1, -1) },
        countOwner: 'self',
        ...(m[2] ? { excludeSelf: true } : {}),
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- CONTINUOUS: ライフクロスN枚につきパワー±M ----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)のライフクロス([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (m) {
      const lifeOwner: Owner = m[1] === 'あなた' ? 'self' : 'opponent';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_LIFE_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerLife: sign * parseNum(m[4]),
        lifeOwner,
      } as PowerModifyPerLifeCountAction;
    }
  }

  // ---- CONTINUOUS: 場にある【ウィルス】N つにつきパワー±M ----
  {
    const m = t.match(/このシグニのパワーは(対戦相手|あなた)の場にある【ウィルス】([０-９\d]+)つにつき([＋－])([０-９\d]+)される/);
    if (m) {
      const virusOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_VIRUS_COUNT',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerVirus: sign * parseNum(m[4]),
        virusOwner,
      } as PowerModifyPerVirusCountAction;
    }
  }

  // ---- CONTINUOUS: この下にあるカード1枚につきパワー±M（PER_STACK補完）----
  {
    const m = t.match(/このシグニのパワーはこの下にあるカード([０-９\d]+)枚につき([＋－])([０-９\d]+)される/);
    if (m) {
      const sign = m[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_STACK',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerCard: sign * parseNum(m[3]),
      } as PowerModifyPerStackAction;
    }
  }

  // ---- チャーム保護（バニッシュ時チャーム消費で防ぐ）----
  if (t.match(/シグニ.*バニッシュされる場合.*チャーム.*トラッシュに置いてもよい/)) {
    const storyF = parseStoryFilter(t) as TargetFilter;
    return {
      type: 'CHARM_PROTECTION',
      signiFilter: { cardType: 'シグニ', ...storyF },
      optional: true,
    } as CharmProtectionAction;
  }

  // ---- 限定条件無視 ----
  if (t.match(/限定条件は無視される/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'IGNORE_RESTRICTIONS', until: 'PERMANENT' };
  }

  // ---- PlayFree: ルリグデッキからアーツをコストなしで使用 ----
  if (t.match(/ルリグデッキから.*アーツ.*コストを支払わずに使用する/)) {
    const filter: TargetFilter = { cardType: 'アーツ', ...parseColorFilter(t) };
    return { type: 'PLAY_FREE', source: 'lrig_deck', filter, ignoreCost: true, optional: false } as PlayFreeAction;
  }

  // ---- PlayFree: 手札からスペルをコストなしで使用 ----
  if (t.match(/手札から.*スペル.*コストを支払わずに使用する/)) {
    const filter: TargetFilter = { cardType: 'スペル', ...parseColorFilter(t) };
    const staticThreshold = t.match(/コストの合計が([０-９\d]+)以下/);
    const fromDiscard = /コストの合計が「この方法で捨てたカードの枚数」以下/.test(t);
    const fromEnergyTrash = /コストの合計が「この方法でトラッシュに置いたカードの枚数＋１」以下/.test(t);
    return {
      type: 'PLAY_FREE', source: 'hand', filter, ignoreCost: true, optional: false,
      ...(staticThreshold ? { costThreshold: parseNum(staticThreshold[1]) } : {}),
      ...(fromDiscard ? { costThresholdFromPaidCount: { source: 'discard' as const } } : {}),
      ...(fromEnergyTrash ? { costThresholdFromPaidCount: { source: 'energyTrash' as const, plus: 1 } } : {}),
    } as PlayFreeAction;
  }

  // ---- PlayFree: 対戦相手手札からスペルを使用 ----
  if (t.match(/対戦相手の手札を見て.*スペル.*使用してもよい/)) {
    return { type: 'PLAY_FREE', source: 'opp_hand', filter: { cardType: 'スペル' }, ignoreCost: true, ignoreRestrictions: true, optional: true } as PlayFreeAction;
  }

  // ---- PlayFree: 対戦相手トラッシュからスペルを使用 ----
  if (t.match(/対戦相手のトラッシュから.*スペル.*使用してもよい/)) {
    return { type: 'PLAY_FREE', source: 'opp_trash', filter: { cardType: 'スペル' }, ignoreCost: true, ignoreRestrictions: true, optional: true } as PlayFreeAction;
  }

  // ---- 「あなたの次のアタックフェイズとグロウフェイズをスキップする」（§6.4 O-3 続き491）----
  // `SP38-006-E4`＝直前の文で追加ターンを得る札。**スキップされるのはこのターンではなく「次のターン」＝
  // その追加ターン**なので `until:'NEXT_TURN'`（`:NEXT_TURN` 予約）に載せる。
  // ⚠🔴従来は「グロウフェイズをスキップ」の一般規則に落ちて **①アタックフェイズ側が丸ごと脱落**
  //   **②グロウ側も `END_OF_TURN`＝使ったターン（＝スキップ対象ではないターン）を封じていた**。
  // ⚠アタック側は `ATTACK_PHASE`＝**ステップ単位ではなくフェイズ丸ごと**（`PHASE_SKIP_BLOCK_IDS`）。
  if (/^あなたの次の(?:アタックフェイズとグロウフェイズ|グロウフェイズとアタックフェイズ)をスキップする$/.test(t)) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ATTACK_PHASE', until: 'NEXT_TURN' },
        { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'GROW', until: 'NEXT_TURN' },
      ],
    };
  }

  // ---- グロウフェイズスキップ ----
  if (t.includes('グロウフェイズをスキップする')) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'GROW', until: 'END_OF_TURN' };
  }

  // ---- スペル/アーツ打ち消し ----
  if ((t.includes('スペル') || t.includes('アーツ')) && t.includes('打ち消す')) {
    const cs: CounterSpellAction = { type: 'COUNTER_SPELL' };
    // 「コストの合計が０のスペル」「コストの合計がN以下のスペル」→ 対象スペルのコスト上限（WX17-031等）
    const mcM = t.match(/コストの合計が([０-９\d]+)(?:以下)?のスペル/);
    if (mcM) cs.maxCost = parseNum(mcM[1]);
    return cs;
  }

  // ---- コスト減少（「青のスペルのコストは《無×1》減る」など）----
  const costRedM = t.match(/(白|赤|青|緑|黒)の(スペル|アーツ)のコストは《([^》]+)》(?:×([０-９\d]+))?減/);
  if (costRedM) {
    return {
      type: 'COST_REDUCTION',
      targetCardType: costRedM[2] as 'スペル' | 'アーツ',
      color: costRedM[1],
      reduction: [{ color: costRedM[3] as EnergyCost['color'], count: costRedM[4] ? parseNum(costRedM[4]) : 1 }],
    } as CostReductionAction;
  }

  // 「（あなた/対戦相手）のセンタールリグのレベル1につきカードをN枚引くか、…のレベル1につき【エナチャージM】をする」
  // ＝ルリグレベル比例のドロー／エナチャージ二択（WXK10-004/WX26-CP1-003①）。
  // 下の【エナチャージ】ショートハンドが先取りすると全体が固定枚数エナチャージに潰れる（続き187）。
  {
    const m = t.match(/(あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につきカードを([０-９\d]+)枚引くか、(?:(?:あなた|対戦相手)の)?センタールリグのレベル([０-９\d]+)につき【エナチャ[ー―‐−-]ジ([０-９\d]+)】をする/);
    if (m && parseNum(m[2]) === 1 && parseNum(m[4]) === 1) {
      const lrigOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      return {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'c0', label: '選択肢1', action: {
            type: 'DRAW_PER_LRIG_LEVEL', drawPerLevel: parseNum(m[3]), lrigOwner, owner: 'self',
          } as DrawPerLrigLevelAction },
          { choiceId: 'c1', label: '選択肢2', action: {
            type: 'ENERGY_CHARGE_PER_LRIG_LEVEL', chargePerLevel: parseNum(m[5]), lrigOwner, owner: 'self',
          } as EnergyChargePerLrigLevelAction },
        ],
      };
    }
  }

  // 「カードをN枚引くか【エナチャージM】をする」＝**素の**ドロー／エナチャージ二択（§6.4 O-11・`WXEX2-66`）。
  // 🔴上のルリグレベル比例版だけがあり、素の形は下のショートハンドの catch-all に食われて
  //   **「引く」側が丸ごと消えたただのエナチャージ**になっていた（選択肢が1つ減る過少実行）。
  // ⚠この文型は【常】の付与テキスト内・【トラップ】側にも同文で現れるので、前置き（読点・「その後、」）を許す。
  {
    // ⚠**トリガー句は剥がれずにここまで来る**（「〜したとき、」を含む文がそのまま渡る）＝
    //   `^` アンカーだけだと黙って外れて下の catch-all に食われる（このセッションで2度踏んだ型）。
    const m = t.match(/(?:^|とき、|場合、|その後、)カードを([０-９\d]+)枚引くか【エナチャ[ー―‐−-]ジ([０-９\d]+)】をする$/);
    if (m) {
      return {
        type: 'CHOOSE',
        choose_count: 1,
        from_count: 2,
        choices: [
          { choiceId: 'c0', label: '選択肢1', action: {
            type: 'DRAW', owner: 'self', count: parseNum(m[1]),
          } as EffectAction },
          { choiceId: 'c1', label: '選択肢2', action: {
            type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: parseNum(m[2]),
          } as EffectAction },
        ],
      };
    }
  }

  // ---- エナチャージ（【エナチャージN】ショートハンド）----
  // 長音符が異体字ダッシュ（― U+2015 / ‐ / − / -）で記録されたデータにも対応（WX03-033-BURST等）
  const ecM = t.match(/【エナチャ[ー―‐−-]ジ([０-９\d]+)】/);
  if (ecM) {
    // 「カードをN枚引き（、）【エナチャージM】をする」＝ドロー複合（約37枚）。ショートハンドが先頭のドロー節を飲み込まないよう SEQUENCE 化
    const drawEcM = t.match(/カードを([０-９\d]+)枚引き、?【エナチャ[ー―‐−-]ジ/);
    if (drawEcM) {
      return { type: 'SEQUENCE', steps: [
        { type: 'DRAW', owner: 'self', count: parseNum(drawEcM[1]) },
        { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: parseNum(ecM[1]) },
      ] };
    }
    return { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: parseNum(ecM[1]) };
  }

  // ---- 「対戦相手はカードをN枚引き、（対戦相手は）デッキの一番上のカードをエナゾーンに置く」（WX14-011②）----
  // ⚠先頭の「対戦相手のドロー」が無言脱落し、後続のエナ置きだけ（しかも owner:self）が残っていた
  //   ＝**相手を回復させるデメリットが自分の利益に化ける**（§3 Opusタスク10 パターンE）。
  {
    const oppDrawEcM = t.match(/対戦相手はカードを([０-９\d]+)枚引き、[^。]*デッキの一番上のカードをエナゾーンに置く/);
    if (oppDrawEcM) {
      return { type: 'SEQUENCE', steps: [
        { type: 'DRAW', owner: 'opponent', count: parseNum(oppDrawEcM[1]) },
        { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'opponent', count: 1 },
      ] };
    }
  }

  // ---- 「この方法で〈移動〉したカードの枚数に N を加えた枚数のカードを引く」＝直前枚数＋定数のドロー ----
  // 🔴従来はどの DRAW 規則にも掛からず総称 `STUB{POWER_MOD_PER_COUNT}`（＝パワー修整のバケツ）へ落ち、
  //   **ドローが丸ごと no-op** かつ原文に無いパワー修整が出ていた（§6.4 O-11・`WX25-P1-046-E1`）。
  // 🔑機構は既存＝`DRAW{count:N, addLastProcessedCount:true}` が「定数＋直前に処理した枚数」を解決する。
  //   直前ステップ（手札→デッキ下の `TRANSFER_TO_DECK`）が `lastProcessedCards` を実枚数で置く。
  {
    // ⚠**「捨てた」枚数の形は取らない**＝`WXDi-P16-038`（「【出】手札を４枚まで捨てる：この方法で捨てた
    //   カードの枚数に１を加えた枚数のカードを引く」）は `STUB{COUNT_BASED_DRAW_OR_POWER}` が
    //   **可変枚数の捨て（対話）そのものを駆動している**ので、ここで DRAW へ差し替えると
    //   支払いの提示が消えて常に1枚ドローになる（過少）。移動先が明示された形だけを受ける。
    const plusLastM = t.match(/^この方法で(?:デッキに移動した|公開した)カードの枚数に([０-９\d]+)を加えた枚数のカードを引く$/);
    if (plusLastM) {
      return { type: 'DRAW', owner: 'self', count: parseNum(plusLastM[1]), addLastProcessedCount: true } as EffectAction;
    }
  }

  // ---- ドロー：まず「引き、捨てる」複合パターンを先にチェック ----
  const drawDiscardM = t.match(/カードを([０-９\d]+)枚引き、手札を([０-９\d]+)枚捨てる/);
  if (drawDiscardM) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'DRAW', owner: 'self', count: parseNum(drawDiscardM[1]) },
        { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(drawDiscardM[2]) } },
      ],
    };
  }
  // 「あなたのセンタールリグがアップ状態の場合、カードをN枚引く」＝条件付きドロー（WX25-P2-048。
  // 汎用 DRAW が先取りすると条件が無言脱落する）
  {
    const m = t.match(/あなたのセンタールリグがアップ状態の場合、カードを([０-９\d]+)枚引く/);
    if (m) return { type: 'CONDITIONAL', condition: { type: 'CENTER_LRIG_IS_UP' }, then: { type: 'DRAW', owner: 'self', count: parseNum(m[1]) } };
  }
  // 「（あなた/対戦相手）のセンタールリグのレベル1につきカードをN枚引く」＝ルリグレベル比例ドロー（WX12-013/WDK07-E09 等）。
  // 汎用 DRAW が先取りすると「レベル1につき」を無視して固定枚数に潰れる（続き184）。
  {
    const m = t.match(/(あなた|対戦相手)のセンタールリグのレベル([０-９\d]+)につき(?:、)?カードを([０-９\d]+)枚引く/);
    if (m && parseNum(m[2]) === 1) {
      return {
        type: 'DRAW_PER_LRIG_LEVEL',
        drawPerLevel: parseNum(m[3]),
        lrigOwner: m[1] === '対戦相手' ? 'opponent' : 'self',
        owner: 'self',
      } as DrawPerLrigLevelAction;
    }
  }

  // 「各プレイヤーは自分の手札とシグニゾーンとエナゾーンとトラッシュにある、すべてのクラフトをゲームから
  //   除外し、すべてのカードをデッキに加えてシャッフルし、カードをN枚引く」（WX24-P2-014-E2）。
  // ⚠汎用 DRAW より**前**に置く＝下の `カードをN枚引く` が先取りすると、盤面リセットが丸ごと落ちて
  //   「自分が6枚引くだけ」の別カードになる（§6.4 O-3 続き486 で実測）。
  {
    const m = t.match(/各プレイヤーは自分の手札とシグニゾーンとエナゾーンとトラッシュにある、?すべてのクラフトをゲームから除外し、すべてのカードをデッキに加えてシャッフルし、カードを?([０-９\d]+)枚引く/);
    if (m) return { type: 'STUB', id: 'EXILE_CRAFTS_RESET_ZONES_AND_DRAW', value: parseNum(m[1]) } as StubAction;
  }

  // 「あなたが（次のあなたの）ドローフェイズにカードをN枚引く場合、代わりに（カードを）M枚引く」
  // （`WXK01-002-E2`・§6.4 O-3 続き492）＝**ドロー枚数の置換予約**。
  // ⚠🔴汎用 DRAW より**前**に置く＝先取りされると「使った瞬間に1枚引く」過剰実行に化ける
  //   （置換の `fromCount` 側を即時ドローとして読んでしまう）。読みは `applyLrigDrawPhaseReplacement`。
  {
    const dprM = t.match(/^あなたが(?:次のあなたの)?ドローフェイズに(?:カードを)?([０-９\d]+)枚引く場合、代わりに(?:カードを)?([０-９\d]+)枚引く$/);
    if (dprM) {
      return {
        type: 'RESERVE_DRAW_PHASE_REPLACEMENT', owner: 'self',
        fromCount: parseNum(dprM[1]), toCount: parseNum(dprM[2]),
      } as ReserveDrawPhaseReplacementAction;
    }
  }

  // 「この方法で捨てた〈名詞〉1枚につきカードを1枚引く」＝**直前の可変枚数に追従**するドロー（§6.4 O-11）。
  // 🔴汎用 DRAW が先に食うと**固定1枚**に潰れ、何枚捨てても1枚しか引かない過少実行になる
  //   （`WX22-037`「好きな枚数捨てる」＋この文）。`lastProcessedCards` は直前の TRASH が残している。
  // ⚠**「1枚につきM枚（M≧2）」は倍率が要る**（`addLastProcessedCount` は等倍のみ）ので、ここでは受けない
  //   ＝黙って等倍にすると原文より弱い別物になる。既存の `COUNT_BASED_DRAW_OR_POWER` 側の領分。
  {
    const perDiscardDrawM = t.match(/^この方法で(?:捨てた|トラッシュに置いた)[^。]{0,12}?([０-９\d]+)枚につきカードを([０-９\d]+)枚引く$/);
    if (perDiscardDrawM && parseNum(perDiscardDrawM[1]) === 1 && parseNum(perDiscardDrawM[2]) === 1) {
      return { type: 'DRAW', owner: 'self', count: 0, addLastProcessedCount: true };
    }
  }

  // 「場の…シグニ1体につきカードをN枚引く」は動的枚数（part3 の DRAW_PER_FIELD_COUNT）に委譲する。
  // 汎用 DRAW が先取りすると前半を無視して固定枚数に潰れてしまう。
  const drawM = t.match(/カードを?([０-９\d]+)枚引(?:く|いてもよい)/);
  if (drawM && !t.includes('体につき')) {
    // ⚠主語が「**対戦相手は**カードをN枚引く」（WX14-011②）でも owner:'self' に固定していたため、
    //   **相手にドローさせるデメリット**が自分のドローに化けていた（§3 Opusタスク10 パターンE）。
    const drawOwner: Owner = /対戦相手は(?:[^。]{0,10})?カードを?[０-９\d]+枚引/.test(t) ? 'opponent' : 'self';
    return { type: 'DRAW', owner: drawOwner, count: parseNum(drawM[1]) };
  }

  // ---- 対戦相手のシグニをエナゾーンに置く（エナ送り。バニッシュとは別アクション。ENERGY_CHARGE=デッキ等からチャージとは無関係）----
  {
    // "対戦相手のパワーN以上のシグニN体を対象とし、それをエナゾーンに置く"
    const m1 = t.match(/対戦相手のパワー([０-９\d]+)以上のシグニ([０-９\d]+|すべての)体?を対象とし.*エナゾーンに置く/);
    if (m1) {
      const count = m1[2] === 'すべての' ? 'ALL' : parseNum(m1[2]);
      return {
        type: 'SEND_TO_ENERGY',
        target: { type: 'SIGNI', owner: 'opponent', count, filter: { cardType: 'シグニ', powerRange: { min: parseNum(m1[1]) } } },
      } as SendToEnergyAction;
    }
    // "対戦相手のパワーN以上のすべてのシグニをエナゾーンに置く"
    const m2 = t.match(/対戦相手のパワー([０-９\d]+)以上のすべてのシグニをエナゾーンに置く/);
    if (m2) {
      return {
        type: 'SEND_TO_ENERGY',
        target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', powerRange: { min: parseNum(m2[1]) } } },
      } as SendToEnergyAction;
    }
    // "対戦相手の(レベルN以下/以上の)シグニN体を対象とし、それをエナゾーンに置く"
    const m3 = t.match(/対戦相手の(?:レベル([０-９\d]+)(以下|以上)の)?シグニ([０-９\d]+)体を対象とし.*それをエナゾーンに置く/);
    if (m3) {
      const lv = m3[1] ? parseNum(m3[1]) : undefined;
      const filter: TargetFilter = lv !== undefined
        ? { cardType: 'シグニ', level: m3[2] === '以下' ? { max: lv } : { min: lv } }
        : { cardType: 'シグニ', ...parseLevelLteLastProcessed(t) };
      return {
        type: 'SEND_TO_ENERGY',
        target: { type: 'SIGNI', owner: 'opponent', count: parseNum(m3[3]), filter },
      } as SendToEnergyAction;
    }
  }

  // ---- 対戦相手の色か色のシグニをトラッシュ/エナ（色フィルター付き）----
  {
    // ⚠TRASH＋色フィルタ: 従来は BANISH（エナ送り）かつ色フィルタ無し＝二重の誤り（続き19是正）
    const colorBanishM = t.match(/対戦相手の([白赤青緑黒])か([白赤青緑黒])のシグニ([０-９\d]+)体を対象とし.*トラッシュに置く/);
    if (colorBanishM) {
      return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: parseNum(colorBanishM[3]),
        filter: { cardType: 'シグニ', color: [colorBanishM[1], colorBanishM[2]] } } } as TrashAction;
    }
    const colorEnergyM = t.match(/対戦相手の([白赤青緑黒]か[白赤青緑黒])のシグニ([０-９\d]+)体を対象とし.*エナゾーンに置く/);
    if (colorEnergyM) {
      return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: parseNum(colorEnergyM[2]),
        filter: { cardType: 'シグニ', color: colorEnergyM[1].split('か') } } } as SendToEnergyAction;
    }
    // 🆕**対戦相手は自分のシグニN体を選びトラッシュに置く**（§5.3 `O-66`④の副産物・2026-08-25）。
    // 🔴汎用 TRASH 規則に落ちると **N が常に 1** になり、**「対戦相手が選ぶ」も落ちる**
    //   （`WX26-CP1-060-SONG`「自分のシグニ**２体**を選び」が1体に化けていた＝原文の半分）。
    //   ⚠この穴は `O-66`④ で遅延句を配線して初めて見えた（それまで SONG 専用経路が覆っていた）。
    if (t.match(/対戦相手は(?:.*?)自分のシグニ[０-９\d]+体を選びトラッシュに置く/)) {
      const cntTrashM = t.match(/自分のシグニ([０-９\d]+)体を選びトラッシュに置く/);
      return {
        type: 'TRASH',
        target: { type: 'SIGNI', owner: 'opponent', count: cntTrashM ? parseNum(cntTrashM[1]) : 1, filter: { cardType: 'シグニ' } },
        opponentSelects: true,
      } as EffectAction;
    }
    // 対戦相手は自分のシグニN体を選びエナゾーンに置く
    if (t.match(/対戦相手は自分のシグニ[０-９\d]*体?を選びエナゾーンに置く/)) {
      const cntM = t.match(/([０-９\d]+)体/);
      const cnt = cntM ? parseNum(cntM[1]) : 1;
      return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as SendToEnergyAction;
    }
  }

  // ---- ルリグタイプ無視（グロウ制限解除）----
  if (t.match(/このルリグにグロウするためのルリグタイプは無視される/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'IGNORE_LRIG_TYPE', until: 'PERMANENT' };
  }

  // ---- 正面への配置強制（CONTINUOUS: 相手のシグニ配置先を制限）----
  if (t.match(/対戦相手がシグニを配置する場合、可能ならばこのシグニの正面に配置しなければならない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'FORCE_PLACE_FRONT', until: 'PERMANENT' };
  }

  // ---- F-3 犠牲型：身代わりバニッシュ（STUB BANISH_SUBSTITUTE + banishSubstitute）----
  // ⚠下の generic バニッシュ block（「バニッシュしてもよい」を含む文を素の BANISH に落とす）より前に置く。
  //   collectBanishSubstitutes（effectEngine）がバトルバニッシュ経路で対話適用する。
  if (t.includes('がバニッシュされる場合') && t.includes('代わりに') && t.includes('バニッシュしてもよい')) {
    const oppTurnOnly = /対戦相手のターンの間/.test(t);
    // (a) 自己犠牲・他クラス犠牲型：「このシグニがバニッシュされる場合、代わりにあなたの他の＜X＞のシグニ１体をバニッシュしてもよい」
    const selfSacM = t.match(/このシグニがバニッシュされる場合、代わりにあなたの他の(?:＜([^＞]+)＞の)?シグニ[０-９\d]*体?を?バニッシュしてもよい/);
    if (selfSacM) {
      return {
        type: 'STUB', id: 'BANISH_SUBSTITUTE',
        banishSubstitute: {
          pattern: 'self_sacrifice_other',
          ...(selfSacM[1] ? { sacrificeClass: selfSacM[1] } : {}),
          sacrificeFilter: { cardType: 'シグニ', excludeSelf: true },
          ...(oppTurnOnly ? { oppTurnOnly: true } : {}),
        },
      } as StubAction;
    }
    // (b) 他者保護・自己犠牲型：「…あなたの(他の)シグニ１体がバニッシュされる場合、代わりにこのシグニをバニッシュしてもよい」
    //     《ライズアイコン》を持つ／【出】能力で選んだ 等の限定は victimFilter で近似（P10-052の【出】選択は機構未対応で otherAny 近似）。
    const protectSacM = t.match(/(?:あなたの(?:他の)?シグニ[０-９\d]*体?|選んだシグニ)がバニッシュされる場合、代わりにこのシグニをバニッシュしてもよい/);
    if (protectSacM) {
      const victimFilter: 'riseIcon' | 'otherAny' = /《ライズアイコン》/.test(t) ? 'riseIcon' : 'otherAny';
      return {
        type: 'STUB', id: 'BANISH_SUBSTITUTE',
        banishSubstitute: {
          pattern: 'protect_other_sacrifice_self',
          victimFilter,
          ...(/あなたの他のシグニ/.test(t) ? {
            victimTarget: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', excludeSelf: true } },
          } : {}),
          ...(oppTurnOnly ? { oppTurnOnly: true } : {}),
        },
      } as StubAction;
    }
  }

  // ---- §3タスク6 D: バニッシュ以外の場離れ→バニッシュへの置換（§6.3 機構待ち・acknowledged STUB）----
  // 「あなたの＜C＞のシグニが対戦相手の効果によって場を離れる場合、その移動がバニッシュによるものでないなら、
  //   代わりにそのシグニをバニッシュしてもよい」＝WX25-P1-056-E1。
  // ⚠下の「バニッシュ」ブロックより前に置く（従来は末尾だけ拾って CONTINUOUS BANISH{owner:'opponent'}＝
  //   「相手の＜原子＞を常時バニッシュ」という所有者まで反転した幻覚になっていた）。
  //   忠実実装には手札戻し/トラッシュ/デッキ戻し等 非バニッシュ場離れ経路への横取りフックが要る
  //   （既存フックは execBanish 内＝バニッシュ経路限定）ため、ここでは no-op STUB で明示化する。
  {
    const leaveToBanishM = t.match(/あなたの(?:＜([^＞]+)＞の)?シグニが対戦相手の効果によって場を離れる場合、その移動がバニッシュによるものでないなら、代わりにそのシグニをバニッシュしてもよい/);
    if (leaveToBanishM) {
      return {
        type: 'STUB', id: 'EFFECT_LEAVE_REPLACE_BANISH',
        leaveReplaceBanish: { ...(leaveToBanishM[1] ? { story: leaveToBanishM[1] } : {}) },
      } as StubAction;
    }
  }

  // ---- バニッシュ ----
  if (t.includes('バニッシュする') || t.includes('バニッシュしてもよい')) {
    // 「それをバニッシュする」= 前文で「対戦相手のシグニを対象とし」た相手シグニをバニッシュ
    if (t.match(/^それをバニッシュする$/)) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } };
    }
    // 「（この方法で）トラッシュに置いたシグニ1体につき対戦相手のシグニ1体を対象とし、それらをバニッシュする」
    // ＝直前ステップでトラッシュした枚数だけ対戦相手シグニをバニッシュ（動的数: last_processed_count）
    if (t.match(/トラッシュに置いたシグニ[０-９\d]*体?につき対戦相手のシグニ[０-９\d]*体?を.*バニッシュ/)) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: { $ref: 'last_processed_count' }, filter: { cardType: 'シグニ' }, upToCount: true } };
    }
    const selfSacrifice = parseSelfSigniSacrifice(t);
    if (selfSacrifice?.verb === 'BANISH') {
      return { type: 'BANISH', target: selfSacrifice.target, ...(selfSacrifice.optional ? { optional: true } : {}) };
    }
    if (t.match(/すべてのシグニをバニッシュ/)) {
      // ⚠**全文スキャン禁止**（続き377・(i)配線ギャップ 第6バッチ）。従来は owner も filter も文全体から取っており、
      //   ①レベル/クラス/レベル奇偶/ライズアイコン の限定が丸ごと落ちて**相手シグニ全体をバニッシュ**する過剰効果
      //     （`WX11-050-E2`「レベル１以下の」・`WXDi-CP02-042-E1`「レベル３以上の」・`WXK03-028-BURST`「レベルが奇数の」・
      //      `WXEX1-08-E3`「《ライズアイコン》を持たない」）
      //   ②文中の別の位置にある「対戦相手」を owner に取り違え（`WXDi-P07-073-E1`＝「**対戦相手のターン終了時**、
      //     あなたのすべてのシグニをバニッシュする」が**相手の全シグニ**を消していた）
      //   ③「他の」が「あなたの」を伴わないと `excludeSelf` が落ちる（`WXEX2-51-E2`「他のすべてのシグニ」＝自分自身も消える）
      //   が起きていた。**「すべてのシグニをバニッシュ」に隣接する名詞句 span**（読点・鉤括弧・コロンまで）だけを見る。
      const banishAllSpan = t.match(/([^。、：「」]*?)すべてのシグニをバニッシュ/)?.[1] ?? '';
      const banishAllOther = banishAllSpan.includes('他の');
      const owner: Owner = banishAllSpan.includes('対戦相手') ? 'opponent'
        : banishAllSpan.includes('あなた') ? 'self'
        : 'any';
      const banishAllFilter: TargetFilter = {
        cardType: 'シグニ',
        ...parsePowerFilter(banishAllSpan), ...parseStateFilter(banishAllSpan),
        ...parseLevelFilter(banishAllSpan), ...parseColorFilter(banishAllSpan), ...parseStoryFilter(banishAllSpan),
        ...(banishAllOther ? { excludeSelf: true } : {}),
      };
      // 「レベルが奇数/偶数の」（levelParity）・「《ライズアイコン》を持つ/持たない」＝型にも matchesFilter にも実装済み。
      const banishAllParityM = banishAllSpan.match(/レベルが(奇数|偶数)/);
      if (banishAllParityM) banishAllFilter.levelParity = banishAllParityM[1] === '奇数' ? 'odd' : 'even';
      if (/《ライズアイコン》を持たない/.test(banishAllSpan)) banishAllFilter.noRiseIcon = true;
      else if (/《ライズアイコン》を持つ/.test(banishAllSpan)) banishAllFilter.hasRiseIcon = true;
      if (/無色ではない/.test(banishAllSpan)) banishAllFilter.nonColorless = true;
      const excludedColor = banishAllSpan.match(/([白青赤緑黒])ではない/)?.[1];
      if (excludedColor) {
        delete banishAllFilter.color;
        banishAllFilter.colorExclude = excludedColor;
      }
      return { type: 'BANISH', target: { type: 'SIGNI', owner, count: 'ALL', filter: banishAllFilter } };
    }
    // 「対戦相手のシグニN体を対象とし、このシグニとそれをバニッシュする」＝選んだ相手シグニ＋自身を共にバニッシュ（WX03-032-E2）
    if (/このシグニと(?:それ|それら)を[^。]*バニッシュ/.test(t) && t.includes('対戦相手')) {
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'BANISH', target: parseSigniTarget(t, 'opponent') } as BanishAction,
          { type: 'BANISH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } } } as BanishAction,
        ],
      };
    }
    // 「〈相手の〉シグニをN体まで対象とし、**それらのパワーの合計がM以下の場合**、それらをバニッシュする」
    // （§6.4 O-34(d)・`WX25-P3-050-E1` 赤節・母集団1効果）。
    // 🔴従来はこの合計パワーゲートが丸ごと落ちて `BANISH{count:2, upTo}`＝**パワー無制限で2体バニッシュ**
    //   になっていた。既存の `totalPowerMax`（選択制約として engine 実装済み）に載せる。
    // ⚠下の「合計がM以下になるように好きな数」とは**体数上限の有無**だけが違う兄弟。
    const sumGateBanishM = t.match(/シグニを([０-９\d]+)体まで対象とし、それらのパワーの合計が([０-９\d]+)以下の場合、それらをバニッシュする/);
    if (sumGateBanishM) {
      return {
        type: 'BANISH',
        target: {
          type: 'SIGNI', owner: signiClauseOwner(t), count: parseNum(sumGateBanishM[1]), upToCount: true,
          filter: { cardType: 'シグニ', ...parseStoryFilter(t) },
          totalPowerMax: parseNum(sumGateBanishM[2]),
        },
      };
    }
    // 「パワーの合計がN以下になるように好きな数対象とし、それらをバニッシュする」（合計パワー制限の複数選択）
    const sumBanishM = t.match(/パワーの合計が([０-９\d]+)以下になるように好きな数/);
    if (sumBanishM) {
      const owner: Owner = signiClauseOwner(t);
      return {
        type: 'BANISH',
        target: {
          type: 'SIGNI', owner, count: 'ALL',
          filter: { cardType: 'シグニ', ...parseStoryFilter(t) },
          totalPowerMax: parseNum(sumBanishM[1]),
        },
      };
    }
    const owner: Owner = signiClauseOwner(t);
    const isOptional = t.includes('バニッシュしてもよい');
    // 「このシグニをバニッシュする」＝自身のみ（任意選択でなく thisCardOnly）。
    // ⚠文の別節に「対戦相手」があっても、バニッシュの目的語がこのシグニなら自己バニッシュ。
    if (hasThisSigniAsBanishObject(t)) {
      return { type: 'BANISH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } }, ...(isOptional ? { optional: true } : {}) };
    }
    // 「対戦相手は自分のシグニ1体を対象とし、それをバニッシュする」＝対戦相手が自分のシグニを選んでバニッシュ
    const oppSelects = /対戦相手は自分の/.test(t);
    return { type: 'BANISH', target: parseSigniTarget(t, owner), ...(isOptional ? { optional: true } : {}), ...(oppSelects ? { opponentSelects: true } : {}) };
  }

  // ---- ターン終了時に（出した）レゾナをルリグデッキへ戻す（§6.4・WX07-050／WX16-Re18）----
  // ⚠**戻し先はトラッシュではなくルリグデッキ**。ここを拾えないと UNKNOWN に落ち、
  //   出したレゾナが場に居座り続ける（＝一時的に出す札が恒久展開になる過剰効果）。
  // ⚠先頭の「ターン終了時、」は文分割で剥がれて届くので**断片側でアンカーする**。
  //   ⚠`それ**を**ルリグデッキに戻す`（単数）は別カード群＝アシストルリグを戻す【起】なので**除外**する
  //     （`WXDi-D06-004-E3` 等）。原文全数を確認して、この2形だけが「出したレゾナの返却」だった。
  if (/^(?:そのレゾナ|それら)を(?:場から)?ルリグデッキに戻す$/.test(t.trim())) {
    return { type: 'STUB', id: 'RETURN_SUMMONED_RESONA_AT_TURN_END' } as StubAction;
  }

  // ---- ライフクロスがクラッシュされる場合の置換（§6.4・WX24-P4-009／WX25-P3-004／WXDi-CP01-023）----
  // ⚠**下の deck-mill／LIFE_CRASH 規則より先に判定する**＝置換の宣言を即時実行に化けさせないため。
  //   実測の壊れ方＝`WX24-P4-009` は**その場で自分のデッキを10枚削り**、`WX25-P3-004` は
  //   **タダで相手のライフを1枚割って**いた（どちらも「代わりに」を読み落とした即時実行）。
  //   すぐ下の置換ミル規則に同じ注意書きがあるのと同じ事故が、別の文型で再発していた。
  {
    if (/クラッシュされる場合、代わりに/.test(t) && /ライフクロス/.test(t)) {
      const once = /次に/.test(t);
      const srcM = t.match(/対戦相手の(シグニ|ルリグ)(?:のアタック)?によって/);
      const byAttack = /のアタックによって/.test(t);
      const optional = /てもよい/.test(t);
      const base = {
        type: 'LIFE_CRASH_REPLACE' as const,
        ...(srcM ? { damageSource: (srcM[1] === 'ルリグ' ? 'lrig' : 'signi') as 'lrig' | 'signi' } : {}),
        ...(byAttack ? { byAttack: true } : {}),
        ...(once ? { once: true } : {}),
        ...(optional ? { optional: true } : {}),
      };
      // ⚠語尾は「置く」と「置いてもよい」の両方がある（任意版を落とすと即時自ミルへ落ちる＝元のバグに戻る）
      const millM = t.match(/代わりにあなたのデッキの上からカードを([０-９\d]+)枚トラッシュに置(?:く|いて)/);
      if (millM) {
        return { ...base, replaceKind: 'mill', count: parseNum(millM[1]) } as import('../../types/effects').LifeCrashReplaceAction;
      }
      const crashM = t.match(/代わりに対戦相手のライフクロス([０-９\d]+)枚をクラッシュ(?:する|して)/);
      if (crashM) {
        return { ...base, replaceKind: 'crash_opponent', count: parseNum(crashM[1]) } as import('../../types/effects').LifeCrashReplaceAction;
      }
    }
  }

  // ---- このターン次にダメージを受ける場合、代わりにデッキ上N枚トラッシュ（置換ミル・WXDi-P15-041/WX24-P1-010 等）----
  // ⚠下の deck-mill 規則より先に判定すること（「代わりに…デッキの上から…トラッシュに置く」が
  //   即時自ミルに化けていた実バグの根本原因＝置換シールドが無条件自傷になっていた・続き25）
  {
    const rm = t.match(/このターン、?次にあなたが(シグニ|ルリグ)?(?:によって)?ダメージを受ける場合、代わりにあなたのデッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
    if (rm) {
      return { type: 'REPLACE_NEXT_DAMAGE_WITH_MILL', millCount: parseNum(rm[2]),
        ...(rm[1] ? { damageSource: rm[1] === 'ルリグ' ? 'lrig' : 'signi' } : {}) } as import('../../types/effects').ReplaceNextDamageWithMillAction;
    }
  }

  // ---- デッキからトラッシュ（もよい）----
  // 「対戦相手のデッキの上から」は owner:'opponent'（相手ミル）。「あなたか対戦相手の」選択型は未対応のため従来どおり self に落とす（curated 側で個別管理）
  //
  // 🆕**主語形**「対戦相手は（自分の）デッキの上から…トラッシュに置く」も相手ミル（タスク12(lxxv)）。
  // ⚠従来は所有格「対戦相手**の**デッキ」しか見ておらず、主語形6効果が全部 `owner:'self'`＝
  //   **自分のデッキを削る自傷**になっていた（符号が逆の実害）。
  // ⚠誤爆よけ2枚＝①「対戦相手」と「デッキ」の間に**「あなた」が入る文は除外**
  //   （例「対戦相手がスペルを使用したとき、あなたのデッキの上から…」＝トリガー句に相手が出るだけ）
  //   ②「あなたのデッキの上から」と明示されていたら除外（明示所有格が主語形に優先する）。
  const oppSubjectDeckMill = /対戦相手[はが](?:(?!あなた)[^。])*?(?:自分の)?デッキの上から/.test(t)
    && !/あなたのデッキの上から/.test(t);
  const oppDeckMill = (/対戦相手のデッキの上から/.test(t) || oppSubjectDeckMill) && !/あなたか対戦相手/.test(t);
  // 「〈相手/あなた〉のデッキの上から**この方法でダウンしたルリグのレベルの合計に１を加えた**枚数のカードを
  // トラッシュに置く」（WX25-P2-114）＝可変ミル。従来は枚数句を読めず POWER_MOD_PER_COUNT の STUB へ落ちて
  // **原文に無いパワー修整**に化けていた（タスク12(cix)）。合計は PlayerState 側の記録から読む（枚数選択の
  // CHOOSE を跨ぐため lastProcessedCards では消える）。
  {
    const lrigSumMillM = t.match(/デッキの上からこの方法でダウンしたルリグのレベルの合計に([０-９\d]+)を加えた枚数のカードをトラッシュに置く/);
    if (lrigSumMillM) {
      return {
        type: 'MILL', owner: oppDeckMill ? 'opponent' : 'self',
        count: parseNum(lrigSumMillM[1]), countPlusLastDownedLrigLevelSum: true,
      } as EffectAction;
    }
  }
  {
    const deckOptM = t.match(/(?:あなたの)?デッキの上からカードを([０-９\d]+)枚トラッシュに置いてもよい/);
    if (deckOptM) {
      return { type: 'TRASH', target: { type: 'DECK_CARD', owner: oppDeckMill ? 'opponent' : 'self', count: parseNum(deckOptM[1]) } };
    }
  }

  // ---- 「対戦相手のセンタールリグの下からカードをN枚まで対象とし、それらをルリグトラッシュに置く」＝
  //      **相手のエクシード剥がし**（§6.4 O-11・`WD23-012-A` ③）----
  // 🔴下の「トラッシュに置く（直接除去）」フォールバックがこの文を食い、
  //   **相手の場のシグニ1体をトラッシュする別物**（過剰実行）になっていた。
  // ⚠engine のルリグ下操作（`INTERNAL_CONSUME_LRIG_UNDER`／`SOUL_OP` ほか）は
  //   **すべて `ctx.ownerState` 固定**で相手側のスタックを触れない＝機構が要る。
  //   実装が入るまでは**明示 defer**（無言の no-op ではなく宣言された no-op）にする。
  if (/対戦相手の(?:センター)?ルリグの下から(?:カード)?を?[０-９\d]+枚(?:まで)?を?対象とし、?それらを(?:ルリグ)?トラッシュに置く/.test(t)) {
    return { type: 'STUB', id: 'DEFERRED_OPP_LRIG_UNDER_TO_TRASH' } as StubAction;
  }

  // ---- トラッシュに置く（直接除去）----
  if (t.includes('トラッシュに置く') || t.includes('トラッシュに置く')) {
    const selfSacrifice = parseSelfSigniSacrifice(t);
    if (selfSacrifice?.verb === 'TRASH') {
      return { type: 'TRASH', target: selfSacrifice.target, ...(selfSacrifice.optional ? { optional: true } : {}) };
    }
    // ---- 「〈対象宣言〉を対象とし、〈誰か〉のデッキの一番上のカードをトラッシュに置く」（§6.4 O-35）----
    // 🔴従来はこのブロック末尾の「シグニ・ルリグをトラッシュへ」フォールバックが
    //   `t.includes('対戦相手のシグニ')` **だけ**を見て `TRASH{SIGNI opponent}` を返していた＝
    //   **間に挟まる目的語（「あなたのデッキの一番上のカードを」）を無視**して、
    //   【出】でノーコストの相手シグニ除去に化けていた（live 3効果＝`WXK03-080-E1`／`WXK03-081-E1`／
    //   `WXEX1-41-E2`。うち `WXEX1-41-E2` は続く「それをバニッシュする」も**自分のシグニ**を撃っていた）。
    //   この文が実際にトラッシュへ置くのは**デッキの一番上のカード**だけで、対象宣言は
    //   後続文の「それ（ら）」の束縛先にすぎない（この文自体は場から何も除去しない）。
    // 🔑正準形＝`SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS → TRASH{DECK_CARD}`。
    //   ミルが `lastProcessedCards` を置いたカードで上書きするので後続文の `LAST_PROCESSED_MATCHES`
    //   （「それがレベルが偶数のシグニの場合」）はそのまま生き、帰結側は `targetsStored` で
    //   宣言した対象へ戻る（束縛は effectParser の `applyDeckTopMillTargetAnaphora`）。
    // ⚠**コスト節に置かれた形（`【起】…デッキの一番上のカードをトラッシュに置く：〈本文〉`）はここに来ない**
    //   （コロンの前はコストとして別扱い＝`WXDi-P10-009-E2`／`WXK06-084-E1`）。
    {
      const deckTopMillM = t.match(/(あなた|対戦相手)のデッキの一番上のカードをトラッシュに置く/);
      // ⚠**「を」は付かない形がある**＝「シグニ**を２体まで**対象とし」（`WXK03-080-E1`）と
      //   「シグニ１体**を**対象とし」（`WXK03-081-E1`）の2綴り。`を対象とし` 固定だと前者が漏れる。
      const millDesigM = t.match(/((?:対戦相手|あなた)の[^、。]*?シグニを?[０-９\d]*体(?:まで)?)を?対象とし/);
      if (deckTopMillM && millDesigM) {
        const millDesigOwner: Owner = millDesigM[1].startsWith('対戦相手') ? 'opponent' : 'self';
        return {
          type: 'SEQUENCE',
          steps: [
            { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: parseSigniTarget(millDesigM[1], millDesigOwner) } as StubAction,
            { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' } as StubAction,
            { type: 'TRASH', target: { type: 'DECK_CARD', owner: deckTopMillM[1] === '対戦相手' ? 'opponent' : 'self', count: 1 } },
          ],
        } as SequenceAction;
      }
    }
    // 「あなたの（XかYの）シグニを好きな数対象とし、それらを（場から）トラッシュに置く」= 好きな数選択
    if (t.match(/あなたの(?:.+の)?シグニを好きな数対象とし/)) {
      const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t) };
      return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', upToCount: true, filter } };
    }
    // デッキからトラッシュ
    const deckM = t.match(/デッキの上からカードを([０-９\d]+)枚トラッシュに置く/);
    if (deckM) {
      // 「**あなたか対戦相手の**デッキの上からカードをN枚トラッシュに置く」＝**どちらのデッキを削るかを選ぶ**
      // （タスク12(lxvi)①）。⚠上の `oppDeckMill` がこの文型を明示除外しているため、規則が無いと `owner:'self'` に落ちて
      //   **常に自分のデッキを削る**（原文が与える選択肢が消える）。live 17ノードは同じ形の CHOOSE へ手当て済みだったが
      //   **parser 側に規則が無かった**ので、再収穫のたびに「curated が持ち fresh が失う」差分として残り、
      //   同じカードの無関係な改善まで採用できなくしていた（(lxvi) の据置理由そのもの）。
      // ⚠`各プレイヤー`（＝両方削る）とは別物なので、そちらの分岐より**先**に判定する。
      if (/あなたか対戦相手の[^。]*?デッキの上から/.test(t)) {
        const millN = parseNum(deckM[1]);
        return {
          type: 'CHOOSE',
          choose_count: 1,
          from_count: 2,
          choices: [
            {
              choiceId: 'self_deck',
              label: `あなたのデッキの上から${millN}枚をトラッシュ`,
              action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: millN } },
            },
            {
              choiceId: 'opp_deck',
              label: `対戦相手のデッキの上から${millN}枚をトラッシュ`,
              action: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: millN } },
            },
          ],
        };
      }
      const both = t.includes('各プレイヤー');
      if (both) {
        return {
          type: 'SEQUENCE',
          steps: [
            { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: parseNum(deckM[1]) } },
            { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: parseNum(deckM[1]) } },
          ],
        };
      }
      return { type: 'TRASH', target: { type: 'DECK_CARD', owner: oppDeckMill ? 'opponent' : 'self', count: parseNum(deckM[1]) } };
    }
    // シグニ・ルリグをトラッシュへ（対戦相手 or 自分）
    // 「対戦相手のシグニを対象とし、あなたのシグニをトラッシュ」→ self のトラッシュ
    if (t.match(/対戦相手のシグニ.+体を対象とし.*あなたのシグニ.*トラッシュに置く/)) {
      return { type: 'TRASH', target: parseSigniTarget(t, 'self') };
    }
    if (t.includes('対戦相手のシグニ') || t.includes('対戦相手の感染状態のシグニ') || t.includes('対戦相手のパワー') || t.includes('対戦相手のセンタールリグ')) {
      return { type: 'TRASH', target: parseSigniTarget(t, 'opponent') };
    }
    if (t.includes('あなたのシグニ') || t.includes('あなたの他のシグニ') || t.includes('あなたの感染状態のシグニ')) {
      return { type: 'TRASH', target: parseSigniTarget(t, 'self') };
    }
  }

  // ---- バウンス（手札に戻す / 戻してもよい）----
  if (t.includes('手札に戻す') || t.includes('手札に戻してもよい')) {
    const owner: Owner = signiClauseOwner(t);
    const upToM = t.match(/([０-９\d]+)体まで/);
    const countM = t.match(/([０-９\d]+)体を対象/);
    const all = t.includes('すべて');
    const count = all ? 'ALL' : (upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1));
    // 「このシグニを（場から）手札に戻す」＝自身限定（thisCardOnly）。トリガーの「このシグニが…とき」とは
    // 区別するため「このシグニを…手札に戻」の語順で判定する（対戦相手/他シグニ対象には付けない）。
    const isThisCard = /このシグニを(?:場から)?手札に戻/.test(t);
    return {
      type: 'BOUNCE',
      target: {
        type: 'SIGNI', owner, count, upToCount: !!upToM,
        // ⚠`parseStoryFilter` は続き376d 追加。`parseSigniTarget`（parserUtils）は元から合成しているのに、
        //   この BOUNCE ビルダーだけ filter をインラインで組んでいて**＜クラス＞だけ落ちて**いた
        //   ＝「あなたの＜遊具＞のシグニを２体まで対象とし、それらを手札に戻す」で**自分の全シグニ**が
        //   候補になる過剰効果（`WDK05-T07-E1`／`WX24-P3-026-E1`／`WXDi-P02-047-E1`）。
        //   `excludeSelf`（「他の」）は載っていたのにクラスだけ落ちる＝被覆マトリクスが指した典型例。
        //   🆕**色も同じ理由で落ちていた**（2026-08-19 続き571）＝`WD13-003-E2`「**対象のあなたの白の**シグニ１体を
        //   手札に戻す」で**自分のどの色のシグニでも**戻せる過剰効果。⚠色は条件節・コスト節にも同じ綴りで出るので
        //   **対象名詞句に隣接する色だけ**（`signiClauseColorFilter`）＝素の `parseColorFilter(t)` は使わない。
        filter: { cardType: 'シグニ', ...parsePowerFilter(t), ...parseLevelFilter(t), ...parseLevelLteLastProcessed(t), ...parseSelfComparison(t), ...parseStateFilter(t), ...parseNoAbilitiesFilter(t), ...signiClauseStoryFilter(t), ...signiClauseColorFilter(t), ...(isThisCard ? { thisCardOnly: true } : {}), ...(hasOtherSelfSigniNoun(t) ? { excludeSelf: true } : {}) },
      },
      optional: t.includes('もよい'),
    };
  }

  // ---- ハンデス（相手手札捨て）----
  if (t.includes('捨てさせる') || (t.includes('対戦相手は手札を') && t.includes('捨てる'))) {
    // 見ないで選ぶ（ランダム）
    const blindM = t.match(/対戦相手の手札を([０-９\d]+)枚見ないで選び、捨てさせる/)
                ?? t.match(/対戦相手の手札を([０-９\d]+)枚見ないで選び捨てさせる/);
    if (blindM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(blindM[1]), blind: true } };
    }
    // 1枚版（「1枚」省略パターン）
    if (t.match(/対戦相手の手札を.*見ないで選び/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, blind: true } };
    }
    // 強制捨て
    const forceM = t.match(/対戦相手は手札を([０-９\d]+)枚捨てる/);
    if (forceM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(forceM[1]) } };
    }
    // 「対戦相手は手札を1枚捨てる」
    if (t.match(/対戦相手は手札を.*捨てる/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } };
    }
    // 見てからレベル指定で捨てさせる（複雑→UNKNOWN）
  }

  // ---- 各プレイヤーは手札をN枚捨てる ----
  {
    const bothDiscardM = t.match(/各プレイヤーは手札を([０-９\d]+)枚捨てる/);
    if (bothDiscardM) {
      return { type: 'DISCARD_BOTH', count: parseNum(bothDiscardM[1]) };
    }
  }

  // ---- 自分手札を捨てる（任意含む）----
  // 🔴「手札をN枚**まで**捨てる」は綴りが無く UNKNOWN に落ちていた（§6.4 O-35・続き528）＝
  //   `WX25-P3-005-E1` は前段の DRAW だけが残って**捨てる節が丸ごと消え**、後段の「この方法で捨てた
  //   カード１枚につき」も 0 枚基準になっていた。正準形は続き522 と同じ `upToCount`（engine 実装済み）。
  const selfDiscardM = t.match(/^(?:あなたは)?手札を([０-９\d]+)枚?(まで)?捨てる(?:もよい)?$/);
  if (selfDiscardM) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(selfDiscardM[1]), ...(selfDiscardM[2] ? { upToCount: true } : {}) } };
  }
  // ---- 「（…を対象とし、）手札をN枚捨ててもよい」（任意）----
  // 「てもよい」＝任意。「そうした場合、それを<除去>」の did-it ゲートと組む任意コストで、optional を落とすと
  //   engine が強制で手札を捨てさせる（curated が持つ optional:true を復元＝§3 タスク12(vii)系）。
  //   ⚠この規則は先頭非アンカーで「…を対象とし、手札をN枚捨ててもよい」も拾う＝part3 の anchored 版より先に効く。
  // ⚠**主語が「対戦相手は」の形はここで取ってはいけない**（§6.4・続き425）＝捨てるのは相手なので
  //   `owner:'self'` は所有者反転そのもの。判定は**最後の読点以降の節**で見る（前置きの条件節に
  //   「対戦相手のシグニ1体を対象とし、」等が入る形を巻き込まないため）。相手側の任意支払いは
  //   part3 の `OPPONENT_PAY_OPTIONAL` が受ける。
  {
    const optDiscardM = t.match(/手札を([０-９\d]+)枚捨ててもよい$/);
    const lastClause = t.slice(t.lastIndexOf('、') + 1);
    if (optDiscardM && !/^対戦相手[はが]/.test(lastClause)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(optDiscardM[1]) }, optional: true };
    }
  }

  // ---- サーチ（手札 or 場に出す or エナゾーン）----
  // 終止形「場に出す」も受ける（従来は連用形「場に出し」のみで、文末が「探して場に出す。」の文が
  // この規則を素通りして bare ADD_TO_FIELD に退化＝デッキ検索が丸ごと消えていた。WXEX2-28/WX18-001）。
  // ⚠「手札かデッキから」（二重ソース＝WX20-053）は deck 単独 SEARCH に丸めると手札側が失われるため除外（据置）。
  // 🆕【トラップ】設置先（§6.4 O-11・2026-08-16）＝「デッキからカードをN枚まで探して**【トラップ】として
  //   あなたのシグニゾーンに設置し**、デッキをシャッフルする」。行き先の語彙が無かったためこの規則を素通りし、
  //   **サーチも設置も丸ごと消えて `SHUFFLE_DECK` だけ**が残っていた（`WD23-008-A`／`WD23-033-A`）。
  //   engine 側は `resumeSearch` が `then:STUB{INTERNAL_ASK_TRAP_ZONE}` を**ピック枚数ぶん展開**して
  //   ゾーン選択→`field.signi_traps` へ置く（`effectExecutor.ts:8475`）＝機構は既存で足りる。
  const toTrapZone = /【トラップ】として[^。]*シグニゾーンに設置/.test(t);
  // 🆕【アクセ】付け先（§6.4 O-11・2026-08-16）＝「あなたのデッキから〈X〉のシグニN枚まで探して
  //   **それ（ら）の【アクセ】にし**、デッキをシャッフルする」。行き先の語彙が無くこの規則を素通りし、
  //   **サーケもアクセ付けも消えて `SHUFFLE_DECK` だけ**になっていた（`WDK07-E07`／`WDK07-E20`／`WXK10-074`）。
  //   engine 側は `INTERNAL_ASK_ACCE_HOST`（`execStubPart3`）＋`resumeSearch` の枚数展開で受ける。
  // ⚠既存の `ATTACH_ACCE` は使えない＝アクセ元がエナ／手札のときしかカードを抜けない。
  const toAcce = /探して[^。]*【アクセ】に(?:し|する)/.test(t);
  // 🆕ライフクロス行き（§6.4 O-11・`WXEX2-13-E2`）＝「あなたのデッキからカード１枚を探して**ライフクロスに加え**、
  //   デッキをシャッフルする」。行き先の語彙が無いためこの規則を素通りし、**サーチもライフ加えも消えて
  //   `SHUFFLE_DECK` だけ**が残っていた（後続の「ライフクロス１枚をクラッシュする」だけが走る＝
  //   ライフが増えずに減る**符号が逆の**盤面になる）。engine 側は `ADD_TO_LIFE{fromSearch}` が既存
  //   （`effectExecutor` の resume 経路）＝配線するだけで足りる。
  const toLife = /ライフクロスに加え/.test(t);
  if (t.includes('デッキから') && t.includes('探して') && !t.includes('手札かデッキから') &&
      (toTrapZone || toAcce || toLife || t.includes('手札に加え') || t.includes('場に出し') || t.includes('場に出す') || t.includes('トラッシュに置き') || t.includes('エナゾーンに置く') || t.includes('エナゾーンに置き'))) {
    const filter: TargetFilter = {
      // ⚠トラップ設置文は「あなたの**シグニゾーン**に設置」と書くだけで**探す対象はカード全般**。
      //   ここで cardType を拾うと「シグニしか【トラップ】にできない」過少実行になる。
      ...(toTrapZone ? {} : parseCardTypeFilter(t)),
      ...parseCostTotalFilter(t),
      ...parseLevelFilter(t),
      ...parseLevelLteLastProcessed(t),
      ...parseLastProcessedComparison(t),
      ...parseColorFilter(t),
      ...parseStoryFilter(t),
      ...parseColorMatchesLrig(t),
      ...parseNoAbilitiesFilter(t),
      // 「無色ではない〜」（§5d パターンA）。`nonColorless` は型にも matchesFilter にも実装済みなのに
      // SEARCH のフィルタ合成から漏れており、**無色シグニまで探せる過剰効果**だった
      // （`PR-K043-E2`／`WXK02-010`／`WXK11-034`／`WXK11-051`／`WX06-025` 等）。
      // ⚠全CSV走査で「無色ではない」55件はすべて名詞句修飾（「〜として」「〜場合」の別用法が無い）ことを確認済み。
      ...(/無色ではない/.test(t) ? { nonColorless: true } : {}),
    };
    const excludeNameM = t.match(/《([^》]+)》以外/);
    const nameM = t.match(/《([^》]+)》/);
    if (excludeNameM) {
      filter.excludeCardName = excludeNameM[1];
      // 「《巨弓　ガンデヴァ》**以外の**カード名に《弓》を含むシグニ」（`WX13-041-E1`）＝除外と部分一致が**同居**する。
      // 旧実装は else-if で後者を捨てており、どのシグニでも探せる過剰効果になっていた（§5d パターンA・続き371）。
      const containsM = t.match(/カード名に《([^》]+)》を含む/);
      if (containsM) filter.cardName = containsM[1];
    } else if (nameM) {
      // 《Xアイコン》を持つカード＝アイコン保持フィルタ（hasIcon）。カード名フィルタにすると
      // どのカード名にも含まれず無言no-matchになる（WX08-072-BURST の旧バグ）
      const iconM = nameM[1].match(/^(クロス|ライズ|トラップ|アクセ)アイコン$/);
      if (iconM) filter.hasIcon = iconM[1] as 'クロス' | 'ライズ' | 'トラップ' | 'アクセ';
      else filter.cardName = nameM[1];
    }
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const countM = t.match(/([０-９\d]+)枚を探/);
    const maxCount = upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1);
    const toField = t.includes('場に出し') || t.includes('場に出す');
    const toTrash = t.includes('トラッシュに置き');
    const toEnergy = t.includes('エナゾーンに置く') || t.includes('エナゾーンに置き');
    return {
      type: 'SEARCH',
      from: { location: 'deck', owner: 'self' },
      filter,
      maxCount,
      then: toTrapZone
        ? { type: 'STUB', id: 'INTERNAL_ASK_TRAP_ZONE' } as EffectAction
        : toAcce
        // ⚠ホスト側の絞り込みは**「探して」より前**に書かれた「あなたの＜X＞のシグニ1体を対象とし」から取る。
        //   SEARCH の `filter`（アクセ**カード**側）と役割を混ぜない＝同じ ＜X＞ でも意味が違う。
        ? ({ type: 'STUB', id: 'INTERNAL_ASK_ACCE_HOST',
             ...(parseStoryFilter(t.split('探して')[0]).story
               ? { acceHostFilter: { cardType: 'シグニ', ...parseStoryFilter(t.split('探して')[0]) } }
               : {}) } as EffectAction)
        : toLife
        ? { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: false, fromSearch: true } as EffectAction
        : toField
        ? { type: 'ADD_TO_FIELD', owner: 'self' }
        : toTrash
          ? { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } }
          : toEnergy
            ? { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction
            : { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] },
      afterSearch: t.includes('シャッフル') ? { type: 'SHUFFLE_DECK', owner: 'self' } : undefined,
      // 「（それぞれ）**レベルの異なる**＜X＞のシグニN枚を探して」（§6.4 O-29・`WX17-003-E1`③）＝
      // **選択集合どうしの相互制約**（候補単体の条件ではない）なので `selectionConstraint` に載せる。
      // ⚠落とすと**同じレベルを2枚**探せる＝原文より緩い。`SearchAction.selectionConstraint` は実装済み。
      ...(/(?:それぞれ)?レベルの異なる/.test(t) ? { selectionConstraint: { distinct: 'level' as const } }
        : /(?:それぞれ)?名前の異なる/.test(t) ? { selectionConstraint: { distinct: 'name' as const } }
        : {}),
    };
  }

  // ---- 複数対象パワー修整（「それらのパワーをそれぞれ±N」）----
  {
    const multiPowerM = t.match(/シグニ([０-９\d]+)体を対象とし.*それらのパワーをそれぞれ([＋－])([０-９\d]+)する/);
    if (multiPowerM) {
      const count = parseNum(multiPowerM[1]);
      const delta = multiPowerM[2] === '＋' ? parseNum(multiPowerM[3]) : -parseNum(multiPowerM[3]);
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const target: EffectTarget = { type: 'SIGNI', owner, count, filter: { cardType: 'シグニ' } };
      return { type: 'POWER_MODIFY', target, delta } as PowerModifyAction;
    }
    // フラグメント「それらのパワーをそれぞれ±N000する」- 対戦相手シグニを近似ターゲットとして使用
    const fragM = t.match(/^(?:それら|それとこのシグニ)のパワーをそれぞれ([＋－])([０-９\d]+)する$/);
    if (fragM) {
      const delta = fragM[1] === '＋' ? parseNum(fragM[2]) : -parseNum(fragM[2]);
      return { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, delta } as PowerModifyAction;
    }
  }

  // ---- 場レベルのパワー＋キーワード複合（同じ動的対象へ両方を付与）----
  // 「中央ゾーンのシグニのパワーは＋Nされ、それは【K】を得る」。POWER_MODIFY が先に全文を
  // 奪うと後半のキーワードが消えるため、木の形として SEQUENCE にする。
  const centerPowerKeywordM = t.match(/あなたの中央のシグニゾーンにあるシグニのパワーは＋([０-９\d]+)され、それは【([^】]+)】を得る/);
  if (centerPowerKeywordM) {
    const target: EffectTarget = {
      type: 'SIGNI', owner: 'self', count: 'ALL',
      filter: { cardType: 'シグニ', centerZoneOnly: true },
    };
    const nextOpponentTurn = t.includes('次の対戦相手のターンの間');
    const nextGlobalTurn = !nextOpponentTurn && t.includes('次のターンの間');
    const duration: EffectDuration = nextOpponentTurn || nextGlobalTurn ? 'NEXT_TURN' : 'UNTIL_END_OF_TURN';
    const nextTurnOwner = nextOpponentTurn ? 'opponent' as const : nextGlobalTurn ? 'next' as const : undefined;
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'POWER_MODIFY', target, delta: parseNum(centerPowerKeywordM[1]), duration, ...(nextTurnOwner ? { nextTurnOwner } : {}) },
        { type: 'GRANT_KEYWORD', target, keyword: centerPowerKeywordM[2], duration, ...(nextTurnOwner ? { nextTurnOwner } : {}) },
      ],
    };
  }

  // ---- 指定シグニゾーンの**動的**パワー修正（そのシグニのレベル１につき±N）----
  // 「次のあなたのターンまで、指定されたシグニゾーンにあるシグニのパワーをそのシグニのレベル１につき－2000する」
  // （`WDK10-009-E2`・§6.4 O-16(a)）。⚠下の「パワーパンプ / デバフ」は `パワーを＋N` の**隣接**を要求する
  //   ので、あいだに「そのシグニのレベル１につき」が挟まるこの語形には当たらず、Part4 の
  //   `STUB{POWER_MOD_PER_COUNT}` へ落ちていた（＝ACTIVATED 経路には消費地点が無く真 no-op）。
  // ⚠**delta を数値へ焼き込まない**＝ゾーン継続なので倍率は「その時点でそこにいるシグニ自身のレベル」。
  //   engine 側は `FieldGrant{kind:'power', perTargetLevel:true}` が適用のたびに掛ける。
  // ⚠ゾーンの持ち主は既存の指定ゾーン規則と同じく**符号で決める**（マイナス＝相手ゾーン）。
  //   DESIGNATE 側の owner は下流の `alignDesignatedZoneOwner` がこの target から揃える。
  // ⚠「レベル**１**につき」以外（除数つき）は受け皿が無いので、意図的にこの規則へ当てず STUB のまま残す。
  const designatedPerLevelM = t.match(
    /指定されたシグニゾーンにあるシグニのパワーを(?:その)?シグニのレベル[１1]につき([＋－])([０-９\d]+)する/,
  );
  if (designatedPerLevelM) {
    const perLevelDelta = designatedPerLevelM[1] === '＋'
      ? parseNum(designatedPerLevelM[2])
      : -parseNum(designatedPerLevelM[2]);
    const pmDesig: PowerModifyAction = {
      type: 'POWER_MODIFY',
      target: {
        type: 'SIGNI', owner: perLevelDelta < 0 ? 'opponent' : 'self', count: 'ALL',
        filter: { cardType: 'シグニ' }, zoneSource: 'designated',
      },
      delta: perLevelDelta,
      deltaPerTargetLevel: true,
    };
    // 「次のあなたのターンまで」＝このターンの残り＋**次の対戦相手のターン**（自分の次のターンが始まると切れる）。
    // 期間句が無ければ従来どおりこのターン限り。
    const nextOwnTurnUntil = t.includes('次のあなたのターンまで') || t.includes('次の自分のターンまで');
    const nextOpponentTurn = t.includes('次の対戦相手のターンの間');
    const nextGlobalTurn = !nextOpponentTurn && t.includes('次のターンの間');
    if (nextOwnTurnUntil || nextOpponentTurn || nextGlobalTurn) {
      pmDesig.duration = 'NEXT_TURN';
      pmDesig.nextTurnOwner = nextGlobalTurn && !nextOwnTurnUntil ? 'next' : 'opponent';
      if (nextOwnTurnUntil || t.includes('このターンと次のターンの間')) pmDesig.appliesThisTurn = true;
    }
    return pmDesig;
  }

  // ---- パワーパンプ / デバフ ----
  const plusM = t.match(/パワーを＋([０-９\d]+)する/) ?? t.match(/パワーは＋([０-９\d]+)され/);
  const minusM = t.match(/パワーを－([０-９\d]+)する/) ?? t.match(/パワーは－([０-９\d]+)され/)
               ?? t.match(/パワーを-([０-９\d]+)する/);
  if (plusM || minusM) {
    const delta = plusM ? parseNum(plusM[1]) : -(parseNum(minusM![1]));
    let target: EffectTarget;
    let isTriggerSource = false;
    let excludeSelf = false;
    const iconM = t.match(/(あなた|対戦相手)の《(クロス|ライズ|トラップ|アクセ)アイコン》を持つシグニのパワーを/);
    const otherSelfDesignated = /あなたの(?:効果によって)?他の(?!(?:シグニゾーン|ルリグ|カード名))[^。、]*シグニ[^。、]*を対象とし[^。]*それ(?:の|とこのシグニの)パワー/.test(t);
    // 「このカードの上にある[＜クラス＞の|《名前》|色の]シグニのパワーを±N」＝このカードが**下に置かれている**
    // スタックの最前面シグニ（＝ホスト）宛。acceHost の兄弟で、装着経路がスタック下である点だけが違う。
    // ⚠これが無いと下の else へ落ちて owner:'any'/count:1＝「場のシグニ1体を任意選択」という別物になっていた
    //   （CONTINUOUS 側は effectEngine が count≠ALL を「効果元自身」に解決するため**自分に**バフする過剰実行）。
    const aboveSelfM = t.match(/このカードの上にある(＜[^＞]+＞の|《[^》]+》|[白赤青緑黒]の)?(?:シグニ)?のパワーを/);
    // 「これにアクセされている[＜クラス＞の|《名前》]シグニのパワーを±N」＝このカードが**アクセとして付いている**
    // ホスト宛（acceHost）。⚠`parseSentencePart2` に専用規則が3本あるが、Part1 の本ブロックが常に先に
    //   `パワーを＋N` を食うため**到達不能な死んだ規則**で、実際には下の既定 else に落ちて
    //   **`filter` が丸ごと無い owner:'any'/count:1**＝「場のシグニ1体を任意選択」に潰れていた
    //   （CONTINUOUS では effectEngine が count≠ALL を効果元自身に解決するので**自分にバフ**する過剰実行）。
    //   全CSV走査で該当10枚（`SP27-015`／`WX17-033`／`WX20-072`／`WXEX2-69`／`WXK04-080`／`WXK04-082`／
    //   `WD18-013`／`WD18-015`／`WDK17-015`／`WXDi-P09-TK01A`）が**全部この穴**に落ちていた（live は手修正で正しい）。
    //   実体の加算は effectEngine の signi_acce ループが行う（aboveSelf の兄弟＝装着経路だけが違う）。
    const acceHostM = t.match(/^これにアクセされている(＜[^＞]+＞の|《[^》]+》)?(?:シグニ)?のパワーを/);
    if (otherSelfDesignated) {
      target = parseSigniTarget(t, 'self');
      excludeSelf = true;
    } else if (aboveSelfM) {
      const mod = aboveSelfM[1] ?? '';
      const aboveFilter: TargetFilter = { aboveSelf: true };
      const clsM = mod.match(/^＜([^＞]+)＞の$/);
      if (clsM) aboveFilter.cardClass = clsM[1];
      const nameM = mod.match(/^《([^》]+)》$/);
      if (nameM) aboveFilter.cardName = nameM[1];
      const colM = mod.match(/^([白赤青緑黒])の$/);
      if (colM) aboveFilter.color = colM[1];
      target = { type: 'SIGNI', owner: 'self', count: 1, filter: aboveFilter };
    } else if (acceHostM) {
      const mod = acceHostM[1] ?? '';
      const acceFilter: TargetFilter = { acceHost: true };
      const clsM = mod.match(/^＜([^＞]+)＞の$/);
      if (clsM) acceFilter.cardClass = clsM[1];
      const nameM = mod.match(/^《([^》]+)》$/);
      if (nameM) acceFilter.cardName = nameM[1];
      target = { type: 'SIGNI', owner: 'self', count: 1, filter: acceFilter };
    } else if (iconM) {
      // 「あなたの《クロスアイコン》を持つシグニのパワーを＋Nする」等。対象は該当アイコン持ち全シグニ
      const owner: Owner = iconM[1] === 'あなた' ? 'self' : 'opponent';
      target = { type: 'SIGNI', owner, count: 'ALL', filter: { cardType: 'シグニ', hasIcon: iconM[2] as 'クロス' | 'ライズ' | 'トラップ' | 'アクセ' } };
    } else if (t.match(/あなたの(?:すべての)?レゾナのパワーを/)) {
      // 「あなたの(すべての)レゾナのパワーを±N」＝自分のレゾナ全体への持続バフ（WX07-007/WX08-019）。
      // cardType:'レゾナ' で engine（card.Type==='レゾナ'）も decompiler もレゾナと認識する。
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'レゾナ' } };
    } else if (t.match(/(?:その|指定された)シグニゾーンにあるシグニのパワーを/)) {
      // DESIGNATE_SIGNI_ZONE が対象側 state に保存した固定ゾーン。count:ALL は選択対象の全体ではなく
      // 「そのゾーンに現在／将来いるシグニ」への**場レベル適用**を表す（原文の
      // 「このアーツの使用後にそこに置かれたシグニにも影響を与える」がまさにこれ）。§6.4 O-16。
      // ⚠従来この規則は「このターンと次のターンの間、指定された…」という**1枚ぶんの語形にだけ**当たっており、
      //   「このターン、**その**シグニゾーンにある…」の5効果は既定 else の `owner:'any'/count:1` へ落ちて
      //   **好きなシグニ1体を選ぶ**別物になっていた（＝直前の DESIGNATE の選択が使われない）。
      // ⚠**ゾーンの持ち主は符号で決める**＝マイナスは相手ゾーン、プラスは自分ゾーン。
      //   文単位パースでは先行文の「対戦相手の」が見えず、live 6効果は
      //   （－7000/－5000×2/－3000×2＝相手／＋10000＝自分）でこの規則と完全に一致する。
      //   ⭐DESIGNATE 側の owner は下流の `alignDesignatedZoneOwner` が**この target から**揃えるので
      //     2つが食い違うことはない（片方だけ直すと読み手と保存先がズレて空振りする）。
      target = {
        type: 'SIGNI', owner: delta < 0 ? 'opponent' : 'self', count: 'ALL',
        filter: { cardType: 'シグニ' }, zoneSource: 'designated',
      };
    } else if (t.match(/このシグニの隣にある.*?シグニのパワーを/)) {
      // 「このシグニの隣にある[あなたの][＜種族＞/《ディソナアイコン》]の?シグニのパワーを±N」＝
      // **効果元の左右のシグニゾーン（`zi±1`）だけ**（`WXDi-P04-050-E2`／`WXDi-P00-053-E1`＝live 母集団2件）。
      // 🔴これが無いと下の「あなたの…シグニのパワーを」既定枝へ落ちて `owner:'self'/count:'ALL'`＝
      //   **自分の全シグニ（自分自身を含む）**に効く過剰実装だった（§3 (cxxxvii)・`V-73` 実機検証で発見）。
      // 消費地点は `calcFieldPowers` の CONTINUOUS `POWER_MODIFY`（`TargetFilter.adjacentToSelf`）。
      const adjNounM = t.match(/このシグニの隣にある(?:あなたの)?((?:《ディソナアイコン》の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)シグニのパワーを/);
      const adjMods = adjNounM?.[1] ?? '';
      const adjFilter: TargetFilter = {
        cardType: 'シグニ', adjacentToSelf: true,
        ...parseColorFilter(adjMods), ...parseStoryFilter(adjMods),
      };
      if (adjMods.includes('《ディソナアイコン》')) adjFilter.isDisona = true;
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: adjFilter };
    } else if (t.match(/あなたの中央のシグニゾーンにある.*?シグニのパワーを/)) {
      // 「あなたの中央のシグニゾーンにある[＜種族＞/《ディソナアイコン》]の?シグニのパワーを±N」＝中央ゾーン(index1)の該当シグニ全体。
      // engine matchesStateFilter（centerZoneOnly=zoneIdx1）・decompiler（「中央ゾーンの」）対応済み。MANUAL 前例 WXDi-P06-034-E2 と同形。
      // 無いと owner:any/count:1 に潰れ「このシグニ自身のみ」へ縮退していた（WXDi-D02-24/WXK01-003/WXK10-079 等）。フィルタは名詞句内から取る。
      const czNounM = t.match(/中央のシグニゾーンにある((?:《ディソナアイコン》の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)シグニのパワーを/);
      const czMods = czNounM?.[1] ?? '';
      const czFilter: TargetFilter = { cardType: 'シグニ', centerZoneOnly: true, ...parseColorFilter(czMods), ...parseStoryFilter(czMods) };
      if (czMods.includes('《ディソナアイコン》')) czFilter.isDisona = true;
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: czFilter };
    } else if (t.match(/対戦相手の中央のシグニゾーンにある.*?シグニのパワーを/)) {
      // 「対戦相手の中央のシグニゾーンにある[＜種族＞等の]シグニのパワーを±N」＝
      // 相手中央ゾーン(index 1)の該当シグニ全体。あなた側だけにあった規則の対戦相手版。
      // ここを落とすと既定の owner:any/count:1 へ倒れ、任意の1体を選ぶ別効果になる。
      const oppCzNounM = t.match(/対戦相手の中央のシグニゾーンにある((?:《ディソナアイコン》の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)シグニのパワーを/);
      const oppCzMods = oppCzNounM?.[1] ?? '';
      const oppCzFilter: TargetFilter = { cardType: 'シグニ', centerZoneOnly: true, ...parseColorFilter(oppCzMods), ...parseStoryFilter(oppCzMods) };
      if (oppCzMods.includes('《ディソナアイコン》')) oppCzFilter.isDisona = true;
      target = { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: oppCzFilter };
    } else if (t.match(/あなたの(左|右)のシグニゾーンにある.*?シグニのパワーを/)) {
      // 「あなたの〔左|右〕のシグニゾーンにある[＜種族＞]の?シグニのパワーを±N」＝側方ゾーン(index 0/2)の該当シグニ全体。
      // ⚠中央版（すぐ上）だけが実装されていて左右が無く、この形は既定 else の `owner:'any'/count:1` へ潰れて
      //   **クラスもゾーンも落ちた**状態だった＝CONTINUOUS では effectEngine が count≠ALL を効果元自身へ解決するので
      //   「右のゾーンの＜怪異＞に＋4000」が**自分に＋4000**になっていた（`WXK10-078-E1`／`WX25-P3-093-E1/E2`）。
      const szNounM = t.match(/(左|右)のシグニゾーンにある((?:《ディソナアイコン》の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)シグニのパワーを/);
      const szMods = szNounM?.[2] ?? '';
      const szFilter: TargetFilter = {
        cardType: 'シグニ',
        zoneSide: szNounM?.[1] === '左' ? 'left' : 'right',
        ...parseColorFilter(szMods), ...parseStoryFilter(szMods),
      };
      if (szMods.includes('《ディソナアイコン》')) szFilter.isDisona = true;
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: szFilter };
    } else if (hasOtherSelfSigniNoun(t) && /シグニのパワーを/.test(t)) {
      target = parseSigniTarget(t, 'self');
      excludeSelf = true;
    } else if (t.match(/あなたのすべてのシグニ/) || t.match(/あなたの(?:他の)?(?:すべての)?(?:レベル[０-９\d]+の|[白赤青緑黒]の|《ディソナアイコン》の|覚醒状態の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)?(?:すべての)?シグニのパワーを/)) {
      // 「あなたの[他の][レベルN|色|＜種族＞|《ディソナアイコン》|覚醒状態]の[すべての]シグニのパワーを±N」＝
      // 該当する自分シグニ全体への持続バフ。「他の」併用時（例:「他の＜天使＞のシグニ」）も拾えるよう独立オプションにする。
      // レベル/ディソナ/覚醒 指定（WX10-061 レベル３・WXDi-P13-047《ディソナアイコン》・WXDi-P08-076 覚醒状態）が
      // 無いと owner:any/count:1 に潰れ「このシグニ自身のみ」へ縮退していた（isDisona=matchesFilter・isAwakened=matchesStateFilter で engine 対応済み）。
      // ⚠level/ディソナ/覚醒 は**対象の名詞句内**からのみ取る（全文スキャンだと「レベル３の場合、…あなたのすべてのシグニ+3000」＝
      //   SPDi43-31 の条件節フィルタを対象へ誤付与する。全文スキャン禁止の教訓）。色/種族は既存挙動を踏襲。
      // ⚠**「すべての」は修飾語の前にも来る**（続き377e）＝「あなたの**すべての**＜地獣＞のシグニのパワーを＋3000」。
      //   旧実装は `(?:すべての)?` を修飾語群の**後ろ**にしか置いておらず、この語順だと分岐条件ごと外れて
      //   既定の `{SIGNI, owner:'any', count:1}` へ潰れていた＝**味方全体バフが「どちらかのシグニ1体」**に化け、
      //   相手のシグニにも撃てる状態だった（`WX24-P1-073-E1`／`WX25-P2-064-E1`／`WX25-CP1-072-E1`／
      //   `WX26-CP1-063-E1`／`WXDi-D02-24-E2`／`WX14-CB04-E1`／`WXK05-060-E2`）。
      const selfBuffNounM = t.match(/あなたの(?:他の)?(?:すべての)?((?:レベル[０-９\d]+(?:以上|以下)?の|[白赤青緑黒]の|《ディソナアイコン》の|覚醒状態の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)(?:すべての)?シグニのパワーを/);
      const nounMods = selfBuffNounM?.[1] ?? '';
      const selfBuffState: Partial<TargetFilter> = {};
      if (nounMods.includes('《ディソナアイコン》')) selfBuffState.isDisona = true;
      if (nounMods.includes('覚醒状態')) selfBuffState.isAwakened = true;
      // 「《プリパラアイドル　真中らぁら》以外のあなたの＜プリパラ＞のシグニのパワーを＋2000」（`WXDi-P10-033-E1`）＝
      // 除外が落ちて**自分自身までバフされる過剰効果**だった（§5d パターンA・続き371）。
      target = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', ...parseLevelFilter(nounMods), ...selfBuffState, ...parseColorFilter(t), ...parseStoryFilter(t), ...parseExcludeCardNameFilter(t) } };
      if (/あなたの他の/.test(t)) excludeSelf = true;
    } else if (t.match(/対戦相手のすべてのシグニ/) ||
               t.match(/(?:感染状態の)?対戦相手のシグニすべて/) ||
               t.match(/対戦相手の(?:他の)?(?:[白赤青緑黒]の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の|感染状態の)?(?:すべての)?シグニのパワーを/)) {
      target = { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', ...parseColorFilter(t), ...parseStoryFilter(t), ...(t.includes('感染状態') ? { infected: true } : {}) } };
      if (/対戦相手の他の/.test(t)) excludeSelf = true;
    } else if (t.match(/対戦相手の(?:(?:[白赤青緑黒])(?:か|または)(?:[白赤青緑黒])の|感染状態の|アップ状態の|ダウン状態の|凍結状態の)?シグニ([０-９\d]+)体/) || t.match(/対戦相手の感染状態のシグニ/)) {
      // 状態接頭辞（アップ/ダウン/凍結状態の）は parseSigniTarget が isUp/isDown/isFrozen として抽出する
      target = parseSigniTarget(t, 'opponent');
    } else if (t.match(/あなたの(?:感染状態の|アップ状態の|ダウン状態の|凍結状態の)?(?:(?:＜[^＞]+＞[とか])*＜[^＞]+＞の|[白赤青緑黒]の|レベル[０-９\d]+(?:以上|以下)?の)?シグニ([０-９\d]+)体/)) {
      // 「あなたの[＜種族＞/色/レベル]のシグニN体を対象とし…それのパワー±N」＝自分の単体シグニへの持続バフ。
      // ＜種族＞/色/レベル 接頭辞が無いと owner:any（下の else）へ潰れ story/color フィルタが脱落していた（WX10-013 水獣・WX11-046 空獣か地獣）。
      // フィルタは parseSigniTarget が名詞句から story/color/level を取る。「あなたのすべての…シグニのパワーを」全体バフは上の分岐が先取り済み。
      target = parseSigniTarget(t, 'self');
    } else if (t.match(/このシグニ/)) {
      // 「このシグニのパワーを±N」= 効果元シグニ自身（任意選択でなく thisCardOnly）。
      // 自分の場のシグニから1体選ばせるのではなく、効果元（sourceCardNum）に固定する（G085）。
      target = { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } };
    } else if (t.match(/^それのパワーを/) || t.match(/^それはパワーが/)) {
      // 「それ」= トリガー元シグニ（ON_ATTACK_SIGNI等で発火したシグニ自身）
      target = { type: 'SIGNI', owner: 'self', count: 1 };
      isTriggerSource = true;
    } else if (/あなたの他の[^。、]*シグニのうち最も[^。、]*を対象とし/.test(t)) {
      // 「あなたの他の＜X＞のシグニのうち最も…シグニ1体を対象とし…それのパワーを±N」＝自分の単体シグニ
      // （WXDi-CP02-070。else 既定だと owner:any＋story/excludeSelf/superlative 欠落に潰れていた）。narrow に超上級句のみ。
      target = parseSigniTarget(t, 'self');
    } else {
      target = { type: 'SIGNI', owner: 'any', count: 1 };
    }
    const pmAction: PowerModifyAction = { type: 'POWER_MODIFY', target, delta };
    if (isTriggerSource) pmAction.targetsTriggerSource = true;
    if (excludeSelf) pmAction.excludeSelf = true;
    const nextOpponentTurn = t.includes('次の対戦相手のターンの間');
    const nextGlobalTurn = !nextOpponentTurn && t.includes('次のターンの間');
    if (nextOpponentTurn || nextGlobalTurn) {
      pmAction.duration = 'NEXT_TURN';
      pmAction.nextTurnOwner = nextOpponentTurn ? 'opponent' : 'next';
      if (t.includes('このターンと次のターンの間')) pmAction.appliesThisTurn = true;
    }
    return pmAction;
  }

  // ---- パワーセット（基本パワーはNになる / それの基本パワーをNにする）----
  const powerSetM = t.match(/(?:基本)?パワーは([０-９\d]+)になる/)
                 ?? t.match(/(?:基本)?パワーを([０-９\d]+)にする/);
  if (powerSetM) {
    const collectiveColor = t.match(/あなたの([白青赤緑黒])のシグニの(?:基本)?パワーを/);
    if (collectiveColor) {
      return {
        type: 'POWER_SET',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', color: collectiveColor[1] } },
        value: parseNum(powerSetM[1]),
      };
    }
    const owner: Owner = signiClauseOwner(t);
    const cM = t.match(/シグニ([０-９\d]+)体/);
    const count = cM ? parseNum(cM[1]) : 1;
    const target: EffectTarget = t.includes('このシグニ')
      ? { type: 'SIGNI', owner: 'self', count: 1 }
      : { type: 'SIGNI', owner, count };
    return { type: 'POWER_SET', target, value: parseNum(powerSetM[1]) };
  }

  // ---- ダウンし凍結（複合）----
  // 「それら（＝選んだ同一対象）をダウンし凍結」。FREEZE(down:true) で同一対象にダウン＆凍結を適用
  // （SEQUENCE[DOWN, FREEZE] だと選択対象が別々になりうるため単一アクションにする）。
  if (t.includes('ダウンし凍結')) {
    const owner: Owner = signiClauseOwner(t);
    // 「すべてのルリグとシグニ」＝センター＋左右アシスト＋全シグニ。count:ALL を複合対象の
    // executor 分岐へ渡す（従来は parseSigniTarget に落ち、相手シグニ1体だけになっていた）。
    if (/すべてのルリグとシグニをダウンし凍結/.test(t)) {
      return { type: 'FREEZE', target: { type: 'CENTER_LRIG_OR_SIGNI', owner, count: 'ALL' }, down: true };
    }
    const signiTgt = parseSigniTarget(t, owner);
    return { type: 'FREEZE', target: signiTgt, down: true };
  }

  // ---- ダウン ----
  // ⚠「それをダウン状態で場に出す」（WX14-029＝エナから down 配置）は /をダウン/ に誤マッチして
  //   DOWN に潰れていた＝ADD_TO_FIELD asDown（下のエナ/手札ビルダ）の領分なので除外。
  if ((t.includes('ダウンする') || t.match(/をダウン/)) && !t.includes('ダウン状態で場に出')) {
    // 「（アップ状態の）このシグニをダウン」＝効果元自身。全文から owner/story/power を拾うと、
    // 前置きの誘発主語や別対象の修飾がこの対象へ誤付着する（段2 第10バッチ）。
    // 対象が2つある「それとこのシグニ」はこの単一対象規則では先取りしない。
    const downThisM = t.match(/(アップ状態の)?このシグニをダウン(?:する|してもよい)/);
    if (downThisM && !t.includes('それとこのシグニ')) {
      return {
        type: 'DOWN',
        target: {
          type: 'SIGNI', owner: 'self', count: 1,
          filter: { cardType: 'シグニ', ...(downThisM[1] ? { isUp: true } : {}), thisCardOnly: true },
        },
        ...(t.includes('ダウンしてもよい') ? { optional: true } : {}),
      };
    }
    // 「（この／）シグニ／カードの正面のシグニ」＝正面は定義上**対戦相手のゾーン**（WDA-F02-17-E2「このシグニの
    //   正面のシグニ１体を対象とし、それをダウンする」）。従来 fallback で owner:'self'＝自分のシグニをダウンに化けていた。
    const isFrontOfSelf = /(?:この)?(?:シグニ|カード)の正面の[^、。]*シグニ/.test(t);
    const owner: Owner = isFrontOfSelf ? 'opponent' : signiClauseOwner(t);
    // 「ダウンしてもよい」＝任意（player が実行するか選べる）。「そうした場合」の did-it ゲートと組で使われ、
    //   optional を落とすと engine が強制ダウンさせてしまう（curated が持つ optional:true を復元＝§3 タスク12(vii)系）。
    const downOptional = t.includes('ダウンしてもよい');
    // 「（センター）ルリグ**か**シグニN体」「ルリグ**と**シグニを合計N体まで」→ OR選択（CENTER_LRIG_OR_SIGNI）。
    // ⚠「センター」が付かない表記（WX25-CP1-028①「対戦相手のルリグかシグニ1体を対象とし、それをダウンする」）は
    //   下の分岐に入らず **シグニ限定**に潰れていた（§3 Opusタスク10 パターンB の同根）。
    {
      const lsM = t.match(/(?:センター)?ルリグ(?:か|または)[^。]{0,6}シグニ(?:を?([０-９\d]+)体(まで)?)?/)
               ?? t.match(/(?:センター)?ルリグと[^。]{0,6}シグニを合計([０-９\d]+)体(まで)?/);
      if (lsM && !t.includes('すべて')) {
        return { type: 'DOWN', target: {
          type: 'CENTER_LRIG_OR_SIGNI', owner,
          count: lsM[1] ? parseNum(lsM[1]) : 1,
          ...(lsM[2] ? { upToCount: true } : {}),
        }, ...(downOptional ? { optional: true } : {}) };
      }
    }
    if (t.includes('センタールリグ') && t.includes('シグニ')) {
      // 「センタールリグとすべてのシグニをダウン」のような複合ダウン（AND）
      const signiTgt = parseSigniTarget(t, owner);
      return { type: 'SEQUENCE', steps: [
        { type: 'DOWN', target: { type: 'LRIG', owner, count: 1 }, ...(downOptional ? { optional: true } : {}) },
        { type: 'DOWN', target: signiTgt, ...(downOptional ? { optional: true } : {}) },
      ]};
    }
    // ⚠「センター」無しの素の「対戦相手のルリグ1体を対象とし、それをダウンする」（WX25-P3-085-BURST 等）も
    //   従来 fallback で **シグニダウン** に化けていた。engine の 'LRIG' はセンタールリグ固定＝同じ受け皿へ寄せる
    //   （すぐ下の FREEZE 規則と同型・§3 タスク1(d)）。「ルリグ1体を対象」を必須にしてカウント句「ルリグ1体につき」
    //   等の誤検出を避け、「センタールリグではない」＝アシスト対象は受け皿が無く据置（§6.3）。
    // 「（あなたの）アップ状態の（レベルNの）ルリグN体をダウン（してもよい）」＝**対象指定を伴わない**ルリグダウン。
    // 従来は上の規則が「ルリグ1体を**対象**」を必須にしていたため下の parseSigniTarget へ落ち、**シグニをダウン**
    // する効果に化けていた（WX24-P1-040 の2効果／WXDi-D03-004／WXDi-D04-004＝タスク12(cix)）。
    // ⚠ engine の 'LRIG' はセンター固定だが、原文の「アップ状態のルリグ」はアシストルリグも含む。**filter.isUp を
    //   刻む**とコスト支払いと同じ payLrigDownCost 経路（センター→アシストL→R・level 条件つき）へ乗り、
    //   「この方法でダウンしたルリグ」の記録も入る。「アシストルリグ」限定形（WX24-P3-043）は受け皿が無く据置。
    {
      // 「アップ状態のルリグを**好きな数**ダウンする」（WX25-P2-114）＝0..N の枚数選択。engine は count:'ALL'
      // を枚数 CHOOSE として解決する（可変コストと同じ形）。
      {
        const anyCountM = t.match(/(?:(あなた|対戦相手)の)?アップ状態の(?:レベル([０-９\d]+)の)?ルリグを好きな数ダウン/);
        if (anyCountM && !t.includes('シグニ')) {
          const lvlAny = anyCountM[2] ? parseNum(anyCountM[2]) : undefined;
          return { type: 'DOWN', target: {
            type: 'LRIG', owner: anyCountM[1] === '対戦相手' ? 'opponent' : 'self', count: 'ALL', upToCount: true,
            filter: { isUp: true, ...(lvlAny !== undefined ? { level: lvlAny } : {}) },
          }, ...(downOptional ? { optional: true } : {}) };
        }
      }
      const upLrigM = t.match(/(?:(あなた|対戦相手)の)?アップ状態の(?:レベル([０-９\d]+)の)?ルリグ([０-９\d]+)体をダウン/);
      if (upLrigM && !t.includes('シグニ')) {
        // ⚠ owner は**名詞句直前の所有者表記**から取る。文中の他の句（「対戦相手にダメージが与えられていなかった
        //   場合」＝WXDi-D04-004）を signiClauseOwner が拾って owner:'opponent' に化ける。
        const lrigOwner: Owner = upLrigM[1] === '対戦相手' ? 'opponent' : 'self';
        const lvl = upLrigM[2] ? parseNum(upLrigM[2]) : undefined;
        return { type: 'DOWN', target: {
          type: 'LRIG', owner: lrigOwner, count: parseNum(upLrigM[3]),
          filter: { isUp: true, ...(lvl !== undefined ? { level: lvl } : {}) },
        }, ...(downOptional ? { optional: true } : {}) };
      }
    }
    if ((t.includes('センタールリグ') || /ルリグ[１1]体を対象/.test(t)) && !t.includes('センタールリグではない')) {
      return { type: 'DOWN', target: { type: 'LRIG', owner, count: 1 }, ...(downOptional ? { optional: true } : {}) };
    }
    const downTgt = parseSigniTarget(t, owner);
    // 「正面のシグニ」＝効果元シグニの正面（相手ゾーン 2-zi）に限定＝engine の execDown が frontOfSelf を解決。
    if (isFrontOfSelf) downTgt.filter = { ...(downTgt.filter ?? {}), frontOfSelf: true };
    return { type: 'DOWN', target: downTgt, ...(downOptional ? { optional: true } : {}) };
  }

  // ---- 凍結 ----
  if (t.includes('凍結する')) {
    const owner: Owner = signiClauseOwner(t);
    // ⚠ルリグ対象を見ておらず、「対戦相手のセンタールリグ1体を対象とし、それを凍結する」（WX17-020③）が
    //   **シグニの凍結**に化けていた（§3 Opusタスク10 パターンB）。すぐ上の DOWN 規則と同じ3分岐に揃える。
    // ⚠さらに「センター」無しの素の「対戦相手のルリグ1体を対象とし、それを凍結する」（WX25-CP1-016 等・
    //   §3 タスク12(xxix)(b) semantic audit クラスタ「対戦相手のルリグ1体」11件のうち凍結系）も
    //   fallback で **シグニ凍結** に化けていた。engine の 'LRIG' はセンタールリグ固定なので同じ受け皿へ寄せる。
    //   「ルリグ1体につき」等のカウント句／使用条件の「ルリグ」を誤って拾わないよう、対象化を表す
    //   「ルリグ1体を対象」を必須にする。「センタールリグではない」＝アシスト対象は受け皿が無く据置（§6.3）。
    // 「ルリグ1体とシグニ1体を対象とし、それらを凍結する」＝両方凍結（と で明示的に併記されたときだけ）。
    const lrigAndSigniFZ = /(?:センター)?ルリグ[１1]体と(?:対戦相手の)?シグニ[１1]体を対象/.test(t);
    const lrigTargetFZ = (t.includes('センタールリグ') || /ルリグ[１1]体を対象/.test(t) || lrigAndSigniFZ)
      && !t.includes('センタールリグではない');
    if (lrigTargetFZ && (t.match(/(?:センター)?ルリグか.*シグニ|(?:センター)?ルリグまたは.*シグニ/) || lrigAndSigniFZ)) {
      if (t.match(/(?:センター)?ルリグか.*シグニ|(?:センター)?ルリグまたは.*シグニ/)) {
        return { type: 'FREEZE', target: { type: 'CENTER_LRIG_OR_SIGNI', owner, count: 1 } };
      }
      return { type: 'SEQUENCE', steps: [
        { type: 'FREEZE', target: { type: 'LRIG', owner, count: 1 } },
        { type: 'FREEZE', target: parseSigniTarget(t, owner) },
      ]};
    }
    if (lrigTargetFZ) {
      return { type: 'FREEZE', target: { type: 'LRIG', owner, count: 1 } };
    }
    return { type: 'FREEZE', target: parseSigniTarget(t, owner) };
  }

  // ---- アップ ----
  if (t.includes('アップする') || t.match(/をアップ/)) {
    // 「あなたの[すべての][他の][レベル/色/＜種族＞/ディソナ]の(すべての)?シグニをアップする」＝該当する自分シグニ全体。
    // 「すべての＜迷宮＞のシグニ」（すべてが種族の前）も拾えるよう すべての を種族の前後どちらでも許容。
    // 種族フィルタ付き（WX11-038/WX05-036/WXEX1-14）が従来 count:1/filter無し に潰れ「1体だけアップ」へ縮退していた。
    // ⚠フィルタは**対象名詞句内**からのみ取る（全文スキャン禁止）。engine の execUp は count:ALL+filter を完全対応。
    // 「カード名に《X》を含む」（続き377 追加）＝`WX20-068-E2` が upMods に載らず filter 無しへ落ち、
    //   **自分の全シグニをアップ**する過剰効果だった（原文は《シュレデ》名を含むシグニだけ）。
    const upGroupM = t.match(/あなたの(?:すべての)?(?:他の)?((?:レベル[０-９\d]+(?:以上|以下)?の|[白赤青緑黒]の|《ディソナアイコン》の|カード名に《[^》]+》を含む|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)(?:すべての)?シグニ[をが]アップ/);
    if (t.includes('すべてのシグニをアップ') || t.match(/あなたのシグニ[をが]アップ/) || (upGroupM && upGroupM[1])) {
      const upMods = upGroupM?.[1] ?? '';
      const upFilter: TargetFilter = { ...parseLevelFilter(upMods), ...parseColorFilter(upMods), ...parseStoryFilter(upMods) };
      if (upMods.includes('《ディソナアイコン》')) upFilter.isDisona = true;
      const upNameM = upMods.match(/カード名に《([^》]+)》を含む/);
      if (upNameM) upFilter.cardName = upNameM[1];
      return { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 'ALL', ...(Object.keys(upFilter).length ? { filter: upFilter } : {}) } };
    }
    // 「このシグニをアップする」＝効果元自身（thisCardOnly）。
    if (t.includes('このシグニ')) {
      return { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } };
    }
    // 「そのアタックしているシグニをアップする」＝トリガー節の主語（「あなたのシグニが」＝any_ally scope）が指す
    // 実際のバトルアタッカーへの照応（能力ホスト自身とは限らないため thisCardOnly ではなく専用フラグ。WX17-032）。
    if (t.includes('そのアタックしているシグニ')) {
      return { type: 'UP', target: { type: 'SIGNI', owner: 'self', count: 1 }, targetsBattleAttacker: true };
    }
    // 「それとこのルリグをアップする」＝対象シグニ＋このルリグの両方をアップ（WXEX2-01）
    if (t.match(/それと(この|あなたの(?:センター)?)ルリグ[をが]アップ(する|し)/)) {
      return { type: 'SEQUENCE', steps: [
        { type: 'UP', target: parseSigniTarget(t, signiClauseOwner(t)) },
        { type: 'UP', target: { type: 'LRIG', owner: 'self', count: 1 } },
      ] };
    }
    // 「このルリグ/あなたの（センター/すべての）ルリグをアップする」＝ルリグアップ（WX19-014/WX10-009 等）。
    // する/し 必須＝「ルリグがアップ状態の場合」等の状態参照には不マッチ
    // 🆕**「その」＝トリガー節の「あなたのルリグ１体がアタックしたとき」への照応**（§3 (cxxviii)・続き475d）。
    //   従来これが無く、下の裸 SIGNI フォールバックへ落ちて **`UP{SIGNI}`＝シグニをアップ**に化けていた
    //   （実測9効果。原文「そのルリグをアップし」）。⚠**live 全9件とも効果主自身のルリグ**を指す
    //   （相手のルリグを指す用例は0件＝原文照合済み）ので owner:'self' で正しい。
    {
      const upLrigM = t.match(/(この|その(?:センター)?|あなたの(?:センター)?|あなたのすべての)ルリグ[をが]アップ(する|し)/);
      if (upLrigM) {
        // 「あなたの**すべての**ルリグをアップする」（続き634・`WX25-P2-048-E1`）＝センターだけでなく
        // アシストルリグも起こす。⚠**`count:'ALL'` を消費するのは `execUp` の LRIG 分岐**（そこで
        // `assist_lrig_l_down` / `assist_lrig_r_down` も倒す）。片方だけ直すと JSON だけ変わって挙動は同じ。
        const allLrig = upLrigM[1] === 'あなたのすべての';
        return { type: 'UP', target: { type: 'LRIG', owner: 'self', count: allLrig ? 'ALL' : 1 } };
      }
    }
    if (hasOtherSelfSigniNoun(t)) return { type: 'UP', target: parseSigniTarget(t, 'self') };
    // ⚠**「他の」ゲートの穴**（続き377・(i)配線ギャップ 第6バッチ）＝従来はここが `count:1`・filter 無しの裸の
    //   SIGNI へ落ちており、「あなたの＜アーム＞のシグニ１体を対象とし、それをアップする」のように**「他の」が無い**形で
    //   **クラス/カード名の限定が丸ごと落ちて**いた＝**自分のどのシグニでもアップできる過剰効果**
    //   （`WX14-051-E1` ＜アーム＞／`WXDi-P00-044-E1` ＜バーチャル＞／`WXK09-078-E1` ＜電機＞／
    //    `WXEX1-60-E1` カード名に《フレイスロ》を含む）。ON_ATTACK_SIGNI 主語・`parseSigniTarget` の isDisona と同型で、
    //   **「他の」の有無ではなく対象名詞句かどうかで判定する**のが正しい。
    //   ⚠`parseSigniTarget(文全体)` へ寄せるとトリガー節・条件節のクラスを引き込む（続き376d のトラップ(a)）ので、
    //     **対象名詞句 span**（読点/鉤括弧/コロンまで）を切って `extractNounPhraseFilter` で合成する。
    const upSpanM = t.match(/([^。、：「」]*?)シグニ(?:を)?([０-９\d]+)体(?:まで)?を対象とし/);
    const upFilter: TargetFilter = { cardType: 'シグニ', ...(upSpanM ? extractNounPhraseFilter(upSpanM[1]) : {}) };
    if (upSpanM && upSpanM[1].includes('他の')) upFilter.excludeSelf = true;
    return { type: 'UP', target: {
      type: 'SIGNI', owner: signiClauseOwner(t), count: upSpanM ? parseNum(upSpanM[2]) : 1,
      ...(Object.keys(upFilter).length > 1 ? { filter: upFilter } : {}),
    } };
  }

  // ---- デッキ上 → エナゾーン ----
  // 「場のシグニ1体につき…エナゾーンに置く」は動的回数（part3 の
  // ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT）に委譲する。汎用版が先取りすると固定枚数に潰れる。
  // ⚠「デッキの上からN枚公開し、**その中から**〜をエナゾーンに置く」は公開札からの**ピック**であって
  //   デッキトップN枚の一括エナチャージではない。ここで潰すと非対象の公開札までエナへ送る過剰実行になる
  //   （WX13-054＝「宣言したカード」だけのはずがデッキ上4枚すべてエナ。タスク12(xlvi)(c)）。
  //   pick 記述子が忠実に解ける文だけ譲る（解けない形は従来どおりこの規則が受ける＝取りこぼしを増やさない）。
  const isFusedLookPick = !!fusedLookPickSentence(t);
  if (!t.includes('体につき') && !isFusedLookPick &&
      ((t.includes('デッキの一番上のカードをエナゾーンに置')) ||
       (t.includes('デッキの上からカードを') && t.includes('エナゾーンに置')))) {
    const cM = t.match(/カードを([０-９\d]+)枚/);
    // ⚠主語が「**対戦相手は**デッキの一番上のカードをエナゾーンに置く」（WX14-011②）でも owner:'self' に
    //   固定していたため、**相手を回復させる効果が自分のエナ加速に化けていた**（§3 Opusタスク10 パターンE）。
    const ecOwner: Owner = /対戦相手は[^。]*エナゾーンに置/.test(t) ? 'opponent' : 'self';
    return { type: 'ENERGY_CHARGE_FROM_DECK', owner: ecOwner, count: cM ? parseNum(cM[1]) : 1 };
  }

  // ---- トラッシュ → 手札 ----
  if (t.includes('トラッシュから') && t.includes('手札に加える')) {
    const useBatch2FilterComposition = !!cardNum && TTH_FILTER_BATCH2_WAVE1_CARDS.has(cardNum);
    // story / level は「トラッシュから…手札に加える」の名詞句スパン内に限定
    // （前置きの条件クラス・level を拾わない。WX22-002 偽陽性回避／WD19-008・WX18-082 の閾値脱落是正）。
    const trashSpan = t.match(/トラッシュから(.*?)手札に加える/s);
    const spanTxt = trashSpan ? trashSpan[1] : '';
    // 「対象とし」より後ろの成立条件 level（WX16-036）や、複数対象の別 level（WX19-027 等）を
    // 単一 filter に混入させない。OR と「代わりに」も既存 DSL では正確に表せないため level 昇格しない。
    const trashTargetPhrase = spanTxt.split('対象とし', 1)[0];
    const targetLevelMentions = [...trashTargetPhrase.matchAll(/レベル[０-９\d]+(?:以上|以下)?/g)];
    const targetLevelSpecs = new Set(targetLevelMentions.map(m => m[0]));
    const hasLevelOr = /(?:か|または)(?:レベル|＜|[白赤青緑黒無]の)/.test(trashTargetPhrase)
      || /レベル[０-９\d]+(?:以上|以下)?の?か/.test(trashTargetPhrase);
    // WX13-006B はチェックゾーン条件を choice 外へ保持する別機構待ち。choice 断片だけを改善して
    // 不完全な fresh を採用しない（同文型 WX17-030 もこのバッチでは据置）。
    const isDeferredCheckZoneFamily = /レベル[３3]以下の＜凶蟲＞のシグニを?[２2]枚まで/.test(trashTargetPhrase);
    // 同じ範囲の反復（「レベル2以下の＜天使＞とレベル2以下の＜古代兵器＞」）は共通 filter として安全。
    const levelFilter = targetLevelSpecs.size === 1 && !hasLevelOr && !isDeferredCheckZoneFamily && !t.includes('代わりに')
      ? parseLevelFilter(trashTargetPhrase)
      : {};
    // 異なる名詞句を列挙する形は、各色の枚数制約を保つため選択を分割する。
    if (useBatch2FilterComposition && /無色のシグニ[１1]枚と無色ではないシグニ[１1]枚/.test(trashTargetPhrase)) {
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', color: '無' } } },
          { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ', nonColorless: true } } },
        ],
      };
    }
    const pairM = useBatch2FilterComposition ? trashTargetPhrase.match(/([白赤青緑黒]|無色ではない|無色)の(カード|シグニ|スペル)([０-９\d]+)枚と([白赤青緑黒]|無色ではない|無色)の\2([０-９\d]+)枚/) : null;
    if (pairM) {
      const makePairFilter = (colorText: string): TargetFilter => ({
        ...(pairM[2] === 'カード' ? {} : { cardType: pairM[2] as TargetFilter['cardType'] }),
        ...(colorText === '無色ではない' ? { nonColorless: true } : { color: colorText === '無色' ? '無' : colorText }),
      });
      return {
        type: 'SEQUENCE',
        steps: [
          { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: parseNum(pairM[3]), filter: makePairFilter(pairM[1]) } },
          { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: parseNum(pairM[5]), filter: makePairFilter(pairM[4]) } },
        ],
      };
    }
    if (useBatch2FilterComposition && /白と黒と無色のシグニをそれぞれ[１1]枚まで/.test(trashTargetPhrase)) {
      return {
        type: 'SEQUENCE',
        steps: ['白', '黒', '無'].map(color => ({
          type: 'TRANSFER_TO_HAND' as const,
          source: { type: 'TRASH_CARD' as const, owner: 'self' as const, count: 1, upToCount: true, filter: { cardType: 'シグニ', color } },
        })),
      };
    }

    const extracted = extractNounPhraseFilter(spanTxt, { levelText: trashTargetPhrase });
    const filter: TargetFilter = {
      ...parseCardTypeFilter(t), ...parseCostTotalFilter(t), ...levelFilter, ...parseStoryFilter(spanTxt),
      ...parseColorMatchesLrig(t), ...parseGuardFilter(spanTxt), ...parseIconFilter(spanTxt),
      ...signiClauseDisonaFilter(trashTargetPhrase),
    };
    // 既存入口の挙動は保ったまま、今回追加した合成語彙だけを共通抽出器から配線する。
    const spanColors = [...new Set([...spanTxt.matchAll(/([白赤青緑黒])(?=[のか])/g)].map(m => m[1]))];
    if (spanColors.length === 1 && spanTxt.includes(`${spanColors[0]}の`)) filter.color = spanColors[0];
    if (Array.isArray(extracted.color)) filter.color = extracted.color;
    // 「《カード名》以外の〜」（§5d パターンA・続き371）。旧実装は ＜龍獣＞1枚のためだけの narrow regex で、
    // 同型の10効果（`WX16-025-E3`／`WX18-081-E2`／`WXK07-081-E2` 等）が**自分自身も回収できる過剰効果**だった。
    Object.assign(filter, parseExcludeCardNameFilter(trashTargetPhrase));
    // 「そのシグニと同じレベルの」＝**トリガー元シグニ基準**の動的等値（§5d パターンA・続き373）。
    // `levelEqTrigger` は型にも engine（`resolveDynamicFilter` の triggeringCardNum 経路／
    // `resolveLeaveFieldDynamicFilters`）にも実装済みで、トラッシュ→**場** の入口では既に配線されていたのに
    // トラッシュ→**手札** では呼ばれておらず、**どのレベルのシグニでも回収できる過剰効果**だった
    // （`WXEX2-06-E2`／`WXEX2-78-E1`）。⚠`parseTriggerComparison` は先頭で「その後」を見て
    //   lastProcessed 文脈（別機構＝`WX22-024-BURST`）を自分で外すので、そちらを横取りしない。
    //   ⚠したがって**文全体 `t` を渡す**（名詞句だけだと「その後」を見失い lastProcessed を横取りする）。
    Object.assign(filter, parseTriggerComparison(t, { allowLevelEq: true }));
    if (useBatch2FilterComposition) {
      if (extracted.color === '無') filter.color = extracted.color;
      if (extracted.cardName) filter.cardName = extracted.cardName;
      if (extracted.excludeCardName) filter.excludeCardName = extracted.excludeCardName;
      if (extracted.nonColorless) filter.nonColorless = true;
    }
    // 「そのシグニと**共通する色**」は動的参照の語彙がこの入口に無いので、**部分filterだけの採用を禁止**する。
    // ⚠**判定は対象名詞句だけを見る**（続き372 で是正）。旧実装は全文 `t` を見ていたため、
    //   `WXK09-029-BURST`「…無色ではないシグニ1枚を手札に加える。**その後**、…**そのシグニと共通する色を持つ**
    //   スペル1枚を…」で**後続文の語が前文の filter を巻き添えで消していた**（＝無色シグニまで拾える過剰効果に戻る）。
    // ⚠**「そのシグニと同じレベル」はこの禁止から外した**（続き373）＝`levelEqTrigger` を上で配線したので
    //   `WXEX2-06-E2`「そのシグニと同じレベルの**無色ではない**シグニ」は**2系統とも表現できる**ようになった。
    //   部分filter禁止は「片方を表せない」ときの規律であって、表せるようになったら**据置を解く**のが正しい。
    if (/そのシグニと共通する色/.test(trashTargetPhrase)) {
      delete filter.nonColorless;
    }
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const cM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (cM ? parseNum(cM[1]) : 1);
    return { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count, upToCount: !!upToM, filter,
      // 「このシグニ/カードの下にあった〜」＝離場・バニッシュ直前の下カードだけ（`WXK10-054-E1`／`SPK01-02-E2`）。
      ...(isUnderLeftCardPhrase(spanTxt) ? { fromLeftFieldUnder: true } : {}) } };
  }

  // ---- トラッシュ → デッキ（全回収+シャッフル）----
  if ((t.includes('トラッシュ') || t.includes('トラッシュにある')) &&
      (t.includes('デッキに加え') || t.includes('デッキに戻し')) &&
      (t.includes('シャッフル') || t.includes('シャッフルする'))) {
    const all = t.includes('すべて') || t.includes('全て') || t.includes('全部');
    // filter/count は対象名詞句内（デッキに加え/戻し の直前の source zone … デッキに加え の span）だけから
    //   抽出する（前置き条件・後続条件の＜X＞や色を混入させない。エナゾーン→手札ハンドラと同型）。
    //   従来は「すべての(単色)のカード」だけを拾い、story（＜水獣＞/＜武勇＞）・枚数を落としていた
    //   （WXK02-039／WX19-040＝§3 タスク12(xxii)）。
    // ⚠デッキに加える直前の最寄り source zone にアンカーする＝文中に別の「トラッシュから」があっても、実際に
    //   デッキへ移す元が「エナゾーンから」の場合（WX21-028）はこの TRASH_CARD ハンドラが対象名詞句を拾わない
    //   （span 空＝従来出力を保存）。span は zone マーカーを跨がない（負先読み）。
    const zoneM = t.match(/(トラッシュ(?:から|にある)|エナゾーンから)((?:(?!トラッシュ(?:から|にある)|エナゾーンから).)*?)(?:を)?デッキ(?:に加え|に戻し)/s);
    const fromTrash = !!zoneM && zoneM[1].startsWith('トラッシュ');
    const deckSpan = fromTrash ? zoneM![2] : '';
    // ⚠否定＝「＜X＞ではない／以外」の story・「(色)ではない」は positive filter に混ぜない（WX22-006 精元ではない・
    //   WX14-030/WX21-026 無色ではない）。span から否定トークンを除いてから filter を抽出する。名前指定の
    //   「《…》以外」は色/storyフィルタに影響しないためそのまま（WD23-041＝色は正しく残る）。
    const cleanSpan = deckSpan
      .replace(/＜[^＞]+＞(?:ではない|以外)/g, '')
      .replace(/(?:無色|白|赤|青|緑|黒)ではない/g, '');
    const spanStory = parseStoryFilter(cleanSpan);
    const spanColor = parseColorFilter(cleanSpan);
    const spanLevel = parseLevelFilter(cleanSpan);
    const filter: TargetFilter = {
      ...(cleanSpan.includes('シグニ') ? { cardType: 'シグニ' } : {}),
      ...spanStory, ...spanColor, ...spanLevel,
      // 「《ガードアイコン》を持たない〜をデッキに加えてシャッフルする」（続き377b・被覆マトリクス
      //   `noGuard × TRASH_CARD[filter]` miss 7／has 61＝**同じ入口で61件が配線済み**の明確な穴）。
      //   落ちると**ガードを持つシグニまでデッキへ戻せる**過剰効果になる（`WXDi-D05-015-E2` ほか）。
      //   ⚠デッキ圧縮系のカードでは「ガード持ちを残す」ことがデッキ構築上の意味なので、実害は小さくない。
      ...parseGuardFilter(deckSpan), ...parseIconFilter(deckSpan),
      // 「《カード名》以外の〜をデッキに加えて」（§5d パターンA・続き371）＝`WX17-063-E1`／`WXK09-090-E1`／
      //   `WD23-041-EA-E1`。上のコメントどおり名前指定は色/story を汚さないので cleanSpan ではなく deckSpan から取る。
      ...parseExcludeCardNameFilter(deckSpan),
      // 「無色ではない〜をデッキに加えて」（§5d パターンA・続き372）＝上の cleanSpan は positive filter を
      //   汚さないために否定トークンを**捨てて**いたが、`nonColorless` として**拾い直す**のが正しい。
      //   従来は無色シグニもデッキに戻せる過剰効果だった（`WX13-065-E1`／`WX14-030-E1`／`WX15-Re15-E1`／`WX21-026-E3`）。
      ...(/無色ではない/.test(deckSpan) ? { nonColorless: true } : {}),
    };
    // count：「N枚まで」＝upTo／span 内の「N枚」＝明示枚数／すべて＝ALL／無指定＝1。
    const upToM = deckSpan.match(/([０-９\d]+)枚まで/);
    const numM = deckSpan.match(/([０-９\d]+)枚/);
    const count: number | 'ALL' = all ? 'ALL' : (numM ? parseNum(numM[1]) : 1);
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'TRASH_CARD', owner: 'self', count, ...(upToM ? { upToCount: true } : {}), ...(Object.keys(filter).length > 0 ? { filter } : {}) },
      shuffle: true,
    } as TransferToDeckAction;
  }

  // ---- エナゾーン → 手札 ----
  if (t.includes('エナゾーンから') && t.includes('手札に加える')) {
    // filter は対象名詞句内だけから抽出する（前置き条件の＜X＞を混入させない）。
    // engine/decompiler 対応済みの class filter を source に載せる（WXEX2-45-E2）。
    const energySpan = t.match(/エナゾーンから(.*?)手札に加える/s)?.[1] ?? '';
    const filterParts: TargetFilter = {
      ...parseCardTypeFilter(energySpan),
      ...parseStoryFilter(energySpan),
      ...parseColorFilter(energySpan),
      ...signiClauseDisonaFilter(energySpan),
      ...parseColorMatchesLrig(energySpan),
      // 「エナゾーンから《カード名》以外の〜」（§5d パターンA・続き371）＝`WXEX1-34-E3`／`WXK05-027-E1`
      ...parseExcludeCardNameFilter(energySpan),
      // 「エナゾーンから無色ではないシグニ1枚」（§5d パターンA・続き372）＝`WXK07-029-E2`
      ...(/無色ではない/.test(energySpan) ? { nonColorless: true } : {}),
    };
    const filter: TargetFilter | undefined = Object.keys(filterParts).length > 0 ? filterParts : undefined;
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const cM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (cM ? parseNum(cM[1]) : 1);
    return { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count, upToCount: !!upToM, ...(filter ? { filter } : {}) } };
  }

  // ---- デッキ上を見て並び替え ----
  if (t.includes('デッキの上からカードを') && (t.includes('見て') || t.includes('見る')) &&
      (t.includes('デッキの一番上に戻す') || t.includes('デッキの一番下に置き'))) {
    const cM = t.match(/カードを([０-９\d]+)枚見/);
    const toBottom = t.includes('デッキの一番下に置き');
    // 「好きな枚数を一番下に置き、残りを一番上に戻す」＝プレイヤーが振り分けを選ぶ（G168・タスク12(xlvi)(d)）。
    // 従来は position:'bottom' に潰れ**見た全部がデッキ下**へ送られていた。
    const splitLR = isSplitTopBottomReorder(t);
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: cM ? parseNum(cM[1]) : 3,
      private: true,
      reorder: splitLR || t.includes('好きな順番'),
      canTrash: t.includes('トラッシュに置き'),
      destination: { location: 'deck', owner: 'self', position: splitLR ? 'split_top_bottom' : toBottom ? 'bottom' : 'top' },
    };
  }

  // ---- デッキ一番上を見る（1枚確認）----
  if (t.match(/デッキの一番上を見る/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 1, private: true, reorder: false,
      destination: { location: 'deck', owner: 'self', position: 'top' },
    };
  }

  // ---- ライフクロスに加える ----
  // 🔴**出所（どこから）と持ち主（誰のライフ）を必ず読む**（2026-08-24・段2 の `filter.状態 × ADD_TO_LIFE`）＝
  //   旧実装は文頭の「手札を〜」だけを分岐し、**それ以外を無条件で `fromTop:true`（自分のデッキの一番上）**
  //   に落としていた。`LOOK_AND_REORDER` の2値フォールバック（O-53）と同型の穴で、実測21効果が別の盤面を作る：
  //   ・「あなたのトラッシュから【ライフバースト】を持たないカード1枚を対象とし、それをライフクロスに加える」
  //     → 選択UIも出さず**デッキの一番上**をライフへ（狙ったバースト無し札が置けず、次に引く札が消える）
  //   ・「対戦相手はデッキの一番上のカードをライフクロスに加える」→ **自分の**ライフが増える＝符号が逆
  //   ・「デッキの一番下」「あなたのシグニ1体を対象とし」も同じ一番上へ潰れていた。
  //   受け皿（`fromTrash`/`fromField`/`opponentSelects` と `matchesFilter`）は engine に実装済みで、
  //   **parser から合成されていないだけ**だった（PLAN §4.3）。
  if (t.includes('ライフクロスに加える') || t.includes('ライフクロスに置く')) {
    // ライフクロスの持ち主。⚠「あなたのトラッシュから**対戦相手の選んだ**カード1枚を…」の `対戦相手` は
    //   **選択者**であって持ち主ではない＝「対戦相手は／が」と「対戦相手のデッキ・トラッシュ」だけを見る。
    const lifeOwner: Owner = (/対戦相手(?:は|が)[^。]*ライフクロスに加え/.test(t)
      || /対戦相手の(?:デッキ|トラッシュ)[^。]*ライフクロスに加え/.test(t)) ? 'opponent' : 'self';

    // 「（この方法で）トラッシュに置いたシグニ1体につき…ライフクロスに加える」= 直前にトラッシュした枚数（動的）
    const perTrashed = /トラッシュに置いたシグニ[０-９\d]*体?につき/.test(t);
    // ⚠「カードをN枚引き、…ライフクロスに加える」の draw 枚数を誤って拾わない（(?!引)＝直後が「引」＝ドロー句を除外）。
    //   「デッキの一番上のカード」（枚数なし）は count:1 が正（SP24-009＝5枚引き の 5 が漏れて count:5 の過剰だった・続き107）。
    const cM = t.match(/カードを([０-９\d]+)枚(?!引)/) ?? t.match(/([０-９\d]+)枚(?:の手札)?をライフクロス/);
    const count: number | { $ref: 'last_processed_count' } =
      perTrashed ? { $ref: 'last_processed_count' } : (cM ? parseNum(cM[1]) : 1);

    // ---- 出所①：トラッシュ ----
    // ⚠**デッキ由来の文言が同居する文は対象外**（「トラッシュに置き…デッキの一番上のカードを」等）＝
    //   `トラッシュから` は前段の別アクションの出所であってライフの出所ではない。
    const trashM = t.match(/トラッシュから(.*?)(?:を対象とし|をライフクロスに加え)/);
    if (trashM && !/デッキの(?:一番上|一番下|上から)/.test(t)) {
      // 「この方法でトラッシュに置いたシグニ1体**につき**【ライフバースト】を持たないカード1枚」＝
      // ⚠`につき` より前は**枚数の数え方**であって候補の絞り込みではない（`cardType:'シグニ'` を拾うと
      //   原文「カード」より狭い過小実行になる）。最後の `につき` 以降だけを名詞句として読む。
      const np = trashM[1].split('につき').pop() ?? '';
      const filter: TargetFilter = {
        ...parseCardTypeFilter(np),
        ...parseStoryFilter(np),
        ...parseColorFilter(np),
        ...parseLevelFilter(np),
        ...(/【ライフバースト】を持たない/.test(np) ? { hasLifeBurst: false }
          : /【ライフバースト】を持つ/.test(np) ? { hasLifeBurst: true } : {}),
      };
      return {
        type: 'ADD_TO_LIFE', owner: lifeOwner, count, fromTop: false, fromTrash: true,
        ...(Object.keys(filter).length > 0 ? { filter } : {}),
        // 「あなたのトラッシュから**対戦相手の選んだ**カード1枚を」＝選択者だけが相手（`WXK11-026`）。
        ...(/対戦相手の選んだ/.test(np) ? { opponentSelects: true } : {}),
      };
    }

    // ---- 出所②':エナゾーンの自分自身（`WXDi-P08-038`「このシグニをエナゾーンからライフクロスに加える」）----
    // バニッシュでエナへ行った自分自身をライフへ戻す文型＝`ADD_TO_FIELD`／`TRANSFER_TO_HAND` の
    // 「このシグニをエナゾーンから〜」と同じ受け皿（`filter.thisCardOnly` + ENERGY 出所）を使う。
    // ⚠`fromTop` に落とすと**デッキの一番上**が乗り、自分自身はエナに残る＝盤面が別物になる。
    if (/この(?:シグニ|カード)を(?:あなたの)?エナゾーンからライフクロスに加え/.test(t)
        || /エナゾーンからこの(?:シグニ|カード)をライフクロスに加え/.test(t)) {
      return { type: 'ADD_TO_LIFE', owner: lifeOwner, count: 1, fromTop: false, fromEnergy: true,
        filter: { thisCardOnly: true } };
    }

    // ---- 出所②：デッキの一番下（`WXK03-066`）----
    if (/デッキの一番下のカードをライフクロスに加え/.test(t)) {
      return { type: 'ADD_TO_LIFE', owner: lifeOwner, count, fromTop: false, fromBottom: true };
    }

    // ---- 出所③：場のシグニ（`WXK10-020-E3`「あなたのシグニ1体を対象とし、それをライフクロスに加える」）----
    // ⚠加える先は**効果の使用者**のライフ（原文が修飾しないかぎり）＝`manualEffects` の同型注記と同じ規約。
    const fieldM = t.match(/(あなた|対戦相手)の(?:すべての)?シグニ([０-９\d]*)体(?:まで)?を対象とし、それら?をライフクロスに加え/);
    if (fieldM) {
      const fieldOwner: Owner = fieldM[1] === 'あなた' ? 'self' : 'opponent';
      const n = fieldM[2] ? parseNum(fieldM[2]) : 1;
      return {
        type: 'ADD_TO_LIFE', owner: lifeOwner, count: n, fromTop: false, fromField: true,
        target: { type: 'SIGNI', owner: fieldOwner, count: n },
      };
    }

    // 「（あなたの）手札を〜ライフクロスに加える」は手札選択。
    // ⚠旧実装は `^手札` 固定＝「**あなたの**手札を1枚ライフクロスに加える」がデッキ上へ落ちていた。
    if (/手札(?:を|から)[^。]*ライフクロスに加え/.test(t) || /手札[０-９\d]*枚をライフクロスに加え/.test(t)) {
      return { type: 'ADD_TO_LIFE', owner: lifeOwner, count, fromTop: false, fromHand: true };
    }
    return { type: 'ADD_TO_LIFE', owner: lifeOwner, count, fromTop: true };
  }

  // ---- §3タスク6 D: バニッシュの代替コスト（ライフクロスをクラッシュ）----
  // 「（対戦相手のターンの間、）このシグニがバニッシュされる場合、代わりにあなたのライフクロス１枚をクラッシュしてもよい」＝WX14-026-E1。
  // ⚠下の「ライフクロスをクラッシュ」より前に置く（従来はそちらが先に食って CONTINUOUS LIFE_CRASH＝
  //   「常時ライフを割り続ける」幻覚になり、バニッシュ回避（守り）が丸ごと脱落していた）。
  {
    const banishSubstLifeM = t.match(/がバニッシュされる場合、代わりにあなたのライフクロス([０-９\d]+)枚をクラッシュしてもよい/);
    if (banishSubstLifeM) {
      const thisOnly = /このシグニがバニッシュされる場合/.test(t);
      return {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: 1, ...(thisOnly ? { filter: { thisCardOnly: true } } : {}) },
        substituteCost: { lifeCrash: parseNum(banishSubstLifeM[1]) },
        optional: true,
      } as BanishSubstituteAction;
    }
  }

  // 🆕**§5.3 `O-65`（2026-08-25）＝「ライフクロスは〜クラッシュされない／N枚までしかクラッシュされない」＝
  // クラッシュを**防ぐ・制限する**規則。** 下の素朴な `includes('ライフクロス') && includes('クラッシュ')` が
  // これを拾い、**`LIFE_CRASH{owner:'self'}`＝原文と正反対の「自分のライフをクラッシュする」**へ化けていた。
  // 実測5効果＝`WD06-008-E1`／`WD13-010-E1`／`WX19-046-E2`／`WX20-032-E1`／`WXK11-016-E1`。
  // 🔴**【常】の3件は実行経路が無く無害だが、アーツの2件は実害**＝`WD13-010-E1` は
  //   「①このターン、あなたのライフクロスはダメージ以外によってはクラッシュされない」という**守りの選択肢**で
  //   **自分のライフが1枚割れる**（`WDK17-009-E2` の「条件を行動として読む」と同じ根＝`O-65`）。
  // ⚠**「対戦相手」を含むだけで owner を反転させる**のもここの穴＝`WXK11-016-E1`「各プレイヤーの…」は
  //   `対戦相手` を含まないので self になっていた（owner の推定自体が原文を読めていない）。
  // 🆕**§5.3 `O-66`（2026-08-25）＝`DEFERRED_` を実装に置き換えた。** 判定は `engine/lifeCrashGate.ts` の1本。
  // ⚠**ペイロードを落とすと消費側が宣言ごと無視する**（fail-closed）＝「効かない」で済み、
  //   「あらゆるダメージを無効化する」側へは倒れない。原文の軸は3つ：
  //   (a) 全面防止（`WD06-008-E1`／`SP38-002-E1`）(b)「ダメージ以外」限定（`WD13-010-E1`／`WX19-046-E2`）
  //   (c) 1ターンあたりの上限（`WX20-032-E1` の1枚／`WXK11-016-E1` の2枚）
  if (t.includes('ライフクロス') && /クラッシュされな|しかクラッシュされ/.test(t)) {
    // 🔴「各プレイヤーの」＝相手の場のキーに載っていても**自分のライフを守る**（`WXK11-016-E1`）。
    //   ここを self に潰すと「自分が置いたときだけ効く」片側実装になる。
    const protects = /各プレイヤーの[^。]*ライフクロス/.test(t) ? 'each_player' as const : 'self' as const;
    const capM = t.match(/([０-９\d]+)枚までしかクラッシュされ/);
    if (capM) {
      // 回数制限型＝`scope` は消費側が見ない（原文が全面防止と併記されることはない）。
      return {
        type: 'STUB', id: 'LIFE_CRASH_PREVENTION',
        lifeCrashPrevention: { scope: 'ALL', maxPerTurn: parseNum(capM[1]), protects },
      } as StubAction;
    }
    return {
      type: 'STUB', id: 'LIFE_CRASH_PREVENTION',
      lifeCrashPrevention: {
        // ⚠**「ダメージ以外によって（は）」＝効果によるクラッシュだけ防ぐ**。逆に読むと守りが攻撃に化ける（`O-65`）。
        scope: /ダメージ以外/.test(t) ? 'EXCEPT_DAMAGE' as const : 'ALL' as const,
        protects,
        // 「あなたのライフクロスが対戦相手より少ないかぎり」（`SP38-002-E1`）＝クラッシュのたびに再評価する動的条件。
        ...(/ライフクロスが対戦相手より少ないかぎり/.test(t) ? { whileFewerLifeThanOpponent: true } : {}),
      },
    } as StubAction;
  }

  // ---- ライフクロスをクラッシュ ----
  if (t.includes('ライフクロス') && t.includes('クラッシュ')) {
    const op = t.includes('対戦相手');
    const cM = t.match(/([０-９\d]+)枚をクラッシュ/) ?? t.match(/ライフクロス([０-９\d]+)枚/);
    return { type: 'LIFE_CRASH', owner: op ? 'opponent' : 'self', count: cM ? parseNum(cM[1]) : 1, triggerBurst: true };
  }

  // ---- 「（このアタックフェイズの間、）〜が場を離れたとき、〜を場に出す」付与型の遅延トリガー ----
  // 【起】で「**この**アタックフェイズの間」の watcher を設置する形（WX22-001-E3）。
  // ⚠「この」が要る＝【起】を撃った時点から当該アタックフェイズ終了までの設置型。「この」の無い
  //   「アタックフェイズの間、〜が場を離れたとき」は【自】の常時条件（triggerCondition.duringAttackPhase）で、
  //   effectParser の ON_LEAVE_FIELD ブロックがトリガー句を除去して別経路で解く＝此処には来ない（WX21-004-E2）。
  // 監視対象クラス（＜X＞）・離脱側オーナー・配置元ゾーン・レベル比較は**すべて原文から読む**（カード決め打ちにしない）。
  {
    const instM = t.match(/このアタックフェイズの間[、,](あなた|対戦相手)の(?:＜([^＞]+)＞の)?シグニ(?:[０-９\d]+体)?が場を離れたとき[、,]\s*(.+)/s);
    const rest = instM?.[3] ?? '';
    // 配置元ゾーン（手札／トラッシュ／エナ）も原文から。いずれでもなければ従来どおり下の STUB へ落とす。
    const srcType = /手札から/.test(rest) ? 'HAND_CARD'
      : /トラッシュから/.test(rest) ? 'TRASH_CARD'
      : /エナゾーンから/.test(rest) ? 'ENERGY_CARD'
      : undefined;
    if (instM && srcType && /場に出/.test(rest)) {
      const filter: TargetFilter = {
        cardType: 'シグニ',
        ...parseLevelFilter(rest),
        ...parseColorFilter(rest),
        ...parseStoryFilter(rest),
        ...parseNameFilter(rest),
        // 「そのシグニより低いレベル／と同じレベル」＝離脱カード基準の相対比較。
        // 収集時に resolveLeaveFieldDynamicFilters が離脱カードの具体値へ解決する。
        ...parseTriggerComparison(rest, { allowPlacement: true, allowLevelEq: true }),
      };
      const upToM = rest.match(/([０-９\d]+)枚まで/);
      const countM = rest.match(/([０-９\d]+)枚/);
      return {
        type: 'INSTALL_DELAYED_TRIGGER',
        duration: 'THIS_ATTACK_PHASE',
        trigger: {
          timing: 'ON_LEAVE_FIELD',
          leftOwner: instM[1] === '対戦相手' ? 'opponent' : 'self',
          triggerFilter: { cardType: 'シグニ', ...(instM[2] ? { story: instM[2] } : {}) },
        },
        effect: {
          type: 'ADD_TO_FIELD',
          owner: 'self',
          source: {
            type: srcType,
            owner: 'self',
            count: upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1),
            ...(upToM ? { upToCount: true } : {}),
            filter,
          },
          ...(rest.includes('ダウン状態で場に出') ? { asDown: true } : {}),
          ...(rest.includes('場に出してもよい') ? { optional: true } : {}),
        },
      } as InstallDelayedTriggerAction;
    }
  }
  // 即時配置ではなく付与トリガーなので、bare ADD_TO_FIELD（=デッキトップ誤配置）や手札ハンドラの
  // 即時配置を避けて no-op STUB に。忠実実装には「場を離れたとき手札から配置」を期間付きで付与する
  // 機構が必要（WX22-001-E3）。※【自】ON_LEAVE_FIELD はトリガー文が除去済みで此処に来ない。
  if (t.includes('場を離れたとき') && t.includes('場に出す')) {
    return { type: 'STUB', id: 'GRANT_LEAVE_PLACE_PENDING' } as StubAction;
  }

  // ---- クラフトの《X》を場に出す（ゲーム外からトークン生成）----
  // 旧実装は bare ADD_TO_FIELD でデッキトップを出していた（誤り）。
  // cardName を付けて execAddToField のトークン生成パスへ（CardName→CardNum は engine 側で解決）。
  {
    const craftM = t.match(/クラフトの《([^》]+)》(?:[０-９\d一二三四五六七八九]+)?(?:つ|体|枚)?を場に出す/);
    if (craftM) {
      return { type: 'ADD_TO_FIELD', owner: 'self', cardName: craftM[1] };
    }
  }

  // ---- このシグニ/カード自身をエナゾーンから場に出す（自己蘇生）----
  // 「この(シグニ|カード)」＋「エナゾーンから」＋「場に出す/場に出してもよい」＝効果元自身（thisCardOnly）。
  // 🔴この分岐が無かったため、下の汎用「エナゾーンからシグニを場に出す」へ落ちて
  //   `filter:{cardType:'シグニ'}` だけになり、**エナのどのシグニでも出せる過剰実行**だった（実測11効果）。
  //   さらに「場に出して**もよい**」は下の分岐の `includes('場に出す')` に当たらず、source ごと落ちた
  //   bare `ADD_TO_FIELD`＝**デッキの一番上を出す完全な別物**になっていた（`WD14-012-E1`）。
  // ⚠語順は両方ある＝「このシグニをエナゾーンから場に出す」と「エナゾーンからこのシグニを場に出す」。
  // ⚠「このシグニより〜」は自己蘇生でなく比較フィルタ、「そのシグニ」は `targetsTriggerSource` の別分岐。
  // ⚠トラッシュ版（すぐ下の分岐）と同じ規約＝engine は `execAddToField` の ENERGY_CARD 分岐で
  //   `thisCardOnly` を剥がして `ctx.sourceCardNum` に絞る。
  if ((t.includes('このシグニ') || t.includes('このカード')) && t.includes('エナゾーンから')
      && (t.includes('場に出す') || t.includes('場に出してもよい') || t.includes('シグニゾーンに出'))
      && /この(?:シグニ|カード)を|エナゾーンからこの(?:シグニ|カード)/.test(t)
      && !/この(?:シグニ|カード)より/.test(t)
      && !/この(?:シグニ|カード)の下にあった/.test(t)
      && !/【トラップ】/.test(t)) {
    return {
      type: 'ADD_TO_FIELD', owner: 'self',
      source: { type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: false, filter: { thisCardOnly: true } },
      ...(t.includes('ダウン状態で') ? { asDown: true } : {}),
      ...(t.includes('場に出してもよい') ? { optional: true } : {}),
    };
  }

  // ---- エナゾーンからシグニを場に出す ----
  // 旧実装は source 無しの bare ADD_TO_FIELD でデッキトップを出してしまっていた（誤り）。
  // エナから対象を選んで場に出すよう source:ENERGY_CARD＋フィルタ/枚数を付与（トラッシュ版と同形）。
  if (t.includes('エナゾーンから') && t.includes('場に出す')) {
    const filter: TargetFilter = {
      cardType: 'シグニ',
      ...parseLevelFilter(t),
      ...parseColorFilter(t),
      ...parseStoryFilter(t),
      ...parseSelfComparison(t), // 「このシグニよりパワー/レベルの低い」＝効果元基準（WXDi-P03-078）。resolveDynamicFilter が解決
      ...parseTriggerComparison(t, { allowPlacement: true, allowLevelEq: true }), // 「そのシグニと同じレベル」等＝トリガー元基準（WX21-004）
      ...signiClauseDisonaFilter(t),
    };
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const countM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1);
    return { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'ENERGY_CARD', owner: 'self', count, upToCount: !!upToM, filter },
      ...(t.includes('エナゾーンからそのシグニを') ? { targetsTriggerSource: true } : {}),
      ...(t.includes('場に出してもよい') ? { optional: true } : {}),
      ...(t.includes('ダウン状態で場に出') ? { asDown: true } : {}) };
  }

  // ---- このシグニ/カード自身をトラッシュから場に出す（自己蘇生・トラッシュ自己起動）----
  // 「このシグニ/カード」＋「トラッシュから」＋「場に出す/シグニゾーンに出す」＝効果元自身（thisCardOnly）。
  // 任意トラッシュカードを出す汎用版（下の handler）と区別する。
  if ((t.includes('このシグニ') || t.includes('このカード')) && t.includes('トラッシュから')
      && (t.includes('場に出') || t.includes('シグニゾーンに出'))
      && !/このシグニより/.test(t) // 「このシグニより低いレベル/パワー」は自己蘇生でなく比較フィルタ（下の汎用 trash→field へ）
      // 「この**シグニの下にあった**シグニ1枚」＝自分自身ではなく**下にあった別のカード**（`WX17-055-E1` フンババ）。
      // ⚠ここで外さないと `thisCardOnly` に化けて**離場した自分自身を蘇生する別物**になる（意味照合 段1 第4バッチ E018）。
      && !/この(?:シグニ|カード)の下にあった/.test(t)) {
    const asDown = t.includes('ダウン状態で');
    return {
      type: 'ADD_TO_FIELD', owner: 'self',
      source: { type: 'TRASH_CARD', owner: 'self', count: 1, filter: { thisCardOnly: true } },
      ...(asDown ? { asDown: true } : {}),
      ...(t.includes('もよい') ? { optional: true } : {}), // 「場に出してもよい」＝任意
    };
  }

  // ---- 相手トラッシュのシグニを「傀儡状態で」自分の場に出す（§5d-0 (i)・2026-08-18）----
  // 🔴従来は下の汎用「トラッシュから…場に出す」へ落ちて `TRASH_CARD{owner:'self'}` になっていた＝
  //   **自分のトラッシュから自分のシグニを蘇生する完全な別物**（傀儡状態にもならない＝実測8効果）。
  //   さらに `WXK10-091-E2` は「＜美巧＞**ではない**」を `story:'美巧'` と読んで**条件が反転**していた。
  // 🔑機構は実装済み＝`STEAL_OPP_TRASH_PUPPET`（`execStubPart1`）が相手トラッシュ→自分の空きゾーン配置＋
  //   `field.puppet_signi` 登録＋離場時の持ち主トラッシュ回収（`sweepPuppets`）まで担う。
  // ⚠旧コメントの据置理由「engine 側 cross-owner 未対応」は**古い**（`ADD_TO_FIELD` の話であって
  //   傀儡 STUB の話ではなかった）。在庫は寝かせるほど陳腐化する＝着手時に engine を実測し直すこと。
  // ⚠**「傀儡状態で〜場に出す」だけを受ける**＝`WDK17-001-E1`「あなたの**傀儡状態の**シグニ１体が
  //   **場に出た**とき」は連体の「の」なので当たらない（当てるとトリガー文を配置文に化けさせる）。
  if (/傀儡状態で(?:あなたの)?(?:場|シグニゾーン)に出/.test(t)) {
    // 絞り込みは「トラッシュから」〜「シグニ」の間の修飾句だけを見る（`signiClause*Filter` 3兄弟と同じ隣接規律）。
    // 全文から取ると前文（「対戦相手のセンタールリグのルリグタイプを追加で得る」等）の語を巻き込む。
    const puppetIdx = t.indexOf('トラッシュから');
    const puppetSpan = puppetIdx >= 0 ? (t.slice(puppetIdx).match(/^トラッシュから(.*?)シグニ/s)?.[1] ?? '') : '';
    const puppetExM = puppetSpan.match(/＜([^＞]+)＞ではない/);
    const puppetFilter: TargetFilter = {
      cardType: 'シグニ',
      ...parseLevelFilter(puppetSpan),
      ...(puppetExM ? { cardClassExclude: puppetExM[1] } : parseStoryFilter(puppetSpan)),
    };
    const puppetUpToM = t.match(/([０-９\d]+)枚まで/);
    const puppetCountM = t.match(/([０-９\d]+)枚を対象/);
    return {
      type: 'STUB', id: 'STEAL_OPP_TRASH_PUPPET',
      // 次文「それの【出】能力は発動しない」（`WXEX2-23-E4`）を `foldSuppressOnPlay` が畳み込むための配置アンカー
      placesToField: true,
      puppetParams: {
        count: puppetUpToM ? parseNum(puppetUpToM[1]) : (puppetCountM ? parseNum(puppetCountM[1]) : 1),
        ...(puppetUpToM || /場に出してもよい/.test(t) ? { optional: true } : {}),
        // cardType だけ＝原文に絞り込みが無い＝渡さない（engine 既定の「相手トラッシュのシグニ全部」と同じ）
        ...(Object.keys(puppetFilter).length > 1 ? { filter: puppetFilter } : {}),
      },
    } as StubAction as EffectAction;
  }

  // ---- トラッシュからシグニを場に出す ----
  if (t.includes('トラッシュから') && (t.includes('場に出す') || t.includes('場に出してもよい'))) {
    const filter: TargetFilter = {
      cardType: 'シグニ',
      ...parseLevelFilter(t),
      ...parseColorFilter(t),
      ...parseStoryFilter(t),
      ...parseColorMatchesLrig(t),
      ...parseSelfComparison(t), // 「このシグニよりパワー/レベルの低い」＝効果元基準。resolveDynamicFilter が解決
      ...parseTriggerComparison(t, { allowPlacement: true }), // 「そのシグニより低い/高いレベル」＝トリガー元基準（被バニッシュ/被トラッシュ/場に出た）
      ...parseNoAbilitiesFilter(t), // 「能力を持たないシグニN枚」（§5d パターンA）。「〜として場に出す」は helper 側で除外
      ...(/カード名に《[^》]+》を含む/.test(t) ? parseNameFilter(t) : {}), // 「カード名に《X》を含むシグニ」＝部分一致（WXEX2-51 ユラギ）
      // 「《カード名》以外の〜」（§5d パターンA・続き371）＝自分自身を回収できてしまう過剰効果の是正
      //   （`SP27-003-E1`／`WDK14-012-E1`／`WX20-048-E1`／`WXEX2-80-E1`）。この分岐は「トラッシュから…場に出す」
      //   の実行文だけを受けるので、条件節用法（PR-204/PR-238「以外のアーツを使用していない場合」）は入らない。
      ...parseExcludeCardNameFilter(t),
      // 《ライズ／クロス／アクセアイコン》を持つ（続き377c）＝落ちると**トラッシュのどのシグニでも出せる**過剰効果
      //   （`WXDi-P09-039-E2`／`WXDi-P15-006-E2`／`WXEX2-09-E2`）。この分岐は「トラッシュから…場に出す」の
      //   実行文だけを受けるので条件節用法は入らない（`parseExcludeCardNameFilter` と同じ理由）。
      ...parseIconFilter(t),
      ...signiClauseDisonaFilter(t),
    };
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const countM = t.match(/([０-９\d]+)枚を対象/);
    const count = upToM ? parseNum(upToM[1]) : (countM ? parseNum(countM[1]) : 1);
    // owner検出: 「（対戦相手の）トラッシュから…それを対戦相手の場に出す」＝相手フィールドへ配置。
    //   engine の execAddToField はトラッシュ候補を tgtOwner の state から取る（cross-owner非対応）ため、
    //   配置先が相手の場のとき source（相手トラッシュ）も owner を opponent に揃える（WXEX2-50-E3 step1）。
    //   「傀儡状態であなたの場に出す」系（相手トラッシュ→自分の場）は engine 側 cross-owner 未対応で
    //   source owner を変えても挙動不変＝held増だけになるため据置＝self（傀儡機構は §6.3 別課題）。
    const toOppField = /対戦相手の(?:場|シグニゾーン)に出/.test(t);
    const placeOwner: Owner = toOppField ? 'opponent' : 'self';
    // 「場に出してもよい」＝任意（optional）。「そうした場合」の did-it ゲートと組む／単独でも「出す/出さない」を
    //   選べる（engine execAddToField が optional で 0枚選択＝スキップを許可・§3 タスク12(vii)系）。down 変種は asDown も付与。
    return { type: 'ADD_TO_FIELD', owner: placeOwner, source: { type: 'TRASH_CARD', owner: placeOwner, count, upToCount: !!upToM, filter,
        // 「このシグニの下にあった〜」＝離場直前の下カードだけ（`WX17-055-E1`）。実行時に ctx.leftFieldUnderCards と積集合。
        ...(isUnderLeftCardPhrase(t) ? { fromLeftFieldUnder: true } : {}) },
      ...(t.includes('ダウン状態で場に出') ? { asDown: true } : {}),
      ...(t.includes('場に出してもよい') ? { optional: true } : {}) };
  }

  // ---- ルリグデッキからレゾナを出現条件無視で場に出す（§6.4 O-5）----
  // 旧実装は bare ADD_TO_FIELD でデッキトップを出していた（誤り）→ 専用 STUB 化 → **さらに engine が
  // カード全文 regex でクラスだけ読む O-20 クラス**だったので、ここで**枚数・絞り込みを原文から解いて渡す**。
  // 🔴従来落ちていた軸＝①枚数（「２枚まで」`WX16-Re18-E1`／「好きな枚数」`WX13-007-E3` が1枚に潰れる）
  //   ②レベル（「レベル３以下の」`WD12-007-E1`／`WX07-050-E1`）③色（「白の」`WX07-050-E1`）
  //   ④クラスの OR（「＜空獣＞か＜地獣＞」`WX19-028-E3` は `includes` に当たらず**無条件**になっていた）。
  if (t.includes('ルリグデッキから') && t.includes('レゾナ') && t.includes('場に出す')) {
    // 「レゾナ」より前の修飾句だけを見る＝後続文（「ターン終了時、〜」等）の語を拾わない。
    // ⚠絞り込みは「ルリグデッキから」〜「レゾナ」の**間の修飾句だけ**を見る＝
    //   後続文（「ターン終了時、〜」等）の語を拾わない。
    const clause = t.slice(t.indexOf('ルリグデッキから'), t.indexOf('レゾナ') + 3);
    const anyCount = /好きな枚数の/.test(clause);
    // 「レゾナを２枚まで」／「レゾナ１枚を」の両語順を受ける。
    const nM = t.slice(t.indexOf('ルリグデッキから')).match(/レゾナ(?:を)?([０-９\d]+)枚|([０-９\d]+)枚(?:まで)?の?レゾナ/);
    const nRaw = nM?.[1] ?? nM?.[2];
    const upTo = anyCount || /レゾナ(?:を)?[０-９\d]+枚まで/.test(t.slice(t.indexOf('ルリグデッキから')));
    const resonaFilter: TargetFilter = {
      ...parseLevelFilter(clause), ...parseColorFilter(clause), ...parseStoryFilter(clause),
    };
    return {
      type: 'STUB', id: 'SUMMON_RESONA_FROM_LRIG_DECK',
      // `placesToField`＝次文「この方法で場に出たレゾナの【出】能力は発動しない」を
      // `foldSuppressOnPlay` が畳み込むための配置アンカー（§6.4 O-32 で入れた汎用フラグ）。
      placesToField: true,
      resonaSummon: {
        count: anyCount ? 'ALL' : (nRaw ? parseNum(nRaw) : 1),
        ...(upTo ? { upTo: true } : {}),
        ...(Object.keys(resonaFilter).length > 0 ? { filter: resonaFilter } : {}),
      },
    } as StubAction;
  }

  // ---- 手札からシグニを場に出す ----
  // 旧実装は bare ADD_TO_FIELD でデッキトップを出していた（誤り）。手札から対象を選んで出す。
  if (t.includes('手札から') && (t.includes('場に出す') || t.includes('場に出してもよい'))
      && !t.includes('エナ') && !t.includes('トラッシュ') && !t.includes('ルリグデッキ') && !t.includes('デッキの一番上') && !t.includes('デッキの上')) {
    // 「あなたの手札から《ＧＦ　ハウス》以外のレベル４のシグニ１枚を場に出す」（`WXK06-023-E2`）＝
    // `parseNameFilter` が除外名を `cardName`（部分一致）に入れてしまい、**そのカードしか出せない原文と真逆**の
    // 効果になっていた（§5d パターンA・続き371 の「反転」型）。除外が取れたら name 側は捨てる。
    const excludeNameFilter = parseExcludeCardNameFilter(t);
    const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(t), ...parseStoryFilter(t),
      // 《ライズ／クロス／アクセアイコン》を持つ（続き377c）＝落ちると**手札のどのシグニでも出せる**過剰効果
      //   （`WX16-026-E2`／`WX18-030-E2`）。この分岐は「手札から…場に出す」の実行文だけを受ける。
      ...parseIconFilter(t),
      ...(excludeNameFilter.excludeCardName ? excludeNameFilter : parseNameFilter(t)) };
    const exclM = t.match(/([白青赤緑黒])ではない/);
    if (exclM) filter.colorExclude = exclM[1];
    else Object.assign(filter, parseColorFilter(t));
    // 動的フィルタ（ON_LEAVE_FIELD トリガー時に離れたカードの値で解決）
    // 「（この/その）シグニより低いレベル／レベルの低い」→ levelBelowLeftCard
    if (/(?:この|その)シグニより(?:低いレベル|レベルの低い)/.test(t)) { delete filter.level; filter.levelBelowLeftCard = true; }
    // 「（この/その）シグニよりパワーの低い／低いパワー」→ powerBelowLeftCard
    if (/(?:この|その)シグニより(?:パワーの低い|低いパワー)/.test(t)) filter.powerBelowLeftCard = true;
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const count = upToM ? parseNum(upToM[1]) : 1;
    // 「場に出してもよい」＝任意（optional）。engine execAddToField が optional で「出す/出さない」を提示する。
    //   （旧・続き207 は down 変種に限定していたが、対象カード数が3枚と限定的で退化なしと確認し plain も付与＝§3 タスク12(vii)系）。
    const asDownHand = t.includes('ダウン状態で場に出');
    return { type: 'ADD_TO_FIELD', owner: 'self', source: { type: 'HAND_CARD', owner: 'self', count, upToCount: !!upToM, filter },
      ...(asDownHand ? { asDown: true } : {}),
      ...(t.includes('場に出してもよい') ? { optional: true } : {}) };
  }

  // ---- 対戦相手はシグニをN体までしか場に出せない（配置数制限・DEPLOY_RESTRICT）----
  // 「（このターン、）対戦相手はシグニをN体までしか場に出すことができない」（WXK11-074/WX12-008/WXDi-P05-024/WXK05-009・【常】版 WX07-006）。
  // engine（execStubPart3 の DEPLOY_RESTRICT）が原文から N を読み、配置数上限フラグ＋超過分の即トラッシュを処理する。
  // 下の bare ADD_TO_FIELD（「場に出す」を含むため）に誤マッチするのを防ぐため、ここで先取りする。
  // §5.3 `O-60` 第4バッチ＝**上限・主語・予約を `deployRestrict` に刻む**（消費地点2つの全文 regex を撤去）。
  // ⚠**主語はこの文だけから取る**＝旧 engine はカード全文を「。」で割って探しており、同じカードの
  //   別能力の言い回しで主語がぶれた。
  if (/シグニを[０-９\d]+体までしか/.test(t) && /場に出(?:せない|すことができない)/.test(t)) {
    const capMDR = t.match(/シグニを([０-９\d]+)体までしか/)!;
    const subjectDR = t.includes('すべてのプレイヤーは') ? 'both' : t.includes('あなたは') ? 'self' : 'opponent';
    return { type: 'STUB', id: 'DEPLOY_RESTRICT', deployRestrict: {
      kind: 'count', cap: parseNum(capMDR[1]), subject: subjectDR,
      ...(t.includes('そのターンの間') ? { extraTurnReservation: true } : {}),
    } } as StubAction;
  }

  // ---- このシグニ/カード/キーは（条件）（新たに）場に出すことができない（自身出撃制限・SELF_PLAY_RESTRICT）----
  // 「対戦相手はシグニをN体まで」（DEPLOY_RESTRICT・上で先取り済）とは別系統＝この効果を持つカード自身の通常召喚可否ゲート。
  // 下の bare ADD_TO_FIELD（「場に出す」を含むため）へ誤マッチし CONTINUOUS のまま inert no-op 化していたのを先取りする（Opusタスク12(xlix)）。
  // ⚠「…ないかぎり、新たに場に出す…」など条件節を伴うカードは effectParser の CONTINUOUS 分岐が parseActiveCondition で
  //   条件節を先に剥がすため、全文はまず parseSelfPlayRestrict（effectParser 側で先取り）が捕捉する。ここは残余フォールバック。
  {
    const spr = parseSelfPlayRestrict(t);
    if (spr) return spr;
  }

  // ---- 場に出す（デッキ上から / 手札から など）----
  if (t.includes('場に出してもよい') || (t.includes('場に出す') && !t.includes('エナ') && !t.includes('トラッシュ'))) {
    // 「場に出してもよい」＝任意配置（engine の no-source 経路が CHOOSE で出す/出さないを提示）
    return { type: 'ADD_TO_FIELD', owner: 'self', ...(t.includes('もよい') ? { optional: true } : {}) };
  }

  // ---- 効果耐性付与（「〜のルリグ以外からの効果を受けない」）----
  // 「ルリグ以外」は「ルリグからは受けるが、それ以外全てから受けない」という意味
  if (t.match(/ルリグ以外からの効果を受けない/)) {
    const classM = t.match(/あなたの(?:他の)?＜([^＞]+)＞のシグニは/);
    if (classM) {
      return {
        type: 'GRANT_PROTECTION',
        subjectFilter: { cardType: 'シグニ', story: classM[1] },
        fromAll: true,
        exceptSource: { sourceType: 'ルリグ', sourceOwner: 'opponent' as Owner },
        duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
  }

  // ---- 効果耐性付与（「対戦相手の〜の効果を受けない/受けず」）----
  if (t.match(/効果を受けない|効果を受けず/)) {
    // ⚠🔴**「〔X〕以外の効果を受けない」は意味が逆**（続き377j）。素の `t.includes('アーツ')` 判定は
    //   「対戦相手の、**アーツ以外の**効果を受けない」を `from:['アーツ']`＝「アーツの効果だけ受けない」
    //   と読み、**保護される範囲が原文とちょうど反対**になっていた（実測2効果＝`WX12-018-E1`／`WX09-017-E2`。
    //   前者は live が既に正しい形を持っており、parser だけが退化していた＝`_partial_fresh` 行列に居た）。
    //   正しい表現は既存の `fromAll` ＋ `exceptSource`（上の「ルリグ以外からの効果を受けない」と同型）。
    //   ⚠**種別語に限る**＝「**自身**以外の効果を受けない」（`WX17-001-E1`）は sourceType の語彙が無いので触らない。
    const exceptM = t.match(/(アーツ|スペル|シグニ|ルリグ)以外(?:から)?の効果を受けない/);
    if (exceptM) {
      const exSigniFilter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parsePowerFilter(t) };
      const exHasFilter = exSigniFilter.story || exSigniFilter.powerRange;
      const exCount: number | 'ALL' = /この(?:シグニ|カード)は/.test(t) ? 1 : 'ALL';
      return {
        type: 'GRANT_PROTECTION',
        target: (exHasFilter
          ? { type: 'SIGNI', owner: 'self', count: exCount, filter: exSigniFilter }
          : { type: 'SIGNI', owner: 'self', count: exCount }) as EffectTarget,
        fromAll: true,
        exceptSource: { sourceType: exceptM[1], sourceOwner: 'opponent' as Owner },
        sourceOwner: 'opponent',
        duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    const from: string[] = [];
    if (t.includes('ルリグ')) from.push('ルリグ');
    if (t.match(/シグニの効果|シグニとシグニ|シグニ以外/)) from.push('シグニ');
    if (t.includes('スペル')) from.push('スペル');
    if (t.includes('アーツ')) from.push('アーツ');
    if (from.length === 0) from.push('any');
    // 「あなたの＜CLASS＞のシグニは」→ CONTINUOUS用 subjectFilter（全一致シグニを保護）
    const classM = t.match(/あなたの(?:他の)?＜([^＞]+)＞のシグニは/);
    if (classM) {
      return {
        type: 'GRANT_PROTECTION',
        subjectFilter: { cardType: 'シグニ', story: classM[1] },
        from, sourceOwner: 'opponent', duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    // 個別シグニへの保護（従来通り）
    // 「〜N体（まで）を対象とし…を得る」＝選択式の単体付与（count:N・保護コレクタの単体分岐を発火）。対象句が無ければ広域（ALL）
    const signiFilter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parsePowerFilter(t) };
    const hasFilter = signiFilter.story || signiFilter.powerRange;
    const tgtCntM = t.match(/([０-９\d]+)体(?:まで)?を対象とし/);
    // 「このシグニは…効果を受けない」＝自己保護（count:1 で source を保護）。それ以外（広域・暗黙主語）は従来どおり ALL
    const protCount: number | 'ALL' = tgtCntM ? parseNum(tgtCntM[1]) : (/このシグニは/.test(t) ? 1 : 'ALL');
    const target: EffectTarget = hasFilter
      ? { type: 'SIGNI', owner: 'self', count: protCount, filter: signiFilter }
      : { type: 'SIGNI', owner: 'self', count: protCount };
    const renyoPower = activeRenyoPower();
    if (!renyoPower) {
      return { type: 'GRANT_PROTECTION', target, from, sourceOwner: 'opponent', duration: 'PERMANENT' } as GrantProtectionAction;
    }
    const protection: GrantProtectionAction = {
      type: 'GRANT_PROTECTION', target, from, sourceOwner: 'opponent', duration: renyoPower.duration,
    };
    const selectable = typeof target.count === 'number' && !target.filter?.thisCardOnly;
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'POWER_MODIFY', target, delta: renyoPower.delta, duration: renyoPower.duration },
        { ...protection, ...(selectable ? { targetsLastProcessed: true } : {}) },
      ],
    };
  }

  // ---- チアガール変換 ----
  if (t.includes('チアガールにする')) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const target: EffectTarget = t.includes('このシグニ')
      ? { type: 'SIGNI', owner: 'self', count: 1 }
      : { type: 'SIGNI', owner, count: 1 };
    return { type: 'GRANT_KEYWORD', target, keyword: 'チアガール', duration: 'PERMANENT' };
  }

  // ---- 強制攻撃 ----
  if (t.includes('可能ならばアタックしなければならない')) {
    const target: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const infectedOnly = t.includes('感染状態');
    const nextTurn = /次の(?:対戦相手の)?ターンの間/.test(t);
    const forced = {
      type: 'FORCE_SIGNI_ATTACK', targetOwner: target,
      ...(infectedOnly ? { infectedOnly: true } : {}),
      ...(nextTurn ? { duration: 'NEXT_TURN' as const } : {}),
    } as ForceSigniAttackAction;
    // ---- 「〜、対戦相手はアーツとスペルと【起】能力を使用でき**ず**、シグニは可能ならばアタックしなければならない」----
    // （§6.4 O-14(a)・`WX15-003-E3`）＝**1文に2機構**。🔴従来は後半の強制アタックだけが拾われ、
    //   前半の使用不可が**丸ごと落ちていた**（申告済みの原文不一致）。
    // ⚠既存の使用不可規則（`parseSentencePart3` の `BLOCK_OPP_ARTS_SPELL_ACT`）は
    //   ①綴りが「使用できない」限定で連用中止の「使用できず」を取らない ②そもそもこの規則が先に当たるので
    //   後段まで届かない＝**ここで畳む**のが唯一の合流点。
    // ⚠期間は前半・後半で共有される（「次のターンの間、」が文頭の1つだけ）＝同じ `nextTurn` で分岐する。
    if (/アーツとスペルと【起】能力を使用でき(?:ない|ず)/.test(t)) {
      return { type: 'SEQUENCE', steps: [
        { type: 'STUB', id: nextTurn ? 'BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN' : 'BLOCK_OPP_ARTS_SPELL_ACT' } as StubAction,
        forced,
      ] } as EffectAction;
    }
    return forced;
  }

  // ---- チャーム除去 ----
  // 「【チャーム】を…トラッシュに置く」（チャーム自体が除去対象）のみ。
  // 「【チャーム】がない場合、このシグニをトラッシュに置く」等の自己トラッシュ／チャーム有無条件は除外（part2 の専用ルールへ委譲）。
  if ((t.includes('チャーム】') || t.includes('【チャーム】')) && t.includes('トラッシュに置く')
      && !/【チャーム】が(?:ない|なかった)/.test(t)
      && !/この(?:シグニ|カード)を(?:場から)?トラッシュに置く/.test(t)) {
    const isOpp = t.includes('対戦相手');
    const targetOwner: Owner = isOpp ? 'opponent' : 'self';
    const countM = t.match(/【チャーム】([１-９\d]+)枚/);
    const toHalf = (s: string) => s.replace(/[１-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFF11 + 0x31));
    const count: number | 'ALL' = countM ? (parseInt(toHalf(countM[1])) || 1) : 'ALL';
    return { type: 'REMOVE_CHARM', targetOwner, count } as RemoveCharmAction;
  }

  // ---- チャーム付与 ----
  if (t.includes('チャーム】にする') || t.includes('チャーム】にしてもよい')) {
    // チャーム付与先オーナー判定
    const toOwner: Owner = t.match(/対戦相手のシグニ.+【チャーム】/) ? 'opponent' : 'self';
    // チャームの出所判定
    const charmIsTopOfDeck = t.includes('デッキの一番上のカード') || t.includes('デッキの上からカード');
    const charmFromTrash = t.includes('トラッシュから');
    const charmIsSelf = (t.includes('このシグニをそれの') || t.includes('このシグニを')) && !charmIsTopOfDeck && !charmFromTrash;
    const charmIsThisCard = t.includes('このカードをそれの') || t.includes('このカードを');
    // チャームの出所オーナー（「対戦相手は自分のデッキ…」＝対戦相手が自分のデッキから＝opponent。WXEX2-76/WX08-006）
    const charmOwner: Owner = t.includes('対戦相手のデッキ') || t.includes('対戦相手のトラッシュ')
      || t.includes('対戦相手は自分のデッキ') || t.includes('対戦相手は自分のトラッシュ') ? 'opponent' : 'self';
    // 「カードをN枚（まで）… シグニN体（まで）の【チャーム】にする」＝**複数ペア**（続き377n）。
    // ⚠従来は charm/to とも `count:1` 固定で、`WX07-045-E2`（3枚）・`WXEX1-22-E2`（3枚→3体）・
    //   `WXK07-070-E1`／`WX17-Re05-E1`（2枚→2体）が**常に1組だけ**の過小実行になっていた。
    // ⚠枚数は**出所句に隣接する「N枚」だけ**を見る（全文から拾うと付与先の「N体」や別文の枚数を引き込む）。
    const charmCountM = t.match(/(?:トラッシュ|デッキの上|デッキの一番上)から([^。、]{0,24}?)(?:カード|シグニ)(?:を)?([０-９\d]+)枚(まで)?/);
    const charmCount = charmCountM ? parseNum(charmCountM[2]) : 1;
    // ⚠クラスは**出所句に隣接するときだけ** charm 側に載せる＝素の `parseStoryFilter(全文)` は
    //   `WX07-045-E2`「トラッシュから対象のカードを３枚まで対象のあなたの好きな数の**＜悪魔＞の**シグニの【チャーム】にする」で
    //   **付与先のクラス**を charm 側へ載せてしまい、「トラッシュの＜悪魔＞しかチャームにできない」過小実行になる。
    const charmStory = charmCountM ? parseStoryFilter(charmCountM[1]) : parseStoryFilter(t);
    const charmUpTo = charmCountM?.[3] ? { upToCount: true } : {};
    const charm: EffectTarget = charmIsTopOfDeck
      ? { type: 'DECK_CARD', owner: charmOwner, count: charmCount, ...charmUpTo }
      : charmFromTrash
        ? { type: 'TRASH_CARD', owner: charmOwner, count: charmCount, ...charmUpTo, filter: charmStory as TargetFilter }
        : charmIsSelf || charmIsThisCard
          ? { type: 'SIGNI', owner: 'self', count: 1 }
          : { type: 'SIGNI', owner: 'self', count: 1 };
    // 付与先が「このシグニの【チャーム】」＝効果元シグニ自身（任意選択でなく thisCardOnly。G147）
    const toThisCard = /このシグニの【チャーム】/.test(t);
    // 付与先が「そのシグニの【チャーム】」＝トリガー元シグニ（＝場に出たシグニ）に付与（任意選択でなく isTriggerSource。
    //   WXEX2-76/WX08-006/WXK10-048。engine execAttachCharm が triggeringCardNum に解決）。CSV上この語句を持つ効果は
    //   すべて「（対戦相手の/あなたの）シグニが場に出たとき」トリガー＝「その」は場に出たシグニを指す（別の対象化文脈は無い）。
    const toTriggerSource = !toThisCard && /そのシグニの【チャーム】/.test(t);
    const toFilter = toThisCard ? { thisCardOnly: true }
      : toTriggerSource ? { isTriggerSource: true }
        : hasOtherSelfSigniNoun(t) ? { excludeSelf: true }
          : undefined;
    // 付与先の体数＝「〈修飾〉シグニN体（まで）の【チャーム】に」（出所が先の語順）か
    //   「〈修飾〉シグニをN体まで対象とし」（付与先が先の語順）。「好きな数の」は count:'ALL'。
    const toCharmM = t.match(/(?:あなた|対戦相手)の(好きな数の)?([^。、]{0,20}?)シグニ(?:を)?(?:([０-９\d]+)体)?(まで)?の【チャーム】に/);
    const toClauseM = toCharmM ?? t.match(/(?:あなた|対戦相手)の(好きな数の)?([^。、]{0,20}?)シグニ(?:を)?([０-９\d]+)体(まで)?を?対象とし/);
    const toCount: number | 'ALL' = toClauseM
      ? (toClauseM[1] ? 'ALL' : toClauseM[3] ? parseNum(toClauseM[3]) : 1)
      : 1;
    const toUpTo = toClauseM?.[4] && toCount !== 'ALL' ? { upToCount: true } : {};
    // 付与先のクラスも**その名詞句に隣接するとき**だけ（`WX07-045-E2` の ＜悪魔＞ はここに属する）。
    const toStory = toClauseM ? parseStoryFilter(toClauseM[2]) : {};
    const toMergedFilter = { ...(toFilter ?? {}), ...toStory };
    const toTarget: EffectTarget = {
      type: 'SIGNI', owner: toOwner, count: toCount, ...toUpTo,
      ...(Object.keys(toMergedFilter).length > 0 ? { filter: toMergedFilter } : {}),
    };
    return { type: 'ATTACH_CHARM', charm, to: toTarget } as AttachCharmAction;
  }

  // ---- キーワード能力（スタンドアロン形式：【XXX】（説明）or 【XXX】のみ）----
  // 【マルチエナ】など CONTINUOUS 効果として記載されるキーワード能力
  {
    // 【コンバート《色》】＝「エナコストを支払う際、このカードは《色》として支払える」（§6.4 O-10・続き508）。
    // 🔑**新機構は要らなかった**＝エナの「追加色」funnel（`extraColorMap`／`myEnergyExtraColors`）が
    //   既にあり、`FIELD_ENERGY_SIGNI_GAIN_COLOR`／`ALL_ZONE_BLACK` が同じ経路で動いている。
    // ⚠**色はペイロードへ載せる**（`value`）＝engine で原文を再パースしない規約。
    {
      const convM = t.trim().match(/^【コンバート《([白赤青緑黒無])》】/);
      if (convM) return { type: 'STUB', id: 'CONVERT_ENERGY_COLOR', value: convM[1] } as StubAction;
    }
    const saM = t.match(/^【([^】]+)】[（(]?/);
    const leadingAttachedTarget = /^【[^】]+】が付いている[^。、]*シグニ[０-９\d]+体(?:まで)?を対象とし/.test(t);
    if (saM && !leadingAttachedTarget && !['常','出','起','自','ガード','エナチャージ'].includes(saM[1]) && !saM[1].match(/^エナチャージ/)) {
      const dur: EffectDuration = t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN' : 'PERMANENT';
      const target: EffectTarget = { type: 'SIGNI', owner: 'self', count: 1 };
      return { type: 'GRANT_KEYWORD', target, keyword: saM[1], duration: dur };
    }
  }

  // ---- 明示 defer（§6.4 O-28）＝キーワード名だが engine に消費が無いもの ----
  // 🔑ゴミ `GRANT_KEYWORD.keyword` のまま置くと `census:stubs` に映らない**無言 no-op**なので、
  //   `DEFERRED_*` STUB に落として計器へ載せる（「defer は何もしないに倒すためのもの」）。
  {
    // ⚠【コンバート《色》】は**上のキーワードブロックで実装済み**（§6.4 O-10・続き508）＝
    //   ここに defer を置くと到達しない死んだ規則になる。
    // 「このシグニはダウン状態でもアタックできる」（`WX22-022-E1`・内部名 スリープアタッカー）。
    // §6.4 O-10（続き507）で defer 解体＝**down 判定を `signiAttackGate` へ寄せた**ので、
    // 例外はその 1 関数（`ALREADY_DOWN` の分岐）だけで人間ボタン／実行経路／CPU の3経路に効く。
    // ⚠同居する【常】「自身のパワー10000につき一度まで」（`ATTACK_COUNT_BY_POWER`）が回数の上限。
    //   そちらは**実効パワー**で数える（印刷パワーだと 15000＝1回に固定されてこの能力が死ぬ）。
    if (/^この(?:シグニ|カード)はダウン状態でもアタックできる$/.test(t.trim())) {
      return { type: 'STUB', id: 'ATTACK_WHILE_DOWN' } as StubAction;
    }
  }

  // ⚠この位置にあった `DEFERRED_LEAVE_FIELD_REPLACE_WITH_DOWN` は §6.4 O-10（続き507）で解体し、
  //   上の `EFFECT_LEAVE_PREVENT_LOSE_SELF_ABILITY`（汎用「能力を失う」ブロックより**前**）へ移した。
  //   ここに残すと後段が先取りして一度も到達しない（実際 `WX25-P2-071-E1` はリテラル固定で、
  //   同文の `WX25-P2-TK04-E1` はここまで来ずに誤 parse されていた）。

  // ---- 引用【常】の中身が既存機構で解ける3形（§6.4 O-28）----
  // 🔴どれも従来は引用文が丸ごと `GRANT_KEYWORD.keyword` に入って**一度も効かなかった**。
  {
    const innerConstM = t.match(/を対象とし、ターン終了時まで、それは「【常】：(.+?)。?」を得る/);
    const inner = innerConstM?.[1]?.replace(/。$/, '') ?? '';
    if (inner) {
      // ①「あなたの手札がN枚以下であるかぎり、このシグニは【アサシン】を得る」（`WX24-P1-064-E1`）
      //   ＝アサシンの**アタック側条件**スコープ（`hasApplicableAssassin` の `selfHandLte`）。
      const handAssassinM = inner.match(/^あなたの手札が([０-９\d]+)枚以下であるかぎり、この(?:シグニ|カード)は【アサシン】を得る$/);
      if (handAssassinM) {
        return {
          type: 'GRANT_KEYWORD', target: parseSigniTarget(t, 'self'),
          keyword: `アサシン:${JSON.stringify({ selfHandLte: parseNum(handAssassinM[1]) })}`,
          duration: 'UNTIL_END_OF_TURN',
        } as GrantKeywordAction;
      }
      // ②「対戦相手の効果によって、バニッシュされず手札に戻らない」（`WXK07-029-E1`）
      //   ＝既存 `GRANT_PROTECTION`（軸 BANISH＋BOUNCE・発生源は相手）。
      if (/^対戦相手の効果によって[、,]?バニッシュされず手札に戻らない$/.test(inner)) {
        return {
          type: 'GRANT_PROTECTION', target: parseSigniTarget(t, 'self'),
          from: ['BANISH', 'BOUNCE'], sourceOwner: 'opponent', duration: 'UNTIL_END_OF_TURN',
        } as GrantProtectionAction;
      }
      // ③「このシグニのパワーが－される場合、代わりに２倍－される」（`WXK08-049-E2`）
      //   ＝既存 `double_power_minus_targets`（`DOUBLE_OWN_POWER_MINUS`）。対象は相手シグニ。
      if (/^この(?:シグニ|カード)のパワーが[－-]される場合、代わりに[２2]倍[－-]される$/.test(inner)) {
        return {
          type: 'SEQUENCE',
          steps: [
            { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: parseSigniTarget(t, 'opponent') } as StubAction,
            { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' } as StubAction,
            { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' } as StubAction,
          ],
        } as SequenceAction;
      }
    }
  }

  // ---- 引用符キーワード効果付与（「【常】：XXX」を得る）----
  // ⚠XXX がキーワード名でない（＝文）ときは **`parseSingleSentence` の後処理**
  //   `dropSentenceShapedKeyword` が `GRANT_ABILITY_INNER_TEXT` へ落とす（§6.4 O-28）。
  //   🔴**ここで先に弾いてはいけない**＝`rewriteAttackTaxKeywordGrant`（続き490/494）は
  //     この GRANT_KEYWORD を**入力として**受け取り `SELECT_TARGET_ONLY → SIGNI_ATTACK_BAN` へ
  //     組み替える。ここで弾くとその7効果の正準形が丸ごと消える（実測で held +7）。
  const grantQuotedM = t.match(/を対象とし、ターン終了時まで、それは「【常】：(.+?)。?」を得る/);
  if (grantQuotedM) {
    const keyword = grantQuotedM[1].replace(/。$/, '');
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const target: EffectTarget = /(?:センター)?ルリグかシグニ/.test(t)
      ? { type: 'CENTER_LRIG_OR_SIGNI', owner, count: 1 }
      : t.includes('シグニ')
        ? parseSigniTarget(t, owner)
        : { type: 'LRIG', owner, count: 1 };
    return { type: 'GRANT_KEYWORD', target, keyword, duration: 'UNTIL_END_OF_TURN' };
  }

  // ---- コイン獲得（《コインアイコン》を得る）----
  if (t.match(/《コインアイコン》/) && t.includes('を得る')) {
    const count = (t.match(/《コインアイコン》/g) ?? []).length;
    return { type: 'GAIN_COIN', owner: 'self', count };
  }

  // ---- キーワード能力付与（【ランサー】【ダブルクラッシュ】など）----
  // 「【ライフバースト】を持つ…シグニ1体につき…（引く/エナに置く）」のような per-field 構文は
  // キーワード付与ではなく条件修飾。part3 の *_PER_FIELD_COUNT に委譲する。
  const isPerFieldCount = t.includes('体につき') && (t.includes('引く') || t.includes('エナゾーンに置'));
  // 同じ修飾対象句を3回明示する形は、それぞれ独立に対象を選ぶ。照応で束ねず3 action を並べる。
  // 「同じシグニを選ぶこともできる」は独立選択の裏返しであり、targetsLastProcessed を付けない。
  const independentPowerTwoKeywordsM = t.match(/(対象の(あなた|対戦相手)の((?:(?:＜[^＞]+＞[とかや]?)+の|[白赤青緑黒]の)*)シグニ([０-９\d]+)体)のパワーを([＋+－-])([０-９\d,，]+)し、\1は【([^】]+)】を得、\1は【([^】]+)】を得る/);
  if (independentPowerTwoKeywordsM) {
    const owner: Owner = independentPowerTwoKeywordsM[2] === 'あなた' ? 'self' : 'opponent';
    const filter: TargetFilter = {
      cardType: 'シグニ',
      ...parseStoryFilter(independentPowerTwoKeywordsM[3]),
      ...parseColorFilter(independentPowerTwoKeywordsM[3]),
    };
    const target: EffectTarget = {
      type: 'SIGNI', owner, count: parseNum(independentPowerTwoKeywordsM[4]),
      ...(Object.keys(filter).length > 1 ? { filter } : {}),
    };
    const magnitude = parseNum(independentPowerTwoKeywordsM[6].replace(/[,，]/g, ''));
    const delta = independentPowerTwoKeywordsM[5] === '－' || independentPowerTwoKeywordsM[5] === '-' ? -magnitude : magnitude;
    const duration: EffectDuration = /次の(?:対戦相手|相手)の?ターン終了時まで/.test(t)
      ? 'UNTIL_OPP_TURN_END' : 'UNTIL_END_OF_TURN';
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'POWER_MODIFY', target, delta, duration } as PowerModifyAction,
        { type: 'GRANT_KEYWORD', target, keyword: independentPowerTwoKeywordsM[7], duration } as GrantKeywordAction,
        { type: 'GRANT_KEYWORD', target, keyword: independentPowerTwoKeywordsM[8], duration } as GrantKeywordAction,
      ],
    } as SequenceAction;
  }
  if (!isPerFieldCount && (t.includes('を得る') || t.includes('を持つ'))) {
    const kwM = t.match(/【([^】]+)】/);
    // 「【X】を持つ**〈カード/シグニ/…〉**」＝**保有条件（対象を絞るフィルタ）**であって付与ではない（タスク12(lxvi)②）。
    // 例：「あなたのエナゾーンから【歌のカケラ】を持つカード１枚をトラッシュに置いてもよい」＝
    //     「その keyword を持つカードを選ぶ」であり、**原文はどこにもキーワードを与えていない**。
    // ここを素通りさせると `GRANT_KEYWORD{歌のカケラ}` という**原文に無い付与**が生えて、
    // しかも条件節の ＜プリオケ＞ が対象フィルタへ紛れ込む（条件節を切り出すと今度はそれが消える＝(lxvi) の「両損」）。
    // ⚠**同じ文に本物の付与が同居する形**（「【ライフバースト】を持つシグニ…は【ランサー】を得る」）を殺さないため、
    //   保有条件として使われている keyword だけを飛ばし、残りに付与形があればそちらを採る。
    const isPossessionFilterKw = (k: string) => {
      const escaped = k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`【${escaped}】を持つ(?:カード|シグニ|スペル|アーツ|ルリグ|ピース)`).test(t)
        || new RegExp(`【${escaped}】が付いているかぎり`).test(t);
    };
    // ⚠**「…を得る／を持つ」に隣接する【K】を優先する」一般化は入れてはいけない**（続き377l で A/B により却下）＝
    //   `t.match(/【K】…を(得る|持つ)/)` は文中の**最初の**一致を返すため、①`WX08-061`「【ダブルクラッシュ】を
    //   **持つ**シグニ１体を対象とし…【アサシン】を得る」の**保有フィルタ**に当たる ②`WXDi-P15-048`
    //   「【アサシン】**か**【ダブルクラッシュ】を得る」の後段だけを採る ③`WXK02-057`/`WXDi-P11-071`/`WXDi-P13-044`
    //   の「『【常】：〜かぎり、【K】を得る。』を得る」＝**条件付き引用付与**の STUB を無条件 GRANT_KEYWORD へ潰す
    //   （内側の条件が丸ごと落ちる過剰実行）。実測 36カード中 16カードが退化した。**下の保有フィルタ除外のまま据置。**
    const attachedTargetKeyword = t.match(/【([^】]+)】が付いている[^。、]*シグニ[０-９\d]+体(?:まで)?を対象とし/);
    const kwGrantName = kwM && !['常','出','起','自','ガード'].includes(kwM[1])
      && (isPossessionFilterKw(kwM[1]) || !!attachedTargetKeyword)
      ? [...t.matchAll(/【([^】]+)】/g)].map(m => m[1])
          .find(k => !['常','出','起','自','ガード'].includes(k) && !isPossessionFilterKw(k) && k !== attachedTargetKeyword?.[1])
      : kwM?.[1];
    if (kwM && kwGrantName && !['常','出','起','自','ガード'].includes(kwGrantName)) {
      const nextOpponentTurn = t.includes('次の対戦相手のターンの間');
      const escapedGrantName = kwGrantName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      // 条件節の【シード】などを付与キーワードと誤認した旧パースへ、
      // 本文内の別節「次のターン」だけを結び付けない。実際の付与句がある場合のみ予約化する。
      const hasDirectKeywordGrant = new RegExp(`【${escapedGrantName}】を(?:得る|持つ)`).test(t);
      const nextGlobalTurn = !nextOpponentTurn && t.includes('次のターンの間') && hasDirectKeywordGrant;
      const thisAndNextTurn = t.includes('このターンと次のターンの間');
      const dur: EffectDuration = nextOpponentTurn || nextGlobalTurn ? 'NEXT_TURN'
        : t.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'
        : t.includes('次の対戦相手のターン終了時まで') ? 'UNTIL_OPP_TURN_END'
        : 'PERMANENT';
      // ターゲット解決（エナゾーン → 全シグニ → 個別）
      const kwAllSelf = t.match(/あなたのシグニ(?:すべて|は|が)/) || t.includes('すべてのあなたのシグニ')
        || (hasOtherSelfSigniNoun(t) && /シグニ(?:は|が)[^。]*を得る/.test(t));
      const kwCountSelfM = t.match(/あなたのシグニ([０-９\d]+)体/);
      // 「あなたの＜鉱石＞か＜宝石＞のシグニ」「あなたの赤のシグニ」のようにクラス句/色句が
      // 「あなたの」と「シグニ」の間に挟まると t.includes('あなたのシグニ') が外れて owner:any 既定に
      // 潰れる。クラス句（＜X＞か…）・色句（赤の 等）を許容して判定する。
      const kwSelfSigni = t.includes('あなたのシグニ') || /あなたの(?:[白赤青緑黒]の|＜[^＞]+＞か?)+の?シグニ/.test(t)
        // 「あなたの他の＜X＞のシグニのうち最も…」（超上級句で潰れていた WX25-CP1-051）を narrow に拾う。
        || /あなたの他の(?:[白赤青緑黒]の|＜[^＞]+＞か?の?)*シグニ/.test(t);
      const kwOppSigni = t.includes('対戦相手のシグニ') || /対戦相手の(?:[白赤青緑黒]の|＜[^＞]+＞か?)+の?シグニ/.test(t)
        || /対戦相手の他の(?:[白赤青緑黒]の|＜[^＞]+＞か?の?)*シグニ/.test(t);
      const kwTargetPossessionM = t.match(/(?:あなた|対戦相手)の【([^】]+)】を持つシグニ(?:[０-９\d]+体)?(?:まで)?を対象とし/);
      const kwTargetDrive = /(?:あなた|対戦相手)のドライブ状態のシグニ(?:[０-９\d]+体)?(?:まで)?を対象とし/.test(t);
      // 単体シグニ付与に付くクラス/色/レベルフィルタ（＜鉱石＞か＜宝石＞か＜ウェポン＞ 等）
      // 《ライズ／クロス／アクセアイコン》（続き377c）＝**対象名詞句に隣接**するときだけ（`signiClauseIconFilter`）。
      //   落ちると `WX15-070-E1`「《ライズアイコン》を持つあなたのシグニ１体を対象とし…【ダブルクラッシュ】を得る」で
      //   **どのシグニにも付与できる**過剰効果になる。全文スキャンにすると `WX18-030-E1`「場に…が２体あるかぎり」の
      //   **条件節**を対象へ引き込むので、隣接判定は外せない。
      const kwSigniFilter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t), ...signiClauseColorFilter(t), ...parseLevelFilter(t), ...parsePrintedComparison(t), ...signiClauseIconFilter(t), ...signiClauseDisonaFilter(t) };
      const kwHasFilter = Object.keys(kwSigniFilter).length > 1;
      // ⚠「あなたのシグニ**N体**」枝は **`kwSigniFilter` を使ってはいけない**（続き377c で A/B により判明）＝
      //   `kwSigniFilter` は `parseLevelFilter(t)` 等を**全文**から取るので、`WD21-001-E1`
      //   「あなたのシグニ１体を対象とし、…この方法で公開したカードが**レベル１のシグニの場合**、【ダブルクラッシュ】を得る」の
      //   **条件節のレベル**を対象へ載せてしまい、原文と逆の過小実行になる。**対象名詞句に隣接する語彙だけ**を合成する。
      const kwCountSelfFilter: TargetFilter = {
        cardType: 'シグニ', ...signiClauseStoryFilter(t), ...signiClauseIconFilter(t), ...signiClauseDisonaFilter(t),
        ...(/【チャーム】が付いているあなたの[^。、]*シグニ[０-９\d]+体(?:まで)?を対象とし/.test(t) ? { hasCharm: true } : {}),
        ...(kwTargetPossessionM ? { keyword: kwTargetPossessionM[1] } : {}),
        ...(kwTargetDrive ? { isDrive: true } : {}),
      };
      // 「あなたの〔中央|左|右〕のシグニゾーンにある[＜X＞の]シグニは【K】を得る」＝**ゾーン限定の全体付与**。
      // ⚠POWER_MODIFY 側には中央ゾーンの専用枝があるのに、付与側には**中央すら無く**全部が既定の
      //   `owner:'any'/count:1` へ潰れていた＝「中央ゾーンのシグニだけがランサー」が「どちらかのシグニ1体」に化け、
      //   CONTINUOUS では効果元自身へ解決される（`WX05-034`／`WX10-036`／`WX11-031`／`WD15-002`／
      //   `WXDi-P06-009`／`WXK10-078-E2`＝live も同じ穴）。ゾーンの語彙が入ったので3方向まとめて配線する。
      // 「（《アイコン》を持つ）あなたのすべての〈修飾〉シグニ(は|が)」＝**全体付与**（2026-08-22・§6.2 段2）。
      // ⚠既存の `kwAllSelf` は「あなたのシグニすべて／あなたのシグニは」形しか見ないので、
      //   **「すべての」と「シグニ」の間にクラス句・色句が挟まる**と全部の枝から外れて
      //   既定の `{owner:'any', count:1}` へ潰れていた＝**全体付与が「どちらかのシグニ1体」に化ける**
      //   （`WXEX1-26-E2`「あなたのすべての＜宇宙＞のシグニは【アサシン】と【ダブルクラッシュ】を得る」
      //   ／`WX25-CP1-005-E1`／`SP23-009-E1`）。しかも `owner:'any'` なので**相手のシグニにも付く**。
      // ⚠修飾語は**捕捉した span からだけ**読む（`kwSigniFilter` の全文スキャンを使うと
      //   条件節のレベル等を対象へ引き込む＝続き377c の教訓）。
      // ⚠**「あなたのすべての」の直前に置かれる限定句は `《X アイコン》を持つ` だけを読む**＝
      //   `signiClauseIconFilter` は「〜を対象とし」を要求するのでこの語形では使えない（合成しても常に空）。
      //   読めない限定句（`【チャーム】が付いている` 等）が前置されている文はこの枝から**降りる**
      //   ＝限定を落として `count:'ALL'` にすると**原文より広い全体付与**になり、
      //   従来の `count:1`（過小）より悪い方向へ倒れる。
      const kwAllSelfSpecM = t.match(/(《(?:ライズ|クロス|アクセ)アイコン》を持つ)?あなたのすべての((?:(?:＜[^＞]+＞[とかや]?)+の|[白赤青緑黒]の|《ディソナアイコン》の)*)シグニ(?:は|が)/);
      const kwAllSelfUnreadablePrefix = !!kwAllSelfSpecM
        && /(?:が付いている|を持つ|状態の|ではない)$/.test(t.slice(0, t.indexOf(kwAllSelfSpecM[0])) + (kwAllSelfSpecM[1] ?? ''))
        && !kwAllSelfSpecM[1];
      const kwAllSelfIconM = kwAllSelfSpecM?.[1]?.match(/《(ライズ|クロス|アクセ)アイコン》/);
      const kwAllSelfSpecFilter: TargetFilter | null = kwAllSelfSpecM && !kwAllSelfUnreadablePrefix
        ? {
            cardType: 'シグニ',
            ...parseStoryFilter(kwAllSelfSpecM[2]), ...parseColorFilter(kwAllSelfSpecM[2]),
            ...(kwAllSelfSpecM[2].includes('《ディソナアイコン》') ? { isDisona: true } : {}),
            ...(kwAllSelfIconM ? { hasIcon: kwAllSelfIconM[1] as NonNullable<TargetFilter['hasIcon']> } : {}),
          }
        : null;
      // 「あなたの（すべての）＜クラス＞のシグニは」も枚数選択ではなく集合主語。
      // 「N体を対象とし」は末尾が「は／が」ではないため拾わず、単体付与を全体化しない。
      // ドライブ状態は既存の TargetFilter.isDrive を使い、直前の「＜乗機＞のシグニに乗り」と混ぜない。
      const kwCollectiveSelfM = t.match(/あなたの(?:すべての)?(?:他の)?((?:(?:＜[^＞]+＞[とかや]?)+の|[白赤青緑黒]の|《ディソナアイコン》の|ドライブ状態の)+)シグニ(?:は|が)/);
      const kwCollectiveSelfFilter: TargetFilter | null = kwCollectiveSelfM
        ? {
            cardType: 'シグニ',
            ...parseStoryFilter(kwCollectiveSelfM[1]), ...parseColorFilter(kwCollectiveSelfM[1]),
            ...(kwCollectiveSelfM[1].includes('《ディソナアイコン》') ? { isDisona: true } : {}),
            ...(kwCollectiveSelfM[1].includes('ドライブ状態') ? { isDrive: true } : {}),
          }
        : null;
      const kwCollectiveSelfPronounM = t.match(/あなたの((?:(?:＜[^＞]+＞[とかや]?)+の|[白赤青緑黒]の|《ディソナアイコン》の|ドライブ状態の)+)シグニのパワーを[＋+－-][０-９\d,，]+し、それらは/);
      const kwCollectiveSelfPronounFilter: TargetFilter | null = kwCollectiveSelfPronounM
        ? {
            cardType: 'シグニ',
            ...parseStoryFilter(kwCollectiveSelfPronounM[1]), ...parseColorFilter(kwCollectiveSelfPronounM[1]),
            ...(kwCollectiveSelfPronounM[1].includes('《ディソナアイコン》') ? { isDisona: true } : {}),
            ...(kwCollectiveSelfPronounM[1].includes('ドライブ状態') ? { isDrive: true } : {}),
          }
        : null;
      // 「あなたのすべてのシグニのパワーを…し、それらは【K】を得る」の代名詞も同じ集合を指す。
      const kwAllSelfPronoun = /あなたのすべてのシグニ[^。]*、それらは【[^】]+】を(?:得る|持つ)/.test(t);
      const kwZoneM = t.match(/あなたの(中央|左|右)のシグニゾーンにある((?:《ディソナアイコン》の|(?:＜[^＞]+＞[とか])*＜[^＞]+＞の)*)シグニ/);
      const kwZoneFilter: TargetFilter | null = kwZoneM
        ? {
            cardType: 'シグニ',
            ...(kwZoneM[1] === '中央' ? { centerZoneOnly: true } : { zoneSide: kwZoneM[1] === '左' ? 'left' as const : 'right' as const }),
            ...parseStoryFilter(kwZoneM[2]), ...parseColorFilter(kwZoneM[2]),
            ...(kwZoneM[2].includes('《ディソナアイコン》') ? { isDisona: true } : {}),
          }
        : null;
      const target: EffectTarget = t.includes('エナゾーンにあるカード') || t.includes('エナゾーンのカード')
        ? { type: 'ENERGY_CARD', owner: 'self', count: 'ALL' }
        // 「このシグニは【X】を得る」＝**効果元自身**。thisCardOnly を落とすと engine は「自分のシグニ1体」の
        // 選択UIを出し、**別のシグニに付与できる**過剰対象化になる（WX24-P1-040-E2 のシャドウ付与＝タスク12(cix)）。
        // 「このシグニ」を含むが付与先が別体を指す文（「このシグニがアタックしたとき、あなたのシグニ1体は〜を得る」）
        // まで巻き込まないよう、**「このシグニは〜を得る/持つ」の隣接形**に限る。
        : /このシグニは[^。]*を(?:得る|持つ)/.test(t)
          ? { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }
        : t.includes('このシグニ') ? { type: 'SIGNI', owner: 'self', count: 1 }
        : t.includes('センタールリグ') ? { type: 'LRIG', owner: 'self', count: 1 }
        : kwZoneFilter ? { type: 'SIGNI', owner: 'self', count: 'ALL', filter: kwZoneFilter }
        : kwAllSelf ? { type: 'SIGNI', owner: 'self', count: 'ALL' }
        : kwAllSelfSpecFilter ? { type: 'SIGNI', owner: 'self', count: 'ALL', filter: kwAllSelfSpecFilter }
        : kwCollectiveSelfFilter ? { type: 'SIGNI', owner: 'self', count: 'ALL', filter: kwCollectiveSelfFilter }
        : kwCollectiveSelfPronounFilter ? { type: 'SIGNI', owner: 'self', count: 'ALL', filter: kwCollectiveSelfPronounFilter }
        : kwAllSelfPronoun ? { type: 'SIGNI', owner: 'self', count: 'ALL' }
        // ⚠**枚数付きの枝だけ filter を落としていた**（続き377c）＝下の `kwSelfSigni` 枝には
        //   `kwHasFilter` が付いているのに、先に当たる `kwCountSelfM`（「あなたのシグニ**N体**」）には無く、
        //   `WX15-070-E1`「《ライズアイコン》を持つあなたのシグニ１体を対象とし…【ダブルクラッシュ】を得る」で
        //   **どのシグニにも付与できる**過剰効果になっていた。枝ごとの取りこぼしは同じ関数内でも起きる。
        : kwCountSelfM ? { type: 'SIGNI', owner: 'self', count: parseNum(kwCountSelfM[1]), ...(Object.keys(kwCountSelfFilter).length > 1 ? { filter: kwCountSelfFilter } : {}) }
        : kwSelfSigni ? { type: 'SIGNI', owner: 'self', count: 1, ...(kwHasFilter ? { filter: kwSigniFilter } : {}) }
        : kwOppSigni ? { type: 'SIGNI', owner: 'opponent', count: 1, ...(kwHasFilter ? { filter: kwSigniFilter } : {}) }
        : { type: 'SIGNI', owner: 'any', count: 1, ...(kwHasFilter ? { filter: kwSigniFilter } : {}) };
      // 「（あなた|対戦相手）の〈修飾〉シグニをN体まで対象とし」＝**対象名詞句そのもの**から所有者・体数・上限を取る（続き377n）。
      // ⚠上の枝はどれも「あなたのシグニ」の**隣接形**（色句・クラス句）しか見ないので、`WXDi-P00-004-E1`
      //   「あなたの**パワー１５０００以上の**シグニを２体まで対象とし…【ランサー】を得る」は
      //   ①`owner:'any'` 既定へ潰れて**対戦相手のシグニにも付与できた** ②「２体まで」が `count:1` に化けた
      //   ③パワー条件が丸ごと落ちた、の三重のズレになっていた（`kwSigniFilter` に `parsePowerFilter` が無い）。
      //   `signiClauseTargetSpec` は修飾語 span に別の所有者トークンを跨がせないので【使用条件】節を巻き込まない。
      const kwSpec = signiClauseTargetSpec(t);
      // 所有者は**既定の 'any' へ潰れたときだけ**上書きする（既存の枝が決めた所有者は動かさない）。
      const kwSpecOwnerOk = kwSpec && target.type === 'SIGNI' && target.owner === 'any'
        && !kwAllSelf && !kwAllSelfSpecFilter && !kwZoneFilter && !target.filter?.thisCardOnly;
      // 体数・上限は「N体まで」が対象句に隣接しているときだけ。count:'ALL' の全体付与には触らない。
      // ⚠体数は**対象句の所有者と枝の所有者が一致するときだけ**上書きする＝食い違うのは
      //   「対象句と付与句が別の action に属している」誤parseの徴候で、そこで体数だけ広げると
      //   `WXK05-052-E1`（対象は「対戦相手のシグニを２体まで」だが枝は条件節の【シード】を自分へ付与と誤読）で
      //   **誤りを2体ぶんに増幅する**（続き377b の「枚数だけ先に直さない」と同じ判断）。
      const kwSpecCountOk = kwSpec && target.type === 'SIGNI' && target.count === 1 && !target.filter?.thisCardOnly
        && (target.owner === 'any' || target.owner === kwSpec.owner);
      // ⚠**既に枝が決めたキーは上書きしない**（追加だけ）＝`signiClause*Filter` は隣接する**1つ**しか返さないので、
      //   「＜空獣＞か＜地獣＞のシグニ」の OR（`story:["空獣","地獣"]`）を最後の1クラスへ潰してしまう
      //   （実測 A/B で `WX02-055-E1`／`WX04-069-E1`／`WX05-041-E1`／`WX19-042-E1`／`WX19-070-E1`／`WXEX2-43-E1` が退化）。
      const kwSpecFilterRaw: TargetFilter = kwSpec
        ? { ...signiClausePowerFilter(t), ...signiClauseLevelFilter(t), ...signiClauseStoryFilter(t), ...signiClauseIconFilter(t), ...signiClauseDisonaFilter(t),
            ...(kwTargetPossessionM ? { keyword: kwTargetPossessionM[1] } : {}),
            ...(kwTargetDrive ? { isDrive: true } : {}) }
        : {};
      const kwSpecFilter: TargetFilter = Object.fromEntries(
        Object.entries(kwSpecFilterRaw).filter(([k]) => (target.filter as Record<string, unknown> | undefined)?.[k] === undefined),
      ) as TargetFilter;
      const targetWithSpec: EffectTarget = kwSpec && (kwSpecOwnerOk || kwSpecCountOk)
        ? {
            ...target,
            ...(kwSpecOwnerOk ? { owner: kwSpec.owner } : {}),
            ...(kwSpecCountOk ? { count: kwSpec.count, ...(kwSpec.upToCount ? { upToCount: true } : {}) } : {}),
            ...(Object.keys(kwSpecFilter).length > 0
              ? { filter: { ...(target.filter ?? {}), ...kwSpecFilter } }
              : {}),
          }
        : target;
      // 「あなたの他のシグニ1体を対象とし」＝効果元シグニ自身を対象から除外（WXDi-P11-040）。
      // 未表現だと他に味方シグニが居ないとき自分自身に付与される（続き72の実機観測・続き75で engine の
      // excludeSelf 実装とセットで修正）。対象節に隣接する「他の」だけを見る（他 action の「他のシグニ」に反応しない）。
      // 「のうち最も…シグニ」等の超上級句が「シグニ」と「を対象とし」の間に挟まる形（WX25-CP1-051）も narrow に拾う。
      const kwExcludeSelf = hasOtherSelfSigniNoun(t) && (/シグニ[^。、]*を対象とし/.test(t) || !!kwAllSelf)
        || /(?:あなた|対戦相手)の他の[^。、]*シグニのうち最も[^。、]*を対象とし/.test(t);
      const kwTarget0: EffectTarget = kwExcludeSelf && targetWithSpec.type === 'SIGNI'
        ? { ...targetWithSpec, filter: { ...(targetWithSpec.filter ?? {}), excludeSelf: true } }
        : targetWithSpec;
      // 「あなたの＜X＞のシグニは…」は個体選択でなく場全体への叙述。次ターン予約では
      // 解決時点の1体へ固定せず、active 時の盤面へ毎回 filter を掛ける。
      const kwTarget: EffectTarget = dur === 'NEXT_TURN' && kwTarget0.type === 'SIGNI'
        && kwTarget0.owner === 'self' && kwTarget0.count === 1
        && !/シグニ[０-９\d]+体/.test(t) && !/を対象とし/.test(t)
        ? { ...kwTarget0, count: 'ALL' }
        : kwTarget0;
      // 同じ集合主語を明示して「全体のパワー±N、全体は【K】を得る」と続く形は2ステップ。
      // 「それらは」の別文型へは広げず、左右の修飾句が文字どおり一致する場合だけ合成する。
      const collectiveModifier = String.raw`((?:(?:＜[^＞]+＞[とかや]?)+の|[白赤青緑黒]の|《ディソナアイコン》の)*)`;
      const collectivePowerM = t.match(new RegExp(
        `あなたのすべての${collectiveModifier}シグニのパワーを([＋+－-])([０-９\\d,]+)し、あなたのすべての\\1シグニは`,
      ));
      const withCollectivePower = (grant: EffectAction): EffectAction => {
        const activePower = activeRenyoPower();
        if (!collectivePowerM && !activePower) return grant;
        if (collectivePowerM) {
          if (kwTarget.type !== 'SIGNI' || kwTarget.owner !== 'self' || kwTarget.count !== 'ALL') return grant;
          const filter: TargetFilter = {
            cardType: 'シグニ',
            ...parseStoryFilter(collectivePowerM[1]), ...parseColorFilter(collectivePowerM[1]),
            ...(collectivePowerM[1].includes('《ディソナアイコン》') ? { isDisona: true } : {}),
          };
          if (JSON.stringify(filter) !== JSON.stringify(kwTarget.filter ?? { cardType: 'シグニ' })) return grant;
        }
        const magnitude = collectivePowerM ? parseNum(collectivePowerM[3].replace(/,/g, '')) : 0;
        const delta = activePower?.delta
          ?? (collectivePowerM![2] === '＋' || collectivePowerM![2] === '+' ? magnitude : -magnitude);
        const duration = activePower?.duration ?? dur;
        const selectable = typeof kwTarget.count === 'number' && !kwTarget.filter?.thisCardOnly;
        const boundGrant = grant.type === 'GRANT_KEYWORD' && selectable
          ? { ...grant, targetsLastProcessed: true }
          : grant;
        return {
          type: 'SEQUENCE',
          steps: [
            { type: 'POWER_MODIFY', target: kwTarget, delta, duration },
            boundGrant,
          ],
        };
      };
      const fieldCondition = /その正面のシグニに【[^】]+】が付いているかぎり/.test(t)
        ? { type: 'FRONT_SIGNI_HAS_CHARM' as const }
        : undefined;
      const nextTurnOwner = nextOpponentTurn ? 'opponent' as const : nextGlobalTurn ? 'next' as const : undefined;
      // 「【X】と【Y】を得る」「【X】【Y】を持つ」複合付与 → SEQUENCE
      // 「を得る/を持つ」直前に隣接するキーワード連続（と/・接続のみ）に限定し、
      // 文境界を跨いだ無関係キーワードの巻き込みを防ぐ
      const gainM = t.match(/((?:【[^】]+】[と・]*)+)を(?:得る|持つ)/);
      if (gainM) {
        const runKw = [...gainM[1].matchAll(/【([^】]+)】/g)]
          .map(m => m[1])
          .filter(k => !['常','出','起','自','ガード'].includes(k));
        if (runKw.length >= 2) {
          const kwSteps = runKw.map(k => ({
            type: 'GRANT_KEYWORD', target: kwTarget, keyword: k, duration: dur,
            ...(nextTurnOwner ? { nextTurnOwner } : {}),
            ...(thisAndNextTurn ? { appliesThisTurn: true } : {}),
            ...(fieldCondition ? { fieldCondition } : {}),
          }));
          // 🔴**「１体を対象とし、それは【A】と【B】を得る」は同一の1体が両方を得る**（2026-08-22・§6.2 段2）。
          //   従来は N 本の GRANT_KEYWORD を素で並べていたので、対象が**選択**のときは
          //   **1体目に【A】・2体目に【B】と別々のシグニへ付けられた**（＝原文の「それ」が分裂する）。
          //   ⚠engine 側は既に道具が揃っている＝正準形
          //   `SELECT_TARGET_ONLY → STORE_LAST_PROCESSED_TARGETS → 〈付与〉{targetsStored}`
          //   （`rewriteAttackTaxKeywordGrant` と同じ組み立て。`execGrantKeyword` は `targetsStored` を
          //   候補フィルタに使い、選択UIを出さず storedTargetCards の同一対象へ付ける）。
          //   ⚠**選択が発生しない形はそのまま**＝`count:'ALL'`（場全体への叙述）と `thisCardOnly`
          //   （効果元自身）は対象集合が一意なので、宣言ステップを挟むと**無駄な対話が増えるだけ**。
          //   ⚠`SELECT_TARGET_ONLY` が扱えるのは SIGNI / LRIG / CENTER_LRIG_OR_SIGNI だけ
          //   （取りこぼすと `lastProcessedCards: []` → STORE が空 → 本体が丸ごと no-op になる）。
          const kwSelectable = typeof kwTarget.count === 'number'
            && !kwTarget.filter?.thisCardOnly
            && (kwTarget.type === 'SIGNI' || kwTarget.type === 'LRIG' || kwTarget.type === 'CENTER_LRIG_OR_SIGNI');
          if (kwSelectable) {
            return {
              type: 'SEQUENCE',
              steps: [
                { type: 'STUB', id: 'SELECT_TARGET_ONLY', selectTarget: kwTarget },
                { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' },
                ...kwSteps.map(st => ({ ...st, targetsStored: true })),
              ],
            } as EffectAction;
          }
          return { type: 'SEQUENCE', steps: kwSteps } as EffectAction;
        }
      }
      return withCollectivePower({
        type: 'GRANT_KEYWORD', target: kwTarget, keyword: kwGrantName, duration: dur,
        ...(nextTurnOwner ? { nextTurnOwner } : {}),
        ...(thisAndNextTurn ? { appliesThisTurn: true } : {}),
        ...(fieldCondition ? { fieldCondition } : {}),
      });
    }
  }

  // ---- 【ガード】キーワード（説明文はスキップ）----
  if (t.startsWith('【ガード】')) {
    return { type: 'UNKNOWN', raw: '【ガード】（ルール処理済み）' };
  }

  // ---- アーツ使用禁止 ----
  // ⚠期間判定は `blockUntilFromText` に一本化した（§6.4 O-3 続き459）＝ここの旧実装は
  //   `次のターン` しか見ておらず、**「次の**あなたの**ターンまで」が `PERMANENT` へ倒れて恒久ロック**
  //   になっていた（`WXEX1-66-E1`＝一度アタックするとそのゲーム中ずっと相手がスペルを使えない）。
  if (t.match(/対戦相手はアーツを使用できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'USE_ARTS', until: blockUntilFromText(t) };
  }

  // ---- スペル使用禁止（対戦相手 or 自分）----
  if (t.match(/対戦相手はスペルを使用できない/)) {
    // ⚠「このターン、」の判定が抜けており **恒久のスペルロック**（PERMANENT）に化けていた（WXK10-002②）。
    //   すぐ上の USE_ARTS 側と同じ判定関数に揃える。
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'USE_SPELL', until: blockUntilFromText(t) };
  }
  if (t.match(/このターン、あなたはスペルを使用できない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'USE_SPELL', until: 'END_OF_TURN' };
  }

  // ---- エナフェイズスキップ（対戦相手）----
  if (t.match(/対戦相手は自分のエナフェイズをスキップする/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'ENERGY', until: 'NEXT_TURN' };
  }

  // ---- このシグニはアタックできない（CONTINUOUS）----
  if (t.match(/このシグニはアタックできない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'self', count: 1 }, actionId: 'ATTACK_SIGNI_SELF', until: 'PERMANENT' };
  }

  // ---- ライフクロス → トラッシュ ----
  // 「ライフクロスがN枚…」（が形）は条件節（「3枚以上ある場合、代わりに」「0枚の場合」等）＝
  // ここで自傷クラッシュに誤変換しない（WXDi-CP02-007: 3 が count に化けていた／WX24-P4-014: 0枚の場合）。
  // 行為形は「ライフクロス（を）N枚を…」のみ。
  if ((t.match(/ライフクロス.*トラッシュに置く/) || t.match(/ライフクロス.*を捨てる/))
      && !t.match(/ライフクロスが[０-９\d]+枚/)) {
    // owner: 「対戦相手の/はライフクロス…」は相手側（WXDi-P16-004/WD23-023-E で self 化＝自傷の誤り）
    const owner = /対戦相手[のはが][^。、]{0,4}ライフクロス/.test(t) ? 'opponent' as const : 'self' as const;
    // count は「ライフクロス（を）N枚」の直結形のみ（文中の無関係な数値を拾わない）
    const cM = t.match(/ライフクロスを?([０-９\d]+)枚/);
    return { type: 'LIFE_CRASH', owner, count: cM ? parseNum(cM[1]) : 1, triggerBurst: false };
  }

  // ---- 手札をすべて捨てる ----
  if (t.match(/手札をすべて捨てる/) || t.match(/手札を全て捨てる/)) {
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL' } };
  }

  // ---- このシグニを場からトラッシュに置く（自己トラッシュ）----
  // 条件節や別対象の修飾を読む汎用規則より先に、対象名詞句だけで効果元自身へ固定する。
  // 「それとこのシグニ」（二対象）と「Aか、このシグニ」（二択）は別機構なので先取りしない。
  const isPlainTrashThis = /^このシグニを場からトラッシュに置く/.test(t);
  const isLrigConditionTrashThis = /センタールリグが[^。]+の場合、このシグニを場からトラッシュに置く/.test(t);
  const isPublicZoneConditionTrashThis = /公開領域に[^。]+がある場合、このシグニを場からトラッシュに置く/.test(t);
  if ((isPlainTrashThis || isLrigConditionTrashThis || isPublicZoneConditionTrashThis)
      && !t.includes('それとこのシグニ')
      && !/か、このシグニを場からトラッシュに置く/.test(t)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } } };
  }

  // ---- 自分のシグニを場からトラッシュ（ストーリー・色フィルタ付き）----
  if (t.match(/あなたの.+シグニ.+場からトラッシュに置く/) && !t.includes('対戦相手')) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t) };
    const upToM = t.match(/好きな数/);
    const allM = t.match(/すべての/); // 「あなたのすべてのシグニを場からトラッシュに置く」＝全数（続き107・SP24-009）
    const cM = t.match(/([０-９\d]+)体/);
    const count = (upToM || allM) ? 'ALL' : (cM ? parseNum(cM[1]) : 1);
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count, filter } };
  }

  // ---- 各プレイヤーは自分のシグニをトラッシュ ----
  if (t.match(/各プレイヤーは自分のシグニ.*トラッシュに置く/)) {
    return { type: 'SEQUENCE', steps: [
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1 } },
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } },
    ] };
  }

  // ---- ライフクロス → 手札 ----
  if (t.match(/ライフクロス/) && t.match(/手札に加える/)) {
    const cM = t.match(/([０-９\d]+)枚/);
    return { type: 'TRANSFER_TO_HAND', source: { type: 'LIFE_CLOTH_CARD', owner: 'self', count: cM ? parseNum(cM[1]) : 1 } };
  }

  // ---- このシグニを手札に加える（自己バウンス）----
  if (t.match(/このシグニを手札に加える/)) {
    return { type: 'BOUNCE', target: { type: 'SIGNI', owner: 'self', count: 1 } };
  }

  // ---- パワー閾値トリガー後の「これをトラッシュに置く」（WX09-019）----
  // 完全文一致に限定し、別対象を指す一般の「これ」には波及させない。
  if (/^これをトラッシュに置く$/.test(t)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } } };
  }

  // ---- 自分のすべてのシグニをトラッシュ（任意）----
  if (t.match(/あなたのすべてのシグニを場からトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL' } };
  }

  // ---- 自分の（XかYの）シグニを好きな数トラッシュ ----
  if (t.match(/あなたの(?:.+の)?シグニを好きな数対象とし.*トラッシュに置く/)) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t) };
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 'ALL', upToCount: true, filter } };
  }

  // ---- 場のアシストルリグ最上段だけをルリグデッキに戻す ----
  const teamAssistReturnM = t.match(/^あなたの＜([^＞]+)＞のレベル([０-９\d]+)のルリグ１体を対象とし、それをルリグデッキに戻す$/);
  if (teamAssistReturnM) {
    return {
      type: 'RETURN_ASSIST_LRIG_TO_DECK',
      team: teamAssistReturnM[1],
      level: parseNum(teamAssistReturnM[2]),
    };
  }
  if (/持たずグロウコストが《無×0》ではないあなたのアシストルリグ１体を対象とし、それをルリグデッキに戻す$/.test(t)) {
    return {
      type: 'RETURN_ASSIST_LRIG_TO_DECK',
      withoutAttackPhaseIcon: true,
      excludeColorlessZeroGrowCost: true,
    };
  }

  // アシストルリグのアタック（§6.4 A群・続き427 で実装）。数字は**レベルの下限**なので `count` ではなく
  // `minLevel` に載せる（`count` だと「N体までアタックできる」と読めてしまう）。
  const assistAttackM = t.match(/^このターン、あなたはレベル([０-９\d]+)以上のアシストルリグでアタックできる$/);
  if (assistAttackM) {
    return { type: 'STUB', id: 'ASSIST_LRIG_ATTACK_THIS_TURN', minLevel: parseNum(assistAttackM[1]) } as StubAction;
  }

  // チェックゾーンのピースを裏返して無償グロウする（`WXDi-P16-001A`・§6.4 O-10 続き515 で defer 解体）。
  // 🔑**旧・据置理由「B面が CardData CSV に無い」は古かった**＝`WXDi-P16-001B`（ルリグ Lv4）は
  //   `CardData_TK.csv` に入っている。前提は着手のたびに grep で確かめる。
  // ⚠**グロウ先はカード名で載せる**（CardNum は原文に無い）＝engine 側が `cardMap` から
  //   Type='ルリグ' で解決する。engine で原文を再パースしない規約は守れている。
  {
    const flipGrowM = t.match(/^このターンにあなたのセンタールリグがグロウしていない場合、チェックゾーンにあるこのカードを裏返し、あなたのセンタールリグはこの《([^》]+)》にグロウコストを支払わずにグロウする$/);
    if (flipGrowM) {
      return { type: 'STUB', id: 'CHECK_ZONE_FLIP_FREE_GROW', value: flipGrowM[1] } as StubAction;
    }
  }

  // ---- ドロー後、このアーツ/カードをルリグデッキに戻す ----
  const drawReturnSelfM = t.match(/^カードを([０-９\d]+)枚引き、この(?:アーツ|カード)を(?:あなたの)?ルリグデッキに戻す$/);
  if (drawReturnSelfM) {
    return {
      type: 'SEQUENCE',
      steps: [
        { type: 'DRAW', owner: 'self', count: parseNum(drawReturnSelfM[1]) },
        { type: 'STUB', id: 'RETURN_SELF_ARTS_TO_LRIG_DECK' } as StubAction,
      ],
    } as SequenceAction;
  }

  // ---- このアーツ/カードをルリグデッキに戻す（使用後＝ルリグトラッシュから自身を戻す）----
  // ⚠下のシグニ用規則より先に取らないと場のシグニ移動へ幻覚化する
  if (t.match(/^この(?:アーツ|カード)を(?:あなたの)?ルリグデッキに戻す$/)) {
    return { type: 'STUB', id: 'RETURN_SELF_ARTS_TO_LRIG_DECK' } as StubAction;
  }

  // ---- シグニをデッキに戻す ----
  // 対象シグニが文中で明示される形だけを扱う。「残りを戻す」等を SIGNI に丸めない。
  const signiToDeck =
    /シグニ１体を対象とし、(?:それ|それら)を(?:対戦相手の)?デッキに戻[すし]/.test(t) ||
    /(?:すべての)?シグニを(?:対戦相手の)?デッキに戻[すし]/.test(t);
  if (signiToDeck) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(t), ...parseStateFilter(t), ...parseNoAbilitiesFilter(t) };
    return { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner, count: 1, filter }, shuffle: false } as TransferToDeckAction;
  }

  // ---- デッキの一番上を公開する（単独文） ----
  {
    const deckTopM = t.match(/^(?:あなたの|対戦相手の)?デッキの一番上を公開する$/);
    if (deckTopM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'deck', owner },
        count: 1,
        private: false,
        reorder: false,
        destination: { location: 'deck', owner, position: 'top' },
      };
    }
  }

  // ---- それ/それら/これ/そのカードを手札に加える ----
  if (t.match(/^(?:それら?を|これを|そのカードを)?手札に加える$/)) {
    return { type: 'TRANSFER_TO_HAND', source: { type: 'DECK_CARD', owner: 'self', count: 1 } };
  }
  // ---- それ/それらをエナゾーンに置く（REVEAL後の処理）----
  if (t.match(/^それら?をエナゾーンに置く$/)) {
    return { type: 'ENERGY_CHARGE', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } as EnergyChargeAction;
  }
  // ---- それを場からトラッシュに置く ----
  // ⚠BANISH ではない: バニッシュ＝エナ送り／トラッシュに置く＝トラッシュ送り（行き先も誘発も別・続き19是正）
  if (t.match(/^それを場からトラッシュに置く$/) || t.match(/^それをトラッシュに置く$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'any', count: 1 } };
  }
  // ---- それらを場からトラッシュに置く ----
  if (t.match(/^それらを場からトラッシュに置く$/) || t.match(/^それらをトラッシュに置く$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'any', count: 'ALL' } };
  }

  // ---- 残りをシャッフルして/好きな順番でデッキへ（LOOK/REVEALの後続フラグメント）----
  if (t.match(/^残りをシャッフルして(?:デッキの一番下に置く|デッキに戻す)/)) {
    return { type: 'SHUFFLE_DECK', owner: 'self' };
  }
  if (t.match(/^残りを好きな順番でデッキの一番下に置く/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 0,
      private: true,
      reorder: true,
      destination: { location: 'deck', owner: 'self', position: 'bottom' },
    };
  }
  if (t.match(/^残りをデッキの一番下に置く/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: 0,
      private: true,
      reorder: false,
      destination: { location: 'deck', owner: 'self', position: 'bottom' },
    };
  }

  // ---- デッキ上公開 / 見る（単独 or シャッフル付き）----
  // ⚠「N枚公開し、その中から〜」の1文畳み形は pick まで含めて part4 が REVEAL_AND_PICK に解く。
  //   ここで掴むと公開だけが残り **pick が丸ごと no-op** になる（タスク12(xlvi)(c)）。
  if (/^あなたのデッキの上からこの方法でトラッシュに置いたシグニのレベルと同じ枚数のカードを見る$/.test(t)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: { $ref: 'last_processed_level' },
      private: true,
      reorder: false,
      destination: { location: 'deck', owner: 'self', position: 'top' },
    };
  }
  const deckLookM = fusedLookPickSentence(t) ? null : t.match(/デッキの上からカードを([０-９\d]+)枚(?:公開する|見る|公開し)/);
  if (deckLookM) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: parseNum(deckLookM[1]),
      private: !t.includes('公開'),
      reorder: t.includes('好きな順番'),
      canTrash: t.includes('トラッシュに置き') || t.includes('トラッシュに置いてもよい'),
      destination: { location: 'deck', owner: 'self', position: 'top' },
    };
  }

  // ---- それをトラッシュに置く（コンテキスト依存）----
  if (t.match(/^それをトラッシュに置く/) || t.match(/^それらをトラッシュに置く/)) {
    const all = t.includes('それら');
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: all ? 'ALL' : 1 } };
  }

  // ---- デッキをシャッフルする（単独）----
  if (t.match(/デッキをシャッフルする|自分のデッキをシャッフルする/)) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    return { type: 'SHUFFLE_DECK', owner };
  }

  // ---- 手札から〈カード種別〉をN枚捨てる（クラス指定なし・「てもよい」形も含む）----
  // ⚠**種別は「シグニ」だけではない**（続き434）＝「手札から**スペル**を１枚捨てる／捨ててもよい」が
  //   規則に無く `UNKNOWN` へ落ちていた。**任意コスト（「てもよい」）で落ちると本体だけが無条件に走る**
  //   ＝`WX24-P1-065-E1`② は**コストなしで相手の手札を1枚落とし**、`WXEX2-20-E3` も同型だった（過剰効果）。
  // ⚠「てもよい」形はここで素の `TRASH{HAND_CARD}` を出すのが正解＝後段の `applyOptionalHandDiscardCost`
  //   が「そうした場合」の隣接を見て `STUB{OPTIONAL_COST, handDiscard}` へ畳む（続き416 の設計）。
  //   ここで直接 OPTIONAL_COST を作ると、その畳み込みの前提（素の TRASH を探す）を壊す。
  {
    const m = t.match(/^手札から(シグニ|スペル|アーツ|カード)を([０-９\d]+)枚捨て(?:る|てもよい)$/);
    if (m) {
      const filter: TargetFilter | undefined = m[1] === 'カード' ? undefined : { cardType: m[1] as TargetFilter['cardType'] };
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(m[2]), ...(filter ? { filter } : {}) } };
    }
  }

  // ---- 手札から<X>のシグニを１枚捨てる（コスト・追加コスト）----
  const handDiscardStoryM = t.match(/^手札から.+シグニ.+捨てる$/);
  if (handDiscardStoryM) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseStoryFilter(t), ...parseColorFilter(t) };
    const cM = t.match(/([０-９\d]+)枚/);
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cM ? parseNum(cM[1]) : 1, filter } };
  }

  // ---- デッキの一番上のカードをエナゾーンに加える（単独）----
  // 「場のシグニ1体につき…」は動的回数（part3）に委譲する。
  if (!t.includes('体につき') && t.match(/デッキの一番上のカードをエナゾーンに(?:加える|置く)/)) {
    return { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 };
  }

  // ---- 対戦相手のシグニをトラッシュに置く（対戦相手が対象を選ぶパターン）----
  if (t.match(/対戦相手は.*自分のシグニ.*トラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } };
  }

  // ---- デッキからサーチしてトラッシュへ ----
  if (t.includes('デッキから') && t.includes('探して') && t.includes('トラッシュに置く')) {
    const filter: TargetFilter = { cardType: 'シグニ', ...parseLevelFilter(t), ...parseStoryFilter(t) };
    return { type: 'SEARCH', from: { location: 'deck', owner: 'self' }, filter, maxCount: 1, then: { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 1 } } };
  }

  // ---- シグニの【出】能力の発動を止める ----
  if (t.match(/シグニの【出】能力は発動しない/)) {
    const owner: Owner = signiClauseOwner(t);
    return { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner, count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' };
  }
  // ---- この方法で場に出たシグニの【出】能力は発動しない ----
  if (t.match(/この方法で場に出たシグニの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' };
  }

  // ---- このシグニの基本レベルはNになる（自身の基本レベル変更）----
  // engine 実行可能な SET_BASE_LEVEL（effectExecutor が ctx.sourceCardNum に適用）。
  // 「ターン終了時まで」=【起】等の一時変更（until:END_OF_TURN）／無指定=【常】の恒常上書き（cardMap）。
  // 「を…にする」形（対象指定の他シグニ）は engine が source 以外へ適用できないため下の BLOCK_ACTION 近似のまま。
  const selfBaseLevelM = t.match(/このシグニの基本レベルは([０-９\d]+)になる/);
  if (selfBaseLevelM) {
    // 現データの該当は全て【起】の一時変更（「ターン終了時まで」は duration 側で除去済みのためここでは検出不可）。
    // until:END_OF_TURN で attack_phase_level_overrides に反映（旧 BLOCK_ACTION 近似も END_OF_TURN 既定だった）。
    // 恒常【常】（WX04-049）は manualEffects 側で until 無し SET_BASE_LEVEL を持つためここには来ない。
    return { type: 'SET_BASE_LEVEL', target: { type: 'SIGNI', owner: 'self', count: 1 }, value: parseNum(selfBaseLevelM[1]), until: 'END_OF_TURN' };
  }

  // ---- 基本レベルをNにする ----
  const baseLevelM = t.match(/基本レベルは([０-９\d]+)になる/) ?? t.match(/基本レベルを([０-９\d]+)にする/);
  if (baseLevelM) {
    const owner: Owner = signiClauseOwner(t);
    const until: BlockActionAction['until'] = t.includes('次のターン') ? 'NEXT_TURN' : 'END_OF_TURN';
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner, count: t.includes('すべて') || t.includes('場にあるシグニ') ? 'ALL' : 1 }, actionId: `SET_LEVEL_${toHalf(baseLevelM[1])}`, until };
  }

  // ---- このシグニはバニッシュされない（耐性）----
  if (t.match(/バニッシュされない/)) {
    const from: string[] = [];
    if (t.includes('シグニの効果')) from.push('シグニ');
    if (t.includes('ルリグの効果') || t.includes('ルリグによって')) from.push('ルリグ');
    if (t.includes('スペルの効果') || t.includes('スペルによって')) from.push('スペル');
    if (t.includes('アーツの効果') || t.includes('アーツによって')) from.push('アーツ');
    if (from.length === 0) from.push('BANISH');
    // 🔴**軸（BANISH）を落として種別トークンだけを置くと保護範囲が広がりすぎる**（続き377l）＝
    //   `from:['シグニ']` は `collectEffectImmuneSigni` が拾う「**対戦相手のシグニの効果を（何であれ）
    //   受けない**」の表現で、原文「対戦相手のシグニの効果によって**バニッシュ**されない」より広い。
    //   正しい形は `from:['BANISH']` ＋ `bySourceType`（＝`collectBanishBySourceProtectedSigni` が
    //   解決中ソースの種別を見てバニッシュ軸だけ保護する）で、**live 10枚は既にその形**＝parser だけが退化していた
    //   （`WXK01-094/096/099`／`WXK04-064`／`WXK08-036`／`WDK07-Y17`／`WDK17-015`／`WXDi-P03-074`／
    //   `WXDi-P10-046`／`WXDi-CP01-038`）。⚠`bySourceType` は単数なので**種別が1つだけ**名指された形に限る。
    const bySourceType = from.length === 1 && from[0] !== 'BANISH'
      ? from[0] as 'シグニ' | 'ルリグ' | 'スペル' | 'アーツ'
      : undefined;
    if (bySourceType) { from.length = 0; from.push('BANISH'); }
    // 段2 第43バッチ：集合主語のBANISH耐性。target:{self,count:1} は collector の慣例で
    // 効果元自身だけを守るため、「あなたの《名称》／レゾナ／レベルNのシグニは」を subjectFilter へ落とす。
    // 「このシグニは」や明示対象付きの付与文は従来どおり下の単体経路へ残す。
    const namedBanishSubject = t.match(/あなたの《([^》]+)》は(?:対戦相手の[^。]*)?バニッシュされない/);
    const levelBanishSubject = t.match(/あなたのレベル([０-９\d]+)のシグニは(?:対戦相手の[^。]*)?バニッシュされない/);
    const resonaBanishSubject = /あなたのレゾナは(?:対戦相手の[^。]*)?バニッシュされない/.test(t);
    const collectiveSubjectFilter: TargetFilter | undefined = namedBanishSubject
      ? { cardType: 'シグニ', cardName: namedBanishSubject[1] }
      : levelBanishSubject
        ? { cardType: 'シグニ', level: parseNum(levelBanishSubject[1]) }
        : resonaBanishSubject
          ? { cardType: 'レゾナ' }
          : undefined;
    if (collectiveSubjectFilter) {
      return {
        type: 'GRANT_PROTECTION',
        ...(bySourceType ? { bySourceType } : {}),
        subjectFilter: collectiveSubjectFilter,
        subjectOwner: 'self',
        from,
        sourceOwner: /対戦相手の[^。]*(?:効果|能力)[^。]*バニッシュされない/.test(t) ? 'opponent' : 'any',
        duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    // 「あなたの（すべての／他の）＜CLASS＞のシグニは…」は、対象を取る1体付与ではなく
    // フィルタ一致集合への保護宣言。引用内の「次にバニッシュされる場合」は1回消費の別語彙が
    // GrantProtectionAction に無いため、恒久耐性へ広げず従来形を維持する。
    // 「N体を対象とし」は引用能力を選択対象へ付与する別系統なので、集合宣言へ巻き込まない。
    const classM = t.match(/あなたの(?:すべての)?(?:他の)?＜([^＞]+)＞のシグニは/);
    const isOneShotBanishProtection = /次にバニッシュされる場合/.test(t);
    const hasExplicitSigniTargets = /シグニ[０-９\d]+体(?:まで)?を対象とし/.test(t);
    if (classM && !isOneShotBanishProtection && !hasExplicitSigniTargets) {
      return {
        type: 'GRANT_PROTECTION',
        ...(bySourceType ? { bySourceType } : {}),
        subjectFilter: {
          cardType: 'シグニ', story: classM[1],
          ...(hasOtherSelfSigniNoun(t) ? { excludeSelf: true } : {}),
        },
        subjectOwner: 'self',
        from,
        sourceOwner: /対戦相手の[^。]*(?:効果|能力)[^。]*バニッシュされない/.test(t) ? 'opponent' : 'any',
        duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    // 🆕**§5.3 `O-66`②：主語が**裸の「シグニは」**（所有者も指示語も付かない）＝**両プレイヤーのシグニ**
    //   （`WXEX2-44-E1`「【常】：対戦相手のメインフェイズの間、シグニはバニッシュされない。」）。
    // ⚠下の `owner:'self', count:1` へ落とすと**宣言元自身だけ**に潰れる（原文の範囲の 1/6）。
    //   判定は直前の1文字だけを見る＝「あなたのシグニは」「このシグニは」「＜X＞のシグニは」はすべて
    //   直前が「の」なので除外される（文頭・読点直後の「シグニは」だけが裸の主語）。
    if (/(?:^|[、,。])シグニは/.test(t) && !isOneShotBanishProtection && !hasExplicitSigniTargets) {
      return {
        type: 'GRANT_PROTECTION',
        ...(bySourceType ? { bySourceType } : {}),
        target: { type: 'SIGNI', owner: 'any', count: 'ALL' },
        from,
        sourceOwner: /対戦相手の[^。]*(?:効果|能力)[^。]*バニッシュされない/.test(t) ? 'opponent' : 'any',
        duration: 'PERMANENT',
      } as GrantProtectionAction;
    }
    return {
      type: 'GRANT_PROTECTION',
      ...(bySourceType ? { bySourceType } : {}),
      // ⚠ここは signiClauseOwner を使わない：本形の大半は「このシグニは**対戦相手の効果によって**
      //   バニッシュされない」＝文中の「対戦相手」は**バニッシュの主体**であって対象の所有者ではない。
      //   helper に委ねると自己保護が相手シグニへの付与に反転する（WX06-022/WX13-049/WXK01-039 等26枚）。
      //   「＜空獣＞のシグニ1体を対象とし、それは「【常】：バニッシュされない」を得る」形（WX21-015/
      //   WXK07-028）は引用能力付与の別系統＝タスク12(lii) の対象外として据置。
      target: { type: 'SIGNI', owner: 'self', count: 1, ...(hasOtherSelfSigniNoun(t) ? { filter: { excludeSelf: true } } : {}) },
      from,
      // 「対戦相手の効果によって」等が明記された形だけ相手限定。
      // 単なる「バニッシュされない」は効果の発生源オーナーを問わない（バトル／ルール処理は別経路）。
      sourceOwner: /対戦相手の[^。]*(?:効果|能力)[^。]*バニッシュされない/.test(t) ? 'opponent' : 'any',
      duration: 'PERMANENT',
    } as GrantProtectionAction;
  }

  // ---- ゲームから除外する ----
  if (t.match(/ゲームから除外する/)) {
    // 「対戦相手はあなたの手札をN枚**見ないで選び**、あなたはそれらをゲームから除外する」（WX14-011①）。
    // ⚠下の汎用規則は手札除外を **TRASH**（＝トラッシュ行き）にしてしまい、枚数も 1 に潰れていた
    //   （§3 Opusタスク10 パターンE）。engine は execExile の HAND_CARD 分岐＋blind で実行する。
    {
      const blindExileM = t.match(/対戦相手はあなたの手札を([０-９\d]+)枚見ないで選び、あなたはそれ(?:ら)?をゲームから除外する/);
      if (blindExileM) {
        return {
          type: 'EXILE',
          target: { type: 'HAND_CARD', owner: 'self', count: parseNum(blindExileM[1]) },
          blind: true,
        } as unknown as EffectAction;
      }
    }
    // 「（対戦相手の）シグニN体を対象とし、それ（とこのシグニ）をゲームから除外する」＝場のシグニ除外。
    // execExile は SIGNI 対応済み（effectExecutor「場のシグニをゲームから除外」）。従来は下の汎用フォール
    // バックで TRASH{TRASH_CARD}（トラッシュ→トラッシュの完全no-op）に化け、owner も別節の「対戦相手」を
    // 拾って誤っていた（続き77 Sonnet観測(a)＝WXK04-035/WXK09-015/WXDi-P11-010B/WXDi-P16-001B/
    // WXDi-P13-089＋複合形 WX21-027/WX24-P3-TK1A の7枚）。
    {
      const fieldExileM = t.match(/(対戦相手の|あなたの)?シグニ([０-９\d]+)体を対象とし、(それとこのシグニ|このシグニとそれ|それら?)をゲームから除外する/);
      if (fieldExileM) {
        const owner: Owner = fieldExileM[1] === 'あなたの' ? 'self' : 'opponent';
        const exTarget: EffectAction = { type: 'EXILE', target: { type: 'SIGNI', owner, count: parseNum(fieldExileM[2]) } };
        if (fieldExileM[3] === 'それ' || fieldExileM[3] === 'それら') return exTarget;
        // 「このシグニとそれ／それとこのシグニ」＝対象と自身の両方を除外（対象→自身の順＝curated 準拠）
        return { type: 'SEQUENCE', steps: [
          exTarget,
          { type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } },
        ] };
      }
      // 「…対象になったとき、（そのシグニが場にある場合、）そのシグニをゲームから除外する」＝除外先は
      // **対象にしてきた相手シグニ**（トリガー元）。上の fieldExileM は「シグニN体を対象とし」形しか見ないため
      // 本形は下の汎用フォールバックで TRASH{TRASH_CARD}（トラッシュ→トラッシュの完全 no-op）に化けていた
      // （タスク12(c)①＝WXDi-P13-089-E2）。トリガー元への限定（filter.isTriggerSource）は timing を知る
      // effectParser 側の後段で刻む＝ここでは**場のシグニの除外**という型だけを正す。
      // ⚠「そのシグニが場にある場合」は候補が場のシグニに限られること自体で満たされる（不在なら候補0＝no-op）。
      if (/能力か効果の対象になったとき/.test(t) && /そのシグニをゲームから除外する/.test(t) && !/対象とし/.test(t)) {
        return { type: 'EXILE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } };
      }
      // 「このシグニをゲームから除外する」（単独）＝場の効果元シグニ自身の除外（クラフトトークンの
      // 「対戦相手のターン終了時、〜」等＝WXDi-CP02-TK01A/TK02A/TK03B）。
      // ⚠遅延形「ターン終了時に、または場から離れる場合に」（WX16-040 等＝遅延トリガー機構待ち・§6.3）と
      //   「場を離れる場合、代わりに」（WXK05-024＝置換ルール機構待ち）は対象外＝従来近似のまま。
      //   丸括弧のルール注釈（「（クラフトであるシグニは場を離れると…）」）はガード判定から除いて誤除外を防ぐ。
      const tNoNote = t.replace(/（[^（）]*）/g, '');
      if (/このシグニをゲームから除外する/.test(tNoNote)
          && !/代わりに|ターン終了時に、または|場(?:から|を)離れる場合/.test(tNoNote)
          && !/場にあるこのシグニをゲームから除外する/.test(tNoNote)) {
        return { type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } };
      }
    }
    // 除外元ゾーンの所有者で owner を決める（「あなたのトラッシュ」=self／「対戦相手のトラッシュ」=opponent）。
    // 文頭に別主語（「対戦相手のシグニ１体を対象とし、」＝パワー修正対象）があっても除外元ゾーンを優先する。
    // 従来は素の t.includes('対戦相手') が別節の主語を拾い、self トラッシュ除外を opponent に誤反転していた
    // （WXDi-P05-043「あなたのトラッシュにあるスペルを…除外」・続き56発見）。
    const zoneOwnerM = t.match(/(あなた|自分|対戦相手)の(?:トラッシュ|手札|エナゾーン)/);
    const owner: Owner = zoneOwnerM
      ? (zoneOwnerM[1] === '対戦相手' ? 'opponent' : 'self')
      : (t.includes('対戦相手') ? 'opponent' : 'self');
    const isHand = t.includes('手札');
    const isEnergy = t.includes('エナゾーン');
    if (isHand && isEnergy) {
      return { type: 'SEQUENCE', steps: [
        { type: 'TRASH', target: { type: 'HAND_CARD', owner, count: 'ALL' } },
        { type: 'TRASH', target: { type: 'ENERGY_CARD', owner, count: 'ALL' } },
      ] };
    }
    const upToM = t.match(/([０-９\d]+)枚まで/);
    const exactTrashCountM = t.match(/対戦相手のトラッシュにあるカード([０-９\d]+)枚を対象とし/);
    const count = t.includes('すべて') ? 'ALL' : (upToM ? parseNum(upToM[1]) : exactTrashCountM ? parseNum(exactTrashCountM[1]) : 1);
    const srcType = isHand ? 'HAND_CARD' : isEnergy ? 'ENERGY_CARD' : 'TRASH_CARD';
    // 「場にあるこのシグニをゲームから除外する」＝効果元シグニ自身の場からの除外（WX25-P1-TK6）
    if (t.match(/場にあるこのシグニをゲームから除外する/)) {
      return { type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } };
    }
    // 明示的な「トラッシュにある/から…を対象とし」の除外は EXILE（execExile が TRASH_CARD 対応済み。
    // 旧 TRASH{TRASH_CARD} はトラッシュ→トラッシュ＝完全no-op）。
    // self参照（このカード/このシグニ/このスペル＝遅延自己除外・ルリグデッキのピース除外等）は機構待ち＝従来どおり
    // TRASH 近似のまま（curated と同じ no-op・PLAN §6.3）。手札/エナ除外も execExile 未対応のため TRASH 近似。
    const selfRef = t.match(/この(?:カード|シグニ|スペル)を?ゲームから除外/);
    // 「ルリグデッキにあるピースを除外」（WXDi-P04-013等）は除外対象がトラッシュでない＝機構待ちの従来近似のまま
    if (srcType === 'TRASH_CARD' && !selfRef && !t.includes('ルリグデッキにある') && t.match(/トラッシュ(?:にある|から)/)) {
      // 「シグニとスペルをそれぞれN枚まで」形は2つの EXILE に分ける（WX14-006B）
      const eachM = t.match(/シグニとスペルをそれぞれ([０-９\d]+)枚まで/);
      const guardF = t.includes('《ガードアイコン》を持たない') ? { hasGuard: false } : {};
      if (eachM) {
        const n = parseNum(eachM[1]);
        return { type: 'SEQUENCE', steps: [
          { type: 'EXILE', target: { type: 'TRASH_CARD', owner, count: n, filter: { cardType: 'シグニ', ...guardF }, upToCount: true } },
          { type: 'EXILE', target: { type: 'TRASH_CARD', owner, count: n, filter: { cardType: 'スペル', ...guardF }, upToCount: true } },
        ] };
      }
      const baseF: TargetFilter | undefined =
        t.includes('スペル') ? { cardType: 'スペル', ...guardF } : t.includes('シグニ') ? { cardType: 'シグニ', ...guardF }
        : (Object.keys(guardF).length ? guardF as TargetFilter : undefined);
      return { type: 'EXILE', target: { type: 'TRASH_CARD', owner, count, ...(baseF ? { filter: baseF } : {}), ...(upToM ? { upToCount: true } : {}) } };
    }
    return { type: 'TRASH', target: { type: srcType as EffectTarget['type'], owner, count } };
  }

  // ---- 対戦相手のすべてのシグニをトラッシュに置く ----
  if (t.match(/対戦相手のすべてのシグニをトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' } };
  }

  // ---- デッキの一番上のカードをトラッシュに置く ----
  if (t.match(/デッキの一番上のカードをトラッシュに置く/) || t.match(/あなたのデッキの一番上のカードをトラッシュに置く/)) {
    const cM = t.match(/([０-９\d]+)枚/);
    const count = cM ? parseNum(cM[1]) : 1;
    return { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count } };
  }

  // ---- シグニをデッキの一番下に置く ----
  // 公開/look 後の「残り」は公開カードの remainder であり、同じ複文内に pick 対象の
  // 「シグニ」があっても場のシグニを指さない。句をまたいだ誤結合をここで除外する。
  const isRevealedRemainderToDeckBottom =
    /残りを(?:好きな順番で|シャッフルして)?デッキの一番下に置く/.test(t);
  if (/このシグニをデッキの一番下に置く/.test(t) && !t.includes('それとこのシグニ')) {
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', thisCardOnly: true } },
      shuffle: false,
      position: 'bottom',
    } as TransferToDeckAction;
  }
  if (!isRevealedRemainderToDeckBottom && t.match(/デッキの一番下に置く/) && (t.includes('シグニ') || t.includes('それ'))) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const cM = t.match(/([０-９\d]+)体/);
    // 「対戦相手の**すべての**シグニをデッキの一番下に置く」＝集合主語（続き634・`WXDi-CP02-036-E1`）。
    // ⚠従来は体数表記が無いと無条件で `1` へ潰れ、**全体除去が1体除去に化ける過小実行**だった。
    // `hasAllSubject` は条件節（「〜がXの場合」）と体数明示を除外する（parserUtils の同関数を参照）。
    const count: number | 'ALL' = cM ? parseNum(cM[1]) : (hasAllSubject(t, 'シグニ') ? 'ALL' : 1);
    // 「対戦相手のレベルNのシグニ」等のレベル指定をフィルタに反映（G100）
    // ⚠この `lvM` は「レベル**N**の」＝**丁度**しか見ておらず、「レベルN**以上／以下**の」を取りこぼす。
    //   下の filter で `signiClauseLevelFilter`（対象名詞句に隣接する範囲レベル）を併用する（続き377d）。
    const lvM = t.match(/レベル([０-９\d]+)の(?:[白赤青緑黒]の|＜[^＞]+＞の)?シグニ/);
    // 「無色ではないシグニN枚をデッキの一番下に置く」（§5d パターンA・続き372）＝`WX15-Re15-E1`。
    // ここで立てた filter は `applyDistinctBatch5c` の source 付け替え（SIGNI→TRASH_CARD）にも引き継がれる。
    // ＜クラス＞（続き376d 追加）＝「トラッシュからそれぞれレベルの異なる**＜天使＞の**シグニ３枚を…
    // デッキの一番下に置く」で `selectionConstraint:{distinct:'level'}` は載るのに**クラスだけ落ちて**いた
    // ＝トラッシュのどのシグニでも戻せる過剰効果（`SPDi44-12-E1`／`SPDi44-16-E1`／`WX25-P1-014-E1`／
    //   `WX25-P1-030-E1`／`WX25-P2-063-E2`）。
    // ⚠**全文からは取らない**（続き376d の BOUNCE で7件中4件を誤配線した教訓）＝「トラッシュから」以降に
    //   限り、かつ ＜X＞の が対象名詞句のシグニに**隣接**（間に別の「シグニ」を挟まない）ときだけ拾う。
    //   前文の「対戦相手のシグニ１体を対象とし」の側へ付けてはいけない。
    // ⚠**「トラッシュから」がある文にだけ適用する**＝無いと `WXDi-P16-069-E2`
    //   「このカードの上にある**＜解放派＞の**シグニは『…それをデッキの一番下に置く』を得る」の
    //   **付与対象**のクラスを、置かれる相手シグニ側へ付けてしまう。
    const dbSpan = t.includes('トラッシュから')
      ? (t.slice(t.indexOf('トラッシュから')).match(/^([^。]*?)デッキの一番下に置く/s)?.[1] ?? '')
      : '';
    // ⚠**span 内に別々の ＜クラス＞ が2つ以上あるときは付けない**＝`PR-322-E1`「＜天使＞のシグニ１枚**と**
    //   ＜古代兵器＞のシグニ１枚」（別々のピック）・`WX08-036-E1`「＜鉱石＞**か**＜宝石＞のシグニ合計５枚」（OR）は
    //   片方だけ載せると**原文と逆の過小実行**になる。AND/OR/別ピックの区別がこの規則では付かないので
    //   **既存の過剰効果を残すほうを選ぶ**（PLAN §5d-0 (i) へ follow-up として登録）。
    const dbClasses = [...new Set([...dbSpan.matchAll(/＜([^＞]+)＞/g)].map(m => m[1]))];
    const dbStoryM = dbClasses.length === 1
      ? dbSpan.match(/＜([^＞]+)＞の(?:[^。、シ]{0,10})?シグニ/)
      : null;
    const filter: TargetFilter = { cardType: 'シグニ', ...signiClauseLevelFilter(t), ...(lvM ? { level: parseNum(lvM[1]) } : {}), ...parsePowerFilter(dbSpan.length > 0 ? dbSpan : t), ...parseStateFilter(t), ...(dbStoryM ? { story: dbStoryM[1] } : {}), ...(hasOtherSelfSigniNoun(t) ? { excludeSelf: true } : {}), ...(/無色ではない/.test(t) ? { nonColorless: true } : {}),
      // 《ガードアイコン》（続き377b）＝クラスと同じく **`dbSpan`（トラッシュから〜デッキの一番下）に限る**。
      //   `WXDi-P11-074-E2`「トラッシュから《ガードアイコン》を持たないシグニを３枚まで」で丸ごと落ちていた。
      ...(dbClasses.length <= 1 ? parseColorFilter(dbSpan) : {}), ...signiClauseColorFilter(t), ...parseGuardFilter(dbSpan), ...parseIconFilter(dbSpan) };
    // 枚数は「N体」（場のシグニ）だけを見ていたため、**トラッシュから「N枚」**の形が全部 count:1 へ潰れ、
    //   「３枚まで」が1枚しか動かせない**過小実行**になっていた（続き377b・実測8効果＝`WDK09-013-E2`／
    //   `WX06-001-E2`／`WX06-001-E3`／`WX08-036-E1`／`WX25-CP1-047-E1`／`WXDi-P11-074-E2`／`WXK06-041-E2`／
    //   `WXK10-066-E2`）。⚠**全文の「N枚」は見ない**（コスト節の「手札から＜X＞のシグニを１枚捨てる」を拾う）＝
    //   `dbSpan`（トラッシュから〜デッキの一番下）内の最初の「N枚」だけ。「N枚まで」は `upToCount`。
    //   「それぞれレベルの異なる」系は `applyDistinctBatch5c` が後段で count を確定するので既存値と一致する。
    const dbCountM = dbSpan.match(/([０-９\d]+)枚(まで)?/);
    // ⚠**dbSpan があるとき＝移す元は「トラッシュ」であって場のシグニではない**（続き377b）。
    //   従来は常に `source:{type:'SIGNI'}`＝**場のシグニをデッキ下へ送る別物**を出しており、しかも owner は
    //   全文の「対戦相手」で決めていたので `WX06-001-E2`「対戦相手のシグニ１体を対象とし、**あなたの**トラッシュから
    //   ＜天使＞のシグニ７枚をデッキの一番下に置く」が **相手の場のシグニ**を送る形になっていた（実測19効果）。
    //   正準形は同じ文型の13効果が既に持っている `source:{type:'TRASH_CARD', owner, count, filter}`
    //   （`applyDistinctBatch5c` の `DISTINCT_SOURCE_FIX_BATCH5C` が名指しで付け替えていたぶん）＝
    //   **名指し表でやっていたことをビルダー本体へ一般化する**。
    //   owner は「対戦相手のトラッシュから」かどうか（＝トラッシュ直前の語）だけで決める＝全文スキャンしない。
    const dbTrashIdx = t.indexOf('トラッシュから');
    const dbTrashOwner: Owner = /対戦相手の$/.test(t.slice(Math.max(0, dbTrashIdx - 5), dbTrashIdx)) ? 'opponent' : 'self';
    // 「対戦相手のトラッシュから**カード**を２枚まで」＝シグニ限定ではない（`WDK09-013-E2`／`WXK06-041-E2`／
    //   `WXDi-P06-043-E1`／`WXDi-P11-074-E1`）。cardType を残すとシグニしか戻せない過小実行になる。
    const dbIsCardNoun = /カード(?:を)?[０-９\d]*枚/.test(dbSpan) && !/シグニ(?:を)?[０-９\d]*枚/.test(dbSpan);
    const { cardType: _dbCardType, ...dbFilterNoType } = filter;
    const dbFilter = dbIsCardNoun ? dbFilterNoType : filter;
    if (dbSpan) {
      return {
        type: 'TRANSFER_TO_DECK',
        source: {
          type: 'TRASH_CARD', owner: dbTrashOwner,
          count: dbCountM ? parseNum(dbCountM[1]) : count,
          ...(dbCountM?.[2] ? { upToCount: true } : {}),
          ...(Object.keys(dbFilter).length > 0 ? { filter: dbFilter } : {}),
        },
        shuffle: false,
        position: 'bottom',
      } as TransferToDeckAction;
    }
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'SIGNI', owner, count, filter },
      shuffle: false,
      position: 'bottom',
    } as TransferToDeckAction;
  }

  // ---- あなたの他のシグニ１体をトラッシュ（コスト系効果）----
  if (t.match(/あなたの他のシグニ.+をトラッシュに置く/)) {
    const cM = t.match(/([０-９\d]+)体/);
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: cM ? parseNum(cM[1]) : 1 } };
  }

  // ---- 対戦相手にダメージを与える（直接ライフクラッシュ）----
  if (t.match(/対戦相手にダメージを与える/)) {
    return { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true };
  }

  // ---- このターン／次にスペルを使用する場合コスト減 ----
  if (t.match(/次に.*スペルを使用する場合.*コストは.*減る/)) {
    const costs = parseEnergyCosts(t);
    return {
      type: 'COST_REDUCTION',
      targetCardType: 'スペル',
      reduction: costs.length > 0 ? costs : [{ color: '無', count: 1 }],
      duration: 'UNTIL_END_OF_TURN',
    } as CostReductionAction;
  }

  // ---- 対戦相手の手札を見てN枚選び捨てさせる ----
  // 「見て…選び」＝自分（効果使用側）が相手手札を見て選ぶ → actingPlayerSelects:true
  // （無印だと execTrash で opponentResponds=相手が選ぶ になり取り違える）
  {
    // 「無色ではないカード1枚を選び」（§5d パターンA・続き372）＝選べる範囲の絞り込みが落ちて
    // **無色カードも捨てさせられる過剰効果**だった（`WX07-015-E1`／`WXK10-026-BURST`）。
    // 「《ガードアイコン》を持たないカード１枚を選び、捨てさせる」（続き377b）＝選べる範囲の絞り込みが落ちて
    //   **ガード持ちも捨てさせられる過剰効果**だった（`WXDi-P00-006-E1`／`WXDi-P08-033-E1`／`WXDi-P14-045-E1`）。
    //   ⚠この形は「相手のガード札を残さない」ではなく**逆**＝ガードを持つカードは捨てさせられない制限なので、
    //     落ちると相手の防御札を不当に剥がせる。engine は `handCandidates`→`matchesFilter` で noGuard 対応済み。
    const hvdGuard = parseGuardFilter(t);
    const hvdFilter: TargetFilter | undefined = (/無色ではない/.test(t) || Object.keys(hvdGuard).length)
      ? { ...(/無色ではない/.test(t) ? { nonColorless: true } : {}), ...hvdGuard } : undefined;
    const hvdM = t.match(/対戦相手の手札を見て([０-９\d]+)枚選び/);
    if (hvdM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: parseNum(hvdM[1]), ...(hvdFilter ? { filter: hvdFilter } : {}), actingPlayerSelects: true } };
    }
    if (t.match(/対戦相手の手札を見て.*カード.*選び.*捨てさせる/)) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1, ...(hvdFilter ? { filter: hvdFilter } : {}), actingPlayerSelects: true } };
    }
  }

  // ---- シグニをデッキの一番上に置く（場のシグニ限定）----
  // 「トラッシュから…を対象とし、それをデッキの一番上に置く」はトラッシュ回収→トップ（TRASH_CARD）であり
  // 場のシグニ移動ではない。part2 の TRASH_CARD 規則に委譲するためここでは掴まない（掴むと場のシグニ幻覚化する）。
  if (!t.includes('トラッシュから') && (t.match(/それをデッキの一番上に置く/) || t.match(/シグニ.+をデッキの一番上に置く/) || t.match(/対戦相手のすべてのシグニをデッキの一番上に置く/))) {
    const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
    const all = /すべてのシグニをデッキの一番上に置く/.test(t);
    // レベル限定（続き377d）＝「対戦相手の**レベル２以下の**シグニ１体を対象とし、それをデッキの一番上に置く」で
    //   丸ごと落ちており、**どのレベルのシグニでもデッキへ送れる**過剰効果だった（`WX16-066-BURST`／`WX19-026-BURST`／`WXK10-044-BURST`）。
    //   ⚠**対象名詞句に隣接するレベルだけ**（`signiClauseLevelFilter`）＝素の `parseLevelFilter(t)` だと
    //     ルリグのレベル条件・自身のレベル条件・【ビート】コストを引き込む。
    // 🆕**クラス／パワー／アイコン／色も同じ規律で拾う**（2026-08-19 続き571）＝レベルだけが配線されており、
    //   `WX17-071-E1`「対戦相手の**＜精元＞の**シグニ１体を対象とし、それをデッキの一番上に置く」で
    //   **どのシグニでもデッキ送りにできる**過剰効果だった（被覆マトリクス `cardClass × SIGNI[filter]` の実例）。
    //   ⚠いずれも**対象名詞句に隣接する分だけ**（`signiClause*`）＝全文スキャンは条件節・コスト節を引き込む。
    return { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner, count: all ? 'ALL' : 1, filter: { cardType: 'シグニ', ...signiClauseLevelFilter(t), ...signiClauseStoryFilter(t), ...signiClausePowerFilter(t), ...signiClauseIconFilter(t), ...signiClauseColorFilter(t) } }, shuffle: false, position: 'top' } as TransferToDeckAction;
  }

  // ---- 対戦相手は自分のデッキの一番上を公開する ----
  if (t.match(/対戦相手は自分のデッキの一番上を公開する/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'opponent' },
      count: 1, private: false, reorder: false,
      destination: { location: 'deck', owner: 'opponent', position: 'top' },
    };
  }

  // ---- CONTINUOUS: このシグニのパワーはあなたの場にいるルリグ N体につき±N（ルリグ参照）----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)の場に(?:いる|ある)(?:他の)?(.+?)のルリグ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
    if (m) {
      const countOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const sign = m[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m[4]),
        countFilter: { cardType: ['ルリグ', 'アシストルリグ'], ...parseColorFilter(`${m[2]}の`), ...parseStoryFilter(m[2]) },
        countOwner,
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- CONTINUOUS: 場の《クロスアイコン》を持つシグニ N体につきパワー±N ----
  {
    const m = t.match(/このシグニのパワーは(あなた|対戦相手)の場にある《クロスアイコン》を持つシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
    if (m) {
      const countOwner: Owner = m[1] === '対戦相手' ? 'opponent' : 'self';
      const sign = m[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m[3]),
        countFilter: { cardType: 'シグニ', hasCrossIcon: true },
        countOwner,
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- CONTINUOUS: このシグニのパワーは他のシグニ N体につき±N（両プレイヤー参照）----
  {
    const m = t.match(/このシグニのパワーは他のシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
    if (m) {
      const sign = m[1] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_FIELD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerUnit: sign * parseNum(m[2]),
        countFilter: { cardType: 'シグニ' },
        countOwner: 'any',
        excludeSelf: true,
      } as PowerModifyPerFieldAction;
    }
  }

  // ---- このシグニのパワーはあなたの場にある[他の]＜X＞のシグニ１体につき±Nされる ----
  const perFieldSelfM = t.match(/このシグニのパワーは(あなた|対戦相手)の場にある(他の)?(.+?)のシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
  if (perFieldSelfM) {
    const countOwner: Owner = perFieldSelfM[1] === '対戦相手' ? 'opponent' : 'self';
    const sign = perFieldSelfM[4] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerUnit: sign * parseNum(perFieldSelfM[5]),
      countFilter: { cardType: 'シグニ', ...parseStoryFilter(perFieldSelfM[3]), ...parseColorFilter(perFieldSelfM[3]) },
      countOwner,
      ...(perFieldSelfM[2] ? { excludeSelf: true } : {}),
    } as PowerModifyPerFieldAction;
  }

  // ---- このシグニのパワーは対戦相手の場にあるシグニN体につき±Nされる（ストーリーなし）----
  const perFieldOppM = t.match(/このシグニのパワーは対戦相手の場にあるシグニ(?:[０-９\d]+)?体?につき([＋－])([０-９\d]+)され/);
  if (perFieldOppM) {
    const sign = perFieldOppM[1] === '＋' ? 1 : -1;
    return {
      type: 'POWER_MODIFY_PER_FIELD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      deltaPerUnit: sign * parseNum(perFieldOppM[2]),
      countFilter: { cardType: 'シグニ' },
      countOwner: 'opponent',
    } as PowerModifyPerFieldAction;
  }

  // ---- 対戦相手の手札を見る ----
  if (t.match(/対戦相手の手札を見る/)) {
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'hand', owner: 'opponent' },
      count: 99,
      private: true,
      reorder: false,
      destination: { location: 'hand', owner: 'opponent', position: 'top' },
    };
  }

  // ---- トラッシュからN枚エナゾーンに置く（フィルタあり・なし両対応）----
  {
    const trashToEnaM = t.match(/トラッシュからカードを([０-９\d]+)枚までを?対象とし、それら?をエナゾーンに置く/);
    if (trashToEnaM) {
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'TRASH_CARD', owner: 'self', count: parseNum(trashToEnaM[1]), upToCount: true },
      } as EnergyChargeAction;
    }
    // 汎用: トラッシュから(フィルタ)N枚を対象とし、それをエナゾーンに置く
    // ⚠「そのレゾナの**出現条件のためにトラッシュに置いた**カード」は照応（＝直前に払ったコスト札そのもの）で、
    //   filter では表せない＝`RESONANCE_COST_CARDS_TO_ENERGY`（part2・engine が `lastProcessedCards` を読む）の
    //   領分。ここで拾うと**トラッシュの任意2枚**を選べる過剰へ退化する（§6.4 O-36・続き534＝ターン条件の
    //   持ち上げで文が分割され、本規則が先に当たるようになったため顕在化。`WXEX1-16-E1` 1件）。
    const trashToEnaG = /出現条件のためにトラッシュに置いた/.test(t)
      ? null
      : t.match(/トラッシュから.{0,30}?([０-９\d]+)枚(まで)?を?対象とし、それら?をエナゾーンに置く/);
    if (trashToEnaG) {
      const filter: TargetFilter = { ...parseStoryFilter(t), ...parseColorFilter(t), ...parseLevelFilter(t), ...parseGuardFilter(t) };
      if (t.includes('シグニ')) filter.cardType = 'シグニ';
      if (t.includes('スペル')) filter.cardType = 'スペル';
      // 「トラッシュから無色ではない〜をエナゾーンに置く」（§5d パターンA・続き372）＝`WXK09-033-E2`／`WXDi-P10-070-E1`。
      // 従来は無色カードもエナに送れる過剰効果だった。⚠`parseColorFilter` が「無色ではない」から color:'無' を
      // 立てていたら**真逆**になるので、nonColorless を立てる側で打ち消す。
      if (/無色ではない/.test(t)) { delete filter.color; filter.nonColorless = true; }
      return {
        type: 'ENERGY_CHARGE',
        target: { type: 'TRASH_CARD', owner: 'self', count: parseNum(trashToEnaG[1]), upToCount: !!trashToEnaG[2], filter: Object.keys(filter).length > 0 ? filter : undefined },
      } as EnergyChargeAction;
    }
  }

  // ---- エナゾーンからN枚まで手札に加える ----
  {
    const enaToHandM = t.match(/エナゾーンからカードを([０-９\d]+)枚まで対象とし、それら?を手札に加えてもよい/);
    if (enaToHandM) {
      return {
        type: 'TRANSFER_TO_HAND',
        source: { type: 'ENERGY_CARD', owner: 'self', count: parseNum(enaToHandM[1]), upToCount: true },
      };
    }
  }

  // ---- あなたの＜色＞のシグニの基本パワーをNにする ----
  {
    const colorPowerSetM = t.match(/あなたの([白赤青緑黒])のシグニの基本パワーを([０-９\d]+)にする/);
    if (colorPowerSetM) {
      return {
        type: 'POWER_SET',
        target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { color: colorPowerSetM[1] } },
        value: parseNum(colorPowerSetM[2]),
      };
    }
  }

  // ---- 手札をN枚捨てる（自分）----
  {
    const selfDiscardM = t.match(/^あなたは手札を([０-９\d]+)枚捨てる$/);
    if (selfDiscardM) {
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: parseNum(selfDiscardM[1]) } };
    }
  }

  // ---- 対戦相手の場にあるすべての【チャーム】をトラッシュに置く ----
  if (t.match(/すべての【チャーム】をトラッシュに置く/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { hasCharm: true } as TargetFilter } };
  }

  // ---- パワーをターゲット自身のレベル×N変更 ----
  {
    const byTargetLevelM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーをそれのレベル([０-９\d]+)につき([＋－])([０-９\d]+)する/);
    if (byTargetLevelM) {
      const owner: Owner = t.includes('対戦相手') ? 'opponent' : 'self';
      const sign = byTargetLevelM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_BY_TARGET_LEVEL',
        target: { type: 'SIGNI', owner, count: parseNum(byTargetLevelM[1]) },
        deltaPerLevel: sign * parseNum(byTargetLevelM[4]),
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyByTargetLevelAction;
    }
  }

  // ---- パワーをN倍にする ----
  {
    const multiplyM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーを([０-９\d]+)倍にする/);
    if (multiplyM) {
      const owner: Owner = signiClauseOwner(t);
      return {
        type: 'POWER_MULTIPLY',
        target: { type: 'SIGNI', owner, count: parseNum(multiplyM[1]) },
        multiplier: parseNum(multiplyM[2]),
        until: 'UNTIL_END_OF_TURN',
      } as PowerMultiplyAction;
    }
  }

  // ---- レベルをN変更する ----
  {
    const levelModM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのレベルを([＋－])([０-９\d]+)する/);
    if (levelModM) {
      const owner: Owner = signiClauseOwner(t);
      const sign = levelModM[2] === '＋' ? 1 : -1;
      return {
        type: 'LEVEL_MODIFY',
        target: { type: 'SIGNI', owner, count: parseNum(levelModM[1]) },
        delta: sign * parseNum(levelModM[3]),
        until: 'UNTIL_END_OF_TURN',
      } as LevelModifyAction;
    }
    // このシグニのレベルをN変更する
    const selfLevelModM = t.match(/このシグニのレベルを([＋－])([０-９\d]+)する/);
    if (selfLevelModM) {
      const sign = selfLevelModM[1] === '＋' ? 1 : -1;
      return {
        type: 'LEVEL_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        delta: sign * parseNum(selfLevelModM[2]),
        until: 'UNTIL_END_OF_TURN',
      } as LevelModifyAction;
    }
  }

  // ---- チャーム枚数比例パワー変更（フィールド上）----
  {
    const perCharmM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーを場にある【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)する/);
    if (perCharmM) {
      const owner: Owner = signiClauseOwner(t);
      const sign = perCharmM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner, count: parseNum(perCharmM[1]) },
        deltaPerCharm: sign * parseNum(perCharmM[4]),
        sourceOwner: t.includes('対戦相手のシグニN体') ? 'any' : 'any',
        sourceLocation: 'field',
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerCharmAction;
    }
    const oppCharmM = t.match(/対戦相手のシグニのパワーを、対戦相手の場にある【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)する/);
    if (oppCharmM) {
      const sign = oppCharmM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' },
        deltaPerCharm: sign * parseNum(oppCharmM[3]),
        sourceOwner: 'opponent',
        sourceLocation: 'field',
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerCharmAction;
    }
    // この方法でトラッシュに置いたシグニのレベル合計×N
    const perTrashedLevelM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーをこの方法でトラッシュに置いたシグニのレベル([０-９\d]+)につき([＋－])([０-９\d]+)/);
    if (perTrashedLevelM) {
      const owner: Owner = signiClauseOwner(t);
      const sign = perTrashedLevelM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_TRASHED_LEVEL',
        target: { type: 'SIGNI', owner, count: parseNum(perTrashedLevelM[1]) },
        deltaPerLevel: sign * parseNum(perTrashedLevelM[4]),
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerTrashedLevelAction;
    }
    // この方法でトラッシュに置いたチャーム枚数×N
    const perTrashedCharmM = t.match(/シグニ([０-９\d]+)体を対象とし.*それのパワーをこの方法でトラッシュに置いた【チャーム】([０-９\d]+)枚につき([＋－])([０-９\d]+)/);
    if (perTrashedCharmM) {
      const targetOwner: Owner = signiClauseOwner(t);
      const sign = perTrashedCharmM[3] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_CHARM',
        target: { type: 'SIGNI', owner: targetOwner, count: parseNum(perTrashedCharmM[1]) },
        deltaPerCharm: sign * parseNum(perTrashedCharmM[4]),
        sourceOwner: 'self',  // trashed_this_effect は常に自分のチャームをコストとしてトラッシュ
        sourceLocation: 'trashed_this_effect',
        until: 'UNTIL_END_OF_TURN',
      } as PowerModifyPerCharmAction;
    }
  }

  // ---- エナゾーンカード枚数比例パワー変更（常時）----
  {
    const perEnergyM = t.match(/このシグニのパワーはあなたのエナゾーンにあるカード([０-９\d]+)枚につき([＋－])([０-９\d]+)され/);
    if (perEnergyM) {
      const sign = perEnergyM[2] === '＋' ? 1 : -1;
      return {
        type: 'POWER_MODIFY_PER_ENERGY',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        deltaPerCard: sign * parseNum(perEnergyM[3]),
        energyOwner: 'self',
      } as PowerModifyPerEnergyAction;
    }
  }

  // ---- ダメージを受けない ----
  if (t.match(/あなたはダメージを受けない/)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'UNTIL_END_OF_TURN', scope: 'ALL' } as PreventDamageAction;
  }

  // ---- 次のターンの間、対戦相手のルリグはダメージを与えない ----
  if (t.match(/次の.*ターンの間、対戦相手のルリグはあなたにダメージを与えない/)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'NEXT_TURN', scope: 'LRIG' } as PreventDamageAction;
  }

  // ---- シグニの位置交換 ----
  if (t.match(/あなたの他のシグニ[０-９\d]*体を対象とし、それとこのシグニの場所を入れ替える/)) {
    return {
      type: 'REARRANGE_SIGNI',
      target: { type: 'SIGNI', owner: 'self', count: 1, filter: { excludeSelf: true } },
      swap: true,
    } as RearrangeSigniAction;
  }

  // ---- エナゾーンをN枚に均等化 ----
  // 主語で調整対象プレイヤーを決める：「対戦相手は自分の…」＝相手のみ（owner:'opponent'）／
  // 「各プレイヤーは自分の…」＝両方（owner未指定）／「あなたは自分の…」＝自分のみ。
  // 従来は主語を無視して owner を落としていたため、execEqualizeEnergy が「両プレイヤー」既定になり
  // 自分のエナまで巻き込む過剰効果だった（WX10-005②/WX12-021-BURST/WX14-054/WXK11-008/WXK11-058・続き56発見）。
  {
    const equalizeM = t.match(/(?:(対戦相手|各プレイヤー|あなた)は)?自分のエナゾーンのカードが([０-９\d]+)枚になるように/);
    if (equalizeM) {
      const subj = equalizeM[1];
      const owner: Owner | undefined = subj === '対戦相手' ? 'opponent' : subj === 'あなた' ? 'self' : undefined;
      return { type: 'EQUALIZE_ENERGY', targetCount: parseNum(equalizeM[2]), ...(owner ? { owner } : {}) } as EqualizeEnergyAction;
    }
  }

  // ---- 手札を任意枚捨て、捨てた枚数+N枚引く ----
  {
    const varDiscardM = t.match(/手札を好きな枚数捨て、捨てた枚数に([０-９\d]+)を加えた枚数のカードを引く/);
    if (varDiscardM) {
      return { type: 'VARIABLE_DISCARD_AND_DRAW', drawBonus: parseNum(varDiscardM[1]), owner: 'self' } as VariableDiscardAndDrawAction;
    }
  }

  // ---- バニッシュの代替コスト（手札からスペルを捨てる）----
  {
    const banishSubstSpellM = t.match(/バニッシュされる場合、代わりに手札からスペルを([０-９\d]+)枚捨ててもよい/);
    if (banishSubstSpellM) {
      const count = parseNum(banishSubstSpellM[1]);
      const tgtCount = t.match(/あなたのシグニ([０-９\d]+)体が/);
      // 「このシグニがバニッシュされる場合」＝自身のみを守る（WX10-033-E1）。
      // filter 無しだと自分の全シグニを守る過大表現になっていた。
      const thisOnlySpell = /このシグニがバニッシュされる場合/.test(t);
      return {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: tgtCount ? parseNum(tgtCount[1]) : 1, ...(thisOnlySpell ? { filter: { thisCardOnly: true } } : {}) },
        substituteCost: { discardSpell: count },
        optional: true,
      } as BanishSubstituteAction;
    }
    // ---- バニッシュの代替コスト（下のスペルをトラッシュ）----
    const banishSubstStackM = t.match(/シグニ([０-９\d]+)体がバニッシュされる場合、代わりにこのシグニの下からスペル([０-９\d]+)枚をトラッシュに置いてもよい/);
    if (banishSubstStackM) {
      return {
        type: 'BANISH_SUBSTITUTE',
        trigger: { type: 'SIGNI', owner: 'self', count: parseNum(banishSubstStackM[1]) },
        substituteCost: { trashStackSpell: parseNum(banishSubstStackM[2]) },
        optional: true,
      } as BanishSubstituteAction;
    }
  }

  // ---- トラッシュからスペルをこのカードの下に置く ----
  {
    const stackSpellM = t.match(/トラッシュからスペルを([０-９\d]+)枚まで対象とし、それらをこのカードの下に置く/);
    if (stackSpellM) {
      return {
        type: 'STACK_SPELL',
        from: 'trash',
        filter: { cardType: 'スペル' },
        maxCount: parseNum(stackSpellM[1]),
      } as StackSpellAction;
    }
  }

  // ---- エナゾーンのカード色を継承 ----
  if (t.match(/エナゾーンにあるカードの色を追加で持つ/)) {
    return { type: 'COLOR_INHERIT', source: 'energy', owner: 'self' } as ColorInheritAction;
  }

  // 「対戦相手は無色のカードをN枚捨てないかぎり手札をM枚捨てる」＝**この規則は退役（タスク12(lxii)）**。
  // 吐いていた `CONDITIONAL_DISCARD`（アクション型）は **executor に dispatch が無く完全 no-op** だった。
  // 唯一の該当 `WX11-044-BURST` はタスク12(lxi) 第2波で標準の支払い回避ゲート
  // （`STUB{OPPONENT_PAY_OPTIONAL}`＋直後 `CONDITIONAL` の look-ahead ペア）へ移っており、ここには到達しない。

  return null;
}
