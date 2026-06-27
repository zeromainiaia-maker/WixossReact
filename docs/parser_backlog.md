# effectParser 改善バックログ（収穫マージ・要レビュー420件の分類）

> 出典：`npx tsx scripts/analyzeHeldCards.ts`（existing=git HEAD の effects_*.json vs fresh=現パーサー出力 のリーフ差分を分類）。
> 収穫マージ（`build:effects` の richness ガード）で「温存：要レビュー」になった **420カード**＝
> **現パーサーが既存JSONを再現できない札**。ここを直すほど、再生成で純改善として安全に取り込める。

## 読み方（重要）
- **「喪失」系＝信頼できるパーサー弱点**：正しい既存JSONが持つ構造をパーサーが出せていない。直す対象。
- **「値変更」系（値変更のみ148件）＝断定不可・人手レビュー必須**：既存とパーサーで同じキーだが値が違う。
  どちらが正しいか自動判定できない（既存の手修正が正のことも、効果分割ズレで見かけ上ズレることもある）。
  例：WX07-002 は既存の timing 自体が原文と怪しい。だから値変更系は一括採用も一括修正もしない。

## 信頼できる弱点＝優先パーサー修正（喪失系・カード数）
| 優先 | パターン | 数 | 内容 | 代表カード |
|---|---|---|---|---|
| 1 | filter 脱落（cardType/story/color 含む総体） | ~116 | 対象に種族・色・クラス等のフィルタを付け損ねる | PR-195, SP27-009, WX03-037 |
| 1a | └ filter.cardType | 103 | 対象の cardType 脱落 | WDK01-020, WDK04-012 |
| 1b | └ filter.story（種族） | 16 | 「＜迷宮＞の」等が消える | WX03-037/039/041/044 |
| 1c | └ filter.color（色） | 15 | 「赤の」等が消える | WX04-021, WDK01-010 |
| 2 | triggerCondition/Scope/Filter | 51 | トリガーの詳細条件・範囲・フィルタ脱落 | WX02-073, WX10-074/078/080 |
| 3 | upToCount（〜まで） | 27 | 「N体まで」の upTo が消える | WDK01-020, WX04-010 |
| 4 | duration（期間） | 23 | 「ターン終了時まで」等の期間が消える | WX15-058, WX03-046 |
| 5 | activeCondition（〜があるかぎり） | 18 | CONTINUOUS の発動条件まるごと脱落 | WX03-038/040, WX04-059, WX08-049/051 |
| 6 | count（数） | 26 | 対象数の取り違え | WDK08-L14/L20 |
| 7 | filter.frontOfSelf（正面） | 少 | 「このシグニの正面の」脱落 | WX05-019-E1, WX10-080/083 |

## 断定不可（要レビュー・値変更系）
| パターン | 数 | 備考 |
|---|---|---|
| 値変更: timing（トリガー種別） | 138 | 効果分割ズレで水増しの可能性大。1件ずつ原文照合 |
| 値変更: type（アクション種別） | 125 | 同上 |
| 値変更: then/steps | 39 | 後続処理の差 |
| 値変更のみのカード | 148 | 喪失なし。最優先ではない |

