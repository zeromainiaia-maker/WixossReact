// 【シグニバリア】【ルリグバリア】付与の配線修正。
// パーサが付与を GRANT_KEYWORD(keyword:"○バリア") というプレースホルダにしていた箇所を
// GAIN_SIGNI_BARRIER / GAIN_LRIG_BARRIER stub に置換し、付与が落ちていたカードには追加する。
// effects JSON は正データのため、build:effects 再生成ではなく本スクリプトで直接ミニファイ保存する。
import fs from 'fs';

const dir = 'public/data';
const files = ['effects_WX.json', 'effects_WXK.json', 'effects_WXDi.json', 'effects_misc.json', 'effects_WX24_26.json'];

const KW_TO_STUB = { 'シグニバリア': 'GAIN_SIGNI_BARRIER', 'ルリグバリア': 'GAIN_LRIG_BARRIER' };
// カウント上書き（テキストが「N つを得る」のカード）
const COUNT_OVERRIDE = { 'WXDi-P16-003': 2 }; // 【ルリグバリア】２つを得る

const gain = (id, count) => (count && count !== 1 ? { type: 'STUB', id, count } : { type: 'STUB', id });

// GRANT_KEYWORD(keyword:○バリア) → GAIN_*_BARRIER stub に再帰置換
function replaceKw(node, cardNum) {
  if (Array.isArray(node)) { node.forEach((v, i) => { node[i] = replaceKw(v, cardNum); }); return node; }
  if (node && typeof node === 'object') {
    if (node.type === 'GRANT_KEYWORD' && KW_TO_STUB[node.keyword]) {
      return gain(KW_TO_STUB[node.keyword], COUNT_OVERRIDE[cardNum]);
    }
    for (const k of Object.keys(node)) node[k] = replaceKw(node[k], cardNum);
  }
  return node;
}

// 既存アクションを SEQUENCE でラップして GAIN step を後置
function appendGain(effect, ...stubs) {
  const orig = effect.action;
  if (orig && orig.type === 'SEQUENCE') orig.steps.push(...stubs);
  else effect.action = { type: 'SEQUENCE', steps: [orig, ...stubs] };
}

const data = {};
const fileOf = {};
for (const f of files) {
  const o = JSON.parse(fs.readFileSync(`${dir}/${f}`, 'utf8'));
  data[f] = o;
  for (const k of Object.keys(o)) fileOf[k] = f;
}

// 1) プレースホルダ置換（全カード）
for (const f of files) {
  for (const [num, effs] of Object.entries(data[f])) replaceKw(effs, num);
}

// 2) 付与が落ちていたカードへの追加
const S = () => gain('GAIN_SIGNI_BARRIER');
const L = () => gain('GAIN_LRIG_BARRIER');
const find = (num) => data[fileOf[num]][num];

// WXDi-P12-001 黒点の記憶: ...デッキ下に置く。【シグニバリア】1+【ルリグバリア】1を得る
appendGain(find('WXDi-P12-001')[0], S(), L());
// WXDi-CP02-001 ティーパーティー: ...【シグニバリア】1を得る
appendGain(find('WXDi-CP02-001')[0], S());
// WX25-P3-001 ホワイト・ディストラクト: ...【ルリグバリア】1を得る
appendGain(find('WX25-P3-001')[0], L());
// WXDi-P14-001 スプラッシュフィールド 選択肢①: ...【シグニバリア】1を得る（②のルリグバリアは置換済）
{
  const choose = find('WXDi-P14-001')[0].action; // CHOOSE
  const c0 = choose.choices[0]; // 選択肢1
  const orig = c0.action;
  c0.action = orig.type === 'SEQUENCE' ? (orig.steps.push(S()), orig) : { type: 'SEQUENCE', steps: [orig, S()] };
}

// 保存（ミニファイ）
for (const f of files) {
  fs.writeFileSync(`${dir}/${f}`, JSON.stringify(data[f]), 'utf8');
}
console.log('done: barrier grants wired');
