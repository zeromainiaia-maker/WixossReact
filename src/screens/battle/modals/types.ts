// モーダル群が共有する BattleScreen 由来のコンテキスト束（Stage 1 抽出）。
// ほぼ全モーダルが参照する値をまとめ、モーダル固有の state/handler は各コンポーネントの props で渡す。
import type { MutableRefObject, Dispatch, SetStateAction } from 'react';
import type { PlayerState, CardData } from '../../../types';
import type { CardEffect } from '../../../types/effects';
import type { ActiveCostMod } from '../../../engine/effectEngine';

export interface BattleModalCtx {
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
}
