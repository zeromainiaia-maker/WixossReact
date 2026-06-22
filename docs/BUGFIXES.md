# バグ修正記録 (BUGFIXES)

これまでに修正した主要なバグ・系統的修正の記録。新しいものを上に追記する。
設計方針は [DESIGN.md](./DESIGN.md)、未対応の作業は [TODO.md](./TODO.md)。

---

## WX04-071-E1「コストの合計が1以下の赤スペルをサーチ」の総コストフィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「あなたのデッキから**コストの合計が１以下の**赤のスペル１枚を探して…」のサーチ条件が「《赤》のスペル」のみで、総コスト1以下の絞り込みが抜けていた。
- **修正:** `TargetFilter` に `costMax?: number`（使用コスト合計＝《色×N》合計、コイン除外）を新設し、`execUtils.matchesFilter` に実装（`card.Cost` を正規表現で集計）。JSON E1 の filter に `costMax:1` を追加、`manualEffects.ts` に MANUAL 登録、decompile `filterJa` に「コストの合計がN以下の」描画を追加。
- 検証: `npm run typecheck` 通過、lint 0 errors、decompile 再生成で総コスト条件の表示を確認。`execSearch`→`matchesFilter` 経由で候補が正しく絞られる。

## WX04-068-E1「【マルチエナ】を持つエナをトラッシュ」の対象フィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【出】手札を1枚捨てる：対戦相手のエナゾーンから【マルチエナ】を持つカード1枚を対象とし、それをトラッシュに置く。」が target の `filter` 欠落で「対戦相手のエナを1枚トラッシュ」になり、【マルチエナ】限定が抜けていた。
- **修正:** JSON E1 の target に `filter:{keyword:"マルチエナ"}` を追加、`manualEffects.ts` に MANUAL 登録。`execTrash`(ENERGY_CARD)→`energyCandidates`→`matchesFilter` の `keyword:'マルチエナ'`（印字「：【マルチエナ】」/自己 CONTINUOUS 付与ベース）判定で候補が絞られる。
- 検証: `npm run typecheck` 通過、decompile 再生成で「対戦相手の【マルチエナ】を持つエナを1枚トラッシュに置く」表示を確認。

## decompile: trash_self コスト表示の欠落を修正（WX04-066-E1 他）（2026-06-22）

- **症状（ユーザー確認依頼）:** WX04-066-E1「【起】《赤》《赤》このシグニを場からトラッシュに置く：…」の decompile 表示に「このシグニを場からトラッシュに置く」が出ず、他カードも `コスト:{"trash_self":true}` の生 JSON 表示になっていた。
- **原因:** `decompileEffects.ts` の `costJa` が `trash_self` を未対応だった（表示のみの問題。`trash_self` コスト自体は型・パーサ・`BattleScreen`(起動コスト処理) ともに実装済みで機能は正常）。
- **修正:** `costJa` に `trash_self → 'このシグニを場からトラッシュに置く'` を追加し、`docs/decompile_sheet1.txt` を再生成（UTF-8）。WX04-066/069/071/072/091/101・WX05-049/050・WX08-036・WX11-068/069/071 等が正しく表示されるようになった（併せて WX04-059/061/062/063/064 の既修正も反映）。

## WX04-064 ノー・ゲインを正しく実装（アーツ効果耐性＋一時GRANT_PROTECTION配線）（2026-06-22）

- **原文 E1:** 「このターンと対戦相手の次のターンの間、あなたのセンタールリグとあなたのシグニはアーツの効果を受けない。」
- **原文 BURST:** 「次のターンの間、対戦相手はアーツを使用できない。」
- **旧実装の問題:**
  1. E1 の `from` が `["ルリグ","アーツ"]`（「ルリグ」は誤付与。原文は「アーツの効果」のみ）。
  2. E1 の対象が「あなたのすべてのシグニ」のみで**センタールリグが抜けていた**。
  3. E1 の `duration` が `PERMANENT`（正しくは `UNTIL_OPP_TURN_END`＝このターン＋相手の次のターン）。
  4. そもそも**一時付与の GRANT_PROTECTION（ソース種別耐性）を読む箇所が無く、「アーツの効果を受けない」が機能していなかった**（保護キーワードは BANISH/BOUNCE/DOWN 専用しか参照されていなかった）。
  5. BURST の `actionId` が `'ARTS'` だが、アーツ使用ゲートは `isActionBlocked('USE_ARTS')` を見るため**キー不一致で封じが効いていなかった**。
- **修正:**
  - `effectEngine.collectEffectImmuneSigni`: `keyword_grants` / `keyword_grants_until_opp_turn` の `PROTECTION:<種別>:opponent` を読み、解決中アーツ等のソース種別が該当する場の自シグニ／センタールリグを免疫集合へ追加（既存の banish/bounce/down/trash/freeze/power 各保護パスへ union 済み）。これで**全ての一時 GRANT_PROTECTION（ソース種別耐性）が機能**するようになった。
  - `effectExecutor.execGrantProtection`: `UNTIL_OPP_TURN_END` のとき長期ストア `keyword_grants_until_opp_turn`（相手次ターン終了時にクリア）へ付与。`target.type:'LRIG'` をセンタールリグへの付与として処理。
  - `execDown`（LRIG 対象・相手効果）: `ctx.otherEffectImmuneNums` にセンタールリグがあればダウン無効。
  - JSON E1 を SEQUENCE[ GRANT_PROTECTION(シグニ全/アーツ/UNTIL_OPP_TURN_END), GRANT_PROTECTION(ルリグ/アーツ/UNTIL_OPP_TURN_END) ] に修正。BURST の `actionId` を `USE_ARTS` に修正。`manualEffects.ts` に E1・BURST を MANUAL 登録。
- 検証: `npm run typecheck` 通過、lint 0 errors。耐性失効タイミングは「自分の次ターン開始時＝相手の次ターン終了時」クリアで原文「このターンと対戦相手の次のターンの間」と一致。

## WX04-063 ゲット・ゲートを完全実装（支払ったエナの色でデッキサーチ）（2026-06-22）

- **原文:** 「このスペルの使用コストで支払われたエナ１つにつきそのエナの色１つを選択する。あなたのデッキから、選択した色の種類１つにつきその色を持つシグニ１枚を探して公開し手札に加え、デッキをシャッフルする。（無色は色に含まれない）」
- **旧実装の問題:**
  1. `COST_COLOR_SELECT` スタブが**コスト仕様**（《白×1》《無×2》）から色を推定し、無色枠を「全色ワイルド」にしていたため、実際に何色のエナで支払ったかに関わらず最大3色のシグニを取得できてしまっていた。
  2. JSON の action が `SEQUENCE[STUB, SEARCH(任意シグニ1枚)]` で、スタブ処理に加えて**末尾に無条件サーチ1枚**が付き、本来より1枚多く手札に加わっていた。
- **修正（実際に支払ったエナの色を追跡）:**
  - `PendingSpell.paid_energy_colors`（エナ1枚ごとの色配列。マルチエナ=全5色、無色=空配列）を追加し、`castSpell` で支払いエナから算出して記録。`handleCutinPass` で `ExecCtx.paidEnergyColorSets` に渡す。
  - `COST_COLOR_SELECT` スタブを全面改修：支払ったエナの色集合から二部マッチングで「同時に取れる色の種類」最大数を求め、`CHOOSE`（multiSelect・upTo・count=最大色数）で色を選ばせ、色ごとに「その色のシグニ1枚をデッキサーチ→公開→手札→シャッフル」を実行。無色エナは対象外。`paidEnergyColorSets` 未提供時（CPU/旧データ）はコスト仕様からの推定にフォールバック。
  - JSON action を `STUB` 単体に固定（末尾の余分な SEARCH を削除）、`manualEffects.ts` に MANUAL 登録。
- 検証: `npm run typecheck` 通過、lint 0 errors、`genStubsMd.mjs` 再生成。

## WX04-062-E1「＜アーム＞シグニをアップ」の対象フィルタ欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E1「【出】：あなたの＜アーム＞のシグニ１体を対象とし、それをアップする。」が target の `filter` 欠落で「あなたのシグニ1体をアップする」になり、＜アーム＞限定が抜けていた。
- **修正:** JSON E1 の target に `filter:{cardType:シグニ, cardClass:アーム}` を追加、`manualEffects.ts` に MANUAL 登録。`cardClass:アーム` は WX04-056 と同じ engine の `matchesFilter` 対応済みキー。
- 検証: `npm run typecheck` 通過。

## WX04-061-E2「シグニ位置入れ替え」の任意化＋decompile表記修正（2026-06-22）

- **症状（ユーザー確認依頼）:** E2「【出】：あなたのシグニ１体を対象とし、それとこのシグニの場所を入れ替えて**もよい**。」が `mandatory:true`・`optional` 欠落で、decompile も「このシグニと対象シグニの位置を入れ替える」と任意（してもよい）が反映されず、原文と少し違っていた。
- **修正:** JSON の E2 に `optional:true`・`mandatory:false`、`manualEffects.ts` に E2 を MANUAL 登録。decompile の `REARRANGE_SIGNI` swap 分岐を `${target}とこのシグニの場所を入れ替える（してもよい）` に修正。E1（迷宮があるかぎり基本パワー3000）は正しいため変更なし。
- **注:** `swap` 機構自体は `effectExecutor.execRearrangeSigni` で未対応（「シグニ並び替え（未対応の形式）」とログのみ）。今回は原文との表記差＝任意フラグのみ是正。swap 実機構は別課題。
- 検証: `npm run typecheck` 通過。

## WX04-059-E2「赤シグニがあるかぎり基本パワー8000」の発動条件欠落（2026-06-22）

- **症状（ユーザー確認依頼）:** E2「【常】：あなたの場に赤のシグニがあるかぎり、このシグニの基本パワーは8000になる。」が `activeCondition` 欠落で、条件「あなたの場に赤のシグニがあるかぎり、」の後が空（decompile でも条件のみ表示）になっていた。条件を無視して常時 8000 になっていた。
- **修正:** JSON の E2 に `activeCondition`（`HAS_CARD_IN_FIELD` / owner:self / filter:{cardType:シグニ, color:赤}）を追加。E1（赤シグニ全体に +2000）は元から正しいため変更なし。
- 検証: `HAS_CARD_IN_FIELD` は `effectEngine.ts` / `execUtils.ts` の `checkActiveCondition` で対応済み。JSON パース確認済み。

## WX04-058-E2「自分のシグニ再配置」の任意化（2026-06-22）

- **症状（ユーザー確認依頼）:** E2「【出】：あなたのすべてのシグニを好きなように配置し直して**もよい**」が `mandatory:true`・`optional` 欠落で、任意（してもよい）になっていなかった。
- **確認結果:** 再配置の本体（`REARRANGE_SIGNI` / `execRearrangeSigni` / `resumeRearrangeSigni` / 再配置モーダル）は WX04-041-E2 実装時から **owner:'self' にも対応済み**（owner で対象フィールドを切替）。不足は JSON の任意フラグのみ。
- **修正:** JSON に `optional:true`・`mandatory:false` を設定、`manualEffects.ts` に E2 を MANUAL 登録。E1（POWER_SET 基本パワー7000）は元から正しいため変更なし。
- 検証: owner:'self' の `REARRANGE_SIGNI` が pending（owner:self, optional:true）を返し、`resumeRearrangeSigni` で自分フィールドが並び替わることをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。decompile「あなたのすべてのシグニを好きなように配置し直す（してもよい）」＝原文一致。

## WX04-056-E1「他の＜アーム＞ +2000」修正・effectEngine matchesFilter の cardClass 対応（2026-06-22）

- **症状（ユーザー報告）:** E1「【常】あなたの**他の＜アーム＞**のシグニのパワーを＋2000」が `POWER_MODIFY target {owner:'any', count:1}` という**全くの別物**（「自分または対戦相手のシグニ1体 +2000」）。
- **修正:**
  - JSON を `target {owner:'self', count:'ALL', filter:{cardType:シグニ, cardClass:'アーム', excludeSelf:true}}, delta:2000, excludeSelf:true` に修正。`manualEffects.ts` に MANUAL 登録。
  - **根本修正:** `effectEngine.ts` の `matchesFilter` が **`cardClass`/`cardClassExclude` を処理していなかった**（`story` のみ対応＝execUtils 版と非対称）。`cardClass` を追加し、CONTINUOUS パワー計算（calcFieldPowers）等でクラスフィルタが効くように。これがないと `cardClass:'アーム'` が無視され全シグニに +2000 されていた（テストで ウェポンが誤って+2000 を確認→修正後は他アームのみ）。
  - 検証: 自身アーム=+0、他アーム=+2000、ウェポン=+0 をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。
- 補足: CONTINUOUS パワー系で従来クラス指定に `story` を使っていた（effectEngine matchesFilter が story のみ対応だった）のは、この非対称が原因。今後はクラスに `cardClass` を使える。

## 【マルチエナ】逆翻訳の一貫性（未登録19枚へ効果追加・パーサー修正）（2026-06-22）

- **症状（ユーザー指摘）:** WX04-054 など18枚は effects.json に【マルチエナ】効果を持ち逆翻訳に出るが、ガード・サーバント系の約19枚（WD01-016/017・WD04-016/017・WX01-051/100・WX02-077/078・WX10-097〜100・WXDi-D01-020/D03-020・WXK01-119〜122・WXK05-030）はテキストのみで逆翻訳に出ない不整合。WX04-054 が例外に見えた。
- **原因:** `parseSentencePart4` の【マルチエナ】判定が `RULE_REMINDER_TEXT`（no-op）で、かつ括弧の補足「【マルチエナ】（…）」にマッチしていなかった。機能面は `isMultiEna` の EffectText フォールバックで全カード正常だが、逆翻訳（effects.json直読み）に差が出ていた。
- **修正:**
  - パーサー: `parseSentencePart4` の【マルチエナ】を `GRANT_KEYWORD(マルチエナ, thisCardOnly)` に変更し、`（…）` 補足付きも許容。
  - 未登録19枚を `manualEffects.ts` に【マルチエナ】CONTINUOUS（`thisCardOnly`）として登録（runtime の `buildEffectsMap` は manualEffects を常にマージ）。
  - decompile（`decompileEffects.ts`）が `mergeManualEffects` をマージするよう変更し、逆翻訳が runtime と同じ effects を反映。
  - decompile の `GRANT_KEYWORD(thisCardOnly)` は「このシグニは【X】を持つ」。
  - 全マルチエナカードが逆翻訳で一貫表示。`npm run typecheck` 通過、`npm run verify` サマリー不変、`decompile_sheet1` 差分は当該行のみ（他カードへの波及なし）。

## WX04-054「サーバント X」E1フィルタ欠落・E2マルチエナ修正（2026-06-22）

- **症状（ユーザー報告）:** E1が「カード名に《サーバント》を含むあなたの他のシグニの」になっていない／E2が誤り。
  - **E1【常】**「カード名に《サーバント》を含む**他の**自シグニのパワー+3000」が、`filter:{cardType:シグニ}` のみで**全自シグニ +3000**（cardName/他の が欠落）。
  - **E2【常】**「【マルチエナ】」（このシグニ自身が持つ）が `GRANT_KEYWORD target count:1`（場の任意シグニに付与）で意味が誤り。
- **修正:**
  - E1: filter に `cardName:'サーバント'`、action/filter に `excludeSelf:true` を追加（`applyDeltaToState` は action.excludeSelf で効果元を除外、filterJa は filter.excludeSelf で「他の」を表示）。
  - E2: target を `filter:{thisCardOnly:true}` に（このシグニ自身の【マルチエナ】）。`isMultiEna` は `GRANT_KEYWORD マルチエナ` の `count!=='ALL'` で自身マルチエナを検出するため機能継続。decompile の `GRANT_KEYWORD(thisCardOnly)` を「このシグニは【X】を持つ」に改善。
  - E3（《サーバント》検索）はパーサー結果が正しいため変更なし。JSON＋`manualEffects.ts` に E1/E2 を MANUAL 登録。
  - 検証: 自身は+0、他《サーバント》は+3000、非サーバントは+0 をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-052「堕落の虚無 パイモン」3効果の実装（チャーム盾ほか）（2026-06-22）

- **症状（ユーザー報告）:** 3効果すべて誤り。
  - **E1【常】**「＜悪魔＞シグニがバニッシュされる場合、代わりに付いている【チャーム】1枚をトラッシュしてもよい」（チャーム盾）が `CHARM_PROTECTION` STUB のみで**どのバニッシュ経路でも消費されず no-op**。
  - **E2【出】**「デッキトップを**このシグニ**の【チャーム】にしてもよい」が、`ATTACH_CHARM` の `to` が任意自シグニ（`toCands[0]`）で**このシグニを狙えず**、かつ「してもよい」（任意）未対応。
  - **BURST**「トラッシュから**＜悪魔＞の**シグニ1枚を手札へ」が ＜悪魔＞ フィルタ欠落。
- **修正:**
  - **E1（チャーム盾）:** `collectCharmShieldSigni`（effectEngine）を新設＝CONTINUOUS `CHARM_PROTECTION` の signiFilter に一致し**チャーム付き**のシグニ集合を返す。`ctx.charmShieldNums` 経由で **効果バニッシュ（execBanish applyBanish）**＝チャーム1枚トラッシュで場に残す、**バトルバニッシュ**＝`COOKING_BANISH_SUBSTITUTE` と同型の自動代替分岐を追加。BattleScreen ctx で両プレイヤー分を計算。
  - **E2:** `execAttachCharm` が `to.filter.thisCardOnly`（効果元シグニ自身）と `optional`（付ける/付けないの CHOOSE）に対応。
  - **BURST:** `TRANSFER_TO_HAND` の filter に `story:'悪魔'` を追加。
  - JSON＋`manualEffects.ts` に3効果を MANUAL 登録。decompile に `CHARM_PROTECTION`／`ATTACH_CHARM` の和文化を追加。
  - 検証: 効果バニッシュ／バトルでチャーム盾が発動（チャーム→トラッシュ・シグニ残存）、`collectCharmShieldSigni` が悪魔かつチャーム有のみ返す、`ATTACH_CHARM(thisCardOnly)` が効果元に付く、をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-050-E1「めくれるまで公開→手札→残りデッキ下」の実装（REVEAL_UNTIL_TO_HAND）（2026-06-22）

- **症状（ユーザー報告）:** E1「【起】《ダウン》：デッキを上から＜美巧＞のシグニがめくれるまで公開→そのシグニを手札に加え、公開した他のカードをシャッフルしてデッキの一番下に置く」が誤実装。
- **原因:** `SEQUENCE[STUB:DECK_REVEAL_UNTIL_CLASS, TRANSFER_TO_DECK(self signi)]`。STUB は公開と `lastProcessedCards` 設定のみで**ヒットシグニを手札に加えず**、「残り」の行き先テキスト（"残り…"）にも一致しないため**公開カードがデッキから除去されたまま消失**。2ステップ目も誤パース。
- **修正:**
  - 新アクション `REVEAL_UNTIL_TO_HAND`（owner / revealClass / restDest）を追加。`execRevealUntilToHand`: デッキ上から `revealClass` のシグニがめくれるまで公開→**ヒットを手札へ**、公開した他のカードを `restDest`（`deck_bottom_shuffled` / `deck_bottom` / `trash`）へ。該当なしならデッキをシャッフル。
  - JSON を `REVEAL_UNTIL_TO_HAND(revealClass:'美巧', restDest:'deck_bottom_shuffled')` に修正、`manualEffects.ts` に MANUAL 登録。decompile に和文化追加。
  - 検証: 公開列 [電機,スペル,美巧,…] で美巧を手札へ・残り（電機/スペル）をデッキ下、未公開は先頭維持をテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-049-E1「基本レベルは2になる」の実装（SET_BASE_LEVEL）（2026-06-22）

- **症状（ユーザー報告）:** E1「【常】場に他の＜空獣＞か＜地獣＞があるかぎり、このシグニの基本レベルは2になる」が誤実装。パーサーが「基本レベルはNになる」を `BLOCK_ACTION(actionId:'SET_LEVEL_2')` に変換していたが、**エンジンで一切消費されず no-op**（基本レベルが実際に2にならない）。decompileも「『SET_LEVEL_2』ことができない」と誤表示。
- **修正:**
  - 新アクション `SET_BASE_LEVEL`（CONTINUOUS。target/value）を追加。
  - `applyContinuousBaseLevelOverride`（effectEngine）: 両プレイヤーの場のシグニを走査し、条件を満たす `SET_BASE_LEVEL` 効果元の **`cardMap` の Level を直接上書き**。これで `matchesFilter` のレベルフィルタ等、全レベル参照（レベル指定の除去/対象など）に自動反映。`applyDeclaredZoneClassOverride` と同じ cardMap オーバーライド方式（45箇所ある `fieldCandidates` への引数追加を回避）。
  - BattleScreen の全 `declaredCardMap` 生成箇所（8箇所＝効果解決/各インタラクション/スペル/カットイン）でチェーン適用。
  - **手札のシグニは上書き対象外**（場のシグニのみ走査）なので「場に出るまでレベル3」＝センタールリグLv2では場に出せない、という原文の挙動も維持。
  - JSON は `SET_BASE_LEVEL` に修正、`manualEffects.ts` に E1 を MANUAL 登録。decompile に `SET_BASE_LEVEL`／`POWER_DOUBLE_ALL`（E2）の和文化を追加。
  - 検証: 他＜地獣＞があると Level 3→2、無いと 3 のままをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-047-E1 逆翻訳（DISCARD_OR_PENALTY）の正確化（2026-06-22）

- **症状（ユーザー報告）:** E1の逆翻訳が `[STUB:DISCARD_OR_PENALTY: …汎用説明]` で原文「あなたは手札から＜原子＞のシグニを1枚捨てないかぎり手札を2枚捨てる」を表していなかった。
- **修正（decompile表示のみ）:** `decompileEffects.ts` に出力ループでカード原文を `currentCardText` に保持する仕組みを追加し、STUB `DISCARD_OR_PENALTY` を原文から「＜クラス＞/種別を1枚捨てないかぎり手札をN枚捨てる」へ復元して和文化。エンジンの `DISCARD_OR_PENALTY` 実装（原文からクラス/枚数を読み CHOOSE を提示）は元から正しく、ロジック変更なし・JSON変更なし。
- 逆翻訳：「〈《ダウン》〉あなたのカードを2枚引く。そしてあなたは手札から＜原子＞のシグニを1枚捨てないかぎり手札を2枚捨てる」＝原文一致。

## WX04-046-E1 リムーブ封じ（SELF_SIGNI_TRASH）のUI enforcement（2026-06-22）

- **症状（ユーザー報告）:** E1「【常】対戦相手は、カードの効果を除き、自分で自分のシグニを場からトラッシュに置くことができない」が**リムーブボタンに反映されていない**。押すと普通にリムーブできてしまう。押下時に「効果でブロック中」と警告を出したい。
- **原因:** JSON は正しく `BLOCK_ACTION(actionId:'SELF_SIGNI_TRASH', target:opponent)` で、`calcContinuousBlockedActions` も相手フィールドの当効果を**影響を受ける側の `forSelf`** に入れていた（＝`isActionBlocked('SELF_SIGNI_TRASH')` は true になる）。しかし**リムーブボタン／`handleRemove` がこのブロックを参照していなかった**。
- **修正:**
  - リムーブボタン押下時に `isActionBlocked('SELF_SIGNI_TRASH')` をチェックし、ブロック中なら**警告モーダル**（「⚠ リムーブできません」）を表示してモーダルを開かない。`handleRemove` にも保険ガード追加。
  - 「カードの効果を除き」はルール処理のリムーブ（`handleRemove`）のみを塞ぐことで自然に満たす（カード効果のトラッシュは `execTrash` 等の別経路で影響なし）。
  - JSON 変更不要（効果定義は元から正しい。enforcement 漏れのみ）。decompile の `BLOCK_ACTION` 和文化を改善（`SELF_SIGNI_TRASH`→「カードの効果を除き、自分で自分のシグニを場からトラッシュに置く（リムーブ）」等）。
  - 検証: 相手が当カードを持つとき影響側の `forSelf` に `SELF_SIGNI_TRASH` が入ることをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-043-E1「羅石 黒曜」コスト欠落・両者バニッシュ修正（2026-06-22）

- **症状（ユーザー報告）:** E1「【起】《赤》《赤》＜鉱石＞か＜宝石＞のシグニを合計3体場からトラッシュ：すべてのシグニをバニッシュする」で、①**コストの「＜鉱石＞／＜宝石＞3体トラッシュ」が欠落**、②「すべてのシグニ」（両者）が `owner:'any'` になっていた（`execBanish` は `'any'` を相手のみと解釈し、自分のシグニがバニッシュされない誤り）。
- **修正:**
  - コストに `fieldTrash: { count:3, filter:{cardType:シグニ, story:['鉱石','宝石']} }`（story配列＝OR、混在3体）を追加。
  - アクションを `SEQUENCE[BANISH self ALL, BANISH opponent ALL]` に変更（「すべてのシグニ」＝両者を確実にバニッシュ）。
  - decompile: `targetJa` の `owner:'any'` レンダリングを **count='ALL' のときは主語省略（「すべてのシグニ」）**、単体選択時のみ「自分または対戦相手の」に修正（先の owner:'any' 対応の副作用だった「自分または対戦相手のすべてのシグニ」を是正）。
  - JSON＋`manualEffects.ts` に MANUAL 登録。検証: 自分2体＋相手1体が全てエナへバニッシュされることをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-041-E2「シグニ再配置」UIの実装（2026-06-22）

- **症状（ユーザー報告）:** WX04-041-E2「対戦相手のすべてのシグニを好きなように配置し直してもよい」の**再配置UIが未実装**。エンジンの `REARRANGE_SIGNI` は `done(addLog('…BattleScreen側で処理'))` のログのみで、BattleScreen に処理が存在せず**何も起きない no-op**だった。また `mandatory:true`（原文は「もよい」＝任意）。
- **修正:**
  - `PendingInteractionDef` に `REARRANGE_SIGNI`（owner / signiNums / optional）を追加。`RearrangeSigniAction.optional` を追加。
  - エンジン `execRearrangeSigni`（count:'ALL'、swap以外）: 対象オーナーのシグニを集めて配置選択の pending を返す（1体以下はスキップ）。`resumeRearrangeSigni`: `newArrangement[newZone]=instance id` を受け、**ゾーン状態（スタック/ダウン/凍結/チャーム/アクセ/ソウル/武装/ウィルス）ごと**新ゾーンへ並び替え（順列適用）。
  - BattleScreen: 各シグニにゾーン1/2/3を割り当てる**再配置モーダル**（新配置プレビュー付き）、確定/「配置し直さない」（optional）ハンドラ `handleRearrangeSigniConfirm`、CPU自動応答（現状維持で確定）。
  - JSON は `optional:true`/`mandatory:false` に修正、`manualEffects.ts` に MANUAL 登録。decompile の `REARRANGE_SIGNI` 和文化を「好きなように配置し直す（してもよい）」に改善。
  - 検証: 3体（A/B/C、Bダウン）を [C,A,B] へ並び替え→ゾーンとダウン状態が正しく追従することをテストで確認。`npm run typecheck` 通過、`npm run verify` フラグなし・サマリー不変。

## WX04-040「極壊 ハンマ」3効果修正・fieldTrashGroups コスト新設（2026-06-22）

- **症状（ユーザー報告）:** WX04-040 の効果が誤り。
  - **E1【常】**「場に＜ウェポン＞がある**かぎり**基本パワー15000」→ activeCondition 欠落で常時15000だった。
  - **E2【起】**コスト「＜アーム＞1体**と**＜ウェポン＞1体を場からトラッシュ」→ ＜ウェポン＞1体のみ（＜アーム＞欠落）。
  - **BURST**「手札から＜アーム＞1枚**と**＜ウェポン＞1枚を捨てる。そうした場合、相手シグニ1体を**手札に戻し**、相手シグニ1体を**バニッシュ**」→ 1枚捨て＋バニッシュのみ（バウンス欠落・組指定なし）。
- **修正:**
  - E1: `activeCondition: HAS_CARD_IN_FIELD(self, ＜ウェポン＞)` を追加。
  - E2: **`EffectCost.fieldTrashGroups`（異クラスの場シグニを組指定）を新設**。`{＜アーム＞×1, ＜ウェポン＞×1}`。支払可否（`fieldTrashGroupsAffordable`）と選択検証（`fieldTrashGroupsSatisfied`）を BattleScreen に追加し、【起】コストUIの選択肢・確定可否をグループ対応。支払い（ゾーントラッシュ）はグループ非依存のため既存処理を流用。
  - BURST: `CONDITIONAL(AND[手札に＜アーム＞≥1, 手札に＜ウェポン＞≥1]) → SEQUENCE[＜アーム＞捨て, ＜ウェポン＞捨て, 相手バウンス, 相手バニッシュ]`（コスト付きLIFE_BURSTは0件のためアクションで「捨てて、そうした場合」を表現）。
  - JSON＋`manualEffects.ts` に MANUAL 登録。`costJa` に `fieldTrashGroups` の和文化追加。`npm run typecheck` 通過、`npm run verify` で WX04-040 フラグなし・サマリー不変。decompile再生成で3効果とも原文一致。

## WX04-038「バイオレンス・スプラッシュ」E1の複雑効果実装・BURST修正（2026-06-22）

