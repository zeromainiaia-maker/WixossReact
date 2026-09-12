// §5.1 `V-213` — リリースゲートの実機スモーク＝**通し対戦を勝敗が付くまで回す**。
//
// 使い方:
//   node scripts/verifyFullMatch.mjs           # CPU 1本 → PvP 1本
//   node scripts/verifyFullMatch.mjs cpu       # CPU 通し対戦だけ
//   node scripts/verifyFullMatch.mjs pvp       # PvP 通し対戦だけ（claude1 host / claude2 guest）
//
// 🔴**`verifyBattleDrive.mjs` とは目的が違う**＝あちらは「盤面を注入して1つの効果を観測する」道具で、
//   **ターンを最後まで回さない**（＝ゲーム全体の進行・決着判定・リフレッシュ・PvP の realtime 同期は
//   1本も通っていない）。ここは逆に**盤面を一切注入せず**、実デッキで最初から最後まで通す。
//
// 前提: `verify-accounts.json`（claude1/claude2）・`.env.local`・デッキ「VERIFY_DECK」。
//   （`scripts/verifyBattleDrive.mjs` と同じ。無ければ `scripts/verifySetupDeck.mjs`）
//
// 判定＝**`battle_states.global_phase === 'FINISHED'` かつ `winner_id` が付く**こと。
//   ⚠**「例外が出ない」だけでは PASS にしない**＝決着まで行かずに詰まるのが一番あり得る壊れ方なので、
//     手詰まり（何もクリックできない状態が続く）を FAIL として明示的に検出する。
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SHOT = 'scratchpad-verify';
mkdirSync(SHOT, { recursive: true });

const accounts = JSON.parse(readFileSync('verify-accounts.json', 'utf-8')).accounts;
const env = readFileSync('.env.local', 'utf-8');
const SUPA_URL = env.match(/VITE_SUPABASE_URL=(.+)/)?.[1]?.trim();
const ANON = env.match(/VITE_SUPABASE_ANON_KEY=(.+)/)?.[1]?.trim();

const MODES = (() => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('-'));
  if (!args.length) return ['cpu', 'pvp'];
  return args.map(a => a.toLowerCase());
})();
// 1本あたりの上限（秒）。決着しないまま回り続けるのを止める安全弁。
// ⚠**PvP は CPU 戦の3倍以上かかる**（実測＝CPU 8ターン/232s に対し PvP は 50ターン超/1800s＋）。
//   理由は「レベル0のルリグのまま進むのでシグニを1体も置けず、ライフを削るのがルリグアタックだけ」。
//   🔴1800s だと **life=0/1 の1手前**で切れた実績があるので既定を上げてある。
const MATCH_TIMEOUT_SEC = Number(process.env.MATCH_TIMEOUT_SEC || 2700);
// 🔑手詰まりは**周回数ではなく「盤面が動かない秒数」**で測る＝CPU の思考待ちは周回だけ進んで
//   盤面が動かないので、周回数で切ると相手のターン中に誤検出する。
const STUCK_SEC = Number(process.env.STUCK_SEC || 60);

// ── preview サーバ（verifyBattleDrive.mjs と同じ方式＝dist の鮮度を見て build を省略）─────────
function distIsFresh() {
  try {
    const distTime = statSync('dist/index.html').mtimeMs;
    let newest = null;
    const scan = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else { const t = statSync(p).mtimeMs; if (!newest || t > newest.t) newest = { t, p }; }
      }
    };
    for (const d of ['src', 'public']) scan(d);
    for (const f of ['index.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json']) {
      try { const t = statSync(f).mtimeMs; if (!newest || t > newest.t) newest = { t, p: f }; } catch { /* 無ければ無視 */ }
    }
    return { fresh: !!newest && distTime > newest.t, newest: newest?.p };
  } catch { return { fresh: false, newest: null }; }
}
function buildFirst() {
  if (process.env.SKIP_BUILD === '1') { console.log('build スキップ（SKIP_BUILD=1）'); return Promise.resolve(); }
  if (process.env.SKIP_BUILD !== '0') {
    const { fresh, newest } = distIsFresh();
    if (fresh) { console.log('build スキップ（dist が src/public より新しい）'); return Promise.resolve(); }
    if (newest) console.log(`dist より新しい変更: ${newest}`);
  }
  return new Promise((resolve, reject) => {
    console.log('dist を build 中…');
    const b = spawn('npm', ['run', 'build'], { shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    b.stderr.on('data', d => { err += d.toString(); });
    b.on('error', reject);
    b.on('exit', c => c === 0 ? resolve() : reject(new Error('build 失敗:\n' + err.slice(-2000))));
  });
}
// ⚠ Windows では proc.kill() が shell だけを殺して vite が孤児で残る＝必ず同期 taskkill を先に打つ。
let treeKilled = false;
function killTree(proc) {
  if (!proc || treeKilled) return;
  treeKilled = true;
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { stdio: 'ignore' });
  else { try { proc.kill(); } catch { /* noop */ } }
}
function startPreview() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'preview'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => {
      const s = b.toString().replace(/\x1b\[[0-9;]*m/g, '');
      const m = s.match(/(http:\/\/localhost:\d+)/);
      if (m && !url) { url = m[1]; resolve({ proc, url }); }
    };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData); proc.on('error', reject);
    setTimeout(() => { if (!url) { killTree(proc); reject(new Error('preview 起動タイムアウト')); } }, 30000);
  });
}

