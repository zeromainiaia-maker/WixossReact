import { useMemo, useState } from 'react';
import type { CardData, Deck } from '../../types';
import {
  CPU_CARD_USE_LABELS, CPU_ENA_USES, CPU_ENA_USE_LABELS,
  CPU_COMBO_USE_LABELS, CPU_TARGET_MODES_BY_SIDE, CPU_TARGET_MODE_LABELS_BY_SIDE,
  CPU_COND_CMPS, CPU_COND_CMP_LABELS, CPU_COND_POWER_CMPS, CPU_COND_POWER_MAX, cpuCondUnit, type CpuCondPowerCmp, CPU_COND_COMBINES, CPU_COND_COMBINE_LABELS, CPU_COND_SIDES, CPU_COND_SIDE_LABELS,
  CPU_COND_ZONES, CPU_COND_ZONE_LABELS, cpuTargetCondLabel, cpuTargetCondsLabel,
  EMPTY_CPU_DECK_PLAN, EMPTY_CPU_TARGET_PLAN, pruneCpuDeckPlan,
  type CpuCardUse, type CpuComboStep, type CpuEnaUse, type CpuComboUse, type CpuDeckPlan,
  type CpuSideTarget, type CpuTargetMode, type CpuTargetSide, type CpuTargetCond, type CpuCondCombine,
} from '../battle/cpuDeckPlan';

/** 片側の狙い方の入力値（`''`＝いつもどおり＝この側は指定しない）。 */
interface SideForm { mode: CpuTargetMode | ''; up: boolean }
const EMPTY_SIDE: SideForm = { mode: '', up: false };
/** 入力値 → 保存する形（何も指定していなければ `undefined`＝この側は規則に当たらない）。 */
const sideOf = (f: SideForm): CpuSideTarget | undefined =>
  (f.mode || f.up) ? { mode: f.mode || 'strongest', ...(f.up ? { upFirst: true } : {}) } : undefined;
const SIDE_NAMES: Record<CpuTargetSide, string> = { opp: '相手の札', self: '自分の札' };
/** 片側の狙い方の表示。 */
const sideText = (side: CpuTargetSide, t: CpuSideTarget | undefined) =>
  t ? `${SIDE_NAMES[side]}: ${CPU_TARGET_MODE_LABELS_BY_SIDE[side][t.mode]}${t.upFirst ? '（アップ状態を優先）' : ''}` : '';
