# 引き継ぎ: トークン調査＋バリア実装ラウンド（2026-06-17 ymsty側 → zerom側へ）

`public/data/CardData_TK.csv` のトークンと呼び出し元の調査から始まり、ルリグバリア／シグニバリアの
実装・フリーゾーン設置化・付与配線、関連カードのパース再構築までを実施。詳細な対応表と実装状況は
`docs/TokenCallers.md` に集約済み（本HANDOFFはサマリと残作業）。

## ✅ 実施済み

### 1. トークン↔呼び出し元の全件調査（`docs/TokenCallers.md`）
- TK.csv 全トークンと生成元カードの対応表＋実装状況を記録。レゾナ/クラフトアーツ/アクセ/下に置く 等は実装済みと確認。

### 2. シグニバリア実装＋両バリアの付与配線
- 判明: **ルリグバリアも「付与」経路が未配線**だった（state/消費のみ実装、`GAIN_LRIG_BARRIER` stub は
  どのカードからも未参照）。シグニバリアは完全未実装だった。→ 両方まとめて配線。
- パーサが付与を `GRANT_KEYWORD(keyword:"○バリア")` プレースホルダにしていた10件を `GAIN_*_BARRIER` stub に
  置換、付与欠落の4枚に GAIN step 追加（`scripts/fixBarrierGrants.mjs`）。

### 3. バリアを「フリーゾーンのトークンカード」として設置（zerom要望反映）
- 数値カウンタ(`lrig_barrier`/`signi_barrier`)を**廃止**し、`field.free_zone` にトークンカードとして設置。
  - ルリグバリア=`WX24-P1-TK2A` / シグニバリア=`WX26-CP1-TK01`
  - ヘルパー: `execUtils.ts` の `LRIG_BARRIER_CARD`/`SIGNI_BARRIER_CARD`/`countBarrierTokens`/
    `addBarrierTokens`/`removeOneBarrierToken`
  - 付与: `GAIN_*_BARRIER` stub（`execStubPart3.ts`、`count` 任意対応）がフリーゾーンに push
  - 消費: シグニ=`crashOneLife`（`BattleScreen.tsx`）でシグニバリアを1枚除外。ルリグ=ルリグアタック解決時に1枚除外
  - WX25-P2-001 のガードシグニ捨て特殊経路もフリーゾーン設置に変更

### 4. パース構造が壊れていた関連カード5枚の再構築
- **WX24-P1-001 セイクリッド・フォース**: 単一REVEAL_PICK→`CHOOSE(2/3)`（①ルリグバリア/②BOUNCE/③REVEAL_PICK）
- **WX26-CP1-001 FUTURE SESSION**: `CHOOSE(1/3)`（①シグニバリア/②REVEAL_PICK近似/③UNKNOWN未実装）
- **WX25-P3-050 エビディバ!!!!!**: stub `EVDIVA_PER_LRIG_COLOR`（色別ルリグ数ぶん。白=ルリグバリア/青=ドロー3/緑=エナチャージ3/黒=相手ミル10）
- **WXDi-P15-003 ひらけ！ゲート！**: `GRANT_LRIG_ABILITY.abilities` 実体化（【起】エクシード4：シグニバリア / ドロー4）
- **PR-Di035 OPEN DREAM LAND!**: stub `PRDI035_PARADISE_COLOR`（プリパラ共通色＋レベル3種類で色別効果）
- スクリプト: `scripts/fixSacredForceChoice.mjs` / `fixFutureSessionChoice.mjs` / `fixEvdivaPerLrig.mjs` /
  `fixOpenGateGrant.mjs` / `fixOpenDreamLand.mjs`

### 5. リミットアッパーの表示
- `limit_upper_token`(boolean)を正データとして維持しつつ、盤面の**アシスト左の枠**にトークンカード
  （WX24-D1-TK1）を表示（`BoardComponents.tsx` `assistLSlot`）。`battleCardNums` に常時ロード追加。

### 検証
- `scripts/_verifyBarrier.ts`（`npx tsx`）でエンジン検証 12項目全パス。`npm run typecheck` / `npm run build` 通過。

## ⏳ 残作業（zerom側）

### A. バリア/再構築カードの近似・未実装（`docs/TokenCallers.md` 詳細）
- **CHOOSE の「N つまで(up to)」未対応**: 固定 `choose_count` のみ。セイクリッド・フォース「2つまで」、
  FUTURE SESSION のリコレクト4枚以上で「2つまで」上昇 が未対応。→ CHOOSE スキーマに up-to / 動的 choose_count 追加が必要。
- **エビディバ 赤**: 「対戦相手のシグニ2体まで対象、パワー合計12000以下ならバニッシュ」=対象選択を伴うため未実装ログのみ。
- **PR-Di035 遅延タイミング**: 本来「次のあなたのアタックフェイズ開始時」だが遅延トリガー機構がなく**即時で近似**。
  青の相手手札捨ては先頭3枚で近似（本来は相手が選ぶ）。
- **FUTURE SESSION ③**: 「次のアタックフェイズにプリオケへアタック時トラッシュ能力を付与」=遅延能力付与で未実装（UNKNOWN）。

### B. TokenCallers の積み残し（バリア以外）
- **みこみこ親衛隊(WX25-P3-TK03)**: `GRANT_KEYWORD` プレースホルダのみ。ターン終了時の手札捨て→除去の本来挙動が未実装。
- **シグニトークンの `ADD_TO_FIELD` 名指し解決**: 雷ちゃん/ペロロ人形/ママ勇者/雨雲号/クルセイダーちゃんが
  本体テキストの名指し（《雷ちゃん》等）から正しいトークンを場に出せているか**未検証**（effects JSON で cardName/source 省略のケースあり）。
- **ダーク系(WX25-P1-TK1〜6)**: 名指し呼び出し元がなく、うらら系の汎用「ダークアーツ」生成機構経由。生成側の配線状況が未確認。
- **WXK03-TK-01B 落華流粋**: 生成配線が要確認（効果本体は実装）。
- **サーバント ZERO(WXDi-P07-TK01-A)**: カーニバル系が全角「ＺＥＲＯ」表記で名前一致せず、生成元の特定が要確認。

### C. 共通基盤（複数カードに効く）
- 上記 A の「遅延トリガー機構」「CHOOSE の up-to / 動的 choose_count」「対象選択を伴う条件付きバニッシュ」は
  個別カードを超える横断的なエンジン拡張。実装すれば PR-Di035・FUTURE SESSION・エビディバ赤 等が一気に正確化できる。

## デプロイ
`vercel deploy --prod` は zerom 側で実施すること（ymsty側に権限なし）。
