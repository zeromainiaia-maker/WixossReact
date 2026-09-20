// 使い捨て実機検証：デッキフォーマット（カードプール）と CPU ランダム選出の絞り込み。
// 使い方: node scripts/archive/verifyDeckFormat.mjs   （exit 0=PASS / 1=FAIL）
// ⚠事前に `decks.deck_format` 列が要る（SQL は docs/BUGFIXES.md の該当バッチ）。
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, statSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const acc = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts[0];
const SHOT = 'scratchpad-verify';
mkdirSync(SHOT, { recursive: true });

let killed = false;
const killTree = (p) => {
  if (!p || killed) return;
  killed = true;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(p.pid), '/T', '/F'], { stdio: 'ignore' });
  else try { p.kill(); } catch { /* noop */ }
};

// 🔴**dev ではなく `vite preview`**（`verifyFullMatch.mjs` と同じ方式）。
//   dev は React の StrictMode で `useEffect` が2回走り、**`init()` が決めた画面を
//   `onAuthStateChange('SIGNED_IN')` が START へ上書きする**＝「オンライン対戦」を押しても
//   START に戻る（実測＝このスクリプトが3回連続でマッチング画面へ入れなかった）。
const distIsFresh = () => {
  try {
    const distTime = statSync('dist/index.html').mtimeMs;
    let newest = null;
    const scan = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const q = join(dir, e.name);
        if (e.isDirectory()) scan(q);
        else { const t = statSync(q).mtimeMs; if (!newest || t > newest) newest = t; }
      }
    };
    for (const d of ['src', 'public']) scan(d);
    return !!newest && distTime > newest;
  } catch { return false; }
};
const buildFirst = () => new Promise((resolve, reject) => {
  if (distIsFresh()) { console.log('build スキップ（dist が新しい）'); return resolve(); }
  console.log('dist を build 中…');
  const b = spawn('npm', ['run', 'build'], { shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
  let err = '';
  b.stderr.on('data', (d) => { err += d.toString(); });
  b.on('error', reject);
  b.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('build 失敗: ' + err.slice(-1500)))));
});
const startDev = () => new Promise((resolve, reject) => {
  const proc = spawn('npm', ['run', 'preview'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let url = null;
  const onData = (b) => {
    const m = b.toString().replace(/\[[0-9;]*m/g, '').match(/(http:\/\/localhost:\d+)/);
    if (m && !url) { url = m[1]; resolve({ proc, url }); }
  };
  proc.stdout.on('data', onData); proc.stderr.on('data', onData);
  proc.on('error', reject);
  setTimeout(() => { if (!url) { killTree(proc); reject(new Error('preview 起動タイムアウト')); } }, 30000);
});

const results = [];
const check = (ok, msg) => { results.push({ ok, msg }); console.log(`  ${ok ? '✓' : '✗'} ${msg}`); };

await buildFirst();
const { proc, url } = await startDev();
process.on('exit', () => killTree(proc));
console.log('preview:', url);
let code = 0;
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(acc.username);
  await page.getByPlaceholder('パスワード').fill(acc.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('input')].some((i) => i.placeholder === 'ユーザーネーム'), { timeout: 15000 });

  const openFormatModal = async () => {
    await page.getByRole('button', { name: '⚙ デッキ設定' }).click();
    await page.locator('[data-testid="deck-format-open"]').click();
    await page.waitForTimeout(400);
  };
  const setFormat = async (id) => {
    await page.locator(`[data-testid="deck-format-${id}"]`).click();
    await page.waitForTimeout(700);
  };
  const closeModal = async () => {
    await page.getByRole('button', { name: '閉じる' }).click();
    await page.waitForTimeout(400);
  };

  // ───── A. デッキ編成：フォーマット設定の入口 ─────
  await page.getByRole('button', { name: 'デッキ編成' }).click();
  await page.waitForTimeout(800);
  let deck = page.locator('[data-testid^="deck-card-"]').first();
  if (await deck.count() === 0) {
    const folder = page.locator('[data-testid^="deck-folder-"]').first();
    if (await folder.count() > 0) { await folder.click(); await page.waitForTimeout(600); }
    deck = page.locator('[data-testid^="deck-card-"]').first();
  }
  await deck.waitFor({ timeout: 10000 });
  await deck.click();
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: '⚙ デッキ設定' }).click();
  const formatBtn = page.locator('[data-testid="deck-format-open"]');
  await formatBtn.waitFor({ timeout: 5000 });
  const formatLabel = (await formatBtn.textContent()) ?? '';
  check(/ディーバ|レガシー|オールスター/.test(formatLabel), `設定メニューにフォーマットが出る（${formatLabel.trim()}）`);
  await formatBtn.click();
  await page.waitForTimeout(400);
  for (const id of ['auto', 'diva', 'legacy', 'allstar']) {
    check(await page.locator(`[data-testid="deck-format-${id}"]`).count() === 1, `フォーマットの選択肢 ${id} がある`);
  }
  await page.screenshot({ path: `${SHOT}/deckformat-modal.png`, fullPage: false });

  // ───── B. レガシーに固定 → ディーバ専用札が追加できない ─────
  await setFormat('legacy');
  await closeModal();
  await page.getByRole('button', { name: 'カード追加' }).click();
  const box = page.getByPlaceholder('カード名・番号で検索');
  await box.waitFor({ timeout: 10000 });

  await box.fill('WXDi-P00-006');           // ディーバ専用（アサルト・ケルベロス）
  await page.waitForTimeout(600);
  const divaRow = page.locator('[data-testid="search-add-WXDi-P00-006"]');
  check(await divaRow.count() === 1, 'ディーバ専用札も検索には出る（隠さず、押せなくする方針）');
  check(await divaRow.isDisabled(), '🔴レガシー固定のデッキでディーバ専用札の＋が押せてしまう');
  check(await page.locator('[data-testid="search-format-ng-WXDi-P00-006"]').count() === 1, '「フォーマット外」の理由が行に出ている');

  await box.fill('WX01-001');               // レガシー専用
  await page.waitForTimeout(600);
  check(await page.locator('[data-testid="search-format-ng-WX01-001"]').count() === 0, '🔴レガシー専用札までフォーマット外にしている');
  await page.screenshot({ path: `${SHOT}/deckformat-blocked.png`, fullPage: false });

  // ───── C. ディーバに固定 → 再録のセンタールリグ（本体はレガシー番号）が使える ─────
  await openFormatModal();
  await setFormat('diva');
  await closeModal();
  await page.getByRole('button', { name: 'カード追加' }).click();
  await box.fill('WD03-005');               // コード・ピルルク＝WXDi-D09-P01 に再録
  await page.waitForTimeout(600);
  check(await page.locator('[data-testid="search-add-WD03-005"]').count() === 1, 'WD03-005 が検索で出る');
  check(await page.locator('[data-testid="search-format-ng-WD03-005"]').count() === 0,
    '🔴ディーバのデッキにディーバのセンタールリグ（再録・本体はレガシー番号）が入れられない');
  await box.fill('WX01-001');
  await page.waitForTimeout(600);
  check(await page.locator('[data-testid="search-format-ng-WX01-001"]').count() === 1, '🔴ディーバでレガシー専用札が通ってしまう');

  // ───── D. 保存が効くこと（🔴**明示値**で確かめる）─────
  // ⚠初版は「自動 → 自動」を見ており、`deck_format` 列が無くても通る**空振りの検査**だった
  //   （保存されなくても NULL のままなので表示が変わらない）。⇒ **`allstar` を保存してリロードする。**
  await openFormatModal();
  await setFormat('allstar');
  await closeModal();
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  const has = async (sel) => (await page.locator(sel).count()) > 0;
  const gotoDeckSettings = async () => {
    if (await has('[data-testid="deck-format-open"]')) return true;
    if (await has('button:has-text("デッキ編成")')) {
      await page.getByRole('button', { name: 'デッキ編成' }).click();
      await page.waitForTimeout(900);
    }
    if (!(await has('button:has-text("⚙ デッキ設定")'))) {
      if (await has('[data-testid^="deck-folder-"]')) {
        await page.locator('[data-testid^="deck-folder-"]').first().click();
        await page.waitForTimeout(600);
      }
      if (await has('[data-testid^="deck-card-"]')) {
        await page.locator('[data-testid^="deck-card-"]').first().click();
        await page.waitForTimeout(700);
      }
    }
    if (await has('button:has-text("⚙ デッキ設定")')) {
      await page.getByRole('button', { name: '⚙ デッキ設定' }).click();
      await page.waitForTimeout(400);
    }
    return has('[data-testid="deck-format-open"]');
  };
  if (await gotoDeckSettings()) {
    const after = (await page.locator('[data-testid="deck-format-open"]').textContent()) ?? '';
    check(/オールスター/.test(after) && !/（自動）/.test(after),
      `🔴リロード後にフォーマットが保存されていない（表示＝${after.trim()}／\`decks.deck_format\` 列が無い可能性）`);
    // 後始末＝元の「自動」に戻す（ユーザーのデッキを検証前の状態へ）。
    await page.locator('[data-testid="deck-format-open"]').click();
    await page.waitForTimeout(400);
    await setFormat('auto');
    const back = (await page.locator('[data-testid="deck-format-auto"]').textContent()) ?? '';
    check(/自動/.test(back), '「自動」に戻せる');
    await closeModal();
  } else {
    check(false, 'リロード後にデッキ設定へ辿り着けなかった');
  }

  // ───── E. CPU 対戦：フォーマット絞り込み＋「全員のルリグ」タイル ─────
  // ⚠導線は**実際のボタン**で辿る（`sessionStorage` の細工は復帰順序に負ける）。
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(3000);
  // ⚠「オンライン対戦」は `sessionStorage` を立てて `location.reload()` する＝**再読み込みの完了を待つ**。
  await page.getByRole('button', { name: 'オンライン対戦' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => !/WIXOSS ONLINE/.test(document.body.innerText), { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${SHOT}/deckformat-matchmaking.png`, fullPage: true });
  console.log('    [対戦画面の文言]', (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 220));
  const firstTile = page.locator('[data-testid^="deck-folder-"], [data-testid^="deck-card-"]').first();
  await firstTile.waitFor({ timeout: 10000 });
  await firstTile.click();
  await page.waitForTimeout(600);
  const innerDeck = page.locator('[data-testid^="deck-card-"]').first();
  if (await innerDeck.count() > 0) { await innerDeck.click(); await page.waitForTimeout(500); }
  await page.getByRole('button', { name: '次へ' }).click();
  await page.getByRole('button', { name: 'CPU対戦' }).click();
  await page.waitForTimeout(800);
  await page.locator('[data-testid="cpu-pick-mode-random"]').click();
  await page.waitForTimeout(600);

  for (const f of ['all', 'diva', 'legacy', 'allstar']) {
    check(await page.locator(`[data-testid="cpu-random-format-${f}"]`).count() === 1, `CPU ランダムにフォーマット「${f}」のボタンがある`);
  }
  check(await page.locator('[data-testid="deck-folder-__all__"]').count() === 1, '🔴「全員のルリグ」タイルが無い');
  const allText = (await page.locator('[data-testid="deck-folder-__all__"]').textContent()) ?? '';
  check(/全員のルリグ/.test(allText), `「全員のルリグ」の表示が出ている（${allText.replace(/\s+/g, ' ').trim()}）`);

  // 件数がフォーマットで動く＝絞り込みが効いている（3区分の和＝すべて）
  const countOfAll = async () => {
    const t = (await page.locator('[data-testid="deck-folder-__all__"]').textContent().catch(() => '')) ?? '';
    const m = /(\d+)\s*デッキ/.exec(t);
    return m ? Number(m[1]) : 0;
  };
  const pick = async (f) => { await page.locator(`[data-testid="cpu-random-format-${f}"]`).click(); await page.waitForTimeout(400); };
  await pick('all'); const nAll = await countOfAll();
  await pick('diva'); const nDiva = await countOfAll();
  await pick('legacy'); const nLegacy = await countOfAll();
  await pick('allstar'); const nStar = await countOfAll();
  console.log(`    候補数: すべて=${nAll} / ディーバ=${nDiva} / レガシー=${nLegacy} / オールスター=${nStar}`);
  check(nAll > 0, 'CPU デッキの候補が1つ以上ある');
  check(nDiva + nLegacy + nStar === nAll, `🔴フォーマットの3区分が「すべて」と一致しない（${nDiva}+${nLegacy}+${nStar} ≠ ${nAll}）`);

  // 選ぶと要約が出て、開始できる
  await pick('all');
  await page.locator('[data-testid="deck-folder-__all__"]').click();
  await page.waitForTimeout(400);
  const summary = (await page.locator('[data-testid="cpu-random-summary"]').textContent().catch(() => '')) ?? '';
  check(/全員のルリグ/.test(summary), `選択の要約が出る（${summary.replace(/\s+/g, ' ').trim()}）`);
  check(await page.getByRole('button', { name: '対戦開始' }).isEnabled(), '候補があるのに対戦開始が押せない');
  await page.screenshot({ path: `${SHOT}/deckformat-cpurandom.png`, fullPage: false });

  check(errors.length === 0, `コンソールエラー 0（実測 ${errors.length}）`);
  errors.forEach((e) => console.log('   ', e));
  await browser.close();
} catch (e) {
  console.log('✗ 実行時エラー:', e.message);
  code = 1;
} finally { killTree(proc); }

const fail = results.filter((r) => !r.ok).length;
console.log(`\n===== 実機: PASS ${results.length - fail} / FAIL ${fail} =====`);
process.exit(code || (fail ? 1 : 0));
