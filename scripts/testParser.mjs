import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const csv = readFileSync(join(__dirname, '../public/data/CardData_Sheet1.csv'), 'utf-8')
  .replace(/^﻿/, '').replace(/\r/g, ''); // BOM除去 + CRLF → LF

const lines = csv.split('\n').filter(l => l.trim());
const headers = lines[0].split(',');
const cards = lines.slice(1).map(line => {
  const fields = line.split(',');
  const obj = {};
  headers.forEach((h, i) => obj[h] = (fields[i] ?? '').trim());
  return obj;
}).filter(c => c.CardNum);

console.log(`総カード数: ${cards.length}`);
const withEffect = cards.filter(c => c.EffectText && c.EffectText !== '-');
const withBurst  = cards.filter(c => c.BurstText  && c.BurstText  !== '-');
console.log(`EffectTextあり: ${withEffect.length}`);
console.log(`BurstTextあり:  ${withBurst.length}`);

// 効果タイプ別
const pat = { '【常】':0,'【出】':0,'【起】':0,'【自】':0,'【ガード】':0 };
for (const c of withEffect) for (const k of Object.keys(pat)) if (c.EffectText.includes(k)) pat[k]++;
console.log('\n効果タイプ別:');
for (const [k,v] of Object.entries(pat)) console.log(`  ${k}: ${v}枚`);

// ---- パーサーロジックを JS で簡易再現（型なし）----
function parseNum(s){ return parseInt(s.replace(/[０-９]/g,c=>String.fromCharCode(c.charCodeAt(0)-0xFEE0)),10); }
const EC = new Set(['白','赤','青','緑','黒','無']);
function parseCost(s){
  if(!s||s==='-') return null;
  const c={}; const re=/《([^》]+)》(?:×([０-９\d]+))?/g; let m;
  const eng=[];
  while((m=re.exec(s))!==null) if(EC.has(m[1])) eng.push({color:m[1],count:m[2]?parseNum(m[2]):1});
  if(eng.length) c.energy=eng;
  if(s.includes('《ダウン》')) c.down_self=true;
  const dm=s.match(/手札を([０-９\d]+)枚捨てる/); if(dm) c.discard=parseNum(dm[1]);
  return Object.keys(c).length?c:null;
}

// 効果ブロック分割
function splitBlocks(text){ return text.split(/(?<=。)(?=【(?:常|出|起|自|ガード)】)/).map(b=>b.trim()).filter(Boolean); }

