# 引き継ぎ: バグ修正ラウンド続き（2026-06-11 → zrom側Claudeへ）

> **✅ 2026-06-11 完了報告（zrom側）**: 残作業1「タイミング不一致113件」を全件解消した（全シート0件）。
> 内訳: 実欠落の効果追加 約30件（うち新設STUB 18種 → STUBS.md「2026-06-11 タイミング不一致修正ラウンド」参照）、
> パース誤り修正（効果タイプ誤り・誤マージ分離）約15件、verifyEffects.ts誤検出修正 約60件
> （能力参照テキスト【X】能力/【X】と【Y】の能力、ネスト引用「「」」、『』引用、注釈（）内マーカー）。
> エンジン修正: POWER_MODIFYにexcludeSelf追加（「他のシグニ」対応）、REVEAL_PICK_PLAYのpickCount正規表現修正。
> ARTS_IMMOVABLE（TK5枚）をACTIVATED内からCONTINUOUSへ移動（エンジンはCONTINUOUSのみ参照するため実バグ修正）。
> 残作業は2の「アクション[STUB代替?] 211件 / アクション[要確認] 163件」のみ。コスト/定義なし/LIFE_BURST/checkAllEffectsはすべて0維持。

ymsty側のClaude (Fable 5) セッションからの引き継ぎ。コミット `fix: コスト/リミットアッパー/開始時コイン/ライド・デコレのバグ修正とチェッカー誤検出解消` の続きを行う。

## 前提知識（このリポジトリの検証ワークフロー）

- カード効果の正データは `public/data/effects_{WX,WXDi,WX24_26,WXK,misc}.json`（各1行ミニファイ形式）。
  **`npm run build:effects` はこれらを再生成しない**（旧式の結合effects.json出力）ので、JSONは直接編集してよい。
  編集時は `JSON.parse` → 変更 → `fs.writeFileSync(p, JSON.stringify(j))` でミニファイ形式を維持すること。
- 検証ツールは2つ:
  1. `node scripts/checkAllEffects.mjs` — 「してもよい」と mandatory フラグの照合。**現在0件**。退行させないこと。
  2. `npx tsx scripts/verifyEffects.ts --sheet SheetN` — CSV効果テキストとJSONの照合（N=1〜10、TK、Variants）。
- 修正後は **全シート再実行して件数を前回と比較**し、退行がないことを確認する（このセッションでは `diff` でサマリー比較した）。
- CSVの行順は絶対に変えない（CLAUDE.md参照）。

## 今回完了した内容（参考）

- 実バグ4件: WX17-044コスト(青2→青1+無1)、【リミットアッパー】(+1/ターン消失→+2/恒久/条件付き、`limit_upper_token`新設)、ゲーム開始時コイン未付与(ナナシ其ノ零ノ禍等、初期化4経路)、【ライド】/【デコレ】未使用可能(レイラ系9体+エルドラ系9体にACTIVATED効果を追加)
- verifyEffects.tsの誤検出修正: コスト照合(引用文・文中【起】の誤拾い)、定義なし(デュアルエナ注釈のみ/注釈のみ/トークンを除外)
- 結果: **コスト0件・定義なし0件**（全シート）

## 残作業（優先度順）

### ~~1. タイミング不一致 113件~~ → ✅ 完了（v0.249、冒頭の完了報告参照）

### 1. アクション[STUB代替?] 211件 / アクション[要確認] 163件
「テキストから期待されるアクション型がJSONにない」。1件ずつ分類して対処する:

**[STUB代替?]（カードがSTUBアクションを含む）の判定手順:**
1. そのカードのSTUB idをSTUBS.mdの一覧で確認する
2. STUBが期待アクションを実装済み（✅）なら誤検出 → `verifyEffects.ts`の`collectActionsFromJson`で
   そのSTUB idを期待アクションの同等物として数えるか、`ACTION_KEYWORDS`のエイリアスに追加して解消
3. STUBがログのみ（📝）なら実体未実装 → 本実装するか、現状維持（STUB_LOG削減作業の対象として残す）

**[要確認]（STUBなし）の判定手順:**
1. CSVテキストとJSONを突き合わせ、表現違いか実欠落かを判定
2. 表現違い（例: バニッシュ→`BANISH_REDIRECT`、ミル→`REVEAL_AND_PICK`）→ `ACTION_KEYWORDS`のエイリアス追加
3. 実欠落（JSONのアクションが本当に間違っている/足りない）→ JSONを修正。
   前回ラウンドでは誤マージ（複数効果が1エフェクトに混入）や効果タイプ誤り（【出】がCONTINUOUS登録等）が多数見つかったので、
   アクション不一致もパース誤りの兆候として周辺エフェクト全体を確認するとよい

### 2. シート別残件数（2026-06-11 v0.249時点、verifyEffects.ts）

タイミング/コスト/定義なし/LIFE_BURSTは全シート0。