- **症状（ユーザー報告）:** E1が複雑効果で未実装、BURSTも原文と相違。
- **E1（スペル。このターン継続2効果）:**
  - 原文①「パワーが0以下のシグニがバニッシュされる場合、エナの代わりにトラッシュ」（**所有者問わず**）／②「あなたのシグニの効果で対戦相手のシグニのパワーが－される場合、代わりに2倍－される」。
  - 修正前は ①が `BANISH_REDIRECT`（owner:self・パワー条件なし＝「対戦相手シグニ全部トラッシュ」相当の誤り）、②が未実装 STUB（`DOUBLE_POWER_MINUS` はフィールド常在シグニ用でスペルでは無効）。
  - 実装: PlayerState に `power0_banish_to_trash` / `double_power_minus_this_turn`（このターン）を新設。
    - ①: STUB `BANISH_REDIRECT_POWER0_TRASH` でフラグ設定 → `checkPowerZeroBanish`（パワー0以下バニッシュ処理）で、いずれかのプレイヤーがこのフラグを持つときトラッシュへリダイレクト。
    - ②: STUB `DOUBLE_POWER_MINUS_THIS_TURN` でフラグ設定 → `calcFieldPowers` が CONTINUOUS 負デルタ（`hasDoublePowerMinus`）と一時 `temp_power_mods` 負デルタ（`applyTempMods` の `doubleNeg`）の両方を、相手がフラグ所持時に2倍。
    - **「あなたのシグニの効果で」の正確化（発生元種別を保持）:** `temp_power_mods`/`power_mods_until_opp_turn` に **`srcType`（発生元カードの Type 文字列：'シグニ'/'スペル'/'アーツ'/'ルリグ' 等）** を保持。汎用 `POWER_MODIFY` 経路（`execPowerModify`/`applyDirectAction`）が `ctx.sourceCardNum` の Type を `srcTypeOf()` で記録。`applyTempMods` は発生元がシグニ（レゾナ含む。未設定はシグニ扱い）のときのみ倍化。CONTINUOUS 側は発生元カード `topNum` がシグニのときのみ倍化（`dblOtherMult`）。スペル/アーツ/ルリグ由来は倍化しない。
      - **二値ではなく種別文字列で保持**したため、今後「アーツの効果で」「ルリグの効果で」「スペルの効果で」を参照する効果は `mod.srcType.includes('アーツ')` 等で判定できる（拡張性確保）。
    - 両フラグはターン終了時クリア（3箇所のリセット集約に追加）。
  - 検証: フラグ設定／相手シグニ -2000 が -4000（5000→1000）になることをテストで確認。
- **BURST:** 原文「トラッシュから**黒の**シグニ1枚を対象とし、**手札に加えるか場に出す**」に対し、修正前は黒フィルタ欠落＋手札固定。`CHOOSE`（手札に加える `TRANSFER_TO_HAND` ／場に出す `ADD_TO_FIELD`、ともに `filter:{cardType:シグニ,color:黒}`）に修正。場出しは [[（applyDirectAction の ADD_TO_FIELD 修正）]] によりゾーン選択＋トラッシュ除去。
- JSON と `manualEffects.ts` に MANUAL 登録。decompile の STUB 2種に和文化を追加（`[STUB:...]` ではなく原文相当の自然文）。`npm run typecheck` 通過、`npm run verify` で WX04-038 フラグなし・サマリー不変。

## POWER_MODIFY owner:'any'（「対象のシグニ」）の両フィールド対象選択を実装（2026-06-22）

- **症状（ユーザー報告）:** WX04-037-BURST「対象のシグニ1体のパワーを－10000」など、**owner:'any'（「対象のシグニ」＝自分・相手どちらも選べる）の対象選択UIが機能していない**。
- **根本原因:** `execPowerModify` と `applyDirectAction(POWER_MODIFY)` が `owner:'any'` を一律 `'self'` に潰しており、候補・選択スコープが**自分フィールドのみ**。相手シグニを選べず、相手シグニへの適用先も誤っていた（237カードが該当）。
- **修正:**
  - `TargetScope` に `'both_field'` を追加。
  - `execPowerModify`: `owner:'any'` のとき自分＋相手両フィールドから候補収集し `scope:'both_field'`。マイナス時は相手側の完全効果耐性シグニ（[[project_effect_system]] の `otherEffectImmuneNums`）を除外。`applyPowerMod` は対象ごとに所属フィールドを判定して該当プレイヤーへ適用。
  - `applyDirectAction(POWER_MODIFY)`: 選ばれたカードの所属フィールドを判定して該当プレイヤーへ適用（`duration` による `power_mods_until_opp_turn` も考慮）。
  - `selectOrInteract`: `both_field` でも**相手側候補にはシャドウ**を適用（自分側は常に選択可）。
  - BattleScreen 選択モーダル: `both_field` の説明文と、候補ごとに「自分の/相手の ゾーンN」を表示。
  - 検証: 最小状態テストで両フィールド候補（A自分/B相手）が出ること・相手B選択で otherState に -10000 が入ることを確認。`npm run typecheck` 通過。

## WX04-037「フィア＝リカブト」E2修正・decompile和文化の改善（2026-06-22）

- **症状（ユーザー報告）:** WX04-037 の逆翻訳が不正確。E1「FIELD数に応じて」が曖昧、E2が誤実装、BURSTのマイナス対象が自分/相手どちらか不明。
- **E2 のロジック修正（誤実装）:**
  - 原文「【自】あなたのターンの間、対戦相手のシグニ1体が場からトラッシュに置かれたとき、デッキの一番上をエナゾーンに置く」。
  - 修正前 JSON は `timing:ON_TRASH` のみ（triggerScope 既定=self）で**このカード自身がトラッシュされたとき**発火していた。
  - 修正: `triggerScope:'any_opp'` + `condition:IS_MY_TURN`。`collectTrashTriggers` に **any_opp 分岐**を新設（トラッシュされたカードの対戦相手フィールドを監視）。`IS_MY_TURN`/`IS_OPPONENT_TURN` は `evalCondition` では常時 true/false のため、watcher のターンを明示判定して発火を制御。
- **decompile（`decompileEffects.ts`）の和文化改善:**
  - `POWER_MODIFY_PER_FIELD` を専用ケース化 → 「対象のパワーを〈countOwner〉の場の〈countFilter〉シグニ1体につき±N」（E1: 「あなたの場の＜毒牙＞のシグニ1体につき－1000」）。
  - target の `owner:'any'` を「自分または対戦相手の」と明示（BURST のマイナス対象が両者対象だと分かる）。
  - any_opp/any スコープを ON_TRASH/ON_LEAVE_FIELD 等「このカード」始まりのトリガーにも主語反映（「対戦相手のシグニがトラッシュに置かれたとき」）。主語反映できた場合は冗長な `〔範囲:〕` マーカーを抑制。ターン条件（〜の間）は「場合、」を付けない。
- E1（`POWER_MODIFY_PER_FIELD`）・BURST（`owner:'any'` の -10000/-7000）の **JSON ロジック自体は正しい**ため、E2 のみ `manualEffects.ts` で上書き登録。`npm run typecheck` 通過、`npm run verify` で WX04-037 フラグなし・サマリー不変。

## WX04-036-E1「再誕」場出し・好きな数バニッシュ・同数探索の修正（2026-06-22）

- **症状（ユーザー報告）:** WX04-036-E1「あなたの＜美巧＞のシグニを**好きな数**対象としバニッシュ→デッキから**同じ枚数**の＜美巧＞シグニを探して**場に出す**」が誤実装。「場に出す」はプレイヤーがカード・ゾーンを選択できる必要がある。
- **根本原因（複数）:**
  1. バニッシュが固定1体（原文「好きな数」）、探索が固定最大1枚（原文「バニッシュした数と同じ枚数」）。
  2. `applyDirectAction` の `ADD_TO_FIELD` が**場に出すカードをデッキから除去していなかった**（`src` の trash/energy のみ対応）。デッキ探索→場出しでカードがデッキに残り、`SHUFFLE_DECK` 後に二重化（**66カードに潜在**）。
  3. `resumeSearch` が複数ピック時に最初のゾーン選択で残りカード配置・afterAction を**消失**させていた。
- **修正:**
  - `applyDirectAction` の `ADD_TO_FIELD`: cardNum をデッキ/手札/トラッシュ/エナのいずれかから除去してから配置（src 非依存）。
  - `PLACE_SIGNI_ON_FIELD` アクションを新設。`resumeSearch` は `then=ADD_TO_FIELD` のとき各カードのゾーン選択（`SELECT_SIGNI_ZONE`）を `continuation` で順次チェーンし、全配置後に afterAction（シャッフル）＋外側 continuation を実行。
  - `execBanish`: `count:'ALL' + upToCount` でプレイヤー選択UI（0〜全部）＋ `lastProcessedCards` 設定（`execTrash` と同じ慣例）。
  - `execSearch`: `maxCount` を `NumberOrRef` 化し `{$ref:'last_processed_count'}`（直前バニッシュ数=「同じ枚数」）を解決。0枚なら探索せず afterSearch のみ。
  - WX04-036-E1 を JSON と `manualEffects.ts` に MANUAL 登録。`npm run typecheck` 通過、`npm run verify` で WX04-036 フラグなし・サマリー不変。

## WX04-035「コンテンポラ」3効果の完全実装（2026-06-22）

- **症状:** WX04-035 の3効果がいずれも近似/誤実装だった。
  - **E1【常】**「あなたの＜美巧＞のシグニは対戦相手の、ルリグとシグニの効果を受けない」→ `GRANT_PROTECTION from=['ルリグ','シグニ']` は定義されていたが、ソース種別を見て遮断する消費側が無く、能力消失保護に部分的にしか効いていなかった（バニッシュ/バウンス/ダウン/トラッシュ/フリーズ/パワー-が素通り）。`subjectOwner` 欠落。
  - **E2【自】**「対戦相手の効果によっていずれかの領域からトラッシュに置かれたとき、《緑》を支払ってもよい。そうした場合、このシグニを手札に加える」→ `BOUNCE`（場のシグニを手札へ）＋誤った `CONDITIONAL(IS_MY_TURN)` で、トリガー原因（対戦相手効果）・領域（いずれか）・回収対象（このカード自身）がすべて不正確。
  - **BURST**「デッキトップ1枚をエナへ。その後エナに＜美巧＞シグニが5枚以上ならデッキトップ1枚をライフへ」→ 5枚以上条件が欠落し、無条件でライフ追加していた。
- **修正:**
  - **E1:** `collectEffectImmuneSigni`（effectEngine）を新設。解決中効果のソースカード種別（ルリグ/シグニ/スペル/アーツ）を判定し、`from`/`fromAll(+exceptSource)` が該当する場合のみ耐性シグニを返す。BattleScreen の ctx 構築で、バニッシュ/バウンス/ダウン/トラッシュ/能力消失/能力付与の各保護セットへ union し、`ctx.otherEffectImmuneNums` 経由で FREEZE・POWER_MODIFY(マイナス) からも除外。`subjectOwner:'self'` を付与。
  - **E2:** `SEQUENCE[OPTIONAL_COST(緑) → CONDITIONAL(PAID_ADDITIONAL_COST) → TRANSFER_TO_HAND(thisCardOnly)]` に変更。`execTransferToHand` が `thisCardOnly` を解釈し（トラッシュの効果元自身を即時回収）、`CardEffect.triggerCondition={byOpponentEffect,fromAnyZone}` を新設。ON_TRASH 収集で原因owner（=効果オーナー）と被トラッシュ所有者を比較して「対戦相手の効果によって」を判定、手札/エナ→トラッシュ検出（`collectAnyZoneTrashSelfTriggers`）で「いずれかの領域から」を補完。
  - **BURST:** `ENERGY_COUNT_FILTER` 条件（evalCondition）を新設し、エナチャージ後に `CONDITIONAL(エナの＜美巧＞シグニ≥5)` でライフ追加を包む。
  - 3効果は再生成耐性のため `manualEffects.ts`（MANUAL_EFFECTS）にも登録。`npm run typecheck` 通過、`npm run verify` で WX04-035 のフラグなし。

## デッキが0枚になってもリフレッシュが発動しない修正（2026-06-22）

- **症状（ユーザー報告）:** メインデッキが0枚になってもリフレッシュ（トラッシュをシャッフルして新デッキ化＋ライフ1枚トラッシュ）が発動しない。
- **根本原因:** リフレッシュ発動条件が「ドロー数がデッキ枚数を**超えた**とき（`canDraw < count`）」のみだった。①**ちょうど0枚**になるドロー、②**ミル/エナチャージ/ライフ送り等の効果**でデッキが尽きるケースでリフレッシュされなかった。さらに既存実装は「トラッシュ0枚でもライフをトラッシュへ」とルール違反（ルール：トラッシュが空ならリフレッシュ保留）。
- **修正（公式ルール準拠）:** リフレッシュ発動条件を「**デッキ0枚 かつ トラッシュ≥1枚**」に統一。
  - `drawCards`/`applyRefresh`（BattleScreen）: ドロー後に**デッキが0枚なら**リフレッシュ（トラッシュ空なら保留）。`refresh_count_this_turn` を加算。
  - エンジン `execDraw`: インラインのリフレッシュを廃止し、**効果解決後（`result.done`）に集約**（ルール：効果解決中はデッキ0のまま可能な限り解決し、その後リフレッシュ）。
  - エンジンに `applyRefreshOnDone(result, cardMap)` を新設し、解決完了時に両プレイヤーのデッキ0枚をリフレッシュ（`PREVENT_LIFE_REFRESH_TRASH` 対応）。BattleScreen の全効果解決出口（スタック処理／各 resume／スペル／スペルカットイン／ゾーン選択）で適用。
  - **ターンプレイヤーの1ターン2回目**のリフレッシュ時は既存 `forceEndTurn` 経路でターン終了（スタック処理経路）。`refresh_count_this_turn` はターン開始（UPフェイズ）でリセット。
- **検証:** typecheck 0エラー、eslint 新規エラーなし。**実機検証推奨**（デッキを引き切る／ミル効果でデッキを尽くす→リフレッシュ発動＆ライフ1枚減、2回目でターン終了）。
- **未対応（限定）:** 2回目リフレッシュ→ターン終了はスタック処理経路のみ確実（インタラクション解決経路で完了する効果での2回目は未連動の可能性）。「トラッシュ空で保留→トラッシュ補充時に発動」は次の効果解決時の集中チェックで自然に発動する近似。

---

## 【重大】オンライン対戦リロード時にカード未ロードで全シグニが「パワー0以下」誤バニッシュされる修正（v0.462, 2026-06-22）

- **症状（ユーザー報告）:** オンライン対戦中にページを閉じ→リロードで対戦復帰すると、「パワーが0になってバニッシュされた」というログと共に**盤面の全シグニが破壊**される。Supabase同期しているので本来起きないはずだった。
- **根本原因（ロード競合）:** リロード時 `App.tsx` の `init()` が PLAYING ルームを検出し**即座に** `setViewMode('BATTLE')`＋`setLoading(false)` で対戦画面へ復帰する。一方カードマスタ（`CardData_Sheet*.csv` + `effects_*.json`）は**別の useEffect で非同期fetch**され、初期値は空配列。回線/パース時間により、BattleScreen がマウントされ Supabase `battle_states` を購読して `bs` がセットされた時点でも `allCards`/`battleCards` がまだ空のことがある。→ `battleCardMap` が空 → パワー0以下自動バニッシュ（`checkAndBanishPowerZero`）で各シグニの `battleCardMap.get(topNum)?.Power` が `undefined` → `parseInt('0')=0` → **全シグニが `power<=0` と誤判定**され、バニッシュ結果が Supabase に書き込まれて盤面が恒久的に破壊される。
- **修正（二重防御）:** ①**App.tsx**: BATTLE のレンダリングを `battleCards.length === 0` でガードし、未ロード時は「対戦データを読み込み中…」表示に切替（カードデータが揃うまで BattleScreen をマウントせず battle_state 購読自体を始めない＝根本対処）。②**BattleScreen.tsx**: `checkAndBanishPowerZero` 冒頭に `if (battleCardMap.size === 0) return;`（破壊的書き込みの最後の砦）。実体は ref(7904) 経由で全呼び出し経路（自動useEffect 1890／CPU処理 7963・8012）が通るため1箇所で全経路を塞げる。
- **検証:** typecheck 0エラー。**実機検証推奨**（対戦中リロード→復帰で盤面が維持されること。低速回線/スロットリングで再現しやすい）。タイミング依存のため自動テスト困難。

---

## WX04-009（遊月・参戎）の【出】が「【マルチエナ】を持つカードを対戦相手が選ぶ」を無視して任意エナを自分が選ぶ修正（v0.461, 2026-06-22）

- **症状（WX04-009-E1 報告）:** 原文「【出】：**対戦相手は**自分のエナゾーンから**【マルチエナ】を持つ**カード１枚を対象とし、それをトラッシュに置く」に対し、JSON が `TRASH(ENERGY_CARD, owner:opponent, count:1)` のみで ①**【マルチエナ】フィルタが欠落**（任意の相手エナをトラッシュ可能）、②**選択者が効果使用側（自分）**（本来は対戦相手が自分のエナから選ぶ）。punish カードが「相手エナ1枚を自分が好きに割れる」別物になっていた。
- **修正:** ①`TargetFilter.keyword` を `matchesFilter`（execUtils.ts）で実装。マルチエナは印字ベース近似（EffectText の `：【マルチエナ】`＝サーバント等／自身のみへの CONTINUOUS GRANT_KEYWORD マルチエナ）で判定（フィールド全体への付与＝allMulti は対象外。`isMultiEna` のフィールド文脈なし版）。その他キーワードは EffectText の `【kw】`/`《kw》` 包含で判定。②`TrashAction.opponentSelects` を新設（既存 BanishAction と同パターン）。execTrash の ENERGY_CARD 分岐で `opponentSelects && owner==='opponent'` 時に `selectOrInteract(..., oppResponds=true)` で**対戦相手に選択を委ねる**。③effects_WX.json の WX04-009-E1 を `filter:{keyword:'マルチエナ'}` ＋ `opponentSelects:true`、parseStatus:MANUAL に修正。
- **逆翻訳器:** filterJa に `keyword`→「【kw】を持つ」、TRASH の who 判定に `opponentSelects`（エナ含む）→「（相手が選ぶ）」を追加。「対戦相手の【マルチエナ】を持つエナを1枚トラッシュに置く（相手が選ぶ）」と原文一致。
- **検証:** typecheck 0エラー、verifyEffects で WX04-009 は警告なし（既存無関係警告のみ）、decompile_sheet1.txt 再生成（差分は当該1行のみ）。**相手にマルチエナエナが無い場合は候補0で不発（正常）。実機検証推奨。**

---

## WX03-015（デス・コロッサオ）の条件欠落＆強制トラッシュを修正（0か全部＋レベル相異3体条件）（v0.460, 2026-06-21）

- **症状（WX03-015-E1 報告）:** 原文「あなたのすべてのシグニを場からトラッシュに置いて**もよい**。この方法で**それぞれがレベルの異なるシグニが3体**トラッシュに置かれた場合、対戦相手のすべてのシグニをバニッシュする」に対し、JSON が ①TRASH が**強制**（任意の「してもよい」無視）、②条件が `CONDITIONAL:IS_MY_TURN`（パーサの「そうした場合」プレースホルダ＝常にtrue）で**レベル相異3体の条件が完全欠落**。結果「全シグニ強制トラッシュ→無条件で相手全シグニバニッシュ」という別物だった。逆翻訳も「そうした場合」と誤表示。
- **ユーザー指摘:** 「すべてのシグニをトラッシュしてもよい」は**0か全部か**（部分選択不可）。→ `upToCount`（0〜全部の自由選択）では不正確。
- **条件機構の新設:** `Condition` に `TRASHED_DISTINCT_LEVELS_GTE { count }` を追加（types/effects.ts）。`evalCondition`（execUtils.ts）で **`lastProcessedCards` のシグニの相異なるレベル数 ≥ count** を判定（`LAST_PROCESSED_LEVEL_SUM_EQ` と同系統）。
- **0か全部の表現:** `SELECT_TARGET` の `optional` は0〜count の部分選択を許すため不適。**宣言的 `CHOOSE` アクション**（既存 execChoose）で2択化：「全シグニトラッシュ」=`SEQUENCE[TRASH(self ALL 強制), CONDITIONAL(TRASHED_DISTINCT_LEVELS_GTE 3)→BANISH(opp ALL)]` ／「トラッシュしない」=空SEQUENCE。yesオプション内にCONDITIONALを内包することで、execSequence がステップ間で `lastProcessedCards` を引き継ぎ条件判定が正しく動く（resumeChoose:3168 は option の lastProcessedCards を continuation へ渡さないため、continuation方式は不可）。parseStatus:MANUAL。
- **逆翻訳器:** condJa に `TRASHED_DISTINCT_LEVELS_GTE`、空SEQUENCE→「何もしない」を追加。「…全シグニをトラッシュに置く。そしてこの方法でそれぞれレベルの異なるシグニが3体トラッシュに置かれたなら、対戦相手のすべてのシグニをバニッシュする / 何もしない」と原文一致。
- **検証:** typecheck 0エラー、checkAllEffects 0エラー、decompile_sheet1.txt 再生成。**実機検証（0/全部の二択UI→3体相異レベル時のみ相手全バニッシュ）推奨。**

---

## STUB:CONDITIONAL_CARD_COST_BY_OPP_LRIG は実装済みと判明→「未実装」表示を是正（v0.459, 2026-06-21）

- **報告:** 逆翻訳で WX03-002/003/004/005/014（アーツ5枚）の `[STUB:CONDITIONAL_CARD_COST_BY_OPP_LRIG]`（相手センタールリグが指定色なら基本コストから《無×3》等が消える軽減）が未実装に見える、という指摘。
- **調査結果:** **コスト軽減自体は既に実装・配線済み**だった。アーツ/スペルの支払いは effect JSON の `cost.energy` ではなく **`card.Cost`（テキスト）→ `computeArtsEffectiveCost`**（BattleScreen.tsx:210）で計算され、その中の正規表現「対戦相手のセンタールリグが〜の場合、基本コストは〜になる」（:232）が **相手センタールリグ色（:10297 `op.field.lrig` の Color）と照合し軽減後コスト文字列を返す**。支払いUI（:10373 `rawEffectiveCost`→`parseGrowCost`→`totalReq`/`canAffordWithExtraCost`）が軽減後コストで必要エナ数を算定する。5枚すべてで正規表現マッチ＆軽減コスト算出を確認（白×2/赤×2/青×1/緑×1/黒×1）。
- **STUB の正体:** アクション SEQUENCE 内の STUB ステップは**支払い後**に実行され、`execStubPart2` のハンドラ（:3966）は**条件結果をログ出力するだけ**（実コスト変更はしない＝支払い時に済）。未処理STUBではなく、`done(addLog('[STUB:...]'))` の no-op でもなく、専用ハンドラ有りの「結果ログ専用」だった。
- **是正（表示・ログのみ。挙動は変更なし）:** ①`execStubPart2` のコメントを「支払い時 computeArtsEffectiveCost が適用済み」と明記し、ログを `基本コスト軽減：相手センタールリグが黒→コスト《白×2》（支払い時適用済み）` 等、実コスト込みに改善（軽減後コスト文字列も正規表現で取得）。②逆翻訳器（decompileEffects.ts）で本STUBを `[STUB:...]` ではなく「相手センタールリグ色が条件を満たす場合は基本コストを軽減（支払い時に自動適用）」と実挙動表示。③STUBS.md 説明を更新（コメント由来・再生成）。decompile_sheet1.txt 再生成。
- **注記:** CPU はアーツを使用しない（BattleScreen.tsx:7723）ため軽減対象は人間プレイヤーの支払い経路のみで完結。typecheck 0エラー。

---

## WX03-002（ホーリーアクト）が「＜天使＞**ではない**」を「＜天使＞**の**」と真逆対象に潰れる修正＋`cardClassExclude` フィルタ新設（v0.458, 2026-06-21）

- **症状（WX03-002-E1 報告）:** 原文「**＜天使＞ではない**対戦相手のシグニ1体を対象とし、それをトラッシュに置く」に対し、JSON が `filter:{story:"天使"}`（=**＜天使＞の**シグニ）と**意味が真逆**になっていた。クラス除外（NOT）を表現する仕組みが存在せず、パーサが肯定形に潰していた。
- **機構新設:** `TargetFilter.cardClassExclude?: string | string[]` を追加（types/effects.ts）。`matchesFilter`（execUtils.ts）で **CardClass（クラスオーバーライド考慮）に includes でマッチしたら対象から除外**。`cardClass`/`story` の肯定マッチと対になる否定フィルタ。
- **データ修正（durable・MANUAL）:** WX03-002-E1 の TRASH ターゲット filter を `story:"天使"` 削除→ `cardClassExclude:"天使"`。`parseStatus:MANUAL` で固定。
- **逆翻訳器:** `filterJa` に `cardClassExclude`（「＜X＞ではない」）を追加。逆翻訳が「対戦相手の＜天使＞ではないシグニ1体をトラッシュに置く」と原文一致に。
- **残（未修正・別系統）:** `STUB:CONDITIONAL_CARD_COST_BY_OPP_LRIG`（相手センタールリグが黒なら基本コストが《白×2》に軽減＝《無×3》が消える）は**未実装のまま**。現状コストは常に《白×2》《無×3》固定。同 STUB は WX03-003 等にも存在し、コスト動的変更機構として別途対応が必要。他シートの「＜X＞ではない/でない」系8枚（WX12-025/034/036・WX22-006・WXK05-005・WXK10-091・WXDi-P07-049・WX25-P3-015）は文脈が異なるため今回は未着手（`cardClassExclude` 流用で対応可能なものは将来）。
- **検証:** typecheck 0エラー、checkAllEffects 0エラー、decompile_sheet1.txt 再生成。**実機検証（対象が天使以外のみに絞られるか）推奨。**

---

## WX03-001（ウムル=フィーラ）【起】が「自分シグニを無条件バニッシュ」に潰れる修正＋「コストでトラッシュしたシグニと同レベル」機構を新設（v0.457, 2026-06-21）

- **症状（WX03-001-E1 報告）:** 【起】《黒》《黒》＜古代兵器＞のシグニ1体を場からトラッシュ：**この方法でトラッシュしたシグニと同じレベルのシグニ1体**をバニッシュ、という効果が、JSON 上 `BANISH target owner:"self"`（=**自分のシグニ**を対象）＋**レベル制約欠落**（無条件の任意シグニ）になっていた。逆翻訳も「あなたのシグニ1体をバニッシュする」と誤表示。
- **データ修正（durable・MANUAL）:** `effects_WX.json` WX03-001-E1 の `action.target.owner` を `self`→`any`（原文「シグニ1体」＝owner無制限）、`filter` に **`levelEqualsVar:"field_trash_level"`** を付与。`parseStatus:MANUAL` で固定（再生成保護）。コスト `fieldTrash {filter:{story:"古代兵器"}}` は既存どおり（story/cardClass どちらも CardClass を includes 判定するため適合）。
- **機構新設（既存 `levelEqualsVar` 動的フィルタ系統に追従）:** ①`PlayerState.last_field_trash_level` を新設（types/index.ts）。②`fieldTrash` コスト支払い時（BattleScreen）に**トラッシュしたシグニ最上段のレベル**を `last_field_trash_level` に記録。③`TargetFilter.levelEqualsVar` のユニオンに `'field_trash_level'` を追加（types/effects.ts）。④`execBanish` で `levelEqualsVar==='field_trash_level'` を `level: last_field_trash_level ?? -1` に解決（既存の `charm_trash_count` 分岐に並置）。
- **逆翻訳器:** `costJa` に `fieldTrash`（「場から〜シグニN体をトラッシュ」）、`filterJa` に `levelEqualsVar`/`levelEqDiscardLevelSum` の和文を追加。逆翻訳が原文一致（〈《黒×1》《黒×1》＋場から＜古代兵器＞のシグニ1体をトラッシュ〉この方法でトラッシュしたシグニと同じレベルのシグニ1体をバニッシュする）に。
- **検証:** typecheck 0エラー、checkAllEffects 0エラー、decompile_sheet1.txt 再生成。**実機検証（PvP/CPU・コスト支払いで level 記録→対象がレベル一致のみに絞られるか）推奨。** CPU AI のこの起動利用は未確認。

---

## 「このカードがデッキからトラッシュに置かれたとき」が ON_PLAY 誤判定→ON_TRASH 修正＋デッキミル ON_TRASH 発火（v0.456, 2026-06-21）

- **症状（WX02-073 報告）:** 【自】「このカードが**デッキからトラッシュに置かれたとき**、このカードをトラッシュから場に出してもよい」が **`timing:ON_PLAY`（場に出たとき）に誤判定**され、さらに action が任意トラッシュカード（`thisCardOnly` 欠落）・`mandatory:true`（「もよい」無視）だった。
- **timing 修正（parser）:** ON_TRASH の timing 正規表現が `(?:手札か?デッキから|…)` で**プレーンな「デッキから」にマッチしなかった**（「手札か」が必須化していた）。`(?:(?:手札か)?デッキから|場から|いずれかの領域から)` に修正（timing 判定とトリガー文ストリップの2か所）。**ON_TRASH の「〜してもよい」を任意トリガー（mandatory:false）**の対象に追加。
- **action 修正（parser）:** 自己蘇生ハンドラ（v0.455）の判定を「場に出**す**」限定から「場に出」に緩め、「場に出して（もよい）」も `thisCardOnly`＋asDown 付与の対象に。
- **engine（デッキミル ON_TRASH 発火）:** ON_TRASH は従来**フィールド→トラッシュ**（`detectTrashedSigni`）でしか収集されず、**デッキ→トラッシュ（ミル）では発火しなかった**。`detectDeckTrashed`（before.deck→after.trash を検出）＋`collectDeckTrashSelfTriggers`（カード自身・`triggerScope:self` のみ。場シグニ用 any_ally 等は除外）を新設し、stack 解決ループの ON_TRASH 検出に配線。
- **影響（素パース差分で隔離確認）:** Sheet1 で **5枚**変化（WX02-073・**WX10-092**＝同型の場出し自蘇生・WX04-035/WX04-102＝ON_TRASH の任意化・WX11-026-E1＝thisCardOnly 補完）。他帯の **WX13-038**（デッキトラッシュ時パワー-2000・mandatory 維持）も同 timing 修正で ON_TRASH に。対象5枚 JSON 再生成（WX11-026 は manualEffects 優先で無変化）。typecheck 0エラー。
- **残:** デッキミル ON_TRASH の発火は stack 解決ループ経由のミルが対象（コスト/特殊経路の網羅は将来）。自己蘇生の発動は v0.455 の trashActivated 実行経路（場に出す）に乗るため**実機検証（PvP/CPU）推奨**。

