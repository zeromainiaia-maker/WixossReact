// §5.1 `V-287` — 「何手目に戻る」の実機確認（2026-09-23 ユーザー要望）。
//
// 使い方: node scripts/verifyRewind.mjs        （PvP＝claude1 host / claude2 guest・約2〜4分）
//
// 🔴**なぜ通し対戦（`verifyFullMatch.mjs`）と別にするか**＝確かめたいのは勝敗ではなく
//   **「2人の同意 → 盤面が本当にその手へ戻る」**なので、決着まで回す必要がない（セットアップ＋数手で足りる）。
//   プラミング（build / preview / login / セットアップ進行）は `verifyFullMatch.mjs` から import して共有する。
//
// 観測点（PASS の条件）:
//   ① DB のトリガーが動く＝`battle_states.move_no` が進み、`battle_snapshots` に行が溜まる
//   ② 申請 → 相手の画面に同意ダイアログ（`rewind-consent`）が出る
//   ③🔴**反転＝断ると盤面が動かない**（申請しただけで戻ってしまわないこと）
//   ④ 同意 → **両者の盤面がその手のスナップショットと一致**する（ターン・フェイズ・手札枚数）
//   ⑤ ログは戻らず「N手目の盤面に戻しました」が1行増える
import { chromium } from '@playwright/test';
import {
  buildFirst, startPreview, killTree, login, cleanupRooms, makeSeat, makeQuery,
  driveSetup, playOneStep, clickDeckInFolders, sleep, SHOT, accounts, SUPA_URL, ANON, DECK_NAME,
} from './verifyFullMatch.mjs';

/** ページのログイン済みトークンで REST を読む（RLS はその対戦者の権限で効く）。 */
const dbGet = (page, path) => page.evaluate(async (a) => {
  const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
  const sess = JSON.parse(localStorage.getItem(key));
  const r = await fetch(`${a.SUPA_URL}/rest/v1/${a.path}`,
    { headers: { apikey: a.ANON, Authorization: `Bearer ${sess.access_token}` } });
  return { status: r.status, body: await r.json() };
}, { SUPA_URL, ANON, path });

const fails = [];
const check = (cond, label) => { console.log(`   ${cond ? 'OK ' : 'NG '} ${label}`); if (!cond) fails.push(label); };
/** 盤面の指紋（戻ったかを人間が読める形で比べる）。 */
const fp = (r) => `T${r.turn_count}/${r.turn_phase}/手${(r.host_state?.hand ?? []).length}-${(r.guest_state?.hand ?? []).length}`;

