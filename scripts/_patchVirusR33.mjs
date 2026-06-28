import { readFileSync, writeFileSync } from 'fs';

function patch(file, id, effId, timing) {
  const path = `public/data/${file}`;
  const j = JSON.parse(readFileSync(path, 'utf-8'));
  const e = (j[id] ?? []).find(x => x.effectId === effId);
  if (!e) throw new Error(`no effect ${effId}`);
  e.timing = [timing];
  e.parseStatus = 'MANUAL';
  writeFileSync(path, JSON.stringify(j));
  console.log(`patched ${effId} -> ${timing}`);
}

// ウィルス配置・除去で相手シグニ debuff（ON_OPP_VIRUS_* は collectSelfEventTriggers で配線済み）
patch('effects_WX.json', 'WX19-079', 'WX19-079-E1', 'ON_OPP_VIRUS_PLACED');   // 置かれたとき
patch('effects_WX.json', 'WX21-030', 'WX21-030-E1', 'ON_OPP_VIRUS_CHANGED');  // 置かれるか取り除かれたとき
patch('effects_WX.json', 'WX21-068', 'WX21-068-E1', 'ON_OPP_VIRUS_REMOVED');  // 取り除かれたとき
patch('effects_misc.json', 'WD19-009', 'WD19-009-E1', 'ON_OPP_VIRUS_REMOVED'); // 取り除かれたとき
