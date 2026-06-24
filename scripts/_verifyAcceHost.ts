// 「これにアクセされている」系（アクセ→ホスト）の検証ハーネス。
// 実 effects_*.json を読み込み、calcFieldPowers / collectGrantedFromAcce /
// collectEffectImmuneSigni / collectContinuousGrantedKeywords でホスト宛の
// パワー加算・能力付与・キーワード付与・クラス限定を確認する。
import fs from 'fs';
import {
  calcFieldPowers, collectGrantedFromAcce, collectEffectImmuneSigni,
  collectContinuousGrantedKeywords, collectAllColorSigniForField, collectForcedFrontAttackZones,
} from '../src/engine/effectEngine';
import { executeAction } from '../src/engine/effectExecutor';
import type { ExecCtx } from '../src/engine/execUtils';
import type { PlayerState, CardData } from '../src/types';
import type { CardEffect } from '../src/types/effects';

let pass = 0, fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  if (cond) { pass++; console.log(`  ✓ ${name}`); }
  else { fail++; console.log(`  ✗ ${name}  ${extra}`); }
};

// ---- 実 effects 読み込み ----
const effectsMap = new Map<string, CardEffect[]>();
for (const f of ['effects_WX.json', 'effects_WXK.json', 'effects_misc.json', 'effects_WXDi.json']) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const k of Object.keys(j)) effectsMap.set(k, j[k]);
}

// ---- cardMap（必要カードのみ。#インスタンスは基底へフォールバック）----
class IMap<V> extends Map<string, V> {
  override get(id: string): V | undefined {
    if (super.has(id)) return super.get(id);
    const h = id.indexOf('#'); return super.get(h > 0 ? id.slice(0, h) : id);
  }
  override has(id: string): boolean { const h = id.indexOf('#'); return super.has(id) || super.has(h > 0 ? id.slice(0, h) : id); }
}
const card = (o: Partial<CardData>): CardData => ({ CardNum: '', CardName: '', Color: '', Level: '1', CardClass: '', Type: 'シグニ', Power: '5000', ...o } as CardData);
const cardMap = new IMap<CardData>([
  ['HOST_CHOURI', card({ CardNum: 'HOST_CHOURI', CardName: 'ホスト調理', CardClass: '精械：調理', Power: '5000' })],
  ['HOST_OTHER', card({ CardNum: 'HOST_OTHER', CardName: 'ホスト他', CardClass: '電機', Power: '5000' })],
  ['HOST_WEDDING', card({ CardNum: 'HOST_WEDDING', CardName: 'コードオーダーウェディング', CardClass: '美巧', Power: '12000' })],
  // アクセカード（CardClassは判定に使わないがダミー）
  ['WD18-013', card({ CardNum: 'WD18-013', CardClass: '精械：調理' })],
  ['WXK04-080', card({ CardNum: 'WXK04-080', CardClass: '精械：調理' })],
  ['WXDi-P09-TK01A', card({ CardNum: 'WXDi-P09-TK01A', CardClass: '精械：調理' })],
  ['WX15-102', card({ CardNum: 'WX15-102', CardClass: '精械：調理' })],
  ['WXEX1-70', card({ CardNum: 'WXEX1-70', CardClass: '精械：調理' })],
  ['WX20-072', card({ CardNum: 'WX20-072', CardClass: '精械：調理' })],
  ['WX15-058', card({ CardNum: 'WX15-058', CardClass: '精械：調理' })],
]);

const blank = (o: Partial<PlayerState> = {}): PlayerState => ({
  deck: [], hand: [], energy: [], trash: [], lrig_trash: [], lrig_deck: [], life_cloth: [],
  field: { lrig: [], signi: [null, null, null], signi_acce: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] },
  coins: 0, ...o,
} as unknown as PlayerState);