// ── 1プレイヤー分のブラウザ操作（ログイン済みページに紐づく）───────────────────────────
function makeSeat(page, name) {
  const S = {
    name, page,
    log: (...a) => console.log(`   [${name}]`, ...a),
    body: () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 1200)),
    clickBtn: async (label, { exact = false } = {}) => {
      const b = page.getByRole('button', { name: label, exact }).first();
      if (!(await b.count()) || !(await b.isVisible().catch(() => false))) return null;
      if (!(await b.isEnabled().catch(() => false))) return null;
      try { await b.click({ timeout: 2000 }); return 'btn:' + label; } catch { return null; }
    },
    clickAny: async (labels) => {
      for (const l of labels) { const r = await S.clickBtn(l); if (r) return r; }
      return null;
    },
    clickTestId: async (...ids) => {
      for (const id of ids) {
        const el = page.getByTestId(id).first();
        if (await el.count() && await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => true)) {
          try { await el.click({ timeout: 2000 }); return 'tid:' + id; } catch { /* 次の候補へ */ }
        }
      }
      return null;
    },
    /**
     * カード詳細モーダル（`CardModal`／`CardStackModal`）を閉じる。
     * 🔴**これが要る**＝手札やゾーンを開いたまま残ると**全画面オーバーレイがフェイズ進行ボタンを覆う**。
     *   ボタン自体は `isVisible`／`isEnabled` を満たすので、**クリックが interception で失敗するだけ**＝
     *   「押しているのに進まない」に見える（初回実行の手詰まり②の真因）。
     * ⚠これらは Escape で閉じない（`onClose` が背景 div の onClick だけ）＝文言クリックも要る。
     */
    closeCardModal: async () => {
      let closed = null;
      for (let k = 0; k < 2; k++) {
        await page.keyboard.press('Escape').catch(() => {});
        const tx = page.getByText(/タップ.{0,4}閉じる/).first();
        if (await tx.count() && await tx.isVisible().catch(() => false)) {
          try { await tx.click({ timeout: 1200 }); closed = 'close:card-modal'; } catch { /* 次周 */ }
        }
        await page.waitForTimeout(200);
      }
      return closed;
    },
    /**
     * エンドフェイズの手札上限超過（`EndDiscardModal`）＝**枚数ぴったり選ばないと確定ボタンが有効にならない**。
     * 🔴汎用の「決定」系ラベルでは絶対に抜けられない（ボタン文言が `Nまい捨てて終了`／
     * `あとN枚選択してください` と可変で、しかも未選択のあいだ disabled）。
     * ⚠**昇順に1枚ずつ選び、有効になったら止める**（選択済みをもう一度押すと解除されて振動する）。
     */
    endDiscardStep: async () => {
      if (!(await page.getByTestId('enddiscard-hand-0').count())) return null;
      const confirm = page.getByRole('button', { name: /枚捨てて終了/ }).first();
      for (let i = 0; i < 12; i++) {
        if (await confirm.count() && await confirm.isEnabled().catch(() => false)) break;
        const c = page.getByTestId(`enddiscard-hand-${i}`).first();
        if (!(await c.count())) break;
        await c.click({ timeout: 1500 }).catch(() => {});
        await page.waitForTimeout(150);
      }
      if (await confirm.count() && await confirm.isEnabled().catch(() => false)) {
        try { await confirm.click({ timeout: 2000 }); return 'enddiscard:確定'; } catch { /* 次周 */ }
      }
      return null;
    },
    /**
     * **効果モーダルの総当たり**＝`CHOOSE` の選択肢は**カード固有の日本語ラベル**で出るため、
     * 固定ラベル表では絶対に押せない（`EffectInteractionModal.tsx:727` は testid も付かない）。
     * 🔴これが無いと**「効果を選択してください」で必ず永久停止する**（初回実行の手詰まり④の真因）。
     * 🔑モーダルは `createPortal` で body 直下に出て `z-index: 4000〜4999` を持つ＝**その中のボタンだけ**を押す。
     * ⚠**否定的なラベルは押さない**（`戻る`＝ダイアログを開き直すだけ・`キャンセル`＝選択そのものを捨てる）。
     */
    modalFallbackStep: async () => {
      const btns = page.locator('div[style*="z-index: 4"] button');
      const n = Math.min(await btns.count(), 12);
      for (let i = 0; i < n; i++) {
        const b = btns.nth(i);
        if (!(await b.isVisible().catch(() => false)) || !(await b.isEnabled().catch(() => false))) continue;
        const t = ((await b.innerText().catch(() => '')) || '').replace(/\s+/g, '');
        if (!t) continue;
        if (/^(戻る|キャンセル)/.test(t)) continue;
        try { await b.click({ timeout: 2000 }); return 'modal:' + t.slice(0, 16); } catch { /* 次の候補へ */ }
      }
      return null;
    },
    /**
     * 対話モーダルを1手進める。
     * 🔑**`pick-0` は「決定 (1/N)」が出ていないときだけ押す**（`verifyBattleDrive.mjs` の `stdStep` と同じ規約）
     *   ＝必要枚数に達しているのにさらに選ぶと選択が解除されて無限ループになる。
     */
    modalStep: async () => {
      const pick0 = page.getByTestId('pick-0').first();
      if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
        const ready = await page.getByRole('button', { name: /決定 \(1\// }).count();
        if (!ready) { try { await pick0.click({ timeout: 1500 }); return 'pick:pick-0'; } catch { /* 続行 */ } }
      }
      return await S.clickAny([
        // 🔴**ライフバースト確認**（`LifeBurstCheckModal`）＝**相手ターンでも自分に来る**。
        //   ここを捌かないと**クラッシュのたびに永久停止**する（初回実行の手詰まり③の真因）。
        //   バースト持ちなら発動側を選ぶ＝engine をより多く通す。
        'ライフバースト発動', 'エナに送る',
        '発動順序を確定', '確定', '決定', 'OK', 'はい',
        // 🔑**フェイズ進行の確認ダイアログ**（`PhaseConfirmDialogs.tsx`）＝「このまま進む」で肯定する。
        //   ⚠**「戻る」を押してはいけない**（毎周ダイアログを開き直して永久に進まない＝初回実行の手詰まりの真因）。
        //   ⚠アタックのスキップ確認もこのラベルだが、**アタックは①〜③で先に試している**ので取りこぼさない。
        'このまま進む',
        // ⚠**否定側を肯定側より後に置く**＝「発動する／しない」が同時に出る窓で毎回パスすると
        //   ゲームが進まないまま手数だけ消える。
        'ガードしない', '使用しない', 'しない', '選ばない', 'スキップ', 'いいえ', '閉じる',
      ]);
    },
  };
  return S;
}

