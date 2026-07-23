// ガード応答ダイアログ（自分が攻撃されたとき・バースト処理中は非表示）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { PlayerState } from '../../../types';
import { LRIG_BARRIER_CARD, countBarrierTokens } from '../../../engine/execUtils';
import { collectOppGuardExtraColorlessCost, collectOppExtraGuardFromHand, collectGuardAlternativeCost, type ContinuousBlockResult } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { canCardGuard } from '../guard';
import type { BattleModalCtx } from './types';

interface GuardResponseDialogProps {
  ctx: BattleModalCtx;
  contBlocked: ContinuousBlockResult;
  myHandGuardClasses: string[];
  isHost: boolean;
  performGuardResponse: (handIndex: number | null, p: {
    responder: PlayerState; attacker: PlayerState;
    responderId: string; attackerId: string;
    responderKey: 'host_state' | 'guest_state';
  }) => void;
  handleGuardResponse: (handIndex: number | null) => void;
  handleGuardWithEnergyAlternative: () => void;
  handleGuardWithHandAlternative: () => void;
}

export function GuardResponseDialog(p: GuardResponseDialogProps) {
  const { bs, user, my, op, isMyTurn, loading, battleCardMap, effectsMap } = p.ctx;
  const { contBlocked, myHandGuardClasses, isHost, performGuardResponse, handleGuardResponse, handleGuardWithEnergyAlternative, handleGuardWithHandAlternative } = p;
  return (
    <>
      {my.field.lrig_attacked && !my.field.check && createPortal(
        <div style={{
          position: 'fixed', inset: 0, zIndex: 4500,
          backgroundColor: 'rgba(0,0,0,0.92)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: 20,
        }}>
          <div style={{
            backgroundColor: C.bgModal, border: C.borderUI, borderRadius: 12,
            padding: '24px 20px', width: 'min(88vw, 340px)',
            display: 'flex', flexDirection: 'column', gap: 14, textAlign: 'center',
          }}>
            <p style={{ color: C.danger, fontSize: 15, fontWeight: 'bold', margin: 0 }}>
              ルリグに攻撃された！
            </p>
            <p style={{ color: C.textDim, fontSize: 12, margin: 0 }}>
              手札の「ガード」を持つカードをトラッシュに送り攻撃を防ぐか、ライフクロスをクラッシュします
            </p>
            {(() => {
              const guardBlockedMax = [...(my.blocked_actions ?? []), ...contBlocked.forSelf]
                .reduce((max, a) => {
                  const m = a.match(/^GUARD_MAX_LV(\d+)/);
                  return m ? Math.max(max, parseInt(m[1])) : max;
                }, -1);
              const declaredRestrictLv = op.declared_guard_restrict_level;
              const declaredRestrictLvs = op.declared_guard_restrict_levels ?? [];
              const handGuardEnabled = my.hand_signi_guard_enabled;
              // 相手のprevent_opp_guardフラグ（PREVENT_OPP_GUARD_THIS_TURN等）でガード禁止
              const guardDisabledByOpp = op.prevent_opp_guard === true;
              // 相手フィールドのOPP_GUARD_COST_COLORLESS: 追加で無色エナ1枚必要
              const oppGuardExtraColorless = collectOppGuardExtraColorlessCost(op, my, battleCardMap, effectsMap, !isMyTurn);
              // 相手フィールドのEXTRA_GUARD_COST_FROM_HAND: 追加でガードカードを手札から捨てる必要
              const oppExtraGuardFromHand = collectOppExtraGuardFromHand(op, battleCardMap, effectsMap);
              // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→追加で手札1枚か《無》必要
              const oppExtraHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
              // game_guard_alt_hand: 自分が能力付与→ガードアイコン代わりに手札N枚捨てでガード可
              const myGuardAltHand = my.game_guard_alt_hand ?? 0;
              const guardCardCountInHand = my.hand.filter(cn => canCardGuard(cn, my, battleCardMap, effectsMap)).length;
              // エナゾーンが空の場合はガード不可
              const guardBlockedByExtraCost = oppGuardExtraColorless && my.energy.length === 0;
              // 追加ガードカードが1枚しかない場合はガード不可（ガード用1枚＋追加コスト用1枚=2枚必要）
              const guardBlockedByExtraGuard = oppExtraGuardFromHand && guardCardCountInHand < 2;
              // GUARD_ALTERNATIVE_COST: エナゾーンから指定クラスシグニをトラッシュしてガード可能
              const guardAltCost = !guardDisabledByOpp ? collectGuardAlternativeCost(my, battleCardMap, effectsMap) : null;
              const guardAltEnergySigni = guardAltCost ? my.energy.filter(cn => {
                const c = battleCardMap.get(cn);
                return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(guardAltCost.signiClass);
              }) : [];
              const guardCards = (guardDisabledByOpp || guardBlockedByExtraCost || guardBlockedByExtraGuard) ? [] : my.hand
                .map((num, i) => ({ num, i, card: battleCardMap.get(num) }))
                .filter(({ num, card }) => {
                  // OPTIONAL_DISCARD_GUARD: 手札から任意カードを捨ててガード可能
                  if (my.optional_discard_guard_enabled) return true;
                  // hand_signi_guard_enabled: 手札のシグニはすべてガード可能
                  // myHandGuardClasses: 特定クラスの手札シグニがガード可能 (HAND_SIGNI_HAS_GUARD_ICON)
                  const classGuardable = myHandGuardClasses.length > 0 && card?.Type === 'シグニ' &&
                    myHandGuardClasses.some(cls => card?.CardClass?.includes(cls));
                  const isGuardable = canCardGuard(num, my, battleCardMap, effectsMap) || (handGuardEnabled && card?.Type === 'シグニ') || classGuardable;
                  if (!isGuardable) return false;
                  if (guardBlockedMax >= 0 && parseInt(card?.Level ?? '-1') <= guardBlockedMax) return false;
                  const guardLevel = parseInt(card?.Level ?? '-1');
                  if (declaredRestrictLv !== undefined && guardLevel === declaredRestrictLv) return false;
                  if (declaredRestrictLvs.includes(guardLevel)) return false;
                  return true;
                });
              return (
                <>
                  {countBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD) > 0 && (
                    <button
                      onClick={() => performGuardResponse(null, {
                        responder: my, attacker: op,
                        responderId: user.id,
                        attackerId: isHost ? bs.guest_id ?? '' : bs.host_id ?? '',
                        responderKey: isHost ? 'host_state' : 'guest_state',
                      })}
                      disabled={loading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #4db6e0',
                        backgroundColor: 'rgba(77,182,224,0.15)', color: '#4db6e0', cursor: 'pointer',
                        fontSize: 13, marginBottom: 4 }}>
                      ルリグバリア発動（残{countBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD)}→{countBarrierTokens(my.field.free_zone, LRIG_BARRIER_CARD) - 1}）攻撃無効
                    </button>
                  )}
                  {oppGuardExtraColorless && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加で《無》×1（エナ1枚）を支払わないとガードできません
                      {guardBlockedByExtraCost && '（エナゾーンが空のためガード不可）'}
                    </p>
                  )}
                  {oppExtraGuardFromHand && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加でガードアイコンカードを1枚手札から捨てないとガードできません
                      {guardBlockedByExtraGuard && `（ガードカード${guardCardCountInHand}枚では不足）`}
                    </p>
                  )}
                  {oppExtraHandOrColorless && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加で手札1枚か《無》×1を支払わないとガードできません（自動消費）
                    </p>
                  )}
                  {guardAltCost && guardAltEnergySigni.length > 0 && (
                    <button onClick={handleGuardWithEnergyAlternative} disabled={loading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #4caf50',
                        backgroundColor: 'rgba(76,175,80,0.15)', color: '#4caf50', cursor: 'pointer',
                        fontSize: 13, marginBottom: 8 }}>
                      代替ガード：エナ＜{guardAltCost.signiClass}＞1枚をトラッシュ
                    </button>
                  )}
                  {myGuardAltHand > 0 && my.hand.length >= myGuardAltHand && (
                    <button onClick={handleGuardWithHandAlternative} disabled={loading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #7cb9e8',
                        backgroundColor: 'rgba(124,185,232,0.15)', color: '#7cb9e8', cursor: 'pointer',
                        fontSize: 13, marginBottom: 8 }}>
                      代替ガード：手札{myGuardAltHand}枚を捨てる（ガードアイコン不要）
                    </button>
                  )}
                  {guardCards.length > 0 ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', maxHeight: '40vh' }}>
                      {guardCards.map(({ num, i, card }) => (
                        <button key={i} onClick={() => handleGuardResponse(i)}
                          disabled={loading}
                          style={{ display: 'flex', alignItems: 'center', gap: 10,
                            padding: '8px 12px', borderRadius: 8, border: C.borderUI,
                            backgroundColor: loading ? C.disabled : C.bgButton,
                            cursor: loading ? 'default' : 'pointer', textAlign: 'left' }}>
                          {card && (
                            <img src={card.ImgURL} alt={card.CardName}
                              style={{ width: 44, height: 62, objectFit: 'cover', borderRadius: 4, flexShrink: 0 }}
                              onError={e => { const img = e.target as HTMLImageElement; if (!img.src.endsWith('/ErrerCard.webp')) img.src = '/ErrerCard.webp'; }} />
                          )}
                          <div>
                            <p style={{ color: C.text, fontSize: 13, fontWeight: 'bold', margin: '0 0 2px' }}>
                              {card?.CardName ?? num}
                            </p>
                            <p style={{ color: C.accent, fontSize: 11, margin: 0 }}>
                              ガードに使う（トラッシュへ）{oppGuardExtraColorless ? '＋《無》×1消費' : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p style={{ color: C.textFaint, fontSize: 12, margin: 0 }}>
                      使用できるガードカードが手札にありません
                    </p>
                  )}
                </>
              );
            })()}
            <button onClick={() => handleGuardResponse(null)}
              disabled={loading}
              style={{ padding: '11px 0', borderRadius: 8, border: 'none',
                backgroundColor: loading ? C.disabled : C.danger,
                color: C.text, fontSize: 14, fontWeight: 'bold',
                cursor: loading ? 'default' : 'pointer' }}>
              ガードしない（ライフクロスクラッシュ）
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
