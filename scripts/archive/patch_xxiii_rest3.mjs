// タスク12(xxiii)残3枚＝リコレクト分割の内容欠落/幻覚を effectId アンカーで是正（parseStatus MANUAL 化で収穫保護）。
// - SPDi47-03-E2: 「カードを3枚引き、手札を好きな枚数捨てる」本体欠落＋IS_MY_TURN誤条件＋8枚閾値STUB
//   → DRAW3 + TRASH{HAND self ALL upTo}（対話・lastProcessedCards記録）+ COND(捨てGTE8){LIFE→デッキ下} + COND(捨てGTE1){SIGNI→デッキ下}
//   ⚠GTE8 を先に置く＝LIFE_CLOTH_CARD 転送は lastProcessedCards を上書きしない（execTransferToDeck 新分岐）ため
//     GTE1 が捨て枚数を正しく参照できる（8枚以上なら両方発火＝原文どおり）。
// - SPDi47-05-E2: バニッシュ→ゲーム除外の置換ルール丸ごと欠落 → BANISH_REDIRECT{redirectTo:'exile'} を挿入
// - WX24-P4-016-E3: GRANT_KEYWORD「マジックボックス」幻覚 → 正直STUB 2本（アタック無効化免除／MB表向き付与）
import fs from 'fs';

const patch = (file, id, effectId, apply) => {
  const p = 'public/data/' + file;
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  const eff = (j[id] ?? []).find(e => e.effectId === effectId);
  if (!eff) { console.error('NOT FOUND', effectId); process.exit(1); }
  apply(eff);
  fs.writeFileSync(p, JSON.stringify(j), 'utf-8');
  console.log('patched', effectId);
};

patch('effects_misc.json', 'SPDi47-03', 'SPDi47-03-E2', eff => {
  if (eff.action?.steps?.[0]?.type !== 'RECOLLECT_GATE') { console.error('unexpected shape SPDi47-03-E2'); process.exit(1); }
  eff.action = { type: 'SEQUENCE', steps: [
    { type: 'RECOLLECT_GATE', minArts: 4 },
    { type: 'DRAW', owner: 'self', count: 3 },
    { type: 'TRASH', target: { type: 'HAND_CARD', owner: 'self', count: 'ALL', upToCount: true } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 8, verbJa: '捨てた' },
      then: { type: 'TRANSFER_TO_DECK', source: { type: 'LIFE_CLOTH_CARD', owner: 'opponent', count: 1 }, shuffle: false, position: 'bottom' } },
    { type: 'CONDITIONAL', condition: { type: 'LAST_PROCESSED_COUNT_GTE', value: 1, verbJa: '捨てた' },
      then: { type: 'TRANSFER_TO_DECK', source: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ' } }, shuffle: false, position: 'bottom' } },
  ] };
  eff.parseStatus = 'MANUAL';
});

patch('effects_misc.json', 'SPDi47-05', 'SPDi47-05-E2', eff => {
  const steps = eff.action?.steps;
  if (steps?.[0]?.type !== 'RECOLLECT_GATE' || steps?.[1]?.type !== 'STUB') { console.error('unexpected shape SPDi47-05-E2'); process.exit(1); }
  steps.splice(1, 0, { type: 'BANISH_REDIRECT', target: { type: 'SIGNI', owner: 'opponent', count: 'ALL' }, redirectTo: 'exile', until: 'END_OF_TURN' });
  eff.parseStatus = 'MANUAL';
});

patch('effects_WX24_26.json', 'WX24-P4-016', 'WX24-P4-016-E3', eff => {
  if (eff.action?.steps?.[1]?.type !== 'GRANT_KEYWORD') { console.error('unexpected shape WX24-P4-016-E3'); process.exit(1); }
  eff.action = { type: 'SEQUENCE', steps: [
    { type: 'RECOLLECT_GATE', minArts: 4 },
    { type: 'STUB', id: 'ATTACK_NEGATE_IMMUNITY_SELF' },
    { type: 'STUB', id: 'MAGIC_BOX_FLIP_GRANT_ASSASSIN_DC' },
  ] };
  eff.parseStatus = 'MANUAL';
});
