import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten 修復・デッキミルクラスタ12枚。timing:ON_TURN_END → ON_CARD_MILLED_FROM_DECK（新規配線）。
// triggerCondition.milledDeckOwner（self/opponent/any）＋milledMinCount。
// ⚠近似：原因限定（効果/コスト/悪魔シグニ/ディソナ/龍獣フィルタ）は未表現、合計N枚は解決単位の近似。
const U='UNTIL_END_OF_TURN';
const patch = {
  'effects_WX.json': {
    // 効果1つによってデッキから3枚以上→相手1体エナチャージ+(-8000)。SEQUENCE再構築（-8000欠落を補完）
    'WXEX1-49-E2': {effectId:'WXEX1-49-E2',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:3},action:{type:'SEQUENCE',steps:[{type:'ENERGY_CHARGE_FROM_DECK',owner:'self',count:1},{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-8000}]},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
  },
  'effects_WXDi.json': {
    // あなたのデッキから1枚→このシグニ+5000
    'WXDi-P07-093-E1': {effectId:'WXDi-P07-093-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},delta:5000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 自ターン・あなたのデッキから合計2枚以上→相手1体-2000（合計は近似=minCount:2）
    'WXDi-P08-079-E1': {effectId:'WXDi-P08-079-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{turnOwner:'self',milledDeckOwner:'self',milledMinCount:2},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-2000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 自ターン・いずれかのプレイヤーのデッキから合計3枚以上→相手全-3000（合計は近似）
    'WXDi-CP02-010-E1': {effectId:'WXDi-CP02-010-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{turnOwner:'self',milledDeckOwner:'any',milledMinCount:3},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:'ALL',filter:{cardType:'シグニ'}},delta:-3000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // あなたの《ディソナ》カード効果によって相手デッキから1枚以上→相手1体-2000（ディソナ限定は近似）
    'WXDi-P13-085-E1': {effectId:'WXDi-P13-085-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'opponent',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-2000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
  },
  'effects_WXK.json': {
    // あなたのデッキから→自全＜トリック＞+2000
    'WXK01-065-E2': {effectId:'WXK01-065-E2',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:'ALL',filter:{cardType:'シグニ',story:'トリック'}},delta:2000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // あなたのデッキから→自＜武勇＞1体+4000
    'WXK02-059-E2': {effectId:'WXK02-059-E2',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:1,filter:{cardType:'シグニ',story:'武勇'}},delta:4000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 効果1つによってあなたのデッキから3枚以上→相手1体-5000
    'WXK03-027-E2': {effectId:'WXK03-027-E2',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:3},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-5000},duration:U,mandatory:true,parseStatus:'MANUAL'},
    // 効果1つによってあなたのデッキから1枚以上→相手1体-2000・ターン2回
    'WXK09-056-E1': {effectId:'WXK09-056-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-2000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'twice_per_turn'},
    // あなたの効果によってあなたのデッキから＜龍獣＞1枚→相手1体-2000（龍獣フィルタは近似）
    'WXK10-052-E1': {effectId:'WXK10-052-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{milledDeckOwner:'self',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-2000},duration:U,mandatory:true,parseStatus:'MANUAL'},
  },
  'effects_WX24_26.json': {
    // 自ターン・あなたの＜悪魔＞シグニ効果によってデッキから1枚→相手1体-2000（悪魔限定は近似）
    'WX24-P3-087-E1': {effectId:'WX24-P3-087-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{turnOwner:'self',milledDeckOwner:'self',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-2000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 自ターン・あなたの効果によっていずれかのプレイヤーのデッキから1枚→このシグニ+4000
    'WX24-P4-088-E1': {effectId:'WX24-P4-088-E1',effectType:'AUTO',timing:['ON_CARD_MILLED_FROM_DECK'],triggerCondition:{turnOwner:'self',milledDeckOwner:'any',milledMinCount:1},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},delta:4000},duration:U,mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
  },
};
for (const [fn, eff] of Object.entries(patch)) {
  const path = `public/data/${fn}`;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  for (const [effId, neweff] of Object.entries(eff)) {
    const card = effId.replace(/-E\d+.*$/, '');
    const i = d[card].findIndex(x => x.effectId === effId);
    if (i < 0) { console.log(`MISS ${effId}`); continue; }
    d[card][i] = neweff;
    console.log(`FIXED ${effId}`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
