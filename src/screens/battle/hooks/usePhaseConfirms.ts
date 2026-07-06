// フェイズ進行の確認ダイアログ開閉フラグ束（Stage2: useState 9本を useReducer へ純移動）。
// PhaseConfirmDialogs / EndConfirmModal / SystemOverlays 等が参照する小型確認ダイアログの表示状態。
import { useDomainState } from './useDomainState';

export interface PhaseConfirmsState {
  showEndConfirm: boolean;
  showSetupLeaveConfirm: boolean;
  showEnergySkipConfirm: boolean;
  showGrowSkipConfirm: boolean;
  showSigniAttackSkipConfirm: boolean;
  showMustAttackWarning: boolean;
  showLrigAttackSkipConfirm: boolean;
  showUpkeepPayConfirm: boolean;
  // SELF_SIGNI_TRASH（リムーブ封じ。WX04-046-E1等）で押下時に出す警告
  showRemoveBlockedWarn: boolean;
}

const initialState: PhaseConfirmsState = {
  showEndConfirm: false,
  showSetupLeaveConfirm: false,
  showEnergySkipConfirm: false,
  showGrowSkipConfirm: false,
  showSigniAttackSkipConfirm: false,
  showMustAttackWarning: false,
  showLrigAttackSkipConfirm: false,
  showUpkeepPayConfirm: false,
  showRemoveBlockedWarn: false,
};

export function usePhaseConfirms() {
  const [state, set] = useDomainState<PhaseConfirmsState>(initialState);
  return {
    ...state,
    setShowEndConfirm: set.showEndConfirm,
    setShowSetupLeaveConfirm: set.showSetupLeaveConfirm,
    setShowEnergySkipConfirm: set.showEnergySkipConfirm,
    setShowGrowSkipConfirm: set.showGrowSkipConfirm,
    setShowSigniAttackSkipConfirm: set.showSigniAttackSkipConfirm,
    setShowMustAttackWarning: set.showMustAttackWarning,
    setShowLrigAttackSkipConfirm: set.showLrigAttackSkipConfirm,
    setShowUpkeepPayConfirm: set.showUpkeepPayConfirm,
    setShowRemoveBlockedWarn: set.showRemoveBlockedWarn,
  };
}
