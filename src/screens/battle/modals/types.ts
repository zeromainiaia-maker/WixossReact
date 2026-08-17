// モーダル群が共有する BattleScreen 由来のコンテキスト束（Stage 1 抽出）。
// ほぼ全モーダルが参照する値をまとめ、モーダル固有の state/handler は各コンポーネントの props で渡す。
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import type { BattleStateRow, PlayerState, CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import type { ActiveCostMod } from '../../../engine/effectEngine';
import type { ResonaSummonCandidate } from '../resonaSummon';
import type { EnergyPayEntry } from '../energyPaySource';
import type { ArtsPayerCtx } from '../artsUseGate';

// カットイン候補（スペルカットイン/カットイン起動効果の出所つきカード）
export interface EffectCutinCandidate {
  kind: 'effect';
  card: CardData;
  instanceId: string;
  source: 'lrig_deck' | 'lrig_field' | 'signi_field' | 'hand';
  effect: CardEffect;
  zoneIdx?: number;
  handIdx?: number;
  /** Pending spell cost total paid as additional colorless energy for this cut-in mode. */
  additionalColorlessCost?: number;
  /** Explicit opt-in; legacy cut-ins retain their historical always-counter behavior. */
  countersSpell?: boolean;
}

export interface ResonaCutinCandidate {
  kind: 'resona';
  card: CardData;
  instanceId: string;
  source: 'lrig_deck';
  resona: ResonaSummonCandidate;
}

export type CutinCandidate = EffectCutinCandidate | ResonaCutinCandidate;

export interface BattleModalCtx {
  bs: BattleStateRow;
  user: User;
  my: PlayerState;
  op: PlayerState;
  isMyTurn: boolean;
  loading: boolean;
  battleCards: CardData[];
  battleCardMap: Map<string, CardData>;
  effectsMap: Map<string, CardEffect[]>;
  myEnaAllMulti: boolean;
  myEnaMultiStripped: boolean;
  myColorlessOverrides: string[];
  myColorSubs: { from: string[]; to: string }[];
  pickLongPressTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setExpandedPickImgUrl: Dispatch<SetStateAction<string | null>>;
  activeCostMods: { forMy: ActiveCostMod[]; forOp: ActiveCostMod[] };
  myEnergyExtraColors: Map<string, string>;
  /**
   * エナコストの支払い元プール（§6.4「エナ支払い元の一本化」）。**先頭 `my.energy.length` 件が
   * エナゾーンそのもの・同じ順**なので、既存の `Set<number>` 選択はそのまま通る。
   * ⚠**候補描画も `canAfford*` への受け渡しも必ずこれを使う**（`my.energy` を直読みしない）。
   * 片方だけ pool にすると「払えるのに候補に出ない／出るのに払えない」になる。
   */
  myEnergyPayPool: EnergyPayEntry[];
  myEnergyTrashSubInfo: { wildcardInstIds: Set<string>; colorOverrideMap: Map<string, string>; keySubInstId: string | null };
  myLrigNameAliases: string[];
  myArtsThresholdReductions: { minTotalCost: number; color: string; reduction: number }[];
  isActionBlocked: (actionId: string) => boolean;
  specificCardCostReductions: { targetCardName: string; colorlessReduction: number }[];
  /**
   * アーツ／スペルの使用可否・実効コストを判定する funnel（`artsUseGate.buildArtsPayerCtx`）。
   * ⚠**支払いUI もコスト計算はこの ctx を通した gate 関数を呼ぶ**＝入口を増やさない（PLAN §4 教訓 (d)）。
   */
  myArtsPayerCtx: ArtsPayerCtx | null;
}
