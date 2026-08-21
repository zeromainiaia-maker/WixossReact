/**
 * 段3（単発 findings）を段2 へ寄せ直す再クラスタ化（2026-08-21・続き592）
 *
 * PLAN §6.2 段3 の「claim の語彙軸で括り直せば parser 規則に還元できる塊が残っている見込み」を実装。
 * ⚠**quote の正規化（カード名・クラス名・数字のマスク）では束ならない**＝実測で 42クラスタ/92件だけ・659件が残った。
 *   単発 findings は quote がカード固有なので、**claim が語る「欠けている語彙キー」**を軸にする。
 *
 *   node scripts/archive/semanticAuditRecluster.mjs [--axis <キー>] [--list]
 *
 * 軸は**最長一致優先の単一割当**（1 finding = 1軸）＝段2 の parser 規則1本に対応づける単位にするため。
 */
import { readFileSync, writeFileSync } from 'fs';

const DIR = 'scripts/archive/scratchpad/semantic_audit_clean_round1';
const J = JSON.parse(readFileSync(DIR + '/clusters_stage0.json', 'utf8'));
const S = J.singles;
const eff = new Map();
for (const f of ['effects_WX.json', 'effects_WXDi.json', 'effects_WX24_26.json', 'effects_WXK.json', 'effects_misc.json'])
  for (const [, v] of Object.entries(JSON.parse(readFileSync('public/data/' + f, 'utf8')))) for (const e of v ?? []) eff.set(e.effectId, e);

// ⚠順序が意味を持つ（先に書いたものが勝つ）＝具体的な語彙キーを上に、包括的な軸を下に置く。
const AXES = [
  ['usageLimit',        /《ターン[０-９0-9一二三]+回》|ターン[０-９0-9一二三]+回(制限|しか|まで|の制限)|《ゲーム[０-９0-9一二三]+回》/],
  ['特殊機構',          /【?(チーム|ライズ|リコレクト|ハーモニー|エクシード|ドリームチーム|ベット|アシスト)】?(起)?|＜?ドリーム/],
  ['キーワード能力',    /【?(アサシン|ダブルクラッシュ|トリプルクラッシュ|ランサー|シャドウ|マルチエナ|ガード|バニッシュされない|シグニバリア|ルリグバリア|Sランサー)】?/],
  ['能力種別(常/自/起)',/【(常|自|起|出|action)】能力|能力(全般|だけ)を(失|得)/],
  ['プレイヤー選択',    /あなたか対戦相手|あなたと対戦相手|どちらか|プレイヤーを(選|自分か)/],
  ['アタック状態',      /アタックし(ている|た)|アタック中|アタックしたすべて/],
  ['action丸ごと欠落',  /処理が(JSONに)?(ない|無い|存在しない)|能力が(JSONに)?(ない|存在しない)|がJSONに(ない|存在しない|ありません)$|丸ごと|実装されていない/],
  ['filter.cardName',   /カード名(指定|に|が)|《[^》]+》を含む|《[^》]+》に限定|名前に「|指定された[０-９0-9]+種類/],
  ['filter.hasIcon',    /アイコン》を(持つ|持たない)|《[^》]*アイコン》(の|を)/],
  ['filter.状態',       /【?(チャーム|アクセ|ソウル|ウィルス|シード)】?(が(付いて|ある|付く)|されて(いる|いた))|凍結状態|感染状態|アップ状態|ダウン状態|【?ライフバースト】?を(持つ|持たない)|能力を持たない|レゾナ/],
  ['filter.story',      /＜[^＞]+＞|クラスを持|同じクラス/],
  ['filter.color',      /(白|青|赤|緑|黒|無)(の|色)(シグニ|カード|ルリグ|エナ)|共通する色|色を持/],
  ['filter.level',      /レベル(が|の)?(奇数|偶数)|レベル[０-９0-9]|レベル(以下|以上|の合計)/],
  ['filter.power',      /パワー[０-９0-9,]+(以上|以下)|パワーが[０-９0-9,]|パワー(以下|以上)|基本パワー/],
  ['owner/主語',        /(あなた|自分)の(シグニ|カード)?(ではなく|に限定|のはず)|対戦相手の(シグニ|カード)?(ではなく|に限定|のはず)|主語|所有者|双方の|任意の所有者/],
  ['count/upTo',        /枚数|体数|[０-９0-9]+(枚|体|つ)(まで|ではなく|しか)|上限|「まで」|好きな数/],
  ['cost',              /コスト|ignoreCost|支払|エクシード|【?ハーモニー】?/],
  ['duration',          /持続|継続期間|duration|ターン終了時まで|次のターン/],
  ['timing/trigger',    /タイミング|発動条件|トリガー|とき(の限定)?|timing|【自】|フェイズ/],
  ['順序/構造',         /順(番|序)|条件判定前|連続実行|代わりに|先に|後に|入れ替わ|反転|圧縮/],
  ['condition',         /条件が(欠落|ない|無い|ありません)|場合(という条件)?が(欠落|ない)|であるかぎり|条件節|条件なし|無条件/],
];
const classify = (f) => {
  const t = f.quote + ' ' + f.claim;
  for (const [k, re] of AXES) if (re.test(t)) return k;
  return '(未分類)';
};

