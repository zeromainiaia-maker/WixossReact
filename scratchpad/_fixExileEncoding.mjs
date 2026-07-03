// 場シグニ「ゲームから除外」が TRASH{TRASH_CARD,opponent}(no-op) に誤エンコードされた12件を是正。
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
const root = process.cwd();
const files = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];

const DRY = process.argv.includes('--dry');
// EXILE ノード生成
const exileOppSigni = () => ({ type: 'EXILE', target: { type: 'SIGNI', owner: 'opponent', count: 1 } });
const exileSelfThis = () => ({ type: 'EXILE', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } } });
const exileOppTrigger = () => ({ type: 'EXILE', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { isTriggerSource: true } } });
const exileSelfSpellTrash = () => ({ type: 'EXILE', target: { type: 'TRASH_CARD', owner: 'self', count: 2, upToCount: true, filter: { cardType: 'スペル' } } });
const deckMillOpp2 = () => ({ type: 'TRASH', target: { type: 'DECK_CARD', owner: 'opponent', count: 2 } });

// effectId → 変換関数（effを受け取り破壊的に修正）
const T = {
  // 単独 action = TRASH → EXILE(opp signi)
  'WXDi-P13-089-E3': e => { e.action = exileOppSigni(); },
  'WXDi-P11-010B-E2': e => { e.action = exileOppSigni(); },
  'WXK04-035-E1': e => { e.action = exileOppSigni(); },
  // trigger-source 相対
  'WXDi-P13-089-E2': e => { e.action = exileOppTrigger(); },
  // 自身(thisCardOnly)除外
  'WXDi-CP02-TK02A-E2': e => { e.action = exileSelfThis(); },
  'WXDi-CP02-TK03B-E3': e => { e.action = exileSelfThis(); },
  // 自身＋相手（SEQUENCE 2つのEXILE）
  'WX21-027-E1': e => { e.action = { type: 'SEQUENCE', steps: [exileOppSigni(), exileSelfThis()] }; },
  'WX24-P3-TK1A-E3': e => { e.action = { type: 'SEQUENCE', steps: [exileOppSigni(), exileSelfThis()] }; },
  // SEQUENCE 内 step の TRASH_CARD,opp を EXILE(opp signi) に
  'WXDi-P16-001B-E1': e => { const s = e.action.steps.find(x => x.type === 'TRASH' && x.target?.type === 'TRASH_CARD'); Object.assign(s, exileOppSigni()); delete s.target.owner; s.target = exileOppSigni().target; },
  'WXK09-015-E3': e => { const s = e.action.steps.find(x => x.type === 'TRASH' && x.target?.type === 'TRASH_CARD'); s.type = 'EXILE'; s.target = exileOppSigni().target; },
  // 外れ①: 相手デッキ mill 2枚（TRASH_CARD→DECK_CARD count2）
  'WXDi-P04-016-E3': e => { const s = e.action.steps.find(x => x.type === 'TRASH' && x.target?.type === 'TRASH_CARD'); s.target = deckMillOpp2().target; },
  // 外れ②: 自トラッシュのスペルを2枚まで除外（TRASH{TRASH_CARD,opp,2}→EXILE{TRASH_CARD,self,spell}）
  'WXDi-P05-043-E1': e => { const s = e.action.steps.find(x => x.type === 'TRASH' && x.target?.type === 'TRASH_CARD'); s.type = 'EXILE'; s.target = exileSelfSpellTrash().target; },
};

let done = 0; const hit = new Set();
for (const f of files) {
  const p = join(root, 'public/data', f);
  const raw = readFileSync(p, 'utf8');
  const eol = (raw.match(/(\r?\n)$/) || [, ''])[1];
  const body = eol ? raw.slice(0, -eol.length) : raw;
  const data = JSON.parse(body);
  if (JSON.stringify(data) !== body) { console.error(`⚠ ${f} 往復不安定 中断`); process.exit(1); }
  let changed = false;
  for (const [num, effs] of Object.entries(data)) {
    for (const e of effs) {
      if (T[e.effectId]) { T[e.effectId](e); done++; hit.add(e.effectId); changed = true; }
    }
  }
  if (changed && !DRY) writeFileSync(p, JSON.stringify(data) + eol, 'utf8');
  console.log(`${f}: ${changed ? '更新' : '変更なし'}`);
}
console.log(`\n適用 ${done}/${Object.keys(T).length}`);
const miss = Object.keys(T).filter(id => !hit.has(id));
if (miss.length) console.log('⚠ 未適用:', miss.join(', '));
console.log(DRY ? '[DRY]' : '[書込完了]');
