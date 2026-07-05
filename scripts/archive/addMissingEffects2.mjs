/**
 * addMissingEffects2.mjs
 * checkAllEffects.mjs の EFFECT_TYPE_MISSING_* で検出された欠落能力を追加する。
 *  - エンジンで表現可能なものは実装
 *  - 未対応機構（コインコスト・場→デッキ移動・ルリグ能力継承等）は型付きSTUBで明示
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(j), 'utf8');
const log = [];

// LIFE_BURST の前に効果を挿入（なければ末尾）
function addEffect(j, cardId, effect) {
  const efList = j[cardId];
  if (!efList) { log.push(`[WARN] ${cardId}: カードなし`); return; }
  if (efList.some(e => e.effectId === effect.effectId)) { log.push(`[SKIP] ${cardId}: ${effect.effectId} 追加済み`); return; }
  const burstIdx = efList.findIndex(e => e.effectType === 'LIFE_BURST');
  if (burstIdx >= 0) efList.splice(burstIdx, 0, effect);
  else efList.push(effect);
  log.push(`[OK] ${cardId}: ${effect.effectId} (${effect.effectType}) 追加`);
}

const stubEffect = (cardId, n, effectType, stubId, extra = {}) => ({
  effectId: `${cardId}-EX${n}`,
  effectType,
  ...(effectType === 'AUTO' ? { timing: extra.timing ?? ['ON_PLAY'] } : {}),
  ...(effectType === 'ACTIVATED' ? { timing: ['MAIN'] } : {}),
  action: { type: 'STUB', id: stubId },
  duration: effectType === 'CONTINUOUS' ? 'PERMANENT' : 'INSTANT',
  mandatory: true,
  parseStatus: 'STUB',
  ...extra.props,
});

// ============================================================
// effects_WX.json
// ============================================================
{
  const j = load('effects_WX.json');

  // WX15-041 アケチ:【自】アタック時、相手パワー7000以下を1体バニッシュ
  addEffect(j, 'WX15-041', {
    effectId: 'WX15-041-EX1', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
    action: { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { max: 7000 } }, upToCount: false } },
    duration: 'INSTANT', mandatory: true, parseStatus: 'AUTO',
  });

  // WX21-Re05 アレクサンド:【自】各アタックフェイズ開始時、他の赤シグニ1体に「バニッシュされない」付与
  addEffect(j, 'WX21-Re05', {
    effectId: 'WX21-Re05-EX1', effectType: 'AUTO', timing: ['ATTACK'],
    action: { type: 'GRANT_PROTECTION', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', color: '赤' } }, from: ['BANISH'], sourceOwner: 'opponent', duration: 'UNTIL_END_OF_TURN' },
    duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'AUTO',
  });

  // WX17-026 ギルガメジ:【常】下のカード1枚につきパワー+1000
  addEffect(j, 'WX17-026', {
    effectId: 'WX17-026-EX1', effectType: 'CONTINUOUS',
    action: { type: 'POWER_MODIFY_PER_STACK', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '武装の全知　ギルガメジ' } }, deltaPerCard: 1000 },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  // WX20-038 グスクル:【常】アサシン/ダブルクラッシュ +【常】相手効果でバニッシュされずダウンしない
  const gusukuru = { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '撃弩砲　グスクル' } };
  addEffect(j, 'WX20-038', {
    effectId: 'WX20-038-EX1', effectType: 'CONTINUOUS',
    action: { type: 'GRANT_KEYWORD', target: gusukuru, keyword: 'アサシン', duration: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });
  addEffect(j, 'WX20-038', {
    effectId: 'WX20-038-EX2', effectType: 'CONTINUOUS',
    action: { type: 'GRANT_KEYWORD', target: gusukuru, keyword: 'ダブルクラッシュ', duration: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });
  addEffect(j, 'WX20-038', {
    effectId: 'WX20-038-EX3', effectType: 'CONTINUOUS',
    action: { type: 'GRANT_PROTECTION', target: gusukuru, from: ['BANISH', 'DOWN'], sourceOwner: 'opponent', duration: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  // WX04-054 サーバントX: E1にカード名フィルタ追加、誤ってCONTINUOUSだったE2を【起】《無×3》サーチに置換
  {
    const efs = j['WX04-054'];
    if (efs?.[0]?.action?.target?.filter) {
      efs[0].action.target.filter.cardName = 'サーバント';
      log.push('[OK] WX04-054: E1 パワー修正対象に cardName=サーバント を追加');
    }
    if (efs?.[1]?.effectType === 'CONTINUOUS' && efs[1].action?.type === 'SEARCH') {
      efs[1] = {
        effectId: 'WX04-054-E2', effectType: 'ACTIVATED', timing: ['MAIN'],
        cost: { energy: [{ color: '無', count: 3 }] },
        action: {
          type: 'SEARCH', from: { location: 'deck', owner: 'self' },
          filter: { cardType: 'シグニ', cardName: 'サーバント' }, maxCount: 1,
          then: { type: 'SEQUENCE', steps: [{ type: 'REVEAL' }, { type: 'ADD_TO_HAND', owner: 'self' }] },
          afterSearch: { type: 'SHUFFLE_DECK', owner: 'self' },
        },
        duration: 'INSTANT', mandatory: false, parseStatus: 'AUTO',
      };
      log.push('[OK] WX04-054: E2 を ACTIVATED《無×3》サーチに修正');
    }
  }

  // WX17-045 FLASH:【自】このカードが手札からトラッシュに置かれたとき、相手シグニ1体をダウン
  addEffect(j, 'WX17-045', {
    effectId: 'WX17-045-EX1', effectType: 'AUTO', timing: ['ON_TRASH'],
    action: { type: 'DOWN', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } } },
    duration: 'INSTANT', mandatory: true, parseStatus: 'AUTO',
  });

  // WX09-Re01 リメンバ:【常】相手の凍結シグニは能力を失う（エンジン対応済みSTUB id）
  addEffect(j, 'WX09-Re01', stubEffect('WX09-Re01', 1, 'CONTINUOUS', 'FROZEN_LOSES_ABILITIES'));

  // WX05-011 ミルルン・ティコ:【常】対戦相手はスペルを使用できない
  addEffect(j, 'WX05-011', {
    effectId: 'WX05-011-EX1', effectType: 'CONTINUOUS',
    action: { type: 'BLOCK_ACTION', target: { type: 'PLAYER', owner: 'opponent', count: 1 }, actionId: 'USE_SPELL', until: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  // ── エンジン未対応 → 型付きSTUB ──
  addEffect(j, 'WX05-003', stubEffect('WX05-003', 1, 'CONTINUOUS', 'LRIG_TRASH_ACTIVATED_INHERIT'));
  addEffect(j, 'WX05-004', stubEffect('WX05-004', 1, 'CONTINUOUS', 'LRIG_TRASH_ACTIVATED_INHERIT'));
  addEffect(j, 'WX05-005', stubEffect('WX05-005', 1, 'CONTINUOUS', 'ALL_SIGNI_BECOME_BLACK'));
  addEffect(j, 'WX12-025', stubEffect('WX12-025', 1, 'CONTINUOUS', 'GUARD_LOSS_UNLESS_LRIG_STORY'));
  addEffect(j, 'WX12-034', stubEffect('WX12-034', 1, 'CONTINUOUS', 'GUARD_LOSS_UNLESS_LRIG_STORY'));
  addEffect(j, 'WX12-036', stubEffect('WX12-036', 1, 'CONTINUOUS', 'GUARD_LOSS_UNLESS_LRIG_STORY'));
  addEffect(j, 'WX15-032', stubEffect('WX15-032', 1, 'CONTINUOUS', 'TRIPLE_CRUSH_IN_CENTER'));

  save('effects_WX.json', j);
}

// ============================================================
// effects_misc.json
// ============================================================
{
  const j = load('effects_misc.json');

  // WDK06-C01 †ＱＡ†:【起】《ターン１回》デッキ上3枚トラッシュ：相手シグニ1体 −5000
  addEffect(j, 'WDK06-C01', {
    effectId: 'WDK06-C01-EX1', effectType: 'ACTIVATED', timing: ['MAIN'], usageLimit: 'once_per_turn',
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'DECK_CARD', owner: 'self', count: 3 } },
        { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: -5000 },
      ],
    },
    duration: 'UNTIL_END_OF_TURN', mandatory: false, parseStatus: 'AUTO',
  });

  // WDK06-R11 ハイメイル: 「このターン手札を2枚以上捨てていた場合」条件が未対応 → STUB
  addEffect(j, 'WDK06-R11', stubEffect('WDK06-R11', 1, 'AUTO', 'TURN_DISCARD_COUNT_CONDITION', { timing: ['ON_ATTACK_SIGNI'] }));

  // PR-461 タマヨリヒメ:【常】ルリグのダブルクラッシュは未対応 → STUB
  addEffect(j, 'PR-461', stubEffect('PR-461', 1, 'CONTINUOUS', 'LRIG_DOUBLE_CRUSH'));

  save('effects_misc.json', j);
}

// ============================================================
// effects_WX24_26.json
// ============================================================
{
  const j = load('effects_WX24_26.json');

  // WX24-P4-058 ジガネマル:【自】《ターン１回》バトルでバニッシュしたとき、次の相手ターン終了時までパワー+5000
  addEffect(j, 'WX24-P4-058', {
    effectId: 'WX24-P4-058-EX1', effectType: 'AUTO', timing: ['ON_SIGNI_BANISH_BATTLE'], usageLimit: 'once_per_turn',
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '中装　ジガネマル' } }, delta: 5000 },
    duration: 'NEXT_TURN', mandatory: true, parseStatus: 'PARTIAL',
  });

  // WX25-CP1-040 羽川ハスミ: 可変コスト（エナ3枚まで→同レベルバウンス）未対応 → STUB
  addEffect(j, 'WX25-CP1-040', {
    ...stubEffect('WX25-CP1-040', 1, 'ACTIVATED', 'VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE'),
    usageLimit: 'once_per_turn', mandatory: false,
  });

  // WX24-P1-043 ダンプカー: 下カードのレベル別能力付与 → STUB
  addEffect(j, 'WX24-P1-043', stubEffect('WX24-P1-043', 1, 'CONTINUOUS', 'UNDER_STACK_LEVEL_GRANTS'));

  save('effects_WX24_26.json', j);
}

// ============================================================
// effects_WXDi.json
// ============================================================
{
  const j = load('effects_WXDi.json');

  // WXDi-P04-040 イバラキドウジ:【自】アタックフェイズ開始時《無×3》支払わないかぎり自身をトラッシュ
  addEffect(j, 'WXDi-P04-040', {
    effectId: 'WXDi-P04-040-EX1', effectType: 'AUTO', timing: ['ATTACK'],
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'STUB', id: 'OPTIONAL_COST', costColors: ['無', '無', '無'] },
        {
          type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' },
          then: { type: 'SEQUENCE', steps: [] },
          else: { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '翠魔姫　イバラキドウジ' }, upToCount: false } },
        },
      ],
    },
    duration: 'INSTANT', mandatory: true, parseStatus: 'AUTO',
  });

  // WXDi-P07-081 センチュリオン:【起】《緑×2》自身を場からトラッシュ：相手レベル3以上をバニッシュ
  addEffect(j, 'WXDi-P07-081', {
    effectId: 'WXDi-P07-081-EX1', effectType: 'ACTIVATED', timing: ['MAIN'],
    cost: { energy: [{ color: '緑', count: 2 }] },
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '爆砲　センチュリオン' }, upToCount: false } },
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', level: { min: 3 } }, upToCount: false } },
      ],
    },
    duration: 'INSTANT', mandatory: false, parseStatus: 'AUTO',
  });

  // WXDi-P06-010 VOGUE3-EX サンガ:【起】《ゲーム１回》《緑×0》12000以上バニッシュ+エナ1枚回収
  addEffect(j, 'WXDi-P06-010', {
    effectId: 'WXDi-P06-010-EX1', effectType: 'ACTIVATED', timing: ['MAIN'], usageLimit: 'once_per_game',
    cost: { energy: [{ color: '緑', count: 0 }] },
    action: {
      type: 'SEQUENCE',
      steps: [
        { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { min: 12000 } }, upToCount: false } },
        { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1 } },
      ],
    },
    duration: 'INSTANT', mandatory: false, parseStatus: 'AUTO',
  });

  // WXDi-P10-070 枝折:【自】自ターン中に捨てられたとき、シグニ1体 +2000
  addEffect(j, 'WXDi-P10-070', {
    effectId: 'WXDi-P10-070-EX1', effectType: 'AUTO', timing: ['ON_TRASH'],
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'any', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: 2000 },
    duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'PARTIAL',
  });

  // ── エンジン未対応 → 型付きSTUB ──
  addEffect(j, 'WXDi-P06-034', stubEffect('WXDi-P06-034', 1, 'CONTINUOUS', 'BANISH_SUBSTITUTE_DOWN_AND_COST'));
  addEffect(j, 'WXDi-P13-089', stubEffect('WXDi-P13-089', 1, 'AUTO', 'TARGETED_BY_OPP_EXILE', { timing: ['ON_PLAY'] }));
  addEffect(j, 'WXDi-P14-056', { ...stubEffect('WXDi-P14-056', 1, 'ACTIVATED', 'COIN_COST_BANISH'), mandatory: false });
  addEffect(j, 'WXDi-P03-030', { ...stubEffect('WXDi-P03-030', 1, 'ACTIVATED', 'RETURN_LRIG_TO_LRIG_DECK'), usageLimit: 'once_per_game', mandatory: false });

  save('effects_WXDi.json', j);
}

// ============================================================
// effects_WXK.json
// ============================================================
{
  const j = load('effects_WXK.json');

  // WXK10-054 ピカトリクス:【自】バニッシュされたとき、トラッシュから＜ウェポン＞1枚を手札に
  // （「このシグニの下にあった」の追跡は未対応のため＜ウェポン＞全体から選択で近似）
  addEffect(j, 'WXK10-054', {
    effectId: 'WXK10-054-EX1', effectType: 'AUTO', timing: ['ON_BANISH'],
    action: { type: 'TRANSFER_TO_HAND', source: { type: 'TRASH_CARD', owner: 'self', count: 1, upToCount: true, filter: { cardType: 'シグニ', story: 'ウェポン' } } },
    duration: 'INSTANT', mandatory: true, parseStatus: 'PARTIAL',
  });

  // WXK11-038 トリアイナ: 場→デッキトップ移動は未対応 → STUB
  addEffect(j, 'WXK11-038', stubEffect('WXK11-038', 1, 'AUTO', 'FIELD_TO_DECK_TOP', { timing: ['ON_ATTACK_SIGNI'] }));

  save('effects_WXK.json', j);
}

console.log(log.join('\n'));
console.log(`\n完了: ${log.filter(l => l.startsWith('[OK]')).length}件適用 / WARN ${log.filter(l => l.includes('WARN')).length}件`);
