// 正規化拡張で判明した「飲み込まれ効果」の残12枚＝欠落効果を MANUAL 挿入（既存 effectId 温存・続き20）。
// MANUAL を含むカードは parserWorklist/buildEffectsJson からカード単位で保全されるため held 25 に復帰する。
import fs from 'fs';
const F = {
  WX: 'public/data/effects_WX.json',
  WXDi: 'public/data/effects_WXDi.json',
  W2426: 'public/data/effects_WX24_26.json',
  WXK: 'public/data/effects_WXK.json',
  misc: 'public/data/effects_misc.json',
};
const J = Object.fromEntries(Object.entries(F).map(([k, p]) => [k, JSON.parse(fs.readFileSync(p, 'utf8'))]));
const ins = (j, id, afterEffectId, eff) => {
  const arr = j[id];
  if (!arr) throw new Error('no card ' + id);
  if (arr.some(e => e.effectId === eff.effectId)) throw new Error('dup ' + eff.effectId);
  const i = arr.findIndex(e => e.effectId === afterEffectId);
  if (i < 0) throw new Error('anchor not found ' + afterEffectId);
  arr.splice(i + 1, 0, eff);
};
const M = (o) => ({ duration: 'INSTANT', mandatory: true, parseStatus: 'MANUAL', ...o });

// 1. WX20-038 撃弩砲グスクル: 【常】ダブクラ＋【常】相手効果でバニッシュされずダウンしない（旧addMissingEffects2の再収録）
ins(J.WX, 'WX20-038', 'WX20-038-E1', M({
  effectId: 'WX20-038-E1b', effectType: 'CONTINUOUS', duration: 'PERMANENT',
  action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'ダブルクラッシュ', duration: 'PERMANENT' },
}));
ins(J.WX, 'WX20-038', 'WX20-038-E1b', M({
  effectId: 'WX20-038-E1c', effectType: 'CONTINUOUS', duration: 'PERMANENT',
  action: { type: 'GRANT_PROTECTION', target: { type: 'SIGNI', owner: 'self', count: 1 }, from: ['BANISH', 'DOWN'], sourceOwner: 'opponent', duration: 'PERMANENT' },
}));

// 2. WXK01-028 ママMODE LOVE: 【出】《緑》《無》デッキ一番上をライフクロスに
ins(J.WXK, 'WXK01-028', 'WXK01-028-E2', M({
  effectId: 'WXK01-028-E2b', effectType: 'AUTO', timing: ['ON_PLAY'], mandatory: false,
  cost: { energy: [{ color: '緑', count: 1 }, { color: '無', count: 1 }] },
  action: { type: 'ADD_TO_LIFE', owner: 'self', count: 1, fromTop: true },
}));

// 3. WXK01-074 タクシー: E1誤エンコード是正（常時+5000→【ドライブ常】ダブクラ）＋【自】ドライブ状態化時+5000
{
  const e1 = J.WXK['WXK01-074'].find(e => e.effectId === 'WXK01-074-E1');
  if (e1.action?.type !== 'POWER_MODIFY') throw new Error('WXK01-074-E1 unexpected');
  e1.action = { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1 }, keyword: 'ダブルクラッシュ', duration: 'PERMANENT' };
  e1.activeCondition = { type: 'IS_DRIVE_STATE' };
  e1.parseStatus = 'MANUAL';
}
ins(J.WXK, 'WXK01-074', 'WXK01-074-E1', M({
  effectId: 'WXK01-074-E1b', effectType: 'AUTO', timing: ['ON_SIGNI_BECOMES_DRIVE'], duration: 'UNTIL_END_OF_TURN',
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: 5000 },
}));

// 4. WXK04-015 鎮護国禍: 【起】キーをルリグトラッシュ：赤シグニ1体にダブクラ付与EOT（キー自壊コストは既存E系と同じく近似省略）
ins(J.WXK, 'WXK04-015', 'WXK04-015-E1', M({
  effectId: 'WXK04-015-E1b', effectType: 'ACTIVATED', timing: ['MAIN'], mandatory: false,
  action: { type: 'GRANT_KEYWORD', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ', color: '赤' } }, keyword: 'ダブルクラッシュ', duration: 'UNTIL_END_OF_TURN' },
}));

// 5. WDK06-R09: 【起】《ターン1回》《アタックフェイズ》《緑×0》シグニ1体+2000 EOT
ins(J.misc, 'WDK06-R09', 'WDK06-R09-E2', M({
  effectId: 'WDK06-R09-E2b', effectType: 'ACTIVATED', timing: ['ATTACK_ARTS'], usageLimit: 'once_per_turn', mandatory: false,
  cost: { energy: [{ color: '緑', count: 0 }] }, duration: 'UNTIL_END_OF_TURN',
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'any', count: 1 }, delta: 2000 },
}));