const rows = S.map((f) => {
  const e = eff.get(f.effectId);
  return { ...f, axis: classify(f), actionType: e?.action?.type ?? '(none)', hasCond: !!e?.condition, hasTrig: !!e?.triggerCondition };
});

const byAxis = new Map();
for (const r of rows) { if (!byAxis.has(r.axis)) byAxis.set(r.axis, []); byAxis.get(r.axis).push(r); }
const sorted = [...byAxis.entries()].sort((a, b) => b[1].length - a[1].length);

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
const only = arg('axis');
if (only) {
  const v = byAxis.get(only) ?? [];
  console.log(`【${only}】${v.length}件`);
  for (const r of v) console.log(`  ${r.effectId} [${r.severity}/${r.type}] (${r.actionType}) 「${r.quote.slice(0, 30)}」 ${r.claim.slice(0, 95)}`);
  process.exit(0);
}

let out = '=== 段3 単発751件の再クラスタ化（欠落語彙キー軸・最長一致優先の単一割当）===\n\n';
out += '| 軸 | 件数 | HIGH | MISSING | WRONG | 主な action 型 |\n|---|---:|---:|---:|---:|---|\n';
for (const [k, v] of sorted) {
  const h = v.filter((r) => r.severity === 'HIGH').length;
  const m = v.filter((r) => r.type === 'MISSING').length;
  const w = v.filter((r) => r.type === 'WRONG').length;
  const at = {};
  for (const r of v) at[r.actionType] = (at[r.actionType] ?? 0) + 1;
  const top = Object.entries(at).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([a, n]) => `${a}(${n})`).join(' ');
  out += `| ${k} | ${v.length} | ${h} | ${m} | ${w} | ${top} |\n`;
}
out += `\n合計 ${rows.length}件\n\n`;
for (const [k, v] of sorted) {
  out += `\n${'='.repeat(70)}\n【${k}】${v.length}件\n${'='.repeat(70)}\n`;
  for (const r of v) out += `${r.effectId}\t[${r.severity}/${r.type}]\t${r.actionType}\t「${r.quote.slice(0, 30)}」\t${r.claim}\n`;
}
writeFileSync(DIR + '/stage3_recluster.txt', out, 'utf8');
writeFileSync(DIR + '/stage3_recluster.json', JSON.stringify(
  sorted.map(([k, v]) => ({ axis: k, n: v.length, findings: v.map((r) => ({ effectId: r.effectId, cardNum: r.cardNum, severity: r.severity, type: r.type, actionType: r.actionType, quote: r.quote, claim: r.claim })) })), null, 1), 'utf8');
console.log(out.split('\n\n')[0] + '\n\n' + out.split('\n\n')[1]);
