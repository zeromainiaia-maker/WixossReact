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
const order = ['wxk09050', 'wxk02029', 'lriggrow', 'coinpaid', 'deckshuffle', 'deckshufflespell', 'wd07012']; // 自分ターン系→CPUターンの順
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
      const r2 = await fetch(`${SUPA_URL}/rest/v1/battle_states?room_id=eq.${roomId}&select=host_state,guest_state,effect_stack,pending_spell,pending_effect,game_logs`, { headers: h });
      const row = (await r2.json())?.[0]; if (!row) return { error: 'no row' };
      const hs = row.host_state ?? {};
      const buff = (hs.temp_power_mods ?? []).find(m => m.cardNum === 'PR-470A#1' && (m.delta ?? 0) >= 5000);
      const stack = row.effect_stack;
      const stackLen = stack?.entries?.length ?? (Array.isArray(stack) ? stack.length : 0);
      const logTail = (row.game_logs ?? []).slice(-25).map(l => [l.action, l.detail].filter(Boolean).join(' '));
      return {
        host: { deck_shuffled_count: hs.deck_shuffled_count ?? 0, hand: (hs.hand ?? []).length, trash: (hs.trash ?? []).length },
        stackLen,
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
