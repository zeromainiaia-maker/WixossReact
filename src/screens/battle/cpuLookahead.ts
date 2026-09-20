import type { CardData, PendingInteractionDef, PlayerState, TurnPhase } from '../../types';
import type { CardEffect } from '../../types/effects';
import {
  executeEffect, resumeAllocatePower, resumeChoose, resumeLookAndReorder, resumeOpponentPayOptional, resumeOptionalCost,
  resumeRearrangeSigni, resumeRevealCards, resumeSearch, resumeSelectSigniZone, resumeSelectTarget, resumeSelectVirusZone,
  resumeSelectZone, type ExecCtx,
} from '../../engine/effectExecutor';
import type { ExecResult } from '../../engine/execUtils';
import { getCardNum } from '../../engine/execUtils';
import { checkActiveCondition } from '../../engine/effectEngine';
import { onPlayOriginMatches } from '../../engine/triggerCollect';
import { currentRng, mulberry32, setRng, shuffle } from '../../engine/rng';
import { effectValueOf } from './cpuCardStrength';
import { cpuAttackValueOf } from './cpuBoardEval';
import { DEFAULT_CPU_POLICY, type CpuPolicy } from './cpuPolicy';
import {
  pickCpuAllocatePower, pickCpuChoice, pickCpuEmptySigniZone, pickCpuRearrange, pickCpuSearch, pickCpuTargets, pickCpuVirusZone,
  type CpuInteractionCtx,
} from './cpuInteraction';

/**
 * 🆕**浅い先読み**（§5.7 `S-4`・案A・2026-09-17）＝盤面をコピーして **engine だけで効果を解決**し、結果の盤面を採点する。
 *
 * ■ なぜ要るか＝`S-1` の強さ表は「除去1体＝パワー6000相当」のような**盤面を見ない静的な点数**。
 *   相手の場が空なのに【出】の除去を高く見る／ドローで手札上限を超えるのを見ない、といった場面で外す。
 *   ⇒ **この盤面で実際に解決した結果**で比べる。
 *
 * ■ 範囲（案A の限界）＝効果1つ（とその途中の選択）だけを解決する。**誘発の連鎖・スタック・相手の応答（ガード・ライフバースト）は見ない**
 *   （それは `S-5` の対戦丸ごとのシミュレータの仕事）。解決できない形（未対応の対話・例外・手数超過）は `null`＝呼び出し側は先読み無しの判断に戻す。
 *
 * ■ 規律（§5.6.3）＝判断の材料を作るだけで、**本番の盤面には書かない**。途中の選択は CPU と同じ `cpuInteraction.ts` で答える
 *   （相手が選ぶ対話は、相手の立場で同じ関数に答えさせる）。
 * ⚠**本番の乱数列を消費しない**＝シミュレーション中だけ固定 seed の列に差し替えて戻す。
 */
export interface LookaheadCtx {
  /** カード番号 → カード（instance ID でも引ける `InstanceMap` を渡す）。 */
  cardMap: Map<string, CardData>;
  /** instance ID → そのカードの効果（付与を含む）。 */
  effectsOf: (id: string) => readonly CardEffect[];
  /** 場のパワーの計算（`calcFieldPowers`）。省略時は印刷パワー。 */
  powersOf?: (cpu: PlayerState, opp: PlayerState) => Map<string, number>;
  /** 作戦データの「手元に置く価値」（`S-2`）。盤面の採点には使わない。 */
  planBonus?: (id: string) => number;
  turnPhase?: TurnPhase;
  /** 🆕§5.7 `S-7`＝CPU のターンか（省略時 true）。相手ターンの応答（`ATTACK_ARTS_OP`）を先読みするときは false＝engine の「あなたのターンの間」が正しく外れる。 */
  isCpuTurn?: boolean;
  /**
   * 🆕§5.7 `S-9`＝この CPU のポリシー（盤面の重み・閾値）。省略時は `DEFAULT_CPU_POLICY`。
   * ⚠**席ごとに違うものが来る**（自己対戦の A/B）＝ここから先で `BOARD_WEIGHTS` を直接読まない。
   */
  policy?: CpuPolicy;
  /**
   * 🆕§5.7 `S-18`＝**その盤面で次のグロウのコストを払えるか**（`cpuGrowReserve` の予約＝人間と同じ支払い判定）。
   * ⚠**渡さなければこの項は 0**（採点は従来どおり）＝`cpuTurnAction` が渡す。
   * 🔑**「グロウ先が無い」と「払えない」を分ける**＝前者は `undefined` を返す（加点も減点もしない）。
   */
  canPayNextGrow?: (st: PlayerState) => boolean | undefined;
}

