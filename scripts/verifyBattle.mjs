// 実機 BattleScreen 検証ドライバ（段階構築中）。
// vite dev を起動し、Chromium で claude1 ログイン→認証後画面をスクショ＋DOMダンプする。
// 認証情報は gitignore 済み verify-accounts.json から読む。
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { mkdirSync, readFileSync } from 'node:fs';

const SHOT_DIR = 'scratchpad-verify';
mkdirSync(SHOT_DIR, { recursive: true });
const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;

function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => {
      const s = b.toString().replace(/\x1b\[[0-9;]*m/g, '');
      const m = s.match(/(http:\/\/localhost:\d+)/);
      if (m && !url) { url = m[1]; resolve({ proc, url }); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    setTimeout(() => { if (!url) reject(new Error('dev server 起動タイムアウト')); }, 30000);
  });
}

async function login(page, url, acc) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(acc.username);
  await page.getByPlaceholder('パスワード').fill(acc.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  // ログイン画面（ユーザーネーム入力）が消えるのを待つ
  await page.waitForFunction(() => {
    const inputs = [...document.querySelectorAll('input')];
    return !inputs.some(i => i.placeholder === 'ユーザーネーム');
  }, { timeout: 15000 });
}

const { proc, url } = await startDev();
console.log(`dev server: ${url}`);
let exitCode = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  console.log(`ログイン: ${accounts[0].username}`);
  await login(page, url, accounts[0]);
  await page.waitForTimeout(1500); // 認証後のデータfetch待ち
  await page.screenshot({ path: `${SHOT_DIR}/battle-01-after-login.png`, fullPage: true });

  // 画面に見えるボタン/見出しのテキストを抽出（次ステップの計画用）
  const texts = await page.evaluate(() => {
    const pick = (sel) => [...document.querySelectorAll(sel)].map(e => e.textContent?.trim()).filter(t => t && t.length < 40);
    return { buttons: pick('button'), headings: pick('h1,h2,h3'), body: document.body.innerText.slice(0, 600) };
  });
  console.log('\n=== 認証後画面 ===');
  console.log('見出し:', texts.headings);
  console.log('ボタン:', texts.buttons);
  console.log('本文抜粋:\n' + texts.body);
  if (errors.length) { console.log('\n[console errors]'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
  console.log(`\nスクショ: ${SHOT_DIR}/battle-01-after-login.png`);
  await browser.close();
} catch (e) {
  console.error('ドライバ失敗:', e.message);
  exitCode = 2;
} finally {
  proc.kill();
  try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true }); } catch { /* noop */ }
}
process.exit(exitCode);
