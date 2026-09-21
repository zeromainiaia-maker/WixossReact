import { useState } from 'react';
import type { CardData, Deck } from '../../types';
import {
  CPU_CARD_USES, CPU_CARD_USE_LABELS,
  CPU_COMBO_USES, CPU_COMBO_USE_LABELS, CPU_TARGET_MODES, CPU_TARGET_MODE_LABELS,
  CPU_TARGET_WHENS, CPU_TARGET_WHEN_LABELS,
  EMPTY_CPU_DECK_PLAN, EMPTY_CPU_TARGET_PLAN, pruneCpuDeckPlan,
  type CpuCardUse, type CpuComboStep, type CpuComboUse, type CpuDeckPlan, type CpuTargetFilter,
  type CpuTargetMode, type CpuTargetWhen,
} from '../battle/cpuDeckPlan';

/**
 * 🆕**CPU の作戦**の編集（§5.7 `S-2`・CPU デッキだけ）＝キーカード・優先して出す札・コンボ。
 * 保存はデッキの更新（`onChange`）と同じ経路＝`decks.cpu_plan`。デッキに無いカードは保存時に外す（`pruneCpuDeckPlan`）。
 *
 * 🆕🔴**§5.7 `S-14`（2026-09-21）＝コンボに「使い方」を持たせた**＝1手ごとに
 * **出す／【起】で使う／アーツで撃つ／スペルで使う**を選ぶ（**2手に限らない**）。
 * 🔑**なぜ要るか（実測）**＝21デッキの作戦データを下書きしたら、**3件が「出す」だけでは書けなかった**
 * （`WD06` リュウグウの【起】／`WD08` ネビュラをトラッシュから【起】／`WD16` Ｆ・Ｍ・Ｓ の【起】→Ｇ・Ｌ・Ｋ）。
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
  const cards = deckNums.map(n => cardMap.get(n)).filter((c): c is CardData => !!c);
  /** 組み立て中のコンボ（「手を足す」で伸ばし、「コンボに追加」で確定する）。 */
  const [steps, setSteps] = useState<CpuComboStep[]>([]);
  const [num, setNum] = useState('');
  const [use, setUse] = useState<CpuComboUse>('deploy');
  const nameOf = (n: string) => cardMap.get(n)?.CardName ?? n;
  const stepLabel = (st: CpuComboStep) => `${nameOf(st.num)}（${CPU_COMBO_USE_LABELS[st.use]}）`;

  const save = (next: CpuDeckPlan) => onChange(pruneCpuDeckPlan(next, deckNums));
  // 🆕§5.7 `S-32`＝効果の対象の狙い方（大まかな指示＋固有のカード指定）。
  const targeting = plan.targeting ?? EMPTY_CPU_TARGET_PLAN;
  const saveTargeting = (next: Partial<typeof targeting>) => save({ ...plan, targeting: { ...targeting, ...next } });
  /**
   * 🆕§5.7 `S-32` ①＝**属性で狙う／避ける**（クラス・レベル・パワー帯）。
   * 🔑**クラスの一覧は「全カードのクラス」から作る**＝相手の山は分からないので、デッキの札だけでは足りない。
   */
  const classOptions = [...new Set([...cardMap.values()]
    .filter(c => c.Type === 'シグニ')
    .flatMap(c => String(c.CardClass ?? '').split('/').filter(Boolean).map(k => k.split('：')[1] ?? k)))]
    .sort((a, b) => a.localeCompare(b, 'ja'));
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
   * 🆕§5.7 `S-31` ③＝**札の使いどころ**（守り／攻め／使わない）。
   * 🔑**守り／攻めが出るのはアーツだけ**＝窓が2つあるのはアーツだけで、スペル・【起】・ピースに効くのは
   *   「使わない」だけ。⚠**効かない選択肢を出さない**（「指定したのに効かない」を作らない）。
   */
  const cardUse = plan.cardUse ?? {};
  const isArts = (n: string) => {
    const t = cardMap.get(n)?.Type ?? '';
    return t === 'アーツ' || t === 'アーツ/クラフト';
  };
  const useOptionsFor = (n: string): readonly CpuCardUse[] => (isArts(n) ? CPU_CARD_USES : ['never']);
  // ⚠**ルリグデッキの札を先に**＝③の主役はアーツ（一覧の下まで探させない）。
  const useCards = [...cards].sort((a, b) => Number(isArts(b.CardNum)) - Number(isArts(a.CardNum)));
  const [useNum, setUseNum] = useState('');
  const [useMode, setUseMode] = useState<CpuCardUse>('defense');
  const pickUseCard = (n: string) => {
    setUseNum(n);
    // ⚠アーツ以外に切り替えたら「使わない」へ落とす（アーツ専用の選択肢が残らないように）。
    if (n && !isArts(n)) setUseMode('never');
  };
  const addCardUse = () => {
    if (!useNum) return;
    save({ ...plan, cardUse: { ...cardUse, [useNum]: useMode } });
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
  /** 組み立て中のコンボに1手足す（⚠同じ「札×使い方」は足さない）。 */
  const addStep = () => {
    if (!num || steps.some(st => st.num === num && st.use === use)) return;
    setSteps([...steps, { num, use }]);
    setNum('');
  };
  const addCombo = () => {
    if (steps.length === 0) return;
    const key = (xs: readonly CpuComboStep[]) => xs.map(st => `${st.num}/${st.use}`).join('>');
    if (plan.combos.some(c => key(c.steps) === key(steps))) { setSteps([]); return; }
    save({ ...plan, combos: [...plan.combos, { steps }] });
    setSteps([]);
  };

  const chip = (active: boolean, color: string): React.CSSProperties => ({
    border: 'none', borderRadius: 4, padding: '3px 8px', fontSize: 11, fontWeight: 'bold', cursor: 'pointer',
    backgroundColor: active ? color : '#2a2a40', color: active ? '#fff' : '#999',
  });
  const selectStyle: React.CSSProperties = { flex: 1, minWidth: 0, padding: 6, borderRadius: 6, backgroundColor: '#0f0f1f', color: '#fff', border: '1px solid #444', fontSize: 12 };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 300 }}>
      <div data-testid="cpu-plan-modal" onClick={e => e.stopPropagation()} style={{ backgroundColor: '#1a1a2e', borderRadius: 12, padding: 20, width: 'min(94vw, 560px)', maxHeight: '86vh', display: 'flex', flexDirection: 'column', gap: 12, border: '1px solid #444' }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <h3 style={{ color: '#fff', fontSize: 15, margin: 0 }}>🤖 CPU の作戦</h3>
          <button onClick={onClose} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#888', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <p style={{ color: '#aaa', fontSize: 11, margin: 0, lineHeight: 1.6 }}>
          <b style={{ color: '#ffb84d' }}>キー</b>＝エナに置かない・捨てない・マリガンで戻さない／
          <b style={{ color: '#4da3ff' }}>優先</b>＝先に場に出す／
          <b style={{ color: '#7ddc7d' }}>コンボ</b>＝前の手が済むまで後の手は温存し、順番どおりに打つ／
          <b style={{ color: '#ff8a8a' }}>狙う・避ける</b>＝効果の対象に選ぶ／選ばない／
          <b style={{ color: '#d08aff' }}>使いどころ</b>＝アーツを守り／攻めで使う・この札は使わない
        </p>

        {/* 🆕§5.7 `S-32`＝**大まかな指示**（対象の狙い方）。⚠既定は「パワー・効果が強いもの」＝挙動不変。 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#ff8a8a', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>効果の対象</span>
          <select data-testid="cpu-plan-target-mode" value={targeting.mode}
            onChange={e => saveTargeting({ mode: e.target.value as CpuTargetMode })} style={selectStyle}>
            {CPU_TARGET_MODES.map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS[m]}</option>)}
          </select>
        </div>

        {/* 🆕§5.7 `S-32` ①＝**属性で狙う／避ける**。⚠相手の札は名指しできないのでここで指定する。 */}
        {([['preferFilter', '狙う', '#b83a3a', '以上'], ['avoidFilter', '避ける', '#555', '以下']] as const).map(([key, label, color, cmp]) => {
          const f = targeting[key] ?? {};
          const lvKey = key === 'preferFilter' ? 'levelMin' : 'levelMax';
          const pwKey = key === 'preferFilter' ? 'powerMin' : 'powerMax';
          return (
            <div key={key} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color, fontSize: 11, fontWeight: 'bold', whiteSpace: 'nowrap', minWidth: 52 }}>{label}条件</span>
              <select data-testid={`cpu-plan-${key}-story`} value={f.story ?? ''}
                onChange={e => saveFilter(key, { story: e.target.value || undefined })} style={{ ...selectStyle, fontSize: 11 }}>
                <option value="">クラス指定なし</option>
                {classOptions.map(c => <option key={c} value={c}>＜{c}＞</option>)}
              </select>
              <select data-testid={`cpu-plan-${key}-level`} value={String(f[lvKey] ?? '')}
                onChange={e => saveFilter(key, { [lvKey]: numOrUndef(e.target.value) })} style={{ ...selectStyle, fontSize: 11, flex: '0 0 96px' }}>
                <option value="">レベル—</option>
                {[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>Lv{n}{cmp}</option>)}
              </select>
              <select data-testid={`cpu-plan-${key}-power`} value={String(f[pwKey] ?? '')}
                onChange={e => saveFilter(key, { [pwKey]: numOrUndef(e.target.value) })} style={{ ...selectStyle, fontSize: 11, flex: '0 0 110px' }}>
                <option value="">パワー—</option>
                {[3000, 5000, 8000, 10000, 12000, 15000].map(n => <option key={n} value={n}>{n / 1000}千{cmp}</option>)}
              </select>
            </div>
          );
        })}

        {/* 🆕§5.7 `S-32` ②③＝**狙い方の切り替え**（この札の効果のとき／盤面の条件のとき）。上から順に最初に当たった1つ。 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <select data-testid="cpu-plan-rule-card" value={ruleCard} onChange={e => setRuleCard(e.target.value)}
            style={{ ...selectStyle, fontSize: 11 }}>
            <option value="">どの効果でも</option>
            {cards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}の効果</option>)}
          </select>
          <select data-testid="cpu-plan-rule-when" value={ruleWhen} onChange={e => setRuleWhen(e.target.value as CpuTargetWhen)}
            style={{ ...selectStyle, fontSize: 11, flex: '0 0 150px' }}>
            {CPU_TARGET_WHENS.map(w => <option key={w} value={w}>{CPU_TARGET_WHEN_LABELS[w]}</option>)}
          </select>
          <select data-testid="cpu-plan-rule-mode" value={ruleMode} onChange={e => setRuleMode(e.target.value as CpuTargetMode)}
            style={{ ...selectStyle, fontSize: 11, flex: '0 0 150px' }}>
            {CPU_TARGET_MODES.map(m => <option key={m} value={m}>{CPU_TARGET_MODE_LABELS[m]}</option>)}
          </select>
          <button data-testid="cpu-plan-rule-add" onClick={addRule} disabled={!ruleCard && ruleWhen === 'always'}
            style={{ ...chip(!!ruleCard || ruleWhen !== 'always', '#2e8b2e'), padding: '6px 10px' }}>切替を追加</button>
        </div>
        {rules.map((r, i) => (
          <div key={`${r.sourceCards.join(',')}/${r.when}/${r.mode}/${i}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ddd' }}>
            <span style={{ flex: 1 }}>
              {r.sourceCards.length ? `${nameOf(r.sourceCards[0])}の効果` : 'どの効果でも'}
              ・{CPU_TARGET_WHEN_LABELS[r.when]} → {CPU_TARGET_MODE_LABELS[r.mode]}
            </span>
            <button onClick={() => saveTargeting({ rules: rules.filter((_, k) => k !== i) })} style={chip(false, '#000')}>削除</button>
          </div>
        ))}

        {/* 🆕§5.7 `S-31` ③＝札の使いどころ。🔴**分類できないアーツを使えるようにする唯一の口**
            （実測＝ユーザー作21デッキのアーツ76種のうち CPU が自力で使えるのは24＝31.6%）。 */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ color: '#d08aff', fontSize: 12, fontWeight: 'bold', whiteSpace: 'nowrap' }}>使いどころ</span>
          <select data-testid="cpu-plan-use-card" value={useNum} onChange={e => pickUseCard(e.target.value)} style={selectStyle}>
            <option value="">カードを選ぶ</option>
            {useCards.map(c => (
              <option key={c.CardNum} value={c.CardNum}>{c.CardName}{isArts(c.CardNum) ? '（アーツ）' : ''}</option>
            ))}
          </select>
          <select data-testid="cpu-plan-use-mode" value={useMode} onChange={e => setUseMode(e.target.value as CpuCardUse)}
            style={{ ...selectStyle, flex: '0 0 150px' }}>
            {useOptionsFor(useNum).map(u => <option key={u} value={u}>{CPU_CARD_USE_LABELS[u]}</option>)}
          </select>
          <button data-testid="cpu-plan-use-add" onClick={addCardUse} disabled={!useNum}
            style={{ ...chip(!!useNum, '#7a3ab8'), padding: '6px 10px' }}>追加</button>
        </div>
        {Object.entries(cardUse).map(([n, u]) => (
          <div key={n} data-testid={`cpu-plan-use-row-${n}`} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#ddd' }}>
            <span style={{ flex: 1 }}>{nameOf(n)} → {CPU_CARD_USE_LABELS[u]}</span>
            <button onClick={() => removeCardUse(n)} style={chip(false, '#000')}>削除</button>
          </div>
        ))}

        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minHeight: 120 }}>
          {cards.map(c => (
            <div key={c.CardNum} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 6px', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
              <span style={{ color: '#ddd', fontSize: 12, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {c.CardName}<span style={{ color: '#666', fontSize: 10, marginLeft: 6 }}>{c.Type}{c.Level && c.Level !== '-' ? ` Lv${c.Level}` : ''}</span>
              </span>
              <button data-testid={`cpu-plan-key-${c.CardNum}`} onClick={() => toggle('keyCards', c.CardNum)} style={chip(plan.keyCards.includes(c.CardNum), '#c77a00')}>キー</button>
              <button data-testid={`cpu-plan-priority-${c.CardNum}`} onClick={() => toggle('priorityCards', c.CardNum)} style={chip(plan.priorityCards.includes(c.CardNum), '#1f6fcc')}>優先</button>
              <button data-testid={`cpu-plan-prefer-${c.CardNum}`} onClick={() => toggleTarget('prefer', c.CardNum)} style={chip(targeting.prefer.includes(c.CardNum), '#b83a3a')}>狙う</button>
              <button data-testid={`cpu-plan-avoid-${c.CardNum}`} onClick={() => toggleTarget('avoid', c.CardNum)} style={chip(targeting.avoid.includes(c.CardNum), '#555')}>避ける</button>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid #333', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ color: '#7ddc7d', fontSize: 12, fontWeight: 'bold' }}>コンボ（順番に打つ手）</span>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <select data-testid="cpu-plan-combo-card" value={num} onChange={e => setNum(e.target.value)} style={selectStyle}>
              <option value="">カードを選ぶ</option>
              {cards.map(c => <option key={c.CardNum} value={c.CardNum}>{c.CardName}</option>)}
            </select>
            <select data-testid="cpu-plan-combo-use" value={use} onChange={e => setUse(e.target.value as CpuComboUse)}
              style={{ ...selectStyle, flex: '0 0 130px' }}>
              {CPU_COMBO_USES.map(u => <option key={u} value={u}>{CPU_COMBO_USE_LABELS[u]}</option>)}
            </select>
            <button data-testid="cpu-plan-combo-step-add" onClick={addStep} disabled={!num}
              style={{ ...chip(!!num, '#2e6fb8'), padding: '6px 10px' }}>手を足す</button>
          </div>
          {steps.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#7ddc7d' }}>
              <span data-testid="cpu-plan-combo-draft" style={{ flex: 1 }}>{steps.map(stepLabel).join(' → ')}</span>
              <button data-testid="cpu-plan-combo-add" onClick={addCombo} style={chip(true, '#2e8b2e')}>コンボに追加</button>
              <button onClick={() => setSteps([])} style={chip(false, '#000')}>取消</button>
            </div>
          )}
          {plan.combos.map(c => (
            <div key={c.steps.map(st => `${st.num}/${st.use}`).join('>')} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#ddd' }}>
              <span style={{ flex: 1 }}>{c.steps.map(stepLabel).join(' → ')}</span>
              <button onClick={() => save({ ...plan, combos: plan.combos.filter(x => x !== c) })} style={chip(false, '#000')}>削除</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
