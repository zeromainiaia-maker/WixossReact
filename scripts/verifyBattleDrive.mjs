// claude1 でログイン→オンライン対戦→VERIFY_DECK選択→CPU対戦→対戦開始→セットアップ自動進行。
// 各ステップでスクショ＋画面テキストをダンプし、PLAYING 到達を目指す（段階構築・観測重視）。
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

const SHOT = 'scratchpad-verify';
mkdirSync(SHOT, { recursive: true });
const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;
const env = readFileSync('.env.local', 'utf-8');
const SUPA_URL = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

// ユーザーの残ルーム（PLAYING含む）と battle_states を掃除（再入場で BATTLE に飛ぶのを防ぐ）。
async function cleanupRooms(page) {
  return await page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key));
    const token = sess.access_token, uid = sess.user?.id;
    const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const roomsRes = await fetch(`${SUPA_URL}/rest/v1/rooms?or=(host_id.eq.${uid},guest_id.eq.${uid})&select=id`, { headers: h });
    const rooms = await roomsRes.json();
    const ids = Array.isArray(rooms) ? rooms.map(r => r.id) : [];
    for (const id of ids) {
      await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${id}`, { method: 'DELETE', headers: h });
      await fetch(`${SUPA_URL}/rest/v1/rooms?id=eq.${id}`, { method: 'DELETE', headers: h });
    }
    return ids.length;
  }, { SUPA_URL, ANON });
}

// 本番ビルドを preview で配信（dev の StrictMode 二重実行で gotoMatchmaking が消える問題を回避）。
function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'preview'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => { const s = b.toString().replace(/\x1b\[[0-9;]*m/g, ''); const m = s.match(/(http:\/\/localhost:\d+)/); if (m && !url) { url = m[1]; resolve({ proc, url }); } };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData); proc.on('error', reject);
    setTimeout(() => { if (!url) reject(new Error('preview起動タイムアウト')); }, 30000);
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

  // 残ルーム掃除（前回の PLAYING ルームで BATTLE に飛ぶのを防ぐ）
  const cleaned = await cleanupRooms(page);
  console.log(`残ルーム掃除: ${cleaned}件削除`);

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

  // セットアップ自動進行（じゃんけん→ルリグ選択→マリガン→ゲーム開始）。phase 認識で1手ずつ・待ち長め。
  const hands = ['グー', 'チョキ', 'パー'];
  let handIdx = 0;
  for (let i = 0; i < 40; i++) {
    const txt = await bodyText(page);
    if (/メインフェイズ|あなたのターン|ターン[0-9]|エナチャージ|グロウフェイズ|アタックフェイズ/.test(txt)) {
      console.log(`③ PLAYING 到達（${i}周目）`); break;
    }
    let clicked = null;
    if (/相手の選択を待って|結果|移行中|準備中|待っています/.test(txt)) {
      clicked = '(待機)';
    } else if (/出す手を選んで/.test(txt)) {
      // じゃんけん：手を変えながら1回ずつ
      const h = hands[handIdx++ % 3];
      const el = page.getByRole('button', { name: h }).first();
      if (await el.count()) { await el.click().catch(() => {}); clicked = 'じゃんけん:' + h; }
      await page.waitForTimeout(2500);
    } else if (/ルリグを配置|ルリグを選/.test(txt)) {
      // Lv0ルリグのボタン（カード名/番号を含む）をクリック
      const btn = page.locator('button', { hasText: 'WD03-005' }).first();
      if (await btn.count()) { await btn.click().catch(() => {}); clicked = 'ルリグ(WD03-005)'; }
      else { const b2 = page.locator('button', { hasText: 'コード・ピルルク' }).first(); if (await b2.count()) { await b2.click().catch(() => {}); clicked = 'ルリグ(名前)'; } }
    } else {
      for (const t of ['この手札でOK', '引き直さない', 'キープ', 'この手札で', 'ゲーム開始', '開始', '決定', 'OK', '完了']) {
        const el = page.getByRole('button', { name: t }).first();
        if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); clicked = t; break; }
      }
    }
    console.log(`  [${i}] click=${clicked ?? 'なし'} | ${txt.slice(0, 90).replace(/\n/g, ' ')}`);
    await page.waitForTimeout(1500);
    if ((i + 1) % 5 === 0) await page.screenshot({ path: `${SHOT}/drv-setup-${i + 1}.png`, fullPage: true });
  }
  await page.screenshot({ path: `${SHOT}/drv-99-playing.png`, fullPage: true });
  console.log('PLAYING盤面:', (await bodyText(page)).slice(0, 120).replace(/\n/g, ' '));

  // ── battle_states 行を読んで構造をダンプ（注入の足場確認）──
  const dump = await page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
    const h = { apikey: ANON, Authorization: `Bearer ${token}` };
    const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
    const rooms = await r1.json(); const roomId = rooms?.[0]?.id;
    if (!roomId) return { error: 'PLAYINGルームなし' };
    const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=*`, { headers: h });
    const row = (await r2.json())?.[0];
    const hs = row?.host_state ?? {};
    return {
      roomId, uid, host_id: row?.host_id, active_user_id: row?.active_user_id,
      turn_phase: row?.turn_phase, turn_count: row?.turn_count,
      host_state_keys: Object.keys(hs), field_keys: Object.keys(hs.field ?? {}),
      hand_len: hs.hand?.length, lrig: hs.field?.lrig, signi: hs.field?.signi, energy_len: hs.energy?.length,
    };
  }, { SUPA_URL, ANON });
  console.log('\n=== battle_states ダンプ ===');
  console.log(JSON.stringify(dump, null, 2));

  if (errors.length) { console.log('\n[console errors]'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  await browser.close();
} catch (e) { console.error('失敗:', e.message); code = 2; }
finally { proc.kill(); try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true }); } catch {} }
process.exit(code);
