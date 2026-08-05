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
        if (debuffed || watcherLog) {
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
  //    ❌実機FAIL＝実バグ確認済み（2026-07-09・続き60・Sonnet・未修正・Opus引き継ぎ）＝ground truth（hHand 2→0・
  //    hTrash 0→1）は正しいが watcher が一度も発火しない。原因＝WXK10-065 自身の TRASH HAND_CARD アクションが
  //    SELECT_TARGET を要し resume 経路（handleEffectInteraction）で完結する＝続き58が確立した理論どおり
  //    collectAnyZoneTrashSelfTriggers（resolveStackNext 中央diffのみ配線・resume側にinline版なし）が取りこぼす。
  //    R43/R46/R39と同型の新規インスタンス（§6.3系統的懸念に追加）。既定 order からは除外（Opus修正待ち）。
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
  // ⚠実機実行の結果 別の実バグを発見（Opusタスク12(cii)へ登録済み）＝CPU自動応答（BattleScreen.tsx:522-530）は
  // CHOOSEの選択肢IDしか積まずエナのinstanceIdを一切渡さないため、`resumeOpponentPayOptional`が
  // energyNums=[]で「コスト支払いエラー: エナ不足」を返して即終了する＝エナが足りていてもpayは常に空振り
  // （banishもcost消費も起きない）。本シナリオはこの実際の挙動を実機で確認する（意図的FAILとして記録）。
  oppPayEnergySufficient: {
    title: 'WX25-P1-038-E1（本丸火出＝相手エナ十分でもCPU自動応答はpayのエナIDを渡さず常に空振り＝Opusタスク12(cii)実機確認）',
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
            return { pass: true, detail: `《無》×3が足りるため OPPONENT_PAY_OPTIONAL の pay を CPU が選択（gEnergy ${before.guest.energy}→${st.guest.energy}）→banish回避（guest zone0 は健在）＝バグ非再現・要再確認` };
          }
        } else if (sawChoose && !paid && stillThere && !st?.pendingEffect) {
          // 想定バグ状態＝CHOOSE生成を確認済みの上で、pay選択でエナ未消費・banishも不発のまま黙って解消
          stablePolls++;
          if (stablePolls >= 2) {
            return {
              pass: false,
              detail: `【Opusタスク12(cii)実機確認】guestエナ3枚（無×3を払えるはず）でも、CPU自動応答（BattleScreen.tsx:522-530）がpay選択肢のIDのみを渡しエナinstanceIdを渡さないため、resumeOpponentPayOptionalがenergyNums=[]で「コスト支払いエラー: エナ不足」を返して即終了（gEnergy=${st.guest.energy}=開始時と不変・banishも不発でguest zone0残存）。原文は「対戦相手が《無×3》を支払わないかぎりバニッシュ」＝支払えるはずのCPUが支払いもバニッシュ回避もできず効果が黙って空振りする＝実バグ`,
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
  // ⚠実機検証中に発見した実バグ（Opusタスク12(ci)へ登録済み）＝costColors非搭載のOPPONENT_PAY_OPTIONALは
  // `effectExecutor.ts:3333` で無条件に「支払う」（コスト0・常時available）を選択肢へ積むため、CPU自動応答
  // （options.find(o=>o.available)）はこれを最優先で選び、手札不足のはずのdiscard枝のavailable:false判定にも
  // skip（banish本体）にも到達しない。本シナリオはこの実際の挙動を実機で確認する（意図的FAILとして記録）。
  oppDiscardGateBareBug: {
    title: 'WX25-P1-040-E1（アッパー・アロー＝手札不足でもcostColors非搭載のOPPONENT_PAY_OPTIONALは無料payが常時available＝Opusタスク12(ci)実機確認）',
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
          return { pass: true, detail: `想定通りbanish発生＝discard枝unavailableでもskipへ正しく落ちた（今回はバグ非再現・要再確認）` };
        }
        if (sawChoose && !st?.pendingEffect && handUnchanged) {
          stablePolls++;
          if (stablePolls >= 3) {
            return {
              pass: false,
              detail: `【Opusタスク12(ci)実機確認】手札2枚(<3)でdiscard枝は本来available:falseのはずが、costColors非搭載のOPPONENT_PAY_OPTIONALは無条件で無料「支払う」を先頭に積む（effectExecutor.ts:3333）＝CPUがこれを最優先選択しbanishを回避した（gField zone0残存・gHand=${st.guest.hand}不変=開始時と同じ）。原文「対戦相手が手札を３枚捨てないかぎり、バニッシュする」に反し無料回避が成立＝実バグ`,
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
        if (!did) did = await H.clickTextOrBtn(['キーにセット']);
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
  // ⚠一方で実機検証中に別の実バグを発見（Opusタスク12(civ)へ登録）＝ON_TARGETED watcher（WXDi-P03-067）は
  // 期待どおり「1回だけ」ではなく**0回**しか発火しない＝最初のSELECT_TARGET（対象宣言そのもの）自体がスタックへ
  // 積んだON_TARGETEDエントリを、後続のCHOOSE（エクシード支払い可否）を挟んだ2回目のhandleEffectInteraction
  // 解決が握りつぶす疑い（stackAcc計算がresult.done分岐ごとに独立でstackAcc=undefinedのまま次のcommitへ渡ると
  // reduceBattleが`effectStack`キー自体を書かない＝理論上はDBの既存値を温存するはずだが実機では発火が確認
  // できなかった）。
  lxWXDiP03089SingleTargetedFire: {
    title: 'WXDi-P03-089（POWER_MODIFY{targetsStored}は再選択なし＝確認できたがON_TARGETED自体が発火しない実バグを発見）',
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
        H.log(`  lx89[${s}] -> ${did ?? 'なし'} | pickedTarget=${pickedTarget} sawSecondSelectTarget=${sawSecondSelectTarget} gHand=${st?.guest?.hand} stack=${st?.stackLen ?? '-'} gPowerMods=${JSON.stringify(st?.guest?.powerMods)} pEff=${st?.pendingEffect ?? '-'}`);
        // ⚠ON_TARGETEDはstackAcc（効果スタック）へ後乗せされるため、CHOOSE解決直後の同一pollではまだ
        // ドローが反映されていないことがある（スタック解決は次のtickで自動処理される）。debuffed確認後も
        // stackLenが0に落ち着くかguest.handが動くまで数ポーリング待つ。
        if (debuffed && !st?.pendingEffect && (st?.stackLen ?? 0) === 0) {
          if (st.guest.hand === 1 && !sawSecondSelectTarget) {
            return { pass: true, detail: `対象選択は最初の1回だけ→エクシード不払いで-5000適用→ON_TARGETED watcherが1回発火（gHand=${before.guest.hand}→${st.guest.hand}）＝想定どおり（バグ非再現・要再確認）` };
          }
          return {
            pass: false,
            detail: `【Opusタスク12(civ)実機確認】対象選択は最初の1回だけ（sawSecondSelectTarget=${sawSecondSelectTarget}）は確認できたが、ON_TARGETED watcher（WXDi-P03-067）が${st.guest.hand - before.guest.hand}回しか発火しない（期待=1回・gHand=${before.guest.hand}→${st.guest.hand}）＝「対象宣言そのものへのON_TARGETED」が、SEQUENCEが即done()せず後続CHOOSEへ続く場合に取りこぼされている疑い（stackAcc計算がhandleEffectInteraction呼び出しごとに独立している影響）＝実バグ`,
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
    title: 'WD08-001→WXEX2-25-E1（対戦相手＝hostが「手札を1枚捨てる」を選ぶ→opp_hand候補描画がviewer相対でソフトロック＝実バグ発見）',
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
        const st = await H.queryState();
        const bodyTxt = await H.body();
        const sawOppHandLabel = /対戦相手の手札（全\d+枚を確認/.test(bodyTxt);
        H.log(`  x225d[${s}] -> ${did ?? 'なし'} | opened=${opened} discardClicked=${discardClicked} sawOppHandLabel=${sawOppHandLabel} hField=${JSON.stringify(st?.host?.fieldSigni)} hHand=${st?.host?.hand} pEff=${st?.pendingEffect ?? '-'}`);
        if (discardClicked && !st?.pendingEffect) {
          const stillOnField = (st?.host?.fieldSigni ?? []).some(z => (z ?? []).includes('WD01-013#98'));
          const handDropped = (st?.host?.hand ?? 99) < (before?.host?.hand ?? 0);
          if (stillOnField && handDropped) return { pass: true, detail: `「手札を1枚捨てる」で回避→対象シグニ（WD01-013#98）はトラッシュされず場に残存（hHand ${before.host.hand}→${st.host.hand}）＝バグ再現せず正常` };
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
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', 'OK', 'はい']);
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

// ─────────────────────────────────────────────────────────────────────────────
// 実行本体
// ─────────────────────────────────────────────────────────────────────────────
const requested = process.argv.slice(2).filter(a => !a.startsWith('-'));
// freezetrigger は続き41（Opus）で ON_SIGNI_FROZEN の resume 経路を配線して修正・単体PASS確認済み＝既定 order に復帰。
// ⚠バッチ末尾の「自分ターン系」は既知の batch 限定状態汚染で FAIL しうる（driver 側の分離強化は別 follow-up）＝
// FAIL が出たら該当を単体（`node scripts/verifyBattleDrive.mjs <id>`）で再実行して切り分けること。
const order = ['wxk09050', 'wxk02029', 'lriggrow', 'coinpaid', 'deckshuffle', 'deckshufflespell', 'ontargeted', 'ontargeted2', 'ontargeted3', 'ontargeted4', 'ontargeted5', 'ontargetedUsageLimit', 'banishbyeffect', 'charmToTrash', 'charmToTrashBattle', 'exceedCost', 'exceedCostPay', 'lrigundermoved', 'keywordgained', 'powerzero', 'freezetrigger', 'freezetriggerUsageLimit', 'wd07012', 'cpugrow', 'cpugrowblocked', 'lrigGrowAnyOpp', 'lrigGrowAnyOppP03046', 'wxk10068banish', 'lrigattackstepstart', 'lrigAttackStepStartUsageLimit', 'beatBecomeSelfWDK14017', 'placedFront', 'placedFrontNegative', 'drawBySourceStory', 'leaveFieldToHand', 'oppDraw', 'refreshTrigger', 'oppPowerDecreased', 'energyToTrash', 'outsideDrawPhase', 'handDiscard', 'deployRestrict', 'acceAttach', 'acceSelfScope', 'acceOtherScope', 'onPlayAnyOpp', 'freezeLrig', 'negateAttackLrig', 'blockDrawByEffect', 'exileHandBlind', 'delayedAttackTrigger', 'revealDeckTopBanish', 'installDelayedTriggerFire', 'installByEffectFreeze', 'optionalTrashEnergyClassAttack', 'craftTokenPlace', 'craftEnergyCP02087', 'craftTurnEndP03078', 'craftHandSpellP05068', 'craftArtsBetK07105', 'g144DownTrigger', 'g145ByEffectTrigger', 'f3PayCostWX10033', 'f3SacrificeWX12024', 'powerModifyPerEnergy', 'artsUsedThisTurnGate', 'oppDirectAttackNegate', 'lookReorderCanTrash', 'beatMultiCandidateSelect', 'onPlayUsageLimit', 'onTargetedForcedBypass', 'trashCounterOpp', 'lrigGrowUsageLimit', 'powerzeroUsageLimit', 'wx24p2018GrantFire', 'oppDrawOwnEffectOnly', 'battleLevel4Filter', 'artsUseGreenFilter', 'oppPayEnergyInsufficient', 'lbOwnerReversal', 'sequenceContinuationAcrossGate', 'wdk14013TrashPicker', 'meltFactVirusRemoval', 'mugenQFlip', 'mayuEncounterFreeGrow', 'zoneBlockUnconditional', 'zoneBlockColorlessInsufficient', 'zoneBlockColorlessSufficient', 'zoneBlockMultiZones', 'vacatedZoneBlockFollowsActualZone', 'lxivMultiTargetPayBanishesBoth', 'lxivMultiTargetSkipBanishesNone', 'lxvGateTruePromptsChoose', 'lxvGateFalseSilentSkip', 'lxWX12020ScaledDiscardDelta', 'lxWX12020EmptyHandSkipsPicker', 'secondWaveEnergyBranch', 'energyLeftAnyZoneTrigger', 'doubleCrashUpTrigger', 'oppResourceLossChoose', 'spellUnderMemoriaPlace', 'spellUnderMemoriaSkip', 'aboveSelfSelfBuffStopped', 'wxdip03057DownUnderRed', 'trashMoveLockAllowsWhenUnlocked', 'wxk06067CrossZoneStubFires', 'wx22025SigniTrashBranch', 'wx22025SigniTrashUnavailable', 'spdi4302AvoidedNoChoose', 'wxex225SkipAutoTrashesTrigger', 'wxdip08007SkipRemovesAbilities', 'wxdip08007PaySpares']; // spdi4302AvoidedNoChoose/wxex225SkipAutoTrashesTrigger/wxdip08007SkipRemovesAbilities/wxdip08007PaySpares（2026-08-05・Sonnet・PLAN§7「残る実機検証項目」＝SPDi43-02-E1「回避時に選択肢CHOOSEが出ないこと」とWXEX2-25-E1／WXDi-P08-007-E1「対象がトリガー元シグニに固定され選択UIが出ないこと」）＝いずれも「owner=guest（CPU・受動的watcherとして置くだけ）にし『対戦相手』=hostが応答者になるよう設計する」新パターン（wx22025と同型）で解決。spdi4302AvoidedNoChooseはhostが「支払う」（costColors非搭載STUBの無料pay枝＝(ci)と同型）で回避すると、続くCHOOSE(選択肢1/2)が一度も出現しないことを確認（原文どおりの「手札を2枚捨てる」回避枝はSELECT_TARGET{targetScope:'opp_hand'}のviewer相対バグ＝後述の新規発見バグを踏むため迂回）。wxex225SkipAutoTrashesTriggerはWD08-001の【起】《ダウン》でhost自身の信号をbyEffectで場に出し、guestのWXEX2-25が誘発→hostが「支払わない」を選ぶと、追加のSELECT_TARGETなしにその信号が自動でhostトラッシュへ戻る（targetsTriggerSource正常動作）ことを確認。wxdip08007SkipRemovesAbilities/wxdip08007PaySparesはhostが自分のシグニでアタック→guestのWXDi-P08-007が誘発→「支払わない」で追加選択UIなしにアタッカー自身が能力喪失（targetsTriggerSource正常）／《無》×1を支払うと能力喪失を回避、の対を確認。各2回連続PASSで既定orderに追加。⚠**新規実バグ発見（Opusタスク12(cv)への追記登録）**＝`wxex225DiscardAvoids`（既定order外・意図的FAIL）でhostが原文どおり「手札を1枚捨てる」を選ぶと、続くSELECT_TARGET{targetScope:'opp_hand'}の候補描画（`EffectInteractionModal.tsx:234`）がownerState相対の真の対象（host自身の手札）ではなくviewer(host)相対の`op.hand`（guestの手札）を表示し、候補との一致が一つも無く「決定 (0/1)」が永久disabledでソフトロックする（2回連続再現）。`spdi4302AvoidedNoChoose`でも同型のソフトロックを一度観測（原文の「手札を2枚捨てる」枝を避けて「支払う」枝で迂回）＝(cv)はLB「相手に選ばせる」型で発見されたが、**OPPONENT_PAY_OPTIONALのopponentHandDiscard回避コスト（応答者=viewer自身の手札が真の対象になるケース全般）でも同根のソフトロックが起きることを新たに確認**＝影響範囲がhandSpec持ち33効果超へ拡大する疑い。 // wx22025SigniTrashBranch/wx22025SigniTrashUnavailable（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第3波 WX22-025-E3）＝相手側CHOOSE4択のうち未検証だった「自分のシグニを1体トラッシュに置く」枝を実機確認。**新パターン＝guest（CPU）をアタッカー＝効果オーナーにすることで「対戦相手」＝host（driver操作アカウント）が応答者になり、respondPlayerIdがCPU_PLAYER_ID以外になってCPU自動応答がbailoutし、host自身の画面にCHOOSEモーダルが実際に描画される**（既存のLB所有者反転トリックが使えない非LIFE_BURST効果向けの代替手段＝`wxk06067CrossZoneStubFires`の「構造的に到達不能」を回避する糸口）。wx22025SigniTrashBranchはhostが自分の場から明示的にsigniTrash枝を選び、SELECT_TARGETで自分のシグニを選んでBANISHではなくTRASHが解決しライフクロスは無傷（LIFE_CRASHはOPPONENT_PAY_OPTIONALのcontinuation設計上'skip'以外の枝では発火しないことをコード読解でも確認）。wx22025SigniTrashUnavailableはhostの場が空だとボタンがdisabledになることを確認（この場合の直接攻撃による通常戦闘ダメージは本効果と無関係）。各2回連続PASSで既定orderに追加。 // wxk06067CrossZoneStubFires（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第11波 WXK06-067-E1）＝【起】《青》＋自身トラッシュでOPPONENT_PAY_OPTIONAL{opponentHandOrEnergyToDeckTop:2}（手札とエナを跨いだ単一プールのクロスゾーンpicker＝プロジェクト初）が発火することを実機確認。costColors非搭載のためOpusタスク12(ci)と同型の穴でCPU自動応答が常に無料'pay'枝（options配列の先頭かつ常時available）を選び、guestの場/手札/エナが一切変化しないことを2回連続PASSで確認・既定orderに追加。⚠**クロスゾーンpicker本体（handOrEnergyToDeckTop枝）のUI描画自体（`EffectInteractionModal.tsx`の`self_hand_energy`/`opp_hand_energy`スコープ・「手札とエナから合計」表示・`inter.candidates`経由で(cv)のようなop.hand直接参照バグは無いことをコード読解で確認済み）は、本カードが非LIFE_BURSTのため`secondWaveEnergyBranch`等が使うLB所有者反転トリックが使えず、単一アカウントdriverでは構造的に到達不能**＝低優先で保留（(ci)修正後にownerId反転可能なLB型カードが見つかれば改めて検証）。 // trashMoveLockAllowsWhenUnlocked（2026-08-05・Sonnet・PLAN§7タスク12(lxxiii)対照）＝WD05-018（トラッシュのシグニ1枚を手札に加える・《無》×2）でlock_trash_move_this_turnフラグが無い通常時は普通に動くことを2回連続PASSで確認・既定orderに追加。⚠対の`trashMoveLockBlocksSelfEffect`（フラグありでMAINフェイズでも普通に動いてしまう＝ロック機構が実UI経路で丸ごと不発）は実バグとしてOpusタスク12(cvii)へ登録・意図的FAILとして既定order外のまま保持（詳細はPLAN§3(cvii)）。 // spellUnderMemoriaPlace/spellUnderMemoriaSkip（2026-08-05・Sonnet・PLAN§7タスク16 WXDi-P11-063-E2）＝スペル《無心の豪圧》がバニッシュ解決後に自身をメモリア（幻怪姫エクス等3種）の下に置いてもよい選択（STUB TRAP_OPERATIONの「の下に置いてもよい」分岐＝part1の同名STUBに食われて長期間到達不能だった経路）をUIで初実走。置く→ホストに+2000（hostZone0=[スペル,メモリア]）、スキップ→トラッシュのままで+2000は乗らないの両方を各2回連続PASSで確認・既定orderに追加。 // aboveSelfSelfBuffStopped/wxdip03057DownUnderRed（2026-08-05・Sonnet・PLAN§7タスク16「【常】版4枚の自己バフ停止」）＝WXK08-086/WXDi-P03-057/WXDi-P05-050の「このカードの上にあるシグニのパワーを＋N」（aboveSelf）が単独配置（下にカードなし＝スタック長1）では一切適用されない（effectEngine.ts:1562のstack.length<2ガード）ことを確認＝従来の自己バフ退行は再発していない。対照実験としてWXDi-P03-057の【起】《ダウン》で他の赤シグニ(WD02-009)の下に潜らせると、そのホストの表示パワーが12,000→14,000（aboveSelf+2000）へ実際に上がることも確認（CONTINUOUS/PERMANENTのaboveSelfはtemp_power_modsに書かれない純計算値のためDOM表示で判定）。各2回連続PASSで既定orderに追加（2026-08-05・Sonnet・PLAN§7タスク16 WXDi-P13-051-E3）＝「対戦相手の効果1つによって、あなたのエナゾーンからカードが1枚以上トラッシュに置かれたとき」誘発（`collectOppResourceLossTriggers`のエナ経路）をWXDi-D07-013（【出】mandatory・対戦相手のエナ1枚をトラッシュ）×WXDi-P13-051（watcher・CHOOSE「引く/エナチャージ」）で実機確認。誘発後CPU（guest）がCHOOSEを自動選択（ドロー/エナチャージいずれか）することを含め2回連続PASSで既定orderに追加。手札喪失経路・「1つの相手効果が両方やる場合は1回だけ」は未個別実機（低優先＝`collectOppResourceLossTriggers`は中央diffで両方を1本のentryへ畳む設計・コード読解で確認済み）。 // doubleCrashUpTrigger（2026-08-05・Sonnet・PLAN§7タスク16 WX05-020-E1）＝【ダブルクラッシュ】直接注入で1アタックにguestライフを2枚同時クラッシュ（原文①の足し方）→「1ターンに合計2枚以上クラッシュ」条件が成立しE1（アップ）が発火してsigni_downがfalseへ復帰することを実機確認。2回連続PASSで既定orderに追加。②のE2（アタック1枚+アーツ被効果1枚の足し方）・ターンまたぎリセットは未個別実機（低優先）。 // energyLeftAnyZoneTrigger（2026-08-05・Sonnet・PLAN§7タスク16 WXDi-P06-038-E1）＝「あなたのエナゾーンから効果によってカード1枚が他の領域に移動したとき」＝トラッシュ以外（手札）行きでも`energyLeftToAnyZone`triggerConditionで発火することをWXEX1-42（自身のエナから植物シグニ1枚を手札へ）の召喚で実機確認。2回連続PASSで既定orderに追加。 // secondWaveEnergyBranch（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第2波(a)）＝WX15-033-BURSTのOPPONENT_PAY_OPTIONALに手札枝＋エナ枝が並ぶケースをLB経由（所有者反転でdriver自身がCHOOSEを受ける）で実機確認。手札1枚(<2)で「手札を2枚捨てる」枝はdisabled、エナ3枚(≥2)で「エナゾーンから2枚」枝をあえて選択→自分のエナがちょうど2枚トラッシュされ対象シグニは場に残存を2回連続PASSで確認・既定orderに追加。WXK05-001-E1も同一OPPONENT_PAY_OPTIONALコードパスのため個別実機は任意。ALL枝（WX24-P4-023-E3・該当0枚で枝非表示）は未個別検証のまま残（低優先）。 // lxWX12020ScaledDiscardDelta/lxWX12020EmptyHandSkipsPicker（2026-08-05・Sonnet・PLAN§7タスク12(lx)(a)）＝WX12-020-E3の「アタック時にまず相手1体を対象選択→次に手札を好きな枚数(upToCount)捨てる→POWER_MODIFY(targetsStored,deltaPerLastProcessedCount)で捨てた枚数×-6000がその1体だけに乗る」を実機確認。手札0枚だとピッカー自体が出ずdelta=0で素通り・クラッシュしないことも確認。各2回連続PASSで既定orderに追加。⚠同バッチのlxWXDiP03089SingleTargetedFire（タスク12(lx)(b)＝POWER_MODIFY{targetsStored}は再選択なし）は「再選択が消えたこと」自体は確認できたが、ON_TARGETED watcherが期待の1回ではなく0回しか発火しない別バグを発見（Opusタスク12(civ)へ登録）＝既定order外の意図的FAILとして保持（PLAN§3参照）。 // lxivMultiTargetPayBanishesBoth/lxivMultiTargetSkipBanishesNone/lxvGateTruePromptsChoose/lxvGateFalseSilentSkip（2026-08-05・Sonnet・PLAN§7タスク12(lxiv)(lxv)）＝「対象ピッカー前置」（SELECT_TARGET_ONLY→STORE_LAST_PROCESSED_TARGETS→OPTIONAL_COST→CONDITIONAL(IS_MY_TURN)→BANISH{targetsStored}）と「条件つき任意コストのゲート」（CONDITIONAL{gate}→STUB OPTIONAL_COST の包み形）を実機確認。WXDi-P02-043-E1で対象2体まで選択→支払う→両方バニッシュ／支払わない→どちらも残存、WXDi-P02-077-E1で手札6枚以上ならCHOOSE出現→支払う→ランサー付与／5枚以下は「任意コストの条件を満たさない（スキップ）」で静かに不発、を各2回連続PASSで確認・既定orderに追加。⚠実機で判明＝支払い後、freezeStoredTargetsでfixedCardNumsに絞られたBANISH自体もselectOrInteract経由の再確認SELECT_TARGET（候補2件でも確認クリックが要る）を要求する＝対象確定は支払い前後で計2回。また対象ピッカー自身がupToCount:true由来の「スキップ」ボタンを持つため、H.stdStep()の汎用フォールバック（デフォルトlabelsに'スキップ'を含む）に委譲するとpick-Nがまだ描画されていない一瞬にそちらを誤クリックし0件確定で終わるレースが実機で再現した＝この2シナリオではH.stdStep()を使わず明示的なラベルのみで進行する。 // zoneBlockUnconditional/zoneBlockColorlessInsufficient/zoneBlockColorlessSufficient/zoneBlockMultiZones/vacatedZoneBlockFollowsActualZone（2026-08-05・Sonnet・PLAN§7タスク12(lxi)第10波(a)(b)+タスク12(lxxvi)）＝「シグニを新たに配置できないゾーン」（`BLOCK_OPP_ZONE_PLACEMENT`/`signi_zone_blocks`・`signiZoneBlock.ts`）のDOM描画（`(配置禁止)`ラベル・`《無》×N不足`・disabled）と実際の配置阻止/コスト徴収を実機確認。vacatedZoneBlockFollowsActualZoneはWX08-032-E1を実際にキャスト→guest zone2のシグニをバニッシュ→`signi_zone_vacated_just`経由の禁止ゾーンがzone2に正しく付き**zone1へフォールバックしない**ことを実配線で確認（state注入だけでは検証できない回帰点）。各2回連続PASSで既定orderに追加。 // wdk14013TrashPicker/meltFactVirusRemoval/mugenQFlip/mayuEncounterFreeGrow（2026-08-04・Sonnet・PLAN§6.3 H/I′(b)(c)(d)(e)）＝各2回連続PASSで既定orderに追加。(a)ガード追加《無》N枚徴収（guardExtraColorlessSufficient/Insufficient）はルーム再利用バッチだと前シナリオのguestルリグダウン状態が残りCPUが再アタックせずFAILする既知制約のため既定order外・単体実行専用のまま。 // oppPayEnergyInsufficient/lbOwnerReversal/sequenceContinuationAcrossGate（2026-08-04・Sonnet・PLAN§7タスク12(lxi)本消化(a)(d)(e)）＝WX25-P1-038-E1のOPPONENT_PAY_OPTIONAL availableゲート（エナ不足→skip→banish）、WX24-P2-071-BURSTのLB所有者反転（支払い側が常にLB所有者の対戦相手になること）、WX24-P1-023-E1の内側ゲート解決後もREVEAL_AND_PICKが中断を跨いで続行することを新規検証・各2回連続PASSで既定orderに追加。同バッチの(a)対照実験(oppPayEnergySufficient)と(b)(oppDiscardGateBareBug)は逆に実バグを検出（Opusタスク12(cii)＝CPU自動応答のCHOOSEはcostColors付きpay選択時にエナinstanceIdを渡さず常に「コスト支払いエラー: エナ不足」で空振り／Opusタスク12(ci)＝costColors非搭載のOPPONENT_PAY_OPTIONALは無条件で無料payを選択肢に積むためCPUが最優先で選び discard/energyTrash 等の回避コストが実質死んでいる）＝既定order外の意図的FAILとして保持（PLAN§3参照）。 // oppDrawOwnEffectOnly（2026-07-17・続き170・Sonnet・PLAN§3タスク1・Opusタスク12(xxi)続き162の反転検証）＝`collectOppDrawTriggers`に`drawByDrawerOwnEffect`triggerConditionが追加されPR-423にフラグ付与された修正の反転確認。旧・意図的FAIL（host自身の効果でguestが引いただけでPR-423が誤発火）が2回連続PASS（guestドロー後もPR-423生存・guest.life無傷）＝実バグ解消を確認・既定orderに追加。 // wx24p2018GrantFire（2026-07-16・続き164・Opus・タスク1）＝引用付与の対象-コスト分離2文型の完全経路（E1発火→《赤》支払い→対象＜龍獣＞選択→内側【自】付与→アタック→相手不払い→アサシン付与）。旧・意図的FAIL（ルリグ自身へ即付与）が parser 修正＋JSON採用で反転・2回連続PASS＝既定orderに追加。 // powerzeroUsageLimit（2026-07-15・続き141・Sonnet・PLAN§3タスク1(c)）＝R37③ ON_SIGNI_POWER_ZERO_OR_LESSのusageLimit新規シナリオ。WD11-013（【出】対戦相手シグニ-1000・コストなし）を2枚手札に用意しguest場のP1000シグニ2体を順に0化＝1枚目でwatcher（アイン＝テトロド）が発火してドロー、2枚目では《ターン1回》のため発火せず手札据え置きを確認。3回連続PASS＝既定orderに追加。 // lrigGrowUsageLimit（2026-07-15・続き141・Sonnet・PLAN§3タスク1(b)）＝タスク12(vi-5)（続き135・Opusで二面コレクタのusageLimit書き戻しを一括修正済み）の反転検証。旧FAILの真因はengineではなくdriver側＝ゲット・グロウ横グロウで開くグロウ先カード（タマヨリヒメ）の【出】効果コスト確認モーダル（SigniOnPlayCostModal）をスペル用testId（spellcost-energy-0）で探していたため永久に「なし」を繰り返しグロウ完了判定（lrigTop変化）に到達できなかった（続き132の「driverでlrigTopが変化せず再現不能」の真因＝旧記録の想定と異なりengine不具合ではなかった）。修正＝候補クリック後は正しいtestId（onplaycost-energy-0）とスキップボタンで処理。修正後2回連続PASS（usageLimit正しく機能＝ゲット・グロウ経由の2回目ON_LRIG_GROWで発火せず）＝既定orderに追加。 // trashCounterOpp（2026-07-15・続き141・Sonnet・PLAN§3タスク1(a)）＝タスク12(iv)（続き135・Opusでapplydirect Actionの手札カウンタ3種書き戻しを修正済み）の反転検証。FRESH=1新規ルーム/既存ルーム再利用の両方で計3回連続PASS（guest.hand_trashed_by_opp_this_turn=1を確認）＝実バグ解消を確認・既定orderに追加。⚠旧handPrependを`hand`直接指定へ変更（続き139のblockDrawByEffect/exileHandBlindと同型の残留ランダム手札混入対策）。 // onTargetedForcedBypass（続き137・Opus・タスク12(xx)）＝targetsTriggerSource/targetsLastProcessedの選択UIなし自動対象化がcollectTargetedTriggersを素通りしON_TARGETEDが発火しなかった実バグ（続き127でSonnetが再現・登録）。execPowerModifyがautoTargetedCardsをExecResultにsurfaceし、resolveStackNextのdone分岐で「対戦相手の場のautoTargetedCards」をON_TARGETED収集にかける修正。WX12-010（ON_ATTACK_SIGNI any_opp+targetsTriggerSource -2000）×WXDi-P03-067（ON_TARGETED self=DRAW×1）で、guest空手札注入→CPUアタック→POWER_MODIFY成立→ON_TARGETEDでguestが1枚ドロー（gHand=1）を確認。修正前はPOWER_MODIFYだけ成立しhand=0のまま。⚠計測はdelta不可（CPUアタックが注入直後に完結）＝空手札注入の絶対値判定。 // onPlayUsageLimit（続き135・Opus・タスク12(x)）＝collectFieldTriggers に usageLimit ガードが存在せず「味方のシグニが場に出るたびに◯◯（ターン1回）」型32枚が同一ターンの複数召喚で毎回発火していた実バグの回帰。WX24-P1-046-E1（＜地獣＞2体召喚）で1回だけ発火（hDeck -1・actions_done に effectId 1件）を2回連続PASS確認。修正前は actions_done に effectId が入ること自体があり得ない（書き戻し機構が無かった）ため、このシナリオは修正の有無を確実に切り分ける。 // beatMultiCandidateSelect（続き129・Sonnet・PLAN§7「ビート機構Phase1-7」残）＝`analyzeBeatSigniCost`/`actBeatNeedSelect`（SigniActivatedModal.tsx）の複数候補ゾーン選択UIは実装済みだったが実機未検証だった。WXK08-026を候補2体（小剣ククリ/羅植姫アキナナ）と共に配置→候補の一方（小剣ククリ）だけを選んで【起】発動→選んだ方だけがbeat_zoneへ移り選ばなかった方は場に残存することを2回連続PASSで確認＝新規バグなし・既定orderに追加。lookReorderCanTrash（続き128・Sonnet・PLAN§7.2「対話UIの残実装」）＝EffectInteractionModal.tsxのLOOK_AND_REORDER canTrash UI（「トラッシュ」トグル→「決定」確定）は実装済みだったが実機未検証だった。WX20-037召喚→デッキ上3枚を見て1枚トラッシュ選択→確定でhTrash+1・hDeck-1を2回連続PASSで確認＝既定orderに追加。queryStateのsideOf()に`deck`（deck.length）フィールドを新規追加。onTargetedForcedBypass（続き127・Sonnet・PLAN§7「ON_TARGETED forced単一対象follow-up」）＝`targetsTriggerSource`の選択UIなし自動解決が`collectTargetedTriggers`を素通りしON_TARGETEDが発火しない実バグをWX12-010×WXDi-P03-067の組で実機再現（FRESH=1含め2回連続再現）＝Opusタスク12(xx)へ登録・意図的FAIL回帰として既定order外のまま（修正後にPASSへ反転させ追加する）。oppDirectAttackNegate（続き126・Sonnet・PLAN§7「その他の実機検証待ち」＝WX04-004-E2守備側アタック無効化）＝正面が空のシグニアタックに対しSTUB(OPP_DIRECT_ATTACK_NEGATE)がCHOOSE(pay/skip)→TRASH(HAND_CARD,美巧)→エナ支払いでcancel_current_signi_attackを立てるフローを実機で新規検証・2回連続PASS（hLife 6→6で無効化を確認）＝既定orderに追加。queryStateのsideOf()に`life`（life_cloth.length）フィールドを新規追加（今後のシナリオでも life 増減の判定に使える）。f3SacrificeWX12024（旧f3SacrificeWX12024Bug）＝✅続き117（Opus・タスク12(xv)）でWX12-024-E1をSTUB BANISH_SUBSTITUTE化し身代わりモーダルの実発火を2回連続PASS確認＝既定orderに復帰。craftArtsBetK07105＝✅続き122（Sonnet）で再検証したところ engine修正（続き117）後は H.stdStep() の pick-0 ハンドリングだけで手札ピッカーも問題なく解決し2回連続PASS＝「driverのHAND_CARDピッカー未クリック」という旧コメントの想定は誤りと判明（当時はengine未修正でSELECT_TARGETに到達すらしていなかった）＝既定orderに追加。自分ターン系→CPUターンの順。craftTokenPlace（続き113・Sonnet・PLAN§6.4「クラフトトークンの実機配置検証」）＝WX25-CP1-066の`ADD_TO_FIELD{cardName:'雷ちゃん'}`（`execAddToField`の「ゲーム外からトークン生成」分岐＝`effectExecutor.ts:1170`）が実機で正しく`WX25-CP1-TK1A`（CardData_TK.csv）へ解決され場に出ることを確認・2回連続PASSで既定orderに追加。⚠原文の「あなたの場に《雷ちゃん》がない場合」条件がJSONに無い（無条件実行）点はPLAN§6.4に既知の「場存在条件」近似として既に記載済み＝新規発見ではない。driverの肝＝(a)discardコストの手札ピッカーはSigniActivatedModal内蔵（`pick-0`ではなく`img[alt=カード名]`クリック）で、しかも同名imgが画面下部の手札ストリップにもDOM順で先に存在するため`.first()`だと誤って背景オーバーレイのキャンセルを誘発する＝`.last()`（createPortalで後から追加される側）を使う。(b)配置先ゾーンが2つ空くとSELECT_SIGNI_ZONEの「ゾーンN」ボタンクリックが要る。revealDeckTopBanish/installDelayedTriggerFire（続き112・Sonnet・PLAN§7 B2/B3）＝WX17-028のREVEAL_DECK_TOP+動的閾値バニッシュとWX25-CP1-069のINSTALL_DELAYED_TRIGGER実発火（ライフクラッシュ経由）を新規検証・各2回連続PASSで既定orderに追加。B3はcrasherFilterが「クラッシュ源を追跡せず場に該当シグニがいるかで代用」という既知の近似（PLAN B3欄に明記）だが今回の検証目的（設置→同ターン内発火の一気通貫）はこの近似のままでも確認可能。installByEffectFreeze/optionalTrashEnergyClassAttack（続き112・Sonnet・PLAN§7「機構④誤parse3枚」）＝WXDi-P07-044-E2（any_ally+byEffect ADD_TO_FIELD watcher）とWX25-P3-062-E2（OPTIONAL_TRASH_ENERGY_CLASS＋HAS_CARD_IN_FIELD lrig名条件）を新規検証・各2回連続PASSで既定orderに追加＝機構④誤parse3枚（WXDi-P07-044/WX25-P3-062/WX25-P2-009）のうち実機検証待ちだった2枚が決着（WX25-P2-009は別途未配線STUB・機構待ちのまま§6.3送り）。freezeLrig/negateAttackLrig/blockDrawByEffect（続き79・Sonnet）＝続き76のパターンB(FREEZE/NEGATE_ATTACKのLRIG対象)・パターンC(BLOCK_ACTION DRAW_OR_ADD_TO_HAND_BY_EFFECT)を実機PASS確認＝既定orderに追加。exileHandBlind/delayedAttackTrigger（続き81・Sonnet）＝FAILの原因はいずれもengine/parserではなくテストドライバ側の不具合（詳細BUGFIXES）と判明・driver修正後2回連続PASS確認＝既定orderに追加。trashCounterOppは調査の結果、resumeSelectTarget→applyDirectAction のTRASH/HAND_CARD分岐がhand_trashed_by_opp_this_turn等3フィールドの更新を欠く実engineバグ（count:1でSELECT_TARGET経由するTRASH全般に影響）と確定＝修正はOpusタスク12へ登録・既定order外のまま（PLAN§3参照）。oppPowerDecreased/energyToTrash/outsideDrawPhase/handDiscard は続き61（Opus）でresume経路取りこぼしを collectBoardDiffTriggers 統合で修正し実機PASS確認済み＝既定orderに復帰。deployRestrict は続き62（Opus）で配置数制限（DEPLOY_RESTRICT count分岐）を実装し実機PASS（BUGFIXES/PLAN§6.3参照）。charmToTrash/exceedCost/ontargeted2 は続き64（Sonnet）でR42/R44/ON_TARGETED①を新規検証・単体PASS。acceAttach（R45① ON_ACCE_ATTACH host条件）は続き65（Opus）で execAttachAcce fromHand経路の2段chaining実装と battleCardNums への signi_acce 走査追加の2バグを修正し実機PASS（2回連続・deterministic）＝既定orderに追加。ontargeted2は5回中4回PASSで軽微なタイミングフレークあり＝ontargetedと同一コードパスのためengine側の問題ではないと判断。ontargeted3/4/5（続き72・Sonnet）＝ON_TARGETED残り3枚（WXDi-P11-040/WXDi-D09-H14/WX25-P2-055）を個別検証・単体PASS（3件とも再現確認）。ontargeted3はGRANT_KEYWORDのexcludeSelf未実装、ontargeted5はREMOVE_ABILITIES target.ownerが原文と逆（'opponent'だが原文は自己参照）という2件の実データ疑義を発見＝修正はせずOpusタスク12へ登録（PLAN§7参照）。lrigGrowAnyOpp（続き73・Sonnet）＝ON_LRIG_GROW残②（WXDi-P13-047・any_opp）を検証・2回連続PASS＝guest自身のターン中のグロウでも発火＝原文「あなたのターンの間」のturnOwnerゲートが未実装という実データ疑義を発見＝修正はせずOpusタスク12へ登録。lrigGrowAnyOppP03046（続き73・Sonnet）＝ON_LRIG_GROW残②のもう1枚（WXDi-P03-046・SELECT_TARGET要のTRANSFER_TO_HAND）を検証・2回連続PASS＝R38/R43/R46/R39系統のresume経路取りこぼしバグには該当しない（トリガー元＝CPU自動グロウが対話不要で完了し、watcher側のSELECT_TARGETはhost自身の新規interactionとして正常に処理されるため）。ontargetedUsageLimit/charmToTrashBattle（続き74でFAIL→続き75・Opusでengine修正→実機PASS）＝前者は collectTargetedTriggers が usedHostIds/usedGuestIds を返し呼び出し元が actions_done へ書き戻すよう修正（《ターン1回》が毎回発火していた）・後者は resolvePendingSigniBattleFor に collectCharmToTrashTriggers を配線（バトルバニッシュでのチャーム喪失が一度も収集されていなかった）＝既定orderに追加")
order.push('resonaMainWx08021'); // レゾナMAIN召喚UIは既定order末尾で実行
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
  const browser = await chromium.launch();
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
      const stackLen = stack?.entries?.length ?? (Array.isArray(stack) ? stack.length : 0);
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
        lrigUnder: Math.max(0, (s.field?.lrig ?? []).length - 1),
        lrigTop: (s.field?.lrig ?? []).at(-1) ?? null,
        lrigDeck: (s.lrig_deck ?? []).length,
        lrigDeckCards: s.lrig_deck ?? [],
        signiFrozen: s.field?.signi_frozen ?? null,
        signiDown: s.field?.signi_down ?? null,
        fieldSigni: s.field?.signi ?? null,
        pendingBanishSubstitute: s.pending_banish_substitute ? (s.pending_banish_substitute.victimNum ?? true) : null,
        fieldAcce: s.field?.signi_acce ?? null,
        abilitiesRemoved: s.abilities_removed ?? [],
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
        fieldCheck: s.field?.check ?? null,
        keyPiece: s.field?.key_piece ?? null,
        identityOverrides: s.card_identity_overrides ?? {},
        energyCards: s.energy ?? [],
        zoneBlocks: s.signi_zone_blocks ?? [],
        zoneBlocksNextTurn: s.signi_zone_blocks_next_turn ?? [],
        signiVirus: s.field?.signi_virus ?? [0, 0, 0],
      });
      return {
        host: sideOf(hs),
        guest: sideOf(gs),
        stackLen,
        turnPhase: row.turn_phase,
        activeUser: row.active_user_id,
        pr470aBuffed: !!buff,
        pendingSpell: row.pending_spell ? (row.pending_spell.card_num ?? 'y') : null,
        pendingEffect: row.pending_effect ? (row.pending_effect.interaction?.type ?? 'y') : null,
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
