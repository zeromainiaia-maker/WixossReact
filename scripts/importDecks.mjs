// デッキをハーネス用アカウントへ取り込む（§5.6.5・2026-09-20）＝
// **ユーザーが作った実戦的な CPU デッキを、実機ハーネス（`verifyFullMatch.mjs`）で使えるようにする**。
//
// 🔑**なぜ要るか**＝ハーネスは `claude1` / `claude2` でログインして**自分のアカウントのデッキ**を探すので、
//   ユーザー個人アカウント（`カルカドール`）のデッキは**そのままでは1件も見えない**（PLAN §5.6.5 の未整備3本）。
//   取り込めば `DECK=<名前> node scripts/verifyFullMatch.mjs cpu` がそのまま通る（名前の引数化は実装済み）。
//
// 使い方:
//   node scripts/importDecks.mjs                          # 下見（既定は --dry＝何も書かない）
//   node scripts/importDecks.mjs --apply                  # 実際に取り込む
//   node scripts/importDecks.mjs --name ケトッシー --apply   # 名前に含むものだけ
//   node scripts/importDecks.mjs --from scratchpad-decks/decks_カルカドール.json --apply   # 書き出し済み JSON から
//   node scripts/importDecks.mjs --to claude2 --apply
//
// 🔴**書き込み先は `harnessAccounts()` に限る**（`verifyAccounts.mjs` 冒頭の事故）＝
//   `harness:false`（ユーザー本人）のアカウントへは**絶対に書かない**。
// 🔑**`player` と `cpu` の両方を作る**＝通し対戦は「自分＝player の山」「CPU＝cpu の山」から選ぶので、
//   片方だけだと `verifyFullMatch.mjs` が「デッキがフォルダに見つからない」で落ちる（`verifySetupDeck.mjs` と同じ規約）。
// 🔑**冪等**＝同じ名前・同じ種別が既にあれば、中身が違うときだけ更新する。
import { readFileSync, existsSync } from 'node:fs';
import { harnessAccounts, findAccount } from './verifyAccounts.mjs';

const args = process.argv.slice(2);
const argVal = (k) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
const APPLY = args.includes('--apply');
const FROM_FILE = argVal('--from');
const FROM_USER = argVal('--from-user') ?? 'カルカドール';
const TO_USER = argVal('--to') ?? harnessAccounts()[0].username;
const NAME = argVal('--name');
const KINDS = (argVal('--kinds') ?? 'player,cpu').split(',').map(s => s.trim()).filter(Boolean);

const env = readFileSync('.env.local', 'utf-8');
const BASE = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
if (!BASE || !ANON) { console.error('.env.local に VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY がありません'); process.exit(1); }

// 🔴**取り込み先はハーネス用だけ**＝ユーザー本人のアカウントを書き換えない。
const dest = harnessAccounts().find(a => a.username === TO_USER);
if (!dest) {
  console.error(`取り込み先「${TO_USER}」はハーネス用アカウントではありません（書き込みを拒否しました）。`);
  console.error(`  使えるのは: ${harnessAccounts().map(a => a.username).join(' / ')}`);
  console.error(`  ⚠ユーザー本人のアカウント（verify-accounts.json で harness:false）へは書きません。`);
  process.exit(1);
}

const toFakeEmail = (u) => Buffer.from(u.trim(), 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '') + '@wixoss.game';

async function login(acc) {
  const r = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: toFakeEmail(acc.username), password: acc.password }),
  });
  const j = await r.json();
  if (!j.access_token) { console.error(`ログイン失敗 (${acc.username}): ${r.status} ${j.error_code ?? j.msg ?? ''}`); process.exit(1); }
  return { h: { apikey: ANON, Authorization: `Bearer ${j.access_token}`, 'Content-Type': 'application/json' }, uid: j.user?.id };
}

const valid = (d) => (d.main_deck?.length ?? 0) === 40 && (d.lrig_deck?.length ?? 0) > 0 && !!d.center_lrig;

