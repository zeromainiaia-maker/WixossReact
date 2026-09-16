// バグ報告の triage / 再現（§5.6 `C-0`・2026-09-16）。
//
// 使い方:
//   node scripts/replayReport.mjs                          # ⓪ 溜まった報告を1画面で一覧＋同症状を束ねる
//   node scripts/replayReport.mjs <report.json>            # ① triage ビュー（読むだけ）
//   node scripts/replayReport.mjs <report.json> --logs 50  # ログをN件表示
//   node scripts/replayReport.mjs <report.json> --inject    # ② claude1 の PLAYING ルームへ復元
//
// 🔴**`verifyBattleDrive.mjs` の `injectScenario` は使えない**＝あちらは**シナリオ間の汚染を防ぐため
//   「盤面の物理配置」9フィールド以外を意図的に全部消し、ダウン/凍結/チャーム等のマーカーも既定値へ戻す**。
//   バグ報告の再現で欲しいのは真逆＝**一時状態も含めてそのままの盤面**（`pending_effect` の途中や
//   「このターンの間」のフラグにこそバグが居る）。だから全行 PATCH の別経路にする。
//
// 🔴**ID の張り替えが要る**＝報告はユーザーのアカウントの `room_id`/`host_id`/`guest_id` を持つが、
//   復元先は claude1 のルーム。`active_user_id` と `pending_effect.sourcePlayerId` /
//   `respondPlayerId` も同じ ID を指すので、**行全体を再帰的に張り替える**（1箇所でも漏れると
//   「自分の番なのに応答できない」偽のソフトロックを自分で作る）。
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const REPORT_DIR = 'scratchpad-reports';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const LOG_N = argVal('--logs') ? parseInt(argVal('--logs'), 10) : 20;
const INJECT = args.includes('--inject');
const file = args.find(a => !a.startsWith('--'));