const STEP_CAP = 40;

/**
 * 盤面の採点の重み（パワー換算）。`S-6` の自己対戦で調整する対象。
 * 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.boardWeights`**（§5.7 `S-9`）＝**値をここに書かない**。
 * ⚠`evaluateBoard` は**ポリシーが来ればそちらを使う**ので、この定数は「既定値の別名」でしかない。
 */
export const BOARD_WEIGHTS = DEFAULT_CPU_POLICY.boardWeights;

const clone = <T>(v: T): T => structuredClone(v);

/**
 * 🆕🔴**先読みのカンニングを塞ぐ**（§5.7 `S-16` の前提・2026-09-20）。
 *
 * ■ 何が漏れていたか＝`simulateEffect` は実 state を `structuredClone` して engine に渡すので、
 *   `execDraw`（`effectExecutor.ts`）が **`state.deck.slice(0, n)`＝本物の山の一番上**を引く。
 *   ⇒ CPU は「ドローの結果」を**正解で**先読みし、それを選択の点数に使っていた（相手の山も同じ＝ミル・デッキ公開）。
 * ■ 線引き（PLAN §5.7.0 ユーザー決定）＝**山の中身（集合）は知ってよい／山の順序は見てはいけない。**
 *   ⇒ **先読み用のコピーだけ山を混ぜる**（集合はそのまま＝サーチの価値は変わらない）。
 * 🔴**決定論は保つ**＝seed は**盤面から決める**（`boardSeed`）＝同じ盤面なら必ず同じ混ぜ方＝同じ手を選ぶ
 *   （`S-9` の A/B と実機シナリオの再現性の前提）。⚠`Math.random` で混ぜない。
 * ⚠**seed は「見てよい情報」だけから作る**（山の順序を入れると、順序が変われば手が変わる＝別の形の漏れ）。
 * ⚠**ライフクロスは混ぜない**＝順序は誰も選べず、クラッシュは engine が末尾から取る（先読みで有利にならない）。
 */
