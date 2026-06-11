/**
 * addMissingEffects3.mjs
 * EFFECT_TYPE_MISSING_CONTINUOUS の残り5枚を処理。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const load = (f) => JSON.parse(fs.readFileSync(path.join(root, 'public/data', f), 'utf8'));
const save = (f, j) => fs.writeFileSync(path.join(root, 'public/data', f), JSON.stringify(j), 'utf8');
const log = [];

function addEffect(j, cardId, effect) {
  const efList = j[cardId];
  if (!efList) { log.push(`[WARN] ${cardId}: カードなし`); return; }
  if (efList.some(e => e.effectId === effect.effectId)) { log.push(`[SKIP] ${cardId}`); return; }
  const burstIdx = efList.findIndex(e => e.effectType === 'LIFE_BURST');
  if (burstIdx >= 0) efList.splice(burstIdx, 0, effect);
  else efList.push(effect);
  log.push(`[OK] ${cardId}: ${effect.effectId} 追加`);
}

{
  const j = load('effects_WXDi.json');

  // コロンブス:【常】ルリグデッキ1枚以下ならパワー+3000
  addEffect(j, 'WXDi-P04-036', {
    effectId: 'WXDi-P04-036-EX1', effectType: 'CONTINUOUS',
    activeCondition: { type: 'COUNT_THRESHOLD', location: 'lrig_deck', owner: 'self', operator: 'lte', value: 1 },
    action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '蒼将姫　コロンブス' } }, delta: 3000 },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  // タマモゼン:【常】《相手ターン》シャドウを得る
  addEffect(j, 'WXDi-P05-033', {
    effectId: 'WXDi-P05-033-EX1', effectType: 'CONTINUOUS',
    activeCondition: { type: 'TURN_OWNER', owner: 'opponent' },
    action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: '幻怪姫　タマモゼン' } }, keyword: 'シャドウ', duration: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  // H2O:【常】《相手ターン》下カードがあるとき場を離れる代わりに下を全トラッシュ（置換効果・未対応）
  addEffect(j, 'WXDi-P05-038', {
    effectId: 'WXDi-P05-038-EX1', effectType: 'CONTINUOUS',
    action: { type: 'STUB', id: 'LEAVE_FIELD_SUBSTITUTE_TRASH_UNDER' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'STUB',
  });

  // ララ・ルー:【常】対戦相手の効果によって新たに能力を得られない（エンジン対応済みSTUB id）
  addEffect(j, 'WXDi-P06-057', {
    effectId: 'WXDi-P06-057-EX1', effectType: 'CONTINUOUS',
    action: { type: 'STUB', id: 'PREVENT_ABILITY_CHANGE_BY_OPP' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  save('effects_WXDi.json', j);
}

{
  const j = load('effects_WXK.json');

  // トレインキャノン:【常】アサシン/ダブルクラッシュ
  const train = { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', cardName: 'コードライド　トレインキャノン' } };
  addEffect(j, 'WXK11-053', {
    effectId: 'WXK11-053-EX1', effectType: 'CONTINUOUS',
    action: { type: 'GRANT_KEYWORD', target: train, keyword: 'アサシン', duration: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });
  addEffect(j, 'WXK11-053', {
    effectId: 'WXK11-053-EX2', effectType: 'CONTINUOUS',
    action: { type: 'GRANT_KEYWORD', target: train, keyword: 'ダブルクラッシュ', duration: 'PERMANENT' },
    duration: 'PERMANENT', mandatory: true, parseStatus: 'AUTO',
  });

  save('effects_WXK.json', j);
}

console.log(log.join('\n'));
