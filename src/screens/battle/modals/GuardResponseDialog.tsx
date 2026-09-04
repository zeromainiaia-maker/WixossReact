// ガード応答ダイアログ（自分が攻撃されたとき・バースト処理中は非表示）。BattleScreen.tsx から Stage 1 で抽出。
import { createPortal } from 'react-dom';
import type { PlayerState } from '../../../types';
import { LRIG_BARRIER_CARD, countBarrierTokens } from '../../../engine/execUtils';
import { collectOppGuardExtraColorlessCost, collectOppExtraGuardFromHand, collectGuardAlternativeCost, type ContinuousBlockResult } from '../../../engine/effectEngine';
import { C } from '../../../components/BoardComponents';
import { canCardGuard, makeGuardLevelBlocker } from '../guard';
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
  /** 🆕§5.3 `O-230`＝《無》×N を払ってコラボライバー M 人とコラボする代替ガード。 */
  handleGuardWithCollabAlternative: (colorless: number, collab: number) => void;
}

export function GuardResponseDialog(p: GuardResponseDialogProps) {
  const { bs, user, my, op, isMyTurn, loading, battleCardMap, effectsMap } = p.ctx;
  const { contBlocked, myHandGuardClasses, isHost, performGuardResponse, handleGuardResponse, handleGuardWithEnergyAlternative, handleGuardWithHandAlternative, handleGuardWithCollabAlternative } = p;
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
              // §6.4 O-41: レベル限定つきガード禁止（`GUARD_MAX_LV<n>` ＝n以下／`GUARD_LV<n>[_<m>…]` ＝ちょうど・列挙）。
              // ⚠**判定は純関数へ切り出してある**（`makeGuardLevelBlocker`）＝§5-20 の定石。JSX の中に置くと
              //   golden から両方向（掛かる／掛からない）を検証できず、限定の脱落＝過剰実行が計器に映らない。
              const guardBlockedByLevel = makeGuardLevelBlocker([...(my.blocked_actions ?? []), ...contBlocked.forSelf]);
              const declaredRestrictLv = op.declared_guard_restrict_level;
              const declaredRestrictLvs = op.declared_guard_restrict_levels ?? [];
              const handGuardEnabled = my.hand_signi_guard_enabled;
              // 相手のprevent_opp_guardフラグ（PREVENT_OPP_GUARD_THIS_TURN等）でガード禁止。
              // 🔴**CONTINUOUS の `BLOCK_ACTION{GUARD}` もここで見る**（2026-08-19 続き567・§3 (cxxxv)）＝
              //   従来この dialog は `GUARD_MAX_LV<n>`（レベル上限）しか読まず、**素の `GUARD`（＝丸ごとガード不可）**
              //   には消費地点が無かった＝`WD14-001`（トラッシュに＜悪魔＞18枚）／`WXEX2-11`（ドライブ状態）が恒久 no-op。
              //   ⚠`contBlocked.forSelf` はルリグ本体の相手向け常在も含む（engine 側を同時に修正した）。
              const guardBlockedOutright = (my.blocked_actions ?? []).includes('GUARD') || contBlocked.forSelf.has('GUARD');
              const guardDisabledByOpp = op.prevent_opp_guard === true || guardBlockedOutright;
              // 相手フィールドのOPP_GUARD_COST_COLORLESS: 追加で無色エナ1枚必要
              const oppGuardExtraColorless = collectOppGuardExtraColorlessCost(op, my, battleCardMap, effectsMap, !isMyTurn);
              // 相手フィールドのEXTRA_GUARD_COST_FROM_HAND: 追加でガードカードを手札から捨てる必要
              const oppExtraGuardFromHand = collectOppExtraGuardFromHand(op, battleCardMap, effectsMap);
              // game_opp_extra_guard_hand_or_colorless: 相手が能力付与→追加で手札1枚か《無》必要
              const oppExtraHandOrColorless = (op.game_opp_extra_guard_hand_or_colorless ?? 0) > 0;
              // game_guard_alt_hand: 自分が能力付与→ガードアイコン代わりに手札N枚捨てでガード可
              const myGuardAltHand = Math.max(my.game_guard_alt_hand ?? 0, my.guard_alt_hand_until_opp_turn ?? 0);
              const guardCardCountInHand = my.hand.filter(cn => canCardGuard(cn, my, battleCardMap, effectsMap)).length;
              // エナゾーンが空の場合はガード不可
              const guardBlockedByExtraCost = my.energy.length < oppGuardExtraColorless;
              // 追加ガードカードが1枚しかない場合はガード不可（ガード用1枚＋追加コスト用1枚=2枚必要）
              const guardBlockedByExtraGuard = oppExtraGuardFromHand && guardCardCountInHand < 2;
              // GUARD_ALTERNATIVE_COST: エナゾーンから指定クラスシグニをトラッシュしてガード可能
              const guardAltCost = !guardDisabledByOpp ? collectGuardAlternativeCost(my, battleCardMap, effectsMap) : null;
              // 🆕§5.3 `O-230`＝代替コストは2種類（エナのクラス指定トラッシュ／《無》＋コラボ）。
              const guardAltEnergyClass = guardAltCost?.spec.kind === 'energy_trash_class' ? guardAltCost.spec.signiClass : null;
              const guardAltEnergySigni = guardAltEnergyClass ? my.energy.filter(cn => {
                const c = battleCardMap.get(cn);
                return c?.Type === 'シグニ' && (c.CardClass ?? '').includes(guardAltEnergyClass);
              }) : [];
              // 🆕「《無》をN枚支払いコラボライバーM人とコラボしてもよい」＝エナがN枚あれば提示する。
              //   ⚠**コラボの実行部（`INTERNAL_DO_COLLAB`）は既にある**＝ここは提示と支払いだけ。
              const guardAltCollab = guardAltCost?.spec.kind === 'colorless_and_collab' ? guardAltCost.spec : null;
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
                  const guardLevel = parseInt(card?.Level ?? '-1');
                  if (guardBlockedByLevel(guardLevel)) return false;
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
                  {oppGuardExtraColorless > 0 && (
                    <p style={{ color: '#f0a030', fontSize: 12, margin: '0 0 6px',
                      padding: '6px 10px', background: 'rgba(240,160,48,0.1)', borderRadius: 6,
                      border: '1px solid rgba(240,160,48,0.3)' }}>
                      ⚠ 追加で《無》×{oppGuardExtraColorless}（エナ{oppGuardExtraColorless}枚）を支払わないとガードできません
                      {guardBlockedByExtraCost && `（エナ${my.energy.length}枚では不足）`}
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
                  {guardAltCollab && my.energy.length >= guardAltCollab.colorless && (
                    <button onClick={() => handleGuardWithCollabAlternative(guardAltCollab.colorless, guardAltCollab.collab)} disabled={loading}
                      data-testid="guard-alt-collab"
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #d08bd0',
                        backgroundColor: 'rgba(208,139,208,0.15)', color: '#d08bd0', cursor: 'pointer',
                        fontSize: 13, marginBottom: 8 }}>
                      代替ガード：《無》×{guardAltCollab.colorless}を支払いコラボライバー{guardAltCollab.collab}人とコラボ
                    </button>
                  )}
                  {guardAltEnergyClass && guardAltEnergySigni.length > 0 && (
                    <button onClick={handleGuardWithEnergyAlternative} disabled={loading}
                      style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid #4caf50',
                        backgroundColor: 'rgba(76,175,80,0.15)', color: '#4caf50', cursor: 'pointer',
                        fontSize: 13, marginBottom: 8 }}>
                      代替ガード：エナ＜{guardAltEnergyClass}＞1枚をトラッシュ
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
                        // V-84（§5.1）＝レベル限定つき【ガード】禁止は「候補から消えたか」でしか観測できない。
                        // ⚠カード名テキストで照合すると全角文字・同名別レベルで壊れる＝**インスタンスIDを属性で出す**。
                        <button key={i} onClick={() => handleGuardResponse(i)}
                          disabled={loading}
                          data-testid={`guard-card-${i}`}
                          data-card-num={num}
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