function boardSeed(cpu: PlayerState, opp: PlayerState, turnPhase: string): number {
  // FNV-1a（見えている情報だけ＝手札・場・エナ・トラッシュの枚数と並び、山は**枚数だけ**）。
  const parts = [
    turnPhase, cpu.hand.join(','), opp.hand.length, cpu.energy.join(','), opp.energy.join(','),
    cpu.field.signi.map(z => z?.at(-1) ?? '-').join(','), opp.field.signi.map(z => z?.at(-1) ?? '-').join(','),
    cpu.field.lrig.at(-1) ?? '-', opp.field.lrig.at(-1) ?? '-',
    cpu.deck.length, opp.deck.length, cpu.life_cloth?.length ?? 0, opp.life_cloth?.length ?? 0,
    cpu.trash.length, opp.trash.length,
  ].join('|');
  let h = 0x811c9dc5;
  for (let i = 0; i < parts.length; i++) {
    h ^= parts.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * 山の順序を伏せたコピー（**集合は変えない**）。
 * 🔑**正準順（instance ID の昇順）に並べ直してから混ぜる**＝結果が**山の中身だけ**の関数になる
 *   （並べ直さないと、混ぜた結果が本物の並びに依存する＝順序が判断にわずかに残る）。
 * ⚠**先読み用のコピーにだけ使う**（本番の山は触らない）。
 */
export function hideDeckOrder(state: PlayerState, seed: number): PlayerState {
  if (state.deck.length <= 1) return state;
  const prev = currentRng();
  setRng(mulberry32(seed));
  try {
    return { ...state, deck: shuffle([...state.deck].sort()) };
  } finally {
    setRng(prev);
  }
}

/**
 * 場のシグニの実効パワー（採点用）。⚠**`Infinity` を上限値へ丸める**＝丸めないと
 * `fieldValue(cpu) - fieldValue(opp)` が両側 `∞` のときに **`NaN`** になり、
 * 比較が全部 false に化けて**候補が1つも選ばれない**（例外も出ない）。
 * 🔑`cardStrength` が印字 `∞` に使っている `1e6` と同じ値に揃える。
 * ⚠**名前に固有の接頭辞を付ける**＝`POWER_CAP` だと **STUB id（`WX22-022` の `POWER_CAP`）と衝突して**
 *   `npm run census:stubs` がこの行を「その STUB の消費地点」として誤って数える（2026-09-20 実測。`O-147` と同型の罠）。
 *   ⚠**接頭辞を足すだけでは逃げられない**（照合は部分一致＝`SCORING_POWER_CAP` でも当たった）⇒ **camelCase にして大文字の STUB id 空間から出す。**
 */
const scoringPowerCap = 1e6;
function scoringPowerOf(top: string, ctx: LookaheadCtx, powers?: Map<string, number>): number {
  const fromMap = powers?.get(top);
  if (fromMap !== undefined) return Number.isFinite(fromMap) ? fromMap : scoringPowerCap;
  const raw = (ctx.cardMap.get(getCardNum(top)) ?? ctx.cardMap.get(top))?.Power ?? '';
  return raw === '∞' ? scoringPowerCap : (parseInt(raw, 10) || 0);
}

/**
 * 盤面の採点＝**CPU から見た有利さ**（パワー換算）。
 * 場のシグニの強さ（効果の点数＋パワーの一部）の差＋ライフ・手札・エナの枚数差
 * ＋**正面が空いているシグニの数の差**（正面が空いていればライフへアタックが通る）
 * ＋🆕**バトルに勝てているレーンの数の差**。
 * ⚠盤面は左右反転＝ゾーン `zi` の正面は相手の `2 - zi`（engine 共通規約・`facingSigniPower` と同じ）。
 *
 * 🆕🔴**§5.7 `S-10`（2026-09-20）＝パワーを「線形」から「閾値」へ移した。**
 *
 * ■ 何が壊れていたか（ユーザー指摘「パワーを上げる効果を過剰に使う」）＝同じ「+3000」を2つの層が**4倍違う値**で数えていた。
 *   **使う前**＝`cpuCardStrength.WEIGHTS.powerUp = 0.25` ⇒ 750点／**使った後**＝ここが実効パワーを**係数1.0**で加算 ⇒ 3000点。
 *   `scoreEffectGain`／`scoreCardUseGain` は「使った後 − 使う前」なので、**パワーを上げる効果は必ず満額の得**に見えていた
 *   （+3000 が `openLane`(3000) と同値・ライフ 0.43枚ぶん）。
 * 🔴**係数を下げるだけでは直らない**＝線形であるかぎり「十分大きいバフは常に得」が残る。
 *   **パワーの価値は本来 閾値関数**＝バトルの勝敗が反転しなければ（除去圏を跨がなければ）**ほぼ 0**。
 * ⇒ ①生パワーは `fieldPowerScale`（既定 0.25＝`cardStrength` 側と揃えた）まで落とし、
 *    ②**離散の項** `laneWin`（正面とのバトルに勝てているレーン数の差）を置く。
 * 🔑**これは「一時バフと永続バフが同点」という第3の歪みも同時に薄める**＝勝敗が反転しないバフは 0 点になる。
 * ⚠**除去圏（「パワー○以下」593効果）の閾値跨ぎは第2段**（未実装＝`S-10` の登録票③）。
 * ⚠**旧挙動は `CPU_POLICIES['legacy-power']` で再現できる**（A/B の A 側）。
 */
export function evaluateBoard(cpu: PlayerState, opp: PlayerState, ctx: LookaheadCtx): number {
  // 🆕§5.7 `S-9`＝席ごとのポリシー（無ければ既定）。⚠`BOARD_WEIGHTS` を直接読むと A/B が効かない。
  const W = ctx.policy?.boardWeights ?? BOARD_WEIGHTS;
  const powers = ctx.powersOf?.(cpu, opp);
  /**
   * そのゾーンに**生きている**シグニ（無ければ `undefined`）。
   * 🆕🔴**パワー0以下は「居ない」として数える**（§5.7 `S-10`・2026-09-20）＝
   *   公式ルールのルール処理でバニッシュされる（`powerZeroBanishCandidates`＝`resolveSigniBattle.ts:1840`＝`power > 0` なら対象外）。
   *   🔑**パワーマイナスの価値の本体はここ**＝`fieldPowerScale` を 0.25 に落としたぶん、
   *   「0 まで落として消す」が安く見えてしまうのを、**0 を跨いだ瞬間に満額（場から消える＋正面が空く）**にして取り戻す。
   *   ⚠`evaluateBoard` は**ルール処理を回した後の盤面を見ているわけではない**（`simulateEffect` は効果1つだけ）ので、
   *   ここで先回りして数えないと**「0 以下にした」ことが1点も評価されない**。
   */
  const topOf = (st: PlayerState, zi: number) => {
    const top = st.field.signi[zi]?.at(-1);
    if (!top) return undefined;
    return scoringPowerOf(top, ctx, powers) > 0 ? top : undefined;
  };
  /** 場の1体の点数＝**効果の点数は満額・生パワーは `fieldPowerScale` 倍**（`S-10`）。 */
  const signiValue = (st: PlayerState, zi: number) => {
    const top = topOf(st, zi);
    if (!top) return 0;
    return scoringPowerOf(top, ctx, powers) * W.fieldPowerScale + effectValueOf(ctx.effectsOf(top), 'field');
  };
  const fieldValue = (st: PlayerState) => [0, 1, 2].reduce((sum, zi) => sum + signiValue(st, zi), 0);
  // ⚠**空き判定も `topOf` を通す**＝パワー0以下のシグニが正面に残っていると「塞がっている」と誤読する。
  /**
   * 🆕§5.7 `S-18`＝**次のターンの制約**。①次のグロウが払えるか ②手札が0（③【ガード】の温存は下の自分側だけの項）。
   * 🔑**1ply 伸ばして相手のターンを読むより安くて外しにくい**（相手の手札は非公開＝どのみち近似になる）。
   * 🔴**左右対称に数える**（差で見る）＝片側だけに掛けると**鏡合わせの盤面で点差が付く**（golden `§5.7 S-10` が検出）。
   * ⚠見ているのは**公開情報だけ**（手札の**枚数**・エナ・ルリグ）。
   */
  const nextTurnValue = (st: PlayerState) => {
    let v = 0;
    // 🔴**この項の意味は「今ターンのグロウを確保できているか」**（`cpuGrowReserve` と同じ狙い）＝
    //   **すでにグロウしたなら「確保済み」として満額**を与える。
    //   ⚠**グロウ直後を 0 にすると、グロウそのものが「損」に見えて探索がグロウを選ばなくなる**（2026-09-20 実測）。
    const grown = st.actions_done?.includes('GROW') ?? false;
    const growOk = grown ? true : ctx.canPayNextGrow?.(st);
    if (growOk === true) v += W.growReady;
    if (st.hand.length === 0) v += W.handEmpty;
    return v;
  };
  /**
   * 🆕§5.7 `S-18`＝**手札の【ガード】の温存**（`keepGuards` 枚まで）。
   * ⚠**自分側だけ**＝相手の手札の中身は**非公開**（枚数しか見てよくない）＝相手側で数えるとカンニングになる。
   */
  const guardValue = (st: PlayerState) => {
    const guards = st.hand.filter(id => (ctx.cardMap.get(getCardNum(id)) ?? ctx.cardMap.get(id))?.Guard === '1').length;
    return Math.min(guards, ctx.policy?.keepGuards ?? DEFAULT_CPU_POLICY.keepGuards) * W.guardKept;
  };
  /** センタールリグのレベル（🆕§5.7 `S-18`＝グロウの価値）。 */
  const lrigLevelOf = (st: PlayerState) => {
    const top = st.field.lrig.at(-1);
    if (!top) return 0;
    const c = ctx.cardMap.get(getCardNum(top)) ?? ctx.cardMap.get(top);
    return parseInt(c?.Level ?? '0', 10) || 0;
  };
  const openLanes = (me: PlayerState, them: PlayerState) =>
    [0, 1, 2].filter(zi => topOf(me, zi) !== undefined && topOf(them, 2 - zi) === undefined).length;
  /**
   * 🆕`me` のシグニが**正面とのバトルに勝てている**レーン数（`S-10` の閾値項）。
   * 🔑判定は `cpuAttackValueOf` を再利用する＝**公式ルール（アタック側のパワー「以上」で勝ち）を2か所に書かない**。
   * ⚠同値は**両者とも勝ち**になる（＝殴ったほうが勝つ）＝差し引き 0 になり、実際の有利不利と一致する。
   */
  const wonLanes = (me: PlayerState, them: PlayerState) =>
    [0, 1, 2].filter(zi => {
      const mine = topOf(me, zi), theirs = topOf(them, 2 - zi);
      if (!mine || !theirs) return false;
      return cpuAttackValueOf(scoringPowerOf(mine, ctx, powers), scoringPowerOf(theirs, ctx, powers)) === 'winBattle';
    }).length;
  /**
   * 🆕§5.7 `S-21`＝**このターンに実際に殴れるレーン**（既定 `turnDamage: 0`＝この項は無い）。
   * 🔑**`openLanes` とは2点違う**＝
   *   ①**手番側だけ**に上乗せする（ターンは対称ではない＝いまアタックするのは一方だけ）。
   *   ②🔴**ダウン・凍結しているシグニは数えない**（殴れない）。
   *     🔑**これが《ダウン》コストの値段**＝`evaluateBoard` は `signi_down` をどこでも見ていなかったので、
   *     【起】の《ダウン》（live 284効果）は**払っても 1点も減らない**＝タダのコストに見えていた。
   * 🔑**終端を「アタック後」へ寄せる安い近似**＝これが無いと盤面へ出す価値が手札1枚より安く見える。
   * ⚠**アタック制限の効果までは見ていない**（「アタックできない」の付与）＝そこまで見るのは `S-17`。
   */
  const attackLanes = (me: PlayerState, them: PlayerState) =>
    [0, 1, 2].filter(zi => topOf(me, zi) !== undefined && topOf(them, 2 - zi) === undefined
      && !me.field.signi_down?.[zi] && !me.field.signi_frozen?.[zi]).length;
  const attackerOpenLanes = (ctx.isCpuTurn ?? true) ? attackLanes(cpu, opp) : -attackLanes(opp, cpu);
  return fieldValue(cpu) - fieldValue(opp)
    + (openLanes(cpu, opp) - openLanes(opp, cpu)) * W.openLane
    + attackerOpenLanes * W.turnDamage
    + (wonLanes(cpu, opp) - wonLanes(opp, cpu)) * W.laneWin
    + [0, 1, 2].filter(zi => topOf(opp, zi) !== undefined && opp.field.signi_frozen?.[zi]).length * W.oppFrozen
    + (cpu.life_cloth.length - opp.life_cloth.length) * W.life
    + (cpu.hand.length - opp.hand.length) * W.hand
    + (cpu.energy.length - opp.energy.length) * W.energy
    // 🆕§5.7 `S-18`＝**ルリグのレベル差**（グロウの価値＝リミットと出せるシグニの上限）。
    + (lrigLevelOf(cpu) - lrigLevelOf(opp)) * W.lrigLevel
    // 🆕§5.7 `S-18`＝次のターンの制約（左右対称）＋【ガード】の温存（自分側だけ＝相手の手札は非公開）。
    + (nextTurnValue(cpu) - nextTurnValue(opp))
    + guardValue(cpu);
}

/** 対話に答えて resume する（1手）。答えられない形は null。 */
function answer(pending: PendingInteractionDef, ctx: ExecCtx, lctx: LookaheadCtx): ExecResult | null {
  // 相手が選ぶ対話は、相手の立場（cpu と opp を入れ替え）で答える。
  const opponentChooses = 'opponentResponds' in pending && pending.opponentResponds === true;
  const me = opponentChooses ? ctx.otherState : ctx.ownerState;
  const them = opponentChooses ? ctx.ownerState : ctx.otherState;
  const ictx: CpuInteractionCtx = { cpuState: me, oppState: them, cardMap: lctx.cardMap, effectsOf: lctx.effectsOf };
  switch (pending.type) {
    case 'SELECT_TARGET': return resumeSelectTarget(pickCpuTargets(pending, ictx), pending, ctx);
    case 'SEARCH': return resumeSearch(pickCpuSearch(pending, ictx), pending, ctx);
    case 'CHOOSE': {
      const picked = pickCpuChoice(pending, ictx);
      const id = picked[0] ?? '';
      const opt = pending.options.find(o => o.id === id);
      if (pending.leaveSubstituteAsk || pending.costlessOpponentChoice) return resumeChoose(id, pending, ctx);
      if (pending.opponentResponds) return resumeOpponentPayOptional(id, picked.slice(1), pending, ctx);
      if (opt?.costColors?.length || opt?.coinCost) return resumeOptionalCost(id, picked.slice(1), pending, ctx);
      return resumeChoose(pending.multiSelect ? picked : id, pending, ctx);
    }
    case 'LOOK_AND_REORDER': return resumeLookAndReorder([...pending.cards], [], pending, ctx);
    case 'SELECT_ZONE': {
      const z = pickCpuEmptySigniZone(pending.owner === 'self' ? ctx.ownerState : ctx.otherState);
      return z === null ? null : resumeSelectZone(z, pending, ctx);
    }
    case 'SELECT_SIGNI_ZONE': {
      const z = pickCpuEmptySigniZone(pending.owner === 'self' ? ctx.ownerState : ctx.otherState);
      return z === null ? null : resumeSelectSigniZone(z, pending, ctx);
    }
    case 'SELECT_VIRUS_ZONE':
      return resumeSelectVirusZone(pickCpuVirusZone(pending, pending.owner === 'self' ? ctx.ownerState : ctx.otherState), pending, ctx);
    case 'ALLOCATE_POWER': return resumeAllocatePower(pickCpuAllocatePower(pending, ictx), pending, ctx);
    case 'REARRANGE_SIGNI': {
      const choice = pickCpuRearrange(pending);
      return choice ? resumeRearrangeSigni(choice, pending, ctx) : null;
    }
    case 'REVEAL_CARDS': return resumeRevealCards(pending, ctx);
    default: return null;
  }
}

/**
 * 効果を1つ解決した盤面（CPU が効果の持ち主）。解決しきれなければ null。
 * ⚠渡した盤面は書き換えない（コピーで解決する）。
 */
export function simulateEffect(
  effect: CardEffect, sourceId: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx,
): { cpu: PlayerState; opp: PlayerState } | null {
  const prevRng = currentRng();
  setRng(mulberry32(0x5eed));
  try {
    // 🔴山の順序は見てはいけない（`hideDeckOrder`）＝**先読み用のコピーだけ**混ぜる。本番の盤面は触らない。
    const seed = boardSeed(cpu, opp, lctx.turnPhase ?? 'MAIN');
    const base: ExecCtx = {
      ownerState: hideDeckOrder(clone(cpu), seed), otherState: hideDeckOrder(clone(opp), seed ^ 0x9e3779b9), cardMap: lctx.cardMap, logs: [],
      sourceCardNum: sourceId, triggeringCardNum: sourceId, currentPhase: lctx.turnPhase ?? 'MAIN', isOwnerTurn: lctx.isCpuTurn ?? true,
    } as ExecCtx;
    let result = executeEffect(effect, base);
    for (let step = 0; !result.done; step++) {
      if (step >= STEP_CAP) return null;
      const next = answer(result.pending, { ...base, ownerState: result.ownerState, otherState: result.otherState, logs: result.logs }, lctx);
      if (!next) return null;
      result = next;
    }
    return { cpu: result.ownerState, opp: result.otherState };
  } catch {
    return null;
  } finally {
    setRng(prevRng);
  }
}

/**
 * CPU がシグニを手札から場に出したときに**必ず発動する【出】**（CPU の通常召喚と同じ絞り込み）。
 * コスト付きの任意【出】は CPU が発動しない（`mandatory:false` を除く）。
 */
/**
 * 🆕§5.7 `S-17` 第2段＝**アタックしたときに必ず誘発する【自】**（`ON_ATTACK_SIGNI` / `ON_ATTACK_LRIG`）。
 *
 * 🔑**アタック順が意味を持つのはここ**＝母集団は `ON_ATTACK_SIGNI` **684効果 / 667枚**（2026-09-20 実測）。
 * ⚠**絞り込みは `cpuOnPlayEffectsOf` と同じ**（自分を発生源とする・任意でない・効果による誘発ではない・
 *   `activeCondition` を満たす）＝**同じ規律で同じ穴を避ける**（任意の【自】を CPU が勝手に撃たない）。
 * ⚠**`onPlayOriginMatches` は見ない**（出どころの条件は【出】固有）。
 */
export function cpuAttackTriggerEffectsOf(
  id: string, timing: 'ON_ATTACK_SIGNI' | 'ON_ATTACK_LRIG',
  cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx,
): CardEffect[] {
  return lctx.effectsOf(id).filter(e =>
    e.effectType === 'AUTO'
    && (e.timing?.includes(timing) ?? false)
    && (e.triggerScope === undefined || e.triggerScope === 'self')
    && e.mandatory !== false
    && !e.triggerCondition?.byEffect && !e.triggerCondition?.bySigniEffect
    && (!e.activeCondition || checkActiveCondition(e.activeCondition, cpu, opp, true, lctx.cardMap, id)));
}

export function cpuOnPlayEffectsOf(id: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx): CardEffect[] {
  return lctx.effectsOf(id).filter(e =>
    e.effectType === 'AUTO'
    && (e.timing?.includes('ON_PLAY') ?? false)
    && (e.triggerScope === undefined || e.triggerScope === 'self' || e.triggerScope === 'any')
    && e.mandatory !== false
    && !e.triggerCondition?.byEffect && !e.triggerCondition?.bySigniEffect
    && onPlayOriginMatches(e, 'hand')
    && (!e.activeCondition || checkActiveCondition(e.activeCondition, cpu, opp, true, lctx.cardMap, id)));
}

/**
 * 手札のシグニ `id` をゾーン `zone` に出して【出】を解決した盤面の点数（先読み）。
 * 【出】の途中で解決できなかったら、置いただけの盤面で採点する（効果の分は見ない）。
 */
export function scoreDeploy(id: string, zone: number, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx): number {
  const signi = [...cpu.field.signi] as (string[] | null)[];
  signi[zone] = [id];
  let placedCpu: PlayerState = { ...cpu, hand: cpu.hand.filter(h => h !== id), field: { ...cpu.field, signi } };
  let placedOpp = opp;
  for (const e of cpuOnPlayEffectsOf(id, placedCpu, placedOpp, lctx)) {
    const after = simulateEffect(e, id, placedCpu, placedOpp, lctx);
    if (!after) continue;
    placedCpu = after.cpu;
    placedOpp = after.opp;
  }
  return evaluateBoard(placedCpu, placedOpp, lctx);
}

/**
 * 効果（スペル・アーツ・【起】）を使った盤面の点数の**増分**（使う前との差）。解決しきれなければ null。
 * ⚠コスト（エナ）の支払いは呼び出し側が済ませた盤面を渡す（ここはコストを払わない）。
 */
export function scoreEffectGain(effect: CardEffect, sourceId: string, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx): number | null {
  const after = simulateEffect(effect, sourceId, cpu, opp, lctx);
  if (!after) return null;
  return evaluateBoard(after.cpu, after.opp, lctx) - evaluateBoard(cpu, opp, lctx);
}

/**
 * 手札・ルリグデッキのカード（スペル・アーツ）を使ったときの点数の増分（§5.7 `S-4c`）。
 * コストのエナ `costCount` 枚を払い、カードを手札から出した盤面から `ACTIVATED` の効果を順に解決して、使う前と比べる。
 * どれか1つでも解決しきれなければ null（＝先読みでは判断しない）。
 */
export function scoreCardUseGain(
  cardId: string, costCount: number, cpu: PlayerState, opp: PlayerState, lctx: LookaheadCtx, from: 'hand' | 'lrig_deck',
): number | null {
  const before = evaluateBoard(cpu, opp, lctx);
  let actor: PlayerState = {
    ...cpu,
    energy: cpu.energy.slice(0, Math.max(0, cpu.energy.length - costCount)),
    ...(from === 'hand' ? { hand: cpu.hand.filter(h => h !== cardId) } : { lrig_deck: cpu.lrig_deck.filter(h => h !== cardId) }),
  };
  let other = opp;
  const acts = lctx.effectsOf(cardId).filter(e => e.effectType === 'ACTIVATED');
  if (acts.length === 0) return null;
  for (const e of acts) {
    const after = simulateEffect(e, cardId, actor, other, lctx);
    if (!after) return null;
    actor = after.cpu;
    other = after.opp;
  }
  return evaluateBoard(actor, other, lctx) - before;
}

/**
 * スペルを使う価値があるとみなす増分の下限（カード1枚＋エナを使うぶんより得か）。
 * 🔴**実体は `cpuPolicy.DEFAULT_CPU_POLICY.spellGainMin`**（§5.7 `S-9`）＝**値をここに書かない**。
 */
export const SPELL_GAIN_MIN = DEFAULT_CPU_POLICY.spellGainMin;