/** ログイン → （必要なら）ロビーへ。 */
async function login(page, url, acct) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(acct.username);
  await page.getByPlaceholder('パスワード').fill(acct.password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForFunction(
    () => ![...document.querySelectorAll('input')].some(i => i.placeholder === 'ユーザーネーム'),
    { timeout: 20000 });
  await page.waitForTimeout(1500);
}

/** そのアカウントが持つ残ルームを全部消す（前回の実行の残骸で matchmaking が詰まるのを防ぐ）。 */
async function cleanupRooms(page) {
  return await page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
    const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const r = await fetch(`${SUPA_URL}/rest/v1/rooms?or=(host_id.eq.${uid},guest_id.eq.${uid})&select=id`, { headers: h });
    const rooms = await r.json();
    for (const room of rooms ?? []) {
      await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${room.id}`, { method: 'DELETE', headers: h });
      await fetch(`${SUPA_URL}/rest/v1/rooms?id=eq.${room.id}`, { method: 'DELETE', headers: h });
    }
    return (rooms ?? []).length;
  }, { SUPA_URL, ANON });
}

/** 対戦の ground truth（ログの見た目ではなく DB 行）を読む。 */
function makeQuery(page) {
  return () => page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
    const h = { apikey: ANON, Authorization: `Bearer ${token}` };
    const r1 = await fetch(
      `${SUPA_URL}/rest/v1/rooms?or=(host_id.eq.${uid},guest_id.eq.${uid})&select=id,host_id,guest_id,status&order=created_at.desc`,
      { headers: h });
    const room = (await r1.json())?.[0];
    if (!room) return { error: 'no room' };
    const r2 = await fetch(
      `${SUPA_URL}/rest/v1/battle_states?room_id=eq.${room.id}` +
      `&select=host_state,guest_state,global_phase,winner_id,turn_phase,active_user_id,turn_count,pending_effect,pending_spell,effect_stack,game_logs`,
      { headers: h });
    const row = (await r2.json())?.[0];
    if (!row) return { error: 'no battle_state', roomStatus: room.status };
    const side = s => ({
      life: (s?.life_cloth ?? []).length,
      deck: (s?.deck ?? []).length,
      hand: (s?.hand ?? []).length,
      energy: (s?.energy ?? []).length,
      actionsDone: s?.actions_done ?? [],
      lrigHasAttacked: !!s?.lrig_has_attacked,
      attackedSigni: s?.attacked_signi_ids ?? [],
      check: s?.field?.check ?? null,
      pendingCrashed: (s?.pending_crashed_cards ?? []).length,
      lrigDown: !!s?.field?.lrig_down,
      signiDown: s?.field?.signi_down ?? [false, false, false],
      lrig: (s?.field?.lrig ?? []).at(-1) ?? null,
      signi: (s?.field?.signi ?? [null, null, null]).map(z => (z ?? []).at?.(-1) ?? null),
    });
    return {
      roomId: room.id,
      isHost: room.host_id === uid,
      uid,
      globalPhase: row.global_phase,
      winnerId: row.winner_id ?? null,
      iWon: row.winner_id ? row.winner_id === uid : null,
      turnPhase: row.turn_phase,
      turnCount: row.turn_count ?? 0,
      myTurn: row.active_user_id === uid,
      pendingEffect: row.pending_effect ? (row.pending_effect.interaction?.type ?? 'y') : null,
      pendingSpell: row.pending_spell ? 'y' : null,
      me: side(room.host_id === uid ? row.host_state : row.guest_state),
      opp: side(room.host_id === uid ? row.guest_state : row.host_state),
      logTail: (row.game_logs ?? []).slice(-6).map(l => [l.action, l.detail].filter(Boolean).join(' ')),
    };
  }, { SUPA_URL, ANON });
}

// フェイズ進行ボタン（`src/screens/battle/uiConstants.ts` の `PHASE_BTN` と一致させること）。
// 🔑**現在フェイズに対応する1本を先に狙う**＝総当たりだと DB のフェイズが1手遅れている隙に
//   前のフェイズのラベルを拾って「押したのに進まない」空振りになる。
const PHASE_BTN = {
  UP: 'ドローフェイズへ', DRAW: 'エナフェイズへ', ENERGY: 'グロウフェイズへ',
  GROW: 'メインフェイズへ', MAIN: 'アタックフェイズへ',
  ATTACK_ARTS: 'アーツ終了→相手へ', ATTACK_ARTS_OP: 'アーツ終了',
  ATTACK_SIGNI: 'ルリグアタックへ', ATTACK_LRIG: 'エンドフェイズへ', END: 'ターン終了',
};
const PHASE_BTNS = Object.values(PHASE_BTN);

/**
 * 1席ぶんの「1手」。**何かクリックできたら文字列、何もできなければ null** を返す。
 * 🔑優先順＝①対話モーダル ②アタック（決着させる唯一の手段）③召喚 ④フェイズ進行。
 *   ⚠フェイズ進行を先に置くと、アタックせずに毎ターン素通りして**決着しない**。
 */
async function playOneStep(S, st, blocked = new Set()) {
  const page = S.page;

  // ① 対話モーダル（自分に来ている pending は誰のターンでも捌く＝相手ターンのガード窓など）。
  const discard = await S.endDiscardStep();
  if (discard) return discard;
  const modal = await S.modalStep();
  if (modal) return modal;
  // 🔴固定ラベルで拾えない効果モーダル（`CHOOSE` のカード固有ラベルなど）はここで総当たりする。
  if (st?.pendingEffect || st?.pendingSpell) {
    const fb = await S.modalFallbackStep();
    if (fb) return fb;
  }

  // ② セットアップ残り（じゃんけん・ルリグ選択・マリガン）が残っていれば捌く。
  const setup = await S.clickAny(['この手札でOK', '引き直さない', 'キープ', 'ゲーム開始']);
  if (setup) return setup;

  if (!st?.myTurn) {
    // 非ターンプレイヤーが持つのは ATTACK_ARTS_OP の「アーツ終了」だけ。
    const opStep = await S.clickAny(['アーツ終了']);
    if (opStep) return opStep;
    // 🔴**相手ターン中でも残りモーダルを畳む**＝開きっぱなしのカード詳細が
    //   ライフバースト確認（`LifeBurstCheckModal`）を覆うと、`click` が interception で落ちて
    //   **`host_state.field.check` が残り、CPU 側のループが `if (bs.host_state?.field?.check) return;` で
    //   永久に止まる**（`BattleScreen.tsx:526`）＝「相手のターン中...」のまま盤面が凍る。
    return await S.closeCardModal();
  }

  // ③ アタック（シグニ→ルリグ）。**ここが唯一ライフを削る手**なので進行ボタンより先に置く。
  if (st.turnPhase === 'ATTACK_SIGNI') {
    for (let z = 0; z < 3; z++) {
      if (!st.me.signi[z]) continue;
      // 🔴**既にアタックした／ダウン中のシグニを押し直さない**＝カード詳細に「アタック」が残る形があり、
      //   押せてしまう（＝盤面が動かないのに「クリックできた」ので手詰まり検出をすり抜ける）。
      if (st.me.attackedSigni.includes(st.me.signi[z]) || st.me.signiDown[z]) continue;
      if (blocked.has(`attack:signi${z}`)) continue;
      if (!(await S.clickTestId(`my-signi-zone-${z}`))) continue;
      const atk = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
      for (let k = 0; k < 12; k++) {
        if (await atk.count() && await atk.isVisible().catch(() => false) && await atk.isEnabled().catch(() => false)) {
          try { await atk.click({ timeout: 2000 }); return `attack:signi${z}`; } catch { break; }
        }
        await page.waitForTimeout(120);
      }
      // アタックできないシグニ（ダウン済み等）＝カード詳細を閉じて次へ。
      await page.keyboard.press('Escape').catch(() => {});
    }
  }
  // 🔴**ルリグアタックは state のフラグで自粛しない**＝`lrig_has_attacked` / `lrig_down` を見て
  //   スキップする実装にしたら、**T4 以降 1度もアタックしなくなり**（フラグの読みが盤面と合わない）、
  //   ライフが 6/7 のまま**リフレッシュ待ちの 40 ターン超の消化試合**になった（実測 PvP T27 で未決着）。
  //   ⇒ **常に試し、効かない手は「指紋が変わらない3回」で自動的に封印される**方に任せる。
  if (st.turnPhase === 'ATTACK_LRIG' && !blocked.has('attack:lrig')) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!(await S.clickTestId('my-lrig-slot-center'))) { await S.closeCardModal(); continue; }
      const atk = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
      for (let k = 0; k < 12; k++) {
        if (await atk.count() && await atk.isVisible().catch(() => false) && await atk.isEnabled().catch(() => false)) {
          try { await atk.click({ timeout: 2000 }); return 'attack:lrig'; } catch { break; }
        }
        await page.waitForTimeout(120);
      }
      await S.closeCardModal();
      break;
    }
  }

  // ④ ENERGY＝手札1枚をエナチャージする（エナが無いとグロウも召喚もできず「ルリグアタックだけの
  //    レース」になって通し対戦の意味が薄れる）。カードアクションは手札カードを開いてから出る。
  if (st.turnPhase === 'ENERGY' && !st.me.actionsDone.includes('ENERGY')) {
    for (let hi = 0; hi < Math.min(st.me.hand, 4); hi++) {
      if (!(await S.clickTestId(`my-hand-card-${hi}`))) continue;
      // ⚠**カード詳細の描画を待つ**＝即座に探すと未描画で空振りし、そのままフェイズを素通りする
      //   （エナチャージを取りこぼすとグロウも召喚もできず「ルリグアタックだけのレース」になる）。
      const ec = page.locator('[data-testid^="card-action-"][data-action-label="エナチャージ"]').first();
      for (let k = 0; k < 10; k++) {
        if (await ec.count() && await ec.isVisible().catch(() => false) && await ec.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(150);
      }
      if (await ec.count() && await ec.isVisible().catch(() => false) && await ec.isEnabled().catch(() => false)) {
        try { await ec.click({ timeout: 2000 }); return `energy:hand${hi}`; } catch { /* 次へ */ }
      }
      await page.keyboard.press('Escape').catch(() => {});
      break; // このフェイズで既にチャージ済み（アクションが出ない）＝進行へ落とす
    }
  }

  // ⑤ MAIN＝空きゾーンがあれば手札からシグニを召喚する（盤面を育てないと通し対戦にならない）。
  if (st.turnPhase === 'MAIN') {
    const emptyZone = st.me.signi.findIndex(z => !z);
    if (emptyZone >= 0) {
      for (let hi = 0; hi < Math.min(st.me.hand, 8); hi++) {
        if (!(await S.clickTestId(`my-hand-card-${hi}`))) continue;
        const summon = await S.clickBtn('召喚');
        if (!summon) { await page.keyboard.press('Escape').catch(() => {}); continue; }
        // ゾーン選択が出る場合と、空きが1つで自動配置される場合がある。
        await page.waitForTimeout(300);
        const zone = await S.clickTestId(`summon-zone-${emptyZone}`, 'summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        return `summon:hand${hi}${zone ? '/' + zone : ''}`;
      }
    }
  }

  // ⑥ グロウ（レベルが上がらないとリミットが増えず盤面が育たない）。
  //   `GrowModal` は2段＝Phase1「グロウ先を選択」（候補ボタンに `Lv.` が入る）→ Phase2「グロウ実行」。
  if (st.turnPhase === 'GROW' && !st.me.actionsDone.includes('GROW')) {
    if (await S.clickBtn('グロウ', { exact: true })) {
      await page.waitForTimeout(600);
      const cand = page.locator('button').filter({ hasText: /Lv\./ }).first();
      if (await cand.count() && await cand.isVisible().catch(() => false) && await cand.isEnabled().catch(() => false)) {
        try {
          await cand.click({ timeout: 1500 });
          await page.waitForTimeout(500);
          const exec = await S.clickBtn('グロウ実行');
          if (exec) return 'grow:実行';
          // コストが払えず実行できない＝モーダルを畳んで進行へ落とす。
          await S.clickAny(['キャンセル（グロウしない）']);
          return 'grow:候補どまり';
        } catch { /* 続行 */ }
      }
      await S.clickAny(['キャンセル（グロウしない）']);
      await page.keyboard.press('Escape').catch(() => {});
    }
  }

  // ⑦ フェイズ進行＝**いまのフェイズのラベル**を先に狙い、無ければ総当たり。
  //   ⚠**先に残りモーダルを畳む**（覆われているとクリックが interception で落ちて「押したのに進まない」）。
  const exact = PHASE_BTN[st.turnPhase];
  const adv = (exact && await S.clickBtn(exact)) || await S.clickAny(PHASE_BTNS);
  if (adv) return adv;
  if (await S.closeCardModal()) {
    const retry = (exact && await S.clickBtn(exact)) || await S.clickAny(PHASE_BTNS);
    if (retry) return retry + '(モーダルを畳んでから)';
    return 'close:card-modal';
  }
  return null;
}

/**
 * 決着（`global_phase==='FINISHED'` ＋ `winner_id`）まで両席を交互に叩く。
 * seats＝[自席]（CPU戦）または [host, guest]（PvP）。
 */
async function playToFinish(seats, tag) {
  const t0 = Date.now();
  let steps = 0, lastLog = '', lastFp = '', lastFpAt = Date.now(), lastBeat = Date.now();
  const noChange = new Map();   // 手 → 「指紋が変わらないまま押した回数」
  const blocked = new Set();    // この盤面では効かないと分かった手
  const query = makeQuery(seats[0].page);
  while (true) {
    const elapsed = (Date.now() - t0) / 1000;
    if (elapsed > MATCH_TIMEOUT_SEC) {
      const st = await query().catch(() => null);
      return { pass: false, detail: `制限時間 ${MATCH_TIMEOUT_SEC}s を超過（${steps}手・${describe(st)}）`, st };
    }
    const st = await query().catch(e => ({ error: e.message }));
    if (st?.error) {
      await sleep(1000);
      if (Date.now() - lastFpAt > STUCK_SEC * 1000) return { pass: false, detail: `状態を読めない: ${st.error}`, st };
      continue;
    }

    if (st.globalPhase === 'FINISHED') {
      if (!st.winnerId) return { pass: false, detail: `FINISHED だが winner_id が無い（${describe(st)}）`, st };
      return {
        pass: true,
        detail: `決着＝${st.turnCount}ターン / ${steps}手 / ${Math.round(elapsed)}s・勝者=${st.winnerId === st.uid ? seats[0].name : '相手'}` +
          `（自ライフ${st.me.life} 相手ライフ${st.opp.life} 自デッキ${st.me.deck} 相手デッキ${st.opp.deck}）`,
        st,
      };
    }

    // 🔴🔑**「クリックできた」を進捗と数えない**＝盤面が1ビットも動かないクリックが実在する
    //   （アタック済みルリグのカード詳細に「アタック」が残る等）。それを進捗と数えると
    //   **手詰まり検出をすり抜けて制限時間まで空回りする**（初回実行はこれで 1,351手 空転した）。
    //   ⇒ 進捗は**盤面の指紋が変わったか**で測り、変わらない手は3回で封印する。
    const fp = fingerprint(st);
    if (fp !== lastFp) { lastFp = fp; lastFpAt = Date.now(); noChange.clear(); blocked.clear(); }
    const idleSec = (Date.now() - lastFpAt) / 1000;

    let did = null;
    for (const S of seats) {
      did = await playOneStep(S, await seatState(S, st, seats), blocked);
      if (did) { S.log(`${st.turnPhase}/T${st.turnCount} -> ${did}`); break; }
    }
    steps++;
    if (did) {
      const n = (noChange.get(did) ?? 0) + 1;
      noChange.set(did, n);
      // 3回押しても指紋が変わらない手は、この盤面では効かない＝封印して次の手を探させる。
      if (n >= 3) { blocked.add(did); seats[0].log(`（${did} は効かないので封印）`); }
      await sleep(450);
    } else {
      await sleep(700);
    }
    if (idleSec > STUCK_SEC) {
      for (const S of seats) {
        await S.page.screenshot({ path: `${SHOT}/${tag}-stuck-${S.name}.png`, fullPage: true }).catch(() => {});
        S.log('画面:', (await S.body()).replace(/\n/g, ' | ').slice(0, 400));
      }
      return { pass: false, detail: `手詰まり＝${Math.round(idleSec)}s 盤面が動かない（封印済み=${JSON.stringify([...blocked])}・${describe(st)}）`, st };
    }
    // ⚠**無音の停滞をログに出す**＝クリックできた時しか行を出さないと、
    //   「相手ターン待ち」と「本当に止まっている」が外から区別できない。
    if (Date.now() - lastBeat > 30000) {
      lastBeat = Date.now();
      seats[0].log(`… ${Math.round((Date.now() - t0) / 1000)}s / ${steps}手 / 無変化${Math.round(idleSec)}s ${describe(st)}`);
    }
    const l = (st.logTail ?? []).at(-1) ?? '';
    if (l && l !== lastLog) { lastLog = l; }
  }
}

/** 席ごとに「自分から見た myTurn」を作り直す（query は seats[0] の視点で読んでいるため）。 */
async function seatState(S, st, seats) {
  if (seats.length === 1 || S === seats[0]) return st;
  // PvP の2席目＝ホスト視点の状態を反転させる。
  return { ...st, myTurn: !st.myTurn, me: st.opp, opp: st.me };
}

/**
 * 盤面の指紋＝**「何かが起きた」を機械で判定する唯一の軸**。
 * ⚠ログ末尾も混ぜる（クラッシュ・バニッシュのように枚数が戻る動きを取りこぼさないため）。
 */
function fingerprint(st) {
  if (!st) return 'null';
  return JSON.stringify([
    st.turnCount, st.turnPhase, st.myTurn, st.pendingEffect, st.pendingSpell,
    st.me?.life, st.me?.deck, st.me?.hand, st.me?.energy, st.me?.lrig, st.me?.signi, st.me?.actionsDone,
    st.me?.lrigHasAttacked, st.me?.attackedSigni, st.me?.lrigDown, st.me?.signiDown,
    st.opp?.life, st.opp?.deck, st.opp?.hand, st.opp?.energy, st.opp?.lrig, st.opp?.signi,
    (st.logTail ?? []).at(-1) ?? '',
  ]);
}

function describe(st) {
  if (!st) return '状態不明';
  return `phase=${st.globalPhase}/${st.turnPhase} turn=${st.turnCount} myTurn=${st.myTurn} ` +
    `pending=${st.pendingEffect ?? '-'} lrigAtk=${st.me?.lrigHasAttacked}/${st.opp?.lrigHasAttacked} ` +
    `lrigDown=${st.me?.lrigDown}/${st.opp?.lrigDown} signi=${JSON.stringify(st.me?.signi)} ` +
    `check=${st.me?.check ?? '-'}/${st.opp?.check ?? '-'} ` +
    `crashed=${st.me?.pendingCrashed}/${st.opp?.pendingCrashed} ` +
    `life=${st.me?.life}/${st.opp?.life} deck=${st.me?.deck}/${st.opp?.deck} ` +
    `log=${JSON.stringify((st.logTail ?? []).slice(-3))}`;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

/** セットアップ（じゃんけん→ルリグ選択→マリガン）を PLAYING 到達まで進める。 */
async function driveSetup(seats, tag) {
  const hands = ['グー', 'チョキ', 'パー'];
  let idx = 0;
  for (let i = 0; i < 80; i++) {
    let progressed = false;
    for (const S of seats) {
      const txt = await S.body();
      if (/出す手を選んで/.test(txt)) {
        const h = hands[idx++ % 3];
        if (await S.clickBtn(h)) { S.log('じゃんけん:' + h); progressed = true; }
        await S.page.waitForTimeout(1200);
      } else if (/ルリグを配置|ルリグを選/.test(txt)) {
        const b = S.page.locator('button', { hasText: 'WD03-005' }).first();
        if (await b.count()) { await b.click().catch(() => {}); S.log('ルリグ選択'); progressed = true; }
        else {
          const b2 = S.page.locator('button', { hasText: 'コード・ピルルク' }).first();
          if (await b2.count()) { await b2.click().catch(() => {}); S.log('ルリグ選択(名前)'); progressed = true; }
        }
      } else {
        const c = await S.clickAny(['この手札でOK', '引き直さない', 'キープ', 'この手札で', 'ゲーム開始', '開始', '決定', 'OK', '完了']);
        if (c) { S.log('セットアップ:' + c); progressed = true; }
      }
    }
    const st = await makeQuery(seats[0].page)().catch(() => null);
    if (st && !st.error && st.globalPhase === 'PLAYING') { console.log(`   PLAYING 到達（${i}周目）`); return true; }
    if (!progressed) await sleep(1200);
  }
  for (const S of seats) await S.page.screenshot({ path: `${SHOT}/${tag}-setup-fail-${S.name}.png`, fullPage: true }).catch(() => {});
  return false;
}

// ── CPU 通し対戦 ──────────────────────────────────────────────────────────────
async function runCpuMatch(browser, url) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errs.push('pageerror: ' + String(e.message).slice(0, 200)));
  try {
    await login(page, url, accounts[0]);
    console.log('   残ルーム掃除:', await cleanupRooms(page), '件');
    const S = makeSeat(page, 'claude1');
    await page.evaluate(() => sessionStorage.setItem('gotoMatchmaking', '1'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    await page.getByText('使用デッキを選択', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
    await page.getByText('VERIFY_DECK', { exact: false }).first().click();
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '次へ' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'CPU対戦' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '対戦開始' }).click();
    await page.waitForTimeout(3500);
    if (!(await driveSetup([S], 'cpu'))) return { pass: false, detail: 'セットアップが PLAYING へ到達しなかった', errs };
    const r = await playToFinish([S], 'cpu');
    await page.screenshot({ path: `${SHOT}/cpu-final.png`, fullPage: true }).catch(() => {});
    return { ...r, errs };
  } finally { await ctx.close().catch(() => {}); }
}

// ── PvP 通し対戦（claude1 がルーム作成 → claude2 がパスコードで参加）────────────────────
async function runPvpMatch(browser, url) {
  const ctxH = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const ctxG = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageH = await ctxH.newPage(), pageG = await ctxG.newPage();
  const errs = [];
  for (const [p, who] of [[pageH, 'host'], [pageG, 'guest']]) {
    p.on('console', m => { if (m.type() === 'error') errs.push(`${who}: ` + m.text().slice(0, 200)); });
    p.on('pageerror', e => errs.push(`${who} pageerror: ` + String(e.message).slice(0, 200)));
  }
  try {
    await login(pageH, url, accounts[0]);
    await login(pageG, url, accounts[1]);
    console.log('   残ルーム掃除: host', await cleanupRooms(pageH), '件 / guest', await cleanupRooms(pageG), '件');
    const H = makeSeat(pageH, 'claude1'), G = makeSeat(pageG, 'claude2');

    const toModeSelect = async (page) => {
      await page.evaluate(() => sessionStorage.setItem('gotoMatchmaking', '1'));
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(2500);
      await page.getByText('使用デッキを選択', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
      await page.getByText('VERIFY_DECK', { exact: false }).first().click();
      await page.waitForTimeout(400);
      await page.getByRole('button', { name: '次へ' }).click();
      await page.waitForTimeout(600);
    };
    await toModeSelect(pageH);
    await pageH.getByRole('button', { name: 'ルームを作成する' }).click();
    await pageH.getByText('対戦相手を待っています', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
    // パスコードは 4桁の数字だけを持つ要素として出る。
    const passcode = await pageH.evaluate(() => {
      const el = [...document.querySelectorAll('div')].find(d => /^\d{4}$/.test(d.textContent?.trim() ?? ''));
      return el?.textContent?.trim() ?? null;
    });
    if (!passcode) return { pass: false, detail: 'パスコードを読めなかった', errs };
    console.log('   パスコード:', passcode);

    await toModeSelect(pageG);
    await pageG.getByPlaceholder('パスコード（4桁）').fill(passcode);
    await pageG.getByRole('button', { name: 'ルームに参加' }).click();
    await pageG.waitForTimeout(1500);
    await pageH.getByRole('button', { name: 'ゲーム開始' }).click({ timeout: 20000 });
    await pageH.waitForTimeout(3500);

    if (!(await driveSetup([H, G], 'pvp'))) return { pass: false, detail: 'セットアップが PLAYING へ到達しなかった', errs };
    const r = await playToFinish([H, G], 'pvp');
    await pageH.screenshot({ path: `${SHOT}/pvp-final-host.png`, fullPage: true }).catch(() => {});
    await pageG.screenshot({ path: `${SHOT}/pvp-final-guest.png`, fullPage: true }).catch(() => {});
    return { ...r, errs };
  } finally { await ctxH.close().catch(() => {}); await ctxG.close().catch(() => {}); }
}

// ── main ──────────────────────────────────────────────────────────────────────
let proc = null, code = 0;
const results = [];
try {
  await buildFirst();
  const started = await startPreview();
  proc = started.proc;
  console.log('preview:', started.url);
  const browser = await chromium.launch({ headless: process.env.HEADED !== '1' });
  try {
    for (const mode of MODES) {
      console.log(`\n===== ${mode.toUpperCase()} 通し対戦 =====`);
      const t0 = Date.now();
      const r = mode === 'cpu' ? await runCpuMatch(browser, started.url)
        : mode === 'pvp' ? await runPvpMatch(browser, started.url)
          : { pass: false, detail: `未知のモード: ${mode}`, errs: [] };
      results.push({ mode, ...r, sec: Math.round((Date.now() - t0) / 1000) });
      console.log(`--- ${mode}: ${r.pass ? 'PASS' : 'FAIL'} : ${r.detail}`);
      if (r.errs?.length) console.log(`    console errors(${r.errs.length}): ${r.errs.slice(0, 5).join(' / ')}`);
    }
  } finally { await browser.close().catch(() => {}); }
} catch (e) {
  console.error('失敗:', e.message);
  code = 2;
} finally { killTree(proc); }

console.log('\n========== 結果サマリ ==========');
for (const r of results) console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'}  ${r.mode} (${r.sec}s) — ${r.detail}`);
const allPass = results.length === MODES.length && results.every(r => r.pass);
console.log(allPass ? '\n🎉 ALL PASS（リリースゲート＝通し対戦スモーク）' : '\n⚠️ 一部 FAIL');
process.exit(code || (allPass ? 0 : 1));