import {
  cpuPlanCanSetUse, cpuPlanChipsFor, cpuPlanClampOption, cpuPlanComboUsesFor, cpuPlanEffectOptions, cpuPlanIsArts,
  cpuPlanUseModesFor, type CpuPlanEffectOption,
} from './cpuPlanOptions';
import { getAbilityBlockTexts } from '../../data/effectParser';
import {
  CPU_STATE_DEFS, CPU_STATE_GROUP_LABELS, CPU_STATE_PLACE_LABELS, cpuStateDef, statePlacesFor,
  type CpuStateGroup, type CpuStatePlace,
} from '../battle/cpuPlanStates';

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
  const effectOption = (n: string, eid: string) => effectOptionsOf(n, 'pick').find(o => o.effectId === eid);
  const effectLabel = (n: string, eid: string) => effectOption(n, eid)?.label ?? eid;
  /** 🆕`S-36`＝**効果の原文（全文）**（E1／E2／ライフバーストの記号だけでは元の効果が分からない）。 */
  const effectText = (n: string, eid: string) => effectOption(n, eid)?.text ?? '';

  // ── ② 効果の対象（狙い方の切り替え規則）──────────────────────
  const targeting = plan.targeting ?? EMPTY_CPU_TARGET_PLAN;
  const saveTargeting = (next: Partial<typeof targeting>) => save({ ...plan, targeting: { ...targeting, ...next } });
  const rules = targeting.rules ?? [];
  /** 効果の選択＝`<カード番号>|<effectId>`（effectId 空＝その札のどの効果でも／全体空＝どの効果でも）。 */
  const [ruleSource, setRuleSource] = useState('');
  // 🆕2026-09-26＝**条件を複数**（どちらの・どの置き場が・何枚 以下／以上／ちょうど）＋**AND／OR**。空＝いつでも。
  const [ruleConds, setRuleConds] = useState<CpuTargetCond[]>([]);
  const [ruleCombine, setRuleCombine] = useState<CpuCondCombine>('and');
  const [condForm, setCondForm] = useState<CpuTargetCond>({ side: 'me', zone: 'life', cmp: 'le', n: 2 });
  // 🆕2026-09-26＝**特殊状態**を選ぶと、置き場は「その状態を数えられる置き場」だけになる（相手の手札は出さない）。
  const statePlaces = condForm.state ? statePlacesFor(condForm.state, condForm.side) : [];
  const isPlayerState = !!condForm.state && cpuStateDef(condForm.state)?.group === 'player';
  /** 置き場を選び直す（今の置き場が使えなければ先頭へ＝表示と保存を食い違わせない）。 */
  const withValidZone = (f: CpuTargetCond): CpuTargetCond => {
    // 🆕2026-09-26＝パワーで絞れるのは「場のシグニ」（状態なし）だけ＝ほかへ切り替えたら外す。
    if (f.power !== undefined && (f.state || f.zone !== 'field')) {
      const { power: _p, powerCmp: _c, ...rest } = f;
      return withValidZone(rest);
    }
    if (!f.state) return f;
    if (cpuStateDef(f.state)?.group === 'player') return { ...f, zone: 'field' };
    const places = statePlacesFor(f.state, f.side);
    return places.includes(f.zone as CpuStatePlace) ? f : { ...f, zone: places[0] ?? 'field' };
  };
  const setCond = (next: CpuTargetCond) => setCondForm(withValidZone(next));
  const addCond = () => {
    const n = Math.max(0, Math.min(99, Math.round(Number(condForm.n) || 0)));
    const { state, power, powerCmp, ...rest } = withValidZone(condForm);
    // ⚠保存の形は正規化（`toCond`）と同じにする＝`powerCmp` は `ge` 以外のときだけ（同じ条件の重複判定を JSON で比べるため）。
    const pw = power === undefined ? undefined : Math.max(0, Math.min(CPU_COND_POWER_MAX, Math.round(Number(power) || 0)));
    const c: CpuTargetCond = {
      ...rest, n, ...(state ? { state } : {}),
      ...(pw !== undefined ? { power: pw, ...(powerCmp && powerCmp !== 'ge' ? { powerCmp } : {}) } : {}),
    };
    // ⚠同じ条件は2度足さない（AND でも OR でも意味が変わらない）。
    if (ruleConds.some(x => JSON.stringify(x) === JSON.stringify(c))) return;
    setRuleConds([...ruleConds, c]);
  };
  // 🆕2026-09-26 `S-36`＝**相手の札・自分の札で別々の狙い方**（効果によっては自分のシグニを強くする）。
  const [ruleOpp, setRuleOpp] = useState<SideForm>({ mode: 'killable', up: false });
  const [ruleSelf, setRuleSelf] = useState<SideForm>(EMPTY_SIDE);
  /** 規則の効果に出す札＝**選ぶ効果を持つ札だけ**（【常】だけの札は対象を選ばない）。 */
  const ruleCards = cards.filter(c => effectOptionsOf(c.CardNum, 'pick').length > 0);
  const [ruleNum, ruleEid] = ruleSource ? ruleSource.split('|') : ['', ''];
  const canAddRule = !!(sideOf(ruleOpp) || sideOf(ruleSelf));
  const addRule = () => {
    const opp = sideOf(ruleOpp), self = sideOf(ruleSelf);
    // ⚠**どちらの側も指定していない規則は足さない**（何も変えない規則は、上にあると下の規則を隠すだけ）。
    if (!opp && !self) return;
    saveTargeting({
      rules: [...rules, {
        sourceCards: ruleNum ? [ruleNum] : [], ...(ruleEid ? { sourceEffectIds: [ruleEid] } : {}),
        conds: ruleConds, ...(ruleCombine === 'or' && ruleConds.length >= 2 ? { combine: 'or' as const } : {}),
        ...(opp ? { opp } : {}), ...(self ? { self } : {}),
      }],
    });
    setRuleSource('');
    setRuleConds([]);
  };
  const ruleSourceLabel = (r: typeof rules[number]) => {
    if (r.sourceCards.length === 0) return 'どの効果でも';
    const n = r.sourceCards[0];
    const eid = r.sourceEffectIds?.[0];
    return eid ? `${nameOf(n)}の ${effectLabel(n, eid).split('：')[0]}` : `${nameOf(n)}のどの効果でも`;
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
  // ── 🆕2026-09-26 エナの扱い ────────────────────────────────
  //   ⚠**メインデッキの札だけ**（エナに行くのはシグニとスペル＝ルリグデッキの札はエナに来ない）。
  const enaUse = plan.enaUse ?? {};
  const enaCards = cards.filter(c => mainNums.has(c.CardNum));
  const [enaNum, setEnaNum] = useState('');
  const [enaMode, setEnaMode] = useState<CpuEnaUse>('keep');
  const addEnaUse = () => {
    if (!enaNum) return;
    save({ ...plan, enaUse: { ...enaUse, [enaNum]: enaMode } });
    setEnaNum('');
  };
  const removeEnaUse = (n: string) => {
    const next = { ...enaUse };
    delete next[n];
    save({ ...plan, enaUse: next });
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
  const [pickOpp, setPickOpp] = useState<SideForm>(EMPTY_SIDE);
  const [pickSelf, setPickSelf] = useState<SideForm>(EMPTY_SIDE);
  const [pickCards, setPickCards] = useState<string[]>([]);
  const comboCards = cards.filter(c => cpuPlanComboUsesFor(c).length > 0);
  const comboUses = cpuPlanComboUsesFor(num ? cardMap.get(num) : undefined);
  const effectiveComboUse = cpuPlanClampOption(use, comboUses, 'deploy');
  /** その手で選べる効果＝「【起】で使う」は【起】だけ／ほかは選ぶ先を持ちうる効果。 */
  const stepEffects = num ? effectOptionsOf(num, effectiveComboUse === 'activate' ? 'activate' : 'pick') : [];
  const effectiveStepEffect = stepEffects.some(o => o.effectId === stepEffect) ? stepEffect : '';
  const resetStepForm = () => { setNum(''); setStepEffect(''); setPickOpp(EMPTY_SIDE); setPickSelf(EMPTY_SIDE); setPickCards([]); };

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
    const opp = sideOf(pickOpp), self = sideOf(pickSelf);
    const step: CpuComboStep = {
      num, use: effectiveComboUse,
      ...(effectiveStepEffect ? { effectId: effectiveStepEffect } : {}),
      ...(opp || self || pickCards.length
        ? { pick: { ...(opp ? { opp } : {}), ...(self ? { self } : {}), ...(pickCards.length ? { cards: pickCards } : {}) } }
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
      sideText('opp', st.pick?.opp), sideText('self', st.pick?.self),
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

  /** 🆕`S-36`＝効果の原文（全文）の枠。 */
  const textBox = (text: string, testId?: string) => (text ? (
    <div data-testid={testId} style={{ flex: '1 1 100%', color: '#aab', fontSize: 10, lineHeight: 1.5, padding: '4px 6px', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{text}</div>
  ) : null);

  /**
   * 🆕`S-36`＝**片側の狙い方の入力**（相手の札／自分の札）＝狙い方＋「アップ状態を優先」。
   * 🔴**側ごとに選べる狙い方だけ出す**（`killable` は相手の札だけ＝効かない選択肢を出さない）。
   */
  const sideEditor = (side: CpuTargetSide, f: SideForm, set: (f: SideForm) => void, testPrefix: string) => (
    <div style={row}>
      <span style={{ color: side === 'opp' ? '#ff9a9a' : '#9ad0ff', fontSize: 11, flex: '0 0 auto', fontWeight: 'bold' }}>{SIDE_NAMES[side]}</span>
      <select data-testid={`${testPrefix}-${side}-mode`} value={f.mode} onChange={e => set({ ...f, mode: e.target.value as CpuTargetMode | '' })}
        style={{ ...selectStyle, fontSize: 11 }}>
        <option value="">いつもどおり</option>
        {CPU_TARGET_MODES_BY_SIDE[side].map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS_BY_SIDE[side][m]}</option>)}
      </select>
      <label style={{ color: '#bbb', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, flex: '0 0 auto' }}>
        <input data-testid={`${testPrefix}-${side}-up`} type="checkbox" checked={f.up} onChange={e => set({ ...f, up: e.target.checked })} />
        アップ状態を優先
      </label>
    </div>
  );

  /** 手の一覧（新規・保存済み共通）。 */
  const stepList = (t: number | 'new') => stepsOf(t).map((st, i) => (
    <div key={`${st.num}/${st.use}/${st.effectId ?? ''}/${i}`} style={{ ...listRow, paddingLeft: 4 }}>
      <span style={{ flex: '1 1 140px', minWidth: 0, color: '#cfe' }}>{i + 1}. {stepLabel(st)}</span>
      <button onClick={() => moveStep(t, i, -1)} disabled={i === 0} style={small('#335')}>↑</button>
      <button onClick={() => moveStep(t, i, 1)} disabled={i === stepsOf(t).length - 1} style={small('#335')}>↓</button>
      <button onClick={() => removeStep(t, i)} style={small('#522')}>×</button>
      {st.effectId && textBox(effectText(st.num, st.effectId))}
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
            {title('#ff8a8a', '効果の狙い方', '相手の札・自分の札ごとに、上から順に最初に当たった1つ。どれにも当たらなければ「パワー・効果が強いもの」。ライフバーストも効果ごとに選べる')}
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
              {/* 🆕`S-36`＝選んだ効果の原文（全文） */}
              {ruleEid && textBox(effectText(ruleNum, ruleEid), 'cpu-plan-rule-text')}
            </div>
            {/* 🆕2026-09-26＝使うタイミング（条件を複数・AND／OR）。空＝いつでも。 */}
            <div style={{ ...row, border: '1px dashed #44446a', borderRadius: 6, padding: 6 }}>
              <span style={{ color: '#aaa', fontSize: 11, flex: '1 1 100%' }}>使うタイミング（条件なし＝いつでも）</span>
              <select data-testid="cpu-plan-cond-side" value={condForm.side} style={{ ...selectStyle, fontSize: 11 }}
                onChange={e => setCond({ ...condForm, side: e.target.value as CpuTargetCond['side'] })}>
                {CPU_COND_SIDES.map(v => <option key={v} value={v}>{CPU_COND_SIDE_LABELS[v]}</option>)}
              </select>
              {/* 🆕特殊状態（空＝置き場の枚数そのもの）。見出しは4群。 */}
              <select data-testid="cpu-plan-cond-state" value={condForm.state ?? ''} style={{ ...selectStyle, fontSize: 11 }}
                onChange={e => setCond({ ...condForm, state: e.target.value || undefined, zone: e.target.value ? condForm.zone : 'life' })}>
                <option value="">（状態指定なし）</option>
                {(Object.keys(CPU_STATE_GROUP_LABELS) as CpuStateGroup[]).map(g => (
                  <optgroup key={g} label={CPU_STATE_GROUP_LABELS[g]}>
                    {CPU_STATE_DEFS.filter(d => d.group === g).map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
                  </optgroup>
                ))}
              </select>
              {!condForm.state && (
                <select data-testid="cpu-plan-cond-zone" value={condForm.zone} style={{ ...selectStyle, fontSize: 11 }}
                  onChange={e => setCond({ ...condForm, zone: e.target.value as CpuTargetCond['zone'] })}>
                  {CPU_COND_ZONES.map(v => <option key={v} value={v}>{CPU_COND_ZONE_LABELS[v]}</option>)}
                </select>
              )}
              {condForm.state && !isPlayerState && (
                <select data-testid="cpu-plan-cond-place" value={condForm.zone} style={{ ...selectStyle, fontSize: 11 }}
                  onChange={e => setCond({ ...condForm, zone: e.target.value as CpuTargetCond['zone'] })}>
                  {statePlaces.map(v => <option key={v} value={v}>{CPU_STATE_PLACE_LABELS[v]}</option>)}
                </select>
              )}
              {/* 🆕2026-09-26＝場のシグニを**パワーで絞る**（「パワー12000以上のシグニが2体以上」）。実効パワーで数える。 */}
              {!condForm.state && condForm.zone === 'field' && (
                <select data-testid="cpu-plan-cond-powercmp" value={condForm.power === undefined ? '' : (condForm.powerCmp ?? 'ge')}
                  style={{ ...selectStyle, fontSize: 11 }}
                  onChange={e => {
                    const v = e.target.value as CpuCondPowerCmp | '';
                    if (!v) { const { power: _p, powerCmp: _c, ...rest } = condForm; setCond(rest); return; }
                    setCond({ ...condForm, power: condForm.power ?? 12000, powerCmp: v });
                  }}>
                  <option value="">パワーで絞らない</option>
                  {CPU_COND_POWER_CMPS.map(v => <option key={v} value={v}>パワー〇{CPU_COND_CMP_LABELS[v]}</option>)}
                </select>
              )}
              {!condForm.state && condForm.zone === 'field' && condForm.power !== undefined && (
                <input data-testid="cpu-plan-cond-power" type="number" min={0} max={CPU_COND_POWER_MAX} step={1000} value={condForm.power}
                  onChange={e => setCond({ ...condForm, power: Number(e.target.value) })}
                  style={{ ...inputStyle, width: 72, flex: '0 0 auto', fontSize: 11 }} />
              )}
              <input data-testid="cpu-plan-cond-n" type="number" min={0} max={99} value={condForm.n}
                onChange={e => setCond({ ...condForm, n: Number(e.target.value) })}
                style={{ ...inputStyle, width: 56, flex: '0 0 auto', fontSize: 11 }} />
              {/* 🆕2026-09-26＝枚数の単位を入力欄の外に出す（パワー指定のとき何の数か分かりづらかった）。単位は表示と同じ `cpuCondUnit`。 */}
              <span data-testid="cpu-plan-cond-unit" style={{ color: '#ccc', fontSize: 11, alignSelf: 'center' }}>{cpuCondUnit(withValidZone(condForm))}</span>
              <select data-testid="cpu-plan-cond-cmp" value={condForm.cmp} style={{ ...selectStyle, fontSize: 11 }}
                onChange={e => setCond({ ...condForm, cmp: e.target.value as CpuTargetCond['cmp'] })}>
                {CPU_COND_CMPS.map(v => <option key={v} value={v}>{CPU_COND_CMP_LABELS[v]}</option>)}
              </select>
              <button data-testid="cpu-plan-cond-add" onClick={addCond} style={{ ...chip(true, '#4a4a8a'), padding: '5px 10px' }}>条件を足す</button>
              {ruleConds.map((c, i) => (
                <div key={`${JSON.stringify(c)}/${i}`} data-testid={`cpu-plan-cond-row-${i}`} style={{ ...listRow, flex: '1 1 100%' }}>
                  <span style={{ flex: '1 1 84px', minWidth: 0 }}>{cpuTargetCondLabel(c)}</span>
                  <button onClick={() => setRuleConds(ruleConds.filter((_, k) => k !== i))} style={chip(false, '#000')}>削除</button>
                </div>
              ))}
              {ruleConds.length >= 2 && (
                <select data-testid="cpu-plan-cond-combine" value={ruleCombine} style={{ ...selectStyle, fontSize: 11, flex: '1 1 100%' }}
                  onChange={e => setRuleCombine(e.target.value as CpuCondCombine)}>
                  {CPU_COND_COMBINES.map(v => <option key={v} value={v}>{CPU_COND_COMBINE_LABELS[v]}</option>)}
                </select>
              )}
            </div>
            {sideEditor('opp', ruleOpp, setRuleOpp, 'cpu-plan-rule')}
            {sideEditor('self', ruleSelf, setRuleSelf, 'cpu-plan-rule')}
            <div style={row}>
              <button data-testid="cpu-plan-rule-add" onClick={addRule} disabled={!canAddRule}
                style={{ ...chip(canAddRule, '#2e8b2e'), padding: '7px 12px' }}>規則を追加</button>
            </div>
            {rules.map((r, i) => (
              <div key={`${r.sourceCards.join(',')}/${r.sourceEffectIds?.join(',') ?? ''}/${JSON.stringify(r.conds)}/${r.combine ?? ''}/${JSON.stringify(r.opp)}/${JSON.stringify(r.self)}/${i}`}
                style={{ ...listRow, border: '1px solid #33334d', borderRadius: 6, padding: 6 }}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>
                  {ruleSourceLabel(r)}・{cpuTargetCondsLabel(r.conds, r.combine)} → {[sideText('opp', r.opp), sideText('self', r.self)].filter(Boolean).join('／')}
                </span>
                <button onClick={() => saveTargeting({ rules: rules.filter((_, k) => k !== i) })} style={chip(false, '#000')}>削除</button>
                {r.sourceEffectIds?.[0] && textBox(effectText(r.sourceCards[0], r.sourceEffectIds[0]))}
              </div>
            ))}
          </div>

          {/* ── ③ 使いどころ ─────────────────────────────── */}
          <div style={section}>
            {title('#d08aff', '使いどころ', 'アタックフェイズに使える札だけ。守り＝相手のアタックフェイズ／攻め＝自分のアタックフェイズ（アーツはメインフェイズも）')}
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

          {/* ── 🆕エナの扱い ─────────────────────────────── */}
          <div style={section}>
            {title('#e0b050', 'エナの扱い', 'エナゾーンにあるとき、コストの支払いで先に使うか、できるだけ残すか（残す札も、足りなければ使う）')}
            <div style={row}>
              <select data-testid="cpu-plan-ena-card" value={enaNum} onChange={e => setEnaNum(e.target.value)} style={selectStyle}>
                <option value="">カードを選ぶ</option>
                {enaCards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
              </select>
              <select data-testid="cpu-plan-ena-mode" value={enaMode} onChange={e => setEnaMode(e.target.value as CpuEnaUse)}
                style={selectStyle}>
                {CPU_ENA_USES.map(u => <option key={u} value={u}>{CPU_ENA_USE_LABELS[u]}</option>)}
              </select>
              <button data-testid="cpu-plan-ena-add" onClick={addEnaUse} disabled={!enaNum}
                style={{ ...chip(!!enaNum, '#a07820'), padding: '7px 12px' }}>追加</button>
            </div>
            {Object.entries(enaUse).map(([n, u]) => (
              <div key={n} data-testid={`cpu-plan-ena-row-${n}`} style={listRow}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>{nameOf(n)} → {CPU_ENA_USE_LABELS[u]}</span>
                <button onClick={() => removeEnaUse(n)} style={chip(false, '#000')}>削除</button>
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
                  {/* 🆕`S-36`＝選んだ効果の原文（全文）。1つしか無ければそれを出す。 */}
                  {textBox((stepEffects.find(o => o.effectId === effectiveStepEffect) ?? (stepEffects.length === 1 ? stepEffects[0] : undefined))?.text ?? '',
                    'cpu-plan-combo-effect-text')}
                </div>
              )}
              {num && <span style={{ color: '#bbb', fontSize: 11 }}>選ぶ先（その効果が対象・カードを選ぶとき）</span>}
              {num && sideEditor('opp', pickOpp, setPickOpp, 'cpu-plan-combo-pick')}
              {num && sideEditor('self', pickSelf, setPickSelf, 'cpu-plan-combo-pick')}
              {num && (
                <div style={row}>
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
