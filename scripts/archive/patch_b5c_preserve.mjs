// バッチ5c 第1波の PRESERVE カード直パッチ（Claude 検証是正・2026-07-23）
// parser チョークポイント applyDistinctBatch5c は fresh に正しく constraint を出すが、
// これらのカードは MANUAL/PARTIAL 兄弟の PRESERVE で build:effects が curated を温存するため、
// ガードレール10 に従い curated JSON を外科的に同期する。ミニファイ1行書き戻し。
import fs from 'fs';

const patches = {
  'public/data/effects_WX.json': {
    'WX17-028': (effs) => {
      const e = effs.find(x => x.effectId === 'WX17-028-E1');
      e.action.steps[0].source.selectionConstraint = { distinct: 'level' };
    },
    'WXEX2-25': (effs) => {
      const e = effs.find(x => x.effectId === 'WXEX2-25-E2');
      e.action.source.selectionConstraint = { distinct: 'level' };
    },
    'WXEX1-47': (effs) => {
      const e = effs.find(x => x.effectId === 'WXEX1-47-E2');
      // 群2 source 誤バインド併修: 場のシグニ1枚→トラッシュの古代兵器4枚（原文どおり）
      e.action.steps[0].source = { type: 'TRASH_CARD', owner: 'self', count: 4, filter: { cardType: 'シグニ', story: '古代兵器' }, selectionConstraint: { distinct: 'level' } };
    },
    'WXEX1-03': (effs) => {
      const e = effs.find(x => x.effectId === 'WXEX1-03-E2');
      e.action.steps[0].source.selectionConstraint = { distinct: 'name' };
    },
  },
  'public/data/effects_misc.json': {
    'WD07-012': (effs) => {
      const e = effs.find(x => x.effectId === 'WD07-012-E2');
      e.action.steps[0].source.selectionConstraint = { distinct: 'level' };
    },
  },
  'public/data/effects_WX24_26.json': {
    'WX24-P1-085': (effs) => {
      const e = effs.find(x => x.effectId === 'WX24-P1-085-E1');
      e.action.source.selectionConstraint = { distinct: 'level' };
    },
    'WX25-P3-107': (effs) => {
      const e = effs.find(x => x.effectId === 'WX25-P3-107-E1');
      e.action.source.selectionConstraint = { distinct: 'level' };
    },
  },
  'public/data/effects_WXDi.json': {
    'WXDi-P02-031': (effs) => {
      const e = effs.find(x => x.effectId === 'WXDi-P02-031-E1');
      e.action.steps[1].source.selectionConstraint = { sharedColor: 'none' };
    },
    'WXDi-P13-034': (effs) => {
      const e = effs.find(x => x.effectId === 'WXDi-P13-034-E1');
      e.action.steps[1].source.selectionConstraint = { sharedColor: 'none' };
    },
    'WXDi-CP02-010': (effs) => {
      const e = effs.find(x => x.effectId === 'WXDi-CP02-010-E2');
      // 幻覚の2ステップ目（追加1枚蘇生）を除去し、原文「2枚を場に出す」の単一アクションへ
      e.action = { ...e.action.steps[0] };
      e.action.source.selectionConstraint = { distinct: 'level' };
    },
  },
};

for (const [file, cards] of Object.entries(patches)) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [card, fn] of Object.entries(cards)) {
    if (!j[card]) { console.error('カード無し: ' + card); process.exit(1); }
    fn(j[card]);
    console.log('patched ' + card);
  }
  fs.writeFileSync(file, JSON.stringify(j), 'utf8');
}
console.log('done');
