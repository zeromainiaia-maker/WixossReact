import fs from 'fs';
import { SRC, LIVE, raw, scan } from './tmp_s2_lib.mjs';

const patterns = {
  o289Strict: /(?:この【起】能力で)?まだ選(?:ばれて|んで)いない(?:もの|[０-９0-9]*つ)?[^。]{0,12}選ぶ|ゲーム中[１1]回だけ選べる/,
  o289Broad: /まだ選(?:ばれて|んで)いない|ゲーム中[１1]回だけ選べる/,
  o290Effect: /(?:この|その)キーを場に出すためのコストは《コイン(?:アイコン)?×[０-９0-9]+》(?:になる|減る)|エナゾーンにあるカードが持つ色が合計[３3]種類以上ある場合にしか新たに場に出せない/,
  o290Card: /(?:この|その)キーを場に出すためのコストは《コイン(?:アイコン)?×[０-９0-9]+》(?:になる|減る)|エナゾーンにあるカードが持つ色が合計[３3]種類以上ある場合にしか新たに場に出せない/,
  o291: /エナゾーンにあるカードは【マルチエナ】を失い、?対戦相手の効果を受けない/,
  o292: /【起】[^。：]{0,40}コラボライバー[１1]人と(?:の)?コラボする：/,
};

const extraTrials = {
  o290KeyCostBroad: /キー[^。]{0,40}場に出すためのコスト[^。]{0,30}(?:コイン|減る|なる)/,
  o290DeployRestrictionBroad: /キー[^。]{0,60}場合にしか[^。]{0,20}場に出せない/,
  o291Broad: /エナゾーンにあるカード[^。]{0,30}効果を受けない/,
  o292Broad: /コラボライバー[^。：]{0,20}コラボする：/,
};

function receipt289(j) { return /noRepeat|usedChoices|chosen_once|choiceUsed|persistentChoice|choicesUsed/.test(raw(j)); }
function receipt290(j) { return /coinReduction|keyDeploy|placeKeyCost|costReplacement|requiredDistinctColors/.test(raw(j)); }
function receipt291(j) { return /ENA.*IMMUN|IMMUN.*ENA|energy.*immune|immune.*energy|effectImmune.*energy/i.test(raw(j)); }
function receipt292(j) { return /collabCost|costCollab|doCollab|INTERNAL_DO_COLLAB/.test(raw(j)); }

for (const [name, re, ok] of [
  ['o289Strict', patterns.o289Strict, receipt289], ['o289Broad', patterns.o289Broad, receipt289],
  ['o290Effect', patterns.o290Effect, receipt290], ['o291', patterns.o291, receipt291], ['o292', patterns.o292, receipt292],
]) {
  const r = scan(re, ok);
  console.log(`\n${name}\t${re}\ttotal=${r.total}\thit=${r.hit.length}\tmiss=${r.miss.length}\tnojson=${r.nojson.length}`);
  for (const kind of ['hit', 'miss', 'nojson']) for (const id of r[kind]) {
    console.log(`${kind}\t${id}\t${LIVE[id]?.parseStatus || '-'}\t${(SRC[id] || '').replace(/\s+/g, ' ')}\nJSON=${raw(LIVE[id])}`);
  }
}
for (const [name, re] of Object.entries(extraTrials)) {
  const ids = Object.entries(SRC).filter(([, src]) => re.test(src)).map(([id]) => id);
  console.log(`TRIAL ${name}\t${re}\ttotal=${ids.length}\t${ids.join(',')}`);
}

const rows = new Map();
for (const file of fs.readdirSync('public/data').filter(f => /^CardData_.*\.csv$/.test(f))) {
  const lines = fs.readFileSync(`public/data/${file}`, 'utf8').split(/\r?\n/);
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const cardNum = line.match(/^\"?([^,\"]+)/)?.[1];
    if (cardNum && !rows.has(cardNum)) rows.set(cardNum, { file, line: i + 1, text: line });
  }
}
for (const [name, re] of [['o290Card', patterns.o290Card], ['o292Card', patterns.o292]]) {
  const found = [...rows.entries()].filter(([, x]) => re.test(x.text));
  console.log(`\n${name}\t${re}\tcards=${found.length}`);
  for (const [id, x] of found) console.log(`${id}\t${x.file}:${x.line}\t${x.text}`);
}

for (const [label, ids, re] of [
  ['O289', ['PR-469-E3', 'WXDi-P11-002-E1'], patterns.o289Strict],
  ['O291', ['WXK11-020-E1'], patterns.o291],
  ['O292', ['WXDi-CP01-006-E2', 'WXDi-CP01-007-E2', 'WXDi-CP01-008-E2'], patterns.o292],
]) console.log(`KNOWN ${label} ${ids.filter(id => re.test(SRC[id] || '')).length}/${ids.length} ${ids.map(id => `${id}:${re.test(SRC[id] || '')}`).join(' ')}`);
