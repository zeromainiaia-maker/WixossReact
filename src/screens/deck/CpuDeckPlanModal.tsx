import { useMemo, useState } from 'react';
import type { CardData, Deck } from '../../types';
import {
  CPU_CARD_USE_LABELS,
  CPU_COMBO_USE_LABELS, CPU_TARGET_MODES, CPU_TARGET_MODE_LABELS,
  CPU_TARGET_WHENS, CPU_TARGET_WHEN_LABELS,
  EMPTY_CPU_DECK_PLAN, EMPTY_CPU_TARGET_PLAN, pruneCpuDeckPlan,
  type CpuCardUse, type CpuComboStep, type CpuComboUse, type CpuDeckPlan,
  type CpuTargetMode, type CpuTargetWhen,
} from '../battle/cpuDeckPlan';
import {
  cpuPlanCanSetUse, cpuPlanChipsFor, cpuPlanClampOption, cpuPlanComboUsesFor, cpuPlanEffectOptions, cpuPlanIsArts,
  cpuPlanUseModesFor, type CpuPlanEffectOption,
} from './cpuPlanOptions';
import { getAbilityBlockTexts } from '../../data/effectParser';

/** 効果ごとの原文（能力ブロック）。引けなければ `undefined`＝種類だけの表示になる。 */
const abilityTextOf = (card: CardData, effectId: string): string | undefined => {
  try { return getAbilityBlockTexts(card).get(effectId); } catch { return undefined; }
};

/**
 * 🆕**CPU の作戦**の編集（§5.7 `S-2`・CPU デッキだけ）＝キーカード・優先して出す札・コンボ・対象の狙い方・使いどころ。
 * 保存はデッキの更新（`onChange`）と同じ経路＝`decks.cpu_plan`。デッキに無いカードは保存時に外す（`pruneCpuDeckPlan`）。
 *
 * 🆕🔴**2026-09-25（ユーザー指摘）で②④を作り直した。**
 *   - **② 効果の対象**＝「既定の狙い方」「属性で狙う／避ける」「相手の札を名指し」を**削った**
 *     （既定は規則「どの効果でも・いつでも」と同じ意味の二重の入口／相手の山は分からない）。
 *     残したのは**狙い方の切り替え規則**だけ＝🆕**効果単位（E1/E2/ライフバースト）で指定できる**。
 *   - **④ コンボ**＝🔴**旧は1手足すとすぐ［コンボに追加］が出て、押すと1手のコンボとして確定した**
 *     （実測＝ユーザーの `ケトッシー軸` に**1手だけのコンボが4件**）＝複数カードのコンボが作れなかった。
 *     ⇒ **新しいコンボは2手以上で保存**／**保存済みのコンボにも手を足せる・並べ替えられる**。
 *     🆕**手ごとに「どの効果か」と「その効果が選ぶ先」（狙い方・優先して選ぶ札）**を決められる。
 *
 * ■ レイアウト（スマホ縦＝390px）
 *   - 🔴**すべての操作行を `flexWrap` にする**（固定幅を並べるとモーダルの外へはみ出す＝2026-09-22 実測）。
 *   - 🔴**本文を1つのスクロール領域にする**（節が増えても下の節が画面外へ押し出されない）。
 *
 * ■ 🔴**効かない操作を出さない**（判定は `cpuPlanOptions.ts` の純関数＝golden が全カードに当てている）
 */
