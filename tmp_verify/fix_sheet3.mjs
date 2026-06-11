// Sheet3タイミング不一致の実欠落・パース誤り15件の修正
import fs from 'fs';
import path from 'path';

const FILES = ['effects_WX.json','effects_WXDi.json','effects_WX24_26.json','effects_WXK.json','effects_misc.json'];
const data = {};
for (const f of FILES) data[f] = JSON.parse(fs.readFileSync(path.resolve('public/data', f), 'utf8'));

function findFile(cardNum) {
  for (const f of FILES) if (data[f][cardNum]) return f;
  throw new Error(`${cardNum} not found`);
}
function effs(cardNum) { return data[findFile(cardNum)][cardNum]; }

// ── WXEX1-35 ジャンヌ: 【常】欠落（ライズ3体でアーツ耐性付与）→ STUB
effs('WXEX1-35').unshift({
  effectId: 'WXEX1-35-E1', effectType: 'CONTINUOUS',
  action: { type: 'STUB', id: 'GRANT_ABILITY_INNER_TEXT' },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXEX2-03 ウトゥルス: 【自】欠落（各アタックフェイズ開始時に能力付与）→ STUB
effs('WXEX2-03').unshift({
  effectId: 'WXEX2-03-E1', effectType: 'AUTO', timing: ['ON_ATTACK_PHASE_START'],
  action: { type: 'STUB', id: 'GRANT_QUOTED_ABILITY' },
  duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXEX2-61 アルジュナ: 【自】欠落（アタック時トラッシュから武勇をライズ下に）
effs('WXEX2-61').unshift({
  effectId: 'WXEX2-61-E1', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
  action: { type: 'PLACE_UNDER_SIGNI', source: 'trash', count: 1, upToCount: true, filter: { cardType: 'シグニ', story: '武勇', level: { max: 3 } } },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXEX2-84 真名の巫女マユ: 【出】欠落（ルリグ回収+アーツ2枚戻し）→ STUB
effs('WXEX2-84').unshift({
  effectId: 'WXEX2-84-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'LRIG_TRASH_TO_UNDER_AND_RETURN_ARTS' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXK01-001 レイラ＝デッドエンド: 【常】欠落（ドライブ状態シグニ+3000/ダブクラ）→ STUB
effs('WXK01-001').unshift({
  effectId: 'WXK01-001-E1', effectType: 'CONTINUOUS',
  action: { type: 'STUB', id: 'DRIVE_SIGNI_POWER_DOUBLE_CRASH' },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXK01-028 ママ MODE LOVE: 【出】《緑》《無》欠落（デッキトップをライフへ）
{
  const e = effs('WXK01-028');
  e.splice(2, 0, {
    effectId: 'WXK01-028-E2B', effectType: 'AUTO', timing: ['ON_PLAY'],
    cost: { energy: [{ color: '緑', count: 1 }, { color: '無', count: 1 }] },
    action: { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true },
    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WXK01-036 エフワン: 【ドライブ常】アサシン + 【常】自ターン赤+2000 が欠落
{
  const e = effs('WXK01-036');
  e.unshift(
    {
      effectId: 'WXK01-036-E0', effectType: 'CONTINUOUS',
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'アサシン', duration: 'PERMANENT' },
      duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
    },
    {
      effectId: 'WXK01-036-E1', effectType: 'CONTINUOUS',
      activeCondition: { type: 'TURN_OWNER', owner: 'self' },
      action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', color: '赤' } }, delta: 2000 },
      duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
    },
  );
}

// ── WXK01-041 MIRACLE: E1は本体効果（3択）であるべき。誤マージされた【自】回収を分離
{
  const e = effs('WXK01-041');
  const e1 = e.find(x => x.effectId === 'WXK01-041-E1');
  e1.action = { type: 'CHOOSE', choose_count: 1, from_count: 3, choices: [
    { choiceId: 'c0', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
    { choiceId: 'c1', label: '対戦相手は手札を1枚捨てる', action: { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'opponent', count: 1 } } },
    { choiceId: 'c2', label: '対戦相手のすべてのシグニを凍結する', action: { type: 'FREEZE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } } } },
  ] };
  e1.parseStatus = 'MANUAL';
  e.splice(1, 0, {
    effectId: 'WXK01-041-E2', effectType: 'AUTO', timing: ['ON_TURN_END'],
    action: { type: 'STUB', id: 'ARTS_SELF_RECYCLE_ON_TRIGGER', costColors: ['青'] },
    duration: 'INSTANT', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WXK03-003A 夢限-P-: 【常】欠落（キーを好きな枚数場に出せる）→ STUB
effs('WXK03-003A').unshift({
  effectId: 'WXK03-003A-E1', effectType: 'CONTINUOUS',
  action: { type: 'STUB', id: 'UNLIMITED_KEYS' },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXK03-005 フラクタル・ケージ: E1に誤マージされた【自】を分離
{
  const e1 = effs('WXK03-005')[0];
  const merged = e1.action.steps.pop(); // ADD_TO_FIELD（【自】の本体）
  merged.source.filter = { cardType: 'シグニ', story: '精元' };
  effs('WXK03-005').push({
    effectId: 'WXK03-005-E2', effectType: 'AUTO', timing: ['ON_EXCEED_COST'],
    action: merged,
    duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
  });
}

// ── WXK03-021 EXカリバン: 【自】欠落（アタックフェイズ開始時・手札3枚捨て条件バニッシュ）→ STUB
effs('WXK03-021').unshift({
  effectId: 'WXK03-021-E1', effectType: 'AUTO', timing: ['ON_ATTACK_PHASE_START'],
  action: { type: 'STUB', id: 'BANISH_IF_DISCARDED_3_THIS_TURN' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXK04-003 エルドラ オーバークロック: 【自】欠落（アクセ装着時3択）
effs('WXK04-003').unshift({
  effectId: 'WXK04-003-E1', effectType: 'AUTO', timing: ['ON_ACCE_ATTACH'],
  action: { type: 'CHOOSE', choose_count: 1, from_count: 3, choices: [
    { choiceId: 'c0', label: '対戦相手のシグニ1体をダウンする', action: { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } } },
    { choiceId: 'c1', label: 'カードを1枚引く', action: { type: 'DRAW', owner: 'self', count: 1 } },
    { choiceId: 'c2', label: '対戦相手のシグニ1体のパワーを-5000する', action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, delta: -5000 } },
  ] },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXK04-015 鎮護国禍: 【起】欠落（キー自壊で赤シグニにダブクラ）+ E1のchoose_count修正(4つから2つ)
{
  const e = effs('WXK04-015');
  const e1 = e.find(x => x.effectId === 'WXK04-015-E1');
  e1.action.choose_count = 2;
  e.push({
    effectId: 'WXK04-015-E2', effectType: 'ACTIVATED', timing: ['MAIN'],
    action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', color: '赤' } }, keyword: 'ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN' },
    duration: 'UNTIL_END_OF_TURN', mandatory: false, parseStatus: 'MANUAL',
  });
}

// ── WXK05-001 再会の巫女マユ: 【出】欠落（相手に手札2/エナ3/シグニ1トラッシュの選択強制）→ STUB
effs('WXK05-001').unshift({
  effectId: 'WXK05-001-E1', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'STUB', id: 'OPP_PUNISHER_CHOICE' },
  duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL',
});

// ── WXK05-035 オニマル: 【常】欠落（下のカード条件で自己強化）→ STUB
effs('WXK05-035').unshift({
  effectId: 'WXK05-035-E1', effectType: 'CONTINUOUS',
  action: { type: 'STUB', id: 'SELF_BUFF_BY_UNDER_CARDS' },
  duration: 'PERMANENT', mandatory: true, parseStatus: 'MANUAL',
});

for (const f of FILES) fs.writeFileSync(path.resolve('public/data', f), JSON.stringify(data[f]));
console.log('Sheet3 fixes applied');
