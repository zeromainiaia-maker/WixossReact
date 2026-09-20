// 使い捨て実機検証：デッキ編集の「カード追加」検索が避難先(variant)の番号でも引けることを確認する。
// 使い方: node tmp_verify_cardsearch.mjs   （exit 0=PASS / 1=FAIL）
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const acc = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts[0];
const SHOT = 'scratchpad-verify';
mkdirSync(SHOT, { recursive: true });

let killed = false;
const killTree = (p) => { if (!p || killed) return; killed = true;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { p.kill(); } catch { /* noop */ } };

const startDev = () => new Promise((resolve, reject) => {
  const proc = spawn('npm', ['run', 'dev'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let url = null;
  const onData = (b) => { const m = b.toString().replace(/\x1b\[[0-9;]*m/g, '').match(/(http:\/\/localhost:\d+)/);
    if (m && !url) { url = m[1]; resolve({ proc, url }); } };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('error', reject);
  setTimeout(() => { if (!url) { killTree(proc); reject(new Error('dev起動タイムアウト')); } }, 30000);
});

const results = [];
const check = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };

const { proc, url } = await startDev();
process.on('exit', () => killTree(proc));
console.log('dev server:', url);
let code = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors = [];
  page.on('pageerror', e => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(acc.username);
  await page.getByPlaceholder('パスワード').fill(acc.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('input')].some(i => i.placeholder === 'ユーザーネーム'), { timeout: 15000 });
  await page.getByRole('button', { name: 'デッキ編成' }).click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${SHOT}/cardsearch-decklist.png`, fullPage: true });
  // 先頭のデッキを開く（フォルダ配下にある場合は先にフォルダを開く）
  let deck = page.locator('[data-testid^="deck-card-"]').first();
  if (await deck.count() === 0 || !(await deck.isVisible().catch(() => false))) {
    const folder = page.locator('[data-testid^="deck-folder-"]').first();
    if (await folder.count() > 0) { await folder.click(); await page.waitForTimeout(600); }
    deck = page.locator('[data-testid^="deck-card-"]').first();
  }
  await deck.waitFor({ timeout: 10000 });
  await deck.click();
  await page.getByRole('button', { name: 'カード追加' }).click();
  const box = page.getByPlaceholder('カード名・番号で検索');
  await box.waitFor({ timeout: 10000 });

  const rowCount = async () => page.locator('[data-testid^="search-add-"]').count();

  // ① 本体に1枚も無いパック＝修正前は 0 件だった。
  await box.fill('SPDi38-');
  await page.waitForTimeout(600);
  const n38 = await rowCount();
  check(n38 > 0, `本体に無いパック「SPDi38-」で ${n38} 件ヒット（修正前は 0 件）`);
  check(await page.getByText('別番号：').first().isVisible(), '「別番号：」の表示が出ている（ヒット理由が分かる）');
  await page.screenshot({ path: `${SHOT}/cardsearch-SPDi38.png`, fullPage: false });

  // ② WX01 の再録＝本体番号は WD01-016。修正前はこの行が出なかった。
  await box.fill('WX01-');
  await page.waitForTimeout(600);
  const hasWd01 = await page.locator('[data-testid="search-add-WD01-016"]').count();
  check(hasWd01 === 1, 'WX01-101（サーバント　Ｄ）の本体 WD01-016 が「WX01-」で出る');
  check(await page.locator('[data-testid="search-add-WX01-001"]').count() === 1, '従来どおり本体番号 WX01-001 も出る');
  check(await page.locator('[data-testid="search-add-WX01-101"]').count() === 0, '🔴variant の行（WX01-101）が結果に混ざっていない');
  await page.screenshot({ path: `${SHOT}/cardsearch-WX01.png`, fullPage: false });

  // ③ 大文字小文字を無視する。
  await box.fill('wx01-');
  await page.waitForTimeout(600);
  check(await rowCount() > 0, '小文字「wx01-」でも引ける');

  // ④ カード名検索が壊れていない。
  await box.fill('サーバント');
  await page.waitForTimeout(600);
  check(await rowCount() > 0, 'カード名検索が従来どおり効く');

  // ⑤ 行に出ているのが「本体のカード」であること＝避難先の3列データ（Type も効果も無い）が漏れていない。
  //    ⚠デッキ編集は `onUpdate` が即 Supabase へ書く＝ユーザーのデッキを汚さないよう**読むだけ**で確かめる。
  await box.fill('SPDi38-');
  await page.waitForTimeout(600);
  const metas = await page.locator('[data-testid^="search-add-"]').evaluateAll(btns => btns.map(b => {
    const row = b.closest('div[style*="border-bottom"]') ?? b.parentElement?.parentElement;
    const ps = [...(row?.querySelectorAll('p') ?? [])].map(p => p.textContent ?? '');
    return { num: b.getAttribute('data-testid').replace('search-add-', ''), meta: ps.find(t => t.includes(' / ')) ?? '' };
  }));
  check(metas.length > 0, `SPDi38- の行を ${metas.length} 件読めた`);
  const empty = metas.filter(m => !/ \/ .+ \/ /.test(m.meta));
  check(empty.length === 0, `🔴タイプ・色が空の行（＝variant の3列データ）が 0 件（実測 ${empty.length}）`);
  const leaked = metas.filter(m => m.num.startsWith('SPDi38-'));
  check(leaked.length === 0, `🔴避難先の番号そのものが行になっていない（実測 ${leaked.length} 件）`);

  check(errors.length === 0, `コンソールエラー 0（実測 ${errors.length}）`);
  errors.forEach(e => console.log('   ', e));
  await browser.close();
} catch (e) {
  console.log('✗ 実行時エラー:', e.message);
  code = 1;
} finally { killTree(proc); }

const fail = results.filter(r => !r.ok).length;
console.log(`\n===== 実機: PASS ${results.length - fail} / FAIL ${fail} =====`);
process.exit(code || (fail ? 1 : 0));
