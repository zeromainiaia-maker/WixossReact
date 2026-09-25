import { InstanceMap } from './battleUtils';
import { getCardNum } from '../../engine/execUtils';
import type { CardData, PendingEffect, PlayerState } from '../../types';
import type { CardEffect } from '../../types/effects';
import { buildCpuGrowReserve } from './cpuGrowReserve';
import { planEffectPick, planKeepBonus, planTargetBonus, resolveCpuTargetMode, PLAN_WEIGHTS, type CpuDeckPlan } from './cpuDeckPlan';
import type { CpuPolicy } from './cpuPolicy';
import {
  isDeclineOption, pickCpuAllocatePower, pickCpuChoice, pickCpuEmptySigniZone, pickCpuRearrange,
  pickCpuSearch, pickCpuTargets, pickCpuVirusZone, targetIntentFor, type CpuInteractionCtx,
} from './cpuInteraction';
import { declarationScalingCost } from './cpuDeclarationCost';

/**
 * 🆕**CPU の対話応答の「宛先」を決める純関数**（§5.7 `S-5d` 第2段・2026-09-19）。
 *
 * ■ **なぜ要るか**＝`cpuInteraction.ts`（何と答えるか）は 2026-09-17 に純関数化したのに、
 *   **「どのハンドラへ渡すか」の振り分けは `BattleScreen` の `useEffect` に残っていた**＝
 *   ヘッドレス（`S-5`）は**CPU の対話に答えられない**（`S-5d` 第1段で「答える7本」は移したので、残りはここだけ）。
 * ■ **ここは振り分けだけ**＝実際に答えるのは人間と同じ7本（`controller/effectInteraction.ts`）。
 *   🔑**待ち時間（`CPU_ACTION_DELAY`）と `setTimeout` は呼び出し側の仕事**＝画面は「人が見て分かる速さ」で遅らせ、
 *   ヘッドレスは**待たずに**同じ結果を使う。ここに時間を持ち込むと自己対戦が実時間に縛られる。
 *
 * ⚠**`null` は「CPU は答えない」**＝①応答者が CPU でない ②空きゾーンが無くて選べない。
 *   どちらも**画面側で何もしない**のが従来挙動（`useEffect` が `return` していた）。
 */
export type CpuInteractionResponse =
  | { kind: 'rearrange'; arrangement: string[] | null }
  | { kind: 'allocate'; alloc: Record<string, number> }
  | { kind: 'virusZone'; zone: number | null }
  | { kind: 'signiZone'; zone: number }
  | { kind: 'zone'; zone: number }
  /** `SELECT_TARGET` / `CHOOSE` / `SEARCH` / `LOOK_AND_REORDER`＝`handleEffectInteraction(selected)` へ。 */
  | { kind: 'effect'; selected: string[]; logs: string[] };

export interface CpuInteractionRespondDeps {
  /** CPU のプレイヤーID（`CPU_PLAYER_ID`）。 */
  cpuPlayerId: string;
  hostId: string;
  hostState: PlayerState;
  guestState: PlayerState;
  /** 画面の props の全カード（⚠場で使う `battleCards` とは別物＝`cardMap` とも別に要る）。 */
  cards: CardData[];
  /** 場のカード表（`battleCardMap`）。 */
  cardMap: Map<string, CardData>;
  /** 付与を含む効果の一覧（`S-1` の「パワー＋効果の強さ」に要る）。 */
  effectsMap: Map<string, CardEffect[]>;
  /** CPU デッキの作戦データ（`S-2`）。 */
  cpuPlan: CpuDeckPlan;
  /** 🆕§5.7 `S-6` 第2段＝この席の CPU のポリシー（省略時は既定＝画面は渡さない）。 */
  policy?: CpuPolicy;
}

