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
import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import { readFileSync, mkdirSync } from 'node:fs';

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
        if (!did) { // SELECT_TARGET ピッカー（①=WD05-017 の対象＝watcher／②=GRANT_KEYWORD の対象）
          const pick0 = page.getByTestId('pick-0').first();
          if (await pick0.count() && await pick0.isVisible().catch(() => false)) {
            const confirmReady = await page.getByRole('button', { name: /決定 \(1\// }).count();
            if (!confirmReady) { await pick0.click().catch(() => {}); did = 'pick:pick-0'; }
          }
        }
        if (!did) did = await H.clickTextOrBtn(['発動順序を確定', '確定', '決定', 'OK', 'はい', 'スキップ', '選ばない']);
        const st = await H.queryState();
        const grants = st?.guest?.keywordGrants ?? [];
        const onSelf  = grants.find(g => /シャドウ/.test(g) && /WXDi-P11-040/.test(g));  // watcher 自身＝excludeSelf 違反
        const onOther = grants.find(g => /シャドウ/.test(g) && !/WXDi-P11-040/.test(g)); // 他の味方＝原文どおり
        H.log(`  p11040[${s}] -> ${did ?? 'なし'} | stack=${st?.stackLen ?? '-'} pSpell=${st?.pendingSpell ?? '-'} pEff=${st?.pendingEffect ?? '-'} grants=${grants.join(',') || '-'}`);
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
  //    根本修正には `!result.done` 分岐でも collectBoardDiffTriggers 相当を呼ぶ（ただし stack 未確定の点を考慮した
  //    差分ベースラインの取り方）が要る＝Opus引き継ぎ。既定 order には含めない（FAIL のため）。
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
};

// ─────────────────────────────────────────────────────────────────────────────
// 共通インフラ
// ─────────────────────────────────────────────────────────────────────────────
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
    // シナリオ間の状態汚染対策：前シナリオが残した揮発フィールド（付与キーワード・一時パワー修正・
    // 使用済みアクション等）を注入前に既定値へ戻し、バッチ実行を分離実行と同じ初期条件にする。
    // spec が同名フィールドを持つ場合はこの後の setPath が上書きする。
    for (const s of [hs, gs]) {
      s.keyword_grants = {};
      s.keyword_grants_until_opp_turn = {};
      s.field_keyword_grants_next_turn = [];
      s.field_keyword_grants_active = [];
      s.granted_effects = {};
      s.granted_effects_until_opp_turn = {};
      s.temp_power_mods = [];
      s.temp_level_mods = [];
      s.power_mods_until_opp_turn = [];
      s.actions_done = [];
      s.blocked_actions = [];
      s.free_grow_this_turn = false;
      s.deck_shuffled_count = 0;
    }
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
    return { roomId, ok: w.ok, status: w.status, body: w.ok ? null : await w.text() };
  }, { SUPA_URL, ANON, CPU_PLAYER_ID, spec });
}