// ── 引数なし＝**溜まった報告を1画面で見る**（§5.6・2026-09-17）────────────────
// 🔴**なぜ要るか**＝実測で 1件 ≒ 20KB。6件を1件ずつ開くと出力が6倍になり、
//   「どれから取るか」を決める前に読む量が増える。**先に束ねて、取るものを1つ選ぶ**。
if (!file) {
  if (!existsSync(REPORT_DIR)) {
    console.error(`使い方: node scripts/replayReport.mjs [<report.json>] [--logs N] [--inject]`);
    console.error(`  引数なし＝${REPORT_DIR}/ の全報告をまとめて一覧（まず npm run reports で取り込む）`);
    process.exit(1);
  }
  const files = readdirSync(REPORT_DIR).filter(f => f.endsWith('.json')).sort();
  if (files.length === 0) { console.log(`${REPORT_DIR}/ は空です（npm run reports で取り込んでください）`); process.exit(0); }
  const items = files.map(f => {
    const r = JSON.parse(readFileSync(join(REPORT_DIR, f), 'utf-8'));
    const at = r.snapshot?.at ?? {};
    const logs = r.snapshot?.row?.game_logs ?? [];
    return { f, r, at, lastLog: [logs.at(-1)?.action, logs.at(-1)?.detail].filter(Boolean).join(' ') };
  });
  console.log(`
=== 溜まっている報告 ${items.length}件（${REPORT_DIR}/）===
`);
  for (const it of items) {
    const a = it.at;
    console.log(`[${it.r.tag}] ${it.r.comment ?? '（コメントなし）'}`);
    console.log(`   T${a.turn_count ?? '?'} ${a.turn_phase ?? '?'}`
      + ` 手番=${a.isMyTurn ? '自分' : '相手'} 対話=${a.pendingInteraction ?? 'なし'}`
      + ` stack=${a.stackLen ?? '?'} life=${a.life?.me ?? '?'}-${a.life?.opp ?? '?'}`
      + `  ${it.f}`);
    if (it.lastLog) console.log(`   最後のログ: ${it.lastLog.slice(0, 90)}`);
  }
  // 🔑**束ねる**＝同じ症状を何度も報告されることは普通なので、**取る単位は「束」**にする。
  //   キー＝タグ × フェイズ × 開いている対話 × 最後のログ（同じ壊れ方なら一致しやすい）。
  const groups = new Map();
  for (const it of items) {
    const k = `${it.r.tag}|${it.at.turn_phase ?? '?'}|${it.at.pendingInteraction ?? '-'}|${it.lastLog.slice(0, 40)}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(it);
  }
  const dup = [...groups.values()].filter(g => g.length > 1);
  if (dup.length) {
    console.log(`
── 同じ症状らしい束（${dup.length}組）──`);
    for (const g of dup) {
      console.log(`  ×${g.length}  [${g[0].r.tag}] ${g[0].at.turn_phase} / ${g[0].lastLog.slice(0, 60)}`);
      console.log(`        代表: ${g[0].f}`);
    }
    console.log('  ⚠束は「同じバグ」の保証ではない（キーが一致しただけ）＝代表1件を読んで確かめる。');
  }
  console.log(`
1件を詳しく: node scripts/replayReport.mjs ${join(REPORT_DIR, items[0].f)}`);
  process.exit(0);
}

const report = JSON.parse(readFileSync(file, 'utf-8'));
const row = report.snapshot?.row;
const at = report.snapshot?.at ?? {};
if (!row) { console.error('snapshot.row がありません（古い形式の報告？）'); process.exit(1); }

const TAG_JA = {
  stuck: '進まない・押せない', no_button: 'できるはずが出ない',
  wrong: '起きるはずがないことが起きた', order: '順番・タイミングが変', other: 'その他',
};

// ── ① triage ビュー ────────────────────────────────────────────
const zones = (s) => s ? `手${(s.hand ?? []).length} デ${(s.deck ?? []).length} エナ${(s.energy ?? []).length}`
  + ` トラ${(s.trash ?? []).length} ライフ${(s.life_cloth ?? []).length}` : '-';
const fieldOf = (s) => s?.field ? JSON.stringify((s.field.signi ?? []).map(z => z?.at?.(-1) ?? null)) : '-';
const isHost = row.host_id === report.snapshot?.row?.host_id;   // 報告者視点は at.* が持つ
const me = at.isMyTurn === undefined ? null : (isHost ? row.host_state : row.guest_state);

console.log(`
══════════ バグ報告 ══════════
報告      : [${report.tag}] ${TAG_JA[report.tag] ?? report.tag}
コメント  : ${report.comment ?? '（なし）'}
日時/版   : ${report.created_at ?? at.reportedAt ?? '-'} / ${report.app_version ?? '-'}
状態      : ${report.status ?? '-'}   id=${report.id ?? '-'}

── 局面 ──
フェイズ  : ${row.global_phase}${row.setup_phase ? '/' + row.setup_phase : ''} / ${row.turn_phase}  ターン${row.turn_count}
手番      : ${at.isMyTurn ? '報告者' : '相手'}
対話      : ${at.pendingInteraction ?? 'なし'}${at.pendingIsMine === true ? '（報告者が応答する番）' : at.pendingIsMine === false ? '（相手が応答する番）' : ''}
スペル待ち: ${at.pendingSpell ? 'あり' : 'なし'}   スタック残: ${at.stackLen ?? '?'}
ライフ    : 報告者 ${at.life?.me ?? '?'} / 相手 ${at.life?.opp ?? '?'}

── 盤面 ──
host  : ${zones(row.host_state)}  場=${fieldOf(row.host_state)}
guest : ${zones(row.guest_state)}  場=${fieldOf(row.guest_state)}
`);

if (row.pending_effect) {
  const pe = row.pending_effect;
  console.log('── 開いている対話（pending_effect）──');
  console.log(`  効果      : ${pe.sourceCardNum} [${pe.effectId}]`);
  console.log(`  種類      : ${pe.interaction?.type}`);
  const it = pe.interaction ?? {};
  if (it.type === 'SELECT_TARGET') {
    console.log(`  候補      : ${(it.candidates ?? []).length}件 ${JSON.stringify((it.candidates ?? []).slice(0, 8))}`);
    console.log(`  要求枚数  : ${it.count} / 任意=${!!it.optional} / 制約=${JSON.stringify(it.selectionConstraint ?? null)}`);
    // 🔑`O-530` 型（制約が `count` 枚を許さない＝決定が押せない）の一次切り分け。
    if (it.selectionConstraint && !it.optional) {
      console.log('  ⚠強制選択＋集合制約＝`O-530` 型のソフトロック候補（選べる最大枚数を確認すること）');
    }
  } else if (it.type === 'CHOOSE') {
    console.log(`  選択肢    : ${JSON.stringify((it.options ?? []).map(o => `${o.id}${o.available === false ? '(不可)' : ''}`))}`);
    if ((it.options ?? []).every(o => o.available === false)) {
      console.log('  ⚠全選択肢が `available:false`＝**押せる肢が1つも無い**（ソフトロック）');
    }
  } else if (it.type === 'SEARCH') {
    console.log(`  公開札    : ${(it.visibleCards ?? []).length}件 / maxPick=${it.maxPick} / 任意=${!!it.optional}`);
  }
  console.log('');
}

const logs = row.game_logs ?? [];
console.log(`── ログ（末尾${Math.min(LOG_N, logs.length)}件 / 保存${logs.length}件）──`);
for (const l of logs.slice(-LOG_N)) {
  console.log('  ' + [l.action, l.detail].filter(Boolean).join(' '));
}

if (!INJECT) {
  console.log(`
──────────────────────────────
次の一手:
  engine のバグらしい → 上の pending_effect を golden で再現する（盤面は snapshot.row にある）
  実機の詰まりらしい   → node scripts/replayReport.mjs ${file} --inject
`);
  process.exit(0);
}

// ── ② 注入（claude1 の PLAYING ルームへ全行復元）─────────────────
const env = readFileSync('.env.local', 'utf-8');
const BASE = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
const acc = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts[0];
const toFakeEmail = (u) => Buffer.from(u.trim(), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') + '@wixoss.game';

/** 行の中の ID 文字列を再帰的に張り替える（値としての完全一致だけを置換する）。 */
function remapIds(value, map) {
  if (typeof value === 'string') return map[value] ?? value;
  if (Array.isArray(value)) return value.map(v => remapIds(v, map));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = remapIds(v, map);
    return out;
  }
  return value;
}

(async () => {
  const lr = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: toFakeEmail(acc.username), password: acc.password }),
  });
  const lj = await lr.json();
  if (!lj.access_token) { console.error('ログイン失敗:', lr.status, JSON.stringify(lj).slice(0, 200)); process.exit(1); }
  const h = { apikey: ANON, Authorization: `Bearer ${lj.access_token}`, 'Content-Type': 'application/json' };
  const uid = lj.user?.id;

  const rr = await fetch(`${BASE}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
  const roomId = (await rr.json())?.[0]?.id;
  if (!roomId) {
    console.error('claude1 の PLAYING ルームがありません。');
    console.error('先に `node scripts/verifyBattleDrive.mjs <任意のシナリオ>` などで CPU 対戦を1つ開始してください。');
    process.exit(1);
  }
  const cur = await (await fetch(`${BASE}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_id,guest_id`, { headers: h })).json();
  const live = cur?.[0];
  if (!live) { console.error('battle_states が見つかりません'); process.exit(1); }

  // 🔴報告側の ID → いまのルームの ID へ。**行全体を再帰で張り替える**（`active_user_id` と
  //   `pending_effect.sourcePlayerId` / `respondPlayerId` も同じ ID を指すため）。
  const map = { [row.host_id]: live.host_id, [row.guest_id]: live.guest_id, [row.room_id]: roomId };
  const patch = remapIds({
    global_phase: row.global_phase, setup_phase: row.setup_phase,
    turn_phase: row.turn_phase, turn_count: row.turn_count, active_user_id: row.active_user_id,
    host_state: row.host_state, guest_state: row.guest_state,
    pending_spell: row.pending_spell, pending_effect: row.pending_effect, effect_stack: row.effect_stack,
    first_player_id: row.first_player_id, winner_id: row.winner_id,
    host_mulligan_done: row.host_mulligan_done, guest_mulligan_done: row.guest_mulligan_done,
    host_lrig_selected: row.host_lrig_selected, guest_lrig_selected: row.guest_lrig_selected,
    game_logs: row.game_logs ?? [],
  }, map);

  mkdirSync('node_modules/.tmp', { recursive: true });
  writeFileSync('node_modules/.tmp/replay_row.json', JSON.stringify(patch, null, 2), 'utf-8');

  const up = await fetch(`${BASE}/rest/v1/battle_states?room_id=eq.${roomId}`, {
    method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(patch),
  });
  if (!up.ok) { console.error('注入失敗:', up.status, (await up.text()).slice(0, 400)); process.exit(1); }
  console.log(`\n✅ 注入しました（room=${roomId}）。claude1 でその対戦を開くと報告時の盤面が出ます。`);
  console.log('   張り替えた ID:', JSON.stringify(map, null, 0));
  console.log('   注入した行 : node_modules/.tmp/replay_row.json');
})();