let proc = null;
try {
  await buildFirst();
  const started = await startPreview();
  proc = started.proc;
  console.log('preview:', started.url);
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  const ctxH = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxG = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageH = await ctxH.newPage(), pageG = await ctxG.newPage();
  const errs = [];
  for (const [p, who] of [[pageH, 'host'], [pageG, 'guest']]) {
    p.on('pageerror', e => errs.push(`${who}: ` + String(e.message).slice(0, 200)));
  }
  try {
    await login(pageH, started.url, accounts[0]);
    await login(pageG, started.url, accounts[1]);
    console.log('   残ルーム掃除: host', await cleanupRooms(pageH), '件 / guest', await cleanupRooms(pageG), '件');
    const H = makeSeat(pageH, 'claude1'), G = makeSeat(pageG, 'claude2');
    const qH = makeQuery(pageH), qG = makeQuery(pageG);

    // ── 部屋を作って対戦開始（`runPvpMatch` と同じ手順）──
    const toModeSelect = async (page) => {
      await page.evaluate(() => sessionStorage.setItem('gotoMatchmaking', '1'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await page.getByText('使用デッキを選択', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
      if (!(await clickDeckInFolders(page, DECK_NAME, 'match-deck-'))) throw new Error(`デッキ ${DECK_NAME} が見つからない`);
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '次へ' }).click();
      await page.waitForTimeout(600);
    };
    await toModeSelect(pageH);
    await pageH.getByRole('button', { name: 'ルームを作成する' }).click();
    await pageH.getByText('対戦相手を待っています', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
    const passcode = await pageH.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => /^\d{4}$/.test(d.textContent?.trim() ?? ''));
      return el?.textContent?.trim() ?? null;
    });
    if (!passcode) throw new Error('パスコードを読めなかった');
    console.log('   パスコード:', passcode);
    await toModeSelect(pageG);
    await pageG.getByPlaceholder('パスコード（4桁）').fill(passcode);
    await pageG.getByRole('button', { name: 'ルームに参加' }).click();
    // ⚠**参加が届くまでの時間はまちまち**＝1回だけ待って落とすと「参加できていない」のか
    //   「まだ届いていない」のか分からない。届くまで回して、駄目なら両者の画面を出す。
    let started2 = false;
    for (let i = 0; i < 20 && !started2; i++) {
      await sleep(1500);
      started2 = !!(await H.clickBtn('ゲーム開始'));
    }
    if (!started2) {
      console.log('   host 画面:', (await H.body()).slice(0, 300).split(String.fromCharCode(10)).join(' | '));
      console.log('   guest 画面:', (await G.body()).slice(0, 300).split(String.fromCharCode(10)).join(' | '));
      await pageH.screenshot({ path: `${SHOT}/v287-join-fail-host.png`, fullPage: true }).catch(() => {});
      await pageG.screenshot({ path: `${SHOT}/v287-join-fail-guest.png`, fullPage: true }).catch(() => {});
      throw new Error('ゲーム開始ボタンが出なかった（参加が届いていない）');
    }
    await pageH.waitForTimeout(3500);
    if (!(await driveSetup([H, G], 'rewind'))) throw new Error('セットアップが PLAYING へ到達しなかった');

    // ── 数手だけ進める（決着までは回さない）──
    const step = async (n) => {
      for (let i = 0; i < n; i++) {
        for (const S of [H, G]) {
          const st = await makeQuery(S.page)().catch(() => ({}));
          await playOneStep(S, st, new Set()).catch(() => null);
        }
        await sleep(600);
      }
    };
    await step(5);

    // ── ① トリガーが動いているか ──
    const st1 = await qH();
    const room = st1.roomId;
    const row1 = (await dbGet(pageH, `battle_states?room_id=eq.${room}&select=move_no,game_logs`)).body[0];
    const snaps1 = (await dbGet(pageH, `battle_snapshots?room_id=eq.${room}&select=move_no&order=move_no.desc&limit=1`)).body;
    console.log(`   move_no=${row1.move_no} / スナップショット最新=${snaps1[0]?.move_no ?? 'なし'} / ログ${row1.game_logs.length}行`);
    check(row1.move_no > 0, '(1) battle_states.move_no がトリガーで進んでいる');
    check(snaps1.length > 0 && snaps1[0].move_no > 0, '(1) battle_snapshots に履歴が溜まっている');
    const stamped = row1.game_logs.filter(l => typeof l.move_no === 'number').length;
    check(stamped > 0, `(1) ログ行に手番号が刻まれている（${stamped}/${row1.game_logs.length}行）`);

    // 戻す先＝いまのログの末尾（ここまでの盤面）。この時点の盤面をスナップショットから読む。
    const markLogNo = row1.game_logs.length;
    const markMoveNo = row1.game_logs[markLogNo - 1].move_no;
    const snapRow = (await dbGet(pageH, `battle_snapshots?room_id=eq.${room}&move_no=eq.${markMoveNo}&select=snapshot`)).body[0]?.snapshot;
    check(!!snapRow, `(1) ${markLogNo}手目（盤面#${markMoveNo}）のスナップショットが引ける`);
    if (!snapRow) throw new Error('スナップショットが引けないので以降を測れない');
    console.log(`   戻す先 ${markLogNo}手目 = ${fp(snapRow)}`);

    // ── さらに進めて盤面を変える ──
    await step(8);
    const row2 = (await dbGet(pageH, `battle_states?room_id=eq.${room}&select=move_no,turn_count,turn_phase,host_state,guest_state,game_logs`)).body[0];
    console.log(`   いま = ${fp(row2)}（move_no=${row2.move_no} / ログ${row2.game_logs.length}行）`);
    check(fp(row2) !== fp(snapRow), '前提: 戻す先と現在の盤面が違う（同じだと戻ったか判定できない）');

    // ── ②③ 申請 → 断る（盤面が動かないこと）──
    const openRewind = async (no) => {
      await pageH.getByRole('button', { name: '終了', exact: true }).first().click();
      await pageH.getByTestId('rewind-open').click({ timeout: 10000 });
      await pageH.getByTestId('rewind-input').fill(String(no));
      await pageH.waitForTimeout(400);
      const preview = await pageH.getByTestId('rewind-preview').innerText().catch(() => '');
      await pageH.getByTestId('rewind-send').click();
      return preview;
    };
    const preview = await openRewind(markLogNo);
    console.log('   入力プレビュー:', preview.slice(0, 80));
    check(preview.startsWith(`${markLogNo}手目:`), '(2) 手番号を入れるとその手のログ本文が出る');
    await pageG.getByTestId('rewind-consent').waitFor({ state: 'visible', timeout: 20000 });
    check(true, '(2) 相手の画面に同意ダイアログが出る');
    await pageG.getByTestId('rewind-decline').click();
    await sleep(2500);
    const row3 = (await dbGet(pageH, `battle_states?room_id=eq.${room}&select=turn_count,turn_phase,host_state,guest_state`)).body[0];
    check(fp(row3) === fp(row2), '(3) 反転＝断ったら盤面が動かない');
    check(await pageH.getByTestId('rewind-wait').isVisible().catch(() => false), '(3) 申請した側に「断られました」が出る');
    await pageH.getByTestId('rewind-cancel').click();
    await sleep(1500);

    // ── ④⑤ もう一度申請 → 同意 → 戻る ──
    await openRewind(markLogNo);
    await pageG.getByTestId('rewind-consent').waitFor({ state: 'visible', timeout: 20000 });
    await pageG.getByTestId('rewind-accept').click();
    await sleep(6000);
    const row4 = (await dbGet(pageH, `battle_states?room_id=eq.${room}&select=move_no,turn_count,turn_phase,host_state,guest_state,game_logs,rewind_request`)).body[0];
    console.log(`   戻したあと = ${fp(row4)}（move_no=${row4.move_no} / ログ${row4.game_logs.length}行）`);
    check(fp(row4) === fp(snapRow), `(4) 盤面が ${markLogNo}手目（${fp(snapRow)}）に戻っている`);
    check(row4.move_no > row2.move_no, '(4) move_no は戻らず前進している（履歴が分岐しない）');
    check(row4.game_logs.length > row2.game_logs.length, '(5) ログは戻らず増えている');
    // ⚠**末尾とは限らない**＝戻ったあとに画面がフェイズ行を書き足すので、**含まれているか**で見る
    //   （初版は `at(-1)` で見て、証跡が入っているのに FAIL と出た）。
    check(row4.game_logs.some(l => l.action.includes(`${markLogNo}手目の盤面に戻しました`)), '(5) 戻した証跡の1行が入る');
    // 🔴**戻したぶんの手札差を「誰かが捨てた」ように書かない**（2026-09-23 実機で実測した粗）。
    const afterMark = row4.game_logs.slice(row4.game_logs.findIndex(l => l.action.includes('手目の盤面に戻しました')) + 1);
    check(!afterMark.some(l => /の手札 [+-]\d+枚/.test(l.action)), '(5) 反転＝戻した直後に手札増減のログを書かない');
    check(row4.rewind_request === null, '(5) 済んだ申請が後片付けされている');
    const sH = await qH(), sG = await qG();
    check(sH.turnCount === row4.turn_count && sG.turnCount === row4.turn_count, '(4) 両者の画面が戻った盤面を見ている');
    check(!(await pageG.getByTestId('rewind-consent').isVisible().catch(() => false)), '(5) 同意ダイアログが閉じている');

    await pageH.screenshot({ path: `${SHOT}/v287-rewind-host.png`, fullPage: true }).catch(() => {});
    await pageG.screenshot({ path: `${SHOT}/v287-rewind-guest.png`, fullPage: true }).catch(() => {});
    if (errs.length) { console.log('   ⚠ pageerror:', errs.slice(0, 5).join(' / ')); fails.push('pageerror が出ている'); }
  } finally {
    await ctxH.close().catch(() => {}); await ctxG.close().catch(() => {}); await browser.close().catch(() => {});
  }
} catch (e) {
  console.error('失敗:', e.message);
  fails.push('例外: ' + e.message);
} finally { killTree(proc); }

console.log('\n========== V-287 結果 ==========');
console.log(fails.length === 0 ? 'PASS（何手目に戻る＝同意フロー）' : `FAIL ${fails.length}件\n  - ` + fails.join('\n  - '));
process.exit(fails.length ? 1 : 0);