export function decideCpuInteractionResponse(
  pe: PendingEffect, d: CpuInteractionRespondDeps,
): CpuInteractionResponse | null {
  const inter = pe.interaction;
  // 🆕§5.6 `C-8`（2026-09-17）＝**何と答えるかは `cpuInteraction.ts` の純関数**（golden で固定）。ここは呼んで実行するだけ。
  //   旧＝この effect に直書きで、選択肢は「押せる先頭」固定（分岐の片側しか踏まない）・対象は完全ランダムだった。
  if ((pe.respondPlayerId ?? pe.sourcePlayerId) !== d.cpuPlayerId) return null;
  const cpuIsHost = d.hostId === d.cpuPlayerId;
  // 🆕2026-09-25＝**この効果に当たるコンボの手の「選び方」**（効果単位＝`pe.effectId` で E1/E2/BURST を区別する）。
  const pick = planEffectPick(d.cpuPlan, pe.sourceCardNum, pe.effectId);
  const pickBonus = (id: string) => (pick?.cards?.includes(getCardNum(id)) ? (d.policy?.planWeights ?? PLAN_WEIGHTS).targetPrefer : 0);
  const cpuCtx: CpuInteractionCtx = {
    cpuState: cpuIsHost ? d.hostState : d.guestState,
    oppState: cpuIsHost ? d.guestState : d.hostState,
    // ⚠instance ID（`#…`）で引く補助関数（支払うエナの選出）があるので InstanceMap を渡す。
    cardMap: new InstanceMap(d.cards.map(c => [c.CardNum, c] as [string, CardData])),
    // §5.7 `S-1`＝「パワー＋効果の強さ」で比べるための効果の一覧（付与を含む）。
    effectsOf: id => d.effectsMap.get(id) ?? [],
    // 🆕2026-09-25＝コンボの手が名指しした札（サーチ・公開から選ぶ先）もここで優先する。
    planBonus: id => planKeepBonus(d.cpuPlan, id, d.policy) + pickBonus(id),
    // 🆕§5.7 `S-32`＝対象の狙い方（デッキごと・既定は `strongest`＋加点0＝挙動不変）。
    // 🆕§5.7 `S-32` ②③＝**狙い方はここで解決する**（効果ごと・盤面の条件つきの規則を上から見る）。
    targetMode: resolveCpuTargetMode(d.cpuPlan, {
      sourceCardNum: pe.sourceCardNum, effectId: pe.effectId, me: cpuIsHost ? d.hostState : d.guestState, opp: cpuIsHost ? d.guestState : d.hostState,
    }),
    // 🆕2026-09-25＝属性での指定は削った。コンボの手が名指しした札（その効果の選ぶ先）を優先する。
    targetBonus: id => planTargetBonus(d.cpuPlan, id, d.policy, pick),
    policy: d.policy,
    // 🆕§5.7 `S-29`（2026-09-22）＝**この宣言の帰結のコスト**（「それのレベル１につき〈コスト〉」）を
    //   効果の木から読んで渡す（対話そのものには入っていない）。⚠見つからなければ `undefined`＝挙動不変。
    followUpCost: declarationScalingCost(
      (d.effectsMap.get(pe.sourceCardNum) ?? []).find(e => e.effectId === pe.effectId),
    ) ?? undefined,
  };
  // 🆕グロウ用エナの予約（ユーザー指示「エナを使ってグロウできなくなることは必ず避ける」）。
  cpuCtx.energyReserve = buildCpuGrowReserve({ actor: cpuCtx.cpuState, opponent: cpuCtx.oppState, cardMap: d.cardMap, effectsMap: d.effectsMap, cards: d.cards });
  // REARRANGE_SIGNI は効果オーナーが応答（CPUの効果なら現状維持で自動確定）
  if (inter.type === 'REARRANGE_SIGNI') {
    return { kind: 'rearrange', arrangement: pickCpuRearrange(inter) };
  }
  // `ALLOCATE_POWER`（§5.3 `O-140`）＝効果オーナーが割り振る（検算は `resumeAllocatePower`）。
  if (inter.type === 'ALLOCATE_POWER') {
    return { kind: 'allocate', alloc: pickCpuAllocatePower(inter, cpuCtx) };
  }
  // SELECT_VIRUS_ZONE / SELECT_ZONE / SELECT_SIGNI_ZONE は効果オーナーが応答する（CPUの効果ならCPUがゾーンを自動選択）
  if (inter.type === 'SELECT_VIRUS_ZONE' || inter.type === 'SELECT_ZONE' || inter.type === 'SELECT_SIGNI_ZONE') {
    const ownerIsHost = pe.sourcePlayerId === d.hostId;
    const tgtIsHost = inter.owner === 'self' ? ownerIsHost : !ownerIsHost;
    const tgtState = tgtIsHost ? d.hostState : d.guestState;
    if (inter.type === 'SELECT_VIRUS_ZONE') {
      return { kind: 'virusZone', zone: pickCpuVirusZone(inter, tgtState) };
    }
    const emptyZone = pickCpuEmptySigniZone(tgtState);
    // ⚠**空きが無ければ答えない**（従来も `return` して何もしなかった）。
    if (emptyZone === null) return null;
    return inter.type === 'SELECT_SIGNI_ZONE'
      ? { kind: 'signiZone', zone: emptyZone }
      : { kind: 'zone', zone: emptyZone };
  }
  // 応答者がCPUの場合（respondPlayerId指定、または無指定で効果オーナーがCPU）は自動応答する
  // （CPU所有効果のSELECT_TARGET等はUIに表示されないため、ここで応答しないと固まる）
  let selected: string[] = [];
  const logs: string[] = [];
  if (inter.type === 'SELECT_TARGET') {
    selected = pickCpuTargets(inter, cpuCtx);
    // 🆕🔴§5.7 `S-22`（2026-09-21）＝**効果の意味も置き場も読めず乱数で決めた対象選択**の回数＝**0 が正**
    //   （`census:play` の規則 `targetRandom`）。🔑**この失敗はどの計器にも映っていなかった**＝
    //   盤面も勝敗も静かに悪くなるだけで、golden も smoke も緑のまま通る。
    //   ⚠**選ぶ余地が無い形（候補 ≦ 必要数）は数えない**＝どう選んでも同じ。⚠文言は `playCensus.ts` の契約。
    if (inter.candidates.length > (typeof inter.count === 'number' ? inter.count : 1)
      && targetIntentFor(inter, cpuCtx.policy) === 'unknown') {
      logs.push(`[CPU] 対象を乱数で選んだ: ${(inter.thenAction as { type?: string } | undefined)?.type ?? '?'}/${inter.targetScope}`);
    }
  } else if (inter.type === 'CHOOSE') {
    selected = pickCpuChoice(inter, cpuCtx);
    const chosen = inter.options.find(o => o.id === selected[0]);
    // §5.6 `C-3` の計器が「分岐の両側を踏んだか」を数えるための行（文言は playCensus.ts の anchor）。
    if (chosen) logs.push(`[CPU] 選択: ${chosen.label}${isDeclineOption(chosen) ? '（断る）' : ''}`);
  } else if (inter.type === 'SEARCH') {
    selected = pickCpuSearch(inter, cpuCtx);
  } else if (inter.type === 'LOOK_AND_REORDER') {
    selected = [...inter.cards];
  }
  return { kind: 'effect', selected, logs };
}
