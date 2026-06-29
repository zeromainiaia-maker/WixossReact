// claude1 にログインし、Supabase REST API（ユーザーセッションのトークン＝RLS下）で
// 検証用デッキ "VERIFY_DECK" を1つ挿入する（冪等：既存ならスキップ）。
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const env = readFileSync('.env.local', 'utf-8');
const SUPA_URL = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;
const deck = JSON.parse(readFileSync('verify-deck.json', 'utf-8'));

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
  return await page.evaluate(async ({ SUPA_URL, ANON, deck, name }) => {
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
      body: JSON.stringify({ user_id: uid, name, main_deck: deck.main_deck, lrig_deck: deck.lrig_deck, sort_order: 0 }),
    });
    const body = await ins.json();
    if (!ins.ok) return { uid, error: 'insert失敗 ' + JSON.stringify(body) };
    return { uid, inserted: true, deckId: body[0]?.id };
  }, { SUPA_URL, ANON, deck, name: 'VERIFY_DECK' });
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
