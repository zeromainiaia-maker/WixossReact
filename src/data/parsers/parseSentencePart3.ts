import type {
  EffectAction,
  Owner,
  TargetFilter,
  ChooseAction,
  RearrangeSigniAction,
  BlockActionAction,
  EnergyChargeAction,
  FreezeAction,
  DrawPerFieldCountAction,
  EnergyChargeFromDeckPerFieldCountAction,
  NegateAttackAction,
  PreventDamageAction,
  PlaceUnderSigniAction,
  TakeFromUnderSigniAction,
  StubAction,
  PowerModifyAction,
  BanishAction,
  TrashAction,
  SendToEnergyAction,
  BounceAction,
  DownAction,
  RecollectGateAction,
  AddToHandAction,
  CardLocation,
  AltCostOppTurnAction,
  ConditionalAction,
  SigniAttackBanAction,
  SigniDeployBanAction,
  LookAndReorderAction,
} from '../../types/effects';
import {
  parseNum, parseSignedNum, parseCardTypeFilter, parseStoryFilter, parseColorFilter, parseLevelFilter, makeRevealPickStub, parseEnergyCosts, extractCostColors, parseSigniTarget, hasOtherSelfSigniNoun, tradeOptionalCost, signiZoneIndexJa,
} from '../parserUtils';
import { parseSentencePart1 } from './parseSentencePart1';
import { parseSentencePart2 } from './parseSentencePart2';


