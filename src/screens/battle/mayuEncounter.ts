import type { PlayerState } from '../../types';
import { getCardNum } from '../../engine/effectExecutor';

export const MAYU_ENCOUNTER_A = 'WXDi-P13-003A';
export const MAYU_ENCOUNTER_B = 'WXDi-P13-003B';

export interface MayuEncounterPreparation {
  state: PlayerState;
  instanceId: string;
  movedFromHand: string[];
  movedFromEnergy: string[];
  movedCount: number;
  canGrow: boolean;
}

/** Resolve the non-interactive part of 未知の邂逅 without committing a partial board. */
export function prepareMayuEncounter(state: PlayerState): MayuEncounterPreparation | null {
  const instanceId = state.field.key_piece;
  if (!instanceId || getCardNum(instanceId) !== MAYU_ENCOUNTER_A) return null;

  const movedFromHand = [...state.hand];
  const movedFromEnergy = [...state.energy];
  const movedCount = movedFromHand.length + movedFromEnergy.length;
  const canGrow = movedCount >= 5;
  const next: PlayerState = {
    ...state,
    hand: [],
    energy: [],
    trash: [...state.trash, ...movedFromHand, ...movedFromEnergy],
    ...(canGrow
      ? {
          field: { ...state.field, key_piece: null },
          card_identity_overrides: {
            ...(state.card_identity_overrides ?? {}),
            [instanceId]: MAYU_ENCOUNTER_B,
          },
        }
      : {}),
  };
  return { state: next, instanceId, movedFromHand, movedFromEnergy, movedCount, canGrow };
}
