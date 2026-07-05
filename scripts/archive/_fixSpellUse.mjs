import { readFileSync, writeFileSync } from 'fs';
// VALUE timing flatten 修復・第1クラスタ＝「スペルを使用したとき」7枚。
// timing:ON_TURN_END（本文「ターン終了時まで」の誤検出）→ ON_SPELL_USE＋triggerFilter.color。
// ON_SPELL_USE は BattleScreen:7237 で配線済み（caster の lrig/signi を走査・color フィルタ対応）。MANUAL-lock。
const patch = {
  'effects_WX.json': {
    // 「あなたが赤のスペルを使用したとき…このシグニは【ダブルクラッシュ】」
    'WX09-Re11-E1': {effectId:'WX09-Re11-E1',effectType:'AUTO',timing:['ON_SPELL_USE'],triggerFilter:{color:'赤'},action:{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},keyword:'ダブルクラッシュ',duration:'UNTIL_END_OF_TURN'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
    // 「あなたが赤のスペルを使用したとき…このシグニのパワーを＋5000」
    'WXEX1-33-E3': {effectId:'WXEX1-33-E3',effectType:'AUTO',timing:['ON_SPELL_USE'],triggerFilter:{color:'赤'},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},delta:5000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
    // 「《ターン2回》あなたがスペルを使用したとき…相手シグニ−4000」
    'WXEX2-72-E1': {effectId:'WXEX2-72-E1',effectType:'AUTO',timing:['ON_SPELL_USE'],action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-4000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'twice_per_turn'},
  },
  'effects_WXDi.json': {
    // 「《ターン1回》あなたがスペルを使用したとき…相手−3000＋相手デッキ2トラッシュ」
    'WXDi-P04-085-E1': {effectId:'WXDi-P04-085-E1',effectType:'AUTO',timing:['ON_SPELL_USE'],action:{type:'SEQUENCE',steps:[{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-3000},{type:'TRASH',target:{type:'DECK_CARD',owner:'opponent',count:2}}]},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
    // 「あなたがスペルを使用したとき…このシグニは「【常】：相手シグニがこのシグニとのバトルでバニッシュされる場合トラッシュに」を得る」
    // 既存 BANISH_REDIRECT 近似（対象 opponent ALL→trash）を維持・timing のみ是正。
    'WXDi-P13-056-E2': {effectId:'WXDi-P13-056-E2',effectType:'AUTO',timing:['ON_SPELL_USE'],action:{type:'BANISH_REDIRECT',target:{type:'SIGNI',owner:'opponent',count:'ALL',filter:{cardType:'シグニ'}},redirectTo:'trash',until:'PERMANENT'},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
  },
  'effects_WX24_26.json': {
    // 「《自分ターン》《ターン1回》あなたがスペルを使用したとき、自場に＜電機＞がある場合、相手シグニ1体−8000」
    // 電機 を target filter から condition(HAS_CARD_IN_FIELD,self) へ移動（target は相手シグニ）。
    'WX25-P2-034-E1': {effectId:'WX25-P2-034-E1',effectType:'AUTO',timing:['ON_SPELL_USE'],triggerCondition:{turnOwner:'self'},condition:{type:'HAS_CARD_IN_FIELD',owner:'self',filter:{story:'電機'}},action:{type:'POWER_MODIFY',target:{type:'SIGNI',owner:'opponent',count:1,filter:{cardType:'シグニ'},upToCount:false},delta:-8000},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL',usageLimit:'once_per_turn'},
  },
  'effects_WXK.json': {
    // 「あなたが赤のスペルを使用したとき…このシグニは「バニッシュされない」を得る。相手センタールリグLv4以上なら追加でダブルクラッシュ」
    // step2 のLv4条件は未表現（既存近似＝無条件）＝TODO 記録。timing+color のみ是正。
    'WXK11-033-E1': {effectId:'WXK11-033-E1',effectType:'AUTO',timing:['ON_SPELL_USE'],triggerFilter:{color:'赤'},action:{type:'SEQUENCE',steps:[{type:'GRANT_PROTECTION',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},from:['BANISH'],sourceOwner:'opponent',duration:'PERMANENT'},{type:'GRANT_KEYWORD',target:{type:'SIGNI',owner:'self',count:1,filter:{thisCardOnly:true}},keyword:'ダブルクラッシュ',duration:'UNTIL_END_OF_TURN'}]},duration:'UNTIL_END_OF_TURN',mandatory:true,parseStatus:'MANUAL'},
  },
};
for (const [fn, eff] of Object.entries(patch)) {
  const path = `public/data/${fn}`;
  const d = JSON.parse(readFileSync(path, 'utf-8'));
  for (const [effId, neweff] of Object.entries(eff)) {
    const card = effId.replace(/-E\d+.*$/, '').replace(/-BURST$/, '');
    const arr = d[card];
    const i = arr.findIndex(x => x.effectId === effId);
    if (i < 0) { console.log(`MISS ${effId}`); continue; }
    arr[i] = neweff;
    console.log(`FIXED ${effId} -> ON_SPELL_USE`);
  }
  const out = JSON.stringify(d); JSON.parse(out); writeFileSync(path, out);
}
console.log('done');
