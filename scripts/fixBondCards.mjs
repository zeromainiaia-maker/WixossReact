/**
 * effects.json の絆カード誤パース修正スクリプト
 * - GRANT_KEYWORD "絆出"/"絆常"/"絆自"/"絆起" ステップを削除
 * - 絆アイコン効果を別エフェクトとして追加（kizunaIcon: true）
 */
import { readFileSync, writeFileSync } from 'fs';

const json = JSON.parse(readFileSync('./public/data/effects.json', 'utf8'));

const KIZUNA_KEYWORDS = new Set(['絆出', '絆常', '絆自', '絆起']);

// GRANT_KEYWORD "絆XXX" ステップをシーケンスから再帰的に除去
function removeKizunaGrantKeyword(action) {
  if (!action || typeof action !== 'object') return action;
  if (action.type === 'GRANT_KEYWORD' && KIZUNA_KEYWORDS.has(action.keyword)) return null;
  if (action.type === 'SEQUENCE') {
    const steps = action.steps.map(removeKizunaGrantKeyword).filter(Boolean);
    if (steps.length === 0) return null;
    if (steps.length === 1) return steps[0];
    return { ...action, steps };
  }
  if (action.type === 'CONDITIONAL') {
    return { ...action, then: removeKizunaGrantKeyword(action.then), else: action.else ? removeKizunaGrantKeyword(action.else) : undefined };
  }
  return action;
}

// 絆常時効果（シャドウ付与）を作成
function makeKizunaContinuousShadow(cardNum, oppTurnOnly = false) {
  const ac = oppTurnOnly
    ? { type: 'AND', conditions: [{ type: 'HAS_BOND' }, { type: 'TURN_OWNER', owner: 'opponent' }] }
    : { type: 'HAS_BOND' };
  return {
    effectId: `${cardNum}-KIZUNA-CONT`,
    effectType: 'CONTINUOUS',
    kizunaIcon: true,
    activeCondition: ac,
    action: {
      type: 'GRANT_KEYWORD',
      target: { type: 'SIGNI', owner: 'self', count: 1 },
      keyword: 'シャドウ',
      duration: 'PERMANENT',
    },
    duration: 'PERMANENT',
    mandatory: true,
    parseStatus: 'MANUAL',
  };
}