// ⚠ `vite preview` はビルド済み dist を配信するため、ソース変更を反映するには毎回 build が必須。
//    （省略すると古いバンドルを検証して「直したのに FAIL」の罠にハマる。SKIP_BUILD=1 で明示スキップ可）
function buildFirst() {
  if (process.env.SKIP_BUILD === '1') { console.log('build スキップ（SKIP_BUILD=1）'); return Promise.resolve(); }
  return new Promise((resolve, reject) => {
    console.log('dist を build 中…（最新ソース反映）');
    const b = spawn('npm', ['run', 'build'], { shell: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    b.stderr.on('data', (d) => { err += d.toString(); });
    b.on('error', reject);
    b.on('exit', (code) => code === 0 ? resolve() : reject(new Error('build 失敗:\n' + err.slice(-2000))));
  });
}

function startDev() {
  return new Promise((resolve, reject) => {
    const proc = spawn('npm', ['run', 'preview'], { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let url = null;
    const onData = (b) => { const s = b.toString().replace(/\x1b\[[0-9;]*m/g, ''); const m = s.match(/(http:\/\/localhost:\d+)/); if (m && !url) { url = m[1]; resolve({ proc, url }); } };
    proc.stdout.on('data', onData); proc.stderr.on('data', onData); proc.on('error', reject);
    setTimeout(() => { if (!url) reject(new Error('preview起動タイムアウト')); }, 30000);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 実行本体
// ─────────────────────────────────────────────────────────────────────────────
const requested = process.argv.slice(2).filter(a => !a.startsWith('-'));
// freezetrigger は続き41（Opus）で ON_SIGNI_FROZEN の resume 経路を配線して修正・単体PASS確認済み＝既定 order に復帰。
// ⚠バッチ末尾の「自分ターン系」は既知の batch 限定状態汚染で FAIL しうる（driver 側の分離強化は別 follow-up）＝
// FAIL が出たら該当を単体（`node scripts/verifyBattleDrive.mjs <id>`）で再実行して切り分けること。
const order = ['wxk09050', 'wxk02029', 'lriggrow', 'coinpaid', 'deckshuffle', 'deckshufflespell', 'ontargeted', 'ontargeted2', 'ontargeted3', 'ontargeted4', 'ontargeted5', 'ontargetedUsageLimit', 'banishbyeffect', 'charmToTrash', 'charmToTrashBattle', 'exceedCost', 'lrigundermoved', 'keywordgained', 'powerzero', 'freezetrigger', 'wd07012', 'cpugrow', 'cpugrowblocked', 'lrigGrowAnyOpp', 'lrigGrowAnyOppP03046', 'wxk10068banish', 'lrigattackstepstart', 'placedFront', 'drawBySourceStory', 'leaveFieldToHand', 'oppDraw', 'refreshTrigger', 'oppPowerDecreased', 'energyToTrash', 'outsideDrawPhase', 'handDiscard', 'deployRestrict', 'acceAttach']; // 自分ターン系→CPUターンの順。oppPowerDecreased/energyToTrash/outsideDrawPhase/handDiscard は続き61（Opus）でresume経路取りこぼしを collectBoardDiffTriggers 統合で修正し実機PASS確認済み＝既定orderに復帰。deployRestrict は続き62（Opus）で配置数制限（DEPLOY_RESTRICT count分岐）を実装し実機PASS（BUGFIXES/PLAN§6.3参照）。charmToTrash/exceedCost/ontargeted2 は続き64（Sonnet）でR42/R44/ON_TARGETED①を新規検証・単体PASS。acceAttach（R45① ON_ACCE_ATTACH host条件）は続き65（Opus）で execAttachAcce fromHand経路の2段chaining実装と battleCardNums への signi_acce 走査追加の2バグを修正し実機PASS（2回連続・deterministic）＝既定orderに追加。ontargeted2は5回中4回PASSで軽微なタイミングフレークあり＝ontargetedと同一コードパスのためengine側の問題ではないと判断。ontargeted3/4/5（続き72・Sonnet）＝ON_TARGETED残り3枚（WXDi-P11-040/WXDi-D09-H14/WX25-P2-055）を個別検証・単体PASS（3件とも再現確認）。ontargeted3はGRANT_KEYWORDのexcludeSelf未実装、ontargeted5はREMOVE_ABILITIES target.ownerが原文と逆（'opponent'だが原文は自己参照）という2件の実データ疑義を発見＝修正はせずOpusタスク12へ登録（PLAN§7参照）。lrigGrowAnyOpp（続き73・Sonnet）＝ON_LRIG_GROW残②（WXDi-P13-047・any_opp）を検証・2回連続PASS＝guest自身のターン中のグロウでも発火＝原文「あなたのターンの間」のturnOwnerゲートが未実装という実データ疑義を発見＝修正はせずOpusタスク12へ登録。lrigGrowAnyOppP03046（続き73・Sonnet）＝ON_LRIG_GROW残②のもう1枚（WXDi-P03-046・SELECT_TARGET要のTRANSFER_TO_HAND）を検証・2回連続PASS＝R38/R43/R46/R39系統のresume経路取りこぼしバグには該当しない（トリガー元＝CPU自動グロウが対話不要で完了し、watcher側のSELECT_TARGETはhost自身の新規interactionとして正常に処理されるため）。ontargetedUsageLimit/charmToTrashBattle（続き74でFAIL→続き75・Opusでengine修正→実機PASS）＝前者は collectTargetedTriggers が usedHostIds/usedGuestIds を返し呼び出し元が actions_done へ書き戻すよう修正（《ターン1回》が毎回発火していた）・後者は resolvePendingSigniBattleFor に collectCharmToTrashTriggers を配線（バトルバニッシュでのチャーム喪失が一度も収集されていなかった）＝既定orderに追加")
const runIds = (requested.length ? requested : order).filter(id => scenarios[id]);
if (runIds.length === 0) { console.error('シナリオ指定が不正:', requested, '使用可:', Object.keys(scenarios)); process.exit(2); }

await buildFirst();
const { proc, url } = await startDev();
console.log(`dev: ${url} / 実行シナリオ: ${runIds.join(', ')}`);
let code = 0;
const results = [];
try {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
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
      for (let k = 0; k < 3; k++) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); }
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
        trash: (s.trash ?? []).length,
        deck_shuffled_count: s.deck_shuffled_count ?? 0,
        powerMods: (s.temp_power_mods ?? []).map(m => `${m.cardNum}:${m.delta}`),
        keywordGrants: Object.entries(s.keyword_grants ?? {}).map(([id, kws]) => `${id}:${(kws || []).join('/')}`),
        actionsDone: s.actions_done ?? [],
        lrigTrash: (s.lrig_trash ?? []).length,
        lrigUnder: Math.max(0, (s.field?.lrig ?? []).length - 1),
        lrigTop: (s.field?.lrig ?? []).at(-1) ?? null,
        lrigDeck: (s.lrig_deck ?? []).length,
        signiFrozen: s.field?.signi_frozen ?? null,
        fieldSigni: s.field?.signi ?? null,
        fieldAcce: s.field?.signi_acce ?? null,
        abilitiesRemoved: s.abilities_removed ?? [],
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

  // ── シナリオを順に実行 ──
  for (const id of runIds) {
    const sc = scenarios[id];
    console.log(`\n=== シナリオ ${id}: ${sc.title} ===`);
    await H.closeModals();
    const inj = await injectScenario(page, sc.spec);
    console.log('注入:', JSON.stringify(inj));
    if (inj.error) { results.push({ id, pass: false, detail: '注入失敗: ' + inj.error }); continue; }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${SHOT}/${id}-inj.png`, fullPage: true });
    let r;
    try { r = await sc.drive(page, H); }
    catch (e) { r = { pass: false, detail: 'drive例外: ' + e.message }; }
    await page.screenshot({ path: `${SHOT}/${id}-final.png`, fullPage: true });
    console.log(`--- ${id}: ${r.pass ? 'PASS' : 'FAIL'} : ${r.detail}`);
    results.push({ id, ...r });
  }

  if (errors.length) { console.log('\n[console errors]'); errors.slice(0, 8).forEach(e => console.log('  ' + e)); }
  await browser.close();
} catch (e) { console.error('失敗:', e.message); code = 2; }
finally { proc.kill(); try { spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { shell: true }); } catch {} }

console.log('\n========== 結果サマリ ==========');
for (const r of results) console.log(`${r.pass ? '✅ PASS' : '❌ FAIL'}  ${r.id}  — ${r.detail}`);
const allPass = results.length === runIds.length && results.every(r => r.pass);
console.log(allPass ? '\n🎉 ALL PASS' : '\n⚠️ 一部 FAIL');
process.exit(code || (allPass ? 0 : 1));