// 単純パース判定（effectParser.ts の parseSingleSentence + parseActionText に対応）
function isKnown(t){
  return (
    // スタンドアロンキーワード能力（【マルチエナ】など）
    /^【[^】]+】[（(]?/.test(t) && !t.startsWith('【ガード】') ||
    // パワー系
    t.includes('パワーを＋') || t.includes('パワーを－') ||
    t.includes('パワーは＋') || t.includes('パワーは－') ||
    t.includes('パワーは') && t.includes('になる') ||
    // ドロー / ハンデス / 手札
    t.includes('カードを') && t.includes('引く') ||
    t.includes('捨てさせる') ||
    t.includes('手札を') && t.includes('捨てる') ||
    // フィールド操作
    t.includes('バニッシュ') || t.includes('手札に戻す') ||
    t.includes('ダウンする') || t.match(/をダウン/) ||
    t.includes('凍結する') || t.includes('アップする') ||
    // デッキ / エナ / トラッシュ操作
    t.includes('デッキから') && t.includes('手札に加え') ||
    t.includes('トラッシュから') && t.includes('手札に加える') ||
    t.includes('エナゾーンから') && t.includes('手札に加える') ||
    t.includes('エナゾーンに置く') ||
    t.includes('エナチャージ') ||
    t.includes('デッキの上からカードを') && (t.includes('見て') || t.includes('見る')) ||
    t.includes('デッキの一番上を見る') ||
    // トラッシュ→デッキ
    t.includes('トラッシュ') && (t.includes('デッキに加え') || t.includes('デッキに戻し')) && t.includes('シャッフル') ||
    // ライフ系
    t.includes('ライフクロスに加える') || t.includes('ライフクロスに置く') ||
    t.includes('ライフクロス') && t.includes('クラッシュ') ||
    // フィールドに出す
    t.includes('エナゾーンから') && t.includes('場に出す') ||
    t.includes('場に出してもよい') ||
    // キーワード付与
    t.includes('を得る') && t.includes('【') ||
    t.includes('を持つ') && t.includes('【') ||
    // その他
    t.includes('トラッシュに置く') ||
    t.startsWith('【ガード】') ||

    // ===== 新規追加パターン =====
    // グロウスキップ
    t.includes('グロウフェイズをスキップする') ||
    // スペル/アーツ打ち消し
    t.includes('スペル') && t.includes('打ち消す') ||
    t.includes('アーツ') && t.includes('打ち消す') ||
    // コスト減少
    t.includes('コストは') && t.includes('減る') ||
    // トラッシュ/エナから場に出す
    t.includes('トラッシュから') && t.includes('場に出す') ||
    t.includes('トラッシュから') && t.includes('場に出してもよい') ||
    t.includes('このシグニをトラッシュから場に出す') ||
    // デッキからサーチして場に出す
    t.includes('デッキから') && t.includes('探して') && t.includes('場に出し') && t.includes('シャッフル') ||
    // デッキからサーチしてトラッシュに置く
    t.includes('デッキから') && t.includes('探して') && t.includes('トラッシュに置き') && t.includes('シャッフル') ||
    // 効果耐性
    t.includes('効果を受けない') ||
    // チャーム
    t.includes('チャーム】にする') || t.includes('チャーム】にしてもよい') ||
    // デッキ公開→条件分岐（multi-sentence）
    t.includes('デッキの一番上を公開する') && t.includes('の場合') ||
    // デッキ上N枚公開してピック（multi-sentence）
    t.includes('公開する') && t.includes('その中から') && t.includes('手札に加える') ||
    // デッキに戻す（バウンス先がデッキ）
    t.includes('デッキに戻す') && t.includes('シャッフル')
  );
}

let auto=0, partial=0, unknown=0;
const unknownList=[];

for(const card of cards){
  const texts=[];
  if(card.EffectText && card.EffectText!=='-'){
    if(card.Type==='アーツ'||card.Type==='スペル'){
      texts.push({id:`${card.CardNum}-E1`, text:card.EffectText});
    } else {
      splitBlocks(card.EffectText).forEach((b,i)=>{
        const colon=b.indexOf('：'); if(colon<0) return;
        texts.push({id:`${card.CardNum}-E${i+1}`, text:b.slice(colon+1).trim()});
      });
    }
  }
  if(card.LifeBurst==='1' && card.BurstText && card.BurstText!=='-'){
    texts.push({id:`${card.CardNum}-BURST`, text:card.BurstText.replace(/^：/,'').trim()});
  }

  for(const {id,text} of texts){
    if(!text||text==='-'){ continue; }
    if(isKnown(text)){ auto++; }
    else { unknown++; unknownList.push({id, cardName:card.CardName, text:text.slice(0,60)}); }
  }
}

console.log(`\n=== 解析率 ===`);
console.log(`AUTO (既知パターン): ${auto}`);
console.log(`UNKNOWN (未対応):    ${unknown}`);
const total=auto+unknown;
console.log(`解析率: ${Math.round(auto/total*100)}% (${auto}/${total})`);

console.log('\n--- UNKNOWN効果（未対応）---');
for(const u of unknownList) console.log(`  [${u.id}] ${u.cardName}: ${u.text}`);

// CardNum異常
const bad=cards.filter(c=>c.CardNum.includes('--'));
if(bad.length) { console.log('\n⚠ CardNum異常:'); bad.forEach(c=>console.log(`  ${c.CardNum} - ${c.CardName}`)); }