// 絆出時効果（デッキ上7枚→1枚手札）を作成
function makeKizunaOnPlay(cardNum, cost = undefined) {
  const eff = {
    effectId: `${cardNum}-KIZUNA-PLAY`,
    effectType: 'AUTO',
    timing: ['ON_PLAY'],
    kizunaIcon: true,
    condition: { type: 'HAS_BOND' },
    action: {
      type: 'STUB',
      id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM',
      revealPickParams: { pickCount: 1, restDest: 'deck_bottom', then: 'hand' },
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  };
  if (cost) eff.cost = cost;
  return eff;
}

// ===== 各カードの修正 =====

// WXDi-CP02-026 浦和ハナコ[禁じられた遊びを始めましょう]
// 【出】GRANT_LRIG_ABILITY+5000 (E1はそのまま誤パースを維持)
// 【出】トラッシュからガードアイコンシグニ→手札 (E2から絆ステップ削除)
// 【絆出】デッキ上7枚→1枚手札 (新E3)
{
  const effs = json['WXDi-CP02-026'];
  effs[1] = { ...effs[1], action: removeKizunaGrantKeyword(effs[1].action) };
  effs.push(makeKizunaOnPlay('WXDi-CP02-026'));
}

// WXDi-CP02-027 浦和ハナコ(水着)
// 【出】bounce (E1はそのまま)
// 【出】《白》《無》《無》 REMOVE_ABILITIES (E2から絆ステップ削除)
// 【絆出】デッキ上7枚→1枚手札 (新E3)
{
  const effs = json['WXDi-CP02-027'];
  effs[1] = { ...effs[1], action: removeKizunaGrantKeyword(effs[1].action) };
  effs.push(makeKizunaOnPlay('WXDi-CP02-027'));
}

// WXDi-CP02-028 阿慈谷ヒフミ[助けて、ペロロ様！]
// 【出】クラフト場に出す (E1から絆ステップ削除)
// 【絆出】デッキ上7枚→1枚手札 (新E2)
{
  const effs = json['WXDi-CP02-028'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaOnPlay('WXDi-CP02-028'));
}

// WXDi-CP02-029 阿慈谷ヒフミ(水着)
// 【出】《無》《無》《無》クラフト場 (E1から絆ステップ削除)
// 【絆出】デッキ上7枚→1枚手札 (新E2)
{
  const effs = json['WXDi-CP02-029'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaOnPlay('WXDi-CP02-029'));
}

// WXDi-CP02-060 陸八魔アル
// 【自】アタック時 (E1はそのまま)
// 【出】デッキ上3枚trash (E2から絆ステップ削除)
// 【絆常】シャドウ（レベル2以下のシグニ）(新CONT)
{
  const effs = json['WXDi-CP02-060'];
  effs[1] = { ...effs[1], action: removeKizunaGrantKeyword(effs[1].action) };
  effs.push(makeKizunaContinuousShadow('WXDi-CP02-060'));
}

// WXDi-CP02-062 黒舘ハルナ
// 【自】アタックフェイズ開始時 (E1から絆ステップ削除)
// 【絆出】《黒》パワー2倍マイナス (新KIZUNA-PLAY - stubとして)
{
  const effs = json['WXDi-CP02-062'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push({
    effectId: 'WXDi-CP02-062-KIZUNA-PLAY',
    effectType: 'AUTO',
    timing: ['ON_PLAY'],
    kizunaIcon: true,
    condition: { type: 'HAS_BOND' },
    cost: { energy: [{ color: '黒', count: 1 }] },
    action: { type: 'STUB', id: 'DOUBLE_OWN_POWER_MINUS' },
    duration: 'UNTIL_END_OF_TURN',
    mandatory: false,
    parseStatus: 'MANUAL',
  });
}

// WXDi-CP02-063 下江コハル
// 【自】ターン終了時 (E1から絆ステップ削除)
// 【絆常】《相手ターン》シャドウ（レベル2以下）(新CONT)
{
  const effs = json['WXDi-CP02-063'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WXDi-CP02-063', true));
}

// WXDi-CP02-065 鷲見セリナ
// 【自】ターン終了時 (E1から絆ステップ削除)
// 【絆常】《相手ターン》シャドウ（レベル2以下）(新CONT)
{
  const effs = json['WXDi-CP02-065'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WXDi-CP02-065', true));
}

// WXDi-CP02-083 勇美カエデ
// 【出】手札→エナ: 他ブルアカ power+3000 (E1から絆ステップ削除)
// 【絆常】シャドウ（パワー8000以下）(新CONT)
{
  const effs = json['WXDi-CP02-083'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WXDi-CP02-083'));
}

// WXDi-CP02-087 水羽ミモリ
// 【出】条件付きエナから場 (E1から絆ステップ削除)
// 【絆常】シャドウ（パワー8000以下）(新CONT)
{
  const effs = json['WXDi-CP02-087'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WXDi-CP02-087'));
}

// WXDi-CP02-091 春日ツバキ
// 【出】手札→エナ: power+4000 (E1から絆ステップ削除)
// 【絆常】シャドウ（パワー8000以下）(新CONT)
{
  const effs = json['WXDi-CP02-091'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WXDi-CP02-091'));
}

// WX25-CP1-012 錠前サオリ
// E1 OK
// E2: 非絆【起】bounce (E2から絆ステップ削除)
// 【絆起】《ゲーム１回》《白×0》: デッキ上5枚→シグニ2枚まで場 (新KIZUNA-ACT)
{
  const effs = json['WX25-CP1-012'];
  effs[1] = { ...effs[1], action: removeKizunaGrantKeyword(effs[1].action) };
  effs.push({
    effectId: 'WX25-CP1-012-KIZUNA-ACT',
    effectType: 'ACTIVATED',
    timing: ['MAIN'],
    kizunaIcon: true,
    condition: { type: 'HAS_BOND' },
    cost: { energy: [{ color: '白', count: 0 }] },
    usageLimit: 'once_per_game',
    action: {
      type: 'STUB',
      id: 'REVEAL_PICK_HAND_SHUFFLE_BOTTOM',
      revealPickParams: { pickCount: 2, restDest: 'deck_bottom', then: 'hand' },
    },
    duration: 'INSTANT',
    mandatory: false,
    parseStatus: 'MANUAL',
  });
}

// WX25-CP1-046 不破レンゲ
// E1 OK (ON_TURN_END)
// E2: アタック時+ランサー (E2から絆ステップ削除)
// 【絆常】シャドウ（レベル3以上のシグニ）(新CONT)
{
  const effs = json['WX25-CP1-046'];
  effs[1] = { ...effs[1], action: removeKizunaGrantKeyword(effs[1].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-046'));
}

// WX25-CP1-050 栗村アイリ
// E1: アタック時BLOCK_ACTION (E1から絆ステップ削除)
// 【絆常】《相手ターン》シャドウ（レベル2以下）(新CONT)
{
  const effs = json['WX25-CP1-050'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-050', true));
}

// WX25-CP1-051 円堂シミコ
// E1: ターン終了時 GRANT_KEYWORD シャドウ to other signi (これは絆なし、正常効果)
// ただし絆ステップが混入していればそれを除去
// 【絆常】《相手ターン》シャドウ（レベル2以下）(新CONT)
{
  const effs = json['WX25-CP1-051'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-051', true));
}

// WX25-CP1-052 若葉ヒナタ
// E1: アタックフェイズ開始時 bounce (E1から絆ステップ削除)
// 【絆常】《相手ターン》シャドウ（レベル2以下）(新CONT)
{
  const effs = json['WX25-CP1-052'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-052', true));
}

// WX25-CP1-072 河和シズコ(水着)
// E1: ターン終了時 POWER_MODIFY (E1から絆ステップ削除)
// 【絆常】シャドウ（パワー8000以下）(新CONT)
{
  const effs = json['WX25-CP1-072'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-072'));
}

// WX25-CP1-074 佐城トモエ
// E1: ON_PLAY 他ブルアカ+能力付与 (E1から絆ステップ削除)
// 【絆常】シャドウ（パワー8000以下）(新CONT)
{
  const effs = json['WX25-CP1-074'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-074'));
}

// WX25-CP1-078 天見ノドカ
// E1: アタックフェイズ開始時 GRANT_KEYWORD シャドウ to target (E1から絆ステップ削除)
// 【絆常】シャドウ（パワー8000以下）(新CONT)
{
  const effs = json['WX25-CP1-078'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push(makeKizunaContinuousShadow('WX25-CP1-078'));
}

// WX25-CD1-17 砂狼シロコ(水着)
// E1: ON_PLAY (E1から絆ステップ削除)
// 【絆自】アタックフェイズ開始時: エナからブルアカ1枚trash→opp signi POWER_SET 3000 (新KIZUNA-AUTO)
{
  const effs = json['WX25-CD1-17'];
  effs[0] = { ...effs[0], action: removeKizunaGrantKeyword(effs[0].action) };
  effs.push({
    effectId: 'WX25-CD1-17-KIZUNA-AUTO',
    effectType: 'AUTO',
    timing: ['ATTACK'],
    kizunaIcon: true,
    condition: { type: 'HAS_BOND' },
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['緑', '無'] },
        {
          type: 'POWER_SET',
          target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } },
          value: 3000,
        },
      ],
    },
    duration: 'UNTIL_END_OF_TURN',
    mandatory: false,
    parseStatus: 'MANUAL',
  });
}

// ===== 検証 =====
const bondKwCards = Object.entries(json).filter(([k, effs]) =>
  JSON.stringify(effs).match(/"keyword":"絆(出|常|自|起)"/)
);
if (bondKwCards.length > 0) {
  console.log('警告: まだ絆KWが残っているカード:', bondKwCards.map(([k]) => k).join(', '));
} else {
  console.log('✓ 絆KWの誤パースはすべて除去されました');
}

const kizunaCards = Object.keys(json).filter(k => JSON.stringify(json[k]).includes('"kizunaIcon":true'));
console.log(`絆アイコン効果付きカード: ${kizunaCards.length}枚`);
kizunaCards.forEach(k => console.log(' -', k));

writeFileSync('./public/data/effects.json', JSON.stringify(json, null, 2), 'utf8');
console.log('完了: effects.json を更新しました');
