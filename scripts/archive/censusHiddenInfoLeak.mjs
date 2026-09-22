// 非公開情報リーク・センサス（§5.1 `V-286`・2026-09-22新設）
//   実行: node --max-old-space-size=8192 scripts/archive/censusHiddenInfoLeak.mjs [--traces <path>]
//   既定の入力: node_modules/.tmp/traceinv_traces.json（`npm run census:traceinv` が作る全カードのトレース）
//
// 🔴**ねらい**＝`game_logs` は部屋で1本（`appendBattleLogs` → `append_battle_logs` RPC → Realtime で相手へ）で
//   **閲覧者ごとの絞り込みが型にも実装にも無い**＝engine が `addLog` に書いた札の名前はそのまま相手の画面に出る。
//   `V-285`（【トラップ】）の横展開として、同じ穴を全数で出すために書いた。
//
// 🔑**なぜ grep では足りないか**＝`V-285` の教訓そのもの＝文言が揺れる（「【トラップ】として」「トラップとして」）と
//   在庫から漏れる。トレース（原文・盤面・**盤面差分**・ログ）を突き合わせれば**移動の向き**で数えられる。
//
// 2群で数える
//   群1＝非公開ゾーン（手札／デッキ）の札が**裏向きの置き場**（【トラップ】【チャーム】【シード】
//        【マジックボックス】ライフクロス／裏向きシグニ／裏向きルリグゾーン）へ行くのにログが名指し
//   群2＝非公開ゾーンに**留まったまま**なのにログが名指し（「見る」／場に出せず残った札／デッキ内移動）
//
// 📏**実測（2026-09-22）**＝修正前 群1 48件 / 群2 174件 → 修正後 群1 1件 / 群2 46件。
// ⚠🔴**候補出しであって判定ではない。** 残りは全件が偽陽性で、内訳は4型：
//   (a) 原文に「公開」がある（群2 の 38件）＝正当に公開された札
//   (b) 途中で公開領域を経由した（デッキ→**トラッシュ**→ライフ＝`WXK11-026-BURST`）
//   (c) 行き先が公開領域（場に出た／トラッシュへ／チェックゾーンへ）＝差分の追跡漏れ
//   (d) 同名別インスタンス（`サーバント　Ｑ` と `サーバント　Ｑ４`）
//   ⇒ **件数をそのままバグ数と読まない。** 1件ずつ「その札を相手が見ていたか」で判定する。
// ⚠トレースはハーネス盤面しか踏まない＝0件は「漏れていない」ではない（grep 走査と併用する）。
// ⚠🔒印つきの行は `addPrivateLog`（DB へ行かない自分だけの行）＝漏れではないので数えない。
import fs from 'fs';
const argOf = (n) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : undefined; };
const T = JSON.parse(fs.readFileSync(argOf('--traces') ?? 'node_modules/.tmp/traceinv_traces.json', 'utf8'));

const HIDDEN_DEST = /^(自|相)(ライフ|トラップ\d|チャーム\d|シード\d|マジックボックス\d|ルリグゾーン裏向き|裏向きシグニ\d|裏向き付け\d)/;
const isPub = (t) => /公開|宣言/.test(t || '');

const f1 = new Map();
const f2 = new Map();

for (const c of T) for (const tr of c.traces) {
  const alias = new Map();
  const hidden = new Map(); // name -> zone
  for (const line of tr.board || []) {
    const zone = (line.match(/^([^:]+):/) ?? [, ''])[1];
    for (const m of line.matchAll(/([^\s,:(（]+)=《([^》]+)》/g)) {
      alias.set(m[1], m[2]);
      if (/手札|デッキ/.test(zone)) hidden.set(m[2], zone);
    }
  }
  const sets = [['base', tr.runs], ...Object.entries(tr.variants ?? {}).map(([k, v]) => [k, v.runs])];
  for (const [vn, rs] of sets) for (const [rk, r] of Object.entries(rs || {})) {
    const logs = (r.logs || []).filter(l => !l.startsWith('\u{1F512}'));
    if (!logs.length) continue;
    const moved = new Set();
    for (const d of r.diff || []) {
      const m = d.match(/^([^:]+):\s*(.+?)\s*→\s*(.+)$/);
      if (!m) continue;
      moved.add(alias.get(m[1].trim()) ?? '');
      if (!HIDDEN_DEST.test(m[3].trim())) continue;
      if (!/デッキ|手札/.test(m[2])) continue;           // 出所が公開領域なら相手は既に見ている
      const name = alias.get(m[1].trim());
      if (!name) continue;
      const leaked = logs.filter(l => l.includes(name));
      if (!leaked.length) continue;
      const key = `${tr.effectId}|${m[3].trim()}`;
      if (!f1.has(key)) f1.set(key, { id: tr.effectId, text: tr.abilityText, from: m[2], to: m[3].trim(), name, logs: leaked, run: `${vn}/${rk}` });
    }
    for (const [name, zone] of hidden) {
      if (moved.has(name) || f2.has(tr.effectId)) continue;
      const leaked = logs.filter(l => l.includes(name));
      if (leaked.length) f2.set(tr.effectId, { id: tr.effectId, text: tr.abilityText, zone, name, logs: leaked });
    }
  }
}

const show = (title, list) => {
  const real = list.filter(x => !isPub(x.text));
  console.log(`\n■ ${title}: ${list.length}件（原文に「公開/宣言」あり＝偽陽性 ${list.length - real.length}）`);
  for (const x of real) {
    console.log(`  ${x.id} [${x.from ?? x.zone}${x.to ? ' → ' + x.to : ''}] ${x.name}`);
    for (const l of x.logs.slice(0, 2)) console.log(`      LOG: ${l.slice(0, 120)}`);
  }
};
show('群1 非公開ゾーンの札が裏向きの置き場へ行くのにログが名指し（【トラップ】と同型）', [...f1.values()]);
show('群2 非公開ゾーンに留まったままログが名指し', [...f2.values()]);
