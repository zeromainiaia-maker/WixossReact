# ブラウザ実機検証ハーネス（verify:browser）

`/verify`（実行時GUI観測）を**認証・Supabase 不要**でヘッドレス代替するための仕組み。
engine（`executeEffect`/`resume*`）＋トリガー収集配線（`triggerCollect`）を**実ブラウザ（Chromium）で**実盤面シナリオに対して駆動し、結果を可視化＋スクショ保存する。

## 使い方
```bash
npm run verify:browser   # dev起動→/verify.html を Chromium で開く→結果取得＋スクショ。exit 0=全PASS
```
- スクショ＝`scratchpad-verify/verify-harness.png`（gitignore 済み）。
- 手動で見る場合は `npm run dev` 後にブラウザで `http://localhost:5173/verify.html`。

## 構成
- `verify.html`（ルート・vite の追加エントリ）＋`src/verify/main.ts`（データfetch→盤面構築→engine駆動→DOM描画）。
- `scripts/verifyBrowser.mjs`（Playwright ドライバ：dev起動・遷移・`window.__verifyResults` 取得・スクショ・終了コード）。
- 盤面ビルダー/オートパイロットは `scripts/goldenTest.ts` を踏襲（同じ run ループ）。

## カバー範囲と限界
- ✅ **カバー**＝engine 実行＋pure なトリガー収集（`collectFieldTriggers` 等）を**ブラウザ runtime** で。BANISH シナリオは収集配線（アタック→any_opp 拾い上げ）も実行。
- ❌ **非カバー**＝`BattleScreen.tsx` の React state 密結合部（`doPhaseAdvance`・pending UI 解決ループ・CPU/realtime 同期）。ここは**ログイン（Supabase 認証）必須**でゲートされており、完全な実機検証には別途以下が要る：
  1. **検証専用 Supabase アカウント**（email/password を env に）＝ゲスト/匿名ログイン無しのため。
  2. **盤面注入フック**（`BattleScreen` に dev 限定で初期 PlayerState を流し込む口）＝特定盤面への決定的到達のため。
  3. 本ドライバ（Playwright）をログイン→CPU戦→注入→効果発火→スクショへ拡張。

現状ハーネスは上記 1・2 が無くても回せる範囲（engine＋収集配線）を実ブラウザで観測する。フル BattleScreen 検証は 1・2 整備後の follow-up。

## シナリオ（現状3件＝今セッション実装分）
1. `SIGNI_GRANT_CHOSEN_ABILITY`（WXK09-050）＝CHOOSE2択でバフ済み＜電機＞にダウン保護付与。
2. `BANISH_ATTACKER_IF_WEAKER_THAN_FRONT`（WD07-012）＝収集配線込み・正面より低パワーのアタッカーをバニッシュ。
3. `CONDITIONAL_GROW_AND_KEY_DISABLE`（WXK02-029）＝条件付きグロウ＋全キー能力喪失。

新シナリオは `src/verify/main.ts` の `scenario*()` を足すだけ（golden と同じ盤面ビルダー）。

---

# フル BattleScreen 実機 driver（verifyBattleDrive.mjs）

上記ハーネスの「非カバー」だった React state 密結合部（実ログイン→CPU戦→盤面注入→効果を**実 UI クリックで発火**→観測）を駆動する別ドライバ。`scripts/verifyBattleDrive.mjs`。**前掲の限界 1・2・3 はすべて達成済み。**

## 実行
```bash
npm run build                      # vite preview は dist/ 配信なので必ず先にビルド
node scripts/verifyBattleDrive.mjs # preview起動→claude1ログイン→CPU戦→PLAYING到達→盤面注入→召喚クリック列→スクショ
```
- 前提：`verify-accounts.json`（claude1/claude2・gitignore済）、`.env.local`（VITE_SUPABASE_URL / ANON_KEY）、デッキ「VERIFY_DECK」（無ければ `scripts/verifySetupDeck.mjs`）。
- ライブ Supabase に rooms/battle_states を作成・削除する（起動時に自分の残ルームを掃除）。数分かかる。
- スクショ＝`scratchpad-verify/inj-play-*.png` / `inj-99-final.png`、ログ各runは `scratchpad-verify/run*.log`。