export function CpuDeckPlanModal({ deck, cardMap, onChange, onClose }: {
  deck: Deck;
  cardMap: Map<string, CardData>;
  onChange: (plan: CpuDeckPlan) => void;
  onClose: () => void;
}) {
  const deckNums = [...new Set([...deck.lrigDeck, ...deck.mainDeck])];
  const plan = pruneCpuDeckPlan(deck.cpuPlan ?? EMPTY_CPU_DECK_PLAN, deckNums);
  const mainNums = useMemo(() => new Set(deck.mainDeck), [deck.mainDeck]);
  const cards = deckNums.map(n => cardMap.get(n)).filter((c): c is CardData => !!c);
  const nameOf = (n: string) => cardMap.get(n)?.CardName ?? n;

  const save = (next: CpuDeckPlan) => onChange(pruneCpuDeckPlan(next, deckNums));

  const isArts = (n: string) => cpuPlanIsArts(cardMap.get(n));
  const chipsFor = (n: string) => cpuPlanChipsFor(cardMap.get(n), mainNums.has(n));

  /** 効果の選択肢（カードごとに1度だけ作る＝原文の切り出しはカード単位でキャッシュされる）。 */
  const effectOptionsOf = useMemo(() => {
    const memo = new Map<string, CpuPlanEffectOption[]>();
    return (n: string, purpose: 'pick' | 'activate'): CpuPlanEffectOption[] => {
      const key = `${n}/${purpose}`;
      if (!memo.has(key)) memo.set(key, cpuPlanEffectOptions(cardMap.get(n), purpose, abilityTextOf));
      return memo.get(key)!;
    };
  }, [cardMap]);
  const effectLabel = (n: string, eid: string) =>
    effectOptionsOf(n, 'pick').find(o => o.effectId === eid)?.label ?? eid;

  // ── ② 効果の対象（狙い方の切り替え規則）──────────────────────
  const targeting = plan.targeting ?? EMPTY_CPU_TARGET_PLAN;
  const saveTargeting = (next: Partial<typeof targeting>) => save({ ...plan, targeting: { ...targeting, ...next } });
  const rules = targeting.rules ?? [];
  /** 効果の選択＝`<カード番号>|<effectId>`（effectId 空＝その札のどの効果でも／全体空＝どの効果でも）。 */
  const [ruleSource, setRuleSource] = useState('');
  const [ruleWhen, setRuleWhen] = useState<CpuTargetWhen>('always');
  const [ruleMode, setRuleMode] = useState<CpuTargetMode>('killable');
  /** 規則の効果に出す札＝**選ぶ効果を持つ札だけ**（【常】だけの札は対象を選ばない）。 */
  const ruleCards = cards.filter(c => effectOptionsOf(c.CardNum, 'pick').length > 0);
  const addRule = () => {
    const [num, eid] = ruleSource ? ruleSource.split('|') : ['', ''];
    saveTargeting({
      rules: [...rules, {
        sourceCards: num ? [num] : [], ...(eid ? { sourceEffectIds: [eid] } : {}), when: ruleWhen, mode: ruleMode,
      }],
    });
    setRuleSource('');
  };
  const ruleSourceLabel = (r: typeof rules[number]) => {
    if (r.sourceCards.length === 0) return 'どの効果でも';
    const n = r.sourceCards[0];
    const eid = r.sourceEffectIds?.[0];
    return eid ? `${nameOf(n)}の ${effectLabel(n, eid)}` : `${nameOf(n)}の効果`;
  };
  const toggleTarget = (key: 'prefer' | 'avoid', num: string) => {
    const list = targeting[key];
    // ⚠**狙う／狙わないは排他**（両方に入っていると足し引きが打ち消し合って「指定したのに効かない」になる）。
    const other = key === 'prefer' ? 'avoid' : 'prefer';
    saveTargeting({
      [key]: list.includes(num) ? list.filter(n => n !== num) : [...list, num],
      [other]: targeting[other].filter(n => n !== num),
    });
  };

  // ── ③ 使いどころ ────────────────────────────────────────
  const cardUse = plan.cardUse ?? {};
  const useOptionsFor = (n: string): readonly CpuCardUse[] => cpuPlanUseModesFor(n ? cardMap.get(n) : undefined);
  const useCards = [...cards].filter(c => cpuPlanCanSetUse(c))
    .sort((a, b) => Number(isArts(b.CardNum)) - Number(isArts(a.CardNum)));
  const [useNum, setUseNum] = useState('');
  const [useMode, setUseMode] = useState<CpuCardUse>('defense');
  const useOptions = useOptionsFor(useNum);
  // 🔴**選択肢に無い値を `select` の value にしない**（表示と保存が食い違う＝2026-09-22 に直した実バグ）。
  const effectiveUseMode = cpuPlanClampOption(useMode, useOptions, 'never');
  const addCardUse = () => {
    if (!useNum) return;
    save({ ...plan, cardUse: { ...cardUse, [useNum]: effectiveUseMode } });
    setUseNum('');
  };
  const removeCardUse = (n: string) => {
    const next = { ...cardUse };
    delete next[n];
    save({ ...plan, cardUse: next });
  };
  const toggle = (key: 'keyCards' | 'priorityCards', n: string) => {
    const list = plan[key];
    save({ ...plan, [key]: list.includes(n) ? list.filter(x => x !== n) : [...list, n] });
  };

  // ── ④ コンボ ────────────────────────────────────────────
  /** 手を足す先＝`'new'`（組み立て中の新しいコンボ）か、保存済みコンボの添字。 */
  const [editing, setEditing] = useState<number | 'new'>('new');
  const [draft, setDraft] = useState<CpuComboStep[]>([]);
  const [num, setNum] = useState('');
  const [use, setUse] = useState<CpuComboUse>('deploy');
  const [stepEffect, setStepEffect] = useState('');
  const [pickMode, setPickMode] = useState<CpuTargetMode | ''>('');
  const [pickCards, setPickCards] = useState<string[]>([]);
  const comboCards = cards.filter(c => cpuPlanComboUsesFor(c).length > 0);
  const comboUses = cpuPlanComboUsesFor(num ? cardMap.get(num) : undefined);
  const effectiveComboUse = cpuPlanClampOption(use, comboUses, 'deploy');
  /** その手で選べる効果＝「【起】で使う」は【起】だけ／ほかは選ぶ先を持ちうる効果。 */
  const stepEffects = num ? effectOptionsOf(num, effectiveComboUse === 'activate' ? 'activate' : 'pick') : [];
  const effectiveStepEffect = stepEffects.some(o => o.effectId === stepEffect) ? stepEffect : '';
  const resetStepForm = () => { setNum(''); setStepEffect(''); setPickMode(''); setPickCards([]); };

  const stepsOf = (t: number | 'new'): CpuComboStep[] => (t === 'new' ? draft : plan.combos[t]?.steps ?? []);
  const setStepsOf = (t: number | 'new', steps: CpuComboStep[]) => {
    if (t === 'new') { setDraft(steps); return; }
    // ⚠**手が0になったコンボは消す**（空のコンボは正規化で落ちる＝残すと表示と保存が食い違う）。
    const combos = steps.length === 0
      ? plan.combos.filter((_, i) => i !== t)
      : plan.combos.map((c, i) => (i === t ? { steps } : c));
    save({ ...plan, combos });
    if (steps.length === 0) setEditing('new');
  };
  const addStep = () => {
    if (!num) return;
    const step: CpuComboStep = {
      num, use: effectiveComboUse,
      ...(effectiveStepEffect ? { effectId: effectiveStepEffect } : {}),
      ...(pickMode || pickCards.length
        ? { pick: { ...(pickMode ? { mode: pickMode } : {}), ...(pickCards.length ? { cards: pickCards } : {}) } }
        : {}),
    };
    const cur = stepsOf(editing);
    // ⚠同じ「札×使い方×効果」は足さない（正規化で落ちる＝足したのに消える、を作らない）。
    if (cur.some(st => st.num === step.num && st.use === step.use && (st.effectId ?? '') === (step.effectId ?? ''))) return;
    setStepsOf(editing, [...cur, step]);
    resetStepForm();
  };
  const moveStep = (t: number | 'new', i: number, dir: -1 | 1) => {
    const cur = [...stepsOf(t)];
    const j = i + dir;
    if (j < 0 || j >= cur.length) return;
    [cur[i], cur[j]] = [cur[j], cur[i]];
    setStepsOf(t, cur);
  };
  const removeStep = (t: number | 'new', i: number) => setStepsOf(t, stepsOf(t).filter((_, k) => k !== i));
  /** 🔴**新しいコンボは2手以上でだけ保存できる**（1手のコンボは「優先して出す」と同じ意味にしかならない）。 */
  const saveDraft = () => {
    if (draft.length < 2) return;
    save({ ...plan, combos: [...plan.combos, { steps: draft }] });
    setDraft([]);
  };
  const stepLabel = (st: CpuComboStep) => {
    const eff = st.effectId ? `・${effectLabel(st.num, st.effectId).split('：')[0]}` : '';
    const pickParts = [
      st.pick?.mode ? CPU_TARGET_MODE_LABELS[st.pick.mode] : '',
      (st.pick?.cards ?? []).map(nameOf).join('・'),
    ].filter(Boolean);
    return `${nameOf(st.num)}（${CPU_COMBO_USE_LABELS[st.use]}${eff}）${pickParts.length ? ` → 選ぶ先: ${pickParts.join('／')}` : ''}`;
  };

  // ── 一覧の絞り込み（40枚超のデッキをスマホで探せるように）──
  const [listQuery, setListQuery] = useState('');
  const listCards = listQuery.trim()
    ? cards.filter(c => c.CardName?.includes(listQuery.trim()))
    : cards;

  const chip = (active: boolean, color: string): React.CSSProperties => ({
    border: 'none', borderRadius: 4, padding: '4px 7px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
    flex: '0 0 auto', backgroundColor: active ? color : '#2a2a40', color: active ? '#fff' : '#999',
  });
  const selectStyle: React.CSSProperties = {
    flex: '1 1 128px', minWidth: 0, padding: 6, borderRadius: 6,
    backgroundColor: '#0f0f1f', color: '#fff', border: '1px solid #444', fontSize: 12,
  };
  const inputStyle: React.CSSProperties = { ...selectStyle, flex: '1 1 140px' };
  const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' };
  const section: React.CSSProperties = {
    display: 'flex', flexDirection: 'column', gap: 8, padding: 10, borderRadius: 8,
    border: '1px solid #33334d', backgroundColor: 'rgba(255,255,255,0.03)',
  };
  const title = (color: string, label: string, hint: string) => (
    <div>
      <span style={{ color, fontSize: 12, fontWeight: 'bold' }}>{label}</span>
      <span style={{ color: '#888', fontSize: 10, marginLeft: 6 }}>{hint}</span>
    </div>
  );
  const listRow: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ddd', flexWrap: 'wrap' };
  const small = (color: string): React.CSSProperties => ({ ...chip(true, color), padding: '3px 6px', fontSize: 10 });

  /** 手の一覧（新規・保存済み共通）。 */
  const stepList = (t: number | 'new') => stepsOf(t).map((st, i) => (
    <div key={`${st.num}/${st.use}/${st.effectId ?? ''}/${i}`} style={{ ...listRow, paddingLeft: 4 }}>
      <span style={{ flex: '1 1 140px', minWidth: 0, color: '#cfe' }}>{i + 1}. {stepLabel(st)}</span>
      <button onClick={() => moveStep(t, i, -1)} disabled={i === 0} style={small('#335')}>↑</button>
      <button onClick={() => moveStep(t, i, 1)} disabled={i === stepsOf(t).length - 1} style={small('#335')}>↓</button>
      <button onClick={() => removeStep(t, i)} style={small('#522')}>×</button>
    </div>
  ));

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div data-testid="cpu-plan-modal" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, width: 'min(96vw, 560px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #444', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ color: '#fff', fontSize: 15, margin: 0 }}>🤖 CPU の作戦</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── ① 札の役割 ───────────────────────────────── */}
          <div style={section}>
            {title('#ffb84d', '札の役割', 'キー＝エナ・捨て札・マリガンで手放さない／優先＝先に場に出す／狙う・避ける＝効果の対象に選ぶ・選ばない（自分の札）')}
            <input value={listQuery} onChange={e => setListQuery(e.target.value)} placeholder="カード名で絞り込む" style={{ ...inputStyle, flex: '1 1 auto' }} />
            <div style={{ maxHeight: 264, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {listCards.map(c => (
                <div key={c.CardNum} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#ddd', fontSize: 12, flex: '1 1 84px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.CardName}<span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>{c.Type}{c.Level && c.Level !== '-' ? ` Lv${c.Level}` : ''}</span>
                  </span>
                  {chipsFor(c.CardNum).includes('key') && (
                    <button data-testid={`cpu-plan-key-${c.CardNum}`} onClick={() => toggle('keyCards', c.CardNum)} style={chip(plan.keyCards.includes(c.CardNum), '#c77a00')}>キー</button>
                  )}
                  {chipsFor(c.CardNum).includes('priority') && (
                    <button data-testid={`cpu-plan-priority-${c.CardNum}`} onClick={() => toggle('priorityCards', c.CardNum)} style={chip(plan.priorityCards.includes(c.CardNum), '#1f6fcc')}>優先</button>
                  )}
                  <button data-testid={`cpu-plan-prefer-${c.CardNum}`} onClick={() => toggleTarget('prefer', c.CardNum)} style={chip(targeting.prefer.includes(c.CardNum), '#b83a3a')}>狙う</button>
                  <button data-testid={`cpu-plan-avoid-${c.CardNum}`} onClick={() => toggleTarget('avoid', c.CardNum)} style={chip(targeting.avoid.includes(c.CardNum), '#555')}>避ける</button>
                </div>
              ))}
              {listCards.length === 0 && <span style={{ color: '#666', fontSize: 11 }}>該当なし</span>}
            </div>
          </div>

          {/* ── ② 効果の狙い方 ───────────────────────────── */}
          <div style={section}>
            {title('#ff8a8a', '効果の狙い方', '上から順に最初に当たった1つ。どれにも当たらなければ「パワー・効果が強いもの」。ライフバーストも効果ごとに選べる')}
            <div style={row}>
              <select data-testid="cpu-plan-rule-card" value={ruleSource} onChange={e => setRuleSource(e.target.value)}
                style={{ ...selectStyle, fontSize: 11, flex: '1 1 100%' }}>
                <option value="">どの効果でも</option>
                {ruleCards.map(c => (
                  <optgroup key={c.CardNum} label={c.CardName}>
                    <option value={`${c.CardNum}|`}>{c.CardName}のどの効果でも</option>
                    {effectOptionsOf(c.CardNum, 'pick').map(o => (
                      <option key={o.effectId} value={`${c.CardNum}|${o.effectId}`}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <select data-testid="cpu-plan-rule-when" value={ruleWhen} onChange={e => setRuleWhen(e.target.value as CpuTargetWhen)}
                style={{ ...selectStyle, fontSize: 11 }}>
                {CPU_TARGET_WHENS.map(w => <option key={w} value={w}>{CPU_TARGET_WHEN_LABELS[w]}</option>)}
              </select>
              <select data-testid="cpu-plan-rule-mode" value={ruleMode} onChange={e => setRuleMode(e.target.value as CpuTargetMode)}
                style={{ ...selectStyle, fontSize: 11 }}>
                {CPU_TARGET_MODES.map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS[m]}</option>)}
              </select>
              <button data-testid="cpu-plan-rule-add" onClick={addRule}
                style={{ ...chip(true, '#2e8b2e'), padding: '7px 12px' }}>追加</button>
            </div>
            {rules.map((r, i) => (
              <div key={`${r.sourceCards.join(',')}/${r.sourceEffectIds?.join(',') ?? ''}/${r.when}/${r.mode}/${i}`} style={listRow}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>
                  {ruleSourceLabel(r)}・{CPU_TARGET_WHEN_LABELS[r.when]} → {CPU_TARGET_MODE_LABELS[r.mode]}
                </span>
                <button onClick={() => saveTargeting({ rules: rules.filter((_, k) => k !== i) })} style={chip(false, '#000')}>削除</button>
              </div>
            ))}
          </div>

          {/* ── ③ 使いどころ ─────────────────────────────── */}
          <div style={section}>
            {title('#d08aff', '使いどころ', '守り／攻めが選べるのはアーツだけ。ほかは「使わない」だけが効く')}
            <div style={row}>
              <select data-testid="cpu-plan-use-card" value={useNum} onChange={e => setUseNum(e.target.value)} style={selectStyle}>
                <option value="">カードを選ぶ</option>
                {useCards.map(c => (
                  <option key={c.CardNum} value={c.CardNum}>{c.CardName}{isArts(c.CardNum) ? '（アーツ）' : ''}</option>
                ))}
              </select>
              <select data-testid="cpu-plan-use-mode" value={effectiveUseMode} onChange={e => setUseMode(e.target.value as CpuCardUse)}
                style={selectStyle}>
                {useOptions.map(u => <option key={u} value={u}>{CPU_CARD_USE_LABELS[u]}</option>)}
              </select>
              <button data-testid="cpu-plan-use-add" onClick={addCardUse} disabled={!useNum}
                style={{ ...chip(!!useNum, '#7a3ab8'), padding: '7px 12px' }}>追加</button>
            </div>
            {Object.entries(cardUse).map(([n, u]) => (
              <div key={n} data-testid={`cpu-plan-use-row-${n}`} style={listRow}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>{nameOf(n)} → {CPU_CARD_USE_LABELS[u]}</span>
                <button onClick={() => removeCardUse(n)} style={chip(false, '#000')}>削除</button>
              </div>
            ))}
          </div>

          {/* ── ④ コンボ ─────────────────────────────────── */}
          <div style={section}>
            {title('#7ddc7d', 'コンボ（順番に打つ手）', '前の手が済むまで後の手は温存し、順番どおりに打つ。手ごとに効果とその効果が選ぶ先も決められる')}

            {/* 保存済みのコンボ（［手を足す］で下の入力欄の足し先になる） */}
            {plan.combos.map((c, ci) => (
              <div key={`${ci}/${c.steps.map(st => `${st.num}/${st.use}/${st.effectId ?? ''}`).join('>')}`}
                style={{ border: `1px solid ${editing === ci ? '#7ddc7d' : '#33334d'}`, borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={listRow}>
                  <span style={{ flex: '1 1 84px', color: '#7ddc7d', fontWeight: 'bold' }}>コンボ{ci + 1}</span>
                  <button data-testid={`cpu-plan-combo-edit-${ci}`} onClick={() => setEditing(editing === ci ? 'new' : ci)}
                    style={chip(editing === ci, '#2e6fb8')}>{editing === ci ? '手を足し中' : '手を足す'}</button>
                  <button onClick={() => { save({ ...plan, combos: plan.combos.filter((_, i) => i !== ci) }); setEditing('new'); }}
                    style={chip(false, '#000')}>削除</button>
                </div>
                {stepList(ci)}
                {c.steps.length < 2 && (
                  <span style={{ color: '#e0a040', fontSize: 10 }}>⚠1手だけのコンボは「優先して出す」と同じ意味にしかならない＝［手を足す］で2手目以降を足す</span>
                )}
              </div>
            ))}

            {/* 新しいコンボ（2手以上で保存） */}
            <div style={{ border: `1px dashed ${editing === 'new' ? '#7ddc7d' : '#33334d'}`, borderRadius: 6, padding: 6, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={listRow}>
                <span style={{ flex: '1 1 84px', color: '#7ddc7d', fontWeight: 'bold' }}>新しいコンボ</span>
                {editing !== 'new' && <button onClick={() => setEditing('new')} style={chip(false, '#2e6fb8')}>こちらに手を足す</button>}
              </div>
              {draft.length > 0 && <span data-testid="cpu-plan-combo-draft" style={{ display: 'none' }}>{draft.map(stepLabel).join(' → ')}</span>}
              {stepList('new')}
              <div style={row}>
                <button data-testid="cpu-plan-combo-add" onClick={saveDraft} disabled={draft.length < 2}
                  style={{ ...chip(draft.length >= 2, '#2e8b2e'), padding: '7px 12px' }}>
                  {draft.length < 2 ? `コンボを保存（あと${2 - draft.length}手）` : 'コンボを保存'}
                </button>
                {draft.length > 0 && <button onClick={() => setDraft([])} style={chip(false, '#000')}>取消</button>}
              </div>
            </div>

            {/* 手の入力欄（足し先＝緑枠のコンボ） */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 6, borderRadius: 6, backgroundColor: 'rgba(125,220,125,0.06)' }}>
              <span style={{ color: '#bbb', fontSize: 11 }}>
                手を足す先：{editing === 'new' ? '新しいコンボ' : `コンボ${editing + 1}`}
              </span>
              <div style={row}>
                <select data-testid="cpu-plan-combo-card" value={num} onChange={e => { setNum(e.target.value); setStepEffect(''); }} style={selectStyle}>
                  <option value="">カードを選ぶ</option>
                  {comboCards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
                </select>
                <select data-testid="cpu-plan-combo-use" value={effectiveComboUse} onChange={e => setUse(e.target.value as CpuComboUse)}
                  style={selectStyle}>
                  {comboUses.map(u => <option key={u} value={u}>{CPU_COMBO_USE_LABELS[u]}</option>)}
                </select>
              </div>
              {stepEffects.length > 0 && (
                <div style={row}>
                  <span style={{ color: '#bbb', fontSize: 11, flex: '0 0 auto' }}>効果</span>
                  <select data-testid="cpu-plan-combo-effect" value={effectiveStepEffect} onChange={e => setStepEffect(e.target.value)}
                    style={{ ...selectStyle, fontSize: 11 }}>
                    <option value="">{stepEffects.length > 1 ? 'どの効果でも' : '（効果は1つ）'}</option>
                    {stepEffects.map(o => <option key={o.effectId} value={o.effectId}>{o.label}</option>)}
                  </select>
                </div>
              )}
              {num && (
                <div style={row}>
                  <span style={{ color: '#bbb', fontSize: 11, flex: '0 0 auto' }}>選ぶ先</span>
                  <select data-testid="cpu-plan-combo-pick-mode" value={pickMode} onChange={e => setPickMode(e.target.value as CpuTargetMode | '')}
                    style={{ ...selectStyle, fontSize: 11 }}>
                    <option value="">狙い方はいつもどおり</option>
                    {CPU_TARGET_MODES.map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS[m]}</option>)}
                  </select>
                  <select data-testid="cpu-plan-combo-pick-card" value=""
                    onChange={e => { const v = e.target.value; if (v && !pickCards.includes(v)) setPickCards([...pickCards, v]); }}
                    style={{ ...selectStyle, fontSize: 11 }}>
                    <option value="">優先して選ぶ札を足す</option>
                    {cards.filter(c => !pickCards.includes(c.CardNum)).map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
                  </select>
                </div>
              )}
              {pickCards.length > 0 && (
                <div style={row}>
                  {pickCards.map(n => (
                    <button key={n} onClick={() => setPickCards(pickCards.filter(x => x !== n))} style={small('#445')}>{nameOf(n)} ×</button>
                  ))}
                </div>
              )}
              <div style={row}>
                <button data-testid="cpu-plan-combo-step-add" onClick={addStep} disabled={!num}
                  style={{ ...chip(!!num, '#2e6fb8'), padding: '7px 12px' }}>手を足す</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
