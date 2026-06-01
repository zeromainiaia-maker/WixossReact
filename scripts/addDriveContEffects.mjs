import { readFileSync, writeFileSync } from 'fs';

const data = JSON.parse(readFileSync('./public/data/effects.json', 'utf8'));

// ======== WXK01-074 コードライド タクシー ========
// ドライブ常：【ダブルクラッシュ】
// 自：このシグニがドライブ状態になったとき、あなたのシグニ1体を対象とし、ターン終了時まで、それのパワーを＋5000する。
if (!data['WXK01-074']) {
  data['WXK01-074'] = [
    {
      effectId: 'WXK01-074-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: {
        type: 'GRANT_KEYWORD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        keyword: 'ダブルクラッシュ',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ];
  console.log('✅ WXK01-074 追加');
} else {
  // すでに存在する場合、E1が未追加なら追加
  const hasE1 = data['WXK01-074'].some(e => e.effectId === 'WXK01-074-E1');
  if (!hasE1) {
    data['WXK01-074'].unshift({
      effectId: 'WXK01-074-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: {
        type: 'GRANT_KEYWORD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        keyword: 'ダブルクラッシュ',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    });
    console.log('✅ WXK01-074-E1 追加');
  } else {
    console.log('⏭ WXK01-074-E1 既存');
  }
}

// ======== WDK01-015 コードライド ワゴン ========
// ドライブ常：このシグニのパワーは＋7000される。
if (!data['WDK01-015']) {
  data['WDK01-015'] = [
    {
      effectId: 'WDK01-015-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: {
        type: 'POWER_MODIFY',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        delta: 7000,
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    },
  ];
  console.log('✅ WDK01-015 追加');
}

// ======== WDK01-011 コードライド ヤマテ ========
// ドライブ常：このシグニのパワーは＋3000され、「アタックしたとき自身パワー以下の相手シグニをバニッシュ」を得る。
// 既存エントリにE1を追加
{
  if (!data['WDK01-011']) data['WDK01-011'] = [];
  const hasE1 = data['WDK01-011'].some(e => e.effectId === 'WDK01-011-E1');
  if (!hasE1) {
    data['WDK01-011'].unshift(
      {
        effectId: 'WDK01-011-E1',
        effectType: 'CONTINUOUS',
        activeCondition: { type: 'IS_DRIVE_STATE' },
        action: {
          type: 'POWER_MODIFY',
          target: { type: 'SIGNI', owner: 'self', count: 1 },
          delta: 3000,
        },
        duration: 'PERMANENT',
        mandatory: true,
        parseStatus: 'AUTO',
      },
      {
        effectId: 'WDK01-011-E2',
        effectType: 'AUTO',
        timing: ['ON_ATTACK_SIGNI'],
        activeCondition: { type: 'IS_DRIVE_STATE' },
        action: {
          type: 'BANISH',
          target: {
            type: 'SIGNI',
            owner: 'opponent',
            count: 1,
            filter: { cardType: 'シグニ', powerLte: 'SELF_POWER' },
            upToCount: false,
          },
        },
        duration: 'INSTANT',
        mandatory: true,
        parseStatus: 'AUTO',
      },
    );
    console.log('✅ WDK01-011-E1/E2 追加');
  } else {
    console.log('⏭ WDK01-011-E1 既存');
  }
}

// ======== WXK01-036 コードアクセル エフワン ========
// ドライブ常：【アサシン】
// 常：自ターン中、赤のシグニのパワーを＋2000する。
{
  if (!data['WXK01-036']) data['WXK01-036'] = [];
  const hasE1 = data['WXK01-036'].some(e => e.effectId === 'WXK01-036-E1');
  const hasCont = data['WXK01-036'].some(e => e.effectId === 'WXK01-036-Econt');
  if (!hasE1) {
    data['WXK01-036'].unshift({
      effectId: 'WXK01-036-E1',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'IS_DRIVE_STATE' },
      action: {
        type: 'GRANT_KEYWORD',
        target: { type: 'SIGNI', owner: 'self', count: 1 },
        keyword: 'アサシン',
        duration: 'PERMANENT',
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    });
    console.log('✅ WXK01-036-E1 追加');
  }
  if (!hasCont) {
    // 常：自ターン中、赤のシグニ全体に+2000
    const insertIdx = data['WXK01-036'].findIndex(e => e.effectId === 'WXK01-036-E2');
    const contEff = {
      effectId: 'WXK01-036-Econt',
      effectType: 'CONTINUOUS',
      activeCondition: { type: 'TURN_OWNER', owner: 'self' },
      action: {
        type: 'POWER_MODIFY',
        target: {
          type: 'SIGNI',
          owner: 'self',
          count: 'ALL',
          filter: { cardType: 'シグニ', color: '赤' },
        },
        delta: 2000,
      },
      duration: 'PERMANENT',
      mandatory: true,
      parseStatus: 'AUTO',
    };
    if (insertIdx >= 0) {
      data['WXK01-036'].splice(insertIdx, 0, contEff);
    } else {
      data['WXK01-036'].push(contEff);
    }
    console.log('✅ WXK01-036-Econt 追加');
  }
}

// ======== WXEX2-38 コードドライブ ファイヤーエンジン ========
// ドライブ常：このシグニはバニッシュされない。
// ドライブ自：アタックしたとき、対戦相手のすべてのシグニをバニッシュする。
{
  if (!data['WXEX2-38']) data['WXEX2-38'] = [];
  const hasE1 = data['WXEX2-38'].some(e => e.effectId === 'WXEX2-38-E1');
  const hasE3 = data['WXEX2-38'].some(e => e.effectId === 'WXEX2-38-E3');
  if (!hasE1) {
    data['WXEX2-38'].unshift(
      {
        effectId: 'WXEX2-38-E1',
        effectType: 'CONTINUOUS',
        activeCondition: { type: 'IS_DRIVE_STATE' },
        action: { type: 'STUB', id: 'DRIVE_CONT_BANISH_RESIST' },
        duration: 'PERMANENT',
        mandatory: true,
        parseStatus: 'AUTO',
      },
    );
    console.log('✅ WXEX2-38-E1 追加');
  }
  if (!hasE3) {
    data['WXEX2-38'].push({
      effectId: 'WXEX2-38-E3',
      effectType: 'AUTO',
      timing: ['ON_ATTACK_SIGNI'],
      action: {
        type: 'STUB',
        id: 'DRIVE_AUTO_BANISH_ALL_OPP',
      },
      duration: 'INSTANT',
      mandatory: true,
      parseStatus: 'AUTO',
    });
    console.log('✅ WXEX2-38-E3 追加');
  }
}

writeFileSync('./public/data/effects.json', JSON.stringify(data, null, 2), 'utf8');
console.log('✅ effects.json 書き込み完了');