## 仕組み
1. `startDev()`＝`npm run preview` を spawn（**dev の StrictMode 二重実行で gotoMatchmaking が消える問題を回避**するため本番ビルド配信）。
2. ログイン→オンライン対戦→VERIFY_DECK選択→CPU対戦→じゃんけん→ルリグ選択→マリガン→**PLAYING 到達**。
3. **盤面注入**＝`page.evaluate` で host_state を直接 PATCH（REST・ユーザートークン＝RLS下）。lrig / signi / temp_power_mods / hand / active_user_id / turn_phase を上書き。
4. **召喚クリック列**（下記）を `data-testid` ＋ role=button で安定駆動。

## ✅ 召喚クリック列の安定自動化＝完了（2026-06-30）
**WXK09-050 を実 UI で召喚→【出】CHOOSE①→＜電機＞シグニに「ダウンしない」付与まで完走**。盤面ログ「コードアート Ｒ・Ｍ・Ｎは対戦相手の効果によってダウンしない（ターン終了時まで）」で付与確認。**ピクセル座標依存は全廃。**

実機で確定したクリック列（run7）:
```
フェイズ進行 btn:メインフェイズへ → 手札 tid:my-hand-card-0 → btn:召喚
→ tid:summon-zone-1 → btn:対戦相手の効果によってダウンしない(CHOOSE①)
→ pick:pick-0(対象) → btn:決定 → ✓付与成功を盤面ログで確認→break
```

### 追加した安定セレクタ（React側・通常表示に影響なし）
| testid | 場所 | 注意 |
|---|---|---|
| `my/op-hand-card-{i}` | `BoardComponents.tsx` HandCards | faceDownで自他を区別（相手の裏向き手札も同コンポ＝同testid衝突を回避） |
| `summon-zone-{zi}` | `BattleScreen.tsx` 召喚ゾーン選択ボタン | 占有ゾーンは `disabled`→driverは `isEnabled` で飛ばす（disabled click はタイムアウトする） |
| `pick-{candIdx}` | `BattleScreen.tsx` SELECT_TARGET ピッカー候補 | 選択可能候補のみ付与 |
| `my/op-signi-zone-{rawIdx}` | `BoardComponents.tsx` PlayerField | 盤面シグニ直接クリック用（今回のSELECT_TARGETはピッカー経由なので未使用だが汎用） |

### driver の肝（ハマりどころ）
1. **注入直後はグロウフェイズに戻る競合**（ターン遷移のリアルタイム処理が turn_phase:MAIN を上書き）。→ 手札を開く前に「メインフェイズへ」を最大5回試して **MAIN に確定**させる。
2. **「召喚」はボタン限定で取る**（`getByText('召喚')` だとゾーン選択見出し「**召喚**先のゾーンを選択」に誤マッチして無限ループ）。`getByRole('button',{name:'召喚',exact:true})`。
3. **CHOOSE選択肢もボタン限定**（盤面ログ「…ダウンしない（ターン終了時まで）」への誤マッチ防止）。
4. **ルリグ リミット**：Lv2ルリグ(Limit4)＋既存Lv4シグニ では Lv2召喚が `4+2=6 > 4` で**召喚ボタンが出ない**。注入ルリグを **Lv3 WXK09-018(Limit6)** にして解決（効果対象の＜電機＞WD03-009 Lv4 は power>5000 が必要なので残す）。

## ✅ C2 実機検証 完全クローズ（2026-06-30）
**[[project_effects_verification]] の C2 実機検証を3効果すべて実 UI 発火→観測で完了。** driver は**シナリオ切替式に一般化済み**。

### driver の使い方（一般化後）
```bash
npm run build                              # vite preview は dist/ 配信なので必ず先にビルド
node scripts/verifyBattleDrive.mjs         # 既定の3シナリオを順に実行（wxk09050→wxk02029→wd07012）
node scripts/verifyBattleDrive.mjs wd07012 # 指定シナリオのみ
```
ログイン→PLAYING 到達は**一度だけ**行い、同一 PLAYING ルームへ「盤面注入＋クリック列」をシナリオ単位で適用する。各シナリオは `scenarios` テーブルの `{ title, spec, drive }`：
- `spec.hostSet`/`guestSet`＝ドットパス→値で host_state/guest_state にマージ（例 `'field.signi':[['WD07-012#1'],...]`）。
- `spec.top.active`＝`'host'`（自分ターン）/`'cpu'`（CPUターン＝相手アタック誘発用）。`spec.top.turn_phase` で注入後フェイズ。
- `drive(page, H)`＝クリック列＋観測。`H.findLog(re)` で**実エンジンログ**（CHOOSE選択肢ラベルではなく）を assert する。新シナリオはここに1件足すだけ。