## 着手済み（このセッション）
- ✅ **POWER_MODIFY「他の＜種族＞/色」持続バフ**：`parseSentencePart1.ts` のゲート正規表現が「他の＋＜＞」併用語順を拾えず汎用target+filter破棄していたのを修正＋excludeSelf付与。filter.story 16→11。
- ✅ **activeCondition「あなたの場に[色/クラス]のシグニがあるかぎり」**：`effectParser.ts parseActiveCondition` のキャッチオール（condition=undefined）の前に色/クラス存在条件パターン3zを追加。activeCondition 18→15。
- ✅ **【自】ON_BANISH「(対戦相手|あなた)のターンの間、…バニッシュされたとき」**：AUTO経路に前置き検出＋TURN_OWNER化（G150の【常】版を【自】へ展開）。engine配線済み（collectBanishTriggers）。純改善12枚採用・held 409→408。
- ✅ **自身の基本レベル SET_BASE_LEVEL 化**：「このシグニの基本レベルはNになる」を `parseSentencePart1.ts` で SET_BASE_LEVEL(until:END_OF_TURN) 出力（旧 BLOCK_ACTION/SET_LEVEL_N は execBlockAction が no-op＝engine 非実行 divergence）。self（sourceCardNum）限定で安全。対象指定の他シグニ版は engine 未対応で BLOCK_ACTION 据置。
- ✅ **レゾナ表現を cardType:'レゾナ' に一本化＋decompile退化是正**：decompiler が `filter.cardType:'レゾナ'` をレゾナと認識せず「シグニ」と退化（6枚＝★非検出の隠れバグ）→ decompileEffects.ts 2箇所で `cardType==='レゾナ'` 認識。「あなたのレゾナのパワーを±N」の target 脱落も是正（POWER_MODIFY 分岐がシグニ限定だった→レゾナ分岐追加）。死にキー `isResona` を JSON から完全撤去（残0・engine 0参照）。
- いずれも収穫マージで回帰0・同型★0維持。

## ⚠ 調査して「クリーンでない」と判断した案件（着手しない）
### duration「次の対戦相手のターン終了時まで」→ UNTIL_OPP_TURN_END（145枚の慣例問題・据置）
- 根本：`effectParser.ts` の effect-level duration 解決（`actionText.includes('ターン終了時まで') ? 'UNTIL_END_OF_TURN'`）が、**部分文字列**として「次の対戦相手のターン終了時まで」を拾い UNTIL_END_OF_TURN に誤判定。より特定の句を先に判定すれば UNTIL_OPP_TURN_END に直せる。
- **しかしブラストが大**：この句を持つ186枚中、fresh が effect.duration=UNTIL_END_OF_TURN を出すのが153枚。そのうち**既存JSONも UNTIL_END_OF_TURN が145枚**（パーサーと一致＝事実上の慣例）、UNTIL_OPP_TURN_END に手修正済みは3枚（WXDi-P12-057/WXDi-P15-093/WX24-P1-076）のみ。
- パーサーを直すと**145枚が新規 held 化**＝大規模 bulk 値変更。「正しい値」も effect.duration vs action.duration の役割（action 側で正しく持てば effect 側は無害の可能性）を含め未確定。**§2「bulk 値変更禁止」案件**。やるなら145枚のJSON一括移行＋engine の duration 役割確認をセットで、人間判断のうえで。単発パーサー修正としては着手しない。

## ⚠ 着手して破棄した教訓（filter.color/story in trash→hand source）
- `parseSentencePart1.ts` の `if(t.includes('トラッシュから')&&t.includes('手札に加える'))` ハンドラに
  `parseColorFilter(t)/parseStoryFilter(t)` を足したら**205カードが変化**し、WX05-027（「場に出す」）や
  WX05-023（「下から手札」）など**トラッシュ→手札でない/別文の色・種族を誤付与**した。
- 原因：`parseXxxFilter(t)` が**文全体をスキャン**するため、対象の名詞句以外の色・種族を拾う。
  そして**収穫マージの richness ガードは「喪失」しか弾かず、誤った“追加”は通してしまう**。
- 教訓：filter 抽出は **`トラッシュから〔...〕のシグニ` の名詞句に限定**して行う（文全体スキャン禁止）。
  広い `includes()` ゲート＋全文スキャンは不可。narrow な正規表現キャプチャで該当句だけを解析すること。
  → このパターンは**スコープ限定の実装が要る別タスク**として保留。

## 残りの進め方
1. 上表「信頼できる弱点」の**優先1（filter脱落）**から着手＝最大の具体的勝ち。
2. 1パターン直す → `npm run build:effects`（収穫マージ）→ 該当カードが純改善で自動採用されるか確認。
3. `docs/effects_merge_report.md` の「採用：純改善」に移れば成功。「要レビュー」に残れば直し足りない。
4. 値変更系（148）は別トラック＝逆翻訳レビューで1件ずつ（パーサー修正の対象にしない）。