---

## トラッシュ自己起動【起】機構＋UI を新設（「このシグニをトラッシュから場に出す」）（v0.455, 2026-06-21）

- **症状（WX02-069/071 報告）:** 【起】《黒》《黒/無》「このシグニをトラッシュから場に出す（このシグニがトラッシュにある場合のみ使用可）」が、①データ上 `ADD_TO_FIELD source:TRASH_CARD count:1`（=**任意トラッシュカード**1枚／`thisCardOnly` 欠落）で、②そもそも**トラッシュから起動する機構が無かった**（`handActivated`＝手札自己起動は v0.373 で実装済だがトラッシュ版は未実装）。`ACTIVATED timing:MAIN`＝場のシグニ起動扱いだが本体は場に存在せず、起動UIに現れず発動不能だった。
- **データ修正（parser・durable）:** parseSentencePart1 の「このシグニをトラッシュから場に出す」ハンドラを「このシグニ/カード＋トラッシュから＋場に出す/シグニゾーンに出す」に一般化し **source に `thisCardOnly`＋「ダウン状態で」→`asDown`** を付与。effectParser に **`trashActivated` フラグ**（ACTIVATED かつ自己蘇生アクション時）を新設（`handActivated` と同様）。
- **engine:** `execAddToField` の TRASH_CARD 分岐に `thisCardOnly`＝効果元カード自身（`ctx.sourceCardNum` がトラッシュにあればそれのみ）を追加。effect_stack 解決時の ctx は `sourceCardNum=entry.cardNum`・場にいなくても無条件で解決されるため、トラッシュの自身を場へ移せる。
- **UI（BattleScreen / BoardComponents）:** `PlayerField` に `getTrashCardActions` を新設し、**トラッシュ ZoneCardModal のカードに発動ボタン**を表示（従来 getCardActions=undefined で何も出なかった）。`getMyTrashCardActions`＝自ターン MAIN・`trashActivated`・コストがエナのみ・使用回数/condition を満たすカードに「【起】トラッシュから出す」。`pendingTrashActivated` モーダルでエナ支払い→`executeTrashActivated`（エナをトラッシュへ・効果元はトラッシュに残し effect_stack に積む→`execAddToField` が場へ移動）。
- **対象データ再生成（14枚）:** WX02-069/071/WX07-033(E3・自蘇生 asDown)/WX11-049/WX17-049/WX19-029/WXK02-037/WXK11-071/WXDi-P03-087/P07-089/P09-045/P12-053/P16-082/CP01-050。素パース差分で Sheet1 影響4枚を隔離確認、全件「自己蘇生効果のみ」変化。逆翻訳器に「このシグニをトラッシュから場に出す」表示を追加。typecheck 0エラー。
- **MVP の範囲・残（TODO）:** UIで発動可能なのは**エナコストのみ・MAINフェイズ**の自己蘇生。手札捨て/コイン/エクシード/ウィルス除去/アタックフェイズ起動（WXDi系・WX11-049/WX19-029 等）のコストUIは未対応（データは正・UIゲートで非提示）。**CPU AI はトラッシュ起動を使わない**。**実機検証（PvP/CPU・ヘッドレス不可）が必要。**

---

## 「場のシグニN体につきデッキトップをエナに置く」が固定エナチャージに潰れる修正（v0.454, 2026-06-21）

- **症状:** 「あなたの場にある＜空獣＞と＜地獣＞と＜植物＞のシグニ１体につきあなたのデッキの一番上のカードをエナゾーンに置く」（WX02-066）が **固定 `ENERGY_CHARGE_FROM_DECK count:1`** に潰れていた。v0.453 のドロー版（DRAW_PER_FIELD_COUNT）と同型で、アクションがエナチャージ。
- **新アクション:** `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT`（chargePerUnit/countFilter/countOwner/owner）を types/engine に新設。engine は対象シグニ数を数えて `ENERGY_CHARGE_FROM_DECK` を実行（`matchesFilter`＋`matchesStateFilter`＋`excludeSelf`＝効果元除外も評価）。
- **パーサー:** part3 の per-field ハンドラに「…シグニN体につきデッキの一番上のカードをエナゾーンに置く」分岐を追加（クラスOR＋ステート＋「他の」=excludeSelf 抽出を `buildCountFilter` に共通化）。part1 の **2か所**の汎用エナチャージ handler（デッキトップ→エナ）に「体につき」ガードを追加して part3 に委譲。
- **波及（WX06-020-E2）:** part1 の汎用キーワード付与（`を得る/を持つ`）が「**【ライフバースト】を持つ**他の＜植物＞のシグニ１体につき…」を**付与と誤認**して先取りしていた（per-field を止めた副作用で顕在化）。part1 キーワードブロックに per-field 構文（体につき＋引く/エナに置く）除外ガードを追加。WX06-020-E2 は `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT`（story:植物＋excludeSelf）に。**近似:** 「【ライフバースト】を持つ」フィルタは省略（場の他の植物シグニ数でカウント）。
- **影響（素パース差分で隔離確認）:** Sheet1 で変化は **2枚のみ**（WX02-066 / WX06-020-E2）。対象2枚のみ JSON 再生成。逆翻訳器に `ENERGY_CHARGE_FROM_DECK_PER_FIELD_COUNT` 表示を追加。typecheck 0エラー。

---

## 「場のシグニN体につきカードをM枚引く」が固定ドローに潰れる修正＋ステート/複数クラス対応（v0.453, 2026-06-21）

- **症状:** 「あなたの場にある＜電機＞と＜水獣＞のシグニ１体につきカードを１枚引く」（WX02-061）が **固定 `DRAW count:1`** に潰れていた（動的枚数＝場の対象シグニ数が欠落）。
- **原因①（先取り）:** parseSentencePart1 の汎用 DRAW ハンドラ `カードをN枚引く` が「N体につき」の前半を無視して先取りし、part3 の `DRAW_PER_FIELD_COUNT` ハンドラに到達していなかった。→ 「体につき」を含む場合は委譲するガードを追加。
- **原因②（複数クラス非対応）:** part3 の正規表現が単一クラス `(＜X＞の)?` のみで「＜電機＞と＜水獣＞の」（と/か連結）にマッチしなかった。→ クラス句を `(?:＜X＞[とか]?)+の` に一般化し `parseStoryFilter` で OR 抽出。
- **波及（WX09-Re01-E3）:** part1 ガードにより「対戦相手の凍結状態のシグニ１体につきカードを１枚引く」が一旦 UNKNOWN 化したため、part3 を更に一般化：「場にある」を任意化し、修飾句から**盤面ステート（凍結/ダウン/アップ/感染）**を抽出。**engine の `execDrawPerFieldCount` がカード属性フィルタしか見ず盤面ステートを無視していた**のを `matchesStateFilter`（effectEngine から export）併用に修正。WX09-Re01-E3 は `isFrozen` フィルタ＋countOwner:opponent で「対戦相手の凍結シグニ数だけドロー」に。
- **影響（素パース差分で隔離確認）:** Sheet1 で変化は **2枚のみ**（WX02-061 / WX09-Re01-E3）。対象2枚のみ JSON 再生成。逆翻訳器に `DRAW_PER_FIELD_COUNT` 表示を追加（生ID `[アクション:…]` を解消）。typecheck 0エラー。

---

## 逆翻訳器：CONTINUOUS POWER_SET の「このシグニ」表示と condition「他の」表示を改善（2026-06-21・ツールのみ）

- **背景:** WX02-052 が「間違っている」と報告されたが、**JSON データは正しく逆翻訳器の表示バグ**だった。原文「あなたの場に**他の**＜ウェポン＞のシグニがあるかぎり、**このシグニの基本パワー**は8000になる」に対し、逆翻訳が「＜ウェポン＞のシグニがいるかぎり…あなたのシグニ1体のパワーを8000にする」と表示し、「他の」と「このシグニ」が抜けていた。
- **データが正しい根拠:** ①condition は `HAS_CARD_IN_FIELD` に **`excludeSelf:true`** を持つ（＝「他の」）。②action は CONTINUOUS POWER_SET で `target:{owner:self,count:1}`。engine の `calcContinuousSigniMutations`（effectEngine.ts:975-982）は **`count!=='ALL'` を「このシグニのみ」** として効果元へ適用するため、ランタイム挙動は「このシグニの基本パワーを8000」で正しい。
- **修正（`scripts/decompileEffects.ts` のみ）:** ①`HAS_CARD_IN_FIELD` の condJa に `excludeSelf` → 「他の」表示を追加。②`actionJa` に effectType を渡し、**CONTINUOUS の POWER_SET で count≠ALL・owner self/any** のとき「このシグニの基本パワーを…にする」と表示（engine 挙動に一致）。
- **影響:** 逆翻訳の表示精度向上のみ（JSON/パーサー/engine 変更なし）。Sheet1 で「場に他の」72件・「このシグニの基本パワー」系（WX01-054/056/068 等の条件付き基本パワー族）が正しく表示。`docs/decompile_sheet1.txt` 再生成。typecheck 0エラー。

---

## キーワード付与の「あなたの＜クラス＞/色のシグニ」が owner:any＋フィルタ欠落に潰れる修正（v0.452, 2026-06-21）

- **症状:** 【ダブルクラッシュ】等のキーワード付与で、原文「あなたの＜鉱石＞か＜宝石＞のシグニ１体を対象とし…得る」が **`GRANT_KEYWORD target:{owner:'any', count:1}`（フィルタ無し）** に潰れていた（WX02-055-E1 で発覚）。`parseSentencePart1` の汎用キーワード付与ブロックが owner 判定に `t.includes('あなたのシグニ')` を使っており、「あなたの」と「シグニ」の間にクラス句/色句が挟まると外れて owner:any 既定にフォールバック、かつクラス/色フィルタも一切付与していなかった。**＝相手シグニにも付与可能・クラス無制限の誤り。**
- **修正（パーサー・durable）:** owner 判定を `あなたの(?:[白赤青緑黒]の|＜X＞か?)+の?シグニ` / `対戦相手の…` のクラス句・色句許容パターンに拡張。さらに単体シグニ付与に `parseStoryFilter`／`parseColorFilter`／`parseLevelFilter` を付与（フィルタが空でなければ `target.filter` に格納）。`story`/`color`/`level` はいずれも engine の `matchesFilter` が `CardClass.includes` 等で評価する既存経路。
- **影響（素パース差分で隔離確認）:** Sheet1 で本変更により変化するのは **4枚のみ** — `WX02-055`（鉱石/宝石/ウェポン・self）/ `WX04-069`（鉱石/宝石・self）/ `WX05-041`（空獣/地獣・self）/ `WX11-003-E1`（赤・self）。いずれも owner→self＋正しいフィルタへ是正。対象4枚のみ JSON 再生成（`regenCards.ts`、E2/E3 等への巻き込み無しを確認）。typecheck 0エラー。
- **残（他Sheet）:** 同型「あなたの＜クラス＞のシグニに【キーワード】を与える」は WX02〜以外にも存在しうる。パーサー修正は durable なので全再生成すれば是正されるが、全再生成は禁止のため逆翻訳スキャンで個別に拾って再生成する。

---

## Sheet1 逆翻訳照合（WX02-021〜040）一括修正＋動的数/条件/場全体付与の基盤追加（v0.442〜0.451, 2026-06-21）

`docs/decompile_sheet1.txt` を1枚ずつ原文照合し、パーサー/エンジン/逆翻訳器を横断修正。多くは**1枚の指摘から系統的に同型カードへ波及する基盤追加**。

- **WX02-021（v0.442）:** GRANT_PROTECTION「ルリグ以外からの効果を受けない」を `fromAll+exceptSource` で表現（意味が逆だった）。SEARCH→ADD_TO_FIELD の逆翻訳「場に出す」、BURST「センタールリグかシグニ1体」を `CENTER_LRIG_OR_SIGNI`（OR選択）に。
- **WX02-022（v0.443）:** ① CONTINUOUS の `activeCondition`「ライフクロスN枚以下」を `COUNT_THRESHOLD(life_cloth)` で新設（パターン追加・6効果に波及）。② **パワー合計上限つき複数選択バニッシュ**を新機能実装：`EffectTarget.totalPowerMax`＋SELECT_TARGET 拡張（`candidatePowers`）、execBanish/selectOrInteract/resumeSelectTarget で合計検証、BattleScreen UI（超過カード選択不可・合計表示・CPU貪欲選択）。同型4枚（WX05-002/WX07-026/WXEX2-38）。
- **WX02-025（v0.444）:** `BanishAction.opponentSelects`（「対戦相手は自分のシグニを選んでバニッシュ」=相手が選択）を新設し execBanish で `opponentResponds` に接続（同型5枚）。REVEAL_AND_PICK 逆翻訳の `remainder` 反映（「残りは戻す」固定→trash/deck-bottom/top を正しく描画、209枚に波及）。
- **WX02-027（v0.445）:** ① execTrash が `count:'ALL'+upToCount`（＝「好きな数」）を**自動全トラッシュ**にしていたのを選択式に。② **直前処理数の動的参照 `{$ref:'last_processed_count'}`** を新設（「トラッシュに置いたシグニ1体につき対戦相手のシグニ1体」）。execBanish で解決。同型 WD14-011 にも波及。
- **WX02-028（v0.446）:** スペルの**引用符形式ルリグ能力付与**「あなたのセンタールリグは『…』を得る」を `GRANT_LRIG_ABILITY` 化＋ parseSpellEffect でサブ能力パース（22枚）。タイミング「このルリグがアタックしたとき」→`ON_ATTACK_LRIG`。ADD_TO_LIFE も `last_processed_count` 対応。BURST 逆翻訳「その【出】能力は発動しない」。
- **WX02-029（v0.447）:** 逆翻訳 `costJa` の `handDiscardSigni` がクラス/storyを無視していたのを `filterJa` 経由に（「＜アーム・ウェポン＞のシグニ」、108枚に波及）。
- **WX02-034（v0.448）:** Condition **`ENERGY_HAS_COLOR`** 新設（「エナゾーンに赤と緑がある場合」）。「シグニ1体を対象とし、〈エナ色条件〉場合、それを除去」を CONDITIONAL で表現（対象=対戦相手・色フィルタ誤付与を除去）。evalCondition 両系統に評価追加。
- **WX02-037（v0.449）:** parseSingleSentence に「あなたの場に＜X＞のシグニがある場合、〜」→`CONDITIONAL(HAS_CARD_IN_FIELD)` を追加（2枚目ドローの条件欠落、17枚に波及）。
- **WX02-040（v0.450/0.451）:** GRANT_KEYWORD のクラスフィルタ＋ALL対象＋期間（ターン終了時まで/次のあなたのターン）をストリップ前に抽出。**QA準拠の「次の自分ターン中に存在する全シグニ（新規召喚含む）に継続付与」をエンジン実装**：PlayerState `field_keyword_grants_next_turn`/`_active`、execGrantKeyword で `duration:NEXT_TURN`＋自全シグニを場全体付与として予約、ターン遷移3パスで予約→active→クリア、hasKeyword/getSigniStatusKeywords に `fieldKeywords` 引数（ランサー判定・UIバッジ）。

- typecheck 0エラー・UNKNOWN 0件維持。`docs/decompile_sheet1.txt` 再生成済み。**続きの照合（WX02-041〜）は ymst が継続。**

---

## FREEZE の自動ダウンを廃止（凍結＝現状維持）＋ down フラグ新設（v0.433, 2026-06-20）

- **症状:** engine の `execFreeze`（単独 FREEZE 経路）が `signi_frozen` に加え **`signi_down` も常時立てて**おり、原文が純「凍結する」（「ダウン」記載なし）のカードまで誤ってダウンさせていた。WIXOSS の凍結は「次の自分のアップフェイズにアップしない」だけで**現在のアップ/ダウン状態は変えない**のが正。
- **修正（engine）:** `FreezeAction.down?: boolean` を新設。`execFreeze`／`applyDirectAction(FREEZE)` ともに **`down:true` のときだけダウンも行う**よう変更（既定は凍結のみ）。`applyDirectAction` 側は元々ダウンしておらず**経路間で挙動が食い違っていた**のも統一。
- **データ/パーサー:** 純「凍結する」は `FREEZE`（down 無し）＝ダウンしない。「ダウンし凍結」は同一対象に適用する **`FREEZE(down:true)`** をパーサーが生成（旧 `SEQUENCE[DOWN, FREEZE]` は選択対象が別々になりうる二重選択バグも併せて解消）。WX01-085 E1/BURST を `FREEZE(down:true)` に（manualEffects＋JSON）。
- **既存 JSON の `SEQUENCE[DOWN, FREEZE]`（「ダウンし凍結」）カードは無修正でも DOWN ステップでダウンするため壊れない**（純凍結だけがダウンしなくなる）。全体対象は元から正。
- **逆翻訳器:** `FREEZE` を `down:true` のとき「ダウンして凍結する」、それ以外「凍結する」と表示。
- typecheck 通過。（既存 JSON の `SEQUENCE[DOWN,FREEZE]` 二重選択は v0.434 で一括変換）

---

## 一時召喚「ターン終了時、それらを場からトラッシュに置く」が全シグニ BANISH（盤面全滅）に誤パース → TRASH_AT_TURN_END へ修正（v0.441, 2026-06-21）

- **症状（致命）:** 「デッキ/トラッシュから…シグニを場に出す。**ターン終了時、それら（=出したカード）を場からトラッシュに置く**」型の一時召喚で、2文目が **`BANISH SIGNI owner:any count:ALL`（両者の全シグニを即座にバニッシュ＝盤面全滅）** に誤パースされていた（単数「それを」は `BANISH any 1`）。parseSentencePart1 の `それ(ら)を場からトラッシュに置く`→BANISH ハンドラが原因。「それら＝直前に出したカード」「トラッシュに置く≠バニッシュ」「ターン終了時＝遅延」をすべて取り違えていた。
- **修正（パーサー・durable）:** `parseSingleSentence` の**プレフィックス除去前**に `^ターン終了時、それら?を(場から)?トラッシュに置く$` を検出し、専用 STUB **`TRASH_AT_TURN_END`** を発行（この STUB は元々 WX02-005 用に engine 実装済みだったが、パーサーが BANISH を吐いていたため未使用だった）。`lastProcessedCards`（直前に出したカード）を `turn_end_field_trash_targets` に登録し、ターン終了処理でトラッシュする既存機構に接続。
- **対象（13枚 / 同型15枚中）:** `WX02-005`/`WX03-047`/`WX13-002`/`WX13-009`/`WX13-017`/`WX13-023`/`WX16-Re20`/`WX20-001`/`WX20-048`/`WX20-Re20`/`WXDi-P03-034`/`WXDi-P13-042`/`WXDi-P15-046`（単数「それを」型＝旧 BANISH 1 も含め全て TRASH_AT_TURN_END へ）。
- **動作範囲:** **SEARCH 系配置**（WX02-005 等）は `resumeSearch` が `lastProcessedCards` を設定するため**ターン終了トラッシュまで完全動作**。**source 系配置**（トラッシュ/手札/エナから出す）は `execAddToField`/`resumeSelectSigniZone` が `lastProcessedCards` を設定しないため **TRASH_AT_TURN_END が空振り＝一時シグニが残る（過剰利益・非致命）**。core resume 関数の `lastProcessedCards` 変更は他カードの「そうした場合」conditional に波及するため見送り。**残課題:** source 系配置の placed カードを `lastProcessedCards` に通す（要慎重なスコープ）。typecheck 0エラー。

---

## 「ライフクロスがクラッシュされたとき」→ ON_LIFE_CRASHED 誤パース（ON_PLAY 化）を恒久修正＋usageLimit/thisCardOnly 補完（v0.440, 2026-06-21）

- **症状:** 【自】「あなたのライフクロス１枚がクラッシュされたとき、〜」が **timing 判定に無く ON_PLAY（場に出たとき）へ誤フォールバック**していた。TODO B節で「7枚を ON_LIFE_CRASHED に修正済」とあったが**JSON 直パッチのみで manualEffects 未登録**だったため、後の再生成で ON_PLAY に逆戻りしていた（WX02-003 で発覚）。
- **修正（パーサー・durable）:** `自` の timing 判定に **`対戦相手のライフ…クラッシュされたとき`→`ON_OPP_LIFE_CRASHED` / `(あなたの)ライフ…クラッシュされたとき`→`ON_LIFE_CRASHED`** を新設。トリガー文を除去し、ON_LIFE_CRASHED は `triggerScope:self`。「〜してもよい」は mandatory:false（任意化対象に ON_LIFE_CRASHED/ON_OPP_LIFE_CRASHED を追加）。
- **副次修正① usageLimit:** パーサーは従来 `《ターン１回》` 等を**一切解析しておらず**（usageLimit は manualEffects のみ）、ライフクラッシュ系が毎回多重発動しうる状態だった。**`《ターン１回》→once_per_turn` / `《ターン２回》→twice_per_turn` / `《ゲーム１回》→once_per_game`** を AUTO/ACTIVATED 全般で付与（CONTINUOUS 除外）。
- **副次修正② thisCardOnly:** 「このシグニをバニッシュする」が「自シグニ1体を任意選択」になっていたのを `thisCardOnly` に（WX14-CB05-E3）。
- **対象再生成（12枚）:** 単純系 `WX02-003`/`WX14-CB05`/`WX21-Re03`/`WXK03-014`/`WXK11-034`/`WD21-011`/`WXDi-P02-037`、parser 効果を含む `PR-426`(E2)、および manualEffects 定義が JSON に未反映で stale だった `WDK17-009`/`WXDi-P06-007`/`WXDi-P16-039`/`WX25-CP1-065` を JSON に反映。さらに usageLimit 追加で差分が出た本セッション既修正の `WXDi-P07-032`/`WX20-002`/`WX25-P1-034`/`WX24-P3-018`/`WX22-001` も再生成（usageLimit のみの差分を確認）。
- **注意（durable 性）:** usageLimit のパーサー化は**全再生成で多数のカードに once_per_turn 等が付与される**広域変更。現状はサージカル再生成のみのため影響は対象カードに限定。全再生成時は退化チェック推奨。typecheck 0エラー。

---

## WX02-002-E1「全領域のカードが【ライフバースト】【エナチャージ１】を持つ」の誤パース修正（v0.439, 2026-06-21）

- **症状:** 【常】「あなたのすべての領域にあるカードは【ライフバースト】【エナチャージ１】を持つ」が `SEQUENCE[GRANT_KEYWORD(ライフバースト→シグニ1体), GRANT_KEYWORD(エナチャージ１→シグニ1体)]` に誤パースされていた（全領域付与でなく「シグニ1体にキーワード付与」＝完全に別物）。本来はライフクロスを含む全領域のカードが追加の【ライフバースト】（効果＝【エナチャージ１】）を得て、クラッシュ時に発動する。
- **修正:** `manualEffects` に `WX02-002-E1` を `GRANT_ALL_ZONE_LIFEBURST`（既存機構）で定義。`burstAction:{ENERGY_CHARGE_FROM_DECK count1}`＝エナチャージ１。**`StubAction.burstAdditive` を新設**：従来の WD14-001/WX17-036 は「ネイティブ【ライフバースト】を持たないカードのみ」に付与だったが、WX02-002 は**既にバーストを持つカードにも追加**（両方を好きな順で使用可）。`BattleScreen` の `grantedBurstExtras` 判定を `burstAdditive || !cardHasNativeBurst` に拡張。
- 逆翻訳器も `GRANT_ALL_ZONE_LIFEBURST` の burstFilter/burstAction/burstAdditive を表示するよう強化。E2/E3（ライフクラッシュ）はパーサー版が正しいため据置（effectId 単位マージ）。typecheck 0エラー。

---

## ADD_TO_FIELD source 欠落族の残り（SEQUENCE/動的フィルタ/名指し/ベット/クラフト/leave）を一括修正（v0.438, 2026-06-21）

v0.435〜0.437 で単純系27効果を直したあとの「残り系統」（TODO の①〜⑥）をパーサー＋engine 改修＋対象カードのみ JSON 再生成（`scripts/regenCards.ts` 新設・全再生成は禁止のため）で durable 修正。**全て「bare ADD_TO_FIELD＝デッキトップ誤配置」を正しい source/cardName に。**

