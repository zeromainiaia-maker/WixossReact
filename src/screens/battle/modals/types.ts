// モーダル群が共有する BattleScreen 由来のコンテキスト束（Stage 1 抽出）。
// ほぼ全モーダルが参照する値をまとめ、モーダル固有の state/handler は各コンポーネントの props で渡す。
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { User } from '@supabase/supabase-js';
import type { BattleStateRow, PlayerState, CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import type { ActiveCostMod } from '../../../engine/effectEngine';

// カットイン候補（スペルカットイン/カットイン起動効果の出所つきカード）
export interface CutinCandidate {
  card: CardData;
  instanceId: string;
  source: 'lrig_deck' | 'lrig_field' | 'signi_field' | 'hand';
  effect: CardEffect;
  zoneIdx?: number;
  handIdx?: number;
}

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
  myColorlessOverrides: string[];
  myColorSubs: { from: string[]; to: string }[];
  pickLongPressTimer: MutableRefObject<ReturnType<typeof setTimeout> | null>;
  setExpandedPickImgUrl: Dispatch<SetStateAction<string | null>>;
  activeCostMods: { forMy: ActiveCostMod[]; forOp: ActiveCostMod[] };
  myEnergyExtraColors: Map<string, string>;
  myEnergyTrashSubInfo: { wildcardInstIds: Set<string>; colorOverrideMap: Map<string, string>; keySubInstId: string | null };
  myLrigNameAliases: string[];
  myArtsThresholdReductions: { minTotalCost: number; color: string; reduction: number }[];
  isActionBlocked: (actionId: string) => boolean;
  specificCardCostReductions: { targetCardName: string; colorlessReduction: number }[];
}
