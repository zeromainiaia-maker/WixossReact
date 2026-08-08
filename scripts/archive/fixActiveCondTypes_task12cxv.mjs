// タスク12(cxv)：activeCondition に Condition 型を流用していた3効果を ActiveCondition の実装済み型へ是正。
// 未実装型は checkActiveCondition が `return true` にフォールスルーするため**無条件成立＝過剰実行**だった。
import fs from 'fs';

const patches = {
  'public/data/effects_WX.json': {
    'WX05-021': {
      'WX05-021-E4': {
        // 原文「【常】：このシグニはパワーが20000以上であるかぎり、【ダブルクラッシュ】と…を得る」
        // 基本パワー12000＜20000 なので、無条件成立だと**常時ダブルクラッシュ**になっていた。
        activeCondition: { type: 'SELF_POWER_THRESHOLD', operator: 'gte', value: 20000 },
      },
    },
  },
  'public/data/effects_WXDi.json': {
    'WXDi-P07-060': {
      'WXDi-P07-060-E3': {
        // 原文「【常】：このシグニが覚醒状態であるかぎり、このシグニのパワーは＋2000され…」
        // 無条件成立だと**覚醒前から＋2000**（基本3000→5000）されていた。
        activeCondition: { type: 'IS_SELF_AWAKENED' },
      },
    },
  },
  'public/data/effects_misc.json': {
    'PR-426': {
      'PR-426-E3': {
        // 原文「【常】：あなたのライフクロスが１枚以下で、このシグニが中央のシグニゾーンにあるかぎり、
        //       このシグニのパワーは＋4000され…」。AND は実装済みだが子2つが Condition 型＝どちらも
        //       true にフォールスルー＝**ライフ満タン・サイドゾーンでも＋4000**されていた。
        activeCondition: {
          type: 'AND',
          conditions: [
            { type: 'COUNT_THRESHOLD', location: 'life_cloth', owner: 'self', operator: 'lte', value: 1 },
            { type: 'IS_SELF_IN_CENTER_ZONE' },
          ],
        },
      },
    },
  },
};

for (const [file, cards] of Object.entries(patches)) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [card, effs] of Object.entries(cards)) {
    for (const [effId, fields] of Object.entries(effs)) {
      const e = j[card]?.find(x => x.effectId === effId);
      if (!e) throw new Error(`not found: ${card} ${effId}`);
      console.log(`${effId} 旧 activeCondition = ${JSON.stringify(e.activeCondition)}`);
      Object.assign(e, fields);
      console.log(`${effId} 新 activeCondition = ${JSON.stringify(e.activeCondition)}`);
    }
  }
  fs.writeFileSync(file, JSON.stringify(j), 'utf8'); // ⚠ミニファイ1行形式を維持
  console.log(`wrote ${file}`);
}
