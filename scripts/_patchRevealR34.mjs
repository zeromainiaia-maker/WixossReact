import { readFileSync, writeFileSync } from 'fs';

const path = 'public/data/effects_WXK.json';
const j = JSON.parse(readFileSync(path, 'utf-8'));
const arr = j['WXK04-055'];
const allWater = { type: 'SIGNI', owner: 'self', count: 'ALL', filter: { cardType: 'シグニ', story: '水獣' } };

// E1【常】: あなたのすべての＜水獣＞のシグニ +1000（target lossy を正す）
const e1 = arr.find(x => x.effectId === 'WXK04-055-E1');
e1.action.target = { ...allWater };
e1.parseStatus = 'MANUAL';

// E2【自】《ターン1回》: 自分の効果で手札公開時→すべての＜水獣＞ +1000... +2000
const e2 = arr.find(x => x.effectId === 'WXK04-055-E2');
e2.timing = ['ON_SELF_REVEAL_FROM_HAND'];
e2.action.target = { ...allWater };
e2.parseStatus = 'MANUAL';

writeFileSync(path, JSON.stringify(j));
console.log('patched WXK04-055 E1/E2');
