// claude1 にログインし、Supabase REST API（ユーザーセッションのトークン＝RLS下）で
// 検証用デッキ "VERIFY_DECK" を1つ挿入する（冪等：既存ならスキップ）。
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
const SUPA_URL = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;
// 🆕§5.6 `C-3`（2026-09-17）＝`--mech` で**機構踏破用デッキ `VERIFY_DECK_MECH`** を作る。
//   🔑**なぜ要るか**＝`VERIFY_DECK` は**シグニ40枚＋ルリグ5枚だけ**（ガード・スペル・アーツ・アシスト・レゾナ・ライズが0枚）＝
//   `census:play` の未踏の大半が「CPU が踏めない」ではなく「山に札が無い」だった。リリースゲート（`VERIFY_DECK`）は変えずに、
//   計器用の山を別に持つ。使い方＝`DECK=VERIFY_DECK_MECH node scripts/verifyFullMatch.mjs cpu`。
//   構成（青ピルルク）＝センター WD03 の Lv0〜3／アシスト2系統（ウムル・タウィル＝Lv0→Lv1《無》×0）／アーツ（ドント・ファイト＝除去）／
//   レゾナ（†Ｍ・Ｇ・Ｔ†＝ピルルク限定・青と黒の＜電機＞を場から）／ガード4／除去スペル4／【起】付きシグニ4／ライズ（Ｈ２Ｏ＝＜原子＞の上）。
const MECH = process.argv.includes('--mech');
const MECH_DECK = {
  lrig_deck: ['WD03-005', 'WD03-004', 'WD03-003', 'WD03-002', 'WDK09-005', 'WXDi-D01-009', 'WDK14-005', 'WXDi-D01-006', 'WX21-011', 'WX12-017'],
  main_deck: [
    ...Array(4).fill('WD01-017'),                                   // サーバント O（ガード）
    ...Array(2).fill('WX03-043'), ...Array(2).fill('WX01-085'),     // ICE BREAK／FREEZE（除去スペル）
    ...Array(2).fill('WX01-083'), ...Array(2).fill('WX02-036'),     // 【起】付きシグニ
    ...Array(2).fill('WXDi-P05-038'),                               // 羅原姫 Ｈ２Ｏ（ライズ＝＜原子＞の上）
    ...Array(3).fill('WX05-062'), ...Array(2).fill('WX05-060'),     // ＜原子＞（ライズの下敷き）
    ...Array(4).fill('WD03-013'), ...Array(4).fill('WD03-012'), ...Array(3).fill('WD03-010'), // 青＜電機＞
    ...Array(4).fill('WX12-055'), ...Array(2).fill('WX12-054'),     // 黒＜電機＞（レゾナの支払い）
    ...Array(2).fill('WX04-080'), ...Array(2).fill('WX04-077'),     // 青のレベル1・2
  ],
};
const deck = MECH ? MECH_DECK : JSON.parse(readFileSync('verify-deck.json', 'utf-8'));
const DECK_NAME = MECH ? 'VERIFY_DECK_MECH' : 'VERIFY_DECK';
if (deck.main_deck.length !== 40) { console.error(`メインデッキが40枚でない: ${deck.main_deck.length}`); process.exit(1); }

function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => {
      const s = b.toString().replace(/\x1b\[[0-9;]*m/g, '');
      const m = s.match(/(http:\/\/localhost:\d+)/);
      if (m && !url) { url = m[1]; resolve({ proc, url }); }
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData);
    proc.on('error', reject);
    setTimeout(() => { if (!url) reject(new Error('dev起動タイムアウト')); }, 30000);
  });
}

async function login(page, url, acc) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(acc.username);
  await page.getByPlaceholder('パスワード').fill(acc.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('input')].some(i => i.placeholder === 'ユーザーネーム'), { timeout: 15000 });
  await page.waitForTimeout(1200);
}

async function ensureDeck(page, acc) {
  return await page.evaluate(async ({ SUPA_URL, ANON, deck, name, sortOrder }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    if (!key) return { error: 'auth-token がlocalStorageに無い' };
    const sess = JSON.parse(localStorage.getItem(key));
    const token = sess.access_token; const uid = sess.user?.id;
    if (!token || !uid) return { error: 'token/uid 取得失敗' };
    const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const existRes = await fetch(`${SUPA_URL}/rest/v1/decks?user_id=eq.${uid}&name=eq.${encodeURIComponent(name)}&select=id`, { headers: h });
    const exist = await existRes.json();
    if (Array.isArray(exist) && exist.length) return { uid, existed: true, deckId: exist[0].id };
    const ins = await fetch(`${SUPA_URL}/rest/v1/decks`, {
      method: 'POST', headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: uid, name, main_deck: deck.main_deck, lrig_deck: deck.lrig_deck, sort_order: sortOrder }),
    });
    const body = await ins.json();
    if (!ins.ok) return { uid, error: 'insert失敗 ' + JSON.stringify(body) };
    return { uid, inserted: true, deckId: body[0]?.id };
  }, { SUPA_URL, ANON, deck, name: DECK_NAME, sortOrder: MECH ? 1 : 0 });
}

const { proc, url } = await startDev();
console.log(`dev: ${url}`);
let code = 0;
try {
  const browser = await chromium.launch();
  for (const acc of accounts) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await login(page, url, acc);
    const res = await ensureDeck(page, acc);
    console.log(`[${acc.username}] ${JSON.stringify(res)}`);
    if (res.error) code = 1;
    await page.close();
  }
  await browser.close();
} catch (e) { console.error('失敗:', e.message); code = 2; }
finally { proc.kill(); try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true }); } catch {} }
process.exit(code);