| シート | STUB代替? | 要確認 |
|---|---:|---:|
| Sheet1 | 11 | 8 |
| Sheet2 | 41 | 36 |
| Sheet3 | 36 | 21 |
| Sheet4 | 28 | 10 |
| Sheet5 | 14 | 8 |
| Sheet6 | 9 | 3 |
| Sheet7 | 15 | 27 |
| Sheet8 | 24 | 16 |
| Sheet9 | 28 | 31 |
| Sheet10 | 2 | 3 |
| TK | 3 | 0 |
| Variants | 0 | 0 |
| **計** | **211** | **163** |

※前回表からの増減は再分類によるもの（STUBを追加したカードが要確認→STUB代替?に移動等）。総計385→374。

## 作業ノウハウ（v0.249ラウンドで得たもの）

### カード調査用ダンプスクリプト
カードごとのCSVテキストとJSON定義の突き合わせには使い捨てスクリプトを作ると速い（前回は`tmp_verify/dumpCards.mjs`として作成、削除済み）。要点:
- 5つのeffects JSONを全部ロードして`Object.assign`でマージ → cardNumで引く
- CSVは`"`囲み対応の簡易スプリットでパース（`CardNum`/`CardName`/`EffectText`列）
- 引数`Sheet1:WX05-001`形式でシートとカードを指定できるようにする

### effects JSONの表現語彙（実装済みでそのまま使えるもの）
- **フィルター**: `cardType`/`story`/`color`(配列可)/`level:{max:N}`/`powerRange:{min,max}`/`cardName`(部分一致)/`hasGuard`/`isUp`/`isFrozen`/`hasAcce`
- **POWER_MODIFYの`excludeSelf:true`**: 「あなたの他のシグニ」（v0.249でエンジン対応済み）
- **効果レベルの`condition`**: `{type:'HAS_CARD_IN_FIELD',owner,filter}`、`{type:'DURING_PHASE',phases}`等
- **`activeCondition`（CONTINUOUS用）**: `IS_DRIVE_STATE`、`TURN_OWNER`等
- **`usageLimit:'once_per_game'`**（《ゲーム１回》）
- **SEQUENCEステップ**: `RECOLLECT_GATE`(`{minArts:N}`でリコレクト条件)、`STUB DECLARE_NUMBER`+`MILL{useDeclaredCount:true}`(数字宣言ミル)
- **便利STUB（実装済み✅）**: `REVEAL_PICK_HAND_SHUFFLE_BOTTOM`+`revealPickParams:{pickCount,restDest,then}`（デッキ上N枚見て選ぶ）、`REVEAL_PICK_PLAY`（公開して場に出す）、`DECLARE_CLASS`、`OPTIONAL_TRASH_ENERGY_CLASS`、`LRIG_GROW_RESTRICT`

### 慣例・落とし穴
- **コスト付き【出】効果は`mandatory:false`**（支払いは任意。既存360件false vs 3件true）。コストなし【出】で「してもよい」がなければtrue
- 「このキーを場からルリグトラッシュに置く」等の特殊コストは現状コスト未表現（cost欄なし）が慣例
- エンジンが**CONTINUOUSとしてのみ参照するSTUB**がある（例: `ARTS_IMMOVABLE`はexecStubPart1の判定がCONTINUOUS前提。ACTIVATED内に置くと機能しない）。STUBを置く際はエンジン側のgrepで参照のされ方を確認
- 新設timing文字列（`ON_ACCE_ATTACH`等6種、STUBS.md参照）はエンジン未配線＝発火しない。トリガー実装時に配線が必要
- `checkAllEffects.mjs`は修正のたびに必ず再実行（現在0件、退行させない）

## 運用ルール（リポジトリ外の取り決め）

- **このリポジトリには「auto: Claude による変更」を自動コミットするフックがある**。ファイル編集が随時コミットされるのは正常動作（異常ではない）
- リリース手順: `package.json`のversionをインクリメント → CIチェック（`npx tsc --noEmit`と`npm run lint`が**エラー0**であること。warningは既存26件あり許容）→ まとめコミット&`git push` → `vercel deploy --prod`
- アプリコードに影響しないドキュメントのみの変更はversion bump/デプロイ不要

## 注意点・既知の近似実装

- 新設した【ライド】効果（`<ID>-RIDE`、STUB `CENTER_LRIG_RIDES_ON_SIGNI`）は「ドライブ状態でない場合のみ使用可」を強制していない（乗り換えになるだけで実害は小さい）。厳密化する場合はスタブ側に `lrig_riding_signi` チェックを追加。
- 【リミットアッパー】のレベル3以上条件は印刷レベル（`currentLrigLevel`）参照。レベル上書き効果との相互作用は未考慮。
- 【ルリグバリア】/【シグニバリア】トークンのダメージ身代わり機構は**未実装**（verifyEffectsはトークンを検証対象外にしたため検出されない。STUBS.md・エンジン側の課題として残る）。
- 完了したら STUBS.md / このファイルの更新も忘れずに。
