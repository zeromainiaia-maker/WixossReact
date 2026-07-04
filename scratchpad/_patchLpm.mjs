// LAST_PROCESSED_MATCHES バッチの手パッチ3件（parser 再現不能な形＝parseStatus MANUAL 刻印）
// 1. WXDi-P07-079-E1: 「それが＜毒牙＞のシグニの場合、代わりに＋10000」＝+5000無条件＋条件時+5000追加（net+10000）
//    旧: steps[1] が無条件 POWER_MODIFY +10000 owner:any ＝ +5000と+10000が両方・対象も別選択（実バグ）
// 2. SP26-007-E1: 「それがシグニの場合、それを場に出す。それが＜宇宙＞の場合、追加でこのカードをルリグデッキに戻す」
//    旧: 無条件 ADD_TO_FIELD ＋ 場のシグニを TRANSFER_TO_DECK（誤）。シャッフル脱落も復元。
// 3. WXK04-035-BURST: 「あなたのライフクロスが4枚以下の場合、追加で【エナチャージ1】」＝条件脱落の無条件エナチャージ
//    （fresh と同型に手合わせ＝カードの held 残差は [0] EXILE 系のみに縮む）
import { readFileSync, writeFileSync } from 'fs';

function patch(file, effectId, mutate) {
  const p = `public/data/${file}`;
  const j = JSON.parse(readFileSync(p, 'utf-8'));
  let hit = false;
  for (const effs of Object.values(j)) {
    for (const e of effs) {
      if (e.effectId === effectId) { mutate(e); hit = true; }
    }
  }
  if (!hit) throw new Error(`not found: ${effectId} in ${file}`);
  writeFileSync(p, JSON.stringify(j), 'utf-8');
  console.log(`patched ${effectId} (${file})`);
}

patch('effects_WXDi.json', 'WXDi-P07-079-E1', e => {
  e.action = {
    type: 'SEQUENCE',
    steps: [
      { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: false }, delta: 5000 },
      { type: 'CONDITIONAL',
        condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', story: '毒牙' } },
        then: { type: 'POWER_MODIFY', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } }, delta: 5000, targetsLastProcessed: true } },
    ],
  };
  e.parseStatus = 'MANUAL';
});

patch('effects_misc.json', 'SP26-007-E1', e => {
  e.action = {
    type: 'SEQUENCE',
    steps: [
      { type: 'SHUFFLE_DECK', owner: 'self' },
      { type: 'REVEAL_DECK_TOP', owner: 'self', count: 1 },
      { type: 'CONDITIONAL',
        condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ' } },
        then: { type: 'ADD_TO_FIELD', owner: 'self' } },
      { type: 'CONDITIONAL',
        condition: { type: 'LAST_PROCESSED_MATCHES', filter: { cardType: 'シグニ', story: '宇宙' } },
        then: { type: 'STUB', id: 'INTERNAL_ARTS_RECYCLE_EXECUTE' } },
    ],
  };
  e.parseStatus = 'MANUAL';
});

patch('effects_WXK.json', 'WXK04-035-BURST', e => {
  const steps = e.action?.steps;
  if (!steps || steps[1]?.type !== 'ENERGY_CHARGE_FROM_DECK') throw new Error('WXK04-035-BURST 期待構造でない');
  steps[1] = {
    type: 'CONDITIONAL',
    condition: { type: 'LIFE_COUNT', owner: 'self', operator: 'lte', value: 4 },
    then: { type: 'ENERGY_CHARGE_FROM_DECK', owner: 'self', count: 1 },
  };
});
