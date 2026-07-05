// フェイズ進行の小型確認ダイアログ群（エナチャージ/グロウ/UPKEEP/シグニアタック/強制攻撃警告/リムーブ封じ/ルリグアタック）。BattleScreen.tsx から Stage 1 で抽出。
import type { Dispatch, SetStateAction } from 'react';
import { createPortal } from 'react-dom';
import type { CardData } from '../../../types';
import { collectGrowCostReductions } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { applyGrowCostReduction, canAffordGrowCost } from '../costs';
import type { BattleModalCtx } from './types';

interface PhaseConfirmDialogsProps {
  ctx: BattleModalCtx;
  showEnergySkipConfirm: boolean;
  setShowEnergySkipConfirm: Dispatch<SetStateAction<boolean>>;
  showGrowSkipConfirm: boolean;
  setShowGrowSkipConfirm: Dispatch<SetStateAction<boolean>>;
  showUpkeepPayConfirm: boolean;
  showSigniAttackSkipConfirm: boolean;
  setShowSigniAttackSkipConfirm: Dispatch<SetStateAction<boolean>>;
  showMustAttackWarning: boolean;
  setShowMustAttackWarning: Dispatch<SetStateAction<boolean>>;
  showRemoveBlockedWarn: boolean;
  setShowRemoveBlockedWarn: Dispatch<SetStateAction<boolean>>;
  showLrigAttackSkipConfirm: boolean;
  setShowLrigAttackSkipConfirm: Dispatch<SetStateAction<boolean>>;
  growCandidates: CardData[];
  doPhaseAdvance: () => void;
  handleUpkeepPay: (mode: 'energy' | 'discard') => void;
  handleUpkeepDecline: () => void;
}

