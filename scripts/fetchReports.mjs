// バグ報告の取り込み（§5.6 `C-0`・2026-09-16）＝アプリの「🐛 バグを報告」で溜まった
// `bug_reports` を読み、**リポジトリ側のファイルに落として `OPEN → TRIAGED` を書き戻す**。
//
// 使い方:
//   npm run reports                 # OPEN を全部取り込む（既定）
//   npm run reports -- --list       # 取り込まず一覧だけ（消化印も書かない）
//   npm run reports -- --all        # TRIAGED も含めて取り込む
//   npm run reports -- --keep-open  # 取り込むが消化印を書かない（下見）
//   npm run reports -- --user claude1   # 別アカウントの報告を見る（既定は verify-accounts.json の先頭）
//
// 🔴**supabase MCP は未認証なので REST で読む**（`verifyBattleDrive.mjs` と同じ方式）。
//   ログインは**アプリと同じ `toFakeEmail`**（ユーザー名を base64url 化して `@wixoss.game`）。
//   ⚠アプリ側の `LoginScreen.tsx` の実装が変わったらここも変わる（同じ規則を2箇所に持っている）。
//
// 出力＝`scratchpad-reports/<created_at>_<tag>_<id8>.json`（gitignore 圏内）。
//   🔑**`snapshot.row` は `battle_states` の行そのもの**なので、`scripts/replayReport.mjs` が
//     `verifyBattleDrive.mjs` の注入仕様へそのまま変換できる。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = 'scratchpad-reports';
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const LIST_ONLY = args.includes('--list');
const INCLUDE_ALL = args.includes('--all');
const KEEP_OPEN = args.includes('--keep-open');

const env = readFileSync('.env.local', 'utf-8');
const BASE = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!BASE || !ANON) { console.error('.env.local に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY がありません'); process.exit(1); }

const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;
const wanted = argVal('--user');
const acc = wanted ? accounts.find(a => a.username === wanted) : accounts[0];
if (!acc) { console.error(`アカウント ${wanted} が verify-accounts.json にありません`); process.exit(1); }

/** アプリ（`LoginScreen.tsx`）と同じユーザー名→メール変換。 */
const toFakeEmail = (username) =>
  Buffer.from(username.trim(), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') + '@wixoss.game';

const login = async () => {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: toFakeEmail(acc.username), password: acc.password }),
  });
  const j = await r.json();
  if (!j.access_token) { console.error(`ログイン失敗 (${acc.username}):`, r.status, JSON.stringify(j).slice(0, 200)); process.exit(1); }
  return { apikey: ANON, Authorization: `Bearer ${j.access_token}`, 'Content-Type': 'application/json' };
};

const short = (s, n) => (s ?? '').length > n ? (s.slice(0, n) + '…') : (s ?? '');

(async () => {
  const h = await login();
  const filter = INCLUDE_ALL ? '' : '&status=eq.OPEN';
  const r = await fetch(`${BASE}/rest/v1/bug_reports?select=*${filter}&order=created_at.asc`, { headers: h });
  if (!r.ok) { console.error('取得失敗:', r.status, (await r.text()).slice(0, 300)); process.exit(1); }
  const rows = await r.json();

  if (rows.length === 0) {
    console.log(`報告なし（${acc.username} / ${INCLUDE_ALL ? '全件' : 'OPEN のみ'}）`);
    return;
  }

  console.log(`\n=== バグ報告 ${rows.length}件（${acc.username}）===\n`);
  for (const row of rows) {
    const at = row.snapshot?.at ?? {};
    console.log(`● ${row.created_at}  [${row.tag}]  ${row.status}`);
    console.log(`   ${row.comment ? `「${short(row.comment, 60)}」` : '（コメントなし）'}`);
    console.log(`   T${at.turn_count ?? '?'} ${at.global_phase ?? '?'}/${at.turn_phase ?? '?'}`
      + ` / 手番=${at.isMyTurn === undefined ? '?' : (at.isMyTurn ? '自分' : '相手')}`
      + ` / 対話=${at.pendingInteraction ?? 'なし'}${at.pendingIsMine === true ? '(自分が応答)' : at.pendingIsMine === false ? '(相手が応答)' : ''}`
      + ` / stack=${at.stackLen ?? '?'} / life=${at.life?.me ?? '?'}-${at.life?.opp ?? '?'}`);
    console.log(`   build=${row.app_version} room=${row.room_id ?? '-'} id=${row.id}`);
    console.log('');
  }

  if (LIST_ONLY) { console.log('（--list＝取り込みも消化印も書いていません）'); return; }

  mkdirSync(OUT_DIR, { recursive: true });
  const written = [];
  for (const row of rows) {
    const stamp = (row.created_at ?? '').replace(/[:.]/g, '-').slice(0, 19);
    const file = join(OUT_DIR, `${stamp}_${row.tag}_${String(row.id).slice(0, 8)}.json`);
    writeFileSync(file, JSON.stringify(row, null, 2), 'utf-8');
    written.push(file);
  }
  console.log(`${written.length}件を ${OUT_DIR}/ に保存:`);
  written.forEach(f => console.log('  ' + f));

  if (KEEP_OPEN) { console.log('\n（--keep-open＝消化印は書いていません。もう一度取り込めます）'); return; }

  // 🔴**消化印を書く**＝書かないと次回も同じ報告を取り込み続け、「新しい報告が来たか」が分からなくなる
  //   （`semanticAuditBugList.mjs` の「消化側を引き算しないと在庫が永久に減らない」と同じ罠）。
  const ids = rows.filter(x => x.status === 'OPEN').map(x => x.id);
  if (ids.length === 0) { console.log('\nOPEN は無かったので消化印は書きません。'); return; }
  const inList = `(${ids.map(id => `"${id}"`).join(',')})`;
  const up = await fetch(`${BASE}/rest/v1/bug_reports?id=in.${encodeURIComponent(inList)}`, {
    method: 'PATCH', headers: { ...h, Prefer: 'return=representation' },
    body: JSON.stringify({ status: 'TRIAGED' }),
  });
  if (!up.ok) { console.error('\n⚠消化印の書き込みに失敗（次回も同じ報告が出ます）:', up.status, (await up.text()).slice(0, 300)); process.exit(1); }
  console.log(`\n${(await up.json()).length}件を OPEN → TRIAGED にしました。`);
  console.log(`次の一手＝ node scripts/replayReport.mjs ${written[0]}`);
})();
