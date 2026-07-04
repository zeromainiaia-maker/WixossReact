// 続き25: WXDi-D07-007 の手パッチ（parser 再現不能形＝parseStatus MANUAL 刻印）
// 原文 E1: 「このターン、次とその次にあなたがダメージを受ける場合、代わりにダメージを受けず、
//   ターン終了時まで、このルリグは「【自】：ターン終了時、あなたのデッキの上からカードを５枚トラッシュに置く。」を得る。」
// 原文 E2: 同・「次に」1回版（コスト《黒》《無》《無》）。
// 旧: 出た瞬間に自デッキ5枚を即時ミル（シールド効果ゼロ＋無条件自傷の実バグ）。
// 新: PREVENT_NEXT_DAMAGE（count 2/1）＝シールド正実装＋「防いだ回数ぶんの【自】付与」は
//     防御成功イベントのトリガーが無いため log-only STUB 据置（§6.3 登録・WX15-016 と同じ方針）。
import { readFileSync, writeFileSync } from 'fs';

const p = 'public/data/effects_WXDi.json';
const j = JSON.parse(readFileSync(p, 'utf-8'));
let hits = 0;
for (const effs of Object.values(j)) {
  for (const e of effs) {
    if (e.effectId === 'WXDi-D07-007-E1') {
      e.action = { type: 'SEQUENCE', steps: [
        { type: 'PREVENT_NEXT_DAMAGE', count: 2 },
        { type: 'STUB', id: 'LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE' },
      ] };
      e.duration = 'INSTANT';
      e.parseStatus = 'MANUAL';
      hits++;
    }
    if (e.effectId === 'WXDi-D07-007-E2') {
      e.action = { type: 'SEQUENCE', steps: [
        { type: 'PREVENT_NEXT_DAMAGE', count: 1 },
        { type: 'STUB', id: 'LRIG_GRANT_MILL_PER_PREVENTED_DAMAGE' },
      ] };
      e.duration = 'INSTANT';
      e.parseStatus = 'MANUAL';
      hits++;
    }
  }
}
if (hits !== 2) throw new Error(`WXDi-D07-007 patch: expected 2 hits, got ${hits}`);

// WXDi-P07-079-BURST: 「シグニによって」の damageSource 復元（続き24で E1 を MANUAL 化した
// カードはカード単位で harvest 温存されるため、parser 収穫が届かない＝手で合わせる）
let hitB = 0;
for (const effs of Object.values(j)) {
  for (const e of effs) {
    if (e.effectId === 'WXDi-P07-079-BURST') {
      const steps = e.action?.steps ?? [];
      for (const s of steps) {
        if (s.type === 'PREVENT_NEXT_DAMAGE') { s.damageSource = 'signi'; hitB++; }
      }
    }
  }
}
if (hitB !== 1) throw new Error(`WXDi-P07-079-BURST damageSource: expected 1 hit, got ${hitB}`);
writeFileSync(p, JSON.stringify(j), 'utf-8');
console.log('patched WXDi-D07-007 E1/E2 + WXDi-P07-079-BURST damageSource');
