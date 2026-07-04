// 一時調査: 「それが＜C＞のシグニの場合」73枚の全数分類
// A: REVEAL_AND_PICK(filter=story一致) 済み＝それ自体の移動（正表現）
// B: JSONに story フィルタ/条件が無い＝条件脱落疑い（実バグ候補）
import fs from 'fs';
import Papa from 'papaparse';

const IDS = `SP26-007 WX02-030 WX02-036 WX02-044 WX10-059 WX11-059 WX11-060 WX12-051 WX12-052 WX13-042 WX13-052 WX14-043 WX18-002 WX18-043 WX18-044 WX18-047 WX18-048 WX18-050 WX18-051 WX18-057 WX18-058 WX18-073 WXDi-P07-079 WXEX1-08 WXEX2-63 WXK01-050 WXK01-056 WXK01-062 WXK01-068 WXK01-077 WXK02-044 WXK02-050 WXK02-056 WXK02-062 WXK04-039 WXK04-052 WXK04-057 WXK05-049 WXK05-054 WXK05-055 WXK05-056 WXK05-062 WXK05-063 WXK05-068 WXK05-069 WXK05-074 WXK05-075 WXK05-076 WXK06-039 WXK06-046 WXK06-054 WXK06-065 WXK06-077 WXK06-079 WXK06-086 WXK07-041 WXK07-049 WXK07-057 WXK07-065 WXK07-080 WXK07-089 WXK08-039 WXK08-047 WXK08-054 WXK08-065 WXK08-076 WXK08-087 WXK09-045 WXK09-054 WXK09-062 WXK09-075 WXK09-088 WXK09-099`.split(/\s+/);

const sheets = fs.readdirSync('public/data').filter(f => /^CardData_Sheet\d+\.csv$/.test(f));
const cards = {};
for (const s of sheets) {
  const { data } = Papa.parse(fs.readFileSync(`public/data/${s}`, 'utf8'), { header: true });
  for (const row of data) {
    const id = (row['カードNo.'] ?? '').trim();
    if (IDS.includes(id)) cards[id] = row;
  }
}
const effFiles = ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'];
const effsByCard = {};
for (const f of effFiles) {
  const j = JSON.parse(fs.readFileSync(`public/data/${f}`, 'utf8'));
  for (const [k, v] of Object.entries(j)) if (IDS.includes(k)) effsByCard[k] = v;
}

const buckets = {};
for (const id of IDS) {
  const c = cards[id];
  const text = ((c?.['EffectText'] ?? '') + '／' + (c?.['BurstText'] ?? '')).replace(/\s+/g, '');
  // 該当文と直前文を抽出
  const m = text.match(/([^。／]*。)?([^。／]*それが＜[^＞]+＞(?:か＜[^＞]+＞)?のシグニの場合[^。／]*。?)/);
  const prev = m?.[1] ?? '';
  const sent = m?.[2] ?? '(!! 文抽出失敗)';
  const story = sent.match(/＜([^＞]+)＞/)?.[1] ?? '?';
  const js = JSON.stringify(effsByCard[id] ?? []);
  const hasRP = js.includes('"REVEAL_AND_PICK"') && js.includes(`"story":"${story}"`.replace(/"/g, '"')) || (js.includes('REVEAL_AND_PICK') && js.includes(story));
  const hasCond = /LAST_PROCESSED|CONDITIONAL/.test(js) && js.includes(story);
  const isReveal = /公開/.test(prev + sent);
  const isMill = /トラッシュに置/.test(prev);
  const cls = hasCond ? 'C:条件あり' : (hasRP && isReveal) ? 'A:RP済み' : 'B:条件脱落疑い';
  (buckets[cls] ??= []).push(id);
  console.log(`${cls}\t${id}\t前:${prev.slice(-40)}｜文:${sent.slice(0, 60)}`);
}
console.log('\n==== 集計 ====');
for (const [k, v] of Object.entries(buckets)) console.log(`${k}: ${v.length}枚\n  ${v.join(' ')}`);
