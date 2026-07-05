/**
 * fixLayerCards.mjs
 * regenerateLayerCards.ts で再生成したレイヤーカードのうち、
 * パーサー出力に誤りがあるものを修正する。
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const p = path.join(root, 'public/data', 'effects_WX.json');
const j = JSON.parse(fs.readFileSync(p, 'utf8'));

const layerAbilities = (id) =>
  j[id].find(e => e.action?.type === 'GRANT_FIELD_SIGNI_ABILITY').action.abilities;

// WX17-035 ピグシイ LAYER-E1: 「このシグニの正面のシグニ」は相手シグニ（正面指定は近似）
{
  const abilities = layerAbilities('WX17-035');
  abilities[0].action.target.owner = 'opponent';
}

// WX17-051 ドワフ LAYER-E1: コスト「このシグニを場からトラッシュに置く」が欠落していた
// （EffectCostに自身トラッシュがないため、アクション先頭のTRASHステップで近似）
{
  const abilities = layerAbilities('WX17-051');
  const e1 = abilities[0];
  if (e1.action.type !== 'SEQUENCE') {
    e1.action = {
      type: 'SEQUENCE',
      steps: [
        { type: 'TRASH', target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } } },
        e1.action,
      ],
    };
  }
}

fs.writeFileSync(p, JSON.stringify(j), 'utf8');
console.log('effects_WX.json: WX17-035, WX17-051 のレイヤー能力を修正');