// 場: zone0 にホスト、zone0 にアクセ
const stateWith = (hostNum: string, acceNum: string): PlayerState => blank({
  field: { lrig: [], signi: [[hostNum], null, null], signi_acce: [acceNum, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never,
});
const opp = blank();

console.log('\n[1] パワー：クラス限定 acceHost（WD18-013 ケチャ ＋5000 ＜調理＞のみ）');
{
  const onChouri = calcFieldPowers(stateWith('HOST_CHOURI', 'WD18-013'), opp, true, effectsMap, cardMap);
  check('調理ホスト = 5000+5000=10000', onChouri.get('HOST_CHOURI') === 10000, `got ${onChouri.get('HOST_CHOURI')}`);
  const onOther = calcFieldPowers(stateWith('HOST_OTHER', 'WD18-013'), opp, true, effectsMap, cardMap);
  check('非調理ホスト = 5000（加算なし）', onOther.get('HOST_OTHER') === 5000, `got ${onOther.get('HOST_OTHER')}`);
}

console.log('\n[2] パワー：クラス無し acceHost（WXK04-080 アラザン ＋3000 / WXDi-P09-TK01A ＋10000）');
{
  const a = calcFieldPowers(stateWith('HOST_OTHER', 'WXK04-080'), opp, true, effectsMap, cardMap);
  check('任意ホスト = 5000+3000=8000', a.get('HOST_OTHER') === 8000, `got ${a.get('HOST_OTHER')}`);
  const b = calcFieldPowers(stateWith('HOST_OTHER', 'WXDi-P09-TK01A'), opp, true, effectsMap, cardMap);
  check('任意ホスト = 5000+10000=15000', b.get('HOST_OTHER') === 15000, `got ${b.get('HOST_OTHER')}`);
}

console.log('\n[3] パワー：名前限定 acceHost（WX20-072 チョコプレート ＋1000 《ウェディング》のみ）');
{
  const w = calcFieldPowers(stateWith('HOST_WEDDING', 'WX20-072'), opp, true, effectsMap, cardMap);
  check('ウェディング = 12000+1000=13000', w.get('HOST_WEDDING') === 13000, `got ${w.get('HOST_WEDDING')}`);
  const o = calcFieldPowers(stateWith('HOST_OTHER', 'WX20-072'), opp, true, effectsMap, cardMap);
  check('非ウェディング = 5000（加算なし）', o.get('HOST_OTHER') === 5000, `got ${o.get('HOST_OTHER')}`);
}

console.log('\n[4] 能力付与：メダマヤキ（WX15-102）→ 調理ホストが「シグニの効果を受けない」');
{
  const st = stateWith('HOST_CHOURI', 'WX15-102');
  const granted = collectGrantedFromAcce(st, opp, true, effectsMap, cardMap);
  check('調理ホストへ付与あり', (granted.get('HOST_CHOURI')?.length ?? 0) >= 1, JSON.stringify([...granted.keys()]));
  // augMap 相当（ホスト効果に付与を合流）
  const aug = new Map(effectsMap);
  for (const [n, e] of granted) aug.set(n, [...(aug.get(n) ?? []), ...e]);
  const immune = collectEffectImmuneSigni(st, opp, cardMap, aug, true, 'シグニ');
  check('シグニ効果に対し免疫', immune.has('HOST_CHOURI'), [...immune].join(','));
  const immuneArts = collectEffectImmuneSigni(st, opp, cardMap, aug, true, 'アーツ');
  check('アーツ効果には免疫でない', !immuneArts.has('HOST_CHOURI'), [...immuneArts].join(','));
  // 非調理ホストには付与されない
  const st2 = stateWith('HOST_OTHER', 'WX15-102');
  const g2 = collectGrantedFromAcce(st2, opp, true, effectsMap, cardMap);
  check('非調理ホストへは付与なし', (g2.get('HOST_OTHER')?.length ?? 0) === 0, JSON.stringify([...g2.keys()]));
}

console.log('\n[5] キーワード付与：セアブラ（WXEX1-70）→ 調理ホストが【ランサー】');
{
  const st = stateWith('HOST_CHOURI', 'WXEX1-70');
  const granted = collectGrantedFromAcce(st, opp, true, effectsMap, cardMap);
  const aug = new Map(effectsMap);
  for (const [n, e] of granted) aug.set(n, [...(aug.get(n) ?? []), ...e]);
  const kw = collectContinuousGrantedKeywords(st, opp, true, aug, cardMap);
  check('調理ホストに ランサー', (kw['HOST_CHOURI'] ?? []).includes('ランサー'), JSON.stringify(kw));
}

console.log('\n[6] AUTO付与の付着確認：テキソス（WX15-058）→ 調理ホストへ ON_ATTACK 能力');
{
  const st = stateWith('HOST_CHOURI', 'WX15-058');
  const granted = collectGrantedFromAcce(st, opp, true, effectsMap, cardMap);
  const abil = granted.get('HOST_CHOURI') ?? [];
  check('AUTO ON_ATTACK_SIGNI が付与', abil.some(a => a.effectType === 'AUTO' && (a.timing ?? []).includes('ON_ATTACK_SIGNI')), JSON.stringify(abil.map(a => a.effectType)));
}

console.log('\n[7] 全色付与：クギニ（WX22-043）→ 調理ホストがすべての色を得る');
{
  cardMap.set('WX22-043', card({ CardNum: 'WX22-043', CardClass: '精械：調理' }));
  const st = stateWith('HOST_CHOURI', 'WX22-043');
  const allColor = collectAllColorSigniForField(st, cardMap, effectsMap, opp, true);
  check('調理ホストが全色集合に含まれる', allColor.has('HOST_CHOURI'), [...allColor].join(','));
}

console.log('\n[8] 動的パワー減：ラムレーズン（WDK07-E14, レベル×−2000）／ラムネ（WXK10-075, パワー分）');
{
  // ホスト（レベル3, パワー5000）が相手シグニ1体へ POWER_MODIFY_BY_SOURCE
  cardMap.set('HOST_L3', card({ CardNum: 'HOST_L3', CardClass: '精械：調理', Level: '3', Power: '5000' }));
  cardMap.set('OPP_S', card({ CardNum: 'OPP_S', CardClass: '電機', Power: '8000' }));
  const own = blank({ field: { lrig: [], signi: [['HOST_L3'], null, null], signi_acce: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never });
  const oth = blank({ field: { lrig: [], signi: [['OPP_S'], null, null], signi_acce: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never });
  const ctx: ExecCtx = { ownerState: own, otherState: oth, cardMap, logs: [], sourceCardNum: 'HOST_L3' } as unknown as ExecCtx;
  // level×-2000、相手全体（count ALL で決定的に）
  const rLv = executeAction({ type: 'POWER_MODIFY_BY_SOURCE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, basis: 'level', multiplier: -2000 } as never, ctx);
  const modsLv = ((rLv as { otherState?: typeof oth }).otherState ?? oth).temp_power_mods ?? [];
  check('レベル3×−2000 = −6000 が相手へ', modsLv.some((m: { cardNum: string; delta: number }) => m.cardNum === 'OPP_S' && m.delta === -6000), JSON.stringify(modsLv));
  const rPw = executeAction({ type: 'POWER_MODIFY_BY_SOURCE', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL', filter: { cardType: 'シグニ' } }, basis: 'power', multiplier: -1 } as never, ctx);
  const modsPw = ((rPw as { otherState?: typeof oth }).otherState ?? oth).temp_power_mods ?? [];
  check('パワー5000×−1 = −5000 が相手へ', modsPw.some((m: { cardNum: string; delta: number }) => m.cardNum === 'OPP_S' && m.delta === -5000), JSON.stringify(modsPw));
}

console.log('\n[9] 手札捨て付与：ワラビモチ（WXK10-074）→ ホストへ ON_ATTACK で powerLtSelf 手札捨て');
{
  const st = stateWith('HOST_CHOURI', 'WXK10-074');
  cardMap.set('WXK10-074', card({ CardNum: 'WXK10-074', CardClass: '精械：調理' }));
  const granted = collectGrantedFromAcce(st, opp, true, effectsMap, cardMap);
  const abil = granted.get('HOST_CHOURI') ?? [];
  const g = abil.find(a => a.effectType === 'AUTO' && (a.timing ?? []).includes('ON_ATTACK_SIGNI'));
  check('ON_ATTACK TRASH(powerLtSelf, 手札) 付与', !!g && (g.action as { type: string }).type === 'TRASH'
    && !!(g.action as { target?: { type?: string; filter?: { powerLtSelf?: boolean } } }).target?.filter?.powerLtSelf
    && (g.action as { target?: { type?: string } }).target?.type === 'HAND_CARD', JSON.stringify(g?.action));
}

console.log('\n[10] 正面強制アタック：マロンクリーム（WX20-045）→ ホストの正面の相手シグニが強制対象');
{
  cardMap.set('WX20-045', card({ CardNum: 'WX20-045', CardClass: '精械：調理' }));
  // owner（ホスト所有者）: zone0 に調理ホスト＋アクセ。viewer（相手）: zone2（=zone0の正面）にシグニ。
  const owner = blank({ field: { lrig: [], signi: [['HOST_CHOURI'], null, null], signi_acce: ['WX20-045', null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never });
  const viewer = blank({ field: { lrig: [], signi: [null, null, ['OPP_S']], signi_acce: [null, null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] } as never });
  cardMap.set('OPP_S', card({ CardNum: 'OPP_S', CardClass: '電機', Power: '8000' }));
  // augMap：ホストへ付与を合流
  const granted = collectGrantedFromAcce(owner, viewer, false, effectsMap, cardMap);
  const aug = new Map(effectsMap);
  for (const [n, e] of granted) aug.set(n, [...(aug.get(n) ?? []), ...e]);
  const forced = collectForcedFrontAttackZones(viewer, owner, true, aug, cardMap);
  check('viewer の zone2（正面）が強制対象', forced.has(2), [...forced].join(','));
  // 正面が空なら強制対象なし
  const viewerEmpty = blank();
  const forced2 = collectForcedFrontAttackZones(viewerEmpty, owner, true, aug, cardMap);
  check('正面が空なら強制なし', forced2.size === 0, [...forced2].join(','));
}

console.log('\n[11] 相手ターン終了時付与：サルサス（WX17-077）→ ホストへ any_opp ON_TURN_END CHOOSE');
{
  const st = stateWith('HOST_CHOURI', 'WX17-077');
  cardMap.set('WX17-077', card({ CardNum: 'WX17-077', CardClass: '精械：調理' }));
  const granted = collectGrantedFromAcce(st, opp, true, effectsMap, cardMap);
  const abil = granted.get('HOST_CHOURI') ?? [];
  const g = abil.find(a => a.effectType === 'AUTO' && (a.timing ?? []).includes('ON_TURN_END'));
  check('ON_TURN_END / any_opp / CHOOSE 付与', !!g && g.triggerScope === 'any_opp' && (g.action as { type: string }).type === 'CHOOSE', JSON.stringify(g?.action).slice(0, 80));
}

console.log('\n[12] 正面低レベルバニッシュ付与：タルタル（WX17-075）→ ホストへ ON_PLAY any_opp 任意バニッシュ');
{
  const st = stateWith('HOST_CHOURI', 'WX17-075');
  cardMap.set('WX17-075', card({ CardNum: 'WX17-075', CardClass: '精械：調理' }));
  const granted = collectGrantedFromAcce(st, opp, true, effectsMap, cardMap);
  const abil = granted.get('HOST_CHOURI') ?? [];
  const g = abil.find(a => a.effectType === 'AUTO' && (a.timing ?? []).includes('ON_PLAY'));
  check('ON_PLAY any_opp + frontLowerLevel + BANISH(isTriggerSource)', !!g
    && g.triggerScope === 'any_opp'
    && !!g.triggerCondition?.frontLowerLevelThanSource
    && (g.action as { type: string; optional?: boolean }).type === 'BANISH'
    && (g.action as { optional?: boolean }).optional === true, JSON.stringify(g?.action));
}

console.log('\n[13] 選択付与：ラズベリー（SPK01-11）→ 装着時の選択(acce_choice)で付与能力が1つに切替');
{
  cardMap.set('SPK01-11', card({ CardNum: 'SPK01-11' }));
  const mk = (choice?: number) => {
    const f = { lrig: [], signi: [['HOST_OTHER'], null, null], signi_acce: ['SPK01-11', null, null], assist_lrig_l: [], assist_lrig_r: [], check: null, key_piece: null, free_zone: [] };
    return blank({ field: f as never, ...(choice !== undefined ? { acce_choice: { 'SPK01-11': choice } } : {}) });
  };
  // 未選択：付与なし
  const gNone = collectGrantedFromAcce(mk(undefined), opp, true, effectsMap, cardMap);
  check('未選択では付与なし', (gNone.get('HOST_OTHER')?.length ?? 0) === 0, JSON.stringify([...gNone.keys()]));
  // 選択0（ダウンしない）→ GRANT_PROTECTION DOWN 1個のみ
  const g0 = collectGrantedFromAcce(mk(0), opp, true, effectsMap, cardMap).get('HOST_OTHER') ?? [];
  check('選択0で1能力のみ＝DOWN耐性', g0.length === 1 && (g0[0].action as { type: string; from?: string[] }).type === 'GRANT_PROTECTION' && (g0[0].action as { from?: string[] }).from?.includes('DOWN'), JSON.stringify(g0.map(a => a.action)));
  // 選択2（アタック時ドロー）→ AUTO ON_ATTACK DRAW
  const g2 = collectGrantedFromAcce(mk(2), opp, true, effectsMap, cardMap).get('HOST_OTHER') ?? [];
  check('選択2で1能力のみ＝ON_ATTACK DRAW', g2.length === 1 && g2[0].effectType === 'AUTO' && (g2[0].action as { type: string }).type === 'DRAW', JSON.stringify(g2.map(a => a.action)));
}

console.log(`\n==== ${pass} passed, ${fail} failed ====`);
process.exit(fail ? 1 : 0);