export function parseSentencePart3(t: string): EffectAction | null {
  // ---- エナゾーンからN枚このシグニの下に置く ----
  {
    // ⚠名詞句修飾を filter へ運ぶ（§5.3 O-45）＝旧実装は m[1] を捕捉するだけで捨てており、
    //   「《ガードアイコン》を持たないシグニ１枚」（`WXDi-P06-039-E2`）でガードを下に置けたし、
    //   「カードを４枚まで」（`WXDi-P08-044-E3`）はシグニに限定される過小実行だった。
    const m = t.match(/あなたのエナゾーンから((?:《ガードアイコン》を持たない)?)(カード|シグニ)を?([０-９\d]+)枚?(まで)?(?:を対象とし、それ(?:ら)?を)?このシグニの下に置く/);
    if (m) {
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'energy',
        count: parseNum(m[3]),
        upToCount: !!m[4],
        filter: {
          ...(m[2] === 'シグニ' ? { cardType: 'シグニ' } : {}),
          ...(m[1] ? { noGuard: true } : {}),
        },
      } as PlaceUnderSigniAction;
    }
  }

  // ---- 手札からN枚このシグニの下に置く ----
  {
    // ⚠レベル句を filter へ運ぶ（§5.3 O-45）＝旧実装は捕捉するだけで捨てており、
    //   「あなたの手札から**レベル１の**シグニを５枚まで」（`WXDi-P10-043-E3`）が
    //   手札のどのシグニでも下に置ける過剰実行になっていた。
    const m = t.match(/あなたの手札から((?:レベル[０-９\d]+(?:以下|以上)?の)?)(シグニ|カード)を?([０-９\d]+)枚?(まで)?(?:を対象とし、それ(?:ら)?を)?このシグニの下に置く/);
    if (m) {
      return {
        type: 'PLACE_UNDER_SIGNI',
        source: 'hand',
        count: parseNum(m[3]),
        upToCount: !!m[4],
        filter: {
          ...(m[2] === 'シグニ' ? { cardType: 'シグニ' } : {}),
          ...(m[1] ? parseLevelFilter(m[1]) : {}),
        },
      } as PlaceUnderSigniAction;
    }
    // 「あなたは手札をN枚まで」形式＝**手札のカードなら何でも**（シグニ限定ではない・`WXDi-P11-080-E2`）
    const m2 = t.match(/あなたは手札を([０-９\d]+)枚?(まで)?このシグニの下に置く/);
    if (m2) {
      return { type: 'PLACE_UNDER_SIGNI', source: 'hand', count: parseNum(m2[1]), upToCount: !!m2[2] } as PlaceUnderSigniAction;
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
  // §5.3 `O-60` 第6バッチ＝**何を置くのかを `placeUnder` に刻む**（engine のカード全文 regex を撤去）。
  if (t.match(/(?:このシグニ|シグニ１体)の下に置く/)) {
    const craftM = t.match(/クラフトの《([^》]+)》[０-９\d]*[枚つ]?を(?:この)?シグニの下に置く/);
    const selfUnder = /このシグニを.+の下に置く/.test(t);
    return {
      type: 'STUB', id: 'PLACE_CARD_UNDER_SIGNI',
      placeUnder: craftM
        ? { mode: 'craft', craftName: craftM[1] }
        : selfUnder ? { mode: 'self_under_other' } : { mode: 'processed' },
      ...(hasOtherSelfSigniNoun(t) ? { selectTarget: parseSigniTarget(t, 'self') } : {}),
    } as StubAction;
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
    const m = t.match(/対戦相手の(?:シグニ(?:やルリグ)?|ルリグとシグニ)(?:を(?:合計)?([１-９\d０-９]+)体)?(?:まで)?を?対象とし.*次に.*アタックしたとき.*そのアタックを無効にする/);
    if (m || t.includes('アタックしたとき、そのアタックを無効にする')) {
      const cnt = m?.[1] ? parseNum(m[1]) : 1;
      // ⚠「対戦相手の**センタールリグ**がアタックしたとき、そのアタックを無効にする」（WXK10-012②）は
      //   ルリグ単独対象。従来は無条件に SIGNI 対象で、**シグニのアタックを無効にする**別効果に化けていた
      //   （§3 Opusタスク10 パターンB）。engine は LRIG / CENTER_LRIG_OR_SIGNI の両方を解決できる。
      const tgtType = (/センタールリグ(?:か|または|と).*シグニ/.test(t) || /対戦相手のルリグとシグニを合計/.test(t)) ? 'CENTER_LRIG_OR_SIGNI'
        : (t.includes('センタールリグ') && !m) ? 'LRIG' : 'SIGNI';
      return {
        type: 'NEGATE_ATTACK',
        target: { type: tgtType, owner: 'opponent', count: cnt, upToCount: t.includes('まで') },
      } as NegateAttackAction;
    }
  }
  // ---- 「**この**アタックを無効にする」＝**効果主自身のアタック**を止める（§3 (cxxvii)）----
  // 🔴下の汎用規則へ落とすと `NEGATE_ATTACK{owner:'opponent'}` になり、`execNegateAttack` は
  //   **対戦相手の場**から候補を作るので**自分のアタッカーが候補に入らず無言で空振り**する
  //   （実機実測＝CPU がコストを払ったのにアタックが通ってライフが減った）。
  //   ⚠**「この」と「その」で主語が逆**＝「その」は相手のアタック（下の :133 と :150）、
  //   「この」は【自】「**この**シグニがアタックしたとき」の自分のアタック。
  //   ⇒ 攻撃側＝効果オーナーのフラグを立てる `SET_CANCEL_ATTACK_FLAG` が正しい表現
  //     （`execStubPart3.ts:5343`＝`cancel_current_signi_attack`。マジックボックス系4枚の
  //      MANUAL 定義が既にこれを使っている＝**AUTO 側だけが取り残されていた**）。
  if (/この(?:シグニの)?アタックを無効にする/.test(t)) {
    return { type: 'STUB', id: 'SET_CANCEL_ATTACK_FLAG' } as StubAction;
  }
  // ---- アタックを無効にする（一度・汎用） ----
  if (t.includes('アタックを無効') && !t.includes('無効にし')) {
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as NegateAttackAction;
  }

  // ---- 場所（ゾーン）を入れ替える → REARRANGE_SIGNI (swap) ----
  // エナ／トラッシュのシグニと場のシグニを交換する二ゾーン形。
  // 場外側の名詞句だけから filter を作り、条件節や場側のクラスを混ぜない。
  if ((t.includes('場所を入れ替える') || t.includes('場所を入れ替えてもよい'))
      && (t.includes('エナゾーン') || t.includes('トラッシュ'))) {
    const sourceM = t.match(/((?:あなた|対戦相手)の)?(エナゾーン|トラッシュ)(?:から|にある)([^。]*?シグニ(?:を)?[０-９\d]+枚(?:まで)?)/);
    if (sourceM) {
      const sourceOwner: Owner = sourceM[1]?.includes('対戦相手') ? 'opponent' : 'self';
      const sourceLocation = sourceM[2] === 'トラッシュ' ? 'trash' : 'energy';
      const sourceSpan = sourceM[3];
      const sourceFilter: TargetFilter = {
        cardType: 'シグニ',
        ...parseLevelFilter(sourceSpan),
        ...parseStoryFilter(sourceSpan),
      };
      const targetsBattleAttacker = t.includes('そのあなたのシグニ');
      const fieldOwner: Owner = /対戦相手のシグニ[１1]体と/.test(t) ? 'opponent' : 'self';
      const fieldFilter: TargetFilter = targetsBattleAttacker
        ? { cardType: 'シグニ' }
        : fieldOwner === 'self'
          ? { cardType: 'シグニ', thisCardOnly: true }
          : {
              cardType: 'シグニ',
              ...(sourceSpan.includes('それと同じレベル') ? { levelEqLastProcessed: true } : {}),
            };
      return {
        type: 'REARRANGE_SIGNI',
        target: { type: 'SIGNI', owner: fieldOwner, count: 1, filter: fieldFilter },
        swap: true,
        swapSourceLocation: sourceLocation,
        swapSourceTarget: {
          type: sourceLocation === 'energy' ? 'ENERGY_CARD' : 'TRASH_CARD',
          owner: sourceOwner,
          count: 1,
          filter: sourceFilter,
          ...(sourceSpan.includes('まで') ? { upToCount: true } : {}),
        },
        ...(targetsBattleAttacker ? { targetsBattleAttacker: true } : {}),
        ...(t.includes('それらのレベルが同じ場合') ? { swapIfSameLevel: true } : {}),
      } as RearrangeSigniAction;
    }
  }
  // 効果元を片側に固定しない場内2体指定形。
  {
    const pairM = t.match(/(対戦相手|あなた)のシグニ[２2]体を対象とし、それらの場所を入れ替え(る|てもよい)/);
    if (pairM) {
      return {
        type: 'REARRANGE_SIGNI',
        target: { type: 'SIGNI', owner: pairM[1] === '対戦相手' ? 'opponent' : 'self', count: 2, filter: { cardType: 'シグニ' } },
        swap: true,
        swapBetweenTargets: true,
        ...(pairM[2] === 'てもよい' ? { optional: true } : {}),
      } as RearrangeSigniAction;
    }
  }
  if (t.includes('場所を入れ替える') || t.includes('場所を入れ替えてもよい')) {
    return { type: 'REARRANGE_SIGNI', target: hasOtherSelfSigniNoun(t)
      ? parseSigniTarget(t, 'self')
      : { type: 'SIGNI', owner: 'any', count: 1 }, swap: true } as RearrangeSigniAction;
  }

  // ---- すべての領域で色を失う ----
  if (t.match(/すべての領域で色を失う/)) {
    return { type: 'STUB', id: 'LOSE_COLOR_ALL_ZONES' } as StubAction;
  }

  // ---- ルリグ名コピー（ルリグトラッシュのルリグと同じカード名） ----
  // §5.3 `O-60` 第3バッチ＝**探すルリグと得る能力種別を payload に刻む**（消費地点4つの全文 regex を撤去）。
  // ⚠**能力種別は原文から取る**＝旧 engine の【自】コピーは種別を見ておらず、「そのルリグの**【常】**能力を
  //   得る」と書いてあるカードでも AUTO まで得ていた（過剰実行）。
  {
    const mLNC = t.match(/ルリグトラッシュにある(?:レベル([０-９\d]+)の)?[＜〈<]([^＞〉>]+)[＞〉>](?:のルリグ)?と同じカード名/);
    if (mLNC) {
      const kindsLNC: Array<'AUTO' | 'CONTINUOUS'> = [];
      if (/そのルリグの【自】能力を得る/.test(t)) kindsLNC.push('AUTO');
      if (/そのルリグの【常】能力を得る/.test(t)) kindsLNC.push('CONTINUOUS');
      return { type: 'STUB', id: 'COPY_LRIG_NAME_ABILITY', lrigNameCopy: {
        story: mLNC[2],
        ...(mLNC[1] !== undefined ? { level: parseNum(mLNC[1]) } : {}),
        kinds: kindsLNC,
      } } as StubAction;
    }
  }
  if (t.match(/ルリグトラッシュにある.+と同じカード名/)) {
    // ＜ストーリー＞を括弧で書かない形は payload を作れない＝消費側は fail-closed で何もしない。
    return { type: 'STUB', id: 'COPY_LRIG_NAME_ABILITY' } as StubAction;
  }

  // ---- 〈フィルタ〉のシグニN体につき〈ドロー / エナチャージ〉 ----
  // 「場にある」は任意。修飾句にはクラス（＜電機＞と＜水獣＞の＝OR）や盤面ステート
  // （凍結状態/ダウン状態/アップ状態/感染状態）が入りうる。
  {
    // 修飾句からカウント対象シグニのフィルタを組み立てる（クラスOR＋盤面ステート）
    const buildCountFilter = (mod: string): TargetFilter => {
      const stateFilter: Partial<TargetFilter> = {};
      if (mod.includes('凍結状態')) stateFilter.isFrozen = true;
      if (mod.includes('ダウン状態')) stateFilter.isDown = true;
      if (mod.includes('アップ状態')) stateFilter.isUp = true;
      if (mod.includes('感染状態')) stateFilter.infected = true;
      if (mod.includes('他の')) stateFilter.excludeSelf = true;
      // 🆕**【ライフバースト】所持の限定**（2026-08-27・Sheet1 B10・`WX06-020-E2`
      //   「あなたの場にある**【ライフバースト】を持つ**他の＜植物＞のシグニ１体につき…」）＝
      //   `hasLifeBurst` は `TargetFilter` にも `matchesFilter` にも実装済みなのに、この修飾句ビルダーからだけ
      //   漏れており、**バーストを持たない＜植物＞まで数えてエナが増えすぎる**過剰効果だった
      //   （`census:wiring` の配線漏れ型）。原文該当は全 CSV でこの1枚。
      if (mod.includes('【ライフバースト】を持つ')) stateFilter.hasLifeBurst = true;
      // 🆕**《Xアイコン》所持の限定**（続き742・`SP23-009-E1`「あなたの場にある**《ライフアイコン》を持つ**
      //   シグニ１体につきカードを１枚引く」）＝上の `hasLifeBurst` と同型の配線漏れで、**アイコンを持たない
      //   シグニまで数えて引きすぎる**過剰効果だった（意味照合 段2 finding）。`hasIcon` は `TargetFilter`・
      //   `matchesFilter` とも実装済み＝ここから合成されていなかっただけ。
      const iconM = mod.match(/《(クロス|ライズ|トラップ|アクセ)アイコン》を持つ/);
      if (iconM) stateFilter.hasIcon = iconM[1] as TargetFilter['hasIcon'];
      return { cardType: 'シグニ', ...parseStoryFilter(mod), ...stateFilter };
    };
    const drawM = t.match(/(あなた|対戦相手)?の?(?:場にある)?(.*?)シグニ([０-９\d]+)体につきカードを([０-９\d]+)枚引く/);
    if (drawM) {
      const countOwner: Owner = drawM[1] === '対戦相手' ? 'opponent' : 'self';
      return {
        type: 'DRAW_PER_FIELD_COUNT',
        drawPerUnit: parseNum(drawM[4]),
        countFilter: buildCountFilter(drawM[2] ?? ''),
        countOwner,
      } as DrawPerFieldCountAction;
    }
    // 「…シグニN体につき（あなたの）デッキの一番上のカードをエナゾーンに置く」（M枚指定は稀）
    const ecM = t.match(/(あなた|対戦相手)?の?(?:場にある)?(.*?)シグニ([０-９\d]+)体につき(?:あなたの)?デッキの一番上の(?:カードを([０-９\d]+)枚|カード)をエナゾーンに置く/);
    if (ecM) {
      const countOwner: Owner = ecM[1] === '対戦相手' ? 'opponent' : 'self';
      return {
        type: 'ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT',
        chargePerUnit: ecM[4] ? parseNum(ecM[4]) : 1,
        countFilter: buildCountFilter(ecM[2] ?? ''),
        countOwner,
        owner: 'self',
      } as EnergyChargeFromDeckPerFieldCountAction;
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
  // ⚠2つ目の形（`^このターン、対戦相手は…エナコストを支払えない`）は §6.4 O-36（続き534）で足した＝
  //   先頭の「対戦相手のターンの場合、」が `CONDITIONAL{TURN_OWNER opponent}` へ持ち上がるようになり、
  //   本規則の残り文からは条件句が消えるため。無いと `DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE`
  //   （engine に消費地点なし＝真 no-op）へ退化する。⚠先頭アンカー必須＝引用文中の
  //   「シグニアタックステップの間、対戦相手は１以上のエナコストを支払えない」（`WX25-P2-004-E1`）は別スコープ。
  if (t.match(/対戦相手のターンの場合.*エナコストを支払えない/)
      || /^このターン、対戦相手は[０-９\d]*以上のエナコストを支払えない/.test(t.trim())) {
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
  // 🆕§5.3 `O-94`②＝**レベルとゾーンをペイロードに刻む**（旧は payload 無しで engine 側が `return 3` と
  //   ゾーン1を**ハードコード**していた＝JSON を見ても何が起きるか分からない形）。
  {
    const zoneLvM = t.match(/対戦相手は中央のシグニゾーンにレベル([０-９\d]+)以上のシグニを.*配置できない/);
    if (zoneLvM) {
      return { type: 'STUB', id: 'OPP_ZONE_PLACEMENT_RESTRICT',
        zonePlacementRestrict: { zones: [1], minLevel: parseNum(zoneLvM[1]) } } as StubAction;
    }
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
    return {
      type: 'STUB',
      id: 'OPP_GUARD_COST_COLORLESS',
      ...(t.includes('このターン') ? { until: 'END_OF_TURN' as const } : {}),
    } as StubAction;
  }

  // ---- 対戦相手のアーツ・スペル・起使用不可（複合） ----
  // ⚠**期間を読む**（§6.4 O-14(a)）＝🔴従来は綴りに関係なく当ターン版に潰しており、
  //   「**次の対戦相手のターンの間**、対戦相手はアーツとスペルと【起】能力を使用できない」（`WX25-P1-050-E1`）が
  //   **自分のターンに効いて相手のターンには切れる**＝1ターンずれた無害化になっていた。
  // ⚠連用中止の「使用でき**ず**」形（`WX15-003-E3`）は**1文に強制アタックが同居する**ので
  //   `parseSentencePart1` の強制攻撃規則が畳む（ここには届かない）。綴りだけ揃えてある。
  if (t.match(/アーツとスペルと【起】能力を使用でき(?:ない|ず)/)) {
    const nextTurnBOASA = /次の(?:対戦相手の)?ターンの間/.test(t);
    return { type: 'STUB', id: nextTurnBOASA ? 'BLOCK_OPP_ARTS_SPELL_ACT_NEXT_TURN' : 'BLOCK_OPP_ARTS_SPELL_ACT' } as StubAction;
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

  // ---- 【ゲート】があるシグニゾーンのアタック禁止（§6.4 O-33 据置分・続き508）----
  // 「（このターン、）対戦相手は【ゲート】があるシグニゾーンにあるシグニでアタックできない」（`WDK09-001-E2`）。
  // 🔴**下の catch-all（`includes('【ゲート】')`）より前に置く**＝従来はこの文まで `STUB{GATE}` へ落ちて
  //   **相手ゾーンに【ゲート】をもう1つ置く**という原文に無い動作に化けていた（毎アタックフェイズに増える）。
  // 🔑ゾーン集合は静的に焼き込まず `zoneSource:'gate'`＝判定地点で `signi_gate_zones` を引く。
  if (/【ゲート】があるシグニゾーンにあるシグニ(?:で|では)アタックできない/.test(t)) {
    const banOwnerGate: Owner = /あなたは【ゲート】/.test(t) ? 'self' : 'opponent';
    return { type: 'SIGNI_ATTACK_BAN', owner: banOwnerGate, zoneSource: 'gate' } as SigniAttackBanAction;
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
  // ⚠**「《無》×Nを支払わないかぎり」を落とさない**（§6.4 O-31）＝落とすと「払っても正面はアタックできない」
  //   過剰実行になる（live 母集団1効果＝`WXDi-P16-047-E1` は**まさにその支払い形**だった）。
  //   枚数はここで焼き込む＝engine 側がカード全文 regex を読み直さない（§6.4 O-20 の再発防止）。
  if (t.match(/このシグニの正面にあるシグニでアタックできない/)) {
    const payFSA = t.match(/((?:《[白赤青緑黒無]》)+)を支払わないかぎり/);
    const nFSA = payFSA ? (payFSA[1].match(/《/g) ?? []).length : 0;
    return { type: 'STUB', id: 'BLOCK_FRONT_SIGNI_ATTACK', ...(nFSA > 0 ? { value: nFSA } : {}) } as StubAction;
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
  // 🏁§5.3 `O-79` で `SELF_PLAY_RESTRICT{never, exceptSourceCardNames}` へ移した（`parseSelfPlayRestrict`）。
  //   旧 `STUB{DEPLOY_RESTRICT{only_by_effect}}` は engine にログしか無い死枝だったので撤去した。

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

  // ---- 対戦相手のシグニをエナゾーンに置く（エナ送り。バニッシュとは別アクション） ----
  // ⚠**BANISH は `parseSigniTarget` を通すのに、エナ送りは narrow な regex で filter を手組みしていた**＝
  //   同じ修飾でも動詞によって落ちる（PLAN §4 教訓 (i)「同じ語彙でも入口ごとに壊れ方が違う」の再来）。
  //   実測＝「対戦相手の**ダウン状態の**シグニ1体を対象とし、それをエナゾーンに置く」は
  //   バニッシュなら `isDown:true` が載るのに、エナ送りでは **UNKNOWN** に落ちていた（`WXEX2-20-E3`）。
  //   修飾つきの「〜を対象とし、（それを）エナゾーンに置く」は共通の対象パーサへ寄せる。
  {
    const tgtM = t.match(/対戦相手の[^。]*シグニ(?:[０-９\d]+体|１体)?を対象とし、?(?:それを)?エナゾーンに置く$/);
    if (tgtM) {
      const tgt = parseSigniTarget(t, 'opponent');
      // ⚠「この方法で捨てたシグニと**同じレベル**の」＝同一性参照。`parseSigniTarget` は持たないので
      //   ここで載せる（`effectParser` の `IDENTITY_BATCH5B` は**付与能力の内側には届かない**＝
      //   `WXEX2-20-sub-E1` で実測）。キーは同型の兄弟 `WXK06-060-E1` に合わせる。
      //   ⚠載せないと「同じレベル」限定が落ちて**どのダウン状態シグニでもエナ送りできる過剰効果**になる。
      if (/この方法で捨てたシグニと同じレベル/.test(t)) {
        tgt.filter = { ...(tgt.filter ?? {}), levelEqLastProcessed: true };
      }
      return { type: 'SEND_TO_ENERGY', target: tgt } as SendToEnergyAction;
    }
    const m = t.match(/対戦相手のシグニ([０-９\d]*)体(?:を対象とし、)?(?:それを)?エナゾーンに置く/);
    if (m) {
      const cnt = m[1] ? parseNum(m[1]) : 1;
      return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: cnt } } as SendToEnergyAction;
    }
  }
  if (t.match(/対戦相手は自分の.+シグニ.+選び.+エナゾーン/)) {
    return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as SendToEnergyAction;
  }

  // ---- サーバントZEROにする / シグニ名変更 ----
  if (t.match(/それを《サーバント.*》にする/)) {
    return { type: 'STUB', id: 'MAKE_SERVANT_ZERO' } as StubAction;
  }

  // ---- 可能ならばこのシグニを対象とする（強制ターゲット） ----
  if (t.match(/可能ならばこのシグニを対象とする/)) {
    return { type: 'STUB', id: 'FORCE_TARGET_SELF' } as StubAction;
  }

  // ---- （デッキ／トラッシュから）エナゾーンに置かれたとき、このカードをエナゾーンから手札に加えてもよい ----
  // 🔴旧実装は `STUB{ENERGY_TO_HAND_ON_DECK}`＝**エナのどのカードでも手札に戻せる過剰実行**だった
  //   （engine 側ハンドラも `ctx.ownerState.energy` 全部を候補に出す）。原文は必ず「**この**カードを」
  //   なので効果元自身に固定するのが正しい＝`WX17-052-LAYER`（「この**シグニ**を〜」）が最初から
  //   使っていた `TRANSFER_TO_HAND{ENERGY_CARD, filter:{thisCardOnly}}` と同じ受け皿へ寄せる。
  // ✅旧コメントが「弁別できない」と書いていた WXDi-P12-079-E2（デッキ由来）と WXK09-031-E2（トラッシュ
  //   由来）の**弁別はそもそも不要**＝出所の違いは timing／triggerCondition が既に運んでおり、
  //   アクション（自分自身をエナ→手札）は両者で同一。同一文字列に潰れて構わない。
  // ⚠「してもよい」は `upToCount` で表す（`TRANSFER_TO_HAND` に optional キーは無い）。
  if (t.match(/(?:デッキから.*エナゾーンに置かれたとき.*|このカードをエナゾーンから)手札に加えてもよい/)) {
    return { type: 'TRANSFER_TO_HAND', source: {
      type: 'ENERGY_CARD', owner: 'self', count: 1, upToCount: true, filter: { thisCardOnly: true },
    } } as EffectAction;
  }

  // ---- 正面にシグニがない場合アタックしたシグニの正面に配置 ----
  if (t.match(/正面にシグニがない場合.*正面に配置してもよい/)) {
    return { type: 'STUB', id: 'MOVE_TO_ATTACKER_FRONT' } as StubAction;
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

  // ---- 手札枚数につきパワー修正（対象・所有者・作品クラス・持続を構造化） ----
  const handPowerM = t.match(/手札[１1]枚につき([－＋][０-９\d]+)する/);
  if (handPowerM && !/この方法で捨てた手札/.test(t)) {
    const isAll = /すべての/.test(t);
    const owner = /対戦相手の(?:すべての)?シグニ|対戦相手のシグニ[１1]体/.test(t) ? 'opponent' : 'self';
    const storyM = t.match(/＜([^＞]+)＞のシグニ/);
    const until = /次の対戦相手のターン終了時まで/.test(t) ? 'UNTIL_OPP_TURN_END' as const : undefined;
    return {
      type: 'POWER_MODIFY_PER_HAND_COUNT',
      target: {
        type: 'SIGNI', owner, count: isAll ? 'ALL' : 1,
        ...(storyM ? { filter: { story: storyM[1] } } : {}),
        ...(isAll ? {} : { upToCount: false }),
      },
      deltaPerCard: parseSignedNum(handPowerM[1]),
      handOwner: 'self',
      ...(/あなたの他の/.test(t) ? { excludeSelf: true } : {}),
      ...(until ? { until } : {}),
    };
  }
  if (t.match(/手札[１-９\d]+枚につき[－＋][０-９\d]+/)) {
    return { type: 'STUB', id: 'POWER_MOD_BY_HAND_COUNT' } as StubAction;
  }

  // ---- このターン対戦相手はパワーNのシグニでアタックできない ----
  if (t.match(/対戦相手はパワーが\d+以下のシグニでアタックできない/)) {
    return { type: 'STUB', id: 'OPP_SIGNI_ATTACK_POWER_RESTRICT' } as StubAction;
  }

  // ---- 対戦相手は自分のセンタールリグより低いレベルを持つシグニでアタックできない（WXK11-003②）----
  // 「自分の」＝対戦相手自身のセンタールリグ＝キャスター視点の levelLtOppLrig（execBlockAction が
  // resolveDynamicFilter で level.max へ解決してから keyword_grants 付与）。
  if (t.match(/^(?:このターン、)?対戦相手は自分のセンタールリグより低いレベルを持つシグニでアタックできない$/)) {
    return {
      type: 'BLOCK_ACTION',
      target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ', levelLtOppLrig: true } },
      actionId: 'ATTACK', until: 'END_OF_TURN',
    } as BlockActionAction;
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

  // ---- デッキ上複数枚見て一部を場に出す／エナへ・残りをデッキ下（§6.4 UNKNOWN 消化）----
  // 「その中から＜X＞のシグニN枚を場に出し、残りを好きな順番でデッキの一番下に置く」。
  // ⚠直前の `LOOK_AND_REORDER` と `effectParser` の融合規則で `REVEAL_AND_PICK` に畳まれる
  //   （単独では公開枚数が分からない）。融合しない配置では STUB のまま残る。
  if (t.match(/その中から.*(?:シグニ|スペル|カード).*(?:場に出|エナゾーンに置)[^。]*、残り.*デッキの一番下に置く/)
      && !t.includes('手札に加え')) {
    return makeRevealPickStub(t);
  }

  // ---- 同上の「残りを（好きな順番で）デッキの**一番上**に戻す／置く」（2026-08-28 Sheet1 バッチ）----
  // 「その中から＜天使＞のシグニを２枚まで場に出し、残りを好きな順番でデッキの一番上に戻す」（`WX11-026-E2`）。
  // 🔴従来はこの形の規則が無く、下の単文規則 `残りを好きな順番でデッキの一番上に戻す` が当たって
  //   **`LOOK_AND_REORDER{count:0}` だけ**を返していた＝**「＜天使＞を2枚まで場に出す」が丸ごと消失**
  //   （live は「3枚公開 → 0枚見て戻す」という無意味な木だった）。
  // ⚠**「デッキの一番下」が同じ文にある形は除く**＝`WXK03-048-E1` の
  //   「…場に出し、**好きな枚数を好きな順番でデッキの一番下に置き**、残りを…一番上に戻す」は
  //   中間の振り分け節（`remainder.position:'split_top_bottom'` 相当）が要るので、ここでは触らない。
  if (t.match(/その中から.*(?:シグニ|スペル|カード).*(?:場に出|エナゾーンに置)[^。]*、残り.*デッキの一番上に(?:戻す|置く)/)
      && !t.includes('手札に加え') && !t.includes('デッキの一番下')) {
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

  // ---- 次の対戦相手のメイン/アタックフェイズの間、相手のトラッシュは相手の効果で動かない ----
  // （タスク12(lxi) 第9波・`WX24-P4-007-E1` の③／`WXDi-P14-005-E1` の③。全CSVでこの2枚だけ）
  // ⚠**engine 未実装の宣言 STUB**＝トラッシュを発生源にする移動を「その所有者自身の効果のときだけ」
  //   止める機構が無い（`trashCandidates` の7呼び出し地点に加え、トラッシュから直接動かす STUB 群が
  //   別経路で存在する）。UNKNOWN のまま埋もれるより **STUBS.md と census に載る名前を付けて可視化**する。
  //   実装方針は PLAN §3 タスク12 の該当行を参照。
  if (t.match(/^次の対戦相手のメインフェイズとアタックフェイズの間[、,]対戦相手のトラッシュにあるカードは対戦相手の効果によって他の領域に移動しない$/)) {
    return { type: 'STUB', id: 'LOCK_OPP_TRASH_MOVE' } as StubAction;
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
    return { type: 'STUB', id: 'SELECT_OTHER_SIGNI', selectTarget: parseSigniTarget(t, 'self') } as StubAction;
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
  // 「てもよい」＝任意。「そうした場合」の did-it ゲートと組で使われ、optional を落とすと engine が強制で
  //   手札を捨てさせてしまう（curated が持つ optional:true を復元＝§3 タスク12(vii)系）。
  if (t.match(/^手札を([０-９\d]+)枚捨ててもよい$/)) {
    const cnt = parseNum((t.match(/([０-９\d]+)枚/) ?? [])[1] ?? '1');
    return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt }, optional: true };
  }

  // ---- それの【出】能力は発動しない（出コストを支払ったが効果を抑止）----
  if (t.match(/それの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;
  }

  // ---- このシグニを場からトラッシュに置いてもよい ----
  // 「この**シグニ**」＝効果元自身のみ（thisCardOnly）。「置いても**よい**」＝任意（optional）。
  // 任意スキップ時は engine が後続 CONDITIONAL(IS_MY_TURN)=「そうした場合」も実行しない（execTrash:706 / execSequence did-it ゲート）。
  // これが無いと自分の**全**シグニがトラッシュ候補になり、かつ強制実行＋「そうした場合」の本体も常時発火する退化になる
  // （WX19-031/WX19-034/WXK10-032/WXK10-033/WXEX2-31）。
  if (t.match(/^このシグニを場からトラッシュに置いてもよい$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, optional: true };
  }

  // ---- 《色》を支払ってもよい（単色任意コスト）→ OPTIONAL_COST with costColors ----
  if (t.match(/^《[赤青緑黒白無]》を支払ってもよい$/)) {
    const costColors = [...t.matchAll(/《([^》]+)》/g)].map(m => m[1]);
    return { type: 'STUB', id: 'OPTIONAL_COST', costColors } as StubAction;
  }

  // ---- 《コインアイコン》を支払ってもよい → OPTIONAL_COST with coinCost（§6.4・2026-08-10）----
  //   engine 側（`effectExecutor` の OPTIONAL_COST 分岐・`coinCost` 参照）は**最初から実装済み**なのに
  //   **parser が一度も生成していなかった**＝素の `OPTIONAL_COST`（payload 無し＝コスト0）へ落ちて
  //   **コインを払わずに強い方の効果が撃てる**過剰効果だった（`WXDi-P07-055/072/094` 等）。
  //   唯一正しかった `WXDi-P07-066-BURST` は MANUAL で手書きされていた＝それが正準形。
  if (t.match(/^《コインアイコン》+を支払ってもよい$/)) {
    return { type: 'STUB', id: 'OPTIONAL_COST', coinCost: (t.match(/《コインアイコン》/g) ?? []).length } as StubAction;
  }

  // ---- （使用コストとして）追加でエクシードN を支払ってもよい → OPTIONAL_COST with exceed ----
  //   engine（`effectExecutor` の OPTIONAL_COST 分岐・`exceed` 参照）は実装済みで、**live の12枚は
  //   すべて手で MANUAL 化して `exceed` を書いていた**＝parser が一度も生成していなかった穴（§6.4 O-6 と同型）。
  //   規則を足すと、その12枚が AUTO で同じ形に到達できる（＝以後の parser 改善が届くようになる）。
  //   ⚠素の `OPTIONAL_COST`（payload 無し）はコスト0＝**タダで強い方の効果が撃てる**過剰効果になる。
  {
    // ⚠2026-08-16（§6.4 O-11）＝**先頭の「このスペル/ピースを使用する際、」で `^` アンカーが外れて**
    //   規則が一度も当たらず、bare `OPTIONAL_COST`（＝エクシードがタダ）になっていた形が21効果あった。
    //   使用宣言の前置きを許容する。⚠`$` 側は緩めない（後続の本体文まで飲み込むと帰結が消える）。
    const m = t.match(/^(?:その後、)?(?:この(?:スペル|ピース|アーツ|カード)を使用する際、)?(?:使用コストとして)?追加でエクシード([０-９\d]+)を支払ってもよい$/);
    if (m) {
      return {
        type: 'STUB', id: 'OPTIONAL_COST',
        // ⚠使用宣言の前置き（「このピースを使用する際、」）は逆翻訳に出さない＝支払う中身だけを残す（O-133 B群）。
        costText: t.replace(/^(?:その後、)?(?:この(?:スペル|ピース|アーツ|カード)を使用する際、)?/, ''),
        exceed: parseNum(m[1]),
      } as StubAction;
    }
  }

  // ---- あなたのルリグゾーンに【リミットアッパー】を置く ----
  // 🆕**「【リミットアッパー】１つを**得る**」も同じ受け皿**（2026-08-31 §5.2・`WX24-P3-041-E1`・原文1枚）。
  //   🔴旧＝汎用の `GRANT_KEYWORD{keyword:'リミットアッパー'}` に落ちており、**シグニ1体に文字列を付ける**
  //     別物だった（`limit_upper_token` を読むリミット計算にはどこからも届かない＝無言 no-op）。
  if (t.match(/ルリグゾーンに【リミットアッパー】[０-９\d]*つを置く/)
      || t.match(/^【リミットアッパー】[０-９\d]*つを得る$/)) {
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
  if (t.match(/対戦相手のシグニ[０-９\d]*体を対象とし、(?:《[赤青緑黒白無]》)+を支払ってもよい/)) {
    const costColors = extractCostColors(t);
    return { type: 'STUB', id: 'TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST', costColors } as StubAction;
  }

  // ---- その中からカード1枚を【シード】/【トラップ】として設置 ----
  if (t.match(/その中からカード[０-９\d]+枚を【シード】として.*シグニゾーンに出して/)) {
    return { type: 'STUB', id: 'PLACE_SEED_FROM_REVEALED' } as StubAction;
  }
  // ⚠「その中から**カード**1枚を」と「その中から1枚を」は同義（`WX17-041-E1` だけが後者）。
  //   「カード」必須にしていたため 1効果だけ下の `PLACE_TRAP_OPTIONAL`（＝手札固定）へ落ち、
  //   **デッキから見た3枚ではなく手札のカードを設置**していた（§5.3 `O-55`）。緩めると
  //   `foldPlaceTrapFromRevealed` が兄弟10効果と同じ `LOOK_PICK_CHAIN{then:'trap'}` へ畳み込む
  //   （残りの行き先＝`LOOK_AND_REORDER{count:0}` の死ステップも同時に解消する）。
  if (t.match(/その中から(?:カード)?[０-９\d]+枚(?:まで)?を?【トラップ】として.*シグニゾーンに設置/)) {
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

  // ---- 対戦相手のパワーN以下のシグニをエナゾーンに置く（エナ送り。バニッシュとは別アクション） ----
  {
    const enaM = t.match(/対戦相手のパワー([０-９\d]+)以下のシグニ([０-９\d]*)体?を対象とし、それをエナゾーンに置く/);
    if (enaM) {
      const cnt = enaM[2] ? parseNum(enaM[2]) : 1;
      return { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: cnt, filter: { powerRange: { max: parseNum(enaM[1]) } } } } as SendToEnergyAction;
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
  // 「ベット―」で始まるカード全体は①②③選択＋ベット強化のBET_MECHANICとして扱う。
  // 「あなたがベットしていた場合、代わりに」はBET_MECHANIC本文にも必ず含まれるため、
  // こちらを先に判定すると全てのベットカードがBET_ALTERNATIVE（no-op）に誤分類されてしまう。
  if (t.match(/^ベット―/)) {
    return { type: 'STUB', id: 'BET_MECHANIC' } as StubAction;
  }
  if (t.match(/あなたがベットしていた場合、代わりに/)) {
    return { type: 'STUB', id: 'BET_ALTERNATIVE' } as StubAction;
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
    return tradeOptionalCost(t);
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
  // ⚠TRASH: バニッシュ（エナ送り）ではない（続き19是正）
  if (t.match(/^(?:その|それ)(?:シグニ)?を場からトラッシュに置く$/)) {
    return { type: 'TRASH', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as TrashAction;
  }

  // ---- それらの【出】能力は発動しない ----
  if (t.match(/それらの【出】能力は発動しない/)) {
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'any', count: 'ALL' }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;
  }

  // ---- シグニゾーンを指定する ----
  {
    // §6.4 O-16: 語順が2通りある＝「シグニゾーン**１つを**指定する」／「シグニゾーン**を２つまで**指定する」。
    // 枚数を読まないと 2ゾーン指定が1つに潰れる（`WX25-P3-014-E2`）。
    const dszM = t.match(/(?:あなたの|対戦相手の)?シグニゾーン(?:([０-９\d]+)つを|を([０-９\d]+)つ(?:まで)?)指定する/);
    if (dszM) {
      const countDsz = parseNum(dszM[1] ?? dszM[2] ?? '1');
      return { type: 'STUB', id: 'DESIGNATE_SIGNI_ZONE', ...(countDsz > 1 ? { count: countDsz } : {}) } as StubAction;
    }
    if (t.match(/(?:あなたの|対戦相手の)?シグニゾーンを指定する/)) {
      return { type: 'STUB', id: 'DESIGNATE_SIGNI_ZONE' } as StubAction;
    }
  }

  // ---- この効果で公開したカードを好きな順番でデッキの一番上に戻す ----
  if (t.match(/この効果で公開したカードを好きな順番でデッキの一番上に戻す/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 0, private: false, reorder: true, destination: { location: 'deck', owner: 'self', position: 'top' } };
  }

  // ---- そのカードをデッキの一番下に置いてもよい ----
  // 🔴**「置いて**もよい**」＝任意なので行き先は `split_top_bottom`**（続き742-2）。
  //   `position:'bottom'` は**必ずデッキ下へ送る**ので、原文の「置いてもよい」が**強制**に化けていた
  //   （意味照合 段2 finding が4件）。`split_top_bottom` は「選んだものだけ下・残りは上」なので、
  //   **1枚のときは そのまま『下に置く／置かない』の二択**になる＝これが既存の受け皿
  //   （UI は `EffectInteractionModal` の isSplit 分岐、確定は `BattleScreen` の bottomList＝**実装済み**）。
  if (t.match(/そのカードをデッキの一番下に置いてもよい/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: false, reorder: false, destination: { location: 'deck', owner: 'self', position: 'split_top_bottom' } };
  }

  // ---- 対戦相手がアーツを使用できない ----
  if (t.match(/このターン、あなたはアーツを使用できない/)) {
    return { type: 'STUB', id: 'PREVENT_OWN_ARTS_USE' } as StubAction;
  }

  // ---- 追加ターン ----
  // 🆕**誰が得るかを payload で刻む**（§5.3 `O-60` 第10バッチ・2026-08-29）＝engine が
  //   **カード全文**を regex で読んで相手側かを決めていたのを剥がすため。
  //   ⚠ここは**文単位**の `t` なので、同じカードの別能力の「対戦相手は」を巻き込まない。
  if (t.match(/追加の[０-９\d]*ターンを得る/)) {
    return {
      type: 'STUB', id: 'GAIN_EXTRA_TURN',
      ...(/対戦相手は[^。]*追加の[０-９\d]*ターンを得る/.test(t) ? { extraTurnOwner: 'opponent' as const } : {}),
    } as StubAction;
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

  // ---- 〈誰か〉のエナゾーンの全カードをトラッシュに置く ----
  // 🔴従来は **`あなたの`＋`から` の1綴りだけ**を見ており（§6.4 O-35・続き528 で実測）、
  //   ①「**対戦相手の**エナゾーンからすべてのカードを〜」は下流の汎用規則に拾われて
  //     **`count:1`＝1枚だけ**に化けていた（`PR-470B-E2`＝アタックのたびに相手エナ全損のはずが1枚）
  //   ②「エナゾーンに**ある**すべてのカードを〜」（から→にある）は**規則ゼロで UNKNOWN**
  //     （`WX11-020-E1` は条件節ごと `CONDITIONAL_POWER_BONUS` へ落ちて無言 no-op）
  //   だった。所有者と2綴りをまとめて受ける。
  // ⚠**「手札と**エナゾーンにある〜」（2ゾーン同時）は対象外**＝`あなたの` の直後が `エナゾーン` で
  //   ないので自然に外れる。片方だけ実行する近似にしないため、あえて広げない。
  const massEnergyTrashM = t.match(/^(?:(あなた|対戦相手)(?:は自分)?の)?エナゾーン(?:から|にある)すべてのカードをトラッシュに置く$/);
  if (massEnergyTrashM) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: massEnergyTrashM[1] === '対戦相手' ? 'opponent' : 'self', count: 'ALL' } };
  }

  // ---- 手札からクラス等のシグニをN枚捨ててもよい ----
  // WXK04-084 限定：色コスト＋特定名カードの手札捨てを1つの任意追加コストとして保持する。
  // 汎用の「〜してもよい」へ広げず、このカード名・色列の原文形だけを実体化する。
  if (/^《緑》《緑》《無》を支払い、手札から《幻水マレガビ》を１枚捨ててもよい$/.test(t)) {
    return {
      type: 'STUB', id: 'OPTIONAL_COST', costColors: ['緑', '緑', '無'],
      costText: '《緑》《緑》《無》を支払い、手札から《幻水マレガビ》を１枚捨ててもよい',
    } as StubAction;
  }
  {
    const optDiscardM = t.match(/手札から(.+?)のシグニ?を([０-９\d]+)枚?捨ててもよい/);
    if (optDiscardM) {
      const cnt = parseNum(optDiscardM[2]);
      // クラス修飾子（＜X＞/色/レベル）を名詞句スパン（optDiscardM[1]）から付与。
      // 旧実装は parseCardTypeFilter のみで「＜天使＞」等を空filterに落としていた（捨てる版 part1:1623 と整合させる）。
      const g = optDiscardM[1];
      const filter: TargetFilter = {
        ...(optDiscardM[0].includes('シグニ') ? { cardType: 'シグニ' as const } : {}),
        ...parseStoryFilter(g), ...parseColorFilter(g), ...parseLevelFilter(g),
      };
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt, filter } };
    }
  }
  // ---- （対象なし・文頭）手札から＜クラス＞のカードをN枚捨ててもよい ----
  // 対象指定（「…を対象とし、」）を伴うものは後段の TARGET_AND_DISCARD_HAND に回すため文頭限定。
  // ＜クラス＞指定のあるものに限定（無指定の任意捨ては従来どおり OPTIONAL_COST 等に委ねる）。
  {
    const optDiscardCardM = t.match(/^手札から(＜[^＞]+＞)のカードを([０-９\d]+)枚?捨ててもよい/);
    if (optDiscardCardM) {
      const cnt = parseNum(optDiscardCardM[2]);
      const filter = { ...parseCardTypeFilter(optDiscardCardM[1]), ...parseStoryFilter(optDiscardCardM[1]) };
      return { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: cnt, filter } };
    }
  }

  // ---- 対戦相手が任意コストを支払う（`OPPONENT_PAY_OPTIONAL` ＋ 直後 CONDITIONAL の look-ahead ペア）----
  // ⚠**従来は「支払ってもよい」しか見ていなかった**（§6.4・続き425）。同じ「対戦相手は〜てもよい」でも
  //   **手札を捨てる**形はここに掛からず下の汎用手札捨て規則へ落ち、`TRASH{HAND_CARD, owner:'self'}`
  //   ＝**自分が捨てる**へ所有者が反転していた（`WXDi-P05-037-E1`＝アタック無効化の可否が逆転／
  //   `WXDi-P07-010-E2`）。engine 側は `opponentHandDiscard` を最初から持っていた（`parseOpponentUnlessCost`
  //   が「対戦相手が手札をN枚捨てないかぎり」用に生成する）＝**parser が生成していなかっただけ**。
  // ⚠**「まで」は除外**＝`OPPONENT_PAY_OPTIONAL` は all-or-nothing の pay/skip なので、
  //   「N枚まで捨ててもよい」（捨てた枚数に比例する帰結を持つ）は表せない（`WXDi-P09-064` は MANUAL）。
  // ⚠主語判定は**最後の読点以降の節**で見る（前置きの条件節を巻き込まないため。part1 の除外と同じ軸）。
  const oppPayClause = t.slice(t.lastIndexOf('、') + 1);
  if (/^対戦相手は/.test(oppPayClause) && /てもよい/.test(oppPayClause) && !/まで/.test(oppPayClause)) {
    const costColors = extractCostColors(oppPayClause);
    const handM = oppPayClause.match(/手札を([０-９\d]+)枚捨て/);
    if (costColors.length > 0 || handM) {
      return {
        type: 'STUB', id: 'OPPONENT_PAY_OPTIONAL',
        ...(costColors.length ? { costColors } : {}),
        ...(handM ? { opponentHandDiscard: parseNum(handM[1]) } : {}),
      } as StubAction;
    }
  }

  // ---- 任意コスト支払い（広い汎用パターン）→ STUB with costColors ----
  if (t.match(/を支払ってもよい$/) || t.match(/を支払ってもよい。$/)) {
    const costColors = extractCostColors(t);
    // 🆕《コインアイコン》のコイン支払い（§6.4・2026-08-10）。`extractCostColors` は色しか拾わないため、
    //   コインだけのコストが**payload 無しの OPTIONAL_COST＝コスト0**に落ちて**ただで撃てて**いた
    //   （`WXDi-P07-055/072/094` 等）。engine（`effectExecutor` の `coinCost`）は実装済みで、
    //   parser が一度も生成していなかっただけ。
    // ⚠**「を支払ってもよい」直前の《…》の連なりだけ**を数える＝同じ文の別の箇所にある
    //   「《コインアイコン》を得て」等を支払いに数え込まないため。
    const payTokens = t.match(/((?:《[^》]+》)+)を支払ってもよい/);
    const coinCost = (payTokens?.[1].match(/《コインアイコン》/g) ?? []).length;
    // 🆕「**この(シグニ|カード)を場からトラッシュに置き**《色》を支払ってもよい」＝自己トラッシュとエナを
    //   束ねた**1つの**任意コスト（§6.4 O-26・続き535）。従来はエナ側だけが `costColors` に載り、
    //   **自己トラッシュが丸ごと踏み倒されていた**（場を離れずに効果だけ得る過少コスト＝実測4効果）。
    //   engine は `OPTIONAL_COST{selfTrash}` を実装済み（`execUtils` の可否判定と支払いステップ）＝
    //   parser が生成していなかっただけ。⚠**最後の読点以降の節**で見る（前置きのトリガー句・
    //   「〜を対象とし、」を巻き込まないため。上の `oppPayClause` と同じ軸）。
    const payClause = t.slice(t.lastIndexOf('、') + 1);
    const selfTrashBundled = /^この(?:シグニ|カード)を場からトラッシュに置き/.test(payClause);
    const extra = {
      ...(costColors.length ? { costColors } : {}),
      ...(coinCost ? { coinCost } : {}),
      ...(selfTrashBundled ? { selfTrash: true } : {}),
    };
    const tradeCost = tradeOptionalCost(t);
    return tradeCost.id === 'OPTIONAL_COST'
      ? { ...tradeCost, ...extra }
      : { type: 'STUB', id: 'OPTIONAL_COST', ...extra } as StubAction;
  }

  // ---- 括弧で始まるルール説明（汎用スキップ）----
  if (t.startsWith('（') && (t.endsWith('）') || t.length > 8)) {
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;
  }

  // ---- デッキの一番下に置く系 ----
  const handToDeckBottom = t.match(/手札からカードを?([０-９\d]+)枚を(?:好きな順番で)?デッキの一番下に置く/);
  if (handToDeckBottom) {
    return {
      type: 'TRANSFER_TO_DECK',
      source: { type: 'HAND_CARD', owner: 'self', count: parseNum(handToDeckBottom[1]) },
      shuffle: false,
      position: 'bottom',
    };
  }
  // 🔴🆕§5.3 `O-142` の道中で発見（2026-08-29）＝**この2規則は原文が「一番下」なのに
  //   `TRASH{DECK_CARD}` を返しており、`execTrash` は `state.deck.slice(0, count)`＝**デッキの上**から捨てる。
  //   ⇒ 落ちるカードが原文と違い、後続の「この方法でトラッシュに置かれた〜」（`LAST_PROCESSED_*`／
  //     `perLastProcessed`）が**別のカードを見る**（`WXK10-026-E1` `WXK11-036-E2` `WXDi-P13-049-E1`）。
  // 🔑正準形 `MILL{fromBottom:true}` は**最初から在った**（`PR-K049`／`WXK02-055`／`WXK03-040` が使用）＝
  //   `parseSentencePart4` の「置く」版だけが正しく、**兄弟枝の2つが取り残されていた**（§5-8′ の再実証）。
  // 🆕**任意性（「置いてもよい」）はこの修正で一緒に戻った**＝上流が `STUB{OPTIONAL_ACTIVATE}` を
  //   前置する形になり、旧 `TRASH{DECK_CARD}`（任意性を落とした無条件ミル）から2点とも直った
  //   （`WXK10-026-E1` 実測）。
  if (t.match(/あなたのデッキの(?:下|一番下)からカードを?([０-９\d]+)枚?トラッシュに置く/)) {
    const m = t.match(/([０-９\d]+)枚/);
    const cnt = m ? parseNum(m[1]) : 1;
    return { type: 'MILL', owner: 'self', count: cnt, fromBottom: true } as EffectAction;
  }
  if (t.match(/あなたのデッキの一番下のカードをトラッシュに置いてもよい/)) {
    return { type: 'MILL', owner: 'self', count: 1, fromBottom: true } as EffectAction;
  }
  // 🔴🆕§5.3 `O-142` の道中で発見（2026-08-29）＝下の `LOOK_AND_REORDER` 規則は文末だけを見るので、
  //   「あなたの**トラッシュから**〈filter〉1枚を対象とし、それをデッキの一番下に置いてもよい」まで食い、
  //   **トラッシュではなくデッキの一番上を見る**別物になっていた（`WX24-P1-046-E2` `WX24-P4-048-E?`）。
  //   実害は2段＝①移動元が違う ②`lastProcessedCards` に別のカードが残るので、後続の
  //   「この方法でデッキに移動したシグニのパワーと同じだけ＋」（§5.3 `O-142`）が**別のカードのパワー**を掛ける。
  // 🔑受け皿 `TRANSFER_TO_DECK{source:TRASH_CARD, position:'bottom', optional}` は最初から在った。
  {
    const trashToBottomM = t.match(
      /^(?:あなたの)?トラッシュから(.*?)([０-９\d]+)枚(?:まで)?を?対象とし、それを(?:あなたの)?デッキの一番下に置いてもよい$/);
    if (trashToBottomM) {
      const np = trashToBottomM[1];
      const filter: TargetFilter = { cardType: /スペル/.test(np) ? 'スペル' : 'シグニ' };
      const story = np.match(/＜([^＞]+)＞/);
      if (story) filter.story = story[1];
      const color = np.match(/([白青赤緑黒])の/);
      if (color) filter.color = color[1];
      return {
        type: 'TRANSFER_TO_DECK',
        source: { type: 'TRASH_CARD', owner: 'self', count: parseNum(trashToBottomM[2]), filter },
        shuffle: false, position: 'bottom', optional: true,
      } as EffectAction;
    }
  }
  // 上の「そのカードを〜」枝と同じ理由で `split_top_bottom`（続き742-2）＝任意を行き先で表す。
  if (t.match(/(?:それ|そのカード)をデッキの一番下に置いてもよい$/)) {
    return { type: 'LOOK_AND_REORDER', source: { location: 'deck', owner: 'self' }, count: 1, private: true, reorder: false, destination: { location: 'deck', owner: 'self', position: 'split_top_bottom' } };
  }
  // ---- 「（その｜指定された）シグニゾーンにあるシグニでアタックできない」＝**ゾーン継続**（§6.4 O-16 第3波）----
  // ⚠従来は `count:1` へ落ちており、直前の DESIGNATE で選んだゾーンではなく**相手シグニ1体を選ぶ**別物だった。
  //   ゾーンに紐づけないと「そのゾーンに後から出たシグニ」に効かない（＝ゾーンを封じる原文の意図が死ぬ）。
  // ⚠期間は2通り＝「次の対戦相手のターンの間」（次ターンだけ）／「このターン」（現ターンだけ）。
  {
    const zoneAtkM = t.match(/(?:その|指定された|それらの)シグニゾーンにあるシグニで?アタックできない/);
    if (zoneAtkM) {
      const nextTurnZA = /次の(?:あなたの|対戦相手の)?ターン/.test(t);
      return {
        type: 'BLOCK_ACTION',
        target: {
          type: 'SIGNI', owner: 'opponent', count: 'ALL',
          filter: { cardType: 'シグニ' }, zoneSource: 'designated',
        },
        actionId: 'ATTACK',
        until: nextTurnZA ? 'NEXT_TURN' : 'END_OF_TURN',
      } as BlockActionAction;
    }
  }
  // ---- 「〈期間〉、対戦相手は（《無》×Nを支払わないかぎり、）〈中央/左/右〉のシグニゾーンにある
  //        シグニでアタックできない」＝**ゾーン限定のアタック禁止**（§6.4 O-33）----
  // 🔴従来は `BLOCK_ACTION{ATTACK, until:NEXT_TURN}` に潰れ、**支払い回避もゾーン限定も落ちて**いた
  //   （`WX25-CP1-050-E1`＝払っても中央以外まで止まる）。
  // ⚠**この関数の中の他のアタック禁止規則より前**に置く＝下の `^このターン、対戦相手は(.+?)シグニで
  //   アタックできない` は本文を丸ごと飲むので、後ろに置くとゾーン節が落ちる。
  // ⚠判定は `banMatches` の1点（`SigniAttackBan.zones`）＝**ゾーン添字は判定地点で引く**ので、
  //   掛けたあとにシグニが入れ替わっても「いまそのゾーンにいるシグニ」に掛かる（原文どおり）。
  {
    const zoneBanM = t.match(
      /^(このターン|次の対戦相手のターンの間|次の対戦相手のターン終了時まで)、対戦相手は(?:((?:《無》)+)を支払わないかぎり)?[、,]?(中央|左|右)のシグニゾーンにあるシグニでアタックできない/);
    if (zoneBanM) {
      return {
        type: 'SIGNI_ATTACK_BAN', owner: 'opponent',
        zones: [signiZoneIndexJa(zoneBanM[3])],
        ...(zoneBanM[2] ? { unlessPayColorless: (zoneBanM[2].match(/《無》/g) ?? []).length } : {}),
        // 「次の対戦相手の〜」＝このターン＋次のターンの2ターン分（`SIGNI_DEPLOY_BAN` と同じ規約）。
        ...(zoneBanM[1] === 'このターン' ? {} : { turns: 2 }),
      } as SigniAttackBanAction;
    }
  }

  // ---- 次の対戦相手のターンの間、特定ゾーンのシグニでアタックできない（ゾーン指定を伴わない残り）----
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
  // ⚠「その**対戦相手の**カードの…」のように所有者句が挟まる形がある（`WX25-P3-036-E1`）＝
  //   挟まると旧 regex は外れて丸ごと UNKNOWN に落ちていた（§6.4 UNKNOWN 消化）。
  if (t.match(/その(?:対戦相手の)?カードのライフバーストは発動しない/)) {
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CARD' } as StubAction;
  }

  // ---- 「あなたの手札から《アクセアイコン》を持つシグニをN枚（まで）エナゾーンに置く」（§6.4 O-15）----
  // 🔴従来は下の `PLACE_ACCE_SIGNI_TO_ENERGY` がこの形まで食っていた＝engine のハンドラ
  //   （`execStubPart2.ts` の `allAcceCards(sATE.field)`）は**場のアクセゾーン**のカードを全部エナへ送る
  //   別機構で、原文の「手札から2枚まで選ぶ」ではない（`WXEX1-44-E2` は手札が1枚も動かない）。
  // 🔑正準形は `ENERGY_CHARGE{HAND_CARD}`＝**語彙も engine も既に揃っている**（`execEnergyCharge` の
  //   HAND_CARD 分岐が `handCandidates` で filter を効かせ `selectOrInteract` で選ばせる）。
  //   同じ形は `WX22-043-E1`（MANUAL）が先に手当てしていた＝ここは parser を追いつかせるだけ。
  // ⚠**アクセは CardClass ではない**（〈遊具〉等のクラスとは別軸）＝《アクセアイコン》は専用フィルタ
  //   `hasIcon:'アクセ'`（`matchesFilter` が消費）。`story` や `cardClass` に書くと候補が空になる。
  {
    const handAcceM = t.match(/^あなたの手札から《アクセアイコン》を持つシグニを([０-９\d]+)枚(まで)?エナゾーンに置く$/);
    if (handAcceM) {
      return {
        type: 'ENERGY_CHARGE',
        target: {
          type: 'HAND_CARD', owner: 'self', count: parseNum(handAcceM[1]),
          ...(handAcceM[2] ? { upToCount: true } : {}),
          filter: { cardType: 'シグニ', hasIcon: 'アクセ' },
        },
      } as EnergyChargeAction;
    }
  }

  // ---- アクセアイコン持ちシグニをエナゾーンへ（＝**場のアクセゾーン**を全部エナへ）----
  // ⚠上の「手札から」形をここへ落とさないこと（機構が別＝原文と無関係な枚数が lastProcessedCards に載る）。
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

  // ---- ウィルスを除く（好きな数）----
  // 🆕**個数を payload で刻む**（§5.3 `O-60` 第11バッチ）＝engine がカード全文を読むのを剥がすため。
  if (t.match(/【ウィルス】を好きな数取り除く/)) {
    return { type: 'STUB', id: 'REMOVE_VIRUS', virusCount: 'any' } as StubAction;
  }

  // ---- マジックボックス/トラップ設置 ----
  if (t.match(/【マジックボックス】として.*シグニゾーンに設置/)) {
    return { type: 'STUB', id: 'PLACE_MAGIC_BOX' } as StubAction;
  }
  if (t.match(/【マジックボックス】.*表向きにし.*トラッシュに置いてもよい/)) {
    return { type: 'STUB', id: 'OPEN_MAGIC_BOX' } as StubAction;
  }
  // 🔴**出所（どこから【トラップ】にするか）を必ず読む**（§5.3 `O-55`）＝engine は `trapSource` 省略時に
  //   **手札固定**なので、原文が「そのカードを」「このシグニをエナゾーンから」と書いていても
  //   **手札の別カードが設置される**（`WX15-084`／`WX15-086`／`WX16-015`／`WX16-029`／`WX21-036`）。
  // ⚠「そのカード」＝直前の「デッキの一番上を見る」で見た札＝engine 側は `lastProcessedCards` で受ける。
  // ⚠「そのカード**か**、あなたの手札1枚」は**両方が候補**（片方に倒すと過小実行）。
  if (t.match(/【トラップ】として.*シグニゾーンに設置してもよい/)) {
    const trapSource: NonNullable<StubAction['trapSource']> =
      /この(?:シグニ|カード)を(?:あなたの)?エナゾーンから/.test(t) ? 'energy_self'
      : /その(?:カード)?か、?(?:あなたの)?手札/.test(t) ? 'looked_or_hand'
      : /(?:^|[、。])(?:あなたは)?そのカードを/.test(t) ? 'looked'
      : 'hand';
    // §5.3 `O-87`＝原文が「設置しても**よい**」なら任意、「設置**する**」なら強制。
    //   ⚠engine は既定を任意にしているので、**強制のときだけ false を刻む**。
    const trapPlaceOptional = /設置(?:しても|でき)?よい/.test(t);
    return {
      type: 'STUB', id: 'PLACE_TRAP_OPTIONAL',
      ...(trapSource !== 'hand' ? { trapSource } : {}),
      ...(trapPlaceOptional ? {} : { trapPlaceOptional: false }),
    } as StubAction;
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
  // 🔴§5.3 `O-60` 第8バッチ：engine はここまで**カード全文**を regex で読んで色を決めていた（＝同じカードの
  //   別能力の色まで拾いうる）。parser が色を刻み、engine は payload だけで判定する。
  {
    const oppColorCostM = t.match(/対戦相手のセンタールリグが(.*?)の場合、このアーツの使用コストは/);
    if (oppColorCostM) {
      const colorsACC = oppColorCostM[1].split(/か|と/).map(c => c.trim()).filter(Boolean);
      return {
        type: 'STUB', id: 'CONDITIONAL_ARTS_COST',
        artsCostCond: { kind: 'opp_center_lrig_color', colors: colorsACC },
      } as StubAction;
    }
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

  // ---- 〈対象宣言〉を対象とし、手札から〈限定〉をN枚捨ててもよい（対象宣言つきの任意コスト）----
  // 🔴下の総称 `TARGET_AND_DISCARD_HAND` は engine（`effectExecutor` Pattern ⑥）が
  //   **手札の末尾1枚を無条件に自動で捨てる**だけの近似で、①原文の限定（《ガードアイコン》を持つシグニ等）を
  //   無視し ②「〜てもよい」の任意性が消え ③対象宣言を保存しないので後続の「そうした場合、**それを**〜」が
  //   別のカードを掴む（§6.4 O-11・`SPDi43-26-E2`＝バウンス自体が丸ごと落ちていた）。
  // 🔑限定が**残りなく**解けたときだけ正準形 `OPTIONAL_COST{handDiscard:{count,filter}}` へ寄せる。
  //   解けなければ従来の総称 STUB のまま（取りこぼしを増やさない）。
  // ⚠**ここで対象宣言（`SELECT_TARGET_ONLY`/`STORE_LAST_PROCESSED_TARGETS`）を作ってはいけない**＝
  //   対象の束縛はカード単位の `applyDroppedTargetDesignation` が「そうした場合」ゲートを見ながら行う。
  //   文単位で入れ子 SEQUENCE を作ると、engine の任意コスト funnel が見る
  //   「`OPTIONAL_COST` の**直後の兄弟**がゲート」という隣接が壊れ、**払わなくても本体が走る**
  //   （実測7効果＝`SPDi43-15`／`WX12-017`／`WX24-P4-047` ほかで踏んだ）。
  {
    const desigCostM = t.match(
      /^(?:その後、)?((?:対戦相手|あなた)の[^、。]*?シグニを?[０-９\d]*体(?:まで)?)を?対象とし、手札から(.+?)を([０-９\d]+)枚捨ててもよい$/,
    );
    if (desigCostM) {
      const spec = desigCostM[2];
      // ⚠**カード種別は「シグニ」だけではない**＝`WX12-017-E1`「手札から**スペル**を１枚捨ててもよい」で
      //   `cardType` が落ちると `filter:{}` になり**手札のどのカードでも払える**（過剰実行）。
      //   「カード」は限定なし＝そのまま空でよい。
      const specNoun = /シグニ/.test(spec) ? 'シグニ' as const : /スペル/.test(spec) ? 'スペル' as const : null;
      const filter: TargetFilter = {
        ...(specNoun ? { cardType: specNoun } : {}),
        ...parseColorFilter(spec), ...parseStoryFilter(spec), ...parseLevelFilter(spec),
        ...(/《ガードアイコン》を持つ/.test(spec) ? { hasGuard: true } : {}),
      };
      // 限定語をすべて消費できたか（未知の修飾が残るなら受けない＝`costSpecFilter` と同じ規約）
      const rest = spec
        .replace(/＜[^＞]+＞/g, '').replace(/《ガードアイコン》を持つ/g, '')
        .replace(/レベル[０-９\d]+(?:以下|以上)?/g, '')
        .replace(/シグニ|カード|スペル|[の、,か]/g, '').replace(/[白赤青緑黒無]色?/g, '').trim();
      if (rest.length === 0) {
        return {
          type: 'STUB', id: 'OPTIONAL_COST',
          costText: `手札から${spec}を${desigCostM[3]}枚捨ててもよい`,
          handDiscard: { count: parseNum(desigCostM[3]), filter },
        } as StubAction;
      }
    }
  }

  // ---- 対戦相手のシグニ/ルリグN体を対象とし、（中間条件節を挟んでも）手札から〜を捨てる（複合パターン）----
  // 「対象とし、それが能力を持たない場合、手札から…捨ててもよい」「対戦相手のルリグを対象とし、手札から…捨ててもよい」も含む。
  if (t.match(/対戦相手の(?:シグニ|ルリグ)[０-９\d]*体?(?:まで)?を対象とし、.*?手札から.+捨て(?:る|てもよい)?$/)) {
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
    return tradeOptionalCost(t);
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
      // 「それら（＝同一対象）をダウンし凍結」→ 単一 FREEZE(down:true) で同じ対象に適用
      return { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: cnt, upToCount: true }, down: true } as FreezeAction;
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

  // ---- シグニゾーンへの新規配置禁止（タスク12(lxi) 第10波＋(lxxvi)）----
  // 「（このターンと）次のターンの間、対戦相手は（《無》×N を支払わないかぎり）〈ゾーン〉に
  //   シグニを新たに配置（することが）できない」。母集団は全CSVで5枚。
  // ⚠**ゾーンの供給源が3種類ある**（`zoneBlockSource`）＝ここを取り違えると別ゾーンを禁止する過剰実行になる：
  //   ①`指定された`／`その`  → 直前の DESIGNATE_SIGNI_ZONE（WX10-051-E1／WX24-P4-024-E3／WXDi-P11-009-E3）
  //   ②`それがあった`        → 直前に場を離れたシグニのゾーン（WX08-032-E1。engine は signi_zone_vacated_just を読む）
  //   ③`【ウィルス】がある`  → 該当ゾーンすべて＝**複数**（WXEX1-24-E1 ③）
  // ⚠この分岐は下の「このターンと次のターンの間」バケツより**前**に置くこと（後ろだと WXDi-P11-009 が奪われる）。
  // ⚠**供給源を判別できない書き方が来たら拾わない**＝`designated` にフォールバックするとゾーン1を
  //   問答無用で禁止する。新しい書き方は必ず zoneBlockSource を足してから regex を広げること。
  {
    const zbM = t.match(/(指定された|その|それがあった|【ウィルス】がある)シグニゾーンにシグニを新たに配置(?:することが)?できない/);
    if (zbM) {
      const zoneBlock: StubAction = { type: 'STUB', id: 'BLOCK_OPP_ZONE_PLACEMENT' } as StubAction;
      zoneBlock.zoneBlockSource = zbM[1] === 'それがあった' ? 'vacated'
        : zbM[1] === '【ウィルス】がある' ? 'virus' : 'designated';
      zoneBlock.zoneBlockThisTurn = /このターンと次のターンの間/.test(t) || /^このターン[、,]/.test(t);
      zoneBlock.zoneBlockNextTurn = /次のターンの間/.test(t);
      const payZB = t.match(/((?:《無》)+)を支払わないかぎり/);
      if (payZB) zoneBlock.zoneBlockColorless = (payZB[1].match(/《無》/g) ?? []).length;
      return zoneBlock;
    }
  }

  // ---- （このターンと次のターンの間、）対戦相手は〈条件〉のシグニを新たに場に出せない（§6.4 O-3）----
  // 判定は `deployLimitBlockReason`（通常召喚UI／召喚ゾーンモーダル／CPU 召喚／engine の効果配置が共有する funnel）。
  // ⚠ここで拾えない条件は下の受け皿へ落とす＝**条件を落として拾うと全シグニ配置禁止になる**（致命的な過剰効果）。
  {
    const twoTurns = /このターンと次のターンの間/.test(t);
    if (twoTurns && /新たに場に出せない/.test(t)) {
      // 「（この方法で〜置いた）シグニと同じ名前の」「それと同じ名前の」＝直前の対象と同名を禁止。
      if (/と同じ名前のシグニを新たに場に出せない/.test(t)) {
        return { type: 'SIGNI_DEPLOY_BAN', owner: 'opponent', turns: 2, namesFromTargets: true } as SigniDeployBanAction;
      }
      // 「自分の、シグニとスペルの効果によって」＝出自限定（通常召喚とアーツ/ルリグ/キーの効果は禁止されない）。
      if (/自分の、?シグニとスペルの効果によってシグニを新たに場に出せない/.test(t)) {
        return { type: 'SIGNI_DEPLOY_BAN', owner: 'opponent', turns: 2, bySource: 'signi_or_spell_effect' } as SigniDeployBanAction;
      }
    }
  }

  // ---- このターンと次のターンの間〜（二ターン効果）----
  // ⚠これは**未パース節の受け皿**であって特定の機構ではない（§6.4 O-3 続き459）。
  //   従来 `LRIG_GROW_RESTRICT` へ落としていたが、その id は「このルリグは〜のルリグにしかグロウできない」
  //   専用のはずで、**まったく無関係な文が同じ名前で溜まる**ため `census:stubs` が「D 健全」と誤分類し、
  //   真 no-op が計器から消えていた。id を分けて A群（明示 defer）に出す。
  if (t.match(/このターンと次のターンの間/)) {
    // ✅「場以外のあなたの領域にあるカードは、対戦相手の効果によって他の領域に移動しない」（`WXK10-004`）は
    //   続き493 で `ZONE_MOVE_IMMUNITY`（part2・ターン数カウントダウン）へ移行した＝ここには落ちてこない。
    //   ⚠保護できるのは現状 hand / energy だけ（既存 `PREVENT_NON_FIELD_MOVE_BY_OPP` と同じ近似）＝
    //   デッキ／トラッシュ／ライフ側の移動地点はまだ funnel が無い（PLAN §6.4 O-3 に記載）。
    return { type: 'STUB', id: 'DEFERRED_UNPARSED_THIS_AND_NEXT_TURN_CLAUSE' } as StubAction;
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

  // ---- 色を選択する（§5.3 `O-87`＝`SELECT_COLOR`）----
  // 🔴旧 `STUB{CHOOSE_COLOR_FROM_LIST}` は**engine がカード全文を `最大N色` で読んでいた**（§5.3 `O-60` A群）。
  //   ⇒ 上限を payload に刻み、engine は JSON だけを見る。
  {
    const enaColorM = t.match(/あなたのエナゾーンにあるカードが持つ色から最大([０-９\d]+)色まで選ぶ/);
    if (enaColorM) {
      return { type: 'SELECT_COLOR', from: 'energy', count: parseNum(enaColorM[1]) } as EffectAction;
    }
  }
  // 「この方法で手札に加えたカード１枚につきそのカードに含まれる色１つを選択する」（`WX12-Re07`）＝
  // **直前に処理した各カードごとに、そのカードが持つ色から1つ**。⚠エナゾーンの色ではない。
  if (t.match(/この方法で.*[１1]枚につき.*そのカードに含まれる色[１1]つを選択する/)) {
    return { type: 'SELECT_COLOR', from: 'last_processed' } as EffectAction;
  }

  // ---- 対戦相手の場にある【ウィルス】を取り除く ----
  {
    const mRV = t.match(/対戦相手の場にある【ウィルス】([０-９\d]*)つを取り除く(?:てもよい)?/);
    if (mRV) {
      const nRV = mRV[1] ? parseNum(mRV[1]) : 1;
      return { type: 'STUB', id: 'REMOVE_VIRUS', virusCount: nRV } as StubAction;
    }
  }

  // ---- あなたのシグニに手札からカードを裏向きで付ける ----
  // 🔴§5.3 `O-60` 第6バッチ＝**これは「下に置く」ではない**（旧実装はペイロード無しで
  //   `PLACE_CARD_UNDER_SIGNI` へ流し込み、engine のフォールバックが**直前に処理したカードを
  //   シグニの下へ積んでいた**＝原文と無関係の盤面変化）。
  // 🆕§5.3 `O-81`（2026-08-26）＝受け皿 `field.signi_facedown_attached` を実装して typed アクション化。
  //   ⚠**【チャーム】ではない**（原文に【チャーム】の語が無い）＝`ATTACH_CHARM` に寄せてはいけない。
  // ⚠**母集団は実測1件**（`WX16-003-E2`）で、そのカードは後続2文
  //   「そのシグニが場を離れる場合、追加で…公開し手札に戻す」「この方法でシグニを公開したとき、…バニッシュする」
  //   が**別の ON_LEAVE_FIELD watcher（`WX16-003-E3`）になる**＝文単位の parser では組めないので
  //   **カード全体を `manualEffects.ts` で MANUAL 化**している。ここの規則は
  //   「後続句を持たない同型カードが将来出たとき」のための受け皿。
  if (t.match(/手札からカード[０-９\d]*枚?を裏向きで付ける/) ||
      t.match(/あなたのシグニ.+に.+手札からカードを.+付ける/)) {
    return {
      type: 'ATTACH_FACEDOWN_FROM_HAND',
      to: { type: 'SIGNI', owner: 'self', count: 1 },
      count: 1,
    } as EffectAction;
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
    // ⚠**枚数語の位置が2通りある**（「カード３枚を」／「カードを３枚」）うえ、**クラス限定が挟まる形**
    //   （「このシグニの下から＜ブルアカ＞のカードを３枚…」＝`WX25-CP1-091-E2`）があり、従来は後者2つが
    //   規則に掛からず `UNKNOWN` へ落ちていた。**任意コストで落ちると本体だけ無条件に走る**＝
    //   `WX25-CP1-091-E2` は**コストを払わずに毎ターン終了時エナチャージ**していた（過剰効果・続き434）。
    // ⚠filter は engine 側（`canAffordOptionalCostSpec` / `optionalCostPaySteps`）が honor するので載せてよい。
    const mU = t.match(/このシグニの下から(.*?)カード(?:([０-９\d]*)枚?を|を([０-９\d]+)枚)トラッシュに置(いてもよい|く)$/);
    if (mU) {
      const count = mU[2] ? parseNum(mU[2]) : mU[3] ? parseNum(mU[3]) : 1;
      const underStory = parseStoryFilter(mU[1] ?? '');
      return {
        type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count, fromThis: true,
        ...(mU[4] === 'いてもよい' ? { upToCount: true } : {}),
        ...(Object.keys(underStory).length ? { filter: underStory } : {}),
      } as TakeFromUnderSigniAction;
    }
  }

  // ---- デッキをシャッフルし、そのシグニを公開しデッキの〜に置く ----
  if (t.match(/デッキをシャッフルし、そのシグニを公開しデッキの(?:一番上|上から)/)) {
    return { type: 'STUB', id: 'DECK_TOP_TO_LIFE' } as StubAction;
  }

  // ---- その後、デッキをシャッフルし、それをコストを支払わずに使用する**か**トラッシュに置く ----
  // （§6.4 O-34(b)・`WX20-077-E2`）＝**使うか捨てるかの二択**。⚠下の強制版より**先**に置く
  //   （下の regex は前方一致なのでこの文も食い、選択肢なしで必ず使用してしまう）。
  // ⚠シャッフル自体は直前の `SEARCH.afterSearch` が持つ（サーチ族の共通形）ので、ここでは二重に積まない。
  if (t.match(/デッキをシャッフルし、(?:それ|そのカード)をコストを支払わずに使用するかトラッシュに置く/)) {
    return { type: 'STUB', id: 'USE_SEARCHED_SPELL_OR_TRASH' } as StubAction;
  }
  // ---- その後、デッキをシャッフルし、それをコストを支払わずに使用する ----
  if (t.match(/デッキをシャッフルし、(?:それ|そのカード)をコストを支払わずに使用する/)) {
    return { type: 'STUB', id: 'PLAY_FREE' } as StubAction;
  }

  // ---- デッキをシャッフルし、そのカードをデッキの一番上に置く ----
  if (t.match(/デッキをシャッフルし、そのカードをデッキの一番上に置く/)) {
    return { type: 'TRANSFER_TO_DECK', source: { type: 'DECK_CARD', owner: 'self', count: 1 }, position: 'top', shuffle: true };
  }

  // ---- トラッシュにカード名を含むカードがある場合、パワー±N → CONDITIONAL + POWER_MODIFY ----
  {
    const m = t.match(/あなたのトラッシュにカード名に「?(.+?)」?を含むカードがある場合、(?:ターン終了時まで、)?(?:このシグニの)?パワーは([＋－])([０-９\d]+)される/);
    if (m) {
      const sign = m[2] === '＋' ? 1 : -1;
      const delta = sign * parseNum(m[3]);
      return {
        type: 'CONDITIONAL',
        condition: { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardName: m[1] } },
        then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta },
      } as ConditionalAction;
    }
  }
  // ---- トラッシュ条件 ＋ デッキから名指しサーチ（§6.4 O-34(b)・`WX20-077-E2`）----
  // 🔴従来は下の catch-all（`CONDITIONAL_POWER_BONUS`）が**サーチ節ごと**飲み込んでいた＝
  //   「デッキから《バイオレンス・スプラッシュ》を探す」が一度も走らず、後続の「それを使う」も
  //   参照先を失う（＝丸ごと no-op）。⚠catch-all の**前**に置くこと。
  {
    const m = t.match(/^あなたのトラッシュにカード名に《(.+?)》を含むカードがある場合、あなたのデッキから《(.+?)》([０-９\d]+)枚を探す$/);
    if (m) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'TRASH_HAS_CARD', owner: 'self', filter: { cardName: m[1] } },
        then: {
          type: 'SEARCH',
          from: { location: 'deck', owner: 'self' },
          filter: { cardName: m[2] },
          maxCount: parseNum(m[3]),
          then: { type: 'ADD_TO_HAND', owner: 'self' },
          // 原文「その後、デッキをシャッフルし、」＝サーチ族の共通形（`afterSearch`）で持つ。
          afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
        },
      } as ConditionalAction;
    }
  }
  // ---- トラッシュにカード名に《X》を含むカードがある場合（パワー修正なし）----
  // 🔴従来は `CONDITIONAL_POWER_BONUS`＝**誤発火**した。ハンドラの `trashNameM` 分岐がこの条件に当たり、
  //   delta は**カード全文の別の節**から拾う（`WX20-078-E1` は選択肢③の「－5000」を拾って、
  //   トラッシュに《インフル》があるだけで**相手の全シグニに－5000**する原文に無い効果になっていた）。
  //   本来の意味は「代わりに２つまで選ぶ」＝**CHOOSE の選択個数が変わる**（§6.4 O-29 と同じ層の機構待ち）。
  //   機構が入るまでは明示 defer にして誤発火を止める。
  if (t.match(/あなたのトラッシュにカード名に.+を含むカードがある場合/)) {
    return { type: 'STUB', id: 'DEFERRED_TRASH_NAME_CHOOSE_COUNT' } as StubAction;
  }

  // ---- センタールリグのレベル条件（§5.3 `O-60` 第8バッチで3文型に分離）----
  // 🔴旧実装は「センタールリグのレベルが〜の場合」を**全部** `CONDITIONAL_ARTS_COST`（＝アーツの使用コスト）
  //   へ流していたが、実データには**コストの話が1文字も無い文**が混ざっていた
  //   （`SP38-001-E1`「…対戦相手より低い場合、あなたのセンタールリグを**グロウしてもよい**」）＝id が嘘をつく。
  if (t.match(/あなたのセンタールリグのレベルが.+の場合/) ||
      t.match(/あなたのセンタールリグのレベルが対戦相手より/)) {
    const myLvACC = t.match(/あなたのセンタールリグのレベルが([０-９\d]+)(以上|以下)/);
    if (myLvACC && /使用コスト/.test(t)) {
      // `WX20-020-E1`「あなたのセンタールリグのレベルが４以下**で、対戦相手のセンタールリグのレベルが５以上**の場合」
      const oppLvACC = t.match(/対戦相手のセンタールリグのレベルが([０-９\d]+)(以上|以下)/);
      return {
        type: 'STUB', id: 'CONDITIONAL_ARTS_COST',
        artsCostCond: {
          kind: 'center_lrig_level',
          level: parseNum(myLvACC[1]),
          op: myLvACC[2] as '以上' | '以下',
          ...(oppLvACC ? { oppLevel: parseNum(oppLvACC[1]), oppOp: oppLvACC[2] as '以上' | '以下' } : {}),
        },
      } as StubAction;
    }
    // 🏁§5.3 `O-83`＝「あなたのセンタールリグのレベルが対戦相手より低い場合、あなたのセンタールリグを
    //   グロウしてもよい」（`SP38-001-E1`）を実装した。条件は既存の `LRIG_LEVEL_CMP_OPP{lt}`、
    //   グロウ本体は `STUB{GROW_BY_EFFECT}`＝**engine は予約だけ**（実グロウは BattleScreen の `executeGrow`）。
    // 🔴**`GROW_FREE` を流用しない**＝あれは「コストを支払わずに」＝原文にない踏み倒しになる。
    if (/センタールリグをグロウしてもよい/.test(t)) {
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LRIG_LEVEL_CMP_OPP', operator: 'lt' },
        // ⚠「この方法でグロウしたルリグの【出】能力は発動しない」は**次の文**なので、この関数には見えない。
        //   `suppressOnPlay` はそちらの文が `STUB{GROW_BY_EFFECT_SUPPRESS_ON_PLAY}` として運ぶ（下の規則）。
        then: { type: 'STUB', id: 'GROW_BY_EFFECT' } as StubAction,
      } as EffectAction;
    }
    if (/グロウ/.test(t)) {
      return { type: 'STUB', id: 'DEFERRED_CONDITIONAL_GROW_BY_LRIG_LEVEL' } as StubAction;
    }
    return { type: 'STUB', id: 'DEFERRED_UNPARSED_CENTER_LRIG_LEVEL_CLAUSE' } as StubAction;
  }

  // ---- 対戦相手のパワーN以下/以上のシグニを対象とし手札から〜 ----
  if (t.match(/対戦相手のパワー[０-９\d]+以[下上]のシグニ[０-９\d]*体?を対象とし/) ||
      t.match(/対戦相手のパワー[０-９\d]+以[下上]のシグニ[０-９\d]*体?.*手札から.+捨て/)) {
    return { type: 'STUB', id: 'TARGET_AND_DISCARD_HAND' } as StubAction;
  }

  // ---- この方法でトラッシュに置いた/置かれたカードの中から〈名詞〉をN枚（まで）対象とし、〈行き先〉へ ----
  // §6.4 O-11。**枚数・「まで」・名詞・行き先を engine へ渡す**（従来は裸 STUB＝全部落ちていた）：
  //   ・`PICK_FROM_TRASHED_CARDS` の旧ハンドラは候補が**トラッシュ全体**で1枚を手札固定＝
  //     「この方法で」の限定も「２枚まで」も無視（`WXEX2-49`／`WX24-P4-034`）。
  //   ・エナ行きの1文（`WX26-CP1-057-E2`）は下流の catch-all `CONDITIONAL_POWER_BONUS` に飲まれて**丸ごと no-op**。
  {
    const mPT = t.match(/この方法で(?:デッキから)?トラッシュに置(?:いた|かれた)カードの中から(シグニ|カード)を?([０-９\d]+)枚(まで)?を?対象とし、それら?を?(手札に加えるか場に出す|手札に加える|エナゾーンに置く)/);
    if (mPT) {
      return {
        type: 'STUB', id: 'PICK_FROM_TRASHED_CARDS',
        trashedPick: {
          count: parseNum(mPT[2]),
          ...(mPT[3] ? { upTo: true } : {}),
          ...(mPT[1] === 'シグニ' ? { filter: { cardType: 'シグニ' as const } } : {}),
          dest: mPT[4] === 'エナゾーンに置く' ? 'energy' as const
            : mPT[4] === '手札に加えるか場に出す' ? 'hand_or_field' as const : 'hand' as const,
        },
      } as StubAction;
    }
  }
  // ---- この方法でトラッシュに置かれたカードの中からシグニをN枚対象とし〜（上の精密形に載らない残り） ----
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
  // 「てもよい」＝任意。「そうした場合」の did-it ゲートと組む任意アクションで、optional を落とすと engine が
  //   強制でトラッシュさせる（curated が持つ optional:true を復元＝§3 タスク12(vii)系）。
  if (t.match(/対戦相手のエナゾーンからカード[０-９\d]*枚?を対象とし、それをトラッシュに置いてもよい/)) {
    return { type: 'TRASH', target: { type: 'ENERGY_CARD', owner: 'opponent', count: 1 }, optional: true };
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

  // 「〜の場合、手札をN枚捨ててもよい」＝**この規則は退役（タスク12(lxii)）**。全CSVで到達0（該当2枚
  // `WXDi-CP02-075`／`WXDi-CP02-080` は上流の `ALL_FIELD_SIGNI_MATCH` ゲート規則が先に拾って
  // `CONDITIONAL{...} then TRASH{HAND_CARD self, optional}` に正しく解けている）。吐いていた
  // `STUB{CONDITIONAL_DISCARD}` は条件を見ずに自分の手札を1枚捨てるだけの別物なので、id ごと退役した。

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

  // ---- 場のシグニN体以上がある場合、パワー±M → CONDITIONAL + POWER_MODIFY ----
  {
    const m = t.match(/あなたの場に.*シグニが([０-９\d]+)体ある場合、代わりに([＋－])([０-９\d]+)する/);
    if (m) {
      const count = parseNum(m[1]);
      const sign = m[2] === '＋' ? 1 : -1;
      const delta = sign * parseNum(m[3]);
      return {
        type: 'CONDITIONAL',
        condition: { type: 'FIELD_COUNT', owner: 'self', operator: 'gte', value: count },
        then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta },
      } as ConditionalAction;
    }
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
    return {
      type: 'LOOK_AND_REORDER',
      source: { location: 'deck', owner: 'self' },
      count: { $ref: 'center_lrig_level' },
      private: false,
      reorder: false,
      destination: { location: 'deck', owner: 'self', position: 'bottom' },
    };
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

  // ---- ライフクロス条件／ライフクロス上部の操作（§5.3 `O-60` 第8バッチで4文型に分離）----
  // 🔴旧実装はこの2条件に当たった文を**全部** `CONDITIONAL_ARTS_COST` にしていたが、実データの中身は
  //   ①「ライフクロスの一番上を**公開する**」（`WD06-008-E1`）②「ライフクロスの一番上のカードを
  //   **デッキに加えてシャッフルする**」（`WXDi-D04-010-E1`）③「このアーツは**追加で
  //   《アタックフェイズアイコン》を持つ**」（`WX16-Re20-E1`）＝**コストの話が1文字も無い**。
  if (t.match(/あなたのライフクロスが[０-９\d]+枚以下の場合/) ||
      t.match(/あなたのライフクロスの(?:上から|一番上)/)) {
    // ①「あなたのライフクロスの一番上を公開する」＝受け皿は typed `LOOK_AND_REORDER`（公開＝`private:false`）。
    if (/^あなたのライフクロスの一番上を公開する$/.test(t)) {
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'life_cloth', owner: 'self' },
        count: 1, private: false, reorder: false, canTrash: false,
        destination: { location: 'life_cloth', owner: 'self', position: 'top' },
      } as LookAndReorderAction;
    }
    // ②「あなたのライフクロスの一番上のカードをデッキに加えてシャッフルする」＝life_cloth→deck（shuffle）。
    if (/^あなたのライフクロスの一番上のカードをデッキに加えてシャッフルする$/.test(t)) {
      return {
        type: 'LOOK_AND_REORDER',
        source: { location: 'life_cloth', owner: 'self' },
        count: 1, private: true, reorder: false, canTrash: false, shuffle: true,
        destination: { location: 'deck', owner: 'self', position: 'top' },
      } as LookAndReorderAction;
    }
    // ③「このアーツは追加で《アタックフェイズアイコン》を持つ」＝条件つき追加使用タイミング（§5.3 `O-84`）。
    if (/この(?:アーツ|カード)は追加で《[^》]+》を持つ/.test(t)) {
      return { type: 'STUB', id: 'DEFERRED_CONDITIONAL_EXTRA_USE_TIMING' } as StubAction;
    }
    // ④ 本当にコストの話をしている文だけが `CONDITIONAL_ARTS_COST` を名乗る。
    const lifeCntACC = t.match(/あなたのライフクロスが([０-９\d]+)枚(以上|以下)の場合/);
    if (lifeCntACC && /使用コスト/.test(t)) {
      return {
        type: 'STUB', id: 'CONDITIONAL_ARTS_COST',
        artsCostCond: { kind: 'self_life_count', level: parseNum(lifeCntACC[1]), op: lifeCntACC[2] as '以上' | '以下' },
      } as StubAction;
    }
    return { type: 'STUB', id: 'DEFERRED_UNPARSED_LIFE_CLOTH_CLAUSE' } as StubAction;
  }

  // ---- センタールリグが＜X＞の場合、パワー±N → CONDITIONAL + POWER_MODIFY ----
  {
    const m = t.match(/あなたのセンタールリグが＜([^＞]+)＞(?:ルリグ)?の場合、代わりに([＋－])([０-９\d]+)する/);
    if (m) {
      const sign = m[2] === '＋' ? 1 : -1;
      const delta = sign * parseNum(m[3]);
      return {
        type: 'CONDITIONAL',
        condition: { type: 'LRIG_STORY', owner: 'self', story: m[1] },
        then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1 }, delta },
      } as ConditionalAction;
    }
  }
  // ---- 「この能力の発動コストは《X×N》減る」＝**この能力スコープ**の条件つきコスト減額（§6.4 O-35・続き530）----
  // 🔴従来は下の汎用フォールバックが**条件節ごと**受け皿 `CONDITIONAL_POWER_BONUS` に飲み込んでいた＝
  //   `WX09-011-E2`「あなたのセンタールリグがレベル４以上の場合、この能力の発動コストは《赤×2》減る」の
  //   減額が一度も起きず、**常に《赤》《赤》を払わされる**（原文どおりならレベル4以上でタダ）。
  // ⚠`COST_REDUCTION` アクションは「スペル／アーツ／ルリグ」という**カード種別**に掛かる別軸なので使えない。
  //   条件節は `tryWrapLeadingStateCond` が `CONDITIONAL{LRIG_LEVEL}` で包み、
  //   effectParser の `hoistSelfAbilityCostReduction` が **action から `cost` へ移す**（engine では実行しない）。
  // ⚠「**それの**発動コストは〜減る」（`WXK04-075-E1`＝次に発動する別能力への予約）は別機構なので取らない。
  {
    const selfCostRedM = t.match(/^この能力の発動コストは(《[^》]+》(?:×[０-９\d]+)?)+減る$/);
    if (selfCostRedM) {
      const redEnergy = parseEnergyCosts(t);
      if (redEnergy.length > 0) {
        return { type: 'STUB', id: 'SELF_ABILITY_COST_REDUCTION', costEnergy: redEnergy } as StubAction;
      }
    }
  }

  // ---- センタールリグが〜の場合（汎用フォールバック）----
  if (t.match(/あなたのセンタールリグが.+の場合、(?:代わりに|追加で|この能力)/)) {
    return { type: 'STUB', id: 'CONDITIONAL_POWER_BONUS' } as StubAction;
  }

  // ---- 次の対戦相手のターン、対戦相手のルリグによるダメージを受けない ----
  if (/^次の対戦相手のターンの間、あなたは対戦相手のルリグによってダメージを受けない/.test(t)) {
    return { type: 'PREVENT_DAMAGE', owner: 'self', until: 'NEXT_TURN', scope: 'LRIG' } as PreventDamageAction;
  }

  // ---- 次の対戦相手のターン〜場に出せない（配置制限）----
  // ⚠**パワー下限を持つ形だけ payload を刻む**＝それ以外は engine 側で原文を読む。
  // 🆕**2026-09-02（索引 B 第2巡・§5.3 `O-78`）＝同名限定をここでも拾う。**
  //   「この方法でゲームから除外したシグニと**同じ名前の**シグニを新たに場に出せない」（`WXK09-015-E3`）は
  //   受け皿が無いと思われていたが、実測すると `SIGNI_DEPLOY_BAN{namesFromTargets}` が既存で
  //   `WXK10-019-E3` / `WX25-P3-001-E1` の2枚は既に載っていた（＝欠けていたのは**この文型の配線だけ**）。
  //   🔑分岐していた理由は**期間の書き方**＝上のバケツは `このターンと次のターンの間` しか見ておらず、
  //   `次の対戦相手のターン終了時まで` を通していなかった。どちらも `turns:2`（このターン＋次のターン）。
  if (t.match(/^次の対戦相手のターン(?:終了時まで|の間|、)/) && t.includes('場に出せない')) {
    if (/と同じ名前のシグニを新たに場に出せない/.test(t)) {
      return { type: 'SIGNI_DEPLOY_BAN', owner: 'opponent', turns: 2, namesFromTargets: true } as SigniDeployBanAction;
    }
    const pwDR = t.match(/パワー([０-９\d万]+)以上/);
    return pwDR
      ? { type: 'STUB', id: 'DEPLOY_RESTRICT', deployRestrict: { kind: 'power_gte', powerGte: parseNum(pwDR[1].replace('万', '0000')) } } as StubAction
      : { type: 'STUB', id: 'DEPLOY_RESTRICT' } as StubAction;
  }

  // ---- 次の対戦相手のターンの間、対戦相手はルリグの【起】能力を使用できない（§6.4 O-3）----
  // `blocked_actions` の `:NEXT_TURN` 予約に乗せる（ターン終了時に温存→相手のターン開始時に有効化）。
  // ⚠既存の `USE_ACT` は**シグニ・キー・付与も含む全【起】**を止めるので使えない（過剰）。
  if (/^次の対戦相手のターンの間、対戦相手はルリグの【起】能力を使用できない/.test(t)) {
    return {
      type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 },
      actionId: 'USE_LRIG_ACT', until: 'NEXT_TURN',
    } as BlockActionAction;
  }

  // ---- 次の対戦相手のターン〜（一時的制限）----
  // ⚠未パース節の受け皿（上と同じ理由で id を分けた・§6.4 O-3 続き459）。
  // ⚠**機構ごとに id を分ける**＝混ぜると census:stubs の A群から在庫が読めない（続き486 と同じ運用）。
  if (t.match(/^次の対戦相手のターン(?:終了時まで|の間|、)/)) {
    // 「次の対戦相手のターン、メインフェイズをスキップする」（`WXEX2-19-E3`）＝フェイズ飛ばしの予約。
    // ✅続き491 で実装＝`BLOCK_ACTION{actionId:'MAIN_PHASE', until:'NEXT_TURN'}`（`:NEXT_TURN` 予約に乗る）
    //   を `attackStepPhase.ts` の `PHASE_SKIP_BLOCK_IDS` が消費する。
    //   ⚠**「メインフェイズ中の行動を1つずつ封じる」形にはしない**＝封じ漏れが1つでもあると無言で
    //   すり抜ける。判定は「次のフェイズを決める1点」に集約する。
    if (/メインフェイズをスキップする/.test(t)) {
      return {
        type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 },
        actionId: 'MAIN_PHASE', until: 'NEXT_TURN',
      } as BlockActionAction;
    }
    // 「対戦相手は宣言されたカード名のスペルを使用できない」（`PR-K046-E1`・§6.4 O-3 続き498）。
    // ⚠宣言と禁止を**1アクションに畳む**＝前文の「スペルのカード名1つを宣言する」は既存
    //   `DECLARE_CARD_NAME`（自分の**手札**のカード名から選ぶ別機構）に落ちて、相手のスペルには届かない。
    //   宣言の候補作りは `DECLARE_CARD_NAME_LOCK` が禁止対象と同じ軸で行う。
    if (/宣言されたカード名のスペルを使用できない/.test(t)) {
      return {
        type: 'DECLARE_CARD_NAME_LOCK', declarer: 'self', lockedPlayer: 'opponent',
        cardType: 'スペル', mode: 'blacklist', until: 'NEXT_TURN',
      } as EffectAction;
    }
    // 「〈期間〉、あなたのセンタールリグは対戦相手のセンタールリグのルリグタイプを追加で得る」
    // （`WDK17-008` choice①・§6.4 O-3 続き498）。
    // ⚠期間は**この規則で焼き込む**＝下流の `upgradeToOppTurnEnd` は `duration` を持つ action 語彙
    //   （POWER_MODIFY / GRANT_* 等）にしか効かず、この語彙は turnsRemaining 方式なので届かない。
    //   2＝「次の対戦相手のターン終了時まで」（このターン終了＋相手ターン終了の2回で失効）。
    if (/対戦相手のセンタールリグのルリグタイプを追加で得る/.test(t)) {
      return {
        type: 'GAIN_LRIG_TYPE', owner: 'self', from: 'opponent_center_lrig',
        turns: /次の対戦相手のターン終了時まで/.test(t) ? 2 : 1,
      } as EffectAction;
    }
    if (/ルリグタイプを追加で得る/.test(t)) {
      return { type: 'STUB', id: 'DEFERRED_GAIN_OPP_LRIG_TYPE' } as StubAction;
    }
    // 「この(シグニ|ルリグ)のパワーを〈あなた|対戦相手〉のエナゾーンにある〈＜X＞の〉カード１枚につき＋N する」
    // （`WX26-CP1-066-E1`・§6.4 O-3）＝枚数比例の**期間つき**パワー修正。
    // ⚠常在の `POWER_MODIFY_PER_ENERGY` は使えない（CONTINUOUS 専用・クラス filter 無し・期間なし）。
    //   `deltaFromZone`（`resolveCountRef` の枚数×per）で表す。期間は下流の `upgradeToOppTurnEnd` が
    //   `UNTIL_OPP_TURN_END` へ上げるが、意図を明示するためここで直接書く。
    {
      const perEnergy = t.match(
        /^次の対戦相手のターン終了時まで、この(シグニ|ルリグ)のパワーを(あなた|対戦相手)のエナゾーンにある(?:＜([^＞]+)＞の)?カード[１1]枚につき([＋－+-])([０-９\d]+)する$/);
      if (perEnergy) {
        const [, kind, whose, story, sign, amount] = perEnergy;
        const per = (sign === '＋' || sign === '+' ? 1 : -1) * parseNum(amount);
        return {
          type: 'POWER_MODIFY',
          target: kind === 'ルリグ'
            ? { type: 'LRIG', owner: 'self', count: 1, filter: { thisCardOnly: true } }
            : { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } },
          delta: 0,
          deltaFromZone: {
            zone: 'energy',
            owner: whose === '対戦相手' ? 'opponent' : 'self',
            ...(story ? { filter: { story } } : {}),
            per,
          },
          duration: 'UNTIL_OPP_TURN_END',
        } as EffectAction;
      }
    }
    return { type: 'STUB', id: 'DEFERRED_UNPARSED_NEXT_OPP_TURN_CLAUSE' } as StubAction;
  }

  // ---- このターン、対戦相手が場に出せない（配置制限）----
  // ⚠「シグニを新たに場に出せない」＝**枚数上限でも パワー上限でもない全面禁止**なので `DEPLOY_RESTRICT`
  //   （engine が原文から「N体までしか」「パワーN以上」を読む）に渡すと**どちらの形にも当たらず
  //   「配置制限（パターン解析不可）」のログだけ＝無言 no-op** になる。`BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN`
  //   （`blocked_actions:'PLACE_SIGNI'` を相手へ張る）が正しい受け皿。
  //   §6.4 O-36（続き534）＝先頭の「対戦相手のターンの場合、」が CONDITIONAL へ持ち上がって
  //   part4 の元の規則（条件句を含む形）から外れたため、ここで先取りする（`WXK10-013-E1` 1件）。
  if (/^このターン、対戦相手(?:が|は)/.test(t.trim()) && /シグニを新たに場に出せない/.test(t)) {
    return { type: 'STUB', id: 'BLOCK_OPP_SIGNI_PLAY_IF_OPP_TURN' } as StubAction;
  }
  if (t.match(/^このターン、対戦相手(?:が|は)/) && t.includes('場に出せない')) {
    const pwDR2 = t.match(/パワー([０-９\d万]+)以上/);
    return pwDR2
      ? { type: 'STUB', id: 'DEPLOY_RESTRICT', deployRestrict: { kind: 'power_gte', powerGte: parseNum(pwDR2[1].replace('万', '0000')) } } as StubAction
      : { type: 'STUB', id: 'DEPLOY_RESTRICT' } as StubAction;
  }

  // ---- このターン、対戦相手はダメージを受けない ----
  // 期間つきダメージ無効ウィンドウ（`prevent_damage_windows`）を**相手側**に張る。
  // ⚠part1 の「あなたはダメージを受けない」は所有者句が違うのでここまで落ちてくる。
  if (/^このターン、対戦相手は(?:.{0,8}によって)?ダメージを受けない/.test(t)) {
    return { type: 'PREVENT_DAMAGE', owner: 'opponent', until: 'UNTIL_END_OF_TURN', scope: 'ALL' } as PreventDamageAction;
  }

  // ---- このターン、対戦相手は〈条件〉のシグニでアタックできない（§6.4 O-3）----
  // 判定は `signiAttackGate`（人間ボタン／performSigniAttack／CPU 候補の3箇所共通）。
  // ⚠ここで拾えないものは下の受け皿へ落とす＝**部分的に拾って条件を落とすと過剰効果になる**。
  {
    const banBody = t.match(/^このターン、対戦相手は(.+?)シグニでアタックできない/)?.[1];
    if (banBody !== undefined) {
      // 「宣言された数字と同じレベルのシグニ」＝直前の数字宣言を参照する（宣言値は実行時に焼き込む）。
      if (/^宣言(?:された|した)数字と同じレベルの$/.test(banBody)) {
        return { type: 'SIGNI_ATTACK_BAN', owner: 'opponent', levelFromDeclaredNumber: true } as SigniAttackBanAction;
      }
      // 「表記されているパワーと異なるパワーのシグニ」＝実効パワー≠表記パワー。
      if (/^表記されているパワーと異なるパワーの$/.test(banBody)) {
        return { type: 'SIGNI_ATTACK_BAN', owner: 'opponent', powerDiffersFromPrinted: true } as SigniAttackBanAction;
      }
      // 「そのカードと同じレベルのシグニ」＝直前に公開したカード（裏向きルリグゾーン）のレベル（§6.4 O-3）。
      if (/^そのカードと同じレベルの$/.test(banBody)) {
        return { type: 'SIGNI_ATTACK_BAN', owner: 'opponent', levelFromLastProcessed: true } as SigniAttackBanAction;
      }
      // 「手札をN枚捨てないかぎりシグニでアタックできない」（`SP38-003-E1`・§6.4 O-3）＝**アタックするごとに**払う。
      // ⚠1回きりの `NegateAttackAction.escapeDiscard`（アタック無効の回避）とは別機構＝流用しない。
      {
        const handTax = banBody.match(/^手札を([０-９\d]+)枚捨てないかぎり$/);
        if (handTax) {
          return {
            type: 'SIGNI_ATTACK_BAN', owner: 'opponent', unlessPayHandDiscard: parseNum(handTax[1]),
          } as SigniAttackBanAction;
        }
      }
    }
  }

  // ---- このターン、対戦相手が《無》×N を支払わないかぎりそれはアタックできない ----
  // 「それ」＝直前に【チャーム】を付けた対象シグニ（`storedTargetCards`）。支払えばアタックできる。
  {
    const m = t.match(/^このターン、対戦相手が((?:《無》)+)を支払わないかぎりそれはアタックできない/);
    if (m) {
      return {
        type: 'SIGNI_ATTACK_BAN', owner: 'opponent', targetsStored: true,
        unlessPayColorless: (m[1].match(/《無》/g) ?? []).length,
      } as SigniAttackBanAction;
    }
  }

  // ---- 「対戦相手は自分のシグニを好きな数選ぶ」（`WXDi-P08-030-E1`・§6.4 O-3 続き498）----
  // 選択そのものは盤面を変えない＝`SELECT_TARGET_ONLY` で選ばせて `STORE_LAST_PROCESSED_TARGETS` に固定し、
  // 次文の「それら以外のシグニでアタックできない」が `exceptTargetsStored` で受ける。
  // ⚠🔴旧 `CHOOSE_N_FROM_LIST` は**①②③…の効果選択肢**を出す別機構＝この文には該当が無く丸ごと no-op だった。
  // ⚠選ぶのは**相手**（`opponentSelects`）＝落とすと使用者が相手の代わりに選ぶ有利な取り違えになる。
  if (/^対戦相手は自分のシグニを好きな数選ぶ$/.test(t)) {
    return { type: 'SEQUENCE', steps: [
      { type: 'STUB', id: 'SELECT_TARGET_ONLY', opponentSelects: true,
        selectTarget: { type: 'SIGNI', owner: 'opponent', count: 'ALL', upToCount: true, filter: { cardType: 'シグニ' } },
      } as EffectAction,
      { type: 'STUB', id: 'STORE_LAST_PROCESSED_TARGETS' } as EffectAction,
    ] } as EffectAction;
  }

  // ---- このターン、対戦相手が〜（アタック制限・コスト条件）----
  // ⚠未パース節の受け皿（上と同じ理由で id を分けた・§6.4 O-3 続き459）。
  // ⚠**機構ごとに id を分ける**＝1つの受け皿に混ぜると「何が残っているか」が census:stubs から読めなくなる。
  if (t.match(/^このターン、対戦相手(?:が|は)/)) {
    // アタックのたびに手札を捨てる「支払わないかぎり」型（SP38-003）＝毎アタックの手札コストUIが要る。
    if (/手札を[０-９\d]+枚捨てないかぎり/.test(t)) {
      return { type: 'STUB', id: 'DEFERRED_ATTACK_TAX_HAND_DISCARD' } as StubAction;
    }
    // 相手が宣言したカード名**以外**のアーツを使用できない（`WXEX2-09-E3`・§6.4 O-3 続き498）。
    // ⚠宣言するのは**相手**（`declarer:'opponent'`）＝前文「対戦相手はカード名1つを宣言する」も
    //   このアクションに畳む（既存 `DECLARE_CARD_NAME` は自分の手札から選ぶ別機構）。
    if (/宣言したカード名以外のアーツを使用できない/.test(t)) {
      return {
        type: 'DECLARE_CARD_NAME_LOCK', declarer: 'opponent', lockedPlayer: 'opponent',
        cardType: 'アーツ', mode: 'whitelist', until: 'THIS_TURN',
      } as EffectAction;
    }
    if (/宣言したカード名以外の/.test(t)) {
      return { type: 'STUB', id: 'DEFERRED_OPP_DECLARED_ARTS_NAME_LOCK' } as StubAction;
    }
    // 相手が選んだシグニだけが強制アタックし、他はアタックできない（`WXDi-P08-030-E1`・§6.4 O-3 続き498）。
    // 前文の `SELECT_TARGET_ONLY`＋`STORE_LAST_PROCESSED_TARGETS` が固定した集合の**補集合**を止める。
    // ⚠**近似**＝「可能ならばアタックしなければならず」（強制アタック）は未実装（§7）＝禁止側だけ効く。
    //   禁止と強制は別軸で、禁止側だけでもこのカードの主眼（アタッカーを絞る）は成立する。
    if (/選んだシグニで可能ならばアタックしなければならず/.test(t)) {
      return { type: 'SIGNI_ATTACK_BAN', owner: 'opponent', exceptTargetsStored: true } as EffectAction;
    }
    return { type: 'STUB', id: 'DEFERRED_UNPARSED_THIS_TURN_OPP_CLAUSE' } as StubAction;
  }

  // ---- 対戦相手のアタックしているシグニのアタックを一度無効にする ----
  // 「**アタックしている**シグニ」＝候補は場の全シグニではなく**いま宣言中のアタッカー1体**（attackingOnly）。
  // 進行中のアタックなので実行側は事前登録（negated_attacks）ではなく cancel_current_signi_attack を立てる（Opusタスク12(cx)）。
  if (t.match(/対戦相手の.*アタックしている.*シグニ.*アタックを.*無効にする/)) {
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, attackingOnly: true } as NegateAttackAction;
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

  // ---- （このゲームの間、）あなたの《カード名》の使用コストは《…》になる ----
  // `WXK03-002-E3`＝クラフトをルリグデッキへ加えたうえで、そのカードの使用コストを**置換**する（タスク12(lxxxi)）。
  // ⚠「減る」形（`《カード名》の使用コストは《無×N》減る`＝effectEngine の SPECIFIC_CARD_COST_REDUCE）とは別物。
  {
    const m = t.match(/^(?:この(?:ゲーム|ターン)の間[、,])?(あなた|対戦相手)の《([^》]+)》の使用コストは((?:《[^》]+》)+)になる/);
    if (m) {
      const cost = parseEnergyCosts(m[3]);
      if (cost.length > 0) {
        return {
          type: 'SET_CARD_COST_REPLACEMENT',
          owner: m[1] === 'あなた' ? 'self' : 'opponent',
          cardName: m[2],
          cost,
        } as import('../../types/effects').SetCardCostReplacementAction;
      }
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

  // ---- 手札からN枚捨て**かつ**このシグニを場からトラッシュに置いてもよい（束ねた1つの任意コスト）----
  // 🔴下の `OPTIONAL_TRASH_SELF` は「このシグニを場からトラッシュに置いてもよい」を**部分一致**で受けるので、
  //   同じ任意ゲートに束ねられた**先行の手札捨てが丸ごと踏み倒されていた**（§6.4 O-11・`WX20-069-E1`
  //   ＝「手札から＜遊具＞のシグニを３枚捨て、このシグニを場からトラッシュに置いてもよい」でレゾナ出現が
  //   自己トラッシュ1枚だけで成立していた）。両方を1つの `OPTIONAL_COST` に載せる＝
  //   **払うなら両方・払わないなら両方払わない**（別々の任意ゲート2つに割ると片方だけ払えてしまう）。
  {
    const bundleM = t.match(
      // ⚠**トリガー句は剥がれずにここまで来る**（`parseSingleSentence` は「〜したとき、」を含む文を
      //   そのまま渡す）ので、前置きを許さない `^` アンカーだけだと黙って外れる＝下の部分一致規則に食われる。
      //   前置きは**トリガー／条件の marker で終わるもの**に限る（本体の連用節を巻き込まないため）。
      /(?:^|(?:とき|場合)、)(?:あなたの)?手札から(?:[＜〈<]([^＞〉>]+)[＞〉>]の)?(シグニ|カード)を([０-９\d]+)枚捨て、この(?:シグニ|カード)を場からトラッシュに置いてもよい$/,
    );
    if (bundleM) {
      return {
        // costText は逆翻訳がそのまま描画するので、トリガー句は落として支払い句だけを残す。
        type: 'STUB', id: 'OPTIONAL_COST', selfTrash: true,
        costText: t.replace(/^.*?(?:とき|場合)、/, ''),
        handDiscard: {
          count: parseNum(bundleM[3]),
          filter: {
            ...(bundleM[2] === 'シグニ' ? { cardType: 'シグニ' } : {}),
            ...(bundleM[1] ? { story: bundleM[1] } : {}),
          },
        },
      } as StubAction;
    }
  }

  // ---- このシグニを場からトラッシュに置いてもよい（任意の自己犠牲コスト。「そうした場合、X」が兄弟 CONDITIONAL）----
  //   engine OPTIONAL_TRASH_SELF が pay=自トラッシュ+then / skip で解決（WX06-CB03/WX21-056/061）。
  //   「対象」を含む文（selfTrashCost 付き BANISH＝対象選択のコストとして自トラッシュ）は別経路のため除外。
  if (t.match(/このシグニを場からトラッシュに置いてもよい/) && !t.includes('対象')) {
    return { type: 'STUB', id: 'OPTIONAL_TRASH_SELF' } as StubAction;
  }

  // ---- （場にある）このシグニをエナゾーンに置いてもよい（任意コスト。「そうした場合、X」が兄弟 CONDITIONAL）----
  // §6.4 O-7：`OPTIONAL_TRASH_SELF` の**行き先違い**（トラッシュではなくエナ）。従来は part4 の
  // 総称 `LRIG_UNDER_CARD_OP` へ落ち、支払いが一度も起きないまま後続の本体だけが走っていた
  // （＝場を離れずに得だけする過少コスト）。正準形 `OPTIONAL_COST{selfToEnergy}` へ寄せて
  // 既存の Pattern ③（STUB→CONDITIONAL{IS_MY_TURN}）funnel に載せる。
  // ⚠「対象」を含む文は別経路（対象宣言つきの本体）なので除外＝`OPTIONAL_TRASH_SELF` と同じ規約。
  if (/(?:場にある)?この(?:シグニ|カード)を(?:場から)?エナゾーンに置いてもよい/.test(t) && !t.includes('対象')) {
    return { type: 'STUB', id: 'OPTIONAL_COST', selfToEnergy: true, costText: t } as StubAction;
  }

  // ---- （あなたの）ライフクロスN枚をトラッシュに置いてもよい（任意コスト）----
  // `OPTIONAL_TRASH_SELF`／`OPTIONAL_COST{selfToEnergy}` の**支払い物違い**。従来は素の
  // `OPTIONAL_COST`（フィールド無し）へ落ちて **`resolveOptionalCostSpec` が何も払わない**＝
  // ライフを1枚も失わずに本体だけ通る過少コストだった（`WXDi-P08-038-E1`）。
  // ⚠受け皿は既にある＝`OptionalCostSpec.lifeTrash`（`execUtils.ts:264` / 支払いは `:586`）。
  // ⚠「クラッシュ」（`life_crash`＝【ライフバースト】判定あり）とは別物なので混ぜない。
  // ⚠「対象」を含む文は対象宣言つきの本体（別経路）＝`OPTIONAL_TRASH_SELF` と同じ規約で除外する。
  {
    const lifeTrashOptM = t.match(/(?:^|(?:とき|場合)、)(?:あなたの)?ライフクロス([０-９\d]+)枚を(?:場から)?トラッシュに置いてもよい$/);
    if (lifeTrashOptM && !t.includes('対象')) {
      return {
        type: 'STUB', id: 'OPTIONAL_COST',
        lifeTrash: parseNum(lifeTrashOptM[1]),
        costText: t.replace(/^.*?(?:とき|場合)、/, ''),
      } as StubAction;
    }
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

  // ---- 「場にシグニがN体ある場合、代わりにカードを〜トラッシュに置く」＝置換（live 0・§5.3 `O-60` 第8バッチ）----
  // ⚠旧 id は `CONDITIONAL_ARTS_COST` だったが**コストの話ではない**。live 0 の死んだ枝は catch-all の温床
  //   なので、意味に合う honest な id へ移した（`O-85`）。
  if (t.match(/あなたの場に.*シグニが[０-９\d]+体ある場合、代わりにカードを.*トラッシュに置く/)) {
    return { type: 'STUB', id: 'DEFERRED_FIELD_COUNT_ALT_TRASH' } as StubAction;
  }

  // ---- この方法で〜N単位につきパワー±N / コスト減少（汎用）----
  // 🔴§5.3 `O-80` 第1バッチ（2026-08-26）＝ここは **`POWER_MOD_PER_COUNT`（＝パワー修整）の catch-all**
  //   だが、実データには**パワーの話を1文字もしていない文**が混ざっていた（id が嘘をつく）。
  //   パワー文は `effectParser.ts` の後段が `POWER_MODIFY` へ引き取るので、ここでは**別物2件だけ**を先に外す。
  if (t.match(/この方法で.*[０-９\d]+枚?につきそのカードに含まれる色[０-９\d]+つを選択する/)) {
    return { type: 'STUB', id: 'DEFERRED_DECLARE_COLOR_PER_PROCESSED' } as StubAction;
  }
  if (t.match(/この方法で.*【トラップ】[０-９\d]+つにつき.*【トラップ】として.*設置する/)) {
    // §5.3 `O-87`（2026-08-26）＝「この方法で手札に加えた【トラップ】**１つにつき**手札からカード１枚を
    //   【トラップ】として設置する」（`WX16-017-E1`）。受け皿は既存の2つ＝
    //   **回数**＝`REPEAT.countRef{$ref:'last_processed_count'}`（`TRAP_TO_HAND` が戻した【トラップ】だけを記録する）／
    //   **設置**＝`STUB{PLACE_TRAP_OPTIONAL}` の手札枝（1枚選んでゾーンを選ぶ）。
    // ⚠原文は「設置する」＝**任意ではない**が、`PLACE_TRAP_OPTIONAL` の手札枝は `optional:false` で
    //   選択を強制するので、そのまま使ってよい（id の "OPTIONAL" は出所名であって任意性ではない）。
    return {
      type: 'REPEAT',
      count: 0,
      countRef: { $ref: 'last_processed_count' },
      action: { type: 'STUB', id: 'PLACE_TRAP_OPTIONAL', trapPlaceOptional: false } as StubAction,
    } as EffectAction;
  }
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
  // §5.3 `O-60` 第1バッチ＝**手札は「上から N 枚」が無いので常に全部**（`count:'ALL'`）。
  // ⚠原文の「N枚見る」は**選ぶ枚数**であって見る枚数ではない（後続の選択ステップが受ける）。
  if (t.match(/^対戦相手の手札を見る$/) || t.match(/^対戦相手の手札を[０-９\d]+枚見る$/)) {
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_hand', count: 'ALL' } } as StubAction;
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
  // 🆕**§5.3 `O-220` 第1バッチ（2026-09-02）＝「**この**アタックで…ダメージを与えない」は `attackingOnly`**。
  //   原文の主語は「**その**アタックしているシグニ」＝**いま宣言中のアタッカー1体**で一意なのに、
  //   無指定の `NEGATE_ATTACK` は候補が**相手の場の全シグニ**になり、支払いのあとで
  //   **アタックしていないシグニを選べてしまう**（選ぶと `negated_attacks` へ入るだけで
  //   進行中のアタックは止まらない＝**払ったのに何も起きない**）。実測4カード
  //   （`WX12-001` / `WX14-003` / `WX16-029` / `PR-K077`）。
  // ⚠「のアタックを一度無効にする」側（次のアタックを事前登録する形）は据置＝あちらは進行中ではない。
  if (t.match(/アタックであなたにダメージを与えない/))
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 }, attackingOnly: true } as NegateAttackAction;
  if (t.match(/のアタックを一度無効にする/))
    return { type: 'NEGATE_ATTACK', target: { type: 'SIGNI', owner: 'opponent', count: 1 } } as NegateAttackAction;

  // ---- 対戦相手はデッキの一番上を公開する ----
  // §5.3 `O-60` 第1バッチ＝デッキは**先頭が一番上**（ライフクロスと向きが逆）＝engine 側で吸収する。
  if (t.match(/対戦相手は(?:自分の)?デッキの一番上のカードを公開する/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_deck_top', count: 1 } } as StubAction;

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

  // ---- ウィルスN個取り除く（複数形・任意） ----
  // 🔴**旧 engine の個数 regex は終止形 `取り除く` しか見ておらず、この「取り除い**て**もよい」形が
  //   丸ごと落ちて既定の1個になっていた**（`WX15-040-E1` は原文2個）＝ここで個数を刻む。
  {
    const mRVO = t.match(/対戦相手の場にある【ウィルス】([０-９\d]+)つを取り除いてもよい/);
    if (mRVO) {
      return { type: 'STUB', id: 'REMOVE_VIRUS', virusCount: parseNum(mRVO[1]), virusOptional: true } as StubAction;
    }
  }

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
  {
    const trapTrashM = t.match(/【トラップ】([１-９1-9０-９\d]*)つをトラッシュに置く/);
    if (trapTrashM) return {
      type: 'STUB', id: 'TRAP_OP', trapOp: 'trash', count: trapTrashM[1] ? parseNum(trapTrashM[1]) : 1,
    } as StubAction;
  }

  // ---- このシグニによってクラッシュされたLBは発動しない ----
  // ⚠「クラッシュされた**対戦相手の**カードの…」の所有者句つきも受ける（`WXEX1-32-LAYER-E1`）。
  if (t.match(/このシグニによってクラッシュされた(?:対戦相手の)?カードのライフバーストは発動しない/))
    return { type: 'STUB', id: 'SUPPRESS_LIFE_BURST_ON_CRASH' } as StubAction;

  // ---- この効果でレベルは0以下にならない ----
  if (t.match(/この効果でレベルは[０0]以下にはならない/))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- 宣言した数字と同じレベルシグニを捨てさせる ----
  if (t.match(/宣言した数字と同じレベルのシグニをすべて捨てさせる/) ||
      t.match(/その後、数字[１-９1-9０-９\d]*つを宣言し、その数字と同じレベル.*シグニをすべて捨てさせる/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;

  // ---- 対戦相手の手札を見てシグニを捨てさせる ----
  // 🔴§5.3 `O-60` 第1バッチ＝ここは**連用形「見**て**」**なので、engine 側の
  //   `対戦相手の手札を[０-９\d]*枚?見る`（終止形）に**1件も当たっていなかった**＝
  //   相手の手札ではなく**ライフクロスを覗く**別ゾーンへ化けていた（§4.2「活用形が違うだけで丸ごと落ちる」）。
  if (t.match(/対戦相手の手札を見て.*シグニ(?:を|すべて)捨てさせる/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP', lookZone: { zone: 'opp_hand', count: 'ALL' } } as StubAction;

  // ---- この方法で場に出たレゾナの【出】能力は発動しない（§6.4 O-5）----
  // 🔴従来は `RULE_REMINDER_TEXT`（＝完全な no-op）で、**出したレゾナの【出】が普通に発火**していた。
  // 🔑既存の畳み込み funnel に載せる＝`BLOCK_ACTION{ON_PLAY_ABILITY}` を出すと `foldSuppressOnPlay` が
  //   直前の配置アンカー（`SUMMON_RESONA_FROM_LRIG_DECK` は `placesToField` を宣言済み）へ
  //   `suppressOnPlay` を畳み込み、この死アクションを取り除く。
  if (t.match(/この方法で場に出たレゾナの【出】能力は発動しない/))
    return { type: 'BLOCK_ACTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, actionId: 'ON_PLAY_ABILITY', until: 'END_OF_TURN' } as BlockActionAction;

  // ---- 「それらのパワーを**合わせて／合計で**±N する」＝総量を割り振る（§5.3 `O-140`・2026-08-29）----
  // 🔴**旧実装は2つの STUB に割れていた**＝`POWER_MOD_DISTRIBUTE`（＋側1効果・engine は**均等割りの近似**で
  //   しかも総量をカード全文 regex から読んでいた）と `POWER_MOD_PER_COUNT`（−側4効果・
  //   `合わせて` はどの regex にも当たらず**無言 no-op**／`合計で` は当たるが**相手3体それぞれに満額**）。
  //   ⇒ `POWER_MODIFY{splitTotal}` の1本に統合し、engine は payload だけを見る。
  // ⚠**「対象とし」の前後どちらに「好きな数」が来るか2形ある**（`対戦相手のシグニを好きな数対象とし` ／
  //   `好きな数の対戦相手のシグニを対象とし`）。⚠**owner の語が無い形は `any`**（プロジェクト規約）。
  {
    const spM =
      t.match(/(?:(あなた|対戦相手)の)?シグニを好きな数対象とし、(?:ターン終了時まで、)?それらのパワーを(?:合わせて|合計で)([－＋])([０-９\d]+)する/)
      ?? t.match(/好きな数の(?:(あなた|対戦相手)の)?シグニを対象とし、(?:ターン終了時まで、)?それらのパワーを(?:合わせて|合計で)([－＋])([０-９\d]+)する/);
    if (spM) {
      const ownerSp: Owner | 'any' = spM[1] === '対戦相手' ? 'opponent' : spM[1] === 'あなた' ? 'self' : 'any';
      const magSp = parseNum(spM[3]);
      return {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: ownerSp, count: 'ALL', upToCount: true, filter: { cardType: 'シグニ' } },
        delta: spM[2] === '－' ? -magSp : magSp,
        splitTotal: { unit: 1000 },
        duration: 'UNTIL_END_OF_TURN',
      } as EffectAction;
    }
  }

  // ---- この下から好きな枚数のシグニをトラッシュ ----
  if (t.match(/この下から好きな枚数のシグニを対象とし、それらをトラッシュに置く/))
    return { type: 'TAKE_FROM_UNDER_SIGNI', destination: 'trash', count: 9, upToCount: true, fromThis: true, filter: { cardType: 'シグニ' } } as TakeFromUnderSigniAction;

  // ---- 公開した他のカードをシャッフルしてデッキ下 ----
  if (t.match(/公開した他のカードをシャッフルしてデッキの一番下に置く/))
    return { type: 'STUB', id: 'LOOK_OPP_LIFE_TOP' } as StubAction;

  // ---- N以外/0からNの数字を宣言する ----
  if (t.match(/^[０0]から[０-９\d]+までの数字[１-９1-9０-９\d]*つを宣言する$/))
    return { type: 'STUB', id: 'DECLARE_NUMBER' } as StubAction;
  {
    const excluded = t.match(/^([０-９\d]+)以外の数字[１-９1-9０-９\d]*つを宣言する$/);
    if (excluded) {
      const denied = parseNum(excluded[1]);
      return {
        type: 'STUB', id: 'DECLARE_NUMBER_PLAIN',
        numberChoices: [1, 2, 3, 4, 5].filter(n => n !== denied),
      } as StubAction;
    }
  }

  // ---- 括弧で終わる注釈文（場合/含まれる/何もしない） ----
  if (t.match(/[）)）]$/) &&
      (t.includes('この効果は何もしない') || t.includes('含まれる') || t.includes('場を離れていた場合')))
    return { type: 'STUB', id: 'RULE_REMINDER_TEXT' } as StubAction;

  // ---- トラップ配置し直す ----
  if (t.match(/すべての【トラップ】を好きなように配置し直す/))
    return { type: 'STUB', id: 'TRAP_OP', trapOp: 'rearrange' } as StubAction;

  return null;
}
