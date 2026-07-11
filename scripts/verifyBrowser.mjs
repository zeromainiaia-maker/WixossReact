// 実機ブラウザ検証ドライバ：vite dev を起動し、/verify.html を Chromium で開いて
// engine 検証ハーネスの結果（window.__verifyResults）を取得＋全画面スクショを保存する。
// 使い方: node scripts/verifyBrowser.mjs  （exit 0=全PASS / 1=FAIL）
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const SHOT_DIR = process.env.SHOT_DIR || 'scratchpad-verify';
mkdirSync(SHOT_DIR, { recursive: true });

// ⚠ Windows では proc.kill() は shell(cmd.exe) だけを殺し、孫の vite(node) が孤児で残る。
//    しかも根が死んだ後の taskkill /T は子孫を辿れない＝旧実装（proc.kill()→非同期taskkill）は
//    実行のたびに dev server を1個リークしていた。必ず「proc.kill() より先に」同期 taskkill する。
let treeKilled = false;
function killTree(proc) {
  if (!proc || treeKilled) return;
  treeKilled = true;
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  } else {
    try { proc.kill(); } catch { /* noop */ }
  }
}

function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => {
      const s = b.toString().replace(/\x1b\[[0-9;]*m/g, ''); // ANSIカラー除去
      const m = s.match(/(http:\/\/localhost:\d+)/);
      if (m && !url) { url = m[1]; resolve({ proc, url }); }
    };
    proc.stdout.on('data', onData);
    proc.stderr.on('data', onData);
    proc.on('error', reject);
    setTimeout(() => { if (!url) { killTree(proc); reject(new Error('dev server 起動タイムアウト')); } }, 30000);
  });
}

const { proc, url } = await startDev();
// 異常終了（例外・Ctrl+C）でも dev server を残さない保険（'exit' ハンドラは同期処理のみ可）
process.on('exit', () => killTree(proc));
process.on('SIGINT', () => process.exit(130));
console.log(`dev server: ${url}`);
let exitCode = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await page.goto(`${url}/verify.html`, { waitUntil: 'networkidle' });
  // ハーネスのサマリ確定を待つ
  await page.waitForFunction(() => {
    const el = document.getElementById('summary');
    return el && /ALL PASS|FAIL/.test(el.textContent || '');
  }, { timeout: 20000 });
  const results = await page.evaluate(() => window.__verifyResults);
  const shot = `${SHOT_DIR}/verify-harness.png`;
  await page.screenshot({ path: shot, fullPage: true });

  console.log('\n===== ブラウザ検証結果 =====');
  for (const r of results) {
    const mark = r.pass ? 'PASS' : 'FAIL';
    console.log(`[${mark}] ${r.title}`);
    if (r.error) console.log(`   ERROR: ${r.error}`);
    for (const a of r.asserts ?? []) console.log(`   ${a.ok ? '✓' : '✗'} ${a.msg}`);
    if (!r.pass) exitCode = 1;
  }
  if (errors.length) { console.log('\n[console errors]'); errors.forEach((e) => console.log('  ' + e)); }
  console.log(`\nスクショ: ${shot}`);
  await browser.close();
} catch (e) {
  console.error('検証ドライバ失敗:', e.message);
  exitCode = 2;
} finally {
  killTree(proc);
}
process.exit(exitCode);