### 検証した効果（生STUB 3＋C1 timing 横展開）
1. `wxk09050`（WXK09-050）＝【出】CHOOSE①でバフ済み＜電機＞に「ダウンしない」付与。ログ「ダウンしない（ターン終了時まで）」。
2. `wxk02029`（WXK02-029 ビカム・ユー）＝アーツをルリグデッキから使用→CHOOSE①＝条件付きグロウ＋全キー能力喪失。ログ「グロウ条件成立（自Lv2≤相手Lv3）→…にグロウ…すべてのキーは能力を失う」。
3. `wd07012`（WD07-012 ヴィマナ）＝CPUターン・ATTACK_SIGNI を注入し**CPUに自動アタックさせ**、自場の WD07-012【自】ON_ATTACK_SIGNI(any_opp) でアタッカーをバニッシュ。ログ「小剣 ククリをバニッシュ（正面より低パワー）」。
4. `lriggrow`（WXDi-P03-039 幻獣神 コッコ・ルピコ）＝**C1 timing `ON_LRIG_GROW` の実機検証**。`free_grow_this_turn` でグロウコスト0化→通常グロウUI（グロウ→グロウ先）→`executeGrow`→`collectLrigGrowTriggers` が watcher を発火→OPTIONAL_COST《無》を払って相手シグニをバニッシュ。ログ「小剣 ククリをバニッシュ」。**＝C1 配線の C2 横展開はこの1件で確立**（同パターンで他 timing も追加可能）。

### このセッションで足した安定セレクタ（通常表示に影響なし）
| testid | 場所 | 用途 |
|---|---|---|
| `my-lrig-dk` | `BoardComponents.tsx` Stat（自分のルリグDKバッジ） | ルリグデッキ ZoneCardModal を開く（相手の同名バッジは非クリックなので testid で自分側を確定） |
| `zone-card-{i}` | `BoardComponents.tsx` ZoneCardModal | ゾーン一覧（ルリグデッキ等）内のカードを開く＝アーツ「使用」へ |
| `optcost-energy-{i}` / `optcost-pay` / `optcost-skip` | `BattleScreen.tsx` OPTIONAL_COST モーダル | 任意コスト（CHOOSE pay/skip）のエナ選択・支払う・スキップ。グロウ等で発火する任意コスト【自】の駆動に汎用 |

> グロウは `free_grow_this_turn:true` を注入するとコスト0化でき、`btn:グロウ`→グロウ先（カード名で取得）の2クリックで `executeGrow` に到達できる（コイン/エナ選択を回避）。コスト系トリガー（ON_LRIG_GROW/ON_COIN_PAID 等）の C2 検証に有用。

### 併せて直した潜在バグ（盤面直接注入のロード漏れ）
`BattleScreen.tsx` の `battleCardNums` が `field.signi`/`check`/`key_piece`/`charms` 等を **instanceId（`CardNum#N`）のまま** Set に入れていたため、base CardNum でフィルタする `battleCardMap` に載らなかった（通常は deck/hand 経由で base が載るので顕在化しなかったが、**デッキ外カードを盤面へ直接注入すると未ロード→パワー0扱いでバニッシュ**された）。これらを `getCardNum` で base 化して登録するよう修正。効果生成シグニのロードも確実になる。回帰：typecheck/golden 95/golden 0FAIL・smoke 全0・fuzz 全0。

### 運用メモ
- 触ったら `npm run typecheck` ＋（engine/BattleScreen を変えたら）`npm run smoke/golden/fuzz`。実機 driver は `npm run build` してから `node scripts/verifyBattleDrive.mjs`。
- スクショは `scratchpad-verify/{シナリオid}-inj.png` / `-final.png` と各手 `{id}-{n}.png`。
