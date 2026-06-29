// claude1 でログイン→オンライン対戦→VERIFY_DECK選択→CPU対戦→対戦開始→セットアップ自動進行。
// 各ステップでスクショ＋画面テキストをダンプし、PLAYING 到達を目指す（段階構築・観測重視）。
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const SHOT = 'scratchpad-verify';
mkdirSync(SHOT, { recursive: true });
const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;

function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => { const s = b.toString().replace(/\x1b\[[0-9;]*m/g, ''); const m = s.match(/(http:\/\/localhost:\d+)/); if (m && !url) { url = m[1]; resolve({ proc, url }); } };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData); proc.on('error', reject);
    setTimeout(() => { if (!url) reject(new Error('dev起動タイムアウト')); }, 30000);
  });
}
const bodyText = (page) => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 500));
const clickText = async (page, text, timeout = 4000) => {
  const el = page.getByText(text, { exact: false }).first();
  await el.waitFor({ state: 'visible', timeout }); await el.click(); return true;
};

const { proc, url } = await startDev();
console.log(`dev: ${url}`);
let code = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // ログイン
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(accounts[0].username);
  await page.getByPlaceholder('パスワード').fill(accounts[0].password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('input')].some(i => i.placeholder === 'ユーザーネーム'), { timeout: 15000 });
  await page.waitForTimeout(1500);

  // オンライン対戦（sessionStorage→reload→matchmaking）を確定的に
  await page.evaluate(() => sessionStorage.setItem('gotoMatchmaking', '1'));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: `${SHOT}/drv-00-after-reload.png`, fullPage: true });
  console.log('reload後:', await bodyText(page));
  await page.getByText('使用デッキを選択', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${SHOT}/drv-01-matchmaking.png`, fullPage: true });
  console.log('① matchmaking:', await bodyText(page));

  // 使用デッキ選択 → 次へ
  await clickText(page, 'VERIFY_DECK');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: '次へ' }).click();
  await page.waitForTimeout(600);

  // 対戦モード → CPU対戦
  await page.getByRole('button', { name: 'CPU対戦' }).click();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${SHOT}/drv-02-cpudeck.png`, fullPage: true });

  // CPUデッキは validDecks[0] 既定 → 対戦開始
  await page.getByRole('button', { name: '対戦開始' }).click();
  await page.waitForTimeout(3500);
  await page.screenshot({ path: `${SHOT}/drv-03-battle-enter.png`, fullPage: true });
  console.log('② battle enter:', await bodyText(page));

  // セットアップ自動進行（じゃんけん→ルリグ選択→マリガン→ゲーム開始）を最大25周トライ
  const tryClicks = ['パー', 'この手札でOK', '引き直さない', 'キープ', 'ゲーム開始', '開始', 'OK', '決定'];
  for (let i = 0; i < 25; i++) {
    await page.waitForTimeout(1200);
    const txt = await bodyText(page);
    if (/メインフェイズ|あなたのターン|ターン[0-9]|エナチャージ|グロウフェイズ/.test(txt)) {
      console.log(`③ PLAYING 到達（${i}周目）`); break;
    }
    let clicked = null;
    // ルリグ選択：Lv0ルリグ画像をクリック（「ルリグを選」表示時、最初のカードを押す）
    if (/ルリグを選/.test(txt)) {
      const imgs = page.locator('img');
      if (await imgs.count()) { await imgs.first().click().catch(() => {}); clicked = 'ルリグ画像'; }
    }
    if (!clicked) for (const t of tryClicks) {
      const el = page.getByRole('button', { name: t }).first();
      if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); clicked = t; break; }
    }
    if (!clicked) for (const t of tryClicks) {
      try { await clickText(page, t, 800); clicked = t + '(text)'; break; } catch {}
    }
    console.log(`  [${i}] click=${clicked ?? 'なし'} | ${txt.slice(0, 80).replace(/\n/g, ' ')}`);
    if ((i + 1) % 5 === 0) await page.screenshot({ path: `${SHOT}/drv-setup-${i + 1}.png`, fullPage: true });
  }
  await page.screenshot({ path: `${SHOT}/drv-99-final.png`, fullPage: true });
  console.log('最終画面:', await bodyText(page));
  if (errors.length) { console.log('\n[console errors]'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  await browser.close();
} catch (e) { console.error('失敗:', e.message); code = 2; }
finally { proc.kill(); try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true }); } catch {} }
process.exit(code);
