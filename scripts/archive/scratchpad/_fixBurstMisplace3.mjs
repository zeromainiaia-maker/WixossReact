// BURST↔E誤配置の残3枚を是正（census §5c 続き20・parser表現不能=MANUAL刻印）
// - WD21-011: LB条件「2枚以上クラッシュされていた場合」がE2側に混入→LBへ移設・E2はLIFE_COUNT eq0のみに
// - WXEX1-52: LB=バニッシュ欠落+トラッシュowner逆転→SEQUENCE[BANISH opp1, TRASH self1]。E2=自シグニコストが相手化→owner self
// - WXK05-025: E1=ドロー2欠落+デッキ下1枚→SEQUENCE[DRAW2, 手札2枚を好きな順でデッキ下, FREEZE1]。LB=全ダウン→[DOWN1, FREEZE ALL]
import fs from 'fs';

function load(p) { return JSON.parse(fs.readFileSync(p, 'utf8')); }
function save(p, j) { fs.writeFileSync(p, JSON.stringify(j)); }

// ---- WD21-011 (effects_misc.json) ----
{
  const p = 'public/data/effects_misc.json';
  const j = load(p);
  const effs = j['WD21-011'];
  const e2 = effs.find(e => e.effectId === 'WD21-011-E2');
  const lb = effs.find(e => e.effectId === 'WD21-011-BURST');
  if (e2.action.type !== 'SEQUENCE' || e2.action.steps.length !== 2) throw new Error('WD21-011-E2 unexpected');
  if (e2.action.steps[1].condition?.type !== 'LIFE_CRASHED_THIS_TURN') throw new Error('WD21-011-E2 step1 unexpected');
  e2.action = e2.action.steps[0]; // CONDITIONAL{LIFE_COUNT eq0 → ADD_TO_LIFE} のみ（誤混入の第2条件節を除去）
  if (lb.action.type !== 'SEQUENCE' || lb.action.steps[1]?.type !== 'ADD_TO_LIFE') throw new Error('WD21-011-BURST unexpected');
  lb.action.steps[1] = {
    type: 'CONDITIONAL',
    condition: { type: 'LIFE_CRASHED_THIS_TURN', owner: 'self', operator: 'gte', value: 2 },
    then: { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true },
  };
  lb.parseStatus = 'MANUAL';
  save(p, j);
  console.log('WD21-011 patched');
}

// ---- WXEX1-52 (effects_WX.json) ----
{
  const p = 'public/data/effects_WX.json';
  const j = load(p);
  const effs = j['WXEX1-52'];
  const e2 = effs.find(e => e.effectId === 'WXEX1-52-E2');
  const lb = effs.find(e => e.effectId === 'WXEX1-52-BURST');
  if (e2.action.steps?.[0]?.type !== 'TRASH' || e2.action.steps[0].target.owner !== 'opponent') throw new Error('WXEX1-52-E2 unexpected');
  e2.action.steps[0].target.owner = 'self'; // 「あなたの他のシグニ1体を場からトラッシュ」（コスト対象逆転の是正）
  e2.parseStatus = 'MANUAL';
  if (lb.action.type !== 'TRASH') throw new Error('WXEX1-52-BURST unexpected');
  lb.action = {
    type: 'SEQUENCE',
    steps: [
      { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
    ],
  };
  lb.parseStatus = 'MANUAL';
  save(p, j);
  console.log('WXEX1-52 patched');
}

// ---- WXK05-025 (effects_WXK.json) ----
{
  const p = 'public/data/effects_WXK.json';
  const j = load(p);
  const effs = j['WXK05-025'];
  const e1 = effs.find(e => e.effectId === 'WXK05-025-E1');
  const lb = effs.find(e => e.effectId === 'WXK05-025-BURST');
  if (e1.action.steps?.[0]?.type !== 'LOOK_AND_REORDER') throw new Error('WXK05-025-E1 unexpected');
  const freeze = e1.action.steps[1];
  if (freeze?.type !== 'FREEZE') throw new Error('WXK05-025-E1 step1 unexpected');
  e1.action.steps = [
    { type: 'DRAW', owner: 'self', count: 2 },
    { type: 'LOOK_AND_REORDER', source: { location: 'hand', owner: 'self' }, count: 2, private: true, reorder: true,
      destination: { location: 'deck', owner: 'self', position: 'bottom' } },
    freeze,
  ];
  e1.parseStatus = 'MANUAL';
  if (lb.action.type !== 'DOWN' || lb.action.target.count !== 'ALL') throw new Error('WXK05-025-BURST unexpected');
  lb.action = {
    type: 'SEQUENCE',
    steps: [
      { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false } },
      { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' }, upToCount: false } },
    ],
  };
  lb.parseStatus = 'MANUAL';
  save(p, j);
  console.log('WXK05-025 patched');
}