export function PhaseConfirmDialogs(p: PhaseConfirmDialogsProps) {
  const { my, op, isMyTurn, battleCards, battleCardMap, effectsMap, myEnaAllMulti, myColorlessOverrides, myColorSubs } = p.ctx;
  const { showEnergySkipConfirm, setShowEnergySkipConfirm, showGrowSkipConfirm, setShowGrowSkipConfirm,
    showUpkeepPayConfirm, showSigniAttackSkipConfirm, setShowSigniAttackSkipConfirm,
    showMustAttackWarning, setShowMustAttackWarning, showRemoveBlockedWarn, setShowRemoveBlockedWarn,
    showLrigAttackSkipConfirm, setShowLrigAttackSkipConfirm,
    growCandidates, doPhaseAdvance, handleUpkeepPay, handleUpkeepDecline } = p;
  return (
    <>
      {/* エナチャージスキップ確認 */}
      {showEnergySkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 320px)', textAlign: 'center',
          }}>
            <p style={{ color: C.text, fontSize: 15, fontWeight: 'bold', margin: '0 0 8px' }}>
              エナチャージを行いますか？
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              エナチャージを行わずグロウフェイズへ進みます
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowEnergySkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowEnergySkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {showGrowSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              グロウ可能なルリグがいます
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 12px' }}>
              {growCandidates
                .filter(c => canAffordGrowCost(my.energy, battleCards, applyGrowCostReduction(c.GrowCost, collectGrowCostReductions(my, op, isMyTurn, effectsMap, battleCardMap)), my.keyword_grants, myEnaAllMulti, myColorlessOverrides, myColorSubs))
                .map(c => c.CardName)
                .join('・')}
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 20px' }}>
              グロウせずにメインフェイズへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowGrowSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowGrowSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* UPKEEP_OR_NO_UP: センタールリグのアップ条件確認 */}
      {showUpkeepPayConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              センタールリグにアップ条件があります
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: '0 0 20px' }}>
              {my.lrig_upkeep_condition === 'pay_colorless3' ? '《無》×3を支払わないかぎりアップしません。'
                : my.lrig_upkeep_condition === 'discard_or_colorless1' ? '手札を1枚捨てるか《無》×1を支払わないかぎりアップしません。'
                : '《無》×1を支払わないかぎりアップしません。'}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {my.lrig_upkeep_condition === 'discard_or_colorless1' && (
                <button onClick={() => handleUpkeepPay('discard')} disabled={my.hand.length < 1}
                  style={{ padding: '10px 0', borderRadius: 8,
                    border: 'none', backgroundColor: C.accent, opacity: my.hand.length < 1 ? 0.4 : 1,
                    color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                  手札を1枚捨ててアップ
                </button>
              )}
              <button onClick={() => handleUpkeepPay('energy')}
                disabled={my.energy.length < (my.lrig_upkeep_condition === 'pay_colorless3' ? 3 : 1)}
                style={{ padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  opacity: my.energy.length < (my.lrig_upkeep_condition === 'pay_colorless3' ? 3 : 1) ? 0.4 : 1,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                《無》×{my.lrig_upkeep_condition === 'pay_colorless3' ? 3 : 1}を支払ってアップ
              </button>
              <button onClick={handleUpkeepDecline}
                style={{ padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                支払わずダウンのままにする
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* シグニアタックスキップ確認 */}
      {showSigniAttackSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              まだ攻撃していないシグニがいます
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              このままルリグアタックステップへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowSigniAttackSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowSigniAttackSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* 強制攻撃: 対象シグニがアタックするまで進めない警告 */}
      {showMustAttackWarning && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: '2px solid #c0392b', borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 360px)', textAlign: 'center',
          }}>
            <p style={{ color: '#ff6b6b', fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              ⚠ アタックしなければなりません
            </p>
            <p style={{ color: C.textDim, fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
              {my.must_attack_infected_only
                ? '感染状態のシグニは可能ならばアタックしなければなりません。'
                : 'あなたのシグニは可能ならばアタックしなければなりません。'}
              <br />
              対象のシグニがすべてアタック（ダウン）するまで次のフェイズへ進めません。
            </p>
            <button onClick={() => setShowMustAttackWarning(false)}
              style={{ width: '100%', padding: '10px 0', borderRadius: 8,
                border: 'none', backgroundColor: '#c0392b',
                color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* リムーブ封じ警告（SELF_SIGNI_TRASH。WX04-046-E1等） */}
      {showRemoveBlockedWarn && createPortal(
        <div onClick={() => setShowRemoveBlockedWarn(false)} style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            backgroundColor: C.bgModal, border: '2px solid #c0392b', borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 360px)', textAlign: 'center',
          }}>
            <p style={{ color: '#ff6b6b', fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              ⚠ リムーブできません
            </p>
            <p style={{ color: C.textDim, fontSize: 13, margin: '0 0 20px', lineHeight: 1.6 }}>
              対戦相手の効果により、自分でシグニを場からトラッシュに置くこと（リムーブ）がブロックされています。
            </p>
            <button onClick={() => setShowRemoveBlockedWarn(false)}
              style={{ width: '100%', padding: '10px 0', borderRadius: 8,
                border: 'none', backgroundColor: '#c0392b',
                color: '#fff', fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
              OK
            </button>
          </div>
        </div>,
        document.body,
      )}

      {/* ルリグアタックスキップ確認 */}
      {showLrigAttackSkipConfirm && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4000,
          backgroundColor: 'rgba(0,0,0,0.85)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)', textAlign: 'center',
          }}>
            <p style={{ color: C.accent, fontSize: 15, fontWeight: 'bold', margin: '0 0 6px' }}>
              まだルリグが攻撃していません
            </p>
            <p style={{ color: C.textDimmer, fontSize: 12, margin: '0 0 20px' }}>
              このままエンドフェイズへ進みますか？
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowLrigAttackSkipConfirm(false)}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: C.borderUI, backgroundColor: 'transparent',
                  color: C.textDim, fontSize: 14, cursor: 'pointer' }}>
                戻る
              </button>
              <button onClick={() => { setShowLrigAttackSkipConfirm(false); doPhaseAdvance(); }}
                style={{ flex: 1, padding: '10px 0', borderRadius: 8,
                  border: 'none', backgroundColor: C.accent,
                  color: C.text, fontSize: 14, fontWeight: 'bold', cursor: 'pointer' }}>
                このまま進む
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
