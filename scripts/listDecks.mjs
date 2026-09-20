// デッキの一覧・中身表示・書き出し（§5.6.5・2026-09-20）＝
// **ユーザーが作った実戦的な CPU デッキを、どの Claude セッションからも同じ手順で見られるようにする道具**。
//
// 使い方:
//   node scripts/listDecks.mjs                         # 既定ユーザー（カルカドール）のデッキ一覧
//   node scripts/listDecks.mjs --user claude1          # 別アカウント
//   node scripts/listDecks.mjs --name WD08             # 1デッキの中身（カード名つき）
//   node scripts/listDecks.mjs --cpu                   # deck_kind='cpu' だけ
//   node scripts/listDecks.mjs --export scratchpad-decks   # 全デッキを JSON へ書き出し（gitignore 圏内）
//
// 🔴🔑**認証情報は `verify-accounts.json`（gitignore 圏内）にだけ置く。ここにも docs にも書かない。**
//   ⚠その1ファイルが無い環境ではこのスクリプトは動かない＝**クローンし直すと再現できない**（§5.6.5 の既知の穴）。
// 🔴**supabase MCP は未認証なので REST で読む**（`fetchReports.mjs` / `verifyBattleDrive.mjs` と同じ方式）。
//   ログインは**アプリと同じ `toFakeEmail`**（ユーザー名を UTF-8 → base64url 化して `@wixoss.game`）。
//   ⚠アプリ側の `LoginScreen.tsx` が変わったらここも変わる（同じ規則を3箇所に持っている）。
// 🔑**RLS は既定が「本人の行だけ」**＝ログインしたアカウントのデッキしか返らない。0件を「無い」と即断しない。
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { allAccounts, findAccount } from './verifyAccounts.mjs';
import { join } from 'node:path';

const DEFAULT_USER = 'カルカドール';   // CPU デッキ作成用（ユーザー本人）
const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const USER = argVal('--user') ?? DEFAULT_USER;
const NAME = argVal('--name');
const EXPORT_DIR = argVal('--export');
const CPU_ONLY = args.includes('--cpu');

const env = readFileSync('.env.local', 'utf-8');
const BASE = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!BASE || !ANON) { console.error('.env.local に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY がありません'); process.exit(1); }

// ⚠**読むだけ**なので全件から探してよい（`harness:false` のユーザー本人アカウントが既定）。
const accounts = allAccounts();
const acc = findAccount(USER);
if (!acc) {
  console.error(`アカウント「${USER}」が verify-accounts.json にありません。`);
  console.error(`  登録済み: ${accounts.map(a => a.username).join(' / ')}`);
  process.exit(1);
}

/** アプリ（`LoginScreen.tsx`）と同じユーザー名→メール変換。 */
const toFakeEmail = (username) =>
  Buffer.from(username.trim(), 'utf8').toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') + '@wixoss.game';

/** カード番号→カード名（`public/data` の CSV から素朴に引く。ヘッダは CardNum,CardName,… 固定）。 */
function loadCardNames() {
  const names = new Map();
  for (const f of [...Array.from({ length: 11 }, (_, i) => `CardData_Sheet${i + 1}.csv`), 'CardData_TK.csv']) {
    let text;
    try { text = readFileSync(join('public/data', f), 'utf-8'); } catch { continue; }
    for (const line of text.split(/\r?\n/).slice(1)) {
      const c = line.indexOf(','); if (c < 0) continue;
      const num = line.slice(0, c).trim();
      const rest = line.slice(c + 1);
      const c2 = rest.indexOf(',');
      if (num && !names.has(num)) names.set(num, (c2 < 0 ? rest : rest.slice(0, c2)).trim());
    }
  }
  return names;
}

