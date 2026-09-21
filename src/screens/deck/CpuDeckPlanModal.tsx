import { useMemo, useState } from 'react';
import type { CardData, Deck } from '../../types';
import {
  CPU_CARD_USE_LABELS,
  CPU_COMBO_USE_LABELS, CPU_TARGET_MODES, CPU_TARGET_MODE_LABELS,
  CPU_TARGET_WHENS, CPU_TARGET_WHEN_LABELS,
  EMPTY_CPU_DECK_PLAN, EMPTY_CPU_TARGET_PLAN, pruneCpuDeckPlan,
  type CpuCardUse, type CpuComboStep, type CpuComboUse, type CpuDeckPlan, type CpuTargetFilter,
  type CpuTargetMode, type CpuTargetWhen,
} from '../battle/cpuDeckPlan';
import {
  cpuPlanCanSetUse, cpuPlanChipsFor, cpuPlanClampOption, cpuPlanComboUsesFor, cpuPlanIsArts, cpuPlanUseModesFor,
} from './cpuPlanOptions';

/**
 * 🆕**CPU の作戦**の編集（§5.7 `S-2`・CPU デッキだけ）＝キーカード・優先して出す札・コンボ・対象の狙い方・使いどころ。
 * 保存はデッキの更新（`onChange`）と同じ経路＝`decks.cpu_plan`。デッキに無いカードは保存時に外す（`pruneCpuDeckPlan`）。
 *
 * 🆕🔴**2026-09-22（ユーザー指摘「スマホ縦で横幅が収まらない・設定内容もおかしい」）で作り直した。**
 *
 * ■ レイアウト（スマホ縦＝390px で実測して直した）
 *   - 🔴**すべての操作行を `flexWrap` にする**＝旧は `flex:'0 0 150px'` の固定幅を並べていたので、
 *     **「切替を追加」ボタンがモーダルの外へ 18px はみ出し**、クラスの `select` は「ク:」まで潰れていた（実測）。
 *   - 🔴**本文を1つのスクロール領域にする**＝旧はカード一覧だけがスクロールし、
 *     規則や使いどころの行が増えると**下のコンボ節が画面外へ押し出されて触れなくなった**。
 *   - **節ごとに見出しを置く**＝旧は色つきの語を並べた1段落だけで、どの行が何の設定か画面から読めなかった。
 *
 * ■ 🔴**効かない操作を出さない**（＝「指定したのに効かない」を作らない・`cpuDeckPlan.ts` の規律）
 *   - **キー**＝エナ・手札上限・マリガン・サーチに効く＝**メインデッキの札だけ**
 *     （ルリグデッキの札は手札にもエナにも行かない＝旧はアーツ・ルリグにも出ていて全部 no-op だった）。
 *   - **優先**＝`planUseBonus` の `deploy` にしか効かない＝**シグニ／レゾナだけ**。
 *   - **使いどころ**＝守り／攻めの窓を持つのは**アーツだけ**／「使わない」が効くのは
 *     **アーツ・スペル・キー・ピース・【起】を持つ札**（`planForbidsUse` の消費地点＝`cpuArts`／`cpuSpell`／
 *     `cpuKeyPiece`／`cpuActivate`／`cpuLrigActivate`）。
 *   - **コンボの使い方**＝`cpuPlanMoveStep` が拾える形だけ（出す＝シグニ／レゾナ・【起】＝【起】を持つ札・
 *     アーツ＝アーツ・スペル＝スペル）。⚠**キーとピースはコンボに入らない**（`cpuPlanMoveStep` が `null` を返す）。
 *
 * ■ 🆕**相手の札を名指しできるようにした**＝`pruneCpuDeckPlan` は
 *   「狙う／避ける」だけデッキ外の札を**わざと落とさない**（相手のエースを名指しするため）のに、
 *   **画面は自分のデッキの札しか出しておらず入口が無かった**。全カードから探して足せるようにした。
 *
 * 🆕🔴**§5.7 `S-14`（2026-09-21）＝コンボに「使い方」を持たせた**＝1手ごとに
 * **出す／【起】で使う／アーツで撃つ／スペルで使う**を選ぶ（**2手に限らない**）。
 * ⚠**旧形（A → B の2枚）で保存済みのコンボは「出す → 出す」として読める**（`normalizeCpuDeckPlan`）。
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
  /** 組み立て中のコンボ（「手を足す」で伸ばし、「コンボに追加」で確定する）。 */
  const [steps, setSteps] = useState<CpuComboStep[]>([]);
  const [num, setNum] = useState('');
  const [use, setUse] = useState<CpuComboUse>('deploy');
  const nameOf = (n: string) => cardMap.get(n)?.CardName ?? n;
  const stepLabel = (st: CpuComboStep) => `${nameOf(st.num)}（${CPU_COMBO_USE_LABELS[st.use]}）`;

  const save = (next: CpuDeckPlan) => onChange(pruneCpuDeckPlan(next, deckNums));

  // ── 🔴**効かない操作を出さない**ための判定は `cpuPlanOptions.ts` の純関数（golden が全カードに当てている）──
  const isArts = (n: string) => cpuPlanIsArts(cardMap.get(n));
  /** その行に出すチップ（キー＝メインデッキの札だけ／優先＝出す札だけ）。 */
  const chipsFor = (n: string) => cpuPlanChipsFor(cardMap.get(n), mainNums.has(n));

  // 🆕§5.7 `S-32`＝効果の対象の狙い方（大まかな指示＋固有のカード指定）。
  const targeting = plan.targeting ?? EMPTY_CPU_TARGET_PLAN;
  const saveTargeting = (next: Partial<typeof targeting>) => save({ ...plan, targeting: { ...targeting, ...next } });
  /**
   * 🆕§5.7 `S-32` ①＝**属性で狙う／避ける**（クラス・レベル・パワー帯）。
   * 🔑**クラスの一覧は「全カードのクラス」から作る**＝相手の山は分からないので、デッキの札だけでは足りない。
   * 🔴**`useMemo` で1度だけ**＝全6,700枚を走査する式なので、チップを押すたびに回すと画面が目に見えて重くなる。
   */
  const classOptions = useMemo(() => [...new Set([...cardMap.values()]
    .filter(c => c.Type === 'シグニ')
    .flatMap(c => String(c.CardClass ?? '').split('/').filter(Boolean).map(k => k.split('：')[1] ?? k)))]
    .sort((a, b) => a.localeCompare(b, 'ja')), [cardMap]);
  const saveFilter = (key: 'preferFilter' | 'avoidFilter', next: Partial<CpuTargetFilter>) => {
    const merged: CpuTargetFilter = { ...(targeting[key] ?? {}), ...next };
    // ⚠**空になったら消す**（`{}` を残すと「指定あり」に見えて `isEmptyCpuDeckPlan` が嘘をつく）。
    const kept = Object.fromEntries(Object.entries(merged).filter(([, v]) => v !== undefined && v !== '')) as CpuTargetFilter;
    saveTargeting({ [key]: Object.keys(kept).length > 0 ? kept : undefined });
  };
  const numOrUndef = (v: string) => (v === '' ? undefined : Number(v));
  // 🆕§5.7 `S-32` ②③＝狙い方の切り替え規則（効果ごと・盤面の条件つき）。
  const rules = targeting.rules ?? [];
  const [ruleCard, setRuleCard] = useState('');
  const [ruleWhen, setRuleWhen] = useState<CpuTargetWhen>('always');
  const [ruleMode, setRuleMode] = useState<CpuTargetMode>('killable');
  const addRule = () => {
    // ⚠**何も絞っていない規則は足さない**（既定と同じで、上に置くと下の規則を全部殺す）。
    if (!ruleCard && ruleWhen === 'always') return;
    saveTargeting({ rules: [...rules, { sourceCards: ruleCard ? [ruleCard] : [], when: ruleWhen, mode: ruleMode }] });
    setRuleCard('');
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
  /**
   * 🆕**相手の札を名指しする**（2026-09-22）＝`pruneCpuDeckPlan` は「狙う／避ける」だけ
   * **デッキ外の札を落とさない**（＝相手のエースを名指しするための設計）のに、**入口が無かった**。
   * ⚠**全カードから探す**ので、名前で絞ってから選ぶ（候補は 40件で打ち切る）。
   */
  const [foeQuery, setFoeQuery] = useState('');
  const foeMatches = useMemo(() => {
    const q = foeQuery.trim();
    if (q.length === 0) return [];
    return [...cardMap.values()].filter(c => c.CardName?.includes(q)).slice(0, 40);
  }, [foeQuery, cardMap]);
  /** 名指し済みでデッキに無い札（＝相手の札）＝ここでしか消せないので必ず出す。 */
  const namedOutside = (['prefer', 'avoid'] as const)
    .flatMap(k => targeting[k].filter(n => !deckNums.includes(n)).map(n => ({ key: k, num: n })));

  /**
   * 🆕§5.7 `S-31` ③＝**札の使いどころ**（守り／攻め／使わない）。
   * 🔑**守り／攻めが出るのはアーツだけ**＝窓が2つあるのはアーツだけで、スペル・【起】・ピースに効くのは
   *   「使わない」だけ。⚠**効かない選択肢を出さない**（「指定したのに効かない」を作らない）。
   */
  const cardUse = plan.cardUse ?? {};
  const useOptionsFor = (n: string): readonly CpuCardUse[] => cpuPlanUseModesFor(n ? cardMap.get(n) : undefined);
  // ⚠**アーツを先に**＝③の主役はアーツ（一覧の下まで探させない）。
  const useCards = [...cards].filter(c => cpuPlanCanSetUse(c))
    .sort((a, b) => Number(isArts(b.CardNum)) - Number(isArts(a.CardNum)));
  const [useNum, setUseNum] = useState('');
  const [useMode, setUseMode] = useState<CpuCardUse>('defense');
  const useOptions = useOptionsFor(useNum);
  /**
   * 🔴**選択肢に無い値を `select` の value にしない**（2026-09-22 に直した実バグ）＝
   * 旧は**カード未選択のとき選択肢が `['never']` だけなのに state は `'defense'`** で、
   * 画面は「使わない」と出しているのに**アーツを選んで［追加］すると `defense` が保存された**。
   */
  const effectiveUseMode = cpuPlanClampOption(useMode, useOptions, 'never');
  const pickUseCard = (n: string) => setUseNum(n);
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

  /** 🆕コンボの1手に選べる「使い方」＝**`cpuPlanMoveStep` が拾える形だけ**（判定は `cpuPlanOptions.ts`）。 */
  const comboUsesFor = (n: string): readonly CpuComboUse[] => cpuPlanComboUsesFor(n ? cardMap.get(n) : undefined);
  const comboCards = cards.filter(c => cpuPlanComboUsesFor(c).length > 0);
  const comboUses = comboUsesFor(num);
  /** 🔴使いどころと同じ理由＝選択肢に無い値を value にしない（表示と保存が食い違う）。 */
  const effectiveComboUse = cpuPlanClampOption(use, comboUses, 'deploy');
  /** 組み立て中のコンボに1手足す（⚠同じ「札×使い方」は足さない）。 */
  const addStep = () => {
    if (!num || steps.some(st => st.num === num && st.use === effectiveComboUse)) return;
    setSteps([...steps, { num, use: effectiveComboUse }]);
    setNum('');
  };
  const addCombo = () => {
    if (steps.length === 0) return;
    const key = (xs: readonly CpuComboStep[]) => xs.map(st => `${st.num}/${st.use}`).join('>');
    if (plan.combos.some(c => key(c.steps) === key(steps))) { setSteps([]); return; }
    save({ ...plan, combos: [...plan.combos, { steps }] });
    setSteps([]);
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
  // 🔴**固定幅（`flex:'0 0 150px'`）を使わない**＝スマホ縦（390px）でモーダルの外へはみ出す（実測）。
  const selectStyle: React.CSSProperties = {
    flex: '1 1 128px', minWidth: 0, padding: 6, borderRadius: 6,
    backgroundColor: '#0f0f1f', color: '#fff', border: '1px solid #444', fontSize: 12,
  };
  const inputStyle: React.CSSProperties = { ...selectStyle, flex: '1 1 140px' };
  /** 操作行＝**必ず折り返す**（横に溢れさせない）。 */
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

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div data-testid="cpu-plan-modal" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 12, width: 'min(96vw, 560px)', maxHeight: '90vh', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid #444', overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <h3 style={{ color: '#fff', fontSize: 15, margin: 0 }}>🤖 CPU の作戦</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', fontSize: 22, cursor: 'pointer', lineHeight: 1, padding: '0 4px' }}>×</button>
        </div>

        {/* 🔴**本文が1つのスクロール領域**＝旧はカード一覧だけがスクロールし、規則が増えるとコンボ節が画面外へ出た。 */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* ── ① 札の役割 ───────────────────────────────── */}
          <div style={section}>
            {title('#ffb84d', '札の役割', 'キー＝エナ・捨て札・マリガンで手放さない／優先＝先に場に出す／狙う・避ける＝効果の対象に選ぶ・選ばない')}
            <input value={listQuery} onChange={e => setListQuery(e.target.value)} placeholder="カード名で絞り込む" style={{ ...inputStyle, flex: '1 1 auto' }} />
            <div style={{ maxHeight: 264, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {listCards.map(c => (
                <div key={c.CardNum} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 6px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6, flexWrap: 'wrap' }}>
                  <span style={{ color: '#ddd', fontSize: 12, flex: '1 1 84px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {c.CardName}<span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>{c.Type}{c.Level && c.Level !== '-' ? ` Lv${c.Level}` : ''}</span>
                  </span>
                  {/* 🔴**出すのは効くチップだけ**（`cpuPlanChipsFor`）＝キーはメインデッキの札／優先は出す札にしか効かない。 */}
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

          {/* ── ② 効果の対象 ─────────────────────────────── */}
          <div style={section}>
            {title('#ff8a8a', '効果の対象', '相手のシグニなどを選ぶときの優先順位')}
            <div style={row}>
              <span style={{ color: '#bbb', fontSize: 11, flex: '0 0 auto' }}>既定</span>
              <select data-testid="cpu-plan-target-mode" value={targeting.mode}
                onChange={e => saveTargeting({ mode: e.target.value as CpuTargetMode })} style={selectStyle}>
                {CPU_TARGET_MODES.map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS[m]}</option>)}
              </select>
            </div>

            {/* 🆕§5.7 `S-32` ①＝**属性で狙う／避ける**。⚠相手の札は名指しできないのでここで指定する。 */}
            {([['preferFilter', '狙う（以上）', '#b83a3a', '以上'], ['avoidFilter', '避ける（以下）', '#888', '以下']] as const).map(([key, label, color, cmp]) => {
              const f = targeting[key] ?? {};
              const lvKey = key === 'preferFilter' ? 'levelMin' : 'levelMax';
              const pwKey = key === 'preferFilter' ? 'powerMin' : 'powerMax';
              return (
                <div key={key} style={row}>
                  <span style={{ color, fontSize: 11, fontWeight: 'bold', flex: '1 0 100%' }}>{label}</span>
                  <select data-testid={`cpu-plan-${key}-story`} value={f.story ?? ''}
                    onChange={e => saveFilter(key, { story: e.target.value || undefined })} style={{ ...selectStyle, fontSize: 11 }}>
                    <option value="">クラス指定なし</option>
                    {classOptions.map(c => <option key={c} value={c}>＜{c}＞</option>)}
                  </select>
                  <select data-testid={`cpu-plan-${key}-level`} value={String(f[lvKey] ?? '')}
                    onChange={e => saveFilter(key, { [lvKey]: numOrUndef(e.target.value) })} style={{ ...selectStyle, fontSize: 11, flex: '1 1 96px' }}>
                    <option value="">レベル指定なし</option>
                    {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Lv{n}{cmp}</option>)}
                  </select>
                  <select data-testid={`cpu-plan-${key}-power`} value={String(f[pwKey] ?? '')}
                    onChange={e => saveFilter(key, { [pwKey]: numOrUndef(e.target.value) })} style={{ ...selectStyle, fontSize: 11, flex: '1 1 110px' }}>
                    <option value="">パワー指定なし</option>
                    {[3000, 5000, 8000, 10000, 12000, 15000].map(n => <option key={n} value={n}>{n / 1000}千{cmp}</option>)}
                  </select>
                </div>
              );
            })}

            {/* 🆕**相手の札を名指し**＝`pruneCpuDeckPlan` が落とさない側（デッキ外でよい）。旧は入口が無かった。 */}
            <span style={{ color: '#bbb', fontSize: 11 }}>相手の札を名指し（デッキ外もOK）</span>
            <div style={row}>
              <input data-testid="cpu-plan-foe-query" value={foeQuery} onChange={e => setFoeQuery(e.target.value)}
                placeholder="カード名で探す" style={inputStyle} />
            </div>
            {foeMatches.length > 0 && (
              <div style={{ maxHeight: 132, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4 }}>
                {foeMatches.map(c => (
                  <div key={c.CardNum} style={listRow}>
                    <span style={{ flex: '1 1 84px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {c.CardName}<span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>{c.Type}</span>
                    </span>
                    <button data-testid={`cpu-plan-foe-prefer-${c.CardNum}`} onClick={() => toggleTarget('prefer', c.CardNum)} style={chip(targeting.prefer.includes(c.CardNum), '#b83a3a')}>狙う</button>
                    <button data-testid={`cpu-plan-foe-avoid-${c.CardNum}`} onClick={() => toggleTarget('avoid', c.CardNum)} style={chip(targeting.avoid.includes(c.CardNum), '#555')}>避ける</button>
                  </div>
                ))}
              </div>
            )}
            {namedOutside.map(({ key, num: n }) => (
              <div key={`${key}/${n}`} style={listRow}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>{nameOf(n)} → {key === 'prefer' ? '狙う' : '避ける'}</span>
                <button onClick={() => toggleTarget(key, n)} style={chip(false, '#000')}>削除</button>
              </div>
            ))}

            {/* 🆕§5.7 `S-32` ②③＝**狙い方の切り替え**（この札の効果のとき／盤面の条件のとき）。上から順に最初に当たった1つ。 */}
            <span style={{ color: '#bbb', fontSize: 11 }}>狙い方の切り替え（上から順に最初に当たった1つ）</span>
            <div style={row}>
              <select data-testid="cpu-plan-rule-card" value={ruleCard} onChange={e => setRuleCard(e.target.value)}
                style={{ ...selectStyle, fontSize: 11 }}>
                <option value="">どの効果でも</option>
                {cards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}の効果</option>)}
              </select>
              <select data-testid="cpu-plan-rule-when" value={ruleWhen} onChange={e => setRuleWhen(e.target.value as CpuTargetWhen)}
                style={{ ...selectStyle, fontSize: 11 }}>
                {CPU_TARGET_WHENS.map(w => <option key={w} value={w}>{CPU_TARGET_WHEN_LABELS[w]}</option>)}
              </select>
              <select data-testid="cpu-plan-rule-mode" value={ruleMode} onChange={e => setRuleMode(e.target.value as CpuTargetMode)}
                style={{ ...selectStyle, fontSize: 11 }}>
                {CPU_TARGET_MODES.map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS[m]}</option>)}
              </select>
              <button data-testid="cpu-plan-rule-add" onClick={addRule} disabled={!ruleCard && ruleWhen === 'always'}
                style={{ ...chip(!!ruleCard || ruleWhen !== 'always', '#2e8b2e'), padding: '7px 12px' }}>切替を追加</button>
            </div>
            {rules.map((r, i) => (
              <div key={`${r.sourceCards.join(',')}/${r.when}/${r.mode}/${i}`} style={listRow}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>
                  {r.sourceCards.length ? `${nameOf(r.sourceCards[0])}の効果` : 'どの効果でも'}
                  ・{CPU_TARGET_WHEN_LABELS[r.when]} → {CPU_TARGET_MODE_LABELS[r.mode]}
                </span>
                <button onClick={() => saveTargeting({ rules: rules.filter((_, k) => k !== i) })} style={chip(false, '#000')}>削除</button>
              </div>
            ))}
          </div>

          {/* ── ③ 使いどころ ─────────────────────────────── */}
          {/* 🆕§5.7 `S-31` ③。🔴**分類できないアーツを使えるようにする唯一の口**
              （実測＝ユーザー作21デッキのアーツ76種のうち CPU が自力で使えるのは24＝31.6%）。 */}
          <div style={section}>
            {title('#d08aff', '使いどころ', '守り／攻めが選べるのはアーツだけ。ほかは「使わない」だけが効く')}
            <div style={row}>
              <select data-testid="cpu-plan-use-card" value={useNum} onChange={e => pickUseCard(e.target.value)} style={selectStyle}>
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
            {title('#7ddc7d', 'コンボ（順番に打つ手）', '前の手が済むまで後の手は温存し、順番どおりに打つ')}
            <div style={row}>
              <select data-testid="cpu-plan-combo-card" value={num} onChange={e => setNum(e.target.value)} style={selectStyle}>
                <option value="">カードを選ぶ</option>
                {comboCards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
              </select>
              <select data-testid="cpu-plan-combo-use" value={effectiveComboUse} onChange={e => setUse(e.target.value as CpuComboUse)}
                style={selectStyle}>
                {comboUses.map(u => <option key={u} value={u}>{CPU_COMBO_USE_LABELS[u]}</option>)}
              </select>
              <button data-testid="cpu-plan-combo-step-add" onClick={addStep} disabled={!num}
                style={{ ...chip(!!num, '#2e6fb8'), padding: '7px 12px' }}>手を足す</button>
            </div>
            {steps.length > 0 && (
              <div style={{ ...listRow, color: '#7ddc7d', fontSize: 12 }}>
                <span data-testid="cpu-plan-combo-draft" style={{ flex: '1 1 84px', minWidth: 0 }}>{steps.map(stepLabel).join(' → ')}</span>
                <button data-testid="cpu-plan-combo-add" onClick={addCombo} style={chip(true, '#2e8b2e')}>コンボに追加</button>
                <button onClick={() => setSteps([])} style={chip(false, '#000')}>取消</button>
              </div>
            )}
            {plan.combos.map(c => (
              <div key={c.steps.map(st => `${st.num}/${st.use}`).join('>')} style={{ ...listRow, fontSize: 12 }}>
                <span style={{ flex: '1 1 84px', minWidth: 0 }}>{c.steps.map(stepLabel).join(' → ')}</span>
                <button onClick={() => save({ ...plan, combos: plan.combos.filter(x => x !== c) })} style={chip(false, '#000')}>削除</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