(async () => {
  // ── 取り込み元 ──
  let src;
  if (FROM_FILE) {
    if (!existsSync(FROM_FILE)) { console.error(`${FROM_FILE} がありません（node scripts/listDecks.mjs --export <dir> で作れます）`); process.exit(1); }
    src = JSON.parse(readFileSync(FROM_FILE, 'utf-8'));
    console.log(`取り込み元: ${FROM_FILE}（${src.length}件）`);
  } else {
    const from = findAccount(FROM_USER);
    if (!from) { console.error(`アカウント「${FROM_USER}」が verify-accounts.json にありません`); process.exit(1); }
    const { h } = await login(from);
    const r = await fetch(`${BASE}/rest/v1/decks?select=*&order=created_at.asc`, { headers: h });
    if (!r.ok) { console.error('取り込み元の decks 取得失敗:', r.status, (await r.text()).slice(0, 200)); process.exit(1); }
    src = await r.json();
    console.log(`取り込み元: ${FROM_USER}（${src.length}件・ライブ）`);
  }

  let picked = src.filter(valid);
  const skipped = src.length - picked.length;
  if (NAME) picked = picked.filter(d => (d.name ?? '').includes(NAME));
  // ⚠**同じ名前が player/cpu で2行ある**ことがある＝名前で1つに畳む（中身は同じ前提・先に来たほうを採る）。
  const byName = new Map();
  for (const d of picked) if (!byName.has(d.name)) byName.set(d.name, d);
  const list = [...byName.values()];
  console.log(`取り込み先: ${dest.username}（ハーネス用）   種別: ${KINDS.join(' + ')}`);
  console.log(`対象: ${list.length}件${skipped > 0 ? `（メイン40枚でない／センター未設定の ${skipped}件は除外）` : ''}${NAME ? `／名前に「${NAME}」を含む` : ''}\n`);
  if (list.length === 0) { console.log('取り込むものがありません。'); return; }

  const { h, uid } = await login(dest);
  const existRes = await fetch(`${BASE}/rest/v1/decks?user_id=eq.${uid}&select=id,name,deck_kind,main_deck,lrig_deck,center_lrig,assist_lrig_l,assist_lrig_r,cpu_plan`, { headers: h });
  const existing = existRes.ok ? await existRes.json() : [];
  const key = (name, kind) => `${name}\u0000${kind}`;
  const exMap = new Map(existing.map(d => [key(d.name, d.deck_kind), d]));

  let ins = 0, upd = 0, same = 0;
  for (const d of list) {
    // ⚠**`id` / `user_id` / `created_at` は持ち込まない**（相手の行として新しく作る）。
    const body = {
      name: d.name, main_deck: d.main_deck, lrig_deck: d.lrig_deck,
      center_lrig: d.center_lrig, assist_lrig_l: d.assist_lrig_l ?? null, assist_lrig_r: d.assist_lrig_r ?? null,
      thumbnail_card_num: d.thumbnail_card_num ?? null, art_overrides: d.art_overrides ?? null,
      cpu_plan: d.cpu_plan ?? null, deck_format: d.deck_format ?? null,
    };
    for (const kind of KINDS) {
      const cur = exMap.get(key(d.name, kind));
      const isSame = cur
        && JSON.stringify(cur.main_deck) === JSON.stringify(body.main_deck)
        && JSON.stringify(cur.lrig_deck) === JSON.stringify(body.lrig_deck)
        && cur.center_lrig === body.center_lrig
        && cur.assist_lrig_l === body.assist_lrig_l && cur.assist_lrig_r === body.assist_lrig_r
        && JSON.stringify(cur.cpu_plan ?? null) === JSON.stringify(body.cpu_plan);
      const verb = isSame ? '同一' : cur ? '更新' : '新規';
      console.log(`  [${verb}] ${d.name}  (${kind})  メイン${body.main_deck.length}枚 ルリグ${body.lrig_deck.length}枚${body.cpu_plan ? ' 作戦有' : ''}`);
      if (isSame) { same++; continue; }
      if (!APPLY) { cur ? upd++ : ins++; continue; }
      const res = cur
        ? await fetch(`${BASE}/rest/v1/decks?id=eq.${cur.id}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify(body) })
        : await fetch(`${BASE}/rest/v1/decks`, { method: 'POST', headers: { ...h, Prefer: 'return=representation' }, body: JSON.stringify({ ...body, user_id: uid, deck_kind: kind, sort_order: 100 }) });
      if (!res.ok) { console.error(`    🔴失敗: ${res.status} ${(await res.text()).slice(0, 200)}`); process.exit(1); }
      cur ? upd++ : ins++;
    }
  }

  console.log(`\n新規 ${ins} / 更新 ${upd} / 同一 ${same}`);
  if (!APPLY) { console.log('（--dry 既定＝何も書いていません。実行するには --apply）'); return; }
  console.log(`\n次の一手＝ DECK="<名前>" node scripts/verifyFullMatch.mjs cpu`);
  console.log(`  例）DECK="${list[0].name}" node scripts/verifyFullMatch.mjs cpu`);
  console.log(`  ⚠自分側と CPU 側で別の山にするなら CPU_DECK="<名前>" も併せて指定する。`);
})();