- **① エナ配置の SEQUENCE 形（11効果）:** `WX24-P2-007` / `WX24-P3-086` / `WX25-P3-098` / `WX25-CP1-005` / `WX26-CP1-086`(SONG) / `WXDi-P01-032` / `WXDi-P07-032` / `WXDi-P12-042` / `WXDi-CP02-087` / `WXK09-023` / `WXDi-P03-078`。パーサーは v0.435 で既に「エナゾーンから…場に出す」→source:ENERGY_CARD を生成済みだったが、SEQUENCE 先頭の当該効果は JSON が未再生成で bare のまま残っていた＝対象再生成で解消。`parseStoryFilter` に**重複除去**を追加（条件文＋フィルタ文で ＜ブルアカ＞ が2回出て story:["ブルアカ","ブルアカ"] になる WXDi-CP02-087 を是正）。
- **② 動的フィルタ手札配置＋timing 誤り（2効果）:** `WX11-035`（＜アーム＞が場を離れたとき）/ `WX16-025`（このシグニが場を離れたとき）。**`自`の timing 判定に「場を離れたとき」→`ON_LEAVE_FIELD` を新設**（従来は ON_PLAY 誤判定）。triggerScope/triggerFilter を抽出（「あなたの＜X＞のシグニが」→any_ally＋triggerFilter）。手札配置フィルタに動的 **`levelBelowLeftCard`**（既存）/**`powerBelowLeftCard`（新設）** を付与。`BattleScreen` の `resolveLeaveFieldDynamicFilters` に powerBelowLeftCard 解決（離れたカードのパワー-1）を追加。ON_LEAVE_FIELD/ON_REVEALED_FROM_HAND の「〜してもよい」は mandatory:false（任意トリガー）に。**ON_LEAVE_FIELD 基盤（収集・動的解決）は既存だが JSON で使うカードがゼロだった＝ここで初めて配線。**
- **③ 名指し手札配置（2効果）:** `WXDi-P05-068`（《大罠　ハーメルン》）/ `WX22-036`（《幻竜　ピュートン》）。手札配置ハンドラに **`parseNameFilter`** を追加（cardName フィルタ）。WX22-036 は **`ON_REVEALED_FROM_HAND` 検出を broaden**（「このカードが**＜龍獣＞のシグニの効果によって**手札から公開されたとき」も拾う）。
- **④ ベット/アンコール手札配置（2効果）:** `WXK07-105` / `WX19-017`。現行パーサーで既に正しく source:HAND_CARD を生成（コスト接頭辞後に手札ハンドラ発火）＝対象再生成のみで解消。
- **⑤ クラフト/トークン配置（cardName 機構・7効果）:** `WXDi-P13-062`(サーバントＺＥＲＯ) / `WXDi-CP02-028`(ペロロ人形) / `WXDi-CP02-029`(クルセイダーちゃん) / `WXDi-CP02-041`(雨雲号) / `WX25-CP1-066`(雷ちゃん) / `WX25-P1-034`(幻怪ヤミノザンシ・ON_LEAVE_FIELD) / `WX24-P3-018`(ママ勇者)。パーサーに**「クラフトの《X》…を場に出す」→ `ADD_TO_FIELD{cardName:X}`** ハンドラを新設。**`execAddToField` のトークン生成パスに CardName→CardNum 解決を追加**（InstanceMap は CardNum でカードデータを引くため、原文の《CardName》のままだと能力・パワーが付かない空トークンになっていた）。全角英数・表意空白を半角化して照合（原文《ＺＥＲＯ》とトークン名 "ZERO" の幅差を吸収）。対象トークンは全て battleCardNums にプリロード済み。
- **⑥ トラッシュ/その他（2効果）:** `WX20-002-E3`（エナから＜調理＞配置＝対象再生成で解消）/ `WX22-001-E1`（トラッシュから＜遊具＞2枚配置＝既に正）。`WX22-001-E3`（【起】「このアタックフェイズの間、＜遊具＞が場を離れたとき手札から配置」＝**付与型遅延 leave トリガー**）は機構未実装のため、**bare ADD_TO_FIELD のデッキトップ誤配置を避けて no-op STUB `GRANT_LEAVE_PLACE_PENDING` に**（忠実実装は将来課題）。

**残った近似（要追加実装）:** WXDi-CP02-087 のエナ枚数条件・WXDi-P03-078 の「このシグニよりパワー低い」（ON_TURN_END は動的フィルタ未解決）・WXDi-P05-068 先頭の「カードを2枚引き」（複数文の引き＋配置でドロー脱落）・WXK07-105 のベット条件分岐・WX25-CP1-066-E1 の「場に雷ちゃんがない場合」・WX22-001-E3 の付与型 leave トリガー。クラフトトークンの実機配置（cardName→token 解決）は**要実機検証**。typecheck は本変更による新規エラー 0（既存4件はpull由来）。

---

## 「手札からシグニを場に出す」が bare ADD_TO_FIELD でデッキトップを出していた修正（v0.437, 2026-06-20）

- **症状:** 原文「あなたの手札から[フィルタ]シグニを場に出す」が source 無しの bare `ADD_TO_FIELD` で、デッキトップを出していた（手札から選ばない誤り）。ena/レゾナ系（v0.435/0.436）と同根。
- **修正:** パーサーに「手札から…場に出す」→ `source:HAND_CARD`＋フィルタ（レベル/色/クラス、「Xではない」は `colorExclude`）の分岐を追加（durable）。
- **対象9効果（単純系のみ）:** `WXDi-P00-028-E1/E2`（＜バーチャル＞）/ `WXDi-P09-030-E1/E2` / `WXK08-059-E1`（レベル1＜電機＞）/ `WXDi-P03-071-E1`（赤＜宝石＞）/ `WXDi-P08-031-E1` / `WX20-034-CB-E1`（白以外L3以下＜遊具＞）/ `WX20-039-CB-E1`（赤以外L3以下＜遊具＞）。
- 逆翻訳器: `colorExclude` を「《X》以外の」表示。typecheck 通過。
- **残（要個別対応・bare ADD_TO_FIELD 同根の別系統）:** ①エナ配置の SEQUENCE 形（WX24-P2-007/WX25-P3-098 等・一部は「【出】能力発動しない」抑制や動的フィルタ併発）②動的フィルタ手札配置（WX11-035「より低いレベル」/WX16-025「よりパワー低い」＝timing 誤りも併発）③名指し手札配置（WXDi-P05-068《大罠ハーメルン》/WX22-036《幻竜》）④ベット/アンコール手札配置（WXK07-105/WX19-017）⑤クラフト/トークン配置（WXDi-CP02-028/029/041・WX25-CP1-066 等＝cardName 機構）⑥トラッシュ配置の一部（WX22-001-E3/WX20-002-E3）。

---

## 「ルリグデッキからレゾナを場に出す」が bare ADD_TO_FIELD でデッキトップを出していた修正（v0.436, 2026-06-20）

- **症状:** 原文「あなたのルリグデッキからレゾナ1枚を出現条件を無視して場に出す」が **source 無しの bare `ADD_TO_FIELD`** で、`execAddToField` がデッキトップを場に出していた（レゾナでなく無関係カードが出る誤り）。
- **修正:** 既存 STUB `SUMMON_RESONA_FROM_LRIG_DECK`（ルリグデッキからレゾナを選び出現条件無視で配置・クラスは EffectText から読む）に置換。パーサーにも「ルリグデッキから…レゾナ…場に出す」→ 当 STUB の分岐を追加（generic 場に出す より先・durable）。
- **対象9効果:** `WX10-040-E1` / `WX10-028-BURST` / `WX22-010-E1`（＜遊具＞）/ `WD23-001-E-E2`（＜水獣＞）/ `WX18-020-E3`（＜凶蟲＞）/ `WX19-028-E3`（＜空獣＞か＜地獣＞＝先頭クラスのみ近似）/ `WX16-Re18-E1`（2枚→1枚近似）/ `WX07-050-E1`（レベル3以下白→全クラス1枚近似）/ `WX13-007-E3`（好きな枚数→1枚近似）。
- typecheck 通過。**残（要個別精査）:** `WX20-069-E1`（複雑STUB内の「そうした場合」配置）/ `WD12-007-E1/E2`（timing 誤パース「場を離れたとき」＋重複）は構造が複雑なため未着手。レゾナ選択を1枚固定（候補先頭）・level/color 非対応の STUB 制約は将来拡張余地。

---

## 「エナゾーンからシグニを場に出す」が source 欠落でデッキトップを出していた修正（v0.435, 2026-06-20）

- **症状:** 原文「あなたのエナゾーンから[フィルタ]シグニを対象とし、それを場に出す」が、JSON で **source 無しの bare `ADD_TO_FIELD`** になっており、`execAddToField` の `!src` 分岐が**デッキトップを場に出して**いた（エナから選ばない・全く別のカードが出る誤り）。逆翻訳は「直前に選んだカードを場に出す」と表示されていた。
- **原因（パーサー）:** `parseSentencePart1.ts` の「エナゾーンから…場に出す」ハンドラが `{ ADD_TO_FIELD, owner:self }` のみを返し source を付けていなかった。→ トラッシュ版と同形に修正し `source:{ ENERGY_CARD, filter(レベル/色/クラス), count, upToCount }` を付与（durable）。
- **データ:** 同型**9効果**に `source` を付与: `WX01-099-E1`（逆出）/ `WX17-046-E1`（英知＝3）/ `WX20-068-E1`（英知＝7）/ `WXDi-P06-075-E1` / `WX24-P4-080-E1`（＜植物＞）/ `WX25-P1-094-E1`（緑）/ `WX25-P3-096-E1`（＜天使＞）/ `WXEX1-43-E1`（＜美巧＞）/ `WXEX2-45-E1`（＜遊具＞・レベル3以下）。
- typecheck 通過。**残（別系統・要個別精査）:** 他の bare `ADD_TO_FIELD`（ルリグデッキからレゾナを出現条件無視で場に出す＝WX10-040 等／トラッシュ・手札・トークン配置）は別機構で、デッキトップ誤配置の可能性があるため別途精査が必要。

---

## 既存「ダウンし凍結」82効果を FREEZE(down:true) に一括変換（v0.434, 2026-06-20）

- v0.433 でパーサーは新規分を `FREEZE(down:true)` に直したが、既存プリビルド JSON には旧 `SEQUENCE[DOWN(N), FREEZE(N)]`（同一対象だが**別々に選択でき、ダウン対象と凍結対象が一致しない**二重選択バグ）が残っていた。
- **隣接する `DOWN`→`FREEZE` で target が完全一致するペアを単一 `FREEZE(down:true)` に統合**するスクリプトを全シートに適用（**82効果**・WX04-046-BURST 等）。他ステップ（DRAW/TRASH 等）やネスト SEQUENCE は保持。
- **対象が異なるペアは変換しない**（例 WX08-027-BURST＝「すべてのシグニをダウン」＋「シグニ1体を凍結」は別物なので据置）。
- durable: パーサーが同形を生成するため再パースでも一致。typecheck 通過。

---

## LOOK_AND_REORDER の canTrash がUI未実装だったのを実装（v0.431, 2026-06-20）

- **症状:** `LOOK_AND_REORDER` の `canTrash:true`（「上からN枚見て**好きな枚数をトラッシュに置き**、残りを並べ替えて戻す」）が、**UI にトラッシュ選択が無く** resume 呼び出しも `trashed=[]` 固定だったため、**1枚もトラッシュできず全枚数を並べ替えて戻すだけ**の近似になっていた。データ（JSON）とエンジン（`resumeLookAndReorder` は `trashed[]` 対応済）は正しかった。**`canTrash:true` の全25効果**が該当（WX01-062 ゲット・オープン他）。
- **修正（`BattleScreen` UI のみ）:** LOOK_AND_REORDER モーダルに `inter.canTrash` 時のみ**各カードのトラッシュ・トグル**を追加（トラッシュ指定カードはグレー表示＋取り消し線＋↑↓無効）。確定時に `resumeLookAndReorder(order, 選択したトラッシュ集合, ...)` を渡すよう変更（`[]` 固定を撤廃）。`lookReorderTrash` state を新設しインタラクション切替/確定時にリセット。
- **CPU:** 自己解決は全カード保持（トラッシュ無し）の安全デフォルト（既存の `selected=[...inter.cards]` のまま、trashed は空）。
- typecheck 通過。エンジン・データ変更なし。

---

## 逆翻訳スキャン Sheet1：サーチ/デッキトップ配置の誤り修正（v0.430, 2026-06-20）

WX01-057（正＝条件付き任意配置）を基準に、Sheet1 のサーチ系/デッキトップ配置系4枚を修正。

- **デッキトップ配置の条件・任意欠落（WX01-057 と同型）:** **WX01-036**（カタパル）/ **WX01-059**（ボウ）。「デッキトップを見て、レベルN以下のシグニで他のシグニがない場合に出して**もよい**」が、`LOOK_AND_REORDER` の後に `ADD_TO_FIELD` を**無条件実行**＝条件（レベル／他シグニ無し）も任意（してもよい）も欠落していた。→ `CONDITIONAL{AND[DECK_TOP_MATCHES(シグニ,level), FIELD_COUNT self eq 1]}＋CHOOSE{出す/出さない}`。036 はレベル2以下、059 はレベル1（ちょうど）。
- **「〜以外」の除外が逆になっていた:** **WX01-037**（ヴァルキリー）。「《ヴァルキリー》**以外**のレベル3以下のシグニを探す」が `filter.cardName:'忘得ぬ幻想　ヴァルキリー'`（＝ヴァルキリー**を**探す）になっていた。→ `excludeCardName`（既存フィルタ・engine 対応済）に修正。
- **複数サーチの片方が欠落:** **WX01-038**（ゲット・ダンタリアン）。「白のシグニ1枚**と**赤のシグニ1枚を探す」が**白のみ**だった。→ `SEQUENCE[SEARCH(白), SEARCH(赤)]`（赤の後にシャッフル）。コスト《白×1》《赤×1》は実カード通りで正当。
- **WX01-058 はデータ正**（原文・JSON・コスト一致）。decompiler が SEARCH の「公開し」を表示していなかった**表示バグ**だった。
- **逆翻訳器:** SEARCH の `then` に REVEAL/ADD_TO_HAND があれば「公開し手札に加える」を反映、`excludeCardName` を「《名》以外の」と表示。
- すべて manualEffects＋JSON 両方に登録（durable）。typecheck 通過。

---

## WX01-033 E3 トラッシュ色フィルタ欠落修正（v0.429, 2026-06-20）

- **WX01-033（幻獣神オサキ）E3:** 「あなたのトラッシュからすべての**緑の**カードをデッキに加えてシャッフルする」が source の色フィルタ欠落で**全色を対象**にしていた（過剰）。→ `source.filter:{color:'緑'}` を付与（`execTransferToDeck` は `trashCandidates(state, src.filter)` で既にフィルタを尊重）。manualEffects＋JSON。
- 逆翻訳器: `TRANSFER_TO_DECK` の `shuffle:true` を「デッキに加えてシャッフルする」と表示するよう改善。typecheck 通過。

---

## WX01-033 オサキ「緑のスペル使用時」誤パース修正＋ON_SPELL_USE をシグニへ拡張（v0.428, 2026-06-20）

- **WX01-033（幻獣神オサキ）E1:** 原文「**あなたが緑のスペルを使用したとき**、デッキトップをエナゾーンに置く」が **timing `ON_PLAY`（場に出たとき）に誤パース**＋スペル色フィルタ欠落だった。→ `timing:['ON_SPELL_USE']`＋`triggerFilter:{color:'緑'}`。manualEffects＋JSON。
- **エンジン拡張（`BattleScreen.handleCutinPass`）:** `ON_SPELL_USE` の収集が**キャスターのセンタールリグのみ**だったため、シグニの ON_SPELL_USE（オサキ）が発火しなかった。→ 収集元を**ルリグ＋場のシグニ各ゾーンのトップ**に拡張し、`triggerFilter.color` があれば**使用スペルの色**（`battleCardMap.get(card_num).Color`）で絞るようにした。発火点は handleCutinPass のみ（CPU はカットインパスでここに合流）＝PvP/CPU 両対応。打ち消し経路 `handleCutinUse` はスペル不発のため ON_SPELL_USE を発火しない（正しい）。
- **逆翻訳器:** `ON_SPELL_USE`/`ON_GUARD` を timingJa に追加。`ON_SPELL_USE`＋`triggerFilter.color` を「あなたが緑のスペルを使用したとき」と表示。
- typecheck 通過。（E3 のトラッシュ色フィルタ欠落は v0.429 で修正。上の項を参照）

---

## 逆翻訳スキャン Sheet1：コスト軽減/条件欠落の系統修正（v0.427, 2026-06-20）

逆翻訳スキャンの継続。Sheet1 で5効果の誤りを発見・修正（すべて manualEffects＋JSON 両方＝durable）。

- **コスト軽減の color 文字列めり込みバグ（軽減が全く効かない・全シート走査で2件）:**
  - **WX01-031-E1**（青のスペル《無×1》減）/ **WX03-028-E1**（青のアーツ《無×1》減）の `COST_REDUCTION.reduction[0].color` が **`"無×1"`**（《無×1》の `×1` が色名にめり込み）になっており、`removeNColorFromCost` が `p.color === "無×1"` を実コストの `"無"` に一致できず**軽減が一切発動していなかった**。→ `color: "無", count: 1` に修正。`color: "青"`（スペル/アーツ色フィルタ）は正しかった。全シート走査で該当はこの2件のみ。
- **「対戦相手の手札が0枚の場合」を `IS_MY_TURN` 誤パース:** **WX01-032-E1**（ＳＮＡＴＣＨＥＲ）。スペルは自ターン使用＝常時 true で**常時1ドローの過剰**だった。→ `CONDITIONAL{HAND_COUNT opponent eq 0}`（TRASH 後に評価され「捨てて0枚なら引く」を正しく判定）。
- **「エナ10枚以上ある場合、追加で」条件欠落:** **WX01-034-E1**（修復）。2枚目の `ADD_TO_LIFE` が無条件＝常時2枚追加だった。→ `CONDITIONAL{ENERGY_COUNT self gte 10}` で2枚目をゲート。
- **activeCondition 欠落で常時化:** **WX03-028-E2**（ルリグデッキ0枚であるかぎり基本パワー18000）。条件欠落で常時18000だった。→ `COUNT_THRESHOLD{lrig_deck self eq 0}`。`getLocationCount` に `lrig_deck`/`lrig_trash` を追加（従来 default で0を返していた）。CONTINUOUS POWER_SET の `count:1 owner:self` は既存挙動で「このシグニのみ」に適用されるため target 変更は不要。
- typecheck 通過。

---

## WX01-030 BURST「そうした場合」誤パース修正（v0.425, 2026-06-20）

- **コストは正しい**（《赤》×3＝JSON 赤×3）。精査で BURST の致命バグを発見。
- **WX01-030 BURST:** 「あなたのライフを1枚トラッシュに置く。**そうした場合**、相手ライフを1枚クラッシュ」が「そうした場合」を `IS_MY_TURN` に誤パース。**バーストは相手ターンに発動するため `IS_MY_TURN` は常に false → 相手ライフクラッシュが永久不発**だった。→ `LIFE_CRASH self(triggerBurst:false＝トラッシュへ)` が `lastProcessedCards` を残し、相手 `LIFE_CRASH` を `conditional:true` でゲート。
- **`execLifeCrash` に `conditional` 対応＋`lastProcessedCards` 設定を追加**（「そうした場合」の連鎖用・再利用可能）。`LifeCrashAction.conditional` 新設。
- **E1:** keyword duration を PERMANENT→UNTIL_END_OF_TURN（「ターン終了時まで」）。
- 逆翻訳器: `LIFE_CRASH triggerBurst:false` を「トラッシュに置く（バースト不発）」、`conditional` を「（そうした場合）」と表示。typecheck 通過。

---

## WX01-029-E3「このシグニ」明示＋execGrantKeyword に thisCardOnly 対応（v0.423, 2026-06-20）

- **WX01-029 E3:** 「ターン終了時まで、**このシグニ**は【ダブルクラッシュ】を得る」が target `owner:self count:1`（フィルタ無し）＋keyword `duration:PERMANENT` で、任意自シグニ選択に見えた（runtime は no-filter 自動適用で実害は無かったが曖昧）。→ `thisCardOnly:true` で明示＋keyword duration を `UNTIL_END_OF_TURN` に。
- **`execGrantKeyword` に `thisCardOnly` 対応を追加**（候補を効果元のみに絞り、選択UIを出さず自動付与）。「このシグニは【X】を得る」系で再利用可能。typecheck 通過。

---

## WX01-029-E1「それ」の対象誤り修正（v0.422, 2026-06-20）

- **WX01-029（羅輝石アダマスフィア）E1:** 「あなたの赤のシグニがアタックしたとき、**それ**のパワーを+2000」が `POWER_MODIFY owner:any count:1`（＝任意シグニを自由選択・相手シグニも選べる誤り）だった。「それ」＝アタックした赤シグニなので `targetsTriggerSource:true`（トリガー元を自動対象）に修正。manualEffects＋JSON。
- 逆翻訳器にも `targetsTriggerSource` 表示（「それ（トリガー元シグニ）」）を追加。typecheck 通過。

---

## WX01-023 シグニ「トラッシュに置く」を BANISH 誤用→TRASH に修正（v0.419, 2026-06-20）

- **WX01-023（アーツ）:** 「対戦相手のエナ全てと対戦相手の全シグニを**トラッシュに置く**」が、シグニ側を `BANISH`（＝既定でエナゾーン行き）にしていた誤り。バニッシュではトラッシュに置かれない。→ `TRASH`（SIGNI opponent ALL＝場からトラッシュへ）に修正。manualEffects＋JSON。
- **⚠ 横展開の要監査（TODO 記録）:** 「シグニを**トラッシュに置く**」を `BANISH` にパースした誤りが他にも疑われる（粗スキャンで〜49件・誤検出多数）。要・効果単位の原文照合。再スキャン例: `BANISH(SIGNI,opponent)` かつ当該効果の原文が「…シグニ…をトラッシュに置く」（「バニッシュ」「デッキ」を含まない）。**バニッシュ＝エナ行き／トラッシュに置く＝トラッシュ行き**の区別は機能差が大きいため要対応。

---

## WX01-002-E1 条件欠落修正（v0.417, 2026-06-20）

- **WX01-002（コードアートＲＩＤＥ・ルリグ）E1:** 「あなたの場に**白と赤のシグニがあるかぎり**、あなたのシグニのパワー+3000」が **activeCondition 欠落で常時+3000** だった。→ `AND[HAS_CARD_IN_FIELD(self,色白), HAS_CARD_IN_FIELD(self,色赤)]` を付与。E2/E3 はパーサー生成を維持。manualEffects＋JSON。typecheck 通過。

---

## WD04-013/015/018 誤パース修正＋powerLteLastProcessed 新設（v0.416, 2026-06-20）

- **WD04-013 / WD04-015（シグニ）:** 「アタック時、このシグニのパワーが5000/3000以上の場合にエナチャージ」の **SELF_POWER_GTE 条件が欠落**し常時チャージだった。→ `condition: SELF_POWER_GTE` を付与。
- **WD04-018（スペル）:** 「アップシグニ1体をダウン→そのシグニのパワー以下の相手シグニ1体バニッシュ」が、①「そうした場合」を `IS_MY_TURN` に誤パース、②「そのシグニのパワー以下」フィルタ欠落（任意シグニをバニッシュできる過剰）だった。
  - **新フィルタ `TargetFilter.powerLteLastProcessed`:** パワーが `lastProcessedCards[0]` の実効パワー以下 → `resolveDynamicFilter` が `powerRange.max` に解決（`execBanish` に lastProcessedCards／effectivePowers を渡すよう拡張）。`resumeSelectTarget` は対象適用後 `lastProcessedCards=選択` を立てるため、`SEQUENCE[DOWN, BANISH{powerLteLastProcessed, conditional:true}]` で「ダウンしたそのシグニのパワー以下」を正しく解決し、`conditional` でダウン成立をゲート。
- 逆翻訳器にも `powerLteLastProcessed` 表示を追加。typecheck 通過、verify 安定。

---

## フラット化 CONTINUOUS BANISH 27件を manualEffects へ昇格＝durable 化（v0.415, 2026-06-20）

- **v0.414 の JSON 修正を manualEffects に昇格し再生成耐性を獲得。** 修正済みプリビルド JSON から27件の該当 effectId を抽出して `MANUAL_EFFECTS` に登録（`mergeManualEffects` が effectId 単位で上書き）。
- **検証:** `card.effects` 無し（＝パーサー再パース＋manualEffects マージ）経路でも有害な非optional CONTINUOUS BANISH が **0件**＝`build:effects` 全再生成しても上書きが効く。typecheck 通過、verify 安定。
- **補足修正:** WX21-052 の `selfTrashCost` は `EffectTarget` でなく `BanishAction` 直下のフラグだったため移動。

---

## 有害フラット化 CONTINUOUS BANISH 27件を一括本実装（v0.414, 2026-06-20）

- **TODO F の再発27件（非optional・mandatory:true・activeCondition無しの CONTINUOUS BANISH＝runtime で常時バニッシュ）をプリビルド JSON で一括修正。残存0件を確認。**
- **条件付き granted AUTO 型（中央/パワー/覚醒/血晶武装/手札捨て/楓/下カード 等）:** WX05-021・WX10-063・WXK07-044・PR-288・PR-426・WXDi-P07-060・WDK08-L11・WDK16-06H・WXDi-P05-034・WXK03-034・WXK03-056・WX20-Re18 を `ON_ATTACK_SIGNI`＋各 condition（SELF_POWER_GTE/THIS_CARD_IN_CENTER_ZONE/IS_SELF_AWAKENED/THIS_CARD_IS_ARMORED/TURN_HAND_DISCARD_GTE/LRIG_NAME_CONTAINS/THIS_CARD_HAS_UNDER 等）＋必要なら OPTIONAL_COST に。
- **機構型（既存エンジン機能で復元）:** アクセ＝GRANT_ACCE_HOST_ABILITY（WX16-045/WX18-076/WX20-072/SP27-015）／ソウル＝GRANT_SOUL_HOST_ABILITY（WXDi-D07-003/WXDi-P04-015）／上シグニ＝GRANT_SIGNI_ABOVE_ABILITY（WXDi-P15-061）／場全体＝GRANT_FIELD_SIGNI_ABILITY（WX13-034/WX21-052）／全領域LB＝GRANT_ALL_ZONE_LIFEBURST（WD14-001）／公開バニッシュ＝REVEAL_UNTIL_BANISH_SAME_LEVEL（WX17-038）／閾値書換＝BANISH_THRESHOLD_BOOST_7_15（WX09-027）。
- **その他:** WX25-P3-057（覚醒中ターン終了時の自己バニッシュ）／WX09-019（パワー18000以上でライフクラッシュ時2体）／WXDi-CP02-TK02A（バトルバニッシュ時＝ON_SIGNI_BATTLE）。
- **⚠ durable 化は未:** JSON 直接修正のため `build:effects` 全再生成で失われる。manualEffects 昇格 or parser 修正が次の課題（TODO F 参照）。verify 新規エラーなし（CONTINUOUS→AUTO 化に伴う timing 警告 +2 は軽微）。

---

## WD04-009 引用付与フラット化（有害 CONTINUOUS BANISH）修正＋再発の発見（v0.413, 2026-06-20）

- **WD04-009（幻獣セイリュ）:** 「場のシグニ3体が各15000以上のかぎり【ランサー】＋『【自】アタック時に相手シグニ1体バニッシュ』を得る」が、引用付与をフラット化し **CONTINUOUS BANISH opponent（条件・トリガー欠落＝常時バニッシュの有害誤り）** になっていた。→ E1=条件 `FIELD_SIGNI_POWER_COUNT(15000×3体)` 付きランサー付与／E2=同条件付き `ON_ATTACK_SIGNI` バニッシュ。manualEffects＋JSON。
- **⚠ 同型の再発を27件発見（TODO F に記録）:** 非optional・mandatory:true の CONTINUOUS BANISH がプリビルド JSON に27件残存＝**runtime で実際にバニッシュ適用＝有害**。`calcContinuousSigniMutations`→`removeFromField`。
- **🔑 パイプライン知見の確定:** runtime は `buildEffectsMap` が **`card.effects`（プリビルド JSON）を優先**し `mergeManualEffects` を重ねる＝**プリビルド JSON が runtime の真実源**。JSON 手パッチは効くが `build:effects` 全再生成で manualEffects 未登録分は消える。**durable 修正は manualEffects 登録が必須。**

---

## 「対戦相手の手札を見て選び」系を一括修正＋相手手札を見るUI（v0.412, 2026-06-20）

- **UI（全`opp_hand`選択を網羅）:** `SELECT_TARGET` の `targetScope==='opp_hand'` 選択モーダルで、**対戦相手の手札全体**を表示するよう拡張（候補のみ選択可・非候補はグレー＝0.4不透明）。「対戦相手の手札を見て…選び」で相手手札全体を実際に見て選べる。相手が選ぶ場合（opponentResponds）は相手が自分の手札を見るだけなので無害。
- **パーサー修正（durable・全件＆将来分）:** `parseSentencePart1.ts` の「対戦相手の手札を見てN枚選び（…捨てさせる）」「レベル指定」ハンドラが `actingPlayerSelects:true` を付けていなかった（→`execTrash` で `opponentResponds`＝相手が選ぶに取り違え）。3箇所に付与。
- **プリビルド JSON 一括パッチ（21件）:** 検証済み20カードの「見て…選び」効果（`count===1` の TRASH opp_hand のみ・whitelist effectId 内）に `actingPlayerSelects:true` を付与。混在分岐（WXDi-P13-049＝「対戦相手は3枚捨てる」count3 は据置／スペル分岐 count1 は付与、WXK09-039＝E1付与・BURST「対戦相手は捨てる」は据置）も `count===1` で正しく区別。
- **逆翻訳器:** TRASH 手札の選択者を明示（自分が見て選ぶ／見ないでランダム／相手が選ぶ）。
- 対象例: WX06-CB02/WX07-015/WX14-027/WX17-071/WX19-039/WXK03-001/WXK09-039/WXK10-026/WXK11-023/WDK16-05H/WXDi-P00-006/P03-025/P06-002/P07-025/P08-033/P08-036/P13-049/P14-045/P16-043/WX24-P4-040。typecheck 通過。

---

## WD03-011 手札捨ての選択者修正＋逆翻訳器に選択者表示（v0.411, 2026-06-20）

- **WD03-011（Ｓ・Ｍ・Ｐ）誤り修正:** 【出】「対戦相手の手札を見てレベル１のカード１枚を選び、捨てさせる」が `blind`/`actingPlayerSelects` 無し＝`execTrash` で `opponentResponds=true`（相手が選ぶ）になっていた。本来は「見て…選び」＝**自分が選ぶ**なので `actingPlayerSelects:true` を付与。manualEffects＋プリビルド JSON。
- **逆翻訳器の TRASH 表示強化:** 手札捨ての**選択者**を明示（`blind`→「（見ないでランダム）」／`actingPlayerSelects`→「（自分が見て選ぶ）」／それ以外の相手手札→「（相手が選ぶ）」）＋フィルタ（レベル等）を表示。これにより「誰が選ぶか」の取り違えがスキャンで一目で分かる。
- typecheck 通過。

---

## 専用の手札公開モーダル `REVEAL_CARDS` を新設（v0.410, 2026-06-20）

- **「対戦相手の手札を見て」系の情報アドバンテージを専用モーダルで再現。** v0.409 のログ公開を、閲覧専用モーダルに格上げ。
- **新インタラクション `REVEAL_CARDS`（`PendingInteractionDef`）:** `{ cards, title?, continuation? }`。選択を伴わずカード群を公開表示し、「確認」で `continuation` を実行する。`resumeRevealCards`（effectExecutor）は continuation を実行するだけ（状態変更なし）。
- **`TK3_DECLARE_DISCARD` を2段化:** 数字宣言（CHOOSE）→ `REVEAL_CARDS`（相手手札全体を公開）→ 確認後に新 STUB `TK3_DISCARD_BY_LEVEL` が宣言レベルのシグニを全捨て。効果オーナー（＝見る側）が respond するため、人間の効果なら人間がモーダルで相手手札を視認、CPU の効果なら CPU が自動確認（人間には CPU の手は見せない）。
- **BattleScreen:** `handleEffectInteraction` に `REVEAL_CARDS` 分岐（`resumeRevealCards`）＋モーダル描画（カードを face-up グリッド＋確認ボタン）。CPU 自動解決は `selected=[]` で既存経路に乗る。
- **反映:** types/index＋effectExecutor＋execStubPart1＋BattleScreen。typecheck 通過。WD03-006/WX25-P1-TK3（ダーク・アナライズ）に適用。

---

## TK3_DECLARE_DISCARD に相手手札の公開ログを追加（v0.409, 2026-06-20）

- **WD03-006/WX25-P1-TK3 の「対戦相手の手札を見て」の情報アドバンテージを再現。** 従来は同レベルのシグニを自動で捨てるだけで相手手札全体が見えず、「見て」で得られる**手札情報**が失われていた。
- **修正:** `TK3_DECLARE_DISCARD` 解決時に**対戦相手の手札全体をバトルログに公開**（`対戦相手の手札を見る：<カード名…>`）。捨てる対象が無い場合も公開する。専用の手札公開モーダルは新設せず、ログで情報を可視化（PvP でも相手は自分の手札を既知なので問題なし）。typecheck 通過。

---

## WD03-006 ピーピング・アナライズ（アーツ）誤パース修正（v0.408, 2026-06-20）

- **逆翻訳スキャンで発見。** 「数字１つを宣言する。その後、対戦相手の手札を見て、宣言した数字と同じレベルのシグニをすべて捨てさせる。」が `SEQUENCE[DECLARE_NUMBER, DECLARE_NUMBER]`＝宣言STUBが**重複**し「捨てさせる」処理が欠落していた。
- **修正:** 同一効果の WX25-P1-TK3（ダーク・アナライズ）が既に持つ STUB `TK3_DECLARE_DISCARD`（数字宣言の CHOOSE→相手手札の同レベルシグニを全捨て）に置換。manualEffects＋プリビルド JSON。typecheck 通過。

---

## WD02-007 背炎之陣（アーツ）誤パース修正（v0.406, 2026-06-20）

- **逆翻訳スキャンで発見。** 「手札を３枚捨てる。そうした場合、すべてのシグニをバニッシュする。（あなたのシグニも含まれる）」が二重に誤っていた。
  - ①「そうした場合」を `CONDITIONAL{IS_MY_TURN}` に誤パース（本来は「3枚捨てた場合」）。
  - ②`BANISH owner:'any' count:ALL` は `execBanish` で `ownerState('any')→otherState`＝**相手シグニのみ**バニッシュ＝「あなたのシグニも含まれる」が欠落。
- **修正:** 手札3枚捨てをコスト化（`cost.discard:3`）し、`SEQUENCE[BANISH self ALL, BANISH opponent ALL]` で両者の全シグニをバニッシュ。manualEffects＋プリビルド JSON。typecheck 通過、verify 新規警告なし。

---

## F-3 効果離場型 身代わり（powerReduction）を execBanish に配線（WX06-019）（v0.403, 2026-06-20）

- **対象＝TODO F-3 積み残し「効果離場型」WX06-019（シロナクジ）。** 「あなたの他の＜水獣＞が**対戦相手の効果によって**場を離れる場合、代わりにこのシグニのパワーを-6000してもよい」。バトル経路の対話本実装（v0.401/402）とは別に、**効果バニッシュ経路（`execBanish`）に限定フックを追加**。
- **`findEffectLeavePowerReductionSubstitute`（effectExecutor・純関数）:** victim owner の場に CONTINUOUS `BANISH_SUBSTITUTE{substituteCost.powerReduction}` を持つ protector があり、victim が trigger フィルタに合致（かつ victim≠protector＝「他の」）なら `{protectorNum, reduction}` を返す。
- **`execBanish` の `applyBanish` にフック:** `tgt.owner === 'opponent'`（＝相手効果で victim 側が場を離れる）かつ protector があれば、**victim を残し protector のパワーを -N**（temp_power_mods）してバニッシュを回避。「してもよい」は**自動適用**（pause/resume を伴わない決定論的近似。バトルコアの対話実装に手を入れないため最も安全）。protector 不在・自己効果（tgt.owner==='self'）では従来通り。
- **WX06-019 のデータ修正:** trigger filter が `story:'水獣'`（Dissona用フィールド）だったため `cardClass:'水獣'` に修正（manualEffects＋プリビルド JSON）。
- **近似/限界:** powerReduction 型のみ・自動適用・効果バニッシュ経路のみ（バウンス等は未対応）。犠牲型/コスト払い型の effect-banish 拡張は**バトル経路の実機検証が済むまで保留**（TODO の方針通り）。
- **検証:** `scripts/testBanishSubstitute.ts` 全10アサート通過（回帰なし）。typecheck 通過、verify 新規警告なし。

---

## F-3 コスト払い型 身代わりバニッシュを実装（既存 action.type BANISH_SUBSTITUTE・2枚）（v0.402, 2026-06-20）

**decompileEffects の Sheet1 全件検証で発見した「宣言だけで未実装の機構」を実装。** `action.type: 'BANISH_SUBSTITUTE'`（`substituteCost` 付き＝コストを払ってバニッシュを回避する型）はパーサーが生成・型も存在したが、エンジン/バトルにハンドラが無く**完全な no-op** だった。

- **`collectBanishSubstitutes` をオプション統一型に再設計:** 戻り値を `BanishSubstituteOption[]`（`kind:'sacrifice'` 別シグニを犠牲 ／ `kind:'pay_cost'` コスト払いで victim を残す）に変更し、犠牲型（v0.401 の STUB）とコスト型（既存 action）を1経路に統合。
- **WX10-033（Ｓ・Ｗ・Ｔ）:** 自身バニッシュ時、手札からスペル1枚捨てで回避（`discardSpell:1`）。trigger を `thisCardOnly` に外科パッチして「このシグニ限定」を表現（パーサーは任意シグニと区別できていなかった）。
- **WX11-029（Ｍ・Ｐ・Ｐ）:** 味方バニッシュ時、自身の下からスペル2枚トラッシュで回避（`trashStackSpell:2`）。
- **バトル統合:** v0.401 の再入 pause/resume をオプション対応に拡張。`pending_banish_substitute.options[]` ／ `banish_substitute_choice.option`。pay_cost 適用は victim を場に残しコストを支払う（手札スペル先頭から／下スタックのスペル先頭から自動選択）。UI は選択肢を「《X》を代わりにバニッシュ／手札スペルN枚捨てて回避／下スペルNトラッシュで回避／身代わりしない」で提示。CPU は pay_cost 優先＋弱い犠牲のみのヒューリスティック。
- **対象外:** `WX06-019`（シロナクジ）は「対戦相手の**効果によって場を離れる**」トリガー＋`powerReduction` 型＝バトル外の効果離場フックが要るため未対応（F-3 の効果バニッシュ経路と同じ積み残し）。
- **検証:** `scripts/testBanishSubstitute.ts` を犠牲型＋コスト型10アサートに拡張（discardSpell/trashStackSpell/thisCardOnly/コスト不足、全通過）。typecheck 通過、verify/eslint 新規警告なし。`decompileEffects` に `BANISH_SUBSTITUTE` 逆翻訳も追加。
- **反映:** types（index/effects）＋effectEngine（collectBanishSubstitutes 再設計）＋BattleScreen（decision/apply/UI/handler）＋プリビルド JSON（WX10-033 外科パッチ）。

---

## F-3 optional 身代わりバニッシュ 対話本実装（バトル経路・5枚）（v0.401, 2026-06-20）

**TODO F-3 を対話プロンプトで本実装（バトルバニッシュ経路）。** 旧は全7枚が `CONTINUOUS BANISH optional`＝`calcContinuousSigniMutations` 行397で自動適用されない no-op（＝「身代わりしない」という合法プレイで無害）。これに**「してもよい」の対話選択肢を追加**。

- **新機構 `BANISH_SUBSTITUTE`（CONTINUOUS STUB＋`StubAction.banishSubstitute`）:** victim（バトル防御シグニ＝opTopCardNum）の代わりに sacrifice をバニッシュする任意置換を宣言。2パターン: `self_sacrifice_other`（このシグニを守り、別クラスの他シグニを犠牲＝WX12-024電機/WXEX2-60ウェポン）／`protect_other_sacrifice_self`（victim を守り自身を犠牲＝WX20-055《ライズ》/CP01-032任意他/P10-052）。`oppTurnOnly` で相手ターン限定。
- **`collectBanishSubstitutes`（effectEngine・純関数）:** 防御側 state と victim から、有効な身代わりと犠牲候補を列挙。activeCondition／oppTurnOnly／クラス／《ライズアイコン》（EffectText に【ライズ】）を評価。
- **バトル統合（再入 pause/resume）:** `resolvePendingSigniBattleFor` の勝利バニッシュ分岐で victim 確定前に身代わりを判定。**人間防御=中断**（防御側 state に `pending_banish_substitute` を立てて return、攻撃側 `pending_signi_battle` は保持→決定で再入再開。ライフバースト/ガードと同じクロスクライアント方式）／**CPU防御=ヒューリスティック即決**（自己保護は最弱の他シグニを犠牲／味方保護は victim パワー≥身代わり元なら守る）。決定後はチェーン先頭で「victim を場に残し sacrifice をエナへバニッシュ（チャーム・アクセはトラッシュ）」を適用。CPUドライバ依存に `host_state.banish_substitute_choice` を追加（CPU攻撃・人間防御の再開用）。
- **状態:** `PlayerState.pending_banish_substitute`／`banish_substitute_choice`（ターン遷移リセットに追加）。UI=防御側に「《X》を代わりにバニッシュ／身代わりしない」プロンプト（`handleBanishSubstituteChoice`）。
- **対象5枚:** WX12-024 / WXEX2-60 / WX20-055 / WXDi-CP01-032 / WXDi-P10-052（P10-052 の「【出】で選んだシグニ」は SELECT_OTHER_SIGNI が選択を保存しないため「相手ターン中の他シグニ」で近似）。
- **検証:** `scripts/testBanishSubstitute.ts` で `collectBanishSubstitutes` を網羅検証（クラス絞り込み・ライズ判定・oppTurnOnly・victim=自身除外、全12アサート通過）。typecheck 通過、verify/checkAllEffects 新規警告なし、eslint 新規エラーなし。
- **既知の近似/積み残し:** ①**バトルバニッシュ経路のみ**（効果バニッシュ `execBanish`／バウンス等の場離れは未対応＝v0.393 と同じく execBanish 側フックが要る）。②**対話 pause/resume・CPU即決はヘッドレス検証不可**＝実機（PvP／CPU戦）での動作確認が必要。③`WX25-P1-056`（非バニッシュ離場→バニッシュ置換）と `WX17-075`（置換でない任意ON時バニッシュ）は別機構のため対象外。

---

## F-4 ゲート参照シグニ 近似精緻化3枚（P15-057／P16-054／P16-074）（v0.400, 2026-06-20）

TODO F-4 の「近似精緻化（任意・低優先）」3枚をすべて本実装。いずれも既存機構へ載せ、新規機構追加は collectBanishTriggers の condition/usageLimit 評価のみ。

- **WXDi-P15-057-E1b（LOVIT・相手ターン中シャドウ）:** 「同ゾーンゲートのかぎり、対戦相手のターンの間【シャドウ】を得る」を CONTINUOUS `GRANT_KEYWORD シャドウ self`＋activeCondition `AND[SAME_ZONE_HAS_GATE, TURN_OWNER opponent]` で本実装（旧＝近似省略）。execUtils のシャドウ保護フィルタの `hasCondShadow`（activeCondition 付き self シャドウを `checkActiveCondition` 評価）に既に対応経路があり追加配線不要。
- **WXDi-P16-054-E1b（アキノ・相手効果バニッシュ耐性）:** 「相手ターン中、相手効果でバニッシュされない」を CONTINUOUS `GRANT_PROTECTION{target:self, from:['BANISH'], sourceOwner:opponent}`＋同 activeCondition で本実装（旧＝近似省略）。`collectBanishEffectProtectedSigni` が activeCondition 評価込みで保護判定。
- **WXDi-P16-074-E2（ナナシ・被バニッシュ時に相手ディスカード）:** 「《ターン1回》同ゾーンゲートのあなたのシグニ1体がバニッシュされたとき、相手は手札1枚捨てる」を AUTO `ON_BANISH`／`triggerScope:any_ally`／`usageLimit:once_per_turn`／condition `FIELD_HAS_GATE owner:self` で本実装（旧＝scope self・条件/回数なしの過少発火）。**`collectBanishTriggers` のフィールドトリガー収集（section2/3）に `eff.condition`（`evalUseCondition`）と `usageLimit once_per_turn`（actions_done 照合）の評価を新設**。ON_BANISH の any_ally/any 効果は実装全体で既存ゼロのため既存挙動への影響なし。**近似:** 「同ゾーンゲート」（被バニッシュシグニの離場後ゾーン参照が必要）は「場にゲートがある」で近似。自己被バニッシュ（section1=scope self 限定）は any_ally 収集の対象外。
- **検証:** `scripts/testGateContinuous.ts` を新設しヘッドレス検証（P16-054 耐性＝相手ターン＋ゲートのみ／P15-057 シャドウ＝相手ターン＋ゲートのみ、各3条件）。全テスト通過。typecheck 通過、verifyEffects/checkAllEffects に新規警告なし。
- **反映:** manualEffects＋BattleScreen（collectBanishTriggers 拡張）＋プリビルド JSON（外科パッチ）。
- **これで F-4（THE DOOR ゲート参照シグニ）の積み残しは完全に解消**（残るは P15-058 ピース使用条件等の使用条件近似のみ）。

---

## F-4 場全体への継続シャドウ付与＋WXDi-P15-058-E1 本実装（v0.399, 2026-06-20）

- **新 CONTINUOUS 宣言アクション `GRANT_FIELD_SHADOW`:** 「フィルタに合う場のシグニ全員へ【シャドウ（X）】を継続付与」を表現。`keyword`（符号化済みシャドウキーワード）＋`filter`（例 `inGateZone`）＋`targetOwner`（現状 self のみ）。`calcContinuousSigniMutations` は BANISH/FREEZE/DOWN 以外を実行しないため CONTINUOUS としては安全（executor 到達時も default no-op）。
- **`getFieldGrantedShadowScopes`（keywords.ts 新設）:** 保護対象シグニ `n` が、同じ場の他カードの `GRANT_FIELD_SHADOW` 宣言で得るシャドウスコープを集める。`getShadowScopes` が各カード自身の effects しか読まない弱点を補完する経路。フィルタは `inGateZone`（own_gate_zones）を判定。
- **配線:** シャドウ保護の唯一の経路 `execUtils.selectOrInteract`（`scope === 'opp_field'`）に `getFieldGrantedShadowScopes`＋`evaluateShadowScope` を追加。これで場全体付与シャドウも対象除外に効く。
- **WXDi-P15-058-E1（羅星姫 コスチュム）:** 「同じシグニゾーンに【ゲート】があるあなたのシグニは【シャドウ（スペル）】を得る」を `GRANT_FIELD_SHADOW{keyword:シャドウ(スペル), filter:inGateZone, targetOwner:self}` で本実装（旧＝無害な STUB UNIMPL_GRANTED_ABILITY マーカー）。own_gate_zones のゾーンの自シグニが相手スペル効果の対象から外れる。
- **検証:** `scripts/testFieldShadow.ts` を新設しヘッドレス検証（ゲートゾーンのシグニのみスペルから保護／ゲートなしゾーン・シグニ効果・ゲート未設置では非保護）。全テスト通過。typecheck 通過、verifyEffects/checkAllEffects に新規警告なし。
- **反映:** types/effects（GrantFieldShadowAction）＋keywords（getFieldGrantedShadowScopes）＋execUtils（保護フィルタ配線）＋manualEffects＋プリビルド JSON（外科パッチ）。
- **これで F-4 ゲート参照シグニの本実装はすべて完了**（残る積み残しは P16-074-E2／P16-054-E1／P15-057-E1 の近似精緻化＝低優先のみ）。

---

## F-4 self対象 REMOVE_ABILITIES の thisCardOnly 対応＋WXDi-P15-056-E1 本実装（v0.398, 2026-06-20）

- **`execRemoveAbilities` に `thisCardOnly` フィルタ対応を追加**（frontOfSelf と同型）。「このシグニは能力を失う」を効果元自身のみに限定。
- **WXDi-P15-056-E1（Lスピーカ）:** 無害化マーカー（UNIMPL_GRANTED_ABILITY）から本実装へ。condition `SAME_ZONE_HAS_GATE` の AUTO ON_ATTACK_SIGNI＋`SEQUENCE[OPTIONAL_COST(白白), CONDITIONAL(PAID){REMOVE_ABILITIES self thisCardOnly UNTIL_END_OF_TURN}]`。「LIONがいれば」「このシグニをアップ（再攻撃）」は近似省略。
- **反映:** effectExecutor（execRemoveAbilities）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。
- **残るF-4は WXDi-P15-058-E1（場全体【シャドウ（スペル）】＝getShadowScopes 拡張）のみ。**

---

## F-4 THE DOOR ピース ひらけ！ゲート！（WXDi-P15-003）（v0.397, 2026-06-20）

- **ピースのゲート設置を配線。** ピースは `executeKeyPiece` が `queueCardEffects(['AUTO'],['ON_PLAY'])` で発火させるため、旧 ACTIVATED パースでは発火しなかった。
- **E1=AUTO ON_PLAY → STUB `PLACE_OWN_GATE`**（プレイ時に自シグニゾーンへ【ゲート】設置）。
- **E2=CONTINUOUS `GRANT_LRIG_ABILITY`**（key_piece に残る間センタールリグへ付与＝`collectLrigGrantedEffects` がキーピースを走査）。付与能力＝`【起】エクシード4：【シグニバリア】1つ（STUB GAIN_SIGNI_BARRIER）`／`【起】エクシード4：カード4枚引く（DRAW 4）`。グロウしても key_piece の継続付与なので維持。
- 【使用条件】ドリームチーム3色以上はピース使用条件のため近似省略。
- **これで THE DOOR のゲート設置手段（ピース＋防衛者ルリグ WXDi-P15-010/011 の【起】）と参照シグニ15枚が揃い、アーキタイプが実用レベルで機能する。**
- **反映:** manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチG・WXDi-P15-058＝ゲート参照シグニ完了）（v0.396, 2026-06-20）

- **WXDi-P15-058（コスチュム・宇宙）:** E1=「同ゾーンゲートのあなたのシグニは【シャドウ（スペル）】を得る」→ 場全体への継続シャドウ付与は `getShadowScopes` が他カードの継続 GRANT_KEYWORD を読まないため未実装。無害な STUB `UNIMPL_GRANTED_ABILITY` に置換。E2=「同ゾーンゲートで『APS開始時、《プロフェッサー　防衛者Ｄｒ．タマゴ》がいれば相手シグニ1体に《青》《青》払ってデッキ下』を得る」→ condition `AND[SAME_ZONE_HAS_GATE, LRIG_NAME_CONTAINS self 'タマゴ']`＋`SEQUENCE[OPTIONAL_COST(青青), CONDITIONAL(PAID){TRANSFER_TO_DECK opp1 bottom}]`（タマゴはセンタールリグ名で近似）。
- **これで防衛派 THE DOOR ゲート参照シグニ（15枚）はすべて実装/近似済み**（P15-056-E1・P15-058-E1 は無害化マーカー、P16-074-E2・P16-054-E1 等は近似）。残るF-4はピース `ひらけ！ゲート！`（WXDi-P15-003）のみ。
- **反映:** manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチF・WXDi-P16-059＋GRANT_KEYWORD UNTIL_OPP_TURN_END 修正）（v0.395, 2026-06-20）

- **`execGrantKeyword` のUNTIL_OPP_TURN_END振り分けバグ修正:** 従来は duration によらず `keyword_grants` へ付与していたが、`keyword_grants` は**付与者のターン終了時にクリア**されるため、ターン終了時に付与する `UNTIL_OPP_TURN_END` キーワードが即消えていた。`a.duration === 'UNTIL_OPP_TURN_END'` のとき `keyword_grants_until_opp_turn`（付与者の次ターン開始時クリア＝相手ターンを跨ぐ）へ振り分けるよう修正（シャドウ等の読み取り側は既に両ストアを参照）。
- **WXDi-P16-059（デウス・アーム）:** E1=「同ゾーンゲートで『相手は追加で《無》払わないとガードできない』を得る」→ CONTINUOUS STUB `OPP_GUARD_COST_COLORLESS` に activeCondition `SAME_ZONE_HAS_GATE`（既存ガード税機構 `collectOppGuardExtraColorlessCost` が activeCondition 対応）。E2=「ターン終了時、場ゲートで自シグニ1体に次の相手ターン終了時まで【シャドウ（レベル2以下）】」→ AUTO ON_TURN_END＋condition `FIELD_HAS_GATE`＋GRANT_KEYWORD（`シャドウ:{"levelLte":2}`・UNTIL_OPP_TURN_END）。
- **反映:** effectExecutor（execGrantKeyword 修正）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。
- **残（F-4ゲート参照）:** WXDi-P15-058 のみ（E1=同ゾーンゲートのシグニへ【シャドウ（スペル）】の場全体付与＝`getShadowScopes` の継続付与対応が要る／E2=タマゴ条件＋任意BBでデッキ下）。

---

## F-4 THE DOOR ゲート参照シグニ（バッチE・POWER_MODIFY_PER_HAND_COUNT 新設＋3枚）（v0.394, 2026-06-20）

- **新アクション `POWER_MODIFY_PER_HAND_COUNT`:** 手札N枚につきパワー±M（AUTO実行・スナップショット）。`until: 'UNTIL_OPP_TURN_END'` で `power_mods_until_opp_turn` へ、省略時は `temp_power_mods`。`execPowerModifyPerLifeCount` と同型。
- **WXDi-P16-070（アイン＝サンガ・毒牙）:** E1=同ゾーンゲートで「ターン終了時、相手シグニ1体をデッキ下」→ condition `SAME_ZONE_HAS_GATE` の ON_TURN_END AUTO＋TRANSFER_TO_DECK。E2=「ターン終了時、場ゲートで自シグニ1体に次の相手ターン終了時まで手札1枚につき+1000」→ condition `FIELD_HAS_GATE`＋`POWER_MODIFY_PER_HAND_COUNT`（旧＝STUB GATE 誤パース＝相手ゲート設置の有害動作を解消）。
- **WXDi-P15-056（Lスピーカ・電機）:** E1=「同ゾーンゲートで攻撃時にLION＋WWでアップ＋能力喪失」→ 自己アップ＋thisCardOnly能力喪失が未表現のため**無害な STUB UNIMPL_GRANTED_ABILITY に置換**（旧＝CONTINUOUS REMOVE_ABILITIES self＝自分の能力を消す有害誤りを解消）。E2=「APS開始時、次の相手ターン終了時まで同ゾーンゲートの自シグニ全体+2000」→ ON_ATTACK_PHASE_START AUTO＋POWER_MODIFY self ALL に `inGateZone` フィルタ＋`duration: UNTIL_OPP_TURN_END`。
- **WXDi-P16-054（アキノ・水獣）:** E1=「同ゾーンゲートで相手ターン中+5000＆相手効果でバニッシュ耐性」→ CONTINUOUS POWER_MODIFY self +5000 に activeCondition `AND[TURN_OWNER opponent, SAME_ZONE_HAS_GATE]`（バニッシュ耐性は近似省略）。E2=「アタック時、場ゲートで CHOOSE（相手5000以下バウンス／ドロー2）」→ ON_ATTACK_SIGNI CHOOSE に condition `FIELD_HAS_GATE`（攻撃側自身の ON_ATTACK_SIGNI 収集は eff.condition を評価する＝6277行）。
- **反映:** types/effects＋effectExecutor（新executor＋switch）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 身代わり置換型2枚（WXDi-P06-034 / WXK05-024）（v0.393, 2026-06-20）

- **対象＝TODO F-2 残り最後の2枚（身代わり置換型）。** いずれも旧パースは CONTINUOUS TRASH（`calcContinuousSigniMutations` が BANISH/FREEZE/DOWN 以外を実行しないため**無害な no-op**）。バトルバニッシュ経路の既存置換チェーン（`BATTLE_LEAVE_REPLACE_WITH_DOWN`/`COOKING_BANISH_SUBSTITUTE`/`RISE_BANISH_SUBSTITUTE` 等）に倣って配線。
- **新フィルタ `TargetFilter.centerZoneOnly`（状態ベース）:** 中央のシグニゾーン（index 1）のシグニのみ。`fieldCandidates`／`matchesStateFilter` に追加。
- **WXDi-P06-034（クーフーリン・ライズ）:** E1=「バニッシュされる場合、代わりにアップ状態のこのシグニをダウンし下から1枚＋エナから1枚をトラッシュ」→ CONTINUOUS STUB `BATTLE_LEAVE_REPLACE_DOWN_TRASH_UNDER_ENERGY`。`resolvePendingSigniBattleFor` の置換チェーンに `leaveReplaceDownTUE` 分岐を追加（UP かつ 下カード≥1 かつ エナ≥1 で自動適用＝ダウン＋下1枚/エナ1枚トラッシュして場に残る）。E2=「中央ゾーンのシグニのパワー+3000」→ CONTINUOUS POWER_MODIFY self ALL に `centerZoneOnly`。
- **WXK05-024（アナスタシア・悪魔）:** E1=「＜悪魔＞は場から手札に戻らない」→ `SIGNI_CANT_BOUNCE_FROM_FIELD`（実装済・維持）。E2=「場を離れる場合、代わりに除外」→ CONTINUOUS STUB `BATTLE_LEAVE_REPLACE_WITH_EXILE`。バトルバニッシュ時にエナでなくトラッシュへ送る（除外を**トラッシュで近似**＝既存 `REMOVE_SELF_SIGNI_FROM_GAME` と同じ方針）。`defenderLeaveExile` フラグを通常バニッシュ先計算に追加。E3（トラッシュ発動の【起】）はトラッシュ発動機構が要るためパーサー生成を維持。
- **近似（共通）:** いずれも**バトルバニッシュ経路のみ**対応。効果バニッシュ（`execBanish`）・バウンス等の場離れは未対応（execBanish 側に置換フックがないため。F-3 同様の専用設計が要る）。
- **反映:** types/effects＋execUtils＋effectEngine（centerZoneOnly）＋execStubPart3（STUB no-op登録）＋BattleScreen（置換チェーン2分岐）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチD・WXDi-P15-057）（v0.392, 2026-06-20）

- **WXDi-P15-057（LOVIT・地獣）:** E1=「同ゾーンゲートでパワー+3000＋相手ターン中シャドウ」→ CONTINUOUS POWER_MODIFY self +3000 に activeCondition `SAME_ZONE_HAS_GATE`（シャドウ付与は近似省略・旧＝常時+3000）。E2=「ターン終了時、場ゲートでトラッシュの《ガードアイコン》シグニを《無》払えば手札へ」→ AUTO ON_TURN_END、condition `FIELD_HAS_GATE`、`SEQUENCE[OPTIONAL_COST(無), CONDITIONAL(PAID){TRANSFER_TO_HAND from TRASH_CARD hasGuard}]`（旧＝GRANT_KEYWORD 誤り）。
- **反映:** manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチC・inGateZone フィルタ＋WXDi-P16-062）（v0.391, 2026-06-20）

- **新フィルタ `TargetFilter.inGateZone`（状態ベース）:** 「このシグニと同じシグニゾーンに【ゲート】がある」＝own_gate_zones にゾーンが含まれる。`fieldCandidates`（AUTO 実行）と `matchesStateFilter`（CONTINUOUS パワー）の両方に判定を追加。「同ゾーンゲートのあなたのシグニ」への場全体付与に再利用可能。
- **WXDi-P16-062（マキナ・乗機）:** E1=「同ゾーンゲートで『各APS開始時、相手シグニ1体を相手が《無》払わないと能力消去』を得る」→ **近似**：CONTINUOUS REMOVE_ABILITIES opponent（対面）に activeCondition `SAME_ZONE_HAS_GATE` 付与（旧＝無条件のフリーロック誤り。`collectContinuousAbilitiesRemovedSigni` の opponent 分岐＋`checkActiveCondition` が source の own_gate_zones を見て発火。相手の《無》回避・APS再付与は近似省略）。E2=「同ゾーンゲートのあなたのシグニのパワー+2000」→ CONTINUOUS POWER_MODIFY self ALL に `inGateZone` フィルタ。
- **反映:** types/effects＋execUtils（fieldCandidates）＋effectEngine（matchesStateFilter）＋manualEffects＋プリビルド JSON。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチB・2枚）（v0.390, 2026-06-20）

- **WXDi-P15-059（ノヴァ）:** E1=APS開始時、場ゲートでドロー2・手札1捨て→ condition `FIELD_HAS_GATE` 付与（旧は条件欠落）。E2=アタック時、相手1捨て＋同ゾーンゲートで追加1捨て→ `SEQUENCE[TRASH opp hand1, CONDITIONAL(SAME_ZONE_HAS_GATE){TRASH opp hand1}]`（旧は2枚とも無条件）。`execConditional` は `evalCondition` を `ctx.sourceCardNum` 文脈で評価するため SAME_ZONE_HAS_GATE が攻撃シグニのゾーンで正しく判定される。
- **WXDi-P16-074（ナナシ・古代兵器）:** E1=同ゾーンゲートで「APS開始時、相手シグニ1体に《無》払えば-5000」を得る→ condition `SAME_ZONE_HAS_GATE`＋`SEQUENCE[OPTIONAL_COST(無), CONDITIONAL(PAID_ADDITIONAL_COST){POWER_MODIFY opp -5000}]`（旧＝CONTINUOUS 常時誤り）。E2（ON_BANISH→相手捨て）はゲートゾーン条件・ターン1回を近似省略しパーサー生成を維持。
- **反映:** manualEffects＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-4 THE DOOR ゲート参照シグニ（バッチA・4枚）（v0.389, 2026-06-20）

- **対象＝TODO F-4。** v0.388 の自ゲート基盤（`own_gate_zones`/`SAME_ZONE_HAS_GATE`/`FIELD_HAS_GATE`）の上で防衛派 THE DOOR シグニを実装。いずれも旧パースは CONTINUOUS化等で no-op だったものを修正。
- **WXDi-P15-080（ヒラナ）:** E1=「同ゾーンゲートで『【自】APS開始時、相手シグニ1体を-3000』を得る」→ condition `SAME_ZONE_HAS_GATE` 付き `ON_ATTACK_PHASE_START` AUTO（POWER_MODIFY opponent -3000・ターン終了時まで）。旧＝CONTINUOUS POWER_MODIFY 常時誤り。
- **WXDi-P15-081（レイ）:** E1=同ゾーンゲートで「APS開始時ドロー1」→ condition 付き AUTO。E2=【出】場ゲートでデッキ上3枚スクライ→ `CONDITIONAL(FIELD_HAS_GATE){LOOK_AND_REORDER}`。BURST 維持。
- **WXDi-P15-077（エクス）:** E1=同ゾーンゲートでパワー+10000 → CONTINUOUS POWER_MODIFY self に activeCondition `SAME_ZONE_HAS_GATE`。E2（【出】look5）・BURST 維持。
- **WXDi-P15-078（WOLF）:** E1=同ゾーンゲートで「APS開始時エナチャージ1」→ condition 付き AUTO。E2=APS開始時、場ゲートで相手シグニ1体のバトルバニッシュをエナでなくトラッシュへ→ 旧 count:ALL・条件欠落を condition `FIELD_HAS_GATE`＋count1 に修正。
- **反映:** manualEffects＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 THE DOOR 自ゲート機構を新設（WXDi-P15-076/082）（v0.388, 2026-06-20）

- **対象＝TODO F-2 残り「ゲート条件（自ゲート未モデリング）」WXDi-P15-076 / WXDi-P15-082。** THE DOOR の【ゲート】は**自分のシグニゾーンに置くマーカー**で、既存 `signi_gate_zones`（相手ゾーンに設置するアタック妨害ゲート）とは**別概念**だったため、自ゲート機構を新設。THE DOOR アーキタイプ（P15/P16 で40枚超）全体の基盤になる。
- **状態:** `PlayerState.own_gate_zones?: number[]`（【ゲート】がある自分のシグニゾーン番号。ゾーンのシグニが離れてもゲートは残る＝ルール通り）。
- **条件（新設）:** ActiveCondition／Condition の両方に `SAME_ZONE_HAS_GATE`（効果元シグニと同じゾーンにゲート）と `FIELD_HAS_GATE{owner}`（指定プレイヤーの場にゲートあり）を追加。`checkActiveCondition`（CONTINUOUS パワー修正用）と `evalCondition`／`evalUseCondition`（AUTO の condition 用）で評価。
- **ターゲットフィルタ（新設）:** `TargetFilter.frontOfGateZone`（【ゲート】がある自シグニゾーンの正面の相手シグニ＝各 zi に対し相手ゾーン 2-zi）。`execTransferToDeck` の SIGNI 分岐で解決（frontOfSelf と同型）。
- **配置（STUB 新設＋バグ修正）:** `PLACE_OWN_GATE`（自シグニゾーン選択 CHOOSE）＋`INTERNAL_SET_OWN_GATE`（own_gate_zones へ追加）を `execStubPart3` に新設。**防衛者ルリグ WXDi-P15-010-E3／WXDi-P15-011-E3** の「あなたのシグニゾーンに【ゲート】を置く」は旧パースで**相手ゲートの STUB `GATE` に誤マッピング**されていた（THE DOOR防衛者なのに相手ゾーンに設置するバグ）ため `PLACE_OWN_GATE` に修正＝配置カードの配線とバグ修正を兼ねる。
- **WXDi-P15-076（ムジカ）:** E1=「同じゾーンにゲートあるかぎり『【自】ターン終了時、相手シグニ1体トラッシュ』を得る」→ condition `SAME_ZONE_HAS_GATE` 付き `ON_TURN_END` AUTO。E2=「場にゲートあるかぎりパワー+5000」→ CONTINUOUS POWER_MODIFY self に activeCondition `FIELD_HAS_GATE` 付与。
- **WXDi-P15-082（バン）:** E1=「同じゾーンにゲートあるかぎり『【自】APS開始時、相手は手札1枚捨てる』を得る」→ condition 付き `ON_ATTACK_PHASE_START` AUTO（相手捨て＝`TRASH HAND_CARD opponent`＝opponentResponds で相手が選ぶ）。E2=「ターン終了時、ゲートがある自ゾーンの正面の相手シグニ1体をデッキの一番下に置く」→ `ON_TURN_END` AUTO＋`TRANSFER_TO_DECK{position:bottom,shuffle:false}` source SIGNI opponent filter `frontOfGateZone`。
- **UI:** `StackedSigniSlot` に `hasGate` プロップを追加し、ゲートのあるゾーン（シグニ有無問わず）に「🚪GATE」バッジを表示。`PlayerField` が `state.own_gate_zones` から各ゾーンへ渡す。
- **反映:** types（index/effects）＋effectEngine＋execUtils＋effectExecutor＋execStubPart3＋manualEffects＋プリビルド JSON（外科パッチ）＋BoardComponents。typecheck 通過、verifyEffects 新規警告なし。
- **残（THE DOOR）:** ピース `ひらけ！ゲート！`（WXDi-P15-003）はゲート設置＋ルリグ能力付与の複合で未配線（GRANT_LRIG_ABILITY のみ生成・gate 設置欠落）。他の THE DOOR シグニ（〜40枚）は本基盤の上に個別実装可能。

---

## F-2 相手場への付与の実装（WXDi-P10-072・CPUターンAPS収集を配線）（v0.387, 2026-06-20）

- **対象＝TODO F-2 残り「相手場への付与（機構は v0.377 で用意済・未配線）」WXDi-P10-072。** 旧パース＝CONTINUOUS TRASH SIGNI opponent（no-op）。
- **正体:** 「【常】：対戦相手のシグニは『【自】：あなたのアタックフェイズ開始時、あなたのデッキの一番上のカードをトラッシュに置く。』を得る。」＝対戦相手の場のシグニ全員へ「自分のアタックフェイズ開始時に自己ミル1」する【自】を付与。
- **manualEffects:** E1 を `CONTINUOUS GRANT_FIELD_SIGNI_ABILITY{targetOwner:'opponent', filter:シグニ}`＋付与能力 `AUTO ON_ATTACK_PHASE_START / triggerScope:self / MILL{owner:'self',count:1}` に修正（`targetOwner` 対応は v0.377 で実装済。付与先＝対戦相手の視点で「あなた」＝そのシグニのコントローラー＝`owner:'self'` がコントローラーのデッキに解決される）。BURST はパーサー生成を維持。
- **配線（CPUターンの未収集を解消）:** 人間ターン側は `doPhaseAdvance` の `collectTurnTriggers('ON_ATTACK_PHASE_START')`（MAIN→ATTACK_ARTS 移行）で既に拾える（effectsMap は付与合成済みのため P10-072 を CPU が持ち人間シグニへ付与した場合も自動発火）。**CPUターン側は MAIN→ATTACK_ARTS 移行で APS トリガーを収集していなかった**ため、`cpuTurnAction` の MAIN ブロック末尾（HASTARLIQ／ATTACK_ARTS 遷移と統合）に CPU自身の場シグニの self scope `ON_ATTACK_PHASE_START` AUTO（condition 評価込み）を収集する処理を追加。HASTARLIQ と同一スタックに集約し `turn_phase: ATTACK_ARTS` へ進めながら積む（MAIN に留まると再実行で無限収集になるため）。これは汎用修正で、付与能力に限らず CPU 自身のネイティブ `ON_ATTACK_PHASE_START` 能力も発火するようになる。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）＋`BattleScreen.tsx`。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 シグニ犠牲コスト型の実装（バッチ10・WXK10-039）（v0.386, 2026-06-20）

- **対象＝TODO F-2「シグニ犠牲コスト型」。** 「他の＜原子＞2体をトラッシュしないかぎり自己トラッシュ」を CHOOSE で実装。
- **`execTrash` の SIGNI 分岐に `excludeSelf` 対応を追加＋`TargetFilter.excludeSelf` を新設:** 「あなたの他の＜原子＞のシグニ」を効果元自身を除いた候補に限定（thisCardOnly と対をなす）。
- **WXK10-039（ＣＨ４）:** E1「【出】：他の＜原子＞2体をトラッシュしないかぎり、このシグニをトラッシュ」を `ON_PLAY`→`CHOOSE`（「他の原子2体をトラッシュ」＝`FIELD_CLASS_COUNT(原子)≥3` でのみ選択可／「このシグニを自己トラッシュ」＝thisCardOnly）で実装。他の原子が2体未満なら自己トラッシュのみ選択可。【アサシン】は静的キーワードで自動判定。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 自己犠牲コスト型の実装（バッチ9・WXDi-P04-040）（v0.385, 2026-06-20）

- **対象＝TODO F-2「別形の誤解析」のうち自己犠牲（pay-or-sacrifice）型1枚。** 引用付与型とは別の誤フラット化（CONTINUOUS TRASH self）。
- **`execTrash` の SIGNI 分岐に `thisCardOnly` 対応を追加:** 「このシグニを場からトラッシュに置く」を効果元自身のみへ限定（従来 execBanish のみ対応。`fieldCandidates` 後に `ctx.sourceCardNum` で絞り込み）。
- **WXDi-P04-040（イバラキドウジ）:** E1「【自】アタックフェイズ開始時、《無×3》を支払わないかぎり、このシグニを場からトラッシュに置く」を `ON_ATTACK_PHASE_START`→`SEQUENCE[OPTIONAL_COST(無×3), CONDITIONAL(PAID_ADDITIONAL_COST){then:noop, else:このシグニを自己トラッシュ}]` で実装（既存の OPTIONAL_COST 直後 CONDITIONAL ＝pay→then/skip→else パターンに乗る）。【ランサー】は静的キーワードのためテキストから自動判定。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ8・ダメージ時 timing 新設 WX21-054）（v0.384, 2026-06-20）

- **対象＝TODO F-2「専用 timing 欠如（ダメージ時）」。** 「このシグニが対戦相手にダメージを与えたとき」に相当する timing が無かったため新設。
- **`ON_SIGNI_DAMAGE` timing を新設:** 「正面が空き（またはアサシン）で相手ライフをクラッシュした＝ダメージを与えたとき」。`resolvePendingSigniBattleFor`（シグニアタック解決）のライフクラッシュ分岐で `dealtSigniDamage` を立て、Phase 2 のトリガー収集で攻撃側シグニ自身の `ON_SIGNI_DAMAGE` AUTO を `eff.condition` 評価込みで収集し `allTriggers` に追加。ルリグアタック・追加ゾーンバニッシュでは発火しない（シグニのライフクラッシュのみ）。
- **WX21-054（ディノス）:** E1 を `ON_SIGNI_DAMAGE`＋`condition: ENERGY_COUNT(opponent,gte,5)`→相手エナ1枚トラッシュ に修正。E2（手札公開 or 自己トラッシュ）と BURST はパーサー生成を維持。
- **近似:** WXDi-P05-069 のフリップアタック経路（別ハンドラ）でのライフクラッシュは未収集（通常アタックでは発火）。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E1 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ7・WXK04-048 自己付与＋アクセ付与）（v0.383, 2026-06-20）

- **対象＝TODO F-2「アクセ付与併用＋任意コスト」。** 2能力とも CONTINUOUS TRASH に誤フラット化されていたものを実装。
- **`THIS_CARD_IS_ACCED` 条件を新設（`evalCondition`）:** 「このシグニに【アクセ】が付いているかぎり」。`sourceCardNum` のゾーンの `signi_acce` で判定（ActiveCondition `IS_SELF_ACCED` の Condition 版）。
- **WXK04-048（アイスケーキ）:**
  - E1: アクセ付き条件付き AUTO `ON_ATTACK_SIGNI`。任意《青》コストは既存パターン `SEQUENCE[STUB OPTIONAL_COST(costColors:['青']), CONDITIONAL(PAID_ADDITIONAL_COST)→相手手札1枚捨て]` で表現。
  - E2: `GRANT_ACCE_HOST_ABILITY{filter: レベル3以上}`→ホストシグニへ `ON_ATTACK_SIGNI`→相手手札1枚捨てを付与（既存 `collectGrantedFromAcce` 経由）。
  - BURST はパーサー生成を維持。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E1/E2 外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ6・全領域LIFE_BURST付与 WX17-036）（v0.382, 2026-06-20）

- **対象＝TODO F-2「全領域 LIFE_BURST 付与」。** 「あなたのすべての領域にある＜怪異＞のシグニであるカードは【ライフバースト】『…』を持つ」を、既存の `GRANT_ALL_ZONE_LIFEBURST`（WD14-001 用）機構を**フィルタ＋付与アクション対応**に拡張して実装。
- **機構拡張（`StubAction` に2フィールド追加）:** `burstFilter?: TargetFilter`（付与対象の絞り込み。省略時＝全カード＝WD14-001）／`burstAction?: EffectAction`（付与する【ライフバースト】のアクション。省略時＝相手シグニ1体バニッシュ＝WD14-001）。**WD14-001 は両方とも省略のため挙動完全不変。**
- **BattleScreen の付与バースト判定をフィルタ対応に:** `controlsAllZoneBurstGrant(boolean)` を `getAllZoneBurstGrant(→STUB|null)`＋`matchesAllZoneBurstGrant(cardNum,state)` に置換。クラッシュされたカードが `burstFilter` に一致する場合のみ付与バーストを有効化。`grantedBurstEntry` は `grant.burstAction` を使用（無ければ既定 BANISH）。`effectiveHasBurst`／二重クラッシュ UI／付与バースト追加（8313 付近）の3経路を更新。
- **WX17-036（ブラウニー）:** E1 を CONTINUOUS `STUB GRANT_ALL_ZONE_LIFEBURST`＋`burstFilter:{シグニ,怪異}`＋`burstAction: TRASH 相手シグニ1体` に修正。WX17-036 が場にある間、自分の全領域（手札/デッキ/トラッシュ/ライフ）の＜怪異＞シグニがライフクラッシュ時にこのバーストを使える。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ5・ルリグ付与 WXDi-P05-032）（v0.381, 2026-06-20）

- **対象＝TODO F-2「ルリグへの付与」。** 「あなたのセンタールリグは『【自】…』を得る」型を、既存 `GRANT_LRIG_ABILITY`（CONTINUOUS 宣言→`collectLrigGrantedEffects` がセンタールリグへ付与）で実装。
- **配線追加（BattleScreen `performLrigAttack`）:** ON_ATTACK_LRIG 収集が `effectsMap.get(lrigNum)`／`lrig_granted_auto_effects`／コピー能力のみで、**CONTINUOUS GRANT_LRIG_ABILITY 由来（`collectLrigGrantedEffects`）の ON_ATTACK_LRIG が漏れていた**。`collectLrigGrantedEffects(my, op, …)` の ON_ATTACK_LRIG 分を `onAttackEffects` に追加。
- **WXDi-P05-032（ゲイヴォルグ）:** E1 を CONTINUOUS `GRANT_LRIG_ABILITY`（付与＝`ON_ATTACK_LRIG`＋`once_per_turn`→相手シグニ1体トラッシュ）に修正。E2（アタックフェイズ開始時に白シグニダウン→ドロー）はパーサー生成を維持。付与 AUTO は活性化 UI（`grantedActionsMA`＝ACTIVATED 限定）には出ない。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E1 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ4・WXDi-P02-068＋ON_SIGNI_BATTLE 条件評価）（v0.380, 2026-06-20）

- **ON_SIGNI_BATTLE 収集に condition 評価を追加:** `collectBattleTrig`（BattleScreen）が `eff.condition` を無視していたため、`evalUseCondition` による発動条件評価を追加（攻撃側=`newMyState`／防御側=`newOpState` を基準）。他の AUTO 収集経路（ON_ATTACK_SIGNI／collectTurnTriggers）と整合。既存の ON_SIGNI_BATTLE カード（condition なし）には影響なし。
- **WXDi-P02-068（ヒジカタ）:** E2「【常】このターンに手札を２枚以上捨てていたかぎり、『【自】バトルによって相手シグニをバニッシュしたとき、相手手札を見ないで１枚捨てさせる』を得る」を、`ON_SIGNI_BATTLE`＋`condition: TURN_HAND_DISCARD_GTE(2)`→`TRASH HAND opponent blind` に修正。「バトルによってバニッシュした」勝利限定はバッチ2と同じくバトル成立時で近似。E1（手札1枚以上捨て→+3000、条件欠落は別の軽微な未対応）はパーサー生成を維持。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E2 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ3・上シグニ付与 WXDi-P15-060／P15-064）（v0.379, 2026-06-20）

- **対象＝TODO F-2「上シグニ付与」。** 「このカードの上にある＜解放派＞のシグニは『【自】…』を得る」型を、既存 `GRANT_SIGNI_ABOVE_ABILITY`（`collectGrantedFromUnderSigni` Pattern B が下カードから上シグニへ付与し augMap へ合成）で実装。新規機構なし。
- **WXDi-P15-060（遊月//THE DOOR）:** E2 を `GRANT_SIGNI_ABOVE_ABILITY{filter:解放派}`→付与能力 `ON_ATTACK_PHASE_START`→相手エナの「相手センターと共通しない色」1枚トラッシュ（`colorNotMatchesLrig`、バッチ2と同じく対象オーナー基準で解決）。E1（下にカードがあるかぎり+4000）・BURST はパーサー生成を維持。
- **WXDi-P15-064（アロス・ピルルク//THE DOOR）:** E2 を `GRANT_SIGNI_ABOVE_ABILITY{filter:解放派}`→付与能力 `ON_ATTACK_PHASE_START`→`SEQUENCE[手札1枚捨て, CONDITIONAL(IS_MY_TURN)→相手手札を見ないで1枚捨てさせる(blind)]`。「捨ててもよい」の任意性は同カード E1 の生成パターンに合わせ近似。E1（自身の同型能力）・BURST は維持。
- **反映:** `manualEffects.ts`＋プリビルド JSON（E2 のみ外科パッチ）。typecheck 通過、verifyEffects 新規警告なし。

---

## F-2 引用付与トリガーの実装（バッチ2・WX12-018／WXDi-P09-058）（v0.378, 2026-06-20）

- **対象＝TODO F-2 の続き。** バッチ1（v0.377）の方針（「〜であるかぎり『【自】…』を得る」＝condition 付き AUTO トリガー）を踏襲し、汎用条件を足して2枚を追加実装。
- **汎用条件を2つ新設（`evalCondition`/execUtils）:**
  - `LRIG_TRASH_COUNT { cardType?, operator, value }` — ルリグトラッシュの（cardType 一致）枚数。「ルリグトラッシュにアーツが4枚以上」等。
  - `FIELD_CLASS_COUNT { owner, story, operator, value }` — 場のシグニのうち CardClass が story を含む数。「場に＜天使＞が3体」等（既存 FIELD_COUNT はクラス未対応のため新設）。
- **WX12-018（ガブリエルト）:** E2「【常】ルリグトラッシュにアーツ4枚以上のかぎり、『【自】アタック時、場に＜天使＞3体なら相手の全シグニをトラッシュ』を得る」を、`ON_ATTACK_SIGNI`＋`condition: AND[LRIG_TRASH_COUNT(アーツ,gte,4), FIELD_CLASS_COUNT(self,天使,gte,3)]`→`TRASH SIGNI opponent ALL` に修正。E1（GRANT_PROTECTION）と BURST はパーサー生成を維持。
- **WXDi-P09-058（LOVIT//メモリア）:** 2能力とも誤パース（E1=CONTINUOUS TRASH ENERGY、E2=ON_PLAY AWAKEN＝召喚時覚醒の誤り）を修正。
  - E1: `ON_TURN_END`＋`condition: THIS_CARD_IS_AWAKENED`→相手エナ1枚トラッシュ。「対戦相手のセンタールリグと共通しない色」は energy 対象で既存 `colorNotMatchesLrig` が**対象オーナー（相手）のルリグ基準**で `colorExclude` へ解決される（effectExecutor の ENERGY_CARD 経路）ため、追加機構なしで忠実表現。
  - E2: `ON_SIGNI_BATTLE`→`AWAKEN_SIGNI`（自身覚醒）。**近似**: 「バトルによってバニッシュしたとき」の勝利限定は専用情報がないため、バトル成立時に発火（実用上ほぼ一致）。E2 の誤った召喚時覚醒を撤去したことで E1 の覚醒ゲートが正しく機能する。
- **反映:** `manualEffects.ts`＋プリビルド JSON（外科パッチ）。typecheck 通過、verifyEffects は新規警告なし（既知の WX06-029 のみ）。

---

## F-2 引用付与トリガー能力のフラット化誤解析を実装開始（バッチ1・3枚＋機構）（v0.377, 2026-06-20）

- **対象＝TODO F-2:** 「このシグニは『【自】…』を得る（かぎり）」型の引用付与能力が、内側 trigger を失って **CONTINUOUS TRASH にフラット化**され `calcContinuousSigniMutations`（行395）で no-op 化していた約19枚。監査で無害確定済みだが効果未実装だった。
- **方針の確定（機構は既存）:** 「〜であるかぎり『【自】…』を得る」型は、エンジンの **condition 付き AUTO トリガー**として表現すれば既存の収集経路が発火する（`collectTurnTriggers` 行2931／ON_ATTACK_SIGNI 収集 行6275 がいずれも `evalUseCondition(e.condition)` で発動条件を評価する確立済みパターン）。場全体への付与は既存の `GRANT_FIELD_SIGNI_ABILITY`＋`collectGrantedFromLayer`（augMap へ合成）に乗る。**新規の大規模機構は不要**で、データ表現の付け替えが主作業と判明。
- **小規模な機構追加（2点）:**
  - `LRIG_COLOR { owner, color }` 条件を新設（Condition／ActiveCondition 両方）。`evalCondition`(execUtils)・`checkActiveCondition`(effectEngine) にセンタールリグの Color 照合を実装。WX06-029 の「センタールリグが青で」用。
  - `GrantFieldSigniAbilityAction.targetOwner?: Owner` を新設し `collectGrantedFromLayer` を付与先オーナー別（自場／相手場）に分岐。`targetOwner:'opponent'` で相手シグニ全体へ付与可能に（WXDi-P10-072 等の足場。今回は未配線）。
- **実装した3枚（ON_ATTACK_SIGNI 経路＝最も検証が確実なもの）:**
  - **WX06-029（Ｏ・Ｓ・Ｓ）:** AUTO `ON_ATTACK_SIGNI`＋`condition: AND[LRIG_COLOR(self,青), THIS_CARD_IN_CENTER_ZONE]`→相手手札1枚捨て。
  - **WXDi-P04-082（ブルータス）:** AUTO `ON_ATTACK_SIGNI`＋`condition: THIS_CARD_IN_CENTER_ZONE`→`CHOOSE`（自分／対戦相手のデッキ上4枚を mill）。
  - **WXDi-P15-098（アオトラ）:** `GRANT_FIELD_SIGNI_ABILITY{filter:色黒}`→付与能力 `ON_ATTACK_SIGNI`→相手デッキ上1枚 mill。BURST はパーサー生成を維持。
- **反映:** `manualEffects.ts`（effectId 一致で JSON を上書き＝実行時に有効）＋プリビルド JSON（`effects_WX.json`/`effects_WXDi.json`、現在は minify 形式）に同内容を外科パッチ。全再生成は回避。
- **既知の無害な警告:** `verifyEffects` が WX06-029 に「【常】に対応する CONTINUOUS が無い」を1件出すが、「【常】…を得る」を condition 付き AUTO で表現したことによるヒューリスティックの誤検出（TODO E 節の既知課題）。ゲーム動作には影響しない。
- **残（TODO F-2 に詳細）:** ゲート条件・上シグニ付与・ルリグ付与・相手場付与の配線・複雑色条件（対戦相手センターと共通しない色）・全領域 LIFE_BURST 付与（WX17-036）・専用 timing 欠如（ダメージ時 WX21-054／バトルバニッシュ時 WXDi-P02-068）、および別形の誤解析（自己犠牲コスト・置換引用：WXDi-P04-040/WXDi-P06-034/WXK05-024/WXK10-039）。

## 動的キーワード付与（CONTINUOUS GRANT_KEYWORD）のバッジ表示を修正（v0.376, 2026-06-20）

- **症状（ユーザー報告）:** WD04-010「幻獣　ミスザク」（【常】パワー10000以上のかぎりランサーを得る）のように、条件達成で動的に得るキーワードの**バッジが表示されない**。他の動的変化も同様にバッジが付かない可能性。
- **原因:** バッジ判定 `getSigniStatusKeywords`（BoardComponents）が「テキストの固有【kw】（ただし『を得る』形は除外）」と「`keyword_grants` 状態（解決済み付与）」のみを参照し、**CONTINUOUS GRANT_KEYWORD の activeCondition を評価していなかった**。WD04-010 の付与は `SELF_POWER_THRESHOLD` 条件付きで毎フレーム変動するため `keyword_grants` には書かれず、テキストの「【ランサー】を得る」も除外対象で、結果バッジ非表示。バトル処理（`hasGrantedKeyword`/`contGrantedKeywords`, BattleScreen 6468-6474）では条件評価済みのため**ゲーム上のランサーは機能していた**＝表示のみの不整合。
- **修正:**
  - エンジンに `collectContinuousGrantedKeywords(ownerState, otherState, isOwnerTurn, effectsMap, cardMap, effectivePowers)` を新設。各シグニ instanceId 単位で、CONTINUOUS GRANT_KEYWORD のうち activeCondition を満たす付与を収集（自己付与「このシグニは…を得る」＝count:1/source自身、場全体付与＝count:ALL/filter一致の両対応）。
  - BattleScreen で `dynamicKeywords`（自分/相手ボード分）を `effectivePowers` 依存の useMemo で算出し、両 `PlayerField` に渡す。
  - `getSigniStatusKeywords` に `dynamicKeywords` 引数を追加し、`has(kw)` 判定に動的付与を含める。
- **波及:** WD04-010 以外の動的キーワード（パワー閾値・場の状況などで変動する CONTINUOUS ランサー/アサシン/ダブルクラッシュ等）のバッジも正しく表示・非表示されるようになる。
- **検証:** collector を WD04-010 相当で単体確認（power12000→`["ランサー"]` / power8000→`{}`）。

---

## spell-cut-in に使用条件評価を追加＋WX17-031 凶蟲条件を強制（v0.375, 2026-06-20）

- **症状:** spell-cut-in 候補収集（`cutinCandidates`）が各カットイン効果の `eff.condition` を評価していなかったため、WX17-031「§ヤシガニラ§」の【起】《スペルカットイン》が「あなたの場に＜凶蟲＞のシグニがある場合」条件を無視して常に発動候補に出ていた。
- **修正（BattleScreen.cutinCandidates）:** lrig_field／signi_field／hand の3ソースの push 直前に `if (eff.condition && !evalUseCondition(eff.condition, my, op, battleCardMap, srcNum, bs.turn_phase, effectivePowers)) return;` を追加。条件を満たさないカットインは候補から除外。
- **WX17-031-E3 に条件付与:** パーサーは文中条件「対象とし、あなたの場に＜凶蟲＞のシグニがある場合、それの効果を打ち消す」を抽出できていなかったため、JSON に `condition: HAS_CARD_IN_FIELD{owner:self, filter:{cardType:シグニ, story:凶蟲}}` を外科パッチ（`story`/`cardClass` とも `CardClass.includes` で照合されるため凶蟲に一致）。
- **退化なし確認:** 他のSPELL_CUTIN条件持ちは WX07-014/WX08-018 の `COND_STUB`（"クロス状態のシグニがある"）のみで、`evalUseCondition` は `COND_STUB→true` を返すため従来通り候補に出る（影響なし）。
- **残（近似）:** WX17-031 の凶蟲条件は「カットインを発動候補に出すか」のゲートとして強制。厳密には「カットインは使えるが凶蟲がないと打ち消さない」だが、打ち消さないカットインは無意味なため発動候補から除外で実用上同等。文中条件のパーサー抽出は未対応（同型カードが増えたら parser 化を検討）。

---

## WX19-045 ウィルス充填（合計N個になるように置く）を PLACE_VIRUS fillToTotal で正式実装（v0.374, 2026-06-20）

- **対象:** WX19-045「羅菌　ポレン」E1「対戦相手の場にある【ウィルス】の合計が２つになるように、対戦相手のシグニゾーンに【ウィルス】を置く」（v0.373 で手札発動は可能になったが action は STUB `PLACE_VIRUS_TO_2` の空きゾーン自動配置近似だった）。
- **PLACE_VIRUS に fillToTotal を新設:** `PlaceVirusAction.fillToTotal?: number`。`execPlaceVirus` で指定時は配置数 = `max(0, fillToTotal - 現在のウィルス合計)` を算出し、`SELECT_VIRUS_ZONE`（`remainingZones = min(needed, 空きゾーン数)`）で**配置先をプレイヤーが選択**して置く（既存の `resumeSelectVirusZone` 複数ゾーンループに乗る）。既に合計値に達していれば何もしない。
- **データ:** `manualEffects.ts` の WX19-045-E1 を STUB から `PLACE_VIRUS{targetOwner:opponent, zoneCount:2, virusCount:1, fillToTotal:2}` へ。プリビルド JSON も同 action に外科パッチ。
- **パーサー修正（parseSentencePart4.ts）:** 「【ウィルス】の合計がNつになるように…シグニゾーンに【ウィルス】を置く」を、誤った `STUB REMOVE_VIRUS` から `PLACE_VIRUS{fillToTotal:N}` へ（Nを抽出）。今後の同型カードも正しく解析。
- **改善点:** 旧 STUB はゾーン0,1,2の順で自動配置だったが、本実装は配置先（＝感染させる相手シグニ）をプレイヤーが選べる。旧 STUB executor `PLACE_VIRUS_TO_2`（execStubPart2）は他参照がないが念のため残置。

---

## 手札からこのカードを捨てて発動する【起】（WX17-031系9枚）を配線（v0.373, 2026-06-20）

- **症状:** 「【起】《アタックフェイズアイコン／スペルカットインアイコン》手札からこのカードを捨てる：…」という手札発動の【起】9枚（WX17-031/WX18-029/WX18-053/WX18-055/WX19-022/WX19-045/WX21-030/WXK11-067/WXDi-P08-070）が、ほぼ全て発動不能だった。B節「手札からの自己起動＋spell-cut-in 割り込み」の対象。
- **原因＝機構は既存・配線漏れ:** 手札発動の UI/ハンドラ（`getMyHandCardActions` の `handActivated` 判定→`setPendingHandActivated`→`executeHandActivated`：エナ＋自己捨てコスト支払い＋スタック積み＋`ON_DISCARDED_AS_COST` 収集）も、spell-cut-in 窓（`cutInOptions` が hand を走査）も**既に実装済み**だった。欠けていたのはパーサーが (1) `discardSelfFromHand` コストを付けつつ `handActivated` フラグを立てていない、(2) 全 【起】 を timing=MAIN 固定にしてアイコン（アタックフェイズ／スペルカットイン）を無視、の2点。
- **パーサー修正（effectParser.ts）:** `case '起'` で「手札からこのカードを捨て[る、]」を含む場合のみ、コスト先頭アイコンで timing を決定（`《スペルカットインアイコン》`→SPELL_CUTIN／`《アタックフェイズアイコン》`→ATTACK_ARTS／`《メインフェイズアイコン》`→MAIN）。`cost.discardSelfFromHand` 検出時に `handActivated:true` を付与。**discardSelfFromHand 限定**のため場の通常【起】（256件の《アタックフェイズアイコン》含む）には影響しない。読点形「捨て、…を取り除く：」の複合コスト（WX21-030）も `[る、]` で拾う。
- **COUNTER_SPELL maxCost（parseSentencePart1.ts）:** 「コストの合計が０のスペル」→ `maxCost:0` を解析（WX17-031 がコスト0スペル限定で打ち消すよう cut-in 候補を絞る）。
- **removeOppVirus コスト対応（BattleScreen.executeHandActivated）:** 「手札からこのカードを捨て、【ウィルス】3つを取り除く」（WX21-030）の複合コストを支払えるよう、相手の場のウィルス除去を追加（不足時は発動不可・UI側でもゲート）。
- **JSON 反映:** プリビルド JSON は全再生成（約90枚退化リスク）を避け、対象9効果の `timing`/`handActivated`/`cost`/`action`（COUNTER_SPELL maxCost・WX21-030 cost）のみを外科的にパッチ。他カードは不変。
- **結果:** 9枚すべてが正しいフェイズで手札発動可能に。WX18系4枚は ＜ドーナ／緑子／ウリス／イオナ＞ の `LRIG_STORY` 使用条件も維持。WX17-031 は spell-cut-in 窓に SPELL_CUTIN として出現。
- **残（内容バグ・別概念）:** WX19-045 の action は STUB（「【ウィルス】が合計2つになるように置く」の充填アクション未パース）。発動はできるが効果は近似。spell-cut-in 時の「あなたの場に＜凶蟲＞のシグニがある場合」条件は cut-in 収集が eff.condition を見ないため未強制（近似）。

---

## WX25-CP1-065（即時-2000＋同一対象へクラッシュ時-2000付与）を実装＝B節クラッシュ複雑ケース完了（v0.372, 2026-06-20）

- **症状:** WX25-CP1-065「風倉モエ」E1「【自】：アタックフェイズ開始時、対戦相手のシグニ1体を対象とし、＜ブルアカ＞を1枚捨ててもよい。そうした場合、ターン終了時まで、それのパワーを－2000する。このターン、対戦相手のライフクロス1枚がクラッシュされたとき、ターン終了時まで、それのパワーを－2000する」が、即時-2000＋手札捨ての近似で、後半の「クラッシュ時に同じ対象へ-2000」が欠落していた。B節「クラッシュ時トリガー複雑ケース（相手ライフクラッシュ時＋遅延対象記憶）」の最後の1枚。
- **鍵＝同一対象への二重適用:** 即時-2000と「クラッシュ時-2000」は同じ選択対象（「それ」）に適用する必要がある。既存 STUB `TARGET_AND_DISCARD_HAND`（対象選択→直後の `CONDITIONAL(IS_MY_TURN).then` を選択対象へ `applyDirectAction` で適用→手札1枚捨て）を利用し、`then` を `SEQUENCE[POWER_MODIFY -2000, GRANT_EFFECT(...)]` にすることで、1回の選択で両方を同一シグニへ適用。`applyDirectAction` は SEQUENCE（各ステップを同一 cardNum へ）・POWER_MODIFY・GRANT_EFFECT を既にサポート済み。
- **遅延対象記憶の解決:** 別途ストアを設けず、選択した相手シグニ自身に `GRANT_EFFECT` で `【自】ON_LIFE_CRASHED → POWER_MODIFY thisCardOnly -2000`（UNTIL_END_OF_TURN）を付与。相手（＝付与先コントローラー）のライフがクラッシュされると、その付与 `ON_LIFE_CRASHED` が `collectSelfEventTriggers`（相手フィールド走査）で発火し、付与先自身が-2000。クラッシュごとにスタック（usageLimit なし）。「対戦相手のライフ＝相手自身のライフ」なので相手視点の `ON_LIFE_CRASHED` がそのまま使え、新ストア不要。
- **近似:** 捨て札の＜ブルアカ＞限定・「捨ててもよい」の任意性・「そうした場合」ゲートは TARGET_AND_DISCARD_HAND の仕様（手札1枚＝任意カードを強制で捨て＋対象選択）に簡略化（既存STUB踏襲）。E2【絆自】は絆条件未対応のため非実装。
- **B節完了:** これでクラッシュ時トリガーの複雑ケース（WX16-Re07/WX25-P1-004/WXDi-P12-030/WX25-CP1-075/WXDi-CP02-084/WX11-026/WDK17-009/WXDi-P16-039/WXDi-P06-007/WX25-CP1-065）が全て実装済み。残るは別概念の WX17-031 系（手札からの自己起動＋spell-cut-in）。

---

## WXDi-P06-007（効果2枚ドロー条件＋ルリグ付与クラッシュ時）を実装＋CARDS_DRAWN_BY_EFFECT 新設（v0.371, 2026-06-20）

- **症状:** WXDi-P06-007「閃光へ飛翔　レイ」の3能力すべてが誤パースされていた。E1（アタックフェイズ開始時の条件付きアサシン付与）は条件・青フィルタ・任意性が欠落、E2（【出】ドロー＋エナチャージ）は DRAW が欠落しエナチャージのみ、E3（【起】《ゲーム１回》ルリグ付与のクラッシュ時能力）は ACTIVATED DRAW に完全誤パース。B節「クラッシュ時トリガー複雑ケース（クラッシュ無関係の別効果が誤リスト）」の対象だが、3能力とも実装に踏み込んだ。
- **CARDS_DRAWN_BY_EFFECT 条件を新設:** 「このターンに効果でN枚以上引いた」を表す Condition を追加。`PlayerState.cards_drawn_by_effect_this_turn` を新設し、`execDraw`（エンジンの効果ドロー経路）で `canDraw` 分加算（ドローフェイズの `drawCards` は経由しないので除外）。ターン終了時の両クリーンアップブロックで0へリセット。`evalCondition`(execUtils) に case 追加。
- **E1:** lrigブランチ（collectTurnTriggers）は `eff.condition` を評価しないため、`CONDITIONAL{CARDS_DRAWN_BY_EFFECT(self,gte,2)}` でアクションをラップして実行時評価。「捨ててもよい」は `CHOOSE`（捨てる/捨てない）で表現し、捨てる選択肢は `HAND_COUNT(self,gte,3)` の per-choice condition でゲート。捨てた場合に青のシグニ1体へ【アサシン】を UNTIL_END_OF_TURN 付与。
- **E2:** `SEQUENCE[DRAW1, ENERGY_CHARGE_FROM_DECK1]` に修正（DRAW 補完）。
- **E3:** `GRANT_EFFECT`（`thisCardOnly`＝センタールリグ自身へ `UNTIL_END_OF_TURN`）で `ON_OPP_LIFE_CRASHED`＋`twice_per_turn` の `CHOOSE(自ドロー / 相手ディスカード)` を付与。コスト `青×0`＋`once_per_game`。v0.370 で整備した `performLifeBurstResponse` の oppCrashSources（lrig 走査）と twice_per_turn 対応にそのまま乗る。
- **近似:** CARDS_DRAWN_BY_EFFECT のリセットは actions_done と同じく「自ターン終了時」のため、対戦相手ターン中の自己効果ドロー（稀）が翌自ターンのアタックフェイズ開始時まで残り得る（実用上ほぼ影響なし）。

---

## WXDi-P16-039（アシストルリグ・両者クラッシュ時ドロー/チャージ）を実装（v0.370, 2026-06-20）

- **症状:** WXDi-P16-039「アザエラ『逆転の炎』」E2「【出】：次の対戦相手のターン終了時まで、このルリグは『【自】《ターン２回》：あなたか対戦相手のライフクロス１枚がクラッシュされたとき、カードを１枚引くか【エナチャージ１】をする。』を得る」が、`ON_PLAY` の即時エナチャージに誤パースされていた。B節「クラッシュ時トリガー複雑ケース（lrig自己付与＋自分or相手両方クラッシュ＋ターン2回）」の対象。E1（バニッシュ）はパーサー生成が正しいので維持。
- **データ:** `manualEffects.ts` に `WXDi-P16-039-E2` を追加。`GRANT_EFFECT`（`thisCardOnly`＋`UNTIL_OPP_TURN_END`）でこのアシストルリグ自身へ、timing `[ON_LIFE_CRASHED, ON_OPP_LIFE_CRASHED]`＋`twice_per_turn`＋`CHOOSE(ドロー/エナチャージ)` の【自】を付与。
- **execGrantEffect の thisCardOnly 拡張:** 従来 `field.signi` のみ走査していたため、アシストルリグ（`assist_lrig_l/r`）が効果元のとき候補0になっていた。`field.lrig`／`assist_lrig_l/r` も自己ゾーンとして許可するよう拡張。付与先＝アシストルリグ instanceId。
- **収集側の lrig/アシスト走査拡張:**
  - `collectSelfEventTriggers`（ON_LIFE_CRASHED＝自ライフ）の `nonSigniSources` に `assist_lrig_l/r` を追加。
  - `performLifeBurstResponse` の ON_OPP_LIFE_CRASHED 収集を、従来の `op.field.signi` のみから `signi＋lrig＋assist_lrig＋key` を走査する `oppCrashSources` に拡張。
- **twice_per_turn 対応:** 両収集経路の usageLimit 判定を「`actions_done` の effectId 出現回数」ベースの `limitOk`／`oppLimitOk` ヘルパーに統一（once=1／twice=2）。従来は once_per_turn のみ（`includes`）対応だった。使用カウントは収集時に `usedOncePerTurnIds`／`oppUsedIds` 経由で `actions_done` へ永続化（スタック解決時の二重計上なしを確認）。
- **付与の寿命:** `granted_effects_until_opp_turn`（v0.368 ストア）に保存。設定者（コントローラー）のターン終了時には opKey 側のみクリアされ、次の相手ターン終了時（＝設定者のターン再開直前）にクリアされる＝「次の対戦相手のターン終了時まで」と一致。`actions_done` はターン毎リセットのため《ターン２回》は各ターンで2回使える。
- **波及:** ON_OPP_LIFE_CRASHED の lrig/付与/twice 対応は WXDi-P06-007-E3（ルリグ付与の ON_OPP_LIFE_CRASHED）等の足場になる。

---

## WDK17-009（キー・自ライフクラッシュ時3択）を実装（v0.369, 2026-06-20）

- **症状:** WDK17-009「愛憎の果てに　ハイティ・鍵」E1「【自】《ターン１回》：対戦相手のアタックフェイズの間、あなたのライフクロスがクラッシュされたとき、以下の３つから１つを選ぶ。①ドロー②相手ダウンシグニ1体バニッシュ③（センター＜アルフォウ＞かつ自ライフ１枚以下なら）相手ライフ1枚クラッシュ」が、`ON_PLAY` の CHOOSE（召喚時に即3択）に誤パースされていた。B節「クラッシュ時トリガー複雑ケース（条件付き／3択）」の対象。
- **実装:** `manualEffects.ts` に `WDK17-009-E1` を追加。timing を `ON_LIFE_CRASHED`＋`triggerScope:self`＋`usageLimit:once_per_turn` に修正。キーは v0.362 で `collectSelfEventTriggers` の `nonSigniSources`（`key_piece`/`key_piece_extra`）走査対象のため追加機構なしで発火。
- **条件付き選択肢:** 選択肢③に `condition: AND[LRIG_NAME_CONTAINS(self,アルフォウ), LIFE_COUNT(self,lte,1)]` を付与。`execChoose` は既存の per-choice `condition` を `available` で評価し、条件未達なら選べない（v0.350 で整備済みの `LRIG_NAME_CONTAINS`／既存 `LIFE_COUNT`／`AND` を組み合わせ）。
- **近似:** 「対戦相手のアタックフェイズの間」は省略（自ライフクラッシュはほぼ相手アタック中に発生）。E2（【起】このキーをルリグトラッシュ→対戦相手が自分のシグニ/エナを対象…）は対戦相手選択の複雑効果のためパーサー生成のまま維持。

---

## ON_SIGNI_BATTLE 新設 + UNTIL_OPP_TURN_END 永続ストア + WX25-CP1-075完全化 / WXDi-CP02-084（v0.368, 2026-06-20）

- **WX25-CP1-075 バトル時節の補完（ユーザー指摘）:** 付与能力の契機「このシグニがシグニ1体とバトルしたか」が未実装だった。timing `ON_SIGNI_BATTLE` を新設し、`resolvePendingSigniBattleFor` の実バトル成立時（`!effectivelyEmpty && opTopCardNum`）に攻撃側(myTopNum)・防御側(opTopCardNum)双方の `ON_SIGNI_BATTLE` AUTO を収集してスタックに積む（`triggerScope:'self'` 想定、各シグニ自身の能力のみ）。WX25-CP1-075-GRANT の timing を `['ON_SIGNI_BATTLE','ON_LIFE_CRASHED']` に拡張。両契機は同一 effectId＋`once_per_turn` 共有で《ターン1回》を正しく表現。
- **UNTIL_OPP_TURN_END 永続ストア新設:** `PlayerState.granted_effects_until_opp_turn`（付与効果）と `power_mods_until_opp_turn`（パワー修正）を追加。`effectsMap`(augMap) は granted_effects と配列結合マージ、`calcFieldPowers`(applyTempMods) は power_mods_until_opp_turn も加算。`execGrantEffect`/`execPowerModify` は `duration==='UNTIL_OPP_TURN_END'` のとき各長期ストアへ振り分け（`PowerModifyAction.duration` を新設）。ターン終了処理の opKey ブロック（＝次ターンプレイヤー＝設定者）で両ストアをクリア＝「次の対戦相手のターン終了時まで」を正確化。
- **WXDi-CP02-084 実装:** 【起】《ダウン》を「即時エナチャージ＋+4000」の誤パースから、`SEQUENCE[POWER_MODIFY thisCardOnly +4000 (UNTIL_OPP_TURN_END), GRANT_EFFECT thisCardOnly (UNTIL_OPP_TURN_END, 付与=【自】ON_LIFE_CRASHED once_per_turn → CONDITIONAL(DECK_TOP_MATCHES ブルアカ)→ENERGY_CHARGE_FROM_DECK)]` へ修正。`execGrantEffect` にも `thisCardOnly` 対応を追加。相手ターン中に自ライフがクラッシュされると発火し次の相手ターン終了時にクリアされるライフサイクルが一致。
- **未実装（明記）:** WX25-CP1-075 E2【絆自】／WXDi-CP02-084 E2【絆常】(+4000) はいずれも絆条件が絡みパーサーも未生成だったため今回も非実装（元から未実装で回帰なし）。

---

## 付与経由 ON_LIFE_CRASHED + WX25-CP1-075 を実装（v0.367, 2026-06-20）

- **症状:** WX25-CP1-075「姫木メル」E1（相手シグニへ「自分のライフがクラッシュされたとき自身パワー-2000」の【自】を付与）が、即時-2000＋エナチャージの誤パースになっていた（自・絆自の2能力が1つに混線）。B節「クラッシュ時トリガー複雑ケース（付与経由）」の対象。
- **付与経由の確認:** `granted_effects`（GRANT_EFFECT で付与）は `effectsMap`(augMap) に instanceId 単位でマージされ、`collectSelfEventTriggers('ON_LIFE_CRASHED')` が付与能力も拾うことを確認。付与期間「ターン終了時まで」は既存 `granted_effects` のクリアと一致するため、追加ストア不要で実装可能。
- **実装:** `manualEffects.ts` の WX25-CP1-075-E1 を `ON_ATTACK_PHASE_START`＋`condition: HAS_CARD_IN_FIELD(self, cardClass:ブルアカ, excludeSelf)`＋`GRANT_EFFECT(target: 相手シグニ1, duration: UNTIL_END_OF_TURN, effect: 【自】ON_LIFE_CRASHED once_per_turn → POWER_MODIFY thisCardOnly -2000)` に修正。付与先（相手）のライフがクラッシュされると、付与された自分視点の `ON_LIFE_CRASHED` で自身パワー-2000。
- **execPowerModify の thisCardOnly 対応:** `ctx.sourceCardNum` 自身のみ対象に追加（execUp と同型）。「このシグニのパワーを±X」を正確化。
- **未実装（近似/省略）:** バトル時節（「このシグニがバトルしたとき」）は専用 timing 未実装のためライフクラッシュ節のみ。E2【絆自】（このシグニが相手ライフをクラッシュしたときエナチャージ）は絆条件＋「このシグニがクラッシュした」判定が必要で今回非実装（元の混線E1に内包されていた誤エナチャージは除去）。

---

## カウンタークラッシュ機構新設 + WX25-P1-004 / WXDi-P12-030 を実装（v0.366, 2026-06-20）

- **症状:** 「次にあなたのライフクロスがクラッシュされたとき、対戦相手のライフクロスをクラッシュする」防御カウンター系が、即時クラッシュに誤パースされていた（WX25-P1-004＝即2枚クラッシュ、WXDi-P12-030＝即1枚クラッシュ）。B節「クラッシュ時トリガー複雑ケース（自分ライフクラッシュ時カウンタークラッシュ）」の対象。
- **新機構:** `PlayerState.life_crash_counter { remaining, perTrigger }` を新設。STUB `SET_NEXT_LIFE_CRASH_COUNTER`（`execStubPart1`）で防御側に設定。`performLifeBurstResponse`（自分=クラッシュされた側の処理）で `life_crash_counter.remaining>0` なら、対戦相手のライフを `perTrigger` 枚クラッシュするトリガー（`LIFE_CRASH owner:opponent`、playerId=防御側）を積み、`remaining` を減算（0でクリア）。ターン終了時に両プレイヤーの `life_crash_counter` をクリア（防御側＝次ターンプレイヤー側もクリア）。
- **データ:** `manualEffects.ts` に WX25-P1-004-E1（ACTIVATED/ATTACK→STUB）、WXDi-P12-030-E1（AUTO/ON_PLAY→STUB）。WXDi-P12-030-E2（《赤》《無》の別【出】）はパーサー生成のまま維持。
- **近似:** 発生源限定（「相手ルリグによって」「相手シグニによって」）と WX25-P1-004 のブースト時2枚クラッシュは未実装（perTrigger=1固定）。自分ライフがクラッシュされる＝ほぼ相手アタックのため実用上問題は小さい。

---

## ON_OPP_LIFE_CRASHED 機構新設 + WX16-Re07 を実装（v0.365, 2026-06-20）

- **症状:** WX16-Re07「轟砲 ウルバン」E1「【ダブルクラッシュ】によって対戦相手のライフクロスが２枚以上クラッシュされたとき、このシグニをアップする」《ターン１回》が `ON_PLAY` の `UP`（召喚時に自身アップ）に誤パースされていた。B節「クラッシュ時トリガー複雑ケース（相手ライフクラッシュ時機構が必要）」の対象。
- **新機構（相手ライフクラッシュ時トリガー）:** timing `ON_OPP_LIFE_CRASHED` を新設。`performLifeBurstResponse`（クラッシュされた側のバースト確認処理）で、**クラッシュした側＝ターンプレイヤー（op）のフィールド**から `ON_OPP_LIFE_CRASHED` の AUTO を収集してスタックに積む。所有はターンプレイヤー側に閉じる（playerId=crasherId）。`once_per_turn` は op の `actions_done` で管理し、activate(バースト発動)時は `queueCardEffects` の `extraUpdate` 経由、不発時は opKey 直接更新で永続化。
- **ダブルクラッシュ判定:** 新 Condition `OPP_LIFE_CRASH_EVENT_GTE`（同時N枚以上クラッシュ）。収集時に `oppCrashEventSize = 1 + pending_crashed_cards.length`（イベント先頭処理時に同時枚数を判定）で評価。条件評価器の `default: return true` のため汎用評価では阻害しない（実ゲートは収集時のインライン評価）。
- **UP の thisCardOnly 対応:** `execUp` に `thisCardOnly` フィルタを追加（`ctx.sourceCardNum` 自身のみアップ）。「このシグニをアップする」を正確化。
- **データ:** `manualEffects.ts` に `WX16-Re07-E1`（`ON_OPP_LIFE_CRASHED`＋`usageLimit:once_per_turn`＋`condition:OPP_LIFE_CRASH_EVENT_GTE(2)`＋`UP{thisCardOnly}`）。
- **波及:** この機構は他の「相手ライフクラッシュ時」カード（WX25-CP1-065 の該当節等）の足場になる。

---

## WX11-026 ヘスチア（トラッシュからの自己復活）を実装（v0.364, 2026-06-19）

- **症状:** E1「あなたのライフクロス１枚がクラッシュされたとき、このシグニをあなたのトラッシュから場に出してもよい」が `ON_PLAY` の `LIFE_CRASH owner:self`（＝召喚時に自分のライフをクラッシュする、という完全な誤パース）になっていた。B節「クラッシュ時トリガー複雑ケース（自己復活）」の対象。
- **機構:** トラッシュにあるカード自身がトリガー源になるケースに対応。`collectSelfEventTriggers('ON_LIFE_CRASHED')` を拡張し、`myState.trash` 内のカードのうち AUTO・`ON_LIFE_CRASHED`・アクションが `ADD_TO_FIELD source:TRASH_CARD` のもの（＝自己復活）を `cardNum=トラッシュのインスタンスID` で収集。フィールド走査側では同シグネチャ（`ADD_TO_FIELD`＋`source:TRASH_CARD`＋`filter.cardName` が自身の名前に含まれる）を除外し、場にいる間は発火しないようにした（トラッシュ専用能力）。
- **データ:** `manualEffects.ts` に `WX11-026-E1` を追加（E2/BURST はパーサー生成のまま維持）。action は `ADD_TO_FIELD owner:self source:{TRASH_CARD, count:1, upToCount:true, filter:{cardType:シグニ, cardName:聖火の祭壇　ヘスチア}}`。`upToCount` で「してもよい」（任意・0枚＝不発動）を表現。同名コピーは機能等価なので cardName 一致で「このシグニ」を近似。
- **解決パス:** ON_LIFE_CRASHED 収集 → `execAddToField`(TRASH_CARD) が `self_trash` の任意 SELECT_TARGET を提示 → 選択 → `resumeSelectTarget`→`applyDirectAction(ADD_TO_FIELD)` がトラッシュから除去＋`SELECT_SIGNI_ZONE` で配置。既存機構のみで実現（新アクション型なし）。
- **既知の制限:** 復活したヘスチアの【出】(E2) の自動発火は本修正の対象外（ADD_TO_FIELD 経由の ON_PLAY 配線は別課題）。E2 自体も「＜天使＞2枚を場に出す」が `LOOK_AND_REORDER` 近似のまま。

---

## TODO 監査ラウンド + 個別カード実装（v0.357〜v0.363, 2026-06-19）

このラウンドの引き継ぎ要点。**TODO.md の A節・F-1 は完全完了**、B節も大半が解消/監査済み。

### 新規実装・バグ修正

- **WX18-076（アクセ付与・被バニッシュ時の正面バニッシュ）(v0.357):** `TargetFilter.isTriggerSource` を新設（トリガー元カード＝`ctx.triggeringCardNum`のみ対象）。`collectBanishTriggers` に `prevOwnerState`（バニッシュ前状態）を渡し、離場で消える `GRANT_ACCE_HOST_ABILITY` の ON_BANISH 能力を前状態から再構築。正面（前ゾーン 2-zi）の相手シグニを `triggeringCardNum` として供給。
- **WX21-052（＜天使＞付与・相手ターン終了時の自トラッシュバニッシュ）(v0.358):** `BanishAction.selfTrashCost` を新設（対象を1体以上選んだら効果元シグニ自身をコストとしてトラッシュ。`resumeSelectTarget` で解決）。付与は `GRANT_FIELD_SIGNI_ABILITY`＋`cardClass:天使`、付与能力は `ON_TURN_END`＋`triggerScope:any_opp`（＝相手ターン終了時に発火）。
- **WXDi-P03-085 / WX17-035（A節近似2枚）(v0.359):** P03-085 は BANISH に `colorExclude:黒`＋`powerRange.max:3000` を付与。WX17-035 は `execRemoveAbilities` に `frontOfSelf` を追加し LAYER-E1 を `owner:opponent`＋`frontOfSelf` に修正（**旧 owner:self は自分の全シグニから能力を奪う実バグだった**）。
- **FS③（WX26-CP1-001）(v0.360):** 付与能力を `BANISH`→`TRASH`（カードは「トラッシュに置く」＝非バニッシュ）に忠実化。
- **WX25-P1-TK3（ダーク・アナライズ）(v0.361):** 専用stub `TK3_DECLARE_DISCARD` を新設。数字を宣言→対戦相手の手札から同レベルのシグニを全てトラッシュへ。旧 `DECLARE_NUMBER`+`LOOK_OPP_LIFE_TOP` は捨て処理が欠落していた。
- **ON_LIFE_CRASHED 誤パース7枚 + collector拡張(v0.362):** クラッシュ時トリガー機構は配線済み（全クラッシュ経路がチェックゾーン経由で `collectSelfEventTriggers('ON_LIFE_CRASHED')` に集約）だが**データ側で ON_PLAY/MAIN に誤パース**されていた。WXDi-P02-037/WX02-003/WX14-CB05/WX21-Re03/WXK03-014/WXK11-034/WD21-011 を `ON_LIFE_CRASHED` に修正。`collectSelfEventTriggers` をルリグ(`field.lrig`)・キー(`key_piece`/`_extra`)も走査するよう拡張（WX02-003=ルリグ・WXK03-014=キーは従来発火しなかった）。
- **WX09-027（羅石オリハルティア・テキスト書き換え）(v0.363):** E1=CONTINUOUSマーカー `BANISH_THRESHOLD_BOOST_7_15`。`execBanish` が自場のオリハルティア存在を検出し《オリハルティア》以外のシグニの「相手パワー7000以下バニッシュ」を15000以下に書き換え（ExecCtxへ配線せず execBanish 内で `ctx.ownerState.field` を直接スキャン＝全経路カバー）。E2 は欠落していた「トラッシュに《アダマスフィア》がある場合」を `CONDITIONAL{TRASH_HAS_CARD}` で補完。

### 監査で「実は実装済み」と判明し TODO を訂正したもの（前セッションで実装済・TODO 未更新）

- **A節 PR-Di035:** 青の「相手手札3枚捨て」は `TRASH{HAND_CARD,owner:opponent}`＋`opponentResponds` で相手選択済み（先頭3枚固定の近似は撤去済）。
- **C節 全4システム:** GRANT_QUOTED_AUTO_ABILITY / GAIN_SUBSCRIBER_COUNT / SONG_FRAGMENT / COPY_LRIG_NAME_ABILITY はいずれも engine に実体実装あり（「ログのみ」は誤り）。
- **B節:** CONTINUOUS REMOVE_ABILITIES / CONTINUOUS DRAW(WXDi-P04-056) / 動的choose_count(リコレクト) / 遅延付与(FS③) / **ダーク系TK6 `NO_BATTLE_DEFENDER`** はすべて実装済み。特に NO_BATTLE_DEFENDER は `BattleScreen.resolvePendingSigniBattleFor`（人間・CPU共通, 6446〜6454）で実装済（旧「engine未対応」はバトルロジックが engine/ でなく BattleScreen にあるための誤認）。攻撃側には適用されない（防御側＝`opTopCardNum` のみ判定）ので、TK6 が自分からアタックしたときは通常バトルになる。

### zerom への残作業（TODO.md 参照）

- **B（要・専用設計）:** ①手札からの自己起動＋spell-cut-in 割り込み（WX17-031 等8枚）②クラッシュ時トリガーの複雑ケース（相手ライフ参照・付与経由・条件付き：WX16-Re07/WDK17-009/WXDi-P06-007/P12-030/P16-039/CP02-084/WX25-P1-004/WX25-CP1-065/075、自己復活の WX11-026）
- **D:** CPU メインフェイズAI（アーツ/起動の能動使用）
- **C/E/F-2/F-3:** 個別カードのエッジケース精査のみ（バグではない）

---

## SP27-015（アクセ付与の【起】＋アクセトラッシュコスト）を実装（v0.356, 2026-06-19）

- **`acceTrash` コストの支払い実装:** `EffectCost.acceTrash`（型はあったが未配線）を `executeSigniActivated` で支払い処理（先頭ゾーンから【アクセ】N枚をトラッシュ）。シグニ【起】の起動可能判定に枚数不足チェックとコストラベルも追加。
- **SP27-015「コードイート トンカツ」:** アクセされているシグニに「【起】《ターン1回》【アクセ】2枚をトラッシュ：相手シグニ1体をバニッシュ」を付与（`GRANT_ACCE_HOST_ABILITY` の付与ACTIVATED。付与起動能力は augMap 経由で起動リストに出現し `executeSigniActivated` が渡された effect を直接解決する）。

---

## WD14-001（全領域へ【ライフバースト】付与）を実装（v0.355, 2026-06-19）

- **機構追加:** マーカー STUB `GRANT_ALL_ZONE_LIFEBURST`。`BattleScreen` に `controlsAllZoneBurstGrant`（場のシグニ/センタールリグ/アシストにこの効果があるか）・`effectiveHasBurst`・`grantedBurstEntry`（合成LIFE_BURST＝相手シグニ1体バニッシュ）を追加。
- **配線3箇所:** ①CPUのバースト発動判定（`effectiveHasBurst`）、②人間のバースト確認モーダル（`hasBurst` に付与分を加味）、③`performLifeBurstResponse` の解決で、ネイティブLBを持たないクラッシュカードに付与分を `extraEntries` として注入。
- **WD14-001「虚幸の閻魔 ウリス」:** あなたのすべての領域の【ライフバースト】を持たないカードが【ライフバースト】「対戦相手のシグニ1体をバニッシュ」を得る。E1（グロウコスト減）/E2（＜悪魔＞18枚以上で相手ガード不可）は別効果として既存のまま。

---

## WX20-Re18（動的レベル）を実装（v0.354, 2026-06-19）

- **`buildLevelMods` の `DYNAMIC_LEVEL_BY_ENERGY` バグ修正:** 「エナN枚につき＋M」の除数を無視して `baseLv + energy*delta` にしていた（レベルが過大）。`baseLv + floor(energy/divisor)*delta` に修正。「カード」指定（全カード）も解釈。
- **実効レベル比例パワー:** `calcFieldPowers` の STUB パワー処理に `DYNAMIC_LEVEL_BY_ENERGY` を追加。「パワーはレベル１につき＋N」を実効レベル（`levelMods`）×N で適用。
- **WX20-Re18「幻獣 アカズキン」:** E1=レベル＝2＋エナ÷5・パワー＝実効レベル×3000（既存 STUB が両方を駆動）。E2=レベル4以上（＝エナ10以上）でアタック時に正面のシグニをバニッシュ（`frontOfSelf`）。E2b=レベル5以上（＝エナ15以上）で対戦相手の効果を受けない（`GRANT_PROTECTION from:['any']`）。E3=メインフェイズ開始時のデッキトップ→エナを `ON_PLAY` 誤設定から `ON_TURN_START` に修正。
- レベル4/5の判定は base2・除数5から `エナ≥10 / ≥15` と数学的に同値なので `ENERGY_COUNT`/`COUNT_THRESHOLD(energy)` で正確に表現。

---

## WX17-038 を「めくり続けて同レベルバニッシュ」で実装（v0.353, 2026-06-19）

- **アクション追加:** `REVEAL_UNTIL_BANISH_SAME_LEVEL { revealClass, banishOwner }`。デッキ上から指定クラスのシグニがめくれるまで公開し、そのシグニのレベルを取得、公開カードをシャッフルしてデッキ一番下へ戻し、同レベルの相手シグニ1体をバニッシュ（プレイヤー選択）。
- **WX17-038「羅星 ≡タイトツ≡」:** 中央のシグニゾーンにあるかぎり、アタック時に＜宇宙＞のシグニがめくれるまで公開→同レベルの相手シグニ1体をバニッシュ（AUTO・`condition:THIS_CARD_IN_CENTER_ZONE`）。

---

## WXDi-CP02-TK02A（雨雲号トークン）を実装（v0.352, 2026-06-19）

- 複数効果が誤解析されていた（E1=無条件CONTINUOUS BANISH、E2=「ターン終了時に相手トラッシュを1枚トラッシュ」という無意味な誤り）。
- **修正:** E1=【常】【ランサー】（CONTINUOUS GRANT_KEYWORD）、E2=【自】バトルでシグニをバニッシュしたとき相手パワー10000以下を1体バニッシュ（AUTO `ON_SIGNI_BANISH_BATTLE`）。
- **保留:** 「対戦相手のターン終了時にこのシグニをゲームから除外」は、非アクティブ側のターン終了トリガー（`collectTurnTriggers` は能動側フィールドのみ走査）が必要なため未実装。トークンが自然消滅しない点は既知の制限。

---

## WX25-P3-057 を覚醒アサシンで実装＋ON_TURN_END条件配線（v0.351, 2026-06-19）

- **収集経路修正:** `collectTurnTriggers`（ON_TURN_END / ON_TURN_START / ON_ATTACK_PHASE_START）が `eff.condition` を無視していたのを `evalUseCondition` で判定するよう修正（既存カードは該当条件付き0件で影響なし）。
- **フィルタ追加:** `TargetFilter.thisCardOnly`（効果元シグニ自身のみを対象＝「このシグニをバニッシュする」。`execBanish` が解決）。
- **WX25-P3-057「コードハート Oイルヒーター」:** 覚醒状態であるかぎり【アサシン】を得る（CONTINUOUS GRANT_KEYWORD・`activeCondition:IS_SELF_AWAKENED`）＋あなたのターン終了時にこのシグニをバニッシュ（AUTO `ON_TURN_END`・`condition:THIS_CARD_IS_AWAKENED`・`thisCardOnly`）。「アタックが無効化されない」常在耐性は未対応（保留）。
- **あわせて修正:** E2「アタックフェイズ開始時、手札0枚なら《赤》で覚醒」が timing `ATTACK`（AUTO未ディスパッチ）で発火しなかったのを `ON_ATTACK_PHASE_START`＋`condition:HAND_COUNT=0` に修正。

---

## WDK16-06H をセンター名/登録者数条件で実装（v0.350, 2026-06-19）

- **条件追加:** `LRIG_NAME_CONTAINS { owner, name }`（センタールリグ名が name を含む）／`SUBSCRIBER_COUNT { operator, value }`（Condition版。`subscriber_count` を参照。ActiveCondition には既存）。
- **WDK16-06H「コードＶＬ 本間ひまわり」:** 場にカード名に《楓》を含むセンタールリグがいる場合、アタック時に相手パワー8000以下のシグニ1体をバニッシュ。登録者数100万人達成時は代わりに相手シグニ1体をバニッシュ（AUTO・`condition:LRIG_NAME_CONTAINS('楓')`・action は `CONDITIONAL(SUBSCRIBER_COUNT≥100)`）。

---

## PR-288 をルリグレベル一致条件で実装（v0.349, 2026-06-19）

- **条件追加:** `LRIG_LEVEL_EQ_OPP`（Condition／自分のセンタールリグのレベルが対戦相手のセンタールリグと同じ）。
- **PR-288「小砲 アルマイル」:** 中央ゾーンにあり、自他センタールリグのレベルが同じ場合、アタック時に相手パワー2000以下のシグニ1体をバニッシュ（AUTO・`condition:AND[THIS_CARD_IN_CENTER_ZONE, LRIG_LEVEL_EQ_OPP]`）。E1の基本パワー1000化（POWER_SET）は既存のまま維持。

---

## 正面ターゲット機構と PR-426 実装（v0.348, 2026-06-19）

- **機構追加:** `TargetFilter.frontOfSelf`（効果元シグニの正面＝相手ゾーン `2-zi` のシグニに限定。`execBanish` が解決）と `IS_SELF_IN_CENTER_ZONE`（ActiveCondition／中央ゾーン index 1）。
- **PR-426「篭手 エルゼ」:** ライフ1枚以下かつ中央ゾーンにあるかぎりパワー＋4000（CONTINUOUS・`activeCondition:AND[ライフ≤1, IS_SELF_IN_CENTER_ZONE]`）＋アタック時に正面のシグニ1体をバニッシュ（AUTO・`condition:AND[LIFE_COUNT≤1, THIS_CARD_IN_CENTER_ZONE]`・`frontOfSelf`）。
- **あわせて修正:** PR-426-E2 が「ライフクラッシュ時」なのに `ON_PLAY` に誤設定され召喚時にバニッシュしていたのを `ON_LIFE_CRASHED` に修正（同 timing は未配線のため発火は保留だが、誤った召喚時発火は停止）。
- **保留:** WX20-Re18（エナ数依存の動的自己レベル条件が必要）/ WX18-076（被バニッシュ時に「正面にあった」シグニを参照＝離場時のゾーン記録が必要）は no-op のまま。

---

## ソウル付与機構（GRANT_SOUL_HOST_ABILITY）の新設（v0.347, 2026-06-19）

- **機構追加:** 【ソウル】カードからホストシグニ（ソウルが付いているシグニ）へ能力を付与する仕組みをアクセ機構と同型で新設。アクション型 `GRANT_SOUL_HOST_ABILITY { filter?, abilities }`、コレクター `collectGrantedFromSoul`（`field.signi_soul[zi]` 参照）、`BattleScreen` augMap に `hasSoulGrant` 判定＋適用を追加。
- **WXDi-D07-003「エクス・ツー」:** ソウル先がアタック時に相手パワー12000以下のシグニ1体をバニッシュ。
- **WXDi-P04-015「マキナ・ツー」:** ソウル先がアタック時に相手レベル2以下のシグニ1体をバニッシュ。
- ※《ターン1回》はON_ATTACK_SIGNI経路で未強制（既存の系統的制約・シグニは通常1ターン1アタック）。

---

## アクセ付与機構（GRANT_ACCE_HOST_ABILITY）の新設（v0.346, 2026-06-19）

- **機構追加:** アクセカードからホストシグニ（アクセが付いているシグニ）へ任意の能力を付与する仕組みを新設。アクション型 `GRANT_ACCE_HOST_ABILITY { filter?, abilities }`、コレクター `collectGrantedFromAcce`（`effectEngine.ts`）、`BattleScreen` の augMap 構築に `hasAcceGrant` 判定＋適用を追加。付与AUTOは augMap 経由でトリガー収集に入り発火する。従来アクセはパワー修正とキーワードのみホストへ伝播していた。
- **WX16-045「コードイート チョコスプ」:** アクセされた＜調理＞シグニにアタック時「自身のパワー以下の相手1体バニッシュ」を付与。
- **WX20-072「コードイート チョコプレート」:** アクセされた《コードオーダーウェディング》にパワー＋1000（既存アクセPOWER_MODIFY経路）＋アタック時「自身のパワー以下の相手1体バニッシュ」を付与。
- **保留:** WX18-076（正面参照）/ SP27-015（付与先が【起】＋【アクセ】2枚トラッシュコスト）はそれぞれ別機構が必要なため no-op のまま。

---

## WXDi-P15-061 を上シグニ付与で実装（v0.345, 2026-06-19）

- **WXDi-P15-061「羅星 サシェ//THE DOOR」:** 「このカードの上にある＜解放派＞のシグニは『【自】アタックフェイズ開始時、相手パワー3000以下のシグニ1体をバニッシュ』を得る」を既存の `GRANT_SIGNI_ABOVE_ABILITY`（`collectGrantedFromUnderSigni` の Pattern B、付与AUTOは augMap 経由で発火）＋`filter:{cardClass:'解放派'}` で実装。

---

## 「自身のパワー以下/より低い」動的フィルタと場全体付与（v0.344, 2026-06-19）

- **動的フィルタ追加:** `TargetFilter.powerLteSelf`（効果元シグニの実効パワー以下）／`powerLtSelf`（より低い）。`execBanish` が効果元の実効パワーを基準に `powerRange.max` へ解決（`powerLtSelf` は max=自パワー−1）。アタック時付与の場合 `sourceCardNum` はアタックしたシグニ＝付与先なので、付与先ごとに正しく解決される。
- **WX13-034「幻獣神 マンモ」:** 「あなたのシグニは『【自】アタック時、自身よりパワーの低い相手シグニ1体をバニッシュ』を得る」を `GRANT_FIELD_SIGNI_ABILITY`（付与AUTOは augMap 経由でトリガー収集に入り発火）＋`powerLtSelf` で実装。
- **既存近似の正確化:** WDK01-011・WXK03-034・WXK04-042 の「自身のパワー以下」バニッシュに `powerLteSelf` を付与（従来は無フィルタ近似だった）。

---

## WDK08-L11 を血晶武装条件で実装（v0.343, 2026-06-19）

- **WDK08-L11「紅蓮の使い魔 ツクヨミ」:** 血晶武装状態であるかぎりアタック時に相手シグニ2体まで《赤》《赤》を支払ってバニッシュ（AUTO `ON_ATTACK_SIGNI`・`condition:THIS_CARD_IS_ARMORED`・任意コスト）。既存条件で表現でき新条件は不要。

---

## 「下にカードがある」条件の追加と WXDi-P05-034 実装（v0.342, 2026-06-19）

- **条件型追加:** `THIS_CARD_HAS_UNDER`（ActiveCondition／Condition。このシグニの下にカードがある＝そのスタック長 > 1）。
- **WXDi-P05-034「コードアクセル ヒャッハー」:** 下にカードがあるかぎりパワー＋5000（`activeCondition`）＋アタック時に相手パワー8000以下へ《赤》《赤》を支払ってバニッシュ（AUTO・`condition`・任意コスト）。

---

## 「このターン手札N枚捨てた」条件の追加と実装（v0.341, 2026-06-19）

TODO F-1 の中装シリーズ2枚を機能化。

- **条件型追加:** `TURN_HAND_DISCARD_GTE { value }`（ActiveCondition／Condition 両方。`turn_hand_discarded_count` を参照）。
- **WXK03-034「中装 ニョイボウ」:** このターン手札2枚以上捨てていればパワー＋2000（`activeCondition`）＋アタック時に《赤》を支払ってバニッシュ（AUTO・`condition`・任意コストは `OPTIONAL_COST`＋`CONDITIONAL(IS_MY_TURN)` の定石）。「自身のパワー以下」は無フィルタ近似。
- **WXK03-056「中装 ジョワイ」:** このターン手札1枚以上捨てていればアタック時に相手パワー3000以下へ《赤》を支払ってバニッシュ。

---

## 覚醒/ドライブ条件の追加と能力実装（v0.340, 2026-06-19）

TODO F-1 の no-op カードのうち、状態条件さえあれば忠実実装できる2枚を機能化。

- **条件型追加:** `IS_SELF_AWAKENED`（ActiveCondition／このシグニが覚醒状態＝`awakened_signi` に含まれる）、`THIS_CARD_IS_AWAKENED`・`IS_DRIVE_STATE`（Condition／AUTO 用。`evalCondition` で `awakened_signi`・`lrig_riding_signi` を参照）。
- **WXDi-P07-060「紅天 ヒュペリオン」:** 覚醒状態であるかぎりパワー＋2000（CONTINUOUS POWER_MODIFY・`activeCondition:IS_SELF_AWAKENED`）＋アタック時に相手パワー3000以下バニッシュ（AUTO `ON_ATTACK_SIGNI`・`condition:THIS_CARD_IS_AWAKENED`）。覚醒付与は既存 E2（ターン終了時 AWAKEN_SIGNI）。
- **WDK01-011「コードライド ヤマテ」:** 【ドライブ常】でパワー＋3000（`activeCondition:IS_DRIVE_STATE`）＋アタック時バニッシュ（AUTO・`condition:IS_DRIVE_STATE`）。「自身のパワー以下」フィルタは動的未対応のため無フィルタで近似。

---

## CONTINUOUS BANISH 誤解析の一掃ラウンド（v0.339, 2026-06-19）

WD04-009 と同根の「能力付与/AUTOトリガーが無条件 CONTINUOUS BANISH に誤解析され、`calcContinuousSigniMutations` により場に出た瞬間から相手シグニを一方的にバニッシュし続ける」系統バグを一掃。**非optionalのCONTINUOUS BANISHは残り0件**になった（optionalの身代わり系は元々自動適用されず無害なので対象外。CONTINUOUS TRASH もこの経路では実行されず無害だが誤解析なので別途・TODO F）。

- **根本修正（収集経路）:** `ON_ATTACK_SIGNI` の AUTO トリガー収集（`BattleScreen.tsx` `performSigniAttack`）が `eff.condition` を無視していたため、条件付き付与（「〜であるかぎり『【自】アタック時…』を得る」）を AUTO で表現できなかった。アタッカーの実効パワーを `calcFieldPowers` で算出し `evalUseCondition` で `condition` を判定して収集するよう修正。これで WD04-009-E2 を含む条件付き ON_ATTACK_SIGNI が正しくゲートされる。
- **機能実装（7枚）:** WX05-021（パワー20000↑でダブルクラッシュ＋アタック時バニッシュ）／WX09-019（18000↑でランサー＋ライフクラッシュ時バニッシュ※ON_LIFE_CRASHED未配線のため発火は保留）／WX10-063（中央でアタック時1000以下バニッシュ）／WX11-063・WX11-064（相手ターンに被バニッシュ時に7000/3000以下バニッシュ＝AUTO `ON_BANISH`＋`activeCondition:TURN_OWNER`）／WXK04-042（血晶武装でアタック時バニッシュ）／WXK07-044（中央でアタック時7000以下バニッシュ）。条件は既存の `THIS_CARD_IN_CENTER_ZONE`/`THIS_CARD_IS_ARMORED`/`SELF_POWER_GTE`/`SELF_POWER_THRESHOLD`/`TURN_OWNER` で表現。
- **無害化のみ（no-op STUB `UNIMPL_GRANTED_ABILITY`、24枚）:** 覚醒/ソウル/アクセ/ドライブ付与、場全体への付与、動的パワー（自身以下）・正面・ルリグ名存在・手札捨て枚数・下のカード有無など、現状の条件/機構では忠実実装できないものは CONTINUOUS STUB に置換して誤バニッシュを停止。機能は未実装（→ TODO F に列挙）。

---

## WD04-009「幻獣 セイリュ」— 能力付与が CONTINUOUS BANISH に誤解析され召喚時に相手シグニをバニッシュ（v0.338, 2026-06-19）

- **症状:** WD04-009 を場に出すと、本来何も起きないはずなのに相手シグニが1体バニッシュされた。
- **原因:** 「【常】：あなたの場にあるシグニ３体のパワーがそれぞれ15000以上であるかぎり、このシグニは【ランサー】と『【自】：このシグニがアタックしたとき、対戦相手のシグニ１体を対象とし、それをバニッシュする。』を得る。」をパーサーが**条件なしの CONTINUOUS BANISH（`mandatory:true`）** に潰していた。`calcContinuousSigniMutations`（`effectEngine.ts`）は CONTINUOUS の BANISH/FREEZE/DOWN（mandatory・非optional・条件パス）を場にある間ずっと自動適用するため、出した瞬間から相手シグニをバニッシュし続けていた。ライフバースト（パワー10000以上をバニッシュ）とは別物。
- **修正:** WD04-009 を正しい3効果に再定義。①CONTINUOUS `GRANT_KEYWORD`【ランサー】（条件付き）、②AUTO `ON_ATTACK_SIGNI` の相手シグニ1体バニッシュ（同条件・`triggerScope:self`）、③LIFE_BURST はそのまま。条件「自分の場のシグニ3体がそれぞれ15000以上」を表す `FIELD_SIGNI_POWER_COUNT`（`owner/minPower/operator/value`）を ActiveCondition と Condition の双方に新設し、`checkActiveCondition`（effectEngine）と `evalCondition`（execUtils）の両方で実効パワー基準に評価。
- **未対応（要フォロー）:** 同じ「CONTINUOUS BANISH（mandatory・無条件）」誤解析が他にも約30枚残存（`WX05-021`/`WX09-019`/`WX09-027`/`WX10-063`ほか）。多くは【自】や能力付与の誤潰しと推測。→ TODO.md「F. CONTINUOUS BANISH 誤解析の一掃」。

---

## WX21-035 / WX22-029 — 欠落していた効果の実装（v0.337, 2026-06-19）

- **WX21-035「縛恋の煉獄」（スペル）:** 「以下の４つから２つまで選ぶ」の CHOOSE が JSON から丸ごと欠落し、コスト軽減スタブ（しかも `CONDITIONAL(IS_MY_TURN)` 付きの誤構造）のみ存在していた。`CHOOSE`（`choose_count:2 / upTo:true / from_count:4`）を実装：①対戦相手のエナから「相手センタールリグと共通色を持たない」カード1枚をトラッシュ（`TRASH` + `ENERGY_CARD` + `colorNotMatchesLrig`）、②デッキ上2枚をエナへ（`ENERGY_CHARGE_FROM_DECK`）、③相手パワー7000以下シグニ1体バニッシュ、④相手パワー12000以上シグニ1体バニッシュ。コスト軽減（手札から赤・緑の＜龍獣＞を1枚ずつ捨てて《赤×0》）は `OPTIONAL_COST` マーカーで近似のまま。
- **`colorNotMatchesLrig` の解決バグ:** `execTrash` の `ENERGY_CARD` 分岐は `resolveDynamicFilter` を通しておらず、`colorNotMatchesLrig`（→`colorExclude`）が未解決のまま `matchesFilter` に渡り無視されていた（対象が全エナになる）。対象オーナー（=相手）のルリグを基準に解決するよう `resolveDynamicFilter` を追加。`colorNotMatchesLrig` の実データ初使用カード。
- **WX22-029「参ノ遊　ハンスピ」（シグニ）:** アタック時効果「あなたのエナゾーンからシグニ１枚を手札に加える。そうした場合、手札からカードを１枚エナゾーンに置く。」の後半が `CONDITIONAL(IS_MY_TURN)→STUB OPTIONAL_COST`（実体なし）だった。`SEQUENCE [TRANSFER_TO_HAND(エナのシグニ1枚), ENERGY_CHARGE(手札1枚)]` に修正。前半 `TRANSFER_TO_HAND` に `filter:{cardType:'シグニ'}` を追加。※「そうした場合」のエナにシグニ無し時のガードは未対応（稀ケース・近似）。《ターン1回》は他カード同様 `usageLimit` 未表現（ON_ATTACK_SIGNI 発火経路が未対応のため＝既存の系統的制約）。

---

## WD19-011 — パワー0シグニがバニッシュ前にバトルしてしまう（v0.336, 2026-06-19）

- **症状:** WD19-011 のアタック時 ON_ATTACK_SIGNI 効果で正面シグニのパワーを -4000 し 0 にしたあと、本来ならパワー0以下のルールバニッシュで除去されるべきシグニが、バニッシュされる前にそのシグニとバトルしてしまっていた。
- **原因:** スタックが空になったタイミングで「パワー0以下バニッシュ（`checkAndBanishPowerZero`）」と「バトル解決（`resolvePendingSigniBattleFor`）」の両 useEffect が発火しうる。バトル解決側はパワー0バニッシュ未完了をチェックしていなかったため、バニッシュより先にバトルが成立していた（CPUドライバでも `pending_signi_battle` 判定がパワー0バニッシュ判定より前に置かれていた）。
- **修正:** `BattleScreen.tsx` に `collectPowerZeroBanishCandidates`（`checkAndBanishPowerZero` と同じ判定ロジックを共有）を新設。`resolvePendingSigniBattleFor` の冒頭でパワー0以下バニッシュ候補が残っていればバトル解決を遅延（`pending_signi_battle` は保持され、バニッシュ完了後に再解決される）。CPUドライバの `pending_signi_battle` 分岐にも同候補チェックを追加し、候補があれば先に `checkPowerZeroBanish` を実行するようにした。バトルは「すべてのルール処理完了後」に行われる。

---

## WXK07-043「羅菌 マグネ」— バニッシュ耐性キーの不一致（v0.335, 2026-06-19）

- **症状:** STUB `WXK07_043_CHARM_BANISH` は「バニッシュされない」付与のため `keyword_grants` に `'PROTECTION:BANISH:opponent'` を書いていたが、バトル/ルールバニッシュ（パワー0以下）の耐性判定 `hasBanishResist`（`utils/keywords.ts`）は `'バニッシュされない'` キーを見るため**キーが一致せず、効果バニッシュしか防げていなかった**（部分実装）。
- **修正:** `execStubPart3.ts` の同ハンドラで `'PROTECTION:BANISH:opponent'` に加え `'バニッシュされない'` も付与。テキスト通り全方位（効果・バトル・ルール）のバニッシュ耐性が効くようにした。
- **補足:** 同時に調査した WXDi-P07-073 は `GRANT_LRIG_ABILITY`→`lrig_granted_auto_effects`→相手ターン終了時発火（`BattleScreen.tsx:2936`）が既に実装済みで問題なし。両カードを「dormant」としていた HANDOFF 情報は古かった。

---

## WD19-018 ラブリー・バイオ（スペル）— 効果の誤実装（2026-06-18）

- **症状:** ①②の選択構造がなく、どちらの選択肢にもある「自分の＜微菌＞シグニをバニッシュ」が欠落。②の -7000 が `CONDITIONAL(IS_MY_TURN)` という誤った条件分岐になっていた。
- **正しい効果:** 以下の2つから1つを選ぶ。①自分の＜微菌＞シグニ1体をバニッシュ→相手シグニゾーン1つにウィルスを置く。②自分の＜微菌＞シグニ1体をバニッシュ→相手シグニ1体のパワーを-7000（ターン終了時まで）。
- **修正:** `manualEffects.ts` に `CHOOSE`（1/2）＋各選択肢に `BANISH`→`PLACE_VIRUS` / `BANISH`→`POWER_MODIFY` の `SEQUENCE` を実装。
- **あわせて:** `TargetFilter.cardClass` を新設（CSV の `CardClass` 列に `includes` でマッチ）。`story` はディソナ専用というルールを確立（→ [DESIGN.md](./DESIGN.md) §3）。

---

## コスト設定漏れ（v0.312）— 177件 → 3件

- **症状:** effects JSON の ACTIVATED 効果で `cost={}`（未設定）。ゲームエンジンがコストを要求せず効果を使い放題になるバグ。
- **修正:** `effectParser.ts` の `parseCost` を系統的に修正。残3件（WXK03-001 E2/E3, WXK03-002 E3）は《コイン×0》＝0コインで正常。
- **追加した EffectCost フィールド:** `fieldDown` / `discardUpTo` / `handBottomDeck` / `handExileSelf` / `selfToDeckBottom` / `selfPowerDown` / `fieldToLrigTrash` / `energyTrashColorAll` / `energyTrashSelf` / `acceTrash` / `chargeCounterRemove` / `trapToHand`。
- **追加した parseCost パターン例:** 混色コスト（`《白/赤》×N`）、`アップ状態のシグニN体をダウンする`→`fieldDown`、`手札をすべて捨てる`→`discardAll`、`手札からカード名に《XXX》を含むカードをN枚捨てる`→`discard+discardFilter`、`ルリグデッキからアーツN枚をルリグトラッシュに置く`→`trashArtsFromLrigDeck` ほか多数。

---

## 無発火【出】効果の系統修正（v0.261〜v0.263）

- **症状:** 【出】効果のコストが未表現で効果が無発火だった。
- **修正:**
  - v0.261: 【出】《コイン》コスト未表現で38枚が無発火 → `EffectCost.coin` 追加＋モーダル対応。
  - v0.262: 同型系統調査で230件検出、`discardFilter`/`energyTrash` 追加で244効果に付与。
  - v0.263: 残105件→12件。`EffectCost` 拡張（fieldTrash 等）、`TargetFilter` に `hasIcon`/`hasLifeBurst`、英知14件は `mandatory:true`＋`EICHI_LEVEL_SUM` ゲート化。

---

## アクション不一致 0 件達成（v0.247〜v0.254）

effects JSON ⇔ CardData CSV の全件照合で発見した誤りを系統的に解消（修正前 643 issues → 0 件、全12シート全カテゴリ）。

- **v0.247:** `effectParser` の接頭辞バグ（【ライド】【ライズ】等で `parseBlock` がブロック全体を破棄）→ `stripKeywordPrefixes` 追加。効果未定義 33 枚を追加。`verifyEffects` の Sheet8 BOM スキップバグ修正（866枚が無検証だった）。
- **v0.248:** 【レイヤー】を `GRANT_FIELD_SIGNI_ABILITY`（CONTINUOUS 宣言型）で実装。
- **v0.249:** タイミング不一致 113 件を全シート 0 に。`POWER_MODIFY` に `excludeSelf`（「あなたの他のシグニ」対応）。
- **v0.250:** `effectExecutor.ts` の文字化け破損（PowerShell CP932 誤読由来）を掃討。→ [DESIGN.md](./DESIGN.md) §6 のエンコーディング注意。
- **v0.251〜v0.253:** ①②③④選択肢解析を `choiceTextParser.ts` に共通化。Sheet 別に残件を 0 化。
- **v0.254:** 残り全シートを JSON 修正約100カードで解消し 0 件達成。

---

## keyword_grants 英語コード不一致（2026-06-17）

- **症状:** 付与したキーワード能力が常時非発火。`keyword_grants` は日本語の正式名（'シャドウ'/'ランサー' 等）で照合するのに、3箇所が英語短縮コード（'shadow'/'lancer' 等）を書き込んでいた。
- **該当箇所:** `execStubPart2.ts` の `GRANT_ABILITY_UNTIL_OPP_TURN` / `SIGNI_GRANT_QUOTED_CONSTANT_ABILITY`、`choiceTextParser.ts` の GRANT_KEYWORD 分岐。
- **修正:** 全て日本語の正式名に統一。

---

## 「対戦相手のアタックフェイズ開始時」の系統修正（2026-06-18）

- **症状:** パーサーが「あなた/対戦相手/各アタックフェイズ開始時」を無差別に timing `['ATTACK']` へ潰し owner 情報を喪失。さらに `'ATTACK'` は AUTO トリガーとしてディスパッチされず、該当 AUTO 効果は全く発火していなかった。
- **修正:** owner を区別して `ON_ATTACK_PHASE_START` に正しくマッピング・配線。あわせてバリア付与の no-op 化、シャドウ色スコープ符号化、多択ベットの誤分類、複合キーワード付与の SEQUENCE 化など複数の系統バグを修正。

---

## 【起】コストの支払い可否判定（2026-06-18）

- **症状:** 《ダウン》起動効果が、対象シグニが既にダウン済みでも再発動できた（WX01-072 等）。
- **修正:** `BattleScreen.tsx` の activatable フィルタに `down_self`（既ダウン）/`discard`（手札不足）を追加。`executeSigniActivated` 冒頭にも多重発動防止ガード。
