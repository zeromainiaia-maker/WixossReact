import fs from 'fs';

// effects.jsonからSTUBカウント取得
const raw = fs.readFileSync('public/data/effects.json','utf8');
const data = JSON.parse(raw);
const actualCounts = {};
function search(obj) {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) { obj.forEach(search); return; }
  if (obj.type === 'STUB') actualCounts[obj.id] = (actualCounts[obj.id] || 0) + 1;
  Object.values(obj).forEach(v => { if (v && typeof v === 'object') search(v); });
}
for (const es of Object.values(data)) if (Array.isArray(es)) es.forEach(e => search(e.action));

// STUBS.mdを読み込み（CRLF正規化）
const mdRaw = fs.readFileSync('STUBS.md');
const hasCRLF = mdRaw.indexOf(13) >= 0; // \r
let md = mdRaw.toString('utf8').replace(/\r\n/g, '\n');

// テーブル行の件数を更新
// パターン: | N | (any) | (any) | ID ... |
// または: | N | (type) | ID ... |
let updated = md;
for (const [id, count] of Object.entries(actualCounts)) {
  // 正確にIDが出現する行を更新（先頭の数字だけ）
  const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // テーブル行の先頭パターン: | <数字> | ... | <ID> ...
  updated = updated.replace(
    new RegExp(`(^\\| *)\\d+( *\\|[^|]+\\|[^|]*\\|[^|]*${escaped})`, 'gm'),
    `$1${count}$2`
  );
  // 3列テーブルの場合: | <数字> | type | ID...
  updated = updated.replace(
    new RegExp(`(^\\| *)\\d+( *\\|[^|]+\\| *${escaped})`, 'gm'),
    `$1${count}$2`
  );
}

// CRLFを元に戻す
if (hasCRLF) {
  updated = updated.replace(/\n/g, '\r\n');
}

fs.writeFileSync('STUBS.md', updated, 'utf8');
console.log('カウント更新完了');

// 確認
const afterMd = fs.readFileSync('STUBS.md','utf8').replace(/\r\n/g,'\n');
const optLine = afterMd.split('\n').find(l => l.includes('OPTIONAL_COST'));
console.log('OPTIONAL_COST:', optLine?.substring(0,40));
