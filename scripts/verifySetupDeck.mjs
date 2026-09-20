// claude1 にログインし、Supabase REST API（ユーザーセッションのトークン＝RLS下）で
// 検証用デッキ "VERIFY_DECK" を1つ挿入する（冪等：既存ならスキップ）。
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { harnessAccounts } from './verifyAccounts.mjs';

const env = readFileSync('.env.local', 'utf-8');
const SUPA_URL = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();
// 🔴**ハーネス用アカウントだけ**（`harnessAccounts`）＝このスクリプトは**デッキを挿入・上書きする**ので、
//   ユーザー本人のアカウント（`harness:false`）を絶対に回さない（2026-09-20 の事故＝`verifyAccounts.mjs` 冒頭）。
const accounts = harnessAccounts();
// 🆕§5.6 `C-3`（2026-09-17）＝`--mech` で**機構踏破用デッキ `VERIFY_DECK_MECH`** を作る。
//   🔑**なぜ要るか**＝`VERIFY_DECK` は**シグニ40枚＋ルリグ5枚だけ**（ガード・スペル・アーツ・アシスト・レゾナ・ライズが0枚）＝
//   `census:play` の未踏の大半が「CPU が踏めない」ではなく「山に札が無い」だった。リリースゲート（`VERIFY_DECK`）は変えずに、
//   計器用の山を別に持つ。使い方＝`DECK=VERIFY_DECK_MECH node scripts/verifyFullMatch.mjs cpu`。
//   構成（青ピルルク）＝センター WD03 の Lv0〜3／アシスト2系統（ウムル・タウィル＝Lv0→Lv1《無》×0）／アーツ（ドント・ファイト＝除去）／
//   レゾナ（†Ｍ・Ｇ・Ｔ†＝ピルルク限定・青と黒の＜電機＞を場から）／ガード4／除去スペル4／【起】付きシグニ4／ライズ（Ｈ２Ｏ＝＜原子＞の上）。
// 🆕§5.6 `C-7`（2026-09-17）＝キーとピースを足した（ルリグデッキ 10→13枚＝計器用の山なので構築上限は見ない）。
//   キー（ソウイ＝キー＝《コイン》×１・【出】2枚引く）＋**コインの入手元**（アロス・ピルルク ＴＥＴ＝Lv4・《青》×０・コイン3）
//   ＝WD03 のピルルクはどのレベルもコインを持たない＝グロウでコインを得ないとキーが出せない。
//   ピース（アサルト・ケルベロス＝《無》×０・ルリグ3体・**人間の手札を見て1枚捨てさせる**＝CPU が撃つと人間側が受ける向き）。
const MECH = process.argv.includes('--mech');
const MECH_DECK = {
  lrig_deck: ['WD03-005', 'WD03-004', 'WD03-003', 'WD03-002', 'WDK09-005', 'WXDi-D01-009', 'WDK14-005', 'WXDi-D01-006', 'WX21-011', 'WX12-017',
    'WDK02-001', 'WXK02-020', 'WXDi-P00-006'],
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
// ⚠`verify-deck.json` は `.gitignore` 圏内＝無い環境では、**DB に既にある自分の `VERIFY_DECK`（player）を元にする**（`deck=null`）。
const deck = MECH ? MECH_DECK : existsSync('verify-deck.json') ? JSON.parse(readFileSync('verify-deck.json', 'utf-8')) : null;
// 🆕2026-09-17＝**最初に場に出すルリグはデッキで指定する**（対戦開始時の選択画面は廃止）＝指定の無いデッキはマッチングに出ない。
//   MECH＝センター コード・ピルルク／アシスト左 ウムル＝ノル／右 タウィル＝ノル。VERIFY_DECK＝`verify-deck.json` に
//   `center_lrig` 等があればそれ、無ければ WD03-005（コード・ピルルク）をセンターのみで置く。
const ROLES = MECH
  ? { center_lrig: 'WD03-005', assist_lrig_l: 'WDK09-005', assist_lrig_r: 'WDK14-005' }
  : { center_lrig: deck?.center_lrig ?? 'WD03-005', assist_lrig_l: deck?.assist_lrig_l ?? null, assist_lrig_r: deck?.assist_lrig_r ?? null };
if (deck && !deck.lrig_deck.includes(ROLES.center_lrig)) { console.error(`センター ${ROLES.center_lrig} がルリグデッキに無い`); process.exit(1); }
const DECK_NAME = MECH ? 'VERIFY_DECK_MECH' : 'VERIFY_DECK';
if (deck && deck.main_deck.length !== 40) { console.error(`メインデッキが40枚でない: ${deck.main_deck.length}`); process.exit(1); }
// 🆕2026-09-17＝デッキには種類がある（`player`＝自分が使う／`cpu`＝CPU が使う＝`utils/deckFolders.ts`）。
//   通し対戦は「自分＝player の山」「CPU＝cpu の山」から選ぶので、**同じ名前・同じ中身で両方の種類を作る**。
const KINDS = ['player', 'cpu'];

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

async function ensureDeck(page, acc, kind) {
  return await page.evaluate(async ({ SUPA_URL, ANON, deck: deckIn, name, sortOrder, roles, kind }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    if (!key) return { error: 'auth-token がlocalStorageに無い' };
    const sess = JSON.parse(localStorage.getItem(key));
    const token = sess.access_token; const uid = sess.user?.id;
    if (!token || !uid) return { error: 'token/uid 取得失敗' };
    const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    let deck = deckIn;
    if (!deck) {
      const src = await (await fetch(`${SUPA_URL}/rest/v1/decks?user_id=eq.${uid}&name=eq.${encodeURIComponent(name)}&deck_kind=eq.player&select=main_deck,lrig_deck`, { headers: h })).json();
      if (!Array.isArray(src) || !src.length) return { uid, kind, error: 'verify-deck.json が無く、DB にも player の元デッキが無い' };
      deck = src[0];
    }
    const existRes = await fetch(`${SUPA_URL}/rest/v1/decks?user_id=eq.${uid}&name=eq.${encodeURIComponent(name)}&deck_kind=eq.${kind}&select=id,main_deck,lrig_deck,center_lrig,assist_lrig_l,assist_lrig_r`, { headers: h });
    const exist = await existRes.json();
    if (Array.isArray(exist) && exist.length) {
      const cur = exist[0];
      // 🆕§5.6 `C-7`＝中身が変わっていたら上書きする（旧＝名前があれば常にスキップ＝構成を変えても山に届かなかった）。
      const sameRoles = cur.center_lrig === roles.center_lrig && cur.assist_lrig_l === roles.assist_lrig_l && cur.assist_lrig_r === roles.assist_lrig_r;
      if (sameRoles && JSON.stringify(cur.main_deck) === JSON.stringify(deck.main_deck) && JSON.stringify(cur.lrig_deck) === JSON.stringify(deck.lrig_deck)) {
        return { uid, kind, existed: true, deckId: cur.id };
      }
      const upd = await fetch(`${SUPA_URL}/rest/v1/decks?id=eq.${cur.id}`, {
        method: 'PATCH', headers: { ...h, Prefer: 'return=representation' },
        body: JSON.stringify({ main_deck: deck.main_deck, lrig_deck: deck.lrig_deck, ...roles }),
      });
      const updBody = await upd.json();
      if (!upd.ok || !Array.isArray(updBody) || updBody.length === 0) return { uid, error: 'update失敗 ' + JSON.stringify(updBody) };
      return { uid, kind, updated: true, deckId: cur.id };
    }
    const ins = await fetch(`${SUPA_URL}/rest/v1/decks`, {
      method: 'POST', headers: { ...h, Prefer: 'return=representation' },
      body: JSON.stringify({ user_id: uid, name, main_deck: deck.main_deck, lrig_deck: deck.lrig_deck, sort_order: sortOrder, deck_kind: kind, ...roles }),
    });
    const body = await ins.json();
    if (!ins.ok) return { uid, error: 'insert失敗 ' + JSON.stringify(body) };
    return { uid, kind, inserted: true, deckId: body[0]?.id };
  }, { SUPA_URL, ANON, deck, name: DECK_NAME, sortOrder: MECH ? 1 : 0, roles: ROLES, kind });
}

const { proc, url } = await startDev();
console.log(`dev: ${url}`);
let code = 0;
try {
  const browser = await chromium.launch();
  for (const acc of accounts) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await login(page, url, acc);
    for (const kind of KINDS) {
      const res = await ensureDeck(page, acc, kind);
      console.log(`[${acc.username}] ${JSON.stringify(res)}`);
      if (res.error) code = 1;
    }
    await page.close();
  }
  await browser.close();
} catch (e) { console.error('失敗:', e.message); code = 2; }
finally { proc.kill(); try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true }); } catch {} }
process.exit(code);