(async () => {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: toFakeEmail(acc.username), password: acc.password }),
  });
  const j = await r.json();
  if (!j.access_token) {
    console.error(`ログイン失敗 (${acc.username}): ${r.status} ${j.error_code ?? j.msg ?? ''}`);
    console.error('  ⚠ユーザー名・パスワードは verify-accounts.json の値をそのまま使います（大文字小文字は区別されます）。');
    process.exit(1);
  }
  const h = { apikey: ANON, Authorization: `Bearer ${j.access_token}` };
  const dr = await fetch(`${BASE}/rest/v1/decks?select=*&order=created_at.asc`, { headers: h });
  if (!dr.ok) { console.error('decks 取得失敗:', dr.status, (await dr.text()).slice(0, 300)); process.exit(1); }
  let decks = await dr.json();
  if (CPU_ONLY) decks = decks.filter(d => d.deck_kind === 'cpu');
  if (NAME) decks = decks.filter(d => (d.name ?? '').includes(NAME));

  if (decks.length === 0) {
    console.log(`デッキなし（${acc.username}${NAME ? ` / 名前に「${NAME}」を含む` : ''}${CPU_ONLY ? ' / CPU のみ' : ''}）`);
    console.log('  ⚠RLS は既定で本人の行しか返しません＝別アカウントのデッキはここには出ません。');
    return;
  }

  const names = loadCardNames();
  const nameOf = (n) => names.get(String(n).split('#')[0]) ?? n;
  const valid = (d) => (d.main_deck?.length ?? 0) === 40 && (d.lrig_deck?.length ?? 0) > 0;

  // ── 1デッキの中身 ──
  if (NAME) {
    for (const d of decks) {
      console.log(`\n═══ ${d.name}（${d.deck_kind ?? 'player'}${d.cpu_plan ? '・作戦データあり' : ''}）id=${d.id} ═══`);
      console.log(`フォーマット: ${d.deck_format ?? '(未設定)'}   センター: ${nameOf(d.center_lrig)}`
        + `   アシスト: ${[d.assist_lrig_l, d.assist_lrig_r].filter(Boolean).map(nameOf).join(' / ') || 'なし'}`);
      const count = (arr) => {
        const m = new Map();
        for (const n of arr ?? []) m.set(n, (m.get(n) ?? 0) + 1);
        return [...m].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0])));
      };
      console.log(`\nメインデッキ ${d.main_deck?.length ?? 0}枚（${count(d.main_deck).length}種）`);
      for (const [num, n] of count(d.main_deck)) console.log(`   ${String(n)}× ${nameOf(num)}  (${num})`);
      console.log(`\nルリグデッキ ${d.lrig_deck?.length ?? 0}枚`);
      for (const [num, n] of count(d.lrig_deck)) console.log(`   ${String(n)}× ${nameOf(num)}  (${num})`);
      if (d.cpu_plan) console.log(`\n作戦データ(cpu_plan): ${JSON.stringify(d.cpu_plan).slice(0, 600)}`);
      if (!valid(d)) console.log(`\n⚠このデッキは対戦に使えません（メイン40枚 かつ ルリグデッキが必要）`);
    }
    return;
  }

  // ── 一覧 ──
  console.log(`\n=== ${acc.username} のデッキ ${decks.length}件 ===`);
  console.log(`使える(メイン40枚): ${decks.filter(valid).length}件`
    + `   CPU用: ${decks.filter(d => d.deck_kind === 'cpu').length}件`
    + `   作戦データあり: ${decks.filter(d => d.cpu_plan).length}件\n`);
  console.log('  名前            メイン ルリグ  種別    形式        作戦  センター');
  for (const d of decks) {
    console.log(`  ${(d.name ?? '(無名)').padEnd(14)}`
      + ` ${String(d.main_deck?.length ?? 0).padStart(4)}枚 ${String(d.lrig_deck?.length ?? 0).padStart(3)}枚`
      + `  ${(d.deck_kind ?? 'player').padEnd(6)} ${(d.deck_format ?? '-').padEnd(10)}`
      + ` ${d.cpu_plan ? '有' : '- '}   ${nameOf(d.center_lrig)}${valid(d) ? '' : '   ⚠未完成'}`);
  }
  console.log(`\n1デッキの中身 → node scripts/listDecks.mjs --name <名前の一部>`);

  if (EXPORT_DIR) {
    mkdirSync(EXPORT_DIR, { recursive: true });
    const out = join(EXPORT_DIR, `decks_${acc.username}.json`);
    // ⚠**`user_id` は書き出さない**（他人の環境へ持っていくと行ポリシーと噛み合わない・PII でもある）。
    writeFileSync(out, JSON.stringify(decks.map(({ user_id: _u, ...rest }) => rest), null, 2), 'utf-8');
    console.log(`\n書き出し: ${out}（${decks.length}件・gitignore 圏内）`);
  }
})();