// 6. WXDi-P03-016: 【出】ルリグが「【常】シグニ+5000」をEOTまで得る（平坦化近似）
ins(J.WXDi, 'WXDi-P03-016', 'WXDi-P03-016-E1', M({
  effectId: 'WXDi-P03-016-E1b', effectType: 'AUTO', timing: ['ON_PLAY'], duration: 'UNTIL_END_OF_TURN',
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ' } }, delta: 5000 },
}));

// 7. WXDi-P06-010: 【出】エナチャ2 ＋ 【起】《ゲーム1回》《緑×0》12000以上バニッシュ+エナ1枚回収
ins(J.WXDi, 'WXDi-P06-010', 'WXDi-P06-010-E1', M({
  effectId: 'WXDi-P06-010-E1b', effectType: 'AUTO', timing: ['ON_PLAY'],
  action: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 2 },
}));
ins(J.WXDi, 'WXDi-P06-010', 'WXDi-P06-010-E1b', M({
  effectId: 'WXDi-P06-010-E1c', effectType: 'ACTIVATED', timing: ['MAIN'], usageLimit: 'once_per_game', mandatory: false,
  cost: { energy: [{ color: '緑', count: 0 }] },
  action: { type: 'SEQUENCE', steps: [
    { type: 'BANISH', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', powerRange: { min: 12000 } }, upToCount: false } },
    { type: 'TRANSFER_TO_HAND', source: { type: 'ENERGY_CARD', owner: 'self', count: 1 } },
  ] },
}));

// 8. WXDi-P13-050: 【出】場に《コード・ピルルク・極》→デッキ上5枚からスペル1枚を公開し手札・残り好きな順で下
ins(J.WXDi, 'WXDi-P13-050', 'WXDi-P13-050-E1', M({
  effectId: 'WXDi-P13-050-E1b', effectType: 'AUTO', timing: ['ON_PLAY'],
  activeCondition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: 'コード・ピルルク・極' } },
  action: { type: 'REVEAL_AND_PICK', owner: 'self', revealCount: 5, filter: { cardType: 'スペル' }, pickCount: 1, pickUpTo: true, pickNoun: 'スペル',
    then: { type: 'ADD_TO_HAND', owner: 'self' }, remainder: { location: 'deck', position: 'bottom' } },
}));

// 9. WX24-P2-049: 【自】バトルでバニッシュ時、白シグニ1体を次の相手ターン終了時までバニッシュしたシグニのパワー分+（動的値＝未対応STUB）
ins(J.W2426, 'WX24-P2-049', 'WX24-P2-049-E1', M({
  effectId: 'WX24-P2-049-E1b', effectType: 'AUTO', timing: ['ON_SIGNI_BANISH_BATTLE'],
  action: { type: 'STUB', id: 'POWER_PLUS_BANISHED_POWER' },
}));

// 10. WX24-P4-058 ジガネマル: 【自】《ターン1回》バトルバニッシュ時、次の相手ターン終了時までこのシグニ+5000
ins(J.W2426, 'WX24-P4-058', 'WX24-P4-058-E1', M({
  effectId: 'WX24-P4-058-E1b', effectType: 'AUTO', timing: ['ON_SIGNI_BANISH_BATTLE'], usageLimit: 'once_per_turn', duration: 'UNTIL_OPP_TURN_END',
  action: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { thisCardOnly: true } }, delta: 5000, duration: 'UNTIL_OPP_TURN_END' },
}));

// 11. WX25-P1-054: 【クロス自】《ターン1回》ヘブン時、場に《合炎奇炎　タマヨリヒメ之参》→エナ＜ウェポン＞2枚trash任意→ダメージ
ins(J.W2426, 'WX25-P1-054', 'WX25-P1-054-E1', M({
  effectId: 'WX25-P1-054-E1b', effectType: 'AUTO', timing: ['ON_HEAVEN'], usageLimit: 'once_per_turn',
  activeCondition: { type: 'HAS_CARD_IN_FIELD', owner: 'self', filter: { cardName: '合炎奇炎　タマヨリヒメ之参' } },
  action: { type: 'SEQUENCE', steps: [
    { type: 'STUB', id: 'OPTIONAL_TRASH_ENERGY_CLASS' },
    { type: 'CONDITIONAL', condition: { type: 'IS_MY_TURN' }, then: { type: 'LIFE_CRASH', owner: 'opponent', count: 1, triggerBurst: true } },
  ] },
}));

// 12. WX25-CP1-040 羽川ハスミ: 【起】《ターン1回》エナ＜ブルアカ＞3枚まで→同レベルバウンス（可変コスト未対応STUB・旧録再収録）
ins(J.W2426, 'WX25-CP1-040', 'WX25-CP1-040-E1', M({
  effectId: 'WX25-CP1-040-E1b', effectType: 'ACTIVATED', timing: ['MAIN'], usageLimit: 'once_per_turn', mandatory: false,
  action: { type: 'STUB', id: 'VARIABLE_ENERGY_TRASH_LEVEL_BOUNCE' },
}));

for (const [k, p] of Object.entries(F)) fs.writeFileSync(p, JSON.stringify(J[k]));
console.log('12 cards patched (MANUAL inserts)');
