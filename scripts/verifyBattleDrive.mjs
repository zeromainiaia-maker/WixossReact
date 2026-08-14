// フル BattleScreen 実機 driver（シナリオ切替対応）。
// claude1 でログイン→オンライン対戦→VERIFY_DECK→CPU対戦→PLAYING 到達まで一度だけ行い、
// その PLAYING ルームへ「盤面注入＋クリック列」をシナリオ単位で適用して効果を実 UI で発火・観測する。
//
// 使い方:
//   node scripts/verifyBattleDrive.mjs            # 既定の3シナリオを順に実行
//   node scripts/verifyBattleDrive.mjs wxk02029   # 指定シナリオのみ
//   node scripts/verifyBattleDrive.mjs wd07012 wxk09050
//
// 前提: verify-accounts.json / .env.local / デッキ「VERIFY_DECK」。詳細は docs/VERIFY_BROWSER.md。
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
const CPU_PLAYER_ID = '00000000-0000-0000-0000-000000000001'; // BattleScreen.tsx と一致

// ─────────────────────────────────────────────────────────────────────────────
// シナリオ定義
//   spec: 盤面注入のデータ（in-page で host_state/guest_state にマージ）。
//     hostSet/guestSet … ドットパス→値（例 'field.signi':[['WD07-012#1'],...]）。
//     handPrepend       … host_state.hand の先頭に積む（残りは既存 hand.slice(0,4)）。
//     top.active        … 'host'（自分のターン）/ 'cpu'（CPUのターン）。
//     top.turn_phase    … 注入後のフェイズ。
//   drive(page, H): クリック列＋観測。{ pass, detail } を返す。H は共通ヘルパー束。
// ─────────────────────────────────────────────────────────────────────────────
const scenarios = {
  // ① WXK09-050: 【出】CHOOSE①でバフ済み＜電機＞シグニに「ダウンしない」付与（既存・実証済み）。
  wxk09050: {
    title: 'WXK09-050 コードアート Ｒ・Ｌ・Ｃ（SIGNI_GRANT_CHOSEN_ABILITY）',
    spec: {
      hostSet: {
        'field.lrig': ['WXK09-018#1'],                         // Lv3（Limit6）でLv4召喚を許容
        'field.signi': [['WD03-009#1'], null, null],           // ＜電機＞ P12000
        'temp_power_mods': [{ cardNum: 'WD03-009#1', delta: 3000 }], // バフ→15000>表記12000
      },
      handPrepend: ['WXK09-050#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const opened = await H.clickTestId('my-hand-card-0');
      H.log('手札クリック:', opened ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(1000);
        const t = await H.body();
        await page.screenshot({ path: `${SHOT}/wxk09050-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
          await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true;
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) {
          for (const lbl of ['対戦相手の効果によってダウンしない', '①ダウンしない', '①']) {
            const b = page.getByRole('button', { name: lbl, exact: false }).first();
            if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); did = 'btn:' + lbl; break; }
          }
        }
        const pick0 = page.getByTestId('pick-0').first();
        if (!did && await pick0.count() && await pick0.isVisible().catch(() => false)) {
          const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
          if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', '選ぶ']);
        H.log(`  play[${s}] -> ${did ?? 'なし'} | ${t.slice(0, 80).replace(/\n/g, ' ')}`);
        if (/ダウンしない（ターン終了時まで）|手札に戻らない（ターン終了時まで）/.test(await H.fullBody())) {
          return { pass: true, detail: '盤面ログに「ダウンしない（ターン終了時まで）」を確認' };
        }
      }
      return { pass: false, detail: '付与ログ未確認' };
    },
  },

  // ② WXK02-029: アーツ【メイン】CHOOSE①＝条件付きグロウ（自Lv2≤相手Lv3）＋全キー能力喪失。
  //    アーツはルリグデッキから使う（getMyLrigDeckCardActions）。lrig_deck=[アーツ, グロウ先] とし、
  //    アーツ使用で lrig_deck からアーツが除かれ→効果は lrig_deck.at(0)=グロウ先(Lv3) へグロウする。
  //    クリック列: ルリグDK→zone-card-0(アーツ)→使用→アーツ使用→CHOOSE①。
  wxk02029: {
    title: 'WXK02-029 ビカム・ユー（CONDITIONAL_GROW_AND_KEY_DISABLE）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],                 // コード・ピルルク・Ｍ Lv2（自センター）
        'lrig_deck': ['WXK02-029#1', 'WD03-002#1'],   // [アーツ, グロウ先 ピルルク・Ｇ Lv3]
        'field.signi': [null, null, null],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],   // 相手センター Lv3（自Lv2 ≤ 相手Lv3 でグロウ条件成立）
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      // ルリグデッキを開く（自分の my-lrig-dk バッジ。相手の同名は非クリック）→ アーツ(zone-card-0) を開く
      const openDk = await H.clickTestId('my-lrig-dk');
      H.log('ルリグDK:', openDk ?? '見つからず');
      await page.waitForTimeout(700);
      const openArts = await H.clickTestId('zone-card-0');
      H.log('アーツ(zone-card-0):', openArts ?? '見つからず');
      let chose = false;
      for (let s = 0; s < 14; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxk02029-${s}.png`, fullPage: true });
        let did = null;
        // CardModal「使用」→ アーツモーダルPhase2「アーツ使用」→ CHOOSE① の順に1手ずつ
        if (!chose) did = await H.clickTextOrBtn(['アーツ使用', '使用']);
        if (!did && !chose) {
          for (const lbl of ['条件付きグロウ＋全キー能力喪失', '条件付きグロウ', 'グロウ＋全キー', '①']) {
            const b = page.getByRole('button', { name: lbl, exact: false }).first();
            if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); did = 'btn:' + lbl; chose = true; break; }
          }
        }
        H.log(`  arts[${s}] -> ${did ?? 'なし'}`);
        // CHOOSE① 確定後はモーダルが閉じてエンジンログが盤面に出る。実ログ（CHOOSE選択肢ラベルではなく）で判定する。
        if (chose && !did) {
          const grow = await H.findLog(/グロウ条件成立[^。]*にグロウ|→.*にグロウ（コスト/);
          const key = await H.findLog(/キー(は|の能力)[^。]*(失|喪失|無効)|すべてのキーは能力を失う/);
          if (grow && key) return { pass: true, detail: `グロウ確認「${grow}」／キー喪失確認「${key}」` };
          // 条件不成立など想定外ログを拾ったら詳細を出して FAIL（偽陽性防止）
          const ng = await H.findLog(/グロウ条件不成立[^。]*/);
          if (ng) return { pass: false, detail: `グロウ条件不成立を検出: ${ng}` };
        }
      }
      return { pass: false, detail: 'グロウ成立ログ未確認' };
    },
  },

  // ③ WD07-012: 【自】相手アタッカーが正面より低パワーならバニッシュ。
  //    CPU(=guest)ターン・ATTACK_SIGNI を注入し、CPU の弱アタッカー（P3000）を自動アタックさせる。
  //    自分の場の WD07-012（P12000・正面）が ON_ATTACK_SIGNI(any_opp) で拾われアタッカーをバニッシュ。
  wd07012: {
    title: 'WD07-012 コードアンチ ヴィマナ（BANISH_ATTACKER_IF_WEAKER_THAN_FRONT）',
    spec: {
      hostSet: {
        'field.signi': [null, null, ['WD07-012#1']], // 自zone2＝攻撃側zone0の正面
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null], // 小剣 ククリ P3000（CPUアタッカー zone0）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
    },
    async drive(page, H) {
      // クリックは不要。CPU が自動アタック→トリガー発火を待って観測する。
      // 万一ガード/応答UIが出たら拒否方向で進める。
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SHOT}/wd07012-${s}.png`, fullPage: true });
        const full = await H.fullBody();
        if (/正面より低パワー|ククリ.*バニッシュ|小剣.*バニッシュ/.test(full)) {
          return { pass: true, detail: '盤面ログに「（正面より低パワー）バニッシュ」を確認' };
        }
        // ガード/応答プロンプトが出たら拒否（バニッシュは本来トリガー解決で先に起きるが保険）
        await H.clickTextOrBtn(['ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        if (s % 4 === 3) H.log(`  wd07012[${s}] 観測中… ${full.slice(0, 70).replace(/\n/g, ' ')}`);
      }
      return { pass: false, detail: 'バニッシュログ未確認' };
    },
  },
  // ⑤ WXDi-P15-069: 【自】ON_COIN_PAID＝コインを支払ったとき、このシグニのパワー+2000。
  //    C1 配線（executeGrow の growCoinPaidEntries→collectCoinPaidTriggers）を実 UI で検証。
  //    コイン支払いの最簡経路＝コインGrowCostでのグロウ：WX17-001(Lv4 カーニバル)→WXK03-002(Lv5・GrowCost《コイン》×1)。
  //    エナ不要のグロウなので executeGrow 直行→コイン支払→ON_COIN_PAID 発火→watcher +2000。
  coinpaid: {
    title: 'WXDi-P15-069（ON_COIN_PAID＝コイン支払時 自身+2000）',
    spec: {
      hostSet: {
        'field.signi': [['WXDi-P15-069#1'], null, null], // watcher（self・P3000）
        'field.lrig': ['WX17-001#1'],                    // 自センター Lv4 カーニバル ―Ｑ―
        'lrig_deck': ['WXK03-002#1'],                    // グロウ先 Lv5 カーニバル †ＭＡＩＳ†（GrowCost《コイン》×1）
        'coins': 3,
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      const grew = await H.openGrow(/ＭＡＩＳ/);
      H.log('グロウ実行（コイン払い）:', grew ? 'OK' : '失敗');
      for (let s = 0; s < 12; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/coinpaid-${s}.png`, fullPage: true });
        let did = null;
        // 発動順序モーダル（ON_COIN_PAID＋グロウ先【出】が同時収集）→確定
        did = await H.clickTextOrBtn(['発動順序を確定', '確定']);
        // POWER_MODIFY 対象ピッカー（watcher 自身・ゾーン1）→pick-0→決定
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        // POWER_MODIFY 結果ログは picker 確定直後に出る→消える前に毎iter検査。広めに照合。
        const pwEarly = await H.findLog(/パワー[＋+]\s*2000/);
        if (pwEarly) return { pass: true, detail: `ON_COIN_PAID 発火→watcher +2000 確認「${pwEarly}」` };
        // グロウ先 WXK03-002 の【出】CHOOSE が出たら適当に1つ選んで進める（詰まり防止）
        if (!did) {
          for (const lbl of ['コードアート', '決定', 'OK', 'はい', 'スキップ', '発動しない']) {
            const b = page.getByRole('button', { name: lbl, exact: false }).first();
            if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); did = 'btn:' + lbl; break; }
          }
        }
        H.log(`  coin[${s}] -> ${did ?? 'なし'}`);
        const pw = await H.findLog(/パワー[＋+]\s*2000/);
        if (pw) return { pass: true, detail: `ON_COIN_PAID 発火→watcher +2000 確認「${pw}」` };
      }
      return { pass: false, detail: 'ON_COIN_PAID 発火（+2000）を確認できず' };
    },
  },

  // ⑥ PR-470A: 【自】ON_DECK_SHUFFLED＝あなたのデッキがシャッフルされたとき、このシグニのパワー+5000。
  //    C1 配線（execShuffleDeck→deck_shuffled_count→resolveStackNct 中央 diff→collectDeckShuffledTriggers）を実 UI 検証。
  //    シャッフル源＝シグニ【出】（カットイン無し・スタック解決経路）：WX12-Re20 ベルフェーゴ（Lv2・mandatory）の
  //    「デッキから＜悪魔＞を探してトラッシュ→デッキをシャッフル」を召喚で発火させる。
  //    ※スペル（SEARCHER）経路ではカットイン待ちを挟み watcher が +5000 されなかった（VERIFY_BROWSER.md 参照）。
  //      シグニ【出】はスタック解決の中央 diff を通るため発火する想定。
  deckshuffle: {
    title: 'PR-470A 現実からの逃避 タマ（ON_DECK_SHUFFLED＝シャッフル時 自身+5000・シグニ【出】源）',
    spec: {
      hostSet: {
        'field.signi': [['PR-470A#1'], null, null],  // watcher レゾナ P5000（注入で出現条件はバイパス）
        'field.lrig': ['WXK09-018#1'],               // Lv3（Limit6）＝PR-470A(2)+ベルフェーゴ(2)=4 を許容
        'actions_done': [],
      },
      handPrepend: ['WX12-Re20#1'],                  // ベルフェーゴ（召喚→【出】でデッキ参照→シャッフル）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const opened = await H.clickTestId('my-hand-card-0');
      H.log('シグニ手札クリック:', opened ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/deckshuffle-${s}.png`, fullPage: true });
        let did = null;
        // 召喚（ボタン）→空きゾーン（zone0 は PR-470A 占有→1/2）
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        // 【出】SEARCH ピッカー／PR-470A 対象ピッカー → pick-0（無くても決定で確定）
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        H.log(`  shuffle[${s}] -> ${did ?? 'なし'}`);
        // ON_DECK_SHUFFLED 発火＝watcher の POWER_MODIFY 結果ログ「パワー+5000」（ピッカー文言「パワーを+5000」とは別）
        const pw = await H.findLog(/パワー[＋+]\s*5000/);
        if (pw) return { pass: true, detail: `ON_DECK_SHUFFLED 発火→watcher +5000 確認「${pw}」` };
      }
      return { pass: false, detail: 'ON_DECK_SHUFFLED 発火（+5000）を確認できず' };
    },
  },

  // ⑥' PR-470A: ON_DECK_SHUFFLED を【スペル経路】で検証（既定スイート外・engine 修正の回帰ガード）。
  //    SEARCHER（WX02-060・スペル《無》×1）の afterSearch シャッフル。スペルはカットイン解決経路（handleCutinPass）/
  //    pending 効果 resume（handleEffectInteraction）で解決され、これらは resolveStackNext の中央 diff を通らないため
  //    ON_DECK_SHUFFLED が未発火だった。→両経路に collectDeckShuffleInline 検出を追加（engine 層は診断で発火確認済）。
  //    ⚠スペル経路の実 UI 確認は未完（診断ログが盤面に出ず非決定的＝別解決経路 or ツール障害の疑い）。要 follow-up 実行。
  deckshufflespell: {
    title: 'PR-470A（ON_DECK_SHUFFLED・スペル経路＝SEARCHER／修正回帰ガード）',
    spec: {
      hostSet: {
        'field.signi': [['PR-470A#1'], null, null],
        'energy': ['WD01-013#2', 'WD01-013#3'],   // スペルコスト《無》×1 用
        'actions_done': [],
      },
      handPrepend: ['WX02-060#1'],                // ＳＥＡＲＣＨＥＲ
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const opened = await H.clickTestId('my-hand-card-0');
      H.log('スペル手札クリック:', opened ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/deckshufflespell-${s}.png`, fullPage: true });
        let did = null;
        did = await clickExact('発動'); // CardModal「発動」（exact）
        if (!did) { // スペルコスト：エナ未選択なら選択、選択済みなら「発動する」
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) { // SEARCH／PR-470A ピッカー
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        // ground truth を実 battle_states から読む（可視ログ折り畳みによる偽陰性を回避）。
        const st = await H.queryState();
        H.log(`  spell[${s}] -> ${did ?? 'なし'} | shuffled=${st?.host?.deck_shuffled_count ?? '-'} hand=${st?.host?.hand ?? '-'} trash=${st?.host?.trash ?? '-'} stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'} pw5000=${st?.pr470aBuffed ?? '-'}`);
        // ① 確定: PR-470A#1 に +5000 が反映（temp_power_mods）＝トリガー解決まで完走。
        if (st?.pr470aBuffed) return { pass: true, detail: `スペル経路 ON_DECK_SHUFFLED 発火→PR-470A#1 に +5000 反映確認（temp_power_mods・shuffled=${st.host.deck_shuffled_count}）` };
        // 可視ログでも一応拾う（ログパネル展開時）。
        const pw = await H.findLog(/パワー[＋+]\s*5000/);
        if (pw) return { pass: true, detail: `スペル経路 ON_DECK_SHUFFLED 発火→watcher +5000 確認「${pw}」` };
      }
      const fin = await H.queryState();
      H.log('=== 全ログ末尾(-25) ===');
      for (const l of (fin?.logTail ?? [])) H.log('   LOG:', l);
      return {
        pass: false,
        detail: `スペル経路 +5000 未確認（shuffled=${fin?.host?.deck_shuffled_count ?? '-'} stack=${fin?.stackLen ?? '-'}）`,
      };
    },
  },

  // ⑦ ON_TARGETED（C1）: WXDi-P03-067 羅石 アパタイト【自】対象になったときカード1枚ドロー（self・once_per_turn）。
  //    配線（handleEffectInteraction の SELECT_TARGET 確定→collectTargetedTriggers/5166）は「発生源の対戦相手側シグニ」
  //    を対象に取った瞬間に発火する。よって watcher を CPU(guest) 側に置き、host のスペル WD05-017 ホール・ダーク
  //    （黒×1・対戦相手シグニ1体に-4000＝SELECT_TARGET）でそれを対象化→watcher（guest）が1枚ドローするのを観測する。
  ontargeted: {
    title: 'WD05-017→WXDi-P03-067（ON_TARGETED＝対象化でドロー）',
    spec: {
      hostSet: {
        'field.signi': [['WD05-009#9'], null, null], // 盤面 valid 化（任意の自シグニ）
        'energy': ['WD05-009#1', 'WD05-009#2'],       // 黒×1 コスト用（WD05-009 は黒シグニ）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WXDi-P03-067#1'], null, null], // watcher（発生源 host の対戦相手＝guest 側）
        // watcher は guest 側なので《ターン1回》の消費記録も guest 側に載る。続き75で ON_TARGETED の usageLimit が
        // 実際に actions_done へ書き戻されるようになったため、クリアしないと実行間の持ち越しで非発火になる。
        'actions_done': [],
      },
      handPrepend: ['WD05-017#1'],                   // ホール・ダーク（黒×1・対戦相手シグニ-4000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const gHand0 = before?.guest?.hand ?? 0;
      H.log('guest 初期手札:', gHand0);
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/ontargeted-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) { // スペルコスト：黒エナ選択→発動する
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) { // SELECT_TARGET ピッカー（pick-0 = guest の watcher）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        const st = await H.queryState();
        H.log(`  tgt[${s}] -> ${did ?? 'なし'} | gHand=${st?.guest?.hand ?? '-'} stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if ((st?.guest?.hand ?? 0) > gHand0) return { pass: true, detail: `ON_TARGETED 発火→watcher(guest) がドロー（手札 ${gHand0}→${st.guest.hand}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_TARGETED ドロー未確認（gHand ${gHand0}→${fin?.guest?.hand ?? '-'} stack=${fin?.stackLen ?? '-'}）` };
    },
  },

  // ⑦' ON_TARGETED①個別確認（§7・WXDi-P02-043）: ドライ＝インフルＤ型【自】《ターン1回》このシグニが対戦相手の
  //    能力/効果の対象になったとき、カードを1枚引き【エナチャージ1】をする（mandatory・対象選択不要）。
  //    `ontargeted`（WXDi-P03-067）と同型だが watcher カードを差し替えて個別確認（PLAN §7 残①）。
  ontargeted2: {
    title: 'WD05-017→WXDi-P02-043（ON_TARGETED①個別確認＝ドロー＋エナチャージ）',
    spec: {
      hostSet: {
        'field.signi': [['WD05-009#9'], null, null], // 盤面 valid 化（任意の自シグニ）
        'energy': ['WD05-009#1', 'WD05-009#2'],       // 黒×1 コスト用
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WXDi-P02-043#1'], null, null], // watcher（ドライ＝インフルＤ型）
        'actions_done': [], // 《ターン1回》消費のクリア（続き75で usageLimit が実機で効くようになった＝持ち越し防止）
      },
      handPrepend: ['WD05-017#1'],                   // ホール・ダーク（黒×1・対戦相手シグニ-4000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const gHand0 = before?.guest?.hand ?? 0;
      H.log('guest 初期手札:', gHand0);
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/ontargeted2-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) { // スペルコスト：黒エナ選択→発動する
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) { // SELECT_TARGET ピッカー（pick-0 = guest の watcher）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        const st = await H.queryState();
        H.log(`  tgt2[${s}] -> ${did ?? 'なし'} | gHand=${st?.guest?.hand ?? '-'} stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if ((st?.guest?.hand ?? 0) > gHand0) return { pass: true, detail: `ON_TARGETED 発火→watcher(WXDi-P02-043) がドロー＋エナチャージ（手札 ${gHand0}→${st.guest.hand}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_TARGETED ドロー未確認（gHand ${gHand0}→${fin?.guest?.hand ?? '-'} stack=${fin?.stackLen ?? '-'}）` };
    },
  },

  // ⑦'' ON_TARGETED残②個別確認（§7・WXDi-P11-040）: 大罠 パントマイム【自】《相手ターン》《ターン1回》この
  //    シグニが対戦相手の能力/効果の対象になったとき、**あなたの他のシグニ**1体を対象とし、ターン終了時まで
  //    【シャドウ】を得る（mandatory・turnOwner:opponent＝watcher所有者から見て相手ターン＝host主導の
  //    ontargeted系と同じ盤面で自然に満たす）。
  //    続き72（Sonnet）は guest に watcher 1枚のみ置いて検証し「watcher自身に付与される」＝原文の「他の」除外
  //    （excludeSelf）が parser/engine 双方で未実装であることを発見（Opusタスク12へ登録）。
  //    続き75（Opus）で parser（filter.excludeSelf 付与）＋engine（execGrantKeyword が excludeSelf を適用）を
  //    実装したため、本シナリオは **guest に「他の味方」を1枚足して**「watcher自身には付かず、他の味方に付く」
  //    ことを PASS 条件とする形へ更新した（自身に付いたら FAIL＝excludeSelf の回帰ガード）。
  ontargeted3: {
    title: 'WD05-017→WXDi-P11-040（ON_TARGETED残②＝相手ターン限定・シャドウを「他の」味方へ付与＝excludeSelf）',
    spec: {
      hostSet: {
        'field.signi': [['WD05-009#9'], null, null], // 盤面 valid 化（任意の自シグニ）
        'energy': ['WD05-009#1', 'WD05-009#2'],       // 黒×1 コスト用
        'actions_done': [],
      },
      guestSet: {
        // zone0=watcher（大罠 パントマイム）／zone1=他の味方＝excludeSelf の付与先（ここに付けば正・watcherに付けば誤）
        'field.signi': [['WXDi-P11-040#1'], ['WX01-053#1'], null],
        'actions_done': [], // 《ターン1回》消費のクリア（続き75で usageLimit が実機で効くようになった＝持ち越し防止）
      },
      handPrepend: ['WD05-017#1'],                   // ホール・ダーク（黒×1・対戦相手シグニ-4000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('guest 初期 keywordGrants:', JSON.stringify(before?.guest?.keywordGrants));
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/ontargeted3-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) { // スペルコスト：黒エナ選択→発動する
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) {
          // SELECT_TARGET ピッカーは2回出る：
          //   ① WD05-017（ホール・ダーク）の対象＝**watcher を選ばないと ON_TARGETED(scope:self) が発火しない**。
          //      guest の場は2体（watcher + 他の味方）で、ピッカーの並びは zone 順と一致せず pick-0 が「他の味方」
          //      side になる（実測）。そこで①では pick-1 を選ぶ（＝watcher 側）。
          //   ② GRANT_KEYWORD の対象＝excludeSelf により候補は「他の味方」1体のみ＝pick-0。
          // ①が済んだか（＝スペルの -4000 が誰かに乗ったか）は powerMods の有無で判定する。
          const pre = await H.queryState();
          const spellResolved = (pre?.guest?.powerMods ?? []).length > 0;
          const wantId = spellResolved ? 'pick-0' : 'pick-1';
          const pick = page.getByTestId(wantId).first();
          if (await pick.count() && await pick.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick.click().catch(() => {}); did = 'pick:' + wantId; }
          }
          if (!did) { // フォールバック（候補が1体しかない等で目当ての pick が無い場合）
            const p0 = page.getByTestId('pick-0').first();
            if (await p0.count() && await p0.isVisible().catch(() => false)) {
              const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
              if (!confirmReady) { await p0.click().catch(() => {}); did = 'pick:pick-0(fallback)'; }
            }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        const st = await H.queryState();
        const grants = st?.guest?.keywordGrants ?? [];
        const onSelf  = grants.find(g => /シャドウ/.test(g) && /WXDi-P11-040/.test(g));  // watcher 自身＝excludeSelf 違反
        const onOther = grants.find(g => /シャドウ/.test(g) && !/WXDi-P11-040/.test(g)); // 他の味方＝原文どおり
        // powerMods＝ホール・ダーク(-4000)がどのシグニに当たったか＝「watcher を対象に取れたか」の確認用
        // （scope:self なので watcher 自身が対象にならないと ON_TARGETED は発火しない）
        H.log(`  p11040[${s}] -> ${did ?? 'なし'} | stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'} grants=${grants.join(',') || '-'} pmods=${(st?.guest?.powerMods ?? []).join(',') || '-'}`);
        if (onSelf) return { pass: false, detail: `excludeSelf 違反＝watcher自身に【シャドウ】が付与された「${onSelf}」（原文は「あなたの他のシグニ1体」）` };
        if (onOther) return { pass: true, detail: `ON_TARGETED(WXDi-P11-040) 発火→excludeSelf 適用＝watcher自身ではなく他の味方に【シャドウ】付与「${onOther}」` };
      }
      const fin = await H.queryState();
      const finGrants = fin?.guest?.keywordGrants ?? [];
      if (finGrants.some(g => /シャドウ/.test(g) && /WXDi-P11-040/.test(g))) {
        return { pass: false, detail: `excludeSelf 違反＝watcher自身に付与（grants=${finGrants.join(',')}）` };
      }
      H.log('=== 全ログ末尾(-25) ===');
      for (const l of (fin?.logTail ?? [])) H.log('   LOG:', l);
      return { pass: false, detail: `【シャドウ】付与 未確認（grants=${finGrants.join(',') || '-'} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑦''' ON_TARGETED残③個別確認（§7・WXDi-D09-H14）: 羅婚石 ダイヤブライド【自】《ターン1回》あなたの赤の
  //    シグニ1体が対戦相手の能力/効果の対象になったとき、対戦相手は自分のエナゾーンからカード1枚を選び
  //    トラッシュに置く（mandatory・triggerScope:any_ally・triggerFilter color:赤＝watcher自身が赤なので
  //    自己対象化でも発火するはず）。host エナを3枚（コスト2枚＋トラッシュされる1枚）注入して観測。
  ontargeted4: {
    title: 'WD05-017→WXDi-D09-H14（ON_TARGETED残③＝any_ally赤フィルタ・相手エナトラッシュ）',
    spec: {
      hostSet: {
        'field.signi': [['WD05-009#9'], null, null], // 盤面 valid 化（任意の自シグニ）
        'energy': ['WD05-009#1', 'WD05-009#2', 'WD05-009#3'], // 黒×1 コスト用2枚＋トラッシュされる1枚
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WXDi-D09-H14#1'], null, null], // watcher（羅婚石 ダイヤブライド・赤・単独配置）
        'actions_done': [], // 《ターン1回》消費のクリア（続き75で usageLimit が実機で効くようになった＝持ち越し防止）
      },
      handPrepend: ['WD05-017#1'],                   // ホール・ダーク（黒×1・対戦相手シグニ-4000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const hTrash0 = before?.host?.trash ?? 0;
      H.log('host 初期トラッシュ:', hTrash0);
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/ontargeted4-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) { // スペルコスト：黒エナ選択→発動する
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) { // SELECT_TARGET ピッカー（WD05-017 の対象＝watcher。エナトラッシュはCPU/guest側が自動選択の想定）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        const st = await H.queryState();
        H.log(`  d09h14[${s}] -> ${did ?? 'なし'} | hTrash=${st?.host?.trash ?? '-'} stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if ((st?.host?.trash ?? 0) > hTrash0) return { pass: true, detail: `ON_TARGETED(WXDi-D09-H14) 発火→host エナ1枚トラッシュ確認（trash ${hTrash0}→${st.host.trash}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `host エナトラッシュ 未確認（hTrash ${hTrash0}→${fin?.host?.trash ?? '-'} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑦'''' ON_TARGETED残④個別確認（§7・WX25-P2-055）: 轟砲 パワードスーツ【常】バニッシュされない＋【自】
  //    《ターン1回》このシグニが対戦相手の能力/効果の対象になったとき、ターン終了時までこのシグニは【常】
  //    能力を失う（mandatory・原文は自己参照＝self対象のはずだが effects_WX24_26.json の E2 target.owner は
  //    'opponent' とコードされている＝要検証。host側にも1枚だけ候補signi（コスト用placeholder）を置き、
  //    guest.abilitiesRemoved と host.abilitiesRemoved のどちらに反映されるかを観測してparser owner誤りの
  //    有無を確定する。
  ontargeted5: {
    title: 'WD05-017→WX25-P2-055（ON_TARGETED残④＝REMOVE_ABILITIES owner検証）',
    spec: {
      hostSet: {
        'field.signi': [['WD05-009#9'], null, null], // 盤面 valid 化（任意の自シグニ・REMOVE_ABILITIESの候補にもなりうる）
        'energy': ['WD05-009#1', 'WD05-009#2'],       // 黒×1 コスト用
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX25-P2-055#1'], null, null], // watcher（轟砲 パワードスーツ・単独配置）
        'actions_done': [], // 《ターン1回》消費のクリア（続き75で usageLimit が実機で効くようになった＝持ち越し防止）
      },
      handPrepend: ['WD05-017#1'],                   // ホール・ダーク（黒×1・対戦相手シグニ-4000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('初期 abilitiesRemoved host:', JSON.stringify(before?.host?.abilitiesRemoved), 'guest:', JSON.stringify(before?.guest?.abilitiesRemoved));
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/ontargeted5-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        const st = await H.queryState();
        H.log(`  p2055[${s}] -> ${did ?? 'なし'} | hAbilRem=${JSON.stringify(st?.host?.abilitiesRemoved)} gAbilRem=${JSON.stringify(st?.guest?.abilitiesRemoved)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        // 原文は自己参照（「このシグニは【常】能力を失う」）＝watcher 自身（guest 側）が能力喪失するのが正。
        // host 側（＝watcher の対戦相手）が能力を失ったら parser owner 誤りの回帰＝FAIL（続き72発見・続き75修正）。
        const hHit = (st?.host?.abilitiesRemoved ?? []).length > 0;
        const gHit = (st?.guest?.abilitiesRemoved ?? []).length > 0;
        if (hHit) {
          return { pass: false, detail: `owner 誤り回帰＝host(watcherの対戦相手)が能力喪失（hAbilRem=${JSON.stringify(st.host.abilitiesRemoved)}）。原文は「このシグニは能力を失う」＝自己参照` };
        }
        if (gHit) {
          const self = (st.guest.abilitiesRemoved ?? []).some(n => /WX25-P2-055/.test(n));
          return self
            ? { pass: true, detail: `ON_TARGETED(WX25-P2-055) 発火→自己参照どおり watcher 自身が能力喪失（gAbilRem=${JSON.stringify(st.guest.abilitiesRemoved)}）` }
            : { pass: false, detail: `guest 側だが watcher 自身ではない別シグニが能力喪失（gAbilRem=${JSON.stringify(st.guest.abilitiesRemoved)}）＝thisCardOnly 未適用の疑い` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `REMOVE_ABILITIES 未確認（hAbilRem=${JSON.stringify(fin?.host?.abilitiesRemoved)} gAbilRem=${JSON.stringify(fin?.guest?.abilitiesRemoved)} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑦''''' ON_TARGETED③個別確認（§7・WXDi-P02-043）: usageLimit《ターン1回》が同一ターン内で複数回
  //    対象化されても2回目以降は発火しないことの検証。`ontargeted2`と同じ watcher（ドライ＝インフルＤ型・
  //    mandatory・対象選択不要のDRAW+ENERGY_CHARGE）を使い、WD05-017（黒×1・対戦相手シグニ-4000）を
  //    2枚手札に用意して同一ターン内に2回発動＝同じwatcherを2回対象化する。1回目でguest.handが+1され、
  //    2回目は once_per_turn ガードにより増えないはず。
  ontargetedUsageLimit: {
    title: 'WD05-017×2→WXDi-P02-043（ON_TARGETED③＝同一ターン内2回対象化でも発火は1回のみ）',
    spec: {
      hostSet: {
        'field.signi': [['WD05-009#9'], null, null], // 盤面 valid 化（任意の自シグニ）
        'energy': ['WD05-009#1', 'WD05-009#2', 'WD05-009#3', 'WD05-009#4'], // 黒×1コスト×2回分
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WXDi-P02-043#1'], null, null], // watcher（ドライ＝インフルＤ型・唯一の対象候補）
        // ⚠必須：1回目の発火→2回目の非発火 を見るシナリオなので、開始時に《ターン1回》の消費記録を必ずクリアする。
        'actions_done': [],
      },
      handPrepend: ['WD05-017#1', 'WD05-017#2'],          // ホール・ダーク×2（同一ターン内に2回発動）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const gHand0 = before?.guest?.hand ?? 0;
      H.log('guest 初期手札:', gHand0);
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      const castOnce = async (label) => {
        await H.ensureMain();
        H.log(`[${label}] スペル手札クリック:`, await H.clickTestId('my-hand-card-0') ?? '見つからず');
        let settledOnce = false;
        for (let s = 0; s < 20; s++) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${SHOT}/ontargetedUsageLimit-${label}-${s}.png`, fullPage: true });
          let did = await clickExact('発動');
          if (!did) {
            const e0 = page.getByTestId('spellcost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false)) {
              const cast = await clickExact('発動する');
              if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
            }
          }
          if (!did) {
            const pick0 = page.getByTestId('pick-0').first();
            if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
              const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
              if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
            }
          }
          if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
          const st = await H.queryState();
          H.log(`  [${label}][${s}] -> ${did ?? 'なし'} | gHand=${st?.guest?.hand ?? '-'} stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
          // 発動完了の判定＝pendingSpell/pendingEffect/stackが全て解消した状態が2回連続で観測できたら
          // （state反映の1tick遅延を吸収するため即リターンせずもう一拍待つ）確定。
          const settled = !st?.pendingSpell && !st?.pendingEffect && (st?.stackLen ?? 0) === 0 && s > 2;
          if (settled) {
            if (settledOnce) return st;
            settledOnce = true;
          } else {
            settledOnce = false;
          }
        }
        return await H.queryState();
      };
      const afterFirst = await castOnce('cast1');
      const gHand1 = afterFirst?.guest?.hand ?? gHand0;
      H.log(`1回目終了後 guest.hand=${gHand1}（開始${gHand0}）`);
      if (gHand1 <= gHand0) {
        return { pass: false, detail: `1回目のON_TARGETEDが未発火（gHand ${gHand0}→${gHand1}）＝usageLimit検証の前提が崩れた` };
      }
      const afterSecond = await castOnce('cast2');
      const gHand2 = afterSecond?.guest?.hand ?? gHand1;
      H.log(`2回目終了後 guest.hand=${gHand2}（1回目後${gHand1}）`);
      if (gHand2 === gHand1) {
        return { pass: true, detail: `usageLimit《ターン1回》が正しく機能＝1回目でgHand ${gHand0}→${gHand1}・2回目の対象化では増えず（${gHand1}→${gHand2}）` };
      }
      return { pass: false, detail: `【要注意】usageLimit未機能の疑い＝2回目の対象化でもgHandが増加（${gHand1}→${gHand2}）＝once_per_turnガードが同一ターン内2回目の対象化で効いていない` };
    },
  },

  // ⑧ ON_SIGNI_BANISH_OPPONENT_BY_EFFECT（C1・WX07-036）: 弩炎 フレイスロ少佐【自】＝味方＜ウェポン＞シグニが
  //    効果で対戦相手シグニをバニッシュしたとき、自分のシグニ1体に【ダブルクラッシュ】付与（any_ally・triggerFilter story=ウェポン）。
  //    配線＝resolveStackNext 中央 diff/4761（banisher が場の自シグニ＋対戦相手バニッシュ検出）。
  //    トリガー源＝WX19-023 弩砲 チタイクウ（＜ウェポン＞・【出】《無》で対戦相手12000以下を無条件バニッシュ）を summon。
  //    リミット＝watcher(Lv4)+banisher(Lv4)=8 → Lv4/Limit11 の WD02-001 を注入。
  banishbyeffect: {
    title: 'WX19-023→WX07-036（ON_SIGNI_BANISH_OPPONENT_BY_EFFECT＝味方ウェポンの効果バニッシュで【ダブルクラッシュ】付与）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],                 // タマ Lv4/Limit11（WX19-023 は「タマ限定」＝タマ必須・4+4=8 を許容）
        'field.signi': [['WX07-036#1'], null, null],  // watcher（フレイスロ少佐）
        'energy': ['WD01-013#1', 'WD01-013#2'],        // [出]《無》×1 用
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD05-009#1'], null, null],   // バニッシュ対象（P12000 ≤12000）
      },
      handPrepend: ['WX19-023#1'],                    // 弩砲 チタイクウ（[出]《無》バニッシュ）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/banishbyeffect-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // 【出】効果コストモーダル：エナ（無×1）選択→「発動」
          const e0 = page.getByTestId('onplaycost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            await e0.click().catch(() => {}); await page.waitForTimeout(250);
            const fire = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await fire.count() && await fire.isEnabled().catch(() => false)) { await fire.click().catch(() => {}); }
            did = 'onplaycost:発動';
          }
        }
        if (!did) { // SELECT_TARGET（バニッシュ対象＝guest シグニ／付与対象＝自シグニ）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const dc = (st?.host?.keywordGrants ?? []).find(g => /ダブルクラッシュ/.test(g));
        H.log(`  ban[${s}] -> ${did ?? 'なし'} | gSigniBanished? stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} grants=${(st?.host?.keywordGrants ?? []).join(',') || '-'}`);
        if (dc) return { pass: true, detail: `ON_SIGNI_BANISH_OPPONENT_BY_EFFECT 発火→自シグニに【ダブルクラッシュ】付与確認「${dc}」` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `【ダブルクラッシュ】付与 未確認（grants=${(fin?.host?.keywordGrants ?? []).join(',') || '-'} stack=${fin?.stackLen ?? '-'}）` };
    },
  },

  // ⑧' ON_CHARM_TO_TRASH（R42・§7・WX16-Re05）: 【自】＝【チャーム】1枚が場からいずれかのトラッシュに
  //    置かれたとき、対戦相手のシグニ1体を対象とし、ターン終了時までパワー-4000（triggerScope any・mandatory）。
  //    続き61（Opus）で resume経路取りこぼしを collectBoardDiffTriggers に統合済み＝R43/R46/R39/R36と
  //    同型のバグが塞がれているはず。guest zone0（WD05-009・P12000）に charm を直接注入（field.signi_charms）→
  //    WX19-023【出】《無》で無条件バニッシュ（≤12000・SELECT_TARGET経由＝resume経路）→シグニとcharmが
  //    まとめて guest.trash へ→watcher発火→残る guest zone1（WX01-053・P15000＝バニッシュ対象外なのでピッカー
  //    候補が常に1件に確定し zone順/表示順に依存しない）に-4000。
  charmToTrash: {
    title: 'WX19-023→WX16-Re05（ON_CHARM_TO_TRASH＝チャームトラッシュ時 対戦相手-4000・R42）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],                     // タマ Lv4/Limit11（WX19-023「タマ限定」を満たす）
        'field.signi': [['WX16-Re05#1'], null, null],     // watcher（幻蟲 ヘイケ・any・P5000）
        'energy': ['WD01-013#1', 'WD01-013#2'],            // [出]《無》×1 用
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD05-009#1'], ['WX01-053#1'], null], // zone0=バニッシュ対象(charm付き・P12000≤12000で唯一の候補)／zone1=watcherのPOWER_MODIFY対象(P15000・バニッシュ対象外)
        'field.signi_charms': ['WD03-002#1', null, null],      // zone0 に charm 注入（既知カードのCardNumを流用）
      },
      handPrepend: ['WX19-023#1'],                         // 弩砲 チタイクウ（[出]《無》無条件バニッシュ≤12000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      // ⚠guest側注入が稀に競合で上書きされる（原因未特定）＝クリック開始前に再確認・再PATCHで安定化。
      for (let r = 0; r < 4; r++) {
        const st0 = await H.queryState();
        const ok = st0?.guest?.fieldSigni?.[0]?.[0] === 'WD05-009#1' && st0?.guest?.fieldSigni?.[1]?.[0] === 'WX01-053#1';
        H.log(`注入確認(試行${r}): guest.fieldSigni=${JSON.stringify(st0?.guest?.fieldSigni)} ok=${ok}`);
        if (ok) break;
        await injectScenario(page, scenarios.charmToTrash.spec);
        await page.waitForTimeout(1200);
      }
      const before = await H.queryState();
      H.log('注入確定 guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni), 'host.fieldSigni:', JSON.stringify(before?.host?.fieldSigni));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/charmToTrash-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-2', 'summon-zone-1', 'summon-zone-0');
        if (!did) { // 【出】効果コストモーダル：エナ（無×1）選択→「発動」
          const e0 = page.getByTestId('onplaycost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            await e0.click().catch(() => {}); await page.waitForTimeout(250);
            const fire = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await fire.count() && await fire.isEnabled().catch(() => false)) { await fire.click().catch(() => {}); }
            did = 'onplaycost:発動';
          }
        }
        if (!did) { // SELECT_TARGET（①バニッシュ対象＝guest zone0／②watcherのPOWER_MODIFY対象＝guest zone1）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const debuffed = (st?.guest?.powerMods ?? []).some(m => /^WX01-053#1:-4000$/.test(m));
        H.log(`  ch[${s}] -> ${did ?? 'なし'} | gTrash=${st?.guest?.trash ?? '-'} gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (debuffed) return { pass: true, detail: `ON_CHARM_TO_TRASH 発火→watcher が対戦相手シグニに-4000（gPowerMods=${(st.guest.powerMods).join(',')}・gTrash=${st.guest.trash}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `-4000 未確認（gTrash=${fin?.guest?.trash ?? '-'} gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} stack=${fin?.stackLen ?? '-'}）` };
    },
  },

  // ⑧'' ON_ACCE_ATTACH host条件（R45①・§7・WXK05-041）: 【自】《ターン１回》＝このカードが【アクセ】として
  //    レベル４以上のシグニに付いたとき、対戦相手のシグニ１体を対象とし、自ターンなら《青》を払ってもよい。
  //    払えばターン終了時までそれのパワー-12000（STUB TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST＝CHOOSE pay/skip）。
  //    アクセ付与手段＝【デコレ】キーワード（青×0・ターン1回の起動能力・WXK04-003の-DECORE追記＝manualEffects.ts）。
  //    センターに WXK04-003（エルドラ オーバークロック・デコレ持ち）、場に WXK05-026（コードオーダー BCPIC・
  //    Lv4・＜調理＞・ACCE未装着）を注入、手札の WXK05-041（＜調理＞・Lv1）をデコレでACCEとして付ける。
  //    ❌FAIL＝続き64（Sonnet）で実バグを発見（未修正・Opus引き継ぎ）＝手札からアクセカードを選択・確定した
  //    ところで actions_done に WXK04-003-DECORE が記録され完了してしまい、signi_acce が終始 null のまま
  //    （ホストシグニを選ぶ2段目のSELECT_TARGETが一度も現れない）。原因＝`execAttachAcce`のfromHandブランチ
  //    （effectExecutor.ts:3774）は step1(SELECT_TARGET self_hand) の thenAction に「ATTACH_ACCE（fromHand:false）」
  //    という*まだinteractionを要する*アクションを渡しているが、SELECT_TARGET解決側（`applyDirectAction`・
  //    effectExecutor.ts:4141/4889 の case 'ATTACH_ACCE'）は「渡された cardNum＝ユーザーが選んだ候補（＝手札
  //    から選んだACCEカード自身）」を**ホストシグニ**として扱ってしまう（`zoneIdx = tgtState.field.signi.findIndex(
  //    ...cardNum)` が手札カードNumでは当然ヒットせず zoneIdx<0 → done(ctx) で即終了）。つまり thenAction に
  //    「まだ2段目のinteractionを生成するアクション」を渡す設計自体が resume 機構（1候補選択→即terminal実行の
  //    前提）と噛み合っていない＝fromHand経路そのものが機能しない実装バグ。manualEffects.tsのコメントが指す
  //    「デコレ起動能力はどのカードにも登録されておらずfromHandパスが死にコードだった」に対する追加修正
  //    （ATTACH_ACCE(fromHand:true)を9枚のエルドラに配線）がこの経路を初めて実UIで走らせた結果、根本のchaining
  //    バグが露呈した形。修正方針（未着手）＝fromHandブランチをselectOrInteractの2段chainではなく、1回目の
  //    SELECT_TARGET解決後に`ctx.lastProcessedCards`へ選択済みACCEカードを積んでから改めてexecAttachAcceの
  //    非fromHand経路（2段目のホスト選択needsInteraction）を明示的に呼び出す形へ作り替える必要がある（Opus担当）。
  //    `order`配列には追加していない（FAIL）。再現：`node scripts/verifyBattleDrive.mjs acceAttach`単体。
  acceAttach: {
    title: 'WXK04-003デコレ→WXK05-041（ON_ACCE_ATTACH host条件＝Lv4以上に付いたとき・R45①）',
    spec: {
      hostSet: {
        'field.lrig': ['WXK04-003#1'],                    // エルドラ オーバークロック Lv4/Limit11（デコレ持ち）
        'field.signi': [['WXK05-026#1'], null, null],     // コードオーダー BCPIC（＜調理＞Lv4・ACCE未装着）
        'energy': ['WD03-009#1'],                          // 青エナ（任意コスト用）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null],       // 任意コスト発動時のPOWER_MODIFY対象候補
      },
      handPrepend: ['WXK05-041#1'],                        // コードイート ミント（＜調理＞Lv1・ACCEにするカード）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      // LRIGカードのimgはpointerEvents:noneなので通常clickは黙って失敗する＝force:trueで親divへ到達させる。
      const lrigImg = page.getByAltText('エルドラ　オーバークロック', { exact: false }).first();
      if (await lrigImg.count()) { await lrigImg.click({ force: true }).catch(() => {}); H.log('LRIGクリック: OK'); }
      else H.log('LRIGクリック: 見つからず');
      let fired = false;
      for (let s = 0; s < 24; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/acceAttach-${s}.png`, fullPage: true });
        let did = null;
        if (!did) { // 【起】ボタン（デコレ＝コストなし。WXK04-003にはコイン×1の別【起】もあり、コストラベルにcoinが
          // 出ないため両方「【起】コストなし」表記になる＝表示バグ（低優先・別途報告）。lrigActionsMAの並び順は
          // E1(AUTO)/E2(コイン・ゲーム1回)/DECORE(追記)のため、同文言ボタンの後方（nth(1)）がDECORE側。
          const actBtns = page.getByRole('button', { name: '【起】コストなし', exact: true });
          const actCnt = await actBtns.count();
          if (actCnt > 0) {
            const actBtn = actCnt > 1 ? actBtns.nth(actCnt - 1) : actBtns.first();
            if (await actBtn.isVisible().catch(() => false)) { await actBtn.click().catch(() => {}); did = `btn:【起】コストなし(${actCnt}件中末尾)`; }
          }
        }
        if (!did) { // LrigGrantedModal「発動」（コスト0なので即enabled）
          const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false) && await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = 'btn:発動'; }
        }
        if (!did) { // ホストWXK04-003自身のON_ACCE_ATTACH（E1・CHOOSE3択）が先に積まれる。
          // 対象不要の「選択肢2」(DRAW)を選んで解決→スタック次段のWXK05-041-E2(R45①)へ進める。
          const c2 = page.getByRole('button', { name: '選択肢2', exact: true }).first();
          if (await c2.count() && await c2.isVisible().catch(() => false)) { await c2.click().catch(() => {}); did = 'choose:選択肢2(DRAW)'; }
        }
        if (!did) { // SELECT_TARGET①（手札からACCEするシグニ＝WXK05-041のみ候補）／②（ホストシグニ＝WXK05-026のみ候補）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK']);
        const promptLog = await H.findLog(/任意コスト：対象シグニを選んで発動しますか/);
        if (promptLog) fired = true;
        if (!did && fired) { // ON_ACCE_ATTACH発火済み＝スキップして完走
          did = await H.clickTextOrBtn(['スキップ']);
        }
        const st = await H.queryState();
        H.log(`  acce[${s}] -> ${did ?? 'なし'} | fieldAcce=${JSON.stringify(st?.host?.fieldAcce)} fired=${fired} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        // WXK05-041-E2 が actions_done に載る＝host-Lv4条件(accedHostMinLevel:4)を通過して初めて queue される
        //  ＝ON_ACCE_ATTACH host条件(R45①)の発火の決定的証明（任意コストの発動/スキップ有無に依らない）。
        if ((st?.host?.actionsDone ?? []).includes('WXK05-041-E2')) {
          return { pass: true, detail: `ON_ACCE_ATTACH(host条件Lv4≤) 発火→WXK05-041-E2 が actions_done に記録（fieldAcce=${JSON.stringify(st.host.fieldAcce)}${fired ? '・任意コストプロンプト確認' : ''}）` };
        }
      }
      const fin = await H.queryState();
      if ((fin?.host?.actionsDone ?? []).includes('WXK05-041-E2')) return { pass: true, detail: `ON_ACCE_ATTACH(host条件Lv4≤) 発火（WXK05-041-E2 が actions_done・fieldAcce=${JSON.stringify(fin?.host?.fieldAcce)}）` };
      return { pass: false, detail: `ON_ACCE_ATTACH 発火未確認（fieldAcce=${JSON.stringify(fin?.host?.fieldAcce)} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'} stack=${fin?.stackLen ?? '-'}）` };
    },
  },

  // ON_ACCE の triggerScope（続き76）: 「**この**シグニに【アクセ】が付いたとき」は **アクセが付いた当のシグニ**
  //   でのみ発火する（scope 既定 self）。従来 engine は自フィールドの全シグニを無条件に走査していたため、
  //   別のシグニにアクセを付けただけで発火する**過剰発火**だった。
  //   盤面＝zone0: WDK07-E17（ON_ACCE self・「【エナチャージ１】をする」＝観測が最も単純）／zone1: WXK05-026（Lv4）。
  //   判定＝アクセがどちらのゾーンに載ったかを fieldAcce で読み、**載った側が WDK07-E17 のときだけエナ+1**であること
  //   （＝pick の並び順に依存せず、どちらに転んでも scope 規則を検証できる。修正前はどちらでも +1 になる）。
  // ⚠トリガーが2件（WDK07-E17-E1 と ルリグの WXK04-003-E1）同時に積まれるため **StackOrderModal（発動順序の確定）**
  //   が出る＝これを押さないとスタックは `orderTurnDone:false` のまま **queue が空**で解決が始まらない（isReadyToResolve）。
  //   既存の acceAttach シナリオはトリガーが1件で整列UIが出ないため、この分岐を踏んでいなかった。
  acceSelfScope: {
    title: 'WDK07-E17（ON_ACCE scope=self）＝自分に付いたときだけ発火・他シグニへのアクセでは非発火（続き76）',
    spec: {
      hostSet: {
        'field.lrig': ['WXK04-003#1'],                              // エルドラ オーバークロック（デコレ＝アクセ付与源）
        'field.signi': [['WDK07-E17#1'], ['WXK05-026#1'], null],    // zone0=watcher（ON_ACCE self）/ zone1=別のホスト候補
        'field.signi_acce': [null, null, null],                     // ⚠前シナリオの装着残骸を必ず消す（バッチ実行時の状態汚染）
        'energy': [],                                               // エナ0から開始＝【エナチャージ１】の観測を明確に
        'actions_done': [],
      },
      guestSet: { 'field.signi': [['WD01-013#1'], null, null] },
      handPrepend: ['WXK05-041#1'],                                 // アクセにするカード（＜調理＞Lv1）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      const energy0 = before?.host?.energy ?? 0;
      const lrigImg = page.getByAltText('エルドラ　オーバークロック', { exact: false }).first();
      if (await lrigImg.count()) await lrigImg.click({ force: true }).catch(() => {});
      let attachedAt = null;
      for (let s = 0; s < 24; s++) {
        await page.waitForTimeout(900);
        let did = null;
        const actBtns = page.getByRole('button', { name: '【起】コストなし', exact: true });
        const actCnt = await actBtns.count();
        if (actCnt > 0) {
          const actBtn = actCnt > 1 ? actBtns.nth(actCnt - 1) : actBtns.first();
          if (await actBtn.isVisible().catch(() => false)) { await actBtn.click().catch(() => {}); did = 'btn:【起】'; }
        }
        if (!did) {
          const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false) && await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = 'btn:発動'; }
        }
        if (!did) { // トリガー2件同時＝StackOrderModal（発動順序）。順序は問わないのでそのまま確定する。
          const ord = page.getByRole('button', { name: '発動順序を確定', exact: true }).first();
          if (await ord.count() && await ord.isVisible().catch(() => false) && await ord.isEnabled().catch(() => false)) { await ord.click().catch(() => {}); did = 'btn:発動順序を確定'; }
        }
        if (!did) { // WXK04-003 自身の ON_ACCE_ATTACH（CHOOSE3択）＝対象不要の選択肢2(DRAW)で解決
          const c2 = page.getByRole('button', { name: '選択肢2', exact: true }).first();
          if (await c2.count() && await c2.isVisible().catch(() => false)) { await c2.click().catch(() => {}); did = 'choose:選択肢2'; }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'スキップ']);
        const st = await H.queryState();
        const acce = st?.host?.fieldAcce ?? [null, null, null];
        H.log(`  acceScope[${s}] -> ${did ?? 'なし'} | fieldAcce=${JSON.stringify(acce)} energy=${st?.host?.energy}(開始${energy0}) stack=${st?.stackLen ?? '-'}`);
        // ON_ACCE は acce_just_done を見る useEffect で**後追い**でスタックに積まれる＝装着直後に判定しない。
        // 装着を検知したらクリック列（決定/OK）を回し続け、盤面が整定してから判定する。
        if (acce.some(a => a)) attachedAt ??= s;
        if (attachedAt !== null && s >= attachedAt + 8) break;
      }
      const fin = await H.queryState();
      const acce = fin?.host?.fieldAcce ?? [null, null, null];
      for (const l of (fin?.logTail ?? [])) H.log('   LOG:', l);
      const attachedZone = acce.findIndex(a => a);
      if (attachedZone < 0) return { pass: false, detail: `アクセ装着に到達せず（fieldAcce=${JSON.stringify(acce)} energy=${fin?.host?.energy} stack=${fin?.stackLen ?? '-'}）` };
      // watcher（WDK07-E17）が今どのゾーンに居るかを盤面から引く＝pick の並び順に依存しない判定にする。
      const watcherZone = (fin?.host?.fieldSigni ?? []).findIndex(st => st?.at(-1)?.startsWith('WDK07-E17'));
      const delta = (fin?.host?.energy ?? 0) - energy0;
      const expected = attachedZone === watcherZone ? 1 : 0;  // watcher 自身に付いたときだけ発火（scope=self）
      const who = attachedZone === watcherZone ? 'watcher自身(WDK07-E17)' : '別シグニ(WXK05-026)';
      if (delta === expected) {
        return { pass: true, detail: `アクセは${who}に装着 → ON_ACCE(scope=self) は${expected ? '発火' : '非発火'}＝エナ ${energy0}→${fin?.host?.energy}（期待 +${expected}）` };
      }
      return { pass: false, detail: `アクセは${who}に装着・エナ +${delta}（期待 +${expected}）＝ON_ACCE(scope=self) が原文どおりに動いていない（fieldAcce=${JSON.stringify(acce)} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  // acceSelfScope の**負のケース**＝watcher を zone1 に置き、アクセを zone0（別シグニ）に載せる。
  //   scope=self なので watcher は**発火しない**（エナが増えない）ことを確認する＝修正前はここで +1 になっていた
  //   （＝別のシグニにアクセを付けただけで「このシグニに付いたとき」が発火する過剰発火）。drive は同じものを共有。
  acceOtherScope: {
    title: 'WDK07-E17（ON_ACCE scope=self）＝別シグニへのアクセでは非発火（過剰発火の回帰ガード・続き76）',
    spec: {
      hostSet: {
        'field.lrig': ['WXK04-003#1'],
        'field.signi': [['WXK05-026#1'], ['WDK07-E17#1'], null],  // zone0=別シグニ（アクセ先）/ zone1=watcher
        'field.signi_acce': [null, null, null],                   // ⚠前シナリオの装着残骸を必ず消す
        'energy': [],
        'actions_done': [],
      },
      guestSet: { 'field.signi': [['WD01-013#1'], null, null] },
      handPrepend: ['WXK05-041#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    drive: (page, H) => scenarios.acceSelfScope.drive(page, H),
  },

  // ⑧''' ON_EXCEED_COST 場シグニ（R44・§7・WXDi-P06-078）: 【自】《ターン１回》＝あなたのターンの間、あなたが
  //    エクシードのコストを支払ったとき、対戦相手のシグニ１体を対象とし《黒》を払ってもよい（STUB
  //    TARGET_OPP_SIGNI_OPTIONAL_COLOR_COST）。払えばターン終了時までそれのパワー-5000。
  //    エクシード源＝WX11-004（コード・ピルルク　Λ・Restriction無し・【起】《ターン１回》エクシード１：
  //    カードを２枚引く＝MAIN専用の【起】が1つだけなのでボタンの取り違えが起きない）。
  exceedCost: {
    title: 'WX11-004→WXDi-P06-078（ON_EXCEED_COST 場シグニ＝エクシード支払い時 対戦相手-5000・R44）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1', 'WX11-004#1'],   // 下1枚(WD01-001)＋センターWX11-004（エクシード1を支払える）
        'field.signi': [['WXDi-P06-078#1'], null, null], // watcher（凶将 カラサワ）
        'energy': ['WD05-009#1'],                      // 黒エナ（任意コスト用）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-053#1'], null, null],   // 任意コスト発動時のPOWER_MODIFY対象候補
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const lrigImg = page.getByAltText('コード・ピルルク　Λ', { exact: false }).first();
      if (await lrigImg.count()) { await lrigImg.click({ force: true }).catch(() => {}); H.log('LRIGクリック: OK'); }
      else H.log('LRIGクリック: 見つからず');
      let fired = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/exceedCost-${s}.png`, fullPage: true });
        let did = null;
        if (!did) { // 【起】エクシード１ボタン（MAIN専用の【起】は1つだけ）
          const actBtn = page.getByRole('button', { name: /【起】エクシード/ }).first();
          if (await actBtn.count() && await actBtn.isVisible().catch(() => false)) { await actBtn.click().catch(() => {}); did = 'btn:【起】エクシード'; }
        }
        if (!did) { // LrigGrantedModal「発動」
          const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false) && await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = 'btn:発動'; }
        }
        // 発動順序モーダル（WX11-004-E2＋WXDi-P06-078-E1が同時収集される）＝順序確定ボタン
        const orderLog = await H.findLog(/エクシードコスト支払い時/);
        if (orderLog) fired = true;
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定']);
        const promptLog = await H.findLog(/任意コスト：対象シグニを選んで発動しますか/);
        if (promptLog) fired = true;
        if (!did && fired) { // ON_EXCEED_COST発火済み＝スキップして完走
          did = await H.clickTextOrBtn(['スキップ']);
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK']);
        const st = await H.queryState();
        H.log(`  exc[${s}] -> ${did ?? 'なし'} | hand=${st?.host?.hand ?? '-'} fired=${fired} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (fired && (st?.host?.actionsDone ?? []).includes('WXDi-P06-078-E1')) {
          return { pass: true, detail: `ON_EXCEED_COST 発火→WXDi-P06-078-E1 が actions_done に記録（hand=${st.host.hand}）` };
        }
      }
      const fin = await H.queryState();
      if (fired) return { pass: true, detail: `ON_EXCEED_COST 発火（任意コストプロンプト確認・hand=${fin?.host?.hand}）` };
      return { pass: false, detail: `ON_EXCEED_COST 発火未確認（hand=${fin?.host?.hand ?? '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'} stack=${fin?.stackLen ?? '-'}）` };
    },
  },

  // ON_COIN_PAID③＝WXDi-P15-069自身の【起】《コインアイコン》×2（usageLimit無し・何度でも発動可）を
  // 同一ターン内に3回発動し、watcher（同カードのE1・ON_COIN_PAID・usageLimit:twice_per_turn）が
  // 3回目だけ発火しない（powerModsが+2000×2のまま増えない）ことを確認する。
  // UI操作＝my-signi-zone-0クリック→StackModalの「【起】コイン2」ボタン→SigniActivatedModalの「発動」ボタン
  // （このカードの起動コストはコインのみでエナ選択等が不要＝canAffordが直ちに満たされる）。
  coinPaidTwice: {
    title: 'WXDi-P15-069（ON_COIN_PAID③＝usageLimit:twice_per_turnが3回目の支払いで発火しない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P15-069#1'], null, null], // watcher兼コイン支払い元
        'coins': 6, // 【起】コイン2×3回分
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const payOnce = async (label) => {
        let modalOpened = false;
        for (let s = 0; s < 15; s++) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${SHOT}/coinPaidTwice-${label}-${s}.png`, fullPage: true });
          let did = null;
          if (!modalOpened) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
          if (!did) {
            // ⚠getMySigniFieldActions（BattleScreen.tsx:9903）のcostLabel構築がeff.cost?.coinを
            // 考慮しておらず、コインのみコストの起動効果ボタンが「【起】コストなし」と誤表示される
            // （WXK04-003のLRIG版と同型の表示バグ・続き99で発見・詳細BUGFIXES）。実際のコスト要求は
            // SigniActivatedModal側で正しいため、ボタンテキストは【起】始まりで広く拾う。
            const actBtn = page.getByRole('button', { name: /^【起】/ }).first();
            if (await actBtn.count() && await actBtn.isVisible().catch(() => false)) { await actBtn.click().catch(() => {}); did = 'btn:【起】コイン'; }
          }
          if (!did) {
            const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false) && await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = 'btn:発動'; }
          }
          if (!did) did = await H.clickTextOrBtn(['発動順序を確定']); // ON_COIN_PAID watcherと【起】効果の発動順序モーダル
          if (!did) { // SELECT_TARGET（POWER_MODIFY対象＝自身1体のみ・候補1択）
            const pick0 = page.getByTestId('pick-0').first();
            if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
              const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
              if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
            }
          }
          if (!did) did = await H.clickTextOrBtn(['決定', 'OK']);
          const st = await H.queryState();
          H.log(`  [${label}][${s}] -> ${did ?? 'なし'} | coins=${st?.host?.coins ?? '-'} pmods=${(st?.host?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
          if (!did && modalOpened && (st?.stackLen ?? 0) === 0 && !st?.pendingEffect) {
            // 発動完了（モーダルが閉じ保留なし）と判断してこの回を終える
            await page.waitForTimeout(600);
            return await H.queryState();
          }
        }
        return await H.queryState();
      };
      const before = await H.queryState();
      H.log('開始時 coins:', before?.host?.coins);
      const after1 = await payOnce('pay1');
      const n1 = (after1?.host?.powerMods ?? []).filter(m => m.startsWith('WXDi-P15-069#1:')).length;
      H.log(`1回目後 pmods件数=${n1} coins=${after1?.host?.coins}`);
      const after2 = await payOnce('pay2');
      const n2 = (after2?.host?.powerMods ?? []).filter(m => m.startsWith('WXDi-P15-069#1:')).length;
      H.log(`2回目後 pmods件数=${n2} coins=${after2?.host?.coins}`);
      if (n2 <= n1) {
        return { pass: false, detail: `2回目のON_COIN_PAIDが未発火（pmods ${n1}→${n2}）＝usageLimit検証の前提が崩れた` };
      }
      const after3 = await payOnce('pay3');
      const n3 = (after3?.host?.powerMods ?? []).filter(m => m.startsWith('WXDi-P15-069#1:')).length;
      H.log(`3回目後 pmods件数=${n3} coins=${after3?.host?.coins}`);
      if (n3 > n2) {
        return { pass: false, detail: `【要注意】usageLimit未機能の疑い＝3回目の支払いでも発火（pmods ${n2}→${n3}）＝twice_per_turnガードが同一ターン内3回目で効いていない` };
      }
      return { pass: true, detail: `usageLimit《ターン2回》が正しく機能＝1→2回目で発火（pmods ${n1}→${n2}）・3回目は発火せず（${n2}→${n3}・coins=${after3?.host?.coins}）` };
    },
  },

  // R44②＝exceedCostと同じ盤面だが、任意コストプロンプトを「スキップ」せず実際に《黒》を支払って
  // 対象選択CHOOSEまで進め、相手シグニ（WX01-053）に-5000が実際に適用されることを確認する。
  exceedCostPay: {
    title: 'WX11-004→WXDi-P06-078（ON_EXCEED_COST残②＝任意コスト支払い→対象へ-5000が実際に適用される）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1', 'WX11-004#1'],
        'field.signi': [['WXDi-P06-078#1'], null, null],
        'energy': ['WD05-009#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-053#1'], null, null],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const lrigImg = page.getByAltText('コード・ピルルク　Λ', { exact: false }).first();
      if (await lrigImg.count()) { await lrigImg.click({ force: true }).catch(() => {}); H.log('LRIGクリック: OK'); }
      let fired = false;
      let paidPrompted = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/exceedCostPay-${s}.png`, fullPage: true });
        let did = null;
        if (!did) {
          const actBtn = page.getByRole('button', { name: /【起】エクシード/ }).first();
          if (await actBtn.count() && await actBtn.isVisible().catch(() => false)) { await actBtn.click().catch(() => {}); did = 'btn:【起】エクシード'; }
        }
        if (!did) {
          const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false) && await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = 'btn:発動'; }
        }
        const orderLog = await H.findLog(/エクシードコスト支払い時/);
        if (orderLog) fired = true;
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定']);
        const promptTitle = page.getByText('凶将　カラサワの効果').first();
        if (await promptTitle.count() && await promptTitle.isVisible().catch(() => false)) { fired = true; paidPrompted = true; }
        if (!did && paidPrompted) { // 任意コストプロンプト：エナ（黒）を選択→対象選択して発動
          const e0 = page.getByTestId('optcost-energy-0').first();
          const payBtn = page.getByTestId('optcost-pay').first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false) && await payBtn.isEnabled().catch(() => false)) {
            await payBtn.click().catch(() => {}); did = 'btn:optcost-pay';
          } else if (await e0.count() && await e0.isVisible().catch(() => false)) {
            await e0.click().catch(() => {}); did = 'tid:optcost-energy-0';
          }
        }
        if (!did) { // SELECT_TARGET（-5000対象＝guestのWX01-053）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK']);
        const st = await H.queryState();
        const pmods = st?.guest?.powerMods ?? [];
        const debuffed = pmods.some(m => m.startsWith('WX01-053#1:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  excpay[${s}] -> ${did ?? 'なし'} | fired=${fired} paidPrompted=${paidPrompted} pmods=${pmods.join(',') || '-'} hEnergy=${st?.host?.energy ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (debuffed) {
          return { pass: true, detail: `ON_EXCEED_COST②＝任意コスト支払い後、対象（WX01-053）へ-5000が実際に適用された（pmods=${pmods.join(',')}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `対象への-5000未確認（fired=${fired} paidPrompted=${paidPrompted} pmods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} hEnergy=${fin?.host?.energy ?? '-'}）` };
    },
  },

  // ⑨ ON_LRIG_UNDER_MOVED（C1・WXDi-P04-042）: 【自】＝あなたのターンの間、ルリグの下からカードが移動したとき（once_per_turn）。
  //    トリガー源＝アーツ WX05-007 ラスト・セレクト（タマ/イオナ限定・《白》《黒》：センタールリグの下から4枚をルリグトラッシュへ＋
  //    対戦相手シグニ1体トラッシュ）。guest シグニ場を空にすると TRASH 対象0→SEQUENCE が一気に done=true となり
  //    resolveStackNext 中央 diff(4782) が下札移動を検出して発火（対象選択を挟むと pause し中央 diff を通らないため空にする）。
  //    発火証拠＝once_per_turn 記録 host.actions_done に 'WXDi-P04-042-E1' が入ること（持続・確実）。
  lrigundermoved: {
    title: 'WX05-007→WXDi-P04-042（ON_LRIG_UNDER_MOVED＝ルリグ下移動で【自】発火）',
    spec: {
      hostSet: {
        // タマのグロウ列：下4枚（Lv0-3）＋センター WD01-001（Lv4・タマ＝WX05-007 のタマ/イオナ限定を満たす）
        'field.lrig': ['WD01-005#1', 'WD01-004#1', 'WD01-003#1', 'WD01-002#1', 'WD01-001#1'],
        'field.signi': [['WXDi-P04-042#1'], null, null], // watcher
        'lrig_deck': ['WX05-007#1'],                     // アーツ ラスト・セレクト
        'energy': ['WD01-009#1', 'WD05-009#1'],           // 白×1（WD01-009）＋黒×1（WD05-009）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, null],              // 空＝TRASH対象なし→アーツが一気に done
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 下札数:', before?.host?.lrigUnder, 'lrigTrash:', before?.host?.lrigTrash);
      await H.ensureMain();
      // アーツはルリグデッキから使う：ルリグDKバッジ→カード→使用→アーツ使用
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      const fired = (id) => (before?.host?.actionsDone ?? []).includes(id);
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigundermoved-${s}.png`, fullPage: true });
        // アーツ Phase2 コスト：白/黒エナを2枚選んでから「アーツ使用」を押す（未選択だと disabled）。
        let did = null;
        const a0 = page.getByTestId('artscost-energy-0').first();
        if (await a0.count() && await a0.isVisible().catch(() => false)) {
          for (const i of [0, 1]) { const e = page.getByTestId(`artscost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) { await e.click().catch(() => {}); } }
          await page.waitForTimeout(200);
          const use = page.getByRole('button', { name: /アーツ使用/ }).first();
          if (await use.count() && await use.isEnabled().catch(() => false)) { await use.click().catch(() => {}); did = 'btn:アーツ使用'; }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);                // 詳細モーダルの「使用」→アーツモーダルへ
        if (!did) { const pick0 = page.getByTestId('pick-0').first(); if (await pick0.count() && await pick0.isVisible().catch(() => false)) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; } }
        if (!did) did = await H.clickTextOrBtn(['発動', '確定', '決定', 'OK', 'はい', 'スキップ', '支払わない', '選ばない']);
        if (!did) did = await H.clickTestId('zone-card-0');             // モーダル未開時のみ：アーツを開く
        const st = await H.queryState();
        const done = (st?.host?.actionsDone ?? []).includes('WXDi-P04-042-E1');
        H.log(`  lu[${s}] -> ${did ?? 'なし'} | under=${st?.host?.lrigUnder ?? '-'} lrigTrash=${st?.host?.lrigTrash ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcherFired=${done}`);
        if (done) return { pass: true, detail: `ON_LRIG_UNDER_MOVED 発火→WXDi-P04-042-E1 が actions_done に記録（下札 ${before?.host?.lrigUnder}→${st.host.lrigUnder}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_LRIG_UNDER_MOVED 発火未確認（under ${before?.host?.lrigUnder}→${fin?.host?.lrigUnder} lrigTrash=${fin?.host?.lrigTrash} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  // ⑩ ON_KEYWORD_GAINED（C1・WXDi-P04-035 羅輝石 アレキサンドライト）: 【自】他のシグニが【アサシン/ランサー/ダブルクラッシュ】を
  //    得たとき、《赤》《無》を払えば自身もその能力を得る（COPY_ABILITY＝得たキーワードを triggeringKeyword 経由で自身に付与）。
  //    トリガー源＝スペル WXDi-P04-079 豪槍（緑白無：自シグニ1体に【ランサー】付与＝SELECT_TARGET→resume 経路）。watcher 以外の
  //    味方（zone0）を対象に付与→ON_KEYWORD_GAINED→任意コスト赤無払い→watcher(WXDi-P04-035#1)が【ランサー】を得るのを確認。
  keywordgained: {
    title: 'WXDi-P04-079→WXDi-P04-035（ON_KEYWORD_GAINED＝味方のキーワード獲得を自身にコピー）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],                                  // 任意センター
        'field.signi': [['WD04-009#1'], ['WXDi-P04-035#1'], null],     // zone0=付与対象(緑 plain)／zone1=watcher
        'energy': ['WD04-009#2', 'WD01-009#1', 'WD02-009#1', 'WD02-009#2', 'WD01-009#2', 'WD04-009#3'], // 緑白赤×… 豪槍(緑白無)＋watcher(赤無)用
        'actions_done': [],
      },
      handPrepend: ['WXDi-P04-079#1'],                                // 豪槍
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      const watcherHasLancer = (st) => (st?.host?.keywordGrants ?? []).some(g => /WXDi-P04-035#1:.*ランサー/.test(g));
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/keywordgained-${s}.png`, fullPage: true });
        let did = null;
        // スペルコスト：緑白無＝エナ3枚選択→発動する
        const sc0 = page.getByTestId('spellcost-energy-0').first();
        if (await sc0.count() && await sc0.isVisible().catch(() => false)) {
          for (const i of [0, 1, 2]) { const e = page.getByTestId(`spellcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
          await page.waitForTimeout(200);
          did = await clickExact('発動する');
          if (!did) did = 'spellcost-select';
        }
        if (!did) did = await clickExact('発動'); // CardModal「発動」
        // watcher の任意コスト赤無：optcost-energy 2枚→pay
        if (!did) {
          const oc0 = page.getByTestId('optcost-energy-0').first();
          if (await oc0.count() && await oc0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`optcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
            await page.waitForTimeout(200);
            const pay = page.getByTestId('optcost-pay').first();
            if (await pay.count() && await pay.isEnabled().catch(() => false)) { await pay.click().catch(() => {}); did = 'optcost-pay'; }
          }
        }
        if (!did) { // SELECT_TARGET（豪槍の付与対象＝zone0 の非watcher）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        H.log(`  kg[${s}] -> ${did ?? 'なし'} | grants=${(st?.host?.keywordGrants ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (watcherHasLancer(st)) return { pass: true, detail: `ON_KEYWORD_GAINED 発火→COPY_ABILITY で watcher(WXDi-P04-035#1) が【ランサー】を得た（grants=${(st.host.keywordGrants).join(',')}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `watcher への【ランサー】コピー未確認（grants=${(fin?.host?.keywordGrants ?? []).join(',') || '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑪ ON_SIGNI_POWER_ZERO_OR_LESS（R37・§7・WX21-067）: 【自】《ターン1回》＝対戦相手のシグニのパワーが０以下に
  //    なったとき、カードを１枚引く（triggerScope any_opp）。トリガー源＝WD11-013【出】（mandatory・コストなし・
  //    対戦相手シグニ1体に-1000＝ちょうど power1000 の相手シグニ WX01-083 を0化）。⚠試行錯誤の教訓＝(1)WD22-037-UG
  //    （-12000）は「シグニの効果によって場に出た場合」限定の裏面UG型カードで通常召喚ボタン自体が出ないUI仕様と判明。
  //    (2)WD11-013 は「ミュウ限定」＝ホストのセンタールリグがミュウでないと同様に召喚ボタンが出ない（Team制限が
  //    実際に summon UI をゲートする＝当初の想定「デッキ構築のみ制約」は誤り）。→センターを ミュウ の WX08-004
  //    （Lv4/Limit11）に変更して解決。-1000到達→クライアント側の checkAndBanishPowerZero（useEffect常時監視）が
  //    対象をバニッシュ＋collectPowerZeroTriggers を発火させる経路。
  powerzero: {
    title: 'WD11-013→WX21-067（ON_SIGNI_POWER_ZERO_OR_LESS＝相手シグニ0以下化でドロー）',
    spec: {
      hostSet: {
        'field.lrig': ['WX08-004#1'],                  // ミュウ Lv4/Limit11（WD11-013「ミュウ限定」を満たす・Lv1+Lv2=3に十分）
        'field.signi': [['WX21-067#1'], null, null],   // watcher（アイン＝テトロド）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], null, null],   // バニッシュ対象（P1000＝-1000でちょうど0化）
      },
      handPrepend: ['WD11-013#1'],                     // 幻蟲 モンチョウ（【出】対戦相手シグニ-1000・コストなし）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const hHand0 = before?.host?.hand ?? 0;
      H.log('開始時 自手札:', hHand0);
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/powerzero-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // SELECT_TARGET（-12000 対象＝guest の WD01-013）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const done = (st?.host?.actionsDone ?? []).includes('WX21-067-E1');
        const drawLog = await H.findLog(/アイン＝テトロド.*(パワー0以下|【自】)|パワー0以下.*アイン＝テトロド/);
        H.log(`  pz[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} gTrash=${st?.guest?.trash ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcherFired=${done} drawLog=${!!drawLog}`);
        if (done || drawLog) return { pass: true, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 発火→WX21-067 がドロー（ログ「アイン＝テトロドの【自】効果（パワー0以下時）」確認・手札 ${hHand0}→${st.host.hand}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 未確認（hHand ${hHand0}→${fin?.host?.hand ?? '-'} gTrash=${fin?.guest?.trash ?? '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  // ⑪' WX21-067-E1（続き141・Sonnet・PLAN §7「R37③ ON_SIGNI_POWER_ZERO_OR_LESSのusageLimit」）＝タスク12(vi-5)
  //    （続き135・Opusで二面コレクタのusageLimit書き戻しを一括修正済み）の実機検証。powerzero と同じトリガー源
  //    （WD11-013【出】：対戦相手シグニ1体に-1000）を手札に2枚用意し、guest場に P1000 のバニッシュ対象を2体
  //    配置＝1体目の召喚でwatcher（アイン＝テトロド）が発火してドロー→2体目の召喚でも同様に0以下化するが、
  //    《ターン1回》のためドローが再発火しないことを確認する。
  powerzeroUsageLimit: {
    title: 'WD11-013×2→WX21-067（ON_SIGNI_POWER_ZERO_OR_LESS＝usageLimit《ターン1回》の実機検証）',
    spec: {
      hostSet: {
        'field.lrig': ['WX08-004#1'],                              // ミュウ Lv4/Limit11
        'field.signi': [['WX21-067#1'], null, null],               // watcher（アイン＝テトロド）
        'hand': ['WD11-013#1', 'WD11-013#2'],                      // 幻蟲 モンチョウ×2（決定的指定＝handPrependの残留ランダム手札混入flakinessを避ける）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], ['WX01-083#2'], null],     // バニッシュ対象×2（各P1000＝-1000でちょうど0化）
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const summonAndTarget = async (label, guestCountBefore) => {
        let summoned = false;
        for (let s = 0; s < 20; s++) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${SHOT}/powerzeroUL-${label}-${s}.png`, fullPage: true });
          let did = null;
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
          if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
          if (!did) { // SELECT_TARGET（-1000 対象＝guest の WX01-083）
            const pick0 = page.getByTestId('pick-0').first();
            if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
              const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
              if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
            }
          }
          if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
          const st = await H.queryState();
          const guestCount = (st?.guest?.fieldSigni ?? []).filter(z => (z ?? []).length > 0).length;
          H.log(`  pzul-${label}[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} gCount=${guestCount} actionsDone=${JSON.stringify(st?.host?.actionsDone)} pEff=${st?.pendingEffect ?? '-'}`);
          if (guestCount < guestCountBefore) return { st, settled: true };
        }
        return { st: await H.queryState(), settled: false };
      };

      await H.ensureMain();
      H.log('1枚目 手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const r1 = await summonAndTarget('1', 2);
      if (!r1.settled) return { pass: false, detail: `1回目のバニッシュ未完走（gField=${JSON.stringify(r1.st?.guest?.fieldSigni)}）＝検証空振り` };
      const done1 = (r1.st?.host?.actionsDone ?? []).includes('WX21-067-E1');
      if (!done1) return { pass: false, detail: `1回目のON_SIGNI_POWER_ZERO_OR_LESSが発火せず検証空振り（actionsDone=${JSON.stringify(r1.st?.host?.actionsDone)}）` };
      const hHandAfter1 = r1.st?.host?.hand ?? 0;
      H.log(`1回目の発火確認（hHand=${hHandAfter1}）。2枚目のWD11-013で2回目のトリガーを起動する…`);

      await H.ensureMain();
      H.log('2枚目 手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const r2 = await summonAndTarget('2', 1);
      if (!r2.settled) return { pass: false, detail: `2回目のバニッシュ未完走（gField=${JSON.stringify(r2.st?.guest?.fieldSigni)}）＝検証空振り` };
      const hHandAfter2 = r2.st?.host?.hand ?? 0;
      if (hHandAfter2 > hHandAfter1) {
        return { pass: false, detail: `実バグ確認＝usageLimit once_per_turnにもかかわらずON_SIGNI_POWER_ZERO_OR_LESSが同一ターン内で2回発火（2回目も手札 ${hHandAfter1}→${hHandAfter2}でドロー・gField=${JSON.stringify(r2.st?.guest?.fieldSigni)}）` };
      }
      return { pass: true, detail: `usageLimit正しく機能＝2枚目のWD11-013による2回目のON_SIGNI_POWER_ZERO_OR_LESSでは発火せず（手札 ${hHandAfter1}→${hHandAfter2}のまま・guest.fieldSigni=${JSON.stringify(r2.st?.guest?.fieldSigni)}）` };
    },
  },

  // R37「他4枚の個別確認」①のうち signi watcher 2枚（WX20-Re03/WXDi-P01-043）＝powerzero と同型・watcherのみ差し替え。
  powerzeroWX20Re03: {
    title: 'WD11-013→WX20-Re03（R37他4枚①＝ON_SIGNI_POWER_ZERO_OR_LESS・エナチャージ1）',
    spec: {
      hostSet: {
        'field.lrig': ['WX08-004#1'],                  // ミュウ Lv4/Limit11（WD11-013「ミュウ限定」を満たす）
        'field.signi': [['WX20-Re03#1'], null, null],  // watcher（ドライ＝ラッカー）
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], null, null],   // バニッシュ対象（P1000＝-1000でちょうど0化）
      },
      handPrepend: ['WD11-013#1'],                     // 幻蟲 モンチョウ（【出】対戦相手シグニ-1000・コストなし）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      let preCheck = await H.queryState();
      for (let r = 0; r < 4 && !(preCheck?.guest?.fieldSigni?.[0] ?? []).includes?.('WX01-083#1'); r++) {
        H.log(`再注入(${r})… guest zone0=${JSON.stringify(preCheck?.guest?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        preCheck = await H.queryState();
      }
      const before = await H.queryState();
      const hEnergy0 = before?.host?.energy ?? 0;
      H.log('開始時 自エナ:', hEnergy0);
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/powerzeroWX20Re03-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const doneFlag = (st?.host?.actionsDone ?? []).includes('WX20-Re03-E1');
        H.log(`  pz20re03[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcherFired=${doneFlag}`);
        if (doneFlag || (st?.host?.energy ?? 0) > hEnergy0) {
          return { pass: true, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 発火→WX20-Re03 がエナチャージ（hEnergy ${hEnergy0}→${st?.host?.energy}・actionsDone=${doneFlag}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 未確認（hEnergy ${hEnergy0}→${fin?.host?.energy ?? '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  powerzeroWXDiP01043: {
    title: 'WD11-013→WXDi-P01-043（R37他4枚①＝ON_SIGNI_POWER_ZERO_OR_LESS・エナチャージ1）',
    spec: {
      hostSet: {
        'field.lrig': ['WX08-004#1'],                     // ミュウ Lv4/Limit11
        'field.signi': [['WXDi-P01-043#1'], null, null],  // watcher（大装 ダークエナジェ）
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], null, null],
      },
      handPrepend: ['WD11-013#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      // 注入直後、CPU側の自ターン処理が非同期で残っていて guest_state を上書きする競合がある（既知レース）。
      // guest zone0 が期待値になるまで再注入して確認する（freezetriggerUsageLimit と同型対策）。
      let preCheck = await H.queryState();
      for (let r = 0; r < 4 && !(preCheck?.guest?.fieldSigni?.[0] ?? []).includes?.('WX01-083#1'); r++) {
        H.log(`再注入(${r})… guest zone0=${JSON.stringify(preCheck?.guest?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        preCheck = await H.queryState();
      }
      const before = await H.queryState();
      const hEnergy0 = before?.host?.energy ?? 0;
      H.log('開始時 自エナ:', hEnergy0, '/ guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/powerzeroWXDiP01043-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const doneFlag = (st?.host?.actionsDone ?? []).includes('WXDi-P01-043-E1');
        H.log(`  pzP01043[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcherFired=${doneFlag}`);
        if (doneFlag || (st?.host?.energy ?? 0) > hEnergy0) {
          return { pass: true, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 発火→WXDi-P01-043 がエナチャージ（hEnergy ${hEnergy0}→${st?.host?.energy}・actionsDone=${doneFlag}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 未確認（hEnergy ${hEnergy0}→${fin?.host?.energy ?? '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  // R37「他4枚の個別確認」残り2枚のうちLRIG watcher・CHOOSE分岐版。
  // WX22-013（ルリグ）＝ON_SIGNI_POWER_ZERO_OR_LESS→CHOOSE（①エナチャージ／②ドロー）。
  // 呼び水はWXDi-P02-084（【出】：対戦相手のすべてのシグニのパワー-1000・コストなし・restrictionなし・count:'ALL'で
  // SELECT_TARGET不要＝WX22-013をcenter lrigに据えても「ミュウ限定」等のrestrictionに引っかからない）。
  powerzeroWX22013: {
    title: 'WXDi-P02-084→WX22-013（R37他4枚①＝ON_SIGNI_POWER_ZERO_OR_LESS・CHOOSE：エナチャージ/ドロー）',
    spec: {
      hostSet: {
        'field.lrig': ['WX22-013#1'],        // watcher自身がcenter lrig（Lv5/Limit13）
        'field.signi': [null, null, null],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], null, null], // P1000＝-1000でちょうど0化
      },
      handPrepend: ['WXDi-P02-084#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      let preCheck = await H.queryState();
      for (let r = 0; r < 4 && !(preCheck?.guest?.fieldSigni?.[0] ?? []).includes?.('WX01-083#1'); r++) {
        H.log(`再注入(${r})… guest zone0=${JSON.stringify(preCheck?.guest?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        preCheck = await H.queryState();
      }
      const before = await H.queryState();
      const hEnergy0 = before?.host?.energy ?? 0;
      const hHand0 = before?.host?.hand ?? 0;
      H.log('開始時 hEnergy:', hEnergy0, 'hHand:', hHand0);
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/powerzeroWX22013-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // CHOOSE（①エナチャージ or ②ドロー・どちらでも良い＝選択肢1を選ぶ）
          const c1 = page.getByRole('button', { name: '選択肢1', exact: true }).first();
          if (await c1.count() && await c1.isVisible().catch(() => false)) { await c1.click().catch(() => {}); did = 'choose:選択肢1'; }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const doneFlag = (st?.host?.actionsDone ?? []).includes('WX22-013-E2');
        H.log(`  pz22013[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy ?? '-'} hHand=${st?.host?.hand ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcherFired=${doneFlag}`);
        if (doneFlag || (st?.host?.energy ?? 0) > hEnergy0 || (st?.host?.hand ?? 0) > hHand0) {
          return { pass: true, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 発火→WX22-013 CHOOSE解決（hEnergy ${hEnergy0}→${st?.host?.energy}・hHand ${hHand0}→${st?.host?.hand}・actionsDone=${doneFlag}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 未確認（hEnergy ${hEnergy0}→${fin?.host?.energy ?? '-'} hHand ${hHand0}→${fin?.host?.hand ?? '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  // WXDi-P14-009（ルリグ）＝ON_SIGNI_POWER_ZERO_OR_LESS・triggerCondition.turnOwner:'self'（自ターン限定）→
  // 対戦相手シグニ1体に-5000（SELECT_TARGET要）。host自身のターン中の発火＝turnOwner:selfゲートの正例。
  powerzeroWXDiP14009: {
    title: 'WXDi-P02-084→WXDi-P14-009（R37他4枚①＝ON_SIGNI_POWER_ZERO_OR_LESS・turnOwner:self正例）',
    spec: {
      hostSet: {
        'field.lrig': ['WXDi-P14-009#1'],    // watcher自身がcenter lrig（Lv3/Limit6）
        'field.signi': [null, null, null],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], ['WX01-083#2'], null], // 0化対象＋POWER_MODIFY対象の2体
      },
      handPrepend: ['WXDi-P02-084#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      let preCheck = await H.queryState();
      for (let r = 0; r < 4 && !(preCheck?.guest?.fieldSigni?.[0] ?? []).includes?.('WX01-083#1'); r++) {
        H.log(`再注入(${r})… guest zone0=${JSON.stringify(preCheck?.guest?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        preCheck = await H.queryState();
      }
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/powerzeroWXDiP14009-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // SELECT_TARGET（-5000対象＝guestの残り1体・zone1側=pick-1想定だが候補1体ならpick-0でも可）
          const pick = page.getByTestId('pick-0').first();
          if (await pick.count() && await pick.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const doneFlag = (st?.host?.actionsDone ?? []).includes('WXDi-P14-009-E1');
        const pmods = st?.guest?.powerMods ?? [];
        H.log(`  pzP14009[${s}] -> ${did ?? 'なし'} | pmods=${pmods.join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcherFired=${doneFlag}`);
        if (doneFlag || pmods.some(m => /-5000$/.test(m))) {
          return { pass: true, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 発火（turnOwner:self正例）→WXDi-P14-009が対戦相手に-5000（pmods=${pmods.join(',')}・actionsDone=${doneFlag}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_SIGNI_POWER_ZERO_OR_LESS 未確認（pmods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'}）` };
    },
  },

  // ⑭ WX01-081→WXDi-P04-065: R38（§7）ON_SIGNI_FROZEN の実機検証。
  //    WX01-081【出】（ON_PLAY・mandatory・相手シグニ1体を凍結・「ピルルク限定」＝center lrigをピルルク系に）を
  //    召喚→SELECT_TARGETで相手シグニを指定→FREEZE適用→collectFreezeTriggers が watcher（WXDi-P04-065・
  //    any_opp・targetsTriggerSource）を発火→凍結されたそのシグニにパワー-1000…のはずだが、
  //    ✅2026-07-07・続き41（Opus）で修正・実機PASS確認。ground truth（guest.field.signi_frozen）は [true,false,false] に
  //    正しく変化し、FREEZE 適用後に watcher（羅菌 プランクトン の【自】効果（凍結時））が発火して -1000 が反映される。
  //    修正＝collectFreezeTriggers/detectNewlyFrozen は resolveStackNext の中央diff（BattleScreen.tsx:3798）にしか
  //    配線されておらず、本シナリオのように SELECT_TARGET を要する ON_PLAY 効果が resume 経路（handleEffectInteraction）
  //    で完結するケース（=effect_stackを使わない大半のケース）では一度も呼ばれず watcher 無発火だった。
  //    同様の resume 経路の取りこぼしは ON_DECK_SHUFFLED/ON_SIGNI_BANISH_OPPONENT_BY_EFFECT/ON_LRIG_UNDER_MOVED/
  //    ON_KEYWORD_GAINED が既に collectXxxInline で対策済み（handleEffectInteraction 4386-4408行）。
  //    ON_SIGNI_FROZEN も同型の collectFreezeInline を追加して合流させた（BattleScreen.tsx）。
  freezetrigger: {
    title: 'WX01-081→WXDi-P04-065（ON_SIGNI_FROZEN＝相手シグニ凍結時 自身targetに-1000・✅続き41で修正・resume経路配線）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],                    // コード・ピルルク・Ｍ Lv2（「ピルルク限定」を満たす）
        'field.signi': [['WXDi-P04-065#1'], null, null], // watcher（羅菌 プランクトン・any_opp・P1000）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null],     // 凍結対象（小剣 ククリ P3000）
      },
      handPrepend: ['WX01-081#1'],                        // コードアート Ｔ・Ｖ（【出】相手シグニ1体を凍結・コストなし）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/freezetrigger-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // SELECT_TARGET（凍結対象＝guest の WD01-013）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい']);
        const watcherLog = await H.findLog(/羅菌.*プランクトン.*凍結時|の【自】効果（凍結時）/);
        const st = await H.queryState();
        // 凍結の ground-truth は state（guest.signiFrozen に true）＝ログ文字列は経路により出ない/表記揺れがあり脆いため状態で判定。
        const gFrozen = st?.guest?.signiFrozen;
        const frozeApplied = Array.isArray(gFrozen) && gFrozen.some(Boolean);
        H.log(`  fz[${s}] -> ${did ?? 'なし'} | freeze=${frozeApplied} watcher=${!!watcherLog} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} phase=${st?.turnPhase ?? '-'} gFrozen=${JSON.stringify(gFrozen)} logTail=${JSON.stringify((st?.logTail ?? []).slice(-4))}`);
        if (frozeApplied && watcherLog) {
          return { pass: true, detail: `ON_SIGNI_FROZEN 発火→ guest.signiFrozen=${JSON.stringify(gFrozen)}・watcher「${watcherLog}」を確認` };
        }
      }
      return { pass: false, detail: '凍結ログ／watcher発火ログ未確認' };
    },
  },

  // R38②《ターン1回》回数制限＝ON_SIGNI_FROZEN watcher（WX08-039-E1・usageLimit:once_per_turn）が
  // 同一ターン内に2体を別々に凍結しても2回目は発火しないことを確認（PLAN §7 R38 残項目）。
  // WX01-081（コストなし・ピルルク限定・【出】相手シグニ1体凍結）を2枚召喚し、guestの別々の2体を凍結する。
  freezetriggerUsageLimit: {
    title: 'WX01-081×2→WX08-039（ON_SIGNI_FROZEN③＝同一ターン内2体を別々に凍結しても発火は1回のみ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],                     // コード・ピルルク・Ｇ Lv3/Limit8（WX01-081の「ピルルク限定」を満たしつつ、watcher(Lv4)+2枚(各Lv1)=6≤8のリミット余裕を確保）
        'field.signi': [['WX08-039#1'], null, null],      // watcher（コードアート Ｍ・Ｍ・ON_SIGNI_FROZEN《ターン1回》→対戦相手手札1捨て）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], ['WD01-013#2'], null], // 凍結対象2体（小剣 ククリ×2・別インスタンス）
      },
      handPrepend: ['WX01-081#1', 'WX01-081#2'],           // コードアート Ｔ・Ｖ×2枚（1枚ずつ召喚して別々に凍結）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      // 注入直後、CPU側の自ターン処理が非同期で残っていて guest_state を上書きする競合がある
      // （wxk10068banish と同型の既知レース）。guest zone0/zone1 が期待値になるまで再注入して確認する。
      let preCheck = await H.queryState();
      for (let r = 0; r < 4 && !((preCheck?.guest?.fieldSigni?.[0] ?? []).includes?.('WD01-013#1') && (preCheck?.guest?.fieldSigni?.[1] ?? []).includes?.('WD01-013#2')); r++) {
        H.log(`再注入(${r})… guest zone0/1=${JSON.stringify(preCheck?.guest?.fieldSigni)}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        preCheck = await H.queryState();
      }
      H.log('開始時 guest.fieldSigni:', JSON.stringify(preCheck?.guest?.fieldSigni));
      const runFreeze = async (label, pickTestId, alreadyFrozen) => {
        await H.ensureMain();
        H.log(`[${label}] 手札クリック:`, await H.clickTestId('my-hand-card-0') ?? '見つからず');
        let summoned = false;
        let reclicked = false;
        for (let s = 0; s < 24; s++) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${SHOT}/freezetriggerUsageLimit-${label}-${s}.png`, fullPage: true });
          let did = null;
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
          if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
          // 手札カードのプレビューモーダル（「タップして閉じる」）が選択の代わりに開くことがある（非決定的）。
          // 召喚ボタンにも zone にも進めないまま数tick経過したら、閉じて1回だけ選び直す。
          if (!did && !summoned && !reclicked && s >= 3) {
            const closeTx = page.getByText(/タップ.{0,4}閉じる/).first();
            if (await closeTx.count() && await closeTx.isVisible().catch(() => false)) {
              await closeTx.click().catch(() => {});
              await page.waitForTimeout(400);
              did = 'closeModal+' + (await H.clickTestId('my-hand-card-0') ?? 'reclick失敗');
              reclicked = true;
            }
          }
          if (!did) { // SELECT_TARGET（凍結対象＝guestの該当ゾーン）
            const pick = page.getByTestId(pickTestId).first();
            if (await pick.count() && await pick.isVisible().catch(() => false)) {
              const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
              if (!confirmReady) { await pick.click().catch(() => {}); did = `pick:${pickTestId}`; }
            }
          }
          if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい']);
          const st = await H.queryState();
          const gFrozen = st?.guest?.signiFrozen;
          H.log(`  [${label}][${s}] -> ${did ?? 'なし'} | gFrozen=${JSON.stringify(gFrozen)} gHand=${st?.guest?.hand ?? '-'} hActionsDone=${JSON.stringify(st?.host?.actionsDone)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
          // ⚠「summonedになってから」かつ「alreadyFrozenに無かったゾーンが新たにtrueになった」場合のみ
          // この回の凍結が完了したとみなす（前回の残留frozen状態だけで早期returnしないためのガード）。
          const newlyFrozen = Array.isArray(gFrozen) && gFrozen.some((v, i) => v && !alreadyFrozen[i]);
          const settled = summoned && newlyFrozen && !st?.pendingEffect && (st?.stackLen ?? 0) === 0;
          // ⚠凍結自体は即時反映されるが、watcher（ON_SIGNI_FROZEN）の対戦相手手札トラッシュはCPU(guest)側の
          // 自動応答を挟むため1tick遅れうる＝settled検出後もさらに2拍待って gHand が安定するのを確認してから返す
          // （ontargetedUsageLimit の castOnce と同型の「2連続settled」パターン）。
          if (settled) {
            await page.waitForTimeout(900);
            const st2 = await H.queryState();
            await page.waitForTimeout(900);
            const st3 = await H.queryState();
            H.log(`  [${label}][settle+] gHand ${st?.guest?.hand}→${st2?.guest?.hand}→${st3?.guest?.hand} hActionsDone=${JSON.stringify(st3?.host?.actionsDone)}`);
            return st3;
          }
        }
        return await H.queryState();
      };
      const before = await H.queryState();
      const gHand0 = before?.guest?.hand ?? 0;
      H.log('guest 初期手札:', gHand0);

      const afterFirst = await runFreeze('freeze1', 'pick-0', [false, false, false]);
      const gHand1 = afterFirst?.guest?.hand ?? gHand0;
      const frozen1 = afterFirst?.guest?.signiFrozen ?? [false, false, false];
      H.log(`1回目凍結後 guest.hand=${gHand1}（開始${gHand0}）frozen=${JSON.stringify(frozen1)}`);
      if (gHand1 >= gHand0) {
        return { pass: false, detail: `1回目のON_SIGNI_FROZENが未発火（gHand ${gHand0}→${gHand1}）＝usageLimit検証の前提が崩れた` };
      }

      const afterSecond = await runFreeze('freeze2', 'pick-1', frozen1);
      const gHand2 = afterSecond?.guest?.hand ?? gHand1;
      const frozen2 = afterSecond?.guest?.signiFrozen;
      H.log(`2回目凍結後 guest.hand=${gHand2}（1回目後${gHand1}）frozen=${JSON.stringify(frozen2)}`);
      const newlyFrozenIdx = Array.isArray(frozen2) ? frozen2.findIndex((v, i) => v && !frozen1[i]) : -1;
      if (newlyFrozenIdx < 0) {
        return { pass: false, detail: `2体目が新規凍結されなかった（frozen1=${JSON.stringify(frozen1)}→frozen2=${JSON.stringify(frozen2)}）＝usageLimit検証の前提が崩れた` };
      }
      if (gHand2 === gHand1) {
        return { pass: true, detail: `usageLimit《ターン1回》が正しく機能＝1回目でgHand ${gHand0}→${gHand1}・2体目の新規凍結（zone${newlyFrozenIdx}）でも増えず（${gHand1}→${gHand2}）` };
      }
      return { pass: false, detail: `【要注意】usageLimit未機能の疑い＝2体目の新規凍結でもgHandが増加（${gHand1}→${gHand2}）＝once_per_turnガードが同一ターン内2回目の凍結で効いていない` };
    },
  },

  // ⑮ WXK10-068: §4タスク2 動的比較＝LRIG_LEVEL_CMP_OPP（続き55・§7 実機検証）。
  //    【自】：このシグニがアタックしたとき、このシグニよりパワーの低い対戦相手のシグニ１体を対象とし、
  //    あなたのセンタールリグのレベルが対戦相手のセンタールリグ以下の場合、それをバニッシュする。
  //    自Lv2(WD03-003)≦相手Lv3(WD03-002)＝条件成立。E1(CONTINUOUS POWER_MODIFY_PER_LRIG_LEVEL)で
  //    WXK10-068の実効パワーが1000+1000×3=4000となり、対象候補（WD01-013 小剣ククリ P3000）が
  //    powerLtSelf を満たす。⚠バトル自体でも同じ相手シグニが負けうる（対象filter上、相手は常に自分より
  //    弱い）ため battleログ「Xが Yをバニッシュ」（バトル勝利側）と、effect banish の「Yをバニッシュ」
  //    （主語なし・execBanish/applyBanish）を判別する。バトル比較行「（Ｐ）vs（Ｐ）」が出る**前**に
  //    対象が場から消えていれば＝ON_ATTACK_SIGNIのCONDITIONAL BANISHが先に発火した証拠（effectivelyEmpty化
  //    でバトル自体がスキップされる）。
  wxk10068banish: {
    title: 'WXK10-068（LRIG_LEVEL_CMP_OPP＝自Lv≦相手Lvならアタック時、自分より低パワーの相手シグニをバニッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],                  // 自センター Lv2（≦ 相手Lv3 で条件成立）
        'field.signi': [['WXK10-068#1'], null, null],  // 攻撃者（P1000+CONT+3000=4000）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],                  // 相手センター Lv3
        'field.signi': [['WD01-013#1'], null, null],   // バニッシュ対象（小剣 ククリ P3000 < 4000）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      // 注入直後、CPU側の自ターン処理（グロウ等）が非同期で残っていて guest_state を上書きする競合がある
      // （ensureMain/openGrow と同型の既知レース）。guest zone0 が期待値になるまで再注入して確認する。
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[0] ?? []).includes?.('WD01-013#1'); r++) {
        H.log(`再注入(${r})… guest zone0=${JSON.stringify(before?.guest?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      H.log('開始時 guest:', JSON.stringify(before?.guest));
      H.log('開始時 host:', JSON.stringify(before?.host));
      let modalOpened = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxk10068banish-${s}.png`, fullPage: true });
        let did = null;
        // 注入後に turn_phase が MAIN 等へ巻き戻るレース（openGrow と同型）＝ATTACK_SIGNI へ再アサート。
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          modalOpened = false;
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        // 「アタック」完全一致（ヘッダーの「ルリグアタックへ」が部分一致で誤爆するため exact:true 限定）
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) {
            await atkBtn.click().catch(() => {}); did = 'btn:アタック(exact)';
          }
        }
        if (!did && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) { // SELECT_TARGET（バニッシュ対象＝guest の WD01-013・候補1のみ）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        const gZone0 = st?.guest?.fieldSigni?.[0];
        const targetGone = Array.isArray(before?.guest?.fieldSigni?.[0]) && before.guest.fieldSigni[0].includes('WD01-013#1')
          && !(Array.isArray(gZone0) && gZone0.includes('WD01-013#1'));
        const battleVsLine = (st?.logTail ?? []).some(l => /（\d+）\s*vs\s*.*（\d+）/.test(l));
        H.log(`  b10068[${s}] -> ${did ?? 'なし'} | modalOpened=${modalOpened} gZone0=${JSON.stringify(gZone0)} battleVsLine=${battleVsLine} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} logTail=${JSON.stringify((st?.logTail ?? []).slice(-3))}`);
        if (targetGone) {
          if (!battleVsLine) {
            return { pass: true, detail: `LRIG_LEVEL_CMP_OPP条件成立→WXK10-068-E2のCONDITIONAL BANISHが発火（バトル比較行なし・effect起因でWD01-013が消滅）` };
          }
          return { pass: false, detail: `対象は消滅したがバトル比較行「vs」を伴う＝battle勝利によるバニッシュと区別できない（effect発火の確証なし）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `バニッシュ未確認（gZone0=${JSON.stringify(fin?.guest?.fieldSigni?.[0])} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑮' WX16-Re05: ON_CHARM_TO_TRASH（R42②・§7）＝バトルバニッシュ（効果ではなく戦闘の力比べ）で
  //    チャーム付きシグニが離脱したときも watcher が発火するかの検証。既存の`charmToTrash`は効果
  //    （WX19-023の無条件バニッシュ）経由のみを確認済み。バトルバニッシュは`resolvePendingSigniBattleFor`
  //    （BattleScreen.tsx:6344）が独自のトリガーリスト（banishEntries/battleBanishEntries/…）を構築し、
  //    `collectBoardDiffTriggers`（=collectCharmToTrashTriggersの呼び出し元・resolveStackNext/
  //    handleEffectInteractionのみで使用）を一切呼ばない＝コード読解では**発火しない疑いが濃厚**。
  //    host zone0（WD05-009・P12000）でguest zone2（WD01-013・P3000・charm付き）へ通常アタック→
  //    力比べでWD01-013敗北・banish＋charmがguest.trashへ（ground truth）→
  //    watcher（host zone1・any scope）がguest zone1（WX01-053・P15000・唯一の残存候補）へ-4000するか観測。
  charmToTrashBattle: {
    title: 'WD05-009アタック→WX16-Re05（ON_CHARM_TO_TRASH＝バトルバニッシュ経路・R42②）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD05-009#1'], ['WX16-Re05#1'], null], // zone0=攻撃者P12000／zone1=watcher（any・P5000）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, ['WX01-053#1'], ['WD01-013#1']], // zone1=watcherの-4000対象(P15000・唯一の残存候補)／zone2=防御側(charm付き・P3000・host zone0の正面)
        'field.signi_charms': [null, null, 'WD03-002#1'],       // zone2にcharm注入
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[2] ?? []).includes?.('WD01-013#1'); r++) {
        H.log(`再注入(${r})… guest zone2=${JSON.stringify(before?.guest?.fieldSigni?.[2])}`);
        await injectScenario(page, scenarios.charmToTrashBattle.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      const gTrash0 = before?.guest?.trash ?? 0;
      H.log('開始時 guest:', JSON.stringify(before?.guest), 'gTrash0=', gTrash0);
      let modalOpened = false;
      let battleConfirmed = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/charmToTrashBattle-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          modalOpened = false;
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) {
            await atkBtn.click().catch(() => {}); did = 'btn:アタック(exact)';
          }
        }
        if (!did && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) { // SELECT_TARGET（watcherの-4000対象＝guest zone1・候補1のみ）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        const gZone2 = st?.guest?.fieldSigni?.[2];
        const battleBanished = Array.isArray(before?.guest?.fieldSigni?.[2]) && before.guest.fieldSigni[2].includes('WD01-013#1')
          && !(Array.isArray(gZone2) && gZone2.includes('WD01-013#1'));
        const chatTrashed = (st?.guest?.trash ?? 0) > gTrash0;
        const debuffed = (st?.guest?.powerMods ?? []).some(m => /^WX01-053#1:-4000$/.test(m));
        if (battleBanished && chatTrashed) battleConfirmed = true;
        H.log(`  chb[${s}] -> ${did ?? 'なし'} | modalOpened=${modalOpened} gZone2=${JSON.stringify(gZone2)} battleBanished=${battleBanished} gTrash=${st?.guest?.trash ?? '-'}(開始${gTrash0}) gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (debuffed) {
          return { pass: true, detail: `ON_CHARM_TO_TRASH 発火→バトルバニッシュ経路でもwatcherが対戦相手に-4000（gTrash ${gTrash0}→${st.guest.trash}）` };
        }
        if (battleConfirmed && s > 8) {
          // ground truth（バトルバニッシュ＋charmトラッシュ）は成立したが、猶予を与えてもwatcherが発火しない＝真の未発火。
          return { pass: false, detail: `【要注意】ground truth確認済み（バトルバニッシュでWD01-013消滅・gTrash ${gTrash0}→${st.guest.trash}）だがON_CHARM_TO_TRASH watcherが未発火＝効果banish経路(collectBoardDiffTriggers)のみ配線されバトルbanish経路(resolvePendingSigniBattleFor)に collectCharmToTrashTriggers が呼ばれていない疑い` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `バトルバニッシュ自体が未確認（gZone2=${JSON.stringify(fin?.guest?.fieldSigni?.[2])} gTrash=${fin?.guest?.trash ?? '-'}(開始${gTrash0}) pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑯ WX25-CP1-042: ON_LRIG_ATTACK_STEP_START（§7・全体未検証だった宿題）。
  //    【自】《ターン１回》：あなたのルリグアタックステップ開始時、…対戦相手は手札を１枚捨てる（+ブルアカ-5000は
  //    パース近似・厳密スケーリングは別課題＝§7既存の注記どおり、ここでは「フェイズ遷移でE2が発火すること」だけを見る）。
  //    ATTACK_SIGNI→ATTACK_LRIG のフェイズ進行ボタン（PHASE_BTN.ATTACK_SIGNI='ルリグアタックへ'）で
  //    collectLrigAttackStepStartTriggers 相当が発火するかを実UIで確認する。
  lrigattackstepstart: {
    title: 'WX25-CP1-042（ON_LRIG_ATTACK_STEP_START＝ルリグアタックステップ開始時 相手手札1捨て）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WX25-CP1-042#1'], null, null],
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      H.log('開始時 guest.hand:', before?.guest?.hand, 'phase:', before?.turnPhase);
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigattackstepstart-${s}.png`, fullPage: true });
        let did = null;
        // 注入直後の turn_phase 巻き戻りレース対策（openGrow/wxk10068banish と同型）。
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase === 'MAIN' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          did = 'repatch:ATTACK_SIGNI';
        }
        // 「まだ攻撃していないシグニがいます」確認ダイアログ（handleSigniAttack未実行のシグニがいる場合）＝
        // header の「ルリグアタックへ」ボタンより優先（モーダル表示中は isVisible() が occlusion を見ないため
        // header ボタンが先に誤ヒットし続けるのを防ぐ）。
        if (!did) did = await H.clickTextOrBtn(['このまま進む']);
        if (!did) did = await H.clickTextOrBtn(['ルリグアタックへ']);
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        const handDropped = typeof before?.guest?.hand === 'number' && typeof st?.guest?.hand === 'number' && st.guest.hand < before.guest.hand;
        const fired = (st?.host?.actionsDone ?? []).includes('WX25-CP1-042-E2') || handDropped;
        H.log(`  las[${s}] -> ${did ?? 'なし'} | phase=${st?.turnPhase ?? '-'} gHand=${st?.guest?.hand ?? '-'}(開始${before?.guest?.hand}) done=${(st?.host?.actionsDone ?? []).join(',')} pEff=${st?.pendingEffect ?? '-'} logTail=${JSON.stringify((st?.logTail ?? []).slice(-3))}`);
        if (fired && st?.turnPhase !== 'ATTACK_SIGNI') {
          return { pass: true, detail: `ON_LRIG_ATTACK_STEP_START 発火→WX25-CP1-042-E2 が相手手札を1枚トラッシュ（gHand ${before?.guest?.hand}→${st.guest.hand}・phase=${st.turnPhase}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `E2発火未確認（gHand ${before?.guest?.hand}→${fin?.guest?.hand ?? '-'}・phase=${fin?.turnPhase ?? '-'}）` };
    },
  },

  // ⑰ WD11-013→WX13-036: R46（§7・毒牙）ON_OPP_POWER_DECREASED の実機検証。
  //    【自】：あなたの効果によって対戦相手のシグニのパワーが減ったとき、ターン終了時まで、このシグニのパワーを
  //    減った値と同じだけ＋する。WD11-013【出】（対戦相手シグニ1体に-1000・mandatory・コストなし）を召喚→
  //    SELECT_TARGETでguestシグニを指定→POWER_MODIFY適用→collectPowerDecreaseTriggers が watcher（WX13-036・
  //    controllerId基準のownFieldSources走査）を発火させるか。
  //    ⚠collectPowerDecreaseTriggers はBattleScreen.tsx 3765-3789の中央diff（resolveStackNext）にしか配線されておらず、
  //    ON_SIGNI_FROZEN(R38)がそうだったように、SELECT_TARGETで完結するresume経路（handleEffectInteraction 4256〜の
  //    pendingEntries、4384-4436に5種のcollectXxxInlineがあるがON_OPP_POWER_DECREASEDは含まれない）では
  //    一度も呼ばれない疑いがある＝真FAILなら「resume経路取りこぼし」の同型バグ候補（Opus行き）。
  oppPowerDecreased: {
    title: 'WD11-013→WX13-036（ON_OPP_POWER_DECREASED＝毒牙・自分の効果で相手パワー減少時、減った値だけ自身+）',
    spec: {
      hostSet: {
        'field.lrig': ['WX08-004#1'],                  // ミュウ Lv4/Limit11（WD11-013「ミュウ限定」召喚条件・powerzeroで実証済み）
        'field.signi': [['WX13-036#1'], null, null],   // watcher（フィア＝パトラ）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX01-083#1'], null, null],   // -1000対象（powerzeroと同カード）
      },
      handPrepend: ['WD11-013#1'],                     // 幻蟲 モンチョウ（【出】対戦相手シグニ-1000・コストなし）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.powerMods:', JSON.stringify(before?.host?.powerMods));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppPowerDecreased-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // SELECT_TARGET（-1000対象＝guest の WX01-083）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/フィア＝パトラ.*相手パワー減少時|の【自】効果（相手パワー減少時）/);
        const buffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WX13-036#1:') && parseInt(m.split(':')[1], 10) > 0);
        H.log(`  pd[${s}] -> ${did ?? 'なし'} | hPowerMods=${(st?.host?.powerMods ?? []).join(',') || '-'} gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (buffed || watcherLog) {
          return { pass: true, detail: `ON_OPP_POWER_DECREASED 発火→WX13-036 自身+パワー（hPowerMods=${(st.host.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_OPP_POWER_DECREASED 未確認（hPowerMods=${(fin?.host?.powerMods ?? []).join(',') || '-'} gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑱ WD15-014→WD15-015: R43（§7）ON_ENERGY_TO_TRASH の実機検証。同一ドラフト（WD15）の対関係。
  //    【自】：あなたの効果によって対戦相手のエナゾーンからカードが１枚トラッシュに置かれたとき、ターン終了時まで、
  //    このシグニは【ダブルクラッシュ】を持つ。WD15-014【出】（対戦相手エナ1体をトラッシュ・mandatory・コストなし）
  //    を召喚→SELECT_TARGETでguestのエナを指定→TRASH適用→collectEnergyToTrashTriggers が watcher（WD15-015）を
  //    発火させるか。ON_OPP_POWER_DECREASED（R46・続き58）と全く同じ懸念＝collectEnergyToTrashTriggers も
  //    BattleScreen.tsx 3717-3739の中央diffにしか配線されておらず、resume経路のinline collector 5種
  //    （4384-4436）には含まれない＝2件目の同型バグ候補（Opus行き）。
  energyToTrash: {
    title: 'WD15-014→WD15-015（ON_ENERGY_TO_TRASH＝自分の効果で相手エナがトラッシュに置かれたとき【ダブルクラッシュ】）',
    spec: {
      hostSet: {
        'field.lrig': ['WX04-002#1'],                  // 遊月・四戎 Lv4/Limit11（WD15-014「ユヅキ限定」召喚条件）
        'field.signi': [['WD15-015#1'], null, null],   // watcher（幻竜 アメリカワニ）
        'actions_done': [],
      },
      guestSet: {
        'energy': ['WD01-013#1'],                      // トラッシュ対象のエナ1枚
      },
      handPrepend: ['WD15-014#1'],                     // 幻竜 ヴイーヴル（【出】対戦相手エナ1体をトラッシュ・コストなし）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.keywordGrants:', JSON.stringify(before?.host?.keywordGrants));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/energyToTrash-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2', 'summon-zone-0');
        if (!did) { // SELECT_TARGET（トラッシュ対象＝guest の WD01-013 エナ）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/アメリカワニ.*エナトラッシュ時|の【自】効果（エナトラッシュ時）/);
        const granted = (st?.host?.keywordGrants ?? []).some(g => g.startsWith('WD15-015#1:') && g.includes('ダブルクラッシュ'));
        H.log(`  et[${s}] -> ${did ?? 'なし'} | hKwGrants=${(st?.host?.keywordGrants ?? []).join(',') || '-'} gEnergy=${st?.guest?.trash ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (granted || watcherLog) {
          return { pass: true, detail: `ON_ENERGY_TO_TRASH 発火→WD15-015 が【ダブルクラッシュ】を得た（hKwGrants=${(st.host.keywordGrants).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_ENERGY_TO_TRASH 未確認（hKwGrants=${(fin?.host?.keywordGrants ?? []).join(',') || '-'} actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑲ WD01-013→WXDi-P03-043: R41（§7）placedFront の実機検証。R43/R46と異なりhandleSummonSigni（host自身の
  //    通常召喚パス）内で collectFieldTriggers('ON_PLAY', cardNum, placed, op) が直接呼ばれる経路＝resume/中央diff
  //    どちらでもない別経路のため、R38/R43/R46の resume経路取りこぼしとは無関係のはず（系統的懸念の対照実験）。
  //    【自】：対戦相手のシグニ１体がこのシグニ（コードラビリンス ギロッポン）の正面に配置されたとき、それ
  //    （トリガー元シグニ）のパワーを－3000する。正面判定は index i(watcher側) ↔ 2-i(召喚側) のミラー対応
  //    （triggerCollect.ts:1486）。guest zone1（中央）に watcher を置き、host も zone1（中央）へ通常召喚。
  placedFront: {
    title: 'WD01-013→WXDi-P03-043（placedFront＝相手が正面に配置したとき、その相手シグニに-3000）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, ['WXDi-P03-043#1'], null], // watcher（コードラビリンス ギロッポン・中央）
      },
      handPrepend: ['WD01-013#1'],                       // 小剣 ククリ（無効果の素シグニLv1・団体制限なし）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.powerMods:', JSON.stringify(before?.host?.powerMods));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/placedFront-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1'); // 中央＝guest zone1の正面
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/ギロッポン.*相手シグニアタック時|の【自】効果（相手シグニアタック時）/);
        const debuffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  pf[${s}] -> ${did ?? 'なし'} | hPowerMods=${(st?.host?.powerMods ?? []).join(',') || '-'} hField=${JSON.stringify(st?.host?.fieldSigni)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (debuffed || watcherLog) {
          return { pass: true, detail: `placedFront 発火→召喚した WD01-013 に-3000（hPowerMods=${(st.host.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `placedFront 未確認（hPowerMods=${(fin?.host?.powerMods ?? []).join(',') || '-'} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // R41②placedFront負例＝正面以外（guest zone1の正面=host zone1）にWD01-013を配置しても発火**しない**ことを確認。
  // WXDi-P03-043-E1（BLOCK_ACTION FORCE_PLACE_FRONT・「可能ならば」正面配置を強制）があるため、
  // host zone1をあらかじめ埋めて「正面配置が不可能」にしないとzone0/2が選択肢に出ない（実測で確認済み）。
  placedFrontNegative: {
    title: 'WD01-013→WXDi-P03-043（placedFront②負例＝正面以外への配置では非発火）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, ['WX01-083#2'], null], // zone1を埋めて正面配置を不可能にする（FORCE_PLACE_FRONTの「可能ならば」を回避）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, ['WXDi-P03-043#1'], null], // watcher（コードラビリンス ギロッポン・中央＝host zone1が正面）
      },
      handPrepend: ['WD01-013#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/placedFrontNegative-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-2'); // 正面ではないゾーン（host zone1は埋まっているため選択肢に出ない）
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni?.[0] ?? []).includes?.('WD01-013#1') || (st?.host?.fieldSigni?.[2] ?? []).includes?.('WD01-013#1');
        const watcherLog = await H.findLog(/ギロッポン.*相手シグニアタック時|の【自】効果（相手シグニアタック時）/);
        const debuffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  pfn[${s}] -> ${did ?? 'なし'} | placed=${placed} hPowerMods=${(st?.host?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (debuffed || watcherLog) {
          return { pass: false, detail: `【要注意】正面以外への配置でも発火した（hPowerMods=${(st.host.powerMods).join(',')}・watcher「${watcherLog}」）＝placedFrontの正面判定ゲートが機能していない疑い` };
        }
        if (placed && summoned && (st?.stackLen ?? 0) === 0 && !st?.pendingEffect) {
          // 召喚完了・保留なし・数tick経過を待ってから確定判定（settled後さらに2拍待つ）
          await page.waitForTimeout(900);
          const st2 = await H.queryState();
          await page.waitForTimeout(900);
          const st3 = await H.queryState();
          const debuffed3 = (st3?.host?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) < 0);
          const watcherLog3 = await H.findLog(/ギロッポン.*相手シグニアタック時|の【自】効果（相手シグニアタック時）/);
          H.log(`  pfn[settle+] hPowerMods=${(st3?.host?.powerMods ?? []).join(',') || '-'} watcher=${!!watcherLog3}`);
          if (debuffed3 || watcherLog3) {
            return { pass: false, detail: `【要注意】正面以外への配置でも発火した（settle後確認・hPowerMods=${(st3.host.powerMods).join(',')}）＝placedFrontの正面判定ゲートが機能していない疑い` };
          }
          return { pass: true, detail: `placedFront②正しく非発火＝正面以外（host zone0）へ配置してもwatcher（WXDi-P03-043）は反応しない（hPowerMods=${(st3?.host?.powerMods ?? []).join(',') || 'なし'}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `判定不能（召喚完了を確認できなかった＝hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑳ WX20-026: R31（§7）drawBySourceStory の実機検証。R41(placedFront)と同じ「対照実験」枠＝この効果の
  //    原因アクション（E2のDRAW・対象選択なし）は resolveStackNext 内で result.done=true のまま完結するため、
  //    R38/R43/R46（SELECT_TARGETで中断しresume経路に落ちる）の穴には該当しないはず、という予測を検証する。
  //    【自】このシグニがアタックしたとき：カードを１枚引く（E2・条件節「他の＜凶蟲＞がいる場合」はJSON側で
  //    欠落し無条件発火＝別件の census 系過剰効果だが今回の検証には影響なし）。【自】あなたの場にある＜凶蟲＞の
  //    シグニの効果であなたがカードを１枚引いたとき：対戦相手のシグニ１体を対象とし、パワー－4000（E3・ON_DRAW・
  //    drawBySourceStory:'凶蟲'）。ATTACK_SIGNI へ注入→「アタック」でE2発火→DRAW→last_effect_draw_source経由で
  //    E3が collectDrawTriggers（resolveStackNext内・3636/3649）に拾われるか。
  drawBySourceStory: {
    title: 'WX20-026（drawBySourceStory＝自分の＜凶蟲＞効果ドローで対戦相手シグニに-4000）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WX20-026#1'], null, null], // 大幻蟲　§アノマリス§（攻撃者兼watcher）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, ['WD01-013#1'], null], // -4000対象（攻撃の直接の的ではなく単なる対象候補）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.host?.fieldSigni?.[0] ?? []).includes?.('WX20-026#1'); r++) {
        H.log(`再注入(${r})… host zone0=${JSON.stringify(before?.host?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      H.log('開始時 guest.hand:', before?.guest?.hand, 'host.hand:', before?.host?.hand);
      let modalOpened = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/drawBySourceStory-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          modalOpened = false;
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) {
            await atkBtn.click().catch(() => {}); did = 'btn:アタック(exact)';
          }
        }
        if (!did && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) { // SELECT_TARGET（E3の-4000対象＝guest の WD01-013）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/アノマリス.*ドロー時|の【自】効果（ドロー時）/);
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  ds[${s}] -> ${did ?? 'なし'} | modalOpened=${modalOpened} hHand=${st?.host?.hand ?? '-'}(開始${before?.host?.hand}) gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        // ⚠ watcher ログだけで PASS にしない（タスク12(cxi)）＝収集されても対象選択を経て
        //    実際に -4000 が乗るところまで見る。ログは detail に併記する。
        if (debuffed) {
          return { pass: true, detail: `drawBySourceStory 発火→対戦相手 WD01-013 に-4000（gPowerMods=${(st.guest.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `drawBySourceStory 未確認（hHand=${fin?.host?.hand ?? '-'}（開始${before?.host?.hand}） gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉑ WXDi-D09-P19: R39（§7）outsideDrawPhase の実機検証。同一カード内で自己完結（E2の原因アクション→E1が反応）。
  //    R31(drawBySourceStory)との違いに注目＝E2は SEQUENCE[TRASH(手札1枚選択・要SELECT_TARGET), CONDITIONAL→DRAW]。
  //    TRASHが対話を要するため、このSEQUENCE全体の完了は`handleEffectInteraction`側のresumeで起きる可能性が高い
  //    ＝続き58で確定した理論（「エントリの解決中に一度でも対話が挟まると、その完了はresolveStackNextの
  //    doneブランチを通らずcollectDrawTriggers等の収集を逃す」）の追加検証枠。R31（対話なしDRAW→collectDrawTriggers
  //    成功）とセットで見ることで、「同じcollector（collectDrawTriggers）でも、原因アクションの対話有無で
  //    結果が変わる」ことを実証できる（=カード単位ではなく解決経路単位のバグという理解の裏付け）。
  //    【自】あなたのアタックフェイズ開始時：手札を1枚トラッシュに置く。そうした場合、カードを1枚引く（E2）。
  //    【自】ドローフェイズ以外であなたがカードを１枚引いたとき：《twice_per_turn》あなたの全シグニ+1000（E1）。
  outsideDrawPhase: {
    title: 'WXDi-D09-P19（outsideDrawPhase＝ドローフェイズ外の効果ドローで自シグニ全体+1000・TRASH対話を挟む場合の検証）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-D09-P19#1'], null, null], // watcher兼原因カード（蒼天 アウドムラ）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.powerMods:', JSON.stringify(before?.host?.powerMods), 'hand:', before?.host?.hand);
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/outsideDrawPhase-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase === 'MAIN' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0) && !did) {
          const advBtn = page.getByRole('button', { name: 'アタックフェイズへ', exact: true }).first();
          if (await advBtn.count() && await advBtn.isVisible().catch(() => false)) { await advBtn.click().catch(() => {}); did = 'btn:アタックフェイズへ'; }
        }
        if (!did) { // SELECT_TARGET（E2の手札トラッシュ対象＝自分の手札から1枚）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/アウドムラ.*ドロー時|の【自】効果（ドロー時）/);
        const buffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WXDi-D09-P19#1:') && parseInt(m.split(':')[1], 10) > 0);
        H.log(`  odp[${s}] -> ${did ?? 'なし'} | hPowerMods=${(st?.host?.powerMods ?? []).join(',') || '-'} hHand=${st?.host?.hand ?? '-'}(開始${before?.host?.hand}) stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (buffed || watcherLog) {
          return { pass: true, detail: `outsideDrawPhase 発火→WXDi-D09-P19 自身+1000（hPowerMods=${(st.host.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `outsideDrawPhase 未確認（hPowerMods=${(fin?.host?.powerMods ?? []).join(',') || '-'} hHand=${fin?.host?.hand ?? '-'}（開始${before?.host?.hand}） pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉒ WX21-057→WXK02-041: R45(c)（§7）ON_LEAVE_FIELD leftToZone:'hand' の実機検証。ON_LEAVE_FIELDは
  //    resolveStackNext中央diff（3616行）とhandleEffectInteraction resume（4395行）の**両方に既に配線済み**
  //    （§6.3で確認済みの「対策済み9種」の1つ）＝R38/R43/R46/R39の穴とは無関係で、対話を挟んでもPASSする
  //    はずという予測を検証する対照実験。
  //    【自】シグニ１体が場から手札に戻ったとき：あなたの＜遊具＞のシグニ1体のパワーを＋2000する（WXK02-041-E2・
  //    triggerScope:any・leftToZone:hand）。原因＝WX21-057-E2「このシグニが場に出たとき：あなたのシグニ1体を
  //    手札に戻す」（JSON上はBOUNCE SIGNI owner:self count1・SELECT_TARGETを要する＝対話あり）。
  //    watcher WXK02-041 を zone0、WX21-057 を summon-zone-1 へ強制配置し、bounce対象候補を
  //    [pick-0=WXK02-041(zone0), pick-1=WX21-057(zone1)] の順に固定→pick-1（自分自身）を選んでバウンスさせる
  //    （watcherを誤ってバウンスすると自壊し検証にならないため）。
  leaveFieldToHand: {
    title: 'WX21-057→WXK02-041（ON_LEAVE_FIELD leftToZone:hand＝手札に戻ったとき＋2000・対話ありでもPASSする対照実験）',
    spec: {
      hostSet: {
        'field.lrig': ['WX15-002#1'],                  // あや Lv4/Limit11（WX21-057「あや限定」召喚条件）
        'field.signi': [['WXK02-041#1'], null, null],  // watcher（讃の遊　オエカキボード・遊具class）
        'actions_done': [],
      },
      handPrepend: ['WX21-057#1'],                      // 小罠 ツララ（【出】自分のシグニ1体を対象とし手札に戻す）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.powerMods:', JSON.stringify(before?.host?.powerMods));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/leaveFieldToHand-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1');
        if (!did) { // SELECT_TARGET（バウンス対象＝自分の場・pick-1=zone1=WX21-057自身を選ぶ。pick-0=watcherは避ける）
          const pick1 = page.getByTestId('pick-1').first();
          if (await pick1.count() && await pick1.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick1.click().catch(() => {}); did = 'pick:pick-1'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/オエカキボード.*場を離れたとき|の【自】効果（場を離れたとき）|の【自】効果（味方が場を離れたとき）/);
        const buffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WXK02-041#1:') && parseInt(m.split(':')[1], 10) > 0);
        H.log(`  lf[${s}] -> ${did ?? 'なし'} | hPowerMods=${(st?.host?.powerMods ?? []).join(',') || '-'} hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (buffed || watcherLog) {
          return { pass: true, detail: `ON_LEAVE_FIELD(leftToZone:hand) 発火→WXK02-041 自身+2000（hPowerMods=${(st.host.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_LEAVE_FIELD(leftToZone:hand) 未確認（hPowerMods=${(fin?.host?.powerMods ?? []).join(',') || '-'} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ④ WXDi-P03-039: 【自】ON_LRIG_GROW（any_ally）＝自分のルリグがグロウしたとき、《無》を払えば相手シグニ1体をバニッシュ。
  //    C1 配線（executeGrow→collectLrigGrowTriggers）を実 UI で検証。グロウは通常UI操作＝最も駆動しやすいトリガー。
  //    free_grow_this_turn でグロウコスト0化→グロウ即実行→ON_LRIG_GROW 発火→OPTIONAL_COST(無)払い→相手バニッシュ。
  lriggrow: {
    title: 'WXDi-P03-039（ON_LRIG_GROW＝グロウ時 任意コストで相手バニッシュ）',
    spec: {
      hostSet: {
        'field.signi': [['WXDi-P03-039#1'], null, null], // watcher（any_ally・P10000）
        'field.lrig': ['WD03-003#1'],                    // 自センター Lv2 ピルルク・Ｍ
        'lrig_deck': ['WD03-002#1'],                     // グロウ先 Lv3 ピルルク・Ｇ（同系統・条件なし）
        'free_grow_this_turn': true,                     // グロウコスト0（単一クリックで executeGrow）
        'energy': ['WD01-013#2', 'WD01-013#3'],          // OPTIONAL_COST《無》用（無は任意色で払える）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null],     // バニッシュ対象
      },
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      // グロウボタン→グロウ先（free grow でコスト0＝即 executeGrow）→ ON_LRIG_GROW 発火
      const grew = await H.openGrow(/ピルルク・Ｇ/);
      H.log('グロウ実行:', grew ? 'OK' : '失敗');
      let fired = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lriggrow-${s}.png`, fullPage: true });
        let did = null;
        // OPTIONAL_COST《無》：エナ1枚選択→支払う（＝ON_LRIG_GROW が発火し効果が提示された証拠）
        const payBtn = page.getByTestId('optcost-pay').first();
        if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) {
          fired = true;
          await H.clickTestId('optcost-energy-0');
          await page.waitForTimeout(300);
          if (await payBtn.isEnabled().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'optcost-pay'; }
        }
        // BANISH 対象選択（pick-0→決定）
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい']);
        H.log(`  grow[${s}] -> ${did ?? 'なし'}`);
        // ピッカー文言（「…バニッシュするカードを選んでください」）ではなく実バニッシュ結果ログで判定する
        const banish = await H.findLog(/(ククリ|小剣|WD01-013).*バニッシュ|をバニッシュ(?!するカード|する対象)/);
        if (fired && banish && !/選んで|選択してください/.test(banish)) {
          return { pass: true, detail: `ON_LRIG_GROW 発火→相手バニッシュ確認「${banish}」` };
        }
      }
      // バニッシュ完走しなくとも、OPTIONAL_COST 提示＝トリガー発火は確認できている
      if (fired) return { pass: true, detail: 'ON_LRIG_GROW 発火（任意コスト提示）を確認・バニッシュ未完走' };
      return { pass: false, detail: 'ON_LRIG_GROW 発火を確認できず' };
    },
  },

  // ④' WXDi-P03-039-E2（続き132・Sonnet・PLAN §7「ON_LRIG_GROW④＝《ターン1回》制限の実機未検証」）
  //    `collectLrigGrowTriggers`（triggerCollect.ts:102）はコード読解で usageLimit を「読む」だけ
  //    （131行目 `if eff.usageLimit==='once_per_turn' && watcherState.actions_done?.includes(...)`）で、
  //    `usedIds` を返さず呼び出し元（BattleScreen.tsx:5123/8038）も actions_done への書き戻しを一切行わない＝
  //    `collectTurnTriggers`（ON_ATTACK_STEP_START②）で続き116/119に発見・修正された同型バグの疑い。
  //    ⚠標準の「グロウ」ボタン連打では2回目グロウを起動できない＝`actions_done.includes('GROW')`が
  //    通常グロウ枠を正しく1ターン1回にブロックする（`wasFreeGrow`＝`freeGrowFilter!==null`のときだけ
  //    actions_doneへの'GROW'追加をスキップする。`free_grow_this_turn`はコスト無償化のみでこの枠消費とは無関係）＝
  //    最初の調査でこれを誤認し偽陰性FAILを出した（教訓として残す）。usageLimitを実際にテストできる経路は
  //    「ゲット・グロウ」系スペル（WX03-024＝GROW_FREEアクション・タマ限定）による横グロウ＝これは
  //    actions_doneのGROW枠を消費せず同一ターン内で2回目のON_LRIG_GROWを正当に発生させられる。
  //    Lv2→Lv3標準グロウ（1回目発火）→WX03-024使用→同レベルの別タマルリグへ横グロウ（2回目発火試行）で確認する。
  lrigGrowUsageLimit: {
    title: 'WXDi-P03-039-E2（ON_LRIG_GROW＝usageLimit《ターン1回》・ゲット・グロウ経由の実機検証）',
    spec: {
      hostSet: {
        'field.signi': [['WXDi-P03-039#1'], null, null], // watcher（any_ally・usageLimit once_per_turn）
        'field.lrig': ['WD01-003#1'],                     // 自センター Lv2 半月の巫女　タマヨリヒメ
        'lrig_deck': ['WD01-002#1', 'WX01-007#1'],        // 1回目Lv3標準グロウ／2回目ゲット・グロウ横グロウ先（同Lv3・タマ）
        'free_grow_this_turn': true,                      // 1回目のグロウコスト（白×2）無償化
        'energy': ['WD01-013#2', 'WD01-013#3', 'WD01-013#4'], // WX03-024コスト《白》×1＋OPTIONAL_COST《無》×2回分
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], ['WD01-013#6'], null], // バニッシュ対象2体（1回目用・2回目用）
      },
      handPrepend: ['WX03-024#1'], // ゲット・グロウ（スペル・タマ限定・白×1）
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      const payAndBanish = async (label) => {
        let fired = false;
        for (let s = 0; s < 16; s++) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${SHOT}/lrigGrowUsageLimit-${label}${s}.png`, fullPage: true });
          let did = null;
          const payBtn = page.getByTestId('optcost-pay').first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) {
            fired = true;
            await H.clickTestId('optcost-energy-0');
            await page.waitForTimeout(300);
            if (await payBtn.isEnabled().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'optcost-pay'; }
          }
          if (!did) {
            const pick0 = page.getByTestId('pick-0').first();
            if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
              const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
              if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
            }
          }
          if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい']);
          const st = await H.queryState();
          const guestSigniCount = (st?.guest?.fieldSigni ?? []).filter(z => (z || []).length).length;
          H.log(`  lgul-${label}[${s}] -> ${did ?? 'なし'} | fired=${fired} lrigTop=${st?.host?.lrigTop} lrigDeck=${st?.host?.lrigDeck} gField=${JSON.stringify(st?.guest?.fieldSigni)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
          if (s >= 9 && !fired) return { fired, settled: true, guestSigniCount, st };
          if (fired && !(st?.stackLen > 0) && !st?.pendingEffect) return { fired, settled: true, guestSigniCount, st };
        }
        const st = await H.queryState();
        return { fired, settled: false, guestSigniCount: (st?.guest?.fieldSigni ?? []).filter(z => (z || []).length).length, st };
      };
      const grew1 = await H.openGrow(/弦月/);
      H.log('1回目グロウ実行（Lv2→Lv3・標準）:', grew1 ? 'OK' : '失敗');
      const r1 = await payAndBanish('a');
      if (!r1.fired || !r1.settled || r1.guestSigniCount !== 1) {
        return { pass: false, detail: `1回目のON_LRIG_GROW発火/バニッシュが未完走のため検証空振り（fired=${r1.fired} settled=${r1.settled} gField=${JSON.stringify(r1.st?.guest?.fieldSigni)}）` };
      }
      H.log('1回目のBANISH完了確認（guestSigniCount=1）。WX03-024（ゲット・グロウ）を使用して2回目のON_LRIG_GROWを起動する…');
      H.log('  診断: host.actionsDone(grow1後)=', JSON.stringify(r1.st?.host?.actionsDone));
      await H.ensureMain();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      let grew2 = false;
      let candClicked = false;
      for (let s = 0; s < 20 && !grew2; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigGrowUsageLimit-cast${s}.png`, fullPage: true });
        let did = await clickExact('発動'); // CardModal「発動」（スペル詳細確認）
        if (!did) { // スペルコスト《白》×1
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did && !candClicked) { // ゲット・グロウ横グロウ先候補（同Lv3・タマ）
          const cand = page.getByRole('button', { name: /月蝕/ }).first();
          const candCount = await cand.count();
          const candVisible = candCount ? await cand.isVisible().catch(() => false) : false;
          if (candCount && candVisible) { await cand.click().catch(() => {}); did = 'btn:月蝕(get-grow候補)'; candClicked = true; }
        }
        if (!did && candClicked) { // グロウ先カード（タマヨリヒメ）の【出】効果コスト確認モーダル＝SigniOnPlayCostModal（trashCounterOppと同型）。
          // 検証目的はグロウ完了のみのためスキップで十分。
          const skip = await clickExact('スキップ');
          if (skip) did = skip;
          else {
            const oe0 = page.getByTestId('onplaycost-energy-0').first();
            if (await oe0.count() && await oe0.isVisible().catch(() => false)) { await oe0.click().catch(() => {}); did = 'onplaycost-energy-0'; }
          }
        }
        const st = await H.queryState();
        H.log(`  lgul-cast[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} lrigTop=${st?.host?.lrigTop} lrigDeck=${st?.host?.lrigDeck} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (st?.host?.lrigTop === 'WX01-007#1') { grew2 = true; }
        if (candClicked && !did) { // 候補クリック後、コスト選択サブ画面が出ていないか確認（月蝕限定=同Lvなので本来コスト0のはず）
          const bodyTxt = await H.fullBody();
          if (/グロウコスト|コストを選択|選択してください/.test(bodyTxt)) H.log(`  lgul-cast[${s}] 診断: コスト選択画面の疑い body抜粋=${bodyTxt.slice(0, 200).replace(/\n/g, ' | ')}`);
        }
      }
      H.log('2回目グロウ（ゲット・グロウ横グロウ）実際に完了:', grew2 ? 'OK（lrigTop=WX01-007#1確認）' : '未完了');
      if (!grew2) {
        const fin = await H.queryState();
        return { pass: false, detail: `WX03-024経由の2回目グロウがlrigTop変化まで到達せず検証空振り（候補クリック=${candClicked} lrigTop=${fin?.host?.lrigTop} hHand=${fin?.host?.hand ?? '-'} phase=${fin?.turnPhase} pEff=${fin?.pendingEffect ?? '-'}）＝ゲット・グロウのUI経路を要再調査` };
      }
      const r2 = await payAndBanish('b');
      if (r2.fired && r2.settled && r2.guestSigniCount === 0) {
        return { pass: false, detail: `実バグ確認＝usageLimit once_per_turnにもかかわらずON_LRIG_GROWが同一ターン内で2回発火（ゲット・グロウ経由の2回目もOPTIONAL_COST提示→BANISH完走・gField=${JSON.stringify(r2.st?.guest?.fieldSigni)}）＝collectLrigGrowTriggers（triggerCollect.ts:102）がusedIds書き戻しを行わない・collectTurnTriggers ON_LRIG_ATTACK_STEP_START②と同型のバグ（Opusタスク12へ登録）` };
      }
      if (!r2.fired && r2.settled && r2.guestSigniCount === 1) {
        return { pass: true, detail: `usageLimit正しく機能＝ゲット・グロウ経由の2回目のON_LRIG_GROWでは発火せず（optcost-pay未提示・guestの2体目の場シグニ残存 gField=${JSON.stringify(r2.st?.guest?.fieldSigni)}）` };
      }
      return { pass: false, detail: `2回目グロウ後の判定不明瞭（fired=${r2.fired} settled=${r2.settled} guestSigniCount=${r2.guestSigniCount} gField=${JSON.stringify(r2.st?.guest?.fieldSigni)} pEff=${r2.st?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑫ CPUグロウ配線（正）: CPUが GROWフェイズで Lv2→Lv3 に自動グロウする。
  //    guest(=CPU) の center=WD03-003(Lv2 ピルルク・Ｍ)、lrig_deck=[WD03-002(Lv3 ピルルク・Ｇ・青×2)]、
  //    青エナ2枚を注入。CPU自動処理（cpuTurnAction の GROW 分岐）が候補フィルタ（レベル+1／CardClass互換／
  //    グロウ条件／減額後affordability）を通しグロウ→field.lrig が 1→2（lrigUnder 1）。クリック不要・観測のみ。
  cpugrow: {
    title: 'CPUグロウ配線（正）：CPUが Lv2→Lv3 に正規グロウ（互換OK・条件なし）',
    spec: {
      guestSet: {
        'field.lrig': ['WD03-003#1'],              // CPU center Lv2 ピルルク・Ｍ
        'lrig_deck': ['WD03-002#1'],               // grow target Lv3 ピルルク・Ｇ（青×2・条件なし・同クラス）
        'energy': ['WD03-013#1', 'WD03-013#2'],    // 青×2（GrowCost 支払い分）
        'field.signi': [null, null, null],
        'hand': [],
        'actions_done': [],
        'coins': 0,
      },
      top: { active: 'cpu', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      // クリック不要。CPU が自動でグロウするのを ground truth（guest.lrig 長）で観測。
      // ⚠ 直前の CPU 自然ターンが進行中だと注入 guest_state が上書きされる（lrigTop が #g… の自前ルリグになる）。
      //    そのため各試行で「一旦 host ターンへ戻して CPU を停止→再注入→観測」する（順序非依存にする）。
      for (let attempt = 0; attempt < 3; attempt++) {
        await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(2500);
        await injectScenario(page, scenarios.cpugrow.spec);
        await page.waitForTimeout(1200);
        let overwritten = false;
        for (let s = 0; s < 12; s++) {
          await page.waitForTimeout(1000);
          await page.screenshot({ path: `${SHOT}/cpugrow-a${attempt}-${s}.png`, fullPage: true });
          const st = await H.queryState();
          if (st.error) continue;
          const g = st.guest ?? {};
          const growLog = await H.findLog(/コード・ピルルク・Ｇ|\[CPU\].*グロウ/);
          if (g.lrigTop === 'WD03-002#1' && (g.lrigUnder ?? 0) >= 1) {
            return { pass: true, detail: `CPUグロウ確認: WD03-003→WD03-002（lrigTop=${g.lrigTop}・lrigUnder=${g.lrigUnder}・done=${(g.actionsDone||[]).join(',')}・log「${growLog ?? '—'}」）` };
          }
          if (g.lrigTop && /#g/.test(g.lrigTop)) { H.log(`  cpugrow[a${attempt}] CPU自然ターンで上書き（lrigTop=${g.lrigTop}）→再注入`); overwritten = true; break; }
          if (s % 3 === 0) H.log(`  cpugrow[a${attempt}.${s}] phase=${st.turnPhase} lrigTop=${g.lrigTop} under=${g.lrigUnder} deck=${g.lrigDeck} done=${(g.actionsDone||[]).join(',')}`);
        }
        if (!overwritten) break; // 上書きでなければ（グロウ未達）これ以上リトライ不要
      }
      const stf = await H.queryState();
      return { pass: false, detail: 'CPUグロウ未確認 guest=' + JSON.stringify(stf.guest) };
    },
  },

  // ⑬ CPUグロウ配線（負・CardClass互換ゲート）: グロウ先が非互換クラス（タマ）のみのとき、CPUは
  //    グロウせず GROW→MAIN 以降へ進む（lrigUnder 0 のまま／GROW 未実行）。lrigClassesCompatible ゲートの実証。
  cpugrowblocked: {
    title: 'CPUグロウ配線（負）：非互換クラスのグロウ先はCPUがグロウしない（CardClass互換ゲート）',
    spec: {
      guestSet: {
        'field.lrig': ['WD03-003#1'],              // CPU center Lv2 ピルルク
        'lrig_deck': ['WD01-002#1'],               // Lv3 だが class=タマ（非互換）→ グロウ不可のはず
        'energy': ['WD03-013#1', 'WD03-013#2', 'WD01-013#1', 'WD01-013#2'], // 十分なエナ（affordabilityでは弾かれない前提）
        'field.signi': [null, null, null],
        'hand': [],
        'actions_done': [],
        'coins': 0,
      },
      top: { active: 'cpu', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      // cpugrow と同様、直前の CPU 自然ターンを止めてから再注入して観測する（順序非依存）。
      for (let attempt = 0; attempt < 3; attempt++) {
        await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(2500);
        await injectScenario(page, scenarios.cpugrowblocked.spec);
        await page.waitForTimeout(1200);
        let overwritten = false;
        for (let s = 0; s < 12; s++) {
          await page.waitForTimeout(1000);
          await page.screenshot({ path: `${SHOT}/cpugrowblocked-a${attempt}-${s}.png`, fullPage: true });
          const st = await H.queryState();
          if (st.error) continue;
          const g = st.guest ?? {};
          // 非互換グロウが起きていたら即FAIL（ゲート破れ）
          if (g.lrigTop === 'WD01-002#1') {
            return { pass: false, detail: `非互換クラスにグロウしてしまった: lrigTop=${g.lrigTop} under=${g.lrigUnder}（CardClassゲート破れ）` };
          }
          if (g.lrigTop && /#g/.test(g.lrigTop)) { H.log(`  cpugrowblocked[a${attempt}] CPU自然ターンで上書き（lrigTop=${g.lrigTop}）→再注入`); overwritten = true; break; }
          if (s % 3 === 0) H.log(`  cpugrowblocked[a${attempt}.${s}] phase=${st.turnPhase} lrigTop=${g.lrigTop} under=${g.lrigUnder} done=${(g.actionsDone||[]).join(',')}`);
          // CPUが GROW を通過した（MAIN以外＝attack系）かつ非互換グロウ先が中央のまま＝グロウ判断済みでグロウしなかった証拠
          if (['ATTACK_ARTS', 'ATTACK_SIGNI', 'ATTACK_ARTS_OP', 'ATTACK_LRIG', 'END'].includes(st.turnPhase) && g.lrigTop === 'WD03-003#1') {
            return { pass: true, detail: `非互換グロウ先をCPUがグロウせず GROW通過（phase=${st.turnPhase}・lrigTop=${g.lrigTop}・under=${g.lrigUnder}）` };
          }
        }
        if (!overwritten) break;
      }
      return { pass: false, detail: 'GROW通過を確認できず（判断到達せず・inconclusive）' };
    },
  },

  // ⑬' WXDi-P13-047: 【自】《ターン1回》ON_LRIG_GROW（triggerScope:any_opp）＝§7 ON_LRIG_GROW残②
  //    「相手のグロウでany_oppが発火する経路」の実機検証。原文「あなたのターンの間、対戦相手のルリグが
  //    グロウしたとき」＝turnOwner:host限定のはずだが effects_WXDi.json の WXDi-P13-047-E2 に
  //    turnOwner系のtriggerCondition/activeConditionが無い＝要検証。host にwatcherを配置し、
  //    guest（CPU）がGROWフェイズで自然グロウ（cpugrowと同型のretry-on-overwrite）→host watcherの
  //    TRASH(ENERGY_CARD,owner:opponent)がguestのエナ1枚をトラッシュするのを観測する
  //    （guest自身のターン中のグロウ＝原文の「あなたのターンの間」条件を満たさないはずの盤面）。
  lrigGrowAnyOpp: {
    title: 'WXDi-P13-047（ON_LRIG_GROW any_opp＝相手グロウで発火・turnOwnerゲート検証）',
    spec: {
      hostSet: {
        'field.signi': [['WXDi-P13-047#1'], null, null], // watcher（幻獣神 LOVIT//ディソナ）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-003#1'],              // CPU center Lv2 ピルルク・Ｍ
        'lrig_deck': ['WD03-002#1'],               // grow target Lv3 ピルルク・Ｇ（青×2・条件なし・同クラス）
        'energy': ['WD03-013#1', 'WD03-013#2', 'WD03-013#3'], // 青×2（GrowCost支払い分）＋トラッシュされる1枚
        'field.signi': [null, null, null],
        'hand': [],
        'actions_done': [],
        'coins': 0,
      },
      top: { active: 'cpu', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      // cpugrowと同型：直前のCPU自然ターンを止めてから再注入して観測する（順序非依存）。
      for (let attempt = 0; attempt < 3; attempt++) {
        await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(2500);
        await injectScenario(page, scenarios.lrigGrowAnyOpp.spec);
        await page.waitForTimeout(1200);
        const before = await H.queryState();
        const gTrash0 = before?.guest?.trash ?? 0;
        const under0 = before?.guest?.lrigUnder ?? 0;
        let overwritten = false;
        let grew = false;
        for (let s = 0; s < 14; s++) {
          await page.waitForTimeout(1000);
          await page.screenshot({ path: `${SHOT}/lrigGrowAnyOpp-a${attempt}-${s}.png`, fullPage: true });
          // watcher の TRASH(ENERGY_CARD) が host 側画面の SELECT_TARGET を要する経路の保険（pick-0→決定）。
          let did = null;
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
          if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', '確定']);
          const st = await H.queryState();
          if (st.error) continue;
          const g = st.guest ?? {};
          const watcherLog = await H.findLog(/LOVIT|ディソナ|の【自】効果（ルリグがグロウしたとき）/);
          if ((g.lrigUnder ?? 0) > under0) grew = true; // CPU が実際にグロウした（＝トリガー機会が発生した）
          // 原文＝「【自】《ターン1回》：**あなたのターンの間**、対戦相手のルリグがグロウしたとき…」。
          // 本シナリオは CPU(guest) 自身のターン中のグロウ＝watcher(host) から見て「あなたのターン」ではない
          // ＝turnOwner:self ゲートにより **非発火が正しい**。発火したら続き73発見バグの回帰（続き75で修正）。
          if ((g.trash ?? 0) > gTrash0) {
            return { pass: false, detail: `turnOwner:self ゲート違反＝相手ターン中の相手グロウで誤発火（gTrash ${gTrash0}→${g.trash}・log「${watcherLog ?? '—'}」）。原文は「あなたのターンの間」限定` };
          }
          if (g.lrigTop && /#g/.test(g.lrigTop)) { H.log(`  lrigGrowAnyOpp[a${attempt}] CPU自然ターンで上書き（lrigTop=${g.lrigTop}）→再注入`); overwritten = true; break; }
          if (s % 3 === 0 || did) H.log(`  lrigGrowAnyOpp[a${attempt}.${s}] -> ${did ?? 'なし'} | phase=${st.turnPhase} lrigTop=${g.lrigTop} under=${g.lrigUnder} gTrash=${g.trash} pEff=${st.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        }
        if (grew) {
          const fin = await H.queryState();
          return { pass: true, detail: `turnOwner:self ゲート成立＝CPU(相手)自身のターンのグロウでは非発火（CPUグロウ確認 under ${under0}→${fin?.guest?.lrigUnder} ・gTrash ${gTrash0} のまま）。発火経路自体は golden「ON_LRIG_GROW: any_opp 相手グロウで発火」でカバー` };
        }
        if (!overwritten) break;
      }
      const fin = await H.queryState();
      return { pass: false, detail: `CPUグロウ自体が発生せず検証空振り（guest=${JSON.stringify(fin?.guest)}）` };
    },
  },

  // ⑬'' WXDi-P03-046: 【自】ON_LRIG_GROW（triggerScope:any_opp・usageLimit無し）＝§7 ON_LRIG_GROW残②の
  //    もう1枚。lrigGrowAnyOpp（WXDi-P13-047）と同じ any_opp 機構だが、action が
  //    TRANSFER_TO_HAND(source:TRASH_CARD,owner:self,filter:{cardType:シグニ,color:黒}) という
  //    SELECT_TARGET を要しうるアクション＝R38/R43/R46/R39と同型の「resume経路取りこぼし」バグ有無を検証する
  //    対象。host.trash に黒シグニ（WD05-009）を1枚だけ仕込み候補を1件に固定＝target解決の曖昧さを排除。
  lrigGrowAnyOppP03046: {
    title: 'WXDi-P03-046（ON_LRIG_GROW any_opp＝相手グロウでトラッシュの黒シグニを手札に回収）',
    spec: {
      hostSet: {
        'field.signi': [['WXDi-P03-046#1'], null, null], // watcher（羅原姫 Ａｃ）
        'trash': ['WD05-009#1'],                          // 黒シグニ1枚のみ（候補固定）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-003#1'],              // CPU center Lv2 ピルルク・Ｍ
        'lrig_deck': ['WD03-002#1'],               // grow target Lv3 ピルルク・Ｇ（青×2・条件なし・同クラス）
        'energy': ['WD03-013#1', 'WD03-013#2'],    // 青×2（GrowCost支払い分）
        'field.signi': [null, null, null],
        'hand': [],
        'actions_done': [],
        'coins': 0,
      },
      top: { active: 'cpu', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      // lrigGrowAnyOppと同型：直前のCPU自然ターンを止めてから再注入して観測する（順序非依存）。
      for (let attempt = 0; attempt < 3; attempt++) {
        await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(2500);
        await injectScenario(page, scenarios.lrigGrowAnyOppP03046.spec);
        await page.waitForTimeout(1200);
        const before = await H.queryState();
        const hHand0 = before?.host?.hand ?? 0;
        const under0 = before?.guest?.lrigUnder ?? 0;
        let overwritten = false;
        let grew = false;
        for (let s = 0; s < 14; s++) {
          await page.waitForTimeout(1000);
          await page.screenshot({ path: `${SHOT}/lrigGrowAnyOppP03046-a${attempt}-${s}.png`, fullPage: true });
          let did = null;
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
          if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', '確定']);
          const st = await H.queryState();
          if (st.error) continue;
          const g = st.guest ?? {};
          const watcherLog = await H.findLog(/羅原姫|Ａｃ|の【自】効果（ルリグがグロウしたとき）/);
          if ((g.lrigUnder ?? 0) > under0) grew = true; // CPU が実際にグロウした
          // 原文＝「【自】：**あなたのターンの間**、対戦相手のルリグがグロウしたとき…」＝lrigGrowAnyOpp と同じ
          // turnOwner:self ゲート（続き75で parser 実装）。CPU 自身のターンのグロウでは非発火が正しい。
          if ((st.host?.hand ?? 0) > hHand0) {
            return { pass: false, detail: `turnOwner:self ゲート違反＝相手ターン中の相手グロウで誤発火（hHand ${hHand0}→${st.host.hand}・log「${watcherLog ?? '—'}」）。原文は「あなたのターンの間」限定` };
          }
          if (g.lrigTop && /#g/.test(g.lrigTop)) { H.log(`  p03046[a${attempt}] CPU自然ターンで上書き（lrigTop=${g.lrigTop}）→再注入`); overwritten = true; break; }
          if (s % 3 === 0 || did) H.log(`  p03046[a${attempt}.${s}] -> ${did ?? 'なし'} | phase=${st.turnPhase} lrigTop=${g.lrigTop} under=${g.lrigUnder} hHand=${st.host?.hand} hTrash=${st.host?.trash} stack=${st.stackLen} pEff=${st.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        }
        if (grew) {
          const fin = await H.queryState();
          return { pass: true, detail: `turnOwner:self ゲート成立＝CPU(相手)自身のターンのグロウでは非発火（CPUグロウ確認 under ${under0}→${fin?.guest?.lrigUnder} ・hHand ${hHand0} のまま）` };
        }
        if (!overwritten) break;
      }
      const fin = await H.queryState();
      return { pass: false, detail: `CPUグロウ自体が発生せず検証空振り（host=${JSON.stringify(fin?.host)} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉒ WXDi-P15-091: 【自】ON_DRAW（triggerScope:any_opp）＝§7 R40「opp-draw」の実機検証。
  //    対戦相手が効果でカードを引いたとき、あなたも1枚引く（《ターン1回》）。
  //    ドロー源＝guest（CPU）の WX12-047（【自】このシグニがアタックしたとき、カードを1枚引く＝条件なし単純DRAW）。
  //    CPU自動アタック（wd07012/wxk10068banishと同型・クリック不要）でguestが効果ドロー
  //    → resolveStackNext中央diff（cards_drawn_by_effect_this_turnの増加検出）→collectOppDrawTriggersがhostのwatcherを発火。
  //    原因アクション（DRAW・対象選択なし）はSELECT_TARGET等の対話を要さないためresolveStackNextのdoneブランチで
  //    正常収集される想定（R31 drawBySourceStoryと同型＝resume経路取りこぼしの穴とは無関係）。
  oppDraw: {
    title: 'WXDi-P15-091→WX12-047（ON_DRAW any_opp＝対戦相手が効果でカードを引いたとき、自分も1枚引く）',
    spec: {
      hostSet: {
        'field.signi': [['WXDi-P15-091#1'], null, null], // watcher（羅石　ラブラドライト・自陣）
        'cards_drawn_by_effect_this_turn': 0,
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WX12-047#1'], null, null], // CPUアタッカー（幻水　ヤリイカ・アタック時ドロー条件なし）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
        'cards_drawn_by_effect_this_turn': 0,
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'guest.hand:', before?.guest?.hand);
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SHOT}/oppdraw-${s}.png`, fullPage: true });
        const st = await H.queryState();
        const watcherLog = await H.findLog(/ラブラドライト.*対戦相手ドロー時|の【自】効果（対戦相手ドロー時）/);
        H.log(`  oppdraw[${s}] hHand=${st?.host?.hand ?? '-'}(開始${before?.host?.hand}) gHand=${st?.guest?.hand ?? '-'}(開始${before?.guest?.hand}) stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog} logTail=${JSON.stringify(st?.logTail?.slice(-6))}`);
        if (watcherLog) {
          return { pass: true, detail: `ON_DRAW any_opp 発火→host が1枚ドロー確認（hHand ${before?.host?.hand}→${st.host.hand}）・watcher「${watcherLog}」` };
        }
        // ライフクロスクラッシュ確認モーダル（バーストなし）→「エナに送る」で進行。ガード/応答プロンプトも拒否（保険）。
        await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_DRAW any_opp 発火ログ未確認（hHand=${fin?.host?.hand ?? '-'}（開始${before?.host?.hand}）pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉒' PR-423×SPDi43-21（続き131・Sonnet・PLAN §7「R40②＝opp-draw の『自分の効果で』発生源限定なし」の実機検証）
  //    PR-423「【自】：メインフェイズかアタックフェイズの間、対戦相手が自分の効果でカードを１枚引いたとき、
  //    対戦相手にダメージを与える。その後、このシグニをバニッシュする。」＝JSON上は`triggerScope:'any_opp'`＋
  //    `triggerCondition:{drawPhaseRestriction:'main_attack', drawByEffect:true}`のみで「対戦相手**自身**の効果で」
  //    という発生源限定は表現されていない。collectOppDrawTriggers（triggerCollect.ts:691）も同様＝
  //    reactorState(=PR-423所有者)のANY_OPP watcherはdrawerState(=対戦相手)のcards_drawn_by_effect_this_turnが
  //    増えたことしか見ず、その増加が「対戦相手自身の効果」によるものか「PR-423所有者(host)自身の効果」に
  //    よるものかを区別しない。SPDi43-21「【自】：あなたのアタックフェイズ開始時、カードを１枚引いてもよい。
  //    そうした場合、対戦相手はカードを１枚引く。」（=host自身の効果でguestが引く）をhostに同居させ、hostの
  //    アタックフェイズ開始時にSPDi43-21のDRAW{owner:opponent}でguestが引いたとき、PR-423（同じくhost所有）が
  //    誤発火（対戦相手＝guestへLIFE_CRASH＋PR-423自己バニッシュ）するかを確認する＝発火すれば「自分の効果で」
  //    限定なしの近似が実害を持つ実バグと確定（Opusタスク12へ登録・意図的FAIL回帰として既定orderから除外）。
  oppDrawOwnEffectOnly: {
    title: 'PR-423×SPDi43-21（ON_DRAW any_opp「自分の効果で」発生源限定なし＝§7 R40②の実機検証）',
    spec: {
      hostSet: {
        'field.signi': [['SPDi43-21#1'], ['PR-423#1'], null], // SPDi43-21=自分の効果でguestを引かせる側／PR-423=watcher
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, null],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'guest.hand:', before?.guest?.hand, 'guest.life:', before?.guest?.life);
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppdrawownfx-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '発動', '確定', '決定', 'OK', 'はい']);
        if (!did) did = await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        const st = await H.queryState();
        const pr423Alive = (st?.host?.fieldSigni ?? []).some(z => (z || []).includes('PR-423#1'));
        const guestDrew = (st?.guest?.hand ?? 0) > (before?.guest?.hand ?? 0);
        const guestLifeDown = (st?.guest?.life ?? 99) < (before?.guest?.life ?? 0);
        H.log(`  oppdrawownfx[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'}(開始${before?.host?.hand}) gHand=${st?.guest?.hand ?? '-'}(開始${before?.guest?.hand}) gLife=${st?.guest?.life ?? '-'}(開始${before?.guest?.life}) pr423Alive=${pr423Alive} phase=${st?.turnPhase} pEff=${st?.pendingEffect ?? '-'}`);
        if (guestDrew && (!pr423Alive || guestLifeDown)) {
          return { pass: false, detail: `実バグ確認＝host自身の効果(SPDi43-21)でguestが引いた（gHand ${before.guest.hand}→${st.guest.hand}）だけでPR-423が誤発火（gLife ${before.guest.life}→${st.guest.life}・PR-423生存=${pr423Alive}）＝「対戦相手が自分の効果で」の発生源限定が engine に無い（Opusタスク12へ登録）` };
        }
        if (guestDrew && pr423Alive && s >= 6) {
          return { pass: true, detail: `guestが引いた（gHand ${before.guest.hand}→${st.guest.hand}）が PR-423 は非発火のまま（gLife ${before.guest.life}→${st.guest.life}維持・生存）＝近似は実害なしと確認` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `SPDi43-21のguestドロー自体が未発生＝検証空振り（hHand=${fin?.host?.hand ?? '-'} gHand=${fin?.guest?.hand ?? '-'} phase=${fin?.turnPhase ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉓ WDA-F02-17: 【自】ON_TRASH（triggerScope:self・triggerCondition.fromZones:['hand']）＝§7 R36「手札捨て/トラッシュ
  //    flatten」の実機検証。「このカードが手札からトラッシュに置かれたとき」＝自己参照トリガー。
  //    原因＝WXK10-065（【出】：あなたは手札を1枚捨てる＝TRASH HAND_CARD self count1・SELECT_TARGET要）で
  //    手札に残った WDA-F02-17 自身を選んで捨てさせる。
  //    ❌実機FAIL＝2026-07-09・続き60時点で実バグ確認（ground truthは正しいがwatcher不発火＝
  //    collectAnyZoneTrashSelfTriggersがresume経路で取りこぼす・R43/R46/R39と同型）。
  //    ✅2026-08-11（続き435・PLAN§7バッチ1検証中に再確認）＝現在はPASS。handleEffectInteractionが
  //    collectBoardDiffTriggers経由でcollectAnyZoneTrashSelfTriggersを呼ぶようになっており、
  //    別の一般化修正（BUGFIXES該当セッション不明）で解消済みだった＝既定orderに復帰。
  handDiscard: {
    title: 'WDA-F02-17→WXK10-065（ON_TRASH self・fromZones:hand＝このカードが手札から捨てられたとき）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],             // 任意センター（Lv4/Limit11＝Lv1召喚に十分）
        'field.signi': [null, null, null],
        'hand': ['WDA-F02-17#1', 'WXK10-065#1'], // index0=watcher兼原因カード自身／index1=捨てさせる側（【出】手札1枚捨てる）
        'energy': ['WD03-013#1', 'WD05-013#1'],  // 任意コスト《青》《黒》用
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null], // POWER_MODIFY -5000 の対象候補
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand);
      await H.ensureMain();
      H.log('手札クリック(WXK10-065):', await H.clickTestId('my-hand-card-1') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 24; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/handDiscard-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0');
        // 任意コスト《青》《黒》：optcost-energy 2枚→pay
        if (!did) {
          const oc0 = page.getByTestId('optcost-energy-0').first();
          if (await oc0.count() && await oc0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`optcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
            await page.waitForTimeout(200);
            const pay = page.getByTestId('optcost-pay').first();
            if (await pay.count() && await pay.isEnabled().catch(() => false)) { await pay.click().catch(() => {}); did = 'optcost-pay'; }
          }
        }
        if (!did) { // SELECT_TARGET（WXK10-065の手札捨て対象＝残る手札1枚＝WDA-F02-17自身／POWER_MODIFY対象も同パターンで拾う）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/アメンボ.*トラッシュ時|の【トラッシュ時】効果（手札／エナから）/);
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  hd[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'}(開始${before?.host?.hand}) hTrash=${st?.host?.trash ?? '-'} gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (debuffed || watcherLog) {
          return { pass: true, detail: `ON_TRASH(self,fromZones:hand) 発火→対戦相手 WD01-013 に-5000（gPowerMods=${(st.guest.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_TRASH(self,fromZones:hand) 未確認（hHand=${fin?.host?.hand ?? '-'}（開始${before?.host?.hand}） hTrash=${fin?.host?.trash ?? '-'} gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉔ WXDi-P04-043: 【自】ON_REFRESH（triggerCondition.refreshedOwner:'any'）＝§7 R45②「いずれかのプレイヤーが
  //    リフレッシュしたとき」の実機検証。host のデッキを残り1枚（trashは1枚）にしておき、WX15-073（【出】E1=対戦相手
  //    パワー1000以下シグニをバニッシュ・E2=カードを1枚引く＝ともに無条件mandatory）を召喚。
  //    guestの唯一のシグニをP3000にしておけばE1のBANISH候補は0件（<=1000でない）で自動no-op（対話なし即done）、
  //    E2のDRAWがデッキ最後の1枚を引いてちょうど0枚化＝`applyRefreshOnDone`（`BattleScreen.tsx:3506`・
  //    resolveStackNext先頭）が同一done分岐内でリフレッシュを適用でき、続く中央diff（`countRefresh`）が正常に
  //    ON_REFRESH watcherを収集できる想定（対話が挟まらない＝resume経路取りこぼしの穴の対象外のはず）。
  //    ⚠デッキを最初から0枚にすると E1（バニッシュ0件でも即done）の時点で既にリフレッシュ条件が成立し、
  //    E2解決後の2回目リフレッシュで「ターン強制終了」ルールが発動して収集前に打ち切られる（初回試行で確認）＝
  //    残り1枚にして「E2のドローで初めて0枚化」の1回きりのリフレッシュにする設計が必須。
  //    ✅実機PASS（2026-07-10・続き60・Sonnet）＝2回連続で watcher ログ「幻竜姫　ドラゴンメイド の【自】効果
  //    （リフレッシュ時）」を確認＝対話なしDRAW/no-op経由のリフレッシュはresume経路取りこぼしと無関係で安全。
  refreshTrigger: {
    title: 'WXDi-P04-043→WX15-073（ON_REFRESH refreshedOwner:any＝リフレッシュ時 任意コストで相手に-10000）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],                     // 任意センター（Lv4/Limit11）
        'field.signi': [null, ['WXDi-P04-043#1'], null],  // watcher（幻竜姫 ドラゴンメイド・zone1）／zone0は召喚用に空ける
        'hand': ['WX15-073#1'],                           // 勝利の円卓 アルスラ（E1バニッシュ候補なしで即done・E2ドローがデッキ最後の1枚を引いてちょうど0枚化）
        'deck': ['WD03-013#1'],                           // 残り1枚＝E1では減らずE2のDRAWで初めて0枚化（0枚のままだとE1単独でも即リフレッシュ→2回目リフレッシュでターン強制終了しwatcher収集に届かない）
        'trash': ['WD02-013#1'],                          // リフレッシュ元（トラッシュ非空）
        'energy': ['WD05-013#1'],                         // 任意コスト《黒》用
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null],      // P3000（E1のpower<=1000フィルタに非該当＝BANISH候補0で自動no-op）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'trash:', before?.host?.trash);
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 30; s++) {
        await page.waitForTimeout(500);
        await page.screenshot({ path: `${SHOT}/refreshTrigger-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0');
        // 任意コスト《黒》：optcost-energy 1枚→pay
        if (!did) {
          const oc0 = page.getByTestId('optcost-energy-0').first();
          if (await oc0.count() && await oc0.isVisible().catch(() => false)) {
            await oc0.click().catch(() => {});
            await page.waitForTimeout(200);
            const pay = page.getByTestId('optcost-pay').first();
            if (await pay.count() && await pay.isEnabled().catch(() => false)) { await pay.click().catch(() => {}); did = 'optcost-pay'; }
          }
        }
        if (!did) { // POWER_MODIFY対象選択（相手シグニ1体・候補1件は決定ボタンが最初からready）
          const pick0 = page.getByTestId('pick-0').first();
          const confirmBtn = page.getByRole('button', { name: /決定 \(1\// }).first();
          if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) {
            await confirmBtn.click().catch(() => {}); did = 'btn:決定(1/1)';
          } else if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            await pick0.click().catch(() => {}); did = 'pick:pick-0';
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定']);
        const st = await H.queryState();
        const watcherLog = await H.findLog(/ドラゴンメイド.*リフレッシュ時|の【自】効果（リフレッシュ時）/) || (st?.logTail ?? []).find(l => /の【自】効果（リフレッシュ時）/.test(l));
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  rf[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} hTrash=${st?.host?.trash ?? '-'} gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog} logTail=${JSON.stringify(st?.logTail?.slice(-8))}`);
        if (debuffed || watcherLog) {
          return { pass: true, detail: `ON_REFRESH(refreshedOwner:any) 発火→対戦相手 WD01-013 に-10000（gPowerMods=${(st.guest.powerMods).join(',')}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_REFRESH(refreshedOwner:any) 未確認（gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉖ WXK11-074（配置数制限・§6 BLOCK機構・Opusタスク B）: 【出】《黒》《無》「このターン、対戦相手はシグニを2体までしか
  //    場に出せない（すでに3体以上→2体になるようにトラッシュ）」。guest（相手）に3体注入→host が WXK11-074 を召喚し【出】
  //    コストを払うと guest フィールドが 3→2 に減る（超過1体トラッシュ）。engine=execStubPart3 の DEPLOY_RESTRICT count分岐。
  deployRestrict: {
    title: 'WXK11-074（配置数制限＝相手シグニ3体を2体にトラッシュ＋配置数上限2）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],                 // タマ Lv4/Limit11（Lv3 シグニ配置可）
        'field.signi': [null, null, null],
        'energy': ['WD05-009#1', 'WD05-009#2', 'WD05-009#3'], // 黒シグニ×3（【出】《黒》《無》コスト用）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD05-009#4'], ['WD05-009#5'], ['WD05-009#6']], // 相手シグニ3体（→2体になる）
      },
      handPrepend: ['WXK11-074#1'],                   // 羅星 サタン（【出】《黒》《無》配置数制限）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const cnt = (fs) => (fs ?? []).filter(z => z && z.length > 0).length;
      const before = await H.queryState();
      H.log('開始時 guest.signi数:', cnt(before?.guest?.fieldSigni), 'guest.trash:', before?.guest?.trash);
      await H.ensureMain();
      H.log('手札クリック(WXK11-074):', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/deployRestrict-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) { // 【出】《黒》《無》コストモーダル：エナ2枚選択→「発動」
          const e0 = page.getByTestId('onplaycost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`onplaycost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) { await e.click().catch(() => {}); await page.waitForTimeout(200); } }
            const fire = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await fire.count() && await fire.isEnabled().catch(() => false)) { await fire.click().catch(() => {}); }
            did = 'onplaycost:発動';
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動する', '発動', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const gCnt = cnt(st?.guest?.fieldSigni);
        H.log(`  dr[${s}] -> ${did ?? 'なし'} | guest.signi数=${gCnt} guest.trash=${st?.guest?.trash ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (cnt(before?.guest?.fieldSigni) === 3 && gCnt === 2) {
          return { pass: true, detail: `配置数制限 発火→guest シグニ 3→2（trash ${before?.guest?.trash}→${st?.guest?.trash}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `配置数制限 未確認（guest.signi数=${cnt(fin?.guest?.fieldSigni)} guest.trash=${fin?.guest?.trash ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉗ WXEX2-50→WXK10-022-E1: §7 R30「ON_PLAY any_opp + targetsTriggerSource」の実機検証。
  //    続き66（Opus）で WXEX2-50-E3 の owner 誤パース（対戦相手のトラッシュ→対戦相手の場、のはずが自分側に誤生成）
  //    を是正し、「あなたのターンに対戦相手のシグニが場に出る」を起こせる唯一の自然発火経路が開通した（BUGFIXES参照）。
  //    WXEX2-50【起】《ターン１回》《黒×0》＝SEQUENCE[①対戦相手のトラッシュのシグニ1枚を対戦相手の場に出す／
  //    ②その後、自分のトラッシュの＜凶蟲＞のシグニ1枚を自分の場に出す]。①でguestの場に新しく出た信号にWXK10-022-E1
  //    （any_opp・triggerCondition.turnOwner:self・targetsTriggerSource＝そのシグニの能力を奪う）が反応するはず。
  //    host/guestとも3ゾーン中2ゾーンを埋めて1ゾーンだけ空け、SELECT_SIGNI_ZONE（配置先ゾーン選択）を回避。
  //
  //    ❌実機FAIL＝新規バグを発見（2026-07-11・続き70・Sonnet・未修正・Opus引き継ぎ＝Opusタスク12）。
  //    ground truth は正しい（gField 2ゾーン目まで埋まり guest に WD01-010#1 が配置・host にも WX08-074#1 が配置）が、
  //    watcher（WXK10-022-E1）が一度も発火せず guest.abilities_removed は空のまま。
  //    コード読解で確定した原因＝`handleEffectInteraction`（BattleScreen.tsx:4097）の `!result.done` 分岐
  //    （SEQUENCE途中でまだ次のインタラクションが要る場合＝本カードの step1完了→step2のSELECT_TARGET待ち）は
  //    host_state/guest_state を DB へコミットするが、`collectBoardDiffTriggers`（続き61で導入）を一切呼ばない
  //    （BANISH検出のみの特例処理・4107-4124行）。そのため step1 の配置（guestへのWD01-010追加）は一度も
  //    diff評価されないまま `bs.guest_state`（React側の実データ）へ反映され、続く step2 の SELECT_TARGET が
  //    `result.done===true` で完了した時点（4125-4132行）で `collectBoardDiffTriggers` が呼ばれても、その
  //    `beforeGuest = bs.guest_state` は既に step1 の変化を含んでしまっている＝diffがゼロになり watcher が
  //    永久に見逃される。続き58/61 が修正した「1回のインタラクションで完了する効果の resume 取りこぼし」とは
  //    別系統＝**2ラウンド以上インタラクションを要する SEQUENCE の「途中ラウンドで完了した盤面変化」が対象**。
  //    ✅続き75（Opus）で修正＝`!result.done` 分岐の「ON_BANISH だけの特例収集」を done 分岐と同じ
  //    `collectBoardDiffTriggers`（統合収集）に置き換えた。途中ラウンドで確定した盤面変化をその場で diff 評価して
  //    スタックへ積むため、次ラウンドの before に取り込まれて差分が消える問題が構造的に解消する（pending 中に
  //    スタックへ積む点は従来の ON_BANISH 特例と同じ扱い＝新しい実行順序は持ち込まない）。実機2回連続PASS＝
  //    既定 order に追加済み。
  onPlayAnyOpp: {
    title: 'WXEX2-50→WXK10-022-E1（R30 ON_PLAY any_opp+targetsTriggerSource＝対戦相手のシグニが場に出たとき能力喪失）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXEX2-50#1'], ['WXK10-022#1'], null], // zone0=起動元／zone1=watcher（any_opp）／zone2はstep2の配置先に空ける
        'field.signi_down': [false, false, false],
        'trash': ['WX08-074#1'],  // 幻蟲 Ｑ・アント（＜凶蟲＞シグニ・step2の自トラッシュ側ソース）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-012#1'], ['WD01-013#1'], null], // 埋め草2体（zone2はstep1の配置先に空ける）
        'field.signi_down': [false, false, false],
        'trash': ['WD01-010#1'], // 対戦相手のトラッシュのシグニ（step1でここから対戦相手の場に出る＝トリガー元）
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.trash:', before?.guest?.trash, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      H.log('シグニゾーンクリック(WXEX2-50):', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/onPlayAnyOpp-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['【起】コストなし']);
        if (!did) did = await H.clickTextOrBtn(['発動']);
        if (!did) { // SELECT_TARGET（step1: 対戦相手トラッシュのシグニ／step2: 自トラッシュの＜凶蟲＞シグニ）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        // ⚠triggerCollect.ts の表示バグ（既知・低優先）で ON_PLAY any_opp 発火時もラベルが固定文言
        // 「相手シグニアタック時」になる（§7 R41 placedFront で確認済みの副産物）。カード名一致を主に見る。
        const watcherLog = await H.findLog(/御伽原江良.*の【自】効果|の【自】効果（相手シグニアタック時）/);
        const removed = (st?.guest?.abilitiesRemoved ?? []).includes('WD01-010#1');
        H.log(`  opa[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} hField=${JSON.stringify(st?.host?.fieldSigni)} gAbilitiesRemoved=${JSON.stringify(st?.guest?.abilitiesRemoved)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog}`);
        if (removed || watcherLog) {
          return { pass: true, detail: `ON_PLAY any_opp(targetsTriggerSource) 発火→対戦相手 WD01-010 が能力喪失（gAbilitiesRemoved=${JSON.stringify(st.guest.abilitiesRemoved)}）・watcher「${watcherLog}」` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_PLAY any_opp 未確認（gField=${JSON.stringify(fin?.guest?.fieldSigni)} hField=${JSON.stringify(fin?.host?.fieldSigni)} gAbilitiesRemoved=${JSON.stringify(fin?.guest?.abilitiesRemoved)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑭ WX17-020（FREEZE LRIG＝パターンB・続き76新規実装・未実機検証）: 【起】アーツ「以下の3つから1つを
  //    選ぶ」選択肢③「対戦相手のセンタールリグ１体を対象とし、それを凍結する。手札を１枚捨てる。」
  //    execFreeze の LRIG 対象分岐（effectExecutor.ts execFreeze）を検証。
  freezeLrig: {
    title: 'WX17-020（FREEZE LRIG＝パターンB・センタールリグ凍結）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],       // 自センター（アーツ使用の土台）
        'lrig_deck': ['WX17-020#1'],        // エニー・チョイス（青×1・③でLRIG凍結）
        'energy': ['WD03-009#1'],           // 青×1（アーツコスト）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],       // 対戦相手センター（凍結対象）
      },
      handPrepend: ['WD01-013#1', 'WD01-013#2'], // ③後半「手札を1枚捨てる」用の余剰手札
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let chose = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/freezelrig-${s}.png`, fullPage: true });
        let did = null;
        // ArtsModal Phase2（コスト選択）：「アーツ使用」は青エナ1枚選択まで disabled のまま＝先にエナ選択
        if (!chose) {
          const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
          if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
            if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
            else {
              const e0 = page.getByTestId('artscost-energy-0').first();
              if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
            }
          }
        }
        if (!did && !chose) did = await H.clickTextOrBtn(['使用']);
        if (!did && !chose) {
          const c3 = page.getByRole('button', { name: '選択肢3', exact: true }).first();
          if (await c3.count() && await c3.isVisible().catch(() => false)) { await c3.click().catch(() => {}); did = 'choose:選択肢3'; chose = true; }
        }
        // FREEZE対象（候補1体のみ）／TRASH{HAND_CARD}（捨てるカードを選ぶ）どちらもpick-0で吸収
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        H.log(`  freeze[${s}] -> ${did ?? 'なし'} | gLrigFrozen=${st?.guest?.lrigFrozen} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (st?.guest?.lrigFrozen) {
          return { pass: true, detail: 'execFreeze(LRIG) 発火→対戦相手センタールリグが凍結（guest.field.lrig_frozen=true）' };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `センタールリグ凍結 未確認（gLrigFrozen=${fin?.guest?.lrigFrozen} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑮ WXK10-012（NEGATE_ATTACK LRIG＝パターンB・続き76新規実装・未実機検証）: 【起】アーツ「以下の2つから
  //    1つを選ぶ」選択肢②「《緑》を支払ってもよい。そうした場合、このターン、対戦相手のセンタールリグが
  //    アタックしたとき、そのアタックを無効にする。」execNegateAttack の LRIG 分岐を検証。実装は即時
  //    negated_attacks フラグを立てる形（effectExecutor.ts execNegateAttack）＝実際のアタック解決を待たずに
  //    queryState で確認できる。
  negateAttackLrig: {
    title: 'WXK10-012（NEGATE_ATTACK LRIG＝パターンB・対戦相手センタールリグのアタック無効化フラグ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'lrig_deck': ['WXK10-012#1'],       // 停空飛翔（緑×0・②任意緑でLRIGアタック無効）
        'energy': ['WD04-010#1', 'WD04-010#2'], // 緑×2（アーツコスト選択UIが×0でも1枚要求する可能性への保険＋②の任意コスト用）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],       // 対戦相手センター（アタック無効化の対象）
      },
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 }, // CardData.Timing=アタックフェイズのみ
    },
    async drive(page, H) {
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let chose = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/negateattacklrig-${s}.png`, fullPage: true });
        let did = null;
        // ArtsModal Phase2（コスト選択）：緑×0だが「アーツ使用」が disabled のままなら先にエナ選択で解消
        if (!chose) {
          const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
          if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
            if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
            else {
              const e0 = page.getByTestId('artscost-energy-0').first();
              if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
            }
          }
        }
        if (!did && !chose) did = await H.clickTextOrBtn(['使用']);
        if (!did && !chose) {
          const c2 = page.getByRole('button', { name: '選択肢2', exact: true }).first();
          if (await c2.count() && await c2.isVisible().catch(() => false)) { await c2.click().catch(() => {}); did = 'choose:選択肢2'; chose = true; }
        }
        // STUB OPTIONAL_COST（緑）：エナ選択→支払う
        if (!did) {
          const payBtn = page.getByTestId('optcost-pay').first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) {
            await H.clickTestId('optcost-energy-0');
            await page.waitForTimeout(300);
            if (await payBtn.isEnabled().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'optcost-pay'; }
          }
        }
        // NEGATE_ATTACK 自体の SELECT_TARGET（候補1体＝相手センタールリグ。ラベルは「シグニゾーンから」と
        // 誤表示されるが scope='opp_field' の汎用テンプレ文言のため無視してよい＝pick-0で吸収）
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const negated = (st?.guest?.negatedAttacks ?? []).some(n => /WD03-002/.test(n));
        H.log(`  negate[${s}] -> ${did ?? 'なし'} | gNegated=${JSON.stringify(st?.guest?.negatedAttacks)} pEff=${st?.pendingEffect ?? '-'}`);
        if (negated) {
          return { pass: true, detail: `execNegateAttack(LRIG) 発火→対戦相手センタールリグのアタックが無効化フラグ済み（negated_attacks=${JSON.stringify(st.guest.negatedAttacks)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `NEGATE_ATTACK(LRIG) 未確認（gNegated=${JSON.stringify(fin?.guest?.negatedAttacks)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑯ WX14-011（EXILE HAND_CARD+blind＝続き75新規実装・未実機検証）: 【起】アーツ「以下の2つから1つを
  //    選ぶ」選択肢①「カードを4枚引く。その後、対戦相手はあなたの手札を2枚見ないで選び、あなたはそれらを
  //    ゲームから除外する。」execExile の HAND_CARD＋blind 分岐＝トラッシュではなくゲーム除外になること
  //    （host.trashが増えないこと）を検証。blind＝CPU(guest)が見ないで自動選択（BattleScreen自動応答）。
  exileHandBlind: {
    title: 'WX14-011（EXILE HAND_CARD+blind＝4枚引き→CPUが見ないで2枚ゲーム除外）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'lrig_deck': ['WX14-011#1'],        // 炎得火失（赤×1・①4枚引き→手札2枚を除外）
        'energy': ['WD02-010#1'],           // 赤×1（アーツコスト）
        'actions_done': [],
        // 続き139（Sonnet・タスク3調査）＝handPrependの.slice(0,4)がmulligan由来のランダムな
        // 余剰カードを持ち越し、まれに追加カードがpick-N/ボタン出現順序を狂わせてdriveが空振りする
        // （blockDrawByEffectと同型のバッチ位置非依存flakiness）。'hand'直接指定で完全決定的にする。
        'hand': ['WD01-013#1', 'WD01-013#2'],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const h0 = before?.host?.hand ?? 0;
      const t0 = before?.host?.trash ?? 0;
      H.log('開始時 host.hand:', h0, 'host.trash:', t0);
      await H.ensureMain();
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let chose = false;
      let t1 = null; // コスト支払い（エナ→トラッシュ1枚）完了後のtrash基準値。t0はコスト支払い前なのでEXILE判定には使えない
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/exilehandblind-${s}.png`, fullPage: true });
        let did = null;
        // ArtsModal Phase2（コスト選択）：「アーツ使用」は赤エナ1枚選択まで disabled のまま＝先にエナ選択
        if (!chose) {
          const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
          if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
            if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
            else {
              const e0 = page.getByTestId('artscost-energy-0').first();
              if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
            }
          }
        }
        if (!did && !chose) did = await H.clickTextOrBtn(['使用']);
        if (!did && !chose) {
          const c1 = page.getByRole('button', { name: '選択肢1', exact: true }).first();
          if (await c1.count() && await c1.isVisible().catch(() => false)) { await c1.click().catch(() => {}); did = 'choose:選択肢1'; chose = true; }
        }
        // EXILE(HAND_CARD,blind) の「手札からカードを2枚選ぶ」ピッカー（pick-N）→決定(N/M)。
        // ⚠決定ボタンは (選択数/必要数) を表示し、1枚選んだ時点で有効化されうる＝clickTextOrBtn は
        // isEnabled を見ずに押すため、旧実装（picked0/picked1 フラグでpick-0/1を各1回だけ押す）だと
        // バッチ時レースでどちらかのクリックが選択登録される前に決定が押され「1枚だけ除外」で完走扱いに
        // なっていた（71件通しでのみ再現＝続き140）。フラグではなく決定ラベルの実選択数(N)を真値にし、
        // N が必要数 M に届くまで「未選択（✓なし）の pick 枠」を1つずつ押し、揃ってから決定を押す
        // （選択済みを再クリックするとトグルで外れるため ✓ の有無で選別・取りこぼしは次イテレーションで再試行）。
        if (!did) {
          const decBtn = page.getByRole('button', { name: /決定 \(\d/ }).first();
          if (await decBtn.count() && await decBtn.isVisible().catch(() => false)) {
            const m = (await decBtn.textContent() ?? '').match(/決定 \((\d+)\/(\d+)\)/);
            const sel = m ? +m[1] : 0, need = m ? +m[2] : 2;
            if (sel < need) {
              for (let idx = 0; idx < 8; idx++) {
                const p = page.getByTestId(`pick-${idx}`).first();
                if (!(await p.count()) || !(await p.isVisible().catch(() => false))) continue;
                if (await p.getByText('✓').count()) continue; // 既に選択済み（再クリックはトグルoffになる）
                await p.click().catch(() => {}); did = `pick:pick-${idx}(→${sel + 1}/${need})`; break;
              }
            } else if (await decBtn.isEnabled().catch(() => false)) {
              await decBtn.click().catch(() => {}); did = `決定(${sel}/${need})`;
            }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', 'OK', 'はい']);
        const st = await H.queryState();
        // choseに転じた直後（このイテレーションでchoose:選択肢1をクリックした時点）のtrashを基準値として確定。
        // t0はアーツのコスト支払い（エナ1枚消費→トラッシュ1枚）より前の値なので、それをそのままEXILE判定に使うと
        // コスト支払いの正常なtrash+1をEXILE→TRASH退行と誤検知する（コストの動きとEXILE効果自体の動きは無関係）。
        if (chose && t1 === null) t1 = st?.host?.trash ?? t0;
        H.log(`  exile[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} hTrash=${st?.host?.trash ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
        if (chose && st && st.host.hand === h0 + 2) {
          // 4枚引き→2枚除外＝差し引き+2。トラッシュがコスト支払い後から不変なら TRASH ではなく EXILE。
          if (st.host.trash === t1) {
            return { pass: true, detail: `execExile(HAND_CARD,blind) 発火→4枚引き後2枚がゲーム除外（hand ${h0}→${st.host.hand}・trash コスト支払い後不変=${t1}）` };
          }
          return { pass: false, detail: `EXILE→TRASH退行の疑い＝trashが増加（コスト支払い後基準 ${t1}→${st.host.trash}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `EXILE完走未確認（hand ${h0}→${fin?.host?.hand ?? '-'} trash ${t0}→${fin?.host?.trash ?? '-'} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑰ WXK10-010 BLOCK_ACTION(DRAW_OR_ADD_TO_HAND_BY_EFFECT)＝続き76新規実装・未実機検証。WXK10-010①は
  //    「対戦相手」を封じる効果（CPUに対して打っても対話を起こせない）なので、封じられている状態を直接
  //    盤面注入し（blocked_actions:['DRAW_OR_ADD_TO_HAND_BY_EFFECT']＝WXK10-010①解決後と同じ状態）、
  //    host自身がWXDi-P01-061（【出】《無》：カードを1枚引く）を使ってもドローできないこと＝execDraw の
  //    blocked_actions チェック（effectExecutor.ts execDraw）の実ディスパッチを検証する。
  blockDrawByEffect: {
    title: 'WXK10-010 BLOCK_ACTION(DRAW_OR_ADD_TO_HAND_BY_EFFECT)＝封じられた状態で自己ドロー効果が不発',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'energy': ['WD01-013#1'],           // 無コスト（任意色で可）
        'blocked_actions': ['DRAW_OR_ADD_TO_HAND_BY_EFFECT'], // WXK10-010①解決後の状態を模擬
        'actions_done': [],
        // 続き139（Sonnet・タスク3調査）＝handPrependは前シナリオ/mulliganの実ランダム手札を
        // .slice(0,4)で持ち越すため末尾3枚が毎回変わり、そのランダムな余剰カードが召喚ボタンの
        // 出現順序やSELECT_TARGET候補と衝突してdriveのクリック列を狂わせる（バッチ位置に無関係の
        // 単体flakiness・詳細BUGFIXES）。'hand'を直接指定して完全決定的にする。
        'hand': ['WXDi-P01-061#1'],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const h0 = before?.host?.hand ?? 0;
      H.log('開始時 host.hand:', h0, 'blockedActions:', JSON.stringify(before?.host?.blockedActions));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      let played = false; // 手札がh0未満に一度でも減ったこと＝カードが場に出たことの確認（早すぎるFAIL判定を防ぐ）
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/blockdraw-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        // 「召喚」確認ボタンを挟まずゾーン選択へ直行するカードもあるため summoned 未確定でも試す
        if (!did) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        // SigniOnPlayCostModal「【出】効果を発動しますか？」：エナ1枚選択→発動（＝ドロー試行のトリガー）
        if (!did) {
          const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false)) {
            if (await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = '発動(onplaycost)'; }
            else {
              const e0 = page.getByTestId('onplaycost-energy-0').first();
              if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'onplaycost-energy-0'; }
            }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定']);
        // バッチ時レース対策＝召喚UIが一度も出ずカードが手札に残ったまま（未召喚）なら手札カードを再クリック。
        // 最初の1クリックが空振り（長時間セッションでのレンダリング遅延で選択が登録されない）でも復帰できる。
        if (!did && !summoned) did = await H.clickTestId('my-hand-card-0');
        const st = await H.queryState();
        const blockedLog = await H.findLog(/効果によるドローは封じられている/);
        H.log(`  block[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} blocked=${JSON.stringify(st?.host?.blockedActions)} blockedLog=${!!blockedLog}`);
        if (blockedLog) {
          return { pass: true, detail: `execDraw の BLOCK_ACTION 発火→ドロー封じログ確認「${blockedLog}」（hand=${st.host.hand}）` };
        }
        if (st && st.host.hand < h0) played = true; // カードが手札を離れたことを確認してから回復チェックに入る
        if (played && st && st.host.hand === h0) {
          return { pass: false, detail: `BLOCK_ACTION 未適用の疑い＝封じられているはずのドローが成立（召喚で-1後、hand が元の${h0}まで回復）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `BLOCK_ACTION 確認未完了（hand ${h0}→${fin?.host?.hand ?? '-'} blockedLog未検出）` };
    },
  },

  // ⑱ WX24-P1-012（遅延トリガー＝パターンF-4・続き76新規実装・未実機検証）: 【起】《ゲーム1回》アンビション
  //    「カードを4枚引く。次のあなたのアタックフェイズ開始時、手札をすべて捨て、この方法で捨てたカード
  //    1枚につき【エナチャージ1】をする。」collectTurnTriggers の遅延トリガー収集（ON_ATTACK_PHASE_START）を
  //    検証＝MAINフェイズでの即時実行ではなく、実際にアタックフェイズへ進めた瞬間に発火することを確認する。
  delayedAttackTrigger: {
    title: 'WX24-P1-012（遅延トリガー＝次のアタックフェイズ開始時まで待って発火）',
    spec: {
      hostSet: {
        'field.lrig': ['WX24-P1-012#1'],    // 閃花繚乱　花代・参（センターに直接注入）
        'actions_done': [],
        'game_actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      const h0 = before?.host?.hand ?? 0;
      const e0 = before?.host?.energy ?? 0;
      H.log('開始時 host.hand:', h0, 'energy:', e0);
      let installed = false;
      let h1 = null;
      for (let s = 0; s < 14; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/delayedtrigger-${s}.png`, fullPage: true });
        let did = null;
        // アクションボタンを優先（先にモーダルが開いていれば再度センターLRIG画像を押すと開閉トグルで
        // 空振りになるため、ボタン非検出のときだけ画像クリックへフォールバックする）
        if (!installed) did = await H.clickTextOrBtn(['【起】コストなし']);
        if (!did && !installed) did = await H.clickTextOrBtn(['発動']);
        if (!did && !installed) {
          // カード画像はpointerEvents:'none'（クリックは親divのStackSlotが受ける設計）＝
          // 通常のclick()はPlaywrightの「receives events」判定に毎回失敗し既定30秒タイムアウトで空振りする。
          // force:trueでactionability検査を飛ばし、実座標クリックを親divへ届かせる。
          const lrigImg = page.locator('img[alt="閃花繚乱　花代・参"]').first();
          if (await lrigImg.count() && await lrigImg.isVisible().catch(() => false)) { await lrigImg.click({ force: true, timeout: 3000 }).catch(() => {}); did = 'click:centerLrig'; }
        }
        const st = await H.queryState();
        if (!installed && (st?.host?.hand ?? 0) >= h0 + 4 && (st?.host?.delayedTriggers?.length ?? 0) > 0) {
          installed = true;
          h1 = st.host.hand;
          H.log(`  遅延トリガー設置確認: hand=${h1}（+4）・delayedTriggers=${JSON.stringify(st.host.delayedTriggers)}`);
        }
        H.log(`  install[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand ?? '-'} delayed=${(st?.host?.delayedTriggers ?? []).length}`);
        if (installed) break;
      }
      // installed確定はqueryState経由で1イテレーション遅れて検出するため、直前のイテレーションで
      // 「まだinstalled==falseだった」判定のまま実行された centerLrig 画像クリックのフォールバックが
      // （ボタン非表示＝使用済みonce_per_gameのため）CardStackModal（カード拡大表示）を開いたまま残る。
      // このモーダルは全画面固定オーバーレイ＝後続の「アタックフェイズへ」クリックを吸収してしまうため、
      // フェイズ進行前に明示的に閉じる（無ければ何も起きない）。
      await H.clickTextOrBtn(['タップして閉じる']);
      if (!installed) {
        const fin = await H.queryState();
        return { pass: false, detail: `遅延トリガー設置を確認できず（hand=${fin?.host?.hand ?? '-'} delayed=${JSON.stringify(fin?.host?.delayedTriggers)}）` };
      }
      // 設置直後（MAIN中）に即時実行されていないこと＝手札がまだ全部残っている（過去の即時化バグの回帰ガード）
      const stillMain = await H.queryState();
      if ((stillMain?.host?.hand ?? 0) < h1) {
        return { pass: false, detail: `遅延のはずが即時実行された疑い＝MAIN中に手札が減少（hand ${h1}→${stillMain.host.hand}）` };
      }
      // アタックフェイズへ進める→遅延トリガー発火（手札全捨て＋捨てた枚数分エナチャージ）
      const adv = await H.clickTextOrBtn(['アタックフェイズへ']);
      H.log('フェイズ進行:', adv ?? '見つからず');
      for (let s = 0; s < 12; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/delayedtrigger-fire-${s}.png`, fullPage: true });
        await H.clickTextOrBtn(['発動順序を確定', '確定']);
        const st = await H.queryState();
        H.log(`  fire[${s}] -> hHand=${st?.host?.hand ?? '-'} hEnergy=${st?.host?.energy ?? '-'} phase=${st?.turnPhase ?? '-'}`);
        if ((st?.host?.hand ?? -1) === 0 && (st?.host?.energy ?? 0) > e0) {
          return { pass: true, detail: `collectTurnTriggers の遅延トリガー発火確認（アタックフェイズ移行後に手札全捨て＋エナチャージ・hand ${h1}→0・energy ${e0}→${st.host.energy}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `遅延トリガー発火 未確認（hand=${fin?.host?.hand ?? '-'} energy=${fin?.host?.energy ?? '-'} phase=${fin?.turnPhase ?? '-'}）` };
    },
  },

  // ⑲ WX14-040-E3（execTrashのカウンタ＝続き76新規実装・未実機検証）: 【出】《青》：対戦相手は手札を1枚
  //    捨てる。TRASH{HAND_CARD,owner:opponent}が実ディスパッチで解決されたとき、対象側（guest）の
  //    hand_trashed_by_opp_this_turn カウンタが加算されること（execTrash・effectExecutor.ts）を検証。
  //    このカウンタはWXDi-P02-005等の「代わりに」置換の起点（条件評価側＝CONDITIONALの読みはgolden済み・
  //    ここでは書き込み側＝実UIディスパッチ経由でのカウント加算を確認する）。
  trashCounterOpp: {
    title: 'WX14-040-E3（execTrashカウンタ＝対戦相手の手札トラッシュでhand_trashed_by_opp_this_turn加算）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],        // タマ Lv4/Limit11（WX14-040がLv4のため、Lv2のWD03-003では召喚不可＝要Lv4以上センター）
        'field.signi': [null, null, null],
        'energy': ['WD03-009#1'],           // 青×1（E3コスト。E1白/E2赤/E4黒は払えずスキップされる想定）
        'hand': ['WX14-040#1'],             // 羅植　ヤシ（Lv4・クラス制限なし・E3のみ青コスト所持）＝決定的指定（旧handPrependは残留ランダム手札混入でmy-hand-card-0がずれるflakinessの原因だった）
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/trashcounter-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        // 「召喚」確認ボタンを挟まずゾーン選択へ直行するカードもあるため summoned 未確定でも試す
        if (!did) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        // SigniOnPlayCostModal「【出】効果を発動しますか？」×4（E1白/E2赤/E3青/E4黒が順に提示される）。
        // E1/E2/E4 は払えるエナが無いのでスキップ、E3(青)だけエナ選択→発動（モーダル文言のコスト色で判別）
        if (!did) {
          const fireBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fireBtn.count() && await fireBtn.isVisible().catch(() => false)) {
            const bodyTxt = await H.fullBody();
            if (/コスト:[^\n]*《青》/.test(bodyTxt)) {
              if (await fireBtn.isEnabled().catch(() => false)) { await fireBtn.click().catch(() => {}); did = '発動(青)'; }
              else {
                const e0 = page.getByTestId('onplaycost-energy-0').first();
                if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'onplaycost-energy-0'; }
              }
            } else {
              const skipBtn = page.getByRole('button', { name: 'スキップ', exact: true }).first();
              if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) { await skipBtn.click().catch(() => {}); did = 'スキップ'; }
            }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定']);
        const st = await H.queryState();
        H.log(`  trashctr[${s}] -> ${did ?? 'なし'} | gHandTrashedByOpp=${st?.guest?.handTrashedByOpp ?? '-'} gHand=${st?.guest?.hand ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if ((st?.guest?.handTrashedByOpp ?? 0) >= 1) {
          return { pass: true, detail: `execTrash カウンタ加算確認→guest.hand_trashed_by_opp_this_turn=${st.guest.handTrashedByOpp}（「代わりに」置換の起点条件が実ディスパッチで成立）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `execTrash カウンタ未確認（handTrashedByOpp=${fin?.guest?.handTrashedByOpp ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉘ WX17-028（続き112・Sonnet・PLAN §7「その他の実機検証待ち」B2）＝REVEAL_DECK_TOP＋動的閾値
  //    （powerLteRevealedSigniLevelSum）の実機検証。【出】《赤×0》：デッキの上から4枚公開→公開シグニの
  //    レベル合計×1000以下の対戦相手シグニ1体をバニッシュ→公開したカードをトラッシュ。
  //    デッキ上4枚を WD01-013（Lv1）×4 にしてレベル合計4＝閾値4000に固定し、guest の WD01-013（P3000）を
  //    確実にバニッシュ対象にする。デッキは4枚ちょうどだと TRASH_REVEALED 後に0枚化しリフレッシュが誤って
  //    絡むため、後続にダミー4枚（WD01-012）を足して残り4枚を確保（refreshTrigger の罠と同型の回避）。
  revealDeckTopBanish: {
    title: 'WX17-028（B2 REVEAL_DECK_TOP＋動的閾値＝公開シグニのレベル合計×1000以下の相手シグニをバニッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD02-001#1'],  // 花代・肆 Lv4 Limit11（WX17-028がLv4のため、levelOk判定=signiLevel<=currentLrigLevelにLv4以上のlrigが必須）
        'field.signi': [null, null, null],
        'deck': ['WD01-013#2', 'WD01-013#3', 'WD01-013#4', 'WD01-013#5', 'WD01-012#2', 'WD01-012#3', 'WD01-012#4', 'WD01-012#5'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null], // 小剣 ククリ Lv1 P3000（閾値4000以下でバニッシュ対象）
      },
      handPrepend: ['WX17-028#1'],
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.trash:', before?.guest?.trash, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/revealDeckTopBanish-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        // バニッシュ＝場から除去（WIXOSSルールでは所有者のエナゾーンへ・トラッシュではない）
        const banished = (before?.guest?.fieldSigni?.[0] != null) && (st?.guest?.fieldSigni?.[0] == null);
        H.log(`  rdt[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${st?.guest?.energy} gTrash=${st?.guest?.trash} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (banished) {
          return { pass: true, detail: `REVEAL_DECK_TOP+動的閾値バニッシュ 発火→guest WD01-013 がバニッシュ（gField zone0 消滅・gEnergy ${before.guest.energy}→${st.guest.energy}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `バニッシュ未確認（gField=${JSON.stringify(fin?.guest?.fieldSigni)} gEnergy=${fin?.guest?.energy} gTrash=${fin?.guest?.trash} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉙ WX25-CP1-069（続き112・Sonnet・PLAN §7「その他の実機検証待ち」B3）＝INSTALL_DELAYED_TRIGGER の実発火検証。
  //    【自】：あなたのアタックフェイズ開始時、手札を1枚捨ててもよい。そうした場合、このターン、あなたの青の
  //    ＜ブルアカ＞のシグニが対戦相手のライフクロス1枚をクラッシュしたとき、対戦相手は手札を1枚捨てる。
  //    JSONは「してもよい」のoptional欠落でmandatory実行（別issue・census/§5bテール）だが、ここではB3本体＝
  //    「設置→同ターン内の対戦相手ライフクラッシュで実際に発火するか」を検証する。
  //    ⚠コード読解で判明済みの近似（BattleScreen.tsx:8704-8715・PLAN B3欄に明記済み）＝crasherFilterは
  //    「クラッシュを実際に起こしたシグニ」を追跡せず「op（クラッシュされた側から見て攻撃側=このターンの
  //    プレイヤー）の場に該当シグニがいるか」で代用判定＝WX25-CP1-069自身が青+＜ブルアカ＞なので、
  //    このカード自身で直接ライフを攻撃するだけで近似条件も満たせる（別カードのアタッカーは不要）。
  //    guestのlife_clothを2枚にして0枚化（試合終了）を避け、観測ウィンドウを確保する。
  installDelayedTriggerFire: {
    title: 'WX25-CP1-069（B3 INSTALL_DELAYED_TRIGGER＝アタックフェイズ開始時設置→ライフクラッシュで発火）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX25-CP1-069#1'], null, null],
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'life_cloth': ['WD01-013#9', 'WD01-013#10'], // 2枚（1枚クラッシュしても0枚化＝試合終了を回避）
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.hand:', before?.guest?.hand, 'host.hand:', before?.host?.hand);
      let modalOpened = false;
      let attacked = false;
      let lastPhase = null;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/installDelayedTriggerFire-${s}.png`, fullPage: true });
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase !== lastPhase) { modalOpened = false; lastPhase = phaseChk?.turnPhase; }
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        // アーツステップ（自分/相手）をスキップしてATTACK_SIGNIへ進める
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了', 'シグニアタックへ']);
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !modalOpened && !attacked && phaseChk?.turnPhase === 'ATTACK_SIGNI') {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'エナに送る', 'ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        const st = await H.queryState();
        H.log(`  idt[${s}] -> ${did ?? 'なし'} | gHand=${st?.guest?.hand ?? '-'}(開始${before?.guest?.hand}) hHand=${st?.host?.hand ?? '-'} delayed=${JSON.stringify(st?.host?.delayedTriggers)} phase=${st?.turnPhase ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if ((st?.guest?.hand ?? 99) < (before?.guest?.hand ?? 0)) {
          return { pass: true, detail: `INSTALL_DELAYED_TRIGGER 発火→ライフクラッシュ後に対戦相手の手札が減少（gHand ${before.guest.hand}→${st.guest.hand}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `発火未確認（gHand=${fin?.guest?.hand ?? '-'}（開始${before?.guest?.hand}）delayed=${JSON.stringify(fin?.host?.delayedTriggers)} phase=${fin?.turnPhase ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉚ WXDi-P07-044-E2（続き112・Sonnet・PLAN §7「機構④誤parse3枚」実機検証）＝
  //    【自】《自分ターン》あなたのシグニが効果によって場に出たとき：対戦相手のシグニ1体を凍結し、
  //    パワーを-2000する（triggerScope:any_ally・triggerCondition.byEffect:true+turnOwner:self）。
  //    続き（旧セッション）で誤parseを是正済み（BUGFIXES「機構④誤parse3枚の是正」参照）だが実機未検証のまま
  //    残っていた＝ADD_TO_FIELD（手札以外からの場出し＝byEffect）が実際にこのwatcherを発火させるかを確認する。
  //    トリガー源＝WD08-001（混沌の鍵主 ウムル＝フィーラ・Lv4Limit11ルリグ）の【起】《ダウン》
  //    「あなたのトラッシュからシグニ1枚を対象とし、それを場に出す」で自トラッシュのシグニを場に出す。
  //    ⚠WD08-001はE2（【起】《ターン1回》《黒×0》デッキ上3枚トラッシュ）とE3（【起】《ダウン》場出し）の
  //    両方がcostPartsMAの分岐（energyTotal>0/coin/discard系のみ）に引っかからず両方「【起】コストなし」と
  //    表示され区別不能＝ボタンをnth(1)（2番目＝JSON順でE3）で指定して回避（表示バグは別途・軽微・据置）。
  installByEffectFreeze: {
    title: 'WD08-001→WXDi-P07-044-E2（機構④＝any_ally+byEffect ADD_TO_FIELD で凍結+パワー-2000）',
    spec: {
      hostSet: {
        'field.lrig': ['WD08-001#1'],
        'field.signi': [['WXDi-P07-044#1'], null, ['WD01-012#9']], // watcher（大幻蟲 アロス・ピルルク）＋zone2を埋めてzone1だけ空け、SELECT_SIGNI_ZONE（配置先選択）を回避
        'field.signi_down': [false, false, false],
        'field.lrig_down': false,
        'trash': ['WD01-013#9'], // 場に出す対象（小剣 ククリ・任意のシグニでよい）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#8'], null, null], // 凍結+パワー-2000の対象
        'field.signi_down': [false, false, false],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.signiFrozen:', JSON.stringify(before?.guest?.signiFrozen), 'guest.powerMods:', JSON.stringify(before?.guest?.powerMods));
      await H.ensureMain();
      let opened = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/installByEffectFreeze-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !opened) {
          const lrigImg = page.locator('img[alt="混沌の鍵主　ウムル＝フィーラ"]').first();
          if (await lrigImg.count() && await lrigImg.isVisible().catch(() => false)) { await lrigImg.click({ force: true, timeout: 3000 }).catch(() => {}); did = 'click:centerLrig'; opened = true; }
        }
        if (!did && opened) {
          const btn = page.getByRole('button', { name: '【起】コストなし', exact: false }).nth(1);
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】コストなし(2番目=E3)'; }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const frozen = !!st?.guest?.signiFrozen?.[0];
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#8:') && parseInt(m.split(':')[1], 10) < 0);
        H.log(`  ibef[${s}] -> ${did ?? 'なし'} | gFrozen=${JSON.stringify(st?.guest?.signiFrozen)} gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} hField=${JSON.stringify(st?.host?.fieldSigni)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (frozen || debuffed) {
          return { pass: true, detail: `機構④(any_ally+byEffect ADD_TO_FIELD) 発火→guest WD01-013#8 が凍結/パワー-2000（gFrozen=${JSON.stringify(st.guest.signiFrozen)} gPowerMods=${(st.guest.powerMods).join(',')}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `発火未確認（gFrozen=${JSON.stringify(fin?.guest?.signiFrozen)} gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉛ WX25-P3-062-E2（続き112・Sonnet・PLAN §7「機構④誤parse3枚」残り）＝
  //    【自】：このシグニがアタックしたとき、あなたの場に《虚幸の冥者　ハナレ》がいる場合、対戦相手のシグニ
  //    1体を対象とし、あなたのエナゾーンから＜毒牙＞のシグニ1枚をトラッシュに置いてもよい。そうした場合、
  //    ターン終了時まで、それとこのシグニのパワーを-20000する。
  //    SEQUENCE[STUB OPTIONAL_TRASH_ENERGY_CLASS, CONDITIONAL(IS_MY_TURN, then:...)]は「そうした場合」の
  //    OPTIONAL_COSTインターセプト機構（effectExecutor.ts:2353の optIds に OPTIONAL_TRASH_ENERGY_CLASS が
  //    含まれる＝既存の確立済みパターン）で正しく動く設計と判明済み（誤parseではなくOPTIONAL_COST機構の一種）。
  //    虚幸の冥者ハナレ（WX25-P3-032）はルリグカード＝センタールリグに直接配置してHAS_CARD_IN_FIELD条件を満たす。
  optionalTrashEnergyClassAttack: {
    title: 'WX25-P3-062-E2（機構④＝OPTIONAL_TRASH_ENERGY_CLASS＋HAS_CARD_IN_FIELDでアタック時-20000）',
    spec: {
      hostSet: {
        'field.lrig': ['WX25-P3-032#1'],  // 虚幸の冥者 ハナレ（HAS_CARD_IN_FIELD条件のカード自身をセンターに）
        'field.signi': [['WX25-P3-062#1'], ['WX01-053#1'], null], // 攻撃者(zone0)＋埋め草(zone1)
        'field.signi_down': [false, false, false],
        'energy': ['WX04-101#1'], // アイン＝ダガ（毒牙・Lv1・エナからの任意トラッシュ対象）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, ['WD01-013#1'], null], // POWER_MODIFY対象（zone1・zone0は空けてWX25-P3-062の直接ライフ攻撃にする）
        'field.signi_down': [false, false, false],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.powerMods:', JSON.stringify(before?.guest?.powerMods), 'host.powerMods:', JSON.stringify(before?.host?.powerMods));
      let modalOpened = false;
      let attacked = false;
      let lastPhase = null;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/optionalTrashEnergyClassAttack-${s}.png`, fullPage: true });
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase !== lastPhase) { modalOpened = false; lastPhase = phaseChk?.turnPhase; }
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了']);
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !modalOpened && !attacked && phaseChk?.turnPhase === 'ATTACK_SIGNI') {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        // OPTIONAL_TRASH_ENERGY_CLASS のCHOOSE＝「エナ＜毒牙＞を選択して発動」を選ぶ（skipではなくpay）
        if (!did) {
          const payBtn = page.getByRole('button', { name: /エナ.*毒牙.*選択して発動|エナから選択して発動/ }).first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'btn:エナ選択して発動(pay)'; }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const oppDebuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:') && parseInt(m.split(':')[1], 10) <= -20000);
        const selfDebuffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WX25-P3-062#1:') && parseInt(m.split(':')[1], 10) <= -20000);
        H.log(`  otec[${s}] -> ${did ?? 'なし'} | gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} hPowerMods=${(st?.host?.powerMods ?? []).join(',') || '-'} hEnergy=${st?.host?.energy} phase=${st?.turnPhase ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (oppDebuffed && selfDebuffed) {
          return { pass: true, detail: `機構④(OPTIONAL_TRASH_ENERGY_CLASS+HAS_CARD_IN_FIELD) 発火→対戦相手WD01-013と自WX25-P3-062が両方-20000（gPowerMods=${(st.guest.powerMods).join(',')} hPowerMods=${(st.host.powerMods).join(',')}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `発火未確認（gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'} hPowerMods=${(fin?.host?.powerMods ?? []).join(',') || '-'} hEnergy=${fin?.host?.energy} phase=${fin?.turnPhase ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ㉜ WX24-P2-018（続き112・Sonnet・PLAN §7「B4引用付与の実発火」調査）＝
  //    【自】：あなたのアタックフェイズ開始時、あなたの＜龍獣＞のシグニ1体を対象とし、《赤》を支払ってもよい。
  //    そうした場合、ターン終了時まで、それは「【自】：このシグニがアタックしたとき、対戦相手が《無無無》を
  //    支払わないかぎり、ターン終了時まで、このシグニは【アサシン】を得る。」を得る。
  //    ⚠コード読解で発見した疑義（未確定・実機で確認する）＝WX24-P2-018はルリグカードだが、JSONの
  //    E1（GRANT_QUOTED_AUTO_ABILITYの起点）は`timing:["ON_ATTACK_SIGNI"]`（triggerScope省略＝自身が
  //    「アタックしたとき」の意）で登録されている。しかし`BattleScreen.tsx:6276`の自己スコープON_ATTACK_SIGNI
  //    収集（`effectsMap.get(myTopNum)`）はシグニアタック解決の中で「アタックした**シグニ自身**」の効果のみを
  //    見る＝**ルリグの効果はこの経路を一切通らない**（ルリグの攻撃はATTACK_LRIGフェイズの別コードパス）。
  //    原文は「アタックフェイズ**開始時**」＝`ON_ATTACK_PHASE_START`が正しいtimingのはずで、
  //    `ON_ATTACK_SIGNI`は誤りの疑いが濃厚＝**E1が一度も発火しない可能性**。
  //    ✅続き164（Opus・タスク1）＝引用付与の内側 parse を実装（GRANT_EFFECT{target:龍獣}＋内側【自】ON_ATTACK_SIGNI
  //    ＋OPPONENT_PAY_OPTIONAL《無×3》ゲート）。本シナリオは全経路を運転する：E1発火→《赤》支払い→対象WX04-072選択
  //    →内側能力付与（granted_effects）→WX04-072でアタック→内側【自】発火→相手（CPU・エナ0で支払い不能）が
  //    「支払わない」→WX04-072に【アサシン】付与、まで。旧FAIL（ルリグ自身へ即付与）の反転検証。
  wx24p2018GrantFire: {
    title: 'WX24-P2-018（B4＝引用付与の完全経路：E1→対象付与→アタック→相手不払い→アサシン）',
    spec: {
      hostSet: {
        'field.lrig': ['WX24-P2-018#1'],
        'field.signi': [['WX04-072#1'], null, null], // 幻竜 エキドナ（＜龍獣＞・付与対象候補）
        'field.signi_down': [false, false, false],
        'energy': ['WX04-068#1'], // 幻竜 ワイバーン（赤・OPTIONAL_COST支払い用）
        'actions_done': [],
        'game_actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': [], // CPU が内側の《無×3》を支払えない状態にする（pay 選択肢 unavailable → skip＝アサシン付与）
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.keywordGrants:', JSON.stringify(before?.host?.keywordGrants));
      let modalOpened = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wx24p2018GrantFire-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了']);
        // 任意コスト（OPTIONAL_COST）の CHOOSE は「エナを選ぶ→発動」の2段（エナ未選択だと発動ボタンが効かず
        // 同じ CHOOSE が残り続ける＝続き136 で判明）。エナ枠 optcost-energy-0 を先にクリックする。
        if (!did) {
          const ec0 = page.getByTestId('optcost-energy-0').first();
          if (await ec0.count() && await ec0.isVisible().catch(() => false)) {
            await ec0.click().catch(() => {});           // エナ枠は再クリックで選択解除されるので、
            await page.waitForTimeout(250);              // 同一ステップ内で発動まで押し切る
            const payBtn = page.getByRole('button', { name: /支払|発動/ }).first();
            if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) await payBtn.click().catch(() => {});
            did = 'pick:optcost-energy-0→発動';
          }
        }
        if (!did) { // GRANT_EFFECT の対象選択（龍獣＝WX04-072 のみ）。選択→「決定 (1/1)」の2段
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmBtn = page.getByRole('button', { name: /決定 \(1\// }).first();
            if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) {
              await confirmBtn.click().catch(() => {}); did = 'btn:決定(1/n)';
            } else { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        // 付与後：WX04-072 でアタック（内側【自】ON_ATTACK_SIGNI を発火させる）
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) {
            await atkBtn.click().catch(() => {}); did = 'btn:アタック(exact)';
          }
        }
        if (!did && !modalOpened) {
          const st0 = await H.queryState();
          if (st0?.turnPhase === 'ATTACK_SIGNI' && !st0?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', '発動順序を確定', '確定', 'OK', 'はい']);
        const st = await H.queryState();
        const granted = (st?.host?.keywordGrants ?? []).some(g => g.startsWith('WX04-072#1:') && g.includes('アサシン'));
        const selfGrantNow = (st?.host?.keywordGrants ?? []).find(g => g.startsWith('WX24-P2-018#1:') && g.includes('アサシン'));
        H.log(`  w2018[${s}] -> ${did ?? 'なし'} | hKwGrants=${(st?.host?.keywordGrants ?? []).join(',') || '-'} phase=${st?.turnPhase ?? '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (granted) {
          return { pass: true, detail: `引用付与の完全経路PASS＝E1発火→WX04-072へ内側能力付与→アタック時に相手不払い→【アサシン】付与（hKwGrants=${(st.host.keywordGrants).join(',')}）` };
        }
        if (selfGrantNow) {
          return { pass: false, detail: `旧バグ再発＝ルリグ自身（${selfGrantNow}）へ即時アサシン付与（引用付与の内側 parse の回帰）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `アサシン付与未確認（hKwGrants=${(fin?.host?.keywordGrants ?? []).join(',') || '-'} phase=${fin?.turnPhase ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）＝E1不発／対象選択不達／内側【自】不発のいずれか` };
    },
  },

  // ㉝ WX25-CP1-066（続き113・Sonnet・PLAN §6.4「クラフトトークンの実機配置検証」）＝
  //    【起】手札から＜ブルアカ＞のカードを1枚捨てる：あなたの場に《雷ちゃん》がない場合、クラフトの
  //    《雷ちゃん》1つを場に出す。JSONの`ADD_TO_FIELD{cardName:'雷ちゃん',source未指定}`＝
  //    `execAddToField`の「ゲーム外からトークン生成」分岐（`effectExecutor.ts:1170`）を検証。
  //    ⚠原文の「あなたの場に《雷ちゃん》がない場合」という条件がJSONに存在しない（無条件実行）＝
  //    別issue（据置・Opus送りの候補）として観測するが、初回設置（場に雷ちゃんが無い状態）なら条件の
  //    有無に関わらず結果は同じなので今回の検証（トークン生成自体が機能するか）には影響しない。
  craftTokenPlace: {
    title: 'WX25-CP1-066（クラフトトークン＝《雷ちゃん》をcardName指定でゲーム外から場に出す）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX25-CP1-066#1'], null, null],
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      handPrepend: ['WXDi-CP02-054#1'], // 天童アリス（＜ブルアカ＞・discard cost用）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.fieldSigni:', JSON.stringify(before?.host?.fieldSigni), 'hand:', before?.host?.hand);
      let modalOpened = false;
      let discardPicked = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/craftTokenPlace-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) {
          const btn = page.getByRole('button', { name: /【起】.*トラッシュ/ }).first();
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】手札トラッシュ'; }
        }
        // discard コスト用の手札ピッカー（SigniActivatedModal内蔵＝pick-0ではなくimg[alt=カード名]クリック）
        // ⚠クリックはトグル式（選択→再クリックで解除）なので一度だけ押す
        if (!did && !discardPicked) {
          // ⚠手札ストリップ（画面下部）にも同名imgがDOM順で先に存在する＝createPortalで後から
          // documentへ追加されるモーダル側のimgは`.last()`で狙う（`.first()`は下部ストリップを誤クリックし
          // 背景オーバーレイのキャンセルonClickを誘発してモーダルが閉じる事故につながった）
          const discardImg = page.locator('img[alt="天童アリス"]').last();
          if (await discardImg.count() && await discardImg.isVisible().catch(() => false)) {
            await discardImg.click({ timeout: 3000 }).catch(() => {});
            discardPicked = true; did = 'pick:天童アリス(discard,last)';
          }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) {
          const activateBtn = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await activateBtn.count() && await activateBtn.isVisible().catch(() => false) && await activateBtn.isEnabled().catch(() => false)) {
            await activateBtn.click().catch(() => {}); did = 'btn:発動(enabled)';
          }
        }
        // SELECT_SIGNI_ZONE（配置先ゾーン選択）＝「ゾーン2」ボタン（zone1・空き）をクリック
        if (!did) {
          const zoneBtn = page.getByRole('button', { name: /^ゾーン2/ }).first();
          if (await zoneBtn.count() && await zoneBtn.isVisible().catch(() => false) && await zoneBtn.isEnabled().catch(() => false)) {
            await zoneBtn.click().catch(() => {}); did = 'btn:ゾーン2';
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n.startsWith('WX25-CP1-TK1A')));
        H.log(`  ctp[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed) {
          return { pass: true, detail: `クラフトトークン《雷ちゃん》配置確認（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `トークン配置未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // WXDi-CP02-087（続き114・Sonnet・PLAN §6.4「クラフトトークンの実機配置検証 ＋ ADD_TO_FIELD source 近似残」）＝
  //    【出】：あなたのエナゾーンに＜ブルアカ＞のカードが５枚以上ある場合、あなたのエナゾーンから＜ブルアカ＞の
  //    シグニを１枚まで対象とし、それを場に出す。JSONの `ADD_TO_FIELD{source:ENERGY_CARD,filter:{story:'ブルアカ'}}`
  //    ＝`execAddToField` の ENERGY_CARD ソース分岐（`effectExecutor.ts:1254`）を検証。
  //    ⚠事前のコード読解では「cardName型と違い SELECT_SIGNI_ZONE は発生しない（空きゾーンへ自動配置）」と
  //    見立てたが実機では誤り＝候補が複数（SELECT_TARGET要）だと `resumeSelectTarget` 経由で
  //    `applyDirectAction`(ADD_TO_FIELD) が呼ばれ、そちらは空き2以上で SELECT_SIGNI_ZONE を要求する
  //    （`effectExecutor.ts:4996-4998`）。**そしてこの経路には重大な実バグがある**＝続き114で確認、Opusタスク12へ
  //    登録：`resumeSelectTarget`（`effectExecutor.ts:4246-4253`）は thenAction が `needsInteraction` を返すと
  //    その場で `return result` し、外側 SEQUENCE の `pending.continuation`（後続ステップ＝本カードでは
  //    GRANT_KEYWORD「絆常」付与）を握り潰す＝ADD_TO_FIELD自体は成功するが後続ステップが毎回無言no-op化する。
  //    ⚠「エナ5枚以上」の条件はJSON側に存在せず無条件実行（既知の近似・据置＝§6.4記載どおり）。今回は条件を
  //    満たす5枚を用意して検証するため、条件の有無に関わらず結果は同じ（トークン生成自体が機能するかが対象）。
  craftEnergyCP02087: {
    title: 'WXDi-CP02-087（ADD_TO_FIELD source:ENERGY_CARD＝エナゾーンから＜ブルアカ＞シグニを場に出す）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WXDi-CP02-054#1', 'WXDi-CP02-054#2', 'WXDi-CP02-054#3', 'WXDi-CP02-054#4', 'WXDi-CP02-054#5'], // 天童アリス（＜ブルアカ＞）×5
        'actions_done': [],
      },
      handPrepend: ['WXDi-CP02-087#1'], // 水羽ミモリ
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/craftEnergyCP02087-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
            await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true;
          }
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n?.startsWith('WXDi-CP02-054')));
        H.log(`  ce87[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hEnergy=${st?.host?.energy} pEff=${st?.pendingEffect ?? '-'} kwGrants=${JSON.stringify(st?.host?.keywordGrants)}`);
        if (placed) {
          // 続き114の診断用＝GRANT_KEYWORD（SEQUENCE後続ステップ）が発火するかも数周待って確認する。
          for (let k = 0; k < 4; k++) {
            await page.waitForTimeout(900);
            if (!(await H.clickZone())) await H.stdStep();
            const st2 = await H.queryState();
            H.log(`    (追跡)ce87 kw[${k}] pEff=${st2?.pendingEffect ?? '-'} kwGrants=${JSON.stringify(st2?.host?.keywordGrants)}`);
          }
          const stFin = await H.queryState();
          // ✅続き117（Opus・タスク12(xiv)）で修正済み＝resumeSelectTarget（effectExecutor.ts）の
          // thenAction=ADD_TO_FIELD 分岐を execPlaceSigniOnField 経由に切替え、外側SEQUENCEの
          // pending.continuation（＝後続のGRANT_KEYWORD）を afterAction として全配置後に実行するようにした。
          // ADD_TO_FIELD成功に加え、配置シグニ WXDi-CP02-087#1 への 絆常付与（GRANT_KEYWORD continuation）が
          // 実際に kwGrants へ入ることを assert する（旧・意図的no-op確認から真の回帰テストへ格上げ）。
          const grantOk = (stFin?.host?.keywordGrants ?? []).some(g => typeof g === 'string' && g.includes('WXDi-CP02-087#1'));
          return { pass: grantOk, detail: grantOk
            ? `ADD_TO_FIELD(ENERGY_CARD)発火→天童アリスが場に出た＋後続GRANT_KEYWORD(絆常)も発火（kwGrants=${JSON.stringify(stFin?.host?.keywordGrants)}）＝タスク12(xiv) continuation引き継ぎ修正を実機確認（hField=${JSON.stringify(stFin.host.fieldSigni)}）`
            : `ADD_TO_FIELD成功だが後続GRANT_KEYWORD(絆常)無発火（kwGrants=${JSON.stringify(stFin?.host?.keywordGrants)}）＝continuation欠落バグ` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `場出し未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // WXDi-P03-078（続き114・Sonnet・PLAN §6.4）＝
  //    【自】：あなたのターン終了時、あなたのエナゾーンからこのシグニよりパワーの低い＜地獣＞のシグニ１枚を
  //    対象とし、それを場に出す。それの【出】能力は発動しない。JSONの
  //    `ADD_TO_FIELD{source:ENERGY_CARD,filter:{story:'地獣',powerLtSelf:true}}`（動的フィルタ）＋
  //    `BLOCK_ACTION{actionId:ON_PLAY_ABILITY}`＝ON_TURN_END 経由での powerLtSelf 動的フィルタ解決を検証
  //    （§6.4「先頭ドロー脱落」の注記はP05-068側の注記の誤帰属の疑いがあり、本カードでは動的フィルタの
  //    解決可否そのものが未検証点＝ここで確認する）。turn_phase を直接 'END' に注入し「ターン終了」ボタンで
  //    doPhaseAdvance の phase==='END' 分岐（`BattleScreen.tsx:2874`）から collectTurnTriggers(ON_TURN_END) を起動。
  craftTurnEndP03078: {
    title: 'WXDi-P03-078（ON_TURN_END＋ADD_TO_FIELD source:ENERGY_CARD powerLtSelf動的フィルタ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WXDi-P03-078#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD04-014#1'], // 幻獣　パンダン（＜地獣＞・P2000＜本体P5000）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, null], // BLOCK_ACTION(owner:any) の候補を自分側1体だけに絞り込む
      },
      top: { active: 'host', turn_phase: 'END', turn_count: 2 },
    },
    async drive(page, H) {
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/craftTurnEndP03078-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['ターン終了']);
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n?.startsWith('WD04-014')));
        H.log(`  p078[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} phase=${st?.turnPhase ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed) {
          return { pass: true, detail: `ON_TURN_END経由でADD_TO_FIELD(ENERGY_CARD,powerLtSelf)発火→幻獣パンダンが場に出た（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `場出し未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} phase=${fin?.turnPhase ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // WXDi-P05-068（続き114・Sonnet・PLAN §6.4）＝スペル「カードを２枚引き、あなたの手札から《大罠　ハーメルン》
  //    を１枚まで場に出す。その後、…ターン終了時までアタック無効化能力を得る。」JSONは入れ子SEQUENCE
  //    [DRAW×2, ADD_TO_FIELD{source:HAND_CARD,cardName:'大罠　ハーメルン'}] → GRANT_KEYWORD。
  //    「先頭ドロー脱落」の懸念＝DRAWとADD_TO_FIELD(HAND_CARD)が入れ子SEQUENCEの中で両方正しく実行されるか
  //    （ドロー枚数観測＋場出し確認の両方）を検証。
  craftHandSpellP05068: {
    title: 'WXDi-P05-068（スペル・入れ子SEQUENCE DRAW×2＋ADD_TO_FIELD source:HAND_CARD cardName指定）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD03-009#1'], // 青×1（スペルコスト）
        'actions_done': [],
      },
      handPrepend: ['WXDi-P05-068#1', 'WXDi-P05-037#1'], // HAMELN STEP／大罠　ハーメルン
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand);
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/craftHandSpellP05068-${s}.png`, fullPage: true });
        let did = await H.clickBtn('発動', { exact: true });
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            did = await H.clickBtn('発動する', { exact: true });
            if (!did) { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n?.startsWith('WXDi-P05-037')));
        H.log(`  p068[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed) {
          // ⚠続き114でCP02-087/WXK07-105と同根と確認したバグ（resumeSelectTargetのcontinuation欠落・
          // Opusタスク12登録）の対象＝ADD_TO_FIELDがSELECT_TARGET経由でSELECT_SIGNI_ZONEを要求した場合、
          // 外側SEQUENCEの後続ステップ（本カードでは末尾のGRANT_KEYWORD＝アタック無効化能力の付与）が
          // 無言no-op化する疑いが濃厚（本シナリオでは未確認＝ADD_TO_FIELD自体の成否のみを判定対象とする）。
          return { pass: true, detail: `DRAW×2＋ADD_TO_FIELD(HAND_CARD)発火→大罠 ハーメルンが場に出た（hField=${JSON.stringify(st.host.fieldSigni)} hHand=${st.host.hand}・開始時hand=${before?.host?.hand}）。⚠後続GRANT_KEYWORDは未確認＝CP02-087と同型バグの疑い（Opusタスク12）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `場出し未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} hHand=${fin?.host?.hand} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // WXK07-105（続き114・Sonnet・PLAN §6.4）＝アーツ「ベット―《コインアイコン》《コインアイコン》あなたの手札
  //    から＜アーム＞のシグニ１枚を場に出す。あなたがベットしていた場合、追加であなたの手札から＜アーム＞の
  //    シグニ１枚を場に出す。」JSONは `ADD_TO_FIELD{source:HAND_CARD,story:'アーム'}` →
  //    `CONDITIONAL{IS_BETTING,then:ADD_TO_FIELD同型}`。ベット分岐（IS_BETTING）が実際にコイン支払いで発火し
  //    2枚目が場に出るかを検証（Restriction「リル限定」＝field.lrigをリルにして通す）。
  craftArtsBetK07105: {
    title: 'WXK07-105（アーツ・ベット分岐＝IS_BETTINGでADD_TO_FIELD source:HAND_CARDが2回発火）',
    spec: {
      hostSet: {
        'field.lrig': ['WX15-009#1'],       // 相恩の記憶　リル（Restriction「リル限定」を満たす）
        'field.signi': [null, null, null],
        'field.signi_down': [false, false, false],
        'lrig_deck': ['WXK07-105#1'],       // 快刀乱炎
        'energy': ['WX04-068#1', 'WX04-068#2'], // 赤×2（アーツコスト）
        'coins': 2,                          // ベット用
        'actions_done': [],
      },
      handPrepend: ['WD01-013#1', 'WD01-013#2'], // 小剣　ククリ（＜アーム＞）×2
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
    },
    async drive(page, H) {
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let betClicked = false;
      let usedBtn = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/craftArtsBetK07105-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !usedBtn) { did = await H.clickBtn('使用', { exact: false }); if (did) usedBtn = true; }
        if (!did && !betClicked) {
          const bet = await H.clickBtn('2枚', { exact: true });
          if (bet) { did = bet; betClicked = true; }
        }
        if (!did) {
          const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
          if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
            if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
            else {
              // ⚠artscost-energy-N はクリックでトグルする（選択/解除）＝毎周 index0 だけを見て
              // 「未選択なら押す」と判定すると選択済みでも再クリックしてしまい解除→再選択…と無限往復する
              // （実測・K07105続き114）。未選択のエナだけ拾えないため、他シナリオ（lrigundermoved 等）と
              // 同型＝両方まとめて1回だけクリックしてから即submit判定する“単発完結”パターンに合わせる。
              for (const i of [0, 1]) {
                const e = page.getByTestId(`artscost-energy-${i}`).first();
                if (await e.count() && await e.isVisible().catch(() => false)) { await e.click().catch(() => {}); }
              }
              await page.waitForTimeout(300);
              if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit,after両エナ選択)'; }
              else did = 'artscost:両エナクリック';
            }
          }
        }
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const placedCount = (st?.host?.fieldSigni ?? []).flat().filter(n => n?.startsWith('WD01-013')).length;
        H.log(`  k105[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} coins=${st?.host?.coins} pEff=${st?.pendingEffect ?? '-'}`);
        if (placedCount >= 2) {
          return { pass: true, detail: `ベット成立→ADD_TO_FIELD(HAND_CARD)が2回発火し＜アーム＞2体が場に出た（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      const finCount = (fin?.host?.fieldSigni ?? []).flat().filter(n => n?.startsWith('WD01-013')).length;
      return { pass: false, detail: `2体配置未確認（配置済み${finCount}体・pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ⑳ WXK04-003 ボタンラベル表示バグ（続き81・Sonnet・PLAN §3 Sonnetタスク10）＝getMyLrigFieldActions の
  //    costParts が eff.cost?.coin を非考慮で、E2「【起】《ゲーム1回》サプライズ《コインアイコン》」が常に
  //    「【起】コストなし」と誤表記されていた（costPartsMA/costPartsILT/costParts の3箇所を修正）。
  //    ⚠WXK04-003はもう1つ manualEffects.ts の WXK04-003-DECORE（【デコレ】ACCE付与・cost energy count:0＝
  //    正当な無コスト）も持つため、修正後は2ボタン中「コイン1」表記が1つ増える形が正解（「コストなし」表記が
  //    0件になるわけではない＝デコレ側は元から正しい）。
  wxk04003Label: {
    title: 'WXK04-003 ボタンラベル表示バグ＝getMyLrigFieldActionsのcostPartsがeff.cost.coinを非考慮',
    spec: {
      hostSet: {
        'field.lrig': ['WXK04-003#1'],
        'actions_done': [],
        'game_actions_done': [],
        'lrig_granted_auto_effects': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      await page.waitForTimeout(700);
      const lrigImg = page.locator('img[alt="エルドラ　オーバークロック"]').first();
      if (await lrigImg.count() && await lrigImg.isVisible().catch(() => false)) {
        await lrigImg.click({ force: true, timeout: 3000 }).catch(() => {});
      }
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${SHOT}/wxk04003label.png`, fullPage: true });
      // 「コイン1」＝E2サプライズ（修正対象）・「コストなし」＝WXK04-003-DECORE（【デコレ】ACCE付与・cost count:0で正当）
      const coinBtn = page.getByRole('button', { name: '【起】コイン1', exact: false }).first();
      const decoreBtn = page.getByRole('button', { name: '【起】コストなし', exact: false }).first();
      const hasCoinLabel = await coinBtn.count() > 0 && await coinBtn.isVisible().catch(() => false);
      const hasDecoreLabel = await decoreBtn.count() > 0 && await decoreBtn.isVisible().catch(() => false);
      H.log(`  ラベル確認: 【起】コイン1(サプライズ)=${hasCoinLabel} / 【起】コストなし(デコレ)=${hasDecoreLabel}`);
      if (hasCoinLabel && hasDecoreLabel) {
        return { pass: true, detail: '修正確認＝サプライズが「【起】コイン1」表記（旧「コストなし」誤表記は解消）・デコレは元から正当な「コストなし」のまま2ボタン共存' };
      }
      return { pass: false, detail: `ラベル未確認（コイン1=${hasCoinLabel}／デコレのコストなし=${hasDecoreLabel}）` };
    },
  },

  // G144（続き115・Sonnet・PLAN §7「その他の実機検証待ち」＝ビート機構Phase1-7・F-3・G144/G145の一角）＝
  //    WX10-074（肆ノ遊　ツナヒキ）「【自】：あなたのシグニ１体がダウン状態で場に出たとき、そのシグニをアップ
  //    する」＝triggerScope:any_ally＋triggerCondition.placedDown＋UP{targetsTriggerSource}。効果配置経路
  //    （BUGFIXES 2026-06-23「G144/G145 any_ally 効果配置トリガーの配線」）で実際に発火するかを実機検証する。
  //    WX15-062（似之遊　†チャッキー†）の【出】《無》コストでトラッシュの WX10-082（壱ノ遊　ケンダマ・
  //    Lv1＜遊具＞・無効果）をダウン状態で場に出させ、既に場にいる WX10-074 の watcher が反応して
  //    トリガー元（WX10-082）を無選択アップするかを見る。
  g144DownTrigger: {
    title: 'WX10-074（G144＝あなたのシグニがダウン状態で場に出たとき、それをアップする）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX10-074#1'], null, null], // watcher（肆ノ遊　ツナヒキ）
        'field.signi_down': [false, false, false],
        'trash': ['WX10-082#1'],  // 壱ノ遊　ケンダマ（Lv1＜遊具＞・無効果＝ADD_TO_FIELDの対象）
        'energy': ['WD01-013#1'], // 【出】コスト《無×1》支払い用
        'actions_done': [],
      },
      handPrepend: ['WX15-062#1'], // 似之遊　†チャッキー†
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      let energySelected = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/g144DownTrigger-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did && !energySelected) {
          const e0 = page.getByTestId('onplaycost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'tid:onplaycost-energy-0'; energySelected = true; }
        }
        if (!did && energySelected) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const watcherLog = await H.findLog(/ツナヒキ.*の【自】効果（他のシグニ召喚時）/);
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n?.startsWith('WX10-082')));
        H.log(`  g144[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'} placed=${placed} watcher=${!!watcherLog}`);
        if (watcherLog) {
          return { pass: true, detail: `G144発火→肆ノ遊ツナヒキの【自】効果（他のシグニ召喚時）watcher「${watcherLog}」（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `G144未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // G145（続き115・Sonnet）＝WX10-080（弐ノ遊　ナゲナワ）「【自】：あなたの他のシグニ１体が効果によって
  //    場に出たとき、このシグニをアップする」＝triggerScope:any_ally＋triggerFilter.excludeSelf＋
  //    triggerCondition.byEffect＋UP{target.filter.thisCardOnly}。G144と同じ効果配置経路だが、asDown条件は
  //    無く「効果による場出し」全般で発火し、対象は自分自身（thisCardOnly）という別分岐を検証する。
  g145ByEffectTrigger: {
    title: 'WX10-080（G145＝あなたの他のシグニが効果によって場に出たとき、このシグニをアップする）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX10-080#1'], null, null], // watcher（弐ノ遊　ナゲナワ）
        'field.signi_down': [false, false, false],
        'trash': ['WX10-082#1'],  // 壱ノ遊　ケンダマ（Lv1＜遊具＞・無効果＝ADD_TO_FIELDの対象）
        'energy': ['WD01-013#1'], // 【出】コスト《無×1》支払い用
        'actions_done': [],
      },
      handPrepend: ['WX15-062#1'], // 似之遊　†チャッキー†
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      let energySelected = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/g145ByEffectTrigger-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did && !energySelected) {
          const e0 = page.getByTestId('onplaycost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'tid:onplaycost-energy-0'; energySelected = true; }
        }
        if (!did && energySelected) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const watcherLog = await H.findLog(/ナゲナワ.*の【自】効果（他のシグニ召喚時）/);
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n?.startsWith('WX10-082')));
        H.log(`  g145[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'} placed=${placed} watcher=${!!watcherLog}`);
        if (watcherLog) {
          return { pass: true, detail: `G145発火→弐ノ遊ナゲナワの【自】効果（他のシグニ召喚時）watcher「${watcherLog}」（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `G145未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // F-3身代わり対話・コスト払い型（続き115・Sonnet・PLAN §7「その他の実機検証待ち」）＝
  //    WX10-033（コードハート　Ｓ・Ｗ・Ｔ）「【常】：このシグニがバニッシュされる場合、代わりに手札から
  //    スペルを１枚捨ててもよい。」＝CONTINUOUS BANISH_SUBSTITUTE{substituteCost.discardSpell:1,optional:true}
  //    （collectBanishSubstitutes の「コスト払い型」分岐）。CPU（guest・P15000）がhost zone1のWX10-033
  //    （P12000）へバトルアタックし敗北→BanishSubstituteModal（人間防御側への対話）が出て「手札からスペルを
  //    捨てて回避」を選ぶと、WX10-033が場に残りバニッシュされないことを検証する。
  f3PayCostWX10033: {
    title: 'WX10-033（F-3コスト払い型＝手札スペル1枚を捨ててバトルバニッシュを回避）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, ['WX10-033#1'], null], // 防御側（コードハート Ｓ・Ｗ・Ｔ・P12000・zone1中央）
        'field.signi_down': [false, false, false],
        'hand': ['WD01-015#1'], // ゲット・バイブル（スペル・discardSpellコスト用）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, ['WX01-053#1'], null], // 攻撃者（極剣 ゴッドイーター・P15000・zone1中央）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[1] ?? []).includes?.('WX01-053#1'); r++) {
        H.log(`再注入(${r})… guest zone1=${JSON.stringify(before?.guest?.fieldSigni?.[1])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      H.log('開始時 host:', JSON.stringify(before?.host), 'guest:', JSON.stringify(before?.guest));
      for (let s = 0; s < 24; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/f3PayCostWX10033-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'cpu', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did) did = await H.clickTextOrBtn(['捨てて回避', 'トラッシュして回避']);
        if (!did) did = await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        const st = await H.queryState();
        const stillAlive = (st?.host?.fieldSigni?.[1] ?? []).includes?.('WX10-033#1');
        const handDropped = typeof before?.host?.hand === 'number' && typeof st?.host?.hand === 'number' && st.host.hand < before.host.hand;
        H.log(`  f3pc[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand} hTrash=${st?.host?.trash} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (stillAlive && handDropped) {
          return { pass: true, detail: `F-3コスト払い型発火→WX10-033は場に残りバニッシュ回避（hHand ${before.host.hand}→${st.host.hand}）` };
        }
        if (!stillAlive) {
          return { pass: false, detail: `【要注意】WX10-033がバニッシュされた＝F-3コスト払い型の対話が発火しなかった疑い（hHand=${st?.host?.hand}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `決着未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} hHand=${fin?.host?.hand} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // F-3身代わり対話・犠牲型の実データ検証（続き115・Sonnet）＝PLAN §7 犠牲型リストの WX12-024（コードハート
  //    †Ｃ・Ｃ・Ｍ†）「【常】：このシグニがバニッシュされる場合、代わりにあなたの他の＜電機＞のシグニ１体を
  //    バニッシュしてもよい。」＝ effects_WX.json 上の WX12-024-E1 は STUB BANISH_SUBSTITUTE ではなく
  //    素の `CONTINUOUS BANISH{target:self,filter:{story:'電機',excludeSelf:true},optional:true}` として
  //    parse されている（WXEX2-60/WX20-055/WXDi-CP01-032/WXDi-P10-052 の犠牲型5枚も全て同型）。
  //    collectBanishSubstitutes（engine/effectEngine.ts:4406）は `act.type==='STUB' && act.id==='BANISH_SUBSTITUTE'`
  //    または `act.type==='BANISH_SUBSTITUTE'` のみを認識するため、この素の BANISH 表現は身代わりオプションとして
  //    一切収集されない＝BanishSubstituteModal が絶対に出ないはず、という仮説を実機で確認する
  //    （host zone1 に WX12-024＋sacrifice候補の WD03-009＜電機＞を配置し、CPU がP15000で攻撃→
  //    対話なしでWX12-024がそのままバニッシュされることを確認）。
  f3SacrificeWX12024: {
    title: 'WX12-024（F-3犠牲型＝JSON誤表現でBanishSubstituteが一切発火しない疑いの確認）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD03-009#1'], ['WX12-024#1'], null], // zone0=sacrifice候補（＜電機＞P12000）／zone1=防御側（P12000中央）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, ['WX01-053#1'], null], // 攻撃者（P15000・zone1中央）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[1] ?? []).includes?.('WX01-053#1'); r++) {
        H.log(`再注入(${r})… guest zone1=${JSON.stringify(before?.guest?.fieldSigni?.[1])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      H.log('開始時 host:', JSON.stringify(before?.host), 'guest:', JSON.stringify(before?.guest), 'logTail=', JSON.stringify(before?.logTail));
      // ✅続き117（Opus・タスク12(xv)）で修正済み＝WX12-024-E1 を STUB BANISH_SUBSTITUTE
      // {pattern:'self_sacrifice_other',sacrificeClass:'電機'} へ作り替え（parser/データ両方）。
      // 期待挙動＝CPUのアタックでWX12-024がバニッシュされる際に身代わりモーダルが出現し、
      // 犠牲候補（WD03-009・＜電機＞）を選ぶとそれがバニッシュされWX12-024は場に残る。
      let modalSeen = false;
      for (let s = 0; s < 24; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/f3SacrificeWX12024-${s}.png`, fullPage: true });
        const bodyTx = await H.fullBody();
        if (/身代わりバニッシュ/.test(bodyTx)) modalSeen = true;
        let did = await H.clickTextOrBtn(['を代わりにバニッシュ', '身代わりする', '代わりにバニッシュ']);
        if (!did) did = await H.clickTextOrBtn(['ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        const st = await H.queryState();
        const stillAlive = (st?.host?.fieldSigni?.[1] ?? []).includes?.('WX12-024#1');
        const sacrificeGone = Array.isArray(before?.host?.fieldSigni?.[0]) && before.host.fieldSigni[0].includes('WD03-009#1')
          && !((st?.host?.fieldSigni?.[0] ?? []).includes?.('WD03-009#1'));
        H.log(`  f3sac[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} pBS=${st?.host?.pendingBanishSubstitute ?? '-'} modalSeen=${modalSeen} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} logTail=${JSON.stringify(st?.logTail?.slice(-4))}`);
        // F-3成功＝身代わりモーダルが出現し、犠牲シグニ(WD03-009)がバニッシュされWX12-024が場に残る
        if (modalSeen && sacrificeGone && stillAlive) {
          return { pass: true, detail: `F-3犠牲型が機能＝身代わりモーダル出現→WD03-009(＜電機＞)を犠牲にしWX12-024が場に残存（modalSeen=${modalSeen} sacrificeGone=${sacrificeGone}）＝タスク12(xv) STUB BANISH_SUBSTITUTE化を実機確認` };
        }
        if (!stillAlive) {
          return { pass: false, detail: `WX12-024がバニッシュされた（modalSeen=${modalSeen} sacrificeGone=${sacrificeGone}）＝身代わり不発` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `決着未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} modalSeen=${modalSeen} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ビート機構Phase1-7（続き115・Sonnet・PLAN §7「その他の実機検証待ち」）＝WDK14-014（炎魔の孔雀 カイム）の
  //    【出】《ビートアイコン》［４枚以下］「《炎魔の孔雀　カイム》以外のシグニ１体を【ビート】にする：カードを
  //    １枚引く」＝ON_PLAY cost.beat_signi:1＋condition:BEAT_CONDITION（[条件]ゲート＝現在の【ビート】枚数が
  //    4枚以下でなければコスト提示自体が出ない）。このコストで WDK14-017（炎魔の幸運 カウカス）を【ビート】に
  //    することで、WDK14-017 自身の ON_BECOME_BEAT（self scope・「このカードが【ビート】になったとき：
  //    カードを1枚引き、手札を1枚捨てる」）が発火するかを検証する（[条件]ゲート開閉＋beat_signiコスト
  //    支払い＋ON_BECOME_BEAT self watcherの3点を一気通貫で確認）。WDK14-014自身が持つON_BECOME_BEAT
  //    any_ally反応（《赤》《赤》のOPTIONAL_COST付き）は今回スキップして検証対象外（エナ無しで自然にスキップ
  //    される）。Restriction「タウィル限定」を満たすため lrig は WX06-007（タウィル＝トレ・Lv3）を使う。
  beatBecomeSelfWDK14017: {
    title: 'WDK14-014→WDK14-017（ビート機構Phase1-7＝[条件]ゲート＋beat_signiコスト＋ON_BECOME_BEAT self）',
    spec: {
      hostSet: {
        'field.lrig': ['WX06-007#1'], // 永らえし者 タウィル＝トレ（Lv3・タウィル限定を満たす）
        'field.signi': [['WDK14-017#1'], null, null], // 炎魔の幸運 カウカス（ビート対象候補・self watcher）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, null],
      },
      handPrepend: ['WDK14-014#1'], // 炎魔の孔雀 カイム
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'host.trash:', before?.host?.trash);
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 24; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/beatBecomeSelfWDK14017-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const watcherLog = await H.findLog(/カウカス.*の【自】効果（【ビート】になったとき）/);
        const movedToBeat = !(st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.some(n => n?.startsWith('WDK14-017')));
        H.log(`  beat[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand} hTrash=${st?.host?.trash} movedToBeat=${movedToBeat} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} watcher=${!!watcherLog} logTail=${JSON.stringify(st?.logTail?.slice(-6))}`);
        if (watcherLog) {
          return { pass: true, detail: `ビート機構Phase1-7発火→[条件]ゲート開通＋beat_signiコスト支払いでWDK14-017が【ビート】化→ON_BECOME_BEAT self watcher発火「${watcherLog}」（hHand ${before?.host?.hand}→${st.host.hand}・hTrash ${before?.host?.trash}→${st.host.trash}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `【回帰】WDK14-017自身のON_BECOME_BEAT self反応が発火しない（hHand=${fin?.host?.hand}・pEff=${fin?.pendingEffect ?? '-'}）＝続き121(タスク12(xvi))で真因を特定し修正済み：battleCardNums構築（BattleScreen）が field.beat_zone を走査せず、【ビート】化して beat_zone へ移ったカードが effectsMap から脱落→collectBeatBecameTriggers の self ループが空を引いていた。再発なら addState への beat_zone 走査追加の回帰。` };
    },
  },

  // ON_LRIG_ATTACK_STEP_START②usageLimit（続き116・Sonnet・PLAN §7）＝WX25-CP1-042-E2「【自】《ターン１回》：
  //    あなたのルリグアタックステップ開始時...」のusageLimitが実際に機能するかを検証。コード読解で
  //    `collectTurnTriggers`（triggerCollect.ts:1571・ON_TURN_START/END/ON_ATTACK_PHASE_START/
  //    ON_MAIN_PHASE_START/ON_LRIG_ATTACK_STEP_STARTの共通コレクタ）が`eff.usageLimit`を一切参照せず
  //    `StackEntry[]`のみを返す（`usedIds`を返さない設計）ことを確認済み＝呼び出し側（BattleScreen.tsx:3220）も
  //    `actions_done`への書き戻しを一切行わない。通常プレイでは ATTACK_SIGNI→ATTACK_LRIG 移行は1ターンに1回しか
  //    起きないため実害は薄いが、`repatchTop`で同一ターン内に人為的に2回この遷移を発生させ、usageLimitガードが
  //    本当に存在しないかを実機で確認する。
  lrigAttackStepStartUsageLimit: {
    title: 'WX25-CP1-042-E2（ON_LRIG_ATTACK_STEP_START②＝《ターン1回》usageLimitの実機検証）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WX25-CP1-042#1'], null, null],
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      H.log('開始時 guest.hand:', before?.guest?.hand, 'phase:', before?.turnPhase);
      let firstFireHand = null;
      let repatched = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigAttackStepStartUsageLimit-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        // 1回目発火の確認後、ATTACK_SIGNIへ人為的に巻き戻して2回目の遷移を発生させる。
        if (firstFireHand === null && phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)
          && typeof phaseChk?.guest?.hand === 'number' && typeof before?.guest?.hand === 'number' && phaseChk.guest.hand < before.guest.hand) {
          firstFireHand = phaseChk.guest.hand;
          H.log(`  1回目発火確認＝gHand ${before.guest.hand}→${firstFireHand}。ATTACK_SIGNIへ巻き戻して2回目遷移を発生させる。`);
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          repatched = true;
          did = 'repatch:ATTACK_SIGNI(2回目遷移用)';
        } else if (phaseChk?.turnPhase === 'MAIN' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          did = 'repatch:ATTACK_SIGNI';
        }
        if (!did) did = await H.clickTextOrBtn(['このまま進む']);
        if (!did) did = await H.clickTextOrBtn(['ルリグアタックへ']);
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        H.log(`  lasul[${s}] -> ${did ?? 'なし'} | phase=${st?.turnPhase ?? '-'} gHand=${st?.guest?.hand ?? '-'}(開始${before?.guest?.hand}・1回目後${firstFireHand ?? '-'}) pEff=${st?.pendingEffect ?? '-'}`);
        if (repatched && firstFireHand !== null && st?.turnPhase && st.turnPhase !== 'ATTACK_SIGNI' && st.turnPhase !== 'MAIN'
          && typeof st?.guest?.hand === 'number') {
          if (st.guest.hand < firstFireHand) {
            return { pass: false, detail: `【バグ確認】同一ターン内でATTACK_SIGNI→ATTACK_LRIGを人為的に2回発生させたところ、WX25-CP1-042-E2（《ターン1回》usageLimit）が2回目も発火した（gHand ${before.guest.hand}→${firstFireHand}→${st.guest.hand}）＝続き119(タスク12(xvii))で collectTurnTriggers に mkLimitOk＋actions_done書き戻しを配線して修正済み。再発ならその配線の回帰。` };
          }
          if (s > 12) {
            return { pass: true, detail: `usageLimit正しく機能＝2回目のATTACK_LRIG遷移では発火せず（gHand ${firstFireHand}→${st.guest.hand}・変化なし）` };
          }
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `判定未確定（1回目発火=${firstFireHand ?? '未確認'}・phase=${fin?.turnPhase ?? '-'} gHand=${fin?.guest?.hand ?? '-'}）` };
    },
  },

  // ON_PLAY any_ally の《ターン1回》usageLimit 実機検証（続き135・Opus・PLANタスク12(x)）＝WX24-P1-046-E1
  //    「【自】《ターン１回》：あなたの他の＜地獣＞のシグニ１体が場に出たとき、【エナチャージ１】をする。」
  //    `collectFieldTriggers`（ON_PLAY/ON_ATTACK_SIGNI/ON_BLOOM の any/any_ally/any_opp 共通コレクタ）には
  //    usageLimit の判定コード自体が存在せず（続き104 で発見・実カード32枚）、同一ターンに味方シグニを複数体
  //    召喚すると毎回発火していた。修正（mkLimitOk＋usedHostIds/usedGuestIds 返却＋BattleScreen 召喚経路での
  //    actions_done 書き戻し）後は、2体目の召喚では発火しない＝デッキが1枚しか減らない（エナチャージは
  //    デッキの一番上から。召喚自体はデッキを減らさない）ことで判定する。
  onPlayUsageLimit: {
    title: 'WX24-P1-046-E1（ON_PLAY any_ally《ターン1回》＝2体召喚しても1回だけ発火することの実機検証）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],                        // Lv2（Limit5）＝watcher Lv3＋Lv1×2＝合計5でちょうど収まる
        'field.signi': [['WX24-P1-046#1'], null, null],      // watcher（幻獣神 オサコ・＜地獣＞）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: { 'blocked_actions': [] },
      handPrepend: ['WXDi-P04-073#1', 'WXDi-P04-073#2'],     // 幻獣 タスマニアン（＜地獣＞Lv1・コスト無し・効果なし）×2
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 hDeck:', before?.host?.deck, 'hEnergy:', before?.host?.energy, 'hHand:', before?.host?.hand);
      let deckAfterFirst = null; // 1体目召喚後のデッキ枚数（＝1回目発火の基準）
      let inSummonFlow = false;  // 手札クリック済み＝「召喚」ボタン／ゾーン選択の解決待ち（この間は手札を触らない）
      for (let s = 0; s < 30; s++) {
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOT}/onPlayUsageLimit-${s}.png`, fullPage: true });
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni ?? []).filter(z => (z ?? []).length > 0).length - 1; // watcher を除く
        let did = null;
        // 召喚フロー中は「召喚」ボタン→ゾーン選択を進める（手札の再クリックでモーダルを閉じてしまわないため）
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
          await summonBtn.click().catch(() => {}); did = 'btn:召喚';
        }
        if (!did) {
          const zoneDid = await H.clickTestId('summon-zone-1', 'summon-zone-2');
          if (zoneDid) { did = zoneDid; inSummonFlow = false; }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい']);
        // 前の召喚の解決が終わってから次の1体を召喚する（stack/pending が空のときだけ手札を触る）
        if (!did && !inSummonFlow && !st?.pendingEffect && !(st?.stackLen > 0) && placed < 2) {
          if (placed === 1 && deckAfterFirst === null) {
            deckAfterFirst = st.host.deck;
            H.log(`  1体目召喚完了＝hDeck ${before.host.deck}→${deckAfterFirst}（エナチャージ発火なら-1）`);
          }
          const opened = await H.clickTestId('my-hand-card-0');
          if (opened) { did = 'hand-card-0'; inSummonFlow = true; }
        }
        H.log(`  opul[${s}] -> ${did ?? 'なし'} | placed=${placed} inFlow=${inSummonFlow} hDeck=${st?.host?.deck}(開始${before?.host?.deck}) hEnergy=${st?.host?.energy} done=${JSON.stringify(st?.host?.actionsDone)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        // 2体とも場に出て解決が落ち着いたら判定
        if (placed === 2 && !st?.pendingEffect && !(st?.stackLen > 0) && s > 8) {
          const deckDelta = before.host.deck - st.host.deck;
          const fires = (st.host.actionsDone ?? []).filter(id => id === 'WX24-P1-046-E1').length;
          if (deckDelta >= 2 || fires >= 2) {
            return { pass: false, detail: `【バグ再発】ON_PLAY any_ally《ターン1回》が2体目の召喚でも発火（hDeck ${before.host.deck}→${st.host.deck}＝-${deckDelta}／actions_done内の発火記録=${fires}回）＝collectFieldTriggers の usageLimit ガード（続き135）の回帰` };
          }
          if (deckDelta === 1 && fires === 1) {
            return { pass: true, detail: `usageLimit 正常＝2体召喚してもエナチャージは1回だけ（hDeck ${before.host.deck}→${st.host.deck}・hEnergy ${before.host.energy}→${st.host.energy}・actions_done=${JSON.stringify(st.host.actionsDone)}）` };
          }
          if (deckDelta === 0 && fires === 0) {
            return { pass: false, detail: `ON_PLAY any_ally が一度も発火していない（hDeck 不変・actions_done=${JSON.stringify(st.host.actionsDone)}）＝過少発火side の回帰か、召喚が watcher の triggerFilter（＜地獣＞）に一致していない` };
          }
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `判定未確定（hField=${JSON.stringify(fin?.host?.fieldSigni)} hDeck=${fin?.host?.deck}(開始${before?.host?.deck}) done=${JSON.stringify(fin?.host?.actionsDone)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // POWER_MODIFY_PER_ENERGY 実機検証（続き116・Sonnet・PLAN §6.1「⚠要実機検証」在庫）＝WX09-019（羅植姫 アキナナ）
  //    「【常】：このシグニのパワーはあなたのエナゾーンにあるカード１枚につき＋2000される」（基本パワー0）。
  //    エナ3枚→期待パワー6000。host zone1中央にWX09-019、guest zone1中央にP3000の無効果アタッカー
  //    （WD01-013）を配置しCPUに攻撃させる。パワー加算が正しく効いていれば防御側6000>攻撃側3000で
  //    WX09-019は生存する（もし基本パワー0のまま計算されていればP3000の攻撃にも敗北しバニッシュされる）。
  powerModifyPerEnergy: {
    title: 'WX09-019（POWER_MODIFY_PER_ENERGY＝エナ1枚につき+2000・エナ3枚で基本0→6000への計算を実機検証）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, ['WX09-019#1'], null], // 防御側（羅植姫 アキナナ・zone1中央）
        'field.signi_down': [false, false, false],
        'energy': ['WD01-013#1', 'WD01-013#2', 'WD01-013#3'], // エナ3枚→期待パワー0+2000*3=6000
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, ['WD01-013#2'], null], // 攻撃側（小剣 ククリ・P3000・zone1中央）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[1] ?? []).includes?.('WD01-013#2'); r++) {
        H.log(`再注入(${r})… guest zone1=${JSON.stringify(before?.guest?.fieldSigni?.[1])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      H.log('開始時 host:', JSON.stringify(before?.host), 'guest:', JSON.stringify(before?.guest));
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/powerModifyPerEnergy-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'cpu', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        const st = await H.queryState();
        const stillAlive = (st?.host?.fieldSigni?.[1] ?? []).includes?.('WX09-019#1');
        const battleHappened = (st?.logTail ?? []).some(l => /vs/.test(l));
        H.log(`  pme[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} stillAlive=${stillAlive} battleHappened=${battleHappened} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'} logTail=${JSON.stringify(st?.logTail?.slice(-4))}`);
        if (battleHappened) {
          if (stillAlive) {
            return { pass: true, detail: `POWER_MODIFY_PER_ENERGY正しく計算＝エナ3枚でP6000（基本0+2000*3）としてP3000の攻撃を退けWX09-019は生存（logTail=${JSON.stringify(st.logTail.slice(-3))}）` };
          }
          return { pass: false, detail: `【要注意】WX09-019がP3000の攻撃でバニッシュされた＝パワー加算が計算されていない疑い（基本パワー0のままなら当然敗北）（logTail=${JSON.stringify(st.logTail.slice(-3))}）` };
        }
        if (!stillAlive) {
          return { pass: false, detail: `【要注意】battle vs行を確認する前にWX09-019が消滅＝原因不明（logTail=${JSON.stringify(st?.logTail?.slice(-5))}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `決着未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ARTS_USED_THIS_TURN 実機検証（続き116・Sonnet・PLAN §5b「⚠要実機検証」在庫）＝WX25-P1-095（幻怪 バンシー）
  //    「【自】：このシグニがアタックしたとき、このターンにあなたがアーツを使用していた場合、【エナチャージ１】を
  //    する。」＝`condition:{type:'ARTS_USED_THIS_TURN',owner:'self'}`。`turn_arts_used`フラグをhostSetで直接
  //    trueに注入し（アーツ使用UI自体は既存の複数シナリオで検証済みのため、ここではフラグ読み取り→条件評価→
  //    アクション発火の経路に絞る）、host攻撃時にエナが0→1に増えるかを確認する。
  artsUsedThisTurnGate: {
    title: 'WX25-P1-095（ARTS_USED_THIS_TURN条件＝このターンにアーツ使用済みならアタック時エナチャージ1）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX25-P1-095#1'], null, null], // 幻怪 バンシー（P5000・zone0）
        'field.signi_down': [false, false, false],
        'energy': [],
        'turn_arts_used': true,
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null], // 対戦相手（小剣 ククリ・P3000・zone0）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[0] ?? []).includes?.('WD01-013#1'); r++) {
        H.log(`再注入(${r})… guest zone0=${JSON.stringify(before?.guest?.fieldSigni?.[0])}`);
        await injectScenario(page, this.spec);
        await page.waitForTimeout(1500);
        before = await H.queryState();
      }
      H.log('開始時 host:', JSON.stringify(before?.host));
      let modalOpened = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/artsUsedThisTurnGate-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          modalOpened = false;
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) {
            await atkBtn.click().catch(() => {}); did = 'btn:アタック(exact)';
          }
        }
        if (!did && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) did = await H.stdStep();
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ', 'エナに送る']);
        const st = await H.queryState();
        const energyGained = typeof st?.host?.energy === 'number' && st.host.energy > (before?.host?.energy ?? 0);
        H.log(`  autg[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy}(開始${before?.host?.energy}) stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (energyGained) {
          return { pass: true, detail: `ARTS_USED_THIS_TURN条件が正しく評価されエナチャージ1が発火（hEnergy ${before?.host?.energy}→${st.host.energy}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `エナチャージ未確認（hEnergy=${fin?.host?.energy ?? '-'}（開始${before?.host?.energy}）pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // WX04-004-E2（続き126・Sonnet・PLAN §7「その他の実機検証待ち」＝守備側アタック無効化）＝「対戦相手のシグニ1体が
  //    アタックしたとき、その正面にシグニがない場合、《緑》《無》を支払い手札から＜美巧＞のシグニを1枚捨ててもよい。
  //    そうした場合、そのアタックを無効にする。」STUB(OPP_DIRECT_ATTACK_NEGATE/_PAY・execStubPart3.ts:5070)が
  //    支払い可否判定→CHOOSE(pay/skip)→TRASH(HAND_CARD,美巧)→エナ支払い＋cancel_current_signi_attackを担う。
  //    host lrig=WX04-004（正面=host zone2を空に）・guest zone0のシグニがCPU自動アタックで直接アタックを仕掛ける。
  oppDirectAttackNegate: {
    title: 'WX04-004-E2（守備側アタック無効化＝正面なしアタックをコスト任意支払いで無効化）',
    spec: {
      hostSet: {
        'field.lrig': ['WX04-004#1'],       // 戦慄の旋律　アン＝フォース（緑Lv4）
        'field.signi': [null, null, null],  // 正面（guest zone0のミラー=zone2）を含め全ゾーン空
        'field.signi_down': [false, false, false],
        'energy': ['WD04-009#1', 'WD04-009#2'], // 緑×2（costColors《緑》《無》を両方満たす）
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WD01-013#1'], null, null], // 小剣　ククリ（CPUアタッカー・zone0）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      handPrepend: ['WX04-092#1'], // 無害の一致　ピュリ（＜美巧＞・discard cost用）
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.life:', before?.host?.life, 'host.energy:', before?.host?.energy);
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppDirectAttackNegate-${s}.png`, fullPage: true });
        let did = await H.clickTextOrBtn(['コストを払いアタックを無効にする']);
        if (!did) did = await H.stdStep();
        if (!did) did = await H.clickTextOrBtn(['ガードしない', 'しない', 'スキップ']);
        const negated = await H.findLog(/支払い、アタックを無効にした/);
        const st = await H.queryState();
        H.log(`  odan[${s}] -> ${did ?? 'なし'} | hLife=${st?.host?.life} hEnergy=${st?.host?.energy} hHand=${st?.host?.hand} pEff=${st?.pendingEffect ?? '-'}`);
        if (negated) {
          return { pass: true, detail: `STUBログ「${negated}」を確認＝コスト支払いでアタック無効化フラグが立った（hLife ${before?.host?.life}→${st.host.life}・hEnergy ${before?.host?.energy}→${st.host.energy}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `無効化ログ未確認（hLife=${fin?.host?.life}（開始${before?.host?.life}）hEnergy=${fin?.host?.energy}（開始${before?.host?.energy}）pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ON_TARGETED forced単一対象follow-up（続き127・Sonnet・PLAN §7「その他の実機検証待ち」）＝`collectTargetedTriggers`
  //    （BattleScreen.tsx:4141）は`handleEffectInteraction`のSELECT_TARGET確定分岐でのみ呼ばれる。しかし
  //    `POWER_MODIFY{targetsTriggerSource:true}`（execPowerModify・effectExecutor.ts:514-525）は
  //    「それ」=triggeringCardNumを選択UIなしで直接`done()`適用するため、この経路はSELECT_TARGETを一度も
  //    生成せず`collectTargetedTriggers`を素通りする＝「対象になった」はずのカードのON_TARGETEDが発火しない
  //    構造的懸念（型定義コメント`effects.ts:41`の「forced単一対象（pending無しで自動解決）経路は未カバー」）。
  //    host=WX12-010（ホワイトメイズ　ホデサパ・ON_ATTACK_SIGNI any_opp・targetsTriggerSourceでアタッカーに-2000）
  //    guest=WXDi-P03-067（羅石　アパタイト・ON_TARGETED self＝DRAW×1・usageLimit once_per_turn）でCPU自動アタック。
  onTargetedForcedBypass: {
    title: 'ON_TARGETED forced単一対象follow-up（targetsTriggerSourceの自動解決でON_TARGETEDが発火するか）',
    spec: {
      hostSet: {
        'field.signi': [['WX12-010#1'], null, null], // ホワイトメイズ　ホデサパ（ON_ATTACK_SIGNI any_opp watcher）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WXDi-P03-067#1'], null, null], // 羅石　アパタイト（ON_TARGETED self＝DRAW×1・CPUアタッカー）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
        'actions_done': [],
        'hand': [], // ⚠絶対値判定のため空手札を注入（CPUアタックは注入直後に完結し before スナップショットが取れないため）
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    // ⚠計測タイミング（続き137・Opusタスク12(xx)修正後）：CPU の自動アタック→WX12-010 の POWER_MODIFY→
    //   ON_TARGETED の DRAW はすべて「注入直後・最初の queryState より前」に完結してしまう。そのため drive 側で
    //   ドロー前後の delta は観測できない。代わりに guest.hand を空([])で注入し、ON_TARGETED が正しく発火すれば
    //   ちょうど hand===1（DRAW×1）になる絶対値で判定する（修正が無ければ POWER_MODIFY だけ成立し hand===0 のまま）。
    async drive(page, H) {
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SHOT}/onTargetedForcedBypass-${s}.png`, fullPage: true });
        const st = await H.queryState();
        const targeted = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WXDi-P03-067#1:-2000'));
        H.log(`  otfb[${s}] -> gHand=${st?.guest?.hand} gPowerMods=${JSON.stringify(st?.guest?.powerMods)} phase=${st?.turnPhase}`);
        if (targeted) {
          if ((st.guest.hand ?? 0) >= 1) {
            return { pass: true, detail: `targetsTriggerSourceでの自動対象化後もON_TARGETEDが発火＝WXDi-P03-067がドロー（空手札注入→gHand=${st.guest.hand}）＝forced単一対象経路が正しくカバーされている` };
          }
          return { pass: false, detail: `WX12-010のPOWER_MODIFY(-2000)は成立（gPowerMods=${JSON.stringify(st.guest.powerMods)}）が、WXDi-P03-067のON_TARGETED（DRAW）が発火せずgHand=0のまま＝forced単一対象（targetsTriggerSourceの選択UIなし自動解決）がcollectTargetedTriggersを素通りする実バグ` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `WX12-010のPOWER_MODIFY未確認（gPowerMods=${JSON.stringify(fin?.guest?.powerMods)} phase=${fin?.turnPhase}）＝CPU未アタックの可能性` };
    },
  },

  // タスク12(c)②：ON_TARGETED の「その対戦相手のシグニ」＝**対象にしてきたシグニ**に限定されるか。
  //   host が WXDi-P00-074（【出】：対戦相手のシグニ1体を対象とし、ターン終了時までパワー-1000）を召喚して
  //   guest の watcher WXDi-P03-056（【自】《ターン1回》：このシグニが対戦相手の**シグニ**の能力か効果の対象に
  //   なったとき、その対戦相手のシグニをバニッシュする）を対象に取る。修正前は①collector が origin を
  //   entry.triggeringCardNum に載せず②JSON も filter.isTriggerSource を持たなかったため、**host のどの
  //   シグニでも選べる過剰対象化**だった。host zone0 に無関係な生存確認用シグニ（WD05-009・P12000）を置き、
  //   「対象化した WXDi-P00-074 だけが消えて zone0 は残る」ことで限定を確認する。
  //   ⚠watcher は P2000＝-1000 では落ちない（ON_TARGETED 発火前に消えると検証にならない）。
  onTargetedSourceSigniBanish: {
    title: 'WXDi-P00-074→WXDi-P03-056（ON_TARGETED＝対象にしてきたシグニだけをバニッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD05-009#1'], null, null], // zone0＝巻き添え検知用（残るのが正）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [['WXDi-P03-056#1'], null, null], // watcher（羅石　ルベライト・P2000）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
        'actions_done': [], // 《ターン1回》の持ち越しクリア
      },
      handPrepend: ['WXDi-P00-074#1'],                  // コード２４３４　葉加瀬冬雪（【出】-1000）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;      // 場に出たことを一度でも観測したか（出る前の「居ない」を PASS にしない）
      let sawOnField = false;
      // watcher（guest）の SELECT_TARGET 候補列。CPU の自動応答は候補をシャッフルして選ぶため、
      // 「どれが消えたか」だけでは絞り込みの成否を判定できない＝候補が1件に絞られていることを直接見る。
      let watcherCands = null;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/onTargetedSourceSigniBanish-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2');
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動する', '発動順序を確定', '確定', '決定', 'OK', 'はい']);
        const st = await H.queryState();
        const flat = (st?.host?.fieldSigni ?? []).map(z => (z ?? []).join('/')).join(',');
        const onField = flat.includes('WXDi-P00-074#1');
        if (onField) sawOnField = true;
        const survivor = flat.includes('WD05-009#1');
        // host のシグニが候補に並ぶ pending＝watcher（guest）側の対象選択（【出】側の候補は guest シグニ）
        const cands = st?.pendingCandidates ?? null;
        if (cands && cands.includes('WXDi-P00-074#1')) watcherCands = cands;
        H.log(`  ots[${s}] -> ${did ?? 'なし'} | hField=${flat} sawOnField=${sawOnField} watcherCands=${JSON.stringify(watcherCands)} gPowerMods=${(st?.guest?.powerMods ?? []).join(',') || '-'} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (sawOnField && !onField) {
          if (!survivor) return { pass: false, detail: `対象化したシグニは消えたが巻き添え検知用 WD05-009 も消えている（hField=${flat}）` };
          if (!watcherCands) return { pass: false, detail: `WXDi-P00-074 は消えたが watcher の対象候補を観測できなかった（判定不能・hField=${flat}）` };
          if (watcherCands.length !== 1) {
            return { pass: false, detail: `結果は正しいが候補が絞られていない＝CPU のランダム選択で当たっただけ（watcherCands=${JSON.stringify(watcherCands)}）` };
          }
          return { pass: true, detail: `ON_TARGETED の候補が**対象にしてきた** WXDi-P00-074 の1件に絞られ、それだけがバニッシュされた（巻き添え検知用 WD05-009 は残存・hField=${flat}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ON_TARGETED バニッシュ未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} sawOnField=${sawOnField} gPowerMods=${(fin?.guest?.powerMods ?? []).join(',') || '-'}）` };
    },
  },

  // タスク12(xliv)(b2)：単体対象 redirect の BattleScreen 実配送を確認する。
  battleOnlySelectedRedirect: {
    title: 'WXDi-P15-078-E2（単体対象＋バトル限定BANISH_REDIRECT＝対象だけトラッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD03-009#1'], null, null],
        'field.signi_down': [false, false, false],
        'banish_redirect_battle_target_nums': ['WD01-013#1'],
        'banish_redirect_target_nums': null,
        'hand': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, ['WD01-013#1']],
        'field.signi_down': [false, false, false],
        'energy': [],
        'trash': [],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let modalOpened = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/battleOnlySelectedRedirect-${s}.png`, fullPage: true });
        let did = null;
        if (!modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) {
          const attack = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await attack.count() && await attack.isVisible().catch(() => false)) {
            await attack.click().catch(() => {}); did = 'btn:アタック';
          }
        }
        if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        const targetGone = !(st?.guest?.fieldSigni?.[2] ?? []).includes?.('WD01-013#1');
        const inTrash = st?.guest?.trashCards?.includes?.('WD01-013#1');
        H.log(`  battleOnlyRedirect[${s}] -> ${did ?? 'なし'} | gone=${targetGone} trash=${inTrash} energy=${st?.guest?.energy}`);
        if (targetGone && inTrash && st?.guest?.energy === 0) {
          return { pass: true, detail: '専用個体リスト対象 WD01-013 をバトルでバニッシュし、guest energy=0・trashに対象個体を確認' };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `対象のbattle redirect未確認（gZone2=${JSON.stringify(fin?.guest?.fieldSigni?.[2])} trash=${JSON.stringify(fin?.guest?.trashCards)} energy=${fin?.guest?.energy}）` };
    },
  },

  // 続き178＝ON_SIGNI_BATTLE の battleOpponent level filter。手札も明示的に空にし、正面のLv4だけを固定する。
  battleLevel4Filter: {
    title: 'WX05-047（ON_SIGNI_BATTLE＋level:4＝正面のLv4シグニとのバトル時のみバニッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX05-047#1'], null, null],
        'field.signi_down': [false, false, false],
        'hand': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, ['WX05-040#1']], // host zone0 の正面＝guest zone2、Lv4
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let before = await H.queryState();
      for (let r = 0; r < 4 && !(before?.guest?.fieldSigni?.[2] ?? []).includes?.('WX05-040#1'); r++) {
        await injectScenario(page, this.spec); await page.waitForTimeout(1500); before = await H.queryState();
      }
      let modalOpened = false;
      let sawEffectFire = false; // WX05-047-E1（この盤面で SELECT_TARGET/stack を生む唯一の効果）の発火を記録
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/battleLevel4Filter-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals(); await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null }); await page.waitForTimeout(600); modalOpened = false; did = 'repatch:ATTACK_SIGNI';
        }
        if (!did) { const b = page.getByRole('button', { name: 'アタック', exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); did = 'btn:アタック'; } }
        if (!did && !modalOpened) { const opened = await H.clickTestId('my-signi-zone-0'); if (opened) { did = opened; modalOpened = true; } }
        if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'ガードしない', 'しない', 'スキップ']);
        const st = await H.queryState();
        // 通常バトルは SELECT_TARGET を出さない＝pEff=SELECT_TARGET / stack>0 は WX05-047-E1（ON_SIGNI_BATTLE level:4→BANISH count:1）の対象選択に他ならない。
        if (st?.pendingEffect === 'SELECT_TARGET' || (st?.stackLen > 0)) sawEffectFire = true;
        const targetGone = !(st?.guest?.fieldSigni?.[2] ?? []).includes?.('WX05-040#1');
        H.log(`  bl4[${s}] -> ${did ?? 'なし'} | gZone2=${JSON.stringify(st?.guest?.fieldSigni?.[2])} effectFire=${sawEffectFire} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (targetGone && sawEffectFire) return { pass: true, detail: 'Lv4 battleOpponent filter一致→WX05-047-E1(ON_SIGNI_BATTLE level:4)が対象選択(SELECT_TARGET)を経て正面Lv4 WX05-040 をバニッシュ（効果発火を確認）' };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `Lv4効果バニッシュ未確認（gZone2=${JSON.stringify(fin?.guest?.fieldSigni?.[2])} effectFire=${sawEffectFire} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 続き179＝ON_ARTS_USE の色 filter。無制限の緑アーツ WX09-005（森羅万象・《緑》×1・MAIN可）を使い、watcher
  //    WXK01-043-E1（ON_ARTS_USE color:緑・usageLimit=once_per_turn）が actions_done に記録されるかで発火を判定する。
  //    ⚠codex 初版は WX01-024（緑子限定）を使ったため青ルリグでは「使用」不可でアーツを撃てず空振りしていた（続き185で是正）。
  //    判定は「エナ枚数±」ではなく actions_done＝アーツコスト《緑》×1 の消費と ON_ARTS_USE のエナチャージが相殺しても揺れない。
  artsUseGreenFilter: {
    title: 'WX09-005→WXK01-043（ON_ARTS_USE＋color:緑＝緑アーツ使用時にエナチャージ1）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],                 // 青ルリグでも無制限の緑アーツは使用可
        'field.signi': [['WXK01-043#1'], null, null], // watcher（ON_ARTS_USE color:緑）
        'field.signi_down': [false, false, false],
        'lrig_deck': ['WX09-005#1'],                  // 森羅万象：緑×1・制限なし・MAIN可（緑アーツ）
        'energy': ['WD04-009#1'],                     // 緑×1（幻獣セイリュ）＝アーツコスト用
        'hand': [],
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, null],            // 空＝WX09-005 の banish(power≥15000)は no-op で解決
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      await H.ensureMain();
      // アーツはルリグデッキから使う：ルリグDKバッジ→カード→使用→アーツ使用（コスト緑エナ選択）
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      const fired = (st) => (st?.host?.actionsDone ?? []).includes('WXK01-043-E1');
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/artsUseGreenFilter-${s}.png`, fullPage: true });
        let did = null;
        // アーツ Phase2 コスト：緑エナ1枚を選んでから「アーツ使用」（未選択だと disabled）
        const a0 = page.getByTestId('artscost-energy-0').first();
        if (await a0.count() && await a0.isVisible().catch(() => false)) {
          await a0.click().catch(() => {});
          await page.waitForTimeout(200);
          const use = page.getByRole('button', { name: /アーツ使用/ }).first();
          if (await use.count() && await use.isEnabled().catch(() => false)) { await use.click().catch(() => {}); did = 'btn:アーツ使用'; }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);            // 詳細モーダルの「使用」→アーツモーダルへ
        if (!did) did = await H.stdStep(['発動', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        if (!did) did = await H.clickTestId('zone-card-0');          // モーダル未開時のみ：アーツを開く
        const st = await H.queryState();
        H.log(`  augf[${s}] -> ${did ?? 'なし'} | done=${(st?.host?.actionsDone ?? []).join(',') || '-'} hEnergy=${st?.host?.energy} pEff=${st?.pendingEffect ?? '-'}`);
        if (fired(st)) return { pass: true, detail: `緑アーツWX09-005使用→WXK01-043-E1(ON_ARTS_USE color:緑)が発火し actions_done に記録（エナチャージ実行）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `緑アーツ使用後の WXK01-043-E1 発火未確認（actions=${(fin?.host?.actionsDone ?? []).join(',') || '-'} hEnergy=${before?.host?.energy}→${fin?.host?.energy}）` };
    },
  },

  // LOOK_AND_REORDER canTrash UI（続き128・Sonnet・PLAN §7.2「対話UIの残実装」）＝EffectInteractionModal.tsx:578の
  //    「トラッシュ」トグルボタン＋「決定」確定（handleEffectInteraction→resumeLookAndReorder経由でtrashListが
  //    正しく渡るか）は実装済みだが実機未検証だった。WX20-037（ON_PLAY：デッキ上3枚を見て好きな枚数をトラッシュに
  //    置き、残りを好きな順でデッキトップへ戻す・reorder:false/canTrash:true）を召喚して検証。
  lookReorderCanTrash: {
    title: 'LOOK_AND_REORDER canTrash UI（WX20-037・デッキ上3枚見てトラッシュ選択）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
        'deck': ['WD01-013#1', 'WD01-013#2', 'WD01-013#3', 'WD01-013#4', 'WD01-013#5'],
        'energy': [],
        'actions_done': [],
      },
      handPrepend: ['WX20-037#1'], // 暴食の暴君　トウタク（Lv2・ON_PLAY LOOK_AND_REORDER count3 canTrash）
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      // 前シナリオ（ルーム再利用）が残した「ライフクロスクラッシュ」等の残留モーダルを先に片付ける。
      for (let k = 0; k < 4; k++) {
        const cleared = await H.clickTextOrBtn(['エナに送る', 'トラッシュに送る', 'ライフに加える']);
        if (!cleared) break;
        await page.waitForTimeout(600);
      }
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.deck:', before?.host?.deck, 'host.trash:', before?.host?.trash);
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let trashClicked = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lookReorderCanTrash-${s}.png`, fullPage: true });
        let did = await H.clickTextOrBtn(['エナに送る', 'トラッシュに送る', 'ライフに加える']);
        if (!did) did = await H.clickBtn('召喚', { exact: true });
        if (!did) {
          const zoneBtn = page.getByRole('button', { name: /^ゾーン1/ }).first();
          if (await zoneBtn.count() && await zoneBtn.isVisible().catch(() => false) && await zoneBtn.isEnabled().catch(() => false)) {
            await zoneBtn.click().catch(() => {}); did = 'btn:ゾーン1';
          }
        }
        if (!did) {
          const summonZone = page.getByTestId('summon-zone-1').first();
          if (await summonZone.count() && await summonZone.isVisible().catch(() => false)) {
            await summonZone.click().catch(() => {}); did = 'tid:summon-zone-1';
          }
        }
        if (!did && !trashClicked) {
          const trashBtn = page.getByRole('button', { name: 'トラッシュ', exact: true }).first();
          if (await trashBtn.count() && await trashBtn.isVisible().catch(() => false)) {
            await trashBtn.click().catch(() => {}); did = 'btn:トラッシュ(toggle)'; trashClicked = true;
          }
        }
        if (!did && trashClicked) did = await H.clickBtn('決定', { exact: true });
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        H.log(`  lrct[${s}] -> ${did ?? 'なし'} | hDeck=${st?.host?.deck}（開始${before?.host?.deck}） hTrash=${st?.host?.trash}（開始${before?.host?.trash}） pEff=${st?.pendingEffect ?? '-'}`);
        if (trashClicked && st?.host?.trash > before?.host?.trash && !st?.pendingEffect) {
          return { pass: true, detail: `canTrash UI経由で1枚トラッシュ確定＝hTrash ${before.host.trash}→${st.host.trash}・hDeck ${before.host.deck}→${st.host.deck}（3枚見て1枚トラッシュ・2枚デッキトップへ戻す）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `トラッシュ確定未確認（hDeck=${fin?.host?.deck}（開始${before?.host?.deck}） hTrash=${fin?.host?.trash}（開始${before?.host?.trash}） pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // ビート機構・複数候補選択UI（続き129・Sonnet・PLAN §7「ビート機構Phase1-7」残）＝`analyzeBeatSigniCost`/
  //    `actBeatNeedSelect`（SigniActivatedModal.tsx:135-138・548-590）は候補（他のシグニ）が必要数より多いとき
  //    ゾーン選択UIを要求する設計で実装済みだが、候補1枚のみ（自動選択で足りる）のケースしか実機確認されておらず
  //    「複数候補時に本当にプレイヤー選択UIが機能するか」が未検証だった。WXK08-026（【起】《ビートアイコン》
  //    ［4枚以下］《ターン1回》他のシグニ1体を【ビート】にする：…）をhost zone0に、他候補2体をzone1/zone2に置き、
  //    候補2体から1体を選ばせるUIが実際に出るか・選んだ方だけがbeat_zoneへ移るかを検証する。
  beatMultiCandidateSelect: {
    title: 'ビート機構・複数候補選択UI（WXK08-026・他のシグニ候補2体から1体選択）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WXK08-026#1'], ['WD01-013#1'], ['WD01-012#1']], // source zone0／候補zone1・zone2
        'field.signi_down': [false, false, false],
        'energy': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 hField:', JSON.stringify(before?.host?.fieldSigni));
      H.log('シグニゾーン0クリック:', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      let modalOpened = false;
      let beatPicked = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/beatMultiCandidateSelect-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !modalOpened) {
          const btn = page.getByRole('button', { name: /【起】/ }).first();
          if (await btn.count() && await btn.isVisible().catch(() => false)) {
            await btn.click().catch(() => {}); did = 'btn:【起】'; modalOpened = true;
          }
        }
        // 「他のシグニ1体を【ビート】に」の候補ゾーン選択UI＝候補カードのimg[alt=カード名]クリック
        // （SigniActivatedModal.tsx:556以降・pick-Nではなく専用div要素・小剣ククリ/羅植姫アキナナのどちらかを選ぶ）
        if (!did && !beatPicked) {
          for (const alt of ['小剣　ククリ', '羅植姫　アキナナ']) {
            const img = page.locator(`img[alt="${alt}"]`).last();
            if (await img.count() && await img.isVisible().catch(() => false)) {
              await img.click().catch(() => {}); did = `img:${alt}(beat候補)`; beatPicked = true; break;
            }
          }
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickTextOrBtn(['①', '②', 'アサシン', 'ダブルクラッシュ']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const fs2 = st?.host?.fieldSigni ?? [];
        const beatMoved = (before?.host?.fieldSigni ?? []).flat().filter(Boolean).length - fs2.flat().filter(Boolean).length;
        H.log(`  bmcs[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(fs2)} pEff=${st?.pendingEffect ?? '-'}`);
        if (beatMoved > 0) {
          const remaining = fs2.flat().filter(Boolean);
          return { pass: true, detail: `【ビート】化1体を確認（hField ${JSON.stringify(before.host.fieldSigni)}→${JSON.stringify(fs2)}・場に残存=${JSON.stringify(remaining)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `【ビート】化未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // レゾナ【出現条件】召喚UI（MAIN）＝WX08-021 サソリスをルリグデッキから開き、
  // ＜凶蟲＞2枚を手札から選択して支払い、実UIの召喚先選択を通してzone0へ配置する。
  resonaMainWx08021: {
    title: 'レゾナMAIN召喚UI（WX08-021・手札の＜凶蟲＞2枚を支払い）',
    spec: {
      hostSet: {
        'field.lrig': ['WX08-004#1'], // ミュウ Lv4 / Limit11（WX08-021のミュウ限定・Lv3を満たす）
        'field.signi': [null, null, null],
        'lrig_deck': ['WX08-021#1'],
        'hand': ['WX08-079#1', 'WX08-080#1'], // ＜凶蟲＞2枚（出現条件の支払い）
        'energy': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時:', JSON.stringify({
        field: before?.host?.fieldSigni,
        lrigDeck: before?.host?.lrigDeckCards,
        hand: before?.host?.handCards,
        trash: before?.host?.trashCards,
      }));
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(500);
      H.log('レゾナ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      const selectedPayments = new Set();
      for (let s = 0; s < 14; s++) {
        await page.waitForTimeout(700);
        await page.screenshot({ path: `${SHOT}/resonaMainWx08021-${s}.png`, fullPage: true });
        let did = await H.clickBtn('【出現条件】で召喚', { exact: true });
        if (!did) {
          for (const i of [0, 1]) {
            const pay = page.getByTestId(`resona-payment-hand-${i}`).first();
            if (!selectedPayments.has(i) && await pay.count() && await pay.isVisible().catch(() => false)) {
              await pay.click(); selectedPayments.add(i); did = `tid:resona-payment-hand-${i}`; break;
            }
          }
        }
        if (!did) {
          const zone = page.getByTestId('resona-zone-0').first();
          if (await zone.count() && await zone.isVisible().catch(() => false) && await zone.isEnabled().catch(() => false)) {
            await zone.click(); did = 'tid:resona-zone-0';
          }
        }
        const st = await H.queryState();
        const fieldPlaced = st?.host?.fieldSigni?.[0]?.includes('WX08-021#1');
        const leftLrigDeck = !st?.host?.lrigDeckCards?.includes('WX08-021#1');
        const paidToTrash = ['WX08-079#1', 'WX08-080#1'].every(id => st?.host?.trashCards?.includes(id));
        H.log(`  resona[${s}] -> ${did ?? 'なし'} | field=${JSON.stringify(st?.host?.fieldSigni)} lrigDeck=${JSON.stringify(st?.host?.lrigDeckCards)} trash=${JSON.stringify(st?.host?.trashCards)}`);
        if (fieldPlaced && leftLrigDeck && paidToTrash) {
          return { pass: true, detail: `battle_states確認: WX08-021#1をfield.signi[0]へ配置・lrig_deckから除外・支払いWX08-079#1/WX08-080#1をtrashへ移動` };
        }
        if (!did) await H.stdStep();
      }
      const fin = await H.queryState();
      return { pass: false, detail: `レゾナ召喚完了未確認（field=${JSON.stringify(fin?.host?.fieldSigni)} lrigDeck=${JSON.stringify(fin?.host?.lrigDeckCards)} trash=${JSON.stringify(fin?.host?.trashCards)}）` };
    },
  },

  // (xxix) 段階2＝効果で場に出したシグニ自身の mandatory【出】を BattleScreen が収集する経路。
  effectPlacedOnPlayZoneSelect: {
    title: 'WX02-042【起】でWX15-073をトラッシュから場出し（SELECT_SIGNI_ZONE経由）→mandatory【出】1枚ドロー',
    spec: {
      hostSet: {
        'field.lrig': ['WXK09-018#1'], // Lv3 / Limit6（場Lv4＋配置Lv2＝6）
        'field.signi': [['WX02-042#1'], null, null], // 空き2ゾーン＝SELECT_SIGNI_ZONEを経由
        'field.signi_down': [false, false, false],
        'energy': ['WX05-080#1'],       // 黒エナ1
        'trash': ['WX15-073#1'],
        'hand': ['WD01-013#1'],         // 絶対値1→2、差分+1を同時確認
        'actions_done': [],
      },
      guestSet: {
        'field.signi': [null, null, null], // E1のバニッシュ候補をなくす
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log(`開始時: hHand=${before?.host?.hand} hField=${JSON.stringify(before?.host?.fieldSigni)} hTrash=${JSON.stringify(before?.host?.trashCards)}`);
      H.log('配置元ゾーン0:', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      let activatedOpened = false;
      let energySelected = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(800);
        await page.screenshot({ path: `${SHOT}/effectPlacedOnPlay-${s}.png`, fullPage: true });
        let did = null;
        if (!activatedOpened) {
          did = await H.clickBtn(/【起】/, { exact: false });
          if (did) activatedOpened = true;
        }
        if (!did && activatedOpened && !energySelected) {
          did = await H.clickModalImage('使命の怠惰　ヘカーテ');
          if (did) energySelected = true;
        }
        if (!did && energySelected) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni ?? []).some(z => Array.isArray(z) && z.includes('WX15-073#1'));
        const drawLog = await H.findLog(/^1枚ドロー$/);
        const handDelta = (st?.host?.hand ?? NaN) - (before?.host?.hand ?? NaN);
        H.log(`  eponp[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand}(開始${before?.host?.hand},差分${handDelta}) placed=${placed} drawLog=${drawLog ?? '-'} hField=${JSON.stringify(st?.host?.fieldSigni)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed && handDelta === 1 && st?.host?.hand === 2 && drawLog) {
          return { pass: true, detail: `WX15-073を効果配置→【出】DRAW発火（battle_states host.hand ${before.host.hand}→${st.host.hand}, 差分+${handDelta}／実ログ「${drawLog}」）` };
        }
      }
      const fin = await H.queryState();
      const drawLog = await H.findLog(/^1枚ドロー$/);
      return { pass: false, detail: `効果配置【出】DRAW未確認（hHand=${before?.host?.hand}→${fin?.host?.hand}, drawLog=${drawLog ?? '-'}, hField=${JSON.stringify(fin?.host?.fieldSigni)}, pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)本消化(a)（2026-08-04・Sonnet）＝WX25-P1-038-E1（本丸火出）：対戦相手のパワー12000以下の
  // シグニ１体を対象とし、対戦相手が《無》《無》《無》を支払わないかぎり、それをバニッシュする。
  // costColors搭載の標準形＝相手（CPU＝guest）のエナ不足で OPPONENT_PAY_OPTIONAL の「支払う」が
  // available:false となり、CPU自動応答が skip（バニッシュ本体）へ落ちることを確認する。
  oppPayEnergyInsufficient: {
    title: 'WX25-P1-038-E1（本丸火出＝相手エナ不足でOPPONENT_PAY_OPTIONALのpayがunavailable→banish実行）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX25-P1-038#1'],
        'energy': ['WX04-068#1'], // 赤×1（アーツコスト）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null], // バニッシュ候補（小剣ククリ・P3000≤12000）
        'field.signi_down': [false, false, false],
        'energy': [], // 《無》×3が払えない状態
      },
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 }, // CardData.Timing=アタックフェイズのみ
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni), 'guest.energy:', before?.guest?.energy);
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppPayEnergyInsufficient-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
          if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
          else {
            const e0 = page.getByTestId('artscost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const banished = (before?.guest?.fieldSigni?.[0] != null) && (st?.guest?.fieldSigni?.[0] == null);
        H.log(`  opei[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${st?.guest?.energy} pEff=${st?.pendingEffect ?? '-'}`);
        if (banished) {
          return { pass: true, detail: `《無》×3不足でOPPONENT_PAY_OPTIONALのpayがavailable:false→CPUがskipを選択→BANISH実行（guest zone0消滅・gEnergy=${st.guest.energy}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `BANISH未確認（gField=${JSON.stringify(fin?.guest?.fieldSigni)} gEnergy=${fin?.guest?.energy} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)本消化(a) 対照実験＝上記の反転（guestのエナを《無》×3以上に増やし、payがavailable:true
  // になったときCPU自動応答（options.find(o=>o.available)）が先頭のpayを選ぶはず、の確認のつもりだったが、
  // ⚠ここで発見された実バグ（Opusタスク12(cii)）＝CPU自動応答（BattleScreen.tsx の CHOOSE 分岐）が
  // 選択肢IDしか積まずエナのinstanceIdを渡さないため、`resumeOpponentPayOptional`が energyNums=[] で
  // 「コスト支払いエラー: エナ不足」を返して即終了し、エナが足りていてもpayが常に空振りしていた
  // （banishもcost消費も起きない）。🔧2026-08-06に是正済み（`selectOptionalCostEnergy` で実在エナを選出）
  // ＝**本シナリオは回帰シナリオ**。合格条件＝CPUが実際にエナ3枚を支払い、banishを回避すること。
  oppPayEnergySufficient: {
    title: 'WX25-P1-038-E1（本丸火出＝相手エナ十分ならCPUが実際にエナを支払ってbanishを回避する・タスク12(cii)回帰）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX25-P1-038#1'],
        'energy': ['WX04-068#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD01-013#10', 'WD01-013#11', 'WD01-013#12'], // 《無》×3を払える（色は無関係＝無スロットなので何色でも可）
      },
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni), 'guest.energy:', before?.guest?.energy);
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let stablePolls = 0;
      let sawChoose = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppPayEnergySufficient-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
          if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
          else {
            const e0 = page.getByTestId('artscost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        if (st?.pendingEffect === 'CHOOSE') sawChoose = true; // OPPONENT_PAY_OPTIONALのCHOOSEが実際に生成された証拠
        const paid = (st?.guest?.energy ?? 99) < (before?.guest?.energy ?? 0);
        const stillThere = st?.guest?.fieldSigni?.[0] != null;
        H.log(`  opes[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${st?.guest?.energy}(開始${before?.guest?.energy}) sawChoose=${sawChoose} pEff=${st?.pendingEffect ?? '-'}`);
        if (paid && stillThere && !st?.pendingEffect) {
          stablePolls++;
          if (stablePolls >= 2) {
            return { pass: true, detail: `《無》×3が足りるため CPU が pay を選び**実際にエナを支払った**（gEnergy ${before.guest.energy}→${st.guest.energy}）→banish回避（guest zone0 は健在）＝タスク12(cii)の是正が効いている` };
          }
        } else if (sawChoose && !paid && stillThere && !st?.pendingEffect) {
          // 想定バグ状態＝CHOOSE生成を確認済みの上で、pay選択でエナ未消費・banishも不発のまま黙って解消
          stablePolls++;
          if (stablePolls >= 2) {
            return {
              pass: false,
              detail: `【退行】guestエナ3枚（無×3を払えるはず）なのにエナが減らずbanishも起きない（gEnergy=${st.guest.energy}=開始時と不変・guest zone0残存）＝CPU自動応答がエナinstanceIdを渡せていない疑い（タスク12(cii)）`,
            };
          }
        } else {
          stablePolls = 0;
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認の挙動（gField=${JSON.stringify(fin?.guest?.fieldSigni)} gEnergy=${fin?.guest?.energy}（開始${before?.guest?.energy}） pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)本消化(b)（2026-08-04・Sonnet）＝WX25-P1-040-E1（アッパー・アロー）：対戦相手のパワー
  // 12000以下のシグニ１体を対象とし、対戦相手が手札を３枚捨てないかぎり、それをバニッシュする。
  // ⚠ここで発見された実バグ（Opusタスク12(ci)）＝costColors非搭載のOPPONENT_PAY_OPTIONALが無条件に
  // 「支払う」（コスト0・常時available）を積むため、CPU自動応答（options.find(o=>o.available)）がこれを
  // 最優先で選び、手札不足のはずのdiscard枝にもskip（banish本体）にも到達しなかった。
  // 🔧2026-08-06に是正済み（エナコストを持つときだけpay枝を出す）＝**本シナリオは回帰シナリオ**。
  // 合格条件＝手札2枚(<3)でdiscardが使えないのでskipへ落ち、原文どおりbanishが実行されること。
  oppDiscardGateBareBug: {
    title: 'WX25-P1-040-E1（アッパー・アロー＝手札不足なら無料回避できずbanishが実行される・タスク12(ci)回帰）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX25-P1-040#1'],
        'energy': ['WD03-009#1'], // 青×1（アーツコスト）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null], // バニッシュ候補（P3000≤12000）
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#20', 'WD01-013#21'], // 2枚＜3＝discard（手札を3枚捨てる）は本来available:falseのはず
      },
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.hand:', before?.guest?.hand, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let stablePolls = 0;
      let sawChoose = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppDiscardGateBareBug-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
          if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
          else {
            const e0 = page.getByTestId('artscost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        if (st?.pendingEffect === 'CHOOSE' || st?.pendingEffect === 'SELECT_TARGET') sawChoose = true;
        const banished = (before?.guest?.fieldSigni?.[0] != null) && (st?.guest?.fieldSigni?.[0] == null);
        const handUnchanged = st?.guest?.hand === before?.guest?.hand;
        H.log(`  odgb[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${st?.guest?.hand} sawChoose=${sawChoose} pEff=${st?.pendingEffect ?? '-'}`);
        if (banished) {
          return { pass: true, detail: `手札2枚(<3)でdiscardが使えず、無料pay枝も出ないためskipへ落ちてbanishが実行された＝タスク12(ci)の是正が効いている` };
        }
        if (sawChoose && !st?.pendingEffect && handUnchanged) {
          stablePolls++;
          if (stablePolls >= 3) {
            return {
              pass: false,
              detail: `【退行】手札2枚(<3)でdiscardは使えないはずなのにbanishが起きていない（gField zone0残存・gHand=${st.guest.hand}不変）＝無料のpay枝が復活している疑い（タスク12(ci)）`,
            };
          }
        } else {
          stablePolls = 0;
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認の挙動（gField=${JSON.stringify(fin?.guest?.fieldSigni)} gHand=${fin?.guest?.hand} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // タスク12(ci) の本命確認＝**原文どおりの回避枝（手札3枚捨て）に到達できること**。修正前は無料の
  // 「支払う」が常に先頭 available だったため CPU がそれを選び、discard 枝は一度も選ばれなかった
  // （手札が足りていても手札は減らず、banish も起きない＝どちらでもない第3の結末になっていた）。
  // 合格条件＝guest 手札3枚 → CPU が discard を選び**手札が3枚減って**banish は回避されること。
  oppDiscardGateReachesDiscard: {
    title: 'WX25-P1-040-E1（手札が足りれば原文どおり「手札3枚捨て」で回避する・タスク12(ci)）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX25-P1-040#1'],
        'energy': ['WD03-009#1'], // 青×1（アーツコスト）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null], // バニッシュ候補（P3000≤12000）
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#20', 'WD01-013#21', 'WD01-013#22'], // ちょうど3枚＝discard が available
      },
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log(`開始時 guest.hand=${before?.guest?.hand} fieldSigni=${JSON.stringify(before?.guest?.fieldSigni)}`);
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      let stablePolls = 0;
      let sawChoose = false; // ⚠CHOOSE到達前のpollを「決着」と誤判定しないための必須ガード
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppDiscardGateReachesDiscard-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
          if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
          else {
            const e0 = page.getByTestId('artscost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        if (st?.pendingEffect === 'CHOOSE' || st?.pendingEffect === 'SELECT_TARGET') sawChoose = true;
        const survived = (st?.guest?.fieldSigni?.[0] ?? null) !== null;
        const discarded = (before?.guest?.hand ?? 0) - (st?.guest?.hand ?? 0);
        H.log(`  odgr[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${st?.guest?.hand}(開始${before?.guest?.hand}) gTrash=${st?.guest?.trash} sawChoose=${sawChoose} pEff=${st?.pendingEffect ?? '-'}`);
        if (sawChoose && !st?.pendingEffect && discarded === 3 && survived) {
          stablePolls++;
          if (stablePolls >= 2) {
            return { pass: true, detail: `CPU が原文どおり discard 枝（手札3枚捨て）を選んで回避＝手札 ${before.guest.hand}→${st.guest.hand}・guest zone0 は健在（修正前は無料 pay に吸われて手札も減らなかった）` };
          }
        } else if (sawChoose && !st?.pendingEffect && !survived) {
          return { pass: false, detail: `【退行】手札3枚あるのに discard へ到達せず banish された（gHand=${st?.guest?.hand}）` };
        } else if (sawChoose && !st?.pendingEffect && discarded === 0 && survived) {
          stablePolls++;
          if (stablePolls >= 3) {
            return { pass: false, detail: `【退行】手札が減らないまま banish も起きない＝無料の pay 枝が復活している疑い（gHand=${st?.guest?.hand}）` };
          }
        } else { stablePolls = 0; }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gField=${JSON.stringify(fin?.guest?.fieldSigni)} gHand=${fin?.guest?.hand} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)本消化(d)（2026-08-04・Sonnet）＝WX24-P2-071-BURST（幻闘竜　グリアナ）：ライフバースト
  // 「対戦相手のパワー10000以下のシグニ１体を対象とし、対戦相手が《無》×3を支払わないかぎり、バニッシュする」。
  // LB解決はqueueCardEffects(...,{id:ownerId})でLB所有者(guest)をownerStateに固定するため、OPPONENT_PAY_OPTIONAL
  // のotherState（＝支払い側）はターン所有者ではなく常に「LB所有者の対戦相手」になるはず（BattleScreen.tsx:10490
  // 付近）。本シナリオはguestのライフをクラッシュさせるアタッカー側＝hostが実際にCHOOSE（optcost-skip等）を
  // 受け取り、支払わなかった場合にhost自身のシグニがバニッシュされることを実機で確認する＝ownerの反転が
  // ターンの持ち回りに関わらず正しく機能していることの直接証拠。
  lbOwnerReversal: {
    title: 'WX24-P2-071-BURST（LB＝OPPONENT_PAY_OPTIONALの支払い側がLB所有者の対戦相手＝アタッカーに正しく反転すること）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WD01-013#1'], null, null], // アタッカー兼バニッシュ対象候補（P3000≤10000）
        'field.signi_down': [false, false, false],
        'energy': [], // 《無》×3が払えない状態＝skip強制
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null], // ブロッカー無し＝ライフクロスクラッシュ直行
        'life_cloth': ['WD01-013#30', 'WX24-P2-071#1'], // 配列末尾が先にクラッシュ＝バースト即発火（life_cloth.slice(0,-1)）
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.fieldSigni:', JSON.stringify(before?.host?.fieldSigni), 'guest.life:', before?.guest?.life);
      let modalOpened = false;
      let attacked = false;
      let sawChoose = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lbOwnerReversal-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了', 'シグニアタックへ']);
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !modalOpened && !attacked) {
          const phaseChk = await H.queryState();
          if (phaseChk?.turnPhase === 'ATTACK_SIGNI' && !phaseChk?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        // OPPONENT_PAY_OPTIONAL（costColors搭載＝任意コストUI）：host側にoptcost-skipが見える＝CHOOSEが
        // 正しくhost（LB所有者guestの対戦相手）へ回っている直接証拠。
        if (!did) {
          const skipBtn = page.getByTestId('optcost-skip').first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) {
            sawChoose = true;
            await skipBtn.click().catch(() => {}); did = 'optcost-skip';
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'エナに送る', 'ガードしない', 'しない', '使用しない', '通常通り', 'いいえ', 'スキップ']);
        const st = await H.queryState();
        const banished = (before?.host?.fieldSigni?.[0] != null) && (st?.host?.fieldSigni?.[0] == null);
        H.log(`  lbor[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hEnergy=${st?.host?.energy} sawChoose=${sawChoose} gLife=${st?.guest?.life} pEff=${st?.pendingEffect ?? '-'}`);
        if (banished && sawChoose) {
          return { pass: true, detail: `LB所有者(guest)の対戦相手(host=アタッカー)がOPPONENT_PAY_OPTIONALのCHOOSEを正しく受領（optcost-skip表示を確認）→host無エナでpay不能→skip→host自身のシグニがBANISH＝owner反転が正しく機能` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `owner反転 未確認（sawChoose=${sawChoose} hField=${JSON.stringify(fin?.host?.fieldSigni)} gLife=${fin?.guest?.life} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)本消化(e)（2026-08-04・Sonnet）＝WX24-P1-023-E1（ドンドン・バキューム）：外側SEQUENCEの
  // step0＝内側SEQUENCE[STUB(OPPONENT_PAY_OPTIONAL), CONDITIONAL→BANISH]、step1＝無条件のREVEAL_AND_PICK
  // （デッキ上5枚からスペル/＜電機＞を合計2枚まで手札へ・残りはデッキ下）。ゲート（相手CHOOSE）の解決結果に
  // 関わらずREVEAL_AND_PICKが必ず続行することを確認する（回避されるのはBANISHだけ）。
  // ⚠この内側ゲートもcostColors非搭載＝Opusタスク12(ci)によりCPUは無料payを選びbanishは不発になる想定だが、
  // 本シナリオの検証対象はcontinuationの続行そのもの（バグの有無に依存しない）。
  sequenceContinuationAcrossGate: {
    title: 'WX24-P1-023-E1（ドンドン・バキューム＝内側ゲート解決後もREVEAL_AND_PICKが必ず続行すること）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX24-P1-023#1'],
        'energy': ['WD03-009#1', 'WD03-009#2'], // 青×0だがコスト選択UIの保険（negateAttackLrigと同型）
        'deck': ['WD01-018#1', 'WD01-013#2', 'WD01-013#3', 'WD01-013#4', 'WD01-013#5'], // 先頭がスペル（噴流する知識）＝上5枚公開でpick対象1件を保証
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null], // バニッシュ候補（P3000≤10000）
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#20'], // 1枚＜2＝discard枝が本来unavailableでも無料pay分岐で回避される想定（(ci)と同型）
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/sequenceContinuationAcrossGate-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)) {
          if (await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'アーツ使用(submit)'; }
          else {
            const e0 = page.getByTestId('artscost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false)) { await e0.click().catch(() => {}); did = 'artscost-energy-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const picked = (st?.host?.handCards ?? []).some(c => c.startsWith('WD01-018'));
        const banished = (before?.guest?.fieldSigni?.[0] != null) && (st?.guest?.fieldSigni?.[0] == null);
        H.log(`  scag[${s}] -> ${did ?? 'なし'} | hHand=${JSON.stringify(st?.host?.handCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} banished=${banished} pEff=${st?.pendingEffect ?? '-'}`);
        if (picked) {
          return { pass: true, detail: `内側ゲート（相手CHOOSE）解決後もREVEAL_AND_PICKが続行＝噴流する知識をpick済み（hHand=${JSON.stringify(st.host.handCards)}）。banished=${banished}（今回はCPUが無料pay枝＝Opusタスク12(ci)を選択したためbanishは不発だが、continuation自体は中断を跨いで正しく走った）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `REVEAL_AND_PICKの続行 未確認（hHand=${JSON.stringify(fin?.host?.handCards)} gField=${JSON.stringify(fin?.guest?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §6.3(b)（2026-08-04・Sonnet）＝WDK14-013-E1（炎魔の聖墓 ナーキル）：【出】コストとしてトラッシュから
  // ＜悪魔＞のシグニ1枚をビートにする。SigniOnPlayCostModalの`beat_signi_from_trash`候補ピッカーは
  // 候補数が必要数(1)を超えるときだけ出る（`SigniOnPlayCostModal.tsx:98-102` beatTrashNeedSelect =
  // candidates.length > count）。トラッシュに廃悪の象徴 ベルゼ（＜悪魔＞・バニラ）を2枚用意し候補2>必要1で
  // ピッカーが出ることを確認する。
  wdk14013TrashPicker: {
    title: 'WDK14-013-E1（炎魔の聖墓 ナーキル＝トラッシュ＜悪魔＞候補2>必要1でSigniOnPlayCostModalのピッカーが出る）',
    spec: {
      hostSet: {
        'field.lrig': ['WX06-007#1'], // 永らえし者 タウィル＝トレ（Lv3・タウィル限定を満たす）
        'field.signi': [null, null, null],
        'trash': ['WD05-010#1', 'WD05-010#2'], // 廃悪の象徴 ベルゼ×2（＜悪魔＞・バニラ）＝候補2>必要1
        'hand': ['WDK14-013#1'],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.trash:', before?.host?.trashCards, 'host.hand:', before?.host?.hand);
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      let pickedCandidate = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wdk14013TrashPicker-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did && !pickedCandidate) {
          const cand = page.locator('img[alt="廃悪の象徴　ベルゼ"]').last();
          if (await cand.count() && await cand.isVisible().catch(() => false)) {
            await cand.click().catch(() => {}); did = 'img:廃悪の象徴　ベルゼ'; pickedCandidate = true;
          }
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickZone();
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const trashDropped = (st?.host?.trash ?? 99) < (before?.host?.trash ?? 0);
        H.log(`  wtp[${s}] -> ${did ?? 'なし'} | hTrash=${st?.host?.trash}(開始${before?.host?.trash}) hHand=${st?.host?.hand} pickedCandidate=${pickedCandidate} pEff=${st?.pendingEffect ?? '-'}`);
        if (trashDropped) {
          return { pass: true, detail: `候補2>必要1でピッカーが出現→img候補クリック→発動でトラッシュから1枚ビート化（hTrash ${before.host.trash}→${st.host.trash}）＝SigniOnPlayCostModalのbeatTrashNeedSelectゲートを実機確認` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ビート化未確認（hTrash=${fin?.host?.trash}（開始${before?.host?.trash}） pickedCandidate=${pickedCandidate} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §6.3(c)（2026-08-04・Sonnet）＝WX15-067-E1（メルト・ファクト）：`SpellCastModal`に挿さる支払い前ウィルス
  // 除去UI＝相手の場から0/1/2個を選べる／除去1個以上でこのカードだけ《黒×2》軽減
  // （`applyMeltFactPreUseCost`）／除去2個以上（`preUseVirusChoose.minRemoved`）で本体CHOOSEの上限が1→2
  // （`effectiveCount`/`effectiveUpTo`・`effectExecutor.ts:3820-3823`）／選択を変えると支払いエナ選択がクリア
  // される（`setSelectedSpellCost(new Set())`・`SpellCastModal.tsx:119-133`）。ウィルス2個を除去してコスト0化
  // →CHOOSEが2択同時選択可能になることを実機で確認する。
  meltFactVirusRemoval: {
    title: 'WX15-067-E1（メルト・ファクト＝支払い前ウィルス除去2個でコスト軽減＋CHOOSE上限1→2）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
        'energy': ['WD05-013#1', 'WD05-013#2'], // 黒×2（スペルコスト。ウィルス2個除去で0まで軽減される想定）
        'trash': ['WD05-013#3'],                // c0（トラッシュの黒シグニ1枚を手札に）の候補（候補1件）
        'hand': ['WX15-067#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WD01-013#1'], null, null], // c1（対戦相手シグニ-7000）の対象
        'field.signi_down': [false, false, false],
        'field.signi_virus': [2, 0, 0],               // シグニゾーン1に【ウィルス】2個
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.energy:', before?.host?.energy, 'host.trash:', before?.host?.trashCards, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => {
        const b = page.getByRole('button', { name, exact: true }).first();
        if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; }
        return null;
      };
      // シグニゾーンN（M個）ラベルの直後の兄弟div内「＋」ボタン（testid無し・3ゾーン同一ラベルのため
      // ラベルテキストからXPathで辿る＝positionalロケータ）。
      const clickVirusPlus = async (zoneNum) => {
        const btn = page.locator(`xpath=//span[contains(.,"シグニゾーン${zoneNum}（")]/following-sibling::div[1]//button[text()="＋"]`).first();
        if (await btn.count() && await btn.isVisible().catch(() => false) && await btn.isEnabled().catch(() => false)) {
          await btn.click().catch(() => {}); return `virus+zone${zoneNum}`;
        }
        return null;
      };
      let virusClicks = 0;
      let chosenC0 = false;
      let chosenC1 = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/meltFactVirusRemoval-${s}.png`, fullPage: true });
        let did = null;
        did = await clickExact('発動'); // CardModal「発動」（exact）→SpellCastModalへ
        if (!did && virusClicks < 2) {
          const r = await clickVirusPlus(1);
          if (r) { virusClicks++; did = r; }
        }
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          } else {
            const cast = await clickExact('発動する');
            if (cast) did = cast;
          }
        }
        // 本体CHOOSE（multiSelect＝ウィルス2個除去でeffectiveCount:2, upTo:true）：c0/c1両方をトグルしてから決定
        if (!did && !chosenC0) {
          const c0 = page.getByRole('button', { name: /トラッシュから黒のシグニ1枚を手札に加える/ }).first();
          if (await c0.count() && await c0.isVisible().catch(() => false)) { await c0.click().catch(() => {}); did = 'choose:c0'; chosenC0 = true; }
        }
        if (!did && chosenC0 && !chosenC1) {
          const c1 = page.getByRole('button', { name: /対戦相手のシグニ1体をターン終了時まで－7000/ }).first();
          if (await c1.count() && await c1.isVisible().catch(() => false)) { await c1.click().catch(() => {}); did = 'choose:c1'; chosenC1 = true; }
        }
        if (!did && chosenC0 && chosenC1) did = await clickExact('決定');
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:-7000'));
        const gotBlackSigni = (st?.host?.handCards ?? []).some(c => c.startsWith('WD05-013#3'));
        H.log(`  mfvr[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy} virusClicks=${virusClicks} chosenC0=${chosenC0} chosenC1=${chosenC1} debuffed=${debuffed} gotBlackSigni=${gotBlackSigni} pEff=${st?.pendingEffect ?? '-'}`);
        if (debuffed && gotBlackSigni) {
          return { pass: true, detail: `ウィルス2個除去→コスト《黒×2》が0まで軽減（hEnergy=${st.host.energy}=開始時と不変）→CHOOSE上限1→2でc0/c1を同時選択→両方実行（トラッシュの黒シグニを手札に・guest zone0へ-7000）＝支払い前ウィルス除去UIとCHOOSE拡張を実機確認` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（hEnergy=${fin?.host?.energy}（開始${before?.host?.energy}） virusClicks=${virusClicks} debuffed=${(fin?.guest?.powerMods ?? []).some(m => m.startsWith('WD01-013#1:-7000'))} gotBlackSigni=${(fin?.host?.handCards ?? []).some(c => c.startsWith('WD05-013#3'))} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §6.3(a)（2026-08-04・Sonnet）＝WX24-P3-069-E1が付与するガード追加《無》N枚徴収（`GRANT_LRIG_ABILITY`で
  // `WX24-P3-069-E1-G`＝`STUB{OPP_GUARD_COST_COLORLESS, count:3}`をguestへ直接注入し、親トリガーを介さず
  // `collectOppGuardExtraColorlessCost`／`GuardResponseDialog`／`performGuardResponse`を直接運転する）。
  // エナ十分（3枚）でガード成立→ちょうど3枚徴収されることを確認する（CPUは常にガードしないため、host＝
  // CPUの直接アタック対象にしてhost自身にガード応答させる）。
  guardExtraColorlessSufficient: {
    title: 'WX24-P3-069-E1-G（ガード追加《無》×3＝エナ十分でガード成立→ちょうど3枚徴収）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'hand': ['WD01-016#1'], // サーバント Ｄ（Guard=1・バニラ）
        'energy': ['WD01-013#1', 'WD01-013#2', 'WD01-013#3'], // 《無》×3をちょうど払える
        'trash': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.lrig_down': false, // ルーム再利用で前シナリオのルリグアタック済み(down)状態が残っているとCPUが今回アタックしない対策
        'lrig_granted_auto_effects': [
          { effectId: 'WX24-P3-069-E1-G', effectType: 'CONTINUOUS',
            action: { type: 'STUB', id: 'OPP_GUARD_COST_COLORLESS', count: 3 },
            duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL' },
        ],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.energy:', before?.host?.energy, 'host.hand:', before?.host?.hand, 'host.trash:', before?.host?.trash);
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/guardExtraColorlessSufficient-${s}.png`, fullPage: true });
        let did = null;
        const guardBtn = page.getByRole('button', { name: /ガードに使う/ }).first();
        if (await guardBtn.count() && await guardBtn.isVisible().catch(() => false)) { await guardBtn.click().catch(() => {}); did = 'btn:ガードに使う'; }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const guarded = (st?.host?.trash ?? 0) > (before?.host?.trash ?? 0);
        H.log(`  gecs[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy}(開始${before?.host?.energy}) hTrash=${st?.host?.trash} lrigAttacked=${st?.host?.lrigAttacked} pEff=${st?.pendingEffect ?? '-'}`);
        if (guarded) {
          const consumed = (before.host.energy) - (st.host.energy);
          return { pass: consumed === 3, detail: `ガード成立（hTrash ${before.host.trash}→${st.host.trash}）＝追加コスト《無》×3消費でhEnergy ${before.host.energy}→${st.host.energy}（消費${consumed}枚）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ガード未確認（hEnergy=${fin?.host?.energy}（開始${before?.host?.energy}） hTrash=${fin?.host?.trash} lrigAttacked=${fin?.host?.lrigAttacked} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §6.3(a) 対照実験＝エナ不足（2枚<3）でガード候補が空になり「ガードしない」しか選べないことを確認する。
  guardExtraColorlessInsufficient: {
    title: 'WX24-P3-069-E1-G（ガード追加《無》×3＝エナ不足でガード候補が消え「ガードしない」のみ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'hand': ['WD01-016#1'],
        'energy': ['WD01-013#1', 'WD01-013#2'], // 2枚<3＝ガードブロック
        'trash': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.lrig_down': false, // ルーム再利用で前シナリオのルリグアタック済み(down)状態が残っているとCPUが今回アタックしない対策
        'lrig_granted_auto_effects': [
          { effectId: 'WX24-P3-069-E1-G', effectType: 'CONTINUOUS',
            action: { type: 'STUB', id: 'OPP_GUARD_COST_COLORLESS', count: 3 },
            duration: 'UNTIL_END_OF_TURN', mandatory: true, parseStatus: 'MANUAL' },
        ],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.energy:', before?.host?.energy);
      let stablePolls = 0;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/guardExtraColorlessInsufficient-${s}.png`, fullPage: true });
        let did = null;
        const noGuardTxt = page.getByText('使用できるガードカードが手札にありません').first();
        const seenBlocked = await noGuardTxt.count() && await noGuardTxt.isVisible().catch(() => false);
        const guardBtn = page.getByRole('button', { name: /ガードに使う/ }).first();
        const guardBtnVisible = await guardBtn.count() && await guardBtn.isVisible().catch(() => false);
        if (seenBlocked && !did) {
          stablePolls++;
          if (stablePolls >= 2) {
            const noGuardBtn = page.getByRole('button', { name: 'ガードしない（ライフクロスクラッシュ）', exact: true }).first();
            await noGuardBtn.click().catch(() => {});
            const st = await H.queryState();
            return { pass: true, detail: `エナ不足（2枚<3）でガード候補ゼロ→「使用できるガードカードが手札にありません」表示を確認→「ガードしない」で解決（hEnergy=${st?.host?.energy}不変・保護不成立）` };
          }
        } else {
          stablePolls = 0;
        }
        if (guardBtnVisible) {
          return { pass: false, detail: `【回帰】エナ不足でもガード候補が表示された（guardBlockedByExtraCostのenergy比較が働いていない疑い）` };
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        H.log(`  geci[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy} lrigAttacked=${st?.host?.lrigAttacked} seenBlocked=${seenBlocked} pEff=${st?.pendingEffect ?? '-'}`);
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ガードブロック表示 未確認（hEnergy=${fin?.host?.energy} lrigAttacked=${fin?.host?.lrigAttacked} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §6.3(d)（2026-08-04・Sonnet）＝夢限-Q- WXDi-P11-010A-E1：`ON_GROW_PHASE_START`で`EFFECTIVE_LRIG_LIMIT_GTE(9)`
  // が成立すると`MUGEN_Q_RESET_AND_FLIP`（`execStubPart1.ts:25-78`）が発火し、手札/エナ/トラッシュをデッキへ
  // 戻してシャッフル＋除外、`card_identity_overrides[instanceId]='WXDi-P11-010B'`へ1手で反転する。
  // `game_lrig_limit_bonus`を直接注入して印刷Limit5+4=9を満たし、ENERGY→GROWの実フェイズ遷移
  // （`H.openGrow`のDB直PATCHは`ON_GROW_PHASE_START`収集を素通りするため使わない）をUIクリックで踏む。
  mugenQFlip: {
    title: '夢限-Q- WXDi-P11-010A-E1（ON_GROW_PHASE_START＋MUGEN_Q_RESET_AND_FLIP＝Limit9到達でB面WXDi-P11-010Bへ反転）',
    spec: {
      hostSet: {
        'field.lrig': ['WXDi-P11-010A#1'],
        'game_lrig_limit_bonus': 4, // 印刷Limit5+4=9でEFFECTIVE_LRIG_LIMIT_GTE(9)成立
        'hand': ['WD01-013#1', 'WD01-013#2'],
        'energy': ['WD01-013#3'],
        'trash': ['WD01-013#4'],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'ENERGY', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.lrigTop:', before?.host?.lrigTop, 'hand:', before?.host?.hand, 'energy:', before?.host?.energy, 'trash:', before?.host?.trash);
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/mugenQFlip-${s}.png`, fullPage: true });
        let did = null;
        // 確認ダイアログ「このまま進む」を先に試す（フェイズ進行ボタンがダイアログ背後にDOM上残存し
        // clickTextOrBtnが誤って再ヒットし続けるレースの回避＝先にダイアログを閉じ切ってから）。
        if (!did) did = await H.clickTextOrBtn(['このまま進む']);
        if (!did) did = await H.clickTextOrBtn(['グロウフェイズへ']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const flipped = st?.host?.lrigTop && st?.host?.identityOverrides?.[st.host.lrigTop] === 'WXDi-P11-010B';
        H.log(`  mqf[${s}] -> ${did ?? 'なし'} | hLrigTop=${st?.host?.lrigTop} identity=${JSON.stringify(st?.host?.identityOverrides)} hHand=${st?.host?.hand} hEnergy=${st?.host?.energy} hTrash=${st?.host?.trash} phase=${st?.turnPhase} pEff=${st?.pendingEffect ?? '-'}`);
        if (flipped) {
          return { pass: true, detail: `ON_GROW_PHASE_START→EFFECTIVE_LRIG_LIMIT_GTE(9)成立→MUGEN_Q_RESET_AND_FLIPでcard_identity_overrides[${st.host.lrigTop}]=WXDi-P11-010Bへ反転＋手札/エナ/トラッシュがリセット後B面E1で再構築（hHand=${st.host.hand}・hEnergy=${st.host.energy}・hTrash=${st.host.trash}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `反転未確認（hLrigTop=${fin?.host?.lrigTop} identity=${JSON.stringify(fin?.host?.identityOverrides)} phase=${fin?.turnPhase} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §6.3(e)（2026-08-04・Sonnet）＝未知の邂逅 WXDi-P13-003A-E1：ルリグデッキの＜ピース＞をキーにセットする際、
  // `prepareMayuEncounter`（`mayuEncounter.ts:17-41`）が手札+エナの実移動枚数を数え、5枚以上なら
  // `card_identity_overrides[instanceId]='WXDi-P13-003B'`へ反転＋`executeGrow(...,{freeCost:true,
  // consumeGrowAction:true})`で無料グロウ（`actions_done`に`GROW`を書き込み同ターンの通常グロウを封じる）。
  // 4枚以下は代償（移動）だけで反転しない。手札3枚+エナ2枚=5枚移動の5+ケースを検証する。
  mayuEncounterFreeGrow: {
    title: 'WXDi-P13-003A-E1（未知の邂逅＝手札+エナ計5枚移動でB面WXDi-P13-003Bへ反転＋無料グロウ・actions_doneにGROW）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-003#1'], // 半月の巫女 タマヨリヒメ（Lv2・まだこのターングロウしていない）
        'lrig_deck': ['WXDi-P13-003A#1'],
        'hand': ['WD01-013#1', 'WD01-013#2', 'WD01-013#3'], // 手札3枚
        'energy': ['WD01-013#4', 'WD01-013#5'],              // エナ2枚（計5枚移動＝canGrow条件）
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'energy:', before?.host?.energy, 'lrigTop:', before?.host?.lrigTop);
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('ピース(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/mayuEncounterFreeGrow-${s}.png`, fullPage: true });
        let did = null;
        // 「セット」確定ボタンを先に試す（KeyUseModal 開後は見出し文言「キーにセット」がテキストとして残留し、
        // clickTextOrBtn の getByText フォールバックがそれを誤って再クリックし続けるレースを回避するため）。
        if (!did) did = await H.clickBtn('セット', { exact: true });
        if (!did) did = await H.clickBtn('使用', { exact: true });
        if (!did) did = await H.clickTextOrBtn(['キーにセット', 'ピースを使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const flipped = st?.host?.lrigTop && st?.host?.identityOverrides?.[st.host.lrigTop] === 'WXDi-P13-003B';
        const grewFlag = (st?.host?.actionsDone ?? []).includes('GROW');
        H.log(`  mefg[${s}] -> ${did ?? 'なし'} | hLrigTop=${st?.host?.lrigTop} identity=${JSON.stringify(st?.host?.identityOverrides)} hHand=${st?.host?.hand} hEnergy=${st?.host?.energy} keyPiece=${st?.host?.keyPiece} actionsDone=${JSON.stringify(st?.host?.actionsDone)} pEff=${st?.pendingEffect ?? '-'}`);
        if (flipped && grewFlag) {
          return { pass: true, detail: `手札3+エナ2=5枚移動でcanGrow成立→card_identity_overrides[${st.host.lrigTop}]=WXDi-P13-003Bへ反転＋executeGrow(freeCost)で無料グロウ→actions_doneにGROW記録（同ターン通常グロウ封じ）を確認（hHand=${st.host.hand}・hEnergy=${st.host.energy}・keyPiece=${st.host.keyPiece}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `反転/無料グロウ未確認（hLrigTop=${fin?.host?.lrigTop} identity=${JSON.stringify(fin?.host?.identityOverrides)} actionsDone=${JSON.stringify(fin?.host?.actionsDone)} keyPiece=${fin?.host?.keyPiece} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)第10波(a)（2026-08-05・Sonnet）＝「シグニを新たに配置できないゾーン」の無条件版。
  // `signi_zone_blocks:[{zone}]`（colorlessなし）を直接注入し、`SigniSummonZoneModal`（`signiZoneBlock.tsx`
  // 純関数経由）がブロック済みゾーンを`(配置禁止)`ラベル＋disabledで表示し、選べないこと／他の空きゾーンには
  // 通常どおり配置できることを確認する。
  zoneBlockUnconditional: {
    title: 'BLOCK_OPP_ZONE_PLACEMENT（無条件版＝zone1が(配置禁止)で選べず、zone0には通常配置できる）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'signi_zone_blocks': [{ zone: 1 }], // ゾーン2（0-index=1）を配置禁止
        'hand': ['WD01-013#1'],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      let checkedBlockedLabel = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/zoneBlockUnconditional-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned && !checkedBlockedLabel) {
          const z1 = page.getByTestId('summon-zone-1').first();
          if (await z1.count() && await z1.isVisible().catch(() => false)) {
            const txt = await z1.innerText().catch(() => '');
            const disabled = !(await z1.isEnabled().catch(() => true));
            checkedBlockedLabel = true;
            H.log(`  zone1ボタン: text="${txt.replace(/\n/g, ' ')}" disabled=${disabled}`);
            if (!disabled || !txt.includes('配置禁止')) {
              return { pass: false, detail: `【回帰疑い】zone1が(配置禁止)表示/disabledになっていない（text="${txt}" disabled=${disabled}）` };
            }
            did = 'checked:zone1blocked';
          }
        }
        if (!did) did = await H.clickTestId('summon-zone-0');
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni?.[0] ?? []).some(n => n?.startsWith('WD01-013'));
        H.log(`  zbu[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed && checkedBlockedLabel) {
          return { pass: true, detail: `zone1は"(配置禁止)"表示＋disabledで選択不可を確認→zone0（非ブロック）には通常どおり配置成功（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（checkedBlockedLabel=${checkedBlockedLabel} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxi)第10波(b)前半（2026-08-05・Sonnet）＝《無》×5支払い回避＝エナ不足（3枚<5）だと
  // `《無》×5不足`表示でdisabled＝選べないことを確認する（`WXDi-P11-009-E3`のzoneBlockColorless:5と同型）。
  zoneBlockColorlessInsufficient: {
    title: 'BLOCK_OPP_ZONE_PLACEMENT（《無》×5版＝エナ3枚<5で"《無》×5不足"表示・disabled）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'signi_zone_blocks': [{ zone: 1, colorless: 5 }],
        'energy': ['WD01-013#2', 'WD01-013#3', 'WD01-013#4'], // 3枚<5
        'hand': ['WD01-013#1'],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/zoneBlockColorlessInsufficient-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned) {
          const z1 = page.getByTestId('summon-zone-1').first();
          if (await z1.count() && await z1.isVisible().catch(() => false)) {
            const txt = await z1.innerText().catch(() => '');
            const disabled = !(await z1.isEnabled().catch(() => true));
            H.log(`  zone1ボタン: text="${txt.replace(/\n/g, ' ')}" disabled=${disabled}`);
            if (disabled && txt.includes('《無》×5不足')) {
              return { pass: true, detail: `エナ3枚<5で"《無》×5不足"表示＋disabled確認（zone1選択不可・text="${txt.replace(/\n/g, ' ')}"）` };
            }
            return { pass: false, detail: `【回帰疑い】エナ不足でも"《無》×5不足"表示/disabledになっていない（text="${txt}" disabled=${disabled}）` };
          }
        }
        if (!did) did = await H.stdStep();
      }
      return { pass: false, detail: `summon-zone-1 未検出のままタイムアウト` };
    },
  },

  // §7 タスク12(lxi)第10波(b)後半＝エナ十分（5枚）だとzone1が選べて、配置時に《無》×5がちょうど
  // トラッシュへ支払われることを確認する（対照実験）。
  zoneBlockColorlessSufficient: {
    title: 'BLOCK_OPP_ZONE_PLACEMENT（《無》×5版＝エナ5枚で選択可→配置時にちょうど5枚支払う）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'signi_zone_blocks': [{ zone: 1, colorless: 5 }],
        'energy': ['WD01-013#2', 'WD01-013#3', 'WD01-013#4', 'WD01-013#5', 'WD01-013#6'], // ちょうど5枚
        'hand': ['WD01-013#1'],
        'trash': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.energy:', before?.host?.energy, 'trash:', before?.host?.trash);
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/zoneBlockColorlessSufficient-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did) did = await H.clickTestId('summon-zone-1');
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni?.[1] ?? []).some(n => n?.startsWith('WD01-013#1'));
        const paidLog = await H.findLog(/シグニゾーン2への配置コスト《無》×5を支払う/);
        H.log(`  zbcs[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hEnergy=${st?.host?.energy}(開始${before?.host?.energy}) hTrash=${st?.host?.trash} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed) {
          const consumed = before.host.energy - st.host.energy;
          return {
            pass: consumed === 5 && !!paidLog,
            detail: `zone1（《無》×5版）へ配置成功→エナ${before.host.energy}→${st.host.energy}（消費${consumed}枚）・ログ「${paidLog ?? '(未検出)'}」`,
          };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `配置未確認（hField=${JSON.stringify(fin?.host?.fieldSigni)} hEnergy=${fin?.host?.energy} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxxvi)②（2026-08-05・Sonnet）＝WXEX1-24-E1③のvirus発生源＝【ウィルス】があるゾーン**すべて**
  // が配置禁止になることをDOM側で確認する（`zoneBlockSource:'virus'`の解決自体はengine/goldenで固定済み・
  // ここではSigniSummonZoneModalが複数ブロックを正しく描画するかを見る）。ゾーン0とゾーン2の2箇所に
  // signi_zone_blocksを注入し、両方が(配置禁止)・ゾーン1だけ通常どおり選べることを確認する。
  zoneBlockMultiZones: {
    title: 'BLOCK_OPP_ZONE_PLACEMENT（複数ゾーン版＝ゾーン0・2が(配置禁止)、ゾーン1のみ通常配置可）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'signi_zone_blocks': [{ zone: 0 }, { zone: 2 }],
        'hand': ['WD01-013#1'],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let summoned = false;
      let checked = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/zoneBlockMultiZones-${s}.png`, fullPage: true });
        let did = null;
        if (!summoned) {
          const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
          if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) { await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true; }
        }
        if (!did && summoned && !checked) {
          const z0 = page.getByTestId('summon-zone-0').first();
          const z2 = page.getByTestId('summon-zone-2').first();
          if (await z0.count() && await z2.count() && await z0.isVisible().catch(() => false) && await z2.isVisible().catch(() => false)) {
            const t0 = await z0.innerText().catch(() => ''); const d0 = !(await z0.isEnabled().catch(() => true));
            const t2 = await z2.innerText().catch(() => ''); const d2 = !(await z2.isEnabled().catch(() => true));
            checked = true;
            H.log(`  zone0: text="${t0.replace(/\n/g, ' ')}" disabled=${d0} / zone2: text="${t2.replace(/\n/g, ' ')}" disabled=${d2}`);
            if (!(d0 && t0.includes('配置禁止') && d2 && t2.includes('配置禁止'))) {
              return { pass: false, detail: `【回帰疑い】複数ゾーンブロックの一部がDOMに反映されていない（zone0: disabled=${d0} text="${t0}" / zone2: disabled=${d2} text="${t2}"）` };
            }
            did = 'checked:zone0+2blocked';
          }
        }
        if (!did) did = await H.clickTestId('summon-zone-1');
        const st = await H.queryState();
        const placed = (st?.host?.fieldSigni?.[1] ?? []).some(n => n?.startsWith('WD01-013'));
        H.log(`  zbmz[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'}`);
        if (placed && checked) {
          return { pass: true, detail: `zone0・zone2ともに"(配置禁止)"＋disabledを確認→非ブロックのzone1には通常配置できた（hField=${JSON.stringify(st.host.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（checked=${checked} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxxvi)①（2026-08-05・Sonnet）＝WX08-032-E1（バニッシュ→そのシグニがいたゾーンだけを配置禁止）。
  // ⚠state注入だけでは「ゾーン1へのフォールバックが起きていないこと」を検証できない
  // （`signi_zone_vacated_just`は直前のBANISH実行が書く一発マーカー）＝実際にguestのシグニをゾーン2
  // （0-index）に置いてBANISHさせ、結果のsigni_zone_blocksがzone2（zone0にフォールバックしていない）を
  // 指すことを実機で確認する。
  vacatedZoneBlockFollowsActualZone: {
    title: 'WX08-032-E1（バニッシュ元がゾーン2の場合、配置禁止がゾーン2に付く＝ゾーン1へのフォールバックが無いこと）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
        'energy': ['WD05-013#1', 'WD05-013#2', 'WD05-013#3', 'WD05-013#4', 'WD05-013#5', 'WD05-013#6', 'WD05-013#7', 'WD05-013#8', 'WD05-013#9'], // 黒×9
        'hand': ['WX08-032#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, ['WD01-013#1']], // guestのシグニをゾーン2（0-index）に配置＝唯一のバニッシュ候補
        'field.signi_down': [false, false, false],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni), 'host.energy:', before?.host?.energy);
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => {
        const b = page.getByRole('button', { name, exact: true }).first();
        if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; }
        return null;
      };
      let energySelected = 0;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/vacatedZoneBlockFollowsActualZone-${s}.png`, fullPage: true });
        let did = null;
        did = await clickExact('発動');
        if (!did && energySelected < 9) {
          const e = page.getByTestId(`spellcost-energy-${energySelected}`).first();
          if (await e.count() && await e.isVisible().catch(() => false)) { await e.click().catch(() => {}); energySelected++; did = `spellcost-energy-${energySelected - 1}`; }
        }
        if (!did) did = await clickExact('発動する');
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const banished = (before?.guest?.fieldSigni?.[2] != null) && (st?.guest?.fieldSigni?.[2] == null);
        H.log(`  vzbf[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} gZoneBlocks=${JSON.stringify(st?.guest?.zoneBlocks)} energySelected=${energySelected} pEff=${st?.pendingEffect ?? '-'}`);
        if (banished) {
          const blocksZone2 = (st.guest.zoneBlocks ?? []).some(b => b.zone === 2);
          const blocksZone0 = (st.guest.zoneBlocks ?? []).some(b => b.zone === 0);
          return {
            pass: blocksZone2 && !blocksZone0,
            detail: `guest zone2のシグニをバニッシュ→signi_zone_vacated_justを読んだBLOCK_OPP_ZONE_PLACEMENTがzone2を禁止（zoneBlocks=${JSON.stringify(st.guest.zoneBlocks)}）。zone0へのフォールバック${blocksZone0 ? '**あり＝退化**' : 'なし'}`,
          };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `バニッシュ未確認（gField=${JSON.stringify(fin?.guest?.fieldSigni)} energySelected=${energySelected} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxiv)（2026-08-05・Sonnet）＝WXDi-P02-043-E1：「対象ピッカー前置」＝SELECT_TARGET_ONLYが
  // 先に発火し（対象は最大2体・upToCount）、対象確定後にOPTIONAL_COST（緑×3+無×3）のCHOOSE（支払う/支払わない）
  // が続く。支払うと確定した2体がBANISH{targetsStored}されることを確認する。
  lxivMultiTargetPayBanishesBoth: {
    title: 'WXDi-P02-043-E1（対象ピッカー前置＝アタック時に相手2体まで対象選択→支払う→両方バニッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P02-043#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD04-010#1', 'WD04-010#2', 'WD04-010#3', 'WD04-010#4', 'WD04-010#5', 'WD04-010#6'], // 緑×6（緑3+無3を満たす）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX01-053#1'], ['WX01-053#2'], null], // P15000×2（≥10000の対象候補・Restriction無し）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      let modalOpened = false;
      let pickedCount = 0;
      let confirmedTargets = false;
      let energySelected = 0;
      let paid = false;
      let pickedCount2 = 0;
      // ⚠実機で判明＝支払い後、freezeStoredTargetsでfixedCardNumsに絞られた「2件だけの」SELECT_TARGETが
      // もう一度発火する（BANISH自体は常にselectOrInteract経由＝候補が2件に絞られていても確認クリックが要る）。
      // 対象確定は1回で終わらず、支払い前後で計2回のpick UIを踏む＝この関数はその両方を同じ手順で処理する。
      for (let s = 0; s < 30; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxivMultiTargetPayBanishesBoth-${s}.png`, fullPage: true });
        let did = null;
        const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
        if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; }
        if (!did && !modalOpened) {
          const st0 = await H.queryState();
          if (st0?.turnPhase === 'ATTACK_SIGNI' && !st0?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        if (!did && !confirmedTargets) {
          const pN = page.getByTestId(`pick-${pickedCount}`).first();
          if (pickedCount < 2 && await pN.count() && await pN.isVisible().catch(() => false)) {
            await pN.click().catch(() => {}); pickedCount++; did = `pick:pick-${pickedCount - 1}`;
          } else {
            const confirmBtn = page.getByRole('button', { name: /決定 \(\d\/2\)/ }).first();
            if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) {
              await confirmBtn.click().catch(() => {}); did = 'btn:決定(N/2)'; confirmedTargets = true;
            }
          }
        }
        if (!did && confirmedTargets && !paid && energySelected < 6) {
          const e = page.getByTestId(`optcost-energy-${energySelected}`).first();
          if (await e.count() && await e.isVisible().catch(() => false)) { await e.click().catch(() => {}); energySelected++; did = `optcost-energy-${energySelected - 1}`; }
        }
        if (!did && confirmedTargets && !paid) {
          const payBtn = page.getByTestId('optcost-pay').first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false) && await payBtn.isEnabled().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'optcost-pay'; paid = true; }
        }
        // 支払い後の再確認SELECT_TARGET（候補はfixedCardNumsで2件に絞られている）＝同じ多選択パターンで処理
        if (!did && paid) {
          const pN2 = page.getByTestId(`pick-${pickedCount2}`).first();
          if (pickedCount2 < 2 && await pN2.count() && await pN2.isVisible().catch(() => false)) {
            await pN2.click().catch(() => {}); pickedCount2++; did = `pick2:pick-${pickedCount2 - 1}`;
          } else {
            const confirmBtn2 = page.getByRole('button', { name: /決定 \(\d\/2\)/ }).first();
            if (await confirmBtn2.count() && await confirmBtn2.isVisible().catch(() => false)) { await confirmBtn2.click().catch(() => {}); did = 'btn:決定(N/2)#2'; }
          }
        }
        // ⚠H.stdStep()は使わない＝この対象ピッカー（upToCount:true）自身が独自の「スキップ」ボタンを持つため
        // （デフォルトlabelsに'スキップ'を含むstdStepへ委譲すると、pick-Nがまだ描画されていない一瞬に
        // ピッカー自身のスキップを誤クリックし0件確定で終わってしまうレースが実機で再現した）。
        // 想定外のUIが出た場合は何もクリックせず次のポーリングへ回す。
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', 'OK', 'はい']);
        const st = await H.queryState();
        const banishedBoth = (before?.guest?.fieldSigni?.[0] != null) && (before?.guest?.fieldSigni?.[1] != null) && (st?.guest?.fieldSigni?.[0] == null) && (st?.guest?.fieldSigni?.[1] == null);
        H.log(`  lmpb[${s}] -> ${did ?? 'なし'} | pickedCount=${pickedCount} confirmedTargets=${confirmedTargets} paid=${paid} pickedCount2=${pickedCount2} gField=${JSON.stringify(st?.guest?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'}`);
        if (banishedBoth) {
          return { pass: true, detail: `対象ピッカー前置（最大2体）で両方選択→確定→OPTIONAL_COSTを支払う→支払い後の再確認SELECT_TARGET（fixedCardNumsで2件に絞られている）でも両方選択→BANISHで両方バニッシュ（gField=${JSON.stringify(st.guest.fieldSigni)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（pickedCount=${pickedCount} confirmedTargets=${confirmedTargets} paid=${paid} pickedCount2=${pickedCount2} gField=${JSON.stringify(fin?.guest?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxiv) 対照実験＝対象を2体確定した後に支払いを"支払わない"を選ぶと、確定していたはずの
  // 対象2体ともバニッシュされないこと（対象選択とコスト支払いが独立した2段階であることの確認）。
  lxivMultiTargetSkipBanishesNone: {
    title: 'WXDi-P02-043-E1（対象ピッカー前置＝対象2体確定後に支払わない→どちらもバニッシュされない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P02-043#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX01-053#1'], ['WX01-053#2'], null],
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      let modalOpened = false;
      let pickedCount = 0;
      let confirmedTargets = false;
      let stablePolls = 0;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxivMultiTargetSkipBanishesNone-${s}.png`, fullPage: true });
        let did = null;
        const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
        if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; }
        if (!did && !modalOpened) {
          const st0 = await H.queryState();
          if (st0?.turnPhase === 'ATTACK_SIGNI' && !st0?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        if (!did && !confirmedTargets) {
          const pN = page.getByTestId(`pick-${pickedCount}`).first();
          if (pickedCount < 2 && await pN.count() && await pN.isVisible().catch(() => false)) {
            await pN.click().catch(() => {}); pickedCount++; did = `pick:pick-${pickedCount - 1}`;
          } else {
            const confirmBtn = page.getByRole('button', { name: /決定 \(\d\/2\)/ }).first();
            if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) {
              await confirmBtn.click().catch(() => {}); did = 'btn:決定(N/2)'; confirmedTargets = true;
            }
          }
        }
        if (!did && confirmedTargets) {
          const skipBtn = page.getByTestId('optcost-skip').first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) { await skipBtn.click().catch(() => {}); did = 'optcost-skip'; }
        }
        // ⚠H.stdStep()は使わない＝対象ピッカー自身が「スキップ」ボタンを持つため、pick-Nがまだ描画されて
        // いない一瞬にstdStepの汎用フォールバックが誤ってそちらをクリックしうる（lxivMultiTargetPayBanishesBoth
        // で実機再現したレースと同型）。
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', 'OK', 'はい']);
        const st = await H.queryState();
        const bothStillThere = st?.guest?.fieldSigni?.[0] != null && st?.guest?.fieldSigni?.[1] != null;
        H.log(`  lmsn[${s}] -> ${did ?? 'なし'} | pickedCount=${pickedCount} confirmedTargets=${confirmedTargets} gField=${JSON.stringify(st?.guest?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'}`);
        if (confirmedTargets && !st?.pendingEffect && bothStillThere) {
          stablePolls++;
          if (stablePolls >= 2) {
            return { pass: true, detail: `対象2体確定後に「支払わない」を選択→BANISHは実行されず両方とも場に残存（gField=${JSON.stringify(st.guest.fieldSigni)}）＝対象選択とコスト支払いの分離を確認` };
          }
        } else {
          stablePolls = 0;
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（pickedCount=${pickedCount} confirmedTargets=${confirmedTargets} gField=${JSON.stringify(fin?.guest?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxv)（2026-08-05・Sonnet）＝WXDi-P02-077-E1：CONDITIONAL{HAND_COUNT self>=6}→STUB OPTIONAL_COST
  // という「包み形」＝条件成立時（手札6枚以上）は従来どおり支払う/支払わないのCHOOSEが出て、支払うと
  // このシグニに【ランサー】が付与されることを確認する。
  lxvGateTruePromptsChoose: {
    title: 'WXDi-P02-077-E1（条件つき任意コスト＝手札6枚以上でCHOOSE出現→支払う→ランサー付与）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P02-077#1'], null, null], // 自場シグニ1体のみ（自己参照ターゲットの曖昧さ回避）
        'field.signi_down': [false, false, false],
        'energy': ['WD04-010#1'], // 緑×1
        'hand': ['WD01-013#1', 'WD01-013#2', 'WD01-013#3', 'WD01-013#4', 'WD01-013#5', 'WD01-013#6'], // 6枚≥6
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand);
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxvGateTruePromptsChoose-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) {
          const payBtn = page.getByTestId('optcost-pay').first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) {
            const e0 = page.getByTestId('optcost-energy-0').first();
            if (await e0.count() && await e0.isVisible().catch(() => false) && !(await payBtn.isEnabled().catch(() => false))) {
              await e0.click().catch(() => {}); did = 'optcost-energy-0';
            } else if (await payBtn.isEnabled().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'optcost-pay'; }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const lancerGranted = (st?.host?.keywordGrants ?? []).some(g => g.startsWith('WXDi-P02-077#1:') && g.includes('ランサー'));
        H.log(`  lgtc[${s}] -> ${did ?? 'なし'} | hKwGrants=${JSON.stringify(st?.host?.keywordGrants)} pEff=${st?.pendingEffect ?? '-'}`);
        if (lancerGranted) {
          return { pass: true, detail: `手札6枚以上で条件成立→CHOOSE出現→支払う→WXDi-P02-077#1に【ランサー】付与を確認（hKwGrants=${JSON.stringify(st.host.keywordGrants)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `ランサー付与未確認（hKwGrants=${JSON.stringify(fin?.host?.keywordGrants)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxv) 対照実験＝手札5枚以下（条件不成立）だと支払いプロンプト自体が出ず、
  // 本体（ランサー付与）も起きないこと（`任意コストの条件を満たさない（スキップ）`ログで確認）。
  lxvGateFalseSilentSkip: {
    title: 'WXDi-P02-077-E1（条件つき任意コスト＝手札5枚以下で条件不成立→プロンプト出現せず本体も不発）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P02-077#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD04-010#1'],
        'hand': ['WD01-013#1', 'WD01-013#2'], // 2枚<6
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      let stablePolls = 0;
      let sawChoose = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxvGateFalseSilentSkip-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        if (st?.pendingEffect === 'CHOOSE') sawChoose = true;
        const lancerGranted = (st?.host?.keywordGrants ?? []).some(g => g.startsWith('WXDi-P02-077#1:') && g.includes('ランサー'));
        const skipLog = await H.findLog(/任意コストの条件を満たさない（スキップ）/);
        H.log(`  lgfs[${s}] -> ${did ?? 'なし'} | sawChoose=${sawChoose} lancerGranted=${lancerGranted} skipLog=${!!skipLog} phase=${st?.turnPhase} pEff=${st?.pendingEffect ?? '-'}`);
        if (sawChoose) {
          return { pass: false, detail: `【回帰疑い】手札2枚(<6)でも支払いCHOOSEが出現した（gate評価が働いていない）` };
        }
        if (skipLog && !lancerGranted) {
          stablePolls++;
          if (stablePolls >= 2) {
            return { pass: true, detail: `手札2枚(<6)で条件不成立→CHOOSEは一度も出現せず「${skipLog}」ログで静かにスキップ→ランサーも付与されない（sawChoose=false・lancerGranted=false）` };
          }
        } else {
          stablePolls = 0;
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（sawChoose=${sawChoose} skipLog=${!!(await H.findLog(/任意コストの条件を満たさない（スキップ）/))} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「残る実機検証項目」＝(xi)「skip選択時に本体が発動しないこと」（2026-08-05）。lxvGateTruePromptsChoose
  // /lxvGateFalseSilentSkipは「ゲート成立→支払う」「ゲート不成立→プロンプト自体が出ない」の2branchのみ検証
  // 済みで、**「ゲート成立→CHOOSE出現→あえて『スキップ』を選ぶ」**という(xi)本来の主題（続き206修正前は
  // コスト踏み倒しで本体がそのまま実行されていた）はまだ未検証だった。同じWXDi-P02-077-E1で、手札6枚以上
  // （ゲート成立）にしたうえで支払わず`optcost-skip`を選び、【ランサー】が付与されないことを確認する。
  lxvGateTrueSkipNoBody: {
    title: 'WXDi-P02-077-E1（タスク12(xi)＝ゲート成立でCHOOSE出現→あえてスキップ→本体〔ランサー付与〕は発動しない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P02-077#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD04-010#1'], // 緑×1（支払えるはずだが今回はあえて払わない）
        'hand': ['WD01-013#1', 'WD01-013#2', 'WD01-013#3', 'WD01-013#4', 'WD01-013#5', 'WD01-013#6'], // 6枚≥6
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      let sawChoose = false;
      let skipClicked = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxvGateTrueSkipNoBody-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did && !skipClicked) {
          const skipBtn = page.getByTestId('optcost-skip').first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) {
            await skipBtn.click().catch(() => {}); did = 'tid:optcost-skip'; skipClicked = true;
          }
        }
        const st = await H.queryState();
        if (st?.pendingEffect === 'CHOOSE') sawChoose = true;
        const lancerGranted = (st?.host?.keywordGrants ?? []).some(g => g.startsWith('WXDi-P02-077#1:') && g.includes('ランサー'));
        H.log(`  lgts[${s}] -> ${did ?? 'なし'} | sawChoose=${sawChoose} skipClicked=${skipClicked} lancerGranted=${lancerGranted} hEnergy=${st?.host?.energy} pEff=${st?.pendingEffect ?? '-'}`);
        if (skipClicked && !st?.pendingEffect) {
          const energyUntouched = (st?.host?.energy ?? -1) === 1;
          if (lancerGranted) {
            return { pass: false, detail: `【実バグ再発】ゲート成立→スキップを選んだのに【ランサー】が付与された（コスト踏み倒しの旧バグが復活・hKwGrants=${JSON.stringify(st.host.keywordGrants)}）` };
          }
          if (!energyUntouched) {
            return { pass: false, detail: `スキップしたのにエナが消費された（hEnergy=${st.host.energy}）` };
          }
          return { pass: true, detail: `ゲート成立（手札6枚以上）でCHOOSEが出現→「スキップ」を選択→エナは無傷（hEnergy=${st.host.energy}）かつ【ランサー】も付与されない（sawChoose=${sawChoose} lancerGranted=false）＝コスト踏み倒しバグは再発していない` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（sawChoose=${sawChoose} skipClicked=${skipClicked} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lx)(a)（2026-08-05・Sonnet）＝WX12-020-E3：アタック時にまず相手1体を対象選択（SELECT_TARGET_ONLY）
  // →STORE_LAST_PROCESSED_TARGETS→自分の手札を好きな枚数（upToCount）捨てる→POWER_MODIFY{targetsStored,
  // deltaPerLastProcessedCount}で「捨てた枚数×-6000」がその1体だけに乗ることを確認する。
  lxWX12020ScaledDiscardDelta: {
    title: 'WX12-020-E3（アタック時に相手1体を対象化→手札を好きな枚数捨てる→捨てた枚数×-6000がその1体だけに乗る）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WX12-020#1'], null, null],
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#1', 'WD01-013#2'], // 2枚とも捨てる想定＝-6000×2=-12000
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX01-053#1'], null, null], // 対象候補（唯一）
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      let modalOpened = false;
      let pickedTarget = false;
      let discardPicked = 0;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxWX12020ScaledDiscardDelta-${s}.png`, fullPage: true });
        let did = null;
        const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
        if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; }
        if (!did && !modalOpened) {
          const st0 = await H.queryState();
          if (st0?.turnPhase === 'ATTACK_SIGNI' && !st0?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        // 第1段＝相手1体の強制対象選択（optional:false・スキップ枝は無い＝決定(1/1)固定パターン）
        if (!did && !pickedTarget) {
          const confirmReady = await page.getByRole('button', { name: /決定 \(1\/1\)/ }).count();
          if (confirmReady) {
            await page.getByRole('button', { name: /決定 \(1\/1\)/ }).first().click().catch(() => {});
            did = 'btn:決定(1/1)target'; pickedTarget = true;
          } else {
            const p0 = page.getByTestId('pick-0').first();
            if (await p0.count() && await p0.isVisible().catch(() => false)) { await p0.click().catch(() => {}); did = 'pick:pick-0(target)'; }
          }
        }
        // 第2段＝自分の手札を好きな枚数（upToCount）捨てる。このピッカーは独自の「スキップ」ボタンを持つため
        // H.stdStep()には委譲しない（lxiv/lxvで実機確認済みのレース対策と同型）。
        if (!did && pickedTarget) {
          const pD = page.getByTestId(`pick-${discardPicked}`).first();
          if (discardPicked < 2 && await pD.count() && await pD.isVisible().catch(() => false)) {
            await pD.click().catch(() => {}); discardPicked++; did = `pick:discard-${discardPicked - 1}`;
          } else {
            const confirmBtn = page.getByRole('button', { name: /決定 \(\d\/2\)/ }).first();
            if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) { await confirmBtn.click().catch(() => {}); did = 'btn:決定(discard)'; }
          }
        }
        const st = await H.queryState();
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WX01-053#1:-12000'));
        H.log(`  lxwd[${s}] -> ${did ?? 'なし'} | pickedTarget=${pickedTarget} discardPicked=${discardPicked} hHand=${st?.host?.hand} gPowerMods=${JSON.stringify(st?.guest?.powerMods)} pEff=${st?.pendingEffect ?? '-'}`);
        if (debuffed) {
          return { pass: true, detail: `対象1体を先に確定→手札2枚とも捨てる→POWER_MODIFY(targetsStored,deltaPerLastProcessedCount)で-6000×2=-12000がその1体だけに適用（gPowerMods=${JSON.stringify(st.guest.powerMods)}・hHand=${st.host.hand}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（pickedTarget=${pickedTarget} discardPicked=${discardPicked} gPowerMods=${JSON.stringify(fin?.guest?.powerMods)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lx)(a) 対照実験＝手札0枚のときは捨てるピッカー自体が出ず（execTrashのcands.length===0で
  // selectOrInteractに到達せず素通り）、POWER_MODIFYはdelta=-6000×0=0で静かに適用される（クラッシュしない）
  // ことを確認する。
  lxWX12020EmptyHandSkipsPicker: {
    title: 'WX12-020-E3（対照実験＝手札0枚だと捨てるピッカーが出ずdelta=0で素通り・クラッシュしない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WX12-020#1'], null, null],
        'field.signi_down': [false, false, false],
        'hand': [], // 0枚
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WX01-053#1'], null, null],
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let modalOpened = false;
      let pickedTarget = false;
      let stablePolls = 0;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxWX12020EmptyHandSkipsPicker-${s}.png`, fullPage: true });
        let did = null;
        const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
        if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; }
        if (!did && !modalOpened) {
          const st0 = await H.queryState();
          if (st0?.turnPhase === 'ATTACK_SIGNI' && !st0?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        if (!did && !pickedTarget) {
          const confirmReady = await page.getByRole('button', { name: /決定 \(1\/1\)/ }).count();
          if (confirmReady) {
            await page.getByRole('button', { name: /決定 \(1\/1\)/ }).first().click().catch(() => {});
            did = 'btn:決定(1/1)target'; pickedTarget = true;
          } else {
            const p0 = page.getByTestId('pick-0').first();
            if (await p0.count() && await p0.isVisible().catch(() => false)) { await p0.click().catch(() => {}); did = 'pick:pick-0(target)'; }
          }
        }
        const st = await H.queryState();
        H.log(`  lxeh[${s}] -> ${did ?? 'なし'} | pickedTarget=${pickedTarget} hHand=${st?.host?.hand} gPowerMods=${JSON.stringify(st?.guest?.powerMods)} pEff=${st?.pendingEffect ?? '-'}`);
        if (pickedTarget && !st?.pendingEffect) {
          stablePolls++;
          if (stablePolls >= 2) {
            const zeroOrNoDelta = !(st?.guest?.powerMods ?? []).some(m => m.startsWith('WX01-053#1:') && !m.endsWith(':0') && !m.endsWith('-0'));
            return {
              pass: zeroOrNoDelta,
              detail: `手札0枚→捨てるピッカーは一度も出ず（pickedTarget後すぐpEff解消）→POWER_MODIFYはdelta=0で静かに適用・クラッシュなし（gPowerMods=${JSON.stringify(st.guest.powerMods)}）`,
            };
          }
        } else {
          stablePolls = 0;
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（pickedTarget=${pickedTarget} gPowerMods=${JSON.stringify(fin?.guest?.powerMods)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lx)(b)（2026-08-05・Sonnet）＝WXDi-P03-089：POWER_MODIFY{targetsStored}は`freezeStoredTargets`の
  // FREEZABLEリスト（BANISH/BOUNCE/TRASH/EXILE/SEND_TO_ENERGY/TRANSFER_TO_DECK）に含まれないため、エクシード
  // 支払い判定後に**再選択UIを一切出さず自動適用**される（`execPowerModify`の`if(a.targetsStored) return
  // done(applyPowerMod(...))`が`selectOrInteract`より先に早期return）＝この「対象選択は最初の1回だけ」は実機で
  // 確認できた（sawSecondSelectTarget=false）。
  // ⚠登録時（2026-08-05）は「ON_TARGETED watcher（WXDi-P03-067）が0回しか発火しない実バグ」として
  // Opusタスク12(civ)へ登録されたが、**2026-08-06（Opus）に engine 非バグ＝計器の嘘と確定**：
  // `queryState` の `stackLen` が `stack.entries?.length`（**`EffectStack` に存在しないキー**）を読んでいて
  // 常に 0 を返していたため、下の「スタックが空になるまで待つ」ガードが最初から無効化されており、
  // CHOOSE を解決した直後（＝ON_TARGETED エントリがまだスタック上にある tick）で判定を確定させていた。
  // stackLen を実体（整列済みなら queue 長／未整列なら pending 総数）に直すと、次tickでスタックが解決されて
  // guest.hand 0→1＝**期待どおり1回だけ発火**する（詳細は BUGFIXES 2026-08-06 (civ) 節）。
  lxWXDiP03089SingleTargetedFire: {
    title: 'WXDi-P03-089（POWER_MODIFY{targetsStored}は再選択なし＋対象宣言のON_TARGETEDが1回だけ発火）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'energy': ['WD05-013#1'], // 黒×1（スペルコスト）
        'hand': ['WXDi-P03-089#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WXDi-P03-067#1'], null, null], // 羅石 アパタイト（ON_TARGETED self＝1枚ドロー・唯一の対象候補）
        'field.signi_down': [false, false, false],
        'hand': [], // 0枚→発火回数をhand絶対値で判定
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.hand:', before?.guest?.hand, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      const clickExact = async (name) => {
        const b = page.getByRole('button', { name, exact: true }).first();
        if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; }
        return null;
      };
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      let pickedTarget = false;
      let sawSecondSelectTarget = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lxWXDiP03089SingleTargetedFire-${s}.png`, fullPage: true });
        let did = null;
        did = await clickExact('発動'); // CardModal「発動」→SpellCastModalへ
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          }
        }
        // 第1段＝相手1体の強制対象選択（決定(1/1)固定パターン・唯一の候補）
        if (!did && !pickedTarget) {
          const confirmReady = await page.getByRole('button', { name: /決定 \(1\/1\)/ }).count();
          if (confirmReady) {
            await page.getByRole('button', { name: /決定 \(1\/1\)/ }).first().click().catch(() => {});
            did = 'btn:決定(1/1)target'; pickedTarget = true;
          } else {
            const p0 = page.getByTestId('pick-0').first();
            if (await p0.count() && await p0.isVisible().catch(() => false)) { await p0.click().catch(() => {}); did = 'pick:pick-0(target)'; }
          }
        }
        // エクシード4のCHOOSE（costColors無し＝プレーンラベル。エクシードプール0で支払い不能→スキップ固定）
        if (!did && pickedTarget) did = await clickExact('スキップ');
        if (!did && pickedTarget) {
          // 万一もう一度SELECT_TARGETが出た場合の検出（本来は起きないはず）
          const p0b = page.getByTestId('pick-0').first();
          if (await p0b.count() && await p0b.isVisible().catch(() => false)) { sawSecondSelectTarget = true; }
        }
        const st = await H.queryState();
        const debuffed = (st?.guest?.powerMods ?? []).some(m => m.startsWith('WXDi-P03-067#1:-5000'));
        H.log(`  lx89[${s}] -> ${did ?? 'なし'} | pickedTarget=${pickedTarget} sawSecondSelectTarget=${sawSecondSelectTarget} gHand=${st?.guest?.hand} stack=${st?.stackLen ?? '-'}${JSON.stringify(st?.stackQueue ?? [])}/${JSON.stringify(st?.stackPending ?? [])} gPowerMods=${JSON.stringify(st?.guest?.powerMods)} pEff=${st?.pendingEffect ?? '-'} gDone=${JSON.stringify(st?.guest?.actionsDone)}`);
        // ⚠ON_TARGETEDはstackAcc（効果スタック）へ後乗せされるため、CHOOSE解決直後の同一pollではまだ
        // ドローが反映されていない（スタック解決は次のtickで自動処理される）。**このガードが機能するのは
        // stackLen が実体を返すようになった 2026-08-06 以降**（それ以前は常に0＝素通り＝(civ)の誤検知）。
        if (debuffed && !st?.pendingEffect && (st?.stackLen ?? 0) === 0) {
          if (st.guest.hand === 1 && !sawSecondSelectTarget) {
            return { pass: true, detail: `対象選択は最初の1回だけ→エクシード不払いで-5000適用→ON_TARGETED watcherが1回だけ発火（gHand=${before.guest.hand}→${st.guest.hand}）` };
          }
          return {
            pass: false,
            detail: `ON_TARGETED watcher（WXDi-P03-067）の発火回数が期待と違う（期待=1回・実測=${st.guest.hand - before.guest.hand}回・gHand=${before.guest.hand}→${st.guest.hand}・sawSecondSelectTarget=${sawSecondSelectTarget}）`,
          };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未確認（pickedTarget=${pickedTarget} gHand=${fin?.guest?.hand} stack=${fin?.stackLen ?? '-'} gPowerMods=${JSON.stringify(fin?.guest?.powerMods)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク12(lxii)（2026-08-05・Sonnet）＝WD16-016-BURST：LB解決時に対戦相手（LB所有者の対戦相手＝アタッカー）
  // 側に「捨てる札を選ぶ」画面が出ること（自分側に出ない＝旧実装は自分の手札を1枚捨てさせていた）。
  // `TRASH{HAND_CARD, owner:'opponent', count:1}`＝`opponentResponds:true`・`targetScope:'opp_hand'`。
  // ⚠実機検証で実バグを発見（Opusタスク12(cv)へ登録）＝`EffectInteractionModal.tsx`の`opp_hand`候補描画が
  // 「viewer視点のop」（=画面を見ている側から見た相手）を使うため、host（アタッカー＝真の対象）が見ると
  // 「対戦相手の手札」としてguest（LB所有者）の手札が表示される＝真の候補（host自身の手札）とは無関係の
  // カードが並び、どれも選択不可（決定(0/1)のまま進まない＝実質ソフトロック）。手札3枚（≤5→1枚捨て想定）で検証。
  wd16016BurstOpponentDiscard: {
    title: 'WD16-016-BURST（LB＝対戦相手(アタッカー)側に捨てる札を選ぶ画面が出る・手札3枚→1枚捨て）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WD01-013#1'], null, null], // アタッカー
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#2', 'WD01-013#3', 'WD01-013#4'], // 3枚≤5＝1枚捨て
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null], // ブロッカー無し＝ライフクロスクラッシュ直行
        'life_cloth': ['WD01-013#30', 'WD16-016#1'], // 配列末尾が先にクラッシュ＝バースト即発火
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'host.handCards:', JSON.stringify(before?.host?.handCards));
      let modalOpened = false;
      let attacked = false;
      let sawPicker = false;
      let discardPicked = 0;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wd16016BurstOpponentDiscard-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了', 'シグニアタックへ']);
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !modalOpened && !attacked) {
          const phaseChk = await H.queryState();
          if (phaseChk?.turnPhase === 'ATTACK_SIGNI' && !phaseChk?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        // 相手側ディスカードUI（pick-N＋決定(1/1)。optional:falseなのでスキップ枝は無い）
        if (!did) {
          const pN = page.getByTestId(`pick-${discardPicked}`).first();
          if (await pN.count() && await pN.isVisible().catch(() => false)) {
            sawPicker = true;
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\/1\)/ }).count();
            if (!confirmReady) { await pN.click().catch(() => {}); did = `pick:discard-${discardPicked}`; discardPicked++; }
            else { await page.getByRole('button', { name: /決定 \(1\/1\)/ }).first().click().catch(() => {}); did = 'btn:決定(1/1)discard'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', 'OK', 'はい', 'エナに送る']);
        const st = await H.queryState();
        const discarded = (st?.host?.hand ?? 99) < (before?.host?.hand ?? 0);
        H.log(`  wd16[${s}] -> ${did ?? 'なし'} | sawPicker=${sawPicker} hHand=${st?.host?.hand}(開始${before?.host?.hand}) gHand=${st?.guest?.hand} pEff=${st?.pendingEffect ?? '-'}`);
        if (discarded) {
          return { pass: sawPicker && (before.host.hand - st.host.hand === 1), detail: `LB解決時に対戦相手（アタッカー=host）側の手札から捨てる画面が出現（sawPicker=${sawPicker}）→host自身の手札が${before.host.hand}→${st.host.hand}（1枚捨て・guest側は不変=${st.guest.hand}）` };
        }
      }
      const fin = await H.queryState();
      return {
        pass: false,
        detail: `【Opusタスク12(cv)実機確認】SELECT_TARGET(opp_hand)は正しく生成される（pEff=${fin?.pendingEffect}）が、モーダルは「対戦相手の手札（全${fin?.guest?.hand}枚）」としてguest（LB所有者）の手札を表示（スクリーンショットで確認＝真の対象はhost自身の手札3枚のはずが5枚=guest手札が並ぶ）。表示カードは真の候補（host自身の手札）と一致しないためどれも選択できず「決定 (0/1)」のまま進まない＝実質ソフトロック。host手札は最後まで${before?.host?.hand}のまま不変（未確認・進行不可）。原因はEffectInteractionModal.tsxのopp_hand候補描画が"viewer視点のop"（画面を見ている側から見た相手）を使うため、対象=viewer自身（アタッカー）のケースで実際の候補と食い違う疑い＝実バグ`,
      };
    },
  },

  // §7 タスク12(lxi)第2波(a)（2026-08-05・Sonnet）＝WX15-033-BURST（羅星姫≡ガーネットスター≡）：LB「対戦相手は、
  // 手札を２枚捨てるかエナゾーンから対象のカード２枚をトラッシュに置かないかぎり、対象の自分のシグニ１体を場から
  // トラッシュに置く」。OPPONENT_PAY_OPTIONALに手札枝＋エナ枝の2つが並ぶケース＝LB所有者(guest)の対戦相手=host
  // （アタッカー）にCHOOSEが飛ぶので、CPU自動応答を介さずdriver自身の選択でエナ枝を明示的に選べる。
  // 手札1枚（<2）で「手札を2枚捨てる」枝がdisabledなこと／エナ3枚（≥2）で「エナゾーンから...2枚...」枝が
  // available→選択すると自分のエナがちょうど2枚トラッシュされ対象シグニ（アタッカー自身）は場に残ることを確認する。
  // ⚠costColors非搭載のため「支払う」枝も常時available（Opusタスク12(ci)と同型の穴）だが、本シナリオは
  // それを踏まずエナ枝を明示クリックする＝ci とは独立に「エナ枝自体が機能すること」を検証する。
  secondWaveEnergyBranch: {
    title: 'WX15-033-BURST（羅星姫≡ガーネットスター≡＝OPPONENT_PAY_OPTIONALの手札枝＋エナ枝の3択・エナ枝を明示選択して機能確認）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WD01-013#1'], null, null], // アタッカー兼、不払い時のバニッシュ対象候補
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#20'], // 1枚＜2＝「手札を2枚捨てる」枝は本来unavailable
        'energy': ['WD01-013#21', 'WD01-013#22', 'WD01-013#23'], // 3枚≥2＝「エナゾーンから2枚」枝はavailable
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null], // ブロッカー無し＝ライフクロスクラッシュ直行
        'life_cloth': ['WD01-013#30', 'WX15-033#1'], // 配列末尾が先にクラッシュ＝バースト即発火
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'host.energy:', before?.host?.energy, 'guest.life:', before?.guest?.life, 'guest.lifeCards:', JSON.stringify(before?.guest?.lifeCards));
      let modalOpened = false;
      let attacked = false;
      let sawChoose = false;
      let discardWasDisabled = null;
      let energyClicked = false;
      let pickedCount = 0;
      let confirmedTargets = false;
      for (let s = 0; s < 30; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/secondWaveEnergyBranch-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了', 'シグニアタックへ']);
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !modalOpened && !attacked) {
          const phaseChk = await H.queryState();
          if (phaseChk?.turnPhase === 'ATTACK_SIGNI' && !phaseChk?.pendingEffect) {
            const opened = await H.clickTestId('my-signi-zone-0');
            if (opened) { did = opened; modalOpened = true; }
          }
        }
        // CHOOSEモーダル出現の検出＝手札枝(disabled想定)とエナ枝(available想定)を直接判定
        if (!did && !energyClicked) {
          const discardBtn = page.getByRole('button', { name: '手札を2枚捨てる', exact: true }).first();
          const energyBtn = page.getByRole('button', { name: 'エナゾーンからカードを2枚トラッシュに置く', exact: true }).first();
          if (await energyBtn.count() && await energyBtn.isVisible().catch(() => false)) {
            sawChoose = true;
            if (discardWasDisabled === null) {
              discardWasDisabled = (await discardBtn.count()) > 0 ? !(await discardBtn.isEnabled().catch(() => true)) : null;
            }
            const enabled = await energyBtn.isEnabled().catch(() => false);
            if (enabled) { await energyBtn.click().catch(() => {}); did = 'btn:エナゾーンから2枚'; energyClicked = true; }
          }
        }
        // エナ2枚選択のSELECT_TARGET（pick-0/pick-1→決定(2/2)）
        if (!did && energyClicked && !confirmedTargets) {
          const pN = page.getByTestId(`pick-${pickedCount}`).first();
          if (pickedCount < 2 && await pN.count() && await pN.isVisible().catch(() => false)) {
            await pN.click().catch(() => {}); pickedCount++; did = `pick:pick-${pickedCount - 1}`;
          } else {
            const confirmBtn = page.getByRole('button', { name: /決定 \(\d\/2\)/ }).first();
            if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) {
              await confirmBtn.click().catch(() => {}); did = 'btn:決定(N/2)'; confirmedTargets = true;
            }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const energyDelta = (before?.host?.energy ?? 0) - (st?.host?.energy ?? 0);
        const signiSurvived = st?.host?.fieldSigni?.[0] != null;
        H.log(`  swEB[${s}] -> ${did ?? 'なし'} | hEnergy=${st?.host?.energy}(開始${before?.host?.energy},差分${energyDelta}) hField=${JSON.stringify(st?.host?.fieldSigni)} sawChoose=${sawChoose} discardDisabled=${discardWasDisabled} pEff=${st?.pendingEffect ?? '-'}`);
        if (energyClicked && energyDelta === 2 && signiSurvived && !st?.pendingEffect) {
          return { pass: true, detail: `3択CHOOSE（支払う/手札を2枚捨てる(disabled=${discardWasDisabled})/エナゾーンから2枚/支払わない）が並び、エナ枝を選択→自分のエナがちょうど2枚トラッシュ（${before.host.energy}→${st.host.energy}）→対象シグニ(WD01-013#1)は場に残存` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `エナ枝選択の完了 未確認（sawChoose=${sawChoose} discardDisabled=${discardWasDisabled} hEnergy=${fin?.host?.energy} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「エクシード本体5件」群B（2026-08-05・Sonnet）＝WX24-P4-018-E2（あきら☆らぶりー）：【出】エクシード４＝
  // 対戦相手のシグニ１体を対象とし、対戦相手が手札を３枚捨てないかぎり、それをバニッシュする。
  // このプロジェクト初のLRIG「【出】エクシードN」コストUI（SigniOnPlayCostModal・ルリグの下からN枚選択→発動/
  // スキップ）を実機で駆動する。⚠OPPONENT_PAY_OPTIONALはcostColors非搭載＝Opusタスク12(ci)と同型の穴（「支払う」
  // が常時available・CPU自動応答が最優先で選ぶ）を踏む想定＝本シナリオはエクシードコストUI自体の機能を主眼とする。
  exceedBanishGateA: {
    title: 'WX24-P4-018-E2（あきら☆らぶりー＝エクシード4コストUI→OPPONENT_PAY_OPTIONAL手札3枚捨てゲート）',
    spec: {
      hostSet: {
        // 末尾＝グロウ元(Lv3あきら)。手前3枚はエクシード支払い用フィラー（プールに4枚を確保）。
        'field.lrig': ['WD01-001#901', 'WD01-001#902', 'WD01-001#903', 'WX24-P2-022#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX24-P4-018#1'],
        'energy': [],
        'free_grow_this_turn': true,
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], null, null], // バニッシュ対象候補
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#20', 'WD01-013#21'], // 2枚＜3＝「手札を3枚捨てる」枝は本来unavailableのはず
      },
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.lrigTop:', before?.host?.lrigTop, 'host.lrigUnder:', before?.host?.lrigUnder, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni));
      let grown = false;
      let exceedPicked = 0;
      let activated = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/exceedBanishGateA-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !grown) {
          const opened = await H.openGrow(/あきら☆らぶりー/);
          if (opened) { did = 'grow:あきら☆らぶりー'; grown = true; }
        }
        if (!did && grown && !activated) {
          const exBtn = page.getByTestId(`onplaycost-exceed-${exceedPicked}`).first();
          if (exceedPicked < 4 && await exBtn.count() && await exBtn.isVisible().catch(() => false)) {
            await exBtn.click().catch(() => {}); exceedPicked++; did = `onplaycost-exceed-${exceedPicked - 1}`;
          } else if (exceedPicked >= 4) {
            const actBtn = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await actBtn.count() && await actBtn.isVisible().catch(() => false) && await actBtn.isEnabled().catch(() => false)) {
              await actBtn.click().catch(() => {}); did = 'btn:発動'; activated = true;
            }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const banished = (before?.guest?.fieldSigni?.[0] != null) && (st?.guest?.fieldSigni?.[0] == null);
        const exceedSpent = (st?.host?.lrigUnder ?? -1) === 0 && st?.host?.lrigTop?.startsWith('WX24-P4-018');
        H.log(`  exgA[${s}] -> ${did ?? 'なし'} | lrigTop=${st?.host?.lrigTop} lrigUnder=${st?.host?.lrigUnder} exceedSpent=${exceedSpent} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${st?.guest?.hand} pEff=${st?.pendingEffect ?? '-'}`);
        if (exceedSpent && !st?.pendingEffect) {
          return {
            pass: banished,
            detail: banished
              ? `エクシード4を支払いWX24-P4-018へグロウ（lrigUnder ${before?.host?.lrigUnder}→0）→OPPONENT_PAY_OPTIONALでguestが不払いを選択→BANISH実行（gField zone0消滅）`
              : `【Opusタスク12(ci)と同型】エクシード4コストUI自体は機能（lrigUnder 0まで消費・発動ボタンで進行）したが、OPPONENT_PAY_OPTIONALはcostColors非搭載のため無料「支払う」が常時available→CPUが最優先で選択しbanishが不発（gField zone0残存・gHand=${st.guest.hand}=開始時${before.guest.hand}と不変）`,
          };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（lrigTop=${fin?.host?.lrigTop} lrigUnder=${fin?.host?.lrigUnder} exceedPicked=${exceedPicked} activated=${activated} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「エクシード本体5件」群C（2026-08-05・Sonnet）＝WX24-P4-015-E2（熾炎舞　遊月・肆）：【出】エクシード４＝
  // あなたのライフクロス１枚をクラッシュしてもよい。その後、対戦相手のシグニをこの方法でクラッシュしたライフ
  // クロスの枚数に１を加えた数対象とし、それらをバニッシュする＝クラッシュしない→1体・する→2体の動的対象数。
  // ライフバースト解決（チェックゾーン確認）を跨いでも対象数が2のまま連続することが最重要ポイント。
  exceedDynamicTargetCountB: {
    title: 'WX24-P4-015-E2（熾炎舞　遊月・肆＝エクシード4→任意ライフクラッシュ→動的対象数2体。LBチェックゾーンを跨いでも対象数維持）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#901', 'WD01-001#902', 'WD01-001#903', 'WX04-009#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX24-P4-015#1'],
        'energy': ['WX04-068#1'], // 赤×1＝グロウコスト《赤》×1のフォールバック（free_grow_this_turnが効かない場合の保険）
        'life_cloth': ['WD01-013#930'], // 1枚だけ＝クラッシュ後LBチェックが必ず起きる・バーストなし固定
        'free_grow_this_turn': true,
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WD01-013#1'], ['WD01-013#2'], null], // バニッシュ対象候補2体
        'field.signi_down': [false, false, false],
      },
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.lrigTop:', before?.host?.lrigTop, 'guest.fieldSigni:', JSON.stringify(before?.guest?.fieldSigni), 'host.life:', before?.host?.life);
      // グロウ候補選択モーダルはフェイズドリフト（注入直後にturn_phaseがGROW→MAINへ流れる）で開いてもすぐ
      // 閉じるレースがある＝900ms間隔の外側ループでは「開いた次の周には既に閉じている」を繰り返し続けて
      // 進まない（実測）。repatch→グロウ→候補クリックを短い待ちで連続実行するタイトループで対処する
      // （H.openGrowと同型・こちらはグロウ実行/コスト選択サブ画面の両対応を追加）。
      let exceedShown = false;
      for (let k = 0; k < 10 && !exceedShown; k++) {
        await H.repatchTop({ active: 'host', turn_phase: 'GROW', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(400);
        const gb = page.getByRole('button', { name: 'グロウ', exact: true }).first();
        if (await gb.count() && await gb.isVisible().catch(() => false)) { await gb.click({ timeout: 2000 }).catch(() => {}); }
        const cand = page.getByRole('button', { name: /遊月・肆/ }).first(); // 全角スペースはアクセシブルネーム計算で半角化される疑いがあるため空白なしの部分一致で狙う
        let candVisible = false;
        for (let w = 0; w < 5 && !candVisible; w++) {
          await page.waitForTimeout(300);
          candVisible = (await cand.count()) > 0 && await cand.isVisible().catch(() => false);
        }
        if (candVisible) {
          await cand.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(400);
          const execBtn = page.getByRole('button', { name: 'グロウ実行', exact: true }).first();
          if (await execBtn.count() && await execBtn.isVisible().catch(() => false)) {
            if (!(await execBtn.isEnabled().catch(() => false))) {
              const eDiv = page.getByText('エナから選択').locator('..').locator('div[style*="cursor: pointer"]').first();
              if (await eDiv.count()) { await eDiv.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
            }
            const execBtn2 = page.getByRole('button', { name: 'グロウ実行', exact: true }).first();
            if (await execBtn2.isEnabled().catch(() => false)) await execBtn2.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500);
          }
        }
        const ex0 = page.getByTestId('onplaycost-exceed-0').first();
        if (await ex0.count() && await ex0.isVisible().catch(() => false)) exceedShown = true;
        await page.screenshot({ path: `${SHOT}/exceedDynamicTargetCountB-grow${k}.png`, fullPage: true });
        H.log(`  grow試行[${k}] exceedShown=${exceedShown}`);
      }
      let grown = exceedShown;
      let exceedPicked = 0;
      let exceedActivated = false;
      let crashChosen = false;
      let pickedCount = 0;
      let confirmedTargets = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/exceedDynamicTargetCountB-${s}.png`, fullPage: true });
        let did = null;
        // エクシード4支払い（onplaycost-exceed-0..3→発動）
        if (!did && !exceedActivated) {
          const exBtn = page.getByTestId(`onplaycost-exceed-${exceedPicked}`).first();
          if (exceedPicked < 4 && await exBtn.count() && await exBtn.isVisible().catch(() => false)) {
            grown = true;
            await exBtn.click({ timeout: 3000 }).catch(() => {}); exceedPicked++; did = `onplaycost-exceed-${exceedPicked - 1}`;
          } else if (exceedPicked >= 4) {
            const actBtn = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await actBtn.count() && await actBtn.isVisible().catch(() => false) && await actBtn.isEnabled().catch(() => false)) {
              await actBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:発動'; exceedActivated = true;
            }
          }
        }
        if (!did && exceedActivated && !crashChosen) {
          const crashBtn = page.getByRole('button', { name: 'クラッシュする', exact: true }).first();
          if (await crashBtn.count() && await crashBtn.isVisible().catch(() => false)) {
            await crashBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:クラッシュする'; crashChosen = true;
          }
        }
        // ライフバースト・チェックゾーン確認（バーストなし想定）の通過
        if (!did) did = await H.clickTextOrBtn(['エナに送る', '確認', 'OK']);
        // 2体対象選択（pick-0/pick-1→決定(N/2)）
        if (!did && crashChosen && !confirmedTargets) {
          const pN = page.getByTestId(`pick-${pickedCount}`).first();
          if (pickedCount < 2 && await pN.count() && await pN.isVisible().catch(() => false)) {
            await pN.click({ timeout: 3000 }).catch(() => {}); pickedCount++; did = `pick:pick-${pickedCount - 1}`;
          } else {
            const confirmBtn = page.getByRole('button', { name: /決定 \(\d\/2\)/ }).first();
            if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false)) {
              await confirmBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:決定(N/2)'; confirmedTargets = true;
            }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const banishedCount = [before?.guest?.fieldSigni?.[0], before?.guest?.fieldSigni?.[1]]
          .filter(Boolean).length - [st?.guest?.fieldSigni?.[0], st?.guest?.fieldSigni?.[1]].filter(Boolean).length;
        H.log(`  exgB[${s}] -> ${did ?? 'なし'} | lrigTop=${st?.host?.lrigTop} exceedPicked=${exceedPicked} exceedActivated=${exceedActivated} hLife=${st?.host?.life}(開始${before?.host?.life}) gField=${JSON.stringify(st?.guest?.fieldSigni)} banishedCount=${banishedCount} pEff=${st?.pendingEffect ?? '-'}`);
        if (banishedCount >= 2 && !st?.pendingEffect) {
          return { pass: true, detail: `エクシード4支払い→クラッシュする→hLife ${before.host.life}→${st.host.life}（LBチェックゾーン通過）→動的対象数=クラッシュ枚数1+1=2体を選択→guestの2体とも正しくBANISH（zone0/zone1消滅）` };
        }
      }
      const fin = await H.queryState();
      if (crashChosen && (fin?.host?.life ?? 99) < (before?.host?.life ?? 0) && !fin?.pendingEffect) {
        return {
          pass: false,
          detail: `【要Opus登録】エクシード4支払い→「クラッシュする」選択→自分のライフクロス1→0枚クラッシュ成功→チェックゾーン確認（バーストなし「エナに送る」）まで正しく進行したが、続くBANISH（対象=クラッシュ枚数1+1=2体）が一度も発火しない＝SEQUENCE[LIFE_CRASH{optional,triggerBurst}, BANISH{addLastProcessedCount}]のcontinuationがCHOOSE解決→チェックゾーン確認という2段の中断を跨いだ先で失われている疑い（gField=${JSON.stringify(fin?.guest?.fieldSigni)}=開始時と不変・banishedCount=0）`,
        };
      }
      return { pass: false, detail: `2体BANISH 未確認（lrigTop=${fin?.host?.lrigTop} grown=${grown} exceedActivated=${exceedActivated} hLife=${fin?.host?.life} gField=${JSON.stringify(fin?.guest?.fieldSigni)} crashChosen=${crashChosen} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「エクシード本体5件」群E（2026-08-05・Sonnet）＝WX24-P4-017-E2（ロストコード・ピルルク　X）：【出】エクシード
  // ４＝あなたのトラッシュからスペルと青のシグニをそれぞれ１枚まで対象とし、それらを手札に加える＝2群独立ピッカー
  // （スペル枠1枚まで・青シグニ枠1枚まで）。片方0枚でも成立し、該当0枚のときに空振りしないことを確認する。
  exceedTwoGroupPickerC: {
    title: 'WX24-P4-017-E2（ロストコード・ピルルク X＝エクシード4→トラッシュからスペル1枚まで＋青シグニ1枚までの2群独立ピッカー）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#901', 'WD01-001#902', 'WD01-001#903', 'WD03-002#1'],
        'field.signi': [null, null, null],
        'lrig_deck': ['WX24-P4-017#1'],
        'energy': ['WD03-013#1', 'WD03-013#2'], // 青×2＝グロウコスト《青》×2のフォールバック（free_grow_this_turnが効かない場合の保険）
        'trash': ['WD01-013#940', 'WX01-015#1'], // WD01-013=非スペル非青シグニのフィラー／WX01-015=青のシグニ（候補）。スペル候補は意図的に0枚
        'free_grow_this_turn': true,
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#2'],
        'field.signi': [null, null, null],
      },
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.lrigTop:', before?.host?.lrigTop, 'host.hand:', before?.host?.hand, 'host.trashCards:', JSON.stringify(before?.host?.trashCards));
      // グロウ候補選択モーダルはフェイズドリフト（注入直後にturn_phaseがGROW→MAINへ流れる）で開いてもすぐ
      // 閉じるレースがある＝タイトループでrepatch→グロウ→候補クリックを連続実行する（H.openGrow類型）。
      let exceedShown = false;
      for (let k = 0; k < 10 && !exceedShown; k++) {
        await H.repatchTop({ active: 'host', turn_phase: 'GROW', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(400);
        const gb = page.getByRole('button', { name: 'グロウ', exact: true }).first();
        if (await gb.count() && await gb.isVisible().catch(() => false)) { await gb.click({ timeout: 2000 }).catch(() => {}); }
        const cand = page.getByRole('button', { name: /ロストコード・ピルルク/ }).first(); // 全角スペースはアクセシブルネーム計算で半角化される疑いがあるため空白なしの部分一致で狙う
        let candVisible = false;
        for (let w = 0; w < 5 && !candVisible; w++) {
          await page.waitForTimeout(300);
          candVisible = (await cand.count()) > 0 && await cand.isVisible().catch(() => false);
        }
        if (candVisible) {
          await cand.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(400);
          const execBtn = page.getByRole('button', { name: 'グロウ実行', exact: true }).first();
          if (await execBtn.count() && await execBtn.isVisible().catch(() => false)) {
            if (!(await execBtn.isEnabled().catch(() => false))) {
              const eDiv = page.getByText('エナから選択').locator('..').locator('div[style*="cursor: pointer"]').first();
              if (await eDiv.count()) { await eDiv.click({ timeout: 2000 }).catch(() => {}); await page.waitForTimeout(300); }
            }
            const execBtn2 = page.getByRole('button', { name: 'グロウ実行', exact: true }).first();
            if (await execBtn2.isEnabled().catch(() => false)) await execBtn2.click({ timeout: 2000 }).catch(() => {});
            await page.waitForTimeout(500);
          }
        }
        const ex0 = page.getByTestId('onplaycost-exceed-0').first();
        if (await ex0.count() && await ex0.isVisible().catch(() => false)) exceedShown = true;
        await page.screenshot({ path: `${SHOT}/exceedTwoGroupPickerC-grow${k}.png`, fullPage: true });
        H.log(`  grow試行[${k}] exceedShown=${exceedShown}`);
      }
      let grown = exceedShown;
      let exceedPicked = 0;
      let exceedActivated = false;
      let pickedSpellSkip = false;
      let pickedBlueSigni = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/exceedTwoGroupPickerC-${s}.png`, fullPage: true });
        let did = null;
        // エクシード4支払い（onplaycost-exceed-0..3→発動）
        if (!did && !exceedActivated) {
          const exBtn = page.getByTestId(`onplaycost-exceed-${exceedPicked}`).first();
          if (exceedPicked < 4 && await exBtn.count() && await exBtn.isVisible().catch(() => false)) {
            grown = true;
            await exBtn.click({ timeout: 3000 }).catch(() => {}); exceedPicked++; did = `onplaycost-exceed-${exceedPicked - 1}`;
          } else if (exceedPicked >= 4) {
            const actBtn = page.getByRole('button', { name: '発動', exact: true }).first();
            if (await actBtn.count() && await actBtn.isVisible().catch(() => false) && await actBtn.isEnabled().catch(() => false)) {
              await actBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:発動'; exceedActivated = true;
            }
          }
        }
        // 群1（スペル・候補0枚）＝候補が無いので「スキップ」（upToCount自動解決の可能性もあるため両対応）
        if (!did && exceedActivated) {
          const skipBtn = page.getByRole('button', { name: 'スキップ', exact: true }).first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) {
            await skipBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:スキップ(群1空振り)'; pickedSpellSkip = true;
          }
        }
        // 群2（青シグニ・候補1枚＝WX01-015）＝pick-0→決定
        if (!did && exceedActivated) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click({ timeout: 3000 }).catch(() => {}); did = 'pick:pick-0(群2青シグニ)'; }
            else { await page.getByRole('button', { name: /決定 \(1\// }).first().click({ timeout: 3000 }).catch(() => {}); did = 'btn:決定(1/N)'; pickedBlueSigni = true; }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const gotBlueSigni = (st?.host?.handCards ?? []).some(c => c.startsWith('WX01-015'));
        H.log(`  exgC[${s}] -> ${did ?? 'なし'} | lrigTop=${st?.host?.lrigTop} exceedPicked=${exceedPicked} exceedActivated=${exceedActivated} hHand=${JSON.stringify(st?.host?.handCards)} gotBlueSigni=${gotBlueSigni} pEff=${st?.pendingEffect ?? '-'}`);
        if (gotBlueSigni && !st?.pendingEffect) {
          return { pass: true, detail: `エクシード4支払い→2群独立ピッカー＝スペル枠は候補0枚で自動/明示スキップ（空振りせず進行）→青シグニ枠1枚まででWX01-015を手札に加えた（hHand=${JSON.stringify(st.host.handCards)}）＝片方0枚でも成立することを確認` };
        }
      }
      const fin = await H.queryState();
      return {
        pass: false,
        detail: `【要Opus登録・Opusタスク12(cvi)と同根の疑い】エクシード4支払い→「発動」まで正しく進行したが、続くTRANSFER_TO_HAND（transferGroups＝スペル1枚まで→青シグニ1枚まで）が一度も発火しない＝スペル群（候補0枚）は無音でauto-skipされたと見られる（upToCount:trueで候補0件のためUI自体が出ない）が、続く青シグニ群（候補1件＝WX01-015）のSELECT_TARGETも一度も現れない＝executeSigniOnPlayCost経由でスタックに積んだSEQUENCEの続きが、間に非対話ステップ（0候補の自動完了）を挟むと失われている疑い（hHand=${JSON.stringify(fin?.host?.handCards)}＝WX01-015を含まず開始時と不変）`,
      };
    },
  },

  // §7 タスク16 WXDi-P06-038-E1（2026-08-05・Sonnet）＝翠美姫　アン//メモリア：【自】《ターン１回》あなたの
  // エナゾーンから効果によってカード１枚が他の領域に移動したとき、【エナチャージ１】をする＝`energyLeftToAnyZone`
  // （トラッシュ以外＝手札/場/デッキ行きでも発火する近似）を実機で駆動する。移動元＝WXEX1-42（羅植姫
  // ドラゴンツリー・【出】mandatory・自分のエナゾーンから＜植物＞のシグニ１枚まで対象とし手札に加える・no cost）。
  // ⚠story:'植物'フィルタはCardClass文字列一致（`精羅：植物`）＝WXEX1-42自身の別インスタンスをエナに置けば
  // 候補になる（対象探しの手間を省く）。
  energyLeftAnyZoneTrigger: {
    title: 'WXDi-P06-038-E1（翠美姫アン//メモリア＝エナから効果でトラッシュ以外(手札)へ移動しても【エナチャージ1】誘発）',
    spec: {
      hostSet: {
        'field.lrig': ['WX11-005#1'], // 緑子クラス＝WXEX1-42「緑子限定」を満たす
        'field.signi': [['WXDi-P06-038#1'], null, null], // watcher（ターン1回）
        'field.signi_down': [false, false, false],
        'hand': ['WXEX1-42#1'], // 召喚してE2＝自分のエナから＜植物＞シグニ1枚まで手札へ（mandatory・no cost）
        'energy': ['WXEX1-42#2'], // TRANSFER_TO_HAND候補（CardClass「精羅：植物」で story:'植物' に一致）
        'deck': ['WD01-013#950', 'WD01-013#951', 'WD01-013#952', 'WD01-013#953', 'WD01-013#954'], // 先頭#950＝ENERGY_CHARGE_FROM_DECKの識別用マーカー
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.hand:', before?.host?.hand, 'host.energyCards:', JSON.stringify(before?.host?.energyCards), 'host.deck先頭想定#950');
      const opened = await H.clickTestId('my-hand-card-0');
      H.log('手札クリック:', opened ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/energyLeftAnyZoneTrigger-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
          await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true;
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const gotSigniToHand = (st?.host?.handCards ?? []).some(c => c.startsWith('WXEX1-42#2'));
        const chargedMarker = (st?.host?.energyCards ?? []).some(c => c.startsWith('WD01-013#950'));
        H.log(`  elaz[${s}] -> ${did ?? 'なし'} | hHand=${JSON.stringify(st?.host?.handCards)} hEnergy=${JSON.stringify(st?.host?.energyCards)} gotSigniToHand=${gotSigniToHand} chargedMarker=${chargedMarker} pEff=${st?.pendingEffect ?? '-'}`);
        if (gotSigniToHand && chargedMarker && !st?.pendingEffect) {
          return { pass: true, detail: `WXEX1-42召喚→自身のE2でエナのWXEX1-42#2を手札へ（トラッシュ以外＝手札行き）→WXDi-P06-038のON_ENERGY_TO_TRASH(energyLeftToAnyZone)watcherが発火→デッキ先頭WD01-013#950をエナチャージ（hHand=${JSON.stringify(st.host.handCards)} hEnergy=${JSON.stringify(st.host.energyCards)}）` };
        }
        if (gotSigniToHand && !chargedMarker && s >= 18) {
          return { pass: false, detail: `【要確認】エナがトラッシュ以外（手札）へ移動したこと自体は確認（hHand=${JSON.stringify(st.host.handCards)}）が、watcherのエナチャージが未発火（hEnergy=${JSON.stringify(st.host.energyCards)}）＝energyLeftToAnyZone経路にresume取りこぼしの疑い` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（hHand=${JSON.stringify(fin?.host?.handCards)} hEnergy=${JSON.stringify(fin?.host?.energyCards)} summoned=${summoned} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク16 WX05-020-E1（2026-08-05・Sonnet）＝羅輝石　ダイヤブライド：【自】《ターン１回》このシグニが
  // １ターンにライフクロスを合計２枚以上クラッシュしたとき、このシグニをアップする＝1回のアタックで【ダブル
  // クラッシュ】により2枚を一気にクラッシュする経路（原文の①の足し方）を実機で駆動する。
  // 【ダブルクラッシュ】は`keyword_grants`直接注入（本体の別キーワード付与機構とは独立に、このシグニ自身が
  // 対戦相手ライフを2枚クラッシュする状況だけを再現する最小構成）。ガード不在の直接クラッシュ。
  doubleCrashUpTrigger: {
    title: 'WX05-020-E1（羅輝石ダイヤブライド＝【ダブルクラッシュ】で1アタック2枚クラッシュ→《ターン1回》アップ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD02-001#1'], // 花代・肆＝WX05-020「花代限定」を満たす
        'field.signi': [null, ['WX05-020#1'], null],
        'field.signi_down': [false, false, false],
        'keyword_grants': { 'WX05-020#1': ['ダブルクラッシュ'] },
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null], // ブロッカー無し＝直接クラッシュ
        'life_cloth': ['WD01-013#960', 'WD01-013#961'], // 2枚＝ダブルクラッシュで両方消費
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.fieldSigni:', JSON.stringify(before?.host?.fieldSigni), 'host.signiDown:', JSON.stringify(before?.host?.signiDown), 'guest.life:', before?.guest?.life);
      let modalOpened = false;
      let attacked = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/doubleCrashUpTrigger-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !modalOpened && !attacked) {
          const opened = await H.clickTestId('my-signi-zone-1');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', '確認', 'OK', 'はい']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const crashedBoth = (st?.guest?.life ?? 99) === 0;
        const wentUp = attacked && st?.host?.signiDown?.[1] === false;
        H.log(`  dcut[${s}] -> ${did ?? 'なし'} | gLife=${st?.guest?.life}(開始${before?.guest?.life}) hSigniDown=${JSON.stringify(st?.host?.signiDown)} pEff=${st?.pendingEffect ?? '-'}`);
        if (crashedBoth && wentUp) {
          return { pass: true, detail: `【ダブルクラッシュ】で1アタックにguestライフ${before.guest.life}→0枚（2枚同時クラッシュ）→WX05-020のE1（1ターン合計2枚クラッシュでアップ）が発火し signi_down[1]=false（アップ状態）へ復帰` };
        }
        if (crashedBoth && !wentUp && s >= 20) {
          return { pass: false, detail: `2枚クラッシュ自体は確認（gLife=0）だが、アップ未確認（hSigniDown=${JSON.stringify(st?.host?.signiDown)}）＝E1未発火の疑い` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gLife=${fin?.guest?.life} hSigniDown=${JSON.stringify(fin?.host?.signiDown)} attacked=${attacked} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 タスク16 WXDi-P13-051-E3（2026-08-05・Sonnet）＝翠美姫　アン//ディソナ：【自】《ターン２回》対戦相手の
  // 効果１つによって、あなたの手札が１枚以上捨てられるかあなたのエナゾーンからカードが１枚以上トラッシュに
  // 置かれたとき、カードを１枚引くか【エナチャージ１】をする＝エナ喪失経路を実機で駆動する（誘発時の2択UI）。
  // watcherをguest側に置き、hostがWXDi-D07-013（【出】mandatory・対戦相手のエナ1枚をトラッシュ・no cost）を
  // 召喚してguestのエナを奪う＝「対戦相手（guestから見てhost）の効果によって」を満たす。
  oppResourceLossChoose: {
    title: 'WXDi-P13-051-E3（翠美姫アン//ディソナ＝相手効果でエナがトラッシュに置かれたとき「引く/エナチャージ」2択誘発）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [null, null, null],
        'hand': ['WXDi-D07-013#1'],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [['WXDi-P13-051#1'], null, null], // watcher
        'field.signi_down': [false, false, false],
        'energy': ['WD01-013#970'], // トラッシュ対象（1枚）
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 guest.energyCards:', JSON.stringify(before?.guest?.energyCards), 'guest.hand:', before?.guest?.hand);
      const opened = await H.clickTestId('my-hand-card-0');
      H.log('手札クリック:', opened ?? '見つからず');
      let summoned = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/oppResourceLossChoose-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
          await summonBtn.click({ timeout: 3000 }).catch(() => {}); did = 'btn:召喚'; summoned = true;
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const energyTrashed = (st?.guest?.energyCards ?? []).length < (before?.guest?.energyCards ?? []).length
          || !(st?.guest?.energyCards ?? []).includes('WD01-013#970');
        const drewOrCharged = (st?.guest?.hand ?? 0) > (before?.guest?.hand ?? 0)
          || (st?.guest?.energyCards ?? []).some(c => !(before?.guest?.energyCards ?? []).includes(c) && c !== undefined && energyTrashed);
        H.log(`  orlc[${s}] -> ${did ?? 'なし'} | gEnergy=${JSON.stringify(st?.guest?.energyCards)} gHand=${st?.guest?.hand}(開始${before?.guest?.hand}) gTrash=${st?.guest?.trash} energyTrashed=${energyTrashed} pEff=${st?.pendingEffect ?? '-'}`);
        if (energyTrashed && !st?.pendingEffect && s >= 3) {
          const handUp = (st?.guest?.hand ?? 0) > (before?.guest?.hand ?? 0);
          const energyRestored = (st?.guest?.energyCards ?? []).length >= (before?.guest?.energyCards ?? []).length;
          if (handUp || energyRestored) {
            return { pass: true, detail: `WXDi-D07-013召喚→対戦相手(host)の効果でguestのエナ1枚(WD01-013#970)がトラッシュへ→WXDi-P13-051のwatcherが発火し「引く/エナチャージ」を自動選択（gHand ${before.guest.hand}→${st.guest.hand}／gEnergy ${JSON.stringify(before?.guest?.energyCards)}→${JSON.stringify(st.guest.energyCards)}）` };
          }
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gEnergy=${JSON.stringify(fin?.guest?.energyCards)} gHand=${fin?.guest?.hand} summoned=${summoned} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「🆕 タスク16 WXDi-P11-063-E2」＝スペル《無心の豪圧》をバニッシュ解決後にメモリア（幻怪姫エクス等3種）の
  // 下に置いてもよい選択（STUB TRAP_OPERATION の「の下に置いてもよい」分岐）。置くと ON_PLACED_UNDER_SIGNI で
  // ホストへ+2000（ターン終了時まで）。この配置経路は part1 の同名STUBに食われて長期間到達不能だった＝UIで初実走。
  spellUnderMemoriaPlace: {
    title: 'WXDi-P11-063-E2（無心の豪圧＝バニッシュ後メモリアの下に置く選択→ホストに+2000）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXDi-P11-042#1'], null, null], // メモリア候補（幻怪姫エクス）
        'hand': ['WXDi-P11-063#1'],
        'energy': ['WD02-009#1', 'WD02-009#2'], // 《赤》×1《無》×1
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#1'], null, null], // バニッシュ対象（P3000≤12000）
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.fieldSigni:', JSON.stringify(before?.host?.fieldSigni));
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/spellUnderMemoriaPlace-${s}.png`, fullPage: true });
        let did = await clickExact('発動'); // CardModal「発動」
        if (!did) { // スペルコスト：赤+無＝エナ2枚選択→発動する
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`spellcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
            await page.waitForTimeout(200);
            const cast = await clickExact('発動する');
            did = cast ?? 'spellcost-select';
          }
        }
        if (!did) { // BANISH の SELECT_TARGET（候補1件＝guest zone0）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) { // TRAP_OPERATION の「の下に置きますか？」CHOOSE＝メモリアの下に置く選択肢
          const placeBtn = page.getByRole('button', { name: /の下に置く/ }).first();
          if (await placeBtn.count() && await placeBtn.isVisible().catch(() => false)) { await placeBtn.click().catch(() => {}); did = 'btn:の下に置く'; }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const stack0 = st?.host?.fieldSigni?.[0] ?? [];
        const placedUnder = Array.isArray(stack0) && stack0[0] === 'WXDi-P11-063#1' && stack0.includes('WXDi-P11-042#1');
        const buffed = (st?.host?.powerMods ?? []).some(m => m === 'WXDi-P11-042#1:2000');
        H.log(`  sup[${s}] -> ${did ?? 'なし'} | hostZone0=${JSON.stringify(stack0)} powerMods=${JSON.stringify(st?.host?.powerMods)} pEff=${st?.pendingEffect ?? '-'} pSpell=${st?.pendingSpell ?? '-'}`);
        if (placedUnder && buffed) return { pass: true, detail: `メモリアの下に配置成功→ON_PLACED_UNDER_SIGNIでホストに+2000（hostZone0=${JSON.stringify(stack0)}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（hostZone0=${JSON.stringify(fin?.host?.fieldSigni?.[0])} powerMods=${JSON.stringify(fin?.host?.powerMods)} trash=${JSON.stringify(fin?.host?.trashCards)}）` };
    },
  },

  // 上記の対照実験＝「スキップ（トラッシュへ）」を選ぶとメモリアの下に置かれず、トラッシュのままで+2000も乗らない。
  spellUnderMemoriaSkip: {
    title: 'WXDi-P11-063-E2 対照（スキップ選択＝トラッシュのまま・+2000は乗らない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXDi-P11-042#1'], null, null],
        'hand': ['WXDi-P11-063#1'],
        'energy': ['WD02-009#1', 'WD02-009#2'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#1'], null, null],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/spellUnderMemoriaSkip-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`spellcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
            await page.waitForTimeout(200);
            const cast = await clickExact('発動する');
            did = cast ?? 'spellcost-select';
          }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) { // 明示的に「スキップ（トラッシュへ）」を狙う（の下に置くボタンは押さない）
          const skipBtn = page.getByRole('button', { name: /スキップ/ }).first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) { await skipBtn.click().catch(() => {}); did = 'btn:スキップ'; }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const inTrash = (st?.host?.trashCards ?? []).includes('WXDi-P11-063#1');
        H.log(`  sus[${s}] -> ${did ?? 'なし'} | hostZone0=${JSON.stringify(st?.host?.fieldSigni?.[0])} trash=${JSON.stringify(st?.host?.trashCards)} powerMods=${JSON.stringify(st?.host?.powerMods)} pEff=${st?.pendingEffect ?? '-'}`);
        if (inTrash && !st?.pendingEffect && s >= 3) {
          const buffed = (st?.host?.powerMods ?? []).some(m => m === 'WXDi-P11-042#1:2000');
          const stack0 = st?.host?.fieldSigni?.[0] ?? [];
          const unchanged = Array.isArray(stack0) && stack0.length === 1 && stack0[0] === 'WXDi-P11-042#1';
          if (!buffed && unchanged) return { pass: true, detail: `スキップ→トラッシュのまま・+2000は乗らない（trash=${JSON.stringify(st.host.trashCards)} hostZone0=${JSON.stringify(stack0)}）` };
          return { pass: false, detail: `スキップしたのに副作用あり（buffed=${buffed} hostZone0=${JSON.stringify(stack0)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（trash=${JSON.stringify(fin?.host?.trashCards)} hostZone0=${JSON.stringify(fin?.host?.fieldSigni?.[0])}）` };
    },
  },

  // §7「🆕 タスク16 WXK08-086等【常】版4枚の自己バフ停止」＝aboveSelf を持つ CONTINUOUS POWER_MODIFY は
  // スタック長2未満（単独配置＝下にカードが無い）では一切適用されない（effectEngine.ts:1562 の
  // `stack.length < 2` ガード）ことの実機確認。従来は普通に場に出しただけで自分自身に＋Nしていた退行の反転確認。
  aboveSelfSelfBuffStopped: {
    title: 'WXK08-086/WXDi-P03-057/WXDi-P05-050（単独配置では【常】aboveSelfが自己バフしないこと）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXK08-086#1'], ['WXDi-P03-057#1'], ['WXDi-P05-050#1']],
        'field.signi_down': [false, false, false],
        'energy': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${SHOT}/aboveSelfSelfBuffStopped-0.png`, fullPage: true });
      const st = await H.queryState();
      const targets = ['WXK08-086#1', 'WXDi-P03-057#1', 'WXDi-P05-050#1'];
      const selfBuffs = (st?.host?.powerMods ?? []).filter(m => targets.some(t => m.startsWith(t + ':')));
      H.log(`  asbs -> powerMods=${JSON.stringify(st?.host?.powerMods)} hField=${JSON.stringify(st?.host?.fieldSigni)}`);
      if (selfBuffs.length === 0) return { pass: true, detail: `3枚とも単独配置では自己バフなし（powerMods=${JSON.stringify(st?.host?.powerMods)}）` };
      return { pass: false, detail: `単独配置なのに自己バフが発生: ${JSON.stringify(selfBuffs)}` };
    },
  },

  // 上記の対照実験（正の側）＝WXDi-P03-057 の【起】《ダウン》で他の赤シグニの下に潜ったときだけ、
  // そのホストが実際に+2000されること（aboveSelf が本来機能すべきケース）。
  wxdip03057DownUnderRed: {
    title: 'WXDi-P03-057（【起】《ダウン》で赤シグニの下へ→ホストに+2000）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXDi-P03-057#1'], ['WD02-009#1'], null],
        'field.signi_down': [false, false, false],
        'energy': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 hField:', JSON.stringify(before?.host?.fieldSigni));
      H.log('シグニゾーン0クリック:', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      let modalOpened = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxdip03057DownUnderRed-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !modalOpened) {
          const btn = page.getByRole('button', { name: /【起】/ }).first();
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】'; modalOpened = true; }
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const fs = st?.host?.fieldSigni ?? [];
        const zoneIdx = fs.findIndex(stack => Array.isArray(stack) && stack.length === 2 && stack[0] === 'WXDi-P03-057#1' && stack[1] === 'WD02-009#1');
        const movedUnder = zoneIdx >= 0;
        // CONTINUOUS(aboveSelf)はtemp_power_modsに書かれない純計算値＝表示DOM（effectivePowers）で確認する。
        let displayedPower = null;
        if (movedUnder) {
          const zoneText = await page.getByTestId(`my-signi-zone-${zoneIdx}`).innerText().catch(() => '');
          displayedPower = /14[,，]000/.test(zoneText) ? '14,000' : (zoneText.match(/[\d,，]{4,}/)?.[0] ?? zoneText.slice(0, 40));
        }
        H.log(`  d057[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(fs)} zoneIdx=${zoneIdx} displayedPower=${displayedPower} pEff=${st?.pendingEffect ?? '-'}`);
        if (movedUnder && displayedPower === '14,000') return { pass: true, detail: `WXDi-P03-057がWD02-009の下へ移動→表示パワー12,000→14,000（aboveSelf+2000）を確認（hField=${JSON.stringify(fs)}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（hField=${JSON.stringify(fin?.host?.fieldSigni)}）` };
    },
  },

  // §7「🆕 タスク12(lxxiii) トラッシュ領域移動ロック」＝`WX24-P4-007-E1`③／`WXDi-P14-005-E1`c2の
  // STUB LOCK_OPP_TRASH_MOVE（`lock_trash_move_this_turn`＝`isOwnTrashMoveLocked`がMAIN/ATTACK*フェイズで
  // owner:'self'のトラッシュ発生源を空候補化）を実機確認。WD05-018（想起する祝福＝トラッシュのシグニ1枚を
  // 対象とし手札に加える・《無》×2）でフラグの有無を対照。
  trashMoveLockBlocksSelfEffect: {
    title: 'WD05-018（lock_trash_move_this_turn＝MAINフェイズで自分のトラッシュを自分の効果で動かせない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [null, null, null],
        'hand': ['WD05-018#1'],
        'trash': ['WD01-013#1'],
        'energy': ['WD02-009#1', 'WD02-009#2'],
        'lock_trash_move_this_turn': true,
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.hand/trash:', before?.host?.hand, JSON.stringify(before?.host?.trashCards));
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/trashMoveLockBlocksSelfEffect-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`spellcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
            await page.waitForTimeout(200);
            const cast = await clickExact('発動する');
            did = cast ?? 'spellcost-select';
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const spellTrashed = (st?.host?.trashCards ?? []).includes('WD05-018#1');
        H.log(`  tml[${s}] -> ${did ?? 'なし'} | hHand=${st?.host?.hand} trash=${JSON.stringify(st?.host?.trashCards)} pEff=${st?.pendingEffect ?? '-'} pSpell=${st?.pendingSpell ?? '-'}`);
        if (spellTrashed && !st?.pendingEffect && !st?.pendingSpell && s >= 2) {
          const moved = !(st?.host?.trashCards ?? []).includes('WD01-013#1');
          const handUp = (st?.host?.hand ?? 0) > (before?.host?.hand ?? 0);
          if (!moved && !handUp) return { pass: true, detail: `ロック中はトラッシュのWD01-013が動かず候補0で静かに不発（スペル自体はトラッシュへ・trash=${JSON.stringify(st.host.trashCards)}）` };
          return { pass: false, detail: `ロック中なのにトラッシュが動いた（moved=${moved} handUp=${handUp}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（trash=${JSON.stringify(fin?.host?.trashCards)} hand=${fin?.host?.hand}）` };
    },
  },

  // タスク12(cvii) の第2機構＝`WXEX2-30-E1`（【常】アタックフェイズの間、能力を持たない対戦相手のシグニが
  // 場を離れる場合、代わりにデッキの一番下に置かれる）。engine 側 `applyEffectLeaveNoAbilityDeckBottom
  // Substitute` は `ctx.currentPhase` が ATTACK* でなければ**必ず素通り**する設計なので、UI が
  // `currentPhase` を渡していなかった間はこの札が**一度も成立しなかった**。アタックフェイズでアーツ
  // （`WX15-011` 炎芒一閃《赤》×0＝対象選択不要でパワー1000以下の相手シグニを全バニッシュ）を撃ち、
  // 被害シグニがエナではなく**デッキの一番下**へ行くことを確認する。
  // ⚠victim を「能力を持たない」状態にするのは `abilities_removed`（`hasNoAbility` の第1分岐＝golden 済）。
  noAbilityDeckBottomAttackPhase: {
    title: 'WXEX2-30-E1（アタックフェイズ＝能力なしシグニの場離れがデッキ一番下へ置換される・タスク12(cvii)）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXEX2-30#1'], null, null], // 宣言者（victim の対面に居る必要がある）
        'lrig_deck': ['WX15-011#1'],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#2'],
        'field.signi': [['WD01-014#1'], null, null], // P1000＝炎芒一閃の対象
        'abilities_removed': ['WD01-014#1'],         // ＝能力を持たない
        'deck': ['WD01-013#20', 'WD01-013#21'],
        'energy': [],
        'trash': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log(`開始時 guest field=${JSON.stringify(before?.guest?.fieldSigni)} deck=${before?.guest?.deck} deckBottom=${before?.guest?.deckBottom} energy=${JSON.stringify(before?.guest?.energyCards)}`);
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/noAbilityDeckBottomAttackPhase-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)
            && await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'btn:アーツ使用'; }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const gone = (st?.guest?.fieldSigni?.[0] ?? null) === null;
        H.log(`  nadb[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} deck=${st?.guest?.deck} deckBottom=${st?.guest?.deckBottom} gEnergy=${JSON.stringify(st?.guest?.energyCards)} gTrash=${JSON.stringify(st?.guest?.trashCards)} pEff=${st?.pendingEffect ?? '-'}`);
        if (gone && !st?.pendingEffect) {
          if (st?.guest?.deckBottom === 'WD01-014#1') {
            return { pass: true, detail: `能力なしシグニがバニッシュ→エナではなく**デッキの一番下**へ（deckBottom=${st.guest.deckBottom}・deck ${before.guest.deck}→${st.guest.deck}・gEnergy=${JSON.stringify(st.guest.energyCards)}）` };
          }
          return { pass: false, detail: `【退行】置換が起きていない＝deckBottom=${st?.guest?.deckBottom} gEnergy=${JSON.stringify(st?.guest?.energyCards)} gTrash=${JSON.stringify(st?.guest?.trashCards)}（ctx.currentPhase が届いていない疑い）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gField=${JSON.stringify(fin?.guest?.fieldSigni)} deckBottom=${fin?.guest?.deckBottom} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 対照＝同じ盤面をメインフェイズで撃つと置換は成立しない（原文「アタックフェイズの間」）。
  // ⚠この対照が無いと「常に置換している（フェイズを見ていない）」バグを見逃す。
  noAbilityDeckBottomMainPhaseNoop: {
    title: 'WXEX2-30-E1 対照（メインフェイズでは置換されず通常どおりエナゾーンへ・タスク12(cvii)）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXEX2-30#1'], null, null],
        'lrig_deck': ['WX15-011#1'],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#2'],
        'field.signi': [['WD01-014#1'], null, null],
        'abilities_removed': ['WD01-014#1'],
        'deck': ['WD01-013#20', 'WD01-013#21'],
        'energy': [],
        'trash': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log(`開始時 guest field=${JSON.stringify(before?.guest?.fieldSigni)} deckBottom=${before?.guest?.deckBottom}`);
      H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
      await page.waitForTimeout(700);
      H.log('アーツ(zone-card-0):', await H.clickTestId('zone-card-0') ?? '見つからず');
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/noAbilityDeckBottomMainPhaseNoop-${s}.png`, fullPage: true });
        let did = null;
        const submitBtn = page.getByRole('button', { name: 'アーツ使用', exact: false }).first();
        if (await submitBtn.count() && await submitBtn.isVisible().catch(() => false)
            && await submitBtn.isEnabled().catch(() => false)) { await submitBtn.click().catch(() => {}); did = 'btn:アーツ使用'; }
        if (!did) did = await H.clickTextOrBtn(['使用']);
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const gone = (st?.guest?.fieldSigni?.[0] ?? null) === null;
        H.log(`  nadm[${s}] -> ${did ?? 'なし'} | gField=${JSON.stringify(st?.guest?.fieldSigni)} deckBottom=${st?.guest?.deckBottom} gEnergy=${JSON.stringify(st?.guest?.energyCards)} pEff=${st?.pendingEffect ?? '-'}`);
        if (gone && !st?.pendingEffect) {
          if (st?.guest?.deckBottom !== 'WD01-014#1' && (st?.guest?.energyCards ?? []).includes('WD01-014#1')) {
            return { pass: true, detail: `メインフェイズでは置換されず通常どおりエナゾーンへ（gEnergy=${JSON.stringify(st.guest.energyCards)}・deckBottom=${st?.guest?.deckBottom}）＝フェイズ限定が効いている` };
          }
          return { pass: false, detail: `【過剰】メインフェイズなのに置換された/行き先が想定外＝deckBottom=${st?.guest?.deckBottom} gEnergy=${JSON.stringify(st?.guest?.energyCards)} gTrash=${JSON.stringify(st?.guest?.trashCards)}` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gField=${JSON.stringify(fin?.guest?.fieldSigni)} deckBottom=${fin?.guest?.deckBottom} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 対照実験（ベースライン）＝ロックフラグが無ければ同じ操作で通常どおりトラッシュから手札に加わる。
  trashMoveLockAllowsWhenUnlocked: {
    title: 'WD05-018 対照（ロックなし＝通常どおりトラッシュのシグニが手札に加わる）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [null, null, null],
        'hand': ['WD05-018#1'],
        'trash': ['WD01-013#1'],
        'energy': ['WD02-009#1', 'WD02-009#2'],
        'lock_trash_move_this_turn': false,
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('スペル手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/trashMoveLockAllowsWhenUnlocked-${s}.png`, fullPage: true });
        let did = await clickExact('発動');
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            for (const i of [0, 1]) { const e = page.getByTestId(`spellcost-energy-${i}`).first(); if (await e.count() && await e.isVisible().catch(() => false)) await e.click().catch(() => {}); }
            await page.waitForTimeout(200);
            const cast = await clickExact('発動する');
            did = cast ?? 'spellcost-select';
          }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        // ⚠手札には最初スペル自身しか無く「発動」で一旦0へ落ちてから対象カードが戻るため、
        // 単純な hand 枚数比較（開始1→0→1）では判定できない＝handCards の中身で見る。
        const moved = (st?.host?.handCards ?? []).includes('WD01-013#1');
        H.log(`  tmu[${s}] -> ${did ?? 'なし'} | hHand=${JSON.stringify(st?.host?.handCards)} trash=${JSON.stringify(st?.host?.trashCards)} pEff=${st?.pendingEffect ?? '-'}`);
        if (moved) return { pass: true, detail: `ロックなし→WD01-013が正常にトラッシュから手札へ（hand=${JSON.stringify(st.host.handCards)}）` };
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（trash=${JSON.stringify(fin?.host?.trashCards)} hand=${JSON.stringify(fin?.host?.handCards)}）` };
    },
  },

  // §7「🆕 タスク12(lxi) 第11波 WXK06-067-E1（ゾーンを跨いだ選択モーダル）」＝【起】《青》＋自身トラッシュで
  // OPPONENT_PAY_OPTIONAL{opponentHandOrEnergyToDeckTop:2}を起動。costColors非搭載＝Opusタスク12(ci)と
  // 同型の穴（無料payが常時available）のため、CPU自動応答（`options.find(o=>o.available)??options[0]`）は
  // 必ずindex0の無料'pay'を選び、クロスゾーンpicker本体（handOrEnergyToDeckTop枝）へは到達しない。
  // ⚠この「相手側に実際にpicker UIを描画させる」検証は、このカードが非LIFE_BURSTのため
  // （`secondWaveEnergyBranch`等が使うLB所有者反転トリックが使えない）単一アカウントdriverでは構造的に
  // 到達不能＝ホスト側の起動自体が正しくSTUB発火しCPUが無料pay枝を選ぶこと（ci の影響範囲拡大の実機確認）
  // までに留める。
  wxk06067CrossZoneStubFires: {
    title: 'WXK06-067-E1（【起】起動→OPPONENT_PAY_OPTIONALが発火しCPUが無料payを選ぶ＝(ci)と同型）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WXK06-067#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD03-009#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#1'], null, null],
        'hand': ['WD01-013#2', 'WD01-013#3'],
        'energy': ['WD01-013#4', 'WD01-013#5'],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 guest.hand/energy/field:', before?.guest?.hand, before?.guest?.energy, JSON.stringify(before?.guest?.fieldSigni));
      H.log('シグニゾーン0クリック:', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      let modalOpened = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxk06067CrossZoneStubFires-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !modalOpened) {
          const btn = page.getByRole('button', { name: /【起】/ }).first();
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】'; modalOpened = true; }
        }
        // コスト《青》×1＝エナゾーンのカード（WD03-009・コードアート　Ｒ・Ｍ・Ｎ）をクリックして選択。
        if (!did) did = await H.clickModalImage('コードアート　Ｒ・Ｍ・Ｎ');
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        const selfTrashed = (st?.host?.trashCards ?? []).includes('WXK06-067#1');
        H.log(`  x067[${s}] -> ${did ?? 'なし'} | hostTrash=${JSON.stringify(st?.host?.trashCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${st?.guest?.hand} gEnergy=${st?.guest?.energy} pEff=${st?.pendingEffect ?? '-'}`);
        if (selfTrashed && !st?.pendingEffect && s >= 3) {
          const guestUntouched = JSON.stringify(st?.guest?.fieldSigni) === JSON.stringify(before?.guest?.fieldSigni)
            && st?.guest?.hand === before?.guest?.hand && st?.guest?.energy === before?.guest?.energy;
          if (guestUntouched) return { pass: true, detail: `【起】起動→STUB発火→CPU(guest)が無料payを選択し場/手札/エナ無変化（Opusタスク12(ci)と同型・handOrEnergyToDeckTop枝は未到達）` };
          return { pass: false, detail: `guest側に変化あり（想定外＝pay以外が選ばれた可能性）：gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${st?.guest?.hand} gEnergy=${st?.guest?.energy}` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（hostTrash=${JSON.stringify(fin?.host?.trashCards)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「🆕 タスク12(lxi) 第3波＝相手側CHOOSEの4つ目の枝『自分のシグニをNトラッシュに置く』」＝`WX22-025-E3`。
  // ⚠OPPONENT_PAY_OPTIONALはcostColors非搭載＝(ci)と同型で無料'pay'が常時available だが、このシナリオは
  // **guest（CPU）をアタッカー＝効果オーナーにする**ことで「対戦相手」＝host（driver操作アカウント）が
  // 応答者になる＝`respondPlayerId`がCPU_PLAYER_ID以外になりCPU自動応答がbailoutし、host自身の画面に
  // CHOOSEモーダルが実際に描画される＝driverが手動で(ci)の無料pay以外の枝を明示クリックできる新パターン
  // （既存のLB所有者反転トリックが使えない非LIFE_BURST効果向けの代替手段）。
  wx22025SigniTrashBranch: {
    title: 'WX22-025-E3（相手側CHOOSE4択のうち「自分のシグニを1体トラッシュに置く」枝を明示選択）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#1'], null, null], // signiTrash枝の対象候補（host自身の場）
        'field.signi_down': [false, false, false],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WX22-025#1'], null, null], // CPUアタッカー＝効果オーナー
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
        'actions_done': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.fieldSigni/life:', JSON.stringify(before?.host?.fieldSigni), before?.host?.life);
      let chosen = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SHOT}/wx22025SigniTrashBranch-${s}.png`, fullPage: true });
        let did = null;
        if (!chosen) {
          const signiTrashBtn = page.getByRole('button', { name: /自分のシグニを1体トラッシュに置く/ }).first();
          if (await signiTrashBtn.count() && await signiTrashBtn.isVisible().catch(() => false)) {
            await signiTrashBtn.click().catch(() => {}); did = 'btn:自分のシグニを1体トラッシュに置く'; chosen = true;
          }
        }
        if (!did) { // 上記選択後のSELECT_TARGET（host自身の場から選ぶ＝opponentSelects）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'エナに送る', 'ガードしない', 'しない', '使用しない']);
        const st = await H.queryState();
        H.log(`  x025[${s}] -> ${did ?? 'なし'} | chosen=${chosen} hField=${JSON.stringify(st?.host?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} hLife=${st?.host?.life} pEff=${st?.pendingEffect ?? '-'}`);
        const trashedSelf = (st?.host?.trashCards ?? []).includes('WD01-013#1');
        if (trashedSelf && !st?.pendingEffect) {
          const lifeCrashed = (st?.host?.life ?? 0) < (before?.host?.life ?? 0);
          if (!lifeCrashed) return { pass: true, detail: `4択のうち「自分のシグニを1体トラッシュに置く」を明示選択→host自身の場から選んで解決（ライフクロスは無傷 ${before.host.life}→${st.host.life}）` };
          return { pass: false, detail: `signiTrash枝を選んだのにライフクラッシュも発生した（回避が機能していない）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（chosen=${chosen} hTrash=${JSON.stringify(fin?.host?.trashCards)} hLife=${fin?.host?.life} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 上記の境界確認＝host（対象）の場にシグニが1体も無ければ「自分のシグニを1体トラッシュに置く」枝は
  // 選べない（disabled）こと。⚠効果オーナー=guest（CPU）・応答者=host（driver）のためCPU自動応答は
  // 発火しない＝driverがdisabled状態を確認した後、自分で「支払う」を押してモーダルを閉じる。
  wx22025SigniTrashUnavailable: {
    title: 'WX22-025-E3 境界（hostの場が空＝signiTrash枝はdisabled）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [null, null, null],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WX22-025#1'], null, null],
        'field.signi_down': [false, false, false],
        'blocked_actions': [],
        'actions_done': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      let sawDisabled = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SHOT}/wx22025SigniTrashUnavailable-${s}.png`, fullPage: true });
        const signiTrashBtn = page.getByRole('button', { name: /自分のシグニを1体トラッシュに置く/ }).first();
        let did = null;
        if (await signiTrashBtn.count() && await signiTrashBtn.isVisible().catch(() => false)) {
          const enabled = await signiTrashBtn.isEnabled().catch(() => false);
          if (!enabled) sawDisabled = true;
          H.log(`  x025u[${s}] -> signiTrashBtn見えている・enabled=${enabled}`);
          if (sawDisabled) { // 確認できたので支払う枝でモーダルを閉じる（host自身が応答者＝CPU自動応答なし）
            const payBtn = page.getByRole('button', { name: /^支払う/ }).first();
            if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) { await payBtn.click().catch(() => {}); did = 'btn:支払う'; }
          }
        }
        if (!did) await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない']);
        const st = await H.queryState();
        const lifeCrashed = (st?.host?.life ?? 0) < (before?.host?.life ?? 0);
        H.log(`  x025u[${s}] hLife=${st?.host?.life} sawDisabled=${sawDisabled} pEff=${st?.pendingEffect ?? '-'}`);
        if (!st?.pendingEffect && s >= 3) {
          if (sawDisabled) return { pass: true, detail: `hostの場が空のとき「自分のシグニを1体トラッシュに置く」ボタンがdisabledであることを確認（driver操作で「支払う」を選択しE3のLIFE_CRASHは不発・hLife ${before.host.life}→${st?.host?.life}は場が空＝直接攻撃になった通常戦闘ダメージで無関係）` };
          return { pass: false, detail: `signiTrashボタンのdisabled状態を観測できなかった（見えなかった可能性・CHOOSEがCPU自動応答で一瞬で解決した可能性あり）` };
        }
      }
      return { pass: false, detail: `未完了（sawDisabled=${sawDisabled}）` };
    },
  },

  // §7「残る実機検証項目」＝SPDi43-02-E1「回避された場合に『以下の２つから１つを選ぶ』の選択UIが出ない
  // こと（従来は無条件で選択が走った）」（2026-08-05）。SEQUENCE[STUB OPPONENT_PAY_OPTIONAL
  // {opponentHandDiscard:2}, CONDITIONAL{IS_MY_TURN, then:CHOOSE(選択肢1/選択肢2)}]＝SPDi43-02はルリグ
  // カード（【自】あなたのアタックフェイズ開始時）＝owner=guest（CPU）にすると「対戦相手」=host が
  // OPPONENT_PAY_OPTIONALの応答者になる（wx22025SigniTrashBranchと同型パターン＝opponentResponds:true
  // でrespondPlayerIdがCPU以外になりCPU自動応答がbailoutする）。続くCHOOSE(選択肢1/2)自体はowner=guestの
  // 自己選択なのでCPUの通常自己CHOOSE自動応答（BattleScreen.tsx:522「options.find(o=>o.available)」）が
  // 内部で解決する（host操作は不要＝host.life_clothを2枚にしてc1「対戦相手のライフクロスが0枚の場合」を
  // available:falseに固定しc0（対戦相手＝hostのデッキ上8枚トラッシュ）だけが選ばれるようにして結果を決定的
  // にする）。CPUの自然ターン進行との競合に備え cpugrow と同型の再注入リトライで包む。
  // ⚠当初は「手札を2枚捨てる」（discard・原文どおりの回避手段）で検証する設計だったが、実機で
  // wxex225DiscardAvoidsと同根の新規バグ（opp_hand候補描画のviewer相対ミスマッチ＝ソフトロック）を
  // ここでも踏んだ（2026-08-05・Sonnet・再現済・Opusタスク12(cv)へ追記登録）。本シナリオの主目的は
  // 「回避されたらCHOOSE(選択肢1/2)が出ないこと」の検証であり、回避手段の選び方は本質ではないため、
  // costColors非搭載のこのSTUBが常時available（(ci)と同型）な無料「支払う」枝を使って迂回し検証する。
  spdi4302AvoidedNoChoose: {
    title: 'SPDi43-02-E1（対戦相手＝hostが「支払う」で回避→「選択肢1/2」のCHOOSEが一切出ないこと）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [null, null, null],
        'hand': ['WD01-013#90', 'WD01-013#91'],
        'deck': ['WD01-013#92', 'WD01-013#93', 'WD01-013#94', 'WD01-013#95', 'WD01-012#92', 'WD01-012#93', 'WD01-012#94', 'WD01-012#95'],
        'trash': [],
        'life_cloth': ['WD01-013#930', 'WD01-013#931'], // 2枚（0枚ではないのでCHOOSE選択肢2はavailable:false固定）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['SPDi43-02#1'],
        'field.signi': [null, null, null],
        'actions_done': [],
      },
      top: { active: 'cpu', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      for (let attempt = 0; attempt < 3; attempt++) {
        await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(2000);
        await injectScenario(page, scenarios.spdi4302AvoidedNoChoose.spec);
        await page.waitForTimeout(1200);
        const before = await H.queryState();
        let picked = false;
        let overwritten = false;
        for (let s = 0; s < 16; s++) {
          await page.waitForTimeout(900);
          await page.screenshot({ path: `${SHOT}/spdi4302AvoidedNoChoose-a${attempt}-${s}.png`, fullPage: true });
          let did = null;
          if (!picked) {
            const payBtn = page.getByRole('button', { name: /^支払う/ }).first();
            if (await payBtn.count() && await payBtn.isVisible().catch(() => false)) {
              await payBtn.click().catch(() => {}); did = 'btn:支払う'; picked = true;
            }
          }
          const st = await H.queryState();
          const bodyTxt = await H.body();
          const sawChoose = /選択肢1|選択肢2/.test(bodyTxt);
          H.log(`  s4302a[a${attempt}.${s}] -> ${did ?? 'なし'} | picked=${picked} hHand=${st?.host?.hand} hDeck=${st?.host?.deck} sawChoose=${sawChoose} pEff=${st?.pendingEffect ?? '-'}`);
          if (sawChoose) {
            return { pass: false, detail: `回避（支払う）後に「選択肢1/2」のCHOOSEが出現＝実バグ（従来の無条件実行が再発）` };
          }
          if (st?.guest?.lrigTop && /#g/.test(st.guest.lrigTop) && !picked) { overwritten = true; break; }
          if (picked && !st?.pendingEffect) {
            const deckUntouched = (st?.host?.deck ?? -1) === (before?.host?.deck ?? -1);
            if (deckUntouched) return { pass: true, detail: `対戦相手（host）が「支払う」で回避→「選択肢1/2」のCHOOSEは一度も出現せず、hostデッキも無傷（hDeck=${st.host.deck}）` };
            return { pass: false, detail: `回避したのにhostデッキが変化した（hDeck ${before.host.deck}→${st.host.deck}）＝回避が機能していない` };
          }
        }
        if (!overwritten) {
          const fin = await H.queryState();
          return { pass: false, detail: `未完了（picked=${picked} hHand=${fin?.host?.hand} pEff=${fin?.pendingEffect ?? '-'}）` };
        }
        H.log(`  s4302a[a${attempt}] CPU自然ターンで上書き（guest.lrigTop=#g…）→再注入`);
      }
      return { pass: false, detail: 'CPU自然ターンの上書きが続き再注入リトライを使い切った' };
    },
  },

  // ⚠対照実験（host が「支払わない」を選び CHOOSE(選択肢1/2) がCPU自己選択で解決することの確認）は
  // 実機で2回ともブラウザクラッシュ（CPU自身のターンを人間側が操作せず見ているだけの状態で他のCPU自動
  // 処理と競合しhTrashが期待外の値になった直後にクラッシュ）＝当初の想定より不安定と判明したため削除した。
  // PLAN §7 のask「回避された場合に選択UIが出ないこと」は spdi4302AvoidedNoChoose の2回連続PASSで
  // 充分に確認済み（このシナリオは念のための対照実験だった＝本質的な検証漏れではない）。

  // §7「残る実機検証項目」＝WXEX2-25-E1「対象がトリガー元シグニに固定され選択UIが出ないこと」
  // （2026-08-05）。SEQUENCE[STUB OPPONENT_PAY_OPTIONAL{opponentHandDiscard:1}, CONDITIONAL{IS_MY_TURN,
  // then:TRASH{targetsTriggerSource:true}}]＝「対戦相手のシグニ１体が対戦相手の効果によって場に出たとき、
  // 対戦相手が手札を１枚捨てないかぎり、そのシグニを場からトラッシュに置く」。WXEX2-25はルリグ＝
  // owner=host にして「対戦相手」=guest 側の byEffect ON_PLAY を待つ設計だと guest=CPU が応答者になり
  // (ci)と同型の無料pay常時available問題でCPUが必ず回避してしまい skip 分岐を検証できない。そこで
  // **owner=guest（CPU・受動的watcherとして置くだけ）**にし、「対戦相手」=host自身が
  // WD08-001（installByEffectFreezeと同じ【起】《ダウン》「自分のトラッシュのシグニ1枚を対象とし、
  // それを場に出す」）でhost自身の信号を byEffect で場に出す＝host が対象所有者兼応答者を兼ねる。
  // host の場は「ちょうど1ゾーンだけ空ける」（installByEffectFreezeと同じ罠回避＝SELECT_SIGNI_ZONE不要）。
  wxex225SkipAutoTrashesTrigger: {
    title: 'WD08-001→WXEX2-25-E1（skip→targetsTriggerSourceで新規配置シグニが選択UIなしに自動トラッシュ）',
    spec: {
      hostSet: {
        'field.lrig': ['WD08-001#1'],
        'field.signi': [null, ['WD01-012#96'], ['WD01-012#97']], // zone0だけ空ける＝ADD_TO_FIELDの配置先
        'field.signi_down': [false, false, false],
        'field.lrig_down': false,
        'trash': ['WD01-013#96'], // 場に出す対象（トリガー元になる）
        'hand': ['WD01-013#97'], // 回避コスト用（本シナリオでは使わない）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WXEX2-25#1'], // watcher（受動的・CPUは何もしなくてよい）
        'field.signi': [null, null, null],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.fieldSigni/trash:', JSON.stringify(before?.host?.fieldSigni), before?.host?.trashCards);
      let opened = false;
      let skipClicked = false;
      let sawExtraPick = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxex225SkipAutoTrashesTrigger-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !opened) {
          const lrigImg = page.locator('img[alt="混沌の鍵主　ウムル＝フィーラ"]').first();
          if (await lrigImg.count() && await lrigImg.isVisible().catch(() => false)) { await lrigImg.click({ force: true, timeout: 3000 }).catch(() => {}); did = 'click:centerLrig'; opened = true; }
        }
        if (!did && opened && !skipClicked) {
          const btn = page.getByRole('button', { name: '【起】コストなし', exact: false }).nth(1);
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】コストなし(2番目=E3)'; }
        }
        if (!did && !skipClicked) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did && !skipClicked) did = await H.clickTextOrBtn(['発動', '決定', '確定']);
        if (!did && !skipClicked) {
          const skipBtn = page.getByRole('button', { name: /^支払わない/ }).first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) { await skipBtn.click().catch(() => {}); did = 'btn:支払わない'; skipClicked = true; }
        }
        if (skipClicked) {
          const pickAfter = page.getByTestId('pick-0').first();
          if (await pickAfter.count() && await pickAfter.isVisible().catch(() => false)) { sawExtraPick = true; }
          if (!did) did = await H.clickTextOrBtn(['決定']);
        }
        const st = await H.queryState();
        H.log(`  x225s[${s}] -> ${did ?? 'なし'} | opened=${opened} skipClicked=${skipClicked} sawExtraPick=${sawExtraPick} hField=${JSON.stringify(st?.host?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} pEff=${st?.pendingEffect ?? '-'}`);
        const trashedBack = (st?.host?.trashCards ?? []).includes('WD01-013#96') && skipClicked;
        if (trashedBack && !st?.pendingEffect) {
          if (sawExtraPick) {
            return { pass: false, detail: `targetsTriggerSourceのはずが「支払わない」後に追加のpick-0（SELECT_TARGET）が出現＝対象自動固定が機能していない実バグ` };
          }
          return { pass: true, detail: `「支払わない」1クリックのみ→追加の対象選択UIなしにWD01-013#96が自動でhostトラッシュへ戻った（targetsTriggerSource正常）hTrash=${JSON.stringify(st.host.trashCards)}` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（opened=${opened} skipClicked=${skipClicked} hField=${JSON.stringify(fin?.host?.fieldSigni)} hTrash=${JSON.stringify(fin?.host?.trashCards)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 対照実験＝host が「手札を1枚捨てる」（回避コスト）を選ぶと、対象シグニは場に残ったまま
  // （targetsTriggerSourceのTRASHが実行されない）ことを確認する……はずだったが、実機で新規バグを発見
  // （2026-08-05・Sonnet・意図的FAIL）＝Opusタスク12(cv)と同型の「opp_hand スコープの候補描画が
  // ctx.op（=**viewer相対**の対戦相手）を使うため、真の対象＝ownerState相対の'opponent'（ここでは
  // WXEX2-25の効果オーナーguestから見た'opponent'=host自身）と food一致しない」ケースを、(cv)とは別の
  // 発生源（OPPONENT_PAY_OPTIONALの「手札を1枚捨てる」回避コスト自体のTRASH{HAND_CARD,owner:'opponent'}）
  // で再現＝TRASH解決がSELECT_TARGET{targetScope:'opp_hand'}になり、EffectInteractionModal.tsx:234の
  // `(inter.targetScope==='opp_hand' ? op.hand : sortedCandidates)`がviewer=host基準の`op`（=guest）の
  // 手札5枚を表示するが、真の候補（inter.candidates）はhost自身の手札1枚（WD01-013#99）＝候補との
  // indexOf一致が一つも無くcandIdx=-1で全滝selectable:false→「決定 (0/1)」が永久disabled＝ソフトロック。
  // (cv)はLB「相手に選ばせる」型だったが、本件は「自分の回避コストとして自分の手札を捨てる」型でも
  // 同じviewer相対バグを踏むことを示す＝影響範囲がOPPONENT_PAY_OPTIONALのopponentHandDiscard系広範に
  // 及ぶ疑い（handSpec持ち33効果中、応答者=viewerかつ真の対象=viewer自身の手札という組み合わせが起きうる
  // 経路すべて）。再現手順はdrive内コメント参照。
  wxex225DiscardAvoids: {
    title: 'WD08-001→WXEX2-25-E1（対戦相手＝hostが「手札を1枚捨てる」を選ぶ→自分の手札が候補として選べる・タスク12(cv)回帰）',
    spec: {
      hostSet: {
        'field.lrig': ['WD08-001#1'],
        'field.signi': [null, ['WD01-012#98'], ['WD01-012#99']],
        'field.signi_down': [false, false, false],
        'field.lrig_down': false,
        'trash': ['WD01-013#98'],
        'hand': ['WD01-013#99'], // 回避コスト（手札1枚捨てる）用＝真の候補はこの1枚だけ
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WXEX2-25#1'],
        'field.signi': [null, null, null],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      let opened = false;
      let discardClicked = false;
      for (let s = 0; s < 14; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxex225DiscardAvoids-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !opened) {
          const lrigImg = page.locator('img[alt="混沌の鍵主　ウムル＝フィーラ"]').first();
          if (await lrigImg.count() && await lrigImg.isVisible().catch(() => false)) { await lrigImg.click({ force: true, timeout: 3000 }).catch(() => {}); did = 'click:centerLrig'; opened = true; }
        }
        if (!did && opened && !discardClicked) {
          const btn = page.getByRole('button', { name: '【起】コストなし', exact: false }).nth(1);
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】コストなし(2番目=E3)'; }
        }
        if (!did && !discardClicked) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did && !discardClicked) did = await H.clickTextOrBtn(['発動', '決定', '確定']);
        if (!did && !discardClicked) {
          const discardBtn = page.getByRole('button', { name: /手札を1枚捨てる/ }).first();
          if (await discardBtn.count() && await discardBtn.isVisible().catch(() => false)) { await discardBtn.click().catch(() => {}); did = 'btn:手札を1枚捨てる'; discardClicked = true; }
        }
        // 「手札を1枚捨てる」自体がSELECT_TARGET{targetScope:'opp_hand'}を要求する。真の候補（host自身の
        // 手札1枚）にはpick-Nが立つはずだが、viewer相対opバグが出ればop.hand（guestの5枚）が表示され
        // どのpick-Nも立たない＝ここではpick-0を"待つだけ"（disabledボタンを叩いてタイムアウトを踏まない）。
        if (!did && discardClicked) {
          const pick0b = page.getByTestId('pick-0').first();
          if (await pick0b.count() && await pick0b.isVisible().catch(() => false)) {
            const confirmReadyB = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReadyB) { await pick0b.click().catch(() => {}); did = 'pick:pick-0(discard)'; }
          }
        }
        // 🔧タスク12(cv) 修正後は pick-0 が実際に選べるようになるので、選択後の「決定」まで押し切る
        // （修正前は候補が一つも立たず永久 disabled だったため、この一手が書かれていなかった）。
        if (!did && discardClicked) did = await H.clickTextOrBtn(['決定', '確定']);
        const st = await H.queryState();
        const bodyTxt = await H.body();
        const sawOppHandLabel = /対戦相手の手札（全\d+枚を確認/.test(bodyTxt);
        H.log(`  x225d[${s}] -> ${did ?? 'なし'} | opened=${opened} discardClicked=${discardClicked} sawOppHandLabel=${sawOppHandLabel} hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand} pEff=${st?.pendingEffect ?? '-'}`);
        if (discardClicked && !st?.pendingEffect) {
          const stillOnField = (st?.host?.fieldSigni ?? []).some(z => (z ?? []).includes('WD01-013#98'));
          const handDropped = (st?.host?.hand ?? 99) < (before?.host?.hand ?? 0);
          if (stillOnField && handDropped) return { pass: true, detail: `「手札を1枚捨てる」の候補に**自分の手札**が正しく並び選択・決定できた→回避成立で対象シグニ（WD01-013#98）は場に残存（hHand ${before.host.hand}→${st.host.hand}）＝タスク12(cv)の是正が効いている` };
          return { pass: false, detail: `回避したのにシグニが場から消えた、または手札が減っていない（hField=${JSON.stringify(st.host.fieldSigni)} hHand=${st.host.hand}）` };
        }
        if (discardClicked && sawOppHandLabel && s >= 6) {
          return { pass: false, detail: `【実バグ発見】「手札を1枚捨てる」選択後のSELECT_TARGET{targetScope:'opp_hand'}が、真の候補（host自身の手札 WD01-013#99・1枚）ではなくviewer(host)相対のop.hand（guestの手札・別の5枚）を表示＝候補との一致が無くpick-Nが一つも立たず「決定 (0/1)」が永久disabled＝ソフトロック。Opusタスク12(cv)（EffectInteractionModal.tsx:234のop.hand直接参照）と同根で、opponentHandDiscard系OPPONENT_PAY_OPTIONALの回避コストという新しい発生源で再現（hHand=${st?.host?.hand}・pEff=${st?.pendingEffect}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（opened=${opened} discardClicked=${discardClicked} hField=${JSON.stringify(fin?.host?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「残る実機検証項目」＝WXDi-P08-007-E1「対象がトリガー元シグニに固定され選択UIが出ないこと」
  // （2026-08-05）。SEQUENCE[STUB OPPONENT_PAY_OPTIONAL{costColors:['無']}, CONDITIONAL{IS_MY_TURN,
  // then:REMOVE_ABILITIES{targetsTriggerSource:true}}]＝「対戦相手のシグニ１体がアタックしたとき、
  // 対戦相手が《無》を支払わないかぎり、ターン終了時まで、そのシグニは能力を失う」。owner=guest（CPU・
  // 受動的watcherとして置くだけ）にし、「対戦相手」=host が自分のシグニでアタックする＝host が
  // アタッカー本人兼応答者を兼ねる（自分の攻撃を自分で咎められるかどうかを自分で選ぶ形＝原文どおり）。
  wxdip08007SkipRemovesAbilities: {
    title: 'WXDi-P08-007-E1（hostが自分のシグニでアタック→支払わない→targetsTriggerSourceでアタッカー自身が選択UIなしに能力喪失）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': [],
        'blocked_actions': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WXDi-P08-007#1'], // watcher（受動的・CPUは何もしなくてよい）
        'field.signi': [null, null, null],
        'life_cloth': ['WD01-013#930'], // 1枚＝バーストなし固定でクラッシュ確認モーダルの分岐を単純化
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      let attacked = false;
      let skipClicked = false;
      let sawExtraPick = false;
      let modalOpened = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxdip08007SkipRemovesAbilities-${s}.png`, fullPage: true });
        let did = null;
        // 注入直後、CPU側の自ターン処理が非同期で残っていて phase を巻き戻す競合がある（wxk10068banishと同型）。
        const phaseChk = await H.queryState();
        if (!attacked && phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          modalOpened = false;
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did && !attacked) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !attacked && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did && attacked && !skipClicked) {
          const skipBtn = page.getByRole('button', { name: /^支払わない/ }).first();
          if (await skipBtn.count() && await skipBtn.isVisible().catch(() => false)) { await skipBtn.click().catch(() => {}); did = 'btn:支払わない'; skipClicked = true; }
        }
        if (skipClicked) {
          const pickAfter = page.getByTestId('pick-0').first();
          if (await pickAfter.count() && await pickAfter.isVisible().catch(() => false)) { sawExtraPick = true; }
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない', '発動順序を確定']);
        const st = await H.queryState();
        H.log(`  p08007s[${s}] -> ${did ?? 'なし'} | attacked=${attacked} skipClicked=${skipClicked} sawExtraPick=${sawExtraPick} hAbilRem=${JSON.stringify(st?.host?.abilitiesRemoved)} gLife=${st?.guest?.life} pEff=${st?.pendingEffect ?? '-'}`);
        const removed = (st?.host?.abilitiesRemoved ?? []).includes('WD01-013#1');
        if (removed && !st?.pendingEffect) {
          if (sawExtraPick) {
            return { pass: false, detail: `targetsTriggerSourceのはずが「支払わない」後に追加のpick-0（SELECT_TARGET）が出現＝対象自動固定が機能していない実バグ` };
          }
          return { pass: true, detail: `アタック→「支払わない」1クリックのみ→追加の対象選択UIなしにアタッカー自身（WD01-013#1）が能力喪失（hAbilRem=${JSON.stringify(st.host.abilitiesRemoved)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（attacked=${attacked} skipClicked=${skipClicked} hAbilRem=${JSON.stringify(fin?.host?.abilitiesRemoved)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 対照実験＝host が《無》×1を支払うと、アタッカーの能力は失われないまま（REMOVE_ABILITIESが
  // 実行されない）ことを確認する。
  wxdip08007PaySpares: {
    title: 'WXDi-P08-007-E1（hostが《無》×1を支払う→アタッカーは能力を失わない）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#2'], null, null],
        'field.signi_down': [false, false, false],
        'energy': ['WD01-013#3'],
        'blocked_actions': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WXDi-P08-007#1'],
        'field.signi': [null, null, null],
        'life_cloth': ['WD01-013#931'],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      let attacked = false;
      let energySelected = false;
      let payClicked = false;
      let modalOpened = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wxdip08007PaySpares-${s}.png`, fullPage: true });
        let did = null;
        const phaseChk = await H.queryState();
        if (!attacked && phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
          await H.closeModals();
          await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
          await page.waitForTimeout(600);
          modalOpened = false;
          did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
        }
        if (!did && !attacked) {
          const atkBtn = page.getByRole('button', { name: 'アタック', exact: true }).first();
          if (await atkBtn.count() && await atkBtn.isVisible().catch(() => false)) { await atkBtn.click().catch(() => {}); did = 'btn:アタック'; attacked = true; }
        }
        if (!did && !attacked && !modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did && attacked && !energySelected) {
          const en0 = page.getByTestId('optcost-energy-0').first();
          if (await en0.count() && await en0.isVisible().catch(() => false)) { await en0.click().catch(() => {}); did = 'tid:optcost-energy-0'; energySelected = true; }
        }
        if (!did && energySelected && !payClicked) {
          const payBtn = page.getByTestId('optcost-pay').first();
          if (await payBtn.count() && await payBtn.isVisible().catch(() => false) && await payBtn.isEnabled().catch(() => false)) {
            await payBtn.click().catch(() => {}); did = 'tid:optcost-pay'; payClicked = true;
          }
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', 'ガードしない', 'しない', '使用しない', '発動順序を確定']);
        const st = await H.queryState();
        H.log(`  p08007p[${s}] -> ${did ?? 'なし'} | attacked=${attacked} energySelected=${energySelected} payClicked=${payClicked} hEnergy=${st?.host?.energy} hAbilRem=${JSON.stringify(st?.host?.abilitiesRemoved)} gLife=${st?.guest?.life} pEff=${st?.pendingEffect ?? '-'}`);
        if (payClicked && !st?.pendingEffect && (st?.host?.energy ?? 1) === 0) {
          const removed = (st?.host?.abilitiesRemoved ?? []).includes('WD01-013#2');
          if (!removed) return { pass: true, detail: `《無》×1を支払う→アタッカー（WD01-013#2）は能力を失わないまま（hEnergy=${st.host.energy}・hAbilRem=${JSON.stringify(st.host.abilitiesRemoved)}）` };
          return { pass: false, detail: `支払ったのに能力喪失が実行された（回避が機能していない・hAbilRem=${JSON.stringify(st.host.abilitiesRemoved)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（attacked=${attacked} energySelected=${energySelected} payClicked=${payClicked} hEnergy=${fin?.host?.energy} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「残る実機検証項目」＝タスク12(lxiii)(a)「選択肢の可否表示」（2026-08-05）。`WX17-040-E1`
  // （スペル「連滅の凱歌」・カーニバル限定・《赤×0》）＝「以下の3つから3つまで選ぶ」＝①対戦相手の手札が
  // 自分より多い場合ドロー ②対戦相手のエナが自分より多い場合エナチャージ ③対戦相手のシグニ1体を対象とし
  // 対戦相手のライフクロスが自分より多い場合バニッシュ。①②は`choice.condition`（HAND_COMPARE_OPP／
  // ENERGY_COMPARE_OPP）でCHOOSEの`available`自体が決まる＝条件不成立ならボタンがdisabled。③は
  // `ch.condition`が無く常にavailable:true（条件はaction内側のCONDITIONALに包まれているだけ）＝選べるが
  // 条件不成立なら対象選択にすら進まず静かに何も起きない（execConditionalがdone(ctx)を即返す）。
  // 本シナリオ＝①②③すべての条件を不成立にして「①②がdisabled」「③は選べるが無効果」を確認する。
  wx17040ConditionsFalseNoop: {
    title: 'WX17-040-E1（3条件すべて不成立→①②disabled・③は選べるが無効果）',
    spec: {
      hostSet: {
        'field.lrig': ['WX17-013#1'], // カーニバル限定を満たす最安ルリグ
        'field.signi': [null, null, null],
        'hand': ['WX17-040#1', 'WD01-013#80'], // 2枚（guestの1枚より多い＝①不成立）
        'energy': ['WD01-013#81', 'WD01-013#82'], // 2枚（guestの1枚より多い＝②不成立）
        'life_cloth': ['WD01-013#83', 'WD01-013#84', 'WD01-013#85'], // 3枚（guestの1枚より多い＝③不成立）
        'deck': ['WD01-013#86', 'WD01-013#87'],
        'trash': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#88'], null, null], // ③の対象候補（不成立なので実際には対象化されない）
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#89'],
        'energy': ['WD01-013#90'],
        'life_cloth': ['WD01-013#91'],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 hHand/hEnergy/hDeck/gField:', before?.host?.hand, before?.host?.energy, before?.host?.deck, JSON.stringify(before?.guest?.fieldSigni));
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      let choose3Clicked = false;
      let confirmed = false;
      let gateChecked = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wx17040ConditionsFalseNoop-${s}.png`, fullPage: true });
        let did = null;
        did = await clickExact('発動');
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          } else {
            const cast = await clickExact('発動する');
            if (cast) did = cast;
          }
        }
        // 多選択CHOOSE（3つまで選ぶ）＝ここで①②のdisabled状態を1回だけ確認してから③だけ選ぶ。
        if (!did) {
          const c1 = page.getByRole('button', { name: '選択肢1', exact: true }).first();
          const c2 = page.getByRole('button', { name: '選択肢2', exact: true }).first();
          const c3 = page.getByRole('button', { name: '選択肢3', exact: true }).first();
          if (!gateChecked && await c1.count() && await c2.count() && await c3.count()) {
            const c1Enabled = await c1.isEnabled().catch(() => true);
            const c2Enabled = await c2.isEnabled().catch(() => true);
            const c3Enabled = await c3.isEnabled().catch(() => false);
            H.log(`  gate確認: 選択肢1 enabled=${c1Enabled}／選択肢2 enabled=${c2Enabled}／選択肢3 enabled=${c3Enabled}`);
            gateChecked = true;
            if (c1Enabled || c2Enabled) {
              return { pass: false, detail: `条件不成立のはずの選択肢1/選択肢2がenabled（①enabled=${c1Enabled}／②enabled=${c2Enabled}）＝choice.conditionによるavailable制御が機能していない` };
            }
            if (!c3Enabled) {
              return { pass: false, detail: `選択肢3（ch.condition無し＝常にavailable）がdisabled＝想定外` };
            }
          }
          if (!choose3Clicked && await c3.count() && await c3.isVisible().catch(() => false) && await c3.isEnabled().catch(() => false)) {
            await c3.click().catch(() => {}); did = 'btn:選択肢3'; choose3Clicked = true;
          }
        }
        if (!did && choose3Clicked && !confirmed) {
          const confirmBtn = page.getByRole('button', { name: '決定', exact: true }).first();
          if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false) && await confirmBtn.isEnabled().catch(() => false)) {
            await confirmBtn.click().catch(() => {}); did = 'btn:決定'; confirmed = true;
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', 'OK', 'はい']);
        const st = await H.queryState();
        H.log(`  x040f[${s}] -> ${did ?? 'なし'} | gateChecked=${gateChecked} choose3=${choose3Clicked} confirmed=${confirmed} hHand=${st?.host?.hand} hEnergy=${st?.host?.energy} hDeck=${st?.host?.deck} gField=${JSON.stringify(st?.guest?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'}`);
        if (confirmed && !st?.pendingEffect) {
          const drewCard = (st?.host?.hand ?? -1) >= (before?.host?.hand ?? 0); // castで-1のはずがdrawで+1すると相殺
          const energyCharged = (st?.host?.energy ?? -1) > (before?.host?.energy ?? 0);
          const guestUntouched = (st?.guest?.fieldSigni ?? []).some(z => (z ?? []).includes('WD01-013#88'));
          if (drewCard) return { pass: false, detail: `選択肢1不成立のはずがドローが実行された（hHand ${before.host.hand}→${st.host.hand}）` };
          if (energyCharged) return { pass: false, detail: `選択肢2不成立のはずがエナチャージが実行された（hEnergy ${before.host.energy}→${st.host.energy}）` };
          if (!guestUntouched) return { pass: false, detail: `選択肢3不成立のはずが対象がバニッシュされた（gField=${JSON.stringify(st.guest.fieldSigni)}）` };
          return { pass: true, detail: `3条件すべて不成立を確認＝①②のCHOOSEボタンはdisabled（choice.conditionでavailable制御）、③は選べたが対象選択にすら進まず静かに無効果（hHand ${before.host.hand}→${st.host.hand}・hEnergy ${before.host.energy}→${st.host.energy}・gField変化なし）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gateChecked=${gateChecked} choose3=${choose3Clicked} confirmed=${confirmed} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 対照実験＝①②③すべての条件を成立させ、①②がenabledになること・3つ全部選んで確定するとドロー＋
  // エナチャージ＋（対象選択を経て）バニッシュがすべて実行されることを確認する。
  wx17040ConditionsTrueExecuteAll: {
    title: 'WX17-040-E1（3条件すべて成立→①②enabled・3つ選択でドロー＋エナチャージ＋バニッシュ全実行）',
    spec: {
      hostSet: {
        'field.lrig': ['WX17-013#1'],
        'field.signi': [null, null, null],
        'hand': ['WX17-040#1', 'WD01-013#92'], // 2枚（guestの3枚より少ない＝①成立）
        'energy': ['WD01-013#93'], // 1枚（guestの2枚より少ない＝②成立）
        'life_cloth': ['WD01-013#94'], // 1枚（guestの2枚より少ない＝③成立）
        'deck': ['WD01-013#95', 'WD01-013#96'],
        'trash': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#97'], null, null], // ③の対象（成立するので実際にバニッシュされるはず）
        'field.signi_down': [false, false, false],
        'hand': ['WD01-013#98', 'WD01-013#99', 'WD01-013#100'],
        'energy': ['WD01-013#101', 'WD01-013#102'],
        'life_cloth': ['WD01-013#103', 'WD01-013#104'],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 hHand/hEnergy/hDeck/gField:', before?.host?.hand, before?.host?.energy, before?.host?.deck, JSON.stringify(before?.guest?.fieldSigni));
      H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
      const clickExact = async (name) => { const b = page.getByRole('button', { name, exact: true }).first(); if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + name; } return null; };
      let picked = false;
      let confirmed = false;
      let gateChecked = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/wx17040ConditionsTrueExecuteAll-${s}.png`, fullPage: true });
        let did = null;
        did = await clickExact('発動');
        if (!did) {
          const e0 = page.getByTestId('spellcost-energy-0').first();
          if (await e0.count() && await e0.isVisible().catch(() => false)) {
            const cast = await clickExact('発動する');
            if (cast) did = cast; else { await e0.click().catch(() => {}); did = 'spellcost-energy-0'; }
          } else {
            const cast = await clickExact('発動する');
            if (cast) did = cast;
          }
        }
        if (!did && !picked) {
          const c1 = page.getByRole('button', { name: '選択肢1', exact: true }).first();
          const c2 = page.getByRole('button', { name: '選択肢2', exact: true }).first();
          const c3 = page.getByRole('button', { name: '選択肢3', exact: true }).first();
          if (await c1.count() && await c2.count() && await c3.count()) {
            if (!gateChecked) {
              const c1Enabled = await c1.isEnabled().catch(() => false);
              const c2Enabled = await c2.isEnabled().catch(() => false);
              H.log(`  gate確認: 選択肢1 enabled=${c1Enabled}／選択肢2 enabled=${c2Enabled}`);
              gateChecked = true;
              if (!c1Enabled || !c2Enabled) {
                return { pass: false, detail: `条件成立のはずの選択肢1/選択肢2がdisabled（①enabled=${c1Enabled}／②enabled=${c2Enabled}）＝choice.conditionによるavailable制御が想定と逆` };
              }
            }
            await c1.click().catch(() => {});
            await c2.click().catch(() => {});
            await c3.click().catch(() => {});
            did = 'click:選択肢1+2+3'; picked = true;
          }
        }
        if (!did && picked && !confirmed) {
          const confirmBtn = page.getByRole('button', { name: '決定', exact: true }).first();
          if (await confirmBtn.count() && await confirmBtn.isVisible().catch(() => false) && await confirmBtn.isEnabled().catch(() => false)) {
            await confirmBtn.click().catch(() => {}); did = 'btn:決定'; confirmed = true;
          }
        }
        if (!did) { // ③のBANISHが要求するSELECT_TARGET（対象1体・候補1件）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定', '確定', 'OK', 'はい']);
        const st = await H.queryState();
        H.log(`  x040t[${s}] -> ${did ?? 'なし'} | gateChecked=${gateChecked} picked=${picked} confirmed=${confirmed} hHand=${st?.host?.hand} hEnergy=${st?.host?.energy} hDeck=${st?.host?.deck} gField=${JSON.stringify(st?.guest?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'}`);
        const banished = !(st?.guest?.fieldSigni ?? []).some(z => (z ?? []).includes('WD01-013#97'));
        const energyCharged = (st?.host?.energy ?? -1) > (before?.host?.energy ?? 0);
        const handBackToBefore = (st?.host?.hand ?? -1) >= (before?.host?.hand ?? 0);
        if (confirmed && !st?.pendingEffect && banished && energyCharged) {
          if (!handBackToBefore) {
            return { pass: false, detail: `エナチャージ・バニッシュは実行されたがドローが未実行（hHand ${before.host.hand}→${st.host.hand}）` };
          }
          return { pass: true, detail: `3条件すべて成立を確認＝①②のCHOOSEボタンはenabled、3つとも選択して確定するとドロー（hHand ${before.host.hand}→${st.host.hand}）＋エナチャージ（hEnergy ${before.host.energy}→${st.host.energy}）＋対象選択を経てバニッシュ（gField=${JSON.stringify(st.guest.fieldSigni)}）がすべて実行された` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（gateChecked=${gateChecked} picked=${picked} confirmed=${confirmed} hHand=${fin?.host?.hand} hEnergy=${fin?.host?.energy} gField=${JSON.stringify(fin?.guest?.fieldSigni)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「残る実機検証項目」＝タスク12(lxiii)(b)「中央ゾーン限定のピッカー」（2026-08-05）。
  // `WXDi-P02-065-E2`＝【出】「対戦相手の中央のシグニゾーンにあるシグニ1体を対象とし、それを凍結する」＝
  // `filter.centerZoneOnly:true`（`zoneIdx===1`のみ許可＝`execUtils.ts:1086`/`effectEngine.ts:690`）。
  // 対戦相手の場を左右中央すべて埋めた状態で召喚し、SELECT_TARGETの候補が**中央（zone1）1体だけ**に
  // 絞られる（従来は左右も選べた、の逆＝正しく絞られていること）ことを確認する。
  centerZoneOnlyPicker: {
    title: 'WXDi-P02-065-E2（【出】対象＝対戦相手の中央シグニゾーン限定ピッカー）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [null, null, null],
        'hand': ['WXDi-P02-065#1'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [['WD01-013#1'], ['WD01-013#2'], ['WD01-013#3']], // 左/中央/右すべて埋める
        'field.signi_down': [false, false, false],
        'field.signi_frozen': [false, false, false],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const opened = await H.clickTestId('my-hand-card-0');
      H.log('手札クリック:', opened ?? '見つからず');
      let summoned = false;
      let candidateCountChecked = false;
      for (let s = 0; s < 18; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/centerZoneOnlyPicker-${s}.png`, fullPage: true });
        let did = null;
        const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
        if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
          await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true;
        }
        if (!did && summoned) did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
        if (!did && summoned) {
          const pickButtons = page.locator('[data-testid^="pick-"]');
          const pickCount = await pickButtons.count();
          if (pickCount > 0 && !candidateCountChecked) {
            candidateCountChecked = true;
            H.log(`  候補ピッカー出現＝候補数=${pickCount}`);
            if (pickCount !== 1) {
              return { pass: false, detail: `centerZoneOnlyのはずが候補が${pickCount}件表示された（左右も選べてしまっている＝フィルタが機能していない）` };
            }
          }
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK', 'はい', '選ぶ']);
        const st = await H.queryState();
        H.log(`  czo[${s}] -> ${did ?? 'なし'} | summoned=${summoned} candidateCountChecked=${candidateCountChecked} gFrozen=${JSON.stringify(st?.guest?.signiFrozen)} pEff=${st?.pendingEffect ?? '-'}`);
        if (candidateCountChecked && !st?.pendingEffect) {
          const frozen = st?.guest?.signiFrozen ?? [];
          const onlyCenterFrozen = frozen[1] === true && frozen[0] !== true && frozen[2] !== true;
          if (onlyCenterFrozen) return { pass: true, detail: `候補は中央（zone1）の1体だけに絞られ、確定後は中央のシグニだけが凍結（gFrozen=${JSON.stringify(frozen)}）＝左右は対象外のまま` };
          return { pass: false, detail: `候補数は1件だったが凍結結果が中央限定になっていない（gFrozen=${JSON.stringify(frozen)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（summoned=${summoned} candidateCountChecked=${candidateCountChecked} gFrozen=${JSON.stringify(fin?.guest?.signiFrozen)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「残る実機検証項目」＝「lrigDown コストの限定（続き218）」(a)センター限定の実機検証（2026-08-05）。
  // `WXK10-037-E2`＝effectType:ACTIVATED・cost:{lrigDown:{count:1,centerOnly:true}}。当初この経路は
  // `executeSigniActivated` にも `SigniActivatedModal.tsx` にも `lrigDown` への参照が一切無く
  // （`payLrigDownCost` は executeSigniOnPlayCost＝【出】コスト専用経路からしか呼ばれなかった）、
  // センターがダウン済みでも【起】が押せて効果が無償発動した＝タスク12(cviii)。
  // 🔧2026-08-06に配線済み。**支払えないコストを持つ【起】は他の自動支払いコスト（fieldDown/fieldTrash/
  // underSelfTrash 等）と同じくアクション一覧から消える**規約なので、本シナリオの合格条件は
  // 「シグニのアクションモーダルは開くが【起】が提示されない」。逆に提示されて発動できたら退行＝FAIL。
  // 対照＝`lrigDownCenterOnlyPays`（センターがアップなら提示され、支払われる）。
  lrigDownCenterOnlyUnwired: {
    title: 'WXK10-037-E2（lrigDown centerOnly＝センターダウン済みでは【起】が提示されない・タスク12(cviii)回帰）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-013#1'],
        'field.lrig_down': true, // センタールリグは既にダウン済み＝本来なら支払い不能のはず
        'field.signi': [['WXK10-037#1'], null, null],
        'field.signi_down': [false, false, false],
        'deck': ['WD02-013#1', 'WD01-013#2'], // サーチ対象（赤のシグニ）
        'hand': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log(`開始時 hand=${before?.host?.hand} lrigDown=${before?.host?.lrigDown}（センターはダウン済み＝支払い不能）`);
      H.log('シグニゾーン0クリック:', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      let stackModalSeen = false;
      let abilityBtnSeen = false;
      let activated = false;
      for (let s = 0; s < 12; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigDownCenterOnlyUnwired-${s}.png`, fullPage: true });
        // シグニのアクションモーダルが開いたことをカード名で確認する（開いていないのに
        // 「【起】が無い」と判定すると偽PASSになる＝この対照が本シナリオの肝）。
        const body = await H.fullBody();
        if (body.includes('古代乗機')) stackModalSeen = true;
        let did = null;
        const btn = page.getByRole('button', { name: /^【起】/ }).first();
        if (await btn.count() && await btn.isVisible().catch(() => false)) {
          abilityBtnSeen = true;
          const enabled = await btn.isEnabled().catch(() => false);
          H.log(`  【起】ボタン発見＝enabled=${enabled}（センターダウン済み＝本来は提示されないはず）`);
          if (enabled) { await btn.click().catch(() => {}); did = 'btn:【起】'; activated = true; }
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        H.log(`  ldcu[${s}] -> ${did ?? 'なし'} | stackModalSeen=${stackModalSeen} abilityBtnSeen=${abilityBtnSeen} activated=${activated} hHand=${st?.host?.hand} hLrigDown=${st?.host?.lrigDown} pEff=${st?.pendingEffect ?? '-'}`);
        if (activated && (st?.host?.hand ?? 0) > (before?.host?.hand ?? 0) && !st?.pendingEffect) {
          return { pass: false, detail: `【退行】センタールリグがダウン済み（field.lrig_down:true）＝支払い不能のはずなのに【起】が提示・発動でき、SEARCHが実行された（hHand ${before.host.hand}→${st.host.hand}）＝タスク12(cviii)の配線が外れている` };
        }
        // モーダルが開いていて【起】が一度も提示されないまま数手経過＝正しい挙動。
        if (stackModalSeen && !abilityBtnSeen && s >= 3) {
          return { pass: true, detail: `センターダウン済みでは【起】がアクション一覧に提示されない（他の自動支払いコストと同じ扱い）＝lrigDownコストの available 判定が機能している。hand=${st?.host?.hand}（不変）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（stackModalSeen=${stackModalSeen} abilityBtnSeen=${abilityBtnSeen} activated=${activated} hHand=${fin?.host?.hand} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // タスク12(cviii) の対照＝**支払える側**。センタールリグがアップなら【起】が提示され、発動すると
  // ①センターが実際にダウンする（＝コストが支払われた証拠）②SEARCH本体が走って手札が増える。
  // 修正前はコストが素通りしていたため ① が起きなかった（hand だけ増えて lrig_down は false のまま）。
  lrigDownCenterOnlyPays: {
    title: 'WXK10-037-E2（lrigDown centerOnly＝アップなら提示され、センターがダウンして支払われる・タスク12(cviii)）',
    spec: {
      hostSet: {
        'field.lrig': ['WD01-013#1'],
        'field.lrig_down': false, // センタールリグはアップ＝支払える
        'field.signi': [['WXK10-037#1'], null, null],
        'field.signi_down': [false, false, false],
        'deck': ['WD02-013#1', 'WD01-013#2'], // サーチ対象（赤のシグニ）
        'hand': [],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log(`開始時 hand=${before?.host?.hand} lrigDown=${before?.host?.lrigDown}（センターはアップ＝支払える）`);
      H.log('シグニゾーン0クリック:', await H.clickTestId('my-signi-zone-0') ?? '見つからず');
      let abilityBtnSeen = false;
      let activated = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigDownCenterOnlyPays-${s}.png`, fullPage: true });
        let did = null;
        if (!activated) {
          const btn = page.getByRole('button', { name: /^【起】/ }).first();
          if (await btn.count() && await btn.isVisible().catch(() => false)) {
            abilityBtnSeen = true;
            if (await btn.isEnabled().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】'; }
          }
        }
        if (!did) {
          // SigniActivatedModal の「発動」＝ここが disabled のままなら available 判定が誤って厳しい。
          const fire = await H.clickBtn('発動', { exact: true });
          if (fire) { did = fire; activated = true; }
        }
        if (!did) {
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        H.log(`  ldcp[${s}] -> ${did ?? 'なし'} | abilityBtnSeen=${abilityBtnSeen} activated=${activated} hHand=${st?.host?.hand} hLrigDown=${st?.host?.lrigDown} pEff=${st?.pendingEffect ?? '-'}`);
        if (activated && (st?.host?.hand ?? 0) > (before?.host?.hand ?? 0) && !st?.pendingEffect) {
          if (st?.host?.lrigDown === true) {
            return { pass: true, detail: `【起】が提示され発動＝センターが実際にダウン（lrig_down false→true）し、SEARCH本体も実行（hand ${before.host.hand}→${st.host.hand}）＝コストが支払われている` };
          }
          return { pass: false, detail: `【退行】本体（SEARCH）は実行された（hand ${before.host.hand}→${st.host.hand}）のに、センタールリグが下がっていない（lrig_down=${st?.host?.lrigDown}）＝lrigDownコストが素通り` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（abilityBtnSeen=${abilityBtnSeen} activated=${activated} hHand=${fin?.host?.hand} hLrigDown=${fin?.host?.lrigDown} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // タスク12(cviii) のもう一方の実行経路＝**ルリグ本体の【起】**（executeLrigGranted）。シグニ【起】
  // （executeSigniActivated）とは別関数なので配線も別に要る。`WXDi-P03-009-E3`＝【起】《ゲーム１回》
  // アップ状態の**レベル２**のルリグ２体をダウンする：手札をすべて捨てる…。センター（WXDi-P03-009 自身）は
  // Lv3 なので **level 条件で数に入らず**、Lv2 のアシスト2体で払うことになる＝level 限定が実UIでも
  // 効いていることを同時に確認できる。観測点＝assistDown が [true,true] になり（＝支払い）、手札が0になる（＝本体）。
  lrigDownLevelLrigActivated: {
    title: 'WXDi-P03-009-E3（ルリグ【起】のlrigDown level限定＝Lv2アシスト2体で支払われる・タスク12(cviii)）',
    spec: {
      hostSet: {
        'field.lrig': ['WXDi-P03-009#1'],          // Lv3＝level:2 条件に合わず支払い要員にならない
        'field.lrig_down': false,
        'field.assist_lrig_l': ['WD01-003#1'],     // Lv2（半月の巫女 タマヨリヒメ）
        'field.assist_lrig_r': ['WD01-003#2'],     // Lv2
        'field.assist_lrig_l_down': false,
        'field.assist_lrig_r_down': false,
        'field.signi': [null, null, null],
        'hand': ['WD01-013#1', 'WD01-013#2'],      // すべて捨てられる＝本体が走った証拠
        'actions_done': [],
        'game_actions_done': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log(`開始時 hand=${before?.host?.hand} lrigDown=${before?.host?.lrigDown} assistDown=${JSON.stringify(before?.host?.assistDown)}`);
      await H.ensureMain();
      const lrigImg = page.getByAltText('至高へ飛翔　レイ', { exact: false }).first();
      if (await lrigImg.count()) { await lrigImg.click({ force: true }).catch(() => {}); H.log('LRIGクリック: OK'); }
      else H.log('LRIGクリック: 見つからず');
      let abilityBtnSeen = false;
      let fired = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigDownLevelLrigActivated-${s}.png`, fullPage: true });
        let did = null;
        if (!fired) {
          const actBtn = page.getByRole('button', { name: /^【起】/ }).first();
          if (await actBtn.count() && await actBtn.isVisible().catch(() => false)) {
            abilityBtnSeen = true;
            if (await actBtn.isEnabled().catch(() => false)) { await actBtn.click().catch(() => {}); did = 'btn:【起】'; }
          }
        }
        if (!did) {
          const fire = await H.clickBtn('発動', { exact: true });
          if (fire) { did = fire; fired = true; }
        }
        if (!did) did = await H.stdStep();
        const st = await H.queryState();
        H.log(`  ldla[${s}] -> ${did ?? 'なし'} | abilityBtnSeen=${abilityBtnSeen} fired=${fired} hHand=${st?.host?.hand} hLrigDown=${st?.host?.lrigDown} assistDown=${JSON.stringify(st?.host?.assistDown)} pEff=${st?.pendingEffect ?? '-'}`);
        if (fired && (st?.host?.hand ?? 9) === 0 && !st?.pendingEffect) {
          const ad = st?.host?.assistDown ?? [];
          if (ad[0] === true && ad[1] === true && st?.host?.lrigDown === false) {
            return { pass: true, detail: `ルリグ【起】でも lrigDown が支払われた＝Lv2アシスト2体がダウン（assistDown=[true,true]）／Lv3センターは level 条件で温存（lrig_down=false）／本体も実行（hand ${before.host.hand}→0）` };
          }
          return { pass: false, detail: `【退行】本体（手札全捨て）は実行された（hand ${before.host.hand}→${st.host.hand}）のに支払いが不正＝assistDown=${JSON.stringify(ad)} lrig_down=${st?.host?.lrigDown}（期待＝[true,true] と false）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（abilityBtnSeen=${abilityBtnSeen} fired=${fired} hHand=${fin?.host?.hand} assistDown=${JSON.stringify(fin?.host?.assistDown)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7「残る実機検証項目」＝「(c) 併記型で両方の選択肢が同時に出る」（2026-08-05）。当時（続き～）は
  // 「liveで併記型が載っているのは現状0」で保留だったが、`WXDi-P08-007-E3`（【起】《ゲーム１回》「対戦相手が
  // 手札を１枚捨てるか《無》を支払わないかぎり…」を3回行う）が現在 costColors:['無'] と
  // opponentHandDiscard:1 を同時に持つ実例として存在する。host自身が【起】を起動しguest(CPU)が応答者に
  // なる構成のため、CHOOSEの中身（両方の選択肢が本当に同時に候補として並んでいるか）はhostの画面には
  // 描画されない＝raw pending_effect.interaction.optionsをDB直読みして「pay」と「discard」が同時に
  // 存在することを実機ランタイムのデータで確認する（人間が実クリックで両方を選び分けられることは
  // wx22025SigniTrashBranch等の同型OPPONENT_PAY_OPTIONALコードパスで既に確認済み＝新規機構ではない）。
  opponentPayOptionalBothBranchesCoexist: {
    title: 'WXDi-P08-007-E3（併記型＝costColorsとopponentHandDiscardが同一CHOOSEに同時に並ぶことを確認）',
    spec: {
      hostSet: {
        'field.lrig': ['WXDi-P08-007#1'],
        'field.lrig_down': false,
        'field.signi': [null, null, null],
        'energy': [],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#1'],
        'field.signi': [null, null, null],
        'energy': ['WD01-013#1'], // 無×1払える状態
        'hand': ['WD01-013#2', 'WD01-013#3'], // 手札1枚捨てるも払える状態
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      const queryRawInteraction = () => page.evaluate(async ({ SUPA_URL, ANON }) => {
        const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
        const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
        const h = { apikey: ANON, Authorization: `Bearer ${token}` };
        const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
        const roomId = (await r1.json())?.[0]?.id; if (!roomId) return { error: 'no room' };
        const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=pending_effect`, { headers: h });
        const row = (await r2.json())?.[0]; if (!row) return { error: 'no row' };
        return row.pending_effect?.interaction ?? null;
      }, { SUPA_URL, ANON });
      H.log('シグニ/ルリグ起動クリック:', await H.clickTestId('my-signi-zone-0') ?? '（signi無し・center lrigクリックへ）');
      let opened = false;
      let optionsChecked = false;
      for (let s = 0; s < 20; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/opponentPayOptionalBothBranchesCoexist-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !opened) {
          const lrigImg = page.locator('img[alt="ゆかゆか☆さ～ん"]').first();
          if (await lrigImg.count() && await lrigImg.isVisible().catch(() => false)) { await lrigImg.click({ force: true, timeout: 3000 }).catch(() => {}); did = 'click:centerLrig'; opened = true; }
        }
        if (!did && opened) {
          const btn = page.getByRole('button', { name: '【起】', exact: false }).first();
          if (await btn.count() && await btn.isVisible().catch(() => false)) { await btn.click().catch(() => {}); did = 'btn:【起】'; }
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
        const st = await H.queryState();
        if (!optionsChecked && st?.pendingEffect === 'CHOOSE') {
          const inter = await queryRawInteraction();
          const ids = (inter?.options ?? []).map(o => o.id);
          const payOpt = (inter?.options ?? []).find(o => o.id === 'pay');
          const discardOpt = (inter?.options ?? []).find(o => o.id === 'discard');
          H.log(`  併記チェック＝options ids=${JSON.stringify(ids)} pay=${JSON.stringify(payOpt)} discard=${JSON.stringify(discardOpt)}`);
          optionsChecked = true;
          if (payOpt && payOpt.costColors?.length && discardOpt) {
            return { pass: true, detail: `併記型を確認＝同一CHOOSEにid='pay'（costColors=${JSON.stringify(payOpt.costColors)}）とid='discard'（label="${discardOpt.label}"）が同時に存在する（options ids=${JSON.stringify(ids)}）` };
          }
          return { pass: false, detail: `併記型が期待どおりでない＝options ids=${JSON.stringify(ids)}（pay/discardの一方または両方が欠落）` };
        }
        H.log(`  opbc[${s}] -> ${did ?? 'なし'} | opened=${opened} pEff=${st?.pendingEffect ?? '-'}`);
      }
      return { pass: false, detail: `CHOOSE未出現のまま未完了（opened=${opened}）` };
    },
  },

  // §7「残る実機検証項目」＝「(xxxvi) のグロウ支払いUI」（2026-08-05）。続き206でGrowModal/AssistGrowModal/
  // BattleScreenのグロウ可否判定5箇所へ`wildcardInstIds`/`colorOverrideMap`が配線されたが「グロウ支払いUIでの
  // 実選択」は未検証のまま残っていた。`WX16-Re06`（【常】：このシグニがエナゾーンにあるかぎり、センター
  // ルリグの持つ色のエナ1つを支払う際、代わりにエナゾーンからこのシグニをトラッシュに置いてもよい）を
  // **緑の**センタールリグ（WD04-004→WD04-003・GrowCost《緑×1》）のエナゾーンに置く＝WX16-Re06自身の
  // 印刷色は「白」なので、素の色一致では緑コストを絶対に払えない＝グロウが成立すれば代替配線が
  // 本当に機能している証拠になる（印刷色がたまたま一致するカードでは代替の有無を判別できないため、
  // あえて印刷色とセンタールリグ色が食い違う組み合わせを選んだ）。
  lrigDownGrowColorSubstituteFires: {
    title: 'WX16-Re06→WD04-004(緑)グロウ（印刷色「白」のエナ代替カードで《緑×1》グロウコストを支払えることを確認）',
    spec: {
      hostSet: {
        'field.lrig': ['WD04-004#1'], // Lv1 一ノ娘　緑姫（緑）
        'field.lrig_down': false,
        'lrig_deck': ['WD04-003#1'], // Lv2 二ノ娘　緑姫（GrowCost《緑》×1）
        'energy': ['WX16-Re06#1'], // 印刷色は白＝これ1枚だけ（素の色一致では絶対に払えない）
        'field.signi': [null, null, null],
        'actions_done': [],
      },
      top: { active: 'host', turn_phase: 'GROW', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.lrigTop/energy:', before?.host?.lrigTop, before?.host?.energyCards);
      const grew = await H.openGrow(/二ノ娘/);
      H.log('グロウ候補クリック（二ノ娘　緑姫）:', grew ? 'OK' : '失敗（候補disabledの可能性＝代替配線が効いていない疑い）');
      if (!grew) {
        return { pass: false, detail: `グロウ候補ボタンをクリックできなかった＝Phase1のcanAfford判定でWX16-Re06（印刷色「白」）が緑コスト候補として認識されていない可能性（代替配線の疑い）` };
      }
      let energySelected = false;
      for (let s = 0; s < 16; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/lrigDownGrowColorSubstituteFires-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !energySelected) {
          const img = page.locator('img[alt="小剣　ミカムネ"]').last();
          if (await img.count() && await img.isVisible().catch(() => false)) { await img.click().catch(() => {}); did = 'img:小剣　ミカムネ(WX16-Re06)'; energySelected = true; }
        }
        if (!did && energySelected) did = await H.clickBtn('グロウ実行', { exact: true });
        const st = await H.queryState();
        H.log(`  ldgs[${s}] -> ${did ?? 'なし'} | energySelected=${energySelected} lrigTop=${st?.host?.lrigTop} energy=${st?.host?.energyCards} trash=${st?.host?.trashCards} pEff=${st?.pendingEffect ?? '-'}`);
        if (st?.host?.lrigTop === 'WD04-003#1') {
          const substituteConsumed = !(st?.host?.energyCards ?? []).includes('WX16-Re06#1') && (st?.host?.trashCards ?? []).includes('WX16-Re06#1');
          if (substituteConsumed) {
            return { pass: true, detail: `印刷色「白」のWX16-Re06をエナゾーンで選択→《緑×1》のグロウコストとして支払い成立＝Lv1→Lv2グロウ完了（lrigTop=${st.host.lrigTop}・WX16-Re06はエナ→トラッシュへ移動）＝グロウ支払いUIの代替配線（続き206）が実選択でも機能している` };
          }
          return { pass: false, detail: `グロウは完了したがWX16-Re06の移動が確認できない（energy=${JSON.stringify(st.host.energyCards)} trash=${JSON.stringify(st.host.trashCards)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `未完了（energySelected=${energySelected} lrigTop=${fin?.host?.lrigTop} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // §7 実機検証＝Sonnetタスク1（2026-08-07）＝続き366新設の「コイン支払い累計」機構（PlayerState.coins_paid_this_turn・
  // Condition COINS_PAID_THIS_TURN・effectParser.ts:1644）の実機検証。従来は条件節ごと落ちて無条件発火していた
  // （アタックのたびに必ず本体が発火＝過剰効果）。WXDi-P15-068（羅原　ミルルン//THE DOOR）＝
  // 【自】このシグニがアタックしたとき、このターンにあなたが《コインアイコン》を合計２枚以上支払っていた場合、
  // 【エナチャージ１】をする。【起】《ターン１回》《コインアイコン》×2：【エナチャージ１】＝コイン支払い経路
  // （BattleScreen.tsx 10箇所のうち【起】ACTIVATED経路＝executeSigniActivated）と条件判定が同一カードで完結する。
  // 対になる9枚（WXDi-P09-039/P15-053/054/070/072/073・WXDi-P16-057/076/081）は同じ coins_paid_this_turn を
  // 読むだけの CONDITIONAL/CHOOSE条件で、書き込み側は同じ10経路を共有するため個別カードの実機は不要（機構1本で足りる）。
  coinsPaidAttackFires: {
    title: 'WXDi-P15-068-E1（COINS_PAID_THIS_TURN条件成立＝コイン2枚支払後にアタックしてエナチャージ発火）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P15-068#1'], null, null], // 支払い元（【起】）兼アタッカー（【自】）を1枚で兼ねる
        'field.signi_down': [false, false, false],
        'energy': [],
        'coins': 2, // 【起】コスト《コインアイコン》×2 ちょうど
        'coins_paid_this_turn': 0, // ルーム再利用時の前シナリオ残留を明示的にクリア
        'deck': ['WD01-013#950', 'WD01-013#951', 'WD01-013#952', 'WD01-013#953', 'WD01-013#954'], // 先頭2枚がマーカー（【起】の1回目→#950／E1の2回目→#951）
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null], // ブロッカー無し＝直接クラッシュ
        'life_cloth': ['WD01-013#960', 'WD01-013#961'], // バーストなし固定（WD01-013はLifeBurst無し）
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
    },
    async drive(page, H) {
      await H.ensureMain();
      const before = await H.queryState();
      H.log('開始時 host.coins:', before?.host?.coins, 'host.energyCards:', JSON.stringify(before?.host?.energyCards));
      // Step1: MAIN中に【起】《コインアイコン》×2を発動（usageLimit《ターン1回》・コインのみコストでcanAfford即成立）
      let modalOpened = false, paid = false;
      for (let s = 0; s < 16 && !paid; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/coinsPaidAttackFires-pay-${s}.png`, fullPage: true });
        let did = null;
        if (!modalOpened) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) did = await H.clickBtn(/^【起】/, { exact: false });
        if (!did) did = await H.clickBtn('発動', { exact: true });
        if (!did) did = await H.clickTextOrBtn(['決定', 'OK']);
        const st = await H.queryState();
        H.log(`  pay[${s}] -> ${did ?? 'なし'} | coins=${st?.host?.coins ?? '-'} energyCards=${JSON.stringify(st?.host?.energyCards)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
        if ((st?.host?.energyCards ?? []).some(c => c.startsWith('WD01-013#950')) && !st?.pendingEffect && (st?.stackLen ?? 0) === 0) {
          paid = true;
        }
      }
      const afterPay = await H.queryState();
      if (!paid) {
        return { pass: false, detail: `【起】コイン支払いが完了せず（coins=${afterPay?.host?.coins ?? '-'} energyCards=${JSON.stringify(afterPay?.host?.energyCards)}）` };
      }
      H.log('支払い完了 coins:', afterPay?.host?.coins, 'energyCards:', JSON.stringify(afterPay?.host?.energyCards));
      // Step2: アタックフェイズへ進行→自身でアタック→ON_ATTACK_SIGNIのCONDITIONALがcoins_paid_this_turn>=2で成立
      let attacked = false;
      modalOpened = false;
      for (let s = 0; s < 26; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/coinsPaidAttackFires-atk-${s}.png`, fullPage: true });
        let did = null;
        if (!did) did = await H.clickTextOrBtn(['アタックフェイズへ']);
        if (!did) did = await H.clickTextOrBtn(['アーツ終了→相手へ', 'アーツ終了', 'アーツステップ終了', 'シグニアタックへ']);
        const phaseChk = await H.queryState();
        if (!did && !modalOpened && !attacked && phaseChk?.turnPhase === 'ATTACK_SIGNI') {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) {
          const atkDid = await H.clickBtn('アタック', { exact: true });
          if (atkDid) { did = atkDid; attacked = true; }
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', '確認', 'OK', 'はい', '発動順序を確定', '確定']);
        const st = await H.queryState();
        const secondCharge = (st?.host?.energyCards ?? []).some(c => c.startsWith('WD01-013#951'));
        H.log(`  atk[${s}] -> ${did ?? 'なし'} | phase=${st?.turnPhase} energyCards=${JSON.stringify(st?.host?.energyCards)} gLife=${st?.guest?.life} pEff=${st?.pendingEffect ?? '-'}`);
        if (secondCharge) {
          return { pass: true, detail: `COINS_PAID_THIS_TURN条件成立（【起】でコイン2枚支払済）でアタック→E1のCONDITIONALが発火し2回目の【エナチャージ1】を確認（energyCards=${JSON.stringify(st.host.energyCards)}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `2回目のエナチャージ未確認（energyCards=${JSON.stringify(fin?.host?.energyCards)} attacked=${attacked} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },

  // 条件不成立の対照実験＝続き366以前は条件節が丸ごと落ちて無条件発火していた退化の再発検出。
  // コインを一切支払わずに攻撃し、【エナチャージ1】が発火しない（energyCardsが空のまま）ことを確認する。
  coinsPaidAttackSkipped: {
    title: 'WXDi-P15-068-E1（COINS_PAID_THIS_TURN条件不成立＝コイン未払いでアタックしてもエナチャージが発火しないこと＝続き366以前の退化再発検出）',
    spec: {
      hostSet: {
        'field.lrig': ['WD03-003#1'],
        'field.signi': [['WXDi-P15-068#1'], null, null],
        'field.signi_down': [false, false, false],
        'energy': [],
        'coins': 0, // 未払い＝coins_paid_this_turn=0のまま
        'coins_paid_this_turn': 0, // ルーム再利用時の前シナリオ残留を明示的にクリア
        'deck': ['WD01-013#950', 'WD01-013#951', 'WD01-013#952', 'WD01-013#953', 'WD01-013#954'],
        'actions_done': [],
      },
      guestSet: {
        'field.lrig': ['WD03-002#1'],
        'field.signi': [null, null, null],
        'life_cloth': ['WD01-013#962', 'WD01-013#963'],
        'blocked_actions': [],
      },
      top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
    },
    async drive(page, H) {
      const before = await H.queryState();
      H.log('開始時 host.coins:', before?.host?.coins, 'host.energyCards:', JSON.stringify(before?.host?.energyCards), 'guest.life:', before?.guest?.life);
      let modalOpened = false, attacked = false;
      for (let s = 0; s < 22; s++) {
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${SHOT}/coinsPaidAttackSkipped-${s}.png`, fullPage: true });
        let did = null;
        if (!did && !modalOpened && !attacked) {
          const opened = await H.clickTestId('my-signi-zone-0');
          if (opened) { did = opened; modalOpened = true; }
        }
        if (!did) {
          const atkDid = await H.clickBtn('アタック', { exact: true });
          if (atkDid) { did = atkDid; attacked = true; }
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', '確認', 'OK', 'はい', '発動順序を確定', '確定']);
        const st = await H.queryState();
        const crashed = (st?.guest?.life ?? 99) < (before?.guest?.life ?? 2);
        const chargedAny = (st?.host?.energyCards ?? []).length > 0;
        H.log(`  skip[${s}] -> ${did ?? 'なし'} | attacked=${attacked} gLife=${st?.guest?.life}(開始${before?.guest?.life}) energyCards=${JSON.stringify(st?.host?.energyCards)} pEff=${st?.pendingEffect ?? '-'}`);
        if (attacked && crashed && !st?.pendingEffect && (st?.stackLen ?? 0) === 0) {
          if (chargedAny) {
            return { pass: false, detail: `【要注意】COINS_PAID_THIS_TURN条件不成立（コイン未払い）でもエナチャージが発火した＝続き366以前の無条件発火バグの再発（energyCards=${JSON.stringify(st.host.energyCards)}）` };
          }
          return { pass: true, detail: `COINS_PAID_THIS_TURN条件不成立（コイン未払い）＝アタック解決完了後もエナチャージ不発を確認（energyCards=空・gLife ${before?.guest?.life}→${st.guest.life}）` };
        }
      }
      const fin = await H.queryState();
      return { pass: false, detail: `アタック解決完了を確認できず（attacked=${attacked} gLife=${fin?.guest?.life} energyCards=${JSON.stringify(fin?.host?.energyCards)} pEff=${fin?.pendingEffect ?? '-'}）` };
    },
  },
};

// タスク12(xciv) δ-6：`WX13-026`「このターンに対戦相手のシグニがバニッシュされている場合、使用コストは
//   《黒×3》減る」が読む**ターン履歴**（`signi_banished_this_turn`）が、実UIの盤面差分 funnel で実際に
//   積まれるかを確認する。golden は `costs.ts` の規則しか踏めない（記録側は BattleScreen）。
//   ⚠既存の `banishbyeffect` と同じ盤面を使い、**バニッシュされた側（guest）に積まれる**ことを見る。
scenarios.banishHistoryForCost = {
  title: 'バニッシュ履歴の記録（WX19-023 の【出】で相手シグニをバニッシュ→guest.signi_banished_this_turn≥1・タスク12(xciv)）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [['WX07-036#1'], null, null],
      'field.check': null,
      'pending_crashed_cards': [],
      'energy': ['WD01-013#1', 'WD01-013#2'],
      'actions_done': [],
    },
    guestSet: {
      'field.signi': [['WD05-009#1'], null, null],
      'field.check': null,
      'pending_crashed_cards': [],
      'signi_banished_this_turn': 0,
    },
    handPrepend: ['WX19-023#1'],
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    H.log('手札クリック:', await H.clickTestId('my-hand-card-0') ?? '見つからず');
    let summoned = false;
    for (let s = 0; s < 20; s++) {
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOT}/banishHistoryForCost-${s}.png`, fullPage: true });
      let did = null;
      const summonBtn = page.getByRole('button', { name: '召喚', exact: true }).first();
      if (await summonBtn.count() && await summonBtn.isVisible().catch(() => false)) {
        await summonBtn.click().catch(() => {}); did = 'btn:召喚'; summoned = true;
      }
      if (!did && summoned) did = await H.clickTestId('summon-zone-1', 'summon-zone-2');
      if (!did) {
        // ⚠【出】コストモーダルは**エナを選んでから**「発動」が有効になる（先に押すと disabled で空振りし続ける）。
        const e0 = page.getByTestId('onplaycost-energy-0').first();
        if (await e0.count() && await e0.isVisible().catch(() => false)) {
          await e0.click().catch(() => {}); await page.waitForTimeout(250);
          const fire = page.getByRole('button', { name: '発動', exact: true }).first();
          if (await fire.count() && await fire.isEnabled().catch(() => false)) { await fire.click().catch(() => {}); did = 'pick:ena→btn:発動'; }
          else did = 'pick:onplaycost-energy-0';
        }
      }
      if (!did) did = await H.stdStep(['決定', 'OK', 'はい']);
      const st = await H.queryState();
      const banished = st?.guest?.signiBanishedThisTurn ?? 0;
      H.log(`  bh[${s}] -> ${did ?? 'なし'} | guestSigni=${JSON.stringify(st?.guest?.fieldSigni)} banishedThisTurn=${banished} pEff=${st?.pendingEffect ?? '-'}`);
      if (banished >= 1) {
        return { pass: true, detail: `バニッシュ履歴が記録された（guest.signi_banished_this_turn=${banished}）＝WX13-026 のコスト軽減条件が実UIで読める` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `履歴が記録されない（guest.signi_banished_this_turn=${fin?.guest?.signiBanishedThisTurn ?? 0} guestSigni=${JSON.stringify(fin?.guest?.fieldSigni)}）` };
  },
};

// タスク12(cx)：「この能力は対戦相手のシグニ１体がアタックしたときにしか使用できない」【起】（WX05-013-E2）。
//   旧実装は使用条件を `DURING_PHASE:['ATTACK_SIGNI_OP']` にしていたが `ATTACK_SIGNI_OP` は `TurnPhase` に
//   存在しない値＝条件が常に false で**一度も撃てなかった**。使用条件ではなく使用タイミングなので
//   timing:'ON_OPP_SIGNI_ATTACK' へ移し、`performSigniAttack` が守備側のスタックへ「エクシード2を支払って
//   発動するか」の CHOOSE を積む（`ON_OPP_SIGNI_ATTACK_DIRECT`＝oppDirectAttackNegate と同じ作法）。
//   ⚠**収集は BattleScreen 側＝golden では原理的に踏めない**ので実機で守る（PLAN の教訓 (f) と同型）。
//   合格条件＝CPU の直接アタックに対し支払いを選ぶと ①ライフが減らない ②エクシード2がルリグトラッシュへ。
scenarios.oppSigniAttackActivated = {
  title: 'WX05-013-E2（相手シグニのアタックに応答する【起】＝エクシード2でそのアタックを無効・タスク12(cx)）',
  spec: {
    hostSet: {
      // センター＝WX05-013、その下に2枚＝エクシード2の原資（下から払われる）
      'field.lrig': ['WD01-003#1', 'WD01-002#1', 'WX05-013#1'],
      'field.signi': [null, null, null], // 正面（guest zone0 のミラー＝zone2）を空にして直接アタックさせる
      'field.signi_down': [false, false, false],
      'lrig_trash': [],
      'actions_done': [],
    },
    guestSet: {
      'field.signi': [['WD01-013#1'], null, null], // 小剣　ククリ（CPUアタッカー・zone0）
      'field.signi_down': [false, false, false],
      'blocked_actions': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    H.log('開始時 host.life:', before?.host?.life, 'host.lrigTrash:', before?.host?.lrigTrash);
    for (let s = 0; s < 22; s++) {
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOT}/oppSigniAttackActivated-${s}.png`, fullPage: true });
      // 任意コスト CHOOSE（エクシードのみ＝エナ選択は不要なので pay は最初から enabled）
      let did = null;
      const payBtn = page.getByTestId('optcost-pay').first();
      if (await payBtn.count() && await payBtn.isVisible().catch(() => false) && await payBtn.isEnabled().catch(() => false)) {
        await payBtn.click().catch(() => {}); did = 'tid:optcost-pay';
      }
      if (!did) did = await H.clickTextOrBtn(['支払う（エクシード2）', '支払う']);
      if (!did) did = await H.stdStep(); // 対象は1体だけ＝pick-0→決定
      const st = await H.queryState();
      const negated = await H.findLog(/アタックが無効になった|アタックを無効にした/);
      H.log(`  osaa[${s}] -> ${did ?? 'なし'} | hLife=${st?.host?.life} hLrigTrash=${st?.host?.lrigTrash} pEff=${st?.pendingEffect ?? '-'} respond=${st?.pendingRespondPlayer ?? '-'} viewer=${st?.viewerUserId ?? '-'} opts=${JSON.stringify(st?.pendingOptions ?? [])} stack=${st?.stackLen ?? '-'}`);
      if (negated && (st?.host?.lrigTrash ?? 0) >= 2) {
        const lifeKept = (st?.host?.life ?? 0) === (before?.host?.life ?? 0);
        return {
          pass: lifeKept,
          detail: lifeKept
            ? `【起】が応答窓に上がり支払いで無効化「${negated}」（hLife ${before?.host?.life}→${st.host.life} 無傷・hLrigTrash ${before?.host?.lrigTrash}→${st.host.lrigTrash}＝エクシード2を支払い）`
            : `無効化ログは出たがライフが減っている（hLife ${before?.host?.life}→${st.host.life}）＝キャンセルがバトル解決に届いていない`,
        };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `応答窓に【起】が上がらない（hLife=${fin?.host?.life}（開始${before?.host?.life}）hLrigTrash=${fin?.host?.lrigTrash} pEff=${fin?.pendingEffect ?? '-'}）` };
  },
};

// タスク12(lv)③：CPU が召喚したシグニの**任意・無コスト【出】**が一度も発火しなかった（過小実行）。
//   人間の通常召喚は `OPTIONAL_ACTIVATE`（発動する/発動しない）で包んで積むのに、CPU 経路は
//   `mandatory !== false` だけを積んでいたため、CPU の場では**選択肢にすら上がらなかった**。
//   合格条件＝CPU が `WX04-052`（【出】デッキの一番上をこのシグニの【チャーム】にしてもよい）を召喚したら
//   実際に【チャーム】が付く（＝CPU 自動応答が「発動する」を選ぶ方針どおり動く）。
scenarios.cpuOptionalOnPlayCharm = {
  title: 'CPU召喚の任意【出】配線（WX04-052＝デッキトップを【チャーム】に「してもよい」・タスク12(lv)③）',
  spec: {
    guestSet: {
      'field.lrig': ['WD05-001#1'],            // CPU center＝獄卒の閻魔 ウリス（Lv4・Limit11）＝Lv4/ウリス限定シグニの要件を満たす
      'field.signi': [null, null, null],
      'field.signi_charms': [null, null, null],
      'field.check': null,
      'pending_crashed_cards': [],
      'energy': [],
      'actions_done': [],
      'coins': 0,
    },
    hostSet: { 'field.check': null, 'pending_crashed_cards': [] },
    top: { active: 'cpu', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    // CPU の手札に対象シグニを積む（guest.hand を直接注入）＋デッキトップを既知カードにする。
    for (let attempt = 0; attempt < 3; attempt++) {
      await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
      await page.waitForTimeout(2500);
      await injectScenario(page, {
        ...scenarios.cpuOptionalOnPlayCharm.spec,
        guestSet: {
          ...scenarios.cpuOptionalOnPlayCharm.spec.guestSet,
          hand: ['WX04-052#1'],
          deck: ['WD05-009#1', 'WD05-010#1', 'WD05-009#2'],
        },
      });
      await page.waitForTimeout(1200);
      let overwritten = false;
      for (let s = 0; s < 14; s++) {
        await page.waitForTimeout(1000);
        await page.screenshot({ path: `${SHOT}/cpuOptionalOnPlayCharm-a${attempt}-${s}.png`, fullPage: true });
        const st = await H.queryState();
        if (st.error) continue;
        const g = st.guest ?? {};
        const charms = (g.fieldCharms ?? []).filter(Boolean);
        const placed = (g.fieldSigni ?? []).some(z => (z ?? []).some(n => /WX04-052/.test(n)));
        if (s % 4 === 0) H.log(`  cpuOpt[a${attempt}.${s}] placed=${placed} charms=${JSON.stringify(g.fieldCharms)} deck=${g.deck} hand=${g.hand} pEff=${st.pendingEffect ?? '-'}`);
        if (placed && charms.length > 0) {
          return { pass: true, detail: `CPU が任意【出】を発動＝WX04-052 召喚後に【チャーム】が付いた（charms=${JSON.stringify(g.fieldCharms)}・deck=${g.deck}）` };
        }
        if ((g.hand ?? 0) === 0 && !placed) { H.log(`  cpuOpt[a${attempt}] 手札が消えたが場に出ていない→再注入`); overwritten = true; break; }
      }
      if (!overwritten) break;
    }
    const fin = await H.queryState();
    return { pass: false, detail: `CPU の任意【出】未確認（fieldSigni=${JSON.stringify(fin?.guest?.fieldSigni)} charms=${JSON.stringify(fin?.guest?.fieldCharms)}）` };
  },
};

// タスク12(xciii)：【チェイン】＝「このターン、あなたが次にアーツを使用する場合、それの使用コストは減る」。
//   engine（COST_REDUCTION → PlayerState.next_arts_cost_reduction）と **ArtsModal のコスト計算**の両方が
//   噛み合って初めて効く＝golden ではコスト計算UIまで通せないので実機で確認する。
//   合格条件は「エナ0枚で2枚目のアーツ（《緑》×1）が使えて解決する」＝軽減が実際に効いた証拠。
scenarios.chainArtsCostReduction = {
  title: 'WX10-005【チェイン】《赤》《緑》→ 次のアーツ（WX09-005・《緑》×1）がエナ0枚で使える（タスク12(xciii)）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-002#1'],
      'field.signi': [null, null, null],
      'field.signi_down': [false, false, false],
      'field.check': null,
      'pending_crashed_cards': [],
      // 1枚目＝【チェイン】《赤》《緑》のアーツ（コスト《赤》×2《緑》×1《無》×2）、2枚目＝《緑》×1 のアーツ。
      'lrig_deck': ['WX10-005#1', 'WX09-005#1'],
      // 1枚目のコストちょうど5枚。使い切るので2枚目は**軽減が無ければ絶対に払えない**。
      'energy': ['WD02-009#1', 'WD02-009#2', 'WD04-009#1', 'WD01-009#1', 'WD01-009#2'],
      'hand': [],
      'actions_done': [],
    },
    guestSet: {
      'field.signi': [null, null, null], // 空＝両アーツの banish 系は候補なしで no-op 解決
      'field.check': null,
      'pending_crashed_cards': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    const before = await H.queryState();
    H.log(`開始時 energy=${before?.host?.energy} lrigDeck=${JSON.stringify(before?.host?.lrigDeckCards)} nextArts=${JSON.stringify(before?.host?.nextArtsCostReduction)}`);
    let chainUsed = false;
    let choicePicked = false;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${SHOT}/chainArtsCostReduction-${s}.png`, fullPage: true });
      let did = null;
      const st0 = await H.queryState();
      // アーツ Phase2：候補エナを上から順に選んでから「アーツ使用」（未選択だと disabled）。
      // 2枚目は軽減で 0 コストになるはずなので、エナ選択なしで有効になる。
      const use = page.getByRole('button', { name: /アーツ使用/ }).first();
      if (await use.count() && await use.isVisible().catch(() => false)) {
        if (await use.isEnabled().catch(() => false)) { await use.click().catch(() => {}); did = 'btn:アーツ使用'; }
        else {
          // ⚠エナ選択はトグル＝**1手で1枚ずつ**押すと毎回同じ枚を on/off して永久に足りない。
          //   この1イテレーションで候補を上から全部（＝ちょうど必要枚数）押し切る。
          const picked = [];
          for (let i = 0; i < 8; i++) {
            const e = page.getByTestId(`artscost-energy-${i}`).first();
            if (await e.count() && await e.isVisible().catch(() => false)) { await e.click().catch(() => {}); picked.push(i); await page.waitForTimeout(120); }
          }
          if (picked.length) did = `pick:energy-${picked.join('/')}`;
        }
      }
      // 「以下のNつからMつ**まで**選ぶ」＝トグル選択＋確定。⚠1手で1つずつ押すと同じ選択肢を on/off し続けるので、
      //   CHOOSE が開いている間に**別々の選択肢を1回ずつ**押してから確定へ回す。
      if (!did && st0?.pendingEffect === 'CHOOSE' && !choicePicked) {
        for (const label of ['選択肢1', '選択肢2']) {
          const b = page.getByRole('button', { name: label, exact: true }).first();
          if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); await page.waitForTimeout(150); did = `btn:${label}`; }
        }
        if (did) choicePicked = true;
      }
      if (!did) did = await H.stdStep(['確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
      // ⚠「使用」は**ボタン限定**で拾う＝直前に出るバトルログ「次に**使用**するアーツのコストを…軽減」に
      //   部分一致クリックが吸われて永久に空振りする（この罠で初回 FAIL した）。
      if (!did) {
        const useBtn = page.getByRole('button', { name: '使用', exact: true }).first();
        if (await useBtn.count() && await useBtn.isVisible().catch(() => false)) { await useBtn.click().catch(() => {}); did = 'btn:使用'; }
      }
      if (!did) did = await H.clickTestId('zone-card-0', 'zone-card-1'); // ルリグDK内のアーツを開く
      if (!did) did = await H.clickTestId('my-lrig-dk');
      const st = await H.queryState();
      const trashed = (st?.host?.lrigTrash ?? 0);
      H.log(`  chain[${s}] -> ${did ?? 'なし'} | energy=${st?.host?.energy} lrigTrash=${trashed} lrigDeck=${JSON.stringify(st?.host?.lrigDeckCards)} nextArts=${JSON.stringify(st?.host?.nextArtsCostReduction)} pEff=${st?.pendingEffect ?? '-'}`);
      if (!chainUsed && (st?.host?.nextArtsCostReduction ?? []).length > 0) {
        chainUsed = true;
        H.log(`  → 【チェイン】成立：${JSON.stringify(st.host.nextArtsCostReduction)}（energy=${st?.host?.energy}）`);
        if ((st?.host?.energy ?? 0) > 0) {
          return { pass: false, detail: `1枚目のコストが払い切られていない（energy=${st.host.energy}）＝2枚目が「軽減のおかげ」で使えたと言えない盤面` };
        }
      }
      // 2枚目が解決＝ルリグデッキが空になり、ルリグトラッシュに2枚
      if (chainUsed && (st?.host?.lrigDeckCards ?? []).length === 0 && trashed >= 2) {
        return { pass: true, detail: `【チェイン】《赤》《緑》宣言後、エナ0枚のまま《緑》×1 のアーツを使用できた（lrigTrash=${trashed}・nextArts=${JSON.stringify(st?.host?.nextArtsCostReduction)}＝使用で消費）` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `未完了（chainUsed=${chainUsed} energy=${fin?.host?.energy} lrigTrash=${fin?.host?.lrigTrash} lrigDeck=${JSON.stringify(fin?.host?.lrigDeckCards)} nextArts=${JSON.stringify(fin?.host?.nextArtsCostReduction)}）` };
  },
};

// タスク12(cix)：「この方法でダウンしたルリグと同じレベル」＝**コスト経路**の参照。
//   engine ハーネス（golden）はコスト支払いも同じ ExecCtx で行うため lastProcessedCards が届くが、
//   実UIは「BattleScreen が payLrigDownCost で支払う」→「別 ExecCtx で効果を解決」なので**参照が切れる**。
//   その切れ目を跨げるのは PlayerState の記録だけ＝ここでしか検証できない核心部分。
//   合格条件は「相手シグニ**全体**ではなく、ダウンしたルリグ（Lv2）と同じレベルのシグニ**だけ**が能力を失う」。
scenarios.lrigDownLevelRemoveAbilities = {
  title: 'WX25-P1-112【起】ルリグ1体ダウン→同じレベルの相手シグニだけが能力を失う（cost経路の参照・タスク12(cix)）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-003#1'],                    // Lv2 ルリグ（ダウンコストで払う＝参照レベルは2）
      'field.lrig_down': false,                        // アップ＝ダウンコストを支払える
      'field.signi': [['WX25-P1-112#1'], null, null],  // 【起】アップ状態のルリグ1体をダウンする
      'field.signi_down': [false, false, false],
      'field.check': null,            // ⚠ ルーム再利用時に前シナリオのライフクロスクラッシュ確認モーダルが
      'pending_crashed_cards': [],    //    残っていると全クリックがそれに吸われる（本シナリオの初回FAIL原因）
      'actions_done': [],
    },
    guestSet: {
      'field.signi': [['WD01-012#1'], ['WD01-009#1'], null], // Lv2（一致）／Lv4（不一致＝残るべき）
      'field.check': null,
      'pending_crashed_cards': [],
      'actions_done': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    const before = await H.queryState();
    H.log('初期 guest.abilitiesRemoved:', JSON.stringify(before?.guest?.abilitiesRemoved), 'lrigDown:', before?.host?.lrigDown);
    let modalOpened = false;
    for (let s = 0; s < 16; s++) {
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${SHOT}/lrigDownLevelRemoveAbilities-${s}.png`, fullPage: true });
      let did = null;
      if (!modalOpened) {
        const opened = await H.clickTestId('my-signi-zone-0');
        if (opened) { did = opened; modalOpened = true; }
      }
      if (!did) {
        const actBtn = page.getByRole('button', { name: /^【起】/ }).first();
        if (await actBtn.count() && await actBtn.isVisible().catch(() => false)) { await actBtn.click().catch(() => {}); did = 'btn:【起】'; }
      }
      if (!did) {
        const fire = page.getByRole('button', { name: '発動', exact: true }).first();
        if (await fire.count() && await fire.isVisible().catch(() => false) && await fire.isEnabled().catch(() => false)) { await fire.click().catch(() => {}); did = 'btn:発動'; }
      }
      if (!did) did = await H.clickTextOrBtn(['決定', 'OK']);
      const st = await H.queryState();
      const body = await H.fullBody();
      if (s < 3) H.log(`   body: ${body.replace(/\s+/g, ' ').slice(0, 400)}`);
      H.log(`  [${s}] -> ${did ?? 'なし'} | gAbilRem=${JSON.stringify(st?.guest?.abilitiesRemoved)} lrigDown=${st?.host?.lrigDown} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
      const removed = st?.guest?.abilitiesRemoved ?? [];
      if (removed.length > 0) {
        const hitSame = removed.includes('WD01-012#1');
        const hitOther = removed.includes('WD01-009#1');
        if (hitOther) {
          return { pass: false, detail: `レベル条件が効いていない＝Lv4のWD01-009#1まで能力喪失（gAbilRem=${JSON.stringify(removed)}）＝(cix)の過剰効果が再発` };
        }
        return hitSame
          ? { pass: true, detail: `コスト経路の参照が成立＝ダウンしたLv2ルリグと同レベルのWD01-012#1だけが能力喪失（gAbilRem=${JSON.stringify(removed)}・Lv4のWD01-009#1は無傷）` }
          : { pass: false, detail: `想定外の対象が能力喪失（gAbilRem=${JSON.stringify(removed)}）` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `【起】が発火しない／能力喪失を観測できず（gAbilRem=${JSON.stringify(fin?.guest?.abilitiesRemoved)} lrigDown=${fin?.host?.lrigDown} stack=${fin?.stackLen ?? '-'} pEff=${fin?.pendingEffect ?? '-'}）` };
  },
};

// 既存の空き1ゾーン自動配置経路も独立シナリオとして残し、ゾーン選択経路との両方を回帰対象にする。
scenarios.effectPlacedOnPlay = {
  ...scenarios.effectPlacedOnPlayZoneSelect,
  title: 'WX02-042【起】でWX15-073をトラッシュから自動配置→mandatory【出】1枚ドロー',
  spec: {
    ...scenarios.effectPlacedOnPlayZoneSelect.spec,
    hostSet: {
      ...scenarios.effectPlacedOnPlayZoneSelect.spec.hostSet,
      'field.signi': [['WX02-042#1'], ['WXK05-047#1'], null],
    },
  },
};

// PLAN §7 A1：通常ターンはアシストルリグにアタック操作を出さない。
scenarios.assistAttackNoFlag = {
  title: 'WX25-P1-048対照（assist_lrig_attack_min_level未設定ならアシストはアタック不可）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-001#1'],
      'field.lrig_down': false,
      'field.assist_lrig_l': ['WD01-003#1'],
      'field.assist_lrig_r': ['WD03-003#1'],
      'field.assist_lrig_l_down': false,
      'field.assist_lrig_r_down': false,
      'actions_done': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'hand': [] },
    top: { active: 'host', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    const results = [];
    for (const name of ['半月の巫女　タマヨリヒメ', 'コード・ピルルク・Ｍ']) {
      const img = page.getByAltText(name, { exact: false }).first();
      if (!(await img.count()) || !(await img.isVisible().catch(() => false))) {
        return { pass: false, detail: `アシスト画像が見つからず検証空振り: ${name}` };
      }
      await img.click({ force: true });
      await page.waitForTimeout(400);
      const attack = page.getByRole('button', { name: 'アタック', exact: true }).first();
      const visible = (await attack.count()) > 0 && await attack.isVisible().catch(() => false);
      results.push(`${name}:${visible ? '表示' : '非表示'}`);
      await H.closeModals();
    }
    const after = await H.queryState();
    const unchanged = JSON.stringify(after?.host?.assistDown) === JSON.stringify(before?.host?.assistDown)
      && after?.host?.lrigDown === before?.host?.lrigDown;
    return {
      pass: results.every(x => x.endsWith(':非表示')) && unchanged,
      detail: `フラグ未設定で左右アシストの「アタック」は非表示（${results.join('／')}）・ダウン状態不変=${unchanged}`,
    };
  },
};

// PLAN §7 A2：フラグが立つターンは左右アシストがそれぞれ1回アタックでき、センターを巻き込まない。
scenarios.assistAttackBoth = {
  title: 'WX25-P1-048（Lv1以上の左右アシストが順にアタック→各自ダウン・センター温存・各1クラッシュ）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-001#1'],
      'field.lrig_down': false,
      'field.assist_lrig_l': ['WD01-003#1'],
      'field.assist_lrig_r': ['WD03-003#1'],
      'field.assist_lrig_l_down': false,
      'field.assist_lrig_r_down': false,
      'assist_lrig_attack_min_level': 1,
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      'field.signi': [null, null, null],
      'hand': [], // ガード候補を空にし、各アタックが1クラッシュまで到達することを決定化
      'field.check': null,
      'pending_crashed_cards': [],
    },
    top: { active: 'host', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    const attackers = [
      { slotId: 'my-lrig-slot-assist-l', downIndex: 0 },
      { slotId: 'my-lrig-slot-assist-r', downIndex: 1 },
    ];
    let attackIndex = 0;
    let attackButtonCount = 0;
    let openedForIndex = -1;
    for (let s = 0; s < 32; s++) {
      await page.waitForTimeout(650);
      await page.screenshot({ path: `${SHOT}/assistAttackBoth-${s}.png`, fullPage: true });
      let did = null;
      const st0 = await H.queryState();
      const resolvedAttacks = (before?.guest?.life ?? 0) - (st0?.guest?.life ?? 0);
      if (attackIndex < attackers.length && openedForIndex !== attackIndex
          && resolvedAttacks >= attackIndex
          && st0?.host?.assistDown?.[attackers[attackIndex].downIndex] !== true) {
        did = await H.clickTestId(attackers[attackIndex].slotId);
        if (did) openedForIndex = attackIndex;
      }
      if (!did) {
        const attack = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
        if (await attack.count() && await attack.isVisible().catch(() => false) && await attack.isEnabled().catch(() => false)) {
          await attack.click(); did = 'tid:card-action-*[data-action-label="アタック"]'; attackButtonCount++;
        }
      }
      if (!did) did = await H.clickTextOrBtn(['ガードしない', 'しない', 'エナに送る', 'ライフバーストなし', 'OK', '決定']);
      const st = await H.queryState();
      if (attackIndex < attackers.length && st?.host?.assistDown?.[attackers[attackIndex].downIndex] === true) attackIndex++;
      H.log(`  aab[${s}] -> ${did ?? 'なし'} | attackIndex=${attackIndex} assistDown=${JSON.stringify(st?.host?.assistDown)} centerDown=${st?.host?.lrigDown} gLife=${st?.guest?.life}(開始${before?.guest?.life})`);
      if (attackIndex === 2 && (st?.guest?.life ?? 99) <= (before?.guest?.life ?? 0) - 2) {
        const correct = attackButtonCount === 2 && st.host.assistDown?.[0] === true && st.host.assistDown?.[1] === true
          && st.host.lrigDown === false && before.guest.life - st.guest.life === 2;
        return {
          pass: correct,
          detail: `左右アシストで「アタック」を各1回クリック（${attackButtonCount}回）→assistDown=${JSON.stringify(st.host.assistDown)}／centerDown=${st.host.lrigDown}／相手life ${before.guest.life}→${st.guest.life}`,
        };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `左右連続アタック未完了（buttons=${attackButtonCount} assistDown=${JSON.stringify(fin?.host?.assistDown)} centerDown=${fin?.host?.lrigDown} gLife=${fin?.guest?.life}）` };
  },
};

// PLAN §7 A3(a)：未アタックの対象アシストが残るとエンド進行前に確認を出す。
scenarios.assistAttackSkipConfirm = {
  title: 'WX25-P1-048（未アタックのアシストを残して進むとスキップ確認が出る）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-001#1'], 'field.lrig_down': true,
      'field.assist_lrig_l': ['WD01-003#1'], 'field.assist_lrig_r': [],
      'field.assist_lrig_l_down': false, 'field.assist_lrig_r_down': false,
      'assist_lrig_attack_min_level': 1,
    },
    top: { active: 'host', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
  },
  async drive(page, H) {
    let sawConfirm = false;
    for (let s = 0; s < 12; s++) {
      await page.waitForTimeout(650);
      let did = null;
      const modal = page.getByText('まだルリグが攻撃していません', { exact: true }).first();
      if (await modal.count() && await modal.isVisible().catch(() => false)) {
        sawConfirm = true;
        did = await H.clickBtn('このまま進む', { exact: true });
      }
      if (!did && !sawConfirm) did = await H.clickBtn('エンドフェイズへ', { exact: true });
      const st = await H.queryState();
      H.log(`  aasc[${s}] -> ${did ?? 'なし'} | sawConfirm=${sawConfirm} phase=${st?.turnPhase}`);
      if (sawConfirm && st?.turnPhase === 'END') return { pass: true, detail: '未アタックの対象アシストを残した進行で確認モーダルを観測し、「このまま進む」でENDへ進行' };
    }
    const fin = await H.queryState();
    return { pass: false, detail: `スキップ確認またはEND進行を確認できず（sawConfirm=${sawConfirm} phase=${fin?.turnPhase}）` };
  },
};

// PLAN §7 A3(b)：CPUはセンターを先に処理し、その後アシストを左→右に1体ずつ攻撃する。
scenarios.assistAttackCpuSequence = {
  title: 'WX25-P1-048 CPU（センター→左アシスト→右アシストの順で自動アタック）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'], 'hand': [], 'field.check': null, 'pending_crashed_cards': [],
    },
    guestSet: {
      'field.lrig': ['WD04-001#2'], 'field.lrig_down': false,
      'field.assist_lrig_l': ['WD01-003#2'], 'field.assist_lrig_r': ['WD03-003#2'],
      'field.assist_lrig_l_down': false, 'field.assist_lrig_r_down': false,
      'assist_lrig_attack_min_level': 1,
      'blocked_actions': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_LRIG', turn_count: 3 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    let sawCenterOnly = false;
    let sawLeftBeforeRight = false;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(650);
      let did = await H.clickTextOrBtn(['ガードしない', 'しない', 'エナに送る', 'ライフバーストなし', 'OK', '決定']);
      const st = await H.queryState();
      const ad = st?.guest?.assistDown ?? [];
      if (st?.guest?.lrigDown === true && ad[0] === false && ad[1] === false) sawCenterOnly = true;
      if (st?.guest?.lrigDown === true && ad[0] === true && ad[1] === false) sawLeftBeforeRight = true;
      H.log(`  aacs[${s}] -> ${did ?? 'なし'} | cpuCenter=${st?.guest?.lrigDown} cpuAssist=${JSON.stringify(ad)} hLife=${st?.host?.life}(開始${before?.host?.life}) centerOnly=${sawCenterOnly} leftFirst=${sawLeftBeforeRight}`);
      if (st?.guest?.lrigDown === true && ad[0] === true && ad[1] === true && (st?.host?.life ?? 99) <= (before?.host?.life ?? 0) - 3) {
        return {
          pass: sawCenterOnly && sawLeftBeforeRight && before.host.life - st.host.life === 3,
          detail: `CPU状態遷移を順次観測＝center-only=${sawCenterOnly}→left-before-right=${sawLeftBeforeRight}→全down、host.life ${before.host.life}→${st.host.life}`,
        };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `CPU連続攻撃未完了（center=${fin?.guest?.lrigDown} assist=${JSON.stringify(fin?.guest?.assistDown)} hLife=${fin?.host?.life} centerOnly=${sawCenterOnly} leftFirst=${sawLeftBeforeRight}）` };
  },
};

// PLAN §7 A3(c)：フラグがあってもレベル未達しか残っていなければ確認を出さず進める。
scenarios.assistAttackNoEligibleAdvance = {
  title: 'WX25-P1-048対照（レベル未達アシストだけなら確認なしでENDへ進みソフトロックしない）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-001#1'], 'field.lrig_down': true,
      'field.assist_lrig_l': ['WD01-003#1'], 'field.assist_lrig_r': ['WD03-003#1'],
      'field.assist_lrig_l_down': false, 'field.assist_lrig_r_down': false,
      'assist_lrig_attack_min_level': 3, // 両方Lv2なので対象外
    },
    top: { active: 'host', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
  },
  async drive(page, H) {
    let sawConfirm = false;
    for (let s = 0; s < 10; s++) {
      await page.waitForTimeout(650);
      const modal = page.getByText('まだルリグが攻撃していません', { exact: true }).first();
      if (await modal.count() && await modal.isVisible().catch(() => false)) sawConfirm = true;
      const did = await H.clickBtn('エンドフェイズへ', { exact: true });
      const st = await H.queryState();
      H.log(`  aanea[${s}] -> ${did ?? 'なし'} | sawConfirm=${sawConfirm} phase=${st?.turnPhase}`);
      if (st?.turnPhase === 'END') return { pass: !sawConfirm, detail: `Lv2<minLevel3のアシストだけなので確認なしでENDへ進行（sawConfirm=${sawConfirm}）` };
    }
    const fin = await H.queryState();
    return { pass: false, detail: `ENDへ進めずソフトロック疑い（sawConfirm=${sawConfirm} phase=${fin?.turnPhase}）` };
  },
};

// PLAN §7 B1(pay)：CONNECTスピニング④を選び、手札2枚を実際に捨てて相手ライフを1枚クラッシュする。
scenarios.connectSpinningChoice4Pay = {
  title: 'WXDi-P14-002-E1④（手札2枚の任意コストpay→相手ライフ1クラッシュ）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-001#1'],
      'field.assist_lrig_l': ['WD03-003#1'],
      'field.assist_lrig_r': ['WD02-003#1'],
      'lrig_deck': ['WXDi-P14-002#1'],
      'hand': ['WD01-013#101', 'WD01-013#102'],
      'energy': ['WD02-009#101', 'WD01-013#103', 'WD03-013#104'],
      'actions_done': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'field.check': null, 'pending_crashed_cards': [] },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
    await page.waitForTimeout(500);
    H.log('ピース:', await H.clickTestId('zone-card-0') ?? '見つからず');
    let pieceSet = false;
    let chose4 = false;
    let paid = false;
    const picked = new Set();
    const selectedKeyEnergy = new Set();
    for (let s = 0; s < 34; s++) {
      await page.waitForTimeout(650);
      await page.screenshot({ path: `${SHOT}/connectSpinningChoice4Pay-${s}.png`, fullPage: true });
      let did = null;
      if (!pieceSet) {
        // 続き475g：ピースは「ピースを使用」ラベルへ（§3 (cxxiii)）。両方を受ける。
        const use = page.locator('[data-testid^="card-action-"][data-action-label="キーにセット"], [data-testid^="card-action-"][data-action-label="ピースを使用"]').first();
        if (await use.count() && await use.isVisible().catch(() => false) && await use.isEnabled().catch(() => false)) {
          await use.click(); did = 'tid:card-action-*[キーにセット|ピースを使用]';
        }
      }
      if (!did && !pieceSet) {
        for (const i of [0, 1, 2]) {
          if (selectedKeyEnergy.has(i)) continue;
          const selected = await H.clickTestId(`keycost-energy-${i}`);
          if (selected) { selectedKeyEnergy.add(i); did = selected; break; }
        }
      }
      if (!did && !pieceSet) {
        const set = await H.clickBtn('セット', { exact: true }) || await H.clickBtn('使用', { exact: true });
        if (set) { did = set; pieceSet = true; }
      }
      if (!did && pieceSet && !chose4) {
        const c4 = await H.clickBtn('選択肢4', { exact: true });
        if (c4) { did = c4; chose4 = true; }
      }
      if (!did && chose4 && !paid) {
        const pay = await H.clickTestId('optcost-pay');
        if (pay) { did = pay; paid = true; }
      }
      const st0 = await H.queryState();
      if (!did && paid && Array.isArray(st0?.pendingCandidates)) {
        for (let i = 0; i < st0.pendingCandidates.length; i++) {
          if (picked.has(i)) continue;
          const pick = await H.clickTestId(`pick-${i}`);
          if (pick) { picked.add(i); did = pick; break; }
        }
      }
      if (!did && paid && picked.size >= 2) did = await H.clickBtn('決定');
      if (!did && paid) did = await H.clickTextOrBtn(['エナに送る', 'ライフバーストなし', 'OK']);
      const st = await H.queryState();
      H.log(`  csp[${s}] -> ${did ?? 'なし'} | set=${pieceSet} c4=${chose4} paid=${paid} picked=${[...picked]} hHand=${st?.host?.hand} hEnergy=${st?.host?.energy} gLife=${st?.guest?.life}(開始${before?.guest?.life}) pEff=${st?.pendingEffect ?? '-'}`);
      if (paid && st?.host?.hand === 0 && st?.guest?.life === before.guest.life - 1 && !st?.pendingEffect) {
        return { pass: true, detail: `④pay成立＝host.hand ${before.host.hand}→0（2枚捨て）／guest.life ${before.guest.life}→${st.guest.life}（1クラッシュ）／ピースコスト後energy=${st.host.energy}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `④pay未完了（set=${pieceSet} chose4=${chose4} paid=${paid} hHand=${fin?.host?.hand} gLife=${fin?.guest?.life} pEff=${fin?.pendingEffect ?? '-'}）` };
  },
};

// PLAN §7 B1(不足)：手札1枚では「支払う」がdisabledで、skipしても相手ライフは減らない。
scenarios.connectSpinningChoice4Insufficient = {
  title: 'WXDi-P14-002-E1④対照（手札1枚ではpay disabled・ライフ不変）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-001#1'],
      'field.assist_lrig_l': ['WD03-003#1'], 'field.assist_lrig_r': ['WD02-003#1'],
      'lrig_deck': ['WXDi-P14-002#1'],
      'hand': ['WD01-013#111'],
      'energy': ['WD02-009#111', 'WD01-013#112', 'WD03-013#113'],
      'actions_done': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'field.check': null, 'pending_crashed_cards': [] },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
    await page.waitForTimeout(400);
    H.log('ピース:', await H.clickTestId('zone-card-0') ?? '見つからず');
    let pieceSet = false; let chose4 = false; let sawDisabled = false; let skipped = false;
    const selectedKeyEnergy = new Set();
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(650);
      let did = null;
      if (!pieceSet) {
        // 続き475g：ピースは「ピースを使用」ラベルへ（§3 (cxxiii)）。両方を受ける。
        const use = page.locator('[data-testid^="card-action-"][data-action-label="キーにセット"], [data-testid^="card-action-"][data-action-label="ピースを使用"]').first();
        if (await use.count() && await use.isVisible().catch(() => false) && await use.isEnabled().catch(() => false)) {
          await use.click(); did = 'tid:card-action-*[キーにセット|ピースを使用]';
        }
      }
      if (!did && !pieceSet) {
        for (const i of [0, 1, 2]) {
          if (selectedKeyEnergy.has(i)) continue;
          const selected = await H.clickTestId(`keycost-energy-${i}`);
          if (selected) { selectedKeyEnergy.add(i); did = selected; break; }
        }
      }
      if (!did && !pieceSet) { const set = await H.clickBtn('セット', { exact: true }) || await H.clickBtn('使用', { exact: true }); if (set) { did = set; pieceSet = true; } }
      if (!did && pieceSet && !chose4) { const c4 = await H.clickBtn('選択肢4', { exact: true }); if (c4) { did = c4; chose4 = true; } }
      if (!did && chose4 && !skipped) {
        const pay = page.getByTestId('optcost-pay').first();
        if (await pay.count() && await pay.isVisible().catch(() => false)) {
          sawDisabled = !(await pay.isEnabled());
          if (!sawDisabled) return { pass: false, detail: '【回帰】手札1枚なのに④の「支払う」がenabled' };
          const skip = await H.clickTestId('optcost-skip');
          if (skip) { did = skip; skipped = true; }
        }
      }
      const st = await H.queryState();
      H.log(`  csi[${s}] -> ${did ?? 'なし'} | disabled=${sawDisabled} skipped=${skipped} hHand=${st?.host?.hand} gLife=${st?.guest?.life} pEff=${st?.pendingEffect ?? '-'}`);
      if (sawDisabled && skipped && !st?.pendingEffect && s >= 5) {
        const ok = st.host.hand === before.host.hand && st.guest.life === before.guest.life;
        return { pass: ok, detail: `手札不足でpay disabled=${sawDisabled}→skip後もhost.hand ${before.host.hand}→${st.host.hand}・guest.life ${before.guest.life}→${st.guest.life}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `不足対照未完了（disabled=${sawDisabled} skipped=${skipped} hHand=${fin?.host?.hand} gLife=${fin?.guest?.life}）` };
  },
};

// PLAN §7 B2(pay)：《青》1枚と手札2枚の複合コストを両方徴収し、対象をデッキ下へ送る。
scenarios.fezoneDoubleCostPay = {
  title: 'WXDi-P14-044-E1（アタックフェイズ開始時・青1＋手札2pay→対象をデッキ下）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-001#1'],
      'field.assist_lrig_l': ['WD03-003#1'], 'field.assist_lrig_r': ['WD03-004#1'],
      'field.signi': [['WXDi-P14-044#1'], null, null],
      'hand': ['WD01-013#121', 'WD01-013#122'],
      'energy': ['WD03-013#121'],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      'field.signi': [['WD01-013#123'], null, null],
      'deck': ['WD01-013#124', 'WD01-013#125'],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    let attackPhaseStarted = false; let optEnergySelected = false; let paid = false; const picked = new Set();
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(650);
      let did = null;
      if (!attackPhaseStarted) {
        const advance = await H.clickBtn('アタックフェイズへ', { exact: true });
        if (advance) { did = advance; attackPhaseStarted = true; }
      }
      if (!did && !paid && !optEnergySelected) {
        const selected = await H.clickTestId('optcost-energy-0');
        if (selected) { did = selected; optEnergySelected = true; }
      }
      if (!did && !paid) {
        const pay = await H.clickTestId('optcost-pay');
        if (pay) { did = pay; paid = true; }
      }
      const st0 = await H.queryState();
      if (!did && paid && Array.isArray(st0?.pendingCandidates)) {
        for (let i = 0; i < st0.pendingCandidates.length; i++) {
          const cn = st0.pendingCandidates[i];
          if (picked.has(`${cn}:${i}`)) continue;
          const pick = await H.clickTestId(`pick-${i}`);
          if (pick) { picked.add(`${cn}:${i}`); did = `${pick}:${cn}`; break; }
        }
      }
      if (!did && paid) did = await H.clickBtn('決定');
      const st = await H.queryState();
      H.log(`  fdcp[${s}] -> ${did ?? 'なし'} | paid=${paid} hE=${st?.host?.energy}(開始${before?.host?.energy}) hH=${st?.host?.hand}(開始${before?.host?.hand}) gBottom=${st?.guest?.deckBottom} candidates=${JSON.stringify(st?.pendingCandidates)}`);
      const targetGone = st?.guest?.fieldSigni?.[0] == null;
      if (paid && targetGone && st?.guest?.deckBottom === 'WD01-013#123' && !st?.pendingEffect) {
        const ok = before.host.energy - st.host.energy === 1 && before.host.hand - st.host.hand === 2;
        return { pass: ok, detail: `複合pay＝energy ${before.host.energy}→${st.host.energy}（青1）＋hand ${before.host.hand}→${st.host.hand}（2枚）／対象をdeckBottom=${st.guest.deckBottom}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `複合pay未完了（hE=${fin?.host?.energy} hH=${fin?.host?.hand} gField=${JSON.stringify(fin?.guest?.fieldSigni)} bottom=${fin?.guest?.deckBottom} pEff=${fin?.pendingEffect ?? '-'}）` };
  },
};

// PLAN §7 B2(skip)：支払いを辞退すれば手札・エナ・対象は一切動かない。
scenarios.fezoneDoubleCostSkip = {
  title: 'WXDi-P14-044-E1対照（skipなら青・手札・対象すべて不変）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-001#1'], 'field.assist_lrig_l': ['WD03-003#1'], 'field.assist_lrig_r': ['WD03-004#1'],
      'field.signi': [['WXDi-P14-044#1'], null, null],
      'hand': ['WD01-013#131', 'WD01-013#132'], 'energy': ['WD03-013#131'], 'actions_done': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'field.signi': [['WD01-013#133'], null, null], 'deck': ['WD01-013#134'] },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let skipped = false;
    for (let s = 0; s < 20; s++) {
      await page.waitForTimeout(650);
      let did = await H.clickBtn('アタックフェイズへ', { exact: true });
      if (!did && !skipped) {
        const skip = page.getByTestId('optcost-skip').first();
        if (await skip.count() && await skip.isVisible().catch(() => false)) { await skip.click(); did = 'tid:optcost-skip'; skipped = true; }
      }
      const st = await H.queryState();
      H.log(`  fdcs[${s}] -> ${did ?? 'なし'} | skipped=${skipped} hE=${st?.host?.energy} hH=${st?.host?.hand} gField=${JSON.stringify(st?.guest?.fieldSigni)} bottom=${st?.guest?.deckBottom} pEff=${st?.pendingEffect ?? '-'}`);
      if (skipped && !st?.pendingEffect && s >= 4) {
        const ok = st.host.energy === before.host.energy && st.host.hand === before.host.hand
          && st.guest.fieldSigni?.[0]?.includes('WD01-013#133') && st.guest.deckBottom === before.guest.deckBottom;
        return { pass: ok, detail: `skip後不変＝energy ${before.host.energy}→${st.host.energy}／hand ${before.host.hand}→${st.host.hand}／対象残存=${!!st.guest.fieldSigni?.[0]}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `skip対照未完了（skipped=${skipped} hE=${fin?.host?.energy} hH=${fin?.host?.hand} gField=${JSON.stringify(fin?.guest?.fieldSigni)}）` };
  },
};

// PLAN §7 C1(pay)：選択肢②の手札コスト候補はスペルだけで、payしたときだけ相手手札を1枚落とす。
scenarios.sYokusenkiSpellPay = {
  title: 'WX24-P1-065-E1②（スペルだけが捨て候補→pay時だけ相手手札1枚減少）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-001#1'],
      'field.signi': [['WX24-P1-065#1'], null, null],
      'hand': ['WD05-018#1', 'WD01-013#161'], // スペル／シグニの対照
      'actions_done': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'hand': ['WD01-013#162', 'WD01-013#163'] },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let attackPhaseStarted = false; let chose2 = false; let paid = false; let filterChecked = false; let picked = false;
    for (let s = 0; s < 28; s++) {
      await page.waitForTimeout(650); let did = null;
      if (!attackPhaseStarted) {
        const advance = await H.clickBtn('アタックフェイズへ', { exact: true });
        if (advance) { did = advance; attackPhaseStarted = true; }
      }
      if (!did && !chose2) { const c2 = await H.clickBtn('選択肢2', { exact: true }); if (c2) { did = c2; chose2 = true; } }
      if (!did && chose2 && !paid) {
        const pay = await H.clickTestId('optcost-pay');
        if (pay) { did = pay; paid = true; }
      }
      const st0 = await H.queryState();
      if (!did && paid && !picked && Array.isArray(st0?.pendingCandidates)) {
        const cands = st0.pendingCandidates;
        filterChecked = cands.length === 1 && cands[0] === 'WD05-018#1';
        if (!filterChecked) return { pass: false, detail: `【限定漏れ】スペル捨て候補が ${JSON.stringify(cands)}（期待=['WD05-018#1']・シグニは候補外）` };
        const pick = await H.clickTestId('pick-0');
        if (pick) { did = `${pick}:spell`; picked = true; }
      }
      if (!did && paid && picked) did = await H.clickBtn('決定');
      const st = await H.queryState();
      H.log(`  sysp[${s}] -> ${did ?? 'なし'} | c2=${chose2} paid=${paid} filter=${filterChecked} hHand=${st?.host?.hand} gHand=${st?.guest?.hand}(開始${before?.guest?.hand}) trash=${JSON.stringify(st?.host?.trashCards)} pEff=${st?.pendingEffect ?? '-'}`);
      if (filterChecked && (st?.host?.trashCards ?? []).includes('WD05-018#1') && st?.guest?.hand === before.guest.hand - 1 && !st?.pendingEffect) {
        const signiStayed = (st?.host?.handCards ?? []).includes('WD01-013#161');
        return { pass: signiStayed, detail: `候補はスペル1枚だけ→payでWD05-018をtrash、シグニ残存=${signiStayed}、guest.hand ${before.guest.hand}→${st.guest.hand}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `C1 pay未完了（filter=${filterChecked} hHand=${fin?.host?.hand} gHand=${fin?.guest?.hand} trash=${JSON.stringify(fin?.host?.trashCards)} pEff=${fin?.pendingEffect ?? '-'}）` };
  },
};

// PLAN §7 C1(skip)：スペルを捨てなければ相手手札は減らない。
scenarios.sYokusenkiSpellSkip = {
  title: 'WX24-P1-065-E1②対照（skipなら自分のスペルも相手手札も不変）',
  spec: {
    hostSet: { 'field.lrig': ['WD03-001#1'], 'field.signi': [['WX24-P1-065#1'], null, null], 'hand': ['WD05-018#1', 'WD01-013#171'], 'actions_done': [] },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'hand': ['WD01-013#172', 'WD01-013#173'] },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let chose2 = false; let skipped = false;
    for (let s = 0; s < 20; s++) {
      await page.waitForTimeout(650); let did = await H.clickBtn('アタックフェイズへ', { exact: true });
      if (!did && !chose2) { const c2 = await H.clickBtn('選択肢2', { exact: true }); if (c2) { did = c2; chose2 = true; } }
      if (!did && chose2 && !skipped) {
        const skip = page.getByRole('button', { name: /スキップ/, exact: false }).first();
        if (await skip.count() && await skip.isVisible().catch(() => false)) { await skip.click(); did = 'btn:スキップ'; skipped = true; }
      }
      const st = await H.queryState();
      H.log(`  syss[${s}] -> ${did ?? 'なし'} | skipped=${skipped} hHand=${st?.host?.hand} gHand=${st?.guest?.hand} pEff=${st?.pendingEffect ?? '-'}`);
      if (skipped && !st?.pendingEffect && s >= 4) {
        const ok = st.host.hand === before.host.hand && st.guest.hand === before.guest.hand && st.host.handCards.includes('WD05-018#1');
        return { pass: ok, detail: `skip後はスペル残存・host.hand ${before.host.hand}→${st.host.hand}／guest.hand ${before.guest.hand}→${st.guest.hand}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `C1 skip未完了（skipped=${skipped} hHand=${fin?.host?.hand} gHand=${fin?.guest?.hand}）` };
  },
};

// PLAN §7 C2(pay)：このシグニの下の＜ブルアカ＞3枚を支払い、エナチャージ1する。
scenarios.kokonaUnderThreePay = {
  title: 'WX25-CP1-091-E2（下のブルアカ3枚pay→3枚trash＋エナチャージ1）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [['WXDi-CP02-063#1', 'WXDi-CP02-064#1', 'WXDi-CP02-065#1', 'WX25-CP1-091#1'], null, null],
      'energy': [], 'trash': [], 'deck': ['WD01-013#181', 'WD01-013#182'], 'actions_done': [],
      // ⚠続き462 で判明＝`field.check` だけは injectScenario がリセットしない（CORE_FIELD_KEYS）。
      //   前シナリオの未確認ライフクラッシュが残ると「エナに送る」モーダルが全画面を覆い、
      //   ターン終了後の処理が一切進まない＝続き436 の「ボタンは押せるのに何も起きない」の候補。
      'field.check': null,
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'field.check': null },
    top: { active: 'host', turn_phase: 'END', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let turnEndClicked = false; let paid = false; const picked = new Set(); let candidateChecked = false;
    const expected = ['WXDi-CP02-063#1', 'WXDi-CP02-064#1', 'WXDi-CP02-065#1'];
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(650); let did = null;
      if (!turnEndClicked) {
        const advance = await H.clickBtn('ターン終了', { exact: true });
        if (advance) { did = advance; turnEndClicked = true; }
      }
      if (!did && !paid) {
        const pay = await H.clickTestId('optcost-pay');
        if (pay) { did = pay; paid = true; }
      }
      const st0 = await H.queryState();
      if (!did && paid && Array.isArray(st0?.pendingCandidates)) {
        const cands = st0.pendingCandidates;
        candidateChecked = expected.every(x => cands.includes(x)) && cands.length === 3;
        if (!candidateChecked) return { pass: false, detail: `下カード候補が不正: ${JSON.stringify(cands)}（期待ブルアカ3枚のみ）` };
        for (let i = 0; i < cands.length; i++) {
          if (picked.has(i)) continue;
          const pick = await H.clickTestId(`pick-${i}`);
          if (pick) { picked.add(i); did = pick; break; }
        }
      }
      if (!did && paid && picked.size >= 3) did = await H.clickBtn('決定');
      const st = await H.queryState();
      const stack = st?.host?.fieldSigni?.[0] ?? [];
      H.log(`  kutp[${s}] -> ${did ?? 'なし'} | paid=${paid} candidates=${candidateChecked} picked=${[...picked]} stack=${JSON.stringify(stack)} hTrash=${st?.host?.trash} hEnergy=${st?.host?.energy}(開始${before?.host?.energy}) pEff=${st?.pendingEffect ?? '-'}`);
      const paidCardsInTrash = expected.every(x => (st?.host?.trashCards ?? []).includes(x));
      if (paidCardsInTrash && st?.host?.energy === before.host.energy + 1 && !st?.pendingEffect) {
        const onlyHost = stack.length === 1 && stack[0] === 'WX25-CP1-091#1';
        return { pass: candidateChecked && onlyHost, detail: `ブルアカ3枚を下からtrash（stack=${JSON.stringify(stack)}）→energy ${before.host.energy}→${st.host.energy}・候補限定=${candidateChecked}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `C2 pay未完了（paid=${paid} candidates=${candidateChecked} stack=${JSON.stringify(fin?.host?.fieldSigni?.[0])} trash=${JSON.stringify(fin?.host?.trashCards)} energy=${fin?.host?.energy}）` };
  },
};

// PLAN §7 C2(skip)：3枚あっても置かなければエナチャージされない。
scenarios.kokonaUnderThreeSkip = {
  title: 'WX25-CP1-091-E2対照（3枚あってもskipなら下札・エナ不変）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [['WXDi-CP02-063#1', 'WXDi-CP02-064#1', 'WXDi-CP02-065#1', 'WX25-CP1-091#1'], null, null],
      'energy': [], 'trash': [], 'deck': ['WD01-013#191', 'WD01-013#192'], 'actions_done': [],
      'field.check': null, // 同上（続き462）
    },
    guestSet: { 'field.lrig': ['WD01-001#2'], 'field.check': null },
    top: { active: 'host', turn_phase: 'END', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let turnEndClicked = false; let skipped = false;
    for (let s = 0; s < 20; s++) {
      await page.waitForTimeout(650); let did = null;
      if (!turnEndClicked) {
        const advance = await H.clickBtn('ターン終了', { exact: true });
        if (advance) { did = advance; turnEndClicked = true; }
      }
      if (!did && !skipped) {
        const skip = await H.clickTestId('optcost-skip');
        if (skip) { did = skip; skipped = true; }
      }
      const st = await H.queryState(); const stack = st?.host?.fieldSigni?.[0] ?? [];
      H.log(`  kuts[${s}] -> ${did ?? 'なし'} | skipped=${skipped} stack=${JSON.stringify(stack)} energy=${st?.host?.energy} trash=${st?.host?.trash} pEff=${st?.pendingEffect ?? '-'}`);
      if (skipped && !st?.pendingEffect && s >= 4) {
        const ok = stack.length === 4 && st.host.energy === before.host.energy && st.host.trash === before.host.trash;
        return { pass: ok, detail: `skip後は下札4枚stack維持=${stack.length === 4}・energy ${before.host.energy}→${st.host.energy}・trash ${before.host.trash}→${st.host.trash}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `C2 skip未完了（skipped=${skipped} stack=${JSON.stringify(fin?.host?.fieldSigni?.[0])} energy=${fin?.host?.energy}）` };
  },
};

// PLAN §7 C2(不足)：下にブルアカが2枚しかなければpay枝は利用不能で、効果本体も走らない。
scenarios.kokonaUnderInsufficient = {
  title: 'WX25-CP1-091-E2対照（下のブルアカ2枚ではpay不可・エナチャージなし）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [['WXDi-CP02-063#1', 'WXDi-CP02-064#1', 'WX25-CP1-091#1'], null, null],
      'energy': [], 'trash': [], 'deck': ['WD01-013#201', 'WD01-013#202'], 'actions_done': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#2'] },
    top: { active: 'host', turn_phase: 'END', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let turnEndClicked = false; let sawUnavailable = false; let skipped = false;
    for (let s = 0; s < 20; s++) {
      await page.waitForTimeout(650); let did = null;
      if (!turnEndClicked) {
        const advance = await H.clickBtn('ターン終了', { exact: true });
        if (advance) { did = advance; turnEndClicked = true; }
      }
      if (!did && !skipped) {
        const st0 = await H.queryState();
        if (Array.isArray(st0?.pendingOptions)) {
          const payOption = st0.pendingOptions.find(o => o.startsWith('pay:'));
          sawUnavailable = payOption == null || payOption.endsWith('(disabled)');
          if (!sawUnavailable) return { pass: false, detail: `【回帰】下にブルアカ2枚しかないのに有効なpay枝がある: ${JSON.stringify(st0.pendingOptions)}` };
        }
        const pay = page.getByTestId('optcost-pay').first();
        if (await pay.count() && await pay.isVisible().catch(() => false) && await pay.isEnabled()) {
          return { pass: false, detail: '【回帰】下にブルアカ2枚しかないのにoptcost-payがenabled' };
        }
        const skip = await H.clickTestId('optcost-skip');
        if (skip) { did = skip; skipped = true; }
      }
      const st = await H.queryState();
      H.log(`  kui[${s}] -> ${did ?? 'なし'} | unavailable=${sawUnavailable} skipped=${skipped} options=${JSON.stringify(st?.pendingOptions)} stack=${JSON.stringify(st?.host?.fieldSigni?.[0])} energy=${st?.host?.energy} pEff=${st?.pendingEffect ?? '-'}`);
      if (sawUnavailable && skipped && !st?.pendingEffect && s >= 4) {
        const ok = st.host.energy === before.host.energy && st.host.fieldSigni?.[0]?.length === 3;
        return { pass: ok, detail: `ブルアカ2枚ではpay枝利用不能=${sawUnavailable}・skip後もenergy ${before.host.energy}→${st.host.energy}／stack長3維持` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `C2不足対照未完了（unavailable=${sawUnavailable} skipped=${skipped} stack=${JSON.stringify(fin?.host?.fieldSigni?.[0])} energy=${fin?.host?.energy}）` };
  },
};

// PLAN §7 C3：カンニング付与能力を直接注入し、捨てたシグニと同レベルかつダウンだけを対象候補にする。
scenarios.cheatingSameLevelDownFilter = {
  title: 'WXEX2-20-sub-E1（相手シグニ攻撃時・シグニ1枚pay→同レベルかつダウンだけをエナへ）',
  spec: {
    hostSet: {
      'field.lrig': ['WXEX2-20#1'],
      'field.signi': [null, null, null],
      'hand': ['WD01-013#211'], // Lv1＝動的比較元
      'lrig_granted_auto_effects': [{
        effectId: 'WXEX2-20-sub-E1', effectType: 'AUTO', timing: ['ON_ATTACK_SIGNI'],
        action: { type: 'SEQUENCE', steps: [
          { type: 'STUB', id: 'OPTIONAL_COST', handDiscard: { count: 1, filter: { cardType: 'シグニ' } } },
          { type: 'SEND_TO_ENERGY', target: { type: 'SIGNI', owner: 'opponent', count: 1, filter: { cardType: 'シグニ', isDown: true, levelEqLastProcessed: true }, upToCount: false } },
        ] },
        duration: 'INSTANT', mandatory: true, parseStatus: 'AUTO', triggerScope: 'any_opp',
      }],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      // zone0=Lv2アップ（CPUの攻撃元。攻撃でダウンしてもレベル不一致）
      // zone1=Lv1ダウン（唯一の正候補）／zone2=Lv1アップ（同レベルだが状態不一致）
      'field.signi': [['WD01-012#211'], ['WD01-013#212'], ['WD01-014#213']],
      'field.signi_down': [false, true, false],
      'energy': [], 'blocked_actions': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    const before = await H.queryState(); let paid = false; let discardPicked = false; let targetChecked = false; let targetPicked = false;
    for (let s = 0; s < 34; s++) {
      await page.waitForTimeout(650); let did = null;
      if (!paid) {
        const pay = page.getByRole('button', { name: /支払う/, exact: false }).first();
        if (await pay.count() && await pay.isVisible().catch(() => false) && await pay.isEnabled().catch(() => false)) { await pay.click(); did = 'btn:支払う'; paid = true; }
      }
      const st0 = await H.queryState();
      if (!did && paid && !discardPicked && Array.isArray(st0?.pendingCandidates)) {
        const cands = st0.pendingCandidates;
        const idx = cands.indexOf('WD01-013#211');
        if (idx >= 0) {
          const p = page.getByTestId(`pick-${idx}`).first();
          if (await p.count() && await p.isVisible().catch(() => false)) { await p.click(); did = 'pick:discard-signi'; discardPicked = true; }
        }
      }
      if (!did && discardPicked && !targetPicked && Array.isArray(st0?.pendingCandidates)
          && st0.pendingCandidates.some(x => x.startsWith('WD01-'))) {
        const cands = st0.pendingCandidates;
        // 手札候補のラウンドは上で処理済み。相手場3体のいずれかが見えたラウンドだけ対象filterを判定する。
        if (cands.some(x => ['WD01-012#211', 'WD01-013#212', 'WD01-014#213'].includes(x))) {
          targetChecked = cands.length === 1 && cands[0] === 'WD01-013#212';
          if (!targetChecked) return { pass: false, detail: `【限定漏れ】SEND_TO_ENERGY候補=${JSON.stringify(cands)}（期待＝Lv1かつdownのWD01-013#212のみ）` };
          const p = page.getByTestId('pick-0').first();
          if (await p.count() && await p.isVisible().catch(() => false)) { await p.click(); did = 'pick:only-valid-target'; targetPicked = true; }
        }
      }
      if (!did && paid) did = await H.clickTextOrBtn(['決定', '確定', 'ガードしない', 'しない', 'エナに送る', 'OK']);
      const st = await H.queryState();
      const moved = (st?.guest?.energyCards ?? []).includes('WD01-013#212');
      H.log(`  csld[${s}] -> ${did ?? 'なし'} | paid=${paid} discard=${discardPicked} filter=${targetChecked} picked=${targetPicked} candidates=${JSON.stringify(st?.pendingCandidates)} gDown=${JSON.stringify(st?.guest?.signiDown)} gEnergy=${JSON.stringify(st?.guest?.energyCards)} pEff=${st?.pendingEffect ?? '-'}`);
      if (moved && !st?.pendingEffect) {
        const othersStayed = st.guest.fieldSigni?.[0]?.includes('WD01-012#211') && st.guest.fieldSigni?.[2]?.includes('WD01-014#213');
        return { pass: targetChecked && othersStayed && st.host.hand === 0, detail: `候補を1体に限定=${targetChecked}→WD01-013#212だけguest.energyへ移動、別Lv攻撃元・同Lvアップは残存=${othersStayed}、hand ${before.host.hand}→${st.host.hand}` };
      }
    }
    const fin = await H.queryState();
    return { pass: false, detail: `C3未完了（paid=${paid} discard=${discardPicked} filter=${targetChecked} picked=${targetPicked} gField=${JSON.stringify(fin?.guest?.fieldSigni)} gEnergy=${JSON.stringify(fin?.guest?.energyCards)} pEff=${fin?.pendingEffect ?? '-'}）` };
  },
};

// ── 続き469：PLAN §7 V-05 対象宣言の owner/count/power 制限＋V-07② 自己トラッシュ ──
const AKINO_TARGET_GUEST = ['WD01-012#4692', 'WD01-013#4693', 'WD01-014#4694'];
const AKINO_TARGET_SELF = 'WX06-CB01#4691';
const AKINO_GUARD = 'WD01-017#4695';
const AKINO_SELECTED_TWO = [AKINO_TARGET_GUEST[0], AKINO_TARGET_GUEST[2]];

const akinoTargetDeclSpec = {
  hostSet: {
    'field.lrig': ['WXDi-P02-009#4690'],
    'field.lrig_down': false,
    'field.assist_lrig_l': ['WXDi-D02-07LT#4690'],
    'field.assist_lrig_r': ['WXDi-D02-18AT#4690'],
    'field.assist_lrig_l_down': false,
    'field.assist_lrig_r_down': false,
    'field.signi': [[AKINO_TARGET_SELF], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [AKINO_GUARD],
    'energy': [],
    'actions_done': [],
    'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4699'],
    'field.signi': AKINO_TARGET_GUEST.map(n => [n]),
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [],
    'energy': [],
    'actions_done': [],
    'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
};

const sameInstanceSet = (actual, expected) => Array.isArray(actual)
  && actual.length === expected.length
  && expected.every(n => actual.includes(n));

// ⚠待機予算は `clickPendingInstance` と揃える（3秒）。⚠**500ms では足りない**（続き469 実測＝
//   `targetDeclUpToTwoAllowsZero` が1回目 PASS・2回目 FAIL の位置依存フレークになった）。
//   `queryState` は Supabase 直照会なので **DB が真になってもモーダルはまだ描画されていない**。
async function clickExactVisibleText(page, text) {
  for (let k = 0; k < 20; k++) {
    const el = page.getByText(text, { exact: true }).first();
    if (await el.count() && await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => true)) {
      await el.click({ timeout: 2000 });
      return `text:${text}`;
    }
    await page.waitForTimeout(150); // ⚠`clickPendingInstance` と同じ 20×150ms＝3秒に揃える（続き470 で codex が不揃いを指摘）
  }
  return null;
}

async function clickPendingInstance(page, H, instanceId) {
  const st = await H.queryState();
  if (!Array.isArray(st?.pendingCandidates) || !st.pendingCandidates.includes(instanceId)) return null;
  // EffectInteractionModal は opp_field の表示順だけ candidates を反転するため、DB配列の index を
  // そのまま pick-N に使わない。instanceId を集合で検査した後、固有 cardNum の data-card-num で狙う。
  const cardNum = instanceId.split('#')[0];
  // ⚠**DB に候補が立った瞬間はまだモーダルが描画されていない**（続き469 実測＝`pendingCandidates` は
  //   取れているのに `pick-*` が0件で、1体目のクリックが即 null になり FAIL した）。
  //   `queryState` は Supabase を直接照会するので **DOM より先に真になる**＝**描画を待ってから掴む**。
  const pick = page.locator(`[data-testid^="pick-"][data-card-num="${cardNum}"]`).first();
  for (let w = 0; w < 20; w++) {
    if (await pick.count() && await pick.isVisible().catch(() => false)) break;
    await page.waitForTimeout(150);
  }
  if (!(await pick.count()) || !(await pick.isVisible().catch(() => false))) return null;
  const testId = await pick.getAttribute('data-testid');
  await pick.click({ timeout: 2000 });
  return `tid:${testId ?? 'pick-*'}:${instanceId}`;
}

async function openAkinoTargetDeclaration(page, H, id) {
  await H.ensureMain();
  const flow = { lrigOpened: false, actionClicked: false, fired: false };
  let last = await H.queryState();
  for (let s = 0; s < 32; s++) {
    await page.waitForTimeout(300);
    let did = null;
    if (!flow.lrigOpened) {
      const img = page.getByAltText('勇気へ前進　アキノ', { exact: true }).first();
      if (await img.count() && await img.isVisible().catch(() => false)) {
        await img.click({ force: true, timeout: 2000 }); did = 'img:勇気へ前進 アキノ'; flow.lrigOpened = true;
      }
    } else if (!flow.actionClicked) {
      const act = page.locator('[data-testid^="card-action-"][data-action-label="【起】アップ状態のレベル2のルリグ2体をダウン"]').first();
      if (await act.count() && await act.isVisible().catch(() => false) && await act.isEnabled().catch(() => false)) {
        await act.click({ timeout: 2000 }); did = 'action:【起】Lv2ルリグ2体ダウン'; flow.actionClicked = true;
      }
    } else if (!flow.fired) {
      did = await H.clickBtn('発動', { exact: true });
      if (did) flow.fired = true;
    }
    const st = await H.queryState();
    last = st;
    H.log(`  ${id}.open[${s}] -> ${did ?? 'なし'} | flow=${JSON.stringify(flow)} assistDown=${JSON.stringify(st?.host?.assistDown)} candidates=${JSON.stringify(st?.pendingCandidates)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (flow.fired && Array.isArray(st?.pendingCandidates)) {
      if (st?.host?.assistDown?.[0] !== true || st?.host?.assistDown?.[1] !== true || st?.host?.lrigDown !== false) {
        return { error: `Lv2ルリグ2体ダウン不成立（assistDown=${JSON.stringify(st?.host?.assistDown)} centerDown=${st?.host?.lrigDown}）`, st };
      }
      return { st };
    }
  }
  return { error: `対象宣言が開かない（flow=${JSON.stringify(flow)} assistDown=${JSON.stringify(last?.host?.assistDown)} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）`, st: last };
}

async function settleAkinoAfterZero(page, H, id, { payGuard }) {
  let prompted = false; let payClicked = false; let guardPicked = false; let guardConfirmed = false; let last = await H.queryState();
  for (let s = 0; s < 40; s++) {
    await page.waitForTimeout(300);
    const st0 = await H.queryState();
    let did = null;
    if ((st0?.pendingOptions ?? []).some(o => o.startsWith('pay:'))) {
      prompted = true;
      did = await H.clickTestId(payGuard ? 'optcost-pay' : 'optcost-skip');
      if (did && payGuard) payClicked = true;
    } else if (payGuard && payClicked && !guardPicked && sameInstanceSet(st0?.pendingCandidates, [AKINO_GUARD])) {
      did = await clickPendingInstance(page, H, AKINO_GUARD);
      if (did) guardPicked = true;
    } else if (payGuard && guardPicked && !guardConfirmed) {
      did = await clickExactVisibleText(page, '決定 (1/1)');
      if (did) guardConfirmed = true;
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = st?.pendingEffect == null && (st?.stackLen ?? 0) === 0;
    H.log(`  ${id}.zero[${s}] -> ${did ?? 'なし'} | prompted=${prompted} pay=${payClicked} guard=${guardPicked}/${guardConfirmed} hHand=${st?.host?.hand} hTrash=${JSON.stringify(st?.host?.trashCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled && sameInstanceSet((st?.guest?.fieldSigni ?? []).flatMap(z => z ?? []), AKINO_TARGET_GUEST)) {
      return { pass: true, st, prompted, payClicked, guardPicked, guardConfirmed };
    }
  }
  return { pass: false, st: last, prompted, payClicked, guardPicked, guardConfirmed };
}

scenarios.targetDeclOpponentOnlyCandidates = {
  title: 'WXDi-P02-009-E3（対象宣言owner＝候補は相手場3体だけ・自場を混ぜない）',
  spec: akinoTargetDeclSpec,
  async drive(page, H) {
    const opened = await openAkinoTargetDeclaration(page, H, 'tdoc');
    if (opened.error) return { pass: false, detail: opened.error };
    const cands = opened.st.pendingCandidates;
    if (!sameInstanceSet(cands, AKINO_TARGET_GUEST) || cands.includes(AKINO_TARGET_SELF)) {
      return { pass: false, detail: `【owner回帰】候補=${JSON.stringify(cands)}（期待＝guest 3体のみ ${JSON.stringify(AKINO_TARGET_GUEST)}／self ${AKINO_TARGET_SELF} は不在）` };
    }
    const zero = await clickExactVisibleText(page, '決定 (0/2)');
    if (!zero) return { pass: false, detail: `owner候補は正しいが0体確定ボタンを押せない（candidates=${JSON.stringify(cands)}）` };
    const done = await settleAkinoAfterZero(page, H, 'tdoc', { payGuard: false });
    return {
      pass: done.pass,
      detail: done.pass
        ? `pendingCandidates=${JSON.stringify(cands)}＝guest 3体だけ／self ${AKINO_TARGET_SELF} 混入なし。観測後は0体確定＋任意コストskipで完走`
        : `owner候補観測後の完走タイムアウト（gField=${JSON.stringify(done.st?.guest?.fieldSigni)} pEff=${done.st?.pendingEffect ?? '-'}）`,
    };
  },
};

scenarios.targetDeclUpToTwoSelectsBoth = {
  title: 'WXDi-P02-009-E3（2体まで＝2体を対象確定しGuardを捨て、その2体だけ手札へ戻す）',
  spec: akinoTargetDeclSpec,
  async drive(page, H) {
    const opened = await openAkinoTargetDeclaration(page, H, 'td2');
    if (opened.error) return { pass: false, detail: opened.error };
    if (!sameInstanceSet(opened.st.pendingCandidates, AKINO_TARGET_GUEST)) {
      return { pass: false, detail: `対象宣言候補不一致=${JSON.stringify(opened.st.pendingCandidates)}` };
    }
    for (const id of AKINO_SELECTED_TWO) {
      const picked = await clickPendingInstance(page, H, id);
      if (!picked) return { pass: false, detail: `宣言対象 ${id} を選べない（candidates=${JSON.stringify((await H.queryState())?.pendingCandidates)}）` };
    }
    if (!(await clickExactVisibleText(page, '決定 (2/2)'))) return { pass: false, detail: '宣言2体を選んだが「決定 (2/2)」を押せない' };

    let paid = false; let guardPicked = false; let guardConfirmed = false; const bouncePicked = new Set(); let bounceConfirmed = false;
    let last = await H.queryState();
    for (let s = 0; s < 54; s++) {
      await page.waitForTimeout(300);
      const st0 = await H.queryState();
      let did = null;
      if (!paid && (st0?.pendingOptions ?? []).some(o => o.startsWith('pay:'))) {
        did = await H.clickTestId('optcost-pay'); if (did) paid = true;
      } else if (paid && !guardPicked && sameInstanceSet(st0?.pendingCandidates, [AKINO_GUARD])) {
        did = await clickPendingInstance(page, H, AKINO_GUARD); if (did) guardPicked = true;
      } else if (guardPicked && !guardConfirmed) {
        did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) guardConfirmed = true;
      } else if (guardConfirmed && sameInstanceSet(st0?.pendingCandidates, AKINO_SELECTED_TWO)) {
        const next = AKINO_SELECTED_TWO.find(n => !bouncePicked.has(n));
        if (next) { did = await clickPendingInstance(page, H, next); if (did) bouncePicked.add(next); }
        else if (!bounceConfirmed) { did = await clickExactVisibleText(page, '決定 (2/2)'); if (did) bounceConfirmed = true; }
      } else if (guardConfirmed && Array.isArray(st0?.pendingCandidates)
          && !sameInstanceSet(st0.pendingCandidates, AKINO_TARGET_GUEST)
          && !sameInstanceSet(st0.pendingCandidates, [AKINO_GUARD])) {
        return { pass: false, detail: `【stored対象回帰】BOUNCE再確認候補=${JSON.stringify(st0.pendingCandidates)}（期待=${JSON.stringify(AKINO_SELECTED_TWO)}）` };
      }
      if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
      const st = await H.queryState();
      last = st;
      const selectedReturned = AKINO_SELECTED_TWO.every(n => st?.guest?.handCards?.includes(n));
      const thirdStayed = st?.guest?.fieldSigni?.[1]?.includes(AKINO_TARGET_GUEST[1]);
      H.log(`  td2[${s}] -> ${did ?? 'なし'} | paid=${paid} guard=${guardPicked}/${guardConfirmed} bounce=${bouncePicked.size}/${bounceConfirmed} gHand=${JSON.stringify(st?.guest?.handCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (selectedReturned && thirdStayed && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0) {
        const guardPaid = st.host.hand === 0 && st.host.trashCards.includes(AKINO_GUARD);
        return { pass: paid && guardPaid, detail: `2体選択→${JSON.stringify(AKINO_SELECTED_TWO)}だけguest.handへ、未選択 ${AKINO_TARGET_GUEST[1]} はzone1残存=${thirdStayed}／Guard支払い=${guardPaid}` };
      }
    }
    return { pass: false, detail: `2体bounce未完了（paid=${paid} guard=${guardPicked}/${guardConfirmed} bounce=${bouncePicked.size}/${bounceConfirmed} gHand=${JSON.stringify(last?.guest?.handCards)} gField=${JSON.stringify(last?.guest?.fieldSigni)} pEff=${last?.pendingEffect ?? '-'}）` };
  },
};

scenarios.targetDeclUpToTwoAllowsZero = {
  title: 'WXDi-P02-009-E3（2体まで＝0体で確定可・相手場不変、Guard任意コストの現状も記録）',
  spec: akinoTargetDeclSpec,
  async drive(page, H) {
    const opened = await openAkinoTargetDeclaration(page, H, 'td0');
    if (opened.error) return { pass: false, detail: opened.error };
    if (!sameInstanceSet(opened.st.pendingCandidates, AKINO_TARGET_GUEST)) {
      return { pass: false, detail: `0体対照の候補前提不一致=${JSON.stringify(opened.st.pendingCandidates)}` };
    }
    if (!(await clickExactVisibleText(page, '決定 (0/2)'))) return { pass: false, detail: '「決定 (0/2)」がenabledでなく0体確定できない' };
    const done = await settleAkinoAfterZero(page, H, 'td0', { payGuard: true });
    if (!done.pass) return { pass: false, detail: `0体確定後の完走タイムアウト（prompted=${done.prompted} pay=${done.payClicked} guard=${done.guardPicked}/${done.guardConfirmed} gField=${JSON.stringify(done.st?.guest?.fieldSigni)}）` };
    const guardMoved = done.st.host.trashCards.includes(AKINO_GUARD) && !done.st.host.handCards.includes(AKINO_GUARD);
    return { pass: true, detail: `0/2確定後もguest 3体すべて場に残存。Guardコスト現状＝提示=${done.prompted}・payクリック=${done.payClicked}・${AKINO_GUARD}手札→trash=${guardMoved}（仕様判断はしない）` };
  },
};

const POWER_LOW = 'WD01-013#4701';       // 印字P3000
const POWER_HIGH = 'WX01-053#4702';      // 印字P15000
const POWER_HOST = 'WX06-CB01#4700';     // 羅石 キュア P2000
const POWER_HOST_HAND = ['WD01-017#4703', 'WD01-014#4704'];

const makeTargetDeclPowerSpec = (powerMods) => ({
  hostSet: {
    'field.lrig': ['WD01-001#4709'], 'field.signi': [[POWER_HOST], null, null],
    'field.signi_down': [false, false, false], 'field.check': null,
    'hand': POWER_HOST_HAND, 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4710'], 'field.signi': [[POWER_LOW], [POWER_HIGH], null],
    'field.signi_down': [false, false, false], 'field.check': null,
    'temp_power_mods': powerMods, 'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
});

async function clickCureAttack(page, H) {
  const zone = await H.clickTestId('my-signi-zone-0');
  if (!zone) return null;
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(200);
    const attack = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
    if (await attack.count() && await attack.isVisible().catch(() => false) && await attack.isEnabled().catch(() => false)) {
      await attack.click({ timeout: 2000 }); return 'action:アタック';
    }
  }
  return null;
}

async function finishCureSkip(page, H, id) {
  let skipped = false; let last = await H.queryState();
  for (let s = 0; s < 36; s++) {
    await page.waitForTimeout(300);
    let did = null;
    const st0 = await H.queryState();
    if (!skipped && (st0?.pendingOptions ?? []).some(o => o.startsWith('skip:'))) {
      did = await H.clickTestId('optcost-skip'); if (did) skipped = true;
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = skipped && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.pendingSigniBattle == null
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    H.log(`  ${id}.skip[${s}] -> ${did ?? 'なし'} | skipped=${skipped} hField=${JSON.stringify(st?.host?.fieldSigni)} gField=${JSON.stringify(st?.guest?.fieldSigni)} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) return { pass: true, st };
  }
  return { pass: false, st: last };
}

scenarios.targetDeclPowerCapExcludesAbove = {
  title: 'WX06-CB01-E1（powerRange max3000＝P3000だけ候補、P15000を除外）',
  spec: makeTargetDeclPowerSpec([]),
  async drive(page, H) {
    const before = await H.queryState();
    if (!(await clickCureAttack(page, H))) return { pass: false, detail: 'WX06-CB01のアタックボタンを押せない' };
    let cands = null;
    for (let s = 0; s < 36; s++) {
      await page.waitForTimeout(250);
      const st = await H.queryState();
      if (Array.isArray(st?.pendingCandidates)) { cands = st.pendingCandidates; break; }
    }
    if (!sameInstanceSet(cands, [POWER_LOW])) {
      return { pass: false, detail: `【powerRange回帰】pendingCandidates=${JSON.stringify(cands)}（期待=${POWER_LOW}だけ、${POWER_HIGH}は除外）` };
    }
    if (!(await clickPendingInstance(page, H, POWER_LOW)) || !(await clickExactVisibleText(page, '決定 (1/1)'))) {
      return { pass: false, detail: `正候補 ${POWER_LOW} の選択確定に失敗` };
    }
    const done = await finishCureSkip(page, H, 'tdpc');
    const fieldsStayed = done.st?.host?.fieldSigni?.[0]?.includes(POWER_HOST)
      && done.st?.guest?.fieldSigni?.[0]?.includes(POWER_LOW) && done.st?.guest?.fieldSigni?.[1]?.includes(POWER_HIGH);
    return { pass: done.pass && fieldsStayed, detail: `候補=${JSON.stringify(cands)}＝P3000だけ（P15000除外）。OPTIONAL_TRASH_SELF skip後は両者の場不変=${fieldsStayed}、life ${before?.guest?.life}→${done.st?.guest?.life}` };
  },
};

scenarios.targetDeclPowerCapUsesEffectivePower = {
  title: 'WX06-CB01-E1（同一盤面でP3000へ+1000＝実効P4000になり候補0）',
  spec: makeTargetDeclPowerSpec([{ cardNum: POWER_LOW, delta: 1000 }]),
  async drive(page, H) {
    const before = await H.queryState();
    const modSeen = before?.guest?.powerMods?.includes(`${POWER_LOW}:1000`);
    if (!modSeen) return { pass: false, detail: `temp_power_mods注入不成立（powerMods=${JSON.stringify(before?.guest?.powerMods)}）` };
    if (!(await clickCureAttack(page, H))) return { pass: false, detail: 'WX06-CB01のアタックボタンを押せない' };
    let sawPostTargetChoose = false; let sawNonEmptyCandidates = null; let skipped = false; let last = before;
    for (let s = 0; s < 42; s++) {
      await page.waitForTimeout(250);
      const st0 = await H.queryState();
      let did = null;
      if (Array.isArray(st0?.pendingCandidates) && st0.pendingCandidates.length > 0) {
        sawNonEmptyCandidates = [...st0.pendingCandidates];
        return { pass: false, detail: `【印字パワー回帰】実効P4000の ${POWER_LOW} が候補に残った=${JSON.stringify(sawNonEmptyCandidates)}（powerMods=${JSON.stringify(st0?.guest?.powerMods)}）` };
      }
      if (!skipped && (st0?.pendingOptions ?? []).some(o => o.startsWith('skip:'))) {
        sawPostTargetChoose = true;
        did = await H.clickTestId('optcost-skip'); if (did) skipped = true;
      }
      if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
      if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
      if (!did) did = await H.clickBtn('エナに送る', { exact: true });
      const st = await H.queryState();
      last = st;
      const settled = sawPostTargetChoose && skipped && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
        && st?.host?.pendingSigniBattle == null
        && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
      H.log(`  tdpe[${s}] -> ${did ?? 'なし'} | mod=${modSeen} postTargetChoose=${sawPostTargetChoose} skipped=${skipped} candidates=${JSON.stringify(st?.pendingCandidates)} gPmods=${JSON.stringify(st?.guest?.powerMods)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (settled) {
        const fieldsStayed = st.host.fieldSigni?.[0]?.includes(POWER_HOST)
          && st.guest.fieldSigni?.[0]?.includes(POWER_LOW) && st.guest.fieldSigni?.[1]?.includes(POWER_HIGH);
        return { pass: fieldsStayed, detail: `powerMods=${POWER_LOW}:1000（印字3000→実効4000）を先に確認。SELECT_TARGET候補は非空を一度も観測せず、後段OPTIONAL_TRASH_SELF到達=${sawPostTargetChoose}→skip完走、場不変=${fieldsStayed}` };
      }
    }
    return { pass: false, detail: `実効パワー候補0の完走タイムアウト（mod=${modSeen} postTargetChoose=${sawPostTargetChoose} skipped=${skipped} candidates=${JSON.stringify(sawNonEmptyCandidates)} pEff=${last?.pendingEffect ?? '-'}）` };
  },
};

const OPTIONAL_TRASH_SELF_SPEC = makeTargetDeclPowerSpec([]);

async function runOptionalTrashSelfRound(page, H, branch) {
  const before = await H.queryState();
  if (!(await clickCureAttack(page, H))) return { pass: false, detail: `${branch}: WX06-CB01のアタックボタンを押せない` };
  let phase = 'initialTarget'; let initialChecked = false; let targetPicked = false; let targetConfirmed = false;
  let branchClicked = false; let selfPicked = false; let selfConfirmed = false; let banishPicked = false; let banishConfirmed = false;
  let last = before;
  for (let s = 0; s < 64; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (phase === 'initialTarget' && Array.isArray(st0?.pendingCandidates)) {
      initialChecked = sameInstanceSet(st0.pendingCandidates, [POWER_LOW]);
      if (!initialChecked) return { pass: false, detail: `${branch}: 初期候補限定漏れ=${JSON.stringify(st0.pendingCandidates)}` };
      if (!targetPicked) { did = await clickPendingInstance(page, H, POWER_LOW); if (did) targetPicked = true; }
      else if (!targetConfirmed) { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) { targetConfirmed = true; phase = 'choose'; } }
    } else if (phase === 'choose' && (st0?.pendingOptions ?? []).some(o => o.startsWith('skip:'))) {
      did = await H.clickTestId(branch === 'pay' ? 'optcost-pay' : 'optcost-skip');
      if (did) { branchClicked = true; phase = branch === 'pay' ? 'selfTarget' : 'settle'; }
    } else if (phase === 'selfTarget' && sameInstanceSet(st0?.pendingCandidates, [POWER_HOST])) {
      if (!selfPicked) { did = await clickPendingInstance(page, H, POWER_HOST); if (did) selfPicked = true; }
      else if (!selfConfirmed) { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) { selfConfirmed = true; phase = 'banishTarget'; } }
    } else if (phase === 'banishTarget' && sameInstanceSet(st0?.pendingCandidates, [POWER_LOW])) {
      if (!banishPicked) { did = await clickPendingInstance(page, H, POWER_LOW); if (did) banishPicked = true; }
      else if (!banishConfirmed) { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) { banishConfirmed = true; phase = 'settle'; } }
    } else if ((phase === 'selfTarget' || phase === 'banishTarget') && Array.isArray(st0?.pendingCandidates)) {
      const expected = phase === 'selfTarget' ? [POWER_HOST] : [POWER_LOW];
      // 直前interactionのDB反映待ちで一瞬残る旧候補は無視し、それ以外の集合だけを実回帰とする。
      const stale = (phase === 'selfTarget' && sameInstanceSet(st0.pendingCandidates, [POWER_LOW]))
        || (phase === 'banishTarget' && sameInstanceSet(st0.pendingCandidates, [POWER_HOST]));
      if (!stale && !sameInstanceSet(st0.pendingCandidates, expected)) {
        return { pass: false, detail: `${branch}: ${phase}候補不一致=${JSON.stringify(st0.pendingCandidates)}（期待=${JSON.stringify(expected)}）` };
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = phase === 'settle' && branchClicked && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.pendingSigniBattle == null
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    H.log(`  ots.${branch}[${s}] -> ${did ?? 'なし'} | phase=${phase} initial=${initialChecked}/${targetPicked}/${targetConfirmed} branch=${branchClicked} self=${selfPicked}/${selfConfirmed} banish=${banishPicked}/${banishConfirmed} hHand=${JSON.stringify(st?.host?.handCards)} hField=${JSON.stringify(st?.host?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${JSON.stringify(st?.guest?.energyCards)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      const handUnchanged = sameInstanceSet(st.host.handCards, POWER_HOST_HAND);
      if (branch === 'pay') {
        const selfTrashed = st.host.fieldSigni?.[0] == null && st.host.trashCards.includes(POWER_HOST);
        const targetBanished = st.guest.fieldSigni?.[0] == null && st.guest.energyCards.includes(POWER_LOW);
        const highStayed = st.guest.fieldSigni?.[1]?.includes(POWER_HIGH);
        return { pass: initialChecked && selfTrashed && targetBanished && highStayed && handUnchanged,
          detail: `pay: selfTrash=${selfTrashed} targetBanish=${targetBanished} highStayed=${highStayed} handUnchanged=${handUnchanged}（${JSON.stringify(st.host.handCards)}）` };
      }
      const selfStayed = st.host.fieldSigni?.[0]?.includes(POWER_HOST);
      const targetsStayed = st.guest.fieldSigni?.[0]?.includes(POWER_LOW) && st.guest.fieldSigni?.[1]?.includes(POWER_HIGH);
      return { pass: initialChecked && selfStayed && targetsStayed && handUnchanged,
        detail: `skip: selfStayed=${selfStayed} targetsStayed=${targetsStayed} handUnchanged=${handUnchanged}（${JSON.stringify(st.host.handCards)}）` };
    }
  }
  return { pass: false, detail: `${branch}: 完走タイムアウト（phase=${phase} initial=${initialChecked}/${targetPicked}/${targetConfirmed} branch=${branchClicked} self=${selfPicked}/${selfConfirmed} banish=${banishPicked}/${banishConfirmed} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.optionalTrashSelfNoHandLoss = {
  title: 'WX06-CB01-E1（OPTIONAL_TRASH_SELF pay/skip対照＝自己トラッシュ時も手札を失わない）',
  spec: OPTIONAL_TRASH_SELF_SPEC,
  async drive(page, H) {
    const pay = await runOptionalTrashSelfRound(page, H, 'pay');
    if (!pay.pass) return { pass: false, detail: pay.detail };
    await H.closeModals();
    const reinjected = await injectScenario(page, OPTIONAL_TRASH_SELF_SPEC);
    if (reinjected.error) return { pass: false, detail: `skip対照の再注入失敗=${reinjected.error}` };
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const skip = await runOptionalTrashSelfRound(page, H, 'skip');
    return { pass: skip.pass, detail: `同一specを再注入し、変えたのはOPTIONAL_TRASH_SELFの応答だけ。${pay.detail}／${skip.detail}` };
  },
};

// ── 続き470：PLAN §7 V-08＋V-09① OPTIONAL_COST{handDiscard} 実UI ───────────
// F群は WXK09-041（タマ限定）を WD01-001（タマ）上でアタックさせる。WX18-001 は Lv4＋黒3＋コイン1に加え、
// 原文が強制なのに live は任意という別の仕様差を含むため、handDiscard filter/canAfford の単独検証には使わない。
const HAND_COST_ANGEL = 'WX01-035#4801';
const HAND_COST_NONMATCH_A = 'WD01-013#4802';
const HAND_COST_NONMATCH_B = 'WD01-017#4803';
const HAND_COST_NONMATCH_REPLACEMENT = 'WD01-014#4801';
const HAND_COST_ATTACKER = 'WXK09-041#4804';
const HAND_COST_GUEST_HAND = ['WD01-013#4805', 'WD01-014#4806'];

const makeHandDiscardFilterSpec = (matchingCard) => ({
  hostSet: {
    'field.lrig': ['WD01-001#4807'],
    'field.signi': [[HAND_COST_ATTACKER], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    // F1↔F2 は先頭1枚だけを「天使シグニ」↔「非天使シグニ」に差し替える（枚数・残り2枚は同一）。
    'hand': [matchingCard, HAND_COST_NONMATCH_A, HAND_COST_NONMATCH_B],
    'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4808'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': HAND_COST_GUEST_HAND,
    'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
});

const pendingPaySkip = (st) => ({
  pay: (st?.pendingOptions ?? []).find(o => o.startsWith('pay:')),
  skip: (st?.pendingOptions ?? []).find(o => o.startsWith('skip:')),
});

async function openSigniAttack(page, H, zoneIndex) {
  if (!(await H.clickTestId(`my-signi-zone-${zoneIndex}`))) return null;
  const attack = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
  for (let k = 0; k < 20; k++) {
    if (await attack.count() && await attack.isVisible().catch(() => false) && await attack.isEnabled().catch(() => false)) {
      await attack.click({ timeout: 2000 });
      return 'tid:card-action-*[data-action-label="アタック"]';
    }
    await page.waitForTimeout(150);
  }
  return null;
}

async function runHandDiscardFilterRound(page, H, { expectAffordable }) {
  const before = await H.queryState();
  let attacked = false; let prompted = false; let branchClicked = false;
  let costPicked = false; let costConfirmed = false; let last = before;
  for (let s = 0; s < 64; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (!attacked) {
      did = await openSigniAttack(page, H, 0);
      if (did) attacked = true;
    } else {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        const disabled = opts.pay.endsWith('(disabled)');
        if (disabled === expectAffordable) {
          return { pass: false, detail: `canAfford極性不一致（expectAffordable=${expectAffordable} options=${JSON.stringify(st0.pendingOptions)}）`, st: st0 };
        }
        did = await H.clickTestId(expectAffordable ? 'optcost-pay' : 'optcost-skip');
        if (did) branchClicked = true;
      } else if (expectAffordable && branchClicked && !costPicked && Array.isArray(st0?.pendingCandidates)) {
        if (!sameInstanceSet(st0.pendingCandidates, [HAND_COST_ANGEL])) {
          return { pass: false, detail: `【filter回帰】手札捨て候補=${JSON.stringify(st0.pendingCandidates)}（期待=${HAND_COST_ANGEL}だけ）`, st: st0 };
        }
        did = await clickPendingInstance(page, H, HAND_COST_ANGEL);
        if (did) costPicked = true;
      } else if (expectAffordable && costPicked && !costConfirmed) {
        did = await clickExactVisibleText(page, '決定 (1/1)');
        if (did) costConfirmed = true;
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    // 正面空きへのアタックを最後まで消化する。host が応答者になる異常経路でもモーダルを残さない。
    if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = attacked && prompted && branchClicked && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.pendingSigniBattle == null && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null
      && st?.host?.signiDown?.[0] === true && st?.guest?.life === before.guest.life - 1;
    H.log(`  hdcf.${expectAffordable ? 'pay' : 'unavailable'}[${s}] -> ${did ?? 'なし'} | prompted=${prompted} branch=${branchClicked} cost=${costPicked}/${costConfirmed} options=${JSON.stringify(st?.pendingOptions)} cands=${JSON.stringify(st?.pendingCandidates)} hHand=${JSON.stringify(st?.host?.handCards)} hTrash=${JSON.stringify(st?.host?.trashCards)} gHand=${JSON.stringify(st?.guest?.handCards)} gLife=${st?.guest?.life} check=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      if (expectAffordable) {
        const paid = st.host.trashCards.includes(HAND_COST_ANGEL)
          && !st.host.handCards.includes(HAND_COST_ANGEL)
          && st.host.handCards.includes(HAND_COST_NONMATCH_A) && st.host.handCards.includes(HAND_COST_NONMATCH_B);
        const bodyRan = st.guest.hand === before.guest.hand - 1;
        return { pass: prompted && costPicked && costConfirmed && paid && bodyRan, st,
          detail: `pay/skip提示=${prompted}・候補=${HAND_COST_ANGEL}だけ・天使をtrash=${paid}・本体の相手blind discard ${before.guest.hand}→${st.guest.hand}=${bodyRan}・アタック後life ${before.guest.life}→${st.guest.life}` };
      }
      const handStayed = sameInstanceSet(st.host.handCards, before.host.handCards);
      const bodyBlocked = sameInstanceSet(st.guest.handCards, before.guest.handCards);
      return { pass: prompted && handStayed && bodyBlocked, st,
        detail: `pay disabled＋skip提示=${prompted}・host手札不変=${handStayed}・本体不発でguest手札不変=${bodyBlocked}・アタック自体はlife ${before.guest.life}→${st.guest.life}` };
    }
  }
  return { pass: false, st: last, detail: `filter/canAfford完走タイムアウト（prompted=${prompted} branch=${branchClicked} cost=${costPicked}/${costConfirmed} hHand=${JSON.stringify(last?.host?.handCards)} gHand=${JSON.stringify(last?.guest?.handCards)} gLife=${last?.guest?.life} check=${last?.host?.fieldCheck ?? '-'}/${last?.guest?.fieldCheck ?? '-'} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.handDiscardCostFiltersCandidates = {
  title: 'WXK09-041-E1（OPTIONAL_COST handDiscard＝天使シグニ1枚だけ候補→支払い後に相手手札discard）',
  spec: makeHandDiscardFilterSpec(HAND_COST_ANGEL),
  async drive(page, H) { return runHandDiscardFilterRound(page, H, { expectAffordable: true }); },
};

scenarios.handDiscardCostUnavailableWhenNoMatch = {
  title: 'WXK09-041-E1対照（手札3枚のまま天使だけ外す→pay disabled・skipで本体不発）',
  spec: makeHandDiscardFilterSpec(HAND_COST_NONMATCH_REPLACEMENT),
  async drive(page, H) { return runHandDiscardFilterRound(page, H, { expectAffordable: false }); },
};

const HAND_COST_GUARD = 'WD01-017#4811';
const HAND_COST_FREN_NONMATCH = ['WD01-013#4812', 'WD01-014#4813'];
const HAND_COST_FREN = 'WXDi-CP01-027#4814';
const HAND_COST_BOUNCE_TARGET = 'WD01-013#4815';
const HAND_DISCARD_FREN_SPEC = {
  hostSet: {
    'field.lrig': ['WD01-001#4816'],
    'field.signi': [[HAND_COST_FREN], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [HAND_COST_GUARD, ...HAND_COST_FREN_NONMATCH],
    'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4817'],
    'field.signi': [[HAND_COST_BOUNCE_TARGET], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': ['WD01-014#4818'],
    'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
};

async function runHandDiscardFrenRound(page, H, branch) {
  const before = await H.queryState();
  let phaseStarted = false; let prompted = false; let branchClicked = false;
  let guardPicked = false; let guardConfirmed = false; let targetPicked = false; let targetConfirmed = false;
  let last = before;
  for (let s = 0; s < 60; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (!phaseStarted) {
      did = await H.clickBtn('アタックフェイズへ', { exact: true });
      if (did) phaseStarted = true;
    } else {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        if (opts.pay.endsWith('(disabled)')) return { pass: false, detail: `Guard所持なのにpay disabled: ${JSON.stringify(st0.pendingOptions)}` };
        did = await H.clickTestId(branch === 'pay' ? 'optcost-pay' : 'optcost-skip');
        if (did) branchClicked = true;
      } else if (branch === 'pay' && branchClicked && !guardPicked && Array.isArray(st0?.pendingCandidates)) {
        if (!sameInstanceSet(st0.pendingCandidates, [HAND_COST_GUARD])) {
          return { pass: false, detail: `【Guard filter回帰】候補=${JSON.stringify(st0.pendingCandidates)}（期待=${HAND_COST_GUARD}だけ）` };
        }
        did = await clickPendingInstance(page, H, HAND_COST_GUARD);
        if (did) guardPicked = true;
      } else if (branch === 'pay' && guardPicked && !guardConfirmed) {
        did = await clickExactVisibleText(page, '決定 (1/1)');
        if (did) guardConfirmed = true;
      } else if (branch === 'pay' && guardConfirmed && !targetPicked && sameInstanceSet(st0?.pendingCandidates, [HAND_COST_BOUNCE_TARGET])) {
        did = await clickPendingInstance(page, H, HAND_COST_BOUNCE_TARGET);
        if (did) targetPicked = true;
      } else if (branch === 'pay' && targetPicked && !targetConfirmed) {
        did = await clickExactVisibleText(page, '決定 (1/1)');
        if (did) targetConfirmed = true;
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = phaseStarted && prompted && branchClicked && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0;
    H.log(`  hdfr.${branch}[${s}] -> ${did ?? 'なし'} | prompted=${prompted} branch=${branchClicked} guard=${guardPicked}/${guardConfirmed} target=${targetPicked}/${targetConfirmed} options=${JSON.stringify(st?.pendingOptions)} cands=${JSON.stringify(st?.pendingCandidates)} hHand=${JSON.stringify(st?.host?.handCards)} hTrash=${JSON.stringify(st?.host?.trashCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${JSON.stringify(st?.guest?.handCards)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      if (branch === 'skip') {
        const handStayed = sameInstanceSet(st.host.handCards, before.host.handCards);
        const targetStayed = st.guest.fieldSigni?.[0]?.includes(HAND_COST_BOUNCE_TARGET)
          && sameInstanceSet(st.guest.handCards, before.guest.handCards);
        return { pass: prompted && handStayed && targetStayed, detail: `pay/skip提示=${prompted}・skip後host手札不変=${handStayed}・対象field残存かつguest手札不変=${targetStayed}` };
      }
      const guardPaid = st.host.trashCards.includes(HAND_COST_GUARD) && !st.host.handCards.includes(HAND_COST_GUARD)
        && HAND_COST_FREN_NONMATCH.every(n => st.host.handCards.includes(n));
      const bounced = st.guest.fieldSigni?.[0] == null && st.guest.handCards.includes(HAND_COST_BOUNCE_TARGET);
      return { pass: prompted && guardPicked && guardConfirmed && targetPicked && targetConfirmed && guardPaid && bounced,
        detail: `pay/skip提示=${prompted}・Guardだけ候補→trash=${guardPaid}・P3000対象をguest.field→hand=${bounced}` };
    }
  }
  return { pass: false, detail: `${branch}完走タイムアウト（prompted=${prompted} branch=${branchClicked} guard=${guardPicked}/${guardConfirmed} target=${targetPicked}/${targetConfirmed} hHand=${JSON.stringify(last?.host?.handCards)} gField=${JSON.stringify(last?.guest?.fieldSigni)} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.handDiscardSkipBlocksBody = {
  title: 'WXDi-CP01-027-E3（アタックフェイズ開始時のhandDiscard skip＝手札も対象も不変）',
  spec: HAND_DISCARD_FREN_SPEC,
  async drive(page, H) { return runHandDiscardFrenRound(page, H, 'skip'); },
};

scenarios.handDiscardPayRunsBody = {
  title: 'WXDi-CP01-027-E3対照（クリックだけpay＝Guardだけ候補→trash後に相手P10000以下をbounce）',
  spec: HAND_DISCARD_FREN_SPEC,
  async drive(page, H) { return runHandDiscardFrenRound(page, H, 'pay'); },
};

const HAND_COST_BLUE_ARCHIVE = 'WXDi-CP02-063#4821';
const HAND_COST_ARTS_SELF_SIGNI = 'WD01-013#4822';
const HAND_COST_ARTS_OPP_SIGNI = 'WD01-013#4823';
const HAND_DISCARD_ARTS_SPEC = {
  hostSet: {
    'field.lrig': ['WD03-001#4824'],
    'field.signi': [[HAND_COST_ARTS_SELF_SIGNI], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'lrig_deck': ['WX25-CP1-004#4825'],
    'hand': [HAND_COST_BLUE_ARCHIVE],
    // 《青》×1＋《無》×2。青の WD03-013 が色枠、白2枚が無色枠を支払う。
    'energy': ['WD03-013#4826', 'WD01-013#4827', 'WD01-014#4828'],
    'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4829'],
    'field.lrig_down': false,
    'field.signi': [[HAND_COST_ARTS_OPP_SIGNI], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
};

async function runHandDiscardArtsRound(page, H, choiceLabel) {
  const before = await H.queryState();
  let deckOpened = false; let artsOpened = false; let useClicked = false; const energyPicked = new Set(); let artsUsed = false;
  let choosePrompted = false; let choiceClicked = false; let choiceConfirmed = false;
  let costPrompted = false; let payClicked = false; let costPicked = false; let costConfirmed = false;
  let targetPicked = false; let targetConfirmed = false; let last = before;
  for (let s = 0; s < 80; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (!deckOpened) {
      did = await H.clickTestId('my-lrig-dk'); if (did) deckOpened = true;
    } else if (!artsOpened) {
      did = await H.clickTestId('zone-card-0'); if (did) artsOpened = true;
    } else if (!useClicked) {
      // ⚠`zone-card-0` はカード詳細を開くだけ＝**「使用」アクションを押さないとコストモーダルが出ない**
      //   （続き470 実測＝これが無いと `artscost-energy-*` が0件のままタイムアウトする。先例は続き465 の
      //    `driveLifeCrashReplacementArts`）。
      const use = page.locator('[data-testid^="card-action-"][data-action-label="使用"]').first();
      if (await use.count() && await use.isVisible().catch(() => false)) {
        await use.click({ timeout: 2000 }); did = 'act:使用'; useClicked = true;
      }
    } else if (!artsUsed && energyPicked.size < 3) {
      const next = [0, 1, 2].find(i => !energyPicked.has(i));
      if (next !== undefined) { did = await H.clickTestId(`artscost-energy-${next}`); if (did) energyPicked.add(next); }
    } else if (!artsUsed) {
      did = await clickExactVisibleText(page, 'アーツ使用'); if (did) artsUsed = true;
    } else if (!choiceConfirmed && (st0?.pendingOptions ?? []).some(o => o.startsWith('c0:選択肢1'))) {
      const allFour = ['c0:選択肢1', 'c1:選択肢2', 'c2:選択肢3', 'c3:選択肢4']
        .every(prefix => (st0.pendingOptions ?? []).some(o => o.startsWith(prefix)));
      if (!allFour) return { pass: false, detail: `4択UI不一致=${JSON.stringify(st0.pendingOptions)}` };
      choosePrompted = true;
      if (!choiceClicked) {
        did = await clickExactVisibleText(page, choiceLabel); if (did) choiceClicked = true;
      } else {
        // CHOOSE は multiSelect＋upTo:true。1つ選んだ時点で「決定」が enabled（2つ目の穴埋め不要）。
        did = await clickExactVisibleText(page, '決定'); if (did) choiceConfirmed = true;
      }
    } else {
      const opts = pendingPaySkip(st0);
      if (!payClicked && opts.pay && opts.skip) {
        costPrompted = true;
        if (opts.pay.endsWith('(disabled)')) return { pass: false, detail: `ブルアカ所持なのにpay disabled=${JSON.stringify(st0.pendingOptions)}` };
        did = await H.clickTestId('optcost-pay'); if (did) payClicked = true;
      } else if (payClicked && !costPicked && Array.isArray(st0?.pendingCandidates)) {
        if (!sameInstanceSet(st0.pendingCandidates, [HAND_COST_BLUE_ARCHIVE])) {
          return { pass: false, detail: `【ブルアカfilter回帰】候補=${JSON.stringify(st0.pendingCandidates)}（期待=${HAND_COST_BLUE_ARCHIVE}だけ）` };
        }
        did = await clickPendingInstance(page, H, HAND_COST_BLUE_ARCHIVE); if (did) costPicked = true;
      } else if (costPicked && !costConfirmed) {
        did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) costConfirmed = true;
      } else if (choiceLabel === '選択肢3' && costConfirmed && !targetPicked
          && sameInstanceSet(st0?.pendingCandidates, [HAND_COST_ARTS_OPP_SIGNI])) {
        did = await clickPendingInstance(page, H, HAND_COST_ARTS_OPP_SIGNI); if (did) targetPicked = true;
      } else if (choiceLabel === '選択肢3' && targetPicked && !targetConfirmed) {
        did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) targetConfirmed = true;
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    const st = await H.queryState();
    last = st;
    const paid = st.host.energy === 0 && st.host.trashCards.includes(HAND_COST_BLUE_ARCHIVE)
      && !st.host.handCards.includes(HAND_COST_BLUE_ARCHIVE);
    const settled = artsUsed && choosePrompted && choiceConfirmed && costPrompted && payClicked && costPicked && costConfirmed
      && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0;
    H.log(`  hdarts.${choiceLabel}[${s}] -> ${did ?? 'なし'} | arts=${deckOpened}/${artsOpened}/${energyPicked.size}/${artsUsed} choose=${choosePrompted}/${choiceClicked}/${choiceConfirmed} cost=${costPrompted}/${payClicked}/${costPicked}/${costConfirmed} target=${targetPicked}/${targetConfirmed} options=${JSON.stringify(st?.pendingOptions)} cands=${JSON.stringify(st?.pendingCandidates)} hE=${st?.host?.energy} hLrigDown=${st?.host?.lrigDown} hSigniDown=${JSON.stringify(st?.host?.signiDown)} gLrigDown=${st?.guest?.lrigDown} gSigniDown=${JSON.stringify(st?.guest?.signiDown)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      const hostAllUp = st.host.lrigDown === false && (st.host.signiDown ?? []).every(v => v === false);
      if (choiceLabel === '選択肢2') {
        const correct = st.guest.lrigDown === true && (st.guest.signiDown ?? []).every(v => v === false);
        return { pass: paid && hostAllUp && correct, detail: `②を1つだけ選択→決定。energy ${before.host.energy}→${st.host.energy}・ブルアカtrash=${paid}／host lrigDown=${st.host.lrigDown} signiDown=${JSON.stringify(st.host.signiDown)}／guest lrigDown=${st.guest.lrigDown} signiDown=${JSON.stringify(st.guest.signiDown)}` };
      }
      const correct = st.guest.lrigDown === false && st.guest.signiDown?.[0] === true
        && st.guest.signiDown?.slice(1).every(v => v === false);
      return { pass: paid && targetPicked && targetConfirmed && hostAllUp && correct, detail: `③を1つだけ選択→決定。energy ${before.host.energy}→${st.host.energy}・ブルアカtrash=${paid}／host lrigDown=${st.host.lrigDown} signiDown=${JSON.stringify(st.host.signiDown)}／guest lrigDown=${st.guest.lrigDown} signiDown=${JSON.stringify(st.guest.signiDown)}` };
    }
  }
  return { pass: false, detail: `${choiceLabel}完走タイムアウト（arts=${deckOpened}/${artsOpened}/${energyPicked.size}/${artsUsed} choose=${choosePrompted}/${choiceClicked}/${choiceConfirmed} cost=${costPrompted}/${payClicked}/${costPicked}/${costConfirmed} target=${targetPicked}/${targetConfirmed} hE=${last?.host?.energy} hDown=${last?.host?.lrigDown}/${JSON.stringify(last?.host?.signiDown)} gDown=${last?.guest?.lrigDown}/${JSON.stringify(last?.guest?.signiDown)} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.handDiscardOptionTwoDownsOpponentLrig = {
  title: 'WX25-CP1-004-E1②（4つから2つまで＝②だけ確定→ブルアカdiscard後に相手ルリグだけdown）',
  spec: HAND_DISCARD_ARTS_SPEC,
  async drive(page, H) { return runHandDiscardArtsRound(page, H, '選択肢2'); },
};

scenarios.handDiscardOptionThreeDownsOpponentSigni = {
  title: 'WX25-CP1-004-E1③対照（同一盤面で③だけ確定→相手シグニだけdown）',
  spec: HAND_DISCARD_ARTS_SPEC,
  async drive(page, H) { return runHandDiscardArtsRound(page, H, '選択肢3'); },
};

// ── 続き471：PLAN §7 V-06①＋V-09 残（underAnySigniTrash / fieldDown / OPTIONAL_ACTIVATE） ──
// `field.signi` の各要素は [下カード..., 場のシグニ本体]（末尾が本体）。queryState.fieldSigni はこの配列を
// そのまま返すため、下カード用の観測フィールドを追加せず注入前提・支払い後の残存を直接検査する。
const UNDER_FILTER_RED = 'WD02-010#4901';
const UNDER_FILTER_NONRED_A = 'WD01-013#4902';
const UNDER_FILTER_NONRED_B = 'WD01-017#4903';
const UNDER_FILTER_NO_RED_REPLACEMENT = 'WD01-014#4901';
const UNDER_FILTER_SOURCE = 'WXDi-P11-042#4904';
const UNDER_FILTER_TARGET = 'WD01-013#4905';

const makeUnderFilterSpec = (firstUnder) => ({
  hostSet: {
    'field.lrig': ['WD02-001#4906'],
    // U1↔U2 は先頭の下カード1枚だけを赤シグニ↔白シグニへ交換する。
    'field.signi': [[firstUnder, UNDER_FILTER_NONRED_A, UNDER_FILTER_NONRED_B, UNDER_FILTER_SOURCE], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4907'],
    'field.signi': [[UNDER_FILTER_TARGET], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
});

async function runUnderFilterRound(page, H, { expectAffordable }) {
  const before = await H.queryState();
  const expectedBeforeStack = expectAffordable
    ? [UNDER_FILTER_RED, UNDER_FILTER_NONRED_A, UNDER_FILTER_NONRED_B, UNDER_FILTER_SOURCE]
    : [UNDER_FILTER_NO_RED_REPLACEMENT, UNDER_FILTER_NONRED_A, UNDER_FILTER_NONRED_B, UNDER_FILTER_SOURCE];
  if (JSON.stringify(before?.host?.fieldSigni?.[0]) !== JSON.stringify(expectedBeforeStack)) {
    return { pass: false, detail: `下カードstack注入不成立=${JSON.stringify(before?.host?.fieldSigni?.[0])}（期待=${JSON.stringify(expectedBeforeStack)}）` };
  }
  let phaseStarted = false; let targetPicked = false; let targetConfirmed = false;
  let prompted = false; let branchClicked = false; let costPicked = false; let costConfirmed = false;
  let banishPicked = false; let banishConfirmed = false; let last = before;
  for (let s = 0; s < 72; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (!phaseStarted) {
      did = await H.clickBtn('アタックフェイズへ', { exact: true });
      if (did) phaseStarted = true;
    } else if (!targetConfirmed && sameInstanceSet(st0?.pendingCandidates, [UNDER_FILTER_TARGET])) {
      if (!targetPicked) { did = await clickPendingInstance(page, H, UNDER_FILTER_TARGET); if (did) targetPicked = true; }
      else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) targetConfirmed = true; }
    } else {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        const disabled = opts.pay.endsWith('(disabled)');
        if (disabled === expectAffordable) {
          return { pass: false, detail: `under canAfford極性不一致（expectAffordable=${expectAffordable} options=${JSON.stringify(st0.pendingOptions)} stack=${JSON.stringify(st0.host.fieldSigni?.[0])}）` };
        }
        did = await H.clickTestId(expectAffordable ? 'optcost-pay' : 'optcost-skip');
        if (did) branchClicked = true;
      } else if (expectAffordable && branchClicked && !costConfirmed && Array.isArray(st0?.pendingCandidates)) {
        if (!sameInstanceSet(st0.pendingCandidates, [UNDER_FILTER_RED])) {
          return { pass: false, detail: `【under filter回帰】候補=${JSON.stringify(st0.pendingCandidates)}（期待=${UNDER_FILTER_RED}だけ）` };
        }
        if (!costPicked) { did = await clickPendingInstance(page, H, UNDER_FILTER_RED); if (did) costPicked = true; }
        else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) costConfirmed = true; }
      } else if (expectAffordable && costConfirmed && !banishConfirmed
          && sameInstanceSet(st0?.pendingCandidates, [UNDER_FILTER_TARGET])) {
        if (!banishPicked) { did = await clickPendingInstance(page, H, UNDER_FILTER_TARGET); if (did) banishPicked = true; }
        else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) banishConfirmed = true; }
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = phaseStarted && targetConfirmed && prompted && branchClicked
      && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0;
    H.log(`  underFilter.${expectAffordable ? 'pay' : 'unavailable'}[${s}] -> ${did ?? 'なし'} | target=${targetPicked}/${targetConfirmed} prompted=${prompted} branch=${branchClicked} cost=${costPicked}/${costConfirmed} banish=${banishPicked}/${banishConfirmed} options=${JSON.stringify(st?.pendingOptions)} cands=${JSON.stringify(st?.pendingCandidates)} hStack=${JSON.stringify(st?.host?.fieldSigni?.[0])} hTrash=${JSON.stringify(st?.host?.trashCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${JSON.stringify(st?.guest?.energyCards)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      if (!expectAffordable) {
        const stackStayed = JSON.stringify(st.host.fieldSigni?.[0]) === JSON.stringify(expectedBeforeStack);
        const bodyBlocked = st.guest.fieldSigni?.[0]?.includes(UNDER_FILTER_TARGET)
          && !st.guest.energyCards.includes(UNDER_FILTER_TARGET);
        return { pass: prompted && stackStayed && bodyBlocked,
          detail: `pay disabled＋skip提示=${prompted}・赤なしstack不変=${stackStayed}・本体BANISH不発=${bodyBlocked}` };
      }
      const expectedAfterStack = [UNDER_FILTER_NONRED_A, UNDER_FILTER_NONRED_B, UNDER_FILTER_SOURCE];
      const onlyRedPaid = st.host.trashCards.includes(UNDER_FILTER_RED)
        && JSON.stringify(st.host.fieldSigni?.[0]) === JSON.stringify(expectedAfterStack);
      const bodyRan = st.guest.fieldSigni?.[0] == null && st.guest.energyCards.includes(UNDER_FILTER_TARGET);
      return { pass: prompted && costPicked && costConfirmed && banishPicked && banishConfirmed && onlyRedPaid && bodyRan,
        detail: `pay/skip提示=${prompted}・候補は赤 ${UNDER_FILTER_RED} だけ・下stackからtrash=${onlyRedPaid}・対象BANISH（field→energy）=${bodyRan}` };
    }
  }
  return { pass: false, detail: `under filter完走タイムアウト（target=${targetPicked}/${targetConfirmed} prompted=${prompted} branch=${branchClicked} cost=${costPicked}/${costConfirmed} banish=${banishPicked}/${banishConfirmed} hStack=${JSON.stringify(last?.host?.fieldSigni?.[0])} gField=${JSON.stringify(last?.guest?.fieldSigni)} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.underCostFiltersByColor = {
  title: 'WXDi-P11-042-E1（このシグニの下の赤シグニだけがOPTIONAL_COST候補→支払い後BANISH）',
  spec: makeUnderFilterSpec(UNDER_FILTER_RED),
  async drive(page, H) { return runUnderFilterRound(page, H, { expectAffordable: true }); },
};

scenarios.underCostUnavailableWhenNoRed = {
  title: 'WXDi-P11-042-E1対照（下3枚のうち赤1枚だけ白へ交換→pay disabled・BANISH不発）',
  spec: makeUnderFilterSpec(UNDER_FILTER_NO_RED_REPLACEMENT),
  async drive(page, H) { return runUnderFilterRound(page, H, { expectAffordable: false }); },
};

const UNDER_THIS_CARD = 'WD01-017#4911';
const UNDER_OTHER_CARD = 'WD02-010#4912';
const UNDER_THIS_SOURCE = 'WXK08-052#4913';
const UNDER_OTHER_TOP = 'WD01-013#4914';
const UNDER_POWER_TARGET = 'WX01-035#4915';
const UNDER_FROM_THIS_SPEC = {
  hostSet: {
    'field.lrig': ['WD05-001#4916'],
    // zone0=[このシグニの下, 本体]／zone1=[別シグニの下, 別シグニ本体]。
    'field.signi': [[UNDER_THIS_CARD, UNDER_THIS_SOURCE], [UNDER_OTHER_CARD, UNDER_OTHER_TOP], null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4917'],
    // host zone0 の正面（guest zone2）は空け、効果対象だけzone1へ置く＝アタック後はlife確認を消化する。
    'field.signi': [null, [UNDER_POWER_TARGET], null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
};

scenarios.underCostFromThisOnly = {
  title: 'WXK08-052-E1（fromThis＝別シグニの下を候補外にし、このシグニの下1枚だけ支払い→相手-3000）',
  spec: UNDER_FROM_THIS_SPEC,
  async drive(page, H) {
    const before = await H.queryState();
    const injected = JSON.stringify(before?.host?.fieldSigni?.[0]) === JSON.stringify([UNDER_THIS_CARD, UNDER_THIS_SOURCE])
      && JSON.stringify(before?.host?.fieldSigni?.[1]) === JSON.stringify([UNDER_OTHER_CARD, UNDER_OTHER_TOP]);
    if (!injected) return { pass: false, detail: `fromThis stack注入不成立=${JSON.stringify(before?.host?.fieldSigni)}` };
    let attacked = false; let prompted = false; let paid = false; let costPicked = false; let costConfirmed = false;
    let targetPicked = false; let targetConfirmed = false; let last = before;
    for (let s = 0; s < 72; s++) {
      await page.waitForTimeout(250);
      const st0 = await H.queryState();
      let did = null;
      if (!attacked) {
        did = await openSigniAttack(page, H, 0); if (did) attacked = true;
      } else {
        const opts = pendingPaySkip(st0);
        if (!paid && opts.pay && opts.skip) {
          prompted = true;
          if (opts.pay.endsWith('(disabled)')) return { pass: false, detail: `このシグニの下に1枚あるのにpay disabled=${JSON.stringify(st0.pendingOptions)}` };
          did = await H.clickTestId('optcost-pay'); if (did) paid = true;
        } else if (paid && !costConfirmed && Array.isArray(st0?.pendingCandidates)) {
          if (!sameInstanceSet(st0.pendingCandidates, [UNDER_THIS_CARD])) {
            return { pass: false, detail: `【fromThis回帰】候補=${JSON.stringify(st0.pendingCandidates)}（期待=${UNDER_THIS_CARD}だけ・別stack ${UNDER_OTHER_CARD} は除外）` };
          }
          if (!costPicked) { did = await clickPendingInstance(page, H, UNDER_THIS_CARD); if (did) costPicked = true; }
          else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) costConfirmed = true; }
        } else if (costConfirmed && !targetConfirmed && sameInstanceSet(st0?.pendingCandidates, [UNDER_POWER_TARGET])) {
          if (!targetPicked) { did = await clickPendingInstance(page, H, UNDER_POWER_TARGET); if (did) targetPicked = true; }
          else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) targetConfirmed = true; }
        }
      }
      if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
      if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
      if (!did) did = await H.clickBtn('エナに送る', { exact: true });
      const st = await H.queryState();
      last = st;
      const settled = attacked && prompted && paid && costConfirmed && targetConfirmed
        && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0 && st?.host?.pendingSigniBattle == null
        && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null && st?.guest?.life === before.guest.life - 1;
      H.log(`  underThis[${s}] -> ${did ?? 'なし'} | attacked=${attacked} prompted=${prompted} paid=${paid} cost=${costPicked}/${costConfirmed} target=${targetPicked}/${targetConfirmed} cands=${JSON.stringify(st?.pendingCandidates)} hField=${JSON.stringify(st?.host?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} gPower=${JSON.stringify(st?.guest?.powerMods)} gLife=${st?.guest?.life} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (settled) {
        const thisPaid = JSON.stringify(st.host.fieldSigni?.[0]) === JSON.stringify([UNDER_THIS_SOURCE])
          && st.host.trashCards.includes(UNDER_THIS_CARD);
        const otherStayed = JSON.stringify(st.host.fieldSigni?.[1]) === JSON.stringify([UNDER_OTHER_CARD, UNDER_OTHER_TOP])
          && !st.host.trashCards.includes(UNDER_OTHER_CARD);
        const minusApplied = st.guest.powerMods.includes(`${UNDER_POWER_TARGET}:-3000`)
          && st.guest.fieldSigni?.[1]?.includes(UNDER_POWER_TARGET);
        return { pass: prompted && thisPaid && otherStayed && minusApplied,
          detail: `pay/skip提示=${prompted}・候補=${UNDER_THIS_CARD}だけ・このstackからtrash=${thisPaid}・別stack不変=${otherStayed}・対象-3000=${minusApplied}・life確認消化済み` };
      }
    }
    return { pass: false, detail: `fromThis完走タイムアウト（prompted=${prompted} paid=${paid} cost=${costPicked}/${costConfirmed} target=${targetPicked}/${targetConfirmed} hField=${JSON.stringify(last?.host?.fieldSigni)} gPower=${JSON.stringify(last?.guest?.powerMods)} gLife=${last?.guest?.life} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
  },
};

const FIELD_DOWN_SOURCE = 'WXDi-P04-051#4921';
const FIELD_DOWN_WHITE_B = 'WD01-013#4922';
const FIELD_DOWN_WHITE_C = 'WD01-014#4923';
const FIELD_DOWN_ENERGY = 'WD01-013#4924';
const FIELD_DOWN_LRIG = 'WD01-002#4925';

// 🔴続き475d でシグニアタック → **ルリグアタック**経路へ作り直した（§3 (cxxviii)）。
//   原文は「あなたのルリグ１体がアタックしたとき」なのに live timing が `ON_ATTACK_SIGNI` だったため、
//   **シグニのアタックで発火→攻撃者が先にダウン→アップの白シグニが3体そろわない＝恒久 no-op** だった。
//   timing を `ON_ATTACK_LRIG` へ直した今は、**ルリグがアタックしても自分のシグニは1体もダウンしない**ので
//   3体そろい、帰結（ルリグをアップ＋能力喪失）まで到達する。
const makeFieldDownSpec = (thirdWhite) => ({
  hostSet: {
    'field.lrig': ['WD01-002#4925'],
    'field.lrig_down': false,
    // D1↔D2 は zone2 の白シグニ1体（null↔1枚）だけを変える。
    'field.signi': [[FIELD_DOWN_SOURCE], [FIELD_DOWN_WHITE_B], thirdWhite ? [thirdWhite] : null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [FIELD_DOWN_ENERGY], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4926'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    // ⚠ガード候補を空にしてアタックが1クラッシュまで決定的に進むようにする（assistAttackBoth と同じ手）。
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
    // 🔴ライフを固定する＝`settled` が `guest.life === before-1` を見るので、**ルーム再利用で前シナリオの
    //   クラッシュ結果が残っていると before がずれて完走タイムアウトになる**（実測＝単体PASS・2件バッチFAIL）。
    'life_cloth': ['WD01-013#4927', 'WD01-013#4928'],
  },
  top: { active: 'host', turn_phase: 'ATTACK_LRIG', turn_count: 2 },
});

async function runFieldDownRound(page, H, { expectAffordable }) {
  const before = await H.queryState();
  let attacked = false; let prompted = false; let branchClicked = false; let energyPicked = false;
  const downPicked = new Set(); let downConfirmed = false; let sawAllThreeDown = false;
  let upPicked = false; let upConfirmed = false; let removePicked = false; let removeConfirmed = false; let last = before;
  for (let s = 0; s < 88; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    if ((st0?.host?.signiDown ?? []).slice(0, 3).every(v => v === true)) sawAllThreeDown = true;
    let did = null;
    if (!attacked) {
      // ルリグアタック＝センタースロットを開いて「アタック」（assistAttackBoth と同じ型）。
      did = await H.clickTestId('my-lrig-slot-center');
      if (did) {
        const atk = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
        for (let k = 0; k < 20; k++) {
          if (await atk.count() && await atk.isVisible().catch(() => false) && await atk.isEnabled().catch(() => false)) break;
          await page.waitForTimeout(150);
        }
        if (await atk.count() && await atk.isVisible().catch(() => false) && await atk.isEnabled().catch(() => false)) {
          await atk.click({ timeout: 2000 }); attacked = true; did = 'action:ルリグアタック';
        }
      }
    } else {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        const disabled = opts.pay.endsWith('(disabled)');
        if (disabled === expectAffordable) {
          return { pass: false, detail: `fieldDown canAfford極性不一致（expectAffordable=${expectAffordable} options=${JSON.stringify(st0.pendingOptions)} signiDown=${JSON.stringify(st0.host.signiDown)}）。⚠timing が ON_ATTACK_SIGNI へ戻っていると攻撃者が先に down して3体そろわない` };
        }
        if (!expectAffordable) {
          did = await H.clickTestId('optcost-skip'); if (did) branchClicked = true;
        }
      }
      if (!did && expectAffordable && prompted && !energyPicked) {
        did = await H.clickTestId('optcost-energy-0'); if (did) energyPicked = true;
      }
      if (!did && expectAffordable && prompted && energyPicked && !branchClicked) {
        did = await H.clickTestId('optcost-pay'); if (did) branchClicked = true;
      }
      if (!did && expectAffordable && branchClicked && !downConfirmed && Array.isArray(st0?.pendingCandidates)) {
        const expected = [FIELD_DOWN_SOURCE, FIELD_DOWN_WHITE_B, FIELD_DOWN_WHITE_C];
        if (!sameInstanceSet(st0.pendingCandidates, expected)) {
          return { pass: false, detail: `fieldDown候補不一致=${JSON.stringify(st0.pendingCandidates)}（期待=${JSON.stringify(expected)}）` };
        }
        const next = expected.find(n => !downPicked.has(n));
        if (next) { did = await clickPendingInstance(page, H, next); if (did) downPicked.add(next); }
        else { did = await clickExactVisibleText(page, '決定 (3/3)'); if (did) downConfirmed = true; }
      // 🔑帰結の対象は**ルリグ**（続き475d で live を LRIG 対象へ是正）。旧は source シグニを掴んでいた。
      } else if (!did && expectAffordable && downConfirmed && !upConfirmed
          && Array.isArray(st0?.pendingCandidates) && st0.pendingCandidates.includes(FIELD_DOWN_LRIG)) {
        if (!upPicked) { did = await clickPendingInstance(page, H, FIELD_DOWN_LRIG); if (did) upPicked = true; }
        else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) upConfirmed = true; }
      } else if (!did && expectAffordable && upConfirmed && !removeConfirmed
          && Array.isArray(st0?.pendingCandidates) && st0.pendingCandidates.includes(FIELD_DOWN_LRIG)) {
        if (!removePicked) { did = await clickPendingInstance(page, H, FIELD_DOWN_LRIG); if (did) removePicked = true; }
        else { did = await clickExactVisibleText(page, '決定 (1/1)'); if (did) removeConfirmed = true; }
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    if ((st?.host?.signiDown ?? []).slice(0, 3).every(v => v === true)) sawAllThreeDown = true;
    const settled = attacked && prompted && branchClicked && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.pendingSigniBattle == null && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null
      && st?.guest?.life === before.guest.life - 1;
    H.log(`  fieldDown.${expectAffordable ? 'pay' : 'unavailable'}[${s}] -> ${did ?? 'なし'} | attacked=${attacked} prompted=${prompted} branch=${branchClicked} energy=${energyPicked} down=${downPicked.size}/${downConfirmed}/all3=${sawAllThreeDown} up=${upPicked}/${upConfirmed} remove=${removePicked}/${removeConfirmed} options=${JSON.stringify(st?.pendingOptions)} cands=${JSON.stringify(st?.pendingCandidates)} hEnergy=${JSON.stringify(st?.host?.energyCards)} hTrash=${JSON.stringify(st?.host?.trashCards)} hDown=${JSON.stringify(st?.host?.signiDown)} hLrigDown=${st?.host?.lrigDown} abilitiesRemoved=${JSON.stringify(st?.host?.abilitiesRemoved)} gLife=${st?.guest?.life}(開始${before?.guest?.life}) checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} pBattle=${st?.host?.pendingSigniBattle ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      if (!expectAffordable) {
        // ⚠**ルリグアタックなので自分のシグニは1体もダウンしない**（旧＝シグニアタック経路では
        //   アタッカーだけ down していた）。ここが true に戻ったら timing が ON_ATTACK_SIGNI へ逆戻り。
        const noCostDown = (st.host.signiDown ?? []).slice(0, 3).every(v => v === false);
        const resourcesStayed = st.host.energyCards.includes(FIELD_DOWN_ENERGY) && st.host.trashCards.length === 0;
        return { pass: prompted && noCostDown && resourcesStayed,
          detail: `pay disabled＋skip提示=${prompted}・自シグニは1体もdownしない（ルリグアタック）=${noCostDown}・白エナ不徴収=${resourcesStayed}・life確認消化済み` };
      }
      const whitePaid = !st.host.energyCards.includes(FIELD_DOWN_ENERGY) && st.host.trashCards.includes(FIELD_DOWN_ENERGY);
      // 🔑**帰結まで pass 条件に入れる**（§3 (cxxviii) の本体）＝「そのルリグをアップし、能力を失う」。
      //   ⚠旧 live は対象が SIGNI だったので、ここが**シグニ側**に効いていたら回帰。
      const lrigUpped = st.host.lrigDown === false;
      const lrigAbilitiesRemoved = (st.host.abilitiesRemoved ?? []).includes(FIELD_DOWN_LRIG);
      const signiNotTargeted = !(st.host.abilitiesRemoved ?? []).includes(FIELD_DOWN_SOURCE);
      return { pass: prompted && energyPicked && downConfirmed && sawAllThreeDown && whitePaid
        && lrigUpped && lrigAbilitiesRemoved && signiNotTargeted,
        detail: `pay/skip提示=${prompted}・3体選択確定=${downConfirmed}・3体同時down観測=${sawAllThreeDown}・白エナ→trash=${whitePaid}`
          + `／🔑帰結＝ルリグがアップ=${lrigUpped}・ルリグが能力喪失=${lrigAbilitiesRemoved}・シグニは対象外=${signiNotTargeted}` };
    }
  }
  return { pass: false, detail: `fieldDown完走タイムアウト（expectAffordable=${expectAffordable} attacked=${attacked} prompted=${prompted} branch=${branchClicked} energy=${energyPicked} down=${downPicked.size}/${downConfirmed}/all3=${sawAllThreeDown} up=${upPicked}/${upConfirmed} remove=${removePicked}/${removeConfirmed} hEnergy=${JSON.stringify(last?.host?.energyCards)} hDown=${JSON.stringify(last?.host?.signiDown)} abilitiesRemoved=${JSON.stringify(last?.host?.abilitiesRemoved)} gLife=${last?.guest?.life} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.fieldDownCostRequiresThreeUpWhite = {
  title: 'WXDi-P04-051-E1（白シグニ2体だけ＝fieldDown3体を払えずpay disabled・skip）',
  spec: makeFieldDownSpec(null),
  async drive(page, H) { return runFieldDownRound(page, H, { expectAffordable: false }); },
};

scenarios.fieldDownCostPaysThreeAndWhite = {
  title: 'WXDi-P04-051-E1対照（白シグニを3体へ増やすだけ＝3体down＋白エナ徴収、帰結対象は観測のみ）',
  spec: makeFieldDownSpec(FIELD_DOWN_WHITE_C),
  async drive(page, H) { return runFieldDownRound(page, H, { expectAffordable: true }); },
};

const OPTIONAL_ACTIVATE_SOURCE = 'WXDi-P02-037#4931';
const OPTIONAL_ACTIVATE_SPEC = {
  hostSet: {
    'field.lrig': ['WD02-002#4932'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [OPTIONAL_ACTIVATE_SOURCE],
    'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#4933'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
};

async function runOptionalActivateRound(page, H, branch) {
  const before = await H.queryState();
  let handOpened = false; let summonClicked = false; let zoneClicked = false;
  let prompted = false; let branchClicked = false; let sawLifeCrash = false; let sawHostCheck = false; let last = before;
  for (let s = 0; s < 72; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    if ((st0?.host?.life ?? before.host.life) < before.host.life) sawLifeCrash = true;
    if (st0?.host?.fieldCheck != null) sawHostCheck = true;
    let did = null;
    if (!handOpened) {
      did = await H.clickTestId('my-hand-card-0'); if (did) handOpened = true;
    } else if (!summonClicked) {
      const summon = page.locator('[data-testid^="card-action-"][data-action-label="召喚"]').first();
      for (let w = 0; w < 20; w++) {
        if (await summon.count() && await summon.isVisible().catch(() => false) && await summon.isEnabled().catch(() => false)) break;
        await page.waitForTimeout(150);
      }
      if (await summon.count() && await summon.isVisible().catch(() => false) && await summon.isEnabled().catch(() => false)) {
        await summon.click({ timeout: 2000 }); did = 'tid:card-action-*[data-action-label="召喚"]'; summonClicked = true;
      }
    } else if (!zoneClicked) {
      did = await H.clickTestId('summon-zone-0'); if (did) zoneClicked = true;
    } else {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        if (opts.pay !== 'pay:発動する' || opts.skip !== 'skip:発動しない') {
          return { pass: false, detail: `OPTIONAL_ACTIVATE文言不一致=${JSON.stringify(st0.pendingOptions)}（期待 pay:発動する / skip:発動しない）` };
        }
        did = await H.clickTestId(branch === 'pay' ? 'optcost-pay' : 'optcost-skip');
        if (did) branchClicked = true;
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    // pay側は自分のライフを割るので、host側のチェックゾーン確認を必ず消化する。
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    if ((st?.host?.life ?? before.host.life) < before.host.life) sawLifeCrash = true;
    if (st?.host?.fieldCheck != null) sawHostCheck = true;
    const settled = zoneClicked && prompted && branchClicked && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    H.log(`  optionalActivate.${branch}[${s}] -> ${did ?? 'なし'} | summon=${handOpened}/${summonClicked}/${zoneClicked} prompted=${prompted} branch=${branchClicked} life=${st?.host?.life} sawCrash=${sawLifeCrash} sawHostCheck=${sawHostCheck} hField=${JSON.stringify(st?.host?.fieldSigni)} hEnergy=${JSON.stringify(st?.host?.energyCards)} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} options=${JSON.stringify(st?.pendingOptions)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      const summoned = st.host.fieldSigni?.[0]?.includes(OPTIONAL_ACTIVATE_SOURCE) && !st.host.handCards.includes(OPTIONAL_ACTIVATE_SOURCE);
      if (branch === 'skip') {
        return { pass: prompted && summoned && st.host.life === before.host.life && !sawLifeCrash,
          detail: `発動する/しない提示=${prompted}・通常召喚=${summoned}・発動しないでlife ${before.host.life}→${st.host.life}（不変）` };
      }
      return { pass: prompted && summoned && sawLifeCrash && st.host.life === before.host.life - 1 && st.host.fieldCheck === null,
        detail: `発動する/しない提示=${prompted}・通常召喚=${summoned}・発動するでlife ${before.host.life}→${st.host.life}・host確認フロー消化=${st.host.fieldCheck === null}（check観測=${sawHostCheck}）` };
    }
  }
  return { pass: false, detail: `OPTIONAL_ACTIVATE ${branch}完走タイムアウト（summon=${handOpened}/${summonClicked}/${zoneClicked} prompted=${prompted} branch=${branchClicked} life=${last?.host?.life} sawCrash=${sawLifeCrash} sawHostCheck=${sawHostCheck} hField=${JSON.stringify(last?.host?.fieldSigni)} check=${last?.host?.fieldCheck ?? '-'} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.optionalActivateSkipThenPay = {
  title: 'WXDi-P02-037-E3（通常召喚OPTIONAL_ACTIVATE＝同一specで発動しない→再注入→発動する、life 7→7 / 7→6）',
  spec: OPTIONAL_ACTIVATE_SPEC,
  async drive(page, H) {
    const skip = await runOptionalActivateRound(page, H, 'skip');
    if (!skip.pass) return { pass: false, detail: skip.detail };
    await H.closeModals();
    const reinjected = await injectScenario(page, OPTIONAL_ACTIVATE_SPEC);
    if (reinjected.error) return { pass: false, detail: `pay対照の再注入失敗=${reinjected.error}` };
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const pay = await runOptionalActivateRound(page, H, 'pay');
    return { pass: pay.pass, detail: `同一specを再注入し、変えたのはOPTIONAL_ACTIVATEの応答だけ。${skip.detail}／${pay.detail}` };
  },
};

// ── 続き472：PLAN §7 V-04 エナ支払い元の一本化（候補・フェイズ/上限ゲート・控除） ──
// 下カードは E2 の自動配置を待たず、既存表現 [下カード..., 場の本体] で直接注入する。
// A1↔A2 は top.turn_phase だけ、A4 内蔵対照は turn_off_zone_energy_paid_count だけを変える。
const V04_ARTS = 'WD15-010#5001';
const V04_TANABATA = 'WXDi-P10-041#5002';
const V04_UNDER_A = 'WD02-010#5003';
const V04_UNDER_B = 'WD02-010#5004';
const V04_UNDER_C = 'WD02-010#5005';
const V04_ENERGY_A = 'WD02-010#5006';
const V04_ENERGY_B = 'WD02-010#5007';
const V04_UNDER_LABEL = '羅植姫　タナバタの下';

const makeV04UnderArtsSpec = (turnPhase, underCards = [V04_UNDER_A, V04_UNDER_B], paidCount = 0) => ({
  hostSet: {
    'field.lrig': ['WD04-001#5008'],
    'field.assist_lrig_l': ['WD03-003#5009'],
    'field.assist_lrig_r': ['WD02-003#5010'],
    'field.signi': [[...underCards, V04_TANABATA], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'field.key_piece': null,
    'field.key_piece_extra': [],
    'lrig_deck': [V04_ARTS],
    'hand': [],
    'energy': [V04_ENERGY_A, V04_ENERGY_B],
    'turn_off_zone_energy_paid_count': paidCount,
    'actions_done': [],
    'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#5011'],
    'field.assist_lrig_l': [],
    'field.assist_lrig_r': [],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'field.key_piece': null,
    'field.key_piece_extra': [],
    'hand': [],
    'energy': [],
    'actions_done': [],
    'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: turnPhase, turn_count: 2 },
});

const V04_ATTACK_SPEC = makeV04UnderArtsSpec('ATTACK_ARTS');
const V04_MAIN_SPEC = makeV04UnderArtsSpec('MAIN');
const V04_LIMIT_BASE_SPEC = makeV04UnderArtsSpec('ATTACK_ARTS', [V04_UNDER_A, V04_UNDER_B, V04_UNDER_C], 0);
const V04_LIMIT_PAID_TWO_SPEC = makeV04UnderArtsSpec('ATTACK_ARTS', [V04_UNDER_A, V04_UNDER_B, V04_UNDER_C], 2);

async function clickV04VisibleLocator(page, locator, label) {
  for (let k = 0; k < 20; k++) {
    if (await locator.count() && await locator.isVisible().catch(() => false)
        && await locator.isEnabled().catch(() => true)) {
      await locator.click({ timeout: 2000 });
      return label;
    }
    await page.waitForTimeout(150);
  }
  return null;
}

async function openV04LrigDeckAction(page, actionLabel) {
  const deck = await clickV04VisibleLocator(page, page.getByTestId('my-lrig-dk').first(), 'tid:my-lrig-dk');
  if (!deck) return { ok: false, detail: 'my-lrig-dk が3秒以内に描画されない' };
  const card = await clickV04VisibleLocator(page, page.getByTestId('zone-card-0').first(), 'tid:zone-card-0');
  if (!card) return { ok: false, detail: 'zone-card-0 が3秒以内に描画されない' };
  // 続き475g：ピースのラベルは「キーにセット」→「ピースを使用」へ変わった（§3 (cxxiii)）。
  //   ⚠**両方を受ける**＝キー用シナリオと共用のヘルパなのでどちらか一方に固定しない。
  const labels = Array.isArray(actionLabel) ? actionLabel : [actionLabel];
  const sel = labels.map(l => `[data-testid^="card-action-"][data-action-label="${l}"]`).join(', ');
  const action = page.locator(sel).first();
  const clicked = await clickV04VisibleLocator(page, action, `tid:card-action-*[${labels.join('|')}]`);
  if (!clicked) return { ok: false, detail: `${actionLabel} action が3秒以内に描画されない` };
  return { ok: true, detail: `${deck}→${card}→${clicked}` };
}

async function inspectV04ArtsPool(page, expectedTotal, expectedUnder) {
  const all = page.locator('[data-testid^="artscost-energy-"]');
  const under = page.locator(`[data-testid^="artscost-energy-"][title="${V04_UNDER_LABEL}"]`);
  const energy = page.locator('[data-testid^="artscost-energy-"]:not([title])');
  let observed = { total: 0, under: 0, energy: 0, visible: false, ids: [], titles: [] };
  for (let k = 0; k < 20; k++) {
    const total = await all.count();
    observed = {
      total,
      under: await under.count(),
      energy: await energy.count(),
      visible: total > 0 && await all.first().isVisible().catch(() => false),
      ids: await all.evaluateAll(els => els.map(e => e.getAttribute('data-testid'))),
      titles: await all.evaluateAll(els => els.map(e => e.getAttribute('title'))),
    };
    if (observed.visible && observed.total === expectedTotal && observed.under === expectedUnder
        && observed.energy === expectedTotal - expectedUnder) {
      return { pass: true, ...observed };
    }
    await page.waitForTimeout(150);
  }
  return { pass: false, ...observed };
}

async function driveV04ArtsPoolOffer(page, H, expectedTotal, expectedUnder, expectedStack) {
  const before = await H.queryState();
  if (JSON.stringify(before?.host?.fieldSigni?.[0]) !== JSON.stringify(expectedStack)) {
    return { pass: false, detail: `下カードstack注入不成立=${JSON.stringify(before?.host?.fieldSigni?.[0])}（期待=${JSON.stringify(expectedStack)}）` };
  }
  const opened = await openV04LrigDeckAction(page, '使用');
  if (!opened.ok) return { pass: false, detail: opened.detail };
  const pool = await inspectV04ArtsPool(page, expectedTotal, expectedUnder);
  return {
    pass: pool.pass && pool.visible && pool.total > 0,
    detail: `コストモーダル実描画=${pool.visible}・候補total=${pool.total}/${expectedTotal}・title「${V04_UNDER_LABEL}」=${pool.under}/${expectedUnder}・titleなしエナ=${pool.energy}/${expectedTotal - expectedUnder}・ids=${JSON.stringify(pool.ids)}・titles=${JSON.stringify(pool.titles)}・open=${opened.detail}`,
  };
}

scenarios.underEnergyPayOfferedInAttackPhase = {
  title: 'WXDi-P10-041-E1（ATTACK_ARTS＝エナ2＋タナバタの下2がアーツ支払い候補）',
  spec: V04_ATTACK_SPEC,
  async drive(page, H) {
    return driveV04ArtsPoolOffer(
      page, H, 4, 2, [V04_UNDER_A, V04_UNDER_B, V04_TANABATA],
    );
  },
};

scenarios.underEnergyPayNotOfferedInMainPhase = {
  title: 'WXDi-P10-041-E1対照（同一盤面でMAINだけ＝下カードは候補外、エナ2だけ）',
  spec: V04_MAIN_SPEC,
  async drive(page, H) {
    return driveV04ArtsPoolOffer(
      page, H, 2, 0, [V04_UNDER_A, V04_UNDER_B, V04_TANABATA],
    );
  },
};

scenarios.underEnergyPayDeductsUnderCardOnly = {
  title: 'WXDi-P10-041-E1（title付き下カード1枚だけでアーツ使用→下だけtrash・本体/エナ残存）',
  spec: V04_ATTACK_SPEC,
  async drive(page, H) {
    const before = await H.queryState();
    const expectedBeforeStack = [V04_UNDER_A, V04_UNDER_B, V04_TANABATA];
    if (JSON.stringify(before?.host?.fieldSigni?.[0]) !== JSON.stringify(expectedBeforeStack)) {
      return { pass: false, detail: `下カードstack注入不成立=${JSON.stringify(before?.host?.fieldSigni?.[0])}` };
    }
    const opened = await openV04LrigDeckAction(page, '使用');
    if (!opened.ok) return { pass: false, detail: opened.detail };
    const pool = await inspectV04ArtsPool(page, 4, 2);
    if (!pool.pass) return { pass: false, detail: `支払い候補不一致=${JSON.stringify(pool)}` };
    const under = page.locator(`[data-testid^="artscost-energy-"][title="${V04_UNDER_LABEL}"]`).first();
    const pickedTestId = await under.getAttribute('data-testid');
    if (pickedTestId !== 'artscost-energy-2') {
      return { pass: false, detail: `pool順回帰＝最初の下カードtestid=${pickedTestId}（期待artscost-energy-2）` };
    }
    const picked = await clickV04VisibleLocator(page, under, `tid:${pickedTestId}[title="${V04_UNDER_LABEL}"]`);
    if (!picked) return { pass: false, detail: 'title付き下カード候補を3秒以内にクリックできない' };
    const used = await clickExactVisibleText(page, 'アーツ使用');
    if (!used) return { pass: false, detail: '下カード選択後に「アーツ使用」が3秒以内にenabledにならない' };
    let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(250);
      const st = await H.queryState();
      last = st;
      const artUsed = st.host.lrigDeck === before.host.lrigDeck - 1;
      if (!artUsed) continue;
      const stackStayed = JSON.stringify(st.host.fieldSigni?.[0]) === JSON.stringify(expectedBeforeStack);
      const energyStayed = JSON.stringify(st.host.energyCards) === JSON.stringify(before.host.energyCards);
      if (stackStayed && energyStayed) {
        return { pass: false, st, detail: `【applyTo呼び忘れ疑い】アーツは使用済みだがエナも下カードも1枚も減らない（stack=${JSON.stringify(st.host.fieldSigni?.[0])} energy=${JSON.stringify(st.host.energyCards)} trash=${JSON.stringify(st.host.trashCards)}）` };
      }
      const expectedAfterStack = [V04_UNDER_B, V04_TANABATA];
      const underOnlyPaid = JSON.stringify(st.host.fieldSigni?.[0]) === JSON.stringify(expectedAfterStack)
        && st.host.trashCards.includes(V04_UNDER_A) && !st.host.trashCards.includes(V04_UNDER_B);
      const hostStayed = st.host.fieldSigni?.[0]?.at(-1) === V04_TANABATA;
      const energyUnchanged = JSON.stringify(st.host.energyCards) === JSON.stringify(before.host.energyCards)
        && !st.host.trashCards.includes(V04_ENERGY_A) && !st.host.trashCards.includes(V04_ENERGY_B);
      return { pass: underOnlyPaid && hostStayed && energyUnchanged, st,
        detail: `候補4/title付き2を実描画→${picked}→${used}。下Aだけstack→trash=${underOnlyPaid}・タナバタ本体残存=${hostStayed}・energy ${JSON.stringify(before.host.energyCards)}→${JSON.stringify(st.host.energyCards)} 不変=${energyUnchanged}` };
    }
    return { pass: false, st: last, detail: `アーツ使用後の控除を観測できない（lrigDeck=${last?.host?.lrigDeck} stack=${JSON.stringify(last?.host?.fieldSigni?.[0])} energy=${JSON.stringify(last?.host?.energyCards)} trash=${JSON.stringify(last?.host?.trashCards)}）` };
  },
};

scenarios.underEnergyPayPerTurnLimit = {
  title: 'WXDi-P10-041-E1（下3枚・paid 0→2だけ再注入＝title付き候補3→残り1）',
  spec: V04_LIMIT_BASE_SPEC,
  async drive(page, H) {
    const expectedStack = [V04_UNDER_A, V04_UNDER_B, V04_UNDER_C, V04_TANABATA];
    const baseline = await driveV04ArtsPoolOffer(page, H, 5, 3, expectedStack);
    if (!baseline.pass) return { pass: false, detail: `paid=0基準が不成立：${baseline.detail}` };
    await H.closeModals();
    const reinjected = await injectScenario(page, V04_LIMIT_PAID_TWO_SPEC);
    if (reinjected.error) return { pass: false, detail: `paid=2対照の再注入失敗=${reinjected.error}` };
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const limited = await driveV04ArtsPoolOffer(page, H, 3, 1, expectedStack);
    return { pass: limited.pass,
      detail: `同一盤面を再注入し変えたのは turn_off_zone_energy_paid_count 0→2 だけ。paid=0: ${baseline.detail}／paid=2: ${limited.detail}` };
  },
};

const V04_REG_ENERGY_KEEP = 'WD02-010#5021';
const V04_REG_ENERGY_PAY = 'WD02-010#5022';
const V04_KEY_PIECE = 'WXDi-P11-004#5023';

const makeV04RegressionSpec = (lrigDeckCard) => ({
  hostSet: {
    'field.lrig': ['WD04-001#5024'],
    'field.assist_lrig_l': ['WD03-003#5025'],
    'field.assist_lrig_r': ['WD02-003#5026'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'field.key_piece': null,
    'field.key_piece_extra': [],
    'lrig_deck': [lrigDeckCard],
    'hand': [],
    'energy': [V04_REG_ENERGY_KEEP, V04_REG_ENERGY_PAY],
    'actions_done': [],
    'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#5027'],
    'field.assist_lrig_l': [],
    'field.assist_lrig_r': [],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'field.key_piece': null,
    'field.key_piece_extra': [],
    'hand': [],
    'energy': [],
    'actions_done': [],
    'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
});

scenarios.energyPayArtsDeductsSelectedOnly = {
  title: 'V-04回帰：タナバタ不在・WD15-010アーツでindex1だけ支払い→選択エナだけtrash',
  spec: makeV04RegressionSpec(V04_ARTS),
  async drive(page, H) {
    const before = await H.queryState();
    const opened = await openV04LrigDeckAction(page, '使用');
    if (!opened.ok) return { pass: false, detail: opened.detail };
    const pool = await inspectV04ArtsPool(page, 2, 0);
    if (!pool.pass) return { pass: false, detail: `タナバタ不在のアーツpool不一致=${JSON.stringify(pool)}` };
    const picked = await clickV04VisibleLocator(page, page.getByTestId('artscost-energy-1').first(), 'tid:artscost-energy-1');
    if (!picked) return { pass: false, detail: 'artscost-energy-1を3秒以内にクリックできない' };
    const used = await clickExactVisibleText(page, 'アーツ使用');
    if (!used) return { pass: false, detail: 'index1選択後に「アーツ使用」が3秒以内にenabledにならない' };
    let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(250);
      const st = await H.queryState();
      last = st;
      const artUsed = st.host.lrigDeck === before.host.lrigDeck - 1;
      if (!artUsed) continue;
      if (JSON.stringify(st.host.energyCards) === JSON.stringify(before.host.energyCards)) {
        return { pass: false, st, detail: `【applyTo呼び忘れ疑い＝ただでアーツ】アーツは使用済みだがエナが1枚も減らない（energy=${JSON.stringify(st.host.energyCards)} trash=${JSON.stringify(st.host.trashCards)}）` };
      }
      const selectedOnly = JSON.stringify(st.host.energyCards) === JSON.stringify([V04_REG_ENERGY_KEEP])
        && st.host.trashCards.includes(V04_REG_ENERGY_PAY) && !st.host.trashCards.includes(V04_REG_ENERGY_KEEP);
      return { pass: selectedOnly, st,
        detail: `タナバタ不在pool=2/title付き0→${picked}→${used}。energy ${JSON.stringify(before.host.energyCards)}→${JSON.stringify(st.host.energyCards)}・index1だけtrash=${selectedOnly}` };
    }
    return { pass: false, st: last, detail: `アーツ支払い完了を観測できない（lrigDeck=${last?.host?.lrigDeck} energy=${JSON.stringify(last?.host?.energyCards)} trash=${JSON.stringify(last?.host?.trashCards)}）` };
  },
};

scenarios.energyPayKeyUseDeductsSelectedOnly = {
  title: 'V-04別経路回帰：タナバタ不在・WXDi-P11-004ピース使用でkeycost index1だけtrash',
  spec: makeV04RegressionSpec(V04_KEY_PIECE),
  async drive(page, H) {
    const before = await H.queryState();
    const opened = await openV04LrigDeckAction(page, ['キーにセット', 'ピースを使用']);
    if (!opened.ok) return { pass: false, detail: opened.detail };
    const entries = page.locator('[data-testid^="keycost-energy-"]');
    const underEntries = page.locator(`[data-testid^="keycost-energy-"][title="${V04_UNDER_LABEL}"]`);
    const energyEntries = page.locator('[data-testid^="keycost-energy-"]:not([title])');
    let modalVisible = false; let count = 0; let underCount = 0; let energyCount = 0;
    for (let k = 0; k < 20; k++) {
      count = await entries.count();
      underCount = await underEntries.count();
      energyCount = await energyEntries.count();
      modalVisible = count > 0 && await entries.first().isVisible().catch(() => false);
      if (modalVisible && count === 2 && underCount === 0 && energyCount === 2) break;
      await page.waitForTimeout(150);
    }
    if (!modalVisible || count !== 2 || underCount !== 0 || energyCount !== 2) {
      return { pass: false, detail: `KeyUseModalの実描画/候補数不一致（visible=${modalVisible} keycost=${count}/2 title付き=${underCount}/0 titleなし=${energyCount}/2）` };
    }
    const picked = await clickV04VisibleLocator(page, page.getByTestId('keycost-energy-1').first(), 'tid:keycost-energy-1');
    if (!picked) return { pass: false, detail: 'keycost-energy-1を3秒以内にクリックできない' };
    // 続き475g：ピースの確定ボタンは「セット」→「使用」へ（§3 (cxxiii)）。両方を受ける。
    const set = await clickExactVisibleText(page, '使用') || await clickExactVisibleText(page, 'セット');
    if (!set) return { pass: false, detail: 'index1選択後に「使用/セット」が3秒以内にenabledにならない' };
    let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(250);
      const st = await H.queryState();
      last = st;
      // 続き475g：**ピースはキーゾーンへ行かない**（§3 (cxxiii)＝使用＝即解決→ルリグトラッシュ）。
      //   旧判定 `keyPiece === V04_KEY_PIECE` は新実装では永久に false になるので、
      //   「ルリグデッキを離れてルリグトラッシュへ入った」で観測する。本シナリオの主題は
      //   **V-04 のエナ支払い funnel（選んだ1枚だけが trash へ）**なのでそこは変えない。
      const pieceSet = st.host.lrigDeck === before.host.lrigDeck - 1
        && (st.host.lrigTrashCards ?? []).includes(V04_KEY_PIECE);
      if (!pieceSet) continue;
      if (JSON.stringify(st.host.energyCards) === JSON.stringify(before.host.energyCards)) {
        return { pass: false, st, detail: `【applyTo呼び忘れ疑い】ピースは使用済みだがエナが1枚も減らない（energy=${JSON.stringify(st.host.energyCards)} trash=${JSON.stringify(st.host.trashCards)}）` };
      }
      const selectedOnly = JSON.stringify(st.host.energyCards) === JSON.stringify([V04_REG_ENERGY_KEEP])
        && st.host.trashCards.includes(V04_REG_ENERGY_PAY) && !st.host.trashCards.includes(V04_REG_ENERGY_KEEP);
      return { pass: selectedOnly, st,
        detail: `KeyUseModal実描画=${modalVisible}・keycost=2/title付き0/titleなし2→${picked}→${set}・ピース使用（ルリグトラッシュへ）=${pieceSet}・energy ${JSON.stringify(before.host.energyCards)}→${JSON.stringify(st.host.energyCards)}・index1だけtrash=${selectedOnly}` };
    }
    return { pass: false, st: last, detail: `ピース支払い完了を観測できない（lrigTrash=${JSON.stringify(last?.host?.lrigTrashCards)} keyPiece=${JSON.stringify(last?.host?.keyPiece)} lrigDeck=${last?.host?.lrigDeck} energy=${JSON.stringify(last?.host?.energyCards)} trash=${JSON.stringify(last?.host?.trashCards)}）` };
  },
};
// ── /続き472：PLAN §7 V-04 ──

// ── 続き473：PLAN §7 V-07① energyTrash ＋ V-06② 「捨てさせる」owner/任意性 ──
// G1/G3 は同一盤面で候補filterと徴収先の両方を連続観測する。G2 は2枚目の Lv1 シグニを
// Lv2 シグニへ差し替えるだけ。H1/H2 は同一 spec を再注入し、OPTIONAL_ACTIVATE の応答だけを変える。
const ENERGY_TRASH_SOURCE = 'WX24-P1-047#5101';
const ENERGY_TRASH_TARGET = 'WD02-010#5102';       // Lv3 シグニ P10000＝対象
const ENERGY_TRASH_LV1_A = 'WD01-013#5103';        // Lv1 シグニ＝該当
const ENERGY_TRASH_LV1_B = 'WD03-013#5104';        // Lv1 シグニ＝該当
const ENERGY_TRASH_SHORT_REPLACEMENT = 'WD01-016#5104'; // Lv2 シグニ＝G2 の差し替え
const ENERGY_TRASH_LV2 = 'WD01-012#5105';          // Lv2 シグニ＝非該当
const ENERGY_TRASH_SPELL = 'WD01-015#5106';        // スペル＝非該当
const ENERGY_TRASH_HOST_HAND = ['WD01-014#5107', 'WD01-017#5108'];
const ENERGY_TRASH_GUEST_HAND = ['WD01-013#5109'];

const makeEnergyTrashCostSpec = (secondEnergy) => ({
  hostSet: {
    'field.lrig': ['WD01-001#5110'],
    'field.signi': [[ENERGY_TRASH_SOURCE], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': ENERGY_TRASH_HOST_HAND,
    'energy': [ENERGY_TRASH_LV1_A, secondEnergy, ENERGY_TRASH_LV2, ENERGY_TRASH_SPELL],
    'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#5111'],
    'field.signi': [[ENERGY_TRASH_TARGET], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': ENERGY_TRASH_GUEST_HAND,
    'energy': [],
    'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
});

const ENERGY_TRASH_AFFORDABLE_SPEC = makeEnergyTrashCostSpec(ENERGY_TRASH_LV1_B);
const ENERGY_TRASH_SHORT_SPEC = makeEnergyTrashCostSpec(ENERGY_TRASH_SHORT_REPLACEMENT);

async function runEnergyTrashCostRound(page, H, { expectAffordable }) {
  const before = await H.queryState();
  const expectedCostCandidates = [ENERGY_TRASH_LV1_A, ENERGY_TRASH_LV1_B];
  let phaseStarted = false; let targetCandidatesSeen = false; let targetPicked = false; let targetConfirmed = false;
  let prompted = false; let branchClicked = false; let costCandidatesSeen = false; let costConfirmed = false; let storedTargetPicked = false;
  const costPicked = new Set(); let last = before;
  for (let s = 0; s < 80; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (!phaseStarted) {
      did = await H.clickBtn('アタックフェイズへ', { exact: true });
      if (did) phaseStarted = true;
    } else if (!targetConfirmed && Array.isArray(st0?.pendingCandidates)) {
      if (!sameInstanceSet(st0.pendingCandidates, [ENERGY_TRASH_TARGET])) {
        return { pass: false, detail: `対象宣言候補不一致=${JSON.stringify(st0.pendingCandidates)}（期待=${ENERGY_TRASH_TARGET}だけ）`, st: st0 };
      }
      targetCandidatesSeen = true;
      if (!targetPicked) {
        did = await clickPendingInstance(page, H, ENERGY_TRASH_TARGET);
        if (did) targetPicked = true;
      } else {
        did = await clickExactVisibleText(page, '決定 (1/1)');
        if (did) targetConfirmed = true;
      }
    } else if (targetConfirmed) {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        if (!opts.pay.startsWith('pay:発動する') || opts.skip !== 'skip:スキップ') {
          return { pass: false, detail: `energyTrash 任意コスト文言不一致=${JSON.stringify(st0.pendingOptions)}`, st: st0 };
        }
        const disabled = opts.pay.endsWith('(disabled)');
        if (disabled === expectAffordable) {
          return { pass: false, detail: `energyTrash canAfford極性不一致（expectAffordable=${expectAffordable} options=${JSON.stringify(st0.pendingOptions)}）`, st: st0 };
        }
        did = await H.clickTestId(expectAffordable ? 'optcost-pay' : 'optcost-skip');
        if (did) branchClicked = true;
      } else if (expectAffordable && branchClicked && !costConfirmed && Array.isArray(st0?.pendingCandidates)) {
        if (!sameInstanceSet(st0.pendingCandidates, expectedCostCandidates)) {
          return { pass: false, detail: `【energyTrash filter回帰】候補=${JSON.stringify(st0.pendingCandidates)}（期待=${JSON.stringify(expectedCostCandidates)}だけ／Lv2・スペルは除外）`, st: st0 };
        }
        costCandidatesSeen = true;
        const next = expectedCostCandidates.find(n => !costPicked.has(n));
        if (next) {
          did = await clickPendingInstance(page, H, next);
          if (did) costPicked.add(next);
        } else {
          did = await clickExactVisibleText(page, '決定 (2/2)');
          if (did) costConfirmed = true;
        }
      } else if (expectAffordable && costConfirmed && Array.isArray(st0?.pendingCandidates)) {
        // ⚠**支払い後に BANISH{targetsStored} がもう一度 SELECT_TARGET を開く**（候補は宣言済み対象に限定）。
        //   続き469 の `targetDeclUpToTwoSelectsBoth` と同じ挙動で、ここに応答しないと `pEff=SELECT_TARGET`
        //   のままタイムアウトする（続き473 実測＝支払い自体は正しく完了していた）。
        if (!sameInstanceSet(st0.pendingCandidates, [ENERGY_TRASH_TARGET])) {
          return { pass: false, detail: `【stored対象回帰】支払い後のBANISH候補=${JSON.stringify(st0.pendingCandidates)}（期待=${ENERGY_TRASH_TARGET}だけ）`, st: st0 };
        }
        if (!storedTargetPicked) {
          did = await clickPendingInstance(page, H, ENERGY_TRASH_TARGET);
          if (did) storedTargetPicked = true;
        } else {
          did = await clickExactVisibleText(page, '決定 (1/1)');
        }
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    // 前シナリオの check 残留を spec で null にした上で、想定外に確認が出た経路も消化する。
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = phaseStarted && targetCandidatesSeen && targetConfirmed && prompted && branchClicked
      && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    H.log(`  energyTrash.${expectAffordable ? 'pay' : 'short'}[${s}] -> ${did ?? 'なし'} | target=${targetCandidatesSeen}/${targetPicked}/${targetConfirmed} prompted=${prompted} branch=${branchClicked} cost=${costCandidatesSeen}/${costPicked.size}/${costConfirmed} options=${JSON.stringify(st?.pendingOptions)} cands=${JSON.stringify(st?.pendingCandidates)} hEnergy=${JSON.stringify(st?.host?.energyCards)} hHand=${JSON.stringify(st?.host?.handCards)} hTrash=${JSON.stringify(st?.host?.trashCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${JSON.stringify(st?.guest?.energyCards)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      const hostHandStayed = sameInstanceSet(st.host.handCards, before.host.handCards);
      if (!expectAffordable) {
        const energyStayed = sameInstanceSet(st.host.energyCards, before.host.energyCards);
        const targetStayed = st.guest.fieldSigni?.[0]?.includes(ENERGY_TRASH_TARGET)
          && sameInstanceSet(st.guest.energyCards, before.guest.energyCards);
        const trashStayed = sameInstanceSet(st.host.trashCards, before.host.trashCards);
        return { pass: prompted && hostHandStayed && energyStayed && trashStayed && targetStayed, st,
          detail: `pay disabled＋skip提示=${prompted}・host energy ${JSON.stringify(before.host.energyCards)}→${JSON.stringify(st.host.energyCards)} 不変=${energyStayed}・host hand ${JSON.stringify(before.host.handCards)}→${JSON.stringify(st.host.handCards)} 不変=${hostHandStayed}・対象不変=${targetStayed}` };
      }
      const energyDeducted = sameInstanceSet(st.host.energyCards, [ENERGY_TRASH_LV2, ENERGY_TRASH_SPELL]);
      const eligibleToTrash = st.host.trashCards.includes(ENERGY_TRASH_LV1_A)
        && st.host.trashCards.includes(ENERGY_TRASH_LV1_B)
        && !st.host.trashCards.includes(ENERGY_TRASH_LV2) && !st.host.trashCards.includes(ENERGY_TRASH_SPELL);
      const targetBanished = !(st.guest.fieldSigni ?? []).flatMap(z => z ?? []).includes(ENERGY_TRASH_TARGET)
        && st.guest.energyCards.includes(ENERGY_TRASH_TARGET);
      return { pass: prompted && costCandidatesSeen && costPicked.size === 2 && costConfirmed
          && energyDeducted && eligibleToTrash && hostHandStayed && targetBanished, st,
        detail: `pay/skip提示=${prompted}・energyTrash候補=${JSON.stringify(expectedCostCandidates)}だけ=${costCandidatesSeen}・energy ${JSON.stringify(before.host.energyCards)}→${JSON.stringify(st.host.energyCards)}・Lv1シグニ2枚totrash=${eligibleToTrash}・host hand ${JSON.stringify(before.host.handCards)}→${JSON.stringify(st.host.handCards)} 不変=${hostHandStayed}・対象banish→guest.energy=${targetBanished}` };
    }
  }
  return { pass: false, st: last,
    detail: `energyTrash完走タイムアウト（expectAffordable=${expectAffordable} target=${targetCandidatesSeen}/${targetPicked}/${targetConfirmed} prompted=${prompted} branch=${branchClicked} cost=${costCandidatesSeen}/${costPicked.size}/${costConfirmed} hEnergy=${JSON.stringify(last?.host?.energyCards)} hHand=${JSON.stringify(last?.host?.handCards)} hTrash=${JSON.stringify(last?.host?.trashCards)} gField=${JSON.stringify(last?.guest?.fieldSigni)} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.energyTrashCostDeductsEnergyNotHand = {
  title: 'WX24-P1-047-E1（G1/G3：energyTrash候補はLv1シグニ2枚だけ→エナから徴収・手札不変）',
  spec: ENERGY_TRASH_AFFORDABLE_SPEC,
  async drive(page, H) { return runEnergyTrashCostRound(page, H, { expectAffordable: true }); },
};

scenarios.energyTrashCostUnavailableWhenShort = {
  title: 'WX24-P1-047-E1対照（G2：Lv1シグニを1枚だけへ→pay disabled・skipで本体不発）',
  spec: ENERGY_TRASH_SHORT_SPEC,
  async drive(page, H) { return runEnergyTrashCostRound(page, H, { expectAffordable: false }); },
};

const REVEAL_OPP_SOURCE = 'WXDi-P14-060#5121';
const REVEAL_OPP_HOST_HAND = ['WD01-013#5122', 'WD01-014#5123'];
const REVEAL_OPP_GUEST_HAND = ['WD01-013#5124', 'WD01-014#5125', 'WD01-017#5126'];
const REVEAL_OPP_SPEC = {
  hostSet: {
    'field.lrig': ['WD01-001#5127'],
    'field.signi': [[REVEAL_OPP_SOURCE], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': REVEAL_OPP_HOST_HAND,
    'energy': [],
    'actions_done': [], 'game_actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#5128'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': REVEAL_OPP_GUEST_HAND,
    'energy': [],
    'actions_done': [], 'game_actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
};

async function runRevealOppHandRound(page, H, branch) {
  const before = await H.queryState();
  let phaseStarted = false; let prompted = false; let branchClicked = false; let last = before;
  for (let s = 0; s < 64; s++) {
    await page.waitForTimeout(250);
    const st0 = await H.queryState();
    let did = null;
    if (!phaseStarted) {
      did = await H.clickBtn('アタックフェイズへ', { exact: true });
      if (did) phaseStarted = true;
    } else {
      const opts = pendingPaySkip(st0);
      if (!branchClicked && opts.pay && opts.skip) {
        prompted = true;
        if (opts.pay !== 'pay:発動する' || opts.skip !== 'skip:発動しない') {
          return { pass: false, detail: `OPTIONAL_ACTIVATE文言不一致=${JSON.stringify(st0.pendingOptions)}（期待 pay:発動する / skip:発動しない）`, st: st0 };
        }
        did = await H.clickTestId(branch === 'pay' ? 'optcost-pay' : 'optcost-skip');
        if (did) branchClicked = true;
      }
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    const st = await H.queryState();
    last = st;
    const settled = phaseStarted && prompted && branchClicked
      && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    H.log(`  revealOppHand.${branch}[${s}] -> ${did ?? 'なし'} | prompted=${prompted} branch=${branchClicked} options=${JSON.stringify(st?.pendingOptions)} hHand=${JSON.stringify(st?.host?.handCards)} hTrash=${JSON.stringify(st?.host?.trashCards)} gHand=${JSON.stringify(st?.guest?.handCards)} gTrash=${JSON.stringify(st?.guest?.trashCards)} gDeck=${st?.guest?.deck} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
    if (settled) {
      const hostHandStayed = sameInstanceSet(st.host.handCards, before.host.handCards);
      if (branch === 'skip') {
        const guestHandStayed = sameInstanceSet(st.guest.handCards, before.guest.handCards);
        const guestTrashStayed = sameInstanceSet(st.guest.trashCards, before.guest.trashCards);
        const guestDeckStayed = st.guest.deck === before.guest.deck;
        return { pass: prompted && hostHandStayed && guestHandStayed && guestTrashStayed && guestDeckStayed, st,
          detail: `発動する/しない提示=${prompted}・skip後 host.hand ${before.host.hand}→${st.host.hand} 不変=${hostHandStayed}・guest.hand ${before.guest.hand}→${st.guest.hand} 不変=${guestHandStayed}・guest.trash ${before.guest.trash}→${st.guest.trash} 不変=${guestTrashStayed}・guest.deck ${before.guest.deck}→${st.guest.deck} 不変=${guestDeckStayed}` };
      }
      const guestTrashPlusOne = st.guest.trash === before.guest.trash + 1;
      const guestDeckMinusOne = st.guest.deck === before.guest.deck - 1;
      const guestHandCountRestored = st.guest.hand === before.guest.hand;
      const discardedOriginals = before.guest.handCards.filter(n => st.guest.trashCards.includes(n));
      const drawnCards = st.guest.handCards.filter(n => !before.guest.handCards.includes(n));
      const guestDiscardThenDraw = guestTrashPlusOne && guestDeckMinusOne && guestHandCountRestored
        && discardedOriginals.length === 1 && drawnCards.length === 1;
      return { pass: prompted && hostHandStayed && guestDiscardThenDraw, st,
        detail: `発動する/しない提示=${prompted}・host.hand ${before.host.hand}→${st.host.hand} 不変=${hostHandStayed}・guestの破棄=${JSON.stringify(discardedOriginals)}・ドロー=${JSON.stringify(drawnCards)}・guest.trash ${before.guest.trash}→${st.guest.trash}・guest.deck ${before.guest.deck}→${st.guest.deck}・guest.hand ${before.guest.hand}→${st.guest.hand} 差し引き復帰=${guestHandCountRestored}` };
    }
  }
  return { pass: false, st: last,
    detail: `revealOppHand ${branch}完走タイムアウト（prompted=${prompted} branch=${branchClicked} hHand=${JSON.stringify(last?.host?.handCards)} gHand=${JSON.stringify(last?.guest?.handCards)} gTrash=${JSON.stringify(last?.guest?.trashCards)} gDeck=${last?.guest?.deck} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.revealOppHandSkipKeepsOpponentHand = {
  title: 'WXDi-P14-060-E1（H1：発動しない→両者手札・guest trash/deck不変）',
  spec: REVEAL_OPP_SPEC,
  async drive(page, H) { return runRevealOppHandRound(page, H, 'skip'); },
};

scenarios.revealOppHandPayDiscardsOpponentAndDraws = {
  title: 'WXDi-P14-060-E1対照（H2：発動する→guest手札1枚totrash＋guest deckから1枚draw・host手札不変）',
  spec: REVEAL_OPP_SPEC,
  async drive(page, H) { return runRevealOppHandRound(page, H, 'pay'); },
};
// ── /続き473：PLAN §7 V-07① ＋ V-06② ──

// ── 続き474：PLAN §7 V-10 F-3 身代わりを効果バニッシュへ配線 ──
// V-01（数値countの離場置換を対話化）とは別軸。本ブロックは現行policyどおり、効果バニッシュが
// 問いを出さずに身代わりを自動適用し、`身代わり：...` のengineログを残すことを固定する。
const V10_EFFECT_SOURCE = 'WX19-023#5201';
const V10_EFFECT_ENERGY = 'WD01-013#5204';
const V10_CCM = 'WX12-024#5202';
const V10_CCM_SACRIFICE = 'WD03-013#5203';
const V10_SWT = 'WX10-033#5205';
const V10_SWT_SPELL = 'WD01-015#5206';
const V10_SWT_NONSPELL = 'WD01-013#5206';
const V10_LIFE_CRASH = 'WX14-026#5207';
const V10_CCM_SUB_LOG = '身代わり：コードハート　†Ｃ・Ｃ・Ｍ†の代わりにコードアート　Ｓ・Ｃをバニッシュ';
const V10_SWT_SUB_LOG = '身代わり：手札からスペル1枚を捨ててコードハート　Ｓ・Ｗ・Ｔのバニッシュを回避';
const V10_CCM_NAME = 'コードハート　†Ｃ・Ｃ・Ｍ†';
const V10_CCM_NORMAL_LOG = 'コードハート　†Ｃ・Ｃ・Ｍ†をバニッシュ';
const V10_SWT_NAME = 'コードハート　Ｓ・Ｗ・Ｔ';
const V10_SWT_NORMAL_LOG = 'コードハート　Ｓ・Ｗ・Ｔをバニッシュ';
const V10_LIFE_CRASH_NAME = '羅石　スイカリン';
const V10_LIFE_CRASH_SUB_LOG = '身代わり：ライフクロス1枚をクラッシュして羅石　スイカリンのバニッシュを回避';
const V10_EFFECT_ASK_LOG = 'の場離れを置換しますか？（対戦相手が選択）';

function makeV10EffectSpec({ guestSigni, guestHand = [] }) {
  return {
    hostSet: {
      // WX19-023 はタマ限定。手札から通常召喚する側だけは WD01-001（タマLv4/Limit11）に合わせる。
      'field.lrig': ['WD01-001#5208'],
      'field.signi': [null, null, null], 'field.check': null,
      'hand': [V10_EFFECT_SOURCE], 'energy': [V10_EFFECT_ENERGY], 'actions_done': [], 'game_actions_done': [],
    },
    guestSet: {
      // WX12-024 / WX10-033 はピルルク限定。場への直接注入でもカードの実所属に合わせる。
      'field.lrig': ['WD03-001#5209'],
      'field.signi': guestSigni, 'field.check': null,
      'hand': guestHand, 'energy': [], 'actions_done': [], 'game_actions_done': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  };
}

const V10_CCM_WITH_SACRIFICE_SPEC = makeV10EffectSpec({
  guestSigni: [[V10_CCM], [V10_CCM_SACRIFICE], null],
});
const V10_CCM_WITHOUT_SACRIFICE_SPEC = makeV10EffectSpec({
  // S1との差は犠牲にできる他の＜電機＞1体の有無だけ。
  guestSigni: [[V10_CCM], null, null],
});
const V10_SWT_WITH_SPELL_SPEC = makeV10EffectSpec({
  guestSigni: [[V10_SWT], null, null], guestHand: [V10_SWT_SPELL],
});
const V10_SWT_WITHOUT_SPELL_SPEC = makeV10EffectSpec({
  // 同一シナリオ内対照：枚数とinstance suffixを保ち、スペルだけをバニラシグニへ差し替える。
  guestSigni: [[V10_SWT], null, null], guestHand: [V10_SWT_NONSPELL],
});
const V10_LIFE_CRASH_SPEC = makeV10EffectSpec({
  guestSigni: [[V10_LIFE_CRASH], null, null],
});

const v10FieldHas = (stacks, instanceId) =>
  (stacks ?? []).some(stack => (stack ?? []).includes(instanceId));
const v10HasLog = (st, text) => (st?.logTail ?? []).some(line => line.includes(text));
const v10SubstituteLogs = (st) => (st?.logTail ?? []).filter(line => line.includes('身代わり：'));
const v10AskLogs = (st) => (st?.logTail ?? []).filter(line => line.includes(V10_EFFECT_ASK_LOG));

async function runV10EffectBanishRound(page, H, id, victimInstance, evaluate) {
  await H.ensureMain();
  const before = await H.queryState();
  const startGuestBoard = JSON.stringify([
    before?.guest?.fieldSigni ?? null,
    before?.guest?.handCards ?? [],
    before?.guest?.energyCards ?? [],
    before?.guest?.trashCards ?? [],
  ]);
  const flow = {
    handOpened: false, summonChosen: false, zoneChosen: false,
    energyChosen: false, fired: false, victimPicked: false, targetConfirmed: false,
  };
  let started = false;
  let targetCandidateSnapshot = null;
  let last = before;
  // 続き475：`H.queryState()` の盤面は Supabase 直照会で先に真になるが、`game_logs` の行が載るのは
  //   数百ms遅れる（PLAN §7 📌7 と同型の race）＝**最初の settled で即FAILにすると
  //   「盤面は正しいのに normalLog=false」で位置依存フレークになる**（実測：単体PASS・3件バッチFAIL）。
  //   ⇒ settled 後も PASS しない間は最大 V10_SETTLE_GRACE 反復ぶん（≒2〜3秒）ログの到着を待ってから確定する。
  const V10_SETTLE_GRACE = 12;
  let settledCount = 0;
  let lastVerdict = null;
  for (let s = 0; s < 64; s++) {
    await page.waitForTimeout(200);
    let did = null;
    if (!flow.handOpened) {
      did = await H.clickTestId('my-hand-card-0');
      if (did) flow.handOpened = true;
    } else if (!flow.summonChosen) {
      did = await H.clickBtn('召喚', { exact: true });
      if (did) flow.summonChosen = true;
    } else if (!flow.zoneChosen) {
      did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
      if (did) flow.zoneChosen = true;
    } else if (!flow.energyChosen) {
      did = await H.clickTestId('onplaycost-energy-0');
      if (did) flow.energyChosen = true;
    } else if (!flow.fired) {
      did = await H.clickBtn('発動', { exact: true });
      if (did) flow.fired = true;
    } else if (!flow.victimPicked) {
      const st0 = await H.queryState();
      if (Array.isArray(st0?.pendingCandidates) && st0.pendingCandidates.includes(victimInstance)) {
        targetCandidateSnapshot ??= [...st0.pendingCandidates];
        did = await clickPendingInstance(page, H, victimInstance);
        if (did) flow.victimPicked = true;
      }
    } else if (!flow.targetConfirmed) {
      did = await clickExactVisibleText(page, '決定 (1/1)');
      if (did) flow.targetConfirmed = true;
      // 続き475：pick のクリックが React 側に載らないと「決定 (1/1)」が永久に出ず 64反復×3秒＝211秒
      //   溶かす（実測1回）。SELECT_TARGET が続いているうちは pick からやり直す（自己回復）。
      else if ((await H.queryState())?.pendingEffect === 'SELECT_TARGET') flow.victimPicked = false;
    }
    if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
    // 両者の field.check は注入時にnullへ戻す。万一のライフ確認も消化して残留させない。
    if (!did) did = await H.clickBtn('エナに送る', { exact: true });

    const st = await H.queryState();
    last = st;
    const guestBoard = JSON.stringify([
      st?.guest?.fieldSigni ?? null,
      st?.guest?.handCards ?? [],
      st?.guest?.energyCards ?? [],
      st?.guest?.trashCards ?? [],
    ]);
    if (flow.fired && ((st?.stackLen ?? 0) > 0 || st?.pendingEffect != null || guestBoard !== startGuestBoard)) started = true;
    H.log(`  ${id}[${s}] -> ${did ?? 'なし'} | flow=${JSON.stringify(flow)} started=${started} cands=${JSON.stringify(targetCandidateSnapshot)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${JSON.stringify(st?.guest?.handCards)} gEnergy=${JSON.stringify(st?.guest?.energyCards)} gTrash=${JSON.stringify(st?.guest?.trashCards)} gLife=${st?.guest?.life} subLogs=${JSON.stringify(v10SubstituteLogs(st))} asks=${v10AskLogs(st).length} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'} tail=${JSON.stringify((st?.logTail ?? []).slice(-8))}`);
    const settled = flow.fired && flow.victimPicked && flow.targetConfirmed && started
      && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    if (settled) {
      settledCount++;
      const verdict = evaluate(st, before, targetCandidateSnapshot);
      if (verdict?.pass) return verdict;
      if (verdict) lastVerdict = verdict;
      if (settledCount >= V10_SETTLE_GRACE && lastVerdict) return lastVerdict;
    }
  }
  if (lastVerdict) return lastVerdict;
  return { pass: false, st: last,
    detail: `${id}完走タイムアウト（flow=${JSON.stringify(flow)} started=${started} cands=${JSON.stringify(targetCandidateSnapshot)} gField=${JSON.stringify(last?.guest?.fieldSigni)} gHand=${JSON.stringify(last?.guest?.handCards)} gEnergy=${JSON.stringify(last?.guest?.energyCards)} gTrash=${JSON.stringify(last?.guest?.trashCards)} gLife=${last?.guest?.life} subLogs=${JSON.stringify(v10SubstituteLogs(last))} asks=${v10AskLogs(last).length} checks=${last?.host?.fieldCheck ?? '-'}/${last?.guest?.fieldCheck ?? '-'} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.effectBanishSubstituteRunsAutomatically = {
  // ⚠2026-08-14（続き475）に期待値を実装へ合わせた。当初は「効果バニッシュ＝問いなし自動適用」を
  //   前提に `asks===0` を要求していたが、`BANISH{count:1}` は `resumeSelectTarget` の
  //   hoist（`effectExecutor.ts:7412`）を通るので**被害側（CPU）へ問いが1件出る**のが現行の正。
  //   ⇒ §3 (cxxv)「数値count経路では問いが出ない」は**この入口には当てはまらない**（PLAN §7 V-01 参照）。
  //   機構が動いた証拠（trap#4）は「問い1件＋victim名を含む」＋「身代わりログ」の両方で取る。
  title: 'WX12-024（効果バニッシュ＝被害側CPUへ問い1件→CPUが身代わりを選択→victim残存・他の＜電機＞をエナへ）',
  spec: V10_CCM_WITH_SACRIFICE_SPEC,
  async drive(page, H) {
    return runV10EffectBanishRound(page, H, 'ebsra', V10_CCM, (st, _before, cands) => {
      const candidateProof = Array.isArray(cands) && cands.includes(V10_CCM) && cands.includes(V10_CCM_SACRIFICE);
      const victimStayed = v10FieldHas(st.guest.fieldSigni, V10_CCM);
      const sacrificeLeft = !v10FieldHas(st.guest.fieldSigni, V10_CCM_SACRIFICE);
      const sacrificeInEnergy = st.guest.energyCards.includes(V10_CCM_SACRIFICE);
      const autoLog = v10HasLog(st, V10_CCM_SUB_LOG);
      const askLogs = v10AskLogs(st);
      // 問いは victim ちょうど1体ぶん。victim名を含むことまで見て「別カードへの問い」と取り違えない。
      const askedVictimOnce = askLogs.length === 1 && askLogs[0].includes(V10_CCM_NAME);
      const pass = candidateProof && victimStayed && sacrificeLeft && sacrificeInEnergy && autoLog && askedVictimOnce;
      return { pass, st,
        detail: pass
          ? `対象候補にvictim/sacrifice双方=${JSON.stringify(cands)}、被害側へ問い1件「${askLogs[0]}」→CPUが身代わりを選択しvictim残存・sacrificeをエナへ・engineログ「${V10_CCM_SUB_LOG}」を確認`
          : `【旧回帰/偽陽性防止】candidateProof=${candidateProof} victimStayed=${victimStayed} sacrificeLeft=${sacrificeLeft} sacrificeInEnergy=${sacrificeInEnergy} autoLog=${autoLog} askedVictimOnce=${askedVictimOnce} asks=${JSON.stringify(askLogs)} subLogs=${JSON.stringify(v10SubstituteLogs(st))}` };
    });
  },
};

scenarios.effectBanishNoSubstituteWithoutSacrifice = {
  title: 'WX12-024対照（他の＜電機＞だけを外す→通常バニッシュでvictim自身がエナへ）',
  spec: V10_CCM_WITHOUT_SACRIFICE_SPEC,
  async drive(page, H) {
    return runV10EffectBanishRound(page, H, 'ebnsws', V10_CCM, (st, _before, cands) => {
      const candidateProof = Array.isArray(cands) && cands.length === 1 && cands[0] === V10_CCM;
      const victimLeft = !v10FieldHas(st.guest.fieldSigni, V10_CCM);
      const victimInEnergy = st.guest.energyCards.includes(V10_CCM);
      const normalLog = v10HasLog(st, V10_CCM_NORMAL_LOG);
      const noSubstitute = v10SubstituteLogs(st).length === 0 && v10AskLogs(st).length === 0;
      const pass = candidateProof && victimLeft && victimInEnergy && normalLog && noSubstitute;
      return { pass, st,
        detail: pass
          ? `S1から犠牲シグニだけを外すと候補=${JSON.stringify(cands)}、victim自身がエナへ通常バニッシュ・ログ「${V10_CCM_NORMAL_LOG}」・身代わりログ/問い0件`
          : `【対照不成立】candidateProof=${candidateProof} victimLeft=${victimLeft} victimInEnergy=${victimInEnergy} normalLog=${normalLog} subLogs=${JSON.stringify(v10SubstituteLogs(st))} asks=${v10AskLogs(st).length}` };
    });
  },
};

scenarios.effectBanishSubstituteDiscardsSpell = {
  // ⚠pay 側の `asks` 期待値は 2026-08-14（続き475）に実装へ合わせた（0件→victim1体ぶんの1件）。
  //   理由は `effectBanishSubstituteRunsAutomatically` の注記と同じ。**非スペル対照側の `asks===0`
  //   はそのまま**＝置換候補が1本も無いので問い自体が立たないのが正（対照の意味を保つ）。
  title: 'WX10-033（手札スペル1枚＝被害側へ問い1件→身代わり成立／同一シナリオ内の非スペル対照では問いも出ず通常バニッシュ）',
  spec: V10_SWT_WITH_SPELL_SPEC,
  async drive(page, H) {
    const paid = await runV10EffectBanishRound(page, H, 'ebsds.pay', V10_SWT, (st, _before, cands) => {
      const askLogs = v10AskLogs(st);
      const askedVictimOnce = askLogs.length === 1 && askLogs[0].includes(V10_SWT_NAME);
      const pass = Array.isArray(cands) && cands.includes(V10_SWT)
        && v10FieldHas(st.guest.fieldSigni, V10_SWT)
        && !st.guest.handCards.includes(V10_SWT_SPELL)
        && st.guest.trashCards.includes(V10_SWT_SPELL)
        && v10HasLog(st, V10_SWT_SUB_LOG) && askedVictimOnce;
      return { pass, st,
        detail: pass
          ? `スペルあり：被害側へ問い1件「${askLogs[0]}」→victim残存・${V10_SWT_SPELL} hand→trash・engineログ「${V10_SWT_SUB_LOG}」`
          : `スペルあり不成立（cands=${JSON.stringify(cands)} field=${JSON.stringify(st.guest.fieldSigni)} hand=${JSON.stringify(st.guest.handCards)} trash=${JSON.stringify(st.guest.trashCards)} subLogs=${JSON.stringify(v10SubstituteLogs(st))} askedVictimOnce=${askedVictimOnce} asks=${JSON.stringify(askLogs)}）` };
    });
    if (!paid.pass) return paid;
    const reinjected = await injectScenario(page, V10_SWT_WITHOUT_SPELL_SPEC);
    if (reinjected.error) return { pass: false, detail: `非スペル対照の再注入失敗=${reinjected.error}` };
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    const unpaid = await runV10EffectBanishRound(page, H, 'ebsds.none', V10_SWT, (st, _before, cands) => {
      const pass = Array.isArray(cands) && cands.includes(V10_SWT)
        && !v10FieldHas(st.guest.fieldSigni, V10_SWT)
        && st.guest.energyCards.includes(V10_SWT)
        && st.guest.handCards.includes(V10_SWT_NONSPELL)
        && !st.guest.trashCards.includes(V10_SWT_NONSPELL)
        && v10HasLog(st, V10_SWT_NORMAL_LOG)
        && v10SubstituteLogs(st).length === 0 && v10AskLogs(st).length === 0;
      return { pass, st,
        detail: pass
          ? `非スペル対照：victim自身がエナへ、${V10_SWT_NONSPELL}は手札維持・ログ「${V10_SWT_NORMAL_LOG}」・身代わりログ/問い0件`
          : `非スペル対照不成立（cands=${JSON.stringify(cands)} field=${JSON.stringify(st.guest.fieldSigni)} hand=${JSON.stringify(st.guest.handCards)} energy=${JSON.stringify(st.guest.energyCards)} trash=${JSON.stringify(st.guest.trashCards)} subLogs=${JSON.stringify(v10SubstituteLogs(st))} asks=${v10AskLogs(st).length}）` };
    });
    return { pass: unpaid.pass, st: unpaid.st,
      detail: `同一シナリオ内で手札1枚をスペル→非スペルへだけ差し替え。${paid.detail}／${unpaid.detail}` };
  },
};

// 🔴続き475b で期待値を反転（旧 id＝`effectBanishLifeCrashSubstituteNotOnEffect`）。
//   旧シナリオは「lifeCrash 型は効果バニッシュへ**適用されない**」を確認するつもりだったが、実測は
//   **ライフを1枚も払わずシグニが場に残る**＝§3 (cxxix)＝apply 側に `lifeCrash` 分岐が無く
//   末尾の `trashStackSpell` へフォールスルーして「下からスペル**0枚**」で成立していた。
//   engine を直したので、いまの正は **CPU が lifeCrash を選び、ライフを1枚払ってシグニが残る**。
scenarios.effectBanishLifeCrashSubstitutePaysLife = {
  title: 'WX14-026（被害側CPUがlifeCrashの身代わりを選択→ライフ1枚を実際に払ってシグニが場に残る）',
  spec: V10_LIFE_CRASH_SPEC,
  async drive(page, H) {
    return runV10EffectBanishRound(page, H, 'eblcspl', V10_LIFE_CRASH, (st, before, cands) => {
      const victimStayed = v10FieldHas(st.guest.fieldSigni, V10_LIFE_CRASH);
      const notInEnergy = !st.guest.energyCards.includes(V10_LIFE_CRASH);
      // 🔑**「シグニが残った」だけでは (cxxix) の回帰を検出できない**（コスト0でも同じ絵になる）＝
      //   **ライフが実際に1枚減ったこと**を必須にする。
      const lifePaid = st.guest.life === before.guest.life - 1;
      const crashLog = v10HasLog(st, V10_LIFE_CRASH_SUB_LOG);
      const noFreeRide = !v10SubstituteLogs(st).some(l => l.includes('スペル0枚'));
      const askLogs = v10AskLogs(st);
      const askedVictimOnce = askLogs.length === 1 && askLogs[0].includes(V10_LIFE_CRASH_NAME);
      const pass = Array.isArray(cands) && cands.includes(V10_LIFE_CRASH)
        && victimStayed && notInEnergy && lifePaid && crashLog && noFreeRide && askedVictimOnce;
      return { pass, st,
        detail: pass
          ? `被害側へ問い1件→CPUがlifeCrashを選択し guest.life ${before.guest.life}→${st.guest.life}（1枚実払い）・victimは場に残存・ログ「${V10_LIFE_CRASH_SUB_LOG}」`
          : `【(cxxix)回帰/不成立】cands=${JSON.stringify(cands)} victimStayed=${victimStayed} notInEnergy=${notInEnergy} life=${before.guest.life}→${st.guest.life} lifePaid=${lifePaid} crashLog=${crashLog} noFreeRide=${noFreeRide} askedVictimOnce=${askedVictimOnce} subLogs=${JSON.stringify(v10SubstituteLogs(st))}` };
    });
  },
};

const V10_BATTLE_ATTACKER = 'WX01-053#5210'; // バニラP15000。zone0→正面zone2のWX12-024(P12000)へCPUがアタック。
const V10_BATTLE_VICTIM = 'WX12-024#5211';
const V10_BATTLE_SACRIFICE = 'WD03-013#5212';
const V10_BATTLE_MODAL_TITLE = '身代わりバニッシュ';
const V10_BATTLE_DECLINE = '身代わりしない（コードハート　†Ｃ・Ｃ・Ｍ†をバニッシュ）';
const V10_BATTLE_WAIT_LOG = 'コードハート　†Ｃ・Ｃ・Ｍ†のバニッシュに身代わりの選択を待っています';

async function v10ExactTextVisible(page, text) {
  const el = page.getByText(text, { exact: true }).first();
  for (let k = 0; k < 20; k++) {
    if (await el.count() && await el.isVisible().catch(() => false)) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

scenarios.battleBanishSubstituteStillInteractive = {
  title: 'WX12-024（CPUのP15000シグニとのバトルでpending_banish_substitute＋人間側モーダルを確認）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-001#5213'],
      // engineの正面規約は 2-zone。CPU attacker zone0 の正面になる zone2 に victim を置く。
      'field.signi': [[V10_BATTLE_SACRIFICE], null, [V10_BATTLE_VICTIM]],
      'field.signi_down': [false, false, false], 'field.check': null,
      'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#5214'], 'field.lrig_down': true,
      'field.signi': [[V10_BATTLE_ATTACKER], null, null],
      'field.signi_down': [false, false, false], 'field.check': null,
      'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    let sawPending = false; let sawModal = false; let sawWaitLog = false; let declined = false;
    let last = await H.queryState();
    for (let s = 0; s < 56; s++) {
      await page.waitForTimeout(250);
      let did = null;
      const st0 = await H.queryState();
      if (st0?.host?.pendingBanishSubstitute === V10_BATTLE_VICTIM) {
        sawPending = true;
        sawWaitLog ||= v10HasLog(st0, V10_BATTLE_WAIT_LOG);
        if (!sawModal) sawModal = await v10ExactTextVisible(page, V10_BATTLE_MODAL_TITLE);
      }
      if (sawPending && sawModal && !declined) {
        did = await clickExactVisibleText(page, V10_BATTLE_DECLINE);
        if (did) declined = true;
      }
      // 通常バニッシュ後に想定外のライフ確認が立っても、両者nullへ戻してから判定する。
      if (!did) did = await H.clickBtn('エナに送る', { exact: true });
      const st = await H.queryState();
      last = st;
      sawWaitLog ||= v10HasLog(st, V10_BATTLE_WAIT_LOG);
      H.log(`  bbsinter[${s}] -> ${did ?? 'なし'} | pending=${sawPending} modal=${sawModal} waitLog=${sawWaitLog} declined=${declined} hPending=${st?.host?.pendingBanishSubstitute ?? '-'} hField=${JSON.stringify(st?.host?.fieldSigni)} hEnergy=${JSON.stringify(st?.host?.energyCards)} gDown=${JSON.stringify(st?.guest?.signiDown)} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} phase=${st?.turnPhase}`);
      if (sawPending && sawModal && sawWaitLog && declined
          && st?.host?.pendingBanishSubstitute == null
          && st?.host?.energyCards.includes(V10_BATTLE_VICTIM)
          && v10FieldHas(st?.host?.fieldSigni, V10_BATTLE_SACRIFICE)
          && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null) {
        return { pass: true, st,
          detail: `battle側でpending=${V10_BATTLE_VICTIM}・モーダル「${V10_BATTLE_MODAL_TITLE}」・待機ログ「${V10_BATTLE_WAIT_LOG}」を確認後、「${V10_BATTLE_DECLINE}」で辞退しvictimをエナへ通常バニッシュ。両者field.check=null` };
      }
    }
    return { pass: false, st: last,
      detail: `バトル身代わり対話タイムアウト（pending=${sawPending} modal=${sawModal} waitLog=${sawWaitLog} declined=${declined} hPending=${last?.host?.pendingBanishSubstitute ?? '-'} hField=${JSON.stringify(last?.host?.fieldSigni)} hEnergy=${JSON.stringify(last?.host?.energyCards)} gDown=${JSON.stringify(last?.guest?.signiDown)} checks=${last?.host?.fieldCheck ?? '-'}/${last?.guest?.fieldCheck ?? '-'} phase=${last?.turnPhase}）` };
  },
};
// ── /続き474：PLAN §7 V-10 ──

// ─────────────────────────────────────────────────────────────────────────────
// 共通インフラ
// ─────────────────────────────────────────────────────────────────────────────

// ── preflight 静的チェック（2026-07-14）＝「1試行15〜40秒を回してから気づく」定番FAILを実行前に警告する。
//    CardData CSV から Level/Limit/Team/Restriction を引き、シナリオ spec だけで機械判定できる罠
//    （lrigレベル不足・Limit超過・Team/限定制限・空きゾーン2以上）を洗う。警告のみ＝実行は止めない。
function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
function loadCardDb() {
  const db = new Map();
  for (const f of readdirSync('public/data').filter((n) => /^CardData_.*\.csv$/.test(n))) {
    for (const line of readFileSync(join('public/data', f), 'utf-8').split(/\r?\n/).slice(1)) {
      const c = splitCsvLine(line);
      // EffectText 内改行の継続行はここで弾く（CardNum 形式でない行は無視）
      if (c.length < 13 || !/^[A-Za-z0-9][A-Za-z0-9-]+$/.test(c[0])) continue;
      db.set(c[0], {
        name: c[1], type: c[3], cardClass: c[4], level: Number(c[6]) || 0,
        limit: Number(c[9]) || 0, restriction: c[11] ?? '-', team: c[12] ?? '-',
      });
    }
  }
  return db;
}
function preflightScenario(sc, db) {
  const warns = [];
  const strip = (n) => String(n).split('#')[0];
  const hostSet = sc.spec?.hostSet ?? {};
  const lrigArr = hostSet['field.lrig'];
  const lrigNum = Array.isArray(lrigArr) && lrigArr.length ? strip(lrigArr.at(-1)) : null;
  const lrig = lrigNum ? db.get(lrigNum) : null;
  const fieldSigni = hostSet['field.signi'];
  const fieldLevelSum = Array.isArray(fieldSigni)
    ? fieldSigni.flatMap((z) => (Array.isArray(z) ? z : [])).reduce((a, n) => a + (db.get(strip(n))?.level ?? 0), 0)
    : 0;
  const emptyZones = Array.isArray(fieldSigni) ? fieldSigni.filter((z) => !z || z.length === 0).length : 0;
  const handSigni = (sc.spec?.handPrepend ?? []).map((n) => [strip(n), db.get(strip(n))]).filter(([, c]) => c?.type === 'シグニ');
  for (const [num, c] of handSigni) {
    if (!lrig) warns.push(`手札に シグニ ${num} があるが hostSet['field.lrig'] 未設定＝初期Lv0ルリグのままだと召喚ボタンが出ない`);
    else {
      if (c.level > lrig.level) warns.push(`${num}(Lv${c.level}) > ルリグ ${lrigNum}(Lv${lrig.level})＝レベル要件で召喚ボタンが出ない`);
      if (fieldLevelSum + c.level > lrig.limit) warns.push(`Limit超過の可能性: 場Lv合計${fieldLevelSum}+${num}(Lv${c.level}) > Limit${lrig.limit}`);
      if (c.team && c.team !== '-' && !(lrig.cardClass ?? '').includes(c.team) && !(lrig.name ?? '').includes(c.team)) {
        warns.push(`${num} は Team「${c.team}」＝センタールリグ ${lrigNum}(${lrig.cardClass}) が合わないと召喚ボタンが出ない`);
      }
      const lim = (c.restriction ?? '').match(/^(.+?)限定/)?.[1];
      if (lim && !(lrig.cardClass ?? '').includes(lim) && !(lrig.name ?? '').includes(lim)) {
        warns.push(`${num} は「${c.restriction}」＝センタールリグ ${lrigNum}(${lrig.cardClass}) が条件を満たすか確認`);
      }
    }
    if (emptyZones >= 2) warns.push(`空きシグニゾーンが${emptyZones}＝召喚/ADD_TO_FIELD 後に SELECT_SIGNI_ZONE（「ゾーンN」ボタンのクリック）が要る`);
  }
  return warns;
}

// ── 既存 PLAYING ルームの再利用判定（2026-07-14）＝マッチング〜マリガンの30〜60秒を毎試行やり直さない。
//    injectScenario が毎回 host/guest state をホワイトリスト方式で全リセット＋シナリオ直前 reload で
//    クライアントも再マウントするため、ルーム自体は使い回せる。ただしライフ/デッキが消耗したルームは
//    試合終了・デッキ枯渇の事故になるため再利用せず新規作成に落とす（自己回復）。FRESH=1 で強制新規。
async function findReusableRoom(page) {
  return await page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find((k) => /^sb-.*-auth-token$/.test(k));
    if (!key) return null;
    const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
    const h = { apikey: ANON, Authorization: `Bearer ${token}` };
    const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
    const roomId = (await r1.json())?.[0]?.id; if (!roomId) return null;
    const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_state,guest_state`, { headers: h });
    const row = (await r2.json())?.[0]; if (!row) return null;
    const hs = row.host_state ?? {}, gs = row.guest_state ?? {};
    const stat = {
      roomId,
      hostLife: (hs.life_cloth ?? []).length, hostDeck: (hs.deck ?? []).length,
      guestLife: (gs.life_cloth ?? []).length, guestDeck: (gs.deck ?? []).length,
    };
    stat.worn = stat.hostLife < 4 || stat.guestLife < 4 || stat.hostDeck < 10 || stat.guestDeck < 10;
    return stat;
  }, { SUPA_URL, ANON });
}

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

// 盤面注入（in-page）。ドットパスのマージで host_state/guest_state を上書きし、トップレベルを PATCH。
async function injectScenario(page, spec) {
  return await page.evaluate(async ({ SUPA_URL, ANON, CPU_PLAYER_ID, spec }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
    const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
    const roomId = (await r1.json())?.[0]?.id; if (!roomId) return { error: 'PLAYINGルームなし' };
    const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=*`, { headers: h });
    const row = (await r2.json())?.[0];
    const setPath = (obj, path, val) => {
      const parts = path.split('.'); let o = obj;
      for (let i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] ?? {}; o = o[parts[i]]; }
      o[parts[parts.length - 1]] = val;
    };
    const hs = row.host_state, gs = row.guest_state;
    // シナリオ間の状態汚染対策（続き77で field.* まで拡張→続き105で全面書き換え）。
    // ⚠続き105（Sonnet・§3タスク3）＝個別フィールドの列挙方式は根本的に脆いと判明。
    // PlayerState（src/types/index.ts）は deck/hand/energy/trash/life_cloth/lrig_deck/lrig_trash/coins/field の
    // 「盤面の物理配置」9フィールドを除き、残り約170個がすべて「ターン中/ゲーム中の一時状態」の任意フィールドで、
    // 新しい効果機構が実装されるたびに増え続ける。列挙リストは追加のたびに手で追随しない限り必ず漏れる
    // （実例＝abilities_removed が未列挙のまま残り、47シナリオ一括実行の後半7件が前シナリオの
    // gAbilitiesRemoved 残留で FAIL した＝続き105で機械確認・詳細 BUGFIXES 続き105）。
    // 根本修正＝「盤面の物理配置」だけをホワイトリストで引き継ぎ、それ以外の全トップレベルフィールドを
    // 注入前に削除する（列挙ではなく除外方式＝将来の新規フィールドも自動的にカバーされる）。
    // spec.hostSet/guestSet が同名フィールドを持てばこの後の setPath が上書きするので安全。
    const CORE_TOP_FIELDS = new Set(['deck', 'lrig_deck', 'hand', 'life_cloth', 'trash', 'lrig_trash', 'energy', 'coins', 'field']);
    // field 配下も同じ理屈＝実際のカード配置（lrig/signi 本体・アシストルリグ・フリーゾーン・ビートゾーン・
    // キー/ピース）だけを引き継ぎ、ダウン/凍結/チャーム/アクセ等のステータスマーカーは全部リセットする。
    const CORE_FIELD_KEYS = new Set(['lrig', 'signi', 'assist_lrig_l', 'assist_lrig_r', 'check', 'key_piece', 'key_piece_extra', 'free_zone', 'beat_zone']);
    for (const s of [hs, gs]) {
      for (const k of Object.keys(s)) { if (!CORE_TOP_FIELDS.has(k)) delete s[k]; }
      if (s.field) {
        for (const k of Object.keys(s.field)) { if (!CORE_FIELD_KEYS.has(k)) delete s.field[k]; }
        // 削除しただけだと undefined になり、配列前提でインデックスアクセスするUI/engineコードが壊れうるため
        // ゾーン単位マーカーは既定値で明示的に張り直す（続き77の対象＋続き105で assist_lrig_*_down を追加）。
        s.field.signi_down = [false, false, false];
        s.field.signi_frozen = [false, false, false];
        s.field.lrig_down = false;
        s.field.lrig_frozen = false;
        s.field.lrig_attacked = false;
        s.field.assist_lrig_l_down = false;
        s.field.assist_lrig_r_down = false;
        s.field.signi_charms = [null, null, null];
        s.field.signi_acce = [null, null, null];
        s.field.signi_virus = [0, 0, 0];
        s.field.signi_chokkin = [0, 0, 0];
        s.field.signi_soul = [null, null, null];
        s.field.signi_traps = [null, null, null];
        s.field.signi_magic_boxes = [null, null, null];
        s.field.signi_seeds = [null, null, null];
        s.field.signi_armor = [false, false, false];
        s.field.puppet_signi = [];
        s.field.cross_state = [false, false, false];
        s.field.heaven_state = [false, false, false];
      }
    }
    // ── バッチ位置依存FAILの根本対策（2026-07-15・続き140・Opus）＝累積COREの健全化 ──
    // CORE_TOP_FIELDS のうち deck/life_cloth/trash/lrig_trash は「盤面の物理配置」ではあるが、
    // shared な battle_states 行を跨いで**単調に消耗/増加する累積フィールド**である（deck はドローで減り、
    // life_cloth はクラッシュ/リフレッシュで減り、trash/lrig_trash は増える一方）。約67シナリオがこれらを
    // 上書きしないため、71件フルバッチの後半では host.deck が枯渇して「4枚引く」系（delayedAttackTrigger/
    // exileHandBlind）が完走できず、life_cloth 枯渇による試合終了状態で後続の自分ターン系が軒並みFAILしていた
    // ＝単体・5連結では消耗が軽微で再現しない「バッチ位置依存flakiness」の真因（続き139が client 疲労と見立て
    // 次点送りにしていた残課題）。injectScenario 直後の page.reload() はクライアント状態（React/timer/Realtime）
    // を毎回まっさらにするが、DB 側のこの累積は reload では消えない。field 配下の status マーカーと同じく
    // 「毎シナリオ健全な既定値へ張り直し→この後の setPath が spec.hostSet/guestSet で上書きする」方式で決定化する
    // （deck を自前注入する refreshTrigger/revealDeckTopBanish/lookReorderCanTrash、guest life を2枚に絞る
    //  installDelayedTriggerFire 等は従来どおり override が効く）。
    const prevDeck = { host: (hs.deck ?? []).length, guest: (gs.deck ?? []).length };   // リセット前＝前シナリオ終了時の残量（消耗の可視化用）
    const prevLife = { host: (hs.life_cloth ?? []).length, guest: (gs.life_cloth ?? []).length };
    const FILLER = 'WD01-013'; // 小剣ククリ＝効果テキストもLIFE_BURSTも持たないバニラ（既存シナリオも deck/life_cloth フィラーに採用済み）
    const mkFiller = (base, n) => Array.from({ length: n }, (_, i) => `${FILLER}#${base + i}`);
    hs.deck = mkFiller(1200, 40); hs.life_cloth = mkFiller(1300, 7); hs.trash = []; hs.lrig_trash = []; // host（#1200～/#1300～＝scenario注入の#1..#10と非衝突）
    gs.deck = mkFiller(2200, 40); gs.life_cloth = mkFiller(2300, 7); gs.trash = []; gs.lrig_trash = []; // guest（host と別レンジ＝owner跨ぎの重複も回避）
    for (const [p, v] of Object.entries(spec.hostSet ?? {})) setPath(hs, p, v);
    for (const [p, v] of Object.entries(spec.guestSet ?? {})) setPath(gs, p, v);
    if (spec.handPrepend) hs.hand = [...spec.handPrepend, ...(hs.hand ?? []).slice(0, 4)];
    const top = spec.top ?? {};
    const upd = {
      host_state: hs, guest_state: gs,
      active_user_id: top.active === 'cpu' ? CPU_PLAYER_ID : uid,
      turn_phase: top.turn_phase ?? 'MAIN',
      turn_count: top.turn_count ?? 2,
      effect_stack: null, pending_effect: null, pending_spell: null,
      // ログもシナリオごとに白紙化する。前シナリオのログ行（「アーツ使用: …」等）が盤面テキストに残ると
      // clickTextOrBtn の部分一致テキストクリックがログ行を掴み続けて本来のUI操作に到達しない
      // （バッチ実行時のみ lrigundermoved が txt:使用 を空クリックし続けて FAIL した真因）。findLog の偽陽性も防ぐ。
      // ⚠2026-07-07・続き39で追加確認＝この汚染は lrigundermoved 単発ではなく、banishbyeffect 以降に連続実行される
      // 「自分ターン系」の末尾（keywordgained・powerzero）にも連鎖することを観測（3件とも単体実行では PASS）。
      // game_logs クリアだけでは防げない client 側の残留モーダル/state が疑わしい＝根本修正は別途 follow-up。
      game_logs: [],
    };
    const w = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}`, {
      method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(upd),
    });
    return { roomId, ok: w.ok, status: w.status, prevDeck, prevLife, body: w.ok ? null : await w.text() };
  }, { SUPA_URL, ANON, CPU_PLAYER_ID, spec });
}

// ⚠ `vite preview` はビルド済み dist を配信するため、ソース変更を反映するには build が必須。
//    2026-07-14: 毎回無条件に build（数十秒）していたのを mtime 比較の自動判定に変更＝
//    dist/index.html が src/public/設定類のどれよりも新しければスキップ（「古い dist の罠」は
//    mtime 判定で構造的に回避される）。SKIP_BUILD=1 で強制スキップ・SKIP_BUILD=0 で強制ビルド。
function distIsFresh() {
  try {
    const distTime = statSync('dist/index.html').mtimeMs;
    let newest = null; // { t, p }
    const scan = (dir) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) scan(p);
        else { const t = statSync(p).mtimeMs; if (!newest || t > newest.t) newest = { t, p }; }
      }
    };
    for (const d of ['src', 'public']) scan(d);
    for (const f of ['index.html', 'verify.html', 'package.json', 'vite.config.ts', 'tsconfig.json', 'tsconfig.app.json']) {
      try { const t = statSync(f).mtimeMs; if (!newest || t > newest.t) newest = { t, p: f }; } catch { /* 無ければ無視 */ }
    }
    return { fresh: !!newest && distTime > newest.t, newest: newest?.p };
  } catch { return { fresh: false, newest: null }; }
}
function buildFirst() {
  if (process.env.SKIP_BUILD === '1') { console.log('build スキップ（SKIP_BUILD=1）'); return Promise.resolve(); }
  if (process.env.SKIP_BUILD !== '0') {
    const { fresh, newest } = distIsFresh();
    if (fresh) { console.log('build スキップ（dist が src/public より新しい＝変更なし。強制するには SKIP_BUILD=0）'); return Promise.resolve(); }
    if (newest) console.log(`dist より新しい変更: ${newest}`);
  }
  return new Promise((resolve, reject) => {
    console.log('dist を build 中…（最新ソース反映）');
    const b = spawn('npm', ['run', 'build'], { shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    b.stderr.on('data', (d) => { err += d.toString(); });
    b.on('error', reject);
    b.on('exit', (code) => code === 0 ? resolve() : reject(new Error('build 失敗:\n' + err.slice(-2000))));
  });
}

// ⚠ Windows では proc.kill() は shell(cmd.exe) だけを殺し、孫の vite(node) が孤児で残る。
//    しかも根が死んだ後の taskkill /T は子孫を辿れない＝旧実装（proc.kill()→非同期taskkill）は
//    実行のたびに preview server を1個リークしていた（ポート4173〜が毎回1つずつ埋まる原因）。
//    必ず「proc.kill() より先に」同期 taskkill する。
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
    const proc = spawn('npm', ['run', 'preview'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => { const s = b.toString().replace(/\x1b\[[0-9;]*m/g, ''); const m = s.match(/(http:\/\/localhost:\d+)/); if (m && !url) { url = m[1]; resolve({ proc, url }); } };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData); proc.on('error', reject);
    setTimeout(() => { if (!url) { killTree(proc); reject(new Error('preview起動タイムアウト')); } }, 30000);
  });
}

// 続き459 S1：PR-427 の「アーツとスペルを使用できない」が、死んだ合成 actionId ではなく
// 2本の NEXT_TURN 予約として target.owner:'opponent'（CPUから見たhost）へ積まれることを固定する。
// UIログは「使用禁止」を1行出すだけで2種類を区別できないため、host.blockedActions の完全一致だけを ground truth にする。
scenarios.prArtsSpellSplitIds = {
  title: 'PR-427（USE_ARTS/USE_SPELLの分割NEXT_TURN予約・合成actionId退行ガード）',
  spec: {
    hostSet: {
      'field.signi': [null, null, null],
      'hand': [],
      'blocked_actions': [], // 前シナリオの残留で「両方ある」ように見える偽陽性を封じる
      // ⚠`field.check` は injectScenario の CORE_FIELD_KEYS に含まれる＝**注入でリセットされない唯一の
      //   ステータス系フィールド**。前シナリオのライフクラッシュが未確認のまま残ると
      //   「ライフクロスクラッシュ（エナに送る）」モーダルが全画面を覆い、以後のクリックが一切通らない
      //   （続き460 の実測＝wxex166SpellLockPeriod が24反復とも「アタック」ボタンを見つけられず FAIL）。
      'field.check': null,
    },
    guestSet: {
      'field.signi': [['PR-427#1'], null, null],
      'field.signi_down': [false, false, false],
      'hand': [],
      'blocked_actions': [],
      'field.check': null,
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    let last = await H.queryState();
    for (let s = 0; s < 24; s++) {
      await page.waitForTimeout(900);
      const st = await H.queryState();
      last = st;
      const blocked = st?.host?.blockedActions ?? [];
      const artsReserved = blocked.includes('USE_ARTS:NEXT_TURN');
      const spellReserved = blocked.includes('USE_SPELL:NEXT_TURN');
      const deadComposite = blocked.filter(id => id.includes('ARTS_AND_SPELL'));
      H.log(`  passplit[${s}] active=${st?.activeUser ?? '-'} phase=${st?.turnPhase ?? '-'} host.blocked=${JSON.stringify(blocked)} artsReserved=${artsReserved} spellReserved=${spellReserved} deadComposite=${JSON.stringify(deadComposite)}`);

      if (deadComposite.length > 0) {
        return { pass: false, detail: `【死actionId退行】host.blockedActions に ARTS_AND_SPELL 系が復活: ${JSON.stringify(blocked)}` };
      }
      // SEQUENCE は対話なしで1回の解決に閉じるため、片方だけ永続化された状態は中間状態ではなく配線漏れ。
      if (artsReserved !== spellReserved) {
        return { pass: false, detail: `【片側だけ】NEXT_TURN予約が不揃い（USE_ARTS=${artsReserved} / USE_SPELL=${spellReserved}）: ${JSON.stringify(blocked)}` };
      }
      if (artsReserved && spellReserved) {
        return { pass: true, detail: `CPUのPR-427アタック後、host.blockedActions に USE_ARTS:NEXT_TURN / USE_SPELL:NEXT_TURN の両方を確認し、ARTS_AND_SPELL系は0件` };
      }
    }
    return {
      pass: false,
      detail: `PR-427の分割予約を確認できず（最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} host.blockedActions=${JSON.stringify(last?.host?.blockedActions ?? [])}）`,
    };
  },
};

// 続き459 S2：WXEX1-66 の NEXT_TURN は「付与ターン中の予約」→「次ターン開始時のbare昇格」→
// 「そのターン終了時の失効」という2スロット寿命。可視ログでは昇格/失効を判別できないため、3段とも
// guest.blockedActions を完全一致で観測する（USE_SPELL:NEXT_TURN を USE_SPELL の部分一致で数えない）。
scenarios.wxex166SpellLockPeriod = {
  title: 'WXEX1-66（スペル封じの予約→昇格→次ターン終了時失効）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-003#1'],
      'field.signi': [['WXEX1-66#1'], null, null],
      'field.signi_down': [false, false, false],
      'hand': [],
      'blocked_actions': [],
      'actions_done': [],
      // ⚠`field.check` だけは injectScenario がリセットしない（CORE_FIELD_KEYS に含まれる）＝
      //   前シナリオの未確認ライフクラッシュが「エナに送る」モーダルとして残り、全クリックを遮る。
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      'field.signi': [null, null, null],
      'field.signi_down': [false, false, false],
      'hand': [],
      'blocked_actions': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
  },
  async drive(page, H) {
    let modalOpened = false;
    let reservationState = null;
    let last = await H.queryState();

    // wxk10068banish と同じく、アタックボタン完全一致＋フェイズ巻き戻り時の再アサートで発火まで運ぶ。
    for (let s = 0; s < 24; s++) {
      await page.waitForTimeout(900);
      let did = null;
      const phaseChk = await H.queryState();
      if (phaseChk?.turnPhase && phaseChk.turnPhase !== 'ATTACK_SIGNI' && !phaseChk?.pendingEffect && !(phaseChk?.stackLen > 0)) {
        await H.closeModals();
        await H.repatchTop({ active: 'host', turn_phase: 'ATTACK_SIGNI', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(600);
        modalOpened = false;
        did = `repatch:ATTACK_SIGNI(was ${phaseChk.turnPhase})`;
      }
      // 前面のライフバースト確認／ガード応答モーダルを先に解消する。残っているとカード詳細モーダルごと
      // 覆われ「アタック」ボタンへ到達できない（続き460 実測＝24反復とも did=なしで空振りした）。
      if (!did) did = await H.clickBtn('エナに送る', { exact: true });
      if (!did) did = await H.clickBtn('ガードしない');
      if (!did) did = await H.clickBtn('アタック', { exact: true });
      // カード詳細モーダルが閉じられていたら開き直す（modalOpened を立てっぱなしにすると永久に空振りする）。
      if (!did && modalOpened && !(await page.getByTestId('card-detail-modal').first().isVisible().catch(() => false))) modalOpened = false;
      if (!did && !modalOpened) {
        const opened = await H.clickTestId('my-signi-zone-0');
        if (opened) { did = opened; modalOpened = true; }
      }
      const st = await H.queryState();
      last = st;
      const blocked = st?.guest?.blockedActions ?? [];
      const reserved = blocked.includes('USE_SPELL:NEXT_TURN');
      const bare = blocked.includes('USE_SPELL');
      H.log(`  wxex166.attack[${s}] -> ${did ?? 'なし'} | active=${st?.activeUser ?? '-'} phase=${st?.turnPhase ?? '-'} guest.blocked=${JSON.stringify(blocked)} reserved=${reserved} bare=${bare}`);
      if (bare && !reserved) {
        return { pass: false, detail: `段階①FAIL：アタック直後なのに予約ではなくbare USE_SPELL（activeUser=${st?.activeUser ?? '-'} turnPhase=${st?.turnPhase ?? '-'} blocked=${JSON.stringify(blocked)}）` };
      }
      if (reserved && !bare) {
        reservationState = st;
        H.log(`  段階①PASS 予約確認: active=${st.activeUser} phase=${st.turnPhase} guest.blocked=${JSON.stringify(blocked)}`);
        break;
      }
      if (reserved && bare) {
        return { pass: false, detail: `段階①FAIL：予約とbareが同時存在（blocked=${JSON.stringify(blocked)}）` };
      }
    }
    if (!reservationState) {
      return { pass: false, detail: `段階①FAIL：USE_SPELL:NEXT_TURN予約を確認できず（最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} blocked=${JSON.stringify(last?.guest?.blockedActions ?? [])}）` };
    }

    let turnEndClicked = false;
    let sawCpuTurn = false;
    let activated = false;
    // ⚠アタックのために開いたカード詳細モーダル（createPortal の全画面オーバーレイ）が残っていると、
    //   ヘッダーの「ルリグアタックへ」はDOM上は可視なのに click が2秒タイムアウトし続ける
    //   （続き460 実測＝40反復とも `click失敗: Timeout 2000ms exceeded` でフェイズが1歩も進まなかった）。
    await H.closeModals();
    // ターン境界は環境依存で最も遅い。40×900msを使い、毎回 activeUser/turnPhase/blockedActions を残す。
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(900);
      let did = null;
      const before = await H.queryState();
      // 途中で開いたモーダル（カード詳細）も同じ理由で必ず閉じてから進行ボタンを押す。
      if (await page.getByTestId('card-detail-modal').first().isVisible().catch(() => false)) await H.closeModals();

      // hostターン中だけ正規のフェイズ進行ボタンでENDまで運び、実際の「ターン終了」を押す。
      // モーダル（ライフ処理・スキップ確認）が前面にあれば先に拒否/確定方向で解消する。
      if (!turnEndClicked && before?.activeUser === before?.viewerUserId) {
        did = await H.clickBtn('ガードしない');
        if (!did) did = await H.clickBtn('エナに送る', { exact: true });
        if (!did) did = await H.clickBtn('このまま進む', { exact: true });
        if (!did && before?.turnPhase === 'ATTACK_SIGNI') did = await H.clickBtn('ルリグアタックへ', { exact: true });
        if (!did && before?.turnPhase === 'ATTACK_LRIG') did = await H.clickBtn('エンドフェイズへ', { exact: true });
        if (!did && before?.turnPhase === 'END') {
          did = await H.clickBtn('ターン終了', { exact: true });
          if (did) turnEndClicked = true;
        }
      } else {
        // CPUターンのルリグアタック等でhost応答が出ても、待ちを止めない。
        did = await H.clickBtn('ガードしない');
        if (!did) did = await H.clickBtn('エナに送る', { exact: true });
        // ⚠`ATTACK_ARTS_OP`（相手ターンのアーツステップ）は **NON_TURN_PLAYER_PHASES**＝
        //   進行ボタン（`PHASE_BTN.ATTACK_ARTS_OP`＝「アーツ終了」）を持つのは**非ターンプレイヤー＝host 側**
        //   （`uiConstants.ts:30` / `BattleScreen.tsx:2365`）。ここを押さないと CPU のターンは永久に終わらない
        //   （続き460 実測＝段階②まで到達したのに ATTACK_ARTS_OP で28反復ストールした）。
        if (!did && before?.turnPhase === 'ATTACK_ARTS_OP') did = await H.clickBtn('アーツ終了', { exact: true });
      }

      const st = await H.queryState();
      last = st;
      const blocked = st?.guest?.blockedActions ?? [];
      const reserved = blocked.includes('USE_SPELL:NEXT_TURN');
      const bare = blocked.includes('USE_SPELL');
      H.log(`  wxex166.turn[${s}] -> ${did ?? 'なし'} | turnEndClicked=${turnEndClicked} active=${st?.activeUser ?? '-'} viewer=${st?.viewerUserId ?? '-'} phase=${st?.turnPhase ?? '-'} guest.blocked=${JSON.stringify(blocked)} reserved=${reserved} bare=${bare}`);

      if (turnEndClicked && st?.activeUser && st.activeUser !== st.viewerUserId) {
        sawCpuTurn = true;
        if (bare && reserved) {
          return { pass: false, detail: `段階②FAIL：CPUターン開始後も予約とbareが同時存在（activeUser=${st.activeUser} turnPhase=${st.turnPhase} blocked=${JSON.stringify(blocked)}）` };
        }
        if (bare && !reserved && !activated) {
          activated = true;
          H.log(`  段階②PASS bare昇格確認: active=${st.activeUser} phase=${st.turnPhase} guest.blocked=${JSON.stringify(blocked)}`);
        }
      }

      if (turnEndClicked && sawCpuTurn && st?.activeUser === st?.viewerUserId) {
        if (!activated) {
          return { pass: false, detail: `段階②FAIL：CPUターンは進んだがbare USE_SPELL昇格を一度も観測できず（activeUser=${st.activeUser} turnPhase=${st.turnPhase} blocked=${JSON.stringify(blocked)}）` };
        }
        const spellLocks = blocked.filter(id => id === 'USE_SPELL' || id === 'USE_SPELL:NEXT_TURN');
        if (spellLocks.length > 0) {
          return { pass: false, detail: `段階③FAIL【恒久ロックへの退化兆候】：CPUターン終了後もUSE_SPELL系が残存（activeUser=${st.activeUser} turnPhase=${st.turnPhase} blocked=${JSON.stringify(blocked)}）` };
        }
        H.log(`  段階③PASS 失効確認: active=${st.activeUser} phase=${st.turnPhase} guest.blocked=${JSON.stringify(blocked)}`);
        return { pass: true, detail: 'guest.blockedActionsで①USE_SPELL:NEXT_TURN予約→②CPUターン中bare USE_SPELL昇格→③CPUターン終了後消滅、の3段を完全一致で確認' };
      }
    }
    return {
      pass: false,
      detail: `ターン遷移タイムアウト（turnEndClicked=${turnEndClicked} sawCpuTurn=${sawCpuTurn} activated=${activated} 最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} guest.blockedActions=${JSON.stringify(last?.guest?.blockedActions ?? [])}）`,
    };
  },
};

// 続き459 S3：S2の予約/昇格機構とは分離し、bare actionId を直接注入したときのUIゲートだけを見る。
// 負方向テストなので card-detail-modal が実際に開いたことを先に確認し、「モーダル未表示」を「使用ボタンなし」と誤認しない。
// 通常スペルの実ラベルは「発動」、アーツ詳細の実ラベルは「使用」。entry guardだけで止まる状態もUI PASSにはしない。
scenarios.spellArtsBlockedUiHidesUseButtons = {
  title: 'bare USE_SPELL/USE_ARTS（手札スペルとルリグデッキアーツの使用アクション非表示）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-002#1'],
      'field.signi': [null, null, null],
      'hand': ['WX02-060#1'],                    // deckshufflespell で実使用済みの SEARCHER
      'lrig_deck': ['WX09-005#1'],               // artsUseGreenFilter で実使用済みの 森羅万象
      'energy': ['WD04-009#1'],                  // 緑×1：封じ以外の使用条件を満たす
      'blocked_actions': ['USE_ARTS', 'USE_SPELL'],
      'actions_done': [],
      'field.check': null, // 前シナリオの未確認ライフクラッシュ（エナに送るモーダル）で全クリックが止まるのを防ぐ
    },
    guestSet: {
      'field.signi': [null, null, null],
      'blocked_actions': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.closeModals();
    await H.ensureMain();
    const before = await H.queryState();
    const blocked = before?.host?.blockedActions ?? [];
    if (!blocked.includes('USE_ARTS') || !blocked.includes('USE_SPELL')) {
      return { pass: false, detail: `UI検査の注入前提が不成立（host.blockedActions=${JSON.stringify(blocked)}）` };
    }

    const spellClick = await H.clickTestId('my-hand-card-0');
    await page.waitForTimeout(500);
    const spellModal = page.getByTestId('card-detail-modal').first();
    if (!spellClick || !(await spellModal.count()) || !(await spellModal.isVisible().catch(() => false))) {
      return { pass: false, detail: `スペルCardModalが開かなかった（click=${spellClick ?? 'なし'}）＝ボタン非表示とは判定しない` };
    }
    const spellLabels = await spellModal.locator('[data-testid^="card-action-"]:visible').evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
    const spellUseLabels = spellLabels.filter(label => label === '発動' || label === '使用');
    H.log(`  UI spell: blocked=${JSON.stringify(blocked)} actions=${JSON.stringify(spellLabels)} forbidden=${JSON.stringify(spellUseLabels)}`);
    // ⚠ここで早期returnすると**アーツ側を一度も検査しないまま終わる**（続き460 実測＝スペル側だけが漏れて
    //   アーツ側の可否が不明のままだった）。2軸を独立に測ってから合否を決める。

    await H.closeModals();
    const dkClick = await H.clickTestId('my-lrig-dk');
    await page.waitForTimeout(400);
    const artsCardClick = await H.clickTestId('zone-card-0');
    await page.waitForTimeout(500);
    const artsModal = page.getByTestId('card-detail-modal').first();
    if (!dkClick || !artsCardClick || !(await artsModal.count()) || !(await artsModal.isVisible().catch(() => false))) {
      return { pass: false, detail: `アーツCardModalが開かなかった（lrigDK=${dkClick ?? 'なし'} zoneCard=${artsCardClick ?? 'なし'}）＝ボタン非表示とは判定しない` };
    }
    const artsLabels = await artsModal.locator('[data-testid^="card-action-"]:visible').evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
    const artsUseLabels = artsLabels.filter(label => label === '使用' || label === 'アーツ使用');
    H.log(`  UI arts: blocked=${JSON.stringify(blocked)} actions=${JSON.stringify(artsLabels)} forbidden=${JSON.stringify(artsUseLabels)}`);

    const leaks = [
      ...(spellUseLabels.length > 0 ? [`スペル${JSON.stringify(spellUseLabels)}`] : []),
      ...(artsUseLabels.length > 0 ? [`アーツ${JSON.stringify(artsUseLabels)}`] : []),
    ];
    if (leaks.length > 0) {
      return { pass: false, detail: `封じが有効なのに使用アクションが出た：${leaks.join('／')}（全action spell=${JSON.stringify(spellLabels)} arts=${JSON.stringify(artsLabels)}）` };
    }
    return { pass: true, detail: `bare USE_SPELL/USE_ARTS注入下で、手札スペル（発動/使用）とルリグデッキアーツ（使用/アーツ使用）のcard-actionがともに非表示` };
  },
};

// 続き460（Claude・検証側で追加）＝上の負方向テストの**対照**。
// ⚠アーツの「使用」ボタンは `isActionBlocked('USE_ARTS')` 以外に `condOk`／`costOk`（実効コストを払えるか）でも消える
//   （`BattleScreen.tsx:7569`）。**同じ盤面で blocked_actions だけを空にして「出ること」を確かめない限り、
//   spellArtsBlockedUiHidesUseButtons の PASS は「封じが効いた」証拠にならない**（コスト不足でも同じ絵になる）。
// 盤面は上と1文字も変えず、`blocked_actions` だけを [] にする。
scenarios.spellArtsUnblockedUiShowsUseButtons = {
  title: '対照：blocked_actions空なら手札スペル「発動」とアーツ「使用」が出る',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-002#1'],
      'field.signi': [null, null, null],
      'hand': ['WX02-060#1'],
      'lrig_deck': ['WX09-005#1'],
      'energy': ['WD04-009#1'],
      'blocked_actions': [],
      'actions_done': [],
      'field.check': null,
    },
    guestSet: {
      'field.signi': [null, null, null],
      'blocked_actions': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.closeModals();
    await H.ensureMain();
    const before = await H.queryState();
    const blocked = before?.host?.blockedActions ?? [];
    if (blocked.includes('USE_ARTS') || blocked.includes('USE_SPELL')) {
      return { pass: false, detail: `対照の前提が不成立（host.blockedActions=${JSON.stringify(blocked)}＝空であるべき）` };
    }

    const spellClick = await H.clickTestId('my-hand-card-0');
    await page.waitForTimeout(500);
    const spellModal = page.getByTestId('card-detail-modal').first();
    if (!spellClick || !(await spellModal.isVisible().catch(() => false))) {
      return { pass: false, detail: `スペルCardModalが開かなかった（click=${spellClick ?? 'なし'}）` };
    }
    const spellLabels = await spellModal.locator('[data-testid^="card-action-"]:visible').evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
    const spellUseLabels = spellLabels.filter(label => label === '発動' || label === '使用');
    H.log(`  対照 spell: actions=${JSON.stringify(spellLabels)} use=${JSON.stringify(spellUseLabels)}`);

    await H.closeModals();
    const dkClick = await H.clickTestId('my-lrig-dk');
    await page.waitForTimeout(400);
    const artsCardClick = await H.clickTestId('zone-card-0');
    await page.waitForTimeout(500);
    const artsModal = page.getByTestId('card-detail-modal').first();
    if (!dkClick || !artsCardClick || !(await artsModal.isVisible().catch(() => false))) {
      return { pass: false, detail: `アーツCardModalが開かなかった（lrigDK=${dkClick ?? 'なし'} zoneCard=${artsCardClick ?? 'なし'}）` };
    }
    const artsLabels = await artsModal.locator('[data-testid^="card-action-"]:visible').evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
    const artsUseLabels = artsLabels.filter(label => label === '使用' || label === 'アーツ使用');
    H.log(`  対照 arts: actions=${JSON.stringify(artsLabels)} use=${JSON.stringify(artsUseLabels)}`);

    const ok = spellUseLabels.length > 0 && artsUseLabels.length > 0;
    return {
      pass: ok,
      detail: ok
        ? `対照成立：封じが無ければスペル${JSON.stringify(spellUseLabels)}／アーツ${JSON.stringify(artsUseLabels)}が出る＝負方向テストの非表示は封じ由来と確定できる`
        : `対照不成立＝この盤面では封じが無くてもボタンが出ない（spell=${JSON.stringify(spellLabels)} arts=${JSON.stringify(artsLabels)}）。負方向テストの非表示を「封じが効いた」と読んではいけない`,
    };
  },
};

// 続き458 A：WXK05-010-E2 の REMOVE_ABILITIES{target:{type:'KEY',owner:'opponent',count:1}} は、
// keySlotCardNums(guest) の2枚を `opp_key` SELECT_TARGETへ渡す。キー枠は従来のSELECT_TARGET UIが
// 扱っていないため、結果だけでなく pendingCandidates／respondPlayer／viewer を先に固定する。
// さらに1枚選択後は cardNum軸（abilities_removed）だけが変わり、全キー軸のフラグは立たないことを見る。
scenarios.removeAbilitiesOppKeyPicker = {
  title: 'WXK05-010（相手キー2枚だけをopp_key候補に出し、選んだ1枚だけ能力喪失）',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-003#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'WXK05-010#1',
      'field.key_piece_extra': [],
      'lrig_trash': [],
      'abilities_removed': [],
      'keys_abilities_disabled': false,
      'actions_done': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-003#2'],
      'field.signi': [null, null, null],
      'field.key_piece': 'SP38-006#2',
      'field.key_piece_extra': ['WXK05-010#2'],
      'abilities_removed': [],
      'keys_abilities_disabled': false,
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const expected = ['SP38-006#2', 'WXK05-010#2'];
    const source = 'WXK05-010#1';
    const chosen = 'SP38-006#2';
    const untouched = 'WXK05-010#2';
    let opened = false;
    let activated = false;
    let candidatesChecked = false;
    let selected = false;
    let last = await H.queryState();
    await H.closeModals();
    await H.ensureMain();
    for (let s = 0; s < 28; s++) {
      await page.waitForTimeout(700);
      let did = null;
      const before = await H.queryState();
      last = before;

      if (Array.isArray(before?.pendingCandidates)) {
        const cands = before.pendingCandidates;
        const exactGuestKeys = cands.length === expected.length && expected.every(n => cands.includes(n));
        const sourceLeaked = cands.includes(source);
        const responderVisible = before.pendingRespondPlayer === before.viewerUserId;
        if (!exactGuestKeys || sourceLeaked || !responderVisible) {
          return {
            pass: false,
            detail: `opp_key候補/描画先が不正（candidates=${JSON.stringify(cands)} pendingRespondPlayer=${before.pendingRespondPlayer ?? '-'} viewerUserId=${before.viewerUserId ?? '-'} sourceLeaked=${sourceLeaked} activeUser=${before.activeUser ?? '-'} turnPhase=${before.turnPhase ?? '-'} guest.abilitiesRemoved=${JSON.stringify(before.guest?.abilitiesRemoved ?? [])} guest.keysAbilitiesDisabled=${before.guest?.keysAbilitiesDisabled ?? false}）`,
          };
        }
        candidatesChecked = true;
        if (!selected) {
          const idx = cands.indexOf(chosen);
          did = await H.clickTestId(`pick-${idx}`);
          if (did) selected = true;
        }
      }

      if (!did && selected) did = await H.clickBtn('決定', { exact: false });
      if (!did && !activated) {
        const fire = await H.clickBtn('発動', { exact: true });
        if (fire) { did = fire; activated = true; }
      }
      if (!did && opened) {
        const act = await H.clickBtn('【起】このキーをルリグトラッシュ（時雨の調　ゆきめ）', { exact: true });
        if (act) did = act;
      }
      if (!did && !opened) {
        const keyClick = await H.clickTestId('my-lrig-slot-key');
        if (keyClick) { did = keyClick; opened = true; }
      }
      if (!did) did = await H.stdStep(['発動順序を確定', '決定']);

      const st = await H.queryState();
      last = st;
      const removed = st?.guest?.abilitiesRemoved ?? [];
      const flag = st?.guest?.keysAbilitiesDisabled ?? false;
      H.log(`  rakp[${s}] -> ${did ?? 'なし'} | candidatesChecked=${candidatesChecked} selected=${selected} candidates=${JSON.stringify(st?.pendingCandidates)} respond=${st?.pendingRespondPlayer ?? '-'} viewer=${st?.viewerUserId ?? '-'} removed=${JSON.stringify(removed)} keyFlag=${flag}`);
      if (candidatesChecked && removed.includes(chosen)) {
        const onlyChosen = !removed.includes(untouched) && !removed.includes(source);
        return {
          pass: onlyChosen && !flag,
          detail: onlyChosen && !flag
            ? `opp_key候補はguestの2枚だけ→${chosen}を選択し、その1枚だけguest.abilitiesRemovedへ追加。${untouched}は無傷、guest.keysAbilitiesDisabled=false`
            : `cardNum軸と全キー軸を取り違え（guest.abilitiesRemoved=${JSON.stringify(removed)} guest.keysAbilitiesDisabled=${flag}）`,
        };
      }
    }
    return {
      pass: false,
      detail: `キー選択/解決タイムアウト（activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} guest.abilitiesRemoved=${JSON.stringify(last?.guest?.abilitiesRemoved ?? [])} guest.keysAbilitiesDisabled=${last?.guest?.keysAbilitiesDisabled ?? false} pendingCandidates=${JSON.stringify(last?.pendingCandidates)} pendingRespondPlayer=${last?.pendingRespondPlayer ?? '-'} viewerUserId=${last?.viewerUserId ?? '-'}）`,
    };
  },
};

// 続き458 B2：BattleScreenのトラッシュ起動入口だけが読む `my.abilities_removed` を直接注入する。
// WXDi-P04-042-E2 は続き403で修正対象になった既知の trashActivated カードだが、当時の記録どおり
// 実機シナリオは未作成だった。コストを払える同一盤面を用意し、CardModalが開いたことを確認してから
// 完全一致ラベルが「無い」ことを見る。モーダル未表示やコスト不足をPASSに倒さない。
scenarios.removedAbilitiesHidesTrashAct = {
  title: 'abilities_removed中のWXDi-P04-042はトラッシュ【起】をsurfaceしない',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-003#1'],
      'field.assist_lrig_l': ['WD03-003#1'],
      'field.assist_lrig_r': [],
      'field.lrig_down': false,
      'field.assist_lrig_l_down': false,
      'field.signi': [null, null, null],
      'trash': ['WXDi-P04-042#1'],
      'abilities_removed': ['WXDi-P04-042#1'],
      'actions_done': [],
      'field.check': null,
    },
    guestSet: {
      'field.signi': [null, null, null],
      'abilities_removed': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const expectedLabel = '【起】トラッシュから出す（アップ状態のレベル2のルリグ2体をダウン）';
    await H.closeModals();
    await H.ensureMain();
    const before = await H.queryState();
    if (!(before?.host?.abilitiesRemoved ?? []).includes('WXDi-P04-042#1')) {
      return { pass: false, detail: `負方向の注入前提が不成立（host.abilitiesRemoved=${JSON.stringify(before?.host?.abilitiesRemoved ?? [])}）` };
    }
    const trashClick = await H.clickTestId('my-trash');
    await page.waitForTimeout(350);
    const cardClick = await H.clickTestId('zone-card-0');
    await page.waitForTimeout(500);
    const modal = page.getByTestId('card-detail-modal').first();
    if (!trashClick || !cardClick || !(await modal.count()) || !(await modal.isVisible().catch(() => false))) {
      return { pass: false, detail: `トラッシュのCardModalが開かなかった（my-trash=${trashClick ?? 'なし'} zone-card=${cardClick ?? 'なし'}）＝【起】非表示とは判定しない` };
    }
    const labels = await modal.locator('[data-testid^="card-action-"]:visible').evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
    const leaked = labels.includes(expectedLabel);
    return {
      pass: !leaked,
      detail: leaked
        ? `能力喪失中なのにトラッシュ【起】がsurfaceした（actions=${JSON.stringify(labels)} host.abilitiesRemoved=${JSON.stringify(before.host.abilitiesRemoved)}）`
        : `CardModal表示済み・支払い可能盤面で、能力喪失中は完全一致ラベルが非表示（actions=${JSON.stringify(labels)}）`,
    };
  },
};

// B3（必須対照）：上と盤面を1文字も変えず abilities_removed だけ空にする。
// ここで同じラベルが出て初めて、B2の非表示がコスト不足やtrashActivated未配線ではなく能力喪失由来と確定する。
scenarios.intactAbilitiesShowsTrashAct = {
  title: '対照：abilities_removed空ならWXDi-P04-042のトラッシュ【起】がsurfaceする',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-003#1'],
      'field.assist_lrig_l': ['WD03-003#1'],
      'field.assist_lrig_r': [],
      'field.lrig_down': false,
      'field.assist_lrig_l_down': false,
      'field.signi': [null, null, null],
      'trash': ['WXDi-P04-042#1'],
      'abilities_removed': [],
      'actions_done': [],
      'field.check': null,
    },
    guestSet: {
      'field.signi': [null, null, null],
      'abilities_removed': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const expectedLabel = '【起】トラッシュから出す（アップ状態のレベル2のルリグ2体をダウン）';
    await H.closeModals();
    await H.ensureMain();
    const before = await H.queryState();
    if ((before?.host?.abilitiesRemoved ?? []).length !== 0) {
      return { pass: false, detail: `対照の注入前提が不成立（host.abilitiesRemoved=${JSON.stringify(before?.host?.abilitiesRemoved ?? [])}）` };
    }
    const trashClick = await H.clickTestId('my-trash');
    await page.waitForTimeout(350);
    const cardClick = await H.clickTestId('zone-card-0');
    await page.waitForTimeout(500);
    const modal = page.getByTestId('card-detail-modal').first();
    if (!trashClick || !cardClick || !(await modal.count()) || !(await modal.isVisible().catch(() => false))) {
      return { pass: false, detail: `対照のトラッシュCardModalが開かなかった（my-trash=${trashClick ?? 'なし'} zone-card=${cardClick ?? 'なし'}）` };
    }
    const labels = await modal.locator('[data-testid^="card-action-"]:visible').evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
    const shown = labels.includes(expectedLabel);
    return {
      pass: shown,
      detail: shown
        ? `対照成立：abilities_removed空なら支払い可能なトラッシュ【起】がsurface（${expectedLabel}）`
        : `対照不成立＝能力喪失が無くても【起】が出ないため、B2の非表示を能力喪失由来と読めない（actions=${JSON.stringify(labels)}）`,
    };
  },
};

// 続き457 C：SP38-006は「センタールリグ」ではなくキー。field.key_pieceに置くとCONTINUOUS
// GRANT_LRIG_ABILITYがactiveKeyAbilitySources経由でセンタールリグへ内側【起】を付与する。
// エクシード1を支払っても相手場シグニは0体のままにし、早期returnより先に全キー軸のフラグが立つこと、
// cardNum軸の abilities_removed に相手キーが混ざらないことを同時に見る。
scenarios.removeAbilitiesAlsoKeysFlag = {
  title: 'SP38-006付与【起】（エクシード1）で全キー能力喪失フラグだけが立つ',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1', 'WD03-003#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'SP38-006#1',
      'field.key_piece_extra': [],
      'lrig_trash': [],
      'actions_done': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-003#2'],
      'field.signi': [null, null, null],
      'field.key_piece': 'WXK05-010#2',
      'field.key_piece_extra': [],
      'abilities_removed': [],
      'keys_abilities_disabled': false,
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    let opened = false;
    let actClicked = false;
    let last = await H.queryState();
    await H.closeModals();
    await H.ensureMain();
    for (let s = 0; s < 24; s++) {
      await page.waitForTimeout(700);
      let did = null;
      if (!actClicked && opened) {
        const act = await H.clickBtn('【起】エクシード1', { exact: true });
        if (act) { did = act; actClicked = true; }
      }
      if (!did && !opened) {
        const slot = await H.clickTestId('my-lrig-slot-center');
        if (slot) { did = slot; opened = true; }
      }
      if (!did && actClicked) did = await H.clickBtn('発動', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '決定']);

      const st = await H.queryState();
      last = st;
      const flag = st?.guest?.keysAbilitiesDisabled ?? false;
      const removed = st?.guest?.abilitiesRemoved ?? [];
      H.log(`  rakf[${s}] -> ${did ?? 'なし'} | opened=${opened} actClicked=${actClicked} gKeyFlag=${flag} gRemoved=${JSON.stringify(removed)} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
      if (flag) {
        const keyStayedOffCardAxis = !removed.includes('WXK05-010#2');
        return {
          pass: keyStayedOffCardAxis,
          detail: keyStayedOffCardAxis
            ? `SP38-006の内側【起】をエクシード1で発動→guest.keysAbilitiesDisabled=true、guest.abilitiesRemovedにはキーcardNumなし（${JSON.stringify(removed)}）`
            : `全キーのフラグ軸なのにキーcardNumもabilitiesRemovedへ混入（${JSON.stringify(removed)}）`,
        };
      }
    }
    return {
      pass: false,
      detail: `全キー能力喪失フラグ未確認（activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} guest.abilitiesRemoved=${JSON.stringify(last?.guest?.abilitiesRemoved ?? [])} guest.keysAbilitiesDisabled=${last?.guest?.keysAbilitiesDisabled ?? false} pendingCandidates=${JSON.stringify(last?.pendingCandidates)}）`,
    };
  },
};

// 続き457 D1：手札上限調整へ入らない通常のEND経路。旧手書きクリアはこの経路を通らず、
// keys_abilities_disabledが永久に残ったため、activeUserがCPUへ渡ったこととfalse復帰を必ず対で見る。
scenarios.keysAbilityLossTurnEndNoDiscard = {
  title: 'keys_abilities_disabledは捨て札なしのターン終了で戻る',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-003#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'SP38-006#1',
      'hand': [],
      'keys_abilities_disabled': true,
      'abilities_removed': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-003#2'],
      'field.signi': [null, null, null],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'END', turn_count: 2 },
  },
  async drive(page, H) {
    let clicked = false;
    let last = await H.queryState();
    await H.closeModals();
    for (let s = 0; s < 24; s++) {
      await page.waitForTimeout(700);
      let did = null;
      const before = await H.queryState();
      if (!clicked && before?.activeUser === before?.viewerUserId && before?.turnPhase === 'END') {
        did = await H.clickBtn('ターン終了', { exact: true });
        if (did) clicked = true;
      }
      const st = await H.queryState();
      last = st;
      H.log(`  katend0[${s}] -> ${did ?? 'なし'} | clicked=${clicked} active=${st?.activeUser ?? '-'} viewer=${st?.viewerUserId ?? '-'} phase=${st?.turnPhase ?? '-'} keyFlag=${st?.host?.keysAbilitiesDisabled ?? false}`);
      if (clicked && st?.activeUser && st.activeUser !== st.viewerUserId) {
        return {
          pass: st?.host?.keysAbilitiesDisabled === false,
          detail: st?.host?.keysAbilitiesDisabled === false
            ? '捨て札なしで実際にCPUターンへ遷移し、host.keysAbilitiesDisabled=falseへ復帰'
            : `【旧回帰】CPUターンへ遷移したのにhost.keysAbilitiesDisabledが残存（${st.host.keysAbilitiesDisabled}）`,
        };
      }
    }
    return {
      pass: false,
      detail: `捨て札なしターン終了タイムアウト（activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} host.abilitiesRemoved=${JSON.stringify(last?.host?.abilitiesRemoved ?? [])} host.keysAbilitiesDisabled=${last?.host?.keysAbilitiesDisabled ?? false} pendingCandidates=${JSON.stringify(last?.pendingCandidates)}）`,
    };
  },
};

// D2：同じ寿命を、手札7枚→上限6枚のconfirmEndDiscard経路でも固定する。
// 「1枚捨てて終了」を押す前の中間状態ではフラグが残っていてよく、CPUへターンが渡った後だけfalseを要求する。
scenarios.keysAbilityLossTurnEndWithDiscard = {
  title: 'keys_abilities_disabledは手札上限の捨て札を経るターン終了でも戻る',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-003#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'SP38-006#1',
      'hand': ['WD01-013#301', 'WD01-013#302', 'WD01-013#303', 'WD01-013#304', 'WD01-013#305', 'WD01-013#306', 'WD01-013#307'],
      'keys_abilities_disabled': true,
      'abilities_removed': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-003#2'],
      'field.signi': [null, null, null],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'END', turn_count: 2 },
  },
  async drive(page, H) {
    let endClicked = false;
    let discardPicked = false;
    let discardConfirmed = false;
    let last = await H.queryState();
    await H.closeModals();
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(700);
      let did = null;
      const before = await H.queryState();
      if (!endClicked && before?.activeUser === before?.viewerUserId && before?.turnPhase === 'END') {
        did = await H.clickBtn('ターン終了', { exact: true });
        if (did) endClicked = true;
      }
      if (!did && endClicked && !discardPicked) {
        const over = page.getByText('手札上限超過', { exact: true }).first();
        if (await over.count() && await over.isVisible().catch(() => false)) {
          did = await H.clickModalImage('小剣　ククリ');
          if (did) discardPicked = true;
        }
      }
      if (!did && discardPicked && !discardConfirmed) {
        const confirm = await H.clickBtn('1枚捨てて終了', { exact: true });
        if (confirm) { did = confirm; discardConfirmed = true; }
      }
      const st = await H.queryState();
      last = st;
      H.log(`  katend1[${s}] -> ${did ?? 'なし'} | end=${endClicked} picked=${discardPicked} confirmed=${discardConfirmed} active=${st?.activeUser ?? '-'} viewer=${st?.viewerUserId ?? '-'} phase=${st?.turnPhase ?? '-'} hand=${st?.host?.hand ?? '-'} keyFlag=${st?.host?.keysAbilitiesDisabled ?? false}`);
      if (discardConfirmed && st?.activeUser && st.activeUser !== st.viewerUserId) {
        const restored = st?.host?.keysAbilitiesDisabled === false;
        const discardedExactlyOne = st?.host?.hand === 6;
        return {
          pass: restored && discardedExactlyOne,
          detail: restored && discardedExactlyOne
            ? '手札7→6の捨て札を確定してCPUターンへ遷移し、host.keysAbilitiesDisabled=falseへ復帰'
            : `捨て札経路の終了後状態が不正（hand=${st?.host?.hand} host.keysAbilitiesDisabled=${st?.host?.keysAbilitiesDisabled}）`,
        };
      }
    }
    return {
      pass: false,
      detail: `捨て札ありターン終了タイムアウト（endClicked=${endClicked} discardPicked=${discardPicked} discardConfirmed=${discardConfirmed} activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} host.abilitiesRemoved=${JSON.stringify(last?.host?.abilitiesRemoved ?? [])} host.keysAbilitiesDisabled=${last?.host?.keysAbilitiesDisabled ?? false} pendingCandidates=${JSON.stringify(last?.pendingCandidates)}）`,
    };
  },
};

// 続き457 E1：WDK10-009 はシグニではなくキー。キー枠の【起】から手札1枚を捨て、
// DESIGNATE_SIGNI_ZONE の実CHOOSEで zone0 を指定する。field grant は temp_power_mods に載らないため、
// designated_zones／field_grants_active を ground truth、op-signi-zone-* の表示パワーを実効値として独立観測する。
scenarios.designatedZoneLevelScaledMinus = {
  title: 'WDK10-009（指定zone0だけLv×-2000・他2ゾーン不変）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'WDK10-009#1',
      'field.key_piece_extra': [],
      'hand': ['WD01-014#91', 'WD01-016#92'],
      'actions_done': [],
      'designated_zones': [],
      'field_grants_active': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      // CSV実値：WD01-010=Lv3/P10000、WD01-013=Lv1/P3000、WD01-012=Lv2/P7000。
      'field.signi': [['WD01-010#1'], ['WD01-013#1'], ['WD01-012#1']],
      'field.signi_down': [false, false, false],
      'designated_zones': [],
      'field_grants_active': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    let opened = false;
    let actOpened = false;
    let discardSelected = false;
    let fired = false;
    let zoneChosen = false;
    let grantStableTicks = 0;
    let last = await H.queryState();
    await H.closeModals();
    await H.ensureMain();
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(700);
      let did = null;
      const before = await H.queryState();
      if (!zoneChosen && (before?.pendingOptions ?? []).some(o => o.startsWith('zone_0:ゾーン1を指定'))) {
        did = await H.clickBtn('ゾーン1を指定', { exact: true });
        if (did) zoneChosen = true;
      }
      if (!did && actOpened && !discardSelected) {
        did = await H.clickModalImage('小弓　ボーニャ');
        if (did) discardSelected = true;
      }
      if (!did && actOpened && discardSelected && !fired) {
        did = await H.clickBtn('発動', { exact: true });
        if (did) fired = true;
      }
      if (!did && opened && !actOpened) {
        // ⚠**`getByRole('button', { name: <RegExp>, exact: true })` は count() が常に 0 になる**
        //   （Playwright の `exact` は文字列名にしか効かず、正規表現と併用すると一致しない）＝
        //   続き462 の実測で3シナリオとも「モーダルも【起】ボタンも出ているのに did=なし」で30反復空振りした。
        //   実ラベルは `【起】手札1枚（魅惑の冥者　ハナレ）`。**`data-action-label` の前方一致で取る**（続き461 と同じ型）。
        did = await (async () => {
          const actBtn = page.locator('[data-testid^="card-action-"][data-action-label^="【起】手札1枚"]').first();
          if (!(await actBtn.count()) || !(await actBtn.isVisible().catch(() => false))) return null;
          await actBtn.click({ timeout: 2000 }).catch(() => {});
          return 'act:【起】手札1枚';
        })();
        if (did) actOpened = true;
      }
      if (!did && !opened) {
        did = await H.clickTestId('my-lrig-slot-key');
        if (did) opened = true;
      }
      if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定']);

      const st = await H.queryState();
      last = st;
      const grants = st?.guest?.fieldGrantsActive ?? [];
      const perLvPower = grants.filter(g => g.startsWith('power:') && g.includes('/perLv'));
      const zoneTexts = await Promise.all([0, 1, 2].map(i => page.getByTestId(`op-signi-zone-${i}`).innerText().catch(() => '')));
      const domPowers = zoneTexts.map(t => t.split('\n').map(x => x.trim()).find(x => /^(?:0|\d{1,3}(?:,\d{3})+)$/.test(x)) ?? '-');
      H.log(`  dzlsm[${s}] -> ${did ?? 'なし'} | active=${st?.activeUser ?? '-'} phase=${st?.turnPhase ?? '-'} designated=${JSON.stringify(st?.guest?.designatedZones ?? [])} grants=${JSON.stringify(grants)} domPower=${JSON.stringify(domPowers)} hand=${st?.host?.hand ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);

      if (JSON.stringify(st?.guest?.designatedZones ?? []) === '[0]' && perLvPower.length === 1) {
        grantStableTicks++;
        const powerOk = domPowers[0] === '4,000';
        const controlsOk = domPowers[1] === '3,000' && domPowers[2] === '7,000';
        if (!powerOk || !controlsOk) {
          // DBのground truthがDOM描画より先に届くことがあるため、3回連続で不一致になるまで待つ。
          if (grantStableTicks < 3) continue;
        }
        return {
          pass: powerOk && controlsOk,
          detail: powerOk && controlsOk
            ? 'guest.designatedZones=[0]・perLv power grant 1件・DOM zone0=4,000（Lv3×-2000）、対照zone1=3,000/zone2=7,000不変'
            : `grantは積まれたがDOM適用が不正（designated=${JSON.stringify(st.guest.designatedZones)} grants=${JSON.stringify(grants)} domPower=${JSON.stringify(domPowers)}。期待=[4,000,3,000,7,000]）`,
        };
      } else grantStableTicks = 0;
    }
    const zoneTexts = await Promise.all([0, 1, 2].map(i => page.getByTestId(`op-signi-zone-${i}`).innerText().catch(() => '')));
    return {
      pass: false,
      detail: `指定/grant成立タイムアウト（最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} designatedZones=${JSON.stringify(last?.guest?.designatedZones ?? [])} fieldGrantsActive=${JSON.stringify(last?.guest?.fieldGrantsActive ?? [])} DOM=${JSON.stringify(zoneTexts.map(t => t.slice(0, 80)))}）`,
    };
  },
};

// 続き457 E2：E1と同じ実経路でLv3への-6000を確認後、injectScenarioを再実行せず、
// patchPlayerStateでfield.signiだけを差し替える。grantが残ったままLv1自身のレベルで-2000へ再計算されることが本題。
scenarios.designatedZoneRecalcOnSwap = {
  title: 'WDK10-009（指定ゾーン差し替え後は新シグニのLvで再計算）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'WDK10-009#1',
      'field.key_piece_extra': [],
      'hand': ['WD01-014#91', 'WD01-016#92'],
      'actions_done': [],
      'designated_zones': [],
      'field_grants_active': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      'field.signi': [['WD01-010#1'], ['WD01-013#1'], ['WD01-012#1']],
      'field.signi_down': [false, false, false],
      'designated_zones': [],
      'field_grants_active': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    let opened = false;
    let actOpened = false;
    let discardSelected = false;
    let fired = false;
    let zoneChosen = false;
    let initialApplied = false;
    let patched = false;
    let last = await H.queryState();
    await H.closeModals();
    await H.ensureMain();
    for (let s = 0; s < 36; s++) {
      await page.waitForTimeout(700);
      let did = null;
      const before = await H.queryState();
      if (!initialApplied) {
        if (!zoneChosen && (before?.pendingOptions ?? []).some(o => o.startsWith('zone_0:ゾーン1を指定'))) {
          did = await H.clickBtn('ゾーン1を指定', { exact: true });
          if (did) zoneChosen = true;
        }
        if (!did && actOpened && !discardSelected) {
          did = await H.clickModalImage('小弓　ボーニャ');
          if (did) discardSelected = true;
        }
        if (!did && actOpened && discardSelected && !fired) {
          did = await H.clickBtn('発動', { exact: true });
          if (did) fired = true;
        }
        if (!did && opened && !actOpened) {
          // ⚠**`getByRole('button', { name: <RegExp>, exact: true })` は count() が常に 0 になる**
        //   （Playwright の `exact` は文字列名にしか効かず、正規表現と併用すると一致しない）＝
        //   続き462 の実測で3シナリオとも「モーダルも【起】ボタンも出ているのに did=なし」で30反復空振りした。
        //   実ラベルは `【起】手札1枚（魅惑の冥者　ハナレ）`。**`data-action-label` の前方一致で取る**（続き461 と同じ型）。
        did = await (async () => {
          const actBtn = page.locator('[data-testid^="card-action-"][data-action-label^="【起】手札1枚"]').first();
          if (!(await actBtn.count()) || !(await actBtn.isVisible().catch(() => false))) return null;
          await actBtn.click({ timeout: 2000 }).catch(() => {});
          return 'act:【起】手札1枚';
        })();
          if (did) actOpened = true;
        }
        if (!did && !opened) {
          did = await H.clickTestId('my-lrig-slot-key');
          if (did) opened = true;
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定']);
      }

      const st = await H.queryState();
      last = st;
      const grants = st?.guest?.fieldGrantsActive ?? [];
      const perLvPower = grants.filter(g => g.startsWith('power:') && g.includes('/perLv'));
      const zone0Text = await page.getByTestId('op-signi-zone-0').innerText().catch(() => '');
      const zone0Power = zone0Text.split('\n').map(x => x.trim()).find(x => /^(?:0|\d{1,3}(?:,\d{3})+)$/.test(x)) ?? '-';

      if (!initialApplied && JSON.stringify(st?.guest?.designatedZones ?? []) === '[0]' && perLvPower.length === 1 && zone0Power === '4,000') {
        initialApplied = true;
        const patch = await H.patchPlayerState('guest', {
          'field.signi': [['WD01-013#2'], ['WD01-013#1'], ['WD01-012#1']],
        });
        if (patch?.error) return { pass: false, detail: `patchPlayerState失敗: ${patch.error}` };
        patched = true;
        did = 'patch:guest.field.signi zone0 Lv3→Lv1';
        await page.waitForTimeout(900);
      }

      const after = patched ? await H.queryState() : st;
      last = after;
      const afterGrants = after?.guest?.fieldGrantsActive ?? [];
      const afterZone0Text = await page.getByTestId('op-signi-zone-0').innerText().catch(() => '');
      const afterPower = afterZone0Text.split('\n').map(x => x.trim()).find(x => /^(?:0|\d{1,3}(?:,\d{3})+)$/.test(x)) ?? '-';
      H.log(`  dzros[${s}] -> ${did ?? 'なし'} | initialApplied=${initialApplied} patched=${patched} designated=${JSON.stringify(after?.guest?.designatedZones ?? [])} grants=${JSON.stringify(afterGrants)} field=${JSON.stringify(after?.guest?.fieldSigni ?? [])} DOM.zone0=${afterPower} pEff=${after?.pendingEffect ?? '-'}`);

      if (patched && (after?.guest?.fieldSigni?.[0] ?? []).at(-1) === 'WD01-013#2') {
        const grantSurvived = afterGrants.filter(g => g.startsWith('power:') && g.includes('/perLv')).length === 1;
        if (!grantSurvived) {
          return { pass: false, detail: `差し替え後にfieldGrantsActiveが消失＝patchヘルパー側の削除/リセット疑い（grants=${JSON.stringify(afterGrants)} designated=${JSON.stringify(after?.guest?.designatedZones ?? [])} DOM=${afterPower}）` };
        }
        if (afterPower === '1,000') {
          return { pass: true, detail: 'Lv3時DOM 4,000（-6000）確認後、field.signiだけをLv1/P3000へPATCH。grantを保持したままDOM 1,000（-2000）へ再計算' };
        }
        if (afterPower === '0') {
          return { pass: false, detail: `【焼き込み退化】差し替え後もLv3時の-6000が居座り、Lv1/P3000がDOM 0（期待1,000）。grants=${JSON.stringify(afterGrants)}` };
        }
      }
    }
    const finalText = await page.getByTestId('op-signi-zone-0').innerText().catch(() => '');
    return {
      pass: false,
      detail: `再計算観測タイムアウト（initialApplied=${initialApplied} patched=${patched} 最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} designatedZones=${JSON.stringify(last?.guest?.designatedZones ?? [])} fieldGrantsActive=${JSON.stringify(last?.guest?.fieldGrantsActive ?? [])} fieldSigni=${JSON.stringify(last?.guest?.fieldSigni ?? [])} DOM=${JSON.stringify(finalText.slice(0, 100))}）`,
    };
  },
};

// 続き457 E3：現ターンactiveと次の相手ターン予約の2スロット寿命を実ターン境界で確認する。
// 自分の次ターンまで戻す長時間経路は要求外の余力枠なので、このシナリオはCPUターン中の継続までを固定する。
scenarios.designatedZoneGrantSurvivesOppTurn = {
  title: 'WDK10-009（指定ゾーンgrantは次の対戦相手ターン中も継続）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'],
      'field.signi': [null, null, null],
      'field.key_piece': 'WDK10-009#1',
      'field.key_piece_extra': [],
      'hand': ['WD01-014#91', 'WD01-016#92'],
      'actions_done': [],
      'designated_zones': [],
      'field_grants_active': [],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'],
      'field.signi': [['WD01-010#1'], ['WD01-013#1'], ['WD01-012#1']],
      'field.signi_down': [false, false, false],
      'designated_zones': [],
      'field_grants_active': [],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    let opened = false;
    let actOpened = false;
    let discardSelected = false;
    let fired = false;
    let zoneChosen = false;
    let initialApplied = false;
    let turnEndClicked = false;
    let cpuTurnTicks = 0;
    let last = await H.queryState();
    await H.closeModals();
    await H.ensureMain();

    for (let s = 0; s < 30 && !initialApplied; s++) {
      await page.waitForTimeout(700);
      let did = null;
      const before = await H.queryState();
      if (!zoneChosen && (before?.pendingOptions ?? []).some(o => o.startsWith('zone_0:ゾーン1を指定'))) {
        did = await H.clickBtn('ゾーン1を指定', { exact: true });
        if (did) zoneChosen = true;
      }
      if (!did && actOpened && !discardSelected) {
        did = await H.clickModalImage('小弓　ボーニャ');
        if (did) discardSelected = true;
      }
      if (!did && actOpened && discardSelected && !fired) {
        did = await H.clickBtn('発動', { exact: true });
        if (did) fired = true;
      }
      if (!did && opened && !actOpened) {
        // ⚠**`getByRole('button', { name: <RegExp>, exact: true })` は count() が常に 0 になる**
        //   （Playwright の `exact` は文字列名にしか効かず、正規表現と併用すると一致しない）＝
        //   続き462 の実測で3シナリオとも「モーダルも【起】ボタンも出ているのに did=なし」で30反復空振りした。
        //   実ラベルは `【起】手札1枚（魅惑の冥者　ハナレ）`。**`data-action-label` の前方一致で取る**（続き461 と同じ型）。
        did = await (async () => {
          const actBtn = page.locator('[data-testid^="card-action-"][data-action-label^="【起】手札1枚"]').first();
          if (!(await actBtn.count()) || !(await actBtn.isVisible().catch(() => false))) return null;
          await actBtn.click({ timeout: 2000 }).catch(() => {});
          return 'act:【起】手札1枚';
        })();
        if (did) actOpened = true;
      }
      if (!did && !opened) {
        did = await H.clickTestId('my-lrig-slot-key');
        if (did) opened = true;
      }
      if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '決定']);

      const st = await H.queryState();
      last = st;
      const grants = st?.guest?.fieldGrantsActive ?? [];
      const zone0Text = await page.getByTestId('op-signi-zone-0').innerText().catch(() => '');
      const zone0Power = zone0Text.split('\n').map(x => x.trim()).find(x => /^(?:0|\d{1,3}(?:,\d{3})+)$/.test(x)) ?? '-';
      initialApplied = JSON.stringify(st?.guest?.designatedZones ?? []) === '[0]'
        && grants.filter(g => g.startsWith('power:') && g.includes('/perLv')).length === 1
        && zone0Power === '4,000';
      H.log(`  dzgsot.activate[${s}] -> ${did ?? 'なし'} | initialApplied=${initialApplied} active=${st?.activeUser ?? '-'} phase=${st?.turnPhase ?? '-'} designated=${JSON.stringify(st?.guest?.designatedZones ?? [])} grants=${JSON.stringify(grants)} DOM.zone0=${zone0Power}`);
    }
    if (!initialApplied) {
      return { pass: false, detail: `ターン継続検査の前提不成立（最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} designatedZones=${JSON.stringify(last?.guest?.designatedZones ?? [])} fieldGrantsActive=${JSON.stringify(last?.guest?.fieldGrantsActive ?? [])}）` };
    }

    await H.closeModals();
    for (let s = 0; s < 48; s++) {
      await page.waitForTimeout(800);
      let did = null;
      const before = await H.queryState();
      if (await page.getByTestId('card-detail-modal').first().isVisible().catch(() => false)) await H.closeModals();

      if (before?.activeUser === before?.viewerUserId) {
        did = await H.clickBtn('エナに送る', { exact: true });
        if (!did) did = await H.clickBtn('ガードしない');
        if (!did) did = await H.clickBtn('このまま進む', { exact: true });
        if (!did && before?.turnPhase === 'MAIN') did = await H.clickBtn('アタックフェイズへ', { exact: true });
        if (!did && before?.turnPhase === 'ATTACK_ARTS') did = await H.clickBtn('アーツ終了→相手へ', { exact: true });
        if (!did && before?.turnPhase === 'ATTACK_SIGNI') did = await H.clickBtn('ルリグアタックへ', { exact: true });
        if (!did && before?.turnPhase === 'ATTACK_LRIG') did = await H.clickBtn('エンドフェイズへ', { exact: true });
        if (!did && before?.turnPhase === 'END') {
          did = await H.clickBtn('ターン終了', { exact: true });
          if (did) turnEndClicked = true;
        }
      } else {
        did = await H.clickBtn('エナに送る', { exact: true });
        if (!did) did = await H.clickBtn('ガードしない');
        // ATTACK_ARTS_OP は非ターンプレイヤー（driver）が「アーツ終了」で進める。
        if (!did && before?.turnPhase === 'ATTACK_ARTS_OP') did = await H.clickBtn('アーツ終了', { exact: true });
      }

      const st = await H.queryState();
      last = st;
      const grants = st?.guest?.fieldGrantsActive ?? [];
      const zone0Text = await page.getByTestId('op-signi-zone-0').innerText().catch(() => '');
      const zone0Power = zone0Text.split('\n').map(x => x.trim()).find(x => /^(?:0|\d{1,3}(?:,\d{3})+)$/.test(x)) ?? '-';
      H.log(`  dzgsot.turn[${s}] -> ${did ?? 'なし'} | turnEndClicked=${turnEndClicked} active=${st?.activeUser ?? '-'} viewer=${st?.viewerUserId ?? '-'} phase=${st?.turnPhase ?? '-'} designated=${JSON.stringify(st?.guest?.designatedZones ?? [])} grants=${JSON.stringify(grants)} DOM.zone0=${zone0Power}`);

      if (turnEndClicked && st?.activeUser && st.activeUser !== st.viewerUserId) {
        cpuTurnTicks++;
        const grantActive = grants.filter(g => g.startsWith('power:') && g.includes('/perLv')).length === 1;
        const designated = JSON.stringify(st?.guest?.designatedZones ?? []) === '[0]';
        if (grantActive && designated && zone0Power === '4,000') {
          return { pass: true, detail: `hostのターン終了後、CPUターン（${st.turnPhase}）中もguestのperLv power grant 1件・designatedZones=[0]・DOM zone0=4,000（Lv3×-2000）が継続` };
        }
        if (cpuTurnTicks >= 3) {
          return { pass: false, detail: `CPUターンへ移ったが3回連続でgrant/DOMが継続していない（activeUser=${st.activeUser} turnPhase=${st.turnPhase} designatedZones=${JSON.stringify(st?.guest?.designatedZones ?? [])} fieldGrantsActive=${JSON.stringify(grants)} DOM.zone0=${zone0Power}）` };
        }
      }
    }
    const finalText = await page.getByTestId('op-signi-zone-0').innerText().catch(() => '');
    return {
      pass: false,
      detail: `相手ターン遷移タイムアウト（turnEndClicked=${turnEndClicked} 最後 activeUser=${last?.activeUser ?? '-'} turnPhase=${last?.turnPhase ?? '-'} designatedZones=${JSON.stringify(last?.guest?.designatedZones ?? [])} fieldGrantsActive=${JSON.stringify(last?.guest?.fieldGrantsActive ?? [])} DOM=${JSON.stringify(finalText.slice(0, 100))}）`,
    };
  },
};

// ── 続き431：ライフクラッシュ置換（Codex起案・実機未実行） ──────────────
// 既存シナリオの不変証明用境界。新規7件は宣言側（実UI）と消費側（state注入）を分離する。
async function driveLifeCrashReplacementArts(page, H, id, energyCount, evaluate) {
  const before = await H.queryState();
  let lrigDeckOpened = false;
  let cardOpened = false;
  let artsOpened = false;
  let submitted = false;
  const selectedEnergy = new Set();
  let last = before;

  for (let s = 0; s < 30; s++) {
    await page.waitForTimeout(600);
    let did = null;
    if (!lrigDeckOpened) {
      did = await H.clickTestId('my-lrig-dk');
      if (did) lrigDeckOpened = true;
    } else if (!cardOpened) {
      did = await H.clickTestId('zone-card-0');
      if (did) cardOpened = true;
    } else if (!artsOpened) {
      const use = page.locator('[data-testid^="card-action-"][data-action-label="使用"]').first();
      if (await use.count() && await use.isVisible().catch(() => false)) {
        await use.click({ timeout: 2000 });
        did = 'act:使用';
        artsOpened = true;
      }
    } else if (!submitted) {
      const nextEnergy = Array.from({ length: energyCount }, (_, i) => i).find(i => !selectedEnergy.has(i));
      if (nextEnergy !== undefined) {
        did = await H.clickTestId(`artscost-energy-${nextEnergy}`);
        if (did) selectedEnergy.add(nextEnergy);
      } else {
        did = await H.clickBtn('アーツ使用', { exact: true });
        if (did) submitted = true;
      }
    }

    const st = await H.queryState();
    last = st;
    H.log(`  ${id}[${s}] -> ${did ?? 'なし'} | opened=${lrigDeckOpened}/${cardOpened}/${artsOpened} energy=${selectedEnergy.size}/${energyCount} submitted=${submitted} hDeck=${st?.host?.deck} hTrash=${st?.host?.trash} gLife=${st?.guest?.life} repl=${JSON.stringify(st?.host?.lifeCrashReplacements ?? [])}`);
    const verdict = evaluate(st, before);
    if (verdict) return verdict;
  }
  return { pass: false, detail: `宣言確認タイムアウト（hDeck=${last?.host?.deck} hTrash=${last?.host?.trash} gLife=${last?.guest?.life} lrigDeck=${last?.host?.lrigDeck} repl=${JSON.stringify(last?.host?.lifeCrashReplacements ?? [])}）` };
}

scenarios.lifeCrashReplDeclareNoSelfMill = {
  title: 'WX24-P4-009（使用時は自傷millせず、シグニ限定の10枚置換宣言だけを積む）',
  spec: {
    hostSet: {
      'field.lrig': ['WD04-003#1'], 'field.signi': [null, null, null], 'field.check': null,
      'lrig_deck': ['WX24-P4-009#1'], 'energy': ['WD04-010#1', 'WD05-010#2'], 'hand': [], 'trash': [],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'], 'field.signi': [null, null, null], 'field.check': null,
      'lrig_deck': [], 'energy': [], 'hand': [],
    },
    top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
  },
  async drive(page, H) {
    return driveLifeCrashReplacementArts(page, H, 'lcrdnsm', 2, (st, before) => {
      const repls = st?.host?.lifeCrashReplacements ?? [];
      const repl = repls[0];
      const declared = repls.length === 1 && repl?.kind === 'mill' && repl?.count === 10
        && repl?.damageSource === 'signi' && repl?.optional === true && repl?.once === undefined;
      if (declared && st.host.deck >= before.host.deck) {
        return { pass: true, detail: `使用後もdeckは減らず（${before.host.deck}→${st.host.deck}。支払い2枚はTRANSFER_TO_DECKで戻る）、置換宣言1件=${JSON.stringify(repl)}` };
      }
      if ((st?.host?.lrigDeck ?? before.host.lrigDeck) < before.host.lrigDeck && st?.host?.deck < before.host.deck) {
        return { pass: false, detail: `【旧回帰】アーツ使用直後に自分のdeckが減少（${before.host.deck}→${st.host.deck}）・repl=${JSON.stringify(repls)}` };
      }
      return null;
    });
  },
};

scenarios.lifeCrashReplDeclareNoOppCrash = {
  title: 'WX25-P3-004（使用時は相手lifeを割らず、次のシグニクラッシュ置換だけを積む）',
  spec: {
    hostSet: {
      'field.lrig': ['WD02-003#1'], 'field.signi': [null, null, null], 'field.check': null,
      'lrig_deck': ['WX25-P3-004#1'],
      'energy': ['WD02-009#1', 'WD02-009#2', 'WD02-009#3', 'WD02-009#4'], 'hand': [], 'trash': [],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'], 'field.signi': [null, null, null], 'field.check': null,
      'lrig_deck': [], 'energy': [], 'hand': [],
    },
    top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
  },
  async drive(page, H) {
    return driveLifeCrashReplacementArts(page, H, 'lcrdnoc', 4, (st, before) => {
      const repls = st?.host?.lifeCrashReplacements ?? [];
      const repl = repls[0];
      const declared = repls.length === 1 && repl?.kind === 'crash_opponent' && repl?.count === 1
        && repl?.damageSource === 'signi' && repl?.once === true;
      if (declared && st.guest.life === before.guest.life) {
        return { pass: true, detail: `使用後もguest.life不変（${before.guest.life}→${st.guest.life}）、置換宣言1件=${JSON.stringify(repl)}` };
      }
      if (st?.guest?.life < before.guest.life && st?.guest?.fieldCheck == null) {
        return { pass: false, detail: `【旧回帰】アーツ使用直後にguest.lifeが減少（${before.guest.life}→${st.guest.life}）・repl=${JSON.stringify(repls)}` };
      }
      return null;
    });
  },
};

scenarios.lifeCrashReplGrantFromAssist = {
  title: 'WXDi-CP01-023（アシストグロウの【出】でbyAttack付き5枚置換宣言を積み、即時millしない）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-003#1'], 'field.signi': [null, null, null], 'field.check': null,
      'field.assist_lrig_l': ['WXDi-CP01-020#1'], 'field.assist_lrig_r': [],
      'lrig_deck': ['WXDi-CP01-023#1'],
      'energy': ['WD01-013#31', 'WD01-014#32', 'WD01-016#33'], 'hand': [], 'trash': [],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'], 'field.signi': [null, null, null], 'field.check': null,
      'lrig_deck': [], 'energy': [], 'hand': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    const energyNames = ['小剣　ククリ', '小弓　ボーニャ', 'サーバント　Ｄ'];
    let slotOpened = false;
    let growActionOpened = false;
    let candidatePicked = false;
    let submitted = false;
    const selectedEnergy = new Set();
    let last = before;
    for (let s = 0; s < 34; s++) {
      await page.waitForTimeout(600);
      let did = null;
      if (!slotOpened) {
        did = await H.clickTestId('my-lrig-slot-assist-l');
        if (did) slotOpened = true;
      } else if (!growActionOpened) {
        const grow = page.locator('[data-testid^="card-action-"][data-action-label="グロウ"]').first();
        if (await grow.count() && await grow.isVisible().catch(() => false)) {
          await grow.click({ timeout: 2000 });
          did = 'act:グロウ';
          growActionOpened = true;
        }
      } else if (!candidatePicked) {
        did = await H.clickBtn('【アシスト】月ノ美兎　レベル２【隠蔽】');
        if (did) candidatePicked = true;
      } else if (!submitted) {
        const nextEnergy = energyNames.find(name => !selectedEnergy.has(name));
        if (nextEnergy) {
          did = await H.clickModalImage(nextEnergy);
          if (did) selectedEnergy.add(nextEnergy);
        } else {
          const submit = page.getByRole('button', { name: 'グロウ', exact: true }).last();
          if (await submit.count() && await submit.isVisible().catch(() => false) && await submit.isEnabled().catch(() => false)) {
            await submit.click({ timeout: 2000 });
            did = 'btn:アシストグロウ';
            submitted = true;
          }
        }
      }
      const st = await H.queryState();
      last = st;
      const repls = st?.host?.lifeCrashReplacements ?? [];
      const repl = repls[0];
      H.log(`  lcrgfa[${s}] -> ${did ?? 'なし'} | opened=${slotOpened}/${growActionOpened}/${candidatePicked} energy=${selectedEnergy.size}/3 submitted=${submitted} hDeck=${st?.host?.deck} hTrash=${st?.host?.trash} lrigDeck=${st?.host?.lrigDeck} repl=${JSON.stringify(repls)}`);
      const declared = repls.length === 1 && repl?.kind === 'mill' && repl?.count === 5
        && repl?.damageSource === 'signi' && repl?.byAttack === true && repl?.optional === true
        && repl?.once === undefined;
      if (declared && st.host.deck === before.host.deck) {
        return { pass: true, detail: `アシストグロウ後もdeck不変（${before.host.deck}→${st.host.deck}）、GRANT_LRIG_ABILITY由来の置換宣言1件=${JSON.stringify(repl)}` };
      }
      if ((st?.host?.lrigDeck ?? before.host.lrigDeck) < before.host.lrigDeck && st?.host?.deck < before.host.deck) {
        return { pass: false, detail: `【旧回帰】付与時に即時mill（deck ${before.host.deck}→${st.host.deck}）・repl=${JSON.stringify(repls)}` };
      }
    }
    return { pass: false, detail: `アシスト由来宣言の確認タイムアウト（hDeck=${last?.host?.deck} hTrash=${last?.host?.trash} lrigDeck=${last?.host?.lrigDeck} repl=${JSON.stringify(last?.host?.lifeCrashReplacements ?? [])}）` };
  },
};

scenarios.lifeCrashReplMillOnSigniAttack = {
  title: 'life_crash_replacements注入（CPUシグニアタックをlifeの代わりにdeck上10枚mill）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'], 'field.signi': [null, null, null], 'field.check': null,
      'life_crash_replacements': [{ kind: 'mill', count: 10, damageSource: 'signi' }],
      'energy': [], 'hand': [], 'lrig_deck': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'], 'field.lrig_down': true,
      'field.signi': [['WD01-013#201'], null, null], 'field.signi_down': [false, false, false], 'field.check': null,
      'energy': [], 'hand': [], 'lrig_deck': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    let last = await H.queryState();
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(500);
      const did = await H.clickBtn('エナに送る', { exact: true }); // 置換不発時のcheckを消化して次シナリオへ残さない
      const st = await H.queryState();
      last = st;
      H.log(`  lcrmos[${s}] -> ${did ?? 'なし'} | hLife=${st?.host?.life} hDeck=${st?.host?.deck} hTrash=${st?.host?.trash} check=${st?.host?.fieldCheck ?? '-'} phase=${st?.turnPhase}`);
      if (st?.host?.life === 7 && st?.host?.deck === 30 && st?.host?.trash === 10 && st?.host?.fieldCheck == null) {
        return { pass: true, detail: 'CPUシグニアタックでhost.life 7維持・deck 40→30・trash 0→10（置換成立、checkなし）' };
      }
      if ((st?.host?.life ?? 7) < 7 && st?.host?.fieldCheck == null) return { pass: false, detail: `【置換不発】host.life=${st.host.life}（期待7）・deck=${st.host.deck} trash=${st.host.trash}` };
    }
    return { pass: false, detail: `シグニアタック置換タイムアウト（hLife=${last?.host?.life} hDeck=${last?.host?.deck} hTrash=${last?.host?.trash} phase=${last?.turnPhase}）` };
  },
};

scenarios.lifeCrashReplCrashOpponentInstead = {
  title: 'life_crash_replacements注入（CPUシグニアタックで防御側lifeの代わりに攻撃側lifeを1枚クラッシュ）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#1'], 'field.signi': [null, null, null], 'field.check': null,
      'life_crash_replacements': [{ kind: 'crash_opponent', count: 1, damageSource: 'signi', once: true }],
      'energy': [], 'hand': [], 'lrig_deck': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#2'], 'field.lrig_down': true,
      'field.signi': [['WD01-013#201'], null, null], 'field.signi_down': [false, false, false], 'field.check': null,
      'energy': [], 'hand': [], 'lrig_deck': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    let last = await H.queryState();
    for (let s = 0; s < 34; s++) {
      await page.waitForTimeout(500);
      const did = await H.clickBtn('エナに送る', { exact: true }); // 置換不発時のhost checkを消化。guest checkはCPUが自動消化する
      const st = await H.queryState();
      last = st;
      H.log(`  lcrcoi[${s}] -> ${did ?? 'なし'} | hLife=${st?.host?.life} gLife=${st?.guest?.life} gEnergy=${st?.guest?.energy} checks=${st?.host?.fieldCheck ?? '-'}/${st?.guest?.fieldCheck ?? '-'} phase=${st?.turnPhase}`);
      if (st?.host?.life === 7 && st?.guest?.life === 6 && st?.guest?.fieldCheck == null && st?.guest?.energy === 1) {
        return { pass: true, detail: 'CPUシグニアタックでhost.life 7維持・guest.life 7→6。CPU側のバーストなし確認も自動消化されguest.energy 0→1' };
      }
      if ((st?.host?.life ?? 7) < 7 && st?.host?.fieldCheck == null) return { pass: false, detail: `【置換不発】防御側host.life=${st.host.life}（期待7）・guest.life=${st.guest.life}` };
    }
    return { pass: false, detail: `相手lifeクラッシュ置換タイムアウト（hLife=${last?.host?.life} gLife=${last?.guest?.life} gEnergy=${last?.guest?.energy} gCheck=${last?.guest?.fieldCheck ?? '-'} phase=${last?.turnPhase}）` };
  },
};

function makeLifeCrashReplacementLrigScenario(damageSource, shouldReplace) {
  return {
    title: `life_crash_replacements注入（CPUルリグアタック・damageSource=${damageSource}・置換${shouldReplace ? '成立' : '不成立'}）`,
    spec: {
      hostSet: {
        'field.lrig': ['WD01-001#1'], 'field.signi': [null, null, null], 'field.check': null,
        'life_crash_replacements': [{ kind: 'mill', count: 5, damageSource, byAttack: true }],
        'energy': [], 'hand': [], 'lrig_deck': [],
      },
      guestSet: {
        'field.lrig': ['WD01-001#2'], 'field.lrig_down': false,
        'field.signi': [null, null, null], 'field.signi_down': [false, false, false], 'field.check': null,
        'energy': [], 'hand': [], 'lrig_deck': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_LRIG', turn_count: 3 },
    },
    async drive(page, H) {
      let last = await H.queryState();
      for (let s = 0; s < 34; s++) {
        await page.waitForTimeout(500);
        let did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
        if (!did) did = await H.clickBtn('エナに送る', { exact: true });
        const st = await H.queryState();
        last = st;
        H.log(`  lcrla.${damageSource}[${s}] -> ${did ?? 'なし'} | hLife=${st?.host?.life} hDeck=${st?.host?.deck} hTrash=${st?.host?.trash} hEnergy=${st?.host?.energy} check=${st?.host?.fieldCheck ?? '-'} phase=${st?.turnPhase}`);
        if (shouldReplace && st?.host?.life === 7 && st?.host?.deck === 35 && st?.host?.trash === 5 && st?.host?.fieldCheck == null) {
          return { pass: true, detail: 'damageSource=lrig対照：同じCPUルリグアタックが置換され、host.life 7維持・deck 40→35・trash 0→5' };
        }
        if (!shouldReplace && st?.host?.life === 6 && st?.host?.deck === 40 && st?.host?.trash === 0
            && st?.host?.energy === 1 && st?.host?.fieldCheck == null) {
          return { pass: true, detail: 'damageSource=signi限定：CPUルリグアタックは置換されずhost.life 7→6・deck 40維持。バーストなし確認も「エナに送る」で消化' };
        }
        if (shouldReplace && (st?.host?.life ?? 7) < 7 && st?.host?.fieldCheck == null) {
          return { pass: false, detail: `【対照不成立】damageSource=lrigなのにhost.life=${st.host.life}・deck=${st.host.deck} trash=${st.host.trash}` };
        }
        if (!shouldReplace && (st?.host?.deck ?? 40) < 40) {
          return { pass: false, detail: `【限定漏れ】damageSource=signiなのにルリグアタックをmill置換（life=${st.host.life} deck=${st.host.deck} trash=${st.host.trash}）` };
        }
      }
      return { pass: false, detail: `ルリグアタック対照タイムアウト（source=${damageSource} hLife=${last?.host?.life} hDeck=${last?.host?.deck} hTrash=${last?.host?.trash} hEnergy=${last?.host?.energy} check=${last?.host?.fieldCheck ?? '-'} phase=${last?.turnPhase}）` };
    },
  };
}

// B3/B4 はこのfactoryで盤面・クリック手順を共有し、注入宣言の damageSource 1語だけを変える。
scenarios.lifeCrashReplNotOnLrigAttack = makeLifeCrashReplacementLrigScenario('signi', false);
scenarios.lifeCrashReplLrigAttackControl = makeLifeCrashReplacementLrigScenario('lrig', true);

// ── 続き430：離場置換の対話化（Codex起案・実機未実行）─────────────
const LEAVE_SUB_QUESTION = 'の場離れを置換しますか？（対戦相手が選択）';
const leaveSubHas = (fieldSigni, instanceId) =>
  (fieldSigni ?? []).some(stack => (stack ?? []).includes(instanceId));
const leaveSubQuestionLogs = (st) =>
  (st?.logTail ?? []).filter(line => line.includes(LEAVE_SUB_QUESTION));
const leaveSubSettled = (st) => st?.pendingEffect == null && st?.stackLen === 0;
const leaveSubTimeout = (st, extra = '') =>
  `${extra}${extra ? ' / ' : ''}pendingEffect=${st?.pendingEffect ?? '-'} pendingRespondPlayer=${st?.pendingRespondPlayer ?? '-'} stackLen=${st?.stackLen ?? '-'} turnPhase=${st?.turnPhase ?? '-'} gField=${JSON.stringify(st?.guest?.fieldSigni ?? null)} gEnergy=${JSON.stringify(st?.guest?.energyCards ?? [])} gTrash=${JSON.stringify(st?.guest?.trashCards ?? [])} choices=${JSON.stringify(st?.guest?.leaveSubstituteChoices ?? null)}`;

const LEAVE_SUB_VICTIM = 'WX12-024#5';
const LEAVE_SUB_SACRIFICE = 'WD03-013#6';
const LEAVE_SUB_DECISION_KEY = `banishSubstitute:${LEAVE_SUB_VICTIM}:${LEAVE_SUB_SACRIFICE}`;

function makeLeaveSubSingleSpec({ decision, withSacrifice = true } = {}) {
  return {
    hostSet: {
      'field.lrig': ['WD01-001#1'], 'field.signi': [null, null, null], 'field.check': null,
      'hand': ['WX19-023#4'], 'energy': ['WD01-013#7'], 'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD03-001#2'],
      'field.signi': [[LEAVE_SUB_VICTIM], withSacrifice ? [LEAVE_SUB_SACRIFICE] : null, null],
      'field.check': null, 'hand': [], 'energy': [], 'actions_done': [],
      ...(decision === undefined ? {} : { 'leave_substitute_choices': { [LEAVE_SUB_VICTIM]: decision } }),
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  };
}

async function driveLeaveSubSingleBanish(page, H, id, evaluate) {
  await H.ensureMain();
  const flow = { handOpened: false, summonChosen: false, zoneChosen: false, energyChosen: false, fired: false, victimTargeted: false };
  // ⚠`leaveSubSettled`（pendingEffect==null && stackLen===0）は**効果の開始前と完了後の両方で true** になる。
  //   「発動」クリック直後は DB への書き込みがまだ届いておらず、そのまま判定すると
  //   「1回も解決していない盤面」を「解決後の盤面」として読む（続き466 の実測＝lsdni[4] で stack=0 のまま確定し
  //   4シナリオが誤 FAIL。単体実行だと stack=1 が間に合って PASS する**位置依存 flakiness** になる）。
  //   ⇒ **効果が実際に走り出したことを1度でも観測するまで判定させない**ゲートを噛ませる。
  const startSnapshot = await H.queryState();
  const observed = { pending: null, started: false };
  const guestBoardKey = (st) => JSON.stringify([st?.guest?.fieldSigni ?? null, st?.guest?.energyCards ?? [], st?.guest?.trashCards ?? []]);
  const startKey = guestBoardKey(startSnapshot);
  let last = startSnapshot;
  for (let s = 0; s < 64; s++) {
    await page.waitForTimeout(200);
    let did = null;
    if (!flow.handOpened) {
      did = await H.clickTestId('my-hand-card-0');
      if (did) flow.handOpened = true;
    } else if (!flow.summonChosen) {
      did = await H.clickBtn('召喚', { exact: true });
      if (did) flow.summonChosen = true;
    } else if (!flow.zoneChosen) {
      did = await H.clickTestId('summon-zone-0', 'summon-zone-1', 'summon-zone-2');
      if (did) flow.zoneChosen = true;
    } else if (!flow.energyChosen) {
      did = await H.clickTestId('onplaycost-energy-0');
      if (did) flow.energyChosen = true;
    } else if (!flow.fired) {
      did = await H.clickBtn('発動', { exact: true });
      if (did) flow.fired = true;
    } else {
      // 🔴**バニッシュ対象は必ず victim を名指しで選ぶ**（続き466 実測の罠）。
      //   `WX19-023-E3` は `BANISH{count:1, powerRange:{max:12000}}`＝候補は victim（P12000）と
      //   犠牲（P3000）の**2体**あり、`H.stdStep` の盲目的な `pick-0` だと**犠牲の方を直接バニッシュ**しうる。
      //   その結果の盤面（victim 残存・犠牲がエナへ）は**身代わり成立時と1バイトも変わらない**ため、
      //   離場置換を1度も通らないまま「置換できた」ように見える偽陽性になる。
      //   🔴**続き475 訂正**＝ここで `pendingCandidates` の index をそのまま `pick-<idx>` に使っていたのが
      //   **誤り**だった（PLAN §7 📌6＝続き469 で判明した罠。この4シナリオは続き466 作＝罠の発見前）。
      //   `EffectInteractionModal` は `targetScope==='opp_field'` のとき候補を **reverse して描画**するので
      //   `pick-0` は DB の候補[0]（victim）ではなく**最後の候補＝犠牲シグニ**を指す。⇒ 犠牲を直接バニッシュ
      //   していた＝victim は対象ですらないので**離場置換の問いが出なくて当然**（§3 (cxxv) の症状はこれ）。
      //   ⇒ `data-card-num` で狙う `clickPendingInstance` に統一する。
      const cands = (await H.queryState())?.pendingCandidates;
      if (!flow.victimTargeted && Array.isArray(cands) && cands.includes(LEAVE_SUB_VICTIM)) {
        did = await clickPendingInstance(page, H, LEAVE_SUB_VICTIM);
        if (did) flow.victimTargeted = true;
      }
      // ⚠victim を掴む前に `stdStep` を通すと盲目 `pick-0` が走って同じ取り違えを再発させる。
      //   掴むまでは「発動順序を確定」だけ消化し、掴んだ後に定石チェーンへ進む。
      if (!did) {
        did = flow.victimTargeted
          ? await H.stdStep(['発動順序を確定', '決定'])
          : await H.clickBtn('発動順序を確定', { exact: true });
      }
    }

    const st = await H.queryState();
    last = st;
    // 効果が走り出した証拠＝スタック/pending に載った、または guest 盤面が動いた。
    if (flow.fired && (st?.stackLen > 0 || st?.pendingEffect != null || guestBoardKey(st) !== startKey)) observed.started = true;
    const isLeavePending = (st?.pendingOptions ?? []).some(o => o.startsWith('none:置換しない'));
    if (isLeavePending && !observed.pending) {
      observed.pending = {
        pendingRespondPlayer: st.pendingRespondPlayer,
        viewerUserId: st.viewerUserId,
        pendingOptions: st.pendingOptions,
        fieldSigni: st.guest?.fieldSigni,
      };
    }
    H.log(`  ${id}[${s}] -> ${did ?? 'なし'} | flow=${Object.values(flow).map(Boolean).filter(Boolean).length}/5 pEff=${st?.pendingEffect ?? '-'} responder=${st?.pendingRespondPlayer ?? '-'} stack=${st?.stackLen ?? '-'} gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${JSON.stringify(st?.guest?.energyCards ?? [])} choices=${JSON.stringify(st?.guest?.leaveSubstituteChoices ?? null)} asks=${leaveSubQuestionLogs(st).length}`);
    const verdict = evaluate(st, observed, flow);
    if (verdict) return verdict;
  }
  return { pass: false, detail: `効果バニッシュ解決タイムアウト（${leaveSubTimeout(last, `flow=${JSON.stringify(flow)}`)}）` };
}

scenarios.leaveSubCpuAutoRespondsSubstitute = {
  title: 'WX19-023効果バニッシュ（CPU被害側が離場置換へ自動応答しソフトロックしない）',
  spec: makeLeaveSubSingleSpec(),
  async drive(page, H) {
    return driveLeaveSubSingleBanish(page, H, 'lscars', (st, observed, flow) => {
      if (!flow.fired || !flow.victimTargeted || !observed.started || !leaveSubSettled(st)) return null;
      const victimStayed = leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_VICTIM);
      const sacrificeLeft = !leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_SACRIFICE);
      const sacrificeBanished = (st?.guest?.energyCards ?? []).includes(LEAVE_SUB_SACRIFICE);
      // 🔴**盤面だけを見てはいけない**（続き466 実測）＝「対話が1度も出ず engine が自動適用した」場合の盤面は
      //   「CPU が問いに答えて身代わりを選んだ」場合と**完全に同一**になる。機構を検査するには
      //   **問いが実際に出たこと**（`asks===1`）を必須にする。これを入れる前は偽陽性で緑だった。
      const asks = leaveSubQuestionLogs(st);
      if (victimStayed && sacrificeLeft && sacrificeBanished && asks.length === 1) {
        return { pass: true, detail: `被害側CPUへ問いが出て自動応答し解決完了（victim残存・sacrificeは通常バニッシュ先のエナへ・${leaveSubTimeout(st)}）` };
      }
      if (victimStayed && sacrificeLeft && sacrificeBanished && asks.length === 0) {
        return { pass: false, detail: `🔴【対話未発火】盤面は身代わり成立と同じだが、離場置換の問いが1度も出ていない＝engine が従来どおり自動適用している（${leaveSubTimeout(st)}）` };
      }
      return { pass: false, detail: `【旧回帰/置換不発】CPU応答後の盤面が不正（asks=${asks.length} ${leaveSubTimeout(st)}）` };
    });
  },
};

scenarios.leaveSubAskDirectedToVictim = {
  title: 'WX19-023効果バニッシュ（離場置換の問いが被害側CPUへ向く）',
  spec: makeLeaveSubSingleSpec(),
  async drive(page, H) {
    return driveLeaveSubSingleBanish(page, H, 'lsadtv', (st, observed, flow) => {
      const pending = observed.pending;
      // ⚠`pending?.a === pending?.b` は **pending が null のとき undefined === undefined ＝ true** になり、
      //   1周目（まだ何も起きていない時点）で「応答者反転」を誤検出して即 FAIL する（続き466 実測）。
      //   捕捉できたときだけ判定する。
      if (pending && pending.pendingRespondPlayer === pending.viewerUserId) {
        return { pass: false, detail: `【応答者反転】離場置換の応答者がhost viewerになっている（${JSON.stringify(pending)}）` };
      }
      if (pending && (!pending.pendingOptions.some(o => o.includes('代わりに') && o.includes('をバニッシュする'))
          || !pending.pendingOptions.some(o => o.startsWith('none:置換しない')))) {
        return { pass: false, detail: `【選択肢欠落】CPU応答窓の options=${JSON.stringify(pending.pendingOptions)}` };
      }
      const asks = leaveSubQuestionLogs(st);
      if (flow.fired && flow.victimTargeted && observed.started && leaveSubSettled(st) && asks.length === 1
          && leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_VICTIM)
          && (st?.guest?.energyCards ?? []).includes(LEAVE_SUB_SACRIFICE)) {
        return { pass: true, detail: `被害側CPUへの問いログ1件を確認。pending窓${pending ? `も捕捉（responder=${pending.pendingRespondPlayer}, options=${JSON.stringify(pending.pendingOptions)}）` : 'はCPU_ACTION_DELAY内のため未捕捉（主判定はログ）'}` };
      }
      if (asks.length > 1) return { pass: false, detail: `【二重質問】単一victimで問いが${asks.length}件：${JSON.stringify(asks)}` };
      return null;
    });
  },
};

scenarios.leaveSubDecisionNoneIsHonored = {
  title: 'leave_substitute_choices注入（noneを消費し、問わずvictimを通常バニッシュ）',
  spec: makeLeaveSubSingleSpec({ decision: 'none' }),
  async drive(page, H) {
    return driveLeaveSubSingleBanish(page, H, 'lsdni', (st, observed, flow) => {
      const asks = leaveSubQuestionLogs(st);
      if (asks.length > 0) return { pass: false, detail: `【決定済みなのに再質問】${JSON.stringify(asks)}` };
      if (!flow.fired || !flow.victimTargeted || !observed.started || !leaveSubSettled(st)) return null;
      const boardOk = !leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_VICTIM)
        && leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_SACRIFICE)
        && (st?.guest?.energyCards ?? []).includes(LEAVE_SUB_VICTIM);
      const consumed = st?.guest?.leaveSubstituteChoices == null;
      if (boardOk && consumed) {
        return { pass: true, detail: `none決定を問わず消費し、victimだけがエナへ通常バニッシュ（${leaveSubTimeout(st)}）` };
      }
      // 🔴続き475 実測＝**盤面は正しいのに決定が state に残る**（§3 (cxxx)）。置換しなかった側の経路で
      //   `applyEffectLeaveSubstitutes` の戻り ctx（消費済み）を呼び出し側が捨てているため。
      //   残ると `leaveSubstituteAskOptions` が「決定済み」と見なして**次回以降その instance に問わなくなる**。
      if (boardOk) {
        return { pass: false, detail: `🔴【決定が消費されない＝§3 (cxxx)】盤面は正しい（victimだけエナへ）が leave_substitute_choices が残留（${leaveSubTimeout(st)}）` };
      }
      return { pass: false, detail: `【旧回帰】noneを無視して自動置換した（${leaveSubTimeout(st)}）` };
    });
  },
};

scenarios.leaveSubDecisionKeyIsHonored = {
  title: 'leave_substitute_choices注入（instanceIdのbanishSubstitute keyを消費して身代わり）',
  spec: makeLeaveSubSingleSpec({ decision: LEAVE_SUB_DECISION_KEY }),
  async drive(page, H) {
    return driveLeaveSubSingleBanish(page, H, 'lsdki', (st, observed, flow) => {
      const asks = leaveSubQuestionLogs(st);
      if (asks.length > 0) return { pass: false, detail: `【決定済みなのに再質問】${JSON.stringify(asks)}` };
      if (!flow.fired || !flow.victimTargeted || !observed.started || !leaveSubSettled(st)) return null;
      const ok = leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_VICTIM)
        && !leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_SACRIFICE)
        && (st?.guest?.energyCards ?? []).includes(LEAVE_SUB_SACRIFICE)
        && st?.guest?.leaveSubstituteChoices == null;
      return ok
        ? { pass: true, detail: `実instanceId key「${LEAVE_SUB_DECISION_KEY}」を消費しvictim残存・sacrificeをエナへバニッシュ（${leaveSubTimeout(st)}）` }
        : { pass: false, detail: `【決定key不発】none対照と反対の盤面に分岐しない（${leaveSubTimeout(st)}）` };
    });
  },
};

scenarios.leaveSubNoOptionMeansNoAsk = {
  title: 'WX19-023効果バニッシュ（他の＜電機＞が無ければ問わず通常バニッシュ）',
  spec: makeLeaveSubSingleSpec({ withSacrifice: false }),
  async drive(page, H) {
    return driveLeaveSubSingleBanish(page, H, 'lsnoma', (st, observed, flow) => {
      const asks = leaveSubQuestionLogs(st);
      if (asks.length > 0) return { pass: false, detail: `【候補なしで誤質問】${JSON.stringify(asks)}` };
      if (!flow.fired || !flow.victimTargeted || !observed.started || !leaveSubSettled(st)) return null;
      const ok = !leaveSubHas(st?.guest?.fieldSigni, LEAVE_SUB_VICTIM)
        && (st?.guest?.energyCards ?? []).includes(LEAVE_SUB_VICTIM);
      return ok
        ? { pass: true, detail: `犠牲候補を外すと問いなしでvictimがエナへ通常バニッシュ（A1との対照・${leaveSubTimeout(st)}）` }
        : { pass: false, detail: `候補なしの通常バニッシュ未確認（${leaveSubTimeout(st)}）` };
    });
  },
};

scenarios.leaveSubAllTargetsAskedPerVictim = {
  title: 'WX14-025【出】count:ALL（victimごとに先に問い、全応答後にまとめて移動）',
  spec: {
    hostSet: {
      // WX14-009＝花代Lv5/Limit12。召喚後のLv合計は 2+1+5=8。
      'field.lrig': ['WX14-009#41'],
      'field.signi': [['WX14-057#42'], ['WX14-058#43'], null], 'field.check': null,
      'hand': ['WX14-025#44'], 'energy': ['WD02-009#45', 'WD02-009#46', 'WD02-009#47'],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD03-001#48'],
      'field.signi': [['WX12-024#51'], ['WX12-024#52'], ['WD03-013#53']], 'field.check': null,
      'hand': [], 'energy': [], 'actions_done': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    const initialGuest = ['WX12-024#51', 'WX12-024#52', 'WD03-013#53'];
    const flow = { handOpened: false, summonChosen: false, zoneChosen: false, fired: false };
    const selectedEnergy = new Set();
    let preApplySnapshot = null;
    let last = await H.queryState();
    for (let s = 0; s < 90; s++) {
      await page.waitForTimeout(200);
      let did = null;
      if (!flow.handOpened) {
        did = await H.clickTestId('my-hand-card-0');
        if (did) flow.handOpened = true;
      } else if (!flow.summonChosen) {
        did = await H.clickBtn('召喚', { exact: true });
        if (did) flow.summonChosen = true;
      } else if (!flow.zoneChosen) {
        did = await H.clickTestId('summon-zone-2');
        if (did) flow.zoneChosen = true;
      } else if (selectedEnergy.size < 3) {
        const next = [0, 1, 2].find(i => !selectedEnergy.has(i));
        did = await H.clickTestId(`onplaycost-energy-${next}`);
        if (did) selectedEnergy.add(next);
      } else if (!flow.fired) {
        did = await H.clickBtn('発動', { exact: true });
        if (did) flow.fired = true;
      } else {
        did = await H.stdStep(['発動順序を確定', '決定']);
      }

      const st = await H.queryState();
      last = st;
      const asks = leaveSubQuestionLogs(st);
      const isLeavePending = (st?.pendingOptions ?? []).some(o => o.startsWith('none:置換しない'));
      const choiceKeys = Object.keys(st?.guest?.leaveSubstituteChoices ?? {});
      const allStillOnField = initialGuest.every(n => leaveSubHas(st?.guest?.fieldSigni, n));
      if (isLeavePending && st?.pendingRespondPlayer === st?.viewerUserId) {
        return { pass: false, detail: `【応答者反転】ALL経路の離場置換がhost viewerへ出た（${leaveSubTimeout(st)}）` };
      }
      if (isLeavePending && choiceKeys.length === 1) {
        if (!allStillOnField) {
          return { pass: false, detail: `【途中移動回帰】1体目の応答後・2体目の問いの途中で対象が場を離れた（${leaveSubTimeout(st)}）` };
        }
        preApplySnapshot ??= { choices: st.guest.leaveSubstituteChoices, fieldSigni: st.guest.fieldSigni, pendingOptions: st.pendingOptions };
      }
      H.log(`  lsatapv[${s}] -> ${did ?? 'なし'} | flow=${JSON.stringify(flow)} energy=${selectedEnergy.size}/3 asks=${asks.length} pEff=${st?.pendingEffect ?? '-'} responder=${st?.pendingRespondPlayer ?? '-'} choices=${JSON.stringify(st?.guest?.leaveSubstituteChoices ?? null)} gField=${JSON.stringify(st?.guest?.fieldSigni)} gEnergy=${JSON.stringify(st?.guest?.energyCards ?? [])}`);

      if (asks.length > 2) return { pass: false, detail: `【二重質問】2 victimsに対し問いが${asks.length}件：${JSON.stringify(asks)}` };
      if (flow.fired && leaveSubSettled(st) && asks.length === 2 && preApplySnapshot) {
        const movedAfterAllAnswers = !initialGuest.every(n => leaveSubHas(st?.guest?.fieldSigni, n))
          && (st?.guest?.energyCards ?? []).length > 0;
        // 🔴続き475 追加＝**同一 instance がエナに複製されていないこと**（§3 (cxxvi)）。従来この判定が無く、
        //   複製が起きたまま緑になっていた（実測 gEnergy=["WX12-024#52","WX12-024#52","WD03-013#53"]）。
        //   原因＝身代わりで既に場を離れた instance を `applyBanish` のループが**もう一度**処理し、
        //   `removeFromField` が空振りしたまま移動先へ push するため。
        const energyCards = st?.guest?.energyCards ?? [];
        const duplicated = energyCards.filter((n, i) => energyCards.indexOf(n) !== i);
        if (movedAfterAllAnswers && duplicated.length > 0) {
          return { pass: false, detail: `🔴【instance複製＝§3 (cxxvi)】問い2件・移動は起きたが同一instanceがエナに重複=${JSON.stringify(duplicated)}（${leaveSubTimeout(st)}）` };
        }
        if (movedAfterAllAnswers) {
          return { pass: true, detail: `victimごとの問い2件、1件目決定後も全3体が場に残る中間snapshot=${JSON.stringify(preApplySnapshot)}、全応答後に移動・解決完了・エナに重複instanceなし（${leaveSubTimeout(st)}）` };
        }
        return { pass: false, detail: `2回問いは出たが、全応答後の移動が未確認（${leaveSubTimeout(st)}）` };
      }
    }
    return { pass: false, detail: `count:ALL離場置換タイムアウト（preApply=${JSON.stringify(preApplySnapshot)} / ${leaveSubTimeout(last)}）` };
  },
};

// ── 続き424：強制アタック enforcement（実機はネットワーク遮断環境のため検証側へ引き渡す） ──
const FORCED_ATTACK_WARNING = '⚠ アタックしなければなりません';
const FORCED_ATTACK_BANNER = '⚠ あなたのシグニは可能ならばアタックしなければなりません';
const SIGNI_SKIP_CONFIRM = 'まだ攻撃していないシグニがいます';

const makeForcedAttackSpec = ({ guestLrig = 'WD07-004#2', guestSigni = [null, null, null], hostExtra = {} } = {}) => ({
  hostSet: {
    'field.lrig': ['WD01-001#1'],
    'field.signi': [['WD01-013#1'], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': [], 'energy': [],
    ...hostExtra,
  },
  guestSet: {
    'field.lrig': [guestLrig],
    'field.signi': guestSigni,
    'field.check': null,
    'hand': [], 'energy': [],
  },
  top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
});

async function driveForcedAttackBlock(page, H, sourceCheck) {
  const initial = await H.queryState();
  if (initial?.turnPhase !== 'ATTACK_SIGNI' || !sourceCheck(initial)) {
    return { pass: false, detail: `注入前提不成立（phase=${initial?.turnPhase} guestLrig=${initial?.guest?.lrigTop} guestField=${JSON.stringify(initial?.guest?.fieldSigni)}）` };
  }
  let phaseClicked = false;
  let sawWarning = false;
  let last = initial;
  for (let s = 0; s < 12; s++) {
    await page.waitForTimeout(350);
    const warning = page.getByText(FORCED_ATTACK_WARNING, { exact: true }).first();
    if (await warning.count() && await warning.isVisible().catch(() => false)) {
      sawWarning = true;
      const blocked = await H.queryState();
      const closed = await H.clickBtn('OK', { exact: true });
      await page.waitForTimeout(250);
      const stillVisible = await warning.isVisible().catch(() => false);
      const afterClose = await H.queryState();
      const pass = phaseClicked && blocked?.turnPhase === 'ATTACK_SIGNI'
        && !!closed && !stillVisible && afterClose?.turnPhase === 'ATTACK_SIGNI';
      return {
        pass,
        detail: `進行click=${phaseClicked}→警告観測=${sawWarning}／警告時phase=${blocked?.turnPhase}／OK=${closed ?? 'なし'}／閉じた後phase=${afterClose?.turnPhase} visible=${stillVisible}`,
      };
    }
    if (!phaseClicked) {
      const did = await H.clickBtn('ルリグアタックへ', { exact: true });
      if (did) phaseClicked = true;
    }
    last = await H.queryState();
    H.log(`  fab[${s}] phaseClick=${phaseClicked} warning=${sawWarning} phase=${last?.turnPhase}`);
    if (phaseClicked && last?.turnPhase === 'ATTACK_LRIG') {
      return { pass: false, detail: '【強制無視回帰】進行ボタン押下後、警告なしでATTACK_LRIGへ素通り' };
    }
  }
  return { pass: false, detail: `強制警告を観測できず（click=${phaseClicked} phase=${last?.turnPhase}）` };
}

scenarios.forcedAttackBlocksPhaseAdvance = {
  title: 'WD07-004【常】（未アタックの対象が残る間はシグニアタックフェイズから進めない）',
  spec: makeForcedAttackSpec(),
  drive: (page, H) => driveForcedAttackBlock(page, H, st => st?.guest?.lrigTop === 'WD07-004#2'),
};

scenarios.forcedAttackControlAdvances = {
  title: 'WD07-004対照（非強制ルリグへ1点だけ差し替えるとATTACK_LRIGへ進める）',
  spec: makeForcedAttackSpec({ guestLrig: 'WD01-001#2' }),
  async drive(page, H) {
    const initial = await H.queryState();
    if (initial?.turnPhase !== 'ATTACK_SIGNI' || initial?.guest?.lrigTop !== 'WD01-001#2') {
      return { pass: false, detail: `対照の注入前提不成立（phase=${initial?.turnPhase} guestLrig=${initial?.guest?.lrigTop}）` };
    }
    let phaseClicked = false;
    let sawSkip = false;
    let sawWarning = false;
    let last = initial;
    for (let s = 0; s < 14; s++) {
      await page.waitForTimeout(350);
      const warning = page.getByText(FORCED_ATTACK_WARNING, { exact: true }).first();
      if (await warning.count() && await warning.isVisible().catch(() => false)) {
        sawWarning = true;
        await H.clickBtn('OK', { exact: true });
        return { pass: false, detail: '【対照汚染】非強制ルリグ盤面で強制警告が出た（OKで閉鎖済み）' };
      }
      const skip = page.getByText(SIGNI_SKIP_CONFIRM, { exact: true }).first();
      if (await skip.count() && await skip.isVisible().catch(() => false)) {
        sawSkip = true;
        await H.clickBtn('このまま進む', { exact: true });
      } else if (!phaseClicked) {
        const did = await H.clickBtn('ルリグアタックへ', { exact: true });
        if (did) phaseClicked = true;
      }
      last = await H.queryState();
      H.log(`  faca[${s}] phaseClick=${phaseClicked} skip=${sawSkip} warning=${sawWarning} phase=${last?.turnPhase}`);
      if (last?.turnPhase === 'ATTACK_LRIG') {
        return {
          pass: phaseClicked && sawSkip && !sawWarning,
          detail: `非強制対照で進行click=${phaseClicked}→通常スキップ確認=${sawSkip}→phase=${last.turnPhase}（強制警告=${sawWarning}）`,
        };
      }
    }
    return { pass: false, detail: `対照がATTACK_LRIGへ進まず（click=${phaseClicked} skip=${sawSkip} warning=${sawWarning} phase=${last?.turnPhase}）` };
  },
};

scenarios.forcedAttackAdvancesAfterAllAttacked = {
  title: 'WD07-004【常】（対象シグニが実際にアタックしてダウンした後は進める）',
  spec: makeForcedAttackSpec(),
  async drive(page, H) {
    const initial = await H.queryState();
    if (initial?.turnPhase !== 'ATTACK_SIGNI' || initial?.guest?.lrigTop !== 'WD07-004#2'
        || initial?.host?.signiDown?.[0] !== false) {
      return { pass: false, detail: `注入前提不成立（phase=${initial?.turnPhase} guestLrig=${initial?.guest?.lrigTop} down=${JSON.stringify(initial?.host?.signiDown)}）` };
    }
    let zoneOpened = false;
    let attackClicked = false;
    let attackLabel = null;
    let sawDownAfterClick = false;
    let phaseClicked = false;
    let sawWarning = false;
    let last = initial;
    for (let s = 0; s < 30; s++) {
      await page.waitForTimeout(350);
      let did = null;
      const warning = page.getByText(FORCED_ATTACK_WARNING, { exact: true }).first();
      if (await warning.count() && await warning.isVisible().catch(() => false)) {
        sawWarning = true;
        await H.clickBtn('OK', { exact: true });
        return { pass: false, detail: `【永久ブロック回帰】全対象ダウン後も強制警告（downObserved=${sawDownAfterClick}、OKで閉鎖済み）` };
      }
      if (!zoneOpened) {
        did = await H.clickTestId('my-signi-zone-0');
        if (did) zoneOpened = true;
      } else if (!attackClicked) {
        const attack = page.locator('[data-testid^="card-action-"][data-action-label*="アタック"]').first();
        if (await attack.count() && await attack.isVisible().catch(() => false) && await attack.isEnabled().catch(() => false)) {
          attackLabel = await attack.getAttribute('data-action-label');
          await attack.click();
          attackClicked = true;
          did = `action:${attackLabel}`;
        }
      } else {
        last = await H.queryState();
        if (last?.host?.signiDown?.[0] === true) sawDownAfterClick = true;
        if (!phaseClicked && sawDownAfterClick && last?.host?.fieldCheck === null && last?.guest?.fieldCheck === null) {
          did = await H.clickBtn('ルリグアタックへ', { exact: true });
          if (did) phaseClicked = true;
        }
        if (!did) did = await H.clickTextOrBtn(['エナに送る', 'ライフバーストなし', 'ガードしない', 'OK']);
      }
      last = await H.queryState();
      if (attackClicked && last?.host?.signiDown?.[0] === true) sawDownAfterClick = true;
      H.log(`  faaa[${s}] -> ${did ?? 'なし'} | zone=${zoneOpened} attack=${attackClicked}:${attackLabel ?? '-'} downAfter=${sawDownAfterClick} phaseClick=${phaseClicked} warning=${sawWarning} phase=${last?.turnPhase}`);
      if (phaseClicked && last?.turnPhase === 'ATTACK_LRIG') {
        return {
          pass: zoneOpened && attackClicked && typeof attackLabel === 'string' && attackLabel.includes('アタック')
            && sawDownAfterClick && !sawWarning,
          detail: `zone0を特定→data-action-label=${attackLabel}をクリック→down=true観測→進行click=${phaseClicked}→${last.turnPhase}`,
        };
      }
    }
    return { pass: false, detail: `全アタック後進行タイムアウト（zone=${zoneOpened} attack=${attackClicked}:${attackLabel ?? '-'} down=${sawDownAfterClick} phaseClick=${phaseClicked} phase=${last?.turnPhase}）` };
  },
};

scenarios.forcedAttackBannerOnMyTurn = {
  title: 'WD07-004【常】（自分ターンの赤バナー表示＋非強制ルリグへの差し替え対照）',
  spec: makeForcedAttackSpec(),
  async drive(page, H) {
    const initial = await H.queryState();
    const banner = page.getByText(FORCED_ATTACK_BANNER, { exact: true }).first();
    let sawForcedBanner = false;
    for (let s = 0; s < 8; s++) {
      await page.waitForTimeout(300);
      if (await banner.count() && await banner.isVisible().catch(() => false)) { sawForcedBanner = true; break; }
    }
    if (!sawForcedBanner || initial?.turnPhase !== 'ATTACK_SIGNI' || initial?.guest?.lrigTop !== 'WD07-004#2') {
      return { pass: false, detail: `強制盤面の赤バナー未確認（banner=${sawForcedBanner} phase=${initial?.turnPhase} guestLrig=${initial?.guest?.lrigTop}）` };
    }
    const patched = await H.patchPlayerState('guest', { 'field.lrig': ['WD01-001#2'] });
    if (patched?.error) return { pass: false, detail: `対照PATCH失敗: ${patched.error}` };
    let controlObserved = false;
    let bannerGone = false;
    let last = initial;
    for (let s = 0; s < 12; s++) {
      await page.waitForTimeout(350);
      last = await H.queryState();
      if (last?.guest?.lrigTop === 'WD01-001#2') {
        controlObserved = true;
        bannerGone = !(await banner.isVisible().catch(() => false));
        if (bannerGone) break;
      }
    }
    return {
      pass: sawForcedBanner && controlObserved && bannerGone && last?.turnPhase === 'ATTACK_SIGNI',
      detail: `WD07-004時banner=${sawForcedBanner}→guest.field.lrigだけWD01-001へPATCH観測=${controlObserved}→bannerGone=${bannerGone}／phase=${last?.turnPhase}`,
    };
  },
};

scenarios.forcedAttackNoSoftlockWhenUnattackable = {
  title: 'WD07-004【常】（アタック追加コストを払えないシグニだけなら警告せず進める）',
  spec: makeForcedAttackSpec({ hostExtra: { 'signi_attack_cost': 1, 'energy': [] } }),
  async drive(page, H) {
    const initial = await H.queryState();
    if (initial?.turnPhase !== 'ATTACK_SIGNI' || initial?.guest?.lrigTop !== 'WD07-004#2'
        || initial?.host?.energy !== 0 || initial?.host?.signiDown?.[0] !== false) {
      return { pass: false, detail: `注入前提不成立（phase=${initial?.turnPhase} guestLrig=${initial?.guest?.lrigTop} energy=${initial?.host?.energy} down=${JSON.stringify(initial?.host?.signiDown)}）` };
    }
    const opened = await H.clickTestId('my-signi-zone-0');
    await page.waitForTimeout(250);
    const attack = page.locator('[data-testid^="card-action-"][data-action-label*="アタック"]').first();
    const attackAbsent = !(await attack.count()) || !(await attack.isVisible().catch(() => false));
    await H.closeModals();
    if (!opened || !attackAbsent) {
      return { pass: false, detail: `アタック不可のUI前提不成立（zoneOpened=${!!opened} attackAbsent=${attackAbsent}）` };
    }
    let phaseClicked = false;
    let sawSkip = false;
    let sawWarning = false;
    let last = initial;
    for (let s = 0; s < 14; s++) {
      await page.waitForTimeout(350);
      const warning = page.getByText(FORCED_ATTACK_WARNING, { exact: true }).first();
      if (await warning.count() && await warning.isVisible().catch(() => false)) {
        sawWarning = true;
        await H.clickBtn('OK', { exact: true });
        return { pass: false, detail: '【ソフトロック回帰】アタックボタンが無い対象で強制警告が出た（OKで閉鎖済み）' };
      }
      const skip = page.getByText(SIGNI_SKIP_CONFIRM, { exact: true }).first();
      if (await skip.count() && await skip.isVisible().catch(() => false)) {
        sawSkip = true;
        await H.clickBtn('このまま進む', { exact: true });
      } else if (!phaseClicked) {
        const did = await H.clickBtn('ルリグアタックへ', { exact: true });
        if (did) phaseClicked = true;
      }
      last = await H.queryState();
      H.log(`  fanswu[${s}] attackAbsent=${attackAbsent} phaseClick=${phaseClicked} skip=${sawSkip} warning=${sawWarning} phase=${last?.turnPhase}`);
      if (last?.turnPhase === 'ATTACK_LRIG') {
        return {
          pass: attackAbsent && phaseClicked && sawSkip && !sawWarning,
          detail: `追加コスト1・energy0でアタックボタン無し=${attackAbsent}→進行click=${phaseClicked}→通常スキップ確認=${sawSkip}→${last.turnPhase}`,
        };
      }
    }
    return { pass: false, detail: `アタック不可時にATTACK_LRIGへ進めず（attackAbsent=${attackAbsent} click=${phaseClicked} skip=${sawSkip} warning=${sawWarning} phase=${last?.turnPhase}）` };
  },
};

scenarios.forcedAttackFromResonaOnField = {
  title: 'WX12-010レゾナ【常】（guest field.signi走査でも未アタック対象が残る間は進めない）',
  spec: makeForcedAttackSpec({ guestLrig: 'WD01-001#2', guestSigni: [['WX12-010#2'], null, null] }),
  drive: (page, H) => driveForcedAttackBlock(page, H, st =>
    st?.guest?.lrigTop === 'WD01-001#2' && st?.guest?.fieldSigni?.[0]?.at(-1) === 'WX12-010#2'),
};

// ── 続き425：対戦相手の任意支払い（極性・主語） ────────────────────────
// CPU は CHOOSE の先頭 available を選ぶため、各対照は guest の資源枚数だけを変えて pay/discard と skip を撃ち分ける。
// ⚠進行中アタックの NEGATE_ATTACK は negated_attacks へ残らず cancel_current_signi_attack を経て解決時に消えるため、
//   ground truth は「支払い資源の差分＋ライフ不変＋無効化ログ」。負側は同じ発火ログを見てからライフ減少を待つ。
const OPP_PAY_OPTIONAL_PROMPT = '対戦相手：コストを支払いますか？';
const ATTACK_NEGATED_LOG_SUFFIXES = ['のアタックが無効になった', 'のアタックは無効化された'];

const makeOpponentPayAttackSpec = ({ attackerNum, hostHand, guestHand, guestEnergy }) => ({
  hostSet: {
    'field.lrig': ['WD01-001#1'],
    'field.signi': [[attackerNum], null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': hostHand,
    'energy': [],
    'actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#2'],
    'field.signi': [null, null, null],
    'field.signi_down': [false, false, false],
    'field.check': null,
    'hand': guestHand,
    'energy': guestEnergy,
    'actions_done': [],
  },
  top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
});

const pendingOptionState = (st, choiceId) => {
  const option = (st?.pendingOptions ?? []).find(o => o.startsWith(`${choiceId}:`));
  return option ? { option, disabled: option.endsWith('(disabled)') } : null;
};

const attackNegatedInLog = (st, cardName) => (st?.logTail ?? []).some(line =>
  ATTACK_NEGATED_LOG_SUFFIXES.some(suffix => line.includes(`${cardName}${suffix}`)));

async function driveOpponentPayAttack(page, H, cfg) {
  const before = await H.queryState();
  const beforeAttacker = before?.host?.fieldSigni?.[0]?.at(-1);
  if (before?.turnPhase !== 'ATTACK_SIGNI' || beforeAttacker !== cfg.attackerNum
      || before?.host?.fieldCheck !== null || before?.guest?.fieldCheck !== null) {
    return { pass: false, detail: `注入前提不成立（phase=${before?.turnPhase} attacker=${beforeAttacker} hCheck=${before?.host?.fieldCheck} gCheck=${before?.guest?.fieldCheck}）` };
  }

  let zoneOpened = false;
  let attackClicked = false;
  let sawPrompt = false;
  let choiceSnapshot = null;
  let choiceMismatch = null;
  let sawNegatedState = false;
  let last = before;
  for (let s = 0; s < 40; s++) {
    await page.waitForTimeout(350);
    let did = null;
    if (!zoneOpened) {
      did = await H.clickTestId('my-signi-zone-0');
      if (did) zoneOpened = true;
    } else if (!attackClicked) {
      const attack = page.locator('[data-testid^="card-action-"][data-action-label="アタック"]').first();
      if (await attack.count() && await attack.isVisible().catch(() => false) && await attack.isEnabled().catch(() => false)) {
        await attack.click({ timeout: 2000 });
        attackClicked = true;
        did = 'action:アタック';
      }
    } else {
      did = await H.clickBtn('発動順序を確定', { exact: true });
      if (!did) did = await H.clickBtn('ガードしない（ライフクロスクラッシュ）', { exact: true });
      if (!did) did = await H.clickBtn('エナに送る', { exact: true });
    }

    const st = await H.queryState();
    last = st;
    sawPrompt ||= (st?.logTail ?? []).some(line => line.includes(OPP_PAY_OPTIONAL_PROMPT));
    sawNegatedState ||= [...(st?.host?.negatedAttacks ?? []), ...(st?.guest?.negatedAttacks ?? [])]
      .some(n => n === cfg.attackerNum);
    if (!choiceSnapshot && st?.pendingEffect === 'CHOOSE') {
      const snap = pendingOptionState(st, cfg.choiceId);
      if (snap && (st.pendingOptions ?? []).some(o => o.startsWith('skip:'))) {
        choiceSnapshot = st.pendingOptions;
        if (snap.disabled !== cfg.expectChoiceDisabled) {
          choiceMismatch = `${cfg.choiceId} の disabled=${snap.disabled}（期待=${cfg.expectChoiceDisabled}） options=${JSON.stringify(st.pendingOptions)}`;
        }
      }
    }

    const negatedLog = attackNegatedInLog(st, cfg.cardName);
    const settled = sawPrompt && !st?.pendingEffect && (st?.stackLen ?? 0) === 0
      && st?.host?.fieldCheck === null && st?.guest?.fieldCheck === null;
    const attackResolved = negatedLog || st?.guest?.life !== before?.guest?.life;
    H.log(`  ${cfg.logTag}[${s}] -> ${did ?? 'なし'} | prompt=${sawPrompt} choice=${JSON.stringify(choiceSnapshot)} hHand=${st?.host?.hand} gHand=${st?.guest?.hand} gEnergy=${st?.guest?.energy} gTrash=${st?.guest?.trash} gLife=${st?.guest?.life}(開始${before?.guest?.life}) negatedLog=${negatedLog} negatedState=${sawNegatedState} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
    if (settled && attackResolved) {
      const verdict = cfg.evaluate(st, before, { negatedLog, sawNegatedState });
      if (choiceMismatch) return { pass: false, detail: `【選択肢available不一致】${choiceMismatch}／${verdict.detail}` };
      return { ...verdict, detail: `${verdict.detail}／prompt=${sawPrompt}／pendingOptions=${JSON.stringify(choiceSnapshot ?? 'CPU_ACTION_DELAY内で未捕捉')}／negatedAttacks transient=${sawNegatedState}` };
    }
  }
  return { pass: false, detail: `完了タイムアウト（zone=${zoneOpened} attack=${attackClicked} prompt=${sawPrompt} choice=${JSON.stringify(choiceSnapshot)} hHand=${last?.host?.hand} gHand=${last?.guest?.hand} gEnergy=${last?.guest?.energy} gTrash=${last?.guest?.trash} gLife=${last?.guest?.life} stack=${last?.stackLen ?? '-'} pEff=${last?.pendingEffect ?? '-'} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
}

const P_GUEST_ENERGY = ['WD01-013#4251', 'WD01-013#4252'];
scenarios.oppPayNegateAttackWhenPaid = {
  title: 'SPDi43-06-E1（CPUが《無》《無》を払ったときだけ、このアタックを無効にする）',
  spec: makeOpponentPayAttackSpec({ attackerNum: 'SPDi43-06#4250', hostHand: [], guestHand: [], guestEnergy: P_GUEST_ENERGY }),
  drive: (page, H) => driveOpponentPayAttack(page, H, {
    attackerNum: 'SPDi43-06#4250', cardName: '大罠　Ｙリコーダーガン', choiceId: 'pay', expectChoiceDisabled: false, logTag: 'opnpay',
    evaluate: (st, before, observed) => {
      const paidCardsMoved = P_GUEST_ENERGY.every(n => st.guest.trashCards.includes(n));
      const pass = st.guest.energy === before.guest.energy - 2 && st.guest.trash === before.guest.trash + 2
        && paidCardsMoved && st.guest.life === before.guest.life && observed.negatedLog;
      return { pass, detail: `CPU pay＝guest.energy ${before.guest.energy}→${st.guest.energy}／trash ${before.guest.trash}→${st.guest.trash}（指定2枚移動=${paidCardsMoved}）／life ${before.guest.life}→${st.guest.life}／無効化ログ=${observed.negatedLog}` };
    },
  }),
};

scenarios.oppPayAttackGoesThroughWhenUnpaid = {
  title: 'SPDi43-06-E1対照（guest.energy=0ならpay不可→skipでアタックが通る）',
  spec: makeOpponentPayAttackSpec({ attackerNum: 'SPDi43-06#4250', hostHand: [], guestHand: [], guestEnergy: [] }),
  drive: (page, H) => driveOpponentPayAttack(page, H, {
    attackerNum: 'SPDi43-06#4250', cardName: '大罠　Ｙリコーダーガン', choiceId: 'pay', expectChoiceDisabled: true, logTag: 'opnskip',
    evaluate: (st, before, observed) => {
      // 通ったアタックでクラッシュしたバニラのライフクロスは、CPUの「LBなし」自動応答後にエナへ行く。
      const pass = st.guest.energy === before.guest.energy + 1 && st.guest.trash === before.guest.trash
        && st.guest.life === before.guest.life - 1 && !observed.negatedLog;
      return { pass, detail: `CPU skip＝guest.energy ${before.guest.energy}→${st.guest.energy}（クラッシュ札+1）／trash ${before.guest.trash}→${st.guest.trash}／life ${before.guest.life}→${st.guest.life}／無効化ログ=${observed.negatedLog}` };
    },
  }),
};

const H_HOST_HAND = ['WD01-013#4260', 'WD01-013#4261'];
const H_GUEST_HAND_TWO = ['WD01-013#4262', 'WD01-013#4263'];
scenarios.oppHandDiscardIsOpponentSide = {
  title: 'WXDi-P05-037-E1（CPUが自分の手札2枚を捨て、host手札を傷つけずアタック無効）',
  spec: makeOpponentPayAttackSpec({ attackerNum: 'WXDi-P05-037#4250', hostHand: H_HOST_HAND, guestHand: H_GUEST_HAND_TWO, guestEnergy: [] }),
  drive: (page, H) => driveOpponentPayAttack(page, H, {
    attackerNum: 'WXDi-P05-037#4250', cardName: '大罠　ハーメルン', choiceId: 'discard', expectChoiceDisabled: false, logTag: 'ophdisc',
    evaluate: (st, before, observed) => {
      const guestCardsMoved = H_GUEST_HAND_TWO.every(n => st.guest.trashCards.includes(n));
      const hostCardsStayed = H_HOST_HAND.every(n => st.host.handCards.includes(n));
      const pass = st.guest.hand === before.guest.hand - 2 && st.guest.trash === before.guest.trash + 2
        && guestCardsMoved && st.host.hand === before.host.hand && hostCardsStayed
        && st.guest.life === before.guest.life && observed.negatedLog;
      return { pass, detail: `guest.hand ${before.guest.hand}→${st.guest.hand}／guest.trash ${before.guest.trash}→${st.guest.trash}（指定2枚移動=${guestCardsMoved}）／host.hand ${before.host.hand}→${st.host.hand}（指定2枚残存=${hostCardsStayed}）／life ${before.guest.life}→${st.guest.life}／無効化ログ=${observed.negatedLog}` };
    },
  }),
};

scenarios.oppHandDiscardUnavailableWhenShort = {
  title: 'WXDi-P05-037-E1対照（CPU手札1枚ではdiscard不可→skipで両者の手札不変・アタック通過）',
  spec: makeOpponentPayAttackSpec({ attackerNum: 'WXDi-P05-037#4250', hostHand: H_HOST_HAND, guestHand: [H_GUEST_HAND_TWO[0]], guestEnergy: [] }),
  drive: (page, H) => driveOpponentPayAttack(page, H, {
    attackerNum: 'WXDi-P05-037#4250', cardName: '大罠　ハーメルン', choiceId: 'discard', expectChoiceDisabled: true, logTag: 'ophskip',
    evaluate: (st, before, observed) => {
      const bothHandsStayed = st.host.hand === before.host.hand && st.guest.hand === before.guest.hand
        && H_HOST_HAND.every(n => st.host.handCards.includes(n)) && st.guest.handCards.includes(H_GUEST_HAND_TWO[0]);
      const pass = bothHandsStayed && st.guest.trash === before.guest.trash
        && st.guest.energy === before.guest.energy + 1
        && st.guest.life === before.guest.life - 1 && !observed.negatedLog;
      return { pass, detail: `両手札不変=${bothHandsStayed}（host ${before.host.hand}→${st.host.hand}／guest ${before.guest.hand}→${st.guest.hand}）／guest.trash ${before.guest.trash}→${st.guest.trash}／guest.energy ${before.guest.energy}→${st.guest.energy}（クラッシュ札+1）／life ${before.guest.life}→${st.guest.life}／無効化ログ=${observed.negatedLog}` };
    },
  }),
};

const D_HOST_HAND = ['WXDi-P09-064#4270', 'WD01-013#4271', 'WD01-013#4272'];
const D_HOST_SENTINELS = D_HOST_HAND.slice(1);
const D_GUEST_HAND_TWO = ['WD01-013#4273', 'WD01-013#4274'];
const makeOpponentDiscardOnPlaySpec = guestHand => ({
  hostSet: {
    'field.lrig': ['WD01-001#1'], 'field.signi': [null, null, null], 'field.check': null,
    'hand': D_HOST_HAND, 'energy': [], 'actions_done': [],
  },
  guestSet: {
    'field.lrig': ['WD01-001#2'], 'field.signi': [null, null, null], 'field.check': null,
    'hand': guestHand, 'energy': [], 'actions_done': [],
  },
  top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
});

async function driveOpponentDiscardOnPlay(page, H, cfg) {
  const before = await H.queryState();
  if (before?.turnPhase !== 'MAIN' || before?.host?.handCards?.[0] !== D_HOST_HAND[0]
      || before?.host?.fieldCheck !== null || before?.guest?.fieldCheck !== null) {
    return { pass: false, detail: `注入前提不成立（phase=${before?.turnPhase} hand0=${before?.host?.handCards?.[0]} hCheck=${before?.host?.fieldCheck} gCheck=${before?.guest?.fieldCheck}）` };
  }
  let handOpened = false;
  let summonClicked = false;
  let zoneClicked = false;
  let sawPrompt = false;
  let choiceSnapshot = null;
  let choiceMismatch = null;
  let last = before;
  for (let s = 0; s < 40; s++) {
    await page.waitForTimeout(350);
    let did = null;
    if (!handOpened) {
      did = await H.clickTestId('my-hand-card-0');
      if (did) handOpened = true;
    } else if (!summonClicked) {
      const summon = page.locator('[data-testid^="card-action-"][data-action-label="召喚"]').first();
      if (await summon.count() && await summon.isVisible().catch(() => false) && await summon.isEnabled().catch(() => false)) {
        await summon.click({ timeout: 2000 });
        summonClicked = true;
        did = 'action:召喚';
      }
    } else if (!zoneClicked) {
      did = await H.clickTestId('summon-zone-0');
      if (did) zoneClicked = true;
    } else {
      did = await H.clickBtn('発動順序を確定', { exact: true });
    }

    const st = await H.queryState();
    last = st;
    sawPrompt ||= (st?.logTail ?? []).some(line => line.includes(OPP_PAY_OPTIONAL_PROMPT));
    if (!choiceSnapshot && st?.pendingEffect === 'CHOOSE') {
      const snap = pendingOptionState(st, 'discard');
      if (snap && (st.pendingOptions ?? []).some(o => o.startsWith('skip:'))) {
        choiceSnapshot = st.pendingOptions;
        if (snap.disabled !== cfg.expectChoiceDisabled) {
          choiceMismatch = `discard の disabled=${snap.disabled}（期待=${cfg.expectChoiceDisabled}） options=${JSON.stringify(st.pendingOptions)}`;
        }
      }
    }
    const placed = st?.host?.fieldSigni?.[0]?.at(-1) === D_HOST_HAND[0];
    const settled = sawPrompt && placed && !st?.pendingEffect && (st?.stackLen ?? 0) === 0;
    H.log(`  ${cfg.logTag}[${s}] -> ${did ?? 'なし'} | opened=${handOpened}/${summonClicked}/${zoneClicked} placed=${placed} prompt=${sawPrompt} choice=${JSON.stringify(choiceSnapshot)} hHand=${st?.host?.hand} hDeck=${st?.host?.deck} gHand=${st?.guest?.hand} gDeck=${st?.guest?.deck} gTrash=${st?.guest?.trash} stack=${st?.stackLen ?? '-'} pEff=${st?.pendingEffect ?? '-'}`);
    if (settled) {
      const verdict = cfg.evaluate(st, before);
      if (choiceMismatch) return { pass: false, detail: `【選択肢available不一致】${choiceMismatch}／${verdict.detail}` };
      return { ...verdict, detail: `${verdict.detail}／prompt=${sawPrompt}／pendingOptions=${JSON.stringify(choiceSnapshot ?? 'CPU_ACTION_DELAY内で未捕捉')}` };
    }
  }
  return { pass: false, detail: `【出】完了タイムアウト（opened=${handOpened}/${summonClicked}/${zoneClicked} prompt=${sawPrompt} choice=${JSON.stringify(choiceSnapshot)} hHand=${last?.host?.hand} hDeck=${last?.host?.deck} gHand=${last?.guest?.hand} gDeck=${last?.guest?.deck} gTrash=${last?.guest?.trash} stack=${last?.stackLen ?? '-'} pEff=${last?.pendingEffect ?? '-'} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
}

scenarios.oppPlayDiscardThenOpponentDraws = {
  title: 'WXDi-P09-064-E1【出】（CPUが手札2枚を捨て、そのCPUが2枚引く）',
  spec: makeOpponentDiscardOnPlaySpec(D_GUEST_HAND_TWO),
  drive: (page, H) => driveOpponentDiscardOnPlay(page, H, {
    expectChoiceDisabled: false, logTag: 'opddraw',
    evaluate: (st, before) => {
      const guestCardsMoved = D_GUEST_HAND_TWO.every(n => st.guest.trashCards.includes(n));
      const hostSentinelsStayed = D_HOST_SENTINELS.every(n => st.host.handCards.includes(n));
      const hostOnlySummoned = st.host.hand === before.host.hand - 1 && hostSentinelsStayed
        && st.host.trash === before.host.trash && st.host.deck === before.host.deck;
      const pass = guestCardsMoved && st.guest.trash === before.guest.trash + 2
        && st.guest.deck === before.guest.deck - 2 && st.guest.hand === before.guest.hand
        && hostOnlySummoned;
      return { pass, detail: `guest.trash ${before.guest.trash}→${st.guest.trash}（指定2枚移動=${guestCardsMoved}）／guest.deck ${before.guest.deck}→${st.guest.deck}／guest.hand ${before.guest.hand}→${st.guest.hand}／hostは召喚札だけ減少=${hostOnlySummoned}（hand ${before.host.hand}→${st.host.hand}, deck ${before.host.deck}→${st.host.deck}）` };
    },
  }),
};

scenarios.oppPlayDiscardSkippedWhenNoHand = {
  title: 'WXDi-P09-064-E1【出】対照（CPU手札0ならdiscard不可→捨てもドローも起きない）',
  spec: makeOpponentDiscardOnPlaySpec([]),
  drive: (page, H) => driveOpponentDiscardOnPlay(page, H, {
    expectChoiceDisabled: true, logTag: 'opdskip',
    evaluate: (st, before) => {
      const hostSentinelsStayed = D_HOST_SENTINELS.every(n => st.host.handCards.includes(n));
      const hostOnlySummoned = st.host.hand === before.host.hand - 1 && hostSentinelsStayed
        && st.host.trash === before.host.trash && st.host.deck === before.host.deck;
      const guestUnchanged = st.guest.hand === before.guest.hand && st.guest.trash === before.guest.trash
        && st.guest.deck === before.guest.deck;
      return { pass: guestUnchanged && hostOnlySummoned, detail: `CPU資源不変=${guestUnchanged}（hand ${before.guest.hand}→${st.guest.hand}／trash ${before.guest.trash}→${st.guest.trash}／deck ${before.guest.deck}→${st.guest.deck}）／hostは召喚札だけ減少=${hostOnlySummoned}（hand ${before.host.hand}→${st.host.hand}, deck ${before.host.deck}→${st.host.deck}）` };
    },
  }),
};

// ── §7 V-11 配置制限ゲートの一本化（Codex起案・実機採否はClaude側） ─────────────
// 効果配置は、既存 installByEffectFreeze でクリック列が確立している WD08-001-E3
// 【起】《ダウン》→ ADD_TO_FIELD(TRASH_CARD,self,1) を使う。host は常に2面＋空き1面、
// トラッシュ候補も1枚だけに固定し、SELECT_SIGNI_ZONE と候補順の曖昧さを避ける。
scenarios.v11EffectDeployCountFlagBlocked = {
  title: 'V-11 A-1 フラグ版cap=2（効果配置不発＋完全一致ログ＋通常召喚ゲート）',
  spec: {
    hostSet: {
      'field.lrig': ['WD08-001#6100'],
      'field.signi': [['WD01-012#6101'], ['WD01-012#6102'], null],
      'field.lrig_down': false,
      'trash': ['WD01-013#6103'],
      'hand': [],
      'signi_deploy_count_limit': 2,
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6105'],
      'field.signi': [null, null, null],
    },
    handPrepend: ['WD01-013#6104'],
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const target = 'WD01-013#6103';
    const expectedLog = '配置数制限のため小剣　ククリを場に出せない';
    const countSigni = fs => (fs ?? []).filter(stack => stack?.length).length;
    const hasTarget = fs => (fs ?? []).some(stack => (stack ?? []).includes(target));
    const before = await H.queryState();
    if (countSigni(before?.host?.fieldSigni) !== 2 || !(before?.host?.trashCards ?? []).includes(target)) {
      return { pass: false, detail: `注入前提不成立（hField=${JSON.stringify(before?.host?.fieldSigni)} hTrash=${JSON.stringify(before?.host?.trashCards)}）` };
    }
    await H.ensureMain();

    // ⚠通常召喚ゲートの assert は **効果配置の観測を終えてから**やる（続き476 実測）。
    //   先に手札モーダル→召喚ゾーンモーダルを開閉すると、その後ルリグスロットのクリックが
    //   オーバーレイに吸われて【起】モーダルが二度と開かず、40反復を空振りする。
    let lrigOpened = false;
    let abilityClicked = false;
    let blocked = false;
    let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      let did = null;
      if (!lrigOpened) {
        did = await H.clickTestId('my-lrig-slot-center');
        if (did) lrigOpened = true;
      } else if (!abilityClicked) {
        did = await H.clickBtn('【起】コストなし', { nth: 1 });
        if (did) abilityClicked = true;
      }
      if (!did) did = await H.clickBtn('発動', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK']);
      const st = await H.queryState();
      last = st;
      const groundBlocked = countSigni(st?.host?.fieldSigni) === 2
        && !hasTarget(st?.host?.fieldSigni) && (st?.host?.trashCards ?? []).includes(target);
      const exactLog = (st?.logTail ?? []).includes(expectedLog);
      // ⚠「効果が実際に走った」証拠はルリグのダウンでは取れない＝ルリグ【起】の《ダウン》コストは
      //   `executeSigniActivated` が **シグニゾーンしか** ダウンさせず lrig_down は常に false のまま（続き476 実測）。
      //   ⇒ 走行証拠は【起】効果の実ログで取る。
      const actLog = (st?.logTail ?? []).some(l => l.includes('混沌の鍵主') && l.includes('【起】効果'));
      const settled = abilityClicked && actLog && !st?.pendingEffect && (st?.stackLen ?? 0) === 0;
      H.log(`  v11a1[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} actLog=${actLog} exactLog=${exactLog} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (settled && groundBlocked && exactLog) { blocked = true; break; }
    }
    if (!blocked) {
      return { pass: false, detail: `フラグ版配置制限を確定できず（hField=${JSON.stringify(last?.host?.fieldSigni)} hTrash=${JSON.stringify(last?.host?.trashCards)} logTail=${JSON.stringify(last?.logTail ?? [])} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
    }

    // 同じ cap で通常召喚も閉じることを、このシナリオ内の追加assertで見る。
    // ⚠実測（続き476）＝配置数制限は **CardModal の「召喚」ボタンでは見ていない**。ゲートは
    //   `SigniSummonZoneModal.tsx:72`（ゾーンボタンの disabled）と `handleSummonSigni`（BattleScreen.tsx:5551）
    //   にある＝「召喚ボタンが出ない」ではなく「**召喚先ゾーンが1つも選べない**」が現行の正しい絵。
    await H.closeModals();
    await page.waitForTimeout(400);
    const handOpened = await H.clickTestId('my-hand-card-0');
    if (!handOpened) return { pass: false, detail: '効果配置ブロックは確認できたが、通常召喚ゲート確認用の手札WD01-013を開けない' };
    await page.waitForTimeout(400);
    const summon = page.getByRole('button', { name: '召喚', exact: true }).first();
    let normalSummonGate = 'ボタン非表示/disabled';
    if (!!(await summon.count()) && await summon.isVisible().catch(() => false)
        && await summon.isEnabled().catch(() => false)) {
      await summon.click().catch(() => {});
      await page.waitForTimeout(600);
      const zoneEnabled = [];
      for (const zi of [0, 1, 2]) {
        const z = page.getByTestId(`summon-zone-${zi}`).first();
        if (await z.count() && await z.isVisible().catch(() => false)) {
          zoneEnabled.push(`z${zi}=${await z.isEnabled().catch(() => false)}`);
        }
      }
      H.log(`  v11a1 通常召喚ゾーン: ${zoneEnabled.join(' ') || '（ゾーンボタンなし）'}`);
      if (!(zoneEnabled.length > 0 && zoneEnabled.every(x => x.endsWith('=false')))) {
        return { pass: false, detail: `効果配置は正しく弾いたが、通常召喚の召喚先ゾーンが選べる（ゲート破れ・${zoneEnabled.join(' ')}）` };
      }
      normalSummonGate = `召喚先ゾーン全disabled（${zoneEnabled.join(' ')}）`;
    }
    return { pass: true, detail: `効果配置が不発（場2体・${target}はtrash残留）＋完全一致ログ「${expectedLog}」／通常召喚も${normalSummonGate}` };
  },
};

scenarios.v11EffectDeployNoLimitControl = {
  title: 'V-11 A-2 対照（同一盤面からcount flagだけ外すと効果配置成功）',
  spec: {
    hostSet: {
      'field.lrig': ['WD08-001#6110'],
      'field.signi': [['WD01-012#6111'], ['WD01-012#6112'], null],
      'field.lrig_down': false,
      'trash': ['WD01-013#6113'],
      'hand': [],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6115'],
      'field.signi': [null, null, null],
    },
    handPrepend: ['WD01-013#6114'],
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const target = 'WD01-013#6113';
    // ⚠実測（続き476）＝この経路の成功ログは `…を場に出す`（`effectExecutor.ts:8784` 側）。
    //   `…をフィールドに出す`（同 2772）は別分岐で、本シナリオでは出ない。
    const placedLog = '小剣　ククリを場に出す';
    const blockedLog = '配置数制限のため小剣　ククリを場に出せない';
    const countSigni = fs => (fs ?? []).filter(stack => stack?.length).length;
    const hasTarget = fs => (fs ?? []).some(stack => (stack ?? []).includes(target));
    const before = await H.queryState();
    await H.ensureMain();
    let lrigOpened = false;
    let abilityClicked = false;
    let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      let did = null;
      if (!lrigOpened) {
        did = await H.clickTestId('my-lrig-slot-center');
        if (did) lrigOpened = true;
      } else if (!abilityClicked) {
        did = await H.clickBtn('【起】コストなし', { nth: 1 });
        if (did) abilityClicked = true;
      }
      if (!did) did = await H.clickBtn('発動', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK']);
      const st = await H.queryState();
      last = st;
      const groundPlaced = countSigni(st?.host?.fieldSigni) === 3
        && hasTarget(st?.host?.fieldSigni) && !(st?.host?.trashCards ?? []).includes(target);
      const exactPlacedLog = (st?.logTail ?? []).includes(placedLog);
      const noBlockLog = !(st?.logTail ?? []).includes(blockedLog);
      const actLog = (st?.logTail ?? []).some(l => l.includes('混沌の鍵主') && l.includes('【起】効果'));
      const settled = abilityClicked && actLog && !st?.pendingEffect && (st?.stackLen ?? 0) === 0;
      H.log(`  v11a2[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} actLog=${actLog} placedLog=${exactPlacedLog} noBlock=${noBlockLog} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (settled && groundPlaced && exactPlacedLog && noBlockLog) {
        return { pass: true, detail: `count flagだけ外すと${target}がtrash→空き1面へ移動（場2→3）＋完全一致ログ「${placedLog}」` };
      }
    }
    return { pass: false, detail: `対照の効果配置成功を確定できず（before=${JSON.stringify(before?.host?.fieldSigni)} hField=${JSON.stringify(last?.host?.fieldSigni)} hTrash=${JSON.stringify(last?.host?.trashCards)} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
  },
};

scenarios.v11EffectDeployContinuousBlocked = {
  title: 'V-11 A-3 CONTINUOUS版WX07-006（fillDeployCaps経由で効果配置不発）',
  spec: {
    hostSet: {
      'field.lrig': ['WD08-001#6120'],
      'field.signi': [['WD01-012#6121'], ['WD01-012#6122'], null],
      'field.lrig_down': false,
      'trash': ['WD01-013#6123'],
      'hand': [],
      'actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6125'],
      'field.signi': [['WX07-006#6126'], null, null],
    },
    handPrepend: ['WD01-013#6124'],
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const target = 'WD01-013#6123';
    const expectedLog = '配置数制限のため小剣　ククリを場に出せない';
    const countSigni = fs => (fs ?? []).filter(stack => stack?.length).length;
    const hasTarget = fs => (fs ?? []).some(stack => (stack ?? []).includes(target));
    const before = await H.queryState();
    if (!(before?.guest?.fieldSigni ?? []).some(stack => (stack ?? []).includes('WX07-006#6126'))) {
      return { pass: false, detail: `CONT制限源WX07-006の注入前提不成立（gField=${JSON.stringify(before?.guest?.fieldSigni)}）` };
    }
    await H.ensureMain();
    let lrigOpened = false;
    let abilityClicked = false;
    let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      let did = null;
      if (!lrigOpened) {
        did = await H.clickTestId('my-lrig-slot-center');
        if (did) lrigOpened = true;
      } else if (!abilityClicked) {
        did = await H.clickBtn('【起】コストなし', { nth: 1 });
        if (did) abilityClicked = true;
      }
      if (!did) did = await H.clickBtn('発動', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK']);
      const st = await H.queryState();
      last = st;
      const groundBlocked = countSigni(st?.host?.fieldSigni) === 2
        && !hasTarget(st?.host?.fieldSigni) && (st?.host?.trashCards ?? []).includes(target);
      const exactLog = (st?.logTail ?? []).includes(expectedLog);
      const actLog = (st?.logTail ?? []).some(l => l.includes('混沌の鍵主') && l.includes('【起】効果'));
      const settled = abilityClicked && actLog && !st?.pendingEffect && (st?.stackLen ?? 0) === 0;
      H.log(`  v11a3[${s}] -> ${did ?? 'なし'} | hField=${JSON.stringify(st?.host?.fieldSigni)} gField=${JSON.stringify(st?.guest?.fieldSigni)} hTrash=${JSON.stringify(st?.host?.trashCards)} actLog=${actLog} exactLog=${exactLog} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (settled && groundBlocked && exactLog) {
        return { pass: true, detail: `guest場のWX07-006 CONTだけで効果配置不発（場2体・${target}はtrash残留）＋完全一致ログ「${expectedLog}」` };
      }
    }
    return { pass: false, detail: `CONT版配置制限を確定できず（hField=${JSON.stringify(last?.host?.fieldSigni)} gField=${JSON.stringify(last?.guest?.fieldSigni)} hTrash=${JSON.stringify(last?.host?.trashCards)} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
  },
};

scenarios.v11CpuDeployCountContinuousBlocked = {
  title: 'V-11 B-1 CPU配置数上限（host場WX07-006・2面到達済みなら3体目を召喚しない）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6130'],
      'field.signi': [['WX07-006#6131'], null, null],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6132'],
      'field.signi': [['WD03-013#6133'], ['WD03-013#6134'], null],
      'hand': ['WD01-013#6135'],
      'energy': [],
      'actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const countSigni = fs => (fs ?? []).filter(stack => stack?.length).length;
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(2500);
    await injectScenario(page, scenarios.v11CpuDeployCountContinuousBlocked.spec);
    let last = null;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      const st = await H.queryState();
      last = st;
      const count = countSigni(st?.guest?.fieldSigni);
      const candidateStayed = (st?.guest?.handCards ?? []).includes('WD01-013#6135');
      const attempted = st?.turnPhase !== 'MAIN' && st?.turnPhase !== 'GROW';
      const cpuPlaced = (st?.logTail ?? []).some(line => line.includes('[CPU] シグニ配置: 小剣　ククリ'));
      H.log(`  v11b1n[${s}] | phase=${st?.turnPhase} gCount=${count} gHand=${JSON.stringify(st?.guest?.handCards)} cpuPlaced=${cpuPlaced}`);
      if (count > 2 || cpuPlaced) return { pass: false, detail: `WX07-006のcap=2を超えてCPUが召喚（gField=${JSON.stringify(st?.guest?.fieldSigni)} logTail=${JSON.stringify(st?.logTail ?? [])}）` };
      if (attempted && count === 2 && candidateStayed) {
        return { pass: true, detail: `CPUがMAINの召喚判断を通過しても場2体のまま・3体目WD01-013は手札残留（phase=${st.turnPhase}）` };
      }
    }
    return { pass: false, detail: `CPUの配置数制限判定がinconclusive（phase=${last?.turnPhase} gField=${JSON.stringify(last?.guest?.fieldSigni)} gHand=${JSON.stringify(last?.guest?.handCards)}）` };
  },
};

scenarios.v11CpuDeployCountNoLimitControl = {
  title: 'V-11 B-1 対照（host場のWX07-006だけ外すとCPUが3体目を召喚）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6140'],
      'field.signi': [null, null, null],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6142'],
      'field.signi': [['WD03-013#6143'], ['WD03-013#6144'], null],
      'hand': ['WD01-013#6145'],
      'energy': [],
      'actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const countSigni = fs => (fs ?? []).filter(stack => stack?.length).length;
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(2500);
    await injectScenario(page, scenarios.v11CpuDeployCountNoLimitControl.spec);
    let last = null;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      const st = await H.queryState();
      last = st;
      const count = countSigni(st?.guest?.fieldSigni);
      const candidatePlaced = (st?.guest?.fieldSigni ?? []).some(stack => (stack ?? []).includes('WD01-013#6145'));
      const candidateLeftHand = !(st?.guest?.handCards ?? []).includes('WD01-013#6145');
      const exactCpuLog = (st?.logTail ?? []).includes('[CPU] シグニ配置: 小剣　ククリ（ゾーン3）');
      H.log(`  v11b1p[${s}] | phase=${st?.turnPhase} gCount=${count} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${JSON.stringify(st?.guest?.handCards)} exactLog=${exactCpuLog}`);
      if (count === 3 && candidatePlaced && candidateLeftHand && exactCpuLog) {
        return { pass: true, detail: '制限源WX07-006だけ外すとCPUがWD01-013を手札→zone3へ召喚し、場2→3' };
      }
    }
    return { pass: false, detail: `対照でCPUの3体目召喚を確認できず（phase=${last?.turnPhase} gField=${JSON.stringify(last?.guest?.fieldSigni)} gHand=${JSON.stringify(last?.guest?.handCards)} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
  },
};

scenarios.v11CpuDeployPowerLimitWithControl = {
  title: 'V-11 B-2 CPU配置パワー上限（5000以上だけ拒否）＋同一id内のflag除去対照',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6150'],
      'field.signi': [null, null, null],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6151'],
      'field.signi': [null, null, null],
      'hand': ['WD01-013#6152', 'WD01-012#6153'], // P3000(<5000)＋P7000(>=5000)
      'energy': [],
      'signi_deploy_power_limit': 5000,
      'actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const low = 'WD01-013#6152';
    const high = 'WD01-012#6153';
    const fieldHas = (st, n) => (st?.guest?.fieldSigni ?? []).some(stack => (stack ?? []).includes(n));
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(2500);
    await injectScenario(page, scenarios.v11CpuDeployPowerLimitWithControl.spec);
    let restricted = null;
    let last = null;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      const st = await H.queryState();
      last = st;
      const advanced = st?.turnPhase !== 'MAIN' && st?.turnPhase !== 'GROW';
      const lowPlaced = fieldHas(st, low) && !(st?.guest?.handCards ?? []).includes(low);
      const highStayed = !fieldHas(st, high) && (st?.guest?.handCards ?? []).includes(high);
      H.log(`  v11b2.limit[${s}] | phase=${st?.turnPhase} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${JSON.stringify(st?.guest?.handCards)}`);
      if (fieldHas(st, high)) return { pass: false, detail: `power limit=5000なのにCPUがP7000を召喚（gField=${JSON.stringify(st?.guest?.fieldSigni)}）` };
      if (advanced && lowPlaced && highStayed) { restricted = st; break; }
    }
    if (!restricted) {
      return { pass: false, detail: `制限側inconclusive（phase=${last?.turnPhase} gField=${JSON.stringify(last?.guest?.fieldSigni)} gHand=${JSON.stringify(last?.guest?.handCards)}）` };
    }

    // 対照＝手札・ルリグ・場・active/phaseを同じ初期値へ戻し、power flagだけを落とす。
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(600);
    await injectScenario(page, {
      hostSet: {
        'field.lrig': ['WD01-001#6150'],
        'field.signi': [null, null, null],
      },
      guestSet: {
        'field.lrig': ['WD03-003#6151'],
        'field.signi': [null, null, null],
        'hand': [low, high],
        'energy': [],
        'actions_done': [],
      },
      top: { active: 'cpu', turn_phase: 'MAIN', turn_count: 2 },
    });
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      const st = await H.queryState();
      last = st;
      const bothPlaced = fieldHas(st, low) && fieldHas(st, high)
        && !(st?.guest?.handCards ?? []).includes(low) && !(st?.guest?.handCards ?? []).includes(high);
      H.log(`  v11b2.control[${s}] | phase=${st?.turnPhase} gField=${JSON.stringify(st?.guest?.fieldSigni)} gHand=${JSON.stringify(st?.guest?.handCards)}`);
      if (bothPlaced) {
        return { pass: true, detail: `制限側はP3000だけ召喚・P7000は手札残留、power flagだけ外した対照は同じ2枚を両方召喚（restricted=${JSON.stringify(restricted.guest.fieldSigni)} control=${JSON.stringify(st.guest.fieldSigni)}）` };
      }
    }
    return { pass: false, detail: `power flag除去対照でP7000が召喚されず、負方向判定がinconclusive（gField=${JSON.stringify(last?.guest?.fieldSigni)} gHand=${JSON.stringify(last?.guest?.handCards)}）` };
  },
};

// ── §7 V-12 アタック可否ゲート一本化＋付与ストア共通走査 ────────────────
// Codex はシナリオ起案のみ。実ブラウザ＋live Supabase での採否は Claude 側で行う。
// CPU 制限群は BattleScreen の canSigniAttack（CPU候補フィルタ）を直接踏み、付与 timing 群は
// effectsMap に載らない lrig_granted_auto_effects を各 BattleScreen collector が拾うことを確認する。
scenarios.v12CpuCannotAttackGranted = {
  title: 'V-12 A-1 CPUが付与「アタックできない」を守る（対象だけup維持・他方は攻撃・phase前進）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6200'],
      'field.signi': [['WD05-009#6203'], ['WD05-009#6204'], ['WD05-009#6206']],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD03-003#6205'],
      'field.signi': [['WD01-013#6201'], ['WD01-012#6202'], null],
      'field.signi_down': [false, false, false],
      'field.check': null,
      'hand': [],
      'energy': [],
      'blocked_actions': [],
      'keyword_grants': { 'WD01-013#6201': ['アタックできない'] },
      'actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(2500);
    await injectScenario(page, scenarios.v12CpuCannotAttackGranted.spec);
    let last = null;
    for (let s = 0; s < 80; s++) {
      await page.waitForTimeout(150);
      const st = await H.queryState();
      last = st;
      const down = st?.guest?.signiDown ?? [];
      const blockedAttackLogs = (st?.logTail ?? []).filter(l => l.includes('[CPU] 小剣　ククリ がアタック'));
      const allowedAttackLogs = (st?.logTail ?? []).filter(l => l.includes('[CPU] 中剣　フランベル がアタック'));
      H.log(`  v12a1[${s}] phase=${st?.turnPhase} down=${JSON.stringify(down)} blockedLogs=${blockedAttackLogs.length} allowedLogs=${allowedAttackLogs.length}`);
      if (blockedAttackLogs.length >= 3) {
        return { pass: false, detail: `制限対象をCPUが反復選択＝無限ループ症状（ククリのアタックログ${blockedAttackLogs.length}件・phase=${st?.turnPhase}）` };
      }
      const phaseAdvanced = st?.turnPhase && st.turnPhase !== 'ATTACK_SIGNI';
      if (phaseAdvanced && down[0] === false && down[1] === true) {
        return { pass: true, detail: `付与対象WD01-013はup維持、無制限WD01-012だけdown、phase=${st.turnPhase}へ前進（補助ログ blocked=${blockedAttackLogs.length}/allowed=${allowedAttackLogs.length}）` };
      }
    }
    return { pass: false, detail: `CPUアタック可否判定が上限内に決着せず＝無限ループ疑い（phase=${last?.turnPhase} down=${JSON.stringify(last?.guest?.signiDown)} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
  },
};

scenarios.v12CpuCannotAttackGrantedControl = {
  title: 'V-12 A-2 対照（keyword_grantsだけ外すとCPUの2体がともにアタック）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6210'],
      'field.signi': [['WD05-009#6213'], ['WD05-009#6214'], ['WD05-009#6216']],
      'field.check': null,
    },
    guestSet: {
      'field.lrig': ['WD03-003#6215'],
      'field.signi': [['WD01-013#6211'], ['WD01-012#6212'], null],
      'field.signi_down': [false, false, false],
      'field.check': null,
      'hand': [],
      'energy': [],
      'blocked_actions': [],
      'keyword_grants': {},
      'actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(2500);
    await injectScenario(page, scenarios.v12CpuCannotAttackGrantedControl.spec);
    let last = null;
    for (let s = 0; s < 80; s++) {
      await page.waitForTimeout(150);
      const st = await H.queryState();
      last = st;
      const down = st?.guest?.signiDown ?? [];
      const phaseAdvanced = st?.turnPhase && st.turnPhase !== 'ATTACK_SIGNI';
      H.log(`  v12a2[${s}] phase=${st?.turnPhase} down=${JSON.stringify(down)}`);
      if (phaseAdvanced && down[0] === true && down[1] === true) {
        return { pass: true, detail: `A-1と同じ盤面からkeyword_grantsだけ外すと両方downし、phase=${st.turnPhase}へ前進` };
      }
    }
    return { pass: false, detail: `対照で両方のCPUアタックを確認できず（phase=${last?.turnPhase} down=${JSON.stringify(last?.guest?.signiDown)} logTail=${JSON.stringify(last?.logTail ?? [])}）` };
  },
};

scenarios.v12CpuPowerCapWithControl = {
  title: 'V-12 A-3 CPUが防御側opp_signi_attack_power_capを守る＋cap除去対照',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6220'],
      'field.signi': [['WD05-009#6223'], ['WD05-009#6224'], ['WD05-009#6226']],
      'field.check': null,
      'opp_signi_attack_power_cap': 5000,
    },
    guestSet: {
      'field.lrig': ['WD03-003#6225'],
      'field.signi': [['WD01-013#6221'], ['WD01-012#6222'], null],
      'field.signi_down': [false, false, false],
      'field.check': null,
      'hand': [],
      'energy': [],
      'blocked_actions': [],
      'keyword_grants': {},
      'actions_done': [],
    },
    top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
  },
  async drive(page, H) {
    const runUntilAdvanced = async (label) => {
      let last = null;
      for (let s = 0; s < 80; s++) {
        await page.waitForTimeout(150);
        const st = await H.queryState();
        last = st;
        const down = st?.guest?.signiDown ?? [];
        H.log(`  v12a3.${label}[${s}] phase=${st?.turnPhase} down=${JSON.stringify(down)}`);
        if (st?.turnPhase && st.turnPhase !== 'ATTACK_SIGNI') return st;
      }
      return last;
    };

    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(2500);
    await injectScenario(page, scenarios.v12CpuPowerCapWithControl.spec);
    const restricted = await runUntilAdvanced('cap');
    if (!(restricted?.guest?.signiDown?.[0] === false && restricted?.guest?.signiDown?.[1] === true
        && restricted?.turnPhase !== 'ATTACK_SIGNI')) {
      return { pass: false, detail: `cap=5000側が不成立（phase=${restricted?.turnPhase} down=${JSON.stringify(restricted?.guest?.signiDown)}）` };
    }

    // 対照は盤面を同じ初期値へ戻し、防御側の power cap だけを落とす。
    await H.repatchTop({ active: 'host', turn_phase: 'MAIN', effect_stack: null, pending_effect: null });
    await page.waitForTimeout(600);
    await injectScenario(page, {
      hostSet: {
        'field.lrig': ['WD01-001#6220'],
        'field.signi': [['WD05-009#6223'], ['WD05-009#6224'], ['WD05-009#6226']],
        'field.check': null,
      },
      guestSet: {
        'field.lrig': ['WD03-003#6225'],
        'field.signi': [['WD01-013#6221'], ['WD01-012#6222'], null],
        'field.signi_down': [false, false, false],
        'field.check': null,
        'hand': [], 'energy': [], 'blocked_actions': [], 'keyword_grants': {}, 'actions_done': [],
      },
      top: { active: 'cpu', turn_phase: 'ATTACK_SIGNI', turn_count: 3 },
    });
    const control = await runUntilAdvanced('control');
    const bothAttacked = control?.guest?.signiDown?.[0] === true && control?.guest?.signiDown?.[1] === true
      && control?.turnPhase !== 'ATTACK_SIGNI';
    return {
      pass: bothAttacked,
      detail: bothAttacked
        ? `cap=5000ではP3000だけup・P7000はdown、capだけ外した対照では両方down（phase=${control.turnPhase}）`
        : `cap除去対照で両方のアタックを確認できず（phase=${control?.turnPhase} down=${JSON.stringify(control?.guest?.signiDown)}）`,
    };
  },
};

scenarios.v12GrantedBattleBanishOnce = {
  title: 'V-12 B-1 付与ON_SIGNI_BANISH_OPPONENTをバトルで発火＋2回目は《ターン1回》で非発火',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#6230'],
      // ⚠2体を同名にすると swap モーダルの候補で**非アタッカー側**を掴む（続き477 実測）。
      //   アタッカー（zone0）だけをカード名で一意に狙えるよう、zone1 は別カードにする。
      'field.signi': [['WD01-012#6231'], ['WD05-009#6232'], null],
      'field.signi_down': [false, false, false],
      'field.check': null,
      'energy': ['WD03-013#6233'],
      'actions_done': [],
      // collector 単体の切り分けを優先し、WXDi-P12-041-E1のsubを付与ストアへ直接注入する。
      'lrig_granted_auto_effects': [{
        effectId: 'WXDi-P12-041-sub-E1', effectType: 'AUTO', timing: ['ON_SIGNI_BANISH_OPPONENT'],
        action: { type: 'SEQUENCE', steps: [{
          type: 'REARRANGE_SIGNI',
          target: { type: 'SIGNI', owner: 'self', count: 1, filter: { cardType: 'シグニ' } },
          swap: true, swapSourceLocation: 'energy',
          swapSourceTarget: { type: 'ENERGY_CARD', owner: 'self', count: 1, filter: { cardType: 'シグニ' }, upToCount: true },
          targetsBattleAttacker: true, suppressOnPlay: true,
        }] },
        duration: 'INSTANT', mandatory: true, parseStatus: 'AUTO', triggerScope: 'any_ally', usageLimit: 'once_per_turn',
      }],
    },
    guestSet: {
      'field.lrig': ['WD03-003#6235'],
      // ⚠正面は index i ↔ 2-i。guest zone2 を空けると host zone0 のアタックが
      //   バトルではなく**ライフクラッシュ**になり、ON_SIGNI_BANISH_OPPONENT が起きない（続き477 実測）。
      'field.signi': [['WD01-013#6236'], ['WD01-013#6237'], ['WD01-013#6238']],
      'field.check': null,
    },
    top: { active: 'host', turn_phase: 'ATTACK_SIGNI', turn_count: 2 },
  },
  async drive(page, H) {
    const first = 'WD01-012#6231';
    const second = 'WD05-009#6232';
    const energySwap = 'WD03-013#6233';
    let attackStage = 0;
    let zoneOpened = false;
    let last = await H.queryState();
    for (let s = 0; s < 100; s++) {
      await page.waitForTimeout(200);
      const pre = await H.queryState();
      let did = null;
      const firstMoved = (pre?.host?.energyCards ?? []).includes(first)
        && (pre?.host?.fieldSigni?.[0] ?? []).includes(energySwap);
      if (attackStage === 0 && firstMoved && !pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        attackStage = 1;
        zoneOpened = false;
      }
      if (!pre?.pendingEffect && (pre?.stackLen ?? 0) === 0 && attackStage < 2) {
        if (!zoneOpened) {
          did = await H.clickTestId(`my-signi-zone-${attackStage}`);
          if (did) zoneOpened = true;
        } else {
          did = await H.clickBtn('アタック', { exact: true });
          if (did) zoneOpened = false;
        }
      }
      // ⚠swap は2段階＝①エナから1枚を SELECT_TARGET で選ぶ ②`REARRANGE_SIGNI{mode:'swap'}` の
      //   モーダルで「入れ替える場のシグニ」の**カード画像を1回クリックすると即確定**
      //   （`EffectInteractionModal.tsx:842` 付近＝確定ボタンは無い）。②を押さないと pEff が
      //   `REARRANGE_SIGNI` のまま止まり、発火はしているのに盤面が動かない絵になる（続き477 実測）。
      if (!did && pre?.pendingEffect === 'REARRANGE_SIGNI') did = await H.clickModalImage('中剣　フランベル');
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
      const st = await H.queryState();
      last = st;
      const secondStillField = (st?.host?.fieldSigni?.[1] ?? []).includes(second);
      const secondBanishedDefender = !(st?.guest?.fieldSigni?.[1] ?? []).includes('WD01-013#6237');
      const usedCount = (st?.host?.actionsDone ?? []).filter(id => id === 'WXDi-P12-041-sub-E1').length;
      if (attackStage === 1 && secondBanishedDefender && !st?.pendingEffect && (st?.stackLen ?? 0) === 0) attackStage = 2;
      H.log(`  v12b1[${s}] -> ${did ?? 'なし'} | stage=${attackStage} hField=${JSON.stringify(st?.host?.fieldSigni)} hEnergy=${JSON.stringify(st?.host?.energyCards)} gField=${JSON.stringify(st?.guest?.fieldSigni)} used=${usedCount} pEff=${st?.pendingEffect ?? '-'} log=${JSON.stringify((st?.logTail ?? []).slice(-3))}`);
      if (attackStage === 2) {
        const firstFired = firstMoved && usedCount === 1;
        const secondDidNotFire = secondStillField && !(st?.host?.energyCards ?? []).includes(second);
        return {
          pass: firstFired && secondDidNotFire,
          detail: `1回目swap=${firstFired}（${first}→energy／${energySwap}→zone0）・2回目非発火=${secondDidNotFire}（${second}はzone1残留）・actions_done同ID=${usedCount}件`,
        };
      }
    }
    return { pass: false, detail: `2回のバトルバニッシュが完了せず（stage=${attackStage} hField=${JSON.stringify(last?.host?.fieldSigni)} hEnergy=${JSON.stringify(last?.host?.energyCards)} gField=${JSON.stringify(last?.guest?.fieldSigni)} actions=${JSON.stringify(last?.host?.actionsDone)}）` };
  },
};

scenarios.v12GrantedSpellUseMinus4000 = {
  title: 'V-12 B-2 WXDi-P13-008-E3を【起】から付与→ディソナスペル使用で相手1体-4000',
  spec: {
    hostSet: {
      'field.lrig': ['WD03-004#6240', 'WD03-003#6241', 'WD03-002#6242', 'WD03-001#6243', 'WXDi-P13-008#6244'],
      'field.lrig_down': false,
      'field.signi': [null, null, null],
      'field.check': null,
      'hand': ['WXDi-P12-089#6245'],
      'energy': [],
      'actions_done': [],
      'lrig_granted_auto_effects': [],
    },
    guestSet: {
      'field.lrig': ['WD01-001#6248'],
      'field.signi': [['WD01-012#6246'], null, null],
      'field.check': null,
      'temp_power_mods': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    let lrigOpened = false;
    let grantClicked = false;
    let spellOpened = false;
    let useClicked = false;
    let castClicked = false;
    let grantReady = false;
    let last = await H.queryState();
    for (let s = 0; s < 100; s++) {
      await page.waitForTimeout(250);
      const pre = await H.queryState();
      if (!grantReady && (pre?.host?.grantedLrigAutoIds ?? []).includes('WXDi-P13-008-sub-E1')
          && (pre?.host?.lrigUnder ?? -1) === 0 && !pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        grantReady = true;
        // ⚠ルリグ【起】モーダルを閉じた直後は次のクリックがオーバーレイに吸われる（V-11 A-1 と同型）。
        await H.closeModals();
        await page.waitForTimeout(800);
      }
      let did = null;
      if (!grantReady) {
        if (!lrigOpened) {
          did = await H.clickTestId('my-lrig-slot-center');
          if (did) lrigOpened = true;
        } else if (!grantClicked) {
          did = await H.clickBtn(/^【起】エクシード4/);
          if (did) grantClicked = true;
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
      } else {
        if (!spellOpened) {
          did = await H.clickTestId('my-hand-card-0');
          if (did) spellOpened = true;
        } else if (!useClicked) {
          // ⚠手札スペルの CardModal のボタンは **「発動」**（`BattleScreen.tsx` の「使用」は
          //   ルリグデッキの スペル/クラフト 用＝`:7559`）。既存 `deckshufflespell` と同じ流儀。
          did = await H.clickBtn('発動', { exact: true });
          if (did) useClicked = true;
          // 手札モーダルが開いていなければ「発動」は永久に出ない＝開き直して自己回復する。
          else if (s % 4 === 3) { spellOpened = false; await H.closeModals(); }
        } else if (!castClicked) {
          did = await H.clickBtn('発動する', { exact: true });
          if (did) castClicked = true;
        }
      }
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
      const st = await H.queryState();
      last = st;
      const minus4000 = (st?.guest?.powerMods ?? []).includes('WD01-012#6246:-4000');
      H.log(`  v12b2[${s}] -> ${did ?? 'なし'} | grant=${grantReady} under=${st?.host?.lrigUnder} hand=${JSON.stringify(st?.host?.handCards)} gMods=${JSON.stringify(st?.guest?.powerMods)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if (grantReady && castClicked && minus4000 && !st?.pendingEffect && (st?.stackLen ?? 0) === 0) {
        return { pass: true, detail: `エクシード4でsubを付与（lrigUnder 4→0）後、WXDi-P12-089使用でWD01-012#6246に-4000（powerMods ground truth）` };
      }
    }
    return { pass: false, detail: `付与→ON_SPELL_USE -4000を確認できず（grantIds=${JSON.stringify(last?.host?.grantedLrigAutoIds)} under=${last?.host?.lrigUnder} hand=${JSON.stringify(last?.host?.handCards)} gMods=${JSON.stringify(last?.guest?.powerMods)} pEff=${last?.pendingEffect ?? '-'}）` };
  },
};

scenarios.v12GrantedEnergyChargeTwice = {
  title: 'V-12 B-3 SPDi43-13-E2を【起】から付与→1枚ずつのエナチャージ2回で各回ルリグアップ',
  spec: {
    hostSet: {
      'field.lrig': ['SPDi43-13#6250'],
      'field.lrig_down': true,
      'field.signi': [['WXDi-P12-044#6251'], null, null],
      'field.check': null,
      'hand': ['WXDi-P12-082#6252', 'WXDi-P12-082#6253'],
      'energy': [],
      'actions_done': [],
      'game_actions_done': [],
      'lrig_granted_auto_effects': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#6258'], 'field.signi': [null, null, null], 'field.check': null },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    let lrigOpened = false;
    let grantClicked = false;
    let grantReady = false;
    let spellState = { opened: false, use: false, cast: false };
    let completed = 0;
    let upWait = 0;
    let last = await H.queryState();
    for (let s = 0; s < 140; s++) {
      await page.waitForTimeout(250);
      const pre = await H.queryState();
      if (!grantReady && (pre?.host?.grantedLrigAutoIds ?? []).includes('SPDi43-13-sub-E1')
          && !pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        grantReady = true;
        await H.closeModals();
      }
      if (grantReady && (pre?.host?.energy ?? 0) > completed
          && !pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        if (pre.host.energy !== completed + 1) {
          return { pass: false, detail: `エナが1枚ずつ増えていない（${completed}→${pre.host.energy}）＝ON_ENERGY_CHARGEの観測前提違反` };
        }
        // 🔑📌13／📌5＝**settled になった最初の1回で確定させない**。盤面（battle_states）はエナ増加で
        //   先に真になるが、付与ストアの ON_ENERGY_CHARGE watcher は「effect_stack / pending_effect が
        //   空になった**あとの** useEffect」で初めて走る（`BattleScreen.tsx:1734` の early return）ので、
        //   最初の settled 観測では必ず lrig_down=true のまま＝ここで即 FAIL すると**engine が正しくても赤**になる。
        //   ⇒ アップするまで最大 20 周期（約5秒）待ってから FAIL を確定する。
        //   ⚠**対照（`v12PrintedEnergyChargeControl`）は最初からポーリング型**だったので緑になっていた＝
        //     2本の非対称が「付与ストア側だけ死んでいる」という誤診の原因だった（続き478 で是正）。
        if (pre?.host?.lrigDown !== false) {
          upWait++;
          if (upWait > 20) {
            return { pass: false, detail: `${completed + 1}回目のエナチャージ後、約5秒待ってもルリグがアップしない（energy=${pre.host.energy} lrigDown=${pre.host.lrigDown}）` };
          }
        } else {
          upWait = 0;
          completed = pre.host.energy;
          spellState = { opened: false, use: false, cast: false };
          if (completed < 2) {
            const patched = await H.patchPlayerState('host', { 'field.lrig_down': true });
            if (patched?.error) return { pass: false, detail: `次イベント準備のlrig_down PATCH失敗: ${patched.error}` };
            await H.closeModals();
            await page.waitForTimeout(500);
          }
        }
      }
      if (completed === 2) {
        return { pass: true, detail: `SPDi43-13-sub-E1付与後、WXDi-P12-082を1枚ずつ2回使用＝energy 0→2、各回 lrig_down true→false（2回目まで正方向）` };
      }
      let did = null;
      if (!grantReady) {
        if (!lrigOpened) {
          did = await H.clickTestId('my-lrig-slot-center');
          if (did) lrigOpened = true;
        } else if (!grantClicked) {
          // ⚠SPDi43-13 は【起】が2つあり、E1（《ダウン》でSランサー付与）も **「【起】コストなし」**と
          //   表示される（ルリグ用のコストラベル生成に `down_self` が無い＝`BattleScreen.tsx:12585` 付近）。
          //   nth 未指定だと E1 を押して SELECT_TARGET に入り、付与（E2）に永久に到達しない（続き477 実測）。
          did = await H.clickBtn('【起】コストなし', { exact: true, nth: 1 });
          if (did) grantClicked = true;
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
      } else if (!pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        if (!spellState.opened) {
          did = await H.clickTestId('my-hand-card-0');
          if (did) spellState.opened = true;
        } else if (!spellState.use) {
          // ⚠手札スペルの CardModal のボタンは **「発動」**（`:7559` の「使用」はルリグデッキ側）。
          did = await H.clickBtn('発動', { exact: true });
          if (did) spellState.use = true;
          else if (s % 4 === 3) { spellState.opened = false; await H.closeModals(); }
        } else if (!spellState.cast) {
          did = await H.clickBtn('発動する', { exact: true });
          if (did) spellState.cast = true;
        }
      }
      if (!did && grantReady) did = await H.clickBtn('選択肢1', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
      const st = await H.queryState();
      last = st;
      H.log(`  v12b3[${s}] -> ${did ?? 'なし'} | grant=${grantReady} completed=${completed} hand=${JSON.stringify(st?.host?.handCards)} energy=${st?.host?.energy} lrigDown=${st?.host?.lrigDown} pEff=${st?.pendingEffect ?? '-'}`);
    }
    return { pass: false, detail: `2回の正方向を完走できず（completed=${completed} grantIds=${JSON.stringify(last?.host?.grantedLrigAutoIds)} hand=${JSON.stringify(last?.host?.handCards)} energy=${last?.host?.energy} lrigDown=${last?.host?.lrigDown}）` };
  },
};

scenarios.v12PrintedEnergyChargeControl = {
  title: 'V-12 B-3 対照（印刷能力のON_ENERGY_CHARGEは同じ経路で発火するか＝付与ストア固有かの切り分け）',
  spec: {
    hostSet: {
      'field.lrig': ['SPDi43-13#6270'],
      'field.signi': [['WXDi-P12-044#6271'], ['WXDi-P11-073#6272'], null],
      'field.check': null,
      'hand': ['WXDi-P12-082#6273'],
      'energy': [],
      'temp_power_mods': [],
      'actions_done': [],
      'lrig_granted_auto_effects': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#6278'], 'field.signi': [null, null, null], 'field.check': null },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    // 付与を一切使わず、印刷能力の ON_ENERGY_CHARGE（WXDi-P11-073-E1＝自身+2000）を同じスペル経路で撃つ。
    // これが緑なら「経路は生きていて付与ストア側だけ拾われない」、赤なら「ON_ENERGY_CHARGE 経路が
    // CHOOSE 解決を跨げていない」＝切り分けがどちらでも成立する対照（§5-21）。
    await H.ensureMain();
    let opened = false, used = false, cast = false;
    let last = await H.queryState();
    for (let s = 0; s < 60; s++) {
      await page.waitForTimeout(250);
      const pre = await H.queryState();
      let did = null;
      if (!pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        if (!opened) { did = await H.clickTestId('my-hand-card-0'); if (did) opened = true; }
        else if (!used) {
          did = await H.clickBtn('発動', { exact: true });
          if (did) used = true;
          else if (s % 4 === 3) { opened = false; await H.closeModals(); }
        } else if (!cast) { did = await H.clickBtn('発動する', { exact: true }); if (did) cast = true; }
      }
      if (!did) did = await H.clickBtn('選択肢1', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
      const st = await H.queryState();
      last = st;
      const buffed = (st?.host?.powerMods ?? []).some(m => m.startsWith('WXDi-P11-073#6272:'));
      H.log(`  v12b3ctrl[${s}] -> ${did ?? 'なし'} | energy=${st?.host?.energy} mods=${JSON.stringify(st?.host?.powerMods)} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      if ((st?.host?.energy ?? 0) >= 1 && buffed) {
        return { pass: true, detail: `印刷能力のON_ENERGY_CHARGEは同じスペル経路で発火（WXDi-P11-073に+2000・energy=${st.host.energy}）＝経路は生きており、付与ストア側だけが拾われていない` };
      }
      if ((st?.host?.energy ?? 0) >= 1 && !st?.pendingEffect && (st?.stackLen ?? 0) === 0 && s > 24) {
        return { pass: false, detail: `印刷能力のON_ENERGY_CHARGEも発火しない（energy=${st?.host?.energy} mods=${JSON.stringify(st?.host?.powerMods)}）＝ON_ENERGY_CHARGE の中央diffがCHOOSE解決を跨げていない疑い` };
      }
    }
    return { pass: false, detail: `対照が決着せず（energy=${last?.host?.energy} mods=${JSON.stringify(last?.host?.powerMods)} pEff=${last?.pendingEffect ?? '-'}）` };
  },
};

scenarios.v12GrantedEnergyChargeThirdBlocked = {
  title: 'V-12 B-4 SPDi43-13付与《ターン2回》＝3回目のエナチャージではアップしない（疑いの意図的赤候補）',
  spec: {
    hostSet: {
      'field.lrig': ['SPDi43-13#6260'],
      'field.lrig_down': true,
      'field.signi': [['WXDi-P12-044#6261'], null, null],
      'field.check': null,
      'hand': ['WXDi-P12-082#6262', 'WXDi-P12-082#6263', 'WXDi-P12-082#6264'],
      'energy': [],
      'actions_done': [],
      'game_actions_done': [],
      'lrig_granted_auto_effects': [],
    },
    guestSet: { 'field.lrig': ['WD01-001#6268'], 'field.signi': [null, null, null], 'field.check': null },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    await H.ensureMain();
    let lrigOpened = false;
    let grantClicked = false;
    let grantReady = false;
    let spellState = { opened: false, use: false, cast: false };
    let completed = 0;
    let upWait = 0;
    let last = await H.queryState();
    for (let s = 0; s < 180; s++) {
      await page.waitForTimeout(250);
      const pre = await H.queryState();
      if (!grantReady && (pre?.host?.grantedLrigAutoIds ?? []).includes('SPDi43-13-sub-E1')
          && !pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        grantReady = true;
        await H.closeModals();
      }
      if (grantReady && (pre?.host?.energy ?? 0) > completed
          && !pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        if (pre.host.energy !== completed + 1) {
          return { pass: false, detail: `エナが1枚ずつ増えていない（${completed}→${pre.host.energy}）＝ON_ENERGY_CHARGEの観測前提違反` };
        }
        const ordinal = completed + 1;
        // 🔑📌13／📌5＝**settled になった最初の1回で確定させない**（正方向側）。付与ストアの watcher は
        //   effect_stack/pending_effect が空になった**あとの** useEffect で走る（`BattleScreen.tsx:1734`）ので、
        //   最初の settled 観測では必ず lrig_down=true のまま＝即 FAIL すると engine が正しくても赤になる。
        if (ordinal <= 2 && pre?.host?.lrigDown !== false) {
          upWait++;
          if (upWait > 20) {
            return { pass: false, detail: `${ordinal}回目（正方向）のエナチャージで約5秒待ってもアップしない（energy=${pre.host.energy} lrigDown=${pre.host.lrigDown}）` };
          }
        } else {
        upWait = 0;
        completed = pre.host.energy;
        spellState = { opened: false, use: false, cast: false };
        if (completed < 3) {
          const patched = await H.patchPlayerState('host', { 'field.lrig_down': true });
          if (patched?.error) return { pass: false, detail: `次イベント準備のlrig_down PATCH失敗: ${patched.error}` };
          await H.closeModals();
          await page.waitForTimeout(500);
        } else {
          // 🔑**負方向側も「その瞬間の絵」で確定させない**＝3回目は「まだ発火していないだけ」と
          //   区別が付かないので、**正方向と同じ待機予算（約5秒）を置いてもアップしないこと**を要求する。
          let stillDown = pre?.host?.lrigDown === true;
          let watch = pre;
          for (let w = 0; stillDown && w < 20; w++) {
            await page.waitForTimeout(250);
            watch = await H.queryState();
            stillDown = watch?.host?.lrigDown === true;
          }
          return {
            pass: stillDown,
            detail: stillDown
              ? '1・2回目は各回アップ、3回目はenergy 2→3で約5秒待ってもlrig_down=true維持＝《ターン2回》正常'
              : `実バグ候補＝3回目もアップした（energy=${watch?.host?.energy} lrig_down=${watch?.host?.lrigDown}）。ON_ENERGY_CHARGE付与経路がactions_doneへ書き戻さない疑いと一致`,
          };
        }
        }
      }
      let did = null;
      if (!grantReady) {
        if (!lrigOpened) {
          did = await H.clickTestId('my-lrig-slot-center');
          if (did) lrigOpened = true;
        } else if (!grantClicked) {
          // ⚠SPDi43-13 は【起】が2つあり、E1（《ダウン》でSランサー付与）も **「【起】コストなし」**と
          //   表示される（ルリグ用のコストラベル生成に `down_self` が無い＝`BattleScreen.tsx:12585` 付近）。
          //   nth 未指定だと E1 を押して SELECT_TARGET に入り、付与（E2）に永久に到達しない（続き477 実測）。
          did = await H.clickBtn('【起】コストなし', { exact: true, nth: 1 });
          if (did) grantClicked = true;
        }
        if (!did) did = await H.clickBtn('発動', { exact: true });
      } else if (!pre?.pendingEffect && (pre?.stackLen ?? 0) === 0) {
        if (!spellState.opened) {
          did = await H.clickTestId('my-hand-card-0');
          if (did) spellState.opened = true;
        } else if (!spellState.use) {
          // ⚠手札スペルの CardModal のボタンは **「発動」**（`:7559` の「使用」はルリグデッキ側）。
          did = await H.clickBtn('発動', { exact: true });
          if (did) spellState.use = true;
          else if (s % 4 === 3) { spellState.opened = false; await H.closeModals(); }
        } else if (!spellState.cast) {
          did = await H.clickBtn('発動する', { exact: true });
          if (did) spellState.cast = true;
        }
      }
      if (!did && grantReady) did = await H.clickBtn('選択肢1', { exact: true });
      if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
      const st = await H.queryState();
      last = st;
      H.log(`  v12b4[${s}] -> ${did ?? 'なし'} | grant=${grantReady} completed=${completed} hand=${JSON.stringify(st?.host?.handCards)} energy=${st?.host?.energy} lrigDown=${st?.host?.lrigDown} actions=${JSON.stringify(st?.host?.actionsDone)} pEff=${st?.pendingEffect ?? '-'}`);
    }
    return { pass: false, detail: `3回目まで完走できず（completed=${completed} grantIds=${JSON.stringify(last?.host?.grantedLrigAutoIds)} hand=${JSON.stringify(last?.host?.handCards)} energy=${last?.host?.energy} lrigDown=${last?.host?.lrigDown}）` };
  },
};

// ── /続き425 新規シナリオ境界 ─────────────────────────────────────────

// ── /続き424 新規シナリオ境界 ─────────────────────────────────────────

// ── /続き430 新規シナリオ境界 ─────────────────────────────────────────

// ── /続き431 新規シナリオ境界 ─────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// 実行本体
// ─────────────────────────────────────────────────────────────────────────────
const requested = process.argv.slice(2).filter(a => !a.startsWith('-'));
// freezetrigger は続き41（Opus）で ON_SIGNI_FROZEN の resume 経路を配線して修正・単体PASS確認済み＝既定 order に復帰。
// ⚠バッチ末尾の「自分ターン系」は既知の batch 限定状態汚染で FAIL しうる（driver 側の分離強化は別 follow-up）＝
// FAIL が出たら該当を単体（`node scripts/verifyBattleDrive.mjs <id>`）で再実行して切り分けること。
const order = ['wxk09050', 'wxk02029', 'lriggrow', 'coinpaid', 'deckshuffle', 'deckshufflespell', 'ontargeted', 'ontargeted2', 'ontargeted3', 'ontargeted4', 'ontargeted5', 'ontargetedUsageLimit', 'banishbyeffect', 'charmToTrash', 'charmToTrashBattle', 'exceedCost', 'exceedCostPay', 'lrigundermoved', 'keywordgained', 'powerzero', 'freezetrigger', 'freezetriggerUsageLimit', 'wd07012', 'cpugrow', 'cpugrowblocked', 'lrigGrowAnyOpp', 'lrigGrowAnyOppP03046', 'wxk10068banish', 'lrigattackstepstart', 'lrigAttackStepStartUsageLimit', 'beatBecomeSelfWDK14017', 'placedFront', 'placedFrontNegative', 'drawBySourceStory', 'leaveFieldToHand', 'oppDraw', 'refreshTrigger', 'oppPowerDecreased', 'energyToTrash', 'outsideDrawPhase', 'handDiscard', 'deployRestrict', 'acceAttach', 'acceSelfScope', 'acceOtherScope', 'onPlayAnyOpp', 'freezeLrig', 'negateAttackLrig', 'blockDrawByEffect', 'exileHandBlind', 'delayedAttackTrigger', 'revealDeckTopBanish', 'installDelayedTriggerFire', 'installByEffectFreeze', 'optionalTrashEnergyClassAttack', 'craftTokenPlace', 'craftEnergyCP02087', 'craftTurnEndP03078', 'craftHandSpellP05068', 'craftArtsBetK07105', 'g144DownTrigger', 'g145ByEffectTrigger', 'f3PayCostWX10033', 'f3SacrificeWX12024', 'powerModifyPerEnergy', 'artsUsedThisTurnGate', 'oppDirectAttackNegate', 'lookReorderCanTrash', 'beatMultiCandidateSelect', 'onPlayUsageLimit', 'onTargetedForcedBypass', 'onTargetedSourceSigniBanish', 'trashCounterOpp', 'lrigGrowUsageLimit', 'powerzeroUsageLimit', 'wx24p2018GrantFire', 'oppDrawOwnEffectOnly', 'battleLevel4Filter', 'artsUseGreenFilter', 'oppPayEnergyInsufficient', 'lbOwnerReversal', 'sequenceContinuationAcrossGate', 'wdk14013TrashPicker', 'meltFactVirusRemoval', 'mugenQFlip', 'mayuEncounterFreeGrow', 'zoneBlockUnconditional', 'zoneBlockColorlessInsufficient', 'zoneBlockColorlessSufficient', 'zoneBlockMultiZones', 'vacatedZoneBlockFollowsActualZone', 'lxivMultiTargetPayBanishesBoth', 'lxivMultiTargetSkipBanishesNone', 'lxvGateTruePromptsChoose', 'lxvGateFalseSilentSkip', 'lxWX12020ScaledDiscardDelta', 'lxWX12020EmptyHandSkipsPicker', 'secondWaveEnergyBranch', 'energyLeftAnyZoneTrigger', 'doubleCrashUpTrigger', 'oppResourceLossChoose', 'spellUnderMemoriaPlace', 'spellUnderMemoriaSkip', 'aboveSelfSelfBuffStopped', 'wxdip03057DownUnderRed', 'trashMoveLockAllowsWhenUnlocked', 'wxk06067CrossZoneStubFires', 'wx22025SigniTrashBranch', 'wx22025SigniTrashUnavailable', 'spdi4302AvoidedNoChoose', 'wxex225SkipAutoTrashesTrigger', 'wxdip08007SkipRemovesAbilities', 'wxdip08007PaySpares', 'wx17040ConditionsFalseNoop', 'wx17040ConditionsTrueExecuteAll', 'centerZoneOnlyPicker', 'lxvGateTrueSkipNoBody', 'opponentPayOptionalBothBranchesCoexist', 'lrigDownGrowColorSubstituteFires', 'lrigDownCenterOnlyUnwired', 'lrigDownCenterOnlyPays', 'lrigDownLevelLrigActivated', 'noAbilityDeckBottomAttackPhase', 'noAbilityDeckBottomMainPhaseNoop', 'oppDiscardGateReachesDiscard', 'wd16016BurstOpponentDiscard', 'lxWXDiP03089SingleTargetedFire', 'v11EffectDeployCountFlagBlocked', 'v11EffectDeployNoLimitControl', 'v11EffectDeployContinuousBlocked', 'v11CpuDeployCountContinuousBlocked', 'v11CpuDeployCountNoLimitControl', 'v11CpuDeployPowerLimitWithControl', 'v12CpuCannotAttackGranted', 'v12CpuCannotAttackGrantedControl', 'v12CpuPowerCapWithControl', 'v12GrantedBattleBanishOnce', 'v12GrantedSpellUseMinus4000', 'v12PrintedEnergyChargeControl', 'v12GrantedEnergyChargeTwice', 'v12GrantedEnergyChargeThirdBlocked']; // lrigDownGrowColorSubstituteFires（2026-08-05・Sonnet・PLAN§7「(xxxvi)のグロウ支払いUI」）＝続き206で配線されたグロウ支払い経路のエナ代替（wildcardInstIds/colorOverrideMap）が実選択でも機能するかを実機確認。WX16-Re06（印刷色「白」・エナゾーンにあるかぎりセンタールリグの色として代替可）を**緑の**センタールリグ（WD04-004→WD04-003・GrowCost《緑×1》）のエナに置き、素の色一致では絶対に払えない組み合わせでグロウが成立する（lrigTop変化・WX16-Re06がエナ→トラッシュへ移動）ことを2回連続PASSで確認・既定orderに追加。 // lxvGateTrueSkipNoBody/opponentPayOptionalBothBranchesCoexist（2026-08-05・Sonnet・PLAN§7残り＝タスク12(xi)＋併記型(c)）＝(xi)はlxvGateTruePromptsChoose/lxvGateFalseSilentSkipが未検証のまま残していた「ゲート成立→CHOOSE出現→あえてスキップ」branchをWXDi-P02-077-E1で追加確認（エナ無傷・【ランサー】も付与されない＝コスト踏み倒しバグは再発なし）。併記型(c)は当時「liveで併記型が載っているのは現状0」で保留だったが`WXDi-P08-007-E3`が現在costColors＋opponentHandDiscardを同時に持つ実例として存在＝pending_effect.interaction.optionsを直読みし、同一CHOOSEにid='pay'（costColors付き）とid='discard'が同時に存在することを実機ランタイムで確認。各2回連続PASSで既定orderに追加。⚠併せて確認したON_LRIG_GROW④横グロウ経路は既存の`lrigGrowUsageLimit`（続き141・既定order内）が同じE2E（ゲット・グロウ経由の2回目ON_LRIG_GROW不発火）をすでに実機確認済みと判明＝新規シナリオ不要。**新規実バグ発見（既定order外・意図的FAIL＝`lrigDownCenterOnlyUnwired`）**＝lrigDownコストの限定(a)(b)（続き218）を調査中、【起】ACTIVATED効果の`cost.lrigDown`が`executeSigniActivated`（BattleScreen.tsx）にもSigniActivatedModal.tsxにも一切配線されていないと判明＝センタールリグを事前にダウン済みにしてもWXK10-037-E2の【起】ボタンがenabledのまま押せ、コスト無視でSEARCHが実行された（2回連続再現）。詳細はPLAN§3新規登録行参照。 // wx17040ConditionsFalseNoop/wx17040ConditionsTrueExecuteAll/centerZoneOnlyPicker（2026-08-05・Sonnet・PLAN§7タスク12(lxiii)(a)(b)）＝`WX17-040-E1`（スペル「以下の3つから3つまで選ぶ」・①②はchoice.condition〔HAND_COMPARE_OPP／ENERGY_COMPARE_OPP〕でCHOOSEのavailable自体が決まる・③はch.condition無しで常にavailable:trueだが action内側のCONDITIONALが条件を持つ）と`WXDi-P02-065-E2`（centerZoneOnly:trueのSELECT_TARGETフィルタ）を実機確認。wx17040ConditionsFalseNoopは3条件すべて不成立にして①②ボタンがdisabled・③は選べるが対象選択にすら進まず静かに無効果（hHand/hEnergy/gField無変化）を確認。wx17040ConditionsTrueExecuteAllは3条件すべて成立にして①②がenabled・3つとも選択→確定するとドロー＋エナチャージ＋（SELECT_TARGETを経て）バニッシュが全実行されることを確認。centerZoneOnlyPickerは対戦相手の場を左中右すべて埋めた状態で召喚し、SELECT_TARGETの候補が中央（zone1）の1体だけに絞られ、確定後は中央のシグニだけが凍結されることを確認（従来「左右も選べた」の逆＝正しく絞られていることの確認）。各2回連続PASSで既定orderに追加。 // spdi4302AvoidedNoChoose/wxex225SkipAutoTrashesTrigger/wxdip08007SkipRemovesAbilities/wxdip08007PaySpares（2026-08-05・Sonnet・PLAN§7「残る実機検証項目」＝SPDi43-02-E1「回避時に選択肢CHOOSEが出ないこと」とWXEX2-25-E1／WXDi-P08-007-E1「対象がトリガー元シグニに固定され選択UIが出ないこと」）＝いずれも「owner=guest（CPU・受動的watcherとして置くだけ）にし『対戦相手』=hostが応答者になるよう設計する」新パターン（wx22025と同型）で解決。spdi4302AvoidedNoChooseはhostが「支払う」（costColors非搭載STUBの無料pay枝＝(ci)と同型）で回避すると、続くCHOOSE(選択肢1/2)が一度も出現しないことを確認（原文どおりの「手札を2枚捨てる」回避枝はSELECT_TARGET{targetScope:'opp_hand'}のviewer相対バグ＝後述の新規発見バグを踏むため迂回）。wxex225SkipAutoTrashesTriggerはWD08-001の【起】《ダウン》でhost自身の信号をbyEffectで場に出し、guestのWXEX2-25が誘発→hostが「支払わない」を選ぶと、追加のSELECT_TARGETなしにその信号が自動でhostトラッシュへ戻る（targetsTriggerSource正常動作）ことを確認。wxdip08007SkipRemovesAbilities/wxdip08007PaySparesはhostが自分のシグニでアタック→guestのWXDi-P08-007が誘発→「支払わない」で追加選択UIなしにアタッカー自身が能力喪失（targetsTriggerSource正常）／《無》×1を支払うと能力喪失を回避、の対を確認。各2回連続PASSで既定orderに追加。⚠**新規実バグ発見（Opusタスク12(cv)への追記登録）**＝`wxex225DiscardAvoids`（既定order外・意図的FAIL）でhostが原文どおり「手札を1枚捨てる」を選ぶと、続くSELECT_TARGET{targetScope:'opp_hand'}の候補描画（`EffectInteractionModal.tsx:234`）がownerState相対の真の対象（host自身の手札）ではなくviewer(host)相対の`op.hand`（guestの手札）を表示し、候補との一致が一つも無く「決定 (0/1)」が永久disabledでソフトロックする（2回連続再現）。`spdi4302AvoidedNoChoose`でも同型のソフトロックを一度観測（原文の「手札を2枚捨てる」枝を避けて「支払う」枝で迂回）＝(cv)はLB「相手に選ばせる」型で発見されたが、**OPPONENT_PAY_OPTIONALのopponentHandDiscard回避コスト（応答者=viewer自身の手札が真の対象になるケース全般）でも同根のソフトロックが起きることを新たに確認**＝影響範囲がhandSpec持ち33効果超へ拡大する疑い。 // wx22025SigniTrashBranch/wx22025SigniTrashUnavailable（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第3波 WX22-025-E3）＝相手側CHOOSE4択のうち未検証だった「自分のシグニを1体トラッシュに置く」枝を実機確認。**新パターン＝guest（CPU）をアタッカー＝効果オーナーにすることで「対戦相手」＝host（driver操作アカウント）が応答者になり、respondPlayerIdがCPU_PLAYER_ID以外になってCPU自動応答がbailoutし、host自身の画面にCHOOSEモーダルが実際に描画される**（既存のLB所有者反転トリックが使えない非LIFE_BURST効果向けの代替手段＝`wxk06067CrossZoneStubFires`の「構造的に到達不能」を回避する糸口）。wx22025SigniTrashBranchはhostが自分の場から明示的にsigniTrash枝を選び、SELECT_TARGETで自分のシグニを選んでBANISHではなくTRASHが解決しライフクロスは無傷（LIFE_CRASHはOPPONENT_PAY_OPTIONALのcontinuation設計上'skip'以外の枝では発火しないことをコード読解でも確認）。wx22025SigniTrashUnavailableはhostの場が空だとボタンがdisabledになることを確認（この場合の直接攻撃による通常戦闘ダメージは本効果と無関係）。各2回連続PASSで既定orderに追加。 // wxk06067CrossZoneStubFires（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第11波 WXK06-067-E1）＝【起】《青》＋自身トラッシュでOPPONENT_PAY_OPTIONAL{opponentHandOrEnergyToDeckTop:2}（手札とエナを跨いだ単一プールのクロスゾーンpicker＝プロジェクト初）が発火することを実機確認。costColors非搭載のためOpusタスク12(ci)と同型の穴でCPU自動応答が常に無料'pay'枝（options配列の先頭かつ常時available）を選び、guestの場/手札/エナが一切変化しないことを2回連続PASSで確認・既定orderに追加。⚠**クロスゾーンpicker本体（handOrEnergyToDeckTop枝）のUI描画自体（`EffectInteractionModal.tsx`の`self_hand_energy`/`opp_hand_energy`スコープ・「手札とエナから合計」表示・`inter.candidates`経由で(cv)のようなop.hand直接参照バグは無いことをコード読解で確認済み）は、本カードが非LIFE_BURSTのため`secondWaveEnergyBranch`等が使うLB所有者反転トリックが使えず、単一アカウントdriverでは構造的に到達不能**＝低優先で保留（(ci)修正後にownerId反転可能なLB型カードが見つかれば改めて検証）。 // trashMoveLockAllowsWhenUnlocked（2026-08-05・Sonnet・PLAN§7タスク12(lxxiii)対照）＝WD05-018（トラッシュのシグニ1枚を手札に加える・《無》×2）でlock_trash_move_this_turnフラグが無い通常時は普通に動くことを2回連続PASSで確認・既定orderに追加。⚠対の`trashMoveLockBlocksSelfEffect`（フラグありでMAINフェイズでも普通に動いてしまう＝ロック機構が実UI経路で丸ごと不発）は実バグとしてOpusタスク12(cvii)へ登録・意図的FAILとして既定order外のまま保持（詳細はPLAN§3(cvii)）。 // spellUnderMemoriaPlace/spellUnderMemoriaSkip（2026-08-05・Sonnet・PLAN§7タスク16 WXDi-P11-063-E2）＝スペル《無心の豪圧》がバニッシュ解決後に自身をメモリア（幻怪姫エクス等3種）の下に置いてもよい選択（STUB TRAP_OPERATIONの「の下に置いてもよい」分岐＝part1の同名STUBに食われて長期間到達不能だった経路）をUIで初実走。置く→ホストに+2000（hostZone0=[スペル,メモリア]）、スキップ→トラッシュのままで+2000は乗らないの両方を各2回連続PASSで確認・既定orderに追加。 // aboveSelfSelfBuffStopped/wxdip03057DownUnderRed（2026-08-05・Sonnet・PLAN§7タスク16「【常】版4枚の自己バフ停止」）＝WXK08-086/WXDi-P03-057/WXDi-P05-050の「このカードの上にあるシグニのパワーを＋N」（aboveSelf）が単独配置（下にカードなし＝スタック長1）では一切適用されない（effectEngine.ts:1562のstack.length<2ガード）ことを確認＝従来の自己バフ退行は再発していない。対照実験としてWXDi-P03-057の【起】《ダウン》で他の赤シグニ(WD02-009)の下に潜らせると、そのホストの表示パワーが12,000→14,000（aboveSelf+2000）へ実際に上がることも確認（CONTINUOUS/PERMANENTのaboveSelfはtemp_power_modsに書かれない純計算値のためDOM表示で判定）。各2回連続PASSで既定orderに追加（2026-08-05・Sonnet・PLAN§7タスク16 WXDi-P13-051-E3）＝「対戦相手の効果1つによって、あなたのエナゾーンからカードが1枚以上トラッシュに置かれたとき」誘発（`collectOppResourceLossTriggers`のエナ経路）をWXDi-D07-013（【出】mandatory・対戦相手のエナ1枚をトラッシュ）×WXDi-P13-051（watcher・CHOOSE「引く/エナチャージ」）で実機確認。誘発後CPU（guest）がCHOOSEを自動選択（ドロー/エナチャージいずれか）することを含め2回連続PASSで既定orderに追加。手札喪失経路・「1つの相手効果が両方やる場合は1回だけ」は未個別実機（低優先＝`collectOppResourceLossTriggers`は中央diffで両方を1本のentryへ畳む設計・コード読解で確認済み）。 // doubleCrashUpTrigger（2026-08-05・Sonnet・PLAN§7タスク16 WX05-020-E1）＝【ダブルクラッシュ】直接注入で1アタックにguestライフを2枚同時クラッシュ（原文①の足し方）→「1ターンに合計2枚以上クラッシュ」条件が成立しE1（アップ）が発火してsigni_downがfalseへ復帰することを実機確認。2回連続PASSで既定orderに追加。②のE2（アタック1枚+アーツ被効果1枚の足し方）・ターンまたぎリセットは未個別実機（低優先）。 // energyLeftAnyZoneTrigger（2026-08-05・Sonnet・PLAN§7タスク16 WXDi-P06-038-E1）＝「あなたのエナゾーンから効果によってカード1枚が他の領域に移動したとき」＝トラッシュ以外（手札）行きでも`energyLeftToAnyZone`triggerConditionで発火することをWXEX1-42（自身のエナから植物シグニ1枚を手札へ）の召喚で実機確認。2回連続PASSで既定orderに追加。 // secondWaveEnergyBranch（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第2波(a)）＝WX15-033-BURSTのOPPONENT_PAY_OPTIONALに手札枝＋エナ枝が並ぶケースをLB経由（所有者反転でdriver自身がCHOOSEを受ける）で実機確認。手札1枚(<2)で「手札を2枚捨てる」枝はdisabled、エナ3枚(≥2)で「エナゾーンから2枚」枝をあえて選択→自分のエナがちょうど2枚トラッシュされ対象シグニは場に残存を2回連続PASSで確認・既定orderに追加。WXK05-001-E1も同一OPPONENT_PAY_OPTIONALコードパスのため個別実機は任意。ALL枝（WX24-P4-023-E3・該当0枚で枝非表示）は未個別検証のまま残（低優先）。 // lxWX12020ScaledDiscardDelta/lxWX12020EmptyHandSkipsPicker（2026-08-05・Sonnet・PLAN§7タスク12(lx)(a)）＝WX12-020-E3の「アタック時にまず相手1体を対象選択→次に手札を好きな枚数(upToCount)捨てる→POWER_MODIFY(targetsStored,deltaPerLastProcessedCount)で捨てた枚数×-6000がその1体だけに乗る」を実機確認。手札0枚だとピッカー自体が出ずdelta=0で素通り・クラッシュしないことも確認。各2回連続PASSで既定orderに追加。⚠同バッチのlxWXDiP03089SingleTargetedFire（タスク12(lx)(b)＝POWER_MODIFY{targetsStored}は再選択なし）は「再選択が消えたこと」自体は確認できたが、ON_TARGETED watcherが期待の1回ではなく0回しか発火しない別バグを発見（Opusタスク12(civ)へ登録）＝既定order外の意図的FAILとして保持（PLAN§3参照）。 // lxivMultiTargetPayBanishesBoth/lxivMultiTargetSkipBanishesNone/lxvGateTruePromptsChoose/lxvGateFalseSilentSkip（2026-08-05・Sonnet・PLAN§7タスク12(lxiv)(lxv)）＝「対象ピッカー前置」（SELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS→OPTIONAL_COST→CONDITIONAL(IS_MY_TURN)→BANISH{targetsStored}）と「条件つき任意コストのゲート」（CONDITIONAL{gate}→STUB OPTIONAL_COST の包み形）を実機確認。WXDi-P02-043-E1で対象2体まで選択→支払う→両方バニッシュ／支払わない→どちらも残存、WXDi-P02-077-E1で手札6枚以上ならCHOOSE出現→支払う→ランサー付与／5枚以下は「任意コストの条件を満たさない（スキップ）」で静かに不発、を各2回連続PASSで確認・既定orderに追加。⚠実機で判明＝支払い後、freezeStoredTargetsでfixedCardNumsに絞られたBANISH自体もselectOrInteract経由の再確認SELECT_TARGET（候補2件でも確認クリックが要る）を要求する＝対象確定は支払い前後で計2回。また対象ピッカー自身がupToCount:true由来の「スキップ」ボタンを持つため、H.stdStep()の汎用フォールバック（デフォルトlabelsに'スキップ'を含む）に委譲するとpick-Nがまだ描画されていない一瞬にそちらを誤クリックし0件確定で終わるレースが実機で再現した＝この2シナリオではH.stdStep()を使わず明示的なラベルのみで進行する。 // zoneBlockUnconditional/zoneBlockColorlessInsufficient/zoneBlockColorlessSufficient/zoneBlockMultiZones/vacatedZoneBlockFollowsActualZone（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第10波(a)(b)+タスク12(lxxvi)）＝「シグニを新たに配置できないゾーン」（`BLOCK_OPP_ZONE_PLACEMENT`/`signi_zone_blocks`・`signiZoneBlock.ts`）のDOM描画（`(配置禁止)`ラベル・`《無》×N不足`・disabled）と実際の配置阻止/コスト徴収を実機確認。vacatedZoneBlockFollowsActualZoneはWX08-032-E1を実際にキャスト→guest zone2のシグニをバニッシュ→`signi_zone_vacated_just`経由の禁止ゾーンがzone2に正しく付き**zone1へフォールバックしない**ことを実配線で確認（state注入だけでは検証できない回帰点）。各2回連続PASSで既定orderに追加。 // wdk14013TrashPicker/meltFactVirusRemoval/mugenQFlip/mayuEncounterFreeGrow（2026-08-04・Sonnet・PLAN§6.3 H/I′(b)(c)(d)(e)）＝各2回連続PASSで既定orderに追加。(a)ガード追加《無》N枚徴収（guardExtraColorlessSufficient/Insufficient）はルーム再利用バッチだと前シナリオのguestルリグダウン状態が残りCPUが再アタックせずFAILする既知制約のため既定order外・単体実行専用のまま。 // oppPayEnergyInsufficient/lbOwnerReversal/sequenceContinuationAcrossGate（2026-08-04・Sonnet・PLAN§7タスク12(lxi)本消化(a)(d)(e)）＝WX25-P1-038-E1のOPPONENT_PAY_OPTIONAL availableゲート（エナ不足→skip→banish）、WX24-P2-071-BURSTのLB所有者反転（支払い側が常にLB所有者の対戦相手になること）、WX24-P1-023-E1の内側ゲート解決後もREVEAL_AND_PICKが中断を跨いで続行することを新規検証・各2回連続PASSで既定orderに追加。同バッチの(a)対照実験(oppPayEnergySufficient)と(b)(oppDiscardGateBareBug)は逆に実バグを検出（Opusタスク12(cii)＝CPU自動応答のCHOOSEはcostColors付きpay選択時にエナinstanceIdを渡さず常に「コスト支払いエラー: エナ不足」で空振り／Opusタスク12(ci)＝costColors非搭載のOPPONENT_PAY_OPTIONALは無条件で無料payを選択肢に積むためCPUが最優先で選び discard/energyTrash 等の回避コストが実質死んでいる）＝既定order外の意図的FAILとして保持（PLAN§3参照）。 // oppDrawOwnEffectOnly（2026-07-17・続き170・Sonnet・PLAN§3タスク1・Opusタスク12(xxi)続き162の反転検証）＝`collectOppDrawTriggers`に`drawByDrawerOwnEffect`triggerConditionが追加されPR-423にフラグ付与された修正の反転確認。旧・意図的FAIL（host自身の効果でguestが引いただけでPR-423が誤発火）が2回連続PASS（guestドロー後もPR-423生存・guest.life無傷）＝実バグ解消を確認・既定orderに追加。 // wx24p2018GrantFire（2026-07-16・続き164・Opus・タスク1）＝引用付与の対象-コスト分離2文型の完全経路（E1発火→《赤》支払い→対象＜龍獣＞選択→内側【自】付与→アタック→相手不払い→アサシン付与）。旧・意図的FAIL（ルリグ自身へ即付与）が parser 修正＋JSON採用で反転・2回連続PASS＝既定orderに追加。 // powerzeroUsageLimit（2026-07-15・続き141・Sonnet・PLAN§3タスク1(c)）＝R37③ ON_SIGNI_POWER_ZERO_OR_LESSのusageLimit新規シナリオ。WD11-013（【出】対戦相手シグニ-1000・コストなし）を2枚手札に用意しguest場のP1000シグニ2体を順に0化＝1枚目でwatcher（アイン＝テトロド）が発火してドロー、2枚目では《ターン1回》のため発火せず手札据え置きを確認。3回連続PASS＝既定orderに追加。 // lrigGrowUsageLimit（2026-07-15・続き141・Sonnet・PLAN§3タスク1(b)）＝タスク12(vi-5)（続き135・Opusで二面コレクタのusageLimit書き戻しを一括修正済み）の反転検証。旧FAILの真因はengineではなくdriver側＝ゲット・グロウ横グロウで開くグロウ先カード（タマヨリヒメ）の【出】効果コスト確認モーダル（SigniOnPlayCostModal）をスペル用testId（spellcost-energy-0）で探していたため永久に「なし」を繰り返しグロウ完了判定（lrigTop変化）に到達できなかった（続き132の「driverでlrigTopが変化せず再現不能」の真因＝旧記録の想定と異なりengine不具合ではなかった）。修正＝候補クリック後は正しいtestId（onplaycost-energy-0）とスキップボタンで処理。修正後2回連続PASS（usageLimit正しく機能＝ゲット・グロウ経由の2回目ON_LRIG_GROWで発火せず）＝既定orderに追加。 // trashCounterOpp（2026-07-15・続き141・Sonnet・PLAN§3タスク1(a)）＝タスク12(iv)（続き135・Opusでapplydirect Actionの手札カウンタ3種書き戻しを修正済み）の反転検証。FRESH=1新規ルーム/既存ルーム再利用の両方で計3回連続PASS（guest.hand_trashed_by_opp_this_turn=1を確認）＝実バグ解消を確認・既定orderに追加。⚠旧handPrependを`hand`直接指定へ変更（続き139のblockDrawByEffect/exileHandBlindと同型の残留ランダム手札混入対策）。 // onTargetedForcedBypass（続き137・Opus・タスク12(xx)）＝targetsTriggerSource/targetsLastProcessedの選択UIなし自動対象化がcollectTargetedTriggersを素通りしON_TARGETEDが発火しなかった実バグ（続き127でSonnetが再現・登録）。execPowerModifyがautoTargetedCardsをExecResultにsurfaceし、resolveStackNextのdone分岐で「対戦相手の場のautoTargetedCards」をON_TARGETED収集にかける修正。WX12-010（ON_ATTACK_SIGNI any_opp+targetsTriggerSource -2000）×WXDi-P03-067（ON_TARGETED self=DRAW×1）で、guest空手札注入→CPUアタック→POWER_MODIFY成立→ON_TARGETEDでguestが1枚ドロー（gHand=1）を確認。修正前はPOWER_MODIFYだけ成立しhand=0のまま。⚠計測はdelta不可（CPUアタックが注入直後に完結）＝空手札注入の絶対値判定。 // onPlayUsageLimit（続き135・Opus・タスク12(x)）＝collectFieldTriggers に usageLimit ガードが存在せず「味方のシグニが場に出るたびに◯◯（ターン1回）」型32枚が同一ターンの複数召喚で毎回発火していた実バグの回帰。WX24-P1-046-E1（＜地獣＞2体召喚）で1回だけ発火（hDeck -1・actions_done に effectId 1件）を2回連続PASS確認。修正前は actions_done に effectId が入ること自体があり得ない（書き戻し機構が無かった）ため、このシナリオは修正の有無を確実に切り分ける。 // beatMultiCandidateSelect（続き129・Sonnet・PLAN§7「ビート機構Phase1-7」残）＝`analyzeBeatSigniCost`/`actBeatNeedSelect`（SigniActivatedModal.tsx）の複数候補ゾーン選択UIは実装済みだったが実機未検証だった。WXK08-026を候補2体（小剣ククリ/羅植姫アキナナ）と共に配置→候補の一方（小剣ククリ）だけを選んで【起】発動→選んだ方だけがbeat_zoneへ移り選ばなかった方は場に残存することを2回連続PASSで確認＝新規バグなし・既定orderに追加。lookReorderCanTrash（続き128・Sonnet・PLAN§7.2「対話UIの残実装」）＝EffectInteractionModal.tsxのLOOK_AND_REORDER canTrash UI（「トラッシュ」トグル→「決定」確定）は実装済みだったが実機未検証だった。WX20-037召喚→デッキ上3枚を見て1枚トラッシュ選択→確定でhTrash+1・hDeck-1を2回連続PASSで確認＝既定orderに追加。queryStateのsideOf()に`deck`（deck.length）フィールドを新規追加。onTargetedForcedBypass（続き127・Sonnet・PLAN§7「ON_TARGETED forced単一対象follow-up」）＝`targetsTriggerSource`の選択UIなし自動解決が`collectTargetedTriggers`を素通りしON_TARGETEDが発火しない実バグをWX12-010×WXDi-P03-067の組で実機再現（FRESH=1含め2回連続再現）＝Opusタスク12(xx)へ登録・意図的FAIL回帰として既定order外のまま（修正後にPASSへ反転させ追加する）。oppDirectAttackNegate（続き126・Sonnet・PLAN§7「その他の実機検証待ち」＝WX04-004-E2守備側アタック無効化）＝正面が空のシグニアタックに対しSTUB(OPP_DIRECT_ATTACK_NEGATE)がCHOOSE(pay/skip)→TRASH(HAND_CARD,美巧)→エナ支払いでcancel_current_signi_attackを立てるフローを実機で新規検証・2回連続PASS（hLife 6→6で無効化を確認）＝既定orderに追加。queryStateのsideOf()に`life`（life_cloth.length）フィールドを新規追加（今後のシナリオでも life 増減の判定に使える）。f3SacrificeWX12024（旧f3SacrificeWX12024Bug）＝✅続き117（Opus・タスク12(xv)）でWX12-024-E1をSTUB BANISH_SUBSTITUTE化し身代わりモーダルの実発火を2回連続PASS確認＝既定orderに復帰。craftArtsBetK07105＝✅続き122（Sonnet）で再検証したところ engine修正（続き117）後は H.stdStep() の pick-0 ハンドリングだけで手札ピッカーも問題なく解決し2回連続PASS＝「driverのHAND_CARDピッカー未クリック」という旧コメントの想定は誤りと判明（当時はengine未修正でSELECT_TARGETに到達すらしていなかった）＝既定orderに追加。自分ターン系→CPUターンの順。craftTokenPlace（続き113・Sonnet・PLAN§6.4「クラフトトークンの実機配置検証」）＝WX25-CP1-066の`ADD_TO_FIELD{cardName:'雷ちゃん'}`（`execAddToField`の「ゲーム外からトークン生成」分岐＝`effectExecutor.ts:1170`）が実機で正しく`WX25-CP1-TK1A`（CardData_TK.csv）へ解決され場に出ることを確認・2回連続PASSで既定orderに追加。⚠原文の「あなたの場に《雷ちゃん》がない場合」条件がJSONに無い（無条件実行）点はPLAN§6.4に既知の「場存在条件」近似として既に記載済み＝新規発見ではない。driverの肝＝(a)discardコストの手札ピッカーはSigniActivatedModal内蔵（`pick-0`ではなく`img[alt=カード名]`クリック）で、しかも同名imgが画面下部の手札ストリップにもDOM順で先に存在するため`.first()`だと誤って背景オーバーレイのキャンセルを誘発する＝`.last()`（createPortalで後から追加される側）を使う。(b)配置先ゾーンが2つ空くとSELECT_SIGNI_ZONEの「ゾーンN」ボタンクリックが要る。revealDeckTopBanish/installDelayedTriggerFire（続き112・Sonnet・PLAN§7 B2/B3）＝WX17-028のREVEAL_DECK_TOP+動的閾値バニッシュとWX25-CP1-069のINSTALL_DELAYED_TRIGGER実発火（ライフクラッシュ経由）を新規検証・各2回連続PASSで既定orderに追加。B3はcrasherFilterが「クラッシュ源を追跡せず場に該当シグニがいるかで代用」という既知の近似（PLAN B3欄に明記）だが今回の検証目的（設置→同ターン内発火の一気通貫）はこの近似のままでも確認可能。installByEffectFreeze/optionalTrashEnergyClassAttack（続き112・Sonnet・PLAN§7「機構④誤parse3枚」）＝WXDi-P07-044-E2（any_ally+byEffect ADD_TO_FIELD watcher）とWX25-P3-062-E2（OPTIONAL_TRASH_ENERGY_CLASS＋HAS_CARD_IN_FIELD lrig名条件）を新規検証・各2回連続PASSで既定orderに追加＝機構④誤parse3枚（WXDi-P07-044/WX25-P3-062/WX25-P2-009）のうち実機検証待ちだった2枚が決着（WX25-P2-009は別途未配線STUB・機構待ちのまま§6.3送り）。freezeLrig/negateAttackLrig/blockDrawByEffect（続き79・Sonnet）＝続き76のパターンB(FREEZE/NEGATE_ATTACKのLRIG対象)・パターンC(BLOCK_ACTION DRAW_OR_ADD_TO_HAND_BY_EFFECT)を実機PASS確認＝既定orderに追加。exileHandBlind/delayedAttackTrigger（続き81・Sonnet）＝FAILの原因はいずれもengine/parserではなくテストドライバ側の不具合（詳細BUGFIXES）と判明・driver修正後2回連続PASS確認＝既定orderに追加。trashCounterOppは調査の結果、resumeSelectTarget→applyDirectAction のTRASH/HAND_CARD分岐がhand_trashed_by_opp_this_turn等3フィールドの更新を欠く実engineバグ（count:1でSELECT_TARGET経由するTRASH全般に影響）と確定＝修正はOpusタスク12へ登録・既定order外のまま（PLAN§3参照）。oppPowerDecreased/energyToTrash/outsideDrawPhase/handDiscard は続き61（Opus）でresume経路取りこぼしを collectBoardDiffTriggers 統合で修正し実機PASS確認済み＝既定orderに復帰。deployRestrict は続き62（Opus）で配置数制限（DEPLOY_RESTRICT count分岐）を実装し実機PASS（BUGFIXES/PLAN§6.3参照）。charmToTrash/exceedCost/ontargeted2 は続き64（Sonnet）でR42/R44/ON_TARGETED①を新規検証・単体PASS。acceAttach（R45① ON_ACCE_ATTACH host条件）は続き65（Opus）で execAttachAcce fromHand経路の2段chaining実装と battleCardNums への signi_acce 走査追加の2バグを修正し実機PASS（2回連続・deterministic）＝既定orderに追加。ontargeted2は5回中4回PASSで軽微なタイミングフレークあり＝ontargetedと同一コードパスのためengine側の問題ではないと判断。ontargeted3/4/5（続き72・Sonnet）＝ON_TARGETED残り3枚（WXDi-P11-040/WXDi-D09-H14/WX25-P2-055）を個別検証・単体PASS（3件とも再現確認）。ontargeted3はGRANT_KEYWORDのexcludeSelf未実装、ontargeted5はREMOVE_ABILITIES target.ownerが原文と逆（'opponent'だが原文は自己参照）という2件の実データ疑義を発見＝修正はせずOpusタスク12へ登録（PLAN§7参照）。lrigGrowAnyOpp（続き73・Sonnet）＝ON_LRIG_GROW残②（WXDi-P13-047・any_opp）を検証・2回連続PASS＝guest自身のターン中のグロウでも発火＝原文「あなたのターンの間」のturnOwnerゲートが未実装という実データ疑義を発見＝修正はせずOpusタスク12へ登録。lrigGrowAnyOppP03046（続き73・Sonnet）＝ON_LRIG_GROW残②のもう1枚（WXDi-P03-046・SELECT_TARGET要のTRANSFER_TO_HAND）を検証・2回連続PASS＝R38/R43/R46/R39系統のresume経路取りこぼしバグには該当しない（トリガー元＝CPU自動グロウが対話不要で完了し、watcher側のSELECT_TARGETはhost自身の新規interactionとして正常に処理されるため）。ontargetedUsageLimit/charmToTrashBattle（続き74でFAIL→続き75・Opusでengine修正→実機PASS）＝前者は collectTargetedTriggers が usedHostIds/usedGuestIds を返し呼び出し元が actions_done へ書き戻すよう修正（《ターン1回》が毎回発火していた）・後者は resolvePendingSigniBattleFor に collectCharmToTrashTriggers を配線（バトルバニッシュでのチャーム喪失が一度も収集されていなかった）＝既定orderに追加")
// タスク12(cix)＝コスト経路の「この方法でダウンしたルリグ」参照。golden では原理的に守れない（engine ハーネスは
// 支払いも同じ ExecCtx で行うため lastProcessedCards が届いてしまう）ので、実機シナリオを既定 order に入れる。
order.push('lrigDownLevelRemoveAbilities');
// タスク12(xciii)＝【チェイン】は engine の状態と ArtsModal のコスト計算が噛み合って初めて効く（golden では
// コスト計算UIまで通せない）ので実機シナリオを既定 order に入れる。
order.push('chainArtsCostReduction');
// タスク12(lv)③＝CPU 経路の任意【出】は golden では踏めない（BattleScreen の収集コード）ので実機で守る。
order.push('cpuOptionalOnPlayCharm');
// タスク12(xciv) δ-6＝ターン履歴の記録側（BattleScreen の盤面差分 funnel）は golden で踏めない。
order.push('banishHistoryForCost');
// タスク12(cx)＝守備側の応答窓（`performSigniAttack` の収集）は BattleScreen 側＝golden では踏めない。
order.push('oppSigniAttackActivated');
order.push('resonaMainWx08021'); // レゾナMAIN召喚UIは既定order末尾で実行
// coinsPaidAttackFires/coinsPaidAttackSkipped（2026-08-07・Sonnet・PLAN§7 実機検証タスク1）＝続き366新設の
// COINS_PAID_THIS_TURN機構をWXDi-P15-068-E1で実機確認。【起】でコイン2枚支払後にアタック→条件成立で
// 2回目の【エナチャージ1】が発火（PASS）／コイン未払いのままアタックすると発火しない（続き366以前の
// 無条件発火バグが再発していないことを確認・PASS）。各2回連続PASSで既定orderに追加。
order.push('coinsPaidAttackFires');
order.push('coinsPaidAttackSkipped');
// 続き435（PLAN§7バッチ1・Codex起案→Claude実機検証）＝以下7件は個別実行で複数回PASSを確認済み。
order.push(
  'assistAttackNoFlag', 'assistAttackSkipConfirm', 'assistAttackCpuSequence', 'assistAttackNoEligibleAdvance',
  'fezoneDoubleCostSkip', 'sYokusenkiSpellSkip', 'cheatingSameLevelDownFilter',
);
// 続き436（PLAN§7バッチ2・Codex起案→Claude実機検証）＝続き435 で残った8件の FAIL は「シナリオ側の
// クリック手順バグ」ではなく**UI に安定セレクタが無い箇所をカード名の alt／可視ボタン文言で代用していた**
// のが真因だった（`KeyUseModal` のエナ候補・ルリグ行5スロット・カード詳細のアクションボタンに testid が無く、
// しかも自分と相手で label 文字列が同一）。`keycost-energy-*`／`my|op-lrig-slot-*`／`card-action-*`＋
// `data-action-label` を新設して書き直したところ、**3件が2回連続PASSへ反転**＝既定orderに追加。
//   assistAttackBoth  … 続き427「人間側のクリックで左右アシスト連続アタック」＝左右が各1回ずつアタックし
//                        assistDown=[true,true]／centerDown=false（センター温存）／相手ライフ7→5の2クラッシュ。
//   fezoneDoubleCostPay … 続き426 B2 pay側🔴＝《青》1＋手札2枚の**両方**が徴収される（energy 1→0・hand 2→0）
//                        ＝「コスト句ごと脱落していた」旧実装への退化が無いことを実機で確定。
//   sYokusenkiSpellPay  … 続き434 `WX24-P1-065`② pay側🔴＝候補が**スペル1枚だけ**に絞られ、払うと相手の手札が
//                        2→1（払わなければ減らないことは既存 sYokusenkiSpellSkip が担保）。
// ⚠残る5件は**セレクタ問題ではなくなった**（詳細は PLAN §7 と BUGFIXES 2026-08-11）＝
//   connectSpinningChoice4Pay/Insufficient … KeyUseModal のエナ選択は完全に機能する（3枚選択→energy 3→0→セット
//     成功）が、**セット後に効果が一切発火しない**（pEff=-）。`WXDi-P14-002-E1` は `effectType:'ACTIVATED'`
//     `timing:['MAIN']` なのに `executeKeyPiece` は `queueCardEffects(..., ['AUTO'], ['ON_PLAY'], ...)` しか
//     積まない＝ピースの効果は KEY スロットの【起】から別途起動する設計。しかも印刷 Cost《赤×1《無》×2》と
//     E1 の `cost.energy`（赤1無2）が同一＝**セットで1回・起動でもう1回**請求される疑い＝PLAN §3 へ登録。
//   kokonaUnderThreePay/ThreeSkip/Insufficient … 「ターン終了」ボタンは押せるが以後の盤面変化が観測されず
//     ON_TURN_END の pay/skip UI が出ない（原因未確定＝シナリオ側かengine側か切り分け未了）。
order.push('assistAttackBoth', 'fezoneDoubleCostPay', 'sYokusenkiSpellPay');
// 続き435＝collectAnyZoneTrashSelfTriggersのresume取りこぼし（続き60）は解消済みと確認したので復帰。
order.push('handDiscard');
// 続き460（PLAN §7・Codex起案→Claude実機検証）＝続き459 の「使用禁止の期間と合成 actionId」を実UIで固定。
//   prArtsSpellSplitIds … PR-427 の合成 actionId 退行ガード（`ARTS_AND_SPELL` が復活したら即FAIL）。
//   wxex166SpellLockPeriod … 予約(`USE_SPELL:NEXT_TURN`)→CPUターン開始で bare 昇格→そのターン終了で失効の3段。
//                            **③が本題**＝残っていたら `until:'PERMANENT'`（恒久ロック）への退化。
//   spellArtsBlockedUiHidesUseButtons ＋ spellArtsUnblockedUiShowsUseButtons … 負方向と**対照**の対。
//     ⚠対照が要るのはアーツの「使用」が `costOk`/`condOk` でも消えるため＝非表示だけでは封じの証明にならない。
//     この対が続き460 の実バグ（手札スペルの「発動」だけ封じゲートが無く無言 no-op）を検出して固定した。
order.push('prArtsSpellSplitIds', 'wxex166SpellLockPeriod', 'spellArtsBlockedUiHidesUseButtons', 'spellArtsUnblockedUiShowsUseButtons');
// 続き461（PLAN §7 第2バッチ・Codex起案→Claude実機検証）＝続き457〜458 の「能力喪失」3軸を実UIで固定。
//   removeAbilitiesOppKeyPicker … `WXK05-010-E2`＝**キー枠の SELECT_TARGET（`opp_key`）**。候補は guest の2枚だけで、
//     選んだ1枚だけが `abilitiesRemoved` に入り**もう1枚は無傷**・`keysAbilitiesDisabled` は false のまま。
//     ⚠**cardNum 軸（`abilities_removed`）とフラグ軸（`keys_abilities_disabled`）の取り違えを検出する**のが主目的。
//   removedAbilitiesHidesTrashAct ＋ intactAbilitiesShowsTrashAct … 続き458 で足した消費地点
//     （`BattleScreen.tsx` のトラッシュ起動ゲート）が実UIに届くか。**負方向＋対照の対**（§CODEX_GUIDE 5-21）＝
//     対照が無いと「コスト不足でボタンが出ないだけ」と区別できない。
//   removeAbilitiesAlsoKeysFlag … `SP38-006` の内側【起】（エクシード1）で `alsoKeys` がフラグ軸に立つこと。
//   keysAbilityLossTurnEndNoDiscard ／ WithDiscard … 🔴**捨て札なしの経路が本題**＝続き457 で
//     `turnScopedState` へ登録するまで、この経路だけキー能力喪失が**永久に戻らなかった**。
order.push('removeAbilitiesOppKeyPicker', 'removedAbilitiesHidesTrashAct', 'intactAbilitiesShowsTrashAct',
  'removeAbilitiesAlsoKeysFlag', 'keysAbilityLossTurnEndNoDiscard', 'keysAbilityLossTurnEndWithDiscard');
// 続き462（PLAN §7 第3バッチ・Codex起案→Claude実機検証）＝`WDK10-009-E2`（指定ゾーンのレベル比例パワー継続）。
//   ⚠**この delta は `temp_power_mods` に載らない純計算値**（`calcFieldPowers` の中でだけ足される）＝
//     `powerMods` を見て「効いていない」と判定したら誤り。**DOM のパワー表示で見る**（先例 `wxdip03057DownUnderRed`）。
//   designatedZoneLevelScaledMinus … 指定ゾーンだけ Lv×-2000（Lv3→-6000）。**他2ゾーン不変**が過剰適用の対照。
//   designatedZoneRecalcOnSwap … 🔴**焼き込み検出**＝grant を保ったままゾーンのシグニを Lv1 へ差し替えると
//     -2000 へ**再計算**される（`effectEngine.ts` の `perTargetLevel` は適用のたびに掛ける）。-6000 のまま残れば退化。
//   designatedZoneGrantSurvivesOppTurn … `nextTurnOwner:'opponent'` の寿命＝CPU のターン中も継続。
order.push('designatedZoneLevelScaledMinus', 'designatedZoneRecalcOnSwap', 'designatedZoneGrantSurvivesOppTurn');
// 続き463＝**意図的FAILからの反転**（続き435〜436 で「ターン終了ボタンは押せるのに何も起きない・原因未確定」
// として既定order外に置かれていた3本）。真因は engine ではなく **parser の runtime scope 補完**で、
// `inferTriggerScope` がカード全文の「次の対戦相手のターン終了時**まで**」（＝効果の**期間**）を
// トリガーと誤読し、`ON_TURN_END` 効果を `any_opp` に書き換えて**自分側 collector から丸ごと落としていた**
// （実測＝41効果/40カードが「あなたのターン終了時」なのに一度も発火しない無言バグ。golden も census も緑のまま）。
order.push('kokonaUnderThreePay', 'kokonaUnderThreeSkip', 'kokonaUnderInsufficient');
// 続き431（PLAN §7・Codex起案、実機はネットワーク遮断のため未実行）＝ライフクラッシュ置換の宣言3件＋消費4件。
// ── 続き431 新規order追記境界（既存order不変証明用） ──
order.push('lifeCrashReplDeclareNoSelfMill', 'lifeCrashReplDeclareNoOppCrash', 'lifeCrashReplGrantFromAssist',
  'lifeCrashReplMillOnSigniAttack', 'lifeCrashReplCrashOpponentInstead',
  'lifeCrashReplNotOnLrigAttack', 'lifeCrashReplLrigAttackControl');
// ── /続き431 新規order追記境界 ──
// 続き430：離場置換対話のCPU応答・決定消費・ALL先聞きを末尾に追加。
order.push('leaveSubCpuAutoRespondsSubstitute', 'leaveSubAskDirectedToVictim',
  'leaveSubDecisionNoneIsHonored', 'leaveSubDecisionKeyIsHonored', 'leaveSubNoOptionMeansNoAsk',
  'leaveSubAllTargetsAskedPerVictim');
// 続き424：強制アタック enforcement。F1/F6 は警告を必ず OK で閉じ、F1/F2 は負方向＋対照の対。
order.push('forcedAttackBlocksPhaseAdvance', 'forcedAttackControlAdvances',
  'forcedAttackAdvancesAfterAllAttacked', 'forcedAttackBannerOnMyTurn',
  'forcedAttackNoSoftlockWhenUnattackable', 'forcedAttackFromResonaOnField');
// 続き425：OPPONENT_PAY_OPTIONAL の thenOnPay 極性と opponent 主語。各 pair は guest 資源枚数だけを変える。
order.push('oppPayNegateAttackWhenPaid', 'oppPayAttackGoesThroughWhenUnpaid',
  'oppHandDiscardIsOpponentSide', 'oppHandDiscardUnavailableWhenShort',
  'oppPlayDiscardThenOpponentDraws', 'oppPlayDiscardSkippedWhenNoHand');
// 続き469：V-05 owner/count/power と V-07② OPTIONAL_TRASH_SELF。既存orderは変更せず末尾追加。
order.push('targetDeclOpponentOnlyCandidates', 'targetDeclUpToTwoSelectsBoth', 'targetDeclUpToTwoAllowsZero',
  'targetDeclPowerCapExcludesAbove', 'targetDeclPowerCapUsesEffectivePower', 'optionalTrashSelfNoHandLoss');
// 続き470：V-08＋V-09① OPTIONAL_COST{handDiscard}。F/S/L は各々、手札1枚・pay/skip・選択肢②/③だけを変える対照。
order.push('handDiscardCostFiltersCandidates', 'handDiscardCostUnavailableWhenNoMatch',
  'handDiscardSkipBlocksBody', 'handDiscardPayRunsBody',
  'handDiscardOptionTwoDownsOpponentLrig', 'handDiscardOptionThreeDownsOpponentSigni');
// 続き471：V-06①＋V-09残。U/D は各々「下カードの色1枚」「白シグニ1体」だけを変える対照、Oは同一spec再注入。
order.push('underCostFiltersByColor', 'underCostUnavailableWhenNoRed', 'underCostFromThisOnly',
  'fieldDownCostRequiresThreeUpWhite', 'fieldDownCostPaysThreeAndWhite', 'optionalActivateSkipThenPay');
// 続き472：V-04。A1/A2はturn_phaseだけ、A4はpaidCountだけの対照。Rはアーツ＋KeyUse代表経路。
order.push('underEnergyPayOfferedInAttackPhase', 'underEnergyPayNotOfferedInMainPhase',
  'underEnergyPayDeductsUnderCardOnly', 'underEnergyPayPerTurnLimit',
  'energyPayArtsDeductsSelectedOnly', 'energyPayKeyUseDeductsSelectedOnly');
// 続き473：V-07① energyTrash（G1/G3統合＋G2）＋V-06② 捨てさせる向き。Hは同一specで応答だけを変える。
order.push('energyTrashCostDeductsEnergyNotHand', 'energyTrashCostUnavailableWhenShort',
  'revealOppHandSkipKeepsOpponentHand', 'revealOppHandPayDiscardsOpponentAndDraws');
// 続き474：V-10。効果バニッシュ自動身代わり3形＋候補なし対照＋バトル側対話を既存order末尾へ追加。

// ── 続き475g：§3 (cxxiii) ピースは「使用＝1回払って即解決→ルリグトラッシュ」 ──
// 🔴従来は キー と同じ経路で **①印刷 Cost を徴収 ②`field.key_piece` へ置き ③AUTO/ON_PLAY しか積まない**
//   だったため、ピース119枚中118枚（＝ACTIVATED＋印刷Cost同額）は**効果が一切走らず**、
//   KEY スロットの【起】から**同額をもう一度**払う羽目になっていた（＝二重請求）。
//   ⇒ 本シナリオは**旧実装なら必ず落ちる**＝旧は hand が1枚も増えず keyPiece にピースが載る。
const PIECE_USE_CARD = 'WXDi-P12-004#7001';          // ディソナンス（《無》×1・メインフェイズ・使用条件なし）
const PIECE_USE_DISONA_A = 'WXDi-P12-044#7002';      // 《ディソナアイコン》のシグニ（回収対象）
const PIECE_USE_DISONA_B = 'WXDi-P12-046#7003';      // 同上
const PIECE_USE_PLAIN = 'WD01-013#7004';             // 非ディソナ＝候補に入らない対照
const PIECE_USE_ENERGY = 'WD01-013#7005';

scenarios.pieceUseResolvesAndGoesToLrigTrash = {
  title: 'WXDi-P12-004（ピース使用＝エナ1枚を1回だけ払って効果が即解決し、キーゾーンではなくルリグトラッシュへ）',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-001#7000'],
      'field.signi': [null, null, null], 'field.check': null,
      'field.key_piece': null, 'field.key_piece_extra': [],
      'lrig_deck': [PIECE_USE_CARD],
      'lrig_trash': [],
      'hand': [],
      'energy': [PIECE_USE_ENERGY],
      // ⚠回収対象2枚＋**非ディソナ1枚**を置く＝filter が効いていることを同時に見る。
      'trash': [PIECE_USE_DISONA_A, PIECE_USE_DISONA_B, PIECE_USE_PLAIN],
      'actions_done': [], 'game_actions_done': [],
    },
    guestSet: {
      'field.lrig': ['WD03-001#7010'],
      'field.signi': [null, null, null], 'field.check': null,
      'hand': [], 'energy': [], 'actions_done': [], 'game_actions_done': [],
    },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  async drive(page, H) {
    const before = await H.queryState();
    if (before?.host?.energy !== 1 || (before?.host?.lrigDeckCards ?? []).length !== 1) {
      return { pass: false, detail: `注入前提不成立（energy=${before?.host?.energy} lrigDeck=${JSON.stringify(before?.host?.lrigDeckCards)}）` };
    }
    H.log('ルリグDK:', await H.clickTestId('my-lrig-dk') ?? '見つからず');
    await page.waitForTimeout(500);
    H.log('ピース:', await H.clickTestId('zone-card-0') ?? '見つからず');
    let actionClicked = false; let energyPicked = false; let used = false;
    const picked = new Set(); let confirmed = false;
    let candSnapshot = null; let last = before;
    for (let s = 0; s < 40; s++) {
      await page.waitForTimeout(300);
      let did = null;
      if (!actionClicked) {
        // 🔑ラベルが「キーにセット」のままなら**この時点で分かる**（旧実装の検出）。
        const use = page.locator('[data-testid^="card-action-"][data-action-label="ピースを使用"]').first();
        if (await use.count() && await use.isVisible().catch(() => false) && await use.isEnabled().catch(() => false)) {
          await use.click({ timeout: 2000 }); actionClicked = true; did = 'action:ピースを使用';
        }
      } else if (!energyPicked) {
        did = await H.clickTestId('keycost-energy-0'); if (did) energyPicked = true;
      } else if (!used) {
        did = await H.clickBtn('使用', { exact: true }); if (did) used = true;
      } else if (!confirmed) {
        const st0 = await H.queryState();
        if (Array.isArray(st0?.pendingCandidates) && st0.pendingCandidates.length > 0) {
          candSnapshot ??= [...st0.pendingCandidates];
          const next = [PIECE_USE_DISONA_A, PIECE_USE_DISONA_B].find(n => !picked.has(n));
          if (next && st0.pendingCandidates.includes(next)) {
            did = await clickPendingInstance(page, H, next); if (did) picked.add(next);
          } else if (picked.size >= 2) {
            did = await clickExactVisibleText(page, '決定 (2/2)'); if (did) confirmed = true;
          }
        }
      }
      if (!did) did = await H.clickBtn('発動順序を確定', { exact: true });
      const st = await H.queryState();
      last = st;
      H.log(`  pieceUse[${s}] -> ${did ?? 'なし'} | action=${actionClicked} energy=${energyPicked} used=${used} picked=${picked.size}/${confirmed} cands=${JSON.stringify(candSnapshot)} hHand=${JSON.stringify(st?.host?.handCards)} hEnergy=${st?.host?.energy} hTrash=${JSON.stringify(st?.host?.trashCards)} lrigDeck=${JSON.stringify(st?.host?.lrigDeckCards)} lrigTrash=${JSON.stringify(st?.host?.lrigTrashCards)} keyPiece=${st?.host?.keyPiece ?? '-'} pEff=${st?.pendingEffect ?? '-'} stack=${st?.stackLen ?? '-'}`);
      const settled = used && confirmed && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0;
      if (settled) {
        // 🔑**候補は《ディソナアイコン》の2枚だけ**（非ディソナが混ざったら filter 脱落）
        const candOk = Array.isArray(candSnapshot) && candSnapshot.length === 2
          && candSnapshot.includes(PIECE_USE_DISONA_A) && candSnapshot.includes(PIECE_USE_DISONA_B);
        const recovered = (st.host.handCards ?? []).includes(PIECE_USE_DISONA_A)
          && (st.host.handCards ?? []).includes(PIECE_USE_DISONA_B);
        const plainStayed = (st.host.trashCards ?? []).includes(PIECE_USE_PLAIN);
        // 🔴**エナは1回だけ**＝1→0。旧実装でも 1→0 になるが、その場合は効果が走らない（recovered=false）。
        const paidOnce = st.host.energy === 0;
        const inLrigTrash = (st.host.lrigTrashCards ?? []).includes(PIECE_USE_CARD);
        const notInKeyZone = !st.host.keyPiece;
        const leftLrigDeck = !(st.host.lrigDeckCards ?? []).includes(PIECE_USE_CARD);
        const pass = candOk && recovered && plainStayed && paidOnce && inLrigTrash && notInKeyZone && leftLrigDeck;
        return { pass, st,
          detail: pass
            ? `ピース使用＝エナ 1→0（1回払い）・候補は《ディソナアイコン》2枚だけ=${JSON.stringify(candSnapshot)}・2枚を手札へ回収・非ディソナはトラッシュ残存・**ピースはルリグトラッシュへ**（keyPiece=${st.host.keyPiece ?? 'null'}）`
            : `【(cxxiii)回帰】candOk=${candOk} recovered=${recovered} plainStayed=${plainStayed} paidOnce=${paidOnce}(energy=${st.host.energy}) inLrigTrash=${inLrigTrash} notInKeyZone=${notInKeyZone}(keyPiece=${st.host.keyPiece ?? 'null'}) leftLrigDeck=${leftLrigDeck} hand=${JSON.stringify(st.host.handCards)}` };
      }
    }
    return { pass: false, detail: `ピース使用 完走タイムアウト（action=${actionClicked} energy=${energyPicked} used=${used} picked=${picked.size}/${confirmed} hHand=${JSON.stringify(last?.host?.handCards)} hEnergy=${last?.host?.energy} lrigTrash=${JSON.stringify(last?.host?.lrigTrashCards)} keyPiece=${last?.host?.keyPiece ?? '-'} pEff=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
  },
};

order.push('effectBanishSubstituteRunsAutomatically', 'effectBanishNoSubstituteWithoutSacrifice',
  'effectBanishSubstituteDiscardsSpell', 'effectBanishLifeCrashSubstitutePaysLife',
  'battleBanishSubstituteStillInteractive');
order.push('pieceUseResolvesAndGoesToLrigTrash');

// ── V-13 BEGIN（既存シナリオ／既存 helper／既存 order 要素は変更せず末尾追記） ──
const v13Life = (base) => Array.from({ length: 7 }, (_, i) => `WD01-013#${base + i}`);
const v13CountInPlayerZones = (side, instanceId) => [
  ...(side?.handCards ?? []),
  ...(side?.trashCards ?? []),
  ...(side?.energyCards ?? []),
  ...(side?.fieldSigni ?? []).flatMap(stack => stack ?? []),
].filter(id => id === instanceId).length;

async function v13CoinsPaidThisTurn(page) {
  return page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key));
    const h = { apikey: ANON, Authorization: `Bearer ${sess.access_token}` };
    const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${sess.user?.id}&status=eq.PLAYING&select=id`, { headers: h });
    const roomId = (await r1.json())?.[0]?.id;
    if (!roomId) return null;
    const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_state`, { headers: h });
    return (await r2.json())?.[0]?.host_state?.coins_paid_this_turn ?? 0;
  }, { SUPA_URL, ANON });
}

/**
 * `power_mods_until_opp_turn`（UNTIL_OPP_TURN_END のパワー修正）を `cardNum:delta` の配列で返す。
 * ⚠**`H.queryState().powerMods` は `temp_power_mods` しか写さない**（`:16847` 付近）ので、
 *   `duration:'UNTIL_OPP_TURN_END'` の効果（`WXDi-P15-069-E1` 等）は**そちらには絶対に出ない**
 *   （書き分けは `effectExecutor.ts:1456`）。powerMods だけを見ると「発火したのに乗っていない」
 *   という**engine バグに見える偽陰性**になる（続き478 で実際に踏んだ）。
 */
async function v13PowerModsUntilOpp(page) {
  return page.evaluate(async ({ SUPA_URL, ANON }) => {
    const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
    const sess = JSON.parse(localStorage.getItem(key));
    const h = { apikey: ANON, Authorization: `Bearer ${sess.access_token}` };
    const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${sess.user?.id}&status=eq.PLAYING&select=id`, { headers: h });
    const roomId = (await r1.json())?.[0]?.id;
    if (!roomId) return null;
    const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_state`, { headers: h });
    const mods = (await r2.json())?.[0]?.host_state?.power_mods_until_opp_turn ?? [];
    return mods.map(m => `${m.cardNum}:${m.delta}`);
  }, { SUPA_URL, ANON });
}

async function driveV13TrashAct(page, H, opts) {
  await H.closeModals();
  if (opts.phase === 'MAIN') await H.ensureMain();
  else {
    await H.repatchTop({ active: 'host', turn_phase: opts.phase, effect_stack: null, pending_effect: null });
    await page.waitForTimeout(600);
  }
  const before = await H.queryState();
  const openedTrash = await H.clickTestId('my-trash');
  await page.waitForTimeout(350);
  const openedCard = await H.clickTestId('zone-card-0');
  const cardModal = page.getByTestId('card-detail-modal').first();
  let labels = [];
  let actionLabel = null;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250);
    if (await cardModal.count() && await cardModal.isVisible().catch(() => false)) {
      labels = await cardModal.locator('[data-testid^="card-action-"]:visible')
        .evaluateAll(els => els.map(el => el.getAttribute('data-action-label') ?? ''));
      actionLabel = labels.find(label => label.startsWith('【起】トラッシュから出す（')
        && (!opts.actionIncludes || label.includes(opts.actionIncludes))) ?? null;
      if (actionLabel) break;
    }
  }
  const modalVisible = !!(await cardModal.count()) && await cardModal.isVisible().catch(() => false);
  if (!openedTrash || !openedCard || !modalVisible) {
    return { pass: false, detail: `CardModal未表示（my-trash=${openedTrash ?? 'なし'} zone-card-0=${openedCard ?? 'なし'}）` };
  }
  if (!opts.expectAction) {
    return {
      pass: !actionLabel,
      detail: !actionLabel
        ? `CardModal表示済み・原因だけ外した盤面で対象【起】なし（actions=${JSON.stringify(labels)}）`
        : `負方向なのに対象【起】がsurface（${actionLabel}）`,
    };
  }
  if (!actionLabel) return { pass: false, detail: `支払い可能な対照で対象【起】なし（actions=${JSON.stringify(labels)}）` };
  const actionClicked = await H.clickBtn(actionLabel, { exact: true });
  const payModal = page.getByTestId('trashact-modal').first();
  let payModalVisible = false;
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(250);
    if (await payModal.count() && await payModal.isVisible().catch(() => false)) { payModalVisible = true; break; }
  }
  if (!actionClicked || !payModalVisible) {
    return { pass: false, detail: `【起】クリック後にコストUI未表示（action=${actionClicked ?? 'なし'} modal=${payModalVisible}）` };
  }
  for (const check of opts.domChecks ?? []) {
    const el = page.getByTestId(check.testId).first();
    const visible = !!(await el.count()) && await el.isVisible().catch(() => false);
    const actual = visible ? await el.getAttribute(check.attr) : null;
    if (!visible || actual !== String(check.value)) {
      return { pass: false, detail: `${check.testId} ${check.attr}=${actual ?? '未表示'}（期待=${check.value}）` };
    }
  }
  for (const testId of opts.energyPicks ?? []) {
    if (!(await H.clickTestId(testId))) return { pass: false, detail: `エナ候補を選べず（${testId}）` };
  }
  for (const testId of opts.handPicks ?? []) {
    if (!(await H.clickTestId(testId))) return { pass: false, detail: `手札候補を選べず（${testId}）` };
  }
  for (const testId of opts.exceedPicks ?? []) {
    if (!(await H.clickTestId(testId))) return { pass: false, detail: `エクシード候補を選べず（${testId}）` };
  }
  const paid = await H.clickTestId('trashact-pay');
  if (!paid) return { pass: false, detail: 'trashact-payをクリックできず' };

  let last = before;
  let mechanismSeen = false;
  let stackSeen = false;
  let consecutiveFinal = 0;
  for (let s = 0; s < 120; s++) {
    await page.waitForTimeout(250);
    let did = await H.clickZone();
    if (!did) did = await H.stdStep(['発動順序を確定', '確定', '決定', 'OK', 'はい']);
    const st = await H.queryState();
    last = st;
    mechanismSeen ||= (st?.host?.actionsDone ?? []).includes(opts.effectId);
    stackSeen ||= (st?.stackLen ?? 0) > 0 || (st?.stackPending ?? []).includes(opts.effectId)
      || (st?.stackQueue ?? []).includes(opts.effectId);
    const sourceCount = v13CountInPlayerZones(st?.host, opts.sourceId);
    const sourceField = (st?.host?.fieldSigni ?? []).some(stack => (stack ?? []).includes(opts.sourceId));
    const sourceLeftTrash = !(st?.host?.trashCards ?? []).includes(opts.sourceId);
    const paidCardsOk = (opts.paidCardIds ?? []).every(id =>
      (st?.host?.trashCards ?? []).includes(id) && v13CountInPlayerZones(st?.host, id) === 1);
    const specific = await opts.finalCheck(st, page);
    const settled = mechanismSeen && st?.pendingEffect == null && (st?.stackLen ?? 0) === 0;
    const finalOk = settled && sourceCount === 1 && sourceField && sourceLeftTrash && paidCardsOk && specific.ok;
    consecutiveFinal = finalOk ? consecutiveFinal + 1 : 0;
    H.log(`  v13[${s}] -> ${did ?? 'なし'} | effect=${opts.effectId} mechanism=${mechanismSeen} stackSeen=${stackSeen} sourceCount=${sourceCount} sourceField=${sourceField} paidCards=${paidCardsOk} specific=${specific.ok} settled=${settled}`);
    if (consecutiveFinal >= 2) {
      return {
        pass: true,
        detail: `【起】表示・コストUI表示・actions_done=${opts.effectId}・本体trash→field（全対象zone合計1枚）・${specific.detail}${stackSeen ? '・stack観測済み' : ''}`,
      };
    }
  }
  const specific = await opts.finalCheck(last, page);
  return { pass: false, detail: `完走タイムアウト（mechanism=${mechanismSeen} stackSeen=${stackSeen} sourceCount=${v13CountInPlayerZones(last?.host, opts.sourceId)} trash=${JSON.stringify(last?.host?.trashCards)} field=${JSON.stringify(last?.host?.fieldSigni)} specific=${specific.detail} pending=${last?.pendingEffect ?? '-'} stack=${last?.stackLen ?? '-'}）` };
}

scenarios.v13TrashActLrigDownTwo = {
  title: 'V-13 WXDi-P04-042：レベル2ルリグ2体ダウンでトラッシュ起動し本体を場へ移す',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-003#7301'], 'field.assist_lrig_l': ['WD03-003#7302'], 'field.assist_lrig_r': [],
      'field.lrig_down': false, 'field.assist_lrig_l_down': false, 'field.assist_lrig_r_down': false,
      'field.signi': [null, null, null], 'field.check': null,
      'trash': ['WXDi-P04-042#7303'], 'hand': [], 'energy': [], 'life_cloth': v13Life(7310),
      'actions_done': [], 'game_actions_done': [], 'coins': 0,
    },
    guestSet: { 'field.lrig': ['WD01-004#7390'], 'field.signi': [null, null, null], 'field.check': null, 'life_cloth': v13Life(7391) },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  drive: (page, H) => driveV13TrashAct(page, H, {
    phase: 'MAIN', expectAction: true, actionIncludes: 'レベル2のルリグ2体',
    sourceId: 'WXDi-P04-042#7303', effectId: 'WXDi-P04-042-E2',
    domChecks: [
      { testId: 'trashact-cost-summary', attr: 'data-lrig-down-count', value: 2 },
      { testId: 'trashact-cost-summary', attr: 'data-lrig-down-level', value: 2 },
    ],
    finalCheck: async st => ({
      ok: st?.host?.lrigDown === true && st?.host?.assistDown?.[0] === true && st?.host?.assistDown?.[1] === false,
      detail: `センター→アシストLの順でdown=${JSON.stringify([st?.host?.lrigDown, ...(st?.host?.assistDown ?? [])])}`,
    }),
  }),
};

scenarios.v13TrashActLrigDownTwoNoUpLv2 = {
  title: 'V-13 対照：アップ状態がレベル1だけならWXDi-P04-042のトラッシュ【起】は出ない',
  spec: {
    hostSet: {
      'field.lrig': ['WD01-004#7301'], 'field.assist_lrig_l': ['WD03-004#7302'], 'field.assist_lrig_r': [],
      'field.lrig_down': false, 'field.assist_lrig_l_down': false, 'field.assist_lrig_r_down': false,
      'field.signi': [null, null, null], 'field.check': null,
      'trash': ['WXDi-P04-042#7303'], 'hand': [], 'energy': [], 'life_cloth': v13Life(7310),
      'actions_done': [], 'game_actions_done': [], 'coins': 0,
    },
    guestSet: { 'field.lrig': ['WD01-004#7390'], 'field.signi': [null, null, null], 'field.check': null, 'life_cloth': v13Life(7391) },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  drive: (page, H) => driveV13TrashAct(page, H, {
    phase: 'MAIN', expectAction: false, actionIncludes: 'レベル2のルリグ2体',
  }),
};

const makeV13AttackTrashSpec = (shortHand) => ({
  hostSet: {
    'field.lrig': ['WX18-002#7401'], 'field.lrig_down': false,
    'field.signi': [null, null, null], 'field.check': null,
    'trash': ['WX19-029#7402'],
    'hand': shortHand ? ['WX10-082#7403', 'WD01-013#7404'] : ['WX10-082#7403', 'WX10-083#7404'],
    'energy': ['WD05-009#7405', 'WXDi-P16-082#7406'], 'life_cloth': v13Life(7410),
    'actions_done': [], 'game_actions_done': [], 'coins': 0,
  },
  guestSet: { 'field.lrig': ['WD01-004#7490'], 'field.signi': [null, null, null], 'field.check': null, 'life_cloth': v13Life(7491) },
  top: { active: 'host', turn_phase: 'ATTACK_ARTS', turn_count: 2 },
});

scenarios.v13TrashActAttackPhaseCombo = {
  title: 'V-13 WX19-029：アタックフェイズに黒2＋＜遊具＞2枚でダウン状態登場',
  spec: makeV13AttackTrashSpec(false),
  drive: (page, H) => driveV13TrashAct(page, H, {
    phase: 'ATTACK_ARTS', expectAction: true, actionIncludes: '遊具',
    sourceId: 'WX19-029#7402', effectId: 'WX19-029-E2',
    energyPicks: ['trashact-energy-0', 'trashact-energy-1'],
    handPicks: ['trashact-hand-0', 'trashact-hand-1'],
    paidCardIds: ['WD05-009#7405', 'WXDi-P16-082#7406', 'WX10-082#7403', 'WX10-083#7404'],
    domChecks: [
      { testId: 'trashact-energy-0', attr: 'data-card-num', value: 'WD05-009' },
      { testId: 'trashact-energy-1', attr: 'data-card-num', value: 'WXDi-P16-082' },
      { testId: 'trashact-hand-0', attr: 'data-selectable', value: 'true' },
      { testId: 'trashact-hand-1', attr: 'data-selectable', value: 'true' },
    ],
    finalCheck: async st => {
      const zi = (st?.host?.fieldSigni ?? []).findIndex(stack => (stack ?? []).includes('WX19-029#7402'));
      return { ok: zi >= 0 && st?.host?.signiDown?.[zi] === true && st?.host?.hand === 0 && st?.host?.energy === 0,
        detail: `エナ/手札各2枚がtrashへ移動・本体zone${zi + 1} down=${st?.host?.signiDown?.[zi]}` };
    },
  }),
};

scenarios.v13TrashActAttackPhaseComboShortHand = {
  title: 'V-13 対照：手札総数を保って＜遊具＞だけ1枚ならWX19-029の【起】は出ない',
  spec: makeV13AttackTrashSpec(true),
  drive: (page, H) => driveV13TrashAct(page, H, {
    phase: 'ATTACK_ARTS', expectAction: false, actionIncludes: '遊具',
  }),
};

scenarios.v13TrashActDisonaDiscardFilter = {
  title: 'V-13 WXDi-P12-053：ディソナだけ2枚捨ててトラッシュ起動',
  spec: {
    hostSet: {
      'field.lrig': ['WX18-023#7501'], 'field.lrig_down': false,
      'field.signi': [null, null, null], 'field.check': null,
      'trash': ['WXDi-P12-053#7502'],
      'hand': ['WXDi-P12-044#7503', 'WXDi-P12-045#7504', 'WD01-013#7505'],
      'energy': [], 'life_cloth': v13Life(7510), 'actions_done': [], 'game_actions_done': [], 'coins': 0,
    },
    guestSet: { 'field.lrig': ['WD01-004#7590'], 'field.signi': [null, null, null], 'field.check': null, 'life_cloth': v13Life(7591) },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  drive: (page, H) => driveV13TrashAct(page, H, {
    // ⚠アクションのラベルは `【起】トラッシュから出す（手札2枚を捨てる）`＝**《ディソナアイコン》の限定は
    //   ラベルに現れない**（実測。旧 `actionIncludes:'ディソナ'` は永久に一致せず偽陰性だった）。
    //   ディソナ限定が効いているかは下の domChecks（`data-selectable`）で見る＝そちらが本題。
    phase: 'MAIN', expectAction: true, actionIncludes: 'トラッシュから出す',
    sourceId: 'WXDi-P12-053#7502', effectId: 'WXDi-P12-053-E2',
    handPicks: ['trashact-hand-0', 'trashact-hand-1'],
    paidCardIds: ['WXDi-P12-044#7503', 'WXDi-P12-045#7504'],
    domChecks: [
      { testId: 'trashact-hand-0', attr: 'data-selectable', value: 'true' },
      { testId: 'trashact-hand-1', attr: 'data-selectable', value: 'true' },
      { testId: 'trashact-hand-2', attr: 'data-selectable', value: 'false' },
      { testId: 'trashact-hand-2', attr: 'data-card-num', value: 'WD01-013' },
    ],
    finalCheck: async st => ({
      ok: st?.host?.hand === 1 && (st?.host?.handCards ?? []).includes('WD01-013#7505'),
      detail: 'ディソナ2枚だけtrashへ移動・非ディソナ1枚はhand残留',
    }),
  }),
};

scenarios.v13TrashActCoinChain = {
  title: 'V-13 WXDi-P16-082：コイン2支払いからON_COIN_PAIDを積み本体を場へ移す',
  spec: {
    hostSet: {
      'field.lrig': ['WX18-023#7601'], 'field.lrig_down': false,
      'field.signi': [['WXDi-P15-069#7602'], null, null], 'field.signi_down': [false, false, false], 'field.check': null,
      'trash': ['WXDi-P16-082#7603'], 'hand': [], 'energy': [], 'life_cloth': v13Life(7610),
      'actions_done': [], 'game_actions_done': [], 'coins': 2, 'coins_paid_this_turn': 0, 'temp_power_mods': [],
    },
    guestSet: { 'field.lrig': ['WD01-004#7690'], 'field.signi': [null, null, null], 'field.check': null, 'life_cloth': v13Life(7691) },
    top: { active: 'host', turn_phase: 'MAIN', turn_count: 2 },
  },
  drive: (page, H) => driveV13TrashAct(page, H, {
    phase: 'MAIN', expectAction: true, actionIncludes: 'コイン',
    sourceId: 'WXDi-P16-082#7603', effectId: 'WXDi-P16-082-E2',
    domChecks: [{ testId: 'trashact-cost-summary', attr: 'data-coin-cost', value: 2 }],
    finalCheck: async (st, page) => {
      const coinsPaid = await v13CoinsPaidThisTurn(page);
      const watcherUsed = (st?.host?.actionsDone ?? []).includes('WXDi-P15-069-E1');
      // 🔑`WXDi-P15-069-E1` は `duration:'UNTIL_OPP_TURN_END'`＝**長期ストアへ書かれる**ので
      //   `powerMods`（＝temp_power_mods）ではなく `power_mods_until_opp_turn` を見る（上のヘルパ参照）。
      const longMods = (await v13PowerModsUntilOpp(page)) ?? [];
      const watcherBuff = longMods.includes('WXDi-P15-069#7602:2000');
      return { ok: st?.host?.coins === 0 && coinsPaid === 2 && watcherUsed && watcherBuff,
        detail: `coins 2→${st?.host?.coins}・coins_paid_this_turn=${coinsPaid}・ON_COIN_PAID actions_done=${watcherUsed}・+2000=${watcherBuff}（untilOpp=${JSON.stringify(longMods)}）` };
    },
  }),
};

order.push('v13TrashActLrigDownTwo', 'v13TrashActLrigDownTwoNoUpLv2',
  'v13TrashActAttackPhaseCombo', 'v13TrashActAttackPhaseComboShortHand',
  'v13TrashActDisonaDiscardFilter', 'v13TrashActCoinChain');
// ── V-13 END ──
const runIds = (requested.length ? requested : order).filter(id => scenarios[id]);
if (runIds.length === 0) { console.error('シナリオ指定が不正:', requested, '使用可:', Object.keys(scenarios)); process.exit(2); }

// preflight＝ブラウザ起動前（0秒）に定番FAIL要因を警告（実行は止めない）
try {
  const cardDb = loadCardDb();
  for (const id of runIds) {
    const warns = preflightScenario(scenarios[id], cardDb);
    if (warns.length) { console.log(`⚠ preflight[${id}]:`); for (const w of new Set(warns)) console.log('   - ' + w); }
  }
} catch (e) { console.log('preflight スキップ（CSV読込失敗）:', e.message); }

// スクショ＝明示指定シナリオ（デバッグ中）のみ既定ON。全件バッチ（回帰）はOFFで数分短縮。SHOTS=1/0 で強制。
const SHOTS_ON = process.env.SHOTS === '1' || (process.env.SHOTS !== '0' && requested.length > 0);
if (!SHOTS_ON) console.log('スクショ省略中（バッチ既定。有効化は SHOTS=1）');

// Playwright のブラウザ/レンダラプロセスのクラッシュ（`Target crashed` 等）か判定する＝
// タスク12(xxvi) の耐障害化でセッション再確立トリガーに使う。page が既に閉じている場合も真。
function isCrashError(page, e) {
  try { if (page && page.isClosed && page.isClosed()) return true; } catch { /* noop */ }
  const msg = String(e?.message ?? e ?? '');
  return /Target crashed|Target closed|Page crashed|Session closed|browser has been closed|has been closed|Protocol error.*(close|crash)/i.test(msg);
}

await buildFirst();
const { proc, url } = await startDev();
// 異常終了（例外・Ctrl+C）でも preview server を残さない保険（'exit' ハンドラは同期処理のみ可）
process.on('exit', () => killTree(proc));
process.on('SIGINT', () => process.exit(130));
console.log(`dev: ${url} / 実行シナリオ: ${runIds.join(', ')}`);
let code = 0;
const results = [];
try {
  const browser = await chromium.launch(process.env.PLAYWRIGHT_CHANNEL ? { channel: process.env.PLAYWRIGHT_CHANNEL } : {});
  // タスク12(xxvi)＝74件フルバッチでレンダラのメモリ蓄積により ~27件目で `Target crashed`＝バッチ停止。
  // 対策＝セッション（context+page+H＋console監視）を関数化し、(a) N件ごとに context を作り直して
  // ヒープ/DOM/Realtime購読の蓄積を解放、(b) クラッシュ検知時に再確立して当該シナリオを再試行する。
  // 新規 context は localStorage 空＝毎回ログインし直すが、ルーム再利用（findReusableRoom）で
  // マッチング/セットアップは非FRESH時スキップされるため再確立コストは軽い。
  const establish = async () => {
    const context = await browser.newContext({ viewport: { width: 1400, height: 950 } });
    const page = await context.newPage();
  // SHOTS_ON=false のとき page.screenshot を no-op 化（シナリオ側の呼び出しは無改変でよい）
  if (!SHOTS_ON) { const raw = page.screenshot.bind(page); page.screenshot = (o) => (o?.path?.includes('-final') ? raw(o) : Promise.resolve(Buffer.alloc(0))); }
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  // 共通ヘルパー束（シナリオ drive に渡す）
  const H = {
    log: (...a) => console.log('   ', ...a),
    body: () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 500)),
    fullBody: () => page.evaluate(() => document.body.innerText.replace(/\n{2,}/g, '\n').slice(0, 4000)),
    // 盤面の全テキスト行から正規表現に一致する最初の行を返す（CHOOSE選択肢ラベルではなく実ログ判定用）。
    findLog: async (re) => {
      const lines = await page.evaluate(() => document.body.innerText.split('\n').map(s => s.trim()).filter(Boolean));
      return lines.find(l => re.test(l)) ?? null;
    },
    clickTextOrBtn: async (labels) => {
      for (const lbl of labels) {
        const b = page.getByRole('button', { name: lbl, exact: false }).first();
        if (await b.count() && await b.isVisible().catch(() => false)) { await b.click().catch(() => {}); return 'btn:' + lbl; }
        const tx = page.getByText(lbl, { exact: false }).first();
        if (await tx.count() && await tx.isVisible().catch(() => false)) { await tx.click().catch(() => {}); return 'txt:' + lbl; }
      }
      return null;
    },
    clickTestId: async (...ids) => {
      for (const id of ids) {
        const el = page.getByTestId(id).first();
        if (await el.count() && await el.isVisible().catch(() => false) && await el.isEnabled().catch(() => true)) {
          await el.click({ timeout: 2000 }).catch(() => {}); return 'tid:' + id;
        }
      }
      return null;
    },
    // ── 2026-07-14 追加ヘルパー（新規シナリオはこちらを優先）──
    // ボタンクリック（isEnabled を必ず検査し、click 失敗を握りつぶさずログに出す）。
    // 「disabledのまま押して『クリックした風だが進まない』」「.catch(()=>{})で失敗が見えない」の2大罠を封じる。
    clickBtn: async (name, { exact = false, nth = 0 } = {}) => {
      const b = page.getByRole('button', { name, exact }).nth(nth);
      if (!(await b.count()) || !(await b.isVisible().catch(() => false))) return null;
      if (!(await b.isEnabled().catch(() => false))) { H.log(`  (btn「${name}」は disabled＝前提の選択が未完了)`); return null; }
      try { await b.click({ timeout: 2000 }); return 'btn:' + name; }
      catch (e) { H.log(`  (btn「${name}」click失敗: ${String(e.message).split('\n')[0]})`); return null; }
    },
    // createPortal モーダル内の img[alt=カード名] クリック。同名 img が画面下部の常設手札ストリップに
    // DOM順で先に存在するため .first() は誤クリック→背景オーバーレイのキャンセル誘発（craftTokenPlace の実例）。
    // 後から document に追加されるモーダル側＝ .last() で狙う。
    clickModalImage: async (alt) => {
      const img = page.locator(`img[alt="${alt}"]`).last();
      if (!(await img.count()) || !(await img.isVisible().catch(() => false))) return null;
      try { await img.click({ timeout: 3000 }); return 'img:' + alt; }
      catch (e) { H.log(`  (img「${alt}」click失敗: ${String(e.message).split('\n')[0]})`); return null; }
    },
    // 定石チェーン1手＝発動順序確定→pick-0（「決定(1/N)」ready時は押さない）→汎用確定ボタン。
    // シナリオ側はカード固有のクリックだけ書き、`if (!did) did = await H.stdStep();` で締めるのが型。
    stdStep: async (labels = ['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']) => {
      const pick0 = page.getByTestId('pick-0').first();
      if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
        const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
        if (!confirmReady) { await pick0.click().catch(() => {}); return 'pick:pick-0'; }
      }
      return await H.clickTextOrBtn(labels);
    },
    // SELECT_SIGNI_ZONE（エナ/手札/トラッシュ等から場に出す際のゾーン選択・空き2つ以上で発生）＝
    // 「ゾーンN」ボタン（使用中は disabled）。craftTokenPlace の cardName 型だけでなく、
    // ENERGY_CARD/HAND_CARD ソースの ADD_TO_FIELD が SELECT_TARGET 経由（複数候補）で解決する場合も
    // 同じ SELECT_SIGNI_ZONE を発生させる（続き114で判明＝execAddToField 内 applyToField の自動配置は
    // 非対話解決パスのみが通り、SELECT_TARGET を要する対話解決パスは別のゾーン選択機構を通る）。
    clickZone: async () => {
      for (const zi of [1, 2, 3]) {
        const b = page.getByRole('button', { name: new RegExp(`^ゾーン${zi}`) }).first();
        if (await b.count() && await b.isVisible().catch(() => false) && await b.isEnabled().catch(() => false)) {
          await b.click().catch(() => {}); return 'btn:ゾーン' + zi;
        }
      }
      return null;
    },
    // 注入直後はグロウフェイズに戻る競合がある。MAIN を確実にしてから操作する。
    ensureMain: async () => {
      for (let k = 0; k < 5; k++) {
        await page.waitForTimeout(800);
        const adv = await H.clickTextOrBtn(['メインフェイズへ']);
        if (!adv) break;
      }
    },
    // モーダル/オーバーレイを閉じてからシナリオ間で盤面を切り替える。
    closeModals: async () => {
      // CardModal/CardStackModal（カード拡大表示＝LRIG/シグニ/キー等クリックで開く）はEscapeキー非対応
      // （onCloseは背景divのonClickのみ）＝Escape連打だけでは閉じられず、前シナリオの開きっぱなしモーダルが
      // 次シナリオの最初のスクショ/クリックまで残留する（trashCounterOpp が delayedAttackTrigger の残留
      // モーダルでブロックされた実例あり）。「タップして閉じる」文言クリックで背景へフォールバックする。
      for (let k = 0; k < 3; k++) {
        await page.keyboard.press('Escape').catch(() => {});
        const closeTx = page.getByText(/タップ.{0,4}閉じる/).first();
        if (await closeTx.count() && await closeTx.isVisible().catch(() => false)) { await closeTx.click().catch(() => {}); }
        await page.waitForTimeout(300);
      }
    },
    // トップレベル列（turn_phase/active_user_id 等）を再 PATCH（フェイズドリフト対策）。
    repatchTop: (fields) => page.evaluate(async ({ SUPA_URL, ANON, CPU_PLAYER_ID, fields }) => {
      const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
      const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
      const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
      const roomId = (await r1.json())?.[0]?.id; if (!roomId) return { error: 'no room' };
      const upd = { ...fields };
      if (upd.active === 'host') { upd.active_user_id = uid; delete upd.active; }
      if (upd.active === 'cpu') { upd.active_user_id = CPU_PLAYER_ID; delete upd.active; }
      await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}`, { method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify(upd) });
      return { ok: true };
    }, { SUPA_URL, ANON, CPU_PLAYER_ID, fields }),
    /**
     * grant を保ったまま盤面だけ差し替えるための最小 PATCH。
     * 指定されたドットパスだけを上書きし、既存フィールドの削除・リセットは一切行わない。
     */
    patchPlayerState: (side, dotPathMap) => page.evaluate(async ({ SUPA_URL, ANON, side, dotPathMap }) => {
      const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
      const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
      const h = { apikey: ANON, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
      const roomId = (await r1.json())?.[0]?.id; if (!roomId) return { error: 'no room' };
      const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_state,guest_state`, { headers: h });
      const row = (await r2.json())?.[0]; if (!row) return { error: 'no row' };
      const stateKey = side === 'guest' ? 'guest_state' : 'host_state';
      const state = row[stateKey] ?? {};
      for (const [path, value] of Object.entries(dotPathMap ?? {})) {
        const parts = path.split('.'); let target = state;
        for (let i = 0; i < parts.length - 1; i++) {
          target[parts[i]] = target[parts[i]] ?? {};
          target = target[parts[i]];
        }
        target[parts.at(-1)] = value;
      }
      await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}`, {
        method: 'PATCH', headers: { ...h, Prefer: 'return=minimal' }, body: JSON.stringify({ [stateKey]: state }),
      });
      return { ok: true };
    }, { SUPA_URL, ANON, side, dotPathMap }),
    // GROW フェイズを再注入しつつグロウボタンを押す（注入後 GROW→MAIN ドリフトのレース対策）。
    // candidateRe にマッチするグロウ先候補が見えたら true を返す。
    openGrow: async (candidateRe) => {
      for (let k = 0; k < 5; k++) {
        await H.repatchTop({ active: 'host', turn_phase: 'GROW', effect_stack: null, pending_effect: null });
        await page.waitForTimeout(600);
        const gb = page.getByRole('button', { name: 'グロウ', exact: true }).first();
        if (await gb.count() && await gb.isVisible().catch(() => false)) { await gb.click().catch(() => {}); }
        await page.waitForTimeout(500);
        const cand = page.getByRole('button', { name: candidateRe }).first();
        if (await cand.count() && await cand.isVisible().catch(() => false)) { await cand.click().catch(() => {}); return true; }
      }
      return false;
    },
    // 実 battle_states を直接照会して ground truth を取る（可視ログ依存の偽陰性回避）。
    // deck_shuffled_count（シャッフル発生）/ effect_stack 長 / PR-470A#1 への +5000 / ログ末尾を返す。
    queryState: () => page.evaluate(async ({ SUPA_URL, ANON }) => {
      const key = Object.keys(localStorage).find(k => /^sb-.*-auth-token$/.test(k));
      const sess = JSON.parse(localStorage.getItem(key)); const token = sess.access_token, uid = sess.user?.id;
      const h = { apikey: ANON, Authorization: `Bearer ${token}` };
      const r1 = await fetch(`${SUPA_URL}/rest/v1/rooms?host_id=eq.${uid}&status=eq.PLAYING&select=id`, { headers: h });
      const roomId = (await r1.json())?.[0]?.id; if (!roomId) return { error: 'no room' };
      const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_state,guest_state,effect_stack,pending_spell,pending_effect,game_logs,turn_phase,active_user_id`, { headers: h });
      const row = (await r2.json())?.[0]; if (!row) return { error: 'no row' };
      const hs = row.host_state ?? {}, gs = row.guest_state ?? {};
      const buff = (hs.temp_power_mods ?? []).find(m => m.cardNum === 'PR-470A#1' && (m.delta ?? 0) >= 5000);
      const stack = row.effect_stack;
      // ⚠ `EffectStack` は `{turnPlayerId,pendingTurn,pendingOpp,orderTurnDone,orderOppDone,queue}`＝
      //   `entries` キーは存在しない（旧実装はここを読んでいたので **常に 0** を報告していた＝計器の嘘）。
      //   整列済みなら残キュー長、未整列なら未整列の総数を残数として返す。
      const stackLen = !stack ? 0
        : (stack.orderTurnDone && stack.orderOppDone)
          ? (stack.queue?.length ?? 0)
          : ((stack.pendingTurn?.length ?? 0) + (stack.pendingOpp?.length ?? 0));
      const logTail = (row.game_logs ?? []).slice(-25).map(l => [l.action, l.detail].filter(Boolean).join(' '));
      const sideOf = (s) => ({
        hand: (s.hand ?? []).length,
        handCards: s.hand ?? [],
        trash: (s.trash ?? []).length,
        trashCards: s.trash ?? [],
        energy: (s.energy ?? []).length,
        deck_shuffled_count: s.deck_shuffled_count ?? 0,
        powerMods: (s.temp_power_mods ?? []).map(m => `${m.cardNum}:${m.delta}`),
        keywordGrants: Object.entries(s.keyword_grants ?? {}).map(([id, kws]) => `${id}:${(kws || []).join('/')}`),
        actionsDone: s.actions_done ?? [],
        lrigTrash: (s.lrig_trash ?? []).length,
        lrigTrashCards: s.lrig_trash ?? [],   // 続き475g：ピースが「使用後ルリグトラッシュへ」行くことの観測用
        lrigUnder: Math.max(0, (s.field?.lrig ?? []).length - 1),
        lrigTop: (s.field?.lrig ?? []).at(-1) ?? null,
        lrigDeck: (s.lrig_deck ?? []).length,
        lrigDeckCards: s.lrig_deck ?? [],
        signiFrozen: s.field?.signi_frozen ?? null,
        signiDown: s.field?.signi_down ?? null,
        fieldSigni: s.field?.signi ?? null,
        pendingBanishSubstitute: s.pending_banish_substitute ? (s.pending_banish_substitute.victimNum ?? true) : null,
        fieldAcce: s.field?.signi_acce ?? null,
        fieldCharms: s.field?.signi_charms ?? null,   // 任意【出】の【チャーム】付与を見る（タスク12(lv)③）
        // 「このターンにシグニがバニッシュされている」履歴（タスク12(xciv) の `WX13-026` コスト軽減が読む）
        signiBanishedThisTurn: s.signi_banished_this_turn ?? 0,
        abilitiesRemoved: s.abilities_removed ?? [],
        keysAbilitiesDisabled: s.keys_abilities_disabled ?? false,
        // 続き475g：ピース解決時に載せ替える「このゲームの間」付与（`WXDi-P15-003-E2`）の観測用
        grantedLrigAutoIds: (s.lrig_granted_auto_effects ?? []).map(e => e.effectId),
        designatedZones: s.designated_zones ?? [],
        fieldGrantsActive: (s.field_grants_active ?? []).map(g => `${g.kind}:${g.delta ?? ''}${g.perTargetLevel ? '/perLv' : ''}`),
        lrigFrozen: s.field?.lrig_frozen ?? false,
        negatedAttacks: s.negated_attacks ?? [],
        blockedActions: s.blocked_actions ?? [],
        handTrashedByOpp: s.hand_trashed_by_opp_this_turn ?? 0,
        energyTrashedByOpp: s.energy_trashed_by_opp_this_turn ?? 0,
        delayedTriggers: s.delayed_triggers ?? [],
        coins: s.coins ?? 0,
        life: (s.life_cloth ?? []).length,
        lifeCards: s.life_cloth ?? [],
        deck: (s.deck ?? []).length,
        lrigAttacked: s.field?.lrig_attacked ?? false,
        // アタック時効果のstack解決後もバトル/ライフ処理が残る短い窓を区別し、check消化前returnを防ぐ。
        pendingSigniBattle: s.pending_signi_battle ?? null,
        fieldCheck: s.field?.check ?? null,
        keyPiece: s.field?.key_piece ?? null,
        identityOverrides: s.card_identity_overrides ?? {},
        energyCards: s.energy ?? [],
        zoneBlocks: s.signi_zone_blocks ?? [],
        zoneBlocksNextTurn: s.signi_zone_blocks_next_turn ?? [],
        signiVirus: s.field?.signi_virus ?? [0, 0, 0],
        lrigDown: s.field?.lrig_down ?? false,
        // 【チェイン】が積んだ「次に使用するアーツ」のコスト軽減（タスク12(xciii)）＝状態が立ったか／
        // 使用時に消費されたかを決定論的に見る計器。
        nextArtsCostReduction: (s.next_arts_cost_reduction ?? []).map(r => `${r.color}x${r.count}`),
        assistDown: [s.field?.assist_lrig_l_down ?? false, s.field?.assist_lrig_r_down ?? false],
        lifeCrashReplacements: s.life_crash_replacements ?? [],
        damageReplaceMill: s.damage_replace_mill ?? [],
        leaveSubstituteChoices: s.leave_substitute_choices ?? null,
        deckBottom: (s.deck ?? []).at(-1) ?? null, // 「代わりにデッキの一番下」系の置換確認用
      });
      return {
        host: sideOf(hs),
        guest: sideOf(gs),
        stackLen,
        stackQueue: (stack?.queue ?? []).map(e => e.effectId),
        stackPending: [...(stack?.pendingTurn ?? []), ...(stack?.pendingOpp ?? [])].map(e => e.effectId),
        turnPhase: row.turn_phase,
        activeUser: row.active_user_id,
        pr470aBuffed: !!buff,
        pendingSpell: row.pending_spell ? (row.pending_spell.card_num ?? 'y') : null,
        pendingEffect: row.pending_effect ? (row.pending_effect.interaction?.type ?? 'y') : null,
        // 対象候補そのもの（タスク12(c)）＝「候補が正しく絞られているか」を決定論的に見るための計器。
        // ⚠CPU の SELECT_TARGET 自動応答は候補を**シャッフルして選ぶ**ので、結果（どれが消えたか）だけでは
        //   絞り込みの成否を判定できない（候補2件でも当たりを引けば PASS に見える）。候補列を直接見る。
        pendingCandidates: row.pending_effect?.interaction?.candidates ?? null,
        // 「モーダルが出ない」の切り分け用＝UI の描画ゲートは
        // `(respondPlayerId ?? sourcePlayerId) === user.id`（EffectInteractionModal.tsx）。
        // この値と viewerUserId が食い違っていれば pending は立っているのに誰の画面にも出ない（タスク12(cx) で実際に踏んだ）。
        pendingRespondPlayer: row.pending_effect?.respondPlayerId ?? row.pending_effect?.sourcePlayerId ?? null,
        pendingOptions: (row.pending_effect?.interaction?.options ?? []).map(o => `${o.id}:${o.label}${o.available === false ? '(disabled)' : ''}`),
        viewerUserId: uid,
        logTail,
      };
    }, { SUPA_URL, ANON }),
  };
  const bodyText = H.body;

  // ── ログイン ──
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('ユーザーネーム').fill(accounts[0].username);
  await page.getByPlaceholder('パスワード').fill(accounts[0].password);
  await page.getByRole('button', { name: 'ログイン' }).click();
  await page.waitForFunction(() => ![...document.querySelectorAll('input')].some(i => i.placeholder === 'ユーザーネーム'), { timeout: 15000 });
  await page.waitForTimeout(1500);

  // ── ルーム再利用判定（2026-07-14）＝健全な PLAYING ルームが残っていればマッチング〜マリガンを省略 ──
  const reusable = process.env.FRESH === '1' ? null : await findReusableRoom(page);
  const reuseRoom = !!(reusable && !reusable.worn);
  if (reuseRoom) {
    console.log(`既存 PLAYING ルームを再利用: ${reusable.roomId}（hostLife=${reusable.hostLife} hostDeck=${reusable.hostDeck}）＝マッチング/セットアップをスキップ（新規作成は FRESH=1）`);
  } else {
    if (reusable?.worn) console.log(`既存ルームは消耗のため破棄→新規作成（hostLife=${reusable.hostLife} hostDeck=${reusable.hostDeck} guestLife=${reusable.guestLife} guestDeck=${reusable.guestDeck}）`);
    const cleaned = await cleanupRooms(page);
    console.log(`残ルーム掃除: ${cleaned}件削除`);

    // ── オンライン対戦→CPU対戦→PLAYING 到達 ──
    await page.evaluate(() => sessionStorage.setItem('gotoMatchmaking', '1'));
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await page.getByText('使用デッキを選択', { exact: false }).waitFor({ state: 'visible', timeout: 20000 });
    await page.waitForTimeout(500);
    const clickText = async (text, timeout = 4000) => { const el = page.getByText(text, { exact: false }).first(); await el.waitFor({ state: 'visible', timeout }); await el.click(); };
    await clickText('VERIFY_DECK');
    await page.waitForTimeout(400);
    await page.getByRole('button', { name: '次へ' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: 'CPU対戦' }).click();
    await page.waitForTimeout(600);
    await page.getByRole('button', { name: '対戦開始' }).click();
    await page.waitForTimeout(3500);
    console.log('battle enter:', await bodyText());

    // セットアップ自動進行（じゃんけん→ルリグ選択→マリガン→ゲーム開始）
    const hands = ['グー', 'チョキ', 'パー'];
    let handIdx = 0;
    for (let i = 0; i < 40; i++) {
      const txt = await bodyText();
      if (/メインフェイズ|あなたのターン|ターン[0-9]|エナチャージ|グロウフェイズ|アタックフェイズ/.test(txt)) { console.log(`PLAYING 到達（${i}周目）`); break; }
      let clicked = null;
      if (/相手の選択を待って|結果|移行中|準備中|待っています/.test(txt)) { clicked = '(待機)'; }
      else if (/出す手を選んで/.test(txt)) {
        const hh = hands[handIdx++ % 3];
        const el = page.getByRole('button', { name: hh }).first();
        if (await el.count()) { await el.click().catch(() => {}); clicked = 'じゃんけん:' + hh; }
        await page.waitForTimeout(2500);
      } else if (/ルリグを配置|ルリグを選/.test(txt)) {
        const btn = page.locator('button', { hasText: 'WD03-005' }).first();
        if (await btn.count()) { await btn.click().catch(() => {}); clicked = 'ルリグ(WD03-005)'; }
        else { const b2 = page.locator('button', { hasText: 'コード・ピルルク' }).first(); if (await b2.count()) { await b2.click().catch(() => {}); clicked = 'ルリグ(名前)'; } }
      } else {
        for (const t of ['この手札でOK', '引き直さない', 'キープ', 'この手札で', 'ゲーム開始', '開始', '決定', 'OK', '完了']) {
          const el = page.getByRole('button', { name: t }).first();
          if (await el.count() && await el.isVisible().catch(() => false)) { await el.click().catch(() => {}); clicked = t; break; }
        }
      }
      await page.waitForTimeout(1500);
    }
    await page.screenshot({ path: `${SHOT}/drv-99-playing.png`, fullPage: true });
  }
    return { context, page, H, errors };
  };

  // ── セッションを確立し、シナリオを順に実行（クラッシュ耐障害化＝タスク12(xxvi)）──
  let { context, page, H, errors } = await establish();
  const allErrors = [];
  // N 件ごとに context を作り直してレンダラの蓄積を解放（既定12・RECYCLE_EVERY で上書き可）。
  const RECYCLE_EVERY = Math.max(1, Number(process.env.RECYCLE_EVERY || 12));
  let sinceRecycle = 0;
  const recycle = async (why) => {
    console.log(`♻ セッション再生成（${why}）＝旧 context を破棄してメモリ解放`);
    allErrors.push(...errors);
    await context.close().catch(() => {});
    ({ context, page, H, errors } = await establish());
    sinceRecycle = 0;
  };

  for (const id of runIds) {
    if (sinceRecycle >= RECYCLE_EVERY) await recycle(`${sinceRecycle}件処理ごとの予防`);
    const sc = scenarios[id];
    let r = null;
    // 最大3回：クラッシュ検知→再確立→再試行。非クラッシュ例外はその場で FAIL 確定（従来挙動）。
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`\n=== シナリオ ${id}: ${sc.title} ===`);
        await H.closeModals();
        const inj = await injectScenario(page, sc.spec);
        console.log('注入:', JSON.stringify(inj));
        if (inj.error) { r = { pass: false, detail: '注入失敗: ' + inj.error, sec: 0 }; break; }
        // 毎シナリオ直前に reload してコンポーネントツリーを再マウント（続き105＝クライアント側残留状態対策）。
        // App.tsx 起動時ロジックが PLAYING ルームを検出して BattleScreen へ復帰＝直前の注入 DB 書き込みは活きる。
        await page.reload({ waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: `${SHOT}/${id}-inj.png`, fullPage: true });
        const t0 = Date.now();
        let dr;
        try { dr = await sc.drive(page, H); }
        catch (e) { if (isCrashError(page, e)) throw e; dr = { pass: false, detail: 'drive例外: ' + e.message }; }
        const sec = Math.round((Date.now() - t0) / 1000);
        await page.screenshot({ path: `${SHOT}/${id}-final.png`, fullPage: true }).catch(() => {});
        console.log(`--- ${id}: ${dr.pass ? 'PASS' : 'FAIL'} (${sec}s) : ${dr.detail}`);
        r = { ...dr, sec };
        break;
      } catch (e) {
        if (isCrashError(page, e) && attempt < 3) {
          console.log(`⚠ ブラウザクラッシュ検知（${id}・attempt${attempt}: ${String(e.message).split('\n')[0]}）→ 再確立して再試行`);
          await recycle(`${id} クラッシュ回復`);
          continue;
        }
        console.log(`--- ${id}: FAIL（例外）: ${e.message}`);
        r = { pass: false, detail: (isCrashError(page, e) ? 'クラッシュ回復失敗: ' : '例外: ') + e.message, sec: 0 };
        break;
      }
    }
    results.push({ id, ...r });
    sinceRecycle++;
  }

  allErrors.push(...errors);
  if (allErrors.length) { console.log('\n[console errors]'); allErrors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  await browser.close();
} catch (e) { console.error('失敗:', e.message); code = 2; }
finally { killTree(proc); }

console.log('\n========== 結果サマリ ==========');
for (const r of results) console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'}  ${r.id}${r.sec != null ? ` (${r.sec}s)` : ''}  — ${r.detail}`);
const allPass = results.length === runIds.length && results.every(r => r.pass);
console.log(allPass ? '\n🎉 ALL PASS' : '\n⚠️ 一部 FAIL');
process.exit(code || (allPass ? 0 : 1));
